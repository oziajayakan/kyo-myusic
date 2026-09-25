// api/analyze.js – KYO API (CommonJS, zero external dependencies)
// Uses Node.js built-in https/http/url modules only
// TikTok: tikwm.com API (reliable)
// YouTube: noembed metadata + external downloader links (YouTube blocks serverless IPs)

const https = require('https');
const http = require('http');
const url_module = require('url');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

// ─── HTTP helper (built-in only, no node-fetch) ───────────────────────────────
function httpRequest(urlStr, options) {
  return new Promise(function(resolve, reject) {
    var parsed = url_module.parse(urlStr);
    var isHttps = parsed.protocol === 'https:';
    var mod = isHttps ? https : http;

    var reqOptions = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.path || '/',
      method: options.method || 'GET',
      headers: options.headers || {},
    };

    var timer = setTimeout(function() {
      req.destroy();
      reject(new Error('Timeout'));
    }, options.timeout || 12000);

    var req = mod.request(reqOptions, function(res) {
      // Follow redirects
      if ((res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) && res.headers.location) {
        clearTimeout(timer);
        var loc = res.headers.location;
        if (!loc.startsWith('http')) loc = parsed.protocol + '//' + parsed.hostname + loc;
        return httpRequest(loc, Object.assign({}, options, { body: undefined, method: 'GET' })).then(resolve).catch(reject);
      }
      var chunks = [];
      res.on('data', function(c) { chunks.push(c); });
      res.on('end', function() {
        clearTimeout(timer);
        resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') });
      });
      res.on('error', function(e) { clearTimeout(timer); reject(e); });
    });
    req.on('error', function(e) { clearTimeout(timer); reject(e); });
    if (options.body) req.write(options.body);
    req.end();
  });
}

// ─── Platform detection ───────────────────────────────────────────────────────
function detectPlatform(url) {
  if (!url || typeof url !== 'string') return null;
  var u = url.toLowerCase();
  if (/tiktok\.com|vm\.tiktok|vt\.tiktok|douyin\.com/.test(u)) return 'tiktok';
  if (/youtube\.com\/watch|youtu\.be\/|youtube\.com\/shorts/.test(u)) return 'youtube';
  return null;
}

// ─── YouTube video ID extractor ───────────────────────────────────────────────
function extractYouTubeId(url) {
  var patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([A-Za-z0-9_-]{11})/,
    /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/,
  ];
  for (var i = 0; i < patterns.length; i++) {
    var m = url.match(patterns[i]);
    if (m) return m[1];
  }
  return null;
}

// ─── TikTok scraper via tikwm.com (free public API) ──────────────────────────
async function scrapeTikTok(videoUrl) {
  var UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36';

  // Resolve short URLs first
  var resolvedUrl = videoUrl;
  if (/vm\.tiktok\.com|vt\.tiktok\.com/i.test(videoUrl)) {
    try {
      var headRes = await httpRequest(videoUrl, { method: 'GET', timeout: 8000, headers: { 'User-Agent': UA } });
      if (headRes.finalUrl && headRes.finalUrl !== videoUrl) resolvedUrl = headRes.finalUrl;
    } catch (_) {}
  }

  var formBody = 'url=' + encodeURIComponent(resolvedUrl) + '&hd=1';
  var tikwmRes = await httpRequest('https://www.tikwm.com/api/', {
    method: 'POST',
    timeout: 15000,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': UA,
      'Referer': 'https://www.tikwm.com/',
      'Origin': 'https://www.tikwm.com',
      'Content-Length': Buffer.byteLength(formBody),
    },
    body: formBody,
  });

  if (tikwmRes.status !== 200) throw new Error('tikwm.com returned HTTP ' + tikwmRes.status);

  var json;
  try { json = JSON.parse(tikwmRes.body); } catch (e) { throw new Error('tikwm.com returned invalid JSON'); }
  if (!json || json.code !== 0 || !json.data) throw new Error((json && json.msg) || 'tikwm.com gagal');

  var d = json.data;
  var downloads = [];

  if (d.hdplay) downloads.push({ label: 'Video HD (No Watermark)', url: d.hdplay, type: 'video', ext: 'mp4', quality: 'hd' });
  if (d.play)   downloads.push({ label: 'Video (No Watermark)', url: d.play, type: 'video', ext: 'mp4', quality: 'sd' });
  if (d.wmplay) downloads.push({ label: 'Video (With Watermark)', url: d.wmplay, type: 'video', ext: 'mp4', quality: 'wm' });
  if (d.music)  downloads.push({ label: 'Audio MP3 – ' + ((d.music_info && d.music_info.title) || 'Musik'), url: d.music, type: 'audio', ext: 'mp3', quality: 'audio' });

  if (Array.isArray(d.images) && d.images.length > 0) {
    d.images.forEach(function(imgUrl, i) {
      downloads.push({ label: 'Foto ' + (i + 1) + '/' + d.images.length, url: imgUrl, type: 'image', ext: 'jpg', quality: 'image' });
    });
  }

  if (downloads.length === 0) throw new Error('Tidak ada link download TikTok');

  return {
    title: d.title || 'TikTok Video',
    thumbnail: d.cover || d.origin_cover || '',
    author: (d.author && (d.author.nickname || d.author.unique_id)) || 'TikTok',
    duration: d.duration || null,
    downloads: downloads,
  };
}

// ─── YouTube: metadata via noembed + curated external downloader links ─────────
// NOTE: YouTube actively blocks all serverless/cloud IPs from extracting streams.
//       In the Electron app, native yt-dlp handles YouTube directly (works perfectly).
//       This API fallback returns metadata + reliable external downloader links.
async function scrapeYouTube(videoUrl) {
  var videoId = extractYouTubeId(videoUrl);
  if (!videoId) throw new Error('URL YouTube tidak valid');

  var title = 'YouTube Video';
  var thumbnail = 'https://img.youtube.com/vi/' + videoId + '/maxresdefault.jpg';
  var author = 'YouTube';

  // Get metadata from noembed (always works, no auth)
  try {
    var metaRes = await httpRequest('https://noembed.com/embed?url=' + encodeURIComponent(videoUrl), {
      method: 'GET',
      timeout: 6000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    if (metaRes.status === 200) {
      var meta;
      try { meta = JSON.parse(metaRes.body); } catch (_) {}
      if (meta && !meta.error) {
        if (meta.title) title = meta.title;
        if (meta.author_name) author = meta.author_name;
        if (meta.thumbnail_url) thumbnail = meta.thumbnail_url;
      }
    }
  } catch (_) {}

  var enc = encodeURIComponent(videoUrl);
  var downloads = [
    { label: '⬇️ Download via cobalt.tools', url: 'https://cobalt.tools/?u=' + enc, type: 'video', ext: 'mp4', quality: 'best', isExternal: true },
    { label: '⬇️ Download via SaveFrom.net', url: 'https://en.savefrom.net/#url=' + enc, type: 'video', ext: 'mp4', quality: 'best', isExternal: true },
    { label: '🎵 Audio MP3 via ytmp3.cc', url: 'https://ytmp3.cc/en13/youtube-mp3/?u=' + enc, type: 'audio', ext: 'mp3', quality: 'audio', isExternal: true },
  ];

  return { title: title, thumbnail: thumbnail, author: author, duration: null, downloads: downloads };
}

// ─── Main handler ─────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    Object.keys(CORS_HEADERS).forEach(function(k) { res.setHeader(k, CORS_HEADERS[k]); });
    return res.status(204).end();
  }

  Object.keys(CORS_HEADERS).forEach(function(k) { res.setHeader(k, CORS_HEADERS[k]); });

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed. Use POST.' });
  }

  var url;
  try {
    var body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) {} }
    url = (body && body.url) || null;
    if (typeof url === 'string') url = url.trim();
  } catch (_) { url = null; }

  if (!url) return res.status(400).json({ success: false, error: 'Missing "url" field.' });

  var platform = detectPlatform(url);
  if (!platform) {
    return res.status(400).json({ success: false, error: 'Platform tidak didukung. Hanya TikTok & YouTube.', supportedPlatforms: ['tiktok', 'youtube'] });
  }

  try {
    var result;
    if (platform === 'tiktok') result = await scrapeTikTok(url);
    else result = await scrapeYouTube(url);

    return res.status(200).json({
      success: true,
      platform: platform,
      title: result.title,
      thumbnail: result.thumbnail,
      author: result.author,
      duration: result.duration,
      downloads: result.downloads,
    });
  } catch (err) {
    console.error('[' + platform + '] Error:', err.message);
    return res.status(200).json({ success: false, error: err.message, platform: platform });
  }
};
