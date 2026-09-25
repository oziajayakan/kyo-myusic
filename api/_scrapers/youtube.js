// api/_scrapers/youtube.js – YouTube scraper (CommonJS)
// Multi-method fallback: YouTube Android Player API → Invidious → cobalt.tools
// No API keys required

const UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36';

/**
 * Extract YouTube video ID from URL
 */
function extractYouTubeId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([A-Za-z0-9_-]{11})/,
    /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

/**
 * Get YouTube metadata via noembed (no API key needed)
 */
async function getYouTubeMeta(url, videoId) {
  try {
    const res = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      return {
        title: data.title || 'YouTube Video',
        author: data.author_name || 'YouTube',
        thumbnail: data.thumbnail_url || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      };
    }
  } catch (_) {}
  return {
    title: 'YouTube Video',
    author: 'YouTube',
    thumbnail: videoId ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg` : '',
  };
}

/**
 * Method 1: YouTube internal Android player API (most reliable, no key needed)
 */
async function tryYouTubeDirectApi(url, videoId) {
  try {
    const payload = {
      videoId,
      context: {
        client: {
          clientName: 'ANDROID_TESTSUITE',
          clientVersion: '1.9',
          androidSdkVersion: 30,
          userAgent: 'com.google.android.youtube/17.36.4 (Linux; U; Android 11) gzip',
          hl: 'en',
          timeZone: 'UTC',
          utcOffsetMinutes: 0,
        },
      },
    };

    const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'com.google.android.youtube/17.36.4 (Linux; U; Android 11) gzip',
        'X-Youtube-Client-Name': '30',
        'X-Youtube-Client-Version': '17.36.4',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) return null;
    const data = await res.json();

    const videoDetails = data?.videoDetails;
    const streamFormats = [
      ...(data?.streamingData?.formats || []),
      ...(data?.streamingData?.adaptiveFormats || []),
    ].filter(f => f.url);

    if (!streamFormats.length) return null;

    const downloads = [];
    const seen = new Set();

    // Muxed video+audio
    const muxed = streamFormats
      .filter(f => f.mimeType?.startsWith('video') && f.audioQuality)
      .sort((a, b) => (b.height || 0) - (a.height || 0));

    for (const f of muxed) {
      const q = f.qualityLabel || `${f.height}p`;
      if (seen.has(q)) continue;
      seen.add(q);
      downloads.push({
        label: `Video MP4 (${q})`,
        url: f.url,
        type: 'video',
        ext: 'mp4',
        quality: q,
        size: f.contentLength ? parseInt(f.contentLength) : null,
      });
    }

    // Audio only
    const audioOnly = streamFormats
      .filter(f => f.mimeType?.startsWith('audio'))
      .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

    for (const f of audioOnly.slice(0, 3)) {
      const bitrate = f.averageBitrate ? `${Math.round(f.averageBitrate / 1000)}kbps` : 'audio';
      const isM4a = f.mimeType?.includes('mp4a');
      downloads.push({
        label: `Audio ${isM4a ? 'M4A' : 'WebM'} (${bitrate})`,
        url: f.url,
        type: 'audio',
        ext: isM4a ? 'm4a' : 'webm',
        quality: bitrate,
      });
    }

    if (!downloads.length) return null;

    const thumbnails = videoDetails?.thumbnail?.thumbnails || [];
    const bestThumb = thumbnails.sort((a, b) => (b.width || 0) - (a.width || 0))[0]?.url
      || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

    return {
      title: videoDetails?.title || 'YouTube Video',
      thumbnail: bestThumb,
      author: videoDetails?.author || 'YouTube',
      duration: videoDetails?.lengthSeconds ? parseInt(videoDetails.lengthSeconds) : null,
      downloads,
    };
  } catch (_) {
    return null;
  }
}

/**
 * Method 2: Invidious open-source YouTube proxy instances
 */
async function tryInvidious(url, videoId) {
  const instances = [
    'https://invidious.privacyredirect.com',
    'https://yt.artemislena.eu',
    'https://invidious.lunar.icu',
    'https://invidious.nerdvpn.de',
    'https://iv.datura.network',
  ];

  for (const instance of instances) {
    try {
      const res = await fetch(`${instance}/api/v1/videos/${videoId}`, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (!data || (!data.formatStreams && !data.adaptiveFormats)) continue;

      const downloads = [];
      const seen = new Set();

      // Muxed (legacy format streams)
      for (const f of (data.formatStreams || [])) {
        if (!f.url) continue;
        const q = f.qualityLabel || f.quality || 'SD';
        if (seen.has(q)) continue;
        seen.add(q);
        downloads.push({ label: `Video MP4 (${q})`, url: f.url, type: 'video', ext: 'mp4', quality: q });
      }

      // Audio only
      const audioFormats = (data.adaptiveFormats || [])
        .filter(f => f.type?.startsWith('audio') && f.url)
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

      for (const f of audioFormats.slice(0, 2)) {
        const bitrate = f.bitrate ? `${Math.round(f.bitrate / 1000)}kbps` : 'audio';
        downloads.push({ label: `Audio M4A (${bitrate})`, url: f.url, type: 'audio', ext: 'm4a', quality: bitrate });
      }

      if (downloads.length > 0) {
        return {
          title: data.title || 'YouTube Video',
          thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
          author: data.author || 'YouTube',
          duration: data.lengthSeconds || null,
          downloads,
        };
      }
    } catch (_) {}
  }
  return null;
}

/**
 * Method 3: cobalt.tools free API
 */
async function tryCobalt(url, videoId) {
  const endpoints = [
    'https://api.cobalt.tools',
    'https://cobalt.api.li',
  ];

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(`${endpoint}/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': UA,
        },
        body: JSON.stringify({
          url,
          downloadMode: 'auto',
          videoQuality: '1080',
          audioFormat: 'mp3',
          audioBitrate: '128',
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) continue;
      const data = await res.json();
      if (!data || data.status === 'error' || data.status === 'rate-limit') continue;

      const downloads = [];
      if (data.status === 'stream' && data.url) {
        downloads.push({ label: 'Video MP4 (Best)', url: data.url, type: 'video', ext: 'mp4', quality: 'best' });
      } else if (data.status === 'picker' && Array.isArray(data.picker)) {
        for (const item of data.picker) {
          downloads.push({
            label: item.type === 'video' ? 'Video MP4' : 'Audio',
            url: item.url,
            type: item.type === 'video' ? 'video' : 'audio',
            ext: item.type === 'video' ? 'mp4' : 'mp3',
            quality: item.quality || 'best',
          });
        }
      }

      if (downloads.length > 0) {
        const meta = await getYouTubeMeta(url, videoId);
        return { ...meta, downloads };
      }
    } catch (_) {}
  }
  return null;
}

/**
 * Main YouTube scraper — tries multiple methods with fallback
 */
async function scrapeYouTube(url) {
  const videoId = extractYouTubeId(url);
  if (!videoId) throw new Error('URL YouTube tidak valid atau tidak didukung');

  // Method 1: YouTube internal Android player API
  const directResult = await tryYouTubeDirectApi(url, videoId);
  if (directResult && directResult.downloads.length > 0) return directResult;

  // Method 2: Invidious
  const invResult = await tryInvidious(url, videoId);
  if (invResult && invResult.downloads.length > 0) return invResult;

  // Method 3: cobalt.tools
  const cobaltResult = await tryCobalt(url, videoId);
  if (cobaltResult && cobaltResult.downloads.length > 0) return cobaltResult;

  throw new Error('Tidak dapat mengekstrak download link. Semua server gagal. Coba link lain.');
}

module.exports = { scrapeYouTube };
