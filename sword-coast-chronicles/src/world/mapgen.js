// world/mapgen.js — the procedural map generator: every cave, crypt, mine, ruin,
// forest and the Sword Coast overworld itself. Deterministic from a seed, always
// connected, always navigable.
//
// CONTRACT
//   Nothing here calls Math.random(). Every generator takes a `seed` and forks
//   sub-streams off it (`r.fork('trees')`) so adding a decoration pass never
//   shifts the room layout of an already-visited floor.
//
//   Every generator ends the same way:
//     paint tiles -> place triggers -> decorate -> placeEncounterZones ->
//     validateConnectivity(map, importantPoints)
//   `validateConnectivity` floods from the spawn and, if anything important is
//   walled off, digs a corridor to it. A generated map can therefore never
//   strand the player, no matter how unlucky the dice were.
//
// TILE FLAGS are the ground truth for walkability. We recompute a tile's flags
// from its ground+deco tile definitions every time we paint, so a wall painted
// over a floor becomes solid and a floor carved over a wall becomes walkable
// without any bookkeeping.

import { TileMap } from './tilemap.js';
// TF is declared identically in both modules (tiles.js mirrors world/tilemap.js);
// we take it from tiles.js so mapgen links even while tilemap.js is in flux.
import { T, TILES, TF, tileFlags } from '../render/tiles.js';
import { makeRNG } from '../core/rng.js';

const { SOLID, WATER, ENCOUNTER, DOOR, TRIGGER, LEDGE, SLOW, DAMAGE } = TF;

// ---------------------------------------------------------------------------
// 0. TILE LOOKUP
// ---------------------------------------------------------------------------

/**
 * Resolve the first tile name that actually exists in the tileset.
 * The tileset and the generators are written by different hands; this keeps a
 * missing decorative tile from ever throwing.
 */
export function tid(...names) {
  for (const n of names) {
    if (n == null) continue;
    if (typeof n === 'number') return n;
    const v = T[n];
    if (v != null) return v;
  }
  return T.GRASS != null ? T.GRASS : 1;
}

/** Weighted name table -> [[id, weight], ...] with unknown names dropped. */
function tidTable(rows) {
  const out = [];
  for (const [name, w] of rows) {
    const id = typeof name === 'number' ? name : T[name];
    if (id != null) out.push([id, w]);
  }
  return out;
}

function pickTid(r, table, fallback = 0) {
  if (!table || !table.length) return fallback;
  const e = r.pickWeighted(table, (x) => x[1]);
  return e ? e[0] : fallback;
}

// ---------------------------------------------------------------------------
// 1. MAP ACCESS HELPERS
// ---------------------------------------------------------------------------

const ORTH = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const DIAG8 = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];

function inb(map, x, y) { return x >= 0 && y >= 0 && x < map.w && y < map.h; }
function idx(map, x, y) { return y * map.w + x; }

/** Read a layer. Falls back to `map.at()` if the typed arrays are named oddly. */
function getT(map, layer, x, y) {
  if (!inb(map, x, y)) return 0;
  const a = map[layer];
  if (a) return a[idx(map, x, y)] | 0;
  return map.at ? map.at(layer, x, y) | 0 : 0;
}

function setT(map, layer, x, y, id) {
  if (!inb(map, x, y)) return;
  if (map.set) map.set(layer, x, y, id);
  else if (map[layer]) map[layer][idx(map, x, y)] = id;
}

/** Absolute flag read. Out of bounds reads as solid so edge loops stay simple. */
function fget(map, x, y) {
  if (!inb(map, x, y)) return SOLID;
  if (map.flags) return map.flags[idx(map, x, y)] | 0;
  return map.flagAt ? map.flagAt(x, y) | 0 : 0;
}

/** Absolute flag write (not an OR). */
function fset(map, x, y, bits) {
  if (!inb(map, x, y)) return;
  if (map.flags) { map.flags[idx(map, x, y)] = bits & 0xff; return; }
  if (map.clearFlag) map.clearFlag(x, y, 0xff);
  if (map.setFlag) map.setFlag(x, y, bits & 0xff);
}
function fadd(map, x, y, bits) { fset(map, x, y, fget(map, x, y) | bits); }
function fdel(map, x, y, bits) { fset(map, x, y, fget(map, x, y) & ~bits); }

/**
 * Recompute a tile's flags from the tiles standing on it.
 * `over` is deliberately excluded — treetops and ceilings draw above the actor
 * and must never block movement.
 */
function refresh(map, x, y, extra = 0) {
  if (!inb(map, x, y)) return;
  const g = getT(map, 'ground', x, y);
  const d = getT(map, 'deco', x, y);
  let f = tileFlags(g) | 0;
  if (d) f |= tileFlags(d) | 0;
  fset(map, x, y, (f | extra) & 0xff);
}

function setGround(map, x, y, id, extra = 0) { setT(map, 'ground', x, y, id); refresh(map, x, y, extra); }
function setDeco(map, x, y, id, extra = 0) { setT(map, 'deco', x, y, id); refresh(map, x, y, extra); }
function setOver(map, x, y, id) { setT(map, 'over', x, y, id); }

/** Lay a floor and sweep away whatever was standing on it. */
function carveFloor(map, x, y, floorId, extra = 0) {
  if (!inb(map, x, y)) return;
  setT(map, 'ground', x, y, floorId);
  setT(map, 'deco', x, y, 0);
  setT(map, 'over', x, y, 0);
  refresh(map, x, y, extra);
}

/** Can a walker stand here? Closed doors count — you open them by walking in. */
export function walkable(map, x, y) {
  if (!inb(map, x, y)) return false;
  const f = fget(map, x, y);
  if (!(f & SOLID)) return true;
  return (f & DOOR) !== 0;
}

function isFloorGroup(map, x, y, groups) {
  const d = TILES[getT(map, 'ground', x, y)];
  return !!d && groups.includes(d.group);
}
function groundGroup(map, x, y) {
  const d = TILES[getT(map, 'ground', x, y)];
  return d ? d.group : null;
}
function hasProp(map, x, y) { return getT(map, 'deco', x, y) !== 0; }

/** Count walkable orthogonal neighbours — used for dead-end / corridor tests. */
function openNeighbours(map, x, y) {
  let n = 0;
  for (const [dx, dy] of ORTH) if (walkable(map, x + dx, y + dy)) n++;
  return n;
}

// ---------------------------------------------------------------------------
// 2. FLOOD FILL, REGIONS AND ROUTE DIGGING
// ---------------------------------------------------------------------------

/**
 * Breadth-first flood over walkable tiles.
 * Returns { seen:Uint8Array, count, order:[i,...] }. `seen` is indexed y*w+x.
 */
export function floodFill(map, sx, sy, opts = {}) {
  const w = map.w, h = map.h;
  const seen = new Uint8Array(w * h);
  const order = [];
  if (!inb(map, sx, sy)) return { seen, count: 0, order };
  const pass = opts.pass || ((x, y) => walkable(map, x, y));
  if (!pass(sx, sy) && !opts.force) return { seen, count: 0, order };
  const q = [sx + sy * w];
  seen[sx + sy * w] = 1;
  let head = 0, count = 1;
  order.push(q[0]);
  while (head < q.length) {
    const i = q[head++];
    const x = i % w, y = (i / w) | 0;
    for (const [dx, dy] of ORTH) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = nx + ny * w;
      if (seen[ni]) continue;
      if (!pass(nx, ny)) continue;
      seen[ni] = 1; count++; order.push(ni); q.push(ni);
    }
  }
  return { seen, count, order };
}

/** The walkable tile furthest (in steps) from (sx,sy). Great for exit stairs. */
export function farthestFrom(map, sx, sy, filter) {
  const w = map.w;
  const { order } = floodFill(map, sx, sy);
  for (let i = order.length - 1; i >= 0; i--) {
    const x = order[i] % w, y = (order[i] / w) | 0;
    if (!filter || filter(x, y)) return { x, y, dist: i };
  }
  return { x: sx, y: sy, dist: 0 };
}

// --- a tiny binary heap for the route digger ------------------------------

function heapPush(h, cost, node) {
  h.push({ cost, node });
  let i = h.length - 1;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (h[p].cost <= h[i].cost) break;
    const t = h[p]; h[p] = h[i]; h[i] = t; i = p;
  }
}
function heapPop(h) {
  const top = h[0], last = h.pop();
  if (h.length) {
    h[0] = last;
    for (let i = 0; ;) {
      const l = i * 2 + 1, rr = l + 1;
      let m = i;
      if (l < h.length && h[l].cost < h[m].cost) m = l;
      if (rr < h.length && h[rr].cost < h[m].cost) m = rr;
      if (m === i) break;
      const t = h[m]; h[m] = h[i]; h[i] = t; i = m;
    }
  }
  return top;
}

/**
 * Dijkstra from (ax,ay) to (bx,by) where digging through rock is merely
 * expensive, not forbidden. Returns the tile path (inclusive) or null.
 * `opts.digCost` how much a solid tile costs (default 12);
 * `opts.border`  keep this many tiles away from the map edge (default 1).
 */
export function routeThrough(map, ax, ay, bx, by, opts = {}) {
  const w = map.w, h = map.h, n = w * h;
  if (!inb(map, ax, ay) || !inb(map, bx, by)) return null;
  const digCost = opts.digCost != null ? opts.digCost : 12;
  const border = opts.border != null ? opts.border : 1;
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  const start = ax + ay * w, goal = bx + by * w;
  dist[start] = 0;
  const heap = [];
  heapPush(heap, 0, start);
  while (heap.length) {
    const { node } = heapPop(heap);
    if (done[node]) continue;
    done[node] = 1;
    if (node === goal) break;
    const x = node % w, y = (node / w) | 0;
    for (const [dx, dy] of ORTH) {
      const nx = x + dx, ny = y + dy;
      if (nx < border || ny < border || nx >= w - border || ny >= h - border) continue;
      const ni = nx + ny * w;
      if (done[ni]) continue;
      const f = fget(map, nx, ny);
      let c = 1;
      if (f & SOLID) c = (f & DOOR) ? 1 : digCost;
      else if (f & (SLOW | WATER)) c = 3;
      if (opts.cost) c = opts.cost(nx, ny, c);
      const nd = dist[node] + c;
      if (nd < dist[ni]) { dist[ni] = nd; prev[ni] = node; heapPush(heap, nd, ni); }
    }
  }
  if (!isFinite(dist[goal])) return null;
  const path = [];
  for (let i = goal; i !== -1; i = prev[i]) path.push({ x: i % w, y: (i / w) | 0 });
  path.reverse();
  return path;
}

/**
 * Dig a guaranteed route between two points, painting every blocked tile it
 * crosses. `paint(x, y)` decides what a carved tile looks like.
 */
export function carveRoute(map, ax, ay, bx, by, paint, opts = {}) {
  const path = routeThrough(map, ax, ay, bx, by, opts);
  if (!path) return 0;
  let carved = 0;
  const width = opts.width || 1;
  for (const p of path) {
    for (let oy = 0; oy < width; oy++) {
      for (let ox = 0; ox < width; ox++) {
        const x = p.x + ox, y = p.y + oy;
        if (!inb(map, x, y)) continue;
        if (walkable(map, x, y) && !opts.repaint) continue;
        paint(x, y);
        carved++;
      }
    }
  }
  return carved;
}

/**
 * The safety net every generator runs before returning.
 * Floods from the spawn; anything in `points` that the flood missed gets a
 * corridor dug to it. Returns { ok, carved, unreachable }.
 */
export function validateConnectivity(map, points = [], opts = {}) {
  const spawn = opts.from || map.spawn || { x: 1, y: 1 };
  const paint = opts.paint || ((x, y) => carveFloor(map, x, y, getT(map, 'ground', x, y) || tid('DIRT')));
  let carved = 0, unreachable = 0;

  // Make sure the spawn itself stands on solid ground we can walk on.
  if (!walkable(map, spawn.x, spawn.y)) { paint(spawn.x, spawn.y); carved++; }

  for (let pass = 0; pass < 6; pass++) {
    const { seen } = floodFill(map, spawn.x, spawn.y);
    let missing = null;
    for (const p of points) {
      if (!p || !inb(map, p.x, p.y)) continue;
      if (p.optional) continue;
      if (!walkable(map, p.x, p.y)) { paint(p.x, p.y); carved++; }
      if (!seen[idx(map, p.x, p.y)]) { missing = p; break; }
    }
    if (!missing) return { ok: true, carved, unreachable };
    unreachable++;
    // Dig from the nearest already-reachable tile so the new corridor is short.
    let best = null, bestD = Infinity;
    for (let i = 0; i < seen.length; i++) {
      if (!seen[i]) continue;
      const x = i % map.w, y = (i / map.w) | 0;
      const d = Math.abs(x - missing.x) + Math.abs(y - missing.y);
      if (d < bestD) { bestD = d; best = { x, y }; }
    }
    if (!best) break;
    carved += carveRoute(map, best.x, best.y, missing.x, missing.y, paint, opts.route || {});
  }
  return { ok: false, carved, unreachable };
}

/**
 * Every 4-connected walkable region, largest first.
 * Used by the cave generator to throw away the archipelago it starts with.
 */
export function walkableRegions(map, pass) {
  const w = map.w, h = map.h;
  const mark = new Int32Array(w * h).fill(-1);
  const test = pass || ((x, y) => walkable(map, x, y));
  const regions = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = x + y * w;
      if (mark[i] !== -1 || !test(x, y)) continue;
      const id = regions.length;
      const cells = [i];
      mark[i] = id;
      for (let head = 0; head < cells.length; head++) {
        const cx = cells[head] % w, cy = (cells[head] / w) | 0;
        for (const [dx, dy] of ORTH) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = nx + ny * w;
          if (mark[ni] !== -1 || !test(nx, ny)) continue;
          mark[ni] = id; cells.push(ni);
        }
      }
      regions.push(cells);
    }
  }
  regions.sort((a, b) => b.length - a.length);
  return { regions, mark };
}

/**
 * Would making (x,y) solid pinch the map in two?
 * A cheap local articulation test: the walkable orthogonal neighbours must all
 * still reach each other inside a 7x7 window. Combined with the global
 * validation pass at the end of every generator this is plenty.
 */
function safeToBlock(map, x, y) {
  const nb = [];
  for (const [dx, dy] of ORTH) if (walkable(map, x + dx, y + dy)) nb.push([x + dx, y + dy]);
  if (nb.length <= 1) return true;
  const R = 3;
  const seen = new Set();
  const start = nb[0];
  const q = [start];
  seen.add(`${start[0]},${start[1]}`);
  while (q.length) {
    const [cx, cy] = q.pop();
    for (const [dx, dy] of ORTH) {
      const nx = cx + dx, ny = cy + dy;
      if (nx === x && ny === y) continue;
      if (Math.abs(nx - x) > R || Math.abs(ny - y) > R) continue;
      if (!walkable(map, nx, ny)) continue;
      const k = `${nx},${ny}`;
      if (seen.has(k)) continue;
      seen.add(k); q.push([nx, ny]);
    }
  }
  return nb.every(([nx, ny]) => seen.has(`${nx},${ny}`));
}

// ---------------------------------------------------------------------------
// 3. NOISE — deterministic value noise for coastlines, biome blobs and groves
// ---------------------------------------------------------------------------

/** One octave of smoothed value noise in [0,1). */
export function makeNoise(r, scale = 0.08) {
  const perm = new Uint8Array(512);
  const base = r.shuffle(Array.from({ length: 256 }, (_, i) => i));
  for (let i = 0; i < 512; i++) perm[i] = base[i & 255];
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const lin = (a, b, t) => a + (b - a) * t;
  const val = (ix, iy) => perm[(perm[ix & 255] + (iy & 255)) & 255] / 255;
  return function noise(x, y) {
    const xs = x * scale, ys = y * scale;
    const x0 = Math.floor(xs), y0 = Math.floor(ys);
    const tx = fade(xs - x0), ty = fade(ys - y0);
    return lin(
      lin(val(x0, y0), val(x0 + 1, y0), tx),
      lin(val(x0, y0 + 1), val(x0 + 1, y0 + 1), tx),
      ty,
    );
  };
}

/** Fractal Brownian motion over `octaves` of makeNoise. */
export function makeFBM(r, scale = 0.06, octaves = 3, gain = 0.5) {
  const layers = [];
  let s = scale, amp = 1, total = 0;
  for (let i = 0; i < octaves; i++) {
    layers.push({ n: makeNoise(r.fork(`oct${i}`), s), amp });
    total += amp; s *= 2.1; amp *= gain;
  }
  return function fbm(x, y) {
    let v = 0;
    for (const l of layers) v += l.n(x, y) * l.amp;
    return v / total;
  };
}

// ---------------------------------------------------------------------------
// 4. SYMBOLIC CELL GRID — generation works here, then paints tiles
// ---------------------------------------------------------------------------

export const CELL = {
  WALL: 0, ROOM: 1, CORR: 2, DOOR: 3, LOCKED: 4, SECRET: 5,
  RUBBLE: 6, POOL: 7, ALCOVE: 8, UP: 9, DOWN: 10, VAULT: 11, HIDDEN: 12,
};
const OPEN_CELLS = new Set([
  CELL.ROOM, CELL.CORR, CELL.DOOR, CELL.LOCKED, CELL.RUBBLE,
  CELL.POOL, CELL.ALCOVE, CELL.UP, CELL.DOWN, CELL.VAULT, CELL.HIDDEN,
]);

function makeGrid(w, h, fill = CELL.WALL) {
  const c = new Uint8Array(w * h);
  if (fill) c.fill(fill);
  return {
    w, h, c,
    get(x, y) { return (x < 0 || y < 0 || x >= w || y >= h) ? CELL.WALL : c[y * w + x]; },
    set(x, y, v) { if (x >= 0 && y >= 0 && x < w && y < h) c[y * w + x] = v; },
    open(x, y) { return OPEN_CELLS.has(this.get(x, y)); },
  };
}

function gridOpenNeighbours(g, x, y) {
  let n = 0;
  for (const [dx, dy] of ORTH) if (g.open(x + dx, y + dy)) n++;
  return n;
}
function gridAnyOpen8(g, x, y) {
  for (const [dx, dy] of DIAG8) if (g.open(x + dx, y + dy)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// 5. DUNGEON THEMES — tile palette + prop set per theme
// ---------------------------------------------------------------------------

let _themes = null;

/** Lazily built so we never read `T` before render/tiles.js has registered. */
export function dungeonThemes() {
  if (_themes) return _themes;
  _themes = {
    // Undermountain brick: mortared walls, torch sconces, crates and cobwebs.
    dungeon: {
      id: 'dungeon', biome: 'dungeon', music: 'dungeon', indoor: true,
      name: 'Undermountain',
      floor: tidTable([['DUNGEON_FLOOR', 8], ['STONE_FLOOR', 4], ['STONE_FLOOR_CRACKED', 2]]),
      corridor: tidTable([['DUNGEON_FLOOR', 6], ['STONE_FLOOR_CRACKED', 3]]),
      wall: tid('DUNGEON_WALL'), wallAlt: tid('STONE_WALL', 'DUNGEON_WALL'),
      door: tid('DOOR_CLOSED'), lockedDoor: tid('IRON_DOOR', 'DOOR_CLOSED'),
      secretWall: tid('DUNGEON_WALL'), rug: tid('CARPET_RED', 'MOSAIC'),
      pillar: tid('PILLAR'), water: tid('WATER'), rubble: tid('RUBBLE'),
      props: tidTable([['BARREL', 4], ['CRATE', 4], ['SACK', 2], ['RUBBLE', 5],
        ['BONES', 3], ['TABLE', 1], ['CHAIR', 1], ['BOOKSHELF', 1], ['STATUE', 1]]),
      lights: tidTable([['TORCH', 5], ['BRAZIER', 3], ['CANDLE', 2]]),
      ceiling: tidTable([['COBWEB', 1]]),
      encounterGround: tid('STONE_FLOOR_CRACKED'),
    },
    // Natural rock: no doors, mushrooms and crystal seams instead of furniture.
    cave: {
      id: 'cave', biome: 'cave', music: 'cave', indoor: true,
      name: 'Cavern',
      floor: tidTable([['CAVE_FLOOR', 8], ['CAVE_FLOOR_RUBBLE', 3], ['GRAVEL', 2]]),
      corridor: tidTable([['CAVE_FLOOR', 6], ['CAVE_FLOOR_RUBBLE', 4]]),
      wall: tid('CAVE_WALL'), wallAlt: tid('CAVE_WALL'),
      door: 0, lockedDoor: tid('IRON_DOOR', 'DOOR_CLOSED'),
      secretWall: tid('CAVE_WALL'), rug: 0,
      pillar: tid('STALAGMITE', 'PILLAR'), water: tid('WATER'),
      rubble: tid('CAVE_FLOOR_RUBBLE', 'RUBBLE'),
      props: tidTable([['STALAGMITE', 5], ['ROCK', 5], ['BOULDER', 3],
        ['MUSHROOM_RED', 3], ['MUSHROOM_BROWN', 3], ['MUSHROOM_GLOW', 2], ['BONES', 2]]),
      lights: tidTable([['MUSHROOM_GLOW', 4], ['CRYSTAL', 4], ['TORCH', 1]]),
      ceiling: tidTable([['STALACTITE', 3], ['COBWEB', 1]]),
      encounterGround: tid('CAVE_FLOOR_RUBBLE', 'CAVE_FLOOR'),
    },
    // Old Owl Well and the Neverwinter barrows: tombs, sarcophagi, bone dust.
    crypt: {
      id: 'crypt', biome: 'crypt', music: 'crypt', indoor: true,
      name: 'The Barrows',
      floor: tidTable([['STONE_FLOOR', 7], ['BONE_FLOOR', 3], ['STONE_FLOOR_CRACKED', 3]]),
      corridor: tidTable([['STONE_FLOOR', 5], ['BONE_FLOOR', 3], ['STONE_FLOOR_CRACKED', 3]]),
      wall: tid('STONE_WALL', 'DUNGEON_WALL'), wallAlt: tid('DUNGEON_WALL'),
      door: tid('IRON_DOOR', 'DOOR_CLOSED'), lockedDoor: tid('IRON_DOOR', 'DOOR_CLOSED'),
      secretWall: tid('RUINED_WALL', 'STONE_WALL'), rug: tid('MOSAIC'),
      pillar: tid('PILLAR'), water: tid('WATER'), rubble: tid('BONES', 'RUBBLE'),
      props: tidTable([['SARCOPHAGUS', 5], ['TOMB', 4], ['GRAVESTONE', 3],
        ['BONES', 6], ['SKULL_PILE', 3], ['RUBBLE', 3], ['ALTAR', 1], ['STATUE', 2]]),
      lights: tidTable([['CANDLE', 5], ['BRAZIER', 3], ['TORCH', 2]]),
      ceiling: tidTable([['COBWEB', 4]]),
      encounterGround: tid('BONE_FLOOR', 'STONE_FLOOR_CRACKED'),
    },
    // Wave Echo Cave: ore seams, timber props, minecart rails.
    mine: {
      id: 'mine', biome: 'mine', music: 'cave', indoor: true,
      name: 'Wave Echo Cave',
      floor: tidTable([['CAVE_FLOOR', 7], ['GRAVEL', 4], ['CAVE_FLOOR_RUBBLE', 2]]),
      corridor: tidTable([['GRAVEL', 5], ['CAVE_FLOOR', 5]]),
      wall: tid('CAVE_WALL'), wallAlt: tid('STONE_WALL', 'CAVE_WALL'),
      door: tid('DOOR_CLOSED'), lockedDoor: tid('IRON_DOOR', 'DOOR_CLOSED'),
      secretWall: tid('CAVE_WALL'), rug: 0,
      pillar: tid('TIMBER_SUPPORT', 'PILLAR'), water: tid('WATER'),
      rubble: tid('RUBBLE'),
      props: tidTable([['CRATE', 4], ['BARREL', 3], ['CART', 3], ['SACK', 2],
        ['RUBBLE', 5], ['ROCK', 4], ['ANVIL', 1], ['GRINDSTONE', 1], ['LADDER', 1]]),
      lights: tidTable([['TORCH', 6], ['BRAZIER', 2], ['CRYSTAL', 2]]),
      ceiling: tidTable([['STALACTITE', 2], ['COBWEB', 2]]),
      ore: tidTable([['ORE_IRON', 6], ['ORE_SILVER', 3], ['ORE_GEM', 1]]),
      rail: tid('BRIDGE_WOOD', 'WOOD_FLOOR_H'),
      timber: tid('TIMBER_SUPPORT', 'PILLAR'),
      encounterGround: tid('CAVE_FLOOR_RUBBLE', 'GRAVEL'),
    },
    // Netherese rubble under Thundertree ash: broken columns, open sky.
    ruins: {
      id: 'ruins', biome: 'ruins', music: 'dungeon', indoor: false,
      name: 'Netherese Ruin',
      floor: tidTable([['FLAGSTONE', 6], ['STONE_FLOOR_CRACKED', 4], ['DIRT', 3], ['ASH_GROUND', 2]]),
      corridor: tidTable([['DIRT', 5], ['FLAGSTONE', 3], ['ASH_GROUND', 3]]),
      wall: tid('RUINED_WALL'), wallAlt: tid('STONE_WALL', 'RUINED_WALL'),
      door: 0, lockedDoor: tid('IRON_DOOR', 'DOOR_CLOSED'),
      secretWall: tid('STONE_WALL', 'RUINED_WALL'), rug: tid('MOSAIC'),
      pillar: tid('PILLAR'), water: tid('WATER'), rubble: tid('RUBBLE'),
      props: tidTable([['RUBBLE', 8], ['PILLAR', 4], ['BOULDER', 3], ['ROCK', 4],
        ['DEAD_TREE', 3], ['STATUE', 2], ['BONES', 2]]),
      lights: tidTable([['BRAZIER', 3], ['TORCH', 2]]),
      ceiling: tidTable([]),
      encounterGround: tid('ASH_DRIFT', 'GRAVEL'),
    },
    // A single enormous cavern for a dragon or a beholder.
    lair: {
      id: 'lair', biome: 'cave', music: 'boss', indoor: true,
      name: 'Lair',
      floor: tidTable([['CAVE_FLOOR', 7], ['STONE_FLOOR', 3], ['GRAVEL', 2]]),
      corridor: tidTable([['CAVE_FLOOR', 6], ['GRAVEL', 3]]),
      wall: tid('CAVE_WALL'), wallAlt: tid('CAVE_WALL'),
      door: 0, lockedDoor: tid('IRON_DOOR', 'DOOR_CLOSED'),
      secretWall: tid('CAVE_WALL'), rug: 0,
      pillar: tid('STALAGMITE', 'PILLAR'), water: tid('WATER'),
      rubble: tid('CAVE_FLOOR_RUBBLE', 'RUBBLE'),
      props: tidTable([['BONES', 8], ['SKULL_PILE', 4], ['STALAGMITE', 5],
        ['BOULDER', 3], ['CRYSTAL', 2], ['RUBBLE', 4]]),
      lights: tidTable([['CRYSTAL', 4], ['BRAZIER', 2], ['MUSHROOM_GLOW', 2]]),
      ceiling: tidTable([['STALACTITE', 4]]),
      encounterGround: tid('CAVE_FLOOR_RUBBLE', 'CAVE_FLOOR'),
    },
  };
  return _themes;
}

export const THEME_IDS = Object.freeze(['dungeon', 'cave', 'crypt', 'mine', 'ruins', 'lair']);

function themeOf(id) {
  const th = dungeonThemes();
  return th[id] || th.dungeon;
}

// ---------------------------------------------------------------------------
// 6. SIZE PRESETS
// ---------------------------------------------------------------------------

export const SIZE_PRESETS = Object.freeze({
  tiny: { w: 34, h: 26, rooms: [6, 7], minLeaf: 9, room: [4, 7] },
  small: { w: 42, h: 32, rooms: [7, 9], minLeaf: 10, room: [4, 8] },
  medium: { w: 54, h: 40, rooms: [8, 11], minLeaf: 11, room: [5, 10] },
  large: { w: 68, h: 50, rooms: [10, 13], minLeaf: 12, room: [5, 12] },
  huge: { w: 82, h: 60, rooms: [12, 14], minLeaf: 13, room: [6, 14] },
});
const SIZE_ORDER = ['tiny', 'small', 'medium', 'large', 'huge'];

function sizePreset(size) {
  if (typeof size === 'string' && SIZE_PRESETS[size]) return { ...SIZE_PRESETS[size], id: size };
  if (typeof size === 'number') {
    const i = Math.max(0, Math.min(SIZE_ORDER.length - 1, Math.round(size)));
    return { ...SIZE_PRESETS[SIZE_ORDER[i]], id: SIZE_ORDER[i] };
  }
  return { ...SIZE_PRESETS.medium, id: 'medium' };
}

// ---------------------------------------------------------------------------
// 7. BSP LAYOUT
// ---------------------------------------------------------------------------

function bspNode(x, y, w, h) { return { x, y, w, h, left: null, right: null, room: null }; }

function bspSplit(node, r, minLeaf) {
  if (node.left || node.right) return false;
  let horiz = r.chance(0.5);
  if (node.w > node.h * 1.25) horiz = false;
  else if (node.h > node.w * 1.25) horiz = true;
  const span = horiz ? node.h : node.w;
  const lo = minLeaf, hi = span - minLeaf;
  if (hi <= lo) return false;
  const cut = r.int(lo, hi);
  if (horiz) {
    node.left = bspNode(node.x, node.y, node.w, cut);
    node.right = bspNode(node.x, node.y + cut, node.w, node.h - cut);
  } else {
    node.left = bspNode(node.x, node.y, cut, node.h);
    node.right = bspNode(node.x + cut, node.y, node.w - cut, node.h);
  }
  return true;
}

function bspLeaves(node, out = []) {
  if (!node.left && !node.right) { out.push(node); return out; }
  if (node.left) bspLeaves(node.left, out);
  if (node.right) bspLeaves(node.right, out);
  return out;
}

/** Split the biggest leaf over and over until we have the room count we want. */
function bspBuild(w, h, r, preset) {
  const root = bspNode(1, 1, w - 2, h - 2);
  const want = r.int(preset.rooms[0], preset.rooms[1]);
  let guard = 240;
  while (bspLeaves(root).length < want && guard-- > 0) {
    const leaves = bspLeaves(root).sort((a, b) => (b.w * b.h) - (a.w * a.h));
    let did = false;
    for (const leaf of leaves) if (bspSplit(leaf, r, preset.minLeaf)) { did = true; break; }
    if (!did) break;
  }
  return root;
}

/** Carve one room inside each leaf, leaving a wall ring around it. */
function bspRooms(root, g, r, preset) {
  const rooms = [];
  for (const leaf of bspLeaves(root)) {
    const maxW = Math.min(preset.room[1], leaf.w - 2);
    const maxH = Math.min(preset.room[1], leaf.h - 2);
    if (maxW < preset.room[0] || maxH < preset.room[0]) continue;
    const rw = r.int(preset.room[0], maxW);
    const rh = r.int(preset.room[0], maxH);
    const rx = leaf.x + r.int(1, Math.max(1, leaf.w - rw - 1));
    const ry = leaf.y + r.int(1, Math.max(1, leaf.h - rh - 1));
    const room = {
      id: rooms.length, x: rx, y: ry, w: rw, h: rh,
      cx: rx + (rw >> 1), cy: ry + (rh >> 1),
      kind: 'room', links: [], leaf,
    };
    leaf.room = room;
    for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) g.set(x, y, CELL.ROOM);
    rooms.push(room);
  }
  return rooms;
}

function anyRoom(node, r) {
  if (node.room) return node.room;
  const kids = [node.left, node.right].filter(Boolean);
  for (const k of r.shuffle(kids)) { const room = anyRoom(k, r); if (room) return room; }
  return null;
}

function hRun(g, x0, x1, y, cell = CELL.CORR) {
  const a = Math.min(x0, x1), b = Math.max(x0, x1);
  for (let x = a; x <= b; x++) if (!g.open(x, y)) g.set(x, y, cell);
}
function vRun(g, y0, y1, x, cell = CELL.CORR) {
  const a = Math.min(y0, y1), b = Math.max(y0, y1);
  for (let y = a; y <= b; y++) if (!g.open(x, y)) g.set(x, y, cell);
}

function connectRooms(g, a, b, r) {
  if (!a || !b) return;
  if (r.chance(0.5)) { hRun(g, a.cx, b.cx, a.cy); vRun(g, a.cy, b.cy, b.cx); }
  else { vRun(g, a.cy, b.cy, a.cx); hRun(g, a.cx, b.cx, b.cy); }
  a.links.push(b.id); b.links.push(a.id);
}

/** Post-order walk: every sibling pair gets a corridor, so the tree is one piece. */
function bspConnect(node, g, r) {
  if (!node.left || !node.right) return;
  bspConnect(node.left, g, r);
  bspConnect(node.right, g, r);
  connectRooms(g, anyRoom(node.left, r), anyRoom(node.right, r), r);
}

/** Room-graph BFS — used to find the room furthest from the entrance. */
function roomDistances(rooms, fromId) {
  const dist = new Array(rooms.length).fill(-1);
  if (!rooms.length) return dist;
  dist[fromId] = 0;
  const q = [fromId];
  for (let h = 0; h < q.length; h++) {
    const cur = q[h];
    for (const nx of rooms[cur].links) {
      if (dist[nx] === -1) { dist[nx] = dist[cur] + 1; q.push(nx); }
    }
  }
  return dist;
}

// ---------------------------------------------------------------------------
// 8. SHARED PLACEMENT HELPERS
// ---------------------------------------------------------------------------

/** Put a tile on whichever layer its definition says it belongs to. */
function place(map, x, y, id, extra = 0) {
  if (!id || !inb(map, x, y)) return;
  const d = TILES[id];
  const layer = d ? d.layer : 'deco';
  if (layer === 'ground') setGround(map, x, y, id, extra);
  else if (layer === 'over') { setOver(map, x, y, id); if (extra) fadd(map, x, y, extra); }
  else setDeco(map, x, y, id, extra);
}

function addTrigger(map, x, y, kind, data, w = 1, h = 1) {
  if (!map.triggers) map.triggers = [];
  map.triggers.push({ x, y, w, h, kind, data });
  fadd(map, x, y, TRIGGER);
  return map.triggers[map.triggers.length - 1];
}

function triggerKeySet(map) {
  const s = new Set();
  for (const t of map.triggers || []) {
    for (let y = t.y; y < t.y + (t.h || 1); y++) {
      for (let x = t.x; x < t.x + (t.w || 1); x++) s.add(`${x},${y}`);
    }
  }
  return s;
}

/**
 * A chest's contents are described, not rolled — the world layer rolls them
 * against data/items.js when the lid comes off, so a save file only stores a
 * seed. Depth drives both the gold and the loot tier.
 */
export function chestPlan(depth, r, tier = 'normal') {
  const bonus = tier === 'boss' ? 2 : tier === 'vault' ? 1 : 0;
  const t = Math.min(4, bonus + (r.chance(0.25) ? 1 : 0));
  return {
    tier: t,
    depth,
    cr: Math.max(0.25, Math.round((depth * 0.8 + t) * 4) / 4),
    gold: Math.max(5, Math.round(r.int(9, 28) * (1 + depth * 0.6) * (1 + bonus * 0.75))),
    rolls: 1 + t + (r.chance(0.35) ? 1 : 0),
    seed: r.int(1, 1 << 30),
    locked: tier === 'vault',
  };
}

// ---------------------------------------------------------------------------
// 9. DUNGEON — BSP rooms and corridors
// ---------------------------------------------------------------------------

/** Turn corridor tiles that punch through a room's wall ring into doorways. */
function markDoors(g, rooms, r, chance = 0.75) {
  const doors = [];
  for (const room of rooms) {
    for (let x = room.x - 1; x <= room.x + room.w; x++) {
      for (let y = room.y - 1; y <= room.y + room.h; y++) {
        const onRing = x === room.x - 1 || x === room.x + room.w
          || y === room.y - 1 || y === room.y + room.h;
        if (!onRing) continue;
        if (g.get(x, y) !== CELL.CORR) continue;
        // A doorway is a ring cell with the room on one side and open floor on
        // the other — never a corner, which would look like a hole in the wall.
        const insideH = g.get(x - 1, y) === CELL.ROOM || g.get(x + 1, y) === CELL.ROOM;
        const insideV = g.get(x, y - 1) === CELL.ROOM || g.get(x, y + 1) === CELL.ROOM;
        if (insideH === insideV) continue;
        if (r.chance(chance)) { g.set(x, y, CELL.DOOR); doors.push({ x, y, room }); }
      }
    }
  }
  return doors;
}

/** Corridor tiles with a single exit — perfect for a treasure alcove. */
function deadEnds(g) {
  const out = [];
  for (let y = 1; y < g.h - 1; y++) {
    for (let x = 1; x < g.w - 1; x++) {
      if (g.get(x, y) !== CELL.CORR) continue;
      if (gridOpenNeighbours(g, x, y) === 1) out.push({ x, y });
    }
  }
  return out;
}

/** Find a cavity of solid rock next to `room` big enough to hide a chamber in. */
function findSecretCavity(g, room, r) {
  const sides = r.shuffle([[0, -1], [0, 1], [-1, 0], [1, 0]]);
  for (const [dx, dy] of sides) {
    const rw = r.int(3, 4), rh = r.int(3, 4);
    // The doorway sits on the room ring; the chamber starts one tile beyond it.
    const doorX = dx === 0 ? room.x + r.int(1, Math.max(1, room.w - 2)) : (dx < 0 ? room.x - 1 : room.x + room.w);
    const doorY = dy === 0 ? room.y + r.int(1, Math.max(1, room.h - 2)) : (dy < 0 ? room.y - 1 : room.y + room.h);
    const cx = doorX + dx, cy = doorY + dy;
    const rx = dx === 0 ? cx - (rw >> 1) : (dx < 0 ? cx - rw + 1 : cx);
    const ry = dy === 0 ? cy - (rh >> 1) : (dy < 0 ? cy - rh + 1 : cy);
    let clear = true;
    for (let y = ry - 1; y <= ry + rh && clear; y++) {
      for (let x = rx - 1; x <= rx + rw; x++) {
        if (x < 1 || y < 1 || x >= g.w - 1 || y >= g.h - 1) { clear = false; break; }
        if (x === doorX && y === doorY) continue;
        if (g.get(x, y) !== CELL.WALL) { clear = false; break; }
      }
    }
    if (!clear) continue;
    return { door: { x: doorX, y: doorY }, x: rx, y: ry, w: rw, h: rh };
  }
  return null;
}

/** Paint one symbolic cell into real tiles. */
function paintCell(map, g, th, r, x, y) {
  const c = g.get(x, y);
  switch (c) {
    case CELL.WALL:
    case CELL.SECRET: {
      const seen = c === CELL.SECRET || gridAnyOpen8(g, x, y);
      if (!seen) { carveFloor(map, x, y, 0); return; }       // VOID: solid + cheap
      carveFloor(map, x, y, pickTid(r, th.floor));
      setDeco(map, x, y, c === CELL.SECRET ? th.secretWall : (r.chance(0.12) ? th.wallAlt : th.wall));
      return;
    }
    case CELL.CORR:
      carveFloor(map, x, y, pickTid(r, th.corridor));
      return;
    case CELL.DOOR:
      carveFloor(map, x, y, pickTid(r, th.corridor));
      // Ordinary passage doors have no lock/interaction trigger. Keep them
      // open so the runtime's SOLID collision agrees with connectivity checks.
      if (th.door) setDeco(map, x, y, tid('DOOR_OPEN'));
      return;
    case CELL.LOCKED:
      carveFloor(map, x, y, pickTid(r, th.corridor));
      setDeco(map, x, y, th.lockedDoor || th.door || th.wall);
      return;
    case CELL.RUBBLE:
      carveFloor(map, x, y, pickTid(r, th.floor));
      place(map, x, y, th.rubble, SLOW);
      return;
    case CELL.POOL:
      carveFloor(map, x, y, th.water);
      return;
    default:
      carveFloor(map, x, y, pickTid(r, th.floor));
  }
}

/**
 * Procedural dungeon floor.
 *   { seed, depth=1, biome, theme='dungeon', size='medium', name }
 * Guarantees: entry stairs -> exit stairs is always walkable; 6-14 rooms;
 * doors at room mouths; dead-end alcoves; a boss room every 5th floor; one
 * locked vault with its key out in the open; a secret chamber; 2-5 chests.
 */
export function generateDungeon(opts = {}) {
  const depth = Math.max(1, opts.depth || 1);
  const themeId = opts.theme || opts.biome || 'dungeon';
  if (themeId === 'lair') return generateLair(opts);
  const th = themeOf(themeId);
  const preset = sizePreset(opts.size);
  const seed = opts.seed != null ? opts.seed : `dungeon-${themeId}-${depth}`;
  const root = makeRNG(seed);
  const r = root.fork('layout');
  const rd = root.fork('detail');
  const w = opts.w || preset.w, h = opts.h || preset.h;
  const milestone = depth % 5 === 0;

  // --- 1. layout ----------------------------------------------------------
  const g = makeGrid(w, h, CELL.WALL);
  const tree = bspBuild(w, h, r, preset);
  const rooms = bspRooms(tree, g, r, preset);
  bspConnect(tree, g, r);

  // A couple of loop corridors so the floor isn't a pure tree to backtrack.
  const loops = r.int(1, 3);
  for (let i = 0; i < loops && rooms.length > 3; i++) {
    const a = r.pick(rooms), b = r.pick(rooms);
    if (!a || !b || a.id === b.id || a.links.includes(b.id)) continue;
    connectRooms(g, a, b, r);
  }

  markDoors(g, rooms, r, th.door ? 0.78 : 0.25);

  // --- 2. entry / exit / boss --------------------------------------------
  const entryRoom = rooms.length ? r.pick(rooms) : null;
  const dists = roomDistances(rooms, entryRoom ? entryRoom.id : 0);
  let exitRoom = entryRoom;
  let best = -1;
  for (const room of rooms) {
    const d = dists[room.id] >= 0 ? dists[room.id] : 0;
    if (room.id === (entryRoom ? entryRoom.id : -1)) continue;
    if (d > best) { best = d; exitRoom = room; }
  }
  if (entryRoom) entryRoom.kind = 'entry';
  if (exitRoom && exitRoom !== entryRoom) exitRoom.kind = milestone ? 'boss' : 'exit';

  const entry = entryRoom
    ? { x: entryRoom.cx, y: entryRoom.cy }
    : { x: w >> 1, y: h >> 1 };
  const exit = exitRoom
    ? { x: exitRoom.cx, y: exitRoom.cy + (milestone ? Math.max(1, (exitRoom.h >> 1) - 1) : 0) }
    : { x: entry.x + 1, y: entry.y };
  if (milestone && exitRoom) {
    // Stairs at the back of the boss chamber, so you fight your way to them.
    exit.x = exitRoom.cx;
    exit.y = exitRoom.y;
  }
  g.set(entry.x, entry.y, CELL.UP);
  g.set(exit.x, exit.y, CELL.DOWN);

  // --- 3. flavour cells ---------------------------------------------------
  const alcoves = [];
  for (const de of deadEnds(g)) {
    if (!rd.chance(0.62)) continue;
    g.set(de.x, de.y, CELL.ALCOVE);
    alcoves.push(de);
  }
  // Collapsed rubble and standing water inside rooms.
  for (const room of rooms) {
    if (room.kind === 'entry') continue;
    if (rd.chance(0.35)) {
      const px = rd.int(room.x, room.x + room.w - 1), py = rd.int(room.y, room.y + room.h - 1);
      for (const [dx, dy] of [[0, 0], ...rd.shuffle(ORTH).slice(0, rd.int(0, 3))]) {
        if (g.get(px + dx, py + dy) === CELL.ROOM) g.set(px + dx, py + dy, CELL.RUBBLE);
      }
    }
    if (rd.chance(0.18) && room.w > 4 && room.h > 4) {
      const px = rd.int(room.x + 1, room.x + room.w - 2), py = rd.int(room.y + 1, room.y + room.h - 2);
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        if (g.get(px + dx, py + dy) === CELL.ROOM) g.set(px + dx, py + dy, CELL.POOL);
      }
    }
  }

  // --- 4. locked vault ----------------------------------------------------
  // Only ever gate a dead-end room, so the key can never block the way out.
  let vault = null;
  const vaultable = rooms.filter((rm) => rm.links.length === 1 && rm.kind === 'room');
  if (vaultable.length) {
    vault = rd.pick(vaultable);
    vault.kind = 'vault';
    for (let x = vault.x - 1; x <= vault.x + vault.w; x++) {
      for (let y = vault.y - 1; y <= vault.y + vault.h; y++) {
        if (g.get(x, y) === CELL.DOOR || g.get(x, y) === CELL.CORR) {
          const onRing = x === vault.x - 1 || x === vault.x + vault.w
            || y === vault.y - 1 || y === vault.y + vault.h;
          if (onRing) g.set(x, y, CELL.LOCKED);
        }
      }
    }
  }

  // --- 5. secret chamber --------------------------------------------------
  let secret = null;
  for (const room of rd.shuffle(rooms)) {
    if (room.kind === 'vault') continue;
    const cav = findSecretCavity(g, room, rd);
    if (!cav) continue;
    for (let y = cav.y; y < cav.y + cav.h; y++) {
      for (let x = cav.x; x < cav.x + cav.w; x++) g.set(x, y, CELL.HIDDEN);
    }
    g.set(cav.door.x, cav.door.y, CELL.SECRET);
    secret = cav;
    break;
  }

  // --- 6. paint -----------------------------------------------------------
  const map = new TileMap({
    w, h,
    name: opts.name || `${th.name} — Level ${depth}`,
    biome: opts.biome || th.biome,
    indoor: opts.indoor != null ? opts.indoor : th.indoor,
    music: milestone ? 'boss' : th.music,
    // Indoor TileMaps default to peaceful; generated dungeon danger patches
    // need an explicit rate. Preserve an intentionally disabled encounter rate.
    encounterRate: opts.encounterRate ?? 0.06,
    encounterTable: opts.encounterTable || null,
  });
  const rp = root.fork('paint');
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) paintCell(map, g, th, rp, x, y);

  map.spawn = { x: entry.x, y: entry.y };
  map.entry = { x: entry.x, y: entry.y };
  map.exit = { x: exit.x, y: exit.y };
  map.depth = depth;
  map.theme = th.id;
  map.seed = root.seed;
  map.milestone = milestone;
  map.rooms = rooms.map((rm) => ({ id: rm.id, x: rm.x, y: rm.y, w: rm.w, h: rm.h, kind: rm.kind }));
  map.triggers = map.triggers || [];

  // --- 7. stairs, boss, doors, keys --------------------------------------
  setGround(map, entry.x, entry.y, tid('STAIRS_UP'), TRIGGER);
  addTrigger(map, entry.x, entry.y, 'warp', {
    dir: 'up', depth: depth - 1, theme: th.id, exit: depth <= 1,
  });
  setGround(map, exit.x, exit.y, tid('STAIRS_DOWN'), TRIGGER);
  addTrigger(map, exit.x, exit.y, 'warp', { dir: 'down', depth: depth + 1, theme: th.id,
    guarded: milestone ? { boss: true, depth, biome: map.biome, theme: th.id, encounterKey: 'guardian' } : null });

  if (secret) {
    addTrigger(map, secret.door.x, secret.door.y, 'script', {
      kind: 'secret-door', dc: 12 + Math.floor(depth / 2), theme: th.id,
    });
  }

  let keyId = null;
  if (vault) {
    keyId = `key-${th.id}-${depth}`;
    for (let x = vault.x - 1; x <= vault.x + vault.w; x++) {
      for (let y = vault.y - 1; y <= vault.y + vault.h; y++) {
        if (g.get(x, y) === CELL.LOCKED) {
          addTrigger(map, x, y, 'script', { kind: 'locked-door', keyId, dc: 15 });
        }
      }
    }
    // The key waits in an ordinary room somewhere else on the floor.
    const keyRooms = rooms.filter((rm) => rm.id !== vault.id && rm.kind !== 'entry');
    const kr = rd.pick(keyRooms.length ? keyRooms : rooms);
    if (kr) {
      const kx = rd.int(kr.x, kr.x + kr.w - 1), ky = rd.int(kr.y, kr.y + kr.h - 1);
      if (walkable(map, kx, ky)) {
        setDeco(map, kx, ky, tid('CHEST_CLOSED'), TRIGGER);
        addTrigger(map, kx, ky, 'chest', { ...chestPlan(depth, rd), keyId, name: 'Iron Key' });
      }
    }
    map.keyId = keyId;
  }

  // --- 8. boss chamber ----------------------------------------------------
  if (milestone && exitRoom) {
    const bx = exitRoom.cx, by = exitRoom.cy;
    if (th.rug) for (let y = by - 1; y <= by + 1; y++) for (let x = bx - 1; x <= bx + 1; x++) {
      if (walkable(map, x, y)) setGround(map, x, y, th.rug);
    }
    // Symmetric pillars and corner braziers read as "somebody built this".
    const px = Math.max(1, (exitRoom.w >> 1) - 1), py = Math.max(1, (exitRoom.h >> 1) - 1);
    for (const [dx, dy] of [[-px, -py], [px, -py], [-px, py], [px, py]]) {
      const x = bx + dx, y = by + dy;
      if (walkable(map, x, y) && safeToBlock(map, x, y)) place(map, x, y, th.pillar);
    }
    for (const [dx, dy] of [[-px + 1, -py], [px - 1, -py]]) {
      const x = bx + dx, y = by + dy;
      if (walkable(map, x, y) && !hasProp(map, x, y)) place(map, x, y, pickTid(rd, th.lights));
    }
    const guardian = {
      boss: true, depth, biome: map.biome, theme: th.id, seed: rd.int(1, 1 << 30), encounterKey: 'guardian',
    };
    addTrigger(map, bx, by, 'battle', guardian);
    map.triggers.find(t => t.kind === 'warp' && t.x === exit.x && t.y === exit.y).data.guarded = guardian;
    if (th.id === 'dungeon') {
      // Halaster likes an audience.
      addTrigger(map, entry.x, entry.y, 'script', { kind: 'halaster-taunt', depth });
    }
  }

  // --- 9. chests ----------------------------------------------------------
  const chestSpots = [];
  for (const a of alcoves) chestSpots.push({ x: a.x, y: a.y, tier: 'normal' });
  if (vault) {
    for (let i = 0; i < 2; i++) {
      chestSpots.push({
        x: rd.int(vault.x, vault.x + vault.w - 1),
        y: rd.int(vault.y, vault.y + vault.h - 1), tier: 'vault',
      });
    }
  }
  if (secret) {
    chestSpots.push({
      x: secret.x + (secret.w >> 1), y: secret.y + (secret.h >> 1), tier: 'vault',
    });
  }
  for (const room of rd.shuffle(rooms)) {
    if (room.kind === 'entry') continue;
    if (!rd.chance(0.45)) continue;
    chestSpots.push({
      x: rd.int(room.x, room.x + room.w - 1),
      y: rd.int(room.y, room.y + room.h - 1),
      tier: room.kind === 'boss' ? 'boss' : 'normal',
    });
  }
  const wantChests = rd.int(2, 5) + (milestone ? 1 : 0);
  let placedChests = 0;
  const used = new Set([`${entry.x},${entry.y}`, `${exit.x},${exit.y}`]);
  for (const spot of chestSpots) {
    if (placedChests >= wantChests) break;
    const k = `${spot.x},${spot.y}`;
    if (used.has(k) || !walkable(map, spot.x, spot.y) || hasProp(map, spot.x, spot.y)) continue;
    if (!safeToBlock(map, spot.x, spot.y)) continue;
    used.add(k);
    setDeco(map, spot.x, spot.y, tid('CHEST_CLOSED'), TRIGGER);
    addTrigger(map, spot.x, spot.y, 'chest', chestPlan(depth, rd, spot.tier));
    placedChests++;
  }

  // --- 10. dressing -------------------------------------------------------
  dressDungeon(map, g, th, root.fork('dress'), { depth, rooms });
  decorate(map, map.biome, root.fork('decor'));
  placeEncounterZones(map, root.fork('zones'), { biome: map.biome, indoor: true });

  // --- 11. the promise ----------------------------------------------------
  const mustReach = [map.entry, map.exit, ...(map.triggers || [])
    .filter((t) => t.kind === 'chest' || t.kind === 'battle')
    .map((t) => ({ x: t.x, y: t.y, optional: false }))];
  if (secret) {
    // The hidden room is meant to be sealed — don't dig a hole in it.
    for (const p of mustReach) {
      if (p.x >= secret.x && p.x < secret.x + secret.w && p.y >= secret.y && p.y < secret.y + secret.h) p.optional = true;
    }
  }
  if (vault) {
    for (const p of mustReach) {
      if (p.x >= vault.x && p.x < vault.x + vault.w && p.y >= vault.y && p.y < vault.y + vault.h) p.optional = true;
    }
  }
  validateConnectivity(map, mustReach, {
    paint: (x, y) => carveFloor(map, x, y, pickTid(rp, th.corridor)),
  });
  // Two occupied rooms break up long empty floors. These are authored patrol
  // encounters, not extra random ambushes; defeated patrols stay cleared.
  const occupied = triggerKeySet(map);
  const ordinary = rooms.filter(r => !['entry','exit','boss'].includes(r.kind) && r !== vault && r !== secret);
  let patrol = 0, discovery = 0;
  for (const room of ordinary) {
    const spots = [];
    for (let y=room.y;y<room.y+room.h;y++) for(let x=room.x;x<room.x+room.w;x++)
      if(walkable(map,x,y) && !hasProp(map,x,y) && !occupied.has(`${x},${y}`)) spots.push({x,y});
    if (!spots.length) continue;
    const p = spots.sort((a,b)=>Math.abs(a.x-room.cx)+Math.abs(a.y-room.cy)-Math.abs(b.x-room.cx)-Math.abs(b.y-room.cy))[0];
    if (patrol < 2) {
      const data = {depth,biome:map.biome,theme:th.id,difficulty:'easy',
        encounterKey:`patrol-${patrol++}`,seed:root.seed + ':' + room.id};
      for (const q of spots) {
        addTrigger(map,q.x,q.y,'battle',data);
        occupied.add(`${q.x},${q.y}`);
      }
      setGround(map,p.x,p.y,th.encounterGround,TRIGGER);
    } else if (discovery < 2 && safeToBlock(map,p.x,p.y)) {
      const notes = [
        'A rota lists the late watch, two missing lanterns, and a firm reminder: whoever borrows the kettle must return it. Fresh bootprints lead deeper.',
        'Someone has scratched a game of knucklebones into the table. The tally ends with: "You still owe me supper." A folded blanket waits beside it.'
      ];
      place(map,p.x,p.y,tid('SIGN'));
      addTrigger(map,p.x,p.y,'sign',{title:'Signs of life',text:notes[discovery++]});
    }
    occupied.add(`${p.x},${p.y}`);
  }
  return map;
}

/** Torches, cobwebs, ore seams, minecart rails and the odd barrel. */
function dressDungeon(map, g, th, r, info) {
  const { depth } = info;
  const skip = triggerKeySet(map);
  // Wall sconces: a light every so often on a wall facing open floor.
  for (let y = 1; y < map.h - 1; y++) {
    for (let x = 1; x < map.w - 1; x++) {
      if (!walkable(map, x, y) || hasProp(map, x, y) || skip.has(`${x},${y}`)) continue;
      const wallAbove = !walkable(map, x, y - 1) && getT(map, 'deco', x, y - 1) !== 0;
      if (wallAbove && r.chance(0.085)) {
        place(map, x, y, pickTid(r, th.lights));
        continue;
      }
      if (r.chance(0.045)) {
        const id = pickTid(r, th.props);
        if (id && canPlaceProp(map, x, y, id)) place(map, x, y, id);
      }
      if (th.ceiling && th.ceiling.length && r.chance(0.03)) {
        const id = pickTid(r, th.ceiling);
        if (id && TILES[id] && TILES[id].layer === 'over') setOver(map, x, y, id);
      }
    }
  }
  // Ore seams sit in the rock face of a mine, never in the middle of the floor.
  if (th.ore && th.ore.length) {
    for (let y = 1; y < map.h - 1; y++) {
      for (let x = 1; x < map.w - 1; x++) {
        if (walkable(map, x, y)) continue;
        if (getT(map, 'deco', x, y) !== th.wall) continue;
        let touchesFloor = false;
        for (const [dx, dy] of ORTH) if (walkable(map, x + dx, y + dy)) touchesFloor = true;
        if (!touchesFloor) continue;
        if (r.chance(0.07 + Math.min(0.06, depth * 0.006))) setDeco(map, x, y, pickTid(r, th.ore));
      }
    }
  }
  // Minecart rails follow the corridors of a mine.
  if (th.rail) {
    for (let y = 1; y < map.h - 1; y++) {
      for (let x = 1; x < map.w - 1; x++) {
        if (g.get(x, y) !== CELL.CORR) continue;
        if (hasProp(map, x, y) || skip.has(`${x},${y}`)) continue;
        if (r.chance(0.5)) setGround(map, x, y, th.rail);
      }
    }
    // Timber shoring across the tunnels.
    for (const de of deadEnds(g)) if (r.chance(0.3)) place(map, de.x, de.y, th.timber);
  }
}

/**
 * A prop may stand here if it is passable, or — when it is solid — if walling
 * this tile off cannot pinch the map in two.
 */
export function canPlaceProp(map, x, y, id) {
  if (!walkable(map, x, y) || hasProp(map, x, y)) return false;
  const solid = (tileFlags(id) & SOLID) !== 0;
  if (!solid) return true;
  return safeToBlock(map, x, y);
}

/** Crypt floor — the Neverwinter barrows and the crypts under Old Owl Well. */
export function generateCrypt(opts = {}) {
  return generateDungeon({ size: 'medium', ...opts, theme: 'crypt', biome: opts.biome || 'crypt' });
}

/** Mine floor — Wave Echo Cave and the delvings under the Sword Mountains. */
export function generateMine(opts = {}) {
  return generateDungeon({ size: 'large', ...opts, theme: 'mine', biome: opts.biome || 'mine' });
}

// ---------------------------------------------------------------------------
// 10. CAVE — cellular automata
// ---------------------------------------------------------------------------

const CAVE_SIZES = {
  tiny: [36, 28], small: [44, 34], medium: [56, 42], large: [70, 52], huge: [86, 62],
};

/**
 * Organic cavern.
 *   { seed, depth, size, theme='cave', fill=0.45, iterations=5, biome, name }
 * Cellular automata (a tile is rock if 5+ of its 8 neighbours are rock), then
 * flood fill: the biggest chamber is kept, small pockets are back-filled, and
 * any sizeable orphan is tunnelled into the main cavern so nothing is stranded.
 */
export function generateCave(opts = {}) {
  const depth = Math.max(1, opts.depth || 1);
  const th = themeOf(opts.theme || 'cave');
  const seed = opts.seed != null ? opts.seed : `cave-${depth}`;
  const root = makeRNG(seed);
  const r = root.fork('ca');
  const sizeKey = typeof opts.size === 'string' && CAVE_SIZES[opts.size] ? opts.size : 'medium';
  const w = opts.w || CAVE_SIZES[sizeKey][0];
  const h = opts.h || CAVE_SIZES[sizeKey][1];
  const fill = opts.fill != null ? opts.fill : 0.45;
  const iterations = opts.iterations != null ? opts.iterations : 5;

  // --- 1. noise seed ------------------------------------------------------
  let rock = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const edge = x < 2 || y < 2 || x >= w - 2 || y >= h - 2;
      rock[x + y * w] = edge || r.chance(fill) ? 1 : 0;
    }
  }

  // --- 2. smoothing -------------------------------------------------------
  const countRock = (src, x, y, rad) => {
    let n = 0;
    for (let dy = -rad; dy <= rad; dy++) {
      for (let dx = -rad; dx <= rad; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) { n++; continue; }
        n += src[nx + ny * w];
      }
    }
    return n;
  };
  for (let it = 0; it < iterations; it++) {
    const next = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) { next[x + y * w] = 1; continue; }
        const n1 = countRock(rock, x, y, 1);
        // The 4-5 rule; the early passes also fill wide-open voids so the cave
        // grows a few interior pillars instead of one featureless blob.
        if (it < 3) next[x + y * w] = (n1 >= 5 || countRock(rock, x, y, 2) <= 2) ? 1 : 0;
        else next[x + y * w] = n1 >= 5 ? 1 : 0;
      }
    }
    rock = next;
  }

  // --- 3. keep the largest chamber ---------------------------------------
  const isOpen = (x, y) => x >= 0 && y >= 0 && x < w && y < h && rock[x + y * w] === 0;
  const regions = [];
  const seen = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = x + y * w;
      if (seen[i] || !isOpen(x, y)) continue;
      const cells = [i]; seen[i] = 1;
      for (let head = 0; head < cells.length; head++) {
        const cx = cells[head] % w, cy = (cells[head] / w) | 0;
        for (const [dx, dy] of ORTH) {
          const nx = cx + dx, ny = cy + dy, ni = nx + ny * w;
          if (!isOpen(nx, ny) || seen[ni]) continue;
          seen[ni] = 1; cells.push(ni);
        }
      }
      regions.push(cells);
    }
  }
  regions.sort((a, b) => b.length - a.length);
  const MIN_POCKET = 16;
  const main = regions[0] || [];
  const keep = [main];
  for (let i = 1; i < regions.length; i++) {
    if (regions[i].length >= MIN_POCKET) keep.push(regions[i]);
    else for (const c of regions[i]) rock[c] = 1;   // pebble-sized: fill it in
  }
  // Tunnel every surviving orphan into the main chamber.
  for (let i = 1; i < keep.length; i++) {
    const a = keep[i][(keep[i].length / 2) | 0];
    let bestB = main[0], bestD = Infinity;
    const ax = a % w, ay = (a / w) | 0;
    for (const c of main) {
      const cx = c % w, cy = (c / w) | 0;
      const d = Math.abs(cx - ax) + Math.abs(cy - ay);
      if (d < bestD) { bestD = d; bestB = c; }
    }
    let cx = ax, cy = ay;
    const bx = bestB % w, by = (bestB / w) | 0;
    let guard = w + h + 8;
    while ((cx !== bx || cy !== by) && guard-- > 0) {
      rock[cx + cy * w] = 0;
      // widen the tunnel a touch so it reads as a passage, not a scratch
      if (cy > 1) rock[cx + (cy - 1) * w] = 0;
      if (cx > bx) cx--; else if (cx < bx) cx++;
      else if (cy > by) cy--; else if (cy < by) cy++;
    }
    rock[bx + by * w] = 0;
  }
  // Re-seal the border after all that digging.
  for (let x = 0; x < w; x++) { rock[x] = 1; rock[x + (h - 1) * w] = 1; }
  for (let y = 0; y < h; y++) { rock[y * w] = 1; rock[w - 1 + y * w] = 1; }

  // --- 4. paint -----------------------------------------------------------
  const map = new TileMap({
    w, h,
    name: opts.name || `${th.name} — Level ${depth}`,
    biome: opts.biome || th.biome,
    indoor: opts.indoor != null ? opts.indoor : true,
    music: th.music,
  });
  const rp = root.fork('paint');
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (rock[x + y * w]) {
        let visible = false;
        for (const [dx, dy] of DIAG8) if (isOpen(x + dx, y + dy)) visible = true;
        if (!visible) { carveFloor(map, x, y, 0); continue; }
        carveFloor(map, x, y, pickTid(rp, th.floor));
        setDeco(map, x, y, th.wall);
      } else {
        carveFloor(map, x, y, pickTid(rp, th.floor));
      }
    }
  }

  // --- 5. water, crystal seams, mushroom beds ----------------------------
  const rd = root.fork('detail');
  const pools = rd.int(1, 3);
  for (let p = 0; p < pools; p++) {
    const seedCell = rd.pick(main);
    if (seedCell == null) break;
    const sx = seedCell % w, sy = (seedCell / w) | 0;
    const rad = rd.int(1, 3);
    for (let y = sy - rad; y <= sy + rad; y++) {
      for (let x = sx - rad; x <= sx + rad; x++) {
        if (!walkable(map, x, y)) continue;
        if (Math.hypot(x - sx, y - sy) > rad + 0.3) continue;
        setGround(map, x, y, th.water);
      }
    }
  }

  // --- 6. entrance and exit ----------------------------------------------
  let spawn = null;
  for (const c of main) {
    const x = c % w, y = (c / w) | 0;
    if (!walkable(map, x, y)) continue;
    if (!spawn || x + y < spawn.x + spawn.y) spawn = { x, y };
  }
  if (!spawn) spawn = { x: w >> 1, y: h >> 1 };
  map.spawn = spawn;
  map.entry = { ...spawn };
  const far = farthestFrom(map, spawn.x, spawn.y, (x, y) => !(fget(map, x, y) & WATER));
  map.exit = { x: far.x, y: far.y };
  map.depth = depth;
  map.theme = th.id;
  map.seed = root.seed;
  map.triggers = [];

  setGround(map, map.entry.x, map.entry.y, tid('STAIRS_UP'), TRIGGER);
  addTrigger(map, map.entry.x, map.entry.y, 'warp', { dir: 'up', depth: depth - 1, theme: th.id, exit: depth <= 1 });
  setGround(map, map.exit.x, map.exit.y, tid('STAIRS_DOWN'), TRIGGER);
  addTrigger(map, map.exit.x, map.exit.y, 'warp', { dir: 'down', depth: depth + 1, theme: th.id });

  // --- 7. chests in the far corners --------------------------------------
  const wantChests = rd.int(2, 4);
  const used = new Set([`${map.entry.x},${map.entry.y}`, `${map.exit.x},${map.exit.y}`]);
  let placed = 0, tries = 0;
  while (placed < wantChests && tries++ < 400) {
    const c = rd.pick(main);
    if (c == null) break;
    const x = c % w, y = (c / w) | 0;
    const k = `${x},${y}`;
    if (used.has(k) || !walkable(map, x, y) || hasProp(map, x, y)) continue;
    if (Math.abs(x - map.entry.x) + Math.abs(y - map.entry.y) < 8) continue;
    if (!safeToBlock(map, x, y)) continue;
    used.add(k);
    setDeco(map, x, y, tid('CHEST_CLOSED'), TRIGGER);
    addTrigger(map, x, y, 'chest', chestPlan(depth, rd));
    placed++;
  }

  decorate(map, map.biome, root.fork('decor'));
  placeEncounterZones(map, root.fork('zones'), { biome: map.biome, indoor: true });
  validateConnectivity(map, [map.entry, map.exit,
    ...map.triggers.filter((t) => t.kind === 'chest').map((t) => ({ x: t.x, y: t.y }))], {
    paint: (x, y) => carveFloor(map, x, y, pickTid(rp, th.floor)),
  });
  return map;
}

/**
 * One enormous chamber for something that needs the room — a dragon on its
 * hoard, a beholder in its eye tyrant's court.
 */
export function generateLair(opts = {}) {
  const depth = Math.max(1, opts.depth || 1);
  const th = themeOf('lair');
  const root = makeRNG(opts.seed != null ? opts.seed : `lair-${depth}`);
  const map = generateCave({
    ...opts,
    seed: root.fork('cavern').seed,
    theme: 'lair',
    fill: 0.40,          // more open rock
    iterations: 6,       // smoother, rounder walls
    size: opts.size || 'large',
    name: opts.name || `${opts.lairOf || 'Lair'}`,
    biome: opts.biome || 'cave',
  });
  const r = root.fork('hoard');
  map.music = 'boss';
  map.theme = 'lair';
  map.milestone = true;

  // Clear a broad arena around the deepest point and pile the hoard in it.
  const cx = map.exit.x, cy = map.exit.y;
  for (let y = cy - 4; y <= cy + 4; y++) {
    for (let x = cx - 5; x <= cx + 5; x++) {
      if (!inb(map, x, y) || x < 2 || y < 2 || x >= map.w - 2 || y >= map.h - 2) continue;
      if (Math.hypot((x - cx) * 0.72, y - cy) > 4.6) continue;
      carveFloor(map, x, y, pickTid(r, th.floor));
    }
  }
  for (let i = 0; i < 18; i++) {
    const x = cx + r.int(-4, 4), y = cy + r.int(-3, 3);
    if (walkable(map, x, y) && !hasProp(map, x, y)) place(map, x, y, pickTid(r, th.props));
  }
  setGround(map, cx, cy, pickTid(r, th.floor));
  setT(map, 'deco', cx, cy, 0);
  refresh(map, cx, cy);
  addTrigger(map, cx, cy, 'battle', {
    boss: true, lair: true, depth, biome: map.biome, monsterId: opts.monsterId || null,
    seed: r.int(1, 1 << 30),
  });
  for (let i = 0; i < 3; i++) {
    const x = cx + r.int(-4, 4), y = cy + r.int(-3, 3);
    if (!walkable(map, x, y) || hasProp(map, x, y) || (x === cx && y === cy)) continue;
    setDeco(map, x, y, tid('CHEST_CLOSED'), TRIGGER);
    addTrigger(map, x, y, 'chest', chestPlan(depth, r, 'boss'));
  }
  validateConnectivity(map, [map.entry, { x: cx, y: cy }], {
    paint: (x, y) => carveFloor(map, x, y, pickTid(r, th.floor)),
  });
  return map;
}

// ---------------------------------------------------------------------------
// 11. FOREST — Neverwinter Wood and Kryptgarden
// ---------------------------------------------------------------------------

const OUTDOOR_SIZES = {
  tiny: [40, 30], small: [48, 36], medium: [64, 48], large: [80, 60], huge: [96, 72],
};

function outdoorSize(opts, def = 'medium') {
  const key = typeof opts.size === 'string' && OUTDOOR_SIZES[opts.size] ? opts.size : def;
  return { w: opts.w || OUTDOOR_SIZES[key][0], h: opts.h || OUTDOOR_SIZES[key][1] };
}

/** Dart-throwing: n points at least `minDist` apart inside a padded rect. */
function scatterPoints(r, w, h, n, minDist, pad = 4) {
  const pts = [];
  let tries = 0;
  while (pts.length < n && tries++ < n * 60) {
    const x = r.int(pad, w - pad - 1), y = r.int(pad, h - pad - 1);
    if (pts.some((p) => Math.hypot(p.x - x, p.y - y) < minDist)) continue;
    pts.push({ x, y });
  }
  return pts;
}

/**
 * Wooded map: clustered trees, winding dirt paths between clearings, a stream
 * with bridges, tall-grass encounter patches and a few Realms landmarks.
 *   { seed, size, pine=false, biome, name, level, landmarks=true }
 */
export function generateForest(opts = {}) {
  const pine = !!opts.pine || opts.biome === 'pine-forest';
  const root = makeRNG(opts.seed != null ? opts.seed : `forest-${pine ? 'pine' : 'oak'}`);
  const { w, h } = outdoorSize(opts, 'medium');
  const biome = opts.biome || (pine ? 'pine-forest' : 'forest');
  const map = new TileMap({
    w, h,
    name: opts.name || (pine ? 'Neverwinter Wood' : 'Kryptgarden Forest'),
    biome, indoor: false, music: biome === 'marsh' ? 'marsh' : 'forest',
  });
  map.seed = root.seed;
  map.triggers = [];
  map.level = opts.level || 3;

  const rg = root.fork('ground');
  const grasses = tidTable([['GRASS', 8], ['GRASS_2', 6], ['GRASS_3', 3], ['CLOVER', 2]]);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) carveFloor(map, x, y, pickTid(rg, grasses));
  }

  // --- clearings ----------------------------------------------------------
  const rc = root.fork('clearings');
  const clearings = scatterPoints(rc, w, h, rc.int(4, 7), Math.min(w, h) * 0.28, 6);
  if (!clearings.length) clearings.push({ x: w >> 1, y: h >> 1 });
  const clearRad = clearings.map(() => rc.int(3, 5));
  const inClearing = (x, y) => clearings.some((c, i) => Math.hypot(x - c.x, y - c.y) <= clearRad[i]);

  // --- paths --------------------------------------------------------------
  // A drunken walk toward the target reads as a foot-worn track, not a ruler line.
  const rp = root.fork('paths');
  const pathMask = new Uint8Array(w * h);
  const dirtTable = tidTable([['DIRT_PATH', 7], ['DIRT', 3]]);
  const stamp = (x, y) => {
    if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) return;
    pathMask[x + y * w] = 1;
    carveFloor(map, x, y, pickTid(rp, dirtTable));
  };
  const walkPath = (a, b) => {
    let x = a.x, y = a.y, guard = (w + h) * 3;
    while ((x !== b.x || y !== b.y) && guard-- > 0) {
      stamp(x, y);
      if (rp.chance(0.24)) stamp(x + rp.pick([-1, 1]), y);
      const dx = Math.sign(b.x - x), dy = Math.sign(b.y - y);
      if (dx && dy) { if (rp.chance(0.5)) x += dx; else y += dy; }
      else if (dx) { x += dx; if (rp.chance(0.22)) y += rp.sign(); }
      else if (dy) { y += dy; if (rp.chance(0.22)) x += rp.sign(); }
      x = Math.max(1, Math.min(w - 2, x)); y = Math.max(1, Math.min(h - 2, y));
    }
    stamp(b.x, b.y);
  };
  for (let i = 1; i < clearings.length; i++) walkPath(clearings[i - 1], clearings[i]);
  // A track out to each edge so the map connects to the wider world.
  walkPath(clearings[0], { x: 1, y: clearings[0].y });
  walkPath(clearings[clearings.length - 1], { x: w - 2, y: clearings[clearings.length - 1].y });

  // --- stream + bridges ---------------------------------------------------
  const rs = root.fork('stream');
  const streamMask = new Uint8Array(w * h);
  if (rs.chance(0.8)) {
    const vertical = rs.chance(0.55);
    const n = makeNoise(rs.fork('meander'), 0.09);
    const span = vertical ? h : w;
    const mid = vertical ? rs.int(10, w - 11) : rs.int(8, h - 9);
    const width = rs.int(1, 2);
    for (let i = 0; i < span; i++) {
      const off = Math.round((n(i, 0) - 0.5) * 14);
      for (let k = 0; k < width; k++) {
        const x = vertical ? mid + off + k : i;
        const y = vertical ? i : mid + off + k;
        if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
        streamMask[x + y * w] = 1;
        carveFloor(map, x, y, tid('WATER'));
      }
    }
    // Where a track meets the water, somebody laid planks.
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        if (!streamMask[x + y * w] || !pathMask[x + y * w]) continue;
        carveFloor(map, x, y, tid('BRIDGE_WOOD'));
      }
    }
  }

  // --- trees --------------------------------------------------------------
  // Poisson-ish: a tree may never touch another solid tile, even diagonally, so
  // a 4-connected route always exists between them. Grove centres bias density.
  const rt = root.fork('trees');
  const density = makeFBM(rt.fork('grove'), 0.075, 3);
  const treeSingle = pine ? tid('TREE_PINE') : tid('TREE_OAK');
  const treeAlt = pine ? tid('TREE_OAK', 'TREE_PINE') : tid('TREE_PINE', 'TREE_OAK');
  const bigParts = pine
    ? ['PINE_TL', 'PINE_TR', 'PINE_BL', 'PINE_BR']
    : ['OAK_TL', 'OAK_TR', 'OAK_BL', 'OAK_BR'];

  const clearAround = (x, y, x2 = x, y2 = y) => {
    for (let yy = y - 1; yy <= y2 + 1; yy++) {
      for (let xx = x - 1; xx <= x2 + 1; xx++) {
        if (!inb(map, xx, yy)) return false;
        if (!walkable(map, xx, yy)) return false;
        if (pathMask[xx + yy * w] || streamMask[xx + yy * w]) return false;
        if (hasProp(map, xx, yy)) return false;
      }
    }
    return true;
  };

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const edge = x < 3 || y < 3 || x >= w - 3 || y >= h - 3;
      const d = density(x, y);
      const p = edge ? 0.72 : (d - 0.36) * 1.5;
      if (p <= 0 || !rt.chance(Math.min(0.62, p))) continue;
      if (inClearing(x, y) && !edge) continue;
      // Big two-by-two canopy: bottom row blocks, treetops draw over the actor.
      if (!edge && rt.chance(0.16) && clearAround(x, y - 1, x + 1, y)) {
        setDeco(map, x, y, tid(bigParts[2]));
        setDeco(map, x + 1, y, tid(bigParts[3]));
        setOver(map, x, y - 1, tid(bigParts[0]));
        setOver(map, x + 1, y - 1, tid(bigParts[1]));
        continue;
      }
      if (!clearAround(x, y)) continue;
      setDeco(map, x, y, rt.chance(0.85) ? treeSingle : treeAlt);
    }
  }

  // --- undergrowth, tall grass, landmarks --------------------------------
  const ru = root.fork('under');
  const tall = tid('GRASS_TALL');
  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) {
      if (!walkable(map, x, y) || hasProp(map, x, y)) continue;
      if (pathMask[x + y * w] || streamMask[x + y * w]) continue;
      if (groundGroup(map, x, y) !== 'grass') continue;
      if (ru.chance(0.16)) setGround(map, x, y, tall);
    }
  }

  const rl = root.fork('landmarks');
  map.landmarks = [];
  if (opts.landmarks !== false && clearings.length > 1) {
    const spots = rl.shuffle(clearings.slice(1));
    const kinds = rl.shuffle(['standing-stone', 'silvanus-shrine', 'woodcutter-camp']);
    for (let i = 0; i < Math.min(spots.length, kinds.length); i++) {
      buildLandmark(map, kinds[i], spots[i].x, spots[i].y, rl);
      map.landmarks.push({ kind: kinds[i], x: spots[i].x, y: spots[i].y });
    }
  }

  // --- spawn, dressing, safety -------------------------------------------
  map.spawn = { x: clearings[0].x, y: clearings[0].y };
  carveFloor(map, map.spawn.x, map.spawn.y, pickTid(rg, dirtTable));
  map.entry = { ...map.spawn };
  map.exit = { x: w - 2, y: clearings[clearings.length - 1].y };

  decorate(map, biome, root.fork('decor'));
  placeEncounterZones(map, root.fork('zones'), { biome });
  validateConnectivity(map, [map.spawn, ...map.landmarks.map((l) => ({ x: l.x, y: l.y })),
    ...map.triggers.map((t) => ({ x: t.x, y: t.y }))], {
    paint: (x, y) => carveFloor(map, x, y, pickTid(rg, dirtTable)),
  });
  return map;
}

/** The three things you actually find in a Sword Coast wood. */
function buildLandmark(map, kind, cx, cy, r) {
  const clear = (rad, floorId) => {
    for (let y = cy - rad; y <= cy + rad; y++) {
      for (let x = cx - rad; x <= cx + rad; x++) {
        if (!inb(map, x, y)) continue;
        if (Math.hypot(x - cx, y - cy) > rad + 0.35) continue;
        carveFloor(map, x, y, floorId);
      }
    }
  };
  if (kind === 'standing-stone') {
    // A menhir of the old Uthgardt tribes, ringed by cracked flagstones.
    clear(3, tid('GRAVEL', 'DIRT'));
    place(map, cx, cy, tid('STATUE', 'BOULDER'));
    for (const [dx, dy] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) {
      if (walkable(map, cx + dx, cy + dy)) place(map, cx + dx, cy + dy, tid('ROCK'));
    }
    addTrigger(map, cx, cy + 1, 'sign', { text: 'A weathered standing stone, older than the road.' });
  } else if (kind === 'silvanus-shrine') {
    // A mossy shrine to Silvanus, Oak Father of the wild places.
    clear(3, tid('FLAGSTONE', 'DIRT'));
    place(map, cx, cy, tid('SHRINE', 'ALTAR'));
    for (const [dx, dy] of [[-2, 0], [2, 0]]) place(map, cx + dx, cy + dy, tid('PILLAR'));
    for (const [dx, dy] of [[-3, -1], [3, 1], [-1, 3]]) {
      if (inb(map, cx + dx, cy + dy)) place(map, cx + dx, cy + dy, tid('RUINED_WALL'));
    }
    addTrigger(map, cx, cy, 'rest', { shrine: 'silvanus', text: 'A ruined shrine to Silvanus.' });
  } else {
    // A woodcutter's camp: stumps, a cart, a cold cooking pot.
    clear(3, tid('DIRT', 'DIRT_PATH'));
    place(map, cx, cy, tid('COOKING_POT', 'HEARTH'));
    const props = ['STUMP', 'CART', 'CRATE', 'BARREL', 'STUMP', 'SACK'];
    for (const p of props) {
      const x = cx + r.int(-3, 3), y = cy + r.int(-2, 2);
      if (!walkable(map, x, y) || hasProp(map, x, y)) continue;
      if (!canPlaceProp(map, x, y, tid(p))) continue;
      place(map, x, y, tid(p));
    }
    addTrigger(map, cx, cy, 'rest', { camp: true, text: 'A woodcutter’s camp, recently abandoned.' });
  }
}

// ---------------------------------------------------------------------------
// 12. RUINS — Thundertree after Mount Hotenow
// ---------------------------------------------------------------------------

/**
 * A broken street grid of half-standing walls, rubble, ash drifts and dead
 * trees. Streets are always walkable end to end; the buildings are gap-toothed
 * so you can pick your way through them.
 *   { seed, size, biome='ruins', ash=true, name, level }
 */
export function generateRuins(opts = {}) {
  const root = makeRNG(opts.seed != null ? opts.seed : 'ruins-thundertree');
  const { w, h } = outdoorSize(opts, 'medium');
  const ash = opts.ash !== false;
  const map = new TileMap({
    w, h,
    name: opts.name || 'Thundertree',
    biome: opts.biome || 'ruins',
    indoor: false,
    music: 'tense',
  });
  map.seed = root.seed;
  map.triggers = [];
  map.level = opts.level || 5;

  // --- ground -------------------------------------------------------------
  const rg = root.fork('ground');
  const groundTable = ash
    ? tidTable([['ASH_GROUND', 7], ['DIRT', 4], ['GRAVEL', 3], ['GRASS_4', 2]])
    : tidTable([['DIRT', 6], ['GRASS_4', 4], ['GRAVEL', 3]]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) carveFloor(map, x, y, pickTid(rg, groundTable));

  // --- street grid --------------------------------------------------------
  const rs = root.fork('streets');
  const streetTable = tidTable([['COBBLE', 5], ['FLAGSTONE', 4], ['DIRT', 3], ['RUBBLE', 1]]);
  const streetMask = new Uint8Array(w * h);
  const cols = [], rowsY = [];
  for (let x = rs.int(5, 8); x < w - 4; x += rs.int(7, 10)) cols.push(x);
  for (let y = rs.int(5, 8); y < h - 4; y += rs.int(7, 10)) rowsY.push(y);
  const paveStreet = (x, y) => {
    if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) return;
    streetMask[x + y * w] = 1;
    // Cobbles buckled by the eruption — the odd tile has gone back to dirt.
    carveFloor(map, x, y, rs.chance(0.82) ? pickTid(rs, streetTable) : pickTid(rg, groundTable));
  };
  for (const cx of cols) for (let y = 1; y < h - 1; y++) { paveStreet(cx, y); if (rs.chance(0.9)) paveStreet(cx + 1, y); }
  for (const cy of rowsY) for (let x = 1; x < w - 1; x++) { paveStreet(x, cy); if (rs.chance(0.9)) paveStreet(x, cy + 1); }

  // --- building lots ------------------------------------------------------
  const rb = root.fork('buildings');
  map.buildings = [];
  for (let ci = 0; ci < cols.length + 1; ci++) {
    for (let ri = 0; ri < rowsY.length + 1; ri++) {
      const x0 = (ci === 0 ? 2 : cols[ci - 1] + 2);
      const x1 = (ci === cols.length ? w - 3 : cols[ci] - 1);
      const y0 = (ri === 0 ? 2 : rowsY[ri - 1] + 2);
      const y1 = (ri === rowsY.length ? h - 3 : rowsY[ri] - 1);
      const lotW = x1 - x0, lotH = y1 - y0;
      if (lotW < 4 || lotH < 4) continue;
      if (!rb.chance(0.78)) continue;
      const bw = rb.int(4, Math.min(8, lotW));
      const bh = rb.int(4, Math.min(7, lotH));
      const bx = x0 + rb.int(0, lotW - bw);
      const by = y0 + rb.int(0, lotH - bh);
      buildRuinedHouse(map, bx, by, bw, bh, rb, ash);
      map.buildings.push({ x: bx, y: by, w: bw, h: bh });
    }
  }

  // --- ash drifts, dead trees, wreckage ----------------------------------
  const rd = root.fork('drift');
  if (ash) {
    // Drifts pile up in streaks, blown one way by the wind off Mount Hotenow.
    const n = makeFBM(rd.fork('wind'), 0.11, 2);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        if (!walkable(map, x, y) || hasProp(map, x, y)) continue;
        if (n(x * 0.6, y * 1.6) > 0.62 && rd.chance(0.55)) {
          setGround(map, x, y, tid('ASH_DRIFT', 'GRAVEL'), SLOW);
        }
      }
    }
  }
  for (let i = 0; i < Math.round(w * h * 0.012); i++) {
    const x = rd.int(2, w - 3), y = rd.int(2, h - 3);
    const id = tid(rd.pick(['DEAD_TREE', 'DEAD_TREE', 'STUMP', 'BOULDER', 'RUBBLE', 'ROCK']));
    if (streetMask[x + y * w] && rd.chance(0.75)) continue;
    if (canPlaceProp(map, x, y, id)) place(map, x, y, id);
  }

  // --- spawn, loot, safety ------------------------------------------------
  let spawn = null;
  for (let y = 1; y < h - 1 && !spawn; y++) if (walkable(map, 1, y)) spawn = { x: 1, y };
  map.spawn = spawn || { x: 2, y: 2 };
  map.entry = { ...map.spawn };
  map.exit = farthestFrom(map, map.spawn.x, map.spawn.y);

  const rl = root.fork('loot');
  const wantChests = rl.int(2, 4);
  for (let i = 0, tries = 0; i < wantChests && tries < 300; tries++) {
    const b = rl.pick(map.buildings);
    if (!b) break;
    const x = rl.int(b.x + 1, b.x + b.w - 2), y = rl.int(b.y + 1, b.y + b.h - 2);
    if (!walkable(map, x, y) || hasProp(map, x, y) || !safeToBlock(map, x, y)) continue;
    setDeco(map, x, y, tid('CHEST_CLOSED'), TRIGGER);
    addTrigger(map, x, y, 'chest', chestPlan(map.level, rl));
    i++;
  }

  decorate(map, map.biome, root.fork('decor'));
  placeEncounterZones(map, root.fork('zones'), { biome: map.biome });
  validateConnectivity(map, [map.spawn, ...map.triggers.map((t) => ({ x: t.x, y: t.y }))], {
    paint: (x, y) => carveFloor(map, x, y, pickTid(rg, groundTable)),
  });
  return map;
}

/** A house with two-thirds of its walls left standing and its roof burnt off. */
function buildRuinedHouse(map, bx, by, bw, bh, r, ash) {
  const floorTable = tidTable([['WOOD_FLOOR', 4], ['FLAGSTONE', 4], ['RUBBLE', 3], ['DIRT', 3]]);
  for (let y = by + 1; y < by + bh - 1; y++) {
    for (let x = bx + 1; x < bx + bw - 1; x++) carveFloor(map, x, y, pickTid(r, floorTable));
  }
  const wall = tid('RUINED_WALL', 'STONE_WALL');
  const standing = r.float(0.5, 0.78);       // how much masonry survived
  for (let x = bx; x < bx + bw; x++) {
    for (const y of [by, by + bh - 1]) if (r.chance(standing)) setDeco(map, x, y, wall);
  }
  for (let y = by; y < by + bh; y++) {
    for (const x of [bx, bx + bw - 1]) if (r.chance(standing)) setDeco(map, x, y, wall);
  }
  // Guarantee at least one way in, even if the dice left the walls intact.
  const side = r.int(0, 3);
  const gx = side === 0 || side === 1 ? r.int(bx + 1, bx + bw - 2) : (side === 2 ? bx : bx + bw - 1);
  const gy = side === 0 ? by : (side === 1 ? by + bh - 1 : r.int(by + 1, by + bh - 2));
  carveFloor(map, gx, gy, pickTid(r, floorTable));

  // Interior wreckage.
  const junk = ['RUBBLE', 'RUBBLE', 'BARREL', 'CRATE', 'TABLE', 'CHAIR', 'BONES', 'PILLAR'];
  const count = Math.max(1, Math.round(bw * bh * 0.12));
  for (let i = 0; i < count; i++) {
    const x = r.int(bx + 1, bx + bw - 2), y = r.int(by + 1, by + bh - 2);
    const id = tid(r.pick(junk));
    if (canPlaceProp(map, x, y, id)) place(map, x, y, id);
  }
  if (ash && r.chance(0.5)) {
    const x = r.int(bx + 1, bx + bw - 2), y = r.int(by + 1, by + bh - 2);
    if (walkable(map, x, y) && !hasProp(map, x, y)) setGround(map, x, y, tid('ASH_DRIFT', 'GRAVEL'), SLOW);
  }
}

// ---------------------------------------------------------------------------
// 13. DECORATION
// ---------------------------------------------------------------------------

let _decor = null;

/** Per-biome scatter: `ground` repaints the floor, `props` stand on it. */
function decorTables() {
  if (_decor) return _decor;
  _decor = {
    plains: {
      density: 0.09,
      ground: tidTable([['FLOWERS_RED', 3], ['FLOWERS_YELLOW', 3], ['FLOWERS_BLUE', 2], ['CLOVER', 5], ['GRASS_3', 4]]),
      props: tidTable([['ROCK', 4], ['BUSH', 3], ['STUMP', 1]]),
    },
    road: {
      density: 0.05,
      ground: tidTable([['CLOVER', 4], ['GRASS_4', 4], ['GRAVEL', 2]]),
      props: tidTable([['ROCK', 4], ['BUSH', 2], ['SIGN', 1]]),
    },
    forest: {
      density: 0.11,
      ground: tidTable([['CLOVER', 5], ['FLOWERS_BLUE', 2], ['FLOWERS_YELLOW', 2], ['GRASS_2', 4]]),
      props: tidTable([['BUSH', 5], ['BERRY_BUSH', 2], ['ROCK', 3], ['STUMP', 2], ['MUSHROOM_RED', 2], ['MUSHROOM_BROWN', 2]]),
    },
    'pine-forest': {
      density: 0.10,
      ground: tidTable([['CLOVER', 4], ['GRASS_2', 5], ['SNOW_GRASS', 1]]),
      props: tidTable([['BUSH', 4], ['ROCK', 4], ['STUMP', 2], ['MUSHROOM_BROWN', 3], ['MUSHROOM_RED', 2]]),
    },
    hills: {
      density: 0.10,
      ground: tidTable([['GRASS_3', 5], ['GRAVEL', 4], ['GRASS_4', 3], ['CLOVER', 2]]),
      props: tidTable([['ROCK', 6], ['BOULDER', 3], ['BUSH', 2], ['STUMP', 1]]),
    },
    mountain: {
      density: 0.09,
      ground: tidTable([['GRAVEL', 6], ['DIRT', 3], ['SNOW_GRASS', 1]]),
      props: tidTable([['ROCK', 6], ['BOULDER', 4], ['RUBBLE', 3], ['DEAD_TREE', 1]]),
    },
    marsh: {
      density: 0.14,
      ground: tidTable([['MUD', 5], ['SWAMP_WATER', 4], ['LILY_PAD', 2]]),
      props: tidTable([['REEDS', 6], ['CATTAILS', 5], ['DEAD_TREE', 3], ['BONES', 2], ['DRIFTWOOD', 2], ['MUSHROOM_BROWN', 1]]),
    },
    coast: {
      density: 0.08,
      ground: tidTable([['SAND', 6], ['GRAVEL', 2], ['GRASS_4', 2]]),
      props: tidTable([['DRIFTWOOD', 5], ['ROCK', 4], ['BOULDER', 2], ['BONES', 1]]),
    },
    ruins: {
      density: 0.11,
      ground: tidTable([['RUBBLE', 5], ['ASH_DRIFT', 3], ['GRAVEL', 3], ['DIRT', 3]]),
      props: tidTable([['RUBBLE', 6], ['ROCK', 4], ['BONES', 3], ['DEAD_TREE', 3], ['BOULDER', 2], ['PILLAR', 1]]),
    },
    'ash-waste': {
      density: 0.12,
      ground: tidTable([['ASH_DRIFT', 6], ['ASH_GROUND', 5], ['GRAVEL', 2]]),
      props: tidTable([['DEAD_TREE', 5], ['ROCK', 4], ['BONES', 3], ['BOULDER', 2], ['STUMP', 2]]),
    },
    tundra: {
      density: 0.08,
      ground: tidTable([['SNOW', 6], ['SNOW_GRASS', 3], ['ICE', 2]]),
      props: tidTable([['ROCK', 5], ['DEAD_TREE', 3], ['BOULDER', 2], ['BONES', 1]]),
    },
    cave: {
      density: 0.10,
      ground: tidTable([['CAVE_FLOOR_RUBBLE', 4], ['GRAVEL', 2]]),
      props: tidTable([['ROCK', 5], ['STALAGMITE', 4], ['MUSHROOM_RED', 3], ['MUSHROOM_BROWN', 3], ['MUSHROOM_GLOW', 2], ['BONES', 2], ['CRYSTAL', 1]]),
    },
    underdark: {
      density: 0.11,
      ground: tidTable([['CAVE_FLOOR_RUBBLE', 4], ['DUNGEON_FLOOR', 2]]),
      props: tidTable([['CRYSTAL', 4], ['MUSHROOM_GLOW', 4], ['STALAGMITE', 4], ['BONES', 3], ['ROCK', 3]]),
    },
    dungeon: {
      density: 0.06,
      ground: tidTable([['STONE_FLOOR_CRACKED', 4]]),
      props: tidTable([['RUBBLE', 5], ['BONES', 3], ['ROCK', 2], ['BARREL', 2], ['CRATE', 2]]),
    },
    crypt: {
      density: 0.08,
      ground: tidTable([['BONE_FLOOR', 4], ['STONE_FLOOR_CRACKED', 3]]),
      props: tidTable([['BONES', 6], ['SKULL_PILE', 3], ['RUBBLE', 3], ['GRAVESTONE', 2], ['CANDLE', 2]]),
    },
    mine: {
      density: 0.08,
      ground: tidTable([['GRAVEL', 5], ['CAVE_FLOOR_RUBBLE', 3]]),
      props: tidTable([['ROCK', 5], ['RUBBLE', 4], ['CRATE', 2], ['BARREL', 2], ['SACK', 1]]),
    },
    city: {
      density: 0.04,
      ground: tidTable([['COBBLE', 5], ['FLAGSTONE', 4]]),
      props: tidTable([['BARREL', 3], ['CRATE', 3], ['SACK', 2], ['CART', 1]]),
    },
  };
  return _decor;
}

/**
 * Scatter flowers, rocks, bushes, puddles, bones and mushrooms at plausible
 * densities. Never lands on a trigger, a door, a path, water or an existing
 * prop, and a solid prop is only placed where it cannot pinch the map in two.
 */
export function decorate(map, biome, r, opts = {}) {
  if (!map) return 0;
  const rr = r || makeRNG(`decor-${map.seed || 0}-${biome || 'x'}`);
  const tables = decorTables();
  const base = tables[biome] || tables.plains;
  const skip = triggerKeySet(map);
  const noPaint = ['road', 'door'];
  const avoid = opts.avoid || null;
  const b = opts.bounds;
  const x0 = Math.max(1, b ? b.x : 1), y0 = Math.max(1, b ? b.y : 1);
  const x1 = Math.min(map.w - 1, b ? b.x + b.w : map.w - 1);
  const y1 = Math.min(map.h - 1, b ? b.y + b.h : map.h - 1);
  const mult = opts.density != null ? opts.density : 1;
  let placed = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const table = opts.biomeAt ? (tables[opts.biomeAt(x, y)] || base) : base;
      if (!walkable(map, x, y)) continue;
      if (avoid && avoid[y * map.w + x]) continue;
      if (skip.has(`${x},${y}`)) continue;
      if (fget(map, x, y) & (TRIGGER | DOOR | WATER)) continue;
      const grp = groundGroup(map, x, y);
      if (noPaint.includes(grp)) continue;
      // Never crowd a doorway or a staircase.
      let nearDoor = false;
      for (const [dx, dy] of ORTH) if (fget(map, x + dx, y + dy) & (DOOR | TRIGGER)) nearDoor = true;
      if (nearDoor) continue;

      if (!rr.chance(table.density * mult)) continue;

      if (!hasProp(map, x, y) && table.props.length && rr.chance(0.45)) {
        const id = pickTid(rr, table.props);
        if (id && canPlaceProp(map, x, y, id)) { place(map, x, y, id); placed++; }
      } else if (table.ground.length) {
        const id = pickTid(rr, table.ground);
        if (id && TILES[id] && TILES[id].layer === 'ground') {
          setGround(map, x, y, id);
          placed++;
        }
      }
    }
  }
  return placed;
}

// ---------------------------------------------------------------------------
// 14. ENCOUNTER ZONES
// ---------------------------------------------------------------------------

/** Which ground groups a wandering-monster patch is allowed to grow through. */
const ZONE_GROUPS = {
  grass: ['grass'],
  rough: ['floor', 'dirt', 'ash'],
  water: ['water'],
  snow: ['snow', 'ice'],
  sand: ['sand'],
};

/** The tile a patch of this kind gets repainted to, if any. */
function zoneTileFor(kind, biome) {
  if (kind === 'grass') return tid('GRASS_TALL');
  if (kind === 'rough') {
    if (biome === 'crypt') return tid('BONE_FLOOR', 'STONE_FLOOR_CRACKED');
    if (biome === 'ash-waste' || biome === 'ruins') return tid('ASH_DRIFT', 'GRAVEL');
    if (biome === 'cave' || biome === 'mine' || biome === 'underdark') return tid('CAVE_FLOOR_RUBBLE', 'GRAVEL');
    if (biome === 'dungeon') return tid('STONE_FLOOR_CRACKED');
    return tid('GRAVEL', 'DIRT');
  }
  return 0;
}

/**
 * Mark ambush ground with the ENCOUNTER flag — tall grass, rubble drifts and
 * shallow water — in coherent patches rather than scattered single tiles, so
 * the player learns to read where it is dangerous to walk.
 *   opts: { biome, indoor, density (0..1 multiplier), patches, radius }
 */
export function placeEncounterZones(map, r, opts = {}) {
  if (!map) return 0;
  const rr = r || makeRNG(`zones-${map.seed || 0}`);
  const biome = opts.biome || map.biome || 'plains';
  const skip = triggerKeySet(map);
  const area = map.w * map.h;
  const density = opts.density != null ? opts.density : 1;
  const patches = opts.patches != null
    ? opts.patches
    : Math.max(3, Math.round((area / 260) * density));
  const maxR = opts.radius || (opts.indoor ? 3 : 5);

  // Which patch kinds make sense here?
  const kinds = [];
  if (!opts.indoor) kinds.push('grass', 'grass', 'water');
  kinds.push('rough');
  if (biome === 'tundra') kinds.push('snow');
  if (biome === 'coast') kinds.push('sand');

  const avoid = opts.avoid || null;
  const candidate = (x, y, groups) => {
    if (!walkable(map, x, y)) return false;
    if (avoid && avoid[y * map.w + x]) return false;
    if (skip.has(`${x},${y}`)) return false;
    if (fget(map, x, y) & (TRIGGER | DOOR)) return false;
    const grp = groundGroup(map, x, y);
    if (grp === 'road') return false;                 // roads stay safe
    return groups.includes(grp);
  };

  let marked = 0;
  for (let p = 0; p < patches; p++) {
    const kind = rr.pick(kinds);
    const groups = ZONE_GROUPS[kind] || ZONE_GROUPS.rough;
    // Find a seed tile of the right sort.
    let sx = -1, sy = -1;
    for (let t = 0; t < 60; t++) {
      const x = rr.int(1, map.w - 2), y = rr.int(1, map.h - 2);
      if (candidate(x, y, groups)) { sx = x; sy = y; break; }
    }
    if (sx < 0) continue;

    const rad = rr.int(2, maxR);
    const paint = zoneTileFor(kind, opts.biomeAt ? opts.biomeAt(sx, sy) : biome);
    // Grow the patch by BFS so it hugs the terrain instead of being a circle.
    const seen = new Set([`${sx},${sy}`]);
    const q = [[sx, sy]];
    const budget = Math.max(4, rad * rad * 2);
    while (q.length && seen.size < budget) {
      const [cx, cy] = q.shift();
      if (Math.hypot(cx - sx, cy - sy) > rad + 0.5) continue;
      if (!candidate(cx, cy, groups)) continue;
      if (paint && !hasProp(map, cx, cy) && !(fget(map, cx, cy) & WATER)) {
        setGround(map, cx, cy, paint);
      }
      fadd(map, cx, cy, ENCOUNTER);
      marked++;
      for (const [dx, dy] of ORTH) {
        const nx = cx + dx, ny = cy + dy, k = `${nx},${ny}`;
        if (seen.has(k)) continue;
        seen.add(k);
        if (rr.chance(0.82)) q.push([nx, ny]);        // ragged edges
      }
    }
  }
  map.encounterTiles = marked;
  return marked;
}

// ---------------------------------------------------------------------------
// 15. THE SWORD COAST — the walkable overworld
// ---------------------------------------------------------------------------

export const WORLD_W = 200;
export const WORLD_H = 160;

/**
 * Warp markers on the region map. Coordinates place them relative to the two
 * roads: the High Road runs north-south near x=40, the Triboar Trail runs
 * east-west near y=88, and they meet at the crossroads.
 */
export const WORLD_NODES = Object.freeze([
  { id: 'neverwinter', name: 'Neverwinter', x: 34, y: 14, kind: 'city', map: 'neverwinter', level: 4, desc: 'The City of Skilled Hands.' },
  { id: 'thundertree', name: 'Thundertree', x: 80, y: 28, kind: 'ruin', map: 'thundertree', level: 5, desc: 'Ash-choked ruin. Venomfang lairs in the tower.' },
  { id: 'cragmaw-castle', name: 'Cragmaw Castle', x: 118, y: 34, kind: 'dungeon', map: 'cragmaw-castle', level: 5, desc: 'King Grol holds this ruined keep.' },
  { id: 'icespire-peak', name: 'Icespire Peak', x: 152, y: 16, kind: 'dungeon', map: 'icespire-peak', level: 12, desc: 'Cryovain hunts from the high snows.' },
  { id: 'old-owl-well', name: 'Old Owl Well', x: 132, y: 60, kind: 'ruin', map: 'old-owl-well', level: 6, desc: 'A Netherese watchtower, long fallen.' },
  { id: 'leilon', name: 'Leilon', x: 40, y: 60, kind: 'town', map: 'leilon', level: 3, desc: 'A small town rebuilding on the High Road.' },
  { id: 'cragmaw-hideout', name: 'Cragmaw Hideout', x: 100, y: 78, kind: 'dungeon', map: 'cragmaw-hideout', level: 2, desc: 'A goblin cave above a stream.' },
  { id: 'conyberry', name: 'Conyberry', x: 140, y: 86, kind: 'ruin', map: 'conyberry', level: 4, desc: 'Sacked and abandoned. Agatha haunts the grove.' },
  { id: 'wyvern-tor', name: 'Wyvern Tor', x: 158, y: 74, kind: 'landmark', map: 'wyvern-tor', level: 5, desc: 'A rocky spur where orcs camp.' },
  { id: 'phandalin', name: 'Phandalin', x: 88, y: 102, kind: 'town', map: 'phandalin', level: 1, desc: 'A frontier town below the Sword Mountains.' },
  { id: 'wave-echo-cave', name: 'Wave Echo Cave', x: 120, y: 108, kind: 'dungeon', map: 'wave-echo-cave', level: 5, desc: 'The Lost Mine of Phandelver.' },
  { id: 'mere-of-dead-men', name: 'Mere of Dead Men', x: 32, y: 132, kind: 'landmark', map: 'mere-of-dead-men', level: 7, desc: 'A drowned salt marsh on the High Road.' },
  { id: 'waterdeep', name: 'Waterdeep', x: 38, y: 150, kind: 'city', map: 'waterdeep', level: 8, desc: 'The City of Splendors. The Yawning Portal drops into Undermountain.' },
]);

/** Terrain blobs. The tile takes the biome of whichever blob claims it hardest. */
const WORLD_BLOBS = Object.freeze([
  { id: 'neverwinter-wood', biome: 'pine-forest', x: 74, y: 26, rx: 56, ry: 30, jitter: 0.5 },
  { id: 'thundertree-ash', biome: 'ash-waste', x: 80, y: 28, rx: 16, ry: 12, jitter: 0.35 },
  { id: 'sword-mountains', biome: 'mountain', x: 158, y: 26, rx: 56, ry: 36, jitter: 0.5 },
  { id: 'icespire', biome: 'tundra', x: 152, y: 16, rx: 20, ry: 14, jitter: 0.4 },
  { id: 'old-owl-hills', biome: 'hills', x: 134, y: 62, rx: 22, ry: 17, jitter: 0.4 },
  { id: 'wyvern-tor', biome: 'hills', x: 158, y: 74, rx: 19, ry: 15, jitter: 0.4 },
  { id: 'phandalin-hills', biome: 'hills', x: 100, y: 100, rx: 40, ry: 30, jitter: 0.45 },
  { id: 'kryptgarden', biome: 'forest', x: 158, y: 126, rx: 48, ry: 34, jitter: 0.5 },
  { id: 'ardeep-forest', biome: 'forest', x: 64, y: 141, rx: 26, ry: 20, jitter: 0.45 },
  { id: 'mere', biome: 'marsh', x: 34, y: 132, rx: 22, ry: 28, jitter: 0.45 },
]);

/**
 * Suggested party level by geography — encounters scale with where you are, so
 * the wilds north-east of the Trail punish a first-level party and the road
 * out of Phandalin does not.
 */
export const WORLD_REGIONS = Object.freeze([
  { id: 'sword-coast', name: 'The Sword Coast', biome: 'coast', bounds: { x: 0, y: 0, w: 32, h: 160 }, level: 3 },
  { id: 'high-road-north', name: 'The High Road', biome: 'road', bounds: { x: 30, y: 0, w: 22, h: 88 }, level: 3 },
  { id: 'high-road-south', name: 'The High Road', biome: 'road', bounds: { x: 30, y: 88, w: 22, h: 72 }, level: 5 },
  { id: 'triboar-trail', name: 'The Triboar Trail', biome: 'road', bounds: { x: 42, y: 78, w: 158, h: 22 }, level: 2 },
  { id: 'dessarin-plains', name: 'The Dessarin Plains', biome: 'plains', bounds: { x: 44, y: 60, w: 90, h: 40 }, level: 3 },
  { id: 'neverwinter-wood', name: 'Neverwinter Wood', biome: 'pine-forest', bounds: { x: 26, y: 0, w: 100, h: 56 }, level: 4 },
  { id: 'thundertree-ash', name: 'The Ash Wastes', biome: 'ash-waste', bounds: { x: 66, y: 18, w: 28, h: 22 }, level: 5 },
  { id: 'sword-mountains', name: 'The Sword Mountains', biome: 'mountain', bounds: { x: 104, y: 0, w: 96, h: 62 }, level: 10 },
  { id: 'icespire', name: 'Icespire Peak', biome: 'tundra', bounds: { x: 134, y: 2, w: 38, h: 28 }, level: 12 },
  { id: 'old-owl-hills', name: 'The Old Owl Hills', biome: 'hills', bounds: { x: 114, y: 46, w: 42, h: 32 }, level: 6 },
  { id: 'wyvern-tor', name: 'Wyvern Tor', biome: 'hills', bounds: { x: 140, y: 60, w: 38, h: 30 }, level: 5 },
  { id: 'phandalin-hills', name: 'The Phandalin Foothills', biome: 'hills', bounds: { x: 62, y: 72, w: 78, h: 58 }, level: 2 },
  { id: 'kryptgarden', name: 'Kryptgarden Forest', biome: 'forest', bounds: { x: 112, y: 94, w: 88, h: 66 }, level: 8 },
  { id: 'ardeep-forest', name: 'Ardeep Forest', biome: 'forest', bounds: { x: 40, y: 122, w: 50, h: 38 }, level: 6 },
  { id: 'mere-of-dead-men', name: 'The Mere of Dead Men', biome: 'marsh', bounds: { x: 14, y: 106, w: 42, h: 54 }, level: 7 },
]);

/** The most specific region containing a tile (smallest bounds wins). */
export function regionAt(regions, x, y) {
  let best = null;
  for (const rg of regions || WORLD_REGIONS) {
    const b = rg.bounds;
    if (x < b.x || y < b.y || x >= b.x + b.w || y >= b.y + b.h) continue;
    if (!best || b.w * b.h < best.bounds.w * best.bounds.h) best = rg;
  }
  return best;
}

function clampi(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

/**
 * The Sword Coast region map, roughly 200x160 tiles.
 * Coastline west, the Sword Mountains north-east, Neverwinter Wood north,
 * Kryptgarden south-east, the Mere of Dead Men on the southern coast; the High
 * Road runs north-south and the Triboar Trail east-west, meeting at a
 * crossroads. Every node marker is guaranteed walkable from the spawn.
 *
 * Returns { map, regions } — each region carries a suggested party level.
 */
export function generateWorld(seed) {
  const root = makeRNG(seed != null ? seed : 'sword-coast');
  const w = WORLD_W, h = WORLD_H;
  const map = new TileMap({
    w, h, name: 'The Sword Coast', biome: 'plains', indoor: false, music: 'field',
  });
  map.seed = root.seed;
  map.triggers = [];
  map.world = true;

  // --- 1. where each biome lies ------------------------------------------
  const nCoast = makeNoise(root.fork('coast'), 0.045);
  const nBlob = makeNoise(root.fork('blob'), 0.035);
  const seaX = (y) => 18 + Math.round(nCoast(0, y) * 10);

  const biomeCache = new Uint8Array(w * h);
  const BIOME_LIST = ['plains', 'sea', 'coast', 'pine-forest', 'forest', 'hills',
    'mountain', 'marsh', 'ash-waste', 'tundra'];
  const computeBiome = (x, y) => {
    const sx = seaX(y);
    if (x < sx) return 'sea';
    if (x < sx + 3) return 'coast';
    let bestB = null, bestW = 0.06;
    for (const b of WORLD_BLOBS) {
      const dx = (x - b.x) / b.rx, dy = (y - b.y) / b.ry;
      const weight = (1 - Math.sqrt(dx * dx + dy * dy)) + (nBlob(x, y) - 0.5) * b.jitter;
      if (weight > bestW) { bestW = weight; bestB = b; }
    }
    return bestB ? bestB.biome : 'plains';
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) biomeCache[x + y * w] = BIOME_LIST.indexOf(computeBiome(x, y));
  }
  const biomeAt = (x, y) => (inb(map, x, y) ? BIOME_LIST[biomeCache[x + y * w]] || 'plains' : 'plains');

  // --- 2. terrain ---------------------------------------------------------
  const rg = root.fork('terrain');
  const TT = {
    plains: tidTable([['GRASS', 8], ['GRASS_2', 6], ['GRASS_3', 4], ['CLOVER', 2]]),
    coast: tidTable([['SAND', 8], ['GRAVEL', 2], ['GRASS_4', 2]]),
    forest: tidTable([['GRASS', 7], ['GRASS_2', 7], ['CLOVER', 3]]),
    'pine-forest': tidTable([['GRASS', 6], ['GRASS_2', 6], ['SNOW_GRASS', 1], ['CLOVER', 2]]),
    hills: tidTable([['GRASS_3', 6], ['GRASS_4', 4], ['GRAVEL', 4], ['DIRT', 2]]),
    mountain: tidTable([['GRAVEL', 7], ['DIRT', 3], ['CLIFF_TOP', 3]]),
    marsh: tidTable([['SWAMP_WATER', 5], ['MUD', 6], ['GRASS_4', 2]]),
    'ash-waste': tidTable([['ASH_GROUND', 7], ['ASH_DRIFT', 4], ['GRAVEL', 2]]),
    tundra: tidTable([['SNOW', 7], ['SNOW_GRASS', 3], ['ICE', 2]]),
  };
  const deepWater = tid('WATER_DEEP'), shallow = tid('WATER');
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const b = biomeAt(x, y);
      if (b === 'sea') {
        // The sea is scenery, not a swimming pool: force it solid.
        const sx = seaX(y);
        carveFloor(map, x, y, x < sx - 2 ? deepWater : shallow, SOLID);
        continue;
      }
      carveFloor(map, x, y, pickTid(rg, TT[b] || TT.plains));
    }
  }
  // The map edge is a wall of terrain so you can never walk off the world.
  for (let x = 0; x < w; x++) { fadd(map, x, 0, SOLID); fadd(map, x, h - 1, SOLID); }
  for (let y = 0; y < h; y++) { fadd(map, w - 1, y, SOLID); }

  // --- 3. the Sword Mountains: impassable cliffs -------------------------
  const nRock = makeFBM(root.fork('rock'), 0.07, 3);
  const cliff = tid('CLIFF', 'MOUNTAIN'), peak = tid('MOUNTAIN', 'CLIFF');
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const b = biomeAt(x, y);
      if (b !== 'mountain' && b !== 'tundra') continue;
      const v = nRock(x, y);
      if (v > 0.52) setDeco(map, x, y, v > 0.72 ? peak : cliff);
    }
  }

  // --- 4. the roads -------------------------------------------------------
  const nHigh = makeNoise(root.fork('high-road'), 0.05);
  const nTrail = makeNoise(root.fork('trail'), 0.05);
  const roadMask = new Uint8Array(w * h);
  const roadTable = tidTable([['DIRT_PATH', 8], ['DIRT', 3], ['GRAVEL', 1]]);
  const pave = (x, y, table) => {
    if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) return;
    roadMask[x + y * w] = 1;
    carveFloor(map, x, y, pickTid(rg, table || roadTable));
  };

  const highRoadX = (y) => clampi(40 + Math.round((nHigh(0, y) - 0.5) * 14), 30, 56);
  const roadTiles = [];
  for (let y = 1; y < h - 1; y++) {
    const cx = highRoadX(y);
    for (let d = -1; d <= 1; d++) pave(cx + d, y);
    roadTiles.push({ x: cx, y });
  }

  const crossY = 88;
  const crossX = highRoadX(crossY);
  const trailBias = Math.round((nTrail(crossX, 0) - 0.5) * 16);
  const trailY = (x) => clampi(crossY + Math.round((nTrail(x, 0) - 0.5) * 16) - trailBias, 66, 116);
  for (let x = crossX; x < w - 1; x++) {
    const cy = trailY(x);
    for (let d = -1; d <= 1; d++) pave(x, cy + d);
    roadTiles.push({ x, y: cy });
  }
  // A proper crossroads: flagstones and a signpost where the two roads meet.
  for (let y = crossY - 2; y <= crossY + 2; y++) {
    for (let x = crossX - 2; x <= crossX + 2; x++) pave(x, y, tidTable([['FLAGSTONE', 6], ['COBBLE', 4]]));
  }
  map.crossroads = { x: crossX, y: crossY };
  addTrigger(map, crossX, crossY - 3, 'sign', {
    text: 'North: Neverwinter. South: Waterdeep. East: the Triboar Trail and Phandalin.',
  });

  // --- 5. node markers and the tracks that reach them --------------------
  const rn = root.fork('nodes');
  const plaza = tidTable([['COBBLE', 6], ['FLAGSTONE', 4]]);
  const nodes = [];
  for (const def of WORLD_NODES) {
    const nx = clampi(def.x, 3, w - 4), ny = clampi(def.y, 3, h - 4);
    // A paved apron so the marker reads as a place, not a tile.
    for (let y = ny - 1; y <= ny + 1; y++) {
      for (let x = nx - 1; x <= nx + 1; x++) {
        roadMask[x + y * w] = 1;
        carveFloor(map, x, y, pickTid(rn, plaza));
      }
    }
    // Dig a track in from the nearest road tile — this is what guarantees that
    // even a node buried in the Sword Mountains can be walked to.
    let near = roadTiles[0], nd = Infinity;
    for (const t of roadTiles) {
      const d = Math.abs(t.x - nx) + Math.abs(t.y - ny);
      if (d < nd) { nd = d; near = t; }
    }
    if (near) {
      carveRoute(map, near.x, near.y, nx, ny, (x, y) => {
        roadMask[x + y * w] = 1;
        carveFloor(map, x, y, pickTid(rn, roadTable));
      }, { repaint: true, digCost: 14 });
    }
    addTrigger(map, nx, ny, 'warp', {
      to: def.map, node: def.id, name: def.name, kind: def.kind, level: def.level,
    });
    if (walkable(map, nx, ny + 2)) place(map, nx, ny + 2, tid('SIGN'));
    nodes.push({ ...def, x: nx, y: ny });
  }
  map.nodes = nodes;

  // --- 6. woods, marsh reeds and coastal wreckage ------------------------
  const rt = root.fork('trees');
  const treeDensity = makeFBM(rt.fork('canopy'), 0.09, 3);
  const freeFor = (x, y) => {
    if (!inb(map, x, y) || roadMask[x + y * w]) return false;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!inb(map, x + dx, y + dy)) return false;
        if (!walkable(map, x + dx, y + dy)) return false;
        if (roadMask[(x + dx) + (y + dy) * w]) return false;
        if (hasProp(map, x + dx, y + dy)) return false;
      }
    }
    return true;
  };
  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) {
      const b = biomeAt(x, y);
      let id = 0, p = 0;
      if (b === 'pine-forest') { id = tid('TREE_PINE'); p = (treeDensity(x, y) - 0.30) * 1.7; }
      else if (b === 'forest') { id = tid('TREE_OAK'); p = (treeDensity(x, y) - 0.32) * 1.7; }
      else if (b === 'ash-waste') { id = tid('DEAD_TREE'); p = (treeDensity(x, y) - 0.46) * 1.3; }
      else if (b === 'marsh') { id = tid('DEAD_TREE'); p = (treeDensity(x, y) - 0.55) * 1.1; }
      else if (b === 'plains' || b === 'hills') { id = tid('TREE_OAK'); p = (treeDensity(x, y) - 0.66) * 0.9; }
      else if (b === 'tundra') { id = tid('DEAD_TREE'); p = (treeDensity(x, y) - 0.62) * 0.8; }
      if (!id || p <= 0) continue;
      if (!rt.chance(Math.min(0.6, p))) continue;
      if (!freeFor(x, y)) continue;
      setDeco(map, x, y, id);
    }
  }
  // Reeds and lily pads in the Mere; driftwood along the shore.
  const rm = root.fork('wetland');
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (roadMask[x + y * w] || hasProp(map, x, y) || !walkable(map, x, y)) continue;
      const b = biomeAt(x, y);
      if (b === 'marsh' && rm.chance(0.14)) {
        place(map, x, y, tid(rm.pick(['REEDS', 'CATTAILS', 'REEDS', 'LILY_PAD'])));
      } else if (b === 'coast' && rm.chance(0.05)) {
        const id = tid(rm.pick(['DRIFTWOOD', 'ROCK', 'BOULDER']));
        if (canPlaceProp(map, x, y, id)) place(map, x, y, id);
      }
    }
  }

  // --- 7. dressing, ambush ground, and the guarantee ---------------------
  decorate(map, 'plains', root.fork('decor'), { biomeAt, avoid: roadMask, density: 0.8 });
  placeEncounterZones(map, root.fork('zones'), {
    biomeAt, avoid: roadMask, patches: 150, radius: 6,
  });

  // Spawn on the Triboar Trail just outside Phandalin.
  const phandalin = nodes.find((n) => n.id === 'phandalin') || nodes[0];
  map.spawn = { x: phandalin.x, y: Math.min(h - 3, phandalin.y + 2) };
  if (!walkable(map, map.spawn.x, map.spawn.y)) carveFloor(map, map.spawn.x, map.spawn.y, pickTid(rg, roadTable));
  map.entry = { ...map.spawn };

  const regions = WORLD_REGIONS.map((rgn) => ({ ...rgn, bounds: { ...rgn.bounds } }));
  map.regions = regions;
  map.biomeAt = biomeAt;
  map.levelAt = (x, y) => {
    const rgn = regionAt(regions, x, y);
    return rgn ? rgn.level : 3;
  };

  validateConnectivity(map, [map.spawn, ...nodes.map((n) => ({ x: n.x, y: n.y })), map.crossroads], {
    paint: (x, y) => { roadMask[x + y * w] = 1; carveFloor(map, x, y, pickTid(rg, roadTable)); },
    route: { digCost: 14 },
  });

  return { map, regions };
}

// ---------------------------------------------------------------------------
// 16. DISPATCH
// ---------------------------------------------------------------------------

/**
 * One entry point for the endless-content systems.
 *   kind: 'dungeon'|'cave'|'crypt'|'mine'|'ruins'|'lair'|'forest'|'world'
 */
export function generateMap(kind, opts = {}) {
  switch (kind) {
    case 'world': return generateWorld(opts.seed);
    case 'cave': return generateCave(opts);
    case 'crypt': return generateCrypt(opts);
    case 'mine': return generateMine(opts);
    case 'ruins': return generateRuins(opts);
    case 'lair': return generateLair(opts);
    case 'forest': return generateForest(opts);
    case 'pine-forest': return generateForest({ ...opts, pine: true });
    default: return generateDungeon({ ...opts, theme: opts.theme || kind });
  }
}

/**
 * Which generator suits a biome — used by the Undermountain descent and by
 * procedural quest sites so a "clear the lair" contract in the Mere doesn't
 * hand you an Undermountain brick corridor.
 */
export function generatorForBiome(biome) {
  switch (biome) {
    case 'cave': case 'underdark': return 'cave';
    case 'crypt': return 'crypt';
    case 'mine': return 'mine';
    case 'ruins': case 'ash-waste': return 'ruins';
    case 'forest': return 'forest';
    case 'pine-forest': return 'pine-forest';
    case 'dungeon': case 'city': return 'dungeon';
    default: return 'dungeon';
  }
}
