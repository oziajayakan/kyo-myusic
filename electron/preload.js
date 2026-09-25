// preload.js – runs in renderer context with Node access (limited)
// Exposes safe APIs to the renderer via contextBridge

const { contextBridge, ipcRenderer } = require('electron');

// Polyfill: expose a simple openExternal and yt-dlp native analyzer
contextBridge.exposeInMainWorld('electronAPI', {
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  analyzeMedia: (url) => ipcRenderer.invoke('analyze-media-ytdlp', url),
  platform: process.platform,
  isElectron: true,
});
