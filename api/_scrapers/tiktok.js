// api/_scrapers/tiktok.js – TikTok scraper via tikwm.com public API (CommonJS)

const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

const TIKWM_API = 'https://www.tikwm.com/api/';
const USER_AGENT = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36';

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms)),
  ]);
}

async function scrapeTikTok(url) {
  // Resolve short URLs
  let resolvedUrl = url;
  if (/vm\.tiktok\.com|vt\.tiktok\.com/i.test(url)) {
    try {
      const resp = await withTimeout(
        fetch(url, { method: 'HEAD', redirect: 'follow', headers: { 'User-Agent': USER_AGENT } }),
        8000
      );
      resolvedUrl = resp.url || url;
    } catch (_) {}
  }

  const formData = new URLSearchParams();
  formData.append('url', resolvedUrl);
  formData.append('hd', '1');

  const tikwmRes = await withTimeout(
    fetch(TIKWM_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT,
        'Referer': 'https://www.tikwm.com/',
        'Origin': 'https://www.tikwm.com',
      },
      body: formData.toString(),
    }),
    15000
  );

  if (!tikwmRes.ok) {
    throw new Error('tikwm.com returned HTTP ' + tikwmRes.status);
  }

  const json = await tikwmRes.json();

  if (!json || json.code !== 0 || !json.data) {
    throw new Error((json && json.msg) || 'tikwm.com: gagal mengambil data video');
  }

  const d = json.data;
  const downloads = [];

  if (d.hdplay) downloads.push({ label: 'Video HD (No Watermark)', url: d.hdplay, type: 'video', ext: 'mp4', quality: 'hd', size: d.hd_size || null });
  if (d.play)   downloads.push({ label: 'Video (No Watermark)', url: d.play, type: 'video', ext: 'mp4', quality: 'sd', size: d.size || null });
  if (d.wmplay) downloads.push({ label: 'Video (With Watermark)', url: d.wmplay, type: 'video', ext: 'mp4', quality: 'wm', size: d.wm_size || null });
  if (d.music)  downloads.push({ label: 'Audio MP3 – ' + ((d.music_info && d.music_info.title) || 'Musik'), url: d.music, type: 'audio', ext: 'mp3', quality: 'audio', size: d.music_size || null });

  if (Array.isArray(d.images) && d.images.length > 0) {
    d.images.forEach(function(imgUrl, i) {
      downloads.push({ label: 'Foto ' + (i + 1) + ' / ' + d.images.length, url: imgUrl, type: 'image', ext: 'jpg', quality: 'image' });
    });
  }

  if (downloads.length === 0) throw new Error('Tidak ada link download yang ditemukan');

  return {
    title: d.title || 'TikTok Video',
    thumbnail: d.cover || d.origin_cover || '',
    author: (d.author && (d.author.nickname || d.author.unique_id)) || 'TikTok',
    duration: d.duration || null,
    downloads,
  };
}

module.exports = { scrapeTikTok };
