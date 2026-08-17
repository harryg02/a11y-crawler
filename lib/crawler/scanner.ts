import type { Page, Frame } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { PageResult } from '../types';
import type { CrawlerConfig } from './config';
import { getRoutePattern, getCanonicalUrl, normalizeSignature } from './urlUtils';
import { checkpoint } from './checkpoint';

// Interactions run against either the top-level page or an embedded iframe
// (e.g. an LTI tool hosted on a different origin). Both Page and Frame expose
// the same evaluate/locator/url surface we rely on here.
export type ScanTarget = Page | Frame;

// Per-page-load interaction limits, shared across the recursive depth calls so
// repeated controls (calendar days, table rows) can't trigger a runaway loop.
interface InteractionBudget {
  remaining: number;
  signatureCounts: Map<string, number>;
}

// Crawl-wide running totals across every page/frame, for the final summary.
export interface InteractionTally {
  clicked: number;
  avoided: number;
  duplicate: number;
  capped: number;
  hidden: number;
  noChange: number;
  navReverted: number;
}

export function newInteractionTally(): InteractionTally {
  return { clicked: 0, avoided: 0, duplicate: 0, capped: 0, hidden: 0, noChange: 0, navReverted: 0 };
}

export async function scanPage(page: Page): Promise<PageResult> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();

  const highRiskElements = await page.evaluate(() => ({
    tables:  document.querySelectorAll('table').length,
    forms:   document.querySelectorAll('form').length,
    iframes: document.querySelectorAll('iframe').length,
    images:  document.querySelectorAll('img').length,
    videos:  document.querySelectorAll('video, audio').length,
    dialogs: document.querySelectorAll('[role="dialog"], [role="tabpanel"], [role="menu"]').length,
  }));

  return {
    url: page.url(),
    violations: results.violations.map(v => ({
      id: v.id,
      impact: v.impact as 'critical' | 'serious' | 'moderate' | 'minor',
      help: v.help,
      description: v.description,
      helpUrl: v.helpUrl,
      wcagTags: v.tags.filter(t => t.startsWith('wcag')),
      nodes: v.nodes.map(n => ({
        html: n.html,
        selector: n.target.join(', '),
        failureSummary: n.failureSummary ?? '',
      })),
    })),
    highRiskElements,
  };
}

export async function highlight(target: ScanTarget, selector: string, color: string, watchMode: boolean) {
  if (!watchMode) return;
  try {
    const el = target.locator(selector).first();
    await el.evaluate((node: HTMLElement, c: string) => {
      const rect = node.getBoundingClientRect();
      const div = document.createElement('div');
      div.style.cssText = `position:fixed;top:${rect.top-3}px;left:${rect.left-3}px;width:${rect.width+6}px;height:${rect.height+6}px;border:4px solid ${c};pointer-events:none;z-index:999999;border-radius:4px;`;
      document.body.appendChild(div);
      node.scrollIntoView({ block: 'center' });
      setTimeout(() => div.remove(), 400);
    }, color);
    await target.waitForTimeout(400);
  } catch {}
}

export async function collectClickables(target: ScanTarget) {
  return target.evaluate(() => {
    const elements: { selector: string; tag: string; text: string }[] = [];
    const candidates = document.querySelectorAll(
      'button, [role="button"], [role="tab"], [role="menuitem"], ' +
      '[role="switch"], [role="checkbox"], [role="radio"], ' +
      'details > summary, [aria-expanded], [aria-haspopup], ' +
      'select, [onclick]'
    );
    for (const el of candidates) {
      if (el.closest('a')) continue;
      if ((el as HTMLElement).offsetParent === null) continue;
      if (el.tagName === 'TD' || el.tagName === 'TR' || el.tagName === 'TH') continue;
      const tag = el.tagName.toLowerCase();
      const id = el.id ? `#${el.id}` : '';
      const classes = el.className && typeof el.className === 'string'
        ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.')
        : '';
      const ariaLabel = el.getAttribute('aria-label');
      const rawText = (el.textContent || '').replace(/[a-z]+(?:_[a-z]+)+/g, '').replace(/\s+/g, ' ').trim();
      const text = (ariaLabel || rawText).slice(0, 50);
      elements.push({ selector: id ? `${tag}${id}` : `${tag}${classes}`, tag, text });
    }
    return elements;
  });
}

export async function scanInteractiveElements(
  page: Page,
  target: ScanTarget,
  scannedInteractions: Set<string>,
  config: CrawlerConfig,
  depth = 0,
  budget?: InteractionBudget,
  tally?: InteractionTally,
  enqueue?: (url: string) => void,
): Promise<PageResult[]> {
  if (depth >= config.maxInteractionDepth) return [];
  if (await checkpoint() === 'stop') return [];
  const results: PageResult[] = [];

  // Created once at the top-level call and threaded through the recursion so
  // the caps apply to the whole interaction tree for this page load.
  budget ??= { remaining: config.maxInteractionsPerPage, signatureCounts: new Map() };

  // `target` is the page or the embedded frame whose elements we interact with.
  // Navigation/history (goto, goBack) always happens at the page level.
  const frameLabel = target === page.mainFrame() || target === page ? '' : ` [frame: ${target.url()}]`;

  // The top browser URL must not change while we interact: an embedded tool
  // (LTI iframe) is explored in place. We pin to the page's URL and undo any
  // click that navigates the top page away from it.
  const isSubFrame = target !== page && target !== page.mainFrame();
  const pinnedUrl = page.url();

  const pad = '    ' + '  '.repeat(depth);
  const stats = { clicked: 0, avoided: 0, duplicate: 0, capped: 0, hidden: 0, navReverted: 0, noChange: 0 };
  // Set when an in-place click changes the page (URL unchanged). If a later
  // sibling is then hidden because the view was replaced, we reload to restore.
  let pageDirty = false;

  // Re-scan the DOM after each pass: clicking can reveal new top-level
  // clickables, so keep going until a pass clicks nothing new. The crawl-wide
  // dedup (scannedInteractions) and the per-group cap guarantee termination.
  const MAX_PASSES = 100;
  let passCount = 0;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    if (budget.remaining <= 0) break;
    let clickables;
    try { clickables = await collectClickables(target); }
    catch { break; } // frame detached (e.g. after a navigation) — stop scanning it
    if (pass === 0) console.log(`${pad}Interactive elements found: ${clickables.length}${frameLabel}`);
    passCount = pass + 1;
    let progressed = 0;

  for (const clickable of clickables) {
    if (await checkpoint() === 'stop') break;
    if (budget.remaining <= 0) {
      console.log(`${'    ' + '  '.repeat(depth)}→ interaction budget reached (${config.maxInteractionsPerPage}) — stopping interactions on this page`);
      break;
    }
    // Honour the "Buttons to avoid" list: never click a control whose accessible
    // text contains a blocked word (e.g. "Sign out"). blockedPatterns was only
    // applied to URLs, so such buttons were still being clicked. Match
    // case-insensitively on both sides.
    const label = clickable.text.toLowerCase();
    const blockedWord = config.blockedPatterns.find(p => p && label.includes(p.toLowerCase()));
    if (blockedWord) {
      stats.avoided++;
      console.log(`${pad}→ Skipping avoided button ("${blockedWord}"): <${clickable.tag}> "${clickable.text}"`);
      continue;
    }
    try {
      // If a previous click navigated the top page away, restore the pinned URL.
      // For an embedded frame the old frame handle is now stale, so stop here.
      if (getCanonicalUrl(page.url()) !== getCanonicalUrl(pinnedUrl)) {
        await page.goto(pinnedUrl, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
        await page.waitForTimeout(500);
        if (isSubFrame) break;
      }

      let el = target.locator(clickable.selector).first();
      let visible = await el.isVisible().catch(() => false);
      // A previous in-place click can replace the view (URL unchanged) and hide
      // the remaining siblings. At the top level — where the pinned URL *is* the
      // original state — reload to restore it so we still reach every control
      // that was discovered on this page.
      if (!visible && pageDirty && !isSubFrame && depth === 0
          && getCanonicalUrl(page.url()) === getCanonicalUrl(pinnedUrl)) {
        console.log(`${pad}  ⟳ restoring page to reach hidden control "${clickable.text}"`);
        await page.goto(pinnedUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
        await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
        pageDirty = false;
        el = target.locator(clickable.selector).first();
        visible = await el.isVisible().catch(() => false);
      }
      if (!visible) { stats.hidden++; continue; }

      const beforeUrl = page.url();

      const isGlobal = await el.evaluate((node: HTMLElement) => {
        return !!node.closest('header, nav, footer, [role="banner"], [role="navigation"], [role="contentinfo"]');
      }).catch(() => false);

      const routePattern = getRoutePattern(target.url());
      const interactionKey = isGlobal
        ? `GLOBAL|${clickable.tag}:${clickable.text}`
        : `${routePattern}|${clickable.tag}:${clickable.text}`;
      if (scannedInteractions.has(interactionKey)) { stats.duplicate++; continue; }

      // Cap how many near-identical controls we click on this page. The
      // signature is structural (tag + digit-normalized selector) and ignores
      // the visible text, so a whole calendar/table/list of cells that share a
      // selector pattern collapses to one group and only a few get sampled.
      const signature = `${isGlobal ? 'GLOBAL' : routePattern}|${clickable.tag}|${normalizeSignature(clickable.selector)}`;
      const sigCount = budget.signatureCounts.get(signature) ?? 0;
      if (sigCount >= config.maxRepeatedInteractions) {
        stats.capped++;
        console.log(`${pad}→ Skipping repeated control (cap ${config.maxRepeatedInteractions} reached for similar elements): <${clickable.tag}> "${clickable.text}"`);
        continue;
      }
      budget.signatureCounts.set(signature, sigCount + 1);

      scannedInteractions.add(interactionKey);
      budget.remaining--;
      stats.clicked++;
      progressed++;

      await highlight(target, clickable.selector, 'red', config.watchMode);
      console.log(`${pad}→ Clicking (#${stats.clicked} this frame): <${clickable.tag}> "${clickable.text}"`);

      const domBefore = await target.evaluate(() => {
        let hash = 0;
        const str = document.body.innerHTML;
        for (let i = 0; i < str.length; i++) hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
        return hash;
      });

      await el.click({ timeout: 3000 });
      await page.waitForTimeout(500);

      // A change to the *top* URL means the click escaped the scoped page (e.g.
      // the tool tried to take over the tab). Undo it. An in-place navigation
      // inside the iframe leaves the top URL unchanged and is explored normally.
      const isTopNavigation = getCanonicalUrl(page.url()) !== getCanonicalUrl(beforeUrl);

      if (isTopNavigation) {
        const navUrl = page.url();
        stats.navReverted++;
        if (!isSubFrame && enqueue) {
          // Main frame: a click reached a new page. Hand the destination to the
          // crawl queue (it applies scope/dedup), then go back and keep clicking.
          enqueue(navUrl);
          console.log(`${pad}  ↪ click on "${clickable.text}" navigated to ${navUrl} — queued; returning to ${pinnedUrl}`);
        } else {
          // Embedded sub-frame trying to take over the tab — just undo it.
          console.log(`${pad}  ↩ click on "${clickable.text}" navigated the tab to ${navUrl} — reverting to ${pinnedUrl}`);
        }
        try {
          await page.goBack({ waitUntil: 'domcontentloaded', timeout: 5000 });
        } catch { /* fall through to the pinned-URL restore below */ }
        if (getCanonicalUrl(page.url()) !== getCanonicalUrl(pinnedUrl)) {
          await page.goto(pinnedUrl, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
        }
        await page.waitForTimeout(300);
        if (isSubFrame) break; // frame handle is stale after a top-level navigation
        continue;
      }

      const domAfter = await target.evaluate(() => {
        let hash = 0;
        const str = document.body.innerHTML;
        for (let i = 0; i < str.length; i++) hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
        return hash;
      });

      if (domBefore === domAfter) {
        stats.noChange++;
        console.log(`${pad}  (no DOM change — skipping)`);
        continue;
      }

      // The click changed the page in place; a later sibling may now be hidden.
      if (!isSubFrame && depth === 0) pageDirty = true;

      const result = await scanPage(page);
      result.url = `${beforeUrl} (clicked "${clickable.text}")`;
      results.push(result);

      if (result.violations.length > 0) {
        console.log(`${'    ' + '  '.repeat(depth)}  ⚠ ${result.violations.length} violations`);
      }

      const deeperResults = await scanInteractiveElements(page, target, scannedInteractions, config, depth + 1, budget, tally, enqueue);
      results.push(...deeperResults);

      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);

    } catch (err) {
      console.log(`${pad}  (interaction error, skipping element: ${(err as Error).message.slice(0, 80)})`);
      continue;
    }
  }

    // No new clickable was acted on this pass — the DOM is exhausted.
    if (progressed === 0) break;
  }

  const budgetStr = Number.isFinite(config.maxInteractionsPerPage)
    ? `${budget.remaining}/${config.maxInteractionsPerPage} left`
    : 'unlimited';
  console.log(`${pad}↳ interactions done${frameLabel}: ${stats.clicked} clicked over ${passCount} pass(es); skipped {avoided ${stats.avoided}, duplicate ${stats.duplicate}, repeated-cap ${stats.capped}, hidden ${stats.hidden}, no-change ${stats.noChange}}, nav-reverted ${stats.navReverted}; budget ${budgetStr}`);

  if (tally) {
    tally.clicked += stats.clicked;
    tally.avoided += stats.avoided;
    tally.duplicate += stats.duplicate;
    tally.capped += stats.capped;
    tally.hidden += stats.hidden;
    tally.noChange += stats.noChange;
    tally.navReverted += stats.navReverted;
  }

  return results;
}
