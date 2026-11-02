// rules/progression.js — experience, levelling, the level-up choice engine,
// multiclassing, and the endless post-20 Mythic (Epic Boon) progression.

import { MAX_LEVEL, MAX_ABILITY, MAX_ABILITY_EPIC, ordinal } from '../constants.js';
import { ABILITIES, ABILITY_NAMES, SKILLS, mod } from './abilities.js';
import { hitPointsForLevel } from '../core/dice.js';
import { rng } from '../core/rng.js';
import { bus, EV } from '../core/events.js';
import {
  recomputeSpells, spellList, cantripsKnownFor, preparedMaxForClass, slotSummary,
  castingClasses, isPreparedCaster, slotKindForClass, highestSlotLevel, tableAt,
  setArcanum, MYSTIC_ARCANUM_LEVELS, FULL_SLOTS, HALF_SLOTS, THIRD_SLOTS, PACT_SLOTS,
} from './spellcasting.js';

// character.js owns `recalc`, the single derivation pass. It is imported as a
// NAMESPACE and every call is guarded, so progression.js keeps working even while
// the character layer is mid-rewrite. (character.js does not import this module,
// so there is no cycle.)
import * as Char from './character.js';

// The catalogues in src/data are authored in parallel. They are imported as
// NAMESPACES so a not-yet-written named export can never break module linking,
// and every lookup below defaults to an empty table.
import * as ClassData from '../data/classes.js';
import * as SubclassData from '../data/subclasses.js';
import * as BackgroundData from '../data/backgrounds.js';
import * as SpellData from '../data/spells.js';
import * as ItemData from '../data/items.js';
import * as MonsterData from '../data/monsters.js';

const CLASSES = ClassData.CLASSES || {};
const SUBCLASSES = SubclassData.SUBCLASSES || {};
const FEATS = BackgroundData.FEATS || {};
const SPELLS = SpellData.SPELLS || {};
const ITEMS = ItemData.ITEMS || {};
const WEAPON_MASTERY = ItemData.WEAPON_MASTERY || {};

/** Fighting styles: their own catalogue if present, else the feat entries. */
const FIGHTING_STYLES = BackgroundData.FIGHTING_STYLES
  || Object.fromEntries(Object.entries(FEATS).filter(([, f]) => f?.category === 'fighting-style'));

/** Epic Boons: their own catalogue if present, else feats tagged as boons. */
const EPIC_BOONS = BackgroundData.EPIC_BOONS
  || Object.fromEntries(Object.entries(FEATS).filter(([, f]) => f?.category === 'epic-boon'));

// ---------------------------------------------------------------------------
// 1. EXPERIENCE
// ---------------------------------------------------------------------------

/** The 5e experience table. Index = level - 1. */
export const XP_TABLE = Object.freeze([
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000,
  85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000,
]);

/** XP needed to reach a level. Past 20 this rolls into the Mythic tiers. */
export function xpForLevel(l) {
  const lv = Math.floor(l || 1);
  if (lv <= 1) return 0;
  if (lv <= MAX_LEVEL) return XP_TABLE[lv - 1];
  return mythicXpFor(lv - MAX_LEVEL);
}

/** The class level an XP total entitles you to. Capped at 20 — past that, Mythic tiers. */
export function levelForXp(xp) {
  const x = Math.max(0, Math.floor(xp || 0));
  let lv = 1;
  for (let i = 0; i < XP_TABLE.length; i++) if (x >= XP_TABLE[i]) lv = i + 1;
  return lv;
}

/** Earned advancement still awaiting player choices; XP is the authority. */
export function pendingLevelsFor(ch) {
  if (!ch) return 0;
  return Math.max(0, levelForXp(ch.xp || 0) - Math.max(1, Math.floor(ch.level || 1)));
}

/** 2024 proficiency bonus: 2 + floor((level-1)/4), capped at +6 by the level-20 ceiling. */
export function profForLevel(l) {
  const lv = Math.max(1, Math.min(MAX_LEVEL, Math.floor(l || 1)));
  return 2 + Math.floor((lv - 1) / 4);
}

/** Average hit points gained per level for each hit die (die/2 + 1, the 5e default). */
export const HIT_DIE_AVG = Object.freeze({ 4: 3, 6: 4, 8: 5, 10: 6, 12: 7 });

/** Accepts 8, 'd8' or '1d8'. */
export function hitDieSize(die) {
  if (typeof die === 'number') return die;
  const m = String(die || '').match(/(\d+)\s*$/);
  return m ? parseInt(m[1], 10) : 8;
}

export function hitDieAvg(die) {
  const d = hitDieSize(die);
  return HIT_DIE_AVG[d] ?? Math.floor(d / 2) + 1;
}

/** XP still owed before the next level (or the next Mythic tier past 20). */
export function xpToNext(ch) {
  const xp = Math.max(0, Math.floor(ch?.xp || 0));
  const lv = Math.max(1, Math.floor(ch?.level || levelForXp(xp)));
  if (lv < MAX_LEVEL) return Math.max(0, xpForLevel(lv + 1) - xp);
  const tier = mythicTierForXp(xp);
  return Math.max(0, mythicXpFor(tier + 1) - xp);
}

/** 0..1 progress through the current level, for the XP bar. */
export function xpProgress(ch) {
  const xp = Math.max(0, Math.floor(ch?.xp || 0));
  const lv = Math.max(1, Math.floor(ch?.level || levelForXp(xp)));
  const from = lv < MAX_LEVEL ? xpForLevel(lv) : mythicXpFor(mythicTierForXp(xp));
  const to = lv < MAX_LEVEL ? xpForLevel(lv + 1) : mythicXpFor(mythicTierForXp(xp) + 1);
  if (to <= from) return 1;
  return Math.max(0, Math.min(1, (xp - from) / (to - from)));
}

/**
 * Award experience to ONE character. Party splitting happens in scaling.js — this
 * function divides nothing. The character's level is NOT advanced here: it reports
 * the level-up so the UI can walk pendingChoicesFor / applyLevel.
 */
export function grantXp(ch, amount) {
  if (!ch) return { leveled: false, newLevel: 1, gained: 0, levels: [] };
  const gained = Math.max(0, Math.round(amount || 0));
  const before = Math.max(1, Math.floor(ch.level || levelForXp(ch.xp || 0)));
  const tierBefore = mythicTierForXp(ch.xp || 0);

  ch.xp = Math.max(0, Math.floor(ch.xp || 0) + gained);

  const newLevel = levelForXp(ch.xp);
  const tierAfter = mythicTierForXp(ch.xp);
  const leveled = newLevel > before;
  const levels = [];
  for (let l = before + 1; l <= newLevel; l++) levels.push(l);

  ch.flags = ch.flags || {};
  ch.flags.pendingLevels = pendingLevelsFor(ch);
  if (tierAfter > tierBefore) ch.flags.pendingMythic = tierAfter - mythicLevel(ch);

  bus.emit(EV.XP_GAIN, { ch, uid: ch.uid, amount: gained, xp: ch.xp, level: newLevel });
  if (leveled) bus.emit(EV.LEVEL_UP, { ch, uid: ch.uid, from: before, to: newLevel, levels });
  if (tierAfter > tierBefore) bus.emit(EV.LEVEL_UP, { ch, uid: ch.uid, mythic: true, tier: tierAfter });

  return {
    leveled, newLevel, from: before, levels, gained, xp: ch.xp,
    mythic: tierAfter > tierBefore, mythicTier: tierAfter,
  };
}

// ---------------------------------------------------------------------------
// 2. CLASS / SUBCLASS ACCESS
// ---------------------------------------------------------------------------

export function getClass(id) { return CLASSES[id] || null; }
export function getSubclass(id) { return SUBCLASSES[id] || null; }
export function className(id) { return CLASSES[id]?.name || id || '—'; }
export function subclassName(id) { return SUBCLASSES[id]?.name || id || '—'; }

export function classEntry(ch, classId) { return (ch?.classes || []).find((c) => c?.id === classId) || null; }
export function classLevelOf(ch, classId) { return classEntry(ch, classId)?.level || 0; }
export function totalLevel(ch) { return (ch?.classes || []).reduce((a, c) => a + (c?.level || 0), 0); }

/** The class a level-up defaults to: the one flagged as levelling, else the first. */
export function activeClassId(ch) {
  return ch?.flags?.levelingClass || ch?.classes?.[0]?.id || null;
}

/** The level at which a class picks its subclass (2024: 3 for every class). */
export function subclassLevelFor(classId) {
  return CLASSES[classId]?.subclassLevel ?? 3;
}

/** Class + subclass features granted at exactly this class level. */
export function featuresAtLevel(ch, classId, classLevel, subclassIdOverride) {
  const out = [];
  const cls = CLASSES[classId];
  for (const f of cls?.features?.[classLevel] || []) if (f) out.push({ f, source: cls?.name || classId, kind: 'class' });
  const subId = subclassIdOverride || classEntry(ch, classId)?.subclassId;
  const sub = SUBCLASSES[subId];
  for (const f of sub?.features?.[classLevel] || []) if (f) out.push({ f, source: sub?.name || subId, kind: 'subclass' });
  return out;
}

// ---------------------------------------------------------------------------
// 3. MULTICLASSING (2024 PHB)
// ---------------------------------------------------------------------------

/**
 * 2024 multiclass prerequisites: you need 13 in the PRIMARY ability of the class
 * you are leaving AND of the class you are joining. Classes with two primaries need
 * both (`all`) unless the class offers a choice (`any`, e.g. Fighter's Str OR Dex).
 */
export const MULTICLASS_REQ = Object.freeze({
  barbarian: { all: { str: 13 } },
  bard: { all: { cha: 13 } },
  cleric: { all: { wis: 13 } },
  druid: { all: { wis: 13 } },
  fighter: { any: { str: 13, dex: 13 } },
  monk: { all: { dex: 13, wis: 13 } },
  paladin: { all: { str: 13, cha: 13 } },
  ranger: { all: { dex: 13, wis: 13 } },
  rogue: { all: { dex: 13 } },
  sorcerer: { all: { cha: 13 } },
  warlock: { all: { cha: 13 } },
  wizard: { all: { int: 13 } },
});

/**
 * Proficiencies gained when you take your FIRST level in an additional class
 * (2024 Multiclassing table — deliberately narrower than the starting set).
 */
export const MULTICLASS_PROFS = Object.freeze({
  barbarian: { armor: ['light', 'medium', 'shields'], weapon: ['simple', 'martial'] },
  bard: { armor: ['light'], skills: 1, skillFrom: 'any', tool: ['musical-instrument'] },
  cleric: { armor: ['light', 'medium', 'shields'] },
  druid: { armor: ['light', 'medium', 'shields'] },
  fighter: { armor: ['light', 'medium', 'shields'], weapon: ['simple', 'martial'] },
  monk: { weapon: ['simple', 'martial-light'] },
  paladin: { armor: ['light', 'medium', 'shields'], weapon: ['simple', 'martial'] },
  ranger: { armor: ['light', 'medium', 'shields'], weapon: ['simple', 'martial'], skills: 1, skillFrom: 'class' },
  rogue: { armor: ['light'], tool: ['thieves-tools'], skills: 1, skillFrom: 'class' },
  sorcerer: {},
  warlock: { armor: ['light'], weapon: ['simple'] },
  wizard: {},
});

/** Ability score as the rules see it: base + every permanent bonus. */
export function scoreOf(ch, ab) {
  return (ch?.base?.[ab] ?? 10) + (ch?.asi?.[ab] ?? 0);
}

function meetsReq(ch, req) {
  if (!req) return true;
  if (req.all) {
    for (const ab of Object.keys(req.all)) if (scoreOf(ch, ab) < req.all[ab]) return false;
  }
  if (req.any) {
    const abs = Object.keys(req.any);
    if (abs.length && !abs.some((ab) => scoreOf(ch, ab) >= req.any[ab])) return false;
  }
  return true;
}

function reqText(req) {
  if (!req) return '';
  const fmt = (o, join) => Object.keys(o).map((ab) => `${ABILITY_NAMES[ab]} ${o[ab]}`).join(join);
  const bits = [];
  if (req.all) bits.push(fmt(req.all, ' and '));
  if (req.any) bits.push(fmt(req.any, ' or '));
  return bits.join(', ');
}

/**
 * Why this character may NOT take a level in `classId`, or null if they may.
 * Used to fill in `disabled`/`reason` on the level-up class options.
 */
export function multiclassReason(ch, classId) {
  if (!ch || !classId) return 'No class selected.';
  const cls = CLASSES[classId];
  if (!cls && Object.keys(CLASSES).length) return 'Unknown class.';
  if (totalLevel(ch) >= MAX_LEVEL) return `Level ${MAX_LEVEL} is the maximum — seek an Epic Boon instead.`;
  if (classLevelOf(ch, classId) >= MAX_LEVEL) return `Already ${MAX_LEVEL}th level in this class.`;

  // Already in the class: no prerequisite to re-check.
  if (classLevelOf(ch, classId) > 0) return null;
  if (!(ch.classes || []).length) return null;   // first class ever: no prerequisite

  const need = MULTICLASS_REQ[classId];
  if (need && !meetsReq(ch, need)) return `Requires ${reqText(need)}.`;
  for (const c of ch.classes || []) {
    const have = MULTICLASS_REQ[c.id];
    if (have && !meetsReq(ch, have)) return `Requires ${reqText(have)} to keep advancing as a ${className(c.id)}.`;
  }
  return null;
}

/** 2024 multiclass prerequisites, as a boolean. */
export function canMulticlass(ch, classId) {
  return multiclassReason(ch, classId) === null;
}

/** Every class this character could legally take their next level in. */
export function multiclassOptions(ch) {
  const ids = Object.keys(CLASSES).length ? Object.keys(CLASSES) : Object.keys(MULTICLASS_REQ);
  return ids.map((id) => {
    const have = classLevelOf(ch, id);
    const reason = multiclassReason(ch, id);
    const cls = CLASSES[id];
    return {
      id,
      name: have ? `${className(id)} ${have} → ${have + 1}` : `${className(id)} (new class)`,
      desc: have ? (cls?.desc || '') : `Take your first level of ${className(id)}. ${cls?.desc || ''}`.trim(),
      disabled: !!reason,
      reason: reason || undefined,
      classLevel: have,
      isNew: have === 0,
    };
  });
}

// ---------------------------------------------------------------------------
// 4. PER-CLASS PROGRESSION TABLES (fallbacks — data/classes.js wins when present)
// ---------------------------------------------------------------------------

/** ASI/feat levels. 2024 keeps 4/8/12/16/19 with fighter and rogue extras. */
const ASI_LEVELS = Object.freeze({
  _default: [4, 8, 12, 16, 19],
  fighter: [4, 6, 8, 12, 14, 16, 19],
  rogue: [4, 8, 10, 12, 16, 19],
});

export function asiLevelsFor(classId) {
  const cls = CLASSES[classId];
  if (Array.isArray(cls?.asiLevels)) return cls.asiLevels;
  return ASI_LEVELS[classId] || ASI_LEVELS._default;
}

/** Weapon Mastery counts per class level (2024). Index = class level. */
const MASTERY_COUNT = Object.freeze({
  fighter: [0, 3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6],
  barbarian: [0, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
  paladin: [0, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
  ranger: [0, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
  rogue: [0, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
});

export function masteryCountFor(classId, classLevel) {
  const cls = CLASSES[classId];
  if (Array.isArray(cls?.weaponMasteryCount)) return tableAt(cls.weaponMasteryCount, classLevel);
  const t = MASTERY_COUNT[classId];
  return t ? tableAt(t, classLevel) : 0;
}

/** Eldritch Invocations known by warlock level (2024). */
const INVOCATIONS_KNOWN = Object.freeze([0, 1, 3, 3, 3, 5, 5, 6, 6, 7, 7, 7, 8, 8, 8, 9, 9, 9, 10, 10, 10]);
/** Metamagic options known by sorcerer level (2024: 2 at 2nd, +1 at 10th and 17th). */
const METAMAGIC_KNOWN = Object.freeze([0, 0, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4]);
/** Wizard spellbook additions per level (6 at 1st, 2 each level after). */
const SPELLBOOK_PER_LEVEL = 2;

export function invocationsKnownFor(classId, classLevel) {
  if (classId !== 'warlock') return 0;
  const cls = CLASSES[classId];
  if (Array.isArray(cls?.invocationsKnown)) return tableAt(cls.invocationsKnown, classLevel);
  return tableAt(INVOCATIONS_KNOWN, classLevel);
}

export function metamagicKnownFor(classId, classLevel) {
  if (classId !== 'sorcerer') return 0;
  const cls = CLASSES[classId];
  if (Array.isArray(cls?.metamagicKnown)) return tableAt(cls.metamagicKnown, classLevel);
  return tableAt(METAMAGIC_KNOWN, classLevel);
}

/** Expertise levels when the class data doesn't spell them out. */
const EXPERTISE_LEVELS = Object.freeze({
  rogue: { 1: 2, 6: 2 },
  bard: { 2: 2, 9: 2 },
  ranger: { 2: 1, 9: 2 },
});

// ---------------------------------------------------------------------------
// 5. FALLBACK OPTION CATALOGUES
// Only consulted when data/classes.js or data/subclasses.js hasn't supplied a
// `from` list, so the level-up UI never shows an empty picker.
// ---------------------------------------------------------------------------

const listify = (obj) => Object.keys(obj).map((id) => ({ id, name: obj[id].name, desc: obj[id].desc || '' }));

/** 2024 Battle Master maneuvers. */
export const MANEUVERS = Object.freeze({
  ambush: { name: 'Ambush', desc: 'Add the superiority die to a Stealth check or Initiative roll.' },
  'bait-and-switch': { name: 'Bait and Switch', desc: 'Swap places with an ally and grant them the die as AC.' },
  'commanders-strike': { name: "Commander's Strike", desc: 'Give up an attack so an ally may strike, adding the die.' },
  'commanding-presence': { name: 'Commanding Presence', desc: 'Add the die to Intimidation, Performance or Persuasion.' },
  'disarming-attack': { name: 'Disarming Attack', desc: 'Damage plus the die; Strength save or the target drops a held item.' },
  'distracting-strike': { name: 'Distracting Strike', desc: 'Damage plus the die; the next attack on that target has advantage.' },
  'evasive-footwork': { name: 'Evasive Footwork', desc: 'Add the die to AC while you move.' },
  'feinting-attack': { name: 'Feinting Attack', desc: 'Bonus action feint: advantage on the attack, plus the die on damage.' },
  'goading-attack': { name: 'Goading Attack', desc: 'Wisdom save or the target has disadvantage attacking anyone but you.' },
  'lunging-attack': { name: 'Lunging Attack', desc: 'Five extra feet of reach on a melee attack, plus the die.' },
  'maneuvering-attack': { name: 'Maneuvering Attack', desc: 'An ally may move half their speed without provoking.' },
  'menacing-attack': { name: 'Menacing Attack', desc: 'Wisdom save or the target is frightened of you until your next turn.' },
  parry: { name: 'Parry', desc: 'Reaction: reduce melee damage taken by the die plus your Dexterity modifier.' },
  'precision-attack': { name: 'Precision Attack', desc: 'Add the die to an attack roll, before or after you see the d20.' },
  'pushing-attack': { name: 'Pushing Attack', desc: 'Strength save or the target is pushed up to 15 feet away.' },
  rally: { name: 'Rally', desc: 'Bonus action: an ally gains temporary hit points from the die.' },
  riposte: { name: 'Riposte', desc: 'Reaction: when a creature misses you in melee, strike back with the die.' },
  'sweeping-attack': { name: 'Sweeping Attack', desc: 'On a hit, deal the die in damage to a second creature nearby.' },
  'tactical-assessment': { name: 'Tactical Assessment', desc: 'Add the die to History, Insight or Investigation.' },
  'trip-attack': { name: 'Trip Attack', desc: 'Strength save or the target falls prone.' },
});

/** 2024 Metamagic options. */
export const METAMAGIC = Object.freeze({
  'careful-spell': { name: 'Careful Spell', desc: '1 SP: chosen creatures automatically succeed on the save.', cost: 1 },
  'distant-spell': { name: 'Distant Spell', desc: '1 SP: double a spell\'s range, or give a touch spell 30 feet.', cost: 1 },
  'empowered-spell': { name: 'Empowered Spell', desc: '1 SP: reroll damage dice up to your Charisma modifier.', cost: 1 },
  'extended-spell': { name: 'Extended Spell', desc: '1 SP: double the duration, up to 24 hours, with advantage on the first concentration save.', cost: 1 },
  'heightened-spell': { name: 'Heightened Spell', desc: '2 SP: one target has disadvantage on its first save against the spell.', cost: 2 },
  'quickened-spell': { name: 'Quickened Spell', desc: '2 SP: cast an action spell as a bonus action.', cost: 2 },
  'seeking-spell': { name: 'Seeking Spell', desc: '1 SP: reroll a missed spell attack.', cost: 1 },
  'subtle-spell': { name: 'Subtle Spell', desc: '1 SP: cast without verbal, somatic or material components.', cost: 1 },
  'transmuted-spell': { name: 'Transmuted Spell', desc: '1 SP: change acid, cold, fire, lightning, poison or thunder damage to another of those types.', cost: 1 },
  'twinned-spell': { name: 'Twinned Spell', desc: '1 SP: a single-target spell targets a second creature.', cost: 1 },
});

/**
 * 2024 Eldritch Invocations. `prereq` is checked against warlock level, known
 * spells and other invocations so the picker can grey out what you can't take.
 */
export const INVOCATIONS = Object.freeze({
  'agonizing-blast': { name: 'Agonizing Blast', desc: 'Add your Charisma modifier to one damage roll of a chosen warlock cantrip.', prereq: { cantrip: true } },
  'armor-of-shadows': { name: 'Armor of Shadows', desc: 'Cast Mage Armor on yourself at will, without a slot.' },
  'ascendant-step': { name: 'Ascendant Step', desc: 'Cast Levitate on yourself at will, without a slot.', prereq: { level: 9 } },
  'devils-sight': { name: "Devil's Sight", desc: 'See normally in darkness, magical or not, out to 120 feet.' },
  'devouring-blade': { name: 'Devouring Blade', desc: 'Your Thirsting Blade attacks once more with the Attack action.', prereq: { level: 12, invocation: 'thirsting-blade' } },
  'eldritch-mind': { name: 'Eldritch Mind', desc: 'Advantage on Constitution saves to maintain concentration.' },
  'eldritch-smite': { name: 'Eldritch Smite', desc: 'Expend a pact slot to deal 1d8 force per slot level and knock Large or smaller creatures prone.', prereq: { level: 5, invocation: 'pact-of-the-blade' } },
  'eldritch-spear': { name: 'Eldritch Spear', desc: 'A chosen warlock cantrip gains a range of 300 feet.', prereq: { cantrip: true } },
  'fiendish-vigor': { name: 'Fiendish Vigor', desc: 'Cast False Life on yourself at will as a level 1 spell.' },
  'gaze-of-two-minds': { name: 'Gaze of Two Minds', desc: 'Touch a willing creature and perceive through its senses.' },
  'gift-of-the-depths': { name: 'Gift of the Depths', desc: 'Breathe underwater, gain a swim speed, and cast Water Breathing once per long rest.', prereq: { level: 5 } },
  'gift-of-the-protectors': { name: 'Gift of the Protectors', desc: 'Warded creatures drop to 1 hit point instead of 0 once per long rest.', prereq: { level: 9, invocation: 'pact-of-the-tome' } },
  'investment-of-the-chain-master': { name: 'Investment of the Chain Master', desc: 'Your familiar gains flight, a magical attack and your save DC.', prereq: { level: 5, invocation: 'pact-of-the-chain' } },
  'lessons-of-the-first-ones': { name: 'Lessons of the First Ones', desc: 'Gain an Origin feat of your choice.', repeatable: true },
  'mask-of-many-faces': { name: 'Mask of Many Faces', desc: 'Cast Disguise Self at will, without a slot.' },
  'master-of-myriad-forms': { name: 'Master of Myriad Forms', desc: 'Cast Alter Self at will, without a slot.', prereq: { level: 5 } },
  'misty-visions': { name: 'Misty Visions', desc: 'Cast Silent Image at will, without a slot.' },
  'one-with-shadows': { name: 'One with Shadows', desc: 'Cast Invisibility on yourself in dim light or darkness, without a slot.', prereq: { level: 5 } },
  'otherworldly-leap': { name: 'Otherworldly Leap', desc: 'Cast Jump on yourself at will, without a slot.', prereq: { level: 5 } },
  'pact-of-the-blade': { name: 'Pact of the Blade', desc: 'Conjure a pact weapon as a bonus action; it uses Charisma for attack and damage.' },
  'pact-of-the-chain': { name: 'Pact of the Chain', desc: 'Cast Find Familiar as a ritual, gaining imp, pseudodragon, quasit, skeleton or sprite forms.' },
  'pact-of-the-tome': { name: 'Pact of the Tome', desc: 'A Book of Shadows grants three cantrips and two level 1 rituals from any list.' },
  'repelling-blast': { name: 'Repelling Blast', desc: 'A chosen warlock cantrip pushes Large or smaller creatures 10 feet away.', prereq: { cantrip: true } },
  'thirsting-blade': { name: 'Thirsting Blade', desc: 'Attack twice with your pact weapon when you take the Attack action.', prereq: { level: 5, invocation: 'pact-of-the-blade' } },
  'visions-of-distant-realms': { name: 'Visions of Distant Realms', desc: 'Cast Arcane Eye at will, without a slot.', prereq: { level: 15 } },
  'whispers-of-the-grave': { name: 'Whispers of the Grave', desc: 'Cast Speak with Dead at will, without a slot.', prereq: { level: 9 } },
  'witch-sight': { name: 'Witch Sight', desc: 'See the true form of any shapechanger or illusion-cloaked creature within 30 feet.', prereq: { level: 15 } },
});

/** 2024 Circle of the Land terrains. */
export const LAND_CIRCLES = Object.freeze({
  arid: { name: 'Arid Land', desc: 'Deserts and the Anauroch: blur, burning hands, fire bolt, fireball, blight, wall of stone.' },
  polar: { name: 'Polar Land', desc: 'The Spine of the World: fog cloud, hold person, sleet storm, slow, cone of cold.' },
  temperate: { name: 'Temperate Land', desc: 'Neverwinter Wood and the Dessarin: misty step, shatter, lightning bolt, freedom of movement, tree stride.' },
  tropical: { name: 'Tropical Land', desc: 'The far south: ray of sickness, web, stinking cloud, polymorph, insect plague.' },
});

/** Dragonborn / Draconic Sorcery ancestries. */
export const DRAGON_ANCESTRIES = Object.freeze({
  black: { name: 'Black Dragon', desc: 'Acid damage; a line breath weapon.', damage: 'acid' },
  blue: { name: 'Blue Dragon', desc: 'Lightning damage; a line breath weapon.', damage: 'lightning' },
  brass: { name: 'Brass Dragon', desc: 'Fire damage; a line breath weapon.', damage: 'fire' },
  bronze: { name: 'Bronze Dragon', desc: 'Lightning damage; a line breath weapon.', damage: 'lightning' },
  copper: { name: 'Copper Dragon', desc: 'Acid damage; a line breath weapon.', damage: 'acid' },
  gold: { name: 'Gold Dragon', desc: 'Fire damage; a cone breath weapon.', damage: 'fire' },
  green: { name: 'Green Dragon', desc: 'Poison damage; a cone breath weapon.', damage: 'poison' },
  red: { name: 'Red Dragon', desc: 'Fire damage; a cone breath weapon.', damage: 'fire' },
  silver: { name: 'Silver Dragon', desc: 'Cold damage; a cone breath weapon.', damage: 'cold' },
  white: { name: 'White Dragon', desc: 'Cold damage; a cone breath weapon.', damage: 'cold' },
});

/** Fighting styles when data/backgrounds.js hasn't provided them. */
const FALLBACK_STYLES = Object.freeze({
  archery: { name: 'Archery', desc: '+2 to attack rolls with ranged weapons.' },
  blind_fighting: { name: 'Blind Fighting', desc: 'Blindsight out to 10 feet.' },
  defense: { name: 'Defense', desc: '+1 AC while wearing armour.' },
  dueling: { name: 'Dueling', desc: '+2 damage with a one-handed melee weapon and no other weapon.' },
  'great-weapon-fighting': { name: 'Great Weapon Fighting', desc: 'Rolls of 1 or 2 on a two-handed weapon\'s damage die become 3.' },
  interception: { name: 'Interception', desc: 'Reaction: reduce damage to a nearby creature by 1d10 + proficiency.' },
  protection: { name: 'Protection', desc: 'Reaction: impose disadvantage on an attack against a creature next to you.' },
  'thrown-weapon-fighting': { name: 'Thrown Weapon Fighting', desc: '+2 damage with thrown weapons.' },
  'two-weapon-fighting': { name: 'Two-Weapon Fighting', desc: 'Add your ability modifier to the off-hand attack\'s damage.' },
  'unarmed-fighting': { name: 'Unarmed Fighting', desc: 'Unarmed strikes deal 1d6 (1d8 with both hands free).' },
});

function styleCatalogue() {
  return Object.keys(FIGHTING_STYLES).length ? FIGHTING_STYLES : FALLBACK_STYLES;
}

// ---------------------------------------------------------------------------
// 6. OPTION BUILDERS
// Every builder returns [{ id, name, desc, disabled, reason }] so the level-up UI
// can render a greyed-out row and explain exactly why a pick is unavailable.
// ---------------------------------------------------------------------------

const opt = (id, name, desc = '', disabled = false, reason = undefined) => (
  disabled ? { id, name, desc, disabled: true, reason } : { id, name, desc, disabled: false }
);

/** An array from ch.choices, created on demand and never shared. */
export function chosen(ch, key) {
  const v = ch?.choices?.[key];
  return Array.isArray(v) ? v : [];
}

/** Resolve a `from` field: 'auto' (whole catalogue), a list of ids, or ready-made options. */
function optionsFromList(from, catalogue, taken = []) {
  const cat = catalogue || {};
  if (!from || from === 'auto') {
    return Object.keys(cat).map((id) => opt(
      id, cat[id].name || id, cat[id].desc || '',
      taken.includes(id), taken.includes(id) ? 'Already chosen.' : undefined,
    ));
  }
  if (!Array.isArray(from)) return [];
  return from.map((e) => {
    if (e && typeof e === 'object') {
      return opt(e.id, e.name || e.id, e.desc || '', !!e.disabled || taken.includes(e.id),
        e.reason || (taken.includes(e.id) ? 'Already chosen.' : undefined));
    }
    const entry = cat[e] || {};
    return opt(e, entry.name || e, entry.desc || '', taken.includes(e), taken.includes(e) ? 'Already chosen.' : undefined);
  });
}

/** Why this feat is unavailable, or null. Handles level, ability, feat and class gates. */
export function featPrereqReason(ch, feat, level) {
  if (!feat) return 'Unknown feat.';
  if ((ch?.featIds || []).includes(feat.id) && !feat.repeatable) return 'You already have this feat.';
  const p = feat.prereq;
  if (!p) return null;
  if (p.level && (level || totalLevel(ch)) < p.level) return `Requires level ${p.level}.`;
  if (p.ability) {
    for (const ab of Object.keys(p.ability)) {
      if (scoreOf(ch, ab) < p.ability[ab]) return `Requires ${ABILITY_NAMES[ab]} ${p.ability[ab]}.`;
    }
  }
  if (p.feat && !(ch?.featIds || []).includes(p.feat)) return `Requires the ${FEATS[p.feat]?.name || p.feat} feat.`;
  if (p.class && !(ch?.classes || []).some((c) => c.id === p.class)) return `Requires a level in ${className(p.class)}.`;
  if (p.spellcasting && !castingClasses(ch).length) return 'Requires the Spellcasting or Pact Magic feature.';
  if (p.prof && !((ch?.profs?.armor || []).includes(p.prof) || (ch?.profs?.weapon || []).includes(p.prof))) {
    return `Requires ${p.prof} proficiency.`;
  }
  return null;
}

/** Feat options in the given categories, prerequisites resolved. */
export function featOptions(ch, level, categories = ['general']) {
  const cats = new Set(categories);
  return Object.keys(FEATS)
    .filter((id) => cats.has(FEATS[id]?.category || 'general'))
    .map((id) => {
      const f = { id, ...FEATS[id] };
      const reason = featPrereqReason(ch, f, level);
      return opt(`feat:${id}`, f.name || id, f.desc || '', !!reason, reason || undefined);
    })
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

/** The six abilities, flagged when they have hit the ceiling (20 normally, 30 for boons). */
export function abilityOptions(ch, cap = MAX_ABILITY) {
  return ABILITIES.map((ab) => {
    const s = scoreOf(ch, ab);
    const m = mod(s);
    return opt(ab, `${ABILITY_NAMES[ab]} ${s}`, `Modifier ${m >= 0 ? '+' : ''}${m}.`,
      s >= cap, s >= cap ? `Already at the maximum of ${cap}.` : undefined);
  });
}

/** Skills the character is proficient in but has not yet doubled. */
export function expertiseOptions(ch) {
  const skills = ch?.skills || {};
  return Object.keys(SKILLS).map((id) => {
    const state = skills[id];
    const already = state === 'expert';
    const notProf = !state;
    return opt(id, SKILLS[id].name, SKILLS[id].desc || '',
      already || notProf,
      already ? 'Already Expertise.' : notProf ? 'You are not proficient in this skill.' : undefined);
  });
}

/** Skill options for a class or feature grant. */
export function skillOptionsFrom(ch, from) {
  const ids = Array.isArray(from) && from.length ? from : Object.keys(SKILLS);
  return ids.filter((id) => SKILLS[id]).map((id) => {
    const have = !!ch?.skills?.[id];
    return opt(id, SKILLS[id].name, SKILLS[id].desc || '', have, have ? 'Already proficient.' : undefined);
  });
}

/** Is this character proficient with the weapon (by category or by name)? */
function weaponProficient(ch, item) {
  const list = ch?.profs?.weapon || [];
  if (!list.length) return true;                       // unknown proficiencies: never block the UI
  if (list.includes(item.id)) return true;
  if (list.includes(item.category)) return true;       // 'simple' / 'martial'
  // Monks are proficient with Martial weapons that have the Light property.
  if (list.includes('martial-light') && item.category === 'martial' && (item.props || []).includes('light')) return true;
  return false;
}

/** Weapons whose Weapon Mastery property the character could take up. */
export function masteryOptions(ch, taken = []) {
  const out = [];
  for (const id of Object.keys(ITEMS)) {
    const it = ITEMS[id];
    if (!it || it.kind !== 'weapon' || !it.mastery || it.generated) continue;
    const mast = WEAPON_MASTERY[it.mastery] || {};
    const have = taken.includes(id);
    const prof = weaponProficient(ch, it);
    out.push(opt(id, `${it.name} — ${mast.name || it.mastery}`, mast.desc || '',
      have || !prof,
      have ? 'Already mastered.' : !prof ? 'You lack proficiency with this weapon.' : undefined));
  }
  return out.sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

/** Cantrips from a class list that the character does not already know. */
export function cantripOptions(ch, classId) {
  const known = new Set(ch?.spells?.cantrips || []);
  return spellList(classId, 0, 0).map((id) => {
    const s = SPELLS[id] || {};
    return opt(id, s.name || id, s.desc || '', known.has(id), known.has(id) ? 'Already known.' : undefined);
  });
}

/** Levelled spells from a class list, capped by the slots the character will own. */
export function spellOptions(ch, classId, { maxLevel = null, exactLevel = null, exclude = [] } = {}) {
  const cap = exactLevel ?? (maxLevel ?? Math.max(1, highestSlotLevel(ch)));
  const skip = new Set([...(ch?.spells?.known || []), ...(ch?.spells?.prepared || []), ...exclude]);
  return spellList(classId, cap, exactLevel ?? 1)
    .filter((id) => (exactLevel == null ? true : SPELLS[id]?.level === exactLevel))
    .map((id) => {
      const s = SPELLS[id] || {};
      const lvl = s.level === 0 ? 'Cantrip' : `Level ${s.level}`;
      return opt(id, s.name || id, `${lvl} ${s.school || ''} — ${s.desc || ''}`.trim(),
        skip.has(id), skip.has(id) ? 'Already known.' : undefined);
    });
}

/** Battle Master maneuvers not already learned. */
export function maneuverOptions(ch, from = null) {
  return optionsFromList(from, MANEUVERS, chosen(ch, 'maneuvers'));
}

/** Metamagic options not already learned. */
export function metamagicOptions(ch, from = null) {
  return optionsFromList(from, METAMAGIC, chosen(ch, 'metamagic'));
}

/** Fighting styles not already taken. */
export function styleOptions(ch, from = null) {
  return optionsFromList(from, styleCatalogue(), chosen(ch, 'fightingStyle'));
}

/**
 * Eldritch Invocations with the 2024 prerequisites resolved: warlock level, a
 * required pact invocation, and "must know a warlock cantrip" for the blast riders.
 */
export function invocationOptions(ch, warlockLevel, from = null) {
  const have = chosen(ch, 'invocations');
  const cantrips = ch?.spells?.cantrips || [];
  return optionsFromList(from, INVOCATIONS, have).map((o) => {
    if (o.disabled) return o;
    const p = INVOCATIONS[o.id]?.prereq;
    if (!p) return o;
    if (p.level && warlockLevel < p.level) return opt(o.id, o.name, o.desc, true, `Requires warlock level ${p.level}.`);
    if (p.invocation && !have.includes(p.invocation)) {
      return opt(o.id, o.name, o.desc, true, `Requires the ${INVOCATIONS[p.invocation]?.name || p.invocation} invocation.`);
    }
    if (p.cantrip && !cantrips.length) return opt(o.id, o.name, o.desc, true, 'Requires a warlock cantrip.');
    return o;
  });
}

/** Subclasses available to a class. */
export function subclassOptions(ch, classId) {
  const cls = CLASSES[classId];
  const ids = cls?.subclasses?.length
    ? cls.subclasses
    : Object.keys(SUBCLASSES).filter((k) => SUBCLASSES[k]?.classId === classId);
  return ids.map((id) => opt(id, SUBCLASSES[id]?.name || id, SUBCLASSES[id]?.desc || ''));
}

/** Beast forms a druid may learn, capped by the Wild Shape CR limit for their level. */
export function wildShapeOptions(ch, maxCR, taken = []) {
  const MONSTERS = MonsterData.MONSTERS || {};
  const ids = typeof MonsterData.monstersByType === 'function'
    ? MonsterData.monstersByType('beast')
    : Object.keys(MONSTERS).filter((id) => MONSTERS[id]?.type === 'beast');
  return ids
    .filter((id) => MONSTERS[id] && (MONSTERS[id].cr ?? 0) <= maxCR && !MONSTERS[id].boss)
    .map((id) => {
      const m = MONSTERS[id];
      const has = taken.includes(id);
      return opt(id, m.name || id,
        `CR ${m.cr ?? 0} ${m.size || 'medium'} beast — AC ${m.ac ?? 10}, speed ${m.speed ?? 30} ft.`,
        has, has ? 'Already a known form.' : undefined);
    })
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

/** Named option sets for subclass decisions the data may not spell out. */
const SPECIAL_OPTIONS = Object.freeze({
  'circle-of-the-land': { key: 'landCircle', title: 'Land Circle', catalogue: LAND_CIRCLES, desc: 'Choose the terrain your circle draws its magic from.' },
  'land-circle': { key: 'landCircle', title: 'Land Circle', catalogue: LAND_CIRCLES, desc: 'Choose the terrain your circle draws its magic from.' },
  'draconic-sorcery': { key: 'ancestry', title: 'Draconic Ancestry', catalogue: DRAGON_ANCESTRIES, desc: 'Choose the dragon whose blood runs in you.' },
  draconic: { key: 'ancestry', title: 'Draconic Ancestry', catalogue: DRAGON_ANCESTRIES, desc: 'Choose the dragon whose blood runs in you.' },
  'draconic-ancestry': { key: 'ancestry', title: 'Draconic Ancestry', catalogue: DRAGON_ANCESTRIES, desc: 'Choose the dragon whose blood runs in you.' },
});

// ---------------------------------------------------------------------------
// 7. pendingChoicesFor — the engine behind the level-up UI
// ---------------------------------------------------------------------------

/** Push a choice, keeping ids unique (a duplicate is suffixed with its feature id). */
function pushChoice(out, seen, choice, featureId) {
  if (!choice || !choice.id) return;
  let c = choice;
  if (seen.has(c.id)) {
    if (!featureId) return;
    c = { ...c, id: `${c.id}:${featureId}` };
    if (seen.has(c.id)) return;
  }
  seen.add(c.id);
  out.push(c);
}

/** 2024 Wild Shape: forms known and the CR ceiling, by druid level. */
function wildShapeFormsFor(druidLevel) {
  if (druidLevel >= 8) return 8;
  if (druidLevel >= 4) return 6;
  if (druidLevel >= 2) return 4;
  return 0;
}
function wildShapeMaxCR(druidLevel) {
  if (druidLevel >= 8) return 1;
  if (druidLevel >= 4) return 0.5;
  return 0.25;
}

/** Turn one data-driven feature `choice` block into a Choice for the UI. */
function choiceFromFeature(ch, classId, classLevel, f, source) {
  const c = f.choice;
  if (!c) return null;
  const count = Math.max(1, c.count || 1);
  const base = { desc: f.desc || '', source, feature: f.id, count, auto: false };

  switch (c.type) {
    case 'fightingStyle':
      return { ...base, id: 'fighting-style', type: 'fightingStyle', title: f.name || 'Fighting Style', options: styleOptions(ch, c.from) };
    case 'maneuver':
      return { ...base, id: 'maneuvers', type: 'maneuver', title: f.name || 'Combat Maneuvers', options: maneuverOptions(ch, c.from) };
    case 'metamagic':
      return { ...base, id: 'metamagic', type: 'metamagic', title: f.name || 'Metamagic', options: metamagicOptions(ch, c.from) };
    case 'invocation':
      return { ...base, id: 'invocations', type: 'invocation', title: f.name || 'Eldritch Invocations', options: invocationOptions(ch, classLevel, c.from) };
    case 'expertise':
      return { ...base, id: 'expertise', type: 'expertise', title: f.name || 'Expertise', options: expertiseOptions(ch) };
    case 'cantrip':
      return { ...base, id: 'cantrips', type: 'cantrip', title: f.name || 'New Cantrips', options: cantripOptions(ch, classId) };
    case 'spell':
      return { ...base, id: 'spells-known', type: 'spell', title: f.name || 'New Spells', options: spellOptions(ch, classId) };
    case 'skill':
      return { ...base, id: 'skill', type: 'skill', title: f.name || 'Skill Proficiency', options: skillOptionsFrom(ch, c.from) };
    case 'mastery':
      return { ...base, id: 'masteries', type: 'mastery', title: f.name || 'Weapon Mastery', options: masteryOptions(ch, chosen(ch, 'masteries')) };
    case 'feat':
      return { ...base, id: `feat:${f.id || classLevel}`, type: 'feat', title: f.name || 'Feat', options: featOptions(ch, totalLevel(ch) + 1, ['general', 'origin']) };
    case 'asi':
      return null;   // handled by the ASI/feat block in pendingChoicesFor so both paths agree
    case 'subclass':
      // The class data restates the subclass pick as a feature choice. Render it with
      // real subclass names; pendingChoicesFor drops it when it already asked.
      return { ...base, id: 'subclass', type: 'subclass', title: f.name || `${className(classId)} Subclass`, options: subclassOptions(ch, classId) };
    case 'subclassOption': {
      const spec = SPECIAL_OPTIONS[f.id] || SPECIAL_OPTIONS[classEntry(ch, classId)?.subclassId] || null;
      return {
        ...base,
        id: spec ? spec.key : `option:${f.id || classLevel}`,
        type: 'subclassOption',
        title: f.name || spec?.title || 'Choose an Option',
        desc: f.desc || spec?.desc || '',
        options: optionsFromList(c.from, spec?.catalogue || {}),
      };
    }
    default:
      return { ...base, id: `option:${f.id || c.type}`, type: c.type || 'option', title: f.name || 'Choose an Option', options: optionsFromList(c.from, {}) };
  }
}

/**
 * Everything the player must decide in order to take `level`.
 *
 * `level` is the character's NEW TOTAL level, or `{ level, classId }`.
 * If the returned list contains a `class` choice, resolve it first and call again
 * with `opts.classId` set — every other choice depends on which class advances.
 *
 * Choice: { id, type, title, desc, count, options:[{id,name,desc,disabled,reason}], auto }
 * Swap choices carry `optional:true`, a `none` option, and a `replacements` list.
 */
export function pendingChoicesFor(ch, level, opts = {}) {
  const out = [];
  const seen = new Set();
  if (!ch) return out;

  const asObj = level && typeof level === 'object' ? level : null;
  const newTotal = Math.max(1, Math.floor(asObj ? asObj.level : (level || totalLevel(ch) + 1)));
  const classId = opts.classId || asObj?.classId || activeClassId(ch) || Object.keys(CLASSES)[0];
  const explicitClass = !!(opts.classId || asObj?.classId);

  // --- which class advances? ----------------------------------------------
  if (!explicitClass && newTotal > 1 && (ch.classes || []).length) {
    const options = multiclassOptions(ch);
    if (options.filter((o) => !o.disabled).length > 1) {
      pushChoice(out, seen, {
        id: 'class', type: 'class', title: 'Advance a Class', count: 1, auto: false,
        desc: 'Take your next level in a class you already follow, or begin a new one.',
        options,
      });
      // Everything below depends on the answer; the UI re-queries with opts.classId.
      if (opts.stopAtClass !== false) return out;
    }
  }

  const cls = CLASSES[classId];
  const curClassLevel = classLevelOf(ch, classId);
  const newClassLevel = curClassLevel + 1;
  const isNewClass = curClassLevel === 0 && (ch.classes || []).length > 0;
  const hitDie = hitDieSize(cls?.hitDie || 8);

  // --- joining a new class grants a skill from the multiclass table --------
  if (isNewClass) {
    const mp = MULTICLASS_PROFS[classId];
    if (mp?.skills) {
      const from = mp.skillFrom === 'class' ? (cls?.skillChoices?.from || []) : [];
      pushChoice(out, seen, {
        id: 'multiclass-skill', type: 'skill', title: `${className(classId)} Skill`, count: mp.skills, auto: false,
        desc: `Joining the ${className(classId)} class grants a skill proficiency.`,
        options: skillOptionsFrom(ch, from),
      });
    }
  }

  // --- subclass ------------------------------------------------------------
  const subLevel = subclassLevelFor(classId);
  const pickedSub = opts.subclassId || classEntry(ch, classId)?.subclassId || null;
  if (newClassLevel === subLevel && !classEntry(ch, classId)?.subclassId) {
    pushChoice(out, seen, {
      id: 'subclass', type: 'subclass', title: `${className(classId)} Subclass`, count: 1, auto: false,
      desc: `At ${ordinal(subLevel)} level you commit to a path. The choice is permanent.`,
      options: subclassOptions(ch, classId),
    });
  }

  // --- data-driven feature choices -----------------------------------------
  for (const { f, source } of featuresAtLevel(ch, classId, newClassLevel, pickedSub)) {
    const c = choiceFromFeature(ch, classId, newClassLevel, f, source);
    if (!c) continue;
    // data/classes.js usually declares the subclass pick as a feature choice too.
    // The dedicated `subclass` choice above already covers it — never ask twice.
    if (seen.has('subclass') && (c.type === 'subclass' || c.type === 'subclassOption')
      && (c.options || []).some((o) => SUBCLASSES[o.id]?.classId === classId
        || (cls?.subclasses || []).includes(o.id))) continue;
    pushChoice(out, seen, c, f.id);
  }

  // --- Ability Score Improvement or a feat ---------------------------------
  if (asiLevelsFor(classId).includes(newClassLevel)) {
    // 2024: the 19th-level improvement is traditionally spent on an Epic Boon feat.
    const epic = newTotal >= 19;
    pushChoice(out, seen, {
      id: 'asi', type: 'asi', title: 'Ability Score Improvement', count: 1, auto: false,
      desc: epic
        ? 'Increase one ability by 2, or two abilities by 1 (maximum 20) — or take a feat. At 19th level an Epic Boon is the traditional reward.'
        : 'Increase one ability score by 2, or two ability scores by 1 each (maximum 20) — or take a feat instead.',
      abilities: abilityOptions(ch),
      options: [
        opt('asi', 'Ability Score Improvement', '+2 to one ability, or +1 to two abilities. Maximum 20.'),
        ...featOptions(ch, newTotal, epic ? ['general', 'epic-boon'] : ['general']),
      ],
    });
  }

  // --- spellcasting ---------------------------------------------------------
  pushSpellChoices(out, seen, ch, classId, curClassLevel, newClassLevel, pickedSub);

  // --- weapon mastery -------------------------------------------------------
  const mastNow = masteryCountFor(classId, curClassLevel);
  const mastNext = masteryCountFor(classId, newClassLevel);
  if (mastNext > mastNow) {
    pushChoice(out, seen, {
      id: 'masteries', type: 'mastery', title: 'Weapon Mastery', count: mastNext - mastNow, auto: false,
      desc: 'Choose the weapons whose mastery property you can use. You may swap one of them whenever you finish a long rest.',
      options: masteryOptions(ch, chosen(ch, 'masteries')),
    });
  }

  // --- subclass specials the data may have left implicit --------------------
  const specSub = SPECIAL_OPTIONS[pickedSub];
  if (specSub && newClassLevel === subLevel && !ch?.choices?.options?.[specSub.key]) {
    pushChoice(out, seen, {
      id: specSub.key, type: 'subclassOption', title: specSub.title, count: 1, auto: false,
      desc: specSub.desc, options: optionsFromList(null, specSub.catalogue),
    });
  }

  // --- druid beast forms ----------------------------------------------------
  if (classId === 'druid') {
    const formsNow = wildShapeFormsFor(curClassLevel);
    const formsNext = wildShapeFormsFor(newClassLevel);
    if (formsNext > formsNow) {
      const cr = wildShapeMaxCR(newClassLevel);
      const crText = cr === 0.25 ? '1/4' : cr === 0.5 ? '1/2' : String(cr);
      pushChoice(out, seen, {
        id: 'wild-shape', type: 'wildShape', title: 'Wild Shape Forms', count: formsNext - formsNow, auto: false,
        desc: `Learn beast forms of CR ${crText} or lower. You may replace one form whenever you finish a long rest.`,
        options: wildShapeOptions(ch, cr, chosen(ch, 'wildShape')),
      });
    }
  }

  // --- hit points -----------------------------------------------------------
  if (newTotal > 1) {
    const avg = hitDieAvg(hitDie);
    const conMod = mod(scoreOf(ch, 'con'));
    const sgn = conMod >= 0 ? `+${conMod}` : `${conMod}`;
    pushChoice(out, seen, {
      id: 'hp', type: 'hp', title: 'Hit Points', count: 1, auto: !!opts.autoHp, default: 'average',
      desc: `Take the fixed average or roll your hit die. Constitution ${sgn} applies either way (minimum 1 hit point gained).`,
      options: [
        opt('average', `Take the average (+${Math.max(1, avg + conMod)})`, `${avg} from your d${hitDie}, ${sgn} Constitution.`),
        opt('roll', `Roll 1d${hitDie} (${sgn} Con)`, `Between ${Math.max(1, 1 + conMod)} and ${Math.max(1, hitDie + conMod)} hit points. No take-backs.`),
      ],
    });
  }

  return out;
}

/**
 * Cantrips, spells known/prepared, spellbook additions, the 2024 per-level swaps,
 * Mystic Arcanum, invocations, Metamagic and fallback Expertise.
 */
function pushSpellChoices(out, seen, ch, classId, curClassLevel, newClassLevel, subclassId) {
  const kind = slotKindForClass(classId, subclassId);
  const prepared = isPreparedCaster(classId, subclassId);
  // Learn for the class level being gained, not the old or combined slot pool.
  const classSlots = (kind === 'full' ? FULL_SLOTS : kind === 'half' ? HALF_SLOTS : THIRD_SLOTS)[newClassLevel] || {};
  const slotCap = kind === 'pact' ? (PACT_SLOTS[newClassLevel]?.level || 1)
    : Math.max(1, ...Object.keys(classSlots).filter((level) => classSlots[level] > 0).map(Number));

  if (kind) {
    // Cantrips.
    const cNow = cantripsKnownFor(classId, curClassLevel, subclassId);
    const cNext = cantripsKnownFor(classId, newClassLevel, subclassId);
    if (cNext > cNow) {
      pushChoice(out, seen, {
        id: 'cantrips', type: 'cantrip', title: 'New Cantrips', count: cNext - cNow, auto: false,
        desc: 'Cantrips are always ready and never cost a spell slot.',
        options: cantripOptions(ch, classId),
      });
    }

    // Prepared-spell count. In 2024 this is a FIXED per-class table, not level + modifier.
    const pNow = preparedMaxForClass(classId, curClassLevel, subclassId);
    const pNext = preparedMaxForClass(classId, newClassLevel, subclassId);
    if (pNext > pNow) {
      if (prepared) {
        // Cleric / druid / wizard: the cap rises; the list is rebuilt on a long rest.
        pushChoice(out, seen, {
          id: 'prepared', type: 'prepared', title: 'Prepared Spells', count: pNext - pNow, auto: false,
          desc: `Your prepared-spell cap rises to ${pNext}. Choose what is ready; you may change the list whenever you finish a long rest.`,
          max: pNext, options: spellOptions(ch, classId, { maxLevel: slotCap }),
        });
      } else {
        // Bard / ranger / sorcerer / paladin / warlock: chosen at level-up and kept.
        pushChoice(out, seen, {
          id: 'spells-known', type: 'spell', title: 'New Spells', count: pNext - pNow, auto: false,
          desc: `You always have these prepared. Total prepared spells: ${pNext}.`,
          max: pNext, options: spellOptions(ch, classId, { maxLevel: slotCap }),
        });
      }
    }

    // 2024: whenever you gain a level you may replace ONE spell you know.
    if (!prepared && (ch?.spells?.known || []).length) {
      pushChoice(out, seen, {
        id: 'spell-swap', type: 'spellSwap', title: 'Replace a Spell', count: 1, auto: false, optional: true,
        desc: 'On gaining a level you may exchange one spell you know for another from your class list.',
        options: [
          opt('none', 'Keep every spell', 'Change nothing.'),
          ...ch.spells.known.map((id) => opt(id, SPELLS[id]?.name || id, `Replace — ${SPELLS[id]?.desc || ''}`.trim())),
        ],
        replacements: spellOptions(ch, classId, { maxLevel: slotCap }),
      });
    }

    // Wizards scribe new spells into the spellbook every level.
    if (classId === 'wizard') {
      const n = newClassLevel === 1 ? 6 : SPELLBOOK_PER_LEVEL;
      pushChoice(out, seen, {
        id: 'spellbook', type: 'spell', title: 'Spellbook', count: n, auto: false,
        desc: `Scribe ${n} new wizard spells into your spellbook. You prepare from the book after a long rest.`,
        options: spellOptions(ch, 'wizard', { maxLevel: slotCap, exclude: ch?.spells?.book || [] }),
      });
    }
  }

  // Warlock invocations, the invocation swap, and Mystic Arcanum.
  if (classId === 'warlock') {
    const iNow = invocationsKnownFor(classId, curClassLevel);
    const iNext = invocationsKnownFor(classId, newClassLevel);
    if (iNext > iNow) {
      pushChoice(out, seen, {
        id: 'invocations', type: 'invocation', title: 'Eldritch Invocations', count: iNext - iNow, auto: false,
        desc: 'Fragments of forbidden knowledge granted by your patron.',
        options: invocationOptions(ch, newClassLevel),
      });
    }
    if (chosen(ch, 'invocations').length) {
      pushChoice(out, seen, {
        id: 'invocation-swap', type: 'invocationSwap', title: 'Replace an Invocation', count: 1, auto: false, optional: true,
        desc: 'Whenever you gain a warlock level you may exchange one invocation for another you qualify for.',
        options: [
          opt('none', 'Keep every invocation', 'Change nothing.'),
          ...chosen(ch, 'invocations').map((id) => opt(id, INVOCATIONS[id]?.name || id, 'Replace this invocation.')),
        ],
        replacements: invocationOptions(ch, newClassLevel),
      });
    }
    const arcLevel = MYSTIC_ARCANUM_LEVELS[newClassLevel];
    if (arcLevel) {
      pushChoice(out, seen, {
        id: `arcanum-${arcLevel}`, type: 'arcanum', title: `Mystic Arcanum (Level ${arcLevel})`, count: 1, auto: false,
        desc: `Choose one level ${arcLevel} warlock spell. You can cast it once without expending a slot, and regain that casting on a long rest.`,
        options: spellOptions(ch, 'warlock', { exactLevel: arcLevel }),
      });
    }
  }

  // Sorcerer Metamagic and its per-level swap.
  if (classId === 'sorcerer') {
    const mNow = metamagicKnownFor(classId, curClassLevel);
    const mNext = metamagicKnownFor(classId, newClassLevel);
    if (mNext > mNow) {
      pushChoice(out, seen, {
        id: 'metamagic', type: 'metamagic', title: 'Metamagic', count: mNext - mNow, auto: false,
        desc: 'Bend your spells with sorcery points.',
        options: metamagicOptions(ch),
      });
    }
    if (chosen(ch, 'metamagic').length) {
      pushChoice(out, seen, {
        id: 'metamagic-swap', type: 'metamagicSwap', title: 'Replace a Metamagic Option', count: 1, auto: false, optional: true,
        desc: 'Whenever you gain a sorcerer level you may exchange one Metamagic option for another.',
        options: [
          opt('none', 'Keep every option', 'Change nothing.'),
          ...chosen(ch, 'metamagic').map((id) => opt(id, METAMAGIC[id]?.name || id, 'Replace this option.')),
        ],
        replacements: metamagicOptions(ch),
      });
    }
  }

  // Battle Master maneuver swap.
  if (classId === 'fighter' && chosen(ch, 'maneuvers').length) {
    pushChoice(out, seen, {
      id: 'maneuver-swap', type: 'maneuverSwap', title: 'Replace a Maneuver', count: 1, auto: false, optional: true,
      desc: 'Whenever you gain a fighter level you may exchange one maneuver for another.',
      options: [
        opt('none', 'Keep every maneuver', 'Change nothing.'),
        ...chosen(ch, 'maneuvers').map((id) => opt(id, MANEUVERS[id]?.name || id, 'Replace this maneuver.')),
      ],
      replacements: maneuverOptions(ch),
    });
  }

  // Expertise where the class data has not declared it.
  const ex = EXPERTISE_LEVELS[classId]?.[newClassLevel];
  if (ex) {
    pushChoice(out, seen, {
      id: 'expertise', type: 'expertise', title: 'Expertise', count: ex, auto: false,
      desc: 'Double your proficiency bonus for ability checks with the chosen skills.',
      options: expertiseOptions(ch),
    });
  }
}

// ---------------------------------------------------------------------------
// 8. applyLevel — commit a level-up
//
// `picks` maps a Choice id from pendingChoicesFor to the player's answer. Every
// value is read tolerantly, so the UI may hand back a bare string, an array, or a
// richer object:
//
//   class:              'fighter'
//   subclass:           'champion'
//   multiclass-skill:   ['athletics']
//   fighting-style:     'archery'
//   maneuvers:          ['trip-attack','riposte']
//   expertise:          ['stealth','perception']
//   masteries:          ['longsword','shortbow']
//   invocations:        ['agonizing-blast']
//   metamagic:          ['quickened-spell']
//   cantrips:           ['fire-bolt']
//   spells-known:       ['shield']          prepared: [...]   spellbook: [...]
//   arcanum-6:          'circle-of-death'
//   wild-shape:         ['wolf']
//   landCircle:         'temperate'         ancestry: 'red'
//   asi:                'asi' + picks['asi-abilities']:{str:2}
//                       | { option:'asi', abilities:{str:1,con:1} }
//                       | { str:1, dex:1 } | 'feat:alert'
//   *-swap:             { from:'burning-hands', to:'shield' }  |  'none'
//   hp:                 'average' | 'roll'
//
// Everything is applied to a snapshot-protected character: if any step throws, the
// character is rolled back untouched and the failure is reported in the log.
// ---------------------------------------------------------------------------

/** Persistent effect ids progression.js owns on a character. */
const HP_ROLL_EFFECT = 'level-hp-rolls';
const MYTHIC_EFFECT = 'mythic-boons';

/** Coerce a pick into a clean list of ids. 'none' is the universal "skip". */
function pickList(v) {
  if (v == null) return [];
  if (Array.isArray(v)) return v.flatMap(pickList);
  if (typeof v === 'string') return v === 'none' || v === '' ? [] : [v];
  if (typeof v === 'object') {
    if (Array.isArray(v.ids)) return pickList(v.ids);
    if (typeof v.id === 'string') return pickList(v.id);
  }
  return [];
}

function pickOne(v) { return pickList(v)[0] || null; }

/** Read a "replace one X with another" answer. Returns { from, to } or null. */
function pickSwap(v) {
  if (!v || v === 'none') return null;
  if (Array.isArray(v)) return v.length >= 2 ? { from: v[0], to: v[1] } : null;
  if (typeof v !== 'object') return null;
  const from = v.from ?? v.replace ?? v.old ?? v.id ?? null;
  const to = v.to ?? v.with ?? v.replacement ?? v.new ?? null;
  if (!from || !to || from === 'none' || to === 'none') return null;
  return { from: String(from), to: String(to) };
}

function pushUnique(list, id) {
  if (!id || !Array.isArray(list) || list.includes(id)) return false;
  list.push(id);
  return true;
}

/** ch.choices[key] as a live array, created on demand. */
function choiceArray(ch, key) {
  ch.choices = ch.choices || {};
  if (!Array.isArray(ch.choices[key])) ch.choices[key] = [];
  return ch.choices[key];
}

/** Everything progression.js may write on a character, minus the derived caches. */
function isCache(k) { return typeof k === 'string' && k.charAt(0) === '_'; }

function snapshotChar(ch) {
  try {
    const plain = {};
    for (const k of Object.keys(ch)) {
      if (isCache(k) || typeof ch[k] === 'function' || ch[k] === undefined) continue;
      plain[k] = ch[k];
    }
    return JSON.parse(JSON.stringify(plain));
  } catch (e) {
    return null;   // un-cloneable character: we simply cannot offer a rollback
  }
}

/** Put a snapshot back onto the SAME object so callers keep their reference. */
function restoreChar(ch, snap) {
  if (!snap) return false;
  for (const k of Object.keys(ch)) if (!isCache(k) && !(k in snap)) delete ch[k];
  for (const k of Object.keys(snap)) ch[k] = snap[k];
  delete ch._mech; delete ch._mechAsi; delete ch._derived; delete ch._scores;
  return true;
}

/** A persistent, permanent effect this module maintains (rolled HP, epic boons). */
function permanentEffect(ch, id, name) {
  if (!Array.isArray(ch.effects)) ch.effects = [];
  let e = ch.effects.find((x) => x && x.id === id);
  if (!e) {
    e = { id, name, dur: null, permanent: true, source: 'progression', concentration: false, mech: {} };
    ch.effects.push(e);
  }
  e.mech = e.mech || {};
  if (typeof e.mech.maxHpBonus !== 'number') e.mech.maxHpBonus = 0;
  e.mech.setAbility = e.mech.setAbility || {};
  return e;
}

/** Run recalc + recomputeSpells, never letting either break a level-up. */
function refresh(ch) {
  try {
    if (typeof Char.recalc === 'function') Char.recalc(ch);
    else recomputeSpells(ch);
  } catch (e) {
    console.error('[progression] recalc failed', e);
    try { recomputeSpells(ch); } catch { /* ignore */ }
  }
}

/** Current score after the last refresh (recalc caches it), else the raw sum. */
function liveScore(ch, ab) {
  const cached = ch?._scores?.[ab];
  return typeof cached === 'number' ? cached : scoreOf(ch, ab);
}

/** The ceiling an ability may be raised to right now: 20, or 30 once epic. */
function abilityCapOf(ch) {
  return ch?.abilityCap === MAX_ABILITY_EPIC ? MAX_ABILITY_EPIC : MAX_ABILITY;
}

/**
 * Normalise the ASI-or-feat answer into { featId, abilities:{str:2} }.
 * `extra` is the separate `asi-abilities` pick some UIs send alongside 'asi'.
 */
function readAsiPick(v, extra) {
  const out = { featId: null, abilities: {} };
  const take = (o) => {
    if (!o) return;
    if (typeof o === 'string') { if (ABILITIES.includes(o)) out.abilities[o] = (out.abilities[o] || 0) + 1; return; }
    if (Array.isArray(o)) { for (const x of o) take(x); return; }
    if (typeof o === 'object') {
      for (const ab of ABILITIES) {
        const n = Number(o[ab]);
        if (n > 0) out.abilities[ab] = (out.abilities[ab] || 0) + Math.floor(n);
      }
    }
  };

  if (typeof v === 'string') {
    if (v.startsWith('feat:')) out.featId = v.slice(5);
    else if (v !== 'asi' && FEATS[v]) out.featId = v;
  } else if (Array.isArray(v)) {
    take(v);
  } else if (v && typeof v === 'object') {
    const raw = v.feat ?? (typeof v.id === 'string' && v.id.startsWith('feat:') ? v.id : null)
      ?? (typeof v.option === 'string' && v.option.startsWith('feat:') ? v.option : null);
    if (raw) out.featId = String(raw).replace(/^feat:/, '');
    // { abilities:{...} } / { asi:{...} }, or a bare { str:1, dex:1 } map.
    if (v.abilities || v.asi) take(v.abilities || v.asi);
    else if (!v.id && !v.option && !v.feat) take(v);
  }
  take(extra);
  return out;
}

/**
 * Spend an Ability Score Improvement: +2 to one ability or +1 to two, never past
 * the ceiling. Writes ch.asiManual AND ch.asi so the result is right whether or not
 * recalc is available (recalc derives one from the other, so this stays idempotent).
 */
function spendAsi(ch, abilities, log, budget = 2) {
  const cap = abilityCapOf(ch);
  let left = budget;
  for (const ab of ABILITIES) {
    if (left <= 0) break;
    const want = Math.min(Math.max(0, Math.floor(abilities[ab] || 0)), left);
    if (!want) continue;
    const cur = liveScore(ch, ab);
    const give = Math.min(want, Math.max(0, cap - cur));
    if (give <= 0) {
      log.push(`${ABILITY_NAMES[ab]} is already at the maximum of ${cap} — the increase is lost.`);
      continue;
    }
    ch.asiManual[ab] = (Number(ch.asiManual[ab]) || 0) + give;
    ch.asi[ab] = (Number(ch.asi[ab]) || 0) + give;
    left -= give;
    log.push(`Ability Score Improvement: ${ABILITY_NAMES[ab]} ${cur} → ${cur + give}.`);
  }
  return budget - left;
}

/**
 * Take a feat. Prerequisites are enforced; a feat that carries its own +1 (the 2024
 * general feats) applies it here, using `abilityPick` when the player named one.
 */
function takeFeat(ch, featId, level, log, abilityPick) {
  if (!featId) return false;
  const def = FEATS[featId] ? { id: featId, ...FEATS[featId] } : { id: featId, name: featId };
  const reason = featPrereqReason(ch, def, level);
  if (reason) { log.push(`You cannot take ${def.name}: ${reason}`); return false; }

  if (!Array.isArray(ch.featIds)) ch.featIds = [];
  if (def.repeatable || !ch.featIds.includes(featId)) ch.featIds.push(featId);
  log.push(`Feat — ${def.name}: ${def.desc || 'A new talent.'}`);

  // 2024 general feats list the abilities their +1 may go into.
  const from = Array.isArray(def.asi) ? def.asi.filter((a) => ABILITIES.includes(a)) : [];
  if (from.length) {
    const cap = abilityCapOf(ch);
    const wanted = pickList(abilityPick).find((a) => from.includes(a));
    const order = wanted ? [wanted, ...from] : from;
    const ab = order.find((a) => liveScore(ch, a) < cap);
    if (ab) {
      ch.asiManual[ab] = (Number(ch.asiManual[ab]) || 0) + 1;
      ch.asi[ab] = (Number(ch.asi[ab]) || 0) + 1;
      ch.choices.featAsi = ch.choices.featAsi || {};
      ch.choices.featAsi[featId] = ab;
      log.push(`${def.name}: ${ABILITY_NAMES[ab]} rises to ${liveScore(ch, ab) + 1}.`);
    }
  }
  return true;
}

/** Apply one "replace an X" answer against a ch.choices list. */
function applySwap(ch, key, v, log, label, nameOf) {
  const sw = pickSwap(v);
  if (!sw) return false;
  const list = choiceArray(ch, key);
  const i = list.indexOf(sw.from);
  if (i < 0) return false;
  if (list.includes(sw.to)) { log.push(`You already know ${nameOf(sw.to)}.`); return false; }
  list[i] = sw.to;
  log.push(`${label}: ${nameOf(sw.from)} replaced with ${nameOf(sw.to)}.`);
  return true;
}

const spellName = (id) => SPELLS[id]?.name || id;

/** Add ids to a ch.choices list, honouring the choice's count. */
function fillChoiceList(ch, key, v, count, log, label, nameOf) {
  const list = choiceArray(ch, key);
  let added = 0;
  for (const id of pickList(v)) {
    if (count != null && added >= count) break;
    if (pushUnique(list, id)) { added++; log.push(`${label}: ${nameOf(id)}.`); }
  }
  return added;
}

/**
 * Apply one level. Returns a log of readable lines, e.g.
 *   "Extra Attack: you can attack twice when you take the Attack action."
 *
 * opts: { rng, syncXp=true, autoHp=false }
 */
export function applyLevel(ch, level, picks = {}, opts = {}) {
  const log = [];
  if (!ch) return log;
  const p = picks || {};
  const r = opts.rng || rng;
  const snap = snapshotChar(ch);

  try {
    ch.classes = Array.isArray(ch.classes) ? ch.classes : [];
    ch.choices = ch.choices || {};
    ch.asi = ch.asi || {};
    ch.asiManual = ch.asiManual || {};
    ch.flags = ch.flags || {};
    ch.spells = ch.spells || { known: [], prepared: [], cantrips: [], slots: {} };
    for (const ab of ABILITIES) {
      if (typeof ch.asi[ab] !== 'number') ch.asi[ab] = 0;
      if (typeof ch.asiManual[ab] !== 'number') ch.asiManual[ab] = 0;
    }

    // --- 1. which class advances? -----------------------------------------
    let classId = pickOne(p.class) || opts.classId || activeClassId(ch) || Object.keys(CLASSES)[0];
    const wasNew = classLevelOf(ch, classId) === 0 && ch.classes.length > 0;
    if (wasNew && !canMulticlass(ch, classId)) {
      const why = multiclassReason(ch, classId);
      const fallback = activeClassId(ch);
      log.push(`You cannot begin as a ${className(classId)}: ${why}`);
      classId = fallback || classId;
    }
    const cls = CLASSES[classId];

    let entry = classEntry(ch, classId);
    const isNewClass = !entry;
    if (!entry) { entry = { id: classId, level: 0, subclassId: null }; ch.classes.push(entry); }
    entry.level = (entry.level || 0) + 1;

    const newClassLevel = entry.level;
    const newTotal = totalLevel(ch);
    ch.level = newTotal;
    ch.flags.levelingClass = classId;
    ch.flags.pendingLevels = Math.max(0, (ch.flags.pendingLevels || 0) - 1);

    // The character sheet should never show less XP than the level demands.
    if (opts.syncXp !== false) ch.xp = Math.max(Math.floor(ch.xp || 0), xpForLevel(newTotal));

    log.push(isNewClass
      ? `You take your first level of ${className(classId)} — now ${ordinal(newTotal)} level overall.`
      : `${className(classId)} ${newClassLevel - 1} → ${newClassLevel} (character level ${newTotal}).`);

    // --- 2. proficiencies from joining a new class ------------------------
    // 2024 Multiclassing table: a NARROWER grant than the starting package.
    if (isNewClass) {
      const mp = MULTICLASS_PROFS[classId] || {};
      ch.profs = ch.profs || { armor: [], weapon: [], tool: [], language: [] };
      for (const a of mp.armor || []) pushUnique(ch.profs.armor, a);
      for (const w of mp.weapon || []) pushUnique(ch.profs.weapon, w);
      for (const t of mp.tool || []) pushUnique(choiceArray(ch, 'tools'), t);
      const bits = [...(mp.armor || []), ...(mp.weapon || []), ...(mp.tool || [])];
      if (bits.length) log.push(`Multiclass proficiencies: ${bits.join(', ')}.`);
      if (mp.skills) {
        fillChoiceList(ch, 'skills', p['multiclass-skill'] ?? p.skill, mp.skills, log,
          'Skill proficiency', (id) => SKILLS[id]?.name || id);
      }
    }

    // --- 3. subclass -------------------------------------------------------
    if (newClassLevel === subclassLevelFor(classId) && !entry.subclassId) {
      const sub = pickOne(p.subclass) || pickOne(p[`subclass:${classId}`])
        || subclassOptions(ch, classId).find((o) => !o.disabled)?.id || null;
      if (sub) {
        entry.subclassId = sub;
        log.push(`${className(classId)} Subclass — ${subclassName(sub)}: ${SUBCLASSES[sub]?.desc || 'your path is set.'}`);
      }
    }

    // --- 4. Ability Score Improvement or a feat ---------------------------
    if (asiLevelsFor(classId).includes(newClassLevel)) {
      const a = readAsiPick(p.asi, p['asi-abilities'] ?? p.abilities);
      if (a.featId) takeFeat(ch, a.featId, newTotal, log, p['feat-ability'] ?? p.featAbility);
      else if (Object.keys(a.abilities).length) spendAsi(ch, a.abilities, log);
      else log.push('Ability Score Improvement unspent — visit the level-up screen to assign it.');
    }
    // A feature whose own `choice` block is a feat (e.g. an Origin feat grant).
    for (const k of Object.keys(p)) {
      if (!k.startsWith('feat:')) continue;
      const fid = pickOne(p[k]);
      if (fid) takeFeat(ch, String(fid).replace(/^feat:/, ''), newTotal, log, p['feat-ability']);
    }

    // --- 5. list-style class options --------------------------------------
    const styleName = (id) => styleCatalogue()[id]?.name || FEATS[id]?.name || id;
    fillChoiceList(ch, 'fightingStyle', p['fighting-style'] ?? p.fightingStyle, null, log, 'Fighting Style', styleName);
    fillChoiceList(ch, 'maneuvers', p.maneuvers, null, log, 'Maneuver learned', (id) => MANEUVERS[id]?.name || id);
    fillChoiceList(ch, 'metamagic', p.metamagic, null, log, 'Metamagic', (id) => METAMAGIC[id]?.name || id);
    fillChoiceList(ch, 'invocations', p.invocations, null, log, 'Eldritch Invocation', (id) => INVOCATIONS[id]?.name || id);
    fillChoiceList(ch, 'expertise', p.expertise, null, log, 'Expertise', (id) => SKILLS[id]?.name || id);
    fillChoiceList(ch, 'masteries', p.masteries, null, log, 'Weapon Mastery',
      (id) => `${ITEMS[id]?.name || id} (${WEAPON_MASTERY[ITEMS[id]?.mastery]?.name || ITEMS[id]?.mastery || '—'})`);
    fillChoiceList(ch, 'wildShape', p['wild-shape'] ?? p.wildShape, null, log, 'Wild Shape form',
      (id) => (MonsterData.MONSTERS || {})[id]?.name || id);
    if (!isNewClass) {
      fillChoiceList(ch, 'skills', p.skill ?? p.skills, null, log, 'Skill proficiency', (id) => SKILLS[id]?.name || id);
    }

    // Swaps — the 2024 "you may replace one on level-up" allowances.
    applySwap(ch, 'invocations', p['invocation-swap'], log, 'Invocation swapped', (id) => INVOCATIONS[id]?.name || id);
    applySwap(ch, 'metamagic', p['metamagic-swap'], log, 'Metamagic swapped', (id) => METAMAGIC[id]?.name || id);
    applySwap(ch, 'maneuvers', p['maneuver-swap'], log, 'Maneuver swapped', (id) => MANEUVERS[id]?.name || id);

    // --- 6. subclass option sets (Land circle, draconic ancestry, …) -------
    ch.choices.options = (ch.choices.options && !Array.isArray(ch.choices.options)) ? ch.choices.options : {};
    for (const [key, cat] of [['landCircle', LAND_CIRCLES], ['ancestry', DRAGON_ANCESTRIES]]) {
      const v = pickOne(p[key]);
      if (!v) continue;
      ch.choices[key] = v;
      ch.choices.options[key] = v;
      log.push(`${cat[v]?.name || v}: ${cat[v]?.desc || 'chosen.'}`);
    }
    for (const k of Object.keys(p)) {
      if (!k.startsWith('option:')) continue;
      const v = pickOne(p[k]);
      if (v) { ch.choices.options[k.slice(7)] = v; log.push(`Option chosen: ${v}.`); }
    }

    // --- 7. spells ---------------------------------------------------------
    const sp = ch.spells;
    sp.known = Array.isArray(sp.known) ? sp.known : [];
    sp.prepared = Array.isArray(sp.prepared) ? sp.prepared : [];
    sp.cantrips = Array.isArray(sp.cantrips) ? sp.cantrips : [];
    if (!Array.isArray(sp.book)) sp.book = [];

    for (const id of pickList(p.cantrips)) {
      if (pushUnique(sp.cantrips, id)) log.push(`Cantrip learned — ${spellName(id)}.`);
    }
    // Wizards scribe into the spellbook; they prepare from it after a long rest.
    for (const id of pickList(p.spellbook)) {
      if (pushUnique(sp.book, id)) log.push(`Scribed into your spellbook — ${spellName(id)}.`);
    }
    // "Known" casters (bard, ranger, sorcerer, paladin, warlock): 2024 says these are
    // always prepared, so they go into both lists.
    for (const id of pickList(p['spells-known'] ?? p.spells)) {
      const isNew = pushUnique(sp.known, id);
      pushUnique(sp.prepared, id);
      if (isNew) log.push(`Spell learned — ${spellName(id)}.`);
    }
    // Prepared casters simply fill the wider cap.
    for (const id of pickList(p.prepared)) {
      if (pushUnique(sp.prepared, id)) {
        if (classId === 'wizard') pushUnique(sp.book, id);
        log.push(`Prepared — ${spellName(id)}.`);
      }
    }
    // 2024: one spell may be exchanged whenever you gain a level.
    const sw = pickSwap(p['spell-swap']);
    if (sw) {
      const i = sp.known.indexOf(sw.from);
      if (i >= 0 && !sp.known.includes(sw.to)) {
        sp.known[i] = sw.to;
        const j = sp.prepared.indexOf(sw.from);
        if (j >= 0) sp.prepared[j] = sw.to; else pushUnique(sp.prepared, sw.to);
        log.push(`Spell swapped: ${spellName(sw.from)} replaced with ${spellName(sw.to)}.`);
      }
    }
    // Mystic Arcanum — a free casting of one high-level spell per long rest.
    for (const k of Object.keys(p)) {
      if (!k.startsWith('arcanum-')) continue;
      const lvl = Number(k.slice(8));
      const id = pickOne(p[k]);
      if (!id || !lvl) continue;
      recomputeSpells(ch);   // make sure the arcanum slots exist before filling one
      if (setArcanum(ch, lvl, id)) {
        log.push(`Mystic Arcanum (level ${lvl}) — ${spellName(id)}: cast it once per long rest without a spell slot.`);
      }
    }

    // --- 8. hit points -----------------------------------------------------
    // 2024 PHB: level 1 of your first class takes the maximum die; every level after
    // is the die's average (die/2 + 1) or a roll. character.js bakes the AVERAGE into
    // maxHp, so a roll is stored as the difference on a permanent effect.
    if (newTotal > 1) {
      const die = hitDieSize(cls?.hitDie || 8);
      const conMod = mod(liveScore(ch, 'con'));
      const avgGain = Math.max(1, hitDieAvg(die) + conMod);
      const mode = String(pickOne(p.hp) || 'average');   // the fixed average is the default
      if (mode === 'roll') {
        const rolled = hitPointsForLevel(die, conMod, { average: false, r });
        const delta = rolled - avgGain;
        if (delta !== 0) permanentEffect(ch, HP_ROLL_EFFECT, 'Rolled Hit Points').mech.maxHpBonus += delta;
        choiceArray(ch, 'hpRolls').push(rolled);
        log.push(`Hit points: rolled a d${die} for ${rolled} (average would have been ${avgGain}).`);
      } else {
        choiceArray(ch, 'hpRolls').push(avgGain);
        log.push(`Hit points: +${avgGain} (fixed average of a d${die}).`);
      }
    }

    // --- 9. announce the features this level actually grants ---------------
    for (const { f, source } of featuresAtLevel(ch, classId, newClassLevel, entry.subclassId)) {
      if (!f?.name) continue;
      log.push(f.desc ? `${f.name}: ${f.desc}` : `${f.name} (${source}).`);
    }
    // Subclass spells that are always prepared from this level on.
    const subSpells = SUBCLASSES[entry.subclassId]?.spells?.[newClassLevel];
    for (const id of subSpells || []) {
      log.push(`${subclassName(entry.subclassId)} always has ${spellName(id)} prepared.`);
    }

    // --- 10. re-derive everything -----------------------------------------
    refresh(ch);
    if (profForLevel(newTotal) > profForLevel(newTotal - 1)) {
      log.push(`Proficiency bonus rises to +${profForLevel(newTotal)}.`);
    }
    const slots = slotSummary(ch);
    if (slots) log.push(`Spell slots: ${slots}.`);
    log.push(`Maximum hit points: ${ch.maxHp}.`);

    bus.emit(EV.LEVEL_UP, { ch, uid: ch.uid, applied: true, classId, level: newTotal, log });
    return log;
  } catch (err) {
    console.error('[progression] applyLevel failed', err);
    if (restoreChar(ch, snap)) {
      refresh(ch);
      return [`The level-up could not be completed (${err && err.message ? err.message : 'unknown error'}); nothing was changed.`];
    }
    return log.concat(['The level-up failed part-way through.']);
  }
}

/**
 * 2024: you may swap ONE Weapon Mastery whenever you finish a long rest.
 * restoreSlots() clears ch.flags.masterySwapped, which gates this.
 */
export function swapMastery(ch, fromId, toId) {
  if (!ch) return { ok: false, reason: 'No character.' };
  ch.flags = ch.flags || {};
  if (ch.flags.masterySwapped) return { ok: false, reason: 'You have already swapped a mastery since your last long rest.' };
  const list = choiceArray(ch, 'masteries');
  const i = list.indexOf(fromId);
  if (i < 0) return { ok: false, reason: 'You have not mastered that weapon.' };
  if (list.includes(toId)) return { ok: false, reason: 'That weapon is already mastered.' };
  const target = ITEMS[toId];
  if (target && target.kind === 'weapon' && !weaponProficient(ch, target)) {
    return { ok: false, reason: 'You lack proficiency with that weapon.' };
  }
  list[i] = toId;
  ch.flags.masterySwapped = true;
  refresh(ch);
  return { ok: true, log: [`Weapon Mastery swapped: ${ITEMS[fromId]?.name || fromId} → ${ITEMS[toId]?.name || toId}.`] };
}

/** 2024 druid: replace one known Wild Shape form on a long rest. */
export function swapWildShape(ch, fromId, toId) {
  if (!ch) return { ok: false, reason: 'No character.' };
  ch.flags = ch.flags || {};
  if (ch.flags.wildShapeSwapped) return { ok: false, reason: 'You have already changed a form since your last long rest.' };
  const list = choiceArray(ch, 'wildShape');
  const i = list.indexOf(fromId);
  if (i < 0) return { ok: false, reason: 'You do not know that form.' };
  const maxCR = wildShapeMaxCR(classLevelOf(ch, 'druid'));
  const beast = (MonsterData.MONSTERS || {})[toId];
  if (beast && (beast.cr ?? 0) > maxCR) return { ok: false, reason: `That beast's challenge rating exceeds ${maxCR}.` };
  list[i] = toId;
  ch.flags.wildShapeSwapped = true;
  return { ok: true, log: [`Wild Shape form swapped: ${fromId} → ${(beast?.name) || toId}.`] };
}

// ---------------------------------------------------------------------------
// 9. MYTHIC PROGRESSION — the never-ending game past level 20
//
// A 20th-level character stops gaining class levels but never stops advancing.
// Each Mythic tier costs a smoothly growing slab of XP and awards an Epic Boon,
// +1 to an ability score (ceiling 30, not 20) and a slab of hit points. There is
// no upper tier: MYTHIC_TIERS names the first ten and every tier past that reuses
// the list with a numeral, so the ladder is genuinely endless.
// ---------------------------------------------------------------------------

/** XP for Mythic tier 1 is the level-20 threshold plus one full step. */
export const MYTHIC_XP_BASE = 355000;
export const MYTHIC_XP_STEP = 90000;
/** Maximum hit points granted by each Mythic tier. */
export const MYTHIC_HP_PER_TIER = 5;

/** XP required to claim Mythic tier `t` (t >= 1). Tier 0 is plain level 20. */
export function mythicXpFor(t) {
  return MYTHIC_XP_BASE + Math.max(0, Math.floor(t || 0)) * MYTHIC_XP_STEP;
}

/** The highest Mythic tier an XP total entitles a character to (0 = none yet). */
export function mythicTierForXp(xp) {
  const x = Math.max(0, Math.floor(xp || 0));
  if (x < mythicXpFor(1)) return 0;
  return Math.floor((x - MYTHIC_XP_BASE) / MYTHIC_XP_STEP);
}

/**
 * The ten named tiers. Every entry is a real Realms landmark or honorific — no
 * coined names (see docs/SETTING.md).
 */
export const MYTHIC_TIERS = Object.freeze([
  Object.freeze({ tier: 1, name: 'Hero of the North', desc: 'Phandalin and the Triboar Trail speak your name in the taprooms.' }),
  Object.freeze({ tier: 2, name: 'Champion of the Sword Coast', desc: 'From Neverwinter to Waterdeep, the High Road is safer for your passing.' }),
  Object.freeze({ tier: 3, name: 'Bane of the Underdark', desc: 'Drow raiding parties out of Menzoberranzan turn back rather than meet you.' }),
  Object.freeze({ tier: 4, name: 'Warden of the Dessarin', desc: 'The valley folk hang your token above their doors.' }),
  Object.freeze({ tier: 5, name: 'Scourge of Undermountain', desc: "Halaster Blackcloak has begun to watch your descent with interest." }),
  Object.freeze({ tier: 6, name: 'Peer of Waterdeep', desc: 'The Masked Lords of the City of Splendors send for your counsel.' }),
  Object.freeze({ tier: 7, name: 'Warden of the Realms', desc: 'Harper, Gauntlet and Enclave alike answer when you call.' }),
  Object.freeze({ tier: 8, name: 'Chosen of the Gods', desc: 'A power of the Faerûnian pantheon has set its mark upon you.' }),
  Object.freeze({ tier: 9, name: 'Legend of Faerûn', desc: 'Bards from Amn to Icewind Dale trade verses about your deeds.' }),
  Object.freeze({ tier: 10, name: 'Living Myth of the Realms', desc: 'You stand among Elminster and the Seven — a story the world tells itself.' }),
]);

/** Tier descriptor for any tier, however high. Past ten the titles repeat with a numeral. */
export function mythicTierInfo(t) {
  const tier = Math.max(1, Math.floor(t || 1));
  const base = MYTHIC_TIERS[(tier - 1) % MYTHIC_TIERS.length];
  const cycle = Math.floor((tier - 1) / MYTHIC_TIERS.length);
  const numeral = cycle + 1 <= 3 ? 'I'.repeat(cycle + 1) : String(cycle + 1);
  return {
    tier,
    name: cycle ? `${base.name} ${numeral}` : base.name,
    desc: base.desc,
    xp: mythicXpFor(tier),
    hp: MYTHIC_HP_PER_TIER,
    ability: 1,
    boons: 1,
  };
}

/** Mythic tiers this character has actually CLAIMED (not merely earned the XP for). */
export function mythicLevel(ch) {
  const stored = Math.max(0, Math.floor(ch?.flags?.mythic?.tier || 0));
  // Fall back to counting Epic Boon feats so a hand-built or legacy character still reads right.
  const boons = (ch?.featIds || []).filter((id) => (EPIC_BOONS[id] || FEATS[id])?.category === 'epic-boon').length;
  return Math.max(stored, boons);
}

/** Mythic tiers earned by XP but not yet spent. */
export function pendingMythic(ch) {
  if (Math.floor(ch?.level || 0) < MAX_LEVEL) return 0;
  return Math.max(0, mythicTierForXp(ch?.xp || 0) - mythicLevel(ch));
}

/** Every Epic Boon this character could still take, prerequisites resolved. */
export function epicBoonOptions(ch) {
  const cat = Object.keys(EPIC_BOONS).length ? EPIC_BOONS : FEATS;
  return Object.keys(cat)
    .filter((id) => (cat[id]?.category || 'epic-boon') === 'epic-boon')
    .map((id) => {
      const f = { id, ...cat[id] };
      const reason = featPrereqReason(ch, f, Math.max(MAX_LEVEL, ch?.level || MAX_LEVEL));
      return opt(id, f.name || id, f.desc || '', !!reason, reason || undefined);
    })
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

/** The Mythic tier presented as a Choice[], so the level-up UI can reuse its widgets. */
export function mythicChoicesFor(ch) {
  if (pendingMythic(ch) <= 0) return [];
  const info = mythicTierInfo(mythicLevel(ch) + 1);
  return [
    {
      id: 'boon', type: 'boon', title: `${info.name} — Epic Boon`, count: 1, auto: false,
      desc: `${info.desc} Choose the boon that marks this tier.`,
      options: epicBoonOptions(ch),
    },
    {
      id: 'boon-ability', type: 'asi', title: 'Epic Ability Increase', count: 1, auto: false,
      desc: 'Raise one ability score by 1. Epic Boons lift the ceiling from 20 to 30.',
      abilities: abilityOptions(ch, MAX_ABILITY_EPIC),
      options: abilityOptions(ch, MAX_ABILITY_EPIC),
    },
  ];
}

/**
 * Claim one Mythic tier: an Epic Boon, +1 to an ability (ceiling 30) and bonus
 * maximum hit points. `ability` may name the ability to raise; otherwise the boon's
 * own list, then the class's priority order, decides.
 *
 * Returns { ok, tier, name, boonId, log }.
 */
export function applyMythic(ch, boonId, ability = null) {
  const log = [];
  if (!ch) return { ok: false, reason: 'No character.', log };
  const snap = snapshotChar(ch);

  try {
    ch.flags = ch.flags || {};
    ch.featIds = Array.isArray(ch.featIds) ? ch.featIds : [];
    const cur = mythicLevel(ch);
    const info = mythicTierInfo(cur + 1);

    if (Math.floor(ch.level || 0) < MAX_LEVEL) {
      return { ok: false, reason: `Epic Boons are for ${MAX_LEVEL}th-level characters.`, log };
    }
    if (Math.floor(ch.xp || 0) < info.xp) {
      return { ok: false, reason: `Mythic tier ${info.tier} needs ${info.xp.toLocaleString()} XP.`, log };
    }

    // --- the boon itself ---------------------------------------------------
    const cat = Object.keys(EPIC_BOONS).length ? EPIC_BOONS : FEATS;
    const def = boonId && cat[boonId] ? { id: boonId, ...cat[boonId] } : null;
    if (boonId && !def) log.push(`Unknown Epic Boon "${boonId}" — the tier's other rewards still apply.`);
    if (def) {
      const reason = featPrereqReason(ch, def, ch.level);
      if (reason && !def.repeatable) log.push(`${def.name}: ${reason}`);
      if (def.repeatable || !ch.featIds.includes(def.id)) ch.featIds.push(def.id);
      log.push(`Epic Boon — ${def.name}: ${def.desc || 'a fragment of divine power is yours.'}`);
    }

    // --- +1 to an ability, ceiling 30 -------------------------------------
    const allowed = Array.isArray(def?.asi) ? def.asi.filter((a) => ABILITIES.includes(a)) : [];
    const priority = ABILITIES.slice().sort((a, b) => liveScore(ch, b) - liveScore(ch, a));
    const wanted = pickList(ability).find((a) => ABILITIES.includes(a));
    const order = [wanted, ...allowed, ...priority].filter(Boolean);
    const ab = order.find((a) => liveScore(ch, a) < MAX_ABILITY_EPIC) || null;

    // --- bonus hit points, on the effect this module owns ------------------
    const eff = permanentEffect(ch, MYTHIC_EFFECT, 'Epic Boons');
    eff.mech.maxHpBonus += MYTHIC_HP_PER_TIER;
    // Guarantee the epic ceiling even if the boon catalogue lives outside FEATS —
    // character.js only lifts the cap for a feat whose category is 'epic-boon'.
    eff.mech.abilityCap30 = true;

    let before = ab ? liveScore(ch, ab) : 0;
    if (ab) {
      ch.asiManual[ab] = (Number(ch.asiManual[ab]) || 0) + 1;
      ch.asi[ab] = (Number(ch.asi[ab]) || 0) + 1;
    }

    // --- record the tier and re-derive ------------------------------------
    ch.flags.mythic = ch.flags.mythic || { tier: 0, boons: [] };
    ch.flags.mythic.tier = info.tier;
    if (!Array.isArray(ch.flags.mythic.boons)) ch.flags.mythic.boons = [];
    if (def) ch.flags.mythic.boons.push(def.id);
    ch.flags.mythic.name = info.name;
    ch.flags.pendingMythic = Math.max(0, pendingMythic(ch));

    refresh(ch);

    // If the ability was clamped at 20 because nothing flagged this character epic,
    // pin the new score directly (recalc lets `setAbility` ignore the cap).
    if (ab && liveScore(ch, ab) <= before) {
      eff.mech.setAbility[ab] = Math.min(MAX_ABILITY_EPIC, before + 1);
      refresh(ch);
    }
    if (ab) log.push(`${ABILITY_NAMES[ab]} rises to ${liveScore(ch, ab)} (Epic Boons raise the ceiling to ${MAX_ABILITY_EPIC}).`);
    else log.push('Every ability score already stands at 30 — no further increase is possible.');

    log.push(`Maximum hit points: ${ch.maxHp} (+${MYTHIC_HP_PER_TIER}).`);
    log.unshift(`Mythic tier ${info.tier} — ${info.name}. ${info.desc}`);

    bus.emit(EV.LEVEL_UP, { ch, uid: ch.uid, mythic: true, tier: info.tier, applied: true, log });
    return { ok: true, tier: info.tier, name: info.name, boonId: def?.id || null, log };
  } catch (err) {
    console.error('[progression] applyMythic failed', err);
    if (restoreChar(ch, snap)) refresh(ch);
    return { ok: false, reason: err && err.message ? err.message : 'The boon could not be claimed.', log };
  }
}

/** One-line summary for the character sheet: "Level 20 Fighter — Chosen of the Gods". */
export function mythicSummary(ch) {
  const t = mythicLevel(ch);
  if (!t) return '';
  const info = mythicTierInfo(t);
  return `${info.name} (Mythic ${t})`;
}

// ---------------------------------------------------------------------------
// 10. Register this module's option catalogues with character.js so a chosen
// invocation / metamagic / maneuver can carry a `mech` block into the merge.
// ---------------------------------------------------------------------------
try {
  if (typeof Char.registerOptions === 'function') {
    const reg = {};
    for (const [id, v] of Object.entries(MANEUVERS)) reg[id] = { id, name: v.name, desc: v.desc, mech: v.mech || null };
    for (const [id, v] of Object.entries(METAMAGIC)) reg[id] = { id, name: v.name, desc: v.desc, mech: v.mech || null };
    for (const [id, v] of Object.entries(INVOCATIONS)) reg[id] = { id, name: v.name, desc: v.desc, mech: v.mech || null };
    for (const [id, v] of Object.entries(LAND_CIRCLES)) reg[id] = { id, name: v.name, desc: v.desc, mech: null };
    for (const [id, v] of Object.entries(DRAGON_ANCESTRIES)) reg[id] = { id, name: v.name, desc: v.desc, mech: null };
    for (const [id, v] of Object.entries(FALLBACK_STYLES)) if (!FIGHTING_STYLES[id]) reg[id] = { id, name: v.name, desc: v.desc, mech: v.mech || null };
    Char.registerOptions(reg);
  }
} catch (e) {
  console.error('[progression] option registration failed', e);
}
