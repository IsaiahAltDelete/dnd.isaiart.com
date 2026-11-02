// rules/worlddirector.js — the world director: the Sword Coast's calendar, its troubles and festivals, who holds which town, what people say about all of it, and the endless work that follows.
//
// The world moves by the in-game day whether or not the party is watching. Each
// day the director advances every running event a stage (goblin sign on the
// Trail becomes night raids becomes a burned barn), keeps the Calendar of
// Harptos (Greengrass, Midsummer, Shieldmeet, Highharvestide, the Feast of the
// Moon), starts new trouble at a pace set by the party's level, renews lairs the
// party emptied, and lets the party's own deeds travel outward as gossip.
//
// Everything a player can DO about it arrives as a quest built by data/quests.js
// generateQuest(level, rng, opts): offered by the person the trouble falls on,
// posted on the town's notice board, pointed at by a rumour. A quest that
// resolves an event decides how that event ends; an event left alone ends the
// other way. Outcomes change prices, who holds a region, which creatures are on
// the roads, and which new events follow.
//
// This module is plain logic — no scenes, no drawing, no DOM — so a headless
// run (tools/director-sim.mjs) can simulate months of the world in Node.
// world/sites.js puts the director's wants on the map; ui/worldtalk.js and
// ui/noticeboard.js are how the party hears and answers them.
//
// State lives under st.world (created lazily; a save from before this module
// loads and simply starts the director on its current day):
//   director { v, day, seq, level, levelOverride }   pacing and bookkeeping
//   events[]    running events      eventLog[]  what happened, when
//   ended[]     recently finished   history{}   tpl -> last day it ended (cooldowns)
//   seen{}      tpl -> times started (a trouble repeats less the more it has)
//   pending[]   events caused by others' outcomes, waiting for their day
//   effects[]   lasting consequences (prices) after an event ends
//   control{}   region -> { sway:{power:n} }       controlLog[]
//   gossip[]    the party's deeds as the Coast repeats them
//   heard{}     rumour key -> day heard            postings{}  giver -> offers
//   quests{}    director quest bookkeeping         sites{}     lairs and landmarks
//   visitors[]  people the world put somewhere     chronicle[] the record
//
// Contracts other modules code against (keep these stable):
//   activeEventsFor(st, mapId)        -> [{ id, tpl, name, kind, tags, stage, stageName, text,
//                                          since, until, severity, dark, festival,
//                                          encounters:{ groups:[[groupId, weight]], rate, biomes } | null,
//                                          reason }]
//   eventPriceModifiers(st, mapId)    -> { mult:{ category: factor }, notes:[{ text, cats, src }], town }
//   eventPriceFactor(st, mapId, cats) -> one multiplier for an item carrying those categories
//   regionControl(st, regionId)       -> { id, name, holder, holderName, sway }
//   festivalOn(st | day)              -> { id, name, stage } | null
//   rumorsFor(st, npc)                -> [{ key, kind, truth, text, points:{ site?, event?, quest? } }]
//   chronicle(st, { limit, kind })    -> [{ day, date, kind:'world'|'party', text, ... }] newest first

import { bus, EV } from '../core/events.js';
import { makeRNG, hashStr } from '../core/rng.js';
import { dateText } from '../constants.js';
import { startQuest, completeQuest, failQuest, progressQuests, addReputation, setFlag, hasFlag, currentPhase } from '../state.js';
import { noteDeed, onDeed } from './deeds.js';
import {
  EVENTS, EVENT_IDS, FESTIVALS, REGIONS, POWER_NAMES, TOWN_ROLES, TOWN_OF_MAP, MARKETS, PLACES,
  DELIVERY_ENDS, SITES, NOBLE_HOUSES, FOLK, BEAST_EPITHETS, DREAD_EPITHETS, calendarOf, isShieldmeetYear, regionOfMap,
} from '../data/worldevents.js';
import {
  KNOWLEDGE, OPENERS, INSIGHT, EVENT_RUMORS, FESTIVAL_RUMORS, DEED_RUMORS, SITE_RUMORS, RENEWAL_RUMORS,
  FACTION_RUMORS, TRADE_RUMORS, CATEGORY_WORDS,
} from '../data/rumors.js';
import { RUMORS as TAVERN_RUMORS } from '../data/tables.js';
import { generateQuest, FACTION_CONTRACTS, JOB_TEXT, QUESTS } from '../data/quests.js';
import { NPCS } from '../data/npcs.js';
import { MONSTERS, MONSTER_GROUPS } from '../data/monsters.js';
import { resolveItem } from '../data/items.js';
import { mapMeta } from '../world/maps.js';
import { Party } from '../world/party.js';
import { grantXp } from './progression.js';
import { encounterBudget } from './scaling.js';

const MAX_CATCHUP = 60;        // a save left for a year does not replay a year
const LOG_MAX = 240, CHRONICLE_MAX = 320, GOSSIP_MAX = 90, ENDED_MAX = 24, JOURNAL_RUMORS = 60;

// ===========================================================================
// 1. STATE AND SMALL HELPERS
// ===========================================================================

/** The director's slice of the save, created on first touch. */
export function worldState(st) {
  st.world ??= {};
  const w = st.world;
  w.director ??= { v: 1, day: null, seq: 0, level: 1 };
  w.events ??= []; w.eventLog ??= []; w.ended ??= []; w.history ??= {}; w.pending ??= [];
  w.effects ??= []; w.control ??= {}; w.controlLog ??= [];
  w.gossip ??= []; w.heard ??= {}; w.postings ??= {}; w.quests ??= {};
  w.sites ??= {}; w.visitors ??= []; w.chronicle ??= []; w.seen ??= {};
  return w;
}
const W = worldState;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const titleCase = (s) => String(s || '').replace(/-/g, ' ').replace(/\b[a-z]/g, (c) => c.toUpperCase());
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const arr = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);

function seedOf(st) { return (st && (st.worldSeed || hashStr(String(st.seed || 'sword-coast')))) || 1; }
/** A stream for one purpose on one day. Never the global rng: the director must not shift combat rolls. */
function rngFor(st, ...parts) { return makeRNG(`${seedOf(st)}:dir:${parts.join(':')}`); }
function unit(st, ...parts) { return hashStr(`${seedOf(st)}:${parts.join(':')}`) / 4294967296; }

/** Fill {tokens}; unknown tokens are dropped rather than shown raw. */
function fill(s, vars) {
  return String(s == null ? '' : s).replace(/\{(\w+)\}/g, (_, k) => (vars && vars[k] != null ? String(vars[k]) : ''))
    .replace(/\s{2,}/g, ' ').trim();
}
/** Fill only the tokens we know; the rest wait for data/quests.js, which knows the foes and the place. */
function fillKnown(s, vars) {
  return String(s == null ? '' : s).replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null ? String(vars[k]) : m));
}

/** Words that read lower-case after "Word is" or "A carter told me"; names keep their capital. */
const COMMON_OPENING = new Set(['the', 'a', 'an', 'there', 'it', 'its', 'somebody', 'someone', 'something', 'they', 'half',
  'every', 'two', 'three', 'nobody', 'whatever', 'all', 'people', 'goblins', 'orcs', 'grain', 'steel', 'bread', 'with', 'south',
  'east', 'north', 'west', 'what', 'one', 'some', 'that', 'this', 'you', 'your', 'in']);
function joinOpener(opener, line) {
  const l = String(line || '').trim();
  if (!opener) return cap(l);
  if (/[:?—]\s$/.test(opener)) return opener + cap(l);
  const first = l.split(/[\s,']/)[0];
  return opener + (COMMON_OPENING.has(first.toLowerCase()) ? first.toLowerCase() + l.slice(first.length) : l);
}

/** The party's level as the director paces by it. */
export function directorLevel(st) {
  const d = st && st.world && st.world.director;
  if (d && d.levelOverride) return d.levelOverride;
  try { if (Party.members.length) return Math.max(1, Math.round(Party.levelAvg())); } catch (e) { /* headless */ }
  return (d && d.level) || 1;
}
function partySize() { try { return Math.max(1, Party.members.length); } catch (e) { return 1; } }

function npcName(id) { return (NPCS[id] && NPCS[id].name) || titleCase(id); }
function mapName(id) { try { return mapMeta(id).name || titleCase(id); } catch (e) { return titleCase(id); } }
/** A map's name as it sits mid-sentence: "the Triboar Trail", "Phandalin". */
function placeName(id) {
  const P = PLACES.find((p) => p.map === id) || SITES[id];
  if (P) return P.name;
  return mapName(id).replace(/^The /, 'the ');
}
function monName(id) { return (MONSTERS[id] && MONSTERS[id].name) || titleCase(id); }
function itemName(id) { try { const it = resolveItem(id); return (it && it.name) || titleCase(id); } catch (e) { return titleCase(id); } }
function plural(name) {
  const s = String(name || '');
  if (/(s|x|ch|sh)$/i.test(s)) return `${s}es`;
  if (/[^aeiou]y$/i.test(s)) return `${s.slice(0, -1)}ies`;
  if (/wolf$/i.test(s)) return `${s.slice(0, -1)}ves`;
  if (/man$/i.test(s)) return `${s.slice(0, -3)}men`;
  return `${s}s`;
}

/** The town whose people talk about a map (interiors resolve to their town). */
export function townOf(mapId) {
  const id = String(mapId || '');
  if (TOWN_OF_MAP[id]) return TOWN_OF_MAP[id];
  if (TOWN_ROLES[id]) return id;
  if (id.startsWith('bg-') || id === 'tumbledown-crypts') return 'baldurs-gate';
  let parent = null;
  try { parent = mapMeta(id).parent; } catch (e) { parent = null; }
  if (parent && parent !== id) return townOf(parent);
  const r = regionOfMap(id);
  if (r) for (const [m, t] of Object.entries(TOWN_OF_MAP)) if (regionOfMap(m) === r) return t;
  return null;
}
export function regionOf(mapId) {
  const r = regionOfMap(mapId);
  if (r) return r;
  let parent = null;
  try { parent = mapMeta(mapId).parent; } catch (e) { parent = null; }
  return parent && parent !== mapId ? regionOfMap(parent) : null;
}
/** A town as people say it: "Neverwinter", not the map's "Neverwinter — Protector's Enclave". */
function townName(town) { return town === 'baldurs-gate' ? "Baldur's Gate" : mapName(town).replace(/ — .*$/, ''); }

/** A plain Sword Coast name (docs/SETTING.md §5). */
function personName(r, sex) {
  const s = sex || (r.chance(0.5) ? 'male' : 'female');
  return `${r.pick(FOLK[s])} ${r.pick(FOLK.family)}`;
}

// ===========================================================================
// 2. CHRONICLE AND LOG
// ===========================================================================

function chronicleAdd(st, day, kind, text, meta = {}) {
  if (!text) return;
  const w = W(st);
  w.chronicle.push({ day, kind, text, ...meta });
  if (w.chronicle.length > CHRONICLE_MAX) w.chronicle.splice(0, w.chronicle.length - CHRONICLE_MAX);
}
function logEvent(st, day, ev, what, text) {
  const w = W(st);
  w.eventLog.push({ day, ev: ev.id, tpl: ev.tpl, what, text: text || '' });
  if (w.eventLog.length > LOG_MAX) w.eventLog.splice(0, w.eventLog.length - LOG_MAX);
}

/** The notable happenings of the world and the party, newest first. */
export function chronicle(st, { limit = 60, kind = null } = {}) {
  if (!st) return [];
  const w = W(st);
  const out = [];
  for (let i = w.chronicle.length - 1; i >= 0 && out.length < limit; i--) {
    const c = w.chronicle[i];
    if (kind && c.kind !== kind) continue;
    out.push({ ...c, date: dateText(c.day) });
  }
  return out;
}

/** The chronicle as journal entries (ui/menus.js Journal > Lore reads these). */
export function chronicleEntries(st) {
  const list = chronicle(st, { limit: 80 });
  if (!list.length) return [];
  const lines = [];
  let lastDate = null;
  for (const c of list) {
    if (c.date !== lastDate) { if (lastDate) lines.push(''); lines.push(c.date); lastDate = c.date; }
    lines.push(`${c.kind === 'party' ? '* ' : '- '}${c.text}`);
  }
  return [{ kind: 'lore', id: 'director-chronicle', label: 'The Chronicle of the Coast', body: lines.join('\n'), tag: 'Chronicle' }];
}

// ===========================================================================
// 3. THE CALENDAR
// ===========================================================================

/** The synthetic event template a festival runs as. */
const FEST_TPL = {};
function festivalTpl(id) {
  if (FEST_TPL[id]) return FEST_TPL[id];
  const f = FESTIVALS[id];
  if (!f) return null;
  FEST_TPL[id] = {
    id, name: f.name, kind: 'festival', tags: ['festival'], towns: f.towns, maps: f.towns, region: null,
    severity: 1, dark: false, festival: true,
    stages: [
      { id: 'eve', name: 'Preparations', days: [f.lead, f.lead], text: f.eve, prices: null, encounters: null, packs: [], visitors: [] },
      { id: 'day', name: f.name, days: [1, 1], text: f.text, notice: f.notice, prices: f.prices, encounters: f.encounters, packs: [], visitors: [] },
      { id: 'after', name: 'After', days: [1, 1], text: f.after, quiet: true, prices: null, encounters: null, packs: [], visitors: [] },
    ],
    quests: f.quest ? [{ at: 0, spec: f.quest }] : [],
    outcomes: { kept: { text: '' } },
  };
  return FEST_TPL[id];
}
function tplOf(ev) { return ev.festival ? festivalTpl(ev.tpl) : (EVENTS[ev.tpl] || null); }

/** The festival being kept (or prepared for) today, if any. */
export function festivalOn(stOrDay) {
  const st = typeof stOrDay === 'object' ? stOrDay : null;
  if (st) {
    const ev = W(st).events.find((e) => e.festival);
    if (!ev) return null;
    const tpl = tplOf(ev);
    return { id: ev.tpl, name: tpl.name, stage: tpl.stages[ev.stage] && tpl.stages[ev.stage].id };
  }
  const c = calendarOf(stOrDay);
  for (const f of Object.values(FESTIVALS)) {
    if (f.doy !== c.doy) continue;
    if (f.leap && !isShieldmeetYear(c.year)) continue;
    return { id: f.id, name: f.name, stage: 'day' };
  }
  return null;
}

function festivalsStarting(day) {
  const out = [];
  for (const f of Object.values(FESTIVALS)) {
    const c = calendarOf(day + f.lead);
    if (c.doy !== f.doy) continue;
    if (f.leap && !isShieldmeetYear(c.year)) continue;
    out.push(f.id);
  }
  return out;
}

// ===========================================================================
// 4. REGIONS AND WHO HOLDS THEM
// ===========================================================================

function controlRec(st, region) {
  const w = W(st);
  if (!w.control[region]) {
    const R = REGIONS[region];
    if (!R) return null;
    w.control[region] = { sway: { ...R.sway } };
  }
  return w.control[region];
}
function holderOf(rec) {
  let best = null, n = -1;
  for (const [k, v] of Object.entries((rec && rec.sway) || {})) if (v > n) { best = k; n = v; }
  return best;
}

/** Who holds a region, and by how much. */
export function regionControl(st, region) {
  const R = REGIONS[region];
  if (!R || !st) return null;
  const rec = controlRec(st, region);
  const holder = holderOf(rec);
  return { id: region, name: R.name, holder, holderName: POWER_NAMES[holder] || titleCase(holder), sway: { ...rec.sway } };
}

function shiftControl(st, region, power, delta, day, why) {
  const rec = controlRec(st, region);
  if (!rec || !delta) return;
  const before = holderOf(rec);
  rec.sway[power] = clamp(Math.round((rec.sway[power] || 0) + delta), 0, 100);
  const after = holderOf(rec);
  const w = W(st);
  w.controlLog.push({ day, region, power, delta, before, after, why: why || '' });
  if (w.controlLog.length > 80) w.controlLog.splice(0, w.controlLog.length - 80);
  if (after !== before) {
    chronicleAdd(st, day, 'world', `${cap(POWER_NAMES[after] || after)} now hold sway over ${REGIONS[region].name}.`, { region, power: after });
  }
}

/** The world noticing what the party did to the story: the Redbrands broken empties their share of Phandalin. */
function reconcileControl(st, day) {
  const rec = controlRec(st, 'phandalin');
  if (rec && hasFlag(st, 'redbrands-broken') && (rec.sway.redbrands || 0) > 0) {
    const share = rec.sway.redbrands;
    shiftControl(st, 'phandalin', 'redbrands', -share, day, 'the Redbrands broken');
    shiftControl(st, 'phandalin', 'lords-alliance', Math.ceil(share * 0.55), day, 'the Redbrands broken');
    shiftControl(st, 'phandalin', 'zhentarim', Math.floor(share * 0.45), day, 'the Redbrands broken');
    chronicleAdd(st, day, 'world', 'With the Redbrands broken, Phandalin is left to the Townmaster\'s Hall and the Miner\'s Exchange, and neither trusts the other.');
  }
}

// ===========================================================================
// 5. EVENTS
// ===========================================================================

function rollVars(tpl, r) {
  const v = {};
  const houses = NOBLE_HOUSES.slice();
  // Lists of the same length are parallel and share one pick, so the goods
  // lost belong to the merchant who lost them and the beast the miners saw is
  // the pack in the diggings.
  const byLen = {};
  for (const [k, spec] of Object.entries(tpl.vars || {})) {
    if (Array.isArray(spec)) {
      byLen[spec.length] ??= r.int(0, spec.length - 1);
      v[k] = spec[byLen[spec.length]];
    }
    else if (spec === 'person') v[k] = personName(r);
    else if (spec === 'man') v[k] = personName(r, 'male');
    else if (spec === 'woman') v[k] = personName(r, 'female');
    // A noble is named by house ('Westra of House Silmerhelve'), so only the given name is rolled.
    else if (spec === 'lady') v[k] = r.pick(FOLK.female);
    else if (spec === 'lord') v[k] = r.pick(FOLK.male);
    else if (spec === 'outlaw') v[k] = `${r.pick(r.chance(0.6) ? FOLK.male : FOLK.female)} ${r.pick(FOLK.byname)}`;
    else if (spec === 'house') { const i = r.int(0, houses.length - 1); v[k] = houses.splice(i, 1)[0]; }
  }
  if (v.giver && NPCS[v.giver]) v.giverName = NPCS[v.giver].name;
  return v;
}

/** Every map an event touches: where it plays out, and the towns (with their interiors) that feel it. */
function touches(tpl, mapId) {
  const id = String(mapId || '');
  if (tpl.maps.includes(id)) return true;
  const t = townOf(id);
  return !!t && (tpl.towns.includes(t) || tpl.maps.includes(t));
}

function startEvent(st, tplId, day, r, opts = {}) {
  const festival = !!opts.festival;
  const tpl = festival ? festivalTpl(tplId) : EVENTS[tplId];
  if (!tpl) return null;
  const w = W(st);
  const vars = rollVars(tpl, r);
  const ev = {
    id: `ev-${++w.director.seq}`, tpl: tplId, festival, name: fill(tpl.name, vars),
    started: day, stage: -1, stageStart: day, stageEnd: day, vars, resolved: null, quests: [],
    cause: opts.cause || null, pressure: 0,
  };
  if (!festival) w.seen[tplId] = (w.seen[tplId] || 0) + 1;
  w.events.push(ev);
  logEvent(st, day, ev, 'start', ev.name);
  enterStage(st, ev, opts.stage || 0, day, r);
  return ev;
}

function enterStage(st, ev, idx, day, r) {
  const tpl = tplOf(ev);
  const s = tpl.stages[idx];
  if (!s) return;
  ev.stage = idx;
  ev.stageStart = day;
  ev.stageEnd = day + Math.max(1, r.int(s.days[0], s.days[1] != null ? s.days[1] : s.days[0]));
  const text = fill(s.text, ev.vars);
  logEvent(st, day, ev, `stage:${s.id}`, text);
  if (text && !s.quiet) chronicleAdd(st, day, 'world', text, { event: ev.id, tpl: ev.tpl, stage: s.id });
  for (const q of tpl.quests || []) if (q.at === idx) postEventQuest(st, ev, q.spec, day, r);
}

/** The day the event would end if nothing hurries it. */
function eventEndsBy(ev) {
  const tpl = tplOf(ev);
  let d = ev.stageEnd;
  for (let i = ev.stage + 1; i < tpl.stages.length; i++) d += tpl.stages[i].days[1] != null ? tpl.stages[i].days[1] : tpl.stages[i].days[0];
  return d;
}

function pickOutcome(tpl, key, r) {
  let out = tpl.outcomes[key] || (key !== 'ignored' ? tpl.outcomes.resolved : null) || tpl.outcomes.ignored || null;
  if (Array.isArray(out)) {
    let roll = r.next(), chosen = out[out.length - 1][1];
    for (const [p, o] of out) { if (roll < p) { chosen = o; break; } roll -= p; }
    out = chosen;
  }
  return out;
}

function endEvent(st, ev, day, r, key) {
  const w = W(st);
  const tpl = tplOf(ev);
  const outKey = key || ev.resolved || (ev.festival ? 'kept' : 'ignored');
  const out = pickOutcome(tpl, outKey, r) || {};
  const text = fill(out.text, ev.vars);
  const i = w.events.indexOf(ev);
  if (i >= 0) w.events.splice(i, 1);
  ev.ended = day; ev.outcome = outKey;
  w.history[ev.tpl] = day;
  logEvent(st, day, ev, `end:${outKey}`, text);
  if (text) chronicleAdd(st, day, 'world', text, { event: ev.id, tpl: ev.tpl, outcome: outKey });

  if (out.prices) {
    w.effects.push({
      id: `fx-${++w.director.seq}`, src: ev.id, tpl: ev.tpl, name: ev.name, prices: { ...out.prices },
      maps: tpl.maps.slice(), towns: tpl.towns.slice(), until: day + (out.days || 10), text,
    });
  }
  for (const c of out.control || []) shiftControl(st, c[0], c[1], c[2], day, ev.name);
  for (const [k, v] of Object.entries(out.flags || {})) setFlag(st, k, v);
  for (const n of out.next || []) {
    if (r.chance(n[1])) w.pending.push({ tpl: n[0], day: day + (n[2] || 5), cause: ev.id });
  }
  w.ended.push({ id: ev.id, tpl: ev.tpl, name: ev.name, outcome: outKey, text, day, festival: ev.festival });
  if (w.ended.length > ENDED_MAX) w.ended.splice(0, w.ended.length - ENDED_MAX);

  // Work for an event that is over is over too. The quest that ended it has
  // already been completed; anything else still open fails, visibly.
  for (const qid of ev.quests) {
    dropPosting(st, qid);
    if (st.quests.active.some((q) => q.id === qid)) {
      const q = failQuest(st, qid);
      if (q) {
        chronicleAdd(st, day, 'party', `Too late: ${q.title}. ${text || ''}`.trim(), { quest: qid });
        noteDeed(st, { kind: 'questFail', questId: qid, faction: q.def && q.def.faction, weight: 2 });
        bus.emit(EV.TOAST, { text: `Too late: ${q.title}`, kind: 'quest' });
      }
    }
  }
}

/** A quest ended an event early: the outcome is the one that quest was for. */
function resolveEvent(st, evId, outcome) {
  const ev = W(st).events.find((e) => e.id === evId);
  if (!ev) return;
  ev.resolved = outcome || 'resolved';
  endEvent(st, ev, st.day, rngFor(st, 'resolve', ev.id), ev.resolved);
}

function eligible(st, id, day, lvl, ignoreCooldown) {
  const t = EVENTS[id];
  const w = W(st);
  if (!t) return false;
  if (w.events.some((e) => e.tpl === id)) return false;
  if (lvl < t.level[0] || lvl > t.level[1] + 2) return false;
  if (t.months && !t.months.includes(calendarOf(day).month)) return false;
  if (!ignoreCooldown && w.history[id] != null && day - w.history[id] < t.cooldown) return false;
  const req = t.requires || {};
  for (const f of arr(req.flag)) if (!hasFlag(st, f)) return false;
  for (const f of arr(req.notFlag)) if (hasFlag(st, f)) return false;
  if (t.region && w.events.filter((e) => !e.festival && EVENTS[e.tpl] && EVENTS[e.tpl].region === t.region).length >= 2) return false;
  return true;
}

/** Start trouble at a pace the party can keep up with. */
function paceEvents(st, day, r) {
  const w = W(st);
  const lvl = directorLevel(st);
  for (const p of w.pending.slice()) {
    if (p.day > day) continue;
    w.pending.splice(w.pending.indexOf(p), 1);
    if (eligible(st, p.tpl, day, lvl, true)) startEvent(st, p.tpl, day, r, { cause: p.cause });
  }
  const running = w.events.filter((e) => !e.festival).length;
  const target = lvl < 3 ? 2 : lvl < 7 ? 3 : 4;
  if (running >= target) return;
  if (!r.chance(running === 0 ? 0.85 : 0.4)) return;
  const pool = EVENT_IDS.filter((id) => eligible(st, id, day, lvl, false));
  if (!pool.length) return;
  const here = regionOf(st.mapId) || regionOf(st.lastTown);
  const pick = r.pickWeighted(pool, (id) => {
    const t = EVENTS[id];
    let wt = t.weight;
    if (t.region && t.region === here) wt *= 2.2;
    if (t.dark && lvl >= t.level[0] + 2) wt *= 1.4;
    // The same trouble twice in a season is news once; after that it is weather.
    wt /= 1 + 0.7 * (w.seen[id] || 0);
    return wt;
  });
  if (pick) startEvent(st, pick, day, r);
}

// ===========================================================================
// 6. THE DAILY TICK
// ===========================================================================

/** Bring the world up to `toDay` (default: st.day). Safe to call as often as you like. */
export function advanceDirector(st, toDay) {
  if (!st) return;
  const w = W(st);
  const target = toDay != null ? toDay : (st.day | 0);
  if (w.director.day == null) { openWorld(st, target); return; }
  if (target <= w.director.day) return;
  const from = Math.max(w.director.day + 1, target - MAX_CATCHUP + 1);
  for (let d = from; d <= target; d++) dailyTick(st, d);
  w.director.day = target;
  w.director.level = directorLevel(st);
}

/**
 * The first day the director sees. A new campaign opens on 1 Mirtul, which is
 * Greengrass; an old save opens wherever it is. Either way the world should
 * already be in motion, so one piece of local trouble starts part-way through.
 */
function openWorld(st, day) {
  const w = W(st);
  w.director.day = day;
  const r = rngFor(st, 'open', day);
  for (const f of Object.values(FESTIVALS)) {
    for (let back = 0; back <= f.lead + 1; back++) {
      if (!festivalsStarting(day - back).includes(f.id)) continue;
      const stageIdx = back < f.lead ? 0 : back === f.lead ? 1 : 2;
      const ev = startEvent(st, f.id, day, r, { festival: true, stage: stageIdx });
      if (ev && stageIdx === 0) ev.stageEnd = day + (f.lead - back);
    }
  }
  reconcileControl(st, day);
  const lvl = directorLevel(st);
  const here = regionOf(st.mapId) || 'phandalin';
  const local = EVENT_IDS.filter((id) => eligible(st, id, day, lvl, false)
    && (EVENTS[id].region === here || EVENTS[id].towns.includes(townOf(st.mapId) || 'phandalin')));
  const first = r.pickWeighted(local.length ? local : EVENT_IDS.filter((id) => eligible(st, id, day, lvl, false)), (id) => EVENTS[id].weight);
  if (first) startEvent(st, first, day, r);
  w.director.level = lvl;
}

function dailyTick(st, day) {
  const w = W(st);
  const r = rngFor(st, 'day', day);

  for (const id of festivalsStarting(day)) if (!w.events.some((e) => e.tpl === id)) startEvent(st, id, day, r, { festival: true });

  for (const ev of w.events.slice()) {
    let guard = 0;
    while (w.events.includes(ev) && day >= ev.stageEnd && guard++ < 8) {
      const tpl = tplOf(ev);
      if (ev.stage + 1 < tpl.stages.length) enterStage(st, ev, ev.stage + 1, ev.stageEnd, r);
      else endEvent(st, ev, day, r);
    }
  }

  w.effects = w.effects.filter((e) => e.until > day);
  w.visitors = w.visitors.filter((v) => v.until > day);
  w.gossip = w.gossip.filter((g) => day - g.day <= 45);
  reconcileControl(st, day);
  renewSites(st, day);
  for (const [giver, list] of Object.entries(w.postings)) {
    w.postings[giver] = list.filter((p) => !p.taken && p.until >= day);
    if (!w.postings[giver].length) delete w.postings[giver];
  }
  paceEvents(st, day, r);
}

// ===========================================================================
// 7. WHAT OTHER SYSTEMS ASK
// ===========================================================================

/** Running events that touch a map, with the encounter terms they imply. */
export function activeEventsFor(st, mapId) {
  if (!st) return [];
  const w = W(st);
  const out = [];
  for (const ev of w.events) {
    const tpl = tplOf(ev);
    if (!tpl || !touches(tpl, mapId)) continue;
    const s = tpl.stages[ev.stage] || null;
    const e = s && s.encounters && (!s.encounters.maps || s.encounters.maps.includes(mapId)) ? s.encounters : null;
    const text = fill(s && s.text, ev.vars);
    out.push({
      id: ev.id, tpl: ev.tpl, name: ev.name, kind: tpl.kind, tags: tpl.tags.slice(), festival: ev.festival,
      stage: s && s.id, stageName: s && s.name, text, since: ev.stageStart, until: ev.stageEnd,
      severity: tpl.severity || 1, dark: !!tpl.dark,
      encounters: e ? { groups: (e.groups || []).map((g) => g.slice()), rate: e.rate != null ? e.rate : 1, biomes: e.biomes ? e.biomes.slice() : null } : null,
      reason: text ? `${ev.name}: ${text}` : ev.name,
    });
  }
  const town = townOf(mapId);
  const m = town && MARKETS[town];
  if (m && calendarOf(st.day).tendayDay === m.day) {
    out.push({ id: `market-${town}-${st.day}`, tpl: 'market', name: cap(m.name), kind: 'market', tags: ['market', 'trade'],
      festival: false, stage: 'market', stageName: 'Market day', text: `It is ${m.name} in ${townName(town)}.`,
      since: st.day, until: st.day + 1, severity: 1, dark: false, encounters: null, reason: cap(m.name) });
  }
  return out;
}

const MARKET_PRICES = Object.freeze({ food: 0.9, grain: 0.9, livestock: 0.95, tool: 0.95, gear: 0.95 });
const HOLDER_PRICES = Object.freeze({
  zhentarim: { prices: { '*': 1.03, poison: 0.85 }, text: 'The Black Network takes its cut of everything sold here.' },
  'cult-dragon': { prices: { '*': 1.08 }, text: 'Travellers are frightened off the roads; everything comes in dear.' },
  'many-arrows': { prices: { weapon: 1.15, food: 1.1 }, text: 'Orcs on the roads: steel and bread are both dear.' },
  cragmaw: { prices: { gear: 1.08, weapon: 1.08 }, text: 'Goblins take a toll of every third wagon.' },
});

/** Price pressure the world puts on a map's traders: events, their aftermath, market day, and who holds the town. */
export function eventPriceModifiers(st, mapId) {
  const mult = {};
  const notes = [];
  if (!st) return { mult, notes, town: null };
  const w = W(st);
  const apply = (prices, text, src) => {
    if (!prices) return;
    for (const [cat, f] of Object.entries(prices)) mult[cat] = (mult[cat] != null ? mult[cat] : 1) * f;
    notes.push({ text, cats: Object.keys(prices), src });
  };
  for (const ev of w.events) {
    const tpl = tplOf(ev);
    if (!tpl || !touches(tpl, mapId)) continue;
    const s = tpl.stages[ev.stage];
    if (s && s.prices) apply(s.prices, fill(s.text, ev.vars) || ev.name, ev.id);
  }
  for (const fx of w.effects) {
    if (touches({ maps: fx.maps, towns: fx.towns }, mapId)) apply(fx.prices, fx.text || fx.name, fx.id);
  }
  const town = townOf(mapId);
  const m = town && MARKETS[town];
  if (m && calendarOf(st.day).tendayDay === m.day) apply(MARKET_PRICES, `It is ${m.name}.`, 'market');
  const reg = regionOf(mapId);
  if (reg) {
    const h = holderOf(controlRec(st, reg));
    if (HOLDER_PRICES[h]) apply(HOLDER_PRICES[h].prices, HOLDER_PRICES[h].text, `control:${reg}`);
  }
  for (const k of Object.keys(mult)) mult[k] = Math.round(clamp(mult[k], 0.5, 2.5) * 100) / 100;
  return { mult, notes, town };
}

/** One multiplier for an item carrying the given categories (item kind + trade tags). */
export function eventPriceFactor(st, mapId, cats = []) {
  const { mult } = eventPriceModifiers(st, mapId);
  let f = mult['*'] != null ? mult['*'] : 1;
  for (const c of arr(cats)) if (mult[c] != null) f *= mult[c];
  return Math.round(clamp(f, 0.4, 3) * 100) / 100;
}

/** People the world has put somewhere for a while (a rescued captive at home, a herald). */
export function visitorsFor(st, mapId) {
  if (!st) return [];
  return W(st).visitors.filter((v) => v.map === mapId);
}

// ===========================================================================
// 8. SITES — lairs and landmarks
// ===========================================================================

function siteRec(st, id) {
  const w = W(st);
  return w.sites[id] || (w.sites[id] = { found: null, how: null, gen: 1, occupant: null, clearedDay: null, renewDay: null });
}

function pickOccupant(st, id, gen, avoid) {
  const S = SITES[id];
  const lvl = directorLevel(st);
  const r = rngFor(st, 'occupant', id, gen);
  let fits = S.occupants.filter(([g, lo, hi]) => MONSTER_GROUPS[g] && lvl >= lo - 1 && lvl <= hi + 2);
  if (!fits.length) fits = S.occupants.filter(([g]) => MONSTER_GROUPS[g]);
  // The first tenants are the ones the stories name (the Cragmaw in their hideout);
  // whatever moves in after them is the world's own invention.
  if (gen === 1 && fits.includes(S.occupants[0])) return S.occupants[0][0];
  const fresh = fits.filter(([g]) => g !== avoid);
  const pick = r.pick(fresh.length ? fresh : fits);
  return pick ? pick[0] : null;
}

export function siteState(st, id) { return (st && W(st).sites[id]) || null; }
export function isSiteKnown(st, id) { const s = siteState(st, id); return !!(s && s.found != null); }

/** The party learns the way to a site. Returns the site's record (null for an unknown id). */
export function discoverSite(st, id, how = 'rumor') {
  const S = SITES[id];
  if (!S || !st) return null;
  const rec = siteRec(st, id);
  if (rec.found != null) return rec;
  rec.found = st.day;
  rec.how = how;
  if (!rec.occupant) rec.occupant = pickOccupant(st, id, rec.gen);
  const via = how === 'rumor' ? ' on the strength of a rumour' : how === 'quest' ? ' from the directions you were given' : ' by reading the ground';
  chronicleAdd(st, st.day, 'party', `Found the way to ${S.name}${via}.`, { site: id });
  noteDeed(st, { kind: 'discover', target: id, mapId: S.host, weight: 2 });
  bus.emit(EV.TOAST, { text: how === 'search' ? `You notice a way off the road: ${S.name}.` : `New place: ${S.name} (off ${placeName(S.host)})`, kind: 'quest' });
  return rec;
}

/** Known and unknown sites a host map leads to. */
export function sitesHostedBy(st, mapId) {
  const out = [];
  for (const S of Object.values(SITES)) if (S.host === mapId) out.push({ id: S.id, site: S, known: isSiteKnown(st, S.id) });
  return out;
}
export function siteOfMap(mapId) {
  for (const S of Object.values(SITES)) if (S.map === mapId) return S;
  return null;
}

/**
 * Walking a host map, the party may read a way off the road nobody told them
 * about: the best passive Wisdom (Survival) in the party against the site's DC.
 * A site far beyond the party's level stays unnoticed; nobody goes looking.
 */
export function searchForSites(st, mapId, passive) {
  const found = [];
  const lvl = directorLevel(st);
  for (const { id, site, known } of sitesHostedBy(st, mapId)) {
    if (known || lvl < site.band[0] - 1) continue;
    if ((passive | 0) >= site.dc) { discoverSite(st, id, 'search'); found.push(site); }
  }
  return found;
}

/** The lair a site map holds right now, if anything lives there. */
export function lairFor(st, mapId) {
  const S = siteOfMap(mapId);
  if (!S || !st) return null;
  const rec = siteRec(st, S.id);
  if (!rec.occupant) rec.occupant = pickOccupant(st, S.id, rec.gen);
  if (rec.clearedDay != null) return { site: S.id, cleared: true, gen: rec.gen };
  const g = MONSTER_GROUPS[rec.occupant];
  return { site: S.id, cleared: false, gen: rec.gen, group: rec.occupant, name: (g && g.name) || titleCase(rec.occupant), key: `lair:${S.id}:${rec.gen}` };
}

/** The lair's occupants were beaten. It stands empty for a few weeks. */
export function lairCleared(st, siteId) {
  const S = SITES[siteId];
  if (!S || !st) return;
  const rec = siteRec(st, siteId);
  if (rec.clearedDay != null) return;
  const r = rngFor(st, 'renew', siteId, rec.gen);
  rec.clearedDay = st.day;
  rec.renewDay = st.day + r.int(S.renew[0], S.renew[1]);
  if (rec.found == null) rec.found = st.day;
  const g = MONSTER_GROUPS[rec.occupant];
  chronicleAdd(st, st.day, 'party', `Cleared ${S.name} of ${(g && g.name) || 'what lived there'}.`, { site: siteId });
  noteDeed(st, { kind: 'kill', target: rec.occupant, mapId: S.map, weight: 3, tags: ['lair'] });
}

function renewSites(st, day) {
  const w = W(st);
  for (const [id, rec] of Object.entries(w.sites)) {
    if (rec.clearedDay == null || rec.renewDay == null || day < rec.renewDay) continue;
    const S = SITES[id];
    if (!S) continue;
    const old = rec.occupant;
    rec.gen++;
    rec.occupant = pickOccupant(st, id, rec.gen, old);
    rec.clearedDay = null; rec.renewDay = null;
    const g = MONSTER_GROUPS[rec.occupant];
    chronicleAdd(st, day, 'world', `Something new has moved into ${S.name}: ${(g && g.name) || 'a new tenant'}.`, { site: id });
    w.gossip.push({ key: `renew:${id}:${rec.gen}`, kind: 'renewal', day, map: S.host, town: townOf(S.host), site: id, group: rec.occupant });
  }
}

// ===========================================================================
// 9. QUESTS — building, posting, accepting, finishing
// ===========================================================================

let xpHandler = (n) => { for (const m of Party.members) { try { grantXp(m, n); } catch (e) { /* ignore */ } } };

/** Resolve a spec's giver token to a real NPC id. */
function resolveGiver(token, town) {
  const t = String(token || '');
  const roles = TOWN_ROLES[town] || TOWN_ROLES.phandalin;
  if (t.startsWith('town-')) return roles[t.slice(5)] || roles.host;
  if (NPCS[t]) return t;
  return roles.host;
}

function placeFor(st, mapId) {
  const P = PLACES.find((p) => p.map === mapId);
  if (P) return { map: P.map, name: P.name, prep: P.prep, biome: P.biome, town: false };
  const S = SITES[mapId];
  if (S) return { map: S.map, name: S.name, prep: S.prep, biome: S.biome, town: false, site: S.id };
  let meta = null;
  try { meta = mapMeta(mapId); } catch (e) { meta = null; }
  const town = !!(meta && (meta.kind === 'town' || meta.kind === 'city' || meta.kind === 'interior' || meta.safe));
  const full = (meta && meta.name) || titleCase(mapId);
  const name = town ? full.replace(/ — .*$/, '') : full;
  return { map: mapId, name, prep: town ? `in ${name}` : `at ${name}`, biome: (meta && meta.biome) || 'plains', town };
}

/** Places a party of this level can reach, near a town if possible. */
function placePool(st, lvl, town, biomes, opts = {}) {
  const pool = [];
  for (const P of PLACES) {
    if (lvl < P.band[0] - 1 || lvl > P.band[1] + 3) continue;
    pool.push({ map: P.map, name: P.name, prep: P.prep, biome: P.biome, town: false, near: P.near, weight: P.near === town ? 3 : 1 });
  }
  for (const S of Object.values(SITES)) {
    if (lvl < S.band[0] - 1 || lvl > S.band[1] + 3) continue;
    const known = isSiteKnown(st, S.id);
    if (!known && opts.noUnknownSites) continue;
    const lair = known ? lairFor(st, S.map) : null;
    if (lair && lair.cleared && opts.needLair) continue;
    pool.push({ map: S.map, name: S.name, prep: S.prep, biome: S.biome, town: false, site: S.id, near: townOf(S.host), weight: (townOf(S.host) === town ? 3 : 1) * (known ? 1.2 : 0.8) });
  }
  if (biomes && biomes.length) {
    const narrowed = pool.filter((p) => biomes.includes(p.biome));
    if (narrowed.length >= 2) return narrowed;
  }
  return pool;
}

/**
 * Many encounter groups carry a place in their name ("Wyvern Tor Orcs", "the
 * Ash-Dead of Thundertree"). Those belong where they are named: strongly
 * preferred there, barely used anywhere else.
 */
const PLACE_WORDS = ['cragmaw', 'thundertree', 'wyvern-tor', 'old-owl', 'neverwinter', 'kryptgarden', 'mere', 'icespire',
  'conyberry', 'undermountain', 'wave-echo', 'phandalin', 'triboar', 'high-road', 'sword-mountains', 'fields', 'chionthar',
  'bg-', 'tumbledown', 'rosymorn', 'nashkel', 'trollbark', 'coast-way', 'redbrand', 'glasstaff', 'skullport', 'blacklake'];
function placeAffinity(groupId, mapId) {
  const g = String(groupId), m = String(mapId || '');
  const word = PLACE_WORDS.find((w) => g.includes(w));
  if (!word) return 1;
  return m.includes(word) || (word === 'blacklake' && m === 'neverwinter') || (word === 'fields' && m.includes('fields')) ? 4 : 0.1;
}

/** A MONSTER_GROUPS pack that fits a place and a level. */
function groupFor(r, biome, lvl, types, mapId) {
  const fits = Object.values(MONSTER_GROUPS).filter((g) => (!g.biomes || !g.biomes.length || g.biomes.includes(biome))
    && (g.minLevel == null || lvl >= g.minLevel - 1) && (g.maxLevel == null || lvl <= g.maxLevel + 2));
  let pool = fits;
  if (types && types.length) {
    const typed = fits.filter((g) => (g.members || []).some((m) => MONSTERS[m[0]] && types.includes(MONSTERS[m[0]].type)));
    if (typed.length) pool = typed;
  }
  const g = r.pickWeighted(pool, (x) => placeAffinity(x.id, mapId));
  return g ? g.id : null;
}

const UNDEAD_GROUPS = ['old-owl-well-undead', 'crypt-of-the-restless', 'shrine-defilers', 'ghoul-warren', 'fields-barrow-host', 'tumbledown-emptied-rows'];

/**
 * Turn a spec (an event's request, a festival's, a giver's own trade) into a
 * quest def. Returns null when the party is outside the spec's level band.
 */
function buildQuest(st, spec, ctx = {}) {
  const lvl = ctx.level || directorLevel(st);
  if (spec.minLevel && lvl < spec.minLevel) return null;
  if (spec.maxLevel && lvl > spec.maxLevel) return null;
  const r = ctx.r || rngFor(st, 'quest', ctx.salt || 'x');
  const ev = ctx.ev || null;
  const vars = { ...(ev ? ev.vars : {}), ...(spec._vars || {}) };
  const town = ctx.town || (ev ? (tplOf(ev).towns[0] || townOf(tplOf(ev).maps[0])) : 'phandalin');
  const giverId = resolveGiver(fill(spec.giver, vars), town);
  const giver = { id: giverId, name: npcName(giverId) };
  const giverTown = townOf(NPCS[giverId] ? NPCS[giverId].map : town) || town;

  // --- where --------------------------------------------------------------
  let place;
  const token = fill(spec.place || '', vars);
  if (token === 'wild-near' || token === 'crypt-near' || !token) {
    const biomes = token === 'crypt-near' ? ['crypt', 'ruins', 'dungeon', 'plains'] : null;
    const pool = placePool(st, lvl, giverTown, biomes, { noUnknownSites: token === 'wild-near' });
    const p = r.pickWeighted(pool, (x) => x.weight) || pool[0];
    place = p ? { ...p } : placeFor(st, 'triboar-trail');
  } else {
    place = placeFor(st, token);
  }
  if (spec.town) place.town = true;

  // --- who is in the way ----------------------------------------------------
  let group = spec.group ? fill(spec.group, vars) || null : null;
  if (group === 'undead') group = r.pick(UNDEAD_GROUPS.filter((g) => MONSTER_GROUPS[g] && (MONSTER_GROUPS[g].minLevel || 1) <= lvl + 1)) || 'old-owl-well-undead';
  if (!group && !spec.pack && !spec.foe && place.site && ['clear', 'rescue', 'retrieve'].includes(spec.kind)) {
    const lair = lairFor(st, place.map);
    if (lair && !lair.cleared) group = lair.group;
  }
  if (group && !MONSTER_GROUPS[group]) group = null;

  // --- the particulars --------------------------------------------------------
  const kind = spec.kind;
  const item = spec.item ? { id: spec.item, name: itemName(spec.item) } : null;
  let captive = null;
  if (spec.captive) {
    const nm = spec.captive === 'person' ? personName(r) : fill(spec.captive, vars);
    captive = { name: nm || personName(r), sprite: r.pick(['npc-villager-m', 'npc-villager-f', 'npc-merchant', 'npc-farmer']) };
  }
  let named = spec.named ? fill(spec.named, vars) : null;
  if (!named && kind === 'hunt' && spec.foe && MONSTERS[spec.foe]) {
    named = MONSTERS[spec.foe].boss ? MONSTERS[spec.foe].name : fill(r.pick(['beast', 'monstrosity', 'dragon'].includes(MONSTERS[spec.foe].type) ? BEAST_EPITHETS : DREAD_EPITHETS), { foe: monName(spec.foe), place: place.name.replace(/^the /, '') });
  }
  let clue = null;
  if (kind === 'investigate' || spec.gather) {
    clue = {
      text: fill(spec.clue || '', vars) || (spec.gather
        ? `The ${item ? item.name.toLowerCase() : 'herbs'} grow here, among a dozen plants that look almost like them.`
        : `You search ${place.prep} and find what the road would rather forget.`),
      skill: spec.gather ? 'nature' : 'investigation',
      dc: clamp(11 + Math.floor(lvl / 4), 11, 17),
    };
  }
  let to = null;
  if (spec.to) {
    const tt = townOf(spec.to) || spec.to;
    const host = (spec.toNpc && NPCS[spec.toNpc] ? spec.toNpc : null) || (TOWN_ROLES[tt] || {}).host || giverId;
    to = { map: spec.to, name: townName(tt), npc: host, npcName: npcName(host) };
  }
  let withWho = null;
  if (spec.with) {
    if (NPCS[spec.with]) withWho = { npc: spec.with, name: npcName(spec.with), faction: NPCS[spec.with].faction || null };
    else withWho = { name: fill(spec.withName || '', vars) || personName(r), sprite: 'npc-merchant' };
  }

  // The fight is sized to the party the way the 2024 DMG sizes one: a hard
  // encounter for ordinary work, deadly for a hunt, a bounty or a boss.
  const size = partySize();
  const hardish = kind === 'hunt' || kind === 'bounty' || spec.boss;
  const budget = encounterBudget(lvl, size, hardish ? 'deadly' : 'hard');
  let foe = spec.foe || null;
  if (kind === 'bounty' && (!foe || (MONSTERS[foe] && MONSTERS[foe].type === 'humanoid'))) {
    // The wanted outlaw is whoever the party can plausibly take: a thug at first,
    // a bandit captain later, a veteran of the wars once the party is a name.
    const ladder = ['bandit', 'thug', 'bandit-captain', 'veteran'].filter((id) => MONSTERS[id]);
    foe = ladder.filter((id) => MONSTERS[id].xp <= budget * 0.7).pop() || ladder[0];
  }

  const idSalt = `${ev ? ev.id : 'post'}:${spec.kind}:${spec.title || ''}:${ctx.day || st.day}:${ctx.salt || ''}`;
  const def = generateQuest(lvl, r, {
    kind, id: `dq-${hashStr(`${seedOf(st)}:${idSalt}`).toString(36)}`,
    title: fillKnown(spec.title || '', { ...vars, named: named || vars.named }), desc: fillKnown(spec.desc || '', { ...vars, named: named || vars.named }),
    giver, faction: spec.faction || (NPCS[giverId] && NPCS[giverId].faction) || null,
    place, group, pack: spec.pack || null, foe, named, item, captive, clue, to, with: withWho, budget,
    size, severity: ev ? (tplOf(ev).severity || 1) : 1, tier: spec.tier || null, types: spec.types || null,
    event: ev ? ev.id : null, resolves: !!spec.resolves, outcome: spec.outcome || null,
    exclusive: spec.exclusive ? `${ev ? ev.id : 'x'}:${spec.exclusive}` : null,
    followup: spec.followup ? { ...spec.followup, _vars: vars } : null,
    reveals: spec.reveals || (place.site && !isSiteKnown(st, place.site) ? place.site : null),
    flag: spec.flag || null, crime: !!spec.crime, confront: !!spec.confront, gather: !!spec.gather, boss: !!spec.boss,
    deadline: ctx.until || null, start: kind === 'deliver' && item ? { give: item.id } : null,
    template: ctx.template || null,
  });
  return def;
}

function addPosting(st, def, day, until, meta = {}) {
  const w = W(st);
  const list = w.postings[def.giver] || (w.postings[def.giver] = []);
  if (list.some((p) => p.id === def.id)) return;
  if (st.quests.active.some((q) => q.id === def.id) || st.quests.done.includes(def.id)) return;
  list.push({ id: def.id, def, day, until, taken: false, event: def.event || null, town: meta.town || townOf(NPCS[def.giver] ? NPCS[def.giver].map : '') });
}
function dropPosting(st, qid) {
  const w = W(st);
  for (const [g, list] of Object.entries(w.postings)) {
    w.postings[g] = list.filter((p) => p.id !== qid);
    if (!w.postings[g].length) delete w.postings[g];
  }
}

function postEventQuest(st, ev, spec, day, r) {
  const tpl = tplOf(ev);
  if (ev.festival) {
    // A festival's small job is offered in every town keeping it; it is built
    // lazily, per town, when someone there is asked for work.
    ev.festivalSpec = spec;
    return;
  }
  const until = eventEndsBy(ev);
  const def = buildQuest(st, spec, { ev, day, r, until, salt: `${ev.id}:${ev.quests.length}` });
  if (!def) return;
  ev.quests.push(def.id);
  addPosting(st, def, day, until, { town: tpl.towns[0] });
}

/** The festival job for one town, built on first ask and posted like any other. */
function festivalPosting(st, giverId) {
  const w = W(st);
  const ev = w.events.find((e) => e.festival && e.festivalSpec && e.stage === 0);
  if (!ev) return;
  const npc = NPCS[giverId];
  const town = townOf(npc ? npc.map : '');
  if (!town || !tplOf(ev).towns.includes(town)) return;
  const spec = ev.festivalSpec;
  const want = resolveGiver(spec.giver, town);
  if (want !== giverId) return;
  const key = `${ev.id}:${town}`;
  if (ev.quests.some((q) => String(q).startsWith(`fest:${key}`))) return;
  const def = buildQuest(st, spec, { ev, town, until: eventEndsBy(ev), salt: key });
  if (!def) return;
  ev.quests.push(def.id);
  ev.quests.push(`fest:${key}`);
  addPosting(st, def, st.day, eventEndsBy(ev), { town });
}

// --- a giver's own trade, when no event is asking ------------------------------

const ROLE_WORK = Object.freeze({
  questgiver: { want: 2, kinds: null },
  noble: { want: 2, kinds: ['investigate', 'deliver', 'negotiate', 'escort'] },
  innkeep: { want: 1, kinds: ['deliver', 'rescue', 'cull', 'retrieve'] },
  priest: { want: 1, kinds: ['clear', 'deliver', 'retrieve'] },
  guard: { want: 1, kinds: ['bounty', 'cull', 'clear'] },
  shopkeeper: { want: 1, kinds: ['deliver', 'retrieve', 'escort'] },
  smith: { want: 1, kinds: ['retrieve', 'deliver'] },
  wizard: { want: 1, kinds: ['retrieve', 'investigate', 'hunt'] },
});
const FACTION_WORK = Object.freeze({
  harpers: ['investigate', 'rescue', 'deliver', 'retrieve'],
  gauntlet: ['clear', 'hunt', 'cull', 'bounty'],
  'emerald-enclave': ['cull', 'hunt', 'retrieve', 'clear'],
  'lords-alliance': ['clear', 'bounty', 'deliver', 'escort', 'rescue'],
  zhentarim: ['retrieve', 'deliver', 'cull', 'negotiate'],
  'flaming-fist': ['bounty', 'clear', 'escort'],
});
const FACTION_TYPES = Object.freeze({
  gauntlet: ['undead', 'fiend', 'aberration', 'monstrosity'], 'emerald-enclave': ['beast', 'plant', 'monstrosity', 'aberration', 'ooze'],
  harpers: ['humanoid', 'fiend', 'monstrosity'], 'lords-alliance': ['humanoid', 'monstrosity', 'giant', 'beast'], zhentarim: ['humanoid', 'monstrosity'],
});
const DELIVERABLES = Object.freeze({
  harpers: 'sealed-letter', 'lords-alliance': 'dispatch-case', zhentarim: 'wrapped-parcel', priest: 'medicine-chest',
  default: 'wrapped-parcel',
});

function fillerSpec(st, giverId, r, lvl) {
  const npc = NPCS[giverId];
  if (!npc) return null;
  const roleWork = ROLE_WORK[npc.role];
  if (!roleWork) return null;
  const fac = npc.faction && FACTION_WORK[npc.faction] ? npc.faction : null;
  const kinds = fac ? FACTION_WORK[fac] : (roleWork.kinds || ['cull', 'deliver', 'retrieve', 'rescue']);
  const kind = r.pick(kinds);
  const town = townOf(npc.map) || 'phandalin';
  const bd = fac && FACTION_CONTRACTS[fac];
  const types = FACTION_TYPES[fac] || null;
  const spec = { kind, giver: giverId, faction: fac || (npc.faction || null) };
  const texts = (JOB_TEXT[kind] && (JOB_TEXT[kind][fac] || JOB_TEXT[kind][npc.role] || JOB_TEXT[kind].default)) || null;

  if (kind === 'deliver' || kind === 'escort') {
    const ends = DELIVERY_ENDS.filter((d) => lvl >= d.band[0] - 1 && townOf(d.map) !== town && d.npc !== giverId && NPCS[d.npc]);
    const end = r.pick(ends.length ? ends : DELIVERY_ENDS.filter((d) => townOf(d.map) !== town));
    if (!end) return null;
    spec.toNpc = end.npc;
    if (kind === 'deliver') {
      spec.to = end.map;
      spec.item = DELIVERABLES[fac] || DELIVERABLES[npc.role] || DELIVERABLES.default;
      if (!resolveItemSafe(spec.item)) return null;
      spec.place = end.map;
      spec.town = true;
    } else {
      const road = placePool(st, lvl, town, ['road'], { noUnknownSites: true }).filter((p) => !p.site);
      const p = r.pick(road);
      if (!p) return null;
      spec.place = p.map; spec.to = end.map;
      spec.group = groupFor(r, 'road', lvl, ['humanoid', 'beast'], p.map);
    }
  } else if (kind === 'negotiate') {
    spec.place = town; spec.town = true; spec.with = 'person';
  } else {
    const pool = placePool(st, lvl, town, bd ? bd.biomes : null, { needLair: kind === 'clear' });
    const p = r.pickWeighted(pool, (x) => x.weight);
    if (!p) return null;
    spec.place = p.map;
    if (kind === 'clear' || kind === 'rescue') {
      const lair = p.site ? lairFor(st, p.map) : null;
      spec.group = lair && !lair.cleared ? lair.group : groupFor(r, p.biome, lvl, types, p.map);
      if (kind === 'rescue') spec.captive = 'person';
    } else if (kind === 'hunt') {
      const ids = Object.keys(MONSTERS).filter((id) => {
        const m = MONSTERS[id];
        if (!m || m.boss || (m.biomes && m.biomes.length && !m.biomes.includes(p.biome))) return false;
        if (types && !types.includes(m.type)) return false;
        return m.cr >= Math.max(1, lvl / 2) && m.cr <= lvl / 2 + 3;
      });
      spec.foe = r.pick(ids) || null;
    } else if (kind === 'bounty') {
      spec.foe = lvl >= 7 ? 'veteran' : 'bandit-captain';
      spec.group = lvl >= 7 ? 'coast-way-crews' : 'triboar-trail-bandits';
      spec.named = `${r.pick(r.chance(0.6) ? FOLK.male : FOLK.female)} ${r.pick(FOLK.byname)}`;
    } else if (kind === 'cull') {
      spec.group = groupFor(r, p.biome, lvl, types, p.map);
    } else if (kind === 'retrieve') {
      // Thieves keep what they take; a wolf pack does not carry a strongbox off. The site's own
      // tenants hold it if they are the kind that would.
      const lair = p.site ? lairFor(st, p.map) : null;
      const lg = lair && !lair.cleared ? MONSTER_GROUPS[lair.group] : null;
      const thieves = (g) => !!g && (g.members || []).some((m) => MONSTERS[m[0]] && ['humanoid', 'giant'].includes(MONSTERS[m[0]].type));
      spec.group = thieves(lg) ? lair.group : groupFor(r, p.biome, lvl, ['humanoid', 'giant'], p.map);
      spec.types = ['humanoid', 'giant'];
      spec.item = fac === 'zhentarim' ? 'stolen-ledger' : npc.role === 'priest' ? 'shrine-reliquary' : r.pick(['strongbox', 'family-heirloom', 'stolen-ledger']);
      if (!resolveItemSafe(spec.item)) spec.item = 'coster-crate';
    } else if (kind === 'investigate') {
      spec.clue = null;
    }
  }
  if (texts) {
    const t = r.pick(texts);
    spec.title = t.title; spec.desc = t.desc;
  } else if (bd) {
    const tp = r.pick(bd.templates);
    if (tp) { spec.title = r.pick(tp.titles); spec.desc = tp.desc; }
  }
  return spec;
}
function resolveItemSafe(id) { try { return !!resolveItem(id); } catch (e) { return false; } }

/** Everything a person is offering the party right now (events first, then their own trade). */
export function postingsFor(st, giverId) {
  if (!st || !giverId) return [];
  const w = W(st);
  advanceDirector(st);
  festivalPosting(st, giverId);
  const npc = NPCS[giverId];
  const role = npc && ROLE_WORK[npc.role];
  const mine = () => (w.postings[giverId] || []).filter((p) => !p.taken);
  if (role && mine().filter((p) => !p.event).length < role.want) {
    const lvl = directorLevel(st);
    const bucket = Math.floor(st.day / 5);
    for (let i = 0; i < role.want && mine().filter((p) => !p.event).length < role.want; i++) {
      const salt = `fill:${giverId}:${bucket}:${i}`;
      if (w.quests[`posted:${salt}`]) continue;
      const r = rngFor(st, salt);
      const spec = fillerSpec(st, giverId, r, lvl);
      w.quests[`posted:${salt}`] = st.day;
      if (!spec) continue;
      const def = buildQuest(st, spec, { r, salt, town: townOf(npc.map) });
      if (def) addPosting(st, def, st.day, st.day + 8);
    }
  }
  return mine();
}

/** Every open posting in a town — the notice board's list. */
export function boardPostings(st, town) {
  if (!st) return [];
  const roles = TOWN_ROLES[town] || {};
  for (const id of new Set(Object.values(roles))) postingsFor(st, id);
  const out = [];
  for (const list of Object.values(W(st).postings)) for (const p of list) if (!p.taken && p.town === town) out.push(p);
  // A board holds what fits on it: the trouble of the day first, then the freshest notices.
  return out.sort((a, b) => (b.event ? 1 : 0) - (a.event ? 1 : 0) || b.day - a.day).slice(0, 12);
}

/** Proclamations for a town's board: the notices the running events would nail up. */
export function boardNotices(st, town) {
  if (!st) return [];
  const out = [];
  for (const ev of W(st).events) {
    const tpl = tplOf(ev);
    if (!tpl || !(tpl.towns.includes(town) || tpl.maps.includes(town))) continue;
    const s = tpl.stages[ev.stage];
    const text = fill((s && s.notice) || '', ev.vars);
    if (text) out.push({ id: `${ev.id}:${s.id}`, title: ev.name, text, event: ev.id });
  }
  const m = MARKETS[town];
  if (m) {
    const c = calendarOf(st.day);
    const days = ((m.day - c.tendayDay) + 10) % 10;
    out.push({ id: `market:${town}`, title: cap(m.name), text: days === 0 ? `Today: ${m.name}. Stalls from dawn.` : `Next ${m.name} in ${days} day${days === 1 ? '' : 's'}.` });
  }
  const reg = regionOf(town);
  const ctl = reg && regionControl(st, reg);
  if (ctl) out.push({ id: `control:${reg}`, title: `Who holds ${ctl.name}`, text: `${cap(ctl.holderName)} hold the most sway in ${ctl.name}.` });
  return out;
}

/** Accept an offered quest. Returns the live quest, or null. */
export function acceptQuest(st, questId) {
  if (!st) return null;
  const w = W(st);
  let posting = null;
  for (const list of Object.values(w.postings)) { const p = list.find((x) => x.id === questId); if (p) { posting = p; break; } }
  if (!posting || posting.taken) return null;
  const def = posting.def;
  const q = startQuest(st, def);
  if (!q) return null;
  posting.taken = true;
  w.quests[def.id] = { event: def.event, giver: def.giver, day: st.day, exclusive: def.exclusive, title: def.title };
  if (def.reveals) discoverSite(st, def.reveals, 'quest');
  if (def.site && SITES[def.site.map]) discoverSite(st, def.site.map, 'quest');
  if (def.start && def.start.give) { try { Party.addItem(def.start.give, 1); } catch (e) { /* headless */ } }
  noteDeed(st, { kind: 'accept', questId: def.id, faction: def.faction, npcId: def.giver, mapId: def.map, tags: def.crime ? ['crime', def.kind] : [def.kind] });
  catchUp(st, q);
  return q;
}

/** Steps whose condition is already true when their phase opens (you were already there, already hold it). */
function catchUp(st, q) {
  if (!q || !q.def || !q.def.ordered) return;
  for (let guard = 0; guard < 6; guard++) {
    const floor = currentPhase(q);
    if (floor == null) return;
    let moved = false;
    for (const s of q.steps) {
      if (s.done || (s.phase || 0) !== floor) continue;
      if (s.kind === 'reach' && st.mapId === s.target) { progressQuests(st, 'reach', s.target, 1); moved = true; }
      else if (s.kind === 'flag' && hasFlag(st, s.target)) { progressQuests(st, 'flag', s.target, 1); moved = true; }
      else if (s.kind === 'collect' && heldCount(s.target) > 0) { progressQuests(st, 'collect', s.target, heldCount(s.target)); moved = true; }
    }
    if (!moved) return;
  }
}
function heldCount(id) {
  try {
    return Party.countItem(id) + Party.members.reduce((a, m) => a + arr(m && m.inventory).reduce((b, e) => b + (e.id === id ? (e.qty || 1) : 0), 0), 0);
  } catch (e) { return 0; }
}

/** Active director quests waiting on this person: a report to make, a thing to hand over. */
export function reportsFor(st, npcId) {
  if (!st || !npcId) return [];
  const out = [];
  for (const q of st.quests.active) {
    if (!q.def || !q.def.director) continue;
    const floor = currentPhase(q);
    for (const s of q.steps) {
      if (s.done || (s.phase || 0) !== floor || s.target !== npcId) continue;
      if (s.kind !== 'report' && s.kind !== 'deliver') continue;
      out.push({ quest: q, step: s, needs: s.kind === 'deliver' ? (s.item || null) : null, has: s.item ? heldCount(s.item) > 0 : true });
    }
  }
  return out;
}

/** Make a report / hand something over. Returns { ok, text }. */
export function makeReport(st, questId, npcId) {
  const q = st && st.quests.active.find((x) => x.id === questId);
  if (!q) return { ok: false, text: '' };
  const rep = reportsFor(st, npcId).find((x) => x.quest === q);
  if (!rep) return { ok: false, text: '' };
  if (rep.needs && !rep.has) return { ok: false, text: `You do not have the ${itemName(rep.needs)} with you.` };
  if (rep.needs) { try { Party.removeItem(rep.needs, 1); } catch (e) { /* headless */ } }
  progressQuests(st, rep.step.kind, npcId, 1);
  settleQuests(st);
  const bd = q.def.faction && FACTION_CONTRACTS[q.def.faction];
  return { ok: true, text: (bd && bd.lines.done) || 'It is done. You will be paid.' };
}

/** Finish every director quest whose steps are all done; open later phases that are already satisfied. */
export function settleQuests(st) {
  if (!st) return;
  for (const q of st.quests.active.slice()) {
    if (!q.def || !q.def.director) continue;
    catchUp(st, q);
    if (q.steps.every((s) => s.done)) finishQuest(st, q);
  }
}

function finishQuest(st, q) {
  const def = q.def;
  const w = W(st);
  if (!completeQuest(st, q.id)) return;
  const rw = def.rewards || {};
  try {
    if (rw.gold) { Party.addGold(rw.gold); st.stats.goldEarned = (st.stats.goldEarned || 0) + rw.gold; }
    for (const it of rw.items || []) Party.addItem(it.id, it.qty || 1);
  } catch (e) { /* headless */ }
  if (rw.xp) { try { xpHandler(rw.xp); } catch (e) { /* ignore */ } }
  for (const r of rw.rep || []) addReputation(st, r.id, r.amount);
  if (def.flag) setFlag(st, def.flag, true);
  noteDeed(st, {
    kind: 'quest', questId: def.id, faction: def.faction, npcId: def.giver, mapId: def.map,
    weight: def.event ? 3 : 2, tags: [def.kind, 'paid'].concat(def.crime ? ['crime'] : []),
  });
  chronicleAdd(st, st.day, 'party', `${def.title} — done for ${def.giverName || npcName(def.giver)}.`, { quest: def.id });
  const bits = [rw.gold ? `${rw.gold} gp` : null, rw.xp ? `${rw.xp} XP` : null].filter(Boolean).join(', ');
  // The HUD already announces the completion itself (EV.QUEST_DONE); this is the purse.
  if (bits) bus.emit(EV.TOAST, { text: `Paid: ${bits}`, kind: 'quest' });

  if (def.exclusive) {
    for (const other of st.quests.active.slice()) {
      if (other.def && other.def.exclusive === def.exclusive && other.id !== q.id) {
        failQuest(st, other.id);
        chronicleAdd(st, st.day, 'party', `${other.title}: overtaken by events.`, { quest: other.id });
      }
    }
    for (const list of Object.values(w.postings)) for (const p of list) if (p.def.exclusive === def.exclusive) p.taken = true;
  }
  if (def.followup) {
    const ev = def.event ? w.events.find((e) => e.id === def.event) : null;
    const spec = { ...def.followup, giver: def.followup.giver && def.followup.giver.startsWith('{') ? def.giver : (def.followup.giver || def.giver) };
    const next = buildQuest(st, spec, { ev, until: ev ? eventEndsBy(ev) : st.day + 10, salt: `follow:${def.id}` });
    if (next) {
      if (ev) { ev.quests.push(next.id); ev.stageEnd = Math.max(ev.stageEnd, st.day + 4); }
      addPosting(st, next, st.day, ev ? eventEndsBy(ev) : st.day + 10);
      bus.emit(EV.TOAST, { text: `${npcName(next.giver)} has more for you: ${next.title}`, kind: 'quest' });
    }
  }
  if (def.site && def.site.captive && hasFlag(st, `dq:${def.id}:freed`)) {
    const home = NPCS[def.giver] ? NPCS[def.giver].map : null;
    if (home) {
      w.visitors.push({ id: `v:${def.id}`, map: townOf(home) === home ? home : (townOf(home) || home), name: def.site.captive.name,
        sprite: def.site.captive.sprite, line: `You brought me home. I will not forget it — and neither will anyone in ${townName(townOf(home))}, if I have anything to say about it.`,
        until: st.day + 6 });
    }
  }
  if (def.event && def.resolves) resolveEvent(st, def.event, def.outcome || 'resolved');
}

/** A staged pack on a quest's site was beaten: the fight is the objective, however many ran. */
export function sitePackBroken(st, questId) {
  const q = st && st.quests.active.find((x) => x.id === questId);
  if (!q) return;
  for (const s of q.steps) {
    if (s.done || s.kind !== 'kill') continue;
    const left = (s.count || 1) - (s.progress || 0);
    if (left > 0) progressQuests(st, 'kill', s.target, left);
  }
  // Breaking the thing that lived in a site empties the site, and it renews in weeks, as a lair does.
  const S = q.def.site && SITES[q.def.site.map];
  if (S && ['clear', 'rescue', 'retrieve'].includes(q.def.kind)) lairCleared(st, S.id);
  settleQuests(st);
}

/** An event's raiders were beaten in the field. Two such fights end the trouble in the party's favour. */
export function eventPackBroken(st, evId) {
  const ev = st && W(st).events.find((e) => e.id === evId);
  if (!ev) return;
  ev.pressure = (ev.pressure || 0) + 1;
  chronicleAdd(st, st.day, 'party', `Broke a band of ${ev.name.toLowerCase().includes('goblin') ? 'raiders' : 'them'} in the field — ${ev.name}.`, { event: ev.id });
  noteDeed(st, { kind: 'help', target: ev.tpl, weight: 2, mapId: st.mapId, tags: ['event'] });
  if (ev.pressure >= 2 && !ev.quests.some((qid) => st.quests.active.some((q) => q.id === qid))) resolveEvent(st, ev.id, 'resolved');
}

/** Quest-driven negotiation: the party brought the other side to terms (or failed to). */
export function negotiationResult(st, questId, ok, how) {
  const q = st && st.quests.active.find((x) => x.id === questId);
  if (!q) return;
  if (ok) {
    setFlag(st, `dq:${questId}:agreed`, true);
    const kinds = { persuade: 'persuade', intimidate: 'threaten', deceive: 'lie', bribe: 'bribe' };
    noteDeed(st, { kind: kinds[how] || 'persuade', questId, npcId: q.def.site && q.def.site.with && q.def.site.with.npc, weight: 1 });
  } else {
    failQuest(st, questId);
    chronicleAdd(st, st.day, 'party', `${q.title}: they would not be moved.`, { quest: questId });
    noteDeed(st, { kind: 'questFail', questId, faction: q.def.faction, weight: 2 });
  }
}

/** The party gives a director quest up. The giver remembers; the trouble goes on without you. */
export function abandonQuest(st, questId) {
  const q = st && st.quests.active.find((x) => x.id === questId);
  if (!q || !q.def || !q.def.director) return false;
  failQuest(st, questId);
  chronicleAdd(st, st.day, 'party', `${q.title}: given up.`, { quest: questId });
  noteDeed(st, { kind: 'questFail', questId, faction: q.def.faction, npcId: q.def.giver, weight: 1, tags: ['abandoned'] });
  return true;
}

/** What the party should do next on a director quest, in a sentence. */
export function nextStepText(q) {
  if (!q || !q.steps) return '';
  const floor = currentPhase(q);
  const s = q.steps.find((x) => !x.done && (x.phase || 0) === floor);
  return s ? s.text : '';
}

// ===========================================================================
// 10. RUMOURS
// ===========================================================================

function resolveNpc(npc) {
  if (!npc) return null;
  if (typeof npc === 'string') {
    const rec = NPCS[npc];
    return rec ? { id: npc, name: rec.name, role: rec.role, tag: rec.tag, faction: rec.faction, map: rec.map } : { id: npc, name: titleCase(npc), role: 'flavor', map: null };
  }
  const id = npc.npcId || npc.id;
  const rec = NPCS[id] || (npc.npc && NPCS[npc.npc.id]) || null;
  return {
    id: id || 'stranger', name: npc.name || (rec && rec.name) || 'Stranger',
    role: npc.role && npc.role !== 'flavor' ? npc.role : (rec ? rec.role : npc.role || 'flavor'),
    tag: npc.tag || (rec && rec.tag) || null, faction: npc.faction || (rec && rec.faction) || null,
    map: (rec && rec.map) || (npc.map && npc.map.id) || npc.mapId || null,
  };
}
function profileOf(who) {
  if (who.tag === 'child') return KNOWLEDGE.child;
  if (who.tag === 'traveller') return KNOWLEDGE.traveller;
  if (who.tag === 'villain' || who.role === 'villain') return KNOWLEDGE.villain;
  return KNOWLEDGE[who.role] || KNOWLEDGE.flavor;
}
function inReach(reach, whoTown, whoRegion, towns, maps) {
  if (reach === 'far') return true;
  const ts = new Set(arr(towns));
  for (const m of arr(maps)) { const t = townOf(m); if (t) ts.add(t); }
  if (whoTown && ts.has(whoTown)) return true;
  if (reach === 'region') {
    for (const t of ts) if (regionOf(t) && regionOf(t) === whoRegion) return true;
    for (const m of arr(maps)) if (regionOf(m) && regionOf(m) === whoRegion) return true;
  }
  return false;
}
function partyLabel(st) {
  const co = st.factions && st.factions.company && st.factions.company.name;
  if (co) return co;
  let lead = null;
  try { lead = Party.members[0] && Party.members[0].name; } catch (e) { lead = null; }
  return lead ? `${lead} and that company of theirs` : 'a company of adventurers';
}
function deedTargetName(st, d) {
  if (d.kind === 'quest' || d.kind === 'questFail') {
    const t = (W(st).quests[d.questId] || {}).title || (st.quests.active.find((x) => x.id === d.questId) || {}).title;
    return t ? `the business of ${t.replace(/^(The|A|An) /, (m) => m.toLowerCase())}` : 'that business';
  }
  if (d.kind === 'discover' && SITES[d.target]) return SITES[d.target].name;
  if (d.kind === 'found') return d.target || 'a company';
  if (d.target && MONSTERS[d.target]) return MONSTERS[d.target].boss ? MONSTERS[d.target].name : `a pack of ${plural(monName(d.target)).toLowerCase()}`;
  if (d.npcId && NPCS[d.npcId]) return NPCS[d.npcId].name;
  if (d.target && NPCS[d.target]) return NPCS[d.target].name;
  return d.target ? titleCase(d.target) : 'someone';
}

/** Deeds the Coast will repeat. */
const GOSSIP_KINDS = new Set(['rescue', 'murder', 'found', 'quest', 'questFail', 'desecrate', 'discover', 'crime', 'charity']);

function onDeedHeard(d, st) {
  if (!st || !d || !DEED_RUMORS[d.kind]) return;
  const notable = (d.weight | 0) >= 3 || GOSSIP_KINDS.has(d.kind) || (d.kind === 'kill' && MONSTERS[d.target] && (MONSTERS[d.target].boss || MONSTERS[d.target].cr >= directorLevel(st) + 2));
  if (!notable) return;
  const w = W(st);
  const map = d.mapId || st.mapId;
  w.gossip.push({ key: `deed:${d.seq}`, kind: d.kind, day: d.day, map, town: townOf(map), target: d.target || null, questId: d.questId || null,
    npcId: d.npcId || null, weight: d.weight | 0, name: deedTargetName(st, d) });
  if (w.gossip.length > GOSSIP_MAX) w.gossip.splice(0, w.gossip.length - GOSSIP_MAX);
  if ((d.weight | 0) >= 3 && d.kind === 'kill') chronicleAdd(st, d.day, 'party', `Slew ${deedTargetName(st, d)} ${placeFor(st, map).prep}.`, { deed: d.seq });
  if (d.kind === 'murder' || d.kind === 'desecrate' || d.kind === 'rescue' || d.kind === 'found') {
    const t = fill(DEED_RUMORS[d.kind].true[0], { party: 'The party', target: deedTargetName(st, d), place: placeName(map) });
    chronicleAdd(st, d.day, 'party', cap(t), { deed: d.seq });
  }
}

function familyText(fam, truth) {
  if (!fam) return null;
  const list = fam[truth] && fam[truth].length ? fam[truth] : fam.true;
  return list && list.length ? list : null;
}

function candidates(st, who, prof, whoTown, whoRegion) {
  const w = W(st);
  const lvl = directorLevel(st);
  const out = [];
  const tagBoost = (tags) => (!prof.tags ? 1 : (arr(tags).some((t) => prof.tags.includes(t)) ? 2 : 0.6));

  // News travels at the pace of carters: a day to reach the next street, a few
  // to reach the region, most of a tenday to be told in another city. A big
  // enough fright (a dragon, a cult) travels faster.
  const RANK = { local: 0, region: 1, far: 2 };
  const reachAfter = (age, boost = 0) => { const a = age + boost; return a >= 5 ? 'far' : a >= 2 ? 'region' : 'local'; };
  const narrower = (a, b) => (RANK[a] <= RANK[b] ? a : b);

  // --- the world's events, running and recent --------------------------------
  for (const ev of w.events) {
    const tpl = tplOf(ev);
    const eff = narrower(prof.reach, reachAfter(st.day - ev.started, ev.festival ? 5 : (tpl && tpl.severity > 1 ? 2 : 0)));
    if (!tpl || !inReach(eff, whoTown, whoRegion, tpl.towns, tpl.maps)) continue;
    const s = tpl.stages[ev.stage];
    let fam;
    let vars = ev.vars;
    if (ev.festival) {
      if (s && s.id === 'after') continue;
      fam = FESTIVAL_RUMORS;
      vars = { ...ev.vars, eve: (FESTIVALS[ev.tpl] && (s.id === 'eve' ? FESTIVALS[ev.tpl].eve : FESTIVALS[ev.tpl].text)) || '', festival: tpl.name };
    } else {
      const byTpl = EVENT_RUMORS[ev.tpl] || {};
      fam = byTpl[s && s.id] || byTpl['*'] || (s && s.text ? { true: [s.text] } : null);
    }
    if (!fam) continue;
    const posting = Object.values(w.postings).flat().find((p) => !p.taken && p.event === ev.id);
    out.push({ key: `ev:${ev.id}:${s ? s.id : ''}`, kind: ev.festival ? 'festival' : 'event', fam, vars,
      weight: (ev.festival ? 1.5 : 3) * tagBoost(tpl.tags), points: { event: ev.id, quest: posting ? posting.id : null, giver: posting ? posting.def.giver : null } });
  }
  for (const e of w.ended) {
    if (st.day - e.day > 8 || !e.text || e.festival) continue;
    const tpl = EVENTS[e.tpl];
    if (!tpl || !inReach(narrower(prof.reach, reachAfter(st.day - e.day)), whoTown, whoRegion, tpl.towns, tpl.maps)) continue;
    out.push({ key: `end:${e.id}`, kind: 'event', fam: { true: [e.text] }, vars: {}, weight: 2 * tagBoost(tpl.tags), points: {} });
  }

  // --- the lairs in the hills -------------------------------------------------
  for (const S of Object.values(SITES)) {
    if (isSiteKnown(st, S.id) || lvl < S.band[0] - 2) continue;
    if (!inReach(prof.reach, whoTown, whoRegion, [townOf(S.host)], [S.host])) continue;
    const fam = SITE_RUMORS[S.id];
    if (!fam) continue;
    out.push({ key: `site:${S.id}`, kind: 'site', fam, vars: {}, weight: 1.6, points: { site: S.id } });
  }

  // --- the party's own doings, spreading at a walking pace ---------------------
  // The freshest few, and loud ones louder; a town talks about last week's
  // rescue, not every errand the party ever ran.
  const heardOf = [];
  for (let i = w.gossip.length - 1; i >= 0 && heardOf.length < 5; i--) {
    const g = w.gossip[i];
    const age = st.day - g.day;
    if (!inReach(narrower(prof.reach, reachAfter(age)), whoTown, whoRegion, [g.town], [g.map])) continue;
    heardOf.push(g);
    if (g.kind === 'renewal') {
      const S = SITES[g.site]; const grp = MONSTER_GROUPS[g.group];
      out.push({ key: g.key, kind: 'site', fam: RENEWAL_RUMORS, vars: { site: S ? S.name : 'the old lair', group: grp ? grp.name : 'something' }, weight: 1.5, points: {} });
      continue;
    }
    out.push({ key: g.key, kind: 'deed', fam: DEED_RUMORS[g.kind], vars: { party: partyLabel(st), target: g.name || 'someone', place: placeName(g.map) },
      weight: (0.8 + Math.min(4, g.weight) * 0.35) / (1 + age / 6), points: {} });
  }

  // --- who holds the town ------------------------------------------------------
  if (whoRegion && REGIONS[whoRegion]) {
    const ctl = regionControl(st, whoRegion);
    const recent = w.controlLog.filter((c) => c.region === whoRegion && st.day - c.day <= 10 && Math.abs(c.delta) >= 5).slice(-1)[0];
    if (recent) {
      out.push({ key: `ctl:${whoRegion}:${recent.day}:${recent.power}`, kind: 'faction', fam: FACTION_RUMORS[recent.delta > 0 ? 'gain' : 'loss'],
        vars: { power: POWER_NAMES[recent.power] || recent.power, region: REGIONS[whoRegion].name }, weight: 2, points: {} });
    }
    out.push({ key: `hold:${whoRegion}:${ctl.holder}`, kind: 'faction', fam: FACTION_RUMORS.hold, vars: { power: ctl.holderName, region: ctl.name }, weight: 0.6, points: {} });
  }

  // --- prices -----------------------------------------------------------------
  if (whoTown) {
    const mod = eventPriceModifiers(st, whoTown);
    for (const [cat, f] of Object.entries(mod.mult)) {
      if (cat === '*' || (f < 1.15 && f > 0.9)) continue;
      const note = mod.notes.find((n) => n.cats.includes(cat));
      const why = note ? note.text.replace(/\.$/, '') : 'nobody will say why';
      out.push({ key: `trade:${whoTown}:${cat}:${f}`, kind: 'trade', fam: TRADE_RUMORS[f >= 1.15 ? 'dear' : 'cheap'],
        vars: { cat: CATEGORY_WORDS[cat] || cat, town: townName(whoTown), why: joinOpener(' ', why).trim() }, weight: 1.2, points: {} });
    }
  }

  // --- the taproom's standing stories (data/tables.js) --------------------------
  for (const t of TAVERN_RUMORS) {
    if (!t || t.minLevel > lvl + 1) continue;
    const where = t.where || 'phandalin';
    if (where !== who.map && townOf(where) !== whoTown) continue;
    if (t.flag && !hasFlag(st, t.flag)) continue;
    const taken = t.quest && (st.quests.active.some((q) => q.id === t.quest) || st.quests.done.includes(t.quest));
    out.push({ key: `tab:${t.id}`, kind: 'static', fam: { true: [t.text] }, vars: {}, weight: taken ? 0.3 : 1, points: { quest: taken ? null : t.quest || null, giver: !taken && t.quest && QUESTS[t.quest] ? QUESTS[t.quest].giver || null : null } });
  }
  return out;
}

/**
 * What a given NPC would plausibly tell you today: rumours drawn from what
 * reaches their town and suits their trade, some of them wrong, some of them
 * grown in the telling. Stable for a person across one day.
 */
export function rumorsFor(st, npc, { count = null, day = null } = {}) {
  if (!st) return [];
  advanceDirector(st);
  const who = resolveNpc(npc);
  if (!who) return [];
  const prof = profileOf(who);
  const whoTown = townOf(who.map) || townOf(st.mapId);
  const whoRegion = regionOf(who.map) || regionOf(st.mapId);
  const pool = candidates(st, who, prof, whoTown, whoRegion);
  const w = W(st);
  const d = day != null ? day : st.day;
  const r = rngFor(st, 'rumors', who.id, d);
  const want = count || prof.count;
  const out = [];
  const left = pool.slice();
  while (out.length < want && left.length) {
    const c = r.pickWeighted(left, (x) => x.weight * ((prof.kinds[x.kind] || 0.3)) * (w.heard[x.key] ? 0.35 : 1));
    left.splice(left.indexOf(c), 1);
    const roll = unit(st, 'truth', who.id, c.key);
    let truth = 'true';
    if (c.fam.false && roll < prof.lie) truth = 'false';
    else if (c.fam.exaggerated && roll < prof.lie + 0.22) truth = 'exaggerated';
    const lines = familyText(c.fam, truth);
    if (!lines) continue;
    const line = fill(lines[Math.floor(unit(st, 'line', who.id, c.key) * lines.length)], c.vars);
    // Nobody gossips about themselves in the third person.
    if (who.name && who.name !== 'Stranger' && line.includes(who.name)) continue;
    // A line that opens on a name ("Carters on the Trail...", "Linene lost...")
    // cannot follow "Word is"; it takes an opener that ends in a stop, or none.
    const first = line.split(/[\s,']/)[0] || '';
    const named = /^[A-Z]/.test(first) && !COMMON_OPENING.has(first.toLowerCase());
    const openers = (OPENERS[truth] || OPENERS.true).filter((o) => !named || !o || /[:?—]\s$/.test(o));
    const opener = openers[Math.floor(unit(st, 'open', who.id, c.key) * openers.length)] || '';
    const text = joinOpener(opener, line);
    if (out.some((o) => o.text === text || o.key === c.key)) continue;
    out.push({ key: c.key, kind: c.kind, truth, text, points: truth === 'true' ? c.points : {}, liar: prof === KNOWLEDGE.villain });
  }
  return out;
}

/** What an Insight check reads in the teller. */
export function insightInto(st, rumor) {
  const list = rumor && rumor.liar ? INSIGHT.lie : INSIGHT[(rumor && rumor.truth) || 'true'];
  return list[Math.floor(unit(st, 'insight', rumor ? rumor.key : '') * list.length)] || list[0];
}

/**
 * The party heard it. Remembers it (the journal lists heard rumours), and acts
 * on a true one: a site it describes is found, and the person paying for the
 * trouble it concerns is named. Returns { discovered?, lead? }.
 */
export function hearRumor(st, npc, rumor) {
  if (!st || !rumor) return {};
  const w = W(st);
  const who = resolveNpc(npc);
  const first = !w.heard[rumor.key];
  w.heard[rumor.key] = st.day;
  const keys = Object.keys(w.heard);
  if (keys.length > 500) for (const k of keys.slice(0, keys.length - 500)) delete w.heard[k];
  if (first) {
    st.rumors = Array.isArray(st.rumors) ? st.rumors : [];
    st.rumors.push({ text: rumor.text, day: st.day, from: who ? who.name : null, key: rumor.key });
    if (st.rumors.length > JOURNAL_RUMORS) st.rumors.splice(0, st.rumors.length - JOURNAL_RUMORS);
  }
  const res = {};
  const p = rumor.points || {};
  if (p.site && !isSiteKnown(st, p.site)) { discoverSite(st, p.site, 'rumor'); res.discovered = SITES[p.site].name; }
  if (p.quest && p.giver) res.lead = { giver: p.giver, giverName: npcName(p.giver), quest: p.quest };
  return res;
}

// ===========================================================================
// 11. WHAT THE MAP SHOULD HOLD — read by world/sites.js
// ===========================================================================

/**
 * Everything the director wants staged on a map right now, as plain specs.
 * world/sites.js decides the tiles and makes the entities; the `key` of each
 * spec is stable, so re-entering a map never doubles anything.
 */
export function spawnsFor(st, mapId) {
  if (!st || !mapId) return [];
  const w = W(st);
  const out = [];

  // --- quest sites ------------------------------------------------------------
  for (const q of st.quests.active) {
    const def = q.def;
    if (!def || !def.director || !def.site) continue;
    const S = def.site;
    const floor = currentPhase(q);
    const killsLeft = q.steps.some((s) => s.kind === 'kill' && !s.done);
    if (S.map === mapId) {
      if (S.pack && killsLeft && !(def.kind === 'investigate' && !hasFlag(st, `dq:${q.id}:clue`))) {
        out.push({ key: `dq:${q.id}:pack`, type: 'pack', quest: q.id, monsters: S.pack.map((e) => ({ ...e })), lead: S.lead, boss: !!S.boss,
          title: S.lead ? `${S.lead}` : null, placement: S.town ? 'town' : 'far' });
      }
      if (S.captive && !hasFlag(st, `dq:${q.id}:freed`)) {
        out.push({ key: `dq:${q.id}:captive`, type: 'npc', role: 'captive', quest: q.id, name: S.captive.name, sprite: S.captive.sprite || 'npc-villager-m',
          guarded: killsLeft, placement: 'far' });
      }
      if (S.clue && ((def.kind === 'investigate' && !hasFlag(st, `dq:${q.id}:clue`)) || (S.gather && S.item && heldCount(S.item.id) === 0))) {
        out.push({ key: `dq:${q.id}:clue`, type: 'clue', quest: q.id, text: S.clue.text, skill: S.clue.skill, dc: S.clue.dc,
          item: S.gather && S.item ? S.item.id : null, tile: S.gather ? 'BERRY_BUSH' : def.kind === 'investigate' && /wagon|wheel|rut/i.test(S.clue.text) ? 'CART' : 'CRATE',
          placement: S.town ? 'town' : 'far' });
      }
      if (def.kind === 'retrieve' && !S.gather && S.item && heldCount(S.item.id) === 0 && !q.steps.some((s) => s.kind === 'collect' && s.done)) {
        out.push({ key: `dq:${q.id}:cache`, type: 'cache', quest: q.id, item: S.item.id, placement: 'far' });
      }
      if (def.kind === 'negotiate' && S.with && !S.with.npc && !hasFlag(st, `dq:${q.id}:agreed`)) {
        out.push({ key: `dq:${q.id}:with`, type: 'npc', role: 'negotiator', quest: q.id, name: S.with.name, sprite: S.with.sprite || 'npc-merchant', placement: 'town' });
      }
    }
    void floor;
  }

  // --- the running events' raiders and visitors --------------------------------
  for (const ev of w.events) {
    const tpl = tplOf(ev);
    const s = tpl && tpl.stages[ev.stage];
    if (!s) continue;
    (s.packs || []).forEach((p, i) => {
      if (p.map !== mapId || !MONSTER_GROUPS[p.group]) return;
      out.push({ key: `ev:${ev.id}:${s.id}:${i}`, type: 'pack', event: ev.id, group: p.group, title: p.title || MONSTER_GROUPS[p.group].name, placement: 'far' });
    });
    // The people a trouble brings to town: the caravan master, the burned-out steader, the herald.
    (s.visitors || []).forEach((v, i) => {
      if (v.map !== mapId) return;
      out.push({ key: `ev:${ev.id}:${s.id}:v${i}`, type: 'npc', role: 'visitor', event: ev.id, name: fill(v.name, ev.vars), sprite: v.sprite,
        line: fill(v.line, ev.vars), placement: 'town' });
    });
  }
  for (const v of visitorsFor(st, mapId)) out.push({ key: v.id, type: 'npc', role: 'visitor', name: v.name, sprite: v.sprite, line: v.line, placement: 'town' });

  // --- landmarks: trails out of host maps, and the lair and the way home inside --
  for (const { id, site, known } of sitesHostedBy(st, mapId)) {
    if (known) out.push({ key: `trail:${id}`, type: 'trail', site: id, to: site.map, text: site.trail, sign: site.name });
  }
  const S = siteOfMap(mapId);
  if (S) {
    const lair = lairFor(st, mapId);
    // Whatever a quest sent you after IS the occupant while it is here: never a second pack beside it.
    const questHere = out.some((o) => o.type === 'pack' && o.quest);
    if (lair && !lair.cleared && !questHere) out.push({ key: lair.key, type: 'lair', site: S.id, group: lair.group, title: lair.name, placement: 'far' });
    out.push({ key: `exit:${S.id}`, type: 'exit', site: S.id, to: S.host });
    if (lair) out.push({ key: `hoard:${S.id}:${lair.gen}`, type: 'hoard', site: S.id, gen: lair.gen, level: directorLevel(st), placement: 'far' });
  }

  // --- the notice board -----------------------------------------------------
  if (TOWN_ROLES[mapId] || (mapId.startsWith('bg-the-wide'))) out.push({ key: `board:${mapId}`, type: 'board', town: townOf(mapId) || mapId });
  return out;
}

// ===========================================================================
// 12. WIRING
// ===========================================================================

let installed = false;
let getState = () => null;
let settleQueued = false;

function queueSettle() {
  if (settleQueued) return;
  settleQueued = true;
  // progressQuests is mid-loop over st.quests.active when it emits; finishing a
  // quest inside that loop would splice the array under it. Settle just after.
  Promise.resolve().then(() => {
    settleQueued = false;
    const st = getState();
    if (st) settleQuests(st);
  });
}

/**
 * The news reaching the party: world happenings since it last heard, near
 * where it stands (its region or town) or grave enough to travel (severity 3,
 * the dark stirrings). A quiet world says nothing; a busy one says at most
 * two things a day, so the log is the place to read the rest. Returns what was said.
 */
export function announceNews(st) {
  if (!st) return [];
  const w = W(st);
  const since = w.director.newsDay != null ? w.director.newsDay : st.day - 1;
  w.director.newsDay = st.day;
  const town = townOf(st.mapId) || st.lastTown || null;
  const region = regionOf(st.mapId) || regionOf(town);
  const said = [];
  for (const c of w.chronicle) {
    if (c.day <= since || c.kind !== 'world' || !c.text) continue;
    const tpl = EVENTS[c.tpl] || (c.tpl && FESTIVALS[c.tpl] ? festivalTpl(c.tpl) : null);
    const near = tpl && ((tpl.region && tpl.region === region) || (town && (tpl.towns || []).includes(town)) || (tpl.severity || 1) >= 3 || tpl.dark);
    if (!near && !(c.site && SITES[c.site] && regionOf(SITES[c.site].host) === region)) continue;
    said.push(c);
  }
  for (const c of said) bus.emit(EV.LOG, { text: `News: ${c.text}`, kind: 'news' });
  for (const c of said.slice(-2)) bus.emit(EV.TOAST, { text: c.text.length > 90 ? `${c.text.slice(0, 88).replace(/\s\S*$/, '')}…` : c.text, kind: 'news' });
  return said;
}

/**
 * Hook the director to the game. `getSt` returns the live state (Game.state);
 * opts.grantXp replaces the default XP award (main.js passes awardPartyXp so a
 * level-up shows its screen). Idempotent.
 */
export function installDirector(getSt, opts = {}) {
  getState = typeof getSt === 'function' ? getSt : () => getSt;
  if (opts.grantXp) xpHandler = opts.grantXp;
  if (installed) return;
  installed = true;
  bus.on(EV.DAY_CHANGE, () => { const st = getState(); if (st) { advanceDirector(st); announceNews(st); } });
  bus.on(EV.LOAD, (p) => { const st = (p && p.state) || getState(); if (st) advanceDirector(st); });
  bus.on(EV.MAP_ENTER, () => { const st = getState(); if (st) { advanceDirector(st); queueSettle(); } });
  bus.on(EV.FLAG_SET, (p) => { const st = getState(); if (st && p && p.name && p.value) progressQuests(st, 'flag', p.name, 1); });
  bus.on(EV.QUEST_STEP, () => queueSettle());
  bus.on(EV.ITEM_GAIN, () => queueSettle());
  onDeed((d, st) => onDeedHeard(d, st));
}

/** For headless runs and tests: pace the world as if the party were this level. */
export function setDirectorLevel(st, level) { W(st).director.levelOverride = level ? Math.max(1, level | 0) : null; }

/** A compact picture of the director for debugging and the sim. */
export function directorSummary(st) {
  const w = W(st);
  return {
    day: w.director.day, date: dateText(st.day), level: directorLevel(st),
    events: w.events.map((e) => ({ id: e.id, tpl: e.tpl, name: e.name, stage: tplOf(e).stages[e.stage] && tplOf(e).stages[e.stage].id, until: e.stageEnd })),
    postings: Object.values(w.postings).flat().filter((p) => !p.taken).map((p) => ({ id: p.id, giver: p.def.giver, title: p.def.title, kind: p.def.kind })),
    control: Object.fromEntries(Object.keys(REGIONS).map((k) => [k, regionControl(st, k).holder])),
    sites: Object.fromEntries(Object.entries(w.sites).map(([k, v]) => [k, { found: v.found, gen: v.gen, occupant: v.occupant, cleared: v.clearedDay }])),
  };
}
