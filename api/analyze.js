// api/analyze.js – NIMIYO API: Main media analysis endpoint
// Deploy to Vercel: https://vercel.com/new
//
// POST /api/analyze
// Body: { "url": "https://vm.tiktok.com/..." }
// Response: { success, platform, title, thumbnail, author, downloads[] }

import { scrapeTikTok } from './_scrapers/tiktok.js';
import { scrapeYouTube } from './_scrapers/youtube.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

function detectPlatform(url) {
  if (/tiktok\.com|vm\.tiktok|vt\.tiktok|douyin\.com/i.test(url)) return 'tiktok';
  if (/youtube\.com\/|youtu\.be\//i.test(url)) return 'youtube';
  return null;
}

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(204).end();
  }

  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed. Use POST.' });
  }

  let url;
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    url = body?.url?.trim();
  } catch {
    return res.status(400).json({ success: false, error: 'Invalid JSON body.' });
  }

  if (!url) {
    return res.status(400).json({ success: false, error: 'Missing "url" field.' });
  }

  const platform = detectPlatform(url);
  if (!platform) {
    return res.status(400).json({
      success: false,
      error: 'Platform tidak didukung. Hanya TikTok & YouTube yang tersedia.',
      supportedPlatforms: ['tiktok', 'youtube'],
    });
  }

  try {
    let result;
    if (platform === 'tiktok') {
      result = await scrapeTikTok(url);
    } else if (platform === 'youtube') {
      result = await scrapeYouTube(url);
    }

    return res.status(200).json({ success: true, platform, ...result });
  } catch (err) {
    console.error(`[${platform.toUpperCase()}] Error:`, err.message);
    return res.status(500).json({
      success: false,
      error: err.message || 'Internal server error.',
      platform,
    });
  }
}
