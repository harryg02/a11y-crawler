import { test } from '@playwright/test';
import { getConfig } from '../lib/crawler/config';
import { runCrawl } from '../lib/crawler/driver';

// The crawl logic now lives in lib/crawler/driver.ts and is shared with the
// standalone runner (lib/crawler/run.ts) used by the app. This test just drives
// it through the Playwright test runner.
test('crawl and scan', async ({ playwright }) => {
  test.setTimeout(getConfig().timeout);
  await runCrawl(playwright);
});
