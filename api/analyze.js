// api/analyze.js – KYO API: Main media analysis endpoint (CommonJS)
// POST /api/analyze
// Body: { "url": "https://vm.tiktok.com/..." }

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

function detectPlatform(url) {
  if (!url || typeof url !== 'string') return null;
  var u = url.toLowerCase();
  if (/tiktok\.com|vm\.tiktok|vt\.tiktok|douyin\.com/.test(u)) return 'tiktok';
  if (/youtube\.com\/|youtu\.be\/|youtube\.com\/shorts/.test(u)) return 'youtube';
  return null;
}

module.exports = async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    Object.entries(CORS_HEADERS).forEach(function(e) { res.setHeader(e[0], e[1]); });
    return res.status(204).end();
  }

  Object.entries(CORS_HEADERS).forEach(function(e) { res.setHeader(e[0], e[1]); });

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed. Use POST.' });
  }

  var url;
  try {
    var body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (_) {}
    }
    url = (body && body.url) || (typeof req.query.url === 'string' ? req.query.url : null);
    if (typeof url === 'string') url = url.trim();
  } catch (e) {
    url = null;
  }

  if (!url) {
    return res.status(400).json({ success: false, error: 'Missing "url" field.' });
  }

  var platform = detectPlatform(url);
  if (!platform) {
    return res.status(400).json({
      success: false,
      error: 'Platform tidak didukung. Hanya TikTok & YouTube yang tersedia.',
      supportedPlatforms: ['tiktok', 'youtube'],
    });
  }

  try {
    var scraper;
    if (platform === 'tiktok') {
      scraper = require('./_scrapers/tiktok.js');
      var result = await scraper.scrapeTikTok(url);
      return res.status(200).json({ success: true, platform: platform, title: result.title, thumbnail: result.thumbnail, author: result.author, duration: result.duration, downloads: result.downloads });
    } else if (platform === 'youtube') {
      scraper = require('./_scrapers/youtube.js');
      var result = await scraper.scrapeYouTube(url);
      return res.status(200).json({ success: true, platform: platform, title: result.title, thumbnail: result.thumbnail, author: result.author, duration: result.duration, downloads: result.downloads });
    }
  } catch (err) {
    console.error('[' + platform.toUpperCase() + '] Error:', err.message, err.stack);
    return res.status(200).json({
      success: false,
      error: err.message || 'Internal server error.',
      platform: platform,
    });
  }
};
