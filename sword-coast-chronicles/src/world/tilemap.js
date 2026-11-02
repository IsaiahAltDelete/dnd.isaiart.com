// world/tilemap.js — the tile grid every place in the Realms is built on.
//
// A TileMap is four parallel tile planes plus two data planes:
//   ground  the opaque floor (grass, flagstone, water)
//   deco    props and walls drawn on top of the ground, below the actors
//   over    drawn ABOVE the actors (roof pieces, treetops, cave ceilings)
//   flags   TF bit field per tile (solid, water, encounter, ledge...)
//   height  elevation step per tile, for cliffs and ledge hops
//
// On top of that sit triggers (warps, signs, chests, shops, encounter zones),
// an entity list, a spawn point, fog-of-war discovery, A* pathfinding and
// (de)serialisation for the save file.
//
// This module deliberately imports NOTHING from render/ — render/tiles.js states
// the same contract from its side — so the world layer and the drawing layer stay
// independent. Map builders that want tile ids to imply flags call
// `setTileFlagResolver(tileFlags)` once at boot, then use `stamp()`.

import { clamp } from '../constants.js';

// ---------------------------------------------------------------------------
// 1. FLAGS
// ---------------------------------------------------------------------------

/** Per-tile bit field. Mirrored (by value) in render/tiles.js and rules/actions.js. */
export const TF = {
  SOLID: 1,        // blocks walking and line of sight
  WATER: 2,        // needs swimming or flight
  ENCOUNTER: 4,    // random encounters roll here
  DOOR: 8,         // a doorway; the overworld plays the door sfx crossing it
  TRIGGER: 16,     // at least one trigger covers this tile
  LEDGE: 32,       // one-way hop down (battle maps reuse this bit as "half cover")
  SLOW: 64,        // difficult terrain: costs 2
  DAMAGE: 128,     // lava, spikes, caltrops — hurts to stand on
};

export const TF_NAMES = ['SOLID', 'WATER', 'ENCOUNTER', 'DOOR', 'TRIGGER', 'LEDGE', 'SLOW', 'DAMAGE'];

/** Human-readable flag list, for the debug overlay. */
export function flagNames(bits) {
  const out = [];
  for (let i = 0; i < TF_NAMES.length; i++) if (bits & (1 << i)) out.push(TF_NAMES[i]);
  return out;
}

/** Every trigger kind the overworld knows how to act on. */
export const TRIGGER_KINDS = Object.freeze([
  'warp', 'script', 'battle', 'sign', 'chest', 'shop', 'inn', 'rest',
  'quest', 'encounter-zone', 'npc-spawn', 'door', 'ledge',
]);

/** Flags a trigger kind implies on the tiles it covers. */
const TRIGGER_FLAGS = {
  door: TF.DOOR,
  ledge: TF.LEDGE,
  'encounter-zone': TF.ENCOUNTER,
};

/** Trigger kinds that fire by walking onto them rather than pressing A. */
const STEP_KINDS = new Set(['warp', 'battle', 'script', 'encounter-zone', 'ledge', 'npc-spawn']);

export function isStepTrigger(kind) { return STEP_KINDS.has(kind); }

// ---------------------------------------------------------------------------
// 2. TILE -> FLAG RESOLVER (injected, so this file never imports render/)
// ---------------------------------------------------------------------------

let flagResolver = null;

/**
 * Teach TileMap how a tile id maps to flag bits.
 * main.js / mapgen.js call `setTileFlagResolver(tileFlags)` from render/tiles.js.
 */
export function setTileFlagResolver(fn) {
  flagResolver = typeof fn === 'function' ? fn : null;
  return flagResolver;
}

export function tileFlagsFor(id) {
  if (!flagResolver || !id) return 0;
  try { return flagResolver(id) | 0; } catch (e) { return 0; }
}

// ---------------------------------------------------------------------------
// 3. SMALL HELPERS
// ---------------------------------------------------------------------------

export const tileKey = (x, y) => `${x},${y}`;
export function parseKey(k) {
  const i = String(k).indexOf(',');
  return { x: parseInt(k.slice(0, i), 10) || 0, y: parseInt(k.slice(i + 1), 10) || 0 };
}
export const manhattan = (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by);
export const chebyshev = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));

const DIR_STEPS = [
  { dir: 'up', x: 0, y: -1 }, { dir: 'down', x: 0, y: 1 },
  { dir: 'left', x: -1, y: 0 }, { dir: 'right', x: 1, y: 0 },
];
const DIAG_STEPS = [
  { dir: 'up-left', x: -1, y: -1 }, { dir: 'up-right', x: 1, y: -1 },
  { dir: 'down-left', x: -1, y: 1 }, { dir: 'down-right', x: 1, y: 1 },
];

/** Run-length encode a typed array into a plain [value, count, ...] list. */
function rleEncode(arr) {
  const out = [];
  if (!arr || !arr.length) return out;
  let prev = arr[0], run = 0;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (v === prev) { run++; continue; }
    out.push(prev, run); prev = v; run = 1;
  }
  out.push(prev, run);
  return out;
}

function rleDecode(enc, out) {
  if (!enc || !enc.length) return out;
  let i = 0, p = 0;
  while (i < enc.length - 1 && p < out.length) {
    const v = enc[i++], n = enc[i++];
    for (let k = 0; k < n && p < out.length; k++) out[p++] = v;
  }
  return out;
}

/** Binary min-heap keyed on `.f`. Keeps A* honest on big overworld maps. */
class MinHeap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(n) {
    const a = this.a;
    a.push(n);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      const t = a[p]; a[p] = a[i]; a[i] = t; i = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        const t = a[m]; a[m] = a[i]; a[i] = t; i = m;
      }
    }
    return top;
  }
}

// ---------------------------------------------------------------------------
// 4. THE MAP
// ---------------------------------------------------------------------------

let mapSerial = 0;

/**
 * Which trigger wins when several share a tile. Anything the player deliberately
 * walks into (a warp, a door, a chest) must outrank the ambient region markers
 * that get painted across whole areas.
 */
const TRIGGER_RANK = {
  warp: 100, door: 100, stairs: 100, 'locked-door': 100, ladder: 100,
  chest: 90, shop: 85, inn: 85, rest: 85, quest: 80, npc: 80,
  script: 70, battle: 70, sign: 60, ledge: 50,
  'encounter-zone': 10, encounter: 10, region: 5, ambient: 5,
};
function TRIGGER_PRIORITY(t) {
  if (!t) return 0;
  if (Number.isFinite(t.priority) && t.priority > 0) return t.priority;
  return TRIGGER_RANK[t.kind] != null ? TRIGGER_RANK[t.kind] : 40;
}

export class TileMap {
  /**
   * opts: { w, h, name, id, biome, indoor, music, ambient, dark, spawn,
   *         encounterTable, encounterRate, ground(fill id), region }
   */
  constructor(opts = {}) {
    const w = Math.max(1, opts.w | 0 || 1);
    const h = Math.max(1, opts.h | 0 || 1);
    this.w = w;
    this.h = h;
    this.size = w * h;

    this.id = opts.id || opts.mapId || `map${++mapSerial}`;
    this.name = opts.name || 'Unnamed Place';
    this.biome = opts.biome || 'plains';
    this.indoor = !!opts.indoor;
    this.region = opts.region || null;

    // --- planes ------------------------------------------------------------
    this.ground = new Uint16Array(this.size);
    this.deco = new Uint16Array(this.size);
    this.over = new Uint16Array(this.size);
    this.flags = new Uint8Array(this.size);
    this.height = new Uint8Array(this.size);

    if (opts.ground) this.ground.fill(opts.ground | 0);

    // --- contents ----------------------------------------------------------
    this.triggers = [];
    this._trigIndex = new Map();      // tile index -> trigger[]
    this.entities = [];               // Entity[] — EntityList shares this array
    this.entityList = null;
    this.spawn = opts.spawn ? { x: opts.spawn.x | 0, y: opts.spawn.y | 0 } : { x: w >> 1, y: h >> 1 };
    this.exits = {};                  // named return points: { 'from-inn': {x,y,dir} }

    // --- presentation ------------------------------------------------------
    this.music = opts.music || (this.indoor ? 'town' : 'field');
    this.ambientSfx = opts.ambientSfx || null;
    /** Light grading laid over the whole map: { color:'#0a0e22', alpha:0..1 }. */
    this.ambient = opts.ambient || null;
    /** Caves and crypts are lit only around the party. 0 = no darkness. */
    this.dark = opts.dark || 0;
    this.weather = opts.weather || null;
    this.dayNight = opts.dayNight != null ? !!opts.dayNight : !this.indoor;

    // --- encounters --------------------------------------------------------
    this.encounterTable = opts.encounterTable || null;   // id into data/monsters groups
    this.encounterRate = opts.encounterRate != null ? opts.encounterRate : (this.indoor ? 0 : 0.06);
    this.safe = !!opts.safe;

    // --- fog of war --------------------------------------------------------
    this.discovered = new Set();

    this.meta = opts.meta ? { ...opts.meta } : {};
  }

  // --- indexing ------------------------------------------------------------

  idx(x, y) { return y * this.w + x; }
  inBounds(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }

  /** Clamp a coordinate pair into the map. */
  clampPos(x, y) { return { x: clamp(x | 0, 0, this.w - 1), y: clamp(y | 0, 0, this.h - 1) }; }

  _plane(layer) {
    if (layer === 'ground' || layer === 0) return this.ground;
    if (layer === 'deco' || layer === 1) return this.deco;
    if (layer === 'over' || layer === 2) return this.over;
    if (layer === 'flags') return this.flags;
    if (layer === 'height') return this.height;
    return this.ground;
  }

  // --- tiles ---------------------------------------------------------------

  /** Read a tile id. Out of bounds reads as 0 (void). */
  at(layer, x, y) {
    if (!this.inBounds(x, y)) return 0;
    return this._plane(layer)[y * this.w + x];
  }

  /**
   * Write a tile id. Flags are left alone unless `applyFlags` is true — battle
   * maps rely on being able to place a solid-looking rock that is only cover.
   */
  set(layer, x, y, v, applyFlags = false) {
    if (!this.inBounds(x, y)) return false;
    this._plane(layer)[y * this.w + x] = v | 0;
    if (applyFlags) this.flags[y * this.w + x] |= tileFlagsFor(v);
    return true;
  }

  /** Set a tile AND OR in whatever flags that tile id implies. */
  stamp(layer, x, y, v) { return this.set(layer, x, y, v, true); }

  groundAt(x, y) { return this.at('ground', x, y); }
  decoAt(x, y) { return this.at('deco', x, y); }
  overAt(x, y) { return this.at('over', x, y); }

  /** Write several planes at once: setTile(x,y,{ground, deco, over, flags, height}). */
  setTile(x, y, spec = {}) {
    if (!this.inBounds(x, y)) return false;
    const i = y * this.w + x;
    if (spec.ground != null) this.ground[i] = spec.ground | 0;
    if (spec.deco != null) this.deco[i] = spec.deco | 0;
    if (spec.over != null) this.over[i] = spec.over | 0;
    if (spec.height != null) this.height[i] = clamp(spec.height | 0, 0, 255);
    if (spec.flags != null) this.flags[i] = spec.flags | 0;
    if (spec.addFlags) this.flags[i] |= spec.addFlags | 0;
    if (spec.clearFlags) this.flags[i] &= ~(spec.clearFlags | 0);
    return true;
  }

  /** Recompute the whole flag plane from ground+deco tile ids. */
  recomputeFlags({ keep = TF.TRIGGER | TF.DOOR } = {}) {
    for (let i = 0; i < this.size; i++) {
      const kept = this.flags[i] & keep;
      this.flags[i] = kept | tileFlagsFor(this.ground[i]) | tileFlagsFor(this.deco[i]);
    }
    for (const t of this.triggers) this._applyTriggerFlags(t);
    return this;
  }

  // --- flags ---------------------------------------------------------------

  /** Flag bits at a tile. Out of bounds reads as SOLID so nothing walks off. */
  flagAt(x, y) {
    if (!this.inBounds(x, y)) return TF.SOLID;
    return this.flags[y * this.w + x];
  }

  hasFlag(x, y, bit) { return (this.flagAt(x, y) & bit) !== 0; }
  setFlag(x, y, bits) { if (this.inBounds(x, y)) this.flags[y * this.w + x] |= bits | 0; return this; }
  clearFlag(x, y, bits) { if (this.inBounds(x, y)) this.flags[y * this.w + x] &= ~(bits | 0); return this; }
  setFlagsRaw(x, y, bits) { if (this.inBounds(x, y)) this.flags[y * this.w + x] = bits | 0; return this; }

  /** Plain solidity — walls only. rules/actions.js uses this for line of sight. */
  solid(x, y) { return (this.flagAt(x, y) & TF.SOLID) !== 0; }

  /** Blocks sight? Same as solid; LEDGE-as-cover deliberately does not. */
  opaque(x, y) { return (this.flagAt(x, y) & TF.SOLID) !== 0; }

  isWater(x, y) { return (this.flagAt(x, y) & TF.WATER) !== 0; }
  isEncounter(x, y) { return (this.flagAt(x, y) & TF.ENCOUNTER) !== 0; }
  isDoor(x, y) { return (this.flagAt(x, y) & TF.DOOR) !== 0; }

  heightAt(x, y) { return this.inBounds(x, y) ? this.height[y * this.w + x] : 0; }
  setHeight(x, y, v) { if (this.inBounds(x, y)) this.height[y * this.w + x] = clamp(v | 0, 0, 255); return this; }

  // --- movement queries ----------------------------------------------------

  /**
   * Can a creature of this kind occupy (x, y)?
   * opts: { flying, swimming, size=1, ghost, ignoreHazards, allowOutside }
   */
  solidAt(x, y, opts = {}) {
    const size = Math.max(1, opts.size | 0 || 1);
    if (size > 1) {
      for (let dy = 0; dy < size; dy++) {
        for (let dx = 0; dx < size; dx++) {
          if (this._solid1(x + dx, y + dy, opts)) return true;
        }
      }
      return false;
    }
    return this._solid1(x, y, opts);
  }

  _solid1(x, y, opts) {
    if (opts.ghost) return false;                       // phasing / noclip
    if (!this.inBounds(x, y)) return !opts.allowOutside;
    const f = this.flags[y * this.w + x];
    // Walls stop even fliers unless they explicitly phase over them.
    if (f & TF.SOLID) return !(opts.flying && opts.overWalls);
    if (f & TF.WATER) return !(opts.swimming || opts.flying);
    // DAMAGE tiles (lava, spikes) are walkable — just a very bad idea.
    return false;
  }

  /** Convenience inverse used all over the entity code. */
  walkable(x, y, opts) { return !this.solidAt(x, y, opts); }

  /**
   * Pathfinding cost of a tile: 1 normal, 2 difficult terrain, Infinity blocked.
   * Hazard tiles are Infinity so the AI walks around the lava instead of into it.
   */
  costAt(x, y, opts = {}) {
    if (this.solidAt(x, y, opts)) return Infinity;
    const f = this.inBounds(x, y) ? this.flags[y * this.w + x] : TF.SOLID;
    if ((f & TF.DAMAGE) && !opts.ignoreHazards) return Infinity;
    if (f & TF.SLOW) return 2;
    if ((f & TF.WATER) && !opts.flying) return 2;       // wading/swimming is slow
    return 1;
  }

  /**
   * Legality of one grid step, including cliffs and one-way ledges.
   * Returns { ok, hop:{x,y}|null, ledge, reason }.
   */
  canStep(fx, fy, tx, ty, opts = {}) {
    const dx = tx - fx, dy = ty - fy;
    const adx = Math.abs(dx), ady = Math.abs(dy);
    if (adx + ady === 0) return { ok: true, hop: null, ledge: null, reason: '' };
    if (adx > 1 || ady > 1) return { ok: false, hop: null, ledge: null, reason: 'far' };
    if (adx && ady && !opts.diagonal) return { ok: false, hop: null, ledge: null, reason: 'diagonal' };
    if (!this.inBounds(tx, ty)) return { ok: false, hop: null, ledge: null, reason: 'edge' };

    // A ledge is a one-way drop: enterable only travelling in its facing.
    const ledge = this.ledgeAt(tx, ty);
    if (ledge && !opts.flying) {
      const want = ledge.data?.dir || 'down';
      const step = dy > 0 ? 'down' : dy < 0 ? 'up' : dx > 0 ? 'right' : 'left';
      if (want !== step) return { ok: false, hop: null, ledge, reason: 'ledge' };
      const drop = Math.max(1, ledge.data?.drop | 0 || 1);
      const hx = tx + Math.sign(dx) * drop, hy = ty + Math.sign(dy) * drop;
      if (this.solidAt(hx, hy, opts)) return { ok: false, hop: null, ledge, reason: 'ledge-blocked' };
      return { ok: true, hop: { x: hx, y: hy }, ledge, reason: 'hop' };
    }

    if (this.solidAt(tx, ty, opts)) return { ok: false, hop: null, ledge: null, reason: 'solid' };

    // Cliffs: you may drop any distance but only climb `climb` steps.
    const climb = opts.climb != null ? opts.climb : 0;
    const rise = this.heightAt(tx, ty) - this.heightAt(fx, fy);
    if (!opts.flying && rise > climb) return { ok: false, hop: null, ledge: null, reason: 'cliff' };

    // No cutting the corner of a wall on a diagonal.
    if (adx && ady && !opts.loose) {
      if (this.solidAt(fx + dx, fy, opts) || this.solidAt(fx, fy + dy, opts)) {
        return { ok: false, hop: null, ledge: null, reason: 'corner' };
      }
    }
    return { ok: true, hop: null, ledge: null, reason: '' };
  }

  /** Bresenham sight check between two tiles (SOLID blocks). */
  lineOfSight(x0, y0, x1, y1, opts = {}) {
    let x = x0 | 0, y = y0 | 0;
    const ex = x1 | 0, ey = y1 | 0;
    const dx = Math.abs(ex - x), dy = Math.abs(ey - y);
    const sx = x < ex ? 1 : -1, sy = y < ey ? 1 : -1;
    let err = dx - dy;
    let guard = dx + dy + 2;
    while (guard-- > 0) {
      if (x === ex && y === ey) return true;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
      if (x === ex && y === ey) return true;
      if (!this.inBounds(x, y)) return false;
      if (this.opaque(x, y) && !opts.ignoreWalls) return false;
    }
    return false;
  }

  /** Straight-line tile list, inclusive of both ends. */
  ray(x0, y0, x1, y1, maxLen = 64) {
    const out = [];
    let x = x0 | 0, y = y0 | 0;
    const ex = x1 | 0, ey = y1 | 0;
    const dx = Math.abs(ex - x), dy = Math.abs(ey - y);
    const sx = x < ex ? 1 : -1, sy = y < ey ? 1 : -1;
    let err = dx - dy;
    for (let i = 0; i <= maxLen; i++) {
      out.push({ x, y });
      if (x === ex && y === ey) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }
    return out;
  }

  neighbors(x, y, diagonal = false) {
    const steps = diagonal ? DIR_STEPS.concat(DIAG_STEPS) : DIR_STEPS;
    const out = [];
    for (const s of steps) {
      const nx = x + s.x, ny = y + s.y;
      if (this.inBounds(nx, ny)) out.push({ x: nx, y: ny, dir: s.dir });
    }
    return out;
  }

  // --- bulk edits ----------------------------------------------------------

  /** Flood a whole plane with one value. */
  fill(layer, v, opts = {}) {
    const p = this._plane(layer);
    p.fill(v | 0);
    if (opts.applyFlags) {
      const f = tileFlagsFor(v);
      for (let i = 0; i < this.size; i++) this.flags[i] |= f;
    }
    return this;
  }

  /**
   * Filled or outlined rectangle.
   * opts: { fill=true, applyFlags, addFlags, clearFlags, rng, variants:[ids] }
   */
  rect(layer, x, y, w, h, v, opts = {}) {
    const filled = opts.fill !== false;
    for (let j = y; j < y + h; j++) {
      for (let i = x; i < x + w; i++) {
        if (!this.inBounds(i, j)) continue;
        const edge = i === x || j === y || i === x + w - 1 || j === y + h - 1;
        if (!filled && !edge) continue;
        let id = v;
        if (opts.variants && opts.variants.length && opts.rng) id = opts.rng.pick(opts.variants);
        this.set(layer, i, j, id, !!opts.applyFlags);
        const k = j * this.w + i;
        if (opts.addFlags) this.flags[k] |= opts.addFlags | 0;
        if (opts.clearFlags) this.flags[k] &= ~(opts.clearFlags | 0);
        if (opts.height != null) this.height[k] = clamp(opts.height | 0, 0, 255);
      }
    }
    return this;
  }

  /** Outline only — the walls of a room. */
  frame(layer, x, y, w, h, v, opts = {}) { return this.rect(layer, x, y, w, h, v, { ...opts, fill: false }); }

  /** Bresenham line of tiles, optional thickness. */
  line(layer, x0, y0, x1, y1, v, opts = {}) {
    const thick = Math.max(1, opts.thickness | 0 || 1);
    const pts = this.ray(x0, y0, x1, y1, this.w + this.h + 4);
    const half = (thick - 1) >> 1;
    for (const p of pts) {
      for (let dy = -half; dy <= thick - 1 - half; dy++) {
        for (let dx = -half; dx <= thick - 1 - half; dx++) {
          if (!this.inBounds(p.x + dx, p.y + dy)) continue;
          this.set(layer, p.x + dx, p.y + dy, v, !!opts.applyFlags);
          const k = (p.y + dy) * this.w + (p.x + dx);
          if (opts.addFlags) this.flags[k] |= opts.addFlags | 0;
          if (opts.clearFlags) this.flags[k] &= ~(opts.clearFlags | 0);
        }
      }
    }
    return this;
  }

  /** Ring of tiles around the map border — the usual "you can't leave" wall. */
  border(layer, v, opts = {}) { return this.frame(layer, 0, 0, this.w, this.h, v, { addFlags: TF.SOLID, ...opts }); }

  /**
   * Carve a room: clear the interior to `floor` and (optionally) ring it in
   * `wall`. This is the primitive maps.js and mapgen.js build buildings from.
   */
  carve(x, y, w, h, opts = {}) {
    const { floor = 0, wall = null, layer = 'ground', wallLayer = 'deco' } = opts;
    for (let j = y; j < y + h; j++) {
      for (let i = x; i < x + w; i++) {
        if (!this.inBounds(i, j)) continue;
        const k = j * this.w + i;
        const edge = wall != null && (i === x || j === y || i === x + w - 1 || j === y + h - 1);
        if (edge) {
          this.set(wallLayer, i, j, wall);
          this.flags[k] |= TF.SOLID;
        } else {
          if (floor) this.set(layer, i, j, floor);
          if (opts.clearDeco) this.deco[k] = 0;
          this.flags[k] &= ~(TF.SOLID | TF.WATER | TF.SLOW | TF.DAMAGE);
          if (opts.height != null) this.height[k] = clamp(opts.height | 0, 0, 255);
        }
      }
    }
    return this;
  }

  /**
   * Copy another TileMap into this one at (x, y) — how a house interior or a
   * pre-authored ruin gets dropped into a generated region.
   * opts: { skipZero=true, triggers=true, entities=true, flags=true }
   */
  blit(subMap, x, y, opts = {}) {
    if (!subMap) return this;
    const skipZero = opts.skipZero !== false;
    for (let j = 0; j < subMap.h; j++) {
      for (let i = 0; i < subMap.w; i++) {
        const tx = x + i, ty = y + j;
        if (!this.inBounds(tx, ty)) continue;
        const s = j * subMap.w + i, d = ty * this.w + tx;
        const g = subMap.ground[s], dc = subMap.deco[s], ov = subMap.over[s];
        if (!(skipZero && !g)) this.ground[d] = g;
        if (!(skipZero && !dc)) this.deco[d] = dc;
        if (!(skipZero && !ov)) this.over[d] = ov;
        if (opts.flags !== false) this.flags[d] = subMap.flags[s];
        if (opts.height !== false) this.height[d] = subMap.height[s];
      }
    }
    if (opts.triggers !== false) {
      for (const t of subMap.triggers) {
        this.addTrigger({ ...t, x: t.x + x, y: t.y + y, data: t.data ? { ...t.data } : {} });
      }
    }
    if (opts.entities !== false) {
      for (const e of subMap.entities) {
        if (!e) continue;
        e.x += x; e.y += y;
        if (typeof e.snapPixels === 'function') e.snapPixels();
        this.addEntity(e);
      }
    }
    return this;
  }

  /** Cut a rectangle out into a fresh TileMap (the inverse of blit). */
  subMap(x, y, w, h, opts = {}) {
    const m = new TileMap({ w, h, name: opts.name || this.name, biome: this.biome, indoor: this.indoor, music: this.music });
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const sx = x + i, sy = y + j;
        if (!this.inBounds(sx, sy)) continue;
        const s = sy * this.w + sx, d = j * w + i;
        m.ground[d] = this.ground[s];
        m.deco[d] = this.deco[s];
        m.over[d] = this.over[s];
        m.flags[d] = this.flags[s];
        m.height[d] = this.height[s];
      }
    }
    for (const t of this.triggers) {
      if (t.x >= x && t.y >= y && t.x < x + w && t.y < y + h) {
        m.addTrigger({ ...t, x: t.x - x, y: t.y - y, data: t.data ? { ...t.data } : {} });
      }
    }
    return m;
  }

  clone() {
    const m = new TileMap({
      w: this.w, h: this.h, name: this.name, id: this.id, biome: this.biome,
      indoor: this.indoor, music: this.music, ambient: this.ambient, dark: this.dark,
      encounterTable: this.encounterTable, encounterRate: this.encounterRate,
    });
    m.ground.set(this.ground); m.deco.set(this.deco); m.over.set(this.over);
    m.flags.set(this.flags); m.height.set(this.height);
    m.spawn = { ...this.spawn };
    m.exits = { ...this.exits };
    for (const t of this.triggers) m.addTrigger({ ...t, data: t.data ? { ...t.data } : {} });
    m.discovered = new Set(this.discovered);
    return m;
  }

  // --- triggers ------------------------------------------------------------

  /**
   * Add a trigger.
   *   { x, y, w=1, h=1, kind, data={}, id, once, facing, flag, priority }
   * Every covered tile gets TF.TRIGGER (plus DOOR/LEDGE/ENCOUNTER by kind) and
   * is indexed so `triggerAt` is a single Map lookup.
   */
  addTrigger(t) {
    if (!t || !t.kind) return null;
    const trig = {
      id: t.id || `${t.kind}-${this.triggers.length}`,
      kind: t.kind,
      x: t.x | 0, y: t.y | 0,
      w: Math.max(1, t.w | 0 || 1),
      h: Math.max(1, t.h | 0 || 1),
      data: t.data ? { ...t.data } : {},
      once: !!t.once,
      done: !!t.done,
      facing: t.facing || null,        // require the player to face this way
      flag: t.flag || null,            // only active while this state flag is set
      notFlag: t.notFlag || null,
      priority: t.priority || 0,
      step: t.step != null ? !!t.step : STEP_KINDS.has(t.kind),
    };
    this.triggers.push(trig);
    this._indexTrigger(trig);
    this._applyTriggerFlags(trig);
    return trig;
  }

  _indexTrigger(t) {
    for (let j = t.y; j < t.y + t.h; j++) {
      for (let i = t.x; i < t.x + t.w; i++) {
        if (!this.inBounds(i, j)) continue;
        const k = j * this.w + i;
        let arr = this._trigIndex.get(k);
        if (!arr) { arr = []; this._trigIndex.set(k, arr); }
        arr.push(t);
        if (arr.length > 1) arr.sort((a, b) => (b.priority || 0) - (a.priority || 0));
      }
    }
  }

  _applyTriggerFlags(t) {
    const extra = TRIGGER_FLAGS[t.kind] || 0;
    for (let j = t.y; j < t.y + t.h; j++) {
      for (let i = t.x; i < t.x + t.w; i++) {
        if (!this.inBounds(i, j)) continue;
        this.flags[j * this.w + i] |= TF.TRIGGER | extra;
      }
    }
  }

  /** Rebuild the whole lookup index (after bulk edits or deserialisation). */
  reindexTriggers() {
    this._trigIndex.clear();
    for (const t of this.triggers) { this._indexTrigger(t); this._applyTriggerFlags(t); }
    return this;
  }

  removeTrigger(idOrTrigger) {
    const i = typeof idOrTrigger === 'string'
      ? this.triggers.findIndex((t) => t.id === idOrTrigger)
      : this.triggers.indexOf(idOrTrigger);
    if (i < 0) return null;
    const [t] = this.triggers.splice(i, 1);
    this.reindexTriggers();
    return t;
  }

  clearTriggers() { this.triggers.length = 0; this._trigIndex.clear(); return this; }

  /**
   * The trigger covering (x, y), or null. O(1).
   * opts: { kind, flags (state.flags for `flag`/`notFlag` gating), includeDone }
   */
  /**
   * The trigger that should act on this tile.
   *
   * More than one can share a square — an encounter zone is painted across whole
   * regions and will happily cover the road out of town. Taking them in insertion
   * order let an ambient zone shadow the warp underneath it, and the exit out of
   * Phandalin silently stopped working. Actionable triggers win; ties keep
   * insertion order.
   */
  triggerAt(x, y, opts = {}) {
    if (!this.inBounds(x, y)) return null;
    const arr = this._trigIndex.get(y * this.w + x);
    if (!arr || !arr.length) return null;
    let best = null, bestRank = -Infinity;
    for (const t of arr) {
      if (opts.kind && t.kind !== opts.kind) continue;
      if (t.done && t.once && !opts.includeDone) continue;
      if (opts.flags) {
        if (t.flag && !opts.flags[t.flag]) continue;
        if (t.notFlag && opts.flags[t.notFlag]) continue;
      }
      const rank = TRIGGER_PRIORITY(t);
      if (rank > bestRank) { best = t; bestRank = rank; }
    }
    return best;
  }

  /** Everything covering a tile, unfiltered. */
  triggersAt(x, y) {
    if (!this.inBounds(x, y)) return [];
    return this._trigIndex.get(y * this.w + x) || [];
  }

  triggersOfKind(kind) { return this.triggers.filter((t) => t.kind === kind); }
  findTrigger(id) { return this.triggers.find((t) => t.id === id) || null; }
  ledgeAt(x, y) { return this.triggerAt(x, y, { kind: 'ledge', includeDone: true }); }

  /** What encounter table applies here — a zone trigger wins over the map default. */
  encounterAt(x, y) {
    if (this.safe) return null;
    const z = this.triggerAt(x, y, { kind: 'encounter-zone' });
    if (z) {
      return {
        table: z.data.table || this.encounterTable,
        rate: z.data.rate != null ? z.data.rate : this.encounterRate,
        biome: z.data.biome || this.biome,
        level: z.data.level != null ? z.data.level : null,
      };
    }
    if (!(this.flagAt(x, y) & TF.ENCOUNTER)) return null;
    if (!this.encounterTable && !this.encounterRate) return null;
    return { table: this.encounterTable, rate: this.encounterRate, biome: this.biome, level: null };
  }

  // --- entities ------------------------------------------------------------

  /**
   * Register an entity. When an EntityList is attached it shares this very
   * array, so the HUD minimap (which reads `map.entities`) keeps working.
   */
  addEntity(e) {
    if (!e || this.entities.includes(e)) return e || null;
    e.map = this;
    this.entities.push(e);
    if (this.entityList) { e.list = this.entityList; this.entityList.index(e); }
    return e;
  }

  removeEntity(e) {
    const i = this.entities.indexOf(e);
    if (i >= 0) this.entities.splice(i, 1);
    if (this.entityList) this.entityList.unindex(e);
    return e;
  }

  entitiesAt(x, y) {
    if (this.entityList) return this.entityList.at(x, y);
    return this.entities.filter((e) => e && !e.removed && e.x === x && e.y === y);
  }

  /** True if a solid entity stands here (an NPC you can't walk through). */
  entityBlocks(x, y, ignore = null) {
    const list = this.entitiesAt(x, y);
    for (const e of list) if (e !== ignore && e.solid && !e.hidden && !e.removed) return true;
    return false;
  }

  // --- searching -----------------------------------------------------------

  /** Every tile on a plane holding `id`. */
  findTiles(layer, id) {
    const p = this._plane(layer);
    const out = [];
    for (let i = 0; i < this.size; i++) if (p[i] === id) out.push({ x: i % this.w, y: (i / this.w) | 0 });
    return out;
  }

  countFlag(bit) {
    let n = 0;
    for (let i = 0; i < this.size; i++) if (this.flags[i] & bit) n++;
    return n;
  }

  /** Nearest walkable tile to (x, y), spiralling outward. */
  nearestWalkable(x, y, maxR = 12, opts = {}) {
    if (!this.solidAt(x, y, opts)) return { x, y };
    for (let r = 1; r <= maxR; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const nx = x + dx, ny = y + dy;
          if (this.inBounds(nx, ny) && !this.solidAt(nx, ny, opts)) return { x: nx, y: ny };
        }
      }
    }
    return null;
  }

  /** A random open tile — for scattering spawns. Needs an RNG from core/rng.js. */
  randomWalkable(r, opts = {}) {
    if (!r) return null;
    for (let i = 0; i < 200; i++) {
      const x = r.int(0, this.w - 1), y = r.int(0, this.h - 1);
      if (this.solidAt(x, y, opts)) continue;
      if (opts.avoidTriggers && (this.flagAt(x, y) & TF.TRIGGER)) continue;
      if (opts.away && chebyshev(x, y, opts.away.x, opts.away.y) < (opts.awayDist || 4)) continue;
      return { x, y };
    }
    return null;
  }

  // --- pathfinding ---------------------------------------------------------

  /**
   * A* over the grid.
   *   from/to: {x, y}
   *   opts: { diagonal=false, maxNodes=2000, flying, swimming, size, ghost,
   *           climb, ignoreHazards, goalPassable=true, avoid:Set|fn, partial,
   *           maxCost, ignoreEntities=true }
   * Returns an array of {x, y} steps EXCLUDING the start tile, or null.
   */
  findPath(from, to, opts = {}) {
    if (!from || !to) return null;
    const sx = from.x | 0, sy = from.y | 0;
    const gx = to.x | 0, gy = to.y | 0;
    if (!this.inBounds(sx, sy) || !this.inBounds(gx, gy)) return null;
    if (sx === gx && sy === gy) return [];

    const diag = !!opts.diagonal;
    const maxNodes = Math.max(16, opts.maxNodes | 0 || 2000);
    const maxCost = opts.maxCost != null ? opts.maxCost : Infinity;
    const goalPassable = opts.goalPassable !== false;
    const goalIdx = gy * this.w + gx;

    // Extra blockers: standing entities, reserved tiles, "don't path here" zones.
    let avoid = null;
    if (typeof opts.avoid === 'function') avoid = opts.avoid;
    else if (opts.avoid && typeof opts.avoid.has === 'function') avoid = (x, y) => opts.avoid.has(`${x},${y}`);

    const heur = diag
      ? (x, y) => {
        const dx = Math.abs(x - gx), dy = Math.abs(y - gy);
        return (dx + dy) + (1.41421356 - 2) * Math.min(dx, dy);
      }
      : (x, y) => Math.abs(x - gx) + Math.abs(y - gy);

    const open = new MinHeap();
    const nodes = new Map();      // idx -> { x, y, g, f, parent, closed }
    const startIdx = sy * this.w + sx;
    const start = { x: sx, y: sy, g: 0, f: heur(sx, sy), parent: null, closed: false, i: startIdx };
    nodes.set(startIdx, start);
    open.push(start);

    let expanded = 0;
    let best = start, bestH = start.f;
    const steps = diag ? DIR_STEPS.concat(DIAG_STEPS) : DIR_STEPS;

    while (open.size) {
      const cur = open.pop();
      if (cur.closed) continue;
      cur.closed = true;

      if (cur.i === goalIdx) return this._unwind(cur);
      if (++expanded > maxNodes) break;                 // hard cap: never hang a frame

      for (const s of steps) {
        const nx = cur.x + s.x, ny = cur.y + s.y;
        if (!this.inBounds(nx, ny)) continue;
        const ni = ny * this.w + nx;
        const existing = nodes.get(ni);
        if (existing && existing.closed) continue;

        const isGoal = ni === goalIdx;
        let cost;
        if (isGoal && goalPassable) cost = 1;
        else {
          cost = this.costAt(nx, ny, opts);
          if (!isFinite(cost)) continue;
          if (avoid && avoid(nx, ny)) continue;
        }

        // Cliffs, ledges and diagonal corner-cutting.
        const step = this.canStep(cur.x, cur.y, nx, ny, { ...opts, diagonal: diag });
        if (!step.ok && !(isGoal && goalPassable)) continue;

        if (s.x && s.y) cost *= 1.41421356;
        const g = cur.g + cost;
        if (g > maxCost) continue;
        if (existing && g >= existing.g) continue;

        const h = heur(nx, ny);
        const node = existing || { x: nx, y: ny, i: ni, closed: false };
        node.g = g; node.f = g + h; node.parent = cur;
        if (!existing) nodes.set(ni, node);
        open.push(node);

        if (h < bestH) { bestH = h; best = node; }
      }
    }

    if (opts.partial && best !== start) return this._unwind(best);
    return null;
  }

  _unwind(node) {
    const out = [];
    let n = node;
    while (n && n.parent) { out.push({ x: n.x, y: n.y }); n = n.parent; }
    out.reverse();
    return out;
  }

  /** First step of a path, as a direction name — what NPC/monster AI actually wants. */
  stepToward(from, to, opts = {}) {
    const path = this.findPath(from, to, { partial: true, ...opts });
    if (!path || !path.length) return null;
    const n = path[0];
    const dx = n.x - (from.x | 0), dy = n.y - (from.y | 0);
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
    if (dy !== 0) return dy > 0 ? 'down' : 'up';
    return dx > 0 ? 'right' : dx < 0 ? 'left' : null;
  }

  /** Flood fill of reachable tiles within `budget` cost — battle movement ranges. */
  reachable(from, budget, opts = {}) {
    const out = new Map();
    const sx = from.x | 0, sy = from.y | 0;
    if (!this.inBounds(sx, sy)) return out;
    const maxNodes = Math.max(16, opts.maxNodes | 0 || 2000);
    const open = new MinHeap();
    open.push({ x: sx, y: sy, f: 0, g: 0, parent: null });
    const seen = new Map([[sy * this.w + sx, 0]]);
    let expanded = 0;
    const steps = opts.diagonal ? DIR_STEPS.concat(DIAG_STEPS) : DIR_STEPS;
    while (open.size && expanded++ < maxNodes) {
      const cur = open.pop();
      out.set(`${cur.x},${cur.y}`, { cost: cur.g, path: this._unwind(cur) });
      for (const s of steps) {
        const nx = cur.x + s.x, ny = cur.y + s.y;
        if (!this.inBounds(nx, ny)) continue;
        let c = this.costAt(nx, ny, opts);
        if (!isFinite(c)) continue;
        if (!this.canStep(cur.x, cur.y, nx, ny, { ...opts, diagonal: !!opts.diagonal }).ok) continue;
        if (s.x && s.y) c *= 1.41421356;
        const g = cur.g + c;
        if (g > budget) continue;
        const ni = ny * this.w + nx;
        const prev = seen.get(ni);
        if (prev != null && prev <= g) continue;
        seen.set(ni, g);
        open.push({ x: nx, y: ny, g, f: g, parent: cur });
      }
    }
    out.delete(`${sx},${sy}`);
    return out;
  }

  // --- fog of war ----------------------------------------------------------

  /** Light up a circle on the minimap. Returns how many tiles were newly seen. */
  revealAround(x, y, r = 6) {
    const rr = r * r;
    let n = 0;
    const x0 = Math.max(0, (x - r) | 0), x1 = Math.min(this.w - 1, (x + r) | 0);
    const y0 = Math.max(0, (y - r) | 0), y1 = Math.min(this.h - 1, (y + r) | 0);
    for (let j = y0; j <= y1; j++) {
      for (let i = x0; i <= x1; i++) {
        const dx = i - x, dy = j - y;
        if (dx * dx + dy * dy > rr) continue;
        const k = `${i},${j}`;
        if (!this.discovered.has(k)) { this.discovered.add(k); n++; }
      }
    }
    return n;
  }

  isDiscovered(x, y) { return this.discovered.has(`${x},${y}`); }
  revealAll() {
    for (let j = 0; j < this.h; j++) for (let i = 0; i < this.w; i++) this.discovered.add(`${i},${j}`);
    return this;
  }
  clearFog() { this.discovered.clear(); return this; }
  /** The save file stores plain arrays; state.discovered[mapId] is exactly this. */
  discoveredList() { return Array.from(this.discovered); }
  loadDiscovered(arr) {
    this.discovered = new Set(Array.isArray(arr) ? arr : []);
    return this;
  }
  explorationPct() { return this.size ? this.discovered.size / this.size : 0; }

  // --- persistence ---------------------------------------------------------

  /**
   * A JSON-safe snapshot. Tile planes are run-length encoded, which shrinks a
   * typical 80x80 town from 25k numbers to a few hundred.
   * opts: { tiles=true } — pass false for maps rebuilt from a seed, where only
   * the mutable bits (triggers fired, chests opened, fog) need storing.
   */
  serialize(opts = {}) {
    const out = {
      v: 1,
      id: this.id, name: this.name, w: this.w, h: this.h,
      biome: this.biome, indoor: this.indoor, region: this.region,
      music: this.music, ambient: this.ambient, dark: this.dark,
      dayNight: this.dayNight, weather: this.weather, safe: this.safe,
      spawn: { ...this.spawn },
      exits: { ...this.exits },
      encounterTable: this.encounterTable,
      encounterRate: this.encounterRate,
      discovered: this.discoveredList(),
      triggers: this.triggers.map((t) => ({
        id: t.id, kind: t.kind, x: t.x, y: t.y, w: t.w, h: t.h,
        data: t.data, once: t.once, done: t.done, facing: t.facing,
        flag: t.flag, notFlag: t.notFlag, priority: t.priority, step: t.step,
      })),
      meta: { ...this.meta },
    };
    if (opts.tiles !== false) {
      out.ground = rleEncode(this.ground);
      out.deco = rleEncode(this.deco);
      out.over = rleEncode(this.over);
      out.flags = rleEncode(this.flags);
      out.height = rleEncode(this.height);
    }
    if (opts.entities) {
      out.entities = this.entities
        .filter((e) => e && typeof e.serialize === 'function')
        .map((e) => e.serialize());
    }
    return out;
  }

  /** Restore into THIS map (sizes must match, or the planes are reallocated). */
  deserialize(obj) {
    if (!obj) return this;
    if (obj.w && obj.h && (obj.w !== this.w || obj.h !== this.h)) {
      this.w = obj.w | 0; this.h = obj.h | 0; this.size = this.w * this.h;
      this.ground = new Uint16Array(this.size);
      this.deco = new Uint16Array(this.size);
      this.over = new Uint16Array(this.size);
      this.flags = new Uint8Array(this.size);
      this.height = new Uint8Array(this.size);
    }
    if (obj.id) this.id = obj.id;
    if (obj.name) this.name = obj.name;
    if (obj.biome) this.biome = obj.biome;
    if (obj.indoor != null) this.indoor = !!obj.indoor;
    if (obj.region !== undefined) this.region = obj.region;
    if (obj.music) this.music = obj.music;
    if (obj.ambient !== undefined) this.ambient = obj.ambient;
    if (obj.dark != null) this.dark = obj.dark;
    if (obj.dayNight != null) this.dayNight = !!obj.dayNight;
    if (obj.weather !== undefined) this.weather = obj.weather;
    if (obj.safe != null) this.safe = !!obj.safe;
    if (obj.spawn) this.spawn = { x: obj.spawn.x | 0, y: obj.spawn.y | 0 };
    if (obj.exits) this.exits = { ...obj.exits };
    if (obj.encounterTable !== undefined) this.encounterTable = obj.encounterTable;
    if (obj.encounterRate != null) this.encounterRate = obj.encounterRate;
    if (obj.meta) this.meta = { ...obj.meta };

    if (obj.ground) rleDecode(obj.ground, this.ground);
    if (obj.deco) rleDecode(obj.deco, this.deco);
    if (obj.over) rleDecode(obj.over, this.over);
    if (obj.flags) rleDecode(obj.flags, this.flags);
    if (obj.height) rleDecode(obj.height, this.height);

    if (Array.isArray(obj.triggers)) {
      this.clearTriggers();
      for (const t of obj.triggers) this.addTrigger(t);
    } else {
      this.reindexTriggers();
    }
    this.loadDiscovered(obj.discovered);
    return this;
  }

  /**
   * Merge only the mutable half of a snapshot into an already-built map — the
   * normal load path for maps that regenerate from a seed.
   */
  applyProgress(obj) {
    if (!obj) return this;
    this.loadDiscovered(obj.discovered);
    if (Array.isArray(obj.triggers)) {
      for (const s of obj.triggers) {
        const t = this.findTrigger(s.id);
        if (t) t.done = !!s.done;
      }
    }
    return this;
  }

  static deserialize(obj) {
    const m = new TileMap({ w: obj?.w || 1, h: obj?.h || 1 });
    return m.deserialize(obj);
  }

  /** Rough ASCII dump — invaluable when a generator misbehaves. */
  toString(maxW = 120) {
    const lines = [];
    for (let y = 0; y < Math.min(this.h, 60); y++) {
      let s = '';
      for (let x = 0; x < Math.min(this.w, maxW); x++) {
        const f = this.flags[y * this.w + x];
        s += f & TF.SOLID ? '#' : f & TF.WATER ? '~' : f & TF.TRIGGER ? '!' : f & TF.ENCOUNTER ? ',' : '.';
      }
      lines.push(s);
    }
    return `${this.name} (${this.w}x${this.h}, ${this.biome})\n${lines.join('\n')}`;
  }
}

// ---------------------------------------------------------------------------
// 5. CONVENIENCE
// ---------------------------------------------------------------------------

/** Functional constructor, for map tables that prefer plain data. */
export function makeTileMap(opts) { return new TileMap(opts); }

export function deserializeMap(obj) { return TileMap.deserialize(obj); }

/**
 * Stitch a border of solid void around any map that lacks one, so no generator
 * bug can ever let the party walk into the abyss.
 */
export function sealEdges(map, tileId = 0) {
  for (let x = 0; x < map.w; x++) {
    map.set('deco', x, 0, tileId); map.setFlag(x, 0, TF.SOLID);
    map.set('deco', x, map.h - 1, tileId); map.setFlag(x, map.h - 1, TF.SOLID);
  }
  for (let y = 0; y < map.h; y++) {
    map.set('deco', 0, y, tileId); map.setFlag(0, y, TF.SOLID);
    map.set('deco', map.w - 1, y, tileId); map.setFlag(map.w - 1, y, TF.SOLID);
  }
  return map;
}

export default TileMap;
