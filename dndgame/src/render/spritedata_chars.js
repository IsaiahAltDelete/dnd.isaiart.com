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

import { defineSprite, makeColorway } from './sprites.js';
import { RAMPS } from './palette.js';
import { SATCHEL } from './satchel-art.js';
import { ARMORY, LEGACY_WEAPON_ART } from './weapon-art.js';
import NOBLE from './art/tailored-noble.js';
import DOUBLET from './art/tailored-doublet.js';
import COAT from './art/tailored-coat.js';
import ROBE from './art/tailored-robe.js';
import PLATE from './art/tailored-plate.js';
import JERKIN from './art/tailored-jerkin.js';
import SIDEPART from './art/coiffure-sidepart.js';
import UNDERCUT from './art/coiffure-undercut.js';
import LOCS from './art/coiffure-locs.js';
import AFRO from './art/coiffure-afro.js';
import LOWBUN from './art/coiffure-lowbun.js';
import TWINBRAIDS from './art/coiffure-twinbraids.js';

const TAILORED = { 'outfit-noble':NOBLE, 'outfit-doublet':DOUBLET,
  'outfit-coat':COAT, 'outfit-robe':ROBE, 'outfit-plate':PLATE, 'outfit-jerkin':JERKIN };

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
  // Materials that are the same for everyone -- a lute is spruce and walnut
  // whatever the bard wears, a straw hat is straw -- so they come straight off
  // the world's material ramps instead of a colorway token.
  u: RAMPS.wood[2], U: RAMPS.wood[1], v: RAMPS.wood[4],
  y: RAMPS.thatch[2], Y: RAMPS.thatch[1], Q: RAMPS.thatch[3],
  i: RAMPS.bone[3], I: RAMPS.bone[2],   // bleached linen: coifs, aprons
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

function define(name, def) { PENDING.push([name, def]); return name; }

/** Register a humanoid layer and remember its grids for the NPC baker. */
function layer(name, dirs, anim, paletteExtra) {
  const frames = walkSet(dirs, anim);
  if (name.startsWith('body-')) for (const d of ['down', 'left', 'right']) {
    frames[`${d}-3`] = frames[`${d}-3`].map((row, y) => y < 10 ? row.replaceAll('e', 'd') : row);
  }
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
  const profile=LEGACY_WEAPON_ART[name];
  const g = norm(profile?ARMORY.frames[profile]:grid);
  const m = mirror(g);
  const bob = (base) => ({ 1: rowsOf(shiftY(base, 1)), 2: rowsOf(shiftY(base, -1)), 3: rowsOf(shiftY(base, 1)) });
  return layer(name, { down: g, left: m, up: m }, {
    down: bob(g), left: bob(m), right: bob(g), up: bob(m),
  },profile?ARMORY.palette:undefined);
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
    20: '....KCCKKCCK....',
    21: '....KLLKKLLK....',
    22: '....KLLKKLLK....',
    23: '....KPPK........',
  },
  2: {
    20: '....KCCKKCCK....',
    21: '....KLLKKLLK....',
    22: '....KLLKKLLK....',
    23: '........KPPK....',
  },
};

// Side view: a two-pixel stride, near leg reaching forward, far leg trailing back.
const LEGS_S = {
  1: {
    20: '...KCCCKKCK.....',
    21: '...KLLLKKLK.....',
    22: '...KLLLKKLK.....',
    23: '...KPPPKKPK.....',
  },
  2: {
    20: '....KCKKCCCK....',
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
  '....KllsssdK....',
  '....KlHssHdK....',
  '....KlesledK....',
  '....KlssdssK....',
  '....KssddsK.....',
  '.....KssddK.....',
  '....KccccccK....',
  '...KsccccccsK...',
  '...KsccccccdK...',
  '...KsccccccdK...',
  '...KsCCCCCCdK...',
  '...KsccccccdK...',
  '...KlccccccdK...',
  '....KccccccK....',
  '....KCCCCCCK....',
  '....KCCKKCCK....',
  '....KCCKKCCK....',
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
  '....KHssssdK....',
  '...KsesssddK....',
  '...KKsssdddK....',
  '....KsssdddK....',
  '.....KssddK.....',
  '.....KccccK.....',
  '....KccccccK....',
  '...KsccccccK....',
  '...KsccccccK....',
  '...KsCCCCCcK....',
  '...KsccccccK....',
  '...KlccccccK....',
  '....KccccccK....',
  '....KCCCCCCK....',
  '....KCCKKCCK....',
  '....KCCKKCCK....',
  '....KLLKKLLK....',
  '....KLLKKLLK....',
  '....KPPKKPPK....',
];

const BODY_N_UP = [
  '................',
  '................',
  '.....KKKKKK.....',
  '....KllssssK....',
  '....KlsssssK....',
  '....KsssssdK....',
  '....KsssssdK....',
  '....KssssddK....',
  '....KssddddK....',
  '.....KssddK.....',
  '....KccccccK....',
  '...KsccccccsK...',
  '...KsccccccdK...',
  '...KsccccccdK...',
  '...KsCCCCCCdK...',
  '...KsccccccdK...',
  '...KsccccccdK...',
  '....KccccccK....',
  '....KCCCCCCK....',
  '....KCCKKCCK....',
  '....KCCKKCCK....',
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
  '.....KccccK.....',
  '....KsccccsK....',
  '....KsccccdK....',
  '....KsccccdK....',
  '....KsCCCCdK....',
  '....KsccccdK....',
  '....KlccccdK....',
  '....KccccccK....',
];
const SLIM_TORSO_S = [
  '.....KccccK.....',
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
  '...KccccccccK...',
  '..KsccccccccsK..',
  '..KsccccccccdK..',
  '..KsccccccccdK..',
  '..KsCCCCCCCCdK..',
  '..KsccccccccdK..',
  '..KlccccccccdK..',
  '...KccccccccK...',
];
const BROAD_TORSO_S = [
  '....KccccccK....',
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
  '...KccccccccK...',
  '..KsccccccccsK..',
  '..KsccccccccdK..',
  '..KsccccccccdK..',
  '..KsccccccccdK..',
  '..KsCCCCCCCCdK..',
  '..KsccccccccdK..',
  '..KlccccccccdK..',
];
const TALL_TORSO_S = [
  '....KccccccK....',
  '...KccccccccK...',
  '..KsccccccccK...',
  '..KsccccccccK...',
  '..KsccccccccK...',
  '..KsCCCCCCCcK...',
  '..KsccccccccK...',
  '..KlccccccccK...',
];
const TALL_LEGS = [
  '...KCCCCCCCCK...',
  '....KCCKKCCK....',
  '....KCCKKCCK....',
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

// --- body-stout: dwarf frame -- broad through the chest, short in the shank --
// The head cannot move: every helm, hair and horn layer is authored against
// rows 2-9. So a dwarf reads short by being thicker through the body with the
// legs starting a row lower, not by shrinking the sprite.
const STOUT_TORSO_D = [
  '...KccccccccK...',
  '..KsccccccccsK..',
  '..KsccccccccdK..',
  '..KsccccccccdK..',
  '..KsCCCCCCCCdK..',
  '..KsccccccccdK..',
  '..KsccccccccdK..',
  '..KlccccccccdK..',
  '...KccccccccK...',
];
const STOUT_TORSO_S = [
  '....KccccccK....',
  '...KccccccccK...',
  '..KsccccccccK...',
  '..KsccccccccK...',
  '..KsCCCCCCCcK...',
  '..KsccccccccK...',
  '..KsccccccccK...',
  '..KlccccccccK...',
  '...KccccccccK...',
];
const STOUT_LEGS = [
  '....KCCKKCCK....',
  '....KCCKKCCK....',
  '....KLLKKLLK....',
  '....KLLKKLLK....',
  '....KPPKKPPK....',
];

layer('body-stout',
  {
    down: BODY_N_DOWN.slice(0, 10).concat(STOUT_TORSO_D, STOUT_LEGS),
    left: BODY_N_LEFT.slice(0, 10).concat(STOUT_TORSO_S, STOUT_LEGS),
    up: BODY_N_UP.slice(0, 10).concat(STOUT_TORSO_D, STOUT_LEGS),
  },
  {
    down: { ...LEGS_F, 3: { 11: '..KccccccccccK..', 17: '..KsccccccccdK..' } },
    left: { ...LEGS_S, 3: { 11: '...KccccccccK...', 17: '..KsccccccccK...' } },
    up: { ...LEGS_F, 3: { 11: '..KccccccccccK..', 17: '..KsccccccccdK..' } },
  });

// --- body-small: halfling / gnome / child -- narrow body under a full head ---
const SMALL_BODY_D = [
  '.....KccccK.....',
  '....KsccccsK....',
  '....KsccccdK....',
  '....KsCCCCdK....',
  '....KsccccdK....',
  '....KlccccdK....',
  '.....KccccK.....',
  '....KCCCCCCK....',
  '....KCCKKCCK....',
  '....KCCKKCCK....',
  '....KLLKKLLK....',
  '....KLLKKLLK....',
  '....KPPKKPPK....',
];
const SMALL_BODY_S = [
  '.....KccccK.....',
  '....KccccccK....',
  '...KscccccK.....',
  '...KsCCCCcK.....',
  '...KscccccK.....',
  '...KlcccccK.....',
  '.....KccccK.....',
  '....KCCCCCCK....',
  '....KCCKKCCK....',
  '....KCCKKCCK....',
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

/**
 * Where each build's arms are, for the pose frames actor.js derives. Facing the
 * camera, `l` and `r` are the outline columns of the two arms (an arm is that
 * column plus the one inside it); side-on, `f` is the outline column of the near
 * arm when facing left (mirrored for right). Rows `top`..`bot` run from the
 * shoulder to the hand; everything from row 0 to `bot` is the upper body.
 */
export const BODY_ARMS = Object.freeze({
  'body-normal': { front: { l: 3, r: 12, top: 11, bot: 16 }, side: { f: 3, top: 12, bot: 16 } },
  'body-slim': { front: { l: 4, r: 11, top: 11, bot: 16 }, side: { f: 3, top: 12, bot: 16 } },
  'body-broad': { front: { l: 2, r: 13, top: 11, bot: 16 }, side: { f: 2, top: 12, bot: 16 } },
  'body-tall': { front: { l: 2, r: 13, top: 11, bot: 17 }, side: { f: 2, top: 12, bot: 17 } },
  'body-stout': { front: { l: 2, r: 13, top: 11, bot: 17 }, side: { f: 2, top: 12, bot: 17 } },
  'body-small': { front: { l: 4, r: 11, top: 11, bot: 15 }, side: { f: 3, top: 12, bot: 15 } },
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

// Authored three-view cuts share the same palette and animation contract as
// bodies. Braid/loc tips move a pixel on the stride, with their roots anchored.
for (const [name, art] of Object.entries({sidepart:SIDEPART, undercut:UNDERCUT, locs:LOCS, afro:AFRO, lowbun:LOWBUN, twinbraids:TWINBRAIDS})) {
  const motion = {};
  if (name === 'locs' || name === 'twinbraids') for (const dir of ['down','left','up']) {
    const rows = art.frames[dir], one = {}, two = {};
    for (let y = 9; y < 14; y++) {
      one[y] = rows[y].slice(1) + '.';
      two[y] = '.' + rows[y].slice(0,-1);
    }
    motion[dir] = {1:one, 2:two};
  }
  layer('hair-' + name, art.frames, motion, art.palette);
}

layer('hair-short', {
  down: at(1, [
    '.....KKKKKK.....',
    '....KjjhhhhK....',
    '....KjhhhhHK....',
    '....Khh..hHK....',
    '....Kh....HK....',
  ]),
  left: at(1, [
    '.....KKKKKK.....',
    '....KjjhhhhK....',
    '....KjhhhhHK....',
    '....Khh.hhHK....',
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
    '...Khh....hHK...',
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
    '....Khh..hhHK...',
    '.........KhhHK..',
    '.........KhhHK..',
    '.........KhhHK..',
    '.........KhhHK..',
    '.........KhhHK..',
    '.........KhhHK..',
    '.........KHhHK..',
    '..........KHK...',
  ]),
  // From behind, a long fall is most of the figure: a lit crown, a parting
  // that drifts as it falls, and the shadow side deepening toward the ends.
  up: at(1, [
    '.....KKKKKK.....',
    '....KjjhhhhK....',
    '...KjjjhhhhHK...',
    '...KjhhhhhhHK...',
    '...KhhhhHhhHK...',
    '...KhjhhHhhHK...',
    '...KhjhhHhHHK...',
    '...KhhhhHhHHK...',
    '...KhhhHhhHHK...',
    '...KhhhHhhHHK...',
    '...KHhhHhhHHK...',
    '....KHHHHHHK....',
    '.....KKKKKK.....',
  ]),
});

layer('hair-ponytail', {
  down: at(1, [
    '.....KKKKKK.....',
    '....KjjhhhhK....',
    '....KjhhhhHK....',
    '....Khh...KhK...',
    '....Kh....KhK...',
    '..........KhK...',
    '..........KHK...',
    '...........K....',
  ]),
  left: at(1, [
    '.....KKKKKK.....',
    '....KjjhhhhK....',
    '....KjhhhhHK....',
    '....Khh.hhHK....',
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
    '....Khh...KhK...',
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
    '....Khh.hhHK....',
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
    '...Khh....hHK...',
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
    '....Khh.hhhHK...',
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
    '....KhhhhhHK....',
    '.......hh.......',
  ]),
  left: at(1, [
    '.....KKKKKK.....',
    '....KjjhhhhK....',
    '....KjhhhhHK....',
    '....KjhhhhHK....',
    '....Khh.KhHK....',
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
/**
 * Pull a row in by one pixel each side, moving its outline with it. Used to
 * slope a shoulder line: row 10 used to run the full cols 3-12 like row 11, so
 * every torso -- body and outfit alike -- met the neck as a hard square corner
 * and the whole character read as a slab with a head on it.
 */
function insetRow(row) {
  const c = row.split('');
  let a = c.findIndex((ch) => ch !== '.');
  let b = c.length - 1 - c.slice().reverse().findIndex((ch) => ch !== '.');
  if (a < 0 || b <= a + 2) return row;
  c[a] = '.'; c[b] = '.';
  c[a + 1] = 'K'; c[b - 1] = 'K';
  return c.join('');
}

function outfit(name, rows, anim) {
  const art=TAILORED[name];
  if(art) {
    const dirs=art.frames;
    const motion={};
    if(name==='outfit-robe')for(const dir of ['down','left','up']) {
      const hem=dirs[dir][22];
      motion[dir]={1:{22:hem.slice(1)+'.'},2:{22:'.'+hem.slice(0,-1)}};
    }
    return layer(name,dirs,motion);
  }
  const g = norm(rows);
  // Every outfit's first authored row is the top of the sleeves, and it sits on
  // the body's sloped shoulder -- so it gets the same slope, without each
  // outfit having to remember to draw one.
  g[10] = insetRow(g[10]);
  // Model the cloth and armour as separate planes. Keep the authored insignia,
  // straps and equipment colours that also identify this person in a portrait.
  const shade = { a: 'A', b: 'B', c: 'C', L: 'P', m: 'M', t: 'T' };
  const light = { a: 'q', m: 'n' };
  const tailored = (dir) => g.map((row, y) => {
    if (y < 10) return row;
    const r = [...row];
    for (let x = 0; x < r.length; x++) {
      const c = r[x];
      if (x >= 10 || (dir === 'left' && x >= 8)) r[x] = shade[c] || c;
      else if (x === 5 && y < 14) r[x] = light[c] || c;
      // Long cloth hangs in folds, rather than a solid rectangle.
      else if (y >= 16 && (x === 9 || (x === 6 && y >= 19))) r[x] = shade[c] || c;
    }
    if (dir === 'up') {
      // Back seam; no duplicate front-facing buckle on the back of a coat.
      if (y >= 11 && y <= 17 && shade[r[8]]) r[8] = shade[r[8]];
    } else if (dir === 'down') {
      if (y === 10 && /[aLcm]/.test(r[7])) { r[7] = 'C'; r[8] = 'C'; }
      if (y === 14 && r[7] === 'L' && r[8] === 'L') { r[7] = 't'; r[8] = 'T'; }
    } else {
      // Near sleeve separates from the chest in profile.
      if (y >= 11 && y <= 13 && shade[r[6]]) r[6] = shade[r[6]];
    }
    return r.join('');
  });
  return layer(name, { down: tailored('down'), left: tailored('left'), up: tailored('up') }, anim);
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


// --- class dress ----------------------------------------------------------
// Unarmoured adventurers used to collapse into three looks: robe, monastic
// wrap, or the same brown tunic for everybody else -- a party of six read as
// one costume. These are the working clothes of each calling, so a bard is a
// bard from across the room.

// Fighter: a quilted gambeson, the padding you wear when you cannot afford mail.
outfit('outfit-gambeson', at(10, [
  '...KaaaaaaaaK...',
  '...KaAaaaaAaK...',
  '...KAaAaaAaAK...',
  '...KAaaAAaaAK...',
  '.....LLLLLL.....',
  '.....aAaaAa.....',
  '.....aaAAaa.....',
  '....KaaaaaaK....',
  '....KAAAAAAK....',
]));

// Rogue: dark jerkin with a baldric cutting across the chest.
outfit('outfit-jerkin', at(10, [
  '...KPLLLLLLPK...',
  '...KPxLLLLLPK...',
  '...KPLxLLLLPK...',
  '...KPLLxLLLPK...',
  '.....LLxLLL.....',
  '.....PPxPPP.....',
  '.....LLLLLL.....',
  '....KLLLLLLK....',
  '....KPPPPPPK....',
]));

// Bard: a parti-coloured doublet, the two halves in the wearer's own colours.
outfit('outfit-doublet', at(10, [
  '...KaaaabbbbK...',
  '...KaqaabbBbK...',
  '...KAaaabbbBK...',
  '...KAaaabbbBK...',
  '.....tttttt.....',
  '.....aaabbb.....',
  '.....aaabbb.....',
  '....KaaabbbK....',
  '....KAAABBBK....',
]));

// Ranger: leather harness over a cloth shirt, quiver strap on the chest.
outfit('outfit-ranger', at(10, [
  '...KLLccccLLK...',
  '...KLccccccLK...',
  '...KPccccccPK...',
  '...KPcxccccPK...',
  '.....LLLLLL.....',
  '.....cxcccc.....',
  '.....cccccc.....',
  '....KccccccK....',
  '....KLLLLLLK....',
]));

// Cleric: vestments with a stole hanging the length of the front.
outfit('outfit-vestments', at(10, [
  '...KattttttaK...',
  '...KAattttaAK...',
  '...KAatxxtaAK...',
  '...KAatxxtaAK...',
  '.....atxxta.....',
  '.....LtxxtL.....',
  '.....atxxta.....',
  '....KatxxtaK....',
  '....KAAxxAAK....',
]));

// Druid: rough homespun, cord belt, a hem left deliberately ragged.
outfit('outfit-druidwear', at(10, [
  '...KccaaaaccK...',
  '...KcaaaaaacK...',
  '...KCaaaaaaCK...',
  '...KCaaqqaaCK...',
  '.....LxxxxL.....',
  '.....aaaaaa.....',
  '.....aqaaqa.....',
  '....KaaaaaaK....',
  '....KACAACAK....',
]));

// Warlock: a long coat worn open over a shirt, collar up.
outfit('outfit-coat', at(10, [
  '...KAabbbbaAK...',
  '...KAabccbaAK...',
  '...KAabccbaAK...',
  '...KAabccbaAK...',
  '.....abccba.....',
  '.....LbccbL.....',
  '.....abccba.....',
  '....KabccbaK....',
  '....KAAbbAAK....',
]));

// Barbarian: a fur mantle and a wide belt, and nothing else worth the weight.
outfit('outfit-fur', at(10, [
  '...KLPLLLLPLK...',
  '...KPLLssLLPK...',
  '...KssssssddK...',
  '...KssdssdsdK...',
  '.....LLLLLL.....',
  '.....sssssd.....',
  '.....ssdsdd.....',
  '....KLLLLLLK....',
  '....KPLPPLPK....',
]));

// Paladin: a tabard over mail, the device down the centre.
outfit('outfit-tabard', at(10, [
  '...KmMaaaaMmK...',
  '...KmMaxxaMmK...',
  '...KmMaxxaMmK...',
  '...KmMaxxaMmK...',
  '.....maxxam.....',
  '.....LtxxtL.....',
  '.....maxxam.....',
  '....KmaxxamK....',
  '....KMAxxAMK....',
]));

// ===========================================================================
// CLASS MARKS. At 16x24 a calling is read from across the room by one or two
// things that stick out of the silhouette -- a pelt that widens the shoulders,
// a lute neck beside the head, fletching over a shoulder. actor.js adds these
// by class on top of whatever the character wears, so a paladin in plate is
// still a paladin and not a knight.
//
// `mark-*` layers go over the outfit. `back-*` layers are slung on the back:
// the compositor draws them behind the body (after the cloak) for every facing
// but `up`, where they are drawn over the back -- so from the front only the
// parts that clear the body show, which is exactly what a slung lute looks like.
// ===========================================================================

// Barbarian: a pelt over the shoulders, open on the chest, collar up round the
// neck, tufts breaking its edge over the arms. In MAIN, the class's leather-brown.
layer('mark-furs', {
  down: at(9, [
    '..KKq......aKK..',
    '..KqqaqaaqaaAK..',
    '..KqaA....aAAK..',
    '....A......A....',
  ]),
  left: at(9, [
    '...KK.....KaK...',
    '...KqqaqaaaAK...',
    '...KqaAaaaaAAK..',
    '....A.....A.....',
  ]),
  up: at(9, [
    '..KKqaaaaaaAKK..',
    '..KqqaqaaqaaAK..',
    '..KqaAaqaaaAAK..',
    '..KAaAaaAaaAAK..',
    '....A..A..A.....',
  ]),
});

// Paladin over armour: the surcoat of the order, its device on the chest, and
// the same on the back. (Unarmoured, outfit-tabard already is one.)
layer('mark-tabard', {
  down: at(11, [
    '.....qaxxaA.....',
    '.....axxxxA.....',
    '.....aaxxaA.....',
    '.....LLttLL.....',
    '.....qaaaaA.....',
    '.....qaaaaA.....',
    '.....aaaaAA.....',
    '.....aAaaAA.....',
  ]),
  left: at(11, [
    '....qaxaA.......',
    '....axxxA.......',
    '....aaxaA.......',
    '....LLLLL.......',
    '....qaaaA.......',
    '....qaaaA.......',
    '....aaaAA.......',
    '....aAaAA.......',
  ]),
  up: at(11, [
    '.....qaxxaA.....',
    '.....axxxxA.....',
    '.....aaxxaA.....',
    '.....LLLLLL.....',
    '.....qaaaaA.....',
    '.....qaaaaA.....',
    '.....aaaaAA.....',
    '.....aAaaAA.....',
  ]),
});

// Cleric in armour: the holy symbol on its chain, gold on the grey of mail.
// (Vestments carry the stole instead, which says the same thing louder.)
layer('mark-symbol', {
  down: at(10, [
    '......T..T......',
    '.......TT.......',
    '.......Wx.......',
    '.......xX.......',
  ]),
  left: at(11, [
    '.....T..........',
    '.....Wx.........',
    '.....xX.........',
  ]),
  up: [],
});

// Bard: a lute slung across the back, bowl low, neck up past the shoulder.
// Authored as seen from behind; the front view is its mirror.
const LUTE_BACK = at(2, [
  '.............KK.',
  '............KUUK',
  '............KuK.',
  '............KuK.',
  '...........KuK..',
  '...........KuK..',
  '..........KuK...',
  '..........KuK...',
  '.........KuK....',
  '........KuK.....',
  '...KKKKKuKK.....',
  '..KvuvuuUuK.....',
  '.KvuvuuUuUuK....',
  '.KvuvuuUuUuK....',
  '.KuuvuuUuUUK....',
  '.KuuuuUuUUUK....',
  '..KuuUuUUUK.....',
  '...KKKKKKK......',
]);
layer('back-lute', {
  down: mirror(LUTE_BACK),
  left: at(3, [
    '.............KK.',
    '............KUUK',
    '............KuK.',
    '............KuK.',
    '............KuK.',
    '............KuK.',
    '............KuK.',
    '............KuK.',
    '...........KKuKK',
    '...........KvvuK',
    '...........KvvuK',
    '...........KvvuK',
    '...........KvvuK',
    '...........KvvuK',
    '............KuK.',
    '.............K..',
  ]),
  up: LUTE_BACK,
});

// Ranger: a quiver across the back, fletching showing over the shoulder.
const QUIVER_BACK = at(4, [
  '............KKK.',
  '............WxW.',
  '...........KLLLK',
  '...........KLPK.',
  '..........KLPK..',
  '.........KLPK...',
  '........KLPK....',
  '.......KLPK.....',
  '......KLPK......',
  '.....KLPK.......',
  '.....KPK........',
  '......K.........',
]);
layer('back-quiver', {
  down: mirror(QUIVER_BACK),
  left: at(4, [
    '............KKK.',
    '............WxW.',
    '...........KLLLK',
    '............KLPK',
    '............KLPK',
    '............KLPK',
    '............KLPK',
    '............KLPK',
    '............KLPK',
    '............KPPK',
    '.............KK.',
  ]),
  up: QUIVER_BACK,
});

// Porters and pedlars: a roped burlap pack high on the back. From the front it
// is the straps and a pack wider than the shoulders; from the side, the load.
const PACK_BACK = at(9, [
  '...KKKKKKKKKK...',
  '..KQQyyyyyyyYK..',
  '..KQyyyyyyyyYK..',
  '..KyyyyyyyyYYK..',
  '..KLLLLLLLLLLK..',
  '..KyyyyyyyyYYK..',
  '..KyyyyyyyYYYK..',
  '..KYyyyyyYYYYK..',
  '...KYYYYYYYYK...',
  '....KKKKKKKK....',
]);
layer('back-pack', {
  down: PACK_BACK,
  left: at(9, [
    '..........KKKK..',
    '.........KQyyYK.',
    '.........KQyyYYK',
    '.........KyyyYYK',
    '.........KLLLLLK',
    '.........KyyyYYK',
    '.........KyyyYYK',
    '.........KyyYYYK',
    '..........KYYYK.',
    '...........KKK..',
  ]),
  up: PACK_BACK,
});

// A bib apron: innkeepers, cooks, goodwives, anyone who works a hearth.
layer('mark-apron', {
  down: at(12, [
    '......iiii......',
    '......iiiI......',
    '.....LiiiIL.....',
    '.....iiiiiI.....',
    '.....iiiiiI.....',
    '.....iiiiII.....',
    '.....iIiIII.....',
  ]),
  left: at(12, [
    '.....ii.........',
    '.....iI.........',
    '....LiiL........',
    '....iiI.........',
    '....iiI.........',
    '....iII.........',
    '....IiI.........',
  ]),
  up: at(14, ['.......ii.......', '......i..i......']),
});

layer('mark-straps', {
  down: at(10, ['.....L....L.....', '.....L....L.....', '.....P....P.....', '.....P....P.....']),
  left: at(10, ['.........L......', '........LP......', '.......LP.......']),
  up: [],
});

// ===========================================================================
// SPECIES FEATURES. data/species.js has always declared snout, scales, tusks
// and markings, and nothing ever drew them -- so a dragonborn was a human
// wearing horns and a half-orc was a broad human. One layer each, over the
// face, under the hair.
// ===========================================================================

// Dragonborn muzzle. Drawn in the HORN colour, which is the species' scale hue.
layer('face-snout', {
  down: at(7, [
    '.....KooooK.....',
    '.....KoOOoK.....',
    '.....KOOOOK.....',
  ]),
  left: at(6, [
    '.Kooooo.........',
    '.KoOOoo.........',
    '..KOOoo.........',
  ]),
  up: [],
});

// A brow ridge of scale across the top of the face.
layer('face-scales', {
  down: at(5, ['....KooooooK....']),
  left: at(5, ['...KoooooooK....']),
  up: at(5, ['....KooooooK....']),
});

// Orc and half-orc tusks, rising past the mouth.
layer('face-tusks', {
  down: at(6, [
    '......W..W......',
    '......W..W......',
    '.....KW..WK.....',
  ]),
  left: at(6, [
    '...W............',
    '..WW............',
    '..KW............',
  ]),
  up: [],
});

// Tabaxi muzzle: a pale mask around a dark nose.
layer('face-muzzle', {
  down: at(7, [
    '......lZZl......',
    '......WWWW......',
  ]),
  left: at(7, [
    '...ZWl..........',
    '...WWl..........',
  ]),
  up: [],
});

// Goliath lithoderms -- the raised, stone-coloured patches of their heritage.
layer('face-markings', {
  down: at(6, [
    '.....o....o.....',
    '.....o....o.....',
    '.....O....O.....',
  ]),
  left: at(6, [
    '....o...........',
    '....o...........',
    '....O...........',
  ]),
  up: at(6, [
    '.....o....o.....',
    '.....o....o.....',
    '.....O....O.....',
  ]),
});

export const OUTFIT_STYLES = Object.freeze([
  { id: 'outfit-tunic', name: 'Tunic' },
  { id: 'outfit-peasant', name: 'Homespun' },
  { id: 'outfit-robe', name: 'Robes' },
  { id: 'outfit-noble', name: 'Fine Clothes' },
  { id: 'outfit-monk', name: 'Monastic Wrap' },
  { id: 'outfit-gambeson', name: 'Gambeson' },
  { id: 'outfit-jerkin', name: 'Jerkin' },
  { id: 'outfit-doublet', name: 'Doublet' },
  { id: 'outfit-ranger', name: 'Ranger Leathers' },
  { id: 'outfit-vestments', name: 'Vestments' },
  { id: 'outfit-druidwear', name: 'Rough Robe' },
  { id: 'outfit-coat', name: 'Long Coat' },
  { id: 'outfit-fur', name: 'Fur Mantle' },
  { id: 'outfit-tabard', name: 'Tabard' },
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

// Seen from behind, the compositor draws the cloak OVER the back, so its back
// view is a drape of its own: it falls from a collar round the neck, widens
// over the shoulders (hiding the arms, as a cloak does) and breaks into folds.
const CLOAK_BACK_TOP = [
  '....KbbbbbbK....',
  '...KbbbbbbbbK...',
  '..KbbbbbbbbbBK..',
  '.KbbbbbbBbbbBBK.',
  '.KbbbbbbBbbbBBK.',
  '.KBbbbbbBbbBBBK.',
];
const CLOAK_BACK_LONG = CLOAK_BACK_TOP.concat([
  '.KbbbbbbBbbbBBK.',
  '.KbbbbbBbBbbBBK.',
  '.KBbbbbBbBbbBBK.',
  '.KBbbbbBbBbBBBK.',
  '.KBbbbBbbBbBBBK.',
  '.KBBbBBBBBBBBBK.',
  '.KKKKKKKKKKKKKK.',
]);
// A-line: fullest at the hem, which swings a pixel either way with the stride.
const SWAY_LONG_BACK = {
  1: { 20: 'KBbbbBbbBbBBBK..', 21: 'KBBbBBBBBBBBBK..', 22: 'KKKKKKKKKKKKKK..' },
  2: { 20: '..KBbbbBbbBbBBBK', 21: '..KBBbBBBBBBBBBK', 22: '..KKKKKKKKKKKKKK' },
};
const CLOAK_BACK_SHORT = CLOAK_BACK_TOP.concat(['.KBBbBBBBbBBBBK.', '..KKKKKKKKKKKK..']);

layer('cloak-short',
  (() => {
    const g = at(10, CLOAK_TOP.concat(['..KBBBBBBBBBBK..', '...KKKKKKKKKK...']));
    return { down: g, left: g, up: at(10, CLOAK_BACK_SHORT) };
  })(),
  {
    down: { 1: { 16: '.KBBBBBBBBBBK...', 17: '..KKKKKKKKKK....' }, 2: { 16: '...KBBBBBBBBBBK.', 17: '....KKKKKKKKKK..' } },
    left: { 1: { 16: '.KBBBBBBBBBBK...', 17: '..KKKKKKKKKK....' }, 2: { 16: '...KBBBBBBBBBBK.', 17: '....KKKKKKKKKK..' } },
    up: { 1: { 16: 'KBBbBBBBbBBBBK..', 17: '.KKKKKKKKKKKK...' }, 2: { 16: '..KBBbBBBBbBBBBK', 17: '...KKKKKKKKKKKK.' } },
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
  (() => { const g = at(10, CLOAK_LONG_ROWS); return { down: g, left: g, up: at(10, CLOAK_BACK_LONG) }; })(),
  {
    up: SWAY_LONG_BACK,
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
    up: flatten([at(10, CLOAK_BACK_LONG), HOOD_BACK]),
  },
  {
    up: SWAY_LONG_BACK,
    down: {
      1: { 20: '.KBBBBBBBBBBK...', 21: '..KBBBBBBBBK....', 22: '...KKKKKKKK.....' },
      2: { 20: '...KBBBBBBBBBBK.', 21: '....KBBBBBBBBK..', 22: '.....KKKKKKKK...' },
    },
    left: {
      1: { 20: '.KBBBBBBBBBBK...', 21: '..KBBBBBBBBK....', 22: '...KKKKKKKK.....' },
      2: { 20: '...KBBBBBBBBBBK.', 21: '....KBBBBBBBBK..', 22: '.....KKKKKKKK...' },
    },
  });


// ===========================================================================
// BOOTS. Footwear used to be painted into the body layer itself -- three rows
// of LEATHER at the bottom of every character, identical for a barefoot monk
// and a knight in plate. This is a real layer, drawn over the body's legs and
// under the outfit, so a long robe still falls over the top of it.
//
// The masks are the body's own walk patches recoloured, so a boot swings with
// the leg it is on instead of standing still while the leg moves.
// ===========================================================================

/** Recolour a leg patch table: { rowIndex: gridRow } with tokens swapped. */
function recolourLegs(table, map) {
  const out = {};
  for (const frame of Object.keys(table)) {
    const rows = {};
    for (const r of Object.keys(table[frame])) {
      rows[r] = table[frame][r].replace(/[CLP]/g, (ch) => (map[ch] != null ? map[ch] : ch));
    }
    out[frame] = rows;
  }
  return out;
}

/**
 * A boot layer. `rows` are the four base rows 20..23; `map` recolours the
 * shared walk patches to match them.
 */
function boots(name, rows, map) {
  const g = at(20, rows);
  const anim = {
    down: recolourLegs(LEGS_F, map),
    left: recolourLegs(LEGS_S, map),
    up: recolourLegs(LEGS_F, map),
  };
  return layer(name, { down: g, left: g, up: g }, anim);
}

emptyLayer('boots-none');

// Knee-high riding leather with a turned cuff. The default for most people.
boots('boots-tall', [
  '....KttKKttK....',
  '....KLLKKLLK....',
  '....KLLKKLLK....',
  '....KPPKKPPK....',
], { C: 't', L: 'L', P: 'P' });

// Short, hard-wearing, folded over at the ankle.
boots('boots-cuffed', [
  '....KCCKKCCK....',
  '....KttKKttK....',
  '....KLLKKLLK....',
  '....KPPKKPPK....',
], { C: 'C', L: 'L', P: 'P' });

// Sandals and bare feet: the monk, and anyone who walks the Old Faith's roads.
boots('boots-sandal', [
  '....KssKKssK....',
  '....KLsKKsLK....',
  '....KssKKssK....',
  '....KLLKKLLK....',
], { C: 's', L: 's', P: 'L' });

// Cloth wraps to the calf -- barbarians, druids, anyone shod by hand.
boots('boots-wraps', [
  '....KcCKKCcK....',
  '....KCcKKcCK....',
  '....KcCKKCcK....',
  '....KPPKKPPK....',
], { C: 'c', L: 'C', P: 'P' });

// Sabatons. Steel over the whole foot, banded at the ankle.
boots('boots-plate', [
  '....KmmKKmmK....',
  '....KnmKKmnK....',
  '....KmmKKmmK....',
  '....KMMKKMMK....',
], { C: 'm', L: 'm', P: 'M' });

// Court shoes: soft leather, a bright buckle, no use whatsoever off a floor.
boots('boots-court', [
  '....KCCKKCCK....',
  '....KLLKKLLK....',
  '....KLtKKtLK....',
  '....KPPKKPPK....',
], { C: 'C', L: 'L', P: 'P' });

export const BOOT_STYLES = Object.freeze([
  { id: 'auto', name: 'By Calling' },
  { id: 'boots-none', name: 'Barefoot' },
  { id: 'boots-tall', name: 'Riding Boots' },
  { id: 'boots-cuffed', name: 'Cuffed Boots' },
  { id: 'boots-sandal', name: 'Sandals' },
  { id: 'boots-wraps', name: 'Foot Wraps' },
  { id: 'boots-plate', name: 'Sabatons' },
  { id: 'boots-court', name: 'Court Shoes' },
]);

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

// A cone that bends its tip back, a band of the trim colour, and a brim wide
// enough to break the head's outline on both sides -- the one hat nobody mistakes.
const HELM_WIZARD = at(0, [
  '.........KK.....',
  '.....KKqaAK.....',
  '....KqqaaaAK....',
  '...KqqaaaaaAK...',
  '..KxxxxxxxxxxK..',
  '.KKqqaaaaaaAAKK.',
  '..KK........KK..',
]);
layer('helm-wizard', { down: HELM_WIZARD, left: HELM_WIZARD, up: HELM_WIZARD });

const HELM_CIRCLET = at(4, [
  '....KttxxttK....',
  '....KTTTTTTK....',
]);
layer('helm-circlet', { down: HELM_CIRCLET, left: HELM_CIRCLET, up: HELM_CIRCLET });

// A farmer's broad straw hat: low crown, leather band, a brim that droops.
const HELM_STRAW = at(1, [
  '......KKKK......',
  '.....KQyyyK.....',
  '..KKKLLLLLLKKK..',
  '.KKQQyyyyyyYYKK.',
  '..KY........YK..',
]);
layer('helm-straw', { down: HELM_STRAW, left: HELM_STRAW, up: HELM_STRAW });

// A goodwife's linen coif: it frames the face and ties under the jaw.
layer('helm-coif', {
  down: at(1, [
    '.....KKKKKK.....',
    '....KiiiiiiK....',
    '...KiiiiiiiIK...',
    '...Ki......IK...',
    '...Ki......IK...',
    '...KI......IK...',
    '....KI....IK....',
  ]),
  left: at(1, [
    '.....KKKKKK.....',
    '....KiiiiiiK....',
    '...KiiiiiiiIK...',
    '...Ki.....iIK...',
    '...Ki.....IIK...',
    '......KiiIIK....',
    '.......KIIK.....',
  ]),
  up: at(1, [
    '.....KKKKKK.....',
    '....KiiiiiiK....',
    '...KiiiiiiiIK...',
    '...KiiiiiiiIK...',
    '...KiiiiiiIIK...',
    '...KIiiiiiIIK...',
    '....KIIIIIIK....',
  ]),
});

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
  { id: 'helm-straw', name: 'Straw Hat' },
  { id: 'helm-coif', name: 'Linen Coif' },
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
// grids once and keep semantic color tokens with a profession default palette.
// Named NPC colors override that default, while identity-based variants change
// hair, beards and civilian accessories without changing equipment or species.
// ===========================================================================

/**
 * Flatten a stack of layer grids into a finished 16x24 character.
 * `stack` must be listed back-to-front, matching actor.js's draw order:
 * cloak, tail, body, ears, hair, beard, outfit, horns, helm, shield, weapon.
 */
const NPC_BODY = Object.create(null);   // family sprite (and its variants) -> body layer
const NPC_LOOK = Object.create(null);   // family sprite (and each variant) -> { stack, colors }

/** The body layer a baked NPC family was flattened from, so poses know its arms. */
export function npcBody(name) {
  return NPC_BODY[String(name).replace(/-v\d$/, '')] || null;
}

/**
 * The layer stack and colour seed a baked NPC family (or one of its variants)
 * was made from, so a portrait can be painted from the same description.
 */
export function npcLook(name) {
  return NPC_LOOK[name] || NPC_LOOK[String(name).replace(/-v\d$/, '')] || null;
}

/**
 * A family's stack in draw order for one frame. Anything slung on the back
 * (`back-*`) sits behind the body, after the cloak, except seen from behind,
 * where it goes over the back -- the same rule actor.js follows for layered
 * characters, so a porter's pack reads the same on a townsman and a hero.
 */
function stackFor(stack, frame) {
  const back = stack.filter((n) => n.startsWith('back-'));
  let rest = stack.filter((n) => !n.startsWith('back-'));
  if (!frame.startsWith('up')) {
    if (!back.length) return stack;
    const c = rest.map((n) => n.startsWith('cloak-')).lastIndexOf(true);
    return [...rest.slice(0, c + 1), ...back, ...rest.slice(c + 1)];
  }
  // From behind: the cloak over the outfit, hair over the cloak (unless the
  // cloak brings its own hood), then the helm, then whatever is slung.
  const cloaks = rest.filter((n) => n.startsWith('cloak-'));
  if (cloaks.length) {
    const hooded = cloaks.includes('cloak-hooded');
    const moved = (n) => n.startsWith('cloak-') || (!hooded && (n.startsWith('hair-') || n.startsWith('beard-')));
    const lift = rest.filter(moved);
    rest = rest.filter((n) => !moved(n));
    const at = rest.map((n) => n.startsWith('outfit-') || n.startsWith('mark-')).lastIndexOf(true) + 1;
    rest = [...rest.slice(0, at), ...lift, ...rest.slice(at)];
  }
  const i = rest.findIndex((n) => n.startsWith('shield-') || n.startsWith('wep-'));
  return i < 0 ? rest.concat(back) : [...rest.slice(0, i), ...back, ...rest.slice(i)];
}

function npc(name, stack, colors, variants = true, identity = {}) {
  NPC_BODY[name] = stack.find((n) => n.startsWith('body-')) || 'body-normal';
  NPC_LOOK[name] = Object.freeze({ ...identity, stack: Object.freeze(stack.slice()), colors: Object.freeze({ ...colors }) });
  const frames = {};
  for (const f of FRAME_NAMES) {
    frames[f] = flatten(stackFor(stack, f).map((n) => (ART[n] ? ART[n][f] : null)));
  }
  ART[name] = frames;
  define(name, { w: W, h: H, palette: PAL, defaultColorway: makeColorway(colors), frames, anims: ANIMS, finish: 'K' });
  if (!variants) return name; // Authored named identities keep their own hair and silhouette.
  // Alternate silhouettes retain the profession's costume, equipment and species.
  const hairSets = stack.includes('hair-long') || stack.includes('hair-braid')
    ? ['hair-braid', 'hair-ponytail', 'hair-bob']
    : ['hair-curly', 'hair-wild', 'hair-shaved'];
  for (let v = 1; v <= 3; v++) {
    const alternate = stack.map(n => n.startsWith('hair-') ? hairSets[v - 1]
      : n.startsWith('beard-') ? ['beard-mustache', 'beard-goatee', 'beard-full'][v - 1] : n);
    if (name === 'npc-villager-m') {
      const i = alternate.indexOf('outfit-tunic');
      if (i >= 0) alternate[i] = ['outfit-jerkin', 'outfit-doublet', 'outfit-gambeson'][v - 1];
    }
    if (['npc-villager-m', 'npc-villager-f', 'npc-merchant', 'npc-farmer', 'npc-innkeeper'].includes(name) && v !== 2)
      alternate.push('accessory-satchel');
    NPC_LOOK[`${name}-v${v}`] = Object.freeze({ stack: Object.freeze(alternate.slice()), colors: NPC_LOOK[name].colors });
    const variantFrames = {};
    for (const f of FRAME_NAMES) variantFrames[f] = flatten(stackFor(alternate, f).map(n => ART[n]?.[f]));
    define(`${name}-v${v}`, { w: W, h: H, palette: PAL, defaultColorway: makeColorway(colors), frames: variantFrames, anims: ANIMS, finish: 'K' });
  }
  return name;
}

layer('accessory-satchel', SATCHEL);

// Named visitors, composed from the same layers their dialogue portraits read.
npc('npc-vajra', ['cloak-short','body-slim','hair-short','outfit-robe','wep-staff'],
  {skin:'#a46e50',hair:'#24212a',eye:'#74634b',main:'#343448',alt:'#66516d',cloth:'#655b83',leather:'#382d2e',metal:'#3b3d48',accent:'#a59bbd'}, false, {body:'f'});
npc('npc-drizzt', ['cloak-short','body-slim','ears-pointed','hair-long','outfit-ranger','wep-scimitar'],
  {skin:'#655872',hair:'#efedf5',eye:'#b58ae8',main:'#405a44',alt:'#526354',cloth:'#71816d',leather:'#50443d',metal:'#ccd4e0',accent:'#9bb4c9'}, false, {speciesId:'elf'});
npc('npc-elminster', ['cloak-long','body-normal','hair-long','beard-full','outfit-robe','helm-wizard','wep-staff'],
  {skin:'#d5aa87',hair:'#e8e4dc',eye:'#71838b',main:'#8a3c38',alt:'#65423a',cloth:'#927264',leather:'#604730',metal:'#bca369',accent:'#d2b77a'}, false);
npc('npc-alustriel', ['cloak-short','body-slim','hair-long','outfit-robe','helm-circlet'],
  {skin:'#e3bbab',hair:'#e5e6ee',eye:'#8199c8',main:'#54649a',alt:'#b4a8cd',cloth:'#7b88b0',leather:'#64516c',metal:'#d4dce9',accent:'#b5cfe9'}, false, {body:'f'});

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

npc('npc-innkeeper', ['body-normal', 'hair-short', 'beard-goatee', 'outfit-tunic', 'mark-apron'],
  { skin: '#e5ae80', hair: '#5a3a20', main: '#8a5a2a', leather: '#6b4a2a', accent: '#d8b45a' });

npc('npc-merchant', ['body-normal', 'hair-short', 'beard-mustache', 'outfit-noble'],
  { skin: '#dfa87b', hair: '#5a4a3a', main: '#3f5f8a', accent: '#e3b34a', leather: '#54381f' });

npc('npc-priest', ['body-normal', 'outfit-robe', 'helm-hood'],
  { skin: '#e7b68e', main: '#e8e2d2', accent: '#d8bf5a', cloth: '#ddd6c4', leather: '#7a6a48' });

npc('npc-farmer', ['body-normal', 'hair-short', 'beard-stubble', 'outfit-peasant', 'helm-straw'],
  { skin: '#c98d5e', hair: '#6a4a24', cloth: '#b8a678', metal: '#d8bd72', leather: '#5a3f22' });

npc('npc-miner', ['body-broad', 'hair-short', 'beard-full', 'outfit-hide', 'helm-cap'],
  { skin: '#b07a4e', hair: '#33231a', leather: '#5e4326', cloth: '#9a8a6a', metal: '#8e939c' });

// --- the rest of the working world ---------------------------------------
// Sixteen families had to cover every town on the Sword Coast, so a dockhand,
// a scribe and a fisherman were all "npc-villager-m" in different colours.
// These cost nothing but a layer stack -- the art is the class dress and the
// species features already in this file.

// Labourers, carters and dockhands: broad, in whatever the work leaves whole.
npc('npc-labourer', ['body-broad', 'hair-short', 'beard-stubble', 'outfit-peasant'],
  { skin: '#b07a4e', hair: '#2c1e14', cloth: '#9a8a6a', leather: '#5a3f22', accent: '#8a6a3a' });

npc('npc-porter', ['body-normal', 'hair-short', 'outfit-peasant', 'mark-straps', 'helm-cap', 'back-pack'],
  { skin: '#8a5734', hair: '#1c1410', cloth: '#a89878', leather: '#6b4a2a', metal: '#9a8a6a' });

// Fisherfolk and rivermen: oilskin brown, cap against the weather.
npc('npc-fisher', ['body-normal', 'hair-short', 'beard-full', 'outfit-leather', 'helm-cap'],
  { skin: '#c98d5e', hair: '#6a6a72', leather: '#4e3a22', metal: '#7a6a4a', accent: '#6aa8b0' });

// Sailors off the Chionthar traffic: bright sash, bare arms, headscarf.
npc('npc-sailor', ['body-slim', 'hair-short', 'outfit-tunic', 'helm-cap'],
  { skin: '#a86f45', hair: '#1c1410', main: '#2f6b6b', metal: '#b02a2a', leather: '#54381f', accent: '#e3b34a' });

// Herders on the Trade Way, walking their flock down the road.
npc('npc-herder', ['body-normal', 'hair-short', 'beard-stubble', 'outfit-peasant', 'wep-staff'],
  { skin: '#c98d5e', hair: '#5a3a20', cloth: '#b8a678', leather: '#5a3f22', accent: '#8a9a6a' });

// Hunters and trappers working the Neverwinter Wood edge.
npc('npc-hunter', ['cloak-short', 'body-slim', 'hair-ponytail', 'outfit-ranger', 'back-quiver', 'wep-bow'],
  { skin: '#8a5734', hair: '#3a2416', cloth: '#5a6b3a', alt: '#4a4a32', leather: '#4e3218', accent: '#8a6a2a' });

// Scribes, clerks and countinghouse men.
npc('npc-scribe', ['body-slim', 'hair-short', 'outfit-robe'],
  { skin: '#e8bd95', hair: '#6a6a72', main: '#3a3a4a', accent: '#c0c6d0', cloth: '#d8ccae' });

// Sages and tutors -- the robe, but scholarly rather than arcane.
npc('npc-scholar', ['body-normal', 'hair-long', 'beard-full', 'outfit-robe', 'helm-circlet'],
  { skin: '#e0a878', hair: '#d8d8e0', main: '#4a2a5a', metal: '#c8b06a', accent: '#e3b34a' });

// Temple acolytes, distinct from the robed priest.
npc('npc-acolyte', ['body-normal', 'hair-bob', 'outfit-vestments'],
  { skin: '#c98d5e', hair: '#3a2416', main: '#e8e2d2', accent: '#d8bf5a', cloth: '#ddd6c4' });

// Minstrels working the taprooms for coin and a bed.
npc('npc-minstrel', ['body-slim', 'hair-curly', 'outfit-doublet', 'helm-cap', 'back-lute'],
  { skin: '#e0a878', hair: '#5a3a20', main: '#7a2a5a', alt: '#c8a860', metal: '#c8b06a', accent: '#e3b34a' });

// Festhall staff. The Realms have festhalls in every city of size -- Waterdeep
// alone supports a dozen -- and they are places of drink, music, dancing and
// paid company. Dressed as the sourcebooks describe them: fine cloth, a lot of
// gold, and better clothes than most nobles in this game.
npc('npc-festhall-f', ['body-slim', 'hair-long', 'outfit-doublet', 'helm-circlet'],
  { skin: '#e8bd95', hair: '#1c1410', main: '#8a2a5a', alt: '#c8306a', metal: '#c8b06a', accent: '#f0d264' });

npc('npc-festhall-m', ['body-slim', 'hair-ponytail', 'outfit-noble', 'helm-circlet'],
  { skin: '#a86f45', hair: '#5a3a20', main: '#4a2a6a', accent: '#f0d264', metal: '#c8b06a', cloth: '#d8ccae' });

// A festhall's own doorman: big, well dressed, and not a guard exactly.
npc('npc-bouncer', ['body-broad', 'hair-shaved', 'beard-goatee', 'outfit-leather', 'wep-mace'],
  { skin: '#6b4227', hair: '#1c1410', leather: '#2e2116', metal: '#c8b06a', accent: '#c8306a' });

// Beggars and the road-worn, in whatever they were given: a patched cloak and
// cowl the colour of the road. (The cloak used to be stacked LAST, over the
// face and arms, in the default blue -- a blue sack with a beard.)
npc('npc-beggar', ['cloak-hooded', 'body-slim', 'hair-wild', 'beard-full', 'outfit-peasant', 'helm-hood'],
  { skin: '#8a5734', hair: '#6a6a72', cloth: '#6e604c', alt: '#54493a', main: '#5a4a3a', leather: '#3f2c18' });

// City Watch of Baldur's Gate -- heavier than a village guard, and liveried.
npc('npc-watch', ['body-broad', 'outfit-half-plate', 'helm-great', 'shield-kite', 'wep-sword'],
  { skin: '#c98d5e', metal: '#9aa2b0', main: '#2a3a5a', leather: '#3f2c18', accent: '#c4a24a' });

// Mercenaries drinking between contracts.
npc('npc-sellsword', ['body-broad', 'hair-topknot', 'beard-braided', 'outfit-studded', 'wep-greatsword'],
  { skin: '#a86f45', hair: '#7a5a2a', leather: '#4e3218', metal: '#8e939c', accent: '#b02a2a' });

// Farmwives and goodwives -- the other half of every farmstead.
npc('npc-goodwife', ['body-normal', 'hair-braid', 'outfit-peasant', 'mark-apron', 'helm-coif'],
  { skin: '#e8bd95', hair: '#a8823a', cloth: '#c3a678', leather: '#6b4a2a', accent: '#7fbf6a' });

// Drovers and stablehands.
npc('npc-drover', ['body-normal', 'hair-short', 'beard-stubble', 'outfit-leather', 'helm-cap'],
  { skin: '#8a5734', hair: '#33231a', leather: '#6b4a2a', metal: '#9a8a6a', accent: '#a8763e' });

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
  return define(name, { w, h, palette, frames, anims: ANIMS, finish: 'K' });
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
// MORE BEASTS. The world had five animals -- dog, cat, chicken, horse, ox --
// so every farmyard on the Sword Coast held the same five. These are the rest
// of the ordinary ones: what you actually walk past on the Trade Way.
// Same 16x16 frame and the same BEAST_PAL tokens as the originals.
// ===========================================================================

creature('sheep', 16, 16, {
  down: [
    '................', '................', '................', '................',
    '.....KKKKKK.....',
    '....KWWWWWWK....',
    '....KFeWWeFK....',
    '....KFFnnFFK....',
    '.....KFFFFK.....',
    '...KWWWWWWWWK...',
    '..KWWWWWWWWWWK..',
    '..KWWWWWWWWWWK..',
    '..KWWWWWWWWWWK..',
    '..KGWWWWWWWWGK..',
    '...KKFFFFFFKK...',
    '....KF....FK....',
  ],
  left: [
    '................', '................', '................', '................',
    '................',
    '..KKK...........',
    '.KFFFK..KKKKK...',
    '.KFeFKKWWWWWWK..',
    '.KFFnFWWWWWWWWK.',
    '..KFFKWWWWWWWWK.',
    '...KKWWWWWWWWWK.',
    '.....KWWWWWWWK..',
    '.....KFKKKKFK...',
    '.....KFK..KFK...',
    '.....KFK..KFK...',
    '.....KKK..KKK...',
  ],
  up: [
    '................', '................', '................', '................',
    '.....KKKKKK.....',
    '....KFFFFFFK....',
    '....KFFFFFFK....',
    '....KFFFFFFK....',
    '.....KFFFFK.....',
    '...KWWWWWWWWK...',
    '..KWWWWWWWWWWK..',
    '..KWWWWWWWWWWK..',
    '..KWWWWWWWWWWK..',
    '..KGWWWWWWWWGK..',
    '...KKFFFFFFKK...',
    '....KF....FK....',
  ],
}, {
  down: { 1: { 15: '....KF....K.....' }, 2: { 15: '.....K....FK....' } },
  left: { 1: { 14: '....KFK...KFK...' }, 2: { 14: '......KFK.KFK...' } },
}, BEAST_PAL('#e8e2d4', '#4a423a', '#f6f2e8'));

creature('goat', 16, 16, {
  down: [
    '................', '................', '................', '................',
    '...KK......KK...',
    '....KKKKKKKK....',
    '....KfefffefK...',
    '....KffnnffK....',
    '.....KfWWfK.....',
    '....KffffffK....',
    '...KffffffffK...',
    '..KffffffffffK..',
    '..KffffffffffK..',
    '..KFffffffffFK..',
    '...KKFFFFFFKK...',
    '....KF....FK....',
  ],
  left: [
    '................', '................', '................', '................',
    '..KK............',
    '.KK.KKK.........',
    '.KfffKK.KKKKK...',
    '.KfefFKKfffffK..',
    '.KffnFffffffffK.',
    '..KWWKffffffffK.',
    '...KKfffffffffK.',
    '.....KffffffffK.',
    '.....KfKKKKfK...',
    '.....KfK..KfK...',
    '.....KFK..KFK...',
    '.....KKK..KKK...',
  ],
  up: [
    '................', '................', '................', '................',
    '...KK......KK...',
    '....KKKKKKKK....',
    '....KffffffK....',
    '....KffffffK....',
    '.....KffffK.....',
    '....KffffffK....',
    '...KffffffffK...',
    '..KffffffffffK..',
    '..KffffffffffK..',
    '..KFffffffffFK..',
    '...KKFFFFFFKK...',
    '....KF....FK....',
  ],
}, {
  down: { 1: { 15: '....KF....K.....' }, 2: { 15: '.....K....FK....' } },
  left: { 1: { 14: '....KFK...KFK...' }, 2: { 14: '......KFK.KFK...' } },
}, BEAST_PAL('#b8a678', '#7a6a48', '#d8ccae'));

creature('pig', 16, 16, {
  down: [
    '................', '................', '................', '................',
    '................',
    '....KK....KK....',
    '...KffKKKKffK...',
    '...KfeffffefK...',
    '...KffnnnnffK...',
    '....KFnnnnFK....',
    '..KffffffffffK..',
    '.KffffffffffffK.',
    '.KffffffffffffK.',
    '.KFffffffffffFK.',
    '..KKFFFFFFFFKK..',
    '...KF..KK..FK...',
  ],
  left: [
    '................', '................', '................', '................',
    '................',
    '..KK............',
    '.KffK...........',
    'KffffKKKKKKKK...',
    'KnnfefffffffffK.',
    'KnnffffffffffffK',
    '.KffffffffffffFK',
    '..KFffffffffffFK',
    '..KfKKKKKKKKfK..',
    '..KfK....KKfK...',
    '..KFK....KKFK...',
    '..KKK.....KKK...',
  ],
  up: [
    '................', '................', '................', '................',
    '................',
    '....KK....KK....',
    '...KFFKKKKFFK...',
    '...KFFFFFFFFK...',
    '...KFFFFFFFFK...',
    '....KFFFFFFK....',
    '..KffffffffffK..',
    '.KffffffffffffK.',
    '.KffffffffffffK.',
    '.KFffffffffffFK.',
    '..KKFFFFFFFFKK..',
    '...KF..KK..FK...',
  ],
}, {
  down: { 1: { 15: '...KF..KK...K...' }, 2: { 15: '....K..KK..FK...' } },
  left: { 1: { 14: '..KFK.....KKK...' }, 2: { 14: '..KKK....KKFK...' } },
}, BEAST_PAL('#e0a898', '#a8705f', '#f2c8b8', { n: '#c96a72' }));

creature('cow', 16, 16, {
  down: [
    '................', '................', '................',
    '..KK........KK..',
    '...KKKKKKKKKK...',
    '...KWWffffWWK...',
    '...KWeffffeWK...',
    '...KffnnnnffK...',
    '....KFnnnnFK....',
    '..KffWWffWWffK..',
    '.KffWWWffWWWffK.',
    '.KfffWWffWWfffK.',
    '.KffffffffffffK.',
    '.KFffffWWfffffK.',
    '..KKFFFFFFFFKK..',
    '...KF..KK..FK...',
  ],
  left: [
    '................', '................', '................',
    '..KK............',
    '.KKKKKK.........',
    '.KWWffK.........',
    '.KWefWKKKKKKKK..',
    '.KffnfffWWfffffK',
    '.KFnnffWWWWffffK',
    '..KKKffWWWWffffK',
    '...KffffffffffFK',
    '...KfKKKKKKKfK..',
    '...KfK....KKfK..',
    '...KFK....KKFK..',
    '...KKK.....KKK..',
  ],
  up: [
    '................', '................', '................',
    '..KK........KK..',
    '...KKKKKKKKKK...',
    '...KffffffffK...',
    '...KffWWWWffK...',
    '...KffffffffK...',
    '....KffffffK....',
    '..KffWWffWWffK..',
    '.KffWWWffWWWffK.',
    '.KfffWWffWWfffK.',
    '.KffffffffffffK.',
    '.KFffffWWfffffK.',
    '..KKFFFFFFFFKK..',
    '...KF..KK..FK...',
  ],
}, {
  down: { 1: { 15: '...KF..KK...K...' }, 2: { 15: '....K..KK..FK...' } },
  left: { 1: { 13: '...KFK....KKKK..' }, 2: { 13: '...KKK....KKFK..' } },
}, BEAST_PAL('#8a5f36', '#5f4022', '#b08a5a'));

creature('goose', 16, 16, {
  down: [
    '................', '................', '................',
    '......KKK.......',
    '.....KWWWK......',
    '.....KeWeK......',
    '.....yWWWy......',
    '.....KWWWK......',
    '.....KWWWK......',
    '....KWWWWWK.....',
    '...KWWWWWWWK....',
    '..KWWWWWWWWWK...',
    '..KWWWWWWWWWK...',
    '..KGWWWWWWWGK...',
    '...KKGGGGGKK....',
    '.....y...y......',
  ],
  left: [
    '................', '................', '................',
    '.....KKK........',
    '....KWWWK.......',
    '....KeWWK.......',
    '..yyKWWWK.......',
    '....KWWWK.......',
    '....KWWWK.......',
    '....KWWWWKK.....',
    '...KWWWWWWWKK...',
    '..KWWWWWWWWWWK..',
    '..KWWWWWWWWWGK..',
    '..KGWWWWWWWGK...',
    '...KKGGGGKK.....',
    '.....y.y........',
  ],
  up: [
    '................', '................', '................',
    '......KKK.......',
    '.....KWWWK......',
    '.....KWWWK......',
    '.....KWWWK......',
    '.....KWWWK......',
    '.....KGGGK......',
    '....KWWWWWK.....',
    '...KWWWWWWWK....',
    '..KWWWWWWWWWK...',
    '..KWGGGGGGGWK...',
    '..KGWWWWWWWGK...',
    '...KKGGGGGKK....',
    '.....y...y......',
  ],
}, {
  down: { 1: { 15: '.....y..........' }, 2: { 15: '.........y......' } },
  left: { 1: { 15: '.....y..........' }, 2: { 15: '.......y........' } },
}, BEAST_PAL('#f2ece0', '#b8b0a0', '#ffffff'));

// NOT 'rat': spritedata_monsters.js defines a `rat` for the bestiary, and
// whichever module registered last used to silently win. This is the tame
// one that lives on a wharf; the monster keeps the plain name.
creature('town-rat', 16, 16, {
  down: [
    '................', '................', '................', '................',
    '................', '................', '................',
    '....KK....KK....',
    '...KffKKKKffK...',
    '...KfefffefK....',
    '....KffnnffK....',
    '...KffffffffK...',
    '..KffffffffffK..',
    '..KFffffffffFK..',
    '...KKFFFFFFKK...',
    '....K......K....',
  ],
  left: [
    '................', '................', '................', '................',
    '................', '................',
    '..KK............',
    '.KffK...........',
    'KffefKKKKKK.....',
    'KfnffffffffKK...',
    '.KffffffffffFKKK',
    '.KFfffffffffFKGG',
    '..KFFFFFFFFFK...',
    '..KfK....KfK....',
    '..KKK....KKK....',
    '................',
  ],
  up: [
    '................', '................', '................', '................',
    '................', '................', '................',
    '....KK....KK....',
    '...KFFKKKKFFK...',
    '...KFFFFFFFK....',
    '....KFFFFFFK....',
    '...KffffffffK...',
    '..KffffffffffK..',
    '..KFffffffffFK..',
    '...KKFFFFFFKK...',
    '....K......K....',
  ],
}, {
  down: { 1: { 15: '....K...........' }, 2: { 15: '...........K....' } },
  left: { 1: { 13: '..KfK.....KKK...' }, 2: { 13: '..KKK.....KfK...' } },
}, BEAST_PAL('#6a6258', '#3e3a34', '#8e867a'));

creature('crow', 16, 16, {
  down: [
    '................', '................', '................', '................',
    '................', '................',
    '......KKK.......',
    '.....KfefK......',
    '.....KfffK......',
    '....KfffffK.....',
    '...KfffffffK....',
    '...KfFfffFfK....',
    '...KfFfffFfK....',
    '....KfffffK.....',
    '.....KFFFK......',
    '.....y...y......',
  ],
  left: [
    '................', '................', '................', '................',
    '................', '................',
    '.....KKK........',
    '....KefK........',
    '..yyKffK........',
    '....KfffKK......',
    '....KfffffKK....',
    '...KfFfffffFK...',
    '...KfFfffffFK...',
    '....KffffffK....',
    '.....KFFFFK.....',
    '.....y.y........',
  ],
  up: [
    '................', '................', '................', '................',
    '................', '................',
    '......KKK.......',
    '.....KfffK......',
    '.....KfffK......',
    '....KfFFfK......',
    '...KfFFFFfK.....',
    '...KfFFFFFfK....',
    '...KfFFFFFfK....',
    '....KfffffK.....',
    '.....KFFFK......',
    '.....y...y......',
  ],
}, {
  down: { 1: { 10: '...KfffffffK....', 15: '.....y..........' }, 2: { 15: '.........y......' } },
  left: { 1: { 15: '.....y..........' }, 2: { 15: '.......y........' } },
}, BEAST_PAL('#2e2c34', '#14131a', '#4e4c58', { y: '#8a8a6a' }));

creature('fox', 16, 16, {
  down: [
    '................', '................', '................', '................',
    '....KK....KK....',
    '...KfFKKKKFfK...',
    '...KffffffffK...',
    '...KfeffffefK...',
    '....KfWnnWfK....',
    '.....KWWWWK.....',
    '...KffffffffK...',
    '..KfffWWWWfffK..',
    '..KfffWWWWfffK..',
    '..KFffffffffFK..',
    '...KKFFFFFFKK...',
    '....KF....FK....',
  ],
  left: [
    '................', '................', '................', '................',
    '..KK............',
    '.KfFK...........',
    '.KfffKKKKKK.....',
    'KfeffffffffKK...',
    'KWnfffffffffFKK.',
    '.KWWffWWWWffFKGG',
    '..KffffWWWWffFKG',
    '..KFffffffffffK.',
    '..KfKKKKKKKKfK..',
    '..KfK....KKfK...',
    '..KFK....KKFK...',
    '..KKK.....KKK...',
  ],
  up: [
    '................', '................', '................', '................',
    '....KK....KK....',
    '...KfFKKKKFfK...',
    '...KffffffffK...',
    '...KffffffffK...',
    '....KffffffK....',
    '.....KffffK.....',
    '...KffffffffK...',
    '..KfffffffffK...',
    '..KfffWWWWfffK..',
    '..KFffffffffFK..',
    '...KKFFFFFFKK...',
    '....KF....FK....',
  ],
}, {
  down: { 1: { 15: '....KF....K.....' }, 2: { 15: '.....K....FK....' } },
  left: { 1: { 14: '..KFK.....KKK...' }, 2: { 14: '..KKK....KKFK...' } },
}, BEAST_PAL('#c96a2a', '#8a4418', '#e89a5a'));

creature('deer', 16, 16, {
  down: [
    '..K..........K..',
    '..KK.K....K.KK..',
    '...KKK....KKK...',
    '....KK....KK....',
    '.....KKKKKK.....',
    '....KffffffK....',
    '....KfeffefK....',
    '....KffnnffK....',
    '.....KfWWfK.....',
    '...KffffffffK...',
    '..KffWffffWffK..',
    '..KffffffffffK..',
    '..KffWffffWffK..',
    '..KFffffffffFK..',
    '...KKFFFFFFKK...',
    '....KF....FK....',
  ],
  left: [
    '..K.............',
    '..KK.K..........',
    '...KKK..........',
    '....KK..........',
    '...KKKK.........',
    '..KffffK........',
    '..KfefFKKKKKK...',
    '..KffnFffffffK..',
    '...KWWKffWffffK.',
    '....KKffffffffK.',
    '.....KffWffffFK.',
    '.....KffffffffK.',
    '.....KfKKKKfK...',
    '.....KfK..KfK...',
    '.....KFK..KFK...',
    '.....KKK..KKK...',
  ],
  up: [
    '..K..........K..',
    '..KK.K....K.KK..',
    '...KKK....KKK...',
    '....KK....KK....',
    '.....KKKKKK.....',
    '....KffffffK....',
    '....KffffffK....',
    '....KffffffK....',
    '.....KffffK.....',
    '...KffffffffK...',
    '..KffWffffWffK..',
    '..KffffffffffK..',
    '..KWWffffffWWK..',
    '..KFffffffffFK..',
    '...KKFFFFFFKK...',
    '....KF....FK....',
  ],
}, {
  down: { 1: { 15: '....KF....K.....' }, 2: { 15: '.....K....FK....' } },
  left: { 1: { 14: '....KFK...KFK...' }, 2: { 14: '......KFK.KFK...' } },
}, BEAST_PAL('#a8763e', '#6a4620', '#c99a5e'));

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
