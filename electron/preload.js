// preload.js – runs in renderer context with Node access (limited)
// Exposes safe APIs to the renderer via contextBridge

const { contextBridge, ipcRenderer } = require('electron');
const { shell } = require('@electron/remote') || {};

// Polyfill: expose a simple openExternal so share/links still work
contextBridge.exposeInMainWorld('electronAPI', {
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  platform: process.platform,
  isElectron: true,
});
