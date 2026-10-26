// tools/px/audit.mjs — the before/after numbers, all of them, in one run.
//   node tools/px/mirror.mjs src <scratch>/src
//   node tools/px/audit.mjs <scratch>/src/render/tiles.mjs <outdir>
import { init, field, gridRatio, joinRatio, colMeans, autocorr, mean, makeCanvas } from './field.mjs';
import { writePNG, lab, dE76, lplane, sd } from './png.mjs';
import { mkdirSync } from 'node:fs';

const TILES = process.argv[2];
const OUT = process.argv[3] || './out';

async function main() {
  const TL = await init(TILES);
  mkdirSync(OUT, { recursive: true });
  const T = TL.T;
  const row = (k, v) => console.log('  ' + k.padEnd(32) + v);

  console.log('== grid-visibility ratio (single family, 14x14) ==');
  for (const k of ['GRASS', 'GRASS_2', 'GRASS_3', 'GRASS_4', 'DIRT', 'DIRT_PATH', 'CAVE_FLOOR',
    'COBBLE', 'GRAVEL', 'SAND', 'MUD', 'SNOW', 'SNOW_GRASS', 'FARMLAND', 'WATER', 'ICE',
    'DUNGEON_FLOOR', 'FLAGSTONE', 'STONE_FLOOR', 'WOOD_FLOOR', 'BONE_FLOOR',
    'SNOW_GRASS_ISLE', 'DIRT_ISLE', 'GRAVEL_ISLE', 'COBBLE_ISLE']) {
    if (T[k] == null) continue;
    const g = gridRatio(field(T[k], 14, 14, 40, 40));
    row(k, `${g.ratio.toFixed(2)}  (border ${g.border.toFixed(2)} / inner ${g.inner.toFixed(2)})`);
  }

  {
    const mix = ['GRASS', 'GRASS_2', 'GRASS_3', 'GRASS_4'].map((k) => T[k]);
    const img = field((tx, ty) => mix[TL.tileHash(40 + tx, 40 + ty, 7) % 4], 14, 14, 40, 40);
    const L = lplane(img.data, img.w, img.h);
    const per = [];
    for (let ty = 0; ty < 14; ty++) for (let tx = 0; tx < 14; tx++) {
      let s = 0; for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) s += L[(ty * 16 + y) * img.w + tx * 16 + x];
      per.push(s / 256);
    }
    console.log('\n== do-not-regress ==');
    row('mixed grass per-tile L* SD', sd(per).toFixed(3) + '   (must stay 0.47-0.49)');
    row('mixed grass grid ratio', gridRatio(img).ratio.toFixed(2));
    writePNG(`${OUT}/grass-mixed.png`, img.data, img.w, img.h, 3);
  }

  console.log('\n== family mean L* ==');
  for (const k of ['GRASS', 'DIRT', 'DIRT_PATH', 'GRAVEL', 'MUD', 'FARMLAND', 'COBBLE', 'SNOW_GRASS', 'SNOW',
    'SNOW_GRASS_ISLE', 'DIRT_ISLE', 'GRAVEL_ISLE', 'COBBLE_ISLE']) {
    if (T[k] == null) continue;
    const img = field(T[k], 8, 8, 40, 40);
    row(k, mean(Array.from(lplane(img.data, img.w, img.h))).toFixed(2));
  }

  {
    console.log('\n== dirt-group joins (the 1,623) ==');
    const set = ['GRAVEL', 'DIRT', 'DIRT_PATH', 'MUD', 'FARMLAND'];
    const keyOf = (tx, ty) => set[TL.tileHash(100 + tx, 100 + ty, 3) % set.length];
    const img = field((tx, ty) => T[keyOf(tx, ty)], 16, 16, 100, 100);
    const j = joinRatio(img, keyOf);
    row('all dirt-group', `${j.ratio.toFixed(2)}  border ${j.border.toFixed(2)} inner ${j.inner.toFixed(2)}  joins ${j.joins}`);
    writePNG(`${OUT}/dirt-mosaic.png`, img.data, img.w, img.h, 3);
    const two = ['GRAVEL', 'DIRT'];
    const k2 = (tx, ty) => two[TL.tileHash(100 + tx, 100 + ty, 3) % 2];
    const img2 = field((tx, ty) => T[k2(tx, ty)], 16, 16, 100, 100);
    const j2 = joinRatio(img2, k2);
    row('GRAVEL<->DIRT', `${j2.ratio.toFixed(2)}  joins ${j2.joins}`);
    writePNG(`${OUT}/gravel-dirt.png`, img2.data, img2.w, img2.h, 3);

    console.log('');
    if (TL.tileSubgroup) {
      const seen = Object.create(null);
      for (const k of Object.keys(T)) { const g = TL.tileGroup(T[k]), s = TL.tileSubgroup(T[k]); if (g !== s) (seen[`${g} -> ${s}`] = seen[`${g} -> ${s}`] || []).push(k); }
      for (const k of Object.keys(seen)) row(k, `${seen[k].length}: ${seen[k].slice(0, 6).join(' ')}${seen[k].length > 6 ? ' …' : ''}`);
      row('subgroup==group elsewhere', String(Object.keys(T).filter((k) => TL.tileGroup(T[k]) === TL.tileSubgroup(T[k])).length));
    } else console.log('  tileSubgroup: NOT EXPORTED');
    if (TL.isleTileFor) {
      console.log('');
      for (const k of ['SNOW_GRASS', 'DIRT', 'GRAVEL', 'COBBLE', 'GRASS', 'MUD', 'WATER'])
        if (T[k] != null) row(`isleTileFor(${k})`, String(TL.isleTileFor(T[k])) + ' ' + (TL.isleTileFor(T[k]) ? TL.tileKey(TL.isleTileFor(T[k])) : ''));
    } else console.log('  isleTileFor: NOT EXPORTED');
  }

  {
    console.log('\n== quay / shore periodicity ==');
    for (const fam of ['QUAY', 'SHORE']) {
      if (T[`${fam}_N`] == null) continue;
      const img = field(T[`${fam}_N`], 36, 1, 200, 7);
      writePNG(`${OUT}/${fam.toLowerCase()}-strip.png`, img.data, img.w, img.h, 4);
      const L = lplane(img.data, img.w, img.h);
      const depth = [];
      for (let x = 0; x < img.w; x++) { let d = 0; for (let y = 0; y < 16; y++) { if (L[y * img.w + x] < 46) d = y + 1; else break; } depth.push(d); }
      row(`${fam} depth lag-16 autocorr`, autocorr(depth, 16).toFixed(3));
      row(`${fam} depth lag-32 autocorr`, autocorr(depth, 32).toFixed(3));
      for (const px of [1, 14]) { const v = []; for (let t = 0; t < 36; t++) v.push(depth[t * 16 + px]); row(`${fam} depth SD at pixel ${px}`, sd(v).toFixed(3)); }
      row(`${fam} depth mean / SD`, `${mean(depth).toFixed(2)} / ${sd(depth).toFixed(2)}`);
      row(`${fam} colmean lag-16 autocorr`, autocorr(colMeans(img), 16).toFixed(3));
    }
  }

  {
    console.log('\n== lag-16 autocorrelation of per-column mean L* (24 wide) ==');
    for (const k of ['GRASS', 'DIRT', 'DIRT_PATH', 'GRAVEL', 'COBBLE', 'SAND', 'MUD', 'SNOW', 'SNOW_GRASS', 'WATER', 'ICE', 'CAVE_FLOOR']) {
      if (T[k] == null) continue;
      row(k, autocorr(colMeans(field(T[k], 24, 3, 60, 60)), 16).toFixed(3));
    }
  }

  {
    console.log('\n== ROCK prop separation ==');
    for (const g of ['GRAVEL', 'CAVE_FLOOR', 'DIRT', 'GRASS']) {
      const bg = field(T[g], 3, 3, 5, 5);
      const cv = makeCanvas(48, 48); const cx = cv.getContext('2d');
      for (let ty = 0; ty < 3; ty++) for (let tx = 0; tx < 3; tx++) TL.drawTile(cx, T[g], tx * 16, ty * 16, 5 + tx, 5 + ty, 0);
      TL.drawTile(cx, T.ROCK, 16, 16, 6, 6, 0);
      writePNG(`${OUT}/rock-on-${g.toLowerCase()}.png`, cv.data, 48, 48, 6);
      const A = [], B = [];
      for (let y = 16; y < 32; y++) for (let x = 16; x < 32; x++) {
        const i = (y * 48 + x) * 4;
        if (cv.data[i] !== bg.data[i] || cv.data[i + 1] !== bg.data[i + 1] || cv.data[i + 2] !== bg.data[i + 2]) A.push(lab(cv.data[i], cv.data[i + 1], cv.data[i + 2]));
      }
      for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
        if (x >= 14 && x < 34 && y >= 14 && y < 34) continue;
        const j = (y * 48 + x) * 4; B.push(lab(bg.data[j], bg.data[j + 1], bg.data[j + 2]));
      }
      const avg = (v) => [mean(v.map((q) => q[0])), mean(v.map((q) => q[1])), mean(v.map((q) => q[2]))];
      const ra = avg(A), gb = avg(B);
      row(`ROCK on ${g}`, `dE76 ${dE76(ra, gb).toFixed(2)}  dL* ${(ra[0] - gb[0]).toFixed(2)}  da* ${(ra[1] - gb[1]).toFixed(2)}  db* ${(ra[2] - gb[2]).toFixed(2)}  (${A.length}px)`);
    }
  }

  {
    const skip = new Set(['wall', 'cave-wall', 'cliff', 'door', 'roof']);
    const missing = []; let n = 0;
    for (const id of TL.allTileIds()) {
      const d = TL.tileDef(id);
      if (d.layer !== 'deco' || skip.has(d.group)) continue;
      n++;
      const cv = makeCanvas(16, 16); const cx = cv.getContext('2d');
      cx.fillStyle = '#808080'; cx.fillRect(0, 0, 16, 16);
      TL.drawTile(cx, id, 0, 0, 3, 3, 0);
      let dark = 0;
      for (let i = 0; i < 256; i++) {
        const r = cv.data[i * 4], g = cv.data[i * 4 + 1], b = cv.data[i * 4 + 2];
        if (r < 128 && r > 55 && Math.abs(r - g) < 12 && Math.abs(g - b) < 16) dark++;
      }
      if (dark < 4) missing.push(d.key);
    }
    console.log('');
    row('deco props checked', String(n));
    row('props with no contact shadow', `${missing.length}${missing.length ? '  ' + missing.slice(0, 14).join(' ') : ''}`);
  }

  console.log('\n  tileCount ' + TL.tileCount() + '   last id ' + TL.tileKey(TL.tileCount() - 1)
    + '   WALL_TOP_SHADE=' + T.WALL_TOP_SHADE + ' QUAY_N=' + T.QUAY_N + ' QUAY_NW=' + T.QUAY_NW);
}
main().catch((e) => { console.error(e); process.exit(1); });
