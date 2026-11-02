// ui/hudmap.js — the HUD's cartography: a parchment minimap roundel and the quest compass's sense of where to go.
//
// The minimap is drawn the way a scribe would draw a plan: explored ground in
// parchment and tan, water in a blue wash, walls and cliffs in sepia ink,
// roofs in madder, doors in rubric, and the unexplored left as dark vellum.
// The whole map is painted once per map at one device pixel per tile; each
// step only paints the tiles it newly reveals, and a frame is one scaled blit
// through a hard-edged circular mask (no antialiasing anywhere).
//
// questGoal() turns the tracked quest's current step into somewhere on THIS
// map: the person to speak to, the quarry, or — when the goal is on another
// map — the doorway or road that leads there, found by a breadth-first walk
// of the world's warp graph.

import { TILE } from '../constants.js';
import { TILES } from '../render/tiles.js';
import { GILT, RUBRIC } from './ornament.js';
import { disc, ring, cached } from './hudparts.js';

// --- the cartographer's palette ---------------------------------------------

const INKS = {
  grass: '#c9c38c', dirt: '#cdb07e', road: '#b8a488', sand: '#e2d3a2', crop: '#cdbd6a',
  water: '#6f96b4', deep: '#557ea2', ice: '#cfe0e6', snow: '#eeede2', lava: '#c4552c',
  ash: '#93897e', floor: '#d3c19a', cliffTop: '#bba98a',
  wall: '#5a4028', caveWall: '#4e3c2c', cliff: '#7a6048', tree: '#5e7a44', plant: '#7c9452',
  door: RUBRIC.base, fence: '#7c5c3c', roof: '#94523a', canopy: '#526e3c', void: null,
};

/** Which ink a tile id is drawn in, by its registry group (render/tiles.js). */
function inkForTile(id, layer) {
  const d = TILES[id];
  if (!d || !id) return null;
  const g = d.group;
  if (layer === 'over') return g === 'roof' ? INKS.roof : g === 'tree' ? INKS.canopy : null;
  if (layer === 'deco') {
    switch (g) {
      case 'wall': return INKS.wall;
      case 'cave-wall': return INKS.caveWall;
      case 'cliff': return INKS.cliff;
      case 'tree': return INKS.tree;
      case 'plant': return d.key === 'LILY_PAD' ? null : INKS.plant;
      case 'door': return INKS.door;
      case 'fence': return INKS.fence;
      default: return null;
    }
  }
  switch (g) {
    case 'grass': return INKS.grass;
    case 'dirt': return INKS.dirt;
    case 'road': return INKS.road;
    case 'sand': return INKS.sand;
    case 'crop': return INKS.crop;
    case 'water': return /DEEP/.test(d.key) ? INKS.deep : INKS.water;
    case 'ice': return INKS.ice;
    case 'snow': return INKS.snow;
    case 'lava': return INKS.lava;
    case 'ash': return INKS.ash;
    case 'floor': return INKS.floor;
    case 'cliff-top': return INKS.cliffTop;
    default: return null;
  }
}

/** A tile's colour on the plan, with a whisper of hand-laid unevenness. */
function tileColour(map, x, y) {
  const i = y * map.w + x;
  const col = (map.over && inkForTile(map.over[i], 'over'))
    || (map.deco && inkForTile(map.deco[i], 'deco'))
    || (map.ground && inkForTile(map.ground[i], 'ground'));
  if (!col) return null;
  // One in five tiles a shade darker, hashed so it never crawls.
  const h = ((x * 73856093) ^ (y * 19349663)) >>> 0;
  return h % 5 === 0 ? shade(col, 0.9) : col;
}

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(c * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

// --- the plan canvas, one per map ---------------------------------------------

/**
 * The explored part of `map` at one device pixel per tile, kept up to date by
 * painting only the tiles revealed since the last call. Set iteration is in
 * insertion order, so the new keys are always the tail of map.discovered.
 */
function planOf(map) {
  if (!map || !(map.w > 0) || !(map.h > 0)) return null;
  let p = map._hudPlan;
  if (!p || p.w !== map.w || p.h !== map.h) {
    const cv = document.createElement('canvas');
    cv.width = map.w; cv.height = map.h;
    p = map._hudPlan = { cv, g: cv.getContext('2d'), w: map.w, h: map.h, done: 0, all: false };
  }
  const found = map.discovered;
  // No fog on this map (or an old one): draw everything once.
  if (!found || typeof found.size !== 'number') {
    if (!p.all) { paintAll(map, p); p.all = true; }
    return p;
  }
  if (found.size < p.done) { p.g.clearRect(0, 0, p.w, p.h); p.done = 0; }   // fog was cleared
  if (found.size > p.done) {
    let i = 0;
    for (const k of found) {
      if (i++ < p.done) continue;
      const c = k.indexOf(',');
      const x = +k.slice(0, c), y = +k.slice(c + 1);
      if (!(x >= 0 && y >= 0 && x < p.w && y < p.h)) continue;
      const col = tileColour(map, x, y);
      if (!col) continue;
      p.g.fillStyle = col;
      p.g.fillRect(x, y, 1, 1);
    }
    p.done = found.size;
  }
  return p;
}

function paintAll(map, p) {
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      const col = tileColour(map, x, y);
      if (!col) continue;
      p.g.fillStyle = col;
      p.g.fillRect(x, y, 1, 1);
    }
  }
}

// --- the roundel --------------------------------------------------------------

/** The explored plan of `map` at one pixel per tile (the Map screen draws it large). */
export function planCanvas(map) { const p = planOf(map); return p ? p.cv : null; }

/** Logical px per tile at each zoom step. */
export const ZOOMS = [0.5, 1, 2];

let scratch = null;

/**
 * Draw the minimap roundel with its top-left at (x, y), radius r (logical).
 * info: { map, player: { px, py, dir }, entities, markers, goal, zoom, t }
 */
export function drawMinimap(ctx, x, y, r, info) {
  const D = r * 4;                         // device px across the dial
  if (!scratch || scratch.width !== D) {
    scratch = document.createElement('canvas');
    scratch.width = D; scratch.height = D;
  }
  const g = scratch.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-over';
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, D, D);
  g.fillStyle = '#1f1812';
  g.fillRect(0, 0, D, D);

  const map = info.map, pl = info.player;
  const s = Math.max(1, Math.round((info.zoom || 1) * 2));     // device px per tile
  const c = D / 2;
  const ptx = pl ? pl.px / TILE : 0, pty = pl ? pl.py / TILE : 0;
  const ox = Math.round(c - ptx * s), oy = Math.round(c - pty * s);
  const plan = map ? planOf(map) : null;
  if (plan) g.drawImage(plan.cv, 0, 0, plan.w, plan.h, ox, oy, plan.w * s, plan.h * s);

  const at = (tx, ty) => [ox + (tx + 0.5) * s, oy + (ty + 0.5) * s];
  const inside = (px, py, pad = 0) => (px - c) * (px - c) + (py - c) * (py - c) <= (c - 3 - pad) * (c - 3 - pad);
  const dot = (px, py, w, col) => { g.fillStyle = col; g.fillRect(Math.round(px - w / 2), Math.round(py - w / 2), w, w); };

  if (map) {
    // Nothing is marked on ground the party has not seen: the plan only knows
    // what has been walked.
    const fog = map.discovered && typeof map.discovered.has === 'function' && map.discovered.size ? map.discovered : null;
    const seen = (tx, ty) => !fog || fog.has(`${Math.round(tx)},${Math.round(ty)}`);
    // Ways out: verdigris lozenges for roads and warps, gilt for doors and shops.
    for (const tg of Array.isArray(map.triggers) ? map.triggers : []) {
      if (!tg) continue;
      const k = tg.kind || '';
      if (k !== 'warp' && k !== 'door' && k !== 'inn' && k !== 'shop') continue;
      if (!seen(tg.x || 0, tg.y || 0)) continue;
      const [px, py] = at(tg.x || 0, tg.y || 0);
      if (!inside(px, py)) continue;
      const col = k === 'warp' ? '#2e8a62' : '#c8962e';
      g.fillStyle = '#1a120a';
      g.fillRect(Math.round(px) - 2, Math.round(py) - 1, 5, 3); g.fillRect(Math.round(px) - 1, Math.round(py) - 2, 3, 5);
      g.fillStyle = col;
      g.fillRect(Math.round(px) - 1, Math.round(py), 3, 1); g.fillRect(Math.round(px), Math.round(py) - 1, 1, 3);
    }
    // Folk in lapis, beasts in rubric, chests in gilt: inks that read on parchment.
    for (const e of info.entities || []) {
      if (!e || e.hidden || e.removed) continue;
      const k = e.kind || '';
      const col = k === 'monster' ? RUBRIC.base : k === 'npc' ? '#2a4a8e' : k === 'chest' && !e.opened ? GILT.mid : null;
      if (!col || !seen(e.x || 0, e.y || 0)) continue;
      const [px, py] = at(e.x || 0, e.y || 0);
      if (!inside(px, py)) continue;
      dot(px, py, 3, '#140e0a');
      dot(px, py, 2, col);
    }
  }

  // Spell pins and the quest goal: pinned to the rim on their true bearing
  // when they are off the glass, so the dial never loses what you seek.
  const pulse = 0.55 + 0.45 * Math.sin((info.t || 0) * 4);
  const pin = (tx, ty, col, star) => {
    let [px, py] = at(tx, ty);
    let dx = px - c, dy = py - c;
    const d = Math.hypot(dx, dy), lim = c - 6;
    const edge = d > lim;
    if (edge) { dx *= lim / d; dy *= lim / d; px = c + dx; py = c + dy; }
    const X = Math.round(px), Y = Math.round(py);
    g.globalAlpha = edge ? 0.75 + 0.25 * pulse : 1;
    if (star) {
      g.fillStyle = '#1a0f06';
      g.fillRect(X - 3, Y - 1, 7, 3); g.fillRect(X - 1, Y - 3, 3, 7); g.fillRect(X - 2, Y - 2, 5, 5);
      g.fillStyle = col;
      g.fillRect(X - 2, Y, 5, 1); g.fillRect(X, Y - 2, 1, 5); g.fillRect(X - 1, Y - 1, 3, 3);
      g.fillStyle = '#fff4c8'; g.fillRect(X, Y, 1, 1);
    } else {
      g.fillStyle = '#140e0a';
      g.fillRect(X - 2, Y - 2, 5, 5);
      g.fillStyle = col;
      g.fillRect(X - 1, Y - 1, 3, 3);
    }
    g.globalAlpha = 1;
  };
  for (const m of info.markers || []) {
    if (m && Number.isFinite(m.x) && Number.isFinite(m.y)) pin(m.x, m.y, m.color || '#9a6ae0', false);
  }
  if (info.goal && info.goal.here) pin(info.goal.x, info.goal.y, GILT.hi, true);

  // The party: a gilt arrowhead pointing the way the leader faces.
  if (pl) partyArrow(g, c, c, pl.dir);

  // Hard-edged round mask, then onto the HUD.
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(cached(`mm-mask:${D}`, D / 2, D / 2, (m) => disc(m, D / 2, D / 2, D / 2 - 2, '#000')), 0, 0);
  g.globalCompositeOperation = 'source-over';
  const smooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(scratch, x, y, D / 2, D / 2);
  ctx.imageSmoothingEnabled = smooth;

  // The rim: a keyline, a gilt ring lit from the upper left, a dark inner line,
  // and the four cardinal ticks.
  ctx.drawImage(cached(`mm-rim:${D}`, D / 2, D / 2, (m) => {
    const k = D / 2;
    ring(m, k, k, k - 2.5, k, '#0a0705');
    ring(m, k, k, k - 2, k - 0.5, GILT.hi, GILT.lo);
    ring(m, k, k, k - 3.2, k - 2, 'rgba(10,6,4,0.85)');
    m.fillStyle = GILT.hi;
    m.fillRect(k - 1, 0, 2, 4);
    m.fillStyle = GILT.mid;
    m.fillRect(k - 1, D - 4, 2, 4); m.fillRect(0, k - 1, 4, 2); m.fillRect(D - 4, k - 1, 4, 2);
  }), x, y, D / 2, D / 2);
}

const ARROWS = {
  up: [[0, -3], [-1, -2], [0, -2], [1, -2], [-2, -1], [-1, -1], [0, -1], [1, -1], [2, -1], [-1, 0], [0, 0], [1, 0], [-1, 1], [1, 1]],
};

/** A 5x5 arrowhead (device px) for the party, rotated to face `dir`. */
function partyArrow(g, cx, cy, dir) {
  const rot = { up: (a, b) => [a, b], down: (a, b) => [a, -b], left: (a, b) => [b, a], right: (a, b) => [-b, a] }[dir] || ((a, b) => [a, -b]);
  const pts = ARROWS.up.map(([a, b]) => rot(a, b));
  g.fillStyle = '#1a0f06';
  for (const [a, b] of pts) g.fillRect(Math.round(cx + a) - 1, Math.round(cy + b) - 1, 3, 3);
  g.fillStyle = GILT.hi;
  for (const [a, b] of pts) g.fillRect(Math.round(cx + a), Math.round(cy + b), 1, 1);
  g.fillStyle = '#fff4c8';
  const [a, b] = rot(0, -2);
  g.fillRect(Math.round(cx + a), Math.round(cy + b), 1, 1);
}

// --- the quest compass ----------------------------------------------------------

let WORLD = null;          // world/maps.js, loaded late: it is big and imports half the world
let NPC = null;            // data/npcs.js
import('../world/maps.js').then((m) => { WORLD = m; }).catch(() => {});
import('../data/npcs.js').then((m) => { NPC = m; }).catch(() => {});

const npcHome = (id) => {
  const n = NPC && NPC.getNPC ? NPC.getNPC(id) : null;
  return n ? n.map || null : null;
};

/** The tracked quest (or the first active one). */
export function trackedQuest(st) {
  if (!st || !st.quests) return null;
  const active = st.quests.active || [];
  if (!active.length) return null;
  return active.find((q) => q && q.id === st.quests.tracked) || active[0] || null;
}

/** The step to show: the lowest unfinished one (in the current phase, for ordered quests). */
export function currentStep(q) {
  const steps = Array.isArray(q && q.steps) ? q.steps : [];
  const open = steps.filter((s) => s && !s.done && !s.optional);
  if (!open.length) return null;
  if (q.def && q.def.ordered) {
    const phase = Math.min(...open.map((s) => s.phase || 0));
    return open.find((s) => (s.phase || 0) === phase) || open[0];
  }
  return open[0];
}

/** The first hop from `from` towards `to` on the warp graph: a warp node, or null. */
function firstHop(from, to) {
  if (!WORLD || !WORLD.WORLD_NODES || from === to) return null;
  const nodes = WORLD.WORLD_NODES;
  const out = new Map();
  for (const n of nodes) { if (!out.has(n.from)) out.set(n.from, []); out.get(n.from).push(n); }
  const seen = new Set([from]);
  const queue = [];
  for (const n of out.get(from) || []) if (!seen.has(n.to)) { seen.add(n.to); queue.push([n.to, n]); }
  for (let i = 0; i < queue.length && i < 4000; i++) {
    const [m, first] = queue[i];
    if (m === to) return first;
    for (const n of out.get(m) || []) if (!seen.has(n.to)) { seen.add(n.to); queue.push([n.to, first]); }
  }
  return null;
}

const mapName = (id) => {
  try { const m = WORLD && WORLD.mapMeta ? WORLD.mapMeta(id) : null; return (m && m.name) || null; } catch (e) { return null; }
};

const goalCache = { key: '', goal: null };

/**
 * Where the tracked quest wants you, on the current map:
 *   { here: true, x, y, kind, via, label }   a tile on this map (x, y in tiles)
 *   { here: false, label }                    somewhere the HUD cannot point (a flag)
 *   null                                      nothing tracked
 * `via` names the next map when the goal lies beyond a doorway or road.
 */
export function questGoal(st, map, entities, player) {
  const q = trackedQuest(st);
  if (!q || !map) return null;
  const step = currentStep(q);
  const kind = step ? step.kind : 'return';
  let goalMap = null, npcId = null;
  if (!step) { npcId = q.giver; goalMap = npcHome(q.giver); }
  else if (kind === 'reach' || kind === 'clear' || kind === 'explore' || kind === 'travel' || kind === 'goto') goalMap = step.map || step.target;
  else if (kind === 'talk' || kind === 'deliver' || kind === 'escort') { npcId = step.target; goalMap = step.map || npcHome(step.target); }
  else goalMap = step.map || null;

  const here = map.id;
  // The route only changes with the map or the step, so it is looked up once.
  const key = `${here}|${q.id}|${q.steps ? q.steps.findIndex((s) => s === step) : -1}|${goalMap}|${WORLD ? 1 : 0}`;
  let base = goalCache.key === key ? goalCache.goal : null;
  if (!base) {
    base = { kind, label: null, via: null, hop: null, npcId, target: step && step.target };
    if (goalMap && goalMap !== here && !(kind === 'reach' && map.id === goalMap)) {
      const hop = firstHop(here, goalMap);
      if (hop && hop.fromXY) { base.hop = hop.fromXY; base.via = mapName(hop.to) || null; }
      base.label = mapName(goalMap);
    }
    goalCache.key = key; goalCache.goal = base;
  }

  if (base.hop) return { here: true, x: base.hop.x, y: base.hop.y, kind, via: base.via, label: base.label };
  if (goalMap && goalMap !== here) return { here: false, kind, label: base.label };
  // On the right map: find the person, or the nearest of the quarry.
  const list = entities || [];
  if (npcId) {
    const e = list.find((n) => n && !n.hidden && !n.removed && n.npcId === npcId);
    if (e) return { here: true, x: e.x, y: e.y, kind, label: e.name || null };
  }
  if ((kind === 'kill' || kind === 'boss') && player) {
    let best = null, bd = Infinity;
    const px = player.px / TILE, py = player.py / TILE;
    for (const e of list) {
      if (!e || e.hidden || e.removed || e.kind !== 'monster') continue;
      if (step.target && e.monsterId && e.monsterId !== step.target) continue;
      const d = Math.max(Math.abs(e.x - px), Math.abs(e.y - py));
      if (d < bd) { bd = d; best = e; }
    }
    if (best) return { here: true, x: best.x, y: best.y, kind, label: best.name || null };
  }
  return { here: false, kind, label: null };
}
