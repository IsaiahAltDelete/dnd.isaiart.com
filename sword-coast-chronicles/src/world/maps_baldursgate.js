// world/maps_baldursgate.js — BALDUR'S GATE, the whole of it: the Outer City
// sprawled round Dusthawk Hill, the Lower City between the Old Wall and Gray
// Harbour, the Upper City behind the Old Wall, and Wyrm's Crossing carrying the
// Coast Way over the Chionthar to Rivington on the south bank.
//
// CONTRACT (consumed by world/maps.js — do not add exports beyond these two)
//   REGION_MAPS   -> { id: { name, kind, biome, w, h, indoor, safe, music, level,
//                            region, parent, desc, build(rng, ctx) } }
//   REGION_LINKS  -> [ { a, aWarp, aLand, b, bWarp, bLand, toB, toA, kind } ]
// maps.js runs REGION_MAPS through its own private `def()` and concatenates
// REGION_LINKS into ALL_LINKS, so nothing here imports either.
//
// WHY THE PAINTING HELPERS ARE COPIED. `building()`, `room()`, `grect`, `prop`
// and the rest are module-private in maps.js. They are reproduced here verbatim
// (§0) so a region pack is a standalone file that four people can author in
// parallel without touching the 2,000-line core module.
//
// THE THREE CITIES, AND HOW THEY ARE TOLD APART. The whole point of Baldur's
// Gate is the value break between its three rings, and it is carried entirely by
// ground material, wall material and building density:
//
//   OUTER CITY   MUD / DIRT / GRAVEL, WATTLE_WALL / LOG_WALL / PALISADE, thatch
//                roofs under heavy roofPatch, no street plan, tents and awnings
//                on the `over` plane, DEAD_TREE, RUBBLE, SACK. Nothing squared.
//   LOWER CITY   COBBLE with MUD where it gives out, BRICK_WALL, shingle roofs,
//                two-tile streets, washing lines strung overhead, warehouses,
//                a working harbour of BRIDGE_WOOD quays and WATER_DEEP.
//   UPPER CITY   FLAGSTONE and MOSAIC, STONE_WALL and BRICK_WALL, tile roofs,
//                three-storey jettied facades, PILLAR colonnades, STATUE,
//                FOUNTAIN, BRAZIER, walled gardens. Broad, straight and cold.
//
// WARP GEOMETRY. The border ring is sealed, so a west warp sits at x=1 and lands
// at x=3; east at x=w-2 landing x=w-4; north at y=1 landing y=3; south at y=h-2
// landing y=h-4. An exterior door warps on the building's base-course row and
// lands one tile south of it. An interior warps at [floor(w/2), h-1] and lands
// one row up. `kind:'road'` and `kind:'cave'` open a three-tile mouth;
// `kind:'door'` and `kind:'stairs'` open exactly one — which is why every gated
// gate in this pack is a door, so a single solid warden can close it.
//
// THE GATES. Six gates pierce the Old Wall in canon; four (Sea, Manor, Gond,
// Heap) are patriar-only and are drawn here as sealed IRON_DOOR with a Fist
// sentry and a sign — scenery, not warps. The two that carry traffic are the
// Black Dragon Gate (Outer City -> the Wide) and the Baldur's Gate itself
// (the Wide -> Bloomridge). The Basilisk Gate and the Cliffgate pierce the outer
// wall of the Lower City.
//
// EVERY WARP IN THIS FILE, in the order REGION_LINKS declares them:
//   coast-way-north  [30,62]<->[28, 1] bg-blackgate           road   (the road in)
//   bg-blackgate     [54,22]<->[ 1,20] bg-norchapel           road
//   bg-blackgate     [ 1,22]<->[42,20] bg-sows-foot           road
//   bg-norchapel     [24,38]<->[24, 1] bg-little-calimshan    road
//   bg-little-calimshan [24,40]<->[22,1] bg-tumbledown        road
//   bg-tumbledown    [ 1,20]<->[46,20] bg-twin-songs          road
//   bg-twin-songs    [24, 1]<->[22,38] bg-sows-foot           road
//   bg-twin-songs    [24,40]<->[32, 1] bg-wyrms-crossing      road
//   bg-wyrms-crossing[32,24]<->[28, 1] bg-rivington           road
//   bg-wyrms-crossing[32,12]<->[13,19] wyrms-rock             door
//   bg-rivington     [18,20]<->[12,17] sharess-caress         door
//   bg-rivington     [28,42]<->[30, 1] coast-way-south        road   (the road out)
//   bg-blackgate     [28,42]<->[28, 1] bg-the-wide            door   BLACK DRAGON GATE
//   bg-the-wide      [28,42]<->[24, 1] bg-bloomridge          door   THE BALDUR'S GATE
//   bg-little-calimshan [1,22]<->[50,20] bg-eastway           door   BASILISK GATE
//   bg-tumbledown    [ 8, 8]<->[44, 6] bg-heapside            door   CLIFFGATE
//   bg-bloomridge    [46,20]<->[ 1,20] bg-heapside            road
//   bg-heapside      [50,20]<->[ 1,20] bg-eastway             road
//   bg-bloomridge    [ 1,20]<->[58,20] bg-gray-harbour        road
//   bg-bloomridge    [22,18]<->[11,17] counting-house         door
//   bg-gray-harbour  [16,16]<->[14,21] seatower-of-balduran   door
//   bg-gray-harbour  [28,14]<->[11,17] water-queens-house     door
//   bg-gray-harbour  [40,26]<->[11,15] low-lantern            door
//   bg-heapside      [18,16]<->[12,19] blushing-mermaid       door
//   bg-heapside      [40,16]<->[12,19] high-house-of-wonders  door
//   bg-heapside      [30,30]<->[ 9,15] shrine-of-suffering    door
//   bg-heapside      [24,24]<->[15,21] the-undercellar        stairs
//   bg-heapside      [10,34]<->  null  bg-sewers              cave
//   bg-eastway       [22,18]<->[13,19] elfsong-tavern         door
//   bg-eastway       [36,26]<->[11,17] sorcerous-sundries     door
//   bg-the-wide      [54,22]<->[ 1,20] bg-temples-district    road
//   bg-the-wide      [ 1,22]<->[44,20] bg-citadel-streets     road
//   bg-the-wide      [20,18]<->[10,15] baldurs-mouth          door
//   bg-temples-district [24,18]<->[15,23] high-hall           door
//   bg-temples-district [38,26]<->[11,17] unrolling-scroll    door
//   bg-citadel-streets  [22,18]<->[13,19] watch-citadel       door
//   bg-tumbledown    [30,24]<->  null  tumbledown-crypts      cave
//
// CAMPAIGN YEAR 1496 DR. The Absolute crisis of 1492 is four years past.
// Ulder Ravengard is Grand Duke; Dillard Portyr gave the post up. Belynne
// Stelmane was murdered in the Elfsong in 1492 and Thalamra Vanthampur died in
// 1491; Katernin Sashenstar and Bardeid Dlusker hold their chairs.

import { TileMap, TF } from './tilemap.js';
import { tid } from './mapgen.js';
import {
  KEY, gset, dset, oset, floor, grect, drect, orect, floorRect, dframe, table, pickT, prop, scatter,
  groundNoise, repave, sealBorder, openDoorway, normalizeTriggers, reservedFor, clearStanding,
  sweepStanding, building, shell, room, fenceRect, bigOak, addSign,
  interiorMap as kitInteriorMap, finishInterior as kitFinishInterior, packDungeon,
  stallRow, awning, washingLine, wearPatches,
  innFloor, tower, temple, noticeBoard,
} from './mapkit.js';

// ---------------------------------------------------------------------------
// 0. PRELUDE — the painting kit is world/mapkit.js. Only what needs this
//    pack's own REGION_LINKS lives here.
// ---------------------------------------------------------------------------

/** Interiors in the city default to its region string. */
const interiorMap = (o) => kitInteriorMap({ region: 'baldurs-gate', ...o });

/**
 * Flags, border, exit, threshold, spawn, NPC sweep — and then any two-tile
 * cupboard a hearth wall, a counter run and a back stair left behind the
 * furniture is closed in the room's own stone.
 */
function finishInterior(map, r, exit, res) {
  kitFinishInterior(map, exit, res, { seal: 'STONE_WALL', threshold: true });
  if (map.id) fillDeadPockets(map, map.id, 'STONE_WALL', 6);
  return map;
}

/**
 * INVARIANT 6, ENFORCED RATHER THAN HOPED FOR. Every `aLand`/`bLand` tile in
 * REGION_LINKS has to be walkable after `recomputeFlags()`, and a scatter() roll
 * that drops a crate on one turns a doorway into a wall you can walk out of but
 * not back through. This reads the pack's own link table and sweeps the four
 * tiles of every row that touches this map. (REGION_LINKS is declared at the
 * foot of the module; builders only run at loadMap time, long after evaluation,
 * so the reference is live rather than a temporal-dead-zone error.)
 */
function openWarpTiles(map, id) {
  for (const l of REGION_LINKS) {
    const pts = [];
    if (l.a === id) { pts.push(l.aWarp, l.aLand); }
    if (l.b === id) { pts.push(l.bWarp, l.bLand); }
    for (const p of pts) if (p) clearStanding(map, p[0], p[1]);
  }
  return map;
}

const N4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];

/**
 * INVARIANT 6's other half, and the reason the flood-fill report is readable.
 *
 * A wall drawn round a yard, a colonnade laid across a lane, the gap between a
 * gable and the border course: each of them strands two or three walkable tiles
 * that no player can ever stand on. They are invisible in play, they are noise
 * in a reachability pass, and they are indistinguishable in a report from the
 * thing that actually matters — a whole district cut off by a sealed gate. So
 * fill the small ones in with the district's own wall and leave the big ones
 * exactly where they are.
 *
 * `limit` is the line between the two. Anything larger than a handful of tiles
 * is a LAYOUT BUG and must stay visible: bricking over a severed quarter would
 * hide it for ever. A pocket holding one of the map's NPCs is likewise left
 * alone rather than closed on top of them.
 *
 * The flood is seeded from the spawn AND from every link tile touching this map,
 * because `applyWarpNodes` opens the gate mouths in `maps.js` long after any
 * builder has returned — at this moment a perfectly good gate still reads solid.
 */
function fillDeadPockets(map, id, wallName, limit = 8) {
  const w = map.w, h = map.h;
  const wall = tid(wallName || 'STONE_WALL', 'STONE_WALL');
  const res = reservedFor(id);
  const seen = new Uint8Array(w * h);
  const q = [];
  const seed = (x, y) => {
    if (!map.inBounds(x, y)) return;
    const i = y * w + x;
    if (!seen[i]) { seen[i] = 1; q.push(i); }
  };
  if (map.spawn) seed(map.spawn.x, map.spawn.y);
  for (const l of REGION_LINKS) {
    if (l.a === id) { if (l.aWarp) seed(l.aWarp[0], l.aWarp[1]); if (l.aLand) seed(l.aLand[0], l.aLand[1]); }
    if (l.b === id) { if (l.bWarp) seed(l.bWarp[0], l.bWarp[1]); if (l.bLand) seed(l.bLand[0], l.bLand[1]); }
  }
  for (let i = 0; i < q.length; i++) {
    const j = q[i], jx = j % w, jy = (j / w) | 0;
    for (const [dx, dy] of N4) {
      const nx = jx + dx, ny = jy + dy;
      if (nx < 1 || ny < 1 || nx >= w - 1 || ny >= h - 1) continue;
      const nj = ny * w + nx;
      if (seen[nj] || map.solidAt(nx, ny)) continue;
      seen[nj] = 1; q.push(nj);
    }
  }

  const done = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (seen[i] || done[i] || map.solidAt(x, y)) continue;
      const pocket = [i]; done[i] = 1;
      let manned = false;
      for (let pi = 0; pi < pocket.length; pi++) {
        const j = pocket[pi], jx = j % w, jy = (j / w) | 0;
        if (res.has(KEY(jx, jy))) manned = true;
        for (const [dx, dy] of N4) {
          const nx = jx + dx, ny = jy + dy;
          if (nx < 1 || ny < 1 || nx >= w - 1 || ny >= h - 1) continue;
          const nj = ny * w + nx;
          if (done[nj] || seen[nj] || map.solidAt(nx, ny)) continue;
          done[nj] = 1; pocket.push(nj);
        }
      }
      if (manned || pocket.length > limit) continue;
      for (const j of pocket) {
        const jx = j % w, jy = (j / w) | 0;
        dset(map, jx, jy, wall);
        map.setFlag(jx, jy, TF.SOLID);
      }
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// 0c. THE THREE PALETTES
// ---------------------------------------------------------------------------

// ONE MATERIAL PER AREA, IN BLOCKS. Every ground tile here carries four or more
// internal variants hashed off its world position, so a flat fill is already
// textured. Speckling two of them together does not add texture — DIRT, GRAVEL
// and MUD share the `dirt` autotile group but not a value, so a 9:5:4 mix
// paints a checkerboard the autotiler cannot verge and the eye cannot read.
// The districts are told apart by large contiguous blocks of one material:
//
//   DIRT       mid brown, mottled     the Outer City's ground
//   DIRT_PATH  light tan, worn smooth its lanes
//   GRAVEL     grey, speckled         its caravan hardstanding
//   MUD        dark brown             its pens, mires and slum alleys
//   SAND       pale cream             Little Calimshan
//   COBBLE     mid grey setts         the Lower City
//   FLAGSTONE  pale grey slabs        the Upper City, quays, temple forecourts
//   MOSAIC     blue and gold inlay    used as deliberate inlay ONLY, never noise
const G_DIRT = [['DIRT', 1]];
const G_LANE = [['DIRT_PATH', 1]];
const G_YARD = [['GRAVEL', 1]];
const G_MIRE = [['MUD', 1]];
const G_SAND = [['SAND', 1]];
const G_COBBLE = [['COBBLE', 1]];
const G_FLAG = [['FLAGSTONE', 1]];

const OUTER_JUNK = [['SACK', 5], ['BARREL', 4], ['CRATE', 3], ['RUBBLE', 3], ['STUMP', 2], ['DEAD_TREE', 2]];
const LOWER_CLUTTER = [['CRATE', 5], ['BARREL', 5], ['SACK', 4], ['CART', 2]];

// The waterline. WATER_DEEP is solid, which is what stops the party wandering
// out to sea; WATER is a wade, so a rim of it round the deep reads as shallows.
const HARBOUR = [['WATER_DEEP', 1]];

// ---------------------------------------------------------------------------
// 1. THE OUTER CITY
// ---------------------------------------------------------------------------
//
// Nine canon districts sprawl round Dusthawk Hill outside both walls, unwalled,
// ungoverned, and where most Baldurians actually live. Seven are built here;
// Whitkeep and Stonyeyes are folded into Norchapel as sign-tagged quarters.
// Nothing out here is paved, squared, or finished, and every one of these maps
// is built the same way: one flat block of DIRT, the lanes cut through it in
// DIRT_PATH, the yards floored in GRAVEL and the pens drowned in MUD.

// --- Blackgate: the Trade Way's last mile, and the gate it dies at ----------
function buildBlackgate(root) {
  const map = new TileMap({
    w: 56, h: 44, id: 'bg-blackgate', name: 'Blackgate', biome: 'city',
    indoor: false, music: 'city', safe: true, encounterRate: 0, region: 'baldurs-gate',
  });
  const res = reservedFor('bg-blackgate');
  const rg = root.fork('ground'), rd = root.fork('detail');
  const dirt = table(G_DIRT), lane = table(G_LANE), junk = table(OUTER_JUNK);

  grect(map, 0, 0, 56, 44, tid('DIRT', 'GRAVEL'));

  // --- the buildings, before the ground is finished -------------------------
  // Wagon shelters: dark log walls, open fronts, and a loading door you back a
  // cart into. They are the only square things in the district.
  const shed = (x, y, w, h, dx) => shell(map, {
    x, y, w, h, wall: 'LOG_WALL', roof: 'thatch', base: 'GRAVEL', roofRows: 2,
    roofPatch: [[1, 1], [w - 2, 1]], loading: [dx], windows: [], band: 2,
  }, res);
  shed(6, 8, 9, 6, 4);
  shed(17, 9, 6, 5, 2);
  shed(41, 8, 9, 6, 4);
  shed(34, 9, 5, 5, 2);

  // Shanties, crowded up against the Old Wall and along the yards' backs. No two
  // the same size, none of them square to the road, all of them patched.
  // ONE ROOF ROW. A five-high house with three rows of thatch is a gold bar with
  // a red stripe under it; with one it is a house, because the wall is what the
  // eye reads a building by. Everything out here keeps two or three wall rows.
  const SHANTY_WALLS = ['WATTLE_WALL', 'LOG_WALL', 'WATTLE_WALL', 'PALISADE'];
  let shackN = 0;
  const shack = (x, y, w, h, o = {}) => building(map, {
    x, y, w, h, roof: 'thatch', base: 'DIRT', roofRows: 1,
    wall: o.wall || SHANTY_WALLS[shackN++ % SHANTY_WALLS.length],
    roofPatch: o.patch || [[Math.max(0, w - 3), 0], [1, 0]],
    windows: o.win || [1, w - 2], upper: h >= 5 ? [w >> 1] : [], band: h >= 5 ? 2 : undefined,
    door: null, sign: o.sign, lit: o.lit,
  }, res);
  for (const [x, y, w, h] of [
    [3, 35, 6, 5], [10, 36, 5, 4], [16, 35, 7, 5], [24, 37, 4, 3],
    [32, 36, 6, 4], [39, 35, 5, 5], [45, 36, 4, 4], [50, 35, 5, 5],
    [2, 24, 6, 5], [49, 24, 6, 5], [2, 15, 5, 5], [50, 15, 5, 5],
  ]) shack(x, y, w, h);
  shell(map, { x: 45, y: 25, w: 5, h: 4, wall: 'PALISADE', roof: 'thatch', base: 'DIRT', roofRows: 1, roofPatch: [[1, 1]], windows: [1, 3] }, res);
  shell(map, { x: 8, y: 15, w: 5, h: 4, wall: 'PALISADE', roof: 'thatch', base: 'DIRT', roofRows: 1, roofPatch: [[2, 1]], windows: [1, 3] }, res);

  // Gorstag Evenwood's yard office and Brother Stedd's soup shelter: the two
  // buildings on the map with a sign and a lit window.
  building(map, {
    x: 33, y: 15, w: 9, h: 6, wall: 'LOG_WALL', roof: 'shingle', base: 'GRAVEL',
    roofRows: 2, windows: [1, 7], upper: [3, 6], band: 3, sign: 5, door: 4,
    chimney: 7, lit: true, approach: 3,
  }, res);
  building(map, {
    x: 13, y: 15, w: 8, h: 6, wall: 'WATTLE_WALL', roof: 'thatch', base: 'DIRT',
    roofRows: 2, roofPatch: [[1, 1], [6, 1]], windows: [1, 6], upper: [4],
    sign: 3, door: 4, chimney: 1, lit: true, approach: 3,
  }, res);

  // --- the ground, in blocks ------------------------------------------------
  repave(map, rg, 0, 0, 56, 44, dirt);
  grect(map, 3, 6, 21, 14, tid('GRAVEL', 'DIRT'));      // west caravan yard
  grect(map, 32, 6, 21, 14, tid('GRAVEL', 'DIRT'));     // east caravan yard
  grect(map, 6, 25, 12, 7, tid('MUD', 'DIRT'));         // west ox pen
  grect(map, 38, 25, 13, 7, tid('MUD', 'DIRT'));        // east ox pen
  grect(map, 18, 33, 20, 8, tid('GRAVEL', 'DIRT'));     // the muster ground

  // The Trade Way runs south down the spine to the Black Dragon Gate, and the
  // ring road runs west to Sow's Foot and east to Norchapel.
  for (let y = 1; y <= 40; y++) for (let x = 26; x <= 30; x++) floor(map, x, y, pickT(rg, lane));
  for (let y = 21; y <= 23; y++) for (let x = 1; x <= 54; x++) floor(map, x, y, pickT(rg, lane));
  for (let x = 12; x <= 13; x++) for (let y = 21; y <= 34; y++) floor(map, x, y, pickT(rg, lane));
  for (let x = 43; x <= 44; x++) for (let y = 21; y <= 34; y++) floor(map, x, y, pickT(rg, lane));
  for (let y = 33; y <= 34; y++) for (let x = 3; x <= 52; x++) floor(map, x, y, pickT(rg, lane));

  // --- the Old Wall and the Black Dragon Gate -------------------------------
  // A door-kind warp opens exactly one tile, which is what lets a single Fist
  // sergeant close the whole city (Randal Whitburn stands on (28,42)).
  drect(map, 0, 41, 56, 3, tid('STONE_WALL', 'BRICK_WALL'));
  for (let x = 0; x < 56; x++) dset(map, x, 41, tid('WALL_TOP_SHADE', 'STONE_WALL'));
  for (const y of [41, 42]) floor(map, 28, y, tid('FLAGSTONE', 'COBBLE'));
  dset(map, 27, 41, tid('PILLAR', 'STONE_WALL'));
  dset(map, 29, 41, tid('PILLAR', 'STONE_WALL'));
  floorRect(map, 25, 39, 7, 2, tid('FLAGSTONE', 'GRAVEL'));
  // The dragon over the arch, and the torches that light the queue.
  prop(map, 24, 40, tid('STATUE', 'PILLAR'), res);
  prop(map, 32, 40, tid('STATUE', 'PILLAR'), res);
  prop(map, 25, 39, tid('TORCH', 'CANDLE'), res);
  prop(map, 31, 39, tid('TORCH', 'CANDLE'), res);
  // The Fist checkpoint: crates, a bench, and a board nobody reads twice.
  for (const [x, y, t] of [[22, 38, 'CRATE'], [23, 39, 'CRATE'], [22, 39, 'BARREL'],
    [34, 38, 'BENCH'], [35, 39, 'CRATE'], [34, 39, 'BARREL']]) prop(map, x, y, tid(t, 'CRATE'), res);
  prop(map, 23, 38, tid('SIGN', 'CRATE'), res);
  prop(map, 20, 36, tid('BRAZIER', 'TORCH'), res);
  prop(map, 37, 36, tid('BRAZIER', 'TORCH'), res);

  // --- the yards ------------------------------------------------------------
  const wagons = table([['CART', 6], ['CRATE', 5], ['BARREL', 4], ['SACK', 4]]);
  for (let x = 4; x <= 22; x += 3) { prop(map, x, 6, pickT(rd, wagons), res); prop(map, x + 1, 19, pickT(rd, wagons), res); }
  for (let x = 33; x <= 51; x += 3) { prop(map, x, 6, pickT(rd, wagons), res); prop(map, x + 1, 19, pickT(rd, wagons), res); }
  // Ox pens. The oxen themselves are data/npcs' problem; the rails are here.
  fenceRect(map, 6, 25, 12, 7, { x: 12, y: 25 }, res);
  fenceRect(map, 38, 25, 13, 7, { x: 43, y: 25 }, res);
  prop(map, 20, 27, tid('WELL', 'FOUNTAIN'), res);
  prop(map, 20, 29, tid('SACK', 'CRATE'), res);
  prop(map, 35, 27, tid('CART', 'CRATE'), res);
  scatter(map, rd, 2, 5, 52, 30, junk, 0.03, res);

  // Puddles standing in the ruts, which is the whole visual argument for the
  // Outer City in one deco pass.
  for (let y = 24; y <= 40; y++) {
    for (let x = 2; x <= 53; x++) {
      if (map.deco[y * map.w + x]) continue;
      if (rd.chance(0.04)) prop(map, x, y, tid('PROP_SHADOW', 'RUBBLE'), res);
    }
  }

  map.recomputeFlags({ keep: 0 });
  sealBorder(map, tid('PALISADE', 'STONE_WALL'));
  sweepStanding(map, 'bg-blackgate');
  openWarpTiles(map, 'bg-blackgate');
  map.spawn = { x: 28, y: 4 };
  map.entry = { ...map.spawn };
  map.level = 11;
  fillDeadPockets(map, 'bg-blackgate', 'PALISADE');

  prop(map, 24, 24, tid('SIGN', 'CRATE'), res);
  prop(map, 32, 24, tid('SIGN', 'CRATE'), res);
  addSign(map, 23, 38, 'BY ORDER OF THE FLAMING FIST — no arms drawn within the Old Wall. Writs presented at the gate. Toll two silver a head, four for a beast.');
  addSign(map, 24, 24, 'WEST: Sow’s Foot, and nothing in it worth your purse.\n\nEAST: Norchapel, Little Calimshan, the Twin Songs.\n\nSOUTH: the Black Dragon Gate.');
  addSign(map, 32, 24, 'BLACKGATE CARAVAN YARDS. Feed, wheelwright, wainwright. Beasts left overnight at the owner’s risk and the Fist’s discretion.');
  addSign(map, 28, 39, 'THE BLACK DRAGON GATE. Above the arch a dragon of black stone stoops on the road, wings folded, and has done since before the Old Wall was old.');
  return map;
}

// --- Norchapel: chapels turned tenements, and Whitkeep beyond ---------------
function buildNorchapel(root) {
  const map = new TileMap({
    w: 48, h: 40, id: 'bg-norchapel', name: 'Norchapel', biome: 'city',
    indoor: false, music: 'city', safe: true, encounterRate: 0, region: 'baldurs-gate',
  });
  const res = reservedFor('bg-norchapel');
  const rg = root.fork('ground'), rd = root.fork('detail');
  const dirt = table(G_DIRT), lane = table(G_LANE), junk = table(OUTER_JUNK);

  grect(map, 0, 0, 48, 40, tid('DIRT', 'GRAVEL'));

  // The chapels: tall, narrow, stone-walled, gabled — and every one of them cut
  // up inside into rooms let by the tenday. The gable and the stone are the
  // tell; nothing else out here has either, because nothing else out here was
  // built to be looked at.
  const chapel = (x, y, w, h, o = {}) => building(map, {
    x, y, w, h, wall: 'STONE_WALL', roof: 'thatch', base: 'DIRT',
    roofRows: 3, peak: (w >> 1),
    roofPatch: o.patch || [[1, 1], [w - 2, 1], [2, 2]],
    windows: o.win || [1, w - 2], upper: o.up || [w >> 1], band: o.band,
    sign: o.sign, door: null, lit: o.lit,
  }, res);
  chapel(4, 6, 7, 8, { band: 4, lit: true });
  chapel(13, 5, 6, 9, { band: 5 });
  chapel(31, 6, 7, 8, { band: 4, lit: true });
  chapel(40, 5, 6, 9, { band: 5 });
  chapel(4, 24, 6, 8, { band: 4 });
  chapel(12, 25, 7, 7, { band: 4, lit: true });
  chapel(31, 25, 6, 7, { band: 4 });
  chapel(39, 24, 7, 8, { band: 5, lit: true });

  // The twentieth chapel, which is a stable now and has been for thirty years.
  building(map, {
    x: 20, y: 4, w: 9, h: 8, wall: 'STONE_WALL', roof: 'thatch', base: 'DIRT',
    roofRows: 4, peak: 4, roofPatch: [[1, 2], [7, 2], [4, 3]],
    windows: [1, 7], loading: [4], sign: 2, door: null,
  }, res);

  // Whitkeep's terrace across the lane: low, long, leaning, and wattle.
  for (const [x, y, w, h] of [[3, 15, 7, 4], [11, 16, 5, 3], [33, 15, 7, 4], [41, 16, 5, 3]]) {
    building(map, {
      x, y, w, h, wall: 'WATTLE_WALL', roof: 'thatch', base: 'DIRT',
      roofRows: 1, roofPatch: [[1, 0]], windows: [1, w - 2], door: null,
    }, res);
  }

  // --- the ground, in blocks ------------------------------------------------
  repave(map, rg, 0, 0, 48, 40, dirt);
  grect(map, 20, 13, 9, 5, tid('MUD', 'DIRT'));         // the stable yard
  grect(map, 32, 18, 6, 5, tid('GRAVEL', 'DIRT'));      // the standing at the well

  for (let y = 19; y <= 21; y++) for (let x = 1; x <= 46; x++) floor(map, x, y, pickT(rg, lane));
  for (let x = 23; x <= 25; x++) for (let y = 12; y <= 38; y++) floor(map, x, y, pickT(rg, lane));
  for (let y = 2; y <= 3; y++) for (let x = 4; x <= 44; x++) floor(map, x, y, pickT(rg, lane));
  for (let y = 33; y <= 34; y++) for (let x = 4; x <= 44; x++) floor(map, x, y, pickT(rg, lane));
  for (let x = 17; x <= 18; x++) for (let y = 2; y <= 19; y++) floor(map, x, y, pickT(rg, lane));
  for (let x = 29; x <= 30; x++) for (let y = 2; y <= 19; y++) floor(map, x, y, pickT(rg, lane));
  for (let x = 10; x <= 11; x++) for (let y = 21; y <= 34; y++) floor(map, x, y, pickT(rg, lane));
  for (let x = 37; x <= 38; x++) for (let y = 21; y <= 34; y++) floor(map, x, y, pickT(rg, lane));

  fenceRect(map, 20, 13, 9, 5, { x: 24, y: 13 }, res);
  prop(map, 21, 15, tid('SACK', 'CRATE'), res);
  prop(map, 27, 15, tid('BARREL', 'CRATE'), res);
  prop(map, 34, 20, tid('WELL', 'FOUNTAIN'), res);
  prop(map, 34, 22, tid('CART', 'CRATE'), res);

  // Washing strung between the chapel gables, on the plane you walk under.
  for (const [x0, x1, y] of [[11, 16, 15], [37, 40, 15], [10, 16, 33], [37, 41, 33]]) washingLine(map, x0, y, x1, rd);

  scatter(map, rd, 2, 2, 44, 36, junk, 0.035, res);
  for (let y = 2; y <= 37; y++) {
    for (let x = 2; x <= 45; x++) {
      if (map.deco[y * map.w + x]) continue;
      if (rd.chance(0.03)) prop(map, x, y, tid('PROP_SHADOW', 'RUBBLE'), res);
    }
  }

  map.recomputeFlags({ keep: 0 });
  sealBorder(map, tid('PALISADE', 'STONE_WALL'));
  sweepStanding(map, 'bg-norchapel');
  openWarpTiles(map, 'bg-norchapel');
  map.spawn = { x: 4, y: 20 };
  map.entry = { ...map.spawn };
  map.level = 11;
  fillDeadPockets(map, 'bg-norchapel', 'PALISADE');

  prop(map, 21, 22, tid('SIGN', 'CRATE'), res);
  prop(map, 13, 22, tid('SIGN', 'CRATE'), res);
  prop(map, 30, 11, tid('SIGN', 'CRATE'), res);
  addSign(map, 21, 22, 'NORCHAPEL. Twenty chapels were raised here and nineteen let out as lodgings within the century. The twentieth is a stable, and the horses have the best of it.');
  addSign(map, 13, 22, 'WHITKEEP — the terrace beyond the lane. STONYEYES lies north of it, past the quarry pits. Neither is worth a detour and both will take one.');
  addSign(map, 30, 11, 'HAY AND STABLING. Beasts fed, shod and watched. Enquire within, and mind the step — it was an altar.');
  return map;
}

// --- Little Calimshan: awnings, spice, and the Basilisk Gate ----------------
function buildLittleCalimshan(root) {
  const map = new TileMap({
    w: 48, h: 42, id: 'bg-little-calimshan', name: 'Little Calimshan', biome: 'city',
    indoor: false, music: 'market', safe: true, encounterRate: 0, region: 'baldurs-gate',
  });
  const res = reservedFor('bg-little-calimshan');
  const rg = root.fork('ground'), rd = root.fork('detail');
  const sand = table(G_SAND), street = table(G_YARD);

  grect(map, 0, 0, 48, 42, tid('SAND', 'DIRT'));

  // The bazaar's frontages: close-packed, flat-fronted, hung with cloth.
  const stallhouse = (x, y, w, h, o = {}) => building(map, {
    x, y, w, h, wall: o.wall || 'WATTLE_WALL', roof: 'thatch', base: 'SAND',
    roofRows: Math.max(1, Math.min(2, h - 3)), roofPatch: o.patch || [[1, 0], [w - 2, 0]],
    windows: o.win || [1, w - 2], sign: o.sign, door: null, lit: o.lit, band: o.band,
  }, res);
  // The south row stops short of x=17: the shrine's forecourt and the lane that
  // runs round it to the Tumbledown gate both live between here and x=31.
  for (const [x, y, w, h] of [[6, 7, 7, 6], [14, 8, 5, 5], [30, 7, 7, 6], [38, 8, 5, 5],
    [6, 16, 5, 4], [13, 16, 5, 4], [31, 16, 5, 4], [39, 16, 5, 4],
    [6, 31, 6, 5], [12, 32, 4, 4], [32, 31, 6, 5], [39, 32, 4, 4]]) stallhouse(x, y, w, h);

  // Zasheida Pashar's warehouse, and Khemed's coffee house across the way.
  stallhouse(7, 23, 9, 6, { wall: 'LOG_WALL', sign: 3, lit: true, band: 3, patch: [[2, 1], [7, 1]], win: [1, 7] });
  stallhouse(32, 23, 9, 6, { wall: 'LOG_WALL', sign: 5, lit: true, band: 3, patch: [[1, 1], [6, 1]], win: [1, 7] });

  // The domed shrine to Ilmater and Sharess at the bazaar's south end: a gable,
  // a colonnade and an unmistakable silhouette in a district of flat roofs.
  //
  // IT STOPS AT y=37, AND THAT IS LOAD-BEARING. The gate to Tumbledown is at
  // (24,40) with its landing at (24,38); a shrine standing on y 34–39 puts its
  // own back wall across both, and the colonnade in front of it turns the last
  // lane into a row of sealed cells. Shrine, forecourt, lane, gate — in that
  // order, north to south, with nothing solid spanning the last three rows.
  building(map, {
    x: 18, y: 32, w: 12, h: 6, wall: 'STONE_WALL', roof: 'shingle', base: 'FLAGSTONE',
    roofRows: 3, peak: 6, windows: [1, 10], upper: [3, 8], sign: 2, door: null,
  }, res);

  // --- the ground, in blocks ------------------------------------------------
  repave(map, rg, 0, 0, 48, 42, sand);
  grect(map, 17, 38, 14, 3, tid('FLAGSTONE', 'SAND'));   // the shrine forecourt
  // The bazaar's spine stops at the shrine steps; `floor()` sweeps the over
  // plane as well, so running it any further south would shave the gable off.
  for (let x = 21; x <= 27; x++) for (let y = 1; y <= 31; y++) floor(map, x, y, pickT(rg, street));
  for (let y = 21; y <= 23; y++) for (let x = 1; x <= 46; x++) floor(map, x, y, pickT(rg, street));
  for (let y = 14; y <= 15; y++) for (let x = 4; x <= 44; x++) floor(map, x, y, pickT(rg, street));
  for (let y = 29; y <= 30; y++) for (let x = 4; x <= 44; x++) floor(map, x, y, pickT(rg, street));
  for (let x = 21; x <= 27; x++) for (let y = 40; y <= 41; y++) floor(map, x, y, pickT(rg, street));
  for (let x = 16; x <= 17; x++) for (let y = 30; y <= 41; y++) floor(map, x, y, pickT(rg, street));
  for (let x = 30; x <= 31; x++) for (let y = 30; y <= 41; y++) floor(map, x, y, pickT(rg, street));
  for (let y = 39; y <= 41; y++) for (let x = 16; x <= 31; x++) floor(map, x, y, pickT(rg, street));
  for (let x = 4; x <= 5; x++) for (let y = 6; y <= 36; y++) floor(map, x, y, pickT(rg, street));
  for (let x = 44; x <= 45; x++) for (let y = 6; y <= 36; y++) floor(map, x, y, pickT(rg, street));
  for (let y = 5; y <= 6; y++) for (let x = 4; x <= 45; x++) floor(map, x, y, pickT(rg, street));
  for (let y = 36; y <= 37; y++) for (let x = 4; x <= 45; x++) floor(map, x, y, pickT(rg, street));
  // The colonnade stands against the shrine's own front, not across the lane, and
  // it opens in the middle: (24,38) is where Tumbledown puts you down.
  for (const x of [18, 20, 22, 26, 28, 30]) prop(map, x, 38, tid('PILLAR', 'STONE_WALL'), res);

  // AWNINGS. Cloth strung frontage to frontage on the `over` plane, so the party
  // walks under shade and the district reads dark from above — the one trick
  // that makes Little Calimshan legible from a thumbnail.
  // Real AWNING now, not THATCH_M: the roof tile was solid-flagged canvas, so
  // `_drawOverhangs` dropped a house's shadow onto an open bazaar lane.
  for (let y = 4; y <= 28; y += 4) awning(map, 20, y, 9);
  for (const [x0, x1, y] of [[6, 12, 14], [36, 43, 14], [6, 12, 29], [36, 43, 29]]) awning(map, x0, y, x1 - x0 + 1);

  // Stalls down both sides of the spine, every other tile, canvas over the aisle.
  const wares = table([['SHELF_GOODS', 6], ['CRATE', 5], ['SACK', 5], ['BARREL', 3], ['CART', 2]]);
  for (const [sx, face] of [[21, 1], [27, -1]]) {
    stallRow(map, sx, 5, 8, 'v', rd, { step: 2, face, res, wares, banner: true });
    stallRow(map, sx, 25, 4, 'v', rd, { step: 2, face, res, wares });
  }
  for (const [x, y] of [[19, 20], [29, 20], [19, 24], [29, 24]]) prop(map, x, y, tid('BRAZIER', 'TORCH'), res);
  for (const [x, y] of [[20, 12], [28, 12], [20, 33], [28, 33]]) prop(map, x, y, tid('CANDLE', 'TORCH'), res);
  prop(map, 24, 19, tid('FOUNTAIN', 'WELL'), res);
  scatter(map, rd, 2, 2, 44, 38, table([['SACK', 5], ['BARREL', 4], ['CRATE', 4], ['CACTUS', 1]]), 0.025, res);

  // --- the Basilisk Gate, in the Lower City's wall on the western edge -------
  drect(map, 1, 1, 3, 40, tid('STONE_WALL', 'BRICK_WALL'));
  for (let y = 1; y < 41; y++) dset(map, 3, y, tid('WALL_TOP_SHADE', 'STONE_WALL'));
  for (let x = 1; x <= 3; x++) floor(map, x, 22, tid('FLAGSTONE', 'COBBLE'));
  prop(map, 6, 20, tid('STATUE', 'PILLAR'), res);
  prop(map, 6, 24, tid('STATUE', 'PILLAR'), res);
  prop(map, 4, 20, tid('TORCH', 'CANDLE'), res);
  prop(map, 4, 24, tid('TORCH', 'CANDLE'), res);
  prop(map, 7, 25, tid('BENCH', 'CRATE'), res);

  map.recomputeFlags({ keep: 0 });
  sealBorder(map, tid('PALISADE', 'STONE_WALL'));
  sweepStanding(map, 'bg-little-calimshan');
  openWarpTiles(map, 'bg-little-calimshan');
  map.spawn = { x: 24, y: 4 };
  map.entry = { ...map.spawn };
  map.level = 11;
  fillDeadPockets(map, 'bg-little-calimshan', 'PALISADE');

  prop(map, 8, 22, tid('SIGN', 'CRATE'), res);
  prop(map, 24, 26, tid('SIGN', 'CRATE'), res);
  prop(map, 17, 39, tid('SIGN', 'CRATE'), res);
  addSign(map, 8, 22, 'THE BASILISK GATE. Two basilisks of grey stone crouch on the towers, and the toll queue backs up through the arch from dawn to dusk. Eastway lies beyond.');
  addSign(map, 24, 26, 'LITTLE CALIMSHAN. Saffron, cassia, pepper long and black, silk out of Memnon, coffee out of Calimport. Prices in the shade; conversation free.');
  addSign(map, 17, 39, 'The shrine keeps two doors: Ilmater’s on the north for the broken, Sharess’ on the south for everyone else. The same priests sweep both.\n\nThe lane runs round it either side to the Tumbledown gate.');
  return map;
}

// --- Tumbledown: the burying ground outside the Cliffgate -------------------
function buildTumbledown(root) {
  const map = new TileMap({
    w: 44, h: 38, id: 'bg-tumbledown', name: 'Tumbledown', biome: 'city',
    indoor: false, music: 'tense', safe: true, encounterRate: 0, region: 'baldurs-gate',
    ambient: { color: '#181a24', alpha: 0.12 },
  });
  const res = reservedFor('bg-tumbledown');
  const rg = root.fork('ground'), rd = root.fork('detail');
  const dirt = table(G_DIRT), path = table(G_YARD);

  grect(map, 0, 0, 44, 38, tid('DIRT', 'GRAVEL'));

  // Mausolea: small, squat, shut with iron, and nobody has the key any more.
  const mausoleum = (x, y, w, h) => building(map, {
    x, y, w, h, wall: 'STONE_WALL', roof: 'tile', base: 'GRAVEL', roofRows: 2,
    peak: (w >> 1), door: (w >> 1), iron: true, windows: [], approach: 1,
  }, res);
  mausoleum(5, 12, 5, 5);
  mausoleum(15, 11, 5, 5);
  mausoleum(34, 12, 5, 5);
  mausoleum(5, 28, 5, 5);
  mausoleum(34, 28, 5, 5);
  mausoleum(25, 32, 5, 5);

  // The gravewarden's lodge — the only lit window in the district.
  building(map, {
    x: 14, y: 26, w: 8, h: 6, wall: 'STONE_WALL', roof: 'shingle', base: 'GRAVEL',
    roofRows: 2, windows: [1, 6], upper: [3], sign: 5, door: null, lit: true, chimney: 6,
  }, res);

  repave(map, rg, 0, 0, 44, 38, dirt);

  // --- the paths ------------------------------------------------------------
  for (let x = 21; x <= 23; x++) for (let y = 1; y <= 36; y++) floor(map, x, y, pickT(rg, path));
  for (let y = 19; y <= 21; y++) for (let x = 1; x <= 22; x++) floor(map, x, y, pickT(rg, path));
  for (let y = 9; y <= 10; y++) for (let x = 8; x <= 40; x++) floor(map, x, y, pickT(rg, path));
  for (let y = 24; y <= 25; y++) for (let x = 5; x <= 40; x++) floor(map, x, y, pickT(rg, path));
  for (let x = 7; x <= 8; x++) for (let y = 9; y <= 24; y++) floor(map, x, y, pickT(rg, path));
  for (let x = 39; x <= 40; x++) for (let y = 9; y <= 33; y++) floor(map, x, y, pickT(rg, path));
  for (let y = 32; y <= 33; y++) for (let x = 5; x <= 40; x++) floor(map, x, y, pickT(rg, path));
  for (let x = 5; x <= 6; x++) for (let y = 24; y <= 33; y++) floor(map, x, y, pickT(rg, path));
  for (let x = 29; x <= 31; x++) for (let y = 21; y <= 26; y++) floor(map, x, y, pickT(rg, path));

  // --- the graves -----------------------------------------------------------
  // Rows, because a burying ground is the one part of the Outer City anybody
  // ever ruled a line across — and then thirty years of subsidence.
  for (let y = 12; y <= 22; y += 2) for (let x = 25; x <= 37; x += 2) if (rd.chance(0.86)) prop(map, x, y, tid('GRAVESTONE', 'ROCK'), res);
  for (let y = 28; y <= 34; y += 2) for (let x = 11; x <= 19; x += 2) if (rd.chance(0.8)) prop(map, x, y, tid('GRAVESTONE', 'ROCK'), res);
  for (let y = 3; y <= 7; y += 2) for (let x = 11; x <= 35; x += 2) if (rd.chance(0.75)) prop(map, x, y, tid('GRAVESTONE', 'ROCK'), res);
  for (const [x, y] of [[27, 27], [33, 21], [17, 6], [11, 20], [26, 5]]) prop(map, x, y, tid('TOMB', 'GRAVESTONE'), res);
  for (const [x, y] of [[29, 13], [13, 32], [37, 20]]) prop(map, x, y, tid('SARCOPHAGUS', 'TOMB'), res);
  for (const [x, y] of [[12, 14], [19, 15], [27, 30], [36, 34], [3, 21], [41, 6]]) prop(map, x, y, tid('DEAD_TREE', 'STUMP'), res);
  for (const [x, y] of [[24, 15], [24, 28], [32, 8], [14, 23]]) prop(map, x, y, tid('STATUE', 'GRAVESTONE'), res);
  for (let x = 11; x <= 35; x += 3) { prop(map, x, 11, tid('HEDGE', 'BUSH'), res); prop(map, x, 27, tid('HEDGE', 'BUSH'), res); }
  scatter(map, rd, 2, 2, 40, 34, table([['BONES', 5], ['RUBBLE', 4], ['ROCK', 3], ['STUMP', 2]]), 0.045, res);

  // --- the crypt stair ------------------------------------------------------
  floor(map, 30, 24, tid('STAIRS_DOWN', 'PIT'));
  prop(map, 29, 23, tid('PILLAR', 'STONE_WALL'), res);
  prop(map, 31, 23, tid('PILLAR', 'STONE_WALL'), res);
  prop(map, 30, 22, tid('SKULL_PILE', 'BONES'), res);

  // --- the Cliffgate, in the Lower City wall at the north-west --------------
  drect(map, 1, 6, 16, 3, tid('STONE_WALL', 'BRICK_WALL'));
  for (let x = 1; x <= 16; x++) dset(map, x, 8, tid('WALL_TOP_SHADE', 'STONE_WALL'));
  floor(map, 8, 8, tid('FLAGSTONE', 'COBBLE'));
  floor(map, 8, 9, tid('FLAGSTONE', 'COBBLE'));
  dset(map, 7, 8, tid('PILLAR', 'STONE_WALL'));
  dset(map, 9, 8, tid('PILLAR', 'STONE_WALL'));
  prop(map, 6, 10, tid('TORCH', 'CANDLE'), res);
  prop(map, 10, 10, tid('TORCH', 'CANDLE'), res);
  for (let y = 9; y <= 20; y++) for (let x = 7; x <= 9; x++) floor(map, x, y, pickT(rg, path));

  map.recomputeFlags({ keep: 0 });
  sealBorder(map, tid('STONE_FENCE', 'STONE_WALL'));
  sweepStanding(map, 'bg-tumbledown');
  openWarpTiles(map, 'bg-tumbledown');
  map.spawn = { x: 22, y: 4 };
  map.entry = { ...map.spawn };
  map.level = 11;
  fillDeadPockets(map, 'bg-tumbledown', 'STONE_FENCE');

  prop(map, 20, 24, tid('SIGN', 'ROCK'), res);
  prop(map, 11, 10, tid('SIGN', 'ROCK'), res);
  prop(map, 20, 29, tid('SIGN', 'ROCK'), res);
  addSign(map, 20, 24, 'TUMBLEDOWN. The city buries here because the city cannot bury inside its walls. Kelemvor keeps the register; the Gravewarden keeps the register honest, when he can.');
  addSign(map, 11, 10, 'THE CLIFFGATE. Heapside lies through the arch and up the stair. Coffins out, mourners back — and the Watch counts both.');
  // THE WAY DOWN, STAMPED BY HAND. `applyWarpNodes` only lays the triggers for
  // links whose far side declares a landing tile, and a procedural floor has no
  // coordinates to declare until its generator has run — so the row that opens
  // the crypts (`bWarp: null`) gives this map nothing at all, and the stair tile
  // under the yew would be scenery for ever. The crypts' own builder rewires
  // their up-stair back to (30,25); this is the other half of that pair.
  map.addTrigger({
    id: 'tumbledown-crypt-stair', kind: 'warp', x: 30, y: 24,
    data: { map: 'tumbledown-crypts', depth: 1, theme: 'crypt', dir: 'down', kind: 'stairs' },
  });
  addSign(map, 20, 29, 'A stair drops into the crypts under the hill. The iron door at the bottom stands open, which it should not.');
  return map;
}

// --- Sow's Foot: the slum, and the Guild's real address ---------------------
function buildSowsFoot(root) {
  const map = new TileMap({
    w: 44, h: 40, id: 'bg-sows-foot', name: "Sow's Foot", biome: 'city',
    indoor: false, music: 'tense', safe: true, encounterRate: 0, region: 'baldurs-gate',
    ambient: { color: '#1c1710', alpha: 0.12 },
  });
  const res = reservedFor('bg-sows-foot');
  const rg = root.fork('ground'), rd = root.fork('detail');
  const mire = table(G_MIRE), lane = table(G_LANE);

  // The whole district is a quagmire and the lanes are the only hard going.
  // MUD is SLOW; DIRT_PATH is not, which is the entire mechanical joke.
  grect(map, 0, 0, 44, 40, tid('MUD', 'DIRT'));

  // NO STREET PLAN, BECAUSE NOBODY EVER DREW ONE — and a hand-written table of
  // hut corners cannot say that, because a person writing coordinates reaches
  // for round numbers and lays out a lattice without meaning to. So the warren
  // is GROWN instead of listed: the four lanes that genuinely cross the district
  // are reserved first, and then huts are thrown at whatever mud is left, at
  // whatever size fits, until the throwing stops working. Nothing lines up,
  // nothing shares a frontage, and the "streets" of Sow's Foot are the one-tile
  // misses between one man's wall and the next man's.
  //
  // It is deterministic: `rd` is forked from the world seed, so this is the same
  // warren every session. It is bounded: `taken` refuses any footprint that
  // touches a lane, a hut or the tile of clear mud each hut owes its neighbour,
  // so no throw can wall a quarter off. And the count is a budget, not a target
  // — the district fills up and the last dozen throws simply fail.
  const W = map.w, H = map.h;
  const taken = new Uint8Array(W * H);
  const block = (x, y, w, h) => {
    for (let j = y; j < y + h; j++) {
      for (let i = x; i < x + w; i++) if (i >= 0 && j >= 0 && i < W && j < H) taken[j * W + i] = 1;
    }
  };
  // Only TWO things are reserved before building starts, and both are reserved
  // because a warp sits on them: the lane east to Blackgate, and the lane south
  // to the Twin Songs. Everything else in Sow's Foot is residue.
  block(0, 0, W, 2); block(0, H - 2, W, 2); block(0, 0, 2, H); block(W - 2, 0, 2, H);
  block(0, 20, W, 3);
  block(21, 20, 3, H - 20);
  const fits = (x, y, w, h) => {
    if (x < 2 || y < 2 || x + w > W - 2 || y + h > H - 2) return false;
    for (let j = y - 1; j <= y + h; j++) {
      for (let i = x - 1; i <= x + w; i++) {
        if (i < 0 || j < 0 || i >= W || j >= H) continue;
        if (taken[j * W + i]) return false;
      }
    }
    return true;
  };
  const SLUM_WALLS = ['WATTLE_WALL', 'PALISADE', 'WATTLE_WALL', 'LOG_WALL', 'PALISADE'];
  let hutN = 0;
  const hut = (x, y, w, h, o = {}) => {
    building(map, {
      x, y, w, h, wall: o.wall || SLUM_WALLS[hutN++ % SLUM_WALLS.length],
      roof: 'thatch', base: 'MUD', roofRows: 1,
      roofPatch: o.patch || [[0, 0], [Math.max(1, w - 2), 0]],
      windows: o.win || [1], upper: h >= 5 ? [w - 2] : [], band: h >= 5 ? 2 : undefined,
      door: null, sign: o.sign, lit: o.lit,
    }, res);
    block(x, y, w, h);
  };
  // THE PACK. Courses of huts run roughly east to west because that is how a
  // man builds against the wind, but the course height, every hut's width, every
  // hut's depth, its offset within the course and the gap to the next one are
  // all rolled separately — so the frontages never line up, no two roofs are the
  // same length, and what is left over between them is the street. Where `fits`
  // refuses, the cursor simply shuffles on and the gap stays a gap.
  const rh = root.fork('huts');
  const raise = (x, y, w, h) => {
    // One in eight is a leaning shell nobody has lived in since the flood.
    if (rh.chance(0.12)) {
      shell(map, {
        x, y, w, h, wall: 'PALISADE', roof: 'thatch', base: 'MUD', roofRows: 1,
        roofPatch: [[0, 0], [Math.max(1, w - 2), 0]], windows: [1],
      }, res);
      block(x, y, w, h);
    } else hut(x, y, w, h);
  };
  const courses = (y0, wLo, wHi, hLo, hHi) => {
    for (let y = y0; y < H - 3;) {
      const course = rh.int(hLo, hHi);
      let x = 2 + rh.int(0, 3);
      while (x < W - 4) {
        const w = rh.int(wLo, wHi), h = rh.int(hLo, course + 1), yy = y + rh.int(0, 1);
        if (fits(x, yy, w, h)) { raise(x, yy, w, h); x += w + rh.int(1, 2); }
        else x += rh.int(1, 3);
      }
      y += course + rh.int(1, 2);
    }
  };
  // THREE PASSES, AND THE LAST TWO ARE WHY IT LOOKS LIVED IN. One course of
  // full-sized huts sets the grain; a second, started at a different row with
  // different proportions, builds into the gaps the first left; and a scatter of
  // three-tile sheds fills whatever is still standing empty. Each pass can only
  // build where `fits` still says yes, so the district silts up the way a real
  // one does — densest where it was settled first, ragged at the edges.
  courses(2, 3, 6, 3, 5);
  courses(4, 3, 5, 3, 4);
  for (let i = 0; i < 160; i++) {
    const x = rh.int(2, W - 5), y = rh.int(2, H - 5);
    if (fits(x, y, 3, 3)) raise(x, y, 3, 3);
  }
  // Brem's market shed, and the door with no sign on it — the one address in
  // Baldur's Gate the Guild answers to. Both are placed AFTER the warren and
  // over the top of it, because these two are the reason anyone comes here.
  hut(9, 17, 6, 3, { wall: 'LOG_WALL', sign: 4, lit: true, win: [1], patch: [[2, 0]] });
  hut(25, 15, 6, 4, { wall: 'LOG_WALL', sign: 4, lit: true, win: [1, 4], patch: [[1, 0], [4, 0]] });

  // --- the two lanes, such as they are --------------------------------------
  // DIRT_PATH only where somebody's cart goes. Everything else stays MUD, which
  // is SLOW, and that is the whole mechanical joke of the district: the fastest
  // way across Sow's Foot is the long way round by the lane. The gaps between
  // the huts are streets too, but they are streets of mud and they know it.
  repave(map, rg, 0, 0, 44, 40, mire);
  for (let y = 20; y <= 22; y++) for (let x = 1; x <= 42; x++) floor(map, x, y, pickT(rg, lane));
  for (let x = 21; x <= 23; x++) for (let y = 20; y <= 38; y++) floor(map, x, y, pickT(rg, lane));
  for (let x = 1; x <= 42; x++) { floor(map, x, 1, pickT(rg, lane)); floor(map, x, 38, pickT(rg, lane)); }
  for (let y = 1; y <= 38; y++) { floor(map, 1, y, pickT(rg, lane)); floor(map, 42, y, pickT(rg, lane)); }

  // --- refuse, puddles, and the district's one shared well -------------------
  prop(map, 25, 21, tid('WELL', 'FOUNTAIN'), res);
  prop(map, 19, 21, tid('BRAZIER', 'TORCH'), res);
  for (const [x, y] of [[7, 21], [34, 21], [22, 26], [22, 33]]) prop(map, x, y, tid('CART', 'CRATE'), res);
  scatter(map, rd, 1, 1, 42, 38, table([['SACK', 6], ['RUBBLE', 5], ['BARREL', 4], ['CRATE', 3], ['DEAD_TREE', 2], ['STUMP', 2], ['BONES', 1]]), 0.05, res);
  for (let y = 1; y <= 38; y++) {
    for (let x = 1; x <= 42; x++) {
      if (map.deco[y * map.w + x]) continue;
      if (rd.chance(0.035)) prop(map, x, y, tid('PROP_SHADOW', 'RUBBLE'), res);
    }
  }
  // Sailcloth and sacking pitched over the lane for whatever shelter it gives.
  for (const [x0, x1, y] of [[3, 7, 21], [12, 18, 20], [27, 33, 22], [37, 41, 21], [21, 23, 30]]) awning(map, x0, y, x1 - x0 + 1);

  map.recomputeFlags({ keep: 0 });
  sealBorder(map, tid('PALISADE', 'STONE_WALL'));
  sweepStanding(map, 'bg-sows-foot');
  openWarpTiles(map, 'bg-sows-foot');
  map.spawn = { x: 40, y: 22 };
  map.entry = { ...map.spawn };
  map.level = 11;
  fillDeadPockets(map, 'bg-sows-foot', 'PALISADE');

  prop(map, 24, 24, tid('SIGN', 'CRATE'), res);
  prop(map, 20, 14, tid('SIGN', 'CRATE'), res);
  addSign(map, 24, 24, 'SOW’S FOOT. The Fist patrols the lane and nothing else. What law there is here is bought from the Guild by the tenday, and it is cheaper and more reliable than the other kind.');
  addSign(map, 20, 14, 'A door with no sign, in a wall with no windows, on a lane with no name. Somebody has swept the step. Nothing else in the district has been swept in a year.');
  return map;
}

// --- The Twin Songs: every god legal, side by side --------------------------
function buildTwinSongs(root) {
  const map = new TileMap({
    w: 48, h: 42, id: 'bg-twin-songs', name: 'The Twin Songs', biome: 'city',
    indoor: false, music: 'temple', safe: true, encounterRate: 0, region: 'baldurs-gate',
  });
  const res = reservedFor('bg-twin-songs');
  const rg = root.fork('ground'), rd = root.fork('detail');
  const dirt = table(G_DIRT), way = table(G_FLAG), path = table(G_YARD);

  grect(map, 0, 0, 48, 42, tid('DIRT', 'GRAVEL'));

  // Six shrines down one avenue, and not one of them the same shape. The whole
  // district is an argument about roofs, conducted in public and in stone.
  const shrine = (x, y, w, h, o) => building(map, {
    x, y, w, h, base: 'FLAGSTONE', door: null, approach: 1,
    wall: o.wall, roof: o.roof, roofRows: o.rows != null ? o.rows : 2,
    peak: o.peak, windows: o.win || [1, w - 2], upper: o.up, sign: o.sign,
    lit: o.lit, chimney: o.chimney, roofPatch: o.patch, band: o.band,
  }, res);
  // west side, north to south: Lathander, Tymora, Kelemvor
  shrine(12, 5, 8, 6, { wall: 'STONE_WALL', roof: 'shingle', rows: 3, peak: 4, up: [2, 5], sign: 6, lit: true });
  shrine(12, 17, 8, 5, { wall: 'BRICK_WALL', roof: 'tile', rows: 2, sign: 6, lit: true });
  shrine(12, 29, 8, 6, { wall: 'STONE_WALL', roof: 'tile', rows: 3, peak: 4, up: [3], sign: 6 });
  // east side, north to south: Gond, Eldath, Myrkul
  shrine(29, 5, 8, 6, { wall: 'STONE_WALL', roof: 'tile', rows: 2, chimney: 6, sign: 1, up: [3, 5], band: 3 });
  shrine(29, 17, 8, 5, { wall: 'WATTLE_WALL', roof: 'thatch', rows: 2, sign: 1, patch: [[2, 1]] });
  shrine(29, 29, 8, 6, { wall: 'STONE_WALL', roof: 'thatch', rows: 3, peak: 4, sign: 1, patch: [[1, 1], [6, 1], [2, 2]] });

  // The pilgrim hostel at the avenue's south end, where the road to Beregost
  // and Candlekeep is organised by people who have walked it.
  building(map, {
    x: 19, y: 34, w: 10, h: 6, wall: 'LOG_WALL', roof: 'thatch', base: 'FLAGSTONE',
    roofRows: 2, roofPatch: [[2, 1], [7, 1]], windows: [1, 8], upper: [3, 6],
    band: 3, sign: 5, door: null, lit: true, chimney: 8,
  }, res);

  // --- the ground -----------------------------------------------------------
  repave(map, rg, 0, 0, 48, 42, dirt);
  // The avenue is the one thing in the Outer City that was paid for.
  for (let x = 21; x <= 27; x++) for (let y = 1; y <= 40; y++) floor(map, x, y, pickT(rg, way));
  floorRect(map, 20, 11, 9, 1, tid('MOSAIC', 'FLAGSTONE'));
  floorRect(map, 20, 26, 9, 1, tid('MOSAIC', 'FLAGSTONE'));
  for (let y = 19; y <= 21; y++) for (let x = 1; x <= 46; x++) floor(map, x, y, pickT(rg, path));
  for (let y = 12; y <= 13; y++) for (let x = 6; x <= 42; x++) floor(map, x, y, pickT(rg, path));
  for (let y = 27; y <= 28; y++) for (let x = 6; x <= 42; x++) floor(map, x, y, pickT(rg, path));
  for (let x = 6; x <= 7; x++) for (let y = 4; y <= 33; y++) floor(map, x, y, pickT(rg, path));
  for (let x = 41; x <= 42; x++) for (let y = 4; y <= 33; y++) floor(map, x, y, pickT(rg, path));
  for (let y = 3; y <= 4; y++) for (let x = 6; x <= 42; x++) floor(map, x, y, pickT(rg, path));
  for (let y = 32; y <= 33; y++) for (let x = 6; x <= 42; x++) floor(map, x, y, pickT(rg, path));

  // --- what stands in front of each door ------------------------------------
  // Lathander: the altar catches the first light and the candles are relit at
  // dawn whether anybody came or not.
  prop(map, 14, 12, tid('ALTAR', 'SHRINE'), res);
  prop(map, 13, 12, tid('CANDLE', 'TORCH'), res);
  prop(map, 15, 12, tid('CANDLE', 'TORCH'), res);
  // Tymora: coin in the fountain, and a statue with a worn thumb.
  prop(map, 14, 23, tid('FOUNTAIN', 'WELL'), res);
  prop(map, 17, 23, tid('STATUE', 'PILLAR'), res);
  // Kelemvor: one tomb, no ornament, and a queue that never comes twice.
  prop(map, 15, 36, tid('TOMB', 'GRAVESTONE'), res);
  prop(map, 13, 36, tid('GRAVESTONE', 'ROCK'), res);
  // Gond: the anvil is the altar. It is also in use.
  prop(map, 31, 12, tid('ANVIL', 'FORGE'), res);
  prop(map, 34, 12, tid('GRINDSTONE', 'ANVIL'), res);
  // Eldath: a still basin, reeds, and the only quiet in the district.
  floorRect(map, 32, 23, 2, 2, tid('WATER', 'SWAMP_WATER'));
  prop(map, 31, 23, tid('REEDS', 'CATTAILS'), res);
  prop(map, 34, 24, tid('CATTAILS', 'REEDS'), res);
  prop(map, 30, 24, tid('SHRINE', 'ALTAR'), res);
  // Myrkul: legal, tolerated, and watched from the bench opposite all day.
  prop(map, 31, 36, tid('BRAZIER', 'TORCH'), res);
  prop(map, 34, 36, tid('SKULL_PILE', 'BONES'), res);
  prop(map, 29, 36, tid('SHRINE', 'ALTAR'), res);
  prop(map, 29, 38, tid('BENCH', 'CRATE'), res);

  // Pilgrim camp: benches down the avenue, oaks, and canvas over the verges.
  for (let y = 7; y <= 37; y += 5) { prop(map, 20, y, tid('BENCH', 'CRATE'), res); prop(map, 28, y, tid('BENCH', 'CRATE'), res); }
  bigOak(map, 9, 15); bigOak(map, 38, 15); bigOak(map, 9, 24); bigOak(map, 38, 24);
  for (const [x0, x1, y] of [[8, 12, 8], [36, 40, 8], [8, 12, 31], [36, 40, 31]]) awning(map, x0, y, x1 - x0 + 1);
  for (const [x, y] of [[21, 10], [27, 10], [21, 30], [27, 30]]) prop(map, x, y, tid('BRAZIER', 'TORCH'), res);
  scatter(map, rd, 2, 2, 44, 38, table([['BUSH', 4], ['HEDGE', 3], ['BARREL', 2], ['SACK', 2], ['CANDLE', 2]]), 0.028, res);

  map.recomputeFlags({ keep: 0 });
  sealBorder(map, tid('STONE_FENCE', 'STONE_WALL'));
  sweepStanding(map, 'bg-twin-songs');
  openWarpTiles(map, 'bg-twin-songs');
  map.spawn = { x: 24, y: 4 };
  map.entry = { ...map.spawn };
  map.level = 11;
  fillDeadPockets(map, 'bg-twin-songs', 'STONE_FENCE');

  prop(map, 24, 16, tid('SIGN', 'ROCK'), res);
  prop(map, 24, 25, tid('SIGN', 'ROCK'), res);
  prop(map, 19, 33, tid('SIGN', 'ROCK'), res);
  addSign(map, 24, 16, 'THE TWIN SONGS. Every god may be worshipped here and every god is. The city took a hard look at the alternative some centuries ago and did not care for it.');
  addSign(map, 24, 25, 'Lathander, Tymora and Kelemvor to the west. Gond, Eldath and Myrkul to the east. Do not put your offering in the wrong bowl; the priests will not give it back.');
  addSign(map, 19, 33, 'PILGRIM ROAD SOUTH. Companies form at dawn for Wyrm’s Crossing, Rivington, the Friendly Arm and Beregost. Walk with a company or do not walk.');
  return map;
}

// --- Wyrm's Crossing: the double bridge, and the Fist's rock in the river ---
function buildWyrmsCrossing(root) {
  const map = new TileMap({
    w: 64, h: 26, id: 'bg-wyrms-crossing', name: "Wyrm's Crossing", biome: 'city',
    indoor: false, music: 'market', safe: true, encounterRate: 0, region: 'baldurs-gate',
  });
  const res = reservedFor('bg-wyrms-crossing');
  const rg = root.fork('ground'), rd = root.fork('detail');

  // --- the Chionthar --------------------------------------------------------
  // Deep water is solid, which is what stops the party wandering downstream; the
  // shallows along each bank are WATER, which is a wade and reads as one.
  grect(map, 0, 0, 64, 26, tid('WATER_DEEP', 'WATER'));
  for (let x = 0; x < 64; x++) { gset(map, x, 4, tid('WATER', 'WATER_DEEP')); gset(map, x, 21, tid('WATER', 'WATER_DEEP')); }
  grect(map, 0, 0, 64, 4, tid('DIRT', 'GRAVEL'));
  grect(map, 0, 22, 64, 4, tid('DIRT', 'GRAVEL'));

  // --- the crossing itself: bridge, rock, bridge ----------------------------
  grect(map, 25, 4, 15, 5, tid('BRIDGE_STONE', 'FLAGSTONE'));    // north span
  grect(map, 22, 9, 21, 9, tid('FLAGSTONE', 'BRIDGE_STONE'));    // Wyrm's Rock
  grect(map, 25, 18, 15, 4, tid('BRIDGE_STONE', 'FLAGSTONE'));   // south span
  grect(map, 29, 1, 7, 4, tid('BRIDGE_STONE', 'FLAGSTONE'));     // north abutment
  grect(map, 29, 21, 7, 4, tid('BRIDGE_STONE', 'FLAGSTONE'));    // south abutment

  // The fortress on the rock. Its door is the one warp off the bridge, the
  // roadway runs along its southern face, and a two-tile lane squeezes past each
  // shoulder — which is the whole of why the Fist can shut the Coast Way.
  building(map, {
    x: 27, y: 8, w: 11, h: 5, wall: 'STONE_WALL', roof: 'tile', base: 'FLAGSTONE',
    roofRows: 2, windows: [1, 9], upper: [2, 5, 8], door: 5, sign: 8,
    lit: true, approach: 1,
  }, res);
  grect(map, 30, 13, 5, 2, tid('FLAGSTONE', 'BRIDGE_STONE'));   // undo the beaten approach

  // Shacks and stalls built out over both parapets, which is why the crossing is
  // a district and not a road. Wattle and patched thatch, over open water.
  const bridgeShack = (x, y, w, h) => building(map, {
    x, y, w, h, wall: 'WATTLE_WALL', roof: 'thatch', base: 'BRIDGE_STONE',
    roofRows: Math.max(1, h - 2), roofPatch: [[0, 0], [Math.max(1, w - 2), 0]],
    windows: [1], door: null,
  }, res);
  bridgeShack(25, 4, 4, 3); bridgeShack(36, 4, 4, 3);
  bridgeShack(25, 18, 4, 3); bridgeShack(36, 18, 4, 3);

  // Railings run down the rock's two water-facing edges only — never across a
  // span, where they would close the lane the whole crossing depends on.
  for (let y = 9; y <= 17; y++) { prop(map, 22, y, tid('FENCE_V', 'FENCE_H'), res); prop(map, 42, y, tid('FENCE_V', 'FENCE_H'), res); }
  for (const x of [23, 41]) { prop(map, x, 10, tid('PILLAR', 'STONE_WALL'), res); prop(map, x, 16, tid('PILLAR', 'STONE_WALL'), res); }
  for (const [x, y] of [[24, 13], [40, 13], [24, 16], [40, 16]]) prop(map, x, y, tid('BRAZIER', 'TORCH'), res);
  prop(map, 23, 14, tid('STATUE', 'PILLAR'), res);
  prop(map, 41, 14, tid('STATUE', 'PILLAR'), res);
  for (let x = 26; x <= 38; x += 4) { prop(map, x, 7, tid('TORCH', 'CANDLE'), res); prop(map, x, 21, tid('TORCH', 'CANDLE'), res); }

  // The bank ends: the toll queue north, the fish stalls south.
  for (const [x, y, t] of [[27, 2, 'CRATE'], [37, 2, 'BARREL'], [26, 1, 'CART'],
    [27, 24, 'CRATE'], [37, 24, 'BARREL'], [38, 23, 'CART']]) prop(map, x, y, tid(t, 'CRATE'), res);
  prop(map, 38, 2, tid('SIGN', 'CRATE'), res);
  prop(map, 26, 24, tid('SIGN', 'CRATE'), res);
  scatter(map, rd, 1, 1, 62, 3, table([['SACK', 4], ['BARREL', 3], ['DRIFTWOOD', 3], ['REEDS', 2]]), 0.05, res);
  scatter(map, rd, 1, 22, 62, 3, table([['SACK', 4], ['BARREL', 3], ['DRIFTWOOD', 3], ['REEDS', 2]]), 0.05, res);
  for (let x = 2; x < 62; x += 3) {
    if (rd.chance(0.4)) prop(map, x, 3, tid('REEDS', 'CATTAILS'), res);
    if (rd.chance(0.4)) prop(map, x, 22, tid('CATTAILS', 'REEDS'), res);
  }

  map.recomputeFlags({ keep: 0 });
  // The side borders run through the river, which is already solid; only the two
  // banks want a fence line, and the road's mouth is left clear of it.
  sealBorder(map, 0);
  for (let x = 0; x < 64; x++) {
    if (x >= 29 && x <= 35) continue;
    dset(map, x, 0, tid('PALISADE', 'STONE_WALL'));
    dset(map, x, 25, tid('PALISADE', 'STONE_WALL'));
  }
  sweepStanding(map, 'bg-wyrms-crossing');
  openWarpTiles(map, 'bg-wyrms-crossing');
  map.spawn = { x: 32, y: 3 };
  map.entry = { ...map.spawn };
  map.level = 11;
  fillDeadPockets(map, 'bg-wyrms-crossing', 'STONE_WALL');

  prop(map, 33, 13, tid('SIGN', 'PILLAR'), res);
  addSign(map, 38, 2, 'WYRM’S CROSSING — TOLL. Foot two copper, beast four, wagon a silver. The Flaming Fist reserves the right to open any load, and does.');
  addSign(map, 26, 24, 'South bank: RIVINGTON, and the Coast Way beyond it. Sharess’ Caress keeps a lamp burning on the market road; you will not need directions twice.');
  addSign(map, 33, 13, 'WYRM’S ROCK. The Flaming Fist holds the rock, and the rock holds the bridge, and that is the whole of why Baldur’s Gate has a south gate at all.');
  return map;
}

// --- Rivington: farm, port, refugee camp, and the city's southern door ------
function buildRivington(root) {
  const map = new TileMap({
    w: 56, h: 44, id: 'bg-rivington', name: 'Rivington', biome: 'city',
    indoor: false, music: 'town', safe: true, encounterRate: 0, region: 'baldurs-gate',
  });
  const res = reservedFor('bg-rivington');
  const rg = root.fork('ground'), rd = root.fork('detail');
  // Rivington is half farm, so it is the one district in the city that is green.
  const turf = table([['GRASS', 9], ['GRASS_2', 5], ['GRASS_3', 3], ['GRASS_4', 3]]);
  const road = table(G_LANE);

  groundNoise(map, rg, 0, 0, 56, 44, turf);

  // Sharess' Caress: the one building on the south bank with money spent on it.
  building(map, {
    x: 14, y: 14, w: 9, h: 7, wall: 'BRICK_WALL', roof: 'tile', base: 'COBBLE',
    roofRows: 3, windows: [1, 7], upper: [2, 4, 6], band: 3, sign: 6, door: 4,
    lit: true, chimney: 7, approach: 3,
  }, res);
  // Danthelon's Dancing Axe: weapons and armour, and audible from the road.
  building(map, {
    x: 33, y: 14, w: 9, h: 6, wall: 'LOG_WALL', roof: 'shingle', base: 'DIRT',
    roofRows: 2, windows: [1, 7], upper: [4], sign: 2, door: 4, lit: true,
    chimney: 7, approach: 2,
  }, res);
  // Arveene Tallstag's provisions, Bree Goodbarrel's ferry house, and the barn.
  building(map, {
    x: 33, y: 25, w: 8, h: 5, wall: 'WATTLE_WALL', roof: 'thatch', base: 'DIRT',
    roofRows: 2, roofPatch: [[2, 1]], windows: [1, 6], sign: 4, door: null,
  }, res);
  building(map, {
    x: 45, y: 10, w: 7, h: 5, wall: 'LOG_WALL', roof: 'thatch', base: 'DIRT',
    roofRows: 2, roofPatch: [[1, 1], [5, 1]], windows: [1, 5], door: null,
  }, res);
  building(map, {
    x: 7, y: 32, w: 11, h: 7, wall: 'LOG_WALL', roof: 'thatch', base: 'DIRT',
    roofRows: 3, peak: 5, roofPatch: [[1, 2], [9, 2]], windows: [1, 9],
    loading: [5], door: null,
  }, res);

  repave(map, rg, 0, 0, 56, 44, turf);

  // --- the ground, in blocks ------------------------------------------------
  grect(map, 2, 31, 22, 11, tid('FARMLAND', 'DIRT'));
  groundNoise(map, rg, 3, 32, 9, 9, table([['CROP_WHEAT', 1]]));
  grect(map, 33, 31, 20, 11, tid('FARMLAND', 'DIRT'));
  groundNoise(map, rg, 42, 32, 10, 9, table([['CROP_CABBAGE', 1]]));
  grect(map, 20, 12, 16, 12, tid('DIRT', 'GRAVEL'));         // the market ground
  grect(map, 44, 8, 12, 4, tid('FLAGSTONE', 'COBBLE'));      // the quay head

  // --- the market road, north to the bridge and south to the Coast Way ------
  for (let x = 26; x <= 30; x++) for (let y = 1; y <= 42; y++) floor(map, x, y, pickT(rg, road));
  for (let y = 21; y <= 23; y++) for (let x = 2; x <= 53; x++) floor(map, x, y, pickT(rg, road));
  for (let y = 12; y <= 13; y++) for (let x = 8; x <= 50; x++) floor(map, x, y, pickT(rg, road));
  for (let x = 18; x <= 19; x++) for (let y = 13; y <= 29; y++) floor(map, x, y, pickT(rg, road));
  for (let x = 43; x <= 44; x++) for (let y = 8; y <= 29; y++) floor(map, x, y, pickT(rg, road));

  // --- the river and the quay, north-east -----------------------------------
  grect(map, 44, 1, 12, 6, tid('WATER_DEEP', 'WATER'));
  for (let x = 44; x < 56; x++) gset(map, x, 6, tid('WATER', 'WATER_DEEP'));
  grect(map, 45, 4, 8, 3, tid('BRIDGE_WOOD', 'WOOD_FLOOR'));
  for (const [x, y] of [[45, 5], [52, 5], [46, 8], [51, 8]]) prop(map, x, y, tid('BARREL', 'CRATE'), res);
  for (const [x, y] of [[48, 4], [51, 4]]) prop(map, x, y, tid('CRATE', 'BARREL'), res);
  prop(map, 44, 7, tid('DRIFTWOOD', 'ROCK'), res);
  prop(map, 54, 7, tid('REEDS', 'CATTAILS'), res);

  // --- the fields ------------------------------------------------------------
  fenceRect(map, 2, 30, 22, 12, { x: 18, y: 30 }, res);
  dset(map, 19, 30, tid('GATE', 'FENCE_H'));
  fenceRect(map, 33, 30, 20, 12, { x: 42, y: 30 }, res);
  dset(map, 43, 30, tid('GATE', 'FENCE_H'));
  for (const [x, y] of [[5, 30], [21, 34], [37, 38], [50, 35]]) prop(map, x, y, tid('CART', 'CRATE'), res);
  bigOak(map, 23, 26); bigOak(map, 47, 26); bigOak(map, 3, 26); bigOak(map, 12, 8); bigOak(map, 38, 6);

  // --- the refugee camp along the road ---------------------------------------
  // Real TENT now, not a rectangle of roof-thatch hung in the air: a tent is a
  // solid, deco-plane thing you walk round and it throws a prop's contact
  // shadow, where THATCH_M threw a whole house's overhang across the camp.
  // Four years after the Absolute they are still here and no longer temporary.
  for (const [x0, y0] of [[21, 5], [22, 16], [21, 27], [33, 5], [46, 17]]) {
    for (let x = x0; x <= x0 + 2; x++) prop(map, x, y0, tid('TENT', 'THATCH_M'), res);
    awning(map, x0, y0 + 1, 3);                       // the fly sheet over the door
    prop(map, x0, y0 + 2, tid('BRAZIER', 'TORCH'), res);
    prop(map, x0 + 2, y0 + 2, tid('SACK', 'CRATE'), res);
    prop(map, x0 + 3, y0, tid('BARREL', 'CRATE'), res);
    prop(map, x0 + 3, y0 + 1, tid('HAY', 'SACK'), res);       // bedding, four years old
  }
  prop(map, 24, 20, tid('WELL', 'FOUNTAIN'), res);
  const stall = table([['CART', 5], ['CRATE', 5], ['SACK', 4], ['SHELF_GOODS', 3], ['BARREL', 3]]);
  stallRow(map, 8, 20, 11, 'h', rd, { step: 4, face: -1, res, wares: stall, banner: true });
  stallRow(map, 10, 24, 10, 'h', rd, { step: 4, face: 1, res, wares: stall });
  scatter(map, rd, 2, 2, 52, 40, table([['BUSH', 4], ['SACK', 3], ['BARREL', 3], ['STUMP', 2], ['ROCK', 2]]), 0.02, res);

  map.recomputeFlags({ keep: 0 });
  sealBorder(map, tid('PALISADE', 'STONE_WALL'));
  sweepStanding(map, 'bg-rivington');
  openWarpTiles(map, 'bg-rivington');
  map.spawn = { x: 28, y: 4 };
  map.entry = { ...map.spawn };
  map.level = 11;
  fillDeadPockets(map, 'bg-rivington', 'FENCE_H');

  prop(map, 25, 25, tid('SIGN', 'CRATE'), res);
  prop(map, 32, 20, tid('SIGN', 'CRATE'), res);
  prop(map, 45, 12, tid('SIGN', 'CRATE'), res);
  prop(map, 31, 41, tid('SIGN', 'CRATE'), res);
  addSign(map, 25, 25, 'RIVINGTON. South bank, and the only part of the city on it. Half of it grows the city’s bread; the other half is waiting for a berth, a writ, or a war to end.');
  addSign(map, 32, 20, 'DANTHELON’S DANCING AXE — arms, harness, shields, and honest steel at an honest price, which is more than you will find inside the walls.');
  addSign(map, 45, 12, 'RIVINGTON QUAY. Ferry to Wyrm’s Rock and the Gray Harbour on the turn of the tide. Passage arranged; cargo not asked about.');
  addSign(map, 31, 41, 'SOUTH: the COAST WAY. The Friendly Arm at two days’ hard walking, Beregost at four, Nashkel at eight. Travel in company.');
  return map;
}

// ---------------------------------------------------------------------------
// 2. THE LOWER CITY
// ---------------------------------------------------------------------------
//
// Between the Old Wall and the water: where the money is made, the ships come
// in, and the Guild owns the nights. COBBLE underfoot with MUD where the cobble
// gives out, BRICK_WALL and shingle above it, streets two tiles wide, washing
// strung overhead on the `over` plane, and crates against every wall.

/** A Lower City house: brick, jettied upper storey, shingle or tile. */
function lowerHouse(map, o, res) {
  return building(map, {
    base: 'COBBLE', roof: o.roof || 'shingle', wall: o.wall || 'BRICK_WALL',
    roofRows: o.rows != null ? o.rows : 2, band: o.band != null ? o.band : (o.h >= 6 ? 3 : undefined),
    windows: o.windows || [1, o.w - 2], upper: o.upper, sign: o.sign, door: o.door,
    lit: o.lit, chimney: o.chimney, chimney2: o.chimney2, peak: o.peak,
    roofPatch: o.roofPatch, patchTile: o.patchTile, loading: o.loading,
    approach: o.approach, iron: o.iron,
    x: o.x, y: o.y, w: o.w, h: o.h,
  }, res);
}

// --- Gray Harbour: the Seatower, the quays and the Low Lantern --------------
function buildGrayHarbour(root) {
  const map = new TileMap({
    w: 60, h: 42, id: 'bg-gray-harbour', name: 'Gray Harbour', biome: 'city',
    indoor: false, music: 'coast', safe: true, encounterRate: 0, region: 'baldurs-gate',
  });
  const res = reservedFor('bg-gray-harbour');
  const rg = root.fork('ground'), rd = root.fork('detail');
  const cobble = table(G_COBBLE), clutter = table(LOWER_CLUTTER);

  // --- water first, then the land that is left ------------------------------
  // The harbour's west arm swallows the whole left quarter; the Seatower stands
  // on its own rock in the middle of it and is reached by one causeway.
  grect(map, 0, 0, 60, 42, tid('WATER_DEEP', 'WATER'));
  grect(map, 26, 0, 34, 26, tid('COBBLE', 'FLAGSTONE'));    // the district
  grect(map, 8, 10, 16, 13, tid('FLAGSTONE', 'COBBLE'));    // the Seatower's rock
  grect(map, 26, 20, 34, 6, tid('FLAGSTONE', 'COBBLE'));    // the wharf
  grect(map, 23, 18, 4, 2, tid('BRIDGE_STONE', 'FLAGSTONE'));  // the causeway

  // --- the Seatower of Balduran ---------------------------------------------
  // Flaming Fist headquarters: a squat keep with pillared corners on a rock in
  // the harbour, which is a fortress before it is an office and looks it.
  building(map, {
    x: 11, y: 12, w: 11, h: 5, wall: 'STONE_WALL', roof: 'tile', base: 'FLAGSTONE',
    roofRows: 1, band: 2, windows: [1, 4, 6, 9], upper: [2, 5, 8], door: 5,
    sign: 8, lit: true, approach: 1,
  }, res);
  grect(map, 14, 17, 5, 2, tid('FLAGSTONE', 'BRIDGE_STONE'));
  for (const [x, y] of [[8, 10], [23, 10], [8, 22], [23, 22]]) prop(map, x, y, tid('PILLAR', 'STONE_WALL'), res);
  for (const [x, y] of [[10, 19], [21, 19], [12, 11], [20, 11]]) prop(map, x, y, tid('BRAZIER', 'TORCH'), res);
  prop(map, 16, 20, tid('STATUE', 'PILLAR'), res);
  for (const [x, y] of [[9, 21], [22, 20], [10, 13], [22, 15]]) prop(map, x, y, tid('CRATE', 'BARREL'), res);

  // --- the Water Queen's House, oldest temple in Baldur's Gate ---------------
  building(map, {
    x: 26, y: 8, w: 8, h: 7, wall: 'STONE_WALL', roof: 'tile', base: 'FLAGSTONE',
    roofRows: 2, peak: 4, band: 3, windows: [1, 6], upper: [2, 5], door: 2,
    sign: 5, lit: true, approach: 1,
  }, res);
  for (const x of [26, 28, 31, 33]) prop(map, x, 16, tid('PILLAR', 'STONE_WALL'), res);
  prop(map, 30, 16, tid('ALTAR', 'SHRINE'), res);
  prop(map, 25, 12, tid('SHRINE', 'ALTAR'), res);

  // --- the working waterfront ------------------------------------------------
  // Warehouses along the top of the district, chandleries facing the wharf.
  lowerHouse(map, { x: 37, y: 2, w: 10, h: 7, roof: 'shingle', upper: [3, 6], sign: 8, loading: [4], lit: true, chimney: 8 }, res);
  lowerHouse(map, { x: 49, y: 2, w: 9, h: 7, roof: 'tile', upper: [3, 6], loading: [4], chimney: 7 }, res);
  lowerHouse(map, { x: 27, y: 2, w: 8, h: 5, roof: 'tile', rows: 1, upper: [3], loading: [3] }, res);
  lowerHouse(map, { x: 36, y: 11, w: 9, h: 6, roof: 'shingle', upper: [2, 6], sign: 7, windows: [1, 4, 7], lit: true }, res);
  lowerHouse(map, { x: 47, y: 11, w: 11, h: 6, roof: 'shingle', upper: [3, 7], loading: [5], chimney: 9 }, res);

  // The Low Lantern: a three-storey merchant ship moored bow-in at the east
  // quay, built as a house on a deck because that is exactly what she is now.
  building(map, {
    x: 37, y: 21, w: 8, h: 6, wall: 'LOG_WALL', roof: 'shingle', base: 'BRIDGE_WOOD',
    roofRows: 2, band: 3, windows: [1, 6], upper: [2, 5], door: 3, sign: 6,
    lit: true, approach: 1, chimney: 6,
  }, res);
  grect(map, 35, 27, 13, 7, tid('BRIDGE_WOOD', 'WOOD_FLOOR'));
  // HER GANGPLANKS, AND THEY ARE NOT DECORATION. The Low Lantern's door is in
  // her own base course at (40,26) and opens SOUTH onto her deck; her three
  // landward sides are hull, and everything below y=26 that is not deck is deep
  // water. Without these two runs of planking either side of the bow the deck,
  // the door and the whole tavern behind it are reachable only from each other.
  grect(map, 35, 26, 2, 1, tid('BRIDGE_WOOD', 'WOOD_FLOOR'));
  grect(map, 45, 26, 3, 1, tid('BRIDGE_WOOD', 'WOOD_FLOOR'));
  for (const [x, y] of [[35, 28], [47, 28], [36, 32], [46, 32]]) prop(map, x, y, tid('TORCH', 'CANDLE'), res);
  for (const [x, y] of [[36, 30], [46, 30], [39, 33], [43, 33]]) prop(map, x, y, tid('BARREL', 'CRATE'), res);

  // Two more quays, and the Oberon dry docks east of them: scaffolding, ladders
  // and a hull up on the stocks.
  grect(map, 28, 26, 4, 8, tid('BRIDGE_WOOD', 'WOOD_FLOOR'));
  grect(map, 51, 26, 4, 7, tid('BRIDGE_WOOD', 'WOOD_FLOOR'));
  for (const [x, y] of [[28, 33], [31, 30], [51, 32], [54, 28]]) prop(map, x, y, tid('BARREL', 'CRATE'), res);
  for (let y = 18; y <= 24; y += 2) { prop(map, 48, y, tid('TIMBER_SUPPORT', 'PILLAR'), res); prop(map, 56, y, tid('TIMBER_SUPPORT', 'PILLAR'), res); }
  for (const [x, y] of [[50, 19], [54, 19], [52, 23]]) prop(map, x, y, tid('LADDER', 'TIMBER_SUPPORT'), res);
  prop(map, 52, 21, tid('CART', 'CRATE'), res);

  // --- the streets ------------------------------------------------------------
  for (let y = 18; y <= 20; y++) for (let x = 26; x <= 58; x++) floor(map, x, y, pickT(rg, cobble));
  for (let y = 15; y <= 16; y++) for (let x = 26; x <= 46; x++) floor(map, x, y, pickT(rg, cobble));
  for (let x = 34; x <= 35; x++) for (let y = 9; y <= 20; y++) floor(map, x, y, pickT(rg, cobble));
  for (let x = 46; x <= 47; x++) for (let y = 9; y <= 20; y++) floor(map, x, y, pickT(rg, cobble));
  for (let y = 9; y <= 10; y++) for (let x = 27; x <= 58; x++) floor(map, x, y, pickT(rg, cobble));
  grect(map, 26, 20, 34, 6, tid('FLAGSTONE', 'COBBLE'));

  // --- the wharf's clutter ----------------------------------------------------
  for (let x = 27; x <= 58; x += 3) prop(map, x, 22, pickT(rd, clutter), res);
  for (let x = 29; x <= 57; x += 4) prop(map, x, 25, pickT(rd, clutter), res);
  for (const [x, y] of [[33, 24], [50, 24], [27, 21], [58, 21]]) prop(map, x, y, tid('CART', 'CRATE'), res);
  for (const [x, y] of [[26, 25], [59, 25], [33, 26], [49, 26]]) prop(map, x, y, tid('DRIFTWOOD', 'ROCK'), res);
  // Reeds only in the water between the quays. REEDS is solid, y=26 is the one
  // row where deck meets wharf, and a stride of 5 down that row would sooner or
  // later plant a bed of them across a gangplank and shut a quay for good.
  for (const x of [26, 32, 50, 56]) prop(map, x, 26, tid('REEDS', 'DRIFTWOOD'), res);
  for (const [x, y] of [[30, 19], [44, 19], [56, 19]]) prop(map, x, y, tid('BRAZIER', 'TORCH'), res);
  scatter(map, rd, 26, 1, 33, 24, table([['CRATE', 5], ['BARREL', 5], ['SACK', 3]]), 0.03, res);
  // Washing between the warehouse gables — the Lower City's signature overhead.
  for (const [x0, x1, y] of [[35, 46, 10], [46, 57, 10], [35, 45, 17]]) washingLine(map, x0, y, x1, rd);

  map.recomputeFlags({ keep: 0 });
  // Three sides of this map are open water and already solid; only the strip of
  // border the district actually touches wants a wall drawn on it.
  sealBorder(map, 0);
  for (let x = 26; x < 60; x++) dset(map, x, 0, tid('BRICK_WALL', 'STONE_WALL'));
  for (let y = 0; y < 26; y++) dset(map, 59, y, tid('BRICK_WALL', 'STONE_WALL'));
  sweepStanding(map, 'bg-gray-harbour');
  openWarpTiles(map, 'bg-gray-harbour');
  map.spawn = { x: 56, y: 19 };
  map.entry = { ...map.spawn };
  map.level = 12;
  fillDeadPockets(map, 'bg-gray-harbour', 'BRICK_WALL');

  prop(map, 24, 20, tid('SIGN', 'PILLAR'), res);
  prop(map, 32, 19, tid('SIGN', 'CRATE'), res);
  prop(map, 40, 20, tid('SIGN', 'CRATE'), res);
  addSign(map, 24, 20, 'THE SEATOWER OF BALDURAN. The causeway is Fist ground from this stone on. Marines drill on the rock at dawn and the whole harbour hears it.');
  addSign(map, 32, 19, 'THE WATER QUEEN’S HOUSE. Umberlee is not petitioned, she is paid. The oldest temple in Baldur’s Gate and the only one nobody has ever dared close.');
  addSign(map, 40, 20, 'THE LOW LANTERN — three decks, no last orders, and every hand aboard her is somebody’s creditor. Moored at the east quay since before you were born.');
  return map;
}

// --- Bloomridge: the Counting House, and the gate the city is named for -----
function buildBloomridge(root) {
  const map = new TileMap({
    w: 48, h: 42, id: 'bg-bloomridge', name: 'Bloomridge', biome: 'city',
    indoor: false, music: 'city', safe: true, encounterRate: 0, region: 'baldurs-gate',
  });
  const res = reservedFor('bg-bloomridge');
  const rg = root.fork('ground'), rd = root.fork('detail');
  const cobble = table(G_COBBLE), clutter = table(LOWER_CLUTTER);

  grect(map, 0, 0, 48, 42, tid('COBBLE', 'FLAGSTONE'));

  // --- the Counting House ----------------------------------------------------
  // Stone where its neighbours are brick, an iron door where they have oak, and
  // not one window on the ground floor. The city's bank looks like a strongbox
  // because it is one.
  building(map, {
    x: 18, y: 12, w: 10, h: 7, wall: 'STONE_WALL', roof: 'tile', base: 'FLAGSTONE',
    roofRows: 2, band: 3, windows: [], upper: [2, 4, 7], door: 4, sign: 7,
    iron: true, lit: true, approach: 1,
  }, res);
  for (const x of [18, 20, 26, 27]) prop(map, x, 19, tid('PILLAR', 'STONE_WALL'), res);
  grect(map, 21, 19, 3, 2, tid('FLAGSTONE', 'COBBLE'));
  prop(map, 17, 20, tid('BRAZIER', 'TORCH'), res);
  prop(map, 28, 20, tid('BRAZIER', 'TORCH'), res);

  // --- the merchant terraces, stepping down to the harbour road -------------
  for (const [x, y, w, h, roof] of [
    [3, 8, 9, 7, 'tile'], [31, 8, 8, 7, 'shingle'], [40, 9, 7, 6, 'tile'],
    [3, 24, 8, 6, 'shingle'], [13, 24, 7, 6, 'tile'], [28, 24, 9, 6, 'shingle'], [39, 25, 8, 5, 'tile'],
    [4, 33, 9, 6, 'tile'], [15, 33, 8, 6, 'shingle'], [27, 33, 8, 6, 'tile'], [37, 32, 9, 7, 'shingle'],
  ]) {
    lowerHouse(map, {
      x, y, w, h, roof, rows: h >= 7 ? 2 : 1, upper: [2, w - 3],
      windows: [1, w - 2], chimney: w - 2, lit: ((x + y) & 1) === 0,
    }, res);
  }
  lowerHouse(map, { x: 13, y: 8, w: 4, h: 5, roof: 'shingle', rows: 1, windows: [1], chimney: 2 }, res);

  // --- the Old Wall and the Baldur's Gate ------------------------------------
  // The gate the city is named for: the only passage open to ordinary traffic
  // between the Lower City and the Upper. One tile wide, and a Fist on it.
  drect(map, 0, 1, 48, 4, tid('STONE_WALL', 'BRICK_WALL'));
  for (let x = 0; x < 48; x++) dset(map, x, 4, tid('WALL_TOP_SHADE', 'STONE_WALL'));
  for (let y = 1; y <= 4; y++) floor(map, 24, y, tid('FLAGSTONE', 'COBBLE'));
  for (const y of [1, 2, 3]) { dset(map, 22, y, tid('PILLAR', 'STONE_WALL')); dset(map, 26, y, tid('PILLAR', 'STONE_WALL')); }
  floorRect(map, 21, 5, 7, 2, tid('FLAGSTONE', 'COBBLE'));
  prop(map, 21, 5, tid('TORCH', 'CANDLE'), res);
  prop(map, 27, 5, tid('TORCH', 'CANDLE'), res);
  prop(map, 20, 6, tid('CRATE', 'BARREL'), res);
  prop(map, 28, 6, tid('BENCH', 'CRATE'), res);
  prop(map, 19, 6, tid('SIGN', 'CRATE'), res);

  // --- the streets -----------------------------------------------------------
  for (let y = 19; y <= 21; y++) for (let x = 1; x <= 46; x++) floor(map, x, y, pickT(rg, cobble));
  for (let x = 23; x <= 25; x++) for (let y = 5; y <= 40; y++) floor(map, x, y, pickT(rg, cobble));
  for (let y = 30; y <= 31; y++) for (let x = 2; x <= 46; x++) floor(map, x, y, pickT(rg, cobble));
  for (let y = 39; y <= 40; y++) for (let x = 2; x <= 46; x++) floor(map, x, y, pickT(rg, cobble));
  for (let y = 15; y <= 16; y++) for (let x = 2; x <= 46; x++) floor(map, x, y, pickT(rg, cobble));
  for (let x = 12; x <= 13; x++) for (let y = 15; y <= 40; y++) floor(map, x, y, pickT(rg, cobble));
  for (let x = 37; x <= 38; x++) for (let y = 15; y <= 40; y++) floor(map, x, y, pickT(rg, cobble));

  // --- the flower market that gives the district its name --------------------
  grect(map, 4, 21, 7, 3, tid('FLAGSTONE', 'COBBLE'));
  for (let x = 3; x <= 10; x += 2) { prop(map, x, 22, tid('BERRY_BUSH', 'BUSH'), res); prop(map, x + 1, 23, tid('HEDGE', 'BUSH'), res); }
  for (let x = 40; x <= 45; x += 2) prop(map, x, 22, tid('BERRY_BUSH', 'BUSH'), res);
  for (const [x, y] of [[6, 24], [42, 23], [9, 21]]) prop(map, x, y, tid('CART', 'CRATE'), res);
  groundNoise(map, rg, 41, 21, 5, 2, table([['CROP_CABBAGE', 1]]));
  prop(map, 33, 21, tid('FOUNTAIN', 'WELL'), res);
  prop(map, 15, 21, tid('SHRINE', 'ALTAR'), res);       // the little Umberlee shrine
  prop(map, 16, 21, tid('CANDLE', 'TORCH'), res);

  for (let x = 3; x <= 45; x += 4) prop(map, x, 32, pickT(rd, clutter), res);
  for (const [x, y] of [[10, 20], [30, 20], [44, 20], [20, 31], [34, 31]]) prop(map, x, y, tid('BRAZIER', 'TORCH'), res);
  scatter(map, rd, 2, 5, 44, 35, table([['CRATE', 5], ['BARREL', 4], ['SACK', 3], ['BENCH', 2]]), 0.03, res);
  for (const [x0, x1, y] of [[13, 22, 15], [26, 36, 15], [4, 12, 30], [28, 36, 30]]) washingLine(map, x0, y, x1, rd);

  map.recomputeFlags({ keep: 0 });
  sealBorder(map, tid('BRICK_WALL', 'STONE_WALL'));
  sweepStanding(map, 'bg-bloomridge');
  openWarpTiles(map, 'bg-bloomridge');
  map.spawn = { x: 24, y: 6 };
  map.entry = { ...map.spawn };
  map.level = 12;
  fillDeadPockets(map, 'bg-bloomridge', 'BRICK_WALL');

  prop(map, 29, 20, tid('SIGN', 'CRATE'), res);
  prop(map, 12, 21, tid('SIGN', 'CRATE'), res);
  addSign(map, 19, 6, 'THE BALDUR’S GATE. Balduran raised the wall and the wall took his name and then the city took it from the wall. Writs and weapons declared at the arch.');
  addSign(map, 29, 20, 'THE COUNTING HOUSE. Deposits, exchange, assay, and safekeeping under the Grand Duke’s seal. Gems and plate valued while you wait. No credit.');
  addSign(map, 12, 21, 'BLOOMRIDGE FLOWER MARKET, six days in seven. The district is named for it, which surprises everyone who has smelled the harbour first.');
  return map;
}

// --- Heapside: the Mermaid, the Wonders, and a stair into the Undercellar ---
function buildHeapside(root) {
  const map = new TileMap({
    w: 52, h: 42, id: 'bg-heapside', name: 'Heapside', biome: 'city',
    indoor: false, music: 'city', safe: true, encounterRate: 0, region: 'baldurs-gate',
    ambient: { color: '#1a1a20', alpha: 0.1 },
  });
  const res = reservedFor('bg-heapside');
  const rg = root.fork('ground'), rd = root.fork('detail');
  const cobble = table(G_COBBLE), alley = table(G_MIRE), clutter = table(LOWER_CLUTTER);

  grect(map, 0, 0, 52, 42, tid('COBBLE', 'FLAGSTONE'));

  // --- the three landmarks ---------------------------------------------------
  // The Blushing Mermaid: brick, half of it re-roofed in whatever came to hand,
  // every window lit, and three barrels outside that have never been moved.
  building(map, {
    x: 14, y: 10, w: 8, h: 7, wall: 'BRICK_WALL', roof: 'shingle', base: 'COBBLE',
    roofRows: 2, band: 3, roofPatch: [[1, 0], [2, 1], [5, 0]], patchTile: 'THATCH_M',
    windows: [1, 4, 6], upper: [2, 5], door: 4, sign: 6, lit: true,
    chimney: 6, approach: 1,
  }, res);
  for (const [x, y] of [[13, 17], [22, 17], [13, 18]]) prop(map, x, y, tid('BARREL', 'CRATE'), res);
  prop(map, 16, 18, tid('PROP_SHADOW', 'MUD'), res);

  // The High House of Wonders: Gond's own, and the only tile roof in Heapside.
  building(map, {
    x: 36, y: 10, w: 10, h: 7, wall: 'STONE_WALL', roof: 'tile', base: 'FLAGSTONE',
    roofRows: 2, peak: 5, band: 3, windows: [1, 3, 6, 8], upper: [2, 7],
    door: 4, sign: 7, lit: true, chimney: 1, chimney2: 8, approach: 1,
  }, res);
  for (const [x, y, t] of [[35, 18, 'ANVIL'], [37, 18, 'FORGE'], [43, 18, 'GRINDSTONE'],
    [46, 17, 'LEVER'], [34, 17, 'CART'], [45, 19, 'CRATE']]) prop(map, x, y, tid(t, 'CRATE'), res);

  // The Shrine of the Suffering: no ornament at all, which in this district is
  // the loudest thing on the street.
  building(map, {
    x: 26, y: 26, w: 6, h: 5, wall: 'STONE_WALL', roof: 'shingle', base: 'FLAGSTONE',
    roofRows: 1, windows: [1], door: 4, sign: 2, approach: 1,
  }, res);
  prop(map, 25, 31, tid('ALTAR', 'SHRINE'), res);
  prop(map, 33, 31, tid('CANDLE', 'TORCH'), res);
  for (const x of [26, 28, 32]) prop(map, x, 32, tid('BENCH', 'CRATE'), res);

  // --- the crush ------------------------------------------------------------
  // Everything else in Heapside is a tenement shoulder to shoulder with the next
  // one, and the alleys between them are two tiles wide at best.
  for (const [x, y, w, h, roof] of [
    [2, 8, 6, 6, 'shingle'], [8, 9, 5, 5, 'shingle'], [24, 9, 5, 5, 'tile'], [29, 8, 6, 6, 'shingle'],
    [47, 9, 4, 5, 'shingle'], [2, 2, 7, 5, 'shingle'], [11, 2, 6, 5, 'tile'], [19, 2, 6, 5, 'shingle'],
    [27, 2, 5, 5, 'shingle'], [34, 2, 6, 5, 'tile'],
    [2, 24, 6, 6, 'shingle'], [9, 25, 5, 5, 'tile'], [15, 24, 5, 6, 'shingle'],
    [36, 24, 6, 6, 'tile'], [43, 25, 7, 5, 'shingle'],
    [2, 34, 6, 5, 'shingle'], [12, 34, 6, 5, 'tile'], [20, 35, 5, 4, 'shingle'],
    [30, 34, 6, 5, 'tile'], [38, 34, 5, 5, 'shingle'], [44, 35, 6, 4, 'tile'],
    // THE INFILL, AND IT IS WHAT MAKES HEAPSIDE HEAPSIDE. Everything above
    // leaves a comfortable band of empty cobble at y 15–18 and again at y 26–31,
    // and comfortable is the one thing this district has never been. These back
    // into the gaps until the only ground left between one man's gable and the
    // next man's is the two tiles the alley loops carve out again below.
    [2, 15, 6, 4, 'shingle'], [11, 15, 3, 4, 'tile'], [25, 15, 4, 4, 'shingle'],
    [29, 15, 5, 4, 'tile'], [48, 15, 3, 4, 'shingle'],
    [2, 30, 6, 3, 'tile'], [12, 27, 4, 4, 'shingle'], [17, 26, 4, 5, 'tile'],
    [36, 31, 5, 3, 'shingle'], [43, 31, 5, 3, 'tile'],
    [45, 15, 3, 4, 'tile'], [19, 8, 4, 6, 'tile'],
  ]) {
    lowerHouse(map, {
      x, y, w, h, roof, rows: h >= 6 ? 2 : 1, upper: h >= 5 ? [2] : undefined,
      windows: [1, w - 2], roofPatch: ((x + y) % 3 === 0) ? [[1, 0]] : undefined,
      patchTile: 'THATCH_M', chimney: w - 2, lit: ((x * 3 + y) & 1) === 0,
    }, res);
  }

  // --- the streets, and the alleys where the cobble gives out ---------------
  for (let y = 19; y <= 21; y++) for (let x = 1; x <= 50; x++) floor(map, x, y, pickT(rg, cobble));
  for (let x = 22; x <= 24; x++) for (let y = 7; y <= 40; y++) floor(map, x, y, pickT(rg, cobble));
  for (let y = 7; y <= 8; y++) for (let x = 1; x <= 50; x++) floor(map, x, y, pickT(rg, cobble));
  for (let y = 32; y <= 33; y++) for (let x = 1; x <= 50; x++) floor(map, x, y, pickT(rg, cobble));
  for (let x = 9; x <= 10; x++) for (let y = 21; y <= 40; y++) floor(map, x, y, pickT(rg, alley));
  for (let x = 42; x <= 43; x++) for (let y = 21; y <= 40; y++) floor(map, x, y, pickT(rg, alley));
  for (let x = 32; x <= 33; x++) for (let y = 21; y <= 33; y++) floor(map, x, y, pickT(rg, alley));
  for (let x = 9; x <= 10; x++) for (let y = 1; y <= 19; y++) floor(map, x, y, pickT(rg, alley));
  for (let x = 34; x <= 35; x++) for (let y = 1; y <= 19; y++) floor(map, x, y, pickT(rg, alley));
  for (let x = 46; x <= 47; x++) for (let y = 7; y <= 21; y++) floor(map, x, y, pickT(rg, alley));
  for (let y = 40; y <= 40; y++) for (let x = 1; x <= 50; x++) floor(map, x, y, pickT(rg, alley));

  // --- the Cliffgate, in the north-east wall --------------------------------
  drect(map, 38, 4, 13, 3, tid('STONE_WALL', 'BRICK_WALL'));
  for (let x = 38; x <= 50; x++) dset(map, x, 6, tid('WALL_TOP_SHADE', 'STONE_WALL'));
  floor(map, 44, 6, tid('FLAGSTONE', 'COBBLE'));
  floor(map, 44, 7, tid('FLAGSTONE', 'COBBLE'));
  dset(map, 43, 6, tid('PILLAR', 'STONE_WALL'));
  dset(map, 45, 6, tid('PILLAR', 'STONE_WALL'));
  prop(map, 42, 8, tid('TORCH', 'CANDLE'), res);
  prop(map, 46, 8, tid('TORCH', 'CANDLE'), res);

  // --- the Undercellar stair, and the sewer grate ---------------------------
  floor(map, 24, 24, tid('STAIRS_DOWN', 'PIT'));
  prop(map, 23, 23, tid('PILLAR', 'STONE_WALL'), res);
  prop(map, 25, 23, tid('PILLAR', 'STONE_WALL'), res);
  prop(map, 25, 25, tid('TORCH', 'CANDLE'), res);
  floor(map, 10, 34, tid('PIT', 'STAIRS_DOWN'));
  prop(map, 11, 34, tid('RUBBLE', 'ROCK'), res);
  groundNoise(map, rg, 9, 33, 3, 3, table(G_MIRE));
  floor(map, 10, 34, tid('PIT', 'STAIRS_DOWN'));
  floor(map, 10, 35, tid('MUD', 'DIRT'));

  // --- washing lines, and the clutter of a district with no yards -----------
  // Strung wall to wall over every street in the district, which is what a place
  // with no yards does with its laundry. This is Heapside's signature from
  // above, and Eastway deliberately has none of it.
  for (const [x0, x1, y] of [[2, 8, 7], [24, 34, 7], [11, 21, 21], [36, 46, 21],
    [2, 8, 32], [12, 21, 32], [30, 41, 32], [44, 50, 32],
    [12, 21, 8], [36, 47, 8], [2, 8, 20], [25, 31, 20], [44, 50, 19],
    [2, 8, 33], [23, 31, 33], [34, 43, 32], [14, 22, 40], [30, 40, 40]]) washingLine(map, x0, y, x1, rd);
  for (let x = 2; x <= 49; x += 3) prop(map, x, 22, pickT(rd, clutter), res);
  for (const [x, y] of [[12, 20], [28, 20], [40, 20], [20, 33], [38, 33]]) prop(map, x, y, tid('BRAZIER', 'TORCH'), res);
  scatter(map, rd, 1, 1, 50, 40, table([['CRATE', 5], ['BARREL', 5], ['SACK', 4], ['RUBBLE', 2]]), 0.045, res);
  for (let y = 21; y <= 40; y++) {
    for (let x = 1; x <= 50; x++) {
      if (map.deco[y * map.w + x]) continue;
      if (rd.chance(0.03)) prop(map, x, y, tid('PROP_SHADOW', 'RUBBLE'), res);
    }
  }

  map.recomputeFlags({ keep: 0 });
  // Heapside's streets are earth showing through where the paving gave out.
  wearPatches(map, rd, { x: 2, y: 5, w: 48, h: 36 }, 'DIRT_ISLE', 16, { res });
  wearPatches(map, rd, { x: 2, y: 20, w: 48, h: 4 }, 'PATH_ISLE', 8, { res });
  map.recomputeFlags({ keep: 0 });
  sealBorder(map, tid('BRICK_WALL', 'STONE_WALL'));
  sweepStanding(map, 'bg-heapside');
  openWarpTiles(map, 'bg-heapside');
  map.spawn = { x: 4, y: 20 };
  map.entry = { ...map.spawn };
  map.level = 12;
  fillDeadPockets(map, 'bg-heapside', 'BRICK_WALL');

  prop(map, 20, 18, tid('SIGN', 'CRATE'), res);
  prop(map, 33, 18, tid('SIGN', 'CRATE'), res);
  prop(map, 26, 25, tid('SIGN', 'CRATE'), res);
  prop(map, 41, 8, tid('SIGN', 'CRATE'), res);
  addSign(map, 20, 18, 'THE BLUSHING MERMAID — beds, board, and a crowd that will not answer questions. Post a hiring notice on the door and half the city will read it by morning.');
  addSign(map, 33, 18, 'THE HIGH HOUSE OF WONDERS. Gond’s temple and Gond’s workshop, and the difference between the two has never been settled by anyone inside it.');
  addSign(map, 26, 25, 'Down these steps: THE UNDERCELLAR. Nobody advertises it and everybody knows it.\n\nThe Shrine of the Suffering stands opposite, and its door is never barred.');
  addSign(map, 41, 8, 'THE CLIFFGATE — out to Tumbledown and the burying ground. Coffins out, mourners back, and the Watch counts both.');
  // THE GRATE, STAMPED BY HAND — see the note on the Tumbledown stair. The sewer
  // link declares `bWarp: null` because a generated floor has no coordinates
  // until it is built, so `applyWarpNodes` lays nothing on this end and the
  // grate at (10,34) would be a hole in the mud that does not go anywhere.
  // `buildSewers` rewires the far side's up-stair back to (10,35).
  map.addTrigger({
    id: 'heapside-sewer-grate', kind: 'warp', x: 10, y: 34,
    data: { map: 'bg-sewers', depth: 1, theme: 'dungeon', dir: 'down', kind: 'cave' },
  });
  return map;
}

// --- Eastway: the Elfsong, Sorcerous Sundries, and the Basilisk Gate --------
function buildEastway(root) {
  const map = new TileMap({
    w: 52, h: 42, id: 'bg-eastway', name: 'Eastway', biome: 'city',
    indoor: false, music: 'city', safe: true, encounterRate: 0, region: 'baldurs-gate',
  });
  const res = reservedFor('bg-eastway');
  const rg = root.fork('ground'), rd = root.fork('detail');
  const cobble = table(G_COBBLE), clutter = table(LOWER_CLUTTER);

  grect(map, 0, 0, 52, 42, tid('COBBLE', 'FLAGSTONE'));

  // --- the Elfsong Tavern ----------------------------------------------------
  // The best-looking building in the Lower City and it knows it: brick, a tile
  // roof, a jettied upper storey and every window lit against the avenue.
  building(map, {
    x: 18, y: 12, w: 9, h: 7, wall: 'BRICK_WALL', roof: 'tile', base: 'FLAGSTONE',
    roofRows: 2, band: 3, windows: [1, 2, 6, 7], upper: [2, 4, 6], door: 4,
    sign: 5, lit: true, chimney: 7, chimney2: 1, approach: 1,
  }, res);
  grect(map, 17, 19, 11, 2, tid('FLAGSTONE', 'COBBLE'));
  prop(map, 17, 19, tid('BRAZIER', 'TORCH'), res);
  prop(map, 27, 19, tid('BRAZIER', 'TORCH'), res);
  prop(map, 16, 17, tid('BENCH', 'CRATE'), res);
  prop(map, 28, 17, tid('BENCH', 'CRATE'), res);

  // --- Sorcerous Sundries ----------------------------------------------------
  // Stone, a tower of pillars above the roofline, and two braziers burning a
  // colour that is not quite any colour.
  building(map, {
    x: 32, y: 22, w: 8, h: 5, wall: 'STONE_WALL', roof: 'tile', base: 'FLAGSTONE',
    roofRows: 1, band: 2, windows: [1, 6], upper: [2, 5], door: 4, sign: 6,
    lit: true, approach: 1,
  }, res);
  for (const y of [20, 21]) { oset(map, 35, y, tid('PILLAR', 'STONE_WALL')); oset(map, 37, y, tid('PILLAR', 'STONE_WALL')); }
  oset(map, 36, 20, tid('CRYSTAL', 'PILLAR'));
  prop(map, 31, 27, tid('BRAZIER', 'TORCH'), res);
  prop(map, 40, 27, tid('BRAZIER', 'TORCH'), res);

  // --- the Blade and Stars, and the rest of the avenue ----------------------
  shell(map, {
    x: 8, y: 24, w: 9, h: 6, wall: 'BRICK_WALL', roof: 'shingle', base: 'COBBLE',
    roofRows: 2, band: 3, windows: [1, 4, 7], upper: [2, 6], sign: 5, chimney: 7,
  }, res);
  for (const [x, y, w, h, roof] of [
    [2, 3, 8, 6, 'tile'], [12, 3, 7, 6, 'shingle'], [21, 2, 8, 6, 'tile'], [31, 3, 7, 6, 'shingle'],
    [41, 2, 8, 6, 'tile'],
    [2, 12, 7, 6, 'shingle'], [10, 13, 6, 5, 'tile'], [30, 12, 7, 5, 'shingle'], [40, 12, 7, 6, 'tile'],
    [20, 24, 8, 6, 'tile'], [42, 22, 6, 6, 'shingle'],
    [2, 33, 8, 6, 'shingle'], [12, 33, 7, 6, 'tile'], [21, 32, 8, 7, 'shingle'],
    [31, 33, 7, 6, 'tile'], [41, 32, 8, 7, 'shingle'],
  ]) {
    lowerHouse(map, {
      x, y, w, h, roof, rows: 2, upper: [2, w - 3], windows: [1, w - 2],
      chimney: w - 2, lit: ((x + y * 3) & 1) === 0,
    }, res);
  }

  // --- the streets -----------------------------------------------------------
  // THE AVENUE, AND IT IS THE WHOLE POINT OF EASTWAY. Heapside next door is
  // cobble two tiles wide with the washing strung over it; Eastway is FLAGSTONE
  // four tiles wide, running dead straight from the Basilisk Gate to the
  // Elfsong's door, kerbs planted and lit. Same city, same century, different
  // money — and the party should be able to tell which of the two districts
  // they are standing in from the ground under their feet and nothing else.
  const flag = table(G_FLAG);
  for (let y = 19; y <= 21; y++) for (let x = 1; x <= 48; x++) floor(map, x, y, pickT(rg, flag));
  for (let x = 1; x <= 41; x++) floor(map, x, 22, pickT(rg, flag));
  for (let x = 28; x <= 30; x++) for (let y = 9; y <= 40; y++) floor(map, x, y, pickT(rg, cobble));
  for (let x = 16; x <= 17; x++) for (let y = 9; y <= 40; y++) floor(map, x, y, pickT(rg, cobble));
  for (let y = 9; y <= 10; y++) for (let x = 1; x <= 48; x++) floor(map, x, y, pickT(rg, cobble));
  for (let y = 30; y <= 31; y++) for (let x = 1; x <= 48; x++) floor(map, x, y, pickT(rg, cobble));
  for (let y = 40; y <= 40; y++) for (let x = 1; x <= 48; x++) floor(map, x, y, pickT(rg, cobble));
  for (let x = 38; x <= 39; x++) for (let y = 9; y <= 21; y++) floor(map, x, y, pickT(rg, cobble));
  for (let x = 8; x <= 9; x++) for (let y = 9; y <= 21; y++) floor(map, x, y, pickT(rg, cobble));

  // --- the Basilisk Gate, in the Lower City wall on the eastern edge --------
  drect(map, 49, 1, 3, 40, tid('STONE_WALL', 'BRICK_WALL'));
  for (let y = 1; y < 41; y++) dset(map, 49, y, tid('WALL_TOP_SHADE', 'STONE_WALL'));
  for (let x = 49; x <= 51; x++) floor(map, x, 20, tid('FLAGSTONE', 'COBBLE'));
  prop(map, 47, 18, tid('STATUE', 'PILLAR'), res);
  prop(map, 47, 22, tid('STATUE', 'PILLAR'), res);
  prop(map, 48, 18, tid('TORCH', 'CANDLE'), res);
  prop(map, 48, 22, tid('TORCH', 'CANDLE'), res);
  prop(map, 46, 23, tid('CRATE', 'BARREL'), res);
  prop(map, 46, 17, tid('BENCH', 'CRATE'), res);

  // --- the avenue's furniture ------------------------------------------------
  grect(map, 10, 19, 6, 3, tid('FLAGSTONE', 'COBBLE'));
  prop(map, 12, 20, tid('FOUNTAIN', 'WELL'), res);
  prop(map, 14, 20, tid('STATUE', 'PILLAR'), res);
  // The kerb, planted and lit at a regular interval — the one place in the Lower
  // City where anything is done at a regular interval. NO WASHING LINES: strung
  // sacking over the street is Heapside's signature and hanging it here would
  // throw away the only thing that tells the two districts apart from above.
  for (let x = 4; x <= 40; x += 5) prop(map, x, 23, tid((x & 1) ? 'HEDGE' : 'BENCH', 'CRATE'), res);
  for (let x = 6; x <= 44; x += 8) prop(map, x, 18, tid('BRAZIER', 'TORCH'), res);
  for (const [x, y] of [[7, 22], [25, 22], [35, 18], [45, 21], [20, 31], [36, 31]]) prop(map, x, y, tid('BRAZIER', 'TORCH'), res);
  for (const [x, y] of [[13, 23], [33, 23], [43, 20]]) prop(map, x, y, tid('STATUE', 'PILLAR'), res);
  // Clutter kept off the avenue and pushed into the side streets, where trade
  // that cannot afford a frontage on the Eastway actually happens.
  for (let y = 33; y <= 39; y += 3) for (let x = 5; x <= 45; x += 9) prop(map, x, y, pickT(rd, clutter), res);
  scatter(map, rd, 1, 1, 47, 17, table([['CRATE', 5], ['BARREL', 4], ['SACK', 3], ['BENCH', 2], ['HEDGE', 2]]), 0.03, res);
  scatter(map, rd, 1, 24, 47, 16, table([['CRATE', 5], ['BARREL', 4], ['SACK', 3], ['BENCH', 2], ['HEDGE', 2]]), 0.03, res);

  map.recomputeFlags({ keep: 0 });
  sealBorder(map, tid('BRICK_WALL', 'STONE_WALL'));
  sweepStanding(map, 'bg-eastway');
  openWarpTiles(map, 'bg-eastway');
  map.spawn = { x: 4, y: 20 };
  map.entry = { ...map.spawn };
  map.level = 12;
  fillDeadPockets(map, 'bg-eastway', 'BRICK_WALL');

  prop(map, 29, 18, tid('SIGN', 'CRATE'), res);
  prop(map, 30, 28, tid('SIGN', 'CRATE'), res);
  prop(map, 10, 31, tid('SIGN', 'CRATE'), res);
  prop(map, 45, 19, tid('SIGN', 'CRATE'), res);
  addSign(map, 29, 18, 'THE ELFSONG TAVERN. An elven woman’s voice sings in the common room most nights, in a tongue half the room does not have and all of it understands. Nobody has ever found her.');
  addSign(map, 30, 28, 'SORCEROUS SUNDRIES — scrolls, wands, foci, and identification while you wait. Do not touch the shelves. The proprietor will know.');
  addSign(map, 10, 31, 'THE BLADE AND STARS, and BRAMPTON beyond it: the blocks south-east of here, which are Eastway’s in everything but the tax rolls.');
  addSign(map, 45, 19, 'THE BASILISK GATE. Two basilisks in stone, a toll in copper, and the Trade Way’s whole traffic backed up under the arch.');
  return map;
}

// ---------------------------------------------------------------------------
// 3. THE UPPER CITY
// ---------------------------------------------------------------------------
//
// Behind the Old Wall: walled, patriar, clean, and hated by everyone below it.
// FLAGSTONE and MOSAIC underfoot instead of cobble, STONE_WALL and BRICK_WALL
// under tile roofs instead of shingle, three-storey jettied facades, PILLAR
// colonnades, STATUE, FOUNTAIN, BRAZIER and walled gardens. Broad, straight,
// well lit, and cold.
//
// The Old Wall is pierced by six gates. Two carry traffic and are warps: the
// BLACK DRAGON GATE north out to the Outer City, and the BALDUR'S GATE south
// down into the Lower City. The four patriar gates — Sea, Manor, Gond and Heap —
// are drawn as sealed IRON_DOOR with a sentry post and a sign. They are scenery,
// and they are scenery on purpose.

/** An Upper City townhouse: stone or brick, tile roof, three storeys, jettied. */
function patriarHouse(map, o, res) {
  return building(map, {
    base: 'FLAGSTONE', roof: o.roof || 'tile', wall: o.wall || 'BRICK_WALL',
    roofRows: o.rows != null ? o.rows : 2, band: o.band != null ? o.band : 3,
    windows: o.windows || [1, o.w - 2], upper: o.upper || [2, o.w - 3],
    sign: o.sign, door: o.door, lit: o.lit, chimney: o.chimney, chimney2: o.chimney2,
    peak: o.peak, iron: o.iron, approach: o.approach,
    x: o.x, y: o.y, w: o.w, h: o.h,
  }, res);
}

/** A sealed patriar gate: an iron door in the Old Wall, and a Fist beside it. */
function sealedGate(map, x, y, res) {
  dset(map, x, y, tid('IRON_DOOR', 'STONE_WALL'));
  dset(map, x - 1, y, tid('PILLAR', 'STONE_WALL'));
  dset(map, x + 1, y, tid('PILLAR', 'STONE_WALL'));
  prop(map, x - 1, y + 1, tid('TORCH', 'CANDLE'), res);
  prop(map, x + 1, y + 1, tid('TORCH', 'CANDLE'), res);
  prop(map, x + 2, y + 1, tid('SIGN', 'CRATE'), res);
  return { x, y };
}

// --- The Wide: the city's one great civic space, and its market -------------
function buildTheWide(root) {
  const map = new TileMap({
    w: 56, h: 44, id: 'bg-the-wide', name: 'The Wide', biome: 'city',
    indoor: false, music: 'market', safe: true, encounterRate: 0, region: 'baldurs-gate',
  });
  const res = reservedFor('bg-the-wide');
  const rg = root.fork('ground'), rd = root.fork('detail');
  const flag = table(G_FLAG), cobble = table(G_COBBLE);

  grect(map, 0, 0, 56, 44, tid('FLAGSTONE', 'COBBLE'));

  // --- the terraces -----------------------------------------------------------
  // Three-storey patriar frontages in a hard terrace along the north, and down
  // both margins. No thatch anywhere inside the Old Wall, and no gaps.
  for (const [x, y, w, h, roof] of [
    [3, 5, 11, 6, 'tile'], [15, 5, 9, 6, 'shingle'], [32, 5, 10, 6, 'tile'], [43, 5, 10, 6, 'shingle'],
    [2, 13, 5, 8, 'tile'], [2, 26, 5, 8, 'shingle'], [50, 13, 5, 8, 'shingle'], [50, 26, 5, 8, 'tile'],
    [6, 36, 8, 5, 'tile'], [16, 37, 7, 4, 'shingle'], [34, 37, 8, 4, 'tile'], [44, 36, 9, 5, 'shingle'],
  ]) {
    patriarHouse(map, {
      x, y, w, h, roof, rows: h >= 6 ? 2 : 1,
      upper: [2, w - 3], windows: [1, w - 2], chimney: w - 2, chimney2: 1,
      lit: ((x + y) & 1) === 0, wall: ((x * 3 + y) % 3 === 0) ? 'STONE_WALL' : 'BRICK_WALL',
    }, res);
  }

  // --- Baldur's Mouth --------------------------------------------------------
  // The broadsheet office, and the great bell on its roof that is rung for a
  // death, a war, or a particularly good piece of gossip.
  building(map, {
    x: 16, y: 12, w: 7, h: 7, wall: 'STONE_WALL', roof: 'tile', base: 'FLAGSTONE',
    roofRows: 2, band: 3, peak: 3, windows: [1, 5], upper: [2, 4], door: 4,
    sign: 5, lit: true, chimney: 1, approach: 1,
  }, res);
  oset(map, 19, 12, tid('SHRINE', 'ROOF_PEAK'));      // the bell
  prop(map, 15, 19, tid('BRAZIER', 'TORCH'), res);
  prop(map, 23, 19, tid('BRAZIER', 'TORCH'), res);

  // The Counting House's Upper City assay office, which nobody enters from the
  // street: patriars send a clerk and the clerk uses the yard door.
  shell(map, {
    x: 36, y: 12, w: 9, h: 6, wall: 'STONE_WALL', roof: 'tile', base: 'FLAGSTONE',
    roofRows: 2, band: 3, windows: [2, 6], upper: [3, 5], sign: 4, chimney: 7,
  }, res);

  // --- the plaza --------------------------------------------------------------
  grect(map, 6, 10, 45, 27, tid('FLAGSTONE', 'COBBLE'));
  for (let y = 3; y <= 40; y++) for (let x = 25; x <= 31; x++) floor(map, x, y, pickT(rg, cobble));
  for (let y = 21; y <= 23; y++) for (let x = 1; x <= 54; x++) floor(map, x, y, pickT(rg, cobble));
  for (let y = 3; y <= 4; y++) for (let x = 1; x <= 54; x++) floor(map, x, y, pickT(rg, cobble));
  for (let y = 34; y <= 35; y++) for (let x = 2; x <= 53; x++) floor(map, x, y, pickT(rg, cobble));
  for (let x = 8; x <= 9; x++) for (let y = 11; y <= 34; y++) floor(map, x, y, pickT(rg, flag));
  for (let x = 47; x <= 48; x++) for (let y = 11; y <= 34; y++) floor(map, x, y, pickT(rg, flag));

  // The fountain, and Balduran over it in bronze. The processional splits and
  // goes round: a plaza you cannot walk straight across is not a plaza.
  floorRect(map, 25, 14, 7, 7, tid('MOSAIC', 'FLAGSTONE'));
  for (let y = 16; y <= 18; y++) for (let x = 27; x <= 29; x++) prop(map, x, y, tid('FOUNTAIN', 'WELL'), res);
  prop(map, 28, 15, tid('STATUE', 'PILLAR'), res);
  for (const [x, y] of [[25, 14], [31, 14], [25, 20], [31, 20]]) prop(map, x, y, tid('BRAZIER', 'TORCH'), res);
  floorRect(map, 24, 25, 9, 1, tid('MOSAIC', 'FLAGSTONE'));
  floorRect(map, 24, 11, 9, 1, tid('MOSAIC', 'FLAGSTONE'));

  // The two stall arcades, east and west of the processional, every second tile
  // with a walking lane between them.
  // Real MARKET_STALL trestles with the canvas over the walking lane. The Wide
  // is the biggest market on the Sword Coast; it should not be a grid of crates.
  const wares = table([['CART', 5], ['CRATE', 5], ['SACK', 4], ['SHELF_GOODS', 4], ['BARREL', 3]]);
  for (const [x0, y0, face] of [[34, 12, 1], [34, 19, -1], [10, 26, 1], [10, 32, -1], [34, 26, 1], [34, 32, -1]]) {
    stallRow(map, x0, y0, 7, 'h', rd, { step: 2, face, res, wares, banner: true });
  }
  for (const [x, y] of [[7, 11], [49, 11], [7, 34], [49, 34]]) prop(map, x, y, tid('BRAZIER', 'TORCH'), res);
  for (const [x, y] of [[12, 20], [44, 20], [12, 24], [44, 24]]) prop(map, x, y, tid('STATUE', 'PILLAR'), res);
  for (const [x, y] of [[10, 13], [46, 13], [10, 33], [46, 33]]) prop(map, x, y, tid('HEDGE', 'BUSH'), res);

  // The Flaming Fist's permanent muster post on the Wide: a bench, a brazier, a
  // rack of spears, and two Fists who would rather be anywhere else.
  grect(map, 34, 28, 8, 4, tid('MOSAIC', 'FLAGSTONE'));
  for (const [x, y, t] of [[34, 29, 'CRATE'], [35, 30, 'BENCH'], [41, 29, 'CRATE'],
    [41, 30, 'BARREL'], [37, 28, 'SIGN']]) prop(map, x, y, tid(t, 'CRATE'), res);
  prop(map, 39, 30, tid('BRAZIER', 'TORCH'), res);

  // --- the Old Wall, north and south ------------------------------------------
  // North: the BLACK DRAGON GATE, out to Blackgate and the Trade Way.
  drect(map, 0, 0, 56, 3, tid('STONE_WALL', 'BRICK_WALL'));
  for (let x = 0; x < 56; x++) dset(map, x, 2, tid('WALL_TOP_SHADE', 'STONE_WALL'));
  for (let y = 0; y <= 2; y++) floor(map, 28, y, tid('FLAGSTONE', 'COBBLE'));
  dset(map, 27, 2, tid('PILLAR', 'STONE_WALL'));
  dset(map, 29, 2, tid('PILLAR', 'STONE_WALL'));
  prop(map, 26, 3, tid('TORCH', 'CANDLE'), res);
  prop(map, 30, 3, tid('TORCH', 'CANDLE'), res);
  sealedGate(map, 12, 2, res);            // the Gond Gate
  sealedGate(map, 45, 2, res);            // the Sea Gate

  // South: the BALDUR'S GATE, down into Bloomridge and the Lower City.
  drect(map, 0, 41, 56, 3, tid('STONE_WALL', 'BRICK_WALL'));
  for (let x = 0; x < 56; x++) dset(map, x, 41, tid('WALL_TOP_SHADE', 'STONE_WALL'));
  for (const y of [41, 42]) floor(map, 28, y, tid('FLAGSTONE', 'COBBLE'));
  dset(map, 27, 41, tid('PILLAR', 'STONE_WALL'));
  dset(map, 29, 41, tid('PILLAR', 'STONE_WALL'));
  floorRect(map, 25, 39, 7, 2, tid('MOSAIC', 'FLAGSTONE'));
  prop(map, 25, 40, tid('STATUE', 'PILLAR'), res);
  prop(map, 31, 40, tid('STATUE', 'PILLAR'), res);
  prop(map, 26, 39, tid('TORCH', 'CANDLE'), res);
  prop(map, 30, 39, tid('TORCH', 'CANDLE'), res);
  sealedGate(map, 18, 41, res);           // the Manor Gate
  sealedGate(map, 40, 41, res);           // the Heap Gate

  scatter(map, rd, 2, 4, 52, 36, table([['BENCH', 4], ['HEDGE', 3], ['CRATE', 2], ['BARREL', 2]]), 0.018, res);

  noticeBoard(map, 26, 21, res);                 // the Wide's board, where the crowd reads it
  map.recomputeFlags({ keep: 0 });
  // WEAR. render/tiles.js has drawn COBBLE_ISLE and PATH_ISLE since the tileset
  // was written and no map had ever placed one, so every plaza in the game was a
  // flat field of identical stones. The Wide is the most walked-on ground on the
  // Sword Coast; it should show it.
  wearPatches(map, rd, { x: 6, y: 10, w: 44, h: 26 }, 'COBBLE_ISLE', 14, { res });
  wearPatches(map, rd, { x: 24, y: 10, w: 9, h: 26 }, 'PATH_ISLE', 8, { res });
  map.recomputeFlags({ keep: 0 });
  sealBorder(map, tid('STONE_WALL', 'BRICK_WALL'));
  sweepStanding(map, 'bg-the-wide');
  openWarpTiles(map, 'bg-the-wide');
  map.spawn = { x: 28, y: 5 };
  map.entry = { ...map.spawn };
  map.level = 13;
  fillDeadPockets(map, 'bg-the-wide', 'STONE_WALL');

  prop(map, 24, 19, tid('SIGN', 'CRATE'), res);
  prop(map, 32, 24, tid('SIGN', 'CRATE'), res);
  addSign(map, 28, 15, 'BALDURAN, who sailed west and did not come back, and whose wall this city grew inside and then named itself after. The bronze is polished every tenday by public subscription.');
  addSign(map, 24, 19, 'BALDUR’S MOUTH — the broadsheet, printed here, and the bell above it. Notices taken at the counter; the truth costs extra and is not always in stock.');
  addSign(map, 32, 24, 'THE WIDE. Market six days in seven, court of piepowder on the seventh, and the only ground in the Upper City that belongs to everybody.');
  addSign(map, 37, 28, 'FLAMING FIST MUSTER POST. Complaints, writs, lost children and found bodies. The queue for each is the same queue.');
  addSign(map, 14, 3, 'THE GOND GATE — patriar traffic only, by order of the Council of Four. Sealed since the reforms. Try the Baldur’s Gate like everyone else.');
  addSign(map, 47, 3, 'THE SEA GATE — patriar traffic only. Sealed. The Watch on the other side has been there so long he has worn a hollow in the step.');
  addSign(map, 20, 42, 'THE MANOR GATE — sealed. THE HEAP GATE, east along the wall — also sealed. Four of the six gates in the Old Wall are shut and the city has opinions about that.');
  addSign(map, 42, 42, 'THE HEAP GATE — sealed by order of the Parliament of Peers, who did not consult Heapside, whose gate it is.');
  return map;
}

// --- The Temples District: the High Hall, and the Unrolling Scroll ----------
function buildTemplesDistrict(root) {
  const map = new TileMap({
    w: 48, h: 42, id: 'bg-temples-district', name: 'The Temples District', biome: 'city',
    indoor: false, music: 'castle', safe: true, encounterRate: 0, region: 'baldurs-gate',
  });
  const res = reservedFor('bg-temples-district');
  const rg = root.fork('ground'), rd = root.fork('detail');
  const flag = table(G_FLAG), cobble = table(G_COBBLE);

  grect(map, 0, 0, 48, 42, tid('FLAGSTONE', 'COBBLE'));

  // --- the processional -------------------------------------------------------
  // Streets first, buildings second: `floor()` sweeps the deco and over planes,
  // so a lane painted after a house cuts a hole through it (it did: the
  // processional was carving two columns out of the south chapels) and takes
  // the tip off any spire whose point stands over it.
  for (let y = 19; y <= 21; y++) for (let x = 1; x <= 46; x++) floor(map, x, y, pickT(rg, cobble));
  floorRect(map, 1, 20, 46, 1, tid('MOSAIC', 'FLAGSTONE'));
  for (let y = 3; y <= 4; y++) for (let x = 2; x <= 45; x++) floor(map, x, y, pickT(rg, flag));
  for (let x = 12; x <= 13; x++) for (let y = 3; y <= 40; y++) floor(map, x, y, pickT(rg, flag));
  for (let x = 43; x <= 44; x++) for (let y = 3; y <= 40; y++) floor(map, x, y, pickT(rg, flag));
  for (let y = 30; y <= 31; y++) for (let x = 2; x <= 45; x++) floor(map, x, y, pickT(rg, flag));
  for (let y = 40; y <= 40; y++) for (let x = 2; x <= 45; x++) floor(map, x, y, pickT(rg, flag));
  for (let x = 24; x <= 25; x++) for (let y = 21; y <= 40; y++) floor(map, x, y, pickT(rg, flag));
  for (let x = 2; x <= 11; x++) for (let y = 10; y <= 12; y++) floor(map, x, y, pickT(rg, flag));

  // --- the High Hall ----------------------------------------------------------
  // Built as a fortress, kept as a palace, and used as whatever the Council of
  // Four needs that tenday. It fills a third of the district on its own.
  // A palace block between two towers that were a fortress's before they were
  // anybody's: red tile over dressed stone, buttressed bays, lit windows on
  // both storeys, and a spire on each tower the harbour steers by.
  building(map, {
    x: 18, y: 11, w: 14, h: 8, wall: 'STONE_WALL', roof: 'tile', base: 'FLAGSTONE',
    roofRows: 3, band: 4, windows: [2, 4, 9, 11], upper: [2, 4, 9, 11], buttress: [3, 10],
    door: 6, lit: true, chimney: 2, chimney2: 11, approach: 1, dormer: [4, 9], rose: 6,
  }, res);
  tower(map, { x: 15, y: 5, w: 3, h: 14, wall: 'STONE_WALL', roof: 'tile', windows: [3, 6, 9, 12], lit: true, base: 'FLAGSTONE' }, res);
  tower(map, { x: 32, y: 5, w: 3, h: 14, wall: 'STONE_WALL', roof: 'tile', windows: [3, 6, 9, 12], lit: true, base: 'FLAGSTONE' }, res);
  // The colonnade stands in front of the Hall, not across its door.
  for (const x of [17, 19, 21, 27, 29, 31]) prop(map, x, 19, tid('PILLAR', 'STONE_WALL'), res);
  prop(map, 22, 19, tid('STATUE', 'PILLAR'), res);
  prop(map, 26, 19, tid('STATUE', 'PILLAR'), res);
  for (const x of [16, 20, 28, 33]) prop(map, x, 20, tid('BRAZIER', 'TORCH'), res);
  // The Parliament of Peers keeps its own door in the Hall's east face. It goes
  // to the same benches; the peers simply refuse to use the Council's steps.
  dset(map, 33, 18, tid('IRON_DOOR', 'STONE_WALL'));
  prop(map, 35, 17, tid('SIGN', 'CRATE'), res);
  prop(map, 35, 15, tid('TORCH', 'CANDLE'), res);

  // --- the Unrolling Scroll ---------------------------------------------------
  // Oghma's, in white marble under a red roof with the gold trim the Order
  // insists on. The smallest building on the street and the loudest.
  building(map, {
    x: 34, y: 22, w: 8, h: 5, wall: 'STONE_WALL', roof: 'tile', base: 'FLAGSTONE',
    roofRows: 2, windows: [], stained: [1, 6], door: 4, dormer: [2, 5],
    sign: 6, trade: 'book', lit: true, approach: 1, buttress: [3],
  }, res);
  for (const x of [34, 36, 40, 41]) prop(map, x, 27, tid('PILLAR', 'STONE_WALL'), res);
  prop(map, 33, 24, tid('BOOKSHELF', 'SHELF_GOODS'), res);
  prop(map, 38, 28, tid('CANDLE', 'TORCH'), res);

  // --- the lesser shrines along the south -------------------------------------
  // Each a chapel of its own god, and each with a tower: a street of spires is
  // what makes this the Temples and not a row of warehouses.
  for (const [x, y, w, h, roof, wall, side, spire] of [
    [4, 24, 7, 5, 'slate', 'STONE_WALL', 'W', 'slate'], [4, 33, 7, 5, 'tile', 'BRICK_WALL', 'E', 'tile'],
    [14, 33, 7, 5, 'slate', 'STONE_WALL', 'W', 'slate'], [24, 33, 7, 5, 'tile', 'STONE_WALL', 'E', 'tile'],
    [34, 33, 8, 5, 'slate', 'BRICK_WALL', 'W', 'slate'],
  ]) {
    temple(map, {
      x, y, w, h, wall, roof, spire, tower: side, tw: 2, th: h + 1, base: 'FLAGSTONE',
      stained: [1, w - 4], lit: ((x + y) & 1) === 0,
    }, res);
  }
  for (const [x, y, t] of [[6, 30, 'ALTAR'], [9, 30, 'CANDLE'], [6, 39, 'SHRINE'],
    [16, 39, 'STATUE'], [26, 39, 'ALTAR'], [36, 39, 'SHRINE'], [19, 39, 'CANDLE'],
    [29, 39, 'CANDLE'], [39, 39, 'CANDLE']]) prop(map, x, y, tid(t, 'SHRINE'), res);
  for (let x = 3; x <= 43; x += 5) prop(map, x, 31, tid('HEDGE', 'BUSH'), res);

  // The forecourt: a walled garden of oaks and hedges either side of the Hall.
  bigOak(map, 6, 14); bigOak(map, 9, 16); bigOak(map, 38, 8); bigOak(map, 41, 11);
  for (let y = 8; y <= 17; y += 3) { prop(map, 3, y, tid('HEDGE', 'BUSH'), res); prop(map, 45, y, tid('HEDGE', 'BUSH'), res); }
  prop(map, 7, 21, tid('FOUNTAIN', 'WELL'), res);
  prop(map, 40, 21, tid('FOUNTAIN', 'WELL'), res);
  for (const [x, y] of [[5, 22], [42, 22], [14, 22], [30, 22]]) prop(map, x, y, tid('BENCH', 'CRATE'), res);
  scatter(map, rd, 2, 4, 44, 36, table([['BENCH', 4], ['HEDGE', 4], ['CANDLE', 2]]), 0.02, res);

  map.recomputeFlags({ keep: 0 });
  sealBorder(map, tid('STONE_WALL', 'BRICK_WALL'));
  sweepStanding(map, 'bg-temples-district');
  openWarpTiles(map, 'bg-temples-district');
  map.spawn = { x: 4, y: 20 };
  map.entry = { ...map.spawn };
  map.level = 13;
  fillDeadPockets(map, 'bg-temples-district', 'STONE_WALL');

  prop(map, 21, 22, tid('SIGN', 'CRATE'), res);
  prop(map, 33, 28, tid('SIGN', 'CRATE'), res);
  addSign(map, 21, 22, 'THE HIGH HALL. Ducal palace, Council chamber, and the Parliament of Peers’ benches, all under one roof that was a fortress first and has never entirely stopped being one.');
  addSign(map, 35, 17, 'THE PARLIAMENT OF PEERS. Fifty-odd patriars advise, complain, and — four times in the city’s history — elect. Sittings are public. Attend one and you will not attend two.');
  addSign(map, 33, 28, 'THE UNROLLING SCROLL, of the Order of the Unrolling Scroll, to Oghma Lord of Knowledge. Copying, translation, and identification of the arcane. Silence in the nave.');
  return map;
}

// --- Citadel Streets: the Watch, and the manors nobody may enter -----------
function buildCitadelStreets(root) {
  const map = new TileMap({
    w: 46, h: 40, id: 'bg-citadel-streets', name: 'Citadel Streets', biome: 'city',
    indoor: false, music: 'castle', safe: true, encounterRate: 0, region: 'baldurs-gate',
  });
  const res = reservedFor('bg-citadel-streets');
  const rg = root.fork('ground'), rd = root.fork('detail');
  const flag = table(G_FLAG), gravel = table(G_YARD);

  grect(map, 0, 0, 46, 40, tid('FLAGSTONE', 'COBBLE'));

  // --- the Watch Citadel, called the Stormkeep -------------------------------
  // No windows on the ground row, a portcullis, and nine courses of blank stone
  // above the street. The Watch police the Upper City; the Fist police
  // everywhere else, and neither has ever forgiven the other for it.
  building(map, {
    x: 14, y: 9, w: 18, h: 10, wall: 'STONE_WALL', roof: 'tile', base: 'FLAGSTONE',
    roofRows: 2, band: 5, windows: [], upper: [3, 8, 14], door: 8, sign: 11,
    iron: true, lit: true, chimney: 2, chimney2: 15, approach: 1,
  }, res);
  for (const x of [14, 16, 30, 31]) prop(map, x, 19, tid('PILLAR', 'STONE_WALL'), res);
  for (const [x, y] of [[13, 20], [33, 20], [18, 20], [27, 20]]) prop(map, x, y, tid('TORCH', 'CANDLE'), res);
  prop(map, 20, 20, tid('STATUE', 'PILLAR'), res);
  prop(map, 25, 20, tid('STATUE', 'PILLAR'), res);

  // --- the drill yard ---------------------------------------------------------
  grect(map, 14, 22, 18, 8, tid('GRAVEL', 'FLAGSTONE'));
  for (const [x, y, t] of [[15, 23, 'ANVIL'], [17, 23, 'GRINDSTONE'], [30, 23, 'CRATE'],
    [30, 28, 'BARREL'], [15, 28, 'CRATE']]) prop(map, x, y, tid(t, 'CRATE'), res);
  for (let x = 20; x <= 27; x += 3) { prop(map, x, 24, tid('TIMBER_SUPPORT', 'PILLAR'), res); prop(map, x, 28, tid('TIMBER_SUPPORT', 'PILLAR'), res); }
  prop(map, 23, 26, tid('SIGN', 'CRATE'), res);

  // --- three patriar manors, walled, and none of them opens ------------------
  const manor = (x, y, w, h, gx) => {
    shell(map, {
      x: x + 2, y: y + 2, w: w - 4, h: h - 5, wall: 'BRICK_WALL', roof: 'tile',
      base: 'FLAGSTONE', roofRows: 2, band: 3, windows: [1, w - 6],
      upper: [2, w - 7], chimney: w - 6, chimney2: 1,
    }, res);
    for (let i = x; i < x + w; i++) { prop(map, i, y, tid('STONE_FENCE', 'FENCE_H'), res); prop(map, i, y + h - 1, tid('STONE_FENCE', 'FENCE_H'), res); }
    for (let j = y; j < y + h; j++) { prop(map, x, j, tid('STONE_FENCE', 'FENCE_V'), res); prop(map, x + w - 1, j, tid('STONE_FENCE', 'FENCE_V'), res); }
    dset(map, gx, y + h - 1, tid('GATE', 'STONE_FENCE'));
    prop(map, x + 1, y + h - 2, tid('HEDGE', 'BUSH'), res);
    prop(map, x + w - 2, y + h - 2, tid('HEDGE', 'BUSH'), res);
    bigOak(map, x + 1, y + 1);
    prop(map, gx, y + h - 3, tid('SIGN', 'HEDGE'), res);
    return { x: gx, y: y + h - 1 };
  };
  const oberon = manor(2, 2, 12, 9, 7);
  const sashen = manor(17, 1, 12, 6, 22);
  const dlusker = manor(33, 2, 11, 9, 38);

  // --- the streets ------------------------------------------------------------
  for (let y = 19; y <= 21; y++) for (let x = 1; x <= 44; x++) floor(map, x, y, pickT(rg, flag));
  for (let x = 8; x <= 9; x++) for (let y = 11; y <= 38; y++) floor(map, x, y, pickT(rg, flag));
  for (let x = 36; x <= 37; x++) for (let y = 11; y <= 38; y++) floor(map, x, y, pickT(rg, flag));
  for (let y = 11; y <= 12; y++) for (let x = 2; x <= 43; x++) floor(map, x, y, pickT(rg, flag));
  for (let y = 32; y <= 33; y++) for (let x = 2; x <= 43; x++) floor(map, x, y, pickT(rg, flag));
  for (let y = 38; y <= 38; y++) for (let x = 2; x <= 43; x++) floor(map, x, y, pickT(rg, flag));
  for (let x = 22; x <= 23; x++) for (let y = 30; y <= 38; y++) floor(map, x, y, pickT(rg, flag));
  grect(map, 14, 22, 18, 8, tid('GRAVEL', 'FLAGSTONE'));

  // --- what a rich street has instead of people ------------------------------
  for (const [x, y, w, h] of [[2, 34, 6, 4], [10, 34, 7, 4], [27, 34, 8, 4], [38, 34, 6, 4]]) {
    patriarHouse(map, { x, y, w, h, rows: 1, upper: [2], windows: [1, w - 2], chimney: w - 2, lit: ((x + y) & 1) === 0 }, res);
  }
  for (const [x, y] of [[10, 21], [34, 21], [20, 33], [30, 33]]) prop(map, x, y, tid('BRAZIER', 'TORCH'), res);
  for (const [x, y] of [[4, 21], [42, 21], [6, 33], [40, 33]]) prop(map, x, y, tid('BENCH', 'CRATE'), res);
  bigOak(map, 4, 14); bigOak(map, 41, 14); bigOak(map, 4, 26); bigOak(map, 41, 26);
  for (let y = 14; y <= 30; y += 4) { prop(map, 2, y, tid('HEDGE', 'BUSH'), res); prop(map, 43, y, tid('HEDGE', 'BUSH'), res); }
  // Perrin Thorngage's entirely unlicensed pie stall, parked where the Watch
  // must walk past it and has decided not to notice.
  prop(map, 12, 22, tid('CART', 'CRATE'), res);
  prop(map, 12, 23, tid('SACK', 'CRATE'), res);
  scatter(map, rd, 2, 12, 42, 26, table([['HEDGE', 4], ['BENCH', 3], ['CRATE', 2]]), 0.015, res);

  map.recomputeFlags({ keep: 0 });
  wearPatches(map, rd, { x: 24, y: 11, w: 9, h: 15 }, 'COBBLE_ISLE', 7, { res });
  wearPatches(map, rd, { x: 2, y: 20, w: 42, h: 5 }, 'GRAVEL_ISLE', 8, { res });
  map.recomputeFlags({ keep: 0 });
  sealBorder(map, tid('STONE_WALL', 'BRICK_WALL'));
  sweepStanding(map, 'bg-citadel-streets');
  openWarpTiles(map, 'bg-citadel-streets');
  map.spawn = { x: 42, y: 20 };
  map.entry = { ...map.spawn };
  map.level = 13;
  fillDeadPockets(map, 'bg-citadel-streets', 'STONE_WALL');

  prop(map, 19, 22, tid('SIGN', 'CRATE'), res);
  addSign(map, 19, 22, 'THE WATCH CITADEL, which the Watch call the Stormkeep and the Flaming Fist call several other things. Watch jurisdiction ends at the Old Wall and the Watch would like that written larger.');
  addSign(map, 23, 26, 'DRILL YARD — Watch only. Recruits at the sixth bell, veterans at the eighth, and the Fist not at all.');
  addSign(map, oberon.x, oberon.y - 2, 'OBERON. Dry docks, shipwrights, and four generations of patriars who have never once opened this gate to a stranger.');
  addSign(map, sashen.x, sashen.y - 2, 'SASHENSTAR. Duchess Katernin holds the chair Belynne Stelmane held until 1492. The shutters on the north face have not been opened since.');
  addSign(map, dlusker.x, dlusker.y - 2, 'DLUSKER. Duke Bardeid keeps Thalamra Vanthampur’s old seat, and a doorplate polished so hard the name beneath it is nearly gone.');
  return map;
}

// ---------------------------------------------------------------------------
// 4. INTERIORS
// ---------------------------------------------------------------------------
//
// Every interior warps out at [floor(w/2), h-1] and lands one row up, which is
// what `room()` builds by default and what the link table in §6 assumes. Sizes
// are therefore load-bearing: change one and the door outside stops lining up.

/** A table with chairs round it, which is most of what a taproom is. */
function tableAt(map, r, x, y, res) {
  prop(map, x, y, tid('TABLE', 'BENCH'), res);
  prop(map, x - 1, y, tid('CHAIR', 'BENCH'), res);
  prop(map, x + 1, y, tid('CHAIR', 'BENCH'), res);
  if (r.chance(0.6)) prop(map, x, y + 1, tid('CHAIR', 'BENCH'), res);
  prop(map, x, y, tid('TABLE', 'BENCH'), res);
}
/** A run of one tile, left to right. */
function run(map, x0, x1, y, name, res) {
  for (let x = x0; x <= x1; x++) prop(map, x, y, tid(name, 'CRATE'), res);
}
/** A run of one tile, top to bottom. */
function runV(map, x, y0, y1, name, res) {
  for (let y = y0; y <= y1; y++) prop(map, x, y, tid(name, 'CRATE'), res);
}

// --- Baldur's Mouth: the broadsheet, the press and the bell rope ------------
function buildBaldursMouth(root) {
  const map = interiorMap({ id: 'baldurs-mouth', name: "Baldur's Mouth", w: 20, h: 16, music: 'shop' });
  const res = reservedFor('baldurs-mouth');
  const r = root.fork('mouth');
  const rm = room(map, { w: 20, h: 16, floor: 'WOOD_FLOOR_H', wall: 'BRICK_WALL' });

  // the type cases and the press
  run(map, 2, 16, 1, 'SHELF_GOODS', res);
  for (let x = 6; x <= 12; x++) prop(map, x, 4, tid('COUNTER', 'TABLE'), res);
  prop(map, 9, 3, tid('LEVER', 'ANVIL'), res);            // the press screw
  prop(map, 10, 3, tid('ANVIL', 'GRINDSTONE'), res);
  prop(map, 2, 3, tid('BOOKSHELF', 'SHELF_GOODS'), res);
  prop(map, 17, 3, tid('BOOKSHELF', 'SHELF_GOODS'), res);
  runV(map, 1, 5, 9, 'BOOKSHELF', res);
  runV(map, 18, 5, 9, 'BOOKSHELF', res);
  tableAt(map, r, 4, 8, res); tableAt(map, r, 15, 8, res);
  tableAt(map, r, 6, 12, res); tableAt(map, r, 14, 12, res);
  for (const [x, y] of [[3, 6], [16, 6], [8, 6]]) prop(map, x, y, tid('CRATE', 'BARREL'), res);
  prop(map, 8, 3, tid('CANDLE', 'TORCH'), res);
  // Composing, proofing and dispatch each occupy a working bay. Keep the
  // middle two columns open from the street to the press and bell rope.
  run(map, 3, 6, 6, 'COUNTER', res);
  run(map, 13, 16, 6, 'COUNTER', res);
  run(map, 3, 5, 10, 'SHELF_GOODS', res);
  run(map, 14, 16, 10, 'BOOKSHELF', res);
  run(map, 3, 5, 13, 'COUNTER', res);
  prop(map, 3, 12, tid('SACK', 'CRATE'), res);
  prop(map, 16, 13, tid('CRATE', 'BARREL'), res);
  prop(map, 17, 13, tid('SACK', 'CRATE'), res);
  // the bell rope, up through the roof
  prop(map, 10, 1, tid('SHRINE', 'STATUE'), res);
  oset(map, 10, 6, tid('CHANDELIER', 'CANDLE'));
  oset(map, 6, 10, tid('CHANDELIER', 'CANDLE'));

  finishInterior(map, r, rm.exit, res);
  addSign(map, 9, 4, 'BACK ISSUES, ONE COPPER.\n\n1491 — THALAMRA VANTHAMPUR DEAD. The duchess is taken in the night; the Fist say nothing and say it loudly.\n\n1492 — DUCHESS STELMANE MURDERED IN THE ELFSONG. No arrest. The Bhaalists are named on the fourth page and denied on the first.\n\n1492 — THE ABSOLUTE BROKEN AT THE HIGH HALL. Grand Duke Ravengard returns to the city he was taken out of.\n\n1496 — THE FOURTH CHAIR STILL WARM. Sashenstar and Dlusker sit where Stelmane and Vanthampur sat, and the Parliament asks whose money put them there.');
  map.addTrigger({ id: 'mouth-board', kind: 'quest', x: 10, y: 1, data: { board: 'baldurs-mouth', npc: 'rowan-linnacker' } });
  return map;
}

// --- the High Hall: the Council's table, the Parliament's benches -----------
function buildHighHall(root) {
  const map = interiorMap({
    id: 'high-hall', name: 'The High Hall', w: 30, h: 24, music: 'castle',
    ambient: { color: '#1a1c2e', alpha: 0.12 },
  });
  const res = reservedFor('high-hall');
  const r = root.fork('highhall');
  const rm = room(map, { w: 30, h: 24, floor: 'STONE_FLOOR', wall: 'STONE_WALL' });

  // The processional floor: a mosaic aisle from the door to the dais, which is
  // the only piece of colour in the room and is meant to be walked down.
  floorRect(map, 13, 4, 4, 19, tid('MOSAIC', 'STONE_FLOOR'));
  floorRect(map, 8, 2, 14, 3, tid('MOSAIC', 'STONE_FLOOR'));

  // the colonnade
  for (let y = 6; y <= 20; y += 3) { prop(map, 6, y, tid('PILLAR', 'STONE_WALL'), res); prop(map, 23, y, tid('PILLAR', 'STONE_WALL'), res); }
  for (const [x, y] of [[5, 4], [24, 4], [5, 22], [24, 22]]) prop(map, x, y, tid('BRAZIER', 'TORCH'), res);

  // the dais, and the Council of Four's table on it
  run(map, 11, 18, 1, 'SHELF_GOODS', res);
  prop(map, 12, 2, tid('STATUE', 'PILLAR'), res);
  prop(map, 17, 2, tid('STATUE', 'PILLAR'), res);
  for (let x = 13; x <= 16; x++) prop(map, x, 4, tid('TABLE', 'BENCH'), res);
  for (const x of [13, 14, 15, 16]) prop(map, x, 3, tid('CHAIR', 'BENCH'), res);
  prop(map, 12, 4, tid('CHAIR', 'BENCH'), res);
  prop(map, 17, 4, tid('CHAIR', 'BENCH'), res);

  // the Parliament of Peers' benches, tiered down both sides of the aisle
  for (let y = 8; y <= 18; y += 2) {
    run(map, 8, 11, y, 'BENCH', res);
    run(map, 18, 21, y, 'BENCH', res);
  }
  // Ravengard's map room, behind the west colonnade
  prop(map, 2, 3, tid('TABLE', 'BENCH'), res);
  prop(map, 3, 3, tid('TABLE', 'BENCH'), res);
  prop(map, 2, 2, tid('BOOKSHELF', 'SHELF_GOODS'), res);
  prop(map, 3, 2, tid('BOOKSHELF', 'SHELF_GOODS'), res);
  prop(map, 2, 5, tid('CHAIR', 'BENCH'), res);
  runV(map, 1, 7, 16, 'BOOKSHELF', res);
  // the peers' own door, in the east wall
  prop(map, 28, 12, tid('BOOKSHELF', 'SHELF_GOODS'), res);
  runV(map, 28, 7, 11, 'BOOKSHELF', res);
  for (const [x, y] of [[26, 4], [26, 20]]) prop(map, x, y, tid('CHEST_CLOSED', 'CRATE'), res);
  // Clerks' bays behind the colonnades turn the long empty side aisles into
  // an active civic building; transverse gaps keep each bay accessible.
  for (const y of [8, 14, 19]) {
    run(map, 2, 4, y, 'TABLE', res);
    prop(map, 3, y - 1, tid('CHAIR', 'BENCH'), res);
    run(map, 25, 27, y, 'TABLE', res);
    prop(map, 26, y - 1, tid('CHAIR', 'BENCH'), res);
  }
  for (const y of [11, 17]) {
    run(map, 2, 3, y, 'BOOKSHELF', res);
    run(map, 26, 27, y, 'SHELF_GOODS', res);
  }
  // Petitioners gather beside the entrance, outside the processional aisle.
  run(map, 8, 10, 21, 'BENCH', res);
  run(map, 19, 21, 21, 'BENCH', res);
  prop(map, 7, 21, tid('PLANTER', 'STATUE'), res);
  prop(map, 22, 21, tid('PLANTER', 'STATUE'), res);
  for (let x = 8; x <= 21; x += 5) oset(map, x, 10, tid('CHANDELIER', 'CANDLE'));
  oset(map, 14, 6, tid('CHANDELIER', 'CANDLE'));

  finishInterior(map, r, rm.exit, res);
  addSign(map, 14, 5, 'THE COUNCIL OF FOUR, 1496 DR: ULDER RAVENGARD, Grand Duke and Marshal of the Flaming Fist. DILLARD PORTYR, who held the post and gave it up. KATERNIN SASHENSTAR. BARDEID DLUSKER.\n\nTwo of those chairs have been re-cut since 1492 and the Parliament has not stopped remarking on it.');
  map.addTrigger({ id: 'high-hall-board', kind: 'quest', x: 15, y: 5, data: { board: 'lords-alliance', npc: 'ulder-ravengard' } });
  return map;
}

// --- the Unrolling Scroll: Oghma's, and the best-read room in the south -----
function buildUnrollingScroll(root) {
  const map = interiorMap({ id: 'unrolling-scroll', name: 'The Unrolling Scroll', w: 22, h: 18, music: 'shop' });
  const res = reservedFor('unrolling-scroll');
  const r = root.fork('scroll');
  const rm = room(map, { w: 22, h: 18, floor: 'WOOD_FLOOR', wall: 'STONE_WALL' });

  run(map, 2, 19, 1, 'BOOKSHELF', res);
  runV(map, 1, 2, 12, 'BOOKSHELF', res);
  runV(map, 20, 2, 12, 'BOOKSHELF', res);
  for (let y = 5; y <= 11; y += 3) { run(map, 4, 8, y, 'BOOKSHELF', res); run(map, 13, 17, y, 'BOOKSHELF', res); }
  floorRect(map, 9, 2, 4, 5, tid('MOSAIC', 'WOOD_FLOOR'));
  prop(map, 10, 3, tid('ALTAR', 'SHRINE'), res);
  prop(map, 11, 3, tid('ALTAR', 'SHRINE'), res);
  prop(map, 9, 3, tid('CANDLE', 'TORCH'), res);
  prop(map, 12, 3, tid('CANDLE', 'TORCH'), res);
  for (let x = 8; x <= 13; x++) prop(map, x, 14, tid('COUNTER', 'TABLE'), res);
  tableAt(map, r, 4, 14, res); tableAt(map, r, 17, 14, res);
  prop(map, 3, 16, tid('CHEST_CLOSED', 'CRATE'), res);
  oset(map, 10, 8, tid('CHANDELIER', 'CANDLE'));
  oset(map, 5, 12, tid('CHANDELIER', 'CANDLE'));
  oset(map, 16, 12, tid('CHANDELIER', 'CANDLE'));

  finishInterior(map, r, rm.exit, res);
  map.addTrigger({ id: 'scroll-shop', kind: 'shop', x: 10, y: 15, data: { shop: 'unrolling-scroll', npc: 'erdan-galanodel' } });
  addSign(map, 11, 4, 'Bind what is loose. Copy what is rare. Read what is written and then read who wrote it. — the Order of the Unrolling Scroll');
  return map;
}

// --- the Watch Citadel: the Stormkeep's ground floor ------------------------
function buildWatchCitadel(root) {
  const map = interiorMap({
    id: 'watch-citadel', name: 'The Watch Citadel', w: 26, h: 20, music: 'tense',
    ambient: { color: '#161a22', alpha: 0.14 },
  });
  const res = reservedFor('watch-citadel');
  const r = root.fork('citadel');
  const rm = room(map, { w: 26, h: 20, floor: 'STONE_FLOOR', wall: 'STONE_WALL' });

  // the armoury wall
  run(map, 2, 23, 1, 'SHELF_GOODS', res);
  runV(map, 1, 2, 8, 'SHELF_GOODS', res);
  for (let x = 8; x <= 15; x++) prop(map, x, 5, tid('COUNTER', 'TABLE'), res);
  prop(map, 3, 4, tid('ANVIL', 'FORGE'), res);
  prop(map, 4, 4, tid('GRINDSTONE', 'ANVIL'), res);
  prop(map, 22, 3, tid('FORGE', 'HEARTH'), res);
  // the cells, along the east wall, with iron doors that do not open
  for (let y = 8; y <= 16; y += 3) {
    for (let x = 20; x <= 24; x++) prop(map, x, y, tid('STONE_WALL', 'BRICK_WALL'), res);
    dset(map, 20, y + 1, tid('IRON_DOOR', 'STONE_WALL'));
    for (let x = 21; x <= 24; x++) prop(map, x, y + 1, tid('STONE_WALL', 'BRICK_WALL'), res);
  }
  // the duty room
  tableAt(map, r, 5, 10, res); tableAt(map, r, 12, 10, res); tableAt(map, r, 6, 15, res);
  run(map, 10, 16, 17, 'BENCH', res);
  for (const [x, y] of [[2, 12], [17, 8], [2, 17], [17, 17]]) prop(map, x, y, tid('BRAZIER', 'TORCH'), res);
  for (const [x, y] of [[16, 3], [18, 5]]) prop(map, x, y, tid('CRATE', 'BARREL'), res);
  prop(map, 24, 18, tid('CHEST_CLOSED', 'CRATE'), res);
  oset(map, 8, 8, tid('CHANDELIER', 'CANDLE'));
  oset(map, 16, 13, tid('CHANDELIER', 'CANDLE'));

  finishInterior(map, r, rm.exit, res);
  map.addTrigger({ id: 'watch-armoury-shop', kind: 'shop', x: 11, y: 6, data: { shop: 'watch-armoury', npc: 'delg-ironfist' } });
  addSign(map, 12, 6, 'WATCH ARMOURY. Watch pattern arms are issued against a writ and returned against a writ. Sold to no one, which the Armiger will explain at length if pressed.');
  return map;
}

// --- the Seatower of Balduran: Flaming Fist headquarters --------------------
function buildSeatower(root) {
  const map = interiorMap({
    id: 'seatower-of-balduran', name: 'The Seatower of Balduran', w: 28, h: 22,
    music: 'castle', ambient: { color: '#15202c', alpha: 0.14 },
  });
  const res = reservedFor('seatower-of-balduran');
  const r = root.fork('seatower');
  const rm = room(map, { w: 28, h: 22, floor: 'STONE_FLOOR', wall: 'STONE_WALL' });

  for (let y = 5; y <= 17; y += 4) { prop(map, 6, y, tid('PILLAR', 'STONE_WALL'), res); prop(map, 21, y, tid('PILLAR', 'STONE_WALL'), res); }
  // the map table, which is the whole point of the room
  floorRect(map, 11, 6, 6, 5, tid('MOSAIC', 'STONE_FLOOR'));
  for (let x = 12; x <= 15; x++) for (let y = 7; y <= 9; y++) prop(map, x, y, tid('TABLE', 'BENCH'), res);
  for (const [x, y] of [[11, 7], [16, 7], [11, 9], [16, 9]]) prop(map, x, y, tid('CHAIR', 'BENCH'), res);
  // the arms wall, the banners, the muster board
  run(map, 2, 25, 1, 'SHELF_GOODS', res);
  runV(map, 1, 2, 10, 'SHELF_GOODS', res);
  runV(map, 26, 2, 10, 'SHELF_GOODS', res);
  prop(map, 13, 1, tid('STATUE', 'PILLAR'), res);
  prop(map, 14, 1, tid('STATUE', 'PILLAR'), res);
  // the mess, the bunks, the stair
  for (let y = 13; y <= 19; y += 3) { run(map, 3, 8, y, 'BED', res); run(map, 19, 24, y, 'BED', res); }
  tableAt(map, r, 12, 14, res); tableAt(map, r, 15, 18, res);
  floor(map, 25, 20, tid('STAIRS_UP', 'STONE_FLOOR'));
  for (const [x, y] of [[3, 3], [24, 3], [3, 20], [10, 20]]) prop(map, x, y, tid('BRAZIER', 'TORCH'), res);
  for (const [x, y] of [[9, 4], [18, 4]]) prop(map, x, y, tid('CRATE', 'BARREL'), res);
  prop(map, 2, 12, tid('CHEST_CLOSED', 'CRATE'), res);
  oset(map, 13, 5, tid('CHANDELIER', 'CANDLE'));
  oset(map, 8, 16, tid('CHANDELIER', 'CANDLE'));

  finishInterior(map, r, rm.exit, res);
  map.addTrigger({ id: 'seatower-board', kind: 'quest', x: 13, y: 11, data: { board: 'lords-alliance', npc: 'imzel-chergoba' } });
  addSign(map, 14, 11, 'FLAMING FIST — SOUTHERN CONTRACTS. Escort, road-clearing and standing bounties on the Coast Way. Rates are posted. They are not negotiable, and neither is the Flame who posted them.');
  return map;
}

// --- the Water Queen's House: Umberlee's, at Umberlee's prices --------------
function buildWaterQueensHouse(root) {
  const map = interiorMap({
    id: 'water-queens-house', name: "The Water Queen's House", w: 22, h: 18,
    music: 'tense', ambient: { color: '#0e2230', alpha: 0.18 },
  });
  const res = reservedFor('water-queens-house');
  const r = root.fork('umberlee');
  const rm = room(map, { w: 22, h: 18, floor: 'STONE_FLOOR', wall: 'STONE_WALL' });

  // the tide pool: sea water brought up the cliff and never let out again
  floorRect(map, 8, 3, 6, 5, tid('WATER', 'SWAMP_WATER'));
  floorRect(map, 7, 2, 8, 1, tid('MOSAIC', 'STONE_FLOOR'));
  prop(map, 10, 2, tid('ALTAR', 'SHRINE'), res);
  prop(map, 11, 2, tid('ALTAR', 'SHRINE'), res);
  prop(map, 7, 3, tid('SHRINE', 'ALTAR'), res);
  prop(map, 14, 3, tid('SHRINE', 'ALTAR'), res);
  prop(map, 7, 7, tid('SKULL_PILE', 'BONES'), res);
  prop(map, 14, 7, tid('BONES', 'SKULL_PILE'), res);
  for (const [x, y] of [[6, 2], [15, 2], [6, 8], [15, 8]]) prop(map, x, y, tid('CANDLE', 'TORCH'), res);
  for (let y = 4; y <= 12; y += 4) { prop(map, 3, y, tid('PILLAR', 'STONE_WALL'), res); prop(map, 18, y, tid('PILLAR', 'STONE_WALL'), res); }
  runV(map, 1, 3, 12, 'SHELF_GOODS', res);
  runV(map, 20, 3, 12, 'SHELF_GOODS', res);
  run(map, 8, 13, 11, 'COUNTER', res);
  run(map, 5, 16, 14, 'BENCH', res);
  prop(map, 2, 16, tid('BARREL', 'CRATE'), res);
  prop(map, 19, 16, tid('BARREL', 'CRATE'), res);
  prop(map, 4, 10, tid('FOUNTAIN', 'WELL'), res);
  prop(map, 17, 10, tid('FOUNTAIN', 'WELL'), res);
  oset(map, 11, 6, tid('CHANDELIER', 'CANDLE'));

  finishInterior(map, r, rm.exit, res);
  map.addTrigger({ id: 'umberlee-shop', kind: 'shop', x: 10, y: 12, data: { shop: 'water-queens-house', npc: 'vonda-pisacar' } });
  map.addTrigger({ id: 'umberlee-altar', kind: 'quest', x: 10, y: 3, w: 2, h: 1, data: { deity: 'umberlee', text: 'The pool is salt and it is not still. Whatever is dropped into it is not seen again, and the priestesses say that is the point.' } });
  return map;
}

// --- the Low Lantern: three decks, no last orders --------------------------
function buildLowLantern(root) {
  const map = interiorMap({ id: 'low-lantern', name: 'The Low Lantern', w: 22, h: 16, music: 'tavern' });
  const res = reservedFor('low-lantern');
  const r = root.fork('lantern');
  const rm = room(map, {
    w: 22, h: 16, floor: 'WOOD_FLOOR', wall: 'LOG_WALL', post: 'TIMBER_SUPPORT',
    // The galley, forward of the bar. A ship that feeds people has one.
    rooms: [{ x: 0, y: 0, w: 5, h: 6, door: 'e', name: 'galley' }],
  });

  run(map, 6, 13, 4, 'BAR', res);
  run(map, 5, 15, 1, 'SHELF_GOODS', res);
  prop(map, 4, 1, tid('BARREL', 'CRATE'), res);
  prop(map, 16, 1, tid('BARREL', 'CRATE'), res);
  prop(map, 1, 3, tid('HEARTH', 'BRAZIER'), res);
  floorRect(map, 2, 2, 3, 4, tid('WOOD_FLOOR_H', 'WOOD_FLOOR'));
  tableAt(map, r, 4, 8, res); tableAt(map, r, 10, 8, res); tableAt(map, r, 16, 8, res);
  tableAt(map, r, 7, 12, res); tableAt(map, r, 14, 12, res);
  for (const [x, y] of [[2, 11], [19, 11], [2, 13], [19, 6]]) prop(map, x, y, tid('CRATE', 'BARREL'), res);
  prop(map, 20, 2, tid('CHEST_CLOSED', 'CRATE'), res);
  floor(map, 19, 1, tid('STAIRS_UP', 'WOOD_FLOOR'));
  for (const [x, y] of [[5, 6], [16, 6], [9, 3]]) prop(map, x, y, tid('CANDLE', 'TORCH'), res);
  for (const x of [5, 10, 16]) oset(map, x, 10, tid('CHANDELIER', 'CANDLE'));

  finishInterior(map, r, rm.exit, res);
  map.addTrigger({ id: 'low-lantern-shop', kind: 'shop', x: 9, y: 5, data: { shop: 'low-lantern', npc: 'marta-agosto' } });
  map.addTrigger({ id: 'low-lantern-rest', kind: 'rest', x: 19, y: 2, w: 1, h: 1, data: { inn: true, cost: 9, text: 'A hammock on the second deck, and the river moving under you all night. Rest here?' } });
  return map;
}

// --- the Counting House: the bank, and it looks like one -------------------
function buildCountingHouse(root) {
  const map = interiorMap({ id: 'counting-house', name: 'The Counting House', w: 22, h: 18, music: 'shop' });
  const res = reservedFor('counting-house');
  const r = root.fork('counting');
  const rm = room(map, { w: 22, h: 18, floor: 'STONE_FLOOR', wall: 'STONE_WALL' });

  floorRect(map, 7, 12, 8, 4, tid('MOSAIC', 'STONE_FLOOR'));
  for (let x = 6; x <= 15; x++) prop(map, x, 10, tid('COUNTER', 'TABLE'), res);
  for (let y = 4; y <= 8; y += 2) { prop(map, 2, y, tid('PILLAR', 'STONE_WALL'), res); prop(map, 19, y, tid('PILLAR', 'STONE_WALL'), res); }
  // the vault: an iron door, and a wall of strongboxes behind it
  for (let x = 7; x <= 14; x++) prop(map, x, 4, tid('STONE_WALL', 'BRICK_WALL'), res);
  dset(map, 10, 4, tid('IRON_DOOR', 'STONE_WALL'));
  dset(map, 11, 4, tid('IRON_DOOR', 'STONE_WALL'));
  run(map, 7, 14, 1, 'CHEST_CLOSED', res);
  run(map, 7, 14, 2, 'SHELF_GOODS', res);
  // the ledger desks
  runV(map, 1, 11, 15, 'BOOKSHELF', res);
  runV(map, 20, 11, 15, 'BOOKSHELF', res);
  tableAt(map, r, 4, 13, res); tableAt(map, r, 17, 13, res);
  run(map, 8, 13, 16, 'BENCH', res);
  for (const [x, y] of [[5, 6], [16, 6], [3, 16], [18, 16]]) prop(map, x, y, tid('BRAZIER', 'TORCH'), res);
  prop(map, 5, 9, tid('CANDLE', 'TORCH'), res);
  prop(map, 16, 9, tid('CANDLE', 'TORCH'), res);
  oset(map, 10, 8, tid('CHANDELIER', 'CANDLE'));
  oset(map, 6, 14, tid('CHANDELIER', 'CANDLE'));

  finishInterior(map, r, rm.exit, res);
  map.addTrigger({ id: 'counting-house-shop', kind: 'shop', x: 10, y: 11, data: { shop: 'counting-house', npc: 'amafrey-whitburn' } });
  addSign(map, 11, 11, 'THE COUNTING HOUSE. Deposit, exchange, assay, safekeeping. Gems and plate valued at the counter; the valuation is final and the Chief Teller is never wrong twice.');
  return map;
}

// --- the Blushing Mermaid: nothing surprises Kethra Buckman ----------------
function buildBlushingMermaid(root) {
  const map = interiorMap({ id: 'blushing-mermaid', name: 'The Blushing Mermaid', w: 24, h: 20, music: 'tavern' });
  const res = reservedFor('blushing-mermaid');
  const r = root.fork('mermaid');
  const rm = room(map, {
    w: 24, h: 20, floor: 'WOOD_FLOOR', wall: 'BRICK_WALL', post: 'TIMBER_SUPPORT',
    rooms: [
      { x: 0, y: 0, w: 6, h: 6, door: 'e', name: 'kitchen' },
      { x: 18, y: 12, w: 6, h: 8, door: 'w', floor: 'CARPET_RED', name: 'private room' },
    ],
  });

  // the bar, the shelves, the hearth
  run(map, 7, 15, 5, 'BAR', res);
  run(map, 6, 17, 1, 'SHELF_GOODS', res);
  prop(map, 5, 1, tid('BARREL', 'CRATE'), res);
  prop(map, 18, 1, tid('BARREL', 'CRATE'), res);
  prop(map, 1, 8, tid('HEARTH', 'BRAZIER'), res);
  prop(map, 1, 9, tid('HEARTH', 'BRAZIER'), res);
  prop(map, 1, 11, tid('COOKING_POT', 'BARREL'), res);
  floorRect(map, 2, 7, 3, 5, tid('WOOD_FLOOR_H', 'WOOD_FLOOR'));
  // the common room
  tableAt(map, r, 5, 14, res); tableAt(map, r, 11, 9, res); tableAt(map, r, 17, 14, res);
  tableAt(map, r, 9, 16, res); tableAt(map, r, 19, 9, res);
  // the back room, where the Harpers keep a table and a door they watch
  for (let y = 2; y <= 4; y++) prop(map, 20, y, tid('BRICK_WALL', 'STONE_WALL'), res);
  for (let x = 20; x <= 22; x++) prop(map, x, 4, tid('BRICK_WALL', 'STONE_WALL'), res);
  dset(map, 21, 4, tid('DOOR_OPEN', 'DOOR_CLOSED'));
  prop(map, 22, 2, tid('TABLE', 'BENCH'), res);
  prop(map, 21, 2, tid('CHAIR', 'BENCH'), res);
  prop(map, 22, 3, tid('BOOKSHELF', 'SHELF_GOODS'), res);
  // the stair, and the notice board by the door
  floor(map, 21, 17, tid('STAIRS_UP', 'WOOD_FLOOR'));
  floor(map, 21, 18, tid('WOOD_FLOOR_H', 'WOOD_FLOOR'));
  prop(map, 2, 17, tid('SIGN', 'SHELF_GOODS'), res);
  for (const [x, y] of [[6, 7], [16, 7], [4, 3]]) prop(map, x, y, tid('CANDLE', 'TORCH'), res);
  for (const x of [6, 12, 18]) oset(map, x, 12, tid('CHANDELIER', 'CANDLE'));

  finishInterior(map, r, rm.exit, res);
  map.addTrigger({ id: 'mermaid-shop', kind: 'shop', x: 11, y: 6, data: { shop: 'blushing-mermaid', npc: 'kethra-buckman' } });
  map.addTrigger({ id: 'mermaid-rest', kind: 'rest', x: 21, y: 18, w: 1, h: 1, data: { inn: true, cost: 7, text: 'A room over the taproom, a bolt on the door and a landlady who has heard worse than whatever you did today. Rest here?' } });
  map.addTrigger({ id: 'mermaid-board', kind: 'quest', x: 2, y: 17, data: { board: 'recruit', npc: 'kethra-buckman' } });
  map.addTrigger({ id: 'mermaid-harpers', kind: 'quest', x: 21, y: 3, data: { board: 'harpers', npc: 'jaheira' } });
  addSign(map, 2, 17, 'HANDS WANTED. Sellswords, guides, a cook who can be trusted with a knife, and one person willing to go down to Tumbledown after dark. Ask at the bar.');
  return map;
}

// --- the High House of Wonders: Gond's temple, and Gond's workshop ---------
function buildHighHouseOfWonders(root) {
  const map = interiorMap({ id: 'high-house-of-wonders', name: 'The High House of Wonders', w: 24, h: 20, music: 'temple' });
  const res = reservedFor('high-house-of-wonders');
  const r = root.fork('gond');
  const rm = room(map, { w: 24, h: 20, floor: 'STONE_FLOOR', wall: 'STONE_WALL' });

  // the altar is an anvil, because of course it is
  floorRect(map, 9, 2, 6, 4, tid('MOSAIC', 'STONE_FLOOR'));
  prop(map, 11, 3, tid('ANVIL', 'FORGE'), res);
  prop(map, 12, 3, tid('ANVIL', 'FORGE'), res);
  prop(map, 10, 3, tid('CANDLE', 'TORCH'), res);
  prop(map, 13, 3, tid('CANDLE', 'TORCH'), res);
  prop(map, 9, 2, tid('CRYSTAL', 'STATUE'), res);
  prop(map, 14, 2, tid('CRYSTAL', 'STATUE'), res);
  // the workshop
  prop(map, 1, 4, tid('FORGE', 'HEARTH'), res);
  prop(map, 1, 5, tid('FORGE', 'HEARTH'), res);
  prop(map, 3, 5, tid('GRINDSTONE', 'ANVIL'), res);
  prop(map, 22, 4, tid('FORGE', 'HEARTH'), res);
  prop(map, 20, 5, tid('ANVIL', 'GRINDSTONE'), res);
  for (const [x, y] of [[4, 8], [19, 8], [7, 12], [16, 12]]) prop(map, x, y, tid('LEVER', 'ANVIL'), res);
  run(map, 2, 21, 1, 'SHELF_GOODS', res);
  runV(map, 1, 8, 16, 'SHELF_GOODS', res);
  runV(map, 22, 8, 16, 'SHELF_GOODS', res);
  for (let x = 8; x <= 15; x++) prop(map, x, 9, tid('COUNTER', 'TABLE'), res);
  tableAt(map, r, 5, 15, res); tableAt(map, r, 18, 15, res); tableAt(map, r, 11, 13, res);
  for (const [x, y] of [[3, 17], [20, 17], [6, 6], [17, 6]]) prop(map, x, y, tid('CRATE', 'BARREL'), res);
  prop(map, 2, 18, tid('CART', 'CRATE'), res);
  oset(map, 11, 7, tid('CHANDELIER', 'CANDLE'));
  oset(map, 6, 11, tid('CHANDELIER', 'CANDLE'));
  oset(map, 17, 11, tid('CHANDELIER', 'CANDLE'));

  finishInterior(map, r, rm.exit, res);
  map.addTrigger({ id: 'wonders-shop', kind: 'shop', x: 11, y: 10, data: { shop: 'high-house-of-wonders', npc: 'fonkin-timbers' } });
  map.addTrigger({ id: 'wonders-altar', kind: 'quest', x: 11, y: 4, w: 2, h: 1, data: { deity: 'gond', text: 'Gond’s altar is an anvil and it is warm. Somebody was working at it an hour ago and will be again within the hour.' } });
  return map;
}

// --- the Shrine of the Suffering: Ilmater's, and utterly plain -------------
function buildShrineOfSuffering(root) {
  const map = interiorMap({
    id: 'shrine-of-suffering', name: 'The Shrine of the Suffering', w: 18, h: 16,
    music: 'temple', ambient: { color: '#241c18', alpha: 0.14 },
  });
  const res = reservedFor('shrine-of-suffering');
  const r = root.fork('ilmater');
  const rm = room(map, { w: 18, h: 16, floor: 'STONE_FLOOR', wall: 'STONE_WALL' });

  // One altar, one candle, and rows of pallets. There is nothing else, and the
  // nothing else is the argument.
  prop(map, 8, 2, tid('ALTAR', 'SHRINE'), res);
  prop(map, 9, 2, tid('ALTAR', 'SHRINE'), res);
  prop(map, 7, 2, tid('CANDLE', 'TORCH'), res);
  prop(map, 10, 2, tid('CANDLE', 'TORCH'), res);
  for (let y = 5; y <= 11; y += 3) { run(map, 2, 5, y, 'BED', res); run(map, 12, 15, y, 'BED', res); }
  run(map, 6, 11, 13, 'BENCH', res);
  for (let x = 6; x <= 11; x++) prop(map, x, 4, tid('COUNTER', 'TABLE'), res);
  prop(map, 1, 13, tid('BARREL', 'CRATE'), res);
  prop(map, 16, 13, tid('BARREL', 'CRATE'), res);
  prop(map, 1, 2, tid('HEARTH', 'BRAZIER'), res);
  prop(map, 16, 2, tid('COOKING_POT', 'BARREL'), res);
  oset(map, 8, 7, tid('CHANDELIER', 'CANDLE'));

  finishInterior(map, r, rm.exit, res);
  map.addTrigger({ id: 'suffering-shop', kind: 'shop', x: 8, y: 5, data: { shop: 'shrine-of-suffering', npc: 'anton-calabra' } });
  addSign(map, 9, 3, 'Ilmater takes the pain and asks the price afterwards, and the price is what you have. Most days that is nothing. That is still the price.');
  return map;
}

// --- the Undercellar: the Guild's market, under Heapside ------------------
function buildUndercellar(root) {
  const map = interiorMap({
    id: 'the-undercellar', name: 'The Undercellar', w: 30, h: 22, music: 'tense',
    ambient: { color: '#100c14', alpha: 0.22 },
  });
  const res = reservedFor('the-undercellar');
  const r = root.fork('undercellar');
  const rm = room(map, { w: 30, h: 22, floor: 'DUNGEON_FLOOR', wall: 'STONE_WALL', step: 'STONE_FLOOR' });

  for (let y = 4; y <= 18; y += 4) for (const x of [5, 14, 24]) prop(map, x, y, tid('PILLAR', 'STONE_WALL'), res);
  // the stall alcoves — cellars off a cellar, and nothing in them is legal
  for (const [x, y] of [[2, 2], [9, 2], [17, 2], [25, 2]]) {
    run(map, x, x + 3, y, 'SHELF_GOODS', res);
    prop(map, x, y + 1, tid('CRATE', 'BARREL'), res);
    prop(map, x + 3, y + 1, tid('BARREL', 'CRATE'), res);
  }
  for (let x = 11; x <= 18; x++) prop(map, x, 8, tid('COUNTER', 'TABLE'), res);
  tableAt(map, r, 4, 11, res); tableAt(map, r, 25, 11, res); tableAt(map, r, 9, 16, res);
  tableAt(map, r, 20, 16, res); tableAt(map, r, 15, 13, res);
  for (const [x, y] of [[2, 8], [27, 8], [2, 19], [27, 19]]) prop(map, x, y, tid('BRAZIER', 'TORCH'), res);
  for (const [x, y] of [[7, 6], [22, 6], [3, 15], [26, 15], [12, 19], [18, 19]]) prop(map, x, y, tid('BARREL', 'CRATE'), res);
  prop(map, 28, 2, tid('CHEST_CLOSED', 'CRATE'), res);
  prop(map, 1, 2, tid('COBWEB', 'RUBBLE'), res);
  scatter(map, r, 2, 4, 26, 16, table([['COBWEB', 3], ['RUBBLE', 3], ['SACK', 2]]), 0.03, res);
  for (const x of [8, 15, 22]) oset(map, x, 10, tid('CHANDELIER', 'CANDLE'));

  finishInterior(map, r, rm.exit, res);
  map.addTrigger({ id: 'undercellar-shop', kind: 'shop', x: 14, y: 9, data: { shop: 'the-undercellar', npc: 'nal-dumein' } });
  map.addTrigger({ id: 'undercellar-board', kind: 'quest', x: 15, y: 9, data: { board: 'zhentarim', npc: 'nal-dumein' } });
  return map;
}

// --- the Elfsong Tavern: the best room in the Lower City -------------------
function buildElfsongTavern(root) {
  const map = interiorMap({ id: 'elfsong-tavern', name: 'The Elfsong Tavern', w: 26, h: 20, music: 'tavern' });
  const res = reservedFor('elfsong-tavern');
  const r = root.fork('elfsong');
  const rm = room(map, {
    w: 26, h: 20, floor: 'WOOD_FLOOR', wall: 'BRICK_WALL', post: 'TIMBER_SUPPORT',
    rooms: [
      // The kitchen door is placed by hand, not by side: the builder stands a
      // cask on (5,3), which is where an 'e' door would land.
      { x: 0, y: 0, w: 6, h: 6, door: { x: 5, y: 2 }, name: 'kitchen' },
      { x: 20, y: 12, w: 6, h: 8, door: 'w', floor: 'CARPET_RED', name: 'snug' },
    ],
  });

  // the long bar, and Alan Alyth's shelves behind it
  run(map, 8, 17, 5, 'BAR', res);
  run(map, 6, 19, 1, 'SHELF_GOODS', res);
  prop(map, 5, 1, tid('BARREL', 'CRATE'), res);
  prop(map, 20, 1, tid('BARREL', 'CRATE'), res);
  prop(map, 5, 3, tid('BARREL', 'CRATE'), res);
  // the great hearth
  prop(map, 1, 8, tid('HEARTH', 'BRAZIER'), res);
  prop(map, 1, 9, tid('HEARTH', 'BRAZIER'), res);
  prop(map, 1, 10, tid('HEARTH', 'BRAZIER'), res);
  floorRect(map, 2, 7, 4, 6, tid('MOSAIC', 'WOOD_FLOOR'));
  // Shared trestles and booths, with a three-tile central service aisle.
  // Larger groups read as a crowded tavern without scatter in walking lanes.
  for (const [x,y,len] of [[6,9,3],[17,9,3],[8,14,3],[16,16,3]]) {
    run(map, x, x+len-1, y, 'TABLE', res);
    run(map, x, x+len-1, y-1, 'BENCH', res);
    run(map, x, x+len-1, y+1, 'BENCH', res);
  }
  tableAt(map, r, 12, 8, res);
  tableAt(map, r, 5, 15, res);
  tableAt(map, r, 21, 14, res);
  // Hearth nook, serving station and a quiet east-wall booth.
  run(map, 3, 4, 10, 'TABLE', res);
  run(map, 3, 4, 12, 'BENCH', res);
  run(map, 8, 10, 17, 'SHELF_GOODS', res);
  run(map, 22, 24, 7, 'BENCH', res);
  run(map, 22, 24, 8, 'TABLE', res);
  prop(map, 23, 10, tid('PLANTER', 'BARREL'), res);
  run(map, 2, 3, 17, 'BARREL', res);
  // the snug where a duchess was murdered in 1492, and nobody sits in it
  for (let y = 2; y <= 3; y++) prop(map, 22, y, tid('BRICK_WALL', 'STONE_WALL'), res);
  prop(map, 23, 3, tid('TABLE', 'BENCH'), res);
  prop(map, 24, 3, tid('CHAIR', 'BENCH'), res);
  prop(map, 24, 2, tid('CANDLE', 'TORCH'), res);
  // the stair to the rooms
  floor(map, 23, 17, tid('STAIRS_UP', 'WOOD_FLOOR'));
  floor(map, 23, 18, tid('WOOD_FLOOR_H', 'WOOD_FLOOR'));
  prop(map, 22, 18, tid('BED', 'BENCH'), res);
  for (const [x, y] of [[7, 7], [17, 7], [12, 3]]) prop(map, x, y, tid('CANDLE', 'TORCH'), res);
  for (const x of [6, 12, 18]) { oset(map, x, 11, tid('CHANDELIER', 'CANDLE')); }
  oset(map, 13, 6, tid('CHANDELIER', 'CANDLE'));

  finishInterior(map, r, rm.exit, res);
  map.addTrigger({ id: 'elfsong-shop', kind: 'shop', x: 12, y: 6, data: { shop: 'elfsong-tavern', npc: 'alan-alyth' } });
  map.addTrigger({ id: 'elfsong-rest', kind: 'rest', x: 23, y: 18, w: 1, h: 1, data: { inn: true, cost: 15, text: 'A clean room, a barred shutter, and a voice somewhere below singing in Elvish until you are asleep. Rest here?' } });
  map.addTrigger({ id: 'elfsong-snug', kind: 'quest', x: 23, y: 3, data: { text: 'The corner table. Duchess Belynne Stelmane was killed at it in 1492 and Alan Alyth has kept it laid ever since, for one, with a candle.' } });
  return map;
}

// --- Sorcerous Sundries: the only real magic shop south of Waterdeep -------
function buildSorcerousSundries(root) {
  const map = interiorMap({
    id: 'sorcerous-sundries', name: 'Sorcerous Sundries', w: 22, h: 18,
    music: 'shop', ambient: { color: '#1a1430', alpha: 0.14 },
  });
  const res = reservedFor('sorcerous-sundries');
  const r = root.fork('sundries');
  const rm = room(map, { w: 22, h: 18, floor: 'WOOD_FLOOR', wall: 'STONE_WALL' });

  run(map, 2, 19, 1, 'BOOKSHELF', res);
  runV(map, 1, 2, 13, 'BOOKSHELF', res);
  runV(map, 20, 2, 13, 'BOOKSHELF', res);
  for (let y = 4; y <= 10; y += 3) { run(map, 4, 8, y, 'BOOKSHELF', res); run(map, 13, 17, y, 'BOOKSHELF', res); }
  floorRect(map, 9, 11, 4, 4, tid('MOSAIC', 'WOOD_FLOOR'));
  for (let x = 8; x <= 13; x++) prop(map, x, 11, tid('COUNTER', 'TABLE'), res);
  prop(map, 10, 2, tid('CRYSTAL', 'STATUE'), res);
  prop(map, 11, 2, tid('CRYSTAL', 'STATUE'), res);
  prop(map, 3, 15, tid('CRYSTAL', 'STATUE'), res);
  prop(map, 18, 15, tid('CRYSTAL', 'STATUE'), res);
  for (const [x, y] of [[9, 3], [12, 3], [5, 13], [16, 13]]) prop(map, x, y, tid('CANDLE', 'TORCH'), res);
  prop(map, 2, 16, tid('CHEST_CLOSED', 'CRATE'), res);
  prop(map, 19, 16, tid('BARREL', 'CRATE'), res);
  // Appraisal and packing occupy the formerly empty entrance wings. Shelf
  // backs define the bays, while the central runner remains a broad route.
  run(map, 4, 7, 13, 'TABLE', res);
  run(map, 4, 7, 12, 'BOOKSHELF', res);
  prop(map, 5, 14, tid('CHAIR', 'BENCH'), res);
  prop(map, 7, 15, tid('CHEST_CLOSED', 'CRATE'), res);
  run(map, 14, 17, 14, 'COUNTER', res);
  run(map, 14, 17, 12, 'SHELF_GOODS', res);
  prop(map, 16, 15, tid('CHAIR', 'BENCH'), res);
  prop(map, 18, 13, tid('CRATE', 'BARREL'), res);
  oset(map, 10, 8, tid('CHANDELIER', 'CANDLE'));
  oset(map, 5, 14, tid('CHANDELIER', 'CANDLE'));
  oset(map, 16, 14, tid('CHANDELIER', 'CANDLE'));

  finishInterior(map, r, rm.exit, res);
  map.addTrigger({ id: 'sundries-shop', kind: 'shop', x: 10, y: 12, data: { shop: 'sorcerous-sundries', npc: 'rolan' } });
  addSign(map, 11, 12, 'SORCEROUS SUNDRIES. Scrolls, wands, foci, components, and identification while you wait. Do not touch the shelves. The proprietor will know, and the shelves will know first.');
  return map;
}

// --- Wyrm's Rock: the Fist's fortress in the middle of the river -----------
function buildWyrmsRock(root) {
  const map = interiorMap({
    id: 'wyrms-rock', name: "Wyrm's Rock", w: 26, h: 20, music: 'castle',
    ambient: { color: '#16202a', alpha: 0.14 },
  });
  const res = reservedFor('wyrms-rock');
  const r = root.fork('wyrmsrock');
  const rm = room(map, { w: 26, h: 20, floor: 'STONE_FLOOR', wall: 'STONE_WALL' });

  for (let y = 4; y <= 16; y += 4) { prop(map, 5, y, tid('PILLAR', 'STONE_WALL'), res); prop(map, 20, y, tid('PILLAR', 'STONE_WALL'), res); }
  run(map, 2, 23, 1, 'SHELF_GOODS', res);
  for (let x = 9; x <= 16; x++) prop(map, x, 5, tid('COUNTER', 'TABLE'), res);
  // the toll office, the search table, and the cells nobody talks about
  tableAt(map, r, 8, 9, res); tableAt(map, r, 17, 9, res); tableAt(map, r, 12, 12, res);
  run(map, 8, 17, 16, 'BENCH', res);
  for (let y = 8; y <= 14; y += 3) {
    for (let x = 22; x <= 24; x++) prop(map, x, y, tid('STONE_WALL', 'BRICK_WALL'), res);
    dset(map, 22, y + 1, tid('IRON_DOOR', 'STONE_WALL'));
    prop(map, 23, y + 1, tid('STONE_WALL', 'BRICK_WALL'), res);
    prop(map, 24, y + 1, tid('STONE_WALL', 'BRICK_WALL'), res);
  }
  for (const [x, y] of [[2, 6], [2, 15], [19, 17], [6, 17]]) prop(map, x, y, tid('BRAZIER', 'TORCH'), res);
  for (const [x, y] of [[3, 3], [21, 3], [2, 11]]) prop(map, x, y, tid('CRATE', 'BARREL'), res);
  floor(map, 24, 2, tid('STAIRS_UP', 'STONE_FLOOR'));
  prop(map, 1, 18, tid('CHEST_CLOSED', 'CRATE'), res);
  oset(map, 12, 7, tid('CHANDELIER', 'CANDLE'));
  oset(map, 12, 14, tid('CHANDELIER', 'CANDLE'));

  finishInterior(map, r, rm.exit, res);
  map.addTrigger({ id: 'wyrms-rock-board', kind: 'quest', x: 12, y: 6, data: { board: 'lords-alliance', npc: 'sergor-starag' } });
  addSign(map, 13, 6, 'WYRM’S ROCK — CUSTOMS AND TOLL. Every load opened at the Flame’s discretion. Every discretion recorded. Every record kept, and the Fist has kept them since 1368.');
  return map;
}

// --- Sharess' Caress: the festhall on the Rivington road ------------------
function buildSharessCaress(root) {
  const map = interiorMap({ id: 'sharess-caress', name: "Sharess' Caress", w: 24, h: 18, music: 'festival' });
  const res = reservedFor('sharess-caress');
  const r = root.fork('caress');
  const rm = room(map, {
    w: 24, h: 18, floor: 'WOOD_FLOOR', wall: 'BRICK_WALL',
    rooms: [{ x: 0, y: 0, w: 5, h: 6, door: 'e', name: 'kitchen' }],
  });

  floorRect(map, 8, 6, 8, 6, tid('MOSAIC', 'WOOD_FLOOR'));
  run(map, 7, 16, 4, 'BAR', res);
  run(map, 5, 18, 1, 'SHELF_GOODS', res);
  prop(map, 4, 1, tid('BARREL', 'CRATE'), res);
  prop(map, 19, 1, tid('BARREL', 'CRATE'), res);
  prop(map, 1, 3, tid('HEARTH', 'BRAZIER'), res);
  tableAt(map, r, 5, 8, res); tableAt(map, r, 18, 8, res); tableAt(map, r, 11, 14, res);
  tableAt(map, r, 17, 13, res);
  for (let y = 6; y <= 10; y += 2) { prop(map, 2, y, tid('BED', 'BENCH'), res); prop(map, 21, y, tid('BED', 'BENCH'), res); }
  for (const [x, y] of [[7, 6], [16, 6], [7, 11], [16, 11]]) prop(map, x, y, tid('CANDLE', 'TORCH'), res);
  prop(map, 11, 6, tid('STATUE', 'PILLAR'), res);
  prop(map, 12, 6, tid('FOUNTAIN', 'WELL'), res);
  floor(map, 21, 15, tid('STAIRS_UP', 'WOOD_FLOOR'));
  floor(map, 21, 16, tid('WOOD_FLOOR_H', 'WOOD_FLOOR'));
  for (const x of [6, 12, 18]) oset(map, x, 9, tid('CHANDELIER', 'CANDLE'));

  finishInterior(map, r, rm.exit, res);
  map.addTrigger({ id: 'caress-shop', kind: 'shop', x: 11, y: 5, data: { shop: 'sharess-caress', npc: 'kallista' } });
  map.addTrigger({ id: 'caress-rest', kind: 'rest', x: 21, y: 16, w: 1, h: 1, data: { inn: true, cost: 12, text: 'A room on the bridge side, and the river under the floor all night. Rest here?' } });
  return map;
}

// ---------------------------------------------------------------------------
// 5. THE TWO DEEP PLACES
// ---------------------------------------------------------------------------
//
// A procedural floor linked from a region pack is a ONE-WAY TRIP unless the pack
// rewires the stairs itself: `buildProcedural()` in maps.js only knows the way
// out of Undermountain, Wave Echo Cave and the Redbrand hideout, and everything
// else gets `up: null`, which leaves the up-stair inert with `map: null`.
//
// So each of these supplies its own `build(r, ctx)`, calls the generator, and
// rewrites both stairs:
//   up   -> the surface tile the link table lands you on
//   down -> NOT another floor. `<id>-2`'s own up-stair would resolve to
//           `<id>-1`, a map that does not exist and whose up-stair would be
//           inert, and the party would be stranded one floor down with no way
//           back. The down stair is converted to a sign instead, which reads as
//           a choked shaft and cannot strand anybody.

const buildSewers = packDungeon(
  'bg-sewers', 'The Lower City Sewers',
  { gen: 'dungeon', theme: 'dungeon', biome: 'dungeon', size: 'large', level: 12, region: 'baldurs-gate', connect: false },
  { map: 'bg-heapside', x: 10, y: 35, dir: 'up' },
  'The stair drops away into standing black water. Whatever is down there has been down there a long while, and the Guild pays nobody enough to find out what.',
);

const buildTumbledownCrypts = packDungeon(
  'tumbledown-crypts', 'The Tumbledown Crypts',
  { gen: 'crypt', theme: 'crypt', biome: 'crypt', size: 'medium', level: 12, region: 'baldurs-gate', connect: false },
  { map: 'bg-tumbledown', x: 30, y: 25, dir: 'up' },
  'A second stair goes down past this one and is shut with a Kelemvorite ward — a grey seal, still bright, renewed within the tenday. The Gravewarden renews it himself and will not say why.',
);

// ---------------------------------------------------------------------------
// 6. THE CATALOGUE
// ---------------------------------------------------------------------------
//
// maps.js runs every one of these through its own private `def()`, so this file
// exports RAW definitions and never imports it. `w`/`h` are 0 for the two
// procedural floors, exactly as `undermountain` declares them.

export const REGION_MAPS = {
  // --- the Outer City -------------------------------------------------------
  'bg-blackgate': {
    name: 'Blackgate', kind: 'city', biome: 'city', w: 56, h: 44, safe: true,
    music: 'city', level: 11, region: 'baldurs-gate', build: buildBlackgate,
    desc: 'The Trade Way’s last mile: caravan yards, ox pens, shanties against the Old Wall, and the Black Dragon Gate at the end of it.',
  },
  'bg-norchapel': {
    name: 'Norchapel', kind: 'city', biome: 'city', w: 48, h: 40, safe: true,
    music: 'city', level: 11, region: 'baldurs-gate', build: buildNorchapel,
    desc: 'Twenty chapels raised outside the walls and nineteen let out as lodgings. Whitkeep and Stonyeyes lie beyond the lane.',
  },
  'bg-little-calimshan': {
    name: 'Little Calimshan', kind: 'city', biome: 'city', w: 48, h: 42, safe: true,
    music: 'market', level: 11, region: 'baldurs-gate', build: buildLittleCalimshan,
    desc: 'The Calishite quarter: a bazaar under awnings, spice and silk out of Memnon, and a domed shrine that keeps two doors.',
  },
  'bg-tumbledown': {
    name: 'Tumbledown', kind: 'city', biome: 'city', w: 44, h: 38, safe: true,
    music: 'tense', level: 11, region: 'baldurs-gate', build: buildTumbledown,
    desc: 'The burying ground outside the Cliffgate. Mausolea, grave rows, and a stair into the crypts that should not be standing open.',
  },
  'bg-sows-foot': {
    name: "Sow's Foot", kind: 'city', biome: 'city', w: 44, h: 40, safe: true,
    music: 'tense', level: 11, region: 'baldurs-gate', build: buildSowsFoot,
    desc: 'Mud, wattle and sailcloth, four lanes and no street plan — and the one address in Baldur’s Gate the Guild actually answers to.',
  },
  'bg-twin-songs': {
    name: 'The Twin Songs', kind: 'city', biome: 'city', w: 48, h: 42, safe: true,
    music: 'temple', level: 11, region: 'baldurs-gate', build: buildTwinSongs,
    desc: 'Six shrines down one paved avenue, every god legal and every god watched, and the pilgrim road south forming up at the far end.',
  },
  'bg-wyrms-crossing': {
    name: "Wyrm's Crossing", kind: 'city', biome: 'city', w: 64, h: 26, safe: true,
    music: 'market', level: 11, region: 'baldurs-gate', build: buildWyrmsCrossing,
    desc: 'The double bridge over the Chionthar, shops built out over both parapets, and the Flaming Fist’s fortress on the rock between them.',
  },
  'bg-rivington': {
    name: 'Rivington', kind: 'city', biome: 'city', w: 56, h: 44, safe: true,
    music: 'town', level: 11, region: 'baldurs-gate', build: buildRivington,
    desc: 'The south bank: half farmstead, half river port, and a refugee camp along the market road that stopped looking temporary years ago.',
  },

  // --- the Lower City -------------------------------------------------------
  'bg-gray-harbour': {
    name: 'Gray Harbour', kind: 'city', biome: 'city', w: 60, h: 42, safe: true,
    music: 'coast', level: 12, region: 'baldurs-gate', build: buildGrayHarbour,
    desc: 'Quays, chandleries and the Oberon dry docks, the Water Queen’s House above them, and the Seatower of Balduran on its rock in the water.',
  },
  'bg-bloomridge': {
    name: 'Bloomridge', kind: 'city', biome: 'city', w: 48, h: 42, safe: true,
    music: 'city', level: 12, region: 'baldurs-gate', build: buildBloomridge,
    desc: 'Merchant terraces stepping down from the Old Wall to the harbour road, the Counting House among them, and a flower market that gave the district its name.',
  },
  'bg-heapside': {
    name: 'Heapside', kind: 'city', biome: 'city', w: 52, h: 42, safe: true,
    music: 'city', level: 12, region: 'baldurs-gate', build: buildHeapside,
    desc: 'The most mixed district in the city: the Blushing Mermaid and the High House of Wonders on the same crooked street, and a stair down into the Undercellar between them.',
  },
  'bg-eastway': {
    name: 'Eastway', kind: 'city', biome: 'city', w: 52, h: 42, safe: true,
    music: 'city', level: 12, region: 'baldurs-gate', build: buildEastway,
    desc: 'A broad cobbled avenue in from the Basilisk Gate, the Elfsong Tavern on one side of it and Sorcerous Sundries on the other.',
  },

  // --- the Upper City -------------------------------------------------------
  'bg-the-wide': {
    name: 'The Wide', kind: 'city', biome: 'city', w: 56, h: 44, safe: true,
    music: 'market', level: 13, region: 'baldurs-gate', build: buildTheWide,
    desc: 'The city’s only great civic space and its market, between the Black Dragon Gate and the Baldur’s Gate, with Balduran in bronze over the fountain.',
  },
  'bg-temples-district': {
    name: 'The Temples District', kind: 'city', biome: 'city', w: 48, h: 42, safe: true,
    music: 'castle', level: 13, region: 'baldurs-gate', build: buildTemplesDistrict,
    desc: 'A processional avenue to the High Hall — ducal palace, Council chamber and Parliament benches — with the Unrolling Scroll and the lesser shrines beyond it.',
  },
  'bg-citadel-streets': {
    name: 'Citadel Streets', kind: 'city', biome: 'city', w: 46, h: 40, safe: true,
    music: 'castle', level: 13, region: 'baldurs-gate', build: buildCitadelStreets,
    desc: 'Straight, over-lit streets between walled patriar manors, with the Watch Citadel and its drill yard sitting in the middle of them.',
  },

  // --- interiors ------------------------------------------------------------
  'baldurs-mouth': {
    name: "Baldur's Mouth", kind: 'interior', biome: 'city', w: 20, h: 16, indoor: true,
    safe: true, music: 'shop', level: 13, region: 'baldurs-gate', parent: 'bg-the-wide',
    build: buildBaldursMouth,
    desc: 'The broadsheet office on the Wide: type cases, a press, back issues by the copper, and the great bell on the roof.',
  },
  'high-hall': {
    name: 'The High Hall', kind: 'interior', biome: 'city', w: 30, h: 24, indoor: true,
    safe: true, music: 'castle', level: 13, region: 'baldurs-gate', parent: 'bg-temples-district',
    build: buildHighHall,
    desc: 'The Council of Four’s table, the Parliament of Peers’ benches, and Grand Duke Ravengard’s map room behind the colonnade.',
  },
  'unrolling-scroll': {
    name: 'The Unrolling Scroll', kind: 'interior', biome: 'city', w: 22, h: 18, indoor: true,
    safe: true, music: 'shop', level: 13, region: 'baldurs-gate', parent: 'bg-temples-district',
    build: buildUnrollingScroll,
    desc: 'Oghma’s house in Baldur’s Gate: scriptorium, library and the best identification service south of Waterdeep.',
  },
  'watch-citadel': {
    name: 'The Watch Citadel', kind: 'interior', biome: 'city', w: 26, h: 20, indoor: true,
    safe: true, music: 'tense', level: 13, region: 'baldurs-gate', parent: 'bg-citadel-streets',
    build: buildWatchCitadel,
    desc: 'The Stormkeep’s ground floor: armoury, duty room and a row of cells the Watch keep for patriars’ sons.',
  },
  'seatower-of-balduran': {
    name: 'The Seatower of Balduran', kind: 'interior', biome: 'city', w: 28, h: 22, indoor: true,
    safe: true, music: 'castle', level: 12, region: 'baldurs-gate', parent: 'bg-gray-harbour',
    build: buildSeatower,
    desc: 'Flaming Fist headquarters on its rock in Gray Harbour: the map table, the arms wall, and the southern contract board.',
  },
  'water-queens-house': {
    name: "The Water Queen's House", kind: 'interior', biome: 'city', w: 22, h: 18, indoor: true,
    safe: true, music: 'tense', level: 12, region: 'baldurs-gate', parent: 'bg-gray-harbour',
    build: buildWaterQueensHouse,
    desc: 'Umberlee’s temple, the oldest in the city: a salt tide pool for an altar, and mercies that are bought rather than asked for.',
  },
  'low-lantern': {
    name: 'The Low Lantern', kind: 'interior', biome: 'city', w: 22, h: 16, indoor: true,
    safe: true, music: 'tavern', level: 12, region: 'baldurs-gate', parent: 'bg-gray-harbour',
    build: buildLowLantern,
    desc: 'A merchant ship that stopped sailing and started serving: three decks, no last orders, and the house always wins.',
  },
  'counting-house': {
    name: 'The Counting House', kind: 'interior', biome: 'city', w: 22, h: 18, indoor: true,
    safe: true, music: 'shop', level: 12, region: 'baldurs-gate', parent: 'bg-bloomridge',
    build: buildCountingHouse,
    desc: 'The city’s bank: exchange, assay, safekeeping, and the best rate on gems and plate anywhere south of Waterdeep.',
  },
  'blushing-mermaid': {
    name: 'The Blushing Mermaid', kind: 'interior', biome: 'city', w: 24, h: 20, indoor: true,
    safe: true, music: 'tavern', level: 12, region: 'baldurs-gate', parent: 'bg-heapside',
    build: buildBlushingMermaid,
    desc: 'Rough beds, rougher company, the city’s hiring board by the door, and a back room the Harpers have kept for longer than the landlady admits.',
  },
  'high-house-of-wonders': {
    name: 'The High House of Wonders', kind: 'interior', biome: 'city', w: 24, h: 20, indoor: true,
    safe: true, music: 'temple', level: 12, region: 'baldurs-gate', parent: 'bg-heapside',
    build: buildHighHouseOfWonders,
    desc: 'Gond’s temple and Gond’s workshop, where the altar is an anvil and is still warm.',
  },
  'shrine-of-suffering': {
    name: 'The Shrine of the Suffering', kind: 'interior', biome: 'city', w: 18, h: 16, indoor: true,
    safe: true, music: 'temple', level: 12, region: 'baldurs-gate', parent: 'bg-heapside',
    build: buildShrineOfSuffering,
    desc: 'Ilmater’s: one altar, one candle, rows of pallets, and a door that is never barred to anybody who can reach it.',
  },
  'the-undercellar': {
    name: 'The Undercellar', kind: 'interior', biome: 'city', w: 30, h: 22, indoor: true,
    safe: true, music: 'tense', level: 12, region: 'baldurs-gate', parent: 'bg-heapside',
    build: buildUndercellar,
    desc: 'The Guild’s market under Heapside: stolen goods, poisons, thieves’ tools, and no questions in either direction.',
  },
  'elfsong-tavern': {
    name: 'The Elfsong Tavern', kind: 'interior', biome: 'city', w: 26, h: 20, indoor: true,
    safe: true, music: 'tavern', level: 12, region: 'baldurs-gate', parent: 'bg-eastway',
    build: buildElfsongTavern,
    desc: 'The best room in the Lower City, and the corner table nobody has sat at since 1492.',
  },
  'sorcerous-sundries': {
    name: 'Sorcerous Sundries', kind: 'interior', biome: 'city', w: 22, h: 18, indoor: true,
    safe: true, music: 'shop', level: 12, region: 'baldurs-gate', parent: 'bg-eastway',
    build: buildSorcerousSundries,
    desc: 'Scrolls, wands, foci and identification, under a tower of pillars and two braziers burning a colour that is not quite any colour.',
  },
  'wyrms-rock': {
    name: "Wyrm's Rock", kind: 'interior', biome: 'city', w: 26, h: 20, indoor: true,
    safe: true, music: 'castle', level: 11, region: 'baldurs-gate', parent: 'bg-wyrms-crossing',
    build: buildWyrmsRock,
    desc: 'The Flaming Fist fortress in the middle of the Chionthar: customs, toll, interrogation, and records kept since 1368 DR.',
  },
  'sharess-caress': {
    name: "Sharess' Caress", kind: 'interior', biome: 'city', w: 24, h: 18, indoor: true,
    safe: true, music: 'festival', level: 11, region: 'baldurs-gate', parent: 'bg-rivington',
    build: buildSharessCaress,
    desc: 'The festhall on the Rivington road, with a lamp kept burning at the door and rooms on the bridge side.',
  },

  // --- the deep places ------------------------------------------------------
  'bg-sewers': {
    name: 'The Lower City Sewers', kind: 'dungeon', biome: 'dungeon', w: 0, h: 0,
    indoor: true, music: 'dungeon', level: 12, region: 'baldurs-gate',
    build: buildSewers,
    desc: 'Under Heapside: brick vaults, standing water, and everything the Lower City has ever wanted to be rid of.',
  },
  'tumbledown-crypts': {
    name: 'The Tumbledown Crypts', kind: 'dungeon', biome: 'crypt', w: 0, h: 0,
    indoor: true, music: 'crypt', level: 12, region: 'baldurs-gate',
    build: buildTumbledownCrypts,
    desc: 'The vaults under the burying ground, where the register is three names longer than the graves are.',
  },
};

// ---------------------------------------------------------------------------
// 7. THE CONNECTION TABLE
// ---------------------------------------------------------------------------
//
// Stepping on `aWarp` in A lands you at `bLand` in B facing `toB`, and the other
// way round. `kind: 'road'` and `'cave'` open a three-tile mouth; `'door'` and
// `'stairs'` open exactly one, which is why every GATED gate below is a door —
// a single solid warden can close a one-tile mouth and cannot close a three.

export const REGION_LINKS = [
  // --- the road in from the north ------------------------------------------
  // NOT DECLARED HERE, AND THAT IS DELIBERATE.
  //
  //   coast-way-north [30,62] <-> bg-blackgate [28,1]   road
  //
  // is the row that brings the Coast Way into the city, and it belongs to
  // `maps_south.js`, which owns `coast-way-north` — charter §6.1 lists it under
  // that pack and §6.2 omits it. Writing it in both places does not make the
  // road twice as open: `applyWarpNodes` expands EVERY matching row onto the
  // map, so a duplicated row stamps a second three-tile mouth on top of the
  // first, six triggers on three tiles, two of them carrying the same trigger
  // id. That is the invariant in §6 — "no two rows may put a warp on the same
  // (map, x, y)" — and it is the one bug in a link table that cannot be seen by
  // looking at either file on its own.
  //
  // Verified live rather than assumed: the graph walk reaches bg-blackgate from
  // phandalin in ten hops through coast-way-north on maps_south.js's row alone.

  // --- the Outer City ring ---------------------------------------------------
  { a: 'bg-blackgate', aWarp: [54, 22], aLand: [52, 22], b: 'bg-norchapel', bWarp: [1, 20], bLand: [3, 20], toB: 'right', toA: 'left', kind: 'road' },
  { a: 'bg-blackgate', aWarp: [1, 22], aLand: [3, 22], b: 'bg-sows-foot', bWarp: [42, 20], bLand: [40, 20], toB: 'left', toA: 'right', kind: 'road' },
  { a: 'bg-norchapel', aWarp: [24, 38], aLand: [24, 36], b: 'bg-little-calimshan', bWarp: [24, 1], bLand: [24, 3], toB: 'down', toA: 'up', kind: 'road' },
  { a: 'bg-little-calimshan', aWarp: [24, 40], aLand: [24, 38], b: 'bg-tumbledown', bWarp: [22, 1], bLand: [22, 3], toB: 'down', toA: 'up', kind: 'road' },
  { a: 'bg-tumbledown', aWarp: [1, 20], aLand: [3, 20], b: 'bg-twin-songs', bWarp: [46, 20], bLand: [44, 20], toB: 'left', toA: 'right', kind: 'road' },
  { a: 'bg-twin-songs', aWarp: [24, 1], aLand: [24, 3], b: 'bg-sows-foot', bWarp: [22, 38], bLand: [22, 36], toB: 'up', toA: 'down', kind: 'road' },
  { a: 'bg-twin-songs', aWarp: [24, 40], aLand: [24, 38], b: 'bg-wyrms-crossing', bWarp: [32, 1], bLand: [32, 3], toB: 'down', toA: 'up', kind: 'road' },
  { a: 'bg-wyrms-crossing', aWarp: [32, 24], aLand: [32, 22], b: 'bg-rivington', bWarp: [28, 1], bLand: [28, 3], toB: 'down', toA: 'up', kind: 'road' },
  { a: 'bg-wyrms-crossing', aWarp: [32, 12], aLand: [32, 13], b: 'wyrms-rock', bWarp: [13, 19], bLand: [13, 18], toB: 'up', toA: 'down', kind: 'door' },
  { a: 'bg-rivington', aWarp: [18, 20], aLand: [18, 21], b: 'sharess-caress', bWarp: [12, 17], bLand: [12, 16], toB: 'up', toA: 'down', kind: 'door' },

  // --- the road out to the south. Declared HERE and nowhere else: duplicating
  // it in maps_south.js would stamp two triggers on the same tile.
  { a: 'bg-rivington', aWarp: [28, 42], aLand: [28, 40], b: 'coast-way-south', bWarp: [30, 1], bLand: [30, 3], toB: 'down', toA: 'up', kind: 'road' },

  // --- the walls: the four gates that matter ---------------------------------
  // The Black Dragon Gate is THE gate of the game: kind 'door', one tile wide,
  // and Fist Sergeant Randal Whitburn stands on (28,42) in Blackgate with
  // `removedBy: 'bg-writ-of-entry'` until the writ is in your hand.
  { a: 'bg-blackgate', aWarp: [28, 42], aLand: [28, 40], b: 'bg-the-wide', bWarp: [28, 1], bLand: [28, 3], toB: 'down', toA: 'up', kind: 'door' },
  { a: 'bg-the-wide', aWarp: [28, 42], aLand: [28, 40], b: 'bg-bloomridge', bWarp: [24, 1], bLand: [24, 3], toB: 'down', toA: 'up', kind: 'door' },
  { a: 'bg-little-calimshan', aWarp: [1, 22], aLand: [3, 22], b: 'bg-eastway', bWarp: [50, 20], bLand: [48, 20], toB: 'left', toA: 'right', kind: 'door' },
  { a: 'bg-tumbledown', aWarp: [8, 8], aLand: [8, 9], b: 'bg-heapside', bWarp: [44, 6], bLand: [44, 7], toB: 'down', toA: 'up', kind: 'door' },

  // --- the Lower City --------------------------------------------------------
  { a: 'bg-bloomridge', aWarp: [46, 20], aLand: [44, 20], b: 'bg-heapside', bWarp: [1, 20], bLand: [3, 20], toB: 'right', toA: 'left', kind: 'road' },
  { a: 'bg-heapside', aWarp: [50, 20], aLand: [48, 20], b: 'bg-eastway', bWarp: [1, 20], bLand: [3, 20], toB: 'right', toA: 'left', kind: 'road' },
  { a: 'bg-bloomridge', aWarp: [1, 20], aLand: [3, 20], b: 'bg-gray-harbour', bWarp: [58, 20], bLand: [56, 20], toB: 'left', toA: 'right', kind: 'road' },
  { a: 'bg-bloomridge', aWarp: [22, 18], aLand: [22, 19], b: 'counting-house', bWarp: [11, 17], bLand: [11, 16], toB: 'up', toA: 'down', kind: 'door' },
  { a: 'bg-gray-harbour', aWarp: [16, 16], aLand: [16, 17], b: 'seatower-of-balduran', bWarp: [14, 21], bLand: [14, 20], toB: 'up', toA: 'down', kind: 'door' },
  { a: 'bg-gray-harbour', aWarp: [28, 14], aLand: [28, 15], b: 'water-queens-house', bWarp: [11, 17], bLand: [11, 16], toB: 'up', toA: 'down', kind: 'door' },
  { a: 'bg-gray-harbour', aWarp: [40, 26], aLand: [40, 27], b: 'low-lantern', bWarp: [11, 15], bLand: [11, 14], toB: 'up', toA: 'down', kind: 'door' },
  { a: 'bg-heapside', aWarp: [18, 16], aLand: [18, 17], b: 'blushing-mermaid', bWarp: [12, 19], bLand: [12, 18], toB: 'up', toA: 'down', kind: 'door' },
  { a: 'bg-heapside', aWarp: [40, 16], aLand: [40, 17], b: 'high-house-of-wonders', bWarp: [12, 19], bLand: [12, 18], toB: 'up', toA: 'down', kind: 'door' },
  { a: 'bg-heapside', aWarp: [30, 30], aLand: [30, 31], b: 'shrine-of-suffering', bWarp: [9, 15], bLand: [9, 14], toB: 'up', toA: 'down', kind: 'door' },
  { a: 'bg-heapside', aWarp: [24, 24], aLand: [24, 25], b: 'the-undercellar', bWarp: [15, 21], bLand: [15, 20], toB: 'down', toA: 'up', kind: 'stairs' },
  // The sewers have EXACTLY ONE mouth. A second would fight the up-stair wiring.
  { a: 'bg-heapside', aWarp: [10, 34], aLand: [10, 35], b: 'bg-sewers', bWarp: null, bLand: null, toB: 'down', toA: 'up', kind: 'cave' },
  { a: 'bg-eastway', aWarp: [22, 18], aLand: [22, 19], b: 'elfsong-tavern', bWarp: [13, 19], bLand: [13, 18], toB: 'up', toA: 'down', kind: 'door' },
  { a: 'bg-eastway', aWarp: [36, 26], aLand: [36, 27], b: 'sorcerous-sundries', bWarp: [11, 17], bLand: [11, 16], toB: 'up', toA: 'down', kind: 'door' },

  // --- the Upper City --------------------------------------------------------
  { a: 'bg-the-wide', aWarp: [54, 22], aLand: [52, 22], b: 'bg-temples-district', bWarp: [1, 20], bLand: [3, 20], toB: 'right', toA: 'left', kind: 'road' },
  { a: 'bg-the-wide', aWarp: [1, 22], aLand: [3, 22], b: 'bg-citadel-streets', bWarp: [44, 20], bLand: [42, 20], toB: 'left', toA: 'right', kind: 'road' },
  { a: 'bg-the-wide', aWarp: [20, 18], aLand: [20, 19], b: 'baldurs-mouth', bWarp: [10, 15], bLand: [10, 14], toB: 'up', toA: 'down', kind: 'door' },
  { a: 'bg-temples-district', aWarp: [24, 18], aLand: [24, 19], b: 'high-hall', bWarp: [15, 23], bLand: [15, 22], toB: 'up', toA: 'down', kind: 'door' },
  { a: 'bg-temples-district', aWarp: [38, 26], aLand: [38, 27], b: 'unrolling-scroll', bWarp: [11, 17], bLand: [11, 16], toB: 'up', toA: 'down', kind: 'door' },
  { a: 'bg-citadel-streets', aWarp: [22, 18], aLand: [22, 19], b: 'watch-citadel', bWarp: [13, 19], bLand: [13, 18], toB: 'up', toA: 'down', kind: 'door' },
  { a: 'bg-tumbledown', aWarp: [30, 24], aLand: [30, 25], b: 'tumbledown-crypts', bWarp: null, bLand: null, toB: 'down', toA: 'up', kind: 'cave' },
];


// ---------------------------------------------------------------------------
// UPPER FLOORS — see the same block at the foot of maps_south.js
// ---------------------------------------------------------------------------
const INN_FLOORS = [
  {
    inn: 'low-lantern', name: 'The Low Lantern — Second Deck',
    stair: [19, 1], land: [19, 2], rooms: 3, wall: 'LOG_WALL',
    desc: 'Hammocks on the second deck, and the Chionthar moving under you all night.',
  },
  {
    inn: 'blushing-mermaid', name: 'The Blushing Mermaid — Upstairs',
    stair: [21, 17], land: [21, 18], rooms: 4, wall: 'WATTLE_WALL',
    desc: 'Rooms over the taproom, and a landlady who has heard worse than whatever you did.',
  },
  {
    inn: 'elfsong-tavern', name: 'The Elfsong — Guest Rooms',
    stair: [23, 17], land: [23, 18], rooms: 5, wall: 'STONE_WALL',
    desc: 'Clean rooms, barred shutters, and a voice below singing in Elvish until you sleep.',
  },
  {
    inn: 'sharess-caress', name: 'Sharess’s Caress — Upper Rooms',
    stair: [21, 15], land: [21, 16], rooms: 4, wall: 'BRICK_WALL',
    desc: 'Rooms on the bridge side, and the river under the floor all night.',
  },
].map((s) => innFloor({ region: 'baldurs-gate', music: 'inn', ...s }));

for (const f of INN_FLOORS) {
  REGION_MAPS[f.id] = f.def;
  REGION_LINKS.push(f.link);
}
