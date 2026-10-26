// ui/shop.js — ShopScene: Barthen's Provisions, the Lionshield Coster, the Shrine
// of Luck, the Phandalin Miner's Exchange and the Stonehill Inn, all through one
// two-column counter.
//
// Layout (400x240 logical):
//   y   2..25    keeper strip: bust, shop sign, shopkeeper, the party purse
//   y  27..40    tabs — Buy / Sell / Services
//   y  42..213   left: the stock list (icon, rarity-coloured name, have, price)
//                right: the detail panel — stats, then a live COMPARISON against
//                whatever the selected companion has in that slot
//   y 216..238   greeting / status line and key hints
//
// The comparison is not hand-computed: the candidate item is equipped onto a
// throwaway clone of the companion and rules/character.js#recalc is re-run, so the
// green and red deltas are exactly the numbers combat will use.

import { UI } from './kit.js';
import { MK } from './menukit.js';
import { Input } from '../core/input.js';
import { Audio } from '../core/audio.js';
import { Game } from '../engine.js';
import { VIEW_W, VIEW_H, clamp, signed, RARITY, titleCase } from '../constants.js';
import { avgExpr } from '../core/dice.js';
import { bus, EV, toast } from '../core/events.js';
import { drawActorBust } from '../render/actor.js';
import { hasSprite } from '../render/sprites.js';
import { ABILITY_ABBR } from '../rules/abilities.js';
import {
  itemDef, defaultSlotFor, cloneChar, makeItemInstance, equip, recalc,
  acOf, maxHpOf, speedOf, initiativeMod, weaponsOf, revive, isDead, isDown, hasProf,
} from '../rules/character.js';
import { removeCondition, hasCondition } from '../rules/conditions.js';
import {
  ITEMS, SHOP_TABLES, resolveItem, itemsByKind, weaponLine, armorLine,
  rarityColor, sellPrice,
} from '../data/items.js';
import { Party } from '../world/party.js';
import { advanceTime } from '../state.js';
import { priceMultiplierIn, shopsRefuse } from '../rules/crime.js';
import { charmDiscount } from '../rules/fieldworld.js';
import { localStanding, socialGreeting, rememberNPC } from '../rules/reputation.js';
import { noteDeed } from '../rules/deeds.js';

// ===========================================================================
// 0. SAFETY
// ===========================================================================

function safe(fn, fb) {
  try { const v = fn(); return v === undefined || v === null ? fb : v; } catch (e) { return fb; }
}
function sfx(name) { safe(() => Audio.sfx(name), false); }
const arr = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const S = () => Game.state || null;

/**
 * A companion's name in `w` pixels. An ellipsis inside a person's name reads as
 * a rendering fault rather than a truncation, so a name that will not fit falls
 * back to its first word — "Sildar", not "Sildar Ha…".
 */
function shortName(name, w) {
  const s = String(name == null || name === '' ? '—' : name);
  if (safe(() => UI.measure(s, 'sm'), 0) <= w) return s;
  const first = s.split(/[\s,]+/)[0];
  if (first && first !== s && safe(() => UI.measure(first, 'sm'), 999) <= w) return first;
  return s;
}

// data/npcs.js may not exist yet: it only supplies the keeper's sprite.
const LATE = { npcs: null };
safe(() => import(/* @vite-ignore */ '../data/npcs.js')
  .then((m) => { LATE.npcs = m || false; })
  .catch(() => { LATE.npcs = false; }));
const NPCS = () => (LATE.npcs && LATE.npcs.NPCS) || {};

function def(id) { return safe(() => resolveItem(id), null) || safe(() => ITEMS[id], null) || null; }
function nameOf(id) { return safe(() => def(id).name, null) || String(id || '').replace(/-/g, ' '); }
function iconFor(d) {
  if (!d) return 'bag';
  if(d.kind==='weapon')return 'weapon:'+d.id;
  if (d.icon) return d.icon;
  switch (d.kind) {
    case 'weapon': return 'sword';
    case 'armor': return 'armor';
    case 'shield': return 'shield';
    case 'potion': return 'potion';
    case 'scroll': return 'scroll';
    case 'wand': return 'wand';
    case 'ring': return 'ring';
    case 'amulet': return 'amulet';
    case 'cloak': return 'cloak';
    case 'boots': return 'boots';
    case 'helm': return 'helm';
    case 'gem': return 'gem';
    case 'ammo': return 'bow';
    case 'tool': return 'hammer';
    case 'food': return 'flask';
    case 'quest': return 'quest';
    default: return 'bag';
  }
}
const RARITY_ORDER = ['common', 'uncommon', 'rare', 'very-rare', 'legendary', 'artifact'];
const rarityRank = (d) => Math.max(0, RARITY_ORDER.indexOf((d && d.rarity) || 'common'));
function rarityName(d) { return (RARITY[(d && d.rarity) || 'common'] || {}).name || 'Common'; }
function colorOfItem(id, d) {
  return safe(() => rarityColor(id), null) || (RARITY[(d && d.rarity) || 'common'] || {}).color || UI.COLORS.ink;
}
const goldText = (n) => `${Math.round(n)}g`;

// ===========================================================================
// 1. GEOMETRY
// ===========================================================================

const HEAD_Y = 2;
const HEAD_H = 24;
const TAB_Y = 28;
const CONTENT_Y = 42;
const CONTENT_H = 172;

const LIST_X = 2;
const LIST_W = 200;
const ROW_H = 13;
const LIST_ROWS = 11;
const LX = LIST_X + 5;             // inner list origin
const LY = CONTENT_Y + 5;          // 47 .. 190
const LW = LIST_W - 14;            // 186, leaving room for the scrollbar

const DET_X = 206;
const DET_W = VIEW_W - DET_X - 2;  // 192

// Fixed bands inside the detail panel, so the layout never jumps between items.
const D_TOP = CONTENT_Y + 5;       // 47  name row
const D_META = CONTENT_Y + 17;     // 59  kind / rarity / weight
const D_RULE = CONTENT_Y + 26;     // 68  divider
const D_INFO = CONTENT_Y + 30;     // 72  stat + description band (4 lines)
const D_INFO_LINES = 4;
const D_CMP = CONTENT_Y + 68;      // 110 comparison divider
const D_CMP_BODY = CONTENT_Y + 74; // 116 slot line, then the deltas
const D_CMP_END = CONTENT_Y + 115; // 157 hard floor for the delta rows
const D_STRIP = CONTENT_Y + 124;   // 166 companion selector strip
const D_PRICE = CONTENT_Y + CONTENT_H - 26; // 188 price divider

const FOOT_Y = 216;
const FOOT_H = 22;

const RESTOCK_DAYS = 10;           // a Realms tenday, when a shop names no interval

const TABS = [
  { id: 'buy', label: 'Buy', icon: 'coin' },
  { id: 'sell', label: 'Sell', icon: 'bag' },
  { id: 'services', label: 'Services', icon: 'holy' },
];

// ===========================================================================
// 2. SHOP DEFINITIONS
// ===========================================================================
// SHOP_TABLES (data/items.js) is authoritative. These fallbacks keep the five
// canonical Phandalin counters open even before that table lands, and they never
// invent item ids: anything the catalogue does not know is dropped, and the
// shelves are topped up from real items of the right kind.

const SERVICE_LIB = {
  heal: {
    id: 'heal', name: 'Healing Touch', cost: 15, icon: 'plus', effect: 'heal',
    desc: 'Hands laid on every wound in the party. Hit points restored in full.',
  },
  'lesser-restoration': {
    id: 'lesser-restoration', name: 'Lesser Restoration', cost: 40, icon: 'holy', effect: 'cure',
    conditions: ['poisoned', 'blinded', 'deafened', 'paralyzed', 'diseased'],
    desc: 'Tymora\'s favour burns out poison, blindness and creeping sickness.',
  },
  'remove-curse': {
    id: 'remove-curse', name: 'Remove Curse', cost: 80, icon: 'rune', effect: 'cure',
    conditions: ['cursed', 'petrified'], desc: 'The dark word binding an item or a soul is unmade.',
  },
  revivify: {
    id: 'revivify', name: 'Revivify', cost: 300, icon: 'heart', effect: 'revive',
    desc: 'Diamond dust and a prayer. One companion dead less than a minute draws breath again.',
  },
  identify: {
    id: 'identify', name: 'Identify', cost: 20, icon: 'eye', effect: 'identify',
    desc: 'Every unknown trinket in the pack is named and its properties read out.',
  },
  'room-common': {
    id: 'room-common', name: 'Common Room', cost: 5, icon: 'candle', effect: 'rest',
    desc: 'Straw pallets by the hearth. A long rest for the whole party.',
  },
  'room-private': {
    id: 'room-private', name: 'Private Room', cost: 12, icon: 'candle', effect: 'rest',
    desc: 'A bolted door and a real bed. A long rest, undisturbed.',
  },
  meal: {
    id: 'meal', name: 'Hot Meal', cost: 2, icon: 'flask', effect: 'meal',
    desc: 'Trilena\'s stew and brown bread. Restores a quarter of everyone\'s hit points.',
  },
  repair: {
    id: 'repair', name: 'Mend & Sharpen', cost: 25, icon: 'anvil', effect: 'repair',
    desc: 'Dented plate hammered true, notched edges ground back. Charges of a wand or staff renewed.',
  },
  appraise: {
    id: 'appraise', name: 'Assay Ore', cost: 5, icon: 'gem', effect: 'appraise',
    desc: 'Halia weighs and grades your ore and gems, and pays the honest rate for a tenday.',
  },
};

const FALLBACK_SHOPS = {
  'barthens-provisions': {
    id: 'barthens-provisions', name: "Barthen's Provisions", keeper: 'Elmar Barthen',
    npc: 'elmar-barthen', kind: 'general', music: 'shop', markup: 1, buyback: 0.5,
    greeting: 'Rope, rations and lamp oil, all honestly priced. Ander will fetch anything you need.',
    stock: ['rations', 'torch', 'rope-hempen', 'bedroll', 'backpack', 'tinderbox',
      'waterskin', 'lantern-hooded', 'oil-flask', 'healers-kit', 'crowbar',
      'grappling-hook', 'potion-healing'],
    fill: { kinds: ['food', 'tool', 'potion'], maxCost: 60, count: 14 },
    services: ['repair'],
  },
  'lionshield-coster': {
    id: 'lionshield-coster', name: 'Lionshield Coster', keeper: 'Linene Graywind',
    npc: 'linene-graywind', kind: 'smith', music: 'shop', markup: 1, buyback: 0.5,
    greeting: 'Everything on these walls came up the High Road from Yartar. Break it, you bought it.',
    stock: ['shortsword', 'longsword', 'battleaxe', 'shortbow', 'longbow', 'dagger',
      'spear', 'mace', 'leather-armor', 'studded-leather-armor', 'chain-shirt',
      'scale-mail', 'shield', 'arrow', 'crossbow-bolt'],
    fill: { kinds: ['weapon', 'armor', 'shield', 'ammo'], maxCost: 300, count: 18 },
    services: ['repair'],
  },
  'shrine-of-luck': {
    id: 'shrine-of-luck', name: 'Shrine of Luck', keeper: 'Sister Garaele',
    npc: 'sister-garaele', kind: 'temple', music: 'town', markup: 1, buyback: 0.4,
    greeting: 'Lady Tymora smiles on the bold. Tell me where it hurts, and what you can tithe.',
    stock: ['potion-healing', 'holy-water', 'antitoxin', 'holy-symbol', 'incense'],
    fill: { kinds: ['potion', 'scroll'], maxCost: 120, count: 10 },
    services: ['heal', 'lesser-restoration', 'remove-curse', 'revivify', 'identify'],
  },
  'miners-exchange': {
    id: 'miners-exchange', name: 'Miner\'s Exchange', keeper: 'Halia Thornton',
    npc: 'halia-thornton', kind: 'exchange', music: 'shop', markup: 1.1, buyback: 0.5,
    greeting: 'Every claim in Phandalin is registered here. Bring me ore and gems — I pay above the coast rate.',
    premium: { kinds: ['gem', 'material'], mult: 0.95 },
    stock: ['pick', 'shovel', 'miners-pick', 'lantern-hooded', 'rope-hempen', 'crowbar'],
    fill: { kinds: ['tool', 'gem'], maxCost: 200, count: 10 },
    services: ['appraise'],
  },
  // Grista's tap house on the south side of Phandalin. maps.js has always put a
  // shop trigger on her counter; nothing in either catalogue answered to the id,
  // so the door opened onto "The shelves are bare today."
  'sleeping-giant': {
    id: 'sleeping-giant', name: 'The Sleeping Giant', keeper: 'Grista',
    npc: 'grista', kind: 'inn', music: 'inn', markup: 1, buyback: 0.3,
    greeting: 'Ale.',
    stock: ['shadowdark-ale', 'neverwinter-ale', 'iriaeboran-north-brew',
      'trail-bread', 'rations', 'torch', 'oil-flask'],
    fill: { kinds: ['food'], maxCost: 12, count: 8 },
    services: ['room-common', 'meal'],
  },
  'stonehill-inn': {
    id: 'stonehill-inn', name: 'Stonehill Inn', keeper: 'Toblen Stonehill',
    npc: 'toblen-stonehill', kind: 'inn', music: 'inn', markup: 1, buyback: 0.35,
    greeting: 'Rooms upstairs, stew on the fire, and every rumour on the Triboar Trail for free.',
    stock: ['rations', 'ale', 'wine-fine', 'bread', 'waterskin'],
    fill: { kinds: ['food'], maxCost: 30, count: 8 },
    services: ['room-common', 'room-private', 'meal'],
  },
  // The wider Sword Coast counters. SHOP_TABLES owns their names, keepers and
  // stock; these entries only add the sprite hook, the music cue and the
  // services those places are known for.
  'neverwinter-market': {
    id: 'neverwinter-market', npc: 'bran-hornraven', kind: 'general', music: 'shop',
    services: ['repair', 'identify'],
  },
  'waterdeep-bazaar': {
    id: 'waterdeep-bazaar', npc: 'esvele-amblecrown', kind: 'general', music: 'shop',
    services: ['repair', 'identify', 'lesser-restoration'],
  },
  'yawning-portal': {
    id: 'yawning-portal', npc: 'durnan', kind: 'inn', music: 'inn',
    services: ['room-common', 'room-private', 'meal', 'repair'],
  },
};

const warnedShops = new Set();

/** Merge the authored table with the fallback, then normalise the stock rows. */
function shopDefinition(shopId, opts) {
  const table = safe(() => SHOP_TABLES && SHOP_TABLES[shopId], null);
  const base = FALLBACK_SHOPS[shopId] || null;
  // A trigger naming a shop that is in neither catalogue used to fall straight
  // through to a nameless placeholder with empty shelves, which reads to the
  // player as "the shop is out of stock today" rather than as the typo it is.
  // Four of Phandalin's six counters sat like that. Say so, once per id.
  if (!table && !base && !isObj(opts && opts.shop) && !warnedShops.has(shopId)) {
    warnedShops.add(shopId);
    console.warn(`[shop] no definition for "${shopId}" — opening an empty counter.`);
  }
  const merged = { ...(base || {}), ...(isObj(table) ? table : {}), ...(isObj(opts && opts.shop) ? opts.shop : {}) };
  if (!merged.id) merged.id = shopId;
  if (!merged.name) merged.name = titleCase(String(shopId || 'shop').replace(/-/g, ' '));
  if (!merged.keeper) merged.keeper = 'The shopkeeper';
  if (!merged.greeting) merged.greeting = 'Look your fill. Coin first, questions after.';
  merged.markup = num(merged.markup, 1) || 1;
  merged.buyback = clamp(num(merged.buyback, 0.5), 0.05, 1);
  return merged;
}

/** Every stock line, as { id, qty, minPartyLevel, price } — accepts any shape. */
function normalizeStock(shop) {
  const out = [];
  const seen = new Set();
  const push = (id, qty, minLv, price) => {
    if (!id || seen.has(id) || !def(id)) return;
    seen.add(id);
    out.push({ id, qty: qty == null || qty === Infinity ? Infinity : Math.max(0, qty | 0), minPartyLevel: minLv || 0, price: price });
  };
  for (const raw of arr(shop.stock || shop.items || shop.inventory)) {
    if (typeof raw === 'string') push(raw, Infinity, 0, null);
    else if (Array.isArray(raw)) push(raw[0], raw[1], raw[2], raw[3]);
    else if (isObj(raw)) push(raw.id || raw.item, raw.qty ?? raw.count, raw.minPartyLevel ?? raw.minLevel, raw.price ?? raw.cost);
  }
  // Top the shelves up from the real catalogue so a counter is never bare.
  const fill = shop.fill;
  if (fill && out.length < (fill.count || 0)) {
    const pool = [];
    for (const kind of arr(fill.kinds)) {
      for (const id of safe(() => itemsByKind(kind), [])) {
        const d = def(id);
        if (!d || seen.has(id)) continue;
        if (d.sellable === false || d.kind === 'quest') continue;
        if (rarityRank(d) > (fill.maxRarity == null ? 1 : fill.maxRarity)) continue;
        if (num(d.cost, 0) > num(fill.maxCost, 1e9)) continue;
        pool.push({ id, cost: num(d.cost, 0) });
      }
    }
    pool.sort((a, b) => a.cost - b.cost);
    for (const p of pool) {
      if (out.length >= (fill.count || 0)) break;
      push(p.id, Infinity, 0, null);
    }
  }
  return out;
}

let unlimitedResaleCaps = null;
function unlimitedResaleCap(id) {
  if (!unlimitedResaleCaps) {
    unlimitedResaleCaps = new Map();
    // Finite stock can support trade routes. Unlimited stock must not mint
    // endless gold at another merchant, even with respect and charm stacked.
    for (const shop of Object.values(SHOP_TABLES)) {
      for (const s of normalizeStock(shop)) {
        if (Number.isFinite(s.qty)) continue;
        const base = s.price ?? num(def(s.id)?.cost, 1) * num(shop.markup, 1);
        const floor = Math.max(1, Math.round(base * 0.9 * 0.9));
        unlimitedResaleCaps.set(s.id, Math.min(unlimitedResaleCaps.get(s.id) ?? Infinity, floor));
      }
    }
  }
  return unlimitedResaleCaps.get(id) ?? Infinity;
}

function normalizeServices(shop) {
  const out = [];
  for (const raw of arr(shop.services)) {
    if (typeof raw === 'string') { if (SERVICE_LIB[raw]) out.push({ ...SERVICE_LIB[raw] }); }
    else if (isObj(raw)) {
      const base = SERVICE_LIB[raw.id] || {};
      out.push({ icon: 'star', effect: 'none', cost: 0, ...base, ...raw });
    }
  }
  return out;
}

// ===========================================================================
// 3. ITEM READOUT HELPERS
// ===========================================================================

function mechLine(m) {
  if (!isObj(m)) return '';
  const bits = [];
  if (isObj(m.asi)) for (const [k, v] of Object.entries(m.asi)) bits.push(`${ABILITY_ABBR[k] || k.toUpperCase()} ${signed(v)}`);
  if (m.acBonus) bits.push(`AC ${signed(m.acBonus)}`);
  if (m.maxHpBonus) bits.push(`HP ${signed(m.maxHpBonus)}`);
  if (m.speedBonus) bits.push(`Speed ${signed(m.speedBonus)}`);
  if (m.saveBonus) bits.push(`Saves ${signed(m.saveBonus)}`);
  if (m.initiativeBonus) bits.push(`Init ${signed(m.initiativeBonus)}`);
  if (m.meleeAtkBonus) bits.push(`Melee hit ${signed(m.meleeAtkBonus)}`);
  if (m.critRange) bits.push(`Critical ${m.critRange}-20`);
  for(const c of arr(m.condImmune))bits.push(`Cannot be ${c}`);
  for(const [skill,value]of Object.entries(m.skillBonus||{}))bits.push(`${titleCase(skill)} ${signed(value)}`);
  for(const g of arr(m.cantrip))if(g?.spellId)bits.push(`${titleCase(g.spellId.replace(/-/g,' '))}${g.ability?' ('+g.ability.toUpperCase()+')':''}`);
  if (m.darkvision) bits.push(`Darkvision ${m.darkvision}`);
  for (const r of arr(m.resist)) bits.push(`resist ${r}`);
  for (const s of arr(m.skillProf)) bits.push(String(s).replace(/-/g, ' '));
  return bits.join(' · ');
}

function magicLine(d) {
  const mg = d && d.magic;
  if (!isObj(mg)) return '';
  const bits = [];
  if(mg.atk&&mg.atk===mg.dmg)bits.push(`${signed(mg.atk)} hit/dmg`);
  else {if (mg.atk) bits.push(`${signed(mg.atk)} hit`);if (mg.dmg) bits.push(`${signed(mg.dmg)} dmg`);}
  if (mg.bonusDice) bits.push(`+${mg.bonusDice} ${mg.bonusType || ''}`.trim());
  if (mg.critBonus) bits.push(`Critical: +${mg.critBonus} damage`);
  return bits.join(' · ');
}

function useLine(d) {
  const u = d && d.use;
  if (!isObj(u)) return '';
  if (u.kind === 'heal') return `Restores ${u.dice || u.amount || '?'} hit points`;
  if (u.kind === 'cure') return `Cures ${arr(u.conditions).join(', ') || 'affliction'}`;
  if (u.kind === 'spell') return `Casts ${nameOf(u.spellId)}`;
  if (u.kind === 'buff') return 'Grants a temporary boon';
  return titleCase(String(u.kind || 'consumable'));
}

function statLines(d) {
  if (!d) return [];
  const out = [];
  if (d.kind === 'weapon') {
    out.push(safe(() => weaponLine(d), '') || `${d.die || ''} ${d.dtype || ''}`.trim());
  } else if (d.kind === 'armor' || d.kind === 'shield') {
    out.push(safe(() => armorLine(d), '') || `AC ${d.ac || '?'}`);
  }
  const mg = magicLine(d);
  if (mg) out.push(mg);
  const u = useLine(d);
  if (u) out.push(u);
  const mm = mechLine(d.mech);
  if (mm) out.push(mm);
  if(d.kind==='weapon'){
    const props=arr(d.props).map(p=>String(p).replace(/-/g,' ')).join(', ');
    if(props)out.push(props);
  }
  if (d.charges != null) out.push(`${d.charges} charges`);
  return out.filter(Boolean);
}

/**
 * Is this companion trained with this kit? The 2024 rules let anyone strap on
 * plate — you simply take disadvantage on everything physical and cannot cast —
 * so the counter warns rather than refuses.
 */
function proficiencyWarning(ch, d) {
  if (!ch || !d) return '';
  if (d.kind === 'weapon') {
    return safe(() => hasProf(ch, 'weapon', d), true) ? '' : 'Untrained — no proficiency to hit.';
  }
  if (d.kind === 'shield') {
    return safe(() => hasProf(ch, 'armor', 'shield'), true) ? '' : 'Untrained with shields.';
  }
  if (d.kind === 'armor' && d.category && d.category !== 'clothing') {
    if (safe(() => hasProf(ch, 'armor', d.category), true)) return '';
    return `No ${d.category} training — disadv, no casting.`;
  }
  return '';
}

/**
 * Everything the comparison needs from a character, in one pass.
 * When no weapon is held we fall back to the unarmed strike rather than to
 * nothing, so buying a shield for a greatsword user reads "AC +2, DMG 7.0 → 1.5"
 * instead of the nonsense "DMG 7.0 → 0.0".
 */
function snapshot(ch) {
  const w = safe(() => weaponsOf(ch), []) || [];
  const main = w.find((x) => x.slot === 'mainHand' && x.mode === 'normal')
    || w.find((x) => x.slot === 'mainHand')
    || w.find((x) => x.slot === 'natural')
    || w.find((x) => x.slot === 'unarmed')
    || null;
  let dmgAvg = null;
  let dmgText = null;
  if (main && main.damage) {
    const base = safe(() => avgExpr(main.damage.dice), 0) || 0;
    let bonus = 0;
    for (const b of arr(main.damage.bonusDice)) bonus += safe(() => avgExpr(b.dice), 0) || 0;
    dmgAvg = base + num(main.damage.mod, 0) + bonus;
    dmgText = `${main.damage.dice}${main.damage.mod ? signed(main.damage.mod) : ''}`;
  }
  return {
    ac: safe(() => acOf(ch), 10),
    hp: safe(() => maxHpOf(ch), 1),
    spd: safe(() => speedOf(ch), 30),
    init: safe(() => initiativeMod(ch), 0),
    atk: main ? num(main.attackBonus, 0) : null,
    dmgAvg, dmgText,
  };
}

// ===========================================================================
// 4. THE SCENE
// ===========================================================================

export class ShopScene {
  /**
   * @param {string} shopId  a SHOP_TABLES key ('barthens-provisions', …)
   * @param {object} opts    { npc, tab, shop, onClose }
   */
  constructor(shopId, opts = {}) {
    this.opaque = true;
    this.pausesBelow = true;
    this.uiLayer = true;
    this.id = 'shop';

    this.shopId = String(shopId || 'barthens-provisions');
    this.outlawMult = 1;          // markup a bounty on your head earns you
    this.charmMult = 1;           // …and the discount a charmed shopkeeper gives
    this.refused = false;         // …and the point past which they stop selling
    this.opts = opts || {};
    this.onClose = opts.onClose || null;
    this.shop = shopDefinition(this.shopId, opts);
    this.keeperNpc = opts.npc || NPCS()[this.shop.npc] || null;

    this.tab = Math.max(0, TABS.findIndex((t) => t.id === opts.tab));
    if (this.tab < 0) this.tab = 0;

    this.index = [0, 0, 0];
    this.top = [0, 0, 0];
    this.qty = 1;
    this.memberIndex = 0;

    this.rows = [];
    this.prompt = null;          // { title, body, options, index, onPick }
    this.msg = null;
    this.msgT = 0;
    this.msgBad = false;
    this.t = 0;
    this._cmp = new Map();
    this._closed = false;
    this._restocked = false;
  }

  // --- lifecycle ---------------------------------------------------------

  enter() {
    safe(() => Input.flush());

    // A known killer does not get the friendly price. Past a point the door is
    // simply shut — rules/crime.js decides where that point is.
    const st = Game.state;
    // The bounty ledger is keyed on the map's region, so ask the overworld
    // underneath us for the real map rather than guessing from the id.
    const map = safe(() => (Game.scenes.find((sc) => sc && sc.id === 'overworld') || {}).map, null)
      || (st ? { id: st.mapId } : null);
    this.outlawMult = safe(() => priceMultiplierIn(st, map), 1) || 1;
    this.tradeMap = map;
    this.standing = localStanding(st, map);
    this.refused = safe(() => shopsRefuse(st, map), false);
    // A shopkeeper under Charm Person counts the party as friends, and friends
    // get a tenth off. rules/fieldworld.js owns the flag and its expiry.
    this.charmMult = safe(() => charmDiscount(st, this.shop.npc), 1) || 1;
    this.tradeMult = this.outlawMult * this.charmMult * this.standing.buy;

    this._shopState();                       // runs the restock check
    this._cmp.clear();
    this._buildRows();                       // so the first frame draws real stock
    safe(() => Audio.music(this.shop.music || 'shop'));
    safe(() => bus.emit(EV.SHOP_OPEN, { id: this.shopId }));
    if (this.refused) this._say('"I know what you did. Get out."', true, 6);
    else if (this.outlawMult > 1) this._say('"Your coin spends. It just spends harder."', true, 6);
    else if (this.charmMult < 1) this._say('"For you? Call it a tenth off. I like your face."', false, 6);
    else if (this._restocked) this._say('Fresh stock came up the High Road.', false);
    else if (!this.msg) this._say(socialGreeting(st, { ...(NPCS()[this.shop.npc] || this.keeperNpc || {}), npcId: this.shop.npc }, map) || this.shop.greeting, false, 6);
    this.terms = this._tradeTerms();
  }

  exit() { /* the overworld restores its own music when it takes over again */ }

  _close() {
    if (this._closed) return;
    this._closed = true;
    sfx('back');
    if (Game.top === this) Game.pop();
  }

  // --- persistent stock --------------------------------------------------

  /** How often this counter is resupplied, in days off the Calendar of Harptos. */
  _restockDays() { return clamp(num(this.shop.restockDays, RESTOCK_DAYS), 1, 90); }

  /** The day this counter last took delivery. */
  _lastRestock(st) {
    const day = num(st.day, 1);
    const shared = num(st.shops && st.shops.restockDay, day);
    return num(st.shops && st.shops.days && st.shops.days[this.shopId], shared);
  }

  /**
   * itemId -> units already bought this restock cycle.
   * `state.shops.restockDay` stays the shared marker the spec names; the
   * per-shop day map lets Barthen's turn over every three days while the
   * Shrine of Luck only sees a delivery each tenday.
   */
  _shopState() {
    const st = S();
    if (!st) { this._local = this._local || {}; return this._local; }
    st.shops = st.shops || {};
    if (!st.shops.stock) st.shops.stock = {};
    if (!st.shops.days) st.shops.days = {};
    const day = num(st.day, 1);
    if (st.shops.restockDay == null) st.shops.restockDay = day;
    if (day - this._lastRestock(st) >= this._restockDays()) {
      st.shops.days[this.shopId] = day;
      st.shops.restockDay = day;
      st.shops.stock[this.shopId] = {};
      this._restocked = true;
    }
    st.shops.stock[this.shopId] = st.shops.stock[this.shopId] || {};
    return st.shops.stock[this.shopId];
  }

  _daysToRestock() {
    const st = S();
    if (!st || !st.shops) return null;
    return Math.max(0, this._restockDays() - (num(st.day, 1) - this._lastRestock(st)));
  }

  // --- row building ------------------------------------------------------

  _member() { return Party.members[clamp(this.memberIndex, 0, Math.max(0, Party.members.length - 1))] || null; }

  _buildRows() {
    if (this.tab === 0) this.rows = this._buyRows();
    else if (this.tab === 1) this.rows = this._sellRows();
    else this.rows = this._serviceRows();
    const n = this.rows.length;
    this.index[this.tab] = clamp(this.index[this.tab], 0, Math.max(0, n - 1));
  }

  /** The shelf list is fixed for the visit — normalise it once, not every frame. */
  _stock() {
    if (!this._stockCache) this._stockCache = normalizeStock(this.shop);
    return this._stockCache;
  }

  _services() {
    if (!this._svcCache) this._svcCache = normalizeServices(this.shop);
    return this._svcCache;
  }

  _buyRows() {
    const sold = this._shopState();
    const lvl = Party.levelMax();
    const out = [];
    for (const s of this._stock()) {
      if (s.minPartyLevel > lvl) continue;      // gear the frontier will not sell you yet
      const d = def(s.id);
      if (!d) continue;
      const price = this._purchasePrice(s, d);
      const limited = Number.isFinite(s.qty);
      const remaining = limited ? Math.max(0, s.qty - num(sold[s.id], 0)) : Infinity;
      out.push({
        kind: 'buy', id: s.id, def: d, price, limited, remaining,
        owned: Party.countItem(s.id),
        disabled: remaining <= 0,
        reason: remaining <= 0 ? 'sold out' : '',
      });
    }
    return out;
  }

  _sellRows() {
    const out = [];
    for (const e of arr(Party.inventory)) {
      const d = def(e.id);
      if (!d) continue;
      const quest = d.kind === 'quest' || d.sellable === false || d.questItem;
      let mult = this.shop.buyback;
      const prem = this.shop.premium;
      const premium = !!(prem && arr(prem.kinds).includes(d.kind));
      if (premium) mult = num(prem.mult, 0.9);
      mult *= this.standing?.sell || 1;
      let price = quest ? 0 : Math.max(1, Math.floor(num(d.cost, 0) * mult) || safe(() => sellPrice(e.id, mult), 1));
      const uncapped = price;
      if (!quest) price = Math.min(price, unlimitedResaleCap(e.id));
      // Even an explicitly priced sale item cannot be flipped at this counter.
      const shelf = this._stock().find(s => s.id === e.id);
      if (shelf && !quest) price = Math.min(price, this._purchasePrice(shelf, d));
      out.push({
        kind: 'sell', id: e.id, def: d, entry: e, price, premium, marketCapped: price < uncapped,
        owned: e.qty || 1, remaining: e.qty || 1, limited: true,
        disabled: quest, reason: quest ? 'not for sale' : '',
      });
    }
    return out;
  }

  _purchasePrice(stock, item) {
    const base = stock.price != null ? stock.price : num(item.cost, 1) * this.shop.markup;
    return Math.max(1, Math.round(base * (this.tradeMult || 1)));
  }

  _tradeTerms() {
    const s = this.standing;
    const pct = n => `${n > 1 ? '+' : ''}${Math.round((n - 1) * 100)}%`;
    const bits = [`Goods ${pct(this.tradeMult || 1)}, offers ${pct(s.sell)}`];
    if (this.outlawMult > 1 || this.charmMult < 1) {
      if (this.outlawMult > 1) bits.push(`bounty ${pct(this.outlawMult)}`);
      if (this.charmMult < 1) bits.push('charm -10%');
    } else bits.push(`${s.reason || 'local standing'} (${s.value > 0 ? '+' : ''}${s.value})`);
    return bits.join(' / ');
  }

  _recordTrade(id, direction) {
    const st = S();
    rememberNPC(st, this.shop.npc, 'customer');
    noteDeed(st, { kind: 'trade', npcId: this.shop.npc, mapId: this.tradeMap?.id || st?.mapId, itemId: id, tags: [direction] });
  }

  _serviceRows() {
    const services = this._services();
    const out = [];
    for (const sv of services) {
      let disabled = false;
      let reason = '';
      if (sv.effect === 'revive' && !Party.all().some((m) => safe(() => isDead(m), false) || safe(() => isDown(m), false))) {
        disabled = true; reason = 'none fallen';
      }
      if (sv.effect === 'cure') {
        const any = Party.all().some((m) => arr(sv.conditions).some((c) => safe(() => hasCondition(m, c), false)));
        if (!any) { disabled = true; reason = 'nothing to cure'; }
      }
      if (sv.effect === 'heal' && Party.hpPct() >= 1) { disabled = true; reason = 'all hale'; }
      if (!disabled && !Party.canAfford(num(sv.cost, 0))) { disabled = true; reason = `${sv.cost} gp`; }
      out.push({ kind: 'service', id: sv.id, service: sv, price: num(sv.cost, 0), disabled, reason, limited: false, remaining: Infinity, owned: 0 });
    }
    return out;
  }

  _row() { return this.rows[this.index[this.tab]] || null; }

  // --- update ------------------------------------------------------------

  update(dt) {
    this.t += dt;
    if (this.msgT > 0) { this.msgT -= dt; if (this.msgT <= 0) { this.msg = null; this.msgBad = false; } }
    this._buildRows();

    if (this.prompt) { this._updatePrompt(); return; }

    // --- tabs -------------------------------------------------------------
    let tabChanged = false;
    for (let i = 0; i < TABS.length; i++) {
      if (Input.consume(`tab${i + 1}`) && this.tab !== i) { this.tab = i; tabChanged = true; }
    }
    if (Input.consume('prev')) { this.tab = (this.tab + TABS.length - 1) % TABS.length; tabChanged = true; }
    if (Input.consume('next')) { this.tab = (this.tab + 1) % TABS.length; tabChanged = true; }
    if (tabChanged) { this.qty = 1; sfx('cursor'); this._buildRows(); }

    // --- companion selector (the comparison subject) ----------------------
    if (Input.consume('party')) this._cycleMember(1);

    // --- list navigation --------------------------------------------------
    const n = this.rows.length;
    if (n) {
      if (Input.repeatConsume('up')) { this.index[this.tab] = (this.index[this.tab] + n - 1) % n; this.qty = 1; sfx('cursor'); }
      if (Input.repeatConsume('down')) { this.index[this.tab] = (this.index[this.tab] + 1) % n; this.qty = 1; sfx('cursor'); }
    }

    // --- quantity ---------------------------------------------------------
    const row = this._row();
    if (row && (this.tab === 0 || this.tab === 1)) {
      const maxQ = this._maxQty(row);
      if (Input.repeatConsume('left') && this.qty > 1) { this.qty--; sfx('cursor'); }
      if (Input.repeatConsume('right') && this.qty < maxQ) { this.qty++; sfx('cursor'); }
      this.qty = clamp(this.qty, 1, Math.max(1, maxQ));
    } else {
      // On the services tab left/right walks the companion strip instead.
      if (Input.consume('left')) this._cycleMember(-1);
      if (Input.consume('right')) this._cycleMember(1);
    }

    this._updateMouse();

    if (Input.consume('confirm')) this._activate();
    if (Input.consume('cancel') || Input.consume('menu')) this._close();
  }

  _cycleMember(delta) {
    const n = Party.members.length;
    if (n < 2) return;
    this.memberIndex = (this.memberIndex + delta + n) % n;
    this._cmp.clear();
    sfx('cursor');
  }

  _maxQty(row) {
    if (!row) return 1;
    if (row.kind === 'sell') return Math.max(1, row.owned);
    const afford = row.price > 0 ? Math.floor(Party.gold / row.price) : 99;
    const stock = Number.isFinite(row.remaining) ? row.remaining : 99;
    return clamp(Math.min(afford, stock, 99), 1, 99);
  }

  _updateMouse() {
    const m = Input.mouse;
    if (!m || !m.over) return;

    // tabs
    if (m.y >= TAB_Y && m.y < TAB_Y + 13) {
      const tw = Math.floor(396 / TABS.length);
      const i = clamp(Math.floor((m.x - 2) / tw), 0, TABS.length - 1);
      if (m.clicked) { m.clicked = false; if (this.tab !== i) { this.tab = i; this.qty = 1; sfx('cursor'); this._buildRows(); } }
      return;
    }

    // stock list rows
    const view = this._listView();
    if (m.x >= LX - 2 && m.x <= LX + LW + 2 && m.y >= LY && m.y < LY + LIST_ROWS * ROW_H) {
      const r = Math.floor((m.y - LY) / ROW_H);
      const i = view.top + r;
      if (i >= 0 && i < this.rows.length) {
        if (this.index[this.tab] !== i) { this.index[this.tab] = i; this.qty = 1; sfx('cursor'); }
        if (m.clicked) { m.clicked = false; this._activate(); }
      }
      return;
    }

    // companion strip inside the detail panel
    const strip = this._memberStrip();
    if (m.y >= strip.y && m.y < strip.y + strip.size) {
      for (let i = 0; i < Party.members.length; i++) {
        const bx = strip.x + i * (strip.size + strip.gap);
        if (m.x >= bx && m.x < bx + strip.size) {
          if (this.memberIndex !== i) { this.memberIndex = i; this._cmp.clear(); sfx('cursor'); }
          if (m.clicked) m.clicked = false;
          return;
        }
      }
    }
  }

  _updatePrompt() {
    const p = this.prompt;
    const n = p.options.length;
    if (Input.repeatConsume('left') || Input.repeatConsume('up')) { p.index = (p.index + n - 1) % n; sfx('cursor'); }
    if (Input.repeatConsume('right') || Input.repeatConsume('down')) { p.index = (p.index + 1) % n; sfx('cursor'); }

    const m = Input.mouse;
    const g = this._promptLayout(p);
    if (m && m.over && m.y >= g.by && m.y < g.by + 14) {
      for (let i = 0; i < n; i++) {
        const bx = g.x + 8 + i * (g.bw + 6);
        if (m.x >= bx && m.x < bx + g.bw) {
          if (p.index !== i) { p.index = i; sfx('cursor'); }
          if (m.clicked) { m.clicked = false; this._answer(p.index); return; }
        }
      }
    }
    if (Input.consume('confirm')) this._answer(p.index);
    if (Input.consume('cancel')) this._answer(-1);
  }

  _answer(i) {
    const p = this.prompt;
    this.prompt = null;
    if (!p) return;
    sfx(i < 0 ? 'back' : 'select');
    safe(() => p.onPick(i < 0 ? -1 : i));
  }

  _ask(title, body, options, onPick) {
    this.prompt = { title, body, options, index: 0, onPick };
    sfx('open');
  }

  // --- transactions ------------------------------------------------------

  _activate() {
    const row = this._row();
    if (!row) { sfx('error'); return; }
    if (this.refused) {
      sfx('error');
      this._say('"I said get out. Before I call the watch."', true);
      return;
    }
    if (this.tab === 0) this._buy(row);
    else if (this.tab === 1) this._sell(row);
    else this._service(row);
  }

  _buy(row) {
    if (row.disabled) {
      sfx('error');
      const d = this._daysToRestock();
      this._say(d != null ? `Sold out — more in ${d} day${d === 1 ? '' : 's'}.` : 'Sold out.', true);
      return;
    }
    const qty = clamp(this.qty, 1, this._maxQty(row));
    const total = row.price * qty;
    if (!Party.canAfford(total)) {
      sfx('error');
      this._say(`You are ${total - Party.gold} gp short.`, true);
      return;
    }
    Party.spendGold(total);
    // Bought stock is never a mystery: the label was on the shelf.
    Party.addItem(row.id, qty, { identified: true });
    if (row.limited) {
      const sold = this._shopState();
      sold[row.id] = num(sold[row.id], 0) + qty;
    }
    const st = S();
    if (st) st.stats.goldSpent = num(st.stats.goldSpent, 0) + total;
    this._recordTrade(row.id, 'buy');
    sfx('coin');
    this._cmp.clear();
    this._say(`${nameOf(row.id)}${qty > 1 ? ` ×${qty}` : ''} — ${goldText(total)}`, false);
    this.qty = 1;

    // Offer to put it straight on, which is the whole reason for the comparison.
    const member = this._member();
    const slot = member ? safe(() => defaultSlotFor(row.def, member), null) : null;
    if (member && slot) {
      this._ask('Equip now?', `${member.name} — ${nameOf(row.id)}`, ['Equip', 'Keep in pack'], (pick) => {
        if (pick !== 0) return;
        if (this._equipNow(member, row.id)) {
          sfx('equip');
          this._cmp.clear();
          this._say(`${member.name} equips ${nameOf(row.id)}.`, false);
        } else {
          sfx('error');
          this._say(`${member.name} cannot wield that.`, true);
        }
      });
    }
  }

  _sell(row) {
    if (row.disabled) { sfx('error'); this._say('That is not mine to buy.', true); return; }
    const qty = clamp(this.qty, 1, row.owned);
    const total = row.price * qty;
    const finish = () => {
      if (!Party.removeItem(row.id, qty)) { sfx('error'); return; }
      Party.addGold(total);
      const st = S();
      if (st) st.stats.goldEarned = num(st.stats.goldEarned, 0) + total;
      // A sold item fills depleted shelf space; it cannot overstock the shop.
      const sold = this._shopState();
      if (sold[row.id] > 0) sold[row.id] = Math.max(0, sold[row.id] - qty);
      this._recordTrade(row.id, 'sell');
      sfx('coin');
      this._cmp.clear();
      this.qty = 1;
      this._say(`Sold ${nameOf(row.id)}${qty > 1 ? ` ×${qty}` : ''} for ${goldText(total)}${row.premium ? ' (premium)' : ''}.`, false);
    };
    // Anything rare or better gets a second look before it leaves the pack —
    // and so does a plain but expensive suit of plate, because losing 600 gp of
    // armour to one stray keypress is not a mistake worth allowing.
    if (rarityRank(row.def) >= 2 || total >= 150) {
      this._ask('Sell this?', `${row.def.name} — ${rarityName(row.def)} — ${goldText(total)}`, ['Sell', 'Keep'], (pick) => {
        if (pick === 0) finish(); else this._say('Kept.', false, 1.2);
      });
      return;
    }
    finish();
  }

  _service(row) {
    const sv = row.service;
    if (row.disabled) { sfx('error'); this._say(row.reason ? `Not now — ${row.reason}.` : 'Not now.', true); return; }
    const cost = num(sv.cost, 0);
    this._ask(sv.name, `${cost > 0 ? goldText(cost) : 'No charge'} — ${this.shop.keeper}`, ['Accept', 'Decline'], (pick) => {
      if (pick !== 0) return;
      if (cost > 0 && !Party.spendGold(cost)) { sfx('error'); this._say('You cannot cover that.', true); return; }
      if (cost > 0) sfx('coin');
      const line = this._applyService(sv);
      this._cmp.clear();
      this._say(line, false, 4);
    });
  }

  _applyService(sv) {
    const st = S();
    switch (sv.effect) {
      case 'rest': {
        safe(() => Party.longRest());
        safe(() => Party.healAll());
        if (st) { safe(() => advanceTime(st, num(sv.minutes, 480))); st.stats.longRests = num(st.stats.longRests, 0) + 1; }
        sfx('heal');
        return 'The party sleeps sound and wakes whole.';
      }
      case 'heal': {
        safe(() => Party.healAll());
        sfx('heal');
        return 'Every wound closes. Lady Luck be thanked.';
      }
      case 'meal': {
        let fed = 0;
        for (const m of Party.members) {
          if (!m || m.hp <= 0) continue;
          const gain = Math.max(1, Math.floor(num(m.maxHp, 1) / 4));
          m.hp = Math.min(num(m.maxHp, 1), num(m.hp, 0) + gain);
          fed++;
        }
        sfx('potion');
        return `${fed} bowl${fed === 1 ? '' : 's'} of stew, and the fire is warm.`;
      }
      case 'cure': {
        let n = 0;
        for (const m of Party.all()) {
          for (const c of arr(sv.conditions)) {
            if (safe(() => hasCondition(m, c), false)) { safe(() => removeCondition(m, c)); n++; }
          }
        }
        sfx('buff');
        return n ? `${n} affliction${n === 1 ? '' : 's'} lifted.` : 'Nothing clung to you after all.';
      }
      case 'revive': {
        const fallen = Party.all().find((m) => safe(() => isDead(m), false)) || Party.all().find((m) => safe(() => isDown(m), false));
        if (!fallen) return 'No one here needs calling back.';
        safe(() => revive(fallen, Math.max(1, Math.floor(num(fallen.maxHp, 1) / 2))));
        safe(() => recalc(fallen));
        sfx('levelup');
        return `${fallen.name} draws breath again.`;
      }
      case 'identify': {
        let n = 0;
        // The temple's appraisal and the Identify spell write the same two
        // fields, so a thing named here stays named for the spellbook too.
        for (const e of arr(Party.inventory)) {
          if (e.identified && !e.unidentified) continue;
          e.identified = true; e.unidentified = false; n++;
        }
        sfx('spell');
        return n ? `${n} item${n === 1 ? '' : 's'} named and read.` : 'Nothing in your pack was a mystery.';
      }
      case 'repair': {
        let n = 0;
        for (const m of Party.all()) {
          for (const slot of Object.keys(m.equipment || {})) {
            const inst = m.equipment[slot];
            if (!inst) continue;
            const d = safe(() => itemDef(inst), null);
            if (inst.broken) { inst.broken = false; n++; }
            if (d && d.charges != null && num(inst.charges, d.charges) < d.charges) { inst.charges = d.charges; n++; }
          }
          safe(() => recalc(m));
        }
        sfx('equip');
        return n ? `${n} piece${n === 1 ? '' : 's'} of kit made good.` : 'Your gear was already sound.';
      }
      case 'appraise': {
        this.appraised = true;
        safe(() => toast('The Exchange rate is yours for a tenday.'));
        return 'Halia grades your haul and pays the honest rate.';
      }
      default:
        return 'It is done.';
    }
  }

  /** Move one unit from the shared pack onto a companion and equip it. */
  _equipNow(member, itemId) {
    if (!member) return false;
    if (!Party.removeItem(itemId, 1)) return false;
    const inst = safe(() => makeItemInstance(itemId), null);
    if (!inst) { Party.addItem(itemId, 1); return false; }
    member.inventory = arr(member.inventory);
    member.inventory.push(inst);
    const ok = safe(() => equip(member, inst, null), false);
    if (!ok) {
      const i = member.inventory.indexOf(inst);
      if (i >= 0) member.inventory.splice(i, 1);
      Party.addItem(itemId, 1);
      return false;
    }
    safe(() => recalc(member));
    return true;
  }

  _say(text, bad = false, seconds = 3) {
    if (!text) return;
    this.msg = String(text);
    this.msgBad = !!bad;
    this.msgT = seconds;
  }

  // --- comparison --------------------------------------------------------

  /**
   * Equip the candidate onto a throwaway clone and diff the derived stats, so
   * every delta shown is the number rules/character.js will actually produce.
   */
  _compare(member, itemId) {
    const key = `${member ? member.uid : '-'}|${itemId}`;
    if (this._cmp.has(key)) return this._cmp.get(key);
    const out = { slot: null, current: null, rows: [] };
    const d = def(itemId);
    if (member && d) {
      const slot = safe(() => defaultSlotFor(d, member), null);
      if (slot) {
        out.slot = slot;
        const held = member.equipment ? (member.equipment[slot] || (slot === 'offHand' ? member.equipment.shield : null)) : null;
        out.current = held ? safe(() => itemDef(held), null) : null;
        out.warning = proficiencyWarning(member, d);

        const test = safe(() => cloneChar(member), null);
        if (test) {
          const before = snapshot(member);
          const fitted = safe(() => {
            const inst = makeItemInstance(itemId);
            test.inventory = arr(test.inventory);
            test.inventory.push(inst);
            return equip(test, inst, null);
          }, false);
          if (fitted) {
            const after = snapshot(test);
            const row = (label, a, b, digits = 0, higherIsBetter = true) => {
              if (a == null && b == null) return;
              const av = num(a, 0);
              const bv = num(b, 0);
              const delta = bv - av;
              if (Math.abs(delta) < 0.05 && label !== 'AC' && label !== 'DMG') return;
              out.rows.push({
                label,
                from: digits ? av.toFixed(digits) : String(Math.round(av)),
                to: digits ? bv.toFixed(digits) : String(Math.round(bv)),
                delta,
                text: `${delta > 0 ? '+' : ''}${digits ? delta.toFixed(digits) : Math.round(delta)}`,
                good: higherIsBetter ? delta > 0 : delta < 0,
                bad: higherIsBetter ? delta < 0 : delta > 0,
              });
            };
            row('AC', before.ac, after.ac);
            row('ATK', before.atk, after.atk);
            row('DMG', before.dmgAvg, after.dmgAvg, 1);
            row('HP', before.hp, after.hp);
            row('SPD', before.spd, after.spd);
            row('INIT', before.init, after.init);
            out.after = after;
            out.before = before;
          } else {
            out.blocked = true;                 // wrong proficiency, no free hand, attunement full
          }
        }
      }
    }
    this._cmp.set(key, out);
    return out;
  }

  // --- draw --------------------------------------------------------------

  _listView() {
    const n = this.rows.length;
    let top = this.top[this.tab] | 0;
    const i = this.index[this.tab];
    if (i < top) top = i;
    if (i > top + LIST_ROWS - 1) top = i - LIST_ROWS + 1;
    top = clamp(top, 0, Math.max(0, n - LIST_ROWS));
    this.top[this.tab] = top;
    return { top, rows: LIST_ROWS };
  }

  _memberStrip() {
    return { x: DET_X + 7, y: D_STRIP, size: 16, gap: 4 };
  }

  draw(ctx) {
    ctx.fillStyle = UI.COLORS.bgDeep;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    this._drawHeader(ctx);
    MK.tabs(ctx, 2, TAB_Y, 396, TABS, this.tab, { h: 13 });
    this._drawList(ctx);
    this._drawDetail(ctx);
    this._drawFooter(ctx);
    if (this.prompt) this._drawPrompt(ctx);
  }

  _drawHeader(ctx) {
    const p = UI.panel(ctx, 2, HEAD_Y, 396, HEAD_H, { style: 'dark', shadow: 0.3 });
    // keeper bust
    const bs = 18;
    const bx = 5;
    const by = HEAD_Y + 3;
    ctx.fillStyle = '#16110d';
    ctx.fillRect(bx, by, bs, bs);
    UI.rectStroke(ctx, bx, by, bs, bs, UI.COLORS.border, 1);
    const k = this.keeperNpc;
    const art = !!(k && (k.appearance || (k.sprite && safe(() => hasSprite(k.sprite), false))));
    if (art) safe(() => drawActorBust(ctx, k, bx + 1, by + 1, bs - 2));
    else {
      UI.text(ctx, bx + bs / 2, by + 5, String(this.shop.keeper).charAt(0), {
        size: 'md', color: UI.COLORS.goldDim, align: 'center', shadow: true,
      });
    }

    UI.text(ctx, bx + bs + 5, HEAD_Y + 4, this.shop.name, {
      size: 'md', color: UI.COLORS.gold, shadow: true, maxWidth: 200,
    });
    UI.text(ctx, bx + bs + 5, HEAD_Y + 14, `${this.shop.keeper} / ${this.standing?.rank || 'Unknown'}`, {
      size: 'sm', color: UI.COLORS.inkDim, shadow: true, maxWidth: 200,
    });

    // purse
    UI.icon(ctx, 'coin', 336, HEAD_Y + 3, 9);
    UI.text(ctx, 394, HEAD_Y + 4, goldText(Party.gold), {
      size: 'md', color: UI.COLORS.goldBright, align: 'right', shadow: true,
    });
    const dr = this._daysToRestock();
    UI.text(ctx, 394, HEAD_Y + 14, dr != null ? `restock in ${dr}d` : `party lv ${Party.levelAvg()}`, {
      size: 'sm', color: UI.COLORS.inkDim, align: 'right', shadow: true,
    });
    void p;
  }

  _drawList(ctx) {
    UI.panel(ctx, LIST_X, CONTENT_Y, LIST_W, CONTENT_H, { style: 'window' });
    const view = this._listView();
    const sel = this.index[this.tab];

    if (!this.rows.length) {
      UI.text(ctx, LIST_X + LIST_W / 2, CONTENT_Y + 76, this._emptyText(), {
        size: 'sm', color: UI.COLORS.disabled, align: 'center', shadow: true, maxWidth: LW,
      });
      return;
    }

    UI.pushClip(ctx, LX - 3, LY - 1, LW + 6, LIST_ROWS * ROW_H + 2);
    for (let r = 0; r < LIST_ROWS; r++) {
      const i = view.top + r;
      const row = this.rows[i];
      if (!row) break;
      const ry = LY + r * ROW_H;
      const on = i === sel;
      if (on) UI.highlight(ctx, LX - 3, ry, LW + 6, ROW_H - 1, { alpha: row.disabled ? 0.10 : 0.22 });

      const label = row.kind === 'service' ? row.service.name : row.def.name;
      const ico = row.kind === 'service' ? (row.service.icon || 'star') : iconFor(row.def);
      UI.icon(ctx, ico, LX + 7, ry + 2, 9, row.disabled ? UI.COLORS.disabled : null);

      // price, right-aligned. Measured rather than given a flat 40px reserve:
      // "1g" is 11px, and the 29px difference is 5 characters of item name.
      const priceCol = row.disabled ? UI.COLORS.disabled
        : row.kind === 'sell' ? (row.premium ? UI.COLORS.goldBright : UI.COLORS.green)
          : Party.canAfford(row.price) ? UI.COLORS.gold : UI.COLORS.red;
      const priceTxt = row.price > 0 ? goldText(row.price) : 'free';
      const priceW = Math.min(safe(() => UI.measure(priceTxt, 'sm'), 24) || 24, 46);
      UI.text(ctx, LX + LW, ry + 3, priceTxt, {
        size: 'sm', color: priceCol, align: 'right', shadow: true, maxWidth: priceW,
      });

      // "have: N" (buy) / "×N" (sell) / stock remaining
      let mid = '';
      let midCol = UI.COLORS.inkDim;
      if (row.kind === 'buy') {
        if (row.disabled) { mid = 'sold out'; midCol = UI.COLORS.bad; }
        else if (Number.isFinite(row.remaining) && row.remaining <= 3) { mid = `${row.remaining} left`; midCol = UI.COLORS.warn; }
        else if (row.owned > 0) mid = `have ${row.owned}`;
      } else if (row.kind === 'sell') {
        mid = row.disabled ? row.reason : `×${row.owned}`;
        if (row.disabled) midCol = UI.COLORS.bad;
      } else if (row.disabled) { mid = row.reason; midCol = UI.COLORS.bad; }

      // The middle tag ("sold out", "nothing to cure", "have 3") was drawn
      // right-aligned with no maxWidth, so a long refusal walked left out of the
      // panel AND the name was billed for its full width — "nothing to cure"
      // (89px) left a service 33px of name, five characters. The tag takes at
      // most 42% of what the price leaves; the name keeps the rest.
      const rowW = LW - 19;
      const priceCell = priceW + 4;
      let midW = 0;
      if (mid) {
        const want = safe(() => UI.measure(mid, 'sm'), 40) || 40;
        const cap = Math.max(0, Math.round((rowW - priceCell) * 0.42));
        midW = Math.min(want, cap) + 5;
        UI.text(ctx, LX + LW - priceCell, ry + 3, mid, {
          size: 'sm', color: midCol, align: 'right', shadow: true, maxWidth: midW - 5,
        });
      }

      const nameCol = row.disabled ? UI.COLORS.disabled
        : row.kind === 'service' ? (on ? UI.COLORS.goldBright : UI.COLORS.ink)
          : colorOfItem(row.id, row.def);
      UI.text(ctx, LX + 19, ry + 3, label, {
        size: on ? 'md' : 'sm', color: nameCol, shadow: true,
        maxWidth: Math.max(20, rowW - priceCell - midW),
      });

      if (on && !row.disabled) UI.cursor(ctx, LX - 1, ry + 3, this.t);
    }
    UI.popClip(ctx);

    // scrollbar
    const n = this.rows.length;
    if (n > LIST_ROWS) {
      const bx = LX + LW + 2;
      const bh = LIST_ROWS * ROW_H;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(bx, LY, 3, bh);
      const th = Math.max(6, Math.round((LIST_ROWS / n) * bh));
      const ty = LY + Math.round(((bh - th) * view.top) / Math.max(1, n - LIST_ROWS));
      UI.vgrad(ctx, bx, ty, 3, th, UI.COLORS.gold, UI.COLORS.goldDim);
    }

    const dr = this._daysToRestock();
    const foot = this.tab === 2 ? `${n} services`
      : this.tab === 1 ? `${n} in the pack`
        : `${n} on the shelf${dr != null ? ` · restock ${dr}d` : ''}`;
    UI.text(ctx, LX + 1, LY + LIST_ROWS * ROW_H + 5, foot, {
      size: 'sm', color: UI.COLORS.inkDim, shadow: true, maxWidth: LW,
    });
  }

  _emptyText() {
    if (this.tab === 1) return 'Your pack is empty.';
    if (this.tab === 2) return 'No services offered here.';
    return 'The shelves are bare today.';
  }

  _drawDetail(ctx) {
    const p = UI.panel(ctx, DET_X, CONTENT_Y, DET_W, CONTENT_H, { style: 'window' });
    const ix = p.ix + 4;
    const iw = p.iw - 8;
    const row = this._row();
    if (!row) {
      UI.text(ctx, DET_X + DET_W / 2, CONTENT_Y + 80, 'Nothing selected', {
        size: 'sm', color: UI.COLORS.disabled, align: 'center', shadow: true,
      });
      return;
    }

    if (row.kind === 'service') this._drawServiceDetail(ctx, row, ix, iw);
    else this._drawItemDetail(ctx, row, ix, iw);
  }

  /** The item name, its rules text, then the live comparison. Fixed bands. */
  _drawItemDetail(ctx, row, ix, iw) {
    const d = row.def;

    UI.icon(ctx, iconFor(d), ix, D_TOP, 14, null);
    // "Amulet of Proof against Detection and Location" is 321px bold and 275px
    // small in a 166px slot, so a single line cannot hold the catalogue's long
    // tail whatever face it is set in. Bold when it fits, small when that is
    // enough, and two small lines when it is not — the rules band gives up its
    // last line for the second, which is the cheaper thing to lose. Knowing
    // WHAT is on the counter is the whole job of this panel.
    const nameStr = String(d.name || '');
    const nameW = iw - 18;
    const mw = safe(() => UI.measure(nameStr, 'md'), 999);
    const sw = safe(() => UI.measure(nameStr, 'sm'), 999);
    let extra = 0;
    if (mw <= nameW || sw <= nameW) {
      UI.text(ctx, ix + 18, D_TOP + 1, nameStr, {
        size: mw <= nameW ? 'md' : 'sm', color: colorOfItem(row.id, d), shadow: true, maxWidth: nameW,
      });
    } else {
      UI.textWrapped(ctx, ix + 18, D_TOP, nameW, nameStr, {
        size: 'sm', color: colorOfItem(row.id, d), shadow: true, maxLines: 2, lineHeight: 8,
      });
      extra = 8;
    }

    UI.text(ctx, ix, D_META + extra, `${titleCase(String(d.kind || 'item'))} · ${rarityName(d)}${d.weight ? ` · ${d.weight} lb` : ''}`, {
      size: 'sm', color: UI.COLORS.inkDim, shadow: true, maxWidth: iw,
    });
    UI.divider(ctx, ix, D_RULE + extra, iw);

    // --- rules text, then flavour, sharing a four-line band ----------------
    const stats = statLines(d);
    const infoTop = D_INFO + extra;
    const infoLines = D_INFO_LINES - (extra ? 1 : 0);
    let line = 0;
    for (const s of stats) {
      if (line >= infoLines) break;
      UI.text(ctx, ix, infoTop + line * 9, s, { size: 'sm', color: UI.COLORS.ink, shadow: true, maxWidth: iw });
      line++;
    }
    if (d.desc && line < infoLines) {
      UI.textWrapped(ctx, ix, infoTop + line * 9, iw, String(d.desc), {
        size: 'sm', color: UI.COLORS.inkDim, shadow: true, maxLines: infoLines - line,
      });
    }

    // --- comparison against what the companion is wearing right now --------
    const member = this._member();
    UI.divider(ctx, ix, D_CMP, iw, {
      label: member ? `vs ${member.name}` : 'no companion', size: 'sm', bg: '#231a13',
    });
    let cy = D_CMP_BODY;

    if (!member) {
      UI.text(ctx, ix, cy, 'No one to compare against.', { size: 'sm', color: UI.COLORS.disabled, shadow: true });
    } else {
      const cmp = this._compare(member, row.id);
      if (!cmp.slot) {
        UI.text(ctx, ix, cy, row.kind === 'sell' ? `Held: ${row.owned}` : 'Not equippable — goes in the pack.', {
          size: 'sm', color: UI.COLORS.inkDim, shadow: true, maxWidth: iw,
        });
      } else {
        UI.text(ctx, ix, cy, `${titleCase(cmp.slot.replace(/([A-Z])/g, ' $1'))}: ${cmp.current ? cmp.current.name : '(empty)'}`, {
          size: 'sm', color: cmp.current ? UI.COLORS.inkDim : UI.COLORS.disabled, shadow: true, maxWidth: iw,
        });
        cy += 10;
        const maxRows = Math.max(0, Math.floor((D_CMP_END - cy) / 9));
        if (cmp.blocked) {
          UI.text(ctx, ix, cy, `${member.name} cannot use this.`, { size: 'sm', color: UI.COLORS.bad, shadow: true, maxWidth: iw });
        } else if (!cmp.rows.length) {
          UI.text(ctx, ix, cy, 'No change to their numbers.', { size: 'sm', color: UI.COLORS.disabled, shadow: true, maxWidth: iw });
        } else {
          // One line kept back for the proficiency warning, when there is one.
          const budget = cmp.warning ? maxRows - 1 : maxRows;
          for (let i = 0; i < cmp.rows.length && i < budget; i++) {
            const r = cmp.rows[i];
            const col = r.good ? UI.COLORS.green : r.bad ? UI.COLORS.red : UI.COLORS.inkDim;
            UI.text(ctx, ix, cy, r.label, { size: 'sm', color: UI.COLORS.inkDim, shadow: true });
            UI.text(ctx, ix + 30, cy, `${r.from} → ${r.to}`, { size: 'sm', color: UI.COLORS.ink, shadow: true, maxWidth: 80 });
            UI.text(ctx, ix + iw, cy, r.text, { size: 'sm', color: col, align: 'right', shadow: true });
            cy += 9;
          }
        }
        // Anyone may buy plate; not everyone can wear it well.
        if (cmp.warning && cy <= D_CMP_END) {
          UI.text(ctx, ix, cy, `! ${cmp.warning}`, {
            size: 'sm', color: UI.COLORS.warn, shadow: true, maxWidth: iw,
          });
        }
      }
    }

    this._drawMemberStrip(ctx);
    this._drawPriceRow(ctx, row, ix, iw);
  }

  _drawServiceDetail(ctx, row, ix, iw) {
    const sv = row.service;
    UI.icon(ctx, sv.icon || 'star', ix, D_TOP, 14, null);
    UI.text(ctx, ix + 18, D_TOP + 1, sv.name, { size: 'md', color: UI.COLORS.gold, shadow: true, maxWidth: iw - 18 });
    UI.text(ctx, ix, D_META, `${this.shop.keeper} · ${sv.cost > 0 ? goldText(sv.cost) : 'no charge'}`, {
      size: 'sm', color: UI.COLORS.inkDim, shadow: true, maxWidth: iw,
    });
    UI.divider(ctx, ix, D_RULE, iw);
    UI.textWrapped(ctx, ix, D_INFO, iw, String(sv.desc || ''), {
      size: 'sm', color: UI.COLORS.ink, shadow: true, maxLines: D_INFO_LINES,
    });

    // Party health readout, so the value of a rest, a heal or a revivify is plain.
    UI.divider(ctx, ix, D_CMP, iw, { label: 'the party', size: 'sm', bg: '#231a13' });
    let cy = D_CMP_BODY;
    for (const m of Party.members.slice(0, 4)) {
      if (!m) continue;
      const maxHp = Math.max(1, num(m.maxHp, 1));
      const pct = clamp(num(m.hp, 0) / maxHp, 0, 1);
      // 62px is ten glyphs. An ellipsis in a name reads as a bug, so a name
      // that will not fit falls back to its first word instead of "Sildar Ha…".
      UI.text(ctx, ix, cy, shortName(m.name, 62), { size: 'sm', color: UI.COLORS.ink, shadow: true, maxWidth: 62 });
      UI.bar(ctx, ix + 66, cy + 1, iw - 108, 5, pct, { color: UI.COLORS.hp, bg: UI.COLORS.hpDark });
      UI.text(ctx, ix + iw, cy, `${Math.max(0, m.hp | 0)}/${maxHp}`, {
        size: 'sm', color: pct <= 0 ? UI.COLORS.bad : UI.COLORS.inkDim, align: 'right', shadow: true,
      });
      cy += 9;
    }
    if (row.disabled && row.reason) {
      UI.text(ctx, ix, D_STRIP + 4, `Unavailable — ${row.reason}.`, {
        size: 'sm', color: UI.COLORS.bad, shadow: true, maxWidth: iw,
      });
    }
    this._drawPriceRow(ctx, row, ix, iw);
  }

  _drawMemberStrip(ctx) {
    const strip = this._memberStrip();
    UI.text(ctx, strip.x, strip.y - 8, 'Compare', { size: 'sm', color: UI.COLORS.inkDim, shadow: true });
    for (let i = 0; i < Party.members.length && i < 4; i++) {
      const m = Party.members[i];
      const bx = strip.x + i * (strip.size + strip.gap);
      ctx.fillStyle = '#16110d';
      ctx.fillRect(bx, strip.y, strip.size, strip.size);
      UI.rectStroke(ctx, bx, strip.y, strip.size, strip.size, UI.COLORS.border, 1);
      const art = !!(m && (m.appearance || (m.sprite && safe(() => hasSprite(m.sprite), false))));
      if (art) safe(() => drawActorBust(ctx, m, bx + 1, strip.y + 1, strip.size - 2));
      else {
        UI.text(ctx, bx + strip.size / 2, strip.y + 4, String(m.name || '?').charAt(0), {
          size: 'sm', color: UI.COLORS.goldDim, align: 'center', shadow: true,
        });
      }
      if (i === this.memberIndex) UI.frameSel(ctx, bx - 1, strip.y - 1, strip.size + 2, strip.size + 2, this.t);
    }
    const sel = this._member();
    if (sel) {
      const w = DET_W - 4 * (strip.size + strip.gap) - 20;
      UI.text(ctx, strip.x + 4 * (strip.size + strip.gap) + 2, strip.y + 5, shortName(sel.name, w), {
        size: 'sm', color: UI.COLORS.gold, shadow: true, maxWidth: w,
      });
    }
  }

  _drawPriceRow(ctx, row, ix, iw) {
    const y = D_PRICE;
    UI.divider(ctx, ix, y, iw);
    const qty = this.tab === 2 ? 1 : clamp(this.qty, 1, this._maxQty(row));
    const total = row.price * qty;
    const afford = this.tab === 1 || Party.canAfford(total);

    // The unit price stops short of the quantity stepper at ix+66, and the
    // total stops short of the stepper's right end — a five-figure purse used
    // to print both straight through the ◀ ×2 ▶ control between them.
    const verb = this.tab === 0 ? 'Buy' : this.tab === 1 ? 'Sell' : 'Cost';
    UI.text(ctx, ix, y + 5, `${verb} ${goldText(row.price)}`, {
      size: 'sm', color: UI.COLORS.inkDim, shadow: true,
      maxWidth: this.tab === 2 ? iw - 60 : 62,
    });

    if (this.tab !== 2) {
      // ◀ 2 ▶ — left/right pick the quantity
      const qx = ix + 66;
      const maxQ = this._maxQty(row);
      UI.text(ctx, qx, y + 5, '◀', { size: 'sm', color: qty > 1 ? UI.COLORS.gold : UI.COLORS.disabled, shadow: true });
      UI.text(ctx, qx + 16, y + 5, `×${qty}`, { size: 'md', color: UI.COLORS.ink, align: 'center', shadow: true });
      UI.text(ctx, qx + 28, y + 5, '▶', { size: 'sm', color: qty < maxQ ? UI.COLORS.gold : UI.COLORS.disabled, shadow: true });
    }

    const totalW = this.tab === 2 ? iw - 60 : iw - 100;
    UI.text(ctx, ix + iw, y + 4, goldText(total), {
      size: 'md', color: afford ? (this.tab === 1 ? UI.COLORS.green : UI.COLORS.goldBright) : UI.COLORS.red,
      align: 'right', shadow: true, maxWidth: totalW,
    });
    if (!afford) {
      UI.text(ctx, ix + iw, y + 15, `${total - Party.gold} gp short`, {
        size: 'sm', color: UI.COLORS.red, align: 'right', shadow: true, maxWidth: iw - 4,
      });
    } else if (row.marketCapped) {
      UI.text(ctx, ix + iw, y + 15, 'Offer capped at market price', {
        size: 'sm', color: UI.COLORS.inkDim, align: 'right', shadow: true, maxWidth: iw - 4,
      });
    } else if (row.premium) {
      UI.text(ctx, ix + iw, y + 15, 'Exchange premium', {
        size: 'sm', color: UI.COLORS.goldBright, align: 'right', shadow: true, maxWidth: iw - 4,
      });
    }
  }

  _drawFooter(ctx) {
    UI.panel(ctx, 2, FOOT_Y, 396, FOOT_H, { style: 'dark', shadow: 0.25 });
    const text = this.msg || (this.tab === 2 ? 'Fixed service fees. Standing changes goods and offers only.' : this.terms) || this.shop.greeting;
    UI.text(ctx, 8, FOOT_Y + 4, text, {
      size: 'sm', color: this.msg ? (this.msgBad ? UI.COLORS.red : UI.COLORS.goldBright) : UI.COLORS.inkDim,
      shadow: true, maxWidth: 388,
    });
    // Key names must match core/input.js: prev=Q next=R party=Tab.
    const hint = this.tab === 2
      ? 'Z accept   X leave   Q/R tabs   TAB companion'
      : 'Z confirm   X leave   ◀▶ quantity   Q/R tabs   TAB companion';
    UI.text(ctx, 8, FOOT_Y + 13, hint, {
      size: 'sm', color: UI.COLORS.disabled, shadow: true, maxWidth: 388,
    });
  }

  _promptLayout(p) {
    const w = 184;
    const h = 66;
    const x = Math.round((VIEW_W - w) / 2);
    const y = Math.round((VIEW_H - h) / 2) - 6;
    const bw = Math.floor((w - 16 - (p.options.length - 1) * 6) / p.options.length);
    return { x, y, w, h, bw, by: y + h - 20 };
  }

  _drawPrompt(ctx) {
    const p = this.prompt;
    UI.scrim(ctx, 0.5);
    const g = this._promptLayout(p);
    UI.panel(ctx, g.x, g.y, g.w, g.h, { style: 'gold', shadow: 0.5 });
    UI.text(ctx, g.x + g.w / 2, g.y + 7, p.title, {
      size: 'md', color: '#2a1c07', align: 'center', shadow: 'rgba(255,235,180,0.35)', maxWidth: g.w - 12,
    });
    UI.textWrapped(ctx, g.x + 8, g.y + 20, g.w - 16, String(p.body || ''), {
      size: 'sm', color: '#3a2a10', align: 'center', shadow: false, maxLines: 2,
    });
    for (let i = 0; i < p.options.length; i++) {
      const bx = g.x + 8 + i * (g.bw + 6);
      UI.button(ctx, bx, g.by, g.bw, 14, p.options[i], { selected: i === p.index, t: this.t });
    }
  }
}

export default ShopScene;
