// Ad-hoc code-signs the packaged macOS .app.
//
// Two independent gates stand between a downloaded build and a running app:
//
//   1. AMFI (kernel, Apple Silicon only) requires every arm64 executable to
//      carry *some* valid signature. Unsigned arm64 binaries are SIGKILLed at
//      launch — before Gatekeeper is even consulted, and regardless of
//      quarantine. Our mac target is arm64-only, so every user hits this.
//   2. Gatekeeper (quarantined downloads) additionally requires a signature
//      chaining to an Apple-issued Developer ID, plus notarization.
//
// An ad-hoc signature ("--sign -", no identity) satisfies 1 and not 2. That is
// the whole benefit: the app becomes runnable, so `xattr -cr` alone is enough
// for a user to open it. Without this, `xattr -cr` clears Gatekeeper and the
// kernel still refuses — which makes the README's instructions fail.
// Clearing gate 2 requires the paid Apple Developer Program; nothing free
// reaches it, GitHub attestations and self-signed certs included.
//
// Runs as `afterPack`, not `afterSign`: electron-builder skips afterSign
// entirely when build.mac.identity is null, and afterPack lands before the
// dmg/zip are assembled, so the signature ships inside the artifacts.
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

export default async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  // Read the bundle name off disk rather than reconstructing it from
  // appInfo, so a productName change can't silently make this a no-op.
  const bundles = fs
    .readdirSync(context.appOutDir)
    .filter((name) => name.endsWith('.app'));

  if (bundles.length === 0) {
    console.warn('[adhoc-sign] no .app found in', context.appOutDir, '— skipping');
    return;
  }

  for (const bundle of bundles) {
    const appPath = path.join(context.appOutDir, bundle);
    try {
      // --deep is deprecated for Developer ID signing but remains the practical
      // way to ad-hoc sign an Electron bundle's nested helpers and frameworks.
      // No --options runtime: the hardened runtime without notarization buys
      // nothing here and can cause its own launch failures.
      execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], {
        stdio: 'inherit',
      });
      console.log(`[adhoc-sign] signed ${bundle}`);
    } catch (err) {
      // Deliberately non-fatal. A failure here should leave the release exactly
      // as good as it was before this hook existed — unsigned but present —
      // rather than taking down the whole macOS job and shipping no mac build.
      console.warn(`[adhoc-sign] FAILED for ${bundle}: ${err.message}`);
      console.warn('[adhoc-sign] macOS artifacts will be unsigned; arm64 users will need');
      console.warn('[adhoc-sign]   codesign --force --deep --sign - /Applications/"A11y Crawler".app');
    }
  }
}
