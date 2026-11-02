// rules/spellcasting.js — spell slots, preparation, Mystic Arcanum, sorcery-point
// conversion and concentration. Headless rules layer: no UI, no rendering.

import { mod } from './abilities.js';
import { d20 } from '../core/dice.js';
import { rng } from '../core/rng.js';
import { bus, EV } from '../core/events.js';

// The data catalogues are authored in parallel with this module. They are imported
// as NAMESPACES so that a not-yet-written named export can never break module
// linking, and every lookup below defaults to an empty table.
import * as ClassData from '../data/classes.js';
import * as SubclassData from '../data/subclasses.js';
import * as SpellData from '../data/spells.js';
import { resolveItem } from '../data/items.js';

const CLASSES = ClassData.CLASSES || {};
const SUBCLASSES = SubclassData.SUBCLASSES || {};
const SPELLS = SpellData.SPELLS || {};

// ---------------------------------------------------------------------------
// Slot tables
// ---------------------------------------------------------------------------

/** [4,3,2] -> { 1:4, 2:3, 3:2 } (zeros omitted). */
function slotRow(arr) {
  const o = {};
  for (let i = 0; i < arr.length; i++) if (arr[i]) o[i + 1] = arr[i];
  return Object.freeze(o);
}

/** rows[0] describes level 1; index 0 of the built table is an empty row. */
function slotTable(rows) {
  const t = [Object.freeze({})];
  for (const r of rows) t.push(slotRow(r));
  return Object.freeze(t);
}

/** Full casters: bard, cleric, druid, sorcerer, wizard. Indexed by caster level. */
export const FULL_SLOTS = slotTable([
  [2],
  [3],
  [4, 2],
  [4, 3],
  [4, 3, 2],
  [4, 3, 3],
  [4, 3, 3, 1],
  [4, 3, 3, 2],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
]);

/**
 * Half casters: paladin and ranger (and artificer-style rounding).
 * 2024 PHB gives paladins and rangers Spellcasting at 1st level with two 1st-level
 * slots — the old "nothing until 2nd" hole is gone.
 */
export const HALF_SLOTS = slotTable([
  [2], [2], [3], [3], [4, 2], [4, 2], [4, 3], [4, 3], [4, 3, 2], [4, 3, 2],
  [4, 3, 3], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 2],
  [4, 3, 3, 3, 1], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2], [4, 3, 3, 3, 2],
]);

/** Third casters: Eldritch Knight and Arcane Trickster. Nothing before class level 3. */
export const THIRD_SLOTS = slotTable([
  [], [], [2], [3], [3], [3], [4, 2], [4, 2], [4, 2], [4, 3],
  [4, 3], [4, 3], [4, 3, 2], [4, 3, 2], [4, 3, 2], [4, 3, 3],
  [4, 3, 3], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 1],
]);

/**
 * Pact Magic (warlock). Every slot is the SAME level — the highest the warlock has —
 * and the whole pool comes back on a SHORT rest.
 * Each entry is { count, level, slots:{ <level>: count } }; `slots` gives the same
 * `{1:n,...}` shape the other three tables use.
 */
export const PACT_SLOTS = (() => {
  // [warlock level] -> [slot count, slot level]
  const rows = [
    [1, 1], [2, 1], [2, 2], [2, 2], [2, 3], [2, 3], [2, 4], [2, 4], [2, 5], [2, 5],
    [3, 5], [3, 5], [3, 5], [3, 5], [3, 5], [3, 5], [4, 5], [4, 5], [4, 5], [4, 5],
  ];
  const t = [Object.freeze({ count: 0, level: 0, slots: Object.freeze({}) })];
  for (const [count, level] of rows) {
    t.push(Object.freeze({ count, level, slots: Object.freeze({ [level]: count }) }));
  }
  return Object.freeze(t);
})();

/** Warlock levels at which a Mystic Arcanum is gained, and the spell level it grants. */
export const MYSTIC_ARCANUM_LEVELS = Object.freeze({ 11: 6, 13: 7, 15: 8, 17: 9 });

/** Font of Magic (2024): sorcery points spent to create a spell slot. */
export const SLOT_SP_COST = Object.freeze({ 1: 2, 2: 3, 3: 5, 4: 6, 5: 7 });

// ---------------------------------------------------------------------------
// Fallback class tables — used only when data/classes.js has not supplied them.
// All figures are the 2024 PHB class tables. Index 0 is unused (index = class level).
// ---------------------------------------------------------------------------

const FALLBACK_SLOT_KIND = Object.freeze({
  bard: 'full', cleric: 'full', druid: 'full', sorcerer: 'full', wizard: 'full',
  paladin: 'half', ranger: 'half', artificer: 'half',
  warlock: 'pact',
  fighter: null, rogue: null, barbarian: null, monk: null,
});

/** Subclasses that grant third-caster progression. */
const FALLBACK_THIRD_SUBCLASSES = Object.freeze(['eldritch-knight', 'arcane-trickster']);

const CANTRIPS_KNOWN = Object.freeze({
  bard: [0, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
  cleric: [0, 3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
  druid: [0, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
  sorcerer: [0, 4, 4, 4, 5, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6],
  warlock: [0, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
  wizard: [0, 3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
  paladin: null, ranger: null,
  // Eldritch Knight / Arcane Trickster: 2 cantrips at 3rd, a third at 10th.
  third: [0, 0, 0, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
});

/**
 * 2024 "Prepared Spells" columns. These are FIXED per-class tables — the 2014
 * "level + ability modifier" formula is gone.
 */
const PREPARED_TABLE = Object.freeze({
  // Bard, Cleric, Druid and Wizard share the full-caster progression.
  full: [0, 4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 18, 19, 21, 22, 23, 24, 25],
  sorcerer: [0, 2, 4, 4, 5, 5, 6, 7, 7, 9, 9, 10, 10, 11, 11, 12, 12, 14, 14, 15, 15],
  warlock: [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15],
  paladin: [0, 2, 2, 3, 4, 5, 6, 6, 7, 7, 9, 9, 9, 10, 10, 11, 11, 12, 12, 14, 14],
  ranger: [0, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11],
  third: [0, 0, 0, 3, 4, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11],
});

const FALLBACK_ABILITY = Object.freeze({
  bard: 'cha', cleric: 'wis', druid: 'wis', paladin: 'cha', ranger: 'wis',
  sorcerer: 'cha', warlock: 'cha', wizard: 'int', artificer: 'int',
  'eldritch-knight': 'int', 'arcane-trickster': 'int',
});

// ---------------------------------------------------------------------------
// Small shared helpers
// ---------------------------------------------------------------------------

/**
 * Read a per-level table. Accepts both conventions: 21 entries indexed BY level
 * (index 0 unused, as SPEC §3 describes) or 20 entries indexed by level-1.
 */
export function tableAt(arr, level) {
  if (!Array.isArray(arr) || !arr.length) return 0;
  const lv = Math.max(0, Math.floor(level || 0));
  const v = arr.length >= 21 ? arr[Math.min(lv, arr.length - 1)] : arr[Math.min(Math.max(lv - 1, 0), arr.length - 1)];
  return typeof v === 'number' ? v : 0;
}

const lvl20 = (n) => Math.max(0, Math.min(20, Math.floor(n || 0)));

/** Proficiency bonus without importing progression.js (which imports this module). */
function profOf(ch) {
  if (ch && typeof ch.prof === 'number' && ch.prof > 0) return ch.prof;
  return 2 + Math.floor((Math.max(1, lvl20(ch?.level || 1)) - 1) / 4);
}

/** Ability score including permanent bonuses and active effects. Mirrors character.js. */
function scoreOf(ch, ab) {
  let v = (ch?.base?.[ab] ?? 10) + (ch?.asi?.[ab] ?? 0);
  for (const e of ch?.effects || []) {
    const a = e?.mech?.asi?.[ab];
    if (typeof a === 'number') v += a;
    const set = e?.mech?.setAbility?.[ab];
    if (typeof set === 'number' && set > v) v = set;
  }
  return v;
}

function abilityModOf(ch, ab) { return mod(scoreOf(ch, ab)); }

/** All `mech` blocks currently riding on the character (feat/effect flags). */
function mechFlags(ch) {
  const out = [];
  for (const e of ch?.effects || []) if (e?.mech) out.push(e.mech);
  for (const c of ch?.conditions || []) if (c?.mech) out.push(c.mech);
  return out;
}

// ---------------------------------------------------------------------------
// Which classes cast, and how
// ---------------------------------------------------------------------------

/**
 * The slot progression a class entry uses: 'full' | 'half' | 'third' | 'pact' | null.
 * Subclass casting (Eldritch Knight, Arcane Trickster) is honoured.
 */
export function slotKindForClass(classId, subclassId) {
  const cls = CLASSES[classId];
  const sub = SUBCLASSES[subclassId];
  if (sub?.spellcasting?.slotTable) return sub.spellcasting.slotTable;
  if (sub && FALLBACK_THIRD_SUBCLASSES.includes(subclassId)) return 'third';
  if (cls?.spellcasting?.slotTable) return cls.spellcasting.slotTable;
  if (cls?.spellcasting) return cls.spellcasting.type === 'pact' ? 'pact' : 'full';
  return FALLBACK_SLOT_KIND[classId] ?? null;
}

/** The spellcasting block in effect for a class entry (class block, else subclass block). */
function castingBlock(classId, subclassId) {
  return CLASSES[classId]?.spellcasting || SUBCLASSES[subclassId]?.spellcasting || null;
}

/** The casting ability for a class entry. */
export function castingAbility(classId, subclassId) {
  const blk = castingBlock(classId, subclassId);
  return blk?.ability || FALLBACK_ABILITY[subclassId] || FALLBACK_ABILITY[classId] || 'int';
}

/**
 * Every spellcasting class the character has levels in, as
 * [{ id, subclassId, level, kind, ability, block }], strongest class first.
 */
export function castingClasses(ch) {
  const out = [];
  for (const c of ch?.classes || []) {
    if (!c || !c.id) continue;
    const level = Math.max(0, Math.floor(c.level || 0));
    if (!level) continue;
    const kind = slotKindForClass(c.id, c.subclassId);
    if (!kind) continue;
    // A third caster only begins casting at class level 3.
    if (kind === 'third' && level < 3) continue;
    out.push({
      id: c.id, subclassId: c.subclassId || null, level, kind,
      ability: castingAbility(c.id, c.subclassId),
      block: castingBlock(c.id, c.subclassId),
    });
  }
  out.sort((a, b) => b.level - a.level);
  return out;
}

/** True if the class prepares from a list each rest (cleric/druid/wizard style). */
export function isPreparedCaster(classId, subclassId) {
  const blk = castingBlock(classId, subclassId);
  if (blk?.type) return blk.type === 'prepared';
  return classId === 'cleric' || classId === 'druid' || classId === 'wizard' || classId === 'artificer';
}

/**
 * Multiclass caster level (2024 Multiclass Spellcaster table).
 *  - full casters contribute their whole level,
 *  - half casters half, rounded down — but a 1st-level paladin/ranger DOES have
 *    slots in 2024, so level 1 contributes 1 rather than 0,
 *  - third casters a third, rounded down,
 *  - Pact Magic never contributes; it is a separate pool.
 */
export function casterLevel(ch) {
  let total = 0;
  for (const c of castingClasses(ch)) {
    if (c.kind === 'full') total += c.level;
    else if (c.kind === 'half') total += Math.max(1, Math.floor(c.level / 2));
    else if (c.kind === 'third') total += Math.floor(c.level / 3);
  }
  return total;
}

// ---------------------------------------------------------------------------
// Known / prepared counts
// ---------------------------------------------------------------------------

/** Cantrips known for one class entry at a given class level. */
export function cantripsKnownFor(classId, level, subclassId) {
  const blk = castingBlock(classId, subclassId);
  if (Array.isArray(blk?.cantripsKnown)) return tableAt(blk.cantripsKnown, level);
  const kind = slotKindForClass(classId, subclassId);
  if (kind === 'third') return tableAt(CANTRIPS_KNOWN.third, level);
  const t = CANTRIPS_KNOWN[classId];
  return t ? tableAt(t, level) : 0;
}

/**
 * Prepared-spell cap for ONE class entry.
 * `prepFormula` may be a table (array, per class level), a number, or a formula
 * string like 'level+int' / 'half+wis' / 'third+int'. 2024's own tables are fixed,
 * so the tables win when both are supplied.
 */
export function preparedMaxForClass(classId, level, subclassId) {
  const blk = castingBlock(classId, subclassId);
  const f = blk?.prepFormula;
  const kind = slotKindForClass(classId, subclassId);

  if (Array.isArray(f)) return Math.max(0, tableAt(f, level));
  if (typeof f === 'number') return Math.max(0, f);
  if (typeof f === 'string') {
    const m = f.trim().toLowerCase().match(/^(level|full|half|third)\s*\+\s*(str|dex|con|int|wis|cha)$/);
    if (m) {
      const base = m[1] === 'half' ? Math.floor(level / 2)
        : m[1] === 'third' ? Math.floor(level / 3) : level;
      // The caller passes the ability modifier through `_abilityMod` (see preparedMax).
      return Math.max(1, base + (preparedMaxForClass._abilityMod?.(m[2]) ?? 0));
    }
  }
  if (Array.isArray(blk?.preparedTable)) return Math.max(0, tableAt(blk.preparedTable, level));

  // 2024 fallback tables.
  if (kind === 'third') return tableAt(PREPARED_TABLE.third, level);
  if (PREPARED_TABLE[classId]) return tableAt(PREPARED_TABLE[classId], level);
  if (kind === 'full') return tableAt(PREPARED_TABLE.full, level);
  if (kind === 'half') return tableAt(PREPARED_TABLE.ranger, level);
  return 0;
}

/** Total prepared-spell cap across every casting class. */
export function preparedMax(ch) {
  let total = 0;
  for (const c of castingClasses(ch)) {
    // Give the formula-string branch access to this character's ability modifiers.
    preparedMaxForClass._abilityMod = (ab) => abilityModOf(ch, ab);
    total += preparedMaxForClass(c.id, c.level, c.subclassId);
    preparedMaxForClass._abilityMod = null;
  }
  return total;
}

// ---------------------------------------------------------------------------
// recomputeSpells — the one call that rebuilds ch.spells
// ---------------------------------------------------------------------------

/**
 * Rebuild slots, save DC, attack bonus, cantrip cap, prepared cap, pact pool and
 * Mystic Arcanum. Used slot counts survive the rebuild (clamped to the new maxima)
 * so this is safe to call mid-adventuring-day.
 */
export function recomputeSpells(ch) {
  if (!ch) return ch;
  const sp = ch.spells = ch.spells || {};
  sp.known = Array.isArray(sp.known) ? sp.known : [];
  sp.prepared = Array.isArray(sp.prepared) ? sp.prepared : [];
  sp.cantrips = Array.isArray(sp.cantrips) ? sp.cantrips : [];

  const casters = castingClasses(ch);
  if (!casters.length) {
    sp.slots = {};
    sp.pact = null;
    sp.arcanum = null;
    sp.ability = sp.ability || null;
    sp.dc = 8 + profOf(ch);
    sp.atk = profOf(ch);
    sp.cantripMax = 0;
    sp.preparedMax = 0;
    sp.casterLevel = 0;
    sp.byClass = {};
    return ch;
  }

  // --- slots -------------------------------------------------------------
  const prevUsed = {};
  for (const k of Object.keys(sp.slots || {})) prevUsed[k] = sp.slots[k]?.used || 0;

  const nonPact = casters.filter((c) => c.kind !== 'pact');
  let table = null;
  if (nonPact.length === 1) {
    // A single casting class always uses its OWN table at its own class level.
    const c = nonPact[0];
    const src = c.kind === 'full' ? FULL_SLOTS : c.kind === 'half' ? HALF_SLOTS : THIRD_SLOTS;
    table = src[lvl20(c.level)] || {};
  } else if (nonPact.length > 1) {
    // Two or more casting classes: the multiclass caster level on the full table.
    table = FULL_SLOTS[lvl20(casterLevel(ch))] || {};
  }

  const slots = {};
  for (const k of Object.keys(table || {})) {
    const max = table[k];
    slots[k] = { max, used: Math.min(prevUsed[k] || 0, max) };
  }
  sp.slots = slots;

  // --- pact magic --------------------------------------------------------
  const pactClass = casters.find((c) => c.kind === 'pact');
  if (pactClass) {
    const p = PACT_SLOTS[lvl20(pactClass.level)] || PACT_SLOTS[1];
    sp.pact = { level: p.level, max: p.count, used: Math.min(sp.pact?.used || 0, p.count) };
  } else {
    sp.pact = null;
  }

  // --- DC / attack, per class and overall ---------------------------------
  const prof = profOf(ch);
  sp.byClass = {};
  for (const c of casters) {
    const m = abilityModOf(ch, c.ability);
    sp.byClass[c.id] = {
      ability: c.ability, dc: 8 + prof + m, atk: prof + m,
      level: c.level, kind: c.kind, prepared: preparedMaxForClass(c.id, c.level, c.subclassId),
    };
  }
  // The "main" casting class is the one with the most levels (castingClasses is sorted).
  const main = casters[0];
  sp.ability = main.ability;
  const mainMod = abilityModOf(ch, main.ability);
  sp.dc = 8 + prof + mainMod;       // 2024: spell save DC = 8 + proficiency + ability modifier
  sp.atk = prof + mainMod;          // spell attack bonus = proficiency + ability modifier
  sp.casterLevel = casterLevel(ch);

  // --- caps ---------------------------------------------------------------
  let cantripMax = 0;
  for (const c of casters) cantripMax += cantripsKnownFor(c.id, c.level, c.subclassId);
  sp.cantripMax = cantripMax;
  sp.preparedMax = preparedMax(ch);

  // --- Mystic Arcanum -----------------------------------------------------
  if (pactClass && pactClass.level >= 11) {
    const prev = sp.arcanum || {};
    const arc = {};
    for (const [lv, spellLevel] of Object.entries(MYSTIC_ARCANUM_LEVELS)) {
      if (pactClass.level >= Number(lv)) {
        arc[spellLevel] = {
          spellId: prev[spellLevel]?.spellId || null,
          used: !!prev[spellLevel]?.used,
        };
      }
    }
    sp.arcanum = arc;
  } else if (!pactClass) {
    sp.arcanum = null;
  }

  return ch;
}

export function spellDC(ch) {
  if (ch?.spells && typeof ch.spells.dc === 'number' && ch.spells.dc) return ch.spells.dc;
  const c = castingClasses(ch)[0];
  return 8 + profOf(ch) + (c ? abilityModOf(ch, c.ability) : 0);
}

export function spellAtk(ch, spellId) {
  const grant=equipmentCantrips(ch).find(g=>g.spellId===spellId);
  if(grant?.ability&&!ch?.spells?.cantrips?.includes(spellId))return profOf(ch)+abilityModOf(ch,grant.ability);
  if (ch?.spells && typeof ch.spells.atk === 'number') return ch.spells.atk;
  const c = castingClasses(ch)[0];
  return profOf(ch) + (c ? abilityModOf(ch, c.ability) : 0);
}

/** Save DC for a specific class (multiclass casters can have two different DCs). */
export function spellDCFor(ch, classId) {
  return ch?.spells?.byClass?.[classId]?.dc ?? spellDC(ch);
}

// ---------------------------------------------------------------------------
// Spell lists and knowledge
// ---------------------------------------------------------------------------

/**
 * Every spell id on a class's list up to `maxLevel`. Accepts a class id, a
 * subclass id (Eldritch Knight -> wizard) or a raw list name.
 */
export function spellList(classId, maxLevel = 9, minLevel = 0) {
  const blk = CLASSES[classId]?.spellcasting || SUBCLASSES[classId]?.spellcasting || null;
  const list = blk?.list || classId;
  if (typeof SpellData.spellsForList === 'function') {
    try { return SpellData.spellsForList(list, maxLevel, minLevel) || []; } catch { /* fall through */ }
  }
  return Object.keys(SPELLS).filter((id) => {
    const s = SPELLS[id];
    return s && (s.lists || []).includes(list) && s.level <= maxLevel && s.level >= minLevel;
  });
}

/** The class list a character casts from for a given class entry, capped by slots. */
export function spellListForChar(ch, classId, subclassId) {
  const blk = castingBlock(classId, subclassId);
  const list = blk?.list || (SUBCLASSES[subclassId]?.spellcasting?.list) || classId;
  return spellList(list, Math.max(highestSlotLevel(ch), 1));
}

/**
 * Everything the character can actually cast: cantrips, spells known/prepared,
 * subclass and species grants, and chosen Mystic Arcanum. Deduplicated.
 */
export function equipmentCantrips(ch){
  const out=[];
  for(const inst of Object.values(ch?.equipment||{})){
    const item=resolveItem(typeof inst==='string'?inst:inst?.id);
    if(!item||item.attunement&&!inst?.attuned)continue;
    const grants=Array.isArray(item.mech?.cantrip)?item.mech.cantrip:[item.mech?.cantrip];
    for(const grant of grants)if(grant?.spellId)out.push(grant);
  }
  return out;
}
export function knownSpells(ch) {
  const out = new Set();
  const sp = ch?.spells || {};
  for (const id of sp.cantrips || []) out.add(id);
  for (const id of sp.known || []) out.add(id);
  for (const id of sp.prepared || []) out.add(id);
  for (const id of sp.alwaysPrepared || []) out.add(id);
  for (const k of Object.keys(sp.arcanum || {})) if (sp.arcanum[k]?.spellId) out.add(sp.arcanum[k].spellId);

  // Subclass spell grants: { 3:['bless','cure-wounds'], 5:[...] }
  for (const c of ch?.classes || []) {
    const grants = SUBCLASSES[c.subclassId]?.spells;
    if (!grants) continue;
    for (const lv of Object.keys(grants)) {
      if ((c.level || 0) >= Number(lv)) for (const id of grants[lv] || []) out.add(id);
    }
  }
  // Species / feat granted castings: mech.spellPerRest / mech.cantrip
  for (const e of ch?.effects || []) {
    for (const g of e?.mech?.spellPerRest || []) if (g?.spellId) out.add(g.spellId);
    if (e?.mech?.cantrip?.spellId) out.add(e.mech.cantrip.spellId);
  }
  // Equipment cantrips exist only while that item is wielded/worn. Do not copy
  // them into the permanent spellbook or consume a learned/prepared selection.
  for(const grant of equipmentCantrips(ch))out.add(grant.spellId);
  return Array.from(out);
}

/** Spells the character always has prepared (subclass grants never count against the cap). */
export function alwaysPreparedSpells(ch) {
  const out = new Set(ch?.spells?.alwaysPrepared || []);
  for (const c of ch?.classes || []) {
    const grants = SUBCLASSES[c.subclassId]?.spells;
    if (!grants) continue;
    for (const lv of Object.keys(grants)) {
      if ((c.level || 0) >= Number(lv)) for (const id of grants[lv] || []) out.add(id);
    }
  }
  return Array.from(out);
}

/**
 * Can this spell go on the prepared list right now?
 * It must exist, be a levelled spell (cantrips are always known), sit on one of the
 * character's class lists, be castable with a slot they possess, and not already be
 * prepared or granted for free.
 */
export function canPrepare(ch, spellId) {
  const s = SPELLS[spellId];
  if (!s || !ch) return false;
  if (s.level === 0) return false;                       // cantrips are known, not prepared
  const top = highestSlotLevel(ch);
  if (top <= 0 || s.level > top) return false;
  if ((ch.spells?.prepared || []).includes(spellId)) return false;
  if (alwaysPreparedSpells(ch).includes(spellId)) return false;

  const casters = castingClasses(ch);
  if (!casters.length) return false;
  for (const c of casters) {
    const blk = castingBlock(c.id, c.subclassId);
    const list = blk?.list || c.id;
    if ((s.lists || []).includes(list)) {
      // Creation and older saves keep starting wizard spells in `known`;
      // advancement writes new entries to `book`. Both are owned spells.
      if (c.id === 'wizard') {
        if (!(ch.spells?.book || []).includes(spellId) && !(ch.spells?.known || []).includes(spellId)) continue;
      }
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Slot bookkeeping
// ---------------------------------------------------------------------------

/** Slot levels with at least one slot left, `minLevel` and up (pact level included). */
export function availableSlots(ch, minLevel = 1) {
  const sp = ch?.spells;
  if (!sp) return [];
  const out = new Set();
  for (const k of Object.keys(sp.slots || {})) {
    const lv = Number(k);
    const s = sp.slots[k];
    if (lv >= minLevel && (s?.max || 0) - (s?.used || 0) > 0) out.add(lv);
  }
  if (sp.pact && sp.pact.level >= minLevel && (sp.pact.max || 0) - (sp.pact.used || 0) > 0) out.add(sp.pact.level);
  return Array.from(out).sort((a, b) => a - b);
}

/** How many slots of exactly this level remain (pact pool counted at its own level). */
export function slotsRemaining(ch, level) {
  const sp = ch?.spells;
  if (!sp) return 0;
  const s = sp.slots?.[level];
  let n = s ? Math.max(0, (s.max || 0) - (s.used || 0)) : 0;
  if (sp.pact && sp.pact.level === level) n += Math.max(0, (sp.pact.max || 0) - (sp.pact.used || 0));
  return n;
}

/** The highest slot level the character owns at all (used or not). */
export function highestSlotLevel(ch) {
  const sp = ch?.spells;
  if (!sp) return 0;
  let top = 0;
  for (const k of Object.keys(sp.slots || {})) if ((sp.slots[k]?.max || 0) > 0) top = Math.max(top, Number(k));
  if (sp.pact?.max) top = Math.max(top, sp.pact.level || 0);
  for (const k of Object.keys(sp.arcanum || {})) top = Math.max(top, Number(k));
  return top;
}

export function hasSlot(ch, level) { return slotsRemaining(ch, level) > 0; }

/**
 * Spend one slot of the given level.
 * Warlocks burn the Pact Magic pool first when the level matches, because those
 * slots come back on a short rest; a multiclass warlock falls through to their
 * ordinary slots when the pact pool is empty or the wrong level.
 */
export function spendSlot(ch, level, opts = {}) {
  const sp = ch?.spells;
  const lv = Math.floor(level || 0);
  if (!sp || lv <= 0) return false;

  const pact = sp.pact;
  const pactOk = !!pact && pact.level === lv && (pact.used || 0) < (pact.max || 0);
  const slot = sp.slots?.[lv];
  const slotOk = !!slot && (slot.used || 0) < (slot.max || 0);

  const prefer = opts.prefer || (pactOk ? 'pact' : 'normal');
  if (prefer === 'pact' && pactOk) { pact.used = (pact.used || 0) + 1; return true; }
  if (slotOk) { slot.used = (slot.used || 0) + 1; return true; }
  if (pactOk) { pact.used = (pact.used || 0) + 1; return true; }

  // Last resort: a warlock's slots are ALL at their pact level, so a lower-level
  // spell is simply cast from that higher slot. Only reached once the exact level
  // and any ordinary slots of it are exhausted, so a multiclass warlock still
  // spends their normal slots first.
  if (opts.upcast !== false && pact && pact.level > lv && (pact.used || 0) < (pact.max || 0)) {
    pact.used = (pact.used || 0) + 1;
    return true;
  }
  return false;
}

/** Hand a slot back (Counterspell fizzles, a scroll saves the slot, DM fiat). */
export function refundSlot(ch, level, opts = {}) {
  const sp = ch?.spells;
  const lv = Math.floor(level || 0);
  if (!sp || lv <= 0) return false;
  if (opts.pact !== false && sp.pact && sp.pact.level === lv && (sp.pact.used || 0) > 0) {
    sp.pact.used--; return true;
  }
  const slot = sp.slots?.[lv];
  if (slot && (slot.used || 0) > 0) { slot.used--; return true; }
  return false;
}

/**
 * Rest recovery.
 *  - Short rest: Pact Magic returns (2024 warlock), nothing else.
 *  - Long rest: every slot, the Mystic Arcanum, sorcery points, Arcane Recovery and
 *    the once-per-long-rest weapon mastery swap all reset.
 */
export function restoreSlots(ch, kind = 'long') {
  const sp = ch?.spells;
  if (!ch) return;
  if (sp?.pact) sp.pact.used = 0;              // Pact Magic recharges on a SHORT rest
  if (kind !== 'long') return;

  if (sp) {
    for (const k of Object.keys(sp.slots || {})) sp.slots[k].used = 0;
    for (const k of Object.keys(sp.arcanum || {})) sp.arcanum[k].used = false;
  }
  ch.flags = ch.flags || {};
  ch.flags.arcaneRecoveryUsed = false;
  ch.flags.masterySwapped = false;             // 2024: swap one Weapon Mastery per long rest
  ch.flags.wildShapeSwapped = false;
  const sorcery = ch.resources?.sorceryPoints;
  if (sorcery) sorcery.used = 0;
}

/** "4/3/3/2 (+2 pact 3rd)" for the spellbook header. */
export function slotSummary(ch) {
  const sp = ch?.spells;
  if (!sp) return '';
  const parts = [];
  for (let lv = 1; lv <= 9; lv++) {
    const s = sp.slots?.[lv];
    if (s?.max) parts.push(`${Math.max(0, s.max - (s.used || 0))}/${s.max}`);
  }
  let out = parts.join(' ');
  if (sp.pact?.max) {
    const left = Math.max(0, sp.pact.max - (sp.pact.used || 0));
    out += `${out ? '  ' : ''}Pact ${left}/${sp.pact.max} @L${sp.pact.level}`;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Mystic Arcanum (warlock 11/13/15/17)
// ---------------------------------------------------------------------------

/** The arcanum spell levels a character has unlocked, e.g. [6,7]. */
export function arcanumLevels(ch) {
  return Object.keys(ch?.spells?.arcanum || {}).map(Number).sort((a, b) => a - b);
}

/** Choose (or replace) the spell held in an arcanum slot. */
export function setArcanum(ch, spellLevel, spellId) {
  const arc = ch?.spells?.arcanum?.[spellLevel];
  const s = SPELLS[spellId];
  if (!arc || !s || s.level !== Number(spellLevel)) return false;
  arc.spellId = spellId;
  return true;
}

/**
 * Cast a Mystic Arcanum: one free casting of that spell per long rest, no slot.
 * Returns the spell id cast, or null.
 */
export function castArcanum(ch, spellLevel) {
  const arc = ch?.spells?.arcanum?.[spellLevel];
  if (!arc || !arc.spellId || arc.used) return null;
  arc.used = true;
  return arc.spellId;
}

// ---------------------------------------------------------------------------
// Arcane Recovery (wizard) and Font of Magic (sorcerer)
// ---------------------------------------------------------------------------

/** Total slot levels a wizard may recover: half wizard level rounded up. */
export function arcaneRecoveryMax(ch) {
  const wiz = (ch?.classes || []).find((c) => c.id === 'wizard');
  if (!wiz || !wiz.level) return 0;
  return Math.ceil(wiz.level / 2);
}

/**
 * Arcane Recovery — once per day, on a short rest, recover expended slots whose
 * combined level equals half your wizard level (rounded up); no slot above 5th.
 * `slotLevels` is the list of slot levels to restore, e.g. [3, 1].
 */
export function arcaneRecovery(ch, slotLevels = []) {
  const log = [];
  const max = arcaneRecoveryMax(ch);
  if (!max) return { ok: false, reason: 'Only wizards have Arcane Recovery.', log };
  ch.flags = ch.flags || {};
  if (ch.flags.arcaneRecoveryUsed) return { ok: false, reason: 'Arcane Recovery has already been used today.', log };

  const list = (slotLevels || []).map(Number).filter((n) => n >= 1);
  if (!list.length) return { ok: false, reason: 'Choose which slots to recover.', log };
  if (list.some((n) => n > 5)) return { ok: false, reason: 'Arcane Recovery cannot restore a slot above 5th level.', log };
  const total = list.reduce((a, b) => a + b, 0);
  if (total > max) return { ok: false, reason: `Arcane Recovery restores at most ${max} slot levels.`, log };

  for (const lv of list) {
    const s = ch.spells?.slots?.[lv];
    if (!s || (s.used || 0) <= 0) return { ok: false, reason: `No expended level ${lv} slot to recover.`, log };
  }
  for (const lv of list) { ch.spells.slots[lv].used--; log.push(`Arcane Recovery: regained a level ${lv} spell slot.`); }
  ch.flags.arcaneRecoveryUsed = true;
  return { ok: true, restored: list, log };
}

/** Sorcery points currently available. */
export function sorceryPoints(ch) {
  const r = ch?.resources?.sorceryPoints;
  if (!r) return 0;
  return Math.max(0, (r.max || 0) - (r.used || 0));
}

/** Spend sorcery points; false if the character is short. */
export function spendSorceryPoints(ch, n) {
  const r = ch?.resources?.sorceryPoints;
  if (!r || n <= 0) return false;
  if (sorceryPoints(ch) < n) return false;
  r.used = (r.used || 0) + n;
  return true;
}

/**
 * Font of Magic — create a spell slot from sorcery points (2024 costs:
 * 1st 2 SP, 2nd 3, 3rd 5, 4th 6, 5th 7). Created slots vanish on a long rest,
 * which the slot reset handles for free.
 */
export function createSlotFromSP(ch, level) {
  const cost = SLOT_SP_COST[level];
  if (!cost) return { ok: false, reason: 'Font of Magic creates slots of 1st–5th level only.' };
  if (sorceryPoints(ch) < cost) return { ok: false, reason: `Not enough sorcery points (${cost} needed).` };
  spendSorceryPoints(ch, cost);
  const sp = ch.spells = ch.spells || {};
  sp.slots = sp.slots || {};
  const s = sp.slots[level] = sp.slots[level] || { max: 0, used: 0 };
  s.max += 1;
  return { ok: true, cost, level, log: [`Font of Magic: created a level ${level} spell slot for ${cost} sorcery points.`] };
}

/**
 * Font of Magic — burn a spell slot for sorcery points equal to the slot's level.
 * Pact slots may not be converted.
 */
export function convertSlotToSP(ch, level) {
  const r = ch?.resources?.sorceryPoints;
  if (!r) return { ok: false, reason: 'Only sorcerers have Font of Magic.' };
  const lv = Number(level);
  const s = ch.spells?.slots?.[lv];
  if (!s || (s.max || 0) - (s.used || 0) <= 0) return { ok: false, reason: `No level ${lv} slot to convert.` };
  // You regain sorcery points equal to the slot's level, never above your maximum.
  // Points are tracked as `used` counting down from `max`.
  const spent = Math.max(0, r.used || 0);
  const gained = Math.min(lv, spent);
  s.used = (s.used || 0) + 1;
  r.used = spent - gained;
  return {
    ok: true, gained, level: lv,
    log: [`Font of Magic: converted a level ${lv} slot into ${gained} sorcery point${gained === 1 ? '' : 's'}.`],
  };
}

// ---------------------------------------------------------------------------
// Concentration
// ---------------------------------------------------------------------------

// Live target objects for the current concentration, keyed by caster uid. The
// Character itself only stores uids (it has to stay JSON-serialisable), so this
// map — plus an optional resolver from combat.js — lets breakConcentration reach
// the creatures the spell is riding on.
const CONC_TARGETS = new Map();
let unitResolver = null;

/** combat.js calls this with a uid -> unit lookup so concentration can find targets. */
export function setUnitResolver(fn) { unitResolver = typeof fn === 'function' ? fn : null; }

export function isConcentrating(ch) { return !!(ch && ch.concentration); }

/**
 * Begin concentrating. Any previous concentration ends first (you can only hold one
 * spell at a time), removing its effects from every creature it touched.
 */
export function startConcentration(ch, spellId, targets = [], opts = {}) {
  if (!ch) return null;
  if (isConcentrating(ch)) breakConcentration(ch, 'started concentrating on another spell');
  const list = (Array.isArray(targets) ? targets : [targets]).filter(Boolean);
  ch.concentration = {
    spellId,
    targets: list.map((t) => t.uid).filter(Boolean),
    dur: opts.dur ?? null,
    level: opts.level ?? (SPELLS[spellId]?.level ?? null),
    round: opts.round ?? null,
  };
  CONC_TARGETS.set(ch.uid, list);
  return ch.concentration;
}

/** Strip every effect/condition a given caster's spell put on a creature. */
function removeSpellEffects(target, casterUid, spellId, removed) {
  if (!target) return;
  const keepEffect = (e) => {
    if (!e) return false;
    const mine = e.source === casterUid || e.sourceUid === casterUid;
    const fromSpell = e.spellId === spellId || e.id === spellId || e.name === spellId;
    if (mine && (e.concentration || fromSpell)) { removed.push({ uid: target.uid, id: e.id || e.name }); return false; }
    return true;
  };
  if (Array.isArray(target.effects)) target.effects = target.effects.filter(keepEffect);
  if (Array.isArray(target.conditions)) {
    target.conditions = target.conditions.filter((c) => {
      if (!c) return false;
      const mine = c.source === casterUid || c.sourceUid === casterUid;
      const fromSpell = c.spellId === spellId || c.source === spellId;
      if (mine && (c.concentration || fromSpell)) { removed.push({ uid: target.uid, id: c.id }); return false; }
      return true;
    });
  }
}

/**
 * End concentration and tear down the spell: every effect and condition it applied
 * to its targets (and to the caster) is removed.
 */
export function breakConcentration(ch, why = '') {
  const conc = ch?.concentration;
  if (!conc) return false;
  ch.concentration = null;

  const seen = new Set();
  const targets = [];
  for (const t of CONC_TARGETS.get(ch.uid) || []) {
    if (t && !seen.has(t.uid)) { seen.add(t.uid); targets.push(t); }
  }
  CONC_TARGETS.delete(ch.uid);
  if (unitResolver) {
    for (const uid of conc.targets || []) {
      if (seen.has(uid)) continue;
      const t = unitResolver(uid);
      if (t) { seen.add(uid); targets.push(t); }
    }
  }
  if (!seen.has(ch.uid)) targets.push(ch);   // self-buffs like Bless cast on yourself

  const removed = [];
  for (const t of targets) removeSpellEffects(t, ch.uid, conc.spellId, removed);

  bus.emit(EV.CONCENTRATION_BREAK, { ch, uid: ch.uid, spellId: conc.spellId, why, removed });
  return true;
}

/** DC 10, or half the damage taken — whichever is higher (2024 PHB). */
export function concentrationDC(damage) {
  return Math.max(10, Math.floor(Math.max(0, damage || 0) / 2));
}

/** Constitution saving throw modifier, computed locally to avoid a rules/ import cycle. */
function conSaveMod(ch) {
  let m = abilityModOf(ch, 'con');
  if ((ch?.saveProfs || []).includes('con')) m += profOf(ch);
  for (const mech of mechFlags(ch)) {
    if (typeof mech.saveBonus === 'number') m += mech.saveBonus;
    if (typeof mech.saveBonusCon === 'number') m += mech.saveBonusCon;
    if (typeof mech.conSaveBonus === 'number') m += mech.conSaveBonus;
    // Resilient (Con) and similar grants.
    if (Array.isArray(mech.saveProf) && mech.saveProf.includes('con') && !(ch?.saveProfs || []).includes('con')) m += profOf(ch);
  }
  return m;
}

/** War Caster (and anything else flagged concentrationAdv) gives advantage. */
function hasWarCaster(ch) {
  if ((ch?.featIds || []).includes('war-caster')) return true;
  for (const mech of mechFlags(ch)) {
    if (mech.concentrationAdv) return true;
    if (mech.passive === 'war-caster') return true;
    if (Array.isArray(mech.advSaveVs) && mech.advSaveVs.includes('concentration')) return true;
  }
  return false;
}

/**
 * Roll to maintain concentration after taking damage.
 * Advantage from War Caster is applied automatically. Dropping to 0 hit points
 * ends concentration outright — no save.
 */
export function concentrationCheck(ch, damage, opts = {}) {
  if (!isConcentrating(ch)) return { ok: true, skipped: true, success: true };
  const dc = concentrationDC(damage);

  if ((ch.hp || 0) <= 0) {
    breakConcentration(ch, 'dropped to 0 hit points');
    return { ok: false, success: false, dc, auto: true, broke: true, roll: null };
  }

  const adv = !!opts.adv || hasWarCaster(ch);
  const res = d20(conSaveMod(ch), {
    adv, dis: !!opts.dis && !adv, bonusDice: opts.bonusDice,
  }, opts.rng || rng);
  const success = res.total >= dc;

  bus.emit(EV.SAVE, { ch, ability: 'con', dc, roll: res, success, reason: 'concentration' });
  if (!success) breakConcentration(ch, `failed a DC ${dc} Constitution save`);
  return { ok: success, success, dc, roll: res, broke: !success, adv };
}
