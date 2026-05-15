import { test } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { getConfig } from '../lib/crawler/config';
import { crawl } from '../lib/crawler/index';
import { generateReport } from '../lib/crawler/reporter';
import { scanPage } from '../lib/crawler/scanner';

test('crawl and scan', async ({ page }) => {
  const config = getConfig();
  test.setTimeout(config.timeout);

  await page.goto(config.startUrl);

  const preLoginResults = [];

  if (config.requiresLogin) {
    const loginPageResult = await scanPage(page);
    preLoginResults.push(loginPageResult);
    console.log(`  → Login page scanned: ${loginPageResult.violations.length} violations`);

    const signalFile = path.join(process.cwd(), '.login-complete');
    if (fs.existsSync(signalFile)) fs.unlinkSync(signalFile);

    console.log('');
    console.log('════════════════════════════════════');
    console.log('  Log in in the browser if needed, then run:');
    console.log('    touch .login-complete');
    console.log('  (or create a file named .login-complete in the project root)');
    console.log('════════════════════════════════════');
    console.log('');

    while (!fs.existsSync(signalFile)) await page.waitForTimeout(500);
    fs.unlinkSync(signalFile);
    console.log('Login signal received, starting crawl...');
  }

  const startTime = Date.now();
  const results = await crawl(page, config);
  generateReport([...preLoginResults, ...results], config, startTime);
});
