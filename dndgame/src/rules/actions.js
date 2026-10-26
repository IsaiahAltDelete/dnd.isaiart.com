// rules/actions.js — the resolution primitives. Every attack, spell, save, check,
// shove and step of movement in Sword Coast Chronicles funnels through this file.
//
// Design contract:
//   * Headless. No canvas, no DOM. combat.js and the UI drive these functions and
//     read the structured results.
//   * Every roll goes through core/dice.js, which goes through core/rng.js. Nothing
//     here calls Math.random().
//   * Every result carries a `breakdown` array — one entry per die group — so the
//     battle UI can show the player literally every die that was rolled.
//   * Defensive by contract: missing ctx, missing map, unknown ids, absent optional
//     blocks and half-built characters must degrade, never throw.
//
// `ctx` is duck-typed. An `Encounter` satisfies it, and so does `{}`:
//   { units:[Character], map:TileMap, rng:RNG, round:int, turnIndex:int,
//     rules:{ flanking:false }, byUid(uid), log(text, kind) }
//
// 2024 PHB rules implemented here that are easy to get wrong are commented inline.

import { FEET_PER_TILE, SIZES, clamp } from '../constants.js';
import { rng } from '../core/rng.js';
import { d20, rollExpr, parseDice, avgExpr } from '../core/dice.js';
import { bus, EV } from '../core/events.js';
import { SKILLS } from './abilities.js';
import {
  itemDef, abilityMod, abilityScore, profBonus, saveMod, skillMod, acOf,
  attackBonusFor, damageFor, masteryFor, attackAbility,
  hasProf, hasPassive, hasFeat, mechOf, classLevel,
  armorOf, equipped, equippedDef, removeItem,
  damage as characterDamage, heal as characterHeal, addTempHp,
  isDead, isAlive, recalc,
} from './character.js';
import {
  conditionMech, addCondition, removeCondition, hasCondition, consumeCondition,
  activeConditions, conditionName, CONDITIONS, roundsFor, exhaustionLevel, reduceExhaustion,
} from './conditions.js';
import {
  concentrationCheck, isConcentrating, breakConcentration, spellDC, spellAtk, spendSlot,
} from './spellcasting.js';
import { getSpell } from '../data/spells.js';

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

const arr = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const lower = (s) => String(s || '').toLowerCase();
const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** Tile flag bits, mirrored from world/tilemap.js so rules/ never imports world/. */
export const TILE_FLAGS = Object.freeze({
  SOLID: 1, WATER: 2, ENCOUNTER: 4, DOOR: 8, TRIGGER: 16,
  // world/battlemap.js reuses the LEDGE bit as its "scatter = half cover" marker.
  HALF_COVER: 32, LEDGE: 32, SLOW: 64, DAMAGE: 128,
});

/** Cover values as AC (and Dexterity saving throw) bonuses — 2024 PHB. */
export const COVER = Object.freeze({ NONE: 0, HALF: 2, THREE_QUARTERS: 5 });

/** Size ordering, for "Large or smaller" style tests (Push mastery, grappling). */
const SIZE_ORDER = ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'];
const sizeRank = (ch) => {
  const i = SIZE_ORDER.indexOf(lower(ch?.size || 'medium'));
  return i < 0 ? 2 : i;
};

// ---------------------------------------------------------------------------
// Context accessors — all of them tolerate a null / partial ctx
// ---------------------------------------------------------------------------

function unitsOf(ctx) {
  const u = ctx?.units;
  return Array.isArray(u) ? u.filter(Boolean) : [];
}

function mapOf(ctx) {
  const m = ctx?.map;
  return m && (typeof m.flagAt === 'function' || typeof m.solid === 'function') ? m : null;
}

function rngOf(ctx) { return ctx?.rng || rng; }

function rulesOf(ctx) { return ctx?.rules || {}; }

/** Which team a unit fights for. Monsters default to 'foe', everyone else 'party'. */
function sideOf(u) {
  if (!u) return 'none';
  if (u.side) return u.side;
  return u.kind === 'monster' ? 'foe' : 'party';
}

export function isHostile(a, b) {
  return !!a && !!b && a !== b && sideOf(a) !== sideOf(b);
}

export function isAlly(a, b) {
  return !!a && !!b && a !== b && sideOf(a) === sideOf(b);
}

/**
 * Everything still standing (0 hp creatures are not threats and do not block lines).
 * A creature that has fled the field (`_fled`) is gone for every purpose here.
 */
function standingUnits(ctx) {
  return unitsOf(ctx).filter((u) => isAlive(u) && !u._fled);
}

/** Position of a unit or a bare tile — accepts {pos:{x,y}}, {x,y}, or [x,y]. */
export function tileOf(a) {
  if (!a) return { x: 0, y: 0 };
  if (Array.isArray(a)) return { x: num(a[0]), y: num(a[1]) };
  if (a.pos && typeof a.pos === 'object') return { x: num(a.pos.x), y: num(a.pos.y) };
  return { x: num(a.x), y: num(a.y) };
}

/** Combat positions are the north-west corner of a creature's occupied space.
 * Bare coordinates remain single tiles, preserving point-target semantics. */
export function footprintSize(unit) { return SIZES[String(unit?.size || 'medium').toLowerCase()]?.tiles || 1; }
export function footprintTiles(unit, at = tileOf(unit)) {
  const cells=[],size=footprintSize(unit);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++)cells.push({x:at.x+x,y:at.y+y});
  return cells;
}

/** The unit standing on a tile, if any. */
export function unitAt(ctx, x, y) {
  for (const u of standingUnits(ctx)) {
    const p = tileOf(u), size = footprintSize(u);
    if (x >= p.x && x < p.x + size && y >= p.y && y < p.y + size) return u;
  }
  return null;
}

function pushLog(out, ctx, text, kind = '') {
  if (!text) return;
  out.push({ text, kind });
  if (typeof ctx?.log === 'function') { try { ctx.log(text, kind); } catch { /* UI hiccup, never fatal */ } }
  else if (typeof ctx?.onLog === 'function') { try { ctx.onLog({ text, kind }); } catch { /* ignore */ } }
}

/**
 * Per-turn use tracking (Sneak Attack, Cleave, Nick, the Slow mastery). Stored on a
 * cache key so it never reaches a save file, and reset automatically when the round
 * or turn index moves on.
 */
function turnUses(ctx, ch) {
  if (!ch) return {};
  const round = num(ctx?.round, 0);
  const turn = num(ctx?.turnIndex, 0);
  if (!ch._turnUses || ch._turnUses.round !== round || ch._turnUses.turn !== turn) {
    ch._turnUses = { round, turn };
  }
  return ch._turnUses;
}

/** combat.js calls this at the top of a creature's turn. */
export function resetTurnUses(ch) { if (ch) ch._turnUses = null; }

// ===========================================================================
// GEOMETRY
// ===========================================================================

/**
 * Distance in feet on the 5-ft grid.
 * 5e's default grid rule: a diagonal costs the same as a straight step, so the
 * distance between two tiles is the Chebyshev distance times 5 feet. (The DMG's
 * optional "every second diagonal costs 10 ft" variant is deliberately off.)
 */
export function distanceFt(a, b) {
  const p = tileOf(a), q = tileOf(b), sa = footprintSize(a), sb = footprintSize(b);
  const dx = Math.max(0, p.x - (q.x + sb - 1), q.x - (p.x + sa - 1));
  const dy = Math.max(0, p.y - (q.y + sb - 1), q.y - (p.y + sa - 1));
  return Math.max(dx, dy) * FEET_PER_TILE;
}

/** The same distance measured in tiles. */
export function distanceTiles(a, b) {
  return distanceFt(a,b) / FEET_PER_TILE;
}

/**
 * Is `b` within `range` of `a`?
 * `range` may be a number of feet or a [normal, long] pair — the long value is the
 * one that decides whether the shot can be taken at all.
 */
export function inRange(a, b, range) {
  const d = distanceFt(a, b);
  if (Array.isArray(range)) return d <= num(range[1], num(range[0], 5));
  return d <= num(range, 5);
}

/**
 * Which band a ranged attack falls in: 'normal', 'long' (Disadvantage) or 'out'.
 * Melee weapons pass [reach, reach] and never produce 'long'.
 */
export function rangeBandOf(a, b, range) {
  const d = distanceFt(a, b);
  const normal = Array.isArray(range) ? num(range[0], 5) : num(range, 5);
  const long = Array.isArray(range) ? num(range[1], normal) : normal;
  if (d <= normal) return 'normal';
  if (d <= long) return 'long';
  return 'out';
}

/** How far a creature threatens: 10 ft with a Reach weapon, 5 ft otherwise. */
export function reachFt(ch) {
  if (!ch) return 5;
  if (typeof ch.reach === 'number') return ch.reach;
  const mh = equippedDef(ch, 'mainHand');
  let reach = 5;
  if (arr(mh?.props).includes('reach')) reach = 10;
  // Monsters carry their reach on their actions rather than on a weapon.
  for (const act of arr(ch.actions)) {
    if (typeof act?.reach === 'number') reach = Math.max(reach, act.reach);
  }
  // Body size is already accounted for by footprint distance. Reach comes
  // from the weapon/stat block; a Large wolf's Bite still reaches only 5 ft.
  return reach;
}

/** Classic integer Bresenham line, endpoints included. */
export function bresenham(x0, y0, x1, y1) {
  const pts = [];
  let x = Math.round(x0), y = Math.round(y0);
  const tx = Math.round(x1), ty = Math.round(y1);
  const dx = Math.abs(tx - x), dy = Math.abs(ty - y);
  const sx = x < tx ? 1 : -1, sy = y < ty ? 1 : -1;
  let err = dx - dy;
  let guard = 0;
  for (;;) {
    pts.push({ x, y });
    if ((x === tx && y === ty) || ++guard > 4096) break;
    const e2 = err * 2;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
  return pts;
}

/** Does a tile stop sight and spell effects? Out-of-bounds counts as solid. */
function isOpaque(map, x, y) {
  if (!map) return false;
  const ix = Math.floor(x), iy = Math.floor(y);
  if (typeof map.inBounds === 'function' && !map.inBounds(ix, iy)) return true;
  if (typeof map.opaque === 'function') return !!map.opaque(ix, iy);
  if (typeof map.flagAt === 'function') return (map.flagAt(ix, iy) & TILE_FLAGS.SOLID) !== 0;
  if (typeof map.solid === 'function') return !!map.solid(ix, iy);
  return false;
}

/** Does a tile grant half cover (scatter: a rock, a barrel, a low wall)? */
function isHalfCoverTile(map, x, y) {
  if (!map || typeof map.flagAt !== 'function') return false;
  const ix = Math.floor(x), iy = Math.floor(y);
  if (typeof map.inBounds === 'function' && !map.inBounds(ix, iy)) return false;
  return (map.flagAt(ix, iy) & TILE_FLAGS.HALF_COVER) !== 0;
}

/**
 * Walk a float ray in tile space, returning true if nothing opaque interrupts it.
 * The two endpoint tiles are always ignored — you never take cover from yourself
 * and a target's own tile is not an obstacle.
 *
 * `graze` marks the two corner lines that run exactly along a tile boundary. 5e
 * treats such a line as clear unless the squares on BOTH sides of it are blocked,
 * which is what makes a lone pillar heavy cover instead of an impenetrable wall.
 * `px,py` is the unit perpendicular used to look at each side of the boundary.
 */
function rayClear(map, x0, y0, x1, y1, skipA, skipB, graze = null) {
  if (!map) return true;
  const dx = x1 - x0, dy = y1 - y0;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) * 4));
  const D = 0.02;
  const skip = (px, py) => (px === skipA.x && py === skipA.y) || (px === skipB.x && py === skipB.y);

  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const cx = x0 + dx * t, cy = y0 + dy * t;
    if (graze) {
      // Look just inside the tile on either side of the boundary.
      const ax = Math.floor(cx - graze.px * D), ay = Math.floor(cy - graze.py * D);
      const bx = Math.floor(cx + graze.px * D), by = Math.floor(cy + graze.py * D);
      const aBlocked = !skip(ax, ay) && isOpaque(map, ax, ay);
      const bBlocked = !skip(bx, by) && isOpaque(map, bx, by);
      if (aBlocked && bBlocked) return false;
    } else {
      const px = Math.floor(cx), py = Math.floor(cy);
      if (skip(px, py)) continue;
      if (isOpaque(map, px, py)) return false;
    }
  }
  return true;
}

/**
 * The five probe lines used for sight and cover, offset PERPENDICULAR to the line of
 * fire: the centre line, two lines a third of a tile out, and the two corner lines
 * that run exactly along the tile boundary. This is the grid form of 5e's corner
 * rule — trace from the attacker's space to the corners of the target's space and
 * count how many of those lines an obstacle interrupts.
 */
const PROBE_OFFSETS = [0, 0.34, -0.34, 0.5, -0.5];

function probeRays(A, B) {
  const ax = A.x + 0.5, ay = A.y + 0.5;
  const bx = B.x + 0.5, by = B.y + 0.5;
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len, py = dx / len;             // unit vector perpendicular to the shot
  return PROBE_OFFSETS.map((o) => ({
    x0: ax + px * o, y0: ay + py * o,
    x1: bx + px * o, y1: by + py * o,
    // The ±0.5 lines sit on a tile boundary and use the two-sided grazing test.
    graze: Math.abs(o) === 0.5 ? { px, py } : null,
  }));
}

/** How many of the five probe lines an obstacle interrupts. */
function blockedProbes(map, A, B) {
  let blocked = 0;
  for (const ray of probeRays(A, B)) {
    if (!rayClear(map, ray.x0, ray.y0, ray.x1, ray.y1, A, B, ray.graze)) blocked++;
  }
  return blocked;
}

/**
 * Line of sight / line of effect. True if ANY probe line gets through, so a lone
 * pillar between two creatures grants heavy cover (see hasCover) rather than making
 * the target impossible to attack. Only a genuine wall stops every line.
 */
export function lineOfSight(ctx, a, b) {
  const map = mapOf(ctx);
  if (!map) return true;
  // Fog Cloud and Darkness are heavy obscurement: they stop sight rather than
  // arrows, so they belong here and not in the map's solidity. Asking the
  // encounter means one hook covers targeting, cover, advantage and the AI.
  for(const A of footprintTiles(a))for(const B of footprintTiles(b)){
    if(A.x===B.x&&A.y===B.y)return true;
    if(ctx&&typeof ctx.zoneBlocksSight==='function'&&ctx.zoneBlocksSight(A,B))continue;
    if(blockedProbes(map,A,B)<PROBE_OFFSETS.length)return true;
  }
  return false;
}

/** Total cover: no ray gets through, so the target cannot be targeted directly. */
export function hasTotalCover(ctx, a, b) { return !lineOfSight(ctx, a, b); }

/**
 * Cover bonus to AC and Dexterity saving throws: 0, +2 (half) or +5 (three-quarters).
 * 2024 PHB — a creature in the way gives at most half cover; terrain that blocks
 * most of the probe rays gives three-quarters.
 */
export function hasCover(ctx, a, b) {
  let best=COVER.THREE_QUARTERS;
  for(const A of footprintTiles(a))for(const B of footprintTiles(b)){
    if(!lineOfSight(ctx,A,B))continue;
    best=Math.min(best,coverForTiles(ctx,A,B,a,b));
    if(best===COVER.NONE)return best;
  }
  return best;
}

function coverForTiles(ctx, A, B, source, target) {
  const map = mapOf(ctx);
  if (A.x === B.x && A.y === B.y) return COVER.NONE;

  let best = COVER.NONE;

  if (map) {
    // Corner rule: one or two lines blocked is half cover, three or more is
    // three-quarters. (All five blocked is total cover — the caller checks that
    // separately with hasTotalCover, because it forbids the attack entirely.)
    const blocked = blockedProbes(map, A, B);
    if (blocked >= 3) best = COVER.THREE_QUARTERS;
    else if (blocked >= 1) best = COVER.HALF;

    // Scatter cover (a boulder, a crate) on the direct line is half cover even when
    // it doesn't stop a single ray.
    if (best === COVER.NONE) {
      for (const p of bresenham(A.x, A.y, B.x, B.y)) {
        if ((p.x === A.x && p.y === A.y) || (p.x === B.x && p.y === B.y)) continue;
        if (isHalfCoverTile(map, p.x, p.y)) { best = COVER.HALF; break; }
      }
    }
  }

  // A creature standing between you and your target gives it half cover.
  if (best < COVER.HALF) {
    for (const p of bresenham(A.x, A.y, B.x, B.y)) {
      if ((p.x === A.x && p.y === A.y) || (p.x === B.x && p.y === B.y)) continue;
      const u = unitAt(ctx, p.x, p.y);
      // Tiny creatures (a familiar underfoot) are not an obstacle.
      if (u && u!==source && u!==target && sizeRank(u) > 0) { best = COVER.HALF; break; }
    }
  }

  return best;
}

/**
 * Tile lists for area-of-effect templates, matching the PHB shapes on a 5-ft grid.
 *
 *   shape: { kind:'sphere'|'cylinder'|'cone'|'line'|'wall'|'cube'|'square'|'point',
 *            radius, length, width, size }   — all dimensions in FEET
 *
 * `origin` is where the effect comes from (the caster, or a dragon's mouth) and
 * `target` is the point aimed at. Sphere/cylinder/cube centre on `target`; cone,
 * line and wall project from `origin` toward `target`.
 */
export function areaTiles(origin, target, shape = {}) {
  let O = tileOf(origin);
  const T = tileOf(target);
  // A bare string names the shape and carries no dimensions. Normalising it here
  // stops `shape.length` accidentally resolving to the string's character count.
  if (typeof shape === 'string') shape = { kind: shape };
  if (!shape || typeof shape !== 'object') shape = {};
  const kind = lower(shape.kind || shape.shape || 'sphere');
  if((kind==='cone'||kind==='line')&&footprintSize(origin)>1){
    O=footprintTiles(origin).sort((a,b)=>Math.hypot(a.x-T.x,a.y-T.y)-Math.hypot(b.x-T.x,b.y-T.y))[0];
  }
  const ft = (v, d) => Math.max(0, num(v, d));
  const toTiles = (feet) => Math.max(0, Math.round(feet / FEET_PER_TILE));

  const out = [];
  const seen = new Set();
  const add = (x, y) => {
    const k = `${x},${y}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ x, y });
  };

  switch (kind) {
    case 'point':
    case 'self':
    case 'single':
    case 'creature':
      add(T.x, T.y);
      break;

    case 'cube':
    case 'square': {
      // A cube's side length in feet; centred on the aim point, biased up-left for
      // even sizes so a 10-ft cube covers a clean 2x2.
      const n = Math.max(1, toTiles(ft(shape.size ?? shape.length ?? shape.radius, 15)));
      const sx = T.x - Math.floor((n - 1) / 2);
      const sy = T.y - Math.floor((n - 1) / 2);
      for (let y = sy; y < sy + n; y++) for (let x = sx; x < sx + n; x++) add(x, y);
      break;
    }

    case 'cone': {
      // A cone's width at any point equals its distance from the origin, which is a
      // half-angle of atan(0.5) ≈ 26.57°. The origin tile itself is NOT in the cone.
      const len = toTiles(ft(shape.length ?? shape.radius, 15));
      let dx = T.x - O.x, dy = T.y - O.y;
      if (dx === 0 && dy === 0) dx = 1;                       // degenerate aim: point east
      const dl = Math.hypot(dx, dy) || 1;
      const ux = dx / dl, uy = dy / dl;
      const COS_HALF = Math.cos(Math.atan(0.5));
      for (let y = O.y - len; y <= O.y + len; y++) {
        for (let x = O.x - len; x <= O.x + len; x++) {
          const vx = x - O.x, vy = y - O.y;
          if (vx === 0 && vy === 0) continue;
          if (Math.max(Math.abs(vx), Math.abs(vy)) > len) continue;
          const vl = Math.hypot(vx, vy) || 1;
          if ((vx * ux + vy * uy) / vl >= COS_HALF - 0.001) add(x, y);
        }
      }
      break;
    }

    case 'line':
    case 'wall':
    case 'beam': {
      const len = toTiles(ft(shape.length ?? shape.range, 30));
      // Width in whole tiles, half-open so an even width (a 10-ft-wide Lightning Bolt)
      // covers exactly two rows rather than three, biased the same way as a Cube.
      const wTiles = Math.max(1, toTiles(ft(shape.width, 5)));
      const lo = -wTiles / 2, hi = wTiles / 2;
      let dx = T.x - O.x, dy = T.y - O.y;
      if (dx === 0 && dy === 0) dx = 1;
      const dl = Math.hypot(dx, dy) || 1;
      const ux = dx / dl, uy = dy / dl;
      const span = len + wTiles + 1;
      for (let y = O.y - span; y <= O.y + span; y++) {
        for (let x = O.x - span; x <= O.x + span; x++) {
          const vx = x - O.x, vy = y - O.y;
          const along = vx * ux + vy * uy;                    // projection onto the beam
          if (along <= 0 || along > len) continue;
          const perp = vx * uy - vy * ux;                     // 2-D cross product = offset
          if (perp > lo - 0.001 && perp < hi - 0.001) add(x, y);
        }
      }
      break;
    }

    case 'sphere':
    case 'cylinder':
    case 'radius':
    case 'burst':
    default: {
      const rad = toTiles(ft(shape.radius ?? shape.length, 20));
      for (let y = T.y - rad; y <= T.y + rad; y++) {
        for (let x = T.x - rad; x <= T.x + rad; x++) {
          if (Math.max(Math.abs(x - T.x), Math.abs(y - T.y)) <= rad) add(x, y);
        }
      }
      break;
    }
  }

  // Optional trimming: stay on the map, and require line of effect from the burst point.
  const ctx = shape.ctx || null;
  const map = mapOf(ctx) || (shape.map && typeof shape.map.inBounds === 'function' ? shape.map : null);
  if (!map) return out;

  const burst = (kind === 'cone' || kind === 'line' || kind === 'wall' || kind === 'beam') ? O : T;
  return out.filter((p) => {
    if (typeof map.inBounds === 'function' && !map.inBounds(p.x, p.y)) return false;
    if (isOpaque(map, p.x, p.y)) return false;
    if (shape.requireLoS === false) return true;
    return lineOfSight({ map }, burst, p);
  });
}

/** Every creature standing in an area template. */
export function unitsInArea(ctx, origin, target, shape) {
  const tiles = areaTiles(origin, target, { ...shape, ctx });
  const keys = new Set(tiles.map((t) => `${t.x},${t.y}`));
  return standingUnits(ctx).filter((u) => {
    return footprintTiles(u).some(p=>keys.has(`${p.x},${p.y}`));
  });
}

/**
 * Every enemy whose reach the mover leaves — i.e. everyone entitled to an
 * Opportunity Attack reaction. Returns [{ unit, uid, name, reach, from, to }].
 *
 * 2024 PHB: you provoke when you move out of a hostile creature's reach using your
 * movement, action, Bonus Action or Reaction. You do NOT provoke if you took the
 * Disengage action, if your movement was forced (a Push, a teleport), or if the
 * would-be attacker cannot see you, is Incapacitated, or has spent its Reaction.
 */
export function opportunityCheck(ctx, mover, from, to) {
  const out = [];
  if (!mover) return out;

  const moverCm = conditionMech(mover);
  if (moverCm.disengaged) return out;                       // took the Disengage action
  if (mover._forcedMove) return out;                        // pushed, pulled or teleported

  const A = tileOf(from ?? mover);
  const B = tileOf(to ?? mover);
  if (A.x === B.x && A.y === B.y) return out;

  for (const u of standingUnits(ctx)) {
    if (!isHostile(u, mover)) continue;
    const cm = conditionMech(u);
    if (cm.noReactions || cm.incapacitated) continue;
    if (u.flags?.reactionUsed || u._reactionUsed) continue;

    // A blinded watcher, or a target it simply cannot perceive, gets no reaction.
    const mech = mechOf(u);
    const blindsight = num(mech.blindsight) + num(mech.truesight) + num(mech.tremorsense);
    if (cm.cannotSee && blindsight < distanceFt(u, A)) continue;
    if (moverCm.unseen && blindsight < distanceFt(u, A) && !u.flags?.seeInvisible) continue;

    const reach = reachFt(u);
    const wasThreatened = distanceFt(u, { ...mover, pos:A }) <= reach;
    const stillThreatened = distanceFt(u, { ...mover, pos:B }) <= reach;
    if (wasThreatened && !stillThreatened) {
      out.push({
        unit: u, uid: u.uid, name: u.name || 'A foe', reach,
        from: A, to: B,
        reason: `${mover.name || 'The creature'} leaves ${u.name || 'a foe'}'s reach.`,
      });
    }
  }
  return out;
}

// ===========================================================================
// ADVANTAGE / DISADVANTAGE
// ===========================================================================

/** Which active conditions contribute a given mech flag — used to name reasons. */
function condSources(ch, flag) {
  const out = [];
  for (const inst of activeConditions(ch)) {
    const def = CONDITIONS[lower(inst.id)];
    if (def && def.mech && def.mech[flag]) out.push({ inst, def });
  }
  return out;
}

/** Can `watcher` perceive `subject` at all? Blindsight/truesight see the invisible. */
function canPerceive(ctx, watcher, subject) {
  if (!watcher || !subject) return true;
  const cm = conditionMech(watcher);
  const targetCm = conditionMech(subject);
  const mech = mechOf(watcher);
  const specialSight = Math.max(num(mech.blindsight), num(mech.truesight), num(mech.tremorsense));
  const dist = distanceFt(watcher, subject);
  if (specialSight >= dist && specialSight > 0) return true;
  if (watcher.flags?.seeInvisible && targetCm.unseen) return true;
  if (cm.cannotSee) return false;
  if (targetCm.unseen) return false;
  if (!lineOfSight(ctx, watcher, subject)) return false;
  return true;
}

/**
 * Gather EVERY source of Advantage and Disadvantage on one attack roll.
 *
 * Returns { adv, dis, reasons[], advReasons[], disReasons[], cancelled }.
 * `adv`/`dis` are the FINAL values: 2024 PHB says that if you have both Advantage
 * and Disadvantage from any number of sources, they cancel and you roll one d20.
 *
 * opts: { weapon, spell, ranged, range, melee, mastery, adv, dis, thrown,
 *         ability, reason, ignoreCover }
 */
export function computeAdvantage(ctx, attacker, target, opts = {}) {
  const advReasons = [];
  const disReasons = [];
  const add = (list, why) => { if (why && !list.includes(why)) list.push(why); };

  if (!attacker) return { adv: false, dis: false, reasons: [], advReasons, disReasons, cancelled: false };

  const acm = conditionMech(attacker);
  const tcm = target ? conditionMech(target) : null;
  const amech = mechOf(attacker);
  const dist = target ? distanceFt(attacker, target) : 0;
  const range = opts.range || (opts.ranged ? [80, 320] : [reachFt(attacker), reachFt(attacker)]);
  const ranged = opts.ranged != null ? !!opts.ranged : (Array.isArray(range) && range[1] > 10);
  const melee = opts.melee != null ? !!opts.melee : !ranged;
  const aName = attacker.name || 'The attacker';
  const tName = target?.name || 'the target';

  // --- caller-supplied overrides ------------------------------------------
  if (opts.adv) add(advReasons, opts.advReason || 'Advantage granted');
  if (opts.dis) add(disReasons, opts.disReason || 'Disadvantage imposed');

  // === ATTACKER'S OWN CONDITIONS ==========================================

  // Blinded, Prone, Poisoned, Restrained, Frightened, the Sap mastery…
  for (const { def, inst } of condSources(attacker, 'attackDis')) {
    // Frightened only bites while the source of the fear is in line of sight.
    if (def.id === 'frightened') {
      const src = inst.source ? findUnit(ctx, inst.source) : null;
      if (src && !lineOfSight(ctx, attacker, src)) continue;
    }
    add(disReasons, `${aName} is ${def.name}`);
  }
  // Invisible / Hidden attacker: your attack rolls have Advantage.
  for (const { def } of condSources(attacker, 'attackAdv')) {
    if (target && canPerceive(ctx, target, attacker)) continue;   // seen through: no bonus
    add(advReasons, `${aName} is ${def.name}`);
  }

  // Reckless Attack: Advantage on melee attacks using Strength.
  if (acm.recklessAttack && melee && (opts.ability || 'str') === 'str') {
    add(advReasons, `${aName} is attacking recklessly`);
  }

  // Grappled: Disadvantage on attacks against anyone but the grappler.
  if (target && acm.attackDisVsOthers.length && !acm.attackDisVsOthers.includes(target.uid)) {
    add(disReasons, `${aName} is Grappled by someone else`);
  }

  // Help: an ally has already distracted this specific target for you.
  if (target && acm.attackAdvVsTarget.includes(target.uid)) {
    add(advReasons, `${aName} was Helped against ${tName}`);
  }

  // === TARGET'S CONDITIONS ================================================
  if (target && tcm) {
    // Paralyzed, Restrained, Stunned, Unconscious, Reckless defenders…
    for (const { def } of condSources(target, 'attackedAdv')) add(advReasons, `${tName} is ${def.name}`);
    for (const { def } of condSources(target, 'advOnAttacksAgainst')) add(advReasons, `${tName} is ${def.name}`);

    // Dodging / Invisible / Hidden defenders. The Dodge benefit is lost while
    // Incapacitated or with a Speed of 0 (2024 PHB).
    for (const { def } of condSources(target, 'attackedDis')) {
      if (def.id === 'dodging' && (tcm.incapacitated || tcm.speed === 0 || tcm.immobile)) continue;
      if (def.id === 'dodging' && !canPerceive(ctx, target, attacker)) continue;  // can't dodge what it can't see
      add(disReasons, `${tName} is ${def.name}`);
    }

    // Prone: Advantage within 5 feet, Disadvantage beyond it.
    if (tcm.attackedAdvWithin5 && dist <= 5) add(advReasons, `${tName} is Prone and adjacent`);
    if (tcm.attackedDisBeyond5 && dist > 5) add(disReasons, `${tName} is Prone and out of reach`);

    // Vex mastery: the attacker earned Advantage with its previous hit.
    if (tcm.advOnAttacksBy.includes(attacker.uid)) {
      add(advReasons, `${tName} is Vexed by ${aName}`);
    }
  }

  // === PERCEPTION =========================================================
  if (target) {
    // Attacking a creature you cannot see is at Disadvantage (unless something
    // already granted it, e.g. the target being Paralyzed).
    const seen = canPerceive(ctx, attacker, target);
    if (!seen) {
      if (acm.cannotSee) add(disReasons, `${aName} cannot see`);
      else if (conditionMech(target).unseen) add(disReasons, `${tName} is unseen`);
      else add(disReasons, `${aName} has no line of sight to ${tName}`);
    }
  }

  // === RANGE ==============================================================
  if (target && ranged) {
    if (rangeBandOf(attacker, target, range) === 'long') {
      add(disReasons, `Long range (${distanceFt(attacker, target)} ft)`);
    }
    // 2024: a ranged attack is at Disadvantage if a hostile creature that can see
    // you and isn't Incapacitated is within 5 feet of you. The 2024 Crossbow Expert
    // and Sharpshooter feats each waive this for their own kind of weapon.
    const wid = lower(opts.weaponId || '');
    const wprops = arr(opts.weaponProps).map(lower);
    const firingInMelee = (hasFeat(attacker, 'crossbow-expert') && wid.includes('crossbow'))
      || (hasFeat(attacker, 'sharpshooter') && wprops.includes('ammunition'))
      || hasPassive(attacker, 'close-quarters-shooter');
    if (!firingInMelee) {
      // The creature you are shooting at counts too — being in melee at all is what
      // spoils the shot.
      for (const u of standingUnits(ctx)) {
        if (!isHostile(u, attacker)) continue;
        if (distanceFt(u, attacker) > 5) continue;
        const ucm = conditionMech(u);
        if (ucm.incapacitated) continue;
        if (!canPerceive(ctx, u, attacker)) continue;
        add(disReasons, `${u.name || 'A foe'} is within 5 ft of the shooter`);
        break;
      }
    }
  }

  // === GEAR ===============================================================
  // 2024 PHB: wearing armor you lack proficiency with gives Disadvantage on any
  // D20 Test involving Strength or Dexterity (and stops you casting spells).
  const armor = armorOf(attacker);
  if (armor && armor.category && !hasProf(attacker, 'armor', armor.category)) {
    add(disReasons, `${aName} is not proficient with ${armor.name}`);
  }

  // === FEATURES ===========================================================
  // Pack Tactics: Advantage if an ally of yours is within 5 ft of the target and
  // that ally isn't Incapacitated.
  if (target && (hasPassive(attacker, 'pack-tactics') || attacker.flags?.packTactics)) {
    for (const u of standingUnits(ctx)) {
      if (u === attacker || !isAlly(u, attacker)) continue;
      if (distanceFt(u, target) > 5) continue;
      if (conditionMech(u).incapacitated) continue;
      add(advReasons, `Pack Tactics (${u.name || 'an ally'} flanks ${tName})`);
      break;
    }
  }

  // Data-driven "Advantage against X" grants (advVs:['undead'], advVs:['charmed']).
  if (target) {
    for (const tag of amech.advVs || []) {
      const t = lower(tag);
      if (t === lower(target.type) || t === lower(target.monsterId) || hasCondition(target, t)) {
        add(advReasons, `${aName} has Advantage against ${tag}`);
      }
    }
  }

  // Flanking is NOT a 2024 default rule. Opt in with ctx.rules.flanking.
  if (target && rulesOf(ctx).flanking) {
    const A = tileOf(attacker), T = tileOf(target);
    for (const u of standingUnits(ctx)) {
      if (u === attacker || !isAlly(u, attacker)) continue;
      if (distanceFt(u, target) > reachFt(u)) continue;
      if (conditionMech(u).incapacitated) continue;
      const U = tileOf(u);
      // Opposite sides: the target sits between the two of us on a line.
      if (Math.sign(T.x - A.x) === -Math.sign(T.x - U.x) && Math.sign(T.y - A.y) === -Math.sign(T.y - U.y)
        && (T.x !== A.x || T.y !== A.y)) {
        add(advReasons, `Flanking with ${u.name || 'an ally'}`);
        break;
      }
    }
  }

  const rawAdv = advReasons.length > 0;
  const rawDis = disReasons.length > 0;
  const cancelled = rawAdv && rawDis;

  const reasons = [
    ...advReasons.map((r) => `ADV: ${r}`),
    ...disReasons.map((r) => `DIS: ${r}`),
  ];
  if (cancelled) reasons.push('Advantage and Disadvantage cancel — straight roll.');

  return {
    adv: rawAdv && !rawDis,
    dis: rawDis && !rawAdv,
    reasons, advReasons, disReasons, cancelled,
  };
}

/** Look a unit up by uid through whichever hook the ctx offers. */
function findUnit(ctx, uid) {
  if (!uid) return null;
  if (typeof ctx?.byUid === 'function') { try { return ctx.byUid(uid) || null; } catch { /* fall through */ } }
  if (typeof ctx?.unit === 'function') { try { return ctx.unit(uid) || null; } catch { /* fall through */ } }
  return unitsOf(ctx).find((u) => u.uid === uid) || null;
}

// ===========================================================================
// DICE
// ===========================================================================

/**
 * Roll a pool of dice with optional Great Weapon Fighting rerolls.
 * `reroll12` rerolls any 1 or 2 once and keeps the new result (2024 GWF).
 */
function rollPool(n, sides, r, reroll12 = false) {
  const rolls = [];
  const rerolled = [];
  for (let i = 0; i < n; i++) {
    let v = r.int(1, sides);
    if (reroll12 && v <= 2) { rerolled.push(v); v = r.int(1, sides); }
    rolls.push(v);
  }
  return { rolls, rerolled, total: rolls.reduce((a, b) => a + b, 0) };
}

/**
 * Roll one damage component and produce a breakdown entry.
 * A critical hit doubles the number of DICE only — never the flat modifier.
 */
function rollComponent({ label, dice, mod = 0, type = 'bludgeoning', crit = false, reroll12 = false, source = '', critDice = true }, r) {
  const p = parseDice(dice) || { n: 0, sides: 0, mod: 0 };
  const count = (crit && critDice) ? p.n * 2 : p.n;
  const pool = count > 0 && p.sides > 0 ? rollPool(count, p.sides, r, reroll12) : { rolls: [], rerolled: [], total: 0 };
  const total = pool.total + p.mod + mod;
  return {
    kind: 'damage', label, dice: dice || '0', source, type,
    rolls: pool.rolls, rerolled: pool.rerolled,
    mod: p.mod + mod, total, crit: !!crit && critDice && p.n > 0,
  };
}

/** Sum a breakdown array into { total, byType }. */
function sumDamage(entries) {
  let total = 0;
  const byType = {};
  for (const e of entries) {
    if (e.kind !== 'damage') continue;
    const v = Math.max(0, e.total);
    total += v;
    byType[e.type] = (byType[e.type] || 0) + v;
  }
  return { total, byType };
}

// ===========================================================================
// WEAPONS
// ===========================================================================

/** Normalise "a weapon" into the shape resolveAttack wants. Never throws. */
function normalizeWeapon(attacker, w, opts = {}) {
  if (!w) return null;

  // A weaponsOf() entry already carries everything.
  if (w.item && w.damage && typeof w.attackBonus === 'number') {
    return {
      def: w.item, inst: w.inst || null, name: w.name || w.item.name || w.item.id,
      atk: w.attackBonus, dmg: w.damage, range: w.range || [5, 5],
      ranged: !!w.ranged, mastery: w.mastery || null,
      props: arr(w.props).length ? arr(w.props) : arr(w.item.props),
    };
  }

  const def = itemDef(w);
  if (!def) return null;
  const inst = (typeof w === 'object' && w.uid) ? w : null;
  const props = arr(def.props);
  const mode = { twoHanded: !!opts.twoHanded, offHand: !!opts.offHand, thrown: !!opts.thrown };
  const ranged = !!opts.thrown || props.includes('ranged') || props.includes('ammunition')
    || (Array.isArray(def.range) && !props.includes('thrown'));
  const reach = props.includes('reach') ? 10 : 5;

  let atk = 0, dmg = { dice: def.die || '1', mod: 0, type: def.dtype || 'bludgeoning', bonusDice: [] };
  try { atk = attackBonusFor(attacker, inst || def, mode); } catch { /* half-built character */ }
  try { dmg = damageFor(attacker, inst || def, mode); } catch { /* keep the fallback */ }

  return {
    def, inst, name: def.name || def.id, atk, dmg,
    range: ranged
      ? (Array.isArray(def.range) && def.range.length ? [def.range[0], def.range[1] ?? def.range[0]] : [20, 60])
      : [reach, reach],
    ranged,
    mastery: opts.mastery !== undefined ? opts.mastery : masteryFor(attacker, def),
    props,
  };
}

/** DC for a weapon-triggered saving throw: 8 + proficiency + the attack's ability mod. */
export function weaponSaveDC(ch, ability = 'str') {
  if (!ch) return 10;
  return 8 + profBonus(ch) + abilityMod(ch, ability);
}

/** Rogue Sneak Attack dice: 1d6 at 1st level, +1d6 every odd level after. */
function sneakAttackDice(ch) {
  const lvl = classLevel(ch, 'rogue');
  if (lvl <= 0) return 0;
  return Math.ceil(lvl / 2);
}

/**
 * Does Sneak Attack apply? 2024 PHB: once per turn, with a Finesse or Ranged weapon,
 * if you have Advantage OR an ally of yours is within 5 feet of the target and you
 * don't have Disadvantage.
 */
function sneakAttackApplies(ctx, attacker, target, wpn, advDis) {
  if (sneakAttackDice(attacker) <= 0) return false;
  if (turnUses(ctx, attacker).sneak) return false;
  const props = arr(wpn?.props);
  const finesseOrRanged = props.includes('finesse') || wpn?.ranged;
  if (wpn && !finesseOrRanged) return false;
  if (advDis.dis) return false;
  if (advDis.adv) return true;
  if (!target) return false;
  for (const u of standingUnits(ctx)) {
    if (u === attacker || u === target) continue;
    if (!isAlly(u, attacker)) continue;
    if (conditionMech(u).incapacitated) continue;
    if (distanceFt(u, target) <= 5) return true;
  }
  return false;
}

/** Evasion: Rogue 7 / Monk 7 in the 2024 PHB, plus anything tagged with the passive. */
function hasEvasion(ch) {
  if (!ch) return false;
  if (hasPassive(ch, 'evasion') || ch.flags?.evasion) return true;
  return classLevel(ch, 'rogue') >= 7 || classLevel(ch, 'monk') >= 7;
}

/** Magic Resistance: Advantage on saving throws against spells and magical effects. */
function hasMagicResistance(ch) {
  if (!ch) return false;
  if (hasPassive(ch, 'magic-resistance') || ch.flags?.magicResistance) return true;
  const mech = mechOf(ch);
  if ((mech.advSaveVs || []).some((t) => ['magic', 'magical', 'spell', 'spells'].includes(lower(t)))) return true;
  return arr(ch.traits).some((t) => /magic resistance/i.test(t?.name || ''));
}

/** Legendary Resistance pool, if this creature has one. */
function legendaryPool(ch) {
  const res = ch?.resources || {};
  const pool = res.legendaryResistance || res['legendary-resistance'] || ch?.legendaryResistance;
  if (pool && typeof pool.max === 'number') return pool;
  // Fall back to a stat-block trait: "Legendary Resistance (3/Day)".
  const trait = arr(ch?.traits).find((t) => /legendary resistance/i.test(t?.name || ''));
  if (trait) {
    const m = String(trait.name).match(/(\d+)\s*\/\s*day/i);
    const max = m ? parseInt(m[1], 10) : 3;
    ch.resources = ch.resources || {};
    ch.resources.legendaryResistance = { max, used: 0, recharge: 'long' };
    return ch.resources.legendaryResistance;
  }
  return null;
}

// ===========================================================================
// resolveAttack
// ===========================================================================

/**
 * Resolve one attack, start to finish.
 *
 * opts: {
 *   weapon,                       // item id / instance / definition / weaponsOf() entry
 *   spell,                        // spell id or object, for spell attacks
 *   atkBonus, critRange,          // explicit overrides
 *   damage:{dice, mod, type, bonusDice:[{dice,type}], reroll12},
 *   adv, dis, ranged, melee, range, crit, autoHit,
 *   mastery,                      // force a weapon mastery ('vex','topple',…)
 *   onHit:[{kind:'condition',id,duration,save}|{kind:'damage',dice,type}],
 *   ammoUse, offHand, twoHanded, thrown,
 *   sneakAttack:bool|number,      // force on/off, or a fixed dice count
 *   smite:{ level, consumeSlot },
 *   cleaveTarget,                 // second creature for the Cleave mastery
 *   label,
 * }
 *
 * Returns AttackResult:
 *   { hit, crit, miss, fumble, roll, ac, cover, damage, byType, breakdown[],
 *     applied:{dealt,resisted}, effects[], log[], adv, dis, reasons[] }
 */
export function resolveAttack(ctx, attacker, target, opts = {}) {
  const r = rngOf(ctx);
  const log = [];
  const breakdown = [];
  const effects = [];

  const result = {
    ok: true, hit: false, crit: false, miss: true, fumble: false, blocked: false,
    roll: null, ac: 0, cover: 0, damage: 0, byType: {},
    breakdown, applied: { dealt: 0, resisted: 0, absorbed: 0 },
    effects, log, adv: false, dis: false, reasons: [],
    attacker: attacker?.uid || null, target: target?.uid || null,
  };

  if (!attacker || !target) { result.ok = false; return result; }
  if (isDead(target)) {
    pushLog(log, ctx, `${target.name || 'The target'} is already dead.`, 'info');
    result.ok = false;
    return result;
  }

  const aName = attacker.name || 'The attacker';
  const tName = target.name || 'the target';

  // --- 1. what are we attacking with? ------------------------------------
  const spell = opts.spell ? (typeof opts.spell === 'object' ? opts.spell : getSpell(opts.spell)) : null;
  const wpn = opts.weapon ? normalizeWeapon(attacker, opts.weapon, opts) : null;
  const label = opts.label || wpn?.name || spell?.name || 'Attack';

  const ranged = opts.ranged != null ? !!opts.ranged
    : spell ? spell.attack === 'ranged'
      : !!wpn?.ranged;
  const range = opts.range || (wpn ? wpn.range : spell ? [num(spell.range, 60), num(spell.range, 60)] : [reachFt(attacker), reachFt(attacker)]);
  const ability = opts.ability || (wpn ? attackAbility(attacker, wpn.def, opts) : null);

  // --- 2. total cover cannot be targeted at all --------------------------
  if (!opts.ignoreCover && hasTotalCover(ctx, attacker, target)) {
    result.blocked = true;
    result.ok = false;
    pushLog(log, ctx, `${tName} has total cover — ${aName} has no line of effect.`, 'miss');
    return result;
  }

  // --- 3. advantage ------------------------------------------------------
  const ad = computeAdvantage(ctx, attacker, target, {
    ...opts, ranged, melee: !ranged, range, ability: ability || 'str',
    weaponId: wpn?.def?.id || null, weaponProps: wpn?.props || [],
  });
  result.adv = ad.adv;
  result.dis = ad.dis;
  result.reasons = ad.reasons;

  // --- 4. the d20 --------------------------------------------------------
  const acm = conditionMech(attacker);
  const amech = mechOf(attacker);

  let atkBonus = num(opts.atkBonus, NaN);
  if (!Number.isFinite(atkBonus)) {
    if (wpn) atkBonus = wpn.atk;
    else if (spell) atkBonus = spellAtk(attacker, spell.id);
    else atkBonus = abilityMod(attacker, 'str') + profBonus(attacker);
  }
  // Exhaustion's -2 per level, and any condition-granted flat d20 bonus.
  const d20Mod = atkBonus + acm.d20Penalty + acm.d20Bonus;

  const bonusDice = [...acm.attackBonusDice];                 // Bless's 1d4
  if (opts.useInspiration && acm.inspirationDie) {
    bonusDice.push(acm.inspirationDie);
    consumeCondition(attacker, 'inspired', { force: true });
  }
  arr(opts.bonusDice).forEach((b) => bonusDice.push(b));

  // Improved Critical (Champion 19, Improved Critical 18) lowers the crit range.
  const critRange = num(opts.critRange, num(amech.critRange, 20));

  const roll = d20(d20Mod, {
    adv: ad.adv, dis: ad.dis, critRange, bonusDice,
    fixed: typeof opts.fixedRoll === 'number' ? opts.fixedRoll : undefined,
  }, r);
  result.roll = roll;
  breakdown.push({
    kind: 'd20', label: `${label} attack roll`, dice: '1d20',
    rolls: roll.rolls, natural: roll.natural, mod: d20Mod, total: roll.total,
    adv: ad.adv, dis: ad.dis, bonusRolls: roll.bonusRolls,
  });

  // Vex, Sap and Help are single-use riders — spend them now that the roll is made.
  consumeCondition(target, 'vexed', { source: attacker.uid });
  consumeCondition(attacker, 'sapped');
  consumeCondition(attacker, 'helped');

  // --- 5. AC, cover and hit determination --------------------------------
  const cover = opts.ignoreCover ? 0 : hasCover(ctx, attacker, target);
  const tcm = conditionMech(target);
  let ac = acOf(target) + cover + tcm.acBonus;
  result.ac = ac;
  result.cover = cover;

  const nat20 = roll.natural === 20;
  const nat1 = roll.natural === 1;
  // A natural 20 always hits and always crits; a natural 1 always misses (2024 PHB).
  let hit = opts.autoHit ? true : nat20 ? true : nat1 ? false : roll.total >= ac;
  if (hit && !nat20 && !opts.autoHit && typeof opts.onHitCheck === 'function') {
    opts.onHitCheck({ roll, ac });
    ac = acOf(target) + cover + conditionMech(target).acBonus;
    result.ac = ac;
    hit = roll.total >= ac;
  }
  let crit = nat20 || !!opts.crit || roll.crit;

  // Paralyzed / Unconscious: any hit from within 5 feet is a Critical Hit.
  if (hit && !ranged && (tcm.incomingCritWithin5 || tcm.autoCritMelee) && distanceFt(attacker, target) <= 5) {
    crit = true;
  }

  result.hit = hit;
  result.miss = !hit;
  result.crit = hit && crit;
  result.fumble = nat1;

  const reasonTail = ad.reasons.length ? ` (${ad.reasons.join('; ')})` : '';
  const coverTail = cover ? ` [+${cover} cover]` : '';
  pushLog(log, ctx,
    `${aName} attacks ${tName} with ${label}: ${roll.text} vs AC ${ac}${coverTail} — ${nat20 ? 'CRITICAL HIT!' : hit ? 'hit' : nat1 ? 'critical miss' : 'miss'}.${reasonTail}`,
    hit ? (crit ? 'crit' : 'hit') : 'miss');

  bus.emit(EV.ATTACK, { ctx, attacker, target, roll, ac, hit, crit, cover, label });

  // --- 6. a miss: Graze mastery still deals modifier damage --------------
  if (!hit) {
    bus.emit(EV.MISS, { ctx, attacker, target, roll, ac });
    const mastery = opts.mastery !== undefined ? opts.mastery : wpn?.mastery;
    if (mastery === 'graze' && wpn) {
      // 2024 Graze: on a miss, deal damage equal to the ability modifier used for the
      // attack. No dice, and only the modifier can raise it.
      const grazeAmt = Math.max(0, abilityMod(attacker, ability || 'str'));
      if (grazeAmt > 0) {
        const type = wpn.dmg?.type || wpn.def?.dtype || 'slashing';
        breakdown.push({ kind: 'damage', label: 'Graze', dice: '0', mod: grazeAmt, total: grazeAmt, type, rolls: [], rerolled: [], source: 'mastery:graze', crit: false });
        const applied = applyDamage(ctx, target, grazeAmt, type, { source: attacker, magical: isMagicalAttack(wpn, spell), label: 'Graze' });
        result.damage = grazeAmt;
        result.byType = { [type]: grazeAmt };
        result.applied = applied;
        effects.push({ kind: 'mastery', id: 'graze', amount: grazeAmt, type });
        pushLog(log, ctx, `Graze: ${tName} still takes ${applied.dealt} ${type} damage.`, 'damage');
      }
    }
    return result;
  }

  // --- 7. damage ---------------------------------------------------------
  const dmgSpec = opts.damage || wpn?.dmg || null;
  const reroll12 = !!(dmgSpec?.reroll12);
  const baseType = dmgSpec?.type || wpn?.def?.dtype || spell?.damage?.type || 'bludgeoning';

  if (dmgSpec && dmgSpec.dice) {
    breakdown.push(rollComponent({
      label, dice: dmgSpec.dice, mod: num(dmgSpec.mod), type: baseType,
      crit, reroll12, source: wpn ? 'weapon' : spell ? 'spell' : 'attack',
    }, r));
  } else if (dmgSpec && num(dmgSpec.mod)) {
    breakdown.push({ kind: 'damage', label, dice: '0', mod: num(dmgSpec.mod), total: num(dmgSpec.mod), type: baseType, rolls: [], rerolled: [], source: 'attack', crit: false });
  }

  // Vicious weapons add a flat rider on a critical; it is not doubled again.
  if(crit&&num(wpn?.def?.magic?.critBonus)>0){
    const bonus=num(wpn.def.magic.critBonus);
    breakdown.push({kind:'damage',label:'Vicious critical',dice:'0',mod:bonus,total:bonus,type:baseType,rolls:[],rerolled:[],source:'weapon',crit:false});
  }
  // Rider dice already baked into the weapon (a Flame Tongue's 2d6 fire, Hunter's
  // Mark from a mech block). These are dice, so a crit doubles them too.
  for (const b of arr(dmgSpec?.bonusDice)) {
    if (!b?.dice) continue;
    breakdown.push(rollComponent({
      label: b.label || b.name || 'Bonus damage', dice: b.dice, mod: num(b.mod),
      type: b.type || baseType, crit, source: b.source || 'rider',
    }, r));
  }

  // Condition riders that live on the TARGET and key off this attacker
  // (Hunter's Mark's "marked", Hex's "hexed").
  for (const b of tcm.bonusDamage) {
    if (b.fromUid && b.fromUid !== attacker.uid) continue;
    if (!b.dice) continue;
    breakdown.push(rollComponent({
      label: conditionName(b.condition) || 'Curse', dice: b.dice, type: b.type || 'force',
      crit, source: `condition:${b.condition}`,
    }, r));
  }

  // --- Sneak Attack ------------------------------------------------------
  const sneakForced = opts.sneakAttack;
  const sneakDice = typeof sneakForced === 'number' ? sneakForced
    : (sneakForced === false ? 0
      : (sneakForced === true || sneakAttackApplies(ctx, attacker, target, wpn, ad)) ? sneakAttackDice(attacker) : 0);
  if (sneakDice > 0) {
    turnUses(ctx, attacker).sneak = true;                     // once per turn
    breakdown.push(rollComponent({
      label: 'Sneak Attack', dice: `${sneakDice}d6`, type: baseType, crit, source: 'sneak-attack',
    }, r));
    pushLog(log, ctx, `${aName} strikes a vital spot — Sneak Attack ${sneakDice}d6!`, 'crit');
  }

  // --- Divine Smite ------------------------------------------------------
  if (opts.smite) {
    const lvl = clamp(num(opts.smite.level, 1), 1, 5);
    // 2024 Divine Smite: 2d8 radiant, +1d8 per slot level above 1st, +1d8 more if the
    // target is a Fiend or an Undead.
    const undeadOrFiend = ['undead', 'fiend'].includes(lower(target.type));
    const dice = 2 + (lvl - 1) + (undeadOrFiend ? 1 : 0);
    if (opts.smite.consumeSlot !== false) { try { spendSlot(attacker, lvl); } catch { /* no slots: still swing */ } }
    breakdown.push(rollComponent({
      label: 'Divine Smite', dice: `${dice}d8`, type: 'radiant', crit, source: 'divine-smite',
    }, r));
    pushLog(log, ctx, `${aName} channels divine wrath — Divine Smite ${dice}d8 radiant!`, 'crit');
  }

  // Extra damage packets the caller wants folded in.
  for (const extra of arr(opts.onHit)) {
    if (extra?.kind === 'damage' && extra.dice) {
      breakdown.push(rollComponent({
        label: extra.label || 'Extra damage', dice: extra.dice, type: extra.type || baseType,
        crit: extra.crits === false ? false : crit, source: 'on-hit',
      }, r));
    }
  }

  // --- 8. apply it -------------------------------------------------------
  const totals = sumDamage(breakdown);
  result.damage = totals.total;
  result.byType = totals.byType;

  const magical = isMagicalAttack(wpn, spell);
  const applied = applyDamagePackage(ctx, target, totals.byType, {
    source: attacker, crit, magical, label,
    silvered: !!wpn?.def?.silvered,
  });
  result.applied = applied;

  pushLog(log, ctx,
    `${tName} takes ${applied.dealt} damage${applied.resisted ? ` (${applied.resisted} resisted)` : ''}${crit ? ' — critical!' : ''}.`,
    crit ? 'crit' : 'damage');
  if (crit) bus.emit(EV.CRIT, { ctx, attacker, target, damage: applied.dealt });

  // --- 9. weapon mastery on-hit riders -----------------------------------
  const mastery = opts.mastery !== undefined ? opts.mastery : wpn?.mastery;
  if (mastery && wpn) {
    applyMastery(ctx, attacker, target, wpn, mastery, {
      ability: ability || 'str', dealt: applied.dealt, result, log, effects, opts, r,
    });
  }

  // --- 10. caller-declared on-hit effects (conditions, pushes, riders) ----
  for (const eff of arr(opts.onHit)) {
    if (!eff || eff.kind === 'damage') continue;
    const applied2 = applyEffect(ctx, attacker, target, eff, { log, dc: opts.dc, r });
    if (applied2) effects.push(applied2);
  }

  // --- 11. ammunition ----------------------------------------------------
  if (opts.ammoUse !== false && wpn && arr(wpn.props).includes('ammunition')) {
    const ammo = equipped(attacker, 'ammo');
    if (ammo?.id) { try { removeItem(attacker, ammo.id, 1); } catch { /* empty quiver, not fatal */ } }
  }

  return result;
}

/** Is this attack magical for the purposes of resistance to nonmagical damage? */
function isMagicalAttack(wpn, spell) {
  if (spell) return true;
  if (!wpn) return false;
  if (wpn.def?.magic) return true;
  if (wpn.inst?.enchant || wpn.inst?.plus) return true;
  return !!wpn.def?.magical;
}

/**
 * The eight 2024 weapon masteries that fire on a hit.
 * Graze is handled on the miss branch; Nick and Cleave affect the action economy,
 * so they are reported as effects for combat.js to act on.
 */
function applyMastery(ctx, attacker, target, wpn, mastery, env) {
  const { ability, dealt, log, effects, opts, r } = env;
  const aName = attacker.name || 'The attacker';
  const tName = target.name || 'the target';
  const uses = turnUses(ctx, attacker);

  switch (mastery) {
    case 'vex':
      // On a damaging hit: Advantage on your next attack against that creature,
      // before the end of your next turn.
      if (dealt > 0) {
        addCondition(target, 'vexed', { source: attacker.uid, rounds: 1, endsOn: 'source-turn-end' });
        effects.push({ kind: 'mastery', id: 'vex', target: target.uid });
        pushLog(log, ctx, `Vex: ${aName} has Advantage on its next attack against ${tName}.`, 'buff');
      }
      break;

    case 'sap':
      // The target has Disadvantage on its next attack roll before the start of
      // your next turn.
      addCondition(target, 'sapped', { source: attacker.uid, rounds: 1, endsOn: 'source-turn-end' });
      effects.push({ kind: 'mastery', id: 'sap', target: target.uid });
      pushLog(log, ctx, `Sap: ${tName} has Disadvantage on its next attack roll.`, 'debuff');
      break;

    case 'slow':
      // -10 ft Speed until the start of your next turn; it never stacks past 10 ft.
      if (dealt > 0) {
        addCondition(target, 'slow-mastery', { source: attacker.uid, rounds: 1, endsOn: 'source-turn-end' });
        effects.push({ kind: 'mastery', id: 'slow', target: target.uid, speed: -10 });
        pushLog(log, ctx, `Slow: ${tName}'s Speed drops by 10 ft.`, 'debuff');
      }
      break;

    case 'push':
      // Push a Large or smaller creature up to 10 feet straight away. No save.
      if (sizeRank(target) <= 3) {
        const moved = pushCreature(ctx, attacker, target, 10);
        effects.push({ kind: 'mastery', id: 'push', target: target.uid, distance: moved });
        if (moved > 0) pushLog(log, ctx, `Push: ${tName} is shoved ${moved} ft back.`, 'debuff');
      }
      break;

    case 'topple': {
      // Constitution save (DC 8 + the attack's ability modifier + proficiency) or Prone.
      const dc = weaponSaveDC(attacker, ability);
      const sv = resolveSave(ctx, attacker, target, {
        ability: 'con', dc, onSuccess: 'negate', reason: 'Topple', magic: false,
      });
      if (!sv.success) {
        addCondition(target, 'prone', { source: attacker.uid });
        pushLog(log, ctx, `Topple: ${tName} is knocked Prone (failed DC ${dc} CON).`, 'debuff');
      } else {
        pushLog(log, ctx, `Topple: ${tName} keeps its feet (DC ${dc} CON).`, 'info');
      }
      effects.push({ kind: 'mastery', id: 'topple', target: target.uid, save: sv, prone: !sv.success });
      break;
    }

    case 'nick':
      // The Light property's extra attack becomes part of the Attack action instead
      // of a Bonus Action. Once per turn — the encounter engine reads this flag.
      if (!uses.nick) {
        uses.nick = true;
        effects.push({ kind: 'mastery', id: 'nick', freeLightAttack: true });
      }
      break;

    case 'cleave': {
      // A second melee attack against another creature within 5 ft of the first and
      // within your reach; the extra attack adds no ability modifier to damage.
      if (uses.cleave) break;
      const second = opts.cleaveTarget || findCleaveTarget(ctx, attacker, target);
      if (!second) break;
      uses.cleave = true;
      pushLog(log, ctx, `Cleave: the blow carries on into ${second.name || 'another foe'}!`, 'hit');
      const cleaveDmg = { ...wpn.dmg, mod: Math.min(0, num(wpn.dmg?.mod)) };  // modifier only if negative
      const sub = resolveAttack(ctx, attacker, second, {
        weapon: opts.weapon, damage: cleaveDmg, mastery: null,
        label: `${wpn.name} (Cleave)`, ammoUse: false, sneakAttack: false,
      });
      effects.push({ kind: 'mastery', id: 'cleave', target: second.uid, result: sub });
      for (const l of sub.log) log.push(l);
      break;
    }

    default:
      break;   // 'graze' fires on the miss branch; unknown ids are ignored
  }
}

/** A second creature within 5 ft of the first that is also within the attacker's reach. */
function findCleaveTarget(ctx, attacker, first) {
  const reach = reachFt(attacker);
  for (const u of standingUnits(ctx)) {
    if (u === first || u === attacker) continue;
    if (!isHostile(u, attacker)) continue;
    if (distanceFt(u, first) > 5) continue;
    if (distanceFt(u, attacker) > reach) continue;
    return u;
  }
  return null;
}

/**
 * Shove a creature directly away from the pusher, stopping at walls, other
 * creatures and the map edge. Returns the distance actually moved, in feet.
 */
export function pushCreature(ctx, pusher, target, feet = 10) {
  if (!target || !pusher) return 0;
  const map = mapOf(ctx);
  const A = tileOf(pusher), B = tileOf(target);
  let dx = Math.sign(B.x - A.x), dy = Math.sign(B.y - A.y);
  if (dx === 0 && dy === 0) dx = 1;
  // A negative distance is a pull: the same line, walked toward the pusher. The
  // pusher's own square is occupied, so the pull stops in front of it.
  if (feet < 0) { dx = -dx; dy = -dy; }

  const steps = Math.max(0, Math.round(Math.abs(feet) / FEET_PER_TILE));
  let moved = 0;
  let x = B.x, y = B.y;
  for (let i = 0; i < steps; i++) {
    const nx = x + dx, ny = y + dy;
    const fits = (px, py) => footprintTiles(target,{x:px,y:py}).every(c => {
      if (ctx?._inBounds && !ctx._inBounds(c.x,c.y)) return false;
      if (ctx?._isSolid && ctx._isSolid(c.x,c.y)) return false;
      if (map) {
        if (map.inBounds && !map.inBounds(c.x,c.y)) return false;
        if (isOpaque(map,c.x,c.y) || map.solid?.(c.x,c.y)) return false;
      }
      const occupant=unitAt(ctx,c.x,c.y);
      return !occupant || occupant===target;
    });
    if (!fits(nx,ny) || (dx && dy && !fits(nx,y) && !fits(x,ny))) break;
    x = nx; y = ny; moved++;
  }
  if (moved > 0) {
    // Forced movement never provokes Opportunity Attacks.
    target._forcedMove = true;
    if (target.pos) { target.pos.x = x; target.pos.y = y; }
    else { target.x = x; target.y = y; }
    target._forcedMove = false;
  }
  return moved * FEET_PER_TILE;
}

// ===========================================================================
// resolveSave
// ===========================================================================

/**
 * Resolve one saving throw, with the damage and rider effects that hang off it.
 *
 * opts: { ability:'dex', dc, onSuccess:'half'|'none'|'negate'|'full',
 *         damage:{dice, mod, type, amount}, effects:[], magic:bool, spell,
 *         tag:'poison', area:bool, reason, adv, dis, allowEvasion, allowLegendary }
 *
 * Returns { success, roll, dc, ability, auto, legendary, damage, applied,
 *           effects[], breakdown[], log[] }.
 */
export function resolveSave(ctx, source, target, opts = {}) {
  const r = rngOf(ctx);
  const log = [];
  const breakdown = [];
  const effectsOut = [];
  const ability = lower(opts.ability || 'dex');
  const spell = opts.spell ? (typeof opts.spell === 'object' ? opts.spell : getSpell(opts.spell)) : null;
  const magic = opts.magic != null ? !!opts.magic : !!spell;

  const res = {
    ok: true, success: false, auto: false, legendary: false, roll: null,
    dc: 0, ability, damage: 0, byType: {},
    applied: { dealt: 0, resisted: 0, absorbed: 0 },
    effects: effectsOut, breakdown, log,
    adv: false, dis: false, reasons: [],
    target: target?.uid || null, source: source?.uid || null,
  };
  if (!target) { res.ok = false; return res; }

  const tName = target.name || 'The target';
  const cm = conditionMech(target);
  const mech = mechOf(target);

  // --- DC ----------------------------------------------------------------
  let dc = num(opts.dc, NaN);
  if (!Number.isFinite(dc)) {
    dc = source ? (spell ? spellDC(source) : weaponSaveDC(source, opts.saveAbility || 'str')) : 10;
  }
  res.dc = dc;

  // --- Legendary Resistance ----------------------------------------------
  // A legendary creature may choose to succeed instead of rolling. The AI spends a
  // charge only when the effect actually threatens it.
  if (opts.allowLegendary !== false) {
    const pool = legendaryPool(target);
    const threat = num(opts.damage?.amount, opts.damage?.dice ? avgExpr(opts.damage.dice) : 0);
    const worthIt = opts.forceLegendary
      || arr(opts.effects).length > 0
      || threat >= Math.max(1, (target.hp || 1) * 0.25);
    if (pool && pool.used < pool.max && worthIt) {
      pool.used++;
      res.success = true;
      res.auto = true;
      res.legendary = true;
      pushLog(log, ctx, `${tName} uses Legendary Resistance (${pool.max - pool.used} left) and succeeds.`, 'buff');
      return finishSave(ctx, source, target, res, opts, r);
    }
  }

  // --- automatic failure --------------------------------------------------
  // Paralyzed, Petrified, Stunned and Unconscious auto-fail Str and Dex saves.
  if (cm.autoFailSaves.includes(ability)) {
    res.success = false;
    res.auto = true;
    pushLog(log, ctx, `${tName} automatically fails the DC ${dc} ${ability.toUpperCase()} save.`, 'miss');
    return finishSave(ctx, source, target, res, opts, r);
  }

  // --- advantage / disadvantage ------------------------------------------
  const advReasons = [];
  const disReasons = [];
  if (opts.adv) advReasons.push(opts.advReason || 'Advantage granted');
  if (opts.dis) disReasons.push(opts.disReason || 'Disadvantage imposed');
  if (cm.saveAdv.includes(ability)) advReasons.push(`${tName} has Advantage on ${ability.toUpperCase()} saves`);
  if (cm.saveDis.includes(ability)) disReasons.push(`${tName} has Disadvantage on ${ability.toUpperCase()} saves`);
  if (magic && hasMagicResistance(target)) advReasons.push('Magic Resistance');
  for (const tag of mech.advSaveVs || []) {
    const t = lower(tag);
    if (t === lower(opts.tag) || (spell && t === lower(spell.school)) || (t === 'spell' && magic)) {
      advReasons.push(`Advantage against ${tag}`);
    }
  }
  // Blinded creatures cannot dodge what they cannot see.
  if (ability === 'dex' && cm.cannotSee && opts.sight !== false) {
    disReasons.push(`${tName} cannot see the danger`);
  }

  const adv = advReasons.length > 0 && disReasons.length === 0;
  const dis = disReasons.length > 0 && advReasons.length === 0;
  res.adv = adv; res.dis = dis;
  res.reasons = [...advReasons.map((x) => `ADV: ${x}`), ...disReasons.map((x) => `DIS: ${x}`)];

  // --- the roll ----------------------------------------------------------
  let mod = 0;
  try { mod = saveMod(target, ability); } catch { mod = abilityMod(target, ability); }
  mod += cm.d20Penalty + cm.d20Bonus;                          // exhaustion
  mod += num(cm.savePenaltyBy[ability]) + num(cm.saveBonusBy[ability]);

  // Cover adds its bonus to Dexterity saving throws against effects that come from
  // a point you can see (2024 PHB).
  let cover = 0;
  if (ability === 'dex' && source && opts.cover !== false) {
    cover = hasCover(ctx, source, target);
    mod += cover;
  }

  const roll = d20(mod, {
    adv, dis, bonusDice: cm.saveBonusDice,
    fixed: typeof opts.fixedRoll === 'number' ? opts.fixedRoll : undefined,
  }, r);
  res.roll = roll;
  res.success = roll.total >= dc;
  breakdown.push({
    kind: 'd20', label: `${ability.toUpperCase()} save`, dice: '1d20',
    rolls: roll.rolls, natural: roll.natural, mod, total: roll.total, dc, adv, dis,
  });

  pushLog(log, ctx,
    `${tName} makes a DC ${dc} ${ability.toUpperCase()} save: ${roll.text}${cover ? ` [+${cover} cover]` : ''} — ${res.success ? 'success' : 'failure'}.`,
    res.success ? 'save' : 'miss');
  bus.emit(EV.SAVE, { ctx, ch: target, source, ability, dc, roll, success: res.success, reason: opts.reason || null });

  return finishSave(ctx, source, target, res, opts, r);
}

/** Damage and rider effects shared by every exit path out of resolveSave. */
function finishSave(ctx, source, target, res, opts, r) {
  const { log, breakdown, effects } = { log: res.log, breakdown: res.breakdown, effects: res.effects };
  const tName = target.name || 'The target';
  const onSuccess = lower(opts.onSuccess || 'half');
  const dmg = opts.damage || null;

  // --- damage -------------------------------------------------------------
  if (dmg && (dmg.dice || num(dmg.amount))) {
    const type = dmg.type || 'force';
    let base = num(dmg.amount, NaN);
    if (!Number.isFinite(base)) {
      const comp = rollComponent({
        label: opts.reason || 'Effect damage', dice: dmg.dice, mod: num(dmg.mod),
        type, crit: !!opts.crit, source: 'save',
      }, r);
      breakdown.push(comp);
      base = comp.total;
    } else {
      breakdown.push({ kind: 'damage', label: opts.reason || 'Effect damage', dice: dmg.dice || '0', mod: 0, total: base, type, rolls: [], rerolled: [], source: 'save', crit: false });
    }

    let amount = base;
    if (res.success) {
      if (onSuccess === 'half') amount = Math.floor(base / 2);
      else if (onSuccess === 'full') amount = base;
      else amount = 0;                                   // 'none' / 'negate'
    }

    // Evasion: on a Dexterity save that would normally deal half damage, a success
    // deals NO damage and a failure deals half (2024 PHB, Rogue/Monk 7).
    if (res.ability === 'dex' && onSuccess === 'half' && opts.allowEvasion !== false && hasEvasion(target)) {
      amount = res.success ? 0 : Math.floor(base / 2);
      res.evasion = true;
      pushLog(log, ctx, `${tName} uses Evasion.`, 'buff');
    }

    res.damage = amount;
    if (amount > 0) {
      res.byType = { [type]: amount };
      res.applied = applyDamagePackage(ctx, target, res.byType, {
        source, magical: opts.magic !== false, label: opts.reason || 'Effect',
      });
      pushLog(log, ctx, `${tName} takes ${res.applied.dealt} ${type} damage.`, 'damage');
    } else if (base > 0) {
      pushLog(log, ctx, `${tName} avoids the damage entirely.`, 'save');
    }
  }

  // --- rider effects ------------------------------------------------------
  // On a successful save, only effects flagged `onSuccess:true` still land.
  for (const eff of arr(opts.effects)) {
    if (!eff) continue;
    if (res.success && !eff.onSuccess) continue;
    const applied = applyEffect(ctx, source, target, eff, { log, dc: res.dc, r, ctxRef: ctx });
    if (applied) effects.push(applied);
  }

  return res;
}

// ===========================================================================
// CHECKS
// ===========================================================================

/**
 * An ability check, optionally with a skill.
 * opts: { skill, dc, adv, dis, needs:'sight'|'hearing', bonus, reason, expertise }
 * Returns { roll, total, success, dc, mod, adv, dis, reasons[], auto, log[] }.
 */
export function abilityCheck(ctx, ch, ability, opts = {}) {
  const r = rngOf(ctx);
  const log = [];
  const ab = lower(opts.skill ? (SKILLS[opts.skill]?.ability || ability) : ability) || 'dex';
  const out = {
    roll: null, total: 0, success: false, dc: num(opts.dc, 10), mod: 0,
    adv: false, dis: false, reasons: [], auto: false, log, ability: ab, skill: opts.skill || null,
  };
  if (!ch) return out;

  const cm = conditionMech(ch);
  const name = ch.name || 'The creature';

  // Blinded auto-fails sight-based checks; Deafened auto-fails hearing-based ones.
  const needs = lower(opts.needs || '');
  if (needs && cm.autoFailChecks.includes(needs)) {
    out.auto = true;
    out.success = false;
    pushLog(log, ctx, `${name} automatically fails the check — it cannot ${needs === 'sight' ? 'see' : 'hear'}.`, 'miss');
    return out;
  }

  const advReasons = [];
  const disReasons = [];
  if (opts.adv) advReasons.push(opts.advReason || 'Advantage');
  if (opts.dis) disReasons.push(opts.disReason || 'Disadvantage');
  if (cm.advOnAbilityChecks) advReasons.push('a beneficial condition');
  if (cm.disOnAbilityChecks) {
    const src = condSources(ch, 'disOnAbilityChecks')[0];
    disReasons.push(src ? `${name} is ${src.def.name}` : 'a hindering condition');
  }
  if (cm.advCheckAbility.includes(ab)) advReasons.push(`Advantage on ${ab.toUpperCase()} checks`);
  if (cm.disCheckAbility.includes(ab)) disReasons.push(`Disadvantage on ${ab.toUpperCase()} checks`);

  let mod = 0;
  if (opts.skill && SKILLS[opts.skill]) {
    const sm = skillMod(ch, opts.skill);
    mod = sm.mod;
    if (sm.adv) advReasons.push(`Advantage on ${SKILLS[opts.skill].name}`);
  } else {
    mod = abilityMod(ch, ab);
    if (opts.proficient) mod += profBonus(ch);
  }
  mod += num(opts.bonus) + cm.d20Penalty + cm.d20Bonus;

  const adv = advReasons.length > 0 && disReasons.length === 0;
  const dis = disReasons.length > 0 && advReasons.length === 0;
  out.adv = adv; out.dis = dis; out.mod = mod;
  out.reasons = [...advReasons.map((x) => `ADV: ${x}`), ...disReasons.map((x) => `DIS: ${x}`)];

  const roll = d20(mod, {
    adv, dis, bonusDice: cm.checkBonusDice,
    fixed: typeof opts.fixedRoll === 'number' ? opts.fixedRoll : undefined,
  }, r);
  out.roll = roll;
  out.total = roll.total;
  out.success = roll.total >= out.dc;
  out.margin = roll.total - out.dc;

  const what = opts.skill ? (SKILLS[opts.skill]?.name || opts.skill) : ab.toUpperCase();
  pushLog(log, ctx,
    `${name} rolls ${what}: ${roll.text}${opts.dc != null ? ` vs DC ${out.dc} — ${out.success ? 'success' : 'failure'}` : ''}.`,
    out.success ? 'save' : 'info');

  return out;
}

/**
 * A contested check: both creatures roll, the higher total wins.
 * A tie means nothing changes, so the initiator (`a`) loses ties — 5e's rule.
 * Returns the full detail; `contestedCheck` returns just the boolean.
 */
export function contestedCheckDetailed(ctx, a, b, skillA = 'athletics', skillB = 'athletics') {
  const log = [];
  const rollA = abilityCheck(ctx, a, SKILLS[skillA]?.ability || 'str', { skill: skillA });
  const rollB = abilityCheck(ctx, b, SKILLS[skillB]?.ability || 'str', { skill: skillB });
  log.push(...rollA.log, ...rollB.log);
  const win = rollA.total > rollB.total;
  pushLog(log, ctx,
    `${a?.name || 'A'} ${rollA.total} vs ${b?.name || 'B'} ${rollB.total} — ${win ? (a?.name || 'the challenger') + ' wins' : (b?.name || 'the defender') + ' holds'}.`,
    win ? 'hit' : 'miss');
  return { win, rollA, rollB, log };
}

/** The 2024 Shove and Grapple actions are opposed checks. Ties favour the defender. */
export function contestedCheck(ctx, a, b, skillA = 'athletics', skillB = 'athletics') {
  return contestedCheckDetailed(ctx, a, b, skillA, skillB).win;
}

/**
 * The Grapple action: Athletics versus the target's Athletics or Acrobatics
 * (the defender's choice — we take whichever is better for it).
 */
export function grappleAction(ctx, grappler, target, opts = {}) {
  const log = [];
  if (!grappler || !target) return { ok: false, success: false, log };
  // Larger than you by two sizes or more and you cannot grapple it at all.
  if (sizeRank(target) - sizeRank(grappler) >= 2) {
    pushLog(log, ctx, `${target.name || 'The target'} is far too large to grapple.`, 'miss');
    return { ok: false, success: false, log };
  }
  const defSkill = bestSkill(target, ['athletics', 'acrobatics']);
  const res = contestedCheckDetailed(ctx, grappler, target, opts.skill || 'athletics', defSkill);
  log.push(...res.log);
  if (res.win) {
    addCondition(target, 'grappled', { source: grappler.uid });
    pushLog(log, ctx, `${target.name} is Grappled by ${grappler.name}.`, 'debuff');
  }
  return { ok: true, success: res.win, rolls: res, log };
}

/** The Shove action: knock Prone, or push 5 feet. */
export function shoveAction(ctx, shover, target, opts = {}) {
  const log = [];
  if (!shover || !target) return { ok: false, success: false, log };
  if (sizeRank(target) - sizeRank(shover) >= 2) {
    pushLog(log, ctx, `${target.name || 'The target'} is far too large to shove.`, 'miss');
    return { ok: false, success: false, log };
  }
  const defSkill = bestSkill(target, ['athletics', 'acrobatics']);
  const res = contestedCheckDetailed(ctx, shover, target, opts.skill || 'athletics', defSkill);
  log.push(...res.log);
  let pushed = 0;
  if (res.win) {
    if (opts.mode === 'push') {
      pushed = pushCreature(ctx, shover, target, 5);
      pushLog(log, ctx, `${target.name} is shoved ${pushed} ft back.`, 'debuff');
    } else {
      addCondition(target, 'prone', { source: shover.uid });
      pushLog(log, ctx, `${target.name} is knocked Prone.`, 'debuff');
    }
  }
  return { ok: true, success: res.win, prone: res.win && opts.mode !== 'push', pushed, rolls: res, log };
}

/** Whichever of several skills a creature is best at. */
function bestSkill(ch, list) {
  let best = list[0];
  let bestMod = -99;
  for (const s of list) {
    const m = skillMod(ch, s)?.mod ?? -99;
    if (m > bestMod) { bestMod = m; best = s; }
  }
  return best;
}

// ===========================================================================
// DAMAGE & HEALING
// ===========================================================================

/**
 * Apply a single packet of damage, honouring condition damage multipliers,
 * resistance/vulnerability/immunity (in character.js) and Concentration.
 *
 * opts: { source, crit, magical, silvered, label, deferConcentration, ignoreResistance }
 * Returns { dealt, resisted, absorbed, dead, downed, hp, concentration }.
 */
/**
 * Force-end Concentration after its owner hit 0 hit points.
 *
 * character.js clears `ch.concentration` outright when a creature dies, which would
 * make a later breakConcentration() a no-op and strand the spell's conditions on
 * every creature it was riding (a dead ranger's Hunter's Mark would never come off).
 * Put the snapshot back so the real teardown — which walks the tracked targets and
 * strips the spell's effects from each — can run.
 */
function teardownConcentration(ctx, target, priorConc, why = 'dropped to 0 hit points') {
  if (!target) return false;
  if (!target.concentration && priorConc) target.concentration = priorConc;
  const conc = target.concentration;
  if (!conc) return false;

  const spellId = conc.spellId || null;
  const ok = breakConcentration(target, why);

  // Belt and braces. breakConcentration resolves its targets from the live cache
  // spellcasting.js fills in at cast time, which is empty for a character rebuilt
  // from a save file — only the uids survive serialisation. Sweep this encounter's
  // units for anything still keyed to the fallen caster's spell so a dead ranger's
  // Hunter's Mark can never be stranded on a monster forever.
  for (const u of standingUnits(ctx)) {
    if (!u || u === target) continue;
    for (const inst of activeConditions(u).slice()) {
      if ((inst.source ?? null) !== target.uid) continue;
      if (!(inst.concentration || (spellId && inst.spellId === spellId))) continue;
      removeCondition(u, inst.id, { source: inst.source, silent: true });
    }
  }
  return ok;
}

export function applyDamage(ctx, target, amount, type = 'bludgeoning', opts = {}) {
  const out = { dealt: 0, resisted: 0, absorbed: 0, dead: false, downed: false, hp: target?.hp ?? 0, type };
  if (!target) return out;

  let amt = Math.max(0, Math.floor(num(amount)));
  if (amt <= 0 && !opts.force) return out;

  // Petrified halves everything; a hex might double it. Conditions are not merged
  // into mechOf(), so this multiplier has to be applied here.
  const cm = conditionMech(target);
  if (cm.dmgTakenMult !== 1) amt = Math.floor(amt * cm.dmgTakenMult);

  // Snapshot the Concentration record before character.js gets a chance to null it
  // (it does that when the creature dies), so the teardown below can still see which
  // spell was running and who it was riding on.
  const wasConcentrating = isConcentrating(target);
  const priorConcentration = target.concentration || null;
  const res = characterDamage(target, amt, type, {
    magical: !!opts.magical, silvered: !!opts.silvered, crit: !!opts.crit,
    source: opts.source?.uid || opts.source || null,
    ignoreResistance: !!opts.ignoreResistance,
  });

  Object.assign(out, res);

  // Elemental interactions: a blast of cold puts out the flames.
  if (out.dealt > 0) {
    for (const inst of activeConditions(target).slice()) {
      const def = CONDITIONS[lower(inst.id)];
      if (def && arr(def.endedBy).includes(lower(type))) removeCondition(target, inst.id, { source: inst.source, silent: true });
    }
  }

  // Concentration. Dropping to 0 hit points ends Concentration OUTRIGHT — there is
  // no save to make. (2024 PHB: at 0 hit points you gain the Unconscious condition,
  // and being Incapacitated ends Concentration.) Any other damage calls for a
  // Constitution save against DC 10 or half the damage taken, whichever is higher.
  // character.js nulls `concentration` when the creature dies, but the spell's
  // conditions are still hanging on every target it was riding, so tear it down
  // properly rather than just dropping the field.
  // (concentrationCheck itself fires EV.CONCENTRATION_BREAK when the save fails.)
  if (!opts.deferConcentration && wasConcentrating && out.dealt > 0) {
    if (out.dead || out.downed || target.hp <= 0) {
      out.concentration = { ok: false, success: false, broke: true, auto: true, dc: 0, roll: null };
      teardownConcentration(ctx, target, priorConcentration, out.dead ? 'died' : 'dropped to 0 hit points');
    } else {
      out.concentration = concentrationCheck(target, out.dealt, { rng: rngOf(ctx) });
    }
  }

  if (out.dead) bus.emit(EV.DEATH, { ctx, ch: target, uid: target.uid, killer: opts.source?.uid || null });
  return out;
}

/**
 * Apply a whole attack's worth of damage — one packet per damage type so each type
 * meets the right resistance — then make a single Concentration check on the total.
 */
function applyDamagePackage(ctx, target, byType, opts = {}) {
  const out = { dealt: 0, resisted: 0, absorbed: 0, dead: false, downed: false, byType: {}, hp: target?.hp ?? 0 };
  if (!target) return out;

  for (const [type, amount] of Object.entries(byType || {})) {
    if (!(amount > 0)) continue;
    const res = applyDamage(ctx, target, amount, type, { ...opts, deferConcentration: true });
    out.dealt += res.dealt;
    out.resisted += res.resisted;
    out.absorbed += res.absorbed;
    out.byType[type] = res.dealt;
    out.dead = out.dead || res.dead;
    out.downed = res.downed;
    out.hp = res.hp;
    if (res.dead) break;                       // stop hitting a corpse
  }

  if (out.dealt > 0 && isConcentrating(target)) {
    out.concentration = concentrationCheck(target, out.dealt, { rng: rngOf(ctx) });
  }
  return out;
}

/**
 * Heal a creature. Magical healing also stops bleeding and lifts the dying /
 * stabilised / unconscious bookkeeping once the target is above 0 hit points.
 */
export function healTarget(ctx, target, amount, opts = {}) {
  const out = { healed: 0, hp: target?.hp ?? 0, revived: false, log: [] };
  if (!target) return out;

  const cm = conditionMech(target);
  if (cm.cannotHeal && !opts.force) {
    pushLog(out.log, ctx, `${target.name || 'The target'} cannot be healed right now.`, 'miss');
    return out;
  }
  if (isDead(target) && !opts.revive) {
    pushLog(out.log, ctx, `${target.name || 'The target'} is beyond healing.`, 'miss');
    return out;
  }

  const wasDown = target.hp <= 0;
  const healed = characterHeal(target, Math.max(0, Math.floor(num(amount))));
  out.healed = healed;
  out.hp = target.hp;

  if (healed > 0) {
    // Magical healing closes open wounds.
    for (const inst of activeConditions(target).slice()) {
      const def = CONDITIONS[lower(inst.id)];
      if (def && arr(def.endedBy).includes('healing')) removeCondition(target, inst.id, { source: inst.source, silent: true });
    }
    if (wasDown && target.hp > 0) {
      out.revived = true;
      removeCondition(target, 'dying');
      removeCondition(target, 'stabilised');
      removeCondition(target, 'unconscious');
      pushLog(out.log, ctx, `${target.name} is back on their feet with ${target.hp} hit points!`, 'heal');
    } else {
      pushLog(out.log, ctx, `${target.name} regains ${healed} hit points.`, 'heal');
    }
  }
  return out;
}

/** Temporary hit points never stack — the bigger pool simply replaces the smaller. */
export function grantTempHp(ctx, target, amount) {
  const gained = addTempHp(target, amount);
  if (gained > 0 && typeof ctx?.log === 'function') ctx.log(`${target.name} gains ${gained} temporary hit points.`, 'buff');
  return gained;
}

// ===========================================================================
// EFFECT RIDERS
// ===========================================================================

/**
 * Apply one declarative effect from a spell, item or monster action.
 * Recognised kinds: 'condition', 'damage', 'heal', 'temphp', 'shield', 'push',
 * 'forcedMove', 'cure', 'buff', 'debuff'. Anything else is returned untouched so
 * combat.js can act on it.
 */
export function applyEffect(ctx, source, target, eff, env = {}) {
  if (!eff || !target) return null;
  const r = env.r || rngOf(ctx);
  const log = env.log || [];
  const kind = lower(eff.kind || 'condition');
  const tName = target.name || 'The target';

  switch (kind) {
    case 'condition': {
      const id = lower(eff.id || eff.condition);
      if (!CONDITIONS[id]) return null;                // unknown ids are ignored, never thrown
      const inst = addCondition(target, id, {
        source: source?.uid || eff.source || null,
        duration: eff.duration,
        rounds: eff.rounds,
        level: eff.level,
        dc: eff.dc ?? env.dc,
        save: eff.save,
        spellId: eff.spellId || null,
        concentration: !!eff.concentration,
        data: eff.data || null,
      });
      if (inst) pushLog(log, ctx, `${tName} is ${conditionName(id)}.`, 'debuff');
      else pushLog(log, ctx, `${tName} is immune to ${conditionName(id)}.`, 'info');
      return inst ? { kind: 'condition', id, target: target.uid, applied: !!inst } : null;
    }

    case 'damage': {
      const comp = rollComponent({
        label: eff.label || 'Effect', dice: eff.dice || '0', mod: num(eff.mod),
        type: eff.type || 'force', crit: false, source: 'effect',
      }, r);
      const applied = applyDamage(ctx, target, comp.total, comp.type, { source, magical: eff.magical !== false });
      pushLog(log, ctx, `${tName} takes ${applied.dealt} ${comp.type} damage.`, 'damage');
      return { kind: 'damage', amount: applied.dealt, type: comp.type, target: target.uid, breakdown: comp };
    }

    case 'heal': {
      const amt = eff.dice ? rollExpr(eff.dice, r).total : num(eff.amount);
      const h = healTarget(ctx, target, amt);
      log.push(...h.log);
      return { kind: 'heal', amount: h.healed, target: target.uid };
    }

    case 'temphp': {
      const amt = eff.dice ? rollExpr(eff.dice, r).total : num(eff.amount);
      const gained = addTempHp(target, amt);
      if (gained) pushLog(log, ctx, `${tName} gains ${gained} temporary hit points.`, 'buff');
      return { kind: 'temphp', amount: gained, target: target.uid };
    }

    case 'shield': {
      // Two very different spells share this kind. The Shield reaction is a flat
      // +5 for one round and is modelled as the `shielded` condition. Mage Armor
      // hands over an AC *formula* that lasts eight hours — routing that through
      // `shielded` threw the formula away and left the wizard in an AC 10 robe,
      // so anything carrying a `mech` block is applied as the buff it really is.
      if (eff.mech) {
        if (!Array.isArray(target.effects)) target.effects = [];
        target.effects.push({
          id: eff.id || 'shield', name: eff.name || 'Magical ward',
          dur: eff.rounds ?? roundsFor(eff.duration),
          mech: eff.mech, source: source?.uid || null,
          concentration: !!eff.concentration, spellId: eff.spellId || null,
        });
        // A condition is read live through conditionMech; a pushed effect is
        // not. Without this the ward sits in the list granting nothing.
        target._mech = null;
        try { recalc(target); } catch (e) { /* a stat block without a sheet */ }
        pushLog(log, ctx, `${tName} is warded by ${eff.name || 'a spell'}.`, 'buff');
        return { kind: 'buff', target: target.uid, id: eff.id || 'shield' };
      }
      addCondition(target, 'shielded', { source: source?.uid || null, rounds: num(eff.rounds, 1) });
      return { kind: 'shield', target: target.uid, ac: num(eff.ac, 5) };
    }

    case 'push':
    case 'forcedmove': {
      // Spell data writes { kind:'forcedMove', tag:'push'|'pull'|'flee'|'directed' }.
      // Everything but a pull moves the target directly away from the source;
      // 'speed' means the target's own Speed (Fear, Command: Flee).
      const tag = lower(eff.tag || 'push');
      let feet = eff.distance === 'speed' ? num(target.speed, 30) : num(eff.distance, 10);
      if (tag === 'pull') feet = -feet;
      const moved = pushCreature(ctx, source, target, feet);
      if (moved) pushLog(log, ctx, `${tName} is ${tag === 'pull' ? 'pulled' : 'pushed'} ${moved} ft.`, 'debuff');
      return { kind: 'push', target: target.uid, distance: moved, tag };
    }

    case 'cure': {
      // Lesser/Greater Restoration, Heal, Remove Curse: lift up to `count` of the
      // listed conditions the target actually has. Exhaustion is a level, not a
      // flag, so it is reduced by `mech.reduceExhaustion` (1 by default).
      const max = Math.max(1, num(eff.count, 1));
      const cured = [];
      for (const c of arr(eff.conditions)) {
        if (cured.length >= max) break;
        const id = lower(c);
        if (id === 'exhaustion') {
          if (exhaustionLevel(target) <= 0) continue;
          reduceExhaustion(target, Math.max(1, num(eff.mech?.reduceExhaustion, 1)));
          cured.push('Exhaustion');
          continue;
        }
        if (!hasCondition(target, id)) continue;
        if (removeCondition(target, id)) cured.push(conditionName(id));
      }
      if (cured.length) pushLog(log, ctx, `${tName} is cured of ${cured.join(' and ')}.`, 'heal');
      else pushLog(log, ctx, `${tName} has nothing to cure.`, 'info');
      return { kind: 'cure', target: target.uid, cured };
    }

    case 'buff': {
      // A freeform effect block that character.js's mech merge understands.
      if (!Array.isArray(target.effects)) target.effects = [];
      target.effects.push({
        id: eff.id || 'buff', name: eff.name || 'Magical effect',
        dur: eff.rounds ?? roundsFor(eff.duration),
        mech: eff.mech || null, source: source?.uid || null,
        concentration: !!eff.concentration, spellId: eff.spellId || null,
      });
      target._mech = null;                     // force the merge to rebuild
      try { recalc(target); } catch (e) { /* a stat block without a sheet */ }
      pushLog(log, ctx, `${tName} is affected by ${eff.name || 'a spell'}.`, 'buff');
      return { kind: 'buff', target: target.uid, id: eff.id || 'buff' };
    }

    case 'debuff': {
      // Same shape as a buff (a mech block the character merge understands) but
      // hostile, so it sits on the TARGET keyed to the caster: breakConcentration
      // strips every effect whose `source` is the caster and which is flagged
      // `concentration` (or carries the spell's id), which is exactly this record.
      if (!Array.isArray(target.effects)) target.effects = [];
      const dur = eff.rounds ?? roundsFor(eff.duration);
      target.effects.push({
        id: eff.id || 'debuff', name: eff.name || 'Hostile magic',
        dur, mech: eff.mech || null, source: source?.uid || null,
        concentration: !!eff.concentration, spellId: eff.spellId || null,
        hostile: true, save: eff.save || null, dc: eff.dc ?? env.dc ?? null,
      });
      target._mech = null;
      try { recalc(target); } catch (e) { /* a stat block without a sheet */ }
      pushLog(log, ctx, `${tName} is ${eff.name ? `afflicted by ${eff.name}` : 'afflicted'}.`, 'debuff');
      return { kind: 'debuff', target: target.uid, id: eff.id || 'debuff', name: eff.name || null, dur };
    }

    default:
      return { kind, target: target.uid, unhandled: true, effect: eff };
  }
}

/** Apply a list of effects to a list of targets. Convenience for combat.js. */
export function applyEffects(ctx, source, targets, effects, env = {}) {
  const out = [];
  for (const t of arr(targets)) {
    for (const e of arr(effects)) {
      const res = applyEffect(ctx, source, t, e, env);
      if (res) out.push(res);
    }
  }
  return out;
}

// ===========================================================================
// MISC
// ===========================================================================

/** The DC for a saving throw this creature forces with a spell. */
export function saveDCFor(ch, opts = {}) {
  if (!ch) return 10;
  if (opts.weapon) return weaponSaveDC(ch, opts.ability || 'str');
  try { return spellDC(ch); } catch { return 8 + profBonus(ch) + abilityMod(ch, opts.ability || 'cha'); }
}

/** Roll initiative: a Dexterity check, plus every bonus the character has earned. */
export function rollInitiative(ctx, ch) {
  const r = rngOf(ctx);
  const cm = conditionMech(ch);
  const mech = mechOf(ch);
  let mod = num(ch?.initiative, abilityMod(ch, 'dex'));
  mod += cm.d20Penalty + cm.d20Bonus;
  // Invisible creatures roll initiative with Advantage (2024 PHB).
  const roll = d20(mod, { adv: cm.initiativeAdv, bonusDice: cm.checkBonusDice }, r);
  // Ties break toward the higher Dexterity, then the roll itself.
  return { roll, total: roll.total, tiebreak: abilityScore(ch, 'dex') + num(mech.initiativeBonus) / 100 };
}

/** Everything an area template would catch, split into friends and foes. */
export function splitByAllegiance(ctx, caster, units) {
  const allies = [], foes = [];
  for (const u of arr(units)) (isHostile(u, caster) ? foes : allies).push(u);
  return { allies, foes };
}

/** A short human-readable summary of an AttackResult, for the log or a tooltip. */
export function describeAttack(res) {
  if (!res || !res.ok) return 'No attack.';
  if (res.blocked) return 'Blocked by total cover.';
  if (!res.hit) return `Miss (${res.roll?.total ?? '?'} vs AC ${res.ac}).`;
  return `${res.crit ? 'Critical hit' : 'Hit'} for ${res.applied.dealt} damage (${res.roll?.total} vs AC ${res.ac}).`;
}
