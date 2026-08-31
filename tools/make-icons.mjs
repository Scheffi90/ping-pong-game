/* Generates the PWA icons as PNGs — pure Node, no dependencies.
   Run: node tools/make-icons.mjs */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const BG = [7, 11, 22];
const TEAL = [55, 232, 200];
const PINK = [255, 92, 138];
const WHITE = [234, 242, 255];

/* Draws the app mark: a dark rounded tile, two neon paddles and a ball.
   `pad` insets the artwork so maskable icons survive a circular crop. */
function render(size, { maskable = false } = {}) {
  const px = Buffer.alloc(size * size * 4);
  const s = size / 512;
  const radius = maskable ? 0 : 112 * s;
  const inset = maskable ? size * 0.14 : 0;

  const put = (x, y, rgb, a = 1) => {
    if (x < 0 || y < 0 || x >= size || y >= size || a <= 0) return;
    const i = (y * size + x) * 4;
    const prev = px[i + 3] / 255;
    const out = a + prev * (1 - a);
    for (let k = 0; k < 3; k++) {
      px[i + k] = Math.round((rgb[k] * a + px[i + k] * prev * (1 - a)) / (out || 1));
    }
    px[i + 3] = Math.round(out * 255);
  };

  // background tile with rounded corners (antialiased by 4x supersampling of coverage)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let cov = 0;
      for (let sy = 0; sy < 2; sy++) for (let sx = 0; sx < 2; sx++) {
        const fx = x + (sx + 0.5) / 2, fy = y + (sy + 0.5) / 2;
        if (insideRounded(fx, fy, size, radius)) cov += 0.25;
      }
      if (cov > 0) {
        const shade = 1 - (y / size) * 0.25;
        put(x, y, [BG[0] * shade + 10, BG[1] * shade + 14, BG[2] * shade + 26], cov);
      }
    }
  }

  const cx = size / 2;
  const draw = (fn) => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) fn(x, y);
  };

  const capsule = (cxp, cyp, w, h, rgb, glow) => draw((x, y) => {
    const d = capsuleDist(x + 0.5, y + 0.5, cxp, cyp, w, h);
    if (d <= 0) put(x, y, rgb, 1);
    else if (d < 1.2) put(x, y, rgb, 1 - d / 1.2);
    else if (d < glow) put(x, y, rgb, 0.22 * (1 - d / glow));
  });

  const circle = (cxp, cyp, r, rgb, glow) => draw((x, y) => {
    const d = Math.hypot(x + 0.5 - cxp, y + 0.5 - cyp) - r;
    if (d <= 0) put(x, y, rgb, 1);
    else if (d < 1.2) put(x, y, rgb, 1 - d / 1.2);
    else if (d < glow) put(x, y, rgb, 0.25 * (1 - d / glow));
  });

  const top = inset + 132 * s * (1 - inset / size) + inset * 0.2;
  const bottom = size - top;
  const pw = (size - inset * 2) * 0.46;
  const ph = (size - inset * 2) * 0.075;

  capsule(cx - size * 0.07, top, pw, ph, PINK, 26 * s);
  capsule(cx + size * 0.07, bottom, pw, ph, TEAL, 26 * s);
  circle(cx + size * 0.10, size * 0.5, size * 0.062, WHITE, 30 * s);

  return px;
}

function insideRounded(x, y, size, r) {
  if (r <= 0) return true;
  const dx = Math.max(r - x, 0, x - (size - r));
  const dy = Math.max(r - y, 0, y - (size - r));
  if (dx === 0 || dy === 0) return true;
  return Math.hypot(dx, dy) <= r;
}

function capsuleDist(x, y, cx, cy, w, h) {
  const rx = Math.max(Math.abs(x - cx) - (w / 2 - h / 2), 0);
  return Math.hypot(rx, y - cy) - h / 2;
}

mkdirSync(resolve(root, 'icons'), { recursive: true });
const targets = [
  ['icons/icon-192.png', 192, {}],
  ['icons/icon-512.png', 512, {}],
  ['icons/icon-maskable-512.png', 512, { maskable: true }]
];
for (const [file, size, opts] of targets) {
  writeFileSync(resolve(root, file), png(size, render(size, opts)));
  console.log('wrote', file, size + 'x' + size);
}
