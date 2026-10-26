// tools/px/terrain-lab.mjs — a close-up bench for one tile family: every variant
// of each key on its usual ground, then a 5x3 cluster of the first key (the view
// in which a wood closes up or a wall lines up), at 8x. No browser needed.
//   node tools/px/terrain-lab.mjs <out.png> KEY[,KEY...] [ground=GRASS] [variants=8]
import './shim.mjs';
import { makeCanvas } from './shim.mjs';
import { writePNG } from './png.mjs';

const [, , OUT = 'output/terrain/lab/lab.png', KEYS = 'TREE_OAK', GROUND = 'GRASS', NV = '8'] = process.argv;
const TL = await import('../../src/render/tiles.js');
const T = TL.T, keys = KEYS.split(',').filter((k) => T[k] != null), nv = +NV;
const W = Math.max(nv * 17 + 1, 5 * 16 + 2), H = keys.length * 17 + 1 + 3 * 16 + 2;
const cv = makeCanvas(W, H), c = cv.getContext('2d');
c.fillStyle = '#1a1620'; c.fillRect(0, 0, W, H);
keys.forEach((k, j) => {
  const d = TL.tileDef(T[k]);
  for (let v = 0; v < Math.min(nv, d.variants); v++) {
    const x = 1 + v * 17, y = 1 + j * 17;
    if (d.layer !== 'ground') TL.drawTilePreview(c, T[GROUND], x, y, 0, v);
    TL.drawTilePreview(c, d.id, x, y, 0.001, v);
  }
});
const y0 = keys.length * 17 + 2;
for (let ty = 0; ty < 3; ty++) for (let tx = 0; tx < 5; tx++) {
  const d = TL.tileDef(T[keys[0]]);
  if (d.layer !== 'ground') TL.drawTile(c, T[GROUND], 1 + tx * 16, y0 + ty * 16, 30 + tx, 30 + ty, 0);
  TL.drawTile(c, d.id, 1 + tx * 16, y0 + ty * 16, 30 + tx, 30 + ty, 0.001);
}
writePNG(OUT, cv.data, W, H, 8);
console.log(OUT);
