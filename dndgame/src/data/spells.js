// data/spells.js — the merged spell catalogue and its query helpers.
// The raw entries live in spells_low.js (cantrips–4th) and spells_high.js (5th–9th).

import { SPELLS_LOW } from './spells_low.js';
import { SPELLS_HIGH } from './spells_high.js';

/** Every spell in the game, keyed by id. */
export const SPELLS = Object.freeze({ ...SPELLS_LOW, ...SPELLS_HIGH });

export const SPELL_IDS = Object.freeze(Object.keys(SPELLS));

export const SCHOOLS = Object.freeze({
  abjuration: { id: 'abjuration', name: 'Abjuration', color: '#5aa8ff', desc: 'Wards, barriers and banishment.' },
  conjuration: { id: 'conjuration', name: 'Conjuration', color: '#5fd07a', desc: 'Summoning and transportation.' },
  divination: { id: 'divination', name: 'Divination', color: '#9fd6e8', desc: 'Knowledge, foresight and truth.' },
  enchantment: { id: 'enchantment', name: 'Enchantment', color: '#e28ad0', desc: 'Charms that bend the mind.' },
  evocation: { id: 'evocation', name: 'Evocation', color: '#ff8a3a', desc: 'Raw elemental force.' },
  illusion: { id: 'illusion', name: 'Illusion', color: '#b07af0', desc: 'Deception of the senses.' },
  necromancy: { id: 'necromancy', name: 'Necromancy', color: '#7fbf6a', desc: 'Life, death and the space between.' },
  transmutation: { id: 'transmutation', name: 'Transmutation', color: '#ffd24a', desc: 'Changing what a thing is.' },
});

/** The nine class spell lists (2024 PHB). */
export const SPELL_LISTS = ['bard', 'cleric', 'druid', 'paladin', 'ranger', 'sorcerer', 'warlock', 'wizard'];

// --- indexes (built once at load) ------------------------------------------

const byList = {};
const byLevel = {};
const bySchool = {};
for (const id of SPELL_IDS) {
  const s = SPELLS[id];
  for (const list of s.lists || []) {
    (byList[list] ||= []).push(id);
  }
  (byLevel[s.level] ||= []).push(id);
  (bySchool[s.school] ||= []).push(id);
}
for (const k of Object.keys(byList)) byList[k].sort((a, b) => SPELLS[a].level - SPELLS[b].level || SPELLS[a].name.localeCompare(SPELLS[b].name));

export function getSpell(id) { return SPELLS[id] || null; }

export function spellName(id) { return SPELLS[id]?.name || id; }

/** All spell ids on a class list, optionally capped at a maximum spell level. */
export function spellsForList(list, maxLevel = 9, minLevel = 0) {
  return (byList[list] || []).filter((id) => SPELLS[id].level <= maxLevel && SPELLS[id].level >= minLevel);
}

/** Cantrips available to a class. */
export function cantripsForList(list) { return spellsForList(list, 0, 0); }

export function spellsAtLevel(level) { return (byLevel[level] || []).slice(); }
export function spellsOfSchool(school) { return (bySchool[school] || []).slice(); }

/** Spells matching a tag ('damage','heal','control','buff','debuff','utility','summon','movement'). */
export function spellsWithTag(tag, list = null) {
  const pool = list ? (byList[list] || []) : SPELL_IDS;
  return pool.filter((id) => (SPELLS[id].tags || []).includes(tag));
}

/** Human-readable range: 0 -> 'Self', 5 -> 'Touch', number -> '120 ft'. */
export function rangeText(spell) {
  const r = spell.range;
  if (r === 'self' || r === 0) return 'Self';
  if (r === 'touch' || r === 5) return 'Touch';
  if (r === 'sight') return 'Sight';
  if (r === 'unlimited') return 'Unlimited';
  return typeof r === 'number' ? `${r} ft.` : String(r);
}

/** Range in feet for engine maths. */
export function rangeFeet(spell) {
  const r = spell.range;
  if (r === 'self') return 0;
  if (r === 'touch') return 5;
  if (r === 'sight' || r === 'unlimited') return 9999;
  return typeof r === 'number' ? r : 30;
}

/** "V, S, M (a pinch of bat guano)" */
export function componentText(spell) {
  const c = spell.components || {};
  const parts = [];
  if (c.v) parts.push('V');
  if (c.s) parts.push('S');
  if (c.m) parts.push(typeof c.m === 'string' ? `M (${c.m})` : 'M');
  return parts.join(', ') || '—';
}

/** A one-line summary for the spell list UI. */
export function spellSummary(spell) {
  const lvl = spell.level === 0 ? 'Cantrip' : `Level ${spell.level}`;
  const sch = SCHOOLS[spell.school]?.name || spell.school;
  const bits = [`${lvl} ${sch}`];
  if (spell.concentration) bits.push('Conc.');
  if (spell.ritual) bits.push('Ritual');
  return bits.join(' · ');
}

/**
 * Damage dice for a spell cast at a given slot level, including cantrip scaling
 * by character level and per-slot upcasting.
 */
export function spellDamageDice(spell, slotLevel, casterLevel = 1) {
  if (!spell.damage) return null;
  const base = spell.damage.dice;
  const scale = spell.damage.scale || {};

  if (spell.level === 0) {
    // Cantrips gain dice at 5th, 11th and 17th character level.
    const marks = scale.cantripLevels || [5, 11, 17];
    let extra = 0;
    for (const m of marks) if (casterLevel >= m) extra++;
    return addDice(base, extra);
  }
  if (scale.perSlot && slotLevel > spell.level) {
    const steps = slotLevel - spell.level;
    const per = parseCount(scale.perSlot);
    return addDice(base, per * steps);
  }
  return base;
}

function parseCount(expr) {
  const m = String(expr).match(/^(\d*)d/);
  return m ? (m[1] === '' ? 1 : parseInt(m[1], 10)) : 0;
}

function addDice(expr, extra) {
  if (!extra) return expr;
  const m = String(expr).match(/^(\d*)d(\d+)(.*)$/);
  if (!m) return expr;
  const n = (m[1] === '' ? 1 : parseInt(m[1], 10)) + extra;
  return `${n}d${m[2]}${m[3] || ''}`;
}

/** Healing dice with the same upcast logic. */
export function spellHealDice(spell, slotLevel) {
  if (!spell.heal) return null;
  const scale = spell.heal.scale || {};
  if (scale.perSlot && slotLevel > spell.level) {
    return addDice(spell.heal.dice, parseCount(scale.perSlot) * (slotLevel - spell.level));
  }
  return spell.heal.dice;
}

/** Does this spell need a target selected on the battle grid? */
export function needsTarget(spell) {
  const k = spell.target?.kind;
  return k && k !== 'self';
}

/** Sorted, display-ready list for a spellbook UI. */
export function sortSpells(ids) {
  return ids.slice().sort((a, b) => {
    const A = SPELLS[a], B = SPELLS[b];
    if (!A || !B) return 0;
    return A.level - B.level || A.name.localeCompare(B.name);
  });
}

export function spellCount() { return SPELL_IDS.length; }
