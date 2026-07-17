const { contextBridge } = require('electron');

// The UI is a standard Next.js web app that talks to its own /api routes over
// same-origin fetch, so it needs no privileged bridge today. Expose only a tiny,
// read-only marker so renderer code can detect it's running inside the desktop
// shell if it ever needs to.
contextBridge.exposeInMainWorld('a11yDesktop', {
  isElectron: true,
  platform: process.platform,
});
