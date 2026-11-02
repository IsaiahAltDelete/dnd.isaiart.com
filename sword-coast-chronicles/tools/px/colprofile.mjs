// tools/px/colprofile.mjs — why does a family autocorrelate at lag 16? Prints the
// mean L* of each LOCAL column (0-15) over a wide field, and its spread: a
// family with no in-tile bias has a flat profile.
//   node tools/px/colprofile.mjs KEY [KEY...]
import { init, field } from './field.mjs';
import { lplane, autocorr } from './png.mjs';
import { fileURLToPath } from 'node:url';

const TL = await init(fileURLToPath(new URL('../../src/render/tiles.js', import.meta.url)));
for (const k of process.argv.slice(2)) {
  const img = field(TL.T[k], 48, 8, 60, 60);
  const L = lplane(img.data, img.w, img.h);
  const col = new Float64Array(16), row = new Float64Array(16);
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) { col[x & 15] += L[y * img.w + x]; row[y & 15] += L[y * img.w + x]; }
  for (let i = 0; i < 16; i++) { col[i] /= img.h * (img.w / 16); row[i] /= img.w * (img.h / 16); }
  const cm = []; for (let x = 0; x < img.w; x++) { let s = 0; for (let y = 0; y < img.h; y++) s += L[y * img.w + x]; cm.push(s / img.h); }
  const f = (a) => Array.from(a, (v) => v.toFixed(1)).join(' ');
  console.log(`${k}\n  cols ${f(col)}\n  rows ${f(row)}\n  lag-16 ${autocorr(cm, 16).toFixed(3)}`);
}
