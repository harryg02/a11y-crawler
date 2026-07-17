/**
 * Standalone crawler entry point.
 *
 * Replaces the old `playwright test tests/crawler.spec.ts` invocation. It uses
 * the Playwright library directly (no test runner), so it can be bundled into a
 * single .cjs file and shipped inside a packaged Electron app. Configuration is
 * read from CRAWLER_* environment variables (see lib/crawler/config.ts), exactly
 * as before.
 */
import { chromium } from 'playwright';
import { runCrawl } from './driver';
import { getConfig } from './config';

async function main(): Promise<void> {
  const config = getConfig();

  // The Playwright test runner used to enforce an overall time budget via
  // test.setTimeout(config.timeout). Reproduce that here so a stuck crawl can't
  // hang forever. unref() so a fast, clean finish isn't held open by the timer.
  const budget = setTimeout(() => {
    console.log(`  → Crawl exceeded time budget (${config.timeout} ms) — aborting.`);
    process.exit(1);
  }, config.timeout);
  budget.unref();

  try {
    await runCrawl({ chromium });
  } finally {
    clearTimeout(budget);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
