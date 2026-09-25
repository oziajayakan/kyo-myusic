// api/_scrapers/youtube.js – YouTube scraper (CommonJS)
// Multi-method fallback: YouTube Android Player API → Invidious → cobalt.tools
// Uses node-fetch for compatibility with older Node.js runtimes

const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

const UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36';

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

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms)),
  ]);
}

async function getYouTubeMeta(url, videoId) {
  try {
    const res = await withTimeout(
      fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`, {
        headers: { 'User-Agent': UA },
      }),
      5000
    );
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

// Method 1: YouTube internal Android player API (no key, most reliable)
async function tryYouTubeDirectApi(videoId) {
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

    const res = await withTimeout(
      fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'com.google.android.youtube/17.36.4 (Linux; U; Android 11) gzip',
          'X-Youtube-Client-Name': '30',
          'X-Youtube-Client-Version': '17.36.4',
        },
        body: JSON.stringify(payload),
      }),
      12000
    );

    if (!res.ok) return null;
    const data = await res.json();

    const videoDetails = data && data.videoDetails;
    const streamData = data && data.streamingData;
    const streamFormats = [
      ...((streamData && streamData.formats) || []),
      ...((streamData && streamData.adaptiveFormats) || []),
    ].filter(f => f.url);

    if (!streamFormats.length) return null;

    const downloads = [];
    const seen = new Set();

    // Muxed video+audio
    const muxed = streamFormats
      .filter(f => f.mimeType && f.mimeType.startsWith('video') && f.audioQuality)
      .sort((a, b) => (b.height || 0) - (a.height || 0));

    for (const f of muxed) {
      const q = f.qualityLabel || (f.height ? f.height + 'p' : 'SD');
      if (seen.has(q)) continue;
      seen.add(q);
      downloads.push({
        label: 'Video MP4 (' + q + ')',
        url: f.url,
        type: 'video',
        ext: 'mp4',
        quality: q,
        size: f.contentLength ? parseInt(f.contentLength) : null,
      });
    }

    // Audio only
    const audioOnly = streamFormats
      .filter(f => f.mimeType && f.mimeType.startsWith('audio'))
      .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

    for (const f of audioOnly.slice(0, 3)) {
      const bitrate = f.averageBitrate ? Math.round(f.averageBitrate / 1000) + 'kbps' : 'audio';
      const isM4a = f.mimeType && f.mimeType.includes('mp4a');
      downloads.push({
        label: 'Audio ' + (isM4a ? 'M4A' : 'WebM') + ' (' + bitrate + ')',
        url: f.url,
        type: 'audio',
        ext: isM4a ? 'm4a' : 'webm',
        quality: bitrate,
      });
    }

    if (!downloads.length) return null;

    const thumbnails = (videoDetails && videoDetails.thumbnail && videoDetails.thumbnail.thumbnails) || [];
    const bestThumb = thumbnails.sort((a, b) => (b.width || 0) - (a.width || 0))[0];

    return {
      title: (videoDetails && videoDetails.title) || 'YouTube Video',
      thumbnail: (bestThumb && bestThumb.url) || ('https://img.youtube.com/vi/' + videoId + '/maxresdefault.jpg'),
      author: (videoDetails && videoDetails.author) || 'YouTube',
      duration: (videoDetails && videoDetails.lengthSeconds) ? parseInt(videoDetails.lengthSeconds) : null,
      downloads,
    };
  } catch (err) {
    console.log('[YT Direct] failed:', err.message);
    return null;
  }
}

// Method 2: Invidious open-source YouTube proxy
async function tryInvidious(videoId) {
  const instances = [
    'https://invidious.privacyredirect.com',
    'https://yt.artemislena.eu',
    'https://invidious.lunar.icu',
    'https://invidious.nerdvpn.de',
  ];

  for (const instance of instances) {
    try {
      const res = await withTimeout(
        fetch(instance + '/api/v1/videos/' + videoId, {
          headers: { 'User-Agent': UA },
        }),
        8000
      );
      if (!res.ok) continue;
      const data = await res.json();
      if (!data || (!data.formatStreams && !data.adaptiveFormats)) continue;

      const downloads = [];
      const seen = new Set();

      for (const f of (data.formatStreams || [])) {
        if (!f.url) continue;
        const q = f.qualityLabel || f.quality || 'SD';
        if (seen.has(q)) continue;
        seen.add(q);
        downloads.push({ label: 'Video MP4 (' + q + ')', url: f.url, type: 'video', ext: 'mp4', quality: q });
      }

      const audioFormats = ((data.adaptiveFormats || [])
        .filter(f => f.type && f.type.startsWith('audio') && f.url)
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0)));

      for (const f of audioFormats.slice(0, 2)) {
        const bitrate = f.bitrate ? Math.round(f.bitrate / 1000) + 'kbps' : 'audio';
        downloads.push({ label: 'Audio M4A (' + bitrate + ')', url: f.url, type: 'audio', ext: 'm4a', quality: bitrate });
      }

      if (downloads.length > 0) {
        return {
          title: data.title || 'YouTube Video',
          thumbnail: 'https://img.youtube.com/vi/' + videoId + '/maxresdefault.jpg',
          author: data.author || 'YouTube',
          duration: data.lengthSeconds || null,
          downloads,
        };
      }
    } catch (err) {
      console.log('[Invidious] ' + instance + ' failed:', err.message);
    }
  }
  return null;
}

async function scrapeYouTube(url) {
  const videoId = extractYouTubeId(url);
  if (!videoId) throw new Error('URL YouTube tidak valid');

  // Method 1: YouTube direct player API
  try {
    const r1 = await tryYouTubeDirectApi(videoId);
    if (r1 && r1.downloads && r1.downloads.length > 0) return r1;
  } catch (_) {}

  // Method 2: Invidious proxy
  try {
    const r2 = await tryInvidious(videoId);
    if (r2 && r2.downloads && r2.downloads.length > 0) return r2;
  } catch (_) {}

  throw new Error('Tidak dapat mengekstrak link. Coba link YouTube lain.');
}

module.exports = { scrapeYouTube };
