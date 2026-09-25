// api/_scrapers/youtube.js – YouTube scraper via multiple free APIs
// Strategy: cobalt.tools API → yt-api.p.duti → noembed fallback
// No API key needed, all public

const UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36';

/**
 * Extract YouTube video ID from URL
 */
function extractYouTubeId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([A-Za-z0-9_-]{11})/,
    /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

/**
 * Method 1: cobalt.tools – free open source downloader API
 */
async function tryCobalt(url) {
  const cobaltEndpoints = [
    'https://api.cobalt.tools',
    'https://cobalt.api.li',
  ];

  for (const endpoint of cobaltEndpoints) {
    try {
      const res = await fetch(`${endpoint}/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': UA,
        },
        body: JSON.stringify({
          url: url,
          downloadMode: 'auto',
          videoQuality: '1080',
          audioFormat: 'mp3',
          audioBitrate: '128',
        }),
      });

      if (!res.ok) continue;
      const data = await res.json();
      if (!data || data.status === 'error' || data.status === 'rate-limit') continue;

      const downloads = [];

      if (data.status === 'stream' && data.url) {
        downloads.push({
          label: 'Video MP4 (Best)',
          url: data.url,
          type: 'video',
          ext: 'mp4',
          quality: 'best',
        });
      } else if (data.status === 'picker' && Array.isArray(data.picker)) {
        for (const item of data.picker) {
          downloads.push({
            label: item.type === 'video' ? `Video MP4` : `Audio`,
            url: item.url,
            type: item.type === 'video' ? 'video' : 'audio',
            ext: item.type === 'video' ? 'mp4' : 'mp3',
            quality: item.quality || 'best',
          });
        }
      }

      if (downloads.length > 0) {
        // Get metadata via noembed
        const meta = await getYouTubeMeta(url);
        return {
          title: meta.title || 'YouTube Video',
          thumbnail: meta.thumbnail || `https://img.youtube.com/vi/${extractYouTubeId(url)}/maxresdefault.jpg`,
          author: meta.author || 'YouTube',
          downloads,
        };
      }
    } catch (_) {
      // Try next endpoint
    }
  }
  return null;
}

/**
 * Method 2: yt5s / y2mate-style public scrapers
 */
async function tryYtApi(url) {
  const videoId = extractYouTubeId(url);
  if (!videoId) return null;

  // Try multiple public no-key YouTube data APIs
  const endpoints = [
    `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30`,
    `https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`,
  ];

  // Use noembed for metadata
  const meta = await getYouTubeMeta(url);

  // Build download links using public invidious instances
  const invidiousInstances = [
    'https://invidious.privacyredirect.com',
    'https://yt.artemislena.eu',
    'https://invidious.lunar.icu',
    'https://vid.puffyan.us',
    'https://invidious.nerdvpn.de',
  ];

  for (const instance of invidiousInstances) {
    try {
      const res = await fetch(`${instance}/api/v1/videos/${videoId}`, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (!data || !data.adaptiveFormats) continue;

      const downloads = [];
      const seen = new Set();

      // Muxed streams (video + audio)
      const legacyFormats = (data.formatStreams || []).filter(f => f.url);
      for (const f of legacyFormats) {
        const q = f.qualityLabel || f.quality || 'SD';
        if (!seen.has(q)) {
          seen.add(q);
          downloads.push({
            label: `Video MP4 (${q})`,
            url: f.url,
            type: 'video',
            ext: 'mp4',
            quality: q,
          });
        }
      }

      // Audio only
      const audioFormats = (data.adaptiveFormats || [])
        .filter(f => f.type?.startsWith('audio') && f.url)
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

      for (const f of audioFormats.slice(0, 2)) {
        const bitrate = f.bitrate ? `${Math.round(f.bitrate / 1000)}kbps` : 'audio';
        downloads.push({
          label: `Audio M4A (${bitrate})`,
          url: f.url,
          type: 'audio',
          ext: 'm4a',
          quality: bitrate,
        });
      }

      if (downloads.length > 0) {
        return {
          title: data.title || meta.title || 'YouTube Video',
          thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
          author: data.author || meta.author || 'YouTube',
          duration: data.lengthSeconds || null,
          downloads,
        };
      }
    } catch (_) {
      // Try next instance
    }
  }

  return null;
}

/**
 * Method 3: yt-dlp inspired – direct YouTube manifest parsing
 * Uses the unofficial YouTube player endpoint that works without sign-in
 */
async function tryYouTubeDirectApi(url) {
  const videoId = extractYouTubeId(url);
  if (!videoId) return null;

  // YouTube's own internal player API (works without API key)
  try {
    const playerUrl = 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false';
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

    const res = await fetch(playerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'com.google.android.youtube/17.36.4 (Linux; U; Android 11) gzip',
        'X-Youtube-Client-Name': '30',
        'X-Youtube-Client-Version': '17.36.4',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
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

    // Muxed (has both video + audio)
    const muxed = streamFormats.filter(f =>
      f.mimeType?.startsWith('video') && f.audioQuality
    ).sort((a, b) => (b.height || 0) - (a.height || 0));

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
 * Get YouTube metadata via noembed (lightweight, no API key)
 */
async function getYouTubeMeta(url) {
  try {
    const res = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return {};
    const data = await res.json();
    return {
      title: data.title || '',
      author: data.author_name || '',
      thumbnail: data.thumbnail_url || '',
    };
  } catch (_) {
    return {};
  }
}

/**
 * Main YouTube scraper — tries multiple methods with fallback chain
 */
export async function scrapeYouTube(url) {
  const videoId = extractYouTubeId(url);
  if (!videoId) throw new Error('URL YouTube tidak valid atau tidak didukung');

  // Method 1: YouTube Direct Player API (most reliable, no key needed)
  const directResult = await tryYouTubeDirectApi(url);
  if (directResult && directResult.downloads.length > 0) return directResult;

  // Method 2: Invidious (open-source YouTube proxy)
  const invResult = await tryYtApi(url);
  if (invResult && invResult.downloads.length > 0) return invResult;

  // Method 3: cobalt.tools
  const cobaltResult = await tryCobalt(url);
  if (cobaltResult && cobaltResult.downloads.length > 0) return cobaltResult;

  // If all fail, still return metadata with redirect link to yt-dlp web
  const meta = await getYouTubeMeta(url);
  throw new Error(
    `Tidak dapat mengekstrak download link untuk video ini. ` +
    `Coba gunakan yt-dlp secara langsung: https://yt-dlp.org`
  );
}
