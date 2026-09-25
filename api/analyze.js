// api/analyze.js – KYO API (CommonJS, no external dependencies)
// Uses Node.js built-in https module only

const https = require('https');
const http = require('http');
const url_module = require('url');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

// ─── HTTP helper using built-in https/http ────────────────────────────────────
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
      reject(new Error('Request timeout'));
    }, options.timeout || 15000);

    var req = mod.request(reqOptions, function(res) {
      // Handle redirects
      if ((res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) && res.headers.location) {
        clearTimeout(timer);
        var redirectUrl = res.headers.location;
        if (!redirectUrl.startsWith('http')) {
          redirectUrl = parsed.protocol + '//' + parsed.hostname + redirectUrl;
        }
        return httpRequest(redirectUrl, options).then(resolve).catch(reject);
      }

      var chunks = [];
      res.on('data', function(chunk) { chunks.push(chunk); });
      res.on('end', function() {
        clearTimeout(timer);
        var body = Buffer.concat(chunks).toString('utf8');
        resolve({ status: res.statusCode, headers: res.headers, body: body, finalUrl: urlStr });
      });
      res.on('error', function(e) { clearTimeout(timer); reject(e); });
    });

    req.on('error', function(e) { clearTimeout(timer); reject(e); });

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

// ─── Platform detection ────────────────────────────────────────────────────────
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

// ─── TikTok scraper via tikwm.com ─────────────────────────────────────────────
async function scrapeTikTok(videoUrl) {
  var UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36';

  // Resolve short URLs
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

  if (!json || json.code !== 0 || !json.data) {
    throw new Error((json && json.msg) || 'tikwm.com: gagal mengambil data video');
  }

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

  if (downloads.length === 0) throw new Error('Tidak ada link download yang ditemukan');

  return {
    title: d.title || 'TikTok Video',
    thumbnail: d.cover || d.origin_cover || '',
    author: (d.author && (d.author.nickname || d.author.unique_id)) || 'TikTok',
    duration: d.duration || null,
    downloads: downloads,
  };
}

// ─── YouTube scraper via YouTube Android Player API ───────────────────────────
async function scrapeYouTube(videoUrl) {
  var videoId = extractYouTubeId(videoUrl);
  if (!videoId) throw new Error('URL YouTube tidak valid');

  var UA_ANDROID = 'com.google.android.youtube/17.36.4 (Linux; U; Android 11) gzip';

  var payload = JSON.stringify({
    videoId: videoId,
    context: {
      client: {
        clientName: 'ANDROID_TESTSUITE',
        clientVersion: '1.9',
        androidSdkVersion: 30,
        userAgent: UA_ANDROID,
        hl: 'en',
        timeZone: 'UTC',
        utcOffsetMinutes: 0,
      },
    },
  });

  var ytRes = await httpRequest('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
    method: 'POST',
    timeout: 15000,
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': UA_ANDROID,
      'X-Youtube-Client-Name': '30',
      'X-Youtube-Client-Version': '17.36.4',
      'Content-Length': Buffer.byteLength(payload),
    },
    body: payload,
  });

  if (ytRes.status !== 200) throw new Error('YouTube API returned HTTP ' + ytRes.status);

  var data;
  try { data = JSON.parse(ytRes.body); } catch (e) { throw new Error('YouTube API returned invalid JSON'); }

  var videoDetails = data && data.videoDetails;
  var streamData = data && data.streamingData;
  var streamFormats = [].concat(
    (streamData && streamData.formats) || [],
    (streamData && streamData.adaptiveFormats) || []
  ).filter(function(f) { return f && f.url; });

  if (!streamFormats.length) {
    // Try Invidious fallback
    return scrapeYouTubeInvidious(videoId);
  }

  var downloads = [];
  var seen = {};

  // Muxed (video + audio)
  var muxed = streamFormats
    .filter(function(f) { return f.mimeType && f.mimeType.indexOf('video') === 0 && f.audioQuality; })
    .sort(function(a, b) { return (b.height || 0) - (a.height || 0); });

  muxed.forEach(function(f) {
    var q = f.qualityLabel || (f.height ? f.height + 'p' : 'SD');
    if (seen[q]) return;
    seen[q] = true;
    downloads.push({ label: 'Video MP4 (' + q + ')', url: f.url, type: 'video', ext: 'mp4', quality: q });
  });

  // Audio only
  var audioOnly = streamFormats
    .filter(function(f) { return f.mimeType && f.mimeType.indexOf('audio') === 0; })
    .sort(function(a, b) { return (b.bitrate || 0) - (a.bitrate || 0); });

  audioOnly.slice(0, 3).forEach(function(f) {
    var bitrate = f.averageBitrate ? Math.round(f.averageBitrate / 1000) + 'kbps' : 'audio';
    var isM4a = f.mimeType && f.mimeType.indexOf('mp4a') !== -1;
    downloads.push({ label: 'Audio ' + (isM4a ? 'M4A' : 'WebM') + ' (' + bitrate + ')', url: f.url, type: 'audio', ext: isM4a ? 'm4a' : 'webm', quality: bitrate });
  });

  if (!downloads.length) return scrapeYouTubeInvidious(videoId);

  var thumbnails = (videoDetails && videoDetails.thumbnail && videoDetails.thumbnail.thumbnails) || [];
  thumbnails.sort(function(a, b) { return (b.width || 0) - (a.width || 0); });
  var thumb = (thumbnails[0] && thumbnails[0].url) || ('https://img.youtube.com/vi/' + videoId + '/maxresdefault.jpg');

  return {
    title: (videoDetails && videoDetails.title) || 'YouTube Video',
    thumbnail: thumb,
    author: (videoDetails && videoDetails.author) || 'YouTube',
    duration: (videoDetails && videoDetails.lengthSeconds) ? parseInt(videoDetails.lengthSeconds) : null,
    downloads: downloads,
  };
}

// ─── Invidious fallback ───────────────────────────────────────────────────────
async function scrapeYouTubeInvidious(videoId) {
  var instances = [
    'invidious.privacyredirect.com',
    'yt.artemislena.eu',
    'invidious.nerdvpn.de',
  ];
  var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36';

  for (var i = 0; i < instances.length; i++) {
    try {
      var res = await httpRequest('https://' + instances[i] + '/api/v1/videos/' + videoId, {
        method: 'GET',
        timeout: 8000,
        headers: { 'User-Agent': UA },
      });
      if (res.status !== 200) continue;

      var data = JSON.parse(res.body);
      if (!data || (!data.formatStreams && !data.adaptiveFormats)) continue;

      var downloads = [];
      var seen = {};

      (data.formatStreams || []).forEach(function(f) {
        if (!f.url) return;
        var q = f.qualityLabel || f.quality || 'SD';
        if (seen[q]) return;
        seen[q] = true;
        downloads.push({ label: 'Video MP4 (' + q + ')', url: f.url, type: 'video', ext: 'mp4', quality: q });
      });

      var audioFormats = (data.adaptiveFormats || [])
        .filter(function(f) { return f.type && f.type.indexOf('audio') === 0 && f.url; })
        .sort(function(a, b) { return (b.bitrate || 0) - (a.bitrate || 0); });

      audioFormats.slice(0, 2).forEach(function(f) {
        var bitrate = f.bitrate ? Math.round(f.bitrate / 1000) + 'kbps' : 'audio';
        downloads.push({ label: 'Audio M4A (' + bitrate + ')', url: f.url, type: 'audio', ext: 'm4a', quality: bitrate });
      });

      if (downloads.length > 0) {
        return {
          title: data.title || 'YouTube Video',
          thumbnail: 'https://img.youtube.com/vi/' + videoId + '/maxresdefault.jpg',
          author: data.author || 'YouTube',
          duration: data.lengthSeconds || null,
          downloads: downloads,
        };
      }
    } catch (_) {}
  }

  throw new Error('Tidak dapat mengekstrak link YouTube. Coba lagi nanti.');
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
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (_) {}
    }
    url = (body && body.url) || null;
    if (typeof url === 'string') url = url.trim();
  } catch (_) { url = null; }

  if (!url) {
    return res.status(400).json({ success: false, error: 'Missing "url" field.' });
  }

  var platform = detectPlatform(url);
  if (!platform) {
    return res.status(400).json({
      success: false,
      error: 'Platform tidak didukung. Hanya TikTok & YouTube.',
      supportedPlatforms: ['tiktok', 'youtube'],
    });
  }

  try {
    var result;
    if (platform === 'tiktok') {
      result = await scrapeTikTok(url);
    } else {
      result = await scrapeYouTube(url);
    }
    return res.status(200).json({ success: true, platform: platform, title: result.title, thumbnail: result.thumbnail, author: result.author, duration: result.duration, downloads: result.downloads });
  } catch (err) {
    console.error('[' + platform + '] Error:', err.message);
    return res.status(200).json({ success: false, error: err.message, platform: platform });
  }
};
