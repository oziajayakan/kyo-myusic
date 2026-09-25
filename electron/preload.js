// preload.js – runs in renderer context with Node access (limited)
// Exposes safe APIs to the renderer via contextBridge

const { contextBridge, ipcRenderer } = require('electron');

// Polyfill: expose a simple openExternal and yt-dlp native analyzer
contextBridge.exposeInMainWorld('electronAPI', {
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  analyzeMedia: (url) => ipcRenderer.invoke('analyze-media-ytdlp', url),
  selectDownloadDir: () => ipcRenderer.invoke('select-download-dir'),
  getDefaultDownloadDir: () => ipcRenderer.invoke('get-default-download-dir'),
  openDownloadDir: (dir) => ipcRenderer.invoke('open-download-dir', dir),
  saveDownloadBuffer: (payload) => ipcRenderer.invoke('save-download-buffer', payload),
  setDownloadPath: (dir) => ipcRenderer.invoke('set-download-path', dir),
  platform: process.platform,
  isElectron: true,
});
