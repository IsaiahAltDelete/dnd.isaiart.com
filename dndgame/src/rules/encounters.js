// rules/encounters.js — the encounter director: who the wilds put in the party's way, when, and why.
//
// The old wilderness was a step counter: every thirty-odd paces in the grass a
// fight arrived out of nowhere, with nobody in it who had a name or a reason.
// The director replaces that with SITUATIONS (data/encounters.js) and three rules:
//
//   1. Most encounters are VISIBLE. Entering a wild map plans a small cast — a toll
//      post at the junction, a caravan on the road, a raiding party in the verges —
//      that the party can see coming, approach, avoid, shadow or ambush.
//   2. Parley before steel. Meeting a group opens a standoff whose options are real
//      2024 checks (Influence, contests against Insight, group Stealth, Medicine,
//      Turn Undead) with real outcomes: a fight, safe passage, trade, a rumour, a
//      lead, a quest, allies, a grudge.
//   3. A tension budget paces it. Tension rises as the party travels and a danger
//      (an arriving hostile band, or a rare TELEGRAPHED ambush) spends it; every
//      resolved danger buys a grace period, and quiet beats fill the road between.
//
// Headless and deterministic: every roll comes from a seeded stream in core/rng.js,
// and nothing here draws. The overworld (world/overworld.js) and the parley scene
// (ui/standoff.js) are the only callers that touch the screen; tools/encsim.mjs
// drives this module alone to simulate a long journey.
//
// State lives in `st.encounters`, created lazily so a save from before the
// director loads untouched (see encounterState()).

import { makeRNG, hashStr } from '../core/rng.js';
import { d20, rollExpr } from '../core/dice.js';
import { bus, EV, toast } from '../core/events.js';
import { timeOfDay, clamp } from '../constants.js';
import {
  SITUATIONS, BEATS, AREAS, REGION_PLACES, HARPER_CONTACT, COSTERS, EXTRA_CREATURES,
  GROUP_OPENERS, FACTION_OPENERS, TYPE_OPENERS, DEFAULT_LINES, HAG_BARGAINS, PACING, AMBUSH_SHARE,
  EVENT_TAGS, EVENT_GROUPS,
} from '../data/encounters.js';
// The world director's news (a namespace import: a missing export is undefined, never a link error).
import * as WorldDirector from './worlddirector.js';
import { getMonster, MONSTER_GROUPS } from '../data/monsters.js';
import { generateName } from '../data/tables.js';
import { rollFoes, ambushContest, encounterBudget, unitCost, buildEncounterMonsters } from './scaling.js';
import { abilityCheck } from './actions.js';
import { skillMod, abilityMod, hitDiceTotal } from './character.js';
import { grantXp } from './progression.js';
import { noteDeed } from './deeds.js';
import { startQuest, completeQuest, advanceTime as advanceClock } from '../state.js';
import { payFine } from './crime.js';

// ---------------------------------------------------------------------------
// 0. TUNING
// ---------------------------------------------------------------------------

/** In-game minutes a map's planned cast holds before the road is re-populated. */
const PLAN_MINUTES = 6 * 60;
/** A camp nobody disturbed breaks up and moves on after this many days. */
const CAMP_DAYS = 3;
/** A camp you broke stays broken — the ashes are all that is left — this long. */
const CAMP_CLEARED_DAYS = 7;
/** Leads go stale. */
const LEAD_DAYS = 6;
/** A captain you let go needs a couple of days to think of a way to profit from it. */
const LEADER_RETURN_DAYS = 2;
/** How long kin remember mercy, and grudges. */
const MEMORY_DAYS = 24;
/** Bounded logs. */
const LOG_MAX = 120, RUMOR_MAX = 30, LEAD_MAX = 8, PLAN_MAX = 16, LEADERS_MAX = 8;
/** Tension crosses this and something dangerous happens. */
const TENSION_MAX = 100;

const arr = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const abmod = (score) => Math.floor((num(score, 10) - 10) / 2);
const absMinute = (st) => (st ? (st.day | 0) * 1440 + (st.time | 0) : 0);
const worldSeedOf = (st) => (st ? String(st.worldSeed || st.seed || 'sword-coast') : 'sword-coast');

const SKILL_ABILITY = Object.freeze({
  acrobatics: 'dex', 'animal-handling': 'wis', arcana: 'int', athletics: 'str', deception: 'cha',
  history: 'int', insight: 'wis', intimidation: 'cha', investigation: 'int', medicine: 'wis',
  nature: 'int', perception: 'wis', performance: 'cha', persuasion: 'cha', religion: 'int',
  'sleight-of-hand': 'dex', stealth: 'dex', survival: 'wis',
});
const SKILL_NAME = Object.freeze({
  acrobatics: 'Acrobatics', 'animal-handling': 'Animal Handling', arcana: 'Arcana', athletics: 'Athletics',
  deception: 'Deception', insight: 'Insight', intimidation: 'Intimidation', medicine: 'Medicine',
  nature: 'Nature', perception: 'Perception', persuasion: 'Persuasion', religion: 'Religion',
  stealth: 'Stealth', survival: 'Survival', investigation: 'Investigation', wisdom: 'Wisdom',
});

// ---------------------------------------------------------------------------
// 1. STATE
// ---------------------------------------------------------------------------

/**
 * The director's memory, created on first use. Every field defaults, so a save
 * written before this module existed — or by any earlier version of it — loads.
 */
export function encounterState(st) {
  if (!st) return null;
  st.encounters ??= {};
  const e = st.encounters;
  e.v ??= 1;
  e.tension ??= 0;          // 0..100, spent by dangers
  e.grace ??= 0;            // steps left in which no new danger may arrive
  e.steps ??= 0;
  e.sinceBeat ??= 0;
  e.nextBeat ??= 120;
  e.sinceArrival ??= 0;
  e.pending ??= null;       // an armed ambush: { mapId, steps, plan }
  e.plans ??= {};           // mapId -> { made, level, size, groups:[{uid,sitId,seed,status,...}] }
  e.camps ??= {};           // `${mapId}:${sitId}` -> { mapId, sitId, seed, made, cleared }
  e.memory ??= {};
  const m = e.memory;
  m.spared ??= {}; m.grudges ??= {}; m.killed ??= {}; m.rescued ??= {}; m.yielded ??= {}; m.robbed ??= {};
  m.respect ??= {};
  m.cleared ??= {};         // kin -> { n, day }: a wary band you squared with, recently
  m.leaders ??= [];         // named leaders you let walk away: [{ name, kin, sitId, mapId, day, state }]
  e.leads ??= [];           // [{ sit, maps, note, day, from, state }]
  e.allies ??= [];          // sellswords riding with you: [{ id, count, until, from }]
  e.rumors ??= [];          // [{ text, from, day }]
  e.log ??= [];             // the journey, for the journal and the simulator
  e.seq ??= 0;
  e.seen ??= {};            // sitId -> absolute minute it was last planned
  e.beatsSeen ??= {};       // beatId -> day
  e.inspiration ??= 0;      // Heroic Inspiration (2024): reroll one failed d20 test
  e.quests ??= {};          // quest id -> { kind, reward, faction, from }
  e.eventsPlaced ??= {};    // world-event id -> day its people were put on the road
  e.lastMap ??= null;       // the map the last step was on (a new one brings a beat soon)
  e.met ??= {};             // sitId -> the last few days you met them (a week of faces)
  return e;
}

/** Which half of the Sword Coast a region is in. */
export function areaOf(region) {
  const r = String(region || '');
  if (AREAS.south.includes(r)) return 'south';
  return 'north';
}

/** The names a region's people use for home and away. */
function placesFor(region) {
  return REGION_PLACES[region] || REGION_PLACES['triboar-trail'];
}

/** Situation by id. */
export function situation(id) { return SITUATIONS[id] || null; }

/** A stat block by id, the encounter's own creatures included. */
export function blockOf(id) { return getMonster(id) || EXTRA_CREATURES[id] || null; }
const lookup = (id) => EXTRA_CREATURES[id] || null;

// ---------------------------------------------------------------------------
// 2. CONTEXT — the facts every decision here is made from
// ---------------------------------------------------------------------------

/**
 * Build the context object from a map, the state and the party.
 *   opts: { pacing, ambush (the wildEncounters setting), roaming, weather, onRoad,
 *           cover, town (the overworld's own "is this a town" answer) }
 */
export function contextFor(st, map, party, opts = {}) {
  const m = map || {};
  const region = m.region || String(m.id || '').replace(/-\d+$/, '');
  const members = arr(party && party.members).filter(Boolean);
  const living = members.filter((c) => (c.hp | 0) > 0);
  const level = living.length
    ? Math.max(1, Math.round(living.reduce((a, c) => a + Math.max(1, c.level | 0), 0) / living.length))
    : 1;
  const phase = st ? timeOfDay(st.time) : 'morning';
  return {
    // One map id can be many places (each floor of Undermountain): `planKey` names
    // the one the plan belongs to; `mapBase` is the id the catalogue lists.
    mapId: opts.planKey || m.id || null, mapBase: m.id || null,
    name: m.name || String(m.id || 'the road').replace(/-/g, ' '),
    deeps: !!opts.deeps,
    biome: m.biome || 'plains', region, area: areaOf(region), mapLevel: num(m.level, 1),
    w: num(m.w, 60), h: num(m.h, 40),
    wild: !m.indoor && !m.safe && !opts.town,
    indoor: !!m.indoor,
    night: phase === 'night', phase,
    weather: String(opts.weather || m.weather || (st && st.weather) || 'clear'),
    level, size: Math.max(1, living.length || members.length || 1),
    party: party || { members: [], gold: 0 },
    pacing: PACING[opts.pacing] ? opts.pacing : 'normal',
    ambush: AMBUSH_SHARE[opts.ambush] != null ? opts.ambush : 'normal',
    roaming: opts.roaming !== false,
    onRoad: !!opts.onRoad, cover: !!opts.cover,
    leaderName: (members[0] && members[0].name) || 'traveller',
    events: arr(opts.events),
    // Pass Without Trace, an invisible leader, Guards and Wards: the overworld folds
    // everything that makes the party harder to find into one multiplier on tension.
    tensionScale: clamp(num(opts.tensionScale, 1), 0, 2),
  };
}

// --- what the rest of the world is doing -------------------------------------
//
// The world director (rules/worlddirector.js) decides that a festival is on in
// Daggerford or a caravan has gone missing on the Trail. It tells this module by
// registering a source; failing that, anything in st.world.events that names a
// map counts. An event is { id, mapId | maps, situations: [ids to favour],
// spawn: [ids to put on the road outright], note }.

let eventSource = null;
/** Register fn(st, mapId) -> events[] as the source of world events (tests, mods). */
export function setEventSource(fn) { eventSource = typeof fn === 'function' ? fn : null; }

/**
 * One of the world director's events, in this module's terms: its tags and
 * encounter groups name the situations it makes likelier; a stage that has
 * encounters on this map also puts the first of them on the road, once, with
 * the news as the reason ("Orcs out of the north: ...").
 */
function fromWorldEvent(ev) {
  const sits = [];
  const push = (id) => { if (id && SITUATIONS[id] && !sits.includes(id)) sits.push(id); };
  for (const [g] of arr(ev.encounters && ev.encounters.groups)) push(EVENT_GROUPS[g]);
  for (const t of arr(ev.tags)) for (const id of arr(EVENT_TAGS[t])) push(id);
  // The director's `reason` is "Name: text", and some texts already open on the name.
  const text = String(ev.text || '');
  const note = text && ev.name && text.startsWith(String(ev.name)) ? text : (ev.reason || ev.name || null);
  return {
    id: ev.id, situations: sits,
    spawn: ev.encounters && sits.length ? [sits[0]] : [],
    note,
  };
}

/** The world events touching a map right now. Never throws. */
export function eventsFor(st, mapId) {
  if (eventSource) { try { return arr(eventSource(st, mapId)).filter(Boolean); } catch (e) { return []; } }
  if (typeof WorldDirector.activeEventsFor === 'function') {
    try { return arr(WorldDirector.activeEventsFor(st, mapId)).filter(Boolean).map(fromWorldEvent); } catch (e) { return []; }
  }
  return [];
}

/** Faction strength in a region, from st.world.regionControl if the factions module set one. */
function controlOf(st, ctx, faction) {
  if (!faction) return 0;
  // The factions module's word, if it has spoken for this region...
  const rc = st && st.world && st.world.regionControl;
  const row = rc && rc[ctx.region];
  if (row) {
    if (typeof row === 'string') return row === faction ? 0.7 : 0;
    if (typeof row === 'object') {
      if (row.faction) return row.faction === faction ? clamp(num(row.strength, 0.6), 0, 1) : 0;
      return clamp(num(row[faction], 0), 0, 1);
    }
  }
  // ...otherwise the world director's balance of power: sway 0..100 per power,
  // and whoever holds the region counts for a little more.
  if (typeof WorldDirector.regionControl !== 'function') return 0;
  try {
    const region = (WorldDirector.regionOf && WorldDirector.regionOf(ctx.mapBase || ctx.mapId)) || ctx.region;
    const c = WorldDirector.regionControl(st, region);
    if (!c || !c.sway) return 0;
    return clamp(num(c.sway[faction], 0) / 100 + (c.holder === faction ? 0.3 : 0), 0, 1);
  } catch (e) { return 0; }
}

/** How well a faction thinks of the party. st.factions (the factions module) first. */
function standing(st, faction) {
  if (!st || !faction) return 0;
  const f = st.factions && st.factions.standings && st.factions.standings[faction];
  if (typeof f === 'number') return f;
  if (f && typeof f === 'object' && typeof f.value === 'number') return f.value;
  return num(st.reputation && st.reputation[faction], 0);
}

/** Recent enough to count. */
const recent = (rec, st, days = MEMORY_DAYS) => !!rec && ((st.day | 0) - num(rec.day, -999)) <= days;

// ---------------------------------------------------------------------------
// 3. CHOOSING SITUATIONS
// ---------------------------------------------------------------------------

/**
 * Does a situation belong here, now? `mode` is 'plan' (placed when the party
 * arrives), 'arrival' (walks in while they are here), 'ambush' or 'lead'.
 */
function fits(def, st, ctx, mode) {
  if (!def) return false;
  if (def.leadOnly && mode !== 'lead') return false;
  if (ctx.level < def.level[0] || ctx.level > def.level[1]) return false;
  if (def.time === 'night' && !ctx.night) return false;
  if (def.time === 'day' && ctx.night) return false;
  if (def.area !== 'any' && def.area !== ctx.area) return false;
  // The deeps have their own people; the open road has its own.
  if ((def.place === 'underground') !== !!ctx.deeps) return false;
  const onMap = def.maps && def.maps.includes(ctx.mapBase || ctx.mapId);
  const byBiome = def.biomes && def.biomes.includes(ctx.biome);
  if (def.maps && !onMap && !byBiome) return false;
  if (!def.maps && def.biomes && !byBiome) return false;
  if (mode === 'ambush' && !def.ambush) return false;
  if (mode === 'arrival' && !['travel', 'patrol', 'hunt'].includes(def.shape)) return false;
  // "Visible Wandering Foes" off: the road still has its people, but nobody hostile walks it.
  if (!ctx.roaming && mode !== 'ambush' && mode !== 'lead' && def.attitude === 'hostile' && !def.plea) return false;
  return true;
}

/** Is this a danger — something that can end in a fight you did not choose? */
function isDanger(def) {
  return def.attitude === 'hostile' || (def.attitude === 'wary' && !!def.demand);
}

/** Weight a candidate by region control, weather, variety and what has happened here. */
function weightOf(def, st, ctx, E) {
  let w = def.weight;
  if (def.weather && def.weather[ctx.weather]) w *= def.weather[ctx.weather];
  // Who holds this country decides whose people are on its roads.
  const ctl = controlOf(st, ctx, def.faction || def.kin);
  if (ctl > 0) w *= 1 + ctl * 2;
  const last = E.seen[def.id];
  // The same people twice in a day is a coincidence; every day is a rut.
  if (last != null) {
    const ago = absMinute(st) - last;
    if (ago < 1440) w *= 0.25;
    else if (ago < 3 * 1440) w *= 0.55;
  }
  // And a week of meeting them already makes the next one rarer still.
  const met = arr(E.met[def.id]).filter((d) => (st.day | 0) - d <= 7).length;
  if (met) w /= 1 + met * 0.8;
  const cleared = st.cleared && st.cleared[ctx.mapId];
  if (isDanger(def) && cleared && (cleared.count | 0) >= 4 && (st.day | 0) - num(cleared.day, 0) < 3) w *= 0.3;
  if (isDanger(def) && E.grace > 0) w *= 0.5;
  // The world director may have something happening here (a festival, a missing caravan).
  for (const ev of arr(ctx.events)) if (ev && arr(ev.situations).includes(def.id)) w *= 3;
  return w;
}

/** Weighted candidates for a mode. */
function candidates(st, ctx, mode, filter = null) {
  const E = encounterState(st);
  const out = [];
  for (const def of Object.values(SITUATIONS)) {
    if (!fits(def, st, ctx, mode)) continue;
    if (filter && !filter(def)) continue;
    const w = weightOf(def, st, ctx, E);
    if (w > 0) out.push({ def, w });
  }
  return out;
}

// ---------------------------------------------------------------------------
// 4. INSTANCES — one rolled situation
// ---------------------------------------------------------------------------

function fill(text, tokens) {
  return String(text == null ? '' : text).replace(/\{(\w+)\}/g, (m, k) => (tokens[k] != null ? String(tokens[k]) : m));
}

function pickLine(r, v) {
  if (Array.isArray(v)) return v.length ? v[r.int(0, v.length - 1)] : '';
  return v || '';
}

/** The difficulty a situation's fight is budgeted at. */
function difficultyOf(def) {
  if (def.innocent || def.attitude === 'friendly') return 'easy';
  if (def.shape === 'camp') return 'hard';
  if (def.proud || def.plea === 'rescue') return 'medium';
  return 'medium';
}

/** Party gold, whatever shape the party object is. */
const goldOf = (party) => num(party && party.gold, 0);
const rationsOf = (party) => {
  if (!party) return 0;
  if (typeof party.countItem === 'function') return party.countItem('rations');
  return arr(party.inventory).reduce((a, e) => a + (e && e.id === 'rations' ? (e.qty | 0) || 1 : 0), 0);
};

/** What they want, in gold. */
function demandFor(def, st, ctx, r, flags) {
  const lvl = ctx.level, size = ctx.size;
  switch (def.demand) {
    case 'toll': return Math.max(5, Math.round(((3 + lvl * 2) * size) / 5) * 5);
    case 'tribute': return Math.max(10, Math.round((6 + lvl * 4) * size / 5) * 5);
    case 'purse': {
      const want = Math.max(10 * lvl, Math.round(goldOf(ctx.party) * 0.3 / 5) * 5);
      return flags.yielded ? Math.round(want * 1.5) : want;
    }
    case 'fine': {
      const b = num(st && st.crime && st.crime.bounty && st.crime.bounty['baldurs-gate'], 0);
      return b > 0 ? Math.max(10, Math.round(b)) : 0;
    }
    default: return 0;
  }
}

/** A leader worth naming, from the SETTING.md tables through data/tables.js. */
function leaderFor(def, r, roll, tokens) {
  const L = def.leader || {};
  const ids = roll.monsters.map((m) => m.id);
  const monsterId = L.foe && ids.includes(L.foe) ? L.foe : (ids[0] || L.foe || null);
  // The budget can leave a band without its boss; then whoever shouts loudest leads.
  const bossless = !!(L.foe && ids.length && !ids.includes(L.foe));
  let name = null;
  // A priest's honorific follows the priest: Brother or Sister.
  const gender = L.names && (L.names.gender || (L.honorific ? (r.chance(0.5) ? 'female' : 'male') : null));
  if (L.names) {
    const n = L.names;
    for (let i = 0; i < 4 && !name; i++) {
      const got = generateName(n.species || 'human', r, { ethnicity: n.ethnicity, gender: gender || undefined });
      // A random prospector must not turn out to be a fourth Rockseeker brother.
      if (got && !/Rockseeker/.test(got)) name = got;
    }
    if (name && n.single) name = name.split(' ')[0];
  }
  const lead = blockOf(monsterId);
  const title = bossless
    ? `the loudest ${String((lead && lead.name) || 'one').toLowerCase()}`
    : fill(L.title || 'their leader', tokens);
  const mark = L.marks && !bossless ? pickLine(r, L.marks) : '';
  const hon = L.honorific ? (gender === 'female' ? 'Sister ' : 'Brother ') : '';
  let short = name ? name.split(' ')[0] : title.replace(/^(a|an) /, 'the ');
  if (name && hon) short = `${hon}${short}`;
  const full = name ? `${hon}${name}, ${title}` : `${title}${mark ? ` ${mark}` : ''}`;
  return { name, title, mark, short, full, monsterId };
}

/** The group as it appears on the map: who stands where, and as what. */
function folkFor(def, roll, leader) {
  const out = [];
  if (def.folk) {
    for (const f of def.folk) {
      const n = Math.max(1, f.n | 0 || 1);
      for (let i = 0; i < n; i++) {
        out.push({
          role: f.role || 'member', sprite: f.sprite || null, monsterId: f.monster || null,
          beast: f.beast || null, tile: f.tile || null, scale: f.scale || 1, downed: !!f.downed,
        });
      }
    }
    // The leader stands at the front, whoever they are.
    const li = out.findIndex((f) => f.role === 'leader' || f.role === 'merchant' || f.role === 'mother' || f.role === 'courier' || f.role === 'child' || f.role === 'shepherd');
    if (li > 0) out.unshift(out.splice(li, 1)[0]);
    // A rescue scene is also the attackers, on the same map.
    if (def.plea === 'rescue') {
      for (const m of roll.monsters) {
        for (let i = 0; i < Math.min(m.count, 3); i++) out.push({ role: 'attacker', monsterId: m.id, scale: 1 });
      }
    }
    return out.slice(0, 9);
  }
  // Otherwise the foes ARE the group: the leader first, then up to four more.
  const pool = [];
  for (const m of roll.monsters) for (let i = 0; i < m.count; i++) pool.push(m.id);
  const li = pool.indexOf(leader.monsterId);
  if (li > 0) pool.unshift(pool.splice(li, 1)[0]);
  for (let i = 0; i < Math.min(pool.length, 5); i++) {
    out.push({ role: i === 0 ? 'leader' : 'member', monsterId: pool[i], scale: 1 });
  }
  return out;
}

/**
 * Roll one situation into an instance: its leader, its numbers, its demand, its
 * lines. Deterministic in (def, seed, party level and size, memory).
 */
export function instantiate(st, def, ctx, seed, extra = {}) {
  if (!def) return null;
  const E = encounterState(st);
  const r = makeRNG(seed);
  const level = extra.level || ctx.level;
  const size = extra.size || ctx.size;
  const tier = def.tiers ? (def.tiers.find((t) => level >= t.level[0] && level <= t.level[1]) || def.tiers[def.tiers.length - 1]) : null;
  const foes = tier ? tier.foes : def.foes;
  const roll = foes
    ? rollFoes(foes, { level, size, rng: r, difficulty: difficultyOf(def), lookup })
    : { monsters: [], xp: 0, budget: 0 };
  const places = placesFor(ctx.region);
  const contact = HARPER_CONTACT[ctx.region === 'trade-way' ? 'trade-way' : ctx.area] || HARPER_CONTACT.north;
  const coster = pickLine(r, COSTERS[ctx.area] || COSTERS.north);
  const mem = E.memory;
  const flags = {
    spared: recent(mem.spared[def.kin], st),
    grudge: recent(mem.grudges[def.kin], st),
    rescued: recent(mem.rescued[def.kin], st),
    yielded: recent(mem.yielded[def.kin], st),
    respect: recent(mem.respect[def.kin], st),
    // (The strongbox wagon's guards are Zhents too, but no toll you paid buys the strongbox.)
    cleared: def.attitude === 'wary' && !def.tags.includes('strongbox') && recent(mem.cleared[def.kin], st, 4),
    friend: !!def.faction && def.attitude === 'wary' && standing(st, def.faction) >= 10,
    enemy: !!def.faction && standing(st, def.faction) <= -10,
    angry: def.kin === 'emerald-enclave' && num(mem.killed.owlbear && mem.killed.owlbear.n, 0) > 0,
  };
  const count = roll.monsters.reduce((a, m) => a + m.count, 0);
  const tokens = {
    // Map names are titles ("The Triboar Trail"); inside a sentence the article is lower case.
    count: count ? String(count) : 'several', place: String(ctx.name).replace(/^The /, 'the '),
    where: String(extra.from || ctx.name).replace(/^The /, 'the '), town: places.town, dest: places.dest,
    from: places.from, to: places.to, coster: coster.replace(/^the /, 'The '), contact: contact.name,
    attackers: (def.lines && def.lines.attackers) || 'raiders', name: ctx.leaderName, kin: def.kin,
  };
  const leader = leaderFor(def, r, roll, tokens);
  if (extra.leaderName) {
    leader.name = extra.leaderName;
    leader.short = extra.leaderName.split(' ')[0];
    leader.full = `${extra.leaderName}, ${leader.title}`;
  }
  tokens.leader = leader.short;
  let demand = demandFor(def, st, ctx, r, flags);
  if (def.demand === 'fine' && demand > 0) flags.wanted = true;
  tokens.demand = String(demand);

  let attitude = def.attitude;
  if (flags.friend || flags.respect || flags.cleared) attitude = 'friendly';
  if (flags.spared && attitude === 'hostile' && def.mind === 'reason') attitude = 'wary';
  if (flags.grudge || flags.enemy || flags.wanted || flags.angry) attitude = 'hostile';
  if (def.attitude === 'wary' && attitude === 'friendly' && def.demand && def.demand !== 'fine') demand = 0;

  const L = def.lines || {};
  let opener = pickLine(r, L.opener);
  if (flags.wanted && L.wanted) opener = L.wanted;
  else if (flags.angry && L.angry) opener = L.angry;
  else if (flags.friend && L.friendOpener) opener = L.friendOpener;
  else if (flags.cleared && !flags.grudge) opener = `"You again," ${leader.short === leader.title ? 'the leader' : leader.short} says. "Word's gone round that you're square with us. Go on through."`;
  else if (flags.grudge && def.mind === 'reason') opener = `"You! I know your face. You won't walk away from us twice." ${leader.short === leader.title ? 'The leader' : leader.short} is done talking.`;
  else if (flags.spared && def.mind === 'reason') opener = `${cap(leader.short)} squints at you. "The ones who let us go, on the road. We remember." They are waiting to see what you do this time.`;
  else if (flags.yielded && def.demand === 'purse') opener = `"Look who it is. You paid before — you'll pay again, and a bit more for our trouble. ${demand} gold."`;

  const inst = {
    uid: extra.uid || `enc${hashStr(`${seed}:${def.id}`).toString(36)}`,
    sitId: def.id, seed, name: def.name, kin: def.kin, faction: def.faction,
    attitude, baseAttitude: def.attitude, mind: def.mind, plea: def.plea, shape: def.shape, place: def.place,
    level, size, mapId: ctx.mapId, region: ctx.region, area: ctx.area,
    leader, monsters: roll.monsters, xp: roll.xp, count, allies: def.allies || null,
    demand, demandKind: def.demand, folk: folkFor(def, roll, leader), camp: def.camp,
    opener: fill(opener, tokens), why: fill(pickLine(r, L.why), tokens),
    rumor: def.rumor ? fill(pickLine(r, def.rumor), tokens) : null,
    lead: def.lead || null, spoils: def.spoils || null, reward: def.reward || null, trade: def.trade || null,
    ambush: !!def.ambush, innocent: def.innocent, proud: def.proud, tags: def.tags.slice(),
    spotted: def.spotted ? fill(def.spotted, tokens) : null, scripted: !!extra.scripted,
    // What meeting them a second time sounds like, once the matter is settled.
    again: fill(L.again || (attitude === 'friendly' ? DEFAULT_LINES.againFriendly : DEFAULT_LINES.againWary), tokens),
    contact, places, coster, tokens, flags,
    // Per-standoff bookkeeping: which one-shot options have been used.
    done: {}, noticed: extra.noticed != null ? extra.noticed : true, revealed: false,
    offer: null, dead: false, status: extra.status || 'active',
  };
  return inst;
}

function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }

/** The line a group's `lines` holds for a key, filled, or a default. */
export function lineOf(inst, key, fallback) {
  const def = situation(inst.sitId);
  const L = (def && def.lines) || {};
  const v = L[key];
  const r = makeRNG(`${inst.seed}:line:${key}`);
  const raw = v != null ? pickLine(r, v) : (fallback != null ? fallback : DEFAULT_LINES[key] || '');
  return fill(raw, inst.tokens || {});
}

/** How the mind behind a stat block meets a stranger. */
function mindOf(block) {
  if (!block) return 'reason';
  if (block.type === 'beast') return 'beast';
  if (['undead', 'construct', 'ooze', 'plant'].includes(block.type)) return 'mindless';
  if (num(block.abilities && block.abilities.int, 10) <= 3) return 'mindless';
  if (block.faction === 'gnoll') return 'feral';
  return 'reason';
}

/**
 * A fight the catalogue did not write — a dungeon's tile encounter, a scripted
 * trigger, a pack rolled from a map's own table — as an instance, so it opens on
 * the same card as every other meeting: who they are (openerFor), and what can
 * be done about it. `scripted` fights are story beats the map's author placed
 * (the Cragmaw ambush by the dead horses): they can be seen coming, and struck
 * first, but not talked out of.
 */
export function packInstance(st, ctx, { monsters = [], groupId = null, seed = 'pack', scripted = false, name = null } = {}) {
  const list = arr(monsters)
    .map((m) => ({ id: m && (m.id || m.monsterId), count: Math.max(1, (m && m.count) | 0 || 1) }))
    .filter((m) => m.id && blockOf(m.id));
  if (!list.length) return null;
  const lead = list.slice().sort((a, b) => num(blockOf(b.id).cr) - num(blockOf(a.id).cr))[0];
  const block = blockOf(lead.id);
  const title = `the ${String(block.name || lead.id).toLowerCase()}`;
  const def = {
    id: 'pack', name: name || titleFor({ groupId, monsters: list }),
    kin: groupId || block.faction || lead.id, faction: null,
    attitude: 'hostile', mind: mindOf(block), plea: null, shape: 'patrol', place: 'wild',
    level: [1, 30], foes: list.map((m) => [m.id, m.count, m.count]), tiers: null, allies: null,
    folk: null, leader: { foe: lead.id, title }, camp: null, demand: null,
    lines: { opener: openerFor({ groupId, monsters: list }) },
    rumor: null, lead: null, spoils: null, reward: null, trade: null,
    ambush: true, innocent: false, proud: false, tags: ['pack'],
    spotted: `You see them before they see you: ${String(name || titleFor({ groupId, monsters: list })).toLowerCase()}, not yet aware of you.`,
  };
  return instantiate(st, def, ctx, seed, { scripted });
}

// ---------------------------------------------------------------------------
// 5. PLANNING A MAP — the visible cast
// ---------------------------------------------------------------------------

/** Rebuild an instance from its plan entry. */
export function rehydrate(st, entry, ctx) {
  const def = situation(entry.sitId);
  if (!def) return null;
  const inst = instantiate(st, def, ctx, entry.seed, {
    uid: entry.uid, level: entry.level, size: entry.size, leaderName: entry.leaderName || null, from: entry.from || null,
    status: entry.status,
  });
  if (!inst) return null;
  inst.arrive = !!entry.arrive;
  inst.leadNote = entry.leadNote || null;
  inst.job = entry.job || null;
  if (entry.done) inst.done = { ...entry.done };
  return inst;
}

/** Pick `n` distinct situations for a plan, honouring the pacing's hostile share. */
function pickCast(st, ctx, r, n, P) {
  const out = [];
  const pool = candidates(st, ctx, 'plan');
  const used = new Set();
  let dangers = 0, camps = 0, posts = 0;
  const maxDanger = Math.max(1, Math.round(n * P.hostile + 0.35));
  for (let i = 0; i < n * 3 && out.length < n; i++) {
    const avail = pool.filter((c) => !used.has(c.def.id)
      && !(isDanger(c.def) && dangers >= maxDanger)
      && !(c.def.shape === 'camp' && camps >= 1)
      && !(c.def.shape === 'post' && posts >= 1));
    if (!avail.length) break;
    // Weight the danger share toward the pacing's target.
    const pick = r.pickWeighted(avail, (c) => c.w * (isDanger(c.def) ? P.hostile * 2 : (1 - P.hostile) * 2));
    if (!pick) break;
    used.add(pick.def.id);
    if (isDanger(pick.def)) dangers++;
    if (pick.def.shape === 'camp') camps++;
    if (pick.def.shape === 'post') posts++;
    out.push(pick.def);
  }
  return out;
}

/**
 * The visible cast for a wild map: reuse the current plan while it is fresh,
 * otherwise roll a new one. Leads for this map come first; camps persist on their
 * own clock; a returning captain may be waiting. Returns the instances to place.
 */
export function planMap(st, ctx) {
  const E = encounterState(st);
  if ((!ctx.wild && !ctx.deeps) || !ctx.mapId) return [];
  const now = absMinute(st);
  const P = PACING[ctx.pacing] || PACING.normal;
  let plan = E.plans[ctx.mapId];
  const stale = !plan || now - num(plan.made, -1e9) >= PLAN_MINUTES || Math.abs(num(plan.level, ctx.level) - ctx.level) >= 3;
  if (stale) {
    const r = makeRNG(`${worldSeedOf(st)}:plan:${ctx.mapId}:${Math.floor(now / PLAN_MINUTES)}`);
    const groups = [];
    const add = (def, extra = {}) => {
      const seed = `${worldSeedOf(st)}:${ctx.mapId}:${def.id}:${now}:${groups.length}`;
      groups.push({
        uid: `g${hashStr(seed).toString(36)}`, sitId: def.id, seed, status: 'active',
        level: ctx.level, size: ctx.size, ...extra,
      });
      E.seen[def.id] = now;
    };
    // A lead that points here is the reason to come.
    for (const lead of E.leads) {
      if (lead.state !== 'open' || !arr(lead.maps).includes(ctx.mapId)) continue;
      if ((st.day | 0) - num(lead.day, 0) > LEAD_DAYS) { lead.state = 'stale'; continue; }
      const def = situation(lead.sit);
      if (!def) continue;
      lead.state = 'placed';
      add(def, { leadNote: lead.note || null, job: lead.job || null });
    }
    // Camps are where people live for a few days; a broken one stays broken.
    for (const [key, c] of Object.entries(E.camps)) {
      if (c.mapId !== ctx.mapId) continue;
      if (c.cleared != null) {
        if ((st.day | 0) - c.cleared >= CAMP_CLEARED_DAYS) delete E.camps[key];
        continue;
      }
      if ((st.day | 0) - num(c.day, 0) >= CAMP_DAYS) { delete E.camps[key]; continue; }
      if (!groups.some((g) => g.sitId === c.sitId)) groups.push({ uid: c.uid, sitId: c.sitId, seed: c.seed, status: 'active', level: c.level, size: c.size });
    }
    // Whatever the world is doing here (a festival's pilgrims, a lost caravan's
    // survivors) puts its people on the road, once per event.
    for (const [k, d] of Object.entries(E.eventsPlaced)) if ((st.day | 0) - num(d, 0) > 30) delete E.eventsPlaced[k];
    for (const ev of arr(ctx.events)) {
      const key = ev && (ev.id || ev.key);
      if (!key || E.eventsPlaced[key]) continue;
      for (const sid of arr(ev.spawn)) {
        const def = situation(sid);
        if (!def || groups.some((g) => g.sitId === sid) || !fits(def, st, ctx, 'lead')) continue;
        E.eventsPlaced[key] = st.day | 0;
        add(def, { leadNote: ev.note || null });
      }
    }
    // A captain you let go, back with a proposition.
    const returning = returningLeader(st, ctx, r);
    if (returning) add(situation('returning-captain'), { leaderName: returning.name, from: returning.mapName || null });

    const [lo, hi] = P.groups;
    // A dungeon floor has its own denizens; the director adds at most one group of people.
    const n = ctx.deeps ? (groups.length || !r.chance(0.6) ? 0 : 1)
      : Math.max(0, r.int(lo, hi) + (ctx.w * ctx.h > 4200 ? 1 : 0) - groups.length);
    for (const def of pickCast(st, { ...ctx }, r, n, P)) {
      if (groups.some((g) => g.sitId === def.id)) continue;
      add(def);
      if (def.shape === 'camp') {
        const g = groups[groups.length - 1];
        E.camps[`${ctx.mapId}:${def.id}`] = { uid: g.uid, mapId: ctx.mapId, sitId: def.id, seed: g.seed, day: st.day | 0, level: ctx.level, size: ctx.size, cleared: null };
      }
    }
    plan = { made: now, level: ctx.level, size: ctx.size, groups };
    E.plans[ctx.mapId] = plan;
    trimPlans(E);
  }
  return plan.groups
    .filter((g) => g.status === 'active' || g.status === 'passed')
    .map((g) => rehydrate(st, g, ctx))
    .filter(Boolean);
}

/** Keep the plan table bounded: oldest maps first out. */
function trimPlans(E) {
  const keys = Object.keys(E.plans);
  if (keys.length <= PLAN_MAX) return;
  keys.sort((a, b) => num(E.plans[a].made) - num(E.plans[b].made));
  for (const k of keys.slice(0, keys.length - PLAN_MAX)) delete E.plans[k];
}

/** Cleared camps on this map: where the ashes are. */
export function ashesOn(st, mapId) {
  const E = encounterState(st);
  return Object.values(E.camps).filter((c) => c.mapId === mapId && c.cleared != null);
}

/** A spared captain who has had long enough to think about it. */
function returningLeader(st, ctx, r) {
  const E = encounterState(st);
  const road = ['road', 'plains', 'hills', 'forest', 'pine-forest'].includes(ctx.biome);
  if (!road) return null;
  for (const L of E.memory.leaders) {
    if (L.state !== 'spared') continue;
    if ((st.day | 0) - num(L.day, 0) < LEADER_RETURN_DAYS) continue;
    if (!r.chance(0.45)) continue;
    L.state = 'returned';
    return L;
  }
  return null;
}

/** Mark a planned group's fate so it survives a reload. */
export function settle(st, inst, status) {
  const E = encounterState(st);
  if (!inst) return;
  inst.status = status;
  const plan = E.plans[inst.mapId];
  const entry = plan && plan.groups.find((g) => g.uid === inst.uid);
  if (entry) { entry.status = status; entry.done = { ...inst.done }; }
  const camp = Object.values(E.camps).find((c) => c.uid === inst.uid);
  if (camp && (status === 'defeated' || status === 'routed')) camp.cleared = st.day | 0;
}

/**
 * Someone new walks onto the map: a caravan at the far exit, a patrol, hunters.
 * `danger` asks for someone who might fight. Returns an instance, already added to
 * the plan with `arrive: true` so it is placed at an edge.
 */
export function arrival(st, ctx, { danger = false } = {}) {
  const E = encounterState(st);
  const plan = E.plans[ctx.mapId];
  if (!plan) return null;
  const now = absMinute(st);
  const r = makeRNG(`${worldSeedOf(st)}:arrive:${ctx.mapId}:${E.steps}`);
  const active = plan.groups.filter((g) => g.status === 'active');
  const P = PACING[ctx.pacing] || PACING.normal;
  // A road is not a fairground: past a handful of groups, nobody else turns up.
  if (active.length >= P.crowd) return null;
  const present = new Set(active.map((g) => g.sitId));
  const pool = candidates(st, ctx, 'arrival', (def) => !present.has(def.id) && (danger ? isDanger(def) : !isDanger(def)));
  const pick = r.pickWeighted(pool, (c) => c.w);
  if (!pick) return null;
  const seed = `${worldSeedOf(st)}:${ctx.mapId}:${pick.def.id}:${now}:arrive`;
  const entry = { uid: `g${hashStr(seed).toString(36)}`, sitId: pick.def.id, seed, status: 'active', level: ctx.level, size: ctx.size, arrive: true };
  plan.groups.push(entry);
  E.seen[pick.def.id] = now;
  return rehydrate(st, entry, ctx);
}

/** The line that says someone new has come onto the map, and roughly who. */
export function arrivalLine(inst) {
  const def = situation(inst.sitId);
  if (def && def.lines && def.lines.arrive) return lineOf(inst, 'arrive');
  if (inst.shape === 'travel') return `Travellers on the road ahead: ${inst.name}.`;
  if (inst.shape === 'hunt' && inst.mind === 'beast') return `Something is hunting out there — ${inst.name}.`;
  if (inst.shape === 'hunt') return `${inst.name}, working the country off the road.`;
  if (inst.attitude === 'hostile') return `Movement at the edge of sight — ${inst.name}.`;
  return `Someone else is out here — ${inst.name}.`;
}

// ---------------------------------------------------------------------------
// 6. PACING — the tension budget, quiet beats, telegraphed ambushes
// ---------------------------------------------------------------------------

/**
 * One step of travel on a wild map. Returns what the road does about it:
 *   null
 *   { kind:'beat', beat, text }                 a quiet moment (maybe with a thing to do)
 *   { kind:'arrival', inst }                    someone walks onto the map
 *   { kind:'telegraph', inst, text }            an ambush is being laid, and here is the sign
 *   { kind:'spring', inst }                     the ambush arrives (see springAmbush)
 */
export function travelStep(st, ctx) {
  const E = encounterState(st);
  if (!ctx.wild) { if (E.pending) E.pending = null; return null; }
  const P = PACING[ctx.pacing] || PACING.normal;
  E.steps++;
  E.sinceBeat++;
  E.sinceArrival++;
  if (E.grace > 0) E.grace--;
  const r = makeRNG(`${worldSeedOf(st)}:step:${E.steps}`);
  // A new stretch of country announces itself soon after you set foot on it.
  if (E.lastMap !== ctx.mapId) {
    E.lastMap = ctx.mapId;
    E.sinceBeat = 0;
    E.nextBeat = r.int(18, 45);
  }

  // An armed ambush counts down on its own map; leaving the map disarms it.
  if (E.pending) {
    if (E.pending.mapId !== ctx.mapId) E.pending = null;
    else {
      E.pending.steps--;
      if (E.pending.steps <= 0) {
        const p = E.pending;
        E.pending = null;
        const inst = rehydrate(st, p.entry, ctx);
        if (inst) { inst.ambushing = true; return { kind: 'spring', inst }; }
      }
      return null;
    }
  }

  // Tension: the road, by day, in company, is the safe way through.
  let rate = P.tension * (ctx.night ? 1.45 : 1) * (ctx.onRoad ? 0.6 : 1) * num(ctx.tensionScale, 1);
  if (ctx.mapLevel > ctx.level + 2) rate *= 1.3;
  if (E.grace <= 0) E.tension = Math.min(TENSION_MAX, E.tension + rate);

  if (E.tension >= TENSION_MAX && E.grace <= 0) {
    E.tension = 0;
    E.grace = P.grace;
    E.sinceArrival = 0;
    const share = (AMBUSH_SHARE[ctx.ambush] || 0) * P.ambush;
    if (share > 0 && r.chance(share)) {
      const armed = armAmbush(st, ctx, r);
      if (armed) return armed;
    }
    const inst = arrival(st, ctx, { danger: true }) || arrival(st, ctx, { danger: false });
    if (inst) return { kind: 'arrival', inst };
  }

  // Peaceful comings and goings, on their own slower clock.
  if (E.sinceArrival >= P.arrivalGap && r.chance(0.015)) {
    E.sinceArrival = 0;
    const inst = arrival(st, ctx, { danger: false });
    if (inst) return { kind: 'arrival', inst };
  }

  if (E.sinceBeat >= E.nextBeat) {
    E.sinceBeat = 0;
    E.nextBeat = r.int(P.beatGap[0], P.beatGap[1]);
    const b = pickBeat(st, ctx, r);
    if (b) return { kind: 'beat', beat: b, text: b.text };
  }
  return null;
}

/** Lay an ambush for later, and give the warning now. */
function armAmbush(st, ctx, r) {
  const E = encounterState(st);
  const pool = candidates(st, ctx, 'ambush');
  const pick = r.pickWeighted(pool, (c) => c.w);
  if (!pick) return null;
  const seed = `${worldSeedOf(st)}:${ctx.mapId}:${pick.def.id}:${absMinute(st)}:ambush`;
  const entry = { uid: `a${hashStr(seed).toString(36)}`, sitId: pick.def.id, seed, status: 'active', level: ctx.level, size: ctx.size };
  E.pending = { mapId: ctx.mapId, steps: r.int(6, 12), entry };
  const inst = rehydrate(st, entry, ctx);
  const text = pick.def.telegraph ? pickLine(r, pick.def.telegraph) : 'The birds have gone quiet.';
  logEvent(st, inst, 'telegraph', text);
  return { kind: 'telegraph', inst, text };
}

/**
 * The ambush arrives. The party's best passive Perception against the ambushers'
 * Stealth (scaling.ambustContest, with the biome, the dark and the weather):
 *   'party'  -> you spotted them first: the standoff opens with them unaware of you
 *   false    -> both sides see each other: an ordinary standoff
 *   true     -> sprung: a card that says who and why, then the fight, surprised
 */
export function springAmbush(st, inst, ctx) {
  const r = makeRNG(`${inst.seed}:spring`);
  const res = ambushContest({
    monsters: inst.monsters,
    passive: partyPassive(ctx.party, 'perception'),
    biome: ctx.biome, night: ctx.night, weather: ctx.weather, rng: r,
  });
  const mode = res.ambush === 'party' ? 'unnoticed' : res.ambush === true ? 'sprung' : 'noticed';
  inst.noticed = mode !== 'unnoticed';
  logEvent(st, inst, 'ambush', mode === 'sprung' ? 'sprung on the party' : mode === 'unnoticed' ? 'spotted by the party first' : 'both sides saw each other');
  return { mode, contest: res };
}

/** A quiet beat that fits here and has not been seen today. */
function pickBeat(st, ctx, r) {
  const E = encounterState(st);
  const pool = BEATS.filter((b) => {
    if (b.maps && !b.maps.includes(ctx.mapId)) return false;
    if (b.biomes && !b.biomes.includes(ctx.biome)) return false;
    if (b.area !== 'any' && b.area !== ctx.area) return false;
    if (b.time === 'night' && !ctx.night) return false;
    if (b.time === 'day' && ctx.night) return false;
    if (b.weather && !b.weather.includes(ctx.weather)) return false;
    if (E.beatsSeen[b.id] === (st.day | 0)) return false;
    return true;
  });
  const b = r.pickWeighted(pool, (x) => x.weight * (x.maps ? 1.6 : 1));
  if (!b) return null;
  E.beatsSeen[b.id] = st.day | 0;
  logEvent(st, null, 'beat', b.text, { beat: b.id, mapId: ctx.mapId });
  return b;
}

/**
 * Act on a beat's `act`: leave a coin at a shrine, forage a snare line, pick up a
 * dropped purse. Returns { ok, text, roll }.
 */
export function beatAct(st, beatDef, ctx) {
  const E = encounterState(st);
  const act = beatDef && beatDef.act;
  if (!act) return { ok: false, text: '' };
  const party = ctx.party;
  const r = makeRNG(`${worldSeedOf(st)}:beat:${beatDef.id}:${absMinute(st)}`);
  if (act.kind === 'shrine') {
    if (goldOf(party) < act.cost) return { ok: false, text: 'You have nothing to leave.' };
    spend(party, act.cost);
    noteDeed(st, { kind: 'pray', target: 'tymora', mapId: ctx.mapId });
    if (E.inspiration > 0) return { ok: true, text: 'The coin clinks onto the cairn. Tymora already smiles on you.' };
    E.inspiration = 1;
    return { ok: true, text: 'The coin clinks onto the cairn, and the wind turns warm for a moment. Heroic Inspiration: you may reroll one failed check.' };
  }
  if (act.kind === 'forage') {
    const res = check(party, act.skill, act.dc, r, {});
    if (res.success) {
      give(party, act.item, act.qty);
      return { ok: true, text: `${res.who} finds enough for a meal. +${act.qty} ration${act.qty > 1 ? 's' : ''}.`, roll: res };
    }
    return { ok: false, text: `${res.who} comes back empty-handed.`, roll: res };
  }
  if (act.kind === 'find') {
    const g = Math.max(1, rollExpr(act.gold || '1d6', r).total);
    if (typeof party.addGold === 'function') party.addGold(g); else party.gold = goldOf(party) + g;
    return { ok: true, text: `+${g} gp.` };
  }
  return { ok: false, text: '' };
}

/** Anything that resolves a danger buys the road some peace. */
export function calm(st, ctx, { soft = false } = {}) {
  const E = encounterState(st);
  const P = PACING[(ctx && ctx.pacing) || 'normal'] || PACING.normal;
  // Blood spent buys the road real peace. A toll paid or a patrol talked round
  // only takes the edge off: the wilds do not stop being the wilds.
  E.tension = soft ? E.tension * 0.5 : 0;
  E.grace = Math.max(E.grace, soft ? Math.round(P.grace / 2) : P.grace);
  if (!soft) E.pending = null;
}

// ---------------------------------------------------------------------------
// 7. CHECKS — real 2024 rolls, shown to the player
// ---------------------------------------------------------------------------

const living = (party) => arr(party && party.members).filter((m) => m && (m.hp | 0) > 0);

function modFor(ch, skill) {
  if (!ch) return 0;
  if (SKILL_ABILITY[skill]) { try { return skillMod(ch, skill).mod; } catch (e) { return 0; } }
  try { return abilityMod(ch, skill); } catch (e) { return 0; }
}

/** The party member with the best odds at a skill. */
function bestFor(party, skill) {
  let best = null, bm = -99;
  for (const m of living(party)) { const v = modFor(m, skill); if (v > bm) { bm = v; best = m; } }
  return best || arr(party && party.members)[0] || null;
}

/** Best passive score in the party (Perception by default). */
export function partyPassive(party, skill = 'perception') {
  let best = 10;
  for (const m of living(party)) {
    try { best = Math.max(best, skillMod(m, skill).passive); } catch (e) { /* ignore */ }
  }
  return best;
}

function rollOf(res, who, label, vs) {
  const roll = res && res.roll;
  return {
    who: (who && who.name) || 'The party', skill: label,
    natural: roll ? roll.natural : 10, rolls: roll ? roll.rolls : [10], mod: res ? res.mod : 0,
    total: res ? res.total : 10, dc: vs, success: !!(res && res.success),
    adv: !!(res && res.adv), dis: !!(res && res.dis), bonus: roll ? roll.bonus : 0,
  };
}

/** One party member's check against a DC. */
function check(party, skill, dc, r, o) {
  const who = o.who || bestFor(party, skill);
  const ability = SKILL_ABILITY[skill] || skill;
  const res = abilityCheck({ rng: r }, who, ability, {
    skill: SKILL_ABILITY[skill] ? skill : undefined, dc, adv: !!o.adv, dis: !!o.dis,
    advReason: o.advReason, disReason: o.disReason,
  });
  const out = rollOf(res, who, SKILL_NAME[skill] || skill, dc);
  out.text = `${out.who} rolls ${out.skill}: ${out.natural}${fmtMod(out.mod + out.bonus)} = ${out.total} vs DC ${dc}`;
  out.kind = 'dc';
  return out;
}

/** A contest: the party's best against their leader's roll. Ties go to them. */
function contest(party, skill, npc, r, o) {
  const who = o.who || bestFor(party, skill);
  const ability = SKILL_ABILITY[skill] || skill;
  const mine = abilityCheck({ rng: r }, who, ability, {
    skill: SKILL_ABILITY[skill] ? skill : undefined, dc: 0, adv: !!o.adv, dis: !!o.dis,
  });
  const theirs = d20(npc.mod, { adv: !!npc.adv, dis: !!npc.dis }, r);
  const out = rollOf(mine, who, SKILL_NAME[skill] || skill, theirs.total);
  out.success = mine.total > theirs.total;
  out.kind = 'contest';
  out.vs = { who: npc.name, skill: npc.label, natural: theirs.natural, mod: npc.mod, total: theirs.total };
  out.text = `${out.who} rolls ${out.skill}: ${out.natural}${fmtMod(out.mod + out.bonus)} = ${out.total}  vs  ${npc.name} ${npc.label}: ${theirs.natural}${fmtMod(npc.mod)} = ${theirs.total}`;
  return out;
}

/** A 2024 group check: the party succeeds if at least half of it does. */
function groupCheck(party, skill, dc, r, o = {}) {
  const who = living(party);
  const rows = [];
  for (const m of who) {
    const res = abilityCheck({ rng: r }, m, SKILL_ABILITY[skill] || skill, {
      skill: SKILL_ABILITY[skill] ? skill : undefined, dc, adv: !!o.adv, dis: !!o.dis,
    });
    rows.push({ name: m.name, natural: res.roll ? res.roll.natural : 10, total: res.total, success: !!res.success, mod: res.mod });
  }
  const passed = rows.filter((x) => x.success).length;
  const need = Math.ceil(Math.max(1, rows.length) / 2);
  const lead = rows[0] || { name: 'The party', natural: 10, total: 10, mod: 0, success: false };
  return {
    who: rows.length > 1 ? 'The party' : lead.name, skill: SKILL_NAME[skill] || skill, kind: 'group',
    natural: lead.natural, rolls: [lead.natural], mod: lead.mod, bonus: 0, total: lead.total, dc,
    success: passed >= need, rows, passed, need,
    text: rows.length > 1
      ? `${SKILL_NAME[skill] || skill} (group): ${passed} of ${rows.length} beat DC ${dc} — ${passed >= need ? 'enough' : 'not enough'}`
      : `${lead.name} rolls ${SKILL_NAME[skill] || skill}: ${lead.natural}${fmtMod(lead.mod)} = ${lead.total} vs DC ${dc}`,
  };
}

const fmtMod = (m) => (m >= 0 ? ` + ${m}` : ` - ${-m}`);

// --- the other side of the table --------------------------------------------

function skillOfBlock(block, skill) {
  if (!block) return 0;
  // 'wisdom' is a plain Wisdom check — a beast has no Insight to speak of.
  if (skill === 'wisdom') return abmod(block.abilities && block.abilities.wis);
  const s = block.skills && block.skills[skill];
  if (typeof s === 'number') return s;
  return abmod(block.abilities && block.abilities[SKILL_ABILITY[skill] || skill]);
}

/** Their leader's modifier for a skill, a little sharper when the party has outgrown them. */
function leaderMod(inst, skill) {
  const block = blockOf(inst.leader.monsterId) || blockOf(inst.monsters[0] && inst.monsters[0].id);
  const base = skillOfBlock(block, skill);
  const bump = Math.max(0, Math.floor((inst.level - num(block && block.cr, 0) - 2) / 4));
  return base + bump;
}

/** The best passive Perception on their side. */
function theirPassive(inst) {
  let best = 10;
  for (const m of inst.monsters) {
    const b = blockOf(m.id);
    if (!b) continue;
    const pp = b.passivePerception != null ? num(b.passivePerception, 10) : 10 + skillOfBlock(b, 'perception');
    best = Math.max(best, pp);
  }
  return best;
}

function darkvisionOf(inst) {
  return inst.monsters.some((m) => num(blockOf(m.id) && blockOf(m.id).senses && blockOf(m.id).senses.darkvision, 0) > 0);
}

/** 2024 Influence: DC 15 or the creature's Intelligence, whichever is higher. */
function influenceDC(inst) {
  const block = blockOf(inst.leader.monsterId) || blockOf(inst.monsters[0] && inst.monsters[0].id);
  return Math.max(15, num(block && block.abilities && block.abilities.int, 10));
}

/**
 * Who outmatches whom, by the 2024 encounter budget: their XP against what this
 * party is built to handle. Intimidation reads it (numbers are the argument).
 */
function powerEdge(inst, ctx) {
  const low = encounterBudget(ctx.level, ctx.size, 'easy');
  const high = encounterBudget(ctx.level, ctx.size, 'hard');
  const xp = inst.monsters.reduce((a, m) => a + unitCost(m.id, ctx.level, 0, lookup) * m.count, 0);
  if (xp <= low * 0.6) return 'party';
  if (xp >= high * 1.2) return 'them';
  return 'even';
}

/** The DC to slip past them: their passive Perception, blunted by dark and weather. */
function stealthDC(inst, ctx) {
  let pp = theirPassive(inst);
  let pen = 0;
  if (ctx.night && !darkvisionOf(inst)) pen = 5;
  if (['fog', 'rain', 'storm'].includes(ctx.weather)) pen = 5;
  else if (ctx.weather === 'snow') pen = Math.max(pen, 2);
  if (inst.shape === 'camp' && ctx.night) pen += 2;
  return Math.max(5, pp - pen);
}

/**
 * The party creeping up on a group from cover: a group Stealth check against
 * their passive Perception. The overworld calls it once per approach, the first
 * time the group could see the party, so leaving the road actually matters.
 */
export function approachRoll(st, inst, ctx) {
  const E = encounterState(st);
  const r = makeRNG(`${inst.seed}:approach:${E.steps}`);
  return groupCheck(ctx.party, 'stealth', stealthDC(inst, ctx), r);
}

function fleeDC(inst) {
  let dex = -5;
  let fast = false;
  for (const m of inst.monsters) {
    const b = blockOf(m.id);
    if (!b) continue;
    dex = Math.max(dex, abmod(b.abilities && b.abilities.dex));
    if (num(b.speed, 30) > 30) fast = true;
  }
  let dc = 10 + dex + (fast ? 2 : 0);
  if (inst.mind === 'mindless') dc -= 4;
  return clamp(dc, 5, 20);
}

/** A cleric who can still Channel Divinity, and their save DC. */
function turner(party) {
  for (const m of living(party)) {
    const isCleric = arr(m.classes).some((k) => k && k.id === 'cleric');
    const cd = m.resources && m.resources['channel-divinity'];
    if (!isCleric || !cd || num(cd.max) - num(cd.used) <= 0) continue;
    const dc = num(m.spells && m.spells.dc, 8 + num(m.prof, 2) + abmod(m.abilities && m.abilities.wis));
    return { ch: m, dc };
  }
  return null;
}

// ---------------------------------------------------------------------------
// 8. THE STANDOFF — options
// ---------------------------------------------------------------------------

/** Default option lists, by who they are. */
function defaultOptions(inst) {
  if (inst.mind === 'mindless') return ['turn', 'attack', 'flee'];
  if (inst.mind === 'feral') return ['food', 'attack', 'flee'];
  if (inst.mind === 'beast') return ['food', 'leave', 'attack', 'flee'];
  if (inst.attitude === 'hostile') return ['talk', 'pay', 'intimidate', 'persuade', 'deceive', 'surrender', 'attack', 'flee'];
  if (inst.attitude === 'wary') return ['talk', 'pay', 'persuade', 'deceive', 'intimidate', 'attack', 'leave'];
  return ['talk', 'ask', 'trade', 'leave'];
}

const FOOD_NEED = { refugees: 2, monks: 2, adventurers: 2, ogre: 3, 'hill-giant': 4, ankheg: 2, gnolls: 1, wolves: 1, owlbear: 2, cragmaw: 1, lizardfolk: 1 };

/**
 * What can be done, right now, in this standoff. `mode`:
 *   'noticed'    the usual: they have seen you, you have seen them
 *   'unnoticed'  you are watching them and they do not know it
 *   'sprung'     their ambush worked; there is no talking now
 *   'settled'    this was resolved earlier; a word in passing
 * -> [{ id, label, hint, danger, disabled, reason }]
 */
export function standoffOptions(st, inst, ctx, mode = 'noticed') {
  const def = situation(inst.sitId) || {};
  const party = ctx.party;
  const E = encounterState(st);
  const L = def.lines || {};
  const out = [];
  const add = (id, label, hint = '', o = {}) => out.push({ id, label, hint, danger: !!o.danger, disabled: !!o.disabled, reason: o.reason || '' });
  const label = (id, fallback) => fill(L[id] || fallback, inst.tokens);
  const hostileish = inst.attitude === 'hostile' || inst.attitude === 'wary';

  if (inst.scripted && mode !== 'settled') {
    if (mode === 'unnoticed') add('ambush', 'Strike first', 'SURPRISE', { danger: true });
    add('attack', mode === 'unnoticed' ? 'Step out and face them' : 'Fight!', mode === 'sprung' ? 'SURPRISED' : 'ATTACK', { danger: true });
    return out;
  }
  if (mode === 'sprung') {
    add('attack', 'Fight!', 'SURPRISED', { danger: true });
    return out;
  }
  if (mode === 'unnoticed') {
    add('hail', inst.attitude === 'friendly' ? 'Step out and hail them' : 'Step out and call to them');
    if (inst.shape !== 'scene' || hostileish) add('sneak', 'Slip past unseen', `Stealth (group) vs ${stealthDC(inst, ctx)}`);
    if (['patrol', 'travel', 'hunt'].includes(inst.shape) && hostileish) add('shadow', 'Shadow them and see where they go', `Stealth (group) vs ${stealthDC(inst, ctx) + 2}`);
    if (hostileish) add('ambush', 'Strike first', 'SURPRISE', { danger: true });
    add('leave', 'Back off quietly');
    return out;
  }
  if (mode === 'settled') {
    if (inst.mind === 'reason' && inst.rumor && !inst.done.ask) add('ask', 'Ask what they have seen');
    if (inst.trade) add('trade', 'Trade');
    if (inst.mind === 'reason') add('talk', 'Pass the time of day');
    add('leave', 'Go on your way');
    add('attack', 'Attack them', 'ATTACK', { danger: true });
    return out;
  }

  let list = def.options ? def.options.slice() : defaultOptions(inst);
  if (inst.flags.grudge && inst.mind === 'reason') list = ['intimidate', 'pay', 'surrender', 'attack', 'flee'];
  if (inst.flags.wanted) list = ['pay', 'persuade', 'deceive', 'surrender', 'attack', 'flee'];
  if (inst.flags.angry) list = ['persuade', 'leave', 'attack'];
  if (inst.flags.friend || (inst.flags.cleared && inst.attitude === 'friendly')) list = ['talk', 'ask', 'leave'];
  if (inst.flags.spared && inst.mind === 'reason' && hostileish && !list.includes('remind')) list.unshift('remind');
  if (inst.offer) list = ['accept', 'refuse', ...(inst.revealed || inst.done.recognise ? [] : ['recognise'])];
  if (inst.sitId === 'harper-courier' && inst.dead) list = inst.done.read ? ['leave'] : ['read', 'carry', 'leave'];

  for (const id of list) {
    if (inst.done[id] && !['pay', 'trade', 'attack', 'flee', 'leave', 'surrender'].includes(id)) continue;
    switch (id) {
      case 'talk':
        if (inst.mind === 'reason') add('talk', inst.attitude === 'hostile' ? 'Ask what they want' : 'Talk');
        break;
      case 'ask':
        if (inst.rumor && inst.mind === 'reason') add('ask', 'Ask what they have seen on the road');
        break;
      case 'remind':
        add('remind', 'Remind them you let them go once', `Persuasion DC ${Math.max(10, influenceDC(inst) - 5)} (ADV)`);
        break;
      case 'pay': {
        const cost = inst.demand;
        if (!cost) break;
        const what = inst.demandKind === 'fine' ? 'Pay the fine' : inst.demandKind === 'toll' ? 'Pay the toll' : inst.demandKind === 'tribute' ? 'Pay the tribute' : 'Pay them off';
        add('pay', label('pay', what), `${cost} gp`, { disabled: goldOf(party) < cost, reason: goldOf(party) < cost ? `${cost} gp` : '' });
        break;
      }
      case 'haggle':
        if (inst.demand) add('haggle', label('haggle', 'Haggle'), `Persuasion DC ${influenceDC(inst)}`);
        break;
      case 'persuade':
        if (inst.mind === 'reason') add('persuade', label('persuade', inst.attitude === 'hostile' ? 'Talk them out of it' : 'Talk your way past'), `Persuasion DC ${influenceDC(inst)}${inst.attitude === 'hostile' ? ' (DIS)' : inst.attitude === 'friendly' ? ' (ADV)' : ''}`);
        break;
      case 'deceive':
        if (inst.mind === 'reason') add('deceive', label('deceive', 'Lie your way through'), `Deception vs Insight ${fmtSigned(leaderMod(inst, 'insight'))}`);
        break;
      case 'intimidate': {
        if (inst.mind !== 'reason') break;
        const edge = powerEdge(inst, ctx);
        add('intimidate', label('intimidate', 'Threaten them'), `Intimidation vs Insight ${fmtSigned(leaderMod(inst, 'insight'))}${edge === 'party' ? ' (ADV)' : edge === 'them' ? ' (DIS)' : ''}`);
        break;
      }
      case 'hire': {
        const cost = Math.max(10, 6 * inst.level);
        add('hire', label('hire', 'Offer them work'), `Persuasion DC ${influenceDC(inst)} · ${cost} gp`, { disabled: goldOf(party) < cost, reason: goldOf(party) < cost ? `${cost} gp` : '' });
        break;
      }
      case 'surrender':
        if (goldOf(party) > 0) add('surrender', 'Surrender your purse', `${Math.max(1, Math.ceil(goldOf(party) / 3))} gp`);
        break;
      case 'food': {
        const need = FOOD_NEED[inst.kin] || 1;
        const have = rationsOf(party);
        const beast = inst.mind === 'beast';
        const hint = beast && inst.kin === 'wolves' ? `${need} ration · Animal Handling DC 12` : `${need} ration${need > 1 ? 's' : ''}`;
        add('food', label('food', inst.plea === 'hunger' ? 'Share your food' : 'Throw them food'), hint, { disabled: have < need, reason: have < need ? `${need} ration${need > 1 ? 's' : ''}` : '' });
        break;
      }
      case 'trade':
        if (inst.trade) add('trade', 'Trade');
        break;
      case 'rob':
        add('rob', label('rob', 'Rob them'), `Intimidation vs Insight ${fmtSigned(leaderMod(inst, 'insight'))}`, { danger: true });
        break;
      case 'hush':
        add('hush', label('hush', 'Take their silver and forget them'), `+${5 * inst.level} gp`);
        break;
      case 'attack':
        add('attack', inst.attitude === 'friendly' || inst.innocent ? 'Attack them' : 'Draw steel', 'ATTACK', { danger: true });
        break;
      case 'flee':
        add('flee', inst.mind === 'mindless' ? 'Back away into the dark' : 'Run for it', `Athletics/Acrobatics (group) vs ${fleeDC(inst)}`);
        break;
      case 'leave':
        if (inst.mind === 'beast' && inst.attitude === 'hostile' && !inst.plea) add('leave', label('leave', 'Back away'), `Animal Handling DC ${inst.kin === 'owlbear' ? 13 : 12}`);
        else if (inst.plea === 'rescue') add('leave', label('leave', 'Keep walking'), '');
        else add('leave', label('leave', inst.attitude === 'wary' ? 'Turn back' : 'Go on your way'));
        break;
      case 'turn': {
        const t = turner(party);
        if (!t) break;
        add('turn', label('turn', 'Turn Undead'), `${t.ch.name}: Channel Divinity · WIS save DC ${t.dc}`);
        break;
      }
      case 'tend': {
        const kit = hasItem(party, 'healers-kit');
        const potion = hasItem(party, 'potion-healing');
        add('tend', label('tend', 'Tend the wound'), kit ? "Healer's Kit" : 'Medicine DC 10');
        if (potion) add('potion', 'Give her a Potion of Healing', '1 potion');
        break;
      }
      case 'read':
        add('read', 'Open the letter carefully', 'Investigation DC 13');
        break;
      case 'carry':
        add('carry', `Carry the letter to ${inst.contact.name}`, 'quest');
        break;
      case 'help':
        add('help', label('help', 'Fight beside them'), `${alliesText(inst)} join you`, { danger: true });
        break;
      case 'drive': {
        const beast = inst.mind === 'beast';
        add('drive', label('drive', 'Drive them off'), `Intimidation vs ${beast ? 'Wisdom' : 'Insight'} ${fmtSigned(beast ? leaderMod(inst, 'wisdom') : leaderMod(inst, 'insight'))}`);
        break;
      }
      case 'escort':
        add('escort', label('escort', 'Take them home'), 'quest');
        break;
      case 'hunt':
        if (!ctx.night) add('hunt', label('hunt', 'Join the hunt'), 'Survival DC 13 · 1 hour');
        break;
      case 'rest':
        add('rest', label('rest', 'Share their fire'), '1 hour · Short Rest');
        break;
      case 'pray':
        if (!ctx.night) add('pray', label('pray', 'Pray with them'), '30 minutes');
        break;
      case 'donate': {
        const cost = Math.max(5, 3 * inst.level);
        add('donate', label('donate', 'Give them coin'), `${cost} gp`, { disabled: goldOf(party) < cost, reason: goldOf(party) < cost ? `${cost} gp` : '' });
        break;
      }
      case 'duel':
        add('duel', label('duel', 'Challenge their champion'), '1 on 1', { danger: true });
        break;
      case 'bargain':
        add('bargain', label('bargain', 'Hear her offer'));
        break;
      case 'recognise':
        add('recognise', label('recognise', 'Look at her properly'), 'Arcana DC 13');
        break;
      case 'accept':
        add('accept', inst.offer ? `Accept: ${inst.offer.priceText}` : label('accept', 'Accept'), inst.offer ? 'bargain' : '', { danger: !!inst.offer });
        break;
      case 'refuse':
        add('refuse', label('refuse', 'Refuse'));
        break;
      default: break;
    }
  }
  if (!out.some((o) => o.id === 'attack') && inst.mind !== 'mindless' && !inst.plea && inst.attitude !== 'friendly') {
    add('attack', 'Draw steel', 'ATTACK', { danger: true });
  }
  return out;
}

const fmtSigned = (n) => (n >= 0 ? `+${n}` : `${n}`);
function alliesText(inst) {
  const n = arr(inst.allies).reduce((a, x) => a + (x[1] | 0), 0);
  return n ? `${n} guard${n > 1 ? 's' : ''}` : 'they';
}
const hasItem = (party, id, qty = 1) => (party && typeof party.hasItem === 'function' ? party.hasItem(id, qty) : false);
function give(party, id, qty = 1) { if (party && typeof party.addItem === 'function') party.addItem(id, qty); }
function take(party, id, qty = 1) { if (party && typeof party.removeItem === 'function') party.removeItem(id, qty); }
function spend(party, n) {
  if (!party || n <= 0) return 0;
  const g = Math.min(goldOf(party), n);
  if (typeof party.addGold === 'function') party.addGold(-g); else party.gold = goldOf(party) - g;
  return g;
}
function earn(party, n) {
  if (!party || n <= 0) return 0;
  if (typeof party.addGold === 'function') party.addGold(n); else party.gold = goldOf(party) + n;
  return n;
}

// ---------------------------------------------------------------------------
// 9. THE STANDOFF — resolution
// ---------------------------------------------------------------------------
//
// resolveOption() decides — it rolls, and says what happens — without changing
// anything, so the scene can show the dice and offer Heroic Inspiration's reroll
// before a word is committed. applyResult() then makes it so.
//
// A result: { option, roll, success, outcome:{ kind, surprise, allies, champion,
//             shop, text }, lines:[], fx:{ gold, spend, items, take, deeds, memory,
//             rumor, lead, quest, tempHp, allies, fine, cd, inspiration, done, flags } }
// Outcome kinds: 'fight' 'pass' 'rout' 'retreat' 'menu' 'trade' 'noticed'.

const outcome = (kind, o = {}) => ({ kind, ...o });

/** Talked (or lied) past them: their own line for it if the writer gave one, else the parting. */
const talkedPast = (inst) => {
  const def = situation(inst.sitId);
  return def && def.lines && def.lines.talked ? lineOf(inst, 'talked') : lineOf(inst, 'pass');
};

const HANDLERS = {
  talk(c) {
    const { inst } = c;
    // The card already said why they are here; talking gets you what they are like.
    const lines = [lineOf(inst, 'talk', inst.why || DEFAULT_LINES.talkNothing)];
    if (inst.attitude === 'friendly' && inst.rumor && !inst.done.ask) { lines.push(inst.rumor); c.fx.rumor = inst.rumor; c.fx.done.ask = true; }
    c.fx.done.talk = true;
    c.fx.deeds.push({ kind: 'parley', weight: 1 });
    return { outcome: outcome('menu'), lines };
  },
  ask(c) {
    const { inst } = c;
    c.fx.done.ask = true;
    c.fx.rumor = inst.rumor;
    if (inst.lead) c.fx.lead = inst.lead;
    // What they say about where they came from is directions, if you listen.
    const def = situation(inst.sitId);
    if (def && def.site && inst.rumor) c.fx.site = def.site;
    return { outcome: outcome('menu'), lines: [inst.rumor || 'They have seen nothing worth telling.'] };
  },
  remind(c) {
    const { inst } = c;
    const roll = check(c.party, 'persuasion', Math.max(10, influenceDC(inst) - 5), c.r, { adv: true, advReason: 'they remember your mercy' });
    c.fx.done.remind = true;
    if (roll.success) {
      c.fx.deeds.push({ kind: 'parley', weight: 2 });
      if (inst.rumor) c.fx.rumor = inst.rumor;
      return { roll, outcome: outcome('pass'), lines: [`${cap(inst.leader.short)} nods slowly. "Mercy for mercy. Go on, then."`, inst.rumor].filter(Boolean) };
    }
    return { roll, outcome: outcome('menu'), lines: ['"That was then."'] };
  },
  pay(c) {
    const { inst } = c;
    const cost = inst.demand;
    if (goldOf(c.party) < cost) return { outcome: outcome('menu'), lines: ['You cannot cover that.'] };
    c.fx.spend = cost;
    if (inst.demandKind === 'fine') {
      c.fx.fine = true;
      c.fx.deeds.push({ kind: 'parley', weight: 2, tags: ['fine'] });
    } else {
      c.fx.deeds.push({ kind: 'bribe', weight: cost >= 50 ? 2 : 1 });
      if (inst.demandKind === 'purse') c.fx.memory.yielded = true;
    }
    return { outcome: outcome('pass'), lines: [DEFAULT_LINES.paid, lineOf(inst, 'pass')] };
  },
  haggle(c) {
    const { inst } = c;
    const roll = check(c.party, 'persuasion', influenceDC(inst), c.r, {});
    c.fx.done.haggle = true;
    if (roll.success) {
      c.fx.demand = Math.max(1, Math.round(inst.demand / 2));
      return { roll, outcome: outcome('menu'), lines: [DEFAULT_LINES.haggleOk, `The price is ${c.fx.demand} gp now.`] };
    }
    c.fx.demand = Math.round(inst.demand * 1.25);
    return { roll, outcome: outcome('menu'), lines: [DEFAULT_LINES.haggleFail, `The price is ${c.fx.demand} gp now.`] };
  },
  persuade(c) {
    const { inst } = c;
    const hostile = inst.attitude === 'hostile';
    const roll = check(c.party, 'persuasion', influenceDC(inst), c.r, {
      dis: hostile, disReason: 'they are hostile', adv: inst.attitude === 'friendly', advReason: 'they are friendly',
    });
    c.fx.done.persuade = true;
    if (roll.success) {
      c.fx.deeds.push({ kind: 'persuade', weight: 2 });
      if (inst.flags.wanted) return { roll, outcome: outcome('pass'), lines: ['The sergeant sighs. "Fine. I never saw you. Go on."'] };
      if (inst.flags.angry) {
        c.fx.memory.forgiven = true;
        return { roll, outcome: outcome('pass'), lines: ['The warden hears you out, and in the end steps aside. "Walk carefully, then."'] };
      }
      if (inst.attitude !== 'hostile' && inst.rumor) c.fx.rumor = inst.rumor;
      return { roll, outcome: outcome('pass'), lines: [talkedPast(inst), c.fx.rumor].filter(Boolean) };
    }
    if (hostile) return { roll, outcome: outcome('fight'), lines: [DEFAULT_LINES.persuadeFail, DEFAULT_LINES.fightHostile] };
    return { roll, outcome: outcome('menu'), lines: [DEFAULT_LINES.persuadeFail] };
  },
  deceive(c) {
    const { inst } = c;
    const roll = contest(c.party, 'deception', { name: cap(inst.leader.short), label: 'Insight', mod: leaderMod(inst, 'insight') }, c.r, {});
    c.fx.done.deceive = true;
    if (roll.success) {
      c.fx.deeds.push({ kind: 'lie', weight: 2 });
      if (inst.tags.includes('strongbox')) return strongboxTaken(c, roll, 'lie');
      if (inst.rumor) c.fx.rumor = inst.rumor;
      return { roll, outcome: outcome('pass'), lines: [talkedPast(inst), inst.rumor].filter(Boolean) };
    }
    if (inst.attitude === 'hostile') return { roll, outcome: outcome('fight'), lines: [DEFAULT_LINES.deceiveFail, DEFAULT_LINES.fightAngry] };
    c.fx.attitude = 'hostile';
    return { roll, outcome: outcome('menu'), lines: [DEFAULT_LINES.deceiveFail, 'Hands drift toward hilts.'] };
  },
  intimidate(c) {
    const { inst, ctx } = c;
    const edge = powerEdge(inst, ctx);
    const strongArm = inst.proud && living(c.party).some((m) => num(m.abilities && m.abilities.str, 10) >= 16);
    const roll = contest(c.party, 'intimidation', { name: cap(inst.leader.short), label: 'Insight', mod: leaderMod(inst, 'insight') }, c.r, {
      adv: edge === 'party' || strongArm, dis: edge === 'them',
    });
    c.fx.done.intimidate = true;
    if (roll.success) {
      c.fx.deeds.push({ kind: 'threaten', weight: 2 });
      c.fx.deeds.push({ kind: 'spare', weight: 1 });
      c.fx.memory.spared = true;
      c.fx.memory.leader = true;
      const lines = [lineOf(inst, 'rout')];
      const drop = spoilsOf(inst, c.r);
      if (drop.length) { c.fx.items.push(...drop); lines.push(`They leave behind: ${drop.map((d) => d.name).join(', ')}.`); }
      if (inst.proud) c.fx.memory.respect = true;
      return { roll, outcome: outcome(inst.shape === 'post' || inst.shape === 'camp' ? 'pass' : 'rout'), lines };
    }
    if (inst.attitude === 'hostile' || inst.proud) return { roll, outcome: outcome('fight'), lines: [DEFAULT_LINES.intimidateFail, DEFAULT_LINES.fightAngry] };
    if (inst.demand) c.fx.demand = inst.demand * 2;
    return { roll, outcome: outcome('menu'), lines: [DEFAULT_LINES.intimidateFail, inst.demand ? `The price is ${inst.demand * 2} gp now.` : ''].filter(Boolean) };
  },
  hire(c) {
    const { inst } = c;
    const cost = Math.max(10, 6 * inst.level);
    const roll = check(c.party, 'persuasion', influenceDC(inst), c.r, {});
    c.fx.done.hire = true;
    if (roll.success && goldOf(c.party) >= cost) {
      c.fx.spend = cost;
      c.fx.allies = [{ id: 'bandit', count: 2, from: inst.name }];
      c.fx.deeds.push({ kind: 'bribe', weight: 1, tags: ['hired'] }, { kind: 'spare', weight: 1 });
      c.fx.memory.spared = true;
      c.fx.memory.leader = true;
      return { roll, outcome: outcome('rout'), lines: [DEFAULT_LINES.hired, 'Two of the band will ride with you and fight at your side for a day.'] };
    }
    return { roll, outcome: outcome('menu'), lines: ['"Work? For you? Pay first, talk later."'] };
  },
  surrender(c) {
    const loss = Math.max(1, Math.ceil(goldOf(c.party) / 3));
    c.fx.spend = loss;
    c.fx.memory.yielded = true;
    c.fx.deeds.push({ kind: 'surrender', weight: 1 });
    return { outcome: outcome('pass'), lines: [DEFAULT_LINES.surrender, `-${loss} gp.`] };
  },
  food(c) {
    const { inst } = c;
    const need = FOOD_NEED[inst.kin] || 1;
    if (rationsOf(c.party) < need) return { outcome: outcome('menu'), lines: ['You have nothing to give.'] };
    c.fx.take.push(['rations', need]);
    if (inst.plea === 'hunger') {
      c.fx.deeds.push({ kind: 'charity', weight: 2 });
      c.fx.done.food = true;
      c.fx.rumor = inst.rumor;
      if (inst.lead) c.fx.lead = inst.lead;
      const heard = inst.done.ask;
      c.fx.done.ask = true;
      return { outcome: outcome('menu'), lines: [lineOf(inst, 'grateful'), heard ? null : inst.rumor].filter(Boolean) };
    }
    if (inst.kin === 'wolves') {
      const roll = check(c.party, 'animal-handling', 12, c.r, {});
      if (roll.success) {
        c.fx.deeds.push({ kind: 'rescue', weight: 2, tags: ['mercy'] }, { kind: 'spare', target: 'wolves', weight: 1 });
        return { roll, ...rescued(c, [DEFAULT_LINES.foodBeast]) };
      }
      return { roll, outcome: outcome('fight'), lines: [DEFAULT_LINES.foodFail] };
    }
    if (inst.kin === 'owlbear') c.fx.deeds.push({ kind: 'spare', weight: 2, tags: ['beast', 'cubs', 'mercy'] });
    else if (inst.kin === 'lizardfolk') { c.fx.rumor = inst.rumor; c.fx.deeds.push({ kind: 'gift', weight: 1 }); }
    else c.fx.deeds.push({ kind: 'bribe', weight: 1, tags: ['food'] });
    const lines = [lineOf(inst, 'pass')];
    if (inst.kin === 'lizardfolk' && inst.rumor) lines.push(inst.rumor);
    return { outcome: outcome(inst.mind === 'feral' ? 'retreat' : 'pass'), lines };
  },
  trade(c) {
    return { outcome: outcome('trade', { shop: shopFor(c.inst, c.st) }), lines: [] };
  },
  rob(c) {
    const { inst } = c;
    const roll = contest(c.party, 'intimidation', { name: cap(inst.leader.short), label: 'Insight', mod: leaderMod(inst, 'insight') }, c.r, {
      adv: powerEdge(inst, c.ctx) === 'party',
    });
    c.fx.done.rob = true;
    if (inst.tags.includes('strongbox') && roll.success) return strongboxTaken(c, roll, 'threaten');
    if (roll.success) {
      const g = Math.max(5, (6 + c.r.int(0, 8)) * inst.level);
      c.fx.gold = g;
      c.fx.memory.robbed = true;
      c.fx.deeds.push({ kind: 'theft', weight: 3, tags: ['robbery', inst.innocent ? 'innocent' : 'armed'] });
      return { roll, outcome: outcome('rout'), lines: [DEFAULT_LINES.robOk, `+${g} gp.`] };
    }
    return { roll, outcome: outcome('fight'), lines: [DEFAULT_LINES.robFail], robbery: true };
  },
  hush(c) {
    const g = 5 * c.inst.level;
    c.fx.gold = g;
    c.fx.deeds.push({ kind: 'bribe', weight: 2, tags: ['took-bribe', 'smugglers'] });
    return { outcome: outcome('pass'), lines: [DEFAULT_LINES.hush, `+${g} gp.`] };
  },
  attack(c) {
    const { inst } = c;
    if (inst.sitId === 'returning-captain') c.fx.deeds.push({ kind: 'betray', weight: 3 });
    return { outcome: outcome('fight', { surprise: false }), lines: [] };
  },
  ambush(c) {
    return { outcome: outcome('fight', { surprise: 'party' }), lines: ['You strike before they know you are there.'] };
  },
  hail(c) {
    c.fx.noticed = true;
    const lines = [c.inst.opener];
    return { outcome: outcome('menu'), lines };
  },
  sneak(c) {
    const { inst, ctx } = c;
    const roll = groupCheck(c.party, 'stealth', stealthDC(inst, ctx), c.r);
    if (roll.success) return { roll, outcome: outcome('pass', { quiet: true }), lines: [DEFAULT_LINES.sneakOk] };
    c.fx.noticed = true;
    const hostileNow = inst.attitude === 'hostile' && inst.mind !== 'reason';
    return { roll, outcome: outcome(hostileNow ? 'fight' : 'noticed'), lines: [DEFAULT_LINES.noticed, hostileNow ? '' : inst.opener].filter(Boolean) };
  },
  shadow(c) {
    const { inst, ctx } = c;
    const roll = groupCheck(c.party, 'stealth', stealthDC(inst, ctx) + 2, c.r);
    if (roll.success) {
      const lines = [DEFAULT_LINES.shadowOk];
      if (inst.why) lines.push(inst.why);
      if (inst.rumor) { lines.push(inst.rumor); c.fx.rumor = inst.rumor; }
      c.fx.done.shadow = true;
      // Shadowing a raiding party walks you to where it sleeps.
      const campFor = { cragmaw: null, 'many-arrows': 'many-arrows-camp', bandits: 'bandit-camp' }[inst.kin];
      if (campFor) c.fx.lead = { sit: campFor, maps: [inst.mapId], note: `You followed ${inst.name.toLowerCase()} back to their camp.` };
      // ...or all the way home: the band's lair goes on the world's map.
      const def = situation(inst.sitId);
      if (def && def.site) { c.fx.site = def.site; lines.push('You follow the trail far enough to know where it ends.'); }
      return { roll, outcome: outcome('menu'), lines, keepUnnoticed: true };
    }
    c.fx.noticed = true;
    return { roll, outcome: outcome('noticed'), lines: [DEFAULT_LINES.noticed, inst.opener] };
  },
  flee(c) {
    const { inst } = c;
    const dc = fleeDC(inst);
    const roll = groupCheck(c.party, bestEscapeSkill(c.party), dc, c.r);
    if (roll.success) {
      c.fx.deeds.push({ kind: 'flee', weight: 1 });
      if (inst.mind === 'reason' && inst.attitude === 'hostile') c.fx.memory.grudge = true;
      return { roll, outcome: outcome('retreat'), lines: [DEFAULT_LINES.fleeOk] };
    }
    return { roll, outcome: outcome('fight'), lines: [DEFAULT_LINES.fleeFail] };
  },
  leave(c) {
    const { inst } = c;
    // Backing away from a hungry or frightened animal is a real check (2024:
    // Wisdom (Animal Handling) to calm a creature); fail it and it comes for you.
    if (inst.mind === 'beast' && inst.attitude === 'hostile' && !inst.plea) {
      const owlbear = inst.kin === 'owlbear';
      const roll = check(c.party, 'animal-handling', owlbear ? 13 : 12, c.r, {});
      if (roll.success) {
        c.fx.deeds.push({ kind: 'spare', weight: owlbear ? 2 : 1, tags: owlbear ? ['beast', 'cubs', 'mercy'] : ['beast'] });
        return { roll, outcome: outcome('pass'), lines: [lineOf(inst, 'pass')] };
      }
      return { roll, outcome: outcome('fight'), lines: [owlbear ? 'She takes it as a threat, and charges.' : 'It takes the retreat for weakness, and comes on.'] };
    }
    if (inst.plea === 'rescue') { c.fx.memory.abandoned = true; return { outcome: outcome('pass', { quiet: true }), lines: ['You leave them to it. Behind you, the shouting stops.'] }; }
    if (inst.plea === 'tend' && !inst.dead && !inst.done.tend) {
      c.fx.dead = true;
      return { outcome: outcome('menu'), lines: [lineOf(inst, 'died')] };
    }
    if (inst.plea === 'tend') return { outcome: outcome('pass', { quiet: true }), lines: ['You leave her where she lies, and walk on.'] };
    return { outcome: outcome(inst.attitude === 'wary' ? 'retreat' : 'pass', { quiet: true }), lines: [inst.attitude === 'friendly' ? lineOf(inst, 'pass') : DEFAULT_LINES.leave] };
  },
  turn(c) {
    const { inst } = c;
    const t = turner(c.party);
    if (!t) return { outcome: outcome('menu'), lines: ['No one here can call on a god like that.'] };
    c.fx.cd = t.ch;
    // Each kind of undead saves once for its whole number: WIS save vs the cleric's DC.
    let turned = 0, total = 0;
    const rows = [];
    for (const m of inst.monsters) {
      const b = blockOf(m.id);
      const save = abmod(b && b.abilities && b.abilities.wis) + (arr(b && b.saveProf).includes('wis') ? num(b.prof, 2) : 0);
      const res = d20(save, {}, c.r);
      const ok = res.total >= t.dc;
      rows.push(`${b ? b.name : m.id} ×${m.count}: ${res.natural}${fmtMod(save)} = ${res.total} ${ok ? 'resists' : 'is turned'}`);
      total += m.count;
      if (!ok) turned += m.count;
    }
    const success = turned * 2 > total;
    const roll = {
      who: t.ch.name, skill: 'Turn Undead', kind: 'save', natural: 0, rolls: [], mod: 0, total: turned, dc: total,
      success, text: `${t.ch.name} presents a holy symbol (DC ${t.dc}). ${rows.join('; ')}`,
    };
    if (success) {
      c.fx.deeds.push({ kind: 'pray', weight: 2, tags: ['turn-undead'] });
      return { roll, outcome: outcome('rout'), lines: [DEFAULT_LINES.turnOk] };
    }
    return { roll, outcome: outcome('fight'), lines: [DEFAULT_LINES.turnFail] };
  },
  tend(c) {
    const { inst } = c;
    const kit = hasItem(c.party, 'healers-kit');
    let roll = null;
    let ok = kit;
    if (!kit) { roll = check(c.party, 'medicine', 10, c.r, {}); ok = roll.success; }
    c.fx.done.tend = true;
    if (ok) return { roll, ...courierSaved(c, false) };
    c.fx.dead = true;
    return { roll, outcome: outcome('menu'), lines: [DEFAULT_LINES.tendFail, lineOf(inst, 'died')] };
  },
  potion(c) {
    if (!hasItem(c.party, 'potion-healing')) return { outcome: outcome('menu'), lines: ['You have no potion.'] };
    c.fx.take.push(['potion-healing', 1]);
    c.fx.done.tend = true;
    c.fx.done.potion = true;
    return courierSaved(c, true);
  },
  read(c) {
    const { inst } = c;
    const roll = check(c.party, 'investigation', 13, c.r, {});
    c.fx.done.read = true;
    if (roll.success) {
      c.fx.lead = inst.lead;
      c.fx.rumor = 'The courier\'s letter: a Zhentarim strongbox wagon runs the roads with bribes for three cities. The Harpers wanted it stopped.';
      return { roll, outcome: outcome('menu'), lines: ['You lift the seal with a warm knife.', c.fx.rumor] };
    }
    return { roll, outcome: outcome('menu'), lines: ['The seal cracks and the ink smears. Whatever it said is gone.'] };
  },
  carry(c) {
    c.fx.done.carry = true;
    c.fx.quest = courierQuest(c.st, c.inst);
    return { outcome: outcome('pass', { quiet: true }), lines: [`You take the letter. ${c.inst.contact.name} will want to know how she died.`] };
  },
  help(c) {
    return { outcome: outcome('fight', { allies: c.inst.allies || null, rescue: true }), lines: [] };
  },
  drive(c) {
    const { inst } = c;
    const beast = inst.mind === 'beast';
    const roll = contest(c.party, 'intimidation', {
      name: cap(inst.leader.short), label: beast ? 'Wisdom' : 'Insight', mod: beast ? leaderMod(inst, 'wisdom') : leaderMod(inst, 'insight'),
    }, c.r, { adv: powerEdge(inst, c.ctx) === 'party' });
    c.fx.done.drive = true;
    if (roll.success) {
      c.fx.deeds.push({ kind: 'rescue', weight: 2 }, { kind: 'threaten', weight: 1 });
      return { roll, ...rescued(c, [lineOf(inst, 'pass')], 0.75) };
    }
    return { roll, outcome: outcome('fight', { allies: inst.allies || null, rescue: true }), lines: ['They do not scare. Steel it is.'] };
  },
  escort(c) {
    c.fx.done.escort = true;
    c.fx.quest = homeQuest(c.st, c.inst);
    return { outcome: outcome('rout', { quiet: true }), lines: [lineOf(c.inst, 'home')] };
  },
  hunt(c) {
    const roll = check(c.party, 'survival', 13, c.r, {});
    c.fx.done.hunt = true;
    c.fx.minutes = 60;
    if (roll.success) {
      c.fx.items.push({ id: 'rations', qty: 2, name: 'Rations' });
      c.fx.gold = 2 * c.inst.level;
      c.fx.deeds.push({ kind: 'help', weight: 1, tags: ['hunt'] });
      return { roll, outcome: outcome('menu'), lines: [DEFAULT_LINES.hunted, `+2 rations, +${c.fx.gold} gp for your share of the pelt.`, c.inst.rumor].filter(Boolean), rumor: c.inst.rumor };
    }
    return { roll, outcome: outcome('menu'), lines: [DEFAULT_LINES.huntFail] };
  },
  rest(c) {
    // An hour at somebody else's fire, with somebody else keeping watch: a real
    // 2024 Short Rest (Hit Dice may be spent), and the talk that goes with it.
    const { inst } = c;
    c.fx.done.rest = true;
    c.fx.minutes = 60;
    c.fx.shortRest = true;
    c.fx.deeds.push({ kind: 'parley', weight: 1, tags: ['rest'] });
    const lines = ['You sit with them an hour. Somebody else keeps the watch, and the tea is strong. (Short Rest)'];
    if (inst.rumor) { lines.push(inst.rumor); c.fx.rumor = inst.rumor; c.fx.done.ask = true; }
    return { outcome: outcome('menu'), lines };
  },
  pray(c) {
    c.fx.done.pray = true;
    c.fx.minutes = 30;
    c.fx.tempHp = 2 + c.inst.level;
    c.fx.deeds.push({ kind: 'pray', target: 'lathander', weight: 1 });
    return { outcome: outcome('menu'), lines: [DEFAULT_LINES.prayed, lineOf(c.inst, 'blessed'), `Each of you gains ${c.fx.tempHp} temporary hit points.`] };
  },
  donate(c) {
    const cost = Math.max(5, 3 * c.inst.level);
    if (goldOf(c.party) < cost) return { outcome: outcome('menu'), lines: ['You cannot spare it.'] };
    c.fx.spend = cost;
    c.fx.done.donate = true;
    c.fx.deeds.push({ kind: 'charity', weight: cost >= 30 ? 3 : 2 });
    const lines = [DEFAULT_LINES.donated];
    if (c.inst.rumor && !c.inst.done.ask) { lines.push(c.inst.rumor); c.fx.rumor = c.inst.rumor; c.fx.done.ask = true; }
    if (c.inst.lead) c.fx.lead = c.inst.lead;
    return { outcome: outcome('menu'), lines };
  },
  duel(c) {
    return { outcome: outcome('fight', { champion: true }), lines: [`${cap(c.inst.leader.short)} grins and steps forward alone.`] };
  },
  bargain(c) {
    const r = makeRNG(`${c.inst.seed}:bargain`);
    const offer = HAG_BARGAINS[r.int(0, HAG_BARGAINS.length - 1)];
    c.fx.offer = offer;
    c.fx.done.bargain = true;
    return { outcome: outcome('menu'), lines: [offer.offer] };
  },
  recognise(c) {
    const roll = check(c.party, 'arcana', 13, c.r, {});
    c.fx.done.recognise = true;
    if (roll.success) { c.fx.revealed = true; return { roll, outcome: outcome('menu'), lines: [lineOf(c.inst, 'revealed')] }; }
    return { roll, outcome: outcome('menu'), lines: [DEFAULT_LINES.recogniseFail] };
  },
  accept(c) {
    const { inst } = c;
    if (inst.offer) {
      const o = inst.offer;
      const lines = [];
      if (o.boon.item) { c.fx.items.push({ id: o.boon.item, qty: o.boon.qty || 1, name: o.boon.item.replace(/-/g, ' ') }); lines.push('She presses something cold and damp into your hand.'); }
      if (o.boon.gold) { const g = rollExpr(o.boon.gold, c.r).total; c.fx.gold = g; lines.push(`+${g} gp.`); }
      if (o.boon.rumor) { c.fx.rumor = o.boon.rumor; lines.push(o.boon.rumor); }
      if (o.price.goldPct) { c.fx.spend = Math.floor(goldOf(c.party) * o.price.goldPct); lines.push(`Your purse is ${c.fx.spend} gp lighter, and you do not remember spending it.`); }
      if (o.price.flag) { c.fx.flags[`enc:${o.price.flag}`] = c.st.day | 0; lines.push(`She takes ${o.priceText}, and tucks it away with a smile you will see again.`); }
      c.fx.deeds.push({ kind: 'bargain', weight: 3, tags: ['hag', 'fey'] });
      return { outcome: outcome('pass'), lines };
    }
    // The returning captain's job.
    c.fx.lead = { sit: 'zhent-strongbox', maps: [inst.mapId], note: `${inst.leader.full}'s job: the Zhentarim strongbox wagon.`, job: 'captain' };
    c.fx.allies = [{ id: 'bandit', count: 2, from: inst.leader.full }];
    c.fx.deeds.push({ kind: 'parley', weight: 2, tags: ['job', 'crime'] });
    return { outcome: outcome('rout'), lines: [`"Good. We'll be close when the wagon comes." ${cap(inst.leader.short)}'s people fall in behind you.`] };
  },
  refuse(c) {
    const { inst } = c;
    if (inst.offer) {
      c.fx.offer = null;
      return { outcome: outcome('pass'), lines: ['"Suit yourself, dearie. There will be other travellers." She goes back to her reeds.'] };
    }
    return { outcome: outcome('pass'), lines: [lineOf(inst, 'pass')] };
  },
};

function bestEscapeSkill(party) {
  const a = living(party).reduce((m, c) => Math.max(m, modFor(c, 'athletics')), -9);
  const b = living(party).reduce((m, c) => Math.max(m, modFor(c, 'acrobatics')), -9);
  return a >= b ? 'athletics' : 'acrobatics';
}

/** What they were carrying, rolled against each entry's chance. */
function spoilsOf(inst, r) {
  const out = [];
  for (const [id, qty, chance] of arr(inst.spoils)) {
    if (r.chance(chance == null ? 1 : chance)) out.push({ id, qty: qty || 1, name: String(id).replace(/-/g, ' ') });
  }
  return out;
}

/** A rescue that ended without a fight (or after one). */
function rescued(c, lines, share = 1) {
  const { inst } = c;
  const rw = inst.reward || {};
  const out = lines.slice();
  if (rw.gold) {
    const g = Math.max(1, Math.round(rw.gold * inst.level * share));
    c.fx.gold = g;
    out.push(lineOf(inst, 'thanks', `They thank you, and press ${g} gp on you.`), `+${g} gp.`);
  }
  for (const [id, q] of arr(rw.items)) c.fx.items.push({ id, qty: q, name: String(id).replace(/-/g, ' ') });
  if (rw.rescued) c.fx.memory.rescued = true;
  if (inst.rumor) { out.push(inst.rumor); c.fx.rumor = inst.rumor; }
  return { outcome: outcome('pass'), lines: out };
}

/** The Harper courier lives, and gives you her errand. */
function courierSaved(c, potion) {
  const { inst } = c;
  c.fx.deeds.push({ kind: 'rescue', weight: 3 });
  c.fx.quest = courierQuest(c.st, inst);
  const lines = [DEFAULT_LINES.tended, lineOf(inst, 'saved')];
  if (potion) lines.push('With the potion in her she is on her feet at once, and tells you more: the letter names the wagon, the road and the day.');
  if (potion && inst.lead) c.fx.lead = inst.lead;
  // On her feet again, she goes: 'rout' walks her off the map toward help.
  return { outcome: outcome('rout', { quiet: true }), lines };
}

/** The strongbox changes hands — by a lie or by a threat — and the Network notices. */
function strongboxTaken(c, roll, how) {
  const { inst } = c;
  const g = Math.max(10, (inst.reward ? inst.reward.gold : 20) * inst.level);
  c.fx.gold = g;
  c.fx.items.push(...spoilsOf(inst, c.r));
  c.fx.deeds.push({ kind: 'theft', weight: 4, tags: ['strongbox', how] });
  c.fx.memory.robbed = true;
  const lines = [lineOf(inst, 'robbed'), `+${g} gp.`];
  if (inst.job === 'captain') {
    const half = Math.floor(g / 2);
    c.fx.gold = g - half;
    lines.push(`The captain's people take their half: ${half} gp. A deal is a deal.`);
  }
  c.fx.quest = ledgerQuest(c.st, inst);
  return { roll, outcome: outcome('rout'), lines };
}

// --- quests the road hands you ------------------------------------------------

function courierQuest(st, inst) {
  const who = inst.contact;
  return {
    id: `enc-letter-${hashStr(inst.seed).toString(36)}`,
    title: `A Letter for ${who.name}`,
    giver: null, generated: true, faction: 'harpers',
    desc: `A Harper courier was shot on ${inst.tokens.place}. Her letter is for ${who.name}, in ${who.where}.`,
    summary: `Carry the Harper letter to ${who.name}.`,
    steps: [{ kind: 'talk', target: who.npc, count: 1, text: `Carry the letter to ${who.name} in ${who.where}`, map: who.mapId }],
    rewards: { gold: 12 * inst.level, xp: 40 * inst.level, rep: [{ id: 'harpers', amount: 2 }] },
    encounter: { kind: 'deliver', faction: 'harpers' },
  };
}

function homeQuest(st, inst) {
  const p = inst.places;
  return {
    id: `enc-home-${hashStr(inst.seed).toString(36)}`,
    title: `Home to ${p.town}`,
    giver: null, generated: true,
    desc: `${inst.leader.full.replace(/^a child/, 'A child')} was lost on ${inst.tokens.place}. You promised to take her home.`,
    summary: `Walk the child home to ${p.town}.`,
    steps: [{ kind: 'reach', target: p.mapId, count: 1, text: `Bring her home to ${p.town}`, map: p.mapId }],
    rewards: { gold: 6 * inst.level, xp: 25 * inst.level },
    encounter: { kind: 'home' },
  };
}

function ledgerQuest(st, inst) {
  const who = inst.contact;
  return {
    id: `enc-ledger-${hashStr(inst.seed).toString(36)}`,
    title: 'The Zhentarim Ledger',
    giver: null, generated: true, faction: 'harpers',
    desc: `The strongbox held a ledger of bribes paid in three cities. ${who.name} of the Harpers would give a great deal to read it.`,
    summary: `Take the Zhentarim ledger to ${who.name}.`,
    steps: [{ kind: 'talk', target: who.npc, count: 1, text: `Give the ledger to ${who.name} in ${who.where}`, map: who.mapId }],
    rewards: { gold: 15 * inst.level, xp: 50 * inst.level, rep: [{ id: 'harpers', amount: 3 }] },
    encounter: { kind: 'ledger', faction: 'harpers' },
  };
}

/** A caravan's or a peddler's pack, as an inline shop for ui/shop.js. */
function shopFor(inst, st) {
  const t = inst.trade || {};
  const discount = inst.flags.rescued ? 0.9 : 1;
  return {
    id: `enc-${inst.sitId}`, name: inst.name, keeper: inst.leader.full, kind: 'general', music: 'shop',
    markup: Math.round(1.1 * discount * 100) / 100, buyback: 0.45,
    greeting: inst.flags.rescued ? `"For you? The friends' price." ${cap(inst.leader.short)} winks.` : fill('"Look your fill. Coin first, questions after."', inst.tokens),
    stock: arr(t.stock).slice(),
    fill: { kinds: arr(t.kinds), maxCost: 25 + 20 * inst.level, count: t.count || 8 },
  };
}

/**
 * Decide what an option does. Pure: rolls, but changes nothing (applyResult does).
 * `reroll` draws a fresh stream for Heroic Inspiration.
 */
export function resolveOption(st, inst, optId, ctx, { reroll = false } = {}) {
  const E = encounterState(st);
  const fn = HANDLERS[optId];
  const r = makeRNG(`${inst.seed}:${optId}:${E.seq}${reroll ? ':re' : ''}`);
  const fx = { deeds: [], items: [], take: [], memory: {}, done: {}, flags: {} };
  if (!fn) return { option: optId, outcome: outcome('menu'), lines: [], fx };
  const c = { st, inst, ctx, party: ctx.party, r, fx };
  const res = fn(c) || {};
  return {
    option: optId, roll: res.roll || null, success: res.roll ? !!res.roll.success : true,
    outcome: res.outcome || outcome('menu'), lines: arr(res.lines).filter(Boolean), fx,
    robbery: !!res.robbery, keepUnnoticed: !!res.keepUnnoticed,
  };
}

/** Heroic Inspiration: may this failed roll be tried again? */
export function canReroll(st, result) {
  const E = encounterState(st);
  return !!(result && result.roll && !result.roll.success && E.inspiration > 0 && result.roll.kind !== 'save');
}

/** Spend Heroic Inspiration on a reroll and return the new result. */
export function rerollOption(st, inst, result, ctx) {
  const E = encounterState(st);
  if (!canReroll(st, result)) return result;
  E.inspiration = 0;
  const again = resolveOption(st, inst, result.option, ctx, { reroll: true });
  again.rerolled = true;
  return again;
}

/**
 * Make a result so: purse, pack, deeds, memory, rumours, leads, quests. Returns
 * the lines to show after it (a quest title, a lead), in addition to result.lines.
 */
export function applyResult(st, inst, result, ctx) {
  const E = encounterState(st);
  const fx = result.fx || {};
  const party = ctx.party;
  const out = [];
  E.seq++;

  if (fx.spend) spend(party, fx.spend);
  if (fx.gold) earn(party, fx.gold);
  for (const it of arr(fx.items)) give(party, it.id, it.qty || 1);
  for (const [id, q] of arr(fx.take)) take(party, id, q);
  if (fx.fine) { try { payFine(st, { region: 'baldurs-gate' }); } catch (e) { /* ledger optional */ } }
  if (fx.cd && fx.cd.resources && fx.cd.resources['channel-divinity']) fx.cd.resources['channel-divinity'].used += 1;
  if (fx.tempHp) for (const m of living(party)) m.tempHp = Math.max(num(m.tempHp, 0), fx.tempHp);
  if (fx.shortRest && party && typeof party.shortRest === 'function') {
    // Hit Dice spent the way a sensible player would: enough to close the wound, no more.
    const dice = {};
    for (const m of living(party)) {
      const missing = num(m.maxHp) - num(m.hp);
      const avail = hitDiceTotal(m).available;
      if (missing > 0 && avail > 0) dice[m.uid] = Math.min(avail, Math.ceil(missing / Math.max(1, 5 + abilityMod(m, 'con'))));
    }
    try { party.shortRest(dice); } catch (e) { /* the rest is a kindness, never a crash */ }
  }
  if (fx.minutes && st) advanceClock(st, fx.minutes);
  if (fx.demand != null) { inst.demand = fx.demand; inst.tokens.demand = String(fx.demand); }
  if (fx.attitude) inst.attitude = fx.attitude;
  if (fx.noticed) inst.noticed = true;
  if (fx.revealed) inst.revealed = true;
  if (fx.dead) inst.dead = true;
  if ('offer' in fx) inst.offer = fx.offer;
  Object.assign(inst.done, fx.done || {});
  for (const [k, v] of Object.entries(fx.flags || {})) { if (st.flags) st.flags[k] = v; }

  for (const d of arr(fx.deeds)) {
    noteDeed(st, {
      kind: d.kind, target: d.target || inst.kin, faction: inst.faction || null,
      mapId: ctx.mapId, weight: d.weight || 1, tags: [inst.sitId, ...(inst.innocent ? ['innocent'] : []), ...arr(d.tags)],
    });
  }
  remember(st, inst, fx.memory || {}, ctx);

  if (fx.rumor) addRumor(st, fx.rumor, inst.name);
  if (fx.site && typeof WorldDirector.discoverSite === 'function') {
    try { WorldDirector.discoverSite(st, fx.site, 'tracks'); } catch (e) { /* the world map is the director's */ }
  }
  if (fx.lead) {
    const lead = addLead(st, fx.lead, inst, ctx);
    if (lead) out.push(`Lead: ${lead.note}`);
  }
  if (fx.allies) for (const a of fx.allies) E.allies.push({ ...a, until: absMinute(st) + 1440 });
  if (fx.quest) {
    const q = startQuest(st, fx.quest);
    if (q) {
      E.quests[fx.quest.id] = { ...fx.quest.encounter, rewards: fx.quest.rewards, title: fx.quest.title };
      out.push(`Quest: ${fx.quest.title}`);
    }
  }

  const k = result.outcome && result.outcome.kind;
  if (k === 'pass') settle(st, inst, 'passed');
  if (k === 'rout') settle(st, inst, 'routed');
  const sdef = situation(inst.sitId);
  if (['pass', 'rout', 'retreat', 'fight'].includes(k) && (sdef ? isDanger(sdef) : inst.attitude === 'hostile')) calm(st, ctx, { soft: k !== 'fight' });
  // Squared with a wary band (paid, talked round): their people know your face for a few days.
  if (k === 'pass' && inst.baseAttitude === 'wary' && inst.mind === 'reason') remember(st, inst, { cleared: true }, ctx);
  logEvent(st, inst, result.option, result.lines[0] || '', { outcome: k, roll: result.roll ? result.roll.text : null });
  return out;
}

/** Write what they will remember. */
function remember(st, inst, m, ctx) {
  const E = encounterState(st);
  const mem = E.memory;
  const day = st.day | 0;
  const bump = (table) => { const rec = table[inst.kin] || { n: 0 }; rec.n = (rec.n | 0) + 1; rec.day = day; rec.mapId = ctx.mapId; table[inst.kin] = rec; };
  if (m.spared) bump(mem.spared);
  if (m.grudge) bump(mem.grudges);
  if (m.rescued) bump(mem.rescued);
  if (m.yielded) bump(mem.yielded);
  if (m.robbed) bump(mem.robbed);
  if (m.respect) bump(mem.respect);
  if (m.cleared) bump(mem.cleared);
  if (m.forgiven && mem.killed.owlbear) mem.killed.owlbear.n = 0;
  // Only a highwayman you let walk comes back with a proposition; a sergeant you
  // faced down or a Zhent you frightened has other things to do with the memory.
  if (m.leader && inst.kin === 'bandits' && inst.leader && inst.leader.name && inst.sitId !== 'returning-captain') {
    if (!mem.leaders.some((L) => L.name === inst.leader.name)) {
      mem.leaders.push({ name: inst.leader.name, kin: inst.kin, sitId: inst.sitId, mapId: ctx.mapId, mapName: ctx.name, day, state: 'spared' });
      if (mem.leaders.length > LEADERS_MAX) mem.leaders.splice(0, mem.leaders.length - LEADERS_MAX);
    }
  }
}

export function addRumor(st, text, from) {
  const E = encounterState(st);
  if (!text || E.rumors.some((x) => x.text === text)) return;
  E.rumors.push({ text, from: from || null, day: st.day | 0 });
  if (E.rumors.length > RUMOR_MAX) E.rumors.splice(0, E.rumors.length - RUMOR_MAX);
}

/** Record a lead: somewhere the director will put a particular situation. */
export function addLead(st, lead, inst, ctx) {
  const E = encounterState(st);
  if (!lead || !situation(lead.sit)) return null;
  const maps = arr(lead.maps).length ? arr(lead.maps) : arr(situation(lead.sit).maps).slice(0, 2);
  // One lead to a place at a time: the owlbear the hunters warned of is the same owlbear.
  if (E.leads.some((L) => L.sit === lead.sit && (L.state === 'open' || (L.state === 'placed' && (st.day | 0) - num(L.day, 0) < LEAD_DAYS)))) return null;
  const rec = { sit: lead.sit, maps, note: lead.note || situation(lead.sit).name, day: st.day | 0, from: inst ? inst.sitId : null, state: 'open', job: lead.job || null };
  E.leads.push(rec);
  if (E.leads.length > LEAD_MAX) E.leads.splice(0, E.leads.length - LEAD_MAX);
  // Force a fresh plan on a target map the party is not standing on, so the lead is there when they arrive.
  for (const mid of maps) if (mid !== (ctx && ctx.mapId) && E.plans[mid]) E.plans[mid].made = -1e9;
  return rec;
}

/** Allies still riding with the party, for the next fight. Expired ones drop off. */
export function alliesFor(st) {
  const E = encounterState(st);
  const now = absMinute(st);
  E.allies = E.allies.filter((a) => num(a.until, 0) > now);
  return E.allies.slice();
}

/** A fight used them: they have been paid in blood, and ride on. */
export function spendAllies(st) {
  const E = encounterState(st);
  E.allies = [];
}

// ---------------------------------------------------------------------------
// 10. AFTER THE FIGHT
// ---------------------------------------------------------------------------

/**
 * The battle a standoff became is over. `res` is Encounter.result(). Deeds for
 * what the party did, the camp broken, the captive freed, the spoils handed out.
 * Returns lines to show the player.
 */
export function afterBattle(st, inst, res, ctx, opts = {}) {
  const E = encounterState(st);
  const lines = [];
  if (!inst) return lines;
  const victory = !!(res && res.victory);
  const fled = !!(res && (res.fled || res.state === 'fled'));
  const mem = E.memory;
  const r = makeRNG(`${inst.seed}:after`);
  if (victory) {
    settle(st, inst, 'defeated');
    const n = arr(res.defeated).length;
    noteDeed(st, {
      kind: 'kill', target: inst.kin, faction: inst.faction || null, mapId: ctx.mapId,
      weight: clamp(Math.ceil(n / 2), 1, 5), tags: [inst.sitId, ...(inst.innocent ? ['innocent'] : []), ...(inst.tags || [])],
    });
    const rec = mem.killed[inst.kin] || { n: 0 }; rec.n = (rec.n | 0) + n; rec.day = st.day | 0; mem.killed[inst.kin] = rec;
    if (arr(res.routed).length && inst.mind === 'reason') {
      const g = mem.grudges[inst.kin] || { n: 0 }; g.n += 1; g.day = st.day | 0; mem.grudges[inst.kin] = g;
      lines.push('Some of them got away. They will remember this.');
    }
    const drop = spoilsOf(inst, r);
    for (const d of drop) give(ctx.party, d.id, d.qty);
    if (drop.length) lines.push(`Among their things: ${drop.map((d) => d.name).join(', ')}.`);
    if (opts.rescue && inst.plea === 'rescue') {
      noteDeed(st, { kind: 'rescue', target: inst.kin, faction: inst.faction || null, mapId: ctx.mapId, weight: 3, tags: [inst.sitId] });
      const fx = { deeds: [], items: [], take: [], memory: {}, done: {}, flags: {} };
      const rr = rescued({ st, inst, ctx, party: ctx.party, r, fx }, []);
      if (fx.gold) earn(ctx.party, fx.gold);
      for (const it of fx.items) give(ctx.party, it.id, it.qty);
      remember(st, inst, fx.memory, ctx);
      if (fx.rumor) addRumor(st, fx.rumor, inst.name);
      lines.push(...rr.lines);
    }
    if (opts.champion) {
      const rec2 = mem.respect[inst.kin] || { n: 0 }; rec2.n += 1; rec2.day = st.day | 0; mem.respect[inst.kin] = rec2;
      lines.push(DEFAULT_LINES.duelWin);
      settle(st, inst, 'passed');
    }
    if (inst.tags.includes('strongbox')) {
      const g = Math.max(10, (inst.reward ? inst.reward.gold : 20) * inst.level);
      earn(ctx.party, g);
      lines.push(lineOf(inst, 'robbed'), `+${g} gp.`);
      const q = startQuest(st, ledgerQuest(st, inst));
      if (q) { E.quests[q.id] = { kind: 'ledger', faction: 'harpers', rewards: ledgerQuest(st, inst).rewards, title: q.title }; lines.push(`Quest: ${q.title}`); }
    }
    if (opts.robbery) noteDeed(st, { kind: 'theft', target: inst.kin, faction: inst.faction || null, mapId: ctx.mapId, weight: 4, tags: ['robbery', 'innocent'] });
  } else if (fled) {
    noteDeed(st, { kind: 'flee', target: inst.kin, faction: inst.faction || null, mapId: ctx.mapId, weight: 1, tags: [inst.sitId] });
    if (inst.mind === 'reason') { const g = mem.grudges[inst.kin] || { n: 0 }; g.n += 1; g.day = st.day | 0; mem.grudges[inst.kin] = g; }
  }
  calm(st, ctx);
  logEvent(st, inst, 'battle', victory ? 'won' : fled ? 'fled' : 'lost', { outcome: victory ? 'victory' : fled ? 'fled' : 'defeat' });
  return lines;
}

/**
 * Build the enemy list a situation fights with: scaled Characters for catalogue
 * creatures and the encounter's own stat blocks alike. `champion` fields only
 * the leader.
 */
export function foesFor(inst, { champion = false } = {}) {
  let list = inst.monsters.map((m) => ({ id: m.id, count: m.count }));
  if (champion) {
    const id = inst.leader.monsterId || (list[0] && list[0].id);
    list = id ? [{ id, count: 1 }] : list.slice(0, 1);
  }
  const built = buildEncounterMonsters({ monsters: list }, { level: inst.level, seed: `${inst.seed}:fight`, lookup, noElites: true });
  // The leader keeps the name the standoff gave them over the health bar.
  const lead = built.find((m) => m && m.monsterId === inst.leader.monsterId);
  if (lead && inst.leader.name) lead.name = inst.leader.name;
  return built;
}

/** Allies as spawn specs: a caravan's guards, sellswords you hired. */
export function alliesSpec(inst, st) {
  const out = [];
  for (const [id, n] of arr(inst && inst.allies)) out.push({ id, count: n });
  for (const a of alliesFor(st)) out.push({ id: a.id, count: a.count });
  return out;
}

// ---------------------------------------------------------------------------
// 11. OPENERS FOR FIGHTS THAT ARE NOT SITUATIONS
// ---------------------------------------------------------------------------

/**
 * One line that says who they are and why, for any fight at all: a dungeon's
 * tile encounter, a scripted battle trigger, a cheat. Group first, then faction,
 * then creature type.
 */
export function openerFor({ groupId = null, monsters = [] } = {}) {
  if (groupId && GROUP_OPENERS[groupId]) return GROUP_OPENERS[groupId];
  const first = arr(monsters).map((m) => blockOf(m && (m.id || m.monsterId))).find(Boolean);
  if (first && first.faction && FACTION_OPENERS[first.faction]) return FACTION_OPENERS[first.faction];
  if (groupId && MONSTER_GROUPS[groupId]) {
    const g = MONSTER_GROUPS[groupId];
    const lead = blockOf(arr(g.members)[0] && arr(g.members)[0][0]);
    if (lead && FACTION_OPENERS[lead.faction]) return FACTION_OPENERS[lead.faction];
  }
  if (first && TYPE_OPENERS[first.type]) return TYPE_OPENERS[first.type];
  return 'Something steps out of the dark, and it has been waiting for you.';
}

/** A short title for a non-situation fight's card. */
export function titleFor({ groupId = null, monsters = [] } = {}) {
  if (groupId && MONSTER_GROUPS[groupId] && MONSTER_GROUPS[groupId].name) return MONSTER_GROUPS[groupId].name;
  const first = arr(monsters).map((m) => blockOf(m && (m.id || m.monsterId))).find(Boolean);
  return first ? `${first.name}${arr(monsters).reduce((a, m) => a + (m.count | 0 || 1), 0) > 1 ? 's' : ''}` : 'Ambush';
}

// ---------------------------------------------------------------------------
// 12. THE JOURNEY LOG
// ---------------------------------------------------------------------------

function logEvent(st, inst, what, text, extra = {}) {
  const E = encounterState(st);
  E.log.push({
    day: st.day | 0, time: st.time | 0, mapId: extra.mapId || (inst && inst.mapId) || null,
    sit: inst ? inst.sitId : null, name: inst ? inst.name : null, what, text: String(text || '').slice(0, 240),
    outcome: extra.outcome || null, roll: extra.roll || null, beat: extra.beat || null,
  });
  if (E.log.length > LOG_MAX) E.log.splice(0, E.log.length - LOG_MAX);
}

/** Note that the party met a group (the standoff opened), for the journey log. */
export function noteMeeting(st, inst, mode) {
  logEvent(st, inst, 'meet', `${mode}: ${inst.opener}`);
  // Who you have actually MET this week, so the road does not keep sending the same faces.
  if (inst && inst.sitId && situation(inst.sitId) && mode !== 'settled') {
    const E = encounterState(st);
    const days = (E.met[inst.sitId] ||= []);
    days.push(st.day | 0);
    if (days.length > 6) days.splice(0, days.length - 6);
  }
}

/** The newest `n` journey entries. */
export function journeyLog(st, n = 30) {
  const E = encounterState(st);
  return E.log.slice(-n);
}

// ---------------------------------------------------------------------------
// 13. QUESTS THE ROAD GAVE — completed here, because nobody else knows them
// ---------------------------------------------------------------------------
//
// state.js advances a quest's steps and emits QUEST_STEP but leaves completion to
// whoever owns the quest. A letter carried to Sister Garaele or a child walked
// home to Phandalin is ours, so we finish it the moment its last step is done.

let questHooked = false;
export function hookQuests(getState, getParty, hooks = {}) {
  if (questHooked) return;
  questHooked = true;
  bus.on(EV.QUEST_STEP, ({ quest }) => {
    const st = getState();
    if (!st || !quest || !String(quest.id).startsWith('enc-')) return;
    if (!arr(quest.steps).every((s) => s && s.done)) return;
    const E = encounterState(st);
    const rec = E.quests[quest.id] || {};
    const q = completeQuest(st, quest.id);
    if (!q) return;
    const party = getParty();
    const rw = rec.rewards || (quest.def && quest.def.rewards) || {};
    if (rw.gold) earn(party, rw.gold);
    if (rw.xp) for (const m of arr(party && party.members)) { try { grantXp(m, rw.xp); } catch (e) { /* ignore */ } }
    noteDeed(st, { kind: rec.kind === 'home' ? 'rescue' : 'quest', target: quest.id, faction: rec.faction || null, weight: 3, tags: ['encounter', rec.kind || 'quest'] });
    try { toast(`Completed: ${rec.title || quest.title || 'a task from the road'}  +${rw.gold || 0} gp`, { kind: 'quest' }); } catch (e) { /* ignore */ }
    if (hooks.onComplete) hooks.onComplete(quest, rw);
    delete E.quests[quest.id];
  });
}
