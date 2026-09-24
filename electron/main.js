const { app, BrowserWindow, shell, session, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

// ─── Window dimensions: 9:16 ratio ───────────────────────────────────────────
const WIN_WIDTH  = 430;
const WIN_HEIGHT = 932;

let mainWindow;

function createWindow() {
  // Disable menu bar for cleaner mobile-like look
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width:  WIN_WIDTH,
    height: WIN_HEIGHT,
    minWidth:  360,
    minHeight: 640,
    // Enforce the 9:16 aspect ratio
    aspectRatio: 9 / 16,
    resizable: true,
    center: true,
    title: 'KYO Downloader',
    icon: path.join(__dirname, '..', 'www', 'kyo_icon.webp'),
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,          // allow cross-origin fetch for media scraping
      allowRunningInsecureContent: true,
    },
  });

  // Load the app
  mainWindow.loadFile(path.join(__dirname, '..', 'www', 'index.html'));

  // Open external links in the default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const fileUrl = mainWindow.webContents.getURL();
    // Allow file:// protocol, block external navigation
    if (!url.startsWith('file://')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
}

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  // Spoof user agent so media sites don't block requests
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    details.requestHeaders['User-Agent'] =
      'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36';
    callback({ requestHeaders: details.requestHeaders });
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
