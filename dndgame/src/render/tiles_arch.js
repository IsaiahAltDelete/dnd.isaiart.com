// render/tiles_arch.js — the built world's brushes: roofs, walls, doors, windows, interiors, rugs and furniture, and the map-load pass that tells a tile where in a building it stands.
//
// render/tiles.js owns the REGISTRY (ids, flags, layers, the raster cache); the
// building, interior and prop tiles registered there draw with the painters in
// this file, so every house in the game is one hand. The natural world's
// painters live in render/tiles_terrain.js, whose primitives this file shares.
//
// THE PROBLEM THIS FILE SOLVES. A tile is rasterised once per (id, variant) and
// blitted everywhere, so a painter never knows where it is: a roof tile cannot
// tell whether it is the ridge or the eave, a window cannot tell whether it sits
// in plaster or in stone, a rug square cannot tell which of its sides is the
// edge of the rug. Before this pass every one of those guessed, and every guess
// showed: flat bands of roof with no pitch, pale plaster patches round every
// window in a stone house, a gold border round every 16px of carpet.
//
// So the knowledge moves to where it exists — the map. `resolveArch()` runs once
// when a map is built (world/maps.js loadMap, beside terrain's resolveTileMasses)
// and swaps each authored tile for the MEMBER that fits its neighbours: THATCH_M
// on the bottom row of a roof becomes THATCH_EAVE_M, a WINDOW between two stone
// blocks becomes WINDOW_STONE, the north wall of a room becomes a wall face and
// the others wall tops, a rectangle of CARPET_RED becomes one rug with one
// border. Authoring stays exactly as it was; every map in every pack benefits,
// and a map that never runs the pass (a battle arena) still draws, because each
// authored key keeps a sensible painter of its own.
//
// RULES every painter here keeps:
//   1. LIGHT from the upper left: lit tops and left flanks, shade and cast
//      shadow down and to the right; shadows cool, lights warm (palette.js).
//   2. A coursed material (shakes, slates, stone, brick, logs) settles the joint
//      on a shared tile border through the edge-variant bits, exactly as
//      tiles.js section 4.8 describes, so a wall has no 16px lattice.
//   3. One silhouette per object, keyline on the shaded side, no pillow shading.
//
// IMPORT RULE (same as tiles_terrain.js): tiles.js hands these painters to
// `def()` while it evaluates, so everything reached at that time is a hoisted
// function declaration and the palette is built lazily behind `var`.

import { ramp, mix, RAMPS } from './palette.js';
import { R, P, mark, sr, hash, stamp } from './tiles_terrain.js';

// ---------------------------------------------------------------------------
// 1. PALETTE — ramps are darkest first; index names read as "step n".
// ---------------------------------------------------------------------------

var AP = null;
/** The building palette, built once. */
export function archPalette() {
  if (AP) return AP;
  const r = (hex, n, o) => Object.freeze(ramp(hex, n, o));
  AP = Object.freeze({
    ink: '#1c1410', inkC: '#17161c',
    // roofs: seven steps each, so a ridge, a pitch and an eave can each sit a
    // step apart and still leave a highlight and an occlusion tone to spare
    thatch: r('#b08c4c', 7, { spread: 0.58, shift: 18 }),
    shingle: r('#86705c', 7, { spread: 0.52, shift: 16 }),
    pantile: r('#b0583a', 7, { spread: 0.54, shift: 18 }),
    slate: r('#56607a', 7, { spread: 0.5, shift: 12 }),
    // walls
    plaster: r('#d8caa4', 6, { spread: 0.34, shift: 10 }),
    lime: r('#d9d1bb', 6, { spread: 0.3, shift: 8 }),
    endGrain: r('#b8966a', 5, { spread: 0.44, shift: 12 }),
    ochre: r('#cfb07a', 6, { spread: 0.36, shift: 12 }),
    oak: r('#5a3c27', 6, { spread: 0.42, shift: 14 }),
    stone: r('#77736b', 7, { spread: 0.52 }),
    brick: r('#98503e', 7, { spread: 0.5, shift: 14 }),
    mortar: r('#b3a891', 4, { spread: 0.24 }),
    log: r('#7a5434', 7, { spread: 0.54, shift: 16 }),
    // doors, furniture
    wood: r('#8a5c38', 7, { spread: 0.54, shift: 16 }),
    woodDark: r('#5e3e28', 6, { spread: 0.46, shift: 14 }),
    iron: RAMPS.iron, gold: RAMPS.gold, bronze: RAMPS.bronze,
    doorPaint: [
      r('#7a5232', 5, { spread: 0.44 }),     // bare oak
      r('#4f6a4a', 5, { spread: 0.42 }),     // green
      r('#8a3a2e', 5, { spread: 0.44 }),     // oxblood
      r('#3f5878', 5, { spread: 0.42 }),     // woad blue
      r('#5a4030', 5, { spread: 0.42 }),     // tarred
      r('#94703a', 5, { spread: 0.44 }),     // ochre
    ],
    shutter: r('#4d6b62', 5, { spread: 0.42 }),
    glass: { deep: '#1d2a36', pane: '#2e4655', sky: '#6e93a6', glint: '#b8d2da', lead: '#1a1d22' },
    lit: { deep: '#b8702e', pane: '#e8a850', sky: '#f6d17e', glint: '#fff0be', lead: '#5a3218' },
    smoke: ['rgba(150,146,150,0.55)', 'rgba(178,174,176,0.45)', 'rgba(200,196,192,0.32)'],
    soot: '#2a2420',
  });
  return AP;
}

/** Clamped index into a ramp. */
function at(rp, i) { return rp[i < 0 ? 0 : (i >= rp.length ? rp.length - 1 : i)]; }

/** n 1px specks anywhere on the tile. */
function speck(c, col, x, y, n, rn, x0 = 0, y0 = 0, w = 16, h = 16) {
  for (let i = 0; i < n; i++) P(c, col, x + x0 + Math.floor(rn() * w), y + y0 + Math.floor(rn() * h));
}

/** Clear pixels (for silhouettes cut out of a tile — hipped corners, wall insets). */
function cut(c, x, y, mx, my, w = 1, h = 1) {
  if (c.clearRect) c.clearRect(x + mx, y + my, w, h);
}

/**
 * Joints across one horizontal course, laid left to right from random widths.
 * The joint ON the tile's left border belongs to the shared bit `edgeL` (bit 0
 * of the edge variant): neighbours agree whether a block runs through the seam.
 * Returns the x of every joint inside the tile.
 */
function joints(rn, minW, maxW, edgeL) {
  const out = [];
  if (edgeL) out.push(0);
  let bx = 0;
  for (;;) {
    bx += minW + Math.floor(rn() * (maxW - minW + 1));
    if (bx > 14) break;
    out.push(bx);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 2. ROOFS
// ---------------------------------------------------------------------------
//
// A roof seen from the south in three-quarter view is five things, top down:
// the skyline (a dark edge against whatever is behind the house), the ridge cap,
// the pitch falling toward you in courses, the eave (the thickness of the roof
// edge, lit on its upper lip) and the dark underside that the overworld's
// `_drawOverhangs` continues down the wall as the drip shadow. The ends of the
// run are the verges: a lit barge-board or thatch roll on the west end, a shaded
// one on the east. `resolveArch` names each tile's ROW (R ridge, B body, E eave,
// S a one-row roof that is both) and END (L, M, R).
//
// Rows step a notch in value — ridge lightest, eave darkest — which is what
// makes a roof read as a SLOPE rather than a rug; the step is two to four L*,
// so the seam between rows reads as a course line and never as a stripe.

/** Material tables: body tone per row, and how the courses are laid. */
function roofSpec(mat) {
  const p = archPalette();
  const rp = p[mat] || p.thatch;
  // base index of the pitch for ridge / body / eave rows
  return { rp, R: 4, B: 3, E: 3 };
}

/**
 * THATCH — a thick soft blanket combed down the pitch. The combing is kept to
 * half-steps of the ramp so it reads as texture and never as noise; what carries
 * the form is the courses (a lit bulge at the top of each, shade under it), the
 * ridge and the eave.
 */
function thatchPitch(c, x, y, rn, y0, y1, base, rp) {
  const hi = mix(rp[base], rp[base + 1], 0.5), lo = mix(rp[base], rp[base - 1], 0.5);
  R(c, rp[base], x, y + y0, 16, y1 - y0);
  // courses every seven rows from the ridge down: the bulge catches the light,
  // the lap under it is in shade (broken, so it never rules a line)
  for (let yy = y0 + 3; yy < y1; yy += 7) {
    for (let i = 0; i < 16; i++) {
      const hh = hash(i, yy, 77);
      if (hh % 4) P(c, hi, x + i, y + yy);
      if (yy + 4 < y1 && hh % 3) P(c, lo, x + i, y + yy + 4);
      if (yy + 5 < y1 && !(hh % 3)) P(c, lo, x + i, y + yy + 5);
    }
  }
  // the comb: long 1px strands, a light and a dark tone, a pixel apart
  for (let xx = 0; xx < 16; xx++) {
    let yy = y0 + Math.floor(rn() * 3);
    while (yy < y1) {
      const len = 3 + Math.floor(rn() * 5);
      const k = rn();
      if (k < 0.3) mark(c, lo, x, y, xx, yy, 1, Math.min(len, y1 - yy));
      else if (k < 0.52) mark(c, hi, x, y, xx, yy, 1, Math.min(len - 1, y1 - yy));
      yy += len + 1 + Math.floor(rn() * 2);
    }
  }
}

function thatchRidge(c, x, y, rn, y0, rp) {
  // The ridge roll: skyline, lit crown, the spars pegging it, and the
  // block-cut lower edge — a row of points, the way a ridge is trimmed — with
  // the shade each point throws on the pitch.
  R(c, rp[5], x, y + y0 + 1, 16, 5);
  H1(c, rp[0], x, y + y0);
  H1(c, rp[6], x, y + y0 + 1);
  H1(c, mix(rp[5], rp[6], 0.5), x, y + y0 + 2);
  for (let i = 0; i < 16; i++) if (i % 4 === 2) { P(c, rp[3], x + i, y + y0 + 3); P(c, rp[4], x + i + 1, y + y0 + 3); }
  H1(c, rp[4], x, y + y0 + 4);
  for (let i = 0; i < 16; i++) {
    const k = i % 4, tooth = k === 1 || k === 2;
    P(c, tooth ? rp[4] : rp[1], x + i, y + y0 + 5);
    P(c, tooth ? rp[3] : mix(rp[3], rp[2], 0.5), x + i, y + y0 + 6);
    if (tooth) P(c, rp[2], x + i, y + y0 + 7);
  }
}

function thatchEave(c, x, y, rn, y0, rp) {
  // The eave is the cut face of a foot of straw: a lit rounded lip, the cut
  // ends in vertical flecks, a dark underside.
  H1(c, mix(rp[3], rp[4], 0.5), x, y + y0);
  H1(c, rp[5], x, y + y0 + 1);
  R(c, rp[4], x, y + y0 + 2, 16, 1);
  for (let i = 0; i < 16; i++) {
    P(c, (i + (hash(i, 3, 13) & 1)) & 1 ? rp[3] : rp[4], x + i, y + y0 + 2);
    P(c, hash(i, 5, 13) % 3 ? rp[3] : rp[2], x + i, y + y0 + 3);
  }
  if (y0 + 4 < 16) R(c, rp[1], x, y + y0 + 4, 16, 16 - y0 - 4);
  for (let i = 0; i < 16; i += 3) if (y0 + 4 < 16) P(c, rp[2], x + i + (hash(i, 7, 13) & 1), y + y0 + 4);
}

/** SHAKES — split-oak shingles in 4px courses, staggered, butts shaded. */
function shakeCourses(c, x, y, rn, vi, y0, y1, base, rp, salt) {
  R(c, rp[base], x, y + y0, 16, y1 - y0);
  for (let top = y0; top < y1; top += 4) {
    const cr = sr((salt ^ Math.imul(top + 3, 0x2545F491) ^ Math.imul((vi >> 2) + 1, 0x9E3779B1)) >>> 0);
    const js = joints(cr, 3, 5, (vi & 1) && ((top >> 2) & 1));
    // each shake its own tone: split oak weathers unevenly
    let prev = 0;
    const cols = js.concat([16]);
    for (const j of cols) {
      if (j > prev) {
        const t = cr();
        const col = t < 0.2 ? rp[base + 1] : t < 0.35 ? rp[base - 1] : rp[base];
        R(c, col, x + prev, y + top + 1, j - prev, Math.min(3, y1 - top - 1));
        if (j - prev > 2 && cr() < 0.5) P(c, rp[base + 1], x + prev + 1, y + top + 1);
      }
      prev = j;
    }
    // the shadow under the butt of the course above, and the joints — dark only
    // where the course above shades them, fading out toward the butt
    R(c, rp[base - 2], x, y + top, 16, 1);
    for (const j of js) if (j < 16) { mark(c, rp[base - 2], x, y, j, top + 1, 1, 1); mark(c, rp[base - 1], x, y, j, top + 2, 1, 1); }
    // the butt of each shake catches the light
    if (top + 3 < y1) for (let i = 0; i < 16; i++) if (hash(i, top, salt) % 4) P(c, mix(rp[base], rp[base + 1], 0.6), x + i, y + top + 3);
  }
}

/** SLATE — thin, broad, cold; 4px courses with a crisp lit upper-left corner. */
function slateCourses(c, x, y, rn, vi, y0, y1, base, rp, salt) {
  R(c, rp[base], x, y + y0, 16, y1 - y0);
  for (let top = y0; top < y1; top += 4) {
    const cr = sr((salt ^ Math.imul(top + 5, 0x2545F491) ^ Math.imul((vi >> 2) + 3, 0x9E3779B1)) >>> 0);
    const js = joints(cr, 4, 7, (vi & 1) && !((top >> 2) & 1));
    let prev = 0;
    for (const j of js.concat([16])) {
      if (j > prev) {
        const t = cr();
        if (t < 0.18) R(c, rp[base + 1], x + prev, y + top + 1, j - prev, Math.min(3, y1 - top - 1));
        else if (t < 0.3) R(c, rp[base - 1], x + prev, y + top + 1, j - prev, Math.min(3, y1 - top - 1));
        P(c, rp[base + 2], x + prev + (j === 0 ? 1 : 0), y + top + 1);
      }
      prev = j;
    }
    R(c, rp[base - 2], x, y + top, 16, 1);
    for (const j of js) if (j < 16) mark(c, rp[base - 2], x, y, j, top + 1, 1, 3);
  }
  // lichen, never moss: slate is too cold for it
  if (rn() < 0.5) P(c, '#8a9180', x + 2 + Math.floor(rn() * 12), y + y0 + 1 + Math.floor(rn() * Math.max(1, y1 - y0 - 2)));
}

/** PANTILES — S-profile clay in 4px columns running down the pitch; laps every 4 rows. */
function pantileCourses(c, x, y, rn, vi, y0, y1, base, rp) {
  const t = (d) => at(rp, base + d);
  R(c, t(-1), x, y + y0, 16, y1 - y0);
  for (let col = 0; col < 16; col += 4) {
    // the roll lit on its left, the pan in shade on its right
    mark(c, t(1), x, y, col, y0, 1, y1 - y0);
    mark(c, t(0), x, y, col + 1, y0, 1, y1 - y0);
    mark(c, t(0), x, y, col + 2, y0, 1, y1 - y0);
    mark(c, t(-2), x, y, col + 3, y0, 1, y1 - y0);
  }
  for (let top = y0 + 3; top < y1; top += 4) {
    // the rounded nose of each tile over the one below it
    for (let col = 0; col < 16; col += 4) {
      P(c, t(2), x + col, y + top);
      P(c, t(1), x + col + 1, y + top);
      P(c, t(1), x + col + 2, y + top);
      if (top + 1 < y1) { P(c, t(-2), x + col + 1, y + top + 1); P(c, t(-2), x + col + 2, y + top + 1); P(c, t(-3), x + col + 3, y + top + 1); }
    }
  }
  // weathering: a sun-bleached tile, a dark replacement, a skin of lichen
  for (let i = 0; i < 2; i++) {
    const col = (Math.floor(rn() * 4) * 4) + 1, row = y0 + Math.floor(rn() * Math.max(1, y1 - y0 - 3));
    mark(c, rn() < 0.5 ? t(1) : t(-1), x, y, col, row, 2, 2);
  }
  if (rn() < 0.4) mark(c, '#7d8a52', x, y, 1 + (Math.floor(rn() * 4) * 4), y0 + Math.floor(rn() * Math.max(1, y1 - y0 - 1)), 2, 1);
}

/** 1px horizontal line across the tile. */
function H1(c, col, x, yy) { R(c, col, x, yy, 16, 1); }

/** Ridge caps for the hard roofs: a board, a row of half-rounds, a lead roll. */
function hardRidge(c, x, y, mat, rp, y0) {
  H1(c, rp[0], x, y + y0);
  if (mat === 'pantile') {
    R(c, rp[4], x, y + y0 + 1, 16, 3);
    for (let i = 0; i < 16; i += 5) { P(c, rp[6], x + i + 1, y + y0 + 1); P(c, rp[5], x + i + 2, y + y0 + 1); P(c, rp[2], x + i + 4, y + y0 + 2); P(c, rp[2], x + i + 4, y + y0 + 3); }
    H1(c, rp[5], x, y + y0 + 1); for (let i = 4; i < 16; i += 5) P(c, rp[3], x + i, y + y0 + 1);
    H1(c, rp[1], x, y + y0 + 4);
  } else if (mat === 'slate') {
    R(c, rp[3], x, y + y0 + 1, 16, 3);
    H1(c, rp[5], x, y + y0 + 1); H1(c, rp[2], x, y + y0 + 3);
    for (let i = 2; i < 16; i += 8) { P(c, '#8d949f', x + i, y + y0 + 1); P(c, '#6d7480', x + i, y + y0 + 2); }
    H1(c, rp[1], x, y + y0 + 4);
  } else {
    // two boards meeting over the ridge, the south one lit
    R(c, rp[4], x, y + y0 + 1, 16, 2);
    H1(c, rp[6], x, y + y0 + 1);
    H1(c, rp[2], x, y + y0 + 3);
    for (let i = 3; i < 16; i += 6) P(c, rp[1], x + i, y + y0 + 2);
    H1(c, rp[1], x, y + y0 + 4);
  }
}

/** The eave of a hard roof: the last course overhangs as a lit fascia, then shade. */
function hardEave(c, x, y, mat, rp, y0) {
  if (mat === 'pantile') {
    // the open ends of the bottom course, a row of dark mouths
    for (let col = 0; col < 16; col += 4) {
      mark(c, rp[5], x, y, col, y0, 3, 1);
      mark(c, rp[1], x, y, col + 1, y0 + 1, 2, 1); mark(c, rp[4], x, y, col, y0 + 1, 1, 1); mark(c, rp[2], x, y, col + 3, y0 + 1, 1, 1);
    }
    R(c, rp[2], x, y + y0 + 2, 16, 1);
  } else {
    H1(c, rp[5], x, y + y0);
    H1(c, rp[3], x, y + y0 + 1);
    H1(c, rp[2], x, y + y0 + 2);
  }
  R(c, rp[0], x, y + y0 + 3, 16, 16 - y0 - 3);
}

/**
 * Paint one roof tile.
 *   mat  'thatch' | 'shingle' | 'pantile' | 'slate'
 *   row  'R' ridge, 'B' body, 'E' eave, 'S' single-row roof (ridge and eave)
 *   end  'L' west verge, 'M' run, 'R' east verge
 */
export function paintRoof(c, x, y, v, vi, mat, row, end) {
  const { rp } = roofSpec(mat);
  const rn = sr(v);
  const base = row === 'R' ? 4 : row === 'E' ? 2 : 3;
  const ridge = row === 'R' || row === 'S';
  const eave = row === 'E' || row === 'S';
  const y0 = ridge ? (mat === 'thatch' ? 7 : 5) : 0;
  const y1 = eave ? (row === 'S' ? 11 : 11) : 16;
  const salt = mat === 'slate' ? 211 : 223;
  if (mat === 'thatch') thatchPitch(c, x, y, rn, y0, y1, row === 'R' ? 4 : (row === 'E' ? 3 : 3), rp);
  else if (mat === 'pantile') pantileCourses(c, x, y, rn, vi, y0, y1, base, rp);
  else if (mat === 'slate') slateCourses(c, x, y, rn, vi, y0, y1, base, rp, salt);
  else shakeCourses(c, x, y, rn, vi, y0, y1, base, rp, salt);
  if (ridge) { if (mat === 'thatch') thatchRidge(c, x, y, rn, 0, rp); else hardRidge(c, x, y, mat, rp, 0); }
  if (eave) { if (mat === 'thatch') thatchEave(c, x, y, rn, y1, rp); else hardEave(c, x, y, mat, rp, y1); }
  if (end === 'L' || end === 'R') verge(c, x, y, mat, rp, row, end);
}

/** The gable verge: barge-board or thatch roll down the end of the run. */
function verge(c, x, y, mat, rp, row, end) {
  const L = end === 'L';
  const edge = L ? 0 : 15, inner = L ? 1 : 14, inner2 = L ? 2 : 13;
  const top = (row === 'R' || row === 'S') ? 0 : 0;
  if (mat === 'thatch') {
    // a rolled verge: lit on the west, in shade on the east
    for (let yy = top; yy < 16; yy++) {
      P(c, rp[0], x + edge, y + yy);
      P(c, L ? rp[5] : rp[1], x + inner, y + yy);
      P(c, L ? rp[4] : rp[2], x + inner2, y + yy);
    }
    // hipped: the ridge roll rounds off at the end instead of stopping square
    if (row === 'R' || row === 'S') {
      const cx = L ? 0 : 12;
      for (const [dx, dy] of [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [0, 2]]) cut(c, x, y, L ? dx : 15 - dx, dy);
      P(c, rp[0], x + (L ? 3 : 12), y); P(c, rp[0], x + (L ? 2 : 13), y + 1); P(c, rp[0], x + (L ? 1 : 14), y + 2);
      P(c, L ? rp[6] : rp[3], x + (L ? 2 : 13), y + 2); P(c, L ? rp[6] : rp[3], x + (L ? 3 : 12), y + 1);
      void cx;
    }
    if (row === 'E' || row === 'S') { cut(c, x, y, edge, 15); P(c, rp[0], x + inner, y + 15); }
    return;
  }
  // hard roofs: a timber barge-board, lit on the west end and shaded on the east
  const board = archPalette().oak;
  for (let yy = 0; yy < 16; yy++) {
    P(c, rp[0], x + edge, y + yy);
    P(c, L ? board[4] : board[1], x + inner, y + yy);
    P(c, L ? board[2] : board[0], x + inner2, y + yy);
  }
  if (row === 'R' || row === 'S') { P(c, board[5], x + inner, y + 1); P(c, board[3], x + inner2, y + 1); }
}

/** Paint the chimney stack (over plane, transparent round it). */
export function paintChimney(c, x, y, v) {
  const p = archPalette();
  const brick = (v % 3) === 2;
  const rp = brick ? p.brick : p.stone;
  // stack: rows 2-13, six wide, lit west face, shaded east
  R(c, p.ink, x + 5, y + 2, 7, 12);
  R(c, rp[3], x + 5, y + 3, 6, 10);
  R(c, rp[4], x + 5, y + 3, 2, 10);
  R(c, rp[2], x + 10, y + 3, 1, 10);
  for (let yy = 4; yy < 13; yy += 3) { R(c, rp[1], x + 5, y + yy, 6, 1); P(c, rp[1], x + (yy % 2 ? 7 : 8), y + yy + 1); }
  // the cap: a wider slab, then the flue's mouth
  R(c, p.ink, x + 4, y + 1, 9, 3);
  R(c, at(p.stone, 5), x + 4, y + 1, 8, 1);
  R(c, at(p.stone, 3), x + 4, y + 2, 8, 1);
  R(c, p.soot, x + 6, y + 1, 4, 1);
  // the flashing where it meets the roof, and soot down the lee side
  R(c, at(p.stone, 1), x + 5, y + 13, 6, 1);
  P(c, p.soot, x + 10, y + 4); P(c, p.soot, x + 10, y + 5);
}

/** Chimney smoke, on the over plane above the stack (animated, 4 frames). */
export function paintSmoke(c, x, y, v, f) {
  const p = archPalette();
  const k = f & 3;
  // three puffs rising and leaning east with the wind, each fading as it climbs
  const puffs = [[7, 12 - k, 3, 2, 0], [8 + (k >> 1), 7 - k, 4, 2, 1], [9 + k, 2 - k, 3, 2, 2]];
  for (const [px, py, w, h, s] of puffs) {
    if (py + h <= 0) continue;
    mark(c, p.smoke[s], x, y, px, py, w, h);
    mark(c, p.smoke[Math.min(2, s + 1)], x, y, px + 1, py - 1, w - 1, 1);
  }
}

/**
 * A dormer, on the eave row of a roof: a small window in its own little
 * gabled roof, breaking the eave line. On thatch it is an eyebrow — the straw
 * sweeps up over the window in one soft hump, no gable at all.
 */
export function paintDormer(c, x, y, v, vi, mat, lit) {
  paintRoof(c, x, y, v, vi, mat, 'E', 'M');
  const p = archPalette();
  const rp = p[mat] || p.thatch;
  const g = lit ? p.lit : p.glass;
  if (mat === 'thatch') {
    // the hump: the straw lifted over the window, its own lit crown and lip
    const hump = [[3, 5, 6], [4, 3, 10], [5, 2, 12], [6, 2, 12], [7, 1, 14], [8, 1, 14], [9, 1, 14], [10, 1, 14]];
    for (const [yy, x0, w] of hump) R(c, rp[4], x + x0, y + yy, w, 1);
    R(c, rp[0], x + 5, y + 2, 6, 1); P(c, rp[0], x + 4, y + 3); P(c, rp[0], x + 11, y + 3); P(c, rp[0], x + 2, y + 4); P(c, rp[0], x + 13, y + 4);
    R(c, rp[6], x + 5, y + 3, 6, 1); R(c, rp[5], x + 3, y + 4, 10, 1);
    for (let i = 2; i < 14; i += 2) P(c, rp[3], x + i, y + 6 + (i & 2 ? 1 : 0));
    // the window peeping out under it
    R(c, p.oak[0], x + 4, y + 9, 8, 5);
    R(c, g.pane, x + 5, y + 10, 6, 3); P(c, g.sky, x + 5, y + 10); P(c, g.glint, x + 5, y + 10);
    R(c, g.lead, x + 8, y + 10, 1, 3);
    R(c, rp[5], x + 2, y + 14, 12, 1); R(c, rp[1], x + 3, y + 15, 10, 1);
    return;
  }
  // cheeks and face, sat on the eave
  R(c, p.inkC, x + 3, y + 5, 10, 11);
  R(c, at(p.plaster, 3), x + 4, y + 6, 8, 9);
  R(c, at(p.plaster, 2), x + 11, y + 6, 1, 9);
  R(c, p.oak[1], x + 5, y + 8, 6, 6);
  R(c, g.pane, x + 6, y + 9, 4, 4); P(c, g.sky, x + 6, y + 9); P(c, g.glint, x + 6, y + 9);
  R(c, g.lead, x + 8, y + 9, 1, 4);
  R(c, p.oak[3], x + 5, y + 14, 6, 1);
  // its little roof: a gable over the face, west slope lit, east in shade
  for (let i = 0; i < 6; i++) {
    const l = 7 - i, r0 = 8 + i;
    P(c, p.inkC, x + l - 1, y + i); P(c, p.inkC, x + r0 + 1, y + i);
    R(c, rp[5], x + l, y + i, 8 - l, 1); R(c, rp[2], x + 8, y + i, r0 - 7, 1);
  }
  R(c, rp[0], x + 1, y + 6, 14, 1);
  R(c, rp[5], x + 7, y, 1, 1);
}
function H1c(c, col, xx, yy, w) { R(c, col, xx, yy, w, 1); }

// ---------------------------------------------------------------------------
// 3. WALLS
// ---------------------------------------------------------------------------
//
// Three framed-and-plastered walls so a street can be three kinds of house:
//   WATTLE_WALL   'wattle'  big cream panels, a rail at every storey, a post
//                           where the shared border says so and a brace now and
//                           then — the frontier cottage;
//   TIMBER_WALL   'timber'  close studding: a stud every 4px (a period that
//                           divides 16, so it has no tile rhythm) in ochre
//                           panels — the prosperous townhouse;
//   PLASTER_WALL  'lime'    lime render over rubble, no timber showing but the
//                           corner posts — the poor house, the lean-to, the mill.
// Stone, brick and log keep tiles.js's coursed painters (tuned against the
// paving by the earlier audit) and gain their corners and openings here.
//
// POSTS AND RAILS. The rail sits on rows 7-8, in the MIDDLE of the tile, so a
// stack of storeys has one rail per storey and the tile border falls through a
// panel. A stud in the upper half takes its column from the TOP border bit and
// one in the lower half from the BOTTOM bit, so the two halves of a stud across
// a horizontal seam are the same stud (tiles.js 4.8 explains the bits).

/** WATTLE_WALL: framed cream panels. vi = edge bits | extra << 4. */
export function paintWattle(c, x, y, v, vi) {
  const p = archPalette(), pl = p.plaster, ok = p.oak;
  const rn = sr(v);
  R(c, pl[3], x, y, 16, 16);
  // the lime is never one flat colour: damp lower down, sun-bleached in places
  for (let i = 0; i < 3; i++) {
    const w = 3 + Math.floor(rn() * 4), h = 2 + Math.floor(rn() * 3);
    mark(c, rn() < 0.5 ? pl[2] : pl[4], x, y, 1 + Math.floor(rn() * (14 - w)), 1 + Math.floor(rn() * (14 - h)), w, h);
  }
  speck(c, pl[2], x, y, 9, rn); speck(c, pl[4], x, y, 6, rn); speck(c, pl[1], x, y, 3, rn);
  const extra = vi >> 4;
  // a patch where the render has fallen and the wattle shows through
  if (extra === 2 && rn() < 0.5) {
    const wx = 2 + Math.floor(rn() * 9), wy = rn() < 0.5 ? 1 : 10;
    R(c, pl[1], x + wx, y + wy, 4, 4);
    R(c, at(p.wood, 2), x + wx + 1, y + wy + 1, 2, 2);
    P(c, at(p.wood, 1), x + wx + 1, y + wy + 2); P(c, at(p.wood, 3), x + wx + 2, y + wy + 1);
  }
  // studs in the two half-storeys, placed by the shared horizontal borders
  const stud = (px, y0, h) => { mark(c, ok[3], x, y, px, y0, 1, h); mark(c, ok[1], x, y, px + 1, y0, 1, h); mark(c, pl[2], x, y, px + 2, y0, 1, h); };
  const pT = ((vi >> 2) & 1) ? 10 : 4, pB = ((vi >> 3) & 1) ? 10 : 4;
  stud(pT, 0, 7); stud(pB, 9, 7);
  // a principal post on the left border when the shared bit says so
  if (vi & 1) { R(c, ok[3], x, y, 1, 16); R(c, ok[1], x + 1, y, 1, 16); mark(c, pl[2], x, y, 2, 0, 1, 16); }
  // the rail: lit top, dark foot, and the shadow it throws on the panel below
  R(c, ok[2], x, y + 7, 16, 2); H1(c, ok[4], x, y + 7); H1(c, pl[2], x, y + 9);
  // a brace now and then, springing off a stud toward the rail
  if (extra === 3 && rn() < 0.7) {
    const dir = (extra & 2) ? 1 : -1;
    const sx = pB + (dir > 0 ? 2 : -1);
    for (let i = 0; i < 5; i++) { mark(c, ok[1], x, y, sx + dir * i, 14 - i, 2, 1); mark(c, ok[3], x, y, sx + dir * i, 13 - i, 1, 1); }
  }
}

/**
 * TIMBER_WALL: the townhouse — black-and-white framing on an 8px module (a
 * period that divides 16, so it has no tile rhythm of its own): posts every
 * eight pixels, the storey rail mid-tile, and in the panels under the rail the
 * decorative bracing a merchant pays for, a saltire or a pair of braces, chosen
 * per panel by the shared border bits so a run of them never repeats in step.
 */
export function paintTimber(c, x, y, v, vi) {
  const p = archPalette(), pl = p.lime, bk = p.woodDark;
  const rn = sr(v);
  R(c, pl[3], x, y, 16, 16);
  speck(c, pl[2], x, y, 8, rn); speck(c, pl[4], x, y, 5, rn);
  const post = (px) => { mark(c, bk[2], x, y, px, 0, 1, 16); mark(c, bk[0], x, y, px + 1, 0, 1, 16); mark(c, pl[1], x, y, px + 2, 0, 1, 16); };
  post(0); post(8);
  R(c, bk[1], x, y + 7, 16, 2); H1(c, bk[3], x, y + 7); H1(c, pl[1], x, y + 9);
  // A storey's panels run from this tile's rail (row 9) to the next tile's
  // (row 7 below = row 23 here), so each half draws the SAME diagonals over the
  // whole panel, clipped to itself, and the two halves meet as one brace. Which
  // brace a panel carries is the shared border bit's call, so both halves agree.
  const panel = (px, kind, top, bottom) => {
    const h = bottom - top;
    for (let i = 0; i < 6; i++) {
      const t0 = Math.round(i * (h - 2) / 5);
      if (kind & 1) mark(c, bk[1], x, y, px + i, top + t0, 1, 2);
      if (kind & 2) mark(c, bk[1], x, y, px + i, bottom - 2 - t0, 1, 2);
    }
  };
  const kT = (vi >> 2) & 1, kB = (vi >> 3) & 1;
  panel(2, kB ? 1 : 2, 9, 23); panel(10, kB ? 2 : 1, 9, 23);
  panel(2, kT ? 1 : 2, -7, 7); panel(10, kT ? 2 : 1, -7, 7);
}

/** PLASTER_WALL: lime render over rubble. */
export function paintLime(c, x, y, v, vi) {
  const p = archPalette(), pl = p.lime;
  const rn = sr(v);
  R(c, pl[3], x, y, 16, 16);
  for (let i = 0; i < 4; i++) {
    const w = 2 + Math.floor(rn() * 5), h = 2 + Math.floor(rn() * 3);
    mark(c, rn() < 0.6 ? pl[2] : pl[4], x, y, Math.floor(rn() * (16 - w)), Math.floor(rn() * (16 - h)), w, h);
  }
  speck(c, pl[2], x, y, 12, rn); speck(c, pl[4], x, y, 8, rn); speck(c, pl[1], x, y, 3, rn);
  // a crack, and now and then a patch of rubble where the render has blown
  if (rn() < 0.4) { const cx = 2 + Math.floor(rn() * 11), cy = 2 + Math.floor(rn() * 9); for (let i = 0; i < 4; i++) P(c, pl[1], x + cx + (i >> 1), y + cy + i); }
  if (((vi >> 4) & 3) === 1) {
    const s = p.stone, bx = 2 + Math.floor(rn() * 9), by = 2 + Math.floor(rn() * 8);
    R(c, pl[1], x + bx, y + by, 5, 4);
    R(c, s[3], x + bx + 1, y + by + 1, 2, 2); R(c, s[4], x + bx + 3, y + by + 1, 1, 2); P(c, s[5], x + bx + 1, y + by + 1);
  }
}

/**
 * The end of a facade: its corner. The wall steps in a pixel from the corner
 * of the roof above it, so the eave overhangs at the gable as well as along
 * the front; timber walls get a corner post (and the cottage its brace),
 * masonry its dressed quoins, and a log wall the crossed ends of its logs.
 */
export function paintWallEnd(c, x, y, v, vi, mat, end) {
  const p = archPalette();
  const L = end === 'L';
  const col = (i) => (L ? i : 15 - i);
  if (mat === 'log') {
    // the crossed log ends: a round of pale end grain per course, bark round
    // it, the heart ring in the middle, lit on its upper left
    const eg = p.endGrain, bark = p.woodDark;
    for (let k = -1; k < 4; k++) {
      const top = k * 4 + 2;
      for (let r0 = 0; r0 < 4; r0++) {
        const yy = top + r0;
        if (yy < 0 || yy > 15) continue;
        const rim = r0 === 0 || r0 === 3;
        for (let i = 0; i < 4; i++) {
          if (rim && (i === 0 || i === 3)) { P(c, bark[1], x + col(i), y + yy); continue; }
          const edge = rim || i === 0 || i === 3;
          const lit = r0 <= 1 && i <= 1;
          P(c, edge ? (lit ? eg[3] : bark[2]) : (lit ? eg[4] : eg[2]), x + col(i), y + yy);
        }
        if (r0 === 1 || r0 === 2) P(c, eg[1], x + col(2), y + yy);
      }
    }
    return;
  }
  cut(c, x, y, col(0), 0, 1, 16);
  if (mat === 'stone' || mat === 'brick') {
    const s = p.stone;
    // quoins: long and short dressed blocks, laid to the wall's own 4px courses
    // (offset half a course, so the straddling block is short in both tiles)
    for (let k = -1; k < 4; k++) {
      const top = k * 4 + 2, wide = (k & 1) ? 3 : 5;
      for (let yy = Math.max(0, top); yy < Math.min(16, top + 4); yy++) {
        for (let i = 1; i <= wide; i++) P(c, s[4], x + col(i), y + yy);
        P(c, L ? s[5] : s[3], x + col(1), y + yy);
        P(c, s[1], x + col(wide + 1), y + yy);
      }
      if (top >= 0) for (let i = 1; i <= wide; i++) P(c, s[6], x + col(i), y + top);
      if (top + 3 < 16 && top + 3 >= 0) for (let i = 1; i <= wide + 1; i++) P(c, s[2], x + col(i), y + top + 3);
    }
    return;
  }
  const ok = p.oak;
  // the corner post: lit on the west end of the house, in shade on the east
  for (let yy = 0; yy < 16; yy++) {
    P(c, L ? ok[4] : ok[2], x + col(1), y + yy);
    P(c, ok[2], x + col(2), y + yy);
    P(c, L ? ok[1] : ok[0], x + col(3), y + yy);
  }
  if (mat === 'wattle') {
    // the corner brace, down from the post toward the rail
    for (let i = 0; i < 5; i++) { P(c, ok[1], x + col(4 + i), y + 2 + i); P(c, ok[3], x + col(4 + i), y + 1 + i); }
  }
}

// ---------------------------------------------------------------------------
// 4. OPENINGS — windows, shutters, doors, door heads
// ---------------------------------------------------------------------------
//
// A window used to paint lime plaster round itself, so every window in a stone
// or brick house sat in a pale square patch. Each member now paints its own
// wall first (its def in tiles.js calls that wall's painter with the same edge
// bits, so the coursing runs straight through) and then only the opening.
//
// Geometry, shared by every window: frame x 4..12, head row 2, sill rows 12-13;
// glass x 5..11 by rows 3..11, one mullion (x 8) and a transom (row 6). Open
// shutters, when a house has them, hang at x 1..3 and 13..15.

/** The panes. `lit` glass is lamplight from inside; otherwise sky and dark. */
function glazing(c, x, y, lit, f, deep) {
  const p = archPalette(), g = lit ? p.lit : p.glass;
  R(c, g.pane, x + 5, y + 3, 7, 9);
  if (lit) {
    // warm light pooled low in the room, brightest where the lamp is
    R(c, g.deep, x + 5, y + 9, 7, 3);
    R(c, g.sky, x + 6, y + 7, 5, 3);
    if (f === 1) R(c, g.glint, x + 7, y + 8, 3, 1);
    P(c, g.glint, x + 9, y + 8);
  } else {
    // a diagonal of sky reflected in each light, darker toward the foot
    R(c, g.deep, x + 5, y + 9, 7, 3);
    for (const lx of [5, 9]) { R(c, g.sky, x + lx, y + 3, 2, 1); P(c, g.sky, x + lx, y + 4); P(c, g.glint, x + lx, y + 3); }
    P(c, g.sky, x + 6, y + 7); P(c, g.sky, x + 10, y + 7);
  }
  // the reveal: the wall's own thickness shades the top and west of the glass
  if (deep) { const d = lit ? g.deep : p.glass.deep; R(c, d, x + 5, y + 3, 7, 1); R(c, d, x + 5, y + 3, 1, 9); }
  // lead: the mullion and the transom
  R(c, g.lead, x + 8, y + 3, 1, 9); R(c, g.lead, x + 5, y + 6, 7, 1);
}

export function paintWindow(c, x, y, v, vi, mat, lit, f) {
  const p = archPalette();
  const rn = sr(v);
  const extra = vi >> 4;
  const masonry = mat === 'stone' || mat === 'brick';
  if (masonry) {
    const s = p.stone;
    // dressed surround: lintel, jambs, a projecting sill
    R(c, s[1], x + 4, y + 2, 9, 11);
    R(c, s[4], x + 4, y + 2, 9, 1); R(c, s[5], x + 4, y + 2, 1, 10);
    R(c, s[2], x + 12, y + 3, 1, 9);
    if (mat === 'brick') {
      // a soldier-course arch over the opening
      const b = p.brick;
      for (let i = 3; i < 14; i++) { P(c, i & 1 ? b[4] : b[3], x + i, y + 1); P(c, i & 1 ? b[3] : b[2], x + i, y + 2); }
    }
    glazing(c, x, y, lit, f, true);
    R(c, s[5], x + 3, y + 12, 11, 1); R(c, s[3], x + 3, y + 13, 11, 1); R(c, s[1], x + 4, y + 14, 10, 1);
  } else {
    const ok = mat === 'log' ? p.woodDark : p.oak;
    R(c, ok[1], x + 4, y + 2, 9, 11);
    R(c, ok[3], x + 4, y + 2, 9, 1); R(c, ok[3], x + 4, y + 2, 1, 10);
    glazing(c, x, y, lit, f, false);
    // sill: lit top, dark nose, and the shadow it throws on the wall
    R(c, ok[4], x + 3, y + 12, 11, 1); R(c, ok[1], x + 3, y + 13, 11, 1);
    R(c, 'rgba(20,12,6,0.25)', x + 4, y + 14, 10, 1);
    // open shutters on a cottage window
    if (mat !== 'log' && (extra & 1)) {
      const sh = p.shutter;
      for (const sx of [1, 13]) {
        R(c, sh[2], x + sx, y + 3, 3, 9);
        R(c, sh[3], x + sx, y + 3, 1, 9); R(c, sh[1], x + sx + 2, y + 3, 1, 9);
        H1c(c, sh[3], x + sx, y + 3, 3); H1c(c, sh[0], x + sx, y + 11, 3);
        H1c(c, sh[1], x + sx, y + 7, 3);
      }
    }
  }
  // a window box, now and then
  if ((extra & 2) && rn() < 0.75) {
    const w = p.wood;
    R(c, w[1], x + 4, y + 13, 9, 2); H1c(c, w[3], x + 4, y + 13, 9);
    const fl = ['#c8506a', '#e8c050', '#d8d0e8', '#e07a4a'][Math.floor(rn() * 4)];
    for (let i = 4; i < 13; i++) { if (hash(i, v, 3) % 3) P(c, '#4f7a3e', x + i, y + 12); }
    for (let i = 0; i < 3; i++) { const fx = 5 + i * 3 + Math.floor(rn() * 2); P(c, fl, x + fx, y + 11 + (i & 1)); P(c, '#6a9a4a', x + fx, y + 12); }
  }
}

/** Closed shutters: two planked leaves, a ledge on each, over a dark opening. */
export function paintShutters(c, x, y, v, vi, mat) {
  const p = archPalette();
  const masonry = mat === 'stone' || mat === 'brick';
  const sh = masonry ? p.woodDark : p.shutter;
  const fr0 = masonry ? p.stone : p.oak;
  R(c, fr0[1], x + 4, y + 2, 9, 11);
  R(c, fr0[masonry ? 4 : 3], x + 4, y + 2, 9, 1);
  for (const sx of [5, 9]) {
    R(c, sh[2], x + sx, y + 3, 3, 9);
    H1c(c, sh[3], x + sx, y + 3, 3);
    mark(c, sh[1], x, y, sx + 1, 3, 1, 9);
    H1c(c, sh[1], x + sx, y + 6, 3); H1c(c, sh[1], x + sx, y + 10, 3);
    H1c(c, sh[3], x + sx, y + 5, 3); H1c(c, sh[3], x + sx, y + 9, 3);
  }
  R(c, fr0[1], x + 8, y + 3, 1, 9);
  R(c, fr0[masonry ? 5 : 4], x + 3, y + 12, 11, 1); R(c, fr0[1], x + 3, y + 13, 11, 1);
}

/**
 * A door, in the footing row. The leaf is ten pixels wide between two posts,
 * planked and hung on two iron straps; its top rows lie in the shadow of the
 * head above, which is why the head tile (paintDoorHead) can carry the doorway
 * up into the wall without knowing what colour this door was painted.
 *   state  'closed' | 'open' | 'iron';  frame  'timber' | 'stone'
 */
export function paintDoor(c, x, y, v, vi, state, frame) {
  const p = archPalette();
  const stone = p.stone, ok = frame === 'stone' ? p.stone : p.oak;
  const rn = sr(v);
  // the footing either side of the doorway
  R(c, stone[3], x, y, 16, 16);
  for (const sx of [0, 14]) { R(c, stone[4], x + sx, y + 1, 2, 6); R(c, stone[2], x + sx, y + 8, 2, 7); H1c(c, stone[5], x + sx, y + 1, 2); H1c(c, stone[1], x + sx, y + 7, 2); }
  R(c, stone[0], x, y + 15, 16, 1);
  // the jambs
  R(c, ok[frame === 'stone' ? 4 : 2], x + 2, y, 1, 16); R(c, ok[frame === 'stone' ? 2 : 1], x + 13, y, 1, 16);
  if (frame === 'stone') { P(c, ok[5], x + 2, y + 4); P(c, ok[5], x + 2, y + 10); }
  const d = p.doorPaint[(v >>> 5) % p.doorPaint.length];
  if (state === 'open') {
    // the room beyond, and the leaf swung back against the jamb
    R(c, '#171210', x + 3, y, 10, 15);
    R(c, '#2a1d14', x + 5, y + 10, 8, 5);
    R(c, '#3a2818', x + 6, y + 13, 7, 2);
    R(c, d[2], x + 3, y, 2, 15); P(c, d[3], x + 3, y + 3); R(c, d[0], x + 5, y, 1, 15);
  } else if (state === 'iron') {
    const ir = p.iron;
    R(c, ir[2], x + 3, y, 10, 15);
    R(c, ir[1], x + 3, y, 10, 3);
    for (const yy of [4, 11]) { H1c(c, ir[1], x + 3, y + yy, 10); H1c(c, ir[3], x + 3, y + yy - 1, 10); }
    for (let i = 0; i < 4; i++) { P(c, ir[4], x + 4 + i * 3, y + 6); P(c, ir[4], x + 4 + i * 3, y + 13); }
    R(c, p.ink, x + 9, y + 8, 3, 2); P(c, ir[4], x + 9, y + 8);
  } else {
    R(c, d[2], x + 3, y, 10, 15);
    // planks: quiet joints, the leaf's lit hanging edge, weathering at the foot
    for (const jx of [6, 9]) mark(c, d[1], x, y, jx, 0, 1, 15);
    mark(c, d[3], x, y, 3, 3, 1, 10);
    if (rn() < 0.6) mark(c, d[3], x, y, 7, 4 + Math.floor(rn() * 4), 1, 3);
    R(c, d[1], x + 3, y + 13, 10, 2);
    // the recess: the head shades the top of the leaf
    R(c, d[0], x + 3, y, 10, 2); R(c, d[1], x + 3, y + 2, 10, 1);
    // strap hinges from the hanging (west) side, ending in a round, and the ring
    const ir = p.iron;
    for (const yy of [4, 11]) { R(c, ir[1], x + 3, y + yy, 5, 1); P(c, ir[2], x + 8, y + yy); P(c, ir[3], x + 4, y + yy); P(c, ir[3], x + 6, y + yy); }
    const ring = (v >> 3) & 1 ? p.gold : ir;
    P(c, ring[3], x + 10, y + 7); P(c, ring[2], x + 10, y + 9); P(c, ring[3], x + 11, y + 8); P(c, ring[1], x + 9, y + 8);
  }
  // the threshold stone
  R(c, stone[5], x + 2, y + 15, 12, 1);
}

/**
 * The wall tile above a door: the top of the doorway (the leaf in the shadow of
 * its head), then a timber lintel, or a stone or brick arch, and on some houses
 * a pentice hood on two brackets. The wall itself was painted first.
 */
export function paintDoorHead(c, x, y, v, vi, mat) {
  const p = archPalette();
  const extra = vi >> 4;
  const masonry = mat === 'stone' || mat === 'brick';
  const ok = masonry ? p.stone : p.oak;
  // the opening, in shade
  R(c, '#20160f', x + 3, y + 9, 10, 7);
  for (const jx of [5, 8, 11]) mark(c, '#150e09', x, y, jx, 10, 1, 6);
  R(c, '#2a1c12', x + 3, y + 14, 10, 2);
  R(c, ok[masonry ? 4 : 2], x + 2, y + 8, 1, 8); R(c, ok[masonry ? 2 : 1], x + 13, y + 8, 1, 8);
  if (masonry) {
    const s = p.stone;
    // a segmental arch of voussoirs with a lighter keystone
    const arch = [[2, 8], [3, 7], [4, 6], [5, 6], [6, 5], [7, 5], [8, 5], [9, 5], [10, 6], [11, 6], [12, 7], [13, 8]];
    for (const [ax, ay] of arch) for (let yy = ay + 1; yy < 10; yy++) P(c, '#20160f', x + ax, y + yy);
    for (const [ax, ay] of arch) { R(c, s[4], x + ax, y + ay - 2, 1, 3); P(c, s[5], x + ax, y + ay - 2); P(c, s[1], x + ax, y + ay + 1); }
    R(c, s[6], x + 7, y + 2, 2, 3); P(c, s[3], x + 8, y + 4);
    if (mat === 'brick') for (const [ax, ay] of arch) if (ax & 1) P(c, at(p.brick, 3), x + ax, y + ay - 1);
    // a fanlight in the arch of a good house
    if (extra & 1) { R(c, p.glass.pane, x + 5, y + 7, 6, 2); P(c, p.glass.sky, x + 5, y + 7); P(c, p.glass.lead, x + 8, y + 7); P(c, p.glass.lead, x + 8, y + 8); }
  } else {
    // the lintel beam, lit along its top, with the pegs that hold it
    R(c, ok[2], x + 1, y + 7, 14, 2); H1c(c, ok[4], x + 1, y + 7, 14); H1c(c, ok[0], x + 1, y + 9, 14);
    P(c, ok[5], x + 3, y + 8); P(c, ok[5], x + 12, y + 8);
    if (extra & 1) {
      // a pentice hood: a little shingled roof on two brackets
      const sh = p.shingle;
      R(c, p.ink, x, y + 2, 16, 1);
      R(c, sh[4], x, y + 3, 16, 1); R(c, sh[3], x, y + 4, 16, 1); R(c, sh[2], x, y + 5, 16, 1);
      for (let i = 1; i < 16; i += 3) P(c, sh[1], x + i, y + 4);
      R(c, sh[0], x, y + 6, 16, 1);
      for (const bx of [1, 13]) { P(c, ok[3], x + bx, y + 7); P(c, ok[1], x + bx + 1, y + 7); }
    }
  }
}

// ---------------------------------------------------------------------------
// 5. INTERIORS — the back wall's face, the tops of the other walls, doorways
// ---------------------------------------------------------------------------
//
// Every room in the game was walled on all four sides with the EXTERIOR wall
// tile, so the Stonehill taproom was ringed in K-braced half-timbering seen
// face on from every direction at once. Seen from the south and above, a room
// shows the FACE of its north wall (and of any partition with floor in front
// of it) and only the TOPS of the rest: dark bands with a lit arris where they
// drop to the floor. `resolveArch` makes that call per tile — face if the tile
// south of it is not wall, top otherwise — so every interior already built,
// and every one built later, gets it without a line changed.
//
// A face is 16px tall and reads top down as: ceiling beam or cornice (rows
// 0-1), the wall (2-10), a dado rail (10), wainscot or plinth (11-13), skirting
// (14) and the dark line where wall meets floor (15). One tile in four carries
// something hung on it — a shelf of crockery, drying herbs, a picture; in stone
// a banner, a shield, an iron sconce — chosen by the variant hash.

const WARM_TOP = ['#261b15', '#41312a', '#4b3a2e', '#7a604a'];
const COOL_TOP = ['#1f1e24', '#393840', '#43424b', '#6c6b77'];

function faceBody(c, x, y, v, vi, mat, rn) {
  const p = archPalette();
  if (mat === 'stone' || mat === 'brick') {
    const s = mat === 'brick' ? p.brick : p.stone;
    R(c, s[3], x, y + 2, 16, 11);
    // courses of 4 rows on the face (2..5, 6..9, 10..12), joints settled by the shared left bit
    for (let k = 0; k < 3; k++) {
      const top = 2 + k * 4, h = k === 2 ? 3 : 4;
      const cr = sr((0x51A7 ^ Math.imul(k + 1, 0x2545F491) ^ Math.imul((vi >> 1) + 1, 0x9E3779B1)) >>> 0);
      // each block: its own tone, a lit top arris, a dark bed; joints settled by the shared bit
      const js = joints(cr, 5, mat === 'brick' ? 7 : 9, (vi & 1) && !(k & 1));
      let prev = 0;
      for (const j of js.concat([16])) {
        if (j > prev) { const u = cr(); mark(c, u < 0.25 ? s[4] : u < 0.45 ? s[2] : s[3], x, y, prev, top, j - prev, h); }
        prev = j;
      }
      H1(c, mat === 'brick' ? p.mortar[2] : s[5], x, y + top);
      H1(c, mat === 'brick' ? p.mortar[0] : s[1], x, y + top + h - 1);
      for (const j of js) mark(c, mat === 'brick' ? p.mortar[1] : s[1], x, y, j, top, 1, h);
    }
    return;
  }
  if (mat === 'log') {
    const lg = p.log;
    for (let k = 0; k < 3; k++) {
      const top = 2 + k * 4;
      R(c, lg[3], x, y + top, 16, 4); H1(c, lg[5], x, y + top); H1(c, lg[4], x, y + top + 1); H1(c, lg[1], x, y + top + 3);
      for (let i = 0; i < 3; i++) P(c, lg[2], x + Math.floor(rn() * 16), y + top + 1 + Math.floor(rn() * 2));
    }
    return;
  }
  const pl = mat === 'timber' ? p.ochre : mat === 'lime' ? p.lime : p.plaster;
  R(c, pl[3], x, y + 2, 16, 9);
  for (let i = 0; i < 2; i++) { const w = 3 + Math.floor(rn() * 5); mark(c, rn() < 0.5 ? pl[2] : pl[4], x, y, 1 + Math.floor(rn() * (14 - w)), 3 + Math.floor(rn() * 5), w, 2 + Math.floor(rn() * 2)); }
  speck(c, pl[2], x, y, 6, rn, 0, 2, 16, 9); speck(c, pl[4], x, y, 4, rn, 0, 2, 16, 9);
  const ok = p.oak;
  if (mat === 'timber') for (let s = 1; s < 16; s += 4) { mark(c, ok[3], x, y, s, 2, 1, 9); mark(c, ok[1], x, y, s + 1, 2, 1, 9); }
  else if (mat === 'wattle' && (vi & 1)) { mark(c, ok[3], x, y, 0, 2, 1, 9); mark(c, ok[1], x, y, 1, 2, 1, 9); mark(c, pl[2], x, y, 2, 2, 1, 9); }
}

function faceTrim(c, x, y, mat) {
  const p = archPalette();
  if (mat === 'stone' || mat === 'brick') {
    const s = p.stone;
    // cornice above, plinth below
    R(c, s[2], x, y, 16, 1); R(c, s[5], x, y + 1, 16, 1);
    R(c, s[2], x, y + 13, 16, 1); R(c, s[4], x, y + 13, 16, 0);
    R(c, s[1], x, y + 14, 16, 1);
    R(c, '#141217', x, y + 15, 16, 1);
    return;
  }
  const ok = p.oak, w = p.wood;
  // the ceiling beam, and the shade it throws on the wall below it
  R(c, ok[0], x, y, 16, 1); R(c, ok[2], x, y + 1, 16, 1);
  // dado rail, wainscot boards, skirting
  R(c, ok[3], x, y + 10, 16, 1);
  R(c, w[2], x, y + 11, 16, 3); H1(c, w[3], x, y + 11);
  for (let i = 3; i < 16; i += 4) mark(c, w[1], x, y, i, 11, 1, 3);
  R(c, w[1], x, y + 14, 16, 1);
  R(c, '#160f0a', x, y + 15, 16, 1);
}

function faceDecor(c, x, y, v, vi, mat, rn) {
  const extra = vi >> 4;
  if (extra < 6) return;
  const p = archPalette();
  const warm = !(mat === 'stone' || mat === 'brick');
  const kind = extra === 6 ? (v & 1) : 2;
  if (warm) {
    if (kind === 0) {
      // a shelf of crockery on two brackets
      const ok = p.oak;
      R(c, ok[3], x + 2, y + 7, 12, 1); R(c, ok[1], x + 2, y + 8, 12, 1);
      P(c, ok[1], x + 4, y + 9); P(c, ok[1], x + 11, y + 9);
      const pots = [['#b86a3e', '#d88a5a'], ['#6f8a9a', '#a8c0c8'], ['#c8b890', '#e8dcb8'], ['#7a5a3a', '#9a7a52']];
      let px = 3;
      for (let i = 0; i < 3; i++) {
        const [a, b] = pots[Math.floor(rn() * pots.length)];
        const h = 2 + Math.floor(rn() * 2);
        R(c, a, x + px, y + 7 - h, 2 + (i & 1), h); P(c, b, x + px, y + 7 - h);
        px += 3 + Math.floor(rn() * 2);
      }
    } else if (kind === 1) {
      // herbs hung to dry from the beam
      for (const hx of [4, 10]) {
        P(c, '#6a5030', x + hx, y + 2); P(c, '#6a5030', x + hx, y + 3);
        const g = ['#5a7a3a', '#7a8a4a', '#8a6a8a'][Math.floor(rn() * 3)];
        R(c, g, x + hx - 1, y + 4, 3, 3); P(c, '#9ab06a', x + hx - 1, y + 4); R(c, g, x + hx, y + 7, 1, 1);
      }
    } else {
      // a small painted board in a frame
      R(c, p.oak[0], x + 4, y + 3, 8, 6);
      R(c, '#4a6a5a', x + 5, y + 4, 6, 4);
      R(c, '#7a9a6a', x + 5, y + 6, 6, 2); P(c, '#e8d8a0', x + 9, y + 4); P(c, p.oak[3], x + 4, y + 3);
    }
    return;
  }
  if (kind === 0) {
    // a banner on a pole
    const cloth = (v & 2) ? RAMPS.red : RAMPS.woad;
    R(c, p.iron[1], x + 3, y + 1, 10, 1);
    R(c, cloth[2], x + 4, y + 2, 8, 8); R(c, cloth[3], x + 4, y + 2, 1, 8); R(c, cloth[1], x + 11, y + 2, 1, 8);
    for (let i = 0; i < 4; i++) { P(c, cloth[2], x + 4 + i, y + 10 + (i >> 1)); P(c, cloth[2], x + 11 - i, y + 10 + (i >> 1)); }
    R(c, RAMPS.gold[2], x + 7, y + 4, 2, 3); P(c, RAMPS.gold[4], x + 7, y + 4); P(c, RAMPS.gold[1], x + 6, y + 5); P(c, RAMPS.gold[1], x + 9, y + 5);
  } else if (kind === 1) {
    // a heater shield
    const f = (v & 2) ? RAMPS.woad : RAMPS.green;
    const rows = [[0, 9], [0, 9], [0, 9], [0, 9], [1, 7], [2, 5], [3, 3]];
    rows.forEach(([ox, w], i) => R(c, f[2], x + 4 + ox, y + 3 + i, w, 1));
    R(c, f[3], x + 4, y + 3, 9, 1); R(c, f[3], x + 4, y + 3, 1, 4);
    for (let i = 0; i < 4; i++) P(c, RAMPS.gold[3], x + 5 + i, y + 5 + i), P(c, RAMPS.gold[3], x + 11 - i, y + 5 + i);
    P(c, f[0], x + 8, y + 9);
  } else {
    // an iron sconce with a candle
    const ir = p.iron;
    R(c, ir[1], x + 7, y + 6, 2, 3); R(c, ir[2], x + 6, y + 8, 4, 1); P(c, ir[3], x + 7, y + 6);
    R(c, '#e8e0c4', x + 7, y + 4, 2, 2); P(c, '#fff4d8', x + 7, y + 4);
    P(c, '#ffb04a', x + 7, y + 3); P(c, '#ffe07a', x + 8, y + 2);
  }
}

/** A back-wall face. mat: wattle | timber | lime | stone | brick | log. */
export function paintIWall(c, x, y, v, vi, mat) {
  const rn = sr(v);
  faceBody(c, x, y, v, vi, mat, rn);
  faceTrim(c, x, y, mat);
  faceDecor(c, x, y, v, vi, mat, rn);
}

/** A back-wall face with a window: daylight, a deep reveal, a sill. */
export function paintIWindow(c, x, y, v, vi, mat) {
  paintIWall(c, x, y, v, vi & 15, mat);
  const p = archPalette();
  const warm = !(mat === 'stone' || mat === 'brick');
  const fr0 = warm ? p.oak : p.stone;
  R(c, fr0[1], x + 4, y + 2, 9, 9);
  R(c, '#b8d0d8', x + 5, y + 3, 7, 7);
  R(c, '#d8e8e8', x + 5, y + 3, 3, 3); P(c, '#f4fbfb', x + 5, y + 3);
  R(c, '#8aa8b8', x + 9, y + 7, 3, 3);
  R(c, fr0[0], x + 8, y + 3, 1, 7); R(c, fr0[0], x + 5, y + 6, 7, 1);
  R(c, fr0[warm ? 3 : 5], x + 3, y + 10, 11, 1);
}

/** The top of a wall seen from above. open: 1 north, 2 east, 4 west. */
export function paintITop(c, x, y, v, open, warm) {
  const t = warm ? WARM_TOP : COOL_TOP;
  const rn = sr(v);
  R(c, t[1], x, y, 16, 16);
  // grain or block joints, very quiet: this is the part of the room you are not looking at
  for (let i = 0; i < 5; i++) mark(c, t[warm ? 2 : 0], x, y, 1 + Math.floor(rn() * 11), 1 + Math.floor(rn() * 14), 2 + Math.floor(rn() * 3), 1);
  // the arris where the top drops away to the floor catches the light;
  // an east-facing drop is the shaded side, so it gets a dark lip inside the arris
  if (open & 1) { H1(c, t[3], x, y); H1(c, t[2], x, y + 1); }
  if (open & 4) { R(c, t[3], x, y, 1, 16); R(c, t[2], x + 1, y, 1, 16); }
  if (open & 2) { R(c, t[0], x + 15, y, 1, 16); R(c, t[2], x + 14, y, 1, 16); }
}

/** A door in a back-wall face. */
export function paintIDoor(c, x, y, v, vi, mat) {
  paintIWall(c, x, y, v, vi & 15, mat);
  const p = archPalette();
  const d = p.doorPaint[(v >>> 5) % p.doorPaint.length];
  const warm = !(mat === 'stone' || mat === 'brick');
  const fr0 = warm ? p.oak : p.stone;
  R(c, fr0[warm ? 1 : 2], x + 2, y + 1, 12, 15);
  R(c, fr0[warm ? 3 : 5], x + 2, y + 1, 12, 1);
  R(c, d[2], x + 3, y + 2, 10, 13);
  for (const jx of [5, 8, 11]) mark(c, d[0], x, y, jx, 2, 1, 13);
  R(c, d[0], x + 3, y + 2, 10, 1);
  for (const yy of [5, 11]) { R(c, p.iron[1], x + 3, y + yy, 5, 1); P(c, p.iron[3], x + 3, y + yy - 1); }
  P(c, p.iron[3], x + 10, y + 8); P(c, p.iron[1], x + 10, y + 9);
  R(c, '#160f0a', x + 2, y + 15, 12, 1);
}

/** A doorway through a wall top: boards across the gap and the leaf swung back. */
export function paintIDoorway(c, x, y, v, warm) {
  const p = archPalette(), w = p.wood, t = warm ? WARM_TOP : COOL_TOP;
  R(c, w[2], x, y, 16, 16);
  for (let yy = 3; yy < 16; yy += 4) R(c, w[1], x, y + yy, 16, 1);
  for (let yy = 0; yy < 16; yy += 4) R(c, w[3], x, y + yy, 16, 1);
  // the jambs are the ends of the wall tops either side
  R(c, t[1], x, y, 2, 16); R(c, t[3], x + 2, y, 1, 16);
  R(c, t[1], x + 14, y, 2, 16); R(c, t[0], x + 13, y, 1, 16);
  // the threshold board, and the leaf standing open against the north jamb
  R(c, w[4], x + 3, y + 7, 10, 2); H1c(c, w[5], x + 3, y + 7, 10);
  const d = p.doorPaint[(v >>> 5) % p.doorPaint.length];
  R(c, d[2], x + 3, y + 1, 2, 5); P(c, d[3], x + 3, y + 1); R(c, d[0], x + 4, y + 2, 1, 4);
}

/** The way out of a room, in its south wall: a mat, and daylight beyond. */
export function paintIExit(c, x, y, v, warm) {
  const p = archPalette(), w = p.wood, t = warm ? WARM_TOP : COOL_TOP;
  R(c, w[2], x + 3, y, 10, 16);
  for (let yy = 3; yy < 16; yy += 4) R(c, w[1], x + 3, y + yy, 10, 1);
  // the doormat, rush-woven
  R(c, '#7a5c32', x + 4, y + 1, 8, 7);
  for (let yy = 2; yy < 8; yy += 2) R(c, '#94723e', x + 4, y + yy, 8, 1);
  R(c, '#5e4424', x + 4, y + 7, 8, 1);
  // the daylight the open door lets in, brightest at the sill
  R(c, '#b89a64', x + 3, y + 9, 10, 2);
  R(c, '#d8c088', x + 3, y + 11, 10, 2);
  R(c, '#eee0b0', x + 3, y + 13, 10, 3);
  R(c, t[1], x, y, 3, 16); R(c, t[1], x + 13, y, 3, 16);
  H1c(c, t[3], x, y, 3); H1c(c, t[3], x + 13, y, 3);
  R(c, t[3], x + 2, y, 1, 16); R(c, t[0], x + 13, y, 1, 16);
}

// ---------------------------------------------------------------------------
// 6. RUGS, MOSAIC, THE NOTICE BOARD
// ---------------------------------------------------------------------------

/**
 * One rug, however many tiles it covers. `same` says which neighbours are the
 * same rug (1 N, 2 E, 4 S, 8 W); a border runs along every side that is not,
 * with a fringe on the north and south ends, so a 4x3 rectangle of CARPET_RED
 * is a single carpet with one border instead of twelve bordered squares.
 */
export function paintRug(c, x, y, v, same, style) {
  const blue = style === 'blue';
  const F = blue ? RAMPS.woad : RAMPS.madder, B = blue ? RAMPS.madder : RAMPS.woad, G = RAMPS.gold;
  R(c, F[2], x, y, 16, 16);
  // the field: a dotted diamond lattice on an 8px period (seamless at 16) with
  // a small rosette in each diamond
  for (let yy = 0; yy < 16; yy++) for (let xx = 0; xx < 16; xx++) {
    const a = (xx + yy) & 7, b = (xx - yy + 16) & 7;
    if ((a === 0 || b === 0) && ((xx + yy) & 1) === 0) P(c, F[1], x + xx, y + yy);
  }
  for (const [cx, cy] of [[4, 0], [12, 8], [4, 8], [12, 0]]) {
    const yy = cy + 4;
    P(c, (cx + cy) & 8 ? G[2] : B[3], x + cx, y + yy);
    P(c, F[3], x + cx - 1, y + yy); P(c, F[3], x + cx + 1, y + yy); P(c, F[3], x + cx, y + yy - 1); P(c, F[3], x + cx, y + yy + 1);
  }
  // borders
  const band = (side) => {
    for (let i = 0; i < 16; i++) {
      for (let d = 0; d < 4; d++) {
        const col = d === 0 ? F[0] : d === 3 ? G[1] : (d === 1 ? B[1] : B[2]);
        const [px, py] = side === 'N' ? [i, d] : side === 'S' ? [i, 15 - d] : side === 'W' ? [d, i] : [15 - d, i];
        P(c, col, x + px, y + py);
      }
      // a running motif in the band
      if ((i & 3) === 1) { const [px, py] = side === 'N' ? [i, 2] : side === 'S' ? [i, 13] : side === 'W' ? [2, i] : [13, i]; P(c, G[2], x + px, y + py); }
    }
  };
  if (!(same & 1)) band('N');
  if (!(same & 4)) band('S');
  if (!(same & 8)) band('W');
  if (!(same & 2)) band('E');
  // corners where two border sides meet: a gold boss
  const corner = (cx, cy) => { R(c, B[1], x + cx, y + cy, 2, 2); P(c, G[3], x + cx, y + cy); };
  if (!(same & 1) && !(same & 8)) corner(1, 1);
  if (!(same & 1) && !(same & 2)) corner(13, 1);
  if (!(same & 4) && !(same & 8)) corner(1, 13);
  if (!(same & 4) && !(same & 2)) corner(13, 13);
  // fringe on the short ends: the warp threads left long
  for (let i = 0; i < 16; i += 2) {
    if (!(same & 1)) P(c, '#e6dcc0', x + i, y);
    if (!(same & 4)) P(c, '#e6dcc0', x + i, y + 15);
  }
}

/**
 * MOSAIC: small tesserae in warm stone, and rosettes that sit ON the tile
 * borders — each half drawn by the tile either side of the border, agreed by
 * the shared edge bit — so a plaza reads as one laid floor with its motifs
 * scattered, not as a 16px chequerboard of diamonds.
 */
export function paintMosaic(c, x, y, v, vi) {
  const tones = ['#b0a590', '#a49a86', '#bcb29c', '#9a907c'];
  for (let yy = 0; yy < 16; yy += 2) for (let xx = 0; xx < 16; xx += 2) {
    const h = hash(xx >> 1, yy >> 1, 0x3A5) + hash(vi, xx + yy, 7);
    R(c, tones[h & 3], x + xx, y + yy, 2, 2);
  }
  // a faint grout net every 2px on alternate cells only, so it shimmers without ruling lines
  for (let yy = 0; yy < 16; yy += 4) for (let xx = (yy & 4) ? 2 : 0; xx < 16; xx += 4) P(c, '#8e8472', x + xx, y + yy);
  const T = '#9a5238', Td = '#6e3424', Bl = '#3e5a82', Go = '#d4a032';
  // a rosette of radius 3 centred at (cx, cy) in tile space, clipped to the tile
  const rosette = (cx, cy) => {
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const d = Math.abs(dx) + Math.abs(dy);
      if (d > 3) continue;
      const col = d === 0 ? Go : d === 1 ? T : d === 2 ? ((dx === 0 || dy === 0) ? T : Td) : Bl;
      mark(c, col, x, y, cx + dx, cy + dy, 1, 1);
    }
  };
  if (vi & 4) rosette(8, 0);
  if (vi & 8) rosette(8, 16);
  if (vi & 1) rosette(0, 8);
  if (vi & 2) rosette(16, 8);
}

/** NOTICE_BOARD: a planked board on two posts under a little shingled cap, papers pinned to it. */
export function paintNoticeBoard(c, x, y, v) {
  const p = archPalette(), ok = p.oak, sh = p.shingle;
  // contact shadow under the legs, cast down and to the right
  R(c, 'rgba(18,12,8,0.30)', x + 3, y + 14, 12, 2);
  R(c, 'rgba(18,12,8,0.16)', x + 2, y + 15, 14, 1);
  // two legs, clear of the board so it reads as a thing on posts, not a sign on a wall
  for (const px of [3, 11]) { R(c, p.ink, x + px - 1, y + 11, 4, 4); R(c, ok[3], x + px, y + 11, 1, 4); R(c, ok[1], x + px + 1, y + 11, 1, 4); }
  // the board, framed
  R(c, p.ink, x, y + 2, 16, 10);
  R(c, ok[1], x + 1, y + 3, 14, 8);
  R(c, ok[3], x + 1, y + 3, 14, 1); R(c, ok[3], x + 1, y + 3, 1, 8);
  R(c, ok[2], x + 2, y + 4, 12, 6);
  // the cap: a little shingled roof over it, dripping clear of the notices
  R(c, p.ink, x + 1, y, 14, 1);
  R(c, sh[5], x, y + 1, 16, 1); R(c, sh[3], x, y + 2, 16, 1);
  for (let i = 2; i < 16; i += 4) P(c, sh[1], x + i, y + 2);
  // the notices: a broadsheet, a bounty with its seal, a scrap
  const paper = ['#eee4c6', '#dccfa8'];
  R(c, paper[v & 1], x + 2, y + 4, 5, 6); R(c, '#bca982', x + 2, y + 9, 5, 1);
  for (const l of [5, 7]) R(c, '#6a5a44', x + 3, y + l, 3, 1);
  R(c, paper[(v + 1) & 1], x + 8, y + 4, 4, 5); R(c, '#bca982', x + 8, y + 8, 4, 1);
  R(c, '#6a5a44', x + 9, y + 5, 2, 1);
  P(c, '#a8302a', x + 10, y + 7); P(c, '#d0583e', x + 9, y + 7);
  R(c, paper[v & 1], x + 12, y + 6, 2, 3);
  for (const px of [4, 10, 12]) P(c, p.iron[1], x + px, y + 4);
}

// ---------------------------------------------------------------------------
// 6b. TOWERS, STAINED GLASS, TRADE SIGNS, SHEDS AND STABLES
// ---------------------------------------------------------------------------

/**
 * A pyramid roof over a tower, apex raised above the back eave, rasterised
 * as one shape and sliced into tiles. The block is `cols` wide and `rows`
 * tall INCLUDING a tip row above the tower's footprint (ty 0, on the over
 * plane of the tile north of the tower), so a spire can rise clear of the
 * house it stands on. Seen from the south and above, the north face is
 * hidden; the west face takes the light, the south face is mid, the east
 * face is in shade, and the two front hips run from the apex to the eave
 * corners.
 */
export function paintPyramid(c, x, y, tx, ty, cols, rows, mat) {
  const p = archPalette();
  const rp = p[mat] || p.slate;
  const W = cols * 16, H = rows * 16;
  const yb = 16, yf = H - 1, ax = (W - 1) / 2, ay = cols >= 3 ? 5 : 7;
  const inside = (px, py) => {
    if (py > yf || px < 0 || px > W - 1) return false;
    if (py >= yb) return true;
    // above the back eave: inside the triangle apex-(0,yb)-(W-1,yb)
    if (py < ay) return false;
    const t = (py - ay) / (yb - ay);
    return Math.abs(px - ax) <= t * (W / 2) + 0.01;
  };
  const face = (px, py) => {
    // left of the hip apex->(0,yf) is the west face; right of apex->(W-1,yf) the east
    const lx = ax + (0 - ax) * (py - ay) / (yf - ay), rx = ax + (W - 1 - ax) * (py - ay) / (yf - ay);
    return px < lx - 0.5 ? 'W' : px > rx + 0.5 ? 'E' : 'S';
  };
  for (let ly = 0; ly < 16; ly++) for (let lx = 0; lx < 16; lx++) {
    const px = tx * 16 + lx, py = ty * 16 + ly;
    if (!inside(px, py)) continue;
    const f = face(px, py);
    const edge = !inside(px - 1, py) || !inside(px + 1, py) || !inside(px, py - 1);
    // courses: horizontal, every three rows, the lap in shade
    const lap = ((py - ay) % 3) === 0;
    let col;
    if (f === 'W') col = lap ? rp[4] : rp[5];
    else if (f === 'S') col = lap ? rp[2] : rp[3];
    else col = lap ? rp[0] : rp[1];
    // joints in the courses, staggered
    if (!lap && ((px + ((Math.floor((py - ay) / 3) & 1) ? 2 : 0)) % 4) === 0 && f !== 'E') col = f === 'W' ? rp[4] : rp[2];
    // the hips: a lit arris on the west hip, a dark one on the east
    const lxh = ax + (0 - ax) * (py - ay) / (yf - ay), rxh = ax + (W - 1 - ax) * (py - ay) / (yf - ay);
    if (Math.abs(px - lxh) < 0.6) col = rp[6];
    if (Math.abs(px - rxh) < 0.6) col = rp[1];
    if (py >= yf - 1) col = py === yf ? rp[0] : (f === 'E' ? rp[1] : rp[2]);   // the eave lip
    if (edge && py < yf) col = p.inkC;
    P(c, col, x + lx, y + ly);
  }
  // the finial: a rod and a gilt ball on the apex
  const fx = Math.round(ax) - tx * 16, fy0 = ay - 5 - ty * 16;
  if (fx >= 0 && fx < 16) {
    for (let i = 0; i < 5; i++) mark(c, p.iron[1], x, y, fx, fy0 + 1 + i, 1, 1);
    mark(c, RAMPS.gold[3], x, y, fx, fy0, 1, 1); mark(c, RAMPS.gold[1], x, y, fx + 1, fy0 + 1, 1, 1);
    mark(c, RAMPS.gold[4], x, y, fx - 1, fy0 + 1, 1, 1);
  }
}

/**
 * A buttress: a stone pier standing proud of a masonry wall, lit on its west
 * face, its east face in shade and throwing a sliver of shadow on the wall.
 * Between the lancets of a nave it turns a flat grey front into bays.
 */
export function paintButtress(c, x, y, v, vi) {
  const s = archPalette().stone;
  R(c, s[1], x + 11, y, 1, 16);                  // its shadow on the wall
  R(c, s[2], x + 10, y, 1, 16);                  // east face
  R(c, s[4], x + 6, y, 4, 16);                   // front
  R(c, s[5], x + 5, y, 1, 16);                   // west face, in the light
  // the wall's courses run across the pier, a stone higher than the wall's
  for (let yy = 2; yy < 16; yy += 4) { R(c, s[2], x + 5, y + yy + 3, 5, 1); R(c, s[6], x + 6, y + yy, 3, 1); }
  if (vi & 4) P(c, s[3], x + 7, y + 8);
}

/**
 * A lancet of stained glass in a stone wall (exterior; the wall was painted
 * first). `part` makes a two-storey lancet out of two tiles: 'T' is the head
 * (the pointed arch, glass running off the bottom), 'B' the foot (glass from
 * the top, then the sill); omitted, the whole lancet fits one tile.
 */
export function paintStained(c, x, y, v, lit, part) {
  const p = archPalette(), s = p.stone;
  const rows = part === 'B' ? [] : [[1, 8, 1], [2, 7, 3], [3, 6, 5]];
  const y0 = part === 'B' ? 0 : 4, y1 = part === 'T' ? 15 : 12;
  for (let yy = y0; yy <= y1; yy++) rows.push([yy, 5, 7]);
  // the surround: one course of dressed stone round the opening, lit on the left
  for (const [yy, x0, w] of rows) { mark(c, s[1], x, y, x0 - 1, yy - 1, w + 2, 1); mark(c, s[5], x, y, x0 - 1, yy, 1, 1); mark(c, s[2], x, y, x0 + w, yy, 1, 1); }
  const jewels = lit
    ? ['#e8584a', '#5a8ae8', '#f0c850', '#5ab860', '#b070d0', '#f09040']
    : ['#8a2e2a', '#2c4a8a', '#b88a2a', '#2f6a3a', '#5a3a7a', '#a8602a'];
  for (const [yy, x0, w] of rows) {
    for (let i = 0; i < w; i++) {
      const px = x0 + i;
      const cell = hash(px >> 1, (yy - 1) / 3 | 0, v) % jewels.length;
      P(c, jewels[cell], x + px, y + yy);
    }
  }
  // lead: the mullion, the bars, and the tracery in the head
  const lead = lit ? '#3a2418' : '#141218';
  for (let yy = y0; yy <= y1; yy++) P(c, lead, x + 8, y + yy);
  for (const yy of part === 'T' ? [6, 9, 12, 15] : part === 'B' ? [3, 6, 9] : [6, 9]) mark(c, lead, x, y, 5, yy, 7, 1);
  if (part !== 'B') P(c, lead, x + 8, y + 3);
  if (lit) { P(c, '#fff0c0', x + 6, y + 5); P(c, '#fff0c0', x + 10, y + 8); }
  else { P(c, '#c8d8e8', x + 6, y + 4); P(c, '#9ab0c8', x + 9, y + 7); }
  if (part !== 'T') { mark(c, s[5], x, y, 4, 13, 9, 1); mark(c, s[2], x, y, 4, 14, 9, 1); }
}

/**
 * BATTLEMENT: the crown of a curtain wall seen from inside the town — merlons
 * standing along the far edge against the drop beyond, the crenels between them
 * dark, and the flagged wall-walk in front where the watch walks. Merlons are
 * five pixels wide with three-pixel crenels, an eight-pixel period that
 * divides sixteen, so a run of wall has no tile rhythm but its own.
 */
export function paintBattlement(c, x, y, v, vi) {
  const s = archPalette().stone;
  const rn = sr(v);
  // the walk: big flags, lit, joints on a period the wall itself keeps
  R(c, s[4], x, y + 6, 16, 10);
  for (let yy = 9; yy < 16; yy += 5) R(c, s[2], x, y + yy, 16, 1);
  for (const jx of [(vi & 1) ? 0 : 5, 11]) R(c, s[2], x + jx, y + 7, 1, 9);
  for (let i = 0; i < 3; i++) P(c, s[5], x + Math.floor(rn() * 16), y + 7 + Math.floor(rn() * 8));
  // the parapet: its inner face in shade, the crenels open on the drop
  R(c, s[2], x, y + 4, 16, 2);
  R(c, s[0], x, y, 16, 4);
  for (let m = 0; m < 16; m += 8) {
    R(c, s[3], x + m, y + 1, 5, 4);
    R(c, s[6], x + m, y, 5, 1);
    R(c, s[5], x + m, y + 1, 1, 4);
    R(c, s[1], x + m + 4, y + 1, 1, 4);
  }
  R(c, s[1], x, y + 5, 16, 1);
}

/**
 * A town gate. The jambs are PIERS of big dressed blocks, the face toward the
 * passage lit on the east pier and in shade on the west (light from the upper
 * left); the passage floor is flagged and dark under the vault; and the arch,
 * with the portcullis hauled up into it, stands on the OVER plane of the gate
 * row, so whoever walks through the gate walks under it.
 */
export function paintGatePier(c, x, y, v, vi, side) {
  const s = archPalette().stone;
  R(c, s[3], x, y, 16, 16);
  for (let k = -1; k < 4; k++) {
    const top = k * 4 + 2;
    for (let yy = Math.max(0, top); yy < Math.min(16, top + 4); yy++) {
      if (yy === top) R(c, s[5], x, y + yy, 16, 1);
      if (yy === top + 3) R(c, s[1], x, y + yy, 16, 1);
    }
    const j = (k & 1) ? 6 : 10;
    if (top >= -3) R(c, s[1], x + j, y + Math.max(0, top), 1, Math.min(4, 16 - Math.max(0, top)));
  }
  // the face turned to the passage
  if (side === 'L') { R(c, s[2], x + 13, y, 2, 16); R(c, s[0], x + 15, y, 1, 16); }
  else { R(c, s[5], x, y, 1, 16); R(c, s[4], x + 1, y, 2, 16); }
}

export function paintGateway(c, x, y, v) {
  const s = archPalette().stone;
  R(c, s[2], x, y, 16, 16);
  for (let yy = 3; yy < 16; yy += 6) R(c, s[1], x, y + yy, 16, 1);
  for (const jx of [(v & 1) ? 4 : 9]) R(c, s[1], x + jx, y, 1, 16);
  // the portcullis groove across the passage, and the shade of the vault
  R(c, '#1c1a20', x, y + 1, 16, 1);
  R(c, 'rgba(10,8,12,0.35)', x, y, 16, 6);
}

export function paintGateArch(c, x, y, v, part) {
  const s = archPalette().stone, ir = archPalette().iron;
  // the portcullis, raised: its bars and the teeth hanging below the arch
  for (let bx = 1; bx < 16; bx += 3) { R(c, ir[1], x + bx, y, 1, 7); P(c, ir[3], x + bx, y + 7); P(c, ir[1], x + bx, y + 8); }
  R(c, ir[0], x, y + 2, 16, 1); R(c, ir[2], x, y + 5, 16, 1);
  // the arch ring: voussoirs across the top, springing lower at the ends
  const spring = part === 'L' ? [5, 4, 3, 2, 2, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0]
    : part === 'R' ? [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 2, 2, 3, 4, 5] : new Array(16).fill(0);
  for (let i = 0; i < 16; i++) {
    const d = spring[i];
    R(c, s[4], x + i, y, 1, 3 + d);
    P(c, s[5], x + i, y);
    P(c, s[1], x + i, y + 3 + d);
    if (i % 4 === 0) R(c, s[2], x + i, y + 1, 1, 2 + d);
  }
  if (part === 'M') { R(c, s[6], x + 6, y, 4, 3); R(c, s[3], x + 6, y + 3, 4, 1); }
  void v;
}

/**
 * A windmill's sails, turning: four lattice sails on their stocks round the
 * hub, rasterised as one wheel over a 5x5 block of tiles (the hub in the
 * middle one) and sliced, SAIL_FRAMES frames a quarter turn, so the wheel turns
 * continuously and every tile of it agrees on the angle (they share the clock).
 */
export const SAIL_FRAMES = 6;
export function paintSails(c, x, y, bx, by, f) {
  const p = archPalette(), w = p.wood;
  const cx = 40, cy = 40, R0 = 37;
  const base = (f % SAIL_FRAMES) * (Math.PI / 2) / SAIL_FRAMES + 0.2;
  for (let ly = 0; ly < 16; ly++) for (let lx = 0; lx < 16; lx++) {
    const px = bx * 16 + lx + 0.5 - cx, py = by * 16 + ly + 0.5 - cy;
    const r = Math.hypot(px, py);
    if (r > R0 || r < 1) continue;
    let col = null;
    for (let k = 0; k < 4 && !col; k++) {
      const a = base + k * Math.PI / 2;
      const ux = Math.cos(a), uy = Math.sin(a);
      const along = px * ux + py * uy, perp = -px * uy + py * ux;
      if (along < 0) continue;
      if (Math.abs(perp) <= 1 && along <= R0) col = perp < 0 ? w[4] : w[1];                // the stock
      else if (perp > 1 && perp <= 8 && along >= 9 && along <= R0 - 1) {
        // the sail: a lattice of bars over canvas, lit or in shade by the way it faces
        const bar = (Math.round(along) % 4 === 0) || perp > 7.2;
        const litSide = (ux - uy) > 0;
        col = bar ? w[2] : (litSide ? '#e4dcc0' : '#bcb092');
      }
    }
    if (!col && r <= 3.2) col = r < 1.6 ? p.iron[3] : w[1];
    if (col) P(c, col, x + lx, y + ly);
  }
}

/** A rose window over a temple door: a wheel of stained glass in a stone ring. */
export function paintRose(c, x, y, v, lit) {
  const s = archPalette().stone;
  const jewels = lit
    ? ['#e8584a', '#5a8ae8', '#f0c850', '#5ab860', '#b070d0']
    : ['#8a2e2a', '#2c4a8a', '#b88a2a', '#2f6a3a', '#5a3a7a'];
  const cx = 7.5, cy = 7.5;
  for (let yy = 0; yy < 16; yy++) for (let xx = 0; xx < 16; xx++) {
    const dx = xx - cx, dy = yy - cy, d = Math.hypot(dx, dy);
    if (d > 7.2) continue;
    let col;
    if (d > 6.2) col = (dx + dy < 0) ? s[5] : s[2];                     // the ring, lit upper left
    else if (d > 5.4) col = s[1];
    else if (d < 1.4) col = jewels[2];                                   // the boss
    else {
      const a = Math.atan2(dy, dx), k = Math.round((a + Math.PI) / (Math.PI / 4)) % 8;
      const spoke = Math.abs(((a + Math.PI) / (Math.PI / 4)) - Math.round((a + Math.PI) / (Math.PI / 4))) < 0.14;
      col = spoke ? (lit ? '#3a2418' : '#141218') : jewels[(k + (d > 3.4 ? 1 : 0)) % jewels.length];
    }
    P(c, col, x + xx, y + yy);
  }
  void v;
}

/** The same lancet from inside, on a temple's back-wall face, with the day behind it. */
export function paintIStained(c, x, y, v, vi) {
  paintIWall(c, x, y, v, vi & 15, 'stone');
  const s = archPalette().stone;
  R(c, s[1], x + 4, y + 2, 9, 10);
  const jewels = ['#f06a58', '#6a9af0', '#f8d868', '#6ac870', '#c080e0', '#f8a050'];
  for (let yy = 3; yy <= 10; yy++) for (let xx = 5; xx <= 11; xx++) {
    if (yy === 3 && (xx < 7 || xx > 9)) continue;
    P(c, jewels[hash(xx >> 1, yy / 3 | 0, v + 11) % jewels.length], x + xx, y + yy);
  }
  for (let yy = 4; yy <= 10; yy++) P(c, '#3a2418', x + 8, y + yy);
  for (const yy of [6, 9]) mark(c, '#3a2418', x, y, 5, yy, 7, 1);
  P(c, '#fff4d0', x + 6, y + 4); P(c, '#fff4d0', x + 10, y + 7);
  R(c, s[5], x + 3, y + 11, 11, 1);
}

// Trade devices, 7x5, painted on a hanging board. '.' is the board, and each
// letter is one of the paints below. A sign had to be read by people who could
// not read, so each is a silhouette first.
const DEVICES = Object.freeze({
  INN: ['.WWWW..', '.YYYY.Y', '.YOOY.Y', '.YOOYY.', '.YYYY..'],       // a tankard with a head on it
  SMITH: ['IIIIIII', '.IIIIII', '..KIK..', '..KIK..', '.KKKKK.'],     // an anvil
  GOODS: ['..GGG..', '...G...', '.CCCCC.', 'CCCCCCC', '.CCCCC.'],     // a tied sack
  ARMS: ['.RRRRR.', '.RWRWR.', '.RRWRR.', '..RRR..', '...R...'],      // a heater shield, per saltire
  COIN: ['...G...', 'GGGGGGG', 'G..G..G', 'YY.G.YY', '..GGG..'],      // the balance
  POTION: ['...K...', '..WWW..', '.BBBBB.', '.BWBBB.', '..BBB..'],    // a flask
  BOOK: ['.......', 'RRR.RRR', 'RWW.WWR', 'RWW.WWR', 'RRRRRRR'],     // an open book
  BREAD: ['.......', '..LLL..', '.LSLSL.', 'LLLLLLL', '.OOOOO.'],    // a loaf, scored
  STABLE: ['.II.II.', 'II...II', 'I.....I', 'I.....I', 'KI...IK'],   // a horseshoe
});
const PAINT = { W: '#efe6cc', Y: '#d8a838', O: '#8a5a2a', K: '#3a3e46', I: '#b0b8c4', G: '#e0b040', C: '#c8b080', R: '#a8302a', B: '#4a7ac8', L: '#c8883a', S: '#f0d890' };
export const TRADES = Object.freeze(Object.keys(DEVICES));

/** SHOP_SIGN_<TRADE>: the bracket, the board swinging under it, its device. */
export function paintTradeSign(c, x, y, v, trade) {
  const p = archPalette(), ir = p.iron, w = p.wood;
  R(c, ir[1], x + 2, y + 1, 10, 1); P(c, ir[3], x + 2, y + 1);
  P(c, ir[1], x + 3, y + 2); P(c, ir[1], x + 11, y + 2);
  P(c, ir[1], x + 5, y + 3); P(c, ir[1], x + 10, y + 3);
  R(c, p.ink, x + 3, y + 4, 11, 8);
  R(c, w[2], x + 4, y + 5, 9, 6);
  R(c, w[4], x + 4, y + 5, 9, 1); R(c, w[1], x + 4, y + 10, 9, 1);
  const dev = DEVICES[trade] || DEVICES.GOODS;
  dev.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] !== '.') P(c, PAINT[row[i]], x + 5 + i, y + 5 + j); });
  R(c, 'rgba(0,0,0,0.22)', x + 4, y + 12, 10, 1);
}

/** A barn's wagon doors: two wide planked leaves on a Z-brace, in the footing row. */
export function paintBarnDoor(c, x, y, v) {
  const p = archPalette(), s = p.stone, w = p.wood;
  R(c, s[3], x, y, 16, 16); R(c, s[0], x, y + 15, 16, 1);
  R(c, p.oak[1], x + 1, y, 14, 15);
  for (const [lx, lw] of [[2, 6], [8, 6]]) {
    R(c, w[2], x + lx, y + 1, lw, 14);
    for (let i = lx + 2; i < lx + lw; i += 2) mark(c, w[1], x, y, i, 1, 1, 14);
    mark(c, w[3], x, y, lx, 1, 1, 14);
    for (const yy of [3, 12]) mark(c, w[4], x, y, lx, yy, lw, 1);
    for (let i = 0; i < 8; i++) mark(c, w[4], x, y, lx + Math.round(i * (lw - 1) / 7), 11 - i, 1, 1);
  }
  R(c, p.iron[2], x + 7, y + 7, 2, 1);
}

/** A stable's half-door: the lower leaf shut, the upper open on the dark stall. */
export function paintStableDoor(c, x, y, v) {
  const p = archPalette(), s = p.stone, w = p.wood;
  R(c, s[3], x, y, 16, 16); R(c, s[0], x, y + 15, 16, 1);
  R(c, p.oak[1], x + 2, y, 12, 15);
  R(c, '#140e0a', x + 3, y, 10, 7);
  // a horse's head in the dark on one stall in two
  if (v & 1) { R(c, '#5a3a24', x + 6, y + 2, 3, 5); P(c, '#7a5232', x + 6, y + 2); P(c, '#e8e0cc', x + 7, y + 3); P(c, '#1a1210', x + 7, y + 5); }
  R(c, w[2], x + 3, y + 7, 10, 8);
  R(c, w[4], x + 3, y + 7, 10, 1);
  for (let i = 5; i < 13; i += 3) mark(c, w[1], x, y, i, 8, 1, 7);
  for (let i = 0; i < 6; i++) mark(c, w[3], x, y, 4 + i, 13 - i, 1, 1);
  P(c, p.iron[3], x + 11, y + 10);
}

/** An open shed's front post, standing on the front row under the eave. */
export function paintShedPost(c, x, y, v, side) {
  const p = archPalette(), ok = p.oak;
  const px = side === 'L' ? 1 : side === 'R' ? 11 : 6;
  R(c, 'rgba(18,12,8,0.3)', x + px + 1, y + 14, 5, 2);
  R(c, p.ink, x + px - 1, y, 6, 15);
  R(c, ok[3], x + px, y, 1, 14); R(c, ok[2], x + px + 1, y, 2, 14); R(c, ok[0], x + px + 3, y, 1, 14);
  R(c, s0(p), x + px - 1, y + 13, 6, 2);
}
function s0(p) { return p.stone[3]; }

/** The planked back wall of an open shed, with the trade's tools hung on it. */
export function paintShedWall(c, x, y, v, vi) {
  const p = archPalette(), w = p.woodDark;
  R(c, w[2], x, y, 16, 16);
  for (let i = (vi & 1) ? 1 : 3; i < 16; i += 4) mark(c, w[1], x, y, i, 0, 1, 16);
  R(c, w[3], x, y, 16, 1);
  R(c, w[0], x, y + 15, 16, 1);
  const kind = (vi >> 4) & 3;
  const ir = p.iron;
  if (kind === 0) {
    // tongs and a hammer on pegs
    for (let i = 0; i < 7; i++) { P(c, ir[2], x + 3 + (i >> 2), y + 3 + i); P(c, ir[2], x + 5 - (i >> 2), y + 3 + i); }
    R(c, p.wood[3], x + 10, y + 4, 1, 7); R(c, ir[2], x + 9, y + 3, 3, 2); P(c, ir[4], x + 9, y + 3);
  } else if (kind === 1) {
    // a coil of rope and a bridle
    R(c, '#b8a070', x + 3, y + 4, 5, 5); R(c, w[2], x + 4, y + 5, 3, 3); P(c, '#d8c090', x + 3, y + 4);
    R(c, '#6a4a2a', x + 10, y + 3, 1, 8); R(c, '#6a4a2a', x + 12, y + 3, 1, 6); R(c, '#6a4a2a', x + 10, y + 3, 3, 1); P(c, ir[3], x + 11, y + 9);
  } else if (kind === 2) {
    // a saw and a scythe
    R(c, ir[3], x + 2, y + 5, 7, 2); for (let i = 2; i < 9; i += 2) P(c, ir[1], x + i, y + 7); R(c, p.wood[3], x + 9, y + 5, 2, 2);
    R(c, p.wood[2], x + 12, y + 2, 1, 11); R(c, ir[3], x + 9, y + 2, 3, 1); P(c, ir[3], x + 8, y + 3);
  }
}

// ---------------------------------------------------------------------------
// 6c. FURNITURE
// ---------------------------------------------------------------------------
//
// Furniture sat two or three L* off the floor it stood on and vanished into
// it. Every piece now has a lit top face (you are looking down on it), a
// darker front, a one-pixel dark keyline on the outside of the silhouette and a
// contact shadow thrown down and to the right, so a taproom full of tables
// reads as tables on a floor. Grids: '.' clear, 'o' keyline, digits the wood
// ramp (1 dark .. 6 light); other letters are named per piece.

function grid(c, x, y, rows, tones) {
  for (let j = 0; j < rows.length; j++) {
    const row = rows[j];
    for (let i = 0; i < row.length; i++) {
      const col = tones[row[i]];
      if (col) P(c, col, x + i, y + j);
    }
  }
}
function woodTones(extra) {
  const p = archPalette(), w = p.wood;
  return { o: '#22160e', 1: w[1], 2: w[2], 3: w[3], 4: w[4], 5: w[5], 6: w[6], ...(extra || {}) };
}
/** A soft two-step contact shadow, offset down and right. */
function footShadow(c, x, y, x0, w, y0, h = 2) {
  R(c, 'rgba(16,10,6,0.30)', x + x0 + 1, y + y0, w, h);
  R(c, 'rgba(16,10,6,0.16)', x + x0, y + y0 + h - 1, w + 2, 1);
}

export function paintTable(c, x, y, v) {
  footShadow(c, x, y, 2, 12, 13);
  grid(c, x, y, [
    '', '', '',
    '..oooooooooooo..',
    '.o666666666665o.',
    '.o555555555554o.',
    '.o555555555554o.',
    '.o455555555543o.',
    '.o444444444443o.',
    '.oo2222222222oo.',
    '.o2o11111111o2o.',
    '..o2o......o2o..',
    '..o1o......o1o..',
    '..ooo......ooo..',
  ], woodTones());
  // what is on it: a tankard and a trencher, a candle, bread and a bowl
  const k = v % 4;
  if (k === 1) { R(c, '#8a8f98', x + 4, y + 4, 2, 3); P(c, '#e8e4d8', x + 4, y + 4); P(c, '#5a5f68', x + 6, y + 5); R(c, '#c8b890', x + 9, y + 6, 3, 1); P(c, '#e8dcb8', x + 9, y + 5); }
  else if (k === 2) { R(c, '#e8e0c4', x + 7, y + 3, 2, 3); P(c, '#ffb04a', x + 7, y + 2); P(c, '#fff0a0', x + 8, y + 1); R(c, '#8a6a3a', x + 6, y + 6, 4, 1); }
  else if (k === 3) { R(c, '#b8783a', x + 4, y + 5, 4, 2); P(c, '#e0a860', x + 4, y + 5); R(c, '#6a7a8a', x + 10, y + 5, 3, 2); P(c, '#9aaab8', x + 10, y + 5); }
}

export function paintChair(c, x, y) {
  footShadow(c, x, y, 4, 8, 12);
  grid(c, x, y, [
    '', '',
    '......oooo......',
    '.....o6554o.....',
    '.....o4334o.....',
    '.....o4oo4o.....',
    '.....o3oo3o.....',
    '....oooooooo....',
    '....o666665o....',
    '....o444443o....',
    '....oo2oo2oo....',
    '.....o2oo2o.....',
    '.....o1oo1o.....',
    '.....oooooo.....',
  ], woodTones());
}

export function paintBench(c, x, y) {
  footShadow(c, x, y, 0, 14, 12);
  grid(c, x, y, [
    '', '', '', '', '',
    'oooooooooooooooo',
    '6666666666666666',
    '5555555555555555',
    '4444444444444444',
    'oooooooooooooooo',
    '.o2o........o2o.',
    '.o2o........o2o.',
    '.o1o........o1o.',
    '.ooo........ooo.',
  ], woodTones());
}

export function paintBed(c, x, y, v) {
  const cloth = [RAMPS.madder, RAMPS.woad, RAMPS.green, RAMPS.leather][v % 4];
  footShadow(c, x, y, 1, 14, 14);
  grid(c, x, y, [
    '.oooooooooooooo.',
    '.o665555555566o.',
    '.o433333333334o.',
    '.oo2222222222oo.',
    '.oWWWWWWWWWWWWo.',
    '.oWWWWWwwWWWWWo.',
    '.owwwwwwwwwwwwo.',
    '.oRRRRRRRRRRRRo.',
    '.oRRRrrRRRRRRRo.',
    '.oRRRRRRRRrRRRo.',
    '.orrrrrrrrrrrro.',
    '.oRRRRRRRRRRRRo.',
    '.orrrrrrrrrrrro.',
    '.o555555555555o.',
    '.o222222222222o.',
  ], woodTones({ W: '#ece2c8', w: '#c8b894', R: cloth[3], r: cloth[2] }));
}

/** A fireplace against the back wall: mantel, stone surround, a fire (3 frames). */
export function paintHearth(c, x, y, v, f) {
  const p = archPalette(), s = p.stone;
  grid(c, x, y, [
    'oooooooooooooooo',
    'o66666666666665o',
    'o33333333333332o',
    'oSSSSSSSSSSSSSSo',
    'oSs##########sSo',
    'oSs##########sSo',
    'oSs##########sSo',
    'oSs##########sSo',
    'oSs##########sSo',
    'oSs##########sSo',
    'oSs##########sSo',
    'oSs##########sSo',
    'oTTTTTTTTTTTTTTo',
    'o55555555555554o',
    'oooooooooooooooo',
  ], woodTones({ S: s[4], s: s[2], T: s[5], '#': '#120c0a' }));
  // soot up the back of the firebox, andirons, logs and the fire
  R(c, '#1c1410', x + 5, y + 4, 6, 3);
  R(c, p.iron[1], x + 4, y + 10, 1, 2); R(c, p.iron[1], x + 11, y + 10, 1, 2);
  R(c, p.wood[2], x + 4, y + 10, 8, 1); R(c, p.wood[1], x + 5, y + 11, 7, 1); P(c, p.wood[4], x + 4, y + 10);
  const h = [5, 6, 4][f % 3];
  const flame = [['#c03a12', 0], ['#e2531f', 1], ['#ff9a2a', 2], ['#ffe07a', 3]];
  for (const [col, k] of flame) {
    const w = 8 - k * 2, top = 10 - h + k + ((f + k) % 2);
    if (w > 0) R(c, col, x + 4 + k, y + top, w, 10 - top);
  }
  P(c, '#fff4c0', x + 7 + (f % 2), y + 10 - h + 3);
  P(c, '#ffb04a', x + 6 - (f % 2), y + 10 - h);
}

/** A smith's forge: brick hearth under a stone hood, coals breathing (3 frames). */
export function paintForge(c, x, y, v, f) {
  const p = archPalette(), s = p.stone, b = p.brick;
  footShadow(c, x, y, 1, 14, 14);
  grid(c, x, y, [
    '.....oooooo.....',
    '.....oHHhho.....',
    '....oHHHhhho....',
    '...oHHHHhhhho...',
    '..oHHHHHHhhhho..',
    '.oooooooooooooo.',
    '.oBBBBBBBBBBBbo.',
    '.oB##########bo.',
    '.oB##########bo.',
    '.oBBBBBBBBBBBbo.',
    '.oBbBbBbBbBbBbo.',
    '.oBBBBBBBBBBBbo.',
    '.obbbbbbbbbbbbo.',
    '.oooooooooooooo.',
  ], woodTones({ H: s[4], h: s[2], B: b[4], b: b[2], '#': '#1a0c08' }));
  // the coals: a bed of embers that brightens and dims
  const hot = ['#ff9a2a', '#ffb850', '#ff8a20'][f % 3];
  for (let i = 3; i < 13; i++) {
    const k = hash(i, f, 5) % 4;
    P(c, k === 0 ? '#ffe07a' : k === 1 ? hot : '#c03a12', x + i, y + 8);
    P(c, k === 3 ? '#ff9a2a' : '#7a200c', x + i, y + 7);
  }
  if (f === 1) { P(c, '#ffe07a', x + 6, y + 6); P(c, '#ff9a2a', x + 9, y + 5); }
  // the soot where the hood draws
  R(c, p.soot, x + 6, y + 1, 4, 1);
}

/** A keg on its side in a cradle, its end toward you, a spigot in the bung. */
export function paintKeg(c, x, y, v) {
  const p = archPalette(), w = p.wood, ir = p.iron;
  footShadow(c, x, y, 2, 12, 14);
  const cx = 7.5, cy = 7, r = 6.2;
  for (let yy = 0; yy < 16; yy++) for (let xx = 0; xx < 16; xx++) {
    const dx = xx - cx, dy = yy - cy, d = Math.hypot(dx, dy);
    if (d > r) continue;
    let col;
    if (d > r - 1) col = '#22160e';
    else if (d > r - 2.1) col = (dx + dy < -2) ? ir[3] : ir[1];                   // the chime hoop
    else { const k = -(dx + dy) / (r * 1.4); col = k > 0.35 ? w[5] : k > 0 ? w[4] : k > -0.35 ? w[3] : w[2]; }
    P(c, col, x + xx, y + yy);
  }
  // staves on the end: faint vertical joints
  for (const jx of [5, 8, 11]) for (let yy = 3; yy < 12; yy++) if (Math.hypot(jx - cx, yy - cy) < r - 2.2) P(c, w[2], x + jx, y + yy);
  // spigot
  R(c, p.bronze[3], x + 7, y + 8, 2, 2); P(c, p.bronze[4], x + 7, y + 8); P(c, p.bronze[1], x + 8, y + 10); P(c, p.bronze[3], x + 9, y + 7);
  // cradle
  grid(c, x, y, ['', '', '', '', '', '', '', '', '', '', '', '',
    '..oo3o....o3oo..', '..o2221oo1222o..', '..oooooooooooo..'], woodTones());
}

/** A rack of arms: a sword, a spear and an axe stood in a wooden frame. */
export function paintWeaponRack(c, x, y) {
  const p = archPalette();
  footShadow(c, x, y, 1, 14, 14);
  const st = RAMPS.steel, w = p.wood;
  // the frame: two uprights and two rails
  R(c, '#22160e', x + 1, y + 3, 2, 12); R(c, '#22160e', x + 13, y + 3, 2, 12);
  R(c, w[4], x + 1, y + 3, 1, 11); R(c, w[2], x + 2, y + 3, 1, 11); R(c, w[3], x + 13, y + 3, 1, 11); R(c, w[1], x + 14, y + 3, 1, 11);
  R(c, w[3], x + 1, y + 6, 14, 1); R(c, w[1], x + 1, y + 7, 14, 1); R(c, w[3], x + 1, y + 12, 14, 1); R(c, w[1], x + 1, y + 13, 14, 1);
  // spear
  R(c, w[3], x + 4, y + 2, 1, 12); P(c, st[4], x + 4, y); P(c, st[3], x + 4, y + 1); P(c, st[2], x + 5, y + 1);
  // sword: blade, guard, grip, pommel
  R(c, st[4], x + 7, y + 1, 1, 8); R(c, st[2], x + 8, y + 1, 1, 8);
  R(c, RAMPS.bronze[3], x + 5, y + 9, 5, 1); R(c, RAMPS.leather[2], x + 7, y + 10, 2, 2); P(c, RAMPS.bronze[4], x + 7, y + 12);
  // axe
  R(c, w[2], x + 11, y + 3, 1, 10); R(c, st[3], x + 9, y + 3, 2, 3); P(c, st[4], x + 9, y + 3); P(c, st[1], x + 10, y + 5);
}

/** A mail shirt on a stand, a helm over it. */
export function paintArmorStand(c, x, y) {
  const p = archPalette(), st = RAMPS.steel, w = p.wood;
  footShadow(c, x, y, 3, 10, 14);
  R(c, '#22160e', x + 7, y + 11, 2, 3); R(c, w[3], x + 7, y + 11, 1, 3);
  R(c, '#22160e', x + 4, y + 13, 8, 2); R(c, w[4], x + 4, y + 13, 8, 1);
  // the helm
  R(c, '#1c1e24', x + 5, y + 0, 6, 4); R(c, st[3], x + 6, y + 0, 4, 3); P(c, st[4], x + 6, y); R(c, '#1c1e24', x + 6, y + 2, 4, 1);
  // the hauberk: shoulders, body, sleeves; ring texture as a dither
  R(c, '#1c1e24', x + 2, y + 4, 12, 8);
  for (let yy = 4; yy < 11; yy++) for (let xx = 3; xx < 13; xx++) {
    if ((xx < 5 || xx > 10) && yy > 8) continue;
    P(c, ((xx + yy) & 1) ? st[3] : st[2], x + xx, y + yy);
  }
  R(c, st[4], x + 5, y + 4, 6, 1);
  R(c, RAMPS.leather[2], x + 5, y + 9, 6, 1);
}

/** A pew: a church bench with a back, dark polished wood. */
export function paintPew(c, x, y) {
  footShadow(c, x, y, 0, 14, 13);
  grid(c, x, y, [
    '', '',
    'oooooooooooooooo',
    '4444444444444444',
    '3333333333333333',
    '2222222222222222',
    'oooooooooooooooo',
    '5555555555555555',
    '4444444444444444',
    '3333333333333333',
    'oooooooooooooooo',
    'o1o..........o1o',
    'o1o..........o1o',
    'ooo..........ooo',
  ], woodTones({ 1: archPalette().woodDark[1], 2: archPalette().woodDark[2], 3: archPalette().woodDark[3], 4: archPalette().woodDark[4], 5: archPalette().woodDark[5] }));
}

/** A lectern: a post carrying a slanted desk and an open book. */
export function paintLectern(c, x, y) {
  const p = archPalette(), w = p.woodDark;
  footShadow(c, x, y, 4, 8, 14);
  R(c, '#22160e', x + 7, y + 7, 3, 7); R(c, w[3], x + 7, y + 7, 1, 7); R(c, w[2], x + 8, y + 7, 1, 7);
  R(c, '#22160e', x + 4, y + 13, 8, 2); R(c, w[4], x + 4, y + 13, 8, 1);
  R(c, '#22160e', x + 2, y + 2, 12, 6); R(c, w[4], x + 3, y + 3, 10, 4);
  R(c, '#ece2c8', x + 3, y + 2, 5, 4); R(c, '#e0d4b4', x + 8, y + 2, 5, 4); R(c, '#8a2e2a', x + 7, y + 2, 2, 5);
  for (const l of [3, 5]) { R(c, '#6a5a44', x + 4, y + l, 3, 1); R(c, '#6a5a44', x + 9, y + l, 3, 1); }
}

/** A clerk's desk: papers, an inkwell and quill, a drawer front. */
export function paintDesk(c, x, y) {
  footShadow(c, x, y, 1, 14, 13);
  grid(c, x, y, [
    '', '',
    'oooooooooooooooo',
    'o66666666666665o',
    'o55555555555554o',
    'o55555555555554o',
    'o44444444444443o',
    'oooooooooooooooo',
    'o2222o2222o2222o',
    'o2332o2332o2332o',
    'o2222o2222o2222o',
    'o1111o1111o1111o',
    'oooooooooooooooo',
  ], woodTones());
  R(c, '#ece2c8', x + 2, y + 3, 5, 3); R(c, '#d8caa0', x + 3, y + 4, 5, 2);
  for (const l of [4, 5]) R(c, '#6a5a44', x + 3, y + l, 3, 1);
  R(c, '#1a1a22', x + 10, y + 3, 2, 2); P(c, '#4a4a5a', x + 10, y + 3);
  P(c, '#efe6cc', x + 12, y + 2); P(c, '#efe6cc', x + 12, y + 1); P(c, '#c8b894', x + 11, y + 3);
}

/** A loom: the frame, the warp, a band of cloth coming off the beam. */
export function paintLoom(c, x, y, v) {
  const p = archPalette(), w = p.wood;
  const cloth = [RAMPS.madder, RAMPS.woad, RAMPS.undyed, RAMPS.green][v % 4];
  footShadow(c, x, y, 0, 15, 14);
  R(c, '#22160e', x, y + 1, 16, 13);
  R(c, w[4], x + 1, y + 2, 1, 11); R(c, w[2], x + 14, y + 2, 1, 11);
  R(c, w[5], x + 1, y + 2, 14, 1); R(c, w[3], x + 1, y + 3, 14, 1);
  for (let i = 2; i < 14; i++) R(c, (i & 1) ? '#d8ccb0' : '#b8ac90', x + i, y + 4, 1, 4);
  R(c, cloth[3], x + 2, y + 8, 12, 3); R(c, cloth[2], x + 2, y + 10, 12, 1);
  for (let i = 2; i < 14; i += 2) P(c, cloth[4], x + i, y + 8);
  R(c, w[4], x + 1, y + 11, 14, 1); R(c, w[2], x + 1, y + 12, 14, 1);
}

// ---------------------------------------------------------------------------
// 6d. HEDGES — clipped box and yew, the walls of a garden
// ---------------------------------------------------------------------------
//
// A hedge was a green square with a lit stripe on top, so a garden border was
// a row of green squares. A clipped hedge is a block: a lit top face you look
// down on and a darker face toward you, and a RUN of hedge is one block. `same`
// is the neighbour mask (1 N, 2 E, 4 S, 8 W): the top face runs on across every
// side with more hedge beyond it, and the edge, the face and the foot shadow are
// drawn only where the run ends.

export function paintHedge(c, x, y, v, same) {
  const f = RAMPS.foliage;   // 0 darkest .. 4 lightest
  const N = same & 1, E = same & 2, S = same & 4, W = same & 8;
  const top = N ? 0 : 2, faceTop = S ? 16 : 9, bottom = S ? 16 : 14;
  const x0 = W ? 0 : 1, x1 = E ? 16 : 15;
  if (!S) { R(c, 'rgba(16,24,10,0.30)', x + x0 + 1, y + 14, x1 - x0, 2); }
  // the top face: clipped leaves, lit, with a fine texture of lighter and darker sprigs
  R(c, f[3], x + x0, y + top, x1 - x0, faceTop - top);
  for (let yy = top; yy < faceTop; yy++) for (let xx = x0; xx < x1; xx++) {
    const h = hash(xx, yy, 0x4ed9 + (v & 3));
    if (h % 5 === 0) P(c, f[4], x + xx, y + yy);
    else if (h % 7 === 0) P(c, f[2], x + xx, y + yy);
  }
  // the face toward you: a step darker, sprigs catching light at its lip
  if (!S) {
    R(c, f[1], x + x0, y + faceTop, x1 - x0, bottom - faceTop);
    R(c, f[2], x + x0, y + faceTop, x1 - x0, 1);
    for (let xx = x0; xx < x1; xx++) {
      const h = hash(xx, 3, 0x4ed9);
      if (h % 3 === 0) P(c, f[3], x + xx, y + faceTop);
      if (h % 4 === 1) P(c, f[0], x + xx, y + faceTop + 2 + (h & 1));
    }
    R(c, f[0], x + x0, y + bottom - 1, x1 - x0, 1);
  }
  // the ends of the run: a lit arris where the light strikes (north, west),
  // a dark one on the shaded side (east)
  if (!N) R(c, f[4], x + x0, y + top, x1 - x0, 1);
  if (!W) { R(c, f[4], x + x0, y + top, 1, faceTop - top); if (!S) R(c, f[2], x + x0, y + faceTop, 1, bottom - faceTop); }
  if (!E) { R(c, f[1], x + x1 - 1, y + top, 1, faceTop - top); if (!S) R(c, f[0], x + x1 - 1, y + faceTop, 1, bottom - faceTop); }
  // round off the corners of a run
  if (!N && !W) cut(c, x, y, x0, top);
  if (!N && !E) cut(c, x, y, x1 - 1, top);
  if (!S && !W) cut(c, x, y, x0, bottom - 1);
  if (!S && !E) cut(c, x, y, x1 - 1, bottom - 1);
}

// ---------------------------------------------------------------------------
// 7. THE RESOLVE PASS
// ---------------------------------------------------------------------------
//
// Run once per built map (world/maps.js loadMap, after terrain's masses). Reads
// the three planes, never the flags, and writes only tile ids whose flags equal
// the ids they replace, so collision, doors and triggers are untouched.

const ROOF_MATS = { THATCH: 'thatch', SHINGLE: 'shingle', TILE: 'pantile', SLATE: 'slate' };
/** Wall key -> material name used by the members. */
export const WALL_MATS = Object.freeze({
  WATTLE_WALL: 'wattle', TIMBER_WALL: 'timber', PLASTER_WALL: 'lime',
  STONE_WALL: 'stone', BRICK_WALL: 'brick', LOG_WALL: 'log',
});
/** Member-name stem for each material. */
export const MAT_STEM = Object.freeze({ wattle: 'WATTLE', timber: 'TIMBER', lime: 'PLASTER', stone: 'STONE', brick: 'BRICK', log: 'LOG' });
const WARM = { wattle: 1, timber: 1, lime: 1, log: 1 };

/** Roof member key for a material prefix, row and end. */
export function roofMemberKey(pre, row, end) {
  if (row === 'R') return end === 'M' ? `${pre}_RIDGE` : `${pre}_RIDGE_${end}`;
  if (row === 'B') return `${pre}_${end}`;
  return `${pre}_${row === 'E' ? 'EAVE' : 'SOLO'}_${end}`;
}

var RT = null;
function tables(T, keyOf, groupOf) {
  if (RT && RT.T === T) return RT;
  const roof = new Map();          // id -> material prefix
  for (const pre of Object.keys(ROOF_MATS)) {
    for (const row of ['R', 'B', 'E', 'S']) for (const end of ['L', 'M', 'R']) {
      const id = T[roofMemberKey(pre, row, end)];
      if (id != null) roof.set(id, pre);
    }
  }
  if (T.SHINGLE_ROOF != null) roof.set(T.SHINGLE_ROOF, 'SHINGLE');
  if (T.TILE_ROOF != null) roof.set(T.TILE_ROOF, 'TILE');
  const wall = new Map();          // id -> material (body or member)
  for (const [k, m] of Object.entries(WALL_MATS)) {
    if (T[k] != null) wall.set(T[k], m);
    for (const e of ['L', 'R']) if (T[`${k}_${e}`] != null) wall.set(T[`${k}_${e}`], m);
  }
  // the stone courses a masonry facade stands on and is crowned with
  for (const k of ['WALL_TOP_SHADE', 'WALL_TOP_LIT', 'STONE_WALL_TOP']) if (T[k] != null) wall.set(T[k], 'stone');
  const opening = new Map();       // window / shutter / door-head ids -> kind
  const winKinds = [['WINDOW', 'window'], ['WINDOW_LIT', 'lit'], ['SHUTTER', 'shutter'], ['DOOR_HEAD', 'head']];
  for (const [k, kind] of winKinds) {
    if (T[k] != null) opening.set(T[k], kind);
    for (const st of Object.values(MAT_STEM)) if (T[`${k}_${st}`] != null) opening.set(T[`${k}_${st}`], kind);
  }
  const door = new Set(['DOOR_CLOSED', 'DOOR_OPEN', 'IRON_DOOR', 'DOOR_CLOSED_STONE', 'DOOR_OPEN_STONE'].map((k) => T[k]).filter((v) => v != null));
  RT = { T, roof, wall, opening, door, keyOf, groupOf };
  return RT;
}

/** Is this id something a house is built of (wall, opening, door, or roof copy on deco)? */
function structural(t, id) {
  if (!id) return false;
  if (t.wall.has(id) || t.opening.has(id) || t.door.has(id) || t.roof.has(id)) return true;
  const g = t.groupOf(id);
  return g === 'wall' || g === 'door' || g === 'roof';
}

/**
 * Bake architectural context into a map. T is tiles.js's name->id table;
 * keyOf/groupOf its queries. Returns the number of tiles changed.
 */
export function resolveArch(map, T, keyOf, groupOf) {
  if (!map || !map.deco || !T) return 0;
  const t = tables(T, keyOf, groupOf);
  const w = map.w, h = map.h;
  const over = map.over, deco = map.deco, ground = map.ground;
  const O = over ? Array.from(over) : null, D = Array.from(deco);
  const inb = (x, y) => x >= 0 && y >= 0 && x < w && y < h;
  let n = 0;
  const put = (plane, i, key) => { const id = T[key]; if (id != null && plane[i] !== id) { plane[i] = id; n++; } };

  // --- roofs --------------------------------------------------------------
  const roofy = (x, y) => {
    if (!inb(x, y)) return false;
    const i = y * w + x;
    const a = O ? O[i] : 0;
    return (a && (t.roof.has(a) || groupOf(a) === 'roof')) || t.roof.has(D[i]);
  };
  const member = (x, y, pre) => {
    const N = roofy(x, y - 1), S = roofy(x, y + 1), Wr = roofy(x - 1, y), Er = roofy(x + 1, y);
    const row = !N && !S ? 'S' : !N ? 'R' : !S ? 'E' : 'B';
    const end = !Wr && Er ? 'L' : (!Er && Wr ? 'R' : 'M');
    return roofMemberKey(pre, row, end);
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (O) { const pre = t.roof.get(O[i]); if (pre) put(over, i, member(x, y, pre)); }
    const pd = t.roof.get(D[i]); if (pd) put(deco, i, member(x, y, pd));
  }
  // chimney smoke, on the open tile above each stack
  if (over && T.CHIMNEY != null && T.SMOKE != null) {
    for (let y = 1; y < h; y++) for (let x = 0; x < w; x++) {
      if (over[y * w + x] === T.CHIMNEY && !over[(y - 1) * w + x]) { over[(y - 1) * w + x] = T.SMOKE; n++; }
    }
  }

  const interior = !!map.indoor && (map.biome === 'city' || map.biome === 'town');
  if (interior) return n + resolveInterior(map, t, T, D);

  // --- facades -------------------------------------------------------------
  // A facade tile is a wall under a roof: walk up the column through walls and
  // openings until a roof is met. The footing row (nothing structural below)
  // keeps its full width — it is the plinth the whole house stands on.
  const facade = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) {
    let underRoof = false;
    for (let y = 0; y < h; y++) {
      const i = y * w + x;
      if (roofy(x, y)) { underRoof = true; continue; }
      const id = D[i];
      if (underRoof && (t.wall.has(id) || t.opening.has(id) || t.door.has(id) || groupOf(id) === 'wall')) facade[i] = 1;
      else underRoof = false;
    }
  }
  const matAt = (x, y) => (inb(x, y) ? t.wall.get(D[y * w + x]) : null);
  const houseAt = (x, y) => inb(x, y) && (facade[y * w + x] === 1);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!facade[i]) continue;
    const id = D[i];
    const footing = !(inb(x, y + 1) && facade[i + w]);
    // corners
    const mat = t.wall.get(id);
    if (mat && !footing) {
      const Lx = !houseAt(x - 1, y), Rx = !houseAt(x + 1, y);
      const key = Object.keys(WALL_MATS).find((k) => WALL_MATS[k] === mat && T[k] === id);
      if (key && Lx !== Rx) put(deco, i, `${key}_${Lx ? 'L' : 'R'}`);
    }
  }
  // Openings take the material of the wall beside them — on a facade or not:
  // an open house's front is its footing course, a tower's windows sit in a
  // curtain, and neither is under a roof.
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    const kind = t.opening.get(D[i]);
    if (!kind || kind === 'head') continue;
    let m = null;
    for (let k = 1; k <= 4 && !m; k++) m = matAt(x - k, y) || matAt(x + k, y);
    if (!m) m = matAt(x, y - 1) || matAt(x, y + 1);
    if (!m) continue;
    const base = kind === 'lit' ? 'WINDOW_LIT' : kind === 'shutter' ? 'SHUTTER' : 'WINDOW';
    put(deco, i, m === 'wattle' ? base : `${base}_${MAT_STEM[m]}`);
  }
  // doors: a stone frame in masonry, and the head of the doorway in the wall above
  for (let y = 1; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    const id = D[i];
    if (!t.door.has(id)) continue;
    const above = D[i - w];
    const m = t.wall.get(above) || null;
    if (m === 'stone' || m === 'brick') {
      if (id === T.DOOR_CLOSED) put(deco, i, 'DOOR_CLOSED_STONE');
      else if (id === T.DOOR_OPEN) put(deco, i, 'DOOR_OPEN_STONE');
    }
    if (m && facade[i - w] && above === T[Object.keys(WALL_MATS).find((k) => WALL_MATS[k] === m)]) put(deco, i - w, `DOOR_HEAD_${MAT_STEM[m]}`);
  }
  // rugs laid outdoors (a pavilion, a market carpet) still want one border
  n += resolveRugs(map, T, ground);
  n += resolveHedges(map, T);
  return n;
}

function resolveHedges(map, T) {
  const id0 = T.HEDGE;
  if (id0 == null) return 0;
  const w = map.w, h = map.h, deco = map.deco;
  const fam = new Set([id0]);
  for (let m = 1; m < 16; m++) if (T[`HEDGE_${m}`] != null) fam.add(T[`HEDGE_${m}`]);
  const D = Array.from(deco);
  const is = (x, y) => x >= 0 && y >= 0 && x < w && y < h && fam.has(D[y * w + x]);
  let n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!fam.has(D[y * w + x])) continue;
    const m = (is(x, y - 1) ? 1 : 0) | (is(x + 1, y) ? 2 : 0) | (is(x, y + 1) ? 4 : 0) | (is(x - 1, y) ? 8 : 0);
    const id = m === 0 ? id0 : T[`HEDGE_${m}`];
    if (id != null && deco[y * w + x] !== id) { deco[y * w + x] = id; n++; }
  }
  return n;
}

function resolveRugs(map, T, ground) {
  const w = map.w, h = map.h;
  let n = 0;
  for (const [base, style] of [['CARPET_RED', 'RED'], ['CARPET_BLUE', 'BLUE']]) {
    const id0 = T[base];
    if (id0 == null) continue;
    const fam = new Set([id0]);
    for (let m = 0; m < 15; m++) if (T[`${base}_${m}`] != null) fam.add(T[`${base}_${m}`]);
    const G = Array.from(ground);
    const is = (x, y) => x >= 0 && y >= 0 && x < w && y < h && fam.has(G[y * w + x]);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!fam.has(G[y * w + x])) continue;
      const m = (is(x, y - 1) ? 1 : 0) | (is(x + 1, y) ? 2 : 0) | (is(x, y + 1) ? 4 : 0) | (is(x - 1, y) ? 8 : 0);
      const id = m === 15 ? id0 : T[`${base}_${m}`];
      if (id != null && ground[y * w + x] !== id) { ground[y * w + x] = id; n++; }
    }
    void style;
  }
  return n;
}

function resolveInterior(map, t, T, D) {
  const w = map.w, h = map.h, deco = map.deco;
  let n = 0;
  const inb = (x, y) => x >= 0 && y >= 0 && x < w && y < h;
  // A pillar is part of the wall only where it is a post in the ring (it
  // touches wall); a free-standing column in a nave stays a column.
  const ringPost = (x, y) => D[y * w + x] === T.PILLAR
    && [[0, -1], [1, 0], [0, 1], [-1, 0]].some(([dx, dy]) => inb(x + dx, y + dy) && t.wall.has(D[(y + dy) * w + x + dx]));
  const loose = (x, y) => D[y * w + x] === T.PILLAR && !ringPost(x, y);
  const hard = (x, y) => !inb(x, y) || (structural(t, D[y * w + x]) && !loose(x, y));
  const matOf = (id, x, y) => {
    const m = t.wall.get(id);
    if (m) return m;
    if ((id === T.PILLAR && ringPost(x, y)) || id === T.WALL_TOP_SHADE || id === T.WALL_TOP_LIT || id === T.STONE_WALL_TOP) return 'stone';
    return null;
  };
  // the room's own material: whatever most of its wall ring is built of
  const count = {};
  for (let i = 0; i < D.length; i++) { const m = t.wall.get(D[i]); if (m) count[m] = (count[m] || 0) + 1; }
  const main = Object.keys(count).sort((a, b) => count[b] - count[a])[0] || 'wattle';
  const put = (i, key) => { const id = T[key]; if (id != null && deco[i] !== id) { deco[i] = id; n++; } };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, id = D[i];
    const isDoor = t.door.has(id);
    const kind = t.opening.get(id);
    let mat = matOf(id, x, y);
    if (!mat && !isDoor && !kind) continue;
    // a footing course inside is part of the wall it carries
    if (mat === 'stone' && main !== 'stone' && main !== 'brick' && (id === T.STONE_WALL || id === T.PILLAR || id === T.WALL_TOP_SHADE)) mat = main;
    if (!mat) mat = main;
    const warm = !!WARM[mat];
    const face = !hard(x, y + 1);
    if (isDoor) {
      if (y === h - 1) put(i, warm ? 'IEXIT_WARM' : 'IEXIT_COOL');
      else if (face) put(i, `IDOOR_${MAT_STEM[mat]}`);
      else put(i, warm ? 'IDOORWAY_WARM' : 'IDOORWAY_COOL');
      continue;
    }
    if (kind === 'window' || kind === 'lit' || kind === 'shutter') {
      if (face) put(i, `IWINDOW_${MAT_STEM[mat]}`);
      else put(i, `ITOP_${warm ? 'W' : 'C'}${openMask(hard, x, y)}`);
      continue;
    }
    if (face) put(i, `IWALL_${MAT_STEM[mat]}`);
    else put(i, `ITOP_${warm ? 'W' : 'C'}${openMask(hard, x, y)}`);
  }
  n += resolveRugs(map, T, map.ground);
  return n;
}

function openMask(hard, x, y) { return (hard(x, y - 1) ? 0 : 1) | (hard(x + 1, y) ? 0 : 2) | (hard(x - 1, y) ? 0 : 4); }

// ---------------------------------------------------------------------------
// 8. REGISTRATION — the members, appended to tiles.js's id space
// ---------------------------------------------------------------------------
//
// Called ONCE, at the very end of tiles.js buildTiles(), so every id here sits
// after every id that existed before it (ids are append-only: authored maps
// store them raw). Add new members at the END of this function, never between.

/** Option sets shared by tiles.js's own defs of the authored keys. */
export const ROOF_OPTS = Object.freeze({ layer: 'over', group: 'roof', biomes: ['city'], variants: 32, edgeVariant: true });
export const WALL_OPTS = Object.freeze({ layer: 'deco', group: 'wall', biomes: ['city'], variants: 64, edgeVariant: true });

const STEM_KEY = Object.freeze({ wattle: 'WATTLE_WALL', timber: 'TIMBER_WALL', lime: 'PLASTER_WALL', stone: 'STONE_WALL', brick: 'BRICK_WALL', log: 'LOG_WALL' });
const ROOF_LABEL = { THATCH: 'Thatch Roof', SHINGLE: 'Shingle Roof', TILE: 'Tile Roof', SLATE: 'Slate Roof' };

/**
 * Register every member. `def` is tiles.js's registrar, `F` its flag bits and
 * `tileOf(key)` its definition lookup, which the masonry members use to paint
 * the very wall they sit in (same edge bits, so the coursing runs through).
 */
export function registerArchTiles(def, F, tileOf) {
  const { SOLID, DOOR, TRIGGER } = F;
  for (const pre of Object.keys(ROOF_MATS)) {
    const mat = ROOF_MATS[pre];
    for (const [row, end] of [['R', 'L'], ['R', 'R'], ['E', 'L'], ['E', 'M'], ['E', 'R'], ['S', 'L'], ['S', 'M'], ['S', 'R']]) {
      def(roofMemberKey(pre, row, end), ROOF_LABEL[pre], SOLID, ROOF_OPTS, (c, x, y, v, vi) => paintRoof(c, x, y, v, vi, mat, row, end));
    }
  }
  def('SMOKE', 'Chimney Smoke', 0, { layer: 'over', group: 'fx', biomes: [], variants: 1, animFrames: 4, fps: 3 }, (c, x, y, v, vi, f) => paintSmoke(c, x, y, v, f));
  def('TIMBER_WALL', 'Timber Wall', SOLID, WALL_OPTS, paintTimber);
  def('PLASTER_WALL', 'Plaster Wall', SOLID, WALL_OPTS, paintLime);

  const body = (mat) => {
    if (mat === 'wattle') return paintWattle;
    if (mat === 'timber') return paintTimber;
    if (mat === 'lime') return paintLime;
    const d = tileOf(STEM_KEY[mat]);
    return (c, x, y, v, vi) => { if (d) d.draw(c, x, y, v, vi & 15, 0); };
  };
  for (const mat of Object.keys(STEM_KEY)) {
    const key = STEM_KEY[mat], stem = MAT_STEM[mat], paint = body(mat);
    const label = tileOf(key) ? tileOf(key).name : 'Wall';
    for (const end of ['L', 'R']) {
      def(`${key}_${end}`, label, SOLID, WALL_OPTS, (c, x, y, v, vi) => { paint(c, x, y, v, vi); paintWallEnd(c, x, y, v, vi, mat, end); });
    }
    if (mat !== 'wattle') {
      def(`WINDOW_${stem}`, 'Window', SOLID, WALL_OPTS, (c, x, y, v, vi) => { paint(c, x, y, v, vi); paintWindow(c, x, y, v, vi, mat, false, 0); });
      def(`WINDOW_LIT_${stem}`, 'Lit Window', SOLID, { ...WALL_OPTS, animFrames: 3, fps: 2 }, (c, x, y, v, vi, f) => { paint(c, x, y, v, vi); paintWindow(c, x, y, v, vi, mat, true, f); });
      def(`SHUTTER_${stem}`, 'Shutters', SOLID, WALL_OPTS, (c, x, y, v, vi) => { paint(c, x, y, v, vi); paintShutters(c, x, y, v, vi, mat); });
    }
    def(`DOOR_HEAD_${stem}`, label, SOLID, WALL_OPTS, (c, x, y, v, vi) => { paint(c, x, y, v, vi); paintDoorHead(c, x, y, v, vi, mat); });
  }
  const DOOR_OPTS = { layer: 'deco', group: 'door', biomes: ['city'], variants: 12 };
  def('DOOR_CLOSED_STONE', 'Door', SOLID | DOOR | TRIGGER, DOOR_OPTS, (c, x, y, v, vi) => paintDoor(c, x, y, v, vi, 'closed', 'stone'));
  def('DOOR_OPEN_STONE', 'Open Door', DOOR | TRIGGER, DOOR_OPTS, (c, x, y, v, vi) => paintDoor(c, x, y, v, vi, 'open', 'stone'));

  // interiors
  const IN = { layer: 'deco', group: 'wall', biomes: ['city'], variants: 128, edgeVariant: true };
  for (const mat of Object.keys(STEM_KEY)) {
    const stem = MAT_STEM[mat];
    def(`IWALL_${stem}`, 'Wall', SOLID, IN, (c, x, y, v, vi) => paintIWall(c, x, y, v, vi, mat));
    def(`IWINDOW_${stem}`, 'Window', SOLID, { ...IN, variants: 16 }, (c, x, y, v, vi) => paintIWindow(c, x, y, v, vi, mat));
    def(`IDOOR_${stem}`, 'Door', SOLID | DOOR | TRIGGER, { ...IN, group: 'door', variants: 16 }, (c, x, y, v, vi) => paintIDoor(c, x, y, v, vi, mat));
  }
  for (let m = 0; m < 8; m++) {
    def(`ITOP_W${m}`, 'Wall', SOLID, { layer: 'deco', group: 'wall', biomes: ['city'], variants: 4 }, (c, x, y, v) => paintITop(c, x, y, v, m, true));
    def(`ITOP_C${m}`, 'Wall', SOLID, { layer: 'deco', group: 'wall', biomes: ['city'], variants: 4 }, (c, x, y, v) => paintITop(c, x, y, v, m, false));
  }
  def('IDOORWAY_WARM', 'Doorway', SOLID | DOOR | TRIGGER, { layer: 'deco', group: 'door', biomes: ['city'], variants: 6 }, (c, x, y, v) => paintIDoorway(c, x, y, v, true));
  def('IDOORWAY_COOL', 'Doorway', SOLID | DOOR | TRIGGER, { layer: 'deco', group: 'door', biomes: ['city'], variants: 6 }, (c, x, y, v) => paintIDoorway(c, x, y, v, false));
  def('IEXIT_WARM', 'Door', SOLID | DOOR | TRIGGER, { layer: 'deco', group: 'door', biomes: ['city'], variants: 1 }, (c, x, y, v) => paintIExit(c, x, y, v, true));
  def('IEXIT_COOL', 'Door', SOLID | DOOR | TRIGGER, { layer: 'deco', group: 'door', biomes: ['city'], variants: 1 }, (c, x, y, v) => paintIExit(c, x, y, v, false));

  // rugs: one member per neighbour mask; mask 15 is the authored key itself
  for (const [base, style] of [['CARPET_RED', 'red'], ['CARPET_BLUE', 'blue']]) {
    for (let m = 0; m < 15; m++) def(`${base}_${m}`, style === 'red' ? 'Red Carpet' : 'Blue Carpet', 0, { group: 'floor', biomes: [], variants: 1 }, (c, x, y, v) => paintRug(c, x, y, v, m, style));
  }

  // the town notice board (world/sites.js stages the director's board on it)
  def('NOTICE_BOARD', 'Notice Board', SOLID, { layer: 'deco', group: 'prop', biomes: ['city'], variants: 2 }, (c, x, y, v) => paintNoticeBoard(c, x, y, v));

  // towers: SPIRE / TURRET blocks, tip row (r0) non-solid over the tile north of the tower
  for (const [pre, mat] of [['SPIRE', 'slate'], ['SPIRE_TILE', 'pantile']]) {
    for (const [kind, cols] of [['', 3], ['TURRET', 2]]) {
      const key = kind ? pre.replace('SPIRE', 'TURRET') : pre;
      for (let r = 0; r < 3; r++) for (let q = 0; q < cols; q++) {
        def(`${key}_${r}${q}`, kind ? 'Turret' : 'Spire', r === 0 ? 0 : SOLID, { layer: 'over', group: 'roof', biomes: ['city'], variants: 1 },
          (c, x, y) => paintPyramid(c, x, y, q, r, cols, 3, mat));
      }
    }
  }
  def('WINDOW_STAINED', 'Stained Glass', SOLID, WALL_OPTS, (c, x, y, v, vi) => { const d = tileOf('STONE_WALL'); if (d) d.draw(c, x, y, v, vi & 15, 0); paintStained(c, x, y, v, false); });
  def('WINDOW_STAINED_LIT', 'Stained Glass', SOLID, WALL_OPTS, (c, x, y, v, vi) => { const d = tileOf('STONE_WALL'); if (d) d.draw(c, x, y, v, vi & 15, 0); paintStained(c, x, y, v, true); });
  def('WINDOW_ROSE', 'Rose Window', SOLID, WALL_OPTS, (c, x, y, v, vi) => { const d = tileOf('STONE_WALL'); if (d) d.draw(c, x, y, v, vi & 15, 0); paintRose(c, x, y, v, false); });
  def('WINDOW_ROSE_LIT', 'Rose Window', SOLID, WALL_OPTS, (c, x, y, v, vi) => { const d = tileOf('STONE_WALL'); if (d) d.draw(c, x, y, v, vi & 15, 0); paintRose(c, x, y, v, true); });
  for (const part of ['T', 'B']) for (const lit of [false, true]) {
    def(`WINDOW_STAINED${lit ? '_LIT' : ''}_${part}`, 'Stained Glass', SOLID, WALL_OPTS, (c, x, y, v, vi) => { const d = tileOf('STONE_WALL'); if (d) d.draw(c, x, y, v, vi & 15, 0); paintStained(c, x, y, v, lit, part); });
  }
  def('IWINDOW_STAINED', 'Stained Glass', SOLID, { ...IN, variants: 16 }, (c, x, y, v, vi) => paintIStained(c, x, y, v, vi));
  for (const trade of TRADES) def(`SHOP_SIGN_${trade}`, 'Shop Sign', 0, { layer: 'over', group: 'prop', biomes: ['city'], variants: 1 }, (c, x, y, v) => paintTradeSign(c, x, y, v, trade));
  def('BARN_DOOR', 'Barn Doors', SOLID, { layer: 'deco', group: 'wall', biomes: ['city', 'plains'], variants: 1 }, (c, x, y, v) => paintBarnDoor(c, x, y, v));
  def('STABLE_DOOR', 'Stable Door', SOLID, { layer: 'deco', group: 'wall', biomes: ['city', 'plains'], variants: 2 }, (c, x, y, v, vi) => paintStableDoor(c, x, y, vi));
  for (const side of ['L', 'M', 'R']) def(`SHED_POST_${side}`, 'Post', SOLID, { layer: 'deco', group: 'prop', biomes: ['city'], variants: 1 }, (c, x, y, v) => paintShedPost(c, x, y, v, side));
  def('SHED_WALL', 'Plank Wall', SOLID, WALL_OPTS, (c, x, y, v, vi) => paintShedWall(c, x, y, v, vi));
  def('BUTTRESS', 'Buttress', SOLID, WALL_OPTS, (c, x, y, v, vi) => { const d = tileOf('STONE_WALL'); if (d) d.draw(c, x, y, v, vi & 15, 0); paintButtress(c, x, y, v, vi); });
  for (const pre of Object.keys(ROOF_MATS)) {
    const mat = ROOF_MATS[pre];
    def(`DORMER_${pre}`, 'Dormer', SOLID, ROOF_OPTS, (c, x, y, v, vi) => paintDormer(c, x, y, v, vi, mat, false));
    def(`DORMER_${pre}_LIT`, 'Dormer', SOLID, ROOF_OPTS, (c, x, y, v, vi) => paintDormer(c, x, y, v, vi, mat, true));
  }
  // furniture a room is furnished for its trade with
  const FURN = { layer: 'deco', group: 'furniture', biomes: ['city'] };
  def('KEG', 'Keg', SOLID, { ...FURN, variants: 1 }, (c, x, y, v) => paintKeg(c, x, y, v));
  def('WEAPON_RACK', 'Weapon Rack', SOLID, { ...FURN, variants: 1 }, (c, x, y) => paintWeaponRack(c, x, y));
  def('ARMOR_STAND', 'Armour Stand', SOLID, { ...FURN, variants: 1 }, (c, x, y) => paintArmorStand(c, x, y));
  def('PEW', 'Pew', SOLID, { ...FURN, variants: 1 }, (c, x, y) => paintPew(c, x, y));
  def('LECTERN', 'Lectern', SOLID, { ...FURN, variants: 1 }, (c, x, y) => paintLectern(c, x, y));
  def('DESK', 'Desk', SOLID, { ...FURN, variants: 1 }, (c, x, y) => paintDesk(c, x, y));
  def('LOOM', 'Loom', SOLID, { ...FURN, variants: 4 }, (c, x, y, v, vi) => paintLoom(c, x, y, vi));
  // hedge runs: one member per neighbour mask; mask 0 is the authored key
  for (let m = 1; m < 16; m++) def(`HEDGE_${m}`, 'Hedge', SOLID, { layer: 'deco', group: 'plant', biomes: ['city', 'plains'], variants: 2 }, (c, x, y, v, vi) => paintHedge(c, x, y, vi, m));
  // Append new keys so every previously saved tile id keeps its meaning.
  def('BATTLEMENT', 'Battlements', SOLID, { ...WALL_OPTS, variants: 16 }, (c, x, y, v, vi) => paintBattlement(c, x, y, v, vi));
  for (let by = 0; by < 5; by++) for (let bx = 0; bx < 5; bx++) {
    def(`MILL_SAIL_${by}${bx}`, 'Windmill', 0, { layer: 'over', group: 'canvas', biomes: ['plains'], variants: 1, animFrames: SAIL_FRAMES, fps: 5 },
      (c, x, y, v, vi, f) => paintSails(c, x, y, bx, by, f));
  }
  def('GATE_PIER_L', 'Gate Pier', SOLID, { ...WALL_OPTS, variants: 16 }, (c, x, y, v, vi) => paintGatePier(c, x, y, v, vi, 'L'));
  def('GATE_PIER_R', 'Gate Pier', SOLID, { ...WALL_OPTS, variants: 16 }, (c, x, y, v, vi) => paintGatePier(c, x, y, v, vi, 'R'));
  def('GATEWAY', 'Gateway', DOOR | TRIGGER, { layer: 'deco', group: 'fence', biomes: ['city'], variants: 2 }, (c, x, y, v, vi) => paintGateway(c, x, y, vi));
  for (const part of ['L', 'M', 'R']) def(`GATE_ARCH_${part}`, 'Gate Arch', 0, { layer: 'over', group: 'canvas', biomes: ['city'], variants: 1 }, (c, x, y, v) => paintGateArch(c, x, y, v, part));
}
