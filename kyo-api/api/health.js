// api/health.js – Server health check endpoint
// GET /api/health → { status, version, timestamp, platforms }

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  return res.status(200).json({
    status: 'ok',
    service: 'KYO API Server',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    platforms: ['tiktok', 'youtube'],
    endpoints: {
      analyze: 'POST /api/analyze',
      health: 'GET /api/health',
    },
  });
}
