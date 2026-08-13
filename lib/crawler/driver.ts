import fs from 'fs';
import type { BrowserType } from '@playwright/test';
import { getConfig } from './config';
import { crawl } from './index';
import { generateReport } from './reporter';
import { scanPage } from './scanner';
import { LOGIN_COMPLETE_FILE } from '../paths';

// Both @playwright/test's `playwright` fixture and the standalone `playwright`
// package expose a `chromium` BrowserType, so the driver can be shared by the
// Playwright test (tests/crawler.spec.ts) and the standalone runner (run.ts).
export interface PlaywrightLike {
  chromium: BrowserType;
}

/**
 * Drives a full crawl+scan run: optional headed login phase, then the headless
 * (or headed watch-mode) crawl, then report generation. Extracted from the
 * former Playwright test body so it can run without the test runner.
 */
export async function runCrawl(pw: PlaywrightLike): Promise<void> {
  const config = getConfig();

  const preLoginResults: Awaited<ReturnType<typeof scanPage>>[] = [];
  let storageState: { cookies: any[]; origins: any[] } | undefined;

  if (config.requiresLogin) {
    // Phase 1: headed browser so the user can log in
    const headedBrowser = await pw.chromium.launch({ headless: false });
    const headedCtx = await headedBrowser.newContext();
    const loginPage = await headedCtx.newPage();
    await loginPage.goto(config.startUrl);

    const loginPageResult = await scanPage(loginPage);
    preLoginResults.push(loginPageResult);
    console.log(`  → Login page scanned: ${loginPageResult.violations.length} violations`);

    const signalFile = LOGIN_COMPLETE_FILE();
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
  const browser = await pw.chromium.launch({ headless: !config.watchMode });
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
}
