// rules/ai.js — monster and companion tactical AI. Turns a battlefield state into an
// ordered list of Plans that combat.js executes on a creature's turn.
//
// Design contract:
//   * Headless and side-effect free. `takeTurn` never mutates the encounter; it only
//     reads it and returns Plan[]. combat.js decides what actually happens.
//   * Plan: { kind:'move', path, to } | { kind:'action', optionId, target } | { kind:'end' }
//     `target` is { unit } for creature targets and { x, y } for points/areas.
//   * Never guess an option id. Everything the AI can do comes back from
//     `enc.availableActions(unit)`; we classify those options and pick between them.
//   * Deterministic. The "jitter" that stops fights feeling robotic is hashed from
//     (seed, round, uid) rather than drawn from the encounter RNG, so scoring a target
//     twice gives the same answer and never desyncs the combat dice stream.
//   * Defensive by contract: a half-built encounter, a missing map, an unknown option
//     shape or an empty bestiary must degrade to "end turn", never throw.
//
// 2024 PHB rules that shape the tactics are commented where they bite.

import { makeRNG, hashStr } from '../core/rng.js';
import { avgExpr } from '../core/dice.js';
import { getSpell, rangeFeet, spellDamageDice } from '../data/spells.js';
import {
  distanceFt, tileOf, reachFt, lineOfSight, hasTotalCover, hasCover,
  unitsInArea, unitAt, isHostile, isAlly,
} from './actions.js';
import { isAlive, isDown, abilityMod, acOf, mechOf, weaponsOf, profBonus } from './character.js';
import { hasCondition, conditionMech } from './conditions.js';
import { isConcentrating } from './spellcasting.js';
import { bus, EV } from '../core/events.js';
import { FEET_PER_TILE, clamp } from '../constants.js';

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

const arr = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const lower = (s) => String(s == null ? '' : s).toLowerCase();
const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const keyOf = (x, y) => `${x},${y}`;

/** Every archetype the bestiary may name in `monster.ai.archetype`. */
export const ARCHETYPES = Object.freeze([
  'brute', 'skirmisher', 'archer', 'caster', 'support', 'ambusher', 'swarm', 'tank', 'boss',
]);

/** What an `ai` block looks like when a stat block forgets to supply one. */
export const DEFAULT_AI = Object.freeze({
  archetype: 'brute', aggression: 0.6, selfPreserve: 0.3, preferredRange: 5,
});

/**
 * Creature types that never rout. Undead are driven, constructs and oozes have no
 * survival instinct, and zealots (cultists, fanatics, sworn guardians) would rather
 * die. A stat block can force it either way with `ai.neverFlee` / `ai.canFlee`.
 */
export const NEVER_FLEE_TYPES = Object.freeze(new Set(['undead', 'construct', 'ooze', 'plant']));
const ZEALOT_FACTIONS = Object.freeze(new Set(['cult-dragon', 'zealot', 'cultist']));

/** Tunable weights. Kept in one object so the whole feel can be dialled from here. */
export const WEIGHTS = Object.freeze({
  reachable: 26,        // target can actually be attacked this turn
  wounded: 30,          // finish what is already bleeding
  killingBlow: 45,      // this attack probably drops them
  threat: 34,           // they have been hurting us
  squishy: 26,          // low AC / low HP / caster
  concentration: 20,    // break the painful spell
  distance: 0.10,       // per foot away
  downed: -70,          // do not maul the unconscious while anyone stands
  jitter: 5,            // deterministic noise so fights are not robotic
  tileAttack: 120,      // a tile we can attack from is worth almost anything
  tileThreat: 9,        // each enemy that threatens the tile
  tileCover: 4,         // per point of AC the cover is worth
  tileRange: 2.2,       // per foot away from our preferred band
  tileCost: 0.04,       // mild preference for not sprinting across the map
});

const BLOODIED = 0.5;   // 5e shorthand: at or below half hit points

// ---------------------------------------------------------------------------
// Threat memory — "who has been hurting me and mine"
// ---------------------------------------------------------------------------
//
// Threat is stored per-encounter in a WeakMap so it dies with the fight and never
// reaches a save file. combat.js can call `noteDamage` for exact accounting; we also
// listen to the attack bus so the AI still has opinions if nobody wires it up.

const THREAT = new WeakMap();

function threatTable(enc) {
  if (!enc || typeof enc !== 'object') return null;
  let t = THREAT.get(enc);
  if (!t) { t = { round: num(enc.round, 0), by: new Map() }; THREAT.set(enc, t); }
  // Threat fades: each new round the ledger is worth 40% less, so a creature that
  // stops swinging stops being the priority.
  const round = num(enc.round, 0);
  if (round !== t.round) {
    const decay = Math.pow(0.6, Math.max(1, round - t.round));
    for (const [k, rec] of t.by) {
      rec.total *= decay;
      for (const vk of Object.keys(rec.byVictim)) rec.byVictim[vk] *= decay;
      if (rec.total < 0.5) t.by.delete(k);
    }
    t.round = round;
  }
  return t;
}

/** Record that `source` dealt `amount` damage to `target`. combat.js may call this. */
export function noteDamage(enc, source, target, amount) {
  const t = threatTable(enc);
  if (!t || !source || !target || !(amount > 0)) return;
  const uid = source.uid || source;
  let rec = t.by.get(uid);
  if (!rec) { rec = { total: 0, byVictim: {} }; t.by.set(uid, rec); }
  rec.total += amount;
  const vk = target.uid || String(target);
  rec.byVictim[vk] = (rec.byVictim[vk] || 0) + amount;
}

/**
 * How much `observer` should hate `attacker`: damage done to the observer counts
 * double, damage done to its allies counts once.
 */
export function threatOf(enc, observer, attacker) {
  const t = threatTable(enc);
  if (!t || !attacker) return 0;
  const rec = t.by.get(attacker.uid || attacker);
  if (!rec) return 0;
  const mine = rec.byVictim[observer?.uid] || 0;
  return rec.total + mine;         // total already includes `mine` once, so this doubles it
}

/** Drop everything the AI remembers about an encounter. */
export function resetThreat(enc) { if (enc) THREAT.delete(enc); }

// A best-effort fallback: EV.ATTACK carries the encounter as `ctx`, so even a UI that
// never calls noteDamage still builds a threat picture from landed blows.
bus.on(EV.ATTACK, (p) => {
  if (!p || !p.hit || !p.ctx || !p.attacker || !p.target) return;
  const est = estimateDamage(p.attacker) * (p.crit ? 2 : 1);
  noteDamage(p.ctx, p.attacker, p.target, est || 1);
});

// ---------------------------------------------------------------------------
// Deterministic jitter
// ---------------------------------------------------------------------------

/**
 * A repeatable pseudo-random number in [-amount, +amount] for a (encounter, unit, key)
 * triple. Two calls in the same round give the same answer, so scoring is stable, but
 * the numbers change from round to round and creature to creature.
 */
export function jitter(enc, unit, key, amount = 1) {
  const seed = `${num(enc?.seed, 0)}|${num(enc?.round, 0)}|${unit?.uid || 'u'}|${key}`;
  const r = makeRNG(hashStr(seed));
  return (r.next() * 2 - 1) * amount;
}

// ---------------------------------------------------------------------------
// Reading the battlefield
// ---------------------------------------------------------------------------

/** Everyone still on the field — a creature that fled (`_fled`) no longer exists to the AI. */
function unitsOf(enc) { return Array.isArray(enc?.units) ? enc.units.filter((u) => u && !u._fled) : []; }

/** Is this creature capable of doing anything at all right now? */
function canAct(unit) {
  if (!unit || !isAlive(unit)) return false;
  const cm = conditionMech(unit);
  return !cm.noActions && !cm.incapacitated;
}

/** The creature's `ai` block, with every field defaulted. */
export function aiBlock(unit) {
  const a = unit?.ai || {};
  return {
    archetype: ARCHETYPES.includes(lower(a.archetype)) ? lower(a.archetype) : DEFAULT_AI.archetype,
    aggression: clamp(num(a.aggression, DEFAULT_AI.aggression), 0, 1),
    selfPreserve: clamp(num(a.selfPreserve, DEFAULT_AI.selfPreserve), 0, 1),
    preferredRange: num(a.preferredRange, DEFAULT_AI.preferredRange),
    neverFlee: !!a.neverFlee,
    canFlee: a.canFlee !== false,
    protect: a.protect || null,
    auto: !!a.auto,
  };
}

function creatureTypeOf(u) {
  return lower(u?.creatureType || u?.monsterType || u?.type || (u?.kind === 'monster' ? 'humanoid' : 'humanoid'));
}

/** Will this creature ever run? Undead, constructs, oozes and zealots will not. */
export function willFlee(unit) {
  const a = aiBlock(unit);
  if (a.neverFlee || !a.canFlee) return false;
  if (NEVER_FLEE_TYPES.has(creatureTypeOf(unit))) return false;
  if (ZEALOT_FACTIONS.has(lower(unit?.faction))) return false;
  if (mechOf(unit).passives.includes('fearless')) return false;
  return true;
}

/** Rough single-turn damage output, used for threat, kill checks and target value. */
export function estimateDamage(unit) {
  if (!unit) return 0;
  let best = 0;

  // Monsters carry their damage on their stat block actions.
  for (const act of arr(unit.actions)) {
    if (!act) continue;
    if (lower(act.kind) === 'multiattack') {
      // "Two claws and a bite": sum the referenced attacks if the data spells them out.
      let sum = 0;
      for (const part of arr(act.attacks || act.parts)) {
        const ref = arr(unit.actions).find((a) => a && (a.id === (part.id || part) || a.name === (part.name || part)));
        if (ref) sum += avgExpr(ref.dice || 0) * num(part.count, 1);
      }
      if (sum > best) best = sum;
      continue;
    }
    const d = avgExpr(act.dice || act.damage?.dice || 0);
    if (d > best) best = d;
  }

  // Player characters and recruits: their best weapon, times their attack count.
  if (!best) {
    try {
      for (const w of weaponsOf(unit) || []) {
        const dmg = w?.damage || {};
        let d = avgExpr(dmg.dice || 0) + num(dmg.mod, 0);
        for (const b of arr(dmg.bonusDice)) d += avgExpr(b.dice || 0);
        if (d > best) best = d;
      }
      best *= 1 + num(unit.extraAttacks, 0);
    } catch { /* half-built character: fall through to the floor below */ }
  }

  // Absolute floor so an unarmed or data-less creature still registers as a threat.
  return Math.max(best, 1 + Math.max(0, abilityMod(unit, 'str')));
}

/** Probability an attack at `atk` lands against `ac`, clamped to the 5% nat-1/nat-20 band. */
function hitChance(atk, ac) {
  return clamp((21 + num(atk) - num(ac, 12)) / 20, 0.05, 0.95);
}

/** Does this creature sling spells? Used by archers hunting the back line. */
function isCaster(u) {
  if (!u) return false;
  if (lower(u.ai?.archetype) === 'caster' || lower(u.ai?.archetype) === 'support') return true;
  const slots = u.spells?.slots || {};
  for (const k of Object.keys(slots)) if (num(slots[k]?.max) > 0) return true;
  if (num(u.spells?.pact?.max) > 0) return true;
  return arr(u.actions).some((a) => a && (a.spellId || lower(a.kind) === 'save'));
}

/**
 * "How much do I want to be the one who kills this?" — low AC, few hit points and a
 * spellcaster's robes all say the same thing: hit them first.
 */
export function squishiness(enc, target) {
  if (!target) return 0;
  let s = 0;
  s += clamp(16 - acOf(target), -6, 8) * 1.6;                 // AC 10 is a soft target
  const maxHp = Math.max(1, num(target.maxHp, 1));
  const ref = averageMaxHp(enc) || maxHp;
  s += clamp((1 - maxHp / ref) * 12, -8, 12);                 // frailer than the average foe
  if (isCaster(target)) s += 9;
  if (hasCondition(target, 'prone')) s += 4;                  // melee gets Advantage on the prone
  if (hasCondition(target, 'restrained') || hasCondition(target, 'paralyzed')) s += 8;
  return s;
}

function averageMaxHp(enc) {
  const us = unitsOf(enc).filter(isAlive);
  if (!us.length) return 0;
  return us.reduce((a, u) => a + num(u.maxHp, 1), 0) / us.length;
}

/** How painful is the spell this creature is concentrating on? */
function concentrationValue(target) {
  if (!isConcentrating(target)) return 0;
  const sp = getSpell(target.concentration?.spellId);
  if (!sp) return 8;
  const tags = arr(sp.tags);
  let v = 6 + num(sp.level, 1) * 2.5;
  if (tags.includes('control') || tags.includes('debuff')) v += 6;
  if (tags.includes('buff') || tags.includes('summon')) v += 4;
  if (sp.damage) v += 4;
  return v;
}

// ---------------------------------------------------------------------------
// Options — what this creature can actually do this turn
// ---------------------------------------------------------------------------

function rawOptions(enc, unit) {
  let list = [];
  try { list = enc?.availableActions?.(unit) || []; } catch { list = []; }
  if (!Array.isArray(list) || !list.length) list = synthesizeOptions(unit);
  return list.filter((o) => o && o.enabled !== false && lower(o.kind) !== 'end' && lower(o.kind) !== 'move');
}

/**
 * A fallback option list built straight off a monster stat block, so the AI still
 * behaves inside a bare-bones test harness that has no `availableActions`.
 */
function synthesizeOptions(unit) {
  const out = [];
  const push = (a, cost) => {
    if (!a || !a.id) return;
    out.push({ id: a.id, kind: lower(a.kind) === 'attack' ? 'attack' : 'special', name: a.name || a.id, cost, enabled: true, action: a });
  };
  for (const a of arr(unit?.actions)) push(a, 'action');
  for (const a of arr(unit?.bonusActions)) push(a, 'bonus');
  return out;
}

/** Index a monster's stat block actions by id AND by name so options can find them. */
function actionIndex(unit) {
  const map = new Map();
  for (const list of [unit?.actions, unit?.bonusActions, unit?.reactions, unit?.legendary?.actions]) {
    for (const a of arr(list)) {
      if (!a) continue;
      if (a.id) map.set(lower(a.id), a);
      if (a.name) map.set(lower(a.name), a);
    }
  }
  return map;
}

/** Pull a spell id out of whatever shape the option carries it in. */
function spellIdOf(opt) {
  const raw = opt?.spellId || opt?.spell?.id || opt?.data?.spellId || opt?.action?.spellId;
  if (raw) return lower(raw);
  // Ids like "spell:fire-bolt" or "cast-fire-bolt" or just "fire-bolt".
  const id = lower(opt?.id);
  if (!id) return null;
  const bits = id.split(/[:|]/);
  const tail = bits[bits.length - 1].replace(/^cast-/, '').replace(/@\d+$/, '');
  return getSpell(tail) ? tail : (getSpell(id) ? id : null);
}

/**
 * Describe one ActionOption in the terms the AI reasons about: how far it reaches,
 * whether it is an area effect, what it is worth and what job it does.
 */
export function describeOption(enc, unit, opt, idx) {
  if (!opt) return null;
  const kind = lower(opt.kind || 'special');
  const act = opt.action || idx?.get(lower(opt.id)) || idx?.get(lower(opt.name)) || null;
  const spell = getSpell(spellIdOf(opt));
  const t = opt.targeting || {};

  // --- range ------------------------------------------------------------
  let range = t.range;
  if (range == null && act) range = Array.isArray(act.range) ? act.range : (act.range ?? act.reach);
  if (range == null && spell) range = rangeFeet(spell);
  if (range == null) range = kind === 'attack' ? reachFt(unit) : 5;
  const band = Array.isArray(range) ? [num(range[0], 5), num(range[1], num(range[0], 5))] : [num(range, 5), num(range, 5)];

  // --- shape ------------------------------------------------------------
  const shapeKind = lower(t.shape || t.kind || act?.target?.kind || spell?.target?.kind || 'creature');
  const radius = num(t.radius ?? act?.target?.radius ?? spell?.target?.radius, 0);
  const length = num(t.length ?? act?.target?.length ?? spell?.target?.length, 0);
  const width = num(t.width ?? act?.target?.width ?? spell?.target?.width, 5);
  const aoe = ['sphere', 'cone', 'line', 'cube', 'area', 'wall', 'cylinder', 'burst', 'radius'].includes(shapeKind)
    && (radius > 0 || length > 0);

  // --- worth ------------------------------------------------------------
  let dmg = 0;
  if (act?.dice) dmg = avgExpr(act.dice);
  if (spell?.damage) {
    const dice = spellDamageDice(spell, Math.max(spell.level, num(opt.slotLevel, spell.level)), num(unit?.level, 1));
    dmg = Math.max(dmg, avgExpr(dice || spell.damage.dice || 0));
  }
  if (!dmg && typeof opt.avgDamage === 'number') dmg = opt.avgDamage;
  if (act && lower(act.kind) === 'multiattack') dmg = Math.max(dmg, estimateDamage(unit));

  let healAvg = 0;
  if (spell?.heal) healAvg = avgExpr(spell.heal.dice || 0) + (spell.heal.mod === 'spell' ? num(unit?.spells?.ability ? abilityMod(unit, unit.spells.ability) : 0) : 0);
  if (act && lower(act.kind) === 'heal') healAvg = Math.max(healAvg, avgExpr(act.dice || 0));
  if (!healAvg && /heal|cure|word|vitality|potion/.test(lower(opt.name)) && kind === 'item') healAvg = 7;

  // --- role -------------------------------------------------------------
  let role = lower(act?.ai?.role || spell?.ai?.role || '');
  if (!role) {
    if (healAvg > 0) role = 'heal';
    else if (aoe && dmg > 0) role = 'aoe';
    else if (dmg > 0) role = kind === 'attack' ? 'attack' : 'nuke';
    else if (spell && arr(spell.tags).includes('control')) role = 'control';
    else if (spell && arr(spell.tags).includes('buff')) role = 'buff';
    else if (spell && arr(spell.tags).includes('debuff')) role = 'debuff';
    else role = kind === 'attack' ? 'attack' : 'utility';
  }

  return {
    opt, id: opt.id, kind, name: opt.name || opt.id || '', cost: lower(opt.cost || 'action'),
    act, spell, role,
    weight: num(act?.ai?.weight ?? spell?.ai?.weight, 1),
    range: band, shapeKind, radius, length, width, aoe,
    allowAllies: !!(t.allowAllies || act?.target?.allowAllies || spell?.target?.allowAllies),
    needsLoS: t.needsLoS !== false,
    concentration: !!spell?.concentration,
    save: act?.save || spell?.save || null,
    atkBonus: num(act?.atkBonus, null),
    dmg, healAvg,
    // Cheap flags the planners read a lot.
    isAttack: kind === 'attack' || (act && lower(act.kind) === 'attack') || (spell && !!spell.attack),
    isHeal: healAvg > 0,
    isItem: kind === 'item',
    isDodge: kind === 'dodge',
    isDash: kind === 'dash',
    isDisengage: kind === 'disengage',
    isHide: kind === 'hide',
    isHelp: kind === 'help',
    isShove: kind === 'shove',
    isGrapple: kind === 'grapple',
  };
}

/** Every usable option this turn, described. */
export function optionsFor(enc, unit) {
  const idx = actionIndex(unit);
  return rawOptions(enc, unit).map((o) => describeOption(enc, unit, o, idx)).filter(Boolean);
}

/** Legal targets for an option, straight from the encounter when it offers them. */
function targetsFor(enc, unit, info, fallback) {
  let units = null;
  try {
    const t = enc?.targetsFor?.(unit, info.opt);
    if (t && Array.isArray(t.units)) units = t.units.filter(Boolean);
  } catch { units = null; }
  if (!units || !units.length) units = fallback || [];
  return units;
}

// ---------------------------------------------------------------------------
// Movement — reachable tiles, our own flood fill as a backstop
// ---------------------------------------------------------------------------

/** Can this creature stand on that tile? */
function walkable(enc, unit, x, y) {
  const map = enc?.map;
  if (map) {
    if (typeof map.inBounds === 'function' && !map.inBounds(x, y)) return false;
    if (typeof map.solid === 'function' && map.solid(x, y)) return false;
  }
  const occupant = unitAt(enc, x, y);
  return !occupant || occupant === unit;
}

/**
 * Breadth-first movement flood over the 5-ft grid. Diagonals cost the same as
 * orthogonals — the PHB's default grid rule, matching actions.js `distanceFt`.
 * Returns Map<'x,y', {x,y,cost(feet),path}> including the starting tile at cost 0.
 */
export function floodFrom(enc, unit, origin, budgetFt) {
  const start = tileOf(origin || unit);
  const maxTiles = Math.max(0, Math.floor(num(budgetFt, 0) / FEET_PER_TILE));
  const out = new Map();
  out.set(keyOf(start.x, start.y), { x: start.x, y: start.y, cost: 0, path: [] });
  if (maxTiles <= 0) return out;

  let frontier = [{ x: start.x, y: start.y, path: [] }];
  for (let step = 1; step <= maxTiles; step++) {
    const next = [];
    for (const cur of frontier) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = cur.x + dx, ny = cur.y + dy;
          const k = keyOf(nx, ny);
          if (out.has(k)) continue;
          if (!walkable(enc, unit, nx, ny)) continue;
          const path = cur.path.concat([{ x: nx, y: ny }]);
          out.set(k, { x: nx, y: ny, cost: step * FEET_PER_TILE, path });
          next.push({ x: nx, y: ny, path });
        }
      }
    }
    frontier = next;
    if (!frontier.length) break;
  }
  return out;
}

/**
 * Tiles the creature can reach this turn as a plain array. Prefers the encounter's
 * own pathfinder (its costs are authoritative) and falls back to our flood fill.
 * Costs are normalised to FEET.
 */
export function reachableList(enc, unit) {
  const speed = Math.max(0, num(unit?.speed, 30));
  let raw = null;
  try { raw = enc?.reachableTiles?.(unit); } catch { raw = null; }

  const out = [];
  const push = (x, y, cost, path) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    out.push({ x, y, pos:{x,y}, size:unit?.size, cost: num(cost, 0), path: Array.isArray(path) ? path : [] });
  };

  if (raw instanceof Map) {
    for (const [k, v] of raw) {
      const [x, y] = String(k).split(',').map(Number);
      push(num(v?.x, x), num(v?.y, y), v?.cost, v?.path);
    }
  } else if (Array.isArray(raw)) {
    for (const v of raw) push(num(v?.x), num(v?.y), v?.cost, v?.path);
  } else if (raw && typeof raw === 'object') {
    for (const k of Object.keys(raw)) {
      const v = raw[k];
      const [x, y] = String(k).split(',').map(Number);
      push(num(v?.x, x), num(v?.y, y), v?.cost, v?.path);
    }
  }

  if (!out.length) {
    for (const v of floodFrom(enc, unit, unit, speed).values()) push(v.x, v.y, v.cost, v.path);
    return out;
  }

  // Some engines report cost in TILES. If every cost fits inside the tile budget but
  // not the foot budget, treat them as tiles and convert.
  const maxCost = out.reduce((a, t) => Math.max(a, t.cost), 0);
  const tileBudget = speed / FEET_PER_TILE;
  if (maxCost > 0 && maxCost <= tileBudget + 0.001 && speed > FEET_PER_TILE) {
    for (const t of out) t.cost *= FEET_PER_TILE;
  }

  const here = tileOf(unit);
  if (!out.some((t) => t.x === here.x && t.y === here.y)) out.push({ x: here.x, y: here.y, cost: 0, path: [] });
  return out;
}

/** How many living enemies threaten a tile with a melee reach? */
export function threatAt(enc, unit, tile) {
  tile=atPosition(unit,tile);
  let n = 0;
  for (const e of unitsOf(enc)) {
    if (!isAlive(e) || !isHostile(e, unit)) continue;
    if (conditionMech(e).incapacitated) continue;
    if (distanceFt(tile, e) <= reachFt(e)) n++;
  }
  return n;
}

/** Best cover this tile grants against the enemies that matter (0, +2 or +5 AC). */
function coverAt(enc, tile, enemies) {
  if (!enemies.length) return 0;
  let sum = 0;
  for (const e of enemies) sum += hasCover(enc, e, tile);
  return sum / enemies.length;
}

/**
 * Score a candidate tile. The whole positioning brain lives here:
 * maximise attacks made, minimise attacks taken, sit in cover, hold the preferred band.
 */
export function scoreTile(enc, unit, tile, o = {}) {
  tile={...tile,...atPosition(unit,tile)};
  const {
    target = null, desiredRange = 5, attackRange = 5, avoidMelee = false,
    protect = null, enemies = [], cost = 0,
  } = o;

  let s = 0;

  // 1. Can we attack from here? This dominates everything else.
  if (target) {
    const d = distanceFt(tile, target);
    const reachable = d <= (Array.isArray(attackRange) ? attackRange[1] : attackRange);
    const clear = !hasTotalCover(enc, tile, target);
    if (reachable && clear) s += WEIGHTS.tileAttack;
    // 2. Hold the band the creature likes to fight at.
    s -= Math.abs(d - desiredRange) * WEIGHTS.tileRange;
  }

  // 3. Exposure. Ranged specialists hate being in reach; brutes barely care.
  const threats = threatAt(enc, unit, tile);
  s -= threats * (avoidMelee ? WEIGHTS.tileThreat * 3.2 : WEIGHTS.tileThreat);

  // 4. Cover is worth its AC value several times over to anyone being shot at.
  s += coverAt(enc, tile, enemies.slice(0, 4)) * WEIGHTS.tileCover;

  // 5. Bodyguards want to be between the thing they protect and the nearest danger.
  if (protect) {
    const nearest = nearestOf(enemies, protect);
    if (nearest) {
      const blocking = onSegment(tile, nearest, protect);
      if (blocking) s += 45;
      s -= Math.abs(distanceFt(tile, protect) - 5) * 1.2;   // stay in arm's reach of the ward
    }
  }

  // 6. Do not sprint for a marginal gain.
  s -= num(cost, 0) * WEIGHTS.tileCost;

  return s + jitter(enc, unit, `tile:${tile.x},${tile.y}`, WEIGHTS.jitter * 0.4);
}

/**
 * A throwaway stand-in for a creature standing somewhere else, so "what would this
 * spell catch if I cast it after moving?" can be asked without moving anything.
 */
function ghostAt(unit, tile) {
  const t = tileOf(tile);
  return { ...unit, pos: { x: t.x, y: t.y }, x: t.x, y: t.y };
}

function nearestOf(list, to) {
  let best = null, bd = Infinity;
  for (const u of list) {
    const d = distanceFt(u, to);
    if (d < bd) { bd = d; best = u; }
  }
  return best;
}

/** Is `mid` roughly on the line between `a` and `b` (within one tile)? */
function onSegment(mid, a, b) {
  const A = tileOf(a), B = tileOf(b), M = tileOf(mid);
  const abx = B.x - A.x, aby = B.y - A.y;
  const amx = M.x - A.x, amy = M.y - A.y;
  const len2 = abx * abx + aby * aby;
  if (!len2) return false;
  const t = clamp((amx * abx + amy * aby) / len2, 0, 1);
  const px = A.x + abx * t, py = A.y + aby * t;
  return Math.hypot(M.x - px, M.y - py) <= 1.01 && t > 0.05 && t < 0.95;
}

/** Pick the best tile out of a reachable set; returns null when standing still wins. */
export function bestTile(enc, unit, tiles, o = {}) {
  // When no attack square is reachable this turn, follow an actual route to
  // contact. Straight-line scoring alone strands melee creatures behind walls.
  if (o.target && o.attackRange <= 10 && typeof enc?.reachableTiles === 'function'
      && !tiles.some(t => distanceFt(atPosition(unit, t), o.target) <= o.attackRange
        && !hasTotalCover(enc, atPosition(unit, t), o.target))) {
    const full = [...enc.reachableTiles(unit, { movement: Math.min(4096, (enc.w || 22) * (enc.h || 15) * 10) }).values()];
    const goals = full.filter(t => distanceFt(atPosition(unit, t), o.target) <= o.attackRange
      && !hasTotalCover(enc, atPosition(unit, t), o.target)).sort((a,b) => a.cost - b.cost);
    if (goals.length) {
      const available = new Map(tiles.map(t => [keyOf(t.x,t.y),t]));
      for (const p of [...goals[0].path].reverse()) {
        const step = available.get(keyOf(p.x,p.y));
        if (step?.path?.length) return step;
      }
    }
  }
  const here = tileOf(unit);
  let best = null, bestScore = -Infinity;
  for (const t of tiles) {
    const sc = scoreTile(enc, unit, t, { ...o, cost: t.cost });
    if (sc > bestScore) { bestScore = sc; best = t; }
  }
  if (!best) return null;
  if (best.x === here.x && best.y === here.y) return null;
  return best;
}

// ---------------------------------------------------------------------------
// Target scoring
// ---------------------------------------------------------------------------

/** Cached per-turn reachability so scoreTarget can ask "can I get there?" cheaply. */
function reachCache(enc, unit) {
  const stamp = `${num(enc?.round, 0)}:${num(enc?.turnIndex, 0)}:${unit?.uid}`;
  if (enc && enc._aiReach && enc._aiReach.stamp === stamp) return enc._aiReach;
  const tiles = reachableList(enc, unit);
  const rec = { stamp, tiles };
  if (enc && typeof enc === 'object') enc._aiReach = rec;
  return rec;
}

/** Could this creature attack `target` this turn, moving if it has to? */
export function canReachThisTurn(enc, unit, target, range) {
  const band = Array.isArray(range) ? num(range[1], 5) : num(range, reachFt(unit));
  if (distanceFt(unit, target) <= band && !hasTotalCover(enc, unit, target)) return true;
  for (const t of reachCache(enc, unit).tiles) {
    if (distanceFt(t, target) <= band && !hasTotalCover(enc, t, target)) return true;
  }
  return false;
}

/**
 * How badly does `unit` want to attack `target`? Higher is better; the number has no
 * absolute meaning, only ordering. See WEIGHTS for the dials.
 *
 * Weighs: distance, whether the target is reachable this turn, how wounded it is,
 * how much damage it has been dealing (threat), how squishy it is, whether it is
 * holding a painful concentration spell, and the creature's own aggression and
 * self-preservation instincts — plus a small deterministic jitter.
 */
export function scoreTarget(enc, unit, target) {
  if (!unit || !target || !isAlive(target)) return -Infinity;
  if (!isHostile(target, unit)) return -Infinity;

  const ai = aiBlock(unit);
  const dist = distanceFt(unit, target);
  let s = 0;

  // --- distance and reachability ----------------------------------------
  const band = ai.archetype === 'archer' || ai.archetype === 'caster'
    ? Math.max(ai.preferredRange, 30)
    : reachFt(unit);
  s -= dist * WEIGHTS.distance;
  if (canReachThisTurn(enc, unit, target, band)) s += WEIGHTS.reachable;
  // Something we cannot even see is a poor plan.
  if (hasTotalCover(enc, unit, target)) s -= 30;

  // --- finish the wounded ------------------------------------------------
  const hpFrac = clamp(num(target.hp, 1) / Math.max(1, num(target.maxHp, 1)), 0, 1);
  s += (1 - hpFrac) * WEIGHTS.wounded;
  if (estimateDamage(unit) >= num(target.hp, 1)) s += WEIGHTS.killingBlow;

  // A creature at 0 hp is already out of the fight. Only a genuinely cruel or
  // desperate creature spends a turn on it (2024 death saves make it a real choice).
  if (isDown(target)) s += WEIGHTS.downed * (1.2 - ai.aggression);

  // --- threat ------------------------------------------------------------
  const th = threatOf(enc, unit, target);
  if (th > 0) s += clamp(th * 0.6, 0, WEIGHTS.threat);

  // --- squishiness and concentration ------------------------------------
  s += squishiness(enc, target) * (WEIGHTS.squishy / 26);
  s += concentrationValue(target) * (WEIGHTS.concentration / 20);

  // --- likelihood of actually connecting --------------------------------
  const atk = bestAttackBonus(unit);
  s += (hitChance(atk, acOf(target)) - 0.55) * 18;

  // --- temperament -------------------------------------------------------
  // Aggression pushes toward whoever is closest and killable; self-preservation
  // pushes away from whoever hits hardest.
  s += (ai.aggression - 0.5) * (WEIGHTS.reachable * 0.5) * (dist <= band ? 1 : -1);
  s -= ai.selfPreserve * clamp(estimateDamage(target) * 0.5, 0, 22);

  // Do not all pile onto one body: a target already marked by an ally this round is
  // slightly less attractive, which spreads a pack out naturally.
  if (target._aiMarked && target._aiMarkedBy !== unit.uid) s -= 6;

  return s + jitter(enc, unit, `tgt:${target.uid}`, WEIGHTS.jitter);
}

function bestAttackBonus(unit) {
  let best = -Infinity;
  for (const a of arr(unit?.actions)) if (typeof a?.atkBonus === 'number') best = Math.max(best, a.atkBonus);
  if (best > -Infinity) return best;
  try {
    for (const w of weaponsOf(unit) || []) best = Math.max(best, num(w.attackBonus, -Infinity));
  } catch { /* ignore */ }
  if (best > -Infinity) return best;
  return profBonus(unit) + Math.max(abilityMod(unit, 'str'), abilityMod(unit, 'dex'));
}

/** Living enemies, best target first. */
export function rankTargets(enc, unit, pool) {
  const list = (pool || unitsOf(enc)).filter((u) => u && isAlive(u) && isHostile(u, unit));
  return list
    .map((u) => ({ unit: u, score: scoreTarget(enc, unit, u) }))
    .sort((a, b) => b.score - a.score);
}

/** Living allies (not the creature itself), most in need first. */
export function rankAllies(enc, unit) {
  return unitsOf(enc)
    .filter((u) => u && u !== unit && isAlly(u, unit))
    .map((u) => ({ unit: u, frac: clamp(num(u.hp, 0) / Math.max(1, num(u.maxHp, 1)), 0, 1), down: isDown(u) || !isAlive(u) }))
    .sort((a, b) => (b.down ? 1 : 0) - (a.down ? 1 : 0) || a.frac - b.frac);
}

// ---------------------------------------------------------------------------
// Area-of-effect placement
// ---------------------------------------------------------------------------

/**
 * Search origins for an area effect and return the one that catches the most enemies
 * and the fewest allies. Candidate points are every enemy's tile plus the midpoints
 * between pairs of enemies — cheap, and it finds the classic "two goblins in one
 * fireball" placement without scanning the whole map.
 */
export function bestAoEOrigin(enc, unit, info, o = {}) {
  const enemies = unitsOf(enc).filter((u) => isAlive(u) && isHostile(u, unit));
  const allies = unitsOf(enc).filter((u) => isAlive(u) && isAlly(u, unit));
  if (!enemies.length) return null;

  const maxRange = Array.isArray(info.range) ? info.range[1] : info.range;
  const shape = {
    kind: info.shapeKind === 'area' ? 'sphere' : info.shapeKind,
    radius: info.radius, length: info.length || info.radius, width: info.width,
  };

  const points = [];
  const seen = new Set();
  const add = (x, y) => {
    const k = keyOf(x, y);
    if (seen.has(k)) return;
    seen.add(k);
    points.push({ x, y });
  };
  for (const e of enemies) {
    const p = tileOf(e);
    add(p.x, p.y);
    for (const f of enemies) {
      if (f === e) continue;
      const q = tileOf(f);
      add(Math.round((p.x + q.x) / 2), Math.round((p.y + q.y) / 2));
    }
  }

  let best = null, bestScore = -Infinity;
  for (const pt of points) {
    if (distanceFt(unit, pt) > maxRange) continue;
    if (info.needsLoS && !lineOfSight(enc, unit, pt)) continue;
    const caught = unitsInArea(enc, unit, pt, shape);
    // Compare by uid: `unit` may be a ghost standing where we plan to move to.
    const selfHit = caught.some((u) => u.uid === unit.uid) ? 1 : 0;
    const foes = caught.filter((u) => isHostile(u, unit)).length;
    const friends = caught.filter((u) => u.uid !== unit.uid && isAlly(u, unit)).length;
    if (foes < num(o.minTargets, 1)) continue;
    // Allies cost far more than enemies gain: a wasted fireball is better than a
    // fireball that roasts the warband.
    const sc = foes * 12 - friends * 17 - selfHit * 34
      + jitter(enc, unit, `aoe:${pt.x},${pt.y}`, WEIGHTS.jitter * 0.5);
    if (sc > bestScore) { bestScore = sc; best = { x: pt.x, y: pt.y, foes, friends, score: sc }; }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Plan assembly helpers
// ---------------------------------------------------------------------------

const movePlan = (tile) => (tile && Array.isArray(tile.path) && tile.path.length
  ? { kind: 'move', path: tile.path, to: { x: tile.x, y: tile.y } }
  : null);

const actionPlan = (info, target) => (info ? { kind: 'action', optionId: info.id, target: target || null } : null);

const endPlan = () => ({ kind: 'end' });

function compact(list) { return list.filter(Boolean); }

/** Mark a target so the rest of the warband spreads out a little. */
function markTarget(unit, target) {
  if (!target) return;
  target._aiMarked = true;
  target._aiMarkedBy = unit?.uid || null;
}

function atPosition(unit, p=tileOf(unit)) { return {...unit,x:p.x,y:p.y,pos:{x:p.x,y:p.y}}; }

/** Pick the best offensive option that can hit `target` from `from`. */
function bestAttackOption(enc, unit, infos, target, from) {
  let best = null, bestScore = -Infinity;
  const pos = from ? atPosition(unit,from) : unit;
  for (const info of infos) {
    if (info.cost !== 'action' && info.cost !== 'free') continue;
    if (!info.isAttack && info.role !== 'nuke' && info.role !== 'attack'
      && info.role !== 'control' && info.role !== 'debuff' && info.role !== 'aoe') continue;
    if (info.isHeal) continue;
    const maxR = Array.isArray(info.range) ? info.range[1] : info.range;
    if (distanceFt(pos, target) > maxR) continue;
    if (info.needsLoS && hasTotalCover(enc, pos, target)) continue;

    let sc = info.dmg * info.weight;
    // Save-for-half spells still land something; attack rolls can miss outright.
    if (info.save) sc *= 0.8;
    else if (info.isAttack) sc *= hitChance(info.atkBonus != null ? info.atkBonus : bestAttackBonus(unit), acOf(target));
    if (info.role === 'control') sc += 9;      // holding a PC still is worth real damage
    if (info.role === 'debuff') sc += 5;
    // Long range means Disadvantage — prefer a closer band when one exists.
    if (Array.isArray(info.range) && distanceFt(pos, target) > info.range[0]) sc *= 0.7;
    sc += jitter(enc, unit, `opt:${info.id}`, WEIGHTS.jitter * 0.3);
    if (sc > bestScore) { bestScore = sc; best = info; }
  }
  return best;
}

/** A bonus-action attack/utility to bolt onto the end of a turn. */
function bestBonusOption(enc, unit, infos, target) {
  let best = null, bestScore = -Infinity;
  for (const info of infos) {
    if (info.cost !== 'bonus') continue;
    if (info.isHeal) continue;
    let sc = info.dmg * info.weight;
    if (info.isDisengage || info.isHide) sc += 2;
    if (target && info.isAttack) {
      const maxR = Array.isArray(info.range) ? info.range[1] : info.range;
      if (distanceFt(unit, target) > maxR) continue;
    }
    if (sc > bestScore) { bestScore = sc; best = info; }
  }
  return best;
}

/** The Dash / Dodge / Disengage / Hide fallbacks, by option kind. */
const findKind = (infos, pred) => infos.find(pred) || null;
const dashOpt = (infos) => findKind(infos, (i) => i.isDash);
const dodgeOpt = (infos) => findKind(infos, (i) => i.isDodge);
const disengageOpt = (infos, cost) => findKind(infos, (i) => i.isDisengage && (!cost || i.cost === cost));
const hideOpt = (infos) => findKind(infos, (i) => i.isHide);
const shoveOpt = (infos) => findKind(infos, (i) => i.isShove);

/** A healing potion or self-heal the creature could quaff. */
function healingItemOption(infos) {
  return infos.find((i) => (i.isItem || i.kind === 'special') && i.healAvg > 0
    && /potion|heal|cure|vitality|draught/.test(lower(`${i.name} ${i.id}`))) || null;
}

// ---------------------------------------------------------------------------
// Self-preservation
// ---------------------------------------------------------------------------

/**
 * Badly hurt creatures with an instinct for self-preservation drink a potion, back
 * off, or break entirely. Returns Plan[] or null to let the archetype planner run.
 */
export function selfPreservePlan(enc, unit, infos) {
  const ai = aiBlock(unit);
  const frac = clamp(num(unit.hp, 1) / Math.max(1, num(unit.maxHp, 1)), 0, 1);
  if (ai.selfPreserve <= 0.5) return null;

  // The threshold scales with how cowardly the creature is: a 0.9 coward bolts at
  // half health, a 0.55 one waits until it is nearly dead.
  const panic = 0.15 + ai.selfPreserve * 0.35;
  if (frac > panic) return null;

  const enemies = unitsOf(enc).filter((u) => isAlive(u) && isHostile(u, unit));

  // 1. A potion is always the best answer if we have one.
  const potion = healingItemOption(infos);
  if (potion) {
    const bonus = potion.cost === 'bonus';
    const plans = [actionPlan(potion, { unit })];
    if (bonus) {
      // Bonus-action quaff: still take a swing afterwards.
      const t = rankTargets(enc, unit)[0]?.unit;
      const atk = t ? bestAttackOption(enc, unit, infos, t) : null;
      if (atk) { markTarget(unit, t); plans.push(actionPlan(atk, { unit: t })); }
    }
    return compact(plans);
  }

  // 2. Run, if this thing runs at all.
  if (willFlee(unit) && ai.selfPreserve > 0.65 && enemies.length) {
    // combat.js offers a bloodied monster an explicit "leave the field" action
    // (id 'flee'); taking it is cleaner than a retreat that gets chased down.
    const flee = infos.find((i) => i.id === 'flee');
    if (flee) return [actionPlan(flee, null)];
    const tiles = reachCache(enc, unit).tiles;
    let best = null, bestScore = -Infinity;
    for (const t of tiles) {
      // Maximise the distance to the nearest enemy; taking cover on the way is a bonus.
      const nearest = enemies.reduce((a, e) => Math.min(a, distanceFt(t, e)), Infinity);
      const sc = nearest * 2 - threatAt(enc, unit, t) * 22 + coverAt(enc, t, enemies.slice(0, 3)) * 3
        + jitter(enc, unit, `flee:${t.x},${t.y}`, 2);
      if (sc > bestScore) { bestScore = sc; best = t; }
    }
    // Disengage first so the retreat does not hand out free Opportunity Attacks.
    const dis = disengageOpt(infos);
    const dash = dashOpt(infos);
    const plans = [];
    if (dis) plans.push(actionPlan(dis, null));
    else if (dash && threatAt(enc, unit, tileOf(unit)) === 0) plans.push(actionPlan(dash, null));
    plans.push(movePlan(best));
    return compact(plans);
  }

  // 3. Cornered or fearless-by-type: fight defensively rather than trading blows.
  const dodge = dodgeOpt(infos);
  if (dodge && ai.selfPreserve > 0.6) {
    const tiles = reachCache(enc, unit).tiles;
    const away = bestTile(enc, unit, tiles, { avoidMelee: true, enemies, desiredRange: 30, target: null });
    return compact([movePlan(away), actionPlan(dodge, null)]);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Archetype planners
// ---------------------------------------------------------------------------
//
// Every planner has the same signature: (enc, unit, infos) -> Plan[] (no trailing
// 'end' — takeTurn appends that). They may return an empty array to mean "nothing
// useful to do", which takeTurn turns into a Dodge or a plain end of turn.

/** Move into contact and swing. The default for anything without a better idea. */
function planMelee(enc, unit, infos, o = {}) {
  const ranked = rankTargets(enc, unit);
  if (!ranked.length) return [];
  const enemies = ranked.map((r) => r.unit);

  // Brutes prefer the weakest thing already within arm's reach — a monster that is
  // already engaged rarely walks away to find a better target.
  let target = ranked[0].unit;
  if (o.preferAdjacentWeakest) {
    const adjacent = enemies.filter((e) => distanceFt(unit, e) <= reachFt(unit));
    if (adjacent.length) {
      adjacent.sort((a, b) => num(a.hp, 0) - num(b.hp, 0));
      target = adjacent[0];
    }
  }

  const reach = reachFt(unit);
  const plans = [];
  let from = atPosition(unit);

  if (distanceFt(unit, target) > reach || hasTotalCover(enc, unit, target)) {
    const tiles = reachCache(enc, unit).tiles;
    const tile = bestTile(enc, unit, tiles, {
      target, desiredRange: reach, attackRange: reach, enemies, avoidMelee: false,
    });
    if (tile) { plans.push(movePlan(tile)); from = atPosition(unit,tile); }
  }

  const atk = bestAttackOption(enc, unit, infos, target, from);
  if (atk) {
    markTarget(unit, target);
    plans.push(actionPlan(atk, { unit: target }));
  } else if (distanceFt(from, target) > reach) {
    // Still out of contact after moving: Dash to close the gap.
    const dash = dashOpt(infos);
    if (dash) plans.push(actionPlan(dash, null));
  }

  const bonus = bestBonusOption(enc, unit, infos, target);
  if (bonus) plans.push(actionPlan(bonus, bonus.isAttack ? { unit: target } : null));
  return compact(plans);
}

/** Brute: close and smash, preferring the weakest thing it can already reach. */
function planBrute(enc, unit, infos) {
  return planMelee(enc, unit, infos, { preferAdjacentWeakest: true });
}

/** Swarm: mob whatever is nearest. No cleverness, lots of bodies. */
function planSwarm(enc, unit, infos) {
  const enemies = unitsOf(enc).filter((u) => isAlive(u) && isHostile(u, unit));
  if (!enemies.length) return [];
  const target = enemies.reduce((a, e) => (distanceFt(unit, e) < distanceFt(unit, a) ? e : a), enemies[0]);
  const reach = reachFt(unit);
  const plans = [];
  let from = atPosition(unit);
  if (distanceFt(unit, target) > reach || hasTotalCover(enc, unit, target)) {
    const tile = bestTile(enc, unit, reachCache(enc, unit).tiles, {
      target, desiredRange: reach, attackRange: reach, enemies,
    });
    if (tile) { plans.push(movePlan(tile)); from = atPosition(unit,tile); }
  }
  const atk = bestAttackOption(enc, unit, infos, target, from);
  if (atk) { markTarget(unit, target); plans.push(actionPlan(atk, { unit: target })); }
  else {
    const dash = dashOpt(infos);
    if (dash) plans.push(actionPlan(dash, null));
  }
  return compact(plans);
}

/**
 * Skirmisher: dart in, hit, dart out. Goblins do this with Nimble Escape (Disengage
 * as a Bonus Action, 2024 MM), which is what lets the retreat leg be free.
 */
function planSkirmisher(enc, unit, infos) {
  const ranked = rankTargets(enc, unit);
  if (!ranked.length) return [];
  const target = ranked[0].unit;
  const enemies = ranked.map((r) => r.unit);
  const reach = reachFt(unit);
  const speed = Math.max(0, num(unit.speed, 30));

  const plans = [];
  let from = atPosition(unit);
  let spent = 0;

  if (distanceFt(unit, target) > reach || hasTotalCover(enc, unit, target)) {
    // Only spend half the movement getting in, so there is fuel left to get out.
    const tiles = reachCache(enc, unit).tiles.filter((t) => t.cost <= speed);
    const tile = bestTile(enc, unit, tiles, { target, desiredRange: reach, attackRange: reach, enemies });
    if (tile) { plans.push(movePlan(tile)); from = atPosition(unit,tile); spent = tile.cost; }
  }

  const atk = bestAttackOption(enc, unit, infos, target, from);
  if (atk) { markTarget(unit, target); plans.push(actionPlan(atk, { unit: target })); }

  // Nimble Escape: Disengage as a Bonus Action, then walk out of reach for free.
  const dis = disengageOpt(infos, 'bonus') || disengageOpt(infos);
  const hide = hideOpt(infos);
  if (dis && dis.cost === 'bonus') plans.push(actionPlan(dis, null));
  else if (hide && hide.cost === 'bonus') plans.push(actionPlan(hide, null));

  const left = Math.max(0, speed - spent);
  if (left >= FEET_PER_TILE) {
    // Recompute movement from where the attack left us — the encounter's own flood
    // was taken before the move, so this leg uses our own.
    const out = floodFrom(enc, unit, from, left);
    let best = null, bestScore = -Infinity;
    for (const t of out.values()) {
      const nearest = enemies.reduce((a, e) => Math.min(a, distanceFt(t, e)), Infinity);
      const sc = clamp(nearest, 0, 40) * 2 - threatAt(enc, unit, t) * 20
        + coverAt(enc, t, enemies.slice(0, 3)) * 3 + jitter(enc, unit, `out:${t.x},${t.y}`, 2);
      if (sc > bestScore) { bestScore = sc; best = t; }
    }
    if (best && (best.x !== from.x || best.y !== from.y)) plans.push(movePlan(best));
  }
  return compact(plans);
}

/** Archer: hold the preferred band, keep out of reach, and hunt the back line. */
function planArcher(enc, unit, infos) {
  const ai = aiBlock(unit);
  const enemies = unitsOf(enc).filter((u) => isAlive(u) && isHostile(u, unit));
  if (!enemies.length) return [];

  // Archers deliberately over-weight spellcasters and the wounded.
  const ranked = enemies
    .map((u) => ({ unit: u, score: scoreTarget(enc, unit, u) + (isCaster(u) ? 22 : 0) - distanceFt(unit, u) * 0.04 }))
    .sort((a, b) => b.score - a.score);

  const shot = infos.filter((i) => (i.cost === 'action' || i.cost === 'free')
    && (Array.isArray(i.range) ? i.range[1] : i.range) > 10);
  const band = Math.max(ai.preferredRange || 0, 30);

  // Prefer a target we can shoot without moving into anyone's reach.
  let target = ranked[0]?.unit || null;
  for (const cand of ranked) {
    if (!hasTotalCover(enc, unit, cand.unit) && shot.some((i) => distanceFt(unit, cand.unit) <= (Array.isArray(i.range) ? i.range[1] : i.range))) {
      target = cand.unit; break;
    }
  }
  if (!target) return [];

  const plans = [];
  let from = atPosition(unit);

  const tiles = reachCache(enc, unit).tiles;
  const tile = bestTile(enc, unit, tiles, {
    target, desiredRange: band, attackRange: shot.length ? shot[0].range : band,
    avoidMelee: true, enemies,
  });
  if (tile) { plans.push(movePlan(tile)); from = atPosition(unit,tile); }

  const atk = bestAttackOption(enc, unit, infos, target, from);
  if (atk) { markTarget(unit, target); plans.push(actionPlan(atk, { unit: target })); }
  else {
    // No shot: back off rather than stand there. Archers never choose melee.
    const dodge = dodgeOpt(infos);
    if (dodge) plans.push(actionPlan(dodge, null));
  }

  const bonus = bestBonusOption(enc, unit, infos, target);
  if (bonus) plans.push(actionPlan(bonus, bonus.isAttack ? { unit: target } : null));
  return compact(plans);
}

/**
 * Caster: lead with the best control or area spell if it catches two or more, else a
 * single-target nuke. Keeps whatever it is concentrating on, and gives ground once
 * bloodied — a wizard that stands next to a barbarian is a dead wizard.
 */
function planCaster(enc, unit, infos) {
  const enemies = unitsOf(enc).filter((u) => isAlive(u) && isHostile(u, unit));
  if (!enemies.length) return [];
  const ai = aiBlock(unit);
  const frac = clamp(num(unit.hp, 1) / Math.max(1, num(unit.maxHp, 1)), 0, 1);
  const band = Math.max(ai.preferredRange || 0, 40);

  const plans = [];

  // 1. Reposition first — bloodied casters retreat, healthy ones just stay clear.
  const retreating = frac <= BLOODIED;
  const tiles = reachCache(enc, unit).tiles;
  const anchor = rankTargets(enc, unit)[0]?.unit || enemies[0];
  const tile = bestTile(enc, unit, tiles, {
    target: retreating ? null : anchor,
    desiredRange: retreating ? 90 : band,
    attackRange: band, avoidMelee: true, enemies,
  });
  if (tile) plans.push(movePlan(tile));
  const from = atPosition(unit,tile || tileOf(unit));

  // 2. Area / control first if it is worth it.
  const areas = infos.filter((i) => i.cost === 'action' && i.aoe && (i.dmg > 0 || i.role === 'control'));
  let chosen = null, chosenTarget = null, chosenScore = -Infinity;
  for (const info of areas) {
    // 2024 PHB: you can only hold one Concentration spell. Do not throw away a
    // running one for something weaker.
    if (info.concentration && isConcentrating(unit)) continue;
    const spot = bestAoEOrigin(enc, ghostAt(unit, from), info, { minTargets: 2 });
    if (!spot) continue;
    const sc = spot.foes * (info.dmg || 12) * info.weight - spot.friends * 25;
    if (sc > chosenScore) { chosenScore = sc; chosen = info; chosenTarget = { x: spot.x, y: spot.y }; }
  }

  // 3. Otherwise a nuke or a control spell on the best single target.
  if (!chosen) {
    const target = rankTargets(enc, unit)[0]?.unit;
    if (target) {
      const single = infos.filter((i) => (i.cost === 'action' || i.cost === 'free') && !i.isHeal
        && !(i.concentration && isConcentrating(unit)));
      const atk = bestAttackOption(enc, unit, single, target, from);
      if (atk) { chosen = atk; chosenTarget = { unit: target }; markTarget(unit, target); }
    }
  }

  if (chosen) plans.push(actionPlan(chosen, chosenTarget));
  else {
    const dodge = dodgeOpt(infos);
    if (dodge) plans.push(actionPlan(dodge, null));
  }

  const bonus = bestBonusOption(enc, unit, infos, null);
  if (bonus && !(bonus.concentration && isConcentrating(unit))) plans.push(actionPlan(bonus, null));
  return compact(plans);
}

/** Support: patch up allies below half, buff them if nobody needs patching, else fight. */
function planSupport(enc, unit, infos) {
  const allies = rankAllies(enc, unit);
  const heals = infos.filter((i) => i.isHeal && (i.cost === 'action' || i.cost === 'bonus'));
  const buffs = infos.filter((i) => i.role === 'buff' && (i.cost === 'action' || i.cost === 'bonus'));

  // 1. Someone is down or badly hurt.
  const patient = allies.find((a) => a.down) || allies.find((a) => a.frac < BLOODIED);
  if (patient && heals.length) {
    const heal = heals.sort((a, b) => b.healAvg - a.healAvg)[0];
    const maxR = Array.isArray(heal.range) ? heal.range[1] : heal.range;
    const plans = [];
    let from = atPosition(unit);
    if (distanceFt(unit, patient.unit) > maxR) {
      const tile = bestTile(enc, unit, reachCache(enc, unit).tiles, {
        target: patient.unit, desiredRange: Math.max(5, maxR - 5), attackRange: maxR,
        avoidMelee: true, enemies: unitsOf(enc).filter((u) => isAlive(u) && isHostile(u, unit)),
      });
      if (tile) { plans.push(movePlan(tile)); from = atPosition(unit,tile); }
    }
    if (distanceFt(from, patient.unit) <= maxR) {
      plans.push(actionPlan(heal, { unit: patient.unit }));
      if (heal.cost === 'bonus') {
        const t = rankTargets(enc, unit)[0]?.unit;
        const atk = t ? bestAttackOption(enc, unit, infos, t, from) : null;
        if (atk) { markTarget(unit, t); plans.push(actionPlan(atk, { unit: t })); }
      }
      return compact(plans);
    }
  }

  // 2. Nobody bleeding: put a buff on the biggest hitter on our side.
  if (buffs.length && allies.length) {
    const bruiser = allies.slice().sort((a, b) => estimateDamage(b.unit) - estimateDamage(a.unit))[0];
    const buff = buffs[0];
    if (bruiser && !(buff.concentration && isConcentrating(unit))) {
      const maxR = Array.isArray(buff.range) ? buff.range[1] : buff.range;
      if (distanceFt(unit, bruiser.unit) <= maxR) return compact([actionPlan(buff, { unit: bruiser.unit })]);
    }
  }

  // 3. Otherwise, be a second-rank attacker.
  return planArcher(enc, unit, infos);
}

/** Ambusher: stay hidden until it can strike with Advantage, then vanish again. */
function planAmbusher(enc, unit, infos) {
  const hidden = hasCondition(unit, 'hidden') || hasCondition(unit, 'invisible') || !!conditionMech(unit).unseen;
  const ranked = rankTargets(enc, unit);
  if (!ranked.length) return [];
  const enemies = ranked.map((r) => r.unit);

  if (hidden) {
    // Attacking from hiding is the whole point: an unseen attacker has Advantage
    // (2024 PHB), and Rogue-style riders key off it. Strike the best target we can
    // actually reach without being spotted first.
    const target = ranked[0].unit;
    const plans = [];
    let from = atPosition(unit);
    const reach = reachFt(unit);
    const anyRanged = infos.some((i) => (Array.isArray(i.range) ? i.range[1] : i.range) > 10);
    if (!anyRanged && distanceFt(unit, target) > reach) {
      const tile = bestTile(enc, unit, reachCache(enc, unit).tiles, {
        target, desiredRange: reach, attackRange: reach, enemies,
      });
      if (tile) { plans.push(movePlan(tile)); from = atPosition(unit,tile); }
    }
    const atk = bestAttackOption(enc, unit, infos, target, from);
    if (atk) { markTarget(unit, target); plans.push(actionPlan(atk, { unit: target })); }
    // Melt back into the dark if the creature can Hide as a Bonus Action.
    const hide = hideOpt(infos);
    if (hide && hide.cost === 'bonus') plans.push(actionPlan(hide, null));
    return compact(plans);
  }

  // Not hidden: get to cover and disappear rather than trade in the open.
  const hide = hideOpt(infos);
  const tile = bestTile(enc, unit, reachCache(enc, unit).tiles, {
    target: null, desiredRange: 40, avoidMelee: true, enemies,
  });
  if (hide) return compact([movePlan(tile), actionPlan(hide, null)]);
  // No Hide option offered — behave like a skirmisher instead of standing about.
  return planSkirmisher(enc, unit, infos);
}

/**
 * Tank: interpose. Stand on the line between the softest ally and the nearest threat,
 * and use Shove to knock the enemy prone (Advantage for everyone else in melee).
 */
function planTank(enc, unit, infos) {
  const allies = unitsOf(enc).filter((u) => u !== unit && isAlive(u) && isAlly(u, unit));
  const enemies = unitsOf(enc).filter((u) => isAlive(u) && isHostile(u, unit));
  if (!enemies.length) return [];

  // The ally most in need of a body in front of them.
  const ward = allies
    .map((u) => ({ u, s: squishiness(enc, u) + (1 - clamp(num(u.hp, 1) / Math.max(1, num(u.maxHp, 1)), 0, 1)) * 20 }))
    .sort((a, b) => b.s - a.s)[0]?.u || null;

  const target = ward
    ? enemies.reduce((a, e) => (distanceFt(e, ward) < distanceFt(a, ward) ? e : a), enemies[0])
    : rankTargets(enc, unit)[0]?.unit;

  const plans = [];
  let from = atPosition(unit);
  const reach = reachFt(unit);
  const tile = bestTile(enc, unit, reachCache(enc, unit).tiles, {
    target, desiredRange: reach, attackRange: reach, enemies, protect: ward,
  });
  if (tile) { plans.push(movePlan(tile)); from = atPosition(unit,tile); }

  // Shove a Large-or-smaller enemy prone when it is already engaged with our ward:
  // prone costs it half its movement to stand and hands melee allies Advantage.
  const shove = shoveOpt(infos);
  const shovable = target && distanceFt(from, target) <= 5 && !hasCondition(target, 'prone');
  if (shove && shovable && shove.cost === 'bonus') plans.push(actionPlan(shove, { unit: target }));

  const atk = target ? bestAttackOption(enc, unit, infos, target, from) : null;
  if (atk) { markTarget(unit, target); plans.push(actionPlan(atk, { unit: target })); }
  else if (shove && shovable && shove.cost !== 'bonus') plans.push(actionPlan(shove, { unit: target }));
  else {
    const dodge = dodgeOpt(infos);
    if (dodge) plans.push(actionPlan(dodge, null));
  }
  return compact(plans);
}

/**
 * Boss: hits whoever threatens it most, deliberately spreads its attacks so it does
 * not waste damage on an already-dying target, and triggers phase abilities when its
 * hit points cross the thresholds in `unit.phases`.
 */
function planBoss(enc, unit, infos) {
  const enemies = unitsOf(enc).filter((u) => isAlive(u) && isHostile(u, unit));
  if (!enemies.length) return [];

  const plans = [];

  // 1. Phase abilities — a stat block may declare `phases:[{at:0.5, actionId}]`.
  const phase = phaseTrigger(enc, unit);
  if (phase) {
    const info = infos.find((i) => i.id === phase.actionId || lower(i.name) === lower(phase.name || ''));
    if (info) {
      unit._aiPhase = phase.at;
      plans.push(actionPlan(info, null));
    }
  }

  // 2. Area attacks come first if they catch a crowd — bosses fight the party, not a PC.
  const areas = infos.filter((i) => i.cost === 'action' && i.aoe && i.dmg > 0);
  let acted = false;
  for (const info of areas) {
    const spot = bestAoEOrigin(enc, unit, info, { minTargets: 2 });
    if (spot && spot.foes >= 2) {
      plans.push(actionPlan(info, { x: spot.x, y: spot.y }));
      acted = true;
      break;
    }
  }

  if (!acted) {
    // 3. Target whoever has hurt us most, weighted by everything else scoreTarget knows,
    //    but push away from the creature we hit last round so damage is spread.
    const ranked = enemies
      .map((u) => ({
        unit: u,
        score: scoreTarget(enc, unit, u)
          + clamp(threatOf(enc, unit, u) * 0.8, 0, 40)
          - (unit._aiLastTarget === u.uid ? 14 : 0)
          - (isDown(u) ? 40 : 0),
      }))
      .sort((a, b) => b.score - a.score);
    const target = ranked[0]?.unit;
    if (target) {
      let from = atPosition(unit);
      const reach = reachFt(unit);
      if (distanceFt(unit, target) > reach && !infos.some((i) => (Array.isArray(i.range) ? i.range[1] : i.range) > reach)) {
        const tile = bestTile(enc, unit, reachCache(enc, unit).tiles, {
          target, desiredRange: reach, attackRange: reach, enemies,
        });
        if (tile) { plans.push(movePlan(tile)); from = atPosition(unit,tile); }
      }
      const atk = bestAttackOption(enc, unit, infos, target, from);
      if (atk) {
        unit._aiLastTarget = target.uid;
        markTarget(unit, target);
        plans.push(actionPlan(atk, { unit: target }));
      }
    }
  }

  const bonus = bestBonusOption(enc, unit, infos, null);
  if (bonus) plans.push(actionPlan(bonus, null));
  return compact(plans);
}

/**
 * Has the boss just crossed a phase threshold? `unit.phases` is an optional list of
 * { at: 0.5, actionId, name, once } entries — `at` is a fraction of maximum hit points.
 */
export function phaseTrigger(enc, unit) {
  const frac = clamp(num(unit?.hp, 1) / Math.max(1, num(unit?.maxHp, 1)), 0, 1);
  let best = null;
  for (const p of arr(unit?.phases)) {
    if (!p || frac > num(p.at, 0)) continue;
    if (p.once !== false && num(unit._aiPhase, 2) <= num(p.at, 0)) continue;
    if (!best || num(p.at, 0) > num(best.at, 0)) best = p;
  }
  return best;
}

const PLANNERS = {
  brute: planBrute,
  skirmisher: planSkirmisher,
  archer: planArcher,
  caster: planCaster,
  support: planSupport,
  ambusher: planAmbusher,
  swarm: planSwarm,
  tank: planTank,
  boss: planBoss,
};

// ---------------------------------------------------------------------------
// Companion AI — party members the player has set to "auto"
// ---------------------------------------------------------------------------

/**
 * A simple, competent version of the same brain for allied characters, biased toward
 * keeping the party standing: pick up downed friends, heal at the right moment, and
 * otherwise fight from whichever range the character's own kit favours.
 */
export function companionTurn(enc, unit) {
  const infos = optionsFor(enc, unit);
  if (!infos.length) return [endPlan()];

  const allies = rankAllies(enc, unit);
  const heals = infos.filter((i) => i.isHeal);

  // 1. A friend at 0 hit points is the emergency. Healing Word style bonus-action
  //    heals are ideal: one hit point puts them back on their feet with an action to
  //    spare (2024 PHB — you stop dying the moment you regain any hit points).
  const downed = allies.find((a) => a.down);
  if (downed && heals.length) {
    const bonusHeal = heals.find((h) => h.cost === 'bonus');
    const heal = bonusHeal || heals.sort((a, b) => b.healAvg - a.healAvg)[0];
    const maxR = Array.isArray(heal.range) ? heal.range[1] : heal.range;
    const plans = [];
    let from = atPosition(unit);
    if (distanceFt(unit, downed.unit) > maxR) {
      const tile = bestTile(enc, unit, reachCache(enc, unit).tiles, {
        target: downed.unit, desiredRange: Math.max(5, maxR - 5), attackRange: maxR,
        enemies: unitsOf(enc).filter((u) => isAlive(u) && isHostile(u, unit)),
      });
      if (tile) { plans.push(movePlan(tile)); from = atPosition(unit,tile); }
    }
    if (distanceFt(from, downed.unit) <= maxR) {
      plans.push(actionPlan(heal, { unit: downed.unit }));
      if (heal.cost === 'bonus') {
        const t = rankTargets(enc, unit)[0]?.unit;
        const atk = t ? bestAttackOption(enc, unit, infos, t, from) : null;
        if (atk) plans.push(actionPlan(atk, { unit: t }));
      }
      plans.push(endPlan());
      return compact(plans);
    }
  }

  // 2. Heal a badly wounded ally — but only once they are low enough that the dice
  //    will not be wasted (a heal on someone at 80% is a wasted turn).
  const hurt = allies.find((a) => !a.down && a.frac <= 0.35);
  if (hurt && heals.length) {
    const heal = heals.sort((a, b) => b.healAvg - a.healAvg)[0];
    const maxR = Array.isArray(heal.range) ? heal.range[1] : heal.range;
    if (distanceFt(unit, hurt.unit) <= maxR) {
      const plans = [actionPlan(heal, { unit: hurt.unit })];
      if (heal.cost === 'bonus') {
        const t = rankTargets(enc, unit)[0]?.unit;
        const atk = t ? bestAttackOption(enc, unit, infos, t) : null;
        if (atk) plans.push(actionPlan(atk, { unit: t }));
      }
      plans.push(endPlan());
      return compact(plans);
    }
  }

  // 3. Drink a potion rather than fall over.
  const frac = clamp(num(unit.hp, 1) / Math.max(1, num(unit.maxHp, 1)), 0, 1);
  if (frac <= 0.25) {
    const potion = healingItemOption(infos);
    if (potion) return compact([actionPlan(potion, { unit }), endPlan()]);
  }

  // 4. Fight in whichever style the character's kit implies.
  const style = companionStyle(unit, infos);
  const planner = PLANNERS[style] || planBrute;
  const plans = planner(enc, unit, infos);
  plans.push(endPlan());
  return compact(plans);
}

/** Guess how a party member likes to fight from their spells and weapons. */
function companionStyle(unit, infos) {
  const declared = lower(unit?.ai?.archetype);
  if (ARCHETYPES.includes(declared)) return declared;
  if (infos.some((i) => i.isHeal)) return 'support';
  const bestRanged = infos.reduce((a, i) => Math.max(a, (Array.isArray(i.range) ? i.range[1] : i.range) || 0), 0);
  if (infos.some((i) => i.spell && i.dmg > 0) && bestRanged >= 60) return 'caster';
  if (bestRanged >= 60) return 'archer';
  if (hasCondition(unit, 'hidden')) return 'ambusher';
  return 'brute';
}

// ---------------------------------------------------------------------------
// The entry point
// ---------------------------------------------------------------------------

/**
 * Decide a creature's whole turn.
 * Returns an ordered Plan[] ending in { kind:'end' }. The encounter executes them in
 * order and is free to stop early if one fails — every plan is independently legal at
 * the moment it is reached, and nothing here mutates the encounter.
 */
export function takeTurn(enc, unit) {
  const plans = [];
  try {
    if (!unit) return [endPlan()];
    if (!canAct(unit)) return [endPlan()];

    // A party-side character on auto-pilot uses the companion brain.
    const ai = aiBlock(unit);
    const friendly = unit.side === 'party' || (unit.kind !== 'monster' && unit.side !== 'foe');
    if (friendly || ai.auto) return companionTurn(enc, unit);

    const infos = optionsFor(enc, unit);
    if (!infos.length) return [endPlan()];

    // Self-preservation overrides the archetype entirely.
    const flee = selfPreservePlan(enc, unit, infos);
    if (flee && flee.length) { plans.push(...flee); plans.push(endPlan()); return plans; }

    const planner = PLANNERS[ai.archetype] || planBrute;
    const made = planner(enc, unit, infos) || [];
    plans.push(...made);

    // Nothing useful: at least defend. Dodging imposes Disadvantage on attacks
    // against you until your next turn (2024 PHB) — never just stand there.
    if (!made.length) {
      const dodge = dodgeOpt(infos);
      if (dodge) plans.push(actionPlan(dodge, null));
    }
  } catch (e) {
    console.error('[ai] takeTurn failed', e);
    return [endPlan()];
  }
  plans.push(endPlan());
  return compact(plans);
}

/**
 * What a legendary creature should do with a legendary action between turns.
 * combat.js calls this once per legendary action it wants to spend; `budget` is how
 * many legendary points remain. Returns Plan[] (no 'end' — this is not a turn).
 */
export function legendaryPlan(enc, unit, budget = 1) {
  try {
    if (!unit || !canAct(unit)) return [];
    const list = arr(unit.legendary?.actions);
    if (!list.length) return [];
    const idx = actionIndex(unit);
    const infos = list
      .map((a) => {
        // "Morningstar Swing" with ref:'morningstar' IS that attack — fold the
        // stat-block action in so range and damage are the real ones.
        const base = a.ref ? idx.get(lower(a.ref)) : null;
        const act = base ? { ...base, id: a.id, name: a.name || base.name, cost: a.cost, ai: a.ai || base.ai } : a;
        // Described as an 'action' so bestAttackOption will consider it; the real
        // price is legendary uses, which combat.js charges.
        return describeOption(enc, unit, {
          id: a.id, kind: lower(act.kind) === 'attack' ? 'attack' : 'special',
          name: a.name, cost: 'action', action: act, enabled: true,
          targeting: act.targeting || null,
        }, idx);
      })
      .filter((i) => i && num(i.act?.cost, 1) <= num(budget, 1));
    if (!infos.length) return [];

    // A legendary creature between turns wants tempo: an area effect that catches the
    // party, else a swipe at whoever is hurting it most.
    for (const info of infos) {
      if (!info.aoe) continue;
      const spot = bestAoEOrigin(enc, unit, info, { minTargets: 2 });
      if (spot) return [actionPlan(info, { x: spot.x, y: spot.y })];
    }
    const ranked = rankTargets(enc, unit);
    const target = ranked.find((r) => !isDown(r.unit))?.unit || ranked[0]?.unit;
    if (!target) return [];
    const atk = bestAttackOption(enc, unit, infos, target) || infos[0];
    return atk ? [actionPlan(atk, { unit: target })] : [];
  } catch (e) {
    console.error('[ai] legendaryPlan failed', e);
    return [];
  }
}

/**
 * What to do with a reaction. `trigger` describes why we were asked:
 *   { kind:'opportunity', mover }  — someone left our reach
 *   { kind:'attacked', attacker, damage } — we are being hit
 * Returns Plan[] (usually a single action) or [] to decline.
 */
export function reactionPlan(enc, unit, trigger = {}) {
  try {
    if (!unit || !canAct(unit)) return [];
    if (conditionMech(unit).noReactions) return [];
    const infos = optionsFor(enc, unit).filter((i) => i.cost === 'reaction');
    const ai = aiBlock(unit);

    if (lower(trigger.kind) === 'opportunity' && trigger.mover) {
      // Cowardly creatures let a fleeing enemy go; aggressive ones never do.
      if (ai.aggression < 0.3 && jitter(enc, unit, `oa:${trigger.mover.uid}`, 1) < 0) return [];
      const oa = infos.find((i) => i.isAttack) || null;
      if (oa) return [actionPlan(oa, { unit: trigger.mover })];
      // Engines usually synthesise the OA themselves; signal willingness either way.
      return [{ kind: 'action', optionId: 'opportunity-attack', target: { unit: trigger.mover } }];
    }

    if (infos.length) {
      // Shield-style defensive reactions when the blow would actually land.
      const shield = infos.find((i) => /shield|parry|deflect|uncanny/.test(lower(`${i.id} ${i.name}`)));
      if (shield) return [actionPlan(shield, trigger.attacker ? { unit: trigger.attacker } : null)];
    }
    return [];
  } catch {
    return [];
  }
}

/** Clear the per-round "someone is already on this target" marks. combat.js may call it. */
export function clearMarks(enc) {
  for (const u of unitsOf(enc)) { u._aiMarked = false; u._aiMarkedBy = null; }
}
