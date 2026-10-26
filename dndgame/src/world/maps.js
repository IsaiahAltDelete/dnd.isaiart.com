// world/maps.js — the hand-authored places of the Sword Coast: Phandalin and its
// interiors, the Triboar Trail, Neverwinter Wood, Conyberry, the mouth of Wave
// Echo Cave, the Protector's Enclave, the Trades Ward — plus the warp graph that
// stitches them together and the loader that caches them, re-applies your save
// file over them and populates them with the cast from data/npcs.js.
//
// CONTRACT
//   MAP_DEFS[id]   -> { id, name, kind, biome, w, h, indoor, music, level, build(r, ctx) }
//   loadMap(id, o) -> TileMap        (cached; unknown ids fall through to mapgen)
//   WORLD_NODES    -> [{ from, fromXY, to, toXY, dir }]  — every warp, both ways
//   mapMeta(id)    -> descriptor, invented on the spot for procedural ids
//   clearMapCache(id?)
//
// RULES OBSERVED HERE
//   * Nothing calls Math.random(). Every builder gets an RNG forked from the
//     world seed, so a campaign rebuilds the same Phandalin every session.
//   * Tile ids are resolved through mapgen's `tid()`, which returns the first
//     name that actually exists in render/tiles.js — a renamed decoration
//     degrades to grass instead of throwing.
//   * Planes are painted raw, then `recomputeFlags()` derives walkability from
//     the tile definitions, then triggers OR their own bits in. Doors are the
//     one exception: they are stamped solid by the tileset and then explicitly
//     opened, because you walk *through* a door tile into the building.
//   * Every NPC tile listed in data/npcs.js is reserved before a single prop is
//     placed, and swept clear again afterwards. Nobody gets bricked into a wall.

import { TileMap, TF, setTileFlagResolver } from './tilemap.js';
import { configureReputationMaps } from '../rules/reputation.js';
// Region packs. Each is a self-contained file that exports REGION_MAPS (raw map
// definitions, keyed by id) and REGION_LINKS (rows in the same shape as LINKS
// below). Keeping them out of this file lets whole regions be authored in
// parallel without four agents editing one 2,000-line module.
import { REGION_MAPS as SOUTH_MAPS, REGION_LINKS as SOUTH_LINKS } from './maps_south.js';
import { REGION_MAPS as BG_MAPS, REGION_LINKS as BG_LINKS } from './maps_baldursgate.js';
import { REGION_MAPS as BLACKSTAFF_MAPS, REGION_LINKS as BLACKSTAFF_LINKS } from './maps_blackstaff.js';
import { tileFlags, resolveTileMasses, resolveArchitecture } from '../render/tiles.js';
import { makeRNG } from '../core/rng.js';
import { NPCEntity, MonsterEntity, EntityList } from './entity.js';
import { dressCityStreets, populateCityStreets } from './city-life.js';
import { spawnableOnMap } from '../data/npcs.js';
import {
  tid, generateDungeon, generateCave, generateMine, generateCrypt,
  generateRuins, generateForest, generateLair, placeEncounterZones,
} from './mapgen.js';
import { Game } from '../engine.js';
import {
  gset, dset, oset, floor, floorRect, dframe, orect, drect, table, pickT, prop, scatter, groundNoise,
  sealBorder, openDoorway, normalizeTriggers, reservedFor, clearStanding, sweepStanding,
  building, shell, room, fenceRect, bigOak, bigPine,
  addSign, signpost, interiorMap, finishInterior, seating,
  stallRow, awning, garden, graveyard, orchard, wearPatches, dressStreets,
  interiorFor, innFloor, openHouse, curtain, gateway, tower, pyramidRoof, noticeBoard, temple, windmill,
} from './mapkit.js';

// TileMap needs to know how a tile id maps to flag bits before `stamp()` or
// `recomputeFlags()` mean anything. Idempotent; main.js may have done it already.
setTileFlagResolver(tileFlags);

// ---------------------------------------------------------------------------
// 0. THE PAINTING KIT
// ---------------------------------------------------------------------------
//
// Every painter — gset/dset/oset, building(), room(), curtain(), the lot —
// lives in world/mapkit.js and is shared with the region packs. This file only
// keeps what is specific to the Sword Coast North: the maps, the warp graph
// and the loader.

// ---------------------------------------------------------------------------
// 2. THE WARP GRAPH
// ---------------------------------------------------------------------------
//
// One row per doorway. Reading it: stepping on `aWarp` in map `a` lands you at
// `bLand` in map `b` facing `toB`; stepping on `bWarp` in `b` lands you at
// `aLand` in `a` facing `toA`. WORLD_NODES below expands each row into the two
// directed edges the overworld actually consumes, and `loadMap` places the warp
// triggers straight from it — so the graph and the maps can never drift apart.

/**
 * UPPER FLOORS. Every inn in the game had a STAIRS_UP tile with a `rest`
 * trigger on it and nothing at the top: you slept standing on the staircase.
 * `innFloor` builds the floor those stairs were always supposed to reach and
 * hands back both the map def and the LINKS row, so the stair becomes a real
 * two-way warp. The taproom's `rest` trigger has moved one tile off the stair
 * (its 1x2 span already covered that tile) so the two never shadow each other.
 * The region packs declare their own the same way, at the foot of each file.
 */
const CORE_INN_FLOORS = [
  {
    inn: 'stonehill-inn', name: 'The Stonehill Inn — Guest Rooms',
    stair: [17, 1], land: [17, 2], rooms: 4, wall: 'WATTLE_WALL',
    region: 'phandalin-hills', level: 1,
    desc: 'Four rooms under Toblen Stonehill’s thatch, and a shutter on every window.',
  },
].map(innFloor);

const LINKS = [
  { a: 'neverwinter-wood', aWarp: [1, 28], aLand: [3, 28], b: 'thundertree', bWarp: [30, 25], bLand: [28, 25], toB: 'left', toA: 'right', kind: 'road' },
  ...CORE_INN_FLOORS.map((f) => f.link),
  // --- Phandalin's front doors --------------------------------------------
  { a: 'phandalin', aWarp: [17, 26], aLand: [17, 27], b: 'stonehill-inn', bWarp: [10, 15], bLand: [10, 14], toB: 'up', toA: 'down', kind: 'door' },
  { a: 'phandalin', aWarp: [32, 28], aLand: [32, 29], b: 'barthens-provisions', bWarp: [9, 13], bLand: [9, 12], toB: 'up', toA: 'down', kind: 'door' },
  { a: 'phandalin', aWarp: [36, 37], aLand: [36, 38], b: 'lionshield-coster', bWarp: [9, 11], bLand: [9, 10], toB: 'up', toA: 'down', kind: 'door' },
  { a: 'phandalin', aWarp: [10, 27], aLand: [10, 28], b: 'shrine-of-luck', bWarp: [8, 13], bLand: [8, 12], toB: 'up', toA: 'down', kind: 'door' },
  { a: 'phandalin', aWarp: [8, 37], aLand: [8, 38], b: 'miners-exchange', bWarp: [9, 11], bLand: [9, 10], toB: 'up', toA: 'down', kind: 'door' },
  { a: 'phandalin', aWarp: [17, 37], aLand: [17, 38], b: 'townmasters-hall', bWarp: [9, 11], bLand: [9, 10], toB: 'up', toA: 'down', kind: 'door' },
  { a: 'phandalin', aWarp: [50, 37], aLand: [50, 38], b: 'sleeping-giant', bWarp: [9, 13], bLand: [9, 12], toB: 'up', toA: 'down', kind: 'door' },
  { a: 'phandalin', aWarp: [13, 44], aLand: [13, 45], b: 'alderleaf-farm', bWarp: [10, 17], bLand: [10, 16], toB: 'up', toA: 'down', kind: 'door' },
  { a: 'phandalin', aWarp: [48, 23], aLand: [48, 24], b: 'phandalin-manor', bWarp: [13, 25], bLand: [13, 24], toB: 'down', toA: 'down', kind: 'stairs' },

  // --- roads out of town ---------------------------------------------------
  { a: 'phandalin', aWarp: [58, 30], aLand: [57, 30], b: 'triboar-trail', bWarp: [1, 19], bLand: [3, 19], toB: 'right', toA: 'left', kind: 'road' },
  { a: 'phandalin', aWarp: [1, 20], aLand: [2, 20], b: 'neverwinter-wood', bWarp: [58, 44], bLand: [56, 44], toB: 'left', toA: 'right', kind: 'road' },

  // --- the Triboar Trail ---------------------------------------------------
  { a: 'triboar-trail', aWarp: [98, 19], aLand: [96, 19], b: 'conyberry-ruins', bWarp: [1, 16], bLand: [3, 16], toB: 'right', toA: 'left', kind: 'road' },
  { a: 'triboar-trail', aWarp: [70, 1], aLand: [70, 3], b: 'neverwinter-wood', bWarp: [30, 54], bLand: [30, 52], toB: 'up', toA: 'down', kind: 'road' },
  { a: 'triboar-trail', aWarp: [80, 38], aLand: [80, 36], b: 'wave-echo-cave-entrance', bWarp: [14, 1], bLand: [14, 3], toB: 'down', toA: 'up', kind: 'road' },

  // --- the north road ------------------------------------------------------
  { a: 'neverwinter-wood', aWarp: [30, 1], aLand: [30, 3], b: 'neverwinter', bWarp: [34, 34], bLand: [34, 32], toB: 'up', toA: 'down', kind: 'road' },
  { a: 'neverwinter', aWarp: [8, 34], aLand: [8, 32], b: 'waterdeep', bWarp: [21, 1], bLand: [21, 3], toB: 'down', toA: 'up', kind: 'road' },

  // --- the deep places -----------------------------------------------------
  { a: 'wave-echo-cave-entrance', aWarp: [14, 28], aLand: [14, 29], b: 'wave-echo-cave', bWarp: null, bLand: null, toB: 'down', toA: 'up', kind: 'cave' },
  { a: 'waterdeep', aWarp: [20, 13], aLand: [20, 15], b: 'undermountain', bWarp: null, bLand: null, toB: 'down', toA: 'up', kind: 'well', facing: 'up' },
  { a: 'phandalin-manor', aWarp: [13, 3], aLand: [13, 4], b: 'redbrand-hideout', bWarp: null, bLand: null, toB: 'down', toA: 'up', kind: 'stairs' },
];

/**
 * The full warp graph, both directions. Entries whose destination is procedural
 * (`toXY: null`) are placed by the map's own builder, which knows where the
 * generator put the stairs.
 */
/** Every doorway in the game: the Sword Coast North plus each region pack. */
const ALL_LINKS = LINKS.concat(SOUTH_LINKS || [], BG_LINKS || [], BLACKSTAFF_LINKS);

export const WORLD_NODES = Object.freeze(ALL_LINKS.flatMap((l) => {
  const out = [];
  if (l.aWarp) {
    out.push(Object.freeze({
      id: `${l.a}>${l.b}`,
      from: l.a, fromXY: { x: l.aWarp[0], y: l.aWarp[1] },
      to: l.b, toXY: l.bLand ? { x: l.bLand[0], y: l.bLand[1] } : null,
      dir: l.toB, kind: l.kind || 'warp', facing: l.facing || null,
      auto: !!l.bLand,
    }));
  }
  if (l.bWarp) {
    out.push(Object.freeze({
      id: `${l.b}>${l.a}`,
      from: l.b, fromXY: { x: l.bWarp[0], y: l.bWarp[1] },
      to: l.a, toXY: l.aLand ? { x: l.aLand[0], y: l.aLand[1] } : null,
      dir: l.toA, kind: l.kind || 'warp', facing: null,
      auto: !!l.aLand,
    }));
  }
  return out;
}));

/** Every directed warp that leaves `mapId`. */
export function warpsFrom(mapId) { return WORLD_NODES.filter((n) => n.from === mapId); }
/** Every directed warp that arrives in `mapId`. */
export function warpsInto(mapId) { return WORLD_NODES.filter((n) => n.to === mapId); }

/** Where you should stand after travelling `from -> to`, if the graph knows. */
export function arrivalFor(fromId, toId) {
  const n = WORLD_NODES.find((w) => w.from === fromId && w.to === toId && w.toXY);
  return n ? { x: n.toXY.x, y: n.toXY.y, dir: n.dir } : null;
}

/**
 * How wide the mouth of an exit is, in tiles. A door is a door — one tile, you
 * aim for it. But a road leaving town is a road: threading a single square at
 * the end of a sixty-tile map feels like a bug even when it isn't, so roads and
 * cave mouths get a three-tile span you can hit at a walk.
 */
const EXIT_SPAN = { road: 3, cave: 3, well: 1, stairs: 1, door: 1 };

/** Lay every declared warp trigger onto a freshly built map. */
function applyWarpNodes(map, mapId) {
  for (const n of warpsFrom(mapId)) {
    if (!n.auto || !n.toXY) continue;
    const { x, y } = n.fromXY;
    if (!map.inBounds(x, y)) continue;

    const span = EXIT_SPAN[n.kind] || 1;
    const half = (span - 1) / 2;
    // Widen across the road, not along it: a warp on the left/right edge spreads
    // vertically, one on the top/bottom edge spreads horizontally.
    const vertical = n.dir === 'left' || n.dir === 'right';

    for (let o = -half; o <= half; o++) {
      const tx = vertical ? x : x + o;
      const ty = vertical ? y + o : y;
      if (!map.inBounds(tx, ty)) continue;
      // Never carve a mouth through something solid that was placed deliberately;
      // the centre tile is always opened, the shoulders only if they are clear.
      if (o !== 0 && map.solidAt(tx, ty)) continue;
      openDoorway(map, tx, ty);
      map.addTrigger({
        id: o === 0 ? n.id : `${n.id}#${o}`, kind: 'warp', x: tx, y: ty,
        facing: n.facing || null,
        data: { map: n.to, x: n.toXY.x, y: n.toXY.y, dir: n.dir, kind: n.kind },
      });
    }
    map.exits[n.to] = { x, y, dir: n.dir };
  }

  // Now the other direction: every warp that LANDS here. applyWarpNodes only
  // ever cleared the tile you step ON, in the map that owns the warp — nothing
  // guaranteed the tile you arrive at was walkable, because it belongs to a
  // different map built by different code. A decorative prop scattered onto a
  // landing tile silently strands the player inside scenery (this is exactly
  // what sealed the road out of Rosymorn Monastery). Clearing the arrival tile
  // costs nothing and makes the whole warp graph self-healing.
  for (const n of warpsInto(mapId)) {
    if (!n.toXY) continue;
    const { x, y } = n.toXY;
    if (!map.inBounds(x, y)) continue;
    if (!map.solidAt(x, y)) continue;         // already fine, leave the art alone
    map.set('deco', x, y, 0);                 // whatever was dropped here loses
    map.clearFlag(x, y, TF.SOLID | TF.WATER | TF.DAMAGE);
  }
  return map;
}

// ---------------------------------------------------------------------------
// 3. PHANDALIN
// ---------------------------------------------------------------------------
//
//   x:  0        10        20        30        40        50      59
//  y 6                                        [ Edermath Orchard ]
//   12   [cottage]                            (apple rows, Daran)
//   17   ------------------ east lane ------------------------------
//   19   ..... north-west road (Neverwinter Wood) .....  [ Tresendar ]
//   20        [ Stonehill Inn ]   [Dendrar]  [cottage]   [   Manor  ]
//   24   [Shrine]        [Barthen's]
//   28        town square + well
//   30   ================ THE TRIBOAR TRAIL (east) ==================
//   33   [Miner's] [Townmaster's]      [Lionshield]      [Sleeping Giant]
//   38   ------------------ south lane ------------------------------
//   41   [ Alderleaf Farm: fences, crops, halfling burrow ]  [cottages]

const TOWN_GRASS = [['GRASS', 9], ['GRASS_2', 5], ['GRASS_3', 3], ['GRASS_4', 3], ['CLOVER', 2]];
const TOWN_ROAD = [['DIRT_PATH', 8], ['DIRT', 3]];

function buildPhandalin(root) {
  const map = new TileMap({
    w: 60, h: 50, id: 'phandalin', name: 'Phandalin', biome: 'city',
    indoor: false, music: 'town', safe: true, encounterRate: 0,
    region: 'phandalin-hills',
  });
  const res = reservedFor('phandalin');
  const rg = root.fork('ground');
  const rd = root.fork('detail');
  const grass = table(TOWN_GRASS);
  const road = table(TOWN_ROAD);

  // --- 1. the hillside -----------------------------------------------------
  groundNoise(map, rg, 0, 0, 60, 50, grass);

  // Rough scrub and boulders around the rim, so the town sits in a bowl.
  scatter(map, rg, 0, 0, 60, 8, table([['TREE_OAK', 6], ['BUSH', 3], ['ROCK', 2], ['GRASS_TALL', 2]]), 0.34, res);
  scatter(map, rg, 0, 44, 60, 6, table([['TREE_OAK', 5], ['BUSH', 4], ['ROCK', 2]]), 0.22, res);
  scatter(map, rg, 0, 8, 4, 40, table([['TREE_OAK', 4], ['BUSH', 4], ['BOULDER', 2], ['ROCK', 2]]), 0.28, res);
  scatter(map, rg, 55, 8, 5, 40, table([['TREE_OAK', 4], ['BUSH', 3], ['BOULDER', 3], ['ROCK', 2]]), 0.3, res);

  // --- 2. the roads --------------------------------------------------------
  // The Triboar Trail runs straight through, east to west.
  for (let y = 29; y <= 31; y++) for (let x = 1; x <= 58; x++) floor(map, x, y, pickT(rg, road));
  // The cross street, north to the inn and south to the farm.
  for (let x = 23; x <= 25; x++) for (let y = 10; y <= 40; y++) floor(map, x, y, pickT(rg, road));
  // The north-west road out to Neverwinter Wood.
  for (let y = 19; y <= 21; y++) for (let x = 1; x <= 25; x++) floor(map, x, y, pickT(rg, road));
  // The east lane past the orchard and up to Tresendar Manor.
  for (let y = 17; y <= 18; y++) for (let x = 25; x <= 53; x++) floor(map, x, y, pickT(rg, road));
  // The south lane behind the shops.
  for (let y = 38; y <= 39; y++) for (let x = 6; x <= 53; x++) floor(map, x, y, pickT(rg, road));
  // Connectors between the trail and the south lane.
  for (const cx of [12, 31, 44]) for (let y = 31; y <= 38; y++) { floor(map, cx, y, pickT(rg, road)); floor(map, cx + 1, y, pickT(rg, road)); }
  // Down to the farm gate.
  for (let y = 39; y <= 41; y++) { floor(map, 16, y, pickT(rg, road)); floor(map, 17, y, pickT(rg, road)); }

  // --- 3. the square -------------------------------------------------------
  // A green paved round its edge: a flagged kerb frames the cobbles so the
  // square reads as a PLACE and not as a patch of road, an old oak shades the
  // inn's corner of it, and the well, a trough and two market stalls give the
  // Triboar Trail something to pass through rather than just a width.
  const cob = tid('COBBLE', 'FLAGSTONE'), kerb = tid('FLAGSTONE', 'COBBLE');
  floorRect(map, 19, 27, 11, 7, cob);
  for (let x = 19; x <= 29; x++) { floor(map, x, 27, kerb); floor(map, x, 33, kerb); }
  for (const y of [28, 32]) { floor(map, 19, y, kerb); floor(map, 29, y, kerb); }
  floorRect(map, 15, 27, 4, 2, tid('DIRT_PATH', 'DIRT'));   // apron in front of the inn
  floorRect(map, 8, 28, 6, 1, tid('DIRT_PATH', 'DIRT'));    // apron in front of the shrine
  prop(map, 27, 28, tid('WELL', 'FOUNTAIN'), res);
  prop(map, 28, 28, tid('TROUGH', 'BARREL'), res);
  bigOak(map, 19, 27);
  for (const [px, py] of [[26, 27], [28, 27], [26, 29], [28, 29]]) if (rd.chance(0.5)) gset(map, px, py, kerb);
  // Market day's two regular stalls, on the south kerb out of the Trail's way.
  prop(map, 27, 33, tid('MARKET_STALL', 'CRATE'), res);
  prop(map, 29, 33, tid('MARKET_STALL', 'CRATE'), res);
  prop(map, 28, 33, tid('BARREL', 'CRATE'), res);

  // --- 4. the buildings ----------------------------------------------------
  // Each reads as what it is before you read its sign. Every door tile and
  // door row here is load-bearing — LINKS warps to them and data/npcs.js
  // stands people in front of them — so the shapes grow round the doors.
  // Where a footprint changed, `interior:` is left off: the room inside is
  // sized from the footprint its own builder DECLARES, and that has not moved.
  building(map, {
    x: 14, y: 20, w: 8, h: 7, wall: 'WATTLE_WALL', roof: 'thatch', lit: true,
    roofRows: 3, door: 3, windows: [1, 5, 6], upper: [1, 3, 6], sign: 2, trade: 'inn', band: 4,
    chimney: 6, chimney2: 1, approach: 3, interior: 'stonehill-inn', porch: 3, lantern: true, dormer: [4],
  }, res);                            // Stonehill Inn — the tall one: two rows
                                      // of lit windows under a deep thatch roof
  building(map, {
    x: 29, y: 23, w: 7, h: 6, wall: 'TIMBER_WALL', roof: 'shingle', interior: 'barthens-provisions',
    roofRows: 2, door: 3, windows: [1, 5], upper: [1, 3, 5], sign: 4, trade: 'goods', chimney: 1,
    loading: [5, 6], approach: 1, porch: 3,
  }, res);                            // Barthen's Provisions — a merchant's
                                      // framed front and a wagon door in the
                                      // footing for the cargo it swallows
  building(map, {
    x: 33, y: 32, w: 7, h: 6, wall: 'STONE_WALL', roof: 'slate', base: 'GRAVEL',
    roofRows: 2, door: 3, windows: [1, 5], upper: [1, 3, 5], sign: 2, trade: 'arms', chimney: 5, approach: 1,
    porch: 3,
  }, res);                            // Lionshield Coster — the stone store of
                                      // a coster that ships arms, two storeys
  // the Coster's yard, where its wagons load
  fenceRect(map, 40, 33, 4, 5, { x: 41, y: 37 }, res);
  for (const [px, py, k] of [[41, 34, 'CRATE'], [42, 34, 'CRATE'], [42, 35, 'BARREL'], [41, 35, 'SACK']]) prop(map, px, py, tid(k, 'CRATE'), res);
  // The Shrine of Luck: a stone chapel with Tymora's bell in a turret at its
  // west end and two lancets of stained glass beside the door.
  building(map, {
    x: 10, y: 22, w: 4, h: 6, wall: 'STONE_WALL', roof: 'slate', base: 'GRAVEL', lit: true,
    roofRows: 2, door: 0, stained: [1, 2], approach: 1, lantern: 'right',
  }, res);
  tower(map, { x: 8, y: 22, w: 2, h: 6, wall: 'STONE_WALL', roof: 'slate', windows: [3], base: 'GRAVEL' }, res);
  building(map, {
    x: 5, y: 33, w: 7, h: 5, wall: 'STONE_WALL', roof: 'tile', base: 'GRAVEL',
    roofRows: 2, door: 3, windows: [1, 5], sign: 2, trade: 'coin', chimney: 1, approach: 1,
    interior: 'miners-exchange', porch: 3, dormer: [5],
  }, res);                            // The Miner's Exchange — a counting-house
  // The Townmaster's Hall: the town's one framed-and-slated public building,
  // two storeys, a bell turret rising out of its west gable.
  building(map, {
    x: 14, y: 32, w: 8, h: 6, wall: 'TIMBER_WALL', roof: 'slate',
    roofRows: 2, door: 3, windows: [1, 5, 6], upper: [2, 3, 5, 6], chimney: 6, approach: 1,
    porch: 3, lantern: true,
  }, res);
  pyramidRoof(map, 14, 32, 2, 'slate');
  building(map, {
    x: 47, y: 32, w: 7, h: 6, wall: 'LOG_WALL', roof: 'thatch',
    roofRows: 3, door: 3, shutters: [1, 5], sign: 2, trade: 'inn', chimney: 1, approach: 1,
    roofPatch: [[3, 2], [4, 2]], patchTile: 'TILE_M',
    interior: 'sleeping-giant', porch: true, lantern: true,
  }, res);                            // The Sleeping Giant — boarded windows and
                                      // a roof patched with somebody else's tiles
  oset(map, 53, 36, tid('COBWEB', 'THATCH_M'));                // and never swept
  shell(map, {
    x: 26, y: 19, w: 6, h: 3, wall: 'WATTLE_WALL', roof: 'thatch', roofRows: 1,
    door: 3, windows: [1, 4],
  }, res);                                                     // the boarded Dendrar home
  // Four cottages, four ways of building one: limewashed under thatch, black
  // and white under shakes with a dormer, logs under thatch, render under tile.
  building(map, { x: 9, y: 12, w: 6, h: 5, wall: 'PLASTER_WALL', roof: 'thatch', roofRows: 2, windows: [1, 4], chimney: 4 }, res);
  building(map, { x: 37, y: 19, w: 6, h: 5, wall: 'TIMBER_WALL', roof: 'shingle', roofRows: 2, windows: [1, 4], chimney: 1, dormer: [3] }, res);
  building(map, { x: 39, y: 40, w: 6, h: 5, wall: 'LOG_WALL', roof: 'thatch', roofRows: 3, windows: [1, 4], chimney: 4 }, res);
  building(map, { x: 48, y: 41, w: 6, h: 5, wall: 'PLASTER_WALL', roof: 'tile', roofRows: 3, windows: [1, 4], chimney: 1 }, res);
  // A farrier on the Trail: an open forge shed facing the road in, so the
  // first thing a caravan hears in Phandalin is a hammer.
  building(map, {
    x: 39, y: 25, w: 5, h: 3, wall: 'SHED_WALL', roof: 'shingle', roofRows: 2, open: true,
    inside: [[1, 'FORGE'], [3, 'WEAPON_RACK']], chimney: 1, sign: 2, trade: 'smith',
  }, res);
  prop(map, 41, 28, tid('ANVIL', 'FORGE'), res);
  prop(map, 43, 28, tid('TROUGH', 'BARREL'), res);
  prop(map, 39, 28, tid('GRINDSTONE', 'ROCK'), res);

  // --- 5. Tresendar Manor: a burnt shell on the eastern rise ---------------
  const rubble = table([['RUBBLE', 5], ['ROCK', 3], ['BONES', 1]]);
  floorRect(map, 44, 19, 9, 9, tid('GRAVEL', 'DIRT'));
  floorRect(map, 45, 20, 7, 7, tid('STONE_FLOOR_CRACKED', 'STONE_FLOOR'));
  dframe(map, 44, 19, 9, 9, tid('RUINED_WALL', 'STONE_WALL'));
  floor(map, 48, 19, tid('FLAGSTONE', 'STONE_FLOOR'));         // the broken gate
  floor(map, 48, 18, tid('FLAGSTONE', 'COBBLE'));
  for (const [px, py] of [[45, 21], [51, 22], [46, 26], [50, 26], [45, 25]]) prop(map, px, py, pickT(rd, rubble), res);
  prop(map, 46, 20, tid('PILLAR', 'RUBBLE'), res);
  prop(map, 50, 20, tid('PILLAR', 'RUBBLE'), res);
  prop(map, 44, 28, tid('DEAD_TREE', 'TREE_OAK'), res);
  floor(map, 48, 23, tid('STAIRS_DOWN', 'FLAGSTONE'));         // down into the Redbrand hideout
  for (let y = 24; y <= 26; y++) floor(map, 48, y, tid('STONE_FLOOR', 'FLAGSTONE'));
  scatter(map, rd, 41, 28, 12, 3, table([['ROCK', 4], ['BUSH', 3], ['GRASS_TALL', 3]]), 0.3, res);

  // --- 6. Edermath Orchard -------------------------------------------------
  // The hand-written version of this — turf, groundNoise, four ranks of oaks,
  // a fence with a gate — is what `orchard()` now is, so this is one call and
  // the next orchard anybody plants is one more.
  orchard(map, { x: 40, y: 6, w: 14, h: 11 }, rg, {
    res, gate: { x: 46, y: 16 }, rows: 2, cols: 2,
    turf: table([['GRASS_3', 6], ['CLOVER', 4], ['GRASS', 3]]),
  });
  prop(map, 45, 17, tid('SIGN', 'FENCE_H'), res);
  prop(map, 52, 15, tid('BERRY_BUSH', 'BUSH'), res);
  prop(map, 42, 15, tid('CART', 'CRATE'), res);
  prop(map, 41, 16, tid('BARREL', 'CRATE'), res);

  // --- 7. Alderleaf Farm ---------------------------------------------------
  floorRect(map, 10, 42, 15, 5, tid('FARMLAND', 'DIRT'));
  for (let y = 42; y <= 46; y++) for (let x = 18; x <= 24; x++) gset(map, x, y, tid(rd.chance(0.6) ? 'CROP_WHEAT' : 'CROP_CABBAGE', 'FARMLAND'));
  for (let x = 10; x <= 12; x++) gset(map, x, 46, tid('CROP_CABBAGE', 'FARMLAND'));
  // the path in from the gate, and west to the burrow door
  for (let y = 41; y <= 45; y++) floor(map, 16, y, tid('DIRT_PATH', 'DIRT'));
  for (let x = 13; x <= 16; x++) floor(map, x, 45, tid('DIRT_PATH', 'DIRT'));
  // the halfling burrow: a turfed mound with a round door in the south face
  const hedge = tid('HEDGE', 'BUSH');
  for (let x = 11; x <= 15; x++) prop(map, x, 43, hedge, res);
  for (const hx of [11, 12, 14, 15]) prop(map, hx, 44, hedge, res);
  gset(map, 13, 44, tid('WOOD_FLOOR_H', 'DIRT'));
  dset(map, 13, 44, tid('DOOR_CLOSED', 'DOOR_OPEN'));
  prop(map, 11, 42, tid('BUSH', 'HEDGE'), res);
  prop(map, 15, 42, tid('BUSH', 'HEDGE'), res);
  fenceRect(map, 9, 41, 17, 7, { x: 16, y: 41 }, res);
  prop(map, 18, 47, tid('SACK', 'CRATE'), res);
  prop(map, 10, 41, tid('SIGN', 'FENCE_H'), res);
  prop(map, 22, 41, tid('CART', 'CRATE'), res);

  // --- 8. the pig sty, the woodpile, the carts ----------------------------
  // Everything here is placed against a wall or along a frontage. A barrel
  // standing in the middle of a street reads as a barrel that fell off the
  // sprite sheet; the same barrel tucked into the corner where a wall meets the
  // ground reads as a barrel somebody put down.
  floorRect(map, 3, 24, 5, 5, tid('MUD', 'DIRT'));
  fenceRect(map, 3, 24, 5, 5, { x: 5, y: 28 }, res);
  prop(map, 4, 25, tid('SACK', 'CRATE'), res);
  prop(map, 6, 26, tid('BARREL', 'CRATE'), res);

  // Barthen's: the wagon door in the base course, and the cargo it swallows.
  // The stack runs up the west wall and out along the front where a cart backs in.
  for (const [px, py] of [[28, 25], [28, 26], [28, 27], [28, 28], [36, 27]]) prop(map, px, py, tid('CRATE', 'BARREL'), res);
  prop(map, 36, 28, tid('BARREL', 'CRATE'), res);
  prop(map, 37, 27, tid('SACK', 'CRATE'), res);
  prop(map, 34, 29, tid('CRATE', 'BARREL'), res);              // under the wagon door
  prop(map, 35, 29, tid('SACK', 'CRATE'), res);
  prop(map, 29, 29, tid('CART', 'CRATE'), res);

  // The Stonehill Inn's frontage: a bench under the windows, barrels of ale
  // stood against the east end, a handcart parked round the corner.
  prop(map, 15, 27, tid('BENCH', 'CRATE'), res);
  prop(map, 21, 27, tid('KEG', 'BARREL'), res);
  prop(map, 22, 27, tid('CART', 'CRATE'), res);

  // the woodpile stacked along the Sleeping Giant's west wall
  for (const [px, py] of [[46, 33], [46, 34], [46, 35]]) prop(map, px, py, tid('CRATE', 'BARREL'), res);
  prop(map, 45, 35, tid('STUMP', 'ROCK'), res);
  prop(map, 46, 36, tid('BARREL', 'CRATE'), res);
  prop(map, 47, 38, tid('BONES', 'RUBBLE'), res);              // nobody sweeps up here
  prop(map, 53, 38, tid('BARREL', 'CRATE'), res);
  prop(map, 54, 36, tid('RUBBLE', 'ROCK'), res);
  prop(map, 45, 31, tid('DEAD_TREE', 'STUMP'), res);

  // shop frontages: crates by the Coster's door, ore and sacks at the Exchange,
  // benches outside the Townmaster's where petitioners wait
  prop(map, 32, 38, tid('CRATE', 'BARREL'), res);
  prop(map, 44, 36, tid('CART', 'CRATE'), res);
  prop(map, 4, 38, tid('CRATE', 'BARREL'), res);
  prop(map, 11, 38, tid('SACK', 'CRATE'), res);
  prop(map, 12, 34, tid('GRINDSTONE', 'ROCK'), res);
  prop(map, 12, 36, tid('ORE_IRON', 'ROCK'), res);
  prop(map, 14, 38, tid('BENCH', 'CRATE'), res);
  prop(map, 21, 38, tid('BENCH', 'CRATE'), res);
  noticeBoard(map, 22, 33, res);                               // the Townmaster's bounty board
  prop(map, 14, 22, tid('BARREL', 'CRATE'), res);
  prop(map, 12, 28, tid('STATUE', 'SHRINE'), res);             // Tymora's coin outside the shrine
  prop(map, 8, 28, tid('SHRINE', 'STATUE'), res);
  prop(map, 7, 27, tid('BUSH', 'ROCK'), res);
  prop(map, 56, 29, tid('SIGN', 'FENCE_H'), res);              // "PHANDALIN"
  prop(map, 2, 22, tid('SIGN', 'FENCE_H'), res);
  // cottage yards: a woodpile against each gable end
  prop(map, 15, 16, tid('CRATE', 'BARREL'), res);
  prop(map, 43, 19, tid('BARREL', 'CRATE'), res);
  prop(map, 45, 44, tid('CRATE', 'BARREL'), res);
  prop(map, 47, 45, tid('BARREL', 'CRATE'), res);
  // low stone walls, each run butted INTO a building corner rather than left
  // floating in the open: the inn's yard, Barthen's boundary, the tavern's.
  for (const [px, py] of [[22, 24], [22, 25], [22, 26], [28, 24], [27, 24], [26, 24], [45, 32], [46, 32]]) {
    prop(map, px, py, tid('STONE_FENCE', 'FENCE_H'), res);
  }
  // a scattering of flowers and tall grass in the corners nobody mows
  scatter(map, rd, 50, 44, 8, 5, table([['FLOWERS_BLUE', 3], ['BUSH', 3], ['ROCK', 2]]), 0.24, res);

  // --- 8a. the mill ---------------------------------------------------------
  // Alderleaf's wheat has to be ground somewhere: a tower mill on the rise
  // south of the lane, sails turning over the track that runs up to it, sacks
  // at its door and a cart waiting for them.
  drect(map, 27, 40, 9, 8, 0);
  windmill(map, { x: 30, y: 40, wall: 'PLASTER_WALL', roof: 'thatch' }, res);
  for (let y = 45; y <= 46; y++) gset(map, 31, y, tid('DIRT_PATH', 'DIRT'));
  for (const [px, py, k] of [[29, 44, 'SACK'], [33, 44, 'SACK'], [28, 44, 'CART'], [33, 43, 'SACK']]) prop(map, px, py, tid(k, 'CRATE'), res);

  // --- 8b. the burying ground ---------------------------------------------
  // Up the slope behind the Shrine of Luck, across the Neverwinter road. Old
  // Phandalin was destroyed and re-founded; the stones are older than the town
  // that stands here now, which is the reason the fence is stone and the tree
  // in the corner has been dead a long time. Cleared of scrub first — the rim
  // scatter above threw oaks through here and a wall wants a line to run on.
  drect(map, 1, 11, 9, 7, 0);
  graveyard(map, { x: 1, y: 11, w: 9, h: 7 }, rd, { res, gate: { x: 5, y: 17 } });
  for (let y = 18; y <= 19; y++) gset(map, 5, y, tid('DIRT_PATH', 'DIRT'));
  signpost(map, 3, 18, 'THE OLD BURYING GROUND. Names on half the stones and not one of them a Phandalin family living. Tymora keep them.', res);

  // --- 9. flags, triggers, signs ------------------------------------------
  map.recomputeFlags({ keep: 0 });
  // Wear: the square, the crossroads and the well head are where a town's feet
  // actually go, so the paving shows through in drifts there and nowhere else.
  wearPatches(map, rd, { x: 19, y: 27, w: 11, h: 7 }, 'COBBLE_ISLE', 6, { res });
  wearPatches(map, rd, { x: 22, y: 28, w: 5, h: 5 }, 'PATH_ISLE', 3, { res });
  wearPatches(map, rd, { x: 1, y: 29, w: 58, h: 3 }, 'DIRT_ISLE', 10, { res });
  wearPatches(map, rd, { x: 23, y: 10, w: 3, h: 30 }, 'DIRT_ISLE', 6, { res });
  map.recomputeFlags({ keep: 0 });
  sealBorder(map, tid('TREE_OAK', 'BLACK'));
  openDoorway(map, 13, 44);
  map.spawn = { x: 24, y: 30 };
  map.entry = { x: 24, y: 30 };
  map.level = 1;

  addSign(map, 56, 29, 'PHANDALIN — Founded on the ruins of old Phandalin. Mind the Redbrands.');
  addSign(map, 2, 22, 'NORTH-WEST: Neverwinter Wood. Travellers are advised to go armed.');
  addSign(map, 45, 17, 'EDERMATH ORCHARD — apples, cider, and no trespassing.');
  addSign(map, 10, 41, "ALDERLEAF FARM — Qelline Alderleaf, prop. Mind the hens.");
  addSign(map, 22, 33, 'TOWNMASTER’S NOTICE BOARD — bounties posted by Harbin Wester.');
  addSign(map, 27, 28, 'The town well. Cold, sweet water, and a bucket on a good rope.');
  map.addTrigger({ id: 'phandalin-manor-sign', kind: 'sign', x: 48, y: 18, data: { text: 'Tresendar Manor. Burnt out a century ago; the cellars are still down there.' } });
  map.addTrigger({ id: 'phandalin-inn-rest', kind: 'inn', x: 17, y: 27, data: { shop: 'stonehill-inn', cost: 5, npc: 'toblen-stonehill' } });

  return map;
}

// ---------------------------------------------------------------------------
// 4. PHANDALIN INTERIORS
// ---------------------------------------------------------------------------

// --- the Stonehill Inn: hearth, bar, tables, stairs. The rest point. --------
function buildStonehillInn(root) {
  // Sized from the house outside: `building()` draws the inn 8x7 on the
  // Phandalin map, and `interiorFor` turns that into 8*2+4 x 7*2+2 = 20x16.
  // The door stays at (10,15), which is what WORLD_NODES warps to.
  const map = interiorFor('stonehill-inn', {
    name: 'The Stonehill Inn', music: 'inn', footprint: { w: 8, h: 7 },
  });
  const res = reservedFor('stonehill-inn');
  const r = root.fork('inn');
  // Three rooms, not one box: the kitchen behind the bar, the snug with the
  // stair in it, and the common room the front door opens into.
  const rm = room(map, {
    w: 20, h: 16, floor: 'WOOD_FLOOR', wall: 'WATTLE_WALL', exit: 10,
    rooms: [
      { x: 0, y: 0, w: 6, h: 6, door: 'e', name: 'kitchen' },
      { x: 14, y: 0, w: 6, h: 6, door: 's', floor: 'CARPET_RED', name: 'snug' },
    ],
  });

  // the kitchen: range, pot, dresser, and the cat that lives under the table
  prop(map, 1, 1, tid('HEARTH', 'BRAZIER'), res);
  prop(map, 2, 1, tid('COOKING_POT', 'BARREL'), res);
  prop(map, 4, 1, tid('SHELF_GOODS', 'BOOKSHELF'), res);
  prop(map, 1, 3, tid('TABLE', 'BENCH'), res);
  prop(map, 1, 4, tid('BARREL', 'CRATE'), res);

  // hearth wall, west, in the common room
  prop(map, 1, 8, tid('HEARTH', 'BRAZIER'), res);
  prop(map, 1, 9, tid('HEARTH', 'BRAZIER'), res);
  floorRect(map, 2, 7, 3, 4, tid('CARPET_RED', 'WOOD_FLOOR'));

  // the bar, with Toblen's shelves behind it
  for (let x = 7; x <= 11; x++) prop(map, x, 5, tid('BAR', 'COUNTER'), res);
  for (let x = 7; x <= 12; x++) prop(map, x, 1, tid('SHELF_GOODS', 'BOOKSHELF'), res);
  // the kegs on their gantry at the end of the bar, spigots out
  prop(map, 13, 1, tid('KEG', 'BARREL'), res);
  prop(map, 6, 5, tid('KEG', 'BARREL'), res);
  prop(map, 6, 4, tid('KEG', 'BARREL'), res);

  // common-room tables
  const tableAt = (tx, ty) => {
    prop(map, tx, ty, tid('TABLE', 'BENCH'), res);
    prop(map, tx - 1, ty, tid('CHAIR', 'BENCH'), res);
    prop(map, tx + 1, ty, tid('CHAIR', 'BENCH'), res);
    if (r.chance(0.6)) prop(map, tx, ty + 1, tid('CHAIR', 'BENCH'), res);
    prop(map, tx, ty, tid('TABLE', 'BENCH'), res);
  };
  tableAt(4, 12); tableAt(12, 8); tableAt(15, 12); tableAt(8, 9);
  prop(map, 12, 4, tid('CANDLE', 'TORCH'), res);

  // the snug, and the stairs up to the guest rooms
  prop(map, 15, 4, tid('BOOKSHELF', 'SHELF_GOODS'), res);
  floor(map, 17, 1, tid('STAIRS_UP', 'WOOD_FLOOR'));
  floor(map, 17, 2, tid('WOOD_FLOOR_H', 'WOOD_FLOOR'));
  prop(map, 18, 3, tid('CHAIR', 'BENCH'), res);
  prop(map, 15, 1, tid('TABLE', 'BENCH'), res);

  oset(map, 9, 7, tid('CHANDELIER', 'CANDLE'));
  oset(map, 17, 3, tid('CHANDELIER', 'CANDLE'));

  finishInterior(map, rm.exit, res);
  map.addTrigger({ id: 'stonehill-rest', kind: 'rest', x: 17, y: 2, w: 1, h: 1, data: { inn: true, cost: 5, text: 'A straw mattress, a shuttered window and no Redbrands. Rest here?' } });
  map.addTrigger({ id: 'stonehill-shop', kind: 'shop', x: 9, y: 6, data: { shop: 'stonehill-inn', npc: 'toblen-stonehill' } });
  return map;
}

// --- Barthen's Provisions: counter, shelves, sacks --------------------------
function buildBarthens(root) {
  // 7x6 outside on the Phandalin map -> 18x14 in here.
  const map = interiorFor('barthens-provisions', {
    name: "Barthen's Provisions", music: 'shop', footprint: { w: 7, h: 6 },
  });
  const res = reservedFor('barthens-provisions');
  const r = root.fork('barthens');
  // The shop floor, and the store behind it that the shop floor is the front of.
  const rm = room(map, {
    w: 18, h: 14, floor: 'WOOD_FLOOR_H', wall: 'WATTLE_WALL', exit: 9,
    rooms: [{ x: 0, y: 8, w: 5, h: 6, door: 'e', name: 'store' }],
  });

  for (let x = 6; x <= 11; x++) prop(map, x, 4, tid('COUNTER', 'TABLE'), res);
  for (let x = 2; x <= 15; x++) prop(map, x, 1, tid('SHELF_GOODS', 'BOOKSHELF'), res);
  for (let y = 1; y <= 6; y++) { prop(map, 1, y, tid('SHELF_GOODS', 'BOOKSHELF'), res); prop(map, 16, y, tid('SHELF_GOODS', 'BOOKSHELF'), res); }
  // the store's stock, and the overflow stacked against the east wall outside it
  for (const [x, y] of [[1, 9], [2, 9], [1, 12], [3, 12], [13, 8], [14, 8], [13, 9], [14, 10]]) prop(map, x, y, pickT(r, table([['CRATE', 5], ['BARREL', 4], ['SACK', 3]])), res);
  prop(map, 8, 3, tid('CANDLE', 'TORCH'), res);
  prop(map, 1, 11, tid('CART', 'CRATE'), res);
  prop(map, 15, 11, tid('BARREL', 'CRATE'), res);
  oset(map, 9, 6, tid('CHANDELIER', 'CANDLE'));

  finishInterior(map, rm.exit, res);
  map.addTrigger({ id: 'barthens-shop', kind: 'shop', x: 8, y: 5, data: { shop: 'barthens-provisions', npc: 'elmar-barthen' } });
  return map;
}

// --- The Lionshield Coster: weapon racks, armour stands ---------------------
function buildLionshield(root) {
  // 7x5 outside -> 18x12 in here.
  const map = interiorFor('lionshield-coster', {
    name: 'The Lionshield Coster', music: 'shop', footprint: { w: 7, h: 5 },
  });
  const res = reservedFor('lionshield-coster');
  const r = root.fork('lionshield');
  const rm = room(map, {
    w: 18, h: 12, floor: 'STONE_FLOOR', wall: 'STONE_WALL', exit: 9,
    rooms: [{ x: 13, y: 6, w: 5, h: 6, door: 'w', floor: 'STONE_FLOOR', name: 'stock' }],
  });

  for (let x = 6; x <= 11; x++) prop(map, x, 5, tid('COUNTER', 'TABLE'), res);
  // An arms coster's wall is arms: racks of blades and spears between the
  // stands the mail hangs on, and a shelf of the small goods between them.
  for (let x = 2; x <= 15; x++) prop(map, x, 1, tid(['WEAPON_RACK', 'ARMOR_STAND', 'WEAPON_RACK', 'SHELF_GOODS'][x % 4], 'SHELF_GOODS'), res);
  for (let y = 1; y <= 5; y++) prop(map, 1, y, tid(y & 1 ? 'WEAPON_RACK' : 'ARMOR_STAND', 'SHELF_GOODS'), res);
  for (let y = 1; y <= 5; y++) prop(map, 16, y, tid(y & 1 ? 'ARMOR_STAND' : 'WEAPON_RACK', 'SHELF_GOODS'), res);
  prop(map, 3, 8, tid('ARMOR_STAND', 'PILLAR'), res);
  prop(map, 5, 8, tid('ARMOR_STAND', 'PILLAR'), res);
  prop(map, 2, 9, tid('CRATE', 'BARREL'), res);
  // the stock room behind the shop: crated shipments, and the Coster's brand
  prop(map, 14, 7, tid('CRATE', 'BARREL'), res);
  prop(map, 16, 7, tid('CRATE', 'BARREL'), res);
  prop(map, 16, 10, tid('BARREL', 'CRATE'), res);
  prop(map, 14, 10, tid('SACK', 'CRATE'), res);
  prop(map, 5, 3, tid('ANVIL', 'GRINDSTONE'), res);
  prop(map, 12, 3, tid('GRINDSTONE', 'ANVIL'), res);
  prop(map, 1, 7, tid('FORGE', 'HEARTH'), res);
  prop(map, 8, 4, tid('CANDLE', 'TORCH'), res);
  oset(map, 9, 6, tid('CHANDELIER', 'CANDLE'));

  finishInterior(map, rm.exit, res);
  map.addTrigger({ id: 'lionshield-shop', kind: 'shop', x: 8, y: 7, data: { shop: 'lionshield-coster', npc: 'linene-graywind' } });
  return map;
}

// --- The Shrine of Luck: Tymora's altar, candles ----------------------------
function buildShrineOfLuck(root) {
  // 6x6 outside -> 16x14 in here.
  const map = interiorFor('shrine-of-luck', {
    name: 'The Shrine of Luck', music: 'temple', footprint: { w: 6, h: 6 },
    ambient: { color: '#3a2c10', alpha: 0.1 },
  });
  const res = reservedFor('shrine-of-luck');
  const r = root.fork('shrine');
  // The nave, and Sister Garaele's vestry off the west side of it.
  const rm = room(map, {
    w: 16, h: 14, floor: 'STONE_FLOOR', wall: 'STONE_WALL', exit: 8,
    rooms: [{ x: 0, y: 7, w: 5, h: 7, door: 'e', floor: 'STONE_FLOOR', name: 'vestry' }],
  });

  floorRect(map, 6, 3, 4, 9, tid('CARPET_BLUE', 'STONE_FLOOR'));
  floorRect(map, 5, 1, 6, 2, tid('MOSAIC', 'FLAGSTONE'));
  prop(map, 7, 2, tid('ALTAR', 'TABLE'), res);
  prop(map, 8, 2, tid('ALTAR', 'TABLE'), res);
  prop(map, 6, 1, tid('STATUE', 'PILLAR'), res);      // Tymora, tossing her coin
  prop(map, 7, 1, tid('ALTAR', 'TABLE'), res);
  prop(map, 8, 1, tid('ALTAR', 'TABLE'), res);
  prop(map, 9, 1, tid('STATUE', 'PILLAR'), res);
  for (const [x, y] of [[5, 3], [10, 3], [5, 6], [10, 6], [5, 9], [10, 9]]) prop(map, x, y, tid('CANDLE', 'TORCH'), res);
  for (const [x, y] of [[2, 2], [13, 2], [2, 11], [13, 11]]) prop(map, x, y, tid('PILLAR', 'BRAZIER'), res);
  // pews either side of the carpet, facing the altar
  for (const py of [4, 6]) for (let px = 2; px <= 4; px++) prop(map, px, py, tid('PEW', 'BENCH'), res);
  for (const py of [4, 6, 8]) for (let px = 11; px <= 13; px++) prop(map, px, py, tid('PEW', 'BENCH'), res);
  prop(map, 10, 4, tid('LECTERN', 'TABLE'), res);
  // the east window over the altar, Tymora's coin in the glass
  for (const wx of [6, 9]) dset(map, wx, 0, tid('IWINDOW_STAINED', 'STONE_WALL'));
  prop(map, 13, 8, tid('BRAZIER', 'CANDLE'), res);
  // the vestry: the shrine's books, its vestments and its offerings box
  prop(map, 1, 8, tid('BOOKSHELF', 'SHELF_GOODS'), res);
  prop(map, 2, 8, tid('BOOKSHELF', 'SHELF_GOODS'), res);
  prop(map, 1, 12, tid('CRATE', 'BARREL'), res);
  prop(map, 3, 12, tid('CANDLE', 'TORCH'), res);
  prop(map, 2, 10, tid('TABLE', 'BENCH'), res);
  oset(map, 8, 5, tid('CHANDELIER', 'CANDLE'));

  finishInterior(map, rm.exit, res);
  map.addTrigger({ id: 'shrine-altar', kind: 'quest', x: 7, y: 3, w: 2, h: 1, data: { deity: 'tymora', text: 'A silver coin spins on the altar of Tymora and never quite falls.' } });
  map.addTrigger({ id: 'shrine-shop', kind: 'shop', x: 8, y: 4, data: { shop: 'shrine-of-luck', npc: 'sister-garaele' } });
  return map;
}

// --- The Miner's Exchange: counter, ore scales ------------------------------
function buildMinersExchange(root) {
  // 7x5 outside -> 18x12 in here.
  const map = interiorFor('miners-exchange', {
    name: "The Miner's Exchange", music: 'shop', footprint: { w: 7, h: 5 },
  });
  const res = reservedFor('miners-exchange');
  const r = root.fork('exchange');
  // The counting floor, and Halia Thornton's strong room behind it — which is
  // where a Zhentarim agent keeps the things a Zhentarim agent keeps.
  const rm = room(map, {
    w: 18, h: 12, floor: 'STONE_FLOOR', wall: 'STONE_WALL', exit: 9,
    rooms: [{ x: 12, y: 6, w: 6, h: 6, door: 'w', floor: 'STONE_FLOOR', name: 'strong room' }],
  });

  for (let x = 6; x <= 12; x++) prop(map, x, 4, tid('COUNTER', 'TABLE'), res);
  prop(map, 5, 4, tid('GRINDSTONE', 'ANVIL'), res);              // the assay scales
  prop(map, 13, 4, tid('ANVIL', 'GRINDSTONE'), res);
  for (let x = 2; x <= 15; x++) prop(map, x, 1, tid('BOOKSHELF', 'SHELF_GOODS'), res);
  for (const [x, y] of [[2, 6], [3, 6], [2, 7], [14, 7], [16, 7], [16, 10]]) prop(map, x, y, tid('CRATE', 'SACK'), res);
  prop(map, 4, 8, tid('ORE_IRON', 'ROCK'), res);
  prop(map, 14, 10, tid('ORE_SILVER', 'ROCK'), res);
  prop(map, 2, 9, tid('ORE_GEM', 'ROCK'), res);
  prop(map, 8, 3, tid('CANDLE', 'TORCH'), res);
  prop(map, 1, 5, tid('TORCH', 'CANDLE'), res);
  prop(map, 16, 5, tid('TORCH', 'CANDLE'), res);

  finishInterior(map, rm.exit, res);
  map.addTrigger({ id: 'exchange-shop', kind: 'shop', x: 9, y: 6, data: { shop: 'miners-exchange', npc: 'halia-thornton' } });
  return map;
}

// --- The Townmaster's Hall: desk, notice board, one cell --------------------
function buildTownmastersHall(root) {
  // 8x5 outside -> 20x12 in here. The exit column is unchanged, so the warp
  // from Phandalin still lands on the same tile.
  const map = interiorFor('townmasters-hall', {
    name: "The Townmaster's Hall", footprint: { w: 8, h: 5 },
  });
  const res = reservedFor('townmasters-hall');
  const r = root.fork('hall');
  // The hall, and the one cell Phandalin has — now a real `partition()` with
  // its iron door rather than a hand-drawn frame that had to be opened by hand.
  const rm = room(map, {
    w: 20, h: 12, floor: 'WOOD_FLOOR', wall: 'WATTLE_WALL', exit: 9,
    rooms: [{
      x: 13, y: 5, w: 5, h: 6, door: { x: 14, y: 5 }, iron: true,
      wall: 'STONE_WALL', floor: 'STONE_FLOOR', name: 'cell',
    }],
  });

  floorRect(map, 5, 3, 8, 5, tid('CARPET_RED', 'WOOD_FLOOR'));
  for (let x = 7; x <= 10; x++) prop(map, x, 4, tid('DESK', 'TABLE'), res);             // Harbin's desk
  prop(map, 6, 4, tid('CHAIR', 'BENCH'), res);
  prop(map, 11, 4, tid('CHAIR', 'BENCH'), res);
  for (let x = 2; x <= 6; x++) prop(map, x, 1, tid('BOOKSHELF', 'SHELF_GOODS'), res);
  prop(map, 9, 1, tid('NOTICE_BOARD', 'SIGN'), res);                                     // the notice board
  prop(map, 12, 1, tid('BOOKSHELF', 'SHELF_GOODS'), res);

  // the cell's furniture: a plank bed and a straw sack, and nothing else
  prop(map, 16, 8, tid('BED', 'BENCH'), res);
  prop(map, 16, 6, tid('SACK', 'CRATE'), res);

  prop(map, 2, 9, tid('BENCH', 'CHAIR'), res);
  prop(map, 3, 9, tid('BENCH', 'CHAIR'), res);
  prop(map, 1, 5, tid('HEARTH', 'BRAZIER'), res);
  prop(map, 8, 3, tid('CANDLE', 'TORCH'), res);

  finishInterior(map, rm.exit, res);
  openDoorway(map, 14, 5);
  addSign(map, 9, 2, 'BOUNTIES POSTED. See the Townmaster. Payment on proof, not on stories.');
  map.addTrigger({ id: 'hall-board', kind: 'quest', x: 9, y: 2, data: { board: 'townmaster', npc: 'harbin-wester' } });
  return map;
}

// --- Alderleaf Farm: a cosy halfling home under the turf --------------------
function buildAlderleafFarm(root) {
  // The burrow is a turfed mound outside, not a `building()`, so it declares
  // the 8x8 footprint the hedge ring on the Phandalin map describes: 20x18.
  const map = interiorFor('alderleaf-farm', {
    name: 'The Alderleaf Burrow', music: 'camp', footprint: { w: 8, h: 8 },
    ambient: { color: '#3a2410', alpha: 0.12 },
  });
  const res = reservedFor('alderleaf-farm');
  const r = root.fork('alderleaf');
  // Kitchen and parlour in front, the sleeping room behind a door — which is
  // how a halfling burrow is dug and how Qelline keeps Carp out of it.
  const rm = room(map, {
    w: 20, h: 18, floor: 'WOOD_FLOOR', wall: 'LOG_WALL', exit: 10,
    rooms: [{ x: 11, y: 0, w: 9, h: 9, door: { x: 15, y: 8 }, floor: 'CARPET_BLUE', name: 'bedroom' }],
  });

  floorRect(map, 3, 3, 6, 6, tid('CARPET_RED', 'WOOD_FLOOR'));
  prop(map, 1, 4, tid('HEARTH', 'BRAZIER'), res);
  prop(map, 1, 5, tid('HEARTH', 'BRAZIER'), res);
  prop(map, 2, 6, tid('COOKING_POT', 'BARREL'), res);
  for (let x = 5; x <= 8; x++) prop(map, x, 2, tid('SHELF_GOODS', 'BOOKSHELF'), res);
  prop(map, 6, 5, tid('TABLE', 'BENCH'), res);
  prop(map, 5, 5, tid('CHAIR', 'BENCH'), res);
  prop(map, 7, 5, tid('CHAIR', 'BENCH'), res);
  prop(map, 6, 6, tid('CHAIR', 'BENCH'), res);
  prop(map, 13, 2, tid('BED', 'BENCH'), res);
  prop(map, 17, 2, tid('BED', 'BENCH'), res);
  prop(map, 18, 6, tid('BOOKSHELF', 'SHELF_GOODS'), res);
  prop(map, 12, 10, tid('BARREL', 'CRATE'), res);
  prop(map, 3, 12, tid('CRATE', 'BARREL'), res);
  prop(map, 2, 13, tid('SACK', 'CRATE'), res);
  prop(map, 17, 12, tid('SACK', 'CRATE'), res);
  prop(map, 17, 13, tid('BARREL', 'CRATE'), res);
  for (const [x, y] of [[4, 3], [9, 3], [4, 10], [15, 6]]) prop(map, x, y, tid('CANDLE', 'TORCH'), res);
  oset(map, 6, 8, tid('CHANDELIER', 'CANDLE'));

  finishInterior(map, rm.exit, res);
  map.addTrigger({ id: 'alderleaf-rest', kind: 'rest', x: 14, y: 2, w: 2, h: 1, data: { text: 'Qelline offers you the spare cot in the back room.' } });
  return map;
}

// --- The Sleeping Giant: a grimy taproom, Redbrand territory ---------------
function buildSleepingGiant(root) {
  // 7x6 outside -> 18x14 in here.
  const map = interiorFor('sleeping-giant', {
    name: 'The Sleeping Giant', music: 'tense', footprint: { w: 7, h: 6 },
    ambient: { color: '#1c1410', alpha: 0.22 },
  });
  const res = reservedFor('sleeping-giant');
  const r = root.fork('giant');
  // The taproom, and the back room the Redbrands drink in when they do not want
  // to be looked at.
  const rm = room(map, {
    w: 18, h: 14, floor: 'WOOD_FLOOR_H', wall: 'LOG_WALL', exit: 9,
    rooms: [{ x: 0, y: 8, w: 5, h: 6, door: 'e', name: 'back room' }],
  });

  for (let x = 5; x <= 9; x++) prop(map, x, 4, tid('BAR', 'COUNTER'), res);
  for (let x = 4; x <= 10; x++) prop(map, x, 1, tid('SHELF_GOODS', 'BOOKSHELF'), res);
  prop(map, 1, 6, tid('HEARTH', 'BRAZIER'), res);
  prop(map, 1, 7, tid('HEARTH', 'BRAZIER'), res);
  prop(map, 3, 2, tid('KEG', 'BARREL'), res);
  prop(map, 12, 2, tid('KEG', 'BARREL'), res);
  prop(map, 13, 3, tid('CRATE', 'BARREL'), res);

  const tableAt = (tx, ty) => {
    prop(map, tx, ty, tid('TABLE', 'BENCH'), res);
    prop(map, tx - 1, ty, tid('CHAIR', 'BENCH'), res);
    prop(map, tx + 1, ty, tid('CHAIR', 'BENCH'), res);
  };
  tableAt(7, 8); tableAt(14, 8); tableAt(8, 11); tableAt(12, 6);
  prop(map, 2, 10, tid('TABLE', 'BENCH'), res);            // the back room's one table
  prop(map, 2, 9, tid('CHAIR', 'BENCH'), res);
  prop(map, 2, 12, tid('CHAIR', 'BENCH'), res);
  prop(map, 15, 11, tid('BONES', 'SACK'), res);
  prop(map, 1, 12, tid('SACK', 'CRATE'), res);
  prop(map, 16, 5, tid('TORCH', 'CANDLE'), res);
  prop(map, 1, 3, tid('TORCH', 'CANDLE'), res);
  oset(map, 9, 7, tid('COBWEB', 'CHANDELIER'));
  oset(map, 3, 3, tid('COBWEB', 'CHANDELIER'));

  finishInterior(map, rm.exit, res);
  map.addTrigger({ id: 'giant-shop', kind: 'shop', x: 7, y: 6, data: { shop: 'sleeping-giant', npc: 'grista' } });
  map.addTrigger({ id: 'giant-recruit', kind: 'script', x: 14, y: 9, data: { kind: 'recruit-board', location: 'sleeping-giant' } });
  return map;
}

// --- Tresendar Manor: a ruined hall and the stair into the hideout ---------
function buildPhandalinManor(root) {
  const map = new TileMap({
    w: 26, h: 26, id: 'phandalin-manor', name: 'Tresendar Manor', biome: 'ruins',
    indoor: true, music: 'tense', encounterRate: 0.04, encounterTable: 'redbrand-patrol',
    ambient: { color: '#0e1018', alpha: 0.34 }, dark: 0.35, region: 'phandalin',
  });
  const res = reservedFor('phandalin-manor');
  const r = root.fork('manor');

  // A roofless hall: cracked flagstones, fallen columns, the sky through the gaps.
  floorRect(map, 0, 0, 26, 26, tid('GRAVEL', 'DIRT'));
  floorRect(map, 1, 1, 24, 24, tid('STONE_FLOOR_CRACKED', 'STONE_FLOOR'));
  dframe(map, 0, 0, 26, 26, tid('RUINED_WALL', 'STONE_WALL'));
  // inner walls: an entrance hall, a great hall, and the stair chamber
  for (let x = 4; x <= 21; x++) dset(map, x, 8, tid('RUINED_WALL', 'STONE_WALL'));
  for (let x = 10; x <= 16; x++) dset(map, x, 8, 0);
  for (let y = 9; y <= 20; y++) { dset(map, 6, y, tid('RUINED_WALL', 'STONE_WALL')); dset(map, 19, y, tid('RUINED_WALL', 'STONE_WALL')); }
  for (let y = 13; y <= 16; y++) { dset(map, 6, y, 0); dset(map, 19, y, 0); }

  // the stair down into the Redbrand hideout, at the back of the entrance hall
  floorRect(map, 11, 1, 5, 7, tid('FLAGSTONE', 'STONE_FLOOR'));
  floor(map, 13, 3, tid('STAIRS_DOWN', 'FLAGSTONE'));
  // the stair back up to the town
  floorRect(map, 12, 21, 3, 4, tid('FLAGSTONE', 'STONE_FLOOR'));
  floor(map, 13, 25, tid('STAIRS_UP', 'FLAGSTONE'));
  for (let y = 4; y <= 24; y++) floor(map, 13, y, tid('FLAGSTONE', 'STONE_FLOOR'));

  const rubble = table([['RUBBLE', 6], ['ROCK', 3], ['BONES', 2], ['BOULDER', 1]]);
  for (const [x, y] of [[8, 3], [18, 4], [3, 12], [22, 12], [9, 19], [17, 19], [4, 22], [21, 22]]) prop(map, x, y, pickT(r, rubble), res);
  for (const [x, y] of [[8, 10], [17, 10], [8, 18], [17, 18]]) prop(map, x, y, tid('PILLAR', 'RUBBLE'), res);
  for (const [x, y] of [[7, 9], [18, 9], [7, 20], [18, 20]]) prop(map, x, y, tid('BRAZIER', 'TORCH'), res);
  prop(map, 10, 14, tid('TABLE', 'CRATE'), res);
  prop(map, 9, 14, tid('CHAIR', 'BENCH'), res);
  prop(map, 16, 14, tid('CRATE', 'BARREL'), res);
  prop(map, 17, 15, tid('BARREL', 'CRATE'), res);
  prop(map, 3, 3, tid('DEAD_TREE', 'RUBBLE'), res);
  scatter(map, r, 1, 1, 24, 24, table([['RUBBLE', 5], ['ROCK', 3], ['BONES', 1]]), 0.05, res);
  oset(map, 5, 5, tid('COBWEB', 'STALACTITE'));
  oset(map, 20, 17, tid('COBWEB', 'STALACTITE'));

  map.recomputeFlags({ keep: 0 });
  sealBorder(map, tid('RUINED_WALL', 'STONE_WALL'));
  for (const k of res) { const [x, y] = k.split(',').map(Number); clearStanding(map, x, y); }
  map.spawn = { x: 13, y: 24 };
  map.entry = { ...map.spawn };
  map.level = 3;
  map.addTrigger({
    id: 'manor-hideout-stair', kind: 'warp', x: 13, y: 3,
    data: { map: 'redbrand-hideout', depth: 1, theme: 'dungeon', dir: 'down', kind: 'stairs' },
  });
  map.addTrigger({ id: 'manor-warning', kind: 'sign', x: 13, y: 20, data: { text: 'Boot prints in the ash, all of them going down.' } });
  return map;
}

// ---------------------------------------------------------------------------
// 5. THE WILDS
// ---------------------------------------------------------------------------

// --- The Triboar Trail ------------------------------------------------------
function buildTriboarTrail(root) {
  const map = new TileMap({
    w: 100, h: 40, id: 'triboar-trail', name: 'The Triboar Trail', biome: 'road',
    indoor: false, music: 'road', encounterRate: 0.055, encounterTable: 'triboar-trail-bandits',
    region: 'triboar-trail',
  });
  const res = reservedFor('triboar-trail');
  const rg = root.fork('ground');
  const rt = root.fork('trees');
  const rd = root.fork('detail');

  groundNoise(map, rg, 0, 0, 100, 40, table([['GRASS', 8], ['GRASS_2', 5], ['GRASS_4', 4], ['GRASS_3', 3]]));

  // roadside woods, thicker the further you get from the ruts
  const wood = table([['TREE_OAK', 7], ['TREE_PINE', 3], ['BUSH', 4], ['STUMP', 1], ['ROCK', 2]]);
  for (let y = 0; y < 40; y++) {
    const dist = Math.min(Math.abs(y - 19), 20);
    const density = dist < 4 ? 0 : Math.min(0.44, (dist - 3) * 0.055);
    for (let x = 0; x < 100; x++) {
      if (!rt.chance(density)) continue;
      prop(map, x, y, pickT(rt, wood), res);
    }
  }
  // tall grass in the verges — where the encounter rolls happen
  for (let y = 0; y < 40; y++) {
    for (let x = 0; x < 100; x++) {
      if (map.deco[y * map.w + x]) continue;
      const dist = Math.abs(y - 19);
      if (dist < 3 || dist > 12) continue;
      if (rg.chance(0.16)) gset(map, x, y, tid('GRASS_TALL', 'GRASS_2'));
    }
  }

  // --- the road itself -----------------------------------------------------
  const ruts = table([['DIRT_PATH', 8], ['DIRT', 3], ['MUD', 1]]);
  for (let y = 18; y <= 20; y++) for (let x = 1; x <= 98; x++) floor(map, x, y, pickT(rg, ruts));
  // the branch north to Neverwinter Wood
  for (let x = 69; x <= 71; x++) for (let y = 1; y <= 18; y++) floor(map, x, y, pickT(rg, ruts));
  // the branch south into the hills, toward Wave Echo Cave
  for (let x = 79; x <= 81; x++) for (let y = 20; y <= 38; y++) floor(map, x, y, pickT(rg, ruts));

  // --- roadside places -----------------------------------------------------
  const clearing = (cx, cy, cw, ch) => {
    for (let y = cy; y < cy + ch; y++) for (let x = cx; x < cx + cw; x++) floor(map, x, y, pickT(rg, table([['GRASS_3', 6], ['DIRT', 4], ['CLOVER', 2]])));
  };
  clearing(28, 12, 7, 6);      // Ivor Marsk's wagon camp
  for (let y = 15; y <= 18; y++) floor(map, 30, y, pickT(rg, ruts));
  prop(map, 32, 13, tid('CART', 'CRATE'), res);
  prop(map, 29, 13, tid('CRATE', 'BARREL'), res);
  prop(map, 28, 16, tid('BARREL', 'CRATE'), res);

  clearing(37, 6, 8, 6);       // Taman Helder's shrine to Tempus
  for (let y = 11; y <= 18; y++) floor(map, 40, y, pickT(rg, ruts));
  prop(map, 41, 8, tid('SHRINE', 'STATUE'), res);
  prop(map, 39, 7, tid('BOULDER', 'ROCK'), res);
  addSign(map, 42, 10, 'A traveller’s shrine to Tempus. Coins in the bowl, prayers on the wind.');
  prop(map, 42, 10, tid('SIGN', 'ROCK'), res);

  clearing(59, 9, 9, 8);       // the Lords' Alliance post rider
  for (let y = 15; y <= 18; y++) floor(map, 63, y, pickT(rg, ruts));
  prop(map, 60, 10, tid('CART', 'CRATE'), res);
  prop(map, 66, 14, tid('BARREL', 'CRATE'), res);

  // --- the goblin ambush ---------------------------------------------------
  // Two horses dead in the ruts, the cargo gone, and a trail into the brush.
  const ax = 45;
  floorRect(map, ax - 3, 17, 8, 5, tid('DIRT', 'DIRT_PATH'));
  for (let y = 17; y <= 21; y++) for (let x = ax - 3; x <= ax + 4; x++) if (rd.chance(0.3)) gset(map, x, y, tid('MUD', 'DIRT'));
  prop(map, ax - 1, 17, tid('BONES', 'RUBBLE'), res);          // the first horse
  prop(map, ax + 2, 21, tid('BONES', 'RUBBLE'), res);          // the second
  prop(map, ax, 21, tid('CART', 'CRATE'), res);
  prop(map, ax + 3, 17, tid('CRATE', 'BARREL'), res);
  for (const [x, y] of [[ax - 2, 16], [ax + 1, 16], [ax + 4, 22], [ax - 3, 22]]) prop(map, x, y, tid('BUSH', 'GRASS_TALL'), res);
  // the goblin trail leading off north into the thickets
  for (let y = 16; y >= 8; y--) floor(map, ax + 1, y, tid('DIRT', 'GRASS_4'));
  prop(map, ax + 5, 17, tid('SIGN', 'ROCK'), res);
  addSign(map, ax + 5, 17, 'Two horses lie dead in the road, arrows in their flanks. The cargo is gone; a trail leads north.');

  // --- signposts at the junctions -----------------------------------------
  prop(map, 68, 17, tid('SIGN', 'ROCK'), res);
  prop(map, 78, 21, tid('SIGN', 'ROCK'), res);
  prop(map, 3, 21, tid('SIGN', 'ROCK'), res);
  prop(map, 96, 17, tid('SIGN', 'ROCK'), res);

  map.recomputeFlags({ keep: 0 });
  sealBorder(map, tid('TREE_PINE', 'TREE_OAK'));
  map.spawn = { x: 3, y: 19 };
  map.entry = { ...map.spawn };
  map.level = 2;

  addSign(map, 68, 17, 'NORTH: Neverwinter Wood, and the road to Neverwinter beyond.');
  addSign(map, 78, 21, 'SOUTH: the old mine road. Wave Echo Cave. Nobody has come back up it in fifty years.');
  addSign(map, 3, 21, 'WEST: Phandalin.');
  addSign(map, 96, 17, 'EAST: Conyberry. Sacked. Travel at your own risk.');
  map.addTrigger({
    id: 'trail-ambush', kind: 'battle', x: ax - 2, y: 18, w: 5, h: 3,
    once: true, data: { group: 'cragmaw-ambush', ambush: true, level: 2, flag: 'trail-ambush-done' },
  });
  map.addTrigger({
    id: 'trail-verges', kind: 'encounter-zone', x: 1, y: 5, w: 98, h: 30,
    data: { table: 'triboar-trail-bandits', rate: 0.05, biome: 'road' },
  });
  return map;
}

// --- Neverwinter Wood -------------------------------------------------------
function buildNeverwinterWood(root) {
  const map = new TileMap({
    w: 60, h: 56, id: 'neverwinter-wood', name: 'Neverwinter Wood', biome: 'pine-forest',
    indoor: false, music: 'forest', encounterRate: 0.075, encounterTable: 'neverwinter-wood-wolves',
    ambient: { color: '#12200f', alpha: 0.16 }, weather: 'fog', region: 'neverwinter-wood',
  });
  const res = reservedFor('neverwinter-wood');
  const rg = root.fork('ground');
  const rt = root.fork('trees');
  const rd = root.fork('detail');

  groundNoise(map, rg, 0, 0, 60, 56, table([['GRASS', 6], ['GRASS_2', 6], ['GRASS_TALL', 3], ['CLOVER', 2], ['SNOW_GRASS', 1]]));

  // The wood proper: dense pine, thinning around the clearings.
  const clearings = [{ x: 29, y: 22, r: 6 }, { x: 44, y: 42, r: 5 }, { x: 16, y: 12, r: 4 }, { x: 46, y: 12, r: 4 }];
  const inClearing = (x, y) => clearings.some((c) => Math.hypot(x - c.x, y - c.y) <= c.r);
  const pines = table([['TREE_PINE', 9], ['TREE_OAK', 2], ['BUSH', 3], ['STUMP', 1], ['MUSHROOM_RED', 1], ['MUSHROOM_BROWN', 1]]);
  for (let y = 0; y < 56; y++) {
    for (let x = 0; x < 60; x++) {
      if (inClearing(x, y)) continue;
      if (!rt.chance(0.42)) continue;
      prop(map, x, y, pickT(rt, pines), res);
    }
  }
  // A few full-size two-tile pines where the canopy closes over the path.
  for (const [px, py] of [[10, 30], [48, 26], [22, 44], [36, 8], [6, 46]]) {
    if (map.inBounds(px + 1, py + 1)) bigPine(map, px, py);
  }

  // --- the path north ------------------------------------------------------
  const trackTable = table([['DIRT', 6], ['DIRT_PATH', 5], ['GRAVEL', 2]]);
  const track = (x, y) => { floor(map, x, y, pickT(rg, trackTable)); };
  // south entrance up to the great clearing, then on to the northern eaves
  for (let y = 54; y >= 1; y--) { track(29, y); track(30, y); track(31, y); }
  // the eastward spur back down to Phandalin
  for (let x = 30; x <= 58; x++) { track(x, 43); track(x, 44); track(x, 45); }
  for (let y = 23; y <= 44; y++) { track(30, y); }

  // --- Reidoth's clearing --------------------------------------------------
  for (let y = 17; y <= 27; y++) for (let x = 24; x <= 34; x++) if (Math.hypot(x - 29, y - 22) <= 5.5) floor(map, x, y, pickT(rg, table([['GRASS_3', 6], ['CLOVER', 4], ['FLOWERS_YELLOW', 2]])));
  prop(map, 26, 19, tid('SHRINE', 'STATUE'), res);
  prop(map, 32, 25, tid('STUMP', 'ROCK'), res);
  prop(map, 25, 25, tid('BOULDER', 'ROCK'), res);
  prop(map, 33, 19, tid('BERRY_BUSH', 'BUSH'), res);
  prop(map, 27, 26, tid('COOKING_POT', 'ROCK'), res);
  addSign(map, 32, 21, 'A druid’s camp: a banked fire, a bedroll of moss, and no footprints leading away.');
  prop(map, 32, 21, tid('SIGN', 'ROCK'), res);

  // --- a stream and its bridge --------------------------------------------
  for (let x = 0; x < 60; x++) {
    const wy = 34 + Math.round(Math.sin(x * 0.22) * 2);
    for (let d = 0; d < 2; d++) floor(map, x, wy + d, tid('WATER', 'MUD'));
    if (rd.chance(0.25)) prop(map, x, wy + 2, tid('REEDS', 'BUSH'), res);
  }
  for (let x = 29; x <= 31; x++) for (let y = 32; y <= 38; y++) floor(map, x, y, tid('BRIDGE_WOOD', 'DIRT_PATH'));

  scatter(map, rd, 1, 1, 58, 54, table([['MUSHROOM_RED', 3], ['MUSHROOM_BROWN', 3], ['ROCK', 3], ['BUSH', 2]]), 0.03, res);

  // The ash road branches west from the main trail, below Reidoth's camp.
  for(let x=1;x<=30;x++)for(let y=27;y<=29;y++) {
    floor(map,x,y,tid('DIRT_PATH'));dset(map,x,y,0);oset(map,x,y,0);
  }
  signpost(map,27,26,'WEST — THUNDERTREE. Green dragon sighted at the ruined tower. Approach only with a seasoned company.',res);

  map.recomputeFlags({ keep: 0 });
  sealBorder(map, tid('TREE_PINE', 'TREE_OAK'));
  map.spawn = { x: 30, y: 52 };
  map.entry = { ...map.spawn };
  map.level = 3;
  map.addTrigger({
    id: 'wood-deeps', kind: 'encounter-zone', x: 1, y: 1, w: 58, h: 54,
    data: { table: 'neverwinter-wood-wolves', rate: 0.07, biome: 'pine-forest' },
  });
  return map;
}

// --- Conyberry: a sacked village and Agatha's grove -------------------------
function buildThundertree(root) {
  const map=new TileMap({w:32,h:28,id:'thundertree',name:'Thundertree',biome:'ash-waste',indoor:false,music:'tense',weather:'ash',encounterRate:0});
  const res=reservedFor('thundertree');
  floorRect(map,0,0,32,28,tid('DIRT','GRASS'));
  sealBorder(map,tid('TREE_DEAD','ROCK'));
  // Broken houses flank an ash road, leaving a wide sightline to the dragon.
  for(const [x,y] of [[3,5],[23,5],[3,16],[23,16]]) {
    floorRect(map,x,y,6,5,tid('STONE_FLOOR'));
    dframe(map,x,y,6,5,tid('RUIN_WALL','STONE_WALL'));
    dset(map,x+3,y+4,0);dset(map,x+4,y,0);
    prop(map,x+1,y+2,tid('RUBBLE','ROCK'),res);
  }
  floorRect(map,12,4,8,12,tid('STONE_FLOOR'));
  dframe(map,11,3,10,12,tid('RUIN_WALL','STONE_WALL'));
  for(let x=13;x<=18;x++)dset(map,x,14,0);
  for(let y=15;y<=25;y++)floorRect(map,14,y,4,1,tid('DIRT_PATH'));
  floorRect(map,16,24,15,3,tid('DIRT_PATH'));
  prop(map,12,6,tid('BONES','ROCK'),res);prop(map,19,7,tid('CHEST_OPEN','CRATE'),res);
  signpost(map,20,22,'VENOMFANG\'S TOWER. A green dragon coils around the old stones. Speak to the creature only if you are ready to fight.',res);
  map.recomputeFlags({keep:0});map.spawn={x:28,y:25};map.entry={...map.spawn};
  return map;
}

function buildConyberryRuins(root) {
  const map = new TileMap({
    w: 44, h: 36, id: 'conyberry-ruins', name: 'Conyberry', biome: 'ruins',
    indoor: false, music: 'tense', encounterRate: 0.06, encounterTable: 'conyberry-ruins-haunts',
    ambient: { color: '#1a1622', alpha: 0.12 }, region: 'conyberry',
  });
  const res = reservedFor('conyberry-ruins');
  const rg = root.fork('ground');
  const rd = root.fork('detail');

  groundNoise(map, rg, 0, 0, 44, 36, table([['GRASS_4', 6], ['DIRT', 5], ['GRASS', 4], ['GRAVEL', 2], ['GRASS_TALL', 2]]));

  // the old street, still there under the weeds
  for (let y = 15; y <= 17; y++) for (let x = 1; x <= 42; x++) floor(map, x, y, pickT(rg, table([['COBBLE', 5], ['DIRT', 4], ['GRAVEL', 1]])));
  for (let x = 8; x <= 10; x++) for (let y = 6; y <= 30; y++) floor(map, x, y, pickT(rg, table([['DIRT', 6], ['COBBLE', 3]])));

  // burnt-out houses: ruined rings with the roofs long gone
  const houses = [[2, 6, 6, 5], [12, 5, 7, 6], [24, 6, 6, 5], [2, 23, 6, 5], [13, 24, 6, 5], [30, 24, 7, 6], [34, 10, 6, 5]];
  for (const [hx, hy, hw, hh] of houses) {
    floorRect(map, hx, hy, hw, hh, tid('DIRT', 'GRAVEL'));
    floorRect(map, hx + 1, hy + 1, hw - 2, hh - 2, tid('STONE_FLOOR_CRACKED', 'STONE_FLOOR'));
    dframe(map, hx, hy, hw, hh, tid('RUINED_WALL', 'STONE_WALL'));
    // knock a gap in a wall so each shell is enterable
    dset(map, hx + (hw >> 1), hy + hh - 1, 0);
    for (let i = 0; i < 3; i++) prop(map, hx + rd.int(1, hw - 2), hy + rd.int(1, hh - 2), pickT(rd, table([['RUBBLE', 5], ['BONES', 2], ['CRATE', 2]])), res);
  }
  prop(map, 20, 20, tid('WELL', 'FOUNTAIN'), res);
  prop(map, 6, 18, tid('GRAVESTONE', 'ROCK'), res);
  prop(map, 7, 19, tid('GRAVESTONE', 'ROCK'), res);
  prop(map, 5, 19, tid('GRAVESTONE', 'ROCK'), res);
  prop(map, 3, 14, tid('SIGN', 'ROCK'), res);

  // --- Agatha's grove ------------------------------------------------------
  // A ring of old oaks east of the village; the banshee waits at the centre.
  for (let y = 10; y <= 22; y++) {
    for (let x = 15; x <= 27; x++) {
      const d = Math.hypot(x - 20, y - 16);
      if (d > 5.4 && d < 6.6) prop(map, x, y, tid('TREE_OAK', 'DEAD_TREE'), res);
      else if (d <= 5.4) floor(map, x, y, pickT(rg, table([['GRASS_3', 5], ['CLOVER', 3], ['GRASS_TALL', 2]])));
    }
  }
  // a way in from the street: a gap trodden through the ring of oaks
  for (let y = 17; y <= 24; y++) floor(map, 19, y, tid('DIRT', 'GRASS'));
  prop(map, 20, 13, tid('DEAD_TREE', 'TREE_OAK'), res);
  prop(map, 18, 18, tid('GRAVESTONE', 'ROCK'), res);
  prop(map, 22, 18, tid('GRAVESTONE', 'ROCK'), res);
  prop(map, 20, 19, tid('ALTAR', 'GRAVESTONE'), res);

  scatter(map, rd, 1, 1, 42, 34, table([['DEAD_TREE', 3], ['BUSH', 4], ['ROCK', 3], ['RUBBLE', 2], ['BONES', 1]]), 0.06, res);

  map.recomputeFlags({ keep: 0 });
  sealBorder(map, tid('DEAD_TREE', 'TREE_OAK'));
  map.spawn = { x: 3, y: 16 };
  map.entry = { ...map.spawn };
  map.level = 4;
  addSign(map, 3, 14, 'CONYBERRY. The signpost is scorched. Nothing has been rebuilt.');
  map.addTrigger({ id: 'agatha-grove', kind: 'script', x: 19, y: 20, data: { kind: 'agatha-grove', npc: 'agatha' } });
  map.addTrigger({
    id: 'conyberry-haunts', kind: 'encounter-zone', x: 1, y: 1, w: 42, h: 34,
    data: { table: 'conyberry-ruins-haunts', rate: 0.06, biome: 'ruins' },
  });
  return map;
}

// --- The mouth of Wave Echo Cave -------------------------------------------
function buildWaveEchoEntrance(root) {
  const map = new TileMap({
    w: 30, h: 34, id: 'wave-echo-cave-entrance', name: 'Wave Echo Cave', biome: 'hills',
    indoor: false, music: 'cave', encounterRate: 0.05, encounterTable: 'wave-echo-shafts',
    ambient: { color: '#14161f', alpha: 0.18 }, region: 'phandalin-hills',
  });
  const res = reservedFor('wave-echo-cave-entrance');
  const rg = root.fork('ground');
  const rd = root.fork('detail');

  groundNoise(map, rg, 0, 0, 30, 34, table([['GRAVEL', 6], ['DIRT', 4], ['GRASS_4', 3]]));

  // A rocky bowl: cliffs east and west, the road down the middle, the cave
  // mouth in the southern rock face.
  for (let y = 0; y < 34; y++) {
    const lw = 6 + Math.round(Math.sin(y * 0.31) * 3);
    const rw = 6 + Math.round(Math.cos(y * 0.27) * 3);
    for (let x = 0; x < lw; x++) prop(map, x, y, tid('CLIFF', 'MOUNTAIN'), res);
    for (let x = 30 - rw; x < 30; x++) prop(map, x, y, tid('CLIFF', 'MOUNTAIN'), res);
  }
  for (let y = 1; y <= 25; y++) for (let x = 12; x <= 16; x++) floor(map, x, y, pickT(rg, table([['DIRT_PATH', 6], ['GRAVEL', 4]])));

  // the mine head: timber shoring, spoil heaps, a rusted cart
  floorRect(map, 10, 24, 10, 7, tid('CAVE_FLOOR', 'GRAVEL'));
  for (let x = 9; x <= 20; x++) prop(map, x, 31, tid('CAVE_WALL', 'MOUNTAIN'), res);
  for (let x = 9; x <= 20; x++) prop(map, x, 23, 0, res);
  prop(map, 11, 27, tid('TIMBER_SUPPORT', 'PILLAR'), res);
  prop(map, 17, 27, tid('TIMBER_SUPPORT', 'PILLAR'), res);
  prop(map, 10, 30, tid('ORE_IRON', 'ROCK'), res);
  prop(map, 19, 30, tid('ORE_SILVER', 'ROCK'), res);
  prop(map, 18, 25, tid('CART', 'CRATE'), res);
  prop(map, 11, 25, tid('CRATE', 'BARREL'), res);
  prop(map, 10, 26, tid('BARREL', 'CRATE'), res);
  prop(map, 12, 26, tid('TORCH', 'CANDLE'), res);
  prop(map, 16, 26, tid('TORCH', 'CANDLE'), res);
  for (let x = 13; x <= 15; x++) for (let y = 26; y <= 30; y++) floor(map, x, y, tid('CAVE_FLOOR', 'GRAVEL'));
  floor(map, 14, 28, tid('STAIRS_DOWN', 'CAVE_FLOOR'));
  orect(map, 12, 26, 5, 1, tid('BLACK', 'COBWEB'));      // the lintel of the adit

  // a camp where the road comes down, and the scree in between
  floorRect(map, 11, 18, 7, 5, tid('DIRT', 'GRAVEL'));
  prop(map, 11, 19, tid('CRATE', 'BARREL'), res);
  prop(map, 17, 21, tid('BARREL', 'CRATE'), res);
  prop(map, 12, 22, tid('COOKING_POT', 'ROCK'), res);
  prop(map, 16, 17, tid('SIGN', 'ROCK'), res);
  scatter(map, rd, 6, 1, 18, 32, table([['ROCK', 6], ['BOULDER', 3], ['RUBBLE', 3], ['BUSH', 2], ['DEAD_TREE', 1]]), 0.07, res);

  map.recomputeFlags({ keep: 0 });
  sealBorder(map, tid('MOUNTAIN', 'CLIFF'));
  map.spawn = { x: 14, y: 3 };
  map.entry = { ...map.spawn };
  map.level = 5;
  addSign(map, 16, 17, 'WAVE ECHO CAVE. The Lost Mine of Phandelver. The air coming out of it is cold and tastes of iron.');
  map.addTrigger({
    id: 'wave-echo-mouth', kind: 'warp', x: 14, y: 28,
    data: { map: 'wave-echo-cave', depth: 1, theme: 'mine', dir: 'down', kind: 'cave' },
  });
  return map;
}

// ---------------------------------------------------------------------------
// 6. THE CITIES
// ---------------------------------------------------------------------------

// --- Neverwinter: the Protector's Enclave -----------------------------------
//
// WHAT THIS REPLACES: two streets, one wall rectangle, eight identical houses
// out of a single lambda, and "docks" that were five barrels stood on cobbles.
// The Enclave is the walled, rebuilt heart of Neverwinter, so it now carries
// what Daggerford carries — a real curtain with two gatehouses, a wharf of DOCK
// planks and mooring posts on the Neverwinter River, the Hall of Justice as a
// colonnaded stone hall, the Moonstone Mask as a festhall with wings and
// lanterns, a chartered market of stalls, a plaza, two gardens, and houses that
// differ from one another in wall, roof, wing and porch.
//
//     x   0  3      10        23  27            42 46
//   y  1  ~~  +------------- north curtain -----------+
//      4  ~~  | q |  [ Moonstone Mask ]  ---- lane ----
//      5  ~~  | u |   (wings both ends)  [ Hall of Justice ][house]
//     14  ~~  | a |  [Driftwood][garden] --- Hall lane, colonnade ---
//     15  ~~  | y |                      [ plaza: statue, fountain ]
//     20  ~~  |###| ========== THE AVENUE ==================
//     23  ~~  |###|   [ market ]    |H|  [houses]  |G|
//     29  ~~  |###|   [ green  ]    |H|            |G|
//     32      +-------- south curtain -- gate 8 ---- gate 34 ----+
//     34            out: west to Waterdeep, south to Neverwinter Wood
function buildNeverwinter(root) {
  const map = new TileMap({
    w: 48, h: 36, id: 'neverwinter', name: "Neverwinter — Protector's Enclave", biome: 'city',
    indoor: false, music: 'city', safe: true, encounterRate: 0, region: 'neverwinter',
  });
  const res = reservedFor('neverwinter');
  const rg = root.fork('ground');
  const rd = root.fork('detail');
  const flag = tid('FLAGSTONE', 'COBBLE');
  const cob = tid('COBBLE', 'FLAGSTONE');

  groundNoise(map, rg, 0, 0, 48, 36, table([['COBBLE', 7], ['FLAGSTONE', 5], ['DIRT_PATH', 1]]));

  // --- 1. the river and the wharf -----------------------------------------
  // The Neverwinter River comes down the west side and IS the west wall, which
  // is how the Enclave has a working harbour inside its defences. The quay is
  // DOCK — a plank floor with real boards — and two piers run out over the
  // water with mooring posts at their heads.
  for (let y = 0; y < 36; y++) for (let x = 0; x <= 2; x++) floor(map, x, y, tid('WATER', 'COBBLE'));
  for (let y = 4; y <= 31; y++) for (let x = 3; x <= 6; x++) floor(map, x, y, tid('DOCK', 'WOOD_FLOOR_H'));
  for (const py of [10, 22]) {
    for (let x = 1; x <= 2; x++) floor(map, x, py, tid('DOCK', 'WOOD_FLOOR_H'));
    prop(map, 1, py - 1, tid('PIER_POST', 'BARREL'), res);
    prop(map, 1, py + 1, tid('PIER_POST', 'BARREL'), res);
  }
  for (const py of [6, 14, 18, 26, 30]) prop(map, 3, py, tid('PIER_POST', 'BARREL'), res);
  const cargo = table([['CRATE', 6], ['BARREL', 5], ['SACK', 4], ['HAY', 1]]);
  for (const [px, py] of [[4, 7], [5, 7], [4, 12], [6, 16], [4, 20], [5, 24], [4, 28], [6, 29]]) {
    prop(map, px, py, pickT(rd, cargo), res);
  }
  prop(map, 6, 11, tid('CART', 'CRATE'), res);
  prop(map, 5, 19, tid('TROUGH', 'BARREL'), res);
  signpost(map, 4, 5, 'NEVERWINTER QUAY — harbour dues to the Protector’s clerk. No hull to be tarred alongside; the last one took a warehouse with it.', res);

  // --- 2. the curtain and its two gatehouses -------------------------------
  // Outside the wall is not city. The strip below the south curtain is scrub
  // and gravel, so a player who can see it reads "outside" rather than "a
  // street I cannot get to".
  groundNoise(map, rg, 3, 34, 44, 1, table([['GRASS_2', 5], ['DIRT', 4], ['GRAVEL', 3], ['GRASS_TALL', 2]]));
  curtain(map, 3, 1, 44, 33, { key: 'STONE_WALL', base: 'GRAVEL', west: false, res });
  for (const gx of [8, 34]) gateway(map, gx, 29, 34, flag, { half: 1, gateRow: 33, torchRow: 31 });
  for (const [px, py] of [[12, 1], [20, 1], [30, 1], [40, 1], [46, 10], [46, 20], [46, 28]]) {
    dset(map, px, py, tid('PILLAR', 'STONE_WALL'));
  }

  // --- 3. the streets ------------------------------------------------------
  for (let x = 3; x <= 45; x++) for (let y = 20; y <= 22; y++) floor(map, x, y, flag);   // the avenue
  for (let y = 4; y <= 31; y++) for (let x = 23; x <= 25; x++) floor(map, x, y, flag);   // the High Road
  for (let x = 22; x <= 45; x++) floor(map, x, 4, flag);                                 // the north lane
  for (let x = 7; x <= 45; x++) for (let y = 13; y <= 14; y++) floor(map, x, y, flag);   // the Hall lane
  for (let y = 22; y <= 30; y++) for (let x = 7; x <= 9; x++) floor(map, x, y, flag);    // down to the west gate
  for (let y = 22; y <= 30; y++) for (let x = 33; x <= 35; x++) floor(map, x, y, flag);  // down to the south gate

  // --- 4. the Hall of Justice ----------------------------------------------
  // Tyr's temple before the Spellplague, the Neverwinter Guard's barracks now,
  // and still built like a temple: a long nave of dressed stone under slate,
  // tall lancets of stained glass (Tyr's blue and gold) down its front, and
  // the bell tower at its east end with the tallest spire in the Enclave. A
  // colonnade stands across the front of the nave, not across its door.
  temple(map, {
    x: 27, y: 5, w: 15, h: 9, wall: 'STONE_WALL', roof: 'slate', spire: 'slate', tower: 'E', tw: 3, th: 10,
    roofRows: 3, door: 6, stained: [1, 3, 5, 7, 9, 10], tall: [1, 3, 9, 10], buttress: [2, 4, 8], rose: 6, lit: true,
    chimney: 1, lantern: true,
  }, res);
  for (const px of [28, 30, 36, 38]) prop(map, px, 14, tid('PILLAR', 'STONE_WALL'), res);
  prop(map, 34, 13, tid('LANTERN', 'TORCH'), res);
  addSign(map, 34, 13, 'THE HALL OF JUSTICE — Tyr’s house once, the Neverwinter Guard’s barracks now. Petitions heard at the third bell.');

  // --- 5. the Moonstone Mask -----------------------------------------------
  // A festhall, and the shape says so: a tall lit centre block between two
  // wings, each wing under its own turret, canvas over the door, pennants.
  building(map, {
    x: 10, y: 4, w: 9, h: 9, wall: 'BRICK_WALL', roof: 'tile', base: 'FLAGSTONE',
    roofRows: 3, door: 4, windows: [1, 2, 6, 7], sign: 3, trade: 'inn', lit: true, band: 4,
    chimney: 1, chimney2: 7, approach: 1, step: 'FLAGSTONE', porch: 3, lantern: true, dormer: [2, 6],
    wings: [
      { dx: -3, dy: 4, w: 3, h: 5, roof: 'tile', windows: [1] },
      { dx: 9, dy: 4, w: 3, h: 5, roof: 'tile', windows: [1] },
    ],
  }, res);
  pyramidRoof(map, 7, 8, 2, 'tile');
  pyramidRoof(map, 20, 8, 2, 'tile');
  prop(map, 15, 13, tid('LANTERN', 'TORCH'), res);
  prop(map, 7, 13, tid('BANNER', 'SIGN'), res);
  prop(map, 21, 13, tid('BANNER', 'SIGN'), res);
  addSign(map, 13, 12, 'THE MOONSTONE MASK — dancing, dice and discretion. Weapons left at the door and returned at dawn.');

  // --- 6. the Driftwood Tavern, and a patriar's townhouse ------------------
  building(map, {
    x: 7, y: 15, w: 7, h: 5, wall: 'LOG_WALL', roof: 'shingle', base: 'FLAGSTONE',
    roofRows: 2, door: 3, windows: [1, 5], sign: 4, trade: 'inn', lit: true, chimney: 5,
    approach: 1, porch: 3, lantern: true,
  }, res);
  addSign(map, 11, 19, 'THE DRIFTWOOD TAVERN — built out of a wrecked cog and proud of it. Fish stew, cheap beer, worse songs.');
  // A patriar's townhouse on the corner: tall and narrow, a turret on its
  // corner and dormers in the slates — money that wants to be seen from the gate.
  building(map, {
    x: 42, y: 5, w: 4, h: 8, wall: 'BRICK_WALL', roof: 'slate', base: 'FLAGSTONE',
    roofRows: 3, door: 1, windows: [1, 2], upper: [1, 2], band: 4, chimney: 2, approach: 1, step: 'FLAGSTONE', lantern: 'right',
  }, res);
  pyramidRoof(map, 44, 5, 2, 'slate');

  // --- 7. the plaza --------------------------------------------------------
  floorRect(map, 27, 15, 12, 5, tid('MOSAIC', 'FLAGSTONE'));
  prop(map, 33, 17, tid('FOUNTAIN', 'WELL'), res);
  prop(map, 34, 17, tid('FOUNTAIN', 'WELL'), res);
  prop(map, 28, 17, tid('STATUE', 'PILLAR'), res);
  for (const [px, py] of [[27, 15], [38, 15], [27, 19], [38, 19]]) prop(map, px, py, tid('BRAZIER', 'TORCH'), res);
  for (const [px, py] of [[30, 19], [36, 19], [31, 15], [35, 15]]) prop(map, px, py, tid('BENCH', 'CRATE'), res);
  prop(map, 37, 17, tid('PLANTER', 'BUSH'), res);
  prop(map, 26, 18, tid('PLANTER', 'BUSH'), res);
  addSign(map, 28, 17, 'Neverember of Neverwinter, Lord Protector, in bronze. Somebody has chalked a crown on him; somebody else has scrubbed at it.');

  // --- 8. the chartered market --------------------------------------------
  floorRect(map, 11, 23, 12, 6, cob);
  stallRow(map, 12, 24, 5, 'h', rd, { step: 2, face: 1, res, banner: true });
  stallRow(map, 12, 27, 5, 'h', rd, { step: 2, face: -1, res });
  for (const [px, py] of [[11, 23], [22, 23], [11, 28], [22, 28]]) prop(map, px, py, tid('BRAZIER', 'TORCH'), res);
  prop(map, 10, 26, tid('TROUGH', 'BARREL'), res);
  signpost(map, 10, 29, 'THE PROTECTOR’S MARKET — by charter, every day but Shieldmeet. Weights checked by the Guard; short measure is a night in the Hall.', res);

  // --- 9. the houses -------------------------------------------------------
  // Townhouses of the rebuilt city: stone and brick under slate and pantile,
  // framed upper storeys, dormers in the roofs and a shop on every ground
  // floor with its trade on a board. No two the same, because a street of one
  // house repeated is a texture.
  building(map, {
    x: 27, y: 24, w: 5, h: 7, wall: 'STONE_WALL', roof: 'slate', base: 'FLAGSTONE', roofRows: 3,
    door: 2, windows: [1, 3], upper: [1, 3], band: 4, chimney: 1, sign: 3, trade: 'book', lit: true,
    approach: 1, step: 'FLAGSTONE', lantern: true, dormer: [2],
  }, res);
  building(map, {
    x: 37, y: 23, w: 8, h: 6, wall: 'TIMBER_WALL', roof: 'tile', base: 'FLAGSTONE', roofRows: 2,
    door: 3, windows: [1, 5, 6], upper: [1, 2, 5, 6], chimney: 6, sign: 2, trade: 'potion',
    approach: 1, step: 'FLAGSTONE', porch: 3, dormer: [4],
    wings: [{ dx: 1, dy: 6, w: 3, h: 3, roof: 'tile' }],
  }, res);
  building(map, {
    x: 15, y: 15, w: 5, h: 5, wall: 'PLASTER_WALL', roof: 'shingle', base: 'FLAGSTONE', roofRows: 2,
    door: 2, windows: [1, 3], chimney: 3, sign: 1, trade: 'bread', approach: 1, step: 'FLAGSTONE',
  }, res);
  building(map, {
    x: 20, y: 16, w: 3, h: 4, wall: 'BRICK_WALL', roof: 'slate', base: 'FLAGSTONE', roofRows: 2,
    door: 1, windows: [], chimney: 1, approach: 1, step: 'FLAGSTONE',
  }, res);
  noticeBoard(map, 13, 23, res);

  // --- 10. two gardens ----------------------------------------------------
  garden(map, { x: 15, y: 29, w: 8, h: 3 }, rd, { res, gate: { x: 18, y: 29 }, tree: false });
  garden(map, { x: 40, y: 15, w: 6, h: 5 }, rd, { res, gate: { x: 42, y: 19 }, fence: 'HEDGE' });

  // --- 11. wear, and the clutter of a working city ------------------------
  map.recomputeFlags({ keep: 0 });
  const spare = new Set(['8,32', '8,33', '8,34', '34,32', '34,33', '34,34']);
  wearPatches(map, rd, { x: 27, y: 15, w: 12, h: 5 }, 'COBBLE_ISLE', 7, { res });
  wearPatches(map, rd, { x: 11, y: 23, w: 12, h: 6 }, 'PATH_ISLE', 5, { res });
  wearPatches(map, rd, { x: 3, y: 20, w: 43, h: 3 }, 'GRAVEL_ISLE', 8, { res });
  dressStreets(map, rd, { x: 4, y: 4, w: 42, h: 28 }, { res, chance: 0.14, avoid: spare });

  map.recomputeFlags({ keep: 0 });
  sealBorder(map, tid('STONE_WALL', 'BRICK_WALL'));
  for (const gx of [8, 34]) { openDoorway(map, gx, 33); clearStanding(map, gx, 32); clearStanding(map, gx, 34); }
  sweepStanding(map, 'neverwinter');
  map.spawn = { x: 34, y: 32 };
  map.entry = { ...map.spawn };
  map.level = 6;
  addSign(map, 34, 31, 'THE PROTECTOR’S ENCLAVE. Lord Neverember’s peace holds inside these walls. Outside is another matter.');
  return map;
}

// --- Waterdeep: a stretch of the Trades Ward and the Yawning Portal ---------
//
// WHAT THIS REPLACES: seven identical brick boxes from one lambda, two streets,
// no wall, no gate, and a Yawning Portal hand-drawn tile by tile in the middle
// of the builder. The Trades Ward is the ward Waterdeep does its business in,
// so it now has a real street grid, slate over the good addresses, canvas over
// the shop fronts, a bazaar of stalls, the House of Inspired Hands with a
// garden close, and a warded edge with a gate you come in through.
//
// No graveyard: Waterdeep's dead are in the City of the Dead, which is a
// different ward entirely.
//
//     x  1  2   5        14           28  32  36    42
//   y  1        gate ->  |20 21 22|
//   y  6  ==== the upper cross street ==========================
//      8  |H1 |          [ THE YAWNING PORTAL ]      | Inspired |
//     11  |   |          | you can see inside it |   |  Hands   |
//     15  |H2 |          | the well down to      |   +----------+
//     19  |   |          | Undermountain         |   |  garden  |
//     20  ==== cross street A ==================================
//     23  |H5    | H6  |   [ bazaar stalls ]   |     |   H7    |
//     27  ==== cross street B ==================================
//     29        back lane: carts, hay, a water trough
//     31  +----------------- south wall --------------------+
function buildWaterdeep(root) {
  const map = new TileMap({
    w: 44, h: 34, id: 'waterdeep', name: 'Waterdeep — Trades Ward', biome: 'city',
    indoor: false, music: 'city', safe: true, encounterRate: 0, region: 'waterdeep',
  });
  const res = reservedFor('waterdeep');
  const rg = root.fork('ground');
  const rd = root.fork('detail');
  const cob = tid('COBBLE', 'FLAGSTONE');
  const flag = tid('FLAGSTONE', 'COBBLE');

  groundNoise(map, rg, 0, 0, 44, 34, table([['COBBLE', 8], ['FLAGSTONE', 4]]));

  // --- 1. the ward wall and its gate ---------------------------------------
  // Waterdeep's wards are divided by real walls; this stretch is closed on
  // three sides and opens north through the gate you arrive by.
  groundNoise(map, rg, 1, 1, 42, 1, table([['COBBLE', 6], ['GRAVEL', 3], ['DIRT', 2]]));
  curtain(map, 1, 2, 42, 31, { key: 'BRICK_WALL', base: 'GRAVEL', res });
  gateway(map, 21, 1, 7, flag, { half: 1, gateRow: 2, torchRow: 5 });
  // The south gate onto the Trade Way. maps_south.js LINKS this ward to
  // trade-way-north at (30,32); the wall goes THROUGH that tile, so the gate has
  // to be cut for it or the road out of Waterdeep is bricked up.
  gateway(map, 30, 29, 32, flag, { half: 1, gateRow: 32, torchRow: 30 });
  for (const [px, py] of [[10, 2], [32, 2], [1, 12], [1, 24], [42, 12], [42, 24]]) {
    dset(map, px, py, tid('PILLAR', 'BRICK_WALL'));
  }

  // --- 2. the street grid --------------------------------------------------
  for (let x = 2; x <= 41; x++) for (let y = 6; y <= 7; y++) floor(map, x, y, cob);     // upper cross
  for (let x = 2; x <= 41; x++) for (let y = 20; y <= 22; y++) floor(map, x, y, cob);   // cross A
  for (let x = 2; x <= 41; x++) for (let y = 27; y <= 28; y++) floor(map, x, y, cob);   // cross B
  for (let y = 6; y <= 30; y++) for (let x = 2; x <= 4; x++) floor(map, x, y, cob);     // west avenue
  for (let y = 6; y <= 30; y++) for (let x = 32; x <= 34; x++) floor(map, x, y, cob);   // east avenue
  for (let x = 2; x <= 41; x++) for (let y = 29; y <= 30; y++) floor(map, x, y, cob);   // the back lane

  // --- 3. THE YAWNING PORTAL ----------------------------------------------
  // An `openHouse`, not a `building`: the ground floor IS the map. You walk in
  // off the street and stand on the taproom floor, and the shaft is right
  // there. This was the one place in the game that trick was hand-drawn.
  const portal = openHouse(map, {
    x: 14, y: 8, w: 15, h: 12, wall: 'STONE_WALL', roof: 'slate', floor: 'WOOD_FLOOR',
    roofRows: 3, door: 7, windows: [4, 6, 10], sign: 9, chimney: 2, lit: true,
  }, res);
  // the shaft: three courses of well-head with the climbing tile below it
  floorRect(map, 18, 11, 5, 4, tid('FLAGSTONE', 'STONE_FLOOR'));
  for (let x = 19; x <= 21; x++) prop(map, x, 12, tid('WELL', 'FOUNTAIN'), res);
  // Durnan's bar, the shelves behind it, and the common tables
  for (let x = 16; x <= 19; x++) prop(map, x, 16, tid('BAR', 'COUNTER'), res);
  for (let x = 15; x <= 27; x++) prop(map, x, 11, tid('SHELF_GOODS', 'BOOKSHELF'), res);
  prop(map, 27, 12, tid('BARREL', 'CRATE'), res);          // the stack in the corner behind the shelves
  const tableAt = seating(map, rd, res);
  tableAt(16, 18, 2); tableAt(24, 15, 2); tableAt(25, 12);
  prop(map, 15, 14, tid('HEARTH', 'BRAZIER'), res);
  prop(map, 27, 17, tid('BARREL', 'CRATE'), res);
  prop(map, 27, 13, tid('BARREL', 'CRATE'), res);
  // A provisioning bench beside the shaft and a shared table by Volo make
  // the taproom feel used, while the central door-to-well route stays open.
  for (const x of [16,17]) prop(map, x, 13, tid('TABLE', 'COUNTER'), res);
  prop(map, 16, 12, tid('WEAPON_RACK', 'SHELF_GOODS'), res);
  prop(map, 17, 12, tid('CHEST_CLOSED', 'CRATE'), res);
  for (const x of [23,24]) {
    prop(map, x, 18, tid('TABLE', 'BENCH'), res);
  }
  prop(map, 26, 18, tid('SHELF_GOODS', 'BARREL'), res);
  oset(map, 21, 15, tid('CHANDELIER', 'CANDLE'));
  oset(map, 17, 13, tid('CHANDELIER', 'CANDLE'));
  awning(map, 20, 20, 3);                              // the canvas over the street door
  prop(map, 20, 20, tid('LANTERN', 'TORCH'), res);
  prop(map, 22, 20, tid('BANNER', 'SIGN'), res);

  // --- 4. the ward's shops -------------------------------------------------
  // Brick and stone under slate and pantile, awnings over the fronts, and no
  // two the same: the point of a trades ward is that every door is a business.
  const shop = (o) => building(map, {
    base: 'FLAGSTONE', approach: 1, step: 'FLAGSTONE', roofRows: o.h >= 6 ? 3 : 2,
    windows: [1, o.w - 2], ...o,
  }, res);
  // A scrivener's, an armourer's under a framed upper storey, a moneylender
  // too narrow for his own sign, a baker, a chandler, an alchemist, a smith.
  shop({ x: 5, y: 8, w: 7, h: 6, wall: 'BRICK_WALL', roof: 'slate', door: 3, sign: 2, trade: 'book', chimney: 5, lit: true, porch: 3, dormer: [1, 5] });
  shop({ x: 5, y: 15, w: 7, h: 5, wall: 'TIMBER_WALL', roof: 'tile', door: 3, sign: 4, trade: 'arms', chimney: 1, porch: 3, lantern: true });
  shop({ x: 29, y: 8, w: 3, h: 6, wall: 'BRICK_WALL', roof: 'slate', door: 1, windows: [1], chimney: 1 });
  pyramidRoof(map, 29, 8, 3, 'slate');
  shop({ x: 29, y: 15, w: 3, h: 5, wall: 'PLASTER_WALL', roof: 'shingle', door: 1, windows: [1], chimney: 1 });
  shop({ x: 6, y: 23, w: 8, h: 4, wall: 'BRICK_WALL', roof: 'tile', door: 3, sign: 5, trade: 'goods', chimney: 6, porch: 3 });
  shop({ x: 16, y: 23, w: 6, h: 4, wall: 'STONE_WALL', roof: 'slate', door: 2, sign: 4, trade: 'potion', chimney: 1, lit: true, lantern: true });
  shop({ x: 36, y: 23, w: 6, h: 4, wall: 'BRICK_WALL', roof: 'tile', door: 3, sign: 1, trade: 'bread', chimney: 4, porch: 3 });

  // --- 5. the House of Inspired Hands, and its close ----------------------
  // Gond's temple in the Trades Ward, where a wonder-smith will sell you a
  // clockwork thing you did not know you needed. Stone under slate, a workshop
  // wing on the east, and a walled garden behind it.
  // A temple, so it has a spire; a temple of Gond, so the spire is on a
  // workshop and the close behind it is a forge yard, not a garden.
  temple(map, {
    x: 34, y: 7, w: 8, h: 8, wall: 'STONE_WALL', roof: 'slate', spire: 'slate', tower: 'E', tw: 2, th: 9,
    roofRows: 3, door: 2, stained: [1, 3, 4], tall: [1, 4], lit: true, chimney: 1, lantern: true, buttress: [3],
  }, res);
  addSign(map, 37, 15, 'THE HOUSE OF INSPIRED HANDS — Gond Wonderbringer. Commissions taken; explosions are the commissioner’s risk.');
  building(map, {
    x: 35, y: 16, w: 6, h: 3, wall: 'SHED_WALL', roof: 'shingle', roofRows: 2, open: true,
    inside: [[1, 'FORGE'], [2, 'WEAPON_RACK'], [4, 'SHELF_GOODS']], chimney: 1, sign: 3, trade: 'smith',
  }, res);
  prop(map, 37, 19, tid('ANVIL', 'FORGE'), res);
  prop(map, 39, 19, tid('GRINDSTONE', 'ROCK'), res);
  prop(map, 40, 19, tid('CRATE', 'BARREL'), res);

  // --- 6. the bazaar -------------------------------------------------------
  floorRect(map, 23, 23, 9, 4, flag);
  stallRow(map, 24, 24, 4, 'h', rd, { step: 2, face: 1, res, banner: true });
  stallRow(map, 24, 26, 4, 'h', rd, { step: 2, face: -1, res });
  awning(map, 23, 25, 9);
  signpost(map, 23, 22, 'TRADES WARD BAZAAR. Everything has a price in Waterdeep; most of them are negotiable and all of them are taxed.', res);
  noticeBoard(map, 22, 23, res);

  // --- 7. the small furniture of a ward -----------------------------------
  prop(map, 11, 21, tid('FOUNTAIN', 'WELL'), res);
  prop(map, 12, 21, tid('FOUNTAIN', 'WELL'), res);
  prop(map, 8, 21, tid('STATUE', 'PILLAR'), res);
  for (const [px, py] of [[13, 20], [31, 21], [13, 28], [28, 28], [21, 6]]) prop(map, px, py, tid('BRAZIER', 'TORCH'), res);
  for (const [px, py] of [[6, 30], [18, 30], [28, 30]]) prop(map, px, py, tid('CART', 'CRATE'), res);
  for (const [px, py] of [[7, 30], [19, 30], [29, 30], [38, 30]]) prop(map, px, py, tid('HAY', 'SACK'), res);
  prop(map, 24, 30, tid('TROUGH', 'BARREL'), res);
  prop(map, 35, 21, tid('PLANTER', 'BUSH'), res);
  prop(map, 3, 21, tid('PLANTER', 'BUSH'), res);

  // --- 8. wear, clutter, flags --------------------------------------------
  map.recomputeFlags({ keep: 0 });
  const spare = new Set(['21,1', '21,2', '21,3', '20,13', '20,14', '20,15', '20,11',
    '30,29', '30,30', '30,31', '30,32']);
  // The open-house taproom belongs to the interior dresser. Street clutter
  // must not scatter hay, crates or carts across its tables and woven rugs.
  for(let y=11;y<=19;y++)for(let x=15;x<=27;x++)spare.add(`${x},${y}`);
  wearPatches(map, rd, { x: 2, y: 20, w: 40, h: 3 }, 'COBBLE_ISLE', 8, { res });
  wearPatches(map, rd, { x: 23, y: 23, w: 9, h: 4 }, 'PATH_ISLE', 4, { res });
  wearPatches(map, rd, { x: 2, y: 6, w: 40, h: 2 }, 'GRAVEL_ISLE', 5, { res });
  dressStreets(map, rd, { x: 2, y: 5, w: 40, h: 26 }, { res, chance: 0.13, avoid: spare });

  map.recomputeFlags({ keep: 0 });
  sealBorder(map, tid('BRICK_WALL', 'STONE_WALL'));
  openDoorway(map, 21, 2);
  openDoorway(map, 30, 32);
  clearStanding(map, 30, 30); clearStanding(map, 30, 31);
  openDoorway(map, portal.door.x, portal.door.y);
  sweepStanding(map, 'waterdeep');
  // Seating may put chairs on every side of the inn-service table. Leave a
  // reachable E-interaction tile between Durnan's counter and that table.
  clearStanding(map,17,17);
  // Westward street to the Castle Ward. Keep the approach clear after dressing.
  for(let x=0;x<=5;x++)for(let y=6;y<=7;y++){floor(map,x,y,flag);openDoorway(map,x,y);}
  map.stamp('deco',4,8,tid('SIGN'));
  addSign(map,4,8,'WEST — Castle Ward, Blackstaff Tower. Follow the street through the west opening; the silver mark admits visitors to the reception hall.','Street Sign');
  map.spawn = { x: 21, y: 3 };
  map.entry = { ...map.spawn };
  map.level = 8;
  addSign(map, 23, 19, 'THE YAWNING PORTAL — ale, beds, and a one-way trip down the well. Durnan, prop.');
  map.addTrigger({ id: 'yawning-portal-rest', kind: 'inn', x: 17, y: 18, data: { shop: 'yawning-portal', cost: 12, npc: 'durnan' } });
  map.addTrigger({ id: 'yawning-portal-well', kind: 'sign', x: 21, y: 12, data: { text: 'The shaft drops forty feet into blackness. A rope and windlass hang over it. Somewhere far below, water moves.' } });
  // The well itself: the way into Undermountain. Placed here rather than by the
  // warp-graph pass because the depth is decided by the save file, not the map.
  for (const [px, py] of [[20, 13], [20, 14], [20, 15]]) clearStanding(map, px, py);
  openDoorway(map, 20, 13);
  map.addTrigger({
    id: 'waterdeep>undermountain', kind: 'warp', x: 20, y: 13, facing: 'up',
    data: {
      map: 'undermountain', dir: 'down', kind: 'well', transition: 'fade',
      prompt: 'Climb down into Undermountain?',
    },
  });
  return map;
}

// ---------------------------------------------------------------------------
// 7. UNDERMOUNTAIN — the endless dungeon
// ---------------------------------------------------------------------------

/** Current descent, from the save file. Level 1 is the floor under the well. */
function undermountainDepth(st) {
  const d = st && st.depth ? st.depth.undermountain : null;
  return Math.max(1, (d | 0) || 1);
}

/**
 * Retarget the generic up/down stairs mapgen produced so they point at real map
 * ids: down goes one floor deeper, up climbs back — or, from the first level,
 * all the way out into the Yawning Portal's taproom.
 *
 * mapgen marks which stair is which in `data.dir`. That field means something
 * else to the overworld — it is the direction the party faces on arrival — so
 * the role is copied into `data.stair` first and `data.dir` is then free to
 * carry the facing. Omitting `x`/`y` means "use the destination's own spawn".
 */
function linkDungeonStairs(map, opts) {
  const { id, depth, up, down } = opts;
  for (const t of map.triggers || []) {
    if (t.kind !== 'warp' || !t.data) continue;
    const role = t.data.stair || t.data.dir;
    if (role !== 'up' && role !== 'down') continue;
    t.data.stair = role;
    t.data.kind = 'stairs';
    if (role === 'up') {
      if (depth <= 1) {
        // The way out. Without a surface link this floor is the bottom of a
        // one-way hole, so the stair is left inert rather than pointing nowhere.
        if (up) Object.assign(t.data, { map: up.map, x: up.x, y: up.y, dir: up.dir || 'down', exit: true });
        else Object.assign(t.data, { map: null, exit: true, dir: 'up' });
      } else {
        Object.assign(t.data, { map: depth === 2 ? id : `${id}-${depth - 1}`, depth: depth - 1, dir: 'up', exit: false });
        delete t.data.x; delete t.data.y;
      }
    } else {
      Object.assign(t.data, { map: down || `${id}-${depth + 1}`, depth: depth + 1, dir: 'down' });
      delete t.data.x; delete t.data.y;
    }
  }
  return map;
}

function buildUndermountain(root, ctx) {
  const depth = undermountainDepth(ctx.state);
  const map = generateDungeon({
    seed: `${ctx.seed}:undermountain:${depth}`,
    depth,
    theme: 'dungeon',
    biome: 'dungeon',
    size: depth < 3 ? 'medium' : (depth < 9 ? 'large' : 'huge'),
    name: `Undermountain — Level ${depth}`,
  });
  map.id = 'undermountain';
  map.name = `Undermountain — Level ${depth}`;
  map.region = 'undermountain';
  map.depth = depth;
  if (map.music !== 'boss') map.music = 'underdark';     // Halaster's halls, not any dungeon
  map.level = 8 + Math.floor(depth / 2);
  map.encounterTable = depth <= 2 ? 'undermountain-first-level'
    : depth <= 6 ? 'undermountain-ooze-pits' : 'undermountain-wards';
  linkDungeonStairs(map, {
    id: 'undermountain', depth,
    up: { map: 'waterdeep', x: 20, y: 15, dir: 'down' },
  });
  normalizeTriggers(map);
  return map;
}

// ---------------------------------------------------------------------------
// 8. THE CATALOGUE
// ---------------------------------------------------------------------------

function def(id, o) {
  return {
    id,
    name: o.name,
    kind: o.kind,                    // 'town'|'interior'|'road'|'wild'|'ruins'|'cave'|'city'|'dungeon'
    biome: o.biome,
    w: o.w, h: o.h,
    indoor: !!o.indoor,
    safe: !!o.safe,
    music: o.music || (o.indoor ? 'town' : 'field'),
    level: o.level || 1,
    region: o.region || null,
    parent: o.parent || null,        // the outdoor map an interior belongs to
    desc: o.desc || '',
    build: o.build,
  };
}

const CORE_MAP_DEFS = ({
  phandalin: def('phandalin', {
    name: 'Phandalin', kind: 'town', biome: 'city', w: 60, h: 50, safe: true, music: 'town',
    level: 1, region: 'phandalin-hills', build: buildPhandalin,
    desc: 'A frontier town in the foothills below the Sword Mountains, rebuilt on old Netherese ruins.',
  }),
  'stonehill-inn': def('stonehill-inn', {
    name: 'The Stonehill Inn', kind: 'interior', biome: 'city', w: 20, h: 16, indoor: true,
    safe: true, music: 'inn', parent: 'phandalin', build: buildStonehillInn,
    desc: 'Toblen Stonehill’s taproom: the warmest room in Phandalin and the loosest tongues.',
  }),
  'barthens-provisions': def('barthens-provisions', {
    name: "Barthen's Provisions", kind: 'interior', biome: 'city', w: 18, h: 14, indoor: true,
    safe: true, music: 'shop', parent: 'phandalin', build: buildBarthens,
    desc: 'The town’s general store — rope, rations, lamp oil and picks.',
  }),
  'lionshield-coster': def('lionshield-coster', {
    name: 'The Lionshield Coster', kind: 'interior', biome: 'city', w: 18, h: 12, indoor: true,
    safe: true, music: 'shop', parent: 'phandalin', build: buildLionshield,
    desc: 'Linene Graywind’s arms and armour, under the lion-shield sign of the Coster.',
  }),
  'shrine-of-luck': def('shrine-of-luck', {
    name: 'The Shrine of Luck', kind: 'interior', biome: 'city', w: 16, h: 14, indoor: true,
    safe: true, music: 'temple', parent: 'phandalin', build: buildShrineOfLuck,
    desc: 'Tymora’s shrine, tended by Sister Garaele of the Harpers.',
  }),
  'miners-exchange': def('miners-exchange', {
    name: "The Miner's Exchange", kind: 'interior', biome: 'city', w: 18, h: 12, indoor: true,
    safe: true, music: 'shop', parent: 'phandalin', build: buildMinersExchange,
    desc: 'Halia Thornton weighs ore, registers claims and quietly runs the Black Network.',
  }),
  'townmasters-hall': def('townmasters-hall', {
    name: "The Townmaster's Hall", kind: 'interior', biome: 'city', w: 20, h: 12, indoor: true,
    safe: true, music: 'town', parent: 'phandalin', build: buildTownmastersHall,
    desc: 'Harbin Wester’s desk, the bounty board, and one cell nobody has used in years.',
  }),
  'alderleaf-farm': def('alderleaf-farm', {
    name: 'The Alderleaf Burrow', kind: 'interior', biome: 'city', w: 20, h: 18, indoor: true,
    safe: true, music: 'camp', parent: 'phandalin', build: buildAlderleafFarm,
    desc: 'A halfling home dug into the turf: low ceilings, a hot hearth and too much food.',
  }),
  'sleeping-giant': def('sleeping-giant', {
    name: 'The Sleeping Giant', kind: 'interior', biome: 'city', w: 18, h: 14, indoor: true,
    safe: true, music: 'tense', parent: 'phandalin', build: buildSleepingGiant,
    desc: 'A grimy taproom on the east edge of town, and the Redbrands drink here.',
  }),
  'phandalin-manor': def('phandalin-manor', {
    name: 'Tresendar Manor', kind: 'ruins', biome: 'ruins', w: 26, h: 26, indoor: true,
    music: 'tense', level: 3, parent: 'phandalin', build: buildPhandalinManor,
    desc: 'The burnt shell of the Tresendar family seat. The cellars beneath are not empty.',
  }),

  'triboar-trail': def('triboar-trail', {
    name: 'The Triboar Trail', kind: 'road', biome: 'road', w: 100, h: 40, music: 'road',
    level: 2, region: 'triboar-trail', build: buildTriboarTrail,
    desc: 'The east–west road between the High Road and Triboar, running north of Phandalin.',
  }),
  'neverwinter-wood': def('neverwinter-wood', {
    name: 'Neverwinter Wood', kind: 'wild', biome: 'pine-forest', w: 60, h: 56, music: 'forest',
    level: 3, region: 'neverwinter-wood', build: buildNeverwinterWood,
    desc: 'Old pine forest under the shadow of Mount Hotenow, and a druid who does not want company.',
  }),
  thundertree: def('thundertree', {
    name:'Thundertree',kind:'ruins',biome:'ash-waste',w:32,h:28,music:'tense',
    level:8,region:'thundertree',build:buildThundertree,
    desc:'An ash road leads to a ruined tower where Venomfang guards his hoard.',
  }),
  'conyberry-ruins': def('conyberry-ruins', {
    name: 'Conyberry', kind: 'ruins', biome: 'ruins', w: 44, h: 36, music: 'tense',
    level: 4, region: 'conyberry', build: buildConyberryRuins,
    desc: 'A village the Uthgardt sacked a generation ago. A banshee keeps the grove east of it.',
  }),
  'wave-echo-cave-entrance': def('wave-echo-cave-entrance', {
    name: 'Wave Echo Cave', kind: 'cave', biome: 'hills', w: 30, h: 34, music: 'cave',
    level: 5, region: 'phandalin-hills', build: buildWaveEchoEntrance,
    desc: 'The mine head of the Lost Mine of Phandelver, in a bowl of rock south of the Trail.',
  }),

  neverwinter: def('neverwinter', {
    name: "Neverwinter — Protector's Enclave", kind: 'city', biome: 'city', w: 48, h: 36,
    safe: true, music: 'city', level: 6, region: 'neverwinter', build: buildNeverwinter,
    desc: 'The rebuilt heart of the City of Skilled Hands, walled against everything outside it.',
  }),
  waterdeep: def('waterdeep', {
    name: 'Waterdeep — Trades Ward', kind: 'city', biome: 'city', w: 44, h: 34,
    safe: true, music: 'city', level: 8, region: 'waterdeep', build: buildWaterdeep,
    desc: 'A stretch of the Trades Ward, and the Yawning Portal’s well down into Undermountain.',
  }),
  undermountain: def('undermountain', {
    name: 'Undermountain', kind: 'dungeon', biome: 'dungeon', w: 0, h: 0, indoor: true,
    music: 'underdark', level: 8, region: 'undermountain', build: buildUndermountain,
    desc: 'Halaster Blackcloak’s endless dungeon beneath Mount Waterdeep. It has no bottom.',
  }),
});

/**
 * Every map in the game: the Sword Coast North core plus each region pack.
 * A pack supplies RAW definitions (the same fields `def` takes); they are run
 * through `def` here so a pack never has to import it.
 */
function packDefs(pack) {
  const out = {};
  for (const [id, o] of Object.entries(pack || {})) out[id] = def(id, o);
  return out;
}

for (const f of CORE_INN_FLOORS) CORE_MAP_DEFS[f.id] = def(f.id, f.def);

export const MAP_DEFS = Object.freeze({
  ...CORE_MAP_DEFS,
  ...packDefs(SOUTH_MAPS),
  ...packDefs(BG_MAPS),
  ...packDefs(BLACKSTAFF_MAPS),
});


export const MAP_IDS = Object.freeze(Object.keys(MAP_DEFS));
configureReputationMaps(MAP_DEFS);

// ---------------------------------------------------------------------------
// 9. PROCEDURAL FALL-THROUGH
// ---------------------------------------------------------------------------

/**
 * Canonical sites we know about but do not hand-build: each gets a generator,
 * a biome and a suggested level so an unwritten id never returns null.
 */
const PROC_SITES = Object.freeze({
  // 'undermountain-7' and friends: the endless descent, named and levelled here
  // so a floor id resolves even when it is loaded straight from a save file.
  undermountain: { gen: 'dungeon', biome: 'dungeon', music: 'underdark', name: 'Undermountain', level: 8, size: 'large' },
  'cragmaw-hideout': { gen: 'cave', biome: 'cave', music: 'cave', name: 'Cragmaw Hideout', level: 2, size: 'small' },
  'cragmaw-castle': { gen: 'dungeon', biome: 'dungeon', music: 'dungeon', name: 'Cragmaw Castle', level: 5, size: 'medium' },
  'redbrand-hideout': { gen: 'dungeon', biome: 'dungeon', music: 'dungeon', name: 'The Redbrand Hideout', level: 3, size: 'medium' },
  'wave-echo-cave': { gen: 'mine', biome: 'mine', music: 'cave', name: 'Wave Echo Cave', level: 5, size: 'large' },
  thundertree: { gen: 'ruins', biome: 'ash-waste', music: 'tense', name: 'Thundertree', level: 5, size: 'medium' },
  'old-owl-well': { gen: 'crypt', biome: 'crypt', music: 'crypt', name: 'Old Owl Well', level: 6, size: 'medium' },
  'icespire-peak': { gen: 'lair', biome: 'tundra', music: 'boss', name: 'Icespire Peak', level: 12, size: 'large' },
  'wyvern-tor': { gen: 'cave', biome: 'cave', music: 'cave', name: 'Wyvern Tor', level: 5, size: 'small' },
  'kryptgarden-forest': { gen: 'forest', biome: 'forest', music: 'forest', name: 'Kryptgarden Forest', level: 8, size: 'large' },
  'mere-of-dead-men': { gen: 'forest', biome: 'marsh', music: 'marsh', name: 'The Mere of Dead Men', level: 7, size: 'large' },
  leilon: { gen: 'ruins', biome: 'ruins', music: 'tense', name: 'Leilon', level: 3, size: 'medium' },
  'ardeep-forest': { gen: 'forest', biome: 'forest', music: 'forest', name: 'Ardeep Forest', level: 6, size: 'medium' },
});

/** 'undermountain-7' -> { base:'undermountain', depth:7 }. */
function splitDepth(id) {
  const m = /^(.*)-(\d+)$/.exec(String(id || ''));
  if (!m) return { base: String(id || ''), depth: 0 };
  return { base: m[1], depth: parseInt(m[2], 10) || 0 };
}

const GENERATORS = {
  dungeon: generateDungeon, cave: generateCave, mine: generateMine,
  crypt: generateCrypt, ruins: generateRuins, forest: generateForest, lair: generateLair,
};

/** Build whatever `id` most plausibly is, without ever throwing. */
function buildProcedural(id, ctx) {
  const { base, depth } = splitDepth(id);
  const site = PROC_SITES[base] || PROC_SITES[id] || null;
  const gen = GENERATORS[(site && site.gen) || 'dungeon'] || generateDungeon;
  const d = Math.max(1, depth || 1);
  const opts = {
    seed: `${ctx.seed}:${id}`,
    depth: d,
    theme: site && site.gen === 'forest' ? undefined : (site ? site.gen : 'dungeon'),
    biome: site ? site.biome : 'dungeon',
    size: (site && site.size) || 'medium',
    pine: site ? site.biome === 'pine-forest' : false,
    name: site ? (depth ? `${site.name} — Level ${depth}` : site.name) : titleFromId(base),
    level: site ? site.level : Math.max(1, d),
  };
  let map = null;
  try { map = gen(opts); } catch (e) {
    try { map = generateDungeon({ ...opts, theme: 'dungeon', biome: 'dungeon' }); } catch (e2) { map = null; }
  }
  if (!map) {
    // Absolute last resort: a small safe room, so travel never dead-ends.
    map = new TileMap({ w: 15, h: 11, id, name: titleFromId(base), biome: 'dungeon', indoor: true, music: 'dungeon' });
    floorRect(map, 0, 0, 15, 11, tid('STONE_FLOOR', 'DIRT'));
    dframe(map, 0, 0, 15, 11, tid('DUNGEON_WALL', 'STONE_WALL'));
    map.recomputeFlags({ keep: 0 });
    map.spawn = { x: 7, y: 5 };
  }
  map.id = id;
  if (!map.level) map.level = opts.level;
  map.region = base;
  // A site names its own music; a lair or a milestone floor keeps the generator's boss theme.
  if (site && site.music && map.music !== 'boss') map.music = site.music;

  // Endless sites keep descending under their own id; one-shot sites climb out.
  if (base === 'undermountain') {
    linkDungeonStairs(map, { id: 'undermountain', depth: d, up: { map: 'waterdeep', x: 20, y: 15, dir: 'down' } });
  } else if (base === 'wave-echo-cave') {
    linkDungeonStairs(map, { id: base, depth: d, up: d <= 1 ? { map: 'wave-echo-cave-entrance', x: 14, y: 29, dir: 'up' } : null });
  } else if (base === 'redbrand-hideout') {
    linkDungeonStairs(map, { id: base, depth: d, up: d <= 1 ? { map: 'phandalin-manor', x: 13, y: 4, dir: 'down' } : null });
  } else {
    linkDungeonStairs(map, { id: base, depth: d, up: null });
  }
  normalizeTriggers(map);
  return map;
}

function titleFromId(id) {
  return String(id || 'Somewhere').replace(/-/g, ' ').replace(/(^|\s)(\w)/g, (m, a, b) => a + b.toUpperCase());
}

// ---------------------------------------------------------------------------
// 10. METADATA
// ---------------------------------------------------------------------------

/**
 * A descriptor for any map id at all — hand-built, procedural site, or an
 * arbitrary '<site>-<depth>' floor. Never returns null.
 */
export function mapMeta(id) {
  const key = String(id || '');
  const d = MAP_DEFS[key];
  if (d) {
    return {
      id: d.id, name: d.name, kind: d.kind, biome: d.biome, indoor: d.indoor,
      safe: d.safe, music: d.music, level: d.level, region: d.region,
      parent: d.parent, w: d.w, h: d.h, desc: d.desc, procedural: false,
    };
  }
  const { base, depth } = splitDepth(key);
  const site = PROC_SITES[base] || PROC_SITES[key] || null;
  const name = site ? (depth ? `${site.name} — Level ${depth}` : site.name) : titleFromId(base || key);
  return {
    id: key,
    name,
    kind: site ? (site.gen === 'forest' ? 'wild' : site.gen) : 'dungeon',
    biome: site ? site.biome : 'dungeon',
    indoor: !site || site.gen !== 'forest',
    safe: false,
    music: site ? site.music : 'dungeon',
    level: (site ? site.level : 1) + Math.floor(Math.max(0, depth - 1) / 3),
    region: base || key,
    parent: null,
    w: 0, h: 0,
    desc: '',
    procedural: true,
    depth: depth || 0,
  };
}

/** Every hand-built place, for the world map screen and the debug warp menu. */
export function knownMaps() { return MAP_IDS.map((id) => mapMeta(id)); }

/** Is this a place we authored by hand? */
export function isHandBuilt(id) { return !!MAP_DEFS[id]; }

// ---------------------------------------------------------------------------
// 11. LOADING, CACHING AND PERSISTENCE
// ---------------------------------------------------------------------------

const cache = new Map();       // cacheKey -> TileMap

/** Drop one map (or all of them) so the next visit rebuilds from the seed. */
export function clearMapCache(id) {
  if (id == null) { cache.clear(); return 0; }
  let n = 0;
  const prefix = `${id}|`;
  for (const k of Array.from(cache.keys())) {
    if (k === id || k.startsWith(prefix)) { cache.delete(k); n++; }
  }
  return n;
}

function activeState(opts) {
  if (opts && opts.state) return opts.state;
  try { return Game && Game.state ? Game.state : null; } catch (e) { return null; }
}

function worldSeedOf(st, opts) {
  if (opts && opts.seed != null) return opts.seed;
  if (st && st.worldSeed != null) return st.worldSeed;
  if (st && st.seed != null) return st.seed;
  return 'sword-coast';
}

/** Depth matters to the cache key: level 7 of Undermountain is not level 6. */
function cacheKeyFor(id, st, opts) {
  const seed = worldSeedOf(st, opts);
  let depth = opts && opts.depth != null ? opts.depth : 0;
  if (!depth && id === 'undermountain') depth = undermountainDepth(st);
  return `${id}|${seed}|${depth}`;
}

// --- persistence ------------------------------------------------------------

function chestIsLooted(st, mapId, x, y) {
  if (!st || !st.chests) return false;
  return !!st.chests[`${mapId}:${x},${y}`];
}

function flagOn(st, name) {
  if (!st || !name) return false;
  if (st.flags && st.flags[name]) return true;
  return false;
}

/**
 * Fold the save file back over a freshly built map: fog of war, looted chests,
 * defeated uniques, doors you have already unlocked, one-shot scripts already
 * played. Everything here is best-effort — a save from an older build must
 * never stop a map from loading.
 */
function applyPersistentState(map, id, st) {
  if (!st) return map;
  try {
    if (st.discovered && st.discovered[id]) map.loadDiscovered(st.discovered[id]);
  } catch (e) { /* corrupt fog list */ }

  for (const t of map.triggers) {
    try {
      switch (t.kind) {
        case 'chest':
          if (chestIsLooted(st, id, t.x, t.y)) t.done = true;
          break;
        case 'battle': {
          const uid = t.data && (t.data.boss || t.data.unique || t.data.id);
          if (uid && st.defeated && st.defeated[uid]) t.done = true;
          if (t.data && t.data.flag && flagOn(st, t.data.flag)) t.done = true;
          break;
        }
        case 'script':
        case 'quest':
          if (t.data && t.data.flag && flagOn(st, t.data.flag)) t.done = true;
          break;
        default:
          break;
      }
    } catch (e) { /* skip a malformed trigger */ }
  }

  // Doors you have opened or unlocked stay that way.
  const doors = st.doors || null;
  if (doors) {
    for (const key of Object.keys(doors)) {
      if (!key.startsWith(`${id}:`)) continue;
      const part = key.slice(id.length + 1);
      const c = part.indexOf(',');
      const x = parseInt(part.slice(0, c), 10), y = parseInt(part.slice(c + 1), 10);
      if (!map.inBounds(x, y)) continue;
      map.set('deco', x, y, tid('DOOR_OPEN', 'DOOR_CLOSED'));
      openDoorway(map, x, y);
    }
  }

  if (st.visited) st.visited[id] = true;
  return map;
}

// --- entities ---------------------------------------------------------------

/** Nudge a spawn off a wall rather than letting an NPC vanish into stone. */
function safeTile(map, x, y) {
  if (!map.inBounds(x, y)) {
    const c = map.clampPos(x, y);
    x = c.x; y = c.y;
  }
  if (!map.solidAt(x, y)) return { x, y };
  const near = map.nearestWalkable(x, y, 8);
  return near || { x, y };
}

/**
 * Populate the map from data/npcs.js. `hidden`/`requires` gating is handled by
 * npcs.js itself; we just supply the flag lookup.
 */
function spawnNpcs(map, id, st) {
  const flagFn = (name) => flagOn(st, name);
  let list = [];
  try { list = spawnableOnMap(id, flagFn) || []; } catch (e) { list = []; }
  const slain = (st && st.crime && st.crime.slain) || {};
  for (const n of list) {
    // Someone the party killed does not open the shop again tomorrow. This is
    // the authoritative spawn for every hand-built map, so the check has to be
    // here — the overworld's own populateCast only ever sees what this missed.
    if (slain[n.id]) continue;
    try {
      // Never let a decoration bury somebody.
      clearStanding(map, n.x, n.y);
      const at = safeTile(map, n.x, n.y);
      const e = new NPCEntity({
        id: `npc-${n.id}`, npcId: n.id, name: n.name, title: n.title || '',
        x: at.x, y: at.y, dir: n.dir || 'down',
        sprite: n.sprite, colorway: n.colorway,
        solid: n.solid !== false,
        wander: n.wander || 0,
        dialogueId: n.dialogue || null,
        shopId: n.shop || null,
        questIds: n.quests || [],
        faction: n.faction || null,
        role: n.role || 'flavor',
        greeting: n.greeting || null,
        schedule: n.schedule || null,
        // rules/crime.js reads these to decide whether steel may be drawn.
        tag: n.tag || null,
        essential: !!n.essential,
        noCombat: !!n.noCombat,
        npc: n,
        home: { x: at.x, y: at.y },
        data: { tag: n.tag || null, species: n.species || 'human', title: n.title || '' },
      });
      map.addEntity(e);
    } catch (e) { /* a broken cast entry must not break the map */ }
  }
  return map;
}

// --- the loader -------------------------------------------------------------

/**
 * Build (or fetch from cache) the map called `id`.
 *
 *   loadMap('phandalin')
 *   loadMap('undermountain')            // depth comes from state.depth.undermountain
 *   loadMap('undermountain-7')          // an explicit floor
 *   loadMap('cragmaw-hideout')          // procedural, via mapgen
 *
 * opts: { seed, state, depth, force, entities=true, cache=true }
 */
export function loadMap(id, opts = {}) {
  const mapId = String(id || 'phandalin');
  const st = activeState(opts);
  const key = cacheKeyFor(mapId, st, opts);

  if (opts.force) cache.delete(key);
  const hit = opts.cache === false ? null : cache.get(key);
  if (hit) {
    applyPersistentState(hit, mapId, st);
    return hit;
  }

  const seed = worldSeedOf(st, opts);
  const ctx = {
    id: mapId, seed, state: st,
    depth: opts.depth != null ? opts.depth : undefined,
    flags: (st && st.flags) || {},
  };

  let map = null;
  const d = MAP_DEFS[mapId];
  if (d && typeof d.build === 'function') {
    try {
      map = d.build(makeRNG(`${seed}:${mapId}`), ctx);
    } catch (e) {
      // A broken hand-built map should not end the campaign; fall back to a
      // generated stand-in with the right name so travel still works.
      try { console.error(`[maps] ${mapId} failed to build`, e); } catch (e2) { /* no console */ }
      map = null;
    }
  }
  if (!map) map = buildProcedural(mapId, ctx);

  // --- normalise ----------------------------------------------------------
  map.id = mapId;
  if (d) {
    if (d.name) map.name = d.name;
    map.region = map.region || d.region || null;
    if (d.safe) map.safe = true;
    if (!map.level) map.level = d.level;
  }
  if (!map.spawn || map.solidAt(map.spawn.x, map.spawn.y)) {
    const s = safeTile(map, map.spawn ? map.spawn.x : map.w >> 1, map.spawn ? map.spawn.y : map.h >> 1);
    map.spawn = { x: s.x, y: s.y };
  }
  map.entry = map.entry || { ...map.spawn };

  // Declared warps last, so they win over anything a generator painted.
  applyWarpNodes(map, mapId);
  try { map.reindexTriggers(); } catch (e) { /* fresh map */ }
  // Cliff and cave-wall masses get their rims and faces (render/tiles.js).
  try { resolveTileMasses(map); } catch (e) { /* bare masses still draw */ }
  // Roof rows and verges, wall corners, the wall each window sits in, interior
  // faces and wall tops, rug borders (render/tiles_arch.js section 7).
  try { resolveArchitecture(map); } catch (e) { /* authored tiles still draw */ }

  // Encounter zones for wilds that did not declare any of their own.
  if (!map.indoor && !map.safe && map.encounterTable && !map.triggersOfKind('encounter-zone').length) {
    try { placeEncounterZones(map, makeRNG(`${seed}:${mapId}:zones`), { biome: map.biome }); } catch (e) { /* optional */ }
  }

  // --- populate -----------------------------------------------------------
  dressCityStreets(map);
  if (!map.entityList) new EntityList(map);
  if (opts.entities !== false) spawnNpcs(map, mapId, st);
  if (opts.entities !== false) populateCityStreets(map);
  if (opts.entities !== false && mapId === 'thundertree' && !flagOn(st,'venomfang-driven') && !st?.defeated?.['thundertree:venomfang']) {
    map.addEntity(new MonsterEntity({id:'thundertree-venomfang',monsterId:'venomfang',name:'Venomfang',
      x:16,y:10,dir:'down',boss:true,level:8,count:1,monsters:[{id:'venomfang',count:1}],
      aggro:false,wander:0,permanent:true,defeatedKey:'thundertree:venomfang'}));
  }

  applyPersistentState(map, mapId, st);
  if (opts.cache !== false) cache.set(key, map);
  return map;
}

/** Rebuild a map from scratch, discarding the cached copy. */
export function reloadMap(id, opts = {}) { return loadMap(id, { ...opts, force: true }); }

/** What is currently cached — handy for the debug overlay. */
export function cachedMapKeys() { return Array.from(cache.keys()); }

export default MAP_DEFS;
