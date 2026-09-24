// api/_scrapers/youtube.js – YouTube scraper using @distube/ytdl-core
// Works on Vercel serverless (Node.js 18+)

import ytdl from '@distube/ytdl-core';

const QUALITY_LABELS = {
  '2160p': '4K (2160p)',
  '1440p': '1440p QHD',
  '1080p': '1080p Full HD',
  '720p': '720p HD',
  '480p': '480p',
  '360p': '360p',
  '240p': '240p',
  '144p': '144p',
};

const AUDIO_QUALITY_LABELS = {
  '160kbps': '160kbps (High)',
  '128kbps': '128kbps',
  '70kbps': '70kbps',
  '50kbps': '50kbps (Low)',
};

/**
 * Scrape YouTube video using @distube/ytdl-core.
 * Returns both video (muxed) and audio-only formats.
 * @param {string} url - YouTube URL
 * @returns {Promise<object>} - Standardized result
 */
export async function scrapeYouTube(url) {
  // Validate it's actually a YouTube URL
  if (!ytdl.validateURL(url)) {
    throw new Error('URL YouTube tidak valid');
  }

  const info = await ytdl.getInfo(url, {
    requestOptions: {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    },
  });

  const videoDetails = info.videoDetails;
  const formats = info.formats;

  const downloads = [];
  const seenQualities = new Set();

  // ── 1. MP4 Video + Audio (muxed) ──────────────────────────────────────────
  const muxedFormats = formats
    .filter(f => f.hasVideo && f.hasAudio && f.container === 'mp4')
    .sort((a, b) => (b.height || 0) - (a.height || 0));

  for (const f of muxedFormats) {
    const qualityLabel = f.qualityLabel || `${f.height}p`;
    if (seenQualities.has(`v-${qualityLabel}`)) continue;
    seenQualities.add(`v-${qualityLabel}`);

    downloads.push({
      label: `Video MP4 ${QUALITY_LABELS[qualityLabel] || qualityLabel}`,
      url: f.url,
      type: 'video',
      ext: 'mp4',
      quality: qualityLabel,
      size: f.contentLength ? parseInt(f.contentLength) : null,
      fps: f.fps || null,
      mimeType: f.mimeType,
    });
  }

  // ── 2. Video-only (higher quality, no audio) ───────────────────────────────
  const videoOnlyFormats = formats
    .filter(f => f.hasVideo && !f.hasAudio && f.container === 'mp4')
    .sort((a, b) => (b.height || 0) - (a.height || 0));

  const topVideoOnly = videoOnlyFormats.slice(0, 2);
  for (const f of topVideoOnly) {
    const qualityLabel = f.qualityLabel || `${f.height}p`;
    if (seenQualities.has(`v-${qualityLabel}`)) continue;
    seenQualities.add(`v-${qualityLabel}`);

    downloads.push({
      label: `Video ${QUALITY_LABELS[qualityLabel] || qualityLabel} (Video Only, no audio)`,
      url: f.url,
      type: 'video',
      ext: 'mp4',
      quality: qualityLabel,
      size: f.contentLength ? parseInt(f.contentLength) : null,
      videoOnly: true,
      mimeType: f.mimeType,
    });
  }

  // ── 3. Audio Only (MP4A / WebM Opus) ─────────────────────────────────────
  const audioFormats = formats
    .filter(f => !f.hasVideo && f.hasAudio)
    .sort((a, b) => (b.audioBitrate || 0) - (a.audioBitrate || 0));

  const seenBitrates = new Set();
  for (const f of audioFormats) {
    const bitrate = f.audioBitrate ? `${f.audioBitrate}kbps` : 'audio';
    if (seenBitrates.has(bitrate)) continue;
    seenBitrates.add(bitrate);

    const isM4a = f.container === 'mp4' || f.mimeType?.includes('mp4a');
    const ext = isM4a ? 'm4a' : 'webm';
    const labelBitrate = AUDIO_QUALITY_LABELS[bitrate] || bitrate;

    downloads.push({
      label: `Audio ${isM4a ? 'M4A' : 'WebM'} ${labelBitrate}`,
      url: f.url,
      type: 'audio',
      ext,
      quality: bitrate,
      size: f.contentLength ? parseInt(f.contentLength) : null,
      mimeType: f.mimeType,
    });

    // Max 3 audio options
    if (seenBitrates.size >= 3) break;
  }

  if (downloads.length === 0) {
    throw new Error('Tidak ada format download yang tersedia untuk video ini');
  }

  // Get thumbnail (highest res)
  const thumbnails = videoDetails.thumbnails || [];
  const thumbnail = thumbnails.sort((a, b) => (b.width || 0) - (a.width || 0))[0]?.url || '';

  return {
    title: videoDetails.title || 'YouTube Video',
    thumbnail,
    author: videoDetails.author?.name || videoDetails.ownerChannelName || 'YouTube',
    duration: parseInt(videoDetails.lengthSeconds) || null,
    viewCount: videoDetails.viewCount || null,
    downloads,
  };
}
