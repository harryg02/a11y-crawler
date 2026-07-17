import fs from 'fs';
import type { PageResult, ScanRecord } from '../types';
import type { CrawlerConfig } from './config';
import { getRoutePattern } from './urlUtils';
import { reportsDir, reportPath } from '../paths';

export function generateReport(
  allResults: PageResult[],
  config: CrawlerConfig,
  startTimeMs?: number,
): ScanRecord {
  reportsDir(); // ensure the reports directory exists

  const scanId = `scan-${Date.now()}`;
  const scan: ScanRecord = {
    id: scanId,
    url: config.startUrl,
    scope: config.scope,
    date: new Date().toISOString(),
    durationSeconds: startTimeMs ? Math.round((Date.now() - startTimeMs) / 1000) : 0,
    config: {
      maxDepth: config.maxInteractionDepth,
      timeout: config.timeout,
    },
    pages: allResults.map((r, i) => ({
      id: `p${i}`,
      url: r.url,
      violations: r.violations,
      highRiskElements: r.highRiskElements,
    })),
  };

  const jsonPath = reportPath(scanId);
  console.log(`  → Writing report (${scan.pages.length} pages)...`);
  fs.writeFileSync(jsonPath, JSON.stringify(scan, null, 2));
  console.log(`  → Report saved`);

  console.log('\n══════════════════════════════════');
  console.log(`CRAWL COMPLETE: ${allResults.length} pages scanned`);
  console.log('══════════════════════════════════\n');

  const violationMap = new Map<string, { help: string; impact: string; pages: string[] }>();
  for (const r of allResults) {
    for (const v of r.violations) {
      if (!violationMap.has(v.id)) violationMap.set(v.id, { help: v.help, impact: v.impact, pages: [] });
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

  const patternMap = new Map<string, PageResult[]>();
  for (const r of allResults) {
    const pattern = getRoutePattern(r.url);
    if (!patternMap.has(pattern)) patternMap.set(pattern, []);
    patternMap.get(pattern)!.push(r);
  }

  console.log('\nRESULTS BY ROUTE PATTERN:');
  for (const [pattern, pages] of patternMap) {
    const violationSets = pages.map(p => p.violations.map(v => v.id).sort().join(','));
    const allIdentical = violationSets.every(s => s === violationSets[0]);

    if (allIdentical && pages.length > 1) {
      const rep = pages[0];
      console.log(`  ${pattern} (${pages.length} instances, identical results)`);
      console.log(`    Representative: ${rep.url}`);
      console.log(`    Violations: ${rep.violations.length}`);
      for (const v of rep.violations) {
        console.log(`      [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} instances)`);
      }
    } else if (pages.length > 1) {
      console.log(`  ⚠ ${pattern} (${pages.length} instances, INCONSISTENT)`);
      for (const p of pages) {
        console.log(`    ${p.url} → ${p.violations.length} violations`);
        for (const v of p.violations) {
          console.log(`      [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} instances)`);
        }
      }
    } else {
      const p = pages[0];
      console.log(`  ${pattern}`);
      console.log(`    ${p.url} → ${p.violations.length} violations`);
      for (const v of p.violations) {
        console.log(`      [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} instances)`);
      }
    }
  }

  console.log(`\nFull report: ${jsonPath}`);
  return scan;
}
