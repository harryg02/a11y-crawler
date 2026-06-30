import { test } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { getConfig } from '../lib/crawler/config';
import { crawl } from '../lib/crawler/index';
import { generateReport } from '../lib/crawler/reporter';
import { scanPage } from '../lib/crawler/scanner';

test('crawl and scan', async ({ playwright }) => {
  const config = getConfig();
  test.setTimeout(config.timeout);

  const preLoginResults: Awaited<ReturnType<typeof scanPage>>[] = [];
  let storageState: { cookies: any[]; origins: any[] } | undefined;

  if (config.requiresLogin) {
    // Phase 1: headed browser so the user can log in
    const headedBrowser = await playwright.chromium.launch({ headless: false });
    const headedCtx = await headedBrowser.newContext();
    const loginPage = await headedCtx.newPage();
    await loginPage.goto(config.startUrl);

    const loginPageResult = await scanPage(loginPage);
    preLoginResults.push(loginPageResult);
    console.log(`  → Login page scanned: ${loginPageResult.violations.length} violations`);

    const signalFile = path.join(process.cwd(), '.login-complete');
    if (fs.existsSync(signalFile)) fs.unlinkSync(signalFile);

    console.log('');
    console.log('════════════════════════════════════');
    console.log('  Log in, then click "I\'ve logged in" in the app');
    console.log('════════════════════════════════════');
    console.log('');

    while (!fs.existsSync(signalFile)) await loginPage.waitForTimeout(500);
    fs.unlinkSync(signalFile);
    console.log('Login complete. Switching to headless crawl...');

    // Logging in often redirects the browser (auth flow, or landing on a
    // dashboard). Start the crawl from wherever the user actually ended up,
    // not the originally-typed URL. Scope/boundary is left unchanged.
    const postLoginUrl = loginPage.url();
    if (/^https?:/.test(postLoginUrl) && postLoginUrl.split('?')[0] !== config.startUrl.split('?')[0]) {
      console.log(`Post-login URL changed — starting crawl from current location: ${postLoginUrl}`);
      config.startUrl = postLoginUrl;
    }

    // Save cookies/session, then close headed browser
    storageState = await headedCtx.storageState();
    await headedBrowser.close();
  }

  // Phase 2: crawl browser — headless normally, headed in watch mode
  const browser = await playwright.chromium.launch({ headless: !config.watchMode });
  const ctx = await browser.newContext(storageState ? { storageState } : {});
  const page = await ctx.newPage();

  const startTime = Date.now();
  const results = await crawl(page, config);
  const allResults = [...preLoginResults, ...results];

  if (allResults.length === 0) {
    console.log('__SCAN_UNREACHABLE__');
  } else {
    generateReport(allResults, config, startTime);
  }

  await browser.close();
});
