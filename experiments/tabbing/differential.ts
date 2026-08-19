import type { Page, Frame, CDPSession } from '@playwright/test';
import { resolveProbeNodes, centerOf } from './candidates';
import type { TabOrder } from './taborder';

export type Channel = 'dom' | 'geometry' | 'mutations' | 'net' | 'storage' | 'console' | 'canvas' | 'nav';
export const ALL_CHANNELS: Channel[] = ['dom', 'geometry', 'mutations', 'net', 'storage', 'console', 'canvas', 'nav'];

export interface ModalityResult {
  /** channels that changed */
  channels: Channel[];
  /** V8 functions executed during the action, as url:name:offset */
  coverage: string[];
  /** false when the element could not be driven at all (no box, off-screen) */
  attempted: boolean;
  note?: string;
}

export interface ProbeDifferential {
  probe: string;
  mouse: ModalityResult;
  keyboard: ModalityResult;
  inTabOrder: boolean;
  /** ms spent on this probe */
  ms: number;
}

const SETTLE_MS = 200;

async function startCoverage(cdp: CDPSession) {
  await cdp.send('Profiler.enable').catch(() => {});
  await cdp.send('Profiler.startPreciseCoverage', { callCount: true, detailed: true }).catch(() => {});
}

/**
 * takePreciseCoverage resets the counters, so calling it immediately before an
 * action and again after yields exactly the functions that ran during it.
 * Filtered to fixture scripts — our own evaluate/init code has no matching url.
 */
async function takeCoverage(cdp: CDPSession, baseUrl: string): Promise<string[]> {
  const { result } = await cdp.send('Profiler.takePreciseCoverage').catch(() => ({ result: [] })) as any;
  const out = new Set<string>();
  for (const script of result ?? []) {
    if (!script.url || !script.url.startsWith(baseUrl)) continue;
    for (const fn of script.functions ?? []) {
      const ran = (fn.ranges ?? []).some((r: any) => r.count > 0);
      if (ran) out.add(`${script.url}:${fn.functionName || '(anon)'}:${fn.ranges?.[0]?.startOffset ?? 0}`);
    }
  }
  return [...out];
}

type FrameSnapshot = Record<string, any>;

/**
 * State is observed in EVERY frame, not just the top document. A clickable div
 * inside an iframe mutates that frame's DOM, which the top-level observer
 * cannot see at all — the first run of this experiment scored p92 as a false
 * negative purely for that reason.
 */
async function snapshot(page: Page): Promise<FrameSnapshot> {
  const out: FrameSnapshot = {};
  for (const f of [page.mainFrame(), ...page.frames().filter(f => f !== page.mainFrame())]) {
    const s = await (f as Frame).evaluate(() => (window as any).__a11y?.snapshot()).catch(() => null);
    if (s) out[f.url()] = s;
  }
  return out;
}

/** Union of the per-frame channel deltas. */
function channelDelta(before: FrameSnapshot, after: FrameSnapshot): Channel[] {
  const changed = new Set<Channel>();
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const b = before[key], a = after[key];
    if (!b || !a) { changed.add('nav'); continue; }   // a frame appeared or went away
    if (b.dom !== a.dom) changed.add('dom');
    if (b.geometry !== a.geometry) changed.add('geometry');
    if (a.mutations > b.mutations) changed.add('mutations');
    if (a.net > b.net) changed.add('net');
    if (a.storage > b.storage) changed.add('storage');
    if (a.console > b.console) changed.add('console');
    if (a.canvas > b.canvas) changed.add('canvas');
    if (a.nav > b.nav || b.href !== a.href) changed.add('nav');
  }
  return ALL_CHANNELS.filter(c => changed.has(c));
}

/** Park the pointer somewhere inert so a stale :hover never leaks into a probe. */
async function parkMouse(page: Page) {
  const vp = page.viewportSize() ?? { width: 1280, height: 900 };
  await page.mouse.move(vp.width - 2, vp.height - 2);
}

export interface DifferentialOptions {
  baseUrl: string;
  url: string;
  /**
   * Include hover in the mouse action set (KAFE does; §3.9).
   *
   * Note that a trusted click ALWAYS hovers — CDP dispatches a mousemove to the
   * target coordinates before mousePressed, so there is no such thing as
   * clicking without hovering. The honest contrast is therefore in the
   * observation window: with hover, state is read while the pointer rests on
   * the element; without, the pointer is parked first, so anything that exists
   * only for the duration of :hover is not counted.
   */
  includeHover: boolean;
  /** use untrusted el.click() instead of CDP trusted input (§1.3) */
  untrustedClick?: boolean;
  /**
   * Functions that run on ANY click on this page — React's synthetic-event
   * dispatch, listeners bound to document, analytics. Subtracted from every
   * probe's coverage so the set describes the handler, not the framework.
   */
  coverageBaseline?: Set<string>;
}

/**
 * Clicks a neutral, handler-free target to establish the per-page coverage
 * floor. Without this, every click in a React page shares ~150 executed
 * functions and no two coverage sets are distinguishable.
 */
export async function measureCoverageBaseline(
  page: Page, cdp: CDPSession, baseUrl: string, url: string,
): Promise<Set<string>> {
  await page.goto(url, { waitUntil: 'load' });
  const box = await page.locator('#baseline-target').first().boundingBox().catch(() => null);
  await startCoverage(cdp);
  await takeCoverage(cdp, baseUrl);
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(SETTLE_MS);
  }
  return new Set(await takeCoverage(cdp, baseUrl));
}

/**
 * One probe, both modalities, with a full page reload between them so each
 * action runs against an identical starting state (tabbing.md §2).
 */
export async function runDifferential(
  page: Page,
  cdp: CDPSession,
  probe: string,
  tabOrder: TabOrder,
  opts: DifferentialOptions,
): Promise<ProbeDifferential> {
  const t0 = Date.now();
  const inTabOrder = tabOrder.index.has(probe);

  // ---- mouse ---------------------------------------------------------------
  const mouse: ModalityResult = { channels: [], coverage: [], attempted: false };
  await page.goto(opts.url, { waitUntil: 'load' });
  await parkMouse(page);
  await page.waitForTimeout(80);

  const nodes = await resolveProbeNodes(cdp, [probe], page);
  const node = nodes.get(probe);
  const centre = node ? centerOf(node) : null;
  const vp = page.viewportSize() ?? { width: 1280, height: 900 };

  if (!node) {
    mouse.note = 'probe not present in the pierced DOM tree';
  } else if (!centre) {
    mouse.note = 'no rendered box (display:none / zero-size)';
  } else if (centre.x < 0 || centre.y < 0 || centre.x > vp.width || centre.y > vp.height) {
    mouse.note = 'outside the viewport';
  } else {
    mouse.attempted = true;
    await startCoverage(cdp);                        // arms (and zeroes) the counters
    await takeCoverage(cdp, opts.baseUrl);           // discard everything up to now
    const before = await snapshot(page);

    if (opts.untrustedClick) {
      await page.evaluate((p) => {
        const el = (window as any).__a11y.findProbe(p, true);
        el?.click?.();
      }, probe);
    } else {
      if (opts.includeHover) {
        await page.mouse.move(centre.x, centre.y);
        await page.waitForTimeout(SETTLE_MS);
      }
      await page.mouse.click(centre.x, centre.y, { delay: 20 });
    }
    await page.waitForTimeout(SETTLE_MS);

    // Without hover in the action set, read the state with the pointer parked,
    // so a :hover-only reveal has already collapsed by the time we look.
    if (!opts.includeHover && !opts.untrustedClick) {
      await parkMouse(page);
      await page.waitForTimeout(SETTLE_MS);
    }

    const after = await snapshot(page);
    mouse.channels = channelDelta(before, after);
    mouse.coverage = minusBaseline(await takeCoverage(cdp, opts.baseUrl), opts.coverageBaseline);
  }

  // ---- keyboard ------------------------------------------------------------
  const keyboard: ModalityResult = { channels: [], coverage: [], attempted: false };
  await page.goto(opts.url, { waitUntil: 'load' });
  await parkMouse(page);
  await page.waitForTimeout(80);
  await startCoverage(cdp);
  await takeCoverage(cdp, opts.baseUrl);
  const kbBefore = await snapshot(page);

  if (inTabOrder) {
    keyboard.attempted = true;
    await page.evaluate(() => { (document.activeElement as HTMLElement | null)?.blur?.(); });
    // Tab exactly as far as Set T says this probe sits, so nothing else's
    // focus effects get attributed to it.
    for (let i = 0; i < tabOrder.index.get(probe)!; i++) await page.keyboard.press('Tab');
    await page.waitForTimeout(SETTLE_MS);           // let :focus / :focus-within settle
    for (const key of ['Enter', 'Space', 'ArrowDown']) {
      await page.keyboard.press(key);
      await page.waitForTimeout(120);
    }
  } else {
    keyboard.note = 'not reachable by Tab — no keyboard action is possible';
  }
  await page.waitForTimeout(SETTLE_MS);

  const kbAfter = await snapshot(page);
  keyboard.channels = channelDelta(kbBefore, kbAfter);
  keyboard.coverage = minusBaseline(await takeCoverage(cdp, opts.baseUrl), opts.coverageBaseline);

  return { probe, mouse, keyboard, inTabOrder, ms: Date.now() - t0 };
}

/**
 * The §2 oracle, evaluated over a chosen subset of state channels. A probe is
 * a violation when the mouse produced an observable effect and the keyboard
 * produced none of the same kind.
 */
export function verdict(d: ProbeDifferential, channels: Channel[]): boolean {
  const m = d.mouse.channels.filter(c => channels.includes(c));
  const k = d.keyboard.channels.filter(c => channels.includes(c));
  return m.length > 0 && k.length === 0;
}

function minusBaseline(cov: string[], baseline?: Set<string>): string[] {
  return baseline ? cov.filter(c => !baseline.has(c)) : cov;
}

/**
 * The §3.7 oracle, strict form: the mouse ran app code and the keyboard ran
 * none at all.
 */
export function coverageVerdict(d: ProbeDifferential): boolean {
  return d.mouse.coverage.length > 0 && d.keyboard.coverage.length === 0;
}

/**
 * The §3.7 oracle as set comparison, which is what the doc actually proposes:
 * the mouse executed functions the keyboard never reached. Catches the
 * focusable-but-not-actionable case, where the keyboard does run *something*
 * (focus handling) but not the handler.
 */
export function coverageDiffVerdict(d: ProbeDifferential): boolean {
  if (d.mouse.coverage.length === 0) return false;
  const kb = new Set(d.keyboard.coverage);
  return d.mouse.coverage.some(c => !kb.has(c));
}

export function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  const A = new Set(a), B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}
