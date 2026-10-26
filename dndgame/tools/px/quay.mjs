// tools/px/quay.mjs — the waterline's periodicity, measured on the bank itself
// rather than on a lightness threshold (open water sits at L* 45.3, INSIDE the
// bank's own value range, so a threshold measures the wave crests instead).
// A pixel belongs to the bank when its colour is exactly one of the bank tones.
import { init, field, autocorr, mean } from './field.mjs';
import { writePNG, sd, lplane } from './png.mjs';
import { mkdirSync } from 'node:fs';

const TILES = process.argv[2], OUT = process.argv[3], TAG = process.argv[4] || '';

async function main() {
  const TL = await init(TILES);
  mkdirSync(OUT, { recursive: true });
  const P = TL.PAL;
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const BANK = {
    QUAY: [P.quay, P.quayD, P.deepD, P.shallowD, P.quayL, P.foam].map(hex),
    SHORE: [P.silt, P.siltM, P.siltD, P.shallowD, P.foam].map(hex),
  };
  const row = (k, v) => console.log('  ' + k.padEnd(30) + v);

  for (const fam of ['QUAY', 'SHORE']) {
    if (TL.T[`${fam}_N`] == null) continue;
    const img = field(TL.T[`${fam}_N`], 36, 1, 200, 7);
    writePNG(`${OUT}/${fam.toLowerCase()}-strip${TAG}.png`, img.data, img.w, img.h, 5);
    const set = BANK[fam];
    const isBank = (x, y) => {
      const i = (y * img.w + x) * 4, r = img.data[i], g = img.data[i + 1], b = img.data[i + 2];
      for (const c of set) if (c[0] === r && c[1] === g && c[2] === b) return true;
      return false;
    };
    const depth = [];
    for (let x = 0; x < img.w; x++) { let d = 0; for (let y = 0; y < 16; y++) { if (!isBank(x, y)) break; d = y + 1; } depth.push(d); }
    console.log(`${fam}  (36 tiles, ${fam}_N)`);
    row('bank depth mean / SD', `${mean(depth).toFixed(2)} / ${sd(depth).toFixed(2)}`);
    row('depth lag-16 autocorr', autocorr(depth, 16).toFixed(3));
    row('depth lag-32 autocorr', autocorr(depth, 32).toFixed(3));
    for (const px of [0, 1, 7, 14, 15]) {
      const v = []; for (let t = 0; t < 36; t++) v.push(depth[t * 16 + px]);
      row(`per-tile depth SD at px ${px}`, sd(v).toFixed(3));
    }
    // seam continuity: the two columns either side of a tile border must agree
    let step = 0, seams = 0;
    for (let t = 1; t < 36; t++) { seams++; if (depth[t * 16] !== depth[t * 16 - 1]) step++; }
    row('bank steps at a tile border', `${step} / ${seams}`);
    // how many distinct foam layouts across the 36 tiles
    const sigs = new Set();
    for (let t = 0; t < 36; t++) {
      let s = '';
      for (let x = 0; x < 16; x++) for (let y = 0; y < 16; y++) {
        const i = ((y * img.w) + t * 16 + x) * 4;
        if (img.data[i] === 0xa9 && img.data[i + 1] === 0xd8 && img.data[i + 2] === 0xee) s += `${x},${y};`;
      }
      sigs.add(s);
    }
    row('distinct foam layouts / 36', String(sigs.size));
    const L = lplane(img.data, img.w, img.h);
    const cm = []; for (let x = 0; x < img.w; x++) { let s = 0; for (let y = 0; y < 16; y++) s += L[y * img.w + x]; cm.push(s / 16); }
    row('col-mean lag-16 autocorr', autocorr(cm, 16).toFixed(3));
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
