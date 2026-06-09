import type { Page, Frame } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { PageResult } from '../types';
import type { CrawlerConfig } from './config';
import { getRoutePattern, getCanonicalUrl } from './urlUtils';
import { checkpoint } from './checkpoint';

// Interactions run against either the top-level page or an embedded iframe
// (e.g. an LTI tool hosted on a different origin). Both Page and Frame expose
// the same evaluate/locator/url surface we rely on here.
export type ScanTarget = Page | Frame;

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
  depth = 0
): Promise<PageResult[]> {
  if (depth >= config.maxInteractionDepth) return [];
  if (await checkpoint(page) === 'stop') return [];
  const results: PageResult[] = [];

  // `target` is the page or the embedded frame whose elements we interact with.
  // Navigation/history (goto, goBack) always happens at the page level.
  const frameLabel = target === page.mainFrame() || target === page ? '' : ` [frame: ${target.url()}]`;
  const clickables = await collectClickables(target);
  console.log(`${'    ' + '  '.repeat(depth)}Interactive elements found: ${clickables.length}${frameLabel}`);

  const originalUrl = target.url();

  for (const clickable of clickables) {
    if (await checkpoint(page) === 'stop') break;
    try {
      // Safety check: if a previous click completely derailed us (e.g. goBack failed),
      // force navigation back to the original page before continuing.
      if (getCanonicalUrl(target.url()) !== getCanonicalUrl(originalUrl)) {
        await page.goto(originalUrl, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
        await page.waitForTimeout(500);
      }

      const beforeUrl = target.url();
      const el = target.locator(clickable.selector).first();
      if (!(await el.isVisible())) continue;

      const isGlobal = await el.evaluate((node: HTMLElement) => {
        return !!node.closest('header, nav, footer, [role="banner"], [role="navigation"], [role="contentinfo"]');
      }).catch(() => false);

      const routePattern = getRoutePattern(target.url());
      const interactionKey = isGlobal
        ? `GLOBAL|${clickable.tag}:${clickable.text}`
        : `${routePattern}|${clickable.tag}:${clickable.text}`;
      if (scannedInteractions.has(interactionKey)) continue;
      scannedInteractions.add(interactionKey);

      await highlight(target, clickable.selector, 'red', config.watchMode);
      console.log(`${'    ' + '  '.repeat(depth)}→ Clicking: <${clickable.tag}> "${clickable.text}"`);

      const domBefore = await target.evaluate(() => {
        let hash = 0;
        const str = document.body.innerHTML;
        for (let i = 0; i < str.length; i++) hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
        return hash;
      });

      await el.click({ timeout: 3000 });
      await page.waitForTimeout(500);

      const afterUrl = target.url();
      const isFullNavigation = getCanonicalUrl(afterUrl) !== getCanonicalUrl(beforeUrl);

      if (isFullNavigation) {
        try {
          await page.goBack({ waitUntil: 'networkidle', timeout: 5000 });
        } catch {
          // If goBack fails (e.g. history got wiped or timeout), force goto
          await page.goto(beforeUrl, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
        }
        await page.waitForTimeout(300);
        continue;
      }

      const domAfter = await target.evaluate(() => {
        let hash = 0;
        const str = document.body.innerHTML;
        for (let i = 0; i < str.length; i++) hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
        return hash;
      });

      if (domBefore === domAfter) {
        console.log(`${'    ' + '  '.repeat(depth)}  (no DOM change — skipping)`);
        continue;
      }

      const result = await scanPage(page);
      result.url = `${beforeUrl} (clicked "${clickable.text}")`;
      results.push(result);

      if (result.violations.length > 0) {
        console.log(`${'    ' + '  '.repeat(depth)}  ⚠ ${result.violations.length} violations`);
      }

      const deeperResults = await scanInteractiveElements(page, target, scannedInteractions, config, depth + 1);
      results.push(...deeperResults);

      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);

    } catch {
      continue;
    }
  }

  return results;
}
