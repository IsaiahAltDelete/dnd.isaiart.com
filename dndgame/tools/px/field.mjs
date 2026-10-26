// tools/px/field.mjs — render a field of tiles headlessly and measure it with
// the audit's own metrics. `init()` loads the mirrored copy of render/tiles.js
// (see mirror.mjs) so node 14 can parse it.
import './shim.mjs';
import { makeCanvas } from './shim.mjs';
import { lplane, mean, autocorr } from './png.mjs';
import { pathToFileURL } from 'node:url';

export let TL = null;
export async function init(mjsPath) {
  TL = await import(pathToFileURL(mjsPath).href);
  return TL;
}

/**
 * Paint a tw x th field of tiles. `pick(tx, ty)` returns the tile id; world
 * coords are (ox + tx, oy + ty) so the variation hash behaves exactly as it does
 * in game.
 */
export function field(pick, tw, th, ox = 0, oy = 0, t = 0) {
  const cv = makeCanvas(tw * 16, th * 16);
  const cx = cv.getContext('2d');
  for (let ty = 0; ty < th; ty++) {
    for (let tx = 0; tx < tw; tx++) {
      const id = typeof pick === 'function' ? pick(tx, ty) : pick;
      if (id == null) continue;
      TL.drawTile(cx, id, tx * 16, ty * 16, ox + tx, oy + ty, t);
    }
  }
  return { data: cv.data, w: cv.width, h: cv.height, cv };
}

/**
 * GRID VISIBILITY. mean |dL*| across the pixel pairs that straddle a 16px tile
 * border, over mean |dL*| across adjacent pairs strictly inside a tile. 1.0 =
 * the border is statistically indistinguishable from the tile's middle.
 */
export function gridRatio(img) {
  const L = lplane(img.data, img.w, img.h);
  const border = [], inner = [];
  for (let y = 0; y < img.h; y++) for (let x = 1; x < img.w; x++) (x % 16 === 0 ? border : inner).push(Math.abs(L[y * img.w + x] - L[y * img.w + x - 1]));
  for (let x = 0; x < img.w; x++) for (let y = 1; y < img.h; y++) (y % 16 === 0 ? border : inner).push(Math.abs(L[y * img.w + x] - L[(y - 1) * img.w + x]));
  return { ratio: mean(inner) ? mean(border) / mean(inner) : 0, border: mean(border), inner: mean(inner) };
}

/**
 * The same thing restricted to the seams between two different materials: the
 * number the judge quoted as "GRAVEL<->dirt is 809 joins at grid ratio 3.03".
 */
export function joinRatio(img, keyOf) {
  const L = lplane(img.data, img.w, img.h);
  const border = [], inner = [];
  let joins = 0;
  const tw = img.w >> 4, th = img.h >> 4;
  for (let y = 0; y < img.h; y++) for (let x = 16; x < img.w; x += 16) {
    if (keyOf((x >> 4) - 1, y >> 4) === keyOf(x >> 4, y >> 4)) continue;
    border.push(Math.abs(L[y * img.w + x] - L[y * img.w + x - 1]));
  }
  for (let x = 0; x < img.w; x++) for (let y = 16; y < img.h; y += 16) {
    if (keyOf(x >> 4, (y >> 4) - 1) === keyOf(x >> 4, y >> 4)) continue;
    border.push(Math.abs(L[y * img.w + x] - L[(y - 1) * img.w + x]));
  }
  for (let y = 0; y < img.h; y++) for (let x = 1; x < img.w; x++) if (x % 16) inner.push(Math.abs(L[y * img.w + x] - L[y * img.w + x - 1]));
  for (let x = 0; x < img.w; x++) for (let y = 1; y < img.h; y++) if (y % 16) inner.push(Math.abs(L[y * img.w + x] - L[(y - 1) * img.w + x]));
  for (let ty = 0; ty < th; ty++) for (let tx = 0; tx < tw; tx++) {
    if (tx + 1 < tw && keyOf(tx, ty) !== keyOf(tx + 1, ty)) joins++;
    if (ty + 1 < th && keyOf(tx, ty) !== keyOf(tx, ty + 1)) joins++;
  }
  return { ratio: mean(inner) ? mean(border) / mean(inner) : 0, border: mean(border), inner: mean(inner), joins };
}

/** Per-column L* means — the series the quay is judged on. */
export function colMeans(img, y0 = 0, h = img.h) {
  const L = lplane(img.data, img.w, img.h);
  const out = [];
  for (let x = 0; x < img.w; x++) { let s = 0; for (let y = y0; y < y0 + h; y++) s += L[y * img.w + x]; out.push(s / h); }
  return out;
}

export { autocorr, mean, makeCanvas };
