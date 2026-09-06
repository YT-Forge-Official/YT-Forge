// Preload for the offscreen PO-token window. It exposes exactly one thing:
// an HTTP bridge to the main process. Doing the requests there (via Electron's
// net module) keeps this window at default security settings — no disabled
// webSecurity, no host permissions — while still reaching Google's WAA API.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('__potBridge', {
  fetch: (url, init) => ipcRenderer.invoke('potoken:fetch', url, init),
});
