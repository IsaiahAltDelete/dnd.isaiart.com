// world/maps_south.js — THE ROAD SOUTH.
//
// The Trade Way from Waterdeep's south gate to the Black Dragon Gate of Baldur's
// Gate, and the Coast Way on beyond it to Beregost, Candlekeep and Nashkel. One
// great road, seventeen open places and fifteen rooms off it, in the shape
// world/maps.js's region-pack contract asks for:
//
//   REGION_MAPS   id -> raw def (maps.js runs it through its own `def()`)
//   REGION_LINKS  rows in the LINKS shape (maps.js expands them into warps)
//
// WHY THIS FILE CARRIES ITS OWN PAINTING KIT. `building()`, `room()`, `prop()`
// and the rest are module-private in maps.js — deliberately, so the core file
// can change its mind about them. §0 below is a faithful copy of maps.js §0–§1,
// plus a handful of things a road needs and a town does not: a curtain wall you
// can put a gate through, a road that wanders, and a stub builder for the
// procedural sites hanging off the road, which have to rewire their own stairs
// because maps.js only knows the way out of the three dungeons it authored.
//
// COORDINATE DISCIPLINE. Every warp obeys the pack contract: west x=1/land x=3,
// east x=w-2/land x=w-4, north y=1/land y=3, south y=h-2/land y=h-4, an exterior
// door on the base-course row of its own `building()` rect with the street one
// tile south of it, an interior exit at [floor(w/2), h-1]. The full table is §1
// and it is the only place those numbers are written down. §1 also records the
// one place this file departs from the charter's table — the Dragonspear spur,
// whose charter warp tile falls inside the castle's own broken curtain wall —
// and says why.
//
// GROUND IS PAINTED IN TWO PASSES, and it matters: `groundNoise` speckles ONE
// material's variants, and second materials go down as `patches()` blobs. Two
// materials chosen per tile at comparable weight is not ground, it is static.
//
// NOTHING HERE CALLS Math.random(). Every builder is handed an RNG forked from
// the world seed, so the same campaign rebuilds the same Daggerford for ever.

import { TileMap } from './tilemap.js';
import { tid } from './mapgen.js';
import {
  KEY, gset, dset, oset, floor, grect, drect, orect, floorRect, dframe, table, pickT, prop, scatter,
  groundNoise, patches, sealBorder, openDoorway, normalizeTriggers, reservedFor, reserve,
  clearStanding, sweepStanding, building, shell, room, fenceRect, bigOak, bigPine, seating,
  addSign, signpost, interiorMap as kitInteriorMap, finishInterior,
  curtain, keepTower, gateway, ruinShell, bend, carriageway, milestone,
  openThickets, connectRegions, packDungeon, siteMouth,
  stallRow, garden, wearPatches,
  innFloor, noticeBoard,
} from './mapkit.js';

// ---------------------------------------------------------------------------
// 0. THE PAINTING KIT lives in world/mapkit.js
// ---------------------------------------------------------------------------

/** Interiors on this road default to the Trade Way's region string. */
const interiorMap = (o) => kitInteriorMap({ region: 'trade-way', ...o });


// --- shared ground tables ---------------------------------------------------
//
// EVERY GROUND TABLE HERE IS ONE MATERIAL. The weights choose between cuts of
// the same stuff — four grasses, two paving stones, three states of a rutted
// track — so `groundNoise` reads as a surface. The moment a table mixes turf
// with gravel at comparable weight it stops being ground and becomes static;
// second materials go down through `patches()` instead. See the note there.

const T_GRASS = [['GRASS', 9], ['GRASS_2', 5], ['GRASS_3', 3], ['GRASS_4', 3], ['CLOVER', 2]];
const T_DOWNS = [['GRASS_4', 7], ['GRASS', 6], ['GRASS_2', 4], ['CLOVER', 2]];
const T_RUTS = [['DIRT_PATH', 9], ['DIRT', 4], ['MUD', 1]];
const T_STONEROAD = [['COBBLE', 8], ['FLAGSTONE', 3]];
const T_TOWNROAD = [['DIRT_PATH', 9], ['DIRT', 3]];
const T_WOOD = [['TREE_OAK', 8], ['BUSH', 4], ['GRASS_TALL', 3], ['STUMP', 1], ['ROCK', 2]];
const T_SCRUB = [['BUSH', 5], ['GRASS_TALL', 5], ['ROCK', 3], ['FLOWERS_YELLOW', 2], ['FLOWERS_BLUE', 1]];
const T_YARD = [['GRAVEL', 9], ['GRAVEL', 4]];
const T_STALL = [['CART', 5], ['CRATE', 5], ['SACK', 4], ['BARREL', 3], ['SHELF_GOODS', 2]];
const T_STRAND = [['SAND', 9], ['SAND', 4]];

// ---------------------------------------------------------------------------
// 1. THE CONNECTION TABLE
// ---------------------------------------------------------------------------
//
// One row per doorway, in the shape maps.js's own LINKS uses. Stepping on
// `aWarp` in A lands you at `bLand` in B facing `toB`, and the reverse; maps.js
// expands each row into two directed warps and stamps the triggers itself.
// `kind: 'road'` and `kind: 'cave'` open a three-tile mouth, `door` and `stairs`
// exactly one.
//
// A `bWarp: null` row is a procedural site: maps.js cannot stamp either end of
// it, so the surface mouth is stamped by the builder (`siteMouth`) and the way
// back up is rewritten by the site's own builder (`packDungeon`). There are
// three of them here: dragonspear-castle, rosymorn-cloister and nashkel-mines.
//
// ONE DEVIATION FROM THE CHARTER'S TABLE, recorded here as §6 invariant 5 asks.
// The charter gives the Dragonspear spur as fields-of-the-dead [70,16]->[68,16].
// [70,16] is the map's east border column, and the castle's broken curtain wall
// stands across x 60..70 — so the charter's warp tile is inside the ruin's own
// masonry, and walking off the edge of the world is the wrong way to enter a
// castle anyway. The mouth is the swept stair in the ruin's courtyard at
// [68,16] instead, which is where `siteMouth` stamps it and where the stair the
// player can actually see is drawn. The row below says so. Nothing else reads
// `aWarp` on a `bWarp: null` row — maps.js skips it for want of a destination —
// so this is a documentation fix, not a behaviour change.
//
// bg-rivington <-> coast-way-south is declared ONCE, in maps_baldursgate.js.
// Rivington is that pack's map; two rows would put two triggers on one tile.

export const REGION_LINKS = [
  // --- the Trade Way: Waterdeep to the Black Dragon Gate -------------------
  { a: 'waterdeep', aWarp: [30, 32], aLand: [30, 30], b: 'trade-way-north', bWarp: [30, 1], bLand: [30, 3], toB: 'down', toA: 'up', kind: 'road' },
  { a: 'trade-way-north', aWarp: [30, 78], aLand: [30, 76], b: 'daggerford', bWarp: [28, 1], bLand: [28, 3], toB: 'down', toA: 'up', kind: 'road' },
  { a: 'daggerford', aWarp: [28, 44], aLand: [28, 42], b: 'the-way-inn', bWarp: [22, 1], bLand: [22, 3], toB: 'down', toA: 'up', kind: 'road' },
  { a: 'the-way-inn', aWarp: [22, 32], aLand: [22, 30], b: 'trade-way-south', bWarp: [30, 1], bLand: [30, 3], toB: 'down', toA: 'up', kind: 'road' },
  { a: 'trade-way-south', aWarp: [30, 78], aLand: [30, 76], b: 'fields-of-the-dead', bWarp: [36, 1], bLand: [36, 3], toB: 'down', toA: 'up', kind: 'road' },
  { a: 'fields-of-the-dead', aWarp: [36, 54], aLand: [36, 52], b: 'coast-way-north', bWarp: [30, 1], bLand: [30, 3], toB: 'down', toA: 'up', kind: 'road' },
  { a: 'coast-way-north', aWarp: [30, 62], aLand: [30, 60], b: 'bg-blackgate', bWarp: [28, 1], bLand: [28, 3], toB: 'down', toA: 'up', kind: 'road' },

  // --- spurs off the road ---------------------------------------------------
  { a: 'fields-of-the-dead', aWarp: [68, 16], aLand: [68, 16], b: 'dragonspear-castle', bWarp: null, bLand: null, toB: 'down', toA: 'up', kind: 'cave' },
  { a: 'fields-of-the-dead', aWarp: [70, 40], aLand: [68, 40], b: 'rosymorn-monastery', bWarp: [1, 20], bLand: [3, 20], toB: 'right', toA: 'left', kind: 'road' },
  { a: 'rosymorn-monastery', aWarp: [24, 14], aLand: [24, 15], b: 'rosymorn-cloister', bWarp: null, bLand: null, toB: 'down', toA: 'up', kind: 'stairs' },
  { a: 'coast-way-north', aWarp: [1, 20], aLand: [3, 20], b: 'ulgoths-beard', bWarp: [42, 18], bLand: [40, 18], toB: 'left', toA: 'right', kind: 'road' },
  { a: 'ulgoths-beard', aWarp: [20, 16], aLand: [20, 17], b: 'ulgoths-beard-inn', bWarp: [11, 15], bLand: [11, 14], toB: 'up', toA: 'down', kind: 'door' },

  // --- Daggerford and the Way Inn ------------------------------------------
  { a: 'daggerford', aWarp: [16, 16], aLand: [16, 17], b: 'river-shining-tavern', bWarp: [12, 17], bLand: [12, 16], toB: 'up', toA: 'down', kind: 'door' },
  { a: 'daggerford', aWarp: [34, 20], aLand: [34, 21], b: 'happy-cow', bWarp: [10, 15], bLand: [10, 14], toB: 'up', toA: 'down', kind: 'door' },
  { a: 'daggerford', aWarp: [22, 30], aLand: [22, 31], b: 'morninglow-tower', bWarp: [10, 17], bLand: [10, 16], toB: 'up', toA: 'down', kind: 'door' },
  { a: 'daggerford', aWarp: [40, 30], aLand: [40, 31], b: 'daggerford-smithy', bWarp: [10, 13], bLand: [10, 12], toB: 'up', toA: 'down', kind: 'door' },
  { a: 'the-way-inn', aWarp: [22, 16], aLand: [22, 17], b: 'way-inn-common', bWarp: [13, 19], bLand: [13, 18], toB: 'up', toA: 'down', kind: 'door' },

  // --- the Coast Way south of the city -------------------------------------
  { a: 'coast-way-south', aWarp: [30, 78], aLand: [30, 76], b: 'friendly-arm-inn', bWarp: [22, 1], bLand: [22, 3], toB: 'down', toA: 'up', kind: 'road' },
  { a: 'friendly-arm-inn', aWarp: [22, 34], aLand: [22, 32], b: 'beregost', bWarp: [30, 1], bLand: [30, 3], toB: 'down', toA: 'up', kind: 'road' },
  { a: 'beregost', aWarp: [30, 46], aLand: [30, 44], b: 'nashkel', bWarp: [24, 1], bLand: [24, 3], toB: 'down', toA: 'up', kind: 'road' },
  { a: 'beregost', aWarp: [1, 24], aLand: [3, 24], b: 'candlekeep-approach', bWarp: [50, 22], bLand: [48, 22], toB: 'left', toA: 'right', kind: 'road' },
  { a: 'beregost', aWarp: [58, 20], aLand: [56, 20], b: 'high-hedge', bWarp: [1, 15], bLand: [3, 15], toB: 'right', toA: 'left', kind: 'road' },

  // --- southern interiors ---------------------------------------------------
  { a: 'friendly-arm-inn', aWarp: [20, 16], aLand: [20, 17], b: 'friendly-arm-common', bWarp: [13, 19], bLand: [13, 18], toB: 'up', toA: 'down', kind: 'door' },
  { a: 'friendly-arm-inn', aWarp: [30, 16], aLand: [30, 17], b: 'garl-shrine', bWarp: [9, 13], bLand: [9, 12], toB: 'up', toA: 'down', kind: 'door' },
  { a: 'beregost', aWarp: [16, 14], aLand: [16, 15], b: 'feldeposts-inn', bWarp: [11, 17], bLand: [11, 16], toB: 'up', toA: 'down', kind: 'door' },
  { a: 'beregost', aWarp: [40, 14], aLand: [40, 15], b: 'jovial-juggler', bWarp: [11, 17], bLand: [11, 16], toB: 'up', toA: 'down', kind: 'door' },
  { a: 'beregost', aWarp: [16, 32], aLand: [16, 33], b: 'burning-wizard', bWarp: [10, 15], bLand: [10, 14], toB: 'up', toA: 'down', kind: 'door' },
  { a: 'beregost', aWarp: [44, 32], aLand: [44, 33], b: 'song-of-the-morning', bWarp: [13, 21], bLand: [13, 20], toB: 'up', toA: 'down', kind: 'door' },
  { a: 'beregost', aWarp: [26, 24], aLand: [26, 25], b: 'thunderhammer-smithy', bWarp: [10, 15], bLand: [10, 14], toB: 'up', toA: 'down', kind: 'door' },
  { a: 'candlekeep-approach', aWarp: [26, 20], aLand: [26, 21], b: 'candlekeep-gatehouse', bWarp: [13, 19], bLand: [13, 18], toB: 'up', toA: 'down', kind: 'door' },
  { a: 'nashkel', aWarp: [20, 18], aLand: [20, 19], b: 'nashkel-inn', bWarp: [11, 17], bLand: [11, 16], toB: 'up', toA: 'down', kind: 'door' },
  { a: 'nashkel', aWarp: [38, 30], aLand: [38, 31], b: 'nashkel-mines', bWarp: null, bLand: null, toB: 'down', toA: 'up', kind: 'cave' },
];

// ---------------------------------------------------------------------------
// 2. THE TRADE WAY
// ---------------------------------------------------------------------------
//
// Four legs of one road, and they are meant to be told apart at a glance.
// Waterdeep Reach is ploughed and patrolled; Fields Reach is where the ploughing
// stops and the Trollbark starts; Chionthar Reach is the queue for a city gate;
// Beregost Reach is bandit country with a Bhaalist altar in a hollow off it.
//
// The carriageway wanders. `bend()` tapers to nothing at both ends so the ruts
// still arrive dead on the warp column, but in between the road goes round
// things, which is the difference between a road and a corridor.

/** The frame every leg of the road shares: turf, ruts, verges, roadside wood. */
function openRoad(map, root, o) {
  const rg = root.fork('ground');
  const rt = root.fork('trees');
  const res = o.res;
  const grass = table(o.grass || T_GRASS);
  const ruts = table(o.ruts || T_RUTS);
  const wood = table(o.wood || T_WOOD);
  const verge = table(o.verge || [['GRASS_TALL', 6], ['GRASS_2', 4], ['CLOVER', 2]]);

  groundNoise(map, rg, 0, 0, map.w, map.h, grass);

  // Roadside cover, thicker the further you get from the ruts. Trees go down
  // BEFORE the road so `floor()` can sweep the carriageway clear of them.
  for (let y = 0; y < map.h; y++) {
    const cx = o.spine(y);
    for (let x = 0; x < map.w; x++) {
      const d = Math.abs(x - cx);
      const base = d < 5 ? 0 : Math.min(o.cover != null ? o.cover : 0.42, (d - 4) * 0.045);
      if (!rt.chance(base * (o.densityAt ? o.densityAt(x, y) : 1))) continue;
      prop(map, x, y, pickT(rt, wood), res);
    }
  }
  // Tall grass in the near verges — where the encounter rolls happen.
  for (let y = 0; y < map.h; y++) {
    const cx = o.spine(y);
    for (let x = 0; x < map.w; x++) {
      if (map.deco[y * map.w + x]) continue;
      const d = Math.abs(x - cx);
      if (d < 3 || d > 11) continue;
      if (rg.chance(0.15)) gset(map, x, y, pickT(rg, verge));
    }
  }
  // Full-height oaks where the canopy closes over the verge. A wood of nothing
  // but one-tile trees reads as wallpaper; two or three of these per screen is
  // what gives it a top and a bottom.
  for (const [px, py] of o.oaks || []) {
    if (Math.abs(px - o.spine(py)) > 5) bigOak(map, px, py);
  }
  carriageway(map, rg, o.spine, 1, map.h - 2, o.wide != null ? o.wide : 2, ruts, verge);
  // Vegetation is the only solid thing on the map at this point, so this can
  // only ever open a way through a thicket — never through a wall.
  openThickets(map, { x: o.spine(3), y: 3 }, 5);
  return { rg, rt, ruts, grass };
}

/** A brook running the width of the map, with the road bridged over it. */
function brook(map, r, y0, spine, res, stone) {
  for (let x = 0; x < map.w; x++) {
    const wy = y0 + Math.round(Math.sin(x * 0.19) * 1.4);
    floor(map, x, wy, tid('WATER', 'MUD'));
    floor(map, x, wy + 1, tid('WATER', 'MUD'));
    if (r.chance(0.3)) prop(map, x, wy - 1, tid('REEDS', 'BUSH'), res);
    if (r.chance(0.24)) prop(map, x, wy + 2, tid('CATTAILS', 'REEDS'), res);
  }
  for (let y = y0 - 3; y <= y0 + 4; y++) {
    const cx = spine(y);
    for (let d = -2; d <= 2; d++) floor(map, cx + d, y, tid(stone ? 'BRIDGE_STONE' : 'BRIDGE_WOOD', 'DIRT_PATH'));
    prop(map, cx - 3, y, tid('FENCE_V', 'STONE_FENCE'), res);
    prop(map, cx + 3, y, tid('FENCE_V', 'STONE_FENCE'), res);
  }
  return map;
}

// --- 1. The Trade Way, Waterdeep Reach --------------------------------------
function buildTradeWayNorth(root) {
  const map = new TileMap({
    w: 60, h: 80, id: 'trade-way-north', name: 'The Trade Way — Waterdeep Reach',
    biome: 'road', indoor: false, music: 'road',
    encounterRate: 0.05, encounterTable: 'high-road-highwaymen', region: 'trade-way',
  });
  const { npcs, res } = reserve('trade-way-north');
  const spine = (y) => 30 + bend(y, 80, 4, 0.085);
  // The Ardeep's eaves stand well back on the west and crowd the east verge.
  const { rg } = openRoad(map, root, {
    res, spine, cover: 0.46,
    densityAt: (x, y) => (x > 38 && y > 8 && y < 58 ? 1.35 : (y > 62 ? 0.9 : 0.45)),
    oaks: [[44, 6], [52, 14], [46, 44], [54, 52], [44, 58], [50, 64], [40, 72], [8, 60], [14, 68], [6, 44], [12, 22], [4, 8]],
  });
  const rd = root.fork('detail');

  // --- the last of Waterdeep's farmland, west of the road ------------------
  // Three fields off one headland lane, and the lane meets the carriageway at
  // both ends. A gate that opens onto standing scrub is a gate nobody can use.
  for (let y = 4; y <= 36; y++) { floor(map, 20, y, tid('DIRT_PATH', 'DIRT')); floor(map, 21, y, tid('DIRT', 'DIRT_PATH')); }
  for (const ly of [4, 36]) for (let x = 20; x <= spine(ly) - 3; x++) floor(map, x, ly, tid('DIRT_PATH', 'DIRT'));
  for (const [fy, fh] of [[6, 7], [16, 7], [26, 7]]) {
    floorRect(map, 5, fy, 13, fh, tid('FARMLAND', 'DIRT'));
    for (let y = fy; y < fy + fh; y++) {
      for (let x = 5; x < 18; x++) gset(map, x, y, tid(rg.chance(0.62) ? 'CROP_WHEAT' : 'CROP_CABBAGE', 'FARMLAND'));
    }
    fenceRect(map, 4, fy - 1, 15, fh + 2, { x: 18, y: fy + 2 }, res);
    for (let x = 18; x <= 20; x++) floor(map, x, fy + 2, tid('DIRT', 'DIRT_PATH'));
  }
  building(map, {
    x: 23, y: 7, w: 7, h: 5, wall: 'LOG_WALL', roof: 'thatch', base: 'DIRT',
    roofRows: 2, shutters: [1, 5], loading: [2, 3], chimney: 5, approach: 1,
  }, res);                                       // a tithe barn, doors on the road side
  prop(map, 22, 11, tid('CART', 'CRATE'), res);
  prop(map, 30, 11, tid('SACK', 'CRATE'), res);
  prop(map, 24, 13, tid('SACK', 'CRATE'), res);
  bigOak(map, 22, 20); bigOak(map, 23, 31);

  // --- the Lords' Alliance patrol post, east of the road -------------------
  floorRect(map, 37, 24, 13, 11, tid('GRAVEL', 'DIRT'));
  curtain(map, 37, 24, 13, 11, { key: 'PALISADE', post: 'TIMBER_SUPPORT', base: 'GRAVEL', res });
  for (let y = 24; y <= 26; y++) floor(map, 38, y, tid('GRAVEL', 'DIRT'));
  for (let x = 33; x <= 38; x++) floor(map, x, 25, tid('DIRT_PATH', 'DIRT'));   // the spur in
  building(map, { x: 39, y: 27, w: 7, h: 5, wall: 'LOG_WALL', roof: 'shingle', base: 'GRAVEL', roofRows: 2, windows: [1, 5], sign: 3, chimney: 5, approach: 1 }, res);
  prop(map, 47, 28, tid('BRAZIER', 'TORCH'), res);
  prop(map, 47, 32, tid('CRATE', 'BARREL'), res);
  prop(map, 39, 33, tid('BARREL', 'CRATE'), res);
  prop(map, 42, 33, tid('CART', 'CRATE'), res);
  prop(map, 44, 33, tid('COOKING_POT', 'BARREL'), res);
  prop(map, 45, 26, tid('TORCH', 'BRAZIER'), res);
  signpost(map, 40, 33, 'A Lords’ Alliance post: eight riders, four horses and a fire that has not gone out in nine years. They ride as far south as the Way Inn and no further.', res);

  // --- the brook and its bridge --------------------------------------------
  brook(map, rd, 42, spine, res, true);

  // --- the abandoned toll house --------------------------------------------
  // The Dukes of Daggerford kept it until the Trollbark trade dried up.
  const tx = 13, ty = 50;
  ruinShell(map, rd, tx, ty, 11, 8, {
    pillars: [[tx, ty], [tx + 10, ty], [tx, ty + 7]],
    gaps: [[tx + 5, ty + 7], [tx + 10, ty + 3], [tx + 10, ty + 4], [tx + 2, ty]],
    mess: 0.2,
  }, res);
  floor(map, tx + 5, ty + 7, tid('FLAGSTONE', 'GRAVEL'));         // the doorway
  for (let x = tx + 5; x <= 28; x++) floor(map, x, ty + 8, tid('DIRT_PATH', 'DIRT'));
  prop(map, tx + 5, ty + 3, tid('CHEST_OPEN', 'CRATE'), res);
  prop(map, tx - 1, ty + 8, tid('TIMBER_SUPPORT', 'STUMP'), res);  // the snapped barrier
  prop(map, tx + 11, ty + 8, tid('TIMBER_SUPPORT', 'STUMP'), res);
  signpost(map, 26, 58, 'THE DAGGERFORD TOLL — 2 cp the wheel, 1 cp the beast. The board is split, the gate is gone, and grass is growing through the strongbox.', res);

  // --- the hanging tree ----------------------------------------------------
  // Every long road has one. The Fist do not come this far north; the Duchess’s
  // riders do, and they do not carry prisoners home.
  prop(map, 23, 64, tid('DEAD_TREE', 'TREE_OAK'), res);
  prop(map, 23, 65, tid('BONES', 'RUBBLE'), res);
  prop(map, 22, 66, tid('GRAVESTONE', 'ROCK'), res);
  prop(map, 24, 66, tid('GRAVESTONE', 'ROCK'), res);
  signpost(map, 25, 65, 'A dead oak with three ropes on it and nothing in them. Somebody has cut the bodies down and buried them, which is more than the law asked.', res);

  // --- milestones ----------------------------------------------------------
  milestone(map, 34, 6, 'THE TRADE WAY — Waterdeep, one mile north. Daggerford, twenty-eight south. Past that the road belongs to whoever is standing on it.', res);
  milestone(map, 25, 32, 'A weathered milestone: DAGGERFORD XVIII. Somebody has scratched a Zhentarim arrow under the numeral and somebody else has chiselled it out.', res);
  milestone(map, 35, 70, 'DAGGERFORD III. The ruts are deeper here; every wagon out of the Duchy comes this way.', res);

  scatter(map, rd, 1, 1, 12, 78, table(T_SCRUB), 0.07, res);
  scatter(map, rd, 48, 1, 11, 78, table(T_SCRUB), 0.08, res);

  openThickets(map, { x: spine(3), y: 3 }, 5, res);
  map.recomputeFlags({ keep: 0 });
  sealBorder(map, tid('TREE_OAK', 'BLACK'));
  sweepStanding(map, npcs);
  map.spawn = { x: 30, y: 3 };
  map.entry = { ...map.spawn };
  map.level = 8;
  map.addTrigger({
    id: 'trade-way-north-verges', kind: 'encounter-zone', x: 1, y: 8, w: 58, h: 70,
    data: { table: 'high-road-highwaymen', rate: 0.05, biome: 'road' },
  });
  return map;
}

// --- 2. The Trade Way, Fields Reach -----------------------------------------
function buildTradeWaySouth(root) {
  const map = new TileMap({
    w: 60, h: 80, id: 'trade-way-south', name: 'The Trade Way — Fields Reach',
    biome: 'road', indoor: false, music: 'road',
    encounterRate: 0.062, encounterTable: 'ogre-shakedown', region: 'trade-way',
  });
  const { npcs, res } = reserve('trade-way-south');
  const spine = (y) => 30 + bend(y, 80, 5, 0.07, 1.2);
  openRoad(map, root, {
    res, spine, cover: 0.5,
    grass: [['GRASS_4', 7], ['GRASS', 6], ['GRASS_2', 5], ['CLOVER', 1]],
    wood: [['TREE_OAK', 7], ['DEAD_TREE', 3], ['BUSH', 4], ['STUMP', 2], ['BOULDER', 2], ['ROCK', 2]],
    densityAt: (x) => (x > 34 ? 1.4 : 0.6),
    oaks: [[41, 12], [47, 21], [52, 31], [45, 41], [50, 51], [43, 61], [49, 69], [10, 16], [6, 40], [12, 56], [8, 70]],
  });
  const rd = root.fork('detail');

  // --- the Trollbark's northern edge, crowding the east verge --------------
  scatter(map, rd, 36, 4, 23, 72, table([['TREE_OAK', 6], ['DEAD_TREE', 4], ['BUSH', 3], ['MUSHROOM_BROWN', 1], ['BONES', 1]]), 0.16, res);
  signpost(map, 36, 24, 'TROLLBARK FOREST — the Duchess of Daggerford’s writ ends at the tree line. Fire your torches at dusk and do not sleep under the eaves.', res);

  // --- the overturned Zhentarim wagon --------------------------------------
  // Black and silver, four oxen gone, and the crates opened from the outside.
  const wx = 22, wy = 30;
  floorRect(map, wx - 2, wy - 2, 9, 7, tid('DIRT', 'DIRT_PATH'));
  for (let y = wy - 2; y <= wy + 4; y++) for (let x = wx - 2; x <= wx + 6; x++) if (rd.chance(0.3)) gset(map, x, y, tid('MUD', 'DIRT'));
  prop(map, wx, wy, tid('CART', 'CRATE'), res);
  prop(map, wx + 1, wy + 1, tid('CRATE', 'BARREL'), res);
  prop(map, wx + 3, wy, tid('CRATE', 'BARREL'), res);
  prop(map, wx + 2, wy + 3, tid('BARREL', 'CRATE'), res);
  prop(map, wx - 1, wy + 2, tid('SACK', 'CRATE'), res);
  prop(map, wx + 4, wy + 3, tid('BONES', 'RUBBLE'), res);
  prop(map, wx - 2, wy - 1, tid('BONES', 'RUBBLE'), res);
  signpost(map, wx + 5, wy + 1, 'A wagon on its side, black-painted, a silver device on the tailgate. The oxen are gone and the crates were opened from outside. The strongbox is bolted through the bed, and empty.', res);

  // --- the ogres' toll -----------------------------------------------------
  // Two boulders rolled across the verge, a fire pit, and a great many bones.
  floorRect(map, 34, 48, 8, 7, tid('DIRT', 'GRAVEL'));
  prop(map, 35, 49, tid('BOULDER', 'ROCK'), res);
  prop(map, 40, 50, tid('BOULDER', 'ROCK'), res);
  prop(map, 37, 51, tid('BRAZIER', 'TORCH'), res);
  prop(map, 36, 53, tid('BONES', 'RUBBLE'), res);
  prop(map, 39, 53, tid('SKULL_PILE', 'BONES'), res);
  prop(map, 38, 48, tid('CRATE', 'BARREL'), res);
  map.addTrigger({
    id: 'trade-way-ogres', kind: 'battle', x: 32, y: 49, w: 3, h: 4,
    once: true, data: { group: 'ogre-shakedown', ambush: true, level: 10, flag: 'trade-way-ogres-done' },
  });

  // --- the ford ------------------------------------------------------------
  brook(map, rd, 62, spine, res, false);

  milestone(map, 24, 8, 'THE TRADE WAY — the Way Inn one mile behind you. Baldur’s Gate ninety ahead, and nothing between but the Fields of the Dead.', res);
  milestone(map, 36, 71, 'A leaning stone: THE FIELDS OF THE DEAD BEGIN HERE. Under the lettering somebody has cut a second line — AND THEY DO NOT END.', res);

  scatter(map, rd, 1, 1, 14, 78, table(T_SCRUB), 0.07, res);

  openThickets(map, { x: spine(3), y: 3 }, 5, res);
  map.recomputeFlags({ keep: 0 });
  sealBorder(map, tid('TREE_OAK', 'BLACK'));
  sweepStanding(map, npcs);
  map.spawn = { x: 30, y: 3 };
  map.entry = { ...map.spawn };
  map.level = 10;
  map.addTrigger({
    id: 'trade-way-south-verges', kind: 'encounter-zone', x: 1, y: 6, w: 58, h: 72,
    data: { table: 'ogre-shakedown', rate: 0.06, biome: 'road' },
  });
  return map;
}

// --- 3. The Coast Way, Chionthar Reach ---------------------------------------
function buildCoastWayNorth(root) {
  const map = new TileMap({
    w: 60, h: 64, id: 'coast-way-north', name: 'The Coast Way — Chionthar Reach',
    biome: 'road', indoor: false, music: 'road',
    encounterRate: 0.05, encounterTable: 'zhentarim-strongarms', region: 'coast-way',
  });
  const { npcs, res } = reserve('coast-way-north');
  const spine = (y) => 30 + bend(y, 64, 3, 0.1);
  const { rg } = openRoad(map, root, {
    res, spine, cover: 0.3,
    ruts: T_TOWNROAD,
    densityAt: (x, y) => (y < 26 ? 1 : 0.35),
    oaks: [[10, 6], [18, 12], [46, 8], [52, 16], [6, 26], [50, 44], [54, 54], [8, 34]],
  });
  const rd = root.fork('detail');

  // The road broadens as it nears the city: two lanes of ruts on the last mile.
  for (let y = 40; y <= 62; y++) {
    const cx = spine(y);
    for (let d = -3; d <= 3; d++) floor(map, cx + d, y, pickT(rg, table(T_TOWNROAD)));
  }

  // --- the cart track west to Ulgoth's Beard -------------------------------
  for (let y = 19; y <= 21; y++) for (let x = 1; x <= spine(20) + 1; x++) floor(map, x, y, pickT(rg, table(T_RUTS)));
  signpost(map, 26, 18, 'WEST: ULGOTH’S BEARD — two hours by the cart track. Boats to the isles, and no boats back before the tide.', res);

  // --- the Flaming Fist forward post ---------------------------------------
  floorRect(map, 38, 30, 12, 9, tid('GRAVEL', 'DIRT'));
  curtain(map, 38, 30, 12, 9, { key: 'PALISADE', post: 'TIMBER_SUPPORT', base: 'GRAVEL', res });
  for (let y = 30; y <= 32; y++) floor(map, 39, y, tid('GRAVEL', 'DIRT'));
  for (let x = 35; x <= 39; x++) floor(map, x, 31, tid('DIRT_PATH', 'DIRT'));
  building(map, { x: 40, y: 33, w: 7, h: 5, wall: 'LOG_WALL', roof: 'shingle', base: 'GRAVEL', roofRows: 2, windows: [1, 5], sign: 3, chimney: 1, approach: 1 }, res);
  prop(map, 48, 34, tid('BRAZIER', 'TORCH'), res);
  prop(map, 39, 37, tid('CRATE', 'BARREL'), res);
  prop(map, 48, 31, tid('TORCH', 'BRAZIER'), res);
  signpost(map, 41, 38, 'A Flaming Fist forward post. The banner is new, the palisade is not, and the sergeant on the gate takes your name whether you give it or not.', res);

  // --- the refugee camp on the last mile -----------------------------------
  // Rivington will not take them and the Outer City has no room, so they wait
  // here, three miles short of a wall that will not open for them.
  floorRect(map, 10, 42, 15, 18, tid('DIRT', 'MUD'));
  patches(map, rd, 10, 42, 15, 18, table([['MUD', 8], ['MUD', 3]]), 9, 6, 20);
  patches(map, rd, 10, 42, 15, 18, table([['GRASS_4', 4], ['GRASS', 2]]), 4, 3, 8);
  for (const [cx, cy] of [[15, 44], [19, 50], [13, 54], [20, 57], [11, 47]]) {
    prop(map, cx, cy + 1, tid('SACK', 'CRATE'), res);
    prop(map, cx + 2, cy + 1, tid('BARREL', 'CRATE'), res);
    prop(map, cx + 1, cy + 2, tid('BRAZIER', 'TORCH'), res);
    orect(map, cx, cy, 3, 1, tid('THATCH_M', 'SHINGLE_ROOF'));
    drect(map, cx, cy, 3, 1, tid('THATCH_M', 'SHINGLE_ROOF'));
  }
  signpost(map, 25, 52, 'A camp of two hundred, three miles short of a gate that will not open. Tiefling, Turami, Chondathan — Elturel’s survivors and Rivington’s overflow both.', res);

  // --- the city on the horizon ---------------------------------------------
  milestone(map, 34, 8, 'THE COAST WAY — you are on the Trade Way still; the name changes at the Chionthar. BALDUR’S GATE XV.', res);
  milestone(map, 26, 34, 'BALDUR’S GATE VIII. From the crest of this rise you can see the smoke of it — a grey smear the width of the horizon, and under it the Old Wall.', res);
  milestone(map, 35, 58, 'BALDUR’S GATE I. Ahead the road stops being a road and becomes the Outer City: ox pens, caravan yards, and the Black Dragon Gate at the end of them.', res);

  scatter(map, rd, 1, 1, 8, 62, table(T_SCRUB), 0.09, res);
  scatter(map, rd, 51, 1, 8, 62, table(T_SCRUB), 0.09, res);

  openThickets(map, { x: spine(3), y: 3 }, 5, res);
  map.recomputeFlags({ keep: 0 });
  sealBorder(map, tid('TREE_OAK', 'BLACK'));
  sweepStanding(map, npcs);
  map.spawn = { x: 30, y: 3 };
  map.entry = { ...map.spawn };
  map.level = 11;
  map.addTrigger({
    id: 'coast-way-north-verges', kind: 'encounter-zone', x: 1, y: 4, w: 58, h: 34,
    data: { table: 'zhentarim-strongarms', rate: 0.05, biome: 'road' },
  });
  return map;
}

// --- 4. The Coast Way, Beregost Reach ---------------------------------------
function buildCoastWaySouth(root) {
  const map = new TileMap({
    w: 60, h: 80, id: 'coast-way-south', name: 'The Coast Way — Beregost Reach',
    biome: 'road', indoor: false, music: 'road',
    encounterRate: 0.065, encounterTable: 'ankheg-field', region: 'coast-way',
  });
  const { npcs, res } = reserve('coast-way-south');
  const spine = (y) => 30 + bend(y, 80, 4, 0.06, 2.4);
  const { rg } = openRoad(map, root, {
    res, spine, cover: 0.34,
    grass: [['GRASS', 8], ['GRASS_4', 6], ['GRASS_2', 5], ['CLOVER', 2]],
    densityAt: (x, y) => (y < 20 ? 0.7 : y > 56 ? 1.2 : 0.35),
    oaks: [[8, 6], [48, 10], [52, 22], [46, 34], [8, 62], [16, 70], [50, 66], [44, 74], [54, 44]],
  });
  const rd = root.fork('detail');

  // --- the ankheg fields ---------------------------------------------------
  // Good black soil, ploughed and then abandoned. The holes are what is left of
  // the farms: a full-grown ankheg comes up under the plough team, not the plough.
  floorRect(map, 6, 24, 19, 20, tid('FARMLAND', 'DIRT'));
  for (let y = 24; y < 44; y++) {
    for (let x = 6; x < 25; x++) {
      if (rg.chance(0.35)) gset(map, x, y, tid('DIRT', 'FARMLAND'));
      else if (rg.chance(0.12)) gset(map, x, y, tid('CROP_WHEAT', 'FARMLAND'));
    }
  }
  for (const [hx, hy] of [[10, 28], [17, 26], [21, 33], [13, 37], [8, 40], [23, 41], [15, 31]]) {
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) gset(map, hx + dx, hy + dy, tid('MUD', 'DIRT'));
    floor(map, hx, hy, tid('PIT', 'MUD'));
    prop(map, hx + 1, hy + 1, tid('BONES', 'RUBBLE'), res);
  }
  shell(map, { x: 16, y: 18, w: 8, h: 6, wall: 'WATTLE_WALL', roof: 'thatch', roofRows: 3, door: 3, windows: [1, 6], roofPatch: [[2, 1], [5, 2], [3, 2]], patchTile: 'THATCH_M' }, res);
  prop(map, 15, 24, tid('CART', 'CRATE'), res);
  prop(map, 25, 24, tid('STUMP', 'ROCK'), res);
  signpost(map, 26, 32, 'A farmstead with its door boarded from the outside and its fields full of holes a man could stand up in. The ankhegs came the year the refugees did, and only one of them left.', res);

  // --- the Bhaalist shrine in the hollow -----------------------------------
  // Four years on from the Absolute and the Dead Three still keep a chapel
  // within a day of Baldur's Gate. Nobody has burned it; nobody dares.
  const bx = 42, by = 54;
  ruinShell(map, rd, bx - 4, by - 4, 11, 10, {
    apron: 'DIRT', mess: 0.1,
    pillars: [[bx - 4, by - 4], [bx + 6, by - 4]],
    gaps: [[bx + 1, by + 5], [bx - 4, by], [bx + 6, by + 1]],
    rubble: [['RUBBLE', 5], ['BONES', 3], ['ROCK', 3]],
  }, res);
  floor(map, bx + 1, by + 5, tid('FLAGSTONE', 'DIRT'));
  for (let y = by + 6; y <= by + 8; y++) floor(map, bx + 1, y, tid('DIRT_PATH', 'DIRT'));
  for (let x = spine(by + 8); x <= bx + 1; x++) floor(map, x, by + 8, tid('DIRT_PATH', 'DIRT'));
  prop(map, bx + 1, by - 2, tid('ALTAR', 'SHRINE'), res);
  prop(map, bx, by - 2, tid('CANDLE', 'TORCH'), res);
  prop(map, bx + 2, by - 2, tid('CANDLE', 'TORCH'), res);
  prop(map, bx - 2, by, tid('SKULL_PILE', 'BONES'), res);
  prop(map, bx + 4, by, tid('SKULL_PILE', 'BONES'), res);
  prop(map, bx - 2, by + 3, tid('BONES', 'RUBBLE'), res);
  prop(map, bx + 4, by + 3, tid('BONES', 'RUBBLE'), res);
  prop(map, bx - 3, by - 3, tid('PILLAR', 'RUBBLE'), res);
  prop(map, bx + 5, by - 3, tid('PILLAR', 'RUBBLE'), res);
  prop(map, bx - 5, by + 5, tid('DEAD_TREE', 'STUMP'), res);
  signpost(map, bx + 3, by + 5, 'A roofless chapel in a hollow off the road. The altar is scrubbed clean, which is worse than if it were not, and the candles were lit within the day.', res);
  map.addTrigger({ id: 'coast-way-bhaal-shrine', kind: 'script', x: bx + 1, y: by - 1, data: { kind: 'bhaal-shrine', flag: 'coast-way-bhaal-seen' } });

  // --- the bandits' cut ----------------------------------------------------
  floorRect(map, 35, 12, 7, 6, tid('DIRT', 'GRAVEL'));
  prop(map, 36, 13, tid('BOULDER', 'ROCK'), res);
  prop(map, 40, 15, tid('BOULDER', 'ROCK'), res);
  prop(map, 38, 16, tid('CRATE', 'BARREL'), res);
  prop(map, 37, 17, tid('COOKING_POT', 'BARREL'), res);
  map.addTrigger({
    id: 'coast-way-bandits', kind: 'battle', x: 32, y: 13, w: 3, h: 4,
    once: true, data: { group: 'high-road-highwaymen', ambush: true, level: 12, flag: 'coast-way-bandits-done' },
  });

  milestone(map, 25, 6, 'THE COAST WAY — Rivington and Wyrm’s Crossing behind you. FRIENDLY ARM XX. BEREGOST XXXV. CANDLEKEEP, if they let you in.', res);
  milestone(map, 35, 47, 'A milestone with the numeral chiselled off and a hand carved into the blank. The hand is open, palm out, and the fingers are wrong.', res);
  milestone(map, 25, 72, 'FRIENDLY ARM — one mile. Under it, in a cleaner hand: THE GATE IS OPEN, THE ALE IS COLD, AND BENTLEY LOCKS UP AT MIDNIGHT.', res);

  scatter(map, rd, 46, 1, 13, 78, table(T_SCRUB), 0.08, res);
  scatter(map, rd, 1, 46, 12, 32, table(T_SCRUB), 0.09, res);

  openThickets(map, { x: spine(3), y: 3 }, 5, res);
  map.recomputeFlags({ keep: 0 });
  sealBorder(map, tid('TREE_OAK', 'BLACK'));
  sweepStanding(map, npcs);
  map.spawn = { x: 30, y: 3 };
  map.entry = { ...map.spawn };
  map.level = 12;
  map.addTrigger({
    id: 'coast-way-south-fields', kind: 'encounter-zone', x: 1, y: 20, w: 58, h: 58,
    data: { table: 'ankheg-field', rate: 0.065, biome: 'plains' },
  });
  return map;
}

// ---------------------------------------------------------------------------
// 3. DAGGERFORD
// ---------------------------------------------------------------------------
//
// A walled town of six hundred on the east bank of the Delimbiyr, under Duchess
// Morwen Daggerford. Nothing here is Phandalin: Phandalin is a scatter of houses
// round a crossroads and this is a CIRCUIT — a stone curtain wall with two
// gates, a castle on its own bailey in the north-east corner, and a street plan
// that exists because the wall forced one. The river runs down the west side
// outside the wall, with the ferry hard against it and the Misty Forest's eaves
// on the far bank.
//
//   x:  0    6  9              20        30        40      47   55
//  y 1   |riv|      the Trade Way from the north, farmland either side
//    7   ============= NORTH WALL, gate at x 27-29 =====================
//   11        [ River Shining Tavern ]              [    CASTLE     ]
//   16                                   [Happy Cow]  [   bailey    ]
//   22   ------------------- the cross street -----------------------
//   26            [ Morninglow Tower ]        [ market ] [ smithy ]
//   30                                                   (door 40,30)
//   39   ============= SOUTH WALL, gate at x 27-29 =====================
//   45        the Coast Way on to the Way Inn

function buildDaggerford(root) {
  const map = new TileMap({
    w: 56, h: 46, id: 'daggerford', name: 'Daggerford', biome: 'city',
    indoor: false, music: 'town', safe: true, encounterRate: 0, region: 'daggerford',
  });
  const { npcs, res } = reserve('daggerford');
  const rg = root.fork('ground');
  const rd = root.fork('detail');
  const grass = table(T_GRASS);
  const road = table(T_TOWNROAD);
  const cob = table(T_STONEROAD);

  // --- 1. the ground and the Delimbiyr -------------------------------------
  groundNoise(map, rg, 0, 0, 56, 46, grass);
  for (let y = 0; y < 46; y++) {
    for (let x = 1; x <= 3; x++) gset(map, x, y, tid('WATER_DEEP', 'WATER'));
    for (let x = 4; x <= 6; x++) gset(map, x, y, tid('WATER', 'WATER_DEEP'));
    for (let x = 7; x <= 8; x++) gset(map, x, y, pickT(rg, table(T_STRAND)));
    if (rg.chance(0.4)) prop(map, 7, y, tid('REEDS', 'BUSH'), res);
    if (rg.chance(0.2)) prop(map, 8, y, tid('CATTAILS', 'REEDS'), res);
  }
  // the ferry stage and the boat sheds outside the water gate
  floorRect(map, 7, 24, 3, 8, tid('BRIDGE_WOOD', 'WOOD_FLOOR_H'));
  prop(map, 7, 23, tid('DRIFTWOOD', 'ROCK'), res);
  prop(map, 9, 32, tid('BARREL', 'CRATE'), res);
  prop(map, 9, 24, tid('CRATE', 'BARREL'), res);
  prop(map, 8, 33, tid('DRIFTWOOD', 'ROCK'), res);

  // --- 2. the Trade Way in and out -----------------------------------------
  for (let y = 1; y <= 45; y++) for (let x = 26; x <= 30; x++) floor(map, x, y, pickT(rg, road));
  // farmland outside the walls, north and south
  for (const [fx, fy, fw, fh] of [[12, 2, 12, 4], [34, 2, 14, 4], [12, 41, 12, 4], [34, 41, 14, 4]]) {
    floorRect(map, fx, fy, fw, fh, tid('FARMLAND', 'DIRT'));
    for (let y = fy; y < fy + fh; y++) for (let x = fx; x < fx + fw; x++) gset(map, x, y, tid(rg.chance(0.6) ? 'CROP_WHEAT' : 'CROP_CABBAGE', 'FARMLAND'));
  }

  // --- 3. the curtain wall -------------------------------------------------
  // Two gates and a water gate, and the wall is three courses deep where you
  // look at its face — the whole reason the town reads as a circuit.
  curtain(map, 9, 7, 39, 33, { key: 'STONE_WALL', base: 'GRAVEL', res });
  gateway(map, 28, 7, 9, tid('COBBLE', 'FLAGSTONE'), { half: 1, gateRow: 8, torchRow: 9 });
  gateway(map, 28, 38, 39, tid('COBBLE', 'FLAGSTONE'), { half: 1, gateRow: 39, torchRow: 38 });
  for (let y = 27; y <= 29; y++) floor(map, 9, y, pickT(rg, cob));           // the water gate
  dset(map, 9, 28, tid('GATE', 'DOOR_OPEN'));
  dset(map, 9, 26, tid('PILLAR', 'STONE_WALL'));
  dset(map, 9, 30, tid('PILLAR', 'STONE_WALL'));
  for (let x = 7; x <= 12; x++) floor(map, x, 28, pickT(rg, cob));

  // --- 4. the streets ------------------------------------------------------
  // Streets first, buildings second: a house that overlaps a street simply
  // stands on it, and every door's front tile is street by construction.
  for (let y = 10; y <= 38; y++) for (let x = 26; x <= 30; x++) floor(map, x, y, pickT(rg, cob));
  for (let x = 10; x <= 46; x++) for (let y = 19; y <= 21; y++) floor(map, x, y, pickT(rg, cob));
  for (let x = 12; x <= 46; x++) for (let y = 31; y <= 32; y++) floor(map, x, y, pickT(rg, cob));
  for (let x = 11; x <= 30; x++) for (let y = 17; y <= 18; y++) floor(map, x, y, pickT(rg, cob));
  for (let y = 12; y <= 36; y++) { floor(map, 11, y, pickT(rg, cob)); floor(map, 12, y, pickT(rg, cob)); }
  for (let y = 22; y <= 36; y++) { floor(map, 45, y, pickT(rg, cob)); floor(map, 46, y, pickT(rg, cob)); }
  for (let x = 12; x <= 30; x++) floor(map, x, 36, pickT(rg, cob));
  for (let x = 30; x <= 46; x++) floor(map, x, 36, pickT(rg, cob));

  // --- 5. the castle on its bailey -----------------------------------------
  // Morwen Daggerford's seat: a bailey wall of its own inside the town wall,
  // a keep in the middle of it and a turret at each shoulder. Drawn as masonry
  // — `keepTower`, not `building` — because a roof seen from above is a slab,
  // and a roofed slab nine tiles wide is indistinguishable from a barn. Given
  // battlements and lit slit windows it is unmistakably the castle, and plainly
  // the tallest thing in Daggerford from anywhere on the cross street. You
  // cannot get in — the gate is barred and the guardroom takes petitions in
  // writing — which is a quest hook rather than an oversight.
  floorRect(map, 37, 9, 11, 10, tid('FLAGSTONE', 'GRAVEL'));
  curtain(map, 37, 9, 11, 10, { key: 'STONE_WALL', base: 'FLAGSTONE', res, north: false });
  for (let x = 37; x <= 47; x++) dset(map, x, 9, tid('WALL_TOP_LIT', 'STONE_WALL'));
  keepTower(map, 39, 10, 7, 8, { storey: 3, peak: 3, chimney: 1, base: 'FLAGSTONE' }, res);
  keepTower(map, 37, 11, 2, 7, { storey: 3, lit: false, merlons: false, base: 'FLAGSTONE' }, res);
  keepTower(map, 46, 11, 2, 7, { storey: 3, lit: false, merlons: false, base: 'FLAGSTONE' }, res);
  for (const [px, py] of [[38, 10], [46, 10], [38, 17], [46, 17]]) dset(map, px, py, tid('PILLAR', 'STONE_WALL'));
  dset(map, 42, 18, tid('IRON_DOOR', 'DOOR_CLOSED'));       // the barred bailey gate
  dset(map, 41, 18, tid('PILLAR', 'STONE_WALL'));
  dset(map, 43, 18, tid('PILLAR', 'STONE_WALL'));
  prop(map, 40, 22, tid('BRAZIER', 'TORCH'), res);
  prop(map, 44, 22, tid('BRAZIER', 'TORCH'), res);
  prop(map, 38, 22, tid('STATUE', 'PILLAR'), res);
  prop(map, 46, 22, tid('STATUE', 'PILLAR'), res);
  signpost(map, 36, 22, 'DAGGERFORD CASTLE — the seat of Duchess Morwen Daggerford. The gate is barred and a shutter in the guardroom takes petitions in writing. It has taken a great many.', res);

  // --- 6. the four doors ---------------------------------------------------
  building(map, {
    x: 12, y: 11, w: 9, h: 6, wall: 'STONE_WALL', roof: 'tile', base: 'COBBLE', lit: true,
    roofRows: 2, door: 4, windows: [1, 2, 7], upper: [3, 6], sign: 6, band: 3,
    chimney: 1, chimney2: 7, approach: 1,
    porch: 3, lantern: true, interior: 'river-shining-tavern',
  }, res);                                       // The River Shining Tavern (16,16)
  building(map, {
    x: 31, y: 16, w: 6, h: 5, wall: 'WATTLE_WALL', roof: 'thatch', base: 'COBBLE',
    roofRows: 2, door: 3, windows: [1, 4], sign: 2, chimney: 4, approach: 1,
    porch: 3, lantern: true, interior: 'happy-cow',
  }, res);                                       // The Happy Cow (34,20)
  building(map, {
    x: 18, y: 22, w: 9, h: 9, wall: 'STONE_WALL', roof: 'tile', base: 'FLAGSTONE', lit: true,
    roofRows: 4, door: 4, windows: [1, 2, 6, 7], upper: [3, 5], sign: 6, band: 5,
    peak: 4, approach: 1, porch: 3, lantern: true, interior: 'morninglow-tower',
  }, res);                                       // Morninglow Tower (22,30)
  building(map, {
    x: 36, y: 26, w: 9, h: 5, wall: 'STONE_WALL', roof: 'shingle', base: 'GRAVEL',
    roofRows: 2, door: 4, windows: [1, 7], sign: 2, chimney: 7, approach: 1,
    porch: 3, interior: 'daggerford-smithy',
  }, res);                                       // Derval Ironeater's smithy (40,30)
  prop(map, 35, 31, tid('ANVIL', 'FORGE'), res);
  prop(map, 34, 30, tid('FORGE', 'ANVIL'), res);
  prop(map, 34, 29, tid('GRINDSTONE', 'ROCK'), res);
  prop(map, 46, 30, tid('ORE_IRON', 'ROCK'), res);
  prop(map, 46, 29, tid('CRATE', 'BARREL'), res);

  // --- 7. the market, the well, and the rest of the town -------------------
  floorRect(map, 31, 22, 15, 4, tid('FLAGSTONE', 'COBBLE'));
  stallRow(map, 35, 23, 5, 'h', rd, { step: 2, face: 1, res, wares: table(T_STALL), banner: true });
  stallRow(map, 35, 25, 5, 'h', rd, { step: 2, face: -1, res, wares: table(T_STALL) });
  wearPatches(map, rd, { x: 31, y: 22, w: 15, h: 4 }, 'COBBLE_ISLE', 5, { res });
  prop(map, 32, 24, tid('WELL', 'FOUNTAIN'), res);
  noticeBoard(map, 31, 22, res);                 // the Duchess's notices, by the well
  signpost(map, 33, 25, 'THE DAGGERFORD MARKET — by the Duchess’s charter, three days in ten. Coin of Waterdeep, Baldur’s Gate and Amn all taken; coin of Zhentil Keep is not.', res);

  // Houses. Every one a different footprint, because a town that repeats one
  // house six times is a texture, not a place.
  building(map, { x: 14, y: 33, w: 7, h: 5, wall: 'WATTLE_WALL', roof: 'thatch', base: 'COBBLE', roofRows: 2, windows: [1, 5], chimney: 5 }, res);
  building(map, { x: 22, y: 33, w: 6, h: 5, wall: 'WATTLE_WALL', roof: 'shingle', base: 'COBBLE', roofRows: 2, windows: [1, 4], chimney: 1 }, res);
  building(map, { x: 33, y: 33, w: 8, h: 5, wall: 'STONE_WALL', roof: 'tile', base: 'COBBLE', roofRows: 2, windows: [1, 6], upper: [3], chimney: 6 }, res);
  building(map, { x: 14, y: 24, w: 5, h: 4, wall: 'WATTLE_WALL', roof: 'thatch', base: 'COBBLE', roofRows: 2, windows: [1, 3] }, res);
  building(map, { x: 22, y: 12, w: 4, h: 5, wall: 'LOG_WALL', roof: 'thatch', base: 'COBBLE', roofRows: 2, windows: [1, 2], chimney: 2 }, res);
  building(map, { x: 31, y: 11, w: 5, h: 5, wall: 'WATTLE_WALL', roof: 'shingle', base: 'COBBLE', roofRows: 2, windows: [1, 3], chimney: 3 }, res);
  shell(map, { x: 14, y: 29, w: 4, h: 3, wall: 'WATTLE_WALL', roof: 'thatch', roofRows: 1, base: 'COBBLE', windows: [1, 2] }, res);

  // frontage: benches, barrels, a cart, all butted into a wall or a corner
  prop(map, 13, 17, tid('BENCH', 'CRATE'), res);
  prop(map, 21, 17, tid('BARREL', 'CRATE'), res);
  prop(map, 22, 18, tid('CART', 'CRATE'), res);
  prop(map, 31, 21, tid('BARREL', 'CRATE'), res);
  prop(map, 17, 31, tid('BENCH', 'CRATE'), res);
  prop(map, 27, 31, tid('BENCH', 'CRATE'), res);
  prop(map, 13, 22, tid('CRATE', 'BARREL'), res);
  prop(map, 45, 33, tid('SACK', 'CRATE'), res);
  prop(map, 11, 37, tid('HEDGE', 'BUSH'), res);
  prop(map, 20, 28, tid('BUSH', 'HEDGE'), res);
  for (const [px, py] of [[25, 10], [31, 10], [25, 37], [31, 37], [25, 20], [32, 20]]) prop(map, px, py, tid('BRAZIER', 'TORCH'), res);
  bigOak(map, 44, 28); bigOak(map, 13, 13);
  scatter(map, rd, 10, 2, 44, 4, table(T_SCRUB), 0.12, res);
  scatter(map, rd, 10, 41, 44, 4, table(T_SCRUB), 0.12, res);
  scatter(map, rd, 49, 1, 6, 44, table([['TREE_OAK', 5], ['BUSH', 4], ['ROCK', 2], ['GRASS_TALL', 3]]), 0.3, res);

  openThickets(map, { x: 28, y: 3 }, 5, res);
  map.recomputeFlags({ keep: 0 });

  // --- the temple close ----------------------------------------------------
  // Lathander's garden beside Morninglow Tower, planted AFTER `recomputeFlags`
  // on purpose: `garden()` lays its hedge through `canPlaceProp`, which refuses
  // any tile that would pinch the lane between the tower and the smithy. A ring
  // with a gap in it where the lane runs is a garden; a ring that closes the
  // lane is a bug.
  garden(map, { x: 27, y: 26, w: 7, h: 6 }, rd, { res, gate: { x: 30, y: 31 } });
  addSign(map, 30, 31, 'THE MORNINGLOW CLOSE — planted for Amaunator at the re-founding, and weeded every dawn by whoever drew the short straw.');
  // Wear where a market town's feet actually go: the market floor, the well,
  // and the length of the processional between the two gates.
  wearPatches(map, rd, { x: 31, y: 22, w: 15, h: 4 }, 'COBBLE_ISLE', 6, { res });
  wearPatches(map, rd, { x: 21, y: 8, w: 3, h: 32 }, 'PATH_ISLE', 9, { res });
  wearPatches(map, rd, { x: 27, y: 9, w: 5, h: 3 }, 'GRAVEL_ISLE', 3, { res });
  map.recomputeFlags({ keep: 0 });

  sealBorder(map, tid('TREE_OAK', 'BLACK'));
  sweepStanding(map, npcs);
  map.spawn = { x: 28, y: 3 };
  map.entry = { ...map.spawn };
  map.level = 9;

  signpost(map, 24, 5, 'DAGGERFORD — free town of the Duchy, by charter of the Lady Morwen. Arms peace-bonded within the walls. The gates shut at dusk and open at dawn.', res);
  signpost(map, 32, 41, 'SOUTH: the Trade Way. THE WAY INN — a day and a half. Water at the ford; nothing else until you get there.', res);
  addSign(map, 33, 22, 'The town well, sunk through forty feet of river gravel. The bucket rope is new; the windlass is two hundred years old.');
  addSign(map, 18, 17, 'THE RIVER SHINING TAVERN — Filarion Filvendorson, prop. Beds, board, and the best cellar between Waterdeep and the Gate.');
  // On the street, not on the signboard. The Happy Cow's SIGN tile sits at
  // (33,19) in the facade with roof above it and the base course below, so a
  // trigger there has no walkable tile to be read from — the same street-tile
  // rule the other three doors already follow.
  addSign(map, 33, 21, 'THE HAPPY COW — Fulbar Hardcheese. Cheap, hot, and there is always a bed if you do not mind who is in the next one.');
  addSign(map, 27, 31, 'MORNINGLOW TOWER — the Keeper of the Yellow Sun. Amaunator’s light on the hour, and healing to any who ask it.');
  addSign(map, 35, 31, 'DERVAL IRONEATER, SMITH — shoeing, edges, mail. No enchantment; go to Waterdeep for that and pay four times over.');
  map.addTrigger({ id: 'daggerford-ferry', kind: 'sign', x: 8, y: 27, data: { text: 'The Delimbiyr ferry. A flat barge on a chain, and a bell to ring for the ferryman, who is on the far bank and in no hurry.' } });
  map.addTrigger({ id: 'daggerford-inn-rest', kind: 'inn', x: 16, y: 17, data: { shop: 'river-shining-tavern', cost: 9, npc: 'filarion-filvendorson' } });
  return map;
}

// --- The River Shining Tavern -----------------------------------------------
function buildRiverShining(root) {
  const map = interiorMap({ id: 'river-shining-tavern', name: 'The River Shining Tavern', w: 24, h: 18, music: 'tavern', region: 'daggerford' });
  const { npcs, res } = reserve('river-shining-tavern');
  const r = root.fork('tavern');
  const rm = room(map, {
    w: 24, h: 18, floor: 'WOOD_FLOOR', wall: 'STONE_WALL', exit: 12,
    // Kitchen behind the bar: an inn that cooks has somewhere to cook.
    rooms: [{ x: 0, y: 0, w: 6, h: 6, door: 'e', name: 'kitchen' }],
  });

  for (let x = 8; x <= 15; x++) prop(map, x, 5, tid('BAR', 'COUNTER'), res);
  for (let x = 7; x <= 16; x++) prop(map, x, 1, tid('SHELF_GOODS', 'BOOKSHELF'), res);
  prop(map, 6, 1, tid('BARREL', 'CRATE'), res);
  prop(map, 17, 1, tid('BARREL', 'CRATE'), res);
  prop(map, 1, 6, tid('HEARTH', 'BRAZIER'), res);
  prop(map, 1, 7, tid('HEARTH', 'BRAZIER'), res);
  prop(map, 1, 9, tid('COOKING_POT', 'BARREL'), res);
  floorRect(map, 2, 5, 3, 6, tid('CARPET_RED', 'WOOD_FLOOR'));

  const tableAt = seating(map, r, res);
  tableAt(5, 13); tableAt(10, 9, 3); tableAt(17, 13); tableAt(19, 8); tableAt(8, 12, 2);
  prop(map, 22, 3, tid('BOOKSHELF', 'SHELF_GOODS'), res);
  prop(map, 22, 12, tid('BARREL', 'CRATE'), res);
  prop(map, 2, 15, tid('BENCH', 'CHAIR'), res);
  floor(map, 21, 1, tid('STAIRS_UP', 'WOOD_FLOOR'));
  floor(map, 21, 2, tid('WOOD_FLOOR_H', 'WOOD_FLOOR'));
  prop(map, 20, 1, tid('BED', 'BENCH'), res);
  oset(map, 11, 7, tid('CHANDELIER', 'CANDLE'));
  oset(map, 5, 4, tid('CHANDELIER', 'CANDLE'));
  oset(map, 17, 10, tid('CHANDELIER', 'CANDLE'));

  finishInterior(map, rm.exit, npcs, 'STONE_WALL');
  map.addTrigger({ id: 'river-shining-rest', kind: 'rest', x: 21, y: 2, w: 1, h: 1, data: { inn: true, cost: 9, text: 'A room over the river with a real window and a bolt on the door. Rest here?' } });
  map.addTrigger({ id: 'river-shining-shop', kind: 'shop', x: 11, y: 6, data: { shop: 'river-shining-tavern', npc: 'filarion-filvendorson' } });
  return map;
}

// --- The Happy Cow ----------------------------------------------------------
function buildHappyCow(root) {
  const map = interiorMap({ id: 'happy-cow', name: 'The Happy Cow', w: 20, h: 16, music: 'tavern', region: 'daggerford' });
  const { npcs, res } = reserve('happy-cow');
  const r = root.fork('cow');
  const rm = room(map, { w: 20, h: 16, floor: 'WOOD_FLOOR_H', wall: 'WATTLE_WALL', exit: 10 });

  for (let x = 6; x <= 11; x++) prop(map, x, 4, tid('COUNTER', 'BAR'), res);
  for (let x = 2; x <= 15; x++) prop(map, x, 1, tid('SHELF_GOODS', 'BOOKSHELF'), res);
  prop(map, 1, 6, tid('HEARTH', 'BRAZIER'), res);
  prop(map, 1, 8, tid('COOKING_POT', 'BARREL'), res);
  // the long tables: this is a hall with benches, not a room of little tables
  for (const ty of [8, 11]) {
    for (let x = 5; x <= 13; x++) prop(map, x, ty, tid('TABLE', 'BENCH'), res);
    for (let x = 5; x <= 13; x++) { prop(map, x, ty - 1, tid('BENCH', 'CHAIR'), res); prop(map, x, ty + 1, tid('BENCH', 'CHAIR'), res); }
  }
  for (const [px, py] of [[17, 3], [18, 4], [17, 5], [2, 13], [3, 13]]) prop(map, px, py, pickT(r, table([['SACK', 5], ['CRATE', 4], ['BARREL', 3]])), res);
  prop(map, 18, 12, tid('BED', 'BENCH'), res);
  prop(map, 18, 10, tid('BED', 'BENCH'), res);
  oset(map, 9, 6, tid('CHANDELIER', 'CANDLE'));

  finishInterior(map, rm.exit, npcs, 'WATTLE_WALL');
  map.addTrigger({ id: 'happy-cow-rest', kind: 'rest', x: 17, y: 10, w: 1, h: 3, data: { inn: true, cost: 3, text: 'A straw pallet in the corner of the common room, four coppers, and Fulbar throws in the soup. Rest here?' } });
  map.addTrigger({ id: 'happy-cow-shop', kind: 'shop', x: 9, y: 5, data: { shop: 'happy-cow', npc: 'fulbar-hardcheese' } });
  return map;
}

// --- Morninglow Tower -------------------------------------------------------
function buildMorninglowTower(root) {
  const map = interiorMap({
    id: 'morninglow-tower', name: 'Morninglow Tower', w: 20, h: 18, music: 'temple',
    region: 'daggerford', ambient: { color: '#3a2c14', alpha: 0.1 },
  });
  const { npcs, res } = reserve('morninglow-tower');
  const r = root.fork('temple');
  const rm = room(map, { w: 20, h: 18, floor: 'STONE_FLOOR', wall: 'STONE_WALL', exit: 10, step: 'MOSAIC' });

  // A nave: two files of pillars, a mosaic aisle, the sun-altar at the head.
  floorRect(map, 8, 2, 5, 13, tid('MOSAIC', 'STONE_FLOOR'));
  for (const px of [6, 14]) for (let py = 4; py <= 13; py += 3) prop(map, px, py, tid('PILLAR', 'STONE_WALL'), res);
  prop(map, 10, 2, tid('ALTAR', 'SHRINE'), res);
  prop(map, 9, 2, tid('CANDLE', 'TORCH'), res);
  prop(map, 11, 2, tid('CANDLE', 'TORCH'), res);
  prop(map, 10, 1, tid('STATUE', 'SHRINE'), res);
  prop(map, 8, 1, tid('SHRINE', 'ALTAR'), res);
  prop(map, 12, 1, tid('SHRINE', 'ALTAR'), res);
  for (const py of [6, 8, 10, 12]) { prop(map, 4, py, tid('BENCH', 'CHAIR'), res); prop(map, 16, py, tid('BENCH', 'CHAIR'), res); }
  for (const py of [5, 9, 13]) { prop(map, 1, py, tid('TORCH', 'CANDLE'), res); prop(map, 18, py, tid('TORCH', 'CANDLE'), res); }
  prop(map, 2, 2, tid('BOOKSHELF', 'SHELF_GOODS'), res);
  prop(map, 17, 2, tid('BOOKSHELF', 'SHELF_GOODS'), res);
  prop(map, 3, 15, tid('BRAZIER', 'TORCH'), res);
  prop(map, 16, 15, tid('BRAZIER', 'TORCH'), res);
  floor(map, 17, 15, tid('STAIRS_UP', 'STONE_FLOOR'));      // up into the tower
  oset(map, 10, 7, tid('CHANDELIER', 'CANDLE'));
  if (r.chance(1)) oset(map, 10, 11, tid('CHANDELIER', 'CANDLE'));

  finishInterior(map, rm.exit, npcs, 'STONE_WALL');
  map.addTrigger({ id: 'morninglow-shop', kind: 'shop', x: 10, y: 3, data: { shop: 'morninglow-tower', npc: 'lucian-dlusker' } });
  map.addTrigger({ id: 'morninglow-tower-stair', kind: 'sign', x: 17, y: 15, data: { text: 'The stair to the lantern room, where the flame is kept. A rope across it, and a note: BY THE KEEPER’S LEAVE ONLY.' } });
  return map;
}

// --- Derval Ironeater's smithy ----------------------------------------------
function buildDaggerfordSmithy(root) {
  const map = interiorMap({ id: 'daggerford-smithy', name: 'Ironeater’s Smithy', w: 20, h: 14, music: 'shop', region: 'daggerford' });
  const { npcs, res } = reserve('daggerford-smithy');
  const r = root.fork('smithy');
  const rm = room(map, {
    w: 20, h: 14, floor: 'STONE_FLOOR', wall: 'STONE_WALL', exit: 10, step: 'WOOD_FLOOR_H',
    // The stock room: bar iron, charcoal and finished work, behind a door, the
    // way a smith who does not want his stock walking off keeps it.
    // Door placed by hand: an 'w' door would land on (14,10), where the builder
    // stands a crate.
    rooms: [{ x: 14, y: 7, w: 6, h: 7, door: { x: 14, y: 9 }, floor: 'STONE_FLOOR', name: 'stock' }],
  });

  prop(map, 3, 2, tid('FORGE', 'HEARTH'), res);
  prop(map, 4, 2, tid('FORGE', 'HEARTH'), res);
  prop(map, 3, 4, tid('ANVIL', 'ROCK'), res);
  prop(map, 6, 3, tid('GRINDSTONE', 'ROCK'), res);
  prop(map, 2, 6, tid('BARREL', 'CRATE'), res);            // the slack tub
  for (let x = 8; x <= 13; x++) prop(map, x, 5, tid('COUNTER', 'TABLE'), res);
  // finished work on the walls: blades racked, mail on its stands, the small goods shelved
  for (let x = 9; x <= 17; x++) prop(map, x, 1, tid(['WEAPON_RACK', 'SHELF_GOODS', 'ARMOR_STAND'][x % 3], 'SHELF_GOODS'), res);
  for (let y = 2; y <= 5; y++) prop(map, 18, y, tid('WEAPON_RACK', 'SHELF_GOODS'), res);
  for (const [px, py] of [[2, 10], [3, 10], [17, 8], [17, 9], [16, 11], [4, 11]]) prop(map, px, py, pickT(r, table([['CRATE', 5], ['ORE_IRON', 3], ['BARREL', 3], ['SACK', 2]])), res);
  prop(map, 8, 3, tid('CANDLE', 'TORCH'), res);
  prop(map, 14, 10, tid('TABLE', 'BENCH'), res);
  prop(map, 13, 10, tid('CHAIR', 'BENCH'), res);
  oset(map, 3, 1, tid('CHIMNEY', 'TORCH'));
  // A working smithy is a crowded room. The middle of the floor was bare, which
  // read as a hall somebody had left an anvil in: fill it with the trade —
  // a second anvil under the window, the stock rack, and the day's iron.
  prop(map, 5, 5, tid('ANVIL', 'ROCK'), res);
  prop(map, 6, 6, tid('WEAPON_RACK', 'CRATE'), res);        // the finished-work rack
  prop(map, 6, 7, tid('WEAPON_RACK', 'CRATE'), res);
  for (const [px, py] of [[2, 8], [5, 9], [8, 8], [9, 11], [11, 8], [16, 6]]) {
    prop(map, px, py, pickT(r, table([['ORE_IRON', 5], ['CRATE', 4], ['BARREL', 3], ['SACK', 3]])), res);
  }
  prop(map, 3, 7, tid('BARREL', 'CRATE'), res);             // the second slack tub
  prop(map, 17, 11, tid('GRINDSTONE', 'ROCK'), res);
  prop(map, 12, 3, tid('CANDLE', 'TORCH'), res);
  prop(map, 15, 3, tid('SHELF_GOODS', 'CRATE'), res);

  finishInterior(map, rm.exit, npcs, 'STONE_WALL');
  map.addTrigger({ id: 'daggerford-smithy-shop', kind: 'shop', x: 10, y: 6, data: { shop: 'daggerford-provisions', npc: 'derval-ironeater' } });
  return map;
}

// ---------------------------------------------------------------------------
// 4. THE WAY INN
// ---------------------------------------------------------------------------
//
// Canon: a fortified caravanserai where the Dusk Road leaves the Trade Way. Not
// a town — a WALLED YARD with one great building in it. Everything about the
// shape is the opposite of Daggerford: no streets, no houses, no plan; a gravel
// yard big enough to turn a twelve-wagon train in, stables down one side, and
// the common room across the north end where the fire is.

function buildTheWayInn(root) {
  const map = new TileMap({
    w: 44, h: 34, id: 'the-way-inn', name: 'The Way Inn', biome: 'plains',
    indoor: false, music: 'village', safe: true, encounterRate: 0, region: 'trade-way',
  });
  const { npcs, res } = reserve('the-way-inn');
  const rg = root.fork('ground');
  const rd = root.fork('detail');
  const ruts = table(T_RUTS);

  groundNoise(map, rg, 0, 0, 44, 34, table(T_DOWNS));
  scatter(map, rg, 0, 0, 44, 8, table(T_SCRUB), 0.14, res);
  scatter(map, rg, 0, 28, 44, 6, table(T_SCRUB), 0.14, res);
  scatter(map, rg, 0, 8, 7, 20, table(T_SCRUB), 0.16, res);

  // --- the roads -----------------------------------------------------------
  for (let y = 1; y <= 32; y++) for (let x = 21; x <= 23; x++) floor(map, x, y, pickT(rg, ruts));
  for (let x = 22; x <= 42; x++) for (let y = 18; y <= 20; y++) floor(map, x, y, pickT(rg, ruts));  // the Dusk Road

  // --- the compound --------------------------------------------------------
  // A caravanserai yard is gravel that a thousand wagons have worn through to
  // mud along the lines they actually drive. Clumps, not confetti.
  floorRect(map, 8, 8, 28, 21, tid('GRAVEL', 'DIRT'));
  groundNoise(map, rg, 9, 9, 26, 19, table([['GRAVEL', 9], ['GRAVEL', 4]]));
  patches(map, rg, 9, 9, 26, 19, table([['DIRT', 7], ['MUD', 2]]), 10, 5, 18);
  patches(map, rg, 9, 9, 26, 19, table([['MUD', 5], ['DIRT', 3]]), 4, 3, 8);
  curtain(map, 8, 8, 28, 21, { key: 'STONE_WALL', base: 'GRAVEL', res });
  gateway(map, 22, 8, 10, tid('GRAVEL', 'DIRT'), { half: 1, gateRow: 9, torchRow: 10 });
  gateway(map, 22, 27, 28, tid('GRAVEL', 'DIRT'), { half: 1, gateRow: 28, torchRow: 27 });
  // the postern the Dusk Road traffic uses, in the east wall
  for (let y = 18; y <= 20; y++) floor(map, 35, y, tid('GRAVEL', 'DIRT'));
  dset(map, 35, 19, tid('GATE', 'DOOR_OPEN'));
  dset(map, 35, 17, tid('PILLAR', 'STONE_WALL'));
  dset(map, 35, 21, tid('PILLAR', 'STONE_WALL'));

  // --- the common room, across the north end -------------------------------
  building(map, {
    x: 16, y: 11, w: 13, h: 6, wall: 'STONE_WALL', roof: 'shingle', base: 'GRAVEL', lit: true,
    roofRows: 2, door: 6, windows: [1, 2, 3, 9, 10, 11], upper: [4, 8], sign: 8, band: 3,
    chimney: 1, chimney2: 11, approach: 2, porch: 3, lantern: true,
  }, res);                                        // way-inn-common (22,16)
  prop(map, 15, 17, tid('BENCH', 'CRATE'), res);
  prop(map, 29, 17, tid('BENCH', 'CRATE'), res);
  prop(map, 30, 16, tid('BARREL', 'CRATE'), res);
  prop(map, 15, 16, tid('BARREL', 'CRATE'), res);
  prop(map, 14, 15, tid('CRATE', 'BARREL'), res);

  // --- the stables and the wagon lines, down the west side -----------------
  shell(map, {
    x: 9, y: 12, w: 5, h: 5, wall: 'LOG_WALL', roof: 'thatch', base: 'DIRT',
    roofRows: 2, loading: [1, 2, 3], windows: [1, 3],
  }, res);
  shell(map, {
    x: 9, y: 20, w: 5, h: 5, wall: 'LOG_WALL', roof: 'thatch', base: 'DIRT',
    roofRows: 2, loading: [1, 2, 3], windows: [1, 3],
  }, res);
  floorRect(map, 9, 17, 6, 3, tid('MUD', 'DIRT'));
  fenceRect(map, 9, 17, 6, 3, { x: 14, y: 18 }, res);
  prop(map, 15, 25, tid('CART', 'CRATE'), res);
  prop(map, 12, 26, tid('CART', 'CRATE'), res);
  prop(map, 10, 27, tid('BARREL', 'CRATE'), res);
  prop(map, 16, 26, tid('SACK', 'CRATE'), res);

  // --- the yard: the well, the fire, the night's wagons --------------------
  prop(map, 22, 22, tid('WELL', 'FOUNTAIN'), res);
  prop(map, 26, 23, tid('BRAZIER', 'TORCH'), res);
  prop(map, 26, 24, tid('COOKING_POT', 'BARREL'), res);
  for (const [px, py] of [[30, 23], [32, 24], [30, 26], [33, 22]]) prop(map, px, py, pickT(rd, table(T_STALL)), res);
  prop(map, 19, 24, tid('BENCH', 'CRATE'), res);
  prop(map, 25, 26, tid('BENCH', 'CRATE'), res);
  prop(map, 33, 12, tid('CRATE', 'BARREL'), res);
  prop(map, 33, 13, tid('BARREL', 'CRATE'), res);
  prop(map, 31, 12, tid('SACK', 'CRATE'), res);
  prop(map, 34, 25, tid('GRINDSTONE', 'ROCK'), res);

  // --- the wagon park and the picket line ----------------------------------
  // A caravanserai is not a parade ground. Four wagons drawn up in a line down
  // the east side with their loads stacked beside them, a picket rail along the
  // north wall with the feed by it, and a woodpile at the fire — clustered,
  // because four carts standing together read as a caravan and four carts
  // scattered one to a corner read as litter.
  for (let n = 0; n < 4; n++) {
    const wx = 30, wy = 13 + n * 3;
    prop(map, wx, wy, tid('CART', 'CRATE'), res);
    prop(map, wx + 1, wy, tid('CART', 'CRATE'), res);
    prop(map, wx + 2, wy, pickT(rd, table([['BARREL', 5], ['SACK', 4], ['CRATE', 3]])), res);
    if (rd.chance(0.6)) prop(map, wx - 1, wy + 1, pickT(rd, table([['SACK', 5], ['BARREL', 3]])), res);
  }
  for (let x = 17; x <= 27; x++) prop(map, x, 11, tid('FENCE_H', 'STONE_FENCE'), res);   // the picket rail
  for (const [px, py] of [[17, 12], [22, 12], [27, 12]]) prop(map, px, py, tid('SACK', 'CRATE'), res);
  for (const [px, py] of [[24, 23], [25, 23], [24, 24]]) prop(map, px, py, tid('CRATE', 'BARREL'), res);  // the woodpile
  prop(map, 20, 26, tid('BENCH', 'CRATE'), res);
  prop(map, 28, 27, tid('BARREL', 'CRATE'), res);
  prop(map, 18, 27, tid('CART', 'CRATE'), res);

  openThickets(map, { x: 22, y: 3 }, 5, res);
  map.recomputeFlags({ keep: 0 });
  sealBorder(map, tid('TREE_OAK', 'BLACK'));
  sweepStanding(map, npcs);
  map.spawn = { x: 22, y: 3 };
  map.entry = { ...map.spawn };
  map.level = 9;

  signpost(map, 19, 5, 'THE WAY INN — beds, stabling, and a wall between you and the road. Wagons in the yard, weapons peace-bonded, and the gate is barred at moonrise whoever is still outside.', res);
  signpost(map, 38, 21, 'EAST: THE DUSK ROAD. Scornubel, sixty leagues, and Iriaebor beyond it. No inn between here and the Sunset Vale worth the name.', res);
  signpost(map, 25, 30, 'SOUTH: the Trade Way. The Fields of the Dead in three days. Travel in company; the Way Inn keeps a board of who is going which way and when.', res);
  addSign(map, 24, 16, 'THE WAY INN, est. by the Company of the Wagon. Gorstag Amblecrown keeps it, his mother kept it, and neither of them ever turned a paying traveller out.');
  addSign(map, 22, 22, 'The yard well, ninety feet down through chalk. In dry years the Way Inn is the only water for a day in either direction, and Gorstag charges for it.');
  map.addTrigger({ id: 'way-inn-rest', kind: 'inn', x: 22, y: 17, data: { shop: 'way-inn-common', cost: 7, npc: 'gorstag-amblecrown' } });
  return map;
}

// --- the common room --------------------------------------------------------
function buildWayInnCommon(root) {
  const map = interiorMap({ id: 'way-inn-common', name: 'The Way Inn', w: 26, h: 20, music: 'inn', region: 'trade-way' });
  const { npcs, res } = reserve('way-inn-common');
  const r = root.fork('common');
  const rm = room(map, {
    w: 26, h: 20, floor: 'WOOD_FLOOR', wall: 'STONE_WALL', exit: 13,
    rooms: [
      { x: 0, y: 2, w: 6, h: 7, door: 'e', name: 'kitchen' },
      { x: 20, y: 13, w: 6, h: 7, door: 'w', floor: 'CARPET_RED', name: 'private room' },
    ],
  });

  // The common floor, the kitchen behind the bar and the carters' private room.
  // Two hearths, because a caravanserai is heated for forty.
  prop(map, 1, 1, tid('BARREL', 'CRATE'), res);   // the corner the notice board makes
  prop(map, 1, 5, tid('HEARTH', 'BRAZIER'), res);
  prop(map, 1, 6, tid('HEARTH', 'BRAZIER'), res);
  prop(map, 24, 5, tid('HEARTH', 'BRAZIER'), res);
  prop(map, 24, 6, tid('HEARTH', 'BRAZIER'), res);
  prop(map, 1, 8, tid('COOKING_POT', 'BARREL'), res);
  floorRect(map, 2, 4, 3, 5, tid('CARPET_RED', 'WOOD_FLOOR'));
  floorRect(map, 21, 4, 3, 5, tid('CARPET_RED', 'WOOD_FLOOR'));

  for (let x = 9; x <= 16; x++) prop(map, x, 4, tid('BAR', 'COUNTER'), res);
  for (let x = 8; x <= 17; x++) prop(map, x, 1, tid('SHELF_GOODS', 'BOOKSHELF'), res);
  prop(map, 7, 1, tid('BARREL', 'CRATE'), res);
  prop(map, 18, 1, tid('BARREL', 'CRATE'), res);

  // trestle tables the length of the room
  for (const ty of [9, 13]) {
    for (let x = 6; x <= 19; x++) prop(map, x, ty, tid('TABLE', 'BENCH'), res);
    for (let x = 6; x <= 19; x++) { prop(map, x, ty - 1, tid('BENCH', 'CHAIR'), res); prop(map, x, ty + 1, tid('BENCH', 'CHAIR'), res); }
  }
  for (const [px, py] of [[2, 12], [3, 12], [2, 15], [23, 12], [22, 15], [23, 16]]) prop(map, px, py, pickT(r, table([['CRATE', 5], ['BARREL', 4], ['SACK', 4]])), res);
  prop(map, 4, 17, tid('BENCH', 'CHAIR'), res);
  prop(map, 21, 17, tid('BENCH', 'CHAIR'), res);
  floor(map, 23, 1, tid('STAIRS_UP', 'WOOD_FLOOR'));
  floor(map, 23, 2, tid('WOOD_FLOOR_H', 'WOOD_FLOOR'));
  prop(map, 22, 1, tid('BED', 'BENCH'), res);
  prop(map, 2, 1, tid('SIGN', 'BOOKSHELF'), res);         // the road board
  oset(map, 8, 7, tid('CHANDELIER', 'CANDLE'));
  oset(map, 17, 7, tid('CHANDELIER', 'CANDLE'));
  oset(map, 12, 15, tid('CHANDELIER', 'CANDLE'));

  finishInterior(map, rm.exit, npcs, 'STONE_WALL');
  addSign(map, 2, 1, 'THE ROAD BOARD. Chalked columns: who is going north, who south, who east on the Dusk Road, and how many swords they have. Half the Trade Way’s business is done against this wall.');
  map.addTrigger({ id: 'way-inn-common-rest', kind: 'rest', x: 23, y: 2, w: 1, h: 1, data: { inn: true, cost: 7, text: 'A bunk in the long room above, and forty other travellers snoring through it. Rest here?' } });
  map.addTrigger({ id: 'way-inn-common-shop', kind: 'shop', x: 12, y: 5, data: { shop: 'way-inn-common', npc: 'gorstag-amblecrown' } });
  return map;
}

// ---------------------------------------------------------------------------
// 5. THE FIELDS OF THE DEAD
// ---------------------------------------------------------------------------
//
// The great battlefield between the Trollbark and the Chionthar, where every
// army that ever marched on Baldur's Gate stopped. Open, treeless, and covered
// in the evidence: barrow mounds in rows, headstones nobody reads, siege timber
// rotted where it fell. Two spurs leave it east — one to Dragonspear Castle over
// its hellgate, one along the cliffs to Rosymorn Monastery.

function buildFieldsOfTheDead(root) {
  const map = new TileMap({
    w: 72, h: 56, id: 'fields-of-the-dead', name: 'The Fields of the Dead', biome: 'plains',
    indoor: false, music: 'tense', encounterRate: 0.07, encounterTable: 'crypt-of-the-restless',
    ambient: { color: '#1a1a24', alpha: 0.1 }, weather: 'fog', region: 'fields-of-the-dead',
  });
  const { npcs, res } = reserve('fields-of-the-dead');
  const rg = root.fork('ground');
  const rd = root.fork('detail');
  const ruts = table(T_RUTS);

  groundNoise(map, rg, 0, 0, 72, 56, table([['GRASS_4', 9], ['GRASS', 6], ['GRASS_TALL', 4], ['CLOVER', 2], ['DIRT', 1]]));

  // --- the barrow rows -----------------------------------------------------
  // RANKED, not scattered — somebody buried these in lines, and the lines are
  // the whole reason the place is frightening. But ranked is not LATTICED: a
  // first pass laid twenty-five identical mounds on an exact six-by-ten grid
  // and it read as floor tiling, not as graves. So the ranks survive and
  // everything else varies — each mound is jittered a tile off its mark, cut
  // to one of three sizes, and roughly one in seven was dug open long ago and
  // is a pit with its kerb thrown down.
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const by = 8 + row * 10 + rd.int(-1, 1);
      const cx = 6 + col * 6 + (row % 2 ? 3 : 0) + rd.int(-1, 1);
      if (rd.chance(0.08)) continue;                       // a rank with a gap in it
      const big = rd.chance(0.28), small = !big && rd.chance(0.24);
      const rx = big ? 3 : small ? 1 : 2;                  // half-width of the mound
      const robbed = rd.chance(0.14);
      floorRect(map, cx - rx, by - 1, rx * 2 + 1, big ? 5 : 4, tid('DIRT', 'GRAVEL'));
      // A turf mound with a kerb of set stones, not a garden planter: the ring
      // alternates hedge-grown turf and the kerbstones showing through it.
      const kerb = [];
      for (let i = -rx; i <= rx; i++) { kerb.push([i, -1]); kerb.push([i, big ? 3 : 2]); }
      kerb.push([-rx - 1, 0], [-rx - 1, 1], [rx + 1, 0], [rx + 1, 1]);
      for (let k = 0; k < kerb.length; k++) {
        if (robbed && rd.chance(0.45)) continue;           // the kerb went first
        prop(map, cx + kerb[k][0], by + kerb[k][1],
          tid(robbed ? 'RUBBLE' : (k % 3 === 1 ? 'BOULDER' : 'HEDGE'), 'BUSH'), res);
      }
      gset(map, cx, by + 1, tid(robbed ? 'DIRT' : 'GRASS_3', 'GRASS'));
      prop(map, cx, by, tid(robbed ? 'PIT' : 'TOMB', 'GRAVESTONE'), res);
      if (robbed || rd.chance(0.4)) prop(map, cx + 1, by + 1, tid('BONES', 'RUBBLE'), res);
    }
  }
  // The headstone fields, west of the road: rank on rank, all the same — a war
  // cemetery is supposed to look like that. Only the odd stone leans out of
  // line or has gone over entirely, which is what stops it reading as a stamp.
  for (let y = 6; y <= 50; y += 3) {
    for (let x = 34; x <= 44; x += 2) {
      const px = x + (rd.chance(0.22) ? rd.int(-1, 1) : 0);
      const py = y + (rd.chance(0.18) ? 1 : 0);
      if (Math.abs(px - 38) < 1 && py > 20 && py < 26) continue;
      if (rd.chance(0.12)) continue;
      prop(map, px, py, tid(rd.chance(0.14) ? 'RUBBLE' : 'GRAVESTONE', 'ROCK'), res);
    }
  }

  // --- the roads -----------------------------------------------------------
  for (let y = 1; y <= 54; y++) for (let x = 34; x <= 38; x++) floor(map, x, y, pickT(rg, ruts));
  for (let x = 36; x <= 70; x++) for (let y = 15; y <= 17; y++) floor(map, x, y, pickT(rg, ruts));   // to Dragonspear
  for (let x = 36; x <= 70; x++) for (let y = 39; y <= 41; y++) floor(map, x, y, pickT(rg, ruts));   // to Rosymorn

  // --- the siege lines, east of the road -----------------------------------
  // Dragonspear's besiegers left their engines where they stood.
  for (const [sx, sy] of [[50, 24], [58, 28], [46, 32], [62, 20], [54, 34]]) {
    floorRect(map, sx - 2, sy - 2, 6, 5, tid('DIRT', 'GRAVEL'));
    prop(map, sx, sy, tid('TIMBER_SUPPORT', 'STUMP'), res);
    prop(map, sx + 1, sy, tid('TIMBER_SUPPORT', 'STUMP'), res);
    prop(map, sx, sy + 1, tid('CART', 'CRATE'), res);
    prop(map, sx + 2, sy - 1, tid('BOULDER', 'ROCK'), res);
    prop(map, sx - 1, sy + 2, tid('BONES', 'RUBBLE'), res);
    if (rd.chance(0.6)) prop(map, sx + 2, sy + 2, tid('SKULL_PILE', 'BONES'), res);
  }

  // --- the broken standing stones ------------------------------------------
  const cx = 56, cy = 46;
  for (let a = 0; a < 12; a++) {
    const ang = (a / 12) * Math.PI * 2;
    const px = cx + Math.round(Math.cos(ang) * 6), py = cy + Math.round(Math.sin(ang) * 4);
    prop(map, px, py, tid(a % 4 === 3 ? 'RUBBLE' : 'PILLAR', 'ROCK'), res);
  }
  floorRect(map, cx - 4, cy - 2, 9, 5, tid('GRAVEL', 'DIRT'));
  prop(map, cx, cy, tid('ALTAR', 'SHRINE'), res);
  for (let y = cy - 2; y >= 42; y--) floor(map, cx, y, tid('DIRT', 'GRAVEL'));
  signpost(map, cx + 2, cy - 2, 'A ring of stones with four of the twelve thrown down. The altar in the middle is older than the battles and nobody has ever agreed whose it was.', res);

  // --- the mouth of Dragonspear --------------------------------------------
  // The castle proper is a ruin around a hellgate; what you can see from the
  // Fields is a broken curtain wall and a stair going down into it.
  ruinShell(map, rd, 60, 8, 11, 12, {
    apron: 'GRAVEL', mess: 0.24,
    pillars: [[60, 8], [70, 8], [60, 19]],
    gaps: [[65, 19], [60, 12], [70, 14], [63, 8]],
    rubble: [['RUBBLE', 6], ['BONES', 3], ['ROCK', 3], ['SKULL_PILE', 1]],
  }, res);
  prop(map, 62, 10, tid('DEAD_TREE', 'STUMP'), res);
  prop(map, 68, 17, tid('BRAZIER', 'TORCH'), res);
  for (let y = 17; y <= 19; y++) floor(map, 65, y, tid('STONE_FLOOR_CRACKED', 'GRAVEL'));
  for (let x = 66; x <= 69; x++) floor(map, x, 16, tid('STONE_FLOOR_CRACKED', 'GRAVEL'));
  signpost(map, 66, 17, 'DRAGONSPEAR CASTLE. Twice the armies of the Coast have shut what is under this floor and twice it has opened again. The stair down is swept clean, which is the worst detail of all.', res);

  // --- the way east to Rosymorn --------------------------------------------
  signpost(map, 64, 42, 'EAST: the cliff road. ROSYMORN MONASTERY — abandoned by the Order of the Sun forty years since. The Chionthar is four hundred feet below the path; mind the wind.', res);
  for (const [px, py] of [[64, 36], [67, 44], [59, 38], [69, 47]]) prop(map, px, py, tid('BOULDER', 'ROCK'), res);
  scatter(map, rd, 58, 30, 13, 24, table([['ROCK', 5], ['BOULDER', 3], ['DEAD_TREE', 2], ['RUBBLE', 2]]), 0.12, res);

  scatter(map, rd, 1, 1, 70, 54, table([['DEAD_TREE', 3], ['BONES', 2], ['ROCK', 4], ['GRASS_TALL', 5], ['RUBBLE', 2]]), 0.05, res);
  milestone(map, 32, 4, 'THE FIELDS OF THE DEAD. There is no milestone here, only a board: THE ROAD IS SAFE. THE FIELDS ARE NOT. DO NOT LEAVE THE RUTS AFTER DARK.', res);
  milestone(map, 40, 50, 'SOUTH: the Coast Way and Baldur’s Gate. Somebody has cut a tally into the post — one stroke for each year they have counted the barrows and found one more.', res);

  openThickets(map, { x: 36, y: 3 }, 5, res);
  map.recomputeFlags({ keep: 0 });
  sealBorder(map, tid('DEAD_TREE', 'BLACK'));
  sweepStanding(map, npcs);
  map.spawn = { x: 36, y: 3 };
  map.entry = { ...map.spawn };
  map.level = 10;
  siteMouth(map, 68, 16, 'dragonspear-castle', { dir: 'down', kind: 'cave', theme: 'dungeon' });
  map.addTrigger({
    id: 'fields-barrows', kind: 'encounter-zone', x: 1, y: 1, w: 70, h: 54,
    data: { table: 'crypt-of-the-restless', rate: 0.07, biome: 'plains' },
  });
  return map;
}

// ---------------------------------------------------------------------------
// 6. ROSYMORN MONASTERY
// ---------------------------------------------------------------------------
//
// Canon: a Lathanderite house on a shelf of the cliffs north of the Chionthar,
// abandoned by its clergy and held now by githyanki. Quiet, ordered, and built
// around a cloister — which is the whole design brief: the mountain shuts three
// sides, a switchback path climbs the fourth, and the great hall sits square in
// the middle with its door on the axis.

function buildRosymornMonastery(root) {
  const map = new TileMap({
    w: 48, h: 40, id: 'rosymorn-monastery', name: 'Rosymorn Monastery', biome: 'mountain',
    indoor: false, music: 'mountain', encounterRate: 0.05, encounterTable: 'griffon-crag',
    ambient: { color: '#1c1a26', alpha: 0.12 }, region: 'rosymorn-monastery',
  });
  const { npcs, res } = reserve('rosymorn-monastery');
  const rg = root.fork('ground');
  const rd = root.fork('detail');

  // Scree the whole shelf, then let the mountain turf come through it in
  // clumps. Two materials at even odds per tile would be static, not ground.
  groundNoise(map, rg, 0, 0, 48, 40, table([['GRAVEL', 9], ['GRAVEL', 4]]));
  patches(map, rg, 1, 1, 46, 38, table([['DIRT', 6], ['GRAVEL', 1]]), 14, 6, 26);
  patches(map, rg, 1, 1, 46, 38, table([['GRASS_4', 5], ['GRASS', 3], ['CLOVER', 1]]), 9, 4, 14);

  // --- the mountain --------------------------------------------------------
  // Cliff along the north and east, and the drop to the Chionthar in the south.
  for (let x = 0; x < 48; x++) {
    const top = 4 + Math.round(Math.sin(x * 0.21) * 2);
    for (let y = 0; y <= top; y++) prop(map, x, y, tid('MOUNTAIN', 'CLIFF'), res);
  }
  for (let y = 0; y < 40; y++) {
    const east = 44 - Math.round(Math.cos(y * 0.19) * 2);
    for (let x = east; x < 48; x++) prop(map, x, y, tid('CLIFF', 'MOUNTAIN'), res);
  }
  for (let x = 0; x < 48; x++) {
    const low = 35 + Math.round(Math.sin(x * 0.16 + 1) * 2);
    for (let y = low; y < 40; y++) prop(map, x, y, tid('CLIFF', 'MOUNTAIN'), res);
  }

  // --- the switchback up from the west gate --------------------------------
  const path = table([['GRAVEL', 7], ['DIRT_PATH', 4], ['FLAGSTONE', 2]]);
  for (let x = 1; x <= 12; x++) for (let y = 19; y <= 21; y++) floor(map, x, y, pickT(rg, path));
  for (let y = 21; y <= 29; y++) for (let x = 11; x <= 13; x++) floor(map, x, y, pickT(rg, path));
  for (let x = 11; x <= 34; x++) for (let y = 27; y <= 29; y++) floor(map, x, y, pickT(rg, path));
  for (let y = 15; y <= 29; y++) for (let x = 23; x <= 25; x++) floor(map, x, y, pickT(rg, path));

  // --- the great hall and its cloister -------------------------------------
  // The hall's door IS the warp into the cloister below: it is on the base
  // course at (24,14), and the flagstone before it at (24,15) is the landing.
  floorRect(map, 14, 16, 21, 11, tid('FLAGSTONE', 'GRAVEL'));
  building(map, {
    x: 16, y: 6, w: 17, h: 9, wall: 'STONE_WALL', roof: 'tile', base: 'FLAGSTONE',
    roofRows: 4, door: 8, windows: [1, 3, 13, 15], upper: [5, 8, 11], band: 5,
    peak: 8, chimney: 1, chimney2: 15, approach: 1, step: 'FLAGSTONE',
  }, res);
  // the colonnade of the cloister walk, three sides of the forecourt
  for (let x = 14; x <= 34; x += 2) { prop(map, x, 16, tid('PILLAR', 'STONE_WALL'), res); prop(map, x, 26, tid('PILLAR', 'STONE_WALL'), res); }
  for (let y = 18; y <= 24; y += 2) { prop(map, 14, y, tid('PILLAR', 'STONE_WALL'), res); prop(map, 34, y, tid('PILLAR', 'STONE_WALL'), res); }
  floorRect(map, 18, 19, 13, 5, tid('MOSAIC', 'FLAGSTONE'));
  prop(map, 24, 21, tid('FOUNTAIN', 'WELL'), res);           // dry these forty years
  prop(map, 20, 20, tid('STATUE', 'PILLAR'), res);
  prop(map, 28, 20, tid('RUBBLE', 'STATUE'), res);           // its pair, thrown down
  prop(map, 20, 23, tid('HEDGE', 'BUSH'), res);
  prop(map, 28, 23, tid('DEAD_TREE', 'STUMP'), res);
  for (const [px, py] of [[15, 15], [33, 15], [15, 27], [33, 27]]) prop(map, px, py, tid('BRAZIER', 'TORCH'), res);

  // --- the bell tower, thrown down -----------------------------------------
  ruinShell(map, rd, 36, 8, 7, 9, {
    apron: 'GRAVEL', mess: 0.3,
    pillars: [[36, 8], [42, 8]],
    gaps: [[39, 16], [42, 12]],
  }, res);
  for (let y = 17; y <= 27; y++) floor(map, 39, y, tid('GRAVEL', 'DIRT'));
  prop(map, 38, 13, tid('SHRINE', 'ALTAR'), res);            // the fallen bell
  signpost(map, 40, 17, 'The bell tower came down in a single night and nobody in the valley heard it fall. The bell itself is in the rubble, face down, with a hole punched through it from the inside.', res);

  // --- the terraces the Order farmed ---------------------------------------
  for (const [ty, tx, tw] of [[31, 8, 12], [31, 24, 10], [33, 14, 8]]) {
    floorRect(map, tx, ty, tw, 2, tid('FARMLAND', 'DIRT'));
    for (let x = tx; x < tx + tw; x++) if (rg.chance(0.4)) gset(map, x, ty, tid('CROP_CABBAGE', 'FARMLAND'));
    for (let x = tx; x < tx + tw; x += 3) prop(map, x, ty + 1, tid('STONE_FENCE', 'FENCE_H'), res);
  }
  for (let y = 29; y <= 32; y++) floor(map, 20, y, tid('DIRT', 'GRAVEL'));

  // --- what the githyanki left ---------------------------------------------
  for (const [px, py] of [[17, 30], [30, 30], [12, 24], [36, 24]]) {
    prop(map, px, py, tid('SKULL_PILE', 'BONES'), res);
    gset(map, px, py + 1, tid('ASH_GROUND', 'DIRT'));
  }
  floorRect(map, 27, 31, 6, 3, tid('ASH_GROUND', 'DIRT'));
  prop(map, 29, 32, tid('BRAZIER', 'TORCH'), res);
  prop(map, 31, 31, tid('CRATE', 'BARREL'), res);
  signpost(map, 26, 32, 'A camp on the terrace: no tents, no bedding, a fire burned down to white ash and a rack of blades stacked with a soldier’s care. Whatever holds this place does not sleep here. It waits here.', res);

  scatter(map, rd, 1, 6, 12, 22, table([['ROCK', 6], ['BOULDER', 3], ['RUBBLE', 3], ['DEAD_TREE', 1]]), 0.12, res);
  scatter(map, rd, 36, 28, 8, 8, table([['ROCK', 6], ['BOULDER', 3], ['RUBBLE', 2]]), 0.14, res);
  signpost(map, 4, 22, 'ROSYMORN MONASTERY OF THE DAWN. Under the carved sun somebody has scratched, in a hand that is not Common and not Elvish: TURN BACK. It is a courtesy. Read it as one.', res);

  openThickets(map, { x: 3, y: 20 }, 5, res);
  map.recomputeFlags({ keep: 0 });
  sealBorder(map, tid('MOUNTAIN', 'CLIFF'));
  sweepStanding(map, npcs);
  map.spawn = { x: 3, y: 20 };
  map.entry = { ...map.spawn };
  map.level = 12;
  // The hall door: the way down into the cloister. maps.js stamps the A-side of
  // a `bWarp: null` row for nobody, so it is stamped here.
  siteMouth(map, 24, 14, 'rosymorn-cloister', { dir: 'down', kind: 'stairs', theme: 'dungeon', tile: null });
  addSign(map, 24, 16, 'The hall doors stand open. Inside, cold air, a floor of swept flagstones, and the smell of a forge somebody has been using.');
  map.addTrigger({
    id: 'rosymorn-crags', kind: 'encounter-zone', x: 1, y: 6, w: 44, h: 30,
    data: { table: 'griffon-crag', rate: 0.05, biome: 'mountain' },
  });
  return map;
}

// ---------------------------------------------------------------------------
// 7. ULGOTH'S BEARD
// ---------------------------------------------------------------------------
//
// Canon: a fishing village on the coast north-east of Baldur's Gate, and the
// place you take ship for the isles. A dozen cottages, a shipwright's yard and
// a quay — nothing walled, nothing planned, everything angled at the water.

function buildUlgothsBeard(root) {
  const map = new TileMap({
    w: 44, h: 36, id: 'ulgoths-beard', name: 'Ulgoth’s Beard', biome: 'coast',
    indoor: false, music: 'coast', safe: true, encounterRate: 0, region: 'ulgoths-beard',
  });
  const { npcs, res } = reserve('ulgoths-beard');
  const rg = root.fork('ground');
  const rd = root.fork('detail');

  // Coast turf, with the strand blown up into it in drifts rather than sprayed
  // over it tile by tile.
  groundNoise(map, rg, 0, 0, 44, 36, table([['GRASS_4', 7], ['GRASS', 5], ['CLOVER', 2]]));
  patches(map, rg, 1, 1, 42, 34, table([['SAND', 7], ['GRAVEL', 2]]), 11, 5, 20);
  patches(map, rg, 1, 1, 42, 34, table([['DIRT', 5], ['GRAVEL', 3]]), 6, 4, 12);

  // --- the sea, west and north ---------------------------------------------
  for (let y = 0; y < 36; y++) {
    const edge = 9 + Math.round(Math.sin(y * 0.24) * 2) + (y < 8 ? 4 : 0);
    for (let x = 0; x < edge - 3; x++) gset(map, x, y, tid('WATER_DEEP', 'WATER'));
    for (let x = Math.max(0, edge - 3); x < edge; x++) gset(map, x, y, tid('WATER', 'WATER_DEEP'));
    for (let x = edge; x < edge + 2; x++) gset(map, x, y, pickT(rg, table(T_STRAND)));
    if (rg.chance(0.25)) prop(map, edge + 1, y, tid('DRIFTWOOD', 'ROCK'), res);
    if (rg.chance(0.18)) prop(map, edge, y, tid('REEDS', 'CATTAILS'), res);
  }

  // --- the quay and the shipwright's yard ----------------------------------
  floorRect(map, 8, 20, 6, 3, tid('BRIDGE_WOOD', 'WOOD_FLOOR_H'));
  floorRect(map, 8, 26, 6, 3, tid('BRIDGE_WOOD', 'WOOD_FLOOR_H'));
  floorRect(map, 13, 18, 4, 14, tid('GRAVEL', 'SAND'));
  for (const [px, py] of [[13, 19], [14, 24], [13, 30], [16, 21], [16, 28]]) prop(map, px, py, tid('BARREL', 'CRATE'), res);
  prop(map, 15, 19, tid('CRATE', 'BARREL'), res);
  prop(map, 15, 31, tid('SACK', 'CRATE'), res);
  // the half-built hull on its stocks
  floorRect(map, 12, 12, 8, 5, tid('SAND', 'GRAVEL'));
  for (const px of [13, 15, 17]) { prop(map, px, 12, tid('TIMBER_SUPPORT', 'STUMP'), res); prop(map, px, 16, tid('TIMBER_SUPPORT', 'STUMP'), res); }
  for (let x = 13; x <= 18; x++) prop(map, x, 14, tid('LOG_WALL', 'TIMBER_SUPPORT'), res);
  prop(map, 19, 13, tid('LADDER', 'TIMBER_SUPPORT'), res);
  prop(map, 12, 17, tid('GRINDSTONE', 'ROCK'), res);
  signpost(map, 20, 15, 'BRAN’S YARD — a coaster half-planked on her stocks, and no money to finish her since the Gate started taxing hulls by the ton.', res);

  // --- the street ----------------------------------------------------------
  const road = table(T_TOWNROAD);
  for (let x = 14; x <= 42; x++) for (let y = 17; y <= 19; y++) floor(map, x, y, pickT(rg, road));
  for (let y = 12; y <= 32; y++) for (let x = 20; x <= 21; x++) floor(map, x, y, pickT(rg, road));
  for (let x = 17; x <= 34; x++) floor(map, x, 24, pickT(rg, road));
  for (let y = 19; y <= 24; y++) floor(map, 33, y, pickT(rg, road));

  // --- the Sea Bounty ------------------------------------------------------
  building(map, {
    x: 16, y: 11, w: 9, h: 6, wall: 'STONE_WALL', roof: 'thatch', base: 'GRAVEL', lit: true,
    roofRows: 3, door: 4, windows: [1, 2, 7], upper: [3, 6], sign: 6, band: 3,
    chimney: 1, chimney2: 7, approach: 1, roofPatch: [[5, 1], [6, 2]], patchTile: 'SHINGLE_M',
    porch: 3, lantern: true,
  }, res);                                       // ulgoths-beard-inn (20,16)
  prop(map, 25, 17, tid('BARREL', 'CRATE'), res);
  prop(map, 15, 17, tid('BENCH', 'CRATE'), res);
  prop(map, 26, 16, tid('CRATE', 'BARREL'), res);

  // --- the cottages, all facing the water ----------------------------------
  building(map, { x: 24, y: 20, w: 6, h: 4, wall: 'WATTLE_WALL', roof: 'thatch', base: 'GRAVEL', roofRows: 2, windows: [1, 4], chimney: 4 }, res);
  building(map, { x: 35, y: 13, w: 6, h: 5, wall: 'WATTLE_WALL', roof: 'thatch', base: 'GRAVEL', roofRows: 2, windows: [1, 4], chimney: 1 }, res);
  building(map, { x: 24, y: 27, w: 7, h: 5, wall: 'LOG_WALL', roof: 'thatch', base: 'GRAVEL', roofRows: 3, windows: [1, 5], chimney: 5 }, res);
  building(map, { x: 35, y: 21, w: 6, h: 4, wall: 'WATTLE_WALL', roof: 'shingle', base: 'GRAVEL', roofRows: 2, windows: [1, 4], chimney: 4 }, res);
  shell(map, { x: 15, y: 27, w: 4, h: 4, wall: 'LOG_WALL', roof: 'thatch', base: 'SAND', roofRows: 2, windows: [1, 2], loading: [1, 2] }, res);
  building(map, { x: 35, y: 28, w: 6, h: 4, wall: 'WATTLE_WALL', roof: 'thatch', base: 'GRAVEL', roofRows: 2, windows: [1, 4], chimney: 1 }, res);

  // --- the drying racks, which is what a fishing village actually looks like
  for (const [nx, ny] of [[27, 12], [30, 32], [22, 33]]) {
    for (let i = 0; i < 4; i++) prop(map, nx + i, ny, tid('FENCE_H', 'HEDGE'), res);
    prop(map, nx, ny + 1, tid('FENCE_V', 'HEDGE'), res);
    prop(map, nx + 3, ny + 1, tid('FENCE_V', 'HEDGE'), res);
  }
  prop(map, 31, 20, tid('WELL', 'FOUNTAIN'), res);
  prop(map, 42, 18, tid('SIGN', 'ROCK'), res);
  for (const [px, py] of [[19, 25], [23, 25], [28, 25], [32, 25]]) prop(map, px, py, tid('BENCH', 'CRATE'), res);
  scatter(map, rd, 34, 1, 10, 10, table([['TREE_PINE', 5], ['BUSH', 4], ['ROCK', 3]]), 0.3, res);
  scatter(map, rd, 22, 33, 20, 3, table([['BUSH', 4], ['ROCK', 3], ['GRASS_TALL', 4]]), 0.2, res);
  bigPine(map, 38, 4); bigPine(map, 30, 3);

  openThickets(map, { x: 40, y: 18 }, 5, res);
  map.recomputeFlags({ keep: 0 });
  sealBorder(map, tid('TREE_PINE', 'BLACK'));
  sweepStanding(map, npcs);
  map.spawn = { x: 40, y: 18 };
  map.entry = { ...map.spawn };
  map.level = 10;

  addSign(map, 42, 18, 'ULGOTH’S BEARD. Fish, boats, and passage to the isles when the wind allows it. Nobody here has ever heard of your business and nobody intends to.');
  addSign(map, 31, 20, 'The village well. Brackish two days in ten, when the tide is very high and the wind is in the west.');
  addSign(map, 22, 17, 'THE SEA BOUNTY — Westra Helder. Beds, fish stew, and a slate behind the bar with every debt in the village on it.');
  map.addTrigger({ id: 'ulgoths-beard-quay', kind: 'sign', x: 11, y: 21, data: { text: 'The quay. Two coasters and a longboat, and a chalked board of sailings: the isles on the ebb, the Gate when there is cargo, and nothing at all if the glass is falling.' } });
  map.addTrigger({ id: 'ulgoths-beard-rest', kind: 'inn', x: 20, y: 17, data: { shop: 'sea-bounty', cost: 5, npc: 'westra-helder' } });
  return map;
}

function buildUlgothsBeardInn(root) {
  const map = interiorMap({ id: 'ulgoths-beard-inn', name: 'The Sea Bounty', w: 22, h: 16, music: 'inn', region: 'ulgoths-beard' });
  const { npcs, res } = reserve('ulgoths-beard-inn');
  const r = root.fork('bounty');
  const rm = room(map, {
    w: 22, h: 16, floor: 'WOOD_FLOOR', wall: 'STONE_WALL', exit: 11,
    rooms: [{ x: 0, y: 0, w: 6, h: 6, door: 'e', name: 'kitchen' }],
  });

  for (let x = 7; x <= 13; x++) prop(map, x, 4, tid('BAR', 'COUNTER'), res);
  for (let x = 6; x <= 14; x++) prop(map, x, 1, tid('SHELF_GOODS', 'BOOKSHELF'), res);
  prop(map, 1, 5, tid('HEARTH', 'BRAZIER'), res);
  prop(map, 1, 6, tid('HEARTH', 'BRAZIER'), res);
  prop(map, 1, 8, tid('COOKING_POT', 'BARREL'), res);
  floorRect(map, 2, 4, 3, 5, tid('CARPET_BLUE', 'WOOD_FLOOR'));
  const tableAt = seating(map, r, res);
  tableAt(5, 11); tableAt(10, 8, 3); tableAt(16, 11); tableAt(17, 7); tableAt(7, 14, 2);
  for (const [px, py] of [[19, 4], [2, 13], [3, 13], [20, 13], [19, 12]]) prop(map, px, py, pickT(r, table([['BARREL', 5], ['CRATE', 4], ['SACK', 3]])), res);
  prop(map, 19, 5, tid('DRIFTWOOD', 'CRATE'), res);
  floor(map, 20, 1, tid('STAIRS_UP', 'WOOD_FLOOR'));
  floor(map, 20, 2, tid('WOOD_FLOOR_H', 'WOOD_FLOOR'));
  prop(map, 19, 1, tid('BED', 'BENCH'), res);
  oset(map, 10, 6, tid('CHANDELIER', 'CANDLE'));
  oset(map, 5, 3, tid('CHANDELIER', 'CANDLE'));

  finishInterior(map, rm.exit, npcs, 'STONE_WALL');
  map.addTrigger({ id: 'sea-bounty-rest', kind: 'rest', x: 20, y: 2, w: 1, h: 1, data: { inn: true, cost: 5, text: 'A room under the thatch that smells of tar and fish, and a bed that has never once been cold. Rest here?' } });
  map.addTrigger({ id: 'sea-bounty-shop', kind: 'shop', x: 10, y: 5, data: { shop: 'sea-bounty', npc: 'westra-helder' } });
  return map;
}

// ---------------------------------------------------------------------------
// 8. THE FRIENDLY ARM
// ---------------------------------------------------------------------------
//
// Canon: a walled hamlet built round a stone keep that a Bhaalite priest raised
// and Bentley Mirrorshade took off him. The safest bed on the Coast Way, and the
// shape says so: one curtain wall, one gate at each end, one keep, one shrine,
// and everything else is yard you can see across.

function buildFriendlyArmInn(root) {
  const map = new TileMap({
    w: 44, h: 36, id: 'friendly-arm-inn', name: 'The Friendly Arm', biome: 'plains',
    indoor: false, music: 'village', safe: true, encounterRate: 0, region: 'coast-way',
  });
  const { npcs, res } = reserve('friendly-arm-inn');
  const rg = root.fork('ground');
  const rd = root.fork('detail');
  const ruts = table(T_RUTS);
  const cob = table(T_STONEROAD);

  groundNoise(map, rg, 0, 0, 44, 36, table(T_DOWNS));
  scatter(map, rg, 0, 0, 44, 6, table(T_SCRUB), 0.16, res);
  scatter(map, rg, 0, 31, 44, 5, table(T_SCRUB), 0.16, res);
  scatter(map, rg, 0, 6, 5, 25, table(T_SCRUB), 0.2, res);
  scatter(map, rg, 39, 6, 5, 25, table(T_SCRUB), 0.2, res);
  bigOak(map, 3, 12); bigOak(map, 40, 24);

  // --- the road through ----------------------------------------------------
  for (let y = 1; y <= 34; y++) for (let x = 21; x <= 23; x++) floor(map, x, y, pickT(rg, ruts));

  // --- the curtain wall ----------------------------------------------------
  // Bentley keeps a swept cobbled bailey. Gravel and dirt only where the
  // cobble has gone, in patches you can see the shape of.
  floorRect(map, 6, 7, 32, 24, tid('COBBLE', 'FLAGSTONE'));
  groundNoise(map, rg, 7, 8, 30, 22, table([['COBBLE', 9], ['COBBLE', 4]]));
  patches(map, rg, 7, 8, 30, 22, table([['GRAVEL', 6], ['DIRT', 2]]), 9, 4, 14);
  curtain(map, 6, 7, 32, 24, { key: 'STONE_WALL', base: 'GRAVEL', res });
  gateway(map, 22, 7, 9, tid('COBBLE', 'FLAGSTONE'), { half: 1, gateRow: 8, torchRow: 9 });
  gateway(map, 22, 29, 30, tid('COBBLE', 'FLAGSTONE'), { half: 1, gateRow: 30, torchRow: 29 });
  for (const [px, py] of [[7, 8], [37, 8], [7, 29], [37, 29]]) dset(map, px, py, tid('PILLAR', 'STONE_WALL'));

  // --- the keep ------------------------------------------------------------
  // Three storeys of Bhaalite stonework, and the party sleeps in it.
  building(map, {
    x: 12, y: 9, w: 11, h: 8, wall: 'STONE_WALL', roof: 'tile', base: 'FLAGSTONE', lit: true,
    roofRows: 3, door: 8, windows: [1, 2, 3, 9], upper: [4, 6, 9], band: 4,
    sign: 6, chimney: 1, chimney2: 9, approach: 1, step: 'FLAGSTONE',
  }, res);                                       // friendly-arm-common (20,16)
  for (const [px, py] of [[12, 9], [22, 9]]) dset(map, px, py, tid('PILLAR', 'STONE_WALL'));
  prop(map, 11, 17, tid('BENCH', 'CRATE'), res);
  prop(map, 24, 17, tid('BENCH', 'CRATE'), res);
  prop(map, 11, 16, tid('BRAZIER', 'TORCH'), res);
  prop(map, 24, 16, tid('BRAZIER', 'TORCH'), res);

  // --- Garl Glittergold's shrine ------------------------------------------
  building(map, {
    x: 27, y: 12, w: 7, h: 5, wall: 'STONE_WALL', roof: 'shingle', base: 'FLAGSTONE', lit: true,
    roofRows: 2, door: 3, windows: [1, 5], sign: 4, peak: 3, approach: 1, step: 'FLAGSTONE',
  }, res);                                       // garl-shrine (30,16)
  prop(map, 26, 17, tid('SHRINE', 'STATUE'), res);
  prop(map, 35, 15, tid('CRYSTAL', 'STATUE'), res);
  prop(map, 35, 13, tid('CANDLE', 'TORCH'), res);
  prop(map, 34, 17, tid('HEDGE', 'BUSH'), res);

  // --- the yard ------------------------------------------------------------
  floorRect(map, 8, 19, 28, 9, tid('COBBLE', 'FLAGSTONE'));
  groundNoise(map, rg, 8, 19, 28, 9, table([['COBBLE', 9], ['COBBLE', 4]]));
  patches(map, rg, 8, 19, 28, 9, table([['GRAVEL', 6], ['DIRT', 3]]), 6, 4, 12);
  prop(map, 18, 22, tid('WELL', 'FOUNTAIN'), res);
  prop(map, 27, 22, tid('BRAZIER', 'TORCH'), res);
  prop(map, 27, 23, tid('COOKING_POT', 'BARREL'), res);
  for (const [px, py] of [[9, 20], [10, 21], [9, 26], [34, 20], [35, 25], [33, 27]]) prop(map, px, py, pickT(rd, table([['CRATE', 5], ['BARREL', 4], ['SACK', 3], ['CART', 2]])), res);
  // Wagons drawn up along the east wall, and a rail to tie to. Kept to one side
  // on purpose: the shape of this place is a bailey you can see straight across,
  // which is the whole reason it is the safest bed on the Coast Way, so the
  // clutter goes against the wall and the middle stays open.
  for (let n = 0; n < 3; n++) {
    const wy = 20 + n * 3;
    prop(map, 32, wy, tid('CART', 'CRATE'), res);
    prop(map, 33, wy, pickT(rd, table([['BARREL', 5], ['SACK', 4], ['CRATE', 3]])), res);
  }
  for (let x = 9; x <= 15; x++) prop(map, x, 27, tid('FENCE_H', 'STONE_FENCE'), res);
  prop(map, 12, 26, tid('SACK', 'CRATE'), res);
  prop(map, 20, 26, tid('BENCH', 'CRATE'), res);
  prop(map, 24, 26, tid('BENCH', 'CRATE'), res);
  for (const [px, py] of [[13, 26], [17, 26], [25, 26], [30, 26]]) prop(map, px, py, tid('BENCH', 'CRATE'), res);
  shell(map, { x: 8, y: 22, w: 4, h: 4, wall: 'LOG_WALL', roof: 'thatch', base: 'DIRT', roofRows: 2, loading: [1, 2], windows: [1, 2] }, res);
  shell(map, { x: 32, y: 9, w: 5, h: 4, wall: 'LOG_WALL', roof: 'thatch', base: 'DIRT', roofRows: 2, loading: [1, 3], windows: [1, 3] }, res);
  floorRect(map, 8, 27, 5, 2, tid('MUD', 'DIRT'));
  fenceRect(map, 8, 27, 5, 2, { x: 12, y: 28 }, res);
  prop(map, 15, 20, tid('CART', 'CRATE'), res);
  prop(map, 31, 20, tid('CART', 'CRATE'), res);

  openThickets(map, { x: 22, y: 3 }, 5, res);
  map.recomputeFlags({ keep: 0 });
  sealBorder(map, tid('TREE_OAK', 'BLACK'));
  sweepStanding(map, npcs);
  map.spawn = { x: 22, y: 3 };
  map.entry = { ...map.spawn };
  map.level = 12;

  signpost(map, 19, 4, 'THE FRIENDLY ARM — beds, board and a wall. Gnome-kept and gnome-priced. The gate shuts at midnight and Bentley opens it for nobody, including you.', res);
  signpost(map, 25, 33, 'SOUTH: BEREGOST, a day and a half. Four inns and a temple, and the road between here and there is not as safe as this yard.', res);
  addSign(map, 18, 16, 'THE FRIENDLY ARM INN. The keep was raised by a priest of Bhaal; the gnome who owns it now has scrubbed every altar out of it and put a bar where the worst one stood.');
  addSign(map, 31, 16, 'THE SHRINE OF GARL GLITTERGOLD. Gellana Mirrorshade officiates, heals, and will tell you a joke you will not understand until three days later.');
  addSign(map, 18, 22, 'The yard well. Bentley had it re-dug when he took the keep — the old one had things in it he would not describe.');
  map.addTrigger({ id: 'friendly-arm-rest', kind: 'inn', x: 20, y: 17, data: { shop: 'friendly-arm-common', cost: 12, npc: 'bentley-mirrorshade' } });
  return map;
}

function buildFriendlyArmCommon(root) {
  const map = interiorMap({ id: 'friendly-arm-common', name: 'The Friendly Arm Inn', w: 26, h: 20, music: 'inn', region: 'coast-way' });
  const { npcs, res } = reserve('friendly-arm-common');
  const r = root.fork('arm');
  const rm = room(map, {
    w: 26, h: 20, floor: 'WOOD_FLOOR', wall: 'STONE_WALL', exit: 13,
    rooms: [
      { x: 0, y: 2, w: 6, h: 7, door: 'e', name: 'kitchen' },
      { x: 20, y: 13, w: 6, h: 7, door: 'w', floor: 'CARPET_RED', name: 'private room' },
    ],
  });

  // A keep's hall converted: pillars down the middle where the vault needs them.
  for (const py of [6, 10, 14]) { prop(map, 7, py, tid('PILLAR', 'STONE_WALL'), res); prop(map, 18, py, tid('PILLAR', 'STONE_WALL'), res); }
  for (let x = 10; x <= 16; x++) prop(map, x, 4, tid('BAR', 'COUNTER'), res);
  for (let x = 9; x <= 17; x++) prop(map, x, 1, tid('SHELF_GOODS', 'BOOKSHELF'), res);
  prop(map, 8, 1, tid('BARREL', 'CRATE'), res);
  prop(map, 18, 1, tid('BARREL', 'CRATE'), res);
  prop(map, 1, 6, tid('HEARTH', 'BRAZIER'), res);
  prop(map, 1, 7, tid('HEARTH', 'BRAZIER'), res);
  prop(map, 1, 9, tid('COOKING_POT', 'BARREL'), res);
  floorRect(map, 2, 5, 4, 6, tid('CARPET_RED', 'WOOD_FLOOR'));

  // The safest bed on the Coast Way is also the busiest: three long trestles.
  const tableAt = seating(map, r, res);
  tableAt(4, 14); tableAt(10, 8, 3); tableAt(15, 12); tableAt(20, 8, 2); tableAt(21, 15); tableAt(9, 16, 3);
  tableAt(6, 11); tableAt(17, 17);
  prop(map, 13, 15, tid('BARREL', 'CRATE'), res);
  prop(map, 3, 12, tid('CRATE', 'BARREL'), res);
  prop(map, 24, 12, tid('BARREL', 'CRATE'), res);
  prop(map, 24, 4, tid('BOOKSHELF', 'SHELF_GOODS'), res);
  prop(map, 24, 11, tid('BARREL', 'CRATE'), res);
  prop(map, 2, 17, tid('BENCH', 'CHAIR'), res);
  floor(map, 24, 1, tid('STAIRS_UP', 'WOOD_FLOOR'));
  floor(map, 24, 2, tid('WOOD_FLOOR_H', 'WOOD_FLOOR'));
  prop(map, 23, 1, tid('BED', 'BENCH'), res);
  floor(map, 2, 1, tid('STAIRS_DOWN', 'WOOD_FLOOR'));   // the cellar Bentley never opened
  oset(map, 12, 7, tid('CHANDELIER', 'CANDLE'));
  oset(map, 20, 12, tid('CHANDELIER', 'CANDLE'));
  oset(map, 6, 12, tid('CHANDELIER', 'CANDLE'));

  finishInterior(map, rm.exit, npcs, 'STONE_WALL');
  map.addTrigger({ id: 'friendly-arm-cellar', kind: 'sign', x: 2, y: 1, data: { text: 'A stair down into the old undercroft, boarded across at the fourth step and nailed. The nails are new. Bentley will change the subject twice and then stop answering.' } });
  map.addTrigger({ id: 'friendly-arm-common-rest', kind: 'rest', x: 24, y: 2, w: 1, h: 1, data: { inn: true, cost: 12, text: 'A room in a keep with a wall round it, a bar on the door and a gnome downstairs who does not sleep. The best rest on the Coast Way. Rest here?' } });
  map.addTrigger({ id: 'friendly-arm-common-shop', kind: 'shop', x: 13, y: 5, data: { shop: 'friendly-arm-common', npc: 'bentley-mirrorshade' } });
  return map;
}

function buildGarlShrine(root) {
  const map = interiorMap({
    id: 'garl-shrine', name: 'The Shrine of Garl Glittergold', w: 18, h: 14, music: 'temple',
    region: 'coast-way', ambient: { color: '#33280f', alpha: 0.1 },
  });
  const { npcs, res } = reserve('garl-shrine');
  const r = root.fork('garl');
  const rm = room(map, { w: 18, h: 14, floor: 'STONE_FLOOR', wall: 'STONE_WALL', exit: 9, step: 'MOSAIC' });

  floorRect(map, 6, 2, 6, 9, tid('MOSAIC', 'STONE_FLOOR'));
  prop(map, 9, 2, tid('ALTAR', 'SHRINE'), res);
  prop(map, 8, 2, tid('CRYSTAL', 'CANDLE'), res);
  prop(map, 10, 2, tid('CRYSTAL', 'CANDLE'), res);
  prop(map, 9, 1, tid('STATUE', 'SHRINE'), res);
  for (const py of [5, 8]) { prop(map, 4, py, tid('BENCH', 'CHAIR'), res); prop(map, 13, py, tid('BENCH', 'CHAIR'), res); }
  for (const px of [1, 16]) for (const py of [4, 9]) prop(map, px, py, tid('CANDLE', 'TORCH'), res);
  prop(map, 2, 2, tid('BOOKSHELF', 'SHELF_GOODS'), res);
  prop(map, 15, 2, tid('SHELF_GOODS', 'BOOKSHELF'), res);
  prop(map, 2, 11, tid('BRAZIER', 'TORCH'), res);
  prop(map, 15, 11, tid('BRAZIER', 'TORCH'), res);
  if (r.chance(1)) oset(map, 9, 6, tid('CHANDELIER', 'CANDLE'));

  finishInterior(map, rm.exit, npcs, 'STONE_WALL');
  map.addTrigger({ id: 'garl-shrine-shop', kind: 'shop', x: 9, y: 3, data: { shop: 'garl-shrine', npc: 'gellana-mirrorshade' } });
  return map;
}

// ---------------------------------------------------------------------------
// 9. BEREGOST
// ---------------------------------------------------------------------------
//
// Canon: an unwalled town on the Coast Way with four inns, a smithy and one very
// large temple. It is the southern Phandalin in function and nothing like it in
// shape — Phandalin is a crossroads, Beregost is a HIGH STREET. Everything
// fronts one long north-south road, the side roads go west to Candlekeep and
// east to High Hedge, and the Song of the Morning stands off the south end of it
// with a forecourt of its own, because a temple that shares a frontage with an
// inn is not a temple anybody walks to.
//
//  y  1     the Coast Way in from the Friendly Arm
//  y  9-14  [ Feldepost's ]                    [ the Jovial Juggler ]
//  y 15-16  the north lane
//  y 19-21  ================ EAST: HIGH HEDGE =================
//  y 20-24  [ Thunderhammer Smithy ]
//  y 25-27  ====== WEST: CANDLEKEEP ======
//  y 28-32  [ the Burning Wizard ]     [ THE SONG OF THE MORNING ]
//  y 33-34  the south lane
//  y 46     the Coast Way on to Nashkel

function buildBeregost(root) {
  const map = new TileMap({
    w: 60, h: 48, id: 'beregost', name: 'Beregost', biome: 'city',
    indoor: false, music: 'town', safe: true, encounterRate: 0, region: 'beregost',
  });
  const { npcs, res } = reserve('beregost');
  const rg = root.fork('ground');
  const rd = root.fork('detail');
  const cob = table(T_STONEROAD);
  const road = table(T_TOWNROAD);

  groundNoise(map, rg, 0, 0, 60, 48, table(T_GRASS));

  // --- the roads -----------------------------------------------------------
  for (let y = 1; y <= 46; y++) for (let x = 28; x <= 32; x++) floor(map, x, y, pickT(rg, y > 6 && y < 40 ? cob : road));
  for (let x = 31; x <= 58; x++) for (let y = 19; y <= 21; y++) floor(map, x, y, pickT(rg, road));   // east, High Hedge
  for (let x = 1; x <= 30; x++) for (let y = 25; y <= 27; y++) floor(map, x, y, pickT(rg, road));    // west, Candlekeep
  for (let x = 2; x <= 6; x++) for (let y = 23; y <= 24; y++) floor(map, x, y, pickT(rg, road));     // and the mouth widens
  for (let x = 10; x <= 48; x++) for (let y = 15; y <= 16; y++) floor(map, x, y, pickT(rg, cob));    // the north lane
  for (let x = 10; x <= 52; x++) for (let y = 33; y <= 34; y++) floor(map, x, y, pickT(rg, cob));    // the south lane
  for (let y = 16; y <= 33; y++) { floor(map, 10, y, pickT(rg, cob)); floor(map, 11, y, pickT(rg, cob)); }
  for (let y = 21; y <= 33; y++) { floor(map, 47, y, pickT(rg, cob)); floor(map, 48, y, pickT(rg, cob)); }

  // --- the four inns and the smithy ---------------------------------------
  building(map, {
    x: 11, y: 9, w: 11, h: 6, wall: 'STONE_WALL', roof: 'tile', base: 'COBBLE', lit: true,
    roofRows: 2, door: 5, windows: [1, 2, 3, 8, 9], upper: [4, 7, 9], sign: 7, band: 3,
    chimney: 1, chimney2: 9, approach: 1, porch: 3, lantern: true,
  }, res);                                       // Feldepost's Inn (16,14)
  building(map, {
    x: 36, y: 10, w: 9, h: 5, wall: 'WATTLE_WALL', roof: 'thatch', base: 'COBBLE', lit: true,
    roofRows: 2, door: 4, windows: [1, 2, 7], sign: 6, chimney: 7, approach: 1, porch: 3, lantern: true,
  }, res);                                       // The Jovial Juggler (40,14)
  building(map, {
    x: 21, y: 20, w: 8, h: 5, wall: 'STONE_WALL', roof: 'shingle', base: 'GRAVEL',
    roofRows: 2, door: 5, windows: [1, 6], sign: 2, chimney: 1, approach: 1, porch: 3,
  }, res);                                       // Thunderhammer Smithy (26,24)
  prop(map, 20, 25, tid('ANVIL', 'FORGE'), res);
  prop(map, 19, 24, tid('FORGE', 'ANVIL'), res);
  prop(map, 19, 22, tid('GRINDSTONE', 'ROCK'), res);
  prop(map, 30, 24, tid('ORE_IRON', 'ROCK'), res);
  prop(map, 30, 22, tid('CRATE', 'BARREL'), res);
  building(map, {
    x: 12, y: 28, w: 9, h: 5, wall: 'LOG_WALL', roof: 'thatch', base: 'COBBLE',
    roofRows: 3, door: 4, shutters: [1, 7], sign: 2, chimney: 1, approach: 1,
    roofPatch: [[4, 2], [5, 2]], patchTile: 'TILE_ROOF',
  }, res);                                       // The Burning Wizard (16,32)
  prop(map, 11, 33, tid('BARREL', 'CRATE'), res);
  prop(map, 22, 32, tid('BONES', 'RUBBLE'), res);

  // --- the Song of the Morning --------------------------------------------
  // The great temple of Lathander south of Beregost. Its forecourt is mosaic,
  // its face is a colonnade, and it is twice the height of anything else here.
  floorRect(map, 36, 33, 17, 4, tid('MOSAIC', 'FLAGSTONE'));
  building(map, {
    x: 38, y: 24, w: 13, h: 9, wall: 'STONE_WALL', roof: 'tile', base: 'FLAGSTONE', lit: true,
    roofRows: 4, door: 6, windows: [1, 2, 10, 11], upper: [4, 6, 8], band: 5,
    peak: 6, chimney: 1, chimney2: 11, approach: 1, step: 'MOSAIC',
  }, res);                                       // Song of the Morning (44,32)
  for (let x = 38; x <= 50; x += 3) prop(map, x, 34, tid('PILLAR', 'STONE_WALL'), res);
  prop(map, 41, 34, tid('STATUE', 'PILLAR'), res);
  prop(map, 47, 34, tid('STATUE', 'PILLAR'), res);
  prop(map, 37, 33, tid('BRAZIER', 'TORCH'), res);
  prop(map, 51, 33, tid('BRAZIER', 'TORCH'), res);
  prop(map, 44, 36, tid('FOUNTAIN', 'WELL'), res);
  for (const py of [36, 38]) { prop(map, 39, py, tid('BENCH', 'CHAIR'), res); prop(map, 49, py, tid('BENCH', 'CHAIR'), res); }
  for (const [px, py] of [[36, 38], [52, 38], [36, 30], [52, 30]]) prop(map, px, py, tid('HEDGE', 'BUSH'), res);
  bigOak(map, 53, 36); bigOak(map, 34, 37);

  // --- the Red Sheaf, and the houses --------------------------------------
  shell(map, { x: 45, y: 15, w: 8, h: 5, wall: 'WATTLE_WALL', roof: 'thatch', base: 'COBBLE', roofRows: 2, door: 4, windows: [1, 6], sign: 2 }, res);
  signpost(map, 49, 21, 'THE RED SHEAF — shuttered since the winter. A bill on the door in the Beregost hand: CLOSED BY ORDER, RENT UNPAID, ENQUIRE OF KELDDATH ORMLYR.', res);
  building(map, { x: 3, y: 16, w: 6, h: 5, wall: 'WATTLE_WALL', roof: 'thatch', base: 'DIRT', roofRows: 2, windows: [1, 4], chimney: 4 }, res);
  building(map, { x: 3, y: 29, w: 6, h: 4, wall: 'WATTLE_WALL', roof: 'shingle', base: 'DIRT', roofRows: 2, windows: [1, 4], chimney: 1 }, res);
  building(map, { x: 22, y: 9, w: 5, h: 6, wall: 'LOG_WALL', roof: 'thatch', base: 'COBBLE', roofRows: 3, windows: [1, 3], chimney: 3 }, res);
  building(map, { x: 33, y: 20, w: 6, h: 4, wall: 'WATTLE_WALL', roof: 'thatch', base: 'COBBLE', roofRows: 2, windows: [1, 4], chimney: 4 }, res);
  building(map, { x: 22, y: 29, w: 5, h: 4, wall: 'WATTLE_WALL', roof: 'shingle', base: 'COBBLE', roofRows: 2, windows: [1, 3], chimney: 1 }, res);
  building(map, { x: 41, y: 4, w: 7, h: 5, wall: 'WATTLE_WALL', roof: 'thatch', base: 'DIRT', roofRows: 2, windows: [1, 5], chimney: 5 }, res);
  building(map, { x: 14, y: 4, w: 6, h: 4, wall: 'WATTLE_WALL', roof: 'thatch', base: 'DIRT', roofRows: 2, windows: [1, 4], chimney: 1 }, res);
  building(map, { x: 20, y: 38, w: 7, h: 5, wall: 'WATTLE_WALL', roof: 'thatch', base: 'DIRT', roofRows: 3, windows: [1, 5], chimney: 5 }, res);
  building(map, { x: 33, y: 40, w: 6, h: 4, wall: 'LOG_WALL', roof: 'thatch', base: 'DIRT', roofRows: 2, windows: [1, 4], chimney: 4 }, res);

  // --- the town's furniture ------------------------------------------------
  prop(map, 27, 17, tid('WELL', 'FOUNTAIN'), res);
  for (const [px, py] of [[24, 16], [34, 16], [24, 34], [40, 34], [27, 19], [33, 27]]) prop(map, px, py, tid('BRAZIER', 'TORCH'), res);
  for (let x = 34; x <= 44; x += 2) { prop(map, x, 17, pickT(rd, table(T_STALL)), res); }
  floorRect(map, 33, 16, 14, 3, tid('FLAGSTONE', 'COBBLE'));
  for (let x = 34; x <= 44; x += 2) { prop(map, x, 18, pickT(rd, table(T_STALL)), res); }
  prop(map, 10, 22, tid('BENCH', 'CRATE'), res);
  prop(map, 47, 26, tid('BENCH', 'CRATE'), res);
  prop(map, 23, 15, tid('CART', 'CRATE'), res);
  prop(map, 45, 14, tid('CART', 'CRATE'), res);
  prop(map, 12, 26, tid('BARREL', 'CRATE'), res);
  prop(map, 21, 33, tid('CRATE', 'BARREL'), res);
  prop(map, 9, 17, tid('SACK', 'CRATE'), res);

  // --- fields and orchards round the edges ---------------------------------
  for (const [fx, fy, fw, fh] of [[2, 38, 12, 6], [44, 41, 13, 5], [50, 4, 8, 8]]) {
    floorRect(map, fx, fy, fw, fh, tid('FARMLAND', 'DIRT'));
    for (let y = fy; y < fy + fh; y++) for (let x = fx; x < fx + fw; x++) gset(map, x, y, tid(rg.chance(0.6) ? 'CROP_WHEAT' : 'CROP_CABBAGE', 'FARMLAND'));
    fenceRect(map, fx - 1, fy - 1, fw + 2, fh + 2, { x: fx + (fw >> 1), y: fy - 1 }, res);
  }
  scatter(map, rd, 1, 1, 58, 4, table(T_SCRUB), 0.16, res);
  scatter(map, rd, 1, 44, 58, 3, table(T_SCRUB), 0.16, res);
  scatter(map, rd, 53, 14, 6, 26, table([['TREE_OAK', 5], ['BUSH', 4], ['ROCK', 2]]), 0.24, res);
  scatter(map, rd, 1, 5, 8, 10, table([['TREE_OAK', 5], ['BUSH', 4], ['ROCK', 2]]), 0.24, res);

  openThickets(map, { x: 30, y: 3 }, 5, res);
  map.recomputeFlags({ keep: 0 });
  sealBorder(map, tid('TREE_OAK', 'BLACK'));
  sweepStanding(map, npcs);
  map.spawn = { x: 30, y: 3 };
  map.entry = { ...map.spawn };
  map.level = 12;

  signpost(map, 26, 5, 'BEREGOST. Four inns, one temple, one smith, and no wall — the Song of the Morning is the wall, and Kelddath Ormlyr says so from the steps every tenday.', res);
  signpost(map, 5, 24, 'WEST: CANDLEKEEP. The Way of the Lion, and at the end of it a gate that opens for a book and nothing else.', res);
  signpost(map, 52, 22, 'EAST: HIGH HEDGE. Thalantyr the Conjurer. Do not touch the guardians, do not haggle, and do not ask what the fourth reagent is for.', res);
  signpost(map, 26, 43, 'SOUTH: NASHKEL, and Amn beyond it. The iron out of the Nashkel mines has been coming up bad for a year and every smith on the Coast Way knows it.', res);
  addSign(map, 18, 15, 'FELDEPOST’S INN — stone-built, three storeys, and an older clientele than the Juggler. Beds, board, and quiet.');
  addSign(map, 42, 15, 'THE JOVIAL JUGGLER — music most nights, a recruit board by the hearth, and Kithri Greenbottle behind the bar standing on a box.');
  addSign(map, 14, 33, 'THE BURNING WIZARD — the roof was patched with somebody else’s tiles and the sign was painted over a worse one. Cheap, loud, and the Black Network drink here.');
  addSign(map, 24, 25, 'THUNDERHAMMER SMITHY — Taerom Fuiruim. The best mundane steel south of Waterdeep and he will tell you so while you wait.');
  addSign(map, 46, 34, 'THE SONG OF THE MORNING. Lathander’s great house on the Coast Way, high priest Kelddath Ormlyr. Open at dawn; everyone is fed at dawn.');
  addSign(map, 27, 17, 'The town well, on the corner where the north lane meets the road. Four inns and one well, which is the whole history of Beregost in a sentence.');
  map.addTrigger({ id: 'beregost-feldepost-rest', kind: 'inn', x: 16, y: 15, data: { shop: 'feldeposts-inn', cost: 10, npc: 'feldepost' } });
  map.addTrigger({ id: 'beregost-juggler-rest', kind: 'inn', x: 40, y: 15, data: { shop: 'jovial-juggler', cost: 8, npc: 'kithri-greenbottle' } });
  return map;
}

// --- Feldepost's Inn --------------------------------------------------------
function buildFeldeposts(root) {
  const map = interiorMap({ id: 'feldeposts-inn', name: 'Feldepost’s Inn', w: 22, h: 18, music: 'inn', region: 'beregost' });
  const { npcs, res } = reserve('feldeposts-inn');
  const r = root.fork('feldepost');
  const rm = room(map, {
    w: 22, h: 18, floor: 'WOOD_FLOOR', wall: 'STONE_WALL', exit: 11,
    rooms: [{ x: 0, y: 0, w: 6, h: 6, door: 'e', name: 'kitchen' }],
  });

  for (let x = 8; x <= 14; x++) prop(map, x, 4, tid('BAR', 'COUNTER'), res);
  for (let x = 7; x <= 15; x++) prop(map, x, 1, tid('SHELF_GOODS', 'BOOKSHELF'), res);
  prop(map, 1, 6, tid('HEARTH', 'BRAZIER'), res);
  prop(map, 1, 7, tid('HEARTH', 'BRAZIER'), res);
  floorRect(map, 2, 5, 4, 5, tid('CARPET_RED', 'WOOD_FLOOR'));
  for (const py of [6, 10]) { prop(map, 6, py, tid('PILLAR', 'STONE_WALL'), res); prop(map, 16, py, tid('PILLAR', 'STONE_WALL'), res); }
  const tableAt = seating(map, r, res);
  tableAt(4, 13); tableAt(10, 8, 2); tableAt(18, 12); tableAt(9, 14); tableAt(19, 6);
  prop(map, 20, 3, tid('BOOKSHELF', 'SHELF_GOODS'), res);
  prop(map, 2, 15, tid('BENCH', 'CHAIR'), res);
  floor(map, 20, 1, tid('STAIRS_UP', 'WOOD_FLOOR'));
  floor(map, 20, 2, tid('WOOD_FLOOR_H', 'WOOD_FLOOR'));
  prop(map, 19, 1, tid('BED', 'BENCH'), res);
  oset(map, 11, 6, tid('CHANDELIER', 'CANDLE'));
  oset(map, 6, 12, tid('CHANDELIER', 'CANDLE'));

  finishInterior(map, rm.exit, npcs, 'STONE_WALL');
  map.addTrigger({ id: 'feldeposts-rest', kind: 'rest', x: 20, y: 2, w: 1, h: 1, data: { inn: true, cost: 10, text: 'A room on the second floor with a shutter that closes properly and a lock that works. Rest here?' } });
  map.addTrigger({ id: 'feldeposts-shop', kind: 'shop', x: 11, y: 5, data: { shop: 'feldeposts-inn', npc: 'feldepost' } });
  return map;
}

// --- The Jovial Juggler -----------------------------------------------------
function buildJovialJuggler(root) {
  const map = interiorMap({ id: 'jovial-juggler', name: 'The Jovial Juggler', w: 22, h: 18, music: 'tavern', region: 'beregost' });
  const { npcs, res } = reserve('jovial-juggler');
  const r = root.fork('juggler');
  const rm = room(map, {
    w: 22, h: 18, floor: 'WOOD_FLOOR_H', wall: 'WATTLE_WALL', exit: 11,
    rooms: [{ x: 0, y: 0, w: 6, h: 6, door: 'e', name: 'kitchen' }],
  });

  for (let x = 7; x <= 13; x++) prop(map, x, 4, tid('BAR', 'COUNTER'), res);
  for (let x = 6; x <= 14; x++) prop(map, x, 1, tid('SHELF_GOODS', 'BOOKSHELF'), res);
  prop(map, 1, 6, tid('HEARTH', 'BRAZIER'), res);
  prop(map, 1, 7, tid('HEARTH', 'BRAZIER'), res);
  prop(map, 2, 9, tid('SIGN', 'BOOKSHELF'), res);        // the recruit board, by the fire
  floorRect(map, 2, 5, 3, 4, tid('CARPET_RED', 'WOOD_FLOOR'));
  // a cleared floor in the middle: this is the inn people play music in
  floorRect(map, 8, 9, 7, 5, tid('WOOD_FLOOR', 'WOOD_FLOOR_H'));
  const tableAt = seating(map, r, res);
  tableAt(4, 12); tableAt(4, 15); tableAt(17, 8, 2); tableAt(17, 12, 2); tableAt(18, 15); tableAt(16, 5);
  for (const [px, py] of [[20, 4], [20, 5], [2, 2]]) prop(map, px, py, pickT(r, table([['BARREL', 5], ['CRATE', 3]])), res);
  floor(map, 20, 2, tid('WOOD_FLOOR_H', 'WOOD_FLOOR'));
  floor(map, 20, 1, tid('STAIRS_UP', 'WOOD_FLOOR'));
  prop(map, 19, 1, tid('BED', 'BENCH'), res);
  prop(map, 11, 8, tid('BENCH', 'CHAIR'), res);
  oset(map, 11, 7, tid('CHANDELIER', 'CANDLE'));
  oset(map, 11, 13, tid('CHANDELIER', 'CANDLE'));

  finishInterior(map, rm.exit, npcs, 'WATTLE_WALL');
  addSign(map, 2, 9, 'THE BOARD BY THE FIRE. Sellswords, guides and one very confident bard, chalked up with what they want a day and what they are actually worth.');
  map.addTrigger({ id: 'jovial-juggler-rest', kind: 'rest', x: 20, y: 2, w: 1, h: 1, data: { inn: true, cost: 8, text: 'A room over the common floor, and somebody will be playing under it until second bell. Rest here?' } });
  map.addTrigger({ id: 'jovial-juggler-shop', kind: 'shop', x: 10, y: 5, data: { shop: 'jovial-juggler', npc: 'kithri-greenbottle' } });
  return map;
}

// --- The Burning Wizard -----------------------------------------------------
function buildBurningWizard(root) {
  const map = interiorMap({
    id: 'burning-wizard', name: 'The Burning Wizard', w: 20, h: 16, music: 'tense',
    region: 'beregost', ambient: { color: '#241a12', alpha: 0.2 },
  });
  const { npcs, res } = reserve('burning-wizard');
  const r = root.fork('burning');
  const rm = room(map, { w: 20, h: 16, floor: 'WOOD_FLOOR_H', wall: 'LOG_WALL', exit: 10 });

  for (let x = 6; x <= 12; x++) prop(map, x, 4, tid('BAR', 'COUNTER'), res);
  for (let x = 5; x <= 13; x++) prop(map, x, 1, tid('SHELF_GOODS', 'BOOKSHELF'), res);
  prop(map, 1, 5, tid('HEARTH', 'BRAZIER'), res);
  prop(map, 1, 7, tid('COOKING_POT', 'BARREL'), res);
  const tableAt = seating(map, r, res);
  tableAt(4, 10); tableAt(9, 8, 3); tableAt(16, 10); tableAt(16, 6); tableAt(4, 13);
  prop(map, 8, 12, tid('RUBBLE', 'BARREL'), res);          // last tenday's argument
  prop(map, 12, 13, tid('BARREL', 'CRATE'), res);
  prop(map, 18, 2, tid('CRATE', 'BARREL'), res);
  prop(map, 18, 13, tid('SACK', 'CRATE'), res);
  prop(map, 2, 2, tid('BARREL', 'CRATE'), res);
  if (r.chance(1)) oset(map, 6, 3, tid('COBWEB', 'CANDLE'));
  oset(map, 10, 6, tid('CHANDELIER', 'CANDLE'));

  finishInterior(map, rm.exit, npcs, 'LOG_WALL');
  map.addTrigger({ id: 'burning-wizard-shop', kind: 'shop', x: 9, y: 5, data: { shop: 'burning-wizard', npc: 'marta-domine' } });
  return map;
}

// --- The Song of the Morning ------------------------------------------------
function buildSongOfTheMorning(root) {
  const map = interiorMap({
    id: 'song-of-the-morning', name: 'The Song of the Morning', w: 26, h: 22, music: 'temple',
    region: 'beregost', ambient: { color: '#3a2c12', alpha: 0.08 },
  });
  const { npcs, res } = reserve('song-of-the-morning');
  const r = root.fork('song');
  const rm = room(map, { w: 26, h: 22, floor: 'STONE_FLOOR', wall: 'STONE_WALL', exit: 13, step: 'MOSAIC' });

  // A real nave: two arcades of pillars, an aisle of mosaic, the sanctuary at
  // the head with the sun-disc over it and the benches in ranks below.
  floorRect(map, 10, 2, 7, 17, tid('MOSAIC', 'STONE_FLOOR'));
  for (const px of [8, 18]) for (let py = 4; py <= 17; py += 3) prop(map, px, py, tid('PILLAR', 'STONE_WALL'), res);
  prop(map, 13, 2, tid('ALTAR', 'SHRINE'), res);
  prop(map, 12, 2, tid('CANDLE', 'TORCH'), res);
  prop(map, 14, 2, tid('CANDLE', 'TORCH'), res);
  prop(map, 13, 1, tid('STATUE', 'SHRINE'), res);
  prop(map, 10, 1, tid('SHRINE', 'ALTAR'), res);
  prop(map, 16, 1, tid('SHRINE', 'ALTAR'), res);
  prop(map, 11, 4, tid('BRAZIER', 'TORCH'), res);
  prop(map, 15, 4, tid('BRAZIER', 'TORCH'), res);
  for (let py = 7; py <= 17; py += 2) {
    for (let px = 4; px <= 6; px++) prop(map, px, py, tid('BENCH', 'CHAIR'), res);
    for (let px = 20; px <= 22; px++) prop(map, px, py, tid('BENCH', 'CHAIR'), res);
  }
  for (const py of [5, 10, 15]) { prop(map, 1, py, tid('TORCH', 'CANDLE'), res); prop(map, 24, py, tid('TORCH', 'CANDLE'), res); }
  prop(map, 2, 2, tid('BOOKSHELF', 'SHELF_GOODS'), res);
  prop(map, 23, 2, tid('BOOKSHELF', 'SHELF_GOODS'), res);
  prop(map, 3, 3, tid('COUNTER', 'TABLE'), res);
  prop(map, 4, 3, tid('COUNTER', 'TABLE'), res);
  prop(map, 22, 19, tid('BED', 'BENCH'), res);            // the pilgrims' cots
  prop(map, 3, 19, tid('BED', 'BENCH'), res);
  if (r.chance(1)) { oset(map, 13, 7, tid('CHANDELIER', 'CANDLE')); oset(map, 13, 13, tid('CHANDELIER', 'CANDLE')); }

  finishInterior(map, rm.exit, npcs, 'STONE_WALL');
  map.addTrigger({ id: 'song-of-the-morning-shop', kind: 'shop', x: 13, y: 3, data: { shop: 'song-of-the-morning', npc: 'kelddath-ormlyr' } });
  map.addTrigger({ id: 'song-of-the-morning-rest', kind: 'rest', x: 3, y: 18, w: 1, h: 1, data: { inn: true, cost: 0, text: 'A cot in the pilgrims’ aisle, and Lathander’s house asks nothing for it. Rest here?' } });
  return map;
}

// --- Thunderhammer Smithy ---------------------------------------------------
function buildThunderhammerSmithy(root) {
  const map = interiorMap({ id: 'thunderhammer-smithy', name: 'Thunderhammer Smithy', w: 20, h: 16, music: 'shop', region: 'beregost' });
  const { npcs, res } = reserve('thunderhammer-smithy');
  const r = root.fork('hammer');
  const rm = room(map, {
    w: 20, h: 16, floor: 'STONE_FLOOR', wall: 'STONE_WALL', exit: 10, step: 'WOOD_FLOOR_H',
    rooms: [{ x: 14, y: 8, w: 6, h: 8, door: 'w', floor: 'STONE_FLOOR', name: 'stock' }],
  });

  prop(map, 2, 2, tid('FORGE', 'HEARTH'), res);
  prop(map, 3, 2, tid('FORGE', 'HEARTH'), res);
  prop(map, 4, 2, tid('FORGE', 'HEARTH'), res);
  prop(map, 3, 4, tid('ANVIL', 'ROCK'), res);
  prop(map, 6, 4, tid('ANVIL', 'ROCK'), res);
  prop(map, 5, 6, tid('GRINDSTONE', 'ROCK'), res);
  prop(map, 1, 6, tid('BARREL', 'CRATE'), res);
  for (let x = 9; x <= 15; x++) prop(map, x, 6, tid('COUNTER', 'TABLE'), res);
  for (let x = 8; x <= 18; x++) prop(map, x, 1, tid('SHELF_GOODS', 'BOOKSHELF'), res);
  for (let y = 2; y <= 5; y++) prop(map, 18, y, tid('SHELF_GOODS', 'BOOKSHELF'), res);
  for (const [px, py] of [[2, 11], [3, 11], [2, 13], [17, 9], [17, 10], [16, 12]]) prop(map, px, py, pickT(r, table([['CRATE', 5], ['ORE_IRON', 4], ['BARREL', 3], ['SACK', 2]])), res);
  prop(map, 12, 10, tid('TABLE', 'BENCH'), res);
  prop(map, 11, 10, tid('CHAIR', 'BENCH'), res);
  prop(map, 8, 3, tid('TORCH', 'CANDLE'), res);
  oset(map, 3, 1, tid('CHIMNEY', 'TORCH'));

  finishInterior(map, rm.exit, npcs, 'STONE_WALL');
  map.addTrigger({ id: 'thunderhammer-shop', kind: 'shop', x: 12, y: 7, data: { shop: 'thunderhammer-smithy', npc: 'thunderhammer-fuiruim' } });
  return map;
}

// ---------------------------------------------------------------------------
// 10. HIGH HEDGE
// ---------------------------------------------------------------------------
//
// Thalantyr the Conjurer's keep east of Beregost, and the hedge it is named for.
// A wizard's holding is a shape nobody else builds: a square tower in the middle
// of a maze of hedge, a ring of standing stones outside it, and the skeletons
// that mind the gate standing exactly where they were told to and nowhere else.
// The shop is street-side — there is no interior, because Thalantyr conducts his
// business at the door and has never invited anybody in.

function buildHighHedge(root) {
  const map = new TileMap({
    w: 36, h: 30, id: 'high-hedge', name: 'High Hedge', biome: 'plains',
    indoor: false, music: 'mystery', safe: true, encounterRate: 0, region: 'beregost',
    ambient: { color: '#1e1c26', alpha: 0.1 },
  });
  const { npcs, res } = reserve('high-hedge');
  const rg = root.fork('ground');
  const rd = root.fork('detail');

  // Thalantyr's heath: rough turf, worn to dirt where anything walks.
  groundNoise(map, rg, 0, 0, 36, 30, table([['GRASS_4', 7], ['GRASS', 5], ['GRASS_2', 2]]));
  patches(map, rg, 1, 1, 34, 28, table([['DIRT', 6], ['GRAVEL', 2]]), 12, 5, 18);
  scatter(map, rg, 0, 0, 36, 6, table([['DEAD_TREE', 4], ['BUSH', 4], ['ROCK', 4]]), 0.16, res);
  scatter(map, rg, 0, 25, 36, 5, table([['DEAD_TREE', 4], ['BUSH', 4], ['ROCK', 4]]), 0.16, res);

  // --- the road in ---------------------------------------------------------
  for (let y = 14; y <= 16; y++) for (let x = 1; x <= 15; x++) floor(map, x, y, pickT(rg, table(T_RUTS)));
  for (let y = 16; y <= 22; y++) for (let x = 14; x <= 16; x++) floor(map, x, y, pickT(rg, table(T_RUTS)));

  // --- the hedge -----------------------------------------------------------
  // Two concentric squares with their gaps on opposite sides. Not a puzzle —
  // just enough that you walk round the tower before you get to it, which is
  // exactly the impression Thalantyr wants to make.
  // The lines are clipped and square, because a conjurer's hedge is clipped and
  // square. What keeps it from reading as two rectangles drawn with a ruler is
  // depth: the hedge bulges to two tiles here and there, and a few lengths of
  // it have gone woody and are drawn as bush instead.
  const hedgeRing = (x, y, w, h, gaps) => {
    const leaf = () => tid(rd.chance(0.14) ? 'BUSH' : 'HEDGE', 'BUSH');
    for (let i = x; i < x + w; i++) {
      prop(map, i, y, leaf(), res); prop(map, i, y + h - 1, leaf(), res);
      if (rd.chance(0.22)) prop(map, i, y + 1, leaf(), res);
      if (rd.chance(0.22)) prop(map, i, y + h - 2, leaf(), res);
    }
    for (let j = y; j < y + h; j++) {
      prop(map, x, j, leaf(), res); prop(map, x + w - 1, j, leaf(), res);
      if (rd.chance(0.22)) prop(map, x + 1, j, leaf(), res);
      if (rd.chance(0.22)) prop(map, x + w - 2, j, leaf(), res);
    }
    for (const [gx, gy] of gaps) { dset(map, gx, gy, 0); floor(map, gx, gy, tid('DIRT_PATH', 'DIRT')); }
  };
  hedgeRing(8, 6, 21, 19, [[15, 24], [16, 24], [28, 12]]);
  hedgeRing(11, 9, 15, 13, [[24, 9], [25, 9], [11, 18]]);
  for (let y = 22; y <= 24; y++) { floor(map, 15, y, tid('DIRT_PATH', 'DIRT')); floor(map, 16, y, tid('DIRT_PATH', 'DIRT')); }
  for (let x = 16; x <= 28; x++) floor(map, x, 23, tid('DIRT_PATH', 'DIRT'));
  for (let y = 12; y <= 23; y++) floor(map, 27, y, tid('DIRT_PATH', 'DIRT'));
  for (let x = 12; x <= 27; x++) floor(map, x, 10, tid('DIRT_PATH', 'DIRT'));
  for (let y = 10; y <= 18; y++) floor(map, 12, y, tid('DIRT_PATH', 'DIRT'));

  // --- the keep ------------------------------------------------------------
  // A square tower, as the canon has it — so drawn as masonry with a crown of
  // battlements rather than as a roofed house. From above a tower is a wall.
  floorRect(map, 14, 12, 9, 8, tid('GRAVEL', 'DIRT'));
  keepTower(map, 15, 12, 7, 7, { storey: 2, peak: 3, chimney: 5, base: 'GRAVEL' }, res);
  dset(map, 18, 18, tid('IRON_DOOR', 'DOOR_CLOSED'));       // he takes business at the door
  gset(map, 18, 18, tid('FLAGSTONE', 'GRAVEL'));
  for (const [px, py] of [[15, 12], [21, 12]]) dset(map, px, py, tid('PILLAR', 'STONE_WALL'));
  floorRect(map, 14, 19, 9, 2, tid('FLAGSTONE', 'GRAVEL'));
  for (let y = 19; y <= 23; y++) floor(map, 18, y, tid('FLAGSTONE', 'DIRT_PATH'));
  prop(map, 14, 19, tid('BRAZIER', 'TORCH'), res);
  prop(map, 22, 19, tid('BRAZIER', 'TORCH'), res);
  prop(map, 13, 13, tid('STATUE', 'PILLAR'), res);
  prop(map, 23, 13, tid('STATUE', 'PILLAR'), res);

  // --- the guardians -------------------------------------------------------
  // They stand. That is all they do, and they have done it for thirty years.
  for (const [px, py] of [[16, 20], [20, 20], [14, 23], [22, 23], [11, 17], [26, 17]]) {
    prop(map, px, py, tid('BONES', 'SKULL_PILE'), res);
    gset(map, px, py + 1, tid('GRAVEL', 'DIRT'));
  }
  prop(map, 17, 24, tid('SKULL_PILE', 'BONES'), res);

  // --- the stone circle outside the hedge ---------------------------------
  const cx = 30, cy = 22;
  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * Math.PI * 2;
    prop(map, cx + Math.round(Math.cos(ang) * 4), cy + Math.round(Math.sin(ang) * 3), tid(a % 3 === 2 ? 'RUBBLE' : 'PILLAR', 'ROCK'), res);
  }
  floorRect(map, cx - 2, cy - 1, 5, 3, tid('GRAVEL', 'DIRT'));
  prop(map, cx, cy, tid('ALTAR', 'SHRINE'), res);
  for (let x = 28; x <= 30; x++) floor(map, x, 23, tid('DIRT_PATH', 'DIRT'));

  scatter(map, rd, 1, 6, 6, 19, table([['DEAD_TREE', 3], ['BUSH', 4], ['ROCK', 4], ['BOULDER', 2]]), 0.16, res);
  scatter(map, rd, 30, 4, 5, 14, table([['DEAD_TREE', 3], ['BUSH', 4], ['ROCK', 4], ['BOULDER', 2]]), 0.16, res);

  openThickets(map, { x: 3, y: 15 }, 5, res);
  map.recomputeFlags({ keep: 0 });
  sealBorder(map, tid('DEAD_TREE', 'BLACK'));
  sweepStanding(map, npcs);
  map.spawn = { x: 3, y: 15 };
  map.entry = { ...map.spawn };
  map.level = 12;

  signpost(map, 8, 17, 'HIGH HEDGE. The gate in the outer hedge is a gap somebody cut and never trimmed. There is no bell. He knows you are here.', res);
  signpost(map, 25, 24, 'A ring of eight stones with three of them thrown down, and an altar in the middle worn perfectly smooth. Thalantyr conjures here when the tower is not enough room.', res);
  map.addTrigger({ id: 'high-hedge-shop', kind: 'shop', x: 18, y: 19, data: { shop: 'high-hedge', npc: 'thalantyr' } });
  map.addTrigger({ id: 'high-hedge-door', kind: 'sign', x: 18, y: 18, data: { text: 'An iron door, and a shelf beside it at exactly the height of a man’s hands. Thalantyr does his trade through the shelf. Nobody living has been further in than this step.' } });
  return map;
}

// ---------------------------------------------------------------------------
// 11. CANDLEKEEP
// ---------------------------------------------------------------------------
//
// The library-fortress on its crag over the Sea of Swords. The whole map is one
// idea: you cannot get in. The north half is fortress — a curtain wall three
// courses deep with a barbican in the middle of it and a skyline of towers
// behind that you can see and never reach. The south half is the Way of the
// Lion climbing the cliff to it, with the queue of scholars who also cannot get
// in. The gatehouse is the only door, and its price is a book.

function buildCandlekeepApproach(root) {
  const map = new TileMap({
    w: 52, h: 44, id: 'candlekeep-approach', name: 'Candlekeep', biome: 'coast',
    indoor: false, music: 'castle', safe: true, encounterRate: 0, region: 'candlekeep',
  });
  const { npcs, res } = reserve('candlekeep-approach');
  const rg = root.fork('ground');
  const rd = root.fork('detail');

  // Bare crag. Scree everywhere, thin turf in the lee of things, sand only
  // where the sea throws it — laid as clumps, never as per-tile static.
  groundNoise(map, rg, 0, 0, 52, 44, table([['GRAVEL', 9], ['GRAVEL', 4]]));
  patches(map, rg, 1, 16, 50, 27, table([['DIRT', 6], ['GRAVEL', 2]]), 13, 6, 22);
  patches(map, rg, 1, 20, 50, 20, table([['GRASS_4', 5], ['GRASS', 2]]), 8, 4, 12);
  patches(map, rg, 1, 26, 50, 12, table([['SAND', 6], ['GRAVEL', 2]]), 5, 4, 12);

  // --- the sea and the crag ------------------------------------------------
  for (let x = 0; x < 52; x++) {
    const shore = 34 + Math.round(Math.sin(x * 0.17) * 2) + (x < 16 ? -4 : 0);
    for (let y = shore + 3; y < 44; y++) gset(map, x, y, tid('WATER_DEEP', 'WATER'));
    for (let y = shore; y < shore + 3; y++) gset(map, x, y, tid('WATER', 'WATER_DEEP'));
    prop(map, x, shore - 1, tid('CLIFF', 'MOUNTAIN'), res);
    prop(map, x, shore - 2, tid('CLIFF', 'MOUNTAIN'), res);
  }
  for (let y = 20; y < 34; y++) for (let x = 0; x <= 4 + Math.round(Math.cos(y * 0.2) * 2); x++) prop(map, x, y, tid('CLIFF', 'MOUNTAIN'), res);
  for (let y = 24; y < 34; y++) for (let x = 47 + Math.round(Math.sin(y * 0.3)); x < 52; x++) prop(map, x, y, tid('CLIFF', 'MOUNTAIN'), res);

  // --- the fortress --------------------------------------------------------
  // The Old Wall of Candlekeep: crown, face, plinth, all the way across.
  for (let x = 0; x < 52; x++) {
    gset(map, x, 13, tid('FLAGSTONE', 'GRAVEL')); dset(map, x, 13, tid('WALL_TOP_LIT', 'STONE_WALL'));
    gset(map, x, 14, tid('FLAGSTONE', 'GRAVEL')); dset(map, x, 14, tid('STONE_WALL', 'BRICK_WALL'));
    gset(map, x, 15, tid('FLAGSTONE', 'GRAVEL')); dset(map, x, 15, tid('WALL_TOP_SHADE', 'STONE_WALL'));
  }
  // The skyline behind it: the towers of the Avowed, drawn as masonry shafts
  // and not as houses. Heights are staggered and the middle one — the Keep
  // itself, where the chronicles are — runs the full thirteen courses, so the
  // silhouette climbs to a centre instead of sitting flat across the top.
  floorRect(map, 0, 0, 52, 13, tid('FLAGSTONE', 'GRAVEL'));
  keepTower(map, 1, 3, 7, 10, { storey: 3 }, res);
  keepTower(map, 9, 6, 5, 7, { storey: 3, lit: false }, res);
  keepTower(map, 15, 1, 6, 12, { storey: 3, peak: 3 }, res);
  keepTower(map, 22, 0, 9, 13, { storey: 3, peak: 4, chimney: 1 }, res);   // the Keep
  keepTower(map, 32, 2, 6, 11, { storey: 3, peak: 3 }, res);
  keepTower(map, 39, 5, 5, 8, { storey: 3, lit: false }, res);
  keepTower(map, 45, 3, 6, 10, { storey: 3 }, res);
  // Curtain between the shafts, so the fortress reads as one continuous mass
  // rather than seven separate objects standing in a field of flagstone.
  for (let px = 0; px < 52; px++) {
    for (let py = 10; py <= 12; py++) {
      if (map.deco[py * map.w + px]) continue;
      gset(map, px, py, tid('FLAGSTONE', 'GRAVEL'));
      dset(map, px, py, tid(py === 10 ? 'WALL_TOP_LIT' : 'STONE_WALL', 'STONE_WALL'));
    }
  }

  // --- the barbican --------------------------------------------------------
  // The gatehouse door is at (26,20): the base course of its own rect, with the
  // Way of the Lion's flagstones one tile south of it.
  building(map, {
    x: 20, y: 12, w: 13, h: 9, wall: 'STONE_WALL', roof: 'tile', base: 'FLAGSTONE', lit: true,
    roofRows: 4, door: 6, windows: [1, 2, 10, 11], upper: [4, 6, 8], band: 5,
    peak: 6, chimney: 1, chimney2: 11, approach: 2, step: 'FLAGSTONE', ironDoor: true,
  }, res);
  shell(map, { x: 16, y: 10, w: 4, h: 11, wall: 'STONE_WALL', roof: 'tile', base: 'FLAGSTONE', roofRows: 4, windows: [1, 2], upper: [1, 2], band: 6 }, res);
  shell(map, { x: 33, y: 10, w: 4, h: 11, wall: 'STONE_WALL', roof: 'tile', base: 'FLAGSTONE', roofRows: 4, windows: [1, 2], upper: [1, 2], band: 6 }, res);
  for (const [px, py] of [[16, 10], [19, 10], [33, 10], [36, 10]]) dset(map, px, py, tid('PILLAR', 'STONE_WALL'));
  prop(map, 19, 21, tid('BRAZIER', 'TORCH'), res);
  prop(map, 34, 21, tid('BRAZIER', 'TORCH'), res);

  // --- the Way of the Lion -------------------------------------------------
  floorRect(map, 22, 21, 9, 3, tid('FLAGSTONE', 'COBBLE'));
  for (let y = 21; y <= 31; y++) for (let x = 25; x <= 27; x++) floor(map, x, y, tid('FLAGSTONE', 'COBBLE'));
  for (let x = 26; x <= 50; x++) for (let y = 21; y <= 23; y++) floor(map, x, y, pickT(rg, table(T_STONEROAD)));
  for (let y = 24; y <= 31; y++) for (let x = 20; x <= 32; x++) if (rg.chance(0.35)) gset(map, x, y, tid('COBBLE', 'FLAGSTONE'));
  // the lions
  for (const py of [24, 27, 30]) { prop(map, 23, py, tid('STATUE', 'PILLAR'), res); prop(map, 29, py, tid('STATUE', 'PILLAR'), res); }
  signpost(map, 31, 24, 'THE WAY OF THE LION. Six lions of Candlekeep, three to a side, each with a book under its paw. The books are all different and the Avowed will not tell you what they are.', res);

  // --- the queue -----------------------------------------------------------
  // Scholars who have been here weeks, camped on the ramp, still hoping.
  for (const [cx, cy] of [[14, 25], [17, 29], [36, 26], [39, 30], [12, 30]]) {
    orect(map, cx, cy, 3, 1, tid('THATCH_M', 'SHINGLE_ROOF'));
    drect(map, cx, cy, 3, 1, tid('THATCH_M', 'SHINGLE_ROOF'));
    prop(map, cx, cy + 1, tid('CRATE', 'SACK'), res);
    prop(map, cx + 2, cy + 1, tid('BARREL', 'CRATE'), res);
    prop(map, cx + 1, cy + 2, tid('BRAZIER', 'TORCH'), res);
  }
  prop(map, 20, 26, tid('BENCH', 'CRATE'), res);
  prop(map, 32, 28, tid('BENCH', 'CRATE'), res);
  prop(map, 33, 26, tid('BOOKSHELF', 'CRATE'), res);
  signpost(map, 19, 27, 'A camp of nine scholars on the ramp, some of them here since spring. Every one of them has a book. Not one of them has a book Candlekeep does not already hold.', res);

  // --- the harbour stair, going nowhere you may go -------------------------
  for (let y = 31; y <= 33; y++) floor(map, 8, y, tid('STAIRS_DOWN', 'FLAGSTONE'));
  prop(map, 7, 30, tid('PILLAR', 'ROCK'), res);
  prop(map, 9, 30, tid('PILLAR', 'ROCK'), res);
  for (let x = 8; x <= 24; x++) floor(map, x, 30, tid('GRAVEL', 'DIRT'));
  signpost(map, 10, 29, 'The sea stair, cut into the crag: three hundred steps down to a jetty where the Avowed take delivery of everything they eat. It is chained at the fourth step.', res);

  scatter(map, rd, 40, 24, 11, 8, table([['ROCK', 5], ['BOULDER', 3], ['BUSH', 3], ['GRASS_TALL', 3]]), 0.16, res);
  scatter(map, rd, 5, 20, 8, 10, table([['ROCK', 5], ['BOULDER', 3], ['BUSH', 3]]), 0.16, res);

  openThickets(map, { x: 48, y: 22 }, 5, res);
  map.recomputeFlags({ keep: 0 });
  sealBorder(map, tid('CLIFF', 'MOUNTAIN'));
  sweepStanding(map, npcs);
  map.spawn = { x: 48, y: 22 };
  map.entry = { ...map.spawn };
  map.level = 13;

  signpost(map, 44, 24, 'CANDLEKEEP. The gate price is one book the library does not hold. There is no second price, no exception, and no argument the Gatewarden has not heard already.', res);
  addSign(map, 26, 21, 'The Gatehouse of Candlekeep. Iron, and older than the wall it is set in. A Great Reader keeps the ledger inside and will look at what you have brought, once.');
  return map;
}

function buildCandlekeepGatehouse(root) {
  const map = interiorMap({
    id: 'candlekeep-gatehouse', name: 'The Gatehouse of Candlekeep', w: 26, h: 20, music: 'mystery',
    region: 'candlekeep', ambient: { color: '#221c2c', alpha: 0.16 },
  });
  const { npcs, res } = reserve('candlekeep-gatehouse');
  const r = root.fork('gatehouse');
  const rm = room(map, { w: 26, h: 20, floor: 'STONE_FLOOR', wall: 'STONE_WALL', exit: 13, step: 'MOSAIC' });

  // Books floor to ceiling on three walls, one desk across the middle of the
  // room, and an inner door you are not going through.
  for (let x = 2; x <= 23; x++) prop(map, x, 1, tid('BOOKSHELF', 'SHELF_GOODS'), res);
  for (let y = 2; y <= 12; y++) { prop(map, 1, y, tid('BOOKSHELF', 'SHELF_GOODS'), res); prop(map, 24, y, tid('BOOKSHELF', 'SHELF_GOODS'), res); }
  for (let x = 4; x <= 8; x++) prop(map, x, 6, tid('BOOKSHELF', 'SHELF_GOODS'), res);
  for (let x = 17; x <= 21; x++) prop(map, x, 6, tid('BOOKSHELF', 'SHELF_GOODS'), res);

  for (let x = 9; x <= 16; x++) prop(map, x, 9, tid('COUNTER', 'TABLE'), res);
  prop(map, 12, 8, tid('CANDLE', 'TORCH'), res);
  prop(map, 14, 8, tid('CANDLE', 'TORCH'), res);
  prop(map, 10, 8, tid('CHAIR', 'BENCH'), res);

  // the inner door: the whole point of the room
  floorRect(map, 11, 2, 4, 3, tid('MOSAIC', 'STONE_FLOOR'));
  dset(map, 12, 2, tid('IRON_DOOR', 'DOOR_CLOSED'));
  dset(map, 13, 2, tid('IRON_DOOR', 'DOOR_CLOSED'));
  prop(map, 11, 2, tid('PILLAR', 'STONE_WALL'), res);
  prop(map, 14, 2, tid('PILLAR', 'STONE_WALL'), res);
  prop(map, 10, 3, tid('BRAZIER', 'TORCH'), res);
  prop(map, 15, 3, tid('BRAZIER', 'TORCH'), res);
  prop(map, 12, 4, tid('STATUE', 'PILLAR'), res);
  prop(map, 13, 4, tid('STATUE', 'PILLAR'), res);

  for (const py of [12, 15]) { prop(map, 4, py, tid('BENCH', 'CHAIR'), res); prop(map, 21, py, tid('BENCH', 'CHAIR'), res); }
  for (const [px, py] of [[2, 17], [3, 17], [22, 17], [23, 16]]) prop(map, px, py, pickT(r, table([['CRATE', 4], ['BOOKSHELF', 3], ['SACK', 2]])), res);
  prop(map, 8, 14, tid('TABLE', 'BENCH'), res);
  prop(map, 7, 14, tid('CHAIR', 'BENCH'), res);
  prop(map, 17, 14, tid('TABLE', 'BENCH'), res);
  prop(map, 18, 14, tid('CHAIR', 'BENCH'), res);
  oset(map, 12, 12, tid('CHANDELIER', 'CANDLE'));
  oset(map, 6, 8, tid('CHANDELIER', 'CANDLE'));
  oset(map, 19, 8, tid('CHANDELIER', 'CANDLE'));

  finishInterior(map, rm.exit, npcs, 'STONE_WALL');
  map.addTrigger({ id: 'candlekeep-gate-shop', kind: 'shop', x: 12, y: 10, data: { shop: 'candlekeep-gatehouse', npc: 'sariel-amakiir' } });
  map.addTrigger({ id: 'candlekeep-inner-door', kind: 'sign', x: 12, y: 3, data: { text: 'The inner door of Candlekeep. Two leaves of black iron with the Binder’s seal across the join, and a Great Reader between you and it who has said no to better scholars than you.' } });
  return map;
}

// ---------------------------------------------------------------------------
// 12. NASHKEL
// ---------------------------------------------------------------------------
//
// An Amnish mining town in the foothills of the Cloud Peaks, and the furthest
// south the road goes. The mountains shut the east and south, a stream comes
// down out of them, and the mine head is a working industrial site rather than a
// hole in a hill: shoring, spoil, ore carts, and the adit at the end of it.

function buildNashkel(root) {
  const map = new TileMap({
    w: 48, h: 40, id: 'nashkel', name: 'Nashkel', biome: 'city',
    indoor: false, music: 'town', safe: true, encounterRate: 0, region: 'nashkel',
  });
  const { npcs, res } = reserve('nashkel');
  const rg = root.fork('ground');
  const rd = root.fork('detail');
  const road = table(T_TOWNROAD);

  // Amnish upland: dry turf worn through to dirt and mine spoil in patches.
  groundNoise(map, rg, 0, 0, 48, 40, table([['GRASS_4', 7], ['GRASS', 4], ['CLOVER', 2]]));
  patches(map, rg, 1, 1, 46, 38, table([['DIRT', 6], ['GRAVEL', 2]]), 13, 6, 20);
  patches(map, rg, 26, 20, 21, 18, table([['GRAVEL', 6], ['DIRT', 2]]), 7, 5, 16);

  // --- the Cloud Peaks -----------------------------------------------------
  for (let y = 0; y < 40; y++) {
    const east = 44 - Math.round(Math.sin(y * 0.18) * 2);
    for (let x = east; x < 48; x++) prop(map, x, y, tid('MOUNTAIN', 'CLIFF'), res);
  }
  for (let x = 0; x < 48; x++) {
    const low = 35 + Math.round(Math.cos(x * 0.2) * 2);
    for (let y = low; y < 40; y++) prop(map, x, y, tid('MOUNTAIN', 'CLIFF'), res);
  }
  for (let x = 0; x < 12; x++) {
    const top = 3 + Math.round(Math.sin(x * 0.3) * 1);
    for (let y = 0; y <= top; y++) prop(map, x, y, tid('CLIFF', 'MOUNTAIN'), res);
  }

  // --- the stream out of the mountains -------------------------------------
  for (let y = 6; y < 34; y++) {
    const wx = 8 + Math.round(Math.sin(y * 0.22) * 2);
    floor(map, wx, y, tid('WATER', 'MUD'));
    floor(map, wx + 1, y, tid('WATER', 'MUD'));
    if (rg.chance(0.3)) prop(map, wx - 1, y, tid('REEDS', 'BUSH'), res);
    if (rg.chance(0.2)) prop(map, wx + 2, y, tid('CATTAILS', 'REEDS'), res);
  }

  // --- the roads -----------------------------------------------------------
  for (let y = 1; y <= 38; y++) for (let x = 23; x <= 25; x++) floor(map, x, y, pickT(rg, road));
  for (let x = 12; x <= 42; x++) for (let y = 20; y <= 22; y++) floor(map, x, y, pickT(rg, road));
  for (let x = 12; x <= 25; x++) floor(map, x, 21, pickT(rg, road));
  for (let y = 22; y <= 30; y++) for (let x = 32; x <= 34; x++) floor(map, x, y, pickT(rg, road));
  for (let x = 33; x <= 42; x++) for (let y = 29; y <= 31; y++) floor(map, x, y, pickT(rg, road));
  // the bridge over the stream, west
  for (let x = 6; x <= 13; x++) for (let y = 20; y <= 22; y++) floor(map, x, y, tid('BRIDGE_WOOD', 'DIRT_PATH'));

  // --- the inn and the store ----------------------------------------------
  building(map, {
    x: 16, y: 13, w: 9, h: 6, wall: 'STONE_WALL', roof: 'shingle', base: 'GRAVEL', lit: true,
    roofRows: 2, door: 4, windows: [1, 2, 7], upper: [3, 6], sign: 6, band: 3,
    chimney: 1, chimney2: 7, approach: 1, porch: 3, lantern: true,
  }, res);                                       // nashkel-inn (20,18)
  building(map, {
    x: 28, y: 14, w: 8, h: 5, wall: 'WATTLE_WALL', roof: 'thatch', base: 'GRAVEL',
    roofRows: 2, door: 3, windows: [1, 6], sign: 5, loading: [5, 6], chimney: 6, approach: 2,
  }, res);                                       // Berrun Ghastkill's store
  prop(map, 27, 20, tid('CART', 'CRATE'), res);
  prop(map, 36, 19, tid('CRATE', 'BARREL'), res);
  prop(map, 37, 20, tid('SACK', 'CRATE'), res);
  prop(map, 26, 19, tid('ORE_IRON', 'ROCK'), res);

  // --- houses and the Amnish garrison post --------------------------------
  building(map, { x: 15, y: 25, w: 7, h: 5, wall: 'WATTLE_WALL', roof: 'thatch', base: 'GRAVEL', roofRows: 2, windows: [1, 5], chimney: 5 }, res);
  building(map, { x: 26, y: 25, w: 6, h: 4, wall: 'WATTLE_WALL', roof: 'thatch', base: 'GRAVEL', roofRows: 2, windows: [1, 4], chimney: 1 }, res);
  building(map, { x: 15, y: 6, w: 6, h: 5, wall: 'LOG_WALL', roof: 'thatch', base: 'GRAVEL', roofRows: 3, windows: [1, 4], chimney: 4 }, res);
  building(map, { x: 28, y: 6, w: 7, h: 5, wall: 'STONE_WALL', roof: 'tile', base: 'GRAVEL', roofRows: 2, windows: [1, 5], sign: 3, chimney: 1 }, res);
  prop(map, 27, 11, tid('BRAZIER', 'TORCH'), res);
  prop(map, 36, 11, tid('BRAZIER', 'TORCH'), res);
  signpost(map, 36, 12, 'THE AMNISH POST. Nashkel is Amn’s northernmost town and the garrison is nine soldiers, four of whom are from Nashkel and none of whom want the job.', res);
  building(map, { x: 15, y: 32, w: 6, h: 4, wall: 'WATTLE_WALL', roof: 'thatch', base: 'GRAVEL', roofRows: 2, windows: [1, 4], chimney: 4 }, res);
  shell(map, { x: 27, y: 32, w: 5, h: 4, wall: 'LOG_WALL', roof: 'thatch', base: 'DIRT', roofRows: 2, loading: [1, 3], windows: [1, 3] }, res);

  // --- the mine head -------------------------------------------------------
  floorRect(map, 33, 24, 11, 10, tid('GRAVEL', 'DIRT'));
  groundNoise(map, rg, 34, 25, 9, 8, table([['GRAVEL', 9], ['GRAVEL', 4]]));
  patches(map, rg, 34, 25, 9, 8, table([['CAVE_FLOOR', 5], ['DIRT', 3]]), 3, 4, 10);
  for (let x = 33; x <= 43; x++) prop(map, x, 33, tid('CAVE_WALL', 'MOUNTAIN'), res);
  for (let x = 33; x <= 43; x++) prop(map, x, 24, 0, res);
  prop(map, 35, 29, tid('TIMBER_SUPPORT', 'PILLAR'), res);
  prop(map, 41, 29, tid('TIMBER_SUPPORT', 'PILLAR'), res);
  prop(map, 34, 32, tid('ORE_IRON', 'ROCK'), res);
  prop(map, 42, 32, tid('ORE_IRON', 'ROCK'), res);
  prop(map, 42, 26, tid('CART', 'CRATE'), res);
  prop(map, 34, 26, tid('CRATE', 'BARREL'), res);
  prop(map, 34, 27, tid('BARREL', 'CRATE'), res);
  prop(map, 36, 28, tid('TORCH', 'CANDLE'), res);
  prop(map, 40, 28, tid('TORCH', 'CANDLE'), res);
  for (let x = 37; x <= 39; x++) for (let y = 28; y <= 32; y++) floor(map, x, y, tid('CAVE_FLOOR', 'GRAVEL'));
  orect(map, 36, 28, 5, 1, tid('BLACK', 'COBWEB'));      // the lintel of the adit
  prop(map, 43, 30, tid('GRINDSTONE', 'ROCK'), res);
  prop(map, 33, 30, tid('SACK', 'CRATE'), res);

  scatter(map, rd, 1, 4, 6, 30, table([['TREE_PINE', 4], ['BUSH', 4], ['ROCK', 4], ['BOULDER', 2]]), 0.2, res);
  scatter(map, rd, 12, 1, 34, 4, table([['TREE_PINE', 4], ['BUSH', 3], ['ROCK', 4]]), 0.14, res);
  bigPine(map, 4, 8); bigPine(map, 5, 28); bigPine(map, 12, 34);

  openThickets(map, { x: 24, y: 3 }, 5, res);
  map.recomputeFlags({ keep: 0 });
  sealBorder(map, tid('MOUNTAIN', 'CLIFF'));
  sweepStanding(map, npcs);
  map.spawn = { x: 24, y: 3 };
  map.entry = { ...map.spawn };
  map.level = 13;

  signpost(map, 21, 4, 'NASHKEL, of the Council of Six of Amn. Iron, and a mayor who would rather it were anything else. Beyond the town there is only the Cloud Peaks and then Amn proper.', res);
  signpost(map, 30, 22, 'SOUTH-EAST: THE NASHKEL MINES. Notice, in the mayor’s hand: NO ORE LEAVES THIS SITE UNTIL THE ASSAY IS CLEAN. It has not been clean since Mirtul.', res);
  addSign(map, 22, 19, 'THE NASHKEL INN — Vitiare Calabra. Amnish beds, Amnish prices, and every rumour that comes up the mine road before it gets anywhere else.');
  addSign(map, 33, 19, 'GHASTKILL’S STORE — mining gear, rations, and the ore assay, which the mayor performs himself and has stopped enjoying.');
  siteMouth(map, 38, 30, 'nashkel-mines', { dir: 'down', kind: 'cave', theme: 'mine' });
  map.addTrigger({ id: 'nashkel-store-shop', kind: 'shop', x: 31, y: 19, data: { shop: 'nashkel-store', npc: 'berrun-ghastkill' } });
  map.addTrigger({ id: 'nashkel-inn-rest', kind: 'inn', x: 20, y: 19, data: { shop: 'nashkel-inn', cost: 8, npc: 'vitiare-calabra' } });
  return map;
}

function buildNashkelInn(root) {
  const map = interiorMap({ id: 'nashkel-inn', name: 'The Nashkel Inn', w: 22, h: 18, music: 'inn', region: 'nashkel' });
  const { npcs, res } = reserve('nashkel-inn');
  const r = root.fork('nashkel');
  const rm = room(map, {
    w: 22, h: 18, floor: 'WOOD_FLOOR', wall: 'STONE_WALL', exit: 11,
    rooms: [{ x: 0, y: 0, w: 6, h: 6, door: 'e', name: 'kitchen' }],
  });

  for (let x = 8; x <= 14; x++) prop(map, x, 4, tid('BAR', 'COUNTER'), res);
  for (let x = 7; x <= 15; x++) prop(map, x, 1, tid('SHELF_GOODS', 'BOOKSHELF'), res);
  prop(map, 1, 6, tid('HEARTH', 'BRAZIER'), res);
  prop(map, 1, 7, tid('HEARTH', 'BRAZIER'), res);
  prop(map, 1, 9, tid('COOKING_POT', 'BARREL'), res);
  floorRect(map, 2, 5, 4, 5, tid('CARPET_BLUE', 'WOOD_FLOOR'));
  const tableAt = seating(map, r, res);
  tableAt(5, 13); tableAt(10, 8, 3); tableAt(17, 12); tableAt(18, 7); tableAt(9, 14, 2);
  prop(map, 20, 4, tid('BOOKSHELF', 'SHELF_GOODS'), res);
  prop(map, 2, 15, tid('BENCH', 'CHAIR'), res);
  prop(map, 20, 15, tid('BARREL', 'CRATE'), res);
  floor(map, 20, 1, tid('STAIRS_UP', 'WOOD_FLOOR'));
  floor(map, 20, 2, tid('WOOD_FLOOR_H', 'WOOD_FLOOR'));
  prop(map, 19, 1, tid('BED', 'BENCH'), res);
  oset(map, 11, 6, tid('CHANDELIER', 'CANDLE'));
  oset(map, 6, 12, tid('CHANDELIER', 'CANDLE'));

  finishInterior(map, rm.exit, npcs, 'STONE_WALL');
  map.addTrigger({ id: 'nashkel-inn-bed', kind: 'rest', x: 20, y: 2, w: 1, h: 1, data: { inn: true, cost: 8, text: 'A room at the top of the stairs with a window on the Cloud Peaks. Rest here?' } });
  map.addTrigger({ id: 'nashkel-inn-shop', kind: 'shop', x: 11, y: 5, data: { shop: 'nashkel-inn', npc: 'vitiare-calabra' } });
  return map;
}

// ---------------------------------------------------------------------------
// 8. THE PROCEDURAL SITES
// ---------------------------------------------------------------------------
//
// Four places the road leads to that are generated rather than drawn. Each one
// has to rewrite its own up-stair, because maps.js's `buildProcedural` only
// knows the way out of Undermountain, Wave Echo and the Redbrand hideout — and
// each surface mouth is stamped by hand in its own builder, because a row with
// `bWarp: null` is a link maps.js can only wire from one end.

const buildDragonspearCastle = packDungeon(
  'dragonspear-castle', 'Dragonspear Castle',
  { gen: 'dungeon', theme: 'dungeon', biome: 'dungeon', size: 'large', level: 13, music: 'dungeon', region: 'dragonspear-castle', encounterTable: 'hells-incursion' },
  { map: 'fields-of-the-dead', x: 68, y: 16, dir: 'up' },
);

const buildRosymornCloister = packDungeon(
  'rosymorn-cloister', 'The Cloister of the Dawn',
  { gen: 'dungeon', theme: 'dungeon', biome: 'ruins', size: 'medium', level: 12, music: 'crypt', region: 'rosymorn-monastery', encounterTable: 'petrified-gallery' },
  { map: 'rosymorn-monastery', x: 24, y: 15, dir: 'up' },
);

const buildNashkelMines = packDungeon(
  'nashkel-mines', 'The Nashkel Mines',
  { gen: 'mine', theme: 'mine', biome: 'mine', size: 'large', level: 13, music: 'cave', region: 'nashkel-mines', encounterTable: 'kobold-warren' },
  { map: 'nashkel', x: 38, y: 31, dir: 'up' },
);

// ---------------------------------------------------------------------------
// 13. THE CATALOGUE
// ---------------------------------------------------------------------------
//
// Raw defs only: maps.js runs every one of these through its own private
// `def()` before it reaches MAP_DEFS, which is why nothing here imports it.
// The three procedural sites declare `w: 0, h: 0`, exactly as `undermountain`
// does, because their size is whatever the generator felt like that seed.

export const REGION_MAPS = {
  // --- the road itself -----------------------------------------------------
  'trade-way-north': {
    name: 'The Trade Way — Waterdeep Reach', kind: 'road', biome: 'road', w: 60, h: 80,
    music: 'road', level: 8, region: 'trade-way', build: buildTradeWayNorth,
    desc: 'The great south road out of Waterdeep: tithe barns, an Alliance post, and a toll house nobody mans.',
  },
  'trade-way-south': {
    name: 'The Trade Way — Fields Reach', kind: 'road', biome: 'road', w: 60, h: 80,
    music: 'road', level: 10, region: 'trade-way', build: buildTradeWaySouth,
    desc: 'Where the ploughland gives out and the Trollbark begins. Ogres take a toll of their own.',
  },
  'coast-way-north': {
    name: 'The Coast Way — Chionthar Reach', kind: 'road', biome: 'road', w: 60, h: 64,
    music: 'road', level: 11, region: 'coast-way', build: buildCoastWayNorth,
    desc: 'The last approach to Baldur’s Gate: a Fist post, a refugee camp, and the city’s smoke on the skyline.',
  },
  'coast-way-south': {
    name: 'The Coast Way — Beregost Reach', kind: 'road', biome: 'road', w: 60, h: 80,
    music: 'road', level: 12, region: 'coast-way', build: buildCoastWaySouth,
    desc: 'South out of Rivington through the ankheg fields, past a Bhaalist chapel nobody dares burn.',
  },

  // --- Daggerford ----------------------------------------------------------
  daggerford: {
    name: 'Daggerford', kind: 'town', biome: 'city', w: 56, h: 46, safe: true, music: 'town',
    level: 9, region: 'daggerford', build: buildDaggerford,
    desc: 'A walled town of six hundred on the Delimbiyr, under Duchess Morwen Daggerford and her castle.',
  },
  'river-shining-tavern': {
    name: 'The River Shining Tavern', kind: 'interior', biome: 'city', w: 24, h: 18, indoor: true,
    safe: true, music: 'tavern', parent: 'daggerford', region: 'daggerford', build: buildRiverShining,
    desc: 'Filarion Filvendorson keeps the best beds and the deepest cellar between Waterdeep and the Gate.',
  },
  'happy-cow': {
    name: 'The Happy Cow', kind: 'interior', biome: 'city', w: 20, h: 16, indoor: true,
    safe: true, music: 'tavern', parent: 'daggerford', region: 'daggerford', build: buildHappyCow,
    desc: 'Fulbar Hardcheese’s long tables: cheap, hot, and never once quiet.',
  },
  'morninglow-tower': {
    name: 'Morninglow Tower', kind: 'interior', biome: 'city', w: 20, h: 18, indoor: true,
    safe: true, music: 'temple', parent: 'daggerford', region: 'daggerford', build: buildMorninglowTower,
    desc: 'Amaunator’s house in Daggerford, and the flame its Keeper will not let go out.',
  },
  'daggerford-smithy': {
    name: 'Ironeater’s Smithy', kind: 'interior', biome: 'city', w: 20, h: 14, indoor: true,
    safe: true, music: 'shop', parent: 'daggerford', region: 'daggerford', build: buildDaggerfordSmithy,
    desc: 'Derval Ironeater shoes horses, mends mail, and will not enchant anything for anybody.',
  },

  // --- the Way Inn ---------------------------------------------------------
  'the-way-inn': {
    name: 'The Way Inn', kind: 'town', biome: 'plains', w: 44, h: 34, safe: true, music: 'village',
    level: 9, region: 'trade-way', build: buildTheWayInn,
    desc: 'A fortified caravanserai at the Dusk Road turning: one walled yard, one great fire, every rumour on the road.',
  },
  'way-inn-common': {
    name: 'The Way Inn', kind: 'interior', biome: 'plains', w: 26, h: 20, indoor: true,
    safe: true, music: 'inn', parent: 'the-way-inn', region: 'trade-way', build: buildWayInnCommon,
    desc: 'Trestle tables for forty, two hearths, and the chalked road board that runs half the Trade Way.',
  },

  // --- the Fields of the Dead and its two spurs ----------------------------
  'fields-of-the-dead': {
    name: 'The Fields of the Dead', kind: 'wild', biome: 'plains', w: 72, h: 56, music: 'tense',
    level: 10, region: 'fields-of-the-dead', build: buildFieldsOfTheDead,
    desc: 'Ranked barrows, headstone fields and rotted siege engines, between the Trollbark and the Chionthar.',
  },
  'dragonspear-castle': {
    name: 'Dragonspear Castle', kind: 'dungeon', biome: 'dungeon', w: 0, h: 0, indoor: true,
    music: 'dungeon', level: 13, region: 'dragonspear-castle', build: buildDragonspearCastle,
    desc: 'The ruined fortress over the hellgate. Shut twice by the armies of the Coast, and open again.',
  },
  'rosymorn-monastery': {
    name: 'Rosymorn Monastery', kind: 'ruins', biome: 'mountain', w: 48, h: 40, music: 'mountain',
    level: 12, region: 'rosymorn-monastery', build: buildRosymornMonastery,
    desc: 'A Lathanderite house on a cliff shelf, abandoned by the Order of the Sun and held by something else.',
  },
  'rosymorn-cloister': {
    name: 'The Cloister of the Dawn', kind: 'dungeon', biome: 'ruins', w: 0, h: 0, indoor: true,
    music: 'crypt', level: 12, region: 'rosymorn-monastery', build: buildRosymornCloister,
    desc: 'The monastery under its own floor: cells, chapter house, and a forge somebody has been using.',
  },

  // --- Ulgoth's Beard ------------------------------------------------------
  'ulgoths-beard': {
    name: 'Ulgoth’s Beard', kind: 'town', biome: 'coast', w: 44, h: 36, safe: true, music: 'coast',
    level: 10, region: 'ulgoths-beard', build: buildUlgothsBeard,
    desc: 'A fishing village on the coast north-east of the Gate: a quay, a shipwright, and passage to the isles.',
  },
  'ulgoths-beard-inn': {
    name: 'The Sea Bounty', kind: 'interior', biome: 'coast', w: 22, h: 16, indoor: true,
    safe: true, music: 'inn', parent: 'ulgoths-beard', region: 'ulgoths-beard', build: buildUlgothsBeardInn,
    desc: 'Westra Helder’s taproom, and the slate behind the bar with every debt in the village on it.',
  },

  // --- the Friendly Arm ----------------------------------------------------
  'friendly-arm-inn': {
    name: 'The Friendly Arm', kind: 'town', biome: 'plains', w: 44, h: 36, safe: true, music: 'village',
    level: 12, region: 'coast-way', build: buildFriendlyArmInn,
    desc: 'A gnome-kept keep behind a curtain wall — a Bhaalite priest built it, and Bentley Mirrorshade scrubbed it out.',
  },
  'friendly-arm-common': {
    name: 'The Friendly Arm Inn', kind: 'interior', biome: 'plains', w: 26, h: 20, indoor: true,
    safe: true, music: 'inn', parent: 'friendly-arm-inn', region: 'coast-way', build: buildFriendlyArmCommon,
    desc: 'The safest bed on the Coast Way, and a cellar stair nailed shut at the fourth step.',
  },
  'garl-shrine': {
    name: 'The Shrine of Garl Glittergold', kind: 'interior', biome: 'plains', w: 18, h: 14, indoor: true,
    safe: true, music: 'temple', parent: 'friendly-arm-inn', region: 'coast-way', build: buildGarlShrine,
    desc: 'Gellana Mirrorshade heals, blesses, and tells a joke you understand three days later.',
  },

  // --- Beregost ------------------------------------------------------------
  beregost: {
    name: 'Beregost', kind: 'town', biome: 'city', w: 60, h: 48, safe: true, music: 'town',
    level: 12, region: 'beregost', build: buildBeregost,
    desc: 'An unwalled high street with four inns, one smith, and Lathander’s great house at the end of it.',
  },
  'feldeposts-inn': {
    name: 'Feldepost’s Inn', kind: 'interior', biome: 'city', w: 22, h: 18, indoor: true,
    safe: true, music: 'inn', parent: 'beregost', region: 'beregost', build: buildFeldeposts,
    desc: 'Three storeys of stone, an older clientele than the Juggler, and a lock on every door.',
  },
  'jovial-juggler': {
    name: 'The Jovial Juggler', kind: 'interior', biome: 'city', w: 22, h: 18, indoor: true,
    safe: true, music: 'tavern', parent: 'beregost', region: 'beregost', build: buildJovialJuggler,
    desc: 'Music most nights, a cleared floor to play it on, and the south’s recruit board by the hearth.',
  },
  'burning-wizard': {
    name: 'The Burning Wizard', kind: 'interior', biome: 'city', w: 20, h: 16, indoor: true,
    safe: true, music: 'tense', parent: 'beregost', region: 'beregost', build: buildBurningWizard,
    desc: 'Cheap, loud, patched with somebody else’s tiles, and the Black Network drink here.',
  },
  'song-of-the-morning': {
    name: 'The Song of the Morning', kind: 'interior', biome: 'city', w: 26, h: 22, indoor: true,
    safe: true, music: 'temple', parent: 'beregost', region: 'beregost', build: buildSongOfTheMorning,
    desc: 'Lathander’s great house on the Coast Way, high priest Kelddath Ormlyr. Everyone is fed at dawn.',
  },
  'thunderhammer-smithy': {
    name: 'Thunderhammer Smithy', kind: 'interior', biome: 'city', w: 20, h: 16, indoor: true,
    safe: true, music: 'shop', parent: 'beregost', region: 'beregost', build: buildThunderhammerSmithy,
    desc: 'Taerom Fuiruim, two anvils, and the best mundane steel south of Waterdeep.',
  },

  // --- the far south -------------------------------------------------------
  'high-hedge': {
    name: 'High Hedge', kind: 'ruins', biome: 'plains', w: 36, h: 30, safe: true, music: 'mystery',
    level: 12, region: 'beregost', build: buildHighHedge,
    desc: 'Thalantyr the Conjurer’s keep in its maze of hedge, and the guardians that stand where they were put.',
  },
  'candlekeep-approach': {
    name: 'Candlekeep', kind: 'city', biome: 'coast', w: 52, h: 44, safe: true, music: 'castle',
    level: 13, region: 'candlekeep', build: buildCandlekeepApproach,
    desc: 'The library-fortress on its crag over the Sea of Swords. The gate price is one book it does not hold.',
  },
  'candlekeep-gatehouse': {
    name: 'The Gatehouse of Candlekeep', kind: 'interior', biome: 'coast', w: 26, h: 20, indoor: true,
    safe: true, music: 'mystery', parent: 'candlekeep-approach', region: 'candlekeep', build: buildCandlekeepGatehouse,
    desc: 'Books to the ceiling, one desk, and an inner door of black iron you are not going through.',
  },
  nashkel: {
    name: 'Nashkel', kind: 'town', biome: 'city', w: 48, h: 40, safe: true, music: 'town',
    level: 13, region: 'nashkel', build: buildNashkel,
    desc: 'Amn’s northernmost town, in the foothills of the Cloud Peaks, and the iron is coming up bad.',
  },
  'nashkel-inn': {
    name: 'The Nashkel Inn', kind: 'interior', biome: 'city', w: 22, h: 18, indoor: true,
    safe: true, music: 'inn', parent: 'nashkel', region: 'nashkel', build: buildNashkelInn,
    desc: 'Amnish beds, Amnish prices, and every rumour that comes up the mine road before it goes anywhere else.',
  },
  'nashkel-mines': {
    name: 'The Nashkel Mines', kind: 'dungeon', biome: 'mine', w: 0, h: 0, indoor: true,
    music: 'cave', level: 13, region: 'nashkel-mines', build: buildNashkelMines,
    desc: 'The iron mine under the Cloud Peaks, and whatever is in the ore that the assay keeps failing.',
  },
};

// ---------------------------------------------------------------------------
// UPPER FLOORS
// ---------------------------------------------------------------------------
//
// Seven taprooms in this pack had a STAIRS_UP tile with a `rest` trigger on it
// and nothing at the top of the stairs. `innFloor` (mapkit) builds the landing
// and guest rooms those stairs were always supposed to reach, and returns both
// the map def and the LINKS row, so each stair is now a real two-way warp.
// Each taproom's `rest` trigger has moved one tile down off the stair — its
// 1x2 span already covered that tile — so the warp and the rest never shadow
// each other in `triggerAt`.
const INN_FLOORS = [
  {
    inn: 'river-shining-tavern', name: 'The River Shining — Guest Rooms',
    stair: [21, 1], land: [21, 2], rooms: 4, wall: 'STONE_WALL',
    desc: 'Rooms over the Delimbiyr, and a bolt on every door.',
  },
  {
    inn: 'way-inn-common', name: 'The Way Inn — Long Room',
    stair: [23, 1], land: [23, 2], rooms: 5, wall: 'STONE_WALL',
    desc: 'Bunks for forty caravaneers, and all forty of them snore.',
  },
  {
    inn: 'ulgoths-beard-inn', name: 'The Sea Bounty — Upstairs',
    stair: [20, 1], land: [20, 2], rooms: 3, wall: 'WATTLE_WALL',
    desc: 'Three rooms under the thatch that smell of tar and fish.',
  },
  {
    inn: 'friendly-arm-common', name: 'The Friendly Arm — Guest Rooms',
    stair: [24, 1], land: [24, 2], rooms: 5, wall: 'STONE_WALL',
    desc: 'The safest beds on the Coast Way, inside a keep with a wall round it.',
  },
  {
    inn: 'feldeposts-inn', name: 'Feldepost’s Inn — Second Floor',
    stair: [20, 1], land: [20, 2], rooms: 4, wall: 'STONE_WALL',
    desc: 'Shutters that close properly and locks that work. Beregost’s best.',
  },
  {
    inn: 'jovial-juggler', name: 'The Jovial Juggler — Upstairs',
    stair: [20, 1], land: [20, 2], rooms: 4, wall: 'WATTLE_WALL',
    desc: 'Rooms over the common floor, and somebody playing under them till second bell.',
  },
  {
    inn: 'nashkel-inn', name: 'The Nashkel Inn — Upstairs',
    stair: [20, 1], land: [20, 2], rooms: 4, wall: 'WATTLE_WALL',
    desc: 'Amnish beds, Amnish prices, and a window on the Cloud Peaks.',
  },
].map((s) => innFloor({ region: 'trade-way', music: 'inn', ...s }));

for (const f of INN_FLOORS) {
  REGION_MAPS[f.id] = f.def;
  REGION_LINKS.push(f.link);
}
