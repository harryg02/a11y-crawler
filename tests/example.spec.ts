import { test } from '@playwright/test';
import { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'fs';
import path from 'path';

// --- CONFIG ---
const START_URL = 'https://www.w3.org/WAI/demos/bad/before/home.html';
const SCOPE = 'https://www.w3.org/WAI/demos/bad/before/';  // only crawl within this path
const MAX_PAGES = 50; // sets limit
const SLOW_MO = 300;        // ms between actions, so you can watch

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
      !href.startsWith('tel:')
    )
  )];
}

test('crawl and scan', async ({ page }) => {
  test.setTimeout(300_000); // 5 min timeout

  const visited = new Set<string>();
  const queue: string[] = [START_URL];
  const allResults: PageResult[] = [];
  const origin = new URL(START_URL).origin;

  while (queue.length > 0 && visited.size < MAX_PAGES) {
    const url = queue.shift()!;
    if (visited.has(url)) continue;
    visited.add(url);

    console.log(`[${visited.size}/${MAX_PAGES}] Scanning: ${url}`);

    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(SLOW_MO);

      // scan with axe
      const result = await scanPage(page);
      allResults.push(result);

      console.log(`  → ${result.violationCount} violations`);

      // discover new links
      const links = await discoverLinks(page, origin);
      for (const link of links) {
        if (!visited.has(link) && !queue.includes(link)) {
          queue.push(link);
        }
      }
      console.log(`  → Found ${links.length} links, queue: ${queue.length}`);

    } catch (err) {
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

  console.log(`\nFull report: ${jsonPath}`);
});