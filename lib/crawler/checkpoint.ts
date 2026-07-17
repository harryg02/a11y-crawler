import fs from 'fs';
import type { Page } from '@playwright/test';
import { PAUSE_FILE as pauseFile, STOP_FILE as stopFile } from '../paths';

export const PAUSE_FILE = pauseFile();
export const STOP_FILE = stopFile();

export async function checkpoint(page: Page): Promise<'continue' | 'stop'> {
  // 1. Check stop first
  if (fs.existsSync(STOP_FILE)) {
    console.log('  → Stopped by user');
    return 'stop';
  }

  // 2. If paused, wait until resumed
  if (fs.existsSync(PAUSE_FILE)) {
    console.log('  → PAUSED (waiting for resume)');
    while (fs.existsSync(PAUSE_FILE)) {
      // While waiting, also check for stop (user might stop while paused)
      if (fs.existsSync(STOP_FILE)) {
        console.log('  → Stopped by user while paused');
        return 'stop';
      }
      await page.waitForTimeout(500);
    }
    console.log('  → RESUMED');
  }

  return 'continue';
}
