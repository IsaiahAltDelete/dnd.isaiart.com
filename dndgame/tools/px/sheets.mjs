// tools/px/sheets.mjs — the pictures. Every claim in the report has one.
import { init, field, makeCanvas } from './field.mjs';
import { writePNG } from './png.mjs';
import { mkdirSync } from 'node:fs';

const TILES = process.argv[2], OUT = process.argv[3], TAG = process.argv[4] || '';

async function main() {
  const TL = await init(TILES);
  mkdirSync(OUT, { recursive: true });
  const T = TL.T, H = TL.tileHash;
  const put = (name, img, scale) => writePNG(`${OUT}/${name}${TAG}.png`, img.data, img.w, img.h, scale);

  // 1. every SNOW_GRASS_ISLE variant, side by side, plus 125 of them as placed
  if (T.SNOW_GRASS_ISLE != null) {
    const d = TL.tileDef(T.SNOW_GRASS_ISLE);
    const cv = makeCanvas(d.variants * 16, 16); const cx = cv.getContext('2d');
    for (let v = 0; v < d.variants; v++) TL.drawTilePreview(cx, T.SNOW_GRASS_ISLE, v * 16, 0, 0, v);
    put('isle-snow-variants', { data: cv.data, w: cv.width, h: cv.height }, 6);
  }
  for (const k of ['DIRT_ISLE', 'GRAVEL_ISLE', 'COBBLE_ISLE', 'PATH_ISLE']) {
    if (T[k] == null) continue;
    const d = TL.tileDef(T[k]);
    const cv = makeCanvas(d.variants * 16, 16); const cx = cv.getContext('2d');
    for (let v = 0; v < d.variants; v++) TL.drawTilePreview(cx, T[k], v * 16, 0, 0, v);
    put(`isle-${k.toLowerCase()}-variants`, { data: cv.data, w: cv.width, h: cv.height }, 6);
  }

  // 2. Neverwinter Wood as it is generated: grass noise with 1-in-18 snow.
  //    Left half = today's SNOW_GRASS square, right half = the patch tile.
  {
    const mix = ['GRASS', 'GRASS', 'GRASS_2', 'GRASS_2', 'GRASS_TALL', 'CLOVER', 'GRASS_3'];
    const pick = (tx, ty, isle) => {
      const h = H(300 + tx, 300 + ty, 11) % 18;
      if (h === 0) return isle && T.SNOW_GRASS_ISLE != null ? T.SNOW_GRASS_ISLE : T.SNOW_GRASS;
      return T[mix[h % mix.length]];
    };
    put('wood-before', field((tx, ty) => pick(tx, ty, false), 25, 15, 300, 300), 1);
    put('wood-after', field((tx, ty) => pick(tx, ty, true), 25, 15, 300, 300), 1);
    put('wood-before-2x', field((tx, ty) => pick(tx, ty, false), 13, 9, 300, 300), 3);
    put('wood-after-2x', field((tx, ty) => pick(tx, ty, true), 13, 9, 300, 300), 3);
  }

  // 3. Triboar: grass with lone DIRT and GRAVEL tiles.
  {
    const mix = ['GRASS_4', 'GRASS_4', 'GRASS', 'GRASS_3', 'CLOVER', 'GRASS_2'];
    const pick = (tx, ty, isle) => {
      const h = H(500 + tx, 500 + ty, 5) % 22;
      if (h === 0) return isle && T.DIRT_ISLE != null ? T.DIRT_ISLE : T.DIRT;
      if (h === 1) return isle && T.GRAVEL_ISLE != null ? T.GRAVEL_ISLE : T.GRAVEL;
      return T[mix[h % mix.length]];
    };
    put('triboar-before', field((tx, ty) => pick(tx, ty, false), 13, 9, 500, 500), 3);
    put('triboar-after', field((tx, ty) => pick(tx, ty, true), 13, 9, 500, 500), 3);
  }

  // 4. Conyberry: bare earth with lone COBBLE tiles.
  {
    const pick = (tx, ty, isle) => {
      const h = H(700 + tx, 700 + ty, 9) % 14;
      if (h === 0) return isle && T.COBBLE_ISLE != null ? T.COBBLE_ISLE : T.COBBLE;
      return h < 4 ? T.GRASS_4 : T.DIRT;
    };
    put('conyberry-before', field((tx, ty) => pick(tx, ty, false), 13, 9, 700, 700), 3);
    put('conyberry-after', field((tx, ty) => pick(tx, ty, true), 13, 9, 700, 700), 3);
  }

  // 5. Neverwinter: a paved ward with lone DIRT_PATH tiles.
  {
    const pick = (tx, ty, isle) => {
      const h = H(900 + tx, 900 + ty, 13) % 12;
      if (h === 0) return isle && T.PATH_ISLE != null ? T.PATH_ISLE : T.DIRT_PATH;
      return h < 6 ? T.COBBLE : T.FLAGSTONE;
    };
    put('nw-paving-before', field((tx, ty) => pick(tx, ty, false), 13, 9, 900, 900), 3);
    put('nw-paving-after', field((tx, ty) => pick(tx, ty, true), 13, 9, 900, 900), 3);
  }

  // 6. the dirt-group mosaic that tileSubgroup exists to unblock
  {
    const set = ['GRAVEL', 'DIRT', 'DIRT_PATH', 'MUD', 'FARMLAND'];
    put('dirt-mosaic-3x', field((tx, ty) => T[set[H(100 + tx, 100 + ty, 3) % 5]], 13, 9, 100, 100), 3);
    put('gravel-dirt-3x', field((tx, ty) => T[['GRAVEL', 'DIRT'][H(100 + tx, 100 + ty, 3) % 2]], 13, 9, 100, 100), 3);
  }

  // 7. water and ice fields, for the stamp
  put('water-field', field(T.WATER, 13, 9, 60, 60), 3);
  put('ice-field', field(T.ICE, 13, 9, 60, 60), 3);

  // 8. the rock on each of its grounds, in one strip
  {
    const grounds = ['GRAVEL', 'CAVE_FLOOR', 'DIRT', 'GRASS'];
    const cv = makeCanvas(grounds.length * 48, 48); const cx = cv.getContext('2d');
    grounds.forEach((g, i) => {
      for (let ty = 0; ty < 3; ty++) for (let tx = 0; tx < 3; tx++) TL.drawTile(cx, T[g], i * 48 + tx * 16, ty * 16, 5 + tx, 5 + ty, 0);
      TL.drawTile(cx, T.ROCK, i * 48 + 16, 16, 6, 6, 0);
    });
    put('rock-strip', { data: cv.data, w: cv.width, h: cv.height }, 5);
  }
  console.log('sheets ->', OUT);
}
main().catch((e) => { console.error(e); process.exit(1); });
