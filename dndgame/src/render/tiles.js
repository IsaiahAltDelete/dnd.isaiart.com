// render/tiles.js — the procedural tileset. Every tile in Phandalin, the Triboar
// Trail, Wave Echo Cave and Undermountain is painted here with fillRect calls into
// a cached 16x16 offscreen canvas, then blitted. No image files, ever.
//
// HOW IT WORKS
//   Each tile definition owns a `draw(ctx, x, y, wx, wy, t)` function. When you call
//   `drawTile(ctx, id, px, py, wx, wy, t)` we:
//     1. hash the world coords (wx, wy) into a small VARIANT index 0..variants-1,
//        so a field of grass has organic variation but never shimmers (the variant
//        is a pure function of position — no RNG, no time);
//     2. pick an animation FRAME from `t` for water / lava / fire / crops;
//     3. rasterise (id, variant, frame) once into an offscreen canvas and cache it;
//     4. drawImage the cache at integer pixel coordinates.
//
//   Inside a `draw` the 4th argument (`wx`) arrives as a *variation seed* derived
//   from the tile id and the resolved variant — feed it to `sr()` for deterministic
//   speckle. Drawing must never depend on raw world coords or the cache would need
//   one canvas per tile on the map.
//
// LAYERS
//   layer:'ground' tiles are fully opaque 16x16 (floors, terrain).
//   layer:'deco'   tiles are transparent props/walls drawn over the ground layer.
//   layer:'over'   tiles draw above the actors (roofs, treetops, cobwebs, ceilings).

// Flag bits — these mirror `TF` in world/tilemap.js exactly. Declared locally so
// this module has no import cycle with the world layer (tilemap.js imports nothing
// from here, but mapgen/battlemap import both).
export const TF = {
  SOLID: 1, WATER: 2, ENCOUNTER: 4, DOOR: 8,
  TRIGGER: 16, LEDGE: 32, SLOW: 64, DAMAGE: 128,
};
const { SOLID, WATER, ENCOUNTER, DOOR, TRIGGER, LEDGE, SLOW, DAMAGE } = TF;

// ---------------------------------------------------------------------------
// 1. PALETTE — warm, earthy, GBA-era.
//
//    GRADE NOTES (2026 art pass). Two rules govern this table now:
//
//    a) BETWEEN families, separate by VALUE, not only by hue. Every ground
//       family used to sit at L* 45-48, so a material change was a pure hue
//       swap at constant lightness — which the eye reads as a flat sticker
//       boundary, never as two surfaces. `dirt` and `leaf` were pulled down so
//       grass / dirt / path / leaf stepped through L* 47 / 43 / 53 / 39.
//
//       The 2026-08 pass narrowed that: DIRT and DIRT_PATH are the SAME family
//       (trodden earth vs. loose earth), so a 9.6 L* gap between them was not
//       separation, it was a cliff. They now sit at 45 / 49.6 — a ~4.6 step —
//       and are told apart by hue and texture instead. Rule (a) still governs
//       DIFFERENT families; it never asked two states of one material to jump.
//
//    b) WITHIN a ground family, COMPRESS. The D->H ramps used to span 27-35 L*,
//       so a handful of speckle pixels shouted louder than the whole tile. Each
//       family gained a mid tone (`grassM`, `dirtM`, `pathM`, `stoneM`) so a
//       mark can be 2-5 L* off the base instead of 9-18, and the outer H tones
//       were pulled in. Props and walls still use the wide ramps — it is only
//       the ground that had to quieten down.
//
//    The `XD` entries are new: an occlusion value one step below each family's
//    D, used for prop keylines, wall base bands and roof eaves so an object
//    reads as SITTING ON the ground rather than as a decal printed on it.
// ---------------------------------------------------------------------------

export const PAL = {
  void: '#0a0a0c', voidL: '#141419',

  grass: '#4a7c3f', grassD: '#3f6a36', grassL: '#5a8f4c', grassH: '#6aa356',
  grassM: '#527f43', grassS: '#456f3a', grassXD: '#2f5228',
  grassDry: '#7f8f47', tallD: '#3d6b34', tall: '#4e8442', tallL: '#63a052',
  clover: '#6aa85c',

  // DIRT -> DIRT_PATH used to be a 9.6 dL* VALUE CLIFF between two tiles of the
  // same material (mean L* 42.8 vs 52.1) with no interlock and no hue change —
  // the one cue a road/soil boundary had was raw lightness, so Phandalin's 164
  // dirt|path joins read as a brown checkerboard. Both families were walked
  // toward each other (dirt +2.2, path -2.6) to a ~4.5 dL* step, and the
  // difference they lost in value was put back as HUE and TEXTURE: `dirt` gained
  // 6% chroma (fresh, damp earth), `path` lost 10% (dust-greyed and trodden),
  // and DIRT_PATH now carries a compacted centre, embedded grit and cart scuffs
  // that plain DIRT does not.
  dirt: '#856542', dirtD: '#705639', dirtL: '#997b50', dirtM: '#8e6e49',
  path: '#887055', pathD: '#6e5b44', pathL: '#9d876a', pathM: '#81684e',
  pathW: '#937b5f', pathXD: '#594836', pebble: '#8f8577',
  mud: '#5f4a33', mudD: '#463626', mudL: '#7a6144',
  sand: '#d8c58c', sandD: '#c4ae76', sandL: '#e6d5a4', sandM: '#cebb83',

  stone: '#6d6a63', stoneD: '#4e4c47', stoneL: '#8b8880', stoneH: '#a5a29a',
  stoneM: '#7c7972', stoneG: '#5d5a54', stoneXD: '#2a2724',
  cobble: '#7a7167', cobbleD: '#5b534a', cobbleL: '#8e8478', cobbleH: '#9c9184',
  // A rock lying on cave floor measured ΔE76 4.18 and 1.06:1 contrast — the two
  // were, to the eye, the same surface, and the floor's own -12 L* speckle came
  // in 2-3px slabs that read as loose pebbles and finished the job. The family
  // dropped 1.6 L* to make room under the (now pale granite) rock props, and
  // `caveS` is the new SHALLOW damp tone the floor textures with instead of
  // flinging `caveD` around.
  cave: '#564d44', caveD: '#39322b', caveL: '#766b5e', caveH: '#908576',
  caveM: '#63594e', caveS: '#4d453d', caveWD: '#2c2721', caveW: '#453d34', caveWL: '#615749',
  dgn: '#4a4753', dgnD: '#302e39', dgnL: '#63606e', dgnH: '#7d7a89',
  dgnM: '#565361', dgnWD: '#25242c', dgnW: '#333140',
  gravel: '#7a736a',

  // VERTICAL SURFACES (2026-08c). Rule (b) — "WITHIN a family, COMPRESS" — was
  // waived for walls when the ground was graded, on the theory that a wall is a
  // prop and wants the wide ramp. Measured, that waiver was the whole defect:
  // CLIFF and STONE_WALL spent the ENTIRE 50.8 L* `stone` ramp (stoneH 66.7 ->
  // stoneXD 15.9) inside a single 16px tile, so every tile carried a white top
  // row and a black bottom band and a field of them read as grey plaques in a
  // lattice. Grid-visibility ratio 8.84 / 5.85 against the ground's 0.15-0.65.
  //
  // Walls now take the same medicine the ground did:
  //   - the FACE of a masonry wall is drawn from stoneL / stoneM / stone /
  //     stoneG / stoneD only — a 24.3 L* band, no stoneH, no stoneXD;
  //   - stoneH and stoneXD are reserved for the crown and the foot of a MASS
  //     (WALL_TOP_*, CLIFF_N/_S, CAVE_WALL_N/_S), never for a body tile;
  //   - every family that had two tones between its base and its dark got the
  //     missing mid so a mark can be 4-6 L* off the base instead of 15-25.
  //
  // ROCK is a new ramp, not an alias of `stone`. A natural rock face and a
  // dressed masonry wall measured dE76 1.37 apart — the same material to the
  // eye — and a BOULDER against a cliff measured 2.42. Greywacke is WARM
  // (b* 4.4-8.2) against `stone`'s neutral b* 2.5-4.7, so a cliff, a wall and a
  // granite erratic are now three materials at three temperatures.
  rockH: '#8d8774', rockL: '#7d7665', rock: '#6e6759', rockM: '#615a4c',
  rockG: '#534d40', rockD: '#433d33', rockXD: '#302c24',
  // `stoneB` is the missing step between stoneG (38.3) and stoneD (32.4). The
  // masonry FACE is built on it so a wall's mean L* lands near 37 against
  // STONE_FLOOR / FLAGSTONE at 45.1 and COBBLE at 43.8 — the wall you cannot
  // walk through and the paving in front of it measured dE76 3.04 and 3.84
  // apart, both under the JND for two large adjacent patches.
  stoneB: '#565349',
  // Cave rock: `caveW`/`caveWD`/`caveWL` had no mid, so a blob was a 12 L* jump.
  caveWM: '#3b342c', caveWG: '#514839',
  // Dungeon masonry: `dgnW` dropped to #333140 so the wall clears DUNGEON_FLOOR
  // by more than the 4.25 dE76 it measured, and gained two mids.
  dgnWM: '#3d3b4b', dgnWG: '#2c2b36',
  // Fired brick and lime plaster mids + the occlusion tones that were inlined
  // as string literals at the two call sites.
  brickM: '#7a4535', brickG: '#583024', brickXD: '#42221a',
  plasterM: '#c4b795', plasterG: '#a1946f',
  // Roof mids, so an eave can be one step instead of the family's whole range.
  thatchG: '#7e6432', shingleM: '#6a3f33', shingleG: '#4c2d24',
  tileRoofM: '#8f4f32', tileRoofG: '#6b3823',
  // SLATE — the fourth roof, for the patriars of Baldur's Gate and the Trades
  // Ward: a cold blue-grey a full hue away from every other roof in town, so
  // a street of shingle and pantile with one slate roof in it reads as one
  // house that cost more. Same value band as shingle (L* ~33-45) so the two
  // never fight for lightness, only for temperature.
  slate: '#4d5566', slateD: '#39404e', slateL: '#636c80', slateM: '#565e6f',
  slateG: '#434a59', slateXD: '#262a33',
  // Canvas for awnings, stalls and tents: undyed sailcloth and the two dyes a
  // market can afford.
  canvas: '#d9cfae', canvasD: '#b4a884', canvasL: '#ece4c8',
  dyeRed: '#a63c34', dyeRedD: '#7c2a24', dyeBlue: '#3e5f8a', dyeBlueD: '#2c4566',
  dyeGreen: '#4e7a46', dyeGreenD: '#375a32',

  // ROCK against GRAVEL measured dE76 4.18 at 1.14:1 — a grey lump on grey
  // chippings, separated by neither value nor hue. Both ends move, and neither
  // move touches `stone*` or `cobble*`, which walls and streets depend on.
  //
  // GRAVEL becomes SCREE: broken hill-stone, same value as before (mean L*
  // ~38, so its relationship to grass and dirt is unchanged for the fringe
  // work) but warm — b* 11-17 against the old 6 — because a road aggregate is
  // crushed local rock, not kerbstone.
  scree: '#5c5140', screeM: '#7d7159', screeL: '#8f8468', screeD: '#443a2c',
  // ROCK becomes GRANITE: COOL — b* -4 to -6 — which is what a granite boulder
  // actually is next to warm soil, and which puts ~20 b* between the rock and
  // the scree.
  //
  // 2026-08b: that hue swing was doing ALL the work. A rock on gravel measured
  // dE76 11.78 of which only 2.52 was dL* — so a value-blind reader (and anyone
  // looking at the game through the fog/night tints, which compress chroma far
  // harder than value) saw a grey lump on grey chippings again. The whole ramp
  // moves up ~8 L*, which is what a lit granite erratic actually is against
  // crushed local rock, and the keyline `graniteXD` deliberately does NOT move:
  // the prop now separates by being LIGHTER than every ground it sits on and by
  // carrying its own dark rim where the light cannot reach.
  granite: '#94969f', graniteL: '#b5b8c2', graniteH: '#d2d5df',
  graniteD: '#6b6d76', graniteM: '#a2a5ae', graniteXD: '#2f3036',

  wood: '#7a5333', woodD: '#5a3c24', woodL: '#9a6b43', woodH: '#b58554',
  bark: '#6b4a2f', barkD: '#4a3220', barkL: '#8a6240', barkXD: '#31200f',
  thatch: '#b8934f', thatchD: '#8d6f3a', thatchL: '#d2ae68',
  thatchM: '#a68345', thatchXD: '#6f5729',
  shingle: '#7b4a3c', shingleD: '#59342a', shingleL: '#9a6250', shingleXD: '#3f231b',
  tileRoof: '#a55c3a', tileRoofD: '#7c412a', tileRoofL: '#c47a53', tileRoofXD: '#5a2c1b',
  plaster: '#d6c9a6', plasterD: '#b3a683', plasterXD: '#8a7d5e',

  brick: '#8a4f3c', brickD: '#67382a', brickL: '#a4674f',

  water: '#3a6ea5', waterD: '#2b5480', waterL: '#5b93c9', foam: '#a9d8ee',
  deep: '#23406b', deepD: '#182f52', deepL: '#33578a',

  // THE WATERLINE. SHORE_* used to be a whole tile of `sand` (L* 79.9) with a
  // 2-8px water strip cut out of it — a beach. No map in this game puts water
  // beside sand: Neverwinter's waterline meets a cobble quay (L* 48.2) and the
  // Neverwinter Wood river runs through grass (L* 47.3), so the sand read as a
  // yellow rectangle laid over both and took the mean |dL*| across the
  // waterline from 5.4 to 34.2. That is why wiring the shore family up was
  // (correctly) backed out.
  //
  // A river bank and a harbour wall are not beaches, they are WET MARGINS:
  // silt, soaked earth and green-black stone that sit a few L* BELOW whatever
  // ground they meet and INSIDE the water's own value range (water 45.3,
  // waterD 34.8, deep 27.0). `silt` 41.6 is 5.7 under grass and 6.6 under
  // cobble — a bank, visible, but not a different planet. `shallow` is the
  // water thinned over that silt, so the transition is ground -> damp -> wet
  // -> shallow -> water across four pixels instead of one hard cut.
  silt: '#6b6150', siltM: '#57503c', siltD: '#4e4738', siltXD: '#3a352a',
  shallow: '#4c6a80', shallowD: '#3f5f79',
  // The same margin where the water meets masonry: a soaked, algae-darkened
  // kerb instead of mud. QUAY_* uses these; SHORE_* uses the silt above.
  quayL: '#6f665a', quay: '#585045', quayD: '#3d3830',
  swamp: '#4a6040', swampD: '#35482d', swampL: '#5f7a4f', scum: '#7d9a4c',
  ice: '#a9d6e8', iceD: '#7fb4cc', iceL: '#d8f1fb',
  snow: '#e9f0f5', snowD: '#c6d3de', snowS: '#adbccb',

  lavaCrust: '#5e2a17', lavaCrustD: '#3d1a0e', lava: '#e2531f', lavaHot: '#ff9a2a',
  lavaWhite: '#ffe07a',
  ash: '#57524e', ashD: '#3c3835', ashL: '#736d67', ashH: '#8e877f',

  metal: '#a9b1bf', metalD: '#767e8c', metalL: '#d5dae3',
  iron: '#5f6570', ironD: '#41464e', ironXD: '#22262c',
  gold: '#e3b34a', goldD: '#a97f27', goldL: '#f5d987',
  silver: '#c9d1da',

  bone: '#ded7c0', boneD: '#ab9f83', boneL: '#f2ecd8',
  cloth: '#c8b58a', clothD: '#a2926c',
  red: '#a8342f', redD: '#7a211e', redL: '#c9564a',
  blue: '#37527a', blueD: '#263a58', blueL: '#5273a4',
  green: '#3f7a3a', purple: '#8a5ec2', purpleD: '#5b3c86',

  // Foliage sat at ΔL* 1.3 / ΔE 3.8 from grass — an oak canopy was, to the eye,
  // the same colour as the field it stood in. Dropped a full value step.
  leaf: '#33682f', leafD: '#22461f', leafL: '#4f9645', leafH: '#6ab35b',
  leafXD: '#173312',
  pine: '#2f5f45', pineD: '#204431', pineL: '#3f7d59', pineH: '#559970',
  pineXD: '#13291d',
  moss: '#5c7a3a', mossD: '#42582a',

  fire: '#ff9a2a', fireHot: '#ffe07a', fireD: '#e2531f', ember: '#c03a12',
  crystal: '#79cfe6', crystalD: '#4a9cb8', crystalL: '#c8f2ff',
  glow: '#9ce8ff',
  ink: '#241b14', shadow: 'rgba(0,0,0,0.28)',
};

// ---------------------------------------------------------------------------
// 2. DRAWING PRIMITIVES
// ---------------------------------------------------------------------------

/** Filled rect at integer pixels. */
function R(c, col, x, y, w, h) { c.fillStyle = col; c.fillRect(x | 0, y | 0, w | 0, h | 0); }
/** Single pixel. */
function P(c, col, x, y) { c.fillStyle = col; c.fillRect(x | 0, y | 0, 1, 1); }
/** Horizontal / vertical 1px runs. */
function H(c, col, x, y, w) { R(c, col, x, y, w, 1); }
function V(c, col, x, y, h) { R(c, col, x, y, 1, h); }
/** 1px rectangle outline. */
function O(c, col, x, y, w, h) { H(c, col, x, y, w); H(c, col, x, y + h - 1, w); V(c, col, x, y, h); V(c, col, x + w - 1, y, h); }

/** Paint an organic shape from [dy, dx, width] rows. */
function blob(c, col, x, y, rows) { for (let i = 0; i < rows.length; i++) { const q = rows[i]; R(c, col, x + q[1], y + q[0], q[2], 1); } }
/** Mirror a blob row list horizontally inside a `w`-wide box. */
function mirror(rows, w = 16) { return rows.map((q) => [q[0], w - q[1] - q[2], q[2]]); }

/**
 * A tiny deterministic generator (mulberry32) used for speckle inside a draw.
 * Seeded from the variation seed so the same variant always paints identically.
 */
function sr(seed) {
  let a = (Math.imul(seed | 0, 2654435761) ^ 0x9e3779b9) >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Scatter n 1x1 pixels of `col` inside a box. */
function speck(c, col, x, y, n, r, w = 16, h = 16, ox = 0, oy = 0) {
  for (let i = 0; i < n; i++) P(c, col, x + ox + Math.floor(r() * w), y + oy + Math.floor(r() * h));
}
/** Scatter n short horizontal dashes. */
function dashes(c, col, x, y, n, r, len = 2, w = 15, h = 16) {
  for (let i = 0; i < n; i++) R(c, col, x + Math.floor(r() * (w - len + 1)), y + Math.floor(r() * h), len, 1);
}
/** Scatter n short vertical blades. */
function blades(c, col, x, y, n, r, len = 2) {
  for (let i = 0; i < n; i++) R(c, col, x + Math.floor(r() * 16), y + Math.floor(r() * (16 - len)), 1, len);
}

/**
 * A rect clipped to this tile's own 16x16 box. Marks may be given coordinates
 * that hang off the edge (-1, or 15 with width 3) and the clip leaves whatever
 * fragment lands inside.
 *
 * That used to be described here as "what a natural surface looks like where it
 * runs under the next tile". It is not, and section 2a below has the
 * measurement: the next tile is a different variant and paints something else
 * entirely, so a clipped mark is a shape that stops dead at the border. Hanging
 * a mark off the edge is now only ever done in PAIRS — the same mark drawn at
 * both -k and 16-k, from the family-fixed generator, so the two fragments are
 * the two halves of one mark and the neighbour really does carry the other one.
 */
function mark(c, col, x, y, mx, my, w, h) {
  const ax = Math.max(0, mx), ay = Math.max(0, my);
  const bx = Math.min(16, mx + w), by = Math.min(16, my + h);
  if (bx <= ax || by <= ay) return;
  R(c, col, x + ax, y + ay, bx - ax, by - ay);
}

// ---------------------------------------------------------------------------
// 2a. THE 16px SEAM — why the old edgeBreak() was not enough, and what
//     replaced it (`seam` + `inX`/`inY` + `dashesI`/`bladesI`)
//
// MEASUREMENT. "Grid visibility" = the mean |dL*| between the two pixels either
// side of a 16px tile border, divided by the mean |dL*| between two adjacent
// pixels INSIDE a tile, both measured across a field of ONE family so no
// material change is involved. 1.0 means the border is statistically
// indistinguishable from the tile interior. A 14x14 field measured:
//
//     GRASS 2.25   SAND 2.78   MUD 2.63   DIRT 1.83   SNOW 1.75
//     COBBLE 1.54  DIRT_PATH 1.51   CAVE_FLOOR 1.89   SNOW_GRASS 2.20
//     FLAGSTONE 0.44   STONE_FLOOR 0.47   <- the two that were already fixed
//
// and after the work below, on the same fields:
//
//     GRASS 0.49   SAND 0.62   MUD 0.07   DIRT 0.22   SNOW 0.38
//     COBBLE 0.96  DIRT_PATH 0.15   CAVE_FLOOR 0.32   SNOW_GRASS 0.10
//     GRAVEL 0.86  FARMLAND 0.13    WATER 0.08        DUNGEON_FLOOR 0.97
//
// Two more numbers matter alongside the ratio, because a ratio can be bought
// by making the border DEAD rather than by making it match — a 1px smooth
// picture-frame every 16 pixels is the same defect wearing different clothes.
// So the ring is also held to the interior's MEAN (within ~1 L*) and to its
// texture ENERGY (ring SD / interior SD, held to 0.6-1.2). Every tone pool and
// mark count in `SEAM_TONE` was picked against those two, not by eye.
//
// THE CAUSE. edgeBreak() scattered marks ONTO rows 0/15 and columns 0/15 using
// the tile's own VARIANT rng. Two things went wrong at once:
//
//   1. it made the border ring the BUSIEST part of the tile. Two marks per edge,
//      2-4px each, is ~35% extra ink on a 16px line that already carried the
//      base speckle. Per-column L* SD for grass ran 5.23 on column 15 against
//      ~2.4 in the middle of the tile;
//   2. a mark clipped at the top edge of a tile has NO MATCHING HALF on the tile
//      above, because the tile above is a different variant and ran a different
//      rng. So the two sides of every seam were independent samples of a noisy
//      distribution, where two pixels inside a tile are correlated. Independent
//      samples differ more. edgeBreak changed the seam's COLOUR; it made the
//      seam's STATISTICS worse.
//
// Deleting edgeBreak alone took GRASS 2.25 -> 1.03 and DIRT 1.83 -> 0.91, which
// is the whole size of the effect. What is left after that is SHAPE: a clod, a
// damp patch or a cobble that gets sliced in half by the tile box still ends in
// mid-air at the seam.
//
// THE FIX, in two halves.
//
//   INBOARD. Every mark bigger than one pixel is now placed so it cannot touch
//   the outer ring (`inX`/`inY` below, and the `dashesI`/`bladesI` scatterers).
//   Nothing large is ever clipped by the tile box, so nothing ends in mid-air.
//   1px speckle is still scattered over the whole tile — a single pixel has no
//   shape to truncate, and its statistics are the same on the border as inside,
//   which is exactly what the metric is asking for.
//
//   WRAPPED. `seam()` then puts the mid-size texture back on the ring, but
//   drawn from a FAMILY-FIXED rng instead of the variant rng, and drawn TWICE:
//   once hanging over the right edge and once hanging over the left edge of the
//   same tile, 16px apart. Every tile in the family therefore paints the two
//   halves of the same mark, so whatever variants the position hash deals out,
//   tile A's right-hand fragment and tile B's left-hand fragment ARE one mark
//   that genuinely straddles the seam. This is the shared-edge idea in the only
//   form available to a raster cached by (id, variant, frame): the seam's
//   content is a pure function of the family, which both neighbours know.
// ---------------------------------------------------------------------------

/**
 * The family-fixed generator. `sr(seed)` is seeded from the tile's variant, so
 * two neighbours never agree; `fr(salt)` is seeded from a per-family constant,
 * so every tile of one family draws its border ring identically and the ring
 * lines up across every seam in the map.
 */
function fr(salt) { return sr((0x5EA3B4 ^ Math.imul(salt | 0, 0x9E3779B1)) >>> 0); }

/** A top-left x for a `w`-wide mark that cannot touch column 0 or column 15. */
function inX(r, w) { return 1 + Math.floor(r() * Math.max(1, 15 - w)); }
/** A top-left y for an `h`-tall mark that cannot touch row 0 or row 15. */
function inY(r, h) { return 1 + Math.floor(r() * Math.max(1, 15 - h)); }

/** `dashes`, kept clear of the tile's outer ring. Same rng draw count. */
function dashesI(c, col, x, y, n, r, len = 2) {
  for (let i = 0; i < n; i++) R(c, col, x + 1 + Math.floor(r() * (15 - len)), y + 1 + Math.floor(r() * 14), len, 1);
}
/** `blades`, kept clear of the tile's outer ring. Same rng draw count. */
function bladesI(c, col, x, y, n, r, len = 2) {
  for (let i = 0; i < n; i++) R(c, col, x + 1 + Math.floor(r() * 14), y + 1 + Math.floor(r() * (15 - len)), 1, len);
}

/**
 * SEAM WEAVE — the wrapping border band described above.
 *
 *   salt   a per-family constant. Two families must not share one, or their
 *          rings would be the same pattern; every family in this file uses its
 *          own entry in `SEAM` below.
 *   tones  the colours to draw from, listed with repeats to weight them. Match
 *          them to the family's own interior texture: the point of the ring is
 *          that it is INDISTINGUISHABLE from the tile's middle, so a family that
 *          mottles in ±3 L* patches wants patch-sized runs here too, and one
 *          that only speckles wants short ones.
 *   n      how many marks. Each is drawn twice (both sides of one seam).
 *   run    the longest a mark may run ALONG the seam.
 *   span   the deepest a mark may reach ACROSS the seam (total, both tiles).
 *
 * A mark never runs off the END of its edge, so no mark needs the agreement of
 * a diagonal neighbour and the four corners stay consistent.
 */
function seam(c, x, y, salt, tones, n = 8, run = 4, span = 4) {
  const r = fr(salt);
  const tn = tones.length;
  for (let i = 0; i < n; i++) {
    const col = tones[Math.floor(r() * tn)];
    const w = 2 + Math.floor(r() * (span - 1));      // total depth across the seam
    const k = 1 + Math.floor(r() * (w - 1));         // how much of it is on THIS tile
    const h = 1 + Math.floor(r() * run);             // length along the seam
    const t = Math.floor(r() * (17 - h));
    if (i & 1) {                                     // a vertical seam (left|right)
      mark(c, col, x, y, 16 - k, t, w, h);
      mark(c, col, x, y, -k, t, w, h);
    } else {                                         // a horizontal seam (top|bottom)
      mark(c, col, x, y, t, 16 - k, h, w);
      mark(c, col, x, y, t, -k, h, w);
    }
  }
}

/** Per-family seam salts. Never reuse one: two families sharing a salt share a ring. */
const SEAM = {
  grass: 11, dirt: 12, path: 13, cave: 14, sand: 15, mud: 16, snow: 17,
  snowGrass: 18, tall: 19, gravel: 20, rut: 21, cobble: 23, bank: 24, water: 25,
  // 26+ are the vertical surfaces. Ground families own 11-25; never reuse one.
  // 26+ are the vertical surfaces. MOUNTAIN and PALISADE are absent on purpose:
  // both are silhouettes with 40+ transparent pixels, and a ring mark landing
  // above the skyline is a rock floating in mid-air. They agree with their
  // neighbours through `edgeVariantAt` on the SHAPE of the shared border
  // instead, which is what a silhouette actually needs.
  cliff: 26, caveWall: 27, masonry: 28, brick: 29, timber: 30, thatch: 31,
  shingle: 32, tileRoof: 33, dgnWall: 34, plaster: 35, crown: 37,
  crownLit: 38, crownShade: 39, ruin: 40, ridge: 42, cliffTop: 43,
  // 44+ are the append-zone roofs: the gable-aware shingle and pantile sets
  // share their body family's ring (shingle 32, tileRoof 33) so a SHINGLE_M
  // beside a SHINGLE_ROOF is seamless; slate and dock are new families.
  slate: 44, dock: 45, slateRidge: 46,
};

/**
 * The tone pool each family's ring draws from. Weighted by repetition, and
 * deliberately built from that family's OWN mid tones — the ring has to be the
 * same material as the tile it edges, not a decorative border.
 */
const SEAM_TONE = {
  grass: [PAL.grassS, PAL.grassS, PAL.grassM, PAL.grass, PAL.grassS, PAL.grassM],
  dirt: [PAL.dirtM, PAL.dirtD, PAL.dirtM, PAL.dirt, PAL.dirtD, PAL.dirtM],
  path: [PAL.pathM, PAL.pathW, PAL.path, PAL.pathM, PAL.path, PAL.pathM],
  cave: [PAL.caveS, PAL.caveS, PAL.caveM, PAL.caveS, PAL.caveS, PAL.caveS],
  sand: [PAL.sandM, PAL.sandD, PAL.sandM, PAL.sandL, PAL.sandM, PAL.sandD],
  mud: [PAL.mud, PAL.mudD, PAL.mudL, PAL.mudD, PAL.mudL, PAL.mud],
  snow: [PAL.snowD, PAL.snow, PAL.snow, PAL.snowD, PAL.snow, PAL.snow],
  tall: [PAL.tall, PAL.tallD, PAL.tall, PAL.tallL, PAL.tallD, PAL.tall],
  water: [PAL.waterD, PAL.water, PAL.water, PAL.water, PAL.waterL, PAL.water],

  // The vertical surfaces. Same discipline as the ground: the ring is built
  // from the family's OWN mid tones so it is indistinguishable from the middle
  // of the tile, and the marks are patch-sized for the families that mottle in
  // patches, thin for the families that only speckle.
  cliff: [PAL.rock, PAL.rockM, PAL.rockG, PAL.rock, PAL.rockM, PAL.rockL],
  caveWall: [PAL.caveW, PAL.caveW, PAL.caveWM, PAL.caveW, PAL.caveWG, PAL.caveW],
  masonry: [PAL.stone, PAL.stoneM, PAL.stoneG, PAL.stone, PAL.stoneG, PAL.stone],
  brick: [PAL.brick, PAL.brickM, PAL.brickG, PAL.brick, PAL.brickM, PAL.brick],
  timber: [PAL.wood, PAL.woodD, PAL.wood, PAL.bark, PAL.woodD, PAL.wood],
  thatch: [PAL.thatch, PAL.thatchM, PAL.thatchD, PAL.thatch, PAL.thatchM, PAL.thatch],
  shingle: [PAL.shingle, PAL.shingleM, PAL.shingleD, PAL.shingle, PAL.shingleM, PAL.shingle],
  tileRoof: [PAL.tileRoof, PAL.tileRoofM, PAL.tileRoofD, PAL.tileRoof, PAL.tileRoofM, PAL.tileRoof],
  slate: [PAL.slate, PAL.slateM, PAL.slateG, PAL.slate, PAL.slateM, PAL.slate],
  dock: [PAL.wood, PAL.woodD, PAL.wood, PAL.woodL, PAL.woodD, PAL.wood],
  dgnWall: [PAL.dgnW, PAL.dgnWM, PAL.dgnWG, PAL.dgnW, PAL.dgnWM, PAL.dgnW],
  plaster: [PAL.plaster, PAL.plasterM, PAL.plasterD, PAL.plaster, PAL.plasterM, PAL.plaster],
};

/**
 * Pre-built shadow inks, indexed by alpha in hundredths. Built once at module
 * load: a `draw` runs on a cache miss, but building an rgba() string per band
 * per prop is pointless garbage, so don't.
 */
const SHADE = [];
for (let i = 0; i <= 64; i++) SHADE.push(`rgba(16,11,8,${(i / 100).toFixed(2)})`);
const shade = (a) => SHADE[a < 0 ? 0 : (a > 0.64 ? 64 : Math.round(a * 100))];

/**
 * FOOTPRINT SHADOW — the one every deco prop should use.
 *
 * An audit found 29 of the 66 deco props darkening FEWER THAN FOUR ground
 * pixels, i.e. casting nothing at all, which is why they read as stickers
 * printed on the floor rather than objects standing on it. Two causes, both
 * fixed here:
 *
 *   1. a shadow exactly as wide as its object is entirely hidden BEHIND that
 *      object. This one deliberately spills 1-2px proud on both sides and
 *      further down-right, because the light in this tileset comes from the
 *      upper-left and a real cast shadow is bigger than its contact patch;
 *   2. a shadow whose core row was the prop's own last row had nowhere to land.
 *      The core here is the row BELOW the foot.
 *
 *   bx, bw  the prop's footprint on its lowest painted row
 *   by      that lowest painted row
 *   str     scales the whole thing — a boulder throws more than a mushroom
 */
function foot(c, x, y, bx, bw, by, str = 1) {
  const put = (row, ax, aw, al) => {
    const x0 = Math.max(0, ax | 0), x1 = Math.min(16, (ax + aw) | 0);
    if (row < 0 || row > 15 || x1 <= x0) return;
    c.fillStyle = shade(al * str);
    c.fillRect(x + x0, y + row, x1 - x0, 1);
  };
  put(by - 1, bx - 1, bw + 3, 0.15);
  put(by, bx - 2, bw + 5, 0.30);
  put(by + 1, bx - 1, bw + 5, 0.46);
  put(by + 2, bx + 1, bw + 3, 0.28);
  put(by + 3, bx + 3, bw, 0.13);
}

/**
 * `foot` rotated a quarter turn: the shadow a TILE-TALL prop throws sideways.
 * A fence post run or a ladder fills its tile top to bottom, so there is no
 * ground left underneath to darken — but the light is in the upper-left, so the
 * shadow falls on the ground down the prop's RIGHT-hand side. `bx` is the first
 * free column to the right of the prop.
 */
function footRight(c, x, y, bx, by, bh, str = 1) {
  const put = (col, ay, ah, al) => {
    const y0 = Math.max(0, ay | 0), y1 = Math.min(16, (ay + ah) | 0);
    if (col < 0 || col > 15 || y1 <= y0) return;
    c.fillStyle = shade(al * str);
    c.fillRect(x + col, y + y0, 1, y1 - y0);
  };
  put(bx - 1, by, bh, 0.30);
  put(bx, by - 1, bh + 2, 0.46);
  put(bx + 1, by, bh + 2, 0.28);
  put(bx + 2, by + 1, bh, 0.13);
}

/**
 * The centred form of `foot`, kept for every caller that already had one.
 *
 *   w   footprint width (the widest row)
 *   yy  the row the CORE sits on — put it directly under the prop's lowest row
 */
function contact(c, x, y, w = 10, yy = 14, dx = 1) {
  const wc = Math.max(2, w | 0);
  foot(c, x, y, ((16 - wc) >> 1) + dx, wc, yy - 1);
}

/**
 * The same shadow, addressed by the prop's own footprint rather than by a magic
 * row number: `bottom` is the last row the prop paints, so the core lands on the
 * very next row and the prop is never left hovering.
 */
function shadowUnder(c, x, y, w, bottom, dx = 1) { contact(c, x, y, w, Math.min(15, bottom + 1), dx); }

/**
 * KEYLINE. A 1px dilation of a blob row list, painted BEFORE the body so the
 * prop keeps a dark rim against whatever ground it lands on. Measured: a rock
 * on cave floor had 92% of its silhouette under 12 Y of contrast — invisible.
 * With a keyline it cannot fall below the keyline's own step, on any ground.
 */
function outline(c, col, x, y, rows) {
  for (let i = 0; i < rows.length; i++) {
    const q = rows[i];
    R(c, col, x + q[1] - 1, y + q[0], q[2] + 2, 1);
    R(c, col, x + q[1], y + q[0] - 1, q[2], 1);
    R(c, col, x + q[1], y + q[0] + 1, q[2], 1);
  }
}
/** Keyline for a rectangular prop: a filled box one pixel proud on every side. */
function outlineBox(c, col, x, y, bx, by, w, h) { R(c, col, x + bx - 1, y + by - 1, w + 2, h + 2); }

// --- shared terrain bases --------------------------------------------------
//
// The natural world's painters live in render/tiles_terrain.js; the bases
// below are the ones the ISLE patches and the earth verges still build on.
import * as TR from './tiles_terrain.js';
// Buildings, interiors and their furniture are painted in render/tiles_arch.js,
// which also owns the map-load pass that tells each of them where it stands.
import * as AR from './tiles_arch.js';
import { paintProp } from './prop-art.js';

/**
 * Grass. The old version put 7 two-pixel `grassD` dashes (-9 L*) and 3 two-pixel
 * `grassH` blades (+18 L*) on a four-colour tile: countable chunky dots, 10% of
 * the tile at ±18 L* amplitude. Now six tones, mostly 1px, mostly within ±5 L*,
 * plus a seam breaker. Interior busyness drops from ~4.4 Y to ~2.5 Y.
 */
function grassBase(c, x, y, r, base = PAL.grass) {
  R(c, base, x, y, 16, 16);
  // A soft sward patch — one small, low-amplitude wash, kept inboard. Deliberately
  // small: the per-tile mean L* of a field of ONE grass tile has to stay flat
  // (SD ~0.1) or a lawn turns into a chequerboard of slightly different greens.
  // The 0.47-0.49 SD the value pass wants out of a MIXED grass field comes from
  // the four tile types sitting at different means, not from within-type noise.
  { const pw = 3 + Math.floor(r() * 4), ph = 3 + Math.floor(r() * 4); mark(c, PAL.grassS, x, y, inX(r, pw), inY(r, ph), pw, ph); }
  speck(c, PAL.grassS, x, y, 10, r);
  dashesI(c, PAL.grassD, x, y, 4, r, 2);
  speck(c, PAL.grassM, x, y, 9, r);
  speck(c, PAL.grassL, x, y, 5, r);
  bladesI(c, PAL.grassH, x, y, 2, r, 2);
  seam(c, x, y, SEAM.grass, SEAM_TONE.grass, 8, 3, 3);
}

/**
 * Loose earth. DIRT and DIRT_PATH now sit only ~4.6 L* apart, so the thing that
 * has to tell them apart is SURFACE, not value: bare dirt is CLODDY — broken
 * lumps with a lit crown and a shadowed underside — where a path is compacted
 * and smooth. The clods straddle the tile border (`mark` clips them) so the
 * lumpiness carries across the seam instead of restarting every 16px.
 */
function dirtBase(c, x, y, r, base = PAL.dirt) {
  R(c, base, x, y, 16, 16);
  speck(c, PAL.dirtD, x, y, 9, r);
  dashes(c, PAL.dirtD, x, y, 3, r, 2);
  speck(c, PAL.dirtM, x, y, 8, r);
  // Broken clods: a 2-4px lump, lit on top-left, dark on the row beneath. These
  // used to be placed at -1..15 so they hung off the tile — which meant every
  // clod at a border was a lump sliced in half with no other half anywhere. The
  // clod (crown + shadow row) is three rows tall, so it is placed to finish
  // inside the tile; the ring gets its clods from `seam` instead.
  for (let i = 0; i < 4; i++) {
    const w = 2 + Math.floor(r() * 3);
    const cx = inX(r, w), cy = inY(r, 3);
    mark(c, PAL.dirtM, x, y, cx, cy, w, 2);
    mark(c, PAL.dirtL, x, y, cx, cy, w - 1, 1);
    mark(c, PAL.dirtD, x, y, cx + 1, cy + 2, w - 1, 1);
  }
  speck(c, PAL.dirtL, x, y, 4, r);
  seam(c, x, y, SEAM.dirt, SEAM_TONE.dirt, 11, 3, 3);
}

/**
 * Flagstone slabs. The mortar gutter used to sit on row 15 / col 15 and the lit
 * slab-top on row 0 / col 0, so where two tiles met a dark mortar line abutted a
 * light slab-top: the tile seam was the single highest-contrast line on the
 * whole floor (measured 4.6x the interior contrast). The gutter is inboard now
 * — rows 6 and 13, cols 6 and 13 — and the highlight follows it, so nothing
 * lands on the tile border at all.
 */
function stoneSlabs(c, x, y, base, dark, light) {
  R(c, base, x, y, 16, 16);
  H(c, dark, x, y + 6, 16); H(c, dark, x, y + 13, 16);
  V(c, dark, x + 6, y, 16); V(c, dark, x + 13, y, 16);
  H(c, light, x, y + 7, 6); H(c, light, x + 7, y + 7, 6);
  H(c, light, x, y + 14, 6); H(c, light, x + 7, y + 14, 6);
  V(c, light, x + 7, y, 6); V(c, light, x + 14, y, 6);
}

/**
 * Cave floor. The old recipe flung five 3x2 slabs of `caveD` — a -12 L* step —
 * into every tile, which is 30 pixels of hard dark in countable lumps: they
 * read as loose pebbles, and a real ROCK prop lying among them had nothing to
 * distinguish it (measured ΔE76 4.18 against the floor, 1.06:1 contrast).
 *
 * Now the large-scale variation is DAMP PATCHES in `caveS`, a -3.5 L* tone,
 * drawn wide and allowed to run off the tile edge; only single pixels are ever
 * as dark as `caveD`. Same amount of information, none of it in blobs.
 */
function caveBase(c, x, y, r) {
  R(c, PAL.cave, x, y, 16, 16);
  // The damp patches used to be placed at -5..14 and allowed to run off the
  // tile, which put a hard -3.5 L* edge on the tile border wherever one was
  // sliced. They stay inboard now; `seam` supplies the ring's own damp mottle,
  // wrapped, so the patch scale is present on the border as well without any
  // patch ever ending in mid-air at a seam.
  for (let i = 0; i < 3; i++) {
    const w = 5 + Math.floor(r() * 6), h = 3 + Math.floor(r() * 4);
    mark(c, PAL.caveS, x, y, inX(r, w), inY(r, h), w, h);
  }
  speck(c, PAL.caveS, x, y, 9, r);
  speck(c, PAL.caveM, x, y, 9, r);
  speck(c, PAL.caveD, x, y, 5, r);          // grit — 1px, never a slab
  speck(c, PAL.caveL, x, y, 3, r);
  seam(c, x, y, SEAM.cave, SEAM_TONE.cave, 13, 4, 3);
}

function plankRun(c, x, y, vertical, base, dark, light) {
  R(c, base, x, y, 16, 16);
  for (let i = 0; i < 4; i++) {
    const o = i * 4;
    if (vertical) { V(c, dark, x + o + 3, y, 16); V(c, light, x + o, y, 16); }
    else { H(c, dark, x, y + o + 3, 16); H(c, light, x, y + o, 16); }
  }
}

// ---------------------------------------------------------------------------
// 2b. THE LONE PATCH — what a tile with no neighbours of its own kind must be
//
// The verge machinery in world/overworld.js refuses, correctly, to fringe a
// tile that has NO cardinal neighbour of its own material: eating 1-7px off all
// four sides of a 16px tile leaves 42-62% of it, which is a smaller square, not
// a softer one. That rule left the single worst-looking ground in the game
// standing: 125 SNOW_GRASS tiles scattered through Neverwinter Wood's forest as
// hard white 16px squares with four straight sides and 90-degree corners, plus
// 62 DIRT, 57 DIRT_PATH, 16 GRAVEL and 11 COBBLE doing the same elsewhere.
// (Measured in situ by walking every map's ground plane; see tools/px/maps.mjs.)
//
// A lone tile of a material is not an edge case of a field — it is a DIFFERENT
// THING, a patch, and it wants to be drawn as one: the surrounding family's
// ground painted right across the tile, with an irregular blob of the patch
// material sitting on top of it, well clear of the tile border. Then:
//
//   * the tile's outer ring is 100% the SURROUNDING family, drawn from that
//     family's own recipe — including its family-fixed `seam` weave — so the
//     patch tile joins the field around it exactly as one of its own would.
//     There is no 16px boundary to see because there is no material change at
//     the border at all;
//   * the material boundary is now the blob's, which is round, irregular and
//     two pixels of stipple wide instead of a ruler line;
//   * and 125 of them are not 125 copies. The outline is a per-angle random
//     walk taken from the tile's variant hash, so the SHAPE varies, not just
//     the position — which is the difference between scattered patches and a
//     stamp moved around.
//
// WHICH surround each patch is painted on is not guessable at draw time (the
// raster is cached by (id, variant, frame) and cannot look at a neighbour), so
// it is measured instead: `isleTileFor` documents, per material, the ground its
// islands actually sit in across the 17 maps.
// ---------------------------------------------------------------------------

/** Per-angle radii, and a double-buffer for the smoothing pass. */
const ISLE_R = new Float64Array(16);
const ISLE_T = new Float64Array(16);
/** 0 = surround, 1 = the stippled fringe, 2 = solid patch. One byte per pixel. */
const ISLE_MASK = new Uint8Array(256);
/** Salt for the per-pixel stipple, set by isleMask and read by isleFill. */
let ISLE_SALT = 0;

/**
 * Build ISLE_MASK. `rad` is the mean radius and `wob` how far the outline may
 * wander from it; the walk is smoothed twice so the blob is lumpy rather than
 * spiky, and rotated by a per-variant angle so the lumps do not all sit in the
 * same place. The geometry is bounded so the blob can never reach columns 0 or
 * 15 — that is what keeps the tile's border ring pure surround.
 */
function isleMask(r, rad = 5.0, wob = 1.0) {
  // THREE independent things vary, not one. A patch that only wobbles its
  // outline is still recognisably the same patch every time: the eye reads
  // overall SIZE and ELONGATION long before it reads a two-pixel lobe. So the
  // mean radius scales, the blob is squashed along an axis that rotates with
  // it, and only then does the per-angle walk go on top.
  const cx = 8 + (r() * 1.8 - 0.9), cy = 8 + (r() * 1.8 - 0.9);
  const sc = 0.74 + r() * 0.42;
  const ecc = (r() * 2 - 1) * 0.26;
  for (let i = 0; i < 16; i++) ISLE_R[i] = rad * sc * (1 + ecc * Math.cos(i * 0.7853981634)) + (r() * 2 - 1) * wob;
  for (let p = 0; p < 2; p++) {
    for (let i = 0; i < 16; i++) ISLE_T[i] = (ISLE_R[(i + 15) & 15] + ISLE_R[i] * 2 + ISLE_R[(i + 1) & 15]) * 0.25;
    for (let i = 0; i < 16; i++) ISLE_R[i] = ISLE_T[i];
  }
  // THE ONE HARD BOUND: no painted pixel may land on row/column 0 or 15, so the
  // tile's border ring stays 100% surround and joins the field around it with
  // no material change at all. `lim` is the largest radius that satisfies that
  // FROM THIS CENTRE (the outermost stipple sits 0.7 beyond the outline, and a
  // pixel's centre is at +0.5), and it is enforced by SCALING the whole outline
  // rather than clipping it — an oversized blob comes back as a smaller blob of
  // the same shape, never as one with a flat side.
  const lim = Math.min(13.79 - cx, cx - 1.21, 13.79 - cy, cy - 1.21);
  let mx = 0;
  for (let i = 0; i < 16; i++) if (ISLE_R[i] > mx) mx = ISLE_R[i];
  if (mx > lim) { const k = lim / mx; for (let i = 0; i < 16; i++) ISLE_R[i] *= k; }
  const rot = r() * 6.2831853;
  ISLE_SALT = 1 + Math.floor(r() * 60000);
  ISLE_MASK.fill(0);
  for (let py = 1; py <= 14; py++) {
    for (let px = 1; px <= 14; px++) {
      const dx = px + 0.5 - cx, dy = py + 0.5 - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 7.2) continue;
      let a = (Math.atan2(dy, dx) + rot) * 2.5464790894703255;   // 16 / 2pi
      a -= Math.floor(a / 16) * 16;
      const i0 = Math.floor(a) & 15, t = a - Math.floor(a);
      const rr = ISLE_R[i0] * (1 - t) + ISLE_R[(i0 + 1) & 15] * t;
      const k = d - rr;                                          // <0 inside
      if (k > 0.7) continue;
      if (k < -1.3) { ISLE_MASK[py * 16 + px] = 2; continue; }
      // The stipple ramp: a two-pixel dissolve instead of an edge, exactly the
      // dither `verge()` uses where a road meets turf. The outermost band is
      // kept thin on purpose — a scatter of lone patch pixels two pixels out
      // reads as sparkle against a dark surround, not as a soft edge.
      const keep = k < -0.6 ? 0.80 : (k < 0.15 ? 0.45 : 0.15);
      if ((tileHash(px, py, ISLE_SALT) & 1023) < keep * 1024) ISLE_MASK[py * 16 + px] = 1;
    }
  }
}

/**
 * Paint the mask. `core` is the tone pool for the solid middle and `edge` the
 * pool for the stipple, both weighted by repetition like SEAM_TONE. The pixel's
 * tone is a hash of its own coordinates, so the patch carries its material's
 * speckle without a second scatter pass.
 */
function isleFill(c, x, y, core, edge) {
  const nc = core.length, ne = edge.length;
  for (let py = 1; py <= 14; py++) {
    for (let px = 1; px <= 14; px++) {
      const m = ISLE_MASK[py * 16 + px];
      if (!m) continue;
      const h = tileHash(px, py, ISLE_SALT + 77) >>> 8;
      P(c, m === 2 ? core[h % nc] : edge[h % ne], x + px, y + py);
    }
  }
}

/**
 * The patch's own form. The light in this tileset is upper-left, so the patch's
 * BOTTOM edge takes the shaded tone and its TOP edge the lit one — two pixels
 * of work that turn a stain into something lying on the ground.
 *
 * Only the top and bottom, deliberately. Ringing the whole silhouette (which is
 * what the first version did) puts a dark outline all the way round a blob that
 * is only nine or ten pixels across, and the patch stops reading as its own
 * material and starts reading as a dark spot.
 */
function isleRim(c, x, y, dark, light) {
  for (let py = 1; py <= 14; py++) {
    for (let px = 1; px <= 14; px++) {
      if (ISLE_MASK[py * 16 + px] !== 2) continue;
      const below = py > 14 ? 0 : ISLE_MASK[(py + 1) * 16 + px];
      const above = py < 1 ? 0 : ISLE_MASK[(py - 1) * 16 + px];
      if (dark && below !== 2) P(c, dark, x + px, y + py);
      else if (light && above !== 2) P(c, light, x + px, y + py);
    }
  }
}

/** A mark clipped to the SOLID part of the patch: texture that cannot leak out. */
function isleMark(c, col, x, y, mx, my, w, h) {
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const ax = mx + i, ay = my + j;
      if (ax < 1 || ax > 14 || ay < 1 || ay > 14) continue;
      if (ISLE_MASK[ay * 16 + ax] !== 2) continue;
      P(c, col, x + ax, y + ay);
    }
  }
}

// ---------------------------------------------------------------------------
// 3. REGISTRY
// ---------------------------------------------------------------------------

/** id -> definition. */
export const TILES = {};
/** NAME -> id. */
export const T = {};
/** NAME -> definition (handy for tools/editors). */
export const TILES_BY_NAME = {};

let nextId = 0;
let built = false;

/**
 * Register one tile.
 *   key   UPPER_SNAKE constant name exposed on `T`
 *   name  human label shown in the map editor / debug overlay
 *   flags TF bit field
 *   opts  { layer, group, biomes, variants, animFrames, fps }
 *   draw  (ctx, x, y, seed, seed2, frame)
 */
function def(key, name, flags, opts, draw) {
  const id = nextId++;
  const d = {
    id, key, name,
    flags: flags | 0,
    layer: opts.layer || 'ground',
    group: opts.group || null,
    biomes: opts.biomes || [],
    variants: Math.max(1, opts.variants || 1),
    // `edgeVariant` tiles do not pick their variant from their own position:
    // the index IS the four shared-border codes (see edgeVariantAt), so two
    // neighbours agree about the border they have in common. Such a tile must
    // declare `variants: 16`.
    edgeVariant: !!opts.edgeVariant,
    animFrames: Math.max(1, opts.animFrames || 1),
    fps: opts.fps || 4,
    draw,
  };
  TILES[id] = d;
  T[key] = id;
  TILES_BY_NAME[key] = d;
  return id;
}

// ---------------------------------------------------------------------------
// 4. TILE DEFINITIONS
// ---------------------------------------------------------------------------

function buildTiles() {
  if (built) return;
  built = true;

  // --- 4.1 void ------------------------------------------------------------
  def('VOID', 'Void', SOLID, { layer: 'ground', biomes: [] }, (c, x, y) => {
    R(c, PAL.void, x, y, 16, 16);
    R(c, PAL.voidL, x, y, 8, 8); R(c, PAL.voidL, x + 8, y + 8, 8, 8);
  });

  // --- 4.2 grass & meadow --------------------------------------------------
  // Painted by render/tiles_terrain.js (section 3 there): tufts, clover heads,
  // wildflowers and a tall-grass stand over one shared sward. Eight variants a
  // type so a meadow never falls into a 16px rhythm.
  def('GRASS', 'Grass', 0, { group: 'grass', biomes: ['plains', 'forest', 'road', 'hills'], variants: 8 }, TR.paintGrass);
  def('GRASS_2', 'Grass', 0, { group: 'grass', biomes: ['plains', 'forest'], variants: 8 }, TR.paintGrassLush);
  def('GRASS_3', 'Grass', 0, { group: 'grass', biomes: ['plains', 'hills'], variants: 8 }, TR.paintGrassSun);
  def('GRASS_4', 'Dry Grass', 0, { group: 'grass', biomes: ['plains', 'road', 'coast'], variants: 8 }, TR.paintGrassDry);
  def('GRASS_TALL', 'Tall Grass', ENCOUNTER | SLOW, { group: 'grass', biomes: ['plains', 'forest', 'marsh'], variants: 8 }, TR.paintTallGrass);

  const flower = (key, label, petal, petalD, core) => def(key, label, 0, { group: 'grass', biomes: ['plains', 'forest'], variants: 6 },
    (c, x, y, v) => TR.paintFlowers(c, x, y, v, petal, petalD, core));
  flower('FLOWERS_RED', 'Wildflowers', '#d24a44', '#a02f2b', '#f2d67a');
  flower('FLOWERS_YELLOW', 'Wildflowers', '#e8c451', '#b6913a', '#fff0b8');
  flower('FLOWERS_BLUE', 'Wildflowers', '#6d8fd6', '#43629f', '#e6eeff');

  def('CLOVER', 'Clover', 0, { group: 'grass', biomes: ['plains', 'forest'], variants: 6 }, TR.paintClover);

  // --- 4.3 bare ground -----------------------------------------------------
  // Painted by render/tiles_terrain.js section 6. Dirt is cloddy and a path is
  // worn smooth — the two sit ~4 L* apart and are told apart by SURFACE.
  def('DIRT', 'Dirt', 0, { group: 'dirt', biomes: ['plains', 'road', 'cave', 'ruins'], variants: 8 }, TR.paintDirt);
  def('DIRT_PATH', 'Path', 0, { group: 'dirt', biomes: ['road', 'plains', 'city'], variants: 8 }, TR.paintPath);

  // COBBLE is edge-variant: the setts that straddle a border take their tone
  // from that border's shared bit, so the paving's ring differs border to
  // border and still matches on both sides (tiles_terrain.js `cobbleBody`).
  def('COBBLE', 'Cobblestone', 0, { group: 'road', biomes: ['city', 'road', 'ruins'], variants: 64, edgeVariant: true }, TR.paintCobble);

  def('FLAGSTONE', 'Flagstone', 0, { group: 'road', biomes: ['city', 'ruins', 'dungeon'], variants: 3 },
    (c, x, y, v) => { const r = sr(v); stoneSlabs(c, x, y, PAL.stone, PAL.stoneG, PAL.stoneL); speck(c, PAL.stoneM, x, y, 4, r); });

  def('GRAVEL', 'Gravel', SLOW, { group: 'dirt', biomes: ['mountain', 'hills', 'mine', 'coast'], variants: 8 }, TR.paintGravel);
  def('SAND', 'Sand', 0, { group: 'sand', biomes: ['coast', 'ruins'], variants: 8 }, TR.paintSand);
  def('MUD', 'Mud', SLOW, { group: 'dirt', biomes: ['marsh', 'road', 'plains'], variants: 12 }, TR.paintMud);

  // --- 4.4 farmland --------------------------------------------------------
  // Furrows on a 4-row cycle, which divides 16, so they run on across seams.
  def('FARMLAND', 'Furrows', 0, { group: 'dirt', biomes: ['plains'], variants: 8 }, TR.paintFarmland);
  def('CROP_WHEAT', 'Wheat', SLOW, { group: 'crop', biomes: ['plains'], variants: 4, animFrames: 3, fps: 2 },
    (c, x, y, v, w, f) => TR.paintWheat(c, x, y, v, f));
  def('CROP_CABBAGE', 'Cabbages', SLOW, { group: 'crop', biomes: ['plains'], variants: 4 }, TR.paintCabbage);

  // --- 4.5 water -----------------------------------------------------------
  // Painted by render/tiles_terrain.js section 5: one water body shared by open
  // water, deep water and every bank member, so a tile drawn as two clipped
  // members has no seam of its own down the middle.
  def('WATER', 'Water', WATER | SLOW, { group: 'water', biomes: ['coast', 'plains', 'marsh'], variants: 8, animFrames: 4, fps: 3 },
    (c, x, y, v, w, f) => TR.paintWater(c, x, y, v, f, false));

  def('WATER_DEEP', 'Deep Water', WATER | SOLID, { group: 'water', biomes: ['coast'], variants: 6, animFrames: 4, fps: 2 },
    (c, x, y, v, w, f) => TR.paintWater(c, x, y, v, f, true));

  /**
   * THE WATERLINE — eight shore cases. A shore tile IS A WATER TILE:
   * `autotileEdges(map, x, y, T.WATER)` sets a bit for each side whose neighbour
   * is not water and the suffix names those sides, so SHORE_N is water with LAND
   * TO THE NORTH and the bank on its top edge.
   *
   * The margin is a WET one — damp earth, wet earth, a dark lip, foam, then a band
   * of shallows — sitting a few L* BELOW whatever ground it meets and inside the
   * water's own value range. (The first version was a sand beach at L* 80 and
   * took the mean |dL*| across Neverwinter's waterline from 5.42 to 34.15; no map
   * in the game puts water beside sand, which is why that was backed out.)
   *
   * The line cannot step at a tile border: its depth is a sine series that
   * vanishes at both ends plus a jag keyed to the SHARED-EDGE VARIANT (see
   * `edgeVariantAt`), so two neighbours compute the same depth where they meet
   * without either looking at the other. tiles_terrain.js `bank()` holds the
   * geometry and the paint.
   */
  const shoreFamily = (prefix, label, quay) => {
    const one = (key, sides) => def(key, label, WATER | SLOW,
      { group: 'water', biomes: ['coast', 'plains'], variants: 16, edgeVariant: true, animFrames: 4, fps: 3 },
      (c, x, y, v, vi, f) => TR.paintShore(c, x, y, vi, f, sides, quay));
    one(`${prefix}_N`, ['N']); one(`${prefix}_E`, ['E']); one(`${prefix}_S`, ['S']); one(`${prefix}_W`, ['W']);
    one(`${prefix}_NE`, ['N', 'E']); one(`${prefix}_SE`, ['S', 'E']);
    one(`${prefix}_SW`, ['S', 'W']); one(`${prefix}_NW`, ['N', 'W']);
  };
  // SHORE_* — the natural bank. Silt and soaked earth: use it wherever the
  // water meets grass, dirt, mud, sand, gravel or farmland.
  shoreFamily('SHORE', 'Shore', false);

  // A hand-drawn river corner with its own bank sweeping through the lower left
  // (no map places it; the waterline pass draws bends from SHORE_* instead).
  def('RIVER_BEND', 'River Bend', WATER | SLOW, { group: 'water', biomes: ['plains', 'forest'], variants: 1, animFrames: 4, fps: 3 },
    (c, x, y, v, w, f) => TR.paintRiverBend(c, x, y, v, f));

  // --- snow and ice: tiles_terrain.js section 8 ------------------------------
  def('ICE', 'Ice', SLOW, { group: 'ice', biomes: ['tundra', 'mountain'], variants: 6 }, TR.paintIce);
  def('SNOW', 'Snow', SLOW, { group: 'snow', biomes: ['tundra', 'mountain'], variants: 8 }, TR.paintSnow);
  def('SNOW_GRASS', 'Snowy Grass', 0, { group: 'snow', biomes: ['tundra', 'pine-forest'], variants: 6 }, TR.paintSnowGrass);

  def('SWAMP_WATER', 'Bog Water', WATER | SLOW | ENCOUNTER, { group: 'water', biomes: ['marsh'], variants: 6, animFrames: 2, fps: 1.5 },
    (c, x, y, v, w, f) => TR.paintBog(c, x, y, v, f));

  def('LILY_PAD', 'Lily Pad', 0, { layer: 'deco', group: 'plant', biomes: ['marsh'], variants: 5 }, TR.paintLilies);

  // --- 4.6 volcanic --------------------------------------------------------
  def('LAVA', 'Lava', SOLID | DAMAGE, { group: 'lava', biomes: ['ash-waste', 'underdark', 'cave'], variants: 2, animFrames: 4, fps: 4 },
    (c, x, y, v, w, f) => {
      const r = sr(v);
      R(c, PAL.lavaCrust, x, y, 16, 16);
      speck(c, PAL.lavaCrustD, x, y, 10, r);
      // glowing cracks that pulse through 4 frames
      for (let i = 0; i < 4; i++) {
        let cx = x + Math.floor(r() * 14), cy = y + Math.floor(r() * 14);
        const len = 4 + ((f + i) % 3);
        for (let s = 0; s < len; s++) {
          P(c, s === 0 ? PAL.lavaWhite : (s < 2 ? PAL.lavaHot : PAL.lava), cx, cy);
          cx += (r() < 0.55 ? 1 : 0); cy += (r() < 0.5 ? 1 : 0);
          if (cx > x + 15 || cy > y + 15) break;
        }
      }
      P(c, PAL.lavaWhite, x + ((f * 5 + 2) % 15), y + ((f * 3 + 6) % 15));
    });

  def('ASH_GROUND', 'Ash', 0, { group: 'ash', biomes: ['ash-waste'], variants: 4 }, (c, x, y, v) => {
    const r = sr(v);
    R(c, PAL.ash, x, y, 16, 16);
    speck(c, PAL.ashD, x, y, 12, r);
    speck(c, PAL.ashL, x, y, 7, r);
  });

  def('ASH_DRIFT', 'Ash Drift', SLOW, { group: 'ash', biomes: ['ash-waste'], variants: 3 }, (c, x, y, v) => {
    const r = sr(v);
    R(c, PAL.ash, x, y, 16, 16);
    for (let i = 0; i < 3; i++) {
      const dx = x + Math.floor(r() * 6), dy = y + 2 + Math.floor(r() * 10);
      blob(c, PAL.ashL, dx, dy, [[0, 2, 5], [1, 0, 9], [2, 0, 10]]);
      H(c, PAL.ashH, dx + 3, dy, 3);
    }
    speck(c, PAL.ashD, x, y, 8, r);
  });

  // --- 4.7 built floors ----------------------------------------------------
  // Cave and dungeon floors are painted by render/tiles_terrain.js section 11:
  // bedded stones, cracks, puddles and moss underground; flagstone and stone
  // brick in one cool stone for dungeons. The flagstones are cut per variant
  // (the variant index picks the cut); the brick is edge-variant so a brick
  // that straddles a border is one brick on both sides.
  def('STONE_FLOOR', 'Stone Floor', 0, { group: 'floor', biomes: ['dungeon', 'ruins', 'city', 'crypt'], variants: 16 },
    (c, x, y, v, vi) => TR.paintFlagstones(c, x, y, v, vi, false));
  def('STONE_FLOOR_CRACKED', 'Cracked Floor', 0, { group: 'floor', biomes: ['dungeon', 'ruins', 'crypt'], variants: 16 },
    (c, x, y, v, vi) => TR.paintFlagstones(c, x, y, v, vi, true));
  def('CAVE_FLOOR', 'Cave Floor', 0, { group: 'floor', biomes: ['cave', 'mine', 'underdark'], variants: 8 }, TR.paintCaveFloor);
  def('CAVE_FLOOR_RUBBLE', 'Rubbled Floor', SLOW, { group: 'floor', biomes: ['cave', 'mine', 'underdark'], variants: 6 }, TR.paintCaveRubble);

  def('WOOD_FLOOR', 'Wood Floor', 0, { group: 'floor', biomes: ['city'], variants: 3 }, (c, x, y, v) => {
    const r = sr(v); plankRun(c, x, y, true, PAL.wood, PAL.woodD, PAL.woodL);
    dashes(c, PAL.woodD, x, y, 5, r, 2);
    P(c, PAL.ink, x + 1, y + 3); P(c, PAL.ink, x + 9, y + 11);
  });

  def('WOOD_FLOOR_H', 'Wood Floor', 0, { group: 'floor', biomes: ['city'], variants: 3 }, (c, x, y, v) => {
    const r = sr(v); plankRun(c, x, y, false, PAL.wood, PAL.woodD, PAL.woodL);
    dashes(c, PAL.woodD, x, y, 5, r, 3);
    P(c, PAL.ink, x + 3, y + 1); P(c, PAL.ink, x + 12, y + 9);
  });

  // Rugs: the authored key is the middle of a rug; resolveArch() gives every
  // tile on its edge the member with the border on that side (tiles_arch.js 6).
  def('CARPET_RED', 'Red Carpet', 0, { group: 'floor', biomes: ['city', 'dungeon'], variants: 1 }, (c, x, y, v) => AR.paintRug(c, x, y, v, 15, 'red'));
  def('CARPET_BLUE', 'Blue Carpet', 0, { group: 'floor', biomes: ['city', 'dungeon'], variants: 1 }, (c, x, y, v) => AR.paintRug(c, x, y, v, 15, 'blue'));

  def('MOSAIC', 'Mosaic', 0, { group: 'floor', biomes: ['city', 'ruins', 'dungeon'], variants: 16, edgeVariant: true }, AR.paintMosaic);

  def('DUNGEON_FLOOR', 'Dungeon Brick', 0, { group: 'floor', biomes: ['dungeon', 'crypt', 'underdark'], variants: 16, edgeVariant: true }, TR.paintDungeonFloor);
  def('BONE_FLOOR', 'Bone-strewn Floor', SLOW, { group: 'floor', biomes: ['crypt', 'dungeon', 'cave'], variants: 16, edgeVariant: true }, TR.paintBoneFloor);

  // --- 4.8 walls -----------------------------------------------------------
  //
  // LIGHT DIRECTION was added in the 2026-08 pass and it was added AT THE WRONG
  // SCALE. `wallShade()` painted the family's lightest tone down column 0, its
  // darkest down column 15 and its occlusion tone across rows 14-15 — on EVERY
  // tile. A cliff fourteen tiles tall therefore got fourteen lit crowns and
  // fourteen shadowed feet, and a field of them measured:
  //
  //     CLIFF row-mean L* first row -> last row 67 ... 16, |r0-r15| = 50.8
  //     STONE_WALL the same, 50.8; LOG_WALL 42.7; DUNGEON_WALL 42.3
  //     grid-visibility ratio CLIFF 8.84  STONE_WALL 5.85  DUNGEON_WALL 6.11
  //     ...against 0.15-0.65 for every ground family three pixels away.
  //
  // Measured in situ through the game's own draw path, the seams inside a wall
  // mass were 12.6x the interior contrast on wave-echo and 8.8x in Phandalin,
  // where the ground scored 0.57. The walls were the worst thing on screen.
  //
  // Counted across every hand-built map, both cities, Undermountain, the world
  // map and all four generators: 2,919 of 4,520 wall tiles (64.6%) have another
  // wall directly below them and still drew the foot band and the lit crown.
  // On wave-echo-cave-entrance it was 399 of 429.
  //
  // THE RULE NOW. A body tile does not know where it sits in the mass, so it
  // may not draw anything that belongs to the mass:
  //
  //   * no crown, no foot band, no side pinstripes on a BODY tile. The crown
  //     and the foot belong to the tiles that DO know — WALL_TOP_LIT /
  //     WALL_TOP_SHADE for masonry, CLIFF_N/_S/_W/_E and CAVE_WALL_N/_S/_W/_E
  //     for rock. CAVE_WALL was already built this way ("height cues go on the
  //     `lit` cases only") and it was the one wall in the file that passed, at
  //     0.71. Every other family now follows it.
  //   * the interior ramp is COMPRESSED — rule (b) of the palette pass, which
  //     had been waived for walls. A masonry face is stoneL..stoneD, a 24.3 L*
  //     band; `stoneH` and `stoneXD` are reserved for a mass edge.
  //   * height inside the body tile comes from MODELLING AT THE MATERIAL'S OWN
  //     SCALE — every course of masonry and every stratum of rock has a lit top
  //     lip and a shaded bed, on a 4-5px period, and the lit tone steps down
  //     from the top of the tile to the bottom. That yields topMinusBot ~ +5
  //     with |row0 - row15| ~ 0, where the old code bought topMinusBot +38 at a
  //     cost of |row0 - row15| = 50.8.
  //   * anything that has to agree across a tile border is a pure function of
  //     the border — `edgeVariantAt` for a head joint that lands on it, the
  //     family-fixed `fr()`/`seam()` generator for the course that straddles
  //     it. Never a neighbour lookup: a raster is cached by (id, variant).

  /**
   * COURSED MASONRY THAT RUNS THROUGH THE TILE BORDER.
   *
   * The old coursing was, in three families verbatim:
   *
   *     const off = (row % 2) ? 3 : 0;
   *     for (let i = -1; i < 4; i++) { const bx = x + off + i * 6;
   *       if (bx > x && bx < x + 16) V(c, dark, bx, oy, 3); }
   *
   * — so every tile put its head joints in exactly the same five columns, and
   * a wall grew continuous vertical joint lines every 16px that no masonry bond
   * has. The `bx > x` guard additionally FORBADE a joint on column 0, so column
   * 0 was always the middle of a block and column 15 always the end of one.
   *
   * Here each course is laid left to right from random block widths, and the
   * one joint that has to be agreed with the neighbour — the one ON the shared
   * vertical border — comes from `edgeVariantAt`. Bit 0 is this tile's left
   * border and bit 1 its right border, and two neighbours read the SAME bit for
   * the border they share (see `edgeVariantAt`): clear, and the two end blocks
   * merge into one long stone spanning the seam; set, and both agree there is a
   * joint there. The joint is drawn once, by the tile on the RIGHT at column 0.
   *
   * The course grid is offset by half a course so that NO bed joint lands on
   * row 0 or row 15 — the tile border falls in the MIDDLE of a course. With
   * `ch` dividing 16 the phases line up automatically, and the straddling
   * course is drawn from the FAMILY-fixed generator `fr()` so the tile above
   * and the tile below paint the two halves of one course with its head joints
   * in the same columns. That is the whole reason the horizontal seam vanishes.
   *
   *   vi          the resolved variant = the four shared-border bits
   *   ch          course height in px. MUST divide 16.
   *   bwMin/bwMax narrowest / widest block
   *   faces       the body tone of each course, top of the tile downward; the
   *               LAST entry is the straddling course and therefore also the
   *               tone on row 0 and row 15, which is why those two rows match
   *               and the horizontal seam disappears.
   *   lits        the lit top-of-course tones, same indexing. Stepping `faces`
   *               and `lits` down 3-6 L* over the height of the tile is what
   *               gives the face its height WITHOUT putting a value cliff on
   *               the tile border: it moves rows 1-14 and leaves 0 and 15 be.
   */
  const coursed = (c, x, y, vi, salt, ch, bwMin, bwMax, faces, lits, bed, joint) => {
    const rows = 16 / ch, half = ch >> 1, last = faces.length - 1;
    R(c, faces[last], x, y, 16, 16);
    for (let k = -1; k < rows; k++) {
      const top = k * ch + half;
      const straddle = (top < 0 || top + ch > 16);
      const i = straddle ? last : k;
      const cr = straddle ? fr(salt)
        : sr((salt ^ Math.imul(k + 2, 0x2545F491) ^ Math.imul(vi + 1, 0x9E3779B1)) >>> 0);
      mark(c, faces[i], x, y, 0, top, 16, ch);
      mark(c, lits[i], x, y, 0, top, 16, 1);
      mark(c, bed, x, y, 0, top + ch - 1, 16, 1);
      if (vi & 1) mark(c, joint, x, y, 0, top, 1, ch - 1);
      let bx = 0;
      for (;;) {
        bx += bwMin + Math.floor(cr() * (bwMax - bwMin + 1));
        if (bx > 14) break;
        mark(c, joint, x, y, bx, top, 1, ch - 1);
      }
    }
  };

  /**
   * A block of a course repainted in a different tone — a stone replaced after
   * a collapse, a brick fired hotter, a course sooted by a torch. This is what
   * the "variants" of these families are supposed to be: `STONE_WALL` declared
   * two and its two rasters differed on 2.3% of their pixels at mean dE 0.46,
   * i.e. five speckle pixels. `TILE_ROOF` declared two and its draw signature
   * did not take a variant at all. Kept strictly inboard of the outer ring.
   */
  const patchBlock = (c, col, x, y, r, ch, bwMin, bwMax, n) => {
    for (let i = 0; i < n; i++) {
      const w = bwMin + Math.floor(r() * (bwMax - bwMin + 1));
      const bx = 1 + Math.floor(r() * Math.max(1, 14 - w));
      const by = 1 + Math.floor(r() * Math.max(1, 15 - ch));
      mark(c, col, x, y, bx, by, w, ch - 1);
    }
  };

  // STONE_WALL is the most-placed wall in the game (765 tiles across the hand
  // maps, 307 more in the generated crypt). It was 5.85:1 with a 32.3 L* border
  // step, and it measured dE76 3.04 from STONE_FLOOR and 3.84 from COBBLE — a
  // wall you cannot walk through and the paving in front of it, both under the
  // just-noticeable difference for two large adjacent patches. The face is now
  // built from stoneG/stone with stoneD beds, mean L* ~40 against the floor's
  // 45.1, and the highlight it lost at the top is the crown tile's job.
  def('STONE_WALL', 'Stone Wall', SOLID, { layer: 'deco', group: 'wall', biomes: ['city', 'ruins', 'dungeon'], variants: 16, edgeVariant: true },
    (c, x, y, v, vi) => {
      const r = sr(v);
      coursed(c, x, y, vi, SEAM.masonry, 4, 5, 9,
        [PAL.stoneG, PAL.stoneB, PAL.stoneB, PAL.stoneB],
        [PAL.stoneM, PAL.stone, PAL.stoneG, PAL.stoneB], PAL.stoneD, PAL.stoneD);
      // two or three stones that were replaced, or that weathered differently
      patchBlock(c, PAL.stoneM, x, y, r, 4, 4, 7, 1 + (vi & 1));
      patchBlock(c, PAL.stoneD, x, y, r, 4, 3, 6, 1);
      dashesI(c, PAL.stoneD, x, y, 4, r, 2);
      speck(c, PAL.stoneM, x, y, 5, r);
      seam(c, x, y, SEAM.masonry, SEAM_TONE.masonry, 7, 3, 3);
    });

  def('STONE_WALL_TOP', 'Wall Top', SOLID, { layer: 'deco', group: 'wall', biomes: ['city', 'ruins'], variants: 16, edgeVariant: true },
    (c, x, y, v, vi) => {
      const r = sr(v);
      coursed(c, x, y, vi, SEAM.crown, 4, 5, 9,
        [PAL.stoneL, PAL.stoneM, PAL.stoneM, PAL.stoneM],
        [PAL.stoneH, PAL.stoneL, PAL.stoneL, PAL.stoneM], PAL.stoneG, PAL.stoneG);
      patchBlock(c, PAL.stone, x, y, r, 4, 4, 7, 1 + (vi & 1));
      patchBlock(c, PAL.stoneH, x, y, r, 4, 3, 6, 1);
      dashesI(c, PAL.stoneG, x, y, 4, r, 2);
      speck(c, PAL.stoneH, x, y, 6, r);
      speck(c, PAL.stoneG, x, y, 5, r);
      seam(c, x, y, SEAM.crown, SEAM_TONE.masonry, 7, 3, 3);
    });

  def('BRICK_WALL', 'Brick Wall', SOLID, { layer: 'deco', group: 'wall', biomes: ['city', 'dungeon'], variants: 16, edgeVariant: true },
    (c, x, y, v, vi) => {
      const r = sr(v);
      // The old course height was 3px, which does not divide 16: the bond
      // restarted a pixel out of phase at every horizontal tile border, on top
      // of the 8px joint lattice every tile shared. 4px (3px brick, 1px bed).
      coursed(c, x, y, vi, SEAM.brick, 4, 6, 9,
        [PAL.brick, PAL.brickM, PAL.brickM, PAL.brickM],
        [PAL.brickL, PAL.brick, PAL.brick, PAL.brickM], PAL.brickD, PAL.brickG);
      patchBlock(c, PAL.brickG, x, y, r, 4, 5, 8, 1 + (vi & 1));   // an over-fired brick
      patchBlock(c, PAL.brickL, x, y, r, 4, 5, 8, 1);              // and a fresh one
      speck(c, PAL.brickD, x, y, 5, r);
      seam(c, x, y, SEAM.brick, SEAM_TONE.brick, 7, 3, 3);
    });

  // Phandalin's houses: fieldstone footing, cream lime panels, dark oak framing.
  // Painted by render/tiles_arch.js paintWattle, which keeps this pass's post
  // and rail rules (rail mid-tile, posts agreed through the shared border bits)
  // and drops the brace from every tile to one in five, which was what made a
  // street of these read as one K-shaped stamp.
  def('WATTLE_WALL', 'Timber Wall', SOLID, AR.WALL_OPTS, AR.paintWattle);

  // Logs run horizontally, so a log IS a course: lit upper lip, body, shaded
  // underside. It was drawn on a 4px grid aligned to the tile, so the tile
  // border landed exactly on the join between two logs — |row0 - row15| 42.7 —
  // and it capped BOTH ends of every log with `barkD`, which made a wall of
  // stacked crates. The grid is offset half a log now, so the border falls
  // through the middle of one, and an end cap is drawn only where the shared
  // border bit says two logs actually butt.
  def('LOG_WALL', 'Log Wall', SOLID, { layer: 'deco', group: 'wall', biomes: ['city', 'forest'], variants: 16, edgeVariant: true },
    (c, x, y, v, vi) => {
      const r = sr(v);
      coursed(c, x, y, vi, SEAM.timber, 4, 13, 15,
        [PAL.woodL, PAL.wood, PAL.wood, PAL.wood],
        [PAL.woodH, PAL.woodL, PAL.woodL, PAL.wood], PAL.woodD, PAL.bark);
      // An end cap sits on the shared LEFT border, agreed with the neighbour by
      // bit 0. It is deliberately not drawn on the log that straddles the tile's
      // own top/bottom border: that one's two halves are in tiles whose bit 0
      // are independent draws, so it would come out capped on one side only.
      if (vi & 1) for (let k = 0; k < 3; k++) mark(c, PAL.barkD, x, y, 0, k * 4 + 3, 2, 2);
      // no two logs in a stack are the same timber
      patchBlock(c, PAL.woodL, x, y, r, 4, 7, 13, 1);
      patchBlock(c, PAL.bark, x, y, r, 4, 6, 11, 1);
      // knots and sapwood streaks — the only thing that makes one log run
      // differ from the next, and the old family had five speckle pixels
      for (let i = 0; i < 3; i++) { const w = 2 + Math.floor(r() * 3); mark(c, PAL.bark, x, y, inX(r, w), inY(r, 2), w, 2); }
      for (let i = 0; i < 2; i++) { const w = 3 + Math.floor(r() * 5); mark(c, PAL.woodH, x, y, inX(r, w), inY(r, 1), w, 1); }
      dashesI(c, PAL.woodD, x, y, 5, r, 3);
      dashesI(c, PAL.woodL, x, y, 4, r, 2);
      speck(c, PAL.bark, x, y, 5, r);
      speck(c, PAL.woodH, x, y, 4, r);
      seam(c, x, y, SEAM.timber, SEAM_TONE.timber, 7, 3, 3);
    });

  // Was a byte-for-byte clone of DUNGEON_FLOOR plus three moss pixels — ΔE 1.0
  // between a floor you walk on and a wall you cannot. Own darker base, a lit
  // 2px top cap, a lit left edge, a shaded right edge and a base occlusion band.
  // `dgnW` dropped from #3a3844 to #333140 so the wall clears DUNGEON_FLOOR by
  // more than the 4.25 dE76 it measured (the source comment claimed that was
  // already fixed; it was not, it had only gone from 1.0 to 4.25).
  def('DUNGEON_WALL', 'Dungeon Wall', SOLID, { layer: 'deco', group: 'wall', biomes: ['dungeon', 'crypt', 'underdark'], variants: 16, edgeVariant: true },
    (c, x, y, v, vi) => {
      const r = sr(v);
      coursed(c, x, y, vi, SEAM.dgnWall, 4, 6, 9,
        [PAL.dgnWM, PAL.dgnW, PAL.dgnW, PAL.dgnW],
        [PAL.dgnM, PAL.dgn, PAL.dgnWM, PAL.dgnW], PAL.dgnWG, PAL.dgnWG);
      patchBlock(c, PAL.dgnWG, x, y, r, 4, 5, 8, 1 + (vi & 1));
      patchBlock(c, PAL.dgnWM, x, y, r, 4, 4, 7, 1);
      for (let i = 0; i < 3; i++) P(c, PAL.moss, x + 1 + Math.floor(r() * 14), y + 1 + Math.floor(r() * 14));
      speck(c, PAL.dgnWG, x, y, 4, r);
      seam(c, x, y, SEAM.dgnWall, SEAM_TONE.dgnWall, 7, 3, 3);
    });

  // RUINED_WALL already measured 1.72 — the only built wall that came close —
  // because its crest is jagged and it never drew a foot band. It keeps that
  // and only loses the two ruler-straight full-height joints and the clipped
  // speckle; the crest height now comes from the shared TOP border bit, so two
  // neighbours agree where the broken line crosses their seam.
  def('RUINED_WALL', 'Ruined Wall', SOLID, { layer: 'deco', group: 'wall', biomes: ['ruins', 'plains', 'forest'], variants: 16, edgeVariant: true },
    (c, x, y, v, vi) => {
      const r = sr(v);
      const fe = fr(SEAM.ruin);
      const top = 2 + ((vi >> 2) & 1) * 2 + ((vi >> 3) & 1) * 2 + Math.floor(r() * 2);
      for (let i = 0; i < 16; i++) {
        // the two end columns take their height from the family-fixed
        // generator, so a run of ruin has an unbroken crest across its seams
        const edge = (i === 0 || i === 15);
        const h0 = top + ((edge ? fe() : r()) < 0.4 ? 1 : 0);
        R(c, PAL.stone, x + i, y + h0, 1, 16 - h0); P(c, PAL.stoneL, x + i, y + h0);
      }
      for (let row = 0; row < 3; row++) { const oy = y + top + 3 + row * 4; if (oy < y + 16) H(c, PAL.stoneG, x, oy, 16); }
      mark(c, PAL.stoneG, x, y, 3 + Math.floor(r() * 4), top + 1, 1, 14);
      mark(c, PAL.stoneG, x, y, 9 + Math.floor(r() * 5), top + 4, 1, 11);
      for (let i = 0; i < 4; i++) P(c, PAL.moss, x + 1 + Math.floor(r() * 14), y + top + Math.floor(r() * (15 - top)));
      speck(c, PAL.stoneG, x, y + top + 1, 4, r, 16, Math.max(1, 14 - top));
      seam(c, x, y, SEAM.ruin, SEAM_TONE.masonry, 5, 3, 3);
    });

  def('PALISADE', 'Palisade', SOLID, { layer: 'deco', group: 'wall', biomes: ['plains', 'forest', 'city'], variants: 8 },
    (c, x, y, v) => {
      const r = sr(v);
      // stakes are 3 or 4 wide and start where the previous one ended, so a run
      // of palisade no longer repeats the same four posts every 16px
      let px = 0;
      while (px < 16) {
        const w = 3 + Math.floor(r() * 2), top = 1 + Math.floor(r() * 3);
        mark(c, PAL.bark, x, y, px, top + 2, w, 16);
        mark(c, PAL.barkL, x, y, px + 1, top, w - 2, 1);
        mark(c, PAL.bark, x, y, px + 1, top + 1, w - 2, 1);
        mark(c, PAL.barkL, x, y, px, top + 2, 1, 14);
        mark(c, PAL.barkD, x, y, px + w - 1, top + 2, 1, 14);
        px += w;
      }
      H(c, PAL.woodD, x, y + 9, 16); H(c, PAL.wood, x, y + 8, 16);
    });

  // The old `contact()` here was painted over immediately by the base plinth, so
  // it never rendered. A pillar fills the tile top to bottom, so it gets a
  // keyline and an occlusion row instead of a cast shadow.
  def('PILLAR', 'Pillar', SOLID, { layer: 'deco', group: 'wall', biomes: ['dungeon', 'ruins', 'city', 'crypt'], variants: 1 }, (c,x,y,v)=>paintProp(c,x,y,'pillar',v));

  def('TIMBER_SUPPORT', 'Mine Support', SOLID, { layer: 'deco', group: 'wall', biomes: ['mine', 'cave'], variants: 1 },
    (c, x, y) => {
      R(c, PAL.wood, x, y, 16, 3); H(c, PAL.woodL, x, y, 16); H(c, PAL.woodD, x, y + 2, 16);
      R(c, PAL.wood, x, y + 3, 3, 13); V(c, PAL.woodL, x, y + 3, 13); V(c, PAL.woodD, x + 2, y + 3, 13);
      R(c, PAL.wood, x + 13, y + 3, 3, 13); V(c, PAL.woodL, x + 13, y + 3, 13); V(c, PAL.woodD, x + 15, y + 3, 13);
      P(c, PAL.ink, x + 1, y + 6); P(c, PAL.ink, x + 14, y + 9);
    });

  /**
   * CAVE WALL and CLIFF — rock masses (tiles_terrain.js section 10). The bare
   * key is the interior of a mass: broken plates on a torus tessellation, so a
   * mass has no 16px lattice. The eight members carry the mass's form: a lit
   * rim where its top breaks away to the north and west, a shaded rim east, and
   * on the south a real face — lit lip, columnar fractures, talus at the foot.
   * `lit` names the sides that face open ground; `resolveTileMasses()` (section
   * 7) bakes the right member onto every edge of a mass when a map is built.
   *
   * All are edge-variant: a plate that crosses a border takes its tone from
   * that border's shared bit, and the south face's lip height meets its
   * neighbour's exactly.
   */
  const caveWall = (key, label, lit) => def(key, label, SOLID, { layer: 'deco', group: 'cave-wall', biomes: ['cave', 'mine', 'underdark'], variants: 16, edgeVariant: true },
    (c, x, y, v, vi) => TR.paintCaveWall(c, x, y, v, vi, lit));
  caveWall('CAVE_WALL', 'Cave Wall', '');
  caveWall('CAVE_WALL_N', 'Cave Wall', 'N');
  caveWall('CAVE_WALL_E', 'Cave Wall', 'E');
  caveWall('CAVE_WALL_S', 'Cave Wall', 'S');
  caveWall('CAVE_WALL_W', 'Cave Wall', 'W');
  caveWall('CAVE_WALL_NE', 'Cave Wall', 'NE');
  caveWall('CAVE_WALL_SE', 'Cave Wall', 'SE');
  caveWall('CAVE_WALL_SW', 'Cave Wall', 'SW');
  caveWall('CAVE_WALL_NW', 'Cave Wall', 'NW');

  const cliff = (key, label, lit) => def(key, label, SOLID, { layer: 'deco', group: 'cliff', biomes: ['mountain', 'hills', 'coast'], variants: 16, edgeVariant: true },
    (c, x, y, v, vi) => TR.paintCliff(c, x, y, v, vi, lit));
  cliff('CLIFF', 'Cliff', '');
  cliff('CLIFF_N', 'Cliff', 'N');
  cliff('CLIFF_E', 'Cliff', 'E');
  cliff('CLIFF_S', 'Cliff', 'S');
  cliff('CLIFF_W', 'Cliff', 'W');
  cliff('CLIFF_NE', 'Cliff', 'NE');
  cliff('CLIFF_SE', 'Cliff', 'SE');
  cliff('CLIFF_SW', 'Cliff', 'SW');
  cliff('CLIFF_NW', 'Cliff', 'NW');

  def('CLIFF_TOP', 'Clifftop', 0, { group: 'cliff-top', biomes: ['mountain', 'hills'], variants: 16, edgeVariant: true }, TR.paintCliffTop);

  /**
   * MOUNTAIN — a range seen from the lowlands, laid in horizontal runs. A
   * silhouette with transparent sky, so it carries no `seam()` ring; instead
   * edge bits 0/1 fix the skirt height at each shared border (the tile to the
   * left reads the same bit), so a ridge line runs on unbroken, and bits 2-3
   * move the summit so a range has four summits, not one repeated.
   */
  def('MOUNTAIN', 'Mountain', SOLID, { layer: 'deco', group: 'cliff', biomes: ['mountain'], variants: 16, edgeVariant: true }, TR.paintMountain);

  // --- 4.9 roofs -----------------------------------------------------------
  //
  // Painted by render/tiles_arch.js section 2. These four keys per material are
  // what building() AUTHORS (ridge row, then L / M / R for the rows below);
  // resolveArch() swaps each for the member its neighbours call for — a ridge
  // end, an eave, a one-row roof — so the roof reads ridge, pitch, eave and
  // verge. Unresolved (a battle arena), each still draws a plausible body.
  def('THATCH_L', 'Thatch Roof', SOLID, AR.ROOF_OPTS, (c, x, y, v, vi) => AR.paintRoof(c, x, y, v, vi, 'thatch', 'B', 'L'));
  def('THATCH_M', 'Thatch Roof', SOLID, AR.ROOF_OPTS, (c, x, y, v, vi) => AR.paintRoof(c, x, y, v, vi, 'thatch', 'B', 'M'));
  def('THATCH_R', 'Thatch Roof', SOLID, AR.ROOF_OPTS, (c, x, y, v, vi) => AR.paintRoof(c, x, y, v, vi, 'thatch', 'B', 'R'));
  def('THATCH_RIDGE', 'Roof Ridge', SOLID, AR.ROOF_OPTS, (c, x, y, v, vi) => AR.paintRoof(c, x, y, v, vi, 'thatch', 'R', 'M'));
  // The old single-tile roofs, kept as the body of their material.
  def('SHINGLE_ROOF', 'Shingle Roof', SOLID, AR.ROOF_OPTS, (c, x, y, v, vi) => AR.paintRoof(c, x, y, v, vi, 'shingle', 'B', 'M'));
  def('TILE_ROOF', 'Tile Roof', SOLID, AR.ROOF_OPTS, (c, x, y, v, vi) => AR.paintRoof(c, x, y, v, vi, 'pantile', 'B', 'M'));

  def('ROOF_PEAK', 'Roof Peak', SOLID, { layer: 'over', group: 'roof', biomes: ['city'], variants: 1 }, (c, x, y) => {
    blob(c, PAL.thatchD, x, y, [[1, 7, 2], [2, 6, 4], [3, 5, 6], [4, 4, 8], [5, 3, 10], [6, 2, 12], [7, 1, 14], [8, 0, 16], [9, 0, 16], [10, 0, 16], [11, 0, 16], [12, 0, 16], [13, 0, 16], [14, 0, 16], [15, 0, 16]]);
    blob(c, PAL.thatch, x, y, [[3, 6, 4], [4, 5, 6], [5, 4, 8], [6, 3, 10], [7, 2, 12], [8, 1, 14], [9, 1, 14], [10, 0, 16], [11, 0, 16], [12, 0, 16], [13, 0, 16], [14, 0, 16], [15, 0, 16]]);
    H(c, PAL.thatchL, x + 1, y + 9, 14); H(c, PAL.thatchL, x + 0, y + 12, 16);
    H(c, PAL.thatchM, x, y + 11, 16); H(c, PAL.thatchD, x, y + 13, 16);
    blob(c, PAL.thatchL, x, y, [[3, 6, 3], [4, 5, 4], [5, 4, 4], [6, 3, 4], [7, 2, 4]]);  // lit upper-left slope
  });

  // The stack alone: its smoke is the SMOKE tile resolveArch() lays on the open
  // tile above it, so the plume can rise clear of the roof it comes out of.
  def('CHIMNEY', 'Chimney', SOLID, { layer: 'over', group: 'roof', biomes: ['city'], variants: 3 }, (c, x, y, v, vi) => AR.paintChimney(c, x, y, vi));

  // --- 4.10 doors, windows, signs ------------------------------------------
  // Painted by render/tiles_arch.js section 4. The authored door is timber in a
  // stone footing; resolveArch() gives a door in masonry a stone frame and lays
  // the head of the doorway (DOOR_HEAD_*) into the wall above it, and gives a
  // window or shutter the wall it actually sits in (WINDOW_STONE, ...). The
  // authored WINDOW / WINDOW_LIT / SHUTTER are the ones in a framed wall.
  def('DOOR_CLOSED', 'Door', SOLID | DOOR | TRIGGER, { layer: 'deco', group: 'door', biomes: ['city', 'dungeon'], variants: 12 },
    (c, x, y, v, vi) => AR.paintDoor(c, x, y, v, vi, 'closed', 'timber'));
  def('DOOR_OPEN', 'Open Door', DOOR | TRIGGER, { layer: 'deco', group: 'door', biomes: ['city', 'dungeon'], variants: 12 },
    (c, x, y, v, vi) => AR.paintDoor(c, x, y, v, vi, 'open', 'timber'));
  def('IRON_DOOR', 'Iron Door', SOLID | DOOR | TRIGGER, { layer: 'deco', group: 'door', biomes: ['dungeon', 'crypt', 'mine'], variants: 1 },
    (c, x, y, v, vi) => AR.paintDoor(c, x, y, v, vi, 'iron', 'stone'));

  def('WINDOW', 'Window', SOLID, AR.WALL_OPTS,
    (c, x, y, v, vi) => { AR.paintWattle(c, x, y, v, vi); AR.paintWindow(c, x, y, v, vi, 'wattle', false, 0); });
  def('WINDOW_LIT', 'Lit Window', SOLID, { ...AR.WALL_OPTS, animFrames: 3, fps: 2 },
    (c, x, y, v, vi, f) => { AR.paintWattle(c, x, y, v, vi); AR.paintWindow(c, x, y, v, vi, 'wattle', true, f); });
  def('SHUTTER', 'Shutters', SOLID, AR.WALL_OPTS,
    (c, x, y, v, vi) => { AR.paintWattle(c, x, y, v, vi); AR.paintShutters(c, x, y, v, vi, 'wattle'); });

  def('SIGN', 'Signpost', SOLID | TRIGGER, { layer: 'deco', group: 'prop', biomes: ['city', 'road'], variants: 1 }, (c, x, y) => {
    contact(c, x, y, 7, 15);
    outlineBox(c, PAL.barkXD, x, y, 7, 8, 2, 8);
    outlineBox(c, PAL.barkXD, x, y, 2, 2, 12, 7);
    R(c, PAL.woodD, x + 7, y + 8, 2, 8);
    R(c, PAL.wood, x + 2, y + 2, 12, 7);
    O(c, PAL.woodD, x + 2, y + 2, 12, 7); H(c, PAL.woodL, x + 3, y + 3, 10);
    V(c, PAL.woodL, x + 3, y + 3, 5); V(c, PAL.woodD, x + 12, y + 3, 5);
    H(c, PAL.ink, x + 4, y + 5, 8); H(c, PAL.ink, x + 4, y + 7, 6);
  });

  // --- 4.11 fences & gates -------------------------------------------------
  def('FENCE_H', 'Fence', SOLID, { layer: 'deco', group: 'fence', biomes: ['plains', 'city'], variants: 1 }, (c, x, y) => {
    contact(c, x, y, 14, 15);
    R(c, PAL.barkXD, x, y + 5, 16, 4); R(c, PAL.barkXD, x, y + 9, 16, 4);
    R(c, PAL.barkXD, x + 1, y + 2, 4, 13); R(c, PAL.barkXD, x + 11, y + 2, 4, 13);
    H(c, PAL.woodL, x, y + 6, 16); H(c, PAL.wood, x, y + 7, 16);
    H(c, PAL.woodL, x, y + 10, 16); H(c, PAL.wood, x, y + 11, 16);
    R(c, PAL.woodL, x + 2, y + 3, 2, 11); R(c, PAL.woodL, x + 12, y + 3, 2, 11);
    V(c, PAL.woodD, x + 3, y + 3, 11); V(c, PAL.woodD, x + 13, y + 3, 11);
  });
  def('FENCE_V', 'Fence', SOLID, { layer: 'deco', group: 'fence', biomes: ['plains', 'city'], variants: 1 }, (c, x, y) => {
    footRight(c, x, y, 14, 0, 16, 0.95);             // a N-S fence throws east, not down
    R(c, PAL.barkXD, x + 5, y, 4, 16); R(c, PAL.barkXD, x + 9, y, 4, 16);
    R(c, PAL.barkXD, x + 3, y + 1, 12, 4); R(c, PAL.barkXD, x + 3, y + 11, 12, 4);
    V(c, PAL.wood, x + 6, y, 16); V(c, PAL.woodD, x + 7, y, 16);
    V(c, PAL.wood, x + 10, y, 16); V(c, PAL.woodD, x + 11, y, 16);
    R(c, PAL.woodL, x + 4, y + 2, 10, 2); R(c, PAL.woodL, x + 4, y + 12, 10, 2);
    H(c, PAL.woodD, x + 4, y + 4, 10); H(c, PAL.woodD, x + 4, y + 14, 10);
  });
  def('FENCE_CORNER', 'Fence Corner', SOLID, { layer: 'deco', group: 'fence', biomes: ['plains', 'city'], variants: 1 }, (c, x, y) => {
    contact(c, x, y, 10, 15);
    R(c, PAL.barkXD, x + 4, y + 1, 5, 15); R(c, PAL.barkXD, x + 6, y + 5, 10, 4); R(c, PAL.barkXD, x + 6, y + 9, 10, 4);
    R(c, PAL.woodL, x + 5, y + 2, 3, 13); V(c, PAL.woodD, x + 7, y + 2, 13);
    H(c, PAL.wood, x + 7, y + 6, 9); H(c, PAL.woodD, x + 7, y + 7, 9);
    H(c, PAL.wood, x + 7, y + 10, 9); H(c, PAL.woodD, x + 7, y + 11, 9);
    V(c, PAL.wood, x + 6, y + 7, 9); V(c, PAL.woodD, x + 5, y + 7, 9);
  });
  def('STONE_FENCE', 'Stone Wall', SOLID, { layer: 'deco', group: 'fence', biomes: ['plains', 'city', 'hills'], variants: 2 }, (c, x, y, v) => {
    const r = sr(v);
    // The wall used to run to row 15, so it had no ground of its own to stand
    // on. Its foot is row 13 now and rows 14-15 carry the cast shadow.
    foot(c, x, y, 0, 16, 13, 1.15);
    R(c, PAL.stoneXD, x, y + 4, 16, 10);
    R(c, PAL.stone, x, y + 5, 16, 9);
    H(c, PAL.stoneH, x, y + 5, 16); H(c, PAL.stoneL, x, y + 6, 16);
    H(c, PAL.stoneD, x, y + 12, 16); H(c, PAL.stoneXD, x, y + 13, 16);
    for (let i = 0; i < 5; i++) V(c, PAL.stoneD, x + 1 + Math.floor(r() * 14), y + 7, 5);
    speck(c, PAL.stoneL, x, y + 7, 5, r, 16, 5);
  });
  def('GATE', 'Gate', DOOR | TRIGGER, { layer: 'deco', group: 'fence', biomes: ['plains', 'city'], variants: 1 }, (c, x, y) => {
    contact(c, x, y, 14, 15);
    R(c, PAL.barkXD, x, y + 1, 3, 15); R(c, PAL.barkXD, x + 13, y + 1, 3, 15);
    R(c, PAL.barkXD, x + 1, y + 4, 14, 3); R(c, PAL.barkXD, x + 1, y + 9, 14, 3);
    R(c, PAL.woodL, x, y + 2, 2, 13); R(c, PAL.woodL, x + 14, y + 2, 2, 13);
    H(c, PAL.wood, x + 2, y + 5, 12); H(c, PAL.wood, x + 2, y + 10, 12);
    for (let i = 0; i < 10; i++) P(c, PAL.woodD, x + 3 + i, y + 10 - i); // brace
    P(c, PAL.metal, x + 7, y + 7); P(c, PAL.metal, x + 8, y + 7);
  });

  // --- 4.12 town props -----------------------------------------------------
  def('WELL', 'Well', SOLID | TRIGGER, { layer: 'deco', group: 'prop', biomes: ['city'], variants: 1 }, (c, x, y) => {
    // The rim reached row 15, which left the shadow nowhere to go: it is a row
    // shorter now and row 15 is the ground the well stands on.
    foot(c, x, y, 1, 14, 14, 1.15);
    outlineBox(c, PAL.stoneXD, x, y, 1, 8, 14, 6);
    outlineBox(c, PAL.barkXD, x, y, 2, 0, 12, 9);
    R(c, PAL.stone, x + 1, y + 8, 14, 6);
    O(c, PAL.stoneD, x + 1, y + 8, 14, 6); H(c, PAL.stoneH, x + 2, y + 8, 12);
    R(c, '#1c2a38', x + 4, y + 9, 8, 4); R(c, PAL.water, x + 5, y + 11, 6, 2); H(c, PAL.waterL, x + 6, y + 11, 3);
    R(c, PAL.wood, x + 2, y + 1, 2, 8); R(c, PAL.wood, x + 12, y + 1, 2, 8);
    R(c, PAL.woodD, x + 1, y, 14, 2); H(c, PAL.woodL, x + 1, y, 14);
    V(c, PAL.cloth, x + 8, y + 2, 5); R(c, PAL.wood, x + 7, y + 6, 3, 2);
  });

  // Authored material silhouettes, rasterized into the ordinary tile cache.
  def('BARREL', 'Barrel', SOLID, { layer: 'deco', group: 'prop', biomes: ['city', 'dungeon', 'mine'], variants: 2 }, (c,x,y,v)=>paintProp(c,x,y,'barrel',v));

  def('CRATE', 'Crate', SOLID, { layer: 'deco', group: 'prop', biomes: ['city', 'dungeon', 'mine'], variants: 2 }, (c,x,y,v)=>paintProp(c,x,y,'crate',v));

  // A full sack is a heavy, sagging thing: wide at the bottom where the grain
  // has settled, gathered at a tied neck, and lit down one side. The old one
  // was a pale slab with a line on it and sat flat next to the new barrel.
  const SACK_ROWS = [
    [3, 7, 3], [4, 6, 4], [5, 5, 6], [6, 4, 8], [7, 3, 10],
    [8, 3, 10], [9, 2, 12], [10, 2, 12], [11, 2, 12], [12, 3, 10], [13, 4, 8],
  ];
  def('SACK', 'Sack', SOLID, { layer: 'deco', group: 'prop', biomes: ['city', 'mine'], variants: 2 }, (c, x, y, v) => {
    const r = sr(v);
    shadowUnder(c, x, y, 12, 13);
    outline(c, PAL.barkXD, x, y, SACK_ROWS);
    blob(c, PAL.cloth, x, y, SACK_ROWS);
    // the light comes from the upper left, so the right shoulder turns away
    blob(c, PAL.clothD, x, y, [[9, 10, 4], [10, 10, 4], [11, 10, 4], [12, 9, 4], [13, 9, 3]]);
    blob(c, '#e0d4b0', x, y, [[6, 5, 3], [7, 4, 3], [8, 4, 3]]);       // lit shoulder
    // the neck, gathered and tied
    R(c, PAL.clothD, x + 6, y + 4, 4, 1);
    H(c, PAL.bark, x + 6, y + 5, 4);                                    // the cord
    P(c, PAL.barkD, x + 5, y + 5); P(c, PAL.barkD, x + 10, y + 5);
    blob(c, PAL.cloth, x, y, [[3, 7, 3]]);                              // the gathered top
    // creases where the weight pulls the weave
    V(c, '#8b7b56', x + 6, y + 8, 4); V(c, '#8b7b56', x + 9, y + 9, 3);
    if (r() < 0.5) P(c, PAL.clothD, x + 7, y + 11);
  });

  def('CART', 'Handcart', SOLID, { layer: 'deco', group: 'prop', biomes: ['city', 'road'], variants: 1 }, (c, x, y) => {
    shadowUnder(c, x, y, 14, 13);
    outlineBox(c, PAL.barkXD, x, y, 1, 4, 14, 6);
    R(c, PAL.wood, x + 1, y + 4, 14, 6);
    H(c, PAL.woodL, x + 1, y + 4, 14); H(c, PAL.woodD, x + 1, y + 9, 14);
    for (let i = 0; i < 4; i++) V(c, PAL.woodD, x + 3 + i * 3, y + 5, 4);
    // two wheels
    for (const wx of [x + 3, x + 11]) {
      const wheel = [[0, 1, 4], [1, 0, 6], [2, 0, 6], [3, 0, 6], [4, 1, 4]];
      outline(c, PAL.barkXD, wx - 2, y + 9, wheel);
      blob(c, PAL.barkD, wx - 2, y + 9, wheel);
      P(c, PAL.metal, wx + 0, y + 11); P(c, PAL.metal, wx + 1, y + 11);
    }
    R(c, PAL.woodL, x + 13, y + 2, 3, 2);
  });

  const ANVIL_ROWS = [[4, 2, 12], [5, 2, 12], [6, 4, 8], [7, 5, 6], [8, 4, 8], [9, 3, 10], [10, 3, 10]];
  def('ANVIL', 'Anvil', SOLID, { layer: 'deco', group: 'prop', biomes: ['city'], variants: 1 }, (c, x, y) => {
    shadowUnder(c, x, y, 11, 14);
    outlineBox(c, PAL.barkXD, x, y, 4, 11, 8, 4);
    R(c, PAL.bark, x + 4, y + 11, 8, 4); H(c, PAL.barkL, x + 4, y + 11, 8);
    outline(c, PAL.ironXD, x, y, ANVIL_ROWS);
    blob(c, PAL.iron, x, y, ANVIL_ROWS);
    H(c, PAL.metal, x + 2, y + 4, 12);
    P(c, PAL.metalL, x + 3, y + 4); P(c, PAL.metalL, x + 12, y + 4);
    H(c, PAL.ironD, x + 3, y + 10, 10); V(c, PAL.ironD, x + 12, y + 9, 2);
  });

  def('FORGE', 'Forge', SOLID, { layer: 'deco', group: 'prop', biomes: ['city'], variants: 1, animFrames: 3, fps: 6 },
    (c, x, y, v, vi, f) => AR.paintForge(c, x, y, v, f));

  def('GRINDSTONE', 'Grindstone', SOLID, { layer: 'deco', group: 'prop', biomes: ['city'], variants: 1 }, (c, x, y) => {
    contact(c, x, y, 12, 14);
    R(c, PAL.wood, x + 2, y + 9, 12, 2); R(c, PAL.wood, x + 3, y + 11, 2, 4); R(c, PAL.wood, x + 11, y + 11, 2, 4);
    blob(c, PAL.stone, x, y, [[2, 5, 6], [3, 4, 8], [4, 3, 10], [5, 3, 10], [6, 3, 10], [7, 3, 10], [8, 4, 8], [9, 5, 6]]);
    O(c, PAL.stoneD, x + 3, y + 3, 10, 7);
    P(c, PAL.iron, x + 7, y + 5); P(c, PAL.iron, x + 8, y + 5); P(c, PAL.iron, x + 7, y + 6); P(c, PAL.iron, x + 8, y + 6);
    H(c, PAL.stoneH, x + 5, y + 3, 5);
  });

  // --- 4.13 furniture ------------------------------------------------------
  // Painted in render/tiles_arch.js section 6c: a lit top, a keyline, a contact shadow.
  def('TABLE', 'Table', SOLID, { layer: 'deco', group: 'furniture', biomes: ['city', 'dungeon'], variants: 4 }, (c, x, y, v, vi) => AR.paintTable(c, x, y, vi));

  def('CHAIR', 'Chair', SOLID, { layer: 'deco', group: 'furniture', biomes: ['city'], variants: 1 }, (c, x, y) => AR.paintChair(c, x, y));

  def('BENCH', 'Bench', SOLID, { layer: 'deco', group: 'furniture', biomes: ['city'], variants: 1 }, (c, x, y) => AR.paintBench(c, x, y));

  def('BED', 'Bed', SOLID, { layer: 'deco', group: 'furniture', biomes: ['city'], variants: 4 }, (c, x, y, v, vi) => AR.paintBed(c, x, y, vi));

  def('BOOKSHELF', 'Bookshelf', SOLID, { layer: 'deco', group: 'furniture', biomes: ['city', 'dungeon'], variants: 2 },
    (c, x, y, v) => {
      const r = sr(v);
      foot(c, x, y, 0, 16, 14, 1.1);                 // the carcass ends at 14; 15 is floor
      R(c, PAL.woodD, x, y, 16, 15);
      const cols = ['#8c3a34', '#3a5a8c', '#6a8c3a', '#8c7a3a', '#5f3a8c', '#8c5a3a'];
      for (let shelf = 0; shelf < 3; shelf++) {
        const sy = y + shelf * 5;                   // lips at 4/9/14, floor stays at 15
        R(c, '#3a2718', x + 1, sy, 14, 4);
        let bx = x + 1;
        while (bx < x + 14) {
          const bw = 1 + Math.floor(r() * 2), bh = 3 + (r() < 0.4 ? 0 : 1);
          R(c, cols[Math.floor(r() * cols.length)], bx, sy + 4 - bh, bw, bh);
          P(c, PAL.gold, bx, sy + 4 - bh);
          bx += bw + (r() < 0.25 ? 1 : 0);
        }
        H(c, PAL.wood, x + 1, sy + 4, 14);
      }
      O(c, PAL.woodL, x, y, 16, 15);
    });

  def('SHELF_GOODS', 'Shelves', SOLID, { layer: 'deco', group: 'furniture', biomes: ['city'], variants: 2 }, (c, x, y, v) => {
    const r = sr(v);
    foot(c, x, y, 0, 16, 14, 1.1);
    R(c, PAL.woodD, x, y, 16, 15);
    for (let shelf = 0; shelf < 3; shelf++) {
      const sy = y + shelf * 5;                     // lips at 4/9/14, floor stays at 15
      R(c, '#3a2718', x + 1, sy, 14, 4);
      for (let i = 0; i < 4; i++) {
        const gx = x + 1 + i * 3 + Math.floor(r() * 2);
        const kind = Math.floor(r() * 3);
        if (kind === 0) { R(c, PAL.cloth, gx, sy + 1, 2, 3); P(c, PAL.clothD, gx, sy + 1); }
        else if (kind === 1) { R(c, '#6a8c9a', gx, sy + 1, 2, 3); P(c, '#b8dce8', gx, sy + 1); }
        else { R(c, PAL.gold, gx, sy + 2, 2, 2); P(c, PAL.goldL, gx, sy + 2); }
      }
      H(c, PAL.wood, x + 1, sy + 4, 14);
    }
    O(c, PAL.woodL, x, y, 16, 15);
  });

  def('COUNTER', 'Counter', SOLID, { layer: 'deco', group: 'furniture', biomes: ['city'], variants: 1 }, (c, x, y) => {
    foot(c, x, y, 0, 16, 14, 1.1);
    R(c, PAL.woodL, x, y + 3, 16, 3); H(c, PAL.woodH, x, y + 3, 16);
    R(c, PAL.wood, x, y + 6, 16, 9);
    for (let i = 0; i < 4; i++) V(c, PAL.woodD, x + 3 + i * 4, y + 6, 9);
    H(c, PAL.woodD, x, y + 14, 16);
  });

  def('BAR', 'Bar', SOLID, { layer: 'deco', group: 'furniture', biomes: ['city'], variants: 1 }, (c, x, y) => {
    foot(c, x, y, 0, 16, 14, 1.1);
    R(c, PAL.woodH, x, y + 2, 16, 3); H(c, '#d09a62', x, y + 2, 16); H(c, PAL.woodD, x, y + 4, 16);
    R(c, PAL.woodD, x, y + 5, 16, 10);
    for (let i = 0; i < 3; i++) { R(c, PAL.wood, x + 1 + i * 5, y + 6, 4, 8); H(c, PAL.woodL, x + 1 + i * 5, y + 6, 4); }
    R(c, '#6a8c5a', x + 2, y, 2, 2); R(c, '#8c6a3a', x + 11, y, 2, 2);
  });

  def('COOKING_POT', 'Cook Pot', SOLID, { layer: 'deco', group: 'prop', biomes: ['city', 'cave'], variants: 1, animFrames: 3, fps: 3 },
    (c, x, y, v, w, f) => {
      contact(c, x, y, 12, 14);
      // tripod
      for (let i = 0; i < 6; i++) { P(c, PAL.iron, x + 2 + i, y + 14 - i); P(c, PAL.iron, x + 13 - i, y + 14 - i); }
      blob(c, PAL.ironD, x, y, [[5, 4, 8], [6, 3, 10], [7, 3, 10], [8, 3, 10], [9, 3, 10], [10, 4, 8], [11, 5, 6]]);
      H(c, PAL.iron, x + 3, y + 6, 10);
      R(c, '#6a5a2a', x + 5, y + 6, 6, 1);
      const s = f % 3;
      P(c, '#a89a6a', x + 6 + s, y + 4); P(c, '#c8bc8a', x + 9 - s, y + 3);
      R(c, PAL.ember, x + 5, y + 13, 6, 1); P(c, PAL.fire, x + 7, y + 13);
    });

  def('HEARTH', 'Hearth', SOLID, { layer: 'deco', group: 'prop', biomes: ['city', 'dungeon'], variants: 1, animFrames: 3, fps: 6 },
    (c, x, y, v, vi, f) => AR.paintHearth(c, x, y, v, f));

  def('CANDLE', 'Candle', 0, { layer: 'deco', group: 'prop', biomes: ['city', 'dungeon', 'crypt'], variants: 1, animFrames: 2, fps: 4 },
    (c, x, y, v, w, f) => {
      foot(c, x, y, 6, 4, 14, 0.75);
      R(c, PAL.gold, x + 6, y + 13, 4, 2); H(c, PAL.goldL, x + 6, y + 13, 4);
      R(c, '#e8e0c4', x + 7, y + 7, 2, 6); V(c, '#fff8e0', x + 7, y + 7, 6);
      P(c, PAL.ink, x + 7, y + 6);
      P(c, PAL.fire, x + 7, y + 5 - (f % 2)); P(c, PAL.fireHot, x + 7, y + 4 - (f % 2));
    });

  def('TORCH', 'Torch Sconce', 0, { layer: 'deco', group: 'prop', biomes: ['dungeon', 'cave', 'city', 'mine'], variants: 1, animFrames: 4, fps: 8 },
    (c, x, y, v, w, f) => {
      // A sconce hangs on a wall, so its shadow falls on the wall behind it and
      // to the lower-right — same light, same rule, different surface.
      foot(c, x, y, 7, 4, 13, 0.7);
      R(c, PAL.iron, x + 6, y + 8, 4, 2); R(c, PAL.ironD, x + 5, y + 10, 6, 2);
      R(c, PAL.bark, x + 7, y + 10, 2, 5);
      const sh = [0, 1, 0, -1][f & 3];
      blob(c, PAL.fireD, x, y, [[7, 5, 6], [6, 5, 6], [5, 6, 4], [4, 6, 4]]);
      blob(c, PAL.fire, x, y, [[7, 6, 4], [6, 6, 4], [5, 7, 2], [4, 7, 2]]);
      P(c, PAL.fireHot, x + 7 + sh, y + 4); P(c, PAL.fireHot, x + 7, y + 3 + (f & 1));
      P(c, PAL.ember, x + 5 + sh, y + 2);
    });

  def('BRAZIER', 'Brazier', SOLID, { layer: 'deco', group: 'prop', biomes: ['dungeon', 'crypt', 'city'], variants: 1, animFrames: 3, fps: 6 },
    (c, x, y, v, w, f) => {
      contact(c, x, y, 10, 14);
      R(c, PAL.ironD, x + 6, y + 11, 4, 4); R(c, PAL.iron, x + 4, y + 14, 8, 2);
      blob(c, PAL.iron, x, y, [[7, 3, 10], [8, 3, 10], [9, 4, 8], [10, 5, 6]]);
      H(c, PAL.metal, x + 3, y + 7, 10);
      const h = [4, 6, 5][f % 3];
      blob(c, PAL.fireD, x, y, [[6, 4, 8], [5, 5, 6], [4, 5, 6]]);
      R(c, PAL.fire, x + 6, y + 7 - h + 2, 4, h - 1);
      P(c, PAL.fireHot, x + 7 + (f % 2), y + 8 - h);
      P(c, PAL.ember, x + 5, y + 2 + (f % 2));
    });

  def('CHANDELIER', 'Chandelier', 0, { layer: 'over', group: 'prop', biomes: ['city', 'dungeon'], variants: 1, animFrames: 2, fps: 3 },
    (c, x, y, v, w, f) => {
      V(c, PAL.ironD, x + 8, y, 5);
      blob(c, PAL.iron, x, y, [[5, 3, 10], [6, 2, 12], [7, 2, 12]]);
      H(c, PAL.metal, x + 2, y + 5, 12);
      for (const cx of [x + 3, x + 7, x + 11]) {
        R(c, '#e8e0c4', cx, y + 2, 2, 3);
        P(c, PAL.fire, cx, y + 1 - (f % 2)); P(c, PAL.fireHot, cx, y - (f % 2));
      }
    });

  // --- 4.14 sacred & funerary ---------------------------------------------
  def('ALTAR', 'Altar', SOLID | TRIGGER, { layer: 'deco', group: 'prop', biomes: ['city', 'dungeon', 'crypt'], variants: 1 }, (c, x, y) => {
    contact(c, x, y, 14, 14);
    R(c, PAL.stoneL, x + 1, y + 4, 14, 3); H(c, PAL.stoneH, x + 1, y + 4, 14);
    R(c, PAL.stone, x + 3, y + 7, 10, 8); H(c, PAL.stoneD, x + 3, y + 14, 10);
    R(c, PAL.cloth, x + 2, y + 6, 12, 3); H(c, '#e2d8bc', x + 2, y + 6, 12);
    R(c, PAL.gold, x + 6, y + 1, 4, 4); P(c, PAL.goldL, x + 7, y + 2);   // Tymora's coin
    O(c, PAL.goldD, x + 6, y + 1, 4, 4);
    R(c, '#e8e0c4', x + 2, y + 2, 1, 4); P(c, PAL.fire, x + 2, y + 1);
    R(c, '#e8e0c4', x + 13, y + 2, 1, 4); P(c, PAL.fire, x + 13, y + 1);
  });

  def('STATUE', 'Statue of Tymora', SOLID, { layer: 'deco', group: 'prop', biomes: ['city', 'ruins', 'dungeon'], variants: 1 }, (c, x, y) => {
    contact(c, x, y, 14, 14);
    R(c, PAL.stoneL, x + 2, y + 13, 12, 3); H(c, PAL.stoneH, x + 2, y + 13, 12);
    // robed figure
    blob(c, PAL.stone, x, y, [[2, 6, 4], [3, 6, 4], [4, 5, 6], [5, 5, 6], [6, 4, 8], [7, 4, 8], [8, 4, 8], [9, 3, 10], [10, 3, 10], [11, 3, 10], [12, 2, 12]]);
    blob(c, PAL.stoneL, x, y, [[2, 6, 3], [3, 6, 2], [4, 5, 3], [6, 4, 3], [8, 4, 2], [10, 3, 3]]);
    H(c, PAL.stoneD, x + 4, y + 6, 8);
    P(c, PAL.stoneD, x + 6, y + 3); P(c, PAL.stoneD, x + 9, y + 3);
    R(c, PAL.gold, x + 11, y + 5, 2, 2); P(c, PAL.goldL, x + 11, y + 5);  // the tossed coin
    for (let i = 0; i < 4; i++) V(c, PAL.stoneD, x + 4 + i * 2, y + 9, 4);
  });

  def('SHRINE', 'Shrine', SOLID | TRIGGER, { layer: 'deco', group: 'prop', biomes: ['city', 'road', 'forest'], variants: 1 }, (c, x, y) => {
    // The plinth used to run off the bottom of its own tile; it stops at 14 now
    // so the shrine has a floor to cast onto.
    foot(c, x, y, 0, 16, 14, 1.15);
    blob(c, PAL.stone, x, y, [[1, 5, 6], [2, 3, 10], [3, 2, 12], [4, 1, 14], [5, 1, 14], [6, 1, 14], [7, 1, 14], [8, 1, 14], [9, 1, 14], [10, 1, 14], [11, 1, 14], [12, 1, 14], [13, 1, 14], [14, 0, 16]]);
    R(c, '#221b16', x + 4, y + 5, 8, 9);
    blob(c, PAL.stoneH, x, y, [[1, 5, 6], [2, 3, 4], [4, 1, 2]]);
    R(c, PAL.gold, x + 6, y + 7, 4, 4); O(c, PAL.goldD, x + 6, y + 7, 4, 4); P(c, PAL.goldL, x + 7, y + 8);
    R(c, PAL.stoneD, x + 4, y + 13, 8, 1);
  });

  def('FOUNTAIN', 'Fountain', SOLID, { layer: 'deco', group: 'prop', biomes: ['city'], variants: 1, animFrames: 2, fps: 3 },
    (c, x, y, v, w, f) => {
      foot(c, x, y, 0, 16, 14, 1.15);
      R(c, PAL.stoneL, x, y + 3, 16, 12);
      O(c, PAL.stoneD, x, y + 3, 16, 12); H(c, PAL.stoneH, x, y + 3, 16);
      R(c, PAL.water, x + 2, y + 5, 12, 8);
      H(c, PAL.waterL, x + 3 + f, y + 7, 5); H(c, PAL.waterL, x + 8 - f, y + 10, 4);
      R(c, PAL.stone, x + 6, y + 4, 4, 6); H(c, PAL.stoneH, x + 6, y + 4, 4);
      V(c, PAL.foam, x + 7, y + 1 + f, 3); V(c, PAL.foam, x + 9, y + 2 - f, 3);
      P(c, PAL.foam, x + 5, y + 6); P(c, PAL.foam, x + 11, y + 8);
      H(c, PAL.stoneD, x, y + 14, 16);
    });

  // The `R(grassD, x+1, y+13, 14, 3)` mound used to be painted straight over the
  // contact shadow, so the stone had none — and on grass the mound itself was
  // invisible (63% of the rim under threshold). Shadow first, keyline, then a
  // few tufts that do not swallow either.
  def('GRAVESTONE', 'Gravestone', SOLID, { layer: 'deco', group: 'prop', biomes: ['crypt', 'ruins', 'plains'], variants: 2 },
    (c, x, y, v) => {
      const r = sr(v);
      const rows = [[3, 5, 6], [4, 4, 8], [5, 4, 8], [6, 4, 8], [7, 4, 8], [8, 4, 8], [9, 4, 8], [10, 4, 8], [11, 4, 8], [12, 3, 10], [13, 3, 10]];
      shadowUnder(c, x, y, 12, 13);
      outline(c, PAL.stoneXD, x, y, rows);
      blob(c, PAL.stone, x, y, rows);
      blob(c, PAL.stoneL, x, y, [[3, 5, 5], [4, 4, 4], [5, 4, 3], [6, 4, 2], [7, 4, 2], [8, 4, 2], [9, 4, 2], [10, 4, 2], [11, 4, 2]]);
      blob(c, PAL.stoneH, x, y, [[3, 5, 4], [4, 4, 2]]);
      blob(c, PAL.stoneD, x, y, [[9, 10, 2], [10, 10, 2], [11, 10, 2], [12, 11, 2], [13, 11, 2]]);
      H(c, PAL.stoneD, x + 5, y + 6, 6); H(c, PAL.stoneD, x + 5, y + 8, 4);
      for (let i = 0; i < 5; i++) { const gx = x + 1 + Math.floor(r() * 14); V(c, PAL.grassD, gx, y + 12 + Math.floor(r() * 2), 3); }
      for (let i = 0; i < 3; i++) P(c, PAL.moss, x + 3 + Math.floor(r() * 10), y + 6 + Math.floor(r() * 7));
    });

  def('TOMB', 'Tomb', SOLID | TRIGGER, { layer: 'deco', group: 'prop', biomes: ['crypt', 'dungeon'], variants: 1 }, (c, x, y) => {
    foot(c, x, y, 0, 16, 14, 1.15);
    R(c, PAL.stoneD, x, y + 2, 16, 13);
    R(c, PAL.stone, x + 1, y + 3, 14, 11);
    R(c, PAL.stoneL, x, y + 1, 16, 3); H(c, PAL.stoneH, x, y + 1, 16); H(c, PAL.stoneD, x, y + 4, 16);
    for (let i = 0; i < 3; i++) H(c, PAL.stoneD, x + 2, y + 7 + i * 3, 12);
    R(c, PAL.dgnD, x + 6, y + 8, 4, 5); H(c, PAL.stoneH, x + 6, y + 8, 4);
  });

  def('SARCOPHAGUS', 'Sarcophagus', SOLID | TRIGGER, { layer: 'deco', group: 'prop', biomes: ['crypt', 'dungeon', 'ruins'], variants: 1 }, (c, x, y) => {
    foot(c, x, y, 3, 10, 14, 1.1);
    blob(c, PAL.stoneD, x, y, [[1, 3, 10], [2, 2, 12], [3, 2, 12], [4, 2, 12], [5, 2, 12], [6, 2, 12], [7, 2, 12], [8, 2, 12], [9, 2, 12], [10, 2, 12], [11, 2, 12], [12, 2, 12], [13, 2, 12], [14, 3, 10]]);
    blob(c, PAL.stone, x, y, [[2, 3, 10], [3, 3, 10], [4, 3, 10], [5, 3, 10], [6, 3, 10], [7, 3, 10], [8, 3, 10], [9, 3, 10], [10, 3, 10], [11, 3, 10], [12, 3, 10], [13, 3, 10]]);
    // carved face and crossed arms
    blob(c, PAL.stoneL, x, y, [[3, 6, 4], [4, 5, 6], [5, 5, 6]]);
    P(c, PAL.stoneD, x + 6, y + 4); P(c, PAL.stoneD, x + 9, y + 4);
    H(c, PAL.stoneD, x + 4, y + 7, 8); H(c, PAL.stoneD, x + 4, y + 9, 8);
    for (let i = 0; i < 3; i++) H(c, PAL.stoneH, x + 4, y + 11 + i, 8 - i * 2);
    R(c, PAL.gold, x + 7, y + 7, 2, 2);
  });

  def('BONES', 'Bones', 0, { layer: 'deco', group: 'prop', biomes: ['crypt', 'cave', 'dungeon'], variants: 3 }, (c, x, y, v) => {
    const r = sr(v);
    const ribs = [];
    for (let i = 0; i < 4; i++) ribs.push([x + 1 + Math.floor(r() * 10), y + 4 + Math.floor(r() * 10)]);
    const sx = x + 4 + Math.floor(r() * 5), sy = y + 8 + Math.floor(r() * 4);
    // each bone throws its own little shadow, so the pile has depth instead of
    // being a bone-coloured decal
    for (const [bx, by] of ribs) foot(c, x, y, bx - x - 1, 7, by - y + 1, 0.5);
    foot(c, x, y, sx - x - 1, 7, sy - y + 3, 0.6);
    for (const [bx, by] of ribs) R(c, '#3a3226', bx - 1, by, 7, 3);      // shadow + keyline
    R(c, '#3a3226', sx - 1, sy, 7, 5);
    for (const [bx, by] of ribs) {
      R(c, PAL.bone, bx, by, 5, 1); P(c, PAL.boneL, bx, by); P(c, PAL.boneD, bx + 4, by);
      P(c, PAL.bone, bx, by - 1); P(c, PAL.bone, bx + 4, by + 1);
    }
    blob(c, PAL.bone, sx, sy, [[0, 1, 3], [1, 0, 5], [2, 0, 5], [3, 1, 3]]);
    P(c, PAL.ink, sx + 1, sy + 1); P(c, PAL.ink, sx + 3, sy + 1);
  });

  def('SKULL_PILE', 'Skull Pile', SOLID, { layer: 'deco', group: 'prop', biomes: ['crypt', 'cave', 'dungeon'], variants: 2 }, (c, x, y) => {
    contact(c, x, y, 14, 14);
    const skull = (sx, sy) => {
      blob(c, PAL.bone, sx, sy, [[0, 1, 4], [1, 0, 6], [2, 0, 6], [3, 0, 6], [4, 1, 4], [5, 1, 4]]);
      P(c, PAL.ink, sx + 1, sy + 2); P(c, PAL.ink, sx + 4, sy + 2);
      H(c, PAL.boneD, sx + 2, sy + 4, 2); H(c, PAL.boneL, sx + 1, sy, 3);
    };
    skull(x + 1, y + 9); skull(x + 9, y + 9); skull(x + 5, y + 3);
    R(c, PAL.bone, x + 0, y + 15, 16, 1);
  });

  def('COBWEB', 'Cobweb', 0, { layer: 'over', group: 'prop', biomes: ['cave', 'dungeon', 'crypt', 'ruins'], variants: 4 },
    (c, x, y, v) => {
      const r = sr(v);
      const corner = Math.floor(r() * 4);
      const fx = (corner === 1 || corner === 3) ? 15 : 0, sgn = (corner === 1 || corner === 3) ? -1 : 1;
      const fy = (corner >= 2) ? 15 : 0, sgy = (corner >= 2) ? -1 : 1;
      const web = 'rgba(226,222,210,0.72)';
      for (let i = 0; i <= 9; i++) { P(c, web, fx + sgn * i, fy + sgy * (9 - i)); }
      for (let i = 0; i <= 6; i++) { P(c, web, fx + sgn * i, fy + sgy * (6 - i)); }
      for (let i = 0; i <= 9; i++) { P(c, web, fx + sgn * i, fy); P(c, web, fx, fy + sgy * i); }
      for (let i = 1; i <= 8; i++) P(c, web, fx + sgn * i, fy + sgy * i);
    });

  // --- 4.15 cave dressing --------------------------------------------------
  const shroom = (key, label, cap, capD, glow) => def(key, label, 0, { layer: 'deco', group: 'plant', biomes: ['cave', 'forest', 'underdark', 'marsh'], variants: 3 },
    (c, x, y, v) => {
      const r = sr(v);
      for (let i = 0; i < 3; i++) {
        const mx = x + 1 + Math.floor(r() * 11), my = y + 5 + Math.floor(r() * 7), h = 2 + Math.floor(r() * 2);
        contact(c, mx - 6, my, 5, h + 2);                  // they had no shadow at all
        R(c, '#2b2419', mx, my + 1, 4, h + 2);             // keyline
        R(c, '#d8cfae', mx + 1, my + 2, 2, h);
        // the cap's own dark tone measured only 10 Y from cave-floor speckle,
        // so the RIM is near-black and `capD` only shades the cap's flanks
        outline(c, '#2b2419', mx, my, [[0, 1, 3], [1, 0, 5], [2, 1, 3]]);
        blob(c, cap, mx, my, [[0, 1, 3], [1, 0, 5], [2, 1, 3]]);
        P(c, capD, mx, my + 1); P(c, capD, mx + 4, my + 1);
        P(c, '#f4ecd8', mx + 1, my);
        if (glow) { P(c, glow, mx + 2, my + 1); }
      }
    });
  shroom('MUSHROOM_RED', 'Red Mushrooms', '#c4453b', '#8f2c25', null);
  shroom('MUSHROOM_BROWN', 'Brown Mushrooms', '#9c7b52', '#725638', null);
  shroom('MUSHROOM_GLOW', 'Glowcap Mushrooms', '#6f8fd0', '#43619c', '#c8ecff');

  def('CRYSTAL', 'Crystal Cluster', SOLID, { layer: 'deco', group: 'prop', biomes: ['cave', 'underdark', 'mine'], variants: 3 },
    (c, x, y, v) => {
      const r = sr(v);
      contact(c, x, y, 12, 14);
      const shard = (sx, sy, h, w0) => {
        for (let i = 0; i < h; i++) {
          const ww = Math.min(w0, 1 + Math.floor(i * w0 / Math.max(1, h - 1)));
          R(c, PAL.crystalD, sx - (ww >> 1), sy + i, ww, 1);
        }
        for (let i = 1; i < h; i++) P(c, PAL.crystal, sx, sy + i);
        P(c, PAL.crystalL, sx, sy + 1);
      };
      shard(x + 5, y + 4 + Math.floor(r() * 2), 11, 5);
      shard(x + 10, y + 7, 8, 4);
      shard(x + 2, y + 9, 6, 3);
      P(c, PAL.glow, x + 5, y + 6); P(c, PAL.glow, x + 10, y + 9);
    });

  // Loose stone is painted by render/tiles_terrain.js section 12: faceted
  // granite lit flat, keylined only where the light cannot reach.
  def('STALAGMITE', 'Stalagmite', SOLID, { layer: 'deco', group: 'prop', biomes: ['cave', 'underdark', 'mine'], variants: 5 }, TR.paintStalagmite);

  def('STALACTITE', 'Stalactite', 0, { layer: 'over', group: 'prop', biomes: ['cave', 'underdark', 'mine'], variants: 3 },
    (c, x, y, v) => {
      const r = sr(v);
      const cone = (sx, len) => {
        for (let i = 0; i < len; i++) {
          const ww = Math.max(1, 5 - Math.floor(i * 5 / len));
          R(c, PAL.caveD, sx - (ww >> 1), y + i, ww, 1);
          P(c, PAL.cave, sx - (ww >> 1), y + i);
        }
      };
      cone(x + 3, 5 + Math.floor(r() * 4));
      cone(x + 9, 3 + Math.floor(r() * 5));
      cone(x + 14, 4 + Math.floor(r() * 3));
      H(c, PAL.caveD, x, y, 16);
    });

  def('RUBBLE', 'Rubble', SLOW, { layer: 'deco', group: 'prop', biomes: ['cave', 'ruins', 'dungeon', 'mine'], variants: 5 }, (c,x,y,v)=>paintProp(c,x,y,'rubble',v));
  // BOULDER and ROCK were repainted three times for the same fault: a dark
  // body inside a black rim averages to the ground it sits on. They are pale
  // faceted granite now, keylined on the shaded side only (section 12 there).
  def('BOULDER', 'Boulder', SOLID, { layer: 'deco', group: 'prop', biomes: ['plains', 'hills', 'mountain', 'cave', 'coast'], variants: 6 }, TR.paintBoulder);
  def('ROCK', 'Rock', 0, { layer: 'deco', group: 'prop', biomes: ['plains', 'hills', 'mountain', 'cave', 'coast'], variants: 6 }, TR.paintRock);

  // An ore seam is a patch of the CAVE WALL it runs through (same plates, same
  // edge bits, so it sits in a wall mass with no seam), with a vein glinting
  // across it.
  const ore = (key, label, gem, gemL) => def(key, label, SOLID, { layer: 'deco', group: 'cave-wall', biomes: ['mine', 'cave', 'underdark'], variants: 16, edgeVariant: true },
    (c, x, y, v, vi) => TR.paintOre(c, x, y, v, vi, gem, gemL));
  ore('ORE_IRON', 'Iron Vein', '#8d8378', '#c3bdb2');
  ore('ORE_SILVER', 'Silver Vein', '#a8b4c0', '#e8f0f8');
  ore('ORE_GEM', 'Gem Vein', '#8a4fb0', '#e0b4ff');

  // --- 4.16 dungeon furniture ---------------------------------------------
  def('CHEST_CLOSED', 'Chest', SOLID | TRIGGER, { layer: 'deco', group: 'prop', biomes: ['dungeon', 'cave', 'city', 'crypt'], variants: 1 }, (c, x, y) => {
    shadowUnder(c, x, y, 13, 13);
    outlineBox(c, PAL.barkXD, x, y, 2, 4, 12, 10);   // `barkD` alone was 1 Y from cave floor
    R(c, PAL.wood, x + 2, y + 8, 12, 6);
    blob(c, PAL.wood, x, y, [[4, 3, 10], [5, 2, 12], [6, 2, 12], [7, 2, 12]]);
    H(c, PAL.woodL, x + 3, y + 4, 10); V(c, PAL.woodL, x + 3, y + 5, 8);
    V(c, PAL.woodD, x + 12, y + 5, 8);
    O(c, PAL.barkD, x + 2, y + 4, 12, 10);
    R(c, PAL.gold, x + 2, y + 7, 12, 2); H(c, PAL.goldL, x + 2, y + 7, 12);
    R(c, PAL.gold, x + 7, y + 8, 2, 3); P(c, PAL.ink, x + 7, y + 9);
    V(c, PAL.goldD, x + 4, y + 4, 10); V(c, PAL.goldD, x + 11, y + 4, 10);
  });

  def('CHEST_OPEN', 'Open Chest', SOLID, { layer: 'deco', group: 'prop', biomes: ['dungeon', 'cave', 'city', 'crypt'], variants: 1 }, (c, x, y) => {
    contact(c, x, y, 13, 14);
    blob(c, PAL.wood, x, y, [[1, 3, 10], [2, 2, 12], [3, 2, 12]]);   // lid thrown back
    H(c, PAL.woodL, x + 3, y + 1, 10);
    R(c, PAL.wood, x + 2, y + 7, 12, 7);
    R(c, '#241a12', x + 3, y + 6, 10, 4);
    O(c, PAL.barkD, x + 2, y + 6, 12, 8);
    R(c, PAL.gold, x + 2, y + 10, 12, 1);
    P(c, PAL.goldL, x + 5, y + 8); P(c, PAL.gold, x + 7, y + 8); P(c, PAL.goldL, x + 9, y + 7);
  });

  def('LEVER', 'Lever', SOLID | TRIGGER, { layer: 'deco', group: 'prop', biomes: ['dungeon', 'mine'], variants: 1 }, (c, x, y) => {
    foot(c, x, y, 4, 8, 14, 0.9);
    R(c, PAL.stoneD, x + 4, y + 11, 8, 4); H(c, PAL.stoneL, x + 4, y + 11, 8);
    for (let i = 0; i < 7; i++) P(c, PAL.iron, x + 7 + Math.floor(i / 2), y + 11 - i);
    R(c, PAL.red, x + 9, y + 3, 2, 3); P(c, PAL.redL, x + 9, y + 3);
    P(c, PAL.metalL, x + 7, y + 10);
  });

  def('PRESSURE_PLATE', 'Pressure Plate', TRIGGER, { group: 'floor', biomes: ['dungeon', 'ruins'], variants: 1 }, (c, x, y) => {
    stoneSlabs(c, x, y, PAL.stone, PAL.stoneD, PAL.stoneL);
    R(c, PAL.stoneD, x + 2, y + 2, 12, 12);
    R(c, PAL.stoneL, x + 3, y + 3, 10, 10);
    O(c, PAL.stoneH, x + 3, y + 3, 10, 10);
    P(c, PAL.stoneD, x + 7, y + 7); P(c, PAL.stoneD, x + 8, y + 8);
  });

  def('PORTAL', 'Portal', TRIGGER, { layer: 'deco', group: 'prop', biomes: ['dungeon', 'underdark', 'ruins'], variants: 1, animFrames: 4, fps: 6 },
    (c, x, y, v, w, f) => {
      foot(c, x, y, 3, 10, 14, 1.0);                 // the arch stands on row 15
      blob(c, PAL.stoneD, x, y, [[0, 4, 8], [1, 2, 12], [2, 1, 14], [3, 0, 16], [4, 0, 16], [5, 0, 16], [6, 0, 16], [7, 0, 16], [8, 0, 16], [9, 0, 16], [10, 0, 16], [11, 0, 16], [12, 1, 14], [13, 1, 14], [14, 3, 10]]);
      blob(c, PAL.purpleD, x, y, [[1, 5, 6], [2, 3, 10], [3, 2, 12], [4, 2, 12], [5, 1, 14], [6, 1, 14], [7, 1, 14], [8, 1, 14], [9, 1, 14], [10, 2, 12], [11, 2, 12], [12, 3, 10], [13, 4, 8], [14, 5, 6]]);
      // swirling arms
      for (let a = 0; a < 3; a++) {
        for (let i = 0; i < 7; i++) {
          const ang = (f / 4 + a / 3) * Math.PI * 2 + i * 0.42;
          const rad = 1.2 + i * 0.85;
          const px = x + 8 + Math.round(Math.cos(ang) * rad), py = y + 8 + Math.round(Math.sin(ang) * rad * 0.95);
          P(c, i < 3 ? '#e8d0ff' : PAL.purple, px, py);
        }
      }
      P(c, '#ffffff', x + 8, y + 8);
    });

  def('STAIRS_UP', 'Stairs Up', TRIGGER, { group: 'floor', biomes: ['dungeon', 'cave', 'city'], variants: 1 }, (c, x, y) => {
    R(c, PAL.stoneD, x, y, 16, 16);
    for (let i = 0; i < 4; i++) {
      const sy = y + 12 - i * 4, inset = i;
      R(c, PAL.stoneL, x + inset, sy, 16 - inset * 2, 3);
      H(c, PAL.stoneH, x + inset, sy, 16 - inset * 2);
      H(c, PAL.stoneD, x + inset, sy + 3, 16 - inset * 2);
    }
    P(c, PAL.stoneH, x + 7, y + 1); P(c, PAL.stoneH, x + 8, y + 1);
  });

  def('STAIRS_DOWN', 'Stairs Down', TRIGGER, { group: 'floor', biomes: ['dungeon', 'cave', 'city'], variants: 1 }, (c, x, y) => {
    R(c, PAL.stoneL, x, y, 16, 16);
    for (let i = 0; i < 4; i++) {
      const sy = y + i * 4, inset = i;
      R(c, PAL.stone, x + inset, sy, 16 - inset * 2, 3);
      H(c, PAL.stoneH, x + inset, sy, 16 - inset * 2);
      H(c, PAL.stoneD, x + inset, sy + 3, 16 - inset * 2);
    }
    R(c, '#14100c', x + 4, y + 12, 8, 4);
  });

  def('LADDER', 'Ladder', TRIGGER, { layer: 'deco', group: 'prop', biomes: ['dungeon', 'cave', 'mine', 'city'], variants: 1 }, (c, x, y) => {
    footRight(c, x, y, 14, 0, 16, 0.85);             // leans on a wall, throws east
    R(c, PAL.wood, x + 3, y, 2, 16); R(c, PAL.wood, x + 11, y, 2, 16);
    V(c, PAL.woodL, x + 3, y, 16); V(c, PAL.woodL, x + 11, y, 16);
    for (let i = 0; i < 4; i++) { H(c, PAL.woodL, x + 5, y + 2 + i * 4, 6); H(c, PAL.woodD, x + 5, y + 3 + i * 4, 6); }
  });

  def('PIT', 'Pit', SOLID | LEDGE, { group: 'floor', biomes: ['dungeon', 'cave'], variants: 2 }, (c, x, y, v) => {
    const r = sr(v);
    R(c, PAL.stoneD, x, y, 16, 16);
    R(c, '#0e0b09', x + 1, y + 1, 14, 14);
    H(c, PAL.stoneL, x + 1, y + 1, 14); H(c, PAL.stone, x + 1, y + 2, 14);
    for (let i = 0; i < 5; i++) P(c, '#241c16', x + 2 + Math.floor(r() * 12), y + 4 + Math.floor(r() * 10));
    H(c, PAL.stoneD, x + 1, y + 14, 14);
  });

  def('SPIKE_TRAP', 'Spike Trap', TRIGGER | DAMAGE, { group: 'floor', biomes: ['dungeon', 'crypt'], variants: 1 }, (c, x, y) => {
    R(c, PAL.stoneD, x, y, 16, 16);
    R(c, '#120d0a', x + 1, y + 1, 14, 14);
    for (let i = 0; i < 4; i++) {
      const sx = x + 2 + i * 4;
      for (let h = 0; h < 7; h++) { const ww = Math.max(1, 3 - Math.floor(h / 3)); R(c, PAL.metal, sx, y + 12 - h, ww, 1); }
      V(c, PAL.metalL, sx, y + 6, 6);
      P(c, PAL.red, sx, y + 5);
    }
    O(c, PAL.stoneL, x, y, 16, 16);
  });

  def('BRIDGE_WOOD', 'Wooden Bridge', 0, { group: 'floor', biomes: ['forest', 'plains', 'marsh'], variants: 2 }, (c, x, y, v) => {
    const r = sr(v);
    R(c, PAL.wood, x, y, 16, 16);
    for (let i = 0; i < 5; i++) { H(c, PAL.woodD, x, y + i * 3 + 2, 16); H(c, PAL.woodL, x, y + i * 3, 16); }
    R(c, PAL.barkD, x, y, 2, 16); R(c, PAL.barkD, x + 14, y, 2, 16);
    V(c, PAL.barkL, x, y, 16); V(c, PAL.barkL, x + 14, y, 16);
    dashes(c, PAL.woodD, x + 3, y, 4, r, 2, 10);
  });

  def('BRIDGE_STONE', 'Stone Bridge', 0, { group: 'floor', biomes: ['road', 'city', 'mountain'], variants: 2 }, (c, x, y, v) => {
    const r = sr(v);
    // mortar was `stoneD` on a `stoneL` base — a 35 L* range inside one floor
    // tile, the loudest surface in the set. `stoneM` halves it.
    stoneSlabs(c, x, y, PAL.stoneL, PAL.stoneM, PAL.stoneH);
    R(c, PAL.stone, x, y, 16, 2); R(c, PAL.stone, x, y + 14, 16, 2);
    H(c, PAL.stoneL, x, y, 16); H(c, PAL.stoneD, x, y + 15, 16);
    speck(c, PAL.stoneM, x, y + 3, 5, r, 16, 10);
  });

  // --- 4.17 trees & foliage ------------------------------------------------
  // Clustered canopies from render/tiles_terrain.js section 4. The 2x2 trees
  // render each quadrant from one fixed layout in tree space, so they declare a
  // single variant: four tiles hashed independently could not agree on more.
  def('TREE_OAK', 'Oak', SOLID, { layer: 'deco', group: 'tree', biomes: ['forest', 'plains', 'hills'], variants: 8 }, TR.paintOak);
  def('TREE_PINE', 'Pine', SOLID, { layer: 'deco', group: 'tree', biomes: ['pine-forest', 'mountain', 'tundra'], variants: 6 }, TR.paintPine);

  def('OAK_TL', 'Oak', SOLID, { layer: 'over', group: 'tree', biomes: ['forest'], variants: 1 }, (c, x, y, v) => TR.paintBigOak(c, x, y, v, 0, 0));
  def('OAK_TR', 'Oak', SOLID, { layer: 'over', group: 'tree', biomes: ['forest'], variants: 1 }, (c, x, y, v) => TR.paintBigOak(c, x, y, v, 1, 0));
  def('OAK_BL', 'Oak', SOLID, { layer: 'deco', group: 'tree', biomes: ['forest'], variants: 1 }, (c, x, y, v) => TR.paintBigOak(c, x, y, v, 0, 1));
  def('OAK_BR', 'Oak', SOLID, { layer: 'deco', group: 'tree', biomes: ['forest'], variants: 1 }, (c, x, y, v) => TR.paintBigOak(c, x, y, v, 1, 1));

  def('PINE_TL', 'Pine', SOLID, { layer: 'over', group: 'tree', biomes: ['pine-forest'], variants: 1 }, (c, x, y, v) => TR.paintBigPine(c, x, y, v, 0, 0));
  def('PINE_TR', 'Pine', SOLID, { layer: 'over', group: 'tree', biomes: ['pine-forest'], variants: 1 }, (c, x, y, v) => TR.paintBigPine(c, x, y, v, 1, 0));
  def('PINE_BL', 'Pine', SOLID, { layer: 'deco', group: 'tree', biomes: ['pine-forest'], variants: 1 }, (c, x, y, v) => TR.paintBigPine(c, x, y, v, 0, 1));
  def('PINE_BR', 'Pine', SOLID, { layer: 'deco', group: 'tree', biomes: ['pine-forest'], variants: 1 }, (c, x, y, v) => TR.paintBigPine(c, x, y, v, 1, 1));

  // Grown limbs and a sawn stub: render/tiles_terrain.js section 4.
  def('DEAD_TREE', 'Dead Tree', SOLID, { layer: 'deco', group: 'tree', biomes: ['marsh', 'ash-waste', 'ruins', 'tundra'], variants: 6 }, TR.paintDeadTree);
  def('STUMP', 'Stump', SOLID, { layer: 'deco', group: 'prop', biomes: ['forest', 'pine-forest', 'plains'], variants: 4 }, TR.paintStump);

  def('BUSH', 'Bush', SOLID, { layer: 'deco', group: 'plant', biomes: ['forest', 'plains', 'hills'], variants: 6 },
    (c,x,y,v)=>paintProp(c,x,y,'bush',v));
  def('BERRY_BUSH', 'Berry Bush', SOLID | TRIGGER, { layer: 'deco', group: 'plant', biomes: ['forest', 'plains'], variants: 4 },
    (c,x,y,v)=>{paintProp(c,x,y,'bush',v);for(const [a,b] of [[4,7],[9,5],[11,9]]){R(c,'#6b3542',x+a,y+b,2,2);P(c,'#c67a73',x+a,y+b);}} );

  // Was the single worst prop in the set: ΔE 3.8 from grass with 52% of its rim
  // invisible, and no contact shadow anywhere. A hedge is a wall of leaves, so
  // it gets what a wall gets — lit crown, shaded face, occlusion at the foot.
  // A clipped hedge (render/tiles_arch.js 6d): a block, not a green square;
  // resolveArch() gives each tile of a run the member for its neighbours.
  def('HEDGE', 'Hedge', SOLID, { layer: 'deco', group: 'plant', biomes: ['city', 'plains'], variants: 2 }, (c, x, y, v, vi) => AR.paintHedge(c, x, y, vi, 0));

  // Marsh margins: render/tiles_terrain.js section 13.
  def('REEDS', 'Reeds', SLOW, { layer: 'deco', group: 'plant', biomes: ['marsh', 'coast'], variants: 6 }, (c, x, y, v) => TR.paintReeds(c, x, y, v, false));
  def('CATTAILS', 'Cattails', SLOW, { layer: 'deco', group: 'plant', biomes: ['marsh', 'coast'], variants: 6 }, (c, x, y, v) => TR.paintReeds(c, x, y, v, true));

  def('CACTUS', 'Cactus', SOLID | DAMAGE, { layer: 'deco', group: 'plant', biomes: ['coast', 'ruins'], variants: 2 }, (c, x, y) => {
    contact(c, x, y, 8, 15);
    const rim = '#152a1c';
    R(c, rim, x + 5, y + 2, 6, 14);                       // keyline hugs the trunk
    R(c, rim, x + 1, y + 4, 5, 6); R(c, rim, x + 9, y + 5, 6, 7);
    R(c, rim, x + 11, y + 5, 4, 7);
    R(c, '#3f7a55', x + 6, y + 3, 4, 13);
    V(c, '#5aa070', x + 6, y + 3, 13); V(c, '#2c5a3d', x + 9, y + 3, 13);
    R(c, '#3f7a55', x + 2, y + 7, 4, 2); R(c, '#3f7a55', x + 2, y + 5, 2, 4);
    R(c, '#3f7a55', x + 10, y + 9, 4, 2); R(c, '#3f7a55', x + 12, y + 6, 2, 5);
    V(c, '#5aa070', x + 2, y + 5, 4); V(c, '#2c5a3d', x + 13, y + 6, 5);
    for (let i = 0; i < 5; i++) { P(c, '#d8e0b0', x + 7, y + 4 + i * 2); P(c, '#d8e0b0', x + 3, y + 6); P(c, '#d8e0b0', x + 12, y + 8); }
    H(c, '#5aa070', x + 6, y + 3, 4);
  });

  def('DRIFTWOOD', 'Driftwood', 0, { layer: 'deco', group: 'prop', biomes: ['coast', 'marsh'], variants: 4 }, TR.paintDriftwood);

  // Register a light-void backdrop id last so map editors have a "clear" tile.
  def('BLACK', 'Darkness', SOLID, { layer: 'over', biomes: [] }, (c, x, y) => { R(c, '#000000', x, y, 16, 16); });

  // =========================================================================
  // 4.18 ADDITIONS (2026 art pass)
  //
  // Ids are handed out sequentially and hand-authored maps in world/maps.js
  // store raw ids, so everything new goes HERE, after BLACK. Never insert into
  // the middle of the list.
  // =========================================================================

  /**
   * ROAD FRINGE. A road meeting grass used to be a straight blocky cut — the
   * loudest boundary in the game. These carry an irregular turf verge on the
   * named sides, and are named DIRT_PATH_N … DIRT_PATH_NW / DIRT_N … DIRT_NW,
   * exactly the family naming `autotileEdges()` resolves (`BASE_${suffix}`), so
   * world/overworld.js section 4b finds and draws them with no list to keep.
   * They stay in the `dirt` group so a path beside plain DIRT grows no edge.
   *
   * The turf is the real sward (tiles_terrain.js section 7 composites the two
   * painters through a wandering mask), so it joins the GRASS tile next door as
   * another grass tile would; the turf shades the soil just past its edge on
   * the sides the light comes from, and lit blades lean out over the rest.
   */
  const pathEdge = (key, sides) => def(key, 'Path', 0, { group: 'dirt', biomes: ['road', 'plains', 'city'], variants: 6 },
    (c, x, y, v) => TR.paintPathEdge(c, x, y, v, sides));
  pathEdge('DIRT_PATH_N', ['N']);
  pathEdge('DIRT_PATH_E', ['E']);
  pathEdge('DIRT_PATH_S', ['S']);
  pathEdge('DIRT_PATH_W', ['W']);
  pathEdge('DIRT_PATH_NE', ['N', 'E']);
  pathEdge('DIRT_PATH_SE', ['S', 'E']);
  pathEdge('DIRT_PATH_SW', ['S', 'W']);
  pathEdge('DIRT_PATH_NW', ['N', 'W']);

  const dirtEdge = (key, sides) => def(key, 'Dirt', 0, { group: 'dirt', biomes: ['plains', 'road', 'ruins'], variants: 6 },
    (c, x, y, v) => TR.paintDirtEdge(c, x, y, v, sides));
  dirtEdge('DIRT_N', ['N']);
  dirtEdge('DIRT_E', ['E']);
  dirtEdge('DIRT_S', ['S']);
  dirtEdge('DIRT_W', ['W']);
  dirtEdge('DIRT_NE', ['N', 'E']);
  dirtEdge('DIRT_SE', ['S', 'E']);
  dirtEdge('DIRT_SW', ['S', 'W']);
  dirtEdge('DIRT_NW', ['N', 'W']);

  /** A wheel-rutted road with a grassy crown, for long straight stretches of highway. */
  def('DIRT_PATH_RUT', 'Rutted Road', 0, { group: 'dirt', biomes: ['road', 'plains'], variants: 6 }, TR.paintRut);

  /**
   * A standalone prop shadow, for anything the game drops on the ground that
   * does not paint its own (spawned pickups, editor placements). Deco layer,
   * no flags, drawn under whatever sits on it.
   */
  def('PROP_SHADOW', 'Shadow', 0, { layer: 'deco', group: 'prop', biomes: [], variants: 1 }, (c, x, y) => {
    contact(c, x, y, 12, 12, 0);
  });

  /**
   * ROOF_SHADOW / WALL_TOP_* — the pieces a building needs to stop reading as a
   * sticker. ROOF_SHADOW is the strip of ground a roof overhangs (put it on the
   * row below the eave); WALL_TOP_LIT and WALL_TOP_SHADE are the crown of a
   * wall seen from above with a committed upper-left light.
   */
  def('ROOF_SHADOW', 'Eave Shadow', 0, { layer: 'deco', group: 'roof', biomes: ['city'], variants: 1 }, (c, x, y) => {
    c.fillStyle = 'rgba(14,10,8,0.42)'; c.fillRect(x, y, 16, 3);
    c.fillStyle = 'rgba(14,10,8,0.24)'; c.fillRect(x, y + 3, 16, 2);
    c.fillStyle = 'rgba(14,10,8,0.10)'; c.fillRect(x, y + 5, 16, 1);
  });

  /**
   * These two are the tiles that ARE allowed a mass edge, because they are the
   * only wall tiles that know where they sit — which is the whole reason the
   * body tiles no longer guess. `maps.js:228` places WALL_TOP_SHADE as the BASE
   * COURSE of every stone, brick and ruined facade (`fy = y + h - 1`, the door
   * row), and the census agrees: 165 placements, 100% of them with nothing
   * below and 72% with a wall directly above. So it is a FOOT, not a crown —
   * heavy flat course, occlusion where it meets the ground, and no lit cap,
   * because there is a STONE_WALL sitting on it. WALL_TOP_LIT is the mirror
   * image and is the one to reach for at the top of a mass.
   *
   * What neither is allowed any more is a `stoneH`/`stoneM` column 0 and a
   * `stoneD`/`stoneXD` column 15. Base courses run in horizontal rows, so that
   * put a light-then-dark pinstripe every 16 columns along the foot of every
   * building in Phandalin and Neverwinter — column-profile amplitude 30.7 and
   * 32.2, the largest in the file after the wall crowns themselves.
   */
  def('WALL_TOP_LIT', 'Wall Crown', SOLID, { layer: 'deco', group: 'wall', biomes: ['city', 'ruins', 'dungeon'], variants: 16, edgeVariant: true },
    (c, x, y, v, vi) => {
      const r = sr(v);
      coursed(c, x, y, vi, SEAM.crownLit, 4, 5, 9,
        [PAL.stoneL, PAL.stoneL, PAL.stoneM, PAL.stoneM],
        [PAL.stoneH, PAL.stoneH, PAL.stoneL, PAL.stoneL], PAL.stoneG, PAL.stoneG);
      patchBlock(c, PAL.stoneM, x, y, r, 4, 4, 7, 1);
      speck(c, PAL.stoneH, x, y, 5, r);
      seam(c, x, y, SEAM.crownLit, SEAM_TONE.masonry, 7, 3, 3);
      R(c, PAL.stoneH, x, y, 16, 2);                 // the lit crown of the mass
    });

  def('WALL_TOP_SHADE', 'Wall Base Course', SOLID, { layer: 'deco', group: 'wall', biomes: ['city', 'ruins', 'dungeon'], variants: 16, edgeVariant: true },
    (c, x, y, v, vi) => {
      const r = sr(v);
      // 8px blocks: a plinth is laid in bigger, flatter stones than the wall
      coursed(c, x, y, vi, SEAM.crownShade, 8, 7, 12,
        [PAL.stone, PAL.stoneG],
        [PAL.stoneM, PAL.stone], PAL.stoneD, PAL.stoneD);
      patchBlock(c, PAL.stoneM, x, y, r, 8, 5, 9, 1);
      speck(c, PAL.stoneG, x, y, 5, r);
      seam(c, x, y, SEAM.crownShade, SEAM_TONE.masonry, 7, 3, 3);
      R(c, PAL.stoneXD, x, y + 15, 16, 1);           // where the plinth meets the ground
    });

  // -------------------------------------------------------------------------
  // APPEND-ONLY ZONE. `def` hands out ids in call order and every authored map
  // stores raw ids, so nothing may be inserted above this line — only added
  // below it.
  // -------------------------------------------------------------------------

  /**
   * QUAY_N .. QUAY_NW — the waterline where it meets MASONRY.
   *
   * Identical geometry to SHORE_* (same suffix meaning: the named sides are the
   * ones the water does NOT continue into), same shared-edge joins, but the
   * margin is a soaked, algae-darkened kerb instead of silt, and it barely
   * wanders: a harbour wall is built, so it should be straight, where a river
   * bank should not. Use these where the water meets COBBLE, FLAGSTONE, STONE
   * or a building; use SHORE_* everywhere else.
   */
  shoreFamily('QUAY', 'Quayside', true);

  // -------------------------------------------------------------------------
  // 4.20 LONE PATCHES — the _ISLE set. See section 2b for what these are and
  // why a four-sided nibble was not the answer; tiles_terrain.js section 9
  // paints them. Each paints the ground its islands ACTUALLY sit in — counted
  // over the ground plane of all 17 maps (tools/px/maps.mjs), not guessed —
  // with a soft blob of its own material on top:
  //
  //   SNOW_GRASS_ISLE  125, Neverwinter Wood, 96% grass around them
  //   DIRT_ISLE         62, Triboar Trail and Conyberry, 85% grass
  //   GRAVEL_ISLE       16, Conyberry and Wave Echo, all grass
  //   COBBLE_ISLE       11, Conyberry ruins, 63% bare earth
  //   PATH_ISLE         57, Neverwinter, every neighbour paved
  // -------------------------------------------------------------------------
  def('SNOW_GRASS_ISLE', 'Snow Patch', 0, { group: 'snow', biomes: [], variants: 16 }, TR.paintSnowIsle);
  def('DIRT_ISLE', 'Bare Patch', 0, { group: 'dirt', biomes: [], variants: 16 }, TR.paintDirtIsle);
  def('GRAVEL_ISLE', 'Scree Patch', SLOW, { group: 'dirt', biomes: [], variants: 16 }, TR.paintGravelIsle);
  def('COBBLE_ISLE', 'Broken Paving', 0, { group: 'road', biomes: [], variants: 16 }, TR.paintCobbleIsle);
  // Edge-variant like COBBLE, whose lattice it continues across every border.
  def('PATH_ISLE', 'Worn Paving', 0, { group: 'dirt', biomes: [], variants: 16, edgeVariant: true }, TR.paintPathIsle);

  // -------------------------------------------------------------------------
  // 4.30 GABLE-AWARE ROOF SETS — shingle, pantile, slate
  //
  // The same four authored keys thatch has (tiles_arch.js section 2 paints
  // them): RIDGE for building()'s first roof row, L / M / R below it.
  // -------------------------------------------------------------------------
  for (const [pre, mat] of [['SHINGLE', 'shingle'], ['TILE', 'pantile'], ['SLATE', 'slate']]) {
    const label = pre === 'SHINGLE' ? 'Shingle Roof' : pre === 'TILE' ? 'Tile Roof' : 'Slate Roof';
    for (const end of ['L', 'M', 'R']) def(`${pre}_${end}`, label, SOLID, AR.ROOF_OPTS, (c, x, y, v, vi) => AR.paintRoof(c, x, y, v, vi, mat, 'B', end));
    def(`${pre}_RIDGE`, label.replace('Roof', 'Ridge'), SOLID, AR.ROOF_OPTS, (c, x, y, v, vi) => AR.paintRoof(c, x, y, v, vi, mat, 'R', 'M'));
  }

  // -------------------------------------------------------------------------
  // 4.31 CANVAS — awnings, stalls, tents, washing
  //
  // Everything a market is made of that is not a building. Until now these were
  // faked with THATCH_M and FENCE_H on the `over` plane, which cast a roof's
  // overhang band onto the street (the mask only asks "is it SOLID") and read
  // as a roof with no house under it. AWNING and WASHING_LINE are NOT solid, so
  // they cast nothing and the party walks under them; MARKET_STALL and TENT
  // stand on `deco`, are solid, and cast the same contact shadow a barrel does.
  // -------------------------------------------------------------------------

  // The three dye jobs a Sword Coast market runs to, by variant.
  const CANVAS = [
    [PAL.dyeRed, PAL.dyeRedD], [PAL.dyeBlue, PAL.dyeBlueD], [PAL.dyeGreen, PAL.dyeGreenD],
    [PAL.dyeRed, PAL.dyeRedD], [PAL.canvasD, PAL.canvasD],
  ];
  /** Striped cloth seen from above: stripes run down the pitch, lit at the top edge. */
  const stripedCloth = (c, x, y, x0, y0, w, h, dye, dyeD) => {
    R(c, PAL.canvas, x + x0, y + y0, w, h);
    for (let i = 0; i < w; i += 4) { R(c, dye, x + x0 + i, y + y0, Math.min(2, w - i), h); }
    H(c, PAL.canvasL, x + x0, y + y0, w);
    H(c, PAL.canvasD, x + x0, y + y0 + h - 1, w);
    for (let i = 0; i < w; i += 4) { P(c, dyeD, x + x0 + i, y + y0 + h - 1); P(c, dyeD, x + x0 + i + 1, y + y0 + h - 1); }
  };
  /** A scalloped hem hanging off the bottom of a canvas edge. */
  const scallop = (c, x, y, x0, y0, w, dye, dyeD) => {
    for (let i = 0; i < w; i += 4) {
      const col = ((i >> 2) & 1) ? PAL.canvas : dye;
      mark(c, col, x, y, x0 + i, y0, Math.min(4, w - i), 1);
      mark(c, dyeD, x, y, x0 + i + 1, y0 + 1, Math.min(2, w - i - 1), 1);
    }
  };

  def('AWNING', 'Awning', 0, { layer: 'over', group: 'canvas', biomes: ['city'], variants: 5 }, (c, x, y, v) => {
    const r = sr(v);
    const [dye, dyeD] = CANVAS[Math.floor(r() * CANVAS.length)];
    // the canvas runs edge to edge so a row of them is one continuous shade
    stripedCloth(c, x, y, 0, 2, 16, 10, dye, dyeD);
    scallop(c, x, y, 0, 12, 16, dye, dyeD);
    // the pole it is rolled onto, on the skyline
    R(c, PAL.woodD, x, y, 16, 2); H(c, PAL.wood, x, y, 16);
    // sun-fade: a couple of paler patches where the dye has gone
    for (let i = 0; i < 2; i++) mark(c, PAL.canvasL, x, y, inX(r, 2), 3 + Math.floor(r() * 8), 2, 1);
  });

  def('MARKET_STALL', 'Market Stall', SOLID, { layer: 'deco', group: 'prop', biomes: ['city'], variants: 4 }, (c, x, y, v) => {
    const r = sr(v);
    const [dye, dyeD] = CANVAS[Math.floor(r() * 3)];
    shadowUnder(c, x, y, 14, 14);
    // the trestle: legs, a board, and the goods on it
    outlineBox(c, PAL.barkXD, x, y, 1, 8, 14, 4);
    R(c, PAL.wood, x + 1, y + 8, 14, 4); H(c, PAL.woodL, x + 1, y + 8, 14); H(c, PAL.woodD, x + 1, y + 11, 14);
    R(c, PAL.woodD, x + 2, y + 12, 2, 3); R(c, PAL.woodD, x + 12, y + 12, 2, 3);
    // wares: three lots, chosen per variant
    const wares = [
      () => { R(c, PAL.cloth, x + 3, y + 6, 3, 3); R(c, PAL.dyeBlue, x + 7, y + 6, 3, 3); R(c, PAL.dyeRed, x + 11, y + 6, 2, 3); },
      () => { R(c, '#c9a13b', x + 3, y + 7, 3, 2); R(c, '#8a3a2a', x + 7, y + 6, 3, 3); R(c, PAL.leafL, x + 11, y + 7, 3, 2); P(c, PAL.leafH, x + 12, y + 7); },
      () => { R(c, PAL.metal, x + 3, y + 6, 2, 3); R(c, PAL.gold, x + 7, y + 7, 2, 2); R(c, PAL.woodL, x + 10, y + 6, 4, 3); H(c, PAL.woodD, x + 10, y + 7, 4); },
      () => { R(c, PAL.sand, x + 3, y + 6, 4, 3); R(c, PAL.sandD, x + 8, y + 6, 4, 3); P(c, PAL.dyeRed, x + 5, y + 6); P(c, PAL.dyeGreen, x + 10, y + 6); },
    ];
    wares[Math.floor(r() * wares.length)]();
    // the canopy poles and the canopy itself, above and behind the board
    V(c, PAL.woodD, x + 1, y + 2, 7); V(c, PAL.woodD, x + 14, y + 2, 7);
    stripedCloth(c, x, y, 0, 1, 16, 3, dye, dyeD);
    scallop(c, x, y, 0, 4, 16, dye, dyeD);
    H(c, PAL.ink, x, y, 16);
  });

  const TENT_ROWS = [[2, 7, 2], [3, 6, 4], [4, 5, 6], [5, 5, 6], [6, 4, 8], [7, 4, 8], [8, 3, 10], [9, 3, 10], [10, 2, 12], [11, 2, 12], [12, 1, 14], [13, 1, 14]];
  def('TENT', 'Tent', SOLID, { layer: 'deco', group: 'prop', biomes: ['city', 'road', 'plains'], variants: 3 }, (c, x, y, v) => {
    const r = sr(v);
    const faded = r() < 0.5;
    const cloth = faded ? PAL.canvasD : PAL.canvas, clothD = faded ? PAL.mud : PAL.canvasD;
    shadowUnder(c, x, y, 14, 13);
    outline(c, PAL.barkXD, x, y, TENT_ROWS);
    blob(c, cloth, x, y, TENT_ROWS);
    // the ridge seam down the middle and the guy ropes off the peak
    V(c, clothD, x + 7, y + 3, 11); V(c, PAL.canvasL, x + 6, y + 3, 10);
    for (let i = 0; i < 4; i++) { P(c, clothD, x + 3 - i + 1, y + 3 + i * 2); P(c, clothD, x + 12 + i - 1, y + 3 + i * 2); }
    // the door flap, tied back on one side
    R(c, '#1c1712', x + 6, y + 9, 4, 5); V(c, cloth, x + 9, y + 9, 5);
    P(c, PAL.wood, x + 7, y + 1); P(c, PAL.wood, x + 7, y + 2);       // the ridge pole
    if (r() < 0.6) { P(c, PAL.dyeRed, x + 8, y + 2); P(c, PAL.dyeRed, x + 9, y + 2); }   // a pennant
    for (let i = 0; i < 3; i++) mark(c, clothD, x, y, 2 + Math.floor(r() * 11), 5 + Math.floor(r() * 7), 2, 1);
  });

  def('WASHING_LINE', 'Washing Line', 0, { layer: 'over', group: 'canvas', biomes: ['city'], variants: 5 }, (c, x, y, v) => {
    const r = sr(v);
    // the line, edge to edge so a run of tiles is one rope
    H(c, PAL.barkD, x, y + 4, 16); P(c, PAL.bark, x + 5, y + 4); P(c, PAL.bark, x + 11, y + 4);
    if (v % 5 === 4) return;                                   // a bare stretch of rope
    const cols = [PAL.canvas, PAL.dyeBlue, PAL.dyeRed, PAL.cloth, PAL.canvasL, PAL.dyeGreen];
    let px = 1 + Math.floor(r() * 2);
    while (px < 13) {
      const w = 2 + Math.floor(r() * 3), h = 4 + Math.floor(r() * 4);
      const col = cols[Math.floor(r() * cols.length)];
      R(c, col, x + px, y + 5, w, h);
      P(c, PAL.barkXD, x + px, y + 4); if (w > 2) P(c, PAL.barkXD, x + px + w - 1, y + 4);   // pegs
      V(c, shade(0.18), x + px + w - 1, y + 5, h);                                        // the fold
      H(c, shade(0.14), x + px, y + 5 + h - 1, w);
      px += w + 1 + Math.floor(r() * 2);
    }
  });

  // -------------------------------------------------------------------------
  // 4.32 STREET FURNITURE — banner, lantern, planter, trough, hay, dock, post
  // -------------------------------------------------------------------------

  def('BANNER', 'Banner', 0, { layer: 'deco', group: 'prop', biomes: ['city'], variants: 3 }, (c, x, y, v) => {
    const r = sr(v);
    const set = [[PAL.dyeRed, PAL.dyeRedD, PAL.gold], [PAL.dyeBlue, PAL.dyeBlueD, PAL.silver], [PAL.dyeGreen, PAL.dyeGreenD, PAL.gold]][Math.floor(r() * 3)];
    contact(c, x, y, 4, 15, 0);
    // the pole, capped
    V(c, PAL.barkXD, x + 4, y + 1, 15); V(c, PAL.woodL, x + 5, y + 1, 14); V(c, PAL.woodD, x + 6, y + 1, 14);
    R(c, set[2], x + 4, y, 3, 1);
    // the pennant, flying right off the pole, swallow-tailed
    blob(c, set[1], x, y, [[2, 6, 8], [3, 6, 8], [4, 6, 8], [5, 6, 8], [6, 6, 7], [7, 6, 6], [8, 6, 5], [9, 6, 4]]);
    blob(c, set[0], x, y, [[2, 7, 6], [3, 7, 6], [4, 7, 6], [5, 7, 6], [6, 7, 5], [7, 7, 4], [8, 7, 3], [9, 7, 2]]);
    H(c, set[2], x + 7, y + 2, 6);                       // the fringe at the head
    P(c, set[2], x + 9, y + 5); P(c, set[2], x + 10, y + 5); P(c, set[2], x + 9, y + 6);   // a device
    mark(c, set[1], x, y, 12, 8, 2, 1);                   // the tail lifting in the wind
  });

  def('LANTERN', 'Lantern', 0, { layer: 'deco', group: 'prop', biomes: ['city'], variants: 1, animFrames: 2, fps: 3 },
    (c, x, y, v, w, f) => {
      // the glow is drawn first so the ironwork sits on top of it
      c.fillStyle = 'rgba(255,196,96,0.16)'; c.fillRect(x + 2, y + 1, 12, 10);
      c.fillStyle = 'rgba(255,214,120,0.14)'; c.fillRect(x + 4, y + 2 + (f & 1), 8, 7);
      contact(c, x, y, 4, 15, 0);
      // the bracket post and the arm the lantern hangs from
      V(c, PAL.ironD, x + 3, y + 5, 11); V(c, PAL.iron, x + 4, y + 5, 10);
      H(c, PAL.ironD, x + 3, y + 5, 6); P(c, PAL.ironD, x + 8, y + 6);
      // the lantern: iron frame, horn panes, the flame
      R(c, PAL.ironD, x + 6, y + 7, 5, 6); R(c, '#e9c46a', x + 7, y + 8, 3, 4);
      P(c, PAL.fireHot, x + 8, y + 9 + (f & 1)); P(c, PAL.fire, x + 8, y + 10 - (f & 1));
      V(c, PAL.ironXD, x + 8, y + 8, 4);                   // the frame's middle bar, over the glass
      P(c, PAL.iron, x + 8, y + 6); R(c, PAL.iron, x + 7, y + 13, 3, 1);
    });

  def('PLANTER', 'Planter', SOLID, { layer: 'deco', group: 'prop', biomes: ['city'], variants: 3 }, (c, x, y, v) => {
    const r = sr(v);
    const petal = [PAL.red, '#e3b34a', PAL.blueL][v % 3], petalL = ['#e07a6a', '#f5d987', '#9fc0e8'][v % 3];
    shadowUnder(c, x, y, 14, 13);
    // the box
    outlineBox(c, PAL.barkXD, x, y, 1, 8, 14, 5);
    R(c, PAL.wood, x + 1, y + 8, 14, 5); H(c, PAL.woodL, x + 1, y + 8, 14); H(c, PAL.woodD, x + 1, y + 12, 14);
    V(c, PAL.woodD, x + 5, y + 9, 3); V(c, PAL.woodD, x + 10, y + 9, 3);
    // soil, and the plants spilling over the front edge
    H(c, PAL.mudD, x + 2, y + 8, 12);
    blob(c, PAL.leafD, x, y, [[4, 3, 10], [5, 2, 12], [6, 2, 12], [7, 1, 14], [8, 2, 12]]);
    blob(c, PAL.leaf, x, y, [[4, 4, 4], [5, 3, 5], [6, 3, 4], [7, 2, 6], [8, 3, 4]]);
    speck(c, PAL.leafL, x + 2, y + 4, 6, r, 12, 5);
    for (let i = 0; i < 5; i++) {
      const px = x + 2 + Math.floor(r() * 12), py = y + 3 + Math.floor(r() * 4);
      P(c, petal, px, py); P(c, petalL, px, py - 1);
    }
  });

  def('TROUGH', 'Water Trough', SOLID, { layer: 'deco', group: 'prop', biomes: ['city', 'road'], variants: 2 }, (c, x, y, v) => {
    const r = sr(v);
    shadowUnder(c, x, y, 14, 13);
    outlineBox(c, PAL.stoneXD, x, y, 1, 5, 14, 8);
    R(c, PAL.stone, x + 1, y + 5, 14, 8);
    H(c, PAL.stoneH, x + 1, y + 5, 14); H(c, PAL.stoneL, x + 1, y + 6, 14);
    H(c, PAL.stoneD, x + 1, y + 12, 14); V(c, PAL.stoneD, x + 14, y + 6, 6);
    R(c, PAL.waterD, x + 3, y + 7, 10, 4);
    R(c, PAL.water, x + 3, y + 7, 10, 3);
    H(c, PAL.waterL, x + 4 + Math.floor(r() * 3), y + 8, 3);
    P(c, PAL.foam, x + 11 - Math.floor(r() * 3), y + 9);
    if (r() < 0.5) { P(c, PAL.moss, x + 2, y + 11); P(c, PAL.moss, x + 13, y + 6); }   // slime at the waterline
  });

  const HAY_ROWS = [[5, 6, 4], [6, 4, 8], [7, 3, 10], [8, 2, 12], [9, 2, 12], [10, 1, 14], [11, 1, 14], [12, 1, 14], [13, 2, 12]];
  def('HAY', 'Hay Pile', SOLID, { layer: 'deco', group: 'prop', biomes: ['city', 'plains', 'road'], variants: 3 }, (c, x, y, v) => {
    const r = sr(v);
    shadowUnder(c, x, y, 13, 13);
    outline(c, PAL.thatchXD, x, y, HAY_ROWS);
    blob(c, PAL.thatch, x, y, HAY_ROWS);
    blob(c, PAL.thatchL, x, y, [[5, 6, 3], [6, 4, 4], [7, 3, 4], [8, 2, 3]]);
    blob(c, PAL.thatchD, x, y, [[11, 9, 6], [12, 8, 7], [13, 7, 7]]);
    for (let i = 0; i < 9; i++) mark(c, r() < 0.5 ? PAL.thatchD : PAL.thatchM, x, y, 2 + Math.floor(r() * 12), 6 + Math.floor(r() * 7), 1, 1 + Math.floor(r() * 2));
    for (let i = 0; i < 4; i++) mark(c, PAL.thatchL, x, y, 3 + Math.floor(r() * 10), 6 + Math.floor(r() * 5), 2, 1);
    // loose straw round the foot
    for (let i = 0; i < 4; i++) mark(c, PAL.thatchM, x, y, Math.floor(r() * 15), 13 + Math.floor(r() * 2), 2, 1);
  });

  /**
   * DOCK — a plank floor laid over water. The boards run across the tile with a
   * 1px gap between them through which the water shows, so a quay of these
   * reads as a deck and not as a wooden floor that happens to be beside the
   * sea. Walkable, `floor` group (the water autotiler draws its own margin
   * against it, as it does against any built surface).
   */
  def('DOCK', 'Dock Planks', 0, { group: 'floor', biomes: ['coast', 'city'], variants: 4 }, (c, x, y, v) => {
    const r = sr(v);
    R(c, PAL.deep, x, y, 16, 16);
    for (let i = 0; i < 3; i++) mark(c, PAL.deepL, x, y, inX(r, 3), inY(r, 1), 3, 1);
    // four boards, 3px each, on a 4px pitch: rows 0-2, 4-6, 8-10, 12-14, with
    // row 15 the gap that lines up with the next tile's row -1
    for (let i = 0; i < 4; i++) {
      const by = y + i * 4;
      R(c, PAL.wood, x, by, 16, 3); H(c, PAL.woodL, x, by, 16); H(c, PAL.woodD, x, by + 2, 16);
      // a butt joint somewhere along the board, agreed with nobody: boards are
      // short and joints wander
      const jx = 2 + Math.floor(r() * 12);
      V(c, PAL.barkD, x + jx, by, 3);
      if (r() < 0.4) P(c, PAL.ironD, x + jx + 2, by + 1);            // a nail head
    }
    dashes(c, PAL.woodD, x, y, 3, r, 3);
    if (r() < 0.5) mark(c, PAL.moss, x, y, inX(r, 2), 12, 2, 1);      // weed at the waterline
    seam(c, x, y, SEAM.dock, SEAM_TONE.dock, 5, 3, 2);
  });

  def('PIER_POST', 'Mooring Post', SOLID, { layer: 'deco', group: 'prop', biomes: ['coast', 'city'], variants: 2 }, (c, x, y, v) => {
    const r = sr(v);
    footRight(c, x, y, 11, 2, 13, 0.9);
    outlineBox(c, PAL.barkXD, x, y, 5, 1, 5, 14);
    R(c, PAL.bark, x + 5, y + 1, 5, 14);
    V(c, PAL.barkL, x + 5, y + 1, 14); V(c, PAL.barkD, x + 9, y + 1, 14);
    R(c, PAL.barkL, x + 5, y + 1, 5, 1); H(c, PAL.woodH, x + 6, y + 1, 3);
    // the rope coiled round it, and its tail
    R(c, PAL.cloth, x + 4, y + 5, 7, 3); H(c, PAL.clothD, x + 4, y + 7, 7); P(c, PAL.clothD, x + 4, y + 5); P(c, PAL.clothD, x + 10, y + 5);
    if (r() < 0.5) { P(c, PAL.cloth, x + 11, y + 8); P(c, PAL.cloth, x + 12, y + 9); P(c, PAL.clothD, x + 12, y + 10); }
    for (let i = 0; i < 3; i++) P(c, PAL.moss, x + 6 + Math.floor(r() * 3), y + 10 + Math.floor(r() * 4));   // weed at the tideline
  });

  /**
   * SHOP_SIGN — a board hung from an iron bracket, for the WALL of a shop.
   *
   * SIGN is a signpost: a board on a post that goes into the ground, rows 8-15.
   * building() was placing it on the wall face, so every shop in the game had a
   * signpost with its post driven through the plaster. A hanging sign is a
   * different object: the bracket comes out of the wall at the top, the board
   * swings under it, and nothing touches the ground — which is why this one is
   * anchored to the TOP of the tile and leaves the bottom rows empty.
   */
  def('SHOP_SIGN', 'Shop Sign', 0, { layer: 'over', group: 'prop', biomes: ['city'], variants: 3 }, (c, x, y, v) => {
    const r = sr(v);
    // the bracket: a spur out of the wall and a short stay down to the eye
    R(c, PAL.ironD, x + 2, y + 1, 9, 1);
    P(c, PAL.ironD, x + 3, y + 2); P(c, PAL.ironD, x + 10, y + 2);
    H(c, PAL.iron, x + 2, y + 1, 8);
    // the two rings the board swings on
    P(c, PAL.ironD, x + 5, y + 3); P(c, PAL.ironD, x + 9, y + 3);
    // the board itself, hanging clear of the wall
    outlineBox(c, PAL.barkXD, x, y, 3, 4, 10, 7);
    R(c, PAL.wood, x + 3, y + 4, 10, 7);
    O(c, PAL.woodD, x + 3, y + 4, 10, 7);
    H(c, PAL.woodL, x + 4, y + 5, 8);
    // a device painted on it: a tankard, a loaf, a horseshoe — legible at 16px
    // only as a shape, which is exactly how a real one worked for the illiterate
    const dev = Math.floor(r() * 3);
    if (dev === 0) { R(c, PAL.ink, x + 6, y + 6, 4, 4); P(c, PAL.ink, x + 10, y + 7); P(c, PAL.ink, x + 10, y + 8); }
    else if (dev === 1) { R(c, PAL.ink, x + 5, y + 7, 6, 3); H(c, PAL.ink, x + 6, y + 6, 4); }
    else { H(c, PAL.ink, x + 6, y + 6, 4); V(c, PAL.ink, x + 5, y + 7, 3); V(c, PAL.ink, x + 10, y + 7, 3); }
    // the shadow the board throws back onto the plaster behind it
    R(c, 'rgba(0,0,0,0.22)', x + 4, y + 11, 10, 1);
  });

  // -------------------------------------------------------------------------
  // 4.40 TERRAIN ADDITIONS (2026-09 overhaul) — painted in tiles_terrain.js.
  // Two more broadleaf species, so a wood can be more than one tree: a birch
  // for the open Sword Coast forests and a willow for riverbanks and marsh.
  // -------------------------------------------------------------------------
  def('TREE_BIRCH', 'Birch', SOLID, { layer: 'deco', group: 'tree', biomes: ['forest', 'plains', 'pine-forest'], variants: 6 }, TR.paintBirch);
  def('TREE_WILLOW', 'Willow', SOLID, { layer: 'deco', group: 'tree', biomes: ['marsh', 'forest', 'plains'], variants: 4 }, TR.paintWillow);

  // The shelf where shallows drop into deep water: deep water carrying a band
  // of the shallow body on the named sides (tiles_terrain.js `paintShelf`).
  // Baked onto WATER_DEEP by resolveTileMasses; same flags as deep water.
  // Lone wet patches in grass, drawn by the overworld's island rule in place of
  // a bare square (see ISLE_OF). Visual only: the map keeps MUD / SWAMP_WATER /
  // WATER and their flags.
  def('MUD_ISLE', 'Mud', SLOW, { group: 'dirt', biomes: [], variants: 12 }, TR.paintMudIsle);
  def('BOG_ISLE', 'Bog Water', WATER | SLOW | ENCOUNTER, { group: 'water', biomes: [], variants: 12 }, TR.paintBogIsle);
  def('POND_ISLE', 'Water', WATER | SLOW, { group: 'water', biomes: [], variants: 12 }, TR.paintPondIsle);

  for (let m = 1; m < 16; m++) {
    const sides = ['N', 'E', 'S', 'W'].filter((s, b) => m & (1 << b)).join('');
    def(TR.shelfKey(m), 'Deep Water', WATER | SOLID, { group: 'water', biomes: [], variants: 16, edgeVariant: true, animFrames: 4, fps: 3 },
      (c, x, y, v, vi, f) => TR.paintShelf(c, x, y, v, vi, f, sides));
  }

  // Architecture members (tiles_arch.js section 8): roof rows and verges, wall
  // corners, openings in each wall material, interior faces and tops, rug
  // borders, the notice board. Appended after everything above; see there.
  AR.registerArchTiles(def, TF, (k) => TILES_BY_NAME[k] || null);
  // Append-only: saved tile IDs above stay stable. Smooth dark stone distinguishes
  // Blackstaff Tower from the ward's brick shops; no per-frame canvas allocation.
  for(const side of ['STONE','LEFT','RIGHT','CROWN'])def('BLACKSTAFF_'+side,'Blackstaff Tower',SOLID,{layer:'deco',group:'blackstaff',biomes:['city'],variants:1},(c,x,y)=>{
    R(c,'#20232e',x,y,16,16);
    if(side==='LEFT'){R(c,'#11141d',x,y,3,16);R(c,'#3b4050',x+3,y,2,16);}
    if(side==='RIGHT'){R(c,'#141720',x+12,y,4,16);R(c,'#2b3040',x+10,y,2,16);}
    if(side==='CROWN'){R(c,'#10141e',x,y,16,5);R(c,'#4d5263',x,y+5,16,2);R(c,'#303545',x,y+7,16,3);}
  });
  def('BLACKSTAFF_THRESHOLD','Silver Ward-Mark',0,{layer:'deco',group:'blackstaff',biomes:['city'],variants:1},(c,x,y)=>{
    R(c,'#20232e',x,y,16,16);R(c,'#070e1c',x+3,y+3,10,13);
    H(c,'#acc4de',x+3,y+2,10);V(c,'#819fbf',x+2,y+3,13);V(c,'#819fbf',x+13,y+3,13);
    V(c,'#d9e4ee',x+7,y+5,8);H(c,'#d9e4ee',x+7,y+5,4);V(c,'#d9e4ee',x+10,y+3,3);P(c,'#e9eef5',x+7,y+3);H(c,'#809ab9',x+2,y+15,12);
  });
  def('BLACKSTAFF_SEAL','Practice Ward',0,{group:'floor',biomes:['city'],variants:1},(c,x,y)=>{
    R(c,'#30344c',x,y,16,16);c.strokeStyle='#96b5ce';c.lineWidth=1;c.beginPath();c.arc(x+8,y+8,6,0,Math.PI*2);c.stroke();
    c.strokeStyle='#d0c5a0';c.beginPath();c.moveTo(x+8,y+3);c.lineTo(x+12,y+11);c.lineTo(x+4,y+11);c.closePath();c.stroke();P(c,'#e4e6dd',x+8,y+8);
  });
  def('BLACKSTAFF_PLINTH','Tower Plinth',SOLID,{layer:'deco',group:'blackstaff',biomes:['city'],variants:1},(c,x,y)=>{
    R(c,'#20232e',x,y,16,16);H(c,'#41495b',x,y+11,16);R(c,'#161b26',x,y+12,16,4);H(c,'#2d3444',x,y+14,16);
  });
  for(const [name,col]of [['FACE_LIGHT','#2b3140'],['FACE_MID','#252a37'],['SIDE','#171e2c'],['SIDE_EDGE','#101724']])
    def('BLACKSTAFF_'+name,'Blackstaff Stone',SOLID,{layer:'deco',group:'blackstaff',biomes:['city'],variants:1},(c,x,y)=>{
      R(c,col,x,y,16,16);if(name==='SIDE_EDGE'){V(c,'#303a4d',x+13,y,16);R(c,'#080e18',x+14,y,2,16);}
    });
  def('BLACKSTAFF_ROOF','Tower Crown',SOLID,{layer:'deco',group:'blackstaff',biomes:['city'],variants:1},(c,x,y)=>{
    R(c,'#343e52',x,y,16,16);H(c,'#697389',x,y,16);H(c,'#202a3c',x,y+14,16);H(c,'#121a29',x,y+15,16);
    H(c,'#3e485c',x+2,y+6,6);H(c,'#2c3549',x+9,y+10,5);
  });
  def('BLACKSTAFF_CORNICE','Tower Cornice',SOLID,{layer:'deco',group:'blackstaff',biomes:['city'],variants:1},(c,x,y)=>{
    R(c,'#20232e',x,y,16,16);R(c,'#626d83',x,y,16,2);R(c,'#3f4960',x,y+2,16,4);R(c,'#171e2b',x,y+6,16,4);H(c,'#30394c',x,y+10,16);
  });
}

buildTiles();

// ---------------------------------------------------------------------------
// 5. RASTER CACHE + BLIT
// ---------------------------------------------------------------------------

const cache = new Map();      // "id|variant|frame" -> canvas
const CACHE_LIMIT = 2400;

function makeCanvas(w, h) {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const cx = cv.getContext('2d');
  if (cx) cx.imageSmoothingEnabled = false;
  return cv;
}

/**
 * Deterministic 2D hash — the source of per-tile variation. Pure function of
 * position, so a patch of grass looks the same every frame and every session.
 */
export function tileHash(wx, wy, salt = 0) {
  let h = Math.imul((wx | 0) + 0x9e3779b9, 0x85ebca6b);
  h ^= Math.imul((wy | 0) + 0xc2b2ae35, 0x27d4eb2f);
  h ^= Math.imul((salt | 0) + 0x165667b1, 0x9e3779b1);
  h ^= h >>> 15; h = Math.imul(h, 0x2545f491); h ^= h >>> 13;
  return h >>> 0;
}

/**
 * THE SHARED-EDGE VARIANT. A coastline has to leave one tile at exactly the
 * height it enters the next or it steps at every 16px border — which is what
 * the audit measured on the two maps that have water (22.25% and 28.08% of the
 * waterline's edge changes landing on a tile border, against a 6.25% floor).
 * A tile cannot look at its neighbour: its raster is cached by
 * (id, variant, frame) precisely so it is drawn once and blitted thereafter.
 *
 * So the tile hashes THE BORDER instead of itself. Its left border is the
 * coordinate (wx, wy) and its right border is (wx+1, wy) — and the tile to its
 * right calls its own left border (wx+1, wy), the same coordinate, and gets the
 * same bit. Four bits, one per side, packed into the variant index: any two
 * neighbours are then guaranteed to agree about the edge they share, with no
 * neighbour lookup at draw time and no extra rasters beyond the 16 the tile
 * declares. Bit 0 = left, 1 = right, 2 = top, 3 = bottom.
 */
const EDGE_SALT = 0x5b0e77;
export function edgeVariantAt(wx, wy) {
  return (tileHash(wx, wy, EDGE_SALT) & 1)
    | ((tileHash(wx + 1, wy, EDGE_SALT) & 1) << 1)
    | ((tileHash(wx, wy, EDGE_SALT + 1) & 1) << 2)
    | ((tileHash(wx, wy + 1, EDGE_SALT + 1) & 1) << 3);
}

/**
 * An edge-variant tile's index. One that declares MORE than 16 variants gets a
 * factor hashed from its own position above the four shared-border bits
 * (index = edge | extra << 4), so its interior can vary beyond the sixteen
 * border combinations while its borders still agree; painters read the edges
 * as `vi & 15`. At 16 or fewer this is exactly the old rule.
 */
function edgeIndex(d, wx, wy) {
  const e = edgeVariantAt(wx, wy);
  return d.variants > 16 ? e | ((tileHash(wx, wy, d.id) % (d.variants >> 4)) << 4) : e % d.variants;
}

/** Which variant of `id` sits at (wx, wy)? */
export function variantAt(id, wx, wy) {
  const d = TILES[id];
  if (!d || d.variants <= 1) return 0;
  if (d.edgeVariant) return edgeIndex(d, wx, wy);
  return tileHash(wx, wy, id) % d.variants;
}

/** Turn (id, variant) into the seed a draw function speckles from. */
function seedFor(id, variant) {
  return (Math.imul(id + 1, 0x9e3779b9) ^ Math.imul(variant + 1, 0x85ebca6b)) >>> 0;
}

/** Rasterise one (id, variant, frame) into a cached 16x16 canvas. */
function raster(id, variant, frame) {
  const key = `${id}|${variant}|${frame}`;
  let cv = cache.get(key);
  if (cv !== undefined) return cv;

  const d = TILES[id];
  cv = makeCanvas(16, 16);
  if (cv && d) {
    const cx = cv.getContext('2d');
    const seed = seedFor(id, variant);
    // 4th arg: the speckle seed. 5th: the RESOLVED VARIANT INDEX — a shore tile
    // needs the four shared-border bits back out of it, and a hashed seed has
    // thrown them away by then.
    try { d.draw(cx, 0, 0, seed, variant, frame); }
    catch (e) { console.error(`[tiles] ${d.key} failed to draw`, e); cx.fillStyle = '#ff00ff'; cx.fillRect(0, 0, 16, 16); }
  }
  if (cache.size > CACHE_LIMIT) {
    const kill = Array.from(cache.keys()).slice(0, CACHE_LIMIT >> 2);
    for (const k of kill) cache.delete(k);
  }
  cache.set(key, cv);
  return cv;
}

/** Drop every cached canvas (call after a palette/debug change). */
let cacheRevision = 0;
export function tileCacheRevision() { return cacheRevision; }
export function clearTileCache() { cache.clear(); cacheRevision++; }

/**
 * Blit tile `id` at pixel (px, py). `wx, wy` are the tile's world coordinates and
 * only feed the variation hash; `t` is seconds (Game.time) and drives animation.
 */
export function drawTile(ctx, id, px, py, wx = 0, wy = 0, t = 0) {
  const d = TILES[id];
  if (!d || id === 0) return;
  const variant = d.variants > 1 ? (d.edgeVariant ? edgeIndex(d, wx, wy) : (tileHash(wx, wy, id) % d.variants)) : 0;
  const frame = d.animFrames > 1 ? (Math.floor(t * d.fps) % d.animFrames) : 0;
  const cv = raster(id, variant, frame);
  if (cv) ctx.drawImage(cv, px | 0, py | 0);
}

/** Draw a tile without the world-position hash — for UI previews and pickers. */
export function drawTilePreview(ctx, id, px, py, t = 0, variant = 0) {
  const d = TILES[id];
  if (!d) return;
  const frame = d.animFrames > 1 ? (Math.floor(t * d.fps) % d.animFrames) : 0;
  const cv = raster(id, variant % d.variants, frame);
  if (cv) ctx.drawImage(cv, px | 0, py | 0);
}

// ---------------------------------------------------------------------------
// 6. QUERIES
// ---------------------------------------------------------------------------

export function tileDef(id) { return TILES[id] || TILES[0]; }
export function tileFlags(id) { const d = TILES[id]; return d ? d.flags : TF.SOLID; }
export function tileName(id) { const d = TILES[id]; return d ? d.name : 'Void'; }
export function tileKey(id) { const d = TILES[id]; return d ? d.key : 'VOID'; }
export function tileLayer(id) { const d = TILES[id]; return d ? d.layer : 'ground'; }
export function tileGroup(id) { const d = TILES[id]; return d ? d.group : null; }

/**
 * THE FINER MATERIAL KEY.
 *
 * `group` is what the AUTOTILER needs: it answers "does an edge have to be
 * drawn here", and for that GRAVEL, DIRT, DIRT_PATH, MUD and FARMLAND being one
 * `dirt` family is right — a road cut into bare earth should not grow a
 * coastline where it meets the soil it is cut into.
 *
 * It is the wrong question for the FRINGE. Measured in situ, the five members of
 * the `dirt` group meet each other 1,623 times across the maps, autotileEdges()
 * reports no edge at any of them, and so every one of those joins is a
 * ruler-straight 16px cut between two visibly different surfaces. GRAVEL against
 * DIRT alone is 809 of them at a grid-visibility ratio of 3.03 — harder than the
 * 2.69 that was the worst number in the whole original audit — carrying up to
 * 16.2 dE76 and 12.7 dL*. On the Triboar Trail that is dark rectangles scattered
 * through the road; at the mouth of Wave Echo Cave it is a chequerboard of tan
 * and grey squares sitting a few pixels from a grass boundary that now looks
 * excellent, which makes it read WORSE than it did before the boundary was
 * fixed.
 *
 * So: one key per visually distinct MATERIAL, which is what the verge has to
 * decide on. Everything with no finer distinction falls through to its group, so
 * the call is always safe and a caller can use it everywhere `group` was used.
 *
 *   gravel | dirt | path | mud | farmland      (were all 'dirt')
 *   snow | snow-grass                          (were both 'snow')
 *   cobble | flagstone                         (were both 'road')
 *   …and every other group, unchanged.
 *
 * Counted over the ground plane of every map, that splits exactly 1,623 joins
 * inside the `dirt` group (path 696, gravel 665, gravel|path 140, mud|path 62,
 * dirt|mud 41, farmland|path 15, gravel|mud 4) and 1,601 inside `road`.
 *
 * Grass is deliberately NOT split. GRASS/_2/_3/_4, the flowers, CLOVER and
 * GRASS_TALL are one sward at one value; splitting them would ask the fringe to
 * verge several thousand joins that read as texture variation, not as a material
 * change, which is a different (and unasked-for) piece of work.
 *
 * TWO THINGS A CALLER SWAPPING `tileGroup` FOR THIS MUST CARRY OVER.
 *
 *   1. Any rule that says "two BUILT surfaces never verge into one another" was
 *      written against the group names `road` and `floor`. `cobble` and
 *      `flagstone` are not in that set, so such a rule silently switches itself
 *      off — and 1,601 cobble|flagstone joins, which are 1.3 dL* apart and were
 *      never a defect, would start growing verges. Add both names to it.
 *   2. "Has no cardinal neighbour of my own kind" is a DIFFERENT question asked
 *      of the two keys, and the two answers mean different things. See
 *      `isleTileFor` — that distinction is load-bearing.
 */
const SUBGROUP_OF = {
  GRAVEL: 'gravel', GRAVEL_ISLE: 'gravel',
  DIRT: 'dirt', DIRT_ISLE: 'dirt',
  DIRT_PATH: 'path', DIRT_PATH_RUT: 'path', PATH_ISLE: 'path',
  MUD: 'mud',
  FARMLAND: 'farmland',
  SNOW_GRASS: 'snow-grass', SNOW_GRASS_ISLE: 'snow-grass',
  COBBLE: 'cobble', COBBLE_ISLE: 'cobble',
  FLAGSTONE: 'flagstone',
};
/** id -> resolved subgroup. Memoised: the fringe mask asks this per tile per map. */
const SUBGROUP = [];
/** Strip the eight autotile suffixes: DIRT_PATH_NW is still `path`. */
const FAMILY_SUFFIX = /_(N|E|S|W|NE|SE|SW|NW)$/;

export function tileSubgroup(id) {
  const d = TILES[id];
  if (!d) return null;
  const memo = SUBGROUP[id];
  if (memo !== undefined) return memo;
  const key = SUBGROUP_OF[d.key] || SUBGROUP_OF[d.key.replace(FAMILY_SUFFIX, '')];
  return (SUBGROUP[id] = key || d.group);
}

/**
 * THE PATCH TILE FOR A LONE ONE OF THESE, or 0 when there is no art for it.
 *
 * See section 2b. A tile with no cardinal neighbour of its own material cannot
 * be verged — four verges eat 42-62% of it — so it is drawn as a PATCH instead:
 * the surrounding family's ground straight across the tile with a soft,
 * hash-varied blob of this material sitting on it, clear of the border.
 *
 * The surround is baked into the art, because a raster cached by
 * (id, variant, frame) cannot look at a neighbour. It is not guessed: the ground
 * plane of every map was walked and the actual neighbours of every island
 * counted (tools/px/maps.mjs). Islands, and the ground they sit in:
 *
 *   SNOW_GRASS  125  Neverwinter Wood     96% grass          -> grass surround
 *   DIRT         62  Conyberry, Triboar   85% grass          -> grass surround
 *   DIRT_PATH    57  Neverwinter         100% paved          -> cobble surround
 *   GRAVEL       16  Conyberry, Wave Echo 100% grass         -> grass surround
 *   COBBLE       11  Conyberry             63% dirt          -> dirt surround
 *
 * A material whose islands are split across two unrelated surrounds gets no
 * entry here rather than a wrong one: 0 means "leave it as it is", which is what
 * this function returns for everything not listed.
 *
 * ============ WHICH "ISLAND" TEST, AND WHY IT MATTERS A LOT ============
 *
 * Those five counts are tiles with no cardinal neighbour of the same GROUP. Ask
 * the same question of `tileSubgroup` and the answer is 263 / 95 / 125 / 144 /
 * 57 — because a DIRT tile whose four neighbours are GRAVEL and DIRT_PATH has no
 * neighbour of its own SUBGROUP either. Those ~330 extra tiles are not islands
 * in any sense that matters here: they are in the middle of a road, and they are
 * precisely the 1,623 joins `tileSubgroup` exists to get VERGED. Painting a
 * patch there would put a disc of grass in the middle of the Triboar Trail.
 *
 *   A subgroup mismatch against a group NEIGHBOUR is a join -> verge it.
 *   No group neighbour at all is an island                  -> patch it.
 *
 * So the one-argument call is only safe on a tile with no same-GROUP cardinal
 * neighbour. If your island test is the subgroup one, pass a neighbour as
 * `under` (a tile id, or a subgroup string) and this returns 0 whenever that
 * neighbour is not the ground the patch is actually painted on — which is the
 * safe answer, because 0 means "do what you did before".
 */
/** key -> [patch tile, …the surround subgroups its art is painted to sit in]. */
const ISLE_OF = {
  SNOW_GRASS: ['SNOW_GRASS_ISLE', 'grass'],
  DIRT: ['DIRT_ISLE', 'grass'],
  GRAVEL: ['GRAVEL_ISLE', 'grass'],
  // dirt and path are the same brown earth 4.5 L* apart; gravel (-8 L*) is not
  COBBLE: ['COBBLE_ISLE', 'dirt', 'path'],
  // the two pavings are 1.3 L* apart and are already mixed freely on every
  // street in the game, so a cobble-backed patch is at home in both
  DIRT_PATH: ['PATH_ISLE', 'cobble', 'flagstone'],
  // lone wet ground in a meadow: the Mere's scatter of bog holes and wallows,
  // and the single-tile ponds of the woods (tiles_terrain.js section 9)
  MUD: ['MUD_ISLE', 'grass'],
  SWAMP_WATER: ['BOG_ISLE', 'grass'],
  WATER: ['POND_ISLE', 'grass'],
};
const ISLE_ID = [];

export function isleTileFor(id, under) {
  const d = TILES[id];
  if (!d) return 0;
  let e = ISLE_ID[id];
  if (e === undefined) {
    const spec = ISLE_OF[d.key] || ISLE_OF[d.key.replace(FAMILY_SUFFIX, '')];
    e = ISLE_ID[id] = (spec && T[spec[0]] != null) ? [T[spec[0]]].concat(spec.slice(1)) : 0;
  }
  if (!e) return 0;
  if (under === undefined || under === null) return e[0];
  // 'grass' covers GRASS/_2/_3/_4, the flowers, CLOVER and GRASS_TALL, which is
  // what the grass-backed patches are drawn to sit in.
  const g = typeof under === 'number' ? tileSubgroup(under) : under;
  for (let i = 1; i < e.length; i++) if (e[i] === g) return e[0];
  return 0;
}
export function isSolid(id) { return (tileFlags(id) & TF.SOLID) !== 0; }
export function isWater(id) { return (tileFlags(id) & TF.WATER) !== 0; }
export function isEncounter(id) { return (tileFlags(id) & TF.ENCOUNTER) !== 0; }
export function isAnimated(id) { const d = TILES[id]; return !!d && d.animFrames > 1; }
export function tileCount() { return nextId; }
export function allTileIds() { return Object.keys(TILES).map(Number); }

/** Every tile tagged with a biome, for procedural decorators. */
export function tilesByBiome(biome) {
  const out = [];
  for (const id of Object.keys(TILES)) { const d = TILES[id]; if (d.biomes.includes(biome)) out.push(d.id); }
  return out;
}

/** Resolve 'GRASS' | 12 | undefined to a real id, with a fallback. */
export function tileId(nameOrId, fallback = 0) {
  if (typeof nameOrId === 'number') return TILES[nameOrId] ? nameOrId : fallback;
  if (typeof nameOrId === 'string' && T[nameOrId] != null) return T[nameOrId];
  return fallback;
}

// ---------------------------------------------------------------------------
// 7. AUTOTILING
// ---------------------------------------------------------------------------

// Cardinal edge mask -> family suffix. Bits: N=1 E=2 S=4 W=8, set where the
// neighbour is a DIFFERENT material (i.e. where an edge must be drawn).
const CARD_SUFFIX = {
  0: null, 1: 'N', 2: 'E', 3: 'NE', 4: 'S', 5: 'N', 6: 'SE', 7: 'E',
  8: 'W', 9: 'NW', 10: 'E', 11: 'N', 12: 'SW', 13: 'W', 14: 'S', 15: 'N',
};
const DIAG_SUFFIX = { NE: 'NE', SE: 'SE', SW: 'SW', NW: 'NW' };

/** Read the ground layer of any TileMap-ish object without hard-coupling to it. */
function readTile(map, x, y) {
  if (!map) return -1;
  try {
    if (map.inBounds && !map.inBounds(x, y)) return -1;
    if (typeof map.at === 'function') return map.at('ground', x, y);
    if (map.ground && map.w) return map.ground[y * map.w + x];
    if (typeof map.get === 'function') return map.get(x, y);
  } catch { /* out of bounds or an unfamiliar map shape */ }
  return -1;
}

/**
 * Work out which edges of the tile at (x, y) border a *different* material, and
 * suggest the family member to draw.
 *
 *   const e = autotileEdges(map, x, y, T.WATER);
 *   drawTile(ctx, e.tile, px, py, x, y, t);
 *
 * Off-map neighbours count as the same material, so coastlines don't ring the
 * whole map. Neighbours sharing the tile's `group` (WATER vs WATER_DEEP,
 * CAVE_WALL vs ORE_IRON) also count as the same material.
 *
 * Returns { mask, card, n,e,s,w,ne,se,sw,nw, suffix, tile }.
 */
export function autotileEdges(map, x, y, id) {
  const d = TILES[id];
  const grp = d ? d.group : null;
  const same = (dx, dy) => {
    const v = readTile(map, x + dx, y + dy);
    if (v === -1 || v == null) return true;         // off-map / unknown = no edge
    if (v === id) return true;
    const o = TILES[v];
    return !!(grp && o && o.group === grp);
  };
  const n = !same(0, -1), e = !same(1, 0), s = !same(0, 1), w = !same(-1, 0);
  const ne = !same(1, -1), se = !same(1, 1), sw = !same(-1, 1), nw = !same(-1, -1);

  const card = (n ? 1 : 0) | (e ? 2 : 0) | (s ? 4 : 0) | (w ? 8 : 0);
  const mask = card | (ne ? 16 : 0) | (se ? 32 : 0) | (sw ? 64 : 0) | (nw ? 128 : 0);

  let suffix = CARD_SUFFIX[card];
  if (!suffix) {
    // No cardinal edge: a lone diagonal neighbour becomes an inner corner.
    if (ne) suffix = DIAG_SUFFIX.NE;
    else if (se) suffix = DIAG_SUFFIX.SE;
    else if (sw) suffix = DIAG_SUFFIX.SW;
    else if (nw) suffix = DIAG_SUFFIX.NW;
  }

  let tile = id;
  if (suffix && d) {
    // Families are named BASE_N, BASE_NE… ; shores live under SHORE_*.
    const base = d.key.replace(/_(N|E|S|W|NE|SE|SW|NW)$/, '');
    const cand = T[`${base}_${suffix}`];
    if (cand != null) tile = cand;
    else if (d.group === 'water') { const sh = T[`SHORE_${suffix}`]; if (sh != null) tile = sh; }
  }
  return { mask, card, n, e, s, w, ne, se, sw, nw, suffix: suffix || null, tile };
}

/** Convenience: the shore tile that should sit at a water edge. */
export function shoreFor(map, x, y) { return autotileEdges(map, x, y, T.WATER).tile; }

/**
 * Bake the edge members into every CLIFF and CAVE_WALL mass on a map's deco
 * plane (tiles_terrain.js `resolveMasses`): rims where a mass meets open
 * ground, a face on its south side. Then the shelves: deep water beside the
 * shallows becomes a WATER_SHELF member (`resolveShelves`). Map builders lay
 * the bare tiles; call this once when the map is built. Returns how many tiles
 * changed.
 */
export function resolveTileMasses(map) { return TR.resolveMasses(map, T, tileGroup) + TR.resolveShelves(map, T, tileGroup); }

/**
 * Architectural context: roof rows and verges, wall corners, the wall each
 * window and door sits in, interior wall faces and tops, rug borders, chimney
 * smoke. Called by world/maps.js loadMap after resolveTileMasses; idempotent.
 */
export function resolveArchitecture(map) { return AR.resolveArch(map, T, tileKey, tileGroup); }

/**
 * Is `id` a free-standing natural thing — a tree, a bush, a boulder, a stump —
 * that paints its own round contact shadow? The overworld's occlusion rim and
 * sun-shadow passes work in 16px squares, and a square of shade round a tree
 * boxes it in, so they leave these out (tiles_terrain.js `freeStanding`).
 */
export function tileFreeStanding(id) { const d = TILES[id]; return !!d && TR.freeStanding(d.key, d.group); }

/**
 * THE ARENA VERGE API. Draw ground tile (tx, ty) of `map` at (px, py) with soft
 * edges where a spreading neighbour (grass, snow, sand, soil...) meets it — for
 * any view that blits raw ground and has no verge pass of its own, above all the
 * battle arena. `map` needs `w`, `h` and `at('ground', x, y)` (a TileMap does).
 * The tongues run on across tile borders and never repeat; see
 * tiles_terrain.js section 14. The work is ~100 1px blits per verged side, so
 * draw a field ONCE into a cached canvas rather than every frame.
 *
 *   for each tile: drawGroundBlended(groundCtx, map, tx, ty, tx * 16, ty * 16);
 *   then deco on top with drawTile as before.
 */
export function drawGroundBlended(ctx, map, tx, ty, px, py, t = 0) {
  const id = map.at('ground', tx, ty);
  drawTile(ctx, id, px, py, tx, ty, t);
  const me = groundBlendRank(id);
  if (me == null || typeof document === 'undefined') return;
  const sub = tileSubgroup(id);
  const inv = [];
  for (let s = 0; s < 4; s++) {
    const nx = tx + (s === 1 ? 1 : s === 3 ? -1 : 0), ny = ty + (s === 2 ? 1 : s === 0 ? -1 : 0);
    if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h) continue;
    const nid = map.at('ground', nx, ny);
    if (!nid || nid === id || tileSubgroup(nid) === sub) continue;
    const rank = groundBlendRank(nid);
    if (rank != null && rank > me) inv.push([rank, s, nid]);
  }
  inv.sort((a, b) => a[0] - b[0]);
  for (const [, s, nid] of inv) {
    const d = TILES[nid];
    const frame = d.animFrames > 1 ? (Math.floor(t * d.fps) % d.animFrames) : 0;
    const cv = raster(nid, variantAt(nid, tx, ty), frame);
    const m = TR.vergeMaskAt(tx, ty, s);
    // the invader's lip shades the ground beside it — but only a different
    // material's: snow on snowy grass, or soil on a path, is one surface
    if (d.group !== TILES[id].group) {
      ctx.fillStyle = 'rgba(24,16,10,0.22)';
      for (let i = 0; i < 256; i++) if (m[i] === 2) ctx.fillRect(px + (i & 15), py + (i >> 4), 1, 1);
    }
    if (!cv) continue;
    // one blit per horizontal run of invaded pixels
    for (let yy = 0; yy < 16; yy++) {
      for (let xx = 0; xx < 16; xx++) {
        if (m[yy * 16 + xx] !== 1) continue;
        let n = 1; while (xx + n < 16 && m[yy * 16 + xx + n] === 1) n++;
        ctx.drawImage(cv, xx, yy, n, 1, px + xx, py + yy, n, 1);
        xx += n - 1;
      }
    }
  }
}

/** How strongly ground `id` spreads into its neighbours in drawGroundBlended; null = never. */
export function groundBlendRank(id) { const d = TILES[id]; return d && d.layer === 'ground' ? TR.blendRank(tileSubgroup(id), d.group) : null; }

// ---------------------------------------------------------------------------
// 8. REGISTRATION / WARM-UP
// ---------------------------------------------------------------------------

let warmed = false;

/**
 * Called once during boot (main.js). Definitions already exist at import time —
 * this pre-renders the tiles the first screen is certain to need so the opening
 * frames don't stutter, and returns a small report for the loading bar.
 */
export function registerTiles() {
  buildTiles();
  if (!warmed && typeof document !== 'undefined') {
    warmed = true;
    const warm = [
      'GRASS', 'GRASS_2', 'GRASS_3', 'GRASS_4', 'GRASS_TALL', 'DIRT', 'DIRT_PATH',
      'COBBLE', 'FLAGSTONE', 'WATER', 'STONE_WALL', 'WATTLE_WALL', 'WOOD_FLOOR',
      'THATCH_M', 'THATCH_L', 'THATCH_R', 'DOOR_CLOSED', 'TREE_OAK', 'TREE_PINE',
      'BUSH', 'ROCK', 'FENCE_H', 'CAVE_FLOOR', 'CAVE_WALL', 'DUNGEON_FLOOR', 'DUNGEON_WALL',
      // the road fringe: an autotiled road touches all eight of these at once,
      // so warming only DIRT_PATH would still stutter on the first road tile
      'DIRT_PATH_N', 'DIRT_PATH_E', 'DIRT_PATH_S', 'DIRT_PATH_W',
      'DIRT_PATH_NE', 'DIRT_PATH_SE', 'DIRT_PATH_SW', 'DIRT_PATH_NW', 'DIRT_PATH_RUT',
    ];
    for (const k of warm) {
      const id = T[k]; if (id == null) continue;
      const d = TILES[id];
      for (let v = 0; v < d.variants; v++) for (let f = 0; f < d.animFrames; f++) raster(id, v, f);
    }
  }
  return { tiles: nextId, cached: cache.size };
}

export default TILES;
