// api/debug-yt.js – Temporary debug endpoint to diagnose YouTube API issues
const https = require('https');
const http = require('http');
const url_module = require('url');

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
      reject(new Error('Timeout after ' + (options.timeout || 10000) + 'ms'));
    }, options.timeout || 10000);

    var req = mod.request(reqOptions, function(res) {
      var chunks = [];
      res.on('data', function(c) { chunks.push(c); });
      res.on('end', function() {
        clearTimeout(timer);
        var body = Buffer.concat(chunks).toString('utf8');
        resolve({ status: res.statusCode, body: body });
      });
      res.on('error', function(e) { clearTimeout(timer); reject(e); });
    });
    req.on('error', function(e) { clearTimeout(timer); reject(e); });
    if (options.body) req.write(options.body);
    req.end();
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  var videoId = 'jNQXAC9IVRw'; // "Me at the Zoo"
  var results = [];

  // Test Piped instances
  var pipedInstances = [
    'pipedapi.kavin.rocks',
    'pipedapi.adminforge.de',
    'piped-api.garudalinux.org',
    'api.piped.yt',
  ];

  for (var i = 0; i < pipedInstances.length; i++) {
    var inst = pipedInstances[i];
    var t0 = Date.now();
    try {
      var r = await httpRequest('https://' + inst + '/streams/' + videoId, {
        method: 'GET',
        timeout: 8000,
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      var preview = r.body.substring(0, 200);
      results.push({ type: 'piped', instance: inst, status: r.status, ms: Date.now() - t0, preview: preview });
    } catch (e) {
      results.push({ type: 'piped', instance: inst, error: e.message, ms: Date.now() - t0 });
    }
  }

  // Test one Invidious instance
  var t1 = Date.now();
  try {
    var r2 = await httpRequest('https://inv.nadeko.net/api/v1/videos/' + videoId, {
      method: 'GET', timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    results.push({ type: 'invidious', instance: 'inv.nadeko.net', status: r2.status, ms: Date.now() - t1, preview: r2.body.substring(0, 200) });
  } catch (e) {
    results.push({ type: 'invidious', instance: 'inv.nadeko.net', error: e.message, ms: Date.now() - t1 });
  }

  // Test YouTube directly
  var t2 = Date.now();
  try {
    var payload = JSON.stringify({ videoId: videoId, context: { client: { clientName: 'IOS', clientVersion: '19.29.1', hl: 'en' } } });
    var r3 = await httpRequest('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
      method: 'POST', timeout: 8000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X)',
        'X-Youtube-Client-Name': '5',
        'X-Youtube-Client-Version': '19.29.1',
        'Content-Length': Buffer.byteLength(payload),
      },
      body: payload,
    });
    var parsed3 = {};
    try { parsed3 = JSON.parse(r3.body); } catch (_) {}
    results.push({
      type: 'youtube-ios',
      status: r3.status,
      ms: Date.now() - t2,
      hasStreamingData: !!(parsed3 && parsed3.streamingData),
      formatsCount: (parsed3 && parsed3.streamingData && (parsed3.streamingData.formats || []).length) || 0,
      error: parsed3 && parsed3.error ? JSON.stringify(parsed3.error) : null,
      playabilityStatus: parsed3 && parsed3.playabilityStatus ? parsed3.playabilityStatus.status : null,
    });
  } catch (e) {
    results.push({ type: 'youtube-ios', error: e.message, ms: Date.now() - t2 });
  }

  return res.status(200).json({ videoId: videoId, results: results });
};
