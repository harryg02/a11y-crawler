import { test } from '@playwright/test';
import { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'fs';
import path from 'path';

// --- CONFIG ---
// const START_URL = 'https://www.w3.org/WAI/demos/bad/before/home.html';
// const SCOPE = 'https://www.w3.org/WAI/demos/bad/before/home.html';
const START_URL = 'https://www.w3.org/WAI/demos/bad/before/home.html';
const SCOPE = 'https://www.w3.org/WAI/demos/bad/before/home.html';  // only crawl within this path
const MAX_PAGES = Infinity; // sets limit
const WATCH_MODE = true;  // true = highlights + delays, false = fast silent crawl
const SLOW_MO = 100;        // ms between actions, so you can watch
const MAX_INTERACTION_DEPTH = 3;  // how deep to explore nested interactive states
const TIMEOUT = 1_800_000;

const BLOCKED_PATTERNS = [
  '/logout',
  '/delete',
  '/remove',
  '/signout',
  '/sign-out',
  '/log-out',
];

function isBlocked(url: string): boolean {
  return BLOCKED_PATTERNS.some(pattern => url.toLowerCase().includes(pattern));
}

// emit repetitive ID patterns from report
const ID_PATTERNS = [
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g,  // UUIDs
  /\/\d{4,}\b/g,  // numeric IDs like /course/12345
];
// emit repetitive ID patterns from report
function getRoutePattern(url: string): string {
  const currentUrl = new URL(url);
  let pattern = currentUrl.pathname;
  for (const regex of ID_PATTERNS) {
    pattern = pattern.replace(regex, ':id');
  }
  currentUrl.search = '';
  return `${currentUrl.origin}${pattern}`;
}

interface PageResult {
  url: string;
  timestamp: string;
  violationCount: number;
  violations: any[];
  highRiskElements: Record<string, number>;
}

async function scanPage(page: Page): Promise<PageResult> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();

  // detect high-risk components (Jane's request)
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
    timestamp: new Date().toISOString(),
    violationCount: results.violations.length,
    violations: results.violations.map(v => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      wcag: v.tags.filter(t => t.startsWith('wcag')),
      instances: v.nodes.length,
    })),
    highRiskElements,
  };
}
// find all <a> tags
async function discoverLinks(page: Page, baseOrigin: string): Promise<string[]> {
  const hrefs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a[href]'))
      .map(a => (a as HTMLAnchorElement).href)
  );

  // filter: same origin only, no anchors, no mailto/tel, deduplicate
  return [...new Set(
    hrefs.filter(href =>
      href.startsWith(SCOPE) &&
      !href.includes('#') &&
      !href.startsWith('mailto:') &&
      !href.startsWith('tel:') &&
      !isBlocked(href)
    )
  )];
}

async function highlight(page: Page, selector: string, color: string) {
  if (!WATCH_MODE) return;
  try {
    const el = page.locator(selector).first();
    await el.evaluate((node: HTMLElement, c: string) => {
      const rect = node.getBoundingClientRect();
      const div = document.createElement('div');
      div.style.cssText = `position:fixed;top:${rect.top-3}px;left:${rect.left-3}px;width:${rect.width+6}px;height:${rect.height+6}px;border:4px solid ${c};pointer-events:none;z-index:999999;border-radius:4px;`;
      document.body.appendChild(div);
      node.scrollIntoView({ block: 'center' });
      setTimeout(() => div.remove(), 400);
    }, color);
    await page.waitForTimeout(400);
  } catch {}
}

async function collectClickables(page: Page) {
  return page.evaluate(() => {
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
      const text = (el.textContent || '').trim().slice(0, 30);
      elements.push({ selector: id ? `${tag}${id}` : `${tag}${classes}`, tag, text });
    }
    return elements;
  });
}

// Within each page, find clickable elements, click each one, scan the resulting state, then undo.
async function scanInteractiveElements(page: Page, scannedInteractions: Set<string>, depth: number = 0, maxDepth: number = MAX_INTERACTION_DEPTH): Promise<PageResult[]> {
  if (depth >= maxDepth) return [];
  const results: PageResult[] = [];

  // find all interactive elements that aren't links (links are handled by the crawler)
  const clickables = await collectClickables(page);
  console.log(`${'    ' + '  '.repeat(depth)}Interactive elements found: ${clickables.length}`)

  for (const clickable of clickables) { // iterates in order
  // click element #1 → navigates away → go back → continue
  // loop moves to element #2, not back to #1. The for...of loop keeps
  // its position in the array regardless of what happens to the page.
  // After going back, it picks up at the next element.
    try {
      // snapshot current URL and DOM state
      const beforeUrl = page.url();

      // try to find and click the element
      const el = page.locator(clickable.selector).first();
      if (!(await el.isVisible())) continue;

      // check if element is in global nav/header/footer, skip this specific element
      // if it's been clicked before in a global context.
      const isGlobal = await el.evaluate((node: HTMLElement) => {
        return !!node.closest('header, nav, footer, [role="banner"], [role="navigation"], [role="contentinfo"]');
      }).catch(() => false);

      const routePattern = getRoutePattern(page.url());
      const interactionKey = isGlobal
        ? `GLOBAL|${clickable.tag}:${clickable.text}`
        : `${routePattern}|${clickable.tag}:${clickable.text}`;
      if (scannedInteractions.has(interactionKey)) continue;
      scannedInteractions.add(interactionKey);

      await highlight(page, clickable.selector, 'red');

      console.log(`${'    ' + '  '.repeat(depth)}→ Clicking: <${clickable.tag}> "${clickable.text}"`);
      // snapshot DOM before click, hash the DOM, so we can compare 
      // if DOM changed after clicking on an element
      const domBefore = await page.evaluate(() => {
        let hash = 0;
        const str = document.body.innerHTML;
        for (let i = 0; i < str.length; i++) {
          hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
        }
        return hash;
      });

      await el.click({ timeout: 3000 });
      await page.waitForTimeout(500);
      // check if we navigated away — if so, go back
      if (page.url() !== beforeUrl) {
        await page.goBack({ waitUntil: 'networkidle' });
        await page.waitForTimeout(300);
        continue;
      }
      // check if we navigated away — if so, go back
      const domAfter = await page.evaluate(() => {
        let hash = 0;
        const str = document.body.innerHTML;
        for (let i = 0; i < str.length; i++) {
          hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
        }
        return hash;
      });
      // check if DOM actually changed
      if (domBefore === domAfter) {
        console.log(`${'    ' + '  '.repeat(depth)}  (no DOM change — skipping)`);
        continue;
      }
      // If DOM changed — scan the new state
      const result = await scanPage(page);

      result.url = `${beforeUrl} → <${clickable.tag}> "${clickable.text}"`;
      results.push(result);

      if (result.violationCount > 0) {
        console.log(`${'    ' + '  '.repeat(depth)}  ⚠ ${result.violationCount} violations`);
      }

      // recurse — explore new elements revealed by this click
      const deeperResults = await scanInteractiveElements(page, scannedInteractions, depth + 1, maxDepth);
      results.push(...deeperResults);

      // try to undo: press Escape (closes most modals/dropdowns)
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);

    } catch (err) {
      // element disappeared, click intercepted, etc — skip it
      continue;
    }
  }

  return results;
}

test('crawl and scan', async ({ page }) => {
  test.setTimeout(TIMEOUT); // 30 min timeout

  const visited = new Set<string>();
  const queue: string[] = [START_URL];
  const scannedInteractions = new Set<string>();
  const patternHashes = new Map<string, number>();
  const allResults: PageResult[] = [];
  const origin = new URL(START_URL).origin;
  // after page.goto, before scanning. Wrap the main loop more defensively
  // if one page crashes, skip it and continue:
  await page.goto(START_URL);

  const signalFile = path.join(process.cwd(), '.login-complete');
  if (fs.existsSync(signalFile)) fs.unlinkSync(signalFile);

  console.log('');
  console.log('════════════════════════════════════');
  console.log('  Log in in the browser if needed, then run:');
  console.log('    touch .login-complete');
  console.log('  (or create a file named .login-complete in the project root)');
  console.log('════════════════════════════════════');
  console.log('');

  // poll for the signal file
  while (!fs.existsSync(signalFile)) {
    await page.waitForTimeout(500);
  }

  fs.unlinkSync(signalFile);  // clean up
  console.log('Login signal received, starting crawl...');

  while (queue.length > 0 && visited.size < MAX_PAGES) {
    const url = queue.shift()!;
    //Within while loop
    // 1. EXACT URL TRACKING (Prevents infinite loops on identical URLs)
    if (visited.has(url)) continue;
    visited.add(url);

    const urlPattern = getRoutePattern(url);
    console.log(`[${visited.size}/${MAX_PAGES}] Scanning: ${url}`);

    try {
      // 2. LOAD PAGE
      await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });

      await page.waitForTimeout(SLOW_MO);

      // 3. ALWAYS DISCOVER LINKS (Must happen before any 'continue' statements)
      const links = await discoverLinks(page, origin);
      for (const link of links) {
        if (!visited.has(link) && !queue.includes(link)) {
          console.log(`    + queued: ${link}`);
          queue.push(link);
        }
      }
      console.log(`  → ${links.length} links found, ${queue.length} in queue`);

      // 4. CALCULATE DOM HASH, check if this pattern was already scanned with identical DOM
      const domHash = await page.evaluate(() => {
        let hash = 0;
        const str = document.body.innerHTML;
        for (let i = 0; i < str.length; i++) {
          hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
        }
        return hash;
      });

      // 5. CHECK HASH TO SKIP EXPENSIVE SCANS
      if (patternHashes.has(urlPattern) && patternHashes.get(urlPattern) === domHash) {
        console.log(`  → Same DOM as previous ${urlPattern} — skipping Axe/Interactive scans`);
        continue; // Ends iteration here. Links are already queued.
      }
      patternHashes.set(urlPattern, domHash);

      // 6. RUN EXPENSIVE Axe SCANS (Only reached if DOM is unique)
      const result = await scanPage(page);
      allResults.push(result);
      console.log(`  → ${result.violationCount} violations`);

      const interactiveResults = await scanInteractiveElements(page, scannedInteractions);
      allResults.push(...interactiveResults);

    } catch (err) {
      const msg = (err as Error).message;
      //Fix: detect a dead browser in the main loop and abort gracefully
      if (msg.includes('browser has been closed') || msg.includes('Target closed')) {
        console.log('  → FATAL: Browser closed. Ending crawl.');
        break; // exit the while loop, still generate report
      }
      console.log(`  → ERROR: ${(err as Error).message.slice(0, 100)}`);
    }
  }

  // --- GENERATE REPORT ---
  const reportDir = path.join(process.cwd(), 'reports');
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir);

  // full JSON data
  const jsonPath = path.join(reportDir, `report-${Date.now()}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(allResults, null, 2));

  // summary to console
  console.log('\n══════════════════════════════════');
  console.log(`CRAWL COMPLETE: ${allResults.length} pages scanned`);
  console.log('══════════════════════════════════\n');

  // cross-page violation summary
  const violationMap = new Map<string, { help: string; impact: string; pages: string[] }>();
  for (const r of allResults) {
    for (const v of r.violations) {
      if (!violationMap.has(v.id)) {
        violationMap.set(v.id, { help: v.help, impact: v.impact, pages: [] });
      }
      violationMap.get(v.id)!.pages.push(r.url);
    }
  }

  console.log('REPEAT VIOLATIONS (across multiple pages):');
  for (const [id, data] of violationMap) {
    if (data.pages.length > 1) {
      console.log(`  [${data.impact}] ${id}: ${data.help}`);
      console.log(`    → ${data.pages.length} pages affected`);
    }
  }

  // high-risk element summary
  console.log('\nHIGH-RISK ELEMENTS:');
  const elementTotals: Record<string, string[]> = {};
  for (const r of allResults) {
    for (const [el, count] of Object.entries(r.highRiskElements)) {
      if (count > 0) {
        if (!elementTotals[el]) elementTotals[el] = [];
        elementTotals[el].push(r.url);
      }
    }
  }
  for (const [el, pages] of Object.entries(elementTotals)) {
    console.log(`  ${el}: found on ${pages.length}/${allResults.length} pages`);
  }


  // route pattern grouping, so the report does not show the same result of different pages using the same template
  const patternMap = new Map<string, PageResult[]>();
  for (const r of allResults) {
    const pattern = getRoutePattern(r.url);
    if (!patternMap.has(pattern)) patternMap.set(pattern, []);
    patternMap.get(pattern)!.push(r);
  }

  console.log('\nRESULTS BY ROUTE PATTERN:');
  for (const [pattern, pages] of patternMap) {
    const violationSets = pages.map(p =>
      p.violations.map(v => v.id).sort().join(',')
    );
    const allIdentical = violationSets.every(s => s === violationSets[0]);

    if (allIdentical && pages.length > 1) {
      const rep = pages[0];
      console.log(`  ${pattern} (${pages.length} instances, identical results)`);
      console.log(`    Representative: ${rep.url}`);
      console.log(`    Violations: ${rep.violationCount}`);
      if (rep.violationCount > 0) {
        for (const v of rep.violations) {
          console.log(`      [${v.impact}] ${v.id}: ${v.help} (${v.instances})`);
        }
      }
    } else if (pages.length > 1) {
      console.log(`  ⚠ ${pattern} (${pages.length} instances, INCONSISTENT)`);
      for (const p of pages) {
        console.log(`    ${p.url} → ${p.violationCount} violations`);
        for (const v of p.violations) {
          console.log(`      [${v.impact}] ${v.id}: ${v.help} (${v.instances})`);
        }
      }
    } else {
      const p = pages[0];
      console.log(`  ${pattern}`);
      console.log(`    ${p.url} → ${p.violationCount} violations`);
      for (const v of p.violations) {
        console.log(`      [${v.impact}] ${v.id}: ${v.help} (${v.instances})`);
      }
    }
  }

  console.log(`\nFull report: ${jsonPath}`);
});