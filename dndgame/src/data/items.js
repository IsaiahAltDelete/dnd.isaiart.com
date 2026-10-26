// data/items.js — the merged item catalogue: mundane gear plus magic items,
// with the query helpers the shop, inventory and loot systems use.

import { GEAR, WEAPON_MASTERY, AMMO_TYPES, TOOL_KITS, SHOP_TABLES } from './items_gear.js';
import { MAGIC_ITEMS, MAGIC_TIERS, LOOT_TABLES } from './items_magic.js';
import { DIRECTOR_ITEMS } from './items_director.js';
import { ARMORY_ITEMS } from './items_armory.js';
import { RARITY } from '../constants.js';

export const ITEMS = Object.freeze({ ...GEAR, ...MAGIC_ITEMS, ...DIRECTOR_ITEMS, ...ARMORY_ITEMS });
export const ITEM_IDS = Object.freeze(Object.keys(ITEMS));
export { WEAPON_MASTERY, AMMO_TYPES, TOOL_KITS, SHOP_TABLES, MAGIC_TIERS, LOOT_TABLES, RARITY };

// --- indexes ---------------------------------------------------------------

const byKind = {};
const bySlot = {};
for (const id of ITEM_IDS) {
  const it = ITEMS[id];
  (byKind[it.kind] ||= []).push(id);
  if (it.slot) (bySlot[it.slot] ||= []).push(id);
}

export function getItem(id) { return ITEMS[id] || null; }
export function itemName(id) { return ITEMS[id]?.name || id; }
export function itemsByKind(kind) { return (byKind[kind] || []).slice(); }
export function itemsBySlot(slot) { return (bySlot[slot] || []).slice(); }

export function isWeapon(id) { return ITEMS[id]?.kind === 'weapon'; }
export function isArmor(id) { return ITEMS[id]?.kind === 'armor'; }
export function isShield(id) { return ITEMS[id]?.kind === 'shield'; }
export function isConsumable(id) { const k = ITEMS[id]?.kind; return k === 'potion' || k === 'scroll' || k === 'food' || k === 'ammo-bundle'; }
export function isMagic(id) { const it = ITEMS[id]; return !!it && (it.rarity && it.rarity !== 'common' || !!it.magic || !!it.mech); }

/** Which equipment slot an item goes in (null if it isn't equippable). */
export function slotFor(id) {
  const it = ITEMS[id];
  if (!it) return null;
  if (it.slot) return it.slot;
  if (it.kind === 'weapon') return 'mainHand';
  if (it.kind === 'armor') return 'armor';
  if (it.kind === 'shield') return 'offHand';
  if (it.kind === 'ammo') return 'ammo';
  return null;
}

/** Colour for the rarity, used for item names in the UI. */
export function rarityColor(id) {
  const it = ITEMS[id];
  return RARITY[it?.rarity || 'common']?.color || '#cfc3a4';
}

/** Buy price at a shop (markup applied), and sell price (usually half). */
export function buyPrice(id, markup = 1) { return Math.max(1, Math.round((ITEMS[id]?.cost || 0) * markup)); }
export function sellPrice(id, buyback = 0.5) { return Math.max(0, Math.floor((ITEMS[id]?.cost || 0) * buyback)); }

/**
 * Two-handed reach: "1d8 slashing (1d10 versatile)" — the line shown under a
 * weapon in the inventory.
 */
export function weaponLine(it) {
  if (!it || it.kind !== 'weapon') return '';
  const v = it.props?.includes('versatile') && it.versatileDie ? ` (${it.versatileDie})` : '';
  const mast = it.mastery ? ` · ${WEAPON_MASTERY[it.mastery]?.name || it.mastery}` : '';
  return `${it.die}${v} ${it.dtype}${mast}`;
}

export function armorLine(it) {
  if (!it) return '';
  if (it.kind === 'shield') return `+${it.ac} AC`;
  if (it.kind !== 'armor') return '';
  const dex = it.addDex ? (it.dexCap != null ? ` + Dex (max ${it.dexCap})` : ' + Dex') : '';
  const req = it.strReq ? ` · Str ${it.strReq}` : '';
  const st = it.stealthDis ? ' · Stealth disadv.' : '';
  return `AC ${it.ac}${dex}${req}${st}`;
}

/**
 * Build a "+N" magic variant of a mundane weapon or armour on the fly, so the
 * loot tables can produce a +1 Longsword without 37 hand-written entries.
 */
export function magicVariant(baseId, plus = 1) {
  const base = ITEMS[baseId];
  if (!base || plus < 1) return null;
  const rarity = plus === 1 ? 'uncommon' : plus === 2 ? 'rare' : 'very-rare';
  const id = `${baseId}-plus${plus}`;
  const v = {
    ...base,
    id,
    name: `+${plus} ${base.name}`,
    rarity,
    cost: Math.round((base.cost || 10) + 400 * Math.pow(4, plus - 1)),
    desc: `${base.desc} A masterwork blade of Sword Coast make, humming faintly with the Weave.`,
    generated: true,
  };
  if (base.kind === 'weapon') v.magic = { ...(base.magic || {}), atk: plus, dmg: plus };
  else if (base.kind === 'armor') v.ac = base.ac + plus;
  else if (base.kind === 'shield') v.ac = base.ac + plus;
  return Object.freeze(v);
}

/**
 * Resolve an item id that may be a generated variant ("longsword-plus1").
 * Every lookup in the game goes through here so variants behave like real items.
 */
export function resolveItem(id) {
  if (ITEMS[id]) return ITEMS[id];
  const m = String(id).match(/^(.+)-plus(\d)$/);
  if (m) return magicVariant(m[1], parseInt(m[2], 10));
  return null;
}

/** Total weight of an inventory array [{id, qty}]. */
export function totalWeight(list) {
  let w = 0;
  for (const e of list || []) w += (resolveItem(e.id)?.weight || 0) * (e.qty || 1);
  return Math.round(w * 10) / 10;
}

export function itemCount() { return ITEM_IDS.length; }
