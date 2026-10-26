// tools/px/isles.mjs — prove the three things the patch tiles claim.
//   1. the border ring carries NO patch material, on any variant, so the tile
//      joins the field around it with no material change at all;
//   2. the join it makes with its surround is quieter than the surround's own
//      interior — i.e. the 16px square is gone, measured, not asserted;
//   3. the 16 variants are 16 different shapes, not one shape moved about.
import { init, field, joinRatio, gridRatio } from './field.mjs';
import { writePNG } from './png.mjs';

const TILES = process.argv[2];

async function main() {
  const TL = await init(TILES);
  const T = TL.T, P = TL.PAL;
  const row = (k, v) => console.log('  ' + k.padEnd(30) + v);
  const hex = (h) => (parseInt(h.slice(1, 3), 16) << 16) | (parseInt(h.slice(3, 5), 16) << 8) | parseInt(h.slice(5, 7), 16);

  const CASES = [
    ['SNOW_GRASS_ISLE', ['GRASS', 'GRASS_2', 'GRASS_3', 'CLOVER'], [P.snow, P.snowD, P.snowS]],
    ['DIRT_ISLE', ['GRASS', 'GRASS_2', 'GRASS_3', 'CLOVER'], [P.dirt, P.dirtM, P.dirtD, P.dirtL]],
    ['GRAVEL_ISLE', ['GRASS', 'GRASS_4', 'GRASS_3', 'CLOVER'], [P.scree, P.screeM, P.screeL, P.screeD]],
    ['COBBLE_ISLE', ['DIRT'], [P.cobble, P.cobbleD, P.cobbleL, P.cobbleH]],
    ['PATH_ISLE', ['COBBLE'], [P.path, P.pathM, P.pathW, P.pathD, P.pathXD]],
  ];

  for (const [isle, sur, patch] of CASES) {
    if (T[isle] == null) { console.log(`${isle}: MISSING`); continue; }
    console.log(isle);
    const d = TL.tileDef(T[isle]);
    const bad = new Set();
    const bank = patch.map(hex);
    const sigs = new Set();
    let leaked = 0;
    for (let v = 0; v < d.variants; v++) {
      const img = field(T[isle], 1, 1, 0, 0);
      // drawTilePreview so the exact variant is forced
      const { makeCanvas } = await import('./field.mjs');
      const cv = makeCanvas(16, 16); const cx = cv.getContext('2d');
      TL.drawTilePreview(cx, T[isle], 0, 0, 0, v);
      let sig = '';
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const i = (y * 16 + x) * 4;
        const c = (cv.data[i] << 16) | (cv.data[i + 1] << 8) | cv.data[i + 2];
        const isPatch = bank.indexOf(c) >= 0;
        if (isPatch) sig += `${x},${y};`;
        if (isPatch && (x === 0 || y === 0 || x === 15 || y === 15)) { leaked++; bad.add(`v${v} @${x},${y}`); }
      }
      sigs.add(sig);
      void img;
    }
    row('patch pixels on the border', leaked === 0 ? '0  (ring is pure surround)' : `${leaked}  ${Array.from(bad).slice(0, 4).join(' ')}`);
    row('distinct silhouettes', `${sigs.size} / ${d.variants}`);

    // 2. the join with the surround, measured like any other material boundary
    const pick = (tx, ty) => (TL.tileHash(300 + tx, 300 + ty, 11) % 9 === 0)
      ? T[isle] : T[sur[TL.tileHash(300 + tx, 300 + ty, 5) % sur.length]];
    const keyOf = (tx, ty) => (pick(tx, ty) === T[isle] ? 'isle' : 'sur');
    const img = field(pick, 20, 20, 300, 300);
    const j = joinRatio(img, keyOf);
    row('isle|surround join ratio', `${j.ratio.toFixed(2)}  (border ${j.border.toFixed(2)} / inner ${j.inner.toFixed(2)}, ${j.joins} joins)`);
    // and the same field with the ORIGINAL square tile, for the A/B
    const src = { SNOW_GRASS_ISLE: 'SNOW_GRASS', DIRT_ISLE: 'DIRT', GRAVEL_ISLE: 'GRAVEL', COBBLE_ISLE: 'COBBLE', PATH_ISLE: 'DIRT_PATH' }[isle];
    const pick0 = (tx, ty) => (TL.tileHash(300 + tx, 300 + ty, 11) % 9 === 0)
      ? T[src] : T[sur[TL.tileHash(300 + tx, 300 + ty, 5) % sur.length]];
    const key0 = (tx, ty) => (pick0(tx, ty) === T[src] ? 'isle' : 'sur');
    const j0 = joinRatio(field(pick0, 20, 20, 300, 300), key0);
    row(`  was, with ${src}`, `${j0.ratio.toFixed(2)}  (border ${j0.border.toFixed(2)})`);
    row('whole-field grid ratio', `${gridRatio(img).ratio.toFixed(2)}   was ${gridRatio(field(pick0, 20, 20, 300, 300)).ratio.toFixed(2)}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
