// Builds the PWA icons: the parsnip sprite (from img/sprites.png) with a soft
// shadow, over a hexagon tunnel in the warp's "midnight peach" palette.
// Usage: node tools/make-icons.mjs
import fs from 'node:fs';
import zlib from 'node:zlib';

const root = new URL('../', import.meta.url);

// ---------- PNG in/out (8-bit RGB/RGBA, non-interlaced) ----------
function readPng(buf) {
  let p = 8, w = 0, h = 0, type = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), kind = buf.toString('ascii', p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len);
    if (kind === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); type = data[9]; }
    if (kind === 'IDAT') idat.push(data);
    p += 12 + len;
  }
  const bpp = type === 6 ? 4 : 3, stride = w * bpp;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
      line[i] = (line[i] + [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f]) & 255;
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      px[o] = line[x * bpp]; px[o + 1] = line[x * bpp + 1]; px[o + 2] = line[x * bpp + 2];
      px[o + 3] = bpp === 4 ? line[x * bpp + 3] : 255;
    }
    prev = line;
  }
  return { w, h, px };
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (const b of buf) {
    let c = (crc ^ b) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function writePng(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- the parsnip sprite: first cell of the 6x7 sheet ----------
const sheet = readPng(fs.readFileSync(new URL('img/sprites.png', root)));
const cw = Math.round(sheet.w / 6), ch = Math.round(sheet.h / 7);
// magenta background, its anti-aliased fringe, and any pinkish tint (the parsnip has no pink in it)
const isBg = (r, g, b) => (r > 215 && b > 215 && g < 45 && Math.abs(r - b) < 30) || (Math.abs(r - b) < 18 && r - g > 70 && g < 70) || (r - g > 40 && b - g > 40);
let x0 = cw, y0 = ch, x1 = -1, y1 = -1;
const cell = Buffer.alloc(cw * ch * 4);
for (let y = 0; y < ch; y++) {
  for (let x = 0; x < cw; x++) {
    const s = (y * sheet.w + x) * 4, o = (y * cw + x) * 4;
    const [r, g, b] = [sheet.px[s], sheet.px[s + 1], sheet.px[s + 2]];
    if (isBg(r, g, b)) continue;
    cell[o] = r; cell[o + 1] = g; cell[o + 2] = b; cell[o + 3] = 255;
    // ignore stray pixels in the outer edge band when trimming
    if (x > 2 && y > 2 && x < cw - 3 && y < ch - 3) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  }
}
const spr = { w: x1 - x0 + 1, h: y1 - y0 + 1 };
// sample the trimmed sprite with nearest-neighbour (keeps the pixel art crisp)
const sample = (u, v) => {
  const x = Math.floor(u * spr.w), y = Math.floor(v * spr.h);
  if (x < 0 || y < 0 || x >= spr.w || y >= spr.h) return null;
  const o = ((y + y0) * cw + x + x0) * 4;
  return cell[o + 3] ? [cell[o], cell[o + 1], cell[o + 2]] : null;
};

// ---------- tunnel background ----------
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const [DARK, LIGHT, ACCENT] = ['#1b1340', '#ffb38a', '#ff5f7e'].map(hex);
const ROLES = [DARK, LIGHT, DARK, LIGHT, DARK, ACCENT];

function render(size, spriteFrac) {
  const px = Buffer.alloc(size * size * 4);
  const c = size / 2;
  const box = size * spriteFrac;          // sprite's longest side
  const sw = box * Math.min(1, spr.w / spr.h), sh = box * Math.min(1, spr.h / spr.w);
  const sx = c - sw / 2, sy = c - sh / 2 - size * 0.01;
  const shOff = size * 0.035, blur = Math.max(1, Math.round(size * 0.018));

  // shadow mask (sprite alpha, offset, box-blurred)
  const mask = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (sample((x - sx - shOff) / sw, (y - sy - shOff) / sh)) mask[y * size + x] = 1;
  }
  const tmp = new Float32Array(size * size);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      let s = 0, n = 0;
      for (let k = -blur; k <= blur; k++) { const xx = x + k; if (xx >= 0 && xx < size) { s += mask[y * size + xx]; n++; } }
      tmp[y * size + x] = s / n;
    }
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      let s = 0, n = 0;
      for (let k = -blur; k <= blur; k++) { const yy = y + k; if (yy >= 0 && yy < size) { s += tmp[yy * size + x]; n++; } }
      mask[y * size + x] = s / n;
    }
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - c, dy = y + 0.5 - c;
      const r = Math.hypot(dx, dy) / (size * 0.5), a = Math.atan2(dy, dx) + Math.PI / 2;
      const seg = (Math.PI * 2) / 6;
      const d = r * Math.cos(a - seg * Math.floor(a / seg) - seg / 2);
      const ring = Math.floor(Math.log(Math.max(d, 0.004)) * 2.6 + 0.2);
      let col = ROLES[((ring % 6) + 6) % 6].slice();
      const m = mask[y * size + x] * 0.4;
      col = col.map((v) => Math.round(v * (1 - m)));
      const s = sample((x - sx) / sw, (y - sy) / sh);
      if (s) col = s;
      const o = (y * size + x) * 4;
      px[o] = col[0]; px[o + 1] = col[1]; px[o + 2] = col[2]; px[o + 3] = 255;
    }
  }
  return writePng(size, size, px);
}

const out = (name, buf) => fs.writeFileSync(new URL(`img/${name}`, root), buf);
out('apple-touch-icon.png', render(180, 0.66));
out('icon-192.png', render(192, 0.66));
out('icon-512.png', render(512, 0.66));
out('icon-maskable-512.png', render(512, 0.5));
console.log('icons written');
