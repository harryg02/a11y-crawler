/** @type {import('next').NextConfig} */
const nextConfig = {
  // Emit a self-contained server bundle (.next/standalone) so the packaged
  // Electron app can run `node server.js` without the full project/node_modules.
  output: 'standalone',
  // better-sqlite3 is a native addon; keep it out of the server bundle and load
  // it from node_modules at runtime (electron-builder rebuilds it for Electron).
  serverExternalPackages: ['better-sqlite3'],
  // The Electron window loads the app over the 127.0.0.1 origin. Next's dev
  // server only trusts `localhost` by default and rejects the HMR WebSocket from
  // other origins, which stalls hydration (buttons stop responding). Allow
  // 127.0.0.1 so dev works in the Electron window (and in a browser at
  // 127.0.0.1). Ignored in production, so the packaged build is unaffected.
  allowedDevOrigins: ['127.0.0.1'],
};

export default nextConfig;
