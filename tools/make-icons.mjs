// Renders the pixel parsnip over a rainbow spiral into the PWA icon PNGs.
// Usage: node tools/make-icons.mjs
import fs from 'node:fs';
import zlib from 'node:zlib';

const src = fs.readFileSync(new URL('../icons.js', import.meta.url), 'utf8');
const { PALETTE, ICONS } = new Function(src + '; return { PALETTE, ICONS };')();

const RAINBOW = ['#ff2a4d', '#ff6a1f', '#ffb21f', '#ffe83a', '#9cf23a', '#2ee06a',
  '#22e0c8', '#29a8ff', '#3d5bff', '#7a3dff', '#c03dff', '#ff3dc0'];
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

function render(size, cells) {
  const scale = Math.floor(size / cells);
  const pad = Math.floor((size - scale * cells) / 2);
  const px = Buffer.alloc(size * size * 4);
  const grid = ICONS.parsnip.grid;
  const off = Math.floor((cells - 16) / 2);
  const c = cells / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const gx = Math.min(cells - 1, Math.max(0, Math.floor((x - pad) / scale)));
      const gy = Math.min(cells - 1, Math.max(0, Math.floor((y - pad) / scale)));
      const dx = gx + 0.5 - c, dy = gy + 0.5 - c;
      const r = Math.hypot(dx, dy) / (c * 1.42);
      const v = (Math.atan2(dy, dx) / (Math.PI * 2)) * 3 + Math.log(Math.max(r, 0.01)) * 1.7;
      const d = BAYER[(gy & 3) * 4 + (gx & 3)];
      const band = Math.floor((v - Math.floor(v)) * 12 + d) % 12;
      const shade = 0.25 + Math.min(r * 1.6, 1) * 0.45;
      let rgb = hex(RAINBOW[band]).map((ch) => Math.round(ch * shade));
      const at = (yy, xx) => PALETTE[(grid[yy - off] || '')[xx - off]];
      const ch = at(gy, gx);
      if (ch) rgb = hex(ch);
      else if ([[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]].some(([a, b]) => at(gy + a, gx + b))) rgb = [18, 8, 31];
      const i = (y * size + x) * 4;
      px[i] = rgb[0]; px[i + 1] = rgb[1]; px[i + 2] = rgb[2]; px[i + 3] = 255;
    }
  }
  return png(size, size, px);
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
function png(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const out = (name, buf) => fs.writeFileSync(new URL(`../img/${name}`, import.meta.url), buf);
out('apple-touch-icon.png', render(180, 22));
out('icon-192.png', render(192, 22));
out('icon-512.png', render(512, 22));
out('icon-maskable-512.png', render(512, 28));
console.log('icons written');
