const https = require('https');
const fs = require('fs');
const path = require('path');

const binDir = path.join(__dirname, 'bin');
if (!fs.existsSync(binDir)) {
  fs.mkdirSync(binDir, { recursive: true });
}

const dest = path.join(binDir, 'yt-dlp.exe');

function download(url) {
  console.log('Downloading from:', url);
  https.get(url, (res) => {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      console.log('Redirecting to:', res.headers.location);
      return download(res.headers.location);
    }
    if (res.statusCode !== 200) {
      console.error('Failed to download, status code:', res.statusCode);
      process.exit(1);
    }
    const fileStream = fs.createWriteStream(dest);
    let downloaded = 0;
    const total = parseInt(res.headers['content-length'] || '0', 10);
    res.on('data', (chunk) => {
      downloaded += chunk.length;
      if (total > 0 && downloaded % (1024 * 1024 * 5) < chunk.length) {
        console.log(`Progress: ${(downloaded / 1024 / 1024).toFixed(1)} MB / ${(total / 1024 / 1024).toFixed(1)} MB`);
      }
    });
    res.pipe(fileStream);
    fileStream.on('finish', () => {
      fileStream.close();
      console.log('Successfully downloaded yt-dlp.exe!');
    });
  }).on('error', (err) => {
    console.error('Download error:', err.message);
    process.exit(1);
  });
}

download('https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe');
