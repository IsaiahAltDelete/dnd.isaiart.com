// render/tiles_terrain.js — the natural world's brushes: terrain ramps, authored micro-sprites and the painters behind every ground and nature tile.
//
// render/tiles.js owns the REGISTRY (ids, flags, layers, the raster cache). The
// grass, earth, water, rock, snow, marsh and plant tiles registered there draw
// with the painters in this file, so the natural world is one coherent hand and
// the building/interior tiles stay in tiles.js for the architecture work.
//
// THREE RULES every painter here keeps, because each was paid for in an audit
// (see tiles.js sections 2a and 2b for the measurements):
//
//   1. THE SEAM. A mark bigger than a pixel is placed wholly inside its tile, so
//      nothing is ever sliced by the tile box and ends in mid-air at a border.
//      The border ring gets its texture from `seam()`, drawn from a FAMILY-fixed
//      generator on both sides of the tile, so the two halves of a ring mark are
//      always the same mark. Single pixels go anywhere.
//   2. NO STAMP. Every recognisable mark (a tuft, a flower, a pebble, a leaf
//      cluster) is placed by the variant hash, and families carry enough
//      variants that a field never repeats on a visible rhythm.
//   3. THE LIGHT. Upper-left, always: lit tops and left flanks, shade and cast
//      shadow down and to the right. Shadows turn cool, lights turn warm — the
//      ramps below come from palette.js `ramp()` anchored on the old base
//      colours, so every value relationship earlier passes measured (grass L*
//      47, dirt 43, path 49, water 45 ...) still holds.
//
// IMPORT RULE. This module imports only palette.js. tiles.js imports it and
// hands painters to `def()` at module evaluation, so everything tiles.js touches
// while it evaluates must be a hoisted function declaration; tables are built
// lazily behind `var` so no import order can hit a temporal dead zone.

import { ramp, mix } from './palette.js';

// ---------------------------------------------------------------------------
// 1. PRIMITIVES — the same semantics as tiles.js, so marks and seams agree.
// ---------------------------------------------------------------------------

export function R(c, col, x, y, w, h) { c.fillStyle = col; c.fillRect(x | 0, y | 0, w | 0, h | 0); }
export function P(c, col, x, y) { c.fillStyle = col; c.fillRect(x | 0, y | 0, 1, 1); }

/** A rect clipped to the tile's own 16x16 box (tile origin x, y; mark at mx, my). */
export function mark(c, col, x, y, mx, my, w, h) {
  const ax = Math.max(0, mx), ay = Math.max(0, my);
  const bx = Math.min(16, mx + w), by = Math.min(16, my + h);
  if (bx <= ax || by <= ay) return;
  R(c, col, x + ax, y + ay, bx - ax, by - ay);
}

/** mulberry32 seeded from a variation seed — the same generator tiles.js uses. */
export function sr(seed) {
  let a = (Math.imul(seed | 0, 2654435761) ^ 0x9e3779b9) >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The family-fixed generator: every tile of one family draws its ring from it. */
export function fr(salt) { return sr((0x5EA3B4 ^ Math.imul(salt | 0, 0x9E3779B1)) >>> 0); }

/** Integer hash of a pixel coordinate, for per-pixel choices with no rng state. */
export function hash(x, y, salt = 0) {
  let h = Math.imul((x | 0) + 0x9e3779b9, 0x85ebca6b);
  h ^= Math.imul((y | 0) + 0xc2b2ae35, 0x27d4eb2f);
  h ^= Math.imul((salt | 0) + 0x165667b1, 0x9e3779b1);
  h ^= h >>> 15; h = Math.imul(h, 0x2545f491); h ^= h >>> 13;
  return h >>> 0;
}

/** n 1px specks anywhere on the tile — a single pixel has no shape to slice. */
function speck(c, col, x, y, n, r) {
  for (let i = 0; i < n; i++) P(c, col, x + Math.floor(r() * 16), y + Math.floor(r() * 16));
}

/**
 * The wrapped border weave (tiles.js section 2a). Each mark is drawn twice, 16px
 * apart, from the family-fixed generator, so tile A's right-hand fragment and
 * tile B's left-hand fragment are one mark whatever variants the hash deals.
 */
function seam(c, x, y, salt, tones, n = 8, run = 4, span = 4) {
  const r = fr(salt);
  const tn = tones.length;
  for (let i = 0; i < n; i++) {
    const col = tones[Math.floor(r() * tn)];
    const w = 2 + Math.floor(r() * (span - 1));
    const k = 1 + Math.floor(r() * (w - 1));
    const h = 1 + Math.floor(r() * run);
    const t = Math.floor(r() * (17 - h));
    if (i & 1) { mark(c, col, x, y, 16 - k, t, w, h); mark(c, col, x, y, -k, t, w, h); }
    else { mark(c, col, x, y, t, 16 - k, h, w); mark(c, col, x, y, t, -k, h, w); }
  }
}

/**
 * Paint an authored micro-sprite: `rows` is a list of strings, one character per
 * pixel, '.' for nothing; `tones` maps each character to a colour. Clipped to the
 * tile, but painters place stamps wholly inside it (rule 1).
 */
export function stamp(c, x, y, sx, sy, rows, tones) {
  for (let j = 0; j < rows.length; j++) {
    const row = rows[j];
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === '.') continue;
      const col = tones[ch];
      if (col) mark(c, col, x, y, sx + i, sy + j, 1, 1);
    }
  }
}
/** Mirror a stamp left-to-right — half the authored shapes for free. */
function flip(rows) { return rows.map((s) => s.split('').reverse().join('')); }
/** A top-left for a w x h stamp that keeps it wholly inside the tile. */
function spot(r, w, h, pad = 0) {
  return [pad + Math.floor(r() * Math.max(1, 17 - w - pad * 2)), pad + Math.floor(r() * Math.max(1, 17 - h - pad * 2))];
}

// ---------------------------------------------------------------------------
// 2. THE TERRAIN PALETTE — built once, lazily (see IMPORT RULE above).
// ---------------------------------------------------------------------------

/** Per-family seam salts. Kept clear of tiles.js's 11-46 so no two rings match. */
var SALT = { sward: 101, tall: 106 };

var TP = null;
/** The palette, as one frozen object of named tones. */
export function terrainPalette() {
  if (TP) return TP;
  // Grass: 7 steps around the old #4a7c3f (L* 23 / 31 / 40 / 47 / 55 / 62 / 67).
  const g = ramp('#4a7c3f', 7, { spread: 0.36, shift: 20 });
  // Dry grass leans to straw; its darks stay green so a dry tuft still roots in turf.
  const dry = ramp('#8a9046', 5, { spread: 0.34, shift: 18 });
  // Foliage, darkest first. Broadleaf sits a value step under the grass it
  // stands in (mid L* ~40 against 47) so a canopy is a mass, not a stain, and
  // its lit clusters climb above the grass so it also reads as lit.
  // Index 3 is the body of a crown (L* 41 for oak), 4 and 5 its lit side.
  const oak = ramp('#356634', 6, { spread: 0.48, shift: 28, at: 3 });
  const oakW = ramp('#436e2e', 6, { spread: 0.48, shift: 24, at: 3 });   // a warmer, yellower crown
  const birch = ramp('#56863a', 6, { spread: 0.46, shift: 22, at: 3 });
  const willow = ramp('#44744c', 6, { spread: 0.48, shift: 24, at: 3 });
  const pine = ramp('#285840', 6, { spread: 0.52, shift: 22, at: 3 });
  const bark = ramp('#6b4a2f', 5, { spread: 0.46, shift: 16 });
  const birchBark = ramp('#b9b4a4', 4, { spread: 0.34, shift: 10 });
  // A dead snag weathers grey; sawn wood is pale heartwood going brown at the rings.
  const snag = ramp('#5a4c40', 4, { spread: 0.46, shift: 14, at: 1 });
  const woodCut = ramp('#a88660', 4, { spread: 0.32, shift: 14, at: 2 });
  // Water: 7 steps around the old #3a6ea5 (L* 21 / 28 / 36 / 45 / 55 / 63 / 70).
  const w = ramp('#3a6ea5', 7, { spread: 0.40, shift: 14 });
  // Bog water: a dark teal-olive that still carries the sky in its highlights.
  const bog = ramp('#3d5446', 6, { spread: 0.36, shift: 18, at: 3 });
  // Earth, each ramp around the old base so the family values hold: dirt L* 45,
  // path 49, mud 33, scree 41, cobble 48, pebbles lighter than all of them.
  const dirt = ramp('#856542', 7, { spread: 0.30, shift: 16 });
  const path = ramp('#887055', 7, { spread: 0.28, shift: 14 });
  const mud = ramp('#5f4a33', 6, { spread: 0.30, shift: 14, at: 3 });
  const scree = ramp('#6a5f4c', 7, { spread: 0.34, shift: 12 });
  const cob = ramp('#7a7167', 7, { spread: 0.36, shift: 12 });
  const peb = ramp('#8f8577', 5, { spread: 0.34 });
  // Rock: warm greywacke for cliffs and mountains (the old `rock` ramp's base),
  // a dark damp cave rock for cave walls, cool pale granite for loose boulders.
  const rock = ramp('#6e6759', 7, { spread: 0.46, shift: 16 });
  const cavR = ramp('#4a4136', 7, { spread: 0.40, shift: 14 });
  const gran = ramp('#8e9099', 6, { spread: 0.50, shift: 12, at: 3 });
  const cavF = ramp('#564d44', 7, { spread: 0.30, shift: 12 });
  // Dressed dungeon stone: one cool grey for flagstone and brick alike, its
  // value a step under the old grey slab (L* 45), well over the old purple brick (31).
  const dstone = ramp('#67646b', 7, { spread: 0.42, shift: 12 });
  // Loose stone: warm fieldstone for rubble among the granite, and the pale,
  // wet-looking dripstone that stalagmites are built from.
  const stoneR = ramp('#857d72', 6, { spread: 0.50, shift: 12, at: 3 });
  const drip = ramp('#83786a', 6, { spread: 0.52, shift: 14, at: 3 });
  // Reeds are olive going to straw at the tips; cattail heads a warm umber;
  // driftwood the silver-grey of wood the sea has had for a year.
  const reed = ramp('#5a7440', 5, { spread: 0.50, shift: 20 });
  const cattail = ramp('#6b4a2f', 3, { spread: 0.36, shift: 14 });
  const drift = ramp('#9a8e7c', 4, { spread: 0.46, shift: 10, at: 2 });
  TP = Object.freeze({
    dirt, path, mud, scree, cob, peb, rock, cavR, gran, cavF, dstone, stoneR, drip, reed, cattail, drift,
    cavMoss: ['#4a5e34', '#5c7040', '#72864c'],
    bone: '#d8d0b8', boneL: '#f0e9d4', boneD: '#9e9278',
    // Sand's ramp would swing its shadows orange (the short way round the hue
    // wheel from yellow to blue is through red), so its darks are picked by hand:
    // desaturated and a touch cooler, the way wet or shaded sand actually goes.
    sand: ['#9e8e6e', '#b3a47e', '#c4b486', '#d8c58c', '#e2d4a2', '#ebe1bb'],
    oak, oakW, birch, willow, pine, bark, birchBark, snag, woodCut,
    w0: w[0], w1: w[1], w2: w[2], w3: w[3], w4: w[4], w5: w[5], w6: w[6],
    wMid: mix(w[2], w[3], 0.5), wDeepMid: mix(w[1], w[2], 0.5),
    shallow: '#4b7d9b', shallowD: '#3f6582',
    foam: '#bfe2ec', glint: '#eef8fb',
    silt: '#665a46', siltM: '#524837', siltD: '#3e3629',
    quay: '#585045', quayL: '#6f665a', quayD: '#3d3830', quayXD: '#2a2723',
    bog, scum: '#8aa04e', scumL: '#aebd62', scumD: '#5e7236', bogSky: '#6e8c86',
    g0: g[0], g1: g[1], g2: g[2], g3: g[3], g4: g[4], g5: g[5], g6: g[6],
    gm: mix(g[2], g[3], 0.55),      // the soft mottle, 2-3 L* under the base
    gn: mix(g[3], g[4], 0.40),      // and 2-3 over it
    gSun: mix(g[3], g[4], 0.22),    // GRASS_3's sunnier base
    dry0: dry[0], dry1: dry[1], dry2: dry[2], dry3: dry[3], dry4: dry[4],
    clover: '#57904a', cloverL: '#6da656', cloverD: '#36633a',
    daisy: '#ece8d4', daisyC: '#e8c451',
    soil: '#6e5236', soilD: '#54402b',
  });
  return TP;
}

// ---------------------------------------------------------------------------
// 3. GRASS — tufts, clover, wildflowers, dry patches and tall grass
// ---------------------------------------------------------------------------
//
// The old sward was a felt of 1px speckle: seamless, quiet and lifeless. A lawn
// at this scale reads from TUFTS — two or three blades with lit tips springing
// from a pixel of shade — scattered sparsely over a softly mottled base. Every
// tuft is lit from the upper left: the tip is the warm light, the root shadow
// falls down and right. The base keeps the old value exactly, so the four grass
// types still average within a fraction of an L* of each other and a mixed
// field never turns into a quilt.

/**
 * Tuft shapes: h a sunlit tip, l a lit blade, s the shade at the root. Most are
 * V-fans — blades spreading from one root, which is what makes a mark read as
 * GRASS rather than as a dash. Mirrored copies are added so no fan always
 * leans one way.
 */
var TUFT_SHAPES = null;
function tufts() {
  if (TUFT_SHAPES) return TUFT_SHAPES;
  const base = [
    ['l...l', '.l.l.', '..s..'],
    ['h...h', '.l.l.', '..s..'],
    ['...l', 'l.l.', '.ls.'],
    ['l...', '.l.h', '.sl.'],
    ['..h', 'l.l', '.s.'],
    ['l.l', 'sls'],
    ['..l..', 'l.l.l', '.lsl.'],
  ];
  TUFT_SHAPES = base.concat(base.map(flip));
  return TUFT_SHAPES;
}
/** Taller fans for the lush variant. */
var LUSH_SHAPES = null;
function lush() {
  if (LUSH_SHAPES) return LUSH_SHAPES;
  const base = [
    ['h....', '.l.h.', '.lsl.', '..s..'],
    ['..h..', 'l.l.h', '.lll.', '..s..'],
    ['h..h.', '.l.l.', '.lsl.', '..s..'],
    ['...h', 'h.l.', '.ll.', '.s..'],
  ];
  LUSH_SHAPES = base.concat(base.map(flip));
  return LUSH_SHAPES;
}

/**
 * A soft, ragged-edged oval of one tone, wholly inside the tile. The ragged
 * edge is a per-pixel hash against the ellipse, so no two patches share an
 * outline and none of them is a rounded rectangle.
 */
function patch(c, col, x, y, cx, cy, rx, ry, salt) {
  const x0 = Math.max(0, Math.floor(cx - rx)), x1 = Math.min(15, Math.ceil(cx + rx));
  const y0 = Math.max(0, Math.floor(cy - ry)), y1 = Math.min(15, Math.ceil(cy + ry));
  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const dx = (px + 0.5 - cx) / rx, dy = (py + 0.5 - cy) / ry;
      const d = dx * dx + dy * dy;
      const j = ((hash(px, py, salt) & 255) / 255) * 0.5 - 0.25;
      if (d < 0.85 + j) P(c, col, x + px, y + py);
    }
  }
}
/** A random patch, kept inside the tile: radius rx..rx+dr by ry..ry+dr. */
function somePatch(c, col, x, y, r, rx, ry, dr) {
  const ax = rx + r() * dr, ay = ry + r() * dr;
  const cx = ax + 0.5 + r() * (15 - ax * 2), cy = ay + 0.5 + r() * (15 - ay * 2);
  patch(c, col, x, y, cx, cy, ax, ay, Math.floor(r() * 65535));
}

/**
 * The base every grass tile shares: flat base, soft mottles, speckle, ring. ONE
 * ring for the whole sward, whatever the tile type: GRASS beside GRASS_2 beside
 * CLOVER must paint the two halves of the same ring marks.
 */
export function sward(c, x, y, r, base) {
  const p = terrainPalette();
  R(c, base, x, y, 16, 16);
  // Mottles of uneven size and number: one dark patch in every tile was a
  // polka-dot at field scale, a spot every 16px.
  const dark = r();
  if (dark < 0.7) somePatch(c, p.gm, x, y, r, dark < 0.3 ? 1.4 : 2.2, dark < 0.3 ? 1 : 1.6, dark < 0.3 ? 1 : 2.2);
  if (dark < 0.25) somePatch(c, p.gm, x, y, r, 1.2, 0.9, 1);
  if (r() < 0.5) somePatch(c, p.gn, x, y, r, 1.6, 1.2, 1.4);
  speck(c, p.gm, x, y, 9, r);
  speck(c, p.gn, x, y, 7, r);
  speck(c, p.g2, x, y, 2, r);
  seam(c, x, y, SALT.sward, [p.gm, p.gm, p.gn, p.g3, p.gm, p.gn], 8, 3, 3);
}

/** Scatter n tufts from `shapes` in the given tones, wholly inside the tile. */
function scatterTufts(c, x, y, r, n, shapes, tones) {
  for (let i = 0; i < n; i++) {
    const s = shapes[Math.floor(r() * shapes.length)];
    const [sx, sy] = spot(r, s[0].length, s.length);
    stamp(c, x, y, sx, sy, s, tones);
  }
}

/** The everyday tuft tones: lit blades a step over the base, tips a little brighter. */
function turf(p) { return { h: p.g5, l: p.g4, s: p.g2 }; }

/** GRASS — the everyday sward: a few short tufts. */
export function paintGrass(c, x, y, v) {
  const p = terrainPalette(), r = sr(v);
  sward(c, x, y, r, p.g3);
  scatterTufts(c, x, y, r, 1 + Math.floor(r() * 3), tufts(), turf(p));
}

/** GRASS_2 — lusher: taller fans among the short ones. */
export function paintGrassLush(c, x, y, v) {
  const p = terrainPalette(), r = sr(v);
  sward(c, x, y, r, p.g3);
  scatterTufts(c, x, y, r, 1 + Math.floor(r() * 2), lush(), turf(p));
  scatterTufts(c, x, y, r, 1 + Math.floor(r() * 2), tufts(), turf(p));
}

/** GRASS_3 — a sunnier patch, with now and then a daisy. */
export function paintGrassSun(c, x, y, v) {
  const p = terrainPalette(), r = sr(v);
  sward(c, x, y, r, p.gSun);
  scatterTufts(c, x, y, r, 2 + Math.floor(r() * 2), tufts(), { h: p.g5, l: p.gn, s: p.g2 });
  if (r() < 0.25) {
    const [sx, sy] = spot(r, 3, 3, 1);
    stamp(c, x, y, sx, sy, ['.d.', 'dyd', '.s.'], { d: p.daisy, y: p.daisyC, s: p.g2 });
  }
}

/**
 * GRASS_4 — dry grass: straw tufts among green ones. The straw stays within a
 * value step of the sward (dry2/dry3, not the pale end of the ramp): at full
 * brightness a field of it was a lattice of yellow Vs, and bare-soil scuffs on
 * green read as red confetti, so there are none.
 */
export function paintGrassDry(c, x, y, v) {
  const p = terrainPalette(), r = sr(v);
  sward(c, x, y, r, p.g3);
  scatterTufts(c, x, y, r, 1 + Math.floor(r() * 3), tufts(), { h: p.dry3, l: p.dry2, s: p.dry0 });
  if (r() < 0.6) scatterTufts(c, x, y, r, 1, tufts(), turf(p));
  speck(c, p.dry2, x, y, 3, r);
}

/**
 * CLOVER — trefoil leaves in loose drifts, now and then a white clover head.
 * A drift is one to four leaves, and a tile carries one to three drifts placed
 * anywhere, so a lawn of it spreads rather than lining up in rows.
 */
export function paintClover(c, x, y, v) {
  const p = terrainPalette(), r = sr(v);
  sward(c, x, y, r, p.g3);
  const LEAF = [['.C.', 'CcC', '.s.'], ['C.C', '.c.', '.s.'], ['.CC', 'Cc.', '.s.'], ['CC.', '.cC', '.s.']];
  const drifts = 1 + Math.floor(r() * 3);
  for (let k = 0; k < drifts; k++) {
    const leaves = 1 + Math.floor(r() * 4);
    const [cx, cy] = spot(r, 3, 3);
    for (let i = 0; i < leaves; i++) {
      const s = LEAF[Math.floor(r() * LEAF.length)];
      const lx = Math.max(0, Math.min(13, cx + Math.floor(r() * 5) - 2)), ly = Math.max(0, Math.min(13, cy + Math.floor(r() * 5) - 2));
      stamp(c, x, y, lx, ly, s, { C: p.cloverL, c: p.clover, s: p.cloverD });
    }
    if (r() < 0.3) P(c, p.daisy, x + Math.min(15, cx + 1), y + cy);
  }
  scatterTufts(c, x, y, r, 1, tufts(), turf(p));
}

/**
 * Wildflowers: a few five-petal heads on stems, some in bud, over tufts.
 * `petal` / `petalD` / `eye` are the flower's own three tones.
 */
export function paintFlowers(c, x, y, v, petal, petalD, eye) {
  const p = terrainPalette(), r = sr(v);
  sward(c, x, y, r, p.g3);
  scatterTufts(c, x, y, r, 2, tufts(), turf(p));
  const HEADS = [
    ['.p.', 'pep', '.d.', '.l.'],
    ['.p.', 'pep', 'ld.', '.l.'],
    ['pp.', 'ped', '.l.'],
  ];
  const n = 3 + Math.floor(r() * 2);
  for (let i = 0; i < n; i++) {
    const s = HEADS[Math.floor(r() * HEADS.length)];
    const [sx, sy] = spot(r, 3, s.length, 1);
    stamp(c, x, y, sx, sy, r() < 0.5 ? s : flip(s), { p: petal, d: petalD, e: eye, l: p.g4 });
  }
  // a bud or two: one petal pixel on a stem
  for (let i = 0; i < 2; i++) { const [sx, sy] = spot(r, 1, 2, 1); P(c, petalD, x + sx, y + sy); P(c, p.g4, x + sx, y + sy + 1); }
}

/**
 * TALL GRASS — the encounter tile. It used to be a dark 16px square: a hard
 * edge on four sides in every meadow. Now the ground under it is the same sward
 * as the grass around it, and the tall grass is BLADES: a clump of long stems
 * with lit tips over a pool of their own shade, so a patch reads as grass you
 * could hide in rather than as a darker tile. The blades on the border ring come
 * from the family-fixed generator and are drawn on both sides of the tile, so a
 * field of it is one continuous stand, not a grid of clumps.
 */
export function paintTallGrass(c, x, y, v) {
  const p = terrainPalette(), r = sr(v);
  sward(c, x, y, r, p.g3);
  const blade = (bx, top, len, lean) => {
    for (let k = 0; k < len; k++) {
      const px = bx + (lean && k < (len >> 1) ? lean : 0);
      mark(c, k === 0 ? p.g5 : (k < 2 ? p.g4 : p.gn), x, y, px, top + k, 1, 1);
    }
  };
  // Three or four clumps at hashed heights, each a pool of its own shade with
  // stems rising out of it. Clumps sit anywhere on the tile (not all along the
  // bottom), so a field of tall grass is a stand, not horizontal stripes.
  const clumps = 3 + Math.floor(r() * 2);
  for (let q = 0; q < clumps; q++) {
    const sw = 5 + Math.floor(r() * 4), sy = 5 + Math.floor(r() * 10);
    const sx = Math.floor(r() * (17 - sw));
    mark(c, p.g2, x, y, sx + 1, sy, sw - 2, 1);
    mark(c, p.g1, x, y, sx + 1, sy + 1, sw - 2, 1);
    mark(c, p.g2, x, y, sx + 2, sy + 2, sw - 3, 1);
    const n = 4 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const len = 4 + Math.floor(r() * 4), bx = sx + Math.floor(r() * sw);
      blade(bx, Math.max(0, sy + 1 - len + 1), Math.min(len, sy + 2), r() < 0.3 ? (r() < 0.5 ? -1 : 1) : 0);
    }
  }
  // Stems that straddle the top/bottom border, family-fixed and drawn at both
  // offsets, so the tile above paints the tip and this one the foot of the same
  // stem. (A 1px stem cannot be sliced by a left/right border, so only the
  // horizontal seam needs them.)
  const f = fr(SALT.tall + 7);
  for (let i = 0; i < 5; i++) {
    const t = Math.floor(f() * 16), len = 3 + Math.floor(f() * 4), a = 1 + Math.floor(f() * (len - 1));
    for (let k = 0; k < len; k++) {
      const col = k === 0 ? p.g5 : (k < 2 ? p.g4 : p.gn);
      mark(c, col, x, y, t, 16 - a + k, 1, 1);
      mark(c, col, x, y, t, -a + k, 1, 1);
    }
  }
}

// ---------------------------------------------------------------------------
// 4. TREES AND BUSHES — clustered canopies lit from the upper left
// ---------------------------------------------------------------------------
//
// A canopy is a handful of leaf CLUSTERS, each a ball. Every pixel takes the
// ball whose surface is nearest the viewer and shades by that ball's normal
// against the upper-left light; on top of that the surface is broken into
// LEAF CLUMPS — a jittered 3px lattice of small domes, each lit on its own
// upper-left and pocketed with shade on its lower-right — which is what turns
// smooth bands into foliage. A cluster that sits in front of another throws
// shadow onto it, so the masses separate; the silhouette gets a selective
// outline, darkest on the side away from the light.
//
// A single-tile tree FILLS its tile: the crown runs to within a pixel of both
// sides and the top, so a wood of them closes into one canopy instead of
// standing in rows like an orchard of lollipops. Clusters are laid in TREE
// space, so a 2x2 tree renders each quadrant from the same layout and the four
// tiles join with no seam at all.

/** Light direction, normalised: up, left and toward the viewer. */
var LX = -0.52, LY = -0.66, LZ = 0.54;

/** Shadow inks by alpha in hundredths, built on first use. */
var INKS = null;
function ink(a) {
  if (!INKS) { INKS = []; for (let i = 0; i <= 64; i++) INKS.push(`rgba(16,11,8,${(i / 100).toFixed(2)})`); }
  return INKS[a < 0 ? 0 : (a > 0.64 ? 64 : Math.round(a * 100))];
}

/**
 * The shadow a tree or bush throws on the ground: a soft oval pushed down and
 * right of its foot, darkest at the core. `cx, cy` in tree space; (ox, oy) is
 * this tile's offset into it.
 */
export function groundShadow(c, x, y, cx, cy, rx, ry, a = 0.34, ox = 0, oy = 0) {
  for (let py = 0; py < 16; py++) {
    for (let px = 0; px < 16; px++) {
      const dx = (px + ox + 0.5 - cx) / rx, dy = (py + oy + 0.5 - cy) / ry;
      const d = dx * dx + dy * dy;
      if (d >= 1) continue;
      c.fillStyle = ink(d < 0.45 ? a : (d < 0.8 ? a * 0.62 : a * 0.3));
      c.fillRect(x + px, y + py, 1, 1);
    }
  }
}

/** Which cluster wins at tree-space point (tx, ty), and how high its surface is. */
function topBall(balls, tx, ty, salt) {
  let best = -1, bz = -1e9, bh = 0;
  for (let i = 0; i < balls.length; i++) {
    const b = balls[i];
    const dx = tx - b.x, dy = ty - b.y;
    // A leafy edge: each cluster's radius wobbles a fraction of a pixel per pixel.
    const rr = b.r + (((hash(tx | 0, ty | 0, salt + i) & 3) - 1.5) * 0.08);
    const d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr) continue;
    const h = Math.sqrt(rr * rr - d2);
    const z = b.z + h;
    if (z > bz) { bz = z; best = i; bh = h / rr; }
  }
  return best < 0 ? null : { i: best, z: bz, h: bh };
}

/**
 * The leaf-clump step at tree-space (tx, ty). The crown is covered by a jittered
 * lattice of small clumps (odd rows offset half a cell, so no clump sits square
 * under the one above): +1 on a clump's lit upper-left crescent, -1 in the
 * pocket of shade tucked under its lower right, 0 on its body. It works on the
 * QUANTISED level, so every clump is a clean shape and not a smear of noise.
 */
function clumpStep(tx, ty, cs, salt) {
  const j = Math.floor(ty / cs), off = (j & 1) * cs * 0.5;
  const i = Math.floor((tx + off) / cs);
  const h = hash(i, j, salt + 7);
  const cx = (i + 0.5) * cs - off + ((h & 7) / 7 - 0.5) * cs * 0.4;
  const cy = (j + 0.5) * cs + (((h >>> 3) & 7) / 7 - 0.5) * cs * 0.4;
  const rr = cs * 0.6, dx = (tx - cx) / rr, dy = (ty - cy) / rr;
  const s = dx * 0.6 + dy * 0.8, d = Math.sqrt(dx * dx + dy * dy);
  if (d > 0.9 && s > 0.35) return -1;
  if (s < -0.45 && d < 1.05) return 1;
  return 0;
}

/**
 * Paint a cluster canopy into one tile. `balls` are in tree space; (ox, oy) is
 * this tile's offset into it. `tones` is a 6-step ramp, darkest first; index 3
 * is the body of the crown, 4 and 5 its lit side, 1-2 its shade, 0 the outline.
 * `cs` is the leaf-clump size in pixels.
 */
export function foliage(c, x, y, balls, tones, ox = 0, oy = 0, salt = 0, cs = 3) {
  for (let py = 0; py < 16; py++) {
    for (let px = 0; px < 16; px++) {
      const tx = px + ox + 0.5, ty = py + oy + 0.5;
      const hit = topBall(balls, tx, ty, salt);
      if (!hit) continue;
      const b = balls[hit.i];
      const nx = (tx - b.x) / b.r, ny = (ty - b.y) / b.r, nz = hit.h;
      const I = nx * LX + ny * LY + nz * LZ;
      const cl = clumpStep(tx, ty, cs, salt);
      const base = I < 0 ? 1 : (I < 0.3 ? 2 : (I < 0.62 ? 3 : 4));
      // clumps catch light only on the lit half and pocket only on the shaded
      // half, so the crown keeps one big light-to-shade form under its texture
      let lv = base + (cl > 0 ? (base >= 3 ? 1 : 0) : (cl < 0 && base <= 3 ? -1 : 0));
      if (lv > 4 && I < 0.72) lv = 4;                               // the top tone only where the light is full on
      // a cluster in front, up and left of here, shades this pixel
      const up = topBall(balls, tx - 1.2, ty - 1.2, salt);
      if (up && up.i !== hit.i && up.z > hit.z + 0.5) lv -= 2;
      lv = Math.max(1, Math.min(5, lv));
      // selective outline: the silhouette's own edge, darkest away from the light
      const e = !topBall(balls, tx + 1, ty, salt) || !topBall(balls, tx, ty + 1, salt);
      const w = !topBall(balls, tx - 1, ty, salt) || !topBall(balls, tx, ty - 1, salt);
      if (e) lv = 0; else if (w) lv = Math.min(lv, 2);
      P(c, tones[lv], x + px, y + py);
    }
  }
}

/** A trunk: a lit left flank, shaded right, a flared, dark foot. Tile pixels. */
function trunk(c, x, y, tx, top, bottom, w, tones) {
  for (let py = top; py <= bottom; py++) {
    const flare = py >= bottom - 1 ? 1 : 0;
    const x0 = tx - flare, ww = w + flare * 2;
    mark(c, tones[0], x, y, x0 - 1, py, ww + 2, 1);        // keyline
    mark(c, tones[2], x, y, x0, py, ww, 1);
    mark(c, tones[3], x, y, x0, py, 1, 1);
    if (ww > 1) mark(c, tones[1], x, y, x0 + ww - 1, py, 1, 1);
  }
  mark(c, tones[0], x, y, tx - 1, bottom, w + 2, 1);
}

/** Jitter a base cluster layout for one variant, keeping every ball inside the box. */
function layout(base, r, jit, box) {
  return base.map((b) => {
    const rad = b[2] + (r() - 0.5) * jit * 0.8;
    let bx = b[0] + (r() - 0.5) * jit * 2, by = b[1] + (r() - 0.5) * jit * 2;
    bx = Math.max(box[0] + rad, Math.min(box[2] - rad, bx));
    by = Math.max(box[1] + rad, Math.min(box[3] - rad, by));
    return { x: bx, y: by, r: rad, z: by * 0.9 + (b[3] || 0) };
  });
}

/** Broadleaf crown for the single-tile oak: [x, y, r, z-bias]. */
var OAK_BASE = [
  [8, 6.2, 5.6, -2], [4.1, 7.6, 4.0, 0], [11.9, 7.4, 4.0, 0], [5.8, 3.7, 3.6, -1], [10.5, 3.9, 3.5, -1],
  [5.0, 10.2, 3.1, 1], [11.0, 10.2, 3.2, 1], [8.0, 10.6, 3.3, 1.5],
];

/** TREE_OAK — a full broadleaf crown of eight clusters over a short, flared trunk. */
export function paintOak(c, x, y, v) {
  const p = terrainPalette(), r = sr(v);
  groundShadow(c, x, y, 10, 14.2, 7, 2.2, 0.36);
  trunk(c, x, y, 7, 11, 15, 2, p.bark);
  const balls = layout(OAK_BASE, r, 1.0, [0.2, 0.2, 15.8, 13.8]);
  // now and then a crown leans or carries an extra lobe, so a wood is not clones
  if (r() < 0.5) balls.push({ x: 2.8 + r() * 10.4, y: 3.4 + r() * 5, r: 2.6, z: 4 });
  foliage(c, x, y, balls, r() < 0.3 ? p.oakW : p.oak, 0, 0, v & 0xffff, 3.6);
}

/**
 * TREE_BIRCH — a slender pale stem under a light, loose crown. The stem is
 * keylined in grey on its lit side and bark-dark on its shaded one: a full dark
 * ring around a white stick reads as a glyph, not a tree.
 */
export function paintBirch(c, x, y, v) {
  const p = terrainPalette(), r = sr(v);
  groundShadow(c, x, y, 10, 14.4, 5.6, 1.9, 0.32);
  // a two-pixel stem, white on the lit side and grey on the other, keylined
  // only on its shaded flank; the dark lenticels cross it one pixel at a time
  const bx = 7 + Math.floor(r() * 2);
  for (let py = 8; py <= 15; py++) {
    mark(c, p.birchBark[3], x, y, bx, py, 1, 1);
    mark(c, p.birchBark[1], x, y, bx + 1, py, 1, 1);
    mark(c, p.bark[0], x, y, bx + 2, py, 1, 1);
  }
  for (let py = 10 + Math.floor(r() * 2); py < 15; py += 2 + Math.floor(r() * 2)) mark(c, p.bark[0], x, y, bx + ((py >> 1) & 1), py, 1, 1);
  mark(c, p.bark[0], x, y, bx - 1, 15, 4, 1);
  // a loose, upright oval crown: clusters round an ellipse, touching, never floating free
  const balls = [];
  const n = 7 + Math.floor(r() * 2);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 6.283 + r() * 0.5, rad = 2.5 + r() * 1.0;
    const bxx = 8 + Math.cos(a) * (3.8 + r() * 1.2), byy = 5 + Math.sin(a) * (2.8 + r() * 0.8);
    balls.push({ x: Math.max(rad + 0.2, Math.min(15.8 - rad, bxx)), y: Math.max(rad + 0.2, Math.min(10.8 - rad, byy)), r: rad, z: 0 });
  }
  balls.push({ x: 8, y: 5, r: 3.6, z: -1 });
  for (const b of balls) b.z += b.y * 0.9;
  foliage(c, x, y, balls, p.birch, 0, 0, v & 0xffff, 2.6);
}

/**
 * TREE_WILLOW — a broad dome whose lower half hangs in strands. The strands are
 * lit threads and partings of shade over the whole skirt, so the silhouette
 * drips; the trunk shows through the partings.
 */
export function paintWillow(c, x, y, v) {
  const p = terrainPalette(), r = sr(v), k = p.willow;
  groundShadow(c, x, y, 10, 14.4, 7.6, 2.2, 0.36);
  trunk(c, x, y, 7, 8, 15, 2, p.bark);
  const balls = layout([[8, 4.8, 4.8, -1], [4, 6, 3.6, 0], [12, 6, 3.6, 0], [5.6, 3, 2.8, -1], [10.6, 3.2, 2.8, -1]], r, 0.6, [0.2, 0.2, 15.8, 10]);
  foliage(c, x, y, balls, k, 0, 0, v & 0xffff, 3);
  // The curtain: strands hang from the crown's rim to a ragged hem, lit threads
  // on the side toward the light, a parting now and then that shows the dark
  // inside of the tree (and the trunk through it), and a dark tip on each strand.
  for (let px = 0; px < 16; px++) {
    let top = -1;
    for (let py = 15; py >= 0; py--) if (topBall(balls, px + 0.5, py + 0.5, v & 0xffff)) { top = py; break; }
    if (top < 5) continue;
    const h = hash(px, v & 1023, 5);
    const hem = Math.min(14, 11 + (h % 4) - (px < 2 || px > 13 ? 2 : 0));
    const parting = (h >>> 3) % 5 === 0 && px > 2 && px < 13;
    for (let py = top; py <= hem; py++) {
      let col;
      if (parting) col = py < hem - 1 ? k[1] : null;
      else if (py === hem) col = k[0];
      else col = ((px + (h >>> 7)) % 3 === 0) ? (px < 9 ? k[4] : k[3]) : (px < 6 ? k[3] : k[2]);
      if (col) mark(c, col, x, y, px, py, 1, 1);
    }
  }
}

/**
 * TREE_PINE — tiers of boughs, each a skirt lit on its left flank, with a
 * scalloped hem that lays a line of shade on the tier below. The tip touches the
 * top of the tile and the lowest skirt all but spans it.
 */
export function paintPine(c, x, y, v) {
  const p = terrainPalette(), r = sr(v);
  groundShadow(c, x, y, 10, 14.6, 6, 1.8, 0.36);
  trunk(c, x, y, 7, 13, 15, 2, p.bark);
  const w = 0.92 + r() * 0.1;
  const tiers = r() < 0.5
    ? [[0, 4.8, 2.8], [2.4, 8.2, 4.8], [5.2, 11.4, 6.5], [8.0, 13.8, 7.7]]
    : [[0, 5.8, 3.4], [3.2, 9.8, 5.6], [6.6, 13.6, 7.6]];
  for (const t of tiers) t[2] *= w;
  pineTiers(c, x, y, tiers, 8 + (r() < 0.5 ? -0.3 : 0.3), p.pine, 0, 0, v & 0xffff);
}

/** Draw pine tiers [top, hem, half-width] about a centre line, tree space. */
function pineTiers(c, x, y, tiers, cx, tones, ox, oy, salt) {
  // bottom tier first, so each tier's hem overlaps the one beneath it
  for (let k = tiers.length - 1; k >= 0; k--) {
    const [top, hem, hw] = tiers[k];
    for (let py = 0; py < 16; py++) {
      const ty = py + oy + 0.5;
      if (ty < top || ty > hem + 1) continue;
      for (let px = 0; px < 16; px++) {
        const tx = px + ox + 0.5;
        // the hem scallops in bough-wide dips, not per pixel
        const hemHere = hem - ((hash(Math.floor(tx / 2), k, salt) & 1) ? 0.9 : 0);
        if (ty > hemHere + 0.5) continue;
        const half = hw * Math.min(1, Math.pow((ty - top + 0.6) / Math.max(1, hem - top), 0.85));
        const u = (tx - cx) / Math.max(0.6, half);
        if (u < -1 || u > 1) continue;
        const down = (ty - top) / Math.max(1, hem - top);
        let I = 0.64 - 0.55 * u - 0.3 * down;
        // needle sprays: short strokes slanting down and out from the centre line
        const spray = hash(Math.floor(tx + (u < 0 ? ty : -ty) * 0.7), Math.floor(ty / 2), salt + 17 + k);
        I += ((spray & 3) - 1.5) * 0.1;
        I += (((hash(px + ox, py + oy, salt + 19) & 255) / 255) - 0.5) * 0.12;
        let lv = I < 0.08 ? 1 : (I < 0.34 ? 2 : (I < 0.6 ? 3 : (I < 0.84 ? 4 : 5)));
        if (ty > hemHere - 0.5) lv = Math.min(lv, 1);                    // the hem's shade line
        if (u > 0.8) lv = 0; else if (u < -0.84) lv = Math.min(lv, 2);  // selective outline
        P(c, tones[lv], x + px, y + py);
      }
    }
  }
}

/** BUSH — a low, full mound of clusters with no trunk. `berries` adds fruit. */
export function paintBush(c, x, y, v, berries) {
  const p = terrainPalette(), r = sr(v);
  groundShadow(c, x, y, 9.6, 13.8, 7.2, 2.2, 0.34);
  const balls = layout([[8, 8.4, 5.0, -1], [4.2, 10, 3.8, 0], [11.8, 10, 3.8, 0], [8, 11.2, 3.6, 1], [5.4, 7, 3, -1], [10.8, 7.2, 3, -1]], r, 0.9, [0.3, 2.4, 15.7, 14.4]);
  foliage(c, x, y, balls, r() < 0.4 ? p.oakW : p.oak, 0, 0, v & 0xffff, 2.6);
  if (!berries) return;
  // berries in little bunches: each a 2x2 round with a lit pip up-left and a dark
  // lower-right, so they sit ON the leaves rather than streaking down them
  const bunches = 3 + Math.floor(r() * 2);
  for (let i = 0; i < bunches; i++) {
    const bx = 2 + Math.floor(r() * 10), by = 5 + Math.floor(r() * 6);
    const n = 1 + Math.floor(r() * 2);
    for (let j = 0; j < n; j++) stamp(c, x, y, bx + j * 2, by + (j & 1), ['hm', 'md'], { h: '#e8808c', m: '#b3303f', d: '#6d1826' });
  }
}

/** The big oak, 32x32 across OAK_TL/TR/BL/BR. One fixed layout: its four tiles must agree. */
var BIG_OAK = [
  [16, 11, 9.5, -3], [8.5, 14, 6.5, -1], [23.5, 14, 6.5, -1], [12, 6.5, 6, -2], [21, 7, 5.6, -2],
  [16, 19, 6.2, 2], [9, 20, 4.6, 2], [23, 20, 4.6, 2], [16, 4, 4.4, -3],
];
/** One quadrant of the big oak. `qx, qy` pick the quadrant (0 or 1). */
export function paintBigOak(c, x, y, v, qx, qy) {
  const p = terrainPalette();
  const ox = qx * 16, oy = qy * 16;
  if (qy === 1) {
    groundShadow(c, x, y, 19, 29, 13, 3.4, 0.34, ox, oy);
    bigTrunk(c, x, y, ox, oy, 13, 22, 18, 30, p.bark);
  }
  const balls = BIG_OAK.map((b) => ({ x: b[0], y: b[1], r: b[2], z: b[1] * 0.9 + b[3] }));
  foliage(c, x, y, balls, p.oak, ox, oy, 4242, 3.4);
}

/** A trunk in tree space, [x0..x1] x [y0..y1], flaring over its last two rows. */
function bigTrunk(c, x, y, ox, oy, x0, y0, x1, y1, tones) {
  for (let py = 0; py < 16; py++) {
    const ty = py + oy;
    if (ty < y0 || ty > y1) continue;
    const flare = ty >= y1 - 1 ? 1 : 0;
    for (let px = 0; px < 16; px++) {
      const tx = px + ox;
      if (tx < x0 - flare || tx > x1 + flare) continue;
      const edge = tx === x0 - flare || tx === x1 + flare || ty === y1;
      c.fillStyle = edge ? tones[0] : (tx === x0 - flare + 1 ? tones[3] : (tx >= x1 + flare - 1 ? tones[1] : tones[2]));
      c.fillRect(x + px, y + py, 1, 1);
    }
  }
}

/** The big pine, 32x32 across PINE_TL/TR/BL/BR. */
var BIG_PINE = [[0, 8, 3.5], [4, 13, 6], [8, 19, 8.5], [13, 25, 11.5], [18, 29, 14]];
export function paintBigPine(c, x, y, v, qx, qy) {
  const p = terrainPalette();
  const ox = qx * 16, oy = qy * 16;
  if (qy === 1) {
    groundShadow(c, x, y, 19, 30, 11, 2.6, 0.34, ox, oy);
    bigTrunk(c, x, y, ox, oy, 14, 27, 17, 31, p.bark);
  }
  pineTiers(c, x, y, BIG_PINE, 16, p.pine, ox, oy, 777);
}

/**
 * DEAD_TREE — a bare, weathered snag. The limbs are grown, not drawn: each
 * forks once or twice as it climbs and thins to a 1px twig, and every limb
 * carries a lit upper-left pixel over its dark body, so the silhouette reads on
 * grass, mud or snow alike.
 */
export function paintDeadTree(c, x, y, v) {
  const p = terrainPalette(), r = sr(v), k = p.snag;
  groundShadow(c, x, y, 10, 14.6, 5.6, 1.8, 0.36);
  const body = new Uint8Array(256);
  const put = (px, py, w) => {
    for (let i = 0; i < w; i++) { const qx = Math.round(px) + i, qy = Math.round(py); if (qx >= 0 && qx < 16 && qy >= 0 && qy < 16) body[qy * 16 + qx] = 1; }
  };
  const limb = (px, py, ang, len, w, depth) => {
    for (let s = 0; s < len; s++) {
      put(px, py, w);
      px += Math.cos(ang); py += Math.sin(ang);
      ang += (r() - 0.5) * 0.3;
      if (w > 1 && s >= len * 0.6) w--;
    }
    if (depth > 0 && py > 1) {
      limb(px, py, ang - 0.5 - r() * 0.3, len * 0.6, Math.max(1, w - 1), depth - 1);
      if (r() < 0.75) limb(px, py, ang + 0.5 + r() * 0.3, len * 0.55, 1, depth - 1);
    }
  };
  const tx = 6 + Math.floor(r() * 2);
  for (let py = 6; py <= 15; py++) put(tx - (py >= 14 ? 1 : 0), py, py >= 14 ? 5 : 3);  // bole and root flare
  limb(tx + 1, 6, -Math.PI / 2 + (r() - 0.5) * 0.4, 3 + r() * 2, 2, 2);
  limb(tx, 9 - Math.floor(r() * 2), -Math.PI / 2 - 0.9 - r() * 0.3, 4 + r() * 2, 2, 1);
  if (r() < 0.8) limb(tx + 2, 10 - Math.floor(r() * 2), -Math.PI / 2 + 0.9 + r() * 0.3, 3 + r() * 2, 2, 1);
  // dark keyline on the right and below, lit edge on the upper left, body between
  const at = (px, py) => px >= 0 && px < 16 && py >= 0 && py < 16 && body[py * 16 + px] === 1;
  for (let py = 0; py < 16; py++) for (let px = 0; px < 16; px++) {
    if (!at(px, py)) continue;
    const litEdge = !at(px - 1, py) || !at(px, py - 1);
    const shadeEdge = !at(px + 1, py) || !at(px, py + 1);
    P(c, shadeEdge ? k[0] : (litEdge ? k[3] : k[1]), x + px, y + py);
  }
  // a split down the bole, and a knot
  for (let py = 9; py < 13; py++) if (r() < 0.7) P(c, k[0], x + tx + 1, y + py);
  if (r() < 0.6) P(c, k[2], x + tx + 1, y + 7);
}

/**
 * STUMP — a felled trunk's stub: the sawn face on top (pale wood, growth rings,
 * a radial check), bark flanks lit on the left, roots gripping the ground and a
 * cast shadow down-right. It used to be a barrel.
 */
export function paintStump(c, x, y, v) {
  const p = terrainPalette(), r = sr(v), b = p.bark;
  groundShadow(c, x, y, 9.8, 13.8, 6.8, 2.1, 0.34);
  const cx = 7.5 + (r() - 0.5), top = 7 + Math.floor(r() * 2), rw = 3.8 + r() * 0.7;
  // roots: three or four flaring spurs at the foot
  const roots = [[-1, 0], [1, 0], [-0.4, 1]];
  if (r() < 0.6) roots.push([0.5, 1]);
  for (const [dir, drop] of roots) {
    for (let i = 0; i < 3; i++) {
      const px = Math.round(cx + dir * (rw - 0.5 + i)), py = 12 + drop + (i > 1 ? 1 : 0);
      mark(c, b[0], x, y, px, py + 1, 1, 1);
      mark(c, i === 0 && dir < 0 ? b[3] : b[2], x, y, px, py, 1, 1);
    }
  }
  // the bark body
  for (let py = top + 1; py <= 13; py++) {
    for (let px = Math.floor(cx - rw); px <= Math.ceil(cx + rw); px++) {
      const u = (px + 0.5 - cx) / rw;
      if (u < -1 || u > 1) continue;
      let col = u < -0.55 ? b[3] : (u < 0.2 ? b[2] : (u < 0.7 ? b[1] : b[0]));
      if (((px * 3 + (py >> 1)) & 3) === 0 && u > -0.7 && u < 0.8) col = b[1];   // furrows in the bark
      if (py === 13 || u > 0.92) col = b[0];
      P(c, col, x + px, y + py);
    }
  }
  // the sawn face: an ellipse of pale wood with rings, darker to the lower right
  for (let py = top - 2; py <= top + 2; py++) {
    for (let px = Math.floor(cx - rw); px <= Math.ceil(cx + rw); px++) {
      const dx = (px + 0.5 - cx) / rw, dy = (py + 0.5 - top) / 2.4;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 1) continue;
      let col = d > 0.84 ? b[1] : (((d * 3.2) | 0) & 1 ? p.woodCut[1] : p.woodCut[2]);
      if (d < 0.2) col = p.woodCut[0];
      if (d <= 0.84 && dx + dy < -0.7) col = p.woodCut[3];
      P(c, col, x + px, y + py);
    }
  }
  // a radial check split across the face, and moss on the shaded flank now and then
  const ca = r() * 6.283;
  for (let s = 1; s < 4; s++) P(c, p.woodCut[0], x + Math.round(cx + Math.cos(ca) * s), y + Math.round(top + Math.sin(ca) * s * 0.5));
  if (r() < 0.6) for (let i = 0; i < 3; i++) P(c, i ? p.oak[3] : p.oak[4], x + Math.round(cx + rw - 1 - i * 0.6), y + 11 - i);
}

// ---------------------------------------------------------------------------
// 5. WATER — open water, deep water, the banks, bog water and lily pads
// ---------------------------------------------------------------------------
//
// Water reads by what it REFLECTS: soft darker depths, ripple troughs with a
// lit crest above them, and glints that come and go. The ripples travel a
// pixel a frame and the glints change every frame, so a lake shimmers; every
// placement is drawn from the variant rng BEFORE the frame is consulted, so the
// shapes are the same in every frame and only the motion changes.
//
// Deep water used to sit 18 L* under shallow water, so every WATER|WATER_DEEP
// join was a hard 16px staircase down the coast. It now sits one ramp step
// under (L* 36 against 45) and speaks the same ripple language in darker ink:
// the depth still reads, the staircase no longer shouts.

var WSALT = { water: 111, deep: 112, bog: 113 };

/** The water body every open-water tile and every bank member shares. */
export function paintWater(c, x, y, v, f, deep) {
  const p = terrainPalette(), r = sr(v);
  const base = deep ? p.w2 : p.w3, low = deep ? p.w1 : p.w2, mid = deep ? p.wDeepMid : p.wMid;
  const lit = deep ? p.w3 : p.w4, hi = deep ? p.w4 : p.w5;
  R(c, base, x, y, 16, 16);
  somePatch(c, mid, x, y, r, 2.5, 1.5, 2.5);
  if (r() < 0.6) somePatch(c, mid, x, y, r, 1.8, 1.2, 1.5);
  seam(c, x, y, deep ? WSALT.deep : WSALT.water, [mid, base, mid, base, low, mid], 8, 3, 2);
  // every placement first, frame last
  const rip = [];
  const n = deep ? 3 : 4;
  for (let i = 0; i < n; i++) {
    const len = 3 + Math.floor(r() * 3);
    rip.push([1 + Math.floor(r() * (12 - len)), 2 + Math.floor(r() * 12), len, Math.floor(r() * 4)]);
  }
  const gl = [Math.floor(r() * 64), Math.floor(r() * 64)];
  for (const [rx, ry, len, ph] of rip) {
    const dx = (f + ph) & 3;
    mark(c, low, x, y, rx + dx, ry, len, 1);               // the trough
    mark(c, lit, x, y, rx + dx + 1, ry - 1, len - 2, 1);   // its lit crest, up and left of the light's side
  }
  // A glint a frame, somewhere new each frame: the surface catching the sun,
  // and only now and then the white of a direct flash. Deep water is darker and
  // catches it seldom — a white pixel in every deep tile read as a night sky.
  const h = hash(gl[0], f, v & 1023);
  const gx = 1 + (h % 13), gy = 1 + ((h >>> 8) % 14);
  if (!deep || ((h >>> 20) & 3) === 0) {
    const white = !deep && ((h >>> 16) & 3) === 0;
    P(c, white ? p.glint : hi, x + gx, y + gy);
    if (!deep) P(c, lit, x + gx + 1, y + gy);
  }
}

/**
 * THE BANK (tiles.js section 4.5 has the whole history). A shore member is
 * water with a margin of bank along each named side; the margin's depth is a
 * sine series that vanishes at both ends plus a per-edge-variant jag, so the
 * line is continuous across every seam and never repeats. The geometry here is
 * the one that was measured and signed off, rebuilt from the same salt (24) so
 * no coastline moves; what changed is the paint:
 *
 *   land -> damp earth (with grit) -> wet earth -> the dark waterline lip ->
 *   a line of LAPPING FOAM -> a band of lighter shallows -> open water.
 *
 * The foam is the one animated part: its pixels come and go by frame from the
 * same shared-border indices the grit uses, so both neighbours agree on it at
 * every seam in every frame.
 */
var BANK = null;
function bankTables() {
  if (BANK) return BANK;
  const jag = [], amp = [];
  for (let vi = 0; vi < 16; vi++) {
    const f = fr(24 + vi * 37);
    const row = new Int8Array(16);
    for (let i = 1; i < 15; i++) row[i] = f() < 0.34 ? 1 : 0;
    jag.push(row);
    amp.push([(f() * 2 - 1), (f() * 2 - 1) * 0.7, (f() * 2 - 1) * 0.5]);
  }
  const rip = []; { const f = fr(25); for (let i = 0; i < 256; i++) rip.push(f() < 0.24); }
  const lap = []; { const f = fr(26); for (let i = 0; i < 256; i++) lap.push(f() < 0.62); }
  BANK = { jag, amp, rip, lap };
  return BANK;
}

/**
 * One margin. `tone` = { damp, wet, lip, shallow, grit, foam }; `base`/`amp`
 * are the depth and how far it wanders. Tile-local; (horiz, far) name the side.
 */
function bank(c, x, y, vi, f, horiz, far, tone, base, amp) {
  const B = bankTables();
  const e0 = (vi >> (horiz ? 0 : 2)) & 1, e1 = (vi >> (horiz ? 1 : 3)) & 1;
  const jag = B.jag[vi], am = B.amp[vi];
  const a1 = am[0] * amp, a2 = am[1] * amp, a3 = am[2] * amp;
  for (let i = 0; i < 16; i++) {
    const end = i === 0 ? e0 : (i === 15 ? e1 : 0);
    let d = base + end + jag[i]
      + Math.round(a1 * Math.sin(Math.PI * i / 15) + a2 * Math.sin(2 * Math.PI * i / 15) + a3 * Math.sin(3 * Math.PI * i / 15));
    if (d < 2) d = 2; if (d > 7) d = 7;
    const es = i === 0 ? e0 : e1;
    const fs = (i === 0 || i === 15) ? es * 83 + 41 : vi * 53 + i * 16;
    const gs = (i === 0 || i === 15) ? es * 61 + 19 : vi * 29 + i * 7;
    const at = (k, col) => {
      const px = horiz ? i : (far ? 15 - k : k), py = horiz ? (far ? 15 - k : k) : i;
      mark(c, col, x, y, px, py, 1, 1);
    };
    for (let k = 0; k < d - 2; k++) at(k, tone.damp);
    at(d - 2, tone.wet);
    at(d - 1, tone.lip);
    at(d, B.lap[(fs + d + f * 23) & 255] ? tone.foam : tone.shallow);
    at(d + 1, B.rip[(fs + d + f * 11) & 255] ? tone.foam : tone.shallow);
    if (B.rip[(gs + 3) & 255] && d > 3) at(0, tone.grit);
  }
}

/** A shore member: the shared water body, then a bank on each named side. */
export function paintShore(c, x, y, vi, f, sides, quay) {
  const p = terrainPalette();
  paintWater(c, x, y, (0x51 + vi) * 2654435761 >>> 0, f, false);
  const tone = quay
    ? { damp: p.quay, wet: p.quayD, lip: p.quayXD, shallow: p.shallowD, grit: p.quayL, foam: p.foam }
    : { damp: p.silt, wet: p.siltM, lip: p.siltD, shallow: p.shallow, grit: p.siltM, foam: p.foam };
  const base = quay ? 5 : 4, amp = quay ? 1.4 : 2;
  for (const s of sides) bank(c, x, y, vi, f, s === 'N' || s === 'S', s === 'S' || s === 'E', tone, base, amp);
}

/**
 * THE SHELF — where shallow water drops into deep. The two bodies sit a ramp
 * step apart, and a hard change of value exactly on a tile border is a 16px
 * staircase down the whole coast. So the deep tiles that touch shallow water
 * are baked (`resolveShelves`) into WATER_SHELF_* members: deep water with a
 * band of the SHALLOW body along each named side, ending in a dithered lip and
 * a line of shadow where the bottom falls away. The band's width wanders along
 * the side by the same shared-border rule as the banks (ends from the edge bits,
 * the middle from the variant), so the shelf line runs on across seams, and the
 * band carries the shallow body's own ring, so it joins the shallow tile beside
 * it as another shallow tile would. `sides` is a string of N/E/S/W.
 */
export function paintShelf(c, x, y, v, vi, f, sides) {
  const p = terrainPalette(), B = bankTables();
  const deep = record((rc) => paintWater(rc, 0, 0, v, f, true));
  const shallow = record((rc) => paintWater(rc, 0, 0, (v ^ 0x5151) >>> 0, f, false));
  // distance, per pixel, inside the shelf band (0 = at the shallow side); 99 = deep
  const band = new Float32Array(256).fill(99);
  for (const s of sides) {
    const horiz = s === 'N' || s === 'S', far = s === 'S' || s === 'E';
    const e0 = (vi >> (horiz ? 0 : 2)) & 1, e1 = (vi >> (horiz ? 1 : 3)) & 1;
    const am = B.amp[vi], jag = B.jag[(vi * 7 + 3) & 15];
    for (let i = 0; i < 16; i++) {
      const end = i === 0 ? e0 : (i === 15 ? e1 : 0);
      const w = 5 + end + (i > 0 && i < 15 ? jag[i] : 0)
        + Math.round(am[0] * 1.6 * Math.sin(Math.PI * i / 15) + am[1] * 1.2 * Math.sin(2 * Math.PI * i / 15));
      for (let k = 0; k < 16; k++) {
        const px = horiz ? i : (far ? 15 - k : k), py = horiz ? (far ? 15 - k : k) : i;
        const q = py * 16 + px, d = k - Math.max(3, Math.min(8, w));
        if (d < band[q]) band[q] = d;
      }
    }
  }
  for (let i = 0; i < 256; i++) {
    const d = band[i], px = i & 15, py = i >> 4;
    let col;
    if (d < -1) col = shallow[i];
    else if (d < 0) col = ((px + py) & 1) ? shallow[i] : p.wMid;               // the lip, dithered
    else if (d < 1) col = ((px + py + f) & 1) ? p.w1 : deep[i];                 // shadow where it falls away
    else col = deep[i];
    if (col) { c.fillStyle = col; c.fillRect(x + px, y + py, 1, 1); }
  }
}

/** RIVER_BEND — open water with a bank swept round the lower-left corner. */
export function paintRiverBend(c, x, y, v, f) {
  const p = terrainPalette();
  paintWater(c, x, y, v, f, false);
  for (let py = 0; py < 16; py++) for (let px = 0; px < 16; px++) {
    const d = Math.hypot(px + 0.5, 16 - (py + 0.5)) - 9;   // distance outside the bank's arc
    if (d > 2.2) continue;
    const col = d < -1.5 ? p.silt : (d < -0.5 ? p.siltM : (d < 0.5 ? p.siltD : (d < 1.4 ? (((px + py + f) % 3) ? p.foam : p.shallow) : p.shallow)));
    P(c, col, x + px, y + py);
  }
}

/**
 * SWAMP_WATER — bog water. It was a dark green square that read as a rug; water
 * reads by reflection, so this carries a band of sky in its surface, drifts of
 * duckweed with a lit edge, and a bubble that rises now and then.
 */
export function paintBog(c, x, y, v, f) {
  const p = terrainPalette(), r = sr(v), b = p.bog;
  R(c, b[3], x, y, 16, 16);
  somePatch(c, b[2], x, y, r, 3, 2, 2);
  somePatch(c, b[2], x, y, r, 2, 1.4, 1.5);
  seam(c, x, y, WSALT.bog, [b[2], b[3], b[2], b[3], b[4], b[3]], 8, 3, 2);
  // the sky, lying on the water in broken horizontal streaks
  for (let i = 0; i < 3; i++) { const len = 3 + Math.floor(r() * 4); const [sx, sy] = spot(r, len, 1, 1); mark(c, p.bogSky, x, y, sx, sy, len, 1); mark(c, b[4], x, y, sx + 1, sy + 1, len - 2, 1); }
  // duckweed: loose drifts of lit pads
  const drifts = 1 + Math.floor(r() * 2);
  for (let k = 0; k < drifts; k++) {
    const [cx, cy] = spot(r, 5, 4, 1);
    for (let i = 0; i < 6; i++) {
      const px = cx + Math.floor(r() * 5), py = cy + Math.floor(r() * 4);
      P(c, p.scum, x + px, y + py);
      if (r() < 0.5) P(c, p.scumL, x + px, y + py);
      else P(c, p.scumD, x + Math.min(15, px + 1), y + Math.min(15, py + 1));
    }
  }
  const bx = 2 + Math.floor(r() * 12), by = 3 + Math.floor(r() * 10);
  if (f === 1) { P(c, b[5], x + bx, y + by); P(c, b[1], x + bx, y + by + 1); }
}

/** LILY_PAD — two or three notched pads, lit on their upper-left rims, one in flower now and then. */
export function paintLilies(c, x, y, v) {
  const p = terrainPalette(), r = sr(v);
  const pads = 2 + Math.floor(r() * 2);
  for (let k = 0; k < pads; k++) {
    const rad = 2.2 + r() * 1.6;
    const cx = rad + 1 + r() * (14 - rad * 2), cy = rad + 1 + r() * (14 - rad * 2);
    const notch = r() * 6.283;
    groundShadow(c, x, y, cx + 0.8, cy + 0.8, rad + 0.6, rad * 0.8 + 0.4, 0.22);
    for (let py = 0; py < 16; py++) for (let px = 0; px < 16; px++) {
      const dx = px + 0.5 - cx, dy = (py + 0.5 - cy) * 1.25;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > rad) continue;
      let a = Math.atan2(dy, dx) - notch; a -= Math.floor(a / 6.283) * 6.283;
      if (a < 0.5 && d > 0.8) continue;                            // the notch
      const rim = d > rad - 1;
      const lit = dx + dy < -0.6 * rad;
      P(c, rim ? (lit ? p.oak[4] : p.oak[1]) : (lit ? p.oak[3] : p.oak[2]), x + px, y + py);
    }
    if (r() < 0.35) {
      const fx = Math.round(cx), fy = Math.round(cy) - 1;
      stamp(c, x, y, fx - 1, fy - 1, ['.w.', 'wyw', '.p.'], { w: '#f2dce6', y: '#e8c451', p: '#d890b0' });
    }
  }
}

// ---------------------------------------------------------------------------
// 6. EARTH — dirt, paths, ruts, cobbles, scree, mud, sand, furrows and crops
// ---------------------------------------------------------------------------
//
// Bare earth and a trodden path sit only ~4 L* apart (the same material, loose
// and compacted), so what tells them apart is SURFACE: dirt is cloddy — lumps
// with a lit crown and a shadowed underside, a pebble here and there — and a
// path is worn smooth, with broad pale wear, grit trodden into it and the odd
// cart scuff. Stones everywhere are lit on the upper left and drop a pixel of
// shade down and right, which is what makes them sit IN the ground.

var ESALT = { dirt: 121, path: 122, rut: 123, cobble: 124, gravel: 125, mud: 126, sand: 127, farm: 128 };

/** Clod shapes: l lit crown, s underside shade, x deepest shade. */
var CLODS = [['.ll.', 'l..s', '.ss.'], ['ll.', 'l.s', '.ss'], ['.l', 'ls'], ['ll', 'sx']];
/** A pebble: p lit face, q its body, s the shade it drops. */
var PEBBLES = [['pq', '.s'], ['pq.', 'qqs', '.s.'], ['p', 's'], ['.p.', 'pqs', '.s.']];

/** Loose earth: damp and dry patches, clods, a pebble or two. */
export function dirtBody(c, x, y, r) {
  const p = terrainPalette(), d = p.dirt;
  R(c, d[3], x, y, 16, 16);
  somePatch(c, mix(d[2], d[3], 0.5), x, y, r, 2.4, 1.6, 2);
  if (r() < 0.5) somePatch(c, mix(d[3], d[4], 0.45), x, y, r, 1.8, 1.2, 1.4);
  speck(c, d[2], x, y, 9, r);
  speck(c, d[4], x, y, 6, r);
  seam(c, x, y, ESALT.dirt, [mix(d[2], d[3], 0.5), d[3], d[2], mix(d[3], d[4], 0.5), d[2], d[3]], 10, 3, 3);
  const n = 3 + Math.floor(r() * 2);
  for (let i = 0; i < n; i++) {
    const s = CLODS[Math.floor(r() * CLODS.length)];
    const [sx, sy] = spot(r, s[0].length, s.length);
    stamp(c, x, y, sx, sy, s, { l: d[4], s: d[1], x: d[0] });
  }
  if (r() < 0.7) {
    const s = PEBBLES[Math.floor(r() * PEBBLES.length)];
    const [sx, sy] = spot(r, s[0].length, s.length, 1);
    stamp(c, x, y, sx, sy, s, { p: p.peb[3], q: p.peb[2], s: d[1] });
  }
}
export function paintDirt(c, x, y, v) { dirtBody(c, x, y, sr(v)); }

/** A trodden path: broad pale wear, grit, trodden-in pebbles, a scuff. */
export function pathBody(c, x, y, r) {
  const p = terrainPalette(), q = p.path;
  R(c, q[3], x, y, 16, 16);
  somePatch(c, mix(q[3], q[4], 0.45), x, y, r, 3.5, 2.2, 2.4);
  somePatch(c, mix(q[3], q[4], 0.3), x, y, r, 2.5, 1.8, 2);
  if (r() < 0.6) somePatch(c, mix(q[2], q[3], 0.5), x, y, r, 1.8, 1.2, 1.2);
  speck(c, q[2], x, y, 10, r);
  speck(c, q[4], x, y, 8, r);
  speck(c, q[5], x, y, 2, r);
  seam(c, x, y, ESALT.path, [mix(q[3], q[4], 0.4), q[3], mix(q[2], q[3], 0.5), q[3], q[4], q[3]], 12, 3, 3);
  const n = 1 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const s = PEBBLES[Math.floor(r() * PEBBLES.length)];
    const [sx, sy] = spot(r, s[0].length, s.length, 1);
    stamp(c, x, y, sx, sy, s, { p: p.peb[3], q: p.peb[2], s: q[1] });
  }
  // A cart scuff: a short groove, its upper wall in shade, its lower lip lit.
  if (r() < 0.45) {
    const len = 4 + Math.floor(r() * 5);
    const [sx, sy] = spot(r, len, 3, 1);
    mark(c, q[2], x, y, sx, sy + 1, len, 1);
    mark(c, q[1], x, y, sx + 1, sy + 1, len - 3, 1);
    mark(c, q[4], x, y, sx + 1, sy + 2, len - 2, 1);
  }
}
export function paintPath(c, x, y, v) { pathBody(c, x, y, sr(v)); }

/**
 * DIRT_PATH_RUT — two wheel ruts with a grassy crown between them. Each rut's
 * bow is a half-sine that vanishes at both tile edges, so a run of these joins
 * into continuous tracks however the hash deals the variants.
 */
export function paintRut(c, x, y, v) {
  const p = terrainPalette(), r = sr(v), q = p.path;
  pathBody(c, x, y, r);
  for (const base of [4, 11]) {
    const bow = Math.floor(r() * 3) - 1;
    for (let i = 0; i < 16; i++) {
      const ry = base + Math.round(bow * Math.sin(Math.PI * i / 15));
      mark(c, q[2], x, y, i, ry - 1, 1, 1);        // the wall in shade
      mark(c, q[1], x, y, i, ry, 1, 1);            // the trough
      mark(c, q[4], x, y, i, ry + 1, 1, 1);        // the lit far wall
    }
  }
  // the crown between the tracks, where no wheel goes and the grass holds on
  for (let i = 0; i < 3; i++) {
    const s = tufts()[Math.floor(r() * tufts().length)];
    stamp(c, x, y, 1 + Math.floor(r() * (15 - s[0].length)), 6 + Math.floor(r() * 2), s, turf(p));
  }
}

/**
 * A STONE FIELD — paving as a Voronoi tessellation on a 16px TORUS.
 *
 * Laid in courses, cobbles read as a knitted weave: identical little setts on
 * a ruler grid. Here a fixed set of stone centres is scattered over a 16x16
 * torus and every pixel belongs to its nearest centre, with a joint of mortar
 * wherever two centres are nearly equidistant. Because the plane wraps, the
 * paving runs on across every seam by construction, and inside the tile the
 * stones are irregular, rounded and of mixed sizes.
 *
 * The shapes are family-fixed (they have to be, to tile). What varies is the
 * TONE of each stone, and there the border matters: a stone that crosses one
 * tile border is shared with that neighbour, so its tone comes from that
 * border's SHARED EDGE BIT (`edgeVariant` — both tiles read the same bit); a
 * stone that crosses two borders sits on a corner four tiles share and takes a
 * constant tone; a stone wholly inside is free to vary with the variant.
 *
 *   n       stones per tile
 *   minD    how far apart centres must be (sets the stone size)
 *   ax, ay  anisotropy: >1 on ax makes stones wider than tall
 *   joint   mortar half-width, in distance units
 */
function stoneField(salt, n, minD, ax, ay, joint) {
  const f = fr(salt), pts = [];
  const tor = (a, b) => { let d = a - b; d -= Math.round(d / 16) * 16; return d; };
  for (let tries = 0; pts.length < n && tries < 4000; tries++) {
    const px = f() * 16, py = f() * 16;
    if (pts.every(([qx, qy]) => Math.hypot(tor(px, qx), tor(py, qy)) >= minD)) pts.push([px, py]);
  }
  // Nearest centre IMAGE for every pixel of the 48x48 block around the tile,
  // so each image's full extent (and which borders it crosses) is known.
  const near = (X, Y) => {
    let b1 = 1e9, b2 = 1e9, id = -1, ox = 0, oy = 0;
    for (let i = 0; i < pts.length; i++) {
      for (let gy = -1; gy <= 2; gy++) for (let gx = -1; gx <= 2; gx++) {
        const cx = pts[i][0] + gx * 16, cy = pts[i][1] + gy * 16;
        const d = Math.hypot((X + 0.5 - cx) / ax, (Y + 0.5 - cy) / ay);
        if (d < b1) { b2 = b1; b1 = d; id = i; ox = gx; oy = gy; } else if (d < b2) b2 = d;
      }
    }
    return { id, key: `${id}:${ox}:${oy}`, gap: b2 - b1, dx: X + 0.5 - (pts[id][0] + ox * 16), dy: Y + 0.5 - (pts[id][1] + oy * 16) };
  };
  const ext = new Map();
  for (let Y = -16; Y < 32; Y++) for (let X = -16; X < 32; X++) {
    const q = near(X, Y); if (q.gap < joint) continue;
    const e = ext.get(q.key) || { l: false, r: false, t: false, b: false };
    if (X < 0) e.l = true; if (X > 15) e.r = true; if (Y < 0) e.t = true; if (Y > 15) e.b = true;
    ext.set(q.key, e);
  }
  const cell = [];
  for (let Y = 0; Y < 16; Y++) for (let X = 0; X < 16; X++) {
    const q = near(X, Y);
    if (q.gap < joint) { cell.push(null); continue; }
    const e = ext.get(q.key), crossings = (e.l ? 1 : 0) + (e.r ? 1 : 0) + (e.t ? 1 : 0) + (e.b ? 1 : 0);
    // which shared bit keys this stone: 0 left, 1 right, 2 top, 3 bottom; -1 free; -2 constant
    const bit = crossings === 0 ? -1 : (crossings > 1 ? -2 : (e.l ? 0 : e.r ? 1 : e.t ? 2 : 3));
    cell.push({ key: q.key, id: q.id, bit, dx: q.dx, dy: q.dy });
  }
  return cell;
}

/**
 * Paint a stone field. `tones` is the pool a stone's body is drawn from; `lit`
 * and `shade` are functions of that body tone; `mortar` / `mortarD` the joint
 * and the joint in a stone's shadow (below and right of it).
 */
function paintStones(c, x, y, v, vi, cell, tones, lit, shade, mortar, mortarD, salt) {
  const r = sr(v), pick = new Map();
  const toneOf = (q) => {
    let t = pick.get(q.key);
    if (t) return t;
    if (q.bit === -2) t = tones[0];
    // keyed by the bit's VALUE and the border's AXIS, never its side: this tile
    // reads the stone as crossing its right border, the neighbour its left
    else if (q.bit >= 0) t = tones[hash((vi >> q.bit) & 1, q.id * 2 + (q.bit >> 1), salt) % tones.length];
    else t = tones[Math.floor(r() * tones.length)];
    pick.set(q.key, t);
    return t;
  };
  const at = (X, Y) => cell[(((Y % 16) + 16) % 16) * 16 + (((X % 16) + 16) % 16)];
  for (let Y = 0; Y < 16; Y++) for (let X = 0; X < 16; X++) {
    const q = cell[Y * 16 + X];
    if (!q) {
      const up = at(X, Y - 1), lf = at(X - 1, Y);
      P(c, up || lf ? mortarD : mortar, x + X, y + Y);
      continue;
    }
    const body = toneOf(q);
    const upEdge = !at(X, Y - 1) || at(X, Y - 1).key !== q.key;
    const lfEdge = !at(X - 1, Y) || at(X - 1, Y).key !== q.key;
    const dnEdge = !at(X, Y + 1) || at(X, Y + 1).key !== q.key;
    const rtEdge = !at(X + 1, Y) || at(X + 1, Y).key !== q.key;
    let col = body;
    if (dnEdge || rtEdge) col = shade(body);
    else if (upEdge || lfEdge) col = lit(body);
    else if (q.dx + q.dy < -1.6) col = lit(body);
    P(c, col, x + X, y + Y);
  }
}

/**
 * COBBLE — rounded setts laid in COURSES, the way a street is actually paved.
 * The first version used the torus tessellation, which is seamless but has one
 * layout, so a street repeated every 16px (lag-16 autocorrelation 0.92). Now
 * each 4px course is filled with setts of 4-8px chosen by the variant, and the
 * sett that straddles a side border takes its extent and tone from that
 * border's shared bit (0 left, 1 right), so the two tiles draw one stone. The
 * courses themselves run on across the top and bottom borders (4 divides 16).
 * Every sett is lit on its crown and left shoulder, shaded along its foot and
 * right flank, its corners rounded into the joint, and it drops its shadow into
 * the joint below.
 */
export function cobbleBody(c, x, y, v, vi) {
  const p = terrainPalette(), k = p.cob, r = sr(v ^ 0x77);
  const tones = [k[3], k[4], k[3], mix(k[3], p.scree[4], 0.5), mix(k[3], k[4], 0.5), mix(k[2], k[3], 0.5), mix(k[3], p.dirt[4], 0.3)];
  const lit = (t) => mix(t, k[6], 0.26), shade = (t) => mix(t, k[1], 0.42);
  R(c, k[1], x, y, 16, 16);                                         // the joint bed
  for (let row = 0; row < 4; row++) {
    const y0 = row * 4;
    // Each side border, per course, either carries a sett across it (its extent
    // and tone from the shared bit) or — one course in five — a plain joint, so
    // the columns next to a border are no likelier to be stone than any other
    // and the street has no 16px rhythm in it. A joint AT a border is drawn by
    // the tile on its left, in that tile's last column.
    const hl = hash((vi & 1), row, ESALT.cobble), hr = hash((vi >> 1) & 1, row, ESALT.cobble);
    const openL = ((hl >>> 20) % 5) === 0, openR = ((hr >>> 20) % 5) === 0;
    const inL = 1 + (hl % 5), toneL = tones[(hl >>> 4) % tones.length];
    const outR = 1 + ((hr >>> 8) % 5), toneR = tones[(hr >>> 4) % tones.length];
    // each sett sits at the top of its course or a pixel lower, so the joints
    // between courses break up instead of ruling the street into stripes
    const setts = [];
    if (!openL) setts.push([0, inL, toneL, true, false, (hl >>> 16) & 1]);
    const start = openL ? 0 : inL + 1, end = openR ? 15 : 16 - outR - 1;
    // the setts between: 4-8 wide (a 3x3 sett with rounded corners is a plus sign)
    const span = end - start, n = span <= 8 ? 1 : (span <= 13 ? 2 : 3);
    const ws = [];
    let left = span - (n - 1);
    for (let i = n; i > 0; i--) {
      const lo = Math.max(4, left - (i - 1) * 8), hi = Math.min(8, left - (i - 1) * 4);
      const w = i === 1 ? left : lo + Math.floor(r() * (hi - lo + 1));
      ws.push(w); left -= w;
    }
    let px = start;
    for (const w of ws) {
      setts.push([px, w, tones[Math.floor(r() * tones.length)], false, false, r() < 0.5 ? 1 : 0]);
      px += w + 1;
    }
    if (!openR) setts.push([16 - outR, outR, toneR, false, true, (hr >>> 16) & 1]);
    for (const [sx, w, tone, cutL, cutR, sh] of setts) {
      for (let yy = 0; yy < 3; yy++) for (let xx = 0; xx < w; xx++) {
        const X = sx + xx, Y = y0 + sh + yy;
        if (X < 0 || X > 15) continue;
        const left = xx === 0 && !cutL, right = xx === w - 1 && !cutR;
        // rounded: the joint shows through at a stone's corners
        if ((left || right) && (yy === 0 || yy === 2)) { P(c, yy === 2 ? k[0] : k[1], x + X, y + Y); continue; }
        let col = tone;
        if (yy === 2 || right) col = shade(tone);
        else if (yy === 0 || left) col = lit(tone);
        P(c, col, x + X, y + Y);
      }
      // the stone's shadow in the joint under it (a lowered sett's falls on the next course)
      if (!sh) for (let xx = cutL ? 0 : 1; xx < w; xx++) { const X = sx + xx; if (X >= 0 && X <= 15) P(c, k[0], x + X, y + y0 + 3); }
    }
  }
  // here and there a blade of grass in a joint
  if (r() < 0.3) for (let i = 0; i < 3; i++) P(c, p.g2, x + Math.floor(r() * 16), y + Math.floor(r() * 4) * 4 + 3);
}
export function paintCobble(c, x, y, v, vi) { cobbleBody(c, x, y, v, vi); }

/**
 * GRAVEL — scree: broken hill-stone in mixed sizes, each chip lit on its upper
 * left with a pixel of shade below-right. The border chips come from the family
 * generator and are drawn on both sides, so each is whole across the seam.
 */
var CHIPS = [['p', 's'], ['pq', '.s'], ['pq', 'qs'], ['.p.', 'pqs'], ['pqq', '.ss']];
export function paintGravel(c, x, y, v) {
  const p = terrainPalette(), r = sr(v), s = p.scree;
  R(c, s[2], x, y, 16, 16);
  somePatch(c, mix(s[2], s[3], 0.5), x, y, r, 2.4, 1.8, 2);
  speck(c, s[1], x, y, 8, r);
  speck(c, s[3], x, y, 8, r);
  const tones = [[s[4], s[3]], [s[5], s[4]], [p.peb[2], p.peb[1]], [s[4], s[3]], [p.peb[3], p.peb[2]]];
  const chip = (cx, cy, shape, t) => stamp(c, x, y, cx, cy, shape, { p: t[0], q: t[1], s: s[0] });
  const n = 9 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) {
    const sh = CHIPS[Math.floor(r() * CHIPS.length)];
    const [cx, cy] = spot(r, sh[0].length, sh.length);
    chip(cx, cy, sh, tones[Math.floor(r() * tones.length)]);
  }
  const f = fr(ESALT.gravel);
  for (let i = 0; i < 6; i++) {
    const t = Math.floor(f() * 15), sh = CHIPS[1 + Math.floor(f() * 2)], tt = tones[Math.floor(f() * tones.length)];
    if (i & 1) { chip(15, t, sh, tt); chip(-1, t, sh, tt); }
    else { chip(t, 15, sh, tt); chip(t, -1, sh, tt); }
  }
}

/**
 * MUD — wet dark earth: a sheen where it catches the light, hoofprints, and a
 * puddle now and then that holds a scrap of sky with a shaded lip on its
 * upper-left rim (the bank the light cannot see over).
 */
export function paintMud(c, x, y, v) {
  const p = terrainPalette(), r = sr(v), m = p.mud;
  R(c, m[3], x, y, 16, 16);
  somePatch(c, m[2], x, y, r, 2.6, 1.8, 2);
  speck(c, m[2], x, y, 8, r);
  speck(c, m[4], x, y, 6, r);
  seam(c, x, y, ESALT.mud, [m[2], m[3], m[2], m[4], m[3], m[2]], 10, 3, 3);
  for (let i = 0; i < 2; i++) { const len = 2 + Math.floor(r() * 4); const [sx, sy] = spot(r, len, 1, 1); mark(c, m[5], x, y, sx, sy, len, 1); }
  // A puddle in one tile of six, ragged-edged and never the same shape twice.
  if (r() < 0.17) {
    const rx = 2.4 + r() * 2.2, ry = 1.4 + r() * 1.2;
    const cx = rx + 1 + r() * (14 - rx * 2), cy = ry + 1.5 + r() * (13 - ry * 2), salt = Math.floor(r() * 9999);
    for (let py = 0; py < 16; py++) for (let px = 0; px < 16; px++) {
      const dx = (px + 0.5 - cx) / rx, dy = (py + 0.5 - cy) / ry;
      const d = dx * dx + dy * dy + ((hash(px, py, salt) & 255) / 255 - 0.5) * 0.35;
      if (d >= 1) continue;
      const top = dy < -0.3, low = dy > 0.4;
      P(c, top && d > 0.45 ? m[1] : (low && d > 0.55 ? '#687d8a' : '#4d5f6a'), x + px, y + py);
    }
    const sl = Math.max(1, Math.round(rx) - 1);
    mark(c, '#7f95a2', x, y, Math.round(cx - sl / 2), Math.round(cy), sl, 1);   // the sky in it
  }
  // a line of hoofprints
  if (r() < 0.5) {
    const [sx, sy] = spot(r, 9, 4, 1);
    for (let i = 0; i < 3; i++) { mark(c, m[1], x, y, sx + i * 3, sy + (i & 1) * 2, 2, 1); mark(c, m[4], x, y, sx + i * 3, sy + (i & 1) * 2 + 1, 2, 1); }
  }
}

/** SAND — wind ripples (a shaded trough under a lit crest, gently curved) and the odd shell. */
export function paintSand(c, x, y, v) {
  const p = terrainPalette(), r = sr(v), s = p.sand;
  R(c, s[3], x, y, 16, 16);
  somePatch(c, mix(s[2], s[3], 0.5), x, y, r, 2.6, 1.6, 2);
  speck(c, s[2], x, y, 8, r);
  speck(c, s[4], x, y, 8, r);
  seam(c, x, y, ESALT.sand, [s[2], s[3], s[4], s[3], s[2], s[3]], 8, 3, 2);
  // Wind ripples: long, low, broken — a trough a step down with a crest a step
  // up, gaps where the ripple dies out. Short high-contrast arcs read as gulls.
  const n = 1 + Math.floor(r() * 2);
  for (let i = 0; i < n; i++) {
    const len = 8 + Math.floor(r() * 6), sx = 1 + Math.floor(r() * (15 - len)), sy = 3 + Math.floor(r() * 10);
    const bow = (r() < 0.5 ? 1 : -1) * (0.6 + r() * 0.8);
    for (let k = 0; k < len; k++) {
      if ((hash(k, sy, v & 255) & 7) === 0) continue;
      const yy = sy + Math.round(bow * Math.sin(Math.PI * k / (len - 1)));
      mark(c, mix(s[2], s[3], 0.4), x, y, sx + k, yy, 1, 1);
      if (k > 0 && k < len - 1) mark(c, s[4], x, y, sx + k, yy - 1, 1, 1);
    }
  }
  if (r() < 0.35) { const [sx, sy] = spot(r, 2, 1, 2); P(c, '#f4eee0', x + sx, y + sy); P(c, '#d9a898', x + sx + 1, y + sy); }
  if (r() < 0.5) { const sh = PEBBLES[0]; const [sx, sy] = spot(r, 2, 2, 1); stamp(c, x, y, sx, sy, sh, { p: p.peb[3], q: p.peb[2], s: s[1] }); }
}

/**
 * FARMLAND — furrows on a 4-row cycle, which divides 16, so they run on across
 * every seam. Each ridge's line wobbles by a sine series that vanishes at both
 * tile edges; clods, a stone and the odd sprout sit on the ridges.
 */
export function furrows(c, x, y, r, pal) {
  const d = pal || terrainPalette().dirt;
  // Straight furrows on a 4-row cycle (which divides 16, so they run on across
  // every seam). A per-column wobble used to shift whole columns a pixel at a
  // time, and the furrows stepped in lockstep like the joints of a plank floor;
  // the life is in the crowns instead — lit in uneven lengths, clodded, broken.
  R(c, d[3], x, y, 16, 16);
  const crown = mix(d[3], d[4], 0.7), crownD = mix(d[3], d[4], 0.35);
  for (let k = 0; k < 4; k++) {
    const top = k * 4;
    let run = 0, lit = true;
    for (let i = 0; i < 16; i++) {
      if (--run <= 0) { run = 2 + Math.floor(r() * 5); lit = r() < 0.72; }
      mark(c, lit ? crown : crownD, x, y, i, top, 1, 1);           // the ridge's crown
      mark(c, mix(d[2], d[3], 0.4), x, y, i, top + 2, 1, 1);       // the far side, in shade
      mark(c, d[2], x, y, i, top + 3, 1, 1);                       // the trough
    }
    for (let j = 0; j < 3; j++) P(c, d[5], x + Math.floor(r() * 16), y + top);             // clods on the crown
    for (let j = 0; j < 2; j++) P(c, d[1], x + Math.floor(r() * 16), y + top + 3);         // and in the trough
  }
  speck(c, mix(d[2], d[3], 0.5), x, y, 4, r);
}
export function paintFarmland(c, x, y, v) {
  const p = terrainPalette(), r = sr(v);
  furrows(c, x, y, r);
  for (let i = 0; i < 2; i++) { const [sx, sy] = spot(r, 1, 2, 1); if (r() < 0.5) { P(c, p.g4, x + sx, y + sy); P(c, p.g2, x + sx, y + sy + 1); } }
}

/** CROP_WHEAT — rows of ripe stalks whose heads sway a pixel through three frames. */
export function paintWheat(c, x, y, v, f) {
  const p = terrainPalette(), r = sr(v), d = p.dirt;
  furrows(c, x, y, r);
  const sway = [0, 1, 0][f % 3] - (f === 2 ? 1 : 0);
  const stalks = [];
  for (let row = 0; row < 4; row++) for (let i = 0; i < 5; i++) stalks.push([Math.floor(r() * 15), row * 4 + 1 + Math.floor(r() * 2), 3 + Math.floor(r() * 2), r()]);
  for (const [sx, sy, h, q] of stalks) {
    mark(c, d[1], x, y, sx + 1, sy + h, 1, 1);                          // shade at the foot
    mark(c, '#9a8a3a', x, y, sx, sy + 1, 1, h - 1);                     // the stalk
    const hx = sx + (q < 0.7 ? sway : 0);
    mark(c, '#d9bd62', x, y, hx, sy - 1, 1, 2);                         // the head
    mark(c, q < 0.5 ? '#f0dc96' : '#c9a84c', x, y, hx, sy - 1, 1, 1);
  }
}

/** CROP_CABBAGE — rows of heads, each a lit ball of leaves with a dark heart and a shadow. */
export function paintCabbage(c, x, y, v) {
  const p = terrainPalette(), r = sr(v);
  furrows(c, x, y, r);
  const heads = [];
  for (let row = 0; row < 2; row++) for (let i = 0; i < 2; i++) heads.push([1 + i * 7 + Math.floor(r() * 3), 1 + row * 8 + Math.floor(r() * 2)]);
  for (const [hx, hy] of heads) {
    groundShadow(c, x, y, hx + 3, hy + 5, 3.2, 1.4, 0.3);
    stamp(c, x, y, hx, hy, ['.lll.', 'lhlmm', 'lmdms', '.mss.'], { h: '#a8cf84', l: '#7fb05e', m: '#5c9046', d: '#3f6b35', s: '#2e5028' });
  }
}

// ---------------------------------------------------------------------------
// 7. VERGES AND PATCHES — one material laid into another through a mask
// ---------------------------------------------------------------------------
//
// A verge (grass reaching into a road) and an island patch (a snow drift in a
// meadow) are both TWO painters and a mask. Canvas clipping is slow and the
// headless tools have none, so each painter is RECORDED into a 256-slot colour
// buffer by a ctx look-alike, and the mask picks a buffer per pixel. The turf
// in a verge is therefore the real sward, border ring and all, and it joins the
// GRASS tile next door exactly as another grass tile would.

/** A 16x16 recorder: fillRect writes the current fillStyle into a colour array. */
function record(paint) {
  const buf = new Array(256).fill(null);
  const rc = {
    fillStyle: '#000',
    fillRect(x, y, w, h) {
      const x0 = Math.max(0, x | 0), y0 = Math.max(0, y | 0), x1 = Math.min(16, (x | 0) + (w | 0)), y1 = Math.min(16, (y | 0) + (h | 0));
      for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++) buf[j * 16 + i] = this.fillStyle;
    },
  };
  paint(rc);
  return buf;
}
/** Paint the buffer's pixels where `mask[i] === want` (or everywhere when mask is null). */
function blit(c, x, y, buf, mask, want = 1) {
  for (let i = 0; i < 256; i++) {
    if (mask && mask[i] !== want) continue;
    const col = buf[i];
    if (col) { c.fillStyle = col; c.fillRect(x + (i & 15), y + (i >> 4), 1, 1); }
  }
}

/**
 * The turf mask for a set of verged sides: a depth that wanders a pixel now and
 * then (1-7px) along each side, a stipple two pixels wide at its edge, and the
 * odd tuft one pixel further in. 1 = turf, 0 = soil, 2 = the soil pixel just
 * beyond the turf on a north or west side, which the turf shades.
 */
function vergeMask(r, sides) {
  const m = new Uint8Array(256);
  for (const side of sides) {
    const at = (d, t) => (side === 'N' ? d * 16 + t : side === 'S' ? (15 - d) * 16 + t : side === 'W' ? t * 16 + d : t * 16 + 15 - d);
    let d0 = 3 + Math.floor(r() * 3);
    for (let t = 0; t < 16; t++) {
      if (r() < 0.38) d0 += r() < 0.5 ? 1 : -1;
      d0 = Math.max(1, Math.min(7, d0));
      for (let d = 0; d < d0; d++) {
        const q = r();
        if (d < d0 - 2 || (d === d0 - 2 && q < 0.8) || (d === d0 - 1 && q < 0.5)) m[at(d, t)] = 1;
      }
      if (r() < 0.2) m[at(Math.min(15, d0), t)] = 1;
      if ((side === 'N' || side === 'W') && d0 + 1 < 16 && m[at(d0, t)] !== 1 && r() < 0.7) m[at(d0, t)] = Math.max(m[at(d0, t)], 2);
    }
  }
  return m;
}

/**
 * A soil tile with turf verges on `sides`. `soil` paints the ground itself;
 * `shade` is the tone the turf edge darkens it to on the sides the light comes
 * from. The turf is the sward, seeded from the tile so it varies with it.
 */
function vergeTile(c, x, y, v, sides, soil, shade) {
  const p = terrainPalette(), r = sr(v);
  const soilBuf = record((rc) => soil(rc, r));
  const turfBuf = record((rc) => { const rt = sr(v ^ 0x5a5a); sward(rc, 0, 0, rt, p.g3); scatterTufts(rc, 0, 0, rt, 2, tufts(), turf(p)); });
  const m = vergeMask(r, sides);
  blit(c, x, y, soilBuf, null);
  for (let i = 0; i < 256; i++) if (m[i] === 2) { c.fillStyle = shade; c.fillRect(x + (i & 15), y + (i >> 4), 1, 1); }
  blit(c, x, y, turfBuf, m, 1);
  // blades leaning out over the edge, lit, a pixel past the turf
  for (let i = 0; i < 256; i++) {
    if (m[i] === 1) continue;
    const px = i & 15, py = i >> 4;
    const touch = (px > 0 && m[i - 1] === 1) || (px < 15 && m[i + 1] === 1) || (py > 0 && m[i - 16] === 1) || (py < 15 && m[i + 16] === 1);
    if (touch && (hash(px, py, v & 4095) & 7) === 0) P(c, p.g4, x + px, y + py);
  }
}

/** DIRT_PATH_N..NW — a trodden path with turf verges on the named sides. */
export function paintPathEdge(c, x, y, v, sides) {
  vergeTile(c, x, y, v, sides, (rc, r) => pathBody(rc, 0, 0, r), terrainPalette().path[1]);
}
/** DIRT_N..NW — bare earth with turf verges on the named sides. */
export function paintDirtEdge(c, x, y, v, sides) {
  vergeTile(c, x, y, v, sides, (rc, r) => dirtBody(rc, 0, 0, r), terrainPalette().dirt[1]);
}

// ---------------------------------------------------------------------------
// 8. SNOW AND ICE
// ---------------------------------------------------------------------------
//
// Snow is nearly white, so its form is all in the SHADOWS, and snow shadows are
// blue: a drift is a soft mound lit on its upper-left face with a cool blue
// shade pooled on its lower right. A glint of pure white here and there is the
// sparkle. The ramp is picked by hand because a pale colour's ramp collapses
// toward grey: these are the sky's blues laid on white.

var SNOW = ['#9fb0c4', '#b9c7d6', '#d0dae5', '#e6edf3', '#f4f7fa', '#ffffff'];
var ICE = ['#6d9fbc', '#8ab9d2', '#a9d3e6', '#c4e3f0', '#e2f3fa'];
var SSALT = { snow: 131, ice: 132, snowGrass: 133 };

/** A drift: a soft oval lit on its upper left, its lower right in blue shade. */
function drift(c, x, y, r, big) {
  const rx = (big ? 3.4 : 2.2) + r() * 1.6, ry = (big ? 1.8 : 1.2) + r() * 0.8;
  const cx = rx + 0.5 + r() * (15 - rx * 2), cy = ry + 0.5 + r() * (15 - ry * 2);
  for (let py = 0; py < 16; py++) for (let px = 0; px < 16; px++) {
    const dx = (px + 0.5 - cx) / rx, dy = (py + 0.5 - cy) / ry, d = dx * dx + dy * dy;
    if (d >= 1) continue;
    const lit = dx + dy < -0.5, shade = dx * 0.4 + dy > 0.35;
    if (shade) P(c, d > 0.55 ? SNOW[1] : SNOW[2], x + px, y + py);
    else if (lit && d > 0.35) P(c, SNOW[4], x + px, y + py);
  }
}

/** Snow's own body: base, drifts, blue speckle, a sparkle, the ring. */
export function snowBody(c, x, y, r) {
  R(c, SNOW[3], x, y, 16, 16);
  drift(c, x, y, r, true);
  if (r() < 0.6) drift(c, x, y, r, false);
  speck(c, SNOW[2], x, y, 10, r);
  speck(c, SNOW[4], x, y, 6, r);
  seam(c, x, y, SSALT.snow, [SNOW[2], SNOW[3], SNOW[2], SNOW[4], SNOW[3], SNOW[2]], 8, 3, 3);
  for (let i = 0; i < 2; i++) { const [sx, sy] = spot(r, 1, 1, 1); P(c, SNOW[5], x + sx, y + sy); }
}
export function paintSnow(c, x, y, v) { snowBody(c, x, y, sr(v)); }

/**
 * SNOW_GRASS — a thin snow with the meadow showing through: a melt hole or two
 * with its rim in blue shade, dark tufts standing out of the drift, and stems
 * that straddle the top/bottom border so a field of it is one continuous cover.
 */
export function snowGrassBody(c, x, y, r) {
  const p = terrainPalette();
  snowBody(c, x, y, r);
  // Half the tiles show a melt hole: a rounded window onto the turf, its upper
  // rim in the snow's blue shade (the lip the light cannot see over).
  if (r() < 0.5) {
    const rx = 2 + r() * 1.6, ry = 1.4 + r() * 0.9, salt = Math.floor(r() * 9999);
    const cx = rx + 1.5 + r() * (13 - rx * 2), cy = ry + 1.5 + r() * (13 - ry * 2);
    for (let py = 0; py < 16; py++) for (let px = 0; px < 16; px++) {
      const dx = (px + 0.5 - cx) / rx, dy = (py + 0.5 - cy) / ry;
      const d = dx * dx + dy * dy + ((hash(px, py, salt) & 255) / 255 - 0.5) * 0.3;
      if (d >= 1.4) continue;
      P(c, d < 1 ? (dy < -0.25 ? p.g2 : p.g3) : (dy < 0 ? SNOW[1] : SNOW[4]), x + px, y + py);
    }
  }
  // stems standing out of the drift: the turf's own green, softened by the snow
  scatterTufts(c, x, y, r, 1 + Math.floor(r() * 2), tufts(), { h: p.g4, l: mix(p.g3, SNOW[1], 0.35), s: SNOW[1] });
  const f = fr(SSALT.snowGrass);
  for (let i = 0; i < 3; i++) {
    const t = Math.floor(f() * 16), len = 2 + Math.floor(f() * 2), a = 1 + Math.floor(f() * (len - 1));
    for (let k = 0; k < len; k++) { const col = k === 0 ? p.g4 : mix(p.g2, SNOW[1], 0.3); mark(c, col, x, y, t, 16 - a + k, 1, 1); mark(c, col, x, y, t, -a + k, 1, 1); }
  }
}
export function paintSnowGrass(c, x, y, v) { snowGrassBody(c, x, y, sr(v)); }

/**
 * ICE — clear pale blue with frost at its edges of light, a crack or two (a dark
 * line with a lit lip), a bubble, and the sky lying on it in a diagonal streak.
 * No `seam` ring: ice was already quieter at its border than inside, and a
 * family-fixed ring on a surface this flat is itself a 16px rhythm (tiles.js
 * measured lag-16 go 0.38 -> 0.80 when one was tried).
 */
export function paintIce(c, x, y, v) {
  const r = sr(v);
  R(c, ICE[2], x, y, 16, 16);
  somePatch(c, ICE[3], x, y, r, 2.8, 1.8, 2);
  somePatch(c, mix(ICE[1], ICE[2], 0.5), x, y, r, 2, 1.4, 1.6);
  // the sky, lying on it in a soft broken streak (in two of three tiles)
  if (r() < 0.66) {
    const s0 = 2 + Math.floor(r() * 8), len = 5 + Math.floor(r() * 5);
    for (let k = 0; k < len; k++) if (hash(k, v, 3) & 3) mark(c, ICE[3], x, y, s0 + k - 2, 13 - k, 2, 1);
  }
  // A crack, sometimes: a meandering hairline a step darker, lit on its lower
  // lip. One wandering line per tile at most — two crossing crack glyphs in
  // every tile made a frozen lake a sheet of repeated symbols.
  if (r() < 0.55) {
    let cx = 2 + Math.floor(r() * 12), cy = 1 + Math.floor(r() * 4);
    const len = 6 + Math.floor(r() * 8), dir = r() < 0.5 ? -1 : 1;
    for (let s = 0; s < len && cy < 15 && cx > 0 && cx < 15; s++) {
      mark(c, ICE[1], x, y, cx, cy, 1, 1); mark(c, ICE[3], x, y, cx, cy + 1, 1, 1);
      if (r() < 0.55) cx += dir; else cy++;
    }
  }
  speck(c, ICE[3], x, y, 6, r);
  speck(c, mix(ICE[1], ICE[2], 0.5), x, y, 4, r);
  if (r() < 0.5) { const [bx, by] = spot(r, 1, 1, 2); P(c, ICE[4], x + bx, y + by); }
}

// ---------------------------------------------------------------------------
// 9. LONE PATCHES — the _ISLE tiles (tiles.js section 2b has the reasoning)
// ---------------------------------------------------------------------------
//
// A tile of a material with no neighbour of its own kind is a PATCH, not a
// small field: the surrounding ground is painted right across the tile, ring
// and all, and a soft blob of the material sits on it, clear of the border.
// The blob's outline is a per-angle random walk that also varies in size and
// elongation per variant, so 125 snow patches are 125 patches, not one stamp.

/** 0 = surround, 1 = the stippled fringe, 2 = solid patch. `squash` flattens it (snow lies flat), `stip` scales the fringe. */
function isleMask(r, rad, wob, squash = 1, stip = 1) {
  const R16 = new Float64Array(16), T16 = new Float64Array(16), m = new Uint8Array(256);
  const cx = 8 + (r() * 1.8 - 0.9), cy = 8 + (r() * 1.8 - 0.9);
  const sc = 0.74 + r() * 0.42, ecc = (r() * 2 - 1) * 0.26;
  for (let i = 0; i < 16; i++) R16[i] = rad * sc * (1 + ecc * Math.cos(i * 0.7853981634)) + (r() * 2 - 1) * wob;
  for (let q = 0; q < 3; q++) {
    for (let i = 0; i < 16; i++) T16[i] = (R16[(i + 15) & 15] + R16[i] * 2 + R16[(i + 1) & 15]) * 0.25;
    for (let i = 0; i < 16; i++) R16[i] = T16[i];
  }
  // no painted pixel on the border ring: an oversize blob is SCALED down whole
  const lim = Math.min(13.79 - cx, cx - 1.21, 13.79 - cy, cy - 1.21);
  let mx = 0;
  for (let i = 0; i < 16; i++) if (R16[i] > mx) mx = R16[i];
  if (mx > lim) { const k = lim / mx; for (let i = 0; i < 16; i++) R16[i] *= k; }
  const rot = r() * 6.2831853, salt = 1 + Math.floor(r() * 60000);
  for (let py = 1; py <= 14; py++) for (let px = 1; px <= 14; px++) {
    const dx = px + 0.5 - cx, dy = (py + 0.5 - cy) / squash, d = Math.sqrt(dx * dx + dy * dy);
    if (d > 7.2) continue;
    let a = (Math.atan2(dy, dx) + rot) * 2.5464790894703255;
    a -= Math.floor(a / 16) * 16;
    const i0 = Math.floor(a) & 15, t = a - Math.floor(a);
    const k = d - (R16[i0] * (1 - t) + R16[(i0 + 1) & 15] * t);
    // a soft edge, not a splat: solid to within a pixel of the outline, then a
    // thin, sparse stipple (a heavy one made every patch a spiky star)
    if (k > 0.5) continue;
    if (k < -0.9) { m[py * 16 + px] = 2; continue; }
    const keep = (k < -0.3 ? 0.7 : (k < 0.2 ? 0.28 : 0.08)) * stip;
    if ((hash(px, py, salt) & 1023) < keep * 1024) m[py * 16 + px] = 1;
  }
  return m;
}

/**
 * Paint a patch: `under` paints the surround, `over` the material, both into
 * recorders; the mask picks per pixel. A patch that lies ON the ground (snow)
 * takes `dark` along its lower edge, `light` along its upper, and drops a
 * pixel of the surround's `cast` shade under itself. A patch worn INTO the
 * ground (a scuff, a pothole) is `sunk`: the turf's lip shades its upper edge
 * and its lower edge catches the light.
 */
function islePatch(c, x, y, v, under, over, rad, wob, dark, light, sunk = false, cast = null, squash = 1, stip = 1) {
  const r = sr(v);
  const ub = record((rc) => under(rc, sr(v ^ 0x1234)));
  const ob = record((rc) => over(rc, sr(v ^ 0x4321)));
  const m = isleMask(r, rad, wob, squash, stip);
  blit(c, x, y, ub, null);
  if (cast) for (let i = 16; i < 256; i++) if (!m[i] && m[i - 16] === 2) P(c, cast, x + (i & 15), y + (i >> 4));
  const lo = sunk ? light : dark, hi = sunk ? dark : light;
  for (let i = 0; i < 256; i++) {
    if (!m[i]) continue;
    const below = i < 240 ? m[i + 16] : 0, above = i >= 16 ? m[i - 16] : 0;
    let col = ob[i];
    if (m[i] === 2 && lo && below !== 2) col = lo;
    else if (m[i] === 2 && hi && above !== 2) col = hi;
    if (col) P(c, col, x + (i & 15), y + (i >> 4));
  }
}

/** The grass surround the turf-backed patches sit in. */
function swardUnder(rc, r) { const p = terrainPalette(); sward(rc, 0, 0, r, p.g3); scatterTufts(rc, 0, 0, r, 2, tufts(), turf(p)); }

/** SNOW_GRASS_ISLE — a drift lying in the meadow (Neverwinter Wood's 125). */
export function paintSnowIsle(c, x, y, v) {
  const p = terrainPalette();
  // a clean drift with a stem or two standing out of it; the melt holes of a
  // snowy MEADOW turned a lone patch into a ring
  const over = (rc, r) => { snowBody(rc, 0, 0, r); scatterTufts(rc, 0, 0, r, 1, tufts(), { h: p.g4, l: mix(p.g3, SNOW[1], 0.35), s: SNOW[1] }); };
  islePatch(c, x, y, v, swardUnder, over, 5.6, 0.8, SNOW[1], SNOW[4], false, p.g2, 0.72, 0.4);
}
/** DIRT_ISLE — a bare scuff in the grass. */
export function paintDirtIsle(c, x, y, v) {
  const d = terrainPalette().dirt;
  islePatch(c, x, y, v, swardUnder, (rc, r) => dirtBody(rc, 0, 0, r), 5.0, 1.0, d[1], d[4], true);
}
/** GRAVEL_ISLE — a spill of scree into the turf. */
export function paintGravelIsle(c, x, y, v) {
  const s = terrainPalette().scree;
  islePatch(c, x, y, v, swardUnder, (rc, r) => paintGravel(rc, 0, 0, Math.floor(r() * 1e9)), 4.9, 1.0, s[0], s[4], true);
}
/** COBBLE_ISLE — a scrap of old street swallowed by bare earth. */
export function paintCobbleIsle(c, x, y, v) {
  const k = terrainPalette().cob;
  islePatch(c, x, y, v, (rc, r) => dirtBody(rc, 0, 0, r), (rc, r) => cobbleBody(rc, 0, 0, Math.floor(r() * 1e9), 0), 5.0, 1.0, k[0], null, false, terrainPalette().dirt[1]);
}
/** MUD_ISLE — a wallow of mud trodden into the grass: sunk, its upper lip shaded by the turf. */
export function paintMudIsle(c, x, y, v) {
  const m = terrainPalette().mud;
  islePatch(c, x, y, v, swardUnder, (rc, r) => paintMud(rc, 0, 0, Math.floor(r() * 1e9)), 5.2, 1.0, m[1], m[4], true, null, 0.85, 0.6);
}

/**
 * A pool lying in the meadow: the water body inside a soft outline, a rim of
 * wet earth round it, the bank's shadow along the pool's upper edge (the light
 * cannot see over the lip) and its sunlit far side along the lower. `body`
 * paints the water; the pools are still (a patch tile cannot animate: the verge
 * pass would freeze it on one frame).
 */
function pool(c, x, y, v, body, rimD, rimL, shade, lit, reeds) {
  const p = terrainPalette(), r = sr(v);
  const turfB = record((rc) => swardUnder(rc, sr(v ^ 0x1234)));
  const water = record((rc) => body(rc, sr(v ^ 0x4321)));
  const m = isleMask(r, 5.4, 0.9, 0.78, 0.2);
  blit(c, x, y, turfB, null);
  const inP = (i) => m[i] === 2;
  for (let i = 0; i < 256; i++) {
    const px = i & 15, py = i >> 4;
    if (inP(i)) {
      const up = py > 0 && inP(i - 16), dn = py < 15 && inP(i + 16);
      P(c, !up ? shade : (!dn ? lit : water[i]), x + px, y + py);
      continue;
    }
    // the rim: any pixel touching the pool
    const near = (px > 0 && inP(i - 1)) || (px < 15 && inP(i + 1)) || (py > 0 && inP(i - 16)) || (py < 15 && inP(i + 16));
    if (near) P(c, py < 8 ? rimD : rimL, x + px, y + py);
  }
  if (!reeds) return;
  // a clump of reeds at the pool's edge
  for (let k = 0; k < 2; k++) {
    let rx = 0, ry = 0;
    for (let t = 0; t < 12; t++) { const i = Math.floor(r() * 256); if (!inP(i) && ((i & 15) > 0 && inP(i - 1) || (i & 15) < 15 && inP(i + 1))) { rx = i & 15; ry = i >> 4; break; } }
    if (!rx) continue;
    for (let s = 0; s < 3; s++) {
      const sx = Math.max(0, Math.min(15, rx - 1 + s)), h = 3 + ((s * 7 + k) % 3);
      for (let j = 0; j < h && ry - j >= 0; j++) P(c, j === h - 1 ? p.reed[4] : (s === 0 ? p.reed[3] : p.reed[2]), x + sx, y + ry - j);
    }
  }
}

/** BOG_ISLE — a lone bog hole in the grass (the Mere of Dead Men's scatter): murk, duckweed, reeds. */
export function paintBogIsle(c, x, y, v) {
  const p = terrainPalette(), b = p.bog;
  pool(c, x, y, v, (rc, r) => paintBog(rc, 0, 0, Math.floor(r() * 1e9), 0), p.mud[2], p.mud[3], b[1], b[4], true);
}

/** POND_ISLE — a lone pool of open water in the grass, silt-rimmed. */
export function paintPondIsle(c, x, y, v) {
  const p = terrainPalette();
  pool(c, x, y, v, (rc, r) => paintWater(rc, 0, 0, Math.floor(r() * 1e9), 0, false), p.siltM, p.silt, p.w2, p.shallow, false);
}

/**
 * PATH_ISLE — a pothole in a paved ward, the earth showing where the setts have
 * gone. Its surround is the cobble lattice itself, drawn with THIS tile's edge
 * bits so it continues an adjoining COBBLE exactly (both are edge-variant).
 */
export function paintPathIsle(c, x, y, v, vi) {
  const q = terrainPalette().path;
  islePatch(c, x, y, v, (rc) => cobbleBody(rc, 0, 0, v, vi), (rc, r) => pathBody(rc, 0, 0, r), 4.8, 1.0, q[1], q[4], true);
}

// ---------------------------------------------------------------------------
// 10. ROCK — cliff and cave-wall masses, their edges, and the mountain skyline
// ---------------------------------------------------------------------------
//
// A cliff mass seen from above is the broken top of a rock plateau: raised
// slabs lit along their upper-left arris, cracks, lichen (`rockTop`). Its FORM
// is in the edge members, and they model the plateau, not a picture frame:
//
//   _S  the mass's south face: the tile's lower part is a vertical face in
//       shade, split by columnar fractures, lit along its lip, with talus at
//       its foot. The lip's height wanders along the face by a sine series
//       whose ends come from the shared border bits, so a run of _S tiles is
//       one continuous face.
//   _N  the plateau's northern rim: a lit crest where the top breaks away.
//   _W  the rim facing the light, lit;  _E  the rim facing away, in shade.
//
// These members were always registered, and no map ever placed one: masses
// were laid as bare CLIFF / CAVE_WALL. `resolveMasses()` below bakes them in
// when a map loads.

var RSALT = { cliff: 141, caveWall: 142, cliffTop: 143 };

/**
 * The top of a rock mass. It used to be the cobbles' torus tessellation at a
 * larger scale, which is seamless but has ONE layout — so every tile of a cliff
 * showed the same plates and a mass read as wallpaper with a 16px repeat. Then
 * a scatter of slabs per tile, which read as a dotted grid. A plateau seen from
 * above is quiet: a broad tonal drift, grit, lichen — and a web of JOINTS that
 * runs on across the whole mass.
 *
 * The web is keyed to the shared borders. A border whose bit is set has a joint
 * crossing it at a fixed point (x 9 on a top/bottom border, y 6 on a side), so
 * the tiles on both sides agree the joint is there; inside the tile the joints
 * that enter are joined by a wandering line through a point of the variant's
 * choosing, so the web never repeats. `k` is a 7-step ramp, darkest first.
 */
function rockTop(c, x, y, v, vi, k, salt, lichen) {
  const r = sr(v ^ 0x3c3c);
  const lo = mix(k[2], k[3], 0.5), hi = mix(k[3], k[4], 0.5);
  R(c, k[3], x, y, 16, 16);
  somePatch(c, lo, x, y, r, 2.8, 2.2, 2.6);
  if (r() < 0.6) somePatch(c, hi, x, y, r, 2.2, 1.6, 2.2);
  seam(c, x, y, salt, [lo, k[3], hi, k[3], lo, lo], 8, 3, 3);
  speck(c, k[2], x, y, 8, r);
  speck(c, hi, x, y, 6, r);
  speck(c, k[4], x, y, 2, r);
  // the joint web: entries on the borders whose bit is set
  const ends = [];
  if (vi & 1) ends.push([0, 6]);
  if (vi & 2) ends.push([15, 6]);
  if (vi & 4) ends.push([9, 0]);
  if (vi & 8) ends.push([9, 15]);
  const mid = [4 + Math.floor(r() * 8), 4 + Math.floor(r() * 8)];
  if (!ends.length && r() < 0.5) ends.push([2 + Math.floor(r() * 12), 2 + Math.floor(r() * 4)]);
  const J = new Uint8Array(256);
  const joint = (a, b) => {
    let [px, py] = a;
    for (let s = 0; s < 40; s++) {
      J[py * 16 + px] = 1;
      if (px === b[0] && py === b[1]) break;
      const dx = Math.sign(b[0] - px), dy = Math.sign(b[1] - py);
      if (dx && dy) { if (r() < 0.5) px += dx; else py += dy; }
      else if (dx) { px += dx; if (r() < 0.25 && py > 1 && py < 14) py += r() < 0.5 ? 1 : -1; }
      else { py += dy; if (r() < 0.25 && px > 1 && px < 14) px += r() < 0.5 ? 1 : -1; }
    }
  };
  for (const e of ends) joint(e, mid);
  // joints dark, and the lower lip of each lit where the light reaches into it
  const lip = mix(k[3], k[5], 0.5);
  for (let i = 0; i < 256; i++) if (J[i] && (i & 15) > 0 && i < 240 && !J[i + 15]) P(c, lip, x + (i & 15) - 1, y + (i >> 4) + 1);
  for (let i = 0; i < 256; i++) if (J[i]) P(c, k[1], x + (i & 15), y + (i >> 4));
  if (lichen) for (let i = 0; i < 3; i++) { const [lx, ly] = spot(r, 2, 1, 1); P(c, lichen[0], x + lx, y + ly); if (r() < 0.5) P(c, lichen[1], x + lx + 1, y + ly); }
}

/** The depth of the south face's lip at column i: ends from the shared bits, middle wanders. */
function lipDepth(vi, i, base, salt) {
  const e0 = vi & 1, e1 = (vi >> 1) & 1;
  if (i === 0) return base + e0;
  if (i === 15) return base + e1;
  const t = i / 15;
  const a1 = ((hash(vi, 1, salt) & 255) / 255 - 0.5) * 3, a2 = ((hash(vi, 2, salt) & 255) / 255 - 0.5) * 2;
  return Math.round(base + e0 + (e1 - e0) * t + a1 * Math.sin(Math.PI * t) + a2 * Math.sin(2 * Math.PI * t));
}

/**
 * The south face, below the lip. `k` is the ramp. A face is a few broad
 * COLUMNS of rock, not a row of staves: one to three long fractures split it,
 * each column leans a half-step lighter or darker than its neighbour, the face
 * darkens toward its foot and ends in a band of talus. A column that runs off
 * the tile takes its lean from the shared border bit, so a run of faces never
 * steps in tone at a seam. The lip catches the light along its whole length.
 */
function southFace(c, x, y, v, vi, k, salt) {
  const r = sr(v ^ 0x51f7);
  const lips = [];
  for (let i = 0; i < 16; i++) lips.push(Math.max(3, Math.min(9, lipDepth(vi, i, 5, salt))));
  // fractures: long, irregular, few
  const cuts = [];
  for (let px = 3 + Math.floor(r() * 3); px < 13; px += 4 + Math.floor(r() * 4)) cuts.push(px);
  const lean = (i) => {
    let col = 0; while (col < cuts.length && i >= cuts[col]) col++;
    if (col === 0) return (vi & 1) ? 0.35 : -0.2;                  // runs off the left border
    if (col === cuts.length) return (vi & 2) ? 0.35 : -0.2;        // off the right border
    return (hash(col, v & 1023, salt) & 1) ? 0.4 : -0.3;
  };
  for (let i = 0; i < 16; i++) {
    const lip = lips[i], ln = lean(i);
    for (let py = lip; py < 16; py++) {
      const t = (py - lip) / Math.max(1, 15 - lip);
      let lv = 3.2 - t * 2.1 + ln;
      if ((hash(i, py, salt + v) & 15) === 0) lv -= 0.8;               // pitting
      let col = k[Math.max(1, Math.min(4, Math.round(lv)))];
      if (py === lip) col = k[5];                                       // the lip, catching the light
      else if (py === lip + 1) col = k[4];
      P(c, col, x + i, y + py);
    }
    if (lip > 0) P(c, k[1], x + i, y + lip - 1);                         // the top darkens just before its edge
  }
  for (const cx of cuts) {
    let px = cx;
    const from = lips[px] + 2, to = 13 + Math.floor(r() * 2);
    for (let py = from; py < to; py++) {
      if (py > from + 1 && r() < 0.18) px += r() < 0.5 ? -1 : 1;      // the fracture wanders a pixel
      if (px < 1 || px > 14) break;
      P(c, k[0], x + px, y + py);
      if (py < from + 4) P(c, k[4], x + px - 1, y + py);                // lit edge only near the top
    }
  }
  // a broken ledge line across the face, where one bed of rock sits on another
  const ledge = 10 + Math.floor(r() * 3);
  for (let i = 1; i < 15; i++) if (ledge > lips[i] + 2 && (hash(i, ledge, salt + 3) & 3)) P(c, k[1], x + i, y + ledge);
  // talus: loose stones fallen to the foot of the face
  for (let i = 0; i < 3; i++) {
    const tx = 1 + Math.floor(r() * 13), ty = 13 + Math.floor(r() * 2);
    stamp(c, x, y, tx, ty, ['lm', 'ms'], { l: k[4], m: k[3], s: k[0] });
  }
  mark(c, k[0], x, y, 0, 15, 16, 1);
}

/** A rim along one side of the mass top: lit or shaded, wandering 1-2px deep. */
function rim(c, x, y, v, side, col, col2) {
  for (let t = 0; t < 16; t++) {
    const d = 1 + ((hash(t, v & 255, side.charCodeAt(0)) & 3) === 0 ? 1 : 0);
    for (let k = 0; k < d; k++) {
      const px = side === 'W' ? k : side === 'E' ? 15 - k : t, py = side === 'N' ? k : t;
      P(c, k === 0 ? col : col2, x + px, y + py);
    }
  }
}

/** A cliff or cave-wall member. `lit` names the sides that face open ground. */
function massTile(c, x, y, v, vi, lit, cave) {
  const p = terrainPalette();
  const k = cave ? p.cavR : p.rock;
  // A cave wall's top is the unlit mass of the rock: dark and quiet, so the
  // floor and the lit faces read; a cliff's is an open plateau in the sun.
  const top = cave ? [k[0], k[0], k[1], k[1], k[2], k[3], k[3]] : k;
  rockTop(c, x, y, v, vi, top, cave ? RSALT.caveWall : RSALT.cliff, cave ? null : ['#7f8a5a', '#98a06a']);
  if (lit.includes('N')) rim(c, x, y, v, 'N', cave ? k[4] : k[6], cave ? k[3] : k[5]);
  if (lit.includes('W')) rim(c, x, y, v, 'W', cave ? k[3] : k[5], cave ? k[2] : k[4]);
  if (lit.includes('E')) rim(c, x, y, v, 'E', k[1], k[2]);
  if (lit.includes('S')) southFace(c, x, y, v, vi, k, cave ? RSALT.caveWall : RSALT.cliff);
  // the face's flank where a south face turns a corner
  if (lit.includes('S') && lit.includes('E')) for (let py = 4; py < 16; py++) P(c, k[0], x + 15, y + py);
  if (lit.includes('S') && lit.includes('W')) for (let py = 5; py < 15; py++) P(c, k[4], x, y + py);
}
export function paintCliff(c, x, y, v, vi, lit) { massTile(c, x, y, v, vi, lit, false); }
export function paintCaveWall(c, x, y, v, vi, lit) { massTile(c, x, y, v, vi, lit, true); }

/** An ore seam: the cave wall with a vein of mineral glinting in its joints and plates. */
export function paintOre(c, x, y, v, vi, gem, gemL) {
  massTile(c, x, y, v, vi, '', true);
  const r = sr(v ^ 0x0e0e);
  let cx = 2 + Math.floor(r() * 4), cy = 3 + Math.floor(r() * 8);
  for (let i = 0; i < 6; i++) {
    stamp(c, x, y, cx, cy, ['gh', 'sg'], { g: gem, h: gemL, s: terrainPalette().cavR[0] });
    cx += 1 + Math.floor(r() * 2); cy += Math.floor(r() * 3) - 1;
    if (cx > 13 || cy < 1 || cy > 13) break;
  }
}

/** CLIFF_TOP — walkable rocky upland: bare plates with scree and a tuft in the cracks. */
export function paintCliffTop(c, x, y, v, vi) {
  const p = terrainPalette(), k = p.rock;
  // the same rock a step paler: an open, sunlit upland, not the top of a wall
  rockTop(c, x, y, v, vi, [k[1], k[2], k[3], k[4], k[5], k[6], k[6]], RSALT.cliffTop, ['#7f8a5a', '#98a06a']);
  const r = sr(v ^ 0x7a);
  scatterTufts(c, x, y, r, 1, tufts(), { h: p.dry3, l: p.dry2, s: k[1] });
}

/**
 * MOUNTAIN — a range seen from the lowlands, a silhouette against whatever lies
 * behind (so it has transparent sky). Neighbours agree on the skirt height at
 * their shared border through the edge bits (0 left, 1 right). Bits 2-3 choose
 * what this stretch of the range IS — a saddle, a peak on the left, a peak on
 * the right, or a great snow-capped summit — so a range rises and falls instead
 * of repeating one tooth per tile. The profile is the lower of the skirt line
 * and one or two cones; the western flank takes the light, the eastern the
 * shade, and ridges run down from each apex as lit/dark pairs.
 */
export function paintMountain(c, x, y, v, vi) {
  const p = terrainPalette(), k = p.rock, r = sr(v);
  // A border is high (3) or low (8); two neighbours agree which. A high
  // border is a summit the two tiles share, so peaks straddle seams and a
  // range reads as one massif rather than a tooth per tile.
  const hL = (vi & 1) ? 3 : 8, hR = (vi & 2) ? 3 : 8;
  const kind = (vi >> 2) & 3;
  const cones = [];
  if (kind === 2) cones.push([4.5 + r() * 7, 2 + Math.floor(r() * 2), 0.95]);
  if (kind === 3) cones.push([5.5 + r() * 5, 0, 0.9]);
  const a1 = (r() - 0.5) * 3, a2 = (r() - 0.5) * 2;
  const sky = new Array(16);
  for (let i = 0; i < 16; i++) {
    const t = i / 15;
    let h = hL + (hR - hL) * t + a1 * Math.sin(Math.PI * t) + a2 * Math.sin(2 * Math.PI * t);
    for (const [cx, ch, s] of cones) h = Math.min(h, ch + Math.abs(i + 0.5 - cx) * s);
    if (i > 0 && i < 15 && (hash(i, v & 1023, 3) & 3) === 0) h += 1;     // a broken crest
    sky[i] = Math.max(0, Math.round(h));
  }
  sky[0] = hL; sky[15] = hR;
  // which cone owns each column, for the light and the ridges
  const owner = (i) => {
    let best = -1, bh = 99;
    cones.forEach(([cx, ch, s], j) => { const h = ch + Math.abs(i + 0.5 - cx) * s; if (h < bh) { bh = h; best = j; } });
    return bh <= sky[i] + 0.5 ? best : -1;
  };
  for (let i = 0; i < 16; i++) {
    // a column faces the light if the crest climbs to its right (or it is on a cone's west flank)
    const j = owner(i), rise = (i < 15 ? sky[i + 1] : sky[i]) - (i > 0 ? sky[i - 1] : sky[i]);
    const west = j >= 0 ? i + 0.5 < cones[j][0] : rise <= 0;
    const h0 = sky[i];
    for (let py = h0; py < 16; py++) {
      const depth = py - h0;
      let col = west ? (depth < 3 ? k[5] : k[4]) : (depth < 3 ? k[3] : k[2]);
      if (py === h0) col = west ? k[6] : k[4];
      // ridges: a lit spur and its shaded side, spreading as they descend
      if (j >= 0) {
        const [rcx, rch] = cones[j], d = py - rch;
        const lx = Math.round(rcx - 1.5 - d * 0.35), rx = Math.round(rcx + 1 + d * 0.4);
        if (d > 2 && i === lx) col = k[6];
        if (d > 2 && i === lx + 1) col = k[3];
        if (d > 3 && i === rx) col = k[1];
      }
      if (py >= 13) col = mix(col, k[1], 0.35);                        // the foot, where the range meets haze
      P(c, col, x + i, y + py);
    }
  }
  // snow on any apex that climbs to the top of the tile
  for (const [cx, ch] of cones) {
    if (ch > 1) continue;
    for (let i = Math.max(0, Math.round(cx) - 3); i <= Math.min(15, Math.round(cx) + 3); i++) {
      const d = Math.abs(i + 0.5 - cx);
      if (d > 2.6) continue;
      P(c, i + 0.5 < cx ? SNOW[4] : SNOW[2], x + i, y + sky[i]);
      if (d < 1.8) P(c, i + 0.5 < cx ? SNOW[3] : SNOW[1], x + i, y + sky[i] + 1);
    }
  }
}

/**
 * RESOLVE SHELVES. Every deep-water tile with shallow water beside it (and no
 * land — those keep the waterline's bank) becomes the WATER_SHELF member for
 * the sides where the shallows are. Flags are the same as WATER_DEEP's, so
 * nothing but the picture changes. Called with the masses when a map loads.
 */
var SHELF_KEYS = ['', 'N', 'E', 'NE', 'S', 'NS', 'ES', 'NES', 'W', 'NW', 'EW', 'NEW', 'SW', 'NSW', 'ESW', 'NESW'];
export function shelfKey(mask) { return mask ? 'WATER_SHELF_' + SHELF_KEYS[mask] : 'WATER_DEEP'; }
export function resolveShelves(map, T, groupOf) {
  if (!map || !map.ground || T.WATER_DEEP == null || T.WATER_SHELF_N == null) return 0;
  const w = map.w, h = map.h, g = map.ground, deep = T.WATER_DEEP;
  const out = [];
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    const i = yy * w + xx;
    if (g[i] !== deep) continue;
    let mask = 0, land = false;
    [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(([dx, dy], s) => {
      const nx = xx + dx, ny = yy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) return;
      const n = g[ny * w + nx];
      if (groupOf(n) !== 'water') land = true;
      else if (n === T.WATER) mask |= 1 << s;
    });
    if (mask && !land) out.push([i, T[shelfKey(mask)]]);
  }
  for (const [i, id] of out) g[i] = id;
  return out.length;
}

/**
 * FREE-STANDING things — every tree, every bush but a clipped hedge, and the
 * loose natural props — are round and throw their own contact shadow (section
 * 4), so the square occlusion and sun-shadow passes must leave them alone.
 */
var FREE_KEYS = null;
export function freeStanding(key, group) {
  if (group === 'tree') return true;
  if (group === 'plant') return key !== 'HEDGE';
  if (!FREE_KEYS) FREE_KEYS = new Set(['BOULDER', 'STUMP', 'STALAGMITE', 'CRYSTAL']);
  return FREE_KEYS.has(key);
}

/**
 * RESOLVE MASSES. CLIFF and CAVE_WALL are laid as bare mass tiles by every map
 * builder; this swaps each one on the edge of its mass for the member whose
 * `lit` sides face open ground, so the mass gets its rim, its face and its
 * shadow. A neighbour of the same GROUP (MOUNTAIN beside CLIFF, an ore seam in
 * a cave wall) is part of the mass; the map edge counts as mass too, so borders
 * grow no rim. Called once when a map is built; tile ids only change within a
 * family, so every flag stays exactly as it was.
 *
 * MOUNTAIN is a skyline, and a skyline only makes sense with open ground (or
 * the map's edge) north of it. The maps also seal their SIDES with it, and a
 * column of skylines stacked one above another is a column of teeth; so a
 * MOUNTAIN tile with more mass directly north of it becomes CLIFF first, and
 * then gets the rim or face its place in the mass calls for.
 */
export function resolveMasses(map, T, groupOf) {
  if (!map || !map.deco || !T) return 0;
  const fams = [['CLIFF', 'cliff'], ['CAVE_WALL', 'cave-wall']].filter(([k]) => T[k] != null);
  if (!fams.length) return 0;
  const w = map.w, h = map.h, deco = map.deco;
  const base = new Map(fams.map(([k, g]) => [T[k], { k, g }]));
  let n = 0;
  if (T.MOUNTAIN != null && T.CLIFF != null) {
    for (let yy = h - 1; yy > 0; yy--) for (let xx = 0; xx < w; xx++) {
      const i = yy * w + xx, up = deco[i - w];
      if (deco[i] === T.MOUNTAIN && up && groupOf(up) === 'cliff') { deco[i] = T.CLIFF; n++; }
    }
  }
  const out = Array.from(deco);
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    const f = base.get(deco[yy * w + xx]);
    if (!f) continue;
    const closed = (dx, dy) => {
      const nx = xx + dx, ny = yy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) return true;
      const d = deco[ny * w + nx];
      return !!d && groupOf(d) === f.g;
    };
    const N = !closed(0, -1), S = !closed(0, 1), E = !closed(1, 0), W = !closed(-1, 0);
    const suf = S && E ? 'SE' : S && W ? 'SW' : S ? 'S' : N && E ? 'NE' : N && W ? 'NW' : N ? 'N' : W ? 'W' : E ? 'E' : '';
    if (!suf) continue;
    const id = T[`${f.k}_${suf}`];
    if (id != null) { out[yy * w + xx] = id; n++; }
  }
  for (let i = 0; i < out.length; i++) deco[i] = out[i];
  return n;
}

// ---------------------------------------------------------------------------
// 11. FLOORS — cave floors, flagstones, dungeon brick, bone-strewn floors
// ---------------------------------------------------------------------------
//
// Underground the floor is most of the picture, so it has to carry the place
// without shouting over the walls. A cave floor is packed grit with flat stones
// bedded in it, hairline cracks, now and then a puddle or a skin of moss. A
// dungeon floor is DRESSED stone: flagstones of uneven size (the torus
// tessellation again, so no 8px grid ever appears) or a running bond of stone
// brick. The two dungeon floors were a grey slab and a purple brick at
// different values, which turned every mixed room into a patchwork; they now
// share one cool stone ramp and differ by cut, not by colour.

var FSALT = { cave: 151, brick: 153 };

/** One flat stone bedded in a floor: an irregular oval, lit up-left, shadowed down-right. */
function beddedStone(c, x, y, r, k, cx, cy, rx, ry) {
  const salt = Math.floor(r() * 65535);
  const inS = (px, py) => {
    const dx = (px + 0.5 - cx) / rx, dy = (py + 0.5 - cy) / ry;
    return dx * dx + dy * dy < 0.9 + ((hash(px, py, salt) & 3) - 1.5) * 0.12;
  };
  for (let py = Math.max(0, Math.floor(cy - ry - 1)); py <= Math.min(15, Math.ceil(cy + ry + 1)); py++) {
    for (let px = Math.max(0, Math.floor(cx - rx - 1)); px <= Math.min(15, Math.ceil(cx + rx + 1)); px++) {
      if (!inS(px, py)) {
        if (inS(px - 1, py - 1) && px > 0 && py > 0) P(c, k[1], x + px, y + py);   // its shadow in the grit
        continue;
      }
      const lit = !inS(px - 1, py) || !inS(px, py - 1), shade = !inS(px + 1, py) || !inS(px, py + 1);
      P(c, shade ? k[2] : (lit ? k[5] : k[4]), x + px, y + py);
    }
  }
}

/**
 * A crack: it runs mostly downhill on a slant it keeps (and now and then turns),
 * one pixel a row, so it reads as a fracture and never as a right-angled glyph.
 * `ok(px, py)` says where it may be drawn; its lower lip catches the light.
 */
function crack(c, x, y, r, cx, cy, len, dark, lit, ok) {
  let dir = r() < 0.5 ? -1 : 1;
  for (let s = 0; s < len && cy < 15 && cx > 0 && cx < 15; s++) {
    if (ok(cx, cy)) { P(c, dark, x + cx, y + cy); if (lit && ok(cx - dir, cy + 1) && s & 1) P(c, lit, x + cx - dir, y + cy + 1); }
    if (r() < 0.6) cx += dir;
    if (r() < 0.12) dir = -dir;
    cy++;
  }
}

/** The grit every cave floor shares: flat base, soft mottles, a ring from the family generator. */
export function caveFloorBody(c, x, y, r) {
  const k = terrainPalette().cavF;
  const lo = mix(k[2], k[3], 0.5), hi = mix(k[3], k[4], 0.45);
  R(c, k[3], x, y, 16, 16);
  somePatch(c, lo, x, y, r, 2.6, 1.8, 2.4);
  if (r() < 0.7) somePatch(c, hi, x, y, r, 2, 1.4, 2);
  seam(c, x, y, FSALT.cave, [lo, k[3], lo, hi, lo, k[3]], 8, 3, 3);
  speck(c, k[2], x, y, 8, r);
  speck(c, k[4], x, y, 4, r);
  speck(c, k[5], x, y, 1, r);
}

/**
 * CAVE_FLOOR — grit and bedded stones. Eight variants: some carry a hairline
 * crack, one in five a skin of moss, one in eight a puddle that holds a little
 * of the torchlight.
 */
export function paintCaveFloor(c, x, y, v) {
  const p = terrainPalette(), k = p.cavF, r = sr(v);
  caveFloorBody(c, x, y, r);
  const stones = r() < 0.55 ? 1 : 0;
  for (let i = 0; i < stones; i++) {
    const rx = 1.6 + r() * 1.6, ry = 1.1 + r() * 1.0;
    beddedStone(c, x, y, r, p.scree, rx + 1 + r() * (13 - rx * 2), ry + 1 + r() * (13 - ry * 2), rx, ry);
  }
  const kind = v % 40;
  if (kind < 2) {                                       // a puddle: dark, still, rimmed with wet
    const rx = 2.4 + r() * 1.6, ry = 1.4 + r() * 0.8;
    const cx = rx + 1.5 + r() * (13 - rx * 2), cy = ry + 1.5 + r() * (13 - ry * 2);
    patch(c, k[1], x, y, cx, cy, rx + 0.9, ry + 0.7, v & 1023);
    patch(c, mix(p.w0, k[1], 0.45), x, y, cx, cy, rx, ry, (v >> 3) & 1023);
    mark(c, mix(p.w2, k[2], 0.5), x, y, Math.round(cx - rx * 0.5), Math.round(cy - ry * 0.4), Math.max(1, Math.round(rx * 0.7)), 1);
    P(c, p.w4, x + Math.round(cx - rx * 0.5), y + Math.round(cy - ry * 0.4));
  } else if (kind < 13) {                               // moss creeping out of the damp
    for (let i = 0; i < 9; i++) {
      const mx = 2 + Math.floor(r() * 12), my = 2 + Math.floor(r() * 12);
      P(c, i & 1 ? p.cavMoss[0] : p.cavMoss[1], x + mx, y + my);
      if (r() < 0.4) P(c, p.cavMoss[2], x + mx, y + my - 1);
    }
  }
  if (r() < 0.45) crack(c, x, y, r, 3 + Math.floor(r() * 10), 2 + Math.floor(r() * 5), 5 + Math.floor(r() * 4), k[1], k[4], () => true);
}

/** CAVE_FLOOR_RUBBLE — the same grit under fallen stones, each lit, shadowed and settled. */
export function paintCaveRubble(c, x, y, v) {
  const p = terrainPalette(), k = p.scree, r = sr(v);
  caveFloorBody(c, x, y, r);
  const n = 2 + Math.floor(r() * 3);
  const SHAPES = [['.lm.', 'lmmd', '.dd.'], ['lm.', 'mmd', '.d.'], ['lmm', 'mdd'], ['.l.', 'lmd', 'md.'], ['lm', 'md']];
  for (let i = 0; i < n; i++) {
    const s = SHAPES[Math.floor(r() * SHAPES.length)];
    const [sx, sy] = spot(r, s[0].length + 1, s.length + 1, 0);
    // a cast shadow one pixel down-right, then the stone
    stamp(c, x, y, sx + 1, sy + 1, s, { l: p.cavF[1], m: p.cavF[1], d: p.cavF[1] });
    stamp(c, x, y, sx, sy, s, { l: k[6], m: k[4], d: k[2] });
  }
  speck(c, k[4], x, y, 5, r);
}

/**
 * Flagstone courses. A dungeon floor is laid, not grown, so its joints are
 * straight and every tile border IS a joint: each tile owns the joint along its
 * right and bottom edges and a lit arris along its top and left, so the grid is
 * the one the masons cut. What must not repeat is the cutting, so each variant
 * splits its square into one to four slabs of its own proportions (mirrored
 * variants double the set), and every slab takes its own tone and wear.
 */
var FLAG_CUTS = [
  [[0, 0, 16, 16]],
  [[0, 0, 16, 7], [0, 7, 16, 9]],
  [[0, 0, 9, 16], [9, 0, 7, 16]],
  [[0, 0, 10, 10], [10, 0, 6, 10], [0, 10, 16, 6]],
  [[0, 0, 16, 6], [0, 6, 7, 10], [7, 6, 9, 10]],
  [[0, 0, 6, 16], [6, 0, 10, 8], [6, 8, 10, 8]],
  [[0, 0, 8, 8], [8, 0, 8, 8], [0, 8, 8, 8], [8, 8, 8, 8]],
  [[0, 0, 11, 6], [11, 0, 5, 6], [0, 6, 5, 10], [5, 6, 11, 10]],
];

export function paintFlagstones(c, x, y, v, vi, cracked) {
  const p = terrainPalette(), k = p.dstone, r = sr(v);
  let cut = FLAG_CUTS[vi % FLAG_CUTS.length];
  if ((vi >> 3) & 1) cut = cut.map(([a, b, w, h]) => [16 - a - w, b, w, h]);
  const TONES = [k[3], mix(k[3], k[4], 0.4), mix(k[2], k[3], 0.5), k[3], mix(k[3], p.cavF[4], 0.35)];
  for (const [sx, sy, w, h] of cut) {
    const tone = TONES[Math.floor(r() * TONES.length)];
    const sunk = r() < 0.15;                                     // a slab settled a little lower
    for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
      let col = sunk ? mix(tone, k[1], 0.18) : tone;
      if (px === w - 1 || py === h - 1) col = k[1];                // the joint, right and below
      else if (py === 0) col = mix(tone, k[5], 0.4);               // lit arris
      else if (px === 0) col = mix(tone, k[5], 0.22);
      else if (py === h - 2 || px === w - 2) col = mix(tone, k[1], 0.3);
      P(c, col, x + sx + px, y + sy + py);
    }
    // the joint's darkest pixel where it meets its crossing joint
    P(c, k[0], x + sx + w - 1, y + sy + h - 1);
    // wear: a few specks inside the slab
    for (let i = 0; i < Math.max(1, (w * h) >> 5); i++) {
      const X = sx + 1 + Math.floor(r() * Math.max(1, w - 3)), Y = sy + 1 + Math.floor(r() * Math.max(1, h - 3));
      P(c, i & 1 ? mix(tone, k[1], 0.35) : mix(tone, k[5], 0.25), x + X, y + Y);
    }
    if (!cracked) continue;
    // a crack across a big slab: a dark line with its lower lip lit
    if (w * h >= 60 && r() < 0.5) {
      crack(c, x, y, r, sx + 2 + Math.floor(r() * (w - 4)), sy + 1, h - 2, mix(k[1], k[0], 0.5), mix(tone, k[5], 0.3),
        (px, py) => px > sx && px < sx + w - 2 && py > sy && py < sy + h - 2);
    }
    // a spalled corner showing the grit beneath
    if (r() < 0.3 && w > 4 && h > 4) stamp(c, x, y, sx + w - 4, sy + h - 4, ['..g', '.gg', 'ggg'], { g: p.cavF[2] });
  }
  // moss in the joints of a cracked floor
  if (cracked) for (let i = 0; i < 4; i++) {
    const [sx, sy, w, h] = cut[Math.floor(r() * cut.length)];
    const along = r() < 0.5;
    P(c, p.cavMoss[i % 3], x + (along ? sx + Math.floor(r() * w) : sx + w - 1), y + (along ? sy + h - 1 : sy + Math.floor(r() * h)));
  }
}

/**
 * Stone brick in running bond: 8x4 courses, every other course offset half a
 * brick. The bond's period is the tile, which is right for masonry; what must
 * not repeat is the BRICKS, so each takes its own tone and wear from the
 * variant, and the bricks that straddle the left/right border take theirs from
 * the shared bits (0 left, 1 right) so the two halves are one brick.
 */
function brickFloor(c, x, y, v, vi, k) {
  const r = sr(v ^ 0x4b4b);
  const TONES = [k[3], mix(k[3], k[4], 0.45), mix(k[2], k[3], 0.55), k[3], mix(k[3], k[4], 0.25)];
  for (let row = 0; row < 4; row++) {
    const oy = row * 4, off = (row & 1) ? 4 : 0;
    for (let b = -1; b < 2; b++) {
      const bx = off + b * 8;
      const straddle = bx < 0 ? 0 : (bx + 8 > 16 ? 1 : -1);
      const tone = straddle >= 0 ? TONES[hash((vi >> straddle) & 1, row, FSALT.brick) % TONES.length] : TONES[Math.floor(r() * TONES.length)];
      const chip = straddle < 0 && r() < 0.22;                   // a worn, chipped arris
      for (let py = 0; py < 4; py++) for (let px = 0; px < 8; px++) {
        const X = bx + px, Y = oy + py;
        if (X < 0 || X > 15) continue;
        let col = tone;
        if (py === 3 || px === 7) col = k[0];                    // bed and head joints, in the brick's shadow
        else if (py === 0) col = mix(tone, k[5], 0.42);          // the lit top arris
        else if (px === 0) col = mix(tone, k[5], 0.22);
        else if (py === 2 || px === 6) col = mix(tone, k[1], 0.35);
        if (chip && py === 0 && px < 3) col = mix(tone, k[1], 0.3);
        mark(c, col, x, y, X, Y, 1, 1);
      }
    }
  }
  // grime and wear, a few pixels a brick
  for (let i = 0; i < 12; i++) {
    const X = Math.floor(r() * 16), Y = Math.floor(r() * 16);
    if ((Y & 3) !== 3) P(c, i & 1 ? mix(k[3], k[1], 0.45) : mix(k[3], k[5], 0.3), x + X, y + Y);
  }
}

/** DUNGEON_FLOOR — stone brick in running bond, in the same cool stone as the flagstones. */
export function paintDungeonFloor(c, x, y, v, vi) {
  const p = terrainPalette();
  brickFloor(c, x, y, v, vi, p.dstone);
  const r = sr(v ^ 0x99);
  if (r() < 0.3) for (let i = 0; i < 4; i++) { const X = 1 + Math.floor(r() * 14), Y = (Math.floor(r() * 4) * 4) + 3; P(c, p.cavMoss[i & 1], x + X, y + Y); }
}

/**
 * BONE_FLOOR — the dungeon's brick under a litter of bones: long bones with
 * knuckled ends, a curve of rib, now and then a skull. Every bone has a lit
 * upper edge and drops a pixel of shadow down-right onto the stone.
 */
export function paintBoneFloor(c, x, y, v, vi) {
  const p = terrainPalette();
  brickFloor(c, x, y, v, vi, p.dstone);
  paintBoneScatter(c,x,y,v);
}

/** Transparent bone litter, also laid over the shared dungeon stone surface. */
export function paintBoneScatter(c,x,y,v,density=1,contrast=1) {
  const p = terrainPalette(), r = sr(v), sh = mix(p.dstone[1], '#000000', 0.2);
  const B = { l: mix(p.dstone[3],p.boneL,contrast), m: mix(p.dstone[3],p.bone,contrast), d: mix(p.dstone[2],p.boneD,contrast) };
  // a long bone lying aslant (both ways), a rib's curve, a short bone knuckle-down
  const BONES = [['ll...', 'lmm..', '..mm.', '...md', '...dd'], ['...ll', '..mml', '.mm..', 'dm...', 'dd...'], ['.lll', 'm...', 'm...', '.d..'], ['lm..', '.mm.', '..md']];
  const expected=(2+Math.floor(r()*2))*Math.max(0,density);
  const n=Math.floor(expected)+(r()<expected%1?1:0);
  for (let i = 0; i < n; i++) {
    const s = BONES[Math.floor(r() * BONES.length)];
    const [sx, sy] = spot(r, s[0].length + 1, s.length + 1, 0);
    stamp(c, x, y, sx + 1, sy + 1, s, { l: sh, m: sh, d: sh });
    stamp(c, x, y, sx, sy, s, B);
  }
  if (r() < 0.45*density) {
    const [sx, sy] = spot(r, 5, 5, 1);
    const SK = ['.lll.', 'lmmmm', 'mkmkd', '.mmd.', '.d.d.'];
    stamp(c, x, y, sx + 1, sy + 1, SK, { l: sh, m: sh, d: sh, k: sh });
    stamp(c, x, y, sx, sy, SK, { ...B, k: '#1a1410' });
  }
}

// ---------------------------------------------------------------------------
// 12. LOOSE STONE — boulders, rocks, rubble, stalagmites
// ---------------------------------------------------------------------------
//
// A stone reads by its PLANES. `lump()` cuts an irregular oval into three to
// five facets — each pixel takes the facet whose normal it is nearest — and
// lights each facet flat against the upper-left sun, so a boulder is a few
// crisp faces (a pale top, a shaded flank, a dark underside) instead of a
// pillow-shaded blob. Creases where two facets meet are drawn a step darker;
// the keyline runs only along the bottom and right, where the light cannot
// reach, and the lit edge separates itself from the ground by being brighter
// than it. The body is cool granite, so it parts from warm scree and cave
// floor by hue where the values are close (the reason ROCK was repainted three
// times before this; see tiles.js).

/**
 * One faceted stone, tile space: centre (cx, cy), radii (rx, ry), `k` a
 * 6-step ramp darkest first, `n` facets.
 */
function lump(c, x, y, cx, cy, rx, ry, k, salt, n = 4) {
  const f = sr(salt);
  const harm = [f() * 6.283, f() * 6.283, 0.1 + f() * 0.1, 0.05 + f() * 0.08];
  const inside = (px, py) => {
    const dx = (px + 0.5 - cx) / rx, dy = (py + 0.5 - cy) / ry;
    const a = Math.atan2(dy, dx);
    const rr = 1 + harm[2] * Math.sin(2 * a + harm[0]) + harm[3] * Math.sin(3 * a + harm[1]) - (dy < -0.4 ? 0.12 : 0);
    return dx * dx + dy * dy < rr * rr;
  };
  // facet normals: the ellipsoid's normal at a few scattered points, the first
  // always the top face that catches the light
  const fac = [[-0.25, -0.45, 0.86]];
  for (let i = 1; i < n; i++) {
    const a = (i / n) * 6.283 + f() * 0.8, s = 0.55 + f() * 0.3;
    const nx = Math.cos(a) * s, ny = Math.sin(a) * s * 0.9;
    fac.push([nx, ny, Math.sqrt(Math.max(0.05, 1 - nx * nx - ny * ny))]);
  }
  const facetAt = (px, py) => {
    const dx = (px + 0.5 - cx) / rx, dy = (py + 0.5 - cy) / ry;
    const nz = Math.sqrt(Math.max(0, 1 - dx * dx - dy * dy));
    let best = 0, bd = -9;
    for (let i = 0; i < fac.length; i++) { const d = fac[i][0] * dx + fac[i][1] * dy + fac[i][2] * nz; if (d > bd) { bd = d; best = i; } }
    return best;
  };
  const level = (i) => {
    const q = fac[i], I = q[0] * LX + q[1] * LY + q[2] * LZ;
    return I < 0.05 ? 1 : (I < 0.35 ? 2 : (I < 0.6 ? 3 : 4));
  };
  const x0 = Math.max(0, Math.floor(cx - rx - 1)), x1 = Math.min(15, Math.ceil(cx + rx + 1));
  const y0 = Math.max(0, Math.floor(cy - ry - 1)), y1 = Math.min(15, Math.ceil(cy + ry + 1));
  for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
    if (!inside(px, py)) continue;
    const fi = facetAt(px, py);
    let lv = level(fi);
    // a crease where this face meets a darker one below or to the right
    const fr1 = inside(px + 1, py) ? facetAt(px + 1, py) : fi, fd = inside(px, py + 1) ? facetAt(px, py + 1) : fi;
    if ((fr1 !== fi && level(fr1) < lv) || (fd !== fi && level(fd) < lv)) lv = Math.max(1, lv - 1);
    if (!inside(px + 1, py) || !inside(px, py + 1)) lv = 0;                     // keyline, shaded side only
    else if (!inside(px - 1, py) || !inside(px, py - 1)) lv = lv >= 4 ? 5 : Math.max(lv, 3);   // the lit rim: a bright arris
    P(c, k[lv], x + px, y + py);
  }
}

/** BOULDER — one big faceted granite stone on its own cast shadow, lichen now and then. */
export function paintBoulder(c, x, y, v) {
  const p = terrainPalette(), r = sr(v);
  const rx = 6.2 + r() * 1.2, ry = 4.8 + r() * 0.9, cx = 8 + (r() - 0.5), cy = 15.2 - ry - 0.6;
  groundShadow(c, x, y, cx + 2, cy + ry - 0.6, rx + 0.6, 2.2, 0.36);
  lump(c, x, y, cx, cy, rx, ry, p.gran, v, 4 + Math.floor(r() * 2));
  if (r() < 0.4) for (let i = 0; i < 4; i++) P(c, i & 1 ? '#8a9460' : '#6e7a4c', x + Math.round(cx - 2 + r() * 3), y + Math.round(cy - ry + 1.5 + r() * 2));
}

/** ROCK — a knee-high stone you can step round (walkable), sometimes with a pebble beside it. */
export function paintRock(c, x, y, v) {
  const p = terrainPalette(), r = sr(v);
  const rx = 3 + r() * 1.4, ry = 2.2 + r() * 0.8;
  const cx = rx + 2 + r() * (11 - rx * 2), cy = ry + 5 + r() * (8 - ry * 2);
  groundShadow(c, x, y, cx + 1.4, cy + ry - 0.4, rx + 0.4, 1.4, 0.34);
  lump(c, x, y, cx, cy, rx, ry, p.gran, v, 3 + Math.floor(r() * 2));
  if (r() < 0.6) {
    const px = Math.round(cx + (r() < 0.5 ? -rx - 2 : rx + 1)), py = Math.round(cy + ry - 1);
    if (px > 0 && px < 14 && py < 15) { stamp(c, x, y, px, py, ['lm', 'md'], { l: p.gran[4], m: p.gran[2], d: p.gran[0] }); }
  }
}

/** RUBBLE — a spill of broken stone: several small facets heaped, the back ones first. */
export function paintRubbleProp(c, x, y, v) {
  const p = terrainPalette(), r = sr(v);
  const n = 5 + Math.floor(r() * 3), pile = [];
  for (let i = 0; i < n; i++) {
    const rx = 1.4 + r() * 1.6, ry = 1.1 + r() * 1.0;
    pile.push([rx + 0.8 + r() * (14.4 - rx * 2), ry + 4 + r() * (10.6 - ry * 2), rx, ry, i]);
  }
  pile.sort((a, b) => a[1] - b[1]);
  for (const [cx, cy, rx, ry] of pile) groundShadow(c, x, y, cx + 1, cy + ry * 0.6, rx + 0.5, ry * 0.7 + 0.4, 0.3);
  for (const [cx, cy, rx, ry, i] of pile) lump(c, x, y, cx, cy, rx, ry, i & 1 ? p.gran : p.stoneR, (v * 31 + i) >>> 0, 3);
}

/**
 * STALAGMITE — two or three dripstone cones of different heights, each lit down
 * its left flank and keylined down its right, ringed by the drip lines of the
 * water that built it, standing in a little pool of its own shadow.
 */
export function paintStalagmite(c, x, y, v) {
  const p = terrainPalette(), r = sr(v), k = p.drip;
  groundShadow(c, x, y, 9.5, 14.4, 6.6, 1.8, 0.36);
  const cones = [[5 + r() * 2, 2 + Math.floor(r() * 3), 3 + r()], [10.5 + r() * 2, 6 + Math.floor(r() * 3), 2.4 + r() * 0.8]];
  if (r() < 0.6) cones.push([2.5 + r() * 1.5, 9 + Math.floor(r() * 2), 1.8]);
  cones.sort((a, b) => a[1] - b[1]);
  for (const [cx, top, hw] of cones) {
    for (let py = top; py <= 14; py++) {
      const t = (py - top) / Math.max(1, 14 - top), half = 0.5 + hw * Math.pow(t, 0.8);
      for (let px = Math.floor(cx - half); px <= Math.ceil(cx + half); px++) {
        const u = (px + 0.5 - cx) / half;
        if (u < -1 || u > 1 || px < 0 || px > 15) continue;
        let lv = u < -0.45 ? 4 : (u < 0.15 ? 3 : (u < 0.6 ? 2 : 1));
        if (u > 0.75) lv = 0;
        if (py === top) lv = 4;
        if (((py - top) % 4 === 3) && lv > 1 && lv < 4) lv--;                 // drip rings
        P(c, k[lv], x + px, y + py);
      }
    }
    P(c, k[5], x + Math.round(cx - 0.6), y + top + 1);                        // a wet glint
  }
}

// ---------------------------------------------------------------------------
// 13. MARGINS — reeds, cattails and driftwood
// ---------------------------------------------------------------------------

/**
 * REEDS / CATTAILS — clumps, not a comb. Each clump springs from one dark root
 * and fans: stems lean out from it, the lit ones on the side toward the sun,
 * straw at their tips; a leaf or two arcs over and droops. Cattails carry the
 * brown club head with its spike on some stems. The shade mat at the foot is
 * where the clump meets water or mud.
 */
export function paintReeds(c, x, y, v, cattails) {
  const p = terrainPalette(), r = sr(v), k = p.reed;
  groundShadow(c, x, y, 9, 14.6, 7.4, 1.8, 0.3);
  const clumps = 2 + Math.floor(r() * 2);
  for (let q = 0; q < clumps; q++) {
    const rx = 2 + Math.floor(r() * 12), ry = 13 + Math.floor(r() * 3);
    const stems = 3 + Math.floor(r() * 3);
    for (let i = 0; i < stems; i++) {
      const lean = (i / (stems - 1) - 0.5) * 0.42 + (r() - 0.5) * 0.14;
      const len = 8 + Math.floor(r() * 6);
      const lit = lean < 0.05;
      // stems rise a pixel or two apart, so each stays a clean line
      let px = rx + (i - (stems - 1) / 2) * 1.6, py = ry;
      const pts = [];
      for (let s = 0; s < len; s++) { pts.push([Math.round(px), py]); px += lean; py--; }
      pts.forEach(([sx, sy], s) => {
        const t = s / len;
        const col = t > 0.82 ? k[4] : (lit ? (t > 0.4 ? k[3] : k[2]) : (t > 0.5 ? k[2] : k[1]));
        mark(c, col, x, y, sx, sy, 1, 1);
      });
      const [hx, hy] = pts[pts.length - 1];
      if (cattails && i % 2 === 1 && hy > 1) {
        // the club: two pixels wide, lit on the left, a pale spike above
        stamp(c, x, y, hx - 1, hy - 1, ['.s', 'lh', 'lh', 'lh', 'dd'], { s: k[4], l: p.cattail[2], h: p.cattail[1], d: p.cattail[0] });
      }
    }
    // a leaf arcing over from the root and drooping at its tip
    if (r() < 0.5) {
      const dir = r() < 0.5 ? -1 : 1;
      for (let s = 0; s < 6; s++) {
        const lx = rx + dir * (s < 4 ? s : 4 + (s - 4) * 0.5), ly = ry - 3 - (s < 3 ? s : 5 - s);
        mark(c, s > 3 ? k[2] : k[3], x, y, Math.round(lx), Math.round(ly), 1, 1);
      }
    }
    mark(c, k[0], x, y, rx - 1, ry, 3, 1);                                   // the root
  }
}

/** DRIFTWOOD — a bleached, tapering log with a snapped branch stub, grain and a knot, on its shadow. */
export function paintDriftwood(c, x, y, v) {
  const p = terrainPalette(), r = sr(v), k = p.drift;
  const oy = 8 + Math.floor(r() * 3), x0 = 1 + Math.floor(r() * 2), x1 = 14 - Math.floor(r() * 2);
  groundShadow(c, x, y, 9, oy + 3.4, 7, 1.6, 0.3);
  for (let px = x0; px <= x1; px++) {
    const t = (px - x0) / (x1 - x0), th = t < 0.12 || t > 0.9 ? 2 : 3;     // tapered ends
    for (let j = 0; j < th; j++) {
      const col = j === 0 ? k[3] : (j === th - 1 ? k[1] : k[2]);
      mark(c, col, x, y, px, oy + j + (th === 2 ? 1 : 0), 1, 1);
    }
    mark(c, k[0], x, y, px, oy + 3, 1, 1);                                   // underside keyline
    if ((hash(px, v, 3) & 3) === 0 && th === 3) mark(c, k[1], x, y, px, oy + 1, 1, 1);   // grain
  }
  const bx = x0 + 3 + Math.floor(r() * (x1 - x0 - 6));
  stamp(c, x, y, bx, oy - 2, ['l.', 'lm'], { l: k[3], m: k[2] });           // the branch stub
  P(c, k[0], x + bx + 4, y + oy + 1); P(c, k[1], x + bx + 5, y + oy + 1);  // a knot
}

// ---------------------------------------------------------------------------
// 14. BLENDING — soft joins for places with no verge pass of their own
// ---------------------------------------------------------------------------
//
// The overworld softens every join between two grounds in its own draw pass
// (world/overworld.js section 4b). The battle arena, and anything else that
// blits raw ground tiles, has nothing of the kind and reads as a chequerboard.
// `drawGroundBlended()` in tiles.js is the cure, and this is its geometry:
//
//   - A RANK per material decides who invades whom, so two tiles never both
//     push a tongue into each other (which turns a border to mush). The softer,
//     spreading materials rank highest: grass over snow over sand over soil
//     over paving.
//   - The tongue's depth along a border is a smooth value-noise of the WORLD
//     pixel coordinate along that border line, so it runs on unbroken from one
//     tile to the next and never repeats per tile.
//   - The invading pixels are the invader's own raster sampled at the same
//     local position — exactly what a tile of that material would show here —
//     so the tongue carries its texture and its border ring with it.

var BLEND_RANK = {
  grass: 70, snow: 64, 'snow-grass': 62, sand: 50, mud: 46, dirt: 40, path: 38,
  gravel: 34, farmland: 30, ash: 28, 'cliff-top': 26, ice: 20,
  cobble: 14, flagstone: 14, road: 14, floor: 10,
};
/** How strongly a ground material spreads into its neighbours; null = never blends (water, lava). */
export function blendRank(sub, group) {
  const k = BLEND_RANK[sub] ?? BLEND_RANK[group];
  return k == null ? null : k;
}

/** Tongue depth (px) at world coordinate `u` along border line `k` (axis 0 = a horizontal border). */
export function vergeDepth(u, k, axis) {
  const q = u / 5, i = Math.floor(q), t = q - i, s = t * t * (3 - 2 * t);
  const a = hash(i, k, 0x6e7 + axis) & 255, b = hash(i + 1, k, 0x6e7 + axis) & 255;
  return 1.6 + ((a + (b - a) * s) / 255) * 5.4;
}

/**
 * The invaded pixels of tile (tx, ty) from side `s` (0 N, 1 E, 2 S, 3 W): a
 * Uint8Array(256) with 1 = the invader's pixel, 2 = a pixel of this tile that
 * the invader's lip shades (on the N and W sides, where the light comes from).
 */
export function vergeMaskAt(tx, ty, s) {
  const m = new Uint8Array(256);
  const horiz = s === 0 || s === 2;
  for (let i = 0; i < 16; i++) {
    const u = (horiz ? tx : ty) * 16 + i;
    const k = s === 0 ? ty : s === 2 ? ty + 1 : s === 3 ? tx : tx + 1;
    const d = vergeDepth(u, k, horiz ? 0 : 1);
    for (let j = 0; j < 16; j++) {
      const px = horiz ? i : (s === 3 ? j : 15 - j), py = horiz ? (s === 0 ? j : 15 - j) : i;
      const q = py * 16 + px, over = j - d;
      const wx = tx * 16 + px, wy = ty * 16 + py;
      // solid inside the depth, a sparse stipple across its last pixel
      if (over < -0.8 || (over < 0.4 && (hash(wx, wy, 0x51) & 3) !== 0)) m[q] = 1;
      else if (over < 1.2 && (s === 0 || s === 3) && !m[q]) m[q] = 2;
    }
  }
  return m;
}
