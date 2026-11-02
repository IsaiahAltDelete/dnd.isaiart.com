// tools/px/png.mjs — a 40-line PNG encoder (zlib is in node, everything else is
// four chunks and a CRC). Also the sRGB -> CIE Lab conversion the audit metrics
// are defined in.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const CRC = new Int32Array(256);
for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c; }
function crc32(buf) { let c = -1; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}

/** Write an RGBA byte array as a PNG, optionally nearest-neighbour scaled. */
export function writePNG(path, data, w, h, scale = 1) {
  const W = w * scale, H = h * scale;
  const raw = Buffer.alloc(H * (W * 4 + 1));
  let p = 0;
  for (let y = 0; y < H; y++) {
    raw[p++] = 0;
    const sy = (y / scale) | 0;
    for (let x = 0; x < W; x++) {
      const si = (sy * w + ((x / scale) | 0)) * 4;
      raw[p++] = data[si]; raw[p++] = data[si + 1]; raw[p++] = data[si + 2]; raw[p++] = data[si + 3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  writeFileSync(path, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]));
  return path;
}

// --- colour ----------------------------------------------------------------
const lin = (u) => { const c = u / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const fq = (t) => (t > 0.008856451679 ? Math.cbrt(t) : t / 0.12841854934 + 4 / 29);

/** sRGB bytes -> [L*, a*, b*] (D65). */
export function lab(r, g, b) {
  const R = lin(r), G = lin(g), B = lin(b);
  const X = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
  const Y = (0.2126729 * R + 0.7151522 * G + 0.0721750 * B);
  const Z = (0.0193339 * R + 0.1191920 * G + 0.9503041 * B) / 1.08883;
  const fx = fq(X), fy = fq(Y), fz = fq(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
export function dE76(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }

/** An L* plane for a whole RGBA image. */
export function lplane(data, w, h) {
  const L = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) L[i] = lab(data[i * 4], data[i * 4 + 1], data[i * 4 + 2])[0];
  return L;
}

export function mean(a) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return a.length ? s / a.length : 0; }
export function sd(a) { const m = mean(a); let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - m) ** 2; return a.length ? Math.sqrt(s / a.length) : 0; }

/** Autocorrelation of a 1-D series at `lag`. */
export function autocorr(a, lag) {
  const m = mean(a);
  let num = 0, den = 0;
  for (let i = 0; i < a.length; i++) den += (a[i] - m) ** 2;
  for (let i = 0; i + lag < a.length; i++) num += (a[i] - m) * (a[i + lag] - m);
  return den ? num / den : 0;
}
