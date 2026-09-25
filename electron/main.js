const { app, BrowserWindow, shell, session, Menu, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

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

  // Allow F12 or Ctrl+Shift+I to toggle DevTools
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

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
  // Do not corrupt googlevideo or youtube requests to avoid 403 signature mismatches
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    if (!details.url.includes('googlevideo.com') && !details.url.includes('youtube.com')) {
      details.requestHeaders['User-Agent'] =
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
    }
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

// ─── Native yt-dlp IPC Handler ───────────────────────────────────────────────
ipcMain.handle('open-external', async (event, url) => {
  shell.openExternal(url);
  return true;
});

ipcMain.handle('analyze-media-ytdlp', async (event, targetUrl) => {
  return new Promise((resolve) => {
    try {
      const candidates = [
        path.join(process.resourcesPath, '..', 'bin', 'yt-dlp.exe'),
        path.join(process.resourcesPath, 'bin', 'yt-dlp.exe'),
        path.join(app.getAppPath(), '..', 'bin', 'yt-dlp.exe'),
        path.join(app.getAppPath(), 'bin', 'yt-dlp.exe'),
        path.join(__dirname, '..', 'bin', 'yt-dlp.exe'),
        path.join(process.cwd(), 'bin', 'yt-dlp.exe')
      ];

      let ytdlpBin = candidates.find(p => fs.existsSync(p));
      if (!ytdlpBin) {
        console.warn('yt-dlp binary not found in candidates:', candidates);
        return resolve({ success: false, error: 'yt-dlp binary not found' });
      }

      console.log('Using yt-dlp binary at:', ytdlpBin);

      const proc = spawn(ytdlpBin, [
        '-J',
        '--no-playlist',
        '--no-warnings',
        targetUrl
      ], {
        windowsHide: true
      });

      let stdoutData = '';
      let stderrData = '';

      proc.stdout.on('data', (d) => { stdoutData += d.toString(); });
      proc.stderr.on('data', (d) => { stderrData += d.toString(); });

      proc.on('close', (code) => {
        let info = null;
        if (stdoutData.trim()) {
          try {
            info = JSON.parse(stdoutData);
          } catch (e) {
            console.warn('JSON parse error from yt-dlp output:', e.message);
          }
        }

        if (!info) {
          console.warn('yt-dlp error:', stderrData || 'Exit code ' + code);
          return resolve({ success: false, error: stderrData || 'Extraction failed' });
        }

        try {
          const downloads = [];
          const seen = new Set();

          // 1. Muxed Video + Audio
          if (Array.isArray(info.formats)) {
            const muxed = info.formats.filter(f => f.url && f.vcodec !== 'none' && f.acodec !== 'none');
            for (const f of muxed.reverse()) {
              const q = f.format_note || (f.height ? `${f.height}p` : 'MP4');
              if (!seen.has(q)) {
                seen.add(q);
                downloads.push({
                  label: `Video MP4 (${q})`,
                  url: f.url,
                  type: 'video',
                  ext: f.ext || 'mp4',
                  quality: q,
                  size: f.filesize || f.filesize_approx || null
                });
              }
            }

            // Fallback video streams if no muxed formats found
            if (downloads.length === 0) {
              const videoStreams = info.formats.filter(f => f.url && f.vcodec !== 'none');
              for (const f of videoStreams.reverse()) {
                const q = f.format_note || (f.height ? `${f.height}p` : 'Video');
                if (!seen.has(q)) {
                  seen.add(q);
                  downloads.push({
                    label: `Video (${q})`,
                    url: f.url,
                    type: 'video',
                    ext: f.ext || 'mp4',
                    quality: q,
                    size: f.filesize || f.filesize_approx || null
                  });
                }
              }
            }

            // 2. Audio Only formats
            const audioOnly = info.formats.filter(f => f.url && f.vcodec === 'none' && f.acodec !== 'none');
            for (const f of audioOnly.reverse()) {
              const q = f.abr ? `${Math.round(f.abr)}kbps` : 'Audio';
              if (!seen.has(`audio-${q}`)) {
                seen.add(`audio-${q}`);
                downloads.push({
                  label: `Audio MP3/M4A (${q})`,
                  url: f.url,
                  type: 'audio',
                  ext: f.ext || 'mp3',
                  quality: q,
                  size: f.filesize || f.filesize_approx || null
                });
              }
            }
          }

          // Fallback single download link
          if (downloads.length === 0 && info.url) {
            downloads.push({
              label: 'Direct Media File',
              url: info.url,
              type: info.ext === 'mp3' || info.ext === 'm4a' ? 'audio' : 'video',
              ext: info.ext || 'mp4',
              quality: 'Direct'
            });
          }

          resolve({
            success: true,
            title: info.title || 'Media File',
            thumbnail: info.thumbnail || (info.thumbnails?.[0]?.url) || '',
            author: info.uploader || info.channel || '',
            description: info.description || '',
            downloads
          });
        } catch (e) {
          resolve({ success: false, error: e.message });
        }
      });
    } catch (err) {
      resolve({ success: false, error: err.message });
    }
  });
});

