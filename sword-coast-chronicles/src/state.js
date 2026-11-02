// state.js — the campaign save state: where you are, what you've done, and the
// bookkeeping that makes the world persistent between sessions.

import { bus, EV } from './core/events.js';
import { reseed, rng } from './core/rng.js';
import { Party } from './world/party.js';
import { VERSION, dateText, timeOfDay, clockText } from './constants.js';

export const STATE_VERSION = 1;

export function newGameState(seed) {
  const s = typeof seed === 'string' || typeof seed === 'number' ? seed : `sc-${Date.now()}`;
  const numeric = reseed(s);
  return {
    version: STATE_VERSION,
    gameVersion: VERSION,
    seed: s,
    worldSeed: numeric,
    createdAt: Date.now(),
    playtime: 0,

    // where the party stands
    mapId: 'phandalin',
    x: 24, y: 30, dir: 'down',
    lastTown: 'phandalin',
    lastSafe: { mapId: 'phandalin', x: 24, y: 30 },

    // the Calendar of Harptos — day 1 is 1 Mirtul
    day: 121,
    time: 480,                 // minutes past midnight; the story opens mid-morning
    weather: 'clear',
    weatherTimer: 0,

    // progress
    flags: {},
    quests: { active: [], done: [], failed: [], tracked: null },
    reputation: { harpers: 0, gauntlet: 0, 'emerald-enclave': 0, 'lords-alliance': 0, zhentarim: 0 },
    discovered: {},            // mapId -> [tile keys revealed on the minimap]
    visited: { phandalin: true },
    chests: {},                // "mapId:x,y" -> true once looted
    defeated: {},              // unique/boss ids already killed
    npcState: {},              // npcId -> { met, talkCount, node }
    // The bill for drawing steel on people who are not monsters. See rules/crime.js.
    // Reads are guarded, so a save written before this field existed still loads.
    crime: { bounty: {}, slain: {}, outlaw: {}, witnessed: 0, lastCrimeDay: 0, watchDue: {} },
    bestiary: {},              // monsterId -> kills (unlocks stat blocks)
    // Wilderness regions the party has thinned out: mapId -> { count, day }.
    // Four victories in one region quiets its roads for three days.
    cleared: {},
    depth: {},                 // endless dungeon progress, e.g. { undermountain: 0 }
    unlocked: { undermountain: false, neverwinter: false, waterdeep: false },
    shops: { restockDay: 121, stock: {} },

    stats: {
      kills: 0, steps: 0, battles: 0, crits: 0, fumbles: 0, goldEarned: 0,
      goldSpent: 0, deaths: 0, questsDone: 0, spellsCast: 0, chestsOpened: 0,
      damageDealt: 0, damageTaken: 0, healed: 0, longRests: 0, deepestFloor: 0,
    },

    settings: {},              // per-save overrides
  };
}

// --- flags & quests --------------------------------------------------------

export function setFlag(st, name, value = true) {
  st.flags[name] = value;
  bus.emit(EV.FLAG_SET, { name, value });
  return value;
}
export function getFlag(st, name) { return st.flags[name]; }
export function hasFlag(st, name) { return !!st.flags[name]; }

export function isQuestActive(st, id) { return st.quests.active.some((q) => q.id === id); }
export function isQuestDone(st, id) { return st.quests.done.includes(id); }
export function getQuest(st, id) { return st.quests.active.find((q) => q.id === id) || null; }

export function startQuest(st, questDef) {
  if (!questDef || isQuestActive(st, questDef.id) || isQuestDone(st, questDef.id)) return null;
  const q = {
    id: questDef.id,
    title: questDef.title,
    giver: questDef.giver,
    steps: (questDef.steps || []).map((s) => ({ ...s, progress: 0, done: false })),
    stepIndex: 0,
    generated: questDef.generated || false,
    def: questDef.generated ? questDef : null,   // procedural quests carry their own def
    startedDay: st.day,
  };
  st.quests.active.push(q);
  if (!st.quests.tracked) st.quests.tracked = q.id;
  bus.emit(EV.QUEST_START, { quest: q });
  return q;
}

/** Advance any active quest step matching (kind, target). Returns completed quests. */
export function progressQuests(st, kind, target, amount = 1) {
  const finished = [];
  for (const q of st.quests.active) {
    let changed = false;
    // A generated quest marked `ordered` (data/quests.js) only advances its
    // lowest unfinished phase, so "report back" cannot tick before the work.
    const floor = q.def && q.def.ordered ? currentPhase(q) : null;
    for (const step of q.steps) {
      if (step.done) continue;
      if (floor != null && (step.phase || 0) > floor) continue;
      if (step.kind !== kind) continue;
      if (step.target && step.target !== target) continue;
      step.progress = Math.min(step.count || 1, (step.progress || 0) + amount);
      if (step.progress >= (step.count || 1)) step.done = true;
      changed = true;
      break;                                   // one step at a time keeps ordering sane
    }
    if (changed) {
      bus.emit(EV.QUEST_STEP, { quest: q });
      if (q.steps.every((s) => s.done)) finished.push(q);
    }
  }
  return finished;
}

/** The lowest phase that still has an unfinished step (ordered quests only). */
export function currentPhase(q) {
  let lo = null;
  for (const s of (q && q.steps) || []) if (!s.done && (lo == null || (s.phase || 0) < lo)) lo = s.phase || 0;
  return lo;
}

export function completeQuest(st, id) {
  const i = st.quests.active.findIndex((q) => q.id === id);
  if (i < 0) return null;
  const [q] = st.quests.active.splice(i, 1);
  st.quests.done.push(id);
  st.stats.questsDone++;
  if (st.quests.tracked === id) st.quests.tracked = st.quests.active[0]?.id || null;
  bus.emit(EV.QUEST_DONE, { quest: q });
  return q;
}

export function failQuest(st, id) {
  const i = st.quests.active.findIndex((q) => q.id === id);
  if (i < 0) return null;
  const [q] = st.quests.active.splice(i, 1);
  st.quests.failed.push(id);
  bus.emit(EV.QUEST_FAIL, { quest: q });
  return q;
}

// --- factions --------------------------------------------------------------

export const REP_RANKS = [
  { at: 0, name: 'Unknown' }, { at: 10, name: 'Known' }, { at: 25, name: 'Trusted' },
  { at: 50, name: 'Respected' }, { at: 90, name: 'Honoured' }, { at: 150, name: 'Exalted' },
];

export function addReputation(st, faction, amount) {
  if (!(faction in st.reputation)) st.reputation[faction] = 0;
  st.reputation[faction] += amount;
  return st.reputation[faction];
}

export function repRank(value) {
  let r = REP_RANKS[0];
  for (const x of REP_RANKS) if (value >= x.at) r = x;
  return r.name;
}

// --- world clock -----------------------------------------------------------

/** Advance the in-game clock. Returns true when the day rolls over. */
export function advanceTime(st, minutes) {
  st.time += minutes;
  let rolled = false;
  while (st.time >= 1440) {
    st.time -= 1440;
    st.day++;
    rolled = true;
    bus.emit(EV.DAY_CHANGE, { day: st.day });
  }
  return rolled;
}

export function timeInfo(st) {
  return {
    clock: clockText(st.time),
    phase: timeOfDay(st.time),
    date: dateText(st.day),
    day: st.day,
    night: timeOfDay(st.time) === 'night',
  };
}

/** Roll new weather occasionally; biome decides what's plausible. */
export function tickWeather(st, dt, biome) {
  st.weatherTimer -= dt;
  if (st.weatherTimer > 0) return st.weather;
  st.weatherTimer = rng.float(90, 260);
  // `storm` is rain with lightning in it — rare, and only where a real squall
  // would come in off the Sea of Swords or roll over open ground.
  const table = {
    'pine-forest': [['clear', 5], ['rain', 3], ['fog', 2], ['snow', 1]],
    forest: [['clear', 6], ['rain', 3], ['fog', 1], ['storm', 1]],
    mountain: [['clear', 4], ['snow', 4], ['fog', 2]],
    tundra: [['snow', 6], ['clear', 3], ['fog', 1]],
    marsh: [['fog', 5], ['rain', 4], ['clear', 2], ['storm', 1]],
    coast: [['clear', 5], ['rain', 3], ['fog', 2], ['storm', 2]],
    'ash-waste': [['ash', 7], ['clear', 3]],
    city: [['clear', 7], ['rain', 3], ['storm', 1]],
    plains: [['clear', 7], ['rain', 2], ['fog', 1], ['storm', 1]],
    road: [['clear', 7], ['rain', 2], ['fog', 1], ['storm', 1]],
  }[biome] || [['clear', 8], ['rain', 2]];
  st.weather = rng.pickWeighted(table)[0];
  return st.weather;
}

// --- bestiary / stats ------------------------------------------------------

export function recordKill(st, monsterId) {
  st.bestiary[monsterId] = (st.bestiary[monsterId] || 0) + 1;
  st.stats.kills++;
  bus.emit(EV.KILL, { monsterId });
  progressQuests(st, 'kill', monsterId, 1);
}

export function chestKey(mapId, x, y) { return `${mapId}:${x},${y}`; }
export function isChestLooted(st, mapId, x, y) { return !!st.chests[chestKey(mapId, x, y)]; }
export function markChestLooted(st, mapId, x, y) { st.chests[chestKey(mapId, x, y)] = true; st.stats.chestsOpened++; }

// --- persistence -----------------------------------------------------------

export function saveState(st, serializeChar) {
  return {
    ...st,
    party: Party.serialize(serializeChar),
    rngCalls: rng.calls,
  };
}

export function loadState(obj, deserializeChar) {
  const st = { ...newGameState(obj.seed), ...obj };
  delete st.party;
  reseed(obj.seed);
  if (obj.rngCalls) rng.advance(obj.rngCalls);
  Party.load(obj.party, deserializeChar);
  // Earlier saves counted merely greeting Agatha/Garaele as receiving and
  // delivering the answer. Preserve travel progress; trust story flags for
  // these two objectives, and supply the gift old quest acceptance omitted.
  const agatha = getQuest(st, 'agathas-answer');
  if (agatha) {
    agatha.steps = agatha.steps.map((step, i) => {
      if (i !== 1 && i !== 2) return step;
      const target = i === 1 ? 'agatha-answered' : 'agatha-reported';
      const done = hasFlag(st, target);
      return { ...step, kind: 'flag', target, map: null, count: 1,
        text: i === 1 ? "Earn Agatha's courtesy and ask the Harpers' question" : 'Carry the answer back to the Shrine of Luck',
        progress: done ? 1 : 0, done };
    });
    if (!hasFlag(st, 'agatha-comb-received') && !hasFlag(st, 'agatha-answered')) {
      Party.addItem('silver-comb', 1);
      st.flags['agatha-comb-received'] = true;
    }
  }
  bus.emit(EV.LOAD, { state: st });
  return st;
}

/** Summary line for the load menu. */
export function stateSummary(st) {
  const lead = Party.members[0];
  return {
    name: lead?.name || 'Adventurer',
    level: Party.levelAvg(),
    playtime: st.playtime,
    mapName: st.mapId,
    partyNames: Party.members.map((m) => m.name),
    gold: Party.gold,
    date: dateText(st.day),
  };
}
