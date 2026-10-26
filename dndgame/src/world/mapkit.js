// world/mapkit.js — the ONE painting kit every hand-built map is drawn with.
//
// maps.js, maps_south.js and maps_baldursgate.js used to each carry a private
// copy of these helpers "so a pack could be authored in parallel". The copies
// drifted (one accepted `ironDoor`, one `iron`, one neither; only one knew
// `step`), so the kit now lives here and the three files import it. Nothing in
// this module imports maps.js or a region pack — it sits UNDER them, next to
// mapgen.js, and only reaches down into tilemap.js, mapgen.js's `tid()`, the
// tileset's flag table and data/npcs.js (for the reserved-tile sets).
//
// CONTENTS
//   §0  low-level painting     gset/dset/oset, floor, rects, table/pickT, prop,
//                              scatter, groundNoise, patches, repave, sealBorder,
//                              openDoorway, normalizeTriggers, reservedFor, reserve,
//                              clearStanding, sweepStanding
//   §1  buildings              ROOFS, BASE_COURSE, FOOTPRINTS, building, openHouse,
//                              shell, partition, room, fenceRect, bigOak, bigPine
//   §2  interiors              seating, addSign, signpost, interiorMap, interiorSize,
//                              interiorFor, finishInterior, innUpstairs,
//                              innUpstairsSize, innFloor
//   §3  masonry                curtain, keepTower, gateway, gatewayH, ruinShell,
//                              carriageway, bend, milestone
//   §4  street furniture       stallRow, awning, washingLine, garden, graveyard,
//                              orchard, wearPatches, dressStreets, canPlaceProp
//   §5  connectivity           openThickets, connectRegions, packDungeon, siteMouth
//
// RULES. Nothing here calls Math.random(); every helper that rolls takes the
// RNG it is handed. Tile ids are always resolved through `tid()` so a renamed
// tile degrades to a fallback rather than throwing. The `over` plane never
// contributes to `recomputeFlags`, so anything painted there is pure paint.

import { TileMap, TF } from './tilemap.js';
import {
  tid, generateDungeon, generateCave, generateMine, generateCrypt, generateRuins, canPlaceProp,
} from './mapgen.js';
import { tileFlags } from '../render/tiles.js';
import { npcsOnMap } from '../data/npcs.js';

// ---------------------------------------------------------------------------
// 0. LOW-LEVEL PAINTING
// ---------------------------------------------------------------------------

export const KEY = (x, y) => `${x},${y}`;
export const DIRS4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];

export function gset(map, x, y, id) { if (id != null && map.inBounds(x, y)) map.ground[y * map.w + x] = id | 0; }
export function dset(map, x, y, id) { if (id != null && map.inBounds(x, y)) map.deco[y * map.w + x] = id | 0; }
export function oset(map, x, y, id) { if (id != null && map.inBounds(x, y)) map.over[y * map.w + x] = id | 0; }

/** Lay a floor tile and sweep whatever was standing on it. */
export function floor(map, x, y, id) {
  if (!map.inBounds(x, y)) return;
  const i = y * map.w + x;
  if (id != null) map.ground[i] = id | 0;
  map.deco[i] = 0;
  map.over[i] = 0;
}

export function grect(map, x, y, w, h, id) {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) gset(map, i, j, id);
}
export function drect(map, x, y, w, h, id) {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) dset(map, i, j, id);
}
export function orect(map, x, y, w, h, id) {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) oset(map, i, j, id);
}
export function floorRect(map, x, y, w, h, id) {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) floor(map, i, j, id);
}
/** Outline only — the walls of a room, the rails of a paddock. */
export function dframe(map, x, y, w, h, id) {
  for (let i = x; i < x + w; i++) { dset(map, i, y, id); dset(map, i, y + h - 1, id); }
  for (let j = y; j < y + h; j++) { dset(map, x, j, id); dset(map, x + w - 1, j, id); }
}

/** Resolve a weighted [name, weight] table to real tile ids once, up front. */
export function table(rows) {
  const out = [];
  for (const [name, w] of rows) {
    const id = tid(name);
    if (id != null) out.push([id, w]);
  }
  return out;
}
export function pickT(r, tbl, fallback = 0) {
  if (!tbl || !tbl.length) return fallback;
  const e = r.pickWeighted(tbl, (x) => x[1]);
  return e ? e[0] : fallback;
}

/**
 * A prop that refuses to stand on somebody's feet. `res` is the reserved-tile
 * set built from data/npcs.js (plus every building footprint on the map).
 */
export function prop(map, x, y, id, res) {
  if (!map.inBounds(x, y) || id == null) return false;
  if (res && res.has(KEY(x, y))) return false;
  map.deco[y * map.w + x] = id | 0;
  return true;
}

/** Scatter deco across a rect at a given density, skipping reserved tiles. */
export function scatter(map, r, x, y, w, h, tbl, chance, res) {
  for (let j = y; j < y + h; j++) {
    for (let i = x; i < x + w; i++) {
      if (!map.inBounds(i, j)) continue;
      if (map.deco[j * map.w + i]) continue;
      if (!r.chance(chance)) continue;
      prop(map, i, j, pickT(r, tbl), res);
    }
  }
}

/** Speckle the ground plane from a weighted table. */
export function groundNoise(map, r, x, y, w, h, tbl) {
  for (let j = y; j < y + h; j++) {
    for (let i = x; i < x + w; i++) gset(map, i, j, pickT(r, tbl));
  }
}

/**
 * Blot COHERENT clumps of one material over another.
 *
 * `groundNoise` is for a FAMILY — GRASS/GRASS_2/GRASS_3/CLOVER are four cuts of
 * one lawn. Feed it two different MATERIALS at comparable weights and every tile
 * becomes a coin flip between gravel and turf: television static. So:
 * `groundNoise` the base family, then `patches` the second material in blobs
 * you can see the shape of. Each blob grows outward from a seed with a 4-way
 * frontier, which gives a ragged edge rather than a rectangle.
 */
export function patches(map, r, x, y, w, h, tbl, count, lo = 4, hi = 16, res = null) {
  for (let n = 0; n < count; n++) {
    let budget = r.int(lo, hi);
    const open = [[r.int(x, x + w - 1), r.int(y, y + h - 1)]];
    const done = new Set();
    while (budget > 0 && open.length) {
      const [px, py] = open.splice(r.int(0, open.length - 1), 1)[0];
      const key = KEY(px, py);
      if (done.has(key)) continue;
      done.add(key);
      if (px < x || py < y || px >= x + w || py >= y + h) continue;
      if (!map.inBounds(px, py)) continue;
      if (res && res.has(key)) continue;
      gset(map, px, py, pickT(r, tbl));
      budget--;
      for (const [dx, dy] of DIRS4) if (r.chance(0.6)) open.push([px + dx, py + dy]);
    }
  }
}

/**
 * Re-lay the district's own ground over every OPEN tile in a rect — the tiles
 * with nothing standing on them. `building()` drags a beaten DIRT_PATH approach
 * out of every door it cuts, which is right in Phandalin and wrong on a flagged
 * city street, so a city map paints its buildings first and then repaves.
 */
export function repave(map, r, x, y, w, h, tbl) {
  for (let j = y; j < y + h; j++) {
    for (let i = x; i < x + w; i++) {
      if (!map.inBounds(i, j)) continue;
      if (map.deco[j * map.w + i]) continue;
      gset(map, i, j, pickT(r, tbl));
    }
  }
}

/**
 * Ring the map in something solid so no camera bug or pathing slip can walk the
 * party off the edge. Warp pads always sit one tile inside this ring.
 */
export function sealBorder(map, fillId) {
  const id = fillId != null ? fillId : tid('BLACK', 'VOID');
  for (let x = 0; x < map.w; x++) {
    if (!map.deco[x]) dset(map, x, 0, id);
    if (!map.deco[(map.h - 1) * map.w + x]) dset(map, x, map.h - 1, id);
    map.setFlag(x, 0, TF.SOLID);
    map.setFlag(x, map.h - 1, TF.SOLID);
  }
  for (let y = 0; y < map.h; y++) {
    if (!map.deco[y * map.w]) dset(map, 0, y, id);
    if (!map.deco[y * map.w + map.w - 1]) dset(map, map.w - 1, y, id);
    map.setFlag(0, y, TF.SOLID);
    map.setFlag(map.w - 1, y, TF.SOLID);
  }
  return map;
}

/** Turn a stamped-solid door tile into something you can actually walk through. */
export function openDoorway(map, x, y) {
  if (!map.inBounds(x, y)) return;
  map.clearFlag(x, y, TF.SOLID | TF.WATER | TF.SLOW | TF.DAMAGE);
  map.setFlag(x, y, TF.DOOR | TF.TRIGGER);
}

/**
 * mapgen pushes plain objects straight onto `map.triggers`, which leaves them
 * without ids, `step` hints or a lookup index. Re-add them through TileMap so
 * the overworld sees the same shape from every source.
 */
export function normalizeTriggers(map) {
  try {
    const raw = (map.triggers || []).slice();
    map.clearTriggers();
    for (const t of raw) map.addTrigger(t);
  } catch (e) { try { map.reindexTriggers(); } catch (e2) { /* give up quietly */ } }
  return map;
}

/** Every NPC tile on a map, whether or not they spawn yet. Props avoid these. */
export function reservedFor(id) {
  const s = new Set();
  try { for (const n of npcsOnMap(id)) s.add(KEY(n.x, n.y)); } catch (e) { /* catalogue absent */ }
  return s;
}

/**
 * TWO SETS, AND THEY ARE NOT THE SAME SET.
 *
 *   `npcs`  exactly the tiles data/npcs.js stands somebody on. Swept clear at
 *           the very end, so nobody is ever bricked into a wall.
 *   `res`   that, plus every building footprint and every stretch of curtain
 *           wall, because `building()` adds its own rect to whatever set it is
 *           handed. Props avoid it and `openThickets` refuses to dig through it.
 *
 * Sweeping `res` instead of `npcs` would knock the solid out of every wall on
 * the map, which is a spectacular way to ruin a town.
 */
export function reserve(id) {
  const npcs = reservedFor(id);
  return { npcs, res: new Set(npcs) };
}

/** Nothing may stand where the cast is supposed to be standing. */
export function clearStanding(map, x, y) {
  if (!map.inBounds(x, y)) return;
  const i = y * map.w + x;
  if (!(map.flags[i] & TF.SOLID)) return;
  map.deco[i] = 0;
  map.flags[i] = (map.flags[i] & ~(TF.SOLID)) | 0;
}

/**
 * The exterior equivalent of `finishInterior`'s NPC sweep: nobody may be bricked
 * in. Handed a SET it sweeps exactly those tiles. Handed a MAP ID it looks the
 * cast up itself and spares doors and gates — a warden posted ON a gate is
 * standing on a door tile on purpose, and wiping that tile would delete the
 * door; `applyWarpNodes` opens them a moment later anyway.
 */
export function sweepStanding(map, resOrId) {
  if (!resOrId) return map;
  if (typeof resOrId === 'string') {
    const doors = new Set([tid('DOOR_CLOSED'), tid('DOOR_OPEN'), tid('IRON_DOOR'), tid('GATE'), tid('GATEWAY')].filter((v) => v != null));
    for (const k of reservedFor(resOrId)) {
      const [x, y] = k.split(',').map(Number);
      if (!map.inBounds(x, y)) continue;
      if (doors.has(map.deco[y * map.w + x])) continue;
      clearStanding(map, x, y);
    }
    return map;
  }
  for (const k of resOrId) { const [x, y] = k.split(',').map(Number); clearStanding(map, x, y); }
  return map;
}

// ---------------------------------------------------------------------------
// 1. BUILDINGS
// ---------------------------------------------------------------------------
//
// ELEVATION. A house has to be read from the top down as five bands, and if any
// of them is missing the whole thing flattens into a sticker printed on the
// grass:
//
//     ridge        the crest (THATCH_RIDGE / *_RIDGE)
//     pitch        one or two more courses of roof
//     eave         the last roof course, on the `over` plane. overworld.js
//                  reads that plane in `_drawOverhangs` and drops a five-row
//                  ramp onto whatever is directly south of it — so the row
//                  below an eave must be WALL, not more roof
//     wall face    one to three storeys of wall, with the windows and the sign
//     base course  a stone footing where the wall meets the ground, with the
//                  door punched through it
//
// Only the base-course row is nailed down: the door has to stay on it, because
// WORLD_NODES warps to those exact coordinates and data/npcs.js spawns against
// them. Everything above it is free.

// Thatch always had a ridge, a left verge and a right verge; shingle and tile
// were one flat tile repeated, so a shingled house had no barge-boards and no
// crest and read as a rectangle of texture. render/tiles.js now carries the
// four-piece set for shingle, pantile and slate too, and each `tid()` falls
// back to the old single tile if a name is ever dropped.
export const ROOFS = {
  thatch: { ridge: 'THATCH_RIDGE', l: 'THATCH_L', m: 'THATCH_M', r: 'THATCH_R' },
  shingle: { ridge: 'SHINGLE_RIDGE', l: 'SHINGLE_L', m: 'SHINGLE_M', r: 'SHINGLE_R' },
  tile: { ridge: 'TILE_RIDGE', l: 'TILE_L', m: 'TILE_M', r: 'TILE_R' },
  slate: { ridge: 'SLATE_RIDGE', l: 'SLATE_L', m: 'SLATE_M', r: 'SLATE_R' },
};

/**
 * What a wall stands on. Timber gets a fieldstone footing with its own lit cap,
 * stone gets a flatter, heavier course — either way the bottom row of a facade
 * is a different material from the wall above it.
 */
export const BASE_COURSE = {
  WATTLE_WALL: 'STONE_WALL', LOG_WALL: 'STONE_WALL', PALISADE: 'STONE_WALL',
  STONE_WALL: 'WALL_TOP_SHADE', BRICK_WALL: 'WALL_TOP_SHADE', RUINED_WALL: 'WALL_TOP_SHADE',
};

/**
 * Exterior footprints by interior map id, recorded by `building()` when a call
 * site names its interior (`interior: 'stonehill-inn'`). `interiorFor()` reads
 * it so a room can be sized to the house it is inside.
 */
export const FOOTPRINTS = {};

/**
 * A real enterable house. The whole footprint is solid; the roof sits on the
 * `over` plane so the party walks behind it and disappears.
 *
 * b: { x, y, w, h, wall, roof:'thatch'|'shingle'|'tile'|'slate', base,
 *      roofRows, peak:dx, chimney:dx, chimney2:dx, roofPatch:[[dx,dy]], patchTile,
 *      door:dx, ironDoor|iron, windows:[dx], upper:[dx], shutters:[dx], loading:[dx],
 *      stalls:[dx], stained:[dx], sign:dx, trade, lit, course, band, bandTile,
 *      approach, step, interior, open, inside:[[dx,key]],
 *      wings:[{dx,dy,w,h,roof,wall,roofRows,windows}], porch, lantern, dormers }
 *
 * OPEN makes a shed with no front wall — a smithy's forge shed, a cart shed,
 * a market hall: the bottom row is its planked back wall seen under the eave,
 * a post at each end, and `inside` puts the trade against it (a FORGE, HAY).
 *
 * WINGS make an L or a T out of one call. A wing is a second mass hung off the
 * main block at (x+dx, y+dy); it shares the wall, base and course, gets its own
 * roof, and never gets a door — a house has exactly ONE door and it is the one
 * WORLD_NODES warps to. A wing may not cover the door tile or the row in front
 * of it, and is clipped rather than allowed to.
 *
 * PORCH hangs an AWNING (over plane, not solid) across the row in front of the
 * door, so a door reads as somewhere you shelter rather than a hole in a wall.
 * LANTERN stands one beside the threshold. DORMERS is the second row of windows
 * a building tall enough to have two storeys gets automatically.
 *
 * Returns { door:{x,y}, front:{x,y}, rect:{x,y,w,h} }.
 */
export function building(map, b, res) {
  const { x, y, w, h } = b;
  const wallKey = b.wall || 'WATTLE_WALL';
  const wall = tid(wallKey, 'STONE_WALL');
  const base = tid(b.base || 'DIRT', 'DIRT');
  const rk = ROOFS[b.roof] || ROOFS.thatch;
  const course = tid(b.course || BASE_COURSE[wallKey] || 'STONE_WALL', wallKey);

  // Solid mass first: ground under it, wall through it.
  grect(map, x, y, w, h, base);
  drect(map, x, y, w, h, wall);
  orect(map, x, y, w, h, 0);

  // How much of the elevation is roof. Never so much roof that the wall
  // disappears, and never so little that the ridge lands on the windows.
  const want = b.roofRows != null ? b.roofRows : Math.min(3, h - 3);
  const roofRows = Math.max(1, Math.min(want, h - 2));
  const fy = y + h - 1;                            // base course; the door row
  const wallTop = y + roofRows;                    // the row the eave shadows
  const gy = Math.max(wallTop, fy - 1);            // the ground-floor wall row

  // --- roof ---------------------------------------------------------------
  // Roof goes on `over` *and* on `deco` underneath it, so any hole in an
  // over-tile (CHIMNEY, ROOF_PEAK) falls through onto more roof, not plaster.
  for (let j = 0; j < roofRows; j++) {
    for (let i = 0; i < w; i++) {
      let name;
      if (j === 0) name = rk.ridge;
      else if (i === 0) name = rk.l;
      else if (i === w - 1) name = rk.r;
      else name = rk.m;
      const id = tid(name, 'THATCH_M');
      oset(map, x + i, y + j, id);
      dset(map, x + i, y + j, id);
    }
  }
  // Dormers break the eave line: a gabled window on the hard roofs, an eyebrow
  // in thatch. `peak` (one) and `dormer` (a list) both put them on the last
  // roof row, which is the eave; a one-row roof has no room for one.
  const pre = { thatch: 'THATCH', shingle: 'SHINGLE', tile: 'TILE', slate: 'SLATE' }[b.roof] || 'THATCH';
  const dormers = [].concat(b.peak != null ? [b.peak] : [], b.dormer || []);
  if (roofRows >= 2) for (const dx of dormers) if (dx > 0 && dx < w - 1) oset(map, x + dx, y + roofRows - 1, tid(`DORMER_${pre}${b.lit ? '_LIT' : ''}`, 'ROOF_PEAK'));
  for (const [px, py] of b.roofPatch || []) oset(map, x + px, y + py, tid(b.patchTile || 'SHINGLE_ROOF', 'THATCH_RIDGE'));
  if (b.chimney != null) oset(map, x + b.chimney, y, tid('CHIMNEY', 'THATCH_RIDGE'));
  if (b.chimney2 != null) oset(map, x + b.chimney2, y, tid('CHIMNEY', 'THATCH_RIDGE'));

  // Row `wallTop` is deliberately left clear of `over`: that is the signal
  // `_drawOverhangs` reads to ramp the eave's shadow down the first wall row.

  // --- the footing the wall stands on -------------------------------------
  // An OPEN shed has none: its bottom row is the back wall you see under the
  // eave, a post at each end, and whatever the trade keeps against it.
  if (b.open) {
    for (let i = 0; i < w; i++) dset(map, x + i, fy, tid('SHED_WALL', wallKey));
    dset(map, x, fy, tid('SHED_POST_L', 'PILLAR'));
    dset(map, x + w - 1, fy, tid('SHED_POST_R', 'PILLAR'));
    for (const [dx, key] of b.inside || []) if (dx > 0 && dx < w - 1) dset(map, x + dx, fy, tid(key, 'CRATE'));
  } else for (let i = 0; i < w; i++) dset(map, x + i, fy, course);
  // Between two storeys: a jetty beam on a timber house, a lit string course on
  // a masonry one (a log strip across a stone hall read as a repair).
  const masonry = wallKey === 'STONE_WALL' || wallKey === 'BRICK_WALL';
  if (b.band != null) for (let i = 0; i < w; i++) dset(map, x + i, y + b.band, tid(b.bandTile || (masonry ? 'WALL_TOP_LIT' : 'LOG_WALL'), wallKey));

  // --- the facade ---------------------------------------------------------
  const win = tid(b.lit ? 'WINDOW_LIT' : 'WINDOW', 'WINDOW');
  for (const dx of b.windows || []) if (dx > 0 && dx < w - 1) dset(map, x + dx, gy, win);
  // DORMERS. A building six rows deep is two storeys plus a roof, and a
  // two-storey facade with one row of windows reads as a shed somebody drew a
  // roof onto. If the call site did not say where the upper lights go, put them
  // over the lower ones. `upper: []` is the way to say "no upper storey".
  let upper = b.upper;
  if (upper == null && b.dormers !== false && h >= 6 && wallTop < gy) {
    upper = (b.windows || []).filter((dx) => dx > 0 && dx < w - 1);
    if (!upper.length) upper = w >= 5 ? [1, w - 2] : [];
  }
  if (wallTop < gy) for (const dx of upper || []) if (dx > 0 && dx < w - 1) dset(map, x + dx, wallTop, win);
  for (const dx of b.shutters || []) if (dx > 0 && dx < w - 1) dset(map, x + dx, gy, tid('SHUTTER', 'WINDOW'));
  // Buttresses between the bays of a masonry front, every wall row but the
  // footing, wherever the wall is still plain wall.
  for (const dx of b.buttress || []) {
    if (dx <= 0 || dx >= w - 1) continue;
    for (let yy = wallTop; yy < fy; yy++) if (map.deco[yy * map.w + x + dx] === wall || map.deco[yy * map.w + x + dx] === tid('WALL_TOP_LIT', wallKey)) dset(map, x + dx, yy, tid('BUTTRESS', wallKey));
  }
  // Lancets of stained glass, for a temple (stone walls: they paint STONE_WALL).
  const glass = tid(b.lit ? 'WINDOW_STAINED_LIT' : 'WINDOW_STAINED', 'WINDOW');
  for (const dx of b.stained || []) if (dx > 0 && dx < w - 1) { dset(map, x + dx, gy, glass); if (wallTop < gy && (b.upper == null)) dset(map, x + dx, wallTop, glass); }
  // Tall lancets: one window through two storeys, head above and foot below.
  const tallT = tid(b.lit ? 'WINDOW_STAINED_LIT_T' : 'WINDOW_STAINED_T', 'WINDOW_STAINED');
  const tallB = tid(b.lit ? 'WINDOW_STAINED_LIT_B' : 'WINDOW_STAINED_B', 'WINDOW_STAINED');
  if (gy - 1 >= wallTop) for (const dx of b.tall || []) if (dx > 0 && dx < w - 1) { dset(map, x + dx, gy - 1, tallT); dset(map, x + dx, gy, tallB); }
  // A rose window, over the door on the row above the door head.
  if (b.rose != null && gy - 1 >= wallTop) dset(map, x + b.rose, gy - 1, tid(b.lit ? 'WINDOW_ROSE_LIT' : 'WINDOW_ROSE', 'WINDOW_STAINED'));
  // A barn's wagon doors in the base course, for a shed you back a cart up to,
  // and a stable's half-doors, one to a stall.
  for (const dx of b.loading || []) if (dx >= 0 && dx < w) dset(map, x + dx, fy, tid('BARN_DOOR', 'SHUTTER'));
  for (const dx of b.stalls || []) if (dx >= 0 && dx < w) dset(map, x + dx, fy, tid('STABLE_DOOR', 'SHUTTER'));
  // A shop sign HANGS on the wall. SIGN is a signpost whose post runs to the
  // ground, so putting it on the facade drove a post through the plaster.
  // `trade` paints the board with the trade's device (render/tiles_arch.js
  // TRADES: INN SMITH GOODS ARMS COIN POTION BOOK BREAD STABLE).
  const signKey = b.trade ? `SHOP_SIGN_${String(b.trade).toUpperCase()}` : 'SHOP_SIGN';
  if (b.sign != null) oset(map, x + b.sign, gy, tid(signKey, 'SHOP_SIGN'));

  let door = null, front = null;
  if (b.door != null) {
    const dx = x + b.door;
    gset(map, dx, fy, tid('WOOD_FLOOR_H', 'DIRT'));
    dset(map, dx, fy, tid((b.ironDoor || b.iron) ? 'IRON_DOOR' : 'DOOR_CLOSED', 'DOOR_OPEN'));
    door = { x: dx, y: fy };
    front = { x: dx, y: fy + 1 };
  }

  // --- the ground the building sits on ------------------------------------
  if (door) {
    // A flagged step at the threshold, trodden earth either side of it, and a
    // beaten approach running out to whatever road is nearest.
    const sy = fy + 1;
    const worn = tid(b.step || 'DIRT_PATH', 'DIRT');
    for (let i = -1; i <= 1; i++) gset(map, door.x + i, sy, worn);
    gset(map, door.x, sy, tid('FLAGSTONE', 'DIRT_PATH'));
    const run = b.approach != null ? b.approach : 2;
    for (let k = 1; k <= run; k++) {
      const py = sy + k;
      if (!map.inBounds(door.x, py) || map.deco[py * map.w + door.x]) break;
      gset(map, door.x, py, worn);
    }
  }

  // --- wings: the L and the T ---------------------------------------------
  // Painted after the main block so the principal gable reads as the front of
  // the house and the wing as something added to it. A wing never carries a
  // door, and is clipped off the door tile and the tile in front of it.
  for (const g of b.wings || []) {
    const gx = x + (g.dx | 0), gy0 = y + (g.dy | 0);
    const gw = Math.max(1, g.w | 0), gh = Math.max(2, g.h | 0);
    const gk = ROOFS[g.roof || b.roof] || rk;
    const gwallKey = g.wall || wallKey;
    const gwall = tid(gwallKey, 'STONE_WALL');
    const gcourse = tid(g.course || BASE_COURSE[gwallKey] || 'STONE_WALL', gwallKey);
    const gRows = Math.max(1, Math.min(g.roofRows != null ? g.roofRows : Math.min(2, gh - 1), gh - 1));
    const gfy = gy0 + gh - 1;
    const blocked = (px, py) => door && ((px === door.x && py === door.y) || (px === door.x && py === door.y + 1));
    for (let j = 0; j < gh; j++) {
      for (let i = 0; i < gw; i++) {
        const px = gx + i, py = gy0 + j;
        if (!map.inBounds(px, py) || blocked(px, py)) continue;
        gset(map, px, py, base);
        const roofRow = j < gRows;
        let id = gwall;
        if (roofRow) {
          id = tid(j === 0 ? gk.ridge : (i === 0 ? gk.l : (i === gw - 1 ? gk.r : gk.m)), 'THATCH_M');
          oset(map, px, py, id);
        } else {
          oset(map, px, py, 0);
        }
        if (py === gfy && !roofRow) id = gcourse;
        dset(map, px, py, id);
      }
    }
    const gwy = Math.max(gy0 + gRows, gfy - 1);
    for (const dx of g.windows || []) {
      const px = gx + dx;
      if (dx > 0 && dx < gw - 1 && !blocked(px, gwy)) dset(map, px, gwy, win);
    }
    if (g.chimney != null) oset(map, gx + g.chimney, gy0, tid('CHIMNEY', 'THATCH_RIDGE'));
    if (res) for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) res.add(KEY(gx + i, gy0 + j));
  }

  // --- porch and lantern ---------------------------------------------------
  // AWNING and LANTERN are both flags-0, so neither can pinch the street. The
  // awning goes on the `over` plane (you walk under it); the lantern goes on
  // `deco` on the ground row, never on the wall row, where a non-solid tile
  // would punch a hole straight through the front of the house.
  if (door && b.porch) {
    const pw = b.porch === true ? 3 : Math.max(1, b.porch | 0);
    const half = pw >> 1;
    // The awning belongs ON THE WALL, above the door — it hangs off the front
    // of the shop. It used to be laid on `fy + 1`, which is the STREET, so a
    // row of them read as striped mats lying in the road rather than as eaves
    // over a doorway. `gy` is the ground-floor wall row directly above the
    // door; drawn on `over`, the canvas projects out over the threshold.
    const ay = gy === fy ? fy : gy;
    for (let i = -half; i < pw - half; i++) {
      const px = door.x + i;
      if (!map.inBounds(px, ay)) continue;
      // Never blind a window or cover the sign that says whose shop this is.
      const here = map.deco[ay * map.w + px];
      if (here === win || here === tid('SIGN', 'WINDOW') || here === tid('SHOP_SIGN', 'SIGN')) continue;
      oset(map, px, ay, tid('AWNING', 'THATCH_M'));
    }
  }
  if (door && b.lantern) {
    const side = b.lantern === 'right' ? 1 : -1;
    const lx = door.x + side, ly = fy + 1;
    if (map.inBounds(lx, ly) && !map.deco[ly * map.w + lx] && !(res && res.has(KEY(lx, ly)))) {
      dset(map, lx, ly, tid('LANTERN', 'TORCH'));
    }
  }

  if (res) for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) res.add(KEY(i, j));
  if (b.interior) FOOTPRINTS[b.interior] = { w, h, x, y, door: door ? { ...door } : null, map: map.id || null };
  return { door, front, rect: { x, y, w, h } };
}

/**
 * A house whose ground floor is the map — the Yawning Portal trick. Instead of
 * a solid mass with a door that warps you elsewhere, `openHouse` cuts a real
 * room into the street: floors you walk on, a wall ring round them, a roof over
 * the back rows only, and a door in the bottom wall you step straight through.
 *
 * Use it where the inside is worth showing and small enough to draw in place.
 * The door contract is the same as `building()`: exactly one, on the bottom row.
 *
 * b: { x, y, w, h, wall, roof, roofRows=2, floor, door:dx, windows:[dx], sign:dx,
 *      chimney:dx, lit, base, course, interior }
 * Returns { door, front, inner:{x,y,w,h} }.
 */
export function openHouse(map, b, res) {
  const { x, y, w, h } = b;
  const wallKey = b.wall || 'STONE_WALL';
  const wall = tid(wallKey, 'STONE_WALL');
  const course = tid(b.course || BASE_COURSE[wallKey] || 'STONE_WALL', wallKey);
  const rk = ROOFS[b.roof] || ROOFS.tile;
  const fl = tid(b.floor || 'WOOD_FLOOR', 'STONE_FLOOR');
  const roofRows = Math.max(1, Math.min(b.roofRows != null ? b.roofRows : 2, h - 3));
  const fy = y + h - 1;

  floorRect(map, x, y, w, h, fl);
  dframe(map, x, y, w, h, wall);
  for (let i = 0; i < w; i++) dset(map, x + i, fy, course);
  // The roof covers the rows you are looking down ON — the back of the house —
  // and stops short of the room you are looking INTO.
  for (let j = 0; j < roofRows; j++) {
    for (let i = 0; i < w; i++) {
      const id = tid(j === 0 ? rk.ridge : (i === 0 ? rk.l : (i === w - 1 ? rk.r : rk.m)), 'THATCH_M');
      oset(map, x + i, y + j, id);
      dset(map, x + i, y + j, id);
    }
  }
  if (b.chimney != null) oset(map, x + b.chimney, y, tid('CHIMNEY', 'THATCH_RIDGE'));
  const win = tid(b.lit ? 'WINDOW_LIT' : 'WINDOW', 'WINDOW');
  for (const dx of b.windows || []) if (dx > 0 && dx < w - 1) dset(map, x + dx, fy, win);
  // Hung on the front, not posted in it — see building().
  if (b.sign != null) oset(map, x + b.sign, fy, tid('SHOP_SIGN', 'SIGN'));

  let door = null, front = null;
  if (b.door != null) {
    const dx = x + b.door;
    gset(map, dx, fy, tid('WOOD_FLOOR_H', 'STONE_FLOOR'));
    dset(map, dx, fy, tid('DOOR_OPEN', 'DOOR_CLOSED'));
    door = { x: dx, y: fy };
    front = { x: dx, y: fy + 1 };
  }
  const inner = { x: x + 1, y: y + roofRows, w: w - 2, h: h - roofRows - 1 };
  if (res) {
    for (let i = 0; i < w; i++) { res.add(KEY(x + i, y)); res.add(KEY(x + i, fy)); }
    for (let j = y; j <= fy; j++) { res.add(KEY(x, j)); res.add(KEY(x + w - 1, j)); }
  }
  if (b.interior) FOOTPRINTS[b.interior] = { w, h, x, y, door: door ? { ...door } : null, map: map.id || null, open: true };
  return { door, front, inner };
}

/** A house nobody can enter — shuttered, boarded, still part of the skyline. */
export function shell(map, b, res) {
  const out = building(map, { ...b, door: null, windows: [], shutters: b.windows || [] }, res);
  if (b.door != null) dset(map, b.x + b.door, b.y + b.h - 1, tid((b.ironDoor || b.iron) ? 'IRON_DOOR' : 'SHUTTER', 'WINDOW'));
  return out;
}

/**
 * A tower under a pyramid roof: a bell tower, a steeple beside a nave, a
 * turret on a manor, a watchtower on a wall. 2 or 3 wide. The roof takes the
 * top two rows of the footprint and its tip rises into the row ABOVE the
 * footprint on the `over` plane (not solid, so the street behind stays
 * walkable). Everything below the roof is wall: windows on the rows between,
 * a footing, and an optional door on the bottom row, as in building().
 *
 * b: { x, y, w:2|3, h, wall, roof:'slate'|'tile', windows:[dy], door:dx, lit,
 *      base, iron, stained }   windows are ROWS (dy) with one light centred
 * Returns { door, front, rect }.
 */
export function tower(map, b, res) {
  const { x, y, h } = b;
  const w = b.w === 2 ? 2 : 3;
  const wallKey = b.wall || 'STONE_WALL';
  const out = building(map, {
    x, y, w, h, wall: wallKey, base: b.base || 'GRAVEL', roofRows: 2, door: b.door,
    windows: [], upper: [], approach: b.approach != null ? b.approach : 1, step: b.step, iron: b.iron,
    course: b.course,
  }, res);
  pyramidRoof(map, x, y, w, b.roof);
  const cx = x + (w >> 1);
  const glass = b.stained ? (b.lit ? 'WINDOW_STAINED_LIT' : 'WINDOW_STAINED') : (b.lit ? 'WINDOW_LIT' : 'WINDOW');
  for (const dy of b.windows || [2]) if (dy >= 2 && dy < h - 1) dset(map, w === 2 ? x + 1 : cx, y + dy, tid(glass, 'WINDOW'));
  return out;
}

/**
 * A temple or chapel: a nave under its roof with lancets of stained glass,
 * and a tower with a spire at one end — the one silhouette in a town that
 * says "god" from across the square. The nave carries the door (building()'s
 * contract: one door, on the bottom row).
 *
 * b: { x, y, w, h, wall, roof, spire:'slate'|'tile', tower:'W'|'E', tw:2|3,
 *      th (tower height, default h+1), door:dx (into the nave), lit, base,
 *      stained:[dx] (nave-relative), buttress:[dx], chimney, interior, porch, lantern }
 * Returns building()'s result for the nave.
 */
export function temple(map, b, res) {
  const tw = b.tw === 3 ? 3 : 2;
  const east = b.tower === 'E';
  const nx = east ? b.x : b.x + tw, nw = b.w - tw;
  const th = b.th || b.h + 1;
  const out = building(map, {
    x: nx, y: b.y, w: nw, h: b.h, wall: b.wall || 'STONE_WALL', roof: b.roof || 'slate', base: b.base || 'FLAGSTONE',
    roofRows: b.roofRows || 2, door: b.door, windows: [], upper: b.upper, stained: b.stained || [1, nw - 2],
    lit: b.lit, chimney: b.chimney, approach: b.approach != null ? b.approach : 1, step: b.step || 'FLAGSTONE',
    interior: b.interior, porch: b.porch, lantern: b.lantern, band: b.band, buttress: b.buttress, tall: b.tall,
    rose: b.rose,
  }, res);
  tower(map, {
    x: east ? b.x + nw : b.x, y: b.y + b.h - th, w: tw, h: th, wall: b.wall || 'STONE_WALL',
    roof: b.spire === 'tile' ? 'tile' : 'slate', windows: [2, 4].filter((d) => d < th - 1), base: b.base || 'FLAGSTONE',
    stained: true, lit: b.lit,
  }, res);
  return out;
}

/**
 * A pyramid roof — SPIRE (3 wide) or TURRET (2 wide), slate or 'tile' — laid
 * over the two rows at (x, y), with its tip on the `over` plane of the row
 * above (not solid). tower() uses it; so can a hall that wants a bell turret
 * rising out of one end of its own roof.
 */
export function pyramidRoof(map, x, y, w, roof) {
  const pre = (w === 2 ? 'TURRET' : 'SPIRE') + (roof === 'tile' ? '_TILE' : '');
  for (let r = 1; r <= 2; r++) for (let q = 0; q < w; q++) {
    const id = tid(`${pre}_${r}${q}`, 'SLATE_M');
    oset(map, x + q, y + r - 1, id); dset(map, x + q, y + r - 1, id);
  }
  if (y > 0) for (let q = 0; q < w; q++) oset(map, x + q, y - 1, tid(`${pre}_0${q}`, 0));
}

/**
 * A tower windmill: a 3x5 body under a thatched cap, its door on the
 * bottom row, and four sails turning on the over plane round a hub on the
 * cap's face — a 5x5 wheel, so it sweeps the ground around the mill (you walk
 * under the sails) and never touches another over tile: where one is already
 * there (a tree's crown) that part of the wheel is left out.
 * b: { x, y, wall, roof, door:dx, base } -> building()'s result
 */
export function windmill(map, b, res) {
  const out = building(map, {
    x: b.x, y: b.y, w: 3, h: 5, wall: b.wall || 'PLASTER_WALL', roof: b.roof || 'thatch', roofRows: 2,
    door: b.door != null ? b.door : 1, windows: [], upper: [1], base: b.base || 'DIRT', approach: 2,
  }, res);
  const hx = b.x + 1, hy = b.y + 1;
  for (let by = 0; by < 5; by++) for (let bx = 0; bx < 5; bx++) {
    const px = hx - 2 + bx, py = hy - 2 + by;
    if (!map.inBounds(px, py)) continue;
    const inside = px >= b.x && px < b.x + 3 && py >= b.y && py < b.y + 5;
    if (!inside && map.over[py * map.w + px]) continue;
    oset(map, px, py, tid(`MILL_SAIL_${by}${bx}`, 0));
  }
  return out;
}

/**
 * The town notice board: the tile world/sites.js stages the director's board
 * on (the first NOTICE_BOARD on a town map). Stand it where the square is:
 * the tile south of it must be open ground, because that is where a reader
 * stands to face it.
 */
export function noticeBoard(map, x, y, res) {
  prop(map, x, y, tid('NOTICE_BOARD', 'SIGN'), res);
  if (res) res.add(KEY(x, y + 1));
  return { x, y };
}

/**
 * An internal partition wall around a sub-rect, with one doorway in it.
 *
 * The wall is drawn on the SHARED edge — a kitchen behind a bar is one course of
 * plaster, not two — so a partition rect is given in the same coordinates as the
 * room it divides and its own frame becomes the dividing wall. Only the edges
 * that are NOT the outer room's own wall are drawn; the rest is already there.
 *
 * p: { x, y, w, h, door:{x,y}|'n'|'s'|'e'|'w', wall, floor, name }
 * `outer` is the room rect the partition sits inside, so the shared edges can be
 * skipped. Returns { rect, door } — the door tile is a real DOOR_CLOSED, so
 * `finishInterior`'s `openDoorway` is not needed; `recomputeFlags` leaves DOOR
 * tiles solid and this function opens its own.
 */
export function partition(map, outer, p) {
  const { x, y, w, h } = p;
  const wallKey = p.wall || 'WATTLE_WALL';
  const wall = tid(wallKey, 'STONE_WALL');
  const ox = outer.x, oy = outer.y, ow = outer.w, oh = outer.h;
  if (p.floor) floorRect(map, x + 1, y + 1, w - 2, h - 2, tid(p.floor, 'WOOD_FLOOR'));
  // Draw only the edges that are interior to `outer`.
  for (let i = x; i < x + w; i++) {
    if (y > oy) dset(map, i, y, wall);
    if (y + h - 1 < oy + oh - 1) dset(map, i, y + h - 1, wall);
  }
  for (let j = y; j < y + h; j++) {
    if (x > ox) dset(map, x, j, wall);
    if (x + w - 1 < ox + ow - 1) dset(map, x + w - 1, j, wall);
  }
  // The doorway. A side letter picks the middle of that edge; an {x,y} is used
  // as given. Either way the tile becomes a door and is opened, so a partition
  // can never seal a room off from the front door.
  let d = p.door;
  if (typeof d === 'string' || d == null) {
    const side = d || 's';
    if (side === 'n') d = { x: x + (w >> 1), y };
    else if (side === 's') d = { x: x + (w >> 1), y: y + h - 1 };
    else if (side === 'w') d = { x, y: y + (h >> 1) };
    else d = { x: x + w - 1, y: y + (h >> 1) };
  }
  dset(map, d.x, d.y, tid(p.iron ? 'IRON_DOOR' : 'DOOR_CLOSED', 'DOOR_OPEN'));
  gset(map, d.x, d.y, tid(p.floor && !/^WOOD/.test(p.floor) ? 'FLAGSTONE' : 'WOOD_FLOOR_H', 'STONE_FLOOR'));
  map.clearFlag(d.x, d.y, TF.SOLID);
  map.setFlag(d.x, d.y, TF.DOOR);
  return { rect: { x, y, w, h }, door: d, inner: { x: x + 1, y: y + 1, w: w - 2, h: h - 2 }, name: p.name || null };
}

/**
 * A four-walled interior room: floor, wall ring, and an exit door punched in the
 * bottom wall. Returns { exit, spawn, rooms }.
 *
 * You are looking *at* the north wall, so it keeps its face; you are looking
 * *down on* the south wall, so it shows the same footing course the outside of
 * the building stands on, and the door is punched through that footing exactly
 * as it is outside. The corners get posts.
 *
 * `rooms: [{x,y,w,h,door,wall,floor,name}]` partitions the box: a kitchen
 * behind the bar, a stock room behind the counter, a cell off the hall. Each is
 * a `partition()` call against this room's rect, and each keeps its own door, so
 * everything inside stays reachable from the front step.
 */
export function room(map, o) {
  const w = o.w != null ? o.w : map.w;
  const h = o.h != null ? o.h : map.h;
  const x = o.x || 0, y = o.y || 0;
  const fl = tid(o.floor || 'WOOD_FLOOR', 'STONE_FLOOR');
  const wallKey = o.wall || 'WATTLE_WALL';
  const wall = tid(wallKey, 'STONE_WALL');
  const course = tid(o.course || BASE_COURSE[wallKey] || 'STONE_WALL', wallKey);
  const stony = wallKey === 'STONE_WALL' || wallKey === 'BRICK_WALL';
  const post = tid(o.post || (stony ? 'PILLAR' : 'LOG_WALL'), wallKey);

  floorRect(map, x, y, w, h, fl);
  dframe(map, x, y, w, h, wall);
  for (let i = x; i < x + w; i++) dset(map, i, y + h - 1, course);
  for (const [px, py] of [[x, y], [x + w - 1, y], [x, y + h - 1], [x + w - 1, y + h - 1]]) dset(map, px, py, post);

  const ex = o.exit != null ? o.exit : (x + (w >> 1));
  const ey = y + h - 1;
  gset(map, ex, ey, tid('WOOD_FLOOR_H', 'DIRT'));
  dset(map, ex, ey, tid('DOOR_CLOSED', 'DOOR_OPEN'));
  // The threshold: three tiles inside the door, of whatever the floor is not —
  // flags in a boarded room, boards in a flagged one.
  const step = tid(o.step || (/^WOOD/.test(o.floor || 'WOOD_FLOOR') ? 'FLAGSTONE' : 'WOOD_FLOOR_H'), 'FLAGSTONE');
  for (let i = -1; i <= 1; i++) gset(map, ex + i, ey - 1, step);

  // Partitions, if any. A partition may not be laid across the three threshold
  // tiles inside the front door — that is the one corridor every interior needs.
  const rooms = [];
  for (const p of o.rooms || []) {
    if (p.y + p.h - 1 >= ey - 1 && p.x <= ex + 1 && p.x + p.w - 1 >= ex - 1 && p.y <= ey - 1) continue;
    rooms.push(partition(map, { x, y, w, h }, { wall: wallKey, ...p }));
  }
  return { exit: { x: ex, y: ey }, spawn: { x: ex, y: ey - 1 }, rect: { x, y, w, h }, rooms };
}

/** A paddock, orchard or field boundary with one gate. */
export function fenceRect(map, x, y, w, h, gate, res) {
  const fh = tid('FENCE_H', 'HEDGE'), fv = tid('FENCE_V', 'HEDGE'), fc = tid('FENCE_CORNER', 'HEDGE');
  for (let i = x; i < x + w; i++) { prop(map, i, y, fh, res); prop(map, i, y + h - 1, fh, res); }
  for (let j = y; j < y + h; j++) { prop(map, x, j, fv, res); prop(map, x + w - 1, j, fv, res); }
  prop(map, x, y, fc, res); prop(map, x + w - 1, y, fc, res);
  prop(map, x, y + h - 1, fc, res); prop(map, x + w - 1, y + h - 1, fc, res);
  if (gate) dset(map, gate.x, gate.y, tid('GATE', 'FENCE_H'));
  return map;
}

/** A two-tile-wide oak, planted on the deco/over planes so you walk behind it. */
export function bigOak(map, x, y) {
  dset(map, x, y + 1, tid('OAK_BL', 'TREE_OAK'));
  dset(map, x + 1, y + 1, tid('OAK_BR', 'TREE_OAK'));
  oset(map, x, y, tid('OAK_TL', 'TREE_OAK'));
  oset(map, x + 1, y, tid('OAK_TR', 'TREE_OAK'));
}
export function bigPine(map, x, y) {
  dset(map, x, y + 1, tid('PINE_BL', 'TREE_PINE'));
  dset(map, x + 1, y + 1, tid('PINE_BR', 'TREE_PINE'));
  oset(map, x, y, tid('PINE_TL', 'TREE_PINE'));
  oset(map, x + 1, y, tid('PINE_TR', 'TREE_PINE'));
}

// ---------------------------------------------------------------------------
// 2. INTERIORS
// ---------------------------------------------------------------------------

/**
 * A taproom's seating. Returns the `tableAt(x, y, len)` a common room uses:
 * `len` tiles of table, a chair at each end, and benches down the long sides —
 * so a room can mix small rounds with the long trestles a caravan that arrived
 * together actually sits at.
 */
export function seating(map, r, res) {
  return (tx, ty, len = 1) => {
    for (let i = 0; i < len; i++) prop(map, tx + i, ty, tid('TABLE', 'BENCH'), res);
    prop(map, tx - 1, ty, tid('CHAIR', 'BENCH'), res);
    prop(map, tx + len, ty, tid('CHAIR', 'BENCH'), res);
    for (let i = 0; i < len; i++) {
      if (r.chance(len > 1 ? 0.85 : 0.65)) prop(map, tx + i, ty + 1, tid(len > 1 ? 'BENCH' : 'CHAIR', 'BENCH'), res);
      if (len > 1 && r.chance(0.7)) prop(map, tx + i, ty - 1, tid('BENCH', 'CHAIR'), res);
    }
  };
}

/** A signpost you can read, wherever a SIGN tile already stands. */
export function addSign(map, x, y, text, title) {
  map.addTrigger({ id: `sign-${x}-${y}`, kind: 'sign', x, y, data: { text, title: title || null } });
}
/** The sign and the post in one call. */
export function signpost(map, x, y, text, res, title) {
  prop(map, x, y, tid('SIGN', 'ROCK'), res);
  addSign(map, x, y, text, title);
}

/**
 * A fresh indoor TileMap. `region` defaults to Phandalin's; a pack binds its own
 * default with `(o) => interiorMap({ region: 'baldurs-gate', ...o })`.
 */
export function interiorMap(o) {
  return new TileMap({
    w: o.w, h: o.h, id: o.id, name: o.name, biome: o.biome || 'city', indoor: true,
    music: o.music || 'town', safe: o.safe !== false, encounterRate: 0,
    ambient: o.ambient || { color: '#2a1e14', alpha: 0.14 },
    // The same region string the town outside uses, so rules/crime.js books a
    // killing in a shop and on the street it opens onto to the same ledger.
    region: o.region || 'phandalin-hills',
  });
}

const clampi = (v, lo, hi) => (v < lo ? lo : (v > hi ? hi : v));

/**
 * The room a footprint is worth. Every interior in the game is bigger than the
 * house it is in — that is the convention, not a bug; a 6x5 cottage drawn at
 * true scale is a 4x3 room and there is nowhere to put a bed. The rule is that
 * it scales WITH the exterior, so the Stonehill Inn is not the same size inside
 * as the shed behind it.
 *
 *   w = fp.w * 2 + 4   h = fp.h * 2 + 2   clamped to 12x10 .. 26x18
 *
 * Great halls (the High Hall, the Seatower, the Undercellar) are deliberately
 * bigger than the clamp and pass their own w/h; they are not houses.
 */
export function interiorSize(fp, o = {}) {
  return {
    w: clampi(((fp && fp.w) | 0) * 2 + 4, o.minW || 12, o.maxW || 26),
    h: clampi(((fp && fp.h) | 0) * 2 + 2, o.minH || 10, o.maxH || 18),
  };
}

/**
 * `interiorMap` sized from the house outside.
 *
 * DETERMINISM. `FOOTPRINTS` is only populated once the exterior map has been
 * built, and `loadMap('stonehill-inn')` on a cold cache never touches Phandalin
 * — so sizing off `FOOTPRINTS` alone would make a room a different shape
 * depending on which door you came through. Every call therefore DECLARES the
 * footprint it belongs to; `FOOTPRINTS` is consulted only when the declaration
 * is missing, and a mismatch is reported rather than silently obeyed.
 *
 * o: { footprint:{w,h}, ... } plus everything `interiorMap` takes.
 */
export function interiorFor(id, o = {}) {
  const fp = o.footprint || FOOTPRINTS[id];
  const built = FOOTPRINTS[id];
  if (o.footprint && built && (built.w !== o.footprint.w || built.h !== o.footprint.h)) {
    // Loud in dev, harmless in play: the declaration is what gets used.
    if (typeof console !== 'undefined' && console.warn) {
      console.warn(`[mapkit] ${id}: declared footprint ${o.footprint.w}x${o.footprint.h} but building() drew ${built.w}x${built.h}`);
    }
  }
  const size = fp ? interiorSize(fp, o) : { w: o.w || 16, h: o.h || 12 };
  return interiorMap({ ...o, id, w: size.w, h: size.h });
}

/**
 * Flags, border, the exit, the spawn, and the NPC sweep.
 *   o: 'STONE_WALL' | { seal, threshold }
 * `threshold` also clears the three tiles inside the door, so a bench laid
 * across it can never leave a room enterable and not leaveable.
 *
 * Every DOOR tile in the room is re-opened after `recomputeFlags`, not just the
 * exit: `partition()` hangs doors between the taproom and the kitchen, and
 * `recomputeFlags` stamps them solid again like any other door.
 */
export function finishInterior(map, exit, res, o) {
  if (typeof o === 'string') o = { seal: o };
  o = o || {};
  map.recomputeFlags({ keep: 0 });
  sealBorder(map, tid(o.seal || 'WATTLE_WALL', 'STONE_WALL'));
  const doors = new Set([tid('DOOR_CLOSED'), tid('DOOR_OPEN')].filter((v) => v != null));
  if (doors.size) {
    for (let j = 1; j < map.h - 1; j++) {
      for (let i = 1; i < map.w - 1; i++) if (doors.has(map.deco[j * map.w + i])) openDoorway(map, i, j);
    }
  }
  openDoorway(map, exit.x, exit.y);
  if (o.threshold) for (let i = -1; i <= 1; i++) clearStanding(map, exit.x + i, exit.y - 1);
  map.spawn = { x: exit.x, y: exit.y - 1 };
  map.entry = { ...map.spawn };
  if (res) sweepStanding(map, res);
  return map;
}

/**
 * The floor above a taproom. Every inn in the game has a STAIRS_UP tile with a
 * `rest` trigger sitting on it and nothing at the top of it — you rest on the
 * staircase. This builds the landing you were resting on: a corridor, three to
 * five guest rooms off it, a bed and a chest of drawers in each, and a stair
 * back down.
 *
 * o: { id, name, rooms=4, wall, floor, music, region, ambient, down:{x,y} }
 * The map is `${innId}-upstairs`; the down-stair is at the landing's south end
 * and is warped to the taproom's own stair by the caller's LINKS row.
 *
 * Returns the TileMap, with `map.stairs = {x,y}` naming the down-stair.
 */
export function innUpstairs(o) {
  const n = clampi(o.rooms || 4, 3, 5);
  const cellW = 5, cellH = 5;                       // each guest room, walls in
  const w = clampi(n * cellW + 2, 12, 30);
  const h = 13;
  const map = interiorMap({
    w, h, id: o.id, name: o.name, music: o.music || 'inn',
    region: o.region, ambient: o.ambient || { color: '#241a10', alpha: 0.2 },
  });
  const wallKey = o.wall || 'WATTLE_WALL';
  const rm = room(map, { w, h, floor: o.floor || 'WOOD_FLOOR', wall: wallKey, exit: w >> 1 });
  // The landing runs east-west across the middle; the rooms hang off it north
  // and the stairhead sits in the middle of its south side.
  const landY = 7;
  floorRect(map, 1, landY, w - 2, 2, tid('WOOD_FLOOR_H', 'WOOD_FLOOR'));
  const wall = tid(wallKey, 'STONE_WALL');
  for (let i = 1; i < w - 1; i++) dset(map, i, landY - 1, wall);
  // Each guest room is a cell off the landing. Its furniture is pushed into the
  // TOP-LEFT corner and nowhere else, because anything tucked into a corner
  // under the outer wall can strand the tile beside it; a bed head-to-the-wall
  // with a nightstand next to it leaves the rest of the cell one open blob.
  const guests = [];
  for (let k = 0; k < n; k++) {
    const gx = 1 + k * cellW;
    const gw = Math.min(cellW + 1, w - 1 - gx);
    if (gw < 3) break;
    for (let j = 1; j < landY; j++) dset(map, gx, j, wall);              // party wall
    const dx = gx + (gw >> 1);
    dset(map, dx, landY - 1, tid('DOOR_CLOSED', 'DOOR_OPEN'));
    gset(map, dx, landY - 1, tid('WOOD_FLOOR_H', 'WOOD_FLOOR'));
    const bx = gx + 1;
    floorRect(map, bx, 3, gw - 1, landY - 4, tid(k & 1 ? 'CARPET_RED' : 'CARPET_BLUE', 'WOOD_FLOOR'));
    dset(map, bx, 1, tid('BED', 'BENCH'));                                // head to the wall
    dset(map, bx, 2, tid('BED', 'BENCH'));
    dset(map, bx + 1, 1, tid('CRATE', 'BARREL'));                         // the nightstand
    if ((k & 1) === 0) dset(map, bx, 4, tid('CANDLE', 'TORCH'));
    dset(map, dx, 0, tid('WINDOW', 'SHUTTER'));                           // over the street
    guests.push({ x: gx, y: 1, w: gw, h: landY - 1, door: { x: dx, y: landY - 1 } });
  }
  // the stairhead
  const sx = w >> 1, sy = h - 3;
  floor(map, sx, sy, tid('STAIRS_DOWN', 'WOOD_FLOOR'));
  floor(map, sx, sy + 1, tid('WOOD_FLOOR_H', 'WOOD_FLOOR'));
  for (let i = sx - 2; i <= sx + 2; i++) gset(map, i, sy, tid('WOOD_FLOOR_H', 'WOOD_FLOOR'));
  dset(map, sx - 3, sy, tid('BENCH', 'CRATE'));
  dset(map, sx + 3, sy, tid('BARREL', 'CRATE'));
  oset(map, sx, landY, tid('CHANDELIER', 'CANDLE'));

  // The exit door `room()` cut in the south wall is not a way out of an upper
  // floor — the stairs are. Board it over and let the stair carry the warp.
  dset(map, rm.exit.x, rm.exit.y, wall);
  gset(map, rm.exit.x, rm.exit.y, tid('WOOD_FLOOR', 'STONE_FLOOR'));

  map.recomputeFlags({ keep: 0 });
  sealBorder(map, tid(wallKey, 'STONE_WALL'));
  const doors = new Set([tid('DOOR_CLOSED'), tid('DOOR_OPEN')].filter((v) => v != null));
  for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) if (doors.has(map.deco[j * map.w + i])) openDoorway(map, i, j);
  map.spawn = { x: sx, y: sy + 1 };
  map.entry = { ...map.spawn };
  map.stairs = { x: sx, y: sy };
  map.guestRooms = guests;
  map.indoor = true;
  return map;
}

/** Where `innUpstairs` puts its stairhead, for a given room count. */
export function innUpstairsSize(rooms) {
  const n = clampi(rooms || 4, 3, 5);
  const w = clampi(n * 5 + 2, 12, 30);
  return { w, h: 13, stairs: { x: w >> 1, y: 10 }, landing: { x: w >> 1, y: 11 } };
}

/**
 * One upper floor, as the raw map def and the LINKS row that reaches it.
 *
 * THE STAIR CONTRACT. Every inn in the game already had a STAIRS_UP tile with a
 * `rest` trigger sitting on it and nothing at the top — you rested standing on
 * the staircase. The stair tile becomes a WARP; the taproom's `rest` trigger
 * moves one tile off it (its 1x2 span already covered that tile), so both still
 * work and neither shadows the other in `triggerAt`.
 *
 * spec: { inn, name, stair:[x,y], land:[x,y], rooms, wall, floor, region, music, level }
 * Returns { id, def, link }: drop `def` into the pack's map table under the
 * returned id and `link` into its links array.
 */
export function innFloor(spec) {
  const id = `${spec.inn}-upstairs`;
  const rooms = spec.rooms || 4;
  const size = innUpstairsSize(rooms);
  const name = spec.name || 'Upstairs';
  return {
    id,
    def: {
      name, kind: 'interior', biome: 'city', w: size.w, h: size.h,
      indoor: true, safe: true, music: spec.music || 'inn', level: spec.level || 1,
      region: spec.region || null, parent: spec.inn,
      desc: spec.desc || 'Guest rooms over the taproom.',
      build: () => innUpstairs({
        id, name, rooms, wall: spec.wall, floor: spec.floor,
        music: spec.music, region: spec.region,
      }),
    },
    link: {
      a: spec.inn, aWarp: spec.stair, aLand: spec.land,
      b: id, bWarp: [size.stairs.x, size.stairs.y], bLand: [size.landing.x, size.landing.y],
      toB: 'up', toA: 'down', kind: 'stairs',
    },
  };
}

// ---------------------------------------------------------------------------
// 3. MASONRY — what a walled town needs that a village does not
// ---------------------------------------------------------------------------

/**
 * A curtain wall you can put a gate through.
 *
 * Read top-down, a wall is three bands exactly as a house is: the lit crown you
 * are looking down onto, the face you are looking at, and the plinth where it
 * meets the ground. The side runs are a single column, because a wall running
 * away from the camera shows you its face and nothing else.
 *
 * o: { key='STONE_WALL', crown, plinth, post, base, towers: [[x,y]],
 *      north, south, east, west, res }
 */
export function curtain(map, x, y, w, h, o = {}) {
  const key = o.key || 'STONE_WALL';
  // WALL_TOP_LIT and WALL_TOP_SHADE are cut stone; a timber stockade is simply
  // three courses of itself.
  const masonry = key === 'STONE_WALL' || key === 'BRICK_WALL' || key === 'RUINED_WALL';
  const face = tid(key, 'STONE_WALL');
  // A masonry curtain is crowned with its battlements: merlons against the
  // drop and the wall-walk in front of them (render/tiles_arch.js).
  const crown = tid(o.crown || (masonry ? 'BATTLEMENT' : key), key);
  const plinth = tid(o.plinth || (masonry ? 'WALL_TOP_SHADE' : key), key);
  const post = tid(o.post || 'PILLAR', 'STONE_WALL');
  const base = tid(o.base || 'GRAVEL', 'DIRT');
  const x1 = x + w - 1, y1 = y + h - 1;

  if (o.north !== false) {
    for (let i = x; i <= x1; i++) {
      gset(map, i, y, base); gset(map, i, y + 1, base); gset(map, i, y + 2, base);
      dset(map, i, y, crown); dset(map, i, y + 1, face); dset(map, i, y + 2, plinth);
    }
  }
  if (o.south !== false) {
    for (let i = x; i <= x1; i++) {
      gset(map, i, y1 - 1, base); gset(map, i, y1, base);
      dset(map, i, y1 - 1, face); dset(map, i, y1, plinth);
    }
  }
  if (o.west !== false) for (let j = y; j <= y1; j++) { gset(map, x, j, base); dset(map, x, j, face); }
  if (o.east !== false) for (let j = y; j <= y1; j++) { gset(map, x1, j, base); dset(map, x1, j, face); }
  for (const [px, py] of [[x, y], [x1, y], [x, y1], [x1, y1]]) dset(map, px, py, post);
  for (const [px, py] of o.towers || []) dset(map, px, py, post);
  // A wall is a deliberate enclosure, so it joins the protected set: nothing
  // later in the build gets to dig a second way in.
  if (o.res) {
    for (let i = x; i <= x1; i++) for (let j = y; j <= y + 2; j++) o.res.add(KEY(i, j));
    for (let i = x; i <= x1; i++) { o.res.add(KEY(i, y1 - 1)); o.res.add(KEY(i, y1)); }
    for (let j = y; j <= y1; j++) { o.res.add(KEY(x, j)); o.res.add(KEY(x1, j)); }
  }
  return map;
}

/**
 * A tower you look up at and never enter. Deliberately NOT `building()`: a
 * roof seen from directly overhead is one enormous unbroken slab, so from above
 * a tower is a shaft of masonry — a lit crown with merlons stepping out of it,
 * a shadowed plinth at the foot, and slit windows every storey up the face.
 */
export function keepTower(map, x, y, w, h, o = {}, res) {
  const key = o.key || 'STONE_WALL';
  const face = tid(key, 'STONE_WALL');
  const crown = tid(o.crown || 'WALL_TOP_LIT', key);
  const plinth = tid(o.plinth || 'WALL_TOP_SHADE', key);
  const post = tid('PILLAR', 'STONE_WALL');
  grect(map, x, y, w, h, tid(o.base || 'FLAGSTONE', 'GRAVEL'));
  drect(map, x, y, w, h, face);
  orect(map, x, y, w, h, 0);
  for (let i = 0; i < w; i++) { dset(map, x + i, y, crown); dset(map, x + i, y + h - 1, plinth); }
  if (o.merlons !== false) for (let i = 0; i < w; i += 2) dset(map, x + i, y, post);
  dset(map, x, y + h - 1, post); dset(map, x + w - 1, y + h - 1, post);
  const win = tid(o.lit === false ? 'WINDOW' : 'WINDOW_LIT', 'WINDOW');
  const storey = o.storey || 3;
  for (let j = y + 2; j < y + h - 1; j += storey) {
    for (let i = 1; i < w - 1; i += 2) dset(map, x + i, j, win);
  }
  if (o.peak != null) oset(map, x + o.peak, y, tid('ROOF_PEAK', 'WALL_TOP_LIT'));
  if (o.chimney != null) oset(map, x + o.chimney, y, tid('CHIMNEY', 'WALL_TOP_LIT'));
  if (res) for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) res.add(KEY(i, j));
  return map;
}

/**
 * Punch a gateway through a wall: a walkable column of road with a GATE tile in
 * it (GATE is DOOR|TRIGGER, never SOLID), jambs of PILLAR either side and a
 * torch on each jamb.
 */
export function gateway(map, cx, y0, y1, roadId, o = {}) {
  const halfW = o.half != null ? o.half : 1;
  for (let y = y0; y <= y1; y++) {
    for (let x = cx - halfW; x <= cx + halfW; x++) floor(map, x, y, roadId);
  }
  // Dressed piers either side of the passage, not a stack of columns.
  for (let y = y0; y <= y1; y++) {
    dset(map, cx - halfW - 1, y, tid('GATE_PIER_L', 'PILLAR'));
    dset(map, cx + halfW + 1, y, tid('GATE_PIER_R', 'PILLAR'));
  }
  if (o.gate !== false) {
    // The gate row: a flagged passage under the arch, the arch itself and its
    // raised portcullis on the over plane so you pass beneath them.
    const gy = o.gateRow != null ? o.gateRow : y0;
    for (let x = cx - halfW; x <= cx + halfW; x++) {
      dset(map, x, gy, tid('GATEWAY', 'GATE'));
      oset(map, x, gy, tid(`GATE_ARCH_${x === cx - halfW ? 'L' : x === cx + halfW ? 'R' : 'M'}`, 0));
    }
  }
  if (o.torch !== false) {
    dset(map, cx - halfW - 1, o.torchRow != null ? o.torchRow : y1, tid('TORCH', 'PILLAR'));
    dset(map, cx + halfW + 1, o.torchRow != null ? o.torchRow : y1, tid('TORCH', 'PILLAR'));
  }
  return map;
}

/**
 * The same gateway turned a quarter: a gap in an EAST or WEST wall, road running
 * x0..x1 through it, jambs above and below. For a town whose landward walls run
 * north–south.
 */
export function gatewayH(map, cy, x0, x1, roadId, o = {}) {
  const halfW = o.half != null ? o.half : 1;
  for (let x = x0; x <= x1; x++) {
    for (let y = cy - halfW; y <= cy + halfW; y++) floor(map, x, y, roadId);
  }
  for (let x = x0; x <= x1; x++) {
    dset(map, x, cy - halfW - 1, tid('PILLAR', 'STONE_WALL'));
    dset(map, x, cy + halfW + 1, tid('PILLAR', 'STONE_WALL'));
  }
  if (o.gate !== false) {
    const gx = o.gateCol != null ? o.gateCol : x0;
    for (let y = cy - halfW; y <= cy + halfW; y++) dset(map, gx, y, tid('GATE', 'DOOR_OPEN'));
  }
  if (o.torch !== false) {
    const tx = o.torchCol != null ? o.torchCol : x1;
    dset(map, tx, cy - halfW - 1, tid('TORCH', 'PILLAR'));
    dset(map, tx, cy + halfW + 1, tid('TORCH', 'PILLAR'));
  }
  return map;
}

export const T_RUIN = [['RUBBLE', 6], ['ROCK', 4], ['BONES', 1], ['STUMP', 1]];

/**
 * A roofless shell: apron, cracked floor, a broken wall ring, fallen stone
 * inside it. `gaps` are the places the ring has come down.
 */
export function ruinShell(map, r, x, y, w, h, o = {}, res) {
  const fl = tid(o.floor || 'STONE_FLOOR_CRACKED', 'STONE_FLOOR');
  floorRect(map, x, y, w, h, tid(o.apron || 'GRAVEL', 'DIRT'));
  floorRect(map, x + 1, y + 1, w - 2, h - 2, fl);
  dframe(map, x, y, w, h, tid(o.wall || 'RUINED_WALL', 'STONE_WALL'));
  for (const [px, py] of o.pillars || [[x, y], [x + w - 1, y]]) prop(map, px, py, tid('PILLAR', 'RUBBLE'), res);
  const rub = table(o.rubble || T_RUIN);
  for (let j = y + 1; j < y + h - 1; j++) {
    for (let i = x + 1; i < x + w - 1; i++) if (r.chance(o.mess != null ? o.mess : 0.14)) prop(map, i, j, pickT(r, rub), res);
  }
  for (const [gx, gy] of o.gaps || []) { dset(map, gx, gy, 0); floor(map, gx, gy, fl); }
  return map;
}

/**
 * How far the carriageway has wandered off the map's spine at row `y`.
 * Tapered to nothing at both ends, because the warp pads are nailed to a fixed
 * column and a road that arrives four tiles east of its own gate is a bug.
 */
export function bend(v, len, amp, freq, phase = 0) {
  const t = Math.min(1, Math.min(v, len - 1 - v) / 9);
  return Math.round(Math.sin(v * freq + phase) * amp * t);
}

/** A carriageway: `wide` tiles of ruts either side of the spine, plus verges. */
export function carriageway(map, r, spine, y0, y1, wide, ruts, verge) {
  for (let y = y0; y <= y1; y++) {
    const cx = spine(y);
    for (let d = -wide; d <= wide; d++) floor(map, cx + d, y, pickT(r, ruts));
    if (verge) {
      gset(map, cx - wide - 1, y, pickT(r, verge));
      gset(map, cx + wide + 1, y, pickT(r, verge));
    }
  }
  return map;
}

/** A milestone: the stone, the reading, and the beaten patch travellers stand on. */
export function milestone(map, x, y, text, res) {
  gset(map, x, y + 1, tid('DIRT', 'DIRT_PATH'));
  signpost(map, x, y, text, res);
  return map;
}

// ---------------------------------------------------------------------------
// 4. STREET FURNITURE — what a town has that a map of a town does not
// ---------------------------------------------------------------------------
//
// Every one of these used to be faked. A market was a row of CRATEs; an awning
// was THATCH_M on the `over` plane, which made the street cast a roof shadow; a
// washing line was FENCE_H hung in the air. render/tiles.js now has the real
// pieces (MARKET_STALL, AWNING, WASHING_LINE, BANNER, LANTERN, PLANTER, TROUGH,
// HAY, TENT, DOCK, PIER_POST), and these helpers place them.
//
// THE RULE FOR ALL OF THEM: nothing solid may pinch the map in two. Anything
// that sets SOLID goes down through `placeSafe`, which asks mapgen's
// `canPlaceProp` — so a stall can never be planted across the only lane out of
// a square. That needs live flags, so a caller either runs these after
// `recomputeFlags()` or lets them refresh the tiles they touch (they do).

/** True if a solid tile may go here without cutting the map in two. */
function placeSafe(map, x, y, id, res) {
  if (!map.inBounds(x, y) || id == null) return false;
  if (res && res.has(KEY(x, y))) return false;
  if (map.deco[y * map.w + x]) return false;
  if (!canPlaceProp(map, x, y, id)) return false;
  map.stamp('deco', x, y, id);          // stamp, not set: flags stay current
  return true;
}
export { canPlaceProp };

/**
 * A market row. `n` stalls running east ('h') or south ('v') from (x,y), each a
 * MARKET_STALL with its canvas jutting over the aisle and its goods stacked
 * behind it.
 *
 * o: { face:+1|-1, res, wares, gap, step=1, lantern, banner }
 * `face` is the side the shoppers stand on — the awning and the counter face
 * that way, the crates and sacks go on the other. `gap` leaves every nth stall
 * out so a row of eight is two rows of three with a way through the middle;
 * `step` spaces the pitches (2 = every other tile, the usual arcade spacing).
 * Returns the number of stalls actually stood up.
 */
export function stallRow(map, x, y, n, dir, r, o = {}) {
  const horiz = dir !== 'v' && dir !== 'down';
  const face = o.face === -1 ? -1 : 1;
  const res = o.res;
  const step = Math.max(1, o.step || 1);
  const wares = o.wares || table([['CRATE', 5], ['SACK', 5], ['BARREL', 4], ['SHELF_GOODS', 3], ['HAY', 1]]);
  const stallId = tid('MARKET_STALL', 'CART');
  const awn = tid('AWNING', 'THATCH_M');
  let placed = 0;
  for (let i = 0; i < n; i++) {
    if (o.gap && i % o.gap === o.gap - 1) continue;            // the lane through
    const sx = horiz ? x + i * step : x;
    const sy = horiz ? y : y + i * step;
    if (!placeSafe(map, sx, sy, stallId, res)) continue;
    placed++;
    // the canvas over the aisle — flags 0, so it can never block anything
    const ax = horiz ? sx : sx + face;
    const ay = horiz ? sy + face : sy;
    if (map.inBounds(ax, ay)) oset(map, ax, ay, awn);
    // the stock behind the stall
    const bx = horiz ? sx : sx - face;
    const by = horiz ? sy - face : sy;
    if (r && r.chance(0.55)) placeSafe(map, bx, by, tid(pickT(r, wares), 'CRATE'), res);
    // a lantern on the corner post every third pitch, a banner every fourth
    if (r && o.lantern !== false && i % 3 === 2 && map.inBounds(ax, ay) && !map.deco[ay * map.w + ax]) {
      dset(map, ax, ay, tid('LANTERN', 'TORCH'));
    } else if (r && o.banner && i % 4 === 1) {
      placeSafe(map, bx, by, tid('BANNER', 'SIGN'), res);
    }
  }
  return placed;
}

/** A run of canvas on the `over` plane. Nothing under it becomes unwalkable. */
export function awning(map, x, y, w, o = {}) {
  const id = tid('AWNING', 'THATCH_M');
  const vertical = o.vertical || o.dir === 'v';
  for (let i = 0; i < w; i++) {
    const px = vertical ? x : x + i;
    const py = vertical ? y + i : y;
    if (map.inBounds(px, py)) oset(map, px, py, id);
  }
  return map;
}

/**
 * Washing strung wall to wall across a street. `over` plane, flags 0 — you walk
 * under it. This is the Lower City's signature from above, and the reason it
 * had to become a real tile: the FENCE_H it used to be fooled `_drawOverhangs`
 * into dropping a roof's shadow onto an open street.
 */
export function washingLine(map, x0, y, x1, r) {
  const id = tid('WASHING_LINE', 'FENCE_H');
  const a = Math.min(x0, x1), b = Math.max(x0, x1);
  for (let x = a; x <= b; x++) {
    if (!map.inBounds(x, y)) continue;
    if (r && (x === a || x === b) && r.chance(0.25)) continue;   // a gap where a peg went
    oset(map, x, y, id);
  }
  return map;
}

/**
 * A walled garden: a hedge ring with one way in, turf and flowers inside, a
 * planter or two and a bench to sit on. Used for temple closes and the green
 * behind a festhall.
 *
 * rect: {x,y,w,h}; o: { res, gate:{x,y}, turf, fence:'HEDGE'|'STONE_FENCE',
 *                       tree:true, bench:true }
 */
export function garden(map, rect, r, o = {}) {
  const { x, y, w, h } = rect;
  const res = o.res;
  const fence = tid(o.fence || 'HEDGE', 'BUSH');
  const turf = o.turf || table([['GRASS_3', 6], ['CLOVER', 4], ['GRASS', 4], ['GRASS_2', 3]]);
  const gate = o.gate || { x: x + (w >> 1), y: y + h - 1 };
  groundNoise(map, r, x + 1, y + 1, w - 2, h - 2, turf);
  for (let i = x; i < x + w; i++) {
    for (const j of [y, y + h - 1]) if (!(i === gate.x && j === gate.y)) placeSafe(map, i, j, fence, res);
  }
  for (let j = y; j < y + h; j++) {
    for (const i of [x, x + w - 1]) if (!(i === gate.x && j === gate.y)) placeSafe(map, i, j, fence, res);
  }
  gset(map, gate.x, gate.y, tid('DIRT_PATH', 'GRASS'));
  // a path from the gate to the middle, so the garden is crossed rather than
  // stared at over a hedge
  const cy = y + (h >> 1);
  const step = gate.y > cy ? -1 : 1;
  for (let j = gate.y; j !== cy; j += step) gset(map, gate.x, j, tid('DIRT_PATH', 'GRASS'));
  scatter(map, r, x + 1, y + 1, w - 2, h - 2,
    table([['FLOWERS_RED', 4], ['FLOWERS_YELLOW', 4], ['FLOWERS_BLUE', 3], ['GRASS_TALL', 2]]), 0.3, res);
  if (o.tree !== false && w >= 6 && h >= 6) placeSafe(map, x + 1, y + 1, tid('TREE_OAK', 'BUSH'), res);
  const spots = [[x + 1, y + h - 2], [x + w - 2, y + h - 2], [x + w - 2, y + 1]];
  if (o.bench !== false) placeSafe(map, spots[0][0], spots[0][1], tid('BENCH', 'CRATE'), res);
  placeSafe(map, spots[1][0], spots[1][1], tid('PLANTER', 'BUSH'), res);
  if (w >= 7) placeSafe(map, spots[2][0], spots[2][1], tid('PLANTER', 'BUSH'), res);
  return map;
}

/**
 * A burying ground: rows of stones, one tomb, a low stone fence with a gap for
 * the lych-gate, and the one dead tree every graveyard on the Sword Coast has.
 * rect: {x,y,w,h}; o: { res, gate:{x,y}, fence, tomb:true }
 */
export function graveyard(map, rect, r, o = {}) {
  const { x, y, w, h } = rect;
  const res = o.res;
  const fence = tid(o.fence || 'STONE_FENCE', 'FENCE_H');
  const gate = o.gate || { x: x + (w >> 1), y: y + h - 1 };
  groundNoise(map, r, x + 1, y + 1, w - 2, h - 2, table([['GRASS_2', 5], ['GRASS', 4], ['DIRT', 2], ['GRASS_TALL', 2]]));
  for (let i = x; i < x + w; i++) {
    for (const j of [y, y + h - 1]) if (!(i === gate.x && j === gate.y)) placeSafe(map, i, j, fence, res);
  }
  for (let j = y; j < y + h; j++) {
    for (const i of [x, x + w - 1]) if (!(i === gate.x && j === gate.y)) placeSafe(map, i, j, fence, res);
  }
  gset(map, gate.x, gate.y, tid('DIRT_PATH', 'GRASS'));
  // Stones in ranks with a walking row between them — a graveyard you cannot
  // walk into is a walled patch of grass.
  const stone = tid('GRAVESTONE', 'ROCK');
  for (let j = y + 2; j < y + h - 1; j += 2) {
    for (let i = x + 2; i < x + w - 1; i += 2) {
      if (i === gate.x) continue;
      if (r && !r.chance(0.8)) continue;
      placeSafe(map, i, j, stone, res);
    }
  }
  if (o.tomb !== false && w >= 6 && h >= 5) placeSafe(map, x + w - 3, y + 1, tid('TOMB', 'GRAVESTONE'), res);
  placeSafe(map, x + 1, y + 1, tid('DEAD_TREE', 'TREE_OAK'), res);
  return map;
}

/**
 * Rows of fruit trees inside a fence, with a gate. Phandalin's Edermath Orchard
 * was hand-written; this is the same thing anywhere.
 * rect: {x,y,w,h}; o: { res, gate:{x,y}, tree:'TREE_OAK', rows:2, cols:2, turf }
 */
export function orchard(map, rect, r, o = {}) {
  const { x, y, w, h } = rect;
  const res = o.res;
  const tree = tid(o.tree || 'TREE_OAK', 'BUSH');
  const rows = Math.max(2, o.rows || 2), cols = Math.max(2, o.cols || 2);
  const turf = o.turf || table([['GRASS_3', 6], ['CLOVER', 4], ['GRASS', 3]]);
  floorRect(map, x, y, w, h, tid('GRASS_3', 'GRASS'));
  groundNoise(map, r, x + 1, y + 1, w - 2, h - 2, turf);
  const gate = o.gate || { x: x + (w >> 1), y: y + h - 1 };
  for (let j = y + 2; j < y + h - 1; j += rows) {
    for (let i = x + 1; i < x + w - 1; i += cols) {
      if (i === gate.x && j >= gate.y - 1) continue;
      placeSafe(map, i, j, tree, res);
    }
  }
  fenceRect(map, x, y, w, h, gate, res);
  return map;
}

/**
 * WEAR. render/tiles.js draws COBBLE_ISLE / PATH_ISLE / DIRT_ISLE /
 * GRAVEL_ISLE — a patch of one paving showing through another, with its own
 * soft edge — and until now not one map had ever placed one, so every plaza in
 * the game was a flat field of identical cobbles. This drops `count` of them
 * where a crowd actually wears a square: on OPEN ground, never under a prop,
 * never on a door or a trigger.
 */
export function wearPatches(map, r, rect, isleTile, count, o = {}) {
  const id = tid(isleTile, 'DIRT_PATH');
  if (id == null) return map;
  const { x, y, w, h } = rect;
  const res = o.res;
  let placed = 0;
  for (let n = 0; n < count * 12 && placed < count; n++) {
    const px = r.int(x, x + w - 1), py = r.int(y, y + h - 1);
    if (!map.inBounds(px, py)) continue;
    if (map.deco[py * map.w + px]) continue;
    if (res && res.has(KEY(px, py))) continue;
    if (map.flags[py * map.w + px] & (TF.TRIGGER | TF.DOOR | TF.WATER | TF.SOLID)) continue;
    gset(map, px, py, id);
    placed++;
    // wear comes in drifts, not dots: 0-2 more beside it
    for (const [dx, dy] of DIRS4) {
      if (!r.chance(0.35)) continue;
      const qx = px + dx, qy = py + dy;
      if (!map.inBounds(qx, qy) || qx < x || qy < y || qx >= x + w || qy >= y + h) continue;
      if (map.deco[qy * map.w + qx] || (res && res.has(KEY(qx, qy)))) continue;
      if (map.flags[qy * map.w + qx] & (TF.TRIGGER | TF.DOOR | TF.WATER | TF.SOLID)) continue;
      gset(map, qx, qy, id);
    }
  }
  return map;
}

/**
 * DRESS A STREET. The blunt `scatter()` every town uses drops barrels in the
 * middle of the road, because it only asks "is this tile empty". This asks the
 * three questions a person putting a barrel down asks:
 *
 *   1. is there a WALL to put it against?  (nothing stands in the open)
 *   2. is this somebody's DOORSTEP, or the tile in front of one?
 *   3. would this pinch the street?        (`canPlaceProp`)
 *
 * It also refuses triggers, water, and the tiles the cast stands on. Run it
 * after `recomputeFlags()` — it needs live flags to answer question 3.
 *
 * o: { res, chance=0.35, tbl, avoid:Set, corners=true }
 */
export function dressStreets(map, r, rect, o = {}) {
  const { x, y, w, h } = rect;
  const res = o.res;
  const chance = o.chance != null ? o.chance : 0.35;
  const tbl = o.tbl || table([
    ['BARREL', 5], ['CRATE', 5], ['SACK', 4], ['HAY', 2], ['PLANTER', 2],
    ['TROUGH', 2], ['BENCH', 2], ['LANTERN', 2], ['BANNER', 1], ['CART', 1],
  ]);
  // Doorsteps and the tile in front of them are sacred.
  const forbidden = new Set(o.avoid || []);
  const doorIds = new Set([tid('DOOR_CLOSED'), tid('DOOR_OPEN'), tid('IRON_DOOR'), tid('GATE'), tid('GATEWAY'), tid('STAIRS_UP'), tid('STAIRS_DOWN')].filter((v) => v != null));
  for (let j = 0; j < map.h; j++) {
    for (let i = 0; i < map.w; i++) {
      const k = j * map.w + i;
      if (!doorIds.has(map.deco[k]) && !doorIds.has(map.ground[k]) && !(map.flags[k] & TF.DOOR)) continue;
      for (let dy = -1; dy <= 2; dy++) for (let dx = -1; dx <= 1; dx++) forbidden.add(KEY(i + dx, j + dy));
    }
  }
  for (const t of map.triggers || []) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) forbidden.add(KEY(t.x + dx, t.y + dy));
  }
  let placed = 0;
  for (let j = y; j < y + h; j++) {
    for (let i = x; i < x + w; i++) {
      if (!map.inBounds(i, j)) continue;
      const k = j * map.w + i;
      if (map.deco[k] || (map.flags[k] & (TF.SOLID | TF.WATER | TF.TRIGGER | TF.DOOR))) continue;
      if (forbidden.has(KEY(i, j)) || (res && res.has(KEY(i, j)))) continue;
      // Against something: a wall, a hedge, a fence — anything solid.
      let backs = 0, diag = 0;
      for (const [dx, dy] of DIRS4) if (map.inBounds(i + dx, j + dy) && (map.flags[(j + dy) * map.w + (i + dx)] & TF.SOLID)) backs++;
      for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) if (map.inBounds(i + dx, j + dy) && (map.flags[(j + dy) * map.w + (i + dx)] & TF.SOLID)) diag++;
      if (!backs) continue;
      if (backs >= 3) continue;                          // an alcove; leave it open
      const corner = o.corners !== false && backs >= 2 && diag >= 1;
      if (!r.chance(corner ? Math.min(0.9, chance * 2) : chance)) continue;
      if (placeSafe(map, i, j, tid(pickT(r, tbl), 'CRATE'), res)) placed++;
    }
  }
  return placed;
}

// ---------------------------------------------------------------------------
// 5. CONNECTIVITY — nothing walkable may be walled off by accident
// ---------------------------------------------------------------------------

/**
 * Flood from `from`, find every orphan blob of `minSize` or more, and push a
 * one-tile path from the blob to the nearest reachable tile, sweeping the
 * vegetation off it. `protect` is the set every `building()` footprint is
 * added to: the path refuses to cross it, so a walled yard keeps its wall.
 * Index order makes the whole pass deterministic.
 */
export function openThickets(map, from, minSize = 5, protect = null) {
  const W = map.w, H = map.h, N = W * H;
  map.recomputeFlags({ keep: 0 });
  // `sealBorder()` has not run yet: count the ring as solid here or every
  // corner thicket passes this test and fails in play.
  const solid = (i) => {
    const x = i % W, y = (i / W) | 0;
    return x === 0 || y === 0 || x === W - 1 || y === H - 1 || map.solidAt(x, y);
  };

  const reach = new Uint8Array(N);
  const s0 = from.y * W + from.x;
  if (solid(s0)) return map;
  const st = [s0]; reach[s0] = 1;
  while (st.length) {
    const i = st.pop(), x = i % W, y = (i / W) | 0;
    for (const [dx, dy] of DIRS4) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (reach[j] || solid(j)) continue;
      reach[j] = 1; st.push(j);
    }
  }

  const grouped = new Uint8Array(N);
  for (let i0 = 0; i0 < N; i0++) {
    if (reach[i0] || grouped[i0] || solid(i0)) continue;
    const blob = [i0]; grouped[i0] = 1;
    for (let k = 0; k < blob.length; k++) {
      const x = blob[k] % W, y = (blob[k] / W) | 0;
      for (const [dx, dy] of DIRS4) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (grouped[j] || reach[j] || solid(j)) continue;
        grouped[j] = 1; blob.push(j);
      }
    }
    if (blob.length < minSize) continue;

    // Shortest way out, through anything but the sealed border.
    const prev = new Int32Array(N).fill(-1);
    const seen = new Uint8Array(N);
    const q = blob.slice();
    for (const b of blob) seen[b] = 1;
    let head = 0, target = -1;
    while (head < q.length && target < 0) {
      const c = q[head++], x = c % W, y = (c / W) | 0;
      for (const [dx, dy] of DIRS4) {
        const nx = x + dx, ny = y + dy;
        if (nx < 1 || ny < 1 || nx >= W - 1 || ny >= H - 1) continue;
        const j = ny * W + nx;
        if (seen[j]) continue;
        if (protect && protect.has(KEY(nx, ny))) continue;
        // Only vegetation can be cleared. Water stays water and a mountain
        // stays a mountain.
        if (map.flagAt(nx, ny) & TF.WATER) continue;
        if (!map.deco[j] && map.solidAt(nx, ny)) continue;
        seen[j] = 1; prev[j] = c;
        if (reach[j]) { target = j; break; }
        q.push(j);
      }
    }
    if (target < 0) continue;
    // Walk the parent chain back to THIS blob — not to any older one.
    const mine = new Set(blob);
    for (let c = prev[target]; c >= 0 && !mine.has(c); c = prev[c]) {
      clearStanding(map, c % W, (c / W) | 0);
      reach[c] = 1;
    }
    for (const b of blob) reach[b] = 1;
  }
  return map;
}

/**
 * THE SAME PROMISE, UNDERGROUND. `validateConnectivity` in mapgen only
 * guarantees the points it is handed; whole rooms can still end up walled off.
 * Down here the walls are on the DECO plane over a floor ground, so clearing a
 * wall is clearing deco — except for the VOID cells outside the rooms, which
 * have no ground at all; those get the floor of whatever they are being joined to.
 */
export function connectRegions(map, minSize = 6) {
  const W = map.w, H = map.h, N = W * H;
  const from = map.entry || map.spawn;
  if (!from) return map;
  const solid = (i) => {
    const x = i % W, y = (i / W) | 0;
    return map.solidAt(x, y) && !(map.flagAt(x, y) & TF.DOOR);
  };
  const reach = new Uint8Array(N);
  const s0 = from.y * W + from.x;
  if (solid(s0)) return map;
  const st = [s0]; reach[s0] = 1;
  while (st.length) {
    const i = st.pop(), x = i % W, y = (i / W) | 0;
    for (const [dx, dy] of DIRS4) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (reach[j] || solid(j)) continue;
      reach[j] = 1; st.push(j);
    }
  }

  const grouped = new Uint8Array(N);
  for (let i0 = 0; i0 < N; i0++) {
    if (reach[i0] || grouped[i0] || solid(i0)) continue;
    const blob = [i0]; grouped[i0] = 1;
    for (let k = 0; k < blob.length; k++) {
      const x = blob[k] % W, y = (blob[k] / W) | 0;
      for (const [dx, dy] of DIRS4) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (grouped[j] || reach[j] || solid(j)) continue;
        grouped[j] = 1; blob.push(j);
      }
    }
    if (blob.length < minSize) continue;

    const prev = new Int32Array(N).fill(-1);
    const seen = new Uint8Array(N);
    const q = blob.slice();
    for (const b of blob) seen[b] = 1;
    let head = 0, target = -1;
    while (head < q.length && target < 0) {
      const c = q[head++], x = c % W, y = (c / W) | 0;
      for (const [dx, dy] of DIRS4) {
        const nx = x + dx, ny = y + dy;
        if (nx < 1 || ny < 1 || nx >= W - 1 || ny >= H - 1) continue;
        const j = ny * W + nx;
        if (seen[j]) continue;
        seen[j] = 1; prev[j] = c;
        if (reach[j]) { target = j; break; }
        q.push(j);
      }
    }
    if (target < 0) continue;
    const fill = map.ground[target] || map.ground[blob[0]] || tid('DUNGEON_FLOOR', 'STONE_FLOOR');
    const mine = new Set(blob);
    for (let c = prev[target]; c >= 0 && !mine.has(c); c = prev[c]) {
      // A flooded gallery blocks as hard as a wall and clearing SOLID does not
      // touch it: WATER is its own bit. Plank the route where it crosses one.
      const wet = (map.flags[c] & TF.WATER) !== 0;
      map.deco[c] = 0;
      if (wet) map.ground[c] = tid('BRIDGE_WOOD', 'STONE_FLOOR');
      else if (!map.ground[c]) map.ground[c] = fill | 0;
      map.flags[c] &= ~(TF.SOLID | TF.WATER | TF.SLOW | TF.DAMAGE);
      reach[c] = 1;
    }
    for (const b of blob) reach[b] = 1;
  }
  return map;
}

const PACK_GENS = {
  cave: generateCave, mine: generateMine, ruins: generateRuins, crypt: generateCrypt, dungeon: generateDungeon,
};

/**
 * A procedural site hanging off a region pack.
 *
 * maps.js's `buildProcedural` only knows the way out of Undermountain, Wave Echo
 * and the Redbrand hideout; everything else gets `up: null`, which leaves the
 * up-stair inert and the site a one-way hole. So a pack dungeon generates
 * itself and rewrites its own stairs against the surface tile it was entered
 * from. The DOWN stair either links on to `<id>-2` (the default) or, when
 * `flavour` text is given, becomes a sign — a choked shaft that cannot strand
 * anybody on a floor whose up-stair would resolve to a map that does not exist.
 *
 * opts: { gen, theme, biome, size, level, music, region, encounterTable, connect }
 */
export function packDungeon(id, name, opts, surface, flavour) {
  const gen = PACK_GENS[opts.gen] || generateDungeon;
  return (r, ctx) => {
    const map = gen({
      seed: `${(ctx && ctx.seed) || 'sword-coast'}:${id}`,
      depth: 1,
      biome: opts.biome || 'dungeon',
      theme: opts.theme || 'dungeon',
      size: opts.size || 'medium',
      name,
      level: opts.level || 10,
    });
    for (const t of map.triggers || []) {
      if (t.kind !== 'warp' || !t.data) continue;
      const role = t.data.stair || t.data.dir;
      if (role === 'up') Object.assign(t.data, { stair: 'up', kind: 'stairs', exit: true, ...surface });
      else if (role === 'down') {
        if (flavour != null) { t.kind = 'sign'; t.step = false; t.data = { text: flavour }; }
        else Object.assign(t.data, { stair: 'down', kind: 'stairs', map: `${id}-2`, depth: 2, dir: 'down' });
      }
    }
    map.id = id;
    map.name = name;
    map.level = opts.level || 10;
    map.region = opts.region || id;
    map.depth = 1;
    if (opts.encounterTable) map.encounterTable = opts.encounterTable;
    if (opts.music) map.music = opts.music;
    if (opts.connect !== false) connectRegions(map, 6);
    normalizeTriggers(map);
    return map;
  };
}

/**
 * The mouth of a procedural site on a hand-built map. A `bWarp: null` row is
 * only half a link — `applyWarpNodes` skips it — so the surface end is stamped
 * by hand. `tile: null` leaves the ground alone (for a mouth that is already a
 * door somebody's `building()` painted).
 */
export function siteMouth(map, x, y, to, o = {}) {
  if (o.tile !== null) floor(map, x, y, tid(o.tile || 'STAIRS_DOWN', 'CAVE_FLOOR'));
  openDoorway(map, x, y);
  map.addTrigger({
    id: `${map.id}>${to}`, kind: 'warp', x, y,
    data: { map: to, depth: 1, dir: o.dir || 'down', kind: o.kind || 'cave', theme: o.theme || null },
  });
  return map;
}
