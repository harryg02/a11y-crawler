import { test } from '@playwright/test';

test('preflight', async ({ page }) => {
  await page.goto('about:blank');
});
