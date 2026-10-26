// tools/px/terrain-decode.mjs — turn the data URLs a terrain-capture.js run left in
// its shot.mjs JSON report into PNG files, nearest-neighbour upscaled.
//   node tools/px/terrain-decode.mjs output/terrain/before.json output/terrain/before 2
//   node tools/px/terrain-decode.mjs after.json output/terrain/pairs 2 before.json
// With a fourth argument each PNG is BEFORE stacked over AFTER, 4px apart, so one
// image read judges one location.
import fs from 'node:fs';
import path from 'node:path';
import { decode, encode, upscale } from './pngio.mjs';

const [, , REPORT, DIR, SCALE = '2', PAIR] = process.argv;
const k = Math.max(1, +SCALE | 0);
fs.mkdirSync(DIR, { recursive: true });

function stack(a, b) {
  // the display canvas went 2x in the overhaul: bring a 1x shot up to match
  if (b.w === a.w * 2) a = upscale(a, 2);
  if (a.w === b.w * 2) b = upscale(b, 2);
  const w = Math.max(a.w, b.w), h = a.h + 4 + b.h, d = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) { d[i * 4] = 250; d[i * 4 + 1] = 40; d[i * 4 + 2] = 200; d[i * 4 + 3] = 255; }
  for (let y = 0; y < a.h; y++) a.data.copy(d, y * w * 4, y * a.w * 4, (y + 1) * a.w * 4);
  for (let y = 0; y < b.h; y++) b.data.copy(d, (y + a.h + 4) * w * 4, y * b.w * 4, (y + 1) * b.w * 4);
  return { w, h, data: d };
}
const shots = (f) => { const r = JSON.parse(fs.readFileSync(f, 'utf8')); return Array.isArray(r.script) ? r.script : []; };
const list = shots(REPORT), before = PAIR ? shots(PAIR) : null;
const png = (s) => decode(Buffer.from(s.url.split(',')[1], 'base64'));
list.forEach((s, i) => {
  if (!s.url) { console.log('skip', s.id, s.err || ''); return; }
  let img = png(s);
  if (before) { const b = before.find((q) => q.id === s.id && q.x === s.x && q.y === s.y && q.url); if (b) img = stack(png(b), img); }
  const f = path.join(DIR, `${String(i).padStart(2, '0')}-${s.id}-${s.x}-${s.y}.png`);
  fs.writeFileSync(f, encode(upscale(img, k)));
  console.log(f, img.w + 'x' + img.h);
});
