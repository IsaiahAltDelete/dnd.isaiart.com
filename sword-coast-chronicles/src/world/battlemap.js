// world/battlemap.js — builds the small tactical arena a fight happens on.
//
// When an encounter triggers, we don't fight on the whole overworld map: we cut a
// battlefield that *looks* like where you were standing (a forest clearing on the
// Triboar Trail, a flagstone chamber in Undermountain) and lay out deployment
// zones. Cover, difficult terrain and elevation all come from real tiles so the
// tactical rules in rules/actions.js have something to read.

import { TileMap, TF } from './tilemap.js';
import { T, TILES, tileLayer, tileGroup, tileFlags } from '../render/tiles.js';
import { makeRNG } from '../core/rng.js';

export const ARENA_W = 22;
export const ARENA_H = 15;

/** Tile palettes per biome: [floor variants], [scatter cover], [difficult terrain], [blocking]. */
const PALETTES = {
  plains: { floor: ['GRASS', 'GRASS_2', 'CLOVER'], cover: ['ROCK', 'BUSH'], rough: ['GRASS_TALL'], block: ['BOULDER'], edge: 'GRASS_TALL' },
  road: { floor: ['DIRT_PATH', 'DIRT', 'GRASS'], cover: ['ROCK', 'CART', 'BARREL'], rough: ['MUD'], block: ['BOULDER'], edge: 'GRASS' },
  forest: { floor: ['GRASS', 'GRASS_2', 'DIRT'], cover: ['BUSH', 'STUMP', 'ROCK'], rough: ['GRASS_TALL', 'DIRT'], block: ['TREE_OAK', 'BOULDER'], edge: 'TREE_OAK' },
  'pine-forest': { floor: ['GRASS', 'DIRT', 'SNOW_GRASS'], cover: ['BUSH', 'STUMP'], rough: ['GRASS_TALL'], block: ['TREE_PINE'], edge: 'TREE_PINE' },
  hills: { floor: ['GRASS', 'DIRT', 'GRAVEL'], cover: ['ROCK', 'BOULDER'], rough: ['GRAVEL'], block: ['CLIFF'], edge: 'ROCK' },
  mountain: { floor: ['GRAVEL', 'STONE_FLOOR', 'DIRT'], cover: ['ROCK', 'BOULDER'], rough: ['GRAVEL'], block: ['CLIFF', 'BOULDER'], edge: 'CLIFF' },
  marsh: { floor: ['MUD', 'SWAMP_WATER', 'DIRT'], cover: ['REEDS', 'DEAD_TREE'], rough: ['MUD', 'SWAMP_WATER'], block: ['DEAD_TREE'], edge: 'REEDS' },
  coast: { floor: ['SAND', 'GRASS', 'GRAVEL'], cover: ['ROCK', 'DRIFTWOOD'], rough: ['SAND'], block: ['BOULDER'], edge: 'WATER' },
  ruins: { floor: ['FLAGSTONE', 'DIRT', 'GRAVEL'], cover: ['RUINED_WALL', 'PILLAR', 'RUBBLE'], rough: ['GRAVEL'], block: ['RUINED_WALL', 'PILLAR'], edge: 'RUINED_WALL' },
  cave: { floor: ['CAVE_FLOOR', 'CAVE_FLOOR_RUBBLE'], cover: ['STALAGMITE', 'ROCK'], rough: ['CAVE_FLOOR_RUBBLE'], block: ['CAVE_WALL', 'STALAGMITE'], edge: 'CAVE_WALL' },
  dungeon: { floor: ['DUNGEON_FLOOR', 'STONE_FLOOR', 'STONE_FLOOR_CRACKED'], cover: ['PILLAR', 'RUBBLE', 'CRATE'], rough: ['STONE_FLOOR_CRACKED'], block: ['DUNGEON_WALL', 'PILLAR'], edge: 'DUNGEON_WALL' },
  crypt: { floor: ['STONE_FLOOR', 'BONE_FLOOR'], cover: ['SARCOPHAGUS', 'PILLAR', 'BONES'], rough: ['BONE_FLOOR'], block: ['TOMB', 'PILLAR'], edge: 'DUNGEON_WALL' },
  mine: { floor: ['CAVE_FLOOR', 'GRAVEL'], cover: ['CRATE', 'ORE_IRON', 'ROCK'], rough: ['CAVE_FLOOR_RUBBLE'], block: ['CAVE_WALL', 'TIMBER_SUPPORT'], edge: 'CAVE_WALL' },
  'ash-waste': { floor: ['ASH_GROUND', 'ASH_DRIFT'], cover: ['DEAD_TREE', 'ROCK'], rough: ['ASH_DRIFT'], block: ['DEAD_TREE', 'BOULDER'], edge: 'DEAD_TREE' },
  tundra: { floor: ['SNOW', 'ICE', 'SNOW_GRASS'], cover: ['ROCK', 'DEAD_TREE'], rough: ['SNOW'], block: ['BOULDER'], edge: 'DEAD_TREE' },
  underdark: { floor: ['CAVE_FLOOR', 'DUNGEON_FLOOR'], cover: ['CRYSTAL', 'STALAGMITE'], rough: ['CAVE_FLOOR_RUBBLE'], block: ['CAVE_WALL', 'CRYSTAL'], edge: 'CAVE_WALL' },
  city: { floor: ['COBBLE', 'FLAGSTONE'], cover: ['BARREL', 'CRATE', 'CART'], rough: [], block: ['STONE_WALL'], edge: 'STONE_WALL' },
};

/** Resolve a palette entry name to a real tile id, falling back gracefully. */
function tid(name, fallback = 'GRASS') {
  return T[name] != null ? T[name] : (T[fallback] != null ? T[fallback] : 1);
}

/**
 * Ground-layer tiles must be fully opaque 16x16 fills. A 'deco' tile (a bush, a
 * pile of rubble) is drawn with transparency, so writing one to the ground layer
 * punches a black hole in the field. Resolve to the tile only if it really is a
 * ground tile, otherwise fall back.
 */
function groundTid(name, fallbackName) {
  const id = T[name];
  const def = id != null ? TILES[id] : null;
  const layer = def?.layer || 'ground';
  if (id != null && layer === 'ground') return id;
  return tid(fallbackName, 'GRASS');
}

function paletteFor(biome) {
  return PALETTES[biome] || PALETTES.plains;
}

/** Hazard tiles per biome: what a 0–2 tile patch of "don't stand there" looks like. */
const HAZARDS = {
  plains: { type: 'campfire', tile: 'BRAZIER', layer: 'deco', dice: '1d6', dmg: 'fire', chance: 0.25 },
  road: { type: 'campfire', tile: 'BRAZIER', layer: 'deco', dice: '1d6', dmg: 'fire', chance: 0.35 },
  forest: { type: 'campfire', tile: 'BRAZIER', layer: 'deco', dice: '1d6', dmg: 'fire', chance: 0.25 },
  hills: { type: 'campfire', tile: 'BRAZIER', layer: 'deco', dice: '1d6', dmg: 'fire', chance: 0.25 },
  marsh: { type: 'bog', tile: 'SWAMP_WATER', layer: 'ground', dice: '1d4', dmg: 'poison', chance: 0.6, slow: true },
  coast: { type: 'bog', tile: 'MUD', layer: 'ground', dice: '1d4', dmg: 'poison', chance: 0.25, slow: true },
  ruins: { type: 'brazier', tile: 'BRAZIER', layer: 'deco', dice: '1d6', dmg: 'fire', chance: 0.35 },
  city: { type: 'brazier', tile: 'BRAZIER', layer: 'deco', dice: '1d6', dmg: 'fire', chance: 0.3 },
  dungeon: { type: 'spikes', tile: 'SPIKE_TRAP', layer: 'ground', dice: '1d10', dmg: 'piercing', chance: 0.4 },
  crypt: { type: 'brazier', tile: 'BRAZIER', layer: 'deco', dice: '1d6', dmg: 'fire', chance: 0.4 },
  mine: { type: 'brazier', tile: 'BRAZIER', layer: 'deco', dice: '1d6', dmg: 'fire', chance: 0.3 },
  cave: { type: 'lava', tile: 'LAVA', layer: 'ground', dice: '2d6', dmg: 'fire', chance: 0.2 },
  underdark: { type: 'lava', tile: 'LAVA', layer: 'ground', dice: '2d6', dmg: 'fire', chance: 0.3 },
  'ash-waste': { type: 'lava', tile: 'LAVA', layer: 'ground', dice: '2d6', dmg: 'fire', chance: 0.6 },
  tundra: { type: 'thin-ice', tile: 'ICE', layer: 'ground', dice: '1d6', dmg: 'cold', chance: 0.4, slow: true },
};

/** Deco groups worth carrying from the real ground into the arena. */
const KEEP_DECO = new Set(['tree', 'plant', 'prop', 'wall', 'fence', 'cliff', 'cave-wall', 'furniture', 'roof', 'crop']);

/** Classes whose place is the front rank. Everyone else forms up behind them. */
const FRONT_CLASSES = new Set(['barbarian', 'fighter', 'paladin', 'monk']);
const MID_CLASSES = new Set(['rogue', 'ranger', 'cleric', 'druid']);

/**
 * Build a battlefield.
 *  opts: { biome, seed, indoor, ambush (true | 'party' | false), boss, depth,
 *          sourceMap, sourceX, sourceY, night, phase, weather, party:[Character], foes:n }
 * Returns a TileMap with `deploy` zones attached:
 *   map.deploy = { party:[{x,y}], foe:[{x,y,unaware?}], formation }
 * plus `map.dark` (0..1 light grade), `map.weather`, `map.hazards`.
 */
export function buildBattleMap(opts = {}) {
  const biome = opts.biome || 'plains';
  const r = makeRNG(opts.seed != null ? `${opts.seed}${opts._fallback ? ':fb' : ''}${opts._plain ? ':pl' : ''}` : `battle-${Date.now()}`);
  const pal = paletteFor(biome);
  const indoor = opts.indoor ?? ['cave', 'dungeon', 'crypt', 'mine', 'underdark'].includes(biome);

  const map = new TileMap({
    w: ARENA_W, h: ARENA_H,
    name: 'Battlefield', biome, indoor,
    music: opts.boss ? 'boss' : 'battle',
  });

  // --- light and weather ---------------------------------------------------
  // The UI grades the arena from these: a fight at midnight on the Triboar Trail
  // is dark; the same fight in fog is dark and grey.
  const phase = String(opts.phase || (opts.night ? 'night' : 'day'));
  let dark = indoor ? (opts.dark || 0) : 0;
  if (!indoor) {
    if (opts.night || phase === 'night') dark = 0.55;
    else if (phase === 'dusk' || phase === 'dawn') dark = 0.25;
  }
  const weather = indoor ? null : (opts.weather && opts.weather !== 'clear' && opts.weather !== 'none' ? String(opts.weather) : null);
  if (weather === 'fog') dark = Math.min(1, dark + 0.1);
  map.dark = dark;
  map.night = !!(opts.night || phase === 'night');
  map.weather = weather;

  // --- ground --------------------------------------------------------------
  // Preferably the real ground you were standing on; otherwise a painted one.
  let open = null;    // Uint8Array mask of tiles that were open ground in the source
  if (opts.sourceMap && !opts._fallback) {
    open = sampleSource(map, opts.sourceMap, opts.sourceX, opts.sourceY, pal, r);
  }
  const sampled = !!open;
  if (!sampled) {
    // A rejected window may have been half-copied: start from bare planes.
    map.deco.fill(0); map.over.fill(0); map.flags.fill(0);
    for (let y = 0; y < ARENA_H; y++) {
      for (let x = 0; x < ARENA_W; x++) {
        map.set('ground', x, y, groundTid(r.pick(pal.floor), pal.floor[0]));
      }
    }
  }

  // --- border --------------------------------------------------------------
  // A ring of scenery frames the arena and stops anyone walking off the edge.
  const edge = tid(pal.edge, pal.block[0]);
  for (let x = 0; x < ARENA_W; x++) {
    sealTile(map, x, 0, edge, pal); sealTile(map, x, ARENA_H - 1, edge, pal);
  }
  for (let y = 0; y < ARENA_H; y++) {
    sealTile(map, 0, y, edge, pal); sealTile(map, ARENA_W - 1, y, edge, pal);
  }

  // --- interior features ---------------------------------------------------
  // Keep the two deployment strips (columns 2–5 and 16–19) mostly clear so the
  // opening turn is never a wall of scenery.
  const clearBand = (x) => (x >= 2 && x <= 5) || (x >= ARENA_W - 6 && x <= ARENA_W - 3);
  const wasOpen = (x, y) => !open || !!open[y * ARENA_W + x];

  const blockers = Math.round(r.int(sampled ? 1 : 4, sampled ? 4 : 9) * (indoor ? 1.15 : 1));
  for (let i = 0; i < blockers; i++) {
    const x = r.int(2, ARENA_W - 3), y = r.int(2, ARENA_H - 3);
    if (clearBand(x) && r.chance(0.75)) continue;
    if ((map.flagAt(x, y) & (TF.SOLID | TF.WATER)) || !wasOpen(x, y)) continue;
    map.set('deco', x, y, tid(r.pick(pal.block)));
    map.setFlag(x, y, TF.SOLID);
    // Clusters read better than lone pixels — sometimes grow one neighbour.
    if (r.chance(0.45)) {
      const nx = x + r.pick([-1, 1]), ny = y + r.pick([-1, 0, 1]);
      if (map.inBounds(nx, ny) && !(map.flagAt(nx, ny) & (TF.SOLID | TF.WATER)) && !clearBand(nx) && wasOpen(nx, ny)) {
        map.set('deco', nx, ny, tid(r.pick(pal.block)));
        map.setFlag(nx, ny, TF.SOLID);
      }
    }
  }

  // Half-cover scatter: doesn't block movement, grants +2 AC via hasCover().
  const covers = r.int(sampled ? 3 : 5, sampled ? 7 : 11);
  for (let i = 0; i < covers && pal.cover.length; i++) {
    const x = r.int(2, ARENA_W - 3), y = r.int(2, ARENA_H - 3);
    if ((map.flagAt(x, y) & (TF.SOLID | TF.WATER)) || !wasOpen(x, y) || map.at('deco', x, y)) continue;
    map.set('deco', x, y, tid(r.pick(pal.cover)));
    map.setFlag(x, y, TF.LEDGE);     // LEDGE bit is reused as the "half cover" marker
  }

  // Difficult terrain patches.
  if (pal.rough.length) {
    const patches = r.int(sampled ? 0 : 1, sampled ? 2 : 3);
    for (let p = 0; p < patches; p++) {
      const cx = r.int(3, ARENA_W - 4), cy = r.int(3, ARENA_H - 4), rad = r.int(1, 2);
      for (let y = cy - rad; y <= cy + rad; y++) {
        for (let x = cx - rad; x <= cx + rad; x++) {
          if (!map.inBounds(x, y) || (map.flagAt(x, y) & (TF.SOLID | TF.WATER)) || !wasOpen(x, y)) continue;
          if (Math.hypot(x - cx, y - cy) > rad + 0.35) continue;
          map.set('ground', x, y, groundTid(r.pick(pal.rough), pal.floor[0]));
          map.setFlag(x, y, TF.SLOW);
        }
      }
    }
  }

  // A water feature outdoors, occasionally — it splits the field interestingly.
  // (Real ground brings its own rivers; only the painted arena invents one.)
  if (!sampled && !indoor && r.chance(0.22) && T.WATER != null) {
    const vertical = r.chance(0.5);
    const at = vertical ? r.int(8, ARENA_W - 9) : r.int(5, ARENA_H - 6);
    const len = vertical ? ARENA_H : ARENA_W;
    const gap = r.int(2, len - 4);
    for (let i = 1; i < len - 1; i++) {
      if (i >= gap && i <= gap + 2) continue;          // a ford to cross at
      const x = vertical ? at : i, y = vertical ? i : at;
      if (map.flagAt(x, y) & TF.SOLID) continue;
      map.set('ground', x, y, T.WATER);
      map.clearFlag(x, y, TF.SLOW);
      map.setFlag(x, y, TF.WATER | TF.SLOW);
    }
  }

  // --- formation-specific terrain -----------------------------------------
  const formation = pickFormation(r, opts);
  if (formation === 'chokepoint') buildChokepoint(map, r, pal);

  // --- hazards -------------------------------------------------------------
  map.hazards = placeHazards(map, r, biome, clearBand);
  map.hazard = map.hazards[0] || null;

  // --- deployment ----------------------------------------------------------
  map.deploy = layoutDeployment(map, r, opts, formation);

  // Real ground can strand a rank behind a river or a house. If the two zones
  // are not one connected field, fight on a painted arena instead.
  if (!deploymentConnected(map, map.deploy, opts)) {
    if (sampled) return buildBattleMap({ ...opts, _fallback: true });
    // A painted arena can still wall itself off (a boulder in the chokepoint
    // gap). Plain two-rank line on a fresh roll, which never fails.
    if (!opts._plain) return buildBattleMap({ ...opts, _fallback: true, _plain: true, formation: 'line' });
  }

  map.spawn = map.deploy.party[0] || { x: 3, y: 7 };
  map.arena = true;
  map.sampled = sampled;
  return map;
}

/** Paint one border tile and make it solid, whatever the sampled ground had there. */
function sealTile(map, x, y, edge, pal) {
  const def = TILES[edge];
  if (def && def.layer === 'ground') map.set('ground', x, y, edge);
  else map.set('deco', x, y, edge);
  map.clearFlag(x, y, TF.WATER | TF.SLOW | TF.DAMAGE | TF.LEDGE);
  map.setFlag(x, y, TF.SOLID);
}

/**
 * Copy the 22x15 window of the overworld centred on (sx, sy) into the arena:
 * ground, the scenery worth keeping, and the flags that matter to a fight.
 * Returns the open-ground mask, or null when the window is too cluttered to
 * fight on (the caller then paints a fresh arena).
 */
function sampleSource(map, src, sx, sy, pal, r) {
  if (!src || typeof src.at !== 'function' || !src.inBounds) return null;
  const cx = Number.isFinite(sx) ? sx | 0 : (src.spawn ? src.spawn.x : src.w >> 1);
  const cy = Number.isFinite(sy) ? sy | 0 : (src.spawn ? src.spawn.y : src.h >> 1);
  const x0 = cx - (ARENA_W >> 1), y0 = cy - (ARENA_H >> 1);
  const open = new Uint8Array(ARENA_W * ARENA_H);
  const fill = groundTid(pal.floor[0], 'GRASS');
  let openCount = 0, interior = 0;

  for (let y = 0; y < ARENA_H; y++) {
    for (let x = 0; x < ARENA_W; x++) {
      const wx = x0 + x, wy = y0 + y;
      const i = y * ARENA_W + x;
      if (!src.inBounds(wx, wy)) {
        // Off the edge of the world: solid scenery in the map's own material.
        map.set('ground', x, y, fill);
        map.set('deco', x, y, tid(r.pick(pal.block)));
        map.setFlagsRaw(x, y, TF.SOLID);
        continue;
      }
      const g = src.at('ground', wx, wy);
      const d = src.at('deco', wx, wy);
      const o = src.at('over', wx, wy);
      const f = src.flagAt(wx, wy);

      map.set('ground', x, y, g && tileLayer(g) === 'ground' ? g : fill);
      let flags = 0;
      if (f & TF.SOLID) flags |= TF.SOLID;
      if (f & TF.WATER) flags |= TF.WATER | TF.SLOW;
      if (f & TF.SLOW) flags |= TF.SLOW;
      if (f & TF.DAMAGE) flags |= TF.DAMAGE;

      if (d && KEEP_DECO.has(tileGroup(d))) {
        map.set('deco', x, y, d);
        const df = tileFlags(d);
        if (df & TF.SOLID) flags |= TF.SOLID;
        else if (tileGroup(d) === 'prop' || tileGroup(d) === 'plant') flags |= TF.LEDGE;   // half cover
        if (df & TF.SLOW) flags |= TF.SLOW;
      }
      if (o && (tileGroup(o) === 'roof' || (tileFlags(o) & TF.SOLID))) {
        map.set('over', x, y, o);
        flags |= TF.SOLID;
      }
      map.setFlagsRaw(x, y, flags);

      const isOpen = !(flags & (TF.SOLID | TF.WATER | TF.DAMAGE));
      if (isOpen) open[i] = 1;
      if (x > 0 && y > 0 && x < ARENA_W - 1 && y < ARENA_H - 1) {
        interior++;
        if (isOpen) openCount++;
      }
    }
  }
  // A window that is mostly wall or water is a bad place to fight.
  if (openCount < interior * 0.45) return null;
  return open;
}

/** Which layout this fight uses. Ambushes are fixed; the rest comes from the seed. */
function pickFormation(r, opts) {
  if (opts.ambush === true) return 'ambush';
  if (opts.formation) return String(opts.formation);
  if (opts.ambush === 'party') return r.chance(0.7) ? 'scattered' : 'line';
  return r.pickWeighted(['line', 'scattered', 'flank', 'chokepoint'], (f) => ({ line: 4, scattered: 2, flank: 2, chokepoint: 2 })[f]);
}

/** A wall of scenery down the middle with a two-tile gap — the foes hold the gap. */
function buildChokepoint(map, r, pal) {
  const wx = Math.floor(ARENA_W / 2);
  const midY = Math.floor(ARENA_H / 2);
  const gapY = midY + r.int(-2, 1);
  for (let y = 1; y < ARENA_H - 1; y++) {
    if (y === gapY || y === gapY + 1) {
      map.clearFlag(wx, y, TF.SOLID);
      if (map.flagAt(wx, y) & TF.SOLID) continue;
      if (TILES[map.at('deco', wx, y)]?.flags & TF.SOLID) map.set('deco', wx, y, 0);
      continue;
    }
    map.set('deco', wx, y, tid(r.pick(pal.block)));
    map.clearFlag(wx, y, TF.WATER | TF.SLOW | TF.DAMAGE | TF.LEDGE);
    map.setFlag(wx, y, TF.SOLID);
  }
  map.chokepoint = { x: wx, gap: [gapY, gapY + 1] };
}

/** 0–2 hazard tiles for biomes that have them. Returns [{type, dice, dmg, tiles:[{x,y}]}]. */
function placeHazards(map, r, biome, clearBand) {
  const hz = HAZARDS[biome];
  if (!hz || T[hz.tile] == null || !r.chance(hz.chance)) return [];
  const n = r.chance(0.3) ? 2 : 1;
  const tiles = [];
  for (let tries = 0; tries < 40 && tiles.length < n; tries++) {
    const x = r.int(3, ARENA_W - 4), y = r.int(2, ARENA_H - 3);
    if (clearBand(x)) continue;
    if (map.flagAt(x, y) & (TF.SOLID | TF.WATER | TF.DAMAGE)) continue;
    if (map.at('deco', x, y)) continue;
    if (hz.layer === 'ground') map.set('ground', x, y, T[hz.tile]);
    else map.set('deco', x, y, T[hz.tile]);
    map.clearFlag(x, y, TF.SOLID | TF.WATER | TF.LEDGE);
    map.setFlag(x, y, TF.DAMAGE | (hz.slow ? TF.SLOW : 0));
    tiles.push({ x, y });
  }
  if (!tiles.length) return [];
  return [{ type: hz.type, dice: hz.dice, dmg: hz.dmg, tiles }];
}

/** Where a character belongs in the line: 0 front, 1 middle, 2 back. */
export function rankOf(ch) {
  if (!ch) return 1;
  const cls = (ch.classes || []).map((c) => String(c.id || c.classId || c).toLowerCase());
  if (cls.some((c) => FRONT_CLASSES.has(c))) return 0;
  const ac = Number(ch.ac) || 10;
  const slots = ch.spells && ch.spells.slots ? Object.values(ch.spells.slots).some((s) => (typeof s === 'object' ? (s.max || s.total || 0) : s) > 0) : false;
  if (cls.some((c) => MID_CLASSES.has(c))) return ac >= 16 && !slots ? 0 : 1;
  if (!slots && ac >= 15) return 0;
  return 2;
}

/**
 * Choose standing spots. Normally the party forms up on the left — front-liners
 * in the forward column, casters behind — and the foes on the right; the other
 * formations move the foes around the field.
 */
function layoutDeployment(map, r, opts, formation = 'line') {
  const party = [];
  const foe = [];
  const bad = TF.SOLID | TF.WATER | TF.DAMAGE;
  const free = (x, y) => map.inBounds(x, y) && x > 0 && y > 0 && x < ARENA_W - 1 && y < ARENA_H - 1
    && !(map.flagAt(x, y) & bad)
    && !party.some((p) => p.x === x && p.y === y) && !foe.some((p) => p.x === x && p.y === y);

  const midY = Math.floor(ARENA_H / 2);
  const rows = [midY, midY - 1, midY + 1, midY - 2, midY + 2, midY - 3, midY + 3];
  const members = Array.isArray(opts.party) ? opts.party.slice(0, 4) : [];
  const foeCount = Math.max(1, Math.min(10, (opts.foes | 0) || 8));

  // --- the party -----------------------------------------------------------
  if (formation === 'ambush') {
    // Party bunched in the middle, enemies ringed around them.
    const cx = Math.floor(ARENA_W / 2), cy = midY;
    const offs = [[0, 0], [-1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, 0], [1, 1]];
    for (const [dx, dy] of offs) {
      if (party.length >= 4) break;
      if (free(cx + dx, cy + dy)) party.push({ x: cx + dx, y: cy + dy });
    }
    for (let ring = 3; ring <= 6 && foe.length < 10; ring++) {
      for (let a = 0; a < 12 && foe.length < 10; a++) {
        const ang = (a / 12) * Math.PI * 2;
        const x = Math.round(cx + Math.cos(ang) * ring);
        const y = Math.round(cy + Math.sin(ang) * ring * 0.7);
        if (free(x, y)) foe.push({ x, y });
      }
    }
  } else {
    // Ranks by role: rank 0 stands in the forward column (4), rank 1 in the
    // middle (3), rank 2 behind (2). Spots are handed back in MEMBER ORDER so
    // combat.js's "spot i goes to party unit i" still holds.
    const colFor = [4, 3, 2];
    const want = members.length ? members.map(rankOf) : [0, 1, 2, 1];
    const claimedRows = { 4: [], 3: [], 2: [] };
    const pickRow = (col) => {
      const used = claimedRows[col];
      for (const ry of rows) {
        if (used.includes(ry)) continue;
        if (free(col, ry)) { used.push(ry); return ry; }
      }
      return null;
    };
    for (let i = 0; i < Math.max(members.length, 4) && i < 4; i++) {
      const rank = want[i] != null ? want[i] : 1;
      let placed = false;
      for (const col of [colFor[rank], ...colFor.filter((c) => c !== colFor[rank])]) {
        const ry = pickRow(col);
        if (ry != null) { party.push({ x: col, y: ry, rank }); placed = true; break; }
      }
      if (!placed) break;
    }
  }

  // --- the foes ------------------------------------------------------------
  if (formation === 'line') {
    const fcols = [ARENA_W - 4, ARENA_W - 3, ARENA_W - 5, ARENA_W - 4, ARENA_W - 6];
    for (let i = 0; i < 10; i++) {
      const cx = fcols[i % fcols.length];
      for (const ry of r.shuffle(rows)) {
        if (foe.length > i) break;
        if (free(cx, ry)) { foe.push({ x: cx, y: ry }); break; }
      }
    }
  } else if (formation === 'chokepoint') {
    // Behind the gap in the wall, the nearest two holding the gap itself.
    const wx = map.chokepoint ? map.chokepoint.x : Math.floor(ARENA_W / 2);
    const gap = map.chokepoint ? map.chokepoint.gap : [midY, midY + 1];
    for (const gy of gap) if (foe.length < foeCount && free(wx + 1, gy)) foe.push({ x: wx + 1, y: gy });
    for (let tries = 0; tries < 80 && foe.length < 10; tries++) {
      const x = r.int(wx + 2, ARENA_W - 3), y = r.int(2, ARENA_H - 3);
      if (free(x, y)) foe.push({ x, y });
    }
  } else if (formation === 'scattered') {
    // Spread across the far half. One or two of them have not noticed you yet.
    for (let tries = 0; tries < 120 && foe.length < 10; tries++) {
      const x = r.int(Math.floor(ARENA_W / 2) + 1, ARENA_W - 3), y = r.int(2, ARENA_H - 3);
      if (!free(x, y)) continue;
      if (foe.some((f) => Math.abs(f.x - x) + Math.abs(f.y - y) < 2)) continue;
      foe.push({ x, y });
    }
    const unaware = Math.min(foe.length, foeCount, r.int(1, 2));
    // The farthest ones are the ones still looking the other way.
    const byDist = foe.map((f, i) => ({ i, d: f.x })).sort((a, b) => b.d - a.d);
    for (let k = 0; k < unaware; k++) foe[byDist[k].i].unaware = true;
  } else if (formation === 'flank') {
    // Two groups: one on the party's northern flank, one on the southern.
    const half = Math.ceil(foeCount / 2);
    const bands = [[2, 3], [ARENA_H - 4, ARENA_H - 3]];
    for (let b = 0; b < 2; b++) {
      const [y0, y1] = bands[b];
      const target = b === 0 ? half : foeCount - half;
      let placed = 0;
      for (let tries = 0; tries < 80 && placed < Math.max(target, 1) + 1; tries++) {
        const x = r.int(6, ARENA_W - 7), y = r.int(y0, y1);
        if (free(x, y)) { foe.push({ x, y, flank: b === 0 ? 'north' : 'south' }); placed++; }
      }
    }
    // Extras (a big pack) spill onto the far side as usual.
    for (let tries = 0; tries < 60 && foe.length < 10; tries++) {
      const x = r.int(ARENA_W - 6, ARENA_W - 3), y = r.int(2, ARENA_H - 3);
      if (free(x, y)) foe.push({ x, y });
    }
  }

  // Backstops in case a cluttered map starved the loops.
  let guard = 0;
  while (party.length < 4 && guard++ < 200) {
    const x = r.int(2, 5), y = r.int(2, ARENA_H - 3);
    if (free(x, y)) party.push({ x, y });
  }
  guard = 0;
  while (foe.length < 8 && guard++ < 300) {
    // The usual strip first; on cramped real ground, anywhere in the far half.
    const x = guard < 120 ? r.int(ARENA_W - 6, ARENA_W - 3) : r.int(Math.floor(ARENA_W / 2) + 1, ARENA_W - 3);
    const y = r.int(2, ARENA_H - 3);
    if (free(x, y)) foe.push({ x, y });
  }
  return { party, foe, formation };
}

/**
 * Both zones must be one walkable field: every party and foe spot reachable
 * from the party's first spot without crossing walls or water.
 */
export function deploymentConnected(map, deploy, opts = {}) {
  if (!deploy || !deploy.party.length || !deploy.foe.length) return false;
  const need = Math.max(1, Math.min(8, (opts.foes | 0) || 4));
  const seen = new Uint8Array(ARENA_W * ARENA_H);
  const start = deploy.party[0];
  const stack = [start];
  seen[start.y * ARENA_W + start.x] = 1;
  while (stack.length) {
    const { x, y } = stack.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (!map.inBounds(nx, ny)) continue;
      const i = ny * ARENA_W + nx;
      if (seen[i] || (map.flagAt(nx, ny) & (TF.SOLID | TF.WATER))) continue;
      seen[i] = 1;
      stack.push({ x: nx, y: ny });
    }
  }
  const ok = (p) => !!seen[p.y * ARENA_W + p.x];
  if (deploy.party.length < 4) return false;   // PARTY_MAX spots, whoever fills them
  if (!deploy.party.every(ok)) return false;
  return deploy.foe.filter(ok).length >= need;
}

/**
 * Pick the biome for a fight from where it started, so an ambush on the road
 * fights on a road, and a fight in Wave Echo Cave fights in a mine.
 */
export function biomeForBattle(map, x, y) {
  if (!map) return 'plains';
  if (map.biome) return map.biome;
  return map.indoor ? 'dungeon' : 'plains';
}
