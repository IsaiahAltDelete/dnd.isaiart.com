// rules/scaling.js — encounter construction, monster scaling and loot. This is the
// engine room of the never-ending game: it turns a biome + a party level + an
// Undermountain depth into a real fight full of real Character objects, and turns the
// corpses back into coin.
//
// Design contract:
//   * Headless and deterministic. Every roll goes through core/dice.js / core/rng.js.
//     The same (seed, biome, level, depth) always builds the same encounter.
//   * Never mutates a data catalogue. Stat blocks are cloned before they are scaled.
//   * Defensive by contract: an empty bestiary, a missing loot table, an unknown id,
//     an absent optional block — all degrade to something sane, none of them throw.
//
// 2024 rules used here: the DMG "Encounter XP Budget per Character" table for
// difficulty, and the "Monster Statistics by Challenge Rating" table as the spine of
// level scaling.

import { rng, makeRNG, hashStr } from '../core/rng.js';
import { rollExpr, avgExpr, parseDice } from '../core/dice.js';
import { clamp, crText, RARITY } from '../constants.js';
import { ABILITIES, mod as abMod } from './abilities.js';
import { createCharacter, recalc, uid, isAlive } from './character.js';
import {
  MONSTER_GROUPS, BOSSES, getMonster, monstersByBiome, monstersByCR,
  groupsForBiome, bossesForTier, xpOf, xpForCR, profForCR,
} from '../data/monsters.js';
import {
  ITEMS, getItem, resolveItem, magicVariant, LOOT_TABLES, MAGIC_TIERS,
} from '../data/items.js';

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

const arr = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const lower = (s) => String(s == null ? '' : s).toLowerCase();
const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const slug = (s) => lower(s).replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'action';
const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));

// ===========================================================================
// TIERS
// ===========================================================================

/**
 * The four PHB tiers of play plus an endless fifth. Levels are inclusive. `mythic`
 * covers everything past 20, where progression.js hands out Epic Boons forever.
 */
export const TIERS = Object.freeze([
  Object.freeze({
    id: 1, name: 'Local Heroes', levels: [1, 4], magicTier: 'minor',
    crBand: [0, 4], depth: [0, 3],
    desc: 'Phandalin, the Triboar Trail and the goblin holds of the Sword Mountains.',
  }),
  Object.freeze({
    id: 2, name: 'Heroes of the Sword Coast', levels: [5, 10], magicTier: 'lesser',
    crBand: [1, 10], depth: [3, 9],
    desc: 'Cragmaw Castle, Thundertree, Wave Echo Cave and the roads to Neverwinter.',
  }),
  Object.freeze({
    id: 3, name: 'Masters of the North', levels: [11, 16], magicTier: 'greater',
    crBand: [5, 17], depth: [9, 18],
    desc: 'Icespire Peak, Kryptgarden Forest, the Mere of Dead Men and deep Undermountain.',
  }),
  Object.freeze({
    id: 4, name: 'Legends of Faerûn', levels: [17, 20], magicTier: 'major',
    crBand: [10, 24], depth: [18, 30],
    desc: "Waterdeep's great foes: dragons, liches and the Mad Mage's own court.",
  }),
  Object.freeze({
    id: 'mythic', name: 'Chosen of the Gods', levels: [21, Infinity], magicTier: 'major',
    crBand: [15, 30], depth: [30, Infinity],
    desc: 'Past mortal reckoning. Halaster still has stairs going down.',
  }),
]);

/** The tier a character level belongs to. Always returns an entry. */
export function tierFor(level) {
  const l = Math.max(1, Math.floor(num(level, 1)));
  for (const t of TIERS) if (l >= t.levels[0] && l <= t.levels[1]) return t;
  return TIERS[TIERS.length - 1];
}

// ===========================================================================
// PARTY LEVEL AND XP BUDGET
// ===========================================================================

/** Pull a Character[] out of whatever the caller passed as "party". */
function memberList(party) {
  if (!party) return [];
  if (Array.isArray(party)) return party.filter(Boolean);
  if (Array.isArray(party.members)) return party.members.filter(Boolean);
  if (Array.isArray(party.units)) return party.units.filter((u) => u && u.side !== 'foe');
  if (Array.isArray(party.party)) return party.party.filter(Boolean);
  return [];
}

/**
 * Average party level, rounded. Post-20 characters count their mythic tier on top so
 * the endless game keeps scaling after the level cap.
 */
export function partyLevel(party) {
  const list = memberList(party);
  if (!list.length) return 1;
  let total = 0;
  for (const ch of list) {
    total += Math.max(1, num(ch.level, 1)) + Math.max(0, num(ch.mythic?.tier ?? ch.mythicTier, 0));
  }
  return Math.max(1, Math.round(total / list.length));
}

/**
 * 2024 DMG "Encounter XP Budget per Character", by character level.
 * Columns: [low, moderate, high]. The fourth value is this game's deadly extension —
 * roughly 1.45x high, which is where a party starts losing people.
 */
export const XP_BUDGET = Object.freeze({
  1: [50, 75, 100], 2: [100, 150, 200], 3: [150, 225, 400], 4: [250, 375, 500],
  5: [500, 750, 1100], 6: [600, 1000, 1400], 7: [750, 1300, 1700], 8: [1000, 1700, 2100],
  9: [1300, 2000, 2600], 10: [1600, 2300, 3100], 11: [1900, 2900, 4100], 12: [2200, 3700, 4700],
  13: [2600, 4200, 5400], 14: [2900, 4900, 6200], 15: [3300, 5400, 7800], 16: [3800, 6100, 9800],
  17: [4500, 7200, 11700], 18: [5000, 8700, 14200], 19: [5500, 10700, 17200], 20: [6400, 13200, 22000],
});

/** Difficulty aliases: the UI says easy/medium/hard/deadly, the DMG says low/moderate/high. */
const DIFF_INDEX = Object.freeze({
  easy: 0, low: 0, medium: 1, moderate: 1, hard: 2, high: 2, deadly: 3,
});
export const DIFFICULTIES = Object.freeze(['easy', 'medium', 'hard', 'deadly']);

/** XP budget for one character of a level at a difficulty. */
export function budgetPerCharacter(level, difficulty = 'medium') {
  const l = clamp(Math.floor(num(level, 1)), 1, 20);
  const row = XP_BUDGET[l] || XP_BUDGET[1];
  const i = DIFF_INDEX[lower(difficulty)] ?? 1;
  // Deadly is an extension of the table, not a column in it.
  const base = i >= 3 ? Math.round(row[2] * 1.45) : row[i];
  // Past 20 the table runs out: keep climbing 18% a level so mythic play still scales.
  const over = Math.max(0, Math.floor(num(level, 1)) - 20);
  return Math.round(base * Math.pow(1.18, over));
}

/**
 * Total XP budget for an encounter.
 * `size` is the number of characters in the party (not the number of monsters).
 */
export function encounterBudget(level, size = 4, difficulty = 'medium') {
  const n = clamp(Math.floor(num(size, 4)), 1, 8);
  return budgetPerCharacter(level, difficulty) * n;
}

/**
 * Undermountain floors ramp from a moderate warm-up to a deadly set-piece and then
 * reset. Every fifth floor is one of Halaster's showpieces; the floor right after it
 * is a breather so the party can lick its wounds before the climb starts again.
 */
export function difficultyFor(depth) {
  const d = Math.floor(num(depth, 0));
  if (d <= 0) return 'medium';
  if (d % 5 === 0) return 'deadly';           // milestone floor — the Mad Mage is watching
  switch (d % 5) {
    case 1: return 'easy';                    // the breather after a milestone
    case 2: return 'medium';
    case 3: return 'medium';
    default: return 'hard';                   // 4 — the run-up to the next milestone
  }
}

// ===========================================================================
// MONSTER STATISTICS BY CR — the spine of level scaling
// ===========================================================================

/** The ordered CR ladder. Index arithmetic on this is how a creature "levels up". */
export const CR_LADDER = Object.freeze([
  0, 0.125, 0.25, 0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18,
  19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30,
]);

/**
 * DMG "Monster Statistics by Challenge Rating" — proficiency, armour class, the
 * midpoint of the hit-point band, attack bonus, damage per round and save DC.
 * Interpolating between two rows of this table is how a goblin becomes a Goblin
 * Sharpshooter without turning into something it is not.
 */
const CR_STATS_TABLE = Object.freeze({
  0: { prof: 2, ac: 13, hp: 3, atk: 3, dmg: 1, dc: 13 },
  0.125: { prof: 2, ac: 13, hp: 21, atk: 3, dmg: 2.5, dc: 13 },
  0.25: { prof: 2, ac: 13, hp: 42, atk: 3, dmg: 4.5, dc: 13 },
  0.5: { prof: 2, ac: 13, hp: 60, atk: 3, dmg: 7, dc: 13 },
  1: { prof: 2, ac: 13, hp: 78, atk: 3, dmg: 11.5, dc: 13 },
  2: { prof: 2, ac: 13, hp: 93, atk: 3, dmg: 17.5, dc: 13 },
  3: { prof: 2, ac: 13, hp: 108, atk: 4, dmg: 23.5, dc: 13 },
  4: { prof: 2, ac: 14, hp: 123, atk: 5, dmg: 29.5, dc: 14 },
  5: { prof: 3, ac: 15, hp: 138, atk: 6, dmg: 35.5, dc: 15 },
  6: { prof: 3, ac: 15, hp: 153, atk: 6, dmg: 41.5, dc: 15 },
  7: { prof: 3, ac: 15, hp: 168, atk: 6, dmg: 47.5, dc: 15 },
  8: { prof: 3, ac: 16, hp: 183, atk: 7, dmg: 53.5, dc: 16 },
  9: { prof: 4, ac: 16, hp: 198, atk: 7, dmg: 59.5, dc: 16 },
  10: { prof: 4, ac: 17, hp: 213, atk: 7, dmg: 65.5, dc: 17 },
  11: { prof: 4, ac: 17, hp: 228, atk: 8, dmg: 71.5, dc: 17 },
  12: { prof: 4, ac: 17, hp: 243, atk: 8, dmg: 77.5, dc: 17 },
  13: { prof: 5, ac: 18, hp: 258, atk: 8, dmg: 83.5, dc: 18 },
  14: { prof: 5, ac: 18, hp: 273, atk: 8, dmg: 89.5, dc: 18 },
  15: { prof: 5, ac: 18, hp: 288, atk: 8, dmg: 95.5, dc: 18 },
  16: { prof: 5, ac: 18, hp: 303, atk: 9, dmg: 101.5, dc: 18 },
  17: { prof: 6, ac: 19, hp: 318, atk: 10, dmg: 107.5, dc: 19 },
  18: { prof: 6, ac: 19, hp: 333, atk: 10, dmg: 113.5, dc: 19 },
  19: { prof: 6, ac: 19, hp: 348, atk: 10, dmg: 119.5, dc: 19 },
  20: { prof: 6, ac: 19, hp: 378, atk: 10, dmg: 131.5, dc: 19 },
  21: { prof: 7, ac: 19, hp: 423, atk: 11, dmg: 149.5, dc: 20 },
  22: { prof: 7, ac: 19, hp: 468, atk: 11, dmg: 167.5, dc: 20 },
  23: { prof: 7, ac: 19, hp: 513, atk: 11, dmg: 185.5, dc: 20 },
  24: { prof: 7, ac: 19, hp: 558, atk: 12, dmg: 203.5, dc: 21 },
  25: { prof: 8, ac: 19, hp: 603, atk: 12, dmg: 221.5, dc: 21 },
  26: { prof: 8, ac: 19, hp: 648, atk: 12, dmg: 239.5, dc: 21 },
  27: { prof: 8, ac: 19, hp: 693, atk: 13, dmg: 257.5, dc: 22 },
  28: { prof: 8, ac: 19, hp: 738, atk: 13, dmg: 275.5, dc: 22 },
  29: { prof: 9, ac: 19, hp: 783, atk: 13, dmg: 293.5, dc: 22 },
  30: { prof: 9, ac: 19, hp: 828, atk: 14, dmg: 311.5, dc: 23 },
});

/** Expected stats for any CR, including fractional ones produced by scaling. */
export function crStats(cr) {
  const c = clamp(num(cr, 0), 0, 30);
  if (CR_STATS_TABLE[c]) return CR_STATS_TABLE[c];
  let lo = 0, hi = 30;
  for (const k of CR_LADDER) { if (k <= c) lo = k; if (k >= c) { hi = k; break; } }
  const A = CR_STATS_TABLE[lo], B = CR_STATS_TABLE[hi];
  if (!A || !B) return CR_STATS_TABLE[0];
  if (lo === hi) return A;
  const t = (c - lo) / (hi - lo);
  const mix = (a, b) => a + (b - a) * t;
  return {
    prof: Math.round(mix(A.prof, B.prof)),
    ac: mix(A.ac, B.ac),
    hp: mix(A.hp, B.hp),
    atk: mix(A.atk, B.atk),
    dmg: mix(A.dmg, B.dmg),
    dc: mix(A.dc, B.dc),
  };
}

/** Fractional position on the CR ladder, so CR 1.5 sits neatly between 1 and 2. */
function ladderIndex(cr) {
  const c = clamp(num(cr, 0), 0, 30);
  for (let i = 0; i < CR_LADDER.length - 1; i++) {
    const a = CR_LADDER[i], b = CR_LADDER[i + 1];
    if (c >= a && c <= b) return i + (b === a ? 0 : (c - a) / (b - a));
  }
  return CR_LADDER.length - 1;
}

function ladderCR(index) {
  const i = clamp(num(index, 0), 0, CR_LADDER.length - 1);
  const lo = Math.floor(i), hi = Math.min(CR_LADDER.length - 1, lo + 1);
  return CR_LADDER[lo] + (CR_LADDER[hi] - CR_LADDER[lo]) * (i - lo);
}

/** The party level a creature of this CR was designed to challenge. */
function anchorLevel(cr) {
  const c = num(cr, 0);
  return c <= 0.5 ? 1 : Math.max(1, Math.round(c));
}

/**
 * How far up (or down) the CR ladder a creature should move to stay relevant to a
 * party of `targetLevel` standing on Undermountain floor `depth`.
 *
 * A creature keeps its identity: it climbs at 65% of the party's rate, so a goblin
 * fought at 10th level is a nastier goblin, not a hill giant in a green suit.
 * Undermountain adds a third of a level per floor (§8 of the spec).
 */
export function effectiveCR(baseCR, targetLevel, opts = {}) {
  const { elite = false, boss = false, depth = 0, rate = 0.65 } = opts || {};
  const level = Math.max(1, num(targetLevel, 1)) + Math.floor(Math.max(0, num(depth, 0)) / 3);
  const shift = clamp((level - anchorLevel(baseCR)) * rate, -3, 12)
    + (elite ? 1 : 0) + (boss ? 2 : 0);
  return clamp(ladderCR(ladderIndex(baseCR) + shift), 0, 30);
}

// ===========================================================================
// EPITHETS — canon-flavoured names for scaled, elite and boss creatures
// ===========================================================================

/**
 * Every one of these is a published Forgotten Realms rank, title or creature variant.
 * `prefix` entries go in front of the name ("Dire Wolf Alpha" vs "Barrow-Bound Ghoul").
 * Nothing here is invented — see docs/SETTING.md.
 */
export const EPITHETS = Object.freeze({
  goblinoid: {
    elite: ['Sharpshooter', 'Skullcleaver', 'Warchanter', 'Iron Shadow', 'Devastator', 'Blademaster'],
    boss: ['Boss', 'Chief', 'Captain', 'Warlord'],
    prefix: [],
  },
  orc: {
    elite: ['Blade of Ilneval', 'Claw of Luthic', 'Hand of Yurtrus', 'Red Fang of Shargaas'],
    boss: ['War Chief', 'Eye of Gruumsh'],
    prefix: [],
  },
  'many-arrows': {
    elite: ['Blade of Ilneval', 'Claw of Luthic', 'Hand of Yurtrus'],
    boss: ['War Chief', 'Eye of Gruumsh'],
    prefix: [],
  },
  undead: {
    elite: ['of the Barrow', 'Crypt Warden', 'Grave Sentinel', 'Deathlock'],
    boss: ['Crypt Lord', 'Barrow Lord', 'Dread'],
    prefix: ['Restless', 'Barrow-Bound'],
  },
  redbrands: {
    elite: ['Bravo', 'Enforcer', 'Cutthroat'],
    boss: ['Bully', "Glasstaff's Chosen"],
    prefix: [],
  },
  'cult-dragon': {
    elite: ['Dragonclaw', 'Dragonfang', 'Dragonwing'],
    boss: ['Dragonsoul', 'Wyrmspeaker'],
    prefix: [],
  },
  zhentarim: {
    elite: ['Fang', 'Wolf', 'Viper'],
    boss: ['Ardragon', 'Black Network Ardragon'],
    prefix: [],
  },
  drow: {
    elite: ['House Blade', 'Elite Warrior', 'Arachnomancer'],
    boss: ['Priestess of Lolth', "Matron's Champion"],
    prefix: [],
  },
  beast: {
    elite: ['Alpha', 'Packleader'],
    boss: ['Great Beast of the Wood'],
    prefix: ['Scarred', 'Great'],
  },
  giant: {
    elite: ['Runecaster', 'Thane'],
    boss: ['Jarl', 'Chieftain'],
    prefix: [],
  },
  fiend: {
    elite: ['of the Nine Hells', 'of the Abyss'],
    boss: ['Warlord of the Pit'],
    prefix: [],
  },
  aberration: {
    elite: ['of the Deep Halls', 'Thrall of the Elder Brain'],
    boss: ['Overseer'],
    prefix: [],
  },
  default: {
    elite: ['Veteran', 'Reaver', 'Marauder', 'Warden', 'Champion'],
    boss: ['Chieftain', 'Overseer', 'Warlord'],
    prefix: ['Scarred', 'Grim'],
  },
});

/** Undermountain flavour, unlocked once the party is actually down there. */
const DEPTH_EPITHETS = Object.freeze([
  'of the Deep Halls', 'Halaster-Touched', 'of Skullport', "of the Mad Mage's Court",
]);

/**
 * Build a Realms-appropriate name for a scaled creature: "Goblin Sharpshooter",
 * "Hobgoblin Iron Shadow", "Redbrand Bravo", "Scarred Dire Wolf".
 * Returns the base name unchanged when there is nothing to distinguish.
 */
export function epithetFor(m, opts = {}, r = rng) {
  const { elite = false, boss = false, depth = 0 } = opts || {};
  if (!m) return 'Creature';
  const base = m.name || m.id || 'Creature';
  if (!elite && !boss) return base;

  const set = EPITHETS[lower(m.faction)] || EPITHETS[lower(m.type)] || EPITHETS.default;
  const pool = boss ? (set.boss || EPITHETS.default.boss) : (set.elite || EPITHETS.default.elite);
  const deep = num(depth, 0) >= 6 && r.chance(0.3) ? r.pick(DEPTH_EPITHETS) : null;
  const title = deep || r.pick(pool) || (boss ? 'Chieftain' : 'Veteran');

  // Prefix forms read better on beasts and undead ("Scarred Dire Wolf").
  const prefixes = set.prefix || [];
  if (!deep && prefixes.length && r.chance(0.35)) return `${r.pick(prefixes)} ${base}`;
  return `${base} ${title}`;
}

// ===========================================================================
// makeMonster — a stat block becomes a Character
// ===========================================================================

/**
 * A last-resort stat block so an unknown monster id spawns a mundane thug instead of
 * crashing an encounter. Deliberately dull and Realms-plain.
 */
const FALLBACK_BLOCK = Object.freeze({
  id: 'sellsword', name: 'Sellsword', cr: 0.25, type: 'humanoid', size: 'medium',
  ac: 12, hpDice: '2d8+2', speed: 30,
  abilities: { str: 12, dex: 12, con: 12, int: 10, wis: 10, cha: 10 },
  actions: [{ id: 'shortsword', name: 'Shortsword', kind: 'attack', reach: 5, atkBonus: 3, dice: '1d6+1', dtype: 'piercing' }],
  ai: { archetype: 'brute', aggression: 0.6, selfPreserve: 0.4, preferredRange: 5 },
  xp: 50, loot: { gold: '2d6' }, sprite: 'bandit', biomes: ['road'], groupSize: [2, 4], faction: null,
});

/** Which `ai.role` a stat block action implies when the data does not say. */
function roleForAction(act) {
  const k = lower(act?.kind);
  if (k === 'heal') return 'heal';
  if (k === 'save') return act?.target?.radius || act?.target?.kind === 'cone' ? 'aoe' : 'control';
  if (k === 'summon') return 'utility';
  if (k === 'multiattack' || k === 'attack') return 'attack';
  return 'utility';
}

/**
 * Translate one stat block action into the ActionOption shape combat.js hands to the
 * UI and to ai.js, while keeping every raw stat-block field (atkBonus, dice, save,
 * effects, uses) that actions.js reads when it resolves the thing.
 */
export function monsterActionOption(act, cost = 'action') {
  if (!act) return null;
  const kind = lower(act.kind || 'attack');
  const id = act.id || slug(act.name || kind);
  const rangeArr = Array.isArray(act.range) ? [num(act.range[0], 20), num(act.range[1], num(act.range[0], 20))] : null;
  const reach = act.reach != null ? num(act.reach, 5) : (rangeArr ? null : (kind === 'attack' ? 5 : null));
  const tgt = act.target || {};
  const shape = lower(tgt.kind || (kind === 'attack' ? 'creature' : 'creature'));

  const uses = act.uses ? { ...act.uses } : null;

  return {
    // --- raw stat block fields, untouched, for actions.js -------------------
    ...clone(act),
    id, name: act.name || id, kind,
    reach: reach != null ? reach : undefined,
    range: rangeArr || undefined,
    uses,
    remaining: uses ? num(uses.max, 1) : null,
    ai: act.ai || { role: roleForAction(act), weight: 1 },

    // --- option shape, for combat.js and the UI -----------------------------
    // Legendary actions spend numeric points, not the ordinary action economy.
    cost: cost==='legendary' ? Math.max(1,num(act.cost,1)) : cost,
    icon: kind === 'attack' ? 'sword' : kind === 'heal' ? 'heart' : kind === 'save' ? 'spell' : 'star',
    desc: act.desc || '',
    targeting: {
      kind: shape,
      range: rangeArr || (reach != null ? reach : 5),
      shape: tgt.kind || null,
      radius: num(tgt.radius, 0),
      length: num(tgt.length, 0),
      width: num(tgt.width, 5),
      allowAllies: !!tgt.allowAllies,
      needsLoS: tgt.needsLoS !== false,
    },
    enabled: true,
    reason: '',
    source: 'monster',
  };
}

/**
 * Copy a stat block's innate spellcasting onto a Character's spell block. Exported so
 * combat.js can re-apply it after any recalc — `recomputeSpells` legitimately wipes
 * the block for a creature with no casting class levels.
 */
export function applyInnateSpellcasting(ch) {
  const sc = ch?.spellcasting;
  if (!ch || !sc) return ch;
  const ability = lower(sc.ability || 'cha');
  const abilityMod = abMod(num(ch.base?.[ability], 10) + num(ch.asi?.[ability], 0));
  ch.spells.cantrips = arr(sc.cantrips).slice();
  ch.spells.known = arr(sc.spells || sc.known).slice();
  ch.spells.prepared = arr(sc.spells || sc.prepared).slice();
  ch.spells.ability = ability;
  ch.spells.dc = num(sc.dc, 8 + num(ch.prof, 2) + abilityMod);
  ch.spells.atk = num(sc.atk, num(ch.prof, 2) + abilityMod);
  if (sc.slots) {
    const slots = {};
    for (const k of Object.keys(sc.slots)) {
      const v = sc.slots[k];
      slots[k] = typeof v === 'number' ? { max: v, used: 0 } : { max: num(v?.max, 0), used: num(v?.used, 0) };
    }
    ch.spells.slots = slots;
  }
  return ch;
}

/** Roll (or average) a stat block's hit points. */
function rollHp(block, r, average) {
  const expr = block.hpDice || block.hp || '1d8';
  if (typeof expr === 'number') return Math.max(1, Math.floor(expr));
  const p = parseDice(expr);
  if (!p) return Math.max(1, Math.floor(num(block.hp, 4)));

  // 5e stat blocks fold the Constitution bonus into the hit dice expression
  // ("15 (2d8+6)"). If a data author left it off, put it back — otherwise a
  // Constitution 16 creature would be as tough as a Constitution 10 one.
  let bonus = 0;
  if (p.mod === 0 && p.n > 0) {
    const conMod = abMod(num(block.abilities?.con, 10));
    if (conMod !== 0) bonus = conMod * p.n;
  }
  const rolled = average ? Math.floor(avgExpr(expr)) : rollExpr(expr, r).total;
  return Math.max(1, rolled + bonus);
}

/**
 * Build the synthetic `mech` block that carries everything a stat block declares but
 * a Character normally derives from a species and a class: natural armour, saves,
 * skill bonuses, damage resistances, senses and extra movement modes.
 */
function statBlockMech(block) {
  const dexMod = abMod(num(block.abilities?.dex, 10));
  const senses = block.senses || {};

  // Skills on a stat block are FINAL modifiers ("Stealth +6"), not proficiencies.
  // Expressing them as a flat bonus over the ability modifier reproduces the printed
  // number exactly and survives any later recalc.
  const skillBonus = {};
  for (const [skill, value] of Object.entries(block.skills || {})) {
    const abilityFor = SKILL_ABILITY[lower(skill)] || 'dex';
    skillBonus[lower(skill)] = num(value, 0) - abMod(num(block.abilities?.[abilityFor], 10));
  }
  // Passive Perception is printed separately; if it disagrees, trust the printed value.
  if (block.passivePerception != null && skillBonus.perception == null) {
    skillBonus.perception = num(block.passivePerception, 10) - 10 - abMod(num(block.abilities?.wis, 10));
  }

  return {
    saveProf: arr(block.saveProf),
    skillBonus,
    resist: arr(block.resist), immune: arr(block.immune),
    vuln: arr(block.vuln), condImmune: arr(block.condImmune),
    darkvision: num(senses.darkvision, 0),
    blindsight: num(senses.blindsight, 0),
    truesight: num(senses.truesight, 0),
    tremorsense: num(senses.tremorsense, 0),
    speeds: {
      fly: num(block.fly, 0), swim: num(block.swim, 0),
      climb: num(block.climb, 0), burrow: num(block.burrow, 0),
    },
    // Natural armour. Expressed as base + Dex so that scaling a creature's Dexterity
    // still moves its AC, while an unscaled creature keeps exactly its printed AC.
    acFormula: { base: num(block.ac, 12) - dexMod, addDex: true, allowArmor: true },
  };
}

/** Ability each skill keys off — a local copy so this module never imports the UI. */
const SKILL_ABILITY = Object.freeze({
  acrobatics: 'dex', 'animal-handling': 'wis', arcana: 'int', athletics: 'str',
  deception: 'cha', history: 'int', insight: 'wis', intimidation: 'cha',
  investigation: 'int', medicine: 'wis', nature: 'int', perception: 'wis',
  performance: 'cha', persuasion: 'cha', religion: 'int', 'sleight-of-hand': 'dex',
  stealth: 'dex', survival: 'wis',
});

/**
 * Turn a MONSTERS stat block into a full Character that combat.js can drive.
 *
 * `monsterId` may be an id or an already-scaled stat block object (that is how
 * `scaleMonster` reuses this).
 *
 * opts: { name, title, level, seed, rng, average=false, side='foe', pos, uid,
 *         elite, boss, depth, tint, ai }
 */
export function makeMonster(monsterId, opts = {}) {
  const block = (monsterId && typeof monsterId === 'object')
    ? monsterId
    : (getMonster(monsterId) || FALLBACK_BLOCK);

  const r = opts.rng || (opts.seed != null ? makeRNG(opts.seed) : rng);
  const abilities = {};
  for (const ab of ABILITIES) abilities[ab] = num(block.abilities?.[ab], 10);

  const cr = num(block.cr, 0);
  const level = Math.max(1, Math.floor(num(opts.level, Math.max(1, Math.round(cr || 1)))));

  // Build the shell through the normal constructor so every canonical field exists,
  // then overwrite the stat-block-driven ones and re-derive.
  const ch = createCharacter({
    kind: 'monster',
    uid: opts.uid || uid('mon'),
    name: opts.name || block.name || 'Creature',
    abilities,
    level: 1,
    autoAsi: false,
    autoEquip: false,
    inventory: [],
    equipment: {},
    sprite: block.sprite || 'goblin',
    rng: r,
  });

  ch.title = opts.title || '';
  ch.monsterId = block.id || (typeof monsterId === 'string' ? monsterId : null);
  ch.creatureType = lower(block.type || 'humanoid');
  ch.monsterType = ch.creatureType;
  ch.subtype = block.subtype || null;
  ch.faction = block.faction || null;
  ch.size = lower(block.size || 'medium');
  ch.cr = cr;
  ch.level = level;
  ch.prof = num(block.prof, profForCR(cr));
  ch.baseSpeed = num(block.speed, 30);
  ch.sprite = block.sprite || ch.sprite;
  ch.tint = opts.tint ?? block.tint ?? null;
  ch.side = opts.side || 'foe';
  ch.xpValue = num(block.xp, xpForCR(cr));
  ch.loot = block.loot ? clone(block.loot) : null;
  ch.biomes = arr(block.biomes).slice();
  ch.elite = !!(opts.elite ?? block.elite);
  ch.boss = !!(opts.boss ?? block.boss);

  // Hit points: rolled by default, average when the caller wants a predictable fight.
  const hp = rollHp(block, r, !!opts.average);
  ch.baseMaxHp = hp;
  ch.maxHp = hp;
  ch.hp = hp;

  // --- actions ------------------------------------------------------------
  ch.actions = arr(block.actions).map((a) => monsterActionOption(a, 'action')).filter(Boolean);
  ch.bonusActions = arr(block.bonusActions).map((a) => monsterActionOption(a, 'bonus')).filter(Boolean);
  ch.reactions = arr(block.reactions).map((a) => monsterActionOption(a, 'reaction')).filter(Boolean);
  ch.legendary = block.legendary
    ? {
      count: num(block.legendary.count, 3),
      used: 0,
      actions: arr(block.legendary.actions).map((a) => monsterActionOption(a, 'legendary')).filter(Boolean),
    }
    : null;
  ch.lair = block.lair ? clone(block.lair) : null;
  ch.phases = arr(block.phases).map((p) => clone(p));

  // --- traits and derived statistics --------------------------------------
  ch.extraFeatures = [
    { id: `${ch.monsterId || 'monster'}-statblock`, name: block.name || 'Stat Block', mech: statBlockMech(block), source: 'monster' },
    ...arr(block.traits).map((t, i) => ({
      id: t.id || slug(t.name || `trait-${i}`),
      name: t.name || 'Trait',
      desc: t.desc || '',
      mech: t.mech || null,
      source: 'monster-trait',
    })),
  ];

  // --- AI -----------------------------------------------------------------
  ch.ai = { ...(block.ai || {}), ...(opts.ai || {}) };
  if (!ch.ai.archetype) ch.ai.archetype = 'brute';

  recalc(ch);

  // Innate spellcasting is applied AFTER recalc: spellcasting.js clears the spell
  // block for anything with no casting class levels, which a stat block never has.
  // The raw block is kept on the character so a later recalc can be repaired.
  if (block.spellcasting) {
    ch.spellcasting = clone(block.spellcasting);
    applyInnateSpellcasting(ch);
  }

  // recalc rebuilds AC and HP from the mech merge; make sure the printed values win
  // for anything the formula could not express, and start the creature at full health.
  if (!Number.isFinite(ch.ac) || ch.ac <= 0) ch.ac = num(block.ac, 12);
  ch.maxHp = Math.max(1, ch.maxHp);
  ch.hp = ch.maxHp;
  ch.tempHp = 0;
  ch.deathSaves = { success: 0, fail: 0, stable: false };
  if (block.passivePerception != null) ch.passivePerception = num(block.passivePerception, ch.passivePerception);

  if (opts.pos) ch.pos = { x: num(opts.pos.x), y: num(opts.pos.y) };

  return ch;
}

// ===========================================================================
// scaleMonster — the level-scaling core of the endless game
// ===========================================================================

/**
 * Scale a dice expression so its average is multiplied by `mult`, keeping the die
 * size (a greataxe still swings d12s) and absorbing the remainder into the modifier.
 */
export function scaleDamageExpr(expr, mult) {
  const p = parseDice(expr);
  if (!p) return expr;
  const m = Math.max(0.05, num(mult, 1));
  if (p.n === 0 || p.sides === 0) return String(Math.max(1, Math.round(p.mod * m)));
  const targetAvg = (p.n * (p.sides + 1) / 2 + p.mod) * m;
  const n = Math.max(1, Math.round(p.n * m));
  const mod = Math.round(targetAvg - n * (p.sides + 1) / 2);
  return `${n}d${p.sides}${mod ? (mod > 0 ? `+${mod}` : `${mod}`) : ''}`;
}

/** Grow a hit-dice pool so its average lands on `targetHp`. */
function scaleHitDice(expr, targetHp, conMod) {
  const p = parseDice(expr) || { n: 1, sides: 8, mod: 0 };
  const sides = p.sides || 8;
  const per = (sides + 1) / 2 + conMod;
  const n = Math.max(1, Math.round(targetHp / Math.max(1, per)));
  const mod = Math.round(conMod * n);
  return `${n}d${sides}${mod ? (mod > 0 ? `+${mod}` : `${mod}`) : ''}`;
}

/**
 * Level-scale a creature and return it as a ready-to-fight Character.
 *
 * Hit points, AC, attack bonus, damage dice and save DCs are all interpolated from
 * the creature's printed CR toward an effective CR derived from the party level and
 * the dungeon depth. `elite` adds hit points, an extra attack and a bonus trait;
 * `boss` adds legendary resistances and legendary actions. Either one earns a
 * canon-flavoured epithet.
 */
export function scaleMonster(monsterId, targetLevel, opts = {}) {
  const { elite = false, boss = false, depth = 0 } = opts || {};
  const source = (monsterId && typeof monsterId === 'object') ? monsterId : getMonster(monsterId);
  const block = clone(source || FALLBACK_BLOCK);
  const r = opts.rng || makeRNG(opts.seed != null ? opts.seed
    : hashStr(`scale:${block.id}:${targetLevel}:${depth}:${elite ? 'e' : ''}${boss ? 'b' : ''}`));

  const baseCR = num(block.cr, 0);
  const effCR = effectiveCR(baseCR, targetLevel, { elite, boss, depth });
  const from = crStats(baseCR);
  const to = crStats(effCR);

  const hpMult = Math.max(0.35, to.hp / Math.max(1, from.hp));
  const dmgMult = Math.max(0.35, to.dmg / Math.max(0.5, from.dmg));
  const acDelta = Math.round(to.ac - from.ac);
  const atkDelta = Math.round(to.atk - from.atk);
  const dcDelta = Math.round(to.dc - from.dc);

  const conMod = abMod(num(block.abilities?.con, 10));

  // --- hit points ---------------------------------------------------------
  const baseHp = Math.max(1, Math.floor(avgExpr(block.hpDice || '1d8')));
  let targetHp = Math.max(1, Math.round(baseHp * hpMult));
  if (elite) targetHp = Math.round(targetHp * 1.4);      // elite template: tougher
  if (boss) targetHp = Math.round(targetHp * 2.0);       // boss template: a wall
  block.hpDice = scaleHitDice(block.hpDice || '1d8', targetHp, conMod);

  // --- defences and offence ----------------------------------------------
  block.ac = clamp(num(block.ac, 12) + acDelta + (elite ? 1 : 0) + (boss ? 2 : 0), 5, 25);
  block.cr = effCR;
  block.prof = profForCR(effCR);
  block.xp = Math.max(10, Math.round(xpForCR(effCR) * (elite ? 1.5 : 1) * (boss ? 2.5 : 1)));

  const scaleAction = (a) => {
    if (!a) return a;
    const out = { ...a };
    if (typeof out.atkBonus === 'number') out.atkBonus = out.atkBonus + atkDelta;
    if (out.dice) out.dice = scaleDamageExpr(out.dice, dmgMult);
    if (out.save && typeof out.save.dc === 'number') out.save = { ...out.save, dc: clamp(out.save.dc + dcDelta, 8, 30) };
    for (const eff of arr(out.effects)) {
      if (eff && typeof eff.dc === 'number') eff.dc = clamp(eff.dc + dcDelta, 8, 30);
      if (eff && eff.dice) eff.dice = scaleDamageExpr(eff.dice, dmgMult);
    }
    return out;
  };
  block.actions = arr(block.actions).map(scaleAction);
  block.bonusActions = arr(block.bonusActions).map(scaleAction);
  block.reactions = arr(block.reactions).map(scaleAction);
  if (block.legendary) block.legendary = { ...block.legendary, actions: arr(block.legendary.actions).map(scaleAction) };
  if (block.spellcasting?.dc) block.spellcasting.dc = clamp(num(block.spellcasting.dc, 13) + dcDelta, 8, 30);

  // --- elite template -----------------------------------------------------
  if (elite) {
    block.elite = true;
    // "+1 attack": a second swing every round. If the creature already multiattacks,
    // bump the multiattack instead of bolting a duplicate action on.
    const multi = arr(block.actions).find((a) => lower(a.kind) === 'multiattack');
    if (multi) multi.count = num(multi.count, 2) + 1;
    else {
      const first = arr(block.actions).find((a) => lower(a.kind) === 'attack');
      if (first) {
        block.actions = [{
          id: 'multiattack', name: 'Multiattack', kind: 'multiattack',
          desc: `Makes two ${lower(first.name || 'weapon')} attacks.`,
          attacks: [{ id: first.id, count: 2 }],
          ai: { role: 'attack', weight: 1.2 },
        }, ...block.actions];
      }
    }
    // A bonus trait, drawn from a small set of published monster traits.
    const bonusTraits = [
      { id: 'aggressive', name: 'Aggressive', desc: 'As a Bonus Action, it moves up to its speed toward a hostile creature it can see.', mech: { passive: 'aggressive' } },
      { id: 'brute', name: 'Brute', desc: 'A melee weapon deals one extra die of damage when it hits.', mech: { meleeDmgBonus: Math.max(2, Math.round(from.dmg * 0.15)) } },
      { id: 'nimble-escape', name: 'Nimble Escape', desc: 'It takes the Disengage or Hide action as a Bonus Action on each of its turns.', mech: { passive: 'nimble-escape' } },
      { id: 'pack-tactics', name: 'Pack Tactics', desc: 'It has Advantage on attacks against a creature if at least one ally is within 5 feet of it.', mech: { passive: 'pack-tactics' } },
      { id: 'relentless', name: 'Relentless', desc: 'If damage reduces it to 0 hit points, it drops to 1 hit point instead (once per short rest).', mech: { passive: 'relentless' } },
    ];
    const pick = r.pick(bonusTraits);
    block.traits = [...arr(block.traits), pick];
    if (lower(pick.id) === 'nimble-escape') {
      block.bonusActions = [...arr(block.bonusActions),
        { id: 'disengage', name: 'Disengage', kind: 'utility', desc: 'Its movement does not provoke Opportunity Attacks this turn.' },
        { id: 'hide', name: 'Hide', kind: 'utility', desc: 'It attempts to hide.' },
      ];
    }
  }

  // --- boss template ------------------------------------------------------
  if (boss) {
    block.boss = true;
    block.size = block.size === 'small' || block.size === 'tiny' ? 'medium' : block.size;
    block.traits = [...arr(block.traits), {
      id: 'legendary-resistance',
      name: 'Legendary Resistance (3/Day)',
      desc: 'If it fails a saving throw, it can choose to succeed instead.',
      mech: { passive: 'legendary-resistance', resource: { id: 'legendaryResistance', name: 'Legendary Resistance', max: 3, recharge: 'long' } },
    }];
    // Legendary actions: reuse the creature's own attacks so it stays in character.
    const swipe = arr(block.actions).find((a) => lower(a.kind) === 'attack');
    const legendary = arr(block.legendary?.actions);
    if (!legendary.length && swipe) {
      block.legendary = {
        count: 3,
        actions: [
          { ...swipe, id: `${swipe.id}-legendary`, name: swipe.name, cost: 1, ai: { role: 'attack', weight: 1 } },
          {
            id: 'stalk', name: 'Stalk', kind: 'utility', cost: 1,
            desc: 'It moves up to half its speed without provoking Opportunity Attacks.',
            ai: { role: 'utility', weight: 0.5 },
          },
        ],
      };
    } else if (block.legendary) {
      block.legendary.count = Math.max(3, num(block.legendary.count, 3));
    }
    // A phase ability at half health, which ai.js's boss planner will fire.
    if (!arr(block.phases).length && swipe) {
      block.phases = [{ at: 0.5, actionId: swipe.id, name: swipe.name, once: true }];
    }
  }

  // --- name ---------------------------------------------------------------
  if (elite || boss) block.name = epithetFor(source || FALLBACK_BLOCK, { elite, boss, depth }, r);

  return makeMonster(block, {
    ...opts,
    level: Math.max(1, Math.round(num(targetLevel, 1))),
    elite, boss,
    rng: r,
  });
}

// ===========================================================================
// rollEncounter
// ===========================================================================

/** Weight a candidate by how close its CR sits to the sweet spot for this fight. */
function crWeight(cr, want) {
  const d = Math.abs(num(cr, 0) - want);
  return 1 / (1 + d * d * 0.6);
}

/** Total XP of a monster list [{id, count}]. */
export function encounterXp(list) {
  let total = 0;
  for (const e of arr(list)) total += xpOf(e.id) * Math.max(1, num(e.count, 1));
  return total;
}

/**
 * What one creature will actually cost once it spawns. On the surface a stat block
 * more than two CR below the party is scaled up (see buildEncounterMonsters), so
 * the budget is spent against the veteran, not the printed baseline. `lookup`
 * resolves ids the bestiary does not carry (an encounter's own creatures).
 */
export function unitCost(id, level, depth = 0, lookup = null) {
  const block = getMonster(id) || (typeof lookup === 'function' ? lookup(id) : null);
  const cr = num(block?.cr, 0);
  if (depth === 0 && level - cr > 2) return xpForCR(effectiveCR(cr, level));
  return block && !getMonster(id) ? num(block.xp, xpForCR(cr)) : xpOf(id);
}

/**
 * Roll a situation's foes — [[id, min, max], ...] — and fit them to the party.
 *
 * The encounter director names WHO is on the road; this decides HOW MANY, by the
 * same 2024 XP budget rollEncounter spends. The most expensive stack is trimmed
 * first and never below its minimum; a roll well under budget gets one more of its
 * cheapest member. The first entry with a minimum of 1 is the one that is always
 * there (the captain, the chief), so a trim never removes the leader.
 *
 * o: { level, size, difficulty='medium', seed | rng, depth=0, lookup }
 * -> { monsters:[{id,count,min,max}], xp, budget, difficulty }
 */
export function rollFoes(foes, o = {}) {
  const level = Math.max(1, Math.floor(num(o.level, 1)));
  const size = clamp(Math.floor(num(o.size, 4)), 1, 8);
  const depth = Math.max(0, Math.floor(num(o.depth, 0)));
  const difficulty = lower(o.difficulty || 'medium');
  const r = o.rng || makeRNG(o.seed != null ? o.seed : hashStr(`foes:${level}:${size}`));
  const lookup = o.lookup || null;
  const known = (id) => !!(getMonster(id) || (lookup && lookup(id)));
  const budget = encounterBudget(level, size, difficulty);
  const cost = (id) => unitCost(id, level, depth, lookup);
  const total = (list) => list.reduce((t, e) => t + cost(e.id) * e.count, 0);

  const out = [];
  for (const row of arr(foes)) {
    const [id, min, max] = Array.isArray(row) ? row : [row?.id, row?.min, row?.max];
    if (!id || !known(id)) continue;
    const lo = Math.max(0, Math.floor(num(min, 1)));
    const hi = Math.max(lo, Math.floor(num(max, lo)));
    const count = r.int(lo, hi);
    if (count > 0) out.push({ id, count, min: lo, max: hi });
  }

  let guard = 0;
  while (out.length && total(out) > budget && guard++ < 40) {
    const trimmable = out.filter((e) => e.count > Math.max(1, e.min)).sort((a, b) => cost(b.id) - cost(a.id));
    if (trimmable.length) { trimmable[0].count -= 1; continue; }
    // Everything sits at its minimum: drop the cheapest optional stack, if any.
    const optional = out.filter((e) => e.min === 0).sort((a, b) => cost(a.id) - cost(b.id));
    if (!optional.length) break;
    out.splice(out.indexOf(optional[0]), 1);
  }
  if (out.length && total(out) < budget * 0.5) {
    const cheap = out.filter((e) => e.count < e.max).sort((a, b) => cost(a.id) - cost(b.id))[0];
    if (cheap && total(out) + cost(cheap.id) <= budget) cheap.count += 1;
  }
  const monsters = out.filter((e) => e.count > 0);
  return { monsters, xp: total(monsters), budget, difficulty };
}

/**
 * Build an encounter for a biome and a party.
 *
 * Returns { monsters:[{id,count}], boss, xp, budget, difficulty, faction }.
 * `monsters` is the COMPLETE spawn list — the boss, if there is one, is already in it;
 * `boss` just names it so the UI can play the right music and title card.
 */
export function rollEncounter(o = {}) {
  const biome = lower(o.biome || 'forest');
  const level = Math.max(1, Math.floor(num(o.level, 1)));
  const size = clamp(Math.floor(num(o.size, 4)), 1, 8);
  const depth = Math.max(0, Math.floor(num(o.depth, 0)));
  const night = !!o.night;
  const weather = lower(o.weather || 'clear');
  const murk = weather === 'fog' || weather === 'rain' || weather === 'snow';
  let difficulty = lower(o.difficulty || (depth > 0 ? difficultyFor(depth) : 'medium'));
  const r = o.seed != null ? makeRNG(o.seed) : makeRNG(hashStr(`enc:${biome}:${level}:${size}:${depth}:${difficulty}`));

  // Night is when the things that hunt by dark come out: a third of the time the
  // fight is one step harder than the same road by daylight.
  let nightBump = false;
  if (night && r.chance(0.35)) {
    const ladder = ['easy', 'medium', 'hard', 'deadly'];
    const i = ladder.indexOf(difficulty);
    if (i >= 0 && i < ladder.length - 1) { difficulty = ladder[i + 1]; nightBump = true; }
  }

  const budget = encounterBudget(level, size, difficulty);
  const out = {
    monsters: [], boss: null, xp: 0, budget, difficulty, biome, level, depth, faction: null,
    night, weather, nightBump,
  };

  // The CR window this party can meaningfully fight. Low levels get a floor of 0 so
  // a wolf pack is still legal; high levels stop bothering with kobolds.
  const hiCR = clamp(level + (difficulty === 'deadly' ? 3 : difficulty === 'hard' ? 2 : 1), 0.25, 30);
  const loCR = level <= 3 ? 0 : Math.max(0, Math.floor(level / 4));
  const wantCR = Math.max(0.125, level * 0.55);

  const costOf = (id) => unitCost(id, level, depth);
  const totalCost = (list) => arr(list).reduce((t, e) => t + costOf(e.id) * Math.max(1, num(e.count, 1)), 0);

  // Time and weather bias. Undead and darkvision hunters own the night; in fog and
  // rain the ambushers are the ones who find you. Never zero — just a nudge.
  const envWeight = (traits) => {
    let w = 1;
    if (night) {
      if (traits.undead) w *= 2.4;
      else if (traits.darkvision) w *= 1.6;
      else w *= 0.55;
    }
    if (murk && traits.ambusher) w *= 2.2;
    return w;
  };

  // --- 1. a published-style group, if the bestiary has one for this biome ---
  let groupId = null;
  const validGroups = (ids) => arr(ids).map(String).filter((id) => {
    const g = MONSTER_GROUPS[id];
    return g && arr(g.members).length;
  });
  try {
    // A scripted fight names its group outright (the Cragmaws by the dead horses):
    // that group, every time.
    if (o.group && validGroups([o.group]).length) { groupId = String(o.group); out.fromTable = true; }
    // A map may name its own table (Cragmaw scouts on the Triboar Trail, ghouls
    // in the Fields of the Dead). Two fights in three come from it.
    const table = validGroups(o.table);
    if (!groupId && table.length && r.chance(0.65)) {
      groupId = r.pickWeighted(table, (id) => crWeight(MONSTER_GROUPS[id].cr ?? wantCR, wantCR) + 0.05);
      out.fromTable = true;
    }
    if (!groupId) {
      const groups = validGroups(groupsForBiome(biome, hiCR, level));
      if (groups.length && r.chance(0.62)) {
        groupId = r.pickWeighted(groups, (id) => crWeight(MONSTER_GROUPS[id].cr ?? wantCR, wantCR)
          * envWeight(groupTraits(id)));
      }
    }
  } catch { groupId = null; }

  if (groupId) {
    const g = MONSTER_GROUPS[groupId];
    out.groupId = groupId;
    out.name = g.name || null;
    for (const member of arr(g.members)) {
      const [id, min, max] = Array.isArray(member) ? member : [member.id, member.min, member.max];
      if (!getMonster(id)) continue;
      const lo = Math.max(0, Math.floor(num(min, 1)));
      const hi = Math.max(lo, Math.floor(num(max, lo)));
      const count = r.int(lo, hi);
      if (count > 0) out.monsters.push({ id, count, min: lo, max: hi });
    }
    out.faction = getMonster(out.monsters[0]?.id)?.faction || null;
  }

  // --- 2. otherwise assemble a custom, faction-coherent mix ----------------
  if (!out.monsters.length) {
    let pool = [];
    try { pool = monstersByBiome(biome, loCR, hiCR); } catch { pool = []; }
    if (!pool.length) { try { pool = monstersByCR(loCR, hiCR); } catch { pool = []; } }
    if (!pool.length) { try { pool = monstersByCR(0, 30); } catch { pool = []; } }
    if (!pool.length) return out;                       // empty bestiary: no fight, no crash

    const lead = r.pickWeighted(pool, (id) => crWeight(getMonster(id)?.cr, wantCR) * envWeight(monsterTraits(id)));
    const leadBlock = getMonster(lead);
    out.faction = leadBlock?.faction || null;

    // Faction coherence: goblinoids raid with goblinoids, undead rise together.
    // Failing a faction, at least keep the creature type consistent.
    const kin = pool.filter((id) => {
      const m = getMonster(id);
      if (!m) return false;
      if (out.faction) return lower(m.faction) === lower(out.faction);
      return lower(m.type) === lower(leadBlock?.type);
    });
    const mixPool = kin.length >= 2 ? kin : pool;

    const gs = arr(leadBlock?.groupSize);
    const leadCount = gs.length ? r.int(num(gs[0], 1), Math.max(num(gs[0], 1), num(gs[1], 1))) : 1;
    out.monsters.push({ id: lead, count: Math.max(1, leadCount), min: 1, max: Math.max(1, num(gs[1], leadCount)) });

    // Fill the remaining budget with kin, up to four distinct creature types.
    let guard = 0;
    while (totalCost(out.monsters) < budget * 0.8 && out.monsters.length < 4 && guard++ < 12) {
      const id = r.pickWeighted(mixPool, (mid) => crWeight(getMonster(mid)?.cr, wantCR * 0.8));
      if (!id) break;
      const m = getMonster(id);
      const mgs = arr(m?.groupSize);
      const lo = Math.max(1, num(mgs[0], 1));
      const hi = Math.max(lo, num(mgs[1], lo));
      const existing = out.monsters.find((e) => e.id === id);
      if (existing) {
        if (existing.count >= hi) continue;
        existing.count += 1;
      } else {
        out.monsters.push({ id, count: r.int(lo, hi), min: lo, max: hi });
      }
    }
  }

  // --- 3. a boss, on milestone floors and the nastiest fights --------------
  const wantBoss = o.boss === true
    || (depth > 0 && depth % 5 === 0)
    || (difficulty === 'deadly' && r.chance(0.3));
  if (wantBoss) {
    let candidates = [];
    try { candidates = bossesForTier(Math.max(0, level * 0.6), level + 3, biome); } catch { candidates = []; }
    if (candidates.length) {
      const bossId = r.pickWeighted(candidates, (id) => crWeight(BOSSES[id]?.cr, level));
      if (bossId) {
        out.boss = bossId;
        out.monsters.unshift({ id: bossId, count: 1, min: 1, max: 1, boss: true });
      }
    }
  }

  // --- 4. spend the budget without blowing it -----------------------------
  // Trim the most expensive non-boss stack first, never below its group minimum.
  let guard = 0;
  while (totalCost(out.monsters) > budget && guard++ < 40) {
    const trimmable = out.monsters
      .filter((e) => !e.boss && e.count > Math.max(1, num(e.min, 1)))
      .sort((a, b) => costOf(b.id) - costOf(a.id));
    if (!trimmable.length) {
      // Everything is at its minimum: drop the cheapest whole stack instead.
      const droppable = out.monsters.filter((e) => !e.boss);
      if (droppable.length <= 1) break;
      const worst = droppable.sort((a, b) => costOf(a.id) - costOf(b.id))[0];
      out.monsters.splice(out.monsters.indexOf(worst), 1);
      continue;
    }
    trimmable[0].count -= 1;
  }
  out.monsters = out.monsters.filter((e) => e.count > 0);

  // A modest spend-up: a roll well under budget gets one or two more of its
  // cheapest member, so a pack that rolled its minimum still feels like a pack.
  for (let pass = 0; pass < 2; pass++) {
    if (!out.monsters.length || totalCost(out.monsters) >= budget * 0.6) break;
    const cheap = out.monsters.filter((e) => !e.boss).sort((a, b) => costOf(a.id) - costOf(b.id))[0];
    if (!cheap || totalCost(out.monsters) + costOf(cheap.id) > budget) break;
    cheap.count += 1;
    cheap.max = Math.max(num(cheap.max, cheap.count), cheap.count);
  }
  out.xp = totalCost(out.monsters);
  return out;
}

/** Undead / darkvision / ambusher traits of one stat block, for time-of-day bias. */
function monsterTraits(id) {
  const m = getMonster(id);
  if (!m) return { undead: false, darkvision: false, ambusher: false };
  return {
    undead: lower(m.type) === 'undead',
    darkvision: num(m.senses?.darkvision, 0) > 0 || num(m.senses?.blindsight, 0) > 0 || num(m.senses?.truesight, 0) > 0,
    ambusher: lower(m.ai?.archetype) === 'ambusher' || num(m.skills?.stealth, 0) >= 4,
  };
}

/** The same, for a whole encounter group: any member counts. */
function groupTraits(groupId) {
  const g = MONSTER_GROUPS[groupId];
  const t = { undead: false, darkvision: false, ambusher: !!g?.ambush };
  for (const member of arr(g?.members)) {
    const id = Array.isArray(member) ? member[0] : member?.id;
    const mt = monsterTraits(id);
    t.undead = t.undead || mt.undead;
    t.darkvision = t.darkvision || mt.darkvision;
    t.ambusher = t.ambusher || mt.ambusher;
  }
  return t;
}

/**
 * Stealth versus passive Perception: who sees whom first.
 *
 *   monsters: [{id,count}]   the rolled spawn list (stat blocks are read for Stealth)
 *   passive:  number         the party's best passive Perception
 *   biome, night, weather    situational modifiers on the monsters' side
 *
 * Returns { ambush: true | 'party' | false, stealth, roll, passive, margin }:
 * `true` means the party is surprised, `'party'` means the foes are.
 */
export function ambushContest(o = {}) {
  const r = o.rng || (o.seed != null ? makeRNG(o.seed) : rng);
  let best = -Infinity;
  for (const e of arr(o.monsters)) {
    const m = getMonster(e?.id);
    if (!m) continue;
    let s = num(m.skills?.stealth, NaN);
    if (!Number.isFinite(s)) s = lower(m.ai?.archetype) === 'ambusher' ? 4 : abMod(num(m.abilities?.dex ?? m.dex, 10));
    if (s > best) best = s;
  }
  if (!Number.isFinite(best)) best = 0;
  const biome = lower(o.biome);
  let mod = 0;
  if (biome === 'forest' || biome === 'pine-forest' || biome === 'marsh' || biome === 'cave') mod += 2;
  if (o.night) mod += 2;
  const weather = lower(o.weather);
  if (weather === 'fog') mod += 3;
  else if (weather === 'rain' || weather === 'snow') mod += 1;
  const d20 = r.int(1, 20);
  const roll = d20 + best + mod;
  const passive = num(o.passive, 10);
  const margin = roll - passive;
  const ambush = margin >= 5 ? true : margin <= -5 ? 'party' : false;
  return { ambush, stealth: best + mod, roll, passive, margin };
}

/**
 * Convenience: roll an encounter AND build every Character in it, scaled to the
 * party. combat.js can hand the result straight to `new Encounter({ enemies })`.
 *
 * On the surface a creature whose printed CR sits more than two below the party
 * level is scaled up along its own ladder (a veteran goblin, not a baseline one);
 * elites turn up on the surface with a small level-driven chance.
 */
export function buildEncounterMonsters(spec, o = {}) {
  const level = Math.max(1, Math.floor(num(o.level ?? spec?.level, 1)));
  const depth = Math.max(0, Math.floor(num(o.depth ?? spec?.depth, 0)));
  const r = o.rng || makeRNG(o.seed != null ? o.seed : hashStr(`build:${level}:${depth}:${spec?.xp || 0}`));
  const out = [];
  for (const entry of arr(spec?.monsters)) {
    // An encounter may field a creature of its own (o.lookup); the stat block
    // object goes through the same scaler as a catalogue id would.
    const own = !getMonster(entry.id) && typeof o.lookup === 'function' ? o.lookup(entry.id) : null;
    const source = own || entry.id;
    const baseCR = num((own || getMonster(entry.id))?.cr, 0);
    for (let i = 0; i < Math.max(1, num(entry.count, 1)); i++) {
      const isBoss = !!entry.boss || entry.id === spec?.boss;
      // Deeper floors sprinkle elites; every fifth floor's headliner is a boss.
      const eliteChance = o.noElites ? 0
        : depth > 0 ? clamp(0.05 + depth * 0.02, 0, 0.35) : clamp(0.04 + level / 100, 0, 0.25);
      const elite = !isBoss && (entry.elite === true || r.chance(eliteChance));
      const outgrown = depth === 0 && !isBoss && (level - baseCR) > 2;
      const scaled = (depth > 0 || elite || isBoss || outgrown || o.forceScale)
        ? scaleMonster(source, level, { elite, boss: isBoss, depth, rng: r })
        : makeMonster(source, { rng: r, level });
      scaled.side = 'foe';
      out.push(scaled);
    }
  }
  return out;
}

// ===========================================================================
// LOOT
// ===========================================================================

/**
 * The magic-item tier a party of this level is allowed to find. Prefers the table in
 * data/items.js (MAGIC_TIERS) and falls back to a built-in ladder so a level-2 party
 * never turns up a Holy Avenger.
 */
export function magicTierFor(level) {
  const l = Math.max(1, Math.floor(num(level, 1)));
  const fallback = l <= 4
    ? { id: 'minor', rarities: ['common', 'uncommon'], plusMax: 1, chance: 0.10 }
    : l <= 10
      ? { id: 'lesser', rarities: ['common', 'uncommon', 'rare'], plusMax: 2, chance: 0.16 }
      : l <= 16
        ? { id: 'greater', rarities: ['uncommon', 'rare', 'very-rare'], plusMax: 2, chance: 0.22 }
        : { id: 'major', rarities: ['rare', 'very-rare', 'legendary'], plusMax: 3, chance: 0.28 };

  try {
    const table = MAGIC_TIERS;
    const entries = Array.isArray(table) ? table : (table && typeof table === 'object' ? Object.values(table) : []);
    let best = null;
    for (const t of entries) {
      if (!t || typeof t !== 'object') continue;
      const min = num(t.minLevel ?? t.min ?? t.level, 1);
      if (l < min) continue;
      if (!best || min >= num(best.minLevel ?? best.min ?? best.level, 1)) best = t;
    }
    if (best) {
      const rarities = arr(best.rarities || best.rarity).map(lower).filter((x) => RARITY[x]);
      return {
        id: best.id || fallback.id,
        rarities: rarities.length ? rarities : fallback.rarities,
        plusMax: num(best.plusMax ?? best.plus, fallback.plusMax),
        chance: num(best.chance, fallback.chance),
      };
    }
  } catch { /* the data table is not written yet — use the ladder */ }
  return fallback;
}

// Lazily-built index of magic items by rarity, so the loot roll is not O(catalogue).
let RARITY_INDEX = null;
function rarityIndex() {
  if (RARITY_INDEX) return RARITY_INDEX;
  RARITY_INDEX = {};
  try {
    for (const id of Object.keys(ITEMS || {})) {
      const it = ITEMS[id];
      if (!it) continue;
      const rar = lower(it.rarity || 'common');
      const magical = !!it.mech || !!it.magic || (rar !== 'common');
      if (!magical) continue;
      (RARITY_INDEX[rar] = RARITY_INDEX[rar] || []).push(id);
    }
  } catch { RARITY_INDEX = {}; }
  return RARITY_INDEX;
}

/** Base weapons and armour that a "+N" variant can be generated from. */
function plusBases() {
  const out = [];
  try {
    for (const id of Object.keys(ITEMS || {})) {
      const it = ITEMS[id];
      if (!it || it.generated) continue;
      if ((it.kind === 'weapon' || it.kind === 'armor' || it.kind === 'shield')
        && (lower(it.rarity || 'common') === 'common')) out.push(id);
    }
  } catch { /* ignore */ }
  return out;
}

/**
 * Roll a single magic item appropriate to a party level, either a catalogued item of
 * an allowed rarity or a generated "+N" variant of a mundane weapon or armour.
 */
export function rollMagicItem(level, r = rng) {
  const tier = magicTierFor(level);
  const rarities = tier.rarities.length ? tier.rarities : ['uncommon'];

  // 40% of the time, a plain +N piece of gear — the bread and butter of the tier.
  if (r.chance(0.4)) {
    const bases = plusBases();
    if (bases.length) {
      const plus = clamp(r.int(1, Math.max(1, tier.plusMax)), 1, 3);
      const v = magicVariant(r.pick(bases), plus);
      if (v) return v.id;
    }
  }

  const idx = rarityIndex();
  const pool = [];
  for (const rar of rarities) for (const id of idx[rar] || []) pool.push(id);
  if (!pool.length) return null;
  return r.pick(pool);
}

/**
 * Normalise whatever a stat block's `loot.table` turns out to be:
 * an array of [itemId, chance] pairs, a key into LOOT_TABLES, or an object with its
 * own `items` list. Always returns [[itemId, chance], ...].
 */
function resolveLootTable(spec) {
  if (!spec) return [];
  if (typeof spec === 'string') {
    try {
      const t = LOOT_TABLES?.[spec];
      return t ? resolveLootTable(t) : [];
    } catch { return []; }
  }
  if (Array.isArray(spec)) {
    return spec.map((e) => (Array.isArray(e) ? [e[0], num(e[1], 0.1)] : [e?.id, num(e?.chance, 0.1)]))
      .filter((e) => e[0]);
  }
  if (typeof spec === 'object') {
    if (spec.items || spec.table) return resolveLootTable(spec.items || spec.table);
    // A plain { itemId: chance } map.
    return Object.keys(spec).map((k) => [k, num(spec[k], 0.1)]);
  }
  return [];
}

/**
 * Roll the spoils of a finished encounter: gold and items off every defeated
 * creature, gated so the party never finds gear far above its tier.
 *
 * Returns { gold, items:[{id, qty, name}], xp, magic:[itemId] }.
 */
export function lootFor(enc, o = {}) {
  const out = { gold: 0, items: [], xp: 0, magic: [] };
  if (!enc) return out;

  const units = Array.isArray(enc.units) ? enc.units.filter(Boolean) : arr(enc.enemies);
  const party = units.filter((u) => u && u.side !== 'foe' && u.kind !== 'monster');
  const level = Math.max(1, num(o.level, party.length ? partyLevel(party) : 1));

  // Deterministic: the same encounter, defeated by the same party, drops the same loot.
  const stamp = units.map((u) => `${u.uid || ''}:${u.hp}`).join('|');
  const r = o.rng || makeRNG(hashStr(`loot:${num(enc.seed, 0)}:${stamp}`));

  const fallen = units.filter((u) => u && (u.side === 'foe' || u.kind === 'monster') && !isAlive(u));
  const tally = new Map();
  const give = (id, qty = 1) => {
    if (!id) return;
    tally.set(id, (tally.get(id) || 0) + qty);
  };

  for (const foe of fallen) {
    out.xp += Math.max(0, num(foe.xpValue, 0));

    const loot = foe.loot || getMonster(foe.monsterId)?.loot || null;
    if (!loot) continue;

    // Coin.
    if (loot.gold) {
      const g = typeof loot.gold === 'number' ? loot.gold : rollExpr(loot.gold, r).total;
      out.gold += Math.max(0, Math.floor(g));
    }

    // Table drops.
    for (const [itemId, chance] of resolveLootTable(loot.table ?? loot.tableId ?? loot.items)) {
      if (!resolveItem(itemId)) continue;
      // A chance above 1 is read as a percentage.
      const p = chance > 1 ? chance / 100 : chance;
      if (r.chance(clamp(p, 0, 1))) give(itemId, 1);
    }

    // Guaranteed drops, if the data lists any.
    for (const entry of arr(loot.always)) {
      const [id, qty] = Array.isArray(entry) ? entry : [entry, 1];
      if (resolveItem(id)) give(id, Math.max(1, num(qty, 1)));
    }
  }

  // --- a chance at something magical, gated by the party's tier ------------
  const tier = magicTierFor(level);
  // Tougher fights roll more often; a boss always gets one roll it is likely to pass.
  const bossFell = fallen.some((u) => u.boss);
  const rolls = (bossFell ? 2 : 0) + (fallen.length >= 4 ? 1 : 0) + 1;
  for (let i = 0; i < rolls; i++) {
    const p = tier.chance * (bossFell ? 1.8 : 1);
    if (!r.chance(clamp(p, 0, 0.9))) continue;
    const id = rollMagicItem(level, r);
    if (id) { give(id, 1); out.magic.push(id); }
  }

  for (const [id, qty] of tally) {
    const def = resolveItem(id) || getItem(id);
    out.items.push({ id, qty, name: def?.name || id, rarity: def?.rarity || 'common' });
  }

  // A little coin even from an empty-handed foe, so a fight is never worthless.
  if (!out.gold && fallen.length) out.gold = fallen.length * r.int(1, 3);
  return out;
}

/** Display helper: "CR 1/4 · 50 XP" for the bestiary and the encounter preview. */
export function encounterLine(spec) {
  if (!spec) return '';
  const bits = arr(spec.monsters).map((e) => `${e.count}x ${getMonster(e.id)?.name || e.id}`);
  return `${bits.join(', ')} — ${spec.xp} XP (${spec.difficulty})`;
}

/** Display helper for a single scaled creature: "Goblin Sharpshooter · CR 4". */
export function monsterLine(ch) {
  if (!ch) return '';
  return `${ch.name}${ch.cr != null ? ` · CR ${crText(ch.cr)}` : ''}`;
}
