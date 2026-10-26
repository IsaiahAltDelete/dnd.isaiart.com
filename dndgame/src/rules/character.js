// rules/character.js — the Character model and the single derivation pass that
// every other module reads a creature through. This is the spine of the rules layer:
// creation, recalculation, attack maths, damage/healing, rests and equipment.
//
// Design contract:
//   * `recalc(ch)` is the ONLY place derived fields are written. Call it after ANY
//     change to a character (equipment, level, effects, ability scores).
//   * Everything a trait/feat/feature/item wants to say about a character is said in
//     a `mech` block; `mechOf(ch)` merges them all and `recalc` reads only the merge.
//   * Conditions (ch.conditions) are deliberately NOT merged here — rules/conditions.js
//     owns them so their effects are never applied twice.
//   * Headless: no canvas, no DOM. All randomness flows through core/dice.js + core/rng.js.

import {
  MAX_ABILITY, MAX_ABILITY_EPIC, PHYSICAL_TYPES, SIZES, clamp,
} from '../constants.js';
import { rng, makeRNG } from '../core/rng.js';
import { CHEATS } from '../core/cheatflags.js';
import { roll } from '../core/dice.js';
import { bus, EV } from '../core/events.js';
import { ABILITIES, SKILLS, CLASS_PRIORITY, mod as abMod } from './abilities.js';

import { SPECIES } from '../data/species.js';
import { CLASSES } from '../data/classes.js';
import { SUBCLASSES } from '../data/subclasses.js';
import { BACKGROUNDS, FEATS, FIGHTING_STYLES } from '../data/backgrounds.js';
import { ITEMS, WEAPON_MASTERY, AMMO_TYPES, resolveItem as resolveItemDef } from '../data/items.js';
import { recomputeSpells, restoreSlots } from './spellcasting.js';

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

/** Attunement slots a creature has (2024 DMG: three). */
export const ATTUNEMENT_MAX = 3;

/**
 * Every equipment slot this module understands. The canonical Character shape lists
 * both `offHand` and `shield`; shields live in `shield`, other off-hand gear (a second
 * light weapon, a torch, an arcane focus) lives in `offHand`. They are mutually
 * exclusive — you only have the one hand.
 */
export const SLOT_LIST = Object.freeze([
  'mainHand', 'offHand', 'shield', 'armor', 'helm', 'cloak',
  'boots', 'gloves', 'amulet', 'ring1', 'ring2', 'ammo',
]);

/** Conditions that a long rest does NOT clear (they need their own cure). */
const LONG_REST_PERSISTENT = ['petrified', 'cursed', 'diseased', 'lycanthropy', 'dead'];

/** Weapon masteries whose off-hand attack rides the Attack action (2024 Nick). */
const NICK = 'nick';

// A private, deterministic id stream. Salted with the wall clock so two campaigns
// merged into one save can never collide, but never Math.random().
const idRng = makeRNG(`scc-uid:${Date.now()}`);
let idCounter = 0;

/** Unique id for a character or an item instance. */
export function uid(prefix = 'ch') {
  idCounter += 1;
  return `${prefix}_${idCounter.toString(36)}${idRng.int(0, 0xffffff).toString(36)}`;
}

const isArr = (v) => Array.isArray(v);
const arr = (v) => (isArr(v) ? v : v == null ? [] : [v]);
const lower = (v) => String(v == null ? '' : v).toLowerCase();

function pushUnique(list, v) {
  if (v == null || v === '') return list;
  if (!list.includes(v)) list.push(v);
  return list;
}

function pushAll(list, vals) {
  for (const v of arr(vals)) pushUnique(list, v);
  return list;
}

/** Deep structural clone through JSON — every Character field is JSON-safe by design. */
function deepClone(o) {
  if (o == null) return o;
  return JSON.parse(JSON.stringify(o));
}

/** Number of sides in a hit-die token: 'd10' | 10 | '1d10' -> 10. */
function dieSides(d) {
  if (typeof d === 'number') return d;
  const m = String(d || '').match(/(\d+)\s*$/);
  return m ? parseInt(m[1], 10) : 8;
}

/** '2d6' -> 6, used to compare unarmed strike dice. */
function dieValue(expr) {
  const m = String(expr || '').match(/^(\d*)d(\d+)/);
  if (!m) return 0;
  const n = m[1] === '' ? 1 : parseInt(m[1], 10);
  return n * parseInt(m[2], 10);
}

// ---------------------------------------------------------------------------
// Colourway (headless — render/sprites.js consumes this, we never import it)
// ---------------------------------------------------------------------------

/** Lighten (amt > 0) or darken (amt < 0) a #rrggbb by a fraction. */
export function shadeHex(hex, amt) {
  const h = String(hex || '#888888').replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const v = parseInt(n, 16);
  if (Number.isNaN(v)) return '#888888';
  const ch = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((c) => {
    const t = amt < 0 ? c * (1 + amt) : c + (255 - c) * amt;
    return clamp(Math.round(t), 0, 255);
  });
  return `#${ch.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

const COLORWAY_DEFAULTS = {
  SKIN: '#e0ac74', HAIR: '#4a2f1c', EYE: '#3a6ea5',
  MAIN: '#7b4a9e', ALT: '#4a6fa5', METAL: '#b9c0c9',
  TRIM: '#d8b45a', LEATHER: '#8a5a34', CLOTH: '#c8bda0', ACCENT: '#d05a4a',
};

/**
 * Turn an `appearance` block into the sprite palette tokens render/sprites.js expects,
 * deriving the _D (dark) and _L (light) shades so every character is recolourable.
 */
export function deriveColorway(appearance = {}) {
  const cw = {
    SKIN: appearance.skin || COLORWAY_DEFAULTS.SKIN,
    HAIR: appearance.hair || COLORWAY_DEFAULTS.HAIR,
    EYE: appearance.eye || COLORWAY_DEFAULTS.EYE,
    MAIN: appearance.outfit || COLORWAY_DEFAULTS.MAIN,
    ALT: appearance.outfitAlt || COLORWAY_DEFAULTS.ALT,
    METAL: appearance.metal || COLORWAY_DEFAULTS.METAL,
    TRIM: appearance.trim || COLORWAY_DEFAULTS.TRIM,
    LEATHER: appearance.leather || COLORWAY_DEFAULTS.LEATHER,
    CLOTH: appearance.cloth || COLORWAY_DEFAULTS.CLOTH,
    ACCENT: appearance.accent || COLORWAY_DEFAULTS.ACCENT,
  };
  cw.SKIN_D = shadeHex(cw.SKIN, -0.28);
  cw.SKIN_L = shadeHex(cw.SKIN, 0.22);
  cw.HAIR_D = shadeHex(cw.HAIR, -0.32);
  cw.MAIN_D = shadeHex(cw.MAIN, -0.3);
  cw.ALT_D = shadeHex(cw.ALT, -0.3);
  cw.METAL_D = shadeHex(cw.METAL, -0.32);
  cw.LEATHER_D = shadeHex(cw.LEATHER, -0.3);
  cw.CLOTH_D = shadeHex(cw.CLOTH, -0.28);
  return cw;
}

// ---------------------------------------------------------------------------
// Option registry — invocations / metamagic / maneuvers
// ---------------------------------------------------------------------------

/**
 * Class option definitions (Eldritch Invocations, Metamagic, Battle Master Maneuvers…)
 * do not have a guaranteed home in the data layer, so any module that owns them can
 * register them here and their `mech` blocks join the merge automatically.
 */
export const OPTION_REGISTRY = {};

/** Register `{ id: {id,name,desc,mech} }` option definitions. */
export function registerOptions(map) {
  for (const k of Object.keys(map || {})) OPTION_REGISTRY[k] = map[k];
  return OPTION_REGISTRY;
}

/** Resolve a chosen option id to something with a `mech` block, or null. */
function resolveOption(id) {
  if (!id) return null;
  return OPTION_REGISTRY[id] || FEATS?.[id] || FIGHTING_STYLES?.[id] || null;
}

// ---------------------------------------------------------------------------
// Item helpers
// ---------------------------------------------------------------------------

/** Item definition for an id, an instance, or a definition. Never throws. */
export function itemDef(x) {
  if (!x) return null;
  if (typeof x === 'string') {
    // resolveItem also understands generated variants like 'longsword-plus1'.
    try {
      if (typeof resolveItemDef === 'function') return resolveItemDef(x) || ITEMS[x] || null;
    } catch { /* data catalogue not ready */ }
    return ITEMS?.[x] || null;
  }
  if (x.kind && (x.name || x.die || x.ac != null)) return x;   // already a definition
  return itemDef(x.id);
}

/**
 * Create a per-instance copy of an item: a uid plus optional overrides
 * (charges left, an enchantment bonus, an attunement flag, a custom name).
 */
export function makeItemInstance(itemId, opts = {}) {
  const id = typeof itemId === 'string' ? itemId : itemId?.id;
  const def = itemDef(id);
  const inst = { uid: uid('it'), id, qty: 1, ...opts };
  // Seed charges from the definition so wands work out of the box.
  if (inst.charges == null && def && def.charges != null) inst.charges = def.charges;
  return inst;
}

/** The default slot for an item, honouring the item's own `slot` field. */
export function defaultSlotFor(x, ch = null) {
  const def = itemDef(x);
  if (!def) return null;
  if (def.slot) {
    if (def.slot === 'ring') {
      if (ch && ch.equipment && ch.equipment.ring1 && !ch.equipment.ring2) return 'ring2';
      return 'ring1';
    }
    return SLOT_LIST.includes(def.slot) ? def.slot : null;
  }
  switch (def.kind) {
    case 'weapon': return 'mainHand';
    case 'shield': return 'shield';
    case 'armor': return 'armor';
    case 'ammo': return 'ammo';
    case 'ring': return ch && ch.equipment && ch.equipment.ring1 && !ch.equipment.ring2 ? 'ring2' : 'ring1';
    case 'amulet': return 'amulet';
    case 'cloak': return 'cloak';
    case 'boots': return 'boots';
    case 'gloves': return 'gloves';
    case 'helm': return 'helm';
    // A wand, rod or arcane focus is held in the free hand.
    case 'wand': case 'rod': case 'focus': return 'offHand';
    default: return null;
  }
}

function needsAttunement(def) {
  return !!(def && (def.attunement || def.requiresAttunement || def.mech?.attunement));
}

/** How many attuned items a character is currently carrying. */
export function attunedCount(ch) {
  let n = 0;
  for (const slot of SLOT_LIST) {
    const inst = ch?.equipment?.[slot];
    if (inst && inst.attuned) n += 1;
  }
  return n;
}

/** The equipped instance in a slot (null if empty). */
export function equipped(ch, slot) { return ch?.equipment?.[slot] || null; }

/** The equipped item DEFINITION in a slot. */
export function equippedDef(ch, slot) { return itemDef(equipped(ch, slot)); }

/** The worn body armour definition, or null if unarmoured. */
export function armorOf(ch) {
  const d = equippedDef(ch, 'armor');
  return d && d.kind === 'armor' ? d : null;
}

/**
 * The wielded shield. Checks both the canonical `shield` slot and `offHand`, because
 * some UIs route shields through the off hand.
 */
export function shieldOf(ch) {
  const s = equippedDef(ch, 'shield');
  if (s && s.kind === 'shield') return s;
  const o = equippedDef(ch, 'offHand');
  return o && o.kind === 'shield' ? o : null;
}

/** The per-instance enchantment bonus, if the instance overrides the definition. */
function instPlus(inst) {
  if (!inst) return 0;
  const v = inst.enchant ?? inst.plus ?? inst.enchantment;
  return typeof v === 'number' ? v : 0;
}

// ---------------------------------------------------------------------------
// mech merging
// ---------------------------------------------------------------------------

function emptyAsi() {
  const o = {};
  for (const ab of ABILITIES) o[ab] = 0;
  return o;
}

function emptyMech() {
  return {
    asi: emptyAsi(),
    setAbility: {},
    speedBonus: 0, speedPenalty: 0,
    speeds: { fly: 0, swim: 0, climb: 0, burrow: 0 },
    darkvision: 0, blindsight: 0, truesight: 0, tremorsense: 0,
    hpPerLevel: 0, maxHpBonus: 0,
    acBonus: 0, saveBonus: 0, initiativeBonus: 0,
    spellDcBonus: 0, spellAtkBonus: 0,
    atkBonus: 0, meleeAtkBonus: 0, rangedAtkBonus: 0,
    dmgBonus: 0, meleeDmgBonus: 0, rangedDmgBonus: 0,
    extraAttack: 0, critRange: 20, carryMult: 1, jumpMult: 1,
    profToInitiative: false, jackOfAllTrades: false, martialArts: false,
    resist: [], immune: [], vuln: [], condImmune: [],
    advSaveVs: [], advVs: [], advSkill: [],
    skillProf: [], skillExpertise: [], toolProf: [], weaponProf: [], armorProf: [],
    saveProf: [], languageProf: [],
    skillBonus: {}, saveBonusBy: {},
    acFormulas: [], naturalWeapons: [], cantrips: [], spellsPerRest: [],
    resources: [], grantFeats: [], breathWeapons: [], bonusDamage: [],
    unarmedDie: null,
    passives: [],
    sources: [],
  };
}

/** Fold one `mech` block into the accumulator. Unknown keys are ignored, never thrown at. */
function mergeMech(acc, m, source = '') {
  if (!m || typeof m !== 'object') return acc;
  acc.sources.push(source);

  // --- ability score increases (summed) ---
  if (m.asi && typeof m.asi === 'object') {
    for (const ab of ABILITIES) acc.asi[ab] += Number(m.asi[ab]) || 0;
  }
  if (m.setAbility && typeof m.setAbility === 'object') {
    // Gauntlets of Ogre Power style: SET the score, highest setter wins, ignores the cap.
    for (const ab of ABILITIES) {
      const v = Number(m.setAbility[ab]) || 0;
      if (v > (acc.setAbility[ab] || 0)) acc.setAbility[ab] = v;
    }
  }

  // --- additive numbers ---
  const add = [
    'speedBonus', 'speedPenalty', 'hpPerLevel', 'maxHpBonus', 'acBonus', 'saveBonus',
    'initiativeBonus', 'spellDcBonus', 'spellAtkBonus', 'atkBonus', 'meleeAtkBonus',
    'rangedAtkBonus', 'dmgBonus', 'meleeDmgBonus', 'rangedDmgBonus',
  ];
  for (const k of add) if (typeof m[k] === 'number') acc[k] += m[k];

  // --- "best wins" numbers ---
  if (typeof m.darkvision === 'number') acc.darkvision = Math.max(acc.darkvision, m.darkvision);
  if (typeof m.blindsight === 'number') acc.blindsight = Math.max(acc.blindsight, m.blindsight);
  if (typeof m.truesight === 'number') acc.truesight = Math.max(acc.truesight, m.truesight);
  if (typeof m.tremorsense === 'number') acc.tremorsense = Math.max(acc.tremorsense, m.tremorsense);
  if (typeof m.extraAttack === 'number') acc.extraAttack = Math.max(acc.extraAttack, m.extraAttack);
  if (typeof m.carryMult === 'number') acc.carryMult = Math.max(acc.carryMult, m.carryMult);
  if (typeof m.jumpMult === 'number') acc.jumpMult = Math.max(acc.jumpMult, m.jumpMult);
  // A lower crit range is better: Champion 19, Improved Critical 18.
  if (typeof m.critRange === 'number') acc.critRange = Math.min(acc.critRange, m.critRange);
  // Biggest unarmed die wins (Monk d6/d8 vs Tavern Brawler d4).
  if (m.unarmedDie && dieValue(m.unarmedDie) > dieValue(acc.unarmedDie)) acc.unarmedDie = m.unarmedDie;

  for (const k of ['fly', 'swim', 'climb', 'burrow']) {
    const v = m[`${k}Speed`] ?? m.speeds?.[k];
    if (typeof v === 'number') acc.speeds[k] = Math.max(acc.speeds[k], v);
  }

  // --- booleans ---
  for (const k of ['profToInitiative', 'jackOfAllTrades', 'martialArts']) {
    if (m[k]) acc[k] = true;
  }

  // --- string lists (deduped unions) ---
  const lists = [
    'resist', 'immune', 'vuln', 'condImmune', 'advSaveVs', 'advVs', 'advSkill',
    'skillProf', 'skillExpertise', 'toolProf', 'weaponProf', 'armorProf', 'saveProf',
    'languageProf',
  ];
  for (const k of lists) if (m[k]) pushAll(acc[k], arr(m[k]).map(lower));

  // --- per-key numeric maps ---
  if (m.skillBonus) for (const k of Object.keys(m.skillBonus)) acc.skillBonus[k] = (acc.skillBonus[k] || 0) + (Number(m.skillBonus[k]) || 0);
  if (m.saveBonusBy) for (const k of Object.keys(m.saveBonusBy)) acc.saveBonusBy[k] = (acc.saveBonusBy[k] || 0) + (Number(m.saveBonusBy[k]) || 0);

  // --- collected structures ---
  if (m.acFormula) acc.acFormulas.push({ source, ...m.acFormula });
  if (m.naturalWeapon) acc.naturalWeapons.push({ source, ...m.naturalWeapon });
  if (m.cantrip) for (const c of arr(m.cantrip)) acc.cantrips.push({ source, ...c });
  if (m.spellPerRest) for (const s of arr(m.spellPerRest)) acc.spellsPerRest.push({ source, ...s });
  if (m.resource) for (const r of arr(m.resource)) acc.resources.push({ source, ...r });
  if (m.breathWeapon) acc.breathWeapons.push({ source, ...m.breathWeapon });
  if (m.bonusDamage) for (const b of arr(m.bonusDamage)) acc.bonusDamage.push({ source, ...b });
  if (m.grantFeat) pushAll(acc.grantFeats, arr(m.grantFeat));
  if (m.passive) pushAll(acc.passives, arr(m.passive).map(String));

  return acc;
}

/**
 * A synthetic mech block for a species entry's top-level fields, so `recalc` only ever
 * has to read the merge.
 */
function speciesMech(sp) {
  if (!sp) return null;
  return {
    darkvision: sp.darkvision || 0,
    resist: sp.resist || [],
    immune: sp.immune || [],
    vuln: sp.vuln || [],
    condImmune: sp.condImmune || [],
    skillProf: sp.skillGrants || [],
    toolProf: sp.toolGrants || [],
    weaponProf: sp.weaponProf || [],
    armorProf: sp.armorProf || [],
  };
}

/** A synthetic mech block for a class's granted proficiencies. */
function classMech(cd, isFirstClass) {
  if (!cd) return null;
  return {
    armorProf: cd.armorProf || [],
    weaponProf: cd.weaponProf || [],
    toolProf: cd.toolProf || [],
    // 2024 multiclassing: only your FIRST class grants saving throw proficiencies.
    saveProf: isFirstClass ? (cd.saves || []) : [],
  };
}

// ---------------------------------------------------------------------------
// Features
// ---------------------------------------------------------------------------

function featureFrom(obj, source, level) {
  if (!obj) return null;
  return {
    id: obj.id || `${source}-feature`,
    name: obj.name || obj.id || source,
    desc: obj.desc || '',
    mech: obj.mech || null,
    uses: obj.uses || null,
    choice: obj.choice || null,
    source,
    level: level ?? obj.level ?? 1,
  };
}

/** Total level of a single class in the character's class list. */
export function classLevel(ch, classId) {
  for (const c of ch?.classes || []) if (c.id === classId) return c.level || 0;
  return 0;
}

/**
 * Every feature the character currently has, level-filtered:
 * species traits, lineage traits, background origin feat, class features, subclass
 * features, feats, fighting styles and registered class options.
 */
export function allFeatures(ch) {
  const out = [];
  if (!ch) return out;
  const total = ch.level || 1;

  // --- species + lineage -------------------------------------------------
  const sp = SPECIES?.[ch.speciesId];
  if (sp) {
    for (const t of sp.traits || []) {
      if ((t.level || 1) <= total) out.push(featureFrom(t, `species:${sp.id}`, t.level || 1));
    }
    const lin = (sp.lineages || []).find((l) => l.id === ch.lineageId);
    if (lin) {
      for (const t of lin.traits || []) {
        if ((t.level || 1) <= total) out.push(featureFrom(t, `lineage:${lin.id}`, t.level || 1));
      }
      // Some lineages carry their own top-level grants.
      const lm = speciesMech(lin);
      if (lm) out.push(featureFrom({ id: `${lin.id}-traits`, name: lin.name, mech: lm }, `lineage:${lin.id}`, 1));
    }
  }

  // --- background --------------------------------------------------------
  const bg = BACKGROUNDS?.[ch.backgroundId];
  if (bg) {
    const bgMech = {
      skillProf: bg.skills || [],
      toolProf: bg.tools || [],
      // 2024 PHB: the BACKGROUND grants the ability score increase, not the species.
      asi: ch.choices?.backgroundAsi || null,
    };
    out.push(featureFrom({ id: bg.id, name: bg.name, desc: bg.desc, mech: bgMech }, `background:${bg.id}`, 1));
  }

  // --- classes + subclasses ---------------------------------------------
  (ch.classes || []).forEach((cl, idx) => {
    const cd = CLASSES?.[cl.id];
    if (!cd) return;
    out.push(featureFrom(
      { id: `${cl.id}-proficiencies`, name: cd.name, mech: classMech(cd, idx === 0) },
      `class:${cl.id}`, 1,
    ));
    const feats = cd.features || {};
    for (let lv = 1; lv <= (cl.level || 0); lv++) {
      for (const f of arr(feats[lv])) out.push(featureFrom(f, `class:${cl.id}`, lv));
    }
    const sub = SUBCLASSES?.[cl.subclassId];
    if (sub) {
      const sfeats = sub.features || {};
      for (let lv = 1; lv <= (cl.level || 0); lv++) {
        for (const f of arr(sfeats[lv])) out.push(featureFrom(f, `subclass:${sub.id}`, lv));
      }
    }
  });

  // --- feats -------------------------------------------------------------
  for (const fid of ch.featIds || []) {
    const ft = FEATS?.[fid];
    if (ft) out.push(featureFrom(ft, `feat:${fid}`, 1));
  }

  // --- fighting styles + registered class options ------------------------
  const ck = ch.choices || {};
  for (const sid of arr(ck.fightingStyle)) {
    const fs = FIGHTING_STYLES?.[sid] || resolveOption(sid);
    if (fs) out.push(featureFrom(fs, `style:${sid}`, 1));
  }
  for (const key of ['invocations', 'metamagic', 'maneuvers', 'options']) {
    for (const oid of arr(ck[key])) {
      const o = resolveOption(oid);
      if (o) out.push(featureFrom(o, `${key}:${oid}`, 1));
    }
  }

  // Escape hatch: anything another module wants to bolt on wholesale.
  for (const f of arr(ch.extraFeatures)) out.push(featureFrom(f, f.source || 'extra', f.level || 1));

  return out.filter(Boolean);
}

/**
 * Merge every mech block that applies to this character: features (above), active
 * effects, and the mech blocks of equipped items.
 *
 * Cached on `ch._mech` by `recalc`; pass `force` to rebuild.
 */
export function mechOf(ch, force = false) {
  if (!force && ch && ch._mech) return ch._mech;
  const acc = emptyMech();
  if (!ch) return acc;

  const sp = SPECIES?.[ch.speciesId];
  mergeMech(acc, speciesMech(sp), `species:${ch.speciesId}`);

  for (const f of allFeatures(ch)) mergeMech(acc, f.mech, f.source);

  // Active effects (spell buffs, potions, auras). Conditions are NOT here — see header.
  for (const e of ch.effects || []) mergeMech(acc, e.mech, `effect:${e.id || e.name}`);

  // Equipped gear. Weapon/armour numbers are read directly by the attack and AC maths;
  // only their `mech` blocks (Ring of Protection, Boots of Speed…) join the merge.
  for (const slot of SLOT_LIST) {
    const inst = ch.equipment?.[slot];
    if (!inst) continue;
    const def = itemDef(inst);
    if (!def) continue;
    if (needsAttunement(def) && !inst.attuned) continue;   // unattuned items grant nothing
    mergeMech(acc, def.mech, `item:${def.id}`);
    mergeMech(acc, inst.mech, `item:${def.id}:inst`);
  }

  acc.passive = acc.passives;   // alias so `mech.passive.includes(tag)` also works
  if (ch) ch._mech = acc;
  return acc;
}

/** Does the character carry a freeform `passive` tag from any source? */
export function hasPassive(ch, tag) { return mechOf(ch).passives.includes(tag); }

export function hasFeat(ch, featId) { return (ch?.featIds || []).includes(featId); }

export function hasFightingStyle(ch, styleId) {
  return arr(ch?.choices?.fightingStyle).includes(styleId);
}

// ---------------------------------------------------------------------------
// Character construction
// ---------------------------------------------------------------------------

/** A blank Character with every canonical field present. */
function blankCharacter() {
  return {
    uid: uid('ch'), kind: 'pc', name: 'Adventurer', title: '',
    speciesId: null, lineageId: null, backgroundId: null,
    classes: [], level: 1, xp: 0,
    base: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    asi: emptyAsi(),
    // Permanent increases NOT expressed by a mech block (level-up ASIs, epic boons).
    // `recalc` rebuilds ch.asi = asiManual + merged mech asi.
    asiManual: emptyAsi(),
    hp: 1, maxHp: 1, tempHp: 0,
    hitDice: {}, deathSaves: { success: 0, fail: 0, stable: false },
    ac: 10, speed: 30, size: 'medium', prof: 2, initiative: 0,
    skills: {}, saveProfs: [],
    profs: { armor: [], weapon: [], tool: [], language: ['common'] },
    resist: [], immune: [], vuln: [], condImmune: [], senses: { darkvision: 0 },
    conditions: [], effects: [], concentration: null,
    equipment: {
      mainHand: null, offHand: null, shield: null, armor: null, helm: null,
      cloak: null, boots: null, gloves: null, amulet: null, ring1: null,
      ring2: null, ammo: null,
    },
    inventory: [], gold: 0,
    spells: {
      known: [], prepared: [], cantrips: [], slots: {},
      pact: null, ability: null, dc: 8, atk: 0,
    },
    resources: {},
    featIds: [],
    choices: {
      fightingStyle: [], maneuvers: [], invocations: [], metamagic: [],
      masteries: [], expertise: [], skills: [], tools: [], languages: [],
      backgroundAsi: null, spells: [], cantrips: [],
    },
    appearance: {
      body: 'n', skin: null, hair: null, hairStyle: 0, eye: null,
      outfit: null, outfitAlt: null, accent: null, height: 1, build: 'medium',
      beard: false, ears: 'round', horns: false, tail: false, marking: 0,
    },
    colorway: {},
    sprite: 'hero',
    ai: null, monsterId: null, cr: null, xpValue: 0, loot: null,
    flags: {}, notes: '',
  };
}

/** Ensure every canonical field exists on a (possibly old or partial) character object. */
function normalize(ch) {
  const blank = blankCharacter();
  for (const k of Object.keys(blank)) {
    if (ch[k] === undefined || ch[k] === null) {
      if (blank[k] !== null && typeof blank[k] === 'object') ch[k] = deepClone(blank[k]);
      else ch[k] = blank[k];
    }
  }
  for (const ab of ABILITIES) {
    if (typeof ch.base[ab] !== 'number') ch.base[ab] = 10;
    if (typeof ch.asi[ab] !== 'number') ch.asi[ab] = 0;
    if (typeof ch.asiManual[ab] !== 'number') ch.asiManual[ab] = 0;
  }
  for (const k of Object.keys(blank.choices)) {
    if (ch.choices[k] === undefined) ch.choices[k] = deepClone(blank.choices[k]);
  }
  for (const k of Object.keys(blank.equipment)) {
    if (ch.equipment[k] === undefined) ch.equipment[k] = null;
  }
  for (const k of Object.keys(blank.profs)) {
    if (!isArr(ch.profs[k])) ch.profs[k] = [];
  }
  for (const k of ['known', 'prepared', 'cantrips']) {
    if (!isArr(ch.spells[k])) ch.spells[k] = [];
  }
  if (!ch.spells.slots || typeof ch.spells.slots !== 'object') ch.spells.slots = {};
  if (!ch.deathSaves) ch.deathSaves = { success: 0, fail: 0, stable: false };
  return ch;
}

/**
 * Resolve the 2024 background ability increase. A background lists three abilities;
 * you either take +2/+1 among them or +1/+1/+1. `pick` may be an explicit map,
 * the string 'spread' for +1/+1/+1, or omitted (we pick using the class's priority).
 */
function resolveBackgroundAsi(bg, pick, classId) {
  const list = arr(bg?.asi).filter((a) => ABILITIES.includes(a));
  if (!list.length) return null;

  if (pick && typeof pick === 'object') {
    const out = {};
    let total = 0;
    for (const ab of list) {
      const v = clamp(Number(pick[ab]) || 0, 0, 2);
      if (v > 0 && total + v <= 3) { out[ab] = v; total += v; }
    }
    return total > 0 ? out : null;
  }
  if (pick === 'spread') {
    const out = {};
    for (const ab of list.slice(0, 3)) out[ab] = 1;
    return out;
  }
  // Default: +2 to the ability the class cares about most, +1 to the runner-up.
  const priority = CLASS_PRIORITY[classId] || ABILITIES;
  const ordered = list.slice().sort((a, b) => priority.indexOf(a) - priority.indexOf(b));
  const out = {};
  if (ordered[0]) out[ordered[0]] = 2;
  if (ordered[1]) out[ordered[1]] = 1;
  return out;
}

/**
 * Build a Character.
 * opts: { name, speciesId, lineageId, backgroundId, classId, subclassId, level=1,
 *         abilities:{}, skills:[], appearance:{}, kind:'pc',
 *         equipment:{}, inventory:[], choices:{},
 *         kitId, gold, featIds:[], xp, uid, sprite, autoEquip=true, autoAsi=true }
 */
export function createCharacter(opts = {}) {
  const ch = blankCharacter();

  ch.uid = opts.uid || ch.uid;
  ch.kind = opts.kind || 'pc';
  ch.name = opts.name || ch.name;
  ch.title = opts.title || '';
  ch.speciesId = opts.speciesId || null;
  ch.lineageId = opts.lineageId || null;
  ch.backgroundId = opts.backgroundId || null;
  ch.notes = opts.notes || '';
  if (opts.sprite) ch.sprite = opts.sprite;
  if (opts.ai) ch.ai = opts.ai;
  if (opts.monsterId) ch.monsterId = opts.monsterId;

  const level = clamp(Math.floor(opts.level || 1), 1, 20);

  // --- base ability scores (pre-background) -------------------------------
  for (const ab of ABILITIES) {
    const v = Number(opts.abilities?.[ab]);
    ch.base[ab] = Number.isFinite(v) ? v : 10;
  }

  // --- choices ------------------------------------------------------------
  const c = opts.choices || {};
  for (const k of Object.keys(ch.choices)) {
    if (c[k] !== undefined) ch.choices[k] = deepClone(c[k]);
  }
  ch.featIds = arr(opts.featIds).slice();

  // --- class + subclass ---------------------------------------------------
  const cd = CLASSES?.[opts.classId];
  if (opts.classId) {
    const subLevel = cd?.subclassLevel ?? 3;
    ch.classes = [{
      id: opts.classId,
      level,
      subclassId: level >= subLevel ? (opts.subclassId || null) : null,
    }];
  }
  ch.level = level;
  ch.xp = Number(opts.xp) || 0;

  // --- background: ability increase + origin feat (2024 PHB) --------------
  const bg = BACKGROUNDS?.[ch.backgroundId];
  if (bg) {
    ch.choices.backgroundAsi = resolveBackgroundAsi(bg, ch.choices.backgroundAsi ?? c.backgroundAsi, opts.classId);
    if (bg.originFeat) pushUnique(ch.featIds, bg.originFeat);
  }

  // --- skill proficiency picks -------------------------------------------
  const wanted = arr(opts.skills).filter((s) => SKILLS[s]);
  const from = arr(cd?.skillChoices?.from).filter((s) => SKILLS[s]);
  const count = cd?.skillChoices?.count ?? wanted.length;
  let picks = wanted.filter((s) => !from.length || from.includes(s)).slice(0, count);
  if (picks.length < count && from.length) {
    // Auto-fill from the class list following the class's ability priority.
    const priority = CLASS_PRIORITY[opts.classId] || ABILITIES;
    const pool = from
      .filter((s) => !picks.includes(s))
      .sort((a, b) => priority.indexOf(SKILLS[a].ability) - priority.indexOf(SKILLS[b].ability));
    picks = picks.concat(pool.slice(0, count - picks.length));
  }
  pushAll(ch.choices.skills, picks);
  pushAll(ch.choices.skills, arr(c.skills));

  // --- levels past 1: default ASIs so recruits and NPCs are not underpowered.
  // progression.js owns real level-ups; this is only a sane fallback.
  if (level > 1 && opts.autoAsi !== false && !opts.choices?.asiPicks) {
    autoApplyAsi(ch, opts.classId, level);
  }

  // --- appearance / colourway --------------------------------------------
  const sp = SPECIES?.[ch.speciesId];
  Object.assign(ch.appearance, opts.appearance || {});
  if (sp) {
    ch.size = sp.size || 'medium';
    const pal = sp.colorways || {};
    const r = opts.rng || rng;
    if (!ch.appearance.skin) ch.appearance.skin = r.pick(arr(pal.skin)) || COLORWAY_DEFAULTS.SKIN;
    if (!ch.appearance.hair) ch.appearance.hair = r.pick(arr(pal.hair)) || COLORWAY_DEFAULTS.HAIR;
    if (!ch.appearance.eye) ch.appearance.eye = r.pick(arr(pal.eye)) || COLORWAY_DEFAULTS.EYE;
    const sm = sp.spriteMods || {};
    if (sm.ears) ch.appearance.ears = sm.ears;
    if (sm.horns != null) ch.appearance.horns = !!sm.horns;
    if (sm.tail != null) ch.appearance.tail = !!sm.tail;
    if (sm.beard != null && ch.appearance.beard === false) ch.appearance.beard = !!sm.beard;
    if (sm.height) ch.appearance.height = sm.height;
    if (sm.build) ch.appearance.build = sm.build;
  }
  ch.colorway = deriveColorway(ch.appearance);

  // --- starting equipment -------------------------------------------------
  ch.gold = Number(opts.gold) || 0;
  for (const entry of arr(opts.inventory)) {
    if (typeof entry === 'string') addItem(ch, entry, 1);
    else if (entry && entry.id) addItem(ch, entry.id, entry.qty || 1);
  }
  if (opts.inventory === undefined || opts.useKit) {
    const kits = arr(cd?.startingKits);
    const kit = kits.find((k) => k.id === opts.kitId) || kits[0];
    if (kit) {
      for (const [id, qty] of arr(kit.items)) addItem(ch, id, qty || 1);
      ch.gold += Number(kit.gold) || 0;
    }
    if (bg) {
      for (const [id, qty] of arr(bg.equipment)) addItem(ch, id, qty || 1);
      ch.gold += Number(bg.gold) || 0;
    }
  }

  // --- explicit equipment overrides --------------------------------------
  for (const slot of SLOT_LIST) {
    const e = opts.equipment?.[slot];
    if (!e) continue;
    ch.equipment[slot] = typeof e === 'string' ? makeItemInstance(e) : { uid: e.uid || uid('it'), qty: 1, ...e };
    if (needsAttunement(itemDef(ch.equipment[slot]))) ch.equipment[slot].attuned = true;
  }

  // --- seed spell picks (spellcasting.js does the real work in recalc) ----
  pushAll(ch.spells.cantrips, arr(c.cantrips));
  pushAll(ch.spells.known, arr(c.spells));

  recalc(ch);

  if (opts.autoEquip !== false && !opts.equipment) autoEquip(ch);

  // Start at full health with fresh hit dice.
  ch.hp = ch.maxHp;
  ch.tempHp = 0;
  for (const k of Object.keys(ch.hitDice)) ch.hitDice[k].used = 0;
  ch.deathSaves = { success: 0, fail: 0, stable: false };

  return ch;
}

/**
 * Fallback level-up ability increases at 4/8/12/16/19 (2024 PHB ASI levels).
 * +2 to the class's top ability, spilling to the next when it hits the cap of 20.
 */
function autoApplyAsi(ch, classId, level) {
  const asiLevels = [4, 8, 12, 16, 19].filter((l) => l <= level);
  const priority = (CLASS_PRIORITY[classId] || ABILITIES).slice();
  for (let i = 0; i < asiLevels.length; i++) {
    let points = 2;
    for (const ab of priority) {
      while (points > 0 && ch.base[ab] + ch.asiManual[ab] < MAX_ABILITY) {
        ch.asiManual[ab] += 1;
        points -= 1;
      }
      if (points <= 0) break;
    }
  }
}

/** Equip the best available armour, shield and weapon out of the inventory. */
export function autoEquip(ch) {
  const scoreArmor = (d) => (d.ac || 0) + (d.addDex ? Math.min(abilityMod(ch, 'dex'), d.dexCap ?? 99) : 0);
  const best = { armor: null, shield: null, weapon: null };

  for (const inst of ch.inventory.slice()) {
    const d = itemDef(inst);
    if (!d) continue;
    if (d.kind === 'armor' && hasProf(ch, 'armor', d.category)) {
      if (!best.armor || scoreArmor(d) > scoreArmor(itemDef(best.armor))) best.armor = inst;
    } else if (d.kind === 'shield' && hasProf(ch, 'armor', 'shields')) {
      if (!best.shield) best.shield = inst;
    } else if (d.kind === 'weapon' && hasProf(ch, 'weapon', d)) {
      const cur = itemDef(best.weapon);
      if (!cur || dieValue(d.die) > dieValue(cur.die)) best.weapon = inst;
    }
  }
  if (best.armor) equip(ch, best.armor, 'armor');
  if (best.weapon) equip(ch, best.weapon, 'mainHand');
  // A shield needs a free hand: skip it if the weapon we just equipped is two-handed.
  const mh = equippedDef(ch, 'mainHand');
  if (best.shield && !(mh && arr(mh.props).includes('two-handed'))) equip(ch, best.shield, 'shield');
  return ch;
}

// ---------------------------------------------------------------------------
// recalc — the single derivation pass
// ---------------------------------------------------------------------------

/**
 * Rebuild every derived field on a character. Called after ANY change.
 * Order matters: mech merge -> abilities -> proficiency -> HP -> AC -> speed ->
 * saves -> skills -> resistances -> senses -> initiative -> spells.
 */
export function recalc(ch) {
  if (!ch) return ch;
  normalize(ch);

  // --- 0. carry over anything a caller wrote straight onto a derived field --
  // Any ASI on ch.asi that the previous merge did not account for is a manual bump
  // (a level-up ASI applied by progression.js). This makes recalc idempotent.
  if (ch._mechAsi) {
    for (const ab of ABILITIES) {
      ch.asiManual[ab] = (Number(ch.asi[ab]) || 0) - (Number(ch._mechAsi[ab]) || 0);
    }
  }
  // Same trick for hand-granted skill/tool/language proficiencies.
  if (ch._derived) {
    for (const k of Object.keys(ch.skills || {})) {
      if (!ch._derived.skills[k]) pushUnique(ch.choices.skills, k);
      if (ch.skills[k] === 'expert' && ch._derived.skills[k] !== 'expert') pushUnique(ch.choices.expertise, k);
    }
    for (const t of ch.profs.tool) if (!ch._derived.tool.includes(t)) pushUnique(ch.choices.tools, t);
    for (const l of ch.profs.language) if (!ch._derived.language.includes(l)) pushUnique(ch.choices.languages, l);
  }

  // --- 1. reset derived fields --------------------------------------------
  ch.level = (ch.classes || []).reduce((a, c) => a + (c.level || 0), 0) || ch.level || 1;
  ch.skills = {};
  ch.saveProfs = [];
  ch.profs = { armor: [], weapon: [], tool: [], language: [] };
  ch.resist = [];
  ch.immune = [];
  ch.vuln = [];
  ch.condImmune = [];
  ch.senses = {};
  ch.flags = ch.flags || {};

  // --- 2. merge every mech block ------------------------------------------
  const mech = mechOf(ch, true);

  // --- 3. ability scores, capped at 20 (30 once an Epic Boon is taken) -----
  const epic = ch.featIds.some((f) => FEATS?.[f]?.category === 'epic-boon') || !!mech.abilityCap30;
  ch.abilityCap = epic ? MAX_ABILITY_EPIC : MAX_ABILITY;
  const scores = {};
  for (const ab of ABILITIES) {
    ch.asi[ab] = (Number(ch.asiManual[ab]) || 0) + (Number(mech.asi[ab]) || 0);
    let v = (Number(ch.base[ab]) || 10) + ch.asi[ab];
    v = clamp(v, 1, ch.abilityCap);
    // A "set score" item (Gauntlets of Ogre Power) overrides, and ignores the cap.
    const set = mech.setAbility[ab] || 0;
    if (set > v) v = set;
    scores[ab] = v;
  }
  ch._scores = scores;
  ch._mechAsi = { ...mech.asi };

  const conMod = abMod(scores.con);
  const dexMod = abMod(scores.dex);

  // --- 4. proficiency bonus from TOTAL character level --------------------
  // Monsters carry a prof bonus straight from their stat block.
  if (ch.kind === 'monster' && ch.prof) {
    // keep the stat block's value
  } else {
    ch.prof = 2 + Math.floor((clamp(ch.level, 1, 20) - 1) / 4);
  }
  const pb = ch.prof;

  // --- 5. proficiencies ---------------------------------------------------
  pushAll(ch.profs.armor, mech.armorProf);
  pushAll(ch.profs.weapon, mech.weaponProf);
  pushAll(ch.profs.tool, mech.toolProf);
  pushAll(ch.profs.tool, ch.choices.tools);
  pushUnique(ch.profs.language, 'common');
  pushAll(ch.profs.language, mech.languageProf);
  pushAll(ch.profs.language, ch.choices.languages);

  // --- 6. hit dice + max HP -----------------------------------------------
  const prevUsed = {};
  for (const k of Object.keys(ch.hitDice || {})) prevUsed[k] = ch.hitDice[k].used || 0;
  const pools = {};
  let hpFromDice = 0;
  let levels = 0;
  (ch.classes || []).forEach((cl, idx) => {
    const cd = CLASSES?.[cl.id];
    const sides = dieSides(cd?.hitDie ?? 8);
    const key = `d${sides}`;
    pools[key] = (pools[key] || 0) + (cl.level || 0);
    for (let i = 0; i < (cl.level || 0); i++) {
      levels += 1;
      // 2024 PHB: level 1 of your FIRST class gives the maximum die; every level
      // after that gives the die's average, rounded up ((die/2) + 1).
      hpFromDice += (idx === 0 && i === 0) ? sides : Math.floor(sides / 2) + 1;
    }
  });
  ch.hitDice = {};
  for (const k of Object.keys(pools)) {
    ch.hitDice[k] = { max: pools[k], used: clamp(prevUsed[k] || 0, 0, pools[k]) };
  }

  const oldMax = ch.maxHp || 0;
  let newMax;
  if (levels > 0) {
    // Con applies to every level retroactively — raising Con raises max HP at once.
    newMax = hpFromDice + conMod * levels + (mech.hpPerLevel || 0) * levels + (mech.maxHpBonus || 0);
  } else {
    // Monsters / statblock creatures: keep whatever scaling.js rolled, plus bonuses.
    // Remember the unmodified value so repeated recalcs cannot inflate it.
    if (ch.baseMaxHp == null) ch.baseMaxHp = oldMax || 1;
    newMax = ch.baseMaxHp + (mech.maxHpBonus || 0);
  }
  newMax = Math.max(1, Math.floor(newMax));
  if (oldMax > 0 && newMax !== oldMax && ch.hp > 0) {
    ch.hp = clamp(ch.hp + (newMax - oldMax), 1, newMax);
  }
  ch.maxHp = newMax;
  if (ch.hp > ch.maxHp) ch.hp = ch.maxHp;
  if (typeof ch.hp !== 'number' || Number.isNaN(ch.hp)) ch.hp = ch.maxHp;

  // --- 7. armour class -----------------------------------------------------
  const armor = armorOf(ch);
  const shield = shieldOf(ch);
  const shieldAc = shield ? (shield.ac ?? 2) + instPlus(equipped(ch, 'shield') || equipped(ch, 'offHand')) : 0;

  // Baseline: 10 + Dex, or the worn armour's own formula.
  let bestAc = 10 + dexMod;
  if (armor) {
    const dexPart = armor.addDex === false ? 0
      : (armor.dexCap != null ? Math.min(dexMod, armor.dexCap) : dexMod);
    bestAc = (armor.ac || 10) + dexPart + instPlus(equipped(ch, 'armor'));
  }
  // Alternate formulas: Barbarian 10+Dex+Con, Monk 10+Dex+Wis, Draconic 13+Dex,
  // Mage Armor 13+Dex. They only apply while unarmoured; Monk also forbids a shield.
  for (const f of mech.acFormulas) {
    if (armor && f.allowArmor !== true) continue;
    if (shield && f.noShield === true) continue;
    const cap = f.cap;
    let v = (f.base ?? 10) + (f.addDex === false ? 0 : (cap != null ? Math.min(dexMod, cap) : dexMod));
    const extra = f.add || f.addAbility;
    if (extra && ABILITIES.includes(extra)) v += abMod(scores[extra]);
    for (const a of arr(f.abilities)) if (ABILITIES.includes(a)) v += abMod(scores[a]);
    if (v > bestAc) bestAc = v;
  }
  // Defense fighting style: +1 AC while wearing any armour.
  const defenseStyle = armor && hasFightingStyle(ch, 'defense') ? 1 : 0;
  ch.ac = bestAc + shieldAc + (mech.acBonus || 0) + defenseStyle;

  // Non-proficient armour: disadvantage on Str/Dex checks, saves and attacks, and
  // you cannot cast spells (2024 PHB). Combat/actions read this flag.
  const armorPenalty = !!(
    (armor && !hasProf(ch, 'armor', armor.category))
    || (shield && !hasProf(ch, 'armor', 'shields'))
  );
  ch.flags.nonProficientArmor = armorPenalty;
  ch.flags.noSpellcasting = armorPenalty;
  ch.flags.stealthDisadvantage = !!(armor && armor.stealthDis);

  // --- 8. speed ------------------------------------------------------------
  const sp = SPECIES?.[ch.speciesId];
  let speed = ch.baseSpeed ?? sp?.speed ?? 30;
  speed += mech.speedBonus || 0;
  speed -= mech.speedPenalty || 0;
  // Heavy armour with an unmet Strength requirement costs 10 feet of speed.
  if (armor && armor.strReq && scores.str < armor.strReq) speed -= 10;
  ch.speed = Math.max(0, speed);
  ch.speeds = { ...mech.speeds };
  if (ch.size == null) ch.size = sp?.size || 'medium';

  // --- 9. saving throws ----------------------------------------------------
  pushAll(ch.saveProfs, mech.saveProf);

  // --- 10. skills: proficiency then expertise ------------------------------
  const profSkills = [];
  pushAll(profSkills, mech.skillProf);
  pushAll(profSkills, ch.choices.skills);
  for (const s of profSkills) if (SKILLS[s]) ch.skills[s] = 'prof';
  const expSkills = [];
  pushAll(expSkills, mech.skillExpertise);
  pushAll(expSkills, ch.choices.expertise);
  // Expertise doubles the proficiency bonus, so it implies proficiency.
  for (const s of expSkills) if (SKILLS[s]) ch.skills[s] = 'expert';

  // --- 11. resistances / immunities / vulnerabilities (deduped) ------------
  pushAll(ch.resist, mech.resist);
  pushAll(ch.immune, mech.immune);
  pushAll(ch.vuln, mech.vuln);
  pushAll(ch.condImmune, mech.condImmune);
  // Immunity supersedes resistance and vulnerability to the same type.
  ch.resist = ch.resist.filter((t) => !ch.immune.includes(t));
  ch.vuln = ch.vuln.filter((t) => !ch.immune.includes(t));

  // --- 12. senses ----------------------------------------------------------
  ch.senses = { darkvision: mech.darkvision || 0 };
  if (mech.blindsight) ch.senses.blindsight = mech.blindsight;
  if (mech.truesight) ch.senses.truesight = mech.truesight;
  if (mech.tremorsense) ch.senses.tremorsense = mech.tremorsense;

  // --- 13. initiative ------------------------------------------------------
  // 2024 Alert adds your proficiency bonus to Initiative.
  ch.initiative = dexMod + (mech.initiativeBonus || 0) + (mech.profToInitiative ? pb : 0);

  // --- 14. resources (rage, ki, channel divinity, superiority dice…) -------
  const seen = new Set();
  for (const r of mech.resources) {
    if (!r || !r.id) continue;
    seen.add(r.id);
    const max = r.max === 'prof' ? pb : (typeof r.max === 'number' ? r.max : Number(r.max) || 0);
    const cur = ch.resources[r.id];
    ch.resources[r.id] = {
      id: r.id,
      name: r.name || r.id,
      max,
      used: clamp(cur?.used || 0, 0, max),
      recharge: r.recharge || 'long',
    };
  }
  for (const k of Object.keys(ch.resources)) if (!seen.has(k)) delete ch.resources[k];

  // --- 15. derived extras used by combat -----------------------------------
  ch.extraAttacks = mech.extraAttack || 0;
  ch.critRange = mech.critRange || 20;
  ch.carryCapacity = Math.floor(scores.str * 15 * (mech.carryMult || 1) * (SIZES[ch.size]?.carry || 1));
  ch.passivePerception = 10 + skillMod(ch, 'perception').mod;
  ch.colorway = deriveColorway(ch.appearance);

  // --- 16. spellcasting -----------------------------------------------------
  try {
    if (typeof recomputeSpells === 'function') recomputeSpells(ch);
  } catch (e) {
    // The spell layer must never be able to break a character.
    console.error('[character] recomputeSpells failed', e);
  }

  // Snapshot what WE derived so the next recalc can tell manual edits apart.
  ch._derived = {
    skills: { ...ch.skills },
    tool: ch.profs.tool.slice(),
    language: ch.profs.language.slice(),
  };

  return ch;
}

// ---------------------------------------------------------------------------
// Accessors
// ---------------------------------------------------------------------------

/** Final ability score: base + all ASIs + item/effect bonuses, capped. */
export function abilityScore(ch, ab) {
  if (!ch) return 10;
  if (ch._scores && ch._scores[ab] != null) return ch._scores[ab];
  const mech = mechOf(ch);
  const cap = ch.abilityCap || MAX_ABILITY;
  let v = clamp((Number(ch.base?.[ab]) || 10) + (Number(ch.asi?.[ab]) || 0) + (Number(mech.asi[ab]) || 0), 1, cap);
  const set = mech.setAbility[ab] || 0;
  if (set > v) v = set;
  return v;
}

export function abilityMod(ch, ab) { return abMod(abilityScore(ch, ab)); }

/** All six final scores at once. */
export function abilityScores(ch) {
  const o = {};
  for (const ab of ABILITIES) o[ab] = abilityScore(ch, ab);
  return o;
}

export function profBonus(ch) {
  if (!ch) return 2;
  if (ch.kind === 'monster' && ch.prof) return ch.prof;
  return ch.prof || 2 + Math.floor((clamp(ch.level || 1, 1, 20) - 1) / 4);
}

/**
 * Skill modifier, its proficiency tier and the passive score.
 * Expertise doubles proficiency; Jack of All Trades adds half (rounded down) to
 * skills you are NOT proficient in.
 */
export function skillMod(ch, skill) {
  const def = SKILLS[skill];
  if (!ch || !def) return { mod: 0, prof: 'none', passive: 10 };
  const mech = mechOf(ch);
  const pb = profBonus(ch);
  const tier = ch.skills?.[skill] || 'none';
  let m = abilityMod(ch, def.ability);
  if (tier === 'expert') m += pb * 2;
  else if (tier === 'prof') m += pb;
  else if (mech.jackOfAllTrades) m += Math.floor(pb / 2);
  m += mech.skillBonus[skill] || 0;
  const adv = mech.advSkill.includes(skill);
  return { mod: m, prof: tier, passive: 10 + m + (adv ? 5 : 0), adv };
}

/** Saving throw modifier for an ability. */
export function saveMod(ch, ab) {
  if (!ch) return 0;
  const mech = mechOf(ch);
  let m = abilityMod(ch, ab);
  if ((ch.saveProfs || []).includes(ab)) m += profBonus(ch);
  m += mech.saveBonus || 0;               // Cloak of Protection, Aura of Protection…
  m += mech.saveBonusBy[ab] || 0;
  return m;
}

export function acOf(ch) { return ch?.ac ?? 10; }
export function maxHpOf(ch) { return ch?.maxHp ?? 1; }
export function speedOf(ch) { return ch?.speed ?? 30; }
export function initiativeMod(ch) { return ch?.initiative ?? 0; }
export function passivePerception(ch) { return skillMod(ch, 'perception').passive; }

/**
 * Proficiency test.
 * kind: 'armor' | 'weapon' | 'tool' | 'language' | 'skill' | 'save'
 * For weapons, `id` may be an item id, a definition, an instance or a category.
 */
export function hasProf(ch, kind, id) {
  if (!ch || id == null) return false;
  switch (kind) {
    case 'skill': {
      const t = ch.skills?.[id];
      return t === 'prof' || t === 'expert';
    }
    case 'save':
      return (ch.saveProfs || []).includes(id);
    case 'armor': {
      const want = lower(id);
      const list = (ch.profs?.armor || []).map(lower);
      if (want === 'shield' || want === 'shields') return list.includes('shield') || list.includes('shields');
      return list.includes(want);
    }
    case 'weapon': {
      const list = (ch.profs?.weapon || []).map(lower);
      // itemDef also resolves generated variants ('longsword-plus1'); a bare category
      // string like 'martial' simply resolves to null and is matched directly.
      const def = itemDef(id);
      if (!def) {
        const want = lower(id);
        if (want === 'unarmed') return true;   // everyone can punch
        return list.includes(want);
      }
      if (list.includes(lower(def.id))) return true;
      if (def.category && list.includes(lower(def.category))) return true;
      // Generated variants ("longsword-plus1") inherit the base weapon's proficiency.
      const base = String(def.id || '').replace(/-plus\d+$/, '');
      return list.includes(lower(base));
    }
    case 'tool':
      return (ch.profs?.tool || []).map(lower).includes(lower(id));
    case 'language':
      return (ch.profs?.language || []).map(lower).includes(lower(id));
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Attack maths
// ---------------------------------------------------------------------------

/** The unarmed-strike pseudo weapon. */
function unarmedDef(ch) {
  const mech = mechOf(ch);
  return {
    id: 'unarmed', name: 'Unarmed Strike', kind: 'weapon', category: 'unarmed',
    // 2024: an unarmed strike deals 1 + Str bludgeoning unless something upgrades it.
    die: mech.unarmedDie || '1',
    dtype: 'bludgeoning', props: [], range: null, mastery: null, unarmed: true,
  };
}

/** Normalise "a weapon" (id, instance or definition) into {def, inst}. */
function resolveWeapon(ch, weapon) {
  if (!weapon) return { def: unarmedDef(ch), inst: null };
  const def = itemDef(weapon);
  if (!def) return { def: unarmedDef(ch), inst: null };
  const inst = (typeof weapon === 'object' && weapon.uid) ? weapon : null;
  return { def, inst };
}

const hasProp = (def, p) => arr(def?.props).includes(p);
const isRangedWeapon = (def) => hasProp(def, 'ranged') || hasProp(def, 'ammunition') || (isArr(def?.range) && !hasProp(def, 'thrown'));

/**
 * Which ability a weapon attack uses.
 * Strength by default; Dexterity for ranged weapons; the better of the two for
 * finesse weapons and for a Monk's Martial Arts weapons.
 */
export function attackAbility(ch, def, opts = {}) {
  const mech = mechOf(ch);
  if (opts.thrown && !hasProp(def, 'finesse')) return 'str';
  if (isRangedWeapon(def)) return 'dex';
  const monkWeapon = mech.martialArts && (def.unarmed
    || (def.category === 'simple' && !hasProp(def, 'heavy') && !hasProp(def, 'two-handed')));
  if (hasProp(def, 'finesse') || monkWeapon) {
    return abilityScore(ch, 'dex') >= abilityScore(ch, 'str') ? 'dex' : 'str';
  }
  return 'str';
}

/**
 * Total attack bonus with a weapon: ability modifier + proficiency (if proficient) +
 * the weapon's magic bonus + fighting-style and mech bonuses + magic ammunition.
 */
export function attackBonusFor(ch, weapon, opts = {}) {
  if (!ch) return 0;
  const { def, inst } = resolveWeapon(ch, weapon);
  const mech = mechOf(ch);
  const ranged = opts.thrown ? true : isRangedWeapon(def);
  const ab = opts.ability || attackAbility(ch, def, opts);

  let bonus = abilityMod(ch, ab);
  if (def.unarmed || hasProf(ch, 'weapon', def)) bonus += profBonus(ch);

  bonus += (def.magic?.atk || 0) + instPlus(inst);
  bonus += mech.atkBonus || 0;
  bonus += ranged ? (mech.rangedAtkBonus || 0) : (mech.meleeAtkBonus || 0);

  // Archery fighting style: +2 to attack rolls with ranged weapons. Take the best of
  // the hard rule and any data-driven mech bonus rather than stacking them twice.
  if (ranged && hasFightingStyle(ch, 'archery')) {
    bonus += Math.max(0, 2 - (mech.rangedAtkBonus || 0));
  }

  // Magic ammunition (+1 arrows) adds its bonus to attack and damage.
  if (hasProp(def, 'ammunition')) {
    const ammo = equippedDef(ch, 'ammo');
    if (ammo) bonus += (ammo.magic?.atk || 0) + instPlus(equipped(ch, 'ammo'));
  }
  return bonus;
}

/**
 * Damage package for a weapon.
 * Returns { dice, mod, type, bonusDice:[{dice,type}], ability, reroll12, versatile }.
 * `bonusDice` riders are doubled on a critical hit by core/dice.js rollDamage().
 */
export function damageFor(ch, weapon, opts = {}) {
  const { def, inst } = resolveWeapon(ch, weapon);
  const mech = mechOf(ch);
  const twoHanded = !!opts.twoHanded;
  const offHand = !!opts.offHand;
  const thrown = !!opts.thrown;
  const ranged = thrown || isRangedWeapon(def);
  const ab = opts.ability || attackAbility(ch, def, opts);

  const versatile = hasProp(def, 'versatile') && !!def.versatileDie;
  const dice = (twoHanded && versatile) ? def.versatileDie : (def.die || '1');

  let m = abilityMod(ch, ab);
  // 2024 Light property: the extra off-hand attack does NOT add your ability modifier
  // to damage — unless it is negative, or you have the Two-Weapon Fighting style.
  if (offHand && m > 0 && !hasFightingStyle(ch, 'two-weapon-fighting')) m = 0;

  m += (def.magic?.dmg || 0) + instPlus(inst);
  m += mech.dmgBonus || 0;
  m += ranged ? (mech.rangedDmgBonus || 0) : (mech.meleeDmgBonus || 0);

  // Fighting styles that add flat damage.
  const oneHandedMelee = !ranged && !twoHanded && !hasProp(def, 'two-handed');
  const otherHandFree = !equipped(ch, 'offHand');
  if (hasFightingStyle(ch, 'dueling') && oneHandedMelee && otherHandFree && !def.unarmed) m += 2;
  if (hasFightingStyle(ch, 'thrown-weapon-fighting') && thrown) m += 2;

  if (hasProp(def, 'ammunition')) {
    const ammo = equippedDef(ch, 'ammo');
    if (ammo) m += (ammo.magic?.dmg || 0) + instPlus(equipped(ch, 'ammo'));
  }

  // Rider dice: a Flame Tongue's 2d6 fire, Hunter's Mark, Divine Favor…
  const bonusDice = [];
  if (def.magic?.bonusDice) bonusDice.push({ dice: def.magic.bonusDice, type: def.magic.bonusType || def.dtype });
  if (inst?.bonusDice) bonusDice.push({ dice: inst.bonusDice, type: inst.bonusType || def.dtype });
  for (const b of mech.bonusDamage) {
    if (b.melee && ranged) continue;
    if (b.ranged && !ranged) continue;
    if (b.dice) bonusDice.push({ dice: b.dice, type: b.type || def.dtype });
  }

  return {
    dice,
    mod: m,
    type: def.dtype || 'bludgeoning',
    bonusDice,
    ability: ab,
    versatile,
    twoHanded,
    // Great Weapon Fighting: reroll 1s and 2s on the weapon's damage dice.
    reroll12: !ranged && (twoHanded || hasProp(def, 'two-handed'))
      && hasFightingStyle(ch, 'great-weapon-fighting'),
  };
}

/** The weapon mastery a character can actually use with a weapon (2024 rules). */
export function masteryFor(ch, def) {
  if (!def || !def.mastery) return null;
  const chosen = arr(ch?.choices?.masteries).map(lower);
  if (!chosen.length) return null;
  // Masteries are chosen per weapon; accept either the weapon id or the mastery name.
  const base = String(def.id || '').replace(/-plus\d+$/, '');
  if (chosen.includes(lower(def.id)) || chosen.includes(base) || chosen.includes(lower(def.mastery))) {
    return def.mastery;
  }
  return null;
}

/** Display name and rules text for a weapon mastery id (2024 PHB's eight). */
export function masteryInfo(id) {
  if (!id) return null;
  const m = WEAPON_MASTERY?.[id];
  return m ? { id, name: m.name || id, desc: m.desc || '' } : { id, name: id, desc: '' };
}

/** Range in feet for an attack option: [normal, long] or [reach, reach]. */
function rangeOf(def, thrown) {
  if (thrown || isRangedWeapon(def)) {
    if (isArr(def.range) && def.range.length) return [def.range[0], def.range[1] ?? def.range[0]];
    return [20, 60];
  }
  const reach = hasProp(def, 'reach') ? 10 : 5;
  return [reach, reach];
}

function attackEntry(ch, def, inst, slot, mode, opts = {}) {
  const thrown = mode === 'thrown';
  const twoHanded = mode === 'versatile';
  const offHand = slot === 'offHand';
  const dmg = damageFor(ch, inst || def, { twoHanded, offHand, thrown });
  const mastery = masteryFor(ch, def);
  return {
    id: `${slot}:${def.id}:${mode}`,
    item: def,
    inst,
    slot,
    mode,
    name: def.name + (mode === 'versatile' ? ' (two-handed)' : mode === 'thrown' ? ' (thrown)' : ''),
    attackBonus: attackBonusFor(ch, inst || def, { thrown }),
    damage: dmg,
    props: arr(def.props).slice(),
    mastery,
    range: rangeOf(def, thrown),
    ranged: thrown || isRangedWeapon(def),
    twoHanded,
    proficient: def.unarmed || hasProf(ch, 'weapon', def),
    cost: opts.cost || 'action',
    enabled: opts.enabled !== false,
    reason: opts.reason || '',
    ammoId: hasProp(def, 'ammunition') ? (equipped(ch, 'ammo')?.id || null) : null,
  };
}

/**
 * Which ammunition type a weapon fires, from the AMMO_TYPES table.
 * Handles "+1 Longbow" style generated variants by stripping the suffix.
 */
export function ammoTypeFor(weaponDef) {
  if (!weaponDef) return null;
  const baseId = String(weaponDef.id || '').replace(/-plus\d$/, '');
  for (const t of Object.values(AMMO_TYPES || {})) {
    if (arr(t.weapons).includes(baseId)) return t;
  }
  return null;
}

/**
 * The ammunition a character can actually shoot right now, or null.
 * 5e lets you draw a piece of ammunition as part of the attack, so arrows count
 * whether they sit in the dedicated quiver slot or loose in the pack.
 * Returns { source:'ammo'|'inventory', id, qty }.
 */
export function ammoFor(ch, weaponDef) {
  if (!ch || !weaponDef || !hasProp(weaponDef, 'ammunition')) return null;
  const type = ammoTypeFor(weaponDef);
  const ids = type ? [type.itemId, ...arr(type.variants)] : [];
  const matches = (id) => !!id && (!ids.length || ids.includes(String(id).replace(/-plus\d$/, '')));

  const slot = equipped(ch, 'ammo');
  const slotId = typeof slot === 'string' ? slot : slot?.id;
  if (matches(slotId)) return { source: 'ammo', id: slotId, qty: slot?.qty ?? 1 };

  for (const e of arr(ch.inventory)) {
    if ((e.qty || 0) > 0 && matches(e.id)) return { source: 'inventory', id: e.id, qty: e.qty };
  }
  return null;
}

/** Spend one piece of ammunition; returns true if it was available. */
export function spendAmmo(ch, weaponDef) {
  const found = ammoFor(ch, weaponDef);
  if (!found) return false;
  if (found.source === 'ammo') {
    const slot = ch.equipment.ammo;
    if (slot && typeof slot === 'object' && slot.qty > 0) {
      slot.qty -= 1;
      if (slot.qty <= 0) ch.equipment.ammo = null;
    }
  } else {
    removeItem(ch, found.id, 1);
  }
  return true;
}

/**
 * Every attack option the character has right now: main hand (plus its versatile and
 * thrown modes), the off-hand light-weapon attack, and the unarmed strike.
 */
export function weaponsOf(ch) {
  const out = [];
  if (!ch) return out;

  const mhInst = equipped(ch, 'mainHand');
  const mhDef = itemDef(mhInst);
  const ohInst = equipped(ch, 'offHand');
  const ohDef = itemDef(ohInst);

  if (mhDef && mhDef.kind === 'weapon') {
    out.push(attackEntry(ch, mhDef, mhInst, 'mainHand', 'normal'));
    // Versatile: a second option using the bigger die, available if no off-hand item.
    if (hasProp(mhDef, 'versatile') && mhDef.versatileDie && !ohInst && !equipped(ch, 'shield')) {
      out.push(attackEntry(ch, mhDef, mhInst, 'mainHand', 'versatile'));
    }
    if (hasProp(mhDef, 'thrown')) {
      out.push(attackEntry(ch, mhDef, mhInst, 'mainHand', 'thrown'));
    }
    // Ammunition weapons need ammo — from the quiver slot or loose in the pack.
    if (hasProp(mhDef, 'ammunition') && !ammoFor(ch, mhDef)) {
      for (const e of out) if (e.slot === 'mainHand') { e.enabled = false; e.reason = 'No ammunition'; }
    }
  }

  if (ohDef && ohDef.kind === 'weapon') {
    // 2024 Light property: an extra attack as a BONUS action with the other light
    // weapon. The Nick mastery lets that extra attack ride the Attack action instead.
    const nick = masteryFor(ch, ohDef) === NICK || masteryFor(ch, mhDef) === NICK;
    const bothLight = hasProp(ohDef, 'light') && (!mhDef || hasProp(mhDef, 'light'));
    out.push(attackEntry(ch, ohDef, ohInst, 'offHand', 'normal', {
      cost: nick ? 'free' : 'bonus',
      enabled: bothLight,
      reason: bothLight ? '' : 'Both weapons must have the Light property',
    }));
    if (hasProp(ohDef, 'thrown')) {
      out.push(attackEntry(ch, ohDef, ohInst, 'offHand', 'thrown', { cost: nick ? 'free' : 'bonus', enabled: bothLight }));
    }
  }

  // Natural weapons granted by species/feature mechs (claws, bite, tail).
  for (const nw of mechOf(ch).naturalWeapons) {
    const def = {
      id: lower(nw.name || 'natural-weapon').replace(/\s+/g, '-'),
      name: nw.name || 'Natural Weapon', kind: 'weapon', category: 'unarmed',
      die: nw.die || '1d6', dtype: nw.type || 'slashing', props: arr(nw.props), unarmed: true,
    };
    out.push(attackEntry(ch, def, null, 'natural', 'normal'));
  }

  // The unarmed strike is always available.
  out.push(attackEntry(ch, unarmedDef(ch), null, 'unarmed', 'normal'));

  return out;
}

// ---------------------------------------------------------------------------
// Damage and healing
// ---------------------------------------------------------------------------

/**
 * Does a resistance/immunity/vulnerability list cover this damage instance?
 * Supports plain types plus the grouped tokens 'physical', 'nonmagical' and 'all'.
 */
function listCovers(list, type, opts) {
  if (!list || !list.length) return false;
  const t = lower(type);
  if (list.includes(t)) return true;
  if (list.includes('all')) return true;
  const phys = PHYSICAL_TYPES.includes(t);
  if (phys && list.includes('physical')) return true;
  if (phys && !opts.magical && (list.includes('nonmagical') || list.includes('nonmagical-physical'))) return true;
  if (phys && !opts.silvered && list.includes('nonsilvered')) return true;
  return false;
}

/**
 * Apply damage.
 * opts: { magical, silvered, crit, source, ignoreResistance, ignoreTemp }
 * Returns { dealt, resisted, absorbed, dead, downed, overkill, hp, type }.
 */
export function damage(ch, amount, type = 'bludgeoning', opts = {}) {
  const res = { dealt: 0, resisted: 0, absorbed: 0, dead: false, downed: false, overkill: 0, hp: ch?.hp ?? 0, type, immune: false };

  // Testing god mode: the roll still happened and the log still tells the truth,
  // the party simply never falls. Applied here so every damage source obeys it.
  if (ch && ch.kind === 'pc' && CHEATS.god) {
    res.dealt = 0; res.godded = true; res.hp = ch.hp;
    return res;
  }
  if (!ch) return res;

  let amt = Math.max(0, Math.floor(Number(amount) || 0));
  const before = amt;

  if (!opts.ignoreResistance) {
    if (listCovers(ch.immune, type, opts)) {
      res.immune = true;
      res.resisted = before;
      res.hp = ch.hp;
      return res;                                   // immunity: no damage at all
    }
    // Vulnerability doubles first, then resistance halves (rounding down).
    if (listCovers(ch.vuln, type, opts)) amt *= 2;
    if (listCovers(ch.resist, type, opts)) amt = Math.floor(amt / 2);
  }
  res.resisted = before - amt;

  const wasDown = isDown(ch);

  // Temporary hit points are always spent first and never stack with real HP.
  if (!opts.ignoreTemp && ch.tempHp > 0) {
    const used = Math.min(ch.tempHp, amt);
    ch.tempHp -= used;
    amt -= used;
    res.absorbed = used;
  }

  ch.hp -= amt;
  res.dealt = res.absorbed + amt;

  if (ch.hp <= 0) {
    res.overkill = -ch.hp;
    ch.hp = 0;
    if (ch.kind === 'pc') {
      if (wasDown) {
        // Damage while already dying costs death saves: two on a critical hit.
        ch.deathSaves.fail = clamp(ch.deathSaves.fail + (opts.crit ? 2 : 1), 0, 3);
        ch.deathSaves.stable = false;
      } else {
        ch.deathSaves = { success: 0, fail: 0, stable: false };
        // Massive damage: leftover damage equal to your hit point maximum kills outright.
        if (res.overkill >= ch.maxHp) ch.deathSaves.fail = 3;
      }
      res.dead = ch.deathSaves.fail >= 3;
      res.downed = !res.dead;
      if (res.dead) ch.concentration = null;
    } else {
      // Monsters and NPCs simply die at 0 hit points.
      res.dead = true;
      ch.concentration = null;
    }
  }

  res.hp = ch.hp;
  // Concentration: the caller (actions.js) rolls the save; we report the DC.
  if (ch.concentration && res.dealt > 0) res.concentrationDC = Math.max(10, Math.floor(res.dealt / 2));

  bus.emit(EV.DAMAGE, { uid: ch.uid, ch, amount: res.dealt, type, ...res });
  if (res.dead) bus.emit(EV.DEATH, { uid: ch.uid, ch });
  else if (res.downed) bus.emit(EV.DOWNED, { uid: ch.uid, ch });
  return res;
}

/** Heal. Never exceeds maxHp; revives a downed PC at the healed amount. */
export function heal(ch, amount) {
  if (!ch) return 0;
  const amt = Math.max(0, Math.floor(Number(amount) || 0));
  if (amt <= 0) return 0;
  if (isDead(ch)) return 0;                 // the dead need Revivify, not a potion

  let actual;
  if (ch.hp <= 0) {
    // A creature at 0 hit points regains consciousness at exactly the healed amount.
    actual = Math.min(amt, ch.maxHp);
    ch.hp = actual;
    ch.deathSaves = { success: 0, fail: 0, stable: false };
  } else {
    actual = Math.min(amt, ch.maxHp - ch.hp);
    ch.hp += actual;
  }
  if (actual > 0) bus.emit(EV.HEAL, { uid: ch.uid, ch, amount: actual, hp: ch.hp });
  return actual;
}

/** Grant temporary hit points — they replace rather than stack (5e rule). */
export function addTempHp(ch, amount) {
  const amt = Math.max(0, Math.floor(Number(amount) || 0));
  if (!ch || amt <= 0) return 0;
  if (amt > (ch.tempHp || 0)) { ch.tempHp = amt; return amt; }
  return 0;
}

/** Bring a dead character back (Revivify / Raise Dead). */
export function revive(ch, hp = 1) {
  if (!ch) return false;
  ch.deathSaves = { success: 0, fail: 0, stable: false };
  ch.hp = clamp(Math.floor(hp), 1, ch.maxHp);
  return true;
}

export function isDown(ch) {
  return !!ch && ch.hp <= 0 && ch.kind === 'pc' && (ch.deathSaves?.fail || 0) < 3;
}
export function isDead(ch) {
  if (!ch) return true;
  return ch.hp <= 0 && (ch.kind !== 'pc' || (ch.deathSaves?.fail || 0) >= 3);
}
export function isAlive(ch) { return !!ch && ch.hp > 0; }

// ---------------------------------------------------------------------------
// Rests
// ---------------------------------------------------------------------------

/** Total hit dice across all pools. */
export function hitDiceTotal(ch) {
  let max = 0, used = 0;
  for (const k of Object.keys(ch?.hitDice || {})) { max += ch.hitDice[k].max || 0; used += ch.hitDice[k].used || 0; }
  return { max, used, available: max - used };
}

/**
 * Short rest. `hitDiceSpent` may be a number (spend from the largest pool down) or a
 * map like { d10: 2 }. Each die restores its roll + Con modifier, minimum 1 hit point.
 * Also refreshes short-rest resources and Pact Magic slots.
 */
export function restShort(ch, hitDiceSpent = 0, r = rng) {
  const log = [];
  if (!ch) return log;
  if (isDead(ch)) { log.push(`${ch.name} is beyond rest.`); return log; }

  const conMod = abilityMod(ch, 'con');
  const keys = Object.keys(ch.hitDice || {}).sort((a, b) => dieSides(b) - dieSides(a));

  // Normalise the request into a per-pool plan.
  const plan = {};
  if (typeof hitDiceSpent === 'number') {
    let left = Math.max(0, Math.floor(hitDiceSpent));
    for (const k of keys) {
      const avail = (ch.hitDice[k].max || 0) - (ch.hitDice[k].used || 0);
      const take = Math.min(avail, left);
      if (take > 0) { plan[k] = take; left -= take; }
      if (left <= 0) break;
    }
  } else if (hitDiceSpent && typeof hitDiceSpent === 'object') {
    for (const k of Object.keys(hitDiceSpent)) {
      const key = k.startsWith('d') ? k : `d${k}`;
      if (!ch.hitDice[key]) continue;
      const avail = (ch.hitDice[key].max || 0) - (ch.hitDice[key].used || 0);
      plan[key] = clamp(Math.floor(hitDiceSpent[k]) || 0, 0, avail);
    }
  }

  let healed = 0;
  for (const k of Object.keys(plan)) {
    const sides = dieSides(k);
    for (let i = 0; i < plan[k]; i++) {
      const rr = roll(1, sides, r);
      const gain = Math.max(1, rr.total + conMod);   // a hit die always gives at least 1
      const got = heal(ch, gain);
      healed += got;
      ch.hitDice[k].used = clamp((ch.hitDice[k].used || 0) + 1, 0, ch.hitDice[k].max);
      log.push(`${ch.name} spends a ${k}: [${rr.rolls[0]}]${conMod >= 0 ? `+${conMod}` : conMod} = ${gain} HP.`);
    }
  }
  if (healed > 0) log.push(`${ch.name} recovers ${healed} hit points.`);

  // Short-rest resources: Second Wind, Action Surge, Superiority Dice, Ki, Warlock slots.
  for (const k of Object.keys(ch.resources || {})) {
    const res = ch.resources[k];
    if (res.recharge === 'short' && res.used > 0) {
      log.push(`${ch.name} regains ${res.name}.`);
      res.used = 0;
    }
  }
  try {
    if (typeof restoreSlots === 'function') restoreSlots(ch, 'short');
  } catch (e) { console.error('[character] restoreSlots(short) failed', e); }

  bus.emit(EV.REST, { ch, kind: 'short', log });
  return log;
}

/**
 * Long rest: full hit points, half your total hit dice back (minimum 1), every spell
 * slot and resource, one level of exhaustion removed, and most conditions cleared.
 */
export function restLong(ch) {
  const log = [];
  if (!ch) return log;
  if (isDead(ch)) { log.push(`${ch.name} is dead and does not wake.`); return log; }

  ch.hp = ch.maxHp;
  ch.tempHp = 0;
  ch.deathSaves = { success: 0, fail: 0, stable: false };
  log.push(`${ch.name} wakes at full health (${ch.maxHp} HP).`);

  // Half your total hit dice, minimum one.
  const total = hitDiceTotal(ch);
  let regain = Math.max(1, Math.floor(total.max / 2));
  for (const k of Object.keys(ch.hitDice).sort((a, b) => dieSides(b) - dieSides(a))) {
    const back = Math.min(ch.hitDice[k].used || 0, regain);
    ch.hitDice[k].used -= back;
    regain -= back;
    if (regain <= 0) break;
  }

  for (const k of Object.keys(ch.resources || {})) ch.resources[k].used = 0;
  try {
    if (typeof restoreSlots === 'function') restoreSlots(ch, 'long');
  } catch (e) { console.error('[character] restoreSlots(long) failed', e); }
  log.push(`${ch.name} regains all spell slots and abilities.`);

  // Exhaustion drops by one level (2024: exhaustion is a 1–6 counter).
  const ex = (ch.conditions || []).find((c) => c.id === 'exhaustion');
  if (ex) {
    const lvl = (ex.level ?? ex.stacks ?? 1) - 1;
    if (lvl <= 0) {
      ch.conditions = ch.conditions.filter((c) => c !== ex);
      log.push(`${ch.name} shakes off the last of their exhaustion.`);
    } else {
      ex.level = lvl;
      ex.stacks = lvl;
      log.push(`${ch.name}'s exhaustion eases to level ${lvl}.`);
    }
  }

  // Clear everything a night's sleep should clear.
  ch.conditions = (ch.conditions || []).filter((c) => c.id === 'exhaustion' || LONG_REST_PERSISTENT.includes(c.id));
  // A combat turn may have cached Dying/Unconscious (or exhaustion's old
  // level). Rest changes the condition list directly, so discard that summary.
  ch._condMech = null;
  ch.effects = (ch.effects || []).filter((e) => e.dur === 'permanent' || e.permanent === true);
  ch.concentration = null;

  recalc(ch);
  bus.emit(EV.REST, { ch, kind: 'long', log });
  return log;
}

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

/** Find an inventory entry by uid or item id. */
export function findItem(ch, idOrUid) {
  if (!ch) return null;
  return (ch.inventory || []).find((e) => e.uid === idOrUid || e.id === idOrUid) || null;
}

/** How many of an item id the character carries (inventory only, not equipped). */
export function countItem(ch, itemId) {
  let n = 0;
  for (const e of ch?.inventory || []) if (e.id === itemId) n += e.qty || 1;
  return n;
}

export function hasItem(ch, itemId, qty = 1) { return countItem(ch, itemId) >= qty; }

/**
 * Add an item. Stackable mundane items merge into an existing stack; anything with
 * per-instance state (charges, enchantment, attunement) gets its own entry.
 */
export function addItem(ch, itemId, qty = 1) {
  if (!ch) return null;
  if (itemId && typeof itemId === 'object' && itemId.id) {
    const inst = { uid: itemId.uid || uid('it'), qty: itemId.qty || 1, ...itemId };
    ch.inventory.push(inst);
    bus.emit(EV.ITEM_GAIN, { ch, id: inst.id, qty: inst.qty });
    return inst;
  }
  const def = itemDef(itemId);
  const n = Math.max(1, Math.floor(qty) || 1);
  const stackable = def ? def.stack !== false && !needsAttunement(def) && def.charges == null : true;

  if (stackable) {
    const found = (ch.inventory || []).find((e) => e.id === itemId && !e.charges && !e.enchant);
    if (found) { found.qty = (found.qty || 1) + n; bus.emit(EV.ITEM_GAIN, { ch, id: itemId, qty: n }); return found; }
    const inst = makeItemInstance(itemId, { qty: n });
    ch.inventory.push(inst);
    bus.emit(EV.ITEM_GAIN, { ch, id: itemId, qty: n });
    return inst;
  }
  let last = null;
  for (let i = 0; i < n; i++) { last = makeItemInstance(itemId); ch.inventory.push(last); }
  bus.emit(EV.ITEM_GAIN, { ch, id: itemId, qty: n });
  return last;
}

/** Remove `qty` of an item id (or a single instance by uid). Returns how many left the bag. */
export function removeItem(ch, itemId, qty = 1) {
  if (!ch) return 0;
  let left = Math.max(1, Math.floor(qty) || 1);
  let removed = 0;
  for (let i = ch.inventory.length - 1; i >= 0 && left > 0; i--) {
    const e = ch.inventory[i];
    if (e.id !== itemId && e.uid !== itemId) continue;
    const take = Math.min(e.qty || 1, left);
    e.qty = (e.qty || 1) - take;
    left -= take;
    removed += take;
    if (e.qty <= 0) ch.inventory.splice(i, 1);
  }
  if (removed) bus.emit(EV.ITEM_LOSE, { ch, id: itemId, qty: removed });
  return removed;
}

/** Pull one instance out of the inventory (splitting a stack if needed). */
function takeInstance(ch, inst) {
  const idx = ch.inventory.findIndex((e) => e === inst || e.uid === inst.uid);
  if (idx < 0) return { ...inst, uid: inst.uid || uid('it'), qty: 1 };
  const e = ch.inventory[idx];
  if ((e.qty || 1) > 1) {
    e.qty -= 1;
    const copy = { ...e, uid: uid('it'), qty: 1 };
    return copy;
  }
  ch.inventory.splice(idx, 1);
  return e;
}

// ---------------------------------------------------------------------------
// Equipment
// ---------------------------------------------------------------------------

/**
 * Equip an item instance into a slot.
 * Enforces: valid slot for the item kind, two-handed weapons blocking the off hand,
 * shields needing a free hand, and the three-item attunement limit.
 * Returns true on success. Displaced items go back to the inventory.
 */
export function equip(ch, itemInstance, slot = null) {
  if (!ch || !itemInstance) return false;
  const inst = typeof itemInstance === 'string'
    ? (findItem(ch, itemInstance) || makeItemInstance(itemInstance))
    : itemInstance;
  const def = itemDef(inst);
  if (!def) return false;

  let target = slot || defaultSlotFor(def, ch);
  // Shields are always "the off hand" — accept either name and normalise.
  if (def.kind === 'shield') target = 'shield';
  else if (target === 'shield') target = 'offHand';
  if (!target || !SLOT_LIST.includes(target)) return false;

  // Slot/kind sanity: don't let a helm go on a finger.
  if (target === 'armor' && def.kind !== 'armor') return false;
  if (target === 'ammo' && def.kind !== 'ammo') return false;
  const HELD = ['weapon', 'shield', 'tool', 'wand', 'rod', 'focus'];
  if ((target === 'mainHand' || target === 'offHand')
    && !HELD.includes(def.kind) && !def.offHandOk) return false;

  // Attunement: three at a time, and an unattuned magic item does nothing.
  if (needsAttunement(def)) {
    if (attunedCount(ch) >= ATTUNEMENT_MAX && !inst.attuned) return false;
    inst.attuned = true;
  }

  const twoHanded = def.kind === 'weapon' && hasProp(def, 'two-handed');
  const displaced = [];

  if (target === 'mainHand' && twoHanded) {
    // A two-handed weapon occupies both hands: clear the off hand and the shield.
    for (const s of ['offHand', 'shield']) if (ch.equipment[s]) displaced.push(unequip(ch, s, { skipRecalc: true }));
  }
  if (target === 'offHand' || target === 'shield') {
    // A shield or off-hand item needs a free hand.
    const mh = equippedDef(ch, 'mainHand');
    if (mh && hasProp(mh, 'two-handed')) displaced.push(unequip(ch, 'mainHand', { skipRecalc: true }));
    // offHand and shield are the same hand.
    const other = target === 'offHand' ? 'shield' : 'offHand';
    if (ch.equipment[other]) displaced.push(unequip(ch, other, { skipRecalc: true }));
  }
  if (ch.equipment[target]) displaced.push(unequip(ch, target, { skipRecalc: true }));

  let moved;
  if (def.kind === 'ammo') {
    // Ammunition equips as a whole stack — pull the entry out of the bag intact.
    const idx = ch.inventory.findIndex((e) => e === inst || e.uid === inst.uid);
    moved = idx >= 0 ? ch.inventory.splice(idx, 1)[0] : { ...inst, uid: inst.uid || uid('it') };
    moved.qty = moved.qty || 1;
  } else {
    moved = takeInstance(ch, inst);
    moved.qty = 1;
  }
  if (needsAttunement(def)) moved.attuned = true;
  ch.equipment[target] = moved;
  void displaced;   // displaced gear was already returned to the bag by unequip()

  recalc(ch);
  return true;
}

/** Unequip a slot, returning the instance to the inventory. Returns the instance. */
export function unequip(ch, slot, opts = {}) {
  if (!ch || !ch.equipment) return null;
  const inst = ch.equipment[slot];
  if (!inst) return null;
  ch.equipment[slot] = null;
  inst.attuned = false;             // attunement ends when you take the item off
  ch.inventory.push(inst);
  if (!opts.skipRecalc) recalc(ch);
  return inst;
}

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------

/** Attach a temporary effect (a buff, an aura, a potion) and recalculate. */
export function addEffect(ch, effect) {
  if (!ch || !effect) return null;
  const e = { id: effect.id || uid('fx'), name: effect.name || effect.id || 'Effect', dur: effect.dur ?? null, mech: effect.mech || null, source: effect.source || null, concentration: !!effect.concentration, ...effect };
  ch.effects.push(e);
  recalc(ch);
  return e;
}

/** Remove effects by id (or by a predicate). */
export function removeEffect(ch, idOrFn) {
  if (!ch) return 0;
  const before = ch.effects.length;
  const test = typeof idOrFn === 'function' ? idOrFn : (e) => e.id === idOrFn || e.name === idOrFn;
  ch.effects = ch.effects.filter((e) => !test(e));
  const n = before - ch.effects.length;
  if (n) recalc(ch);
  return n;
}

// ---------------------------------------------------------------------------
// Cloning and serialisation
// ---------------------------------------------------------------------------

/**
 * Convention: any field whose name starts with `_` is a transient cache belonging to
 * whichever rules module wrote it, and is never saved. `recalc` rebuilds ours
 * (_mech, _mechAsi, _scores, _derived) from the persistent fields.
 */
const isCacheKey = (k) => k.charAt(0) === '_';

/** A deep copy. Pass { newUid:true } to make it a distinct creature. */
export function cloneChar(ch, opts = {}) {
  if (!ch) return null;
  const copy = deepClone(serializeChar(ch));
  if (opts.newUid) {
    copy.uid = uid('ch');
    for (const slot of SLOT_LIST) if (copy.equipment[slot]) copy.equipment[slot].uid = uid('it');
    for (const e of copy.inventory) e.uid = uid('it');
  }
  return deserializeChar(copy);
}

/** A plain JSON-safe snapshot. Derived caches are stripped; recalc rebuilds them. */
export function serializeChar(ch) {
  if (!ch) return null;
  const out = {};
  for (const k of Object.keys(ch)) {
    if (isCacheKey(k)) continue;
    if (typeof ch[k] === 'function') continue;
    if (ch[k] === undefined) continue;
    out[k] = ch[k];
  }
  return deepClone(out);
}

/** Rebuild a live Character from a snapshot. Round-trips losslessly with serializeChar. */
export function deserializeChar(obj) {
  if (!obj) return null;
  const ch = deepClone(obj);
  normalize(ch);
  // `asiManual` survives the round trip, and `_mechAsi` does not, so recalc rebuilds
  // ch.asi from scratch instead of double-counting the merged bonuses.
  recalc(ch);
  return ch;
}
