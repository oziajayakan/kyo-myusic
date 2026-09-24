/**
 * create-ico.js  –  Generates assets/icon.ico from nimiyo_icon.webp
 * using pure Node.js (no external binaries needed).
 * 
 * Run:  node create-ico.js
 */

const fs   = require('fs');
const path = require('path');
const https = require('https');
const http  = require('http');

// ─── We'll use 'jimp' or fallback to sharp ──────────────────────────────────
// Since neither may be installed we use a minimal ICO writer approach:
// We embed the .png data directly in an ICO container (multi-size).

// We rely on the 'canvas' or 'pngjs' ecosystem. Here we use the simplest
// approach: download a tiny PNG encoder inline and write a valid ICO.

// ── Minimal PNG encoder (no deps) ───────────────────────────────────────────
function adler32(buf) {
  let s1 = 1, s2 = 0;
  for (let i = 0; i < buf.length; i++) {
    s1 = (s1 + buf[i]) % 65521;
    s2 = (s2 + s1) % 65521;
  }
  return (s2 << 16) | s1;
}

function crc32(buf, start, end) {
  const table = crc32.table || (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[i] = c;
    }
    return (crc32.table = t);
  })();
  let crc = 0xFFFFFFFF;
  for (let i = start; i < end; i++) crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function encodePNG(rgba, w, h) {
  const sig   = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const IHDR  = Buffer.alloc(25);
  IHDR.writeUInt32BE(13, 0);
  IHDR.write('IHDR', 4);
  IHDR.writeUInt32BE(w, 8);
  IHDR.writeUInt32BE(h, 12);
  IHDR[16] = 8; IHDR[17] = 6; // 8-bit RGBA
  IHDR.writeUInt32BE(crc32(IHDR, 4, 21), 21);

  // Build raw scanlines (filter byte 0 + row data)
  const rowSize = w * 4;
  const raw = Buffer.alloc((rowSize + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (rowSize + 1)] = 0; // None filter
    rgba.copy(raw, y * (rowSize + 1) + 1, y * rowSize, (y + 1) * rowSize);
  }

  // Deflate: zlib non-compressed blocks (store only, works for small images)
  const maxBlock = 32768;
  const deflated = [];
  deflated.push(Buffer.from([0x78, 0x01])); // zlib header
  let pos = 0;
  while (pos < raw.length) {
    const chunk = raw.slice(pos, pos + maxBlock);
    const bfinal = (pos + maxBlock >= raw.length) ? 1 : 0;
    const header = Buffer.alloc(5);
    header[0] = bfinal;
    header.writeUInt16LE(chunk.length, 1);
    header.writeUInt16LE(~chunk.length & 0xFFFF, 3);
    deflated.push(header);
    deflated.push(chunk);
    pos += maxBlock;
  }
  const adlerVal = adler32(raw);
  const adlerBuf = Buffer.alloc(4);
  adlerBuf.writeUInt32BE(adlerVal, 0);
  deflated.push(adlerBuf);
  const compressed = Buffer.concat(deflated);

  const IDAT = Buffer.alloc(12 + compressed.length);
  IDAT.writeUInt32BE(compressed.length, 0);
  IDAT.write('IDAT', 4);
  compressed.copy(IDAT, 8);
  IDAT.writeUInt32BE(crc32(IDAT, 4, 8 + compressed.length), 8 + compressed.length);

  const IEND = Buffer.from([0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]);

  return Buffer.concat([sig, IHDR, IDAT, IEND]);
}

// ── Generate a solid-color fallback icon ─────────────────────────────────────
function makeSolidRGBA(size, r, g, b, a) {
  const buf = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    buf[i * 4]     = r;
    buf[i * 4 + 1] = g;
    buf[i * 4 + 2] = b;
    buf[i * 4 + 3] = a;
  }
  return buf;
}

// ── ICO writer ───────────────────────────────────────────────────────────────
function makeICO(pngBuffers, sizes) {
  // ICO header: 6 bytes
  // Directory entries: 16 bytes each
  // PNG data appended after directory

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);           // Reserved
  header.writeUInt16LE(1, 2);           // Type: 1 = ICO
  header.writeUInt16LE(sizes.length, 4); // Image count

  const dirSize   = 16 * sizes.length;
  const dirOffset = 6;
  let   dataOffset = 6 + dirSize;

  const dirs = [];
  for (let i = 0; i < sizes.length; i++) {
    const dir = Buffer.alloc(16);
    const s   = sizes[i] >= 256 ? 0 : sizes[i]; // 0 means 256
    dir[0] = s;   // Width
    dir[1] = s;   // Height
    dir[2] = 0;   // Color count (0 = no palette)
    dir[3] = 0;   // Reserved
    dir.writeUInt16LE(1, 4);  // Planes
    dir.writeUInt16LE(32, 6); // Bit count
    dir.writeUInt32LE(pngBuffers[i].length, 8);
    dir.writeUInt32LE(dataOffset, 12);
    dataOffset += pngBuffers[i].length;
    dirs.push(dir);
  }

  return Buffer.concat([header, ...dirs, ...pngBuffers]);
}

// ── Attempt to use 'sharp' if installed, otherwise use fallback ──────────────
async function run() {
  if (!fs.existsSync('assets')) fs.mkdirSync('assets', { recursive: true });

  const outPath   = path.join('assets', 'icon.ico');
  const inputWebp = 'nimiyo_icon.webp';

  let sharp;
  try {
    sharp = require('sharp');
  } catch (e) {
    sharp = null;
  }

  const iconSizes = [16, 32, 48, 64, 128, 256];

  if (sharp && fs.existsSync(inputWebp)) {
    console.log('sharp found – converting nimiyo_icon.webp → icon.ico');
    const pngBuffers = await Promise.all(
      iconSizes.map(s =>
        sharp(inputWebp)
          .resize(s, s, { fit: 'cover' })
          .png()
          .toBuffer()
      )
    );
    fs.writeFileSync(outPath, makeICO(pngBuffers, iconSizes));
    console.log('✅  Created', outPath, '(from webp via sharp)');
    return;
  }

  // Fallback: generate yellow "N" icon using raw pixel drawing
  console.log('sharp not found – generating fallback yellow icon');

  function drawFallback(size) {
    const rgba = makeSolidRGBA(size, 255, 211, 0, 255); // #FFD300 yellow

    // Draw a simple "N" shape in dark color
    const ink = { r: 20, g: 20, b: 20 };
    const pad = Math.floor(size * 0.18);
    const top = pad, bot = size - pad;
    const left = pad, right = size - pad;
    const stroke = Math.max(1, Math.floor(size * 0.12));

    function setPixel(x, y) {
      if (x < 0 || x >= size || y < 0 || y >= size) return;
      const i = (y * size + x) * 4;
      rgba[i] = ink.r; rgba[i+1] = ink.g; rgba[i+2] = ink.b; rgba[i+3] = 255;
    }
    function fillRect(x0, y0, w, h) {
      for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) setPixel(x0+dx, y0+dy);
    }
    // Left vertical bar
    fillRect(left, top, stroke, bot - top);
    // Right vertical bar
    fillRect(right - stroke, top, stroke, bot - top);
    // Diagonal (top-left to bottom-right) – 3 pixel wide
    const steps = bot - top;
    for (let step = 0; step < steps; step++) {
      const x = left + stroke + Math.round(step * (right - left - stroke * 2) / steps);
      const y = top + step;
      fillRect(x, y, stroke, stroke);
    }
    return encodePNG(rgba, size, size);
  }

  const pngBuffers = iconSizes.map(s => drawFallback(s));
  fs.writeFileSync(outPath, makeICO(pngBuffers, iconSizes));
  console.log('✅  Created', outPath, '(fallback yellow N icon)');
}

run().catch(err => { console.error(err); process.exit(1); });
