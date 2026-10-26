// render/spritedata_chars.js -- the humanoid character sprite art: every composable
// layer (body, ears, hair, beard, horns, tail, outfit, cloak, helm, weapon, shield),
// a gallery of ready-made Phandalin townsfolk, and the ambient barnyard creatures.
//
// AUTHORING CONVENTION (the actor compositor in render/actor.js depends on it):
//   Humanoids are 16 wide x 24 tall, feet on row 23.  Every humanoid layer defines
//   the SAME 16 frame names so layers stack 1:1 --
//     down-0..down-3, left-0..left-3, right-0..right-3, up-0..up-3
//   Frame 0 = contact/idle, 1 = left foot forward, 2 = right foot forward,
//   3 = a second idle with a 1px arm shift so standing characters breathe.
//   The walk cycle plays 0,1,0,2 (see walkFrame() in sprites.js).
//
//   Row budget, identical for every body type so headgear always lines up:
//     rows 0-1   headroom for helms, horns and tall hair
//     rows 2-9   head   (outline at cols 4 and 11, face interior cols 5-10)
//     rows 10-17 torso and arms
//     rows 18-23 legs, feet on row 23
//   Light source is upper-left: _L shades sit top-left of a form, _D bottom-right.
//   Interiors are never outlined -- only the silhouette carries K.
//
//   Down-facing frames show two 1px eyes (cols 6 and 9) with a skin gap and a 1px
//   SKIN_D nose shadow; side frames show one eye and a nose bump; up-facing frames
//   show no face at all. Left-facing grids are authored by hand; right-facing grids
//   are mirrored from them so a layer only ever has to be drawn three times.
//
//   Column contract for clothing, so an outfit never paints over an arm outline:
//     rows 10-13  sleeves/shoulders span cols 3-12 with K at 3 and 12
//     rows 14-16  torso only, cols 5-10, NO outline (the body owns cols 3-4/11-12)
//     rows 17+    hems span cols 4-11 with K at 4 and 11 (the arms are gone by then)

import { defineSprite, shadeHex } from '../src/render/sprites.js';

// --- palette --------------------------------------------------------------
// Every humanoid layer shares this key map so layers can be flattened together.
const PAL = {
  K: 'OUTLINE',
  s: 'SKIN', d: 'SKIN_D', l: 'SKIN_L', e: 'EYE',
  h: 'HAIR', H: 'HAIR_D', j: 'HAIR_L',
  a: 'MAIN', A: 'MAIN_D', q: 'MAIN_L',
  b: 'ALT', B: 'ALT_D',
  m: 'METAL', M: 'METAL_D', n: 'METAL_L',
  t: 'TRIM', T: 'TRIM_D',
  L: 'LEATHER', P: 'LEATHER_D',
  c: 'CLOTH', C: 'CLOTH_D',
  x: 'ACCENT', X: 'ACCENT_D',
  o: 'HORN', O: 'HORN_D',
  W: 'WHITE', Z: 'BLACK',
};

const W = 16, H = 24;
const DIRS4 = ['down', 'left', 'right', 'up'];

/** The 16 canonical frame names, in a stable order. */
export const FRAME_NAMES = [];
for (const d of DIRS4) for (let i = 0; i < 4; i++) FRAME_NAMES.push(`${d}-${i}`);

/** Named animations every humanoid layer carries, so callers can use animFrame(). */
const ANIMS = {
  walkDown: { frames: ['down-0', 'down-1', 'down-0', 'down-2'], fps: 8 },
  walkLeft: { frames: ['left-0', 'left-1', 'left-0', 'left-2'], fps: 8 },
  walkRight: { frames: ['right-0', 'right-1', 'right-0', 'right-2'], fps: 8 },
  walkUp: { frames: ['up-0', 'up-1', 'up-0', 'up-2'], fps: 8 },
  idleDown: { frames: ['down-0', 'down-0', 'down-3', 'down-3'], fps: 2 },
  idleLeft: { frames: ['left-0', 'left-0', 'left-3', 'left-3'], fps: 2 },
  idleRight: { frames: ['right-0', 'right-0', 'right-3', 'right-3'], fps: 2 },
  idleUp: { frames: ['up-0', 'up-0', 'up-3', 'up-3'], fps: 2 },
};

const BLANK = '.'.repeat(W);

// --- grid helpers ---------------------------------------------------------

/** Pad a hand-authored grid out to exactly h rows of w chars. */
function norm(rows, w = W, h = H) {
  const out = [];
  for (let y = 0; y < h; y++) {
    let r = rows && rows[y] != null ? String(rows[y]) : '';
    if (r.length < w) r += '.'.repeat(w - r.length);
    else if (r.length > w) r = r.slice(0, w);
    out.push(r);
  }
  return out;
}

/**
 * Place authored rows starting at row `y0`, padding transparent above and below.
 * Lets a hair or helm layer be written as just the eight rows it actually covers.
 */
function at(y0, rows, w = W, h = H) {
  const out = [];
  for (let i = 0; i < y0; i++) out.push('.'.repeat(w));
  for (const r of rows || []) {
    let s = String(r);
    if (s.length < w) s += '.'.repeat(w - s.length);
    out.push(s.slice(0, w));
  }
  while (out.length < h) out.push('.'.repeat(w));
  return out.slice(0, h);
}

/** Flip a grid horizontally -- how every right-facing frame is derived. */
function mirror(rows, w = W) {
  return norm(rows, w, rows.length).map((r) => r.split('').reverse().join(''));
}

/** Copy `rows`, overwriting the rows named in `p` ({ 20:'....KLLKKLLK....', ... }). */
function patch(rows, p) {
  const out = rows.slice();
  if (!p) return out;
  for (const k of Object.keys(p)) out[Number(k)] = norm([p[k]], W, 1)[0];
  return out;
}

/** Shift a grid vertically by n rows (positive = down). Used for the weapon bob. */
function shiftY(rows, n) {
  if (!n) return rows.slice();
  const out = [];
  for (let y = 0; y < H; y++) {
    const src = y - n;
    out.push(src >= 0 && src < H ? rows[src] : BLANK);
  }
  return out;
}

/** Mirror a patch set, swapping frames 1 and 2 so the lead foot stays the lead foot. */
function mirrorAnim(a) {
  if (!a) return null;
  const flipOne = (o) => {
    if (!o) return null;
    const r = {};
    for (const k of Object.keys(o)) r[k] = norm([o[k]], W, 1)[0].split('').reverse().join('');
    return r;
  };
  return { 1: flipOne(a[2]) || flipOne(a[1]), 2: flipOne(a[1]) || flipOne(a[2]), 3: flipOne(a[3]) };
}

/**
 * Build all 16 frames from three authored directions.
 *   dirs: { down:[rows], left:[rows], up:[rows], right?:[rows] }
 *   anim: { down:{1:{row:str},2:{},3:{}}, left:{...}, up:{...} }
 * Anything omitted falls back to the `down` grid, so a partial layer never throws.
 */
function walkSet(dirs, anim = {}) {
  const down = norm(dirs.down || []);
  const left = norm(dirs.left || dirs.down || []);
  const up = norm(dirs.up || dirs.down || []);
  const right = dirs.right ? norm(dirs.right) : mirror(left);
  const grids = { down, left, right, up };
  const anims = {
    down: anim.down || null,
    left: anim.left || null,
    right: anim.right !== undefined ? anim.right : mirrorAnim(anim.left),
    up: anim.up !== undefined ? anim.up : (anim.down || null),
  };
  const frames = {};
  for (const d of DIRS4) {
    const base = grids[d];
    const a = anims[d] || {};
    frames[`${d}-0`] = base;
    frames[`${d}-1`] = a[1] ? patch(base, a[1]) : base;
    frames[`${d}-2`] = a[2] ? patch(base, a[2]) : base;
    frames[`${d}-3`] = a[3] ? patch(base, a[3]) : base;
  }
  return frames;
}

/** Overlay ASCII grids -- later layers win on any non-transparent pixel. */
function flatten(grids, w = W, h = H) {
  const out = [];
  for (let y = 0; y < h; y++) {
    let row = '';
    for (let x = 0; x < w; x++) {
      let ch = '.';
      for (let i = 0; i < grids.length; i++) {
        const g = grids[i];
        if (!g) continue;
        const r = g[y];
        if (!r) continue;
        const c = r[x];
        if (c && c !== '.' && c !== ' ') ch = c;
      }
      row += ch;
    }
    out.push(row);
  }
  return out;
}

// --- registration ---------------------------------------------------------
// Grids are built at module load (they are only string maths); the defineSprite
// calls are deferred to registerCharacterSprites() so the boot sequence controls
// when the raster cache starts filling.

const ART = Object.create(null);   // layer name -> { frameName: rows } (for the NPC baker)
const PENDING = [];                // [name, def] pairs waiting for registration

function define(name, def) { PENDING.push(['old-' + name, def]); return name; }

/** Register a humanoid layer and remember its grids for the NPC baker. */
function layer(name, dirs, anim, paletteExtra) {
  const frames = walkSet(dirs, anim);
  ART[name] = frames;
  return define(name, {
    w: W, h: H,
    palette: paletteExtra ? { ...PAL, ...paletteExtra } : PAL,
    frames,
    anims: ANIMS,
  });
}

/** An empty 16x24 layer -- 'hair-bald', 'wep-none', 'cloak-none', etc. */
function emptyLayer(name) {
  return layer(name, { down: [], left: [], up: [] });
}

/**
 * Held gear (weapons, shields). One authored grid is placed on the viewer's side
 * that matches the character's hand, and the other three directions fall out of
 * it: `down` keeps the grid, `left`/`up` mirror it, and walkSet mirrors `left`
 * back for `right`. Frames 1/2 bob the gear a pixel so it swings with the stride.
 */
function gear(name, grid) {
  const g = norm(grid);
  const m = mirror(g);
  const bob = (base) => ({ 1: rowsOf(shiftY(base, 1)), 2: rowsOf(shiftY(base, -1)), 3: rowsOf(shiftY(base, 1)) });
  return layer(name, { down: g, left: m, up: m }, {
    down: bob(g), left: bob(m), right: bob(g), up: bob(m),
  });
}

/** Turn a whole grid into a patch object so `patch()` can swap every row at once. */
function rowsOf(rows) {
  const o = {};
  for (let y = 0; y < H; y++) o[y] = rows[y];
  return o;
}

// ---------------------------------------------------------------------------
// SHARED LEG ANIMATION
// The legs live on the body layer, so an outfit only ever has to move its hem
// and sleeves. Every body type reuses these patches.
// ---------------------------------------------------------------------------

// Front / back view: one leg lifts clear of the ground, the other stays planted.
const LEGS_F = {
  1: {
    21: '....KLLKKLLK....',
    22: '....KLLKKPPK....',
    23: '....KPPK........',
  },
  2: {
    21: '....KLLKKLLK....',
    22: '....KPPKKLLK....',
    23: '........KPPK....',
  },
};

// Side view: a two-pixel stride, near leg reaching forward, far leg trailing back.
const LEGS_S = {
  1: {
    21: '...KLLLKKLK.....',
    22: '...KLLLKKLK.....',
    23: '...KPPPKKPK.....',
  },
  2: {
    21: '....KLKKLLLK....',
    22: '....KLKKLLLK....',
    23: '....KPKKPPPK....',
  },
};

// The idle "breath": frame 3 drops the shoulders and hands one pixel.
const BREATHE_F = { 3: { 11: '...KccccccccK...', 17: '...KsccccccdK...' } };
const BREATHE_S = { 3: { 11: '....KccccccK....', 17: '...KsccccccK....' } };
const BREATHE_SM = { 3: { 11: '....KccccccK....', 16: '....KsccccdK....' } };


// ===========================================================================
// BODIES -- skin, face and underclothes. The legs and their walk cycle live here.
// Every body keeps the head on rows 2-9 (cols 4-11) so hair, helms and horns
// line up whatever the build; the silhouette below the neck is what changes.
// ===========================================================================

// --- body-normal: the reference build, shoulders cols 3-12 -----------------
const BODY_N_DOWN = [
  '................',
  '................',
  '.....KKKKKK.....',
  '....KllsssdK....',
  '....KlssssdK....',
  '....KlssssdK....',
  '....KsessedK....',
  '....KssddsdK....',
  '....KsssssdK....',
  '.....KssddK.....',
  '...KccccccccK...',
  '...KsccccccsK...',
  '...KsccccccdK...',
  '...KsccccccdK...',
  '...KsCCCCCCdK...',
  '...KsccccccdK...',
  '...KlccccccdK...',
  '....KccccccK....',
  '....KLLLLLLK....',
  '....KLLLLLLK....',
  '....KLLKKLLK....',
  '....KLLKKLLK....',
  '....KLLKKLLK....',
  '....KPPKKPPK....',
];

const BODY_N_LEFT = [
  '................',
  '................',
  '.....KKKKKK.....',
  '....KllsssdK....',
  '....KlssssdK....',
  '....KlssssdK....',
  '...KsesssddK....',
  '...KKsssdddK....',
  '....KsssdddK....',
  '.....KssddK.....',
  '....KccccccK....',
  '....KccccccK....',
  '...KsccccccK....',
  '...KsccccccK....',
  '...KsCCCCCcK....',
  '...KsccccccK....',
  '...KlccccccK....',
  '....KccccccK....',
  '....KLLLLLLK....',
  '....KLLLLLLK....',
  '....KLLKKLLK....',
  '....KLLKKLLK....',
  '....KLLKKLLK....',
  '....KPPKKPPK....',
];

const BODY_N_UP = [
  '................',
  '................',
  '.....KKKKKK.....',
  '....KssssssK....',
  '....KssssssK....',
  '....KssssssK....',
  '....KsssssdK....',
  '....KsssdddK....',
  '....KssddddK....',
  '.....KssddK.....',
  '...KccccccccK...',
  '...KsccccccsK...',
  '...KsccccccdK...',
  '...KsccccccdK...',
  '...KsCCCCCCdK...',
  '...KsccccccdK...',
  '...KsccccccdK...',
  '....KccccccK....',
  '....KLLLLLLK....',
  '....KLLLLLLK....',
  '....KLLKKLLK....',
  '....KLLKKLLK....',
  '....KLLKKLLK....',
  '....KPPKKPPK....',
];

layer('body-normal', { down: BODY_N_DOWN, left: BODY_N_LEFT, up: BODY_N_UP }, {
  down: { ...LEGS_F, ...BREATHE_F },
  left: { ...LEGS_S, ...BREATHE_S },
  up: { ...LEGS_F, ...BREATHE_F },
});

// --- body-slim: one pixel narrower through the shoulders and chest ---------
const SLIM_TORSO_D = [
  '....KccccccK....',
  '....KsccccsK....',
  '....KsccccdK....',
  '....KsccccdK....',
  '....KsCCCCdK....',
  '....KsccccdK....',
  '....KlccccdK....',
  '....KccccccK....',
];
const SLIM_TORSO_S = [
  '....KccccccK....',
  '....KccccccK....',
  '...KscccccK.....',
  '...KscccccK.....',
  '...KsCCCCcK.....',
  '...KscccccK.....',
  '...KlcccccK.....',
  '....KccccccK....',
];

layer('body-slim',
  {
    down: BODY_N_DOWN.slice(0, 10).concat(SLIM_TORSO_D, BODY_N_DOWN.slice(18)),
    left: BODY_N_LEFT.slice(0, 10).concat(SLIM_TORSO_S, BODY_N_LEFT.slice(18)),
    up: BODY_N_UP.slice(0, 10).concat(SLIM_TORSO_D, BODY_N_UP.slice(18)),
  },
  {
    down: { ...LEGS_F, 3: { 11: '....KccccccK....', 17: '....KsccccdK....' } },
    left: { ...LEGS_S, 3: { 11: '....KccccccK....', 17: '...KscccccK.....' } },
    up: { ...LEGS_F, 3: { 11: '....KccccccK....', 17: '....KsccccdK....' } },
  });

// --- body-broad: two pixels wider at the shoulders (orc, half-orc, fighter) --
const BROAD_TORSO_D = [
  '..KKccccccccKK..',
  '..KsccccccccsK..',
  '..KsccccccccdK..',
  '..KsccccccccdK..',
  '..KsCCCCCCCCdK..',
  '..KsccccccccdK..',
  '..KlccccccccdK..',
  '...KccccccccK...',
];
const BROAD_TORSO_S = [
  '...KccccccccK...',
  '...KccccccccK...',
  '..KsccccccccK...',
  '..KsccccccccK...',
  '..KsCCCCCCCcK...',
  '..KsccccccccK...',
  '..KlccccccccK...',
  '...KccccccccK...',
];

layer('body-broad',
  {
    down: BODY_N_DOWN.slice(0, 10).concat(BROAD_TORSO_D, BODY_N_DOWN.slice(18)),
    left: BODY_N_LEFT.slice(0, 10).concat(BROAD_TORSO_S, BODY_N_LEFT.slice(18)),
    up: BODY_N_UP.slice(0, 10).concat(BROAD_TORSO_D, BODY_N_UP.slice(18)),
  },
  {
    down: { ...LEGS_F, 3: { 11: '..KccccccccccK..', 17: '..KsccccccccdK..' } },
    left: { ...LEGS_S, 3: { 11: '...KccccccccK...', 17: '..KsccccccccK...' } },
    up: { ...LEGS_F, 3: { 11: '..KccccccccccK..', 17: '..KsccccccccdK..' } },
  });

// --- body-tall: goliath frame -- broad, long-waisted, longer shanks ---------
const TALL_TORSO_D = [
  '..KKccccccccKK..',
  '..KsccccccccsK..',
  '..KsccccccccdK..',
  '..KsccccccccdK..',
  '..KsccccccccdK..',
  '..KsCCCCCCCCdK..',
  '..KsccccccccdK..',
  '..KlccccccccdK..',
];
const TALL_TORSO_S = [
  '...KccccccccK...',
  '...KccccccccK...',
  '..KsccccccccK...',
  '..KsccccccccK...',
  '..KsccccccccK...',
  '..KsCCCCCCCcK...',
  '..KsccccccccK...',
  '..KlccccccccK...',
];
const TALL_LEGS = [
  '...KLLLLLLLLK...',
  '....KLLLLLLK....',
  '....KLLKKLLK....',
  '....KLLKKLLK....',
  '....KLLKKLLK....',
  '....KPPKKPPK....',
];

layer('body-tall',
  {
    down: BODY_N_DOWN.slice(0, 10).concat(TALL_TORSO_D, TALL_LEGS),
    left: BODY_N_LEFT.slice(0, 10).concat(TALL_TORSO_S, TALL_LEGS),
    up: BODY_N_UP.slice(0, 10).concat(TALL_TORSO_D, TALL_LEGS),
  },
  {
    down: { ...LEGS_F, 3: { 11: '..KccccccccccK..', 17: '..KsccccccccdK..' } },
    left: { ...LEGS_S, 3: { 11: '...KccccccccK...', 17: '..KsccccccccK...' } },
    up: { ...LEGS_F, 3: { 11: '..KccccccccccK..', 17: '..KsccccccccdK..' } },
  });

// --- body-small: halfling / gnome / child -- narrow body under a full head ---
const SMALL_BODY_D = [
  '....KccccccK....',
  '....KsccccsK....',
  '....KsccccdK....',
  '....KsCCCCdK....',
  '....KsccccdK....',
  '....KlccccdK....',
  '.....KccccK.....',
  '....KLLLLLLK....',
  '....KLLLLLLK....',
  '....KLLKKLLK....',
  '....KLLKKLLK....',
  '....KLLKKLLK....',
  '....KLLKKLLK....',
  '....KPPKKPPK....',
];
const SMALL_BODY_S = [
  '....KccccccK....',
  '....KccccccK....',
  '...KscccccK.....',
  '...KsCCCCcK.....',
  '...KscccccK.....',
  '...KlcccccK.....',
  '.....KccccK.....',
  '....KLLLLLLK....',
  '....KLLLLLLK....',
  '....KLLKKLLK....',
  '....KLLKKLLK....',
  '....KLLKKLLK....',
  '....KLLKKLLK....',
  '....KPPKKPPK....',
];

layer('body-small',
  {
    down: BODY_N_DOWN.slice(0, 10).concat(SMALL_BODY_D),
    left: BODY_N_LEFT.slice(0, 10).concat(SMALL_BODY_S),
    up: BODY_N_UP.slice(0, 10).concat(SMALL_BODY_D),
  },
  {
    down: { ...LEGS_F, ...BREATHE_SM },
    left: { ...LEGS_S, 3: { 11: '....KccccccK....', 16: '...KscccccK.....' } },
    up: { ...LEGS_F, ...BREATHE_SM },
  });

// ===========================================================================
// EARS -- a thin overlay on the temples, drawn after the body, under the hair.
// ===========================================================================

layer('ears-pointed', {
  down: at(3, [
    '..K..........K..',
    '..Ks........sK..',
    '...Ks......sK...',
    '....K......K....',
  ]),
  left: at(3, [
    '.............K..',
    '..........ssdK..',
    '..........KsdK..',
    '...........KK...',
  ]),
  up: at(3, [
    '..K..........K..',
    '..Ks........dK..',
    '...Ks......dK...',
    '....K......K....',
  ]),
});

layer('ears-long', {
  down: at(2, [
    '.K............K.',
    '.Ks..........sK.',
    '..Ks........sK..',
    '..Ks........sK..',
    '...K........K...',
  ]),
  left: at(2, [
    '..............K.',
    '.........sssdK..',
    '.........KssdK..',
    '..........KsdK..',
    '..........KKK...',
  ]),
  up: at(2, [
    '.K............K.',
    '.Ks..........dK.',
    '..Ks........dK..',
    '..Ks........dK..',
    '...K........K...',
  ]),
});

layer('ears-cat', {
  down: at(0, [
    '....K......K....',
    '...KsK....KsK...',
    '...KsdK..KsdK...',
    '..KssdK..KsddK..',
  ]),
  left: at(0, [
    '....K......K....',
    '...KsK....KdK...',
    '...KsdK..KddK...',
    '..KssdK..KddK...',
  ]),
  up: at(0, [
    '....K......K....',
    '...KdK....KdK...',
    '...KddK..KddK...',
    '..KdddK..KdddK..',
  ]),
});


// ===========================================================================
// HAIR -- sits on rows 1-5 for every build (rows 0-1 are the headroom band).
// Down frames leave the face open from row 4 down; up frames cover the skull.
// ===========================================================================

layer('hair-short', {
  down: at(1, [
    '.....KKKKKK.....',
    '....KjjhhhhK....',
    '....KjhhhhHK....',
    '....Kh....HK....',
    '....Kh....HK....',
  ]),
  left: at(1, [
    '.....KKKKKK.....',
    '....KjjhhhhK....',
    '....KjhhhhHK....',
    '....Kh..hhHK....',
    '........KhHK....',
  ]),
  up: at(1, [
    '.....KKKKKK.....',
    '....KjjhhhhK....',
    '....KjhhhhHK....',
    '....KhhhhhHK....',
    '....KhhhhHHK....',
    '.....KHHHHK.....',
  ]),
});

layer('hair-long', {
  down: at(1, [
    '.....KKKKKK.....',
    '....KjjhhhhK....',
    '...KjhhhhhhHK...',
    '...Kh......HK...',
    '...Kh......HK...',
    '...Kh......HK...',
    '...Kh......HK...',
    '...Kh......HK...',
    '...Kh......HK...',
    '...Kh......HK...',
    '...KH......HK...',
    '...KH......HK...',
    '...KK......KK...',
  ]),
  left: at(1, [
    '.....KKKKKK.....',
    '....KjjhhhhK....',
    '....KjhhhhhHK...',
    '....Kh...hhHK...',
    '.........KhhHK..',
    '.........KhhHK..',
    '.........KhhHK..',
    '.........KhhHK..',
    '.........KhhHK..',
    '.........KhhHK..',
    '.........KHhHK..',
    '..........KHK...',
  ]),
  up: at(1, [
    '.....KKKKKK.....',
    '....KjjhhhhK....',
    '...KjhhhhhhHK...',
    '...KhhhhhhhHK...',
    '...KhhhhhhhHK...',
    '...KhhhhhhhHK...',
    '...KhhhhhhhHK...',
    '...KhhhhhhhHK...',
    '...KhhhhhhhHK...',
    '...KhhhhhhhHK...',
    '...KHhhhhhHHK...',
    '....KHHHHHHK....',
    '.....KKKKKK.....',
  ]),
});

layer('hair-ponytail', {
  down: at(1, [
    '.....KKKKKK.....',
    '....KjjhhhhK....',
    '....KjhhhhHK....',
    '....Kh....KhK...',
    '....Kh....KhK...',
    '..........KhK...',
    '..........KHK...',
    '...........K....',
  ]),
  left: at(1, [
    '.....KKKKKK.....',
    '....KjjhhhhK....',
    '....KjhhhhHK....',
    '....Kh..hhHK....',
    '........KhHK....',
    '..........KhhK..',
    '..........KhHK..',
    '...........KHK..',
    '............K...',
  ]),
  up: at(1, [
    '.....KKKKKK.....',
    '....KjjhhhhK....',
    '....KjhhhhHK....',
    '....KhhhhhHK....',
    '....KhhhhHHK....',
    '.....KHhhHK.....',
    '......KhhK......',
    '......KhhK......',
    '......KhHK......',
    '......KHHK......',
    '.......KK.......',
  ]),
});

layer('hair-braid', {
  down: at(1, [
    '.....KKKKKK.....',
    '....KjjhhhhK....',
    '....KjhhhhHK....',
    '....Kh....KhK...',
    '....Kh....KHK...',
    '..........KhK...',
    '..........KHK...',
    '..........KhK...',
    '..........KxK...',
    '...........K....',
  ]),
  left: at(1, [
    '.....KKKKKK.....',
    '....KjjhhhhK....',
    '....KjhhhhHK....',
    '....Kh..hhHK....',
    '........KhHK....',
    '.........KhhK...',
    '.........KHhK...',
    '.........KhhK...',
    '.........KHHK...',
    '.........KxxK...',
    '..........KK....',
  ]),
  up: at(1, [
    '.....KKKKKK.....',
    '....KjjhhhhK....',
    '....KjhhhhHK....',
    '....KhhhhhHK....',
    '....KhhhhHHK....',
    '.....KHhhHK.....',
    '......KhhK......',
    '......KHhK......',
    '......KhhK......',
    '......KHHK......',
    '......KxxK......',
    '.......KK.......',
  ]),
});

layer('hair-bald', {
  down: at(3, ['.....ll.........']),
  left: at(3, ['.....ll.........']),
  up: at(3, ['.....llll.......']),
});

layer('hair-shaved', {
  down: at(2, [
    '.....HHHHHH.....',
    '....KHHHHHHK....',
    '.....H....H.....',
  ]),
  left: at(2, [
    '.....HHHHHH.....',
    '....KHHHHHHK....',
    '.....H..HHH.....',
  ]),
  up: at(2, [
    '.....HHHHHH.....',
    '....KHHHHHHK....',
    '....KHHHHHHK....',
    '.....HHHHHH.....',
  ]),
});

layer('hair-mohawk', {
  down: at(0, [
    '......KhhK......',
    '......KjhK......',
    '.....KjhhhK.....',
    '....KHhhhhHK....',
    '....KH....HK....',
  ]),
  left: at(0, [
    '......KhhK......',
    '......KjhK......',
    '.....KjhhhK.....',
    '....KHhhhhHK....',
    '.........KHK....',
  ]),
  up: at(0, [
    '......KhhK......',
    '......KjhK......',
    '.....KjhhhK.....',
    '....KHhhhhHK....',
    '....KHhhhhHK....',
    '.....KHhhHK.....',
  ]),
});

layer('hair-curly', {
  down: at(1, [
    '...KKjjKKhhKK...',
    '...KjjhhhhhHK...',
    '...KjhhhhhhHK...',
    '...Khh....HHK...',
    '...KHh....HHK...',
    '....KK....KK....',
  ]),
  left: at(1, [
    '...KKjjKKhhKK...',
    '...KjjhhhhhHK...',
    '...KjhhhhhhHK...',
    '...Khh..hhHHK...',
    '........KhHHK...',
    '........KHHK....',
  ]),
  up: at(1, [
    '...KKjjKKhhKK...',
    '...KjjhhhhhHK...',
    '...KjhhhhhhHK...',
    '...KhhhhhhhHK...',
    '...KHhhhhhHHK...',
    '....KHHHHHHK....',
    '.....KKKKKK.....',
  ]),
});

layer('hair-topknot', {
  down: at(0, [
    '......KhhK......',
    '......KjhK......',
    '.....KKKKKK.....',
    '....KjjhhhhK....',
    '....Kjh..hHK....',
    '....Kh....HK....',
  ]),
  left: at(0, [
    '......KhhK......',
    '......KjhK......',
    '.....KKKKKK.....',
    '....KjjhhhhK....',
    '....Kjh.hhHK....',
    '........KhHK....',
  ]),
  up: at(0, [
    '......KhhK......',
    '......KjhK......',
    '.....KKKKKK.....',
    '....KjjhhhhK....',
    '....KjhhhhHK....',
    '....KhhhhHHK....',
    '.....KHHHHK.....',
  ]),
});

layer('hair-bob', {
  down: at(1, [
    '.....KKKKKK.....',
    '....KjjhhhhK....',
    '...KjhhhhhhHK...',
    '...Kh......HK...',
    '...Kh......HK...',
    '...Kh......HK...',
    '...Kh......HK...',
    '...KH......HK...',
    '...KK......KK...',
  ]),
  left: at(1, [
    '.....KKKKKK.....',
    '....KjjhhhhK....',
    '....KjhhhhhHK...',
    '....Kh..hhhHK...',
    '.........KhhHK..',
    '.........KhhHK..',
    '.........KhhHK..',
    '.........KHHHK..',
    '..........KKK...',
  ]),
  up: at(1, [
    '.....KKKKKK.....',
    '....KjjhhhhK....',
    '...KjhhhhhhHK...',
    '...KhhhhhhhHK...',
    '...KhhhhhhhHK...',
    '...KhhhhhhhHK...',
    '...KhhhhhhhHK...',
    '...KHhhhhhHHK...',
    '....KHHHHHHK....',
    '.....KKKKKK.....',
  ]),
});

layer('hair-wild', {
  down: at(0, [
    '....K.K..K.K....',
    '...KjKjKKhKhK...',
    '...KjjhhhhhHK...',
    '...KjhhhhhhHK...',
    '...Khh....HHK...',
    '....K......K....',
  ]),
  left: at(0, [
    '....K.K..K.K....',
    '...KjKjKKhKhK...',
    '...KjjhhhhhHK...',
    '...KjhhhhhhHK...',
    '...Khh..hhHHK...',
    '........KhHK....',
  ]),
  up: at(0, [
    '....K.K..K.K....',
    '...KjKjKKhKhK...',
    '...KjjhhhhhHK...',
    '...KjhhhhhhHK...',
    '...KhhhhhhhHK...',
    '...KHhhhhhHHK...',
    '....KHHHHHHK....',
  ]),
});

layer('hair-widowspeak', {
  down: at(1, [
    '.....KKKKKK.....',
    '....KjjhhhhK....',
    '....KjhhhhHK....',
    '....KjhhhhHK....',
    '....Kh.hh.HK....',
    '.......hh.......',
  ]),
  left: at(1, [
    '.....KKKKKK.....',
    '....KjjhhhhK....',
    '....KjhhhhHK....',
    '....Kjh.hhHK....',
    '....Kh..KhHK....',
    '.....h..KhHK....',
  ]),
  up: at(1, [
    '.....KKKKKK.....',
    '....KjjhhhhK....',
    '....KjhhhhHK....',
    '....KhhhhhHK....',
    '....KhhhhHHK....',
    '.....KHHHHK.....',
  ]),
});

/** Cycler options for the character-creation appearance step. */
export const HAIR_STYLES = Object.freeze([
  { id: 'short', name: 'Cropped' },
  { id: 'long', name: 'Long' },
  { id: 'ponytail', name: 'Ponytail' },
  { id: 'braid', name: 'Braided' },
  { id: 'curly', name: 'Curly' },
  { id: 'topknot', name: 'Topknot' },
  { id: 'bob', name: 'Bob' },
  { id: 'wild', name: 'Wild' },
  { id: 'widowspeak', name: "Widow's Peak" },
  { id: 'mohawk', name: 'Mohawk' },
  { id: 'shaved', name: 'Shaved' },
  { id: 'bald', name: 'Bald' },
]);

// ===========================================================================
// BEARDS -- rows 7-15, never drawn on the up-facing (back of head) frames.
// ===========================================================================

emptyLayer('beard-none');

layer('beard-stubble', {
  down: at(7, [
    '.....H....H.....',
    '.....H.HH.H.....',
    '......HHHH......',
  ]),
  left: at(7, [
    '....H.....H.....',
    '....HH.HHH......',
    '.....HHHH.......',
  ]),
  up: [],
});

layer('beard-full', {
  down: at(7, [
    '....Kh....HK....',
    '....KhhhhhhK....',
    '....KhhhhhhK....',
    '.....KhhhhK.....',
    '.....KHHHHK.....',
    '......KHHK......',
  ]),
  left: at(7, [
    '...Khh....HK....',
    '..KhhhhhhhK.....',
    '..KhhhhhhK......',
    '...KhhhhK.......',
    '....KHHK........',
  ]),
  up: [],
});

layer('beard-braided', {
  down: at(7, [
    '....Kh....HK....',
    '....KhhhhhhK....',
    '....KhhhhhhK....',
    '.....KhhhhK.....',
    '....KhK..KhK....',
    '....KhK..KhK....',
    '....KxK..KxK....',
    '.....K....K.....',
  ]),
  left: at(7, [
    '...Khh....HK....',
    '..KhhhhhhhK.....',
    '..KhhhhhhK......',
    '..KhhhhK........',
    '..KhK...........',
    '..KhK...........',
    '..KxK...........',
    '...K............',
  ]),
  up: [],
});

layer('beard-goatee', {
  down: at(7, [
    '.....hhhhhh.....',
    '.......hh.......',
    '......KhhK......',
    '......KhhK......',
    '.......KK.......',
  ]),
  left: at(7, [
    '....hhhhh.......',
    '.....hh.........',
    '....KhhK........',
    '....KhhK........',
    '.....KK.........',
  ]),
  up: [],
});

layer('beard-mustache', {
  down: at(8, [
    '.....hhhhhh.....',
    '......HHHH......',
  ]),
  left: at(8, [
    '...hhhhhh.......',
    '....HHHH........',
  ]),
  up: [],
});

export const BEARD_STYLES = Object.freeze([
  { id: 'none', name: 'Clean Shaven' },
  { id: 'stubble', name: 'Stubble' },
  { id: 'goatee', name: 'Goatee' },
  { id: 'mustache', name: 'Moustache' },
  { id: 'full', name: 'Full Beard' },
  { id: 'braided', name: 'Braided Beard' },
]);

// ===========================================================================
// HORNS (tiefling, dragonborn, minotaur helms) and TAILS.
// Horns are symmetrical so the same grid serves all four facings.
// ===========================================================================

const HORNS_CURVED = at(0, [
  '..KoK......KoK..',
  '..KoK......KoK..',
  '..KOK......KOK..',
  '...Koo....ooK...',
  '....Ko....oK....',
]);
layer('horns-curved', { down: HORNS_CURVED, left: HORNS_CURVED, up: HORNS_CURVED });

const HORNS_STRAIGHT = at(0, [
  '.....K....K.....',
  '.....Ko..oK.....',
  '....Ko....oK....',
  '....Ko....oK....',
  '....KO....OK....',
]);
layer('horns-straight', { down: HORNS_STRAIGHT, left: HORNS_STRAIGHT, up: HORNS_STRAIGHT });

const HORNS_RAM = at(0, [
  '..KKo......oKK..',
  '.KoOK......KOoK.',
  '.KoK........KoK.',
  '.KOK........KOK.',
  '..KKo......oKK..',
  '...KK......KK...',
]);
layer('horns-ram', { down: HORNS_RAM, left: HORNS_RAM, up: HORNS_RAM });

const HORNS_CROWN = at(1, [
  '....o.o..o.o....',
  '....KooooooK....',
  '....KOOOOOOK....',
]);
layer('horns-crown', { down: HORNS_CROWN, left: HORNS_CROWN, up: HORNS_CROWN });

const TAIL_THIN = at(15, [
  '.............KK.',
  '............KsdK',
  '............KsdK',
  '...........KsdK.',
  '...........KsdK.',
  '...........KsK..',
  '............K...',
]);
layer('tail-thin', { down: TAIL_THIN, left: TAIL_THIN, up: TAIL_THIN });

const TAIL_TUFTED = at(15, [
  '.............KK.',
  '............KsdK',
  '............KsdK',
  '...........KsdK.',
  '...........KsdK.',
  '..........KhhhK.',
  '..........KHhHK.',
  '...........KKK..',
]);
layer('tail-tufted', { down: TAIL_TUFTED, left: TAIL_TUFTED, up: TAIL_TUFTED });

const TAIL_CAT = at(12, [
  '............KK..',
  '...........KssK.',
  '...........KsdK.',
  '............KsdK',
  '............KsdK',
  '............KsdK',
  '...........KsdK.',
  '...........KsK..',
  '............K...',
]);
layer('tail-cat', { down: TAIL_CAT, left: TAIL_CAT, up: TAIL_CAT });

const TAIL_SCALED = at(15, [
  '.............KK.',
  '............KsdK',
  '...........KssdK',
  '...........KsddK',
  '..........KssdK.',
  '..........KsdK..',
  '..........KKK...',
]);
layer('tail-scaled', { down: TAIL_SCALED, left: TAIL_SCALED, up: TAIL_SCALED });


// ===========================================================================
// OUTFITS -- torso and sleeves only. Rows 10-13 carry the K silhouette out to
// cols 3/12 (sleeves); rows 14-16 fill cols 5-10 with no outline so the body's
// own arms and hands stay readable; hems from row 17 sit on cols 4-11.
// The same grid serves all four facings -- the silhouette differs by at most a
// pixel between front and side, and sharing keeps every layer in register.
// ===========================================================================

/** Register an outfit whose front grid is reused for every facing. */
function outfit(name, rows, anim) {
  const g = norm(rows);
  return layer(name, { down: g, left: g, up: g }, anim);
}

outfit('outfit-tunic', at(10, [
  '...KaaaaaaaaK...',
  '...KaaaaaaaaK...',
  '...KAaaaaaaAK...',
  '...KAaaaaaaAK...',
  '.....LLLLLL.....',
  '.....aaaaaa.....',
  '.....aaaaaa.....',
  '....KaaaaaaK....',
  '....KAAAAAAK....',
]));

outfit('outfit-peasant', at(10, [
  '...KccccccccK...',
  '...KccccccccK...',
  '...KCccccccCK...',
  '...KCccccccCK...',
  '.....LLLLLL.....',
  '.....cccccc.....',
  '.....cccccc.....',
  '....KccccccK....',
  '....KCCCCCCK....',
]));

outfit('outfit-robe', at(10, [
  '...KaaaaaaaaK...',
  '...KaaaaaaaaK...',
  '...KAaaaaaaAK...',
  '...KAaaaaaaAK...',
  '.....atttta.....',
  '.....aattaa.....',
  '.....aaaaaa.....',
  '....KaaaaaaK....',
  '....KaaaaaaK....',
  '...KaaaaaaaaK...',
  '...KaaaaaaaaK...',
  '...KAaaaaaaAK...',
  '...KttttttttK...',
]), {
  down: {
    1: { 21: '...KaaaaaaaAK...', 22: '..KtttttttttK...' },
    2: { 21: '...KAaaaaaaaK...', 22: '...KtttttttttK..' },
    3: { 22: '...KTTTTTTTTK...' },
  },
  left: {
    1: { 21: '...KaaaaaaaAK...', 22: '..KtttttttttK...' },
    2: { 21: '...KAaaaaaaaK...', 22: '...KtttttttttK..' },
    3: { 22: '...KTTTTTTTTK...' },
  },
});

outfit('outfit-leather', at(10, [
  '...KLLLLLLLLK...',
  '...KLLLLLLLLK...',
  '...KPLLLLLLPK...',
  '...KPLLLLLLPK...',
  '.....LLLLLL.....',
  '.....PxxxxP.....',
  '.....LLLLLL.....',
  '....KLLLLLLK....',
  '....KPPPPPPK....',
]));

outfit('outfit-studded', at(10, [
  '...KLLLLLLLLK...',
  '...KLmLLLLmLK...',
  '...KPLLmmLLPK...',
  '...KPLmLLmLPK...',
  '.....LLLLLL.....',
  '.....PxxxxP.....',
  '.....LmLLmL.....',
  '....KLLLLLLK....',
  '....KPPPPPPK....',
]));

outfit('outfit-chain', at(10, [
  '...KmmmmmmmmK...',
  '...KnmMmmMmnK...',
  '...KMmmmmmmMK...',
  '...KMmMmmMmMK...',
  '.....mmmmmm.....',
  '.....LLLLLL.....',
  '.....mMmmMm.....',
  '....KmmmmmmK....',
  '....KMMMMMMK....',
]));

outfit('outfit-scale', at(10, [
  '...KmmmmmmmmK...',
  '...KMmMmMmMmK...',
  '...KmMmMmMmMK...',
  '...KMmMmMmMmK...',
  '.....mMmMmM.....',
  '.....LLLLLL.....',
  '.....MmMmMm.....',
  '....KmMmMmMK....',
  '....KMMMMMMK....',
]));

outfit('outfit-brigandine', at(10, [
  '...KLmmmmmmLK...',
  '...KLmnnnnmLK...',
  '...KPmmmmmmPK...',
  '...KPLmmmmLPK...',
  '.....LmmmmL.....',
  '.....PxxxxP.....',
  '.....LLLLLL.....',
  '....KLLLLLLK....',
  '....KPPPPPPK....',
]));

outfit('outfit-plate', at(10, [
  '..KnmmmmmmmmnK..',
  '..KMmnnnnnnmMK..',
  '...KmmnnnnmmK...',
  '...KmmmttmmmK...',
  '.....mmmmmm.....',
  '.....MttttM.....',
  '.....mmmmmm.....',
  '....KmmmmmmK....',
  '....KMmmmmMK....',
  '....KMMMMMMK....',
]));

outfit('outfit-half-plate', at(10, [
  '...KmnnnnnnmK...',
  '...KmmmmmmmmK...',
  '...KMmmmmmmMK...',
  '...KLmmmmmmLK...',
  '.....mmmmmm.....',
  '.....PxxxxP.....',
  '.....LLLLLL.....',
  '....KLLLLLLK....',
  '....KPPPPPPK....',
]));

outfit('outfit-hide', at(10, [
  '...KLLcLLcLLK...',
  '...KLcLLLLcLK...',
  '...KPLLLLLLPK...',
  '...KPLLcLLLPK...',
  '.....LLLLLL.....',
  '.....LPLPLP.....',
  '.....cLLLLc.....',
  '....KLLLLLLK....',
  '....KPcPPcPK....',
]));

outfit('outfit-noble', at(10, [
  '...KtaaaaaatK...',
  '...KtaaaaaatK...',
  '...KAatxxtaAK...',
  '...KAaaxxaaAK...',
  '.....aaxxaa.....',
  '.....LLxxLL.....',
  '.....aaxxaa.....',
  '....KaaxxaaK....',
  '....KAAxxAAK....',
  '....KttttttK....',
]));

outfit('outfit-monk', at(10, [
  '...KaaaaaaaaK...',
  '.....aaaaaa.....',
  '.....aabbaa.....',
  '.....abbbba.....',
  '.....bbbbbb.....',
  '.....BBBBBB.....',
  '.....aaaaaa.....',
  '....KaaaaaaK....',
  '....KAAAAAAK....',
]));

export const OUTFIT_STYLES = Object.freeze([
  { id: 'outfit-tunic', name: 'Tunic' },
  { id: 'outfit-peasant', name: 'Homespun' },
  { id: 'outfit-robe', name: 'Robes' },
  { id: 'outfit-noble', name: 'Fine Clothes' },
  { id: 'outfit-monk', name: 'Monastic Wrap' },
  { id: 'outfit-hide', name: 'Hide' },
  { id: 'outfit-leather', name: 'Leather' },
  { id: 'outfit-studded', name: 'Studded Leather' },
  { id: 'outfit-chain', name: 'Chain Mail' },
  { id: 'outfit-scale', name: 'Scale Mail' },
  { id: 'outfit-brigandine', name: 'Breastplate' },
  { id: 'outfit-half-plate', name: 'Half Plate' },
  { id: 'outfit-plate', name: 'Plate Armour' },
]);

// ===========================================================================
// CLOAKS -- drawn FIRST by the compositor, so they read as a shape sitting one
// or two pixels proud of the body silhouette. The hem sways on frames 1 and 2.
// ===========================================================================

emptyLayer('cloak-none');

// Two pixels proud of the body on each side, so the cloak still reads when a
// shield or a drawn weapon crowds the silhouette.
const CLOAK_TOP = [
  '.KbbbbbbbbbbbbK.',
  '.KbbbbbbbbbbbbK.',
  '.KbbbbbbbbbbbBK.',
  '.KbbbbbbbbbbBBK.',
  '.KbbbbbbbbbbBBK.',
  '.KBbbbbbbbbBBBK.',
];

layer('cloak-short',
  (() => { const g = at(10, CLOAK_TOP.concat(['..KBBBBBBBBBBK..', '...KKKKKKKKKK...'])); return { down: g, left: g, up: g }; })(),
  {
    down: { 1: { 16: '.KBBBBBBBBBBK...', 17: '..KKKKKKKKKK....' }, 2: { 16: '...KBBBBBBBBBBK.', 17: '....KKKKKKKKKK..' } },
    left: { 1: { 16: '.KBBBBBBBBBBK...', 17: '..KKKKKKKKKK....' }, 2: { 16: '...KBBBBBBBBBBK.', 17: '....KKKKKKKKKK..' } },
  });

const CLOAK_LONG_ROWS = CLOAK_TOP.concat([
  '.KBbbbbbbbbBBBK.',
  '.KbbbbbbbbbbBBK.',
  '.KbbbbbbbbbbBBK.',
  '.KBbbbbbbbbBBBK.',
  '..KBBBBBBBBBBK..',
  '...KBBBBBBBBK...',
  '....KKKKKKKK....',
]);

layer('cloak-long',
  (() => { const g = at(10, CLOAK_LONG_ROWS); return { down: g, left: g, up: g }; })(),
  {
    down: {
      1: { 20: '.KBBBBBBBBBBK...', 21: '..KBBBBBBBBK....', 22: '...KKKKKKKK.....' },
      2: { 20: '...KBBBBBBBBBBK.', 21: '....KBBBBBBBBK..', 22: '.....KKKKKKKK...' },
    },
    left: {
      1: { 20: '.KBBBBBBBBBBK...', 21: '..KBBBBBBBBK....', 22: '...KKKKKKKK.....' },
      2: { 20: '...KBBBBBBBBBBK.', 21: '....KBBBBBBBBK..', 22: '.....KKKKKKKK...' },
    },
  });

const HOOD_FRONT = at(1, [
  '.....KKKKKK.....',
  '....KbbbbbbK....',
  '...KbbbbbbbbK...',
  '...Kb......BK...',
  '...Kb......BK...',
  '...Kb......BK...',
  '...KB......BK...',
  '...KB......BK...',
  '....KB....BK....',
]);
const HOOD_BACK = at(1, [
  '.....KKKKKK.....',
  '....KbbbbbbK....',
  '...KbbbbbbbbK...',
  '...KbbbbbbbbK...',
  '...KbbbbbbbBK...',
  '...KbbbbbbBBK...',
  '...KBbbbbbBBK...',
  '...KBBBBBBBBK...',
  '....KBBBBBBK....',
]);

layer('cloak-hooded',
  {
    down: flatten([at(10, CLOAK_LONG_ROWS), HOOD_FRONT]),
    left: flatten([at(10, CLOAK_LONG_ROWS), HOOD_FRONT]),
    up: flatten([at(10, CLOAK_LONG_ROWS), HOOD_BACK]),
  },
  {
    down: {
      1: { 20: '.KBBBBBBBBBBK...', 21: '..KBBBBBBBBK....', 22: '...KKKKKKKK.....' },
      2: { 20: '...KBBBBBBBBBBK.', 21: '....KBBBBBBBBK..', 22: '.....KKKKKKKK...' },
    },
    left: {
      1: { 20: '.KBBBBBBBBBBK...', 21: '..KBBBBBBBBK....', 22: '...KKKKKKKK.....' },
      2: { 20: '...KBBBBBBBBBBK.', 21: '....KBBBBBBBBK..', 22: '.....KKKKKKKK...' },
    },
  });

export const CLOAK_STYLES = Object.freeze([
  { id: 'cloak-none', name: 'No Cloak' },
  { id: 'cloak-short', name: 'Half Cape' },
  { id: 'cloak-long', name: "Traveller's Cloak" },
  { id: 'cloak-hooded', name: 'Hooded Cloak' },
]);

// ===========================================================================
// HELMS -- cover the same head rows the hair does (1-9). A great helm or hood
// replaces the hair entirely (actor.js drops the hair layer for those two).
// ===========================================================================

emptyLayer('helm-none');

const HELM_CAP = at(1, [
  '.....KKKKKK.....',
  '....KnnmmmMK....',
  '....KnmmmmMK....',
  '....KMMMMMMK....',
]);
layer('helm-cap', { down: HELM_CAP, left: HELM_CAP, up: HELM_CAP });

layer('helm-hood', {
  down: at(1, [
    '.....KKKKKK.....',
    '....KccccccK....',
    '...KccccccccK...',
    '...Kc......CK...',
    '...Kc......CK...',
    '...Kc......CK...',
    '...KC......CK...',
    '...KC......CK...',
    '....KC....CK....',
  ]),
  left: at(1, [
    '.....KKKKKK.....',
    '....KccccccK....',
    '...KccccccccK...',
    '...Kc.....CCK...',
    '...Kc.....CCK...',
    '......KcCCCCK...',
    '......KCCCCCK...',
    '.......KCCCCK...',
    '........KCCK....',
  ]),
  up: at(1, [
    '.....KKKKKK.....',
    '....KccccccK....',
    '...KccccccccK...',
    '...KccccccccK...',
    '...KccccccccK...',
    '...KcCCCCCCCK...',
    '...KCCCCCCCCK...',
    '...KCCCCCCCCK...',
    '....KCCCCCCK....',
  ]),
});

layer('helm-great', {
  down: at(1, [
    '.....KKKKKK.....',
    '....KnnmmmMK....',
    '...KnmmmmmmMK...',
    '...KnmmmmmmMK...',
    '...KmZZZZZZMK...',
    '...KmZZZZZZMK...',
    '...KmmmmmmmMK...',
    '...KMmmmmmMMK...',
    '....KMMMMMMK....',
  ]),
  left: at(1, [
    '.....KKKKKK.....',
    '....KnnmmmMK....',
    '...KnmmmmmmMK...',
    '...KnmmmmmmMK...',
    '..KZZZmmmmmMK...',
    '..KZZZmmmmmMK...',
    '...KmmmmmmmMK...',
    '...KMmmmmmMMK...',
    '....KMMMMMMK....',
  ]),
  up: at(1, [
    '.....KKKKKK.....',
    '....KnnmmmMK....',
    '...KnmmmmmmMK...',
    '...KnmmmmmmMK...',
    '...KmmmmmmmMK...',
    '...KmmmmmmmMK...',
    '...KmmmmmmmMK...',
    '...KMMmmmMMMK...',
    '....KMMMMMMK....',
  ]),
});

const HELM_HORNED = at(0, [
  '..KoK......KoK..',
  '..KOKKKKKKKKOK..',
  '....KnnmmmMK....',
  '....KnmmmmMK....',
  '....KMMMMMMK....',
]);
layer('helm-horned', { down: HELM_HORNED, left: HELM_HORNED, up: HELM_HORNED });

const HELM_WIZARD = at(0, [
  '.......KK.......',
  '......KaaK......',
  '......KqaK......',
  '.....KqaaAK.....',
  '..KttttttttttK..',
  '..KTTTTTTTTTTK..',
]);
layer('helm-wizard', { down: HELM_WIZARD, left: HELM_WIZARD, up: HELM_WIZARD });

const HELM_CIRCLET = at(4, [
  '....KttxxttK....',
  '....KTTTTTTK....',
]);
layer('helm-circlet', { down: HELM_CIRCLET, left: HELM_CIRCLET, up: HELM_CIRCLET });

const HELM_CROWN = at(1, [
  '....x.x..x.x....',
  '....KxxxxxxK....',
  '....KtttttTK....',
  '....KTTTTTTK....',
]);
layer('helm-crown', { down: HELM_CROWN, left: HELM_CROWN, up: HELM_CROWN });

export const HELM_STYLES = Object.freeze([
  { id: 'helm-none', name: 'Bare Head' },
  { id: 'helm-cap', name: 'Skullcap' },
  { id: 'helm-hood', name: 'Hood' },
  { id: 'helm-circlet', name: 'Circlet' },
  { id: 'helm-horned', name: 'Horned Helm' },
  { id: 'helm-wizard', name: 'Pointed Hat' },
  { id: 'helm-great', name: 'Great Helm' },
  { id: 'helm-crown', name: 'Crown' },
]);


// ===========================================================================
// WEAPONS -- authored once on the viewer's right (the character's forward hand
// when facing the camera); gear() mirrors that grid for the left-facing and
// up-facing frames, and walkSet mirrors it back for right-facing. Blades stay
// inside the 16px grid, angled, so nothing is clipped by the composite.
// ===========================================================================

emptyLayer('wep-none');

gear('wep-sword', at(9, [
  '.............K..',
  '............KnK.',
  '............KmK.',
  '............KmK.',
  '............KmK.',
  '............KmK.',
  '...........KtmtK',
  '............KLK.',
  '............KLK.',
  '............KxK.',
  '.............K..',
]));

gear('wep-greatsword', at(5, [
  '...........KKK..',
  '...........KmnK.',
  '...........KmnK.',
  '...........KmnK.',
  '...........KmnK.',
  '...........KmnK.',
  '...........KmnK.',
  '...........KmnK.',
  '...........KmnK.',
  '...........KmnK.',
  '...........KmnK.',
  '...........KmnK.',
  '..........KttttK',
  '...........KLK..',
  '...........KLK..',
  '...........KxK..',
  '...........KKK..',
]));

gear('wep-axe', at(10, [
  '............KLK.',
  '.........KmmmLK.',
  '.........KmmnLK.',
  '..........KmnLK.',
  '............KLK.',
  '............KLK.',
  '............KLK.',
  '............KLK.',
  '............KLK.',
  '............KKK.',
]));

// Bearded blade hugs cols 10-15 so the head (face interior cols 5-10) stays legible;
// the haft runs the full height on cols 12-14 like every other two-handed weapon.
gear('wep-greataxe', at(7, [
  '............KLK.',
  '..........KmmmLK',
  '..........KmmnLK',
  '..........KmmnLK',
  '...........KmnLK',
  '............KLK.',
  '............KLK.',
  '............KLK.',
  '............KLK.',
  '............KLK.',
  '............KLK.',
  '............KLK.',
  '............KKK.',
]));

gear('wep-mace', at(10, [
  '............KK..',
  '...........KmmK.',
  '...........KmnK.',
  '...........KMmK.',
  '............KLK.',
  '............KLK.',
  '............KLK.',
  '............KLK.',
  '............KKK.',
]));

gear('wep-hammer', at(11, [
  '..........KKKK..',
  '..........KmnnK.',
  '..........KmmmK.',
  '..........KMMmK.',
  '............KLK.',
  '............KLK.',
  '............KLK.',
  '............KLK.',
  '............KKK.',
]));

gear('wep-dagger', at(13, [
  '.............K..',
  '............KnK.',
  '............KmK.',
  '...........KtttK',
  '............KLK.',
  '............KLK.',
  '............KKK.',
]));

gear('wep-spear', at(5, [
  '.............K..',
  '............KmK.',
  '............KmK.',
  '............KMK.',
  '............KLK.',
  '............KLK.',
  '............KLK.',
  '............KLK.',
  '............KLK.',
  '............KLK.',
  '............KLK.',
  '............KLK.',
  '............KLK.',
  '............KLK.',
  '............KLK.',
  '............KLK.',
  '............KLK.',
  '............KKK.',
]));

gear('wep-staff', at(6, [
  '............KxK.',
  '............KLK.',
  '............KLK.',
  '............KLK.',
  '............KLK.',
  '............KLK.',
  '............KLK.',
  '............KLK.',
  '............KLK.',
  '............KLK.',
  '............KLK.',
  '............KLK.',
  '............KLK.',
  '............KLK.',
  '............KLK.',
  '............KLK.',
  '............KKK.',
]));

// The blade is deliberately kept to cols 11-15: col 11 is the head's own outline
// column, so the polearm reads as held beside the face without ever painting into
// the face box (rows 2-9, cols 5-10).
gear('wep-halberd', at(4, [
  '.............KmK',
  '...........KmmmK',
  '...........KmnmK',
  '............KmmK',
  '............KLK.',
  '............KLK.',
  '............KLK.',
  '............KLK.',
  '............KLK.',
  '............KLK.',
  '............KLK.',
  '............KLK.',
  '............KLK.',
  '............KLK.',
  '............KLK.',
  '............KLK.',
  '............KLK.',
  '............KKK.',
]));

gear('wep-bow', at(10, [
  '............KL..',
  '...........KLW..',
  '...........KL.W.',
  '...........KL.W.',
  '...........KL.W.',
  '...........KL.W.',
  '...........KL.W.',
  '...........KLW..',
  '............KL..',
  '............K...',
]));

gear('wep-crossbow', at(13, [
  '..........KKKK..',
  '.........KmLLmK.',
  '.........KKLLKK.',
  '..........KLLK..',
  '..........KLK...',
  '..........KKK...',
]));

gear('wep-wand', at(13, [
  '.............x..',
  '............KxK.',
  '............KLK.',
  '............KLK.',
  '............KLK.',
  '.............K..',
]));

gear('wep-scimitar', at(9, [
  '.............KK.',
  '............KnmK',
  '............KmmK',
  '...........KmmK.',
  '...........KmK..',
  '..........KtmtK.',
  '...........KLK..',
  '...........KLK..',
  '...........KxK..',
  '............K...',
]));

gear('wep-rapier', at(8, [
  '.............K..',
  '............KnK.',
  '............KmK.',
  '............KmK.',
  '............KmK.',
  '............KmK.',
  '............KmK.',
  '...........KtKtK',
  '...........KttK.',
  '............KLK.',
  '............KLK.',
  '............KxK.',
]));

gear('wep-flail', at(9, [
  '...........KKK..',
  '...........KmmK.',
  '...........KMmK.',
  '............KZ..',
  '............Z...',
  '............KK..',
  '............KLK.',
  '............KLK.',
  '............KLK.',
  '............KKK.',
]));

// ===========================================================================
// SHIELDS -- authored on the viewer's LEFT (the off hand). Mirroring puts them
// on the far side of a side-facing character, exactly where a shield should be.
// ===========================================================================

emptyLayer('shield-none');

gear('shield-round', at(12, [
  '..KKK...........',
  '.KmmmK..........',
  '.KmxmK..........',
  '.KmxmK..........',
  '.KmmmK..........',
  '.KMMMK..........',
  '..KKK...........',
]));

gear('shield-kite', at(11, [
  '..KKK...........',
  '.KmmmK..........',
  '.KmxmK..........',
  '.KmxmK..........',
  '.KmmmK..........',
  '.KMmMK..........',
  '..KmK...........',
  '..KMK...........',
  '...K............',
]));

gear('shield-tower', at(11, [
  '.KKKKK..........',
  '.KmmmK..........',
  '.KmxmK..........',
  '.KmxmK..........',
  '.KmmmK..........',
  '.KmxmK..........',
  '.KmxmK..........',
  '.KmmmK..........',
  '.KMMMK..........',
  '.KMMMK..........',
  '.KKKKK..........',
]));


// ===========================================================================
// TOWNSFOLK -- the Phandalin cast baked flat.
// A town NPC does not need the layered compositor: we flatten the same layer
// grids once, freeze literal colours into the palette, and register the result
// as an ordinary single-layer sprite. Toblen Stonehill, Elmar Barthen, Linene
// Graywind, Sister Garaele and the rest just pick one of these and a tint.
// ===========================================================================

/** Turn a handful of hex choices into the full 26-key humanoid palette. */
function pal(p = {}) {
  const skin = p.skin || '#e0a878';
  const hair = p.hair || '#3a2416';
  const main = p.main || '#7a3030';
  const alt = p.alt || '#2f4f7f';
  const metal = p.metal || '#aab2c0';
  const leather = p.leather || '#6b4a2a';
  const cloth = p.cloth || '#c8b58a';
  const accent = p.accent || '#e3b34a';
  const horn = p.horn || '#8c8377';
  return {
    K: p.outline || '#170f0c',
    s: skin, d: shadeHex(skin, -0.26), l: shadeHex(skin, 0.20), e: p.eye || '#37527a',
    h: hair, H: shadeHex(hair, -0.32), j: shadeHex(hair, 0.24),
    a: main, A: shadeHex(main, -0.30), q: shadeHex(main, 0.22),
    b: alt, B: shadeHex(alt, -0.30),
    m: metal, M: shadeHex(metal, -0.34), n: shadeHex(metal, 0.30),
    t: accent, T: shadeHex(accent, -0.30),
    L: leather, P: shadeHex(leather, -0.30),
    c: cloth, C: shadeHex(cloth, -0.28),
    x: accent, X: shadeHex(accent, -0.30),
    o: horn, O: shadeHex(horn, -0.30),
    W: '#f4ece0', Z: '#120c0a',
  };
}

/**
 * Flatten a stack of layer grids into a finished 16x24 character.
 * `stack` must be listed back-to-front, matching actor.js's draw order:
 * cloak, tail, body, ears, hair, beard, outfit, horns, helm, shield, weapon.
 */
function npc(name, stack, colors) {
  const frames = {};
  for (const f of FRAME_NAMES) {
    frames[f] = flatten(stack.map((n) => (ART[n] ? ART[n][f] : null)));
  }
  ART[name] = frames;
  return define(name, { w: W, h: H, palette: pal(colors), frames, anims: ANIMS });
}

npc('npc-villager-m', ['body-normal', 'hair-short', 'beard-stubble', 'outfit-tunic'],
  { skin: '#dda171', hair: '#4a3320', main: '#6b7a48', leather: '#5a3f22', accent: '#b08a3a' });

npc('npc-villager-f', ['body-slim', 'hair-long', 'outfit-peasant'],
  { skin: '#eab98d', hair: '#8a5a28', cloth: '#c3a678', leather: '#6b4a2a', accent: '#a86a7a' });

npc('npc-child', ['body-small', 'hair-bob', 'outfit-peasant'],
  { skin: '#f0c79c', hair: '#a8823a', cloth: '#cbbf96', leather: '#7a5a34' });

npc('npc-guard', ['body-broad', 'hair-short', 'outfit-chain', 'helm-cap', 'shield-round', 'wep-spear'],
  { skin: '#d9a077', hair: '#3a2a1c', metal: '#a8b0bd', leather: '#57381d', accent: '#c4a24a' });

npc('npc-smith', ['body-broad', 'hair-short', 'beard-full', 'outfit-leather', 'wep-hammer'],
  { skin: '#c88d5e', hair: '#2c1e14', leather: '#4e3218', metal: '#9aa2b0', accent: '#c07a2a' });

npc('npc-innkeeper', ['body-normal', 'hair-short', 'beard-goatee', 'outfit-tunic'],
  { skin: '#e5ae80', hair: '#5a3a20', main: '#8a5a2a', leather: '#6b4a2a', accent: '#d8b45a' });

npc('npc-merchant', ['body-normal', 'hair-short', 'beard-mustache', 'outfit-noble'],
  { skin: '#dfa87b', hair: '#5a4a3a', main: '#3f5f8a', accent: '#e3b34a', leather: '#54381f' });

npc('npc-priest', ['body-normal', 'outfit-robe', 'helm-hood'],
  { skin: '#e7b68e', main: '#e8e2d2', accent: '#d8bf5a', cloth: '#ddd6c4', leather: '#7a6a48' });

npc('npc-farmer', ['body-normal', 'hair-short', 'beard-stubble', 'outfit-peasant', 'helm-cap'],
  { skin: '#c98d5e', hair: '#6a4a24', cloth: '#b8a678', metal: '#d8bd72', leather: '#5a3f22' });

npc('npc-miner', ['body-broad', 'hair-short', 'beard-full', 'outfit-hide', 'helm-cap'],
  { skin: '#b07a4e', hair: '#33231a', leather: '#5e4326', cloth: '#9a8a6a', metal: '#8e939c' });

npc('npc-noble', ['cloak-short', 'body-slim', 'hair-long', 'outfit-noble'],
  { skin: '#efc79c', hair: '#2a1c14', main: '#5a2f6b', alt: '#3a1f4a', accent: '#e6c45c' });

npc('npc-thug', ['cloak-short', 'body-broad', 'hair-mohawk', 'beard-stubble', 'outfit-studded', 'wep-sword'],
  { skin: '#c58a5c', hair: '#241a14', alt: '#8e2020', leather: '#40291a', metal: '#8e939c', accent: '#9a2a2a' });

npc('npc-dwarf', ['body-small', 'hair-braid', 'beard-braided', 'outfit-scale'],
  { skin: '#d99a66', hair: '#8a4420', metal: '#a89a72', leather: '#5a3a1c', accent: '#c8a03a' });

npc('npc-halfling', ['body-small', 'hair-curly', 'outfit-tunic'],
  { skin: '#eebb8c', hair: '#6a4420', main: '#4a7a44', leather: '#6b4a2a', accent: '#c8a83a' });

npc('npc-elf', ['body-slim', 'ears-pointed', 'hair-long', 'outfit-noble'],
  { skin: '#f2d6b4', hair: '#d8c890', main: '#3a6b5a', accent: '#cfc088', eye: '#4a7a5a', leather: '#5a4a30' });

// helm-hood goes ON TOP of the body: the cloak's own hood is drawn behind the head
// by the layer order, so without the cowl the up-facing frames show a bare scalp.
npc('npc-hooded', ['cloak-hooded', 'body-normal', 'outfit-robe', 'helm-hood'],
  { skin: '#c08a5e', main: '#3a3444', alt: '#2a2632', accent: '#6a5a7a',
    cloth: '#38323f', leather: '#3a2f22' });

// ===========================================================================
// AMBIENT CREATURES -- barnyard and street life for Phandalin and the Trail.
// Single-layer sprites with their own literal palettes, still carrying all 16
// canonical frame names so entity.js can walk them like anything else.
// ===========================================================================

/** Define a non-humanoid sprite of arbitrary size with the 16 canonical frames. */
function creature(name, w, h, dirs, anim = {}, palette = {}) {
  const pad = (rows) => {
    const out = [];
    for (let y = 0; y < h; y++) {
      let r = rows && rows[y] != null ? String(rows[y]) : '';
      if (r.length < w) r += '.'.repeat(w - r.length);
      out.push(r.slice(0, w));
    }
    return out;
  };
  const mir = (rows) => pad(rows).map((r) => r.split('').reverse().join(''));
  const padRow = (s) => {
    let r = String(s);
    if (r.length < w) r += '.'.repeat(w - r.length);
    return r.slice(0, w);
  };
  const grids = {
    down: pad(dirs.down || []),
    left: pad(dirs.left || dirs.down || []),
    up: pad(dirs.up || dirs.down || []),
    right: dirs.right ? pad(dirs.right) : mir(dirs.left || dirs.down || []),
  };
  const flipAnim = (a) => {
    if (!a) return null;
    const one = (o) => {
      if (!o) return null;
      const r = {};
      for (const k of Object.keys(o)) r[k] = padRow(o[k]).split('').reverse().join('');
      return r;
    };
    return { 1: one(a[2]) || one(a[1]), 2: one(a[1]) || one(a[2]), 3: one(a[3]) };
  };
  const anims = {
    down: anim.down || null,
    left: anim.left || null,
    right: anim.right !== undefined ? anim.right : flipAnim(anim.left),
    up: anim.up !== undefined ? anim.up : (anim.down || null),
  };
  const apply = (base, p) => {
    if (!p) return base;
    const out = base.slice();
    for (const k of Object.keys(p)) out[Number(k)] = padRow(p[k]);
    return out;
  };
  const frames = {};
  for (const d of DIRS4) {
    const base = grids[d];
    const a = anims[d] || {};
    frames[`${d}-0`] = base;
    frames[`${d}-1`] = apply(base, a[1]);
    frames[`${d}-2`] = apply(base, a[2]);
    frames[`${d}-3`] = apply(base, a[3] || a[1]);
  }
  return define(name, { w, h, palette, frames, anims: ANIMS });
}

const BEAST_PAL = (fur, dark, light, extra = {}) => ({
  K: '#160f0b', f: fur, F: dark, g: light, e: '#1a1410',
  n: '#c98d7a', W: '#f2ece0', G: '#c8bda8', y: '#e0a020', r: '#b02a2a',
  ...extra,
});

creature('dog', 16, 16, {
  down: [
    '................', '................', '................', '................',
    '....KK....KK....',
    '...KffKKKKffK...',
    '...KfeffffefK...',
    '...KffFFFFffK...',
    '....KFnnnnFK....',
    '...KffffffffK...',
    '..KffffffffffK..',
    '..KffffffffffK..',
    '..KFffffffffFK..',
    '..KFFffffffFFK..',
    '...KKFFFFFFKK...',
    '....KK....KK....',
  ],
  left: [
    '................', '................', '................', '................',
    '................',
    '..KK............',
    '.KffK......KK...',
    'KffffKKKKKKffK..',
    'KnfeffffffffFK..',
    '.KffffffffffFK..',
    '.KFffffffffFFK..',
    '..KFFFFFFFFFK...',
    '..KfK....KfK....',
    '..KfK....KfK....',
    '..KFK....KFK....',
    '..KKK....KKK....',
  ],
  up: [
    '................', '................', '................', '................',
    '....KK....KK....',
    '...KFFKKKKFFK...',
    '...KFFFFFFFFK...',
    '...KFFFFFFFFK...',
    '....KFFFFFFK....',
    '...KffffffffK...',
    '..KffffffffffK..',
    '..KffffffffffK..',
    '..KFffffffffFK..',
    '..KFFFffffFFFK..',
    '...KKFFFFFFKK...',
    '....KK....KK....',
  ],
}, {
  down: { 1: { 15: '...KK......KK...' }, 2: { 15: '.....KK..KK.....' } },
  left: {
    1: { 12: '.KfK.....KfK....', 13: '.KfK.....KfK....', 14: '.KFK.....KFK....', 15: '.KKK.....KKK....' },
    2: { 12: '...KfK..KfK.....', 13: '...KfK..KfK.....', 14: '...KFK..KFK.....', 15: '...KKK..KKK.....' },
  },
}, BEAST_PAL('#a8763e', '#7a5228', '#c99a5e'));

creature('cat', 16, 16, {
  down: [
    '................', '................', '................', '................', '................',
    '...KK......KK...',
    '...KfK....KfK...',
    '...KffKKKKffK...',
    '...KfeffffefK...',
    '....KFnnnnFK....',
    '....KffffffK....',
    '...KffffffffK...',
    '...KffffffffK...',
    '...KFffffffFK...',
    '....KFFFFFFK....',
    '....KK....KK....',
  ],
  left: [
    '................', '................', '................', '................', '................',
    '.KK.............',
    '.KfK.......KK...',
    'KffKKKKKKKKfK...',
    'KnfefffffffFK...',
    '.KfffffffffFK...',
    '.KFffffffffFK...',
    '..KFFFFFFFFFK...',
    '..KfK...KfK.....',
    '..KfK...KfK.....',
    '..KFK...KFK.....',
    '..KKK...KKK.....',
  ],
  up: [
    '................', '................', '................', '................', '................',
    '...KK......KK...',
    '...KFK....KFK...',
    '...KFFKKKKFFK...',
    '...KFFFFFFFFK...',
    '....KFFFFFFK....',
    '....KffffffK....',
    '...KffffffffK...',
    '...KffffffffK...',
    '...KFffffffFK...',
    '....KFFFFFFK....',
    '....KK....KK....',
  ],
}, {
  down: { 1: { 15: '...KK......KK...' }, 2: { 15: '.....KK..KK.....' } },
  left: {
    1: { 12: '.KfK....KfK.....', 13: '.KfK....KfK.....', 14: '.KFK....KFK.....', 15: '.KKK....KKK.....' },
    2: { 12: '...KfK...KfK....', 13: '...KfK...KfK....', 14: '...KFK...KFK....', 15: '...KKK...KKK....' },
  },
}, BEAST_PAL('#6a6258', '#48423a', '#8e867a'));

creature('chicken', 16, 16, {
  down: [
    '................', '................', '................', '................',
    '................', '................',
    '......KrK.......',
    '.....KWWWK......',
    '.....KeWeK......',
    '.....KWyWK......',
    '.....KWWWK......',
    '.....KWWWWK.....',
    '....KWWWWWWK....',
    '....KWWWWWWK....',
    '....KGWWWWGK....',
    '.....y....y.....',
  ],
  left: [
    '................', '................', '................', '................',
    '................', '................',
    '.....KrK........',
    '....KWWWK.......',
    '....KeWWK.......',
    '...yKWWWK.......',
    '....KWWWKK......',
    '....KWWWWWKK....',
    '...KWWWWWWWGK...',
    '...KWWWWWWWGK...',
    '...KGWWWWWGK....',
    '.....y..y.......',
  ],
  up: [
    '................', '................', '................', '................',
    '................', '................',
    '......KrK.......',
    '.....KWWWK......',
    '.....KWWWK......',
    '.....KWWWK......',
    '.....KGGGK......',
    '.....KWWWWK.....',
    '....KWWWWWWK....',
    '....KWGGGGWK....',
    '....KGGGGGGK....',
    '.....y....y.....',
  ],
}, {
  down: { 1: { 15: '....y......y....' }, 2: { 15: '......y..y......' } },
  left: { 1: { 15: '...y....y.......' }, 2: { 15: '......y..y......' } },
}, BEAST_PAL('#e8e2d4', '#b8b0a0', '#f6f2e8'));

creature('horse', 24, 24, {
  down: [
    '........................', '........................',
    '........KK..KK..........',
    '........KfK.KfK.........',
    '........KffffffK........',
    '........KfefffeK........',
    '........KffffffK........',
    '.........KffffK.........',
    '.........KnnnnK.........',
    '.........KFFFFK.........',
    '......KffffffffffK......',
    '.....KffffffffffffK.....',
    '.....KffffffffffffK.....',
    '.....KFffffffffffFK.....',
    '.....KFffffffffffFK.....',
    '.....KFFffffffffFFK.....',
    '......KFFFFFFFFFFK......',
    '......KfK......KfK......',
    '......KfK......KfK......',
    '......KfK......KfK......',
    '......KfK......KfK......',
    '......KFK......KFK......',
    '......KFK......KFK......',
    '......KKK......KKK......',
  ],
  left: [
    '........................', '........................', '........................',
    '...KK...................',
    '..KffK..................',
    '..KfefK.................',
    '..KffffK................',
    '.KnfffffK...............',
    '.KFffffffK..............',
    '..KffffffK..............',
    '...KffffKKKKKKKK........',
    '...KffffffffffffgK......',
    '....KffffffffffffgK.....',
    '....KffffffffffffgK.....',
    '....KFffffffffffFgK.....',
    '....KFFffffffffFFgK.....',
    '.....KKFKKFFFFKKFKK.....',
    '......KfK....KfK........',
    '......KfK....KfK........',
    '......KfK....KfK........',
    '......KfK....KfK........',
    '......KFK....KFK........',
    '......KFK....KFK........',
    '......KKK....KKK........',
  ],
  up: [
    '........................', '........................',
    '........KK..KK..........',
    '........KFK.KFK.........',
    '........KFFFFFFK........',
    '........KFFFFFFK........',
    '........KFFFFFFK........',
    '.........KFFFFK.........',
    '.........KffffK.........',
    '.........KffffK.........',
    '......KffffffffffK......',
    '.....KffffffffffffK.....',
    '.....KffffffffffffK.....',
    '.....KFffffffffffFK.....',
    '.....KFfffFFffffFFK.....',
    '.....KFFffFFffffFFK.....',
    '......KFFFFFFFFFFK......',
    '......KfK......KfK......',
    '......KfK......KfK......',
    '......KfK......KfK......',
    '......KfK......KfK......',
    '......KFK......KFK......',
    '......KFK......KFK......',
    '......KKK......KKK......',
  ],
}, {
  down: {
    1: { 21: '.....KFK........KFK.....', 22: '.....KFK........KFK.....', 23: '.....KKK........KKK.....' },
    2: { 21: '.......KFK....KFK.......', 22: '.......KFK....KFK.......', 23: '.......KKK....KKK.......' },
  },
  left: {
    1: { 20: '.....KfK......KfK.......', 21: '.....KFK......KFK.......', 22: '.....KFK......KFK.......', 23: '.....KKK......KKK.......' },
    2: { 20: '.......KfK..KfK.........', 21: '.......KFK..KFK.........', 22: '.......KFK..KFK.........', 23: '.......KKK..KKK.........' },
  },
}, BEAST_PAL('#8a5f36', '#5f4022', '#b08a5a'));

creature('ox', 24, 24, {
  down: [
    '........................',
    '.....KooK......KooK.....',
    '....KoOK........KoOK....',
    '.....KOK...KK...KOK.....',
    '......KKKKfffKKKKK......',
    '........KffffffK........',
    '........KfefffeK........',
    '........KffffffK........',
    '.........KnnnnK.........',
    '.........KFFFFK.........',
    '.....KffffffffffffK.....',
    '....KffffffffffffffK....',
    '....KffffffffffffffK....',
    '....KFffffffffffffFK....',
    '....KFffffffffffffFK....',
    '....KFFffffffffffFFK....',
    '.....KFFFFFFFFFFFFK.....',
    '.....KfK........KfK.....',
    '.....KfK........KfK.....',
    '.....KfK........KfK.....',
    '.....KfK........KfK.....',
    '.....KFK........KFK.....',
    '.....KFK........KFK.....',
    '.....KKK........KKK.....',
  ],
  left: [
    '........................', '........................',
    '..KooK..................',
    '.KoOK.KK................',
    '..KKKffK................',
    '..KfffffK...............',
    '..KfefffK...............',
    '.KnffffffK..............',
    '.KFfffffffK.............',
    '..KffffffffKKKKKK.......',
    '..KffffffffffffffgK.....',
    '...KfffffffffffffgK.....',
    '...KfffffffffffffgK.....',
    '...KFfffffffffffFgK.....',
    '...KFFfffffffffFFgK.....',
    '....KKFKKFFFFFKKFKK.....',
    '.....KfK.....KfK........',
    '.....KfK.....KfK........',
    '.....KfK.....KfK........',
    '.....KfK.....KfK........',
    '.....KFK.....KFK........',
    '.....KFK.....KFK........',
    '.....KKK.....KKK........',
    '........................',
  ],
  up: [
    '........................',
    '.....KooK......KooK.....',
    '....KoOK........KoOK....',
    '.....KOK...KK...KOK.....',
    '......KKKKFFFKKKKK......',
    '........KFFFFFFK........',
    '........KFFFFFFK........',
    '........KFFFFFFK........',
    '.........KFFFFK.........',
    '.........KffffK.........',
    '.....KffffffffffffK.....',
    '....KffffffffffffffK....',
    '....KffffffffffffffK....',
    '....KFffffffffffffFK....',
    '....KFffFFffffFFffFK....',
    '....KFFffFFffffFFFFK....',
    '.....KFFFFFFFFFFFFK.....',
    '.....KfK........KfK.....',
    '.....KfK........KfK.....',
    '.....KfK........KfK.....',
    '.....KfK........KfK.....',
    '.....KFK........KFK.....',
    '.....KFK........KFK.....',
    '.....KKK........KKK.....',
  ],
}, {
  down: {
    1: { 21: '....KFK..........KFK....', 22: '....KFK..........KFK....', 23: '....KKK..........KKK....' },
    2: { 21: '......KFK......KFK......', 22: '......KFK......KFK......', 23: '......KKK......KKK......' },
  },
  left: {
    1: { 20: '....KfK.......KfK.......', 21: '....KFK.......KFK.......', 22: '....KFK.......KFK.......', 23: '....KKK.......KKK.......' },
    2: { 20: '......KfK...KfK.........', 21: '......KFK...KFK.........', 22: '......KFK...KFK.........', 23: '......KKK...KKK.........' },
  },
}, BEAST_PAL('#6e5744', '#4a3a2c', '#8f7a62', { o: '#cfc3a4', O: '#9a8f74' }));

// ===========================================================================
// REGISTRATION
// ===========================================================================

let registered = false;

/**
 * Hand every authored grid to the sprite engine. Safe to call more than once --
 * boot code, the character-creation preview and the sprite test page all call it.
 */
export function registerCharacterSprites() {
  if (registered) return PENDING.length;
  registered = true;
  for (const [name, def] of PENDING) defineSprite(name, def);
  return PENDING.length;
}

/** Every layer/NPC/creature name this module registers, for debug listings. */
export function characterSpriteNames() {
  return PENDING.map(([n]) => n);
}

export default registerCharacterSprites;
