// tools/px/before.mjs — reconstruct the PRE-PASS renderer from the current one
// so every number in the report is an A/B of the same metric on the same
// harness, not a comparison against a remembered figure.
import { readFileSync, writeFileSync } from 'node:fs';

const src = process.argv[2], dst = process.argv[3];
let s = readFileSync(src, 'utf8');
let n = 0;
const sub = (a, b) => {
  if (s.indexOf(a) < 0) { console.error('NOT FOUND:\n' + a.slice(0, 120)); process.exit(1); }
  s = s.replace(a, b); n++;
};

// --- the waterline: one jag for the family, amplitude-1 sines ---------------
sub(`  const BANK_JAG = [], BANK_AMP = [];
  for (let vi = 0; vi < 16; vi++) {
    const f = fr(SEAM.bank + vi * 37);
    const row = new Int8Array(16);
    // ends stay 0: they belong to the shared edge, not to this tile's variant
    for (let i = 1; i < 15; i++) row[i] = f() < 0.34 ? 1 : 0;
    BANK_JAG.push(row);
    BANK_AMP.push([(f() * 2 - 1), (f() * 2 - 1) * 0.7, (f() * 2 - 1) * 0.5]);
  }`,
`  const BANK_JAG = []; { const f = fr(SEAM.bank); for (let i = 0; i < 16; i++) BANK_JAG.push(f() < 0.34 ? 1 : 0); }
  BANK_JAG[0] = 0; BANK_JAG[15] = 0;`);

sub(`    // …and everything between them from this tile's own variant.
    const jag = BANK_JAG[vi], am = BANK_AMP[vi];
    const a1 = am[0] * amp, a2 = am[1] * amp, a3 = am[2] * amp;
    for (let i = 0; i < 16; i++) {
      const end = i === 0 ? e0 : (i === 15 ? e1 : 0);
      let d = base + end + jag[i]
        + Math.round(a1 * Math.sin(Math.PI * i / 15)
          + a2 * Math.sin(2 * Math.PI * i / 15)
          + a3 * Math.sin(3 * Math.PI * i / 15));`,
`    const a1 = amp * (((vi >> 1) & 1) ? 1 : -1), a2 = ((vi >> 2) & 1) ? 1 : 0;
    for (let i = 0; i < 16; i++) {
      const end = i === 0 ? e0 : (i === 15 ? e1 : 0);
      let d = base + end + BANK_JAG[i]
        + Math.round(a1 * Math.sin(Math.PI * i / 15))
        + Math.round(a2 * Math.sin(2 * Math.PI * i / 15));`);

sub(`      const es = i === 0 ? e0 : e1;
      const fs = (i === 0 || i === 15) ? es * 83 + 41 : vi * 53 + i * 16;
      const gs = (i === 0 || i === 15) ? es * 61 + 19 : vi * 29 + i * 7;
      if (BANK_RIP[(fs + d) & 255]) {`, `      if (BANK_RIP[(i * 16 + d) & 255]) {`);
sub(`      if (BANK_RIP[(gs + 3) & 255] && d > 2) {`, `      if (BANK_RIP[(i * 7 + 3) & 255] && d > 2) {`);

sub(`        for (let i = 0; i < 5; i++) { const lw = 4 + Math.floor(r() * 5); mark(c, PAL.waterD, x, y, inX(r, lw), inY(r, 1), lw, 1); }`,
  `        for (let i = 0; i < 4; i++) { const lw = 4 + Math.floor(r() * 5); mark(c, PAL.waterD, x, y, inX(r, lw), inY(r, 1), lw, 1); }`);
sub(`        const cy0 = 3 + Math.floor(r() * 6), cw = 4 + Math.floor(r() * 3);
        const cx0 = 2 + Math.floor(r() * 7), cx1 = 1 + Math.floor(r() * 8), cgap = 2 + Math.floor(r() * 3);
        const cy = cy0 + ((f * 3) % 7);
        mark(c, PAL.waterL, x, y, cx0, cy, cw, 1);
        mark(c, PAL.waterL, x, y, cx1, cy + cgap, cw - 1, 1);`,
`        const cy = 5 + ((f * 3) % 7);
        mark(c, PAL.waterL, x, y, 6, cy, 5, 1);
        mark(c, PAL.waterL, x, y, 4, cy + 3, 4, 1);`);

// --- ICE -------------------------------------------------------------------
sub(`  def('ICE', 'Ice', SLOW, { group: 'ice', biomes: ['tundra', 'mountain'], variants: 6 }, (c, x, y, v) => {
    const r = sr(v);
    R(c, PAL.ice, x, y, 16, 16);
    for (let i = 0; i < 3; i++) {
      let cx = 1 + Math.floor(r() * 13), cy = 1 + Math.floor(r() * 7);
      const len = 4 + Math.floor(r() * 6);
      for (let s = 0; s < len; s++) { mark(c, PAL.iceD, x, y, cx, cy, 1, 1); cx += r() < 0.5 ? 1 : 0; cy += 1; if (cy > 14) break; }
    }
    for (let i = 0; i < 3; i++) { const lw = 4 + Math.floor(r() * 4); mark(c, PAL.iceL, x, y, inX(r, lw), inY(r, 1), lw, 1); }
    speck(c, PAL.iceL, x, y, 5, r);
    speck(c, PAL.iceD, x, y, 3, r);`,
`  def('ICE', 'Ice', SLOW, { group: 'ice', biomes: ['tundra', 'mountain'], variants: 3 }, (c, x, y, v) => {
    const r = sr(v);
    R(c, PAL.ice, x, y, 16, 16);
    for (let i = 0; i < 3; i++) {
      let cx = x + Math.floor(r() * 14), cy = y + Math.floor(r() * 6);
      for (let s = 0; s < 6; s++) { P(c, PAL.iceD, cx, cy); cx += r() < 0.5 ? 1 : 0; cy += 1; if (cy > y + 15) break; }
    }
    H(c, PAL.iceL, x + 2, y + 3, 6); H(c, PAL.iceL, x + 8, y + 10, 5);`);

// --- WATER: variant count, swell count, and the clipped crest ---------------
sub(`def('WATER', 'Water', WATER | SLOW, { group: 'water', biomes: ['coast', 'plains', 'marsh'], variants: 8, animFrames: 4, fps: 3 }`,
  `def('WATER', 'Water', WATER | SLOW, { group: 'water', biomes: ['coast', 'plains', 'marsh'], variants: 4, animFrames: 4, fps: 3 }`);
sub(`      for (let i = 0; i < 6; i++) { const lw = 5 + Math.floor(r() * 5); mark(c, PAL.waterD, x, y, inX(r, lw), inY(r, 1), lw, 1); }`,
  `      for (let i = 0; i < 5; i++) { const lw = 5 + Math.floor(r() * 5); mark(c, PAL.waterD, x, y, inX(r, lw), inY(r, 1), lw, 1); }`);
sub(`      const cl = 4 + Math.floor(r() * 4), c0 = inX(r, cl + 1);
      const c1 = inX(r, 5), phase = Math.floor(r() * 16);`,
`      const c0 = 1 + Math.floor(r() * 8), cl = 4 + Math.floor(r() * 4);
      const c1 = 7 + Math.floor(r() * 6), phase = Math.floor(r() * 16);`);
sub(`      const cy = y + 1 + ((f * 4 + phase) % 13);
      mark(c, PAL.waterL, x, y, c0, cy - y, cl, 1);
      mark(c, PAL.waterL, x, y, c1, cy - y + 1, 4, 1);`,
`      const cy = y + ((f * 4 + phase) % 16);
      mark(c, PAL.waterL, x, y, c0, cy - y, cl, 1);
      mark(c, PAL.waterL, x, y, c1, (cy - y + 1) % 16, 4, 1);`);

// --- the granite ramp ------------------------------------------------------
sub(`  granite: '#94969f', graniteL: '#b5b8c2', graniteH: '#d2d5df',
  graniteD: '#6b6d76', graniteM: '#a2a5ae', graniteXD: '#2f3036',`,
`  granite: '#767881', graniteL: '#979aa5', graniteH: '#b4b7c2',
  graniteD: '#54565e', graniteM: '#84878f', graniteXD: '#2f3036',`);

writeFileSync(dst, s);
console.log(`reverted ${n} hunks -> ${dst}`);
