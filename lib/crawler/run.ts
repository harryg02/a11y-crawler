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

  // The crawl enforces the time budget itself (see lib/crawler/index.ts): at
  // config.timeout it stops cleanly between pages and still writes a report with
  // the pages gathered so far. This timer is only a hard backstop for the
  // pathological case where a single page operation hangs past the budget — it
  // fires later, and (unavoidably) can't save partial work. unref() so a fast,
  // clean finish isn't held open by the timer.
  const HARD_BACKSTOP_GRACE = 3 * 60 * 1000; // 3 min beyond the graceful budget
  const budget = setTimeout(() => {
    console.log('  → Hard timeout: a page operation hung past the budget — aborting.');
    process.exit(1);
  }, config.timeout + HARD_BACKSTOP_GRACE);
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
