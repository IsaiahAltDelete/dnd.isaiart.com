// rules/abilities.js — ability scores, modifiers, skills, and the character
// creation score-generation methods.

export const ABILITIES = Object.freeze(['str', 'dex', 'con', 'int', 'wis', 'cha']);

export const ABILITY_NAMES = Object.freeze({
  str: 'Strength', dex: 'Dexterity', con: 'Constitution',
  int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma',
});

export const ABILITY_ABBR = Object.freeze({
  str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA',
});

export const ABILITY_DESC = Object.freeze({
  str: 'Raw physical power. Melee attacks, grappling, breaking down doors.',
  dex: 'Agility and reflexes. Finesse weapons, AC, stealth, initiative.',
  con: 'Health and stamina. Hit points and holding concentration.',
  int: 'Reasoning and recall. Wizard magic, lore, investigation.',
  wis: 'Perception and insight. Cleric and druid magic, willpower.',
  cha: 'Force of personality. Bard, sorcerer, warlock and paladin magic.',
});

/** The 5e modifier: floor((score - 10) / 2). */
export function mod(score) { return Math.floor((score - 10) / 2); }

/** "+3" / "-1" for display. */
export function modText(score) { const m = mod(score); return m >= 0 ? `+${m}` : `${m}`; }

// --- skills ---------------------------------------------------------------

export const SKILLS = Object.freeze({
  acrobatics: { id: 'acrobatics', name: 'Acrobatics', ability: 'dex', desc: 'Balance, tumbling, staying on your feet.' },
  'animal-handling': { id: 'animal-handling', name: 'Animal Handling', ability: 'wis', desc: 'Calm, read and control beasts.' },
  arcana: { id: 'arcana', name: 'Arcana', ability: 'int', desc: 'Spells, magic items, the Weave, planar lore.' },
  athletics: { id: 'athletics', name: 'Athletics', ability: 'str', desc: 'Climbing, swimming, jumping, grappling.' },
  deception: { id: 'deception', name: 'Deception', ability: 'cha', desc: 'Convincing lies and misdirection.' },
  history: { id: 'history', name: 'History', ability: 'int', desc: 'Realms lore, old wars, fallen kingdoms.' },
  insight: { id: 'insight', name: 'Insight', ability: 'wis', desc: 'Reading intentions and spotting a liar.' },
  intimidation: { id: 'intimidation', name: 'Intimidation', ability: 'cha', desc: 'Threats, menace, hostile persuasion.' },
  investigation: { id: 'investigation', name: 'Investigation', ability: 'int', desc: 'Deduction from clues and searching.' },
  medicine: { id: 'medicine', name: 'Medicine', ability: 'wis', desc: 'Stabilise the dying, diagnose illness.' },
  nature: { id: 'nature', name: 'Nature', ability: 'int', desc: 'Terrain, plants, animals, weather.' },
  perception: { id: 'perception', name: 'Perception', ability: 'wis', desc: 'Noticing what others miss.' },
  performance: { id: 'performance', name: 'Performance', ability: 'cha', desc: 'Music, oratory, holding a crowd.' },
  persuasion: { id: 'persuasion', name: 'Persuasion', ability: 'cha', desc: 'Tact, grace and good faith.' },
  religion: { id: 'religion', name: 'Religion', ability: 'int', desc: 'The Faerûnian pantheon, rites, undead lore.' },
  'sleight-of-hand': { id: 'sleight-of-hand', name: 'Sleight of Hand', ability: 'dex', desc: 'Pickpocketing and palming.' },
  stealth: { id: 'stealth', name: 'Stealth', ability: 'dex', desc: 'Moving unseen and unheard.' },
  survival: { id: 'survival', name: 'Survival', ability: 'wis', desc: 'Tracking, foraging, navigating the wilds.' },
});

export const SKILL_IDS = Object.freeze(Object.keys(SKILLS));

export function skillsForAbility(ab) { return SKILL_IDS.filter((s) => SKILLS[s].ability === ab); }
export function skillName(id) { return SKILLS[id]?.name || id; }
export function skillAbility(id) { return SKILLS[id]?.ability || 'dex'; }

// --- score generation -----------------------------------------------------

export const STANDARD_ARRAY = Object.freeze([15, 14, 13, 12, 10, 8]);

/** 2024 point buy: 27 points, scores 8–15. */
export const POINT_BUY_COST = Object.freeze({ 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 });
export const POINT_BUY_TOTAL = 27;
export const POINT_BUY_MIN = 8;
export const POINT_BUY_MAX = 15;

export function pointBuySpent(scores) {
  let total = 0;
  for (const ab of ABILITIES) total += POINT_BUY_COST[scores[ab]] ?? 0;
  return total;
}

export function pointBuyRemaining(scores) { return POINT_BUY_TOTAL - pointBuySpent(scores); }

export function canRaise(scores, ab) {
  const cur = scores[ab];
  if (cur >= POINT_BUY_MAX) return false;
  const cost = (POINT_BUY_COST[cur + 1] ?? 99) - (POINT_BUY_COST[cur] ?? 0);
  return pointBuyRemaining(scores) >= cost;
}

export function canLower(scores, ab) { return scores[ab] > POINT_BUY_MIN; }

/** A blank point-buy spread (all 8s). */
export function emptyScores(v = 8) {
  const o = {};
  for (const ab of ABILITIES) o[ab] = v;
  return o;
}

/** Suggested ability priority per class, used for the "auto-assign" button. */
export const CLASS_PRIORITY = Object.freeze({
  barbarian: ['str', 'con', 'dex', 'wis', 'cha', 'int'],
  bard: ['cha', 'dex', 'con', 'wis', 'int', 'str'],
  cleric: ['wis', 'con', 'str', 'cha', 'dex', 'int'],
  druid: ['wis', 'con', 'dex', 'int', 'cha', 'str'],
  fighter: ['str', 'con', 'dex', 'wis', 'cha', 'int'],
  monk: ['dex', 'wis', 'con', 'str', 'cha', 'int'],
  paladin: ['str', 'cha', 'con', 'wis', 'dex', 'int'],
  ranger: ['dex', 'wis', 'con', 'str', 'int', 'cha'],
  rogue: ['dex', 'con', 'wis', 'cha', 'int', 'str'],
  sorcerer: ['cha', 'con', 'dex', 'wis', 'int', 'str'],
  warlock: ['cha', 'con', 'dex', 'wis', 'int', 'str'],
  wizard: ['int', 'con', 'dex', 'wis', 'cha', 'str'],
});

/** Assign an array of numbers to abilities following a class's priority order. */
export function autoAssign(values, classId) {
  const order = CLASS_PRIORITY[classId] || ABILITIES;
  const sorted = values.slice().sort((a, b) => b - a);
  const out = {};
  order.forEach((ab, i) => { out[ab] = sorted[i] ?? 10; });
  return out;
}

// --- DC helpers -----------------------------------------------------------

export const DC = Object.freeze({
  trivial: 5, easy: 10, medium: 15, hard: 20, veryHard: 25, nearlyImpossible: 30,
});

export function dcLabel(dc) {
  if (dc <= 5) return 'Very Easy';
  if (dc <= 10) return 'Easy';
  if (dc <= 15) return 'Medium';
  if (dc <= 20) return 'Hard';
  if (dc <= 25) return 'Very Hard';
  return 'Nearly Impossible';
}

/** Passive score: 10 + modifier (+5 advantage / -5 disadvantage). */
export function passive(modifier, { adv = false, dis = false } = {}) {
  return 10 + modifier + (adv ? 5 : 0) - (dis ? 5 : 0);
}
