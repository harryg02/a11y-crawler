import fs from 'fs';
import { PAUSE_FILE as pauseFile, STOP_FILE as stopFile } from '../paths';

export const PAUSE_FILE = pauseFile();
export const STOP_FILE = stopFile();

/**
 * Poll the pause/stop signal files between units of work.
 *
 * Deliberately touches nothing but the filesystem. This used to wait with
 * `page.waitForTimeout(500)`, which reads as a local sleep but is a round trip
 * to the browser — playwright-core routes it through `frame.waitForTimeout` on
 * the protocol channel. That made a *parked* crawl the most fragile state in
 * the system: it polled a live CDP connection twice a second, and parking is
 * exactly what we do when the machine is about to suspend. Chromium freezes,
 * the socket resets, and the wait throws on wake.
 *
 * With a plain timer a parked crawl is inert. It holds no connection, so it
 * sleeps and wakes without noticing, which is the whole point of parking it.
 */
export async function checkpoint(): Promise<'continue' | 'stop'> {
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
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    console.log('  → RESUMED');
  }

  return 'continue';
}
