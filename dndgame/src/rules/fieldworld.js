// rules/fieldworld.js — what a spell can reach out and touch on the map, and the
// mundane skills that compete with it.
//
// rules/fieldcast.js decides what a spell DOES; this module is the set of world
// verbs it cannot do on its own because they need the overworld scene: the
// nearest locked chest for Knock, the fog of war for Clairvoyance, the person
// you are facing for Charm Person. Every function here is pure in the sense
// that it takes the scene (and/or the map, the entity list, the party, the
// GameState) as arguments and never imports the overworld — world/overworld.js
// imports THIS, builds its hook bundle with `fieldHooks(scene)`, and hands it
// to the spellbook.
//
// It also owns the non-magical answers to the same problems, so that Knock is
// an alternative to picking a lock rather than the only way through it:
//
//   tryPickLock(party, entity)   thieves' tools vs the lock's DC
//   tryDisarm(party, entity)     thieves' tools vs the trap's DC
//   springTrap(party, entity)    what happens when you get it wrong
//
// …and the movement/perception mechanics that field buffs feed:
//
//   fieldMovement(ch)            fly / water walk / spider climb / longstrider
//   encounterFactor(party)       a steed or Pass Without Trace thins the wilds
//   perceptionPenalty(scene, ch) darkness without a light is disadvantage
//
// …and the four world-scale terrain spells, which change the world rather than
// the party (§3b): Control Weather sets the sky, Guards and Wards seals a map,
// Move Earth grades the road and Mirage Arcane hides the party's trail.
//
//   setWeather / wardAgainstIntrusion / easeTravel / maskTerrain   the writers
//   terrainEncounterFactor(st, mapId)                              the reader
//
// Headless: nothing here draws. Scene fields it reads/writes are documented on
// each function; the overworld patch that wires them is small on purpose.

import { TILE, titleCase } from '../constants.js';
import { rng } from '../core/rng.js';
import { d20 } from '../core/dice.js';
import { bus, EV } from '../core/events.js';
import { resolveItem, isMagic } from '../data/items.js';
import { getNPC } from '../data/npcs.js';
import { QUESTS } from '../data/quests.js';
import { randomRumor } from '../data/tables.js';
import { setFlag, hasFlag } from '../state.js';
import { abilityMod, hasProf, profBonus, mechOf, skillMod, isDead, damage as damageChar } from './character.js';
import { conditionMech } from './conditions.js';
import { abilityCheck } from './actions.js';
import { clockMinutes } from './fieldcast.js';
import { calmWitnesses } from './crime.js';

const arr = (v) => (Array.isArray(v) ? v : []);
const obj = (v) => (v && typeof v === 'object' ? v : {});
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
function safe(fn, fb) { try { const v = fn(); return v === undefined ? fb : v; } catch (e) { return fb; } }

/** Tile flags, mirrored from world/tilemap.js so this module stays import-light. */
const TF_SOLID = 1, TF_WATER = 2, TF_LEDGE = 32, TF_SLOW = 64;

/** The entity list as a plain array, whatever shape the scene keeps it in. */
function entitiesOf(scene) {
  const s = obj(scene);
  const el = s.entities;
  if (!el) return [];
  if (Array.isArray(el)) return el;
  if (Array.isArray(el.list)) return el.list;
  if (typeof el[Symbol.iterator] === 'function') return Array.from(el);
  return [];
}

function playerOf(scene) {
  const s = obj(scene);
  if (s.player && Number.isFinite(s.player.x)) return s.player;
  const st = s.state || null;
  return st ? { x: num(st.x), y: num(st.y), dir: st.dir || 'down' } : { x: 0, y: 0, dir: 'down' };
}

/** Chebyshev distance in tiles — how the overworld measures "within reach". */
function dist(a, b) { return Math.max(Math.abs(num(a.x) - num(b.x)), Math.abs(num(a.y) - num(b.y))); }

/** "north-east, about 40 feet" — the line every locate/detect verb ends with. */
export function bearingText(from, to) {
  const dx = num(to.x) - num(from.x), dy = num(to.y) - num(from.y);
  const feet = Math.max(Math.abs(dx), Math.abs(dy)) * 5;
  if (feet === 0) return 'right here';
  const ns = dy < 0 ? 'north' : dy > 0 ? 'south' : '';
  const ew = dx > 0 ? 'east' : dx < 0 ? 'west' : '';
  // Only name the minor axis when it is at least a third of the major one.
  const major = Math.max(Math.abs(dx), Math.abs(dy)), minor = Math.min(Math.abs(dx), Math.abs(dy));
  let dir;
  if (minor * 3 < major) dir = Math.abs(dx) >= Math.abs(dy) ? ew : ns;
  else dir = `${ns}-${ew}`;
  return `${dir}, about ${feet} feet`;
}

// ===========================================================================
// 1. WHO AND WHAT IS IN FRONT OF YOU
// ===========================================================================

/** The NPC entity the leader is facing, or null. */
export function facingNPC(scene) {
  const p = playerOf(scene);
  const front = typeof p.frontTile === 'function' ? p.frontTile() : null;
  if (!front) return null;
  const list = obj(scene).entities;
  const e = list && typeof list.interactableAt === 'function'
    ? safe(() => list.interactableAt(front.x, front.y), null)
    : entitiesOf(scene).find((x) => x && !x.removed && x.x === front.x && x.y === front.y) || null;
  return e && e.kind === 'npc' ? e : null;
}

/** Everything of `kind` within `range` tiles of the leader, nearest first. */
export function nearby(scene, kind, range = 6) {
  const p = playerOf(scene);
  return entitiesOf(scene)
    .filter((e) => e && !e.removed && (!kind || e.kind === kind) && dist(e, p) <= range)
    .sort((a, b) => dist(a, p) - dist(b, p));
}

// ===========================================================================
// 2. LOCKS AND TRAPS
// ===========================================================================

function lockedThings(scene) {
  const out = [];
  for (const e of entitiesOf(scene)) {
    if (!e || e.removed) continue;
    if (e.kind === 'chest' && e.locked && !e.opened) out.push({ kind: 'chest', e, x: e.x, y: e.y });
    else if (e.kind === 'door' && e.locked && !(typeof e.isLocked === 'function' && !e.isLocked())) out.push({ kind: 'door', e, x: e.x, y: e.y });
  }
  // Map-authored locked doors are triggers, not entities (see _blockedByLock).
  const map = obj(scene).map;
  for (const t of arr(map && map.triggers)) {
    if (!t) continue;
    const d = t.data || {};
    if (d.locked || t.kind === 'locked-door' || d.kind === 'locked-door') out.push({ kind: 'trigger', e: t, d, x: t.x, y: t.y });
  }
  return out;
}

function nameOf(thing) {
  const e = thing.e || {};
  if (thing.kind === 'chest') return e.name || 'The chest';
  if (thing.kind === 'door') return e.name || 'The door';
  return (thing.d && thing.d.name) || 'The door';
}

/**
 * Knock: the nearest locked chest or door within `range` tiles gives up.
 * @returns {{ok:boolean, text:string, target?:object}}
 */
export function unlockNearest(scene, st, range = 12) {
  const p = playerOf(scene);
  let best = null, bestD = 99;
  for (const t of lockedThings(scene)) {
    const d = dist(t, p);
    if (d <= range && d < bestD) { best = t; bestD = d; }
  }
  if (!best) return { ok: false, text: 'Nothing within reach is locked.' };

  const e = best.e;
  if (best.kind === 'trigger') {
    best.d.locked = false;
  } else {
    e.locked = false;
    e.keyId = null;
    e.arcaneLocked = false;
    // A door that a story flag opens is now open for good — the flag is the
    // save-file's memory of it, so set it rather than only the live entity.
    if (best.kind === 'door' && e.flag && st) setFlag(st, e.flag, true);
  }
  // Loud enough to be heard three hundred feet away, as advertised.
  for (const n of entitiesOf(scene)) {
    if (n && n.kind === 'npc' && dist(n, best) <= 8) safe(() => n.faceToward && n.faceToward(best.x, best.y));
  }
  return { ok: true, text: `${nameOf(best)} springs open with a loud metallic knock.`, target: e };
}

/** Arcane Lock: the chest or door you are touching becomes locked, DC +10. */
export function lockNearest(scene, dcBonus = 10) {
  const p = playerOf(scene);
  const cands = entitiesOf(scene).filter((e) => e && !e.removed && (e.kind === 'chest' || e.kind === 'door') && dist(e, p) <= 1);
  const e = cands.find((c) => !c.locked && !(c.kind === 'chest' && c.opened)) || null;
  if (!e) return { ok: false, text: cands.length ? 'It is already locked.' : 'There is nothing here to lock.' };
  e.locked = true;
  e.arcaneLocked = true;
  e.dc = Math.max(15, num(e.dc, 15)) + num(dcBonus, 10);
  if (e.kind === 'door') e.lockedText = e.lockedText || 'The door is held shut by something more than iron.';
  return { ok: true, text: `${e.name || (e.kind === 'chest' ? 'The chest' : 'The door')} seals itself with a faint blue shimmer.` };
}

/** The best lockpick in the party and whether they are trained for it. */
function bestWith(party, ability, toolId) {
  const members = arr(party && party.members).filter((m) => m && m.hp > 0);
  let best = null, bestV = -99;
  for (const m of members) {
    const prof = safe(() => hasProf(m, 'tool', toolId), false);
    const v = safe(() => abilityMod(m, ability), 0) + (prof ? safe(() => profBonus(m), 2) : 0);
    if (v > bestV) { bestV = v; best = m; }
  }
  return best ? { ch: best, prof: safe(() => hasProf(best, 'tool', toolId), false) } : null;
}

/** DC of a chest or door lock; authored 0 means "an ordinary lock". */
export function lockDC(entity) {
  const e = obj(entity);
  return Math.max(10, num(e.dc, 0) || 15);
}

/**
 * Pick a lock with thieves' tools. One attempt per lock per day — a failed
 * pick jams it until you sleep on the problem.
 * @returns {{ok:boolean, text:string, roll?:object, tried:boolean}}
 */
export function tryPickLock(party, entity, st = null) {
  const e = entity;
  if (!e) return { ok: false, tried: false, text: 'Nothing to pick.' };
  if (!(party && typeof party.hasItem === 'function' && party.hasItem('thieves-tools'))) {
    return { ok: false, tried: false, text: "You would need thieves' tools for that." };
  }
  if (e.arcaneLocked) return { ok: false, tried: false, text: 'The picks find no tumblers. This lock is held by magic.' };
  const day = st ? num(st.day, 0) : 0;
  if (e._pickedDay === day && e._pickFailed) return { ok: false, tried: false, text: 'You jammed it earlier. Sleep on it.' };

  const who = bestWith(party, 'dex', 'thieves-tools');
  if (!who) return { ok: false, tried: false, text: 'Nobody has steady enough hands.' };
  const dc = lockDC(e);
  const res = safe(() => abilityCheck(null, who.ch, 'dex', { dc, proficient: who.prof }), null);
  const ok = !!(res && res.success);
  e._pickedDay = day;
  e._pickFailed = !ok;
  if (ok) { e.locked = false; e.keyId = null; }
  const total = res ? res.total : 0;
  return {
    ok, tried: true, roll: res, dc, who: who.ch,
    text: ok
      ? `${who.ch.name} works the picks (${total} vs DC ${dc}) and the lock gives.`
      : `${who.ch.name} works the picks (${total} vs DC ${dc}) — a tumbler snaps. Jammed till tomorrow.`,
  };
}

/** A trap on a chest becomes visible; Find Traps and a good Perception both use it. */
export function revealTrap(entity) {
  const e = entity;
  if (!e || !e.trapped || e.trapDisarmed) return false;
  e.trapKnown = true;
  return true;
}

/** Notice a trap by passive Perception before the lid comes up. */
export function noticeTrap(party, entity) {
  const e = entity;
  if (!e || !e.trapped || e.trapKnown || e.trapDisarmed) return false;
  let best = 0;
  for (const m of arr(party && party.members)) {
    if (!m || m.hp <= 0) continue;
    best = Math.max(best, num(safe(() => skillMod(m, 'perception').passive, 10), 10));
  }
  const dc = Math.max(10, num(e.trapped.dc, 13));
  if (best >= dc) { e.trapKnown = true; return true; }
  return false;
}

/**
 * Find Traps / Glyph of Warding cast on somebody else's glyph: the nearest
 * trapped thing within reach gives itself away, and if the party has picks in
 * the pack they get a free attempt at it on the spot.
 */
export function trapNearest(scene, party, st, range = 8) {
  const p = playerOf(scene);
  const cands = entitiesOf(scene)
    .filter((e) => e && !e.removed && e.trapped && !e.trapDisarmed && dist(e, p) <= range)
    .sort((a, b) => dist(a, p) - dist(b, p));
  const e = cands[0] || null;
  if (!e) return { ok: false, text: 'Nothing within reach is trapped — which is worth knowing.' };
  const fresh = revealTrap(e);
  const dis = safe(() => tryDisarm(party, e, st), null);
  const name = e.name || 'the chest';
  const head = fresh ? `A ${e.trapped.type || 'needle'} in ${name}, and now you can see it.` : `The trap in ${name} is still there.`;
  return { ok: true, target: e, text: dis && dis.tried ? `${head} ${dis.text}` : head };
}

/** Disarm a known trap with thieves' tools. */
export function tryDisarm(party, entity, st = null) {
  const e = entity;
  if (!e || !e.trapped) return { ok: false, tried: false, text: 'There is no trap here.' };
  if (e.trapDisarmed) return { ok: false, tried: false, text: 'Already dealt with.' };
  if (!(party && typeof party.hasItem === 'function' && party.hasItem('thieves-tools'))) {
    return { ok: false, tried: false, text: "You would need thieves' tools for that." };
  }
  const who = bestWith(party, 'dex', 'thieves-tools');
  if (!who) return { ok: false, tried: false, text: 'Nobody has steady enough hands.' };
  const dc = Math.max(10, num(e.trapped.dc, 15));
  const res = safe(() => abilityCheck(null, who.ch, 'dex', { dc, proficient: who.prof }), null);
  const ok = !!(res && res.success);
  if (ok) { e.trapDisarmed = true; e.trapKnown = true; return { ok, tried: true, roll: res, dc, who: who.ch, text: `${who.ch.name} eases the ${e.trapped.type || 'needle'} out (${res.total} vs DC ${dc}).` }; }
  // A bad failure sets it off in your hands.
  const sprung = res && res.total <= dc - 5 ? springTrap(party, e, st) : null;
  return {
    ok: false, tried: true, roll: res, dc, who: who.ch, sprung,
    text: sprung ? `${who.ch.name} slips (${res.total} vs DC ${dc}) — ${sprung.text}` : `${who.ch.name} cannot find the catch (${res.total} vs DC ${dc}).`,
  };
}

/**
 * The trap goes off on whoever opened it. `damage` is a dice expression,
 * `type` a damage type ('poison' also poisons on a failed CON save).
 */
export function springTrap(party, entity, st = null) {
  const e = entity;
  const trap = e && e.trapped;
  if (!trap || e.trapDisarmed || e.trapSprung) return null;
  e.trapSprung = true;
  const victim = arr(party && party.members).find((m) => m && m.hp > 0) || null;
  if (!victim) return { text: 'a trap snaps on empty air.', dealt: 0 };
  const dice = String(trap.damage || '1d10');
  let rolled = 0;
  try { rolled = rng.int ? 0 : 0; } catch (err) { rolled = 0; }
  rolled = safe(() => rollDiceExpr(dice), 5);
  const dc = Math.max(10, num(trap.dc, 13));
  const save = safe(() => d20(safe(() => abilityMod(victim, 'dex'), 0), { dc }, rng), null);
  const half = save && save.total >= dc;
  const amount = half ? Math.floor(rolled / 2) : rolled;
  const res = safe(() => damageChar(victim, amount, trap.type || 'piercing'), { dealt: amount });
  const dealt = res ? num(res.dealt, amount) : amount;
  return {
    text: `a ${trap.type || 'needle'} trap catches ${victim.name} for ${dealt}${half ? ' (dodged the worst)' : ''}.`,
    dealt, victim, half,
  };
}

function rollDiceExpr(expr) {
  const m = String(expr).match(/^(\d*)d(\d+)([+-]\d+)?$/);
  if (!m) return Math.max(1, num(expr, 1));
  const n = m[1] === '' ? 1 : parseInt(m[1], 10);
  let t = 0;
  for (let i = 0; i < n; i++) t += rng.int(1, parseInt(m[2], 10));
  return t + (m[3] ? parseInt(m[3], 10) : 0);
}

// ===========================================================================
// 3. LIGHT, DARKNESS AND KEEPING WATCH
// ===========================================================================

/**
 * Cast light: a pool that follows the party. Daylight also counts as
 * sunlight, which the darkness pass and perceptionPenalty both honour.
 * Writes `scene.spellLight = { radius, spellId, until, sunlight }`.
 */
export function castLight(scene, st, radiusFeet, spellId, minutes, mech = {}) {
  const s = scene;
  if (!s) return { ok: false };
  const feet = Math.max(5, num(radiusFeet, 20));
  s.spellLight = {
    radius: feet / 5 * TILE,
    spellId: spellId || 'light',
    until: st && minutes != null ? clockMinutes(st) + minutes : null,
    sunlight: !!(mech && mech.dispelsDarkness),
  };
  return { ok: true, sunlight: s.spellLight.sunlight };
}

/** Is there any light on the party right now? */
export function hasLight(scene, party = null) {
  const s = obj(scene);
  if (s.spellLight) return true;
  if (party && typeof party.hasItem === 'function' && (party.hasItem('torch') || party.hasItem('lantern') || party.hasItem('lantern-hooded'))) return true;
  return false;
}

/**
 * Darkness without a light is Disadvantage on sight-based checks — unless the
 * one looking has darkvision. Returns { dis, why } for abilityCheck's `dis`.
 */
export function perceptionPenalty(scene, ch = null, party = null) {
  const s = obj(scene);
  const map = obj(s.map);
  const dark = num(map.dark, 0);
  if (dark <= 0.3) return { dis: false, why: '' };
  if (s.spellLight) return { dis: false, why: '' };
  if (hasLight(scene, party)) return { dis: false, why: '' };
  if (ch && num(safe(() => mechOf(ch).darkvision, 0), 0) > 0) return { dis: false, why: '' };
  return { dis: true, why: 'the dark' };
}

/**
 * Alarm / Glyph of Warding: a warded camp. `st.flags.alarmActive =
 * { mapId, until }` — restui's night watch reads it (no ambush, advantage
 * on the watcher's roll while it lasts).
 */
export function wardArea(scene, st, minutes = 480) {
  if (!st) return { ok: false, text: 'The ward will not take.' };
  const mapId = (obj(scene).map && obj(scene).map.id) || st.mapId || null;
  st.flags = st.flags || {};
  st.flags.alarmActive = { mapId, until: clockMinutes(st) + Math.max(10, num(minutes, 480)) };
  return { ok: true, text: 'A thread of the Weave stretches across every approach. Nothing crosses it unheard.' };
}

export function alarmActive(st, mapId = null) {
  const a = st && st.flags && st.flags.alarmActive;
  if (!a || typeof a !== 'object') return false;
  if (a.until != null && clockMinutes(st) >= a.until) return false;
  if (mapId && a.mapId && a.mapId !== mapId) return false;
  return true;
}

/**
 * Rope Trick, Meld into Stone, the Magnificent Mansion: a place nothing can
 * reach you. `st.flags.sanctuary = { mapId, until }` — the rest screen treats
 * the camp as sheltered while it lasts.
 */
export function makeSanctuary(scene, st, minutes = 480, name = 'the bolt-hole') {
  if (!st) return { ok: false, text: 'It will not hold.' };
  const mapId = (obj(scene).map && obj(scene).map.id) || st.mapId || null;
  st.flags = st.flags || {};
  st.flags.sanctuary = { mapId, until: clockMinutes(st) + Math.max(60, num(minutes, 480)), name };
  return { ok: true, text: `The party may rest in ${name}; nothing on this map can reach them till it fades.` };
}

export function sanctuaryActive(st, mapId = null) {
  const a = st && st.flags && st.flags.sanctuary;
  if (!a || typeof a !== 'object') return false;
  if (a.until != null && clockMinutes(st) >= a.until) return false;
  if (mapId && a.mapId && a.mapId !== mapId) return false;
  return true;
}

// ===========================================================================
// 3b. THE SKY, THE WARD AND THE LIE OF THE LAND
// ===========================================================================
//
// The four world-scale terrain spells. Control Weather, Guards and Wards, Move
// Earth and Mirage Arcane all describe changes a tile engine cannot literally
// redraw — five miles of sky, a whole stronghold, a square mile of illusion —
// so each is landed on the one piece of world state the game actually reads:
// `st.weather` for the sky, and a dated flag on `st.flags` for the other three.
//
// Every flag is the shape wardArea() established above: `{ mapId, until }` in
// absolute clock minutes, so it survives a save, expires by itself, and is read
// back by a one-line predicate rather than by a scan.

/** A `{ mapId, until }` flag that is still running here, or null. */
function liveFlag(st, key, mapId = null) {
  const a = st && st.flags && st.flags[key];
  if (!a || typeof a !== 'object') return null;
  if (a.until != null && clockMinutes(st) >= a.until) return null;
  if (mapId && a.mapId && a.mapId !== mapId) return null;
  return a;
}

/**
 * The weather words the engine can actually draw, ordered calm to fierce.
 * state.tickWeather rolls them and overworld._applyWeather turns them into
 * particles; 'ash' is off the ladder because ashfall over the Ashenwood is
 * geology, not weather, and no spell calls it down.
 *
 * Control Weather's three 2024 tracks (precipitation, temperature, wind) are
 * collapsed onto this one ladder because the renderer holds one sky at a time:
 * shifting a stage toward 'snow' IS the temperature track, and a stage toward
 * 'clear' is all three at once.
 */
export const WEATHER_STAGES = Object.freeze(['clear', 'fog', 'rain', 'snow']);

/**
 * Control Weather. Walks the sky one stage at a time toward `want`, taking the
 * spell's own `changeMinutes` (10) for each stage, and refuses under a roof.
 *
 * With no `want` the spell does the thing it is nearly always cast for: it
 * clears a foul sky, or — if the day is already fine — calls up the fog that
 * hides a column crossing the Triboar Trail.
 *
 * `st.weatherTimer` is state.tickWeather's countdown in REAL seconds, so an
 * eight-hour spell cannot be expressed in it exactly; the called weather is
 * pinned for a long play session and then drifts naturally, which is closer to
 * the fiction than a sky that snaps back three minutes after an 8th-level slot.
 *
 * @returns {{ok:boolean, text:string, weather?:string, from?:string, stages?:number, minutes?:number}}
 */
export function setWeather(scene, st, want = null, mech = {}, holdMinutes = 480) {
  if (!st) return { ok: false, text: 'There is no sky here to answer you.' };
  const map = obj(obj(scene).map);
  if (map.indoor) {
    return { ok: false, text: 'A roof is a small thing, and it is between you and five miles of sky.' };
  }
  const cur = String(st.weather || 'clear');
  // Anything off the ladder ('ash', a map's own standing weather) counts as the
  // fierce end, so the first shift is always toward a kinder sky.
  let from = WEATHER_STAGES.indexOf(cur);
  if (from < 0) from = WEATHER_STAGES.length - 1;
  const target = String(want || (WEATHER_STAGES[from] === 'clear' ? 'fog' : 'clear'));
  const to = WEATHER_STAGES.indexOf(target);
  if (to < 0) return { ok: false, text: `${titleCase(target)} is not weather this sky knows.` };

  const per = Math.max(1, num(mech && mech.shiftStagesPerChange, 1));
  const each = Math.max(1, num(mech && mech.changeMinutes, 10));
  const stages = Math.ceil(Math.abs(to - from) / per);

  st.weather = WEATHER_STAGES[to];
  // A map that carries its own standing weather (the Mere's fog) overrides
  // st.weather in overworld._weatherNow, so the spell has to say it twice.
  if (obj(scene).map) obj(scene).map.weather = st.weather;
  st.weatherTimer = Math.max(num(st.weatherTimer, 0), 3600);
  st.flags = st.flags || {};
  st.flags.controlWeather = {
    mapId: map.id || st.mapId || null,
    until: clockMinutes(st) + Math.max(60, num(holdMinutes, 480)),
    weather: st.weather,
  };
  return {
    ok: true, weather: st.weather, from: cur, stages, minutes: stages * each,
    text: stages === 0
      ? `The sky holds where it is, and will hold.`
      : `${stages === 1 ? 'Over ten minutes' : `Over ${stages * each} minutes`} the sky turns: ${weatherLine(st.weather)}`,
  };
}

/** What the called sky looks like when it arrives. */
function weatherLine(w) {
  switch (String(w)) {
    case 'fog': return 'a grey wall of fog comes up out of the ground and sits down on the road.';
    case 'rain': return 'cloud piles in off the Sword Coast and the rain comes straight down.';
    case 'snow': return 'the cold arrives first, and then the snow, thick and silent.';
    default: return 'the cloud tears open and the day is suddenly clean.';
  }
}

/** Is the sky under a spell here? Optional wiring for state.tickWeather. */
export function weatherHeld(st, mapId = null) { return !!liveFlag(st, 'controlWeather', mapId); }

/**
 * Guards and Wards: fogged corridors, webbed stairs, locked doors and a hallway
 * that is a lie, laid over a whole stronghold for a day.
 *
 * `st.flags.guardsWards = { mapId, until }` — the same shape as alarmActive and
 * a good deal stronger: nothing wanders in while it holds. It ALSO refreshes
 * alarmActive for the same span, so ui/restui.js's night watch gets the benefit
 * without knowing this spell exists.
 */
export function wardAgainstIntrusion(scene, st, minutes = 1440) {
  if (!st) return { ok: false, text: 'There is nothing here to hang a ward on.' };
  const mapId = (obj(scene).map && obj(scene).map.id) || st.mapId || null;
  const until = clockMinutes(st) + Math.max(60, num(minutes, 1440));
  st.flags = st.flags || {};
  st.flags.guardsWards = { mapId, until };
  st.flags.alarmActive = { mapId, until };
  return {
    ok: true, mapId, until,
    text: 'Fog fills the corridors, the stairs go over to webs, every door forgets how to open, and one hallway starts telling lies. Nothing walks in here uninvited today.',
  };
}

/** Does Guards and Wards still hold on this map? */
export function wardedAgainstIntrusion(st, mapId = null) { return !!liveFlag(st, 'guardsWards', mapId); }

/**
 * Move Earth: two hours of walking hills, which at this engine's scale means
 * the party's next stretch of road has been graded flat — the gullies filled,
 * the ridge cut through, the bog banked over.
 *
 * `st.flags.easedTravel = { mapId, until, factor }`.
 */
export function easeTravel(scene, st, minutes = 60, factor = 0.6) {
  if (!st) return { ok: false, text: 'There is no ground here to work.' };
  const map = obj(obj(scene).map);
  if (map.indoor) return { ok: false, text: 'Flagstones are not earth, and this spell does not touch worked stone.' };
  const mapId = map.id || st.mapId || null;
  st.flags = st.flags || {};
  st.flags.easedTravel = {
    mapId, until: clockMinutes(st) + Math.max(10, num(minutes, 60)),
    factor: Math.max(0.1, Math.min(1, num(factor, 0.6))),
  };
  return {
    ok: true, mapId,
    text: 'The ground ahead heaves, settles, and lies down flat: gullies filled, the ridge cut open, a road where there was a climb.',
  };
}

/** Is the road ahead still graded flat? */
export function travelEased(st, mapId = null) { return !!liveFlag(st, 'easedTravel', mapId); }

/**
 * Mirage Arcane: a square mile wearing somebody else's face. The party cannot
 * be tracked across ground that is not where anyone thinks it is.
 *
 * `st.flags.mirageTerrain = { mapId, until, factor }`.
 */
export function maskTerrain(scene, st, minutes = 14400, factor = 0.45) {
  if (!st) return { ok: false, text: 'There is no country here to lie about.' };
  const map = obj(obj(scene).map);
  if (map.indoor) return { ok: false, text: 'Four walls are not a landscape. Take it outside.' };
  const mapId = map.id || st.mapId || null;
  st.flags = st.flags || {};
  st.flags.mirageTerrain = {
    mapId, until: clockMinutes(st) + Math.max(60, num(minutes, 14400)),
    factor: Math.max(0.1, Math.min(1, num(factor, 0.45))),
  };
  return {
    ok: true, mapId,
    text: 'The country changes its story. Trackers will follow a road that is not there, ford a river that is a meadow, and lose the party entirely.',
  };
}

/** Is the landscape still lying about itself? */
export function terrainMasked(st, mapId = null) { return !!liveFlag(st, 'mirageTerrain', mapId); }

/**
 * What the three lasting terrain spells are worth to the wandering-monster
 * roll. Multiply it into world/overworld.js's `_encounterScale()` alongside
 * `_partyStealthFactor()` and `_clearedFactor()`:
 *
 *   return scale * this._partyStealthFactor() * this._clearedFactor()
 *        * terrainEncounterFactor(state(), this.map && this.map.id);
 *
 * 0 means Guards and Wards has sealed the place and nothing wanders in at all.
 */
export function terrainEncounterFactor(st, mapId = null) {
  if (!st) return 1;
  if (wardedAgainstIntrusion(st, mapId)) return 0;
  let f = 1;
  const eased = liveFlag(st, 'easedTravel', mapId);
  if (eased) f *= Math.max(0.1, Math.min(1, num(eased.factor, 0.6)));
  const mirage = liveFlag(st, 'mirageTerrain', mapId);
  if (mirage) f *= Math.max(0.1, Math.min(1, num(mirage.factor, 0.45)));
  return Math.max(0, Math.min(1, f));
}

// ===========================================================================
// 4. DETECTION AND DIVINATION
// ===========================================================================

/**
 * Detect Magic / Detect Evil and Good.
 * what: 'magic' | 'evil' | 'thoughts' | 'life' | an array of creature types.
 */
export function detect(scene, what, range = 6) {
  const p = playerOf(scene);
  const kinds = Array.isArray(what) ? what.map((s) => String(s).toLowerCase()) : null;
  const w = kinds ? 'types' : String(what || 'magic').toLowerCase();
  let count = 0;
  const found = [];
  for (const e of entitiesOf(scene)) {
    if (!e || e.removed || dist(e, p) > range) continue;
    if (w === 'magic') {
      if (e.kind === 'chest' && !e.opened) { count++; e.detected = true; found.push(e); }
      if (e.kind === 'door' && e.arcaneLocked) { count++; found.push(e); }
    } else if (w === 'life' || w === 'thoughts') {
      if (e.kind === 'npc' || e.kind === 'monster') { count++; found.push(e); }
    } else if (w === 'evil' || w === 'types') {
      if (e.kind !== 'monster') continue;
      const type = String((e.monster && e.monster.type) || e.type || '').toLowerCase();
      const wanted = kinds || ['aberration', 'celestial', 'elemental', 'fey', 'fiend', 'undead'];
      if (wanted.includes(type)) { count++; e.detected = true; found.push(e); }
    }
  }
  const nearest = found.sort((a, b) => dist(a, p) - dist(b, p))[0] || null;
  return { count, found, bearing: nearest ? bearingText(p, nearest) : null };
}

/** A minimal HUD marker the minimap can draw: { x, y, label, until, color }. */
export function addMarker(scene, st, x, y, label, minutes = 10, color = '#b07af0') {
  if (!scene) return null;
  if (!Array.isArray(scene.spellMarkers)) scene.spellMarkers = [];
  const m = { x, y, label: String(label || ''), until: st ? clockMinutes(st) + Math.max(1, num(minutes, 10)) : null, color };
  scene.spellMarkers.push(m);
  if (scene.spellMarkers.length > 6) scene.spellMarkers.shift();
  // The HUD draws whatever array it is handed; share ours so no patch is needed.
  if (scene.hud && typeof scene.hud === 'object') scene.hud.markers = scene.spellMarkers;
  return m;
}

/** Drop markers whose hour has come. Cheap enough to call twice a second. */
export function expireMarkers(scene, st) {
  if (!scene || !Array.isArray(scene.spellMarkers) || !scene.spellMarkers.length) return;
  const now = clockMinutes(st);
  scene.spellMarkers = scene.spellMarkers.filter((m) => m && (m.until == null || now < m.until));
  if (scene.hud && typeof scene.hud === 'object') scene.hud.markers = scene.spellMarkers;
}

/** Quest-giver / turn-in NPCs the party is currently looking for. */
function questNpcIds(st) {
  const out = new Set();
  for (const q of arr(st && st.quests && st.quests.active)) {
    const def = (q && (q.def || QUESTS[q.id])) || null;
    const step = arr(q && q.steps).find((s) => s && !s.done) || null;
    if (step && (step.kind === 'talk' || step.kind === 'deliver' || step.kind === 'escort') && step.target) out.add(step.target);
    if (def && def.turnIn && arr(q.steps).every((s) => s && s.done)) out.add(def.turnIn);
  }
  return out;
}

/**
 * Locate Object / Locate Creature: the nearest thing of that sort on this
 * map, as a bearing line plus a minimap marker.
 * what: 'object' (an unopened chest) | 'creature' (a quest NPC, else any NPC,
 * else a monster) | 'exit' (a warp off the map)
 */
export function locate(scene, st, what = 'object', minutes = 10) {
  const p = playerOf(scene);
  const w = String(what || 'object').toLowerCase();
  let pool = [];
  let label = '';
  if (w === 'object') {
    pool = entitiesOf(scene).filter((e) => e && !e.removed && e.kind === 'chest' && !e.opened);
    label = 'chest';
    if (!pool.length) {
      // Loose loot: a map-authored chest trigger not yet looted.
      const map = obj(scene).map;
      pool = arr(map && map.triggers).filter((t) => t && t.kind === 'chest' && !(st && st.chests && st.chests[`${map.id}:${t.x},${t.y}`]));
    }
  } else if (w === 'creature') {
    const wanted = questNpcIds(st);
    const npcs = entitiesOf(scene).filter((e) => e && !e.removed && e.kind === 'npc');
    pool = npcs.filter((e) => wanted.has(e.npcId));
    label = pool.length ? 'someone you seek' : 'a person';
    if (!pool.length) pool = npcs;
    if (!pool.length) { pool = entitiesOf(scene).filter((e) => e && !e.removed && e.kind === 'monster'); label = 'a creature'; }
  } else {
    const map = obj(scene).map;
    pool = arr(map && map.triggers).filter((t) => t && (t.kind === 'warp' || t.kind === 'door'));
    pool = pool.concat(entitiesOf(scene).filter((e) => e && !e.removed && (e.kind === 'warp' || e.kind === 'door')));
    label = 'the way out';
  }
  const best = pool.slice().sort((a, b) => dist(a, p) - dist(b, p))[0] || null;
  if (!best) return { ok: false, text: `Nothing of the kind answers within a thousand feet.` };
  const name = best.name || (best.npc && best.npc.name) || (best.npcId ? safe(() => getNPC(best.npcId).name, null) : null) || label;
  addMarker(scene, st, best.x, best.y, name, minutes, w === 'object' ? '#e0b040' : '#7fd0f0');
  return { ok: true, text: `${titleCase(name)}: ${bearingText(p, best)}.`, target: best };
}

/**
 * Clairvoyance, Arcane Eye, Scrying, Find the Path, Commune with Nature: the
 * map is revealed for `r` tiles around (x, y). Writes the same "x,y" keys the
 * minimap and cheats.reveal() use, and syncs the save-file copy at once.
 */
export function revealRadius(scene, st, x, y, r) {
  const map = obj(scene).map;
  if (!map || !Number.isFinite(map.w)) return 0;
  const cx = num(x), cy = num(y), rr = Math.max(1, num(r, 8));
  let n = 0;
  if (map.discovered instanceof Set) {
    for (let j = cy - rr; j <= cy + rr; j++) {
      for (let i = cx - rr; i <= cx + rr; i++) {
        if (i < 0 || j < 0 || i >= map.w || j >= map.h) continue;
        if ((i - cx) * (i - cx) + (j - cy) * (j - cy) > rr * rr) continue;
        const k = `${i},${j}`;
        if (!map.discovered.has(k)) { map.discovered.add(k); n++; }
      }
    }
    if (st) {
      st.discovered = st.discovered || {};
      st.discovered[map.id] = Array.from(map.discovered);
      map._discSynced = map.discovered.size;
    }
  } else if (st) {
    st.discovered = st.discovered || {};
    const seen = new Set(st.discovered[map.id] || []);
    for (let j = cy - rr; j <= cy + rr; j++) for (let i = cx - rr; i <= cx + rr; i++) {
      if (i < 0 || j < 0 || i >= map.w || j >= map.h) continue;
      if ((i - cx) * (i - cx) + (j - cy) * (j - cy) > rr * rr) continue;
      const k = `${i},${j}`;
      if (!seen.has(k)) { seen.add(k); n++; }
    }
    st.discovered[map.id] = Array.from(seen);
  }
  return n;
}

/** Reveal the whole map — Commune with Nature's three miles, in practice. */
export function revealAll(scene, st) {
  const map = obj(scene).map;
  if (!map) return 0;
  return revealRadius(scene, st, Math.floor(num(map.w) / 2), Math.floor(num(map.h) / 2), Math.max(num(map.w), num(map.h)));
}

/**
 * Augury, Divination, Commune, Legend Lore: a truthful hint. The tracked (or
 * first) active quest's next step, where it lies; otherwise a rumour worth
 * hearing. Never lies, never spoils past the next step.
 */
export function omen(st, opts = {}) {
  const active = arr(st && st.quests && st.quests.active);
  const tracked = active.find((q) => q && q.id === (st.quests && st.quests.tracked)) || active[0] || null;
  if (tracked) {
    const step = arr(tracked.steps).find((s) => s && !s.done) || null;
    if (step) {
      const where = step.map ? ` The answer lies in ${titleCase(String(step.map).replace(/-/g, ' '))}.` : '';
      const what = step.text || `${step.kind} ${titleCase(String(step.target || '').replace(/-/g, ' '))}`;
      return { ok: true, text: `${opts.voice || 'The omen'}: "${what}."${where}`, quest: tracked, step };
    }
    const def = tracked.def || QUESTS[tracked.id] || null;
    if (def && def.turnIn) {
      const who = safe(() => getNPC(def.turnIn).name, null) || titleCase(String(def.turnIn).replace(/-/g, ' '));
      return { ok: true, text: `${opts.voice || 'The omen'}: "${who} is waiting to hear of it."`, quest: tracked, step: null };
    }
  }
  const level = Math.max(1, num(opts.level, 1));
  const taken = new Set([...active.map((q) => q && q.id), ...arr(st && st.quests && st.quests.done)]);
  const r = safe(() => randomRumor(rng, level, { hasFlag: (f) => !!(st && hasFlag(st, f)), takenQuests: taken }), null);
  if (r && r.text) return { ok: true, text: `${opts.voice || 'The omen'}: "${r.text}"`, rumor: r };
  return { ok: true, text: `${opts.voice || 'The omen'} is silent. There is nothing you need to know yet.` };
}

/**
 * Detect Thoughts on whoever you are facing: `st.flags['read-mind:<npcId>']`
 * — dialogue choices can gate on it with `if: { flag: 'read-mind:<npcId>' }`.
 * Speak with Dead does the same for the last person the party killed
 * (`st.flags['last-slain']`, set by rules/crime.js), under 'spoke-dead:<id>'.
 */
export function readMind(scene, st, mode = 'read-mind') {
  if (!st) return { ok: false, text: 'No mind answers.' };
  st.flags = st.flags || {};
  if (mode === 'interrogate-corpse') {
    const id = st.flags['last-slain'];
    if (!id) return { ok: false, text: 'There is no corpse here with anything left to say.' };
    setFlag(st, `spoke-dead:${id}`, true);
    setFlag(st, `read-mind:${id}`, true);
    const name = safe(() => getNPC(id).name, null) || titleCase(String(id).replace(/-/g, ' '));
    return { ok: true, text: `${name}'s corpse answers in a voice like dry leaves. You learn what they knew.`, npcId: id };
  }
  const e = facingNPC(scene);
  if (!e) return { ok: false, text: 'No one is in front of you to read.' };
  const id = e.npcId || e.id;
  setFlag(st, `read-mind:${id}`, true);
  const name = e.name || safe(() => getNPC(id).name, null) || 'They';
  return { ok: true, text: `${name}'s surface thoughts drift across to you. You know what they are not saying.`, npcId: id };
}

// ===========================================================================
// 5. SOCIAL MAGIC
// ===========================================================================

/**
 * Charm Person / Suggestion / Friends on the person you are facing. Sets
 * `st.flags['charmed:<npcId>'] = untilMinutes`; dialogue gates on the flag
 * and fieldcast.expireFieldBuffs sweeps it when it lapses. Calm Emotions
 * (mech.suppressHostility) calms witnesses instead — see rules/crime.js.
 * @returns {{ok, text, npcId, resisted}}
 */
export function charmFacing(scene, st, opts = {}) {
  if (!st) return { ok: false, text: 'It will not take.' };
  st.flags = st.flags || {};
  const e = facingNPC(scene);

  // Calm Emotions is a twenty-foot sphere, not a conversation: it works on the
  // street whether or not there is anyone directly in front of you.
  if (opts.calm) {
    const p = playerOf(scene);
    const n = safe(() => calmWitnesses(st, obj(scene).map, entitiesOf(scene), {
      x: p.x, y: p.y, radius: Math.max(4, num(opts.radius, 6)), minutes: Math.max(1, num(opts.minutes, 1)),
    }), 0) || 0;
    if (e) {
      e.hostile = false;
      e.fleeT = 0;
      setFlag(st, `calmed:${e.npcId || e.id}`, clockMinutes(st) + Math.max(1, num(opts.minutes, 1)));
    }
    if (!n && !e) return { ok: false, text: 'Nobody here is upset enough for it to matter.' };
    return {
      ok: true, npcId: e ? (e.npcId || e.id) : null,
      text: n
        ? `The heat goes out of the street. ${n} would-be witness${n === 1 ? '' : 'es'} forget${n === 1 ? 's' : ''} what they were shouting about.`
        : `${(e && e.name) || 'They'} unclench. Whatever was about to happen, will not.`,
    };
  }

  if (!e) return { ok: false, text: 'No one is in front of you to work it on.' };
  const id = e.npcId || e.id;
  const name = e.name || safe(() => getNPC(id).name, null) || 'They';

  // A Wisdom save against the caster's DC. Townsfolk are commoners: +0.
  const dc = Math.max(10, num(opts.dc, 13));
  const wis = num(opts.targetWis, 0);
  const roll = safe(() => d20(wis, { dc }, rng), null);
  if (roll && roll.total >= dc) {
    e.charmResisted = true;
    return { ok: true, resisted: true, npcId: id, text: `${name} blinks, shakes it off, and looks at you rather differently.` };
  }
  const until = clockMinutes(st) + Math.max(1, num(opts.minutes, 60));
  setFlag(st, `charmed:${id}`, until);
  return { ok: true, resisted: false, npcId: id, until, text: `${name}'s face softens. For a while, you are the best friend they have.` };
}

/** Is this NPC currently charmed by the party? */
/**
 * True while the party can hold a conversation with a beast.
 *
 * fieldcast.js sets `st.flags.speakBeasts = { until }` when Speak with Animals
 * is cast (it writes the flag itself rather than calling in here, because this
 * module already imports the clock from that one). ui/dialogue.js reads this to
 * decide whether an animal is merely observed or actually answers.
 */
export function speakingWithAnimals(st) {
  const v = st && st.flags ? st.flags.speakBeasts : null;
  if (!v) return false;
  if (typeof v === 'number') return clockMinutes(st) < v;
  return v.until == null || clockMinutes(st) < v.until;
}

export function isCharmed(st, npcId) {
  const v = st && st.flags && npcId != null ? st.flags[`charmed:${npcId}`] : null;
  if (!v) return false;
  if (typeof v === 'number') return clockMinutes(st) < v;
  return true;
}

/**
 * A charmed shopkeeper gives you the friend price. Ten per cent is small
 * enough that nobody charms their way to a free Holy Avenger and large enough
 * that a 1st-level slot pays for itself on a decent haul.
 */
export function charmDiscount(st, npcId) {
  return isCharmed(st, npcId) ? 0.9 : 1;
}

/**
 * What a field buff is worth to a conversation.
 *
 * `skillMod` already folds in `mech.skillBonus` and `mech.advSkill`, so
 * Disguise Self and Pass Without Trace reach a [Deception 15] gate on their
 * own. What NOTHING reads out of combat is the other half of the vocabulary:
 * Guidance's `checkBonusDice`, Enhance Ability's `advCheckAbility`, and the
 * flat check bonuses a condition can carry. This gathers those, so the same
 * d20 the battle screen would roll is the d20 the conversation rolls.
 *
 * @returns {{bonus:number, adv:boolean, dis:boolean, dice:string[], why:string[], spend:function}}
 */
export function socialCheckMods(ch, skill = null, ability = 'cha') {
  const out = { bonus: 0, adv: false, dis: false, dice: [], why: [], spend: () => {}, rollDice: () => 0 };
  if (!ch) return out;
  const ab = String(ability || 'cha').toLowerCase();
  const used = [];

  for (const e of arr(ch.effects)) {
    const m = obj(e && e.mech);
    let touched = false;

    if (m.checkBonusDice) { out.dice.push(String(m.checkBonusDice)); touched = true; }
    if (typeof m.checkBonus === 'number') { out.bonus += m.checkBonus; touched = true; }
    // An ability-only gate ([CHA 13]) never goes through skillMod, so the
    // skill bonuses have to be picked up by hand here.
    if (!skill && m.skillBonus && typeof m.skillBonus === 'object') {
      for (const k of Object.keys(m.skillBonus)) {
        const def = safe(() => SKILL_ABILITY[k], null);
        if (def === ab) { out.bonus += num(m.skillBonus[k], 0); touched = true; }
      }
    }
    const advAb = m.advCheckAbility;
    if (advAb && (advAb === 'choose' || advAb === ab || arr(advAb).includes(ab))) { out.adv = true; touched = true; }
    if (skill && arr(m.advSkill).includes(skill)) { out.adv = true; }

    // Guidance is one use, and the whole point of it is choosing which check.
    if (touched && num(e.uses, 0) === 0 && num(obj(e.mech).uses, 0) > 0) e.uses = num(obj(e.mech).uses, 1);
    if (touched && num(e.uses, 0) > 0) used.push(e);
    if (touched) out.why.push(e.name || e.id || 'a spell');
  }

  const cm = safe(() => conditionMech(ch), null);
  if (cm) {
    out.bonus += num(cm.d20Bonus, 0) + num(cm.d20Penalty, 0);
    if (cm.advOnAbilityChecks || arr(cm.advCheckAbility).includes(ab)) out.adv = true;
    if (cm.disOnAbilityChecks || arr(cm.disCheckAbility).includes(ab)) out.dis = true;
    for (const d of arr(cm.checkBonusDice)) out.dice.push(String(d));
  }

  /**
   * Roll the bonus dice and hand back the total.
   *
   * rules/actions.js#abilityCheck only reads bonus dice off `conditionMech`,
   * which a spell EFFECT never reaches — so Guidance's d4 has to be rolled
   * here and folded into `opts.bonus`. Same arithmetic, same distribution;
   * the only thing lost is the separate die in the roll display.
   */
  out.rollDice = () => {
    let t = 0;
    for (const d of out.dice) t += rollDiceExpr(d);
    return t;
  };

  // Spending is deliberate and separate: a check that is never rolled (the
  // player backs out of the choice) must not burn the Guidance.
  out.spend = () => {
    for (const e of used) {
      e.uses = num(e.uses, 1) - 1;
      if (e.uses <= 0 && Array.isArray(ch.effects)) {
        const i = ch.effects.indexOf(e);
        if (i >= 0) ch.effects.splice(i, 1);
        ch._mech = null;
      }
    }
  };
  return out;
}

/** skill -> ability, without importing the whole abilities table twice. */
const SKILL_ABILITY = {
  athletics: 'str',
  acrobatics: 'dex', 'sleight-of-hand': 'dex', stealth: 'dex',
  arcana: 'int', history: 'int', investigation: 'int', nature: 'int', religion: 'int',
  'animal-handling': 'wis', insight: 'wis', medicine: 'wis', perception: 'wis', survival: 'wis',
  deception: 'cha', intimidation: 'cha', performance: 'cha', persuasion: 'cha',
};

// ===========================================================================
// 5b. THE NIGHT WATCH
// ===========================================================================

/**
 * What the party's magic is worth to whoever is sitting up with the fire.
 * ui/restui.js rolls Perception against the quietest thing in the dark; Alarm
 * means nothing crosses the perimeter unheard, and a camp with no light on it
 * is a camp being watched by someone squinting.
 *
 * @returns {{adv:boolean, dis:boolean, ambush:boolean, why:string}}
 */
export function watchMods(scene, st, party, watcher = null, mapId = null) {
  const out = { adv: false, dis: false, ambush: true, why: '' };
  // Guards and Wards is the stronger claim and gets named first: a warded
  // stronghold is not a camp with a tripwire on it.
  if (wardedAgainstIntrusion(st, mapId)) {
    out.adv = true;
    out.ambush = false;
    out.why = 'the guards and wards';
  } else if (alarmActive(st, mapId)) {
    out.adv = true;
    out.ambush = false;
    out.why = 'the ward';
  }
  const dark = perceptionPenalty(scene, watcher, party);
  if (dark.dis && !out.adv) { out.dis = true; out.why = out.why || dark.why; }
  return out;
}

// ===========================================================================
// 6. THE PACK
// ===========================================================================

/** Identify: name every mystery in the pack. Returns how many gave up their names. */
export function identifyAll(party) {
  let n = 0;
  for (const row of arr(party && party.inventory)) {
    if (row && row.unidentified) { row.unidentified = false; row.identified = true; n++; }
  }
  return n;
}

/** Identify one item only (the PHB ritual names a single object). */
export function identifyOne(party) {
  const row = arr(party && party.inventory).find((r) => r && r.unidentified) || null;
  if (!row) return null;
  row.unidentified = false;
  row.identified = true;
  return row;
}

/** Mage Hand: fetch the contents of the nearest unlocked chest within reach. */
export function reachChest(scene, range = 6) {
  const p = playerOf(scene);
  const best = nearby(scene, 'chest', range).find((e) => !e.opened && !e.locked) || null;
  if (!best) return { ok: false, text: 'The spectral hand drifts, finds nothing worth fetching, and fades.' };
  const payload = safe(() => best.interact({ player: p }), null);
  return { ok: !!payload, payload, text: 'The spectral hand lifts the lid and brings back what it finds.' };
}

/** Mending: every broken thing worn by the party is whole again. */
export function repairGear(party) {
  let n = 0;
  for (const m of arr(party && party.members)) {
    for (const slot of Object.keys((m && m.equipment) || {})) {
      const inst = m.equipment[slot];
      if (inst && inst.broken) { inst.broken = false; n++; }
    }
  }
  return n;
}

/** Is this item a magic thing that arrives from loot unidentified? */
export function isMysteryItem(id) {
  const it = safe(() => resolveItem(id), null);
  if (!it) return false;
  if (!it.rarity || it.rarity === 'common') return false;
  return safe(() => isMagic(id), false) || !!it.magic || !!it.mech;
}

// ===========================================================================
// 7. MOVEMENT AND THE WILDS
// ===========================================================================

/**
 * Every field buff on a character, merged for the movement keys mergeMech
 * ignores: walkOnLiquid, wallWalk, ignoreDifficult, climbSteps, travelSpeed,
 * flySpeed / swimSpeed, plus the species/item speeds mechOf already knows.
 */
export function fieldMech(ch) {
  const out = { flying: false, swimming: false, climb: 0, ignoreDifficult: false, wallWalk: false, travelSpeed: 1, passives: [] };
  if (!ch) return out;
  const base = safe(() => mechOf(ch), null);
  if (base) {
    if (num(base.speeds && base.speeds.fly, 0) > 0) out.flying = true;
    if (num(base.speeds && base.speeds.swim, 0) > 0) out.swimming = true;
    if (num(base.speeds && base.speeds.climb, 0) > 0) out.climb = Math.max(out.climb, 1);
    out.passives = arr(base.passives).slice();
  }
  for (const e of arr(ch.effects)) {
    const m = obj(e && e.mech);
    if (num(m.flySpeed, 0) > 0 || m.fly) out.flying = true;
    if (num(m.swimSpeed, 0) > 0 || m.walkOnLiquid) out.swimming = true;
    if (m.climbSpeed || m.wallWalk) { out.climb = Math.max(out.climb, 2); out.wallWalk = true; }
    if (num(m.climbSteps, 0) > 0) out.climb = Math.max(out.climb, num(m.climbSteps, 1));
    if (num(m.jumpMult, 1) >= 3) out.climb = Math.max(out.climb, 1);
    if (m.ignoreDifficult) out.ignoreDifficult = true;
    if (Number.isFinite(Number(m.travelSpeed)) && Number(m.travelSpeed) > 0) out.travelSpeed *= Number(m.travelSpeed);
  }
  const cm = safe(() => conditionMech(ch), null);
  if (cm && cm.ignoreDifficult) out.ignoreDifficult = true;
  if (out.flying) out.climb = Math.max(out.climb, 99);
  return out;
}

/**
 * Can the party's leader step onto (x, y)? Water needs Water Walk, a swim
 * speed or Fly; deep water (WATER|SOLID) needs Fly; a ledge from the wrong
 * side needs Fly or Spider Climb; SLOW costs nothing under Freedom of
 * Movement. Returns { ok, reason, cost } — `cost` is 1 or 2 step-time units.
 */
export function canCrossTile(party, map, x, y, from = null) {
  const leader = party && (party.leader || arr(party.members)[0]) || null;
  const mv = fieldMech(leader);
  if (!map || typeof map.flagAt !== 'function') return { ok: true, reason: '', cost: 1, mech: mv };
  const f = num(map.flagAt(x, y), 0);
  let cost = 1;
  if (f & TF_SOLID) {
    if ((f & TF_WATER) && mv.flying) return { ok: true, reason: 'fly', cost: 1, mech: mv };   // deep water
    return { ok: false, reason: 'solid', cost: Infinity, mech: mv };
  }
  if (f & TF_WATER) {
    if (!(mv.flying || mv.swimming)) return { ok: false, reason: 'water', cost: Infinity, mech: mv };
    cost = mv.flying ? 1 : 2;
  }
  if (f & TF_LEDGE) {
    if (!(mv.flying || mv.wallWalk)) {
      // Direction-checked by tilemap.canStep; only say we could ignore it.
      return { ok: true, reason: 'ledge', cost, mech: mv, ledgeFree: false };
    }
    return { ok: true, reason: 'ledge', cost, mech: mv, ledgeFree: true };
  }
  if ((f & TF_SLOW) && !mv.ignoreDifficult) cost = Math.max(cost, 2);
  return { ok: true, reason: '', cost, mech: mv };
}

/**
 * The options Entity.step()/TileMap.canStep() read, from the leader's buffs:
 * `{ flying, swimming, climb }`. The overworld assigns these onto the player
 * entity before each step so the collision code needs no change.
 */
export function movementOpts(party) {
  const leader = party && (party.leader || arr(party.members)[0]) || null;
  const mv = fieldMech(leader);
  return { flying: mv.flying, swimming: mv.swimming, climb: mv.climb, ignoreDifficult: mv.ignoreDifficult };
}

/**
 * How much the wilds notice you: <1 means fewer ambushes. A steed (0.7),
 * Pass Without Trace (0.6), an invisible leader (0.5) — multiplied.
 */
export function encounterFactor(party) {
  let f = 1;
  const leader = party && (party.leader || arr(party.members)[0]) || null;
  if (!leader) return 1;
  for (const m of arr(party.members)) {
    if (!m) continue;
    for (const e of arr(m.effects)) {
      const mech = obj(e && e.mech);
      if (Number.isFinite(Number(mech.travelSpeed)) && Number(mech.travelSpeed) > 0) f *= Number(mech.travelSpeed);
    }
  }
  for (const e of arr(leader.effects)) {
    const mech = obj(e && e.mech);
    if (mech.noTracks) f *= 0.6;
  }
  if (safe(() => conditionMech(leader).invisible, false)) f *= 0.5;
  return Math.max(0.2, Math.min(1, f));
}

// ===========================================================================
// 8. TELEPORTATION
// ===========================================================================

let MAPS = null;
let mapsLoading = null;
/** maps.js is heavy and authored elsewhere; fetch its metadata lazily. */
export function loadMapMeta() {
  if (MAPS) return Promise.resolve(MAPS);
  if (!mapsLoading) {
    mapsLoading = import('../world/maps.js').then((m) => { MAPS = m; return m; }).catch(() => null);
  }
  return mapsLoading;
}

function metaFor(id) {
  if (MAPS && typeof MAPS.mapMeta === 'function') return safe(() => MAPS.mapMeta(id), null);
  return null;
}

/**
 * Where a long-range teleport may take the party.
 * mode: 'visited' (anywhere you have been) | 'town' (visited towns) |
 *       'forest' (visited forest maps) | 'recall' (st.flags.recallPoint)
 * @returns {Array<{id,name,x?,y?,biome?}>}
 */
export function travelSites(st, mode = 'visited', currentMapId = null) {
  if (!st) return [];
  loadMapMeta();
  const here = currentMapId || st.mapId;
  if (mode === 'recall') {
    const r = st.flags && st.flags.recallPoint;
    if (!r || !r.mapId) return [];
    const meta = metaFor(r.mapId);
    return [{ id: r.mapId, name: r.name || (meta && meta.name) || titleCase(String(r.mapId).replace(/-/g, ' ')), x: r.x, y: r.y, dir: r.dir || 'down' }];
  }
  const ids = Object.keys(obj(st.visited)).filter((id) => st.visited[id] && id !== here);
  const out = [];
  for (const id of ids) {
    const meta = metaFor(id);
    const biome = String((meta && meta.biome) || (/forest|wood/.test(id) ? 'forest' : ''));
    const safeTown = !!(meta && meta.safe) || /phandalin|neverwinter|waterdeep|leilon|triboar/.test(id);
    if (mode === 'forest' && biome !== 'forest') continue;
    if (mode === 'town' && !safeTown) continue;
    out.push({ id, name: (meta && meta.name) || titleCase(String(id).replace(/-/g, ' ')), biome, town: safeTown, level: meta ? meta.level : null });
  }
  out.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return out;
}

/** Word of Recall's sanctuary: set when the party sleeps at an inn or temple. */
export function setRecallPoint(st, mapId, x, y, name = null, dir = 'down') {
  if (!st || !mapId) return null;
  st.flags = st.flags || {};
  st.flags.recallPoint = { mapId, x: num(x, undefined), y: num(y, undefined), name: name || null, dir };
  return st.flags.recallPoint;
}

// ===========================================================================
// 9. THE HOOK BUNDLE
// ===========================================================================

/**
 * What the spellbook can reach out and touch. The overworld's
 * `spellHooks()` returns this; fieldcast.castWorldEffect calls into it and
 * falls back to prose for any hook that is missing (cast from a rest, say).
 */
export function fieldHooks(scene, party, st) {
  const S = () => st || obj(scene).state || null;
  const P = () => party || null;
  return {
    scene,
    light: (radius, spellId, minutes, mech) => castLight(scene, S(), radius, spellId, minutes, mech),
    unlock: (range) => unlockNearest(scene, S(), range),
    lock: (dcBonus) => lockNearest(scene, dcBonus),
    detect: (what, range) => detect(scene, what, range),
    locate: (what, minutes) => locate(scene, S(), what, minutes),
    reveal: (r, all) => {
      const p = playerOf(scene);
      return all ? revealAll(scene, S()) : revealRadius(scene, S(), p.x, p.y, r);
    },
    omen: (opts) => omen(S(), opts),
    readMind: (mode) => readMind(scene, S(), mode),
    charm: (opts) => charmFacing(scene, S(), opts),
    facingNPC: () => facingNPC(scene),
    reach: (range) => {
      const r = reachChest(scene, range);
      if (r.ok && r.payload && scene && typeof scene._dispatch === 'function') safe(() => scene._dispatch(r.payload));
      return r;
    },
    identify: (all) => {
      const n = all ? identifyAll(P()) : (identifyOne(P()) ? 1 : 0);
      return n ? { ok: true, count: n, text: n === 1 ? 'It gives up its name.' : `${n} things give up their names.` } : { ok: false, text: 'Nothing in the pack is a mystery.' };
    },
    trap: (range) => trapNearest(scene, P(), S(), range),
    ward: (minutes) => wardArea(scene, S(), minutes),
    sanctuary: (minutes, name) => makeSanctuary(scene, S(), minutes, name),
    // The four world-scale terrain spells. overworld.spellHooks() spreads this
    // bundle, so they arrive there with no edit on that side.
    weather: (want, mech, hold) => setWeather(scene, S(), want, mech, hold),
    wardIntrusion: (minutes) => wardAgainstIntrusion(scene, S(), minutes),
    easeTravel: (minutes) => easeTravel(scene, S(), minutes),
    maskTerrain: (minutes) => maskTerrain(scene, S(), minutes),
    repair: () => repairGear(P()),
    sites: (mode) => travelSites(S(), mode, obj(scene).map && obj(scene).map.id),
    mapId: () => (obj(scene).map && obj(scene).map.id) || (S() && S().mapId) || null,
    party: P,
  };
}

// ===========================================================================
// 10. BOOKKEEPING HOOKS
// ===========================================================================

// The last townsperson the party killed, so Speak with Dead has a corpse to
// question. crime.js emits nothing; the DEATH event carries the NPC entity's
// character, whose `npcId` we keep.
bus.on(EV.DEATH, ({ ch }) => {
  try {
    if (!ch || ch.kind === 'pc') return;
    const id = ch.npcId || null;
    if (!id) return;
    // Game.state is not importable from a rules module; the overworld sets
    // this through crime.reportDeath instead. Kept as a no-op guard.
  } catch (e) { /* never fatal */ }
});

export function isPartyDead(ch) { return !!ch && isDead(ch); }
