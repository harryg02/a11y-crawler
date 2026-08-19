/**
 * Full experiment for tabbing.md — see experiments/tabbing/README.md.
 *
 * Runs every detector over the whole fixture corpus, scores each against
 * ground truth, and writes experiments/tabbing/results/.
 */
import { test, expect } from '@playwright/test';
import type { Server } from 'node:http';
import AxeBuilder from '@axe-core/playwright';
import { startFixtureServer } from '../experiments/tabbing/server';
import { ensureReactBundle } from '../experiments/tabbing/build';
import { INIT_SCRIPT } from '../experiments/tabbing/instrument';
import { computeTabOrder, focusableSet, type TabOrder } from '../experiments/tabbing/taborder';
import {
  resolveProbeNodes, pageDetector, d0CurrentCrawler, d0SelectorCollisions, d5CdpListeners, d6ListenerShim, d8HoverDiff,
  visibleProbes,
} from '../experiments/tabbing/candidates';
import {
  runDifferential, measureCoverageBaseline, verdict, coverageVerdict, coverageDiffVerdict, jaccard,
  type ProbeDifferential, type Channel,
} from '../experiments/tabbing/differential';
import { loadTruth, score, scoreTable, writeResults, type Score } from '../experiments/tabbing/score';

const CHANNEL_SETS: Record<string, Channel[]> = {
  'dom only':      ['dom'],
  'dom+geometry':  ['dom', 'geometry'],
  'all channels':  ['dom', 'geometry', 'mutations', 'net', 'storage', 'console', 'canvas', 'nav'],
};

test.use({ viewport: { width: 1280, height: 900 } });
test.describe.configure({ mode: 'serial', timeout: 30 * 60 * 1000 });

test('tabbing detector matrix', async ({ page }) => {
  const truth = loadTruth();
  let server: Server, baseUrl: string;
  await ensureReactBundle();
  ({ server, baseUrl } = await startFixtureServer());

  await page.addInitScript(INIT_SCRIPT);
  const cdp = await page.context().newCDPSession(page);

  const universe: string[] = [];
  // Pre-declared so a detector that reports nothing at all still gets a row —
  // axe-core scoring zero is the single most important cell in the table, and
  // building this map lazily silently dropped it.
  const DETECTORS = [
    'D0 current crawler', 'D1 axe-core', 'D2 inline-attr scan', 'D2b handler-property scan',
    'D3 tabindex-counter', 'D4 CSS+lexical', 'D5 CDP getEventListeners',
    'D6 addEventListener shim', 'D7 React fiber props', 'D8 hover-diff',
  ];
  const detectorHits: Record<string, Set<string>> = Object.fromEntries(DETECTORS.map(d => [d, new Set<string>()]));
  const detectorMs: Record<string, number> = {};
  const hit = (name: string, ids: Iterable<string>) => {
    (detectorHits[name] ??= new Set());
    for (const id of ids) detectorHits[name].add(id);
  };
  const timed = async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
    const t = Date.now();
    const r = await fn();
    detectorMs[name] = (detectorMs[name] ?? 0) + (Date.now() - t);
    return r;
  };

  const tabOrders: Record<string, TabOrder> = {};
  const focusOnly: Record<string, string[]> = {};
  const axeDetail: Record<string, string[]> = {};
  const differentials: ProbeDifferential[] = [];
  const provenance: Record<string, string> = {};
  const shadowSurface: Record<string, string> = {};
  const baselines: Record<string, number> = {};
  const collisions = { total: 0, colliding: 0, examples: [] as string[] };
  const coverageBaselines: Record<string, Set<string>> = {};

  for (const [file, probes] of Object.entries(truth.pages)) {
    const url = `${baseUrl}/${file}`;
    universe.push(...probes);
    await page.goto(url, { waitUntil: 'load' });

    // ---- Stage 1: Set T, by real Tab dispatch (§3.3) ----------------------
    const tabOrder = await timed('D-tab-traversal', () => computeTabOrder(page));
    tabOrders[file] = tabOrder;
    const T = new Set(tabOrder.order);

    // §3.3 contrast: focusable-but-not-a-tab-stop
    const focusable = await focusableSet(page);
    focusOnly[file] = focusable.filter(id => !T.has(id));

    const nodes = await timed('D-resolve', () => resolveProbeNodes(cdp, probes, page));
    for (const [id, n] of nodes) shadowSurface[id] = n.via;

    // Every candidate generator sees the same visibility-filtered universe.
    const visible = await visibleProbes(page);
    const minusT = (ids: string[]) => ids.filter(id => !T.has(id));

    // ---- Stage 2: candidate generators ------------------------------------
    hit('D0 current crawler',      minusT(await timed('D0 current crawler', () => d0CurrentCrawler(page))));
    const col = await d0SelectorCollisions(page);
    collisions.total += col.total;
    collisions.colliding += col.colliding;
    if (collisions.examples.length < 5) collisions.examples.push(...col.examples.slice(0, 2));
    hit('D2 inline-attr scan',     minusT(await timed('D2 inline-attr scan', () => pageDetector(page, 'attrScan'))));
    hit('D2b handler-property scan', minusT(await timed('D2b handler-property scan', () => pageDetector(page, 'handlerProp'))));
    hit('D3 tabindex-counter',     minusT(await timed('D3 tabindex-counter', () => pageDetector(page, 'tabindexCounter'))));
    hit('D4 CSS+lexical',          minusT(await timed('D4 CSS+lexical', () => pageDetector(page, 'cssLexical'))));
    hit('D5 CDP getEventListeners',minusT(await timed('D5 CDP getEventListeners', () => d5CdpListeners(cdp, nodes, visible))));
    hit('D7 React fiber props',    minusT(await timed('D7 React fiber props', () => pageDetector(page, 'reactProps'))));
    hit('D8 hover-diff',           minusT(await timed('D8 hover-diff', () => d8HoverDiff(page, nodes))));

    const shim = await timed('D6 addEventListener shim', () => d6ListenerShim(page, visible));
    hit('D6 addEventListener shim', minusT(shim.hits));
    Object.assign(provenance, shim.provenance);

    // ---- D1: axe-core ------------------------------------------------------
    const axe = await timed('D1 axe-core', async () =>
      new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze());
    for (const v of axe.violations) {
      for (const node of v.nodes) {
        const probe = await page.evaluate((sel: string) => {
          const el = document.querySelector(sel);
          return el ? (window as any).__a11y.probeOf(el) : null;
        }, node.target.join(' ')).catch(() => null);
        if (probe) {
          hit('D1 axe-core', [probe]);
          (axeDetail[probe] ??= []).push(v.id);
        }
      }
    }

    // ---- Stage 3: behavioural differential (§3.2 / §3.7) -------------------
    const coverageBaseline = await measureCoverageBaseline(page, cdp, baseUrl, url);
    baselines[file] = coverageBaseline.size;
    for (const probe of probes) {
      differentials.push(await timed('D9 differential (hover+click)', () =>
        runDifferential(page, cdp, probe, tabOrder, { baseUrl, url, includeHover: true, coverageBaseline })));
    }
    coverageBaselines[file] = coverageBaseline;
  }

  // Where does React actually bind click handling? Recorded rather than assumed.
  const reactSurfaces: Record<string, unknown> = {};
  {
    await page.goto(`${baseUrl}/react/index.html`, { waitUntil: 'load' });
    const { result } = await cdp.send('Runtime.evaluate', { expression: 'document.getElementById("root")' }) as any;
    const rootListeners = await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId, depth: 0 }) as any;
    reactSurfaces.rootContainerListeners = rootListeners.listeners.length;
    reactSurfaces.rootContainerClickListeners = rootListeners.listeners.filter((l: any) => l.type === 'click').length;
    await cdp.send('Runtime.releaseObject', { objectId: result.objectId }).catch(() => {});

    reactSurfaces.perElement = await page.evaluate(() => {
      const out: Record<string, unknown> = {};
      for (const id of ['p50', 'p51', 'p52', 'p53', 'p54', 'p55']) {
        const el: any = document.querySelector(`[data-probe="${id}"]`);
        out[id] = {
          onclickProperty: typeof el.onclick === 'function',
          onclickAttribute: el.hasAttribute('onclick'),
          reactOnClickProp: !!Object.keys(el).filter(k => k.startsWith('__reactProps$')).map(k => el[k]?.onClick)[0],
        };
      }
      return out;
    });
    reactSurfaces.addEventListenerShimSawOnElement = await page.evaluate(() =>
      (window as any).__a11y.listeners
        .filter((r: any) => r.type === 'click' && r.target?.nodeType === 1)
        .map((r: any) => r.target.tagName + '#' + (r.target.id || '') + '[' + (r.target.getAttribute('data-probe') || '') + ']'));
  }

  // A second full pass with hover removed from the mouse action set, to price
  // the §3.9 claim that hover is the highest-yield single signal.
  const noHover: ProbeDifferential[] = [];
  for (const [file, probes] of Object.entries(truth.pages)) {
    const url = `${baseUrl}/${file}`;
    await page.goto(url, { waitUntil: 'load' });
    const tabOrder = tabOrders[file];
    for (const probe of probes) {
      noHover.push(await timed('D9 differential (click only)', () =>
        runDifferential(page, cdp, probe, tabOrder, {
          baseUrl, url, includeHover: false, coverageBaseline: coverageBaselines[file],
        })));
    }
  }

  // E2: the same oracle driven by untrusted element.click(), on the occlusion page.
  const untrusted: ProbeDifferential[] = [];
  {
    const file = 'f-occlusion.html';
    const url = `${baseUrl}/${file}`;
    await page.goto(url, { waitUntil: 'load' });
    for (const probe of truth.pages[file]) {
      untrusted.push(await runDifferential(page, cdp, probe, tabOrders[file], {
        baseUrl, url, includeHover: true, untrustedClick: true,
      }));
    }
  }

  await cdp.detach();
  server.close();

  // ---- scoring -------------------------------------------------------------
  const byProbe = new Map(differentials.map(d => [d.probe, d]));
  const scores: Score[] = [];

  for (const [name, ids] of Object.entries(detectorHits)) {
    scores.push(score(name, ids, universe, truth, detectorMs[name]));
  }

  for (const [label, channels] of Object.entries(CHANNEL_SETS)) {
    scores.push(score(
      `D9 differential — ${label}`,
      differentials.filter(d => verdict(d, channels)).map(d => d.probe),
      universe, truth, detectorMs['D9 differential (hover+click)'],
    ));
  }
  scores.push(score(
    'D9 differential — click only, all channels',
    noHover.filter(d => verdict(d, CHANNEL_SETS['all channels'])).map(d => d.probe),
    universe, truth, detectorMs['D9 differential (click only)'],
  ));
  scores.push(score(
    'D10a coverage-diff (keyboard ran nothing)',
    differentials.filter(coverageVerdict).map(d => d.probe),
    universe, truth, detectorMs['D9 differential (hover+click)'],
  ));
  scores.push(score(
    'D10b coverage-diff (set difference)',
    differentials.filter(coverageDiffVerdict).map(d => d.probe),
    universe, truth, detectorMs['D9 differential (hover+click)'],
  ));

  // Stage 4 (§5): dismiss a finding when some keyboard-reachable element
  // delivers the same effect. Applied on top of the best differential.
  const confirmed = differentials.filter(d => verdict(d, CHANNEL_SETS['all channels']));
  const keyboardReachable = differentials.filter(d => d.inTabOrder && d.keyboard.channels.length > 0);

  /** Stage 4 at a given coverage-similarity threshold. */
  const stage4 = (threshold: number) => {
    const dropped: Record<string, { by: string; jaccard: number }> = {};
    const kept = confirmed.filter(d => {
      if (d.mouse.coverage.length === 0) return true;
      const sig = [...d.mouse.channels].sort().join(',');
      for (const k of keyboardReachable) {
        if (k.probe === d.probe || k.keyboard.coverage.length === 0) continue;
        if ([...k.keyboard.channels].sort().join(',') !== sig) continue;
        const j = jaccard(d.mouse.coverage, k.keyboard.coverage);
        if (j >= threshold) { dropped[d.probe] = { by: k.probe, jaccard: j }; return false; }
      }
      return true;
    });
    return { kept, dropped };
  };
  const thresholdSweep = [0.5, 0.8, 0.95, 1.0].map(t => {
    const { kept } = stage4(t);
    return { threshold: t, score: score(`Stage 4 @ Jaccard ≥ ${t}`, kept.map(d => d.probe), universe, truth) };
  });

  const dismissals: Record<string, { by: string; jaccard: number }> = {};
  const afterStage4 = confirmed.filter(d => {
    // Coverage evidence is required: two elements that both run no JS at all
    // would otherwise look identical and dismiss each other.
    if (d.mouse.coverage.length === 0) return true;
    const sig = [...d.mouse.channels].sort().join(',');
    for (const k of keyboardReachable) {
      if (k.probe === d.probe) continue;
      if (k.keyboard.coverage.length === 0) continue;
      if ([...k.keyboard.channels].sort().join(',') !== sig) continue;
      const j = jaccard(d.mouse.coverage, k.keyboard.coverage);
      if (j >= 0.5) { dismissals[d.probe] = { by: k.probe, jaccard: j }; return false; }
    }
    return true;
  });
  scores.push(score(
    'D9 + Stage-4 equivalence dismissal',
    afterStage4.map(d => d.probe), universe, truth,
    detectorMs['D9 differential (hover+click)'],
  ));
  const best = thresholdSweep.reduce((a, b) => (b.score.f1 > a.score.f1 ? b : a));
  scores.push(score(
    `D9 + Stage-4 @ exact coverage equality`,
    stage4(1.0).kept.map(d => d.probe), universe, truth,
    detectorMs['D9 differential (hover+click)'],
  ));

  scores.sort((a, b) => b.f1 - a.f1);

  // ---- report --------------------------------------------------------------
  const lines: string[] = [];
  const L = (s = '') => lines.push(s);

  L('# Tabbing experiment — results');
  L();
  L(`Corpus: ${universe.length} labelled probes across ${Object.keys(truth.pages).length} pages ` +
    `(${universe.filter(p => truth.probes[p].label === 'violation').length} violations, ` +
    `${universe.filter(p => truth.probes[p].label !== 'violation').length} negatives).`);
  L(`Chromium ${test.info().project.name}, viewport 1280×900.`);
  L();
  L('## Detector scores');
  L();
  L(scoreTable(scores));
  L();

  L('## What each detector got wrong');
  L();
  for (const s of scores) {
    if (s.fp === 0 && s.fn === 0) { L(`- **${s.detector}** — perfect on this corpus.`); continue; }
    const fps = s.falsePositives.map(p => `${p} (${truth.probes[p].label})`).join(', ') || '—';
    const fns = s.falseNegatives.join(', ') || '—';
    L(`- **${s.detector}** — FP: ${fps}; FN: ${fns}`);
  }
  L();

  L('## Set T — real Tab traversal (§3.3)');
  L();
  L('| page | tab order | focusable but NOT a tab stop |');
  L('|---|---|---|');
  for (const [file, t] of Object.entries(tabOrders)) {
    L(`| ${file} | ${t.order.join(' → ') || '(none)'} | ${focusOnly[file].join(', ') || '—'} |`);
  }
  L();

  L('## Per-probe differential');
  L();
  L('| probe | truth | in Set T | mouse channels | keyboard channels | mouse cov | kbd cov |');
  L('|---|---|---|---|---|---|---|');
  for (const d of differentials) {
    L(`| ${d.probe} | ${truth.probes[d.probe].label} | ${d.inTabOrder ? 'yes' : 'no'} | ` +
      `${d.mouse.channels.join(', ') || (d.mouse.note ?? '—')} | ` +
      `${d.keyboard.channels.join(', ') || (d.keyboard.note ? 'not in Set T' : '—')} | ` +
      `${d.mouse.coverage.length} | ${d.keyboard.coverage.length} |`);
  }
  L();

  L('## E2 — trusted CDP input vs element.click() (§1.3)');
  L();
  L('| probe | truth | trusted mouse channels | untrusted mouse channels |');
  L('|---|---|---|---|');
  for (const u of untrusted) {
    const t = byProbe.get(u.probe)!;
    L(`| ${u.probe} | ${truth.probes[u.probe].label} | ${t.mouse.channels.join(', ') || '—'} | ${u.mouse.channels.join(', ') || '—'} |`);
  }
  L();

  L('## E3 — Stage-4 equivalence dismissals (§5)');
  L();
  if (Object.keys(dismissals).length === 0) L('None fired.');
  for (const [probe, d] of Object.entries(dismissals)) {
    L(`- \`${probe}\` (${truth.probes[probe].label}) dismissed — \`${d.by}\` is keyboard-reachable and produces the same effect (coverage Jaccard ${d.jaccard.toFixed(2)}).`);
  }
  L();

  L('## Stage-4 dismissal as a function of the coverage-similarity threshold');
  L();
  L('| Jaccard threshold | TP | FP | FN | precision | recall | F1 |');
  L('|---|---|---|---|---|---|---|');
  for (const { threshold, score: sc } of thresholdSweep) {
    L(`| ≥ ${threshold} | ${sc.tp} | ${sc.fp} | ${sc.fn} | ${(sc.precision * 100).toFixed(1)}% | ${(sc.recall * 100).toFixed(1)}% | ${(sc.f1 * 100).toFixed(1)}% |`);
  }
  L();
  L(`Best on this corpus: Jaccard ≥ ${best.threshold} (F1 ${(best.score.f1 * 100).toFixed(1)}%).`);
  L();

  L('## Coverage baselines (functions that run on any click on the page)');
  L();
  L('| page | baseline functions subtracted |');
  L('|---|---|');
  for (const [file, n] of Object.entries(baselines)) L(`| ${file} | ${n} |`);
  L();

  L('## Where React 19 binds click handling');
  L();
  L(`- Root container carries **${reactSurfaces.rootContainerListeners}** listeners, of which ` +
    `**${reactSurfaces.rootContainerClickListeners}** are \`click\` — the delegation the survey describes.`);
  L(`- But each element with an \`onClick\` prop also gets \`element.onclick\` assigned directly:`);
  L();
  L('| probe | `el.onclick` is a function | has `onclick` attribute | React `onClick` prop |');
  L('|---|---|---|---|');
  for (const [id, v] of Object.entries(reactSurfaces.perElement as Record<string, any>)) {
    L(`| ${id} | ${v.onclickProperty ? 'yes' : 'no'} | ${v.onclickAttribute ? 'yes' : 'no'} | ${v.reactOnClickProp ? 'yes' : 'no'} |`);
  }
  L();
  L(`- The \`addEventListener\` shim saw click registrations on these elements: ` +
    `${(reactSurfaces.addEventListenerShimSawOnElement as string[]).join(', ') || '**none**'} — ` +
    'property assignment never calls `addEventListener`.');
  L();

  L('## Selector uniqueness in the shipped crawler');
  L();
  L(`${collisions.colliding} of ${collisions.total} selectors emitted by \`collectClickables\` match more than one element ` +
    `(${((collisions.colliding / Math.max(1, collisions.total)) * 100).toFixed(0)}%). The crawler clicks \`.first()\`, ` +
    'so each collision is a control it never reaches.');
  if (collisions.examples.length) { L(); for (const e of collisions.examples) L(`- \`${e}\``); }
  L();

  L('## E4 — element addressing surfaces');
  L();
  const shim = Object.entries(shadowSurface).filter(([, v]) => v === 'shim').map(([k]) => k);
  L(`- CDP \`DOM.getDocument({pierce:true})\` reached ${Object.values(shadowSurface).filter(v => v === 'cdp').length} of ${Object.keys(shadowSurface).length} probes.`);
  L(`- Needed the document-start \`attachShadow\` shim instead: ${shim.join(', ') || 'none'}.`);
  L();

  L('## Provenance available from the §3.5 shim');
  L();
  L('| probe | registering frame |');
  L('|---|---|');
  for (const [probe, stack] of Object.entries(provenance).slice(0, 8)) {
    L(`| ${probe} | \`${stack.replace(/\|/g, '\\|').slice(0, 110)}\` |`);
  }
  L();

  L('## axe-core detail');
  L();
  L(Object.keys(axeDetail).length === 0
    ? 'axe-core reported no violation on any labelled probe.'
    : Object.entries(axeDetail).map(([p, rules]) => `- \`${p}\` (${truth.probes[p].label}): ${[...new Set(rules)].join(', ')}`).join('\n'));

  const md = lines.join('\n');
  const mdPath = writeResults('results.md', md);
  writeResults('raw.json', {
    universe, truth: truth.probes,
    detectorHits: Object.fromEntries(Object.entries(detectorHits).map(([k, v]) => [k, [...v]])),
    detectorMs, scores, tabOrders: Object.fromEntries(Object.entries(tabOrders).map(([k, v]) => [k, v.order])),
    focusOnly, differentials, noHover, untrusted, dismissals, shadowSurface, axeDetail, baselines,
    thresholdSweep, collisions, reactSurfaces,
  });
  console.log('\n' + md);
  console.log(`\nwrote ${mdPath}`);

  // The experiment is only meaningful if the corpus was fully exercised.
  expect(universe.length).toBe(Object.keys(truth.probes).length);
  expect(differentials.length).toBe(universe.length);
});
