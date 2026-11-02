// ui/menus.js — every screen the player opens from the pause menu: the character
// sheet, the shared pack, the spellbook, the journal, the regional map, the
// settings, the bestiary and the five save journals.
//
// House rules for this file:
//   * ALL drawing goes through ui/kit.js UI.* — never ctx.fillText, never ctx.font.
//   * Every screen is fully navigable from the keyboard/gamepad AND clickable.
//   * Nothing here may throw because a catalogue another agent is still writing is
//     missing: optional catalogues are read through safe() and soft dynamic imports.
//   * 400x240 logical pixels. Draw on integers. Never let text leave its panel.

import { UI } from './kit.js';
import { MK } from './menukit.js';
import { GILT } from './ornament.js';
import { planCanvas } from './hudmap.js';
import { Input } from '../core/input.js';
import { Audio } from '../core/audio.js';
import { Save } from '../core/save.js';
import { Game } from '../engine.js';
import { FX } from '../render/fx.js';
import { Stage } from '../render/stage.js';
import { journeyInfo } from '../render/journey.js';
import { Layout } from './layout.js';
import { TRACKS, TRACK_GROUPS } from '../core/music.js';
import {
  VIEW_W, VIEW_H, clamp, signed, ordinal, titleCase, playtimeText, plural,
  dateText, EQUIP_SLOTS, SLOT_NAMES, RARITY, PARTY_MAX, crText,
} from '../constants.js';
import { bus, EV, toast } from '../core/events.js';
import { rollExpr, avgExpr } from '../core/dice.js';
import { drawSprite, hasSprite, spriteFrames, spriteSize } from '../render/sprites.js';
import { ABILITIES, ABILITY_NAMES, ABILITY_ABBR, SKILLS, SKILL_IDS } from '../rules/abilities.js';
import {
  abilityScore, abilityMod, profBonus, skillMod, saveMod, acOf, maxHpOf, speedOf,
  initiativeMod, passivePerception, allFeatures, mechOf, weaponsOf, equip, unequip,
  makeItemInstance, itemDef, equipped, cloneChar, recalc, heal, addTempHp, addEffect,
  isDown, isDead, hitDiceTotal, serializeChar, deserializeChar, masteryInfo,
} from '../rules/character.js';
import {
  spellDC, spellAtk, preparedMax, knownSpells, canPrepare, isPreparedCaster,
  alwaysPreparedSpells, isConcentrating, casterLevel,
} from '../rules/spellcasting.js';
import {
  CONDITIONS, activeConditions, conditionText, removeCondition, exhaustionLevel,
} from '../rules/conditions.js';
import { className, subclassName, xpToNext, xpProgress } from '../rules/progression.js';
import { fieldCastable, fieldCast, fieldTargeting } from '../rules/fieldcast.js';
import { travelSites } from '../rules/fieldworld.js';
import { chronicle, chronicleEntries } from '../rules/worlddirector.js';
import { Party } from '../world/party.js';
import {
  saveState, loadState, stateSummary, advanceTime, timeInfo, REP_RANKS, repRank,
} from '../state.js';
import {
  SPELLS, SCHOOLS, rangeText, componentText, spellDamageDice, spellHealDice,
} from '../data/spells.js';
import { resolveItem, rarityColor, weaponLine, armorLine, slotFor, isMagic } from '../data/items.js';
import { MONSTERS, MONSTER_IDS, statLine, xpOf } from '../data/monsters.js';
import { CheatsScene } from './cheatmenu.js';

// ===========================================================================
// 0. SAFETY & SHORTHANDS
// ===========================================================================

const C = UI.COLORS;
const RUBRIC_HI = '#d8503a';

function safe(fn, fb) {
  try { const v = fn(); return v === undefined || v === null ? fb : v; } catch (e) { return fb; }
}
function sfx(name) { safe(() => Audio.sfx(name), false); }
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const arr = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);
const S = () => Game.state || null;
const R = (n) => Math.round(n) | 0;

/** Modules other agents are still writing. A missing one must never throw. */
const LATE = {};
function softImport(path, key) {
  if (LATE[key] !== undefined && LATE[key] !== null) return Promise.resolve(LATE[key] || null);
  return import(/* @vite-ignore */ path)
    .then((m) => { LATE[key] = m || false; return m || null; })
    .catch(() => { LATE[key] = false; return null; });
}
// Kick the optional catalogues off at load; every reader falls back gracefully.
safe(() => softImport('../data/quests.js', 'quests'));
safe(() => softImport('../data/npcs.js', 'npcs'));
safe(() => softImport('../data/tables.js', 'tables'));
safe(() => softImport('../world/maps.js', 'maps'));
safe(() => softImport('../data/species.js', 'species'));

const QUESTS = () => (LATE.quests && LATE.quests.QUESTS) || {};
const NPCS = () => (LATE.npcs && LATE.npcs.NPCS) || {};
const TABLES = () => LATE.tables || {};
const SPECIES = () => (LATE.species && LATE.species.SPECIES) || {};

// --- text helpers ----------------------------------------------------------

function txt(ctx, x, y, s, opts) { return UI.text(ctx, R(x), R(y), s, opts || {}); }
function txtR(ctx, x, y, s, opts) { return UI.text(ctx, R(x), R(y), s, { ...(opts || {}), align: 'right' }); }
function txtC(ctx, x, y, s, opts) { return UI.text(ctx, R(x), R(y), s, { ...(opts || {}), align: 'center' }); }

/**
 * A dim label on the left, a bright value hard against the right edge.
 *
 * This used to right-align the value with NO `maxWidth`, so a value wider than
 * the column started at `x + w - vw` — outside the panel. "Neverwinter —
 * Protector's Enclave" is 197px in a 106px column: it printed 91px clear of
 * the info pane and straight across the pause menu's option list, while the
 * `Math.max(8, …)` floor left the "Location" label with 8px, which `fitText`
 * could not honour, so the label vanished too. UI.kvRow does the arithmetic
 * once, for every caller, and guarantees label + value + gap <= w.
 */
function kv(ctx, x, y, w, label, value, opts = {}) {
  return UI.kvRow(ctx, R(x), R(y), w, label, value, {
    size: 'sm',
    valueSize: opts.size || 'sm',
    color: opts.color || C.ink,
    labelColor: opts.labelColor || C.inkDim,
    valueMax: opts.valueMax,
    labelMax: opts.labelMax,
    gap: opts.gap,
  });
}

/**
 * A section's rubric in the 9px slot a screen set in sm gives it: spaced fine
 * capitals in gold with a hairline out to the edge (menukit), sat low in the
 * slot so it hangs over the rows it names.
 */
function sectionHead(ctx, x, y, w, label, color) {
  MK.section(ctx, x, y + 1.5, w, label, color ? { color } : {});
  return y + 9;
}
/** The same in the fine face: a rubric in spaced capitals, for screens set in fine. */
function rubric(ctx, x, y, w, label, color) {
  MK.section(ctx, x, y, w, label, color ? { color } : {});
  return y + 8;
}

// --- key prompts -----------------------------------------------------------

const KEY_LABEL = {
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Enter: 'ENT', NumpadEnter: 'ENT', Space: 'SPC', Escape: 'ESC', Backspace: 'BSP',
  ShiftLeft: 'SHF', ShiftRight: 'SHF', Tab: 'TAB', Backquote: 'TIL',
  ControlLeft: 'CTL', ControlRight: 'CTL', AltLeft: 'ALT', AltRight: 'ALT',
  Minus: '-', Equal: '=', Comma: ',', Period: '.', Slash: '/', Semicolon: ';',
  BracketLeft: '[', BracketRight: ']',
};
function codeLabel(code) {
  if (!code) return '—';
  if (KEY_LABEL[code]) return KEY_LABEL[code];
  const s = String(code);
  if (s.indexOf('Key') === 0) return s.slice(3);
  if (s.indexOf('Digit') === 0) return s.slice(5);
  if (s.indexOf('Numpad') === 0) return `N${s.slice(6)}`;
  if (/^F\d{1,2}$/.test(s)) return s;
  return s.slice(0, 4).toUpperCase();
}
function keyFor(action) {
  const list = safe(() => Input.bindings[action], null) || [];
  return codeLabel(list[0]);
}

// One vertical rhythm for every screen: content ends at 210, the transient
// status line sits on 212, and the key strip owns everything from 220 down.
const CONTENT_BOTTOM = 210;
const MSG_Y = 212;
const HINT_Y = 224;

/** The strip of [KEY] Label prompts along the foot of every screen (menukit). */
function hintBar(ctx, y, hints, right) {
  MK.keys(ctx, hints, { y: R(y) + 2, right });
}

// --- pointer ---------------------------------------------------------------

function hit(m, x, y, w, h) {
  return !!m && m.over !== false && m.x >= x && m.x < x + w && m.y >= y && m.y < y + h;
}
/** True once, and swallows the click so two widgets never both fire on it. */
function clicked(m, x, y, w, h) {
  if (hit(m, x, y, w, h) && m.clicked) { m.clicked = false; return true; }
  return false;
}
function wheelOver(m, x, y, w, h) {
  if (!hit(m, x, y, w, h)) return 0;
  const v = num(m.wheel, 0);
  if (!v) return 0;
  m.wheel = 0;
  return v > 0 ? 1 : -1;
}

// --- navigation ------------------------------------------------------------

function navV(cur, len, opts = {}) {
  if (len <= 0) return 0;
  let i = clamp(num(cur, 0) | 0, 0, len - 1);
  const wrap = opts.wrap !== false;
  if (Input.repeatConsume('up')) { i = wrap ? (i - 1 + len) % len : Math.max(0, i - 1); sfx('cursor'); }
  if (Input.repeatConsume('down')) { i = wrap ? (i + 1) % len : Math.min(len - 1, i + 1); sfx('cursor'); }
  return i;
}
function navH(cur, len, opts = {}) {
  if (len <= 0) return 0;
  let i = clamp(num(cur, 0) | 0, 0, len - 1);
  const wrap = opts.wrap !== false;
  if (Input.repeatConsume('left')) { i = wrap ? (i - 1 + len) % len : Math.max(0, i - 1); sfx('cursor'); }
  if (Input.repeatConsume('right')) { i = wrap ? (i + 1) % len : Math.min(len - 1, i + 1); sfx('cursor'); }
  return i;
}
/** prev/next (Q and R by default) — used everywhere to page tabs or sections. */
function navPage(cur, len) {
  if (len <= 0) return 0;
  let i = clamp(num(cur, 0) | 0, 0, len - 1);
  if (Input.consume('prev')) { i = (i - 1 + len) % len; sfx('cursor'); }
  if (Input.consume('next')) { i = (i + 1) % len; sfx('cursor'); }
  return i;
}
/** Which tabN action fired this frame, or -1. */
function tabPressed(max = 5) {
  for (let i = 1; i <= max; i++) if (Input.consume(`tab${i}`)) return i - 1;
  return -1;
}
/** Run + up/down scrolls a text pane without disturbing the list cursor. */
function scrollPane(cur, max, m, rect) {
  let v = clamp(num(cur, 0), 0, Math.max(0, max));
  if (Input.down('run')) {
    if (Input.repeatConsume('up')) v = Math.max(0, v - 1);
    if (Input.repeatConsume('down')) v = Math.min(Math.max(0, max), v + 1);
  }
  if (rect) {
    const w = wheelOver(m, rect.x, rect.y, rect.w, rect.h);
    if (w) v = clamp(v + w * 2, 0, Math.max(0, max));
  }
  return v;
}
/** True when the list cursor should move (i.e. Run is not stealing up/down). */
const listNavActive = () => !Input.down('run');

// --- character helpers -----------------------------------------------------

function hpColor(ch) {
  const max = maxHpOf(ch);
  const p = max > 0 ? num(ch && ch.hp, 0) / max : 0;
  if (p <= 0) return C.disabled;
  if (p < 0.25) return C.red;
  if (p < 0.6) return C.warn;
  return C.hp;
}
function classText(ch) {
  const cl = arr(ch && ch.classes);
  if (!cl.length) return 'Adventurer';
  return cl.map((c) => `${safe(() => className(c.id), null) || titleCase(String(c.id || ''))} ${c.level || 1}`).join('/');
}
function subclassText(ch) {
  const c = arr(ch && ch.classes)[0];
  if (!c || !c.subclassId) return '';
  return safe(() => subclassName(c.subclassId), null) || titleCase(String(c.subclassId).replace(/-/g, ' '));
}
function speciesText(ch) {
  if (!ch) return '—';
  const sp = SPECIES()[ch.speciesId] || null;
  const base = (sp && sp.name) || titleCase(String(ch.speciesId || 'folk').replace(/-/g, ' '));
  if (!ch.lineageId) return base;
  const lin = sp && arr(sp.lineages).find((l) => l && l.id === ch.lineageId);
  return `${base} · ${(lin && lin.name) || titleCase(String(ch.lineageId).replace(/-/g, ' '))}`;
}

function itemIcon(d) {
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
    case 'gloves': return 'armor';
    case 'helm': return 'helm';
    case 'gem': return 'gem';
    case 'ammo': return 'bow';
    case 'tool': return 'hammer';
    case 'food': return 'flask';
    case 'quest': return 'quest';
    case 'material': return 'rune';
    default: return 'bag';
  }
}
function itemColor(id, d) {
  return safe(() => rarityColor(id), null) || (RARITY[(d && d.rarity) || 'common'] || {}).color || C.ink;
}
function itemName(id, d) {
  return (d && d.name) || titleCase(String(id || '').replace(/-/g, ' '));
}

/**
 * What an unidentified find is called before anybody names it. The kind is
 * obvious by looking — a ring is a ring — so that is all the label gives away.
 */
const UNKNOWN_NAMES = {
  weapon: 'An Unfamiliar Blade', armor: 'Strange Armour', shield: 'A Marked Shield',
  potion: 'An Unlabelled Vial', scroll: 'A Sealed Scroll', wand: 'A Carved Wand',
  ring: 'A Plain Ring', amulet: 'A Dull Amulet', cloak: 'A Heavy Cloak',
  boots: 'Well-Worn Boots', gloves: 'Odd Gloves', helm: 'A Battered Helm',
  rod: 'A Black Rod', staff: 'A Knotted Staff', gem: 'An Uncut Stone',
};
function unknownName(d) {
  return UNKNOWN_NAMES[String((d && d.kind) || '')] || 'Something Enchanted';
}
function rarityName(d) {
  return (RARITY[(d && d.rarity) || 'common'] || {}).name || 'Common';
}
const goldText = (n) => `${Math.round(num(n, 0))} gp`;

/** Carrying capacity for the whole party: Strength x 15 per member. */
function partyCapacity() {
  let cap = 0;
  for (const m of Party.members) {
    const str = num(safe(() => abilityScore(m, 'str'), 10), 10);
    const mult = num(safe(() => mechOf(m).carryMult, 1), 1) || 1;
    cap += str * 15 * mult;
  }
  return Math.max(30, Math.round(cap));
}
function packWeight() {
  let w = 0;
  for (const e of arr(Party.inventory)) {
    const d = safe(() => resolveItem(e.id), null);
    w += num(d && d.weight, 0) * num(e.qty, 1);
  }
  return Math.round(w * 10) / 10;
}

/** Portrait + name + HP, the cell every roster row and member tab is built from. */
function drawMemberCell(ctx, ch, x, y, w, h, opts = {}) {
  const sel = !!opts.selected;
  const ps = Math.min(h - 4, 22);
  safe(() => UI.portrait(ctx, ch, x + 2, y + 2, ps, { shadow: 0.25 }));
  const tx = x + ps + 6;
  const tw = Math.max(10, w - (ps + 10));
  const down = safe(() => isDown(ch), false);
  txt(ctx, tx, y + 3, ch && ch.name ? ch.name : 'Empty', {
    size: sel ? 'md' : 'sm', color: down ? C.bad : (sel ? C.goldBright : C.ink),
    shadow: true, maxWidth: tw,
  });
  if (h >= 22) {
    const hp = Math.max(0, num(ch && ch.hp, 0));
    const max = Math.max(1, maxHpOf(ch));
    UI.bar(ctx, tx, y + 12, Math.min(tw, 52), 3, hp / max, { color: hpColor(ch), id: `menu-hp-${ch && ch.uid}` });
    MK.text(ctx, tx, y + 17, `${hp}/${max} hp`, { color: C.inkDim, maxWidth: tw });
    MK.text(ctx, x + w - 3, y + 17, `Lv ${num(ch && ch.level, 1)} ${String(safe(() => classText(ch), '')).replace(/ \d+/g, '')}`, {
      color: C.goldDim, align: 'right', maxWidth: Math.max(10, tw - 30),
    });
  }
}

// ===========================================================================
// 1. BASE SCENE — prompts, transient messages, floaters
// ===========================================================================

class MenuScene {
  constructor(id) {
    this.id = id;
    this.opaque = true;
    this.pausesBelow = true;
    this.uiLayer = true;      // weather and day/night grading stop below this
    this.t = 0;
    this.prompt = null;       // { title, body, options, index, onPick, rects }
    this.msg = '';
    this.msgT = 0;
    this.msgBad = false;
    this.floats = [];         // local floaters, in screen pixels
    this._closing = false;
  }

  enter() { safe(() => Input.flush()); this._closing = false; }
  exit() {}

  /** Advance timers. Returns true when a modal prompt swallowed this frame. */
  tick(dt) {
    this.t += num(dt, 0);
    if (this.msgT > 0) { this.msgT -= dt; if (this.msgT <= 0) this.msg = ''; }
    for (let i = this.floats.length - 1; i >= 0; i--) {
      this.floats[i].t += dt;
      if (this.floats[i].t > 1.1) this.floats.splice(i, 1);
    }
    if (this.prompt) { this._updatePrompt(); return true; }
    return false;
  }

  say(text, bad = false, life = 3.2) {
    this.msg = String(text == null ? '' : text);
    this.msgBad = !!bad;
    this.msgT = life;
    if (bad) sfx('error');
  }

  float(x, y, text, color) {
    this.floats.push({ x: R(x), y: R(y), text: String(text), color: color || C.hpHeal, t: 0 });
  }

  /** options: strings, or { label, value, disabled, color }. */
  ask(title, body, options, onPick) {
    this.prompt = {
      title: title || '',
      body: body || '',
      options: arr(options).map((o) => (typeof o === 'string' ? { label: o, value: o } : o)).filter(Boolean),
      index: 0,
      onPick: typeof onPick === 'function' ? onPick : null,
      rects: [],
    };
    sfx('open');
  }

  _updatePrompt() {
    const p = this.prompt;
    p.index = navV(p.index, p.options.length);
    const m = Input.mouse;
    for (let i = 0; i < (p.rects || []).length; i++) {
      const r = p.rects[i];
      if (hit(m, r.x, r.y, r.w, r.h)) {
        if (p.index !== i) { p.index = i; sfx('cursor'); }
        if (clicked(m, r.x, r.y, r.w, r.h)) { this._pick(); return; }
      }
    }
    if (Input.consume('confirm')) { this._pick(); return; }
    if (Input.consume('cancel')) {
      sfx('back');
      const cb = p.onPick;
      this.prompt = null;
      if (cb) cb(null, -1);
    }
  }

  _pick() {
    const p = this.prompt;
    const o = p.options[p.index];
    if (!o || o.disabled) { sfx('error'); return; }
    sfx('select');
    const cb = p.onPick;
    this.prompt = null;
    if (cb) cb(o.value !== undefined ? o.value : o.label, p.index);
  }

  drawPrompt(ctx) {
    const p = this.prompt;
    if (!p) return;
    UI.scrim(ctx, 0.52);
    const lines = p.body ? UI.wrapLines(p.body, 208, 'sm') : [];
    const h = 16 + lines.length * 9 + p.options.length * 14 + 8;
    const w = 240;
    const x = R((VIEW_W - w) / 2);
    const y = clamp(R((VIEW_H - h) / 2), 12, Math.max(12, VIEW_H - h - 6));
    UI.window(ctx, x, y, w, h, p.title, { style: 'window' });
    let ty = y + 7;
    for (const l of lines) { txt(ctx, x + 12, ty, l, { size: 'sm', color: C.ink, shadow: true }); ty += 9; }
    ty += 4;
    p.rects = [];
    p.options.forEach((o, i) => {
      const bw = w - 40, bx = x + 20, by = ty + i * 14;
      UI.button(ctx, bx, by, bw, 12, o.label, {
        selected: i === p.index, disabled: !!o.disabled, t: this.t, color: o.color || null,
      });
      p.rects.push({ x: bx, y: by, w: bw, h: 12 });
    });
  }

  drawMessage(ctx, x, y, w) {
    if (!this.msg) return;
    MK.text(ctx, x, y + 1, this.msg, {
      size: 'fineb', color: this.msgBad ? C.bad : C.goldBright, shadow: 'rgba(0,0,0,0.85)',
      maxWidth: w, alpha: clamp(this.msgT / 0.5, 0, 1),
    });
  }

  /**
   * For screens with no spare row (the spellbook's slot pips, the map's legend):
   * the status line rides the right-hand end of the key strip. Call it AFTER
   * hintBar so it draws on top of the strip.
   */
  drawStatusRight(ctx) {
    if (!this.msg) return;
    MK.text(ctx, VIEW_W - 6, HINT_Y + 7.5, this.msg, {
      size: 'fineb', color: this.msgBad ? C.bad : C.goldBright, align: 'right',
      maxWidth: 186, alpha: clamp(this.msgT / 0.5, 0, 1),
    });
  }

  drawFloats(ctx) {
    for (const f of this.floats) {
      const p = f.t / 1.1;
      txtC(ctx, f.x, f.y - p * 16, f.text, { size: 'md', color: f.color, outline: true, alpha: 1 - p * p });
    }
  }

  close(result) {
    if (this._closing) return;
    this._closing = true;
    sfx('back');
    if (Game.top === this) Game.pop(result);
  }
}

// ===========================================================================
// 2. PAUSE MENU
// ===========================================================================

const PAUSE_ITEMS = [
  { id: 'party', label: 'Party', icon: 'helm', key: 1, desc: 'Character sheets: ability scores, features, gear, conditions and every attack each companion can make.' },
  { id: 'inventory', label: 'Inventory', icon: 'bag', key: 2, desc: 'The party pack. Use, equip, hand over or drop what you are hauling around the Sword Coast.' },
  { id: 'spells', label: 'Spells', icon: 'book', key: 3, desc: 'Prepare spells against your class cap, spend slots, and read exactly what each one does.' },
  { id: 'journal', label: 'Journal', icon: 'scroll', key: 4, desc: 'Quests, faction contracts, standing with the five factions, and the Realms lore you have gathered.' },
  { id: 'map', label: 'Map', icon: 'map', key: 5, desc: 'The ground you have walked, the roads out of it, and the way back to a town you have found.' },
  { id: 'camp', label: 'Camp', icon: 'flame', key: 0, desc: 'Take a short rest and spend Hit Dice, or a long rest to recover everything — if the ground is safe enough.' },
  { id: 'bestiary', label: 'Bestiary', icon: 'skull', key: 0, desc: 'Stat blocks for every creature the party has put down, with kill counts.' },
  { id: 'save', label: 'Save', icon: 'quest', key: 0, desc: 'Write the tale so far into one of five journals.' },
  { id: 'settings', label: 'Settings', icon: 'anvil', key: 0, desc: 'Volume, text and battle speed, difficulty, accessibility and the keys you press.' },
  { id: 'cheats', label: 'Cheats', icon: 'wand', key: 0, desc: 'The testing trapdoor: invulnerability, free spells, gold, levels and a revealed map. Not a game feature — the wand marks it as the workshop door.' },
  { id: 'quit', label: 'Quit to Title', icon: 'key', key: 0, desc: 'Return to the title screen. Anything you have not written into a journal is lost.' },
];

/** Biomes where you cannot safely sleep for eight hours. */
const NO_LONG_REST = ['dungeon', 'cave', 'crypt', 'mine', 'underdark'];

function currentMap() {
  const stack = arr(Game.scenes);
  for (let i = stack.length - 1; i >= 0; i--) {
    const s = stack[i];
    if (!s) continue;
    const m = s.map || s.tilemap || (s.world && s.world.map) || null;
    if (m && (m.w || m.width)) return m;
  }
  return safe(() => Game.map, null) || null;
}

function restInfo() {
  const map = currentMap();
  const st = S();
  const biome = (map && map.biome) || (st && st.biome) || 'road';
  const indoor = !!(map && map.indoor);
  const town = !!(map && (map.kind === 'town' || map.kind === 'inn')) || biome === 'city';
  const hostile = NO_LONG_REST.indexOf(biome) >= 0 && !map?.cleared;
  return {
    place: (map && map.name) || (st && st.mapId) || 'the road',
    canShort: true,
    canLong: !hostile,
    safe: indoor || town,
    reason: hostile
      ? 'Not down here. Find the surface, or clear the level first.'
      : (indoor || town ? '' : 'Camping in the open invites company.'),
  };
}

export class PauseMenuScene extends MenuScene {
  constructor(opts = {}) {
    super('pause');
    this.opaque = false;          // the overworld keeps drawing beneath us
    this.pausesBelow = true;
    this.opts = opts || {};
    this.index = 0;
    this.rest = null;             // { spend:{uid:n}, index } while allocating Hit Dice
    this.rects = [];
  }

  enter(prev) {
    super.enter(prev);
    this.rest = null;
  }

  update(dt) {
    if (this.tick(dt)) return;
    if (this.rest) { this._updateRest(); return; }

    const n = PAUSE_ITEMS.length;
    if (listNavActive()) this.index = navV(this.index, n);

    // Number keys and the dedicated action keys jump straight in.
    const tp = tabPressed(5);
    if (tp >= 0) { this.index = tp; this._activate(PAUSE_ITEMS[tp].id); return; }
    if (Input.consume('party')) { this._activate('party'); return; }
    if (Input.consume('inventory')) { this._activate('inventory'); return; }
    if (Input.consume('journal')) { this._activate('journal'); return; }
    if (Input.consume('map')) { this._activate('map'); return; }

    const m = Input.mouse;
    for (let i = 0; i < this.rects.length; i++) {
      const r = this.rects[i];
      if (hit(m, r.x, r.y, r.w, r.h)) {
        if (this.index !== i) { this.index = i; sfx('cursor'); }
        if (clicked(m, r.x, r.y, r.w, r.h)) { this._activate(PAUSE_ITEMS[i].id); return; }
      }
    }

    if (Input.consume('confirm')) { this._activate(PAUSE_ITEMS[this.index].id); return; }
    if (Input.consume('cancel') || Input.consume('menu')) this.close();
  }

  // --- actions ------------------------------------------------------------

  _activate(id) {
    sfx('select');
    switch (id) {
      case 'party': Game.push(new PartyScene()); break;
      case 'inventory': Game.push(new InventoryScene()); break;
      case 'spells': Game.push(new SpellbookScene()); break;
      case 'journal': Game.push(new JournalScene()); break;
      case 'map': Game.push(new MapScene()); break;
      case 'bestiary': Game.push(new BestiaryScene()); break;
      case 'save': Game.push(new SaveMenuScene('save')); break;
      case 'settings': Game.push(new OptionsScene()); break;
      case 'cheats': Game.push(new CheatsScene()); break;
      case 'camp': this._camp(); break;
      case 'quit': this._quit(); break;
      default: break;
    }
  }

  _camp() {
    const info = restInfo();
    const body = info.reason || `You are at ${info.place}. It will serve.`;
    this.ask('Make Camp', body, [
      { label: 'Short Rest — one hour', value: 'short' },
      { label: 'Long Rest — eight hours', value: 'long', disabled: !info.canLong },
      { label: 'Never mind', value: null },
    ], (v) => {
      if (v === 'short') this._openShortRest();
      else if (v === 'long') this._confirmLongRest(info);
    });
  }

  _openShortRest() {
    const spend = {};
    for (const m of Party.members) spend[m.uid] = 0;
    this.rest = { spend, index: 0 };
    sfx('open');
  }

  _updateRest() {
    const members = Party.members;
    const rows = members.length + 1;                 // + the "Rest" button
    this.rest.index = navV(this.rest.index, rows);
    const i = this.rest.index;
    if (i < members.length) {
      const ch = members[i];
      const hd = safe(() => hitDiceTotal(ch), null) || { max: 0, used: 0 };
      const free = Math.max(0, num(hd.max, 0) - num(hd.used, 0));
      let v = num(this.rest.spend[ch.uid], 0);
      if (Input.repeatConsume('left') && v > 0) { v--; sfx('cursor'); }
      if (Input.repeatConsume('right') && v < free) { v++; sfx('cursor'); }
      this.rest.spend[ch.uid] = v;
    }
    if (Input.consume('confirm')) {
      if (i >= members.length) this._applyShortRest();
      else sfx('cursor');
      return;
    }
    if (Input.consume('cancel')) { sfx('back'); this.rest = null; }
  }

  _applyShortRest() {
    const st = S();
    const spend = this.rest.spend;
    this.rest = null;
    const logs = safe(() => Party.shortRest(spend), []) || [];
    if (st) safe(() => advanceTime(st, 60));
    sfx('heal');
    safe(() => toast('You take an hour. Wounds close, a little.'));
    this.say(logs.length ? String(logs[logs.length - 1]) : 'The party catches its breath.');
  }

  _confirmLongRest(info) {
    this.ask('Long Rest', `Sleep eight hours at ${info.place}? Hit points, slots and most conditions return.`, [
      { label: 'Sleep', value: 'yes' },
      { label: 'Not yet', value: null },
    ], (v) => {
      if (v !== 'yes') return;
      const st = S();
      safe(() => Party.longRest());
      if (st) { safe(() => advanceTime(st, 480)); st.stats.longRests = num(st.stats.longRests, 0) + 1; }
      sfx('levelup');
      safe(() => toast('Dawn. Everyone is on their feet again.'));
      this.say('The party wakes rested.');
    });
  }

  _quit() {
    this.ask('Quit to Title', 'Any progress since your last save is lost.', [
      { label: 'Quit', value: 'yes', color: C.bad },
      { label: 'Stay', value: null },
    ], (v) => {
      if (v !== 'yes') return;
      softImport('./title.js', 'title').then((mod) => {
        safe(() => Audio.music(null));
        if (mod && mod.TitleScene) {
          Game.transition('fade', () => { Game.replace(new mod.TitleScene()); safe(() => Audio.music('title')); });
        } else {
          this.say('The title screen is not available.', true);
        }
      });
    });
  }

  // --- drawing ------------------------------------------------------------

  draw(ctx) {
    MK.veil(ctx, 0.7);
    this._drawStrip(ctx);

    const LX = 6, LY = 34, LW = 150, LH = CONTENT_BOTTOM - LY;
    UI.panel(ctx, LX, LY, LW, LH, { style: 'window' });
    this.rects = [];
    // The pitch follows the entry count instead of being pinned at 16. Ten
    // entries fitted; the eleventh (Cheats) put the last row at y=199, straight
    // through the location/clock line this panel ends with. `listH` is the
    // panel minus its top pad and that footer line, so the list can only ever
    // end above it, however many entries there are.
    const listH = LH - 5 - 15;
    const rowH = Math.min(16, Math.floor(listH / Math.max(1, PAUSE_ITEMS.length)));
    const m = Input.mouse;
    for (let i = 0; i < PAUSE_ITEMS.length; i++) {
      const it = PAUSE_ITEMS[i];
      const ry = LY + 5 + i * rowH;
      const sel = i === this.index;
      this.rects.push({ x: LX + 4, y: ry, w: LW - 8, h: rowH - 2 });
      if (sel) MK.selRow(ctx, LX + 4, ry, LW - 8, rowH - 2, this.t);
      else if (hit(m, LX + 4, ry, LW - 8, rowH - 2)) MK.hoverRow(ctx, LX + 4, ry, LW - 8, rowH - 2);
      UI.icon(ctx, it.icon, LX + 9, ry + 3, 9, sel ? C.goldBright : C.inkDim);
      txt(ctx, LX + 22, ry + 3.5, it.label, {
        size: sel ? 'md' : 'sm', color: sel ? C.goldBright : (it.id === 'quit' ? C.inkDim : C.ink), shadow: true, maxWidth: LW - 46,
      });
      if (it.key) MK.keycap(ctx, LX + LW - 16, ry + 3.5, String(it.key), { dim: !sel });
    }
    const st = S();
    if (st) {
      const ti = safe(() => timeInfo(st), null) || {};
      MK.rule(ctx, LX + 8, LY + LH - 14, LW - 16, { ornament: false });
      MK.text(ctx, LX + LW / 2, LY + LH - 10, `${prettyMapName(st.mapId)} · ${ti.clock || ''}`, {
        color: C.inkDim, align: 'center', maxWidth: LW - 12,
      });
    }

    this._drawInfo(ctx, 160, 34, 234, CONTENT_BOTTOM - 34);
    this.drawMessage(ctx, 6, MSG_Y, VIEW_W - 12);
    hintBar(ctx, HINT_Y, [
      [keyFor('confirm'), 'Open'], [keyFor('cancel'), 'Close'],
      ['1-5', 'Jump'], [`${keyFor('up')}${keyFor('down')}`, 'Move'],
    ]);
    if (this.rest) this._drawRest(ctx);
    this.drawPrompt(ctx);
    this.drawFloats(ctx);
  }

  /** The party strip and purse along the top. */
  _drawStrip(ctx) {
    UI.panel(ctx, 2, 2, VIEW_W - 4, 28, { style: 'dark' });
    const members = Party.members;
    const cw = 84;
    for (let i = 0; i < PARTY_MAX; i++) {
      const x = 5 + i * cw;
      const ch = members[i] || null;
      if (!ch) {
        MK.well(ctx, x + 2, 5, 22, 22, 'rgba(0,0,0,0.3)');
        MK.text(ctx, x + 28, 13, 'an empty place', { color: C.disabled });
        continue;
      }
      drawMemberCell(ctx, ch, x, 3, cw - 3, 26, { selected: false });
    }
    const bx = 5 + PARTY_MAX * cw;
    UI.icon(ctx, 'coin', bx, 5, 8, C.gold);
    txt(ctx, bx + 10, 5.5, String(Math.round(num(Party.gold, 0))), { size: 'sm', color: C.gold, shadow: true, maxWidth: 40 });
    const st = S();
    if (st) {
      const ti = safe(() => timeInfo(st), null) || {};
      MK.text(ctx, bx, 15.5, ti.clock || '', { color: C.ink, maxWidth: 48 });
      MK.text(ctx, bx, 21.5, `${titleCase(ti.phase || '')}`, { color: C.inkDim, maxWidth: 48 });
    }
  }

  /** The right-hand pane: what the highlighted entry does, plus a campaign digest. */
  _drawInfo(ctx, x, y, w, h) {
    UI.panel(ctx, x, y, w, h, { style: 'window' });
    const it = PAUSE_ITEMS[this.index];
    const ix = x + 8, iw = w - 16;
    UI.icon(ctx, it.icon, ix, y + 6, 9, C.gold);
    MK.title(ctx, ix + 13, y + 6, it.label, { maxWidth: iw - 14 });
    MK.para(ctx, ix, y + 19, iw, it.desc, { color: C.ink, maxLines: 4 });

    let ty = rubric(ctx, ix, y + 44, iw, 'The Campaign');
    const st = S();
    if (!st) {
      MK.text(ctx, ix, ty, 'No campaign is running.', { color: C.inkDim, maxWidth: iw });
      return;
    }
    const ti = safe(() => timeInfo(st), null) || {};
    const colW = Math.floor((iw - 10) / 2);
    const left = [
      ['Location', prettyMapName(st.mapId)],
      ['Date', ti.date || dateText(num(st.day, 1))],
      ['Time', `${ti.clock || ''} · ${titleCase(ti.phase || '')}`],
      ['Weather', titleCase(String(st.weather || 'clear'))],
      ['Playtime', playtimeText(num(st.playtime, 0))],
    ];
    const right = [
      ['Party', `${Party.members.length} · Lv ${safe(() => Party.levelAvg(), 1)}`],
      ['Purse', goldText(Party.gold)],
      ['Foes slain', String(num(st.stats && st.stats.kills, 0))],
      ['Quests done', String(num(st.stats && st.stats.questsDone, 0))],
      ['Difficulty', titleCase(String(safe(() => Save.settings.difficulty, 'normal') || 'normal'))],
    ];
    for (let i = 0; i < left.length; i++) {
      MK.kv(ctx, ix, ty + i * 7, colW, left[i][0], left[i][1]);
      MK.kv(ctx, ix + colW + 10, ty + i * 7, colW, right[i][0], right[i][1]);
    }
    ty += left.length * 7 + 5;

    ty = rubric(ctx, ix, ty, iw, 'Tracked');
    const q = trackedQuest(st);
    if (!q) {
      MK.text(ctx, ix, ty, 'Nothing tracked. Open the journal to pick a task.', { color: C.inkDim, maxWidth: iw });
      ty += 8;
    } else {
      txt(ctx, ix, ty, q.title || q.id, { size: 'sm', color: C.goldBright, shadow: true, maxWidth: iw });
      ty += 10;
      const step = arr(q.steps).find((s) => !s.done) || arr(q.steps)[0] || null;
      if (step) {
        MK.bullet(ctx, ix + 1, ty + 1.5);
        MK.text(ctx, ix + 5, ty, stepText(step), { color: C.ink, maxWidth: iw - 30 });
        MK.text(ctx, ix + iw, ty, `${num(step.progress, 0)}/${num(step.count, 1)}`, {
          color: step.done ? C.good : C.inkDim, align: 'right',
        });
        ty += 7;
      }
      const qd = safe(() => questDef(q), null);
      const blurb = (qd && (qd.summary || qd.desc || qd.description)) || q.summary || '';
      if (blurb) ty += MK.para(ctx, ix, ty + 1, iw, blurb, { color: C.inkDim, maxLines: 3 }).height + 1;
    }

    // What the world has been doing: the director's chronicle, newest first.
    const lately = safe(() => chronicle(st, { limit: 8 }), []) || [];
    if (!lately.length || ty > y + h - 24) return;
    ty = rubric(ctx, ix, ty + 4, iw, 'Lately on the Coast');
    let lastDate = null;
    for (const c of lately) {
      if (ty > y + h - 10) break;
      if (c.date !== lastDate) {
        MK.text(ctx, ix, ty, c.date, { color: C.goldDim, maxWidth: iw });
        lastDate = c.date; ty += 6;
      }
      MK.bullet(ctx, ix + 1.5, ty + 1.5, c.kind === 'party' ? C.goldBright : RUBRIC_HI);
      const r = MK.para(ctx, ix + 5, ty, iw - 5, c.text, { color: C.ink, maxLines: Math.max(1, Math.min(2, Math.floor((y + h - 6 - ty) / 5))) });
      ty += Math.max(5, r.height) + 1.5;
    }
  }

  /** The Hit Dice allocation window for a short rest. */
  _drawRest(ctx) {
    UI.scrim(ctx, 0.5);
    const members = Party.members;
    const h = 34 + members.length * 20 + 16;
    const w = 246;
    const x = R((VIEW_W - w) / 2), y = clamp(R((VIEW_H - h) / 2), 10, VIEW_H - h - 6);
    UI.window(ctx, x, y, w, h, 'Short Rest', { style: 'window' });
    txt(ctx, x + 8, y + 6, 'Spend Hit Dice to heal. One hour passes.', {
      size: 'sm', color: C.inkDim, shadow: true, maxWidth: w - 16,
    });
    members.forEach((ch, i) => {
      const ry = y + 18 + i * 20;
      const sel = this.rest.index === i;
      if (sel) UI.highlight(ctx, x + 5, ry, w - 10, 18, { alpha: 0.2 });
      txt(ctx, x + 9, ry + 2, ch.name, { size: sel ? 'md' : 'sm', color: sel ? C.goldBright : C.ink, shadow: true, maxWidth: 84 });
      const hp = Math.max(0, num(ch.hp, 0)), max = Math.max(1, maxHpOf(ch));
      UI.bar(ctx, x + 9, ry + 11, 84, 4, hp / max, { color: hpColor(ch), label: `${hp}/${max}`, size: 'sm' });
      const hd = safe(() => hitDiceTotal(ch), null) || { max: 0, used: 0 };
      const free = Math.max(0, num(hd.max, 0) - num(hd.used, 0));
      const spend = num(this.rest.spend[ch.uid], 0);
      txtR(ctx, x + w - 62, ry + 5, `${free - spend}/${num(hd.max, 0)} HD`, { size: 'sm', color: C.inkDim, shadow: true });
      txt(ctx, x + w - 54, ry + 5, '◀', { size: 'sm', color: spend > 0 ? C.gold : C.disabled });
      txtC(ctx, x + w - 34, ry + 5, String(spend), { size: 'md', color: spend ? C.goldBright : C.inkDim, shadow: true });
      txt(ctx, x + w - 20, ry + 5, '▶', { size: 'sm', color: spend < free ? C.gold : C.disabled });
      if (sel) UI.cursor(ctx, x + 1, ry + 5, this.t);
    });
    const by = y + 18 + members.length * 20 + 2;
    UI.button(ctx, x + 60, by, w - 120, 13, 'Take the rest', {
      selected: this.rest.index >= members.length, t: this.t,
    });
  }
}

function prettyMapName(id) {
  if (!id) return 'The Sword Coast';
  const maps = (LATE.maps && (LATE.maps.MAP_DEFS || LATE.maps.MAPS)) || null;
  const d = maps && maps[id];
  if (d && d.name) return d.name;
  return titleCase(String(id).replace(/-/g, ' '));
}

function trackedQuest(st) {
  if (!st || !st.quests) return null;
  const id = st.quests.tracked;
  const active = arr(st.quests.active);
  return (id && active.find((q) => q.id === id)) || active[0] || null;
}

function stepText(step) {
  if (!step) return '';
  if (step.text) return step.text;
  const target = titleCase(String(step.target || '').replace(/-/g, ' '));
  switch (step.kind) {
    case 'kill': return `Slay ${target || 'the enemy'}`;
    case 'collect': return `Recover ${target}`;
    case 'reach': return `Travel to ${target}`;
    case 'talk': return `Speak with ${target}`;
    case 'deliver': return `Deliver to ${target}`;
    case 'clear': return `Clear ${target}`;
    case 'escort': return `Escort ${target}`;
    default: return target || titleCase(String(step.kind || 'Objective'));
  }
}

// ===========================================================================
// 3. PARTY — the full character sheet
// ===========================================================================

const SHEET_TABS = [
  { id: 'stats', label: 'Stats', icon: 'd20' },
  { id: 'features', label: 'Feats', icon: 'star' },
  { id: 'gear', label: 'Gear', icon: 'armor' },
  { id: 'effects', label: 'Effects', icon: 'flame' },
  { id: 'attacks', label: 'Attacks', icon: 'sword' },
  { id: 'roster', label: 'Roster', icon: 'quest' },
];

const CONTENT_Y = 46;
const CONTENT_H = CONTENT_BOTTOM - CONTENT_Y;   // 46 .. 210

/**
 * Equip `inst` onto `ch` and push whatever the swap knocked loose back into the
 * shared pack. rules/character.js returns displaced gear to the character's own
 * inventory, which would quietly hide it from the Inventory screen; the party
 * keeps one bag, so it goes back in the bag.
 * `fromPack` means the instance is not in ch.inventory yet.
 */
function equipInstance(ch, inst, slot, { fromPack = false } = {}) {
  if (!ch || !inst) return false;
  ch.inventory = arr(ch.inventory);
  if (fromPack) ch.inventory.push(inst);
  const before = new Set(ch.inventory.map((e) => e && e.uid));
  const ok = safe(() => equip(ch, inst, slot), false);
  if (!ok) {
    if (fromPack) ch.inventory = ch.inventory.filter((e) => e !== inst);
    return false;
  }
  const displaced = ch.inventory.filter((e) => e && !before.has(e.uid));
  if (displaced.length) {
    ch.inventory = ch.inventory.filter((e) => displaced.indexOf(e) < 0);
    for (const d of displaced) safe(() => Party.addItem(d.id, num(d.qty, 1)));
  }
  safe(() => recalc(ch));
  return true;
}

/** A throwaway clone with `inst` in `slot`, recalculated — the source of the deltas. */
function previewEquip(ch, inst, slot) {
  const c = safe(() => cloneChar(ch), null);
  if (!c) return null;
  if (inst) {
    const copy = { ...inst, uid: `${inst.uid || 'x'}-p` };
    c.inventory = arr(c.inventory).concat([copy]);
    if (!safe(() => equip(c, copy, slot), false)) return null;
  } else if (!safe(() => unequip(c, slot), null)) {
    return null;
  }
  safe(() => recalc(c));
  return c;
}

/** Average damage of the best attack a character has, for the equip comparison. */
function bestDamage(ch) {
  const list = safe(() => weaponsOf(ch), []) || [];
  let best = 0;
  for (const w of list) {
    if (!w || !w.damage) continue;
    const dice = w.damage.dice || w.damage.die || '';
    const avg = num(safe(() => avgExpr(dice), 0), 0) + num(w.damage.mod, 0);
    if (avg > best) best = avg;
  }
  return Math.round(best * 10) / 10;
}

function deltaChip(ctx, x, y, label, before, after) {
  const d = Math.round((after - before) * 10) / 10;
  const col = d > 0 ? C.good : d < 0 ? C.bad : C.inkDim;
  const text = `${label} ${d === 0 ? '—' : signed(d)}`;
  return safe(() => MK.chip(ctx, x, y, text, { color: col }), 0) || 0;
}

export class PartyScene extends MenuScene {
  constructor(opts = {}) {
    super('party');
    this.opts = opts || {};
    this.member = clamp(num(opts.member, 0), 0, Math.max(0, Party.members.length - 1));
    this.section = Math.max(0, SHEET_TABS.findIndex((s) => s.id === opts.section));
    if (this.section < 0) this.section = 0;

    this.cursor = [0, 0, 0, 0, 0, 0];   // per-section list cursor
    this.top = [0, 0, 0, 0, 0, 0];      // per-section list scroll
    this.scroll = 0;                    // detail-pane text scroll
    this.pack = null;                   // { slot, list, index, top } equip overlay
    this.grab = -1;                     // marching-order drag index
    this.col = 0;                       // roster column: 0 active, 1 reserve
    this.tabRects = [];
    this.rowRects = [];
  }

  get ch() { return Party.members[this.member] || Party.members[0] || null; }
  get sectionId() { return SHEET_TABS[this.section].id; }

  update(dt) {
    if (this.tick(dt)) return;
    const ch = this.ch;
    if (!ch) { if (Input.consume('cancel') || Input.consume('party')) this.close(); return; }

    if (this.pack) { this._updatePack(ch); return; }

    // Section paging is global; number keys jump straight to a section.
    const before = this.section;
    this.section = navPage(this.section, SHEET_TABS.length);
    const tp = tabPressed(5);
    if (tp >= 0 && tp < SHEET_TABS.length) this.section = tp;
    if (this.section !== before) { this.scroll = 0; this.grab = -1; }

    // Member switching with left/right, except in Roster where the columns need them.
    if (this.sectionId !== 'roster' && !this.pack) {
      const m0 = this.member;
      this.member = navH(this.member, Math.max(1, Party.members.length));
      if (this.member !== m0) { this.scroll = 0; this.cursor = [0, 0, 0, 0, 0, 0]; this.top = [0, 0, 0, 0, 0, 0]; }
    }

    // Member tabs are clickable.
    const m = Input.mouse;
    for (let i = 0; i < this.tabRects.length; i++) {
      const r = this.tabRects[i];
      if (clicked(m, r.x, r.y, r.w, r.h)) {
        if (r.kind === 'member') { this.member = r.i; this.scroll = 0; }
        else { this.section = r.i; this.scroll = 0; }
        sfx('cursor');
        return;
      }
    }

    switch (this.sectionId) {
      case 'stats': this._updateStats(ch); break;
      case 'features': this._updateList(ch, this._featureList(ch).length); break;
      case 'gear': this._updateGear(ch); break;
      case 'effects': this._updateList(ch, this._effectList(ch).length); break;
      case 'attacks': this._updateList(ch, this._attackList(ch).length); break;
      case 'roster': this._updateRoster(); break;
      default: break;
    }

    if (Input.consume('cancel') || Input.consume('party')) this.close();
  }

  // --- per-section input --------------------------------------------------

  _updateStats() {
    this.scroll = 0;
    const m = Input.mouse;
    if (wheelOver(m, 0, CONTENT_Y, VIEW_W, CONTENT_H)) sfx('cursor');
  }

  _updateList(ch, len) {
    const s = this.section;
    if (listNavActive()) {
      const before = this.cursor[s];
      this.cursor[s] = navV(this.cursor[s], len);
      if (this.cursor[s] !== before) this.scroll = 0;
    }
    this.scroll = scrollPane(this.scroll, this._maxScroll, Input.mouse, this._paneRect);
    const m = Input.mouse;
    for (const r of this.rowRects) {
      if (clicked(m, r.x, r.y, r.w, r.h)) { this.cursor[s] = r.i; this.scroll = 0; sfx('cursor'); }
    }
  }

  _updateGear(ch) {
    const s = this.section;
    const len = EQUIP_SLOTS.length;
    if (listNavActive()) this.cursor[s] = navV(this.cursor[s], len);
    this.scroll = scrollPane(this.scroll, this._maxScroll, Input.mouse, this._paneRect);
    const m = Input.mouse;
    for (const r of this.rowRects) {
      if (hit(m, r.x, r.y, r.w, r.h)) {
        if (this.cursor[s] !== r.i) { this.cursor[s] = r.i; sfx('cursor'); }
        if (clicked(m, r.x, r.y, r.w, r.h)) { this._openPack(ch); return; }
      }
    }
    if (Input.consume('confirm')) { this._openPack(ch); return; }
    if (Input.consume('interact')) this._unequipSlot(ch);
  }

  _updateRoster() {
    const active = Party.members;
    const reserve = arr(Party.reserve);
    const s = this.section;
    if (Input.repeatConsume('left') && this.col === 1) { this.col = 0; sfx('cursor'); }
    if (Input.repeatConsume('right') && this.col === 0 && reserve.length) { this.col = 1; sfx('cursor'); }
    const len = this.col === 0 ? active.length : reserve.length;

    if (this.grab >= 0) {
      // Dragging a companion up and down the marching line.
      if (Input.repeatConsume('up') && this.grab > 0) {
        safe(() => Party.swap(this.grab, this.grab - 1)); this.grab--; this.cursor[s] = this.grab; sfx('cursor');
      }
      if (Input.repeatConsume('down') && this.grab < active.length - 1) {
        safe(() => Party.swap(this.grab, this.grab + 1)); this.grab++; this.cursor[s] = this.grab; sfx('cursor');
      }
      if (Input.consume('confirm') || Input.consume('cancel')) { this.grab = -1; sfx('select'); }
      return;
    }

    if (listNavActive()) this.cursor[s] = navV(this.cursor[s], Math.max(1, len));
    const m = Input.mouse;
    for (const r of this.rowRects) {
      if (hit(m, r.x, r.y, r.w, r.h)) {
        if (this.col !== r.col || this.cursor[s] !== r.i) { this.col = r.col; this.cursor[s] = r.i; sfx('cursor'); }
        if (clicked(m, r.x, r.y, r.w, r.h)) { this._rosterMenu(); return; }
      }
    }
    if (Input.consume('interact')) { this._toggleAuto(); return; }
    if (Input.consume('confirm')) this._rosterMenu();
  }

  _toggleAuto() {
    const list = this.col === 0 ? Party.members : arr(Party.reserve);
    const ch = list[this.cursor[this.section]];
    if (!ch) { sfx('error'); return; }
    if (Party.members[0] && ch.uid === Party.members[0].uid) {
      this.say('You always give your own character their orders.', true);
      return;
    }
    Party.autoBattle[ch.uid] = !Party.autoBattle[ch.uid];
    sfx('select');
    this.say(`${ch.name} will ${Party.autoBattle[ch.uid] ? 'act on their own' : 'wait for your orders'} in battle.`);
  }

  _rosterMenu() {
    const s = this.section;
    const active = Party.members;
    const reserve = arr(Party.reserve);
    const i = this.cursor[s];
    if (this.col === 0) {
      const ch = active[i];
      if (!ch) { sfx('error'); return; }
      const isLeader = i === 0;
      const auto = !!Party.autoBattle[ch.uid];
      this.ask(ch.name, `Marching position ${i + 1} of ${active.length}.`, [
        { label: 'Move in the line', value: 'move', disabled: active.length < 2 },
        { label: auto ? 'Take manual control' : 'Let the AI fight them', value: 'auto', disabled: isLeader },
        { label: 'Send to the bench', value: 'bench', disabled: isLeader || active.length < 2 },
        { label: 'Back', value: null },
      ], (v) => {
        if (v === 'move') { this.grab = i; sfx('select'); }
        else if (v === 'auto') this._toggleAuto();
        else if (v === 'bench') {
          if (safe(() => Party.bench(ch.uid), false)) {
            sfx('select');
            this.cursor[s] = clamp(i, 0, Math.max(0, Party.members.length - 1));
            this.member = clamp(this.member, 0, Math.max(0, Party.members.length - 1));
            this.say(`${ch.name} waits at the inn.`);
          } else this.say('There is no room on the bench.', true);
        }
      });
    } else {
      const ch = reserve[i];
      if (!ch) { sfx('error'); return; }
      this.ask(ch.name, 'Bring them back into the marching line?', [
        { label: 'Bring them along', value: 'activate', disabled: active.length >= PARTY_MAX },
        { label: 'Back', value: null },
      ], (v) => {
        if (v !== 'activate') return;
        if (safe(() => Party.activate(ch.uid), false)) {
          sfx('select');
          this.say(`${ch.name} shoulders their pack.`);
          if (!arr(Party.reserve).length) this.col = 0;
          this.cursor[s] = 0;
        } else this.say('The party is already four strong.', true);
      });
    }
  }

  // --- equipment ----------------------------------------------------------

  _slotAt(i) { return EQUIP_SLOTS[clamp(i, 0, EQUIP_SLOTS.length - 1)]; }

  /** offHand shows a shield when one is strapped on. */
  _instFor(ch, slot) {
    let inst = safe(() => equipped(ch, slot), null);
    if (!inst && slot === 'offHand') inst = safe(() => equipped(ch, 'shield'), null);
    return inst;
  }

  _openPack(ch) {
    const slot = this._slotAt(this.cursor[this.section]);
    const list = [];
    for (const e of arr(ch.inventory)) {
      const d = safe(() => itemDef(e), null) || safe(() => resolveItem(e.id), null);
      if (!d) continue;
      if (!slotAccepts(slot, d)) continue;
      list.push({ src: 'own', entry: e, id: e.id, def: d });
    }
    for (const e of arr(Party.inventory)) {
      const d = safe(() => resolveItem(e.id), null);
      if (!d) continue;
      if (!slotAccepts(slot, d)) continue;
      list.push({ src: 'pack', entry: e, id: e.id, def: d, qty: num(e.qty, 1) });
    }
    if (!list.length) { this.say(`Nothing in the pack fits the ${SLOT_NAMES[slot] || slot} slot.`, true); return; }
    if (this._instFor(ch, slot)) list.unshift({ src: 'none', id: null, def: null });
    this.pack = { slot, list, index: 0, top: 0 };
    sfx('open');
  }

  _updatePack(ch) {
    const p = this.pack;
    p.index = navV(p.index, p.list.length);
    const m = Input.mouse;
    for (const r of arr(p.rects)) {
      if (hit(m, r.x, r.y, r.w, r.h)) {
        if (p.index !== r.i) { p.index = r.i; sfx('cursor'); }
        if (clicked(m, r.x, r.y, r.w, r.h)) { this._commitPack(ch); return; }
      }
    }
    if (Input.consume('confirm')) { this._commitPack(ch); return; }
    if (Input.consume('cancel')) { sfx('back'); this.pack = null; }
  }

  _commitPack(ch) {
    const p = this.pack;
    const pick = p.list[p.index];
    const slot = p.slot;
    this.pack = null;
    if (!pick) return;
    if (pick.src === 'none') { this._unequipSlot(ch); return; }

    if (pick.src === 'own') {
      if (equipInstance(ch, pick.entry, slot)) {
        sfx('item');
        this.say(`${ch.name} equips ${itemName(pick.id, pick.def)}.`);
      } else this.say('That will not go on.', true);
      return;
    }
    // From the shared pack: mint an instance, equip it, then take it out of the bag.
    const inst = safe(() => makeItemInstance(pick.id), null) || { uid: `t${this.t}`, id: pick.id, qty: 1 };
    if (equipInstance(ch, inst, slot, { fromPack: true })) {
      safe(() => Party.removeByUid(pick.entry.uid, 1));
      sfx('item');
      this.say(`${ch.name} equips ${itemName(pick.id, pick.def)}.`);
    } else {
      this.say('That will not go on.', true);
    }
  }

  _unequipSlot(ch) {
    const slot = this._slotAt(this.cursor[this.section]);
    const inst = this._instFor(ch, slot);
    if (!inst) { sfx('error'); return; }
    const real = safe(() => equipped(ch, slot), null) ? slot : 'shield';
    const out = safe(() => unequip(ch, real), null);
    if (!out) { this.say('It will not come off.', true); return; }
    // Push it back into the shared pack so everyone can reach it.
    safe(() => {
      ch.inventory = arr(ch.inventory).filter((e) => e !== out && e.uid !== out.uid);
      Party.addItem(out.id, num(out.qty, 1));
      recalc(ch);
    });
    sfx('close');
    this.say(`${itemName(out.id, safe(() => resolveItem(out.id), null))} goes back in the pack.`);
  }

  // --- content builders ---------------------------------------------------

  _featureList(ch) {
    const list = safe(() => allFeatures(ch), []) || [];
    return list.filter(Boolean).sort((a, b) => (a.level || 1) - (b.level || 1) || String(a.name).localeCompare(String(b.name)));
  }

  _effectList(ch) {
    const out = [];
    for (const c of safe(() => activeConditions(ch), []) || []) {
      const def = CONDITIONS[String(c.id).toLowerCase()] || null;
      out.push({
        kind: 'condition', id: c.id, level: num(c.level, 0),
        name: (def && def.name) || titleCase(String(c.id)) + (c.level ? ` ${c.level}` : ''),
        color: (def && def.color) || C.bad,
        icon: (def && def.icon) || 'skull',
        dur: c.dur, source: c.source || '',
        desc: safe(() => conditionText(c.id, c.level || 0), '') || (def && def.desc) || '',
      });
    }
    for (const e of arr(ch && ch.effects)) {
      out.push({
        kind: 'effect', id: e.id, name: e.name || e.id, color: e.concentration ? C.purple : C.good,
        icon: e.concentration ? 'mana' : 'star',
        dur: e.dur, source: e.source || '', conc: !!e.concentration,
        desc: e.desc || mechSummary(e.mech) || 'An ongoing magical effect.',
      });
    }
    return out;
  }

  _attackList(ch) {
    const out = [];
    for (const w of safe(() => weaponsOf(ch), []) || []) {
      if (!w) continue;
      const d = w.damage || {};
      const dice = d.dice || d.die || '—';
      const mod = num(d.mod, 0);
      out.push({
        kind: 'weapon',
        name: w.name || 'Attack',
        hit: signed(num(w.attackBonus, 0)),
        line: `${dice}${mod ? signed(mod) : ''} ${d.type || ''}`.trim(),
        range: w.ranged ? rangeLabel(w.range) : `reach ${num(w.range, 5) || 5} ft.`,
        cost: w.cost || 'action',
        props: arr(w.props),
        mastery: w.mastery || null,
        enabled: w.enabled !== false,
        reason: w.reason || '',
        item: w.item || null,
        bonusDice: arr(d.bonusDice),
      });
    }
    // Attack and save spells the character can actually cast right now.
    const known = spellIdsFor(ch);
    const dc = num(safe(() => spellDC(ch), 0), 0);
    for (const id of known) {
      const sp = SPELLS[id];
      if (!sp) continue;
      const atk = num(safe(() => spellAtk(ch,id), 0), 0);
      if (!sp.attack && !(sp.save && sp.damage)) continue;
      const dice = safe(() => spellDamageDice(sp, sp.level, num(ch.level, 1)), null) || (sp.damage && sp.damage.dice) || '';
      out.push({
        kind: 'spell',
        name: sp.name,
        hit: sp.attack ? signed(atk) : `DC ${dc}`,
        line: dice ? `${dice} ${(sp.damage && sp.damage.type) || ''}`.trim() : (sp.heal ? `heals ${sp.heal.dice}` : '—'),
        range: rangeText(sp),
        cost: sp.castTime || 'action',
        props: [sp.attack ? `${sp.attack} spell attack` : `${ABILITY_NAMES[sp.save.ability] || sp.save.ability} save`],
        spell: sp,
        enabled: true,
        reason: '',
      });
    }
    return out;
  }

  // --- drawing ------------------------------------------------------------

  draw(ctx) {
    MK.desk(ctx);
    this.tabRects = [];
    this.rowRects = [];

    const ch = this.ch;
    this._drawMemberTabs(ctx);
    const tabs = SHEET_TABS.map((s) => ({ label: s.label, icon: s.icon }));
    MK.tabs(ctx, 2, 32, VIEW_W - 4, tabs, this.section, {});
    const tw = Math.floor((VIEW_W - 4) / SHEET_TABS.length);
    for (let i = 0; i < SHEET_TABS.length; i++) {
      this.tabRects.push({ x: 2 + i * tw, y: 32, w: tw, h: 13, i, kind: 'section' });
    }

    if (!ch) {
      UI.panel(ctx, 8, CONTENT_Y, VIEW_W - 16, CONTENT_H, { style: 'window' });
      txtC(ctx, VIEW_W / 2, CONTENT_Y + 70, 'There is no one in the party.', { size: 'md', color: C.inkDim });
      hintBar(ctx, HINT_Y, [[keyFor('cancel'), 'Back']]);
      return;
    }

    switch (this.sectionId) {
      case 'stats': this._drawStats(ctx, ch); break;
      case 'features': this._drawFeatures(ctx, ch); break;
      case 'gear': this._drawGear(ctx, ch); break;
      case 'effects': this._drawEffects(ctx, ch); break;
      case 'attacks': this._drawAttacks(ctx, ch); break;
      case 'roster': this._drawRoster(ctx); break;
      default: break;
    }

    this.drawMessage(ctx, 6, MSG_Y, VIEW_W - 12);
    hintBar(ctx, HINT_Y, this._hints());
    if (this.pack) this._drawPack(ctx, ch);
    this.drawPrompt(ctx);
    this.drawFloats(ctx);
  }

  _hints() {
    const base = [[keyFor('cancel'), 'Back'], [`${keyFor('prev')}/${keyFor('next')}`, 'Page']];
    switch (this.sectionId) {
      case 'gear': return base.concat([[keyFor('confirm'), 'Equip'], [keyFor('interact'), 'Remove'], [`${keyFor('left')}${keyFor('right')}`, 'Member']]);
      case 'roster': return base.concat([[keyFor('confirm'), 'Options'], [keyFor('interact'), 'Auto AI'], [`${keyFor('left')}${keyFor('right')}`, 'Column']]);
      case 'features':
      case 'effects':
      case 'attacks': return base.concat([[keyFor('run'), 'Scroll'], [`${keyFor('left')}${keyFor('right')}`, 'Member']]);
      default: return base.concat([[`${keyFor('left')}${keyFor('right')}`, 'Member'], ['1-5', 'Section']]);
    }
  }

  _drawMemberTabs(ctx) {
    const members = Party.members;
    const n = Math.max(1, members.length);
    const w = Math.floor((VIEW_W - 4) / n);
    for (let i = 0; i < n; i++) {
      const x = 2 + i * w;
      const cw = i === n - 1 ? VIEW_W - 2 - x : w;
      const sel = i === this.member;
      UI.panel(ctx, x, 2, cw - 1, 28, { style: sel ? 'window' : 'dark', shadow: sel ? 0.4 : 0.15, studs: false });
      const ch = members[i];
      if (!ch) continue;
      if (sel) {
        // the open sheet: lamplight across the card and a gilt rule under it
        const g = ctx.createLinearGradient(x, 0, x + cw, 0);
        g.addColorStop(0, 'rgba(255,214,150,0.13)'); g.addColorStop(1, 'rgba(255,214,150,0)');
        ctx.fillStyle = g; ctx.fillRect(x + 2, 4, cw - 5, 24);
        ctx.fillStyle = UI.COLORS.goldBright; ctx.fillRect(x + 3, 27.5, cw - 7, 0.5);
      }
      const down = safe(() => isDown(ch), false);
      // a 20px interior on the 2x layer is the painted bust at exactly 1:1
      MK.portrait(ctx, ch, x + 3, 4, 24, 24, { dim: down, glow: sel ? 0.28 : 0.12 });
      const tx = x + 31;
      const tw = cw - 35;
      MK.title(ctx, tx, 5, ch.name, { maxWidth: tw, color: sel ? C.goldBright : C.ink });
      const folk = String(speciesText(ch) || '').split(' · ')[0];
      MK.text(ctx, tx, 14.5, `${folk ? `${folk} · ` : ''}${classText(ch)}`, { color: sel ? '#d8c8a4' : C.inkDim, maxWidth: tw });
      const hp = Math.max(0, num(ch.hp, 0)), max = Math.max(1, maxHpOf(ch));
      const bw = Math.min(tw - 30, 70);
      MK.meter(ctx, tx, 22, bw, 2.5, hp / max, { color: hpColor(ch), id: `sheet-hp-${ch.uid}` });
      MK.text(ctx, tx + bw + 3, 21, `${hp}/${max}`, { color: down ? C.bad : C.ink, maxWidth: 28 });
      // A wide card (a small party) has room for the numbers people look up most.
      if (cw > 170) {
        const facts = [`AC ${acOf(ch)}`, `Speed ${speedOf(ch)}`, `Init ${signed(initiativeMod(ch))}`,
          `Prof ${signed(num(safe(() => profBonus(ch), 2), 2))}`];
        let fx = x + cw - 8;
        for (let k = facts.length - 1; k >= 0; k--) {
          const fw = MK.measure(facts[k]);
          if (fx - fw < tx + Math.max(MK.measure(ch.name, 'title'), 110) + 10) break;
          fx -= fw;
          MK.text(ctx, fx, 7, facts[k], { color: k === 0 ? C.goldBright : '#cfc3a6' });
          fx -= 8;
          if (k > 0) MK.bullet(ctx, fx + 4, 9, 'rgba(217,164,65,0.6)');
        }
        const conds = arr(ch.conditions).map((c) => titleCase(String((c && (c.id || c.name)) || c).replace(/-/g, ' ')));
        const note = down ? 'Down and dying' : conds.length ? conds.join(', ') : 'In good health';
        MK.text(ctx, x + cw - 8, 16, note, { color: down || conds.length ? '#e08a70' : '#8fae78', align: 'right', maxWidth: cw - 150 });
      }
      this.tabRects.push({ x, y: 2, w: cw, h: 28, i, kind: 'member' });
    }
  }

  // --- STATS --------------------------------------------------------------

  _drawStats(ctx, ch) {
    const y = CONTENT_Y;
    const PAD = 6;
    // Left column: the six abilities, then the numbers a fight turns on.
    const LX = 3, LW = 130;
    UI.panel(ctx, LX, y, LW, CONTENT_H, { style: 'window' });
    const ix = LX + PAD, iw = LW - PAD * 2;
    let ty = sectionHead(ctx, ix, y + 4, iw, 'Abilities');
    const COL_S = ix + 62, COL_M = ix + 90;
    MK.text(ctx, COL_S, ty, 'SCORE', { size: 'xs', color: '#8a7a5c', align: 'right' });
    MK.text(ctx, COL_M, ty, 'MOD', { size: 'xs', color: '#8a7a5c', align: 'right' });
    MK.text(ctx, ix + iw, ty, 'SAVE', { size: 'xs', color: '#8a7a5c', align: 'right' });
    const RH = 9;
    ty += 6;
    for (let i = 0; i < ABILITIES.length; i++) {
      const ab = ABILITIES[i];
      const ry = ty + i * RH;
      const score = num(safe(() => abilityScore(ch, ab), 10), 10);
      const md = num(safe(() => abilityMod(ch, ab), 0), 0);
      const sv = num(safe(() => saveMod(ch, ab), 0), 0);
      const prof = arr(ch.saveProfs).indexOf(ab) >= 0;
      if (i & 1) { ctx.fillStyle = 'rgba(255,230,180,0.035)'; ctx.fillRect(ix - 2, ry - 1, iw + 4, RH); }
      txt(ctx, ix, ry, ABILITY_ABBR[ab], { size: 'md', color: C.gold, shadow: true });
      txtR(ctx, COL_S, ry, String(score), { size: 'sm', color: C.inkBright, shadow: true });
      txtR(ctx, COL_M, ry, signed(md), { size: 'sm', color: md >= 0 ? C.ink : C.bad, shadow: true });
      // a proficient save is gilt, with a lozenge in the margin before it
      txtR(ctx, ix + iw, ry, signed(sv), { size: 'sm', color: prof ? C.goldBright : C.inkDim, shadow: true });
      if (prof) MK.bullet(ctx, ix + iw - 17, ry + 3.5, C.goldBright);
    }
    ty += ABILITIES.length * RH + 3;

    // AC, hit points, speed and initiative as boxed figures, the way a sheet has them
    const hp = Math.max(0, num(ch.hp, 0));
    const boxes = [
      ['Armour', String(acOf(ch)), C.goldBright],
      ['Hit pts', `${hp}/${maxHpOf(ch)}`, hp * 2 < maxHpOf(ch) ? C.bad : C.inkBright],
      ['Speed', `${speedOf(ch)}`, C.ink],
      ['Init', signed(initiativeMod(ch)), C.ink],
    ];
    const bw = (iw + 2 - 3 * 2) / 4;
    boxes.forEach((b, k) => MK.statBox(ctx, ix - 1 + k * (bw + 2), ty, bw, 17, b[0], b[1], { color: b[2], size: b[1].length > 4 ? 'fine' : 'md' }));
    ty += 21;

    const hd = safe(() => hitDiceTotal(ch), null) || { max: 0, used: 0 };
    const senses = (ch.senses && num(ch.senses.darkvision, 0)) || 0;
    const rows = [
      ['Hit Dice', `${Math.max(0, num(hd.max, 0) - num(hd.used, 0))} of ${num(hd.max, 0)} left`],
      ['Proficiency bonus', signed(num(safe(() => profBonus(ch), 2), 2))],
      ['Passive Perception', String(num(safe(() => passivePerception(ch), 10), 10))],
      ['Darkvision', senses ? `${senses} ft.` : 'none'],
      ['Temporary hit points', String(num(ch.tempHp, 0) || '—')],
    ];
    rows.forEach((r, i) => MK.kv(ctx, ix, ty + i * 6.5, iw, r[0], r[1]));

    // Middle column: who they are and what they are trained in.
    const MX = 136, MW = 118;
    UI.panel(ctx, MX, y, MW, CONTENT_H, { style: 'window' });
    const mx = MX + PAD, mw = MW - PAD * 2;
    let my = sectionHead(ctx, mx, y + 4, mw, 'Origin');
    const origin = [
      ['Folk', speciesText(ch)],
      ['Calling', classText(ch)],
      ['Path', subclassText(ch) || 'not yet chosen'],
      ['Background', titleCase(String(ch.backgroundId || 'wanderer').replace(/-/g, ' '))],
    ];
    for (const [k, v] of origin) { MK.kv(ctx, mx, my, mw, k, v, { color: C.inkBright }); my += 6.5; }
    my += 2;
    const prog = safe(() => xpProgress(ch), null);
    const toNext = num(safe(() => xpToNext(ch), 0), 0);
    MK.meter(ctx, mx, my, mw, 2.5, clampPct(prog), { color: C.xp });
    my += 4.5;
    MK.text(ctx, mx, my, `${num(ch.xp, 0)} XP`, { color: C.goldBright });
    if (toNext > 0) MK.text(ctx, mx + mw, my, `${toNext} to level ${num(ch.level, 1) + 1}`, { color: C.inkDim, align: 'right' });
    my += 9;

    my = sectionHead(ctx, mx, my, mw, 'Trained in');
    const profs = ch.profs || {};
    const pr = [
      ['Armour', arr(profs.armor).map(titleCase).join(', ') || 'none'],
      ['Weapons', arr(profs.weapon).map(titleCase).join(', ') || 'none'],
      ['Tools', arr(profs.tool).map((t) => titleCase(String(t).replace(/-/g, ' '))).join(', ') || 'none'],
      ['Languages', arr(profs.language).map(titleCase).join(', ') || 'Common'],
    ];
    for (const [label, val] of pr) {
      MK.text(ctx, mx, my, label, { size: 'fineb', color: '#c49a4a' });
      const r = MK.para(ctx, mx + 34, my, mw - 34, val, { color: C.ink, maxLines: 3 });
      my += Math.max(6, (r.height || 5)) + 2;
      if (my > y + CONTENT_H - 30) break;
    }

    if (my < y + CONTENT_H - 20) {
      my = sectionHead(ctx, mx, my + 1, mw, 'Defences');
      let cx = mx;
      const chips = []
        .concat(arr(ch.resist).map((r) => [r, C.blue]))
        .concat(arr(ch.immune).map((r) => [r, C.good]))
        .concat(arr(ch.vuln).map((r) => [r, C.bad]));
      if (!chips.length) MK.text(ctx, mx, my, 'Nothing special.', { color: C.inkDim });
      for (const [label, col] of chips.slice(0, 6)) {
        const w = safe(() => MK.chip(ctx, cx, my, titleCase(String(label)), { color: col }), 0) || 0;
        cx += w + 2;
        if (cx > mx + mw - 24) { cx = mx; my += 9; }
      }
    }

    // Right column: all eighteen skills.
    const RX = 257, RW = VIEW_W - RX - 3;
    UI.panel(ctx, RX, y, RW, CONTENT_H, { style: 'window' });
    const rx = RX + PAD, rw = RW - PAD * 2;
    const ry0 = sectionHead(ctx, rx, y + 3, rw, 'Skills');
    for (let i = 0; i < SKILL_IDS.length; i++) {
      const id = SKILL_IDS[i];
      const def = SKILLS[id];
      const info = safe(() => skillMod(ch, id), null) || { mod: 0, prof: 'none' };
      const yy = ry0 + i * 8;
      const trained = info.prof !== 'none';
      if (trained) { ctx.fillStyle = 'rgba(217,164,65,0.07)'; ctx.fillRect(rx - 2, yy - 0.5, rw + 4, 8); }
      const col = info.prof === 'expert' ? C.goldBright : info.prof === 'prof' ? C.gold : '#5a5040';
      // proficiency as a lozenge: filled when trained, doubled for expertise
      MK.bullet(ctx, rx + 1.5, yy + 3.5, col);
      if (info.prof === 'expert') MK.bullet(ctx, rx + 4.5, yy + 3.5, col);
      txt(ctx, rx + 7, yy, def.name, { size: 'sm', color: trained ? C.inkBright : C.inkDim, shadow: true, maxWidth: rw - 32 });
      txtR(ctx, rx + rw - 12, yy, signed(num(info.mod, 0)), { size: 'sm', color: trained ? C.goldBright : C.ink, shadow: true, maxWidth: 20 });
      MK.text(ctx, rx + rw, yy + 1.5, ABILITY_ABBR[def.ability], { size: 'xs', color: '#8a7a5c', align: 'right' });
    }
  }

  // --- FEATURES -----------------------------------------------------------

  _drawFeatures(ctx, ch) {
    const list = this._featureList(ch);
    const LX = 3, LW = 168;
    UI.panel(ctx, LX, CONTENT_Y, LW, CONTENT_H, { style: 'window' });
    const rowH = 11, rows = 14;
    const sel = clamp(this.cursor[this.section], 0, Math.max(0, list.length - 1));
    let top = this.top[this.section];
    if (sel < top) top = sel;
    if (sel > top + rows - 1) top = sel - rows + 1;
    top = clamp(top, 0, Math.max(0, list.length - rows));
    this.top[this.section] = top;

    if (!list.length) {
      txtC(ctx, LX + LW / 2, CONTENT_Y + 70, 'No features yet.', { size: 'sm', color: C.inkDim });
    }
    UI.pushClip(ctx, LX + 2, CONTENT_Y + 3, LW - 4, rowH * rows + 2);
    for (let i = 0; i < rows && top + i < list.length; i++) {
      const idx = top + i;
      const f = list[idx];
      const ry = CONTENT_Y + 5 + i * rowH;
      const on = idx === sel;
      if (on) UI.highlight(ctx, LX + 3, ry - 1, LW - 8, rowH, { alpha: 0.2 });
      txt(ctx, LX + 10, ry, f.name, {
        size: 'sm', color: on ? C.goldBright : C.ink, shadow: true, maxWidth: LW - 42,
      });
      MK.text(ctx, LX + LW - 6, ry + 2, String(sourceTag(f.source)).toUpperCase(), { size: 'xs', color: '#8a7a5c', align: 'right' });
      if (on) UI.cursor(ctx, LX + 3, ry, this.t);
      this.rowRects.push({ x: LX + 3, y: ry - 1, w: LW - 8, h: rowH, i: idx });
    }
    UI.popClip(ctx);
    if (list.length > rows) scrollHint(ctx, LX + LW - 4, CONTENT_Y + 4, rowH * rows, top, rows, list.length);

    const DX = 175, DW = VIEW_W - DX - 3;
    UI.panel(ctx, DX, CONTENT_Y, DW, CONTENT_H, { style: 'window' });
    const f = list[sel];
    this._paneRect = { x: DX, y: CONTENT_Y, w: DW, h: CONTENT_H };
    if (!f) return;
    const dx = DX + 7, dw = DW - 14;
    MK.title(ctx, dx, CONTENT_Y + 5, f.name, { maxWidth: dw });
    let cx = dx;
    cx += (safe(() => MK.chip(ctx, cx, CONTENT_Y + 16, sourceLabel(f.source), { color: C.blue }), 0) || 0) + 3;
    if (f.level) cx += (safe(() => MK.chip(ctx, cx, CONTENT_Y + 16, `Level ${f.level}`, { color: C.goldDim }), 0) || 0) + 3;
    if (f.uses && f.uses.max) safe(() => MK.chip(ctx, cx, CONTENT_Y + 16, `${f.uses.max} / ${f.uses.recharge || 'long'} rest`, { color: C.green }));

    const body = [f.desc || 'No further rules text.', mechSummary(f.mech)].filter(Boolean).join('\n\n');
    this._drawScrollBody(ctx, dx, CONTENT_Y + 29, dw, CONTENT_H - 34, body);
  }

  // --- GEAR ---------------------------------------------------------------

  _drawGear(ctx, ch) {
    const LX = 3, LW = 190;
    UI.panel(ctx, LX, CONTENT_Y, LW, CONTENT_H, { style: 'window' });
    const ix = LX + 6, iw = LW - 12;
    let ty = sectionHead(ctx, ix, CONTENT_Y + 5, iw, 'EQUIPPED');
    const sel = clamp(this.cursor[this.section], 0, EQUIP_SLOTS.length - 1);
    const rowH = 13;
    for (let i = 0; i < EQUIP_SLOTS.length; i++) {
      const slot = EQUIP_SLOTS[i];
      const ry = ty + i * rowH;
      const on = i === sel;
      if (on) UI.highlight(ctx, ix - 3, ry - 1, iw + 6, rowH - 1, { alpha: 0.2 });
      MK.text(ctx, ix + 5, ry + 3, String(SLOT_NAMES[slot] || titleCase(slot)).toUpperCase(), {
        size: 'xs', color: on ? C.goldBright : '#9c8b6c', maxWidth: 40,
      });
      const inst = this._instFor(ch, slot);
      const d = inst ? (safe(() => itemDef(inst), null) || safe(() => resolveItem(inst.id), null)) : null;
      const NX = ix + 46;
      if (d) {
        UI.icon(ctx, itemIcon(d), NX, ry, 9, null);
        // The name and its numbers share one budget: the numbers are fine
        // type, so they take a third of the room the body face would.
        const stat = d.kind === 'weapon' ? safe(() => weaponLine(d), '') : safe(() => armorLine(d), '');
        const avail = iw - 58;
        const statW = stat ? Math.min(MK.measure(stat), Math.max(30, avail - 4 - UI.measure(d.name, 'sm'))) : 0;
        txt(ctx, NX + 12, ry + 1, d.name, {
          size: 'sm', color: itemColor(inst.id, d), shadow: true, maxWidth: avail - statW - (statW ? 4 : 0),
        });
        if (stat) MK.text(ctx, ix + iw, ry + 2.5, stat, { color: '#a8987a', align: 'right', maxWidth: statW });
      } else {
        MK.text(ctx, NX, ry + 2.5, 'empty', { color: '#6a5d48' });
      }
      if (on) UI.cursor(ctx, ix - 3, ry + 1, this.t);
      this.rowRects.push({ x: ix - 3, y: ry - 1, w: iw + 6, h: rowH, i });
    }

    const DX = 197, DW = VIEW_W - DX - 3;
    UI.panel(ctx, DX, CONTENT_Y, DW, CONTENT_H, { style: 'window' });
    this._paneRect = { x: DX, y: CONTENT_Y, w: DW, h: CONTENT_H };
    const slot = EQUIP_SLOTS[sel];
    const inst = this._instFor(ch, slot);
    const d = inst ? (safe(() => itemDef(inst), null) || safe(() => resolveItem(inst.id), null)) : null;
    const dx = DX + 7, dw = DW - 14;
    MK.section(ctx, dx, CONTENT_Y + 5, dw, SLOT_NAMES[slot] || titleCase(slot));
    if (!d) {
      txt(ctx, dx, CONTENT_Y + 17, 'Nothing equipped here.', { size: 'md', color: C.inkDim, shadow: true, maxWidth: dw });
      txt(ctx, dx, CONTENT_Y + 30, `Press ${keyFor('confirm')} to fit something from the pack.`, {
        size: 'sm', color: C.disabled, shadow: true, maxWidth: dw,
      });
      return;
    }
    MK.title(ctx, dx, CONTENT_Y + 15, d.name, { color: itemColor(inst.id, d), maxWidth: dw });
    MK.text(ctx, dx, CONTENT_Y + 26, `${titleCase(String(d.kind || ''))} · ${rarityName(d)} · ${num(d.weight, 0)} lb`, {
      color: C.inkDim, maxWidth: dw,
    });
    const stat = d.kind === 'weapon' ? safe(() => weaponLine(d), '') : safe(() => armorLine(d), '');
    if (stat) txt(ctx, dx, CONTENT_Y + 33, stat, { size: 'sm', color: C.goldBright, shadow: true, maxWidth: dw });
    if (d.mastery) {
      const mi = safe(() => masteryInfo(d.mastery), null);
      if (mi && mi.name) MK.para(ctx, dx, CONTENT_Y + 43, dw, `Mastery: ${mi.name} — ${mi.desc || ''}`, {
        color: C.purple, maxLines: 2,
      });
    }
    const body = [d.desc || '', mechSummary(d.mech)].filter(Boolean).join('\n\n');
    this._drawScrollBody(ctx, dx, CONTENT_Y + 56, dw, CONTENT_H - 60, body);
  }

  /** The equip chooser, drawn over the detail pane with live AC/damage deltas. */
  _drawPack(ctx, ch) {
    const p = this.pack;
    UI.scrim(ctx, 0.45);
    const w = 250, rows = Math.min(8, p.list.length);
    const h = 34 + rows * 12 + 26;
    const x = R((VIEW_W - w) / 2), y = clamp(R((VIEW_H - h) / 2), 8, VIEW_H - h - 6);
    UI.window(ctx, x, y, w, h, SLOT_NAMES[p.slot] || titleCase(p.slot), { style: 'window' });

    let top = num(p.top, 0);
    if (p.index < top) top = p.index;
    if (p.index > top + rows - 1) top = p.index - rows + 1;
    p.top = clamp(top, 0, Math.max(0, p.list.length - rows));
    p.rects = [];

    for (let i = 0; i < rows && p.top + i < p.list.length; i++) {
      const idx = p.top + i;
      const e = p.list[idx];
      const ry = y + 8 + i * 12;
      const on = idx === p.index;
      if (on) UI.highlight(ctx, x + 5, ry - 1, w - 10, 12, { alpha: 0.22 });
      if (e.src === 'none') {
        txt(ctx, x + 14, ry + 1, 'Take it off', { size: 'sm', color: on ? C.goldBright : C.inkDim, shadow: true });
      } else {
        UI.icon(ctx, itemIcon(e.def), x + 12, ry, 9, null);
        txt(ctx, x + 24, ry + 1, itemName(e.id, e.def), {
          size: 'sm', color: itemColor(e.id, e.def), shadow: true, maxWidth: w - 96,
        });
        const tag = e.src === 'pack' ? `pack${e.qty > 1 ? ` x${e.qty}` : ''}` : 'carried';
        txtR(ctx, x + w - 8, ry + 1, tag, { size: 'sm', color: C.disabled, shadow: true });
      }
      if (on) UI.cursor(ctx, x + 5, ry + 1, this.t);
      p.rects.push({ x: x + 5, y: ry - 1, w: w - 10, h: 12, i: idx });
    }

    // The deltas: computed by really equipping it onto a clone and recalculating.
    // Cached per (member, slot, choice) so we clone once, not once per frame.
    const pick = p.list[p.index];
    const dy = y + 10 + rows * 12;
    UI.divider(ctx, x + 8, dy, w - 16);
    const key = `${ch.uid}|${p.slot}|${p.index}|${arr(ch.inventory).length}`;
    if (!this._preview || this._preview.key !== key) {
      this._preview = {
        key,
        ch: pick ? previewEquip(ch, pick.src === 'none' ? null : instFor(pick), p.slot) : null,
      };
    }
    const after = this._preview.ch;
    if (!after) {
      txt(ctx, x + 10, dy + 5, 'No change to show.', { size: 'sm', color: C.disabled, shadow: true });
    } else {
      let cx = x + 10;
      cx += deltaChip(ctx, cx, dy + 4, 'AC', acOf(ch), acOf(after)) + 3;
      cx += deltaChip(ctx, cx, dy + 4, 'HP', maxHpOf(ch), maxHpOf(after)) + 3;
      cx += deltaChip(ctx, cx, dy + 4, 'DMG', bestDamage(ch), bestDamage(after)) + 3;
      cx += deltaChip(ctx, cx, dy + 4, 'SPD', speedOf(ch), speedOf(after)) + 3;
      deltaChip(ctx, cx, dy + 4, 'INI', initiativeMod(ch), initiativeMod(after));
    }
    txtC(ctx, x + w / 2, dy + 15, `${keyFor('confirm')} fit  ·  ${keyFor('cancel')} back`, {
      size: 'sm', color: C.disabled, shadow: true,
    });
  }

  // --- EFFECTS ------------------------------------------------------------

  _drawEffects(ctx, ch) {
    const list = this._effectList(ch);
    const LX = 3, LW = 168;
    UI.panel(ctx, LX, CONTENT_Y, LW, CONTENT_H, { style: 'window' });
    const ix = LX + 6, iw = LW - 12;
    const conc = safe(() => isConcentrating(ch), false);
    const concName = conc && ch.concentration ? (SPELLS[ch.concentration.spellId] || {}).name : null;
    txt(ctx, ix, CONTENT_Y + 5, conc ? `Concentrating: ${concName || 'a spell'}` : 'Not concentrating', {
      size: 'sm', color: conc ? C.purple : C.disabled, shadow: true, maxWidth: iw,
    });
    const ex = num(safe(() => exhaustionLevel(ch), 0), 0);
    if (ex > 0) txt(ctx, ix, CONTENT_Y + 14, `Exhaustion ${ex} — ${ex * 2} penalty to d20 tests`, {
      size: 'sm', color: C.bad, shadow: true, maxWidth: iw,
    });

    let ty = sectionHead(ctx, ix, CONTENT_Y + 24, iw, 'ACTIVE');
    const sel = clamp(this.cursor[this.section], 0, Math.max(0, list.length - 1));
    const rowH = 12, rows = 11;
    let top = this.top[this.section];
    if (sel < top) top = sel;
    if (sel > top + rows - 1) top = sel - rows + 1;
    this.top[this.section] = top = clamp(top, 0, Math.max(0, list.length - rows));

    if (!list.length) txt(ctx, ix, ty + 4, 'Hale and clear-headed.', { size: 'sm', color: C.inkDim, shadow: true });
    for (let i = 0; i < rows && top + i < list.length; i++) {
      const idx = top + i;
      const e = list[idx];
      const ry = ty + i * rowH;
      const on = idx === sel;
      if (on) UI.highlight(ctx, ix - 3, ry - 1, iw + 6, rowH, { alpha: 0.2 });
      UI.icon(ctx, e.icon, ix + 6, ry, 9, e.color);
      txt(ctx, ix + 18, ry + 1, e.name, {
        size: 'sm', color: on ? C.goldBright : e.color, shadow: true, maxWidth: iw - 52,
      });
      MK.text(ctx, ix + iw, ry + 2.5, durText(e.dur), { color: '#8a7a5c', align: 'right' });
      if (on) UI.cursor(ctx, ix - 3, ry + 1, this.t);
      this.rowRects.push({ x: ix - 3, y: ry - 1, w: iw + 6, h: rowH, i: idx });
    }

    const DX = 175, DW = VIEW_W - DX - 3;
    UI.panel(ctx, DX, CONTENT_Y, DW, CONTENT_H, { style: 'window' });
    this._paneRect = { x: DX, y: CONTENT_Y, w: DW, h: CONTENT_H };
    const e = list[sel];
    const dx = DX + 7, dw = DW - 14;
    if (!e) {
      txtC(ctx, DX + DW / 2, CONTENT_Y + 76, 'Nothing to explain.', { size: 'sm', color: C.disabled });
      return;
    }
    MK.title(ctx, dx, CONTENT_Y + 5, e.name, { color: e.color, maxWidth: dw });
    let cx = dx;
    cx += (safe(() => MK.chip(ctx, cx, CONTENT_Y + 16, e.kind === 'condition' ? 'Condition' : 'Effect', { color: C.blue }), 0) || 0) + 3;
    cx += (safe(() => MK.chip(ctx, cx, CONTENT_Y + 16, durText(e.dur, true), { color: C.goldDim }), 0) || 0) + 3;
    if (e.conc) cx += (safe(() => MK.chip(ctx, cx, CONTENT_Y + 16, 'Concentration', { color: C.purple }), 0) || 0) + 3;
    if (e.source) safe(() => MK.chip(ctx, cx, CONTENT_Y + 16, `from ${String(e.source).slice(0, 14)}`, { color: C.inkDim }));
    this._drawScrollBody(ctx, dx, CONTENT_Y + 29, dw, CONTENT_H - 34, e.desc || '');
  }

  // --- ATTACKS ------------------------------------------------------------

  _drawAttacks(ctx, ch) {
    const list = this._attackList(ch);
    const LX = 3, LW = 214;
    UI.panel(ctx, LX, CONTENT_Y, LW, CONTENT_H, { style: 'window' });
    const ix = LX + 6, iw = LW - 12;
    // Three real columns, each with its own budget. Before: the name took a
    // flat 104px ending at ix+121 while the right-aligned HIT opened at ix+99
    // ("Jallarzi's Storm of Radiance" over "DC 14"), and HIT's right edge and
    // DAMAGE's left edge were the same pixel ("+8" welded to "2d6+5").
    const NAME_X = ix + 17;
    const HIT_R = ix + 134, HIT_W = 22;      // right edge / width of the to-hit column (fine)
    const DMG_W = 64;                        // damage column, right-aligned on ix+iw (fine)
    const NAME_W = (HIT_R - HIT_W - 3) - NAME_X;
    let ty = sectionHead(ctx, ix, CONTENT_Y + 5, iw, 'ATTACK OPTIONS');
    MK.text(ctx, HIT_R, ty, 'HIT', { size: 'xs', color: '#8a7a5c', align: 'right' });
    MK.text(ctx, ix + iw, ty, 'DAMAGE', { size: 'xs', color: '#8a7a5c', align: 'right' });
    ty += 6;

    const sel = clamp(this.cursor[this.section], 0, Math.max(0, list.length - 1));
    const rowH = 12, rows = 11;
    let top = this.top[this.section];
    if (sel < top) top = sel;
    if (sel > top + rows - 1) top = sel - rows + 1;
    this.top[this.section] = top = clamp(top, 0, Math.max(0, list.length - rows));

    if (!list.length) txt(ctx, ix, ty + 4, 'Nothing but bare fists.', { size: 'sm', color: C.inkDim, shadow: true });
    for (let i = 0; i < rows && top + i < list.length; i++) {
      const idx = top + i;
      const a = list[idx];
      const ry = ty + i * rowH;
      const on = idx === sel;
      if (on) UI.highlight(ctx, ix - 3, ry - 1, iw + 6, rowH, { alpha: 0.2 });
      UI.icon(ctx, a.kind === 'spell' ? 'mana' : 'sword', ix + 5, ry, 9, a.enabled ? null : C.disabled);
      txt(ctx, NAME_X, ry + 1, a.name, {
        size: 'sm', color: a.enabled ? (on ? C.goldBright : C.ink) : C.disabled, shadow: true, maxWidth: NAME_W,
      });
      MK.text(ctx, HIT_R, ry + 2.5, a.hit, { size: 'fineb', color: a.enabled ? C.goldBright : C.disabled, align: 'right', maxWidth: HIT_W });
      MK.text(ctx, ix + iw, ry + 2.5, a.line, { color: a.enabled ? C.ink : C.disabled, align: 'right', maxWidth: DMG_W });
      if (on) UI.cursor(ctx, ix - 3, ry + 1, this.t);
      this.rowRects.push({ x: ix - 3, y: ry - 1, w: iw + 6, h: rowH, i: idx });
    }

    const DX = 221, DW = VIEW_W - DX - 3;
    UI.panel(ctx, DX, CONTENT_Y, DW, CONTENT_H, { style: 'window' });
    this._paneRect = { x: DX, y: CONTENT_Y, w: DW, h: CONTENT_H };
    const a = list[sel];
    const dx = DX + 7, dw = DW - 14;
    if (!a) return;
    MK.title(ctx, dx, CONTENT_Y + 5, a.name, { maxWidth: dw });
    const rows2 = [
      ['To hit', a.hit],
      ['Damage', a.line],
      ['Range', a.range],
      ['Costs', titleCase(String(a.cost))],
    ];
    rows2.forEach((r, i) => MK.kv(ctx, dx, CONTENT_Y + 18 + i * 7, dw, r[0], r[1], { color: C.inkBright }));
    let by = CONTENT_Y + 50;
    if (a.mastery) {
      const mi = safe(() => masteryInfo(a.mastery), null);
      txt(ctx, dx, by, `Mastery: ${(mi && mi.name) || titleCase(a.mastery)}`, { size: 'sm', color: C.purple, shadow: true, maxWidth: dw });
      by += 9;
      if (mi && mi.desc) { const r = UI.textWrapped(ctx, dx, by, dw, mi.desc, { size: 'sm', color: C.ink, maxLines: 3 }); by += r.height + 2; }
    }
    if (arr(a.props).length) {
      let cx = dx;
      for (const p of arr(a.props).slice(0, 5)) {
        const w = safe(() => MK.chip(ctx, cx, by, titleCase(String(p)), { color: C.blue }), 0) || 0;
        cx += w + 2;
        if (cx > dx + dw - 26) { cx = dx; by += 10; }
      }
      by += 12;
    }
    if (!a.enabled && a.reason) txt(ctx, dx, by, a.reason, { size: 'sm', color: C.bad, shadow: true, maxWidth: dw });
    else if (a.spell) this._drawScrollBody(ctx, dx, by, dw, CONTENT_Y + CONTENT_H - by - 4, a.spell.desc || '');
    else if (a.item && a.item.desc) this._drawScrollBody(ctx, dx, by, dw, CONTENT_Y + CONTENT_H - by - 4, a.item.desc);
  }

  // --- ROSTER -------------------------------------------------------------

  _drawRoster(ctx) {
    const active = Party.members;
    const reserve = arr(Party.reserve);
    const LX = 3, LW = 194;
    UI.panel(ctx, LX, CONTENT_Y, LW, CONTENT_H, { style: 'window' });
    let ty = sectionHead(ctx, LX + 6, CONTENT_Y + 5, LW - 12, 'MARCHING ORDER', this.col === 0 ? C.gold : C.goldDim);
    active.forEach((ch, i) => {
      const ry = ty + i * 30;
      const on = this.col === 0 && this.cursor[this.section] === i;
      const grabbed = this.grab === i;
      if (on) UI.highlight(ctx, LX + 4, ry - 1, LW - 8, 28, { alpha: grabbed ? 0.34 : 0.2 });
      txt(ctx, LX + 7, ry + 9, String(i + 1), { size: 'md', color: grabbed ? C.goldBright : C.goldDim, shadow: true });
      drawMemberCell(ctx, ch, LX + 14, ry, LW - 22, 28, { selected: on });
      if (Party.autoBattle[ch.uid]) safe(() => MK.chip(ctx, LX + LW - 26, ry + 1, 'AI', { color: C.cyan }));
      if (grabbed) txtR(ctx, LX + LW - 6, ry + 18, '↕ moving', { size: 'sm', color: C.goldBright, shadow: true });
      if (on) UI.cursor(ctx, LX + 4, ry + 9, this.t);
      this.rowRects.push({ x: LX + 4, y: ry - 1, w: LW - 8, h: 28, i, col: 0 });
    });
    MK.text(ctx, LX + LW / 2, CONTENT_Y + CONTENT_H - 10, 'The first in line leads the way.', {
      color: '#8a7a5c', align: 'center', maxWidth: LW - 10,
    });

    const RX = 201, RW = VIEW_W - RX - 3;
    UI.panel(ctx, RX, CONTENT_Y, RW, CONTENT_H, { style: 'window' });
    ty = sectionHead(ctx, RX + 6, CONTENT_Y + 5, RW - 12, 'AT THE STONEHILL INN', this.col === 1 ? C.gold : C.goldDim);
    if (!reserve.length) {
      MK.para(ctx, RX + 8, ty + 3, RW - 16, 'No one is waiting on the bench. Companions you leave behind wait here, and rejoin when you come back for them.', { color: C.inkDim });
    }
    reserve.slice(0, 5).forEach((ch, i) => {
      const ry = ty + i * 30;
      const on = this.col === 1 && this.cursor[this.section] === i;
      if (on) UI.highlight(ctx, RX + 4, ry - 1, RW - 8, 28, { alpha: 0.2 });
      drawMemberCell(ctx, ch, RX + 6, ry, RW - 14, 28, { selected: on });
      if (Party.autoBattle[ch.uid]) safe(() => MK.chip(ctx, RX + RW - 26, ry + 1, 'AI', { color: C.cyan }));
      if (on) UI.cursor(ctx, RX + 4, ry + 9, this.t);
      this.rowRects.push({ x: RX + 4, y: ry - 1, w: RW - 8, h: 28, i, col: 1 });
    });
  }

  // --- shared scrolling text body ----------------------------------------

  _drawScrollBody(ctx, x, y, w, h, body) {
    // Rules text is prose that explains, so it is set in the fine face: twice
    // the words in the same pane, and most of them no longer need scrolling.
    const lines = MK.wrap(String(body || ''), w - 5);
    const lineH = 6;
    const visible = Math.max(1, Math.floor(h / lineH));
    this._maxScroll = Math.max(0, lines.length - visible);
    const off = clamp(R(this.scroll), 0, this._maxScroll);
    UI.pushClip(ctx, x - 2, y - 2, w + 4, h + 3);
    for (let i = 0; i < visible && off + i < lines.length; i++) {
      MK.text(ctx, x, y + i * lineH, lines[off + i], { color: C.ink, shadow: 'rgba(0,0,0,0.7)' });
    }
    UI.popClip(ctx);
    MK.scroll(ctx, x + w - 3, y, visible * lineH, off, visible, lines.length);
  }
}

// --- party-sheet helpers ---------------------------------------------------

function instFor(pick) {
  if (!pick || pick.src === 'none') return null;
  if (pick.src === 'own') return pick.entry;
  return safe(() => makeItemInstance(pick.id), null) || { uid: 'preview', id: pick.id, qty: 1 };
}

function slotAccepts(slot, d) {
  if (!d) return false;
  const natural = safe(() => slotFor(d.id), null);
  if (slot === 'mainHand') return d.kind === 'weapon';
  if (slot === 'offHand') return d.kind === 'shield' || (d.kind === 'weapon' && arr(d.props).indexOf('light') >= 0) || d.offHandOk;
  if (slot === 'armor') return d.kind === 'armor';
  if (slot === 'ammo') return d.kind === 'ammo';
  if (slot === 'ring1' || slot === 'ring2') return d.kind === 'ring' || natural === 'ring';
  return natural === slot || d.kind === slot;
}

function rangeLabel(range) {
  if (Array.isArray(range)) return `${range[0]}/${range[1]} ft.`;
  return `${num(range, 5) || 5} ft.`;
}

function durText(dur, long) {
  if (dur == null) return long ? 'Until removed' : '—';
  if (!Number.isFinite(Number(dur))) return String(dur);
  const n = Math.max(0, Math.round(Number(dur)));
  return long ? `${n} round${n === 1 ? '' : 's'} left` : `${n}r`;
}

function sourceTag(src) {
  const s = String(src || '');
  if (s.indexOf('species') === 0 || s.indexOf('lineage') === 0) return 'race';
  if (s.indexOf('subclass') === 0) return 'sub';
  if (s.indexOf('class') === 0) return 'class';
  if (s.indexOf('feat') === 0) return 'feat';
  if (s.indexOf('background') === 0) return 'bg';
  if (s.indexOf('style') === 0) return 'style';
  return 'misc';
}
function sourceLabel(src) {
  const s = String(src || '');
  const i = s.indexOf(':');
  const kind = i < 0 ? s : s.slice(0, i);
  const id = i < 0 ? '' : s.slice(i + 1);
  const nice = { species: 'Species', lineage: 'Lineage', subclass: 'Subclass', class: 'Class', feat: 'Feat', background: 'Background', style: 'Fighting Style' }[kind] || titleCase(kind || 'Feature');
  return id ? `${nice}: ${titleCase(id.replace(/-/g, ' '))}` : nice;
}

/** Turn a `mech` block into readable bullet lines for the sheet. */
function mechSummary(mech) {
  if (!mech || typeof mech !== 'object') return '';
  const out = [];
  const push = (s) => { if (s) out.push(`· ${s}`); };
  if (mech.asi) {
    const bits = Object.keys(mech.asi).map((k) => `${ABILITY_ABBR[k] || titleCase(k)} ${signed(mech.asi[k])}`);
    if (bits.length) push(bits.join(', '));
  }
  if (mech.speedBonus) push(`Speed ${signed(mech.speedBonus)} ft.`);
  if (mech.darkvision) push(`Darkvision ${mech.darkvision} ft.`);
  if (arr(mech.resist).length) push(`Resistance to ${arr(mech.resist).join(', ')}`);
  if (arr(mech.immune).length) push(`Immune to ${arr(mech.immune).join(', ')}`);
  if (arr(mech.condImmune).length) push(`Cannot be ${arr(mech.condImmune).join(', ')}`);
  if (arr(mech.advSaveVs).length) push(`Advantage on saves vs ${arr(mech.advSaveVs).join(', ')}`);
  if (arr(mech.skillProf).length) push(`Proficiency: ${arr(mech.skillProf).map((s) => (SKILLS[s] || {}).name || titleCase(s)).join(', ')}`);
  if (arr(mech.skillExpertise).length) push(`Expertise: ${arr(mech.skillExpertise).map((s) => (SKILLS[s] || {}).name || titleCase(s)).join(', ')}`);
  if (mech.extraAttack) push(`Extra Attack x${mech.extraAttack}`);
  if (mech.critRange) push(`Critical on ${mech.critRange}-20`);
  if (mech.maxHpBonus) push(`Maximum hit points ${signed(mech.maxHpBonus)}`);
  if (mech.hpPerLevel) push(`${signed(mech.hpPerLevel)} hit point per level`);
  if (mech.initiativeBonus) push(`Initiative ${signed(mech.initiativeBonus)}`);
  if (mech.acFormula) push(`AC ${mech.acFormula.base}${mech.acFormula.addDex ? ' + Dex' : ''}`);
  if (mech.unarmedDie) push(`Unarmed strike ${mech.unarmedDie}`);
  if (mech.resource) push(`${mech.resource.name || titleCase(mech.resource.id || '')}: ${mech.resource.max} per ${mech.resource.recharge || 'long'} rest`);
  return out.join('\n');
}

/** progression.xpProgress returns a plain 0..1 number; tolerate an object too. */
function clampPct(prog) {
  if (prog == null) return 0;
  if (Number.isFinite(prog)) return clamp(Number(prog), 0, 1);
  if (Number.isFinite(prog.pct)) return clamp(prog.pct, 0, 1);
  const into = num(prog.into, 0), span = num(prog.span, 0);
  return span > 0 ? clamp(into / span, 0, 1) : 0;
}

function scrollHint(ctx, x, y, h, top, rows, total) {
  const th = Math.max(6, Math.round((rows / total) * h));
  const maxTop = Math.max(1, total - rows);
  const ty = y + Math.round(((h - th) * top) / maxTop);
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(R(x), R(y), 3, R(h));
  ctx.fillStyle = C.goldDim;
  ctx.fillRect(R(x), R(ty), 3, th);
  ctx.restore();
}

/** Every spell id the character has access to, prepared or not. */
function spellIdsFor(ch) {
  const out = [];
  const seen = Object.create(null);
  const add = (id) => { if (id && !seen[id] && SPELLS[id]) { seen[id] = 1; out.push(id); } };
  for (const id of arr(ch && ch.spells && ch.spells.cantrips)) add(id);
  for (const id of safe(() => knownSpells(ch), []) || []) add(id);
  for (const id of arr(ch && ch.spells && ch.spells.known)) add(id);
  for (const id of arr(ch && ch.spells && ch.spells.prepared)) add(id);
  for (const id of safe(() => alwaysPreparedSpells(ch), []) || []) add(id);
  return out;
}

// ===========================================================================
// 4. INVENTORY — the shared pack
// ===========================================================================

const INV_TABS = [
  { id: 'all', label: 'All', icon: 'bag' },
  { id: 'weapons', label: 'Arms', icon: 'sword' },
  { id: 'armour', label: 'Armor', icon: 'armor' },
  { id: 'consum', label: 'Use', icon: 'potion' },
  { id: 'magic', label: 'Magic', icon: 'wand' },
  { id: 'quest', label: 'Quest', icon: 'quest' },
  { id: 'misc', label: 'Misc', icon: 'gem' },
];
const SORTS = [
  { id: 'name', label: 'Name' },
  { id: 'value', label: 'Value' },
  { id: 'weight', label: 'Weight' },
  { id: 'rarity', label: 'Rarity' },
];
const RARITY_ORDER = ['common', 'uncommon', 'rare', 'very-rare', 'legendary', 'artifact'];

function inTab(tabId, d, id) {
  if (!d) return tabId === 'misc';
  switch (tabId) {
    case 'all': return true;
    case 'weapons': return d.kind === 'weapon' || d.kind === 'ammo';
    case 'armour': return d.kind === 'armor' || d.kind === 'shield';
    case 'consum': return d.kind === 'potion' || d.kind === 'scroll' || d.kind === 'food' || !!d.use;
    case 'magic': return safe(() => isMagic(id), false) || !!d.magic || (d.rarity && d.rarity !== 'common');
    case 'quest': return d.kind === 'quest';
    case 'misc': return ['weapon', 'ammo', 'armor', 'shield', 'potion', 'scroll', 'food', 'quest'].indexOf(d.kind) < 0;
    default: return true;
  }
}

/** Who, if anyone, is wearing this exact instance. */
function equippedBy(uid) {
  for (const m of Party.all()) {
    const eq = m.equipment || {};
    for (const k of Object.keys(eq)) {
      const inst = eq[k];
      if (inst && inst.uid === uid) return m;
    }
  }
  return null;
}

export class InventoryScene extends MenuScene {
  constructor(opts = {}) {
    super('inventory');
    this.opts = opts || {};
    this.tab = 0;
    this.sort = 0;
    this.index = 0;
    this.rowTop = 0;     // first visible grid row
    this.scroll = 0;     // detail-pane scroll
    this.cells = [];
    this.tabRects = [];
    this.rows = [];
  }

  get cols() { return 8; }
  get visRows() { return 6; }

  _build() {
    const tabId = INV_TABS[this.tab].id;
    const out = [];
    for (const e of arr(Party.inventory)) {
      const d = safe(() => resolveItem(e.id), null);
      if (!inTab(tabId, d, e.id)) continue;
      out.push({ entry: e, id: e.id, def: d, qty: num(e.qty, 1) });
    }
    const s = SORTS[this.sort].id;
    out.sort((a, b) => {
      const A = a.def || {}, B = b.def || {};
      if (s === 'value') return num(B.cost, 0) - num(A.cost, 0) || String(itemName(a.id, A)).localeCompare(itemName(b.id, B));
      if (s === 'weight') return num(B.weight, 0) - num(A.weight, 0) || String(itemName(a.id, A)).localeCompare(itemName(b.id, B));
      if (s === 'rarity') {
        const ra = RARITY_ORDER.indexOf(A.rarity || 'common'), rb = RARITY_ORDER.indexOf(B.rarity || 'common');
        return rb - ra || String(itemName(a.id, A)).localeCompare(itemName(b.id, B));
      }
      return String(itemName(a.id, A)).localeCompare(itemName(b.id, B));
    });
    this.rows = out;
    return out;
  }

  update(dt) {
    if (this.tick(dt)) return;
    const list = this._build();
    const n = list.length;

    const before = this.tab;
    this.tab = navPage(this.tab, INV_TABS.length);
    const tp = tabPressed(5);
    if (tp >= 0) this.tab = tp;
    if (this.tab !== before) { this.index = 0; this.rowTop = 0; this.scroll = 0; }

    const m = Input.mouse;
    for (const r of this.tabRects) {
      if (clicked(m, r.x, r.y, r.w, r.h)) { this.tab = r.i; this.index = 0; this.rowTop = 0; sfx('cursor'); return; }
    }

    if (Input.consume('interact')) {
      this.sort = (this.sort + 1) % SORTS.length;
      sfx('cursor');
      this.say(`Sorted by ${SORTS[this.sort].label.toLowerCase()}.`, false, 1.6);
      return;
    }

    if (n > 0) {
      if (listNavActive()) {
        const cols = this.cols;
        let i = clamp(this.index, 0, n - 1);
        if (Input.repeatConsume('left')) { i = (i - 1 + n) % n; sfx('cursor'); }
        if (Input.repeatConsume('right')) { i = (i + 1) % n; sfx('cursor'); }
        if (Input.repeatConsume('up')) { i = i - cols < 0 ? i : i - cols; sfx('cursor'); }
        if (Input.repeatConsume('down')) { i = i + cols >= n ? i : i + cols; sfx('cursor'); }
        if (i !== this.index) this.scroll = 0;
        this.index = i;
        const row = Math.floor(this.index / cols);
        if (row < this.rowTop) this.rowTop = row;
        if (row > this.rowTop + this.visRows - 1) this.rowTop = row - this.visRows + 1;
      }
      this.scroll = scrollPane(this.scroll, this._maxScroll || 0, m, this._paneRect);

      for (const c of this.cells) {
        if (hit(m, c.x, c.y, c.w, c.h)) {
          if (this.index !== c.i) { this.index = c.i; this.scroll = 0; sfx('cursor'); }
          if (clicked(m, c.x, c.y, c.w, c.h)) { this._itemMenu(); return; }
        }
      }
      const gw = wheelOver(m, 2, 34, 212, 160);
      if (gw) {
        this.rowTop = clamp(this.rowTop + gw, 0, Math.max(0, Math.ceil(n / this.cols) - this.visRows));
      }
      if (Input.consume('confirm')) { this._itemMenu(); return; }
    }

    if (Input.consume('cancel') || Input.consume('inventory')) this.close();
  }

  // --- actions ------------------------------------------------------------

  _sel() { return this.rows[clamp(this.index, 0, Math.max(0, this.rows.length - 1))] || null; }

  _itemMenu() {
    const it = this._sel();
    if (!it) { sfx('error'); return; }
    const d = it.def;
    const usable = !!(d && d.use);
    const slot = d ? safe(() => slotFor(it.id), null) : null;
    this.ask(itemName(it.id, d), `${titleCase(String((d && d.kind) || 'item'))} · ${rarityName(d)} · worth ${goldText((d && d.cost) || 0)}`, [
      { label: 'Use', value: 'use', disabled: !usable },
      { label: 'Equip', value: 'equip', disabled: !slot },
      { label: 'Give to…', value: 'give', disabled: Party.members.length < 2 },
      { label: 'Drop', value: 'drop', disabled: d && d.kind === 'quest', color: C.bad },
      { label: 'Back', value: null },
    ], (v) => {
      if (v === 'use') this._chooseTarget(it, 'use');
      else if (v === 'equip') this._chooseTarget(it, 'equip');
      else if (v === 'give') this._chooseTarget(it, 'give');
      else if (v === 'drop') this._confirmDrop(it);
    });
  }

  _chooseTarget(it, mode) {
    const members = Party.members;
    if (members.length === 1 && mode !== 'give') { this._apply(it, mode, members[0]); return; }
    const opts = members.map((m, i) => ({
      label: `${m.name} — ${Math.max(0, num(m.hp, 0))}/${maxHpOf(m)} hp`,
      value: i,
      disabled: mode === 'use' && isDead(m),
    }));
    opts.push({ label: 'Back', value: null });
    const title = mode === 'use' ? 'Use on whom?' : mode === 'equip' ? 'Equip on whom?' : 'Hand it to whom?';
    this.ask(title, itemName(it.id, it.def), opts, (v) => {
      if (v == null) return;
      this._apply(it, mode, members[v]);
    });
  }

  _apply(it, mode, ch) {
    if (!ch) return;
    if (mode === 'use') this._use(it, ch);
    else if (mode === 'equip') this._equip(it, ch);
    else if (mode === 'give') this._give(it, ch);
  }

  _equip(it, ch) {
    const slot = safe(() => slotFor(it.id), null);
    if (!slot) { this.say('That cannot be worn or wielded.', true); return; }
    const inst = safe(() => makeItemInstance(it.id), null) || { uid: `t${this.t}`, id: it.id, qty: 1 };
    if (equipInstance(ch, inst, slot, { fromPack: true })) {
      safe(() => Party.removeByUid(it.entry.uid, 1));
      sfx('item');
      this.say(`${ch.name} equips ${itemName(it.id, it.def)}.`);
      this.index = clamp(this.index, 0, Math.max(0, this._build().length - 1));
    } else {
      this.say('It will not go on.', true);
    }
  }

  _give(it, ch) {
    const qty = 1;
    safe(() => {
      const inst = makeItemInstance(it.id, { qty });
      ch.inventory = arr(ch.inventory);
      ch.inventory.push(inst);
    });
    safe(() => Party.removeByUid(it.entry.uid, qty));
    sfx('item');
    this.say(`${ch.name} takes the ${itemName(it.id, it.def).toLowerCase()}.`);
    this.index = clamp(this.index, 0, Math.max(0, this._build().length - 1));
  }

  _confirmDrop(it) {
    this.ask('Drop it?', `${itemName(it.id, it.def)} will be left behind for good.`, [
      { label: 'Drop it', value: 'yes', color: C.bad },
      { label: 'Keep it', value: null },
    ], (v) => {
      if (v !== 'yes') return;
      safe(() => Party.removeByUid(it.entry.uid, 1));
      sfx('back');
      this.say(`${itemName(it.id, it.def)} left behind.`);
      this.index = clamp(this.index, 0, Math.max(0, this._build().length - 1));
    });
  }

  /**
   * Consumables used outside a fight resolve here and now: the dice are rolled,
   * hit points move, and a floater pops over the pane so you see what happened.
   */
  _use(it, ch) {
    const d = it.def;
    const use = d && d.use;
    if (!use) { this.say('Nothing happens.', true); return; }
    const fx = { x: 305, y: 120 };
    let ok = false;
    let text = '';

    switch (use.kind) {
      case 'heal': {
        if (isDead(ch)) { this.say(`${ch.name} is beyond a potion.`, true); return; }
        const r = safe(() => rollExpr(use.dice || '2d4+2'), null) || { total: 5 };
        const got = num(safe(() => heal(ch, r.total), r.total), r.total);
        this.float(fx.x, fx.y, `+${got}`, C.hpHeal);
        sfx('heal');
        text = `${ch.name} drinks the ${itemName(it.id, d).toLowerCase()} and recovers ${got} hit points.`;
        ok = true;
        break;
      }
      case 'temphp': {
        const r = safe(() => rollExpr(use.dice || '1d4'), null) || { total: 4 };
        safe(() => addTempHp(ch, r.total));
        this.float(fx.x, fx.y, `+${r.total} temp`, C.temp);
        sfx('buff');
        text = `${ch.name} gains ${r.total} temporary hit points.`;
        ok = true;
        break;
      }
      case 'cure': {
        const list = arr(use.conditions);
        let n = 0;
        for (const cid of list) if (safe(() => removeCondition(ch, cid), false)) n++;
        if (!n) { this.say(`${ch.name} has nothing that would cure.`, true); return; }
        this.float(fx.x, fx.y, 'cured', C.good);
        sfx('heal');
        text = `${ch.name} is no longer ${list.map((c) => String(c)).join(' or ')}.`;
        ok = true;
        break;
      }
      case 'buff': {
        safe(() => addEffect(ch, {
          id: `item-${it.id}`, name: itemName(it.id, d), dur: num(use.rounds, 10),
          mech: use.mech || null, source: it.id,
        }));
        this.float(fx.x, fx.y, 'buff', C.gold);
        sfx('buff');
        text = `${itemName(it.id, d)} takes hold of ${ch.name}.`;
        ok = true;
        break;
      }
      case 'spell': {
        const sp = SPELLS[use.spellId];
        if (sp && sp.heal) {
          const dice = safe(() => spellHealDice(sp, num(use.level, sp.level)), sp.heal.dice) || sp.heal.dice;
          const r = safe(() => rollExpr(dice), null) || { total: 5 };
          const got = num(safe(() => heal(ch, r.total), r.total), r.total);
          this.float(fx.x, fx.y, `+${got}`, C.hpHeal);
          sfx('spell');
          text = `${sp.name} knits ${ch.name}'s wounds — ${got} hit points.`;
          ok = true;
        } else {
          this.say('Save that one for a fight.', true);
          return;
        }
        break;
      }
      default: {
        // Rations and the like: a nibble, and a little of the road walked off.
        const got = num(safe(() => heal(ch, 1), 1), 1);
        this.float(fx.x, fx.y, `+${got}`, C.hpHeal);
        sfx('item');
        text = `${ch.name} makes a meal of it.`;
        ok = true;
      }
    }

    if (!ok) return;
    if (num(d.charges, 0) > 0 && it.entry.charges != null) {
      it.entry.charges = Math.max(0, num(it.entry.charges, 0) - 1);
      if (it.entry.charges <= 0) safe(() => Party.removeByUid(it.entry.uid, 1));
    } else if (d.kind === 'potion' || d.kind === 'scroll' || d.kind === 'food' || use.consumed !== false) {
      safe(() => Party.removeByUid(it.entry.uid, 1));
    }
    safe(() => bus.emit(EV.LOG, { text, kind: 'item' }));
    this.say(text);
    this.index = clamp(this.index, 0, Math.max(0, this._build().length - 1));
  }

  // --- drawing ------------------------------------------------------------

  draw(ctx) {
    MK.desk(ctx);
    this.cells = [];
    this.tabRects = [];
    const list = this.rows.length ? this.rows : this._build();

    // Running head: the pack's name, its load and the purse.
    MK.header(ctx, 'The Company Pack');
    const w = packWeight(), cap = partyCapacity();
    const over = w > cap;
    const loadCol = over ? C.bad : (w > cap * 0.8 ? C.warn : C.green);
    MK.text(ctx, 150, 4, 'LOAD', { size: 'xs', color: '#8a7a5c' });
    MK.meter(ctx, 150, 9.5, 80, 2.5, cap > 0 ? w / cap : 0, { color: loadCol });
    MK.text(ctx, 230, 4, `${w} / ${cap} lb`, { color: over ? C.bad : C.ink, align: 'right' });
    if (over) MK.text(ctx, 236, 7, 'Overloaded: every step is a struggle', { size: 'fineb', color: C.bad });
    UI.icon(ctx, 'coin', VIEW_W - 60, 3.5, 9, C.gold);
    txtR(ctx, VIEW_W - 8, 4.5, goldText(Party.gold), { size: 'md', color: C.goldBright, shadow: true });

    // Filter tabs.
    MK.tabs(ctx, 2, 19, VIEW_W - 4, INV_TABS.map((t) => ({ label: t.label, icon: t.icon })), this.tab, {});
    const tw = Math.floor((VIEW_W - 4) / INV_TABS.length);
    for (let i = 0; i < INV_TABS.length; i++) this.tabRects.push({ x: 2 + i * tw, y: 19, w: tw, h: 13, i });

    // Grid: each cell a sunken well, the icon at twice its size, the count in
    // the corner and a cyan lozenge on anything someone is wearing.
    const GX = 3, GY = 36, cell = 24, gap = 2;
    UI.panel(ctx, GX - 1, GY - 4, this.cols * (cell + gap) + 4, this.visRows * (cell + gap) + 6, { style: 'inset' });
    const totalRows = Math.max(1, Math.ceil(list.length / this.cols));
    this.rowTop = clamp(this.rowTop, 0, Math.max(0, totalRows - this.visRows));
    for (let r = 0; r < this.visRows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const idx = (this.rowTop + r) * this.cols + c;
        const cx = GX + c * (cell + gap), cy = GY + r * (cell + gap);
        const it = list[idx];
        MK.well(ctx, cx, cy, cell, cell, it ? 'rgba(10,7,5,0.62)' : 'rgba(6,5,8,0.4)');
        if (!it) continue;
        this.cells.push({ x: cx, y: cy, w: cell, h: cell, i: idx });
        const col = itemColor(it.id, it.def);
        const rare = it.def && it.def.rarity && it.def.rarity !== 'common';
        if (rare) {
          // a glow of the rarity's colour under the icon, and a hairline of it round the cell
          const g = ctx.createRadialGradient(cx + cell / 2, cy + cell / 2, 1, cx + cell / 2, cy + cell / 2, cell * 0.6);
          g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.save(); ctx.globalAlpha = 0.22; ctx.fillStyle = g; ctx.fillRect(cx, cy, cell, cell); ctx.restore();
          ctx.save(); ctx.globalAlpha = 0.8;
          ctx.fillStyle = col;
          ctx.fillRect(cx, cy, cell, 0.5); ctx.fillRect(cx, cy + cell - 0.5, cell, 0.5);
          ctx.fillRect(cx, cy, 0.5, cell); ctx.fillRect(cx + cell - 0.5, cy, 0.5, cell);
          ctx.restore();
        }
        UI.icon(ctx, itemIcon(it.def), cx + 4, cy + 4, 16, null);
        if (it.qty > 1) MK.text(ctx, cx + cell - 1.5, cy + cell - 5, String(it.qty), { size: 'fineb', color: C.inkBright, align: 'right', shadow: 'rgba(0,0,0,0.95)' });
        if (equippedBy(it.entry.uid)) MK.bullet(ctx, cx + 3, cy + 3, C.cyan);
        if (idx === this.index) UI.frameSel(ctx, cx - 1, cy - 1, cell + 2, cell + 2, this.t);
      }
    }
    if (totalRows > this.visRows) {
      MK.scroll(ctx, GX + this.cols * (cell + gap) - 1, GY, this.visRows * (cell + gap) - gap, this.rowTop, this.visRows, totalRows);
    }

    // Sort line under the grid.
    const sy = GY + this.visRows * (cell + gap) + 2;
    MK.text(ctx, GX + 2, sy, `Sorted by ${String(SORTS[this.sort].label).toLowerCase()}`, { color: '#c49a4a' });
    MK.text(ctx, GX + this.cols * (cell + gap) - 2, sy, `${list.length} of ${arr(Party.inventory).length} items`, {
      color: C.inkDim, align: 'right',
    });

    // Detail pane.
    const DX = 214, DW = VIEW_W - DX - 3, DY = 34, DH = CONTENT_BOTTOM - 34;
    UI.panel(ctx, DX, DY, DW, DH, { style: 'window' });
    this._paneRect = { x: DX, y: DY, w: DW, h: DH };
    this._drawDetail(ctx, list[this.index] || null, DX + 7, DY + 5, DW - 14, DH - 10);

    this.drawMessage(ctx, 6, MSG_Y, VIEW_W - 12);
    hintBar(ctx, HINT_Y, [
      [keyFor('cancel'), 'Back'], [keyFor('confirm'), 'Use/Equip'],
      [keyFor('interact'), 'Sort'], [`${keyFor('prev')}/${keyFor('next')}`, 'Filter'], [keyFor('run'), 'Scroll'],
    ]);
    this.drawPrompt(ctx);
    this.drawFloats(ctx);
  }

  _drawDetail(ctx, it, x, y, w, h) {
    if (!it) {
      MK.text(ctx, x + w / 2, y + h / 2 - 4, 'Nothing in the pack here.', { color: C.disabled, align: 'center' });
      return;
    }
    const d = it.def;
    // An unnamed find is a shape and a weight and nothing else. Identify, Detect
    // Magic, or the coin an appraiser charges will tell you the rest.
    const mystery = !!(it.entry && it.entry.unidentified);
    const col = mystery ? C.purple : itemColor(it.id, d);
    const shown = mystery ? unknownName(d) : itemName(it.id, d);
    // the item as a figure in a gilt frame beside its name
    MK.frame(ctx, x, y, 24, 24, { glow: 0.18 });
    UI.icon(ctx, itemIcon(d), x + 4, y + 4, 16, null);
    const nx = x + 29, nw = w - 29;
    const nameLines = MK.wrap(shown, nw, 'title');
    let ty = y + 1;
    for (const l of nameLines.slice(0, 2)) { MK.title(ctx, nx, ty, l, { color: col, maxWidth: nw }); ty += 10; }
    MK.text(ctx, nx, ty, mystery
      ? `${titleCase(String((d && d.kind) || 'item'))} · unidentified`
      : `${titleCase(String((d && d.kind) || 'item'))} · ${rarityName(d)}`, {
      color: mystery ? C.goldDim : '#a8987a', maxWidth: nw,
    });
    ty = Math.max(ty + 8, y + 28);
    if (mystery) {
      MK.kv(ctx, x, ty, w, 'Weight', `${num(d && d.weight, 0)} lb${it.qty > 1 ? ` (x${it.qty})` : ''}`);
      ty += 9;
      MK.rule(ctx, x, ty, w);
      ty += 4;
      MK.para(ctx, x, ty, w, 'The Weave clings to it and will not say why. Identify, Detect Magic or a temple appraisal will give up its name.', { color: C.inkDim });
      this._maxScroll = 0;
      return;
    }
    MK.kv(ctx, x, ty, w, 'Weight', `${num(d && d.weight, 0)} lb${it.qty > 1 ? ` (x${it.qty})` : ''}`, { color: C.inkBright });
    MK.kv(ctx, x, ty + 6.5, w, 'Value', goldText(num(d && d.cost, 0)), { color: C.goldBright });
    ty += 15;

    const stat = d && d.kind === 'weapon' ? safe(() => weaponLine(d), '') : safe(() => armorLine(d), '');
    if (stat) { txt(ctx, x, ty, stat, { size: 'sm', color: C.goldBright, shadow: true, maxWidth: w }); ty += 10; }

    const holder = equippedBy(it.entry.uid);
    if (holder) { MK.text(ctx, x, ty, `Worn by ${holder.name}`, { size: 'fineb', color: C.cyan, maxWidth: w }); ty += 7; }

    if (d && d.use) {
      const u = d.use;
      const line = u.kind === 'heal' ? `Restores ${u.dice} hit points.`
        : u.kind === 'cure' ? `Cures: ${arr(u.conditions).join(', ')}.`
          : u.kind === 'temphp' ? `Grants ${u.dice} temporary hit points.`
            : u.kind === 'spell' ? `Casts ${(SPELLS[u.spellId] || {}).name || u.spellId}.`
              : 'Consumed on use.';
      MK.text(ctx, x, ty, line, { size: 'fineb', color: C.green, maxWidth: w });
      ty += 7;
    }

    MK.rule(ctx, x, ty + 1, w);
    ty += 5;
    const body = [(d && d.desc) || 'A plain thing of no great story.', mechSummary(d && d.mech)].filter(Boolean).join('\n\n');
    const lines = MK.wrap(body, w - 5);
    const LH = 6;
    const avail = Math.max(1, Math.floor((y + h - ty) / LH));
    this._maxScroll = Math.max(0, lines.length - avail);
    const off = clamp(R(this.scroll), 0, this._maxScroll);
    UI.pushClip(ctx, x - 2, ty - 1, w + 4, y + h - ty + 1);
    for (let i = 0; i < avail && off + i < lines.length; i++) {
      MK.text(ctx, x, ty + i * LH, lines[off + i], { color: C.ink, shadow: 'rgba(0,0,0,0.7)' });
    }
    UI.popClip(ctx);
    MK.scroll(ctx, x + w - 3, ty, avail * LH, off, avail, lines.length);
  }
}

// ===========================================================================
// 5. SPELLBOOK
// ===========================================================================

const SPELL_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'prepared', label: 'Prepared' },
  { id: 'damage', label: 'Damage' },
  { id: 'heal', label: 'Healing' },
  { id: 'utility', label: 'Utility' },
  { id: 'concentration', label: 'Concentration' },
  { id: 'ritual', label: 'Ritual' },
];
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

function isCaster(ch) {
  if (!ch || !ch.spells) return false;
  if ((safe(() => knownSpells(ch), []) || []).some(id=>SPELLS[id]?.level===0)) return true;
  if (arr(ch.spells.cantrips).length || arr(ch.spells.known).length || arr(ch.spells.prepared).length) return true;
  const slots = ch.spells.slots || {};
  for (const k of Object.keys(slots)) if (num(slots[k] && slots[k].max, 0) > 0) return true;
  return num(ch.spells.pact && ch.spells.pact.max, 0) > 0;
}

export class SpellbookScene extends MenuScene {
  constructor(opts = {}) {
    super('spellbook');
    this.opts = opts || {};
    this.casters = Party.members.filter(isCaster);
    this.caster = clamp(num(opts.member, 0), 0, Math.max(0, this.casters.length - 1));
    this.filter = 0;
    this.index = 0;
    this.top = 0;
    this.scroll = 0;
    this.alpha = null;        // { index } while the A-Z jump strip is open
    this.rows = [];
    this.rowRects = [];
    this.tabRects = [];
  }

  get ch() { return this.casters[this.caster] || null; }

  enter(prev) {
    super.enter(prev);
    this.casters = Party.members.filter(isCaster);
    this.caster = clamp(this.caster, 0, Math.max(0, this.casters.length - 1));
  }

  /** Rows are the spell list grouped by level, with headers folded in. */
  _build() {
    const ch = this.ch;
    const out = [];
    if (!ch) { this.rows = out; return out; }
    const ids = [...new Set([...spellIdsFor(ch), ...arr(ch.spells?.book)])];
    const prepared = arr(ch.spells && ch.spells.prepared);
    const always = safe(() => alwaysPreparedSpells(ch), []) || [];
    const f = SPELL_FILTERS[this.filter].id;

    const keep = (sp, id) => {
      if (f === 'all') return true;
      if (f === 'prepared') return sp.level === 0 || prepared.indexOf(id) >= 0 || always.indexOf(id) >= 0;
      if (f === 'concentration') return !!sp.concentration;
      if (f === 'ritual') return !!sp.ritual;
      if (f === 'damage') return !!sp.damage || arr(sp.tags).indexOf('damage') >= 0;
      if (f === 'heal') return !!sp.heal || arr(sp.tags).indexOf('heal') >= 0;
      if (f === 'utility') return !sp.damage && !sp.heal;
      return true;
    };

    for (let lv = 0; lv <= 9; lv++) {
      const group = ids.filter((id) => SPELLS[id] && SPELLS[id].level === lv && keep(SPELLS[id], id));
      if (!group.length) continue;
      group.sort((a, b) => String(SPELLS[a].name).localeCompare(SPELLS[b].name));
      const slots = ch.spells && ch.spells.slots && ch.spells.slots[lv];
      const label = lv === 0 ? 'Cantrips'
        : `${ordinal(lv)} Level${slots && slots.max ? `  ${Math.max(0, num(slots.max, 0) - num(slots.used, 0))}/${slots.max}` : ''}`;
      out.push({ head: true, label, level: lv });
      for (const id of group) {
        out.push({
          head: false, id, level: lv, spell: SPELLS[id],
          prepared: prepared.indexOf(id) >= 0 || always.indexOf(id) >= 0 || lv === 0,
          locked: always.indexOf(id) >= 0 || lv === 0,
        });
      }
    }
    this.rows = out;
    if (this.index >= out.length) this.index = Math.max(0, out.length - 1);
    if (out[this.index] && out[this.index].head) this.index = Math.min(out.length - 1, this.index + 1);
    return out;
  }

  update(dt) {
    if (this.tick(dt)) return;
    if (!this.casters.length) {
      if (Input.consume('cancel') || Input.consume('confirm')) this.close();
      return;
    }
    const rows = this._build();

    if (this.alpha) { this._updateAlpha(rows); return; }

    const c0 = this.caster;
    this.caster = navH(this.caster, this.casters.length);
    const tp = tabPressed(5);
    if (tp >= 0 && tp < this.casters.length) this.caster = tp;
    if (this.caster !== c0) { this.index = 0; this.top = 0; this.scroll = 0; return; }

    const f0 = this.filter;
    this.filter = navPage(this.filter, SPELL_FILTERS.length);
    if (this.filter !== f0) { this.index = 0; this.top = 0; this.scroll = 0; return; }

    if (listNavActive()) {
      const n = rows.length;
      if (n) {
        let i = this.index;
        if (Input.repeatConsume('up')) { i = this._step(i, -1); sfx('cursor'); }
        if (Input.repeatConsume('down')) { i = this._step(i, 1); sfx('cursor'); }
        if (i !== this.index) { this.index = i; this.scroll = 0; }
      }
    }
    this.scroll = scrollPane(this.scroll, this._maxScroll || 0, Input.mouse, this._paneRect);

    const m = Input.mouse;
    for (const r of this.tabRects) {
      if (clicked(m, r.x, r.y, r.w, r.h)) { this.caster = r.i; this.index = 0; this.top = 0; sfx('cursor'); return; }
    }
    for (const r of this.rowRects) {
      if (hit(m, r.x, r.y, r.w, r.h)) {
        if (this.index !== r.i) { this.index = r.i; this.scroll = 0; sfx('cursor'); }
        if (clicked(m, r.x, r.y, r.w, r.h)) { this._togglePrepare(); return; }
      }
    }

    // Z casts, E prepares, and the A-Z jump strip moves to Tab — it lost its
    // key to Prepare and would otherwise have become unreachable dead code.
    if (Input.consume('party')) { this.alpha = { index: 0 }; sfx('open'); return; }
    if (Input.consume('interact')) { this._togglePrepare(); return; }
    if (Input.consume('confirm')) { this._castHere(); return; }
    if (Input.consume('cancel')) this.close();
  }

  // -------------------------------------------------------------------------
  // CASTING, STANDING HERE
  // -------------------------------------------------------------------------
  //
  // Mage Armor lasts eight hours. Light lasts one. Longstrider, Aid, Goodberry,
  // Knock — none of them are combat spells, and until now the only place a spell
  // could be cast was the battle screen, which made half the book decoration.
  // rules/fieldcast.js does the work; this only asks who it lands on.

  _castHere() {
    const ch = this.ch;
    const row = this.rows[this.index];
    if (!ch || !row || row.head) { sfx('error'); return; }

    const gate = safe(() => fieldCastable(ch, row.id), { ok: false, why: 'It will not come.' });
    if (!gate.ok) { sfx('error'); this.say(gate.why || 'Not here.', true, 2.6); return; }

    if (fieldTargeting(row.spell) === 'ally' && Party.members.length > 1) {
      const options = Party.members.map((m, i) => ({
        label: `${m.name}  ${m.hp}/${num(m.maxHp, m.hp)}`, value: i,
      }));
      this.ask(row.spell.name, 'On whom?', options, (v) => {
        if (v == null) return;
        this._doCast(ch, row, Party.members[v] || ch);
      });
      return;
    }
    this._doCast(ch, row, ch);
  }

  /**
   * @param {object} extra   answers to a previous `pending` question:
   *                         `{ destination }` for a teleport, `{ itemChoice }`
   *                         for Creation. Nothing is spent until they arrive.
   */
  _doCast(ch, row, target, extra = null) {
    const res = safe(() => fieldCast(ch, row.id, {
      target,
      party: Party,
      state: Game.state,
      world: this._worldHooks(),
      ...(extra || {}),
    }), null);

    // The spell has a question before it has a cost. fieldcast has taken
    // nothing — no slot, no component — and will not until the answer comes
    // back through `extra`.
    if (res && res.pending) { this._askPending(ch, row, target, res.pending); return; }

    if (!res || !res.ok) { sfx('error'); this.say((res && res.text) || 'Nothing happens.', true, 2.6); return; }

    // A long-range teleport moved the party's pin; the overworld moves the party.
    if (res.travel && res.travel.id) { this._teleportTo(res.travel, res.lines[0]); return; }

    if (res.minutes) safe(() => advanceTime(Game.state, res.minutes));
    // main.js already counts EV.SPELL_CAST; counting it here too double-billed
    // every out-of-combat cast in the end-of-game statistics.
    safe(() => bus.emit(EV.SPELL_CAST, { ch, spellId: row.id, field: true }));
    sfx('spell');
    // The status line shares a row with the key hints, so keep it to one clause.
    this.say(res.lines[0], false, 3.4);
    // …and float the cost over the slot pips, which is where the eye goes to
    // check what it just cost.
    this.float(40, 196, res.ritual ? 'ritual' : res.slot ? `-1 slot ${res.slot}` : 'cantrip',
      res.ritual ? C.cyan : C.gold);
  }

  /**
   * What the spellbook can reach out and touch. The overworld beneath us owns
   * the map, so ask it; when the spellbook was opened from somewhere else (a
   * rest, the title screen) the hooks are simply absent and fieldcast falls
   * back to prose.
   */
  _worldHooks() {
    const ow = safe(() => Game.scenes.find((sc) => sc && sc.id === 'overworld'), null);
    const base = (ow && typeof ow.spellHooks === 'function' && safe(() => ow.spellHooks(), null)) || {};
    // The travel list is pure GameState — where you have been — so it works
    // from the rest screen and the title screen too, where there is no
    // overworld beneath us to ask.
    if (typeof base.sites !== 'function') {
      const st = Game.state;
      base.sites = (mode) => safe(() => travelSites(st, mode, st && st.mapId), []) || [];
    }
    return base;
  }

  /**
   * Put a spell's question to the player. Teleport asks where; Creation and
   * Fabricate ask what. Cancelling costs nothing at all, which is the whole
   * point of asking before the slot is spent rather than after.
   */
  _askPending(ch, row, target, pending) {
    if (pending.kind === 'travel') {
      const sites = arr(pending.sites);
      const options = sites.map((s, i) => ({
        label: s.town ? `${s.name}  (safe)` : s.name,
        value: i,
        color: s.town ? C.good : C.ink,
      }));
      options.push({ label: 'Think better of it', value: null });
      this.ask(row.spell.name, sites.length === 1 ? 'The sanctuary you set.' : 'Somewhere you have been.', options, (v) => {
        if (v == null || !sites[v]) return;
        this._doCast(ch, row, target, { destination: sites[v] });
      });
      return;
    }
    if (pending.kind === 'item') {
      const choices = arr(pending.choices);
      const options = choices.map((c, i) => ({ label: c.name, value: i }));
      options.push({ label: 'Nothing, after all', value: null });
      this.ask(row.spell.name, 'Shape it into what?', options, (v) => {
        if (v == null || !choices[v]) return;
        this._doCast(ch, row, target, { itemChoice: choices[v].id });
      });
      return;
    }
    this.say('It waits on an answer nobody can give.', true, 2.6);
  }

  /**
   * Move the party after a teleport that has already been paid for. Same road
   * the regional map's fast travel takes, minus the hours on it — that is what
   * a 7th-level slot buys.
   */
  _teleportTo(dest, line) {
    sfx('spell');
    this.say(line || 'The world folds, and unfolds somewhere else.', false, 3.4);
    softImport('../world/overworld.js', 'overworld').then((ow) => {
      const go = ow && ow.travelTo;
      const st = Game.state;
      if (!go) {
        if (st) { st.mapId = dest.id; safe(() => toast(`You step out in ${dest.name || dest.id}.`)); }
        this.close();
        return;
      }
      Game.transition('fade', () => {
        safe(() => (Number.isFinite(dest.x) && Number.isFinite(dest.y)
          ? go(dest.id, dest.x, dest.y, dest.dir || 'down')
          : go(dest.id)));
        // Close the whole menu stack: you are somewhere else now.
        while (Game.top === this) Game.pop();
      });
    });
  }

  /** Move the cursor past group headers. */
  _step(i, dir) {
    const n = this.rows.length;
    if (!n) return 0;
    let j = i;
    for (let k = 0; k < n; k++) {
      j = (j + dir + n) % n;
      if (!this.rows[j].head) return j;
    }
    return i;
  }

  _updateAlpha(rows) {
    const a = this.alpha;
    a.index = navH(a.index, ALPHABET.length);
    if (Input.repeatConsume('up')) { a.index = (a.index - 13 + 26) % 26; sfx('cursor'); }
    if (Input.repeatConsume('down')) { a.index = (a.index + 13) % 26; sfx('cursor'); }
    if (Input.consume('confirm')) {
      const letter = ALPHABET[a.index];
      const at = rows.findIndex((r) => !r.head && String(r.spell.name).toUpperCase().charAt(0) === letter);
      this.alpha = null;
      if (at >= 0) { this.index = at; this.scroll = 0; sfx('select'); }
      else this.say(`No spell in this book begins with ${letter}.`, true);
      return;
    }
    if (Input.consume('cancel') || Input.consume('party')) { this.alpha = null; sfx('back'); }
  }

  _togglePrepare() {
    const ch = this.ch;
    const row = this.rows[this.index];
    if (!ch || !row || row.head) { sfx('error'); return; }
    const cls = arr(ch.classes)[0] || {};
    const prepared = safe(() => isPreparedCaster(cls.id, cls.subclassId), true);
    if (row.level === 0) { this.say('Cantrips are always ready.', true, 2); return; }
    if (!prepared) { this.say(`${ch.name} knows their spells by heart — nothing to prepare.`, true, 2.4); return; }
    if (row.locked) { this.say('That one is always prepared.', true, 2); return; }

    ch.spells.prepared = arr(ch.spells.prepared);
    const at = ch.spells.prepared.indexOf(row.id);
    if (at >= 0) {
      ch.spells.prepared.splice(at, 1);
      sfx('close');
      this.say(`${row.spell.name} set aside.`);
      return;
    }
    const cap = num(safe(() => preparedMax(ch), 0), 0);
    const always = (safe(() => alwaysPreparedSpells(ch), []) || []).length;
    const used = ch.spells.prepared.length;
    if (cap > 0 && used >= cap) { this.say(`${ch.name} can only hold ${cap} spells in mind.`, true); return; }
    if (!safe(() => canPrepare(ch, row.id), true)) { this.say('That spell is not on their list.', true); return; }
    ch.spells.prepared.push(row.id);
    void always;
    sfx('spell');
    this.say(`${row.spell.name} prepared.`);
  }

  // --- drawing ------------------------------------------------------------

  draw(ctx) {
    MK.desk(ctx);
    this.rowRects = [];
    this.tabRects = [];

    if (!this.casters.length) {
      UI.panel(ctx, 40, 80, VIEW_W - 80, 80, { style: 'window' });
      txtC(ctx, VIEW_W / 2, 100, 'No one here works the Weave.', { size: 'md', color: C.gold });
      txtC(ctx, VIEW_W / 2, 116, 'Recruit a cleric at the Shrine of Luck,', { size: 'sm', color: C.inkDim });
      txtC(ctx, VIEW_W / 2, 126, 'or a sellsword wizard at the Sleeping Giant.', { size: 'sm', color: C.inkDim });
      hintBar(ctx, HINT_Y, [[keyFor('cancel'), 'Back']]);
      return;
    }

    const ch = this.ch;
    const rows = this.rows.length ? this.rows : this._build();
    this._drawHeader(ctx, ch);

    // Filter strip.
    UI.panel(ctx, 2, 28, VIEW_W - 4, 12, { style: 'dark', studs: false });
    MK.keycap(ctx, 7, 30.5, keyFor('prev'));
    MK.text(ctx, 18, 32, String(SPELL_FILTERS[this.filter].label).toUpperCase(), { size: 'fineb', color: C.goldBright, letterSpacing: 2, maxWidth: 110 });
    MK.keycap(ctx, 130, 30.5, keyFor('next'));
    // Fixed slots: prepared count 152..238, concentration 242..392. The two
    // can never meet, whatever the spell is called.
    if (this._prep) {
      MK.text(ctx, 152, 32, this._prep, { color: this._prepWarn ? C.warn : '#cfc3a6', maxWidth: 86 });
    }
    const conc = safe(() => isConcentrating(ch), false);
    MK.text(ctx, VIEW_W - 8, 32, conc ? `Concentrating on ${(SPELLS[(ch.concentration || {}).spellId] || {}).name || 'a spell'}` : 'Not concentrating', {
      color: conc ? C.purple : '#6a5d48', align: 'right', maxWidth: 150,
    });

    // Spell list.
    const LX = 3, LY = 42, LW = 176, LH = 162;
    UI.panel(ctx, LX, LY, LW, LH, { style: 'window' });
    const rowH = 11, visible = 14;
    if (this.index < this.top) this.top = this.index;
    if (this.index > this.top + visible - 1) this.top = this.index - visible + 1;
    this.top = clamp(this.top, 0, Math.max(0, rows.length - visible));
    UI.pushClip(ctx, LX + 2, LY + 3, LW - 4, rowH * visible + 2);
    for (let i = 0; i < visible && this.top + i < rows.length; i++) {
      const idx = this.top + i;
      const r = rows[idx];
      const ry = LY + 5 + i * rowH;
      if (r.head) {
        MK.section(ctx, LX + 6, ry + 2.5, LW - 14, r.label);
        continue;
      }
      const on = idx === this.index;
      if (on) UI.highlight(ctx, LX + 3, ry - 1, LW - 8, rowH, { alpha: 0.2 });
      const sp = r.spell;
      const school = (SCHOOLS[sp.school] || {}).color || C.ink;
      // prepared: a filled lozenge (cyan when it can never be unprepared); not: a hollow one
      if (r.prepared) MK.bullet(ctx, LX + 10.5, ry + 3.5, r.locked ? C.cyan : C.goldBright);
      else { ctx.fillStyle = '#5a5040'; ctx.fillRect(LX + 10, ry + 2.5, 1, 2); ctx.fillRect(LX + 9.5, ry + 3, 2, 1); }
      txt(ctx, LX + 16, ry, sp.name, {
        size: 'sm', color: on ? C.goldBright : (r.prepared ? C.ink : C.inkDim), shadow: true, maxWidth: LW - 44,
      });
      let mx = LX + LW - 9;
      if (sp.ritual) { MK.text(ctx, mx, ry + 1.5, 'R', { size: 'xs', color: C.blue, align: 'right' }); mx -= 5; }
      if (sp.concentration) { MK.text(ctx, mx, ry + 1.5, 'C', { size: 'xs', color: C.purple, align: 'right' }); mx -= 5; }
      // the school's colour as a small gem
      ctx.fillStyle = '#0a0705'; ctx.fillRect(mx - 4, ry + 1, 4, 4);
      ctx.fillStyle = school; ctx.fillRect(mx - 3.5, ry + 1.5, 3, 3);
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(mx - 3.5, ry + 1.5, 1, 0.5);
      if (on) UI.cursor(ctx, LX + 2, ry, this.t);
      this.rowRects.push({ x: LX + 3, y: ry - 1, w: LW - 8, h: rowH, i: idx });
    }
    UI.popClip(ctx);
    if (rows.length > visible) scrollHint(ctx, LX + LW - 4, LY + 4, rowH * visible, this.top, visible, rows.length);

    // Detail.
    const DX = 183, DW = VIEW_W - DX - 3;
    UI.panel(ctx, DX, LY, DW, LH, { style: 'window' });
    this._paneRect = { x: DX, y: LY, w: DW, h: LH };
    this._drawSpell(ctx, ch, (rows[this.index] || {}).spell || null, DX + 7, LY + 5, DW - 14, LH - 10);

    this._drawSlots(ctx, ch, 2, 206);
    hintBar(ctx, HINT_Y, [
      [keyFor('cancel'), 'Back'], [keyFor('confirm'), 'Cast'],
      [keyFor('interact'), 'Prepare'], [`${keyFor('prev')}/${keyFor('next')}`, 'Filter'],
      [keyFor('party'), 'A-Z'],
    ]);
    this.drawStatusRight(ctx);
    if (this.alpha) this._drawAlpha(ctx);
    this.drawPrompt(ctx);
    this.drawFloats(ctx);
  }

  _drawHeader(ctx, ch) {
    UI.panel(ctx, 2, 2, VIEW_W - 4, 24, { style: 'dark' });
    const n = this.casters.length;
    const cw = Math.min(76, Math.floor(268 / Math.max(1, n)));
    for (let i = 0; i < n; i++) {
      const x = 4 + i * (cw + 2);
      const on = i === this.caster;
      UI.panel(ctx, x, 4, cw, 20, { style: on ? 'window' : 'dark', shadow: on ? 0.35 : 0.1, studs: false });
      if (on) { ctx.fillStyle = C.goldBright; ctx.fillRect(x + 2, 21.5, cw - 4, 0.5); }
      const m = this.casters[i];
      MK.portrait(ctx, m, x + 2, 6, 16, 16, { glow: on ? 0.25 : 0.1 });
      MK.title(ctx, x + 21, 7, m.name, { color: on ? C.goldBright : C.ink, maxWidth: cw - 24 });
      MK.text(ctx, x + 21, 16.5, `Level ${num(safe(() => casterLevel(m), m.level), m.level || 1)} caster`, {
        color: on ? '#d8c8a4' : C.inkDim, maxWidth: cw - 24,
      });
      this.tabRects.push({ x, y: 4, w: cw, h: 20, i });
    }
    const bx = VIEW_W - 122;
    const cls = arr(ch.classes)[0] || {};
    const prepMode = safe(() => isPreparedCaster(cls.id, cls.subclassId), true);
    const cap = num(safe(() => preparedMax(ch), 0), 0);
    const used = arr(ch.spells && ch.spells.prepared).length;
    MK.statBox(ctx, bx + 52, 4, 30, 20, 'Save DC', String(num(safe(() => spellDC(ch), 8), 8)));
    MK.statBox(ctx, bx + 84, 4, 30, 20, 'Base atk', signed(num(safe(() => spellAtk(ch), 0), 0)));
    // The prepared count used to be a third row at y=23 inside a panel whose
    // interior ends at y=23: seven glyph rows plus a shadow ran to y=31, three
    // pixels past the frame and onto the filter strip at y=28. Two 9px rows
    // are all this header holds, so the count moved to the strip below, where
    // it owns a fixed 86px slot that cannot reach the concentration readout.
    this._prep = prepMode ? `${used}/${cap} prepared` : 'Spells known';
    this._prepWarn = !!(prepMode && cap && used >= cap);
  }

  _drawSpell(ctx, ch, sp, x, y, w, h) {
    if (!sp) {
      txtC(ctx, x + w / 2, y + h / 2 - 4, 'Choose a spell.', { size: 'sm', color: C.disabled });
      return;
    }
    const school = (SCHOOLS[sp.school] || {});
    MK.title(ctx, x, y, sp.name, { color: school.color || C.goldBright, maxWidth: w });
    MK.text(ctx, x, y + 10.5, sp.level === 0 ? `${school.name || sp.school} cantrip` : `${ordinal(sp.level)}-level ${school.name || sp.school}`, {
      color: '#a8987a', maxWidth: w,
    });

    // `componentText()` returns "V, S, M (…)" for 362 of the 364 spells, and
    // the material clause runs to 935px — nine times the 97px half-column it
    // was being poured into. The letters stay in the grid; the material list
    // gets a full-width wrapped row of its own, so nothing is lost and nothing
    // leaves the pane.
    const comp = safe(() => componentText(sp), '—');
    const mat = /\(([\s\S]*)\)\s*$/.exec(comp);
    const compShort = mat ? (comp.slice(0, mat.index).replace(/[,\s]+$/, '') || 'V, S, M') : comp;

    // 97px half-columns: "Casting Time" alone is 71px, which left "1 Action"
    // 22px. "Cast Time" is 53 and the pair fits whole; ditto Duration once the
    // inner gap drops to 3.
    // Four full-width rows, not a 2x2 grid. 97px halves could not hold
    // "Casting Time" + "1 Action" (118px) or "Duration" + "Concentration, up
    // to 1 hour" (208px) — the pairs collided, and shrinking the gutter until
    // they fitted welded "Action" to the next column's "Range". At full width
    // every pair reads whole with the value hard right, for 14px of a
    // description pane that scrolls anyway.
    const rows = [
      ['Casting Time', titleCase(String(sp.castTime || 'action'))],
      ['Range', safe(() => rangeText(sp), String(sp.range))],
      ['Components', compShort],
      ['Duration', titleCase(String(sp.duration || 'instant'))],
    ];
    rows.forEach((r, i) => MK.kv(ctx, x, y + 19 + i * 6.5, w, r[0], r[1], { color: C.inkBright }));

    let ty = y + 46;
    let cx = x;
    if (sp.concentration) cx += (safe(() => MK.chip(ctx, cx, ty, 'Concentration', { color: C.purple }), 0) || 0) + 3;
    if (sp.ritual) cx += (safe(() => MK.chip(ctx, cx, ty, 'Ritual', { color: C.blue }), 0) || 0) + 3;
    if (sp.attack) cx += (safe(() => MK.chip(ctx, cx, ty, `${titleCase(sp.attack)} attack ${signed(num(safe(() => spellAtk(ch,sp.id), 0), 0))}`, { color: C.gold }), 0) || 0) + 3;
    if (sp.save) cx += (safe(() => MK.chip(ctx, cx, ty, `${ABILITY_ABBR[sp.save.ability] || sp.save.ability} save DC ${num(safe(() => spellDC(ch), 8), 8)}`, { color: C.warn }), 0) || 0) + 3;
    if (cx > x) ty += 10;

    if (mat) {
      const r = MK.para(ctx, x, ty, w, `Material: ${mat[1]}`, { color: '#a8987a', maxLines: 3 });
      ty += (r && r.height ? r.height : 5) + 3;
    }

    const lvl = num(ch.level, 1);
    if (sp.damage) {
      const dice = safe(() => spellDamageDice(sp, sp.level, lvl), sp.damage.dice) || sp.damage.dice;
      txt(ctx, x, ty, `Damage: ${dice} ${sp.damage.type || ''}`, { size: 'sm', color: C.red, shadow: true, maxWidth: w });
      ty += 9;
    }
    if (sp.heal) {
      const dice = safe(() => spellHealDice(sp, sp.level), sp.heal.dice) || sp.heal.dice;
      txt(ctx, x, ty, `Healing: ${dice}${sp.heal.mod === 'spell' ? ' + spellcasting modifier' : ''}`, {
        size: 'sm', color: C.hpHeal, shadow: true, maxWidth: w,
      });
      ty += 9;
    }

    const upcast = upcastText(sp);
    const body = [sp.desc || '', upcast].filter(Boolean).join('\n\n');
    const lines = MK.wrap(body, w - 5);
    const LH = 6;
    MK.rule(ctx, x, ty, w);
    ty += 4;
    const avail = Math.max(1, Math.floor((y + h - ty) / LH));
    this._maxScroll = Math.max(0, lines.length - avail);
    const off = clamp(R(this.scroll), 0, this._maxScroll);
    UI.pushClip(ctx, x - 2, ty - 1, w + 4, y + h - ty + 1);
    for (let i = 0; i < avail && off + i < lines.length; i++) {
      const l = lines[off + i];
      MK.text(ctx, x, ty + i * LH, l, {
        color: l.indexOf('At Higher Levels') === 0 ? C.goldBright : C.ink, shadow: 'rgba(0,0,0,0.7)',
      });
    }
    UI.popClip(ctx);
    MK.scroll(ctx, x + w - 3, ty, avail * LH, off, avail, lines.length);
  }

  /** One pip row per spell level, plus the warlock's pact slots on their own line. */
  _drawSlots(ctx, ch, x, y) {
    UI.panel(ctx, x, y, VIEW_W - x * 2, 14, { style: 'dark', studs: false });
    MK.text(ctx, x + 5, y + 5, 'SLOTS', { size: 'fineb', color: '#c49a4a', letterSpacing: 2 });
    let cx = x + 34;
    const slots = (ch.spells && ch.spells.slots) || {};
    let any = false;
    for (let lv = 1; lv <= 9; lv++) {
      const s = slots[lv];
      if (!s || !num(s.max, 0)) continue;
      any = true;
      const left = Math.max(0, num(s.max, 0) - num(s.used, 0));
      MK.text(ctx, cx + 1, y + 5, ordinal(lv), { color: '#a8987a' });
      const w = safe(() => UI.pips(ctx, cx + 7, y + 4, num(s.max, 0), left, { size: 4, gap: 1, color: SLOT_TINT[lv - 1] }), 0) || 0;
      cx += 9 + w + 7;
      if (cx > VIEW_W - 90) break;
    }
    const pact = ch.spells && ch.spells.pact;
    if (pact && num(pact.max, 0)) {
      const left = Math.max(0, num(pact.max, 0) - num(pact.used, 0));
      txtR(ctx, VIEW_W - 62, y + 4, `Pact ${ordinal(num(pact.level, 1))}`, { size: 'sm', color: C.purple, shadow: true });
      safe(() => UI.pips(ctx, VIEW_W - 58, y + 4, num(pact.max, 0), left, { size: 4, gap: 1, color: C.purple }));
      any = true;
    }
    if (!any) MK.text(ctx, x + 34, y + 5, 'No spell slots yet: cantrips only.', { color: '#8a7a5c' });
  }

  _drawAlpha(ctx) {
    UI.scrim(ctx, 0.5);
    const w = 300, h = 54;
    const x = R((VIEW_W - w) / 2), y = R((VIEW_H - h) / 2);
    UI.window(ctx, x, y, w, h, 'Jump to letter', { style: 'window' });
    for (let i = 0; i < ALPHABET.length; i++) {
      const col = i % 13, row = Math.floor(i / 13);
      const cx = x + 8 + col * 22, cy = y + 6 + row * 16;
      const on = i === this.alpha.index;
      if (on) UI.highlight(ctx, cx - 2, cy - 2, 18, 14, { alpha: 0.3 });
      txtC(ctx, cx + 7, cy, ALPHABET[i], { size: 'sm', color: on ? C.goldBright : C.inkDim, shadow: true });
    }
    txtC(ctx, x + w / 2, y + h - 10, `${keyFor('confirm')} jump  ·  ${keyFor('cancel')} back`, { size: 'sm', color: C.disabled });
  }
}

const SLOT_TINT = ['#6aa8e8', '#5f9ee0', '#7a94e0', '#9088e0', '#a87ce0', '#c078d8', '#d478c8', '#e07ab0', '#e88a90'];

function upcastText(sp) {
  if (!sp || sp.level === 0) {
    if (sp && sp.damage && sp.damage.scale) {
      const marks = arr(sp.damage.scale.cantripLevels).length ? arr(sp.damage.scale.cantripLevels) : [5, 11, 17];
      return `At Higher Levels: the damage die count rises at levels ${marks.join(', ')}.`;
    }
    return '';
  }
  const bits = [];
  if (sp.damage && sp.damage.scale && sp.damage.scale.perSlot) bits.push(`${sp.damage.scale.perSlot} more damage per slot level above ${ordinal(sp.level)}`);
  if (sp.heal && sp.heal.scale && sp.heal.scale.perSlot) bits.push(`${sp.heal.scale.perSlot} more healing per slot level above ${ordinal(sp.level)}`);
  if (sp.target && num(sp.target.perSlot, 0)) bits.push(`${sp.target.perSlot} extra target per slot level`);
  return bits.length ? `At Higher Levels: ${bits.join('; ')}.` : '';
}

// ===========================================================================
// 6. JOURNAL — quests, contracts, lore, factions
// ===========================================================================

const JOURNAL_TABS = [
  { id: 'active', label: 'Active', icon: 'quest' },
  { id: 'done', label: 'Done', icon: 'check' },
  { id: 'contracts', label: 'Contracts', icon: 'scroll' },
  { id: 'lore', label: 'Lore', icon: 'book' },
  { id: 'factions', label: 'Factions', icon: 'crown' },
];

/** Canonical faction ladders from the Sword Coast sourcebooks. */
const FACTIONS = [
  {
    id: 'harpers', name: 'The Harpers', color: '#6aa8e8',
    ranks: ['Watcher', 'Harpshadow', 'Brightcandle', 'Wise Owl'],
    blurb: 'Secretive do-gooders who trade in lore and quiet intervention. Sister Garaele speaks for them in Phandalin.',
  },
  {
    id: 'gauntlet', name: 'Order of the Gauntlet', color: '#f0d264',
    ranks: ['Chevall', 'Marshal', 'Whitehawk', 'Vindicator'],
    blurb: 'Militant righteousness — Torm, Tyr and Helm. Daran Edermath keeps their orchard and their contracts.',
  },
  {
    id: 'emerald-enclave', name: 'Emerald Enclave', color: '#6fc36a',
    ranks: ['Springwarden', 'Summerstrider', 'Autumnreaver', 'Winterstalker'],
    blurb: 'Keepers of the wilderness balance. Reidoth of Thundertree and the Alderleaf farmstead pass their word along.',
  },
  {
    id: 'lords-alliance', name: "Lords' Alliance", color: '#b9c1cf',
    ranks: ['Cloak', 'Redknife', 'Stingblade', 'Warduke'],
    blurb: 'The coalition of Waterdeep, Neverwinter and Silverymoon. Sildar Hallwinter carries their commission.',
  },
  {
    id: 'zhentarim', name: 'The Zhentarim', color: '#b07ae0',
    ranks: ['Fang', 'Wolf', 'Viper', 'Ardragon'],
    blurb: 'The Black Network. Profit first, questions never. Halia Thornton runs their business out of the Miner’s Exchange.',
  },
];

function factionRank(fid, value) {
  const f = FACTIONS.find((x) => x.id === fid);
  const v = num(value, 0);
  let tier = 0;
  for (let i = 0; i < REP_RANKS.length; i++) if (v >= num(REP_RANKS[i].at, 0)) tier = i;
  if (!f || tier <= 0) return safe(() => repRank(v), 'Unknown') || 'Unknown';
  const names = f.ranks;
  return names[Math.min(tier - 1, names.length - 1)] + (tier > names.length ? ' (Exalted)' : '');
}
function nextRepAt(value) {
  const v = num(value, 0);
  for (const r of REP_RANKS) if (v < num(r.at, 0)) return num(r.at, 0);
  return num(REP_RANKS[REP_RANKS.length - 1].at, 150);
}

function questDef(q) {
  if (!q) return null;
  return q.def || QUESTS()[q.id] || null;
}
function giverName(q) {
  const d = questDef(q);
  const id = (q && q.giver) || (d && d.giver) || '';
  if (!id) return 'Unknown';
  const npc = NPCS()[id];
  return (npc && npc.name) || titleCase(String(id).replace(/-/g, ' '));
}
function questFaction(q) {
  const d = questDef(q);
  return (q && q.faction) || (d && d.faction) || null;
}

export class JournalScene extends MenuScene {
  constructor(opts = {}) {
    super('journal');
    this.opts = opts || {};
    this.tab = Math.max(0, JOURNAL_TABS.findIndex((t) => t.id === opts.tab));
    if (this.tab < 0) this.tab = 0;
    this.index = [0, 0, 0, 0, 0];
    this.top = [0, 0, 0, 0, 0];
    this.scroll = 0;
    this.entries = [];
    this.rowRects = [];
    this.tabRects = [];
  }

  _build() {
    const st = S();
    const id = JOURNAL_TABS[this.tab].id;
    const out = [];
    if (!st) { this.entries = out; return out; }

    if (id === 'active' || id === 'contracts') {
      for (const q of arr(st.quests && st.quests.active)) {
        const fac = questFaction(q);
        if (id === 'contracts' && !fac) continue;
        if (id === 'active' && fac && q.generated) continue;   // contracts live on their own tab
        out.push({ kind: 'quest', q, id: q.id, label: q.title || titleCase(String(q.id).replace(/-/g, ' ')) });
      }
    } else if (id === 'done') {
      // A generated quest is not in QUESTS; the director keeps its title (st.world.quests).
      const generatedTitle = (qid) => { const g = st.world && st.world.quests && st.world.quests[qid]; return g && g.title ? { title: g.title } : null; };
      for (const qid of arr(st.quests && st.quests.done)) {
        const d = QUESTS()[qid] || generatedTitle(qid);
        out.push({ kind: 'quest', q: { id: qid, title: (d && d.title) || titleCase(String(qid).replace(/-/g, ' ')), steps: [], done: true }, id: qid, label: (d && d.title) || titleCase(String(qid).replace(/-/g, ' ')) });
      }
      for (const qid of arr(st.quests && st.quests.failed)) {
        const d = QUESTS()[qid] || generatedTitle(qid);
        out.push({ kind: 'quest', failed: true, q: { id: qid, title: (d && d.title) || titleCase(String(qid).replace(/-/g, ' ')), steps: [] }, id: qid, label: (d && d.title) || titleCase(String(qid).replace(/-/g, ' ')) });
      }
    } else if (id === 'lore') {
      const T = TABLES();
      for (const e of arr(st.lore)) {
        if (typeof e === 'string') {
          const book = (T.BOOK_TEXTS && T.BOOK_TEXTS[e]) || null;
          out.push({
            kind: 'lore', id: e, label: (book && book.title) || titleCase(String(e).replace(/-/g, ' ')),
            body: (book && (book.text || book.body)) || 'You remember reading this somewhere on the road.',
            tag: 'Read',
          });
        } else if (e && typeof e === 'object') {
          out.push({ kind: 'lore', id: e.id || e.title, label: e.title || titleCase(String(e.id || 'note')), body: e.text || e.body || '', tag: titleCase(String(e.kind || 'Note')) });
        }
      }
      for (const r of arr(st.rumors)) {
        const text = typeof r === 'string' ? r : (r && (r.text || r.body)) || '';
        if (!text) continue;
        out.push({ kind: 'lore', id: `rumour-${out.length}`, label: 'A rumour in the taproom', body: text, tag: 'Heard' });
      }
      // The world director's record of the Coast and of the party (rules/worlddirector.js).
      for (const e of safe(() => chronicleEntries(st), []) || []) out.unshift(e);
      const best = (st.bestiary && Object.keys(st.bestiary)) || [];
      for (const mid of best) {
        const m = MONSTERS[mid];
        if (!m) continue;
        out.push({
          kind: 'lore', id: `beast-${mid}`, label: m.name,
          body: `${safe(() => statLine(m), '')}\n\n${m.desc || 'You have fought one of these and lived to write it down.'}\n\nSlain: ${num(st.bestiary[mid], 0)}.`,
          tag: 'Bestiary',
        });
      }
      if (!out.length) out.push({ kind: 'empty', label: 'Nothing written yet', body: 'Read a book, listen in a taproom, or kill something memorable.' });
    } else if (id === 'factions') {
      for (const f of FACTIONS) {
        out.push({ kind: 'faction', id: f.id, f, label: f.name, value: num(st.reputation && st.reputation[f.id], 0) });
      }
    }
    this.entries = out;
    return out;
  }

  update(dt) {
    if (this.tick(dt)) return;
    const list = this._build();

    const before = this.tab;
    this.tab = navPage(this.tab, JOURNAL_TABS.length);
    const tp = tabPressed(5);
    if (tp >= 0) this.tab = tp;
    if (this.tab !== before) { this.scroll = 0; return; }

    const m = Input.mouse;
    for (const r of this.tabRects) {
      if (clicked(m, r.x, r.y, r.w, r.h)) { this.tab = r.i; this.scroll = 0; sfx('cursor'); return; }
    }

    if (listNavActive()) {
      const b = this.index[this.tab];
      this.index[this.tab] = navV(this.index[this.tab], list.length);
      if (this.index[this.tab] !== b) this.scroll = 0;
    }
    this.scroll = scrollPane(this.scroll, this._maxScroll || 0, m, this._paneRect);

    for (const r of this.rowRects) {
      if (hit(m, r.x, r.y, r.w, r.h)) {
        if (this.index[this.tab] !== r.i) { this.index[this.tab] = r.i; this.scroll = 0; sfx('cursor'); }
        if (clicked(m, r.x, r.y, r.w, r.h)) { this._toggleTrack(); return; }
      }
    }

    if (Input.consume('confirm') || Input.consume('interact')) { this._toggleTrack(); return; }
    if (Input.consume('cancel') || Input.consume('journal')) this.close();
  }

  _sel() { return this.entries[clamp(this.index[this.tab], 0, Math.max(0, this.entries.length - 1))] || null; }

  _toggleTrack() {
    const e = this._sel();
    const st = S();
    if (!st || !e || e.kind !== 'quest' || e.q.done || e.failed) { sfx('error'); return; }
    if (st.quests.tracked === e.q.id) { st.quests.tracked = null; sfx('back'); this.say('No longer tracked.'); }
    else { st.quests.tracked = e.q.id; sfx('quest'); this.say(`Tracking "${e.q.title || e.q.id}".`); }
  }

  // --- drawing ------------------------------------------------------------

  draw(ctx) {
    MK.desk(ctx);
    this.rowRects = [];
    this.tabRects = [];
    const list = this.entries.length ? this.entries : this._build();
    const st = S();

    const q0 = st ? trackedQuest(st) : null;
    MK.header(ctx, 'Journal', {
      sub: q0 ? `Following: ${q0.title || q0.id}` : 'Following nothing',
      subColor: q0 ? C.goldBright : '#6a5d48',
    });

    MK.tabs(ctx, 2, 17, VIEW_W - 4, JOURNAL_TABS.map((t) => ({ label: t.label, icon: t.icon })), this.tab, {});
    const tw = Math.floor((VIEW_W - 4) / JOURNAL_TABS.length);
    for (let i = 0; i < JOURNAL_TABS.length; i++) this.tabRects.push({ x: 2 + i * tw, y: 17, w: tw, h: 13, i });

    const LX = 3, LY = 33, LW = 158, LH = CONTENT_BOTTOM - 33;
    UI.panel(ctx, LX, LY, LW, LH, { style: 'window' });
    const rowH = 12, rows = 14;
    const sel = clamp(this.index[this.tab], 0, Math.max(0, list.length - 1));
    let top = this.top[this.tab];
    if (sel < top) top = sel;
    if (sel > top + rows - 1) top = sel - rows + 1;
    this.top[this.tab] = top = clamp(top, 0, Math.max(0, list.length - rows));

    if (!list.length) {
      const empty = ['No work in hand. Notice boards and tavern keepers always know of some.',
        'Nothing finished yet.', 'No contracts signed.', 'Nothing learned yet.', 'No standing with anyone yet.'][this.tab] || 'Nothing here.';
      MK.para(ctx, LX + 10, LY + 70, LW - 20, empty, { color: C.inkDim, align: 'center' });
    }
    UI.pushClip(ctx, LX + 2, LY + 3, LW - 4, rowH * rows + 2);
    for (let i = 0; i < rows && top + i < list.length; i++) {
      const idx = top + i;
      const e = list[idx];
      const ry = LY + 5 + i * rowH;
      const on = idx === sel;
      if (on) UI.highlight(ctx, LX + 3, ry - 1, LW - 8, rowH, { alpha: 0.2 });
      let col = on ? C.goldBright : C.ink;
      let mark = null;
      if (e.kind === 'quest') {
        const tracked = st && st.quests && st.quests.tracked === e.q.id;
        if (e.failed) { col = C.bad; mark = ['✗', C.bad]; }
        else if (e.q.done) { col = on ? C.goldBright : C.good; mark = ['✓', C.good]; }
        else if (tracked) mark = ['★', C.goldBright];
      } else if (e.kind === 'faction') {
        col = on ? C.goldBright : (e.f.color || C.ink);
      }
      // The right-hand tag is fine type, so the label keeps most of the row.
      const tag = e.kind === 'lore' ? (e.tag || '') : (e.kind === 'faction' ? String(num(e.value, 0)) : '');
      const tagW = tag ? Math.min(MK.measure(tag), 50) : 0;
      if (mark) txt(ctx, LX + 7, ry, mark[0], { size: 'sm', color: mark[1], shadow: true });
      txt(ctx, LX + 16, ry, e.label, { size: 'sm', color: col, shadow: true, maxWidth: LW - 24 - (tagW ? tagW + 4 : 0) });
      if (tag) {
        MK.text(ctx, LX + LW - 7, ry + 2, tag, { color: e.kind === 'faction' ? C.goldBright : '#8a7a5c', align: 'right', maxWidth: tagW });
      }
      if (on) UI.cursor(ctx, LX + 2, ry, this.t);
      this.rowRects.push({ x: LX + 3, y: ry - 1, w: LW - 8, h: rowH, i: idx });
    }
    UI.popClip(ctx);
    if (list.length > rows) MK.scroll(ctx, LX + LW - 6, LY + 4, rowH * rows, top, rows, list.length);

    // The entry itself is the party's own writing: a sheet of parchment.
    const DX = 165, DW = VIEW_W - DX - 3;
    const pg = MK.page(ctx, DX, LY, DW, LH);
    this._paneRect = { x: DX, y: LY, w: DW, h: LH };
    const e = list[sel] || null;
    const px = pg.ix + 8, py = pg.iy + 4, pw = pg.iw - 14, ph = pg.ih - 7;
    if (!e) MK.ink(ctx, px + pw / 2, py + ph / 2 - 3, 'A clean page.', { color: MK.PAGE_INK.dim, align: 'center' });
    else if (e.kind === 'quest') this._drawQuest(ctx, e, px, py, pw, ph);
    else if (e.kind === 'faction') this._drawFaction(ctx, e, px, py, pw, ph);
    else this._drawLore(ctx, e, px, py, pw, ph);

    this.drawMessage(ctx, 6, MSG_Y, VIEW_W - 12);
    hintBar(ctx, HINT_Y, [
      [keyFor('cancel'), 'Back'], [keyFor('confirm'), 'Track'],
      [`${keyFor('prev')}/${keyFor('next')}`, 'Tab'], ['1-5', 'Jump'], [keyFor('run'), 'Scroll'],
    ]);
    this.drawPrompt(ctx);
  }

  /** A name on parchment: the display face in iron-gall ink with a rubric capital. */
  _pageTitle(ctx, x, y, s, w, color) {
    return safe(() => UI.heading(ctx, x, y, MK.fit(s, w, 'title'), {
      size: 'title', color: color || MK.PAGE_INK.title, capColor: MK.PAGE_INK.rubric, capGilt: false, shadow: false,
    }), { w: 0, h: 8 });
  }

  _drawQuest(ctx, e, x, y, w, h) {
    const st = S();
    const q = e.q;
    const d = questDef(q);
    const P = MK.PAGE_INK;
    this._pageTitle(ctx, x, y, q.title || titleCase(String(q.id).replace(/-/g, ' ')), w,
      e.failed ? '#7a1c12' : (q.done ? '#2f5a1c' : P.title));
    MK.ink(ctx, x, y + 10, `Given by ${giverName(q)}`, { color: P.dim, maxWidth: w });
    let cx = x, cy = y + 17;
    const fac = questFaction(q);
    const pill = (label, color) => { cx += (safe(() => MK.chip(ctx, cx, cy, label, { color, bg: 'rgba(60,40,20,0.12)' }), 0) || 0) + 3; };
    if (fac) {
      const f = FACTIONS.find((z) => z.id === fac);
      pill((f && f.name) || titleCase(fac), '#2a4a7a');
    }
    if (d && d.type) pill(titleCase(d.type), '#6a4a1a');
    if (d && d.minLevel) pill(`Level ${d.minLevel}+`, '#8a3a1a');
    if (st && st.quests && st.quests.tracked === q.id) pill('Followed', '#7a5a10');
    if (cx > x) cy += 10;

    const desc = (d && d.desc) || q.desc || '';
    if (desc) {
      const r = MK.capPara(ctx, x, cy, w, desc, { color: P.body, shadow: false, maxH: 44 });
      cy += r.height + 4;
    }

    cy = MK.pageSection(ctx, x, cy, w, 'What remains');
    const steps = arr(q.steps);
    if (!steps.length) {
      MK.ink(ctx, x, cy, e.failed ? 'Abandoned.' : q.done ? 'All done.' : 'No steps recorded.', { color: P.dim, maxWidth: w });
      cy += 7;
    }
    for (const s of steps.slice(0, 6)) {
      const done = !!s.done;
      if (done) MK.ink(ctx, x, cy, '✓', { size: 'fineb', color: '#2f5a1c' });
      else MK.bullet(ctx, x + 1.5, cy + 2, P.rubric);
      MK.ink(ctx, x + 6, cy, stepText(s), { color: done ? P.dim : P.body, maxWidth: w - 30 });
      if (done) { ctx.fillStyle = 'rgba(58,39,18,0.55)'; ctx.fillRect(x + 6, cy + 2, Math.min(w - 30, MK.measure(stepText(s))), 0.5); }
      const count = num(s.count, 1);
      if (count > 1) MK.ink(ctx, x + w, cy, `${num(s.progress, 0)} of ${count}`, { size: 'fineb', color: done ? '#2f5a1c' : P.gilt, align: 'right' });
      cy += 7;
    }

    cy += 3;
    cy = MK.pageSection(ctx, x, cy, w, 'The reward');
    const rw = (d && d.rewards) || q.rewards || null;
    if (!rw) {
      MK.ink(ctx, x, cy, 'Whatever you can carry out.', { color: P.dim, maxWidth: w });
    } else {
      const bits = [];
      if (num(rw.xp, 0)) bits.push(`${rw.xp} XP`);
      if (num(rw.gold, 0)) bits.push(goldText(rw.gold));
      for (const i of arr(rw.items)) {
        const iid = Array.isArray(i) ? i[0] : (i && i.id) || i;
        bits.push(itemName(iid, safe(() => resolveItem(iid), null)));
      }
      if (num(rw.reputation, 0) && fac) bits.push(`${signed(rw.reputation)} standing`);
      MK.para(ctx, x, cy, w, bits.join(' · ') || 'Coin and goodwill.', { size: 'fineb', color: P.gilt, shadow: false, maxLines: 2 });
    }
    if (q.startedDay) {
      MK.ink(ctx, x + w, y + h - 5, `Taken on ${dateText(num(q.startedDay, 1))}`, { color: P.dim, align: 'right', maxWidth: w });
    }
    this._maxScroll = 0;
  }

  _drawLore(ctx, e, x, y, w, h) {
    const P = MK.PAGE_INK;
    this._pageTitle(ctx, x, y, e.label, w);
    if (e.tag) safe(() => MK.chip(ctx, x, y + 11, e.tag, { color: '#2a4a7a', bg: 'rgba(60,40,20,0.12)' }));
    const ty = y + (e.tag ? 22 : 13);
    const LH = 6;
    const lines = MK.wrap(String(e.body || ''), w - 5);
    const avail = Math.max(1, Math.floor((y + h - ty) / LH));
    this._maxScroll = Math.max(0, lines.length - avail);
    const off = clamp(R(this.scroll), 0, this._maxScroll);
    if (off === 0) {
      // the opening of an entry gets its initial; scrolling sets it plain
      MK.capPara(ctx, x, ty, w - 5, String(e.body || ''), { color: P.body, shadow: false, maxH: y + h - ty });
    } else {
      UI.pushClip(ctx, x - 2, ty - 1, w + 4, y + h - ty + 1);
      for (let i = 0; i < avail && off + i < lines.length; i++) MK.ink(ctx, x, ty + i * LH, lines[off + i]);
      UI.popClip(ctx);
    }
    MK.scroll(ctx, x + w - 3, ty, avail * LH, off, avail, lines.length);
  }

  _drawFaction(ctx, e, x, y, w, h) {
    const P = MK.PAGE_INK;
    const f = e.f;
    const v = num(e.value, 0);
    this._pageTitle(ctx, x, y, f.name, w);
    const rank = factionRank(f.id, v);
    MK.ink(ctx, x, y + 11, `Standing: ${rank}`, { size: 'fineb', color: P.gilt, maxWidth: w });
    const next = nextRepAt(v);
    MK.meter(ctx, x, y + 18, w - 40, 2.5, next > 0 ? clamp(v / next, 0, 1) : 1, { color: f.color });
    MK.ink(ctx, x + w, y + 17, `${v} of ${next}`, { color: P.dim, align: 'right' });
    let ty = y + 25;
    const r = MK.capPara(ctx, x, ty, w, f.blurb, { color: P.body, shadow: false, maxH: 40 });
    ty += r.height + 5;

    ty = MK.pageSection(ctx, x, ty, w, 'Ranks');
    f.ranks.forEach((name, i) => {
      const at = num(REP_RANKS[i + 1] && REP_RANKS[i + 1].at, (i + 1) * 25);
      const held = v >= at;
      if (held) MK.ink(ctx, x, ty + i * 7, '✓', { size: 'fineb', color: '#2f5a1c' });
      else MK.bullet(ctx, x + 1.5, ty + i * 7 + 2, P.rubric);
      MK.ink(ctx, x + 6, ty + i * 7, name, { color: held ? P.body : P.dim, maxWidth: w - 40 });
      MK.ink(ctx, x + w, ty + i * 7, String(at), { color: P.dim, align: 'right' });
    });
    ty += f.ranks.length * 7 + 4;
    const st = S();
    const contracts = st ? arr(st.quests && st.quests.active).filter((q) => questFaction(q) === f.id).length : 0;
    MK.ink(ctx, x, ty, contracts ? `${contracts} contract${contracts === 1 ? '' : 's'} in hand.` : 'No contracts in hand.', {
      size: 'fineb', color: contracts ? P.gilt : P.dim, maxWidth: w,
    });
    this._maxScroll = 0;
  }
}

// ===========================================================================
// 7. MAP
// ===========================================================================

/**
 * Named Sword Coast sites, positioned in normalised map space. If world/maps.js
 * ships real coordinates we use those instead; this table is only the fallback so
 * the screen is never blank.
 */
const SWORD_COAST_SITES = [
  { id: 'neverwinter', name: 'Neverwinter', nx: 0.15, ny: 0.24, level: 10, town: true },
  { id: 'neverwinter-wood', name: 'Neverwinter Wood', nx: 0.30, ny: 0.20, level: 3 },
  { id: 'thundertree', name: 'Thundertree', nx: 0.35, ny: 0.29, level: 4 },
  { id: 'icespire-peak', name: 'Icespire Peak', nx: 0.44, ny: 0.09, level: 8 },
  { id: 'cragmaw-castle', name: 'Cragmaw Castle', nx: 0.52, ny: 0.17, level: 6 },
  { id: 'old-owl-well', name: 'Old Owl Well', nx: 0.72, ny: 0.24, level: 5 },
  { id: 'conyberry-ruins', name: 'Conyberry', nx: 0.78, ny: 0.33, level: 4 },
  { id: 'wyvern-tor', name: 'Wyvern Tor', nx: 0.66, ny: 0.33, level: 5 },
  { id: 'cragmaw-hideout', name: 'Cragmaw Hideout', nx: 0.44, ny: 0.39, level: 2 },
  { id: 'triboar-trail', name: 'Triboar Trail', nx: 0.62, ny: 0.43, level: 2 },
  { id: 'phandalin', name: 'Phandalin', nx: 0.52, ny: 0.50, level: 1, town: true },
  { id: 'wave-echo-cave', name: 'Wave Echo Cave', nx: 0.62, ny: 0.59, level: 7 },
  { id: 'leilon', name: 'Leilon', nx: 0.23, ny: 0.55, level: 6, town: true },
  { id: 'kryptgarden-forest', name: 'Kryptgarden Forest', nx: 0.80, ny: 0.62, level: 9 },
  { id: 'mere-of-dead-men', name: 'Mere of Dead Men', nx: 0.19, ny: 0.71, level: 8 },
  { id: 'waterdeep', name: 'Waterdeep', nx: 0.40, ny: 0.90, level: 12, town: true },
  { id: 'undermountain', name: 'Undermountain', nx: 0.46, ny: 0.96, level: 14 },
];

/** Sites from world/maps.js if it exposes any, otherwise the fallback table. */
function worldSites() {
  const m = LATE.maps;
  const raw = m && (m.WORLD_SITES || m.WORLD_LOCATIONS || m.WORLD_NODES);
  if (raw) {
    const list = Array.isArray(raw) ? raw : Object.keys(raw).map((k) => ({ id: k, ...(raw[k] || {}) }));
    const usable = list.filter((s) => s && s.name && (Number.isFinite(s.x) || Number.isFinite(s.nx)));
    if (usable.length) return usable;
  }
  return SWORD_COAST_SITES;
}

const TF_SOLID = 1, TF_WATER = 2, TF_DOOR = 8;

function tileColor(map, x, y) {
  let flags = 0, solid = false;
  try { flags = map.flagAt ? map.flagAt(x, y) | 0 : 0; } catch (e) { flags = 0; }
  try { solid = map.solid ? !!map.solid(x, y) : !!(flags & TF_SOLID); } catch (e) { solid = !!(flags & TF_SOLID); }
  if (flags & TF_WATER) return '#2c5a8a';
  if (flags & TF_DOOR) return '#c08a3a';
  if (solid) return '#4a4a58';
  const biome = String((map && map.biome) || 'plains');
  if (biome === 'cave' || biome === 'dungeon' || biome === 'mine' || biome === 'crypt') return '#3a3630';
  if (biome === 'city') return '#5a5040';
  if (biome === 'marsh') return '#3a4a38';
  if (biome === 'tundra') return '#8f9fae';
  if (biome === 'ash-waste') return '#54504c';
  if (biome === 'mountain' || biome === 'hills') return '#5a5244';
  return '#2f4030';
}

export class MapScene extends MenuScene {
  constructor(opts = {}) {
    super('map');
    this.opts = opts || {};
    this.map = currentMap();
    this.cam = { x: 0, y: 0 };
    this.site = 0;
    this.sites = [];
    this.siteRects = [];
    this._centred = false;
  }

  get isWorld() {
    const st = S();
    const id = String((st && st.mapId) || '');
    if (this.map && (this.map.kind === 'world' || this.map.world)) return true;
    return /world|overworld|sword-coast|region/.test(id);
  }

  enter(prev) {
    super.enter(prev);
    this.map = currentMap();
    this._centred = false;
    if (this.isWorld) this.sites = this._visibleSites();
  }

  _visibleSites() {
    const st = S();
    const all = worldSites();
    return all.map((s) => {
      const known = !st || !!(st.visited && st.visited[s.id]) || s.id === (st && st.mapId);
      return { ...s, known };
    });
  }

  update(dt) {
    if (this.tick(dt)) return;
    const st = S();

    if (this.isWorld && this.sites.length) {
      const before = this.site;
      this.site = navV(this.site, this.sites.length);
      if (this.site !== before) return;
      const m = Input.mouse;
      for (const r of this.siteRects) {
        if (hit(m, r.x - 4, r.y - 4, 9, 9)) {
          if (this.site !== r.i) { this.site = r.i; sfx('cursor'); }
          if (clicked(m, r.x - 4, r.y - 4, 9, 9)) { this._fastTravel(); return; }
        }
      }
      if (Input.consume('confirm')) { this._fastTravel(); return; }
    } else {
      // Panning the local map.
      const d = Input.dir();
      if (d.x || d.y) { this.cam.x += d.x * 40 * dt; this.cam.y += d.y * 40 * dt; }
      if (Input.consume('interact')) { this._centred = false; sfx('cursor'); }
    }

    void st;
    if (Input.consume('cancel') || Input.consume('map')) this.close();
  }

  _fastTravel() {
    const site = this.sites[this.site];
    const st = S();
    if (!site) { sfx('error'); return; }
    if (!site.known) { this.say(`${site.name} is only a rumour so far.`, true); return; }
    if (st && st.mapId === site.id) { this.say('You are already there.', true); return; }
    if (!site.town) { this.say(`${site.name} is no place to walk into unannounced — travel there on foot.`, true, 3.6); return; }
    const hours = this._travelHours(site);
    this.ask(`Travel to ${site.name}?`, `About ${hours} hours on the road. Suggested party level ${site.level}.`, [
      { label: 'Set out', value: 'go' },
      { label: 'Stay put', value: null },
    ], (v) => {
      if (v !== 'go') return;
      if (st) safe(() => advanceTime(st, hours * 60));
      softImport('../world/overworld.js', 'overworld').then((ow) => {
        const go = ow && ow.travelTo;
        if (go) {
          Game.transition('journey', () => {
            // Only pass tile coordinates when the site actually carries them;
            // otherwise let the destination map use its own spawn point.
            safe(() => (Number.isFinite(site.tx) && Number.isFinite(site.ty)
              ? go(site.id, site.tx, site.ty, 'down')
              : go(site.id)));
            if (Game.top === this) Game.pop();
          }, {dur:1.35,journey:journeyInfo({name:SWORD_COAST_SITES.find(s=>s.id===st.mapId)?.name||st.mapId},{...site,kind:'town'},st)});
        } else if (st) {
          st.mapId = site.id;
          st.lastTown = site.town ? site.id : st.lastTown;
          safe(() => toast(`The road takes you to ${site.name}.`));
          this.close();
        } else this.say('There is no road from here.', true);
      });
    });
  }

  _travelHours(site) {
    const st = S();
    const from = this.sites.find((s) => s.id === (st && st.mapId)) || null;
    if (!from) return 8;
    const dx = num(site.nx, 0.5) - num(from.nx, 0.5);
    const dy = num(site.ny, 0.5) - num(from.ny, 0.5);
    return clamp(Math.round(Math.hypot(dx, dy) * 60), 2, 72);
  }

  // --- drawing ------------------------------------------------------------

  draw(ctx) {
    MK.desk(ctx);
    const st = S();
    this.siteRects = [];

    const map = this.map;
    const region = (map && map.name) || prettyMapName(st && st.mapId);
    let stamp = '';
    if (st) {
      const ti = safe(() => timeInfo(st), null) || {};
      stamp = `${ti.date || ''} · ${ti.clock || ''}`;
    }
    MK.header(ctx, region, { sub: stamp, subColor: '#cfc3a6' });

    // The survey is a sheet of parchment: what the party has walked is inked
    // in, the rest of the sheet is still blank.
    const AX = 3, AY = 18, AW = VIEW_W - 6, AH = 185;
    const pg = MK.page(ctx, AX, AY, AW, AH, { margin: false });
    const in_ = { x: pg.ix + 3, y: pg.iy + 3, w: pg.iw - 6, h: pg.ih - 6 };

    if (!map) {
      MK.ink(ctx, VIEW_W / 2, AY + 80, 'No survey of this place exists.', { size: 'fineb', align: 'center' });
      MK.ink(ctx, VIEW_W / 2, AY + 90, 'Walk it, and the map will fill itself in.', { color: MK.PAGE_INK.dim, align: 'center' });
    } else {
      this._drawTiles(ctx, map, in_);
      if (this.isWorld) this._drawSites(ctx, in_);
      this._drawRose(ctx, in_.x + in_.w - 14, in_.y + 14);
    }

    this._drawLegend(ctx, 3, 205);
    hintBar(ctx, HINT_Y, this.isWorld
      ? [[keyFor('cancel'), 'Back'], [`${keyFor('up')}${keyFor('down')}`, 'Site'], [keyFor('confirm'), 'Travel']]
      : [[keyFor('cancel'), 'Back'], ['ARROWS', 'Pan'], [keyFor('interact'), 'Centre']]);
    this.drawStatusRight(ctx);
    this.drawPrompt(ctx);
  }

  /**
   * The tiles surveyed so far as a box with a margin of unwalked ground round
   * it (the whole map when it has no fog). Recounted only when the survey grows.
   */
  _surveyed(map, mw, mh) {
    const d = map.discovered;
    if (!d || typeof d.size !== 'number' || !d.size) return { x: 0, y: 0, w: mw, h: mh };
    if (this._ext && this._ext.map === map && this._ext.n === d.size) return this._ext;
    let x0 = mw, y0 = mh, x1 = 0, y1 = 0;
    for (const key of d) {
      const c = key.indexOf(',');
      const x = +key.slice(0, c), y = +key.slice(c + 1);
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    const pad = 6;
    const bx0 = clamp(x0 - pad, 0, mw - 1), by0 = clamp(y0 - pad, 0, mh - 1);
    const bx1 = clamp(x1 + pad, bx0, mw - 1), by1 = clamp(y1 + pad, by0, mh - 1);
    this._ext = { map, n: d.size, x: bx0, y: by0, w: Math.max(12, bx1 - bx0 + 1), h: Math.max(8, by1 - by0 + 1) };
    return this._ext;
  }

  /** A small compass rose in the sheet's corner: north in rubric, the other points in sepia. */
  _drawRose(ctx, cx, cy) {
    const P = MK.PAGE_INK;
    const arm = (dx, dy, len, col) => {
      for (let i = 1; i <= len; i++) {
        const w = Math.max(0.5, (len - i) * 0.35);
        ctx.fillStyle = col;
        if (dx) ctx.fillRect(cx + dx * i - 0.25, cy - w / 2, 0.5, w);
        else ctx.fillRect(cx - w / 2, cy + dy * i - 0.25, w, 0.5);
      }
    };
    arm(0, -1, 9, P.rubric); arm(0, 1, 7, P.dim); arm(-1, 0, 7, P.dim); arm(1, 0, 7, P.dim);
    ctx.fillStyle = P.title; ctx.fillRect(cx - 1, cy - 1, 2, 2);
    MK.ink(ctx, cx, cy - 14.5, 'N', { size: 'fineb', color: P.rubric, align: 'center' });
  }

  _drawTiles(ctx, map, in_) {
    const st = S() || {};
    const P = MK.PAGE_INK;
    const mw = num(map.w || map.width, 0), mh = num(map.h || map.height, 0);
    if (!mw || !mh) {
      MK.ink(ctx, in_.x + in_.w / 2, in_.y + in_.h / 2 - 4, 'This map has no shape yet.', { color: P.dim, align: 'center' });
      return;
    }
    // Fit what has been walked, not the whole sheet: early on a few streets
    // fill the page large, and the plan draws back as the survey grows. The
    // scale is a whole number of DEVICE pixels per tile (half-pixel steps in
    // logical terms), from one device pixel a tile for a great city up to 7px.
    const ext = this._surveyed(map, mw, mh);
    const k = clamp(Math.floor(Math.min((in_.w * 2) / ext.w, (in_.h * 2) / ext.h)), 1, 14);
    const scale = k / 2;
    const viewW = Math.min(in_.w, mw * scale);
    const viewH = Math.min(in_.h, mh * scale);
    const panning = mw * scale > in_.w + 0.5 || mh * scale > in_.h + 0.5;
    const ox = Math.round((in_.x + (in_.w - viewW) / 2) * 2) / 2;
    const oy = Math.round((in_.y + (in_.h - viewH) / 2) * 2) / 2;

    if (!this._centred) {
      this.cam.x = clamp(ext.x + ext.w / 2 - viewW / (2 * scale), 0, Math.max(0, mw - viewW / scale));
      this.cam.y = clamp(ext.y + ext.h / 2 - viewH / (2 * scale), 0, Math.max(0, mh - viewH / scale));
      this._centred = true;
    }
    if (panning) {
      this.cam.x = clamp(this.cam.x, 0, Math.max(0, mw - viewW / scale));
      this.cam.y = clamp(this.cam.y, 0, Math.max(0, mh - viewH / scale));
    } else { this.cam.x = 0; this.cam.y = 0; }
    const bx = Math.floor(this.cam.x), by = Math.floor(this.cam.y);

    // The plan the HUD's minimap keeps (ui/hudmap.js): explored tiles in the
    // cartographer's inks, one pixel a tile, blown up whole.
    UI.pushClip(ctx, ox, oy, viewW, viewH);
    const plan = safe(() => planCanvas(map), null);
    if (plan) {
      const sm = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      const cw = Math.min(mw - bx, Math.ceil(viewW / scale)), chh = Math.min(mh - by, Math.ceil(viewH / scale));
      ctx.save(); ctx.globalAlpha = 0.92;
      ctx.drawImage(plan, bx, by, cw, chh, ox, oy, cw * scale, chh * scale);
      ctx.restore();
      ctx.imageSmoothingEnabled = sm;
    } else {
      // no plan to borrow: the old flag colours, tile by tile
      let disc = null;
      const raw = st.discovered && st.discovered[st.mapId];
      if (raw) disc = raw instanceof Set ? raw : (Array.isArray(raw) ? new Set(raw) : null);
      const cols = Math.ceil(viewW / scale), rowsN = Math.ceil(viewH / scale);
      for (let ry = 0; ry < rowsN; ry++) {
        for (let rx = 0; rx < cols; rx++) {
          const tx = bx + rx, ty = by + ry;
          if (tx >= mw || ty >= mh) continue;
          if (disc && !disc.has(`${tx},${ty}`)) continue;
          ctx.fillStyle = tileColor(map, tx, ty);
          ctx.fillRect(ox + rx * scale, oy + ry * scale, scale, scale);
        }
      }
    }

    const seen = (x, y) => {
      const d = map.discovered;
      return !d || typeof d.has !== 'function' || d.has(`${x},${y}`);
    };
    const plot = (tx, ty) => ({ x: ox + (tx - bx + 0.5) * scale, y: oy + (ty - by + 0.5) * scale });
    const dot = (p, r, fill, edge) => {
      ctx.fillStyle = edge; ctx.fillRect(p.x - r - 0.5, p.y - r - 0.5, r * 2 + 1, r * 2 + 1);
      ctx.fillStyle = fill; ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
    };

    // Ways out and doors in, as rubric and gilt lozenges.
    for (const tg of arr(map.triggers)) {
      if (!tg) continue;
      const kd = String(tg.kind || '');
      if (kd !== 'warp' && kd !== 'door' && kd !== 'inn' && kd !== 'shop' && kd !== 'chest') continue;
      if (!seen(tg.x, tg.y)) continue;
      const p = plot(num(tg.x, 0), num(tg.y, 0));
      if (kd === 'warp') { MK.bullet(ctx, p.x, p.y, '#2f6a2a'); MK.bullet(ctx, p.x, p.y - 1, '#2f6a2a'); }
      else dot(p, 1, kd === 'chest' ? '#c8901c' : P.rubric, 'rgba(40,20,8,0.8)');
    }
    // Living things: townsfolk in lapis, anything hostile in red.
    for (const e of arr(map.entities)) {
      if (!e || e.hidden) continue;
      const ex = Math.round(num(e.x, 0)), ey = Math.round(num(e.y, 0));
      if (!seen(ex, ey)) continue;
      const kd = String(e.kind || '');
      const p = plot(ex, ey);
      if (kd === 'monster') dot(p, 1, '#b8281e', '#3a0a06');
      else if (kd === 'npc') dot(p, 0.5, '#28408a', 'rgba(20,20,50,0.6)');
      else if (kd === 'chest') dot(p, 1, '#c8901c', '#3a2408');
    }
    // The party: a gilt lozenge that breathes, on a dark ring.
    const p = plot(Math.round(num(st.x, 0)), Math.round(num(st.y, 0)));
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 5);
    ctx.fillStyle = `rgba(154,42,26,${(0.25 + 0.35 * pulse).toFixed(3)})`;
    ctx.fillRect(p.x - 4, p.y - 0.5, 8, 1); ctx.fillRect(p.x - 0.5, p.y - 4, 1, 8);
    for (let i = 0; i <= 6; i++) {
      const hw = 3 - Math.abs(3 - i);
      ctx.fillStyle = '#2a1406'; ctx.fillRect(p.x - hw - 0.5, p.y - 3.5 + i, hw * 2 + 1, 1);
    }
    for (let i = 1; i <= 5; i++) {
      const hw = Math.max(0.5, 2.5 - Math.abs(3 - i));
      ctx.fillStyle = i < 3 ? GILT.hi : GILT.base; ctx.fillRect(p.x - hw, p.y - 3.5 + i, hw * 2, 1);
    }
    UI.popClip(ctx);

    if (panning) {
      MK.ink(ctx, in_.x + in_.w - 2, in_.y + in_.h - 5, `${mw} x ${mh} paces · arrows to pan`, { color: P.dim, align: 'right' });
    }
  }

  _drawSites(ctx, in_) {
    this.sites = this.sites.length ? this.sites : this._visibleSites();
    const st = S() || {};
    const P = MK.PAGE_INK;
    this.sites.forEach((s, i) => {
      const px = R(in_.x + clamp(num(s.nx, 0.5), 0, 1) * (in_.w - 8)) + 4;
      const py = R(in_.y + clamp(num(s.ny, 0.5), 0, 1) * (in_.h - 8)) + 4;
      this.siteRects.push({ x: px, y: py, i });
      const on = i === this.site;
      const here = st.mapId === s.id;
      const col = !s.known ? '#9a8a6a' : here ? P.rubric : s.town ? '#7a4a12' : '#28408a';
      ctx.fillStyle = 'rgba(40,24,10,0.8)';
      ctx.fillRect(px - 2.5, py - 2.5, 5, 5);
      ctx.fillStyle = col;
      ctx.fillRect(px - 2, py - 2, 4, 4);
      if (s.known) {
        const label = `${s.name}`;
        const lw = MK.measure(label, 'fineb');
        const lx = clamp(px + 5, in_.x, in_.x + in_.w - lw - 2);
        MK.ink(ctx, lx, py - 2, label, { size: 'fineb', color: on ? P.rubric : P.title });
        if (on) MK.ink(ctx, lx, py + 4, `for a party of level ${s.level}`, { color: P.dim });
      } else if (on) {
        MK.ink(ctx, px + 5, py - 2, 'Unexplored', { color: P.dim });
      }
      if (on) UI.frameSel(ctx, px - 5, py - 5, 10, 10, this.t);
    });
  }

  _drawLegend(ctx, x, y) {
    UI.panel(ctx, x, y, VIEW_W - x * 2, 14, { style: 'dark', studs: false });
    const items = this.isWorld
      ? [['Town', '#7a4a12'], ['Site', '#28408a'], ['Unexplored', '#9a8a6a'], ['You are here', MK.PAGE_INK.rubric]]
      : [['You', GILT.base], ['Way out', '#2f6a2a'], ['Door', MK.PAGE_INK.rubric], ['Folk', '#28408a'], ['Foe', '#b8281e'],
        ['Water', '#6f96b4'], ['Wall', '#5a4028'], ['Roof', '#94523a']];
    let cx = x + 7;
    for (const [label, col] of items) {
      ctx.fillStyle = '#0a0705'; ctx.fillRect(cx - 0.5, y + 4.5, 5, 5);
      ctx.fillStyle = col; ctx.fillRect(cx, y + 5, 4, 4);
      MK.text(ctx, cx + 7, y + 5.5, label, { color: '#cfc3a6' });
      cx += 7 + MK.measure(label) + 10;
      if (cx > VIEW_W - 30) break;
    }
  }
}

// ===========================================================================
// 8. OPTIONS
// ===========================================================================

const OPT_GROUPS = [
  { id: 'audio', label: 'Audio', icon: 'mana' },
  { id: 'display', label: 'Display', icon: 'eye' },
  { id: 'style', label: 'Style', icon: 'quill' },
  { id: 'combat', label: 'Combat', icon: 'sword' },
  { id: 'controls', label: 'Controls', icon: 'anvil' },
  { id: 'songbook', label: 'Songs', icon: 'lute' },
];

// The customization settings live in SETTING_SPEC's display group (their
// owners put them there); the Options screen gathers them on their own page.
const STYLE_KEYS = ['uiTheme', 'hudPreset', 'pixelFilter', 'scanlines'];
const groupOf = (key, spec) => (STYLE_KEYS.includes(key) ? 'style' : spec.group);

const SETTING_DESC = {
  showEdges: 'Shade the lip of every wall, hedge and cliff so the ground you can actually walk on reads at a glance.',
  showExits: 'Mark the ways out of a place with a lit threshold and the name of where it leads.',
  volMaster: 'Overall loudness of everything the game plays.',
  volMusic: 'The score: organum and motets in the temples, estampies and rotas in the taverns, the drums of the Flaming Fist on the field.',
  volSfx: 'Blades, spells, footfalls and the clatter of dice.',
  muted: 'Silence the game entirely without losing your volume levels.',
  textSpeed: 'How fast dialogue writes itself out. Instant prints the whole line at once.',
  scale: 'How many screen pixels each game pixel takes. Auto fits the window.',
  showGrid: 'Draw the five-foot grid over the battlefield.',
  showDamageNumbers: 'Float damage and healing numbers over creatures as they are hit.',
  showRolls: 'Pop the big d20 up for attack rolls and saving throws.',
  screenShake: 'Shake the screen on critical hits and heavy blows.',
  reducedMotion: 'Cut particles, shake and flashes back to a minimum.',
  colorblind: 'Shift the palette for protanopia, deuteranopia or tritanopia.',
  minimapZoom: 'How much ground the corner map shows. Clicking the map itself cycles this too.',
  uiTheme: 'The binding every window is made of. Folio is dark calf with gilt fillets; Timber is oak boards and brass; Iron is blackened plate; Parchment is sepia leather.',
  hudPreset: 'Where the pieces of the road HUD sit. Choosing one lays them out afresh; Arrange HUD fine-tunes from there.',
  arrangeHud: 'Close the menus and move the HUD by hand: drag a panel, arrows nudge it, H hides it, R puts it back, Esc when you are done. F8 does the same on the road.',
  pixelFilter: 'A colour grade over the world, never the interface. Warm gilds the lights, Tapestry pulls every colour to a medieval dye, Gloom is an overcast day, Vivid is high summer.',
  scanlines: 'A fine scanline mask over the whole screen, like an old cathode-ray set.',
  autoEndTurn: 'End a turn automatically once nothing useful is left to do.',
  battleSpeed: 'Multiplier on battle animations. Higher is faster.',
  difficulty: 'Enemy numbers and damage. Story is forgiving; Deadly is not.',
  wildEncounters: 'How often trouble jumps out of the long grass. Off leaves only the groups you can see coming.',
  roamingMonsters: 'Show the bands of foes that wander the wilds, so you can meet them or go round.',
  encounterPacing: 'How eventful the open road is: how many travellers and bands are out, how fast tension builds, and how long the quiet lasts after a fight. Calm, Normal or Perilous.',
  battleZoom: 'Fit the whole arena on screen, or follow the action close in.',
};

const ACTION_LABELS = {
  up: 'Move Up', down: 'Move Down', left: 'Move Left', right: 'Move Right',
  confirm: 'Confirm', cancel: 'Cancel / Back', menu: 'Pause Menu', run: 'Run / Scroll',
  interact: 'Interact', map: 'Map', journal: 'Journal', party: 'Party Sheet',
  inventory: 'Inventory', next: 'Next Page', prev: 'Previous Page',
  tab1: 'Shortcut 1', tab2: 'Shortcut 2', tab3: 'Shortcut 3', tab4: 'Shortcut 4', tab5: 'Shortcut 5',
};

/** How an enum's value reads on the page: theme and preset names from their owners. */
function optionLabel(key, v) {
  if (key === 'uiTheme') return safe(() => UI.themeName(v), null) || titleCase(String(v));
  if (key === 'hudPreset') return safe(() => Layout.presetLabel(v), null) || titleCase(String(v));
  if (key === 'scale') return v === 'auto' ? 'Auto' : `${v}x`;
  if (key === 'battleSpeed') return `${v}x`;
  if (key === 'minimapZoom') return v === 0.5 ? 'Wide' : v === 2 ? 'Close' : 'Normal';
  return titleCase(String(v));
}

// --- the Minstrel's Songbook ------------------------------------------------

// The first score's tunes carry no title of their own; these are the names
// their composer gave them in core/music.js. Anything else reads its id.
const OLD_TITLES = {
  title: 'The Sword Coast', town: 'Phandalin Market', field: 'The Triboar Trail',
  inn: 'The Stonehill Common Room', temple: 'The Shrine of Luck', forest: 'Neverwinter Wood',
  city: "Neverwinter, Protector's Enclave", orchestral: 'The Coast Road', rivertune: 'Down the Chionthar',
};
const BOOKS = [
  { id: 'sacred', label: 'Sacred & Courtly' },
  { id: 'secular', label: 'Dances & Songs' },
  { id: 'old', label: 'The First Score' },
];

/** Every track the audio engine knows, as songbook rows, grouped by book. */
function songbookTracks() {
  const ids = arr(safe(() => (typeof Audio.catalogue === 'function' ? Audio.catalogue().map((t) => t.id || t) : Audio.tracks), []));
  const groups = safe(() => TRACK_GROUPS, {}) || {};
  const bookOf = (id) => (arr(groups.sacred).includes(id) ? 'sacred' : arr(groups.secular).includes(id) ? 'secular' : 'old');
  const out = [];
  for (const b of BOOKS) {
    const rows = ids.filter((id) => bookOf(id) === b.id).map((id) => {
      const t = safe(() => TRACKS[id], null) || {};
      return { kind: 'song', id, book: b.label, label: t.title || OLD_TITLES[id] || titleCase(id.replace(/([a-z])([A-Z])/g, '$1 $2')),
        contexts: arr(t.contexts), bpm: num(t.bpm, 0), bars: num(t.loopBars, 0), room: t.room || '' };
    });
    if (!rows.length) continue;
    out.push({ kind: 'book', label: b.label, count: rows.length });
    out.push(...rows);
  }
  return out;
}
function favourites() { return arr(safe(() => Save.settings.musicFavorites, null)); }
function isFavourite(id) { return favourites().includes(id); }
function toggleFavourite(id) {
  const f = favourites();
  const next = f.includes(id) ? f.filter((x) => x !== id) : f.concat([id]);
  safe(() => Save.setSetting('musicFavorites', next.length ? next : null));
  return !f.includes(id);
}
/** "Sumer is icumen in (Yawning Portal Rota)" -> the part before the bracket, the bracket as a note. */
function splitTitle(s) {
  const m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(String(s || ''));
  return m ? [m[1], m[2]] : [String(s || ''), ''];
}

// Letter index of each pitch class (C C# D D# E F F# G G# A A# B), for staff positions.
const DIATONIC = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];

/** The opening notes of a track's highest voice: [{ pos, dur }] with pos in diatonic steps. */
function incipitOf(id, n = 14) {
  const t = safe(() => TRACKS[id], null);
  if (!t) return [];
  let best = null; let bestPitch = -1;
  for (const L of arr(t.layers)) {
    if (!L || L.wave === 'noise') continue;
    const notes = arr(L.pattern).filter((e) => Array.isArray(e) && typeof e[1] === 'number');
    if (notes.length < 4) continue;
    const head = notes.slice(0, n);
    const avg = head.reduce((a, e) => a + e[1], 0) / head.length;
    if (avg > bestPitch) { bestPitch = avg; best = head; }
  }
  return (best || []).map((e) => ({ pos: DIATONIC[((e[1] % 12) + 12) % 12] + Math.floor(e[1] / 12) * 7, dur: num(e[2], 1) }));
}

/**
 * The first bars of a tune in square notation: four rubric staff lines, a C
 * clef, and a punctum for each note (a virga, with its tail, for the long
 * ones) — how a cantor's book would have written it down.
 */
function drawIncipit(ctx, x, y, w, h, id) {
  const notes = incipitOf(id, Math.max(4, Math.floor((w - 14) / 9)));
  const gap = 3;                                   // logical px between staff lines
  const sy = y + Math.max(2, Math.round((h - gap * 3) / 2));
  ctx.fillStyle = 'rgba(216,80,58,0.8)';
  for (let i = 0; i < 4; i++) ctx.fillRect(x, sy + i * gap, w, 0.5);
  // C clef on the second line from the top: two stacked squares on a stem
  ctx.fillStyle = '#d8503a';
  ctx.fillRect(x + 1, sy + gap - 1.5, 1, gap * 2);
  ctx.fillRect(x + 2, sy + gap - 1.5, 1.5, 1.5); ctx.fillRect(x + 2, sy + gap * 2 - 0.5, 1.5, 1.5);
  if (!notes.length) return;
  const sorted = notes.map((n) => n.pos).sort((a, b) => a - b);
  const mid = sorted[sorted.length >> 1];
  const durs = notes.map((n) => n.dur).sort((a, b) => a - b);
  const longAt = durs[Math.floor(durs.length * 0.75)];
  const step = (w - 14) / notes.length;
  const yOf = (pos) => Math.round((sy + gap * 1.5 - clamp(pos - mid, -5, 5) * (gap / 2) - 1) * 2) / 2;
  notes.forEach((n, i) => {
    // pos -> y: the middle of the staff is the median pitch; one step is a line or a space
    const ny = yOf(n.pos);
    const nx = Math.round((x + 7 + i * step) * 2) / 2;
    ctx.fillStyle = 'rgba(216,80,58,0.8)';
    for (let ly = sy - gap; ly >= ny + 1; ly -= gap) ctx.fillRect(nx - 1, ly, 4, 0.5);          // ledger lines above
    for (let ly = sy + gap * 4; ly <= ny + 1; ly += gap) ctx.fillRect(nx - 1, ly, 4, 0.5);      // and below
    ctx.fillStyle = '#0a0706'; ctx.fillRect(nx - 0.5, ny - 0.5, 3, 3);
    ctx.fillStyle = '#ece0c2'; ctx.fillRect(nx, ny, 2, 2);
    ctx.fillStyle = '#fffaf0'; ctx.fillRect(nx, ny, 1, 0.5);
    // a virga: the long notes carry a tail on their right side
    if (n.dur > longAt && n.dur > 2) { ctx.fillStyle = '#ece0c2'; ctx.fillRect(nx + 1.5, ny + 2, 0.5, 3); }
  });
  // a custos at the end of the line: the next note's pitch, as scribes marked it
  const cy = yOf(notes[notes.length - 1].pos) + 1;
  ctx.fillStyle = 'rgba(236,224,194,0.7)';
  ctx.fillRect(x + w - 3, cy - 0.5, 0.5, 1); ctx.fillRect(x + w - 2.5, cy, 0.5, 1); ctx.fillRect(x + w - 2, cy - 1.5, 0.5, 2.5);
}

export class OptionsScene extends MenuScene {
  constructor(opts = {}) {
    super('options');
    this.opts = opts || {};
    this.group = Math.max(0, OPT_GROUPS.findIndex((g) => g.id === opts.group));
    this.index = OPT_GROUPS.map(() => 0);
    this.top = OPT_GROUPS.map(() => 0);
    this.rebind = null;      // { action } while listening for a key
    this.rows = [];
    this.rowRects = [];
    this.tabRects = [];
    this.songs = null;       // songbook rows, built on first visit
    this.heard = null;       // what the road was playing when the songbook first played a tune
    this.auditioning = null; // the track id the songbook started
  }

  exit() {
    super.exit();
    // Hand the music back to the road once the player has finished listening.
    if (this.heard) {
      const h = this.heard;
      this.heard = null;
      safe(() => Audio.music(h.context || h.track || null));
    }
  }

  _gid() { return (OPT_GROUPS[this.group] || OPT_GROUPS[0]).id; }

  _build() {
    const gid = this._gid();
    const spec = safe(() => Save.SETTING_SPEC, null) || {};
    const out = [];
    if (gid === 'controls') {
      for (const a of arr(safe(() => Input.ACTIONS, []))) {
        if (a === 'debug') continue;
        out.push({ kind: 'bind', action: a, label: ACTION_LABELS[a] || titleCase(a) });
      }
    } else if (gid === 'songbook') {
      if (!this.songs) this.songs = songbookTracks();
      out.push({ kind: 'road', label: 'The music of the road' });
      out.push(...this.songs);
      this.rows = out;
      return out;
    } else {
      // The style page reads in STYLE_KEYS order (binding first, then the HUD, then the lens).
      const keys = gid === 'style' ? STYLE_KEYS.filter((k) => spec[k]) : Object.keys(spec);
      for (const key of keys) {
        const s = spec[key];
        if (!s || s.kind === 'custom' || groupOf(key, s) !== gid) continue;
        out.push({ kind: s.kind, key, label: s.name || titleCase(key), spec: s });
        if (key === 'hudPreset') out.push({ kind: 'action', key: 'arrangeHud', label: 'Arrange HUD' });
      }
    }
    out.push({ kind: 'reset', label: gid === 'controls' ? 'Restore Default Keys' : 'Reset to Defaults' });
    this.rows = out;
    return out;
  }

  /** The first row a cursor may rest on at or after i (the songbook's book titles are not rows to stop on). */
  _stop(rows, i, dir = 1) {
    let k = clamp(i, 0, Math.max(0, rows.length - 1));
    for (let n = 0; n < rows.length && rows[k] && rows[k].kind === 'book'; n++) k = (k + dir + rows.length) % rows.length;
    return k;
  }

  update(dt) {
    if (this.tick(dt)) return;
    if (this.rebind) {
      // Input.beginRebind swallows the next key; ESC there fires the callback with null.
      if (!Input.rebinding) this.rebind = null;
      return;
    }
    const rows = this._build();

    const g0 = this.group;
    this.group = navPage(this.group, OPT_GROUPS.length);
    const tp = tabPressed(5);
    if (tp >= 0) this.group = tp;
    if (this.group !== g0) return;

    const m = Input.mouse;
    for (const r of this.tabRects) {
      if (clicked(m, r.x, r.y, r.w, r.h)) { this.group = r.i; sfx('cursor'); return; }
    }

    const g = this.group;
    const before = this.index[g];
    this.index[g] = navV(this.index[g], rows.length);
    if (this.index[g] !== before) this.index[g] = this._stop(rows, this.index[g], this.index[g] < before ? -1 : 1);
    else this.index[g] = this._stop(rows, this.index[g]);
    const row = rows[this.index[g]];

    const w = wheelOver(m, 3, 33, 236, CONTENT_BOTTOM - 33);
    if (w) this.top[g] = clamp(this.top[g] + w * 2, 0, Math.max(0, rows.length - 12));

    for (const r of this.rowRects) {
      if (r.star && clicked(m, r.star.x, r.star.y, r.star.w, r.star.h)) {
        this.index[g] = r.i; this._favourite(rows[r.i]); return;
      }
      if (hit(m, r.x, r.y, r.w, r.h)) {
        if (this.index[g] !== r.i && rows[r.i].kind !== 'book') { this.index[g] = r.i; sfx('cursor'); }
        if (clicked(m, r.x, r.y, r.w, r.h) && rows[r.i].kind !== 'book') { this._activate(rows[r.i]); return; }
      }
    }

    if (row && (row.kind === 'range' || row.kind === 'enum' || row.kind === 'bool')) {
      if (Input.repeatConsume('left')) this._cycle(row, -1);
      if (Input.repeatConsume('right')) this._cycle(row, 1);
    }
    if (row && row.kind === 'song' && Input.consume('interact')) { this._favourite(row); return; }
    if (Input.consume('confirm')) { this._activate(row); return; }
    if (Input.consume('cancel')) this.close();
  }

  _activate(row) {
    if (!row) return;
    if (row.kind === 'bool') { this._cycle(row, 1); return; }
    if (row.kind === 'enum' || row.kind === 'range') { this._cycle(row, 1); return; }
    if (row.kind === 'bind') { this._beginRebind(row.action); return; }
    if (row.kind === 'action' && row.key === 'arrangeHud') { this._arrange(); return; }
    if (row.kind === 'song') { this._play(row); return; }
    if (row.kind === 'road') { this._road(); return; }
    if (row.kind === 'reset') this._reset();
  }

  _cycle(row, dir) {
    safe(() => Save.cycleSetting(row.key, dir));
    sfx('cursor');
    this._apply();
  }

  _apply() {
    const v = safe(() => Save.volumes(), null);
    if (v) safe(() => Audio.setVolume(v.master, v.music, v.sfx));
    safe(() => { Audio.muted = !!Save.settings.muted; });
    safe(() => { FX.reducedMotion = !!Save.settings.reducedMotion; });
    // Owners also follow EV_SETTINGS, which Save emits on every change; these
    // direct calls make the change land this frame, whatever order they hear it in.
    safe(() => { if (UI.theme !== Save.settings.uiTheme) UI.setTheme(Save.settings.uiTheme, false); });
    safe(() => Stage.applySettings(Save.settings));
    safe(() => bus.emit('settings:changed', Save.settings));
  }

  _arrange() {
    sfx('select');
    const ok = safe(() => (typeof Game.arrangeHud === 'function' ? Game.arrangeHud() : false), false);
    if (!ok) this.say('There is no HUD on screen to arrange. Try again from the road.', true);
  }

  _play(row) {
    if (!safe(() => Audio.hasTrack(row.id), true)) { this.say('That tune is not in the book.', true); return; }
    if (!this.heard) this.heard = safe(() => ({ ...Audio.nowPlaying }), null) || { track: null, context: null };
    this.auditioning = row.id;
    safe(() => Audio.music(row.id, { exact: true }));
    sfx('select');
    this.say(`The minstrel strikes up ${splitTitle(row.label)[0]}.`);
  }

  _road() {
    if (!this.heard) { this.say('The road is already choosing the music.'); return; }
    const h = this.heard;
    this.heard = null;
    this.auditioning = null;
    safe(() => Audio.music(h.context || h.track || null));
    sfx('select');
    this.say('The minstrel falls silent; the road plays on.');
  }

  _favourite(row) {
    if (!row || row.kind !== 'song') return;
    const on = toggleFavourite(row.id);
    sfx(on ? 'select' : 'back');
    this.say(on ? `${splitTitle(row.label)[0]}: marked in the songbook.` : `${splitTitle(row.label)[0]}: mark struck out.`);
  }

  _beginRebind(action) {
    this.rebind = { action };
    sfx('open');
    safe(() => Input.beginRebind(action, (code) => {
      this.rebind = null;
      if (!code) { this.say('Rebinding cancelled.'); return; }
      // Put the new key first but keep the old ones as spares.
      const prev = arr(safe(() => Input.bindings[action], []));
      const list = [code].concat(prev.filter((c) => c !== code)).slice(0, 3);
      safe(() => Input.bind(action, list));
      safe(() => Save.setSetting('bindings', Input.exportBindings()));
      sfx('select');
      this.say(`${ACTION_LABELS[action] || action} is now ${codeLabel(code)}.`);
    }));
  }

  _reset() {
    const controls = this._gid() === 'controls';
    this.ask(controls ? 'Restore default keys?' : 'Reset settings?',
      controls ? 'Every action goes back to its original key.' : 'Volume, speed, style, difficulty and accessibility go back to the defaults.',
      [{ label: 'Reset', value: 'yes', color: C.bad }, { label: 'Cancel', value: null }],
      (v) => {
        if (v !== 'yes') return;
        if (controls) {
          safe(() => Input.resetBindings());
          safe(() => Save.setSetting('bindings', Input.exportBindings()));
          this.say('Keys restored.');
        } else {
          safe(() => Save.resetSettings());
          safe(() => Input.resetBindings());
          this._apply();
          this.say('Settings restored.');
        }
        sfx('select');
      });
  }

  // --- drawing ------------------------------------------------------------

  draw(ctx) {
    MK.desk(ctx);
    this.rowRects = [];
    this.tabRects = [];
    const rows = this.rows.length ? this.rows : this._build();
    const avail = safe(() => Save.available, true);
    MK.header(ctx, 'Settings', {
      sub: avail ? 'Kept in this browser' : 'Storage unavailable: changes last this session only',
      subColor: avail ? C.inkDim : C.warn,
    });

    MK.tabs(ctx, 2, 17, VIEW_W - 4, OPT_GROUPS.map((g) => ({ label: g.label, icon: g.icon })), this.group, {});
    const tw = Math.floor((VIEW_W - 4) / OPT_GROUPS.length);
    for (let i = 0; i < OPT_GROUPS.length; i++) this.tabRects.push({ x: 2 + i * tw, y: 17, w: tw, h: 13, i });

    const LX = 3, LY = 33, LW = 236, LH = CONTENT_BOTTOM - 33;
    UI.panel(ctx, LX, LY, LW, LH, { style: 'window' });
    const song = this._gid() === 'songbook';
    const rowH = song ? 10 : 14;
    const visible = Math.floor((LH - 8) / rowH);
    const sel = clamp(this.index[this.group], 0, Math.max(0, rows.length - 1));
    let top = this.top[this.group];
    if (sel < top) top = sel;
    if (sel > top + visible - 1) top = sel - visible + 1;
    this.top[this.group] = top = clamp(top, 0, Math.max(0, rows.length - visible));

    const m = Input.mouse;
    UI.pushClip(ctx, LX + 2, LY + 3, LW - 4, rowH * visible + 2);
    for (let i = 0; i < visible && top + i < rows.length; i++) {
      const idx = top + i;
      const r = rows[idx];
      const ry = LY + 5 + i * rowH;
      const on = idx === sel;
      const rect = { x: LX + 5, y: ry - 1, w: LW - 12, h: rowH - 1, i: idx };
      if (r.kind !== 'book') {
        if (on) MK.selRow(ctx, rect.x, rect.y, rect.w, rect.h, this.t);
        else if (hit(m, rect.x, rect.y, rect.w, rect.h)) MK.hoverRow(ctx, rect.x, rect.y, rect.w, rect.h);
      }
      if (song) this._drawSongRow(ctx, r, rect, on);
      else {
        const lc = r.kind === 'reset' ? C.warn : r.kind === 'action' ? C.gold : (on ? C.goldBright : C.ink);
        txt(ctx, LX + 11, ry + 2.5, r.label, { size: 'sm', color: lc, shadow: true, maxWidth: 118 });
        this._drawValue(ctx, r, LX + 134, ry + 2.5, LW - 144, on);
      }
      this.rowRects.push(rect);
    }
    UI.popClip(ctx);
    MK.scroll(ctx, LX + LW - 6, LY + 4, rowH * visible, top, visible, rows.length);

    const DX = 243, DW = VIEW_W - DX - 3;
    UI.panel(ctx, DX, LY, DW, LH, { style: 'window' });
    if (song) this._drawSongDetail(ctx, rows[sel], DX + 8, LY + 6, DW - 16, LH - 12);
    else this._drawDetail(ctx, rows[sel], DX + 8, LY + 6, DW - 16, LH - 12);

    this.drawMessage(ctx, 6, MSG_Y, VIEW_W - 12);
    const r = rows[sel];
    hintBar(ctx, HINT_Y, song ? [
      [keyFor('cancel'), 'Back'], [keyFor('confirm'), r && r.kind === 'road' ? 'Return' : 'Play'],
      r && r.kind === 'song' ? [keyFor('interact'), isFavourite(r.id) ? 'Unmark' : 'Mark'] : null,
      [`${keyFor('prev')}/${keyFor('next')}`, 'Page'],
    ] : [
      [keyFor('cancel'), 'Back'], [`${keyFor('left')}${keyFor('right')}`, 'Change'],
      [keyFor('confirm'), r && r.kind === 'action' ? 'Open' : 'Set'], [`${keyFor('prev')}/${keyFor('next')}`, 'Page'],
    ]);
    if (this.rebind) this._drawRebind(ctx);
    this.drawPrompt(ctx);
  }

  _drawValue(ctx, r, x, y, w, on) {
    const settings = safe(() => Save.settings, null) || {};
    if (r.kind === 'reset') {
      txtR(ctx, x + w, y, '↩', { size: 'md', color: C.warn, shadow: true });
      return;
    }
    if (r.kind === 'action') {
      MK.text(ctx, x + w, y + 1.5, 'open ▶', { size: 'fineb', color: on ? C.goldBright : C.goldDim, align: 'right' });
      return;
    }
    if (r.kind === 'bind') {
      const list = arr(safe(() => Input.bindings[r.action], []));
      let kx = x + w;
      if (!list.length) { MK.text(ctx, kx, y + 1.5, 'unbound', { color: C.bad, align: 'right' }); return; }
      for (const code of list.slice(0, 2).reverse()) {
        const lab = codeLabel(code);
        const kw = Math.max(6.5, MK.measure(lab, 'fineb') + 3);
        kx -= kw;
        MK.keycap(ctx, kx, y, lab, { dim: !on });
        kx -= 3;
      }
      return;
    }
    const v = settings[r.key];
    if (r.kind === 'bool') {
      this._toggle(ctx, x + w - 17, y, !!v, on);
      return;
    }
    if (r.kind === 'range') {
      const pct = clamp((num(v, 0) - num(r.spec.min, 0)) / Math.max(0.001, num(r.spec.max, 1) - num(r.spec.min, 0)), 0, 1);
      UI.bar(ctx, x, y + 1.5, w - 24, 4, pct, { color: on ? C.gold : C.goldDim });
      MK.text(ctx, x + w, y + 1.5, `${Math.round(pct * 100)}%`, { color: on ? C.goldBright : C.ink, align: 'right' });
      return;
    }
    // enum: the value between two chevrons, and a pip for each choice under it
    const label = optionLabel(r.key, v);
    const opts = arr(r.spec.options);
    txt(ctx, x, y, '◀', { size: 'sm', color: on ? C.gold : C.disabled });
    txtC(ctx, x + w / 2, y - 0.5, label, { size: 'sm', color: on ? C.goldBright : C.ink, shadow: true, maxWidth: w - 20 });
    txtR(ctx, x + w, y, '▶', { size: 'sm', color: on ? C.gold : C.disabled });
    if (on && opts.length > 1 && opts.length <= 8) {
      const cur = opts.indexOf(v);
      const px0 = x + w / 2 - (opts.length * 3) / 2;
      for (let i = 0; i < opts.length; i++) {
        ctx.fillStyle = i === cur ? C.goldBright : 'rgba(163,122,38,0.55)';
        ctx.fillRect(px0 + i * 3, y + 8.5, i === cur ? 1.5 : 1, 1);
      }
    }
  }

  /** An on/off switch: a slot with a gilt knob that sits right when on. */
  _toggle(ctx, x, y, v, on) {
    const w = 17, h = 7;
    MK.well(ctx, x, y, w, h, v ? 'rgba(40,70,36,0.85)' : 'rgba(10,8,10,0.8)');
    MK.text(ctx, v ? x + 3 : x + w - 3, y + 1.5, v ? 'on' : 'off', { color: v ? '#bfe8b0' : C.disabled, align: v ? 'left' : 'right', shadow: false });
    const kx = v ? x + w - 6.5 : x + 0.5;
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, on ? '#fff0b8' : '#e0c070'); g.addColorStop(1, on ? '#c8962e' : '#8a6424');
    ctx.fillStyle = '#140c05'; ctx.fillRect(kx, y + 0.5, 6, h - 1);
    ctx.fillStyle = g; ctx.fillRect(kx + 0.5, y + 1, 5, h - 2);
  }

  _drawDetail(ctx, r, x, y, w, h) {
    if (!r) return;
    MK.title(ctx, x, y, r.label, { maxWidth: w });
    let ty = y + 13;
    const desc = r.kind === 'bind'
      ? 'Press Confirm, then press the key you want. Escape aborts. The old key stays as a spare.'
      : r.kind === 'reset'
        ? 'Put everything on this page back the way it shipped.'
        : (SETTING_DESC[r.key] || 'Adjust this option.');
    const res = MK.para(ctx, x, ty, w, desc, { color: C.ink, maxLines: 9 });
    ty += res.height + 6;

    if (r.kind === 'enum') {
      ty = rubric(ctx, x, ty, w, 'Choices');
      const v = safe(() => Save.settings[r.key], null);
      for (const o of arr(r.spec.options)) {
        const on = o === v;
        if (on) MK.bullet(ctx, x + 1.5, ty + 1.5, C.goldBright);
        else { ctx.fillStyle = C.disabled; ctx.fillRect(x + 1, ty + 1.5, 1, 0.5); }
        MK.text(ctx, x + 6, ty, optionLabel(r.key, o), { color: on ? C.goldBright : C.inkDim, maxWidth: w - 8 });
        ty += 6.5;
        if (ty > y + h - 6) break;
      }
      if (r.key === 'uiTheme') this._themeSwatches(ctx, x, Math.max(ty + 3, y + h - 26), w);
    } else if (r.kind === 'bool') {
      ty = rubric(ctx, x, ty, w, 'Now');
      const v = !!safe(() => Save.settings[r.key], false);
      MK.text(ctx, x, ty, v ? 'On. Confirm turns it off.' : 'Off. Confirm turns it on.', { color: v ? C.good : C.inkDim, maxWidth: w });
    } else if (r.kind === 'bind') {
      ty = rubric(ctx, x, ty, w, 'Bound keys');
      const list = arr(safe(() => Input.bindings[r.action], []));
      if (!list.length) MK.text(ctx, x, ty, 'Nothing bound.', { color: C.bad });
      list.forEach((code, i) => {
        const kw = MK.keycap(ctx, x, ty + i * 9, codeLabel(code));
        MK.text(ctx, x + kw + 3, ty + i * 9 + 1.5, i === 0 ? 'primary' : 'spare', { color: C.inkDim });
      });
    } else if (r.kind === 'action' && r.key === 'arrangeHud') {
      ty = rubric(ctx, x, ty, w, 'Preset');
      MK.text(ctx, x, ty, optionLabel('hudPreset', safe(() => Layout.preset, 'default')), { color: C.goldBright, maxWidth: w });
    }
  }

  /** A little specimen of each binding, the one in force framed. */
  _themeSwatches(ctx, x, y, w) {
    const ids = arr(safe(() => UI.THEMES, [])).slice(0, 4);
    if (!ids.length) return;
    const cur = safe(() => UI.theme, 'folio');
    const mats = { folio: 'vellum', timber: 'timber', iron: 'iron', parchment: 'leather' };
    const sw = Math.floor((w - (ids.length - 1) * 3) / ids.length);
    ids.forEach((id, i) => {
      const sx = x + i * (sw + 3);
      safe(() => UI.panel(ctx, sx, y, sw, 16, { style: mats[id] || 'window', studs: false }));
      MK.text(ctx, sx + sw / 2, y + 6, safe(() => UI.themeName(id), id), { color: id === cur ? C.goldBright : C.inkDim, align: 'center', maxWidth: sw - 4 });
      if (id === cur) safe(() => UI.frameSel(ctx, sx - 1, y - 1, sw + 2, 18, this.t));
    });
  }

  _drawSongRow(ctx, r, rect, on) {
    const x = rect.x, y = rect.y + 1;
    if (r.kind === 'book') {
      MK.section(ctx, x + 2, y + 2, rect.w - 4, `${r.label} · ${r.count}`);
      return;
    }
    if (r.kind === 'road') {
      MK.text(ctx, x + 3, y + 1.5, '↩', { size: 'fineb', color: on ? C.goldBright : C.goldDim });
      MK.text(ctx, x + 11, y + 1.5, this.heard ? 'Back to the music of the road' : 'The road is choosing the music', {
        size: on ? 'fineb' : 'fine', color: this.heard ? C.gold : C.inkDim, maxWidth: rect.w - 20 });
      return;
    }
    const playing = safe(() => Audio.playing, null) === r.id;
    const fav = isFavourite(r.id);
    // the favourite mark: a gilt star, or its outline
    const star = { x: x + 2, y: y - 0.5, w: 9, h: 9 };
    MK.text(ctx, x + 3, y + 1.5, fav ? '★' : '·', { size: 'fineb', color: fav ? C.goldBright : C.disabled });
    const [name, note] = splitTitle(r.label);
    const nw = rect.w - 18 - (playing ? 14 : 0);
    const shown = MK.fit(name, nw, on ? 'fineb' : 'fine');
    const tr = MK.text(ctx, x + 11, y + 1.5, shown, { size: on ? 'fineb' : 'fine', color: playing ? C.goldBright : on ? C.goldBright : C.ink, maxWidth: nw });
    if (note && tr.w + 6 < nw) MK.text(ctx, x + 11 + tr.w + 3, y + 1.5, note, { color: C.inkDim, maxWidth: nw - tr.w - 3 });
    if (playing) this._eq(ctx, x + rect.w - 11, y + 0.5);
    rect.star = star;
  }

  /** Three bars dancing: this is the tune you are hearing. */
  _eq(ctx, x, y) {
    for (let i = 0; i < 3; i++) {
      const hgt = 2 + Math.round((Math.sin(this.t * (5 + i * 1.7) + i * 2) * 0.5 + 0.5) * 4.5);
      ctx.fillStyle = C.goldBright;
      ctx.fillRect(x + i * 2.5, y + 7 - hgt, 1.5, hgt);
    }
  }

  _drawSongDetail(ctx, r, x, y, w, h) {
    if (!r) return;
    if (r.kind === 'road') {
      MK.title(ctx, x, y, "The Minstrel's Songbook", { maxWidth: w });
      let ty = y + 14;
      ty += MK.para(ctx, x, ty, w, 'Every tune the company can call for, old and new: organum and motets from the temples of the Realms, dances and drinking songs from the Sword Coast\'s taverns. Play any of them here; mark the ones you love.', { maxLines: 8 }).height + 6;
      ty = rubric(ctx, x, ty, w, 'Now playing');
      const np = safe(() => Audio.nowPlaying, null) || {};
      const row = (this.songs || []).find((s) => s.id === np.track);
      MK.text(ctx, x, ty, row ? splitTitle(row.label)[0] : (np.track ? titleCase(String(np.track)) : 'Silence'), { color: C.goldBright, maxWidth: w });
      ty += 7;
      if (np.context) MK.text(ctx, x, ty, `chosen by the road for: ${np.context}`, { color: C.inkDim, maxWidth: w });
      ty += 10;
      ty = rubric(ctx, x, ty, w, 'Marked');
      MK.text(ctx, x, ty, `${favourites().length} of ${(this.songs || []).filter((s) => s.kind === 'song').length} tunes`, { color: C.ink });
      return;
    }
    if (r.kind !== 'song') return;
    const [name, note] = splitTitle(r.label);
    const lines = MK.wrap(name, w, 'title');
    let ty = y;
    // A long title takes two lines of the display face rather than an ellipsis.
    for (const l of lines.slice(0, 2)) { MK.title(ctx, x, ty, l, { maxWidth: w }); ty += 11; }
    if (note) { MK.text(ctx, x, ty, note, { color: C.inkDim, maxWidth: w }); ty += 7; }
    ty += 3;
    ty = rubric(ctx, x, ty, w, r.book);
    const secs = r.bpm > 0 && r.bars > 0 ? Math.round((r.bars * 4 * 60) / r.bpm) : 0;
    const kvs = [
      ['Heard at', r.contexts.length ? r.contexts.join(', ') : 'wherever it is called for'],
      ['Tempo', r.bpm ? `${r.bpm} beats a minute` : '—'],
      ['One pass', secs ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` : '—'],
      ['Room', r.room ? titleCase(r.room) : 'Open air'],
    ];
    for (const [k, v] of kvs) {
      const vl = MK.wrap(v, w - 40);
      MK.kv(ctx, x, ty, w, k, vl.length > 1 ? '' : v, { lead: vl.length <= 1 });
      if (vl.length > 1) vl.slice(0, 2).forEach((l, i) => MK.text(ctx, x + w, ty + i * 5.5, l, { color: C.ink, align: 'right' }));
      ty += vl.length > 1 ? 12 : 7;
    }
    ty += 4;
    const playing = safe(() => Audio.playing, null) === r.id;
    const fav = isFavourite(r.id);
    ty = rubric(ctx, x, ty, w, playing ? 'Playing now' : 'The minstrel');
    if (playing) { this._eq(ctx, x, ty - 1); MK.text(ctx, x + 11, ty, 'You are hearing it.', { color: C.goldBright }); }
    else MK.text(ctx, x, ty, `${keyFor('confirm')} to have it played.`, { color: C.inkDim, maxWidth: w });
    ty += 7;
    MK.text(ctx, x, ty, fav ? '★ Marked as a favourite.' : `${keyFor('interact')} marks it as a favourite.`, { color: fav ? C.goldBright : C.inkDim, maxWidth: w });
    ty += 11;
    if (ty < y + h - 22) {
      ty = rubric(ctx, x, ty, w, 'Incipit');
      drawIncipit(ctx, x, ty + 1, w, Math.min(20, y + h - ty - 1), r.id);
    }
  }

  _drawRebind(ctx) {
    UI.scrim(ctx, 0.6);
    const w = 220, h = 54;
    const x = R((VIEW_W - w) / 2), y = R((VIEW_H - h) / 2);
    // 'gold' is a LIGHT brass fill; goldBright on it is 1.03:1 and inkDim is
    // 1.20:1, so this modal used to be a blank plate. `window_` already stamps
    // the title on a gold nameplate in dark ink — that is where the brass goes.
    UI.window(ctx, x, y, w, h, 'Press a key', { style: 'window' });
    txtC(ctx, x + w / 2, y + 12, ACTION_LABELS[this.rebind.action] || this.rebind.action, {
      size: 'md', color: UI.inkFor('window', 'accent'), shadow: true, maxWidth: w - 16,
    });
    MK.text(ctx, x + w / 2, y + 30, 'Escape keeps the old one.', { color: UI.inkFor('window', 'dim'), align: 'center', maxWidth: w - 16 });
  }
}

// ===========================================================================
// 9. BESTIARY
// ===========================================================================

const BEST_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'known', label: 'Recorded' },
  { id: 'beast', label: 'Beasts' },
  { id: 'humanoid', label: 'Humanoids' },
  { id: 'undead', label: 'Undead' },
  { id: 'dragon', label: 'Dragons' },
  { id: 'fiend', label: 'Fiends' },
];

function monsterFrame(name) {
  const fs = arr(safe(() => spriteFrames(name), []));
  if (fs.indexOf('down-0') >= 0) return 'down-0';
  if (fs.indexOf('idle') >= 0) return 'idle';
  return fs[0] || 'idle';
}

function actionLine(a) {
  if (!a) return '';
  if (a.kind === 'multiattack') return a.desc || 'Makes several attacks.';
  if (a.kind === 'attack') {
    const reach = Array.isArray(a.range) ? `range ${a.range[0]}/${a.range[1]} ft.` : `reach ${num(a.reach, 5)} ft.`;
    const avg = a.dice ? Math.floor(num(safe(() => avgExpr(a.dice), 0), 0)) : 0;
    const dmg = a.dice ? ` Hit: ${avg} (${a.dice}) ${a.dtype || ''} damage.` : '';
    return `${signed(num(a.atkBonus, 0))} to hit, ${reach}.${dmg}`;
  }
  if (a.kind === 'save' && a.save) {
    const avg = a.dice ? Math.floor(num(safe(() => avgExpr(a.dice), 0), 0)) : 0;
    const dmg = a.dice ? ` ${avg} (${a.dice}) ${a.dtype || ''} damage` : '';
    const half = a.save.onSuccess === 'half' ? ', half on a success' : '';
    return `DC ${num(a.save.dc, 10)} ${ABILITY_NAMES[a.save.ability] || a.save.ability} save —${dmg}${half}.`;
  }
  if (a.kind === 'heal') return `Restores ${a.dice || 'hit points'}.`;
  return a.desc || '';
}

/** Turn a stat block into a flat list of drawable lines so it can scroll cleanly. */
function statBlockLines(m, kills, w) {
  const L = [];
  const push = (kind, text, color) => L.push({ kind, text, color });
  const wrap = (text, color, kind) => {
    for (const l of MK.wrap(String(text || ''), w)) push(kind || 'body', l, color);
  };

  push('rule', '');
  const hpAvg = m.hpDice ? Math.max(1, Math.floor(num(safe(() => avgExpr(m.hpDice), 0), 0))) : num(m.hp, 1);
  push('kv', `Armour Class|${num(m.ac, 10)}`);
  push('kv', `Hit Points|${hpAvg}${m.hpDice ? ` (${m.hpDice})` : ''}`);
  const spd = [`${num(m.speed, 30)} ft.`];
  if (num(m.fly, 0)) spd.push(`fly ${m.fly} ft.`);
  if (num(m.swim, 0)) spd.push(`swim ${m.swim} ft.`);
  if (num(m.climb, 0)) spd.push(`climb ${m.climb} ft.`);
  if (num(m.burrow, 0)) spd.push(`burrow ${m.burrow} ft.`);
  push('kv', `Speed|${spd.join(', ')}`);
  push('rule', '');

  // Six ability groups on one line is ~430px in a ~230px pane, so the last
  // three used to be swallowed by an ellipsis — half the stat block, gone.
  // Wrap it instead; the pane scrolls, so extra rows cost nothing.
  const ab = m.abilities || {};
  wrap(ABILITIES.map((a) => `${ABILITY_ABBR[a]} ${num(ab[a], 10)} (${signed(Math.floor((num(ab[a], 10) - 10) / 2))})`).join('  '), null, 'abilities');
  push('rule', '');

  if (arr(m.saveProf).length) push('kv', `Saves|${arr(m.saveProf).map((s) => ABILITY_ABBR[s] || s).join(', ')}`);
  const sk = m.skills || {};
  const skKeys = Object.keys(sk);
  if (skKeys.length) push('kv', `Skills|${skKeys.map((k) => `${(SKILLS[k] || {}).name || titleCase(k)} ${signed(num(sk[k], 0))}`).join(', ')}`);
  const sen = m.senses || {};
  const senBits = Object.keys(sen).map((k) => `${titleCase(k)} ${sen[k]} ft.`);
  senBits.push(`Passive Perception ${num(m.passivePerception, 10)}`);
  push('kv', `Senses|${senBits.join(', ')}`);
  if (arr(m.resist).length) push('kv', `Resistances|${arr(m.resist).join(', ')}`);
  if (arr(m.immune).length) push('kv', `Immunities|${arr(m.immune).join(', ')}`);
  if (arr(m.vuln).length) push('kv', `Vulnerable|${arr(m.vuln).join(', ')}`);
  if (arr(m.condImmune).length) push('kv', `Cond. Immune|${arr(m.condImmune).join(', ')}`);
  push('kv', `Challenge|${crText(num(m.cr, 0))} (${num(safe(() => xpOf(m.id), m.xp), num(m.xp, 0))} XP)`);
  push('kv', `Slain by you|${num(kills, 0)}`);

  if (arr(m.traits).length) {
    push('rule', '');
    push('head', 'TRAITS');
    for (const t of arr(m.traits)) {
      push('name', t.name || 'Trait');
      wrap(t.desc || '');
    }
  }
  if (arr(m.actions).length) {
    push('rule', '');
    push('head', 'ACTIONS');
    for (const a of arr(m.actions)) {
      push('name', a.name || 'Action');
      wrap(actionLine(a));
    }
  }
  if (arr(m.bonusActions).length) {
    push('rule', '');
    push('head', 'BONUS ACTIONS');
    for (const a of arr(m.bonusActions)) { push('name', a.name || 'Bonus Action'); wrap(actionLine(a)); }
  }
  if (arr(m.reactions).length) {
    push('rule', '');
    push('head', 'REACTIONS');
    for (const a of arr(m.reactions)) { push('name', a.name || 'Reaction'); wrap(actionLine(a)); }
  }
  if (m.legendary && arr(m.legendary.actions).length) {
    push('rule', '');
    push('head', `LEGENDARY ACTIONS (${num(m.legendary.count, 3)})`);
    for (const a of arr(m.legendary.actions)) { push('name', a.name || 'Legendary Action'); wrap(actionLine(a)); }
  }
  if (m.desc) { push('rule', ''); wrap(m.desc, C.inkDim); }
  if (arr(m.biomes).length) { push('rule', ''); push('kv', `Found in|${arr(m.biomes).map((b) => titleCase(String(b).replace(/-/g, ' '))).join(', ')}`); }
  return L;
}

export class BestiaryScene extends MenuScene {
  constructor(opts = {}) {
    super('bestiary');
    this.opts = opts || {};
    this.filter = 0;
    this.index = 0;
    this.top = 0;
    this.scroll = 0;
    this.sortByCR = true;
    this.list = [];
    this.rowRects = [];
  }

  _build() {
    const st = S();
    const kills = (st && st.bestiary) || {};
    const f = BEST_FILTERS[this.filter].id;
    const ids = arr(MONSTER_IDS).filter((id) => {
      const m = MONSTERS[id];
      if (!m) return false;
      if (f === 'known') return num(kills[id], 0) > 0;
      if (f === 'all') return true;
      return m.type === f;
    });
    ids.sort((a, b) => {
      const A = MONSTERS[a], B = MONSTERS[b];
      if (this.sortByCR) return num(A.cr, 0) - num(B.cr, 0) || String(A.name).localeCompare(B.name);
      return String(A.name).localeCompare(B.name);
    });
    this.list = ids.map((id) => ({ id, m: MONSTERS[id], kills: num(kills[id], 0) }));
    if (this.index >= this.list.length) this.index = Math.max(0, this.list.length - 1);
    return this.list;
  }

  update(dt) {
    if (this.tick(dt)) return;
    const list = this._build();

    const f0 = this.filter;
    this.filter = navPage(this.filter, BEST_FILTERS.length);
    const tp = tabPressed(5);
    if (tp >= 0) this.filter = tp;
    if (this.filter !== f0) { this.index = 0; this.top = 0; this.scroll = 0; return; }

    if (Input.consume('interact')) {
      this.sortByCR = !this.sortByCR;
      sfx('cursor');
      this.say(this.sortByCR ? 'Sorted by Challenge Rating.' : 'Sorted by name.', false, 1.6);
      return;
    }

    if (listNavActive()) {
      const b = this.index;
      this.index = navV(this.index, list.length);
      if (this.index !== b) this.scroll = 0;
    }
    this.scroll = scrollPane(this.scroll, this._maxScroll || 0, Input.mouse, this._paneRect);

    const m = Input.mouse;
    for (const r of this.rowRects) {
      if (hit(m, r.x, r.y, r.w, r.h)) {
        if (this.index !== r.i) { this.index = r.i; this.scroll = 0; sfx('cursor'); }
      }
    }
    if (Input.consume('cancel')) this.close();
  }

  draw(ctx) {
    MK.desk(ctx);
    this.rowRects = [];
    const list = this.list.length ? this.list : this._build();
    const st = S();
    const known = list.filter((e) => e.kills > 0).length;

    MK.header(ctx, 'Bestiary', {
      sub: `${known} of ${list.length} recorded  ·  ${BEST_FILTERS[this.filter].label}  ·  ${this.sortByCR ? 'by challenge' : 'by name'}`,
      subColor: '#cfc3a6',
    });

    const LX = 3, LY = 18, LW = 148, LH = CONTENT_BOTTOM - 18;
    UI.panel(ctx, LX, LY, LW, LH, { style: 'window' });
    const rowH = 11, visible = 17;
    if (this.index < this.top) this.top = this.index;
    if (this.index > this.top + visible - 1) this.top = this.index - visible + 1;
    this.top = clamp(this.top, 0, Math.max(0, list.length - visible));

    UI.pushClip(ctx, LX + 2, LY + 3, LW - 4, rowH * visible + 2);
    for (let i = 0; i < visible && this.top + i < list.length; i++) {
      const idx = this.top + i;
      const e = list[idx];
      const ry = LY + 5 + i * rowH;
      const on = idx === this.index;
      const seen = e.kills > 0;
      if (on) UI.highlight(ctx, LX + 3, ry - 1, LW - 8, rowH, { alpha: 0.2 });
      UI.icon(ctx, seen ? 'skull' : 'lock', LX + 8, ry, 8, seen ? null : '#4a4238');
      txt(ctx, LX + 19, ry, seen ? e.m.name : 'Unrecorded', {
        size: 'sm', color: seen ? (on ? C.goldBright : C.ink) : '#5a5040', shadow: true, maxWidth: LW - 44,
      });
      MK.text(ctx, LX + LW - 7, ry + 2, seen ? `${e.kills} slain` : `CR ${crText(num(e.m.cr, 0))}`, {
        color: seen ? C.goldBright : '#6a5d48', align: 'right',
      });
      if (on) UI.cursor(ctx, LX + 2, ry, this.t);
      this.rowRects.push({ x: LX + 3, y: ry - 1, w: LW - 8, h: rowH, i: idx });
    }
    UI.popClip(ctx);
    if (list.length > visible) scrollHint(ctx, LX + LW - 4, LY + 4, rowH * visible, this.top, visible, list.length);

    const DX = 155, DW = VIEW_W - DX - 3;
    // A stat block is a page of a monster manual: parchment, rubric rules.
    const pg = MK.page(ctx, DX, LY, DW, LH, { margin: false });
    this._paneRect = { x: DX, y: LY, w: DW, h: LH };
    this._drawBlock(ctx, list[this.index] || null, pg.ix + 6, pg.iy + 4, pg.iw - 12, pg.ih - 7, st);

    this.drawMessage(ctx, 6, MSG_Y, VIEW_W - 12);
    hintBar(ctx, HINT_Y, [
      [keyFor('cancel'), 'Back'], [`${keyFor('prev')}/${keyFor('next')}`, 'Filter'],
      [keyFor('run'), 'Scroll'], [keyFor('interact'), 'Sort'], ['1-5', 'Jump'],
    ]);
    this.drawPrompt(ctx);
  }

  _drawBlock(ctx, e, x, y, w, h, st) {
    const P = MK.PAGE_INK;
    if (!e) { MK.ink(ctx, x + w / 2, y + h / 2, 'A clean page.', { color: P.dim, align: 'center' }); return; }
    const m = e.m;
    const seen = e.kills > 0;

    // The creature itself, in a gilt frame top right, at a whole-number scale.
    const FW = 44, FH = 46;
    const fx = x + w - FW, fy = y;
    const f = MK.frame(ctx, fx, fy, FW, FH, { ground: ['#3a2c20', '#120d09'], glow: seen ? 0.25 : 0.05 });
    const spriteName = m.sprite || m.id;
    if (safe(() => hasSprite(spriteName), false)) {
      const frame = monsterFrame(spriteName);
      const sz = spriteSize(spriteName);
      const k = Math.max(1, Math.min(3, Math.floor(Math.min((f.iw - 2) / sz.w, (f.ih - 2) / sz.h))));
      const bx = f.ix + f.iw / 2, by = f.iy + f.ih - Math.max(1, Math.floor((f.ih - sz.h * k) / 2));
      UI.pushClip(ctx, f.ix, f.iy, f.iw, f.ih);
      if (seen) safe(() => drawSprite(ctx, spriteName, frame, bx, by, { scale: k, shadow: 0.3, tint: m.tint || null, tintAmt: m.tint ? 0.4 : 0 }));
      else safe(() => drawSprite(ctx, spriteName, frame, bx, by, { scale: k, tint: '#0c0a08', tintAmt: 1, alpha: 0.85 }));
      UI.popClip(ctx);
    } else {
      UI.icon(ctx, 'skull', f.ix + f.iw / 2 - 8, f.iy + f.ih / 2 - 8, 16, seen ? null : '#3a3228');
    }

    const tw = w - FW - 6;
    safe(() => UI.heading(ctx, x, y, MK.fit(seen ? m.name : 'Unrecorded', tw, 'title'), {
      size: 'title', color: P.title, capColor: P.rubric, capGilt: false, shadow: false,
    }));
    MK.ink(ctx, x, y + 10, seen ? safe(() => statLine(m), '') : `Challenge ${crText(num(m.cr, 0))}`, { color: P.dim, maxWidth: tw });

    if (!seen) {
      this._maxScroll = 0;
      MK.capPara(ctx, x, y + 20, tw, 'You have never put one of these in the ground. Kill one, and Oghma willing, the notes will write themselves.', {
        color: P.dim, shadow: false,
      });
      return;
    }

    const LH = 6;
    const lines = statBlockLines(m, e.kills, w - 6);
    const bodyY = y + 18;
    const avail = Math.max(1, Math.floor((y + h - bodyY) / LH));
    this._maxScroll = Math.max(0, lines.length - avail);
    const off = clamp(R(this.scroll), 0, this._maxScroll);
    UI.pushClip(ctx, x - 2, bodyY - 1, w + 4, y + h - bodyY + 1);
    for (let i = 0; i < avail && off + i < lines.length; i++) {
      const l = lines[off + i];
      const ly = bodyY + i * LH;
      // Keep the first rows clear of the portrait frame.
      const lw = ly < fy + FH + 1 ? tw : w - 5;
      if (l.kind === 'rule') {
        // the tapering red rule of a stat block
        const g = ctx.createLinearGradient(x, 0, x + lw, 0);
        g.addColorStop(0, 'rgba(154,42,26,0.85)'); g.addColorStop(1, 'rgba(154,42,26,0.05)');
        ctx.fillStyle = g; ctx.fillRect(x, ly + 2.5, lw, 1);
        continue;
      }
      if (l.kind === 'head') { MK.ink(ctx, x, ly, l.text, { size: 'fineb', color: P.rubric, letterSpacing: 2, maxWidth: lw }); continue; }
      if (l.kind === 'name') { MK.ink(ctx, x, ly, l.text, { size: 'fineb', color: P.title, maxWidth: lw }); continue; }
      if (l.kind === 'abilities') { MK.ink(ctx, x, ly, l.text, { size: 'fineb', color: P.body, maxWidth: lw }); continue; }
      if (l.kind === 'kv') {
        const bits = String(l.text).split('|');
        MK.ink(ctx, x, ly, bits[0], { size: 'fineb', color: P.rubric });
        MK.ink(ctx, x + MK.measure(bits[0], 'fineb') + 3, ly, bits[1] || '', { maxWidth: lw - MK.measure(bits[0], 'fineb') - 3 });
        continue;
      }
      MK.ink(ctx, x, ly, l.text, { color: l.color === C.inkDim ? P.dim : P.body, maxWidth: lw });
    }
    UI.popClip(ctx);
    MK.scroll(ctx, x + w - 3, bodyY, avail * LH, off, avail, lines.length);
    void st;
  }
}

// ===========================================================================
// 10. SAVE / LOAD
// ===========================================================================

export class SaveMenuScene extends MenuScene {
  /** @param {'save'|'load'} mode */
  constructor(mode = 'save', opts = {}) {
    super('savemenu');
    this.mode = mode === 'load' ? 'load' : 'save';
    this.opts = opts || {};
    this.index = 0;
    this.slots = [];
    this.rowRects = [];
    this._party = Object.create(null);   // slot -> Character[] for the portraits
    this._busy = false;
  }

  enter(prev) {
    super.enter(prev);
    this.slots = arr(safe(() => Save.list(), [])) || [];
    if (!this.slots.length) {
      this.slots = [0, 1, 2, 3, 4].map((slot) => ({ slot, label: slot === 0 ? 'Autosave' : `Slot ${slot}`, empty: true }));
    }
    this.index = clamp(this.index, 0, this.slots.length - 1);
  }

  /** Deserialise the highlighted slot's party, lazily, so we can show real busts. */
  _partyFor(slot) {
    if (this._party[slot] !== undefined) return this._party[slot];
    this._party[slot] = null;
    const data = safe(() => Save.read(slot), null);
    const raw = data && data.party && arr(data.party.members);
    if (!raw || !raw.length) return null;
    const out = [];
    for (const m of raw.slice(0, 4)) {
      const ch = safe(() => deserializeChar(m), null);
      if (ch) out.push(ch);
    }
    this._party[slot] = out.length ? out : null;
    return this._party[slot];
  }

  update(dt) {
    if (this.tick(dt)) return;
    if (this._busy) return;
    const n = this.slots.length;
    this.index = navV(this.index, n);

    const m = Input.mouse;
    for (const r of this.rowRects) {
      if (hit(m, r.x, r.y, r.w, r.h)) {
        if (this.index !== r.i) { this.index = r.i; sfx('cursor'); }
        if (clicked(m, r.x, r.y, r.w, r.h)) { this._choose(); return; }
      }
    }
    if (Input.consume('interact')) { this._delete(); return; }
    if (Input.consume('confirm')) { this._choose(); return; }
    if (Input.consume('cancel')) this.close();
  }

  _slot() { return this.slots[clamp(this.index, 0, this.slots.length - 1)] || null; }

  _choose() {
    const s = this._slot();
    if (!s) { sfx('error'); return; }
    if (this.mode === 'load') {
      if (s.empty) { this.say('That journal is blank.', true); return; }
      if (s.corrupt) { this.say('That journal is water-damaged beyond reading.', true); return; }
      this.ask('Read this journal?', `${s.name || 'Adventurer'} — ${s.mapName || ''}. Anything unsaved is lost.`, [
        { label: 'Load it', value: 'yes' },
        { label: 'Back', value: null },
      ], (v) => { if (v === 'yes') this._load(s.slot); });
      return;
    }
    if (s.slot === 0) { this.say('The autosave writes itself. Choose another slot.', true); return; }
    if (!s.empty) {
      this.ask('Overwrite?', `Slot ${s.slot} holds ${s.name || 'a campaign'} at level ${num(s.level, 1)}.`, [
        { label: 'Write over it', value: 'yes', color: C.warn },
        { label: 'Back', value: null },
      ], (v) => { if (v === 'yes') this._write(s.slot); });
      return;
    }
    this._write(s.slot);
  }

  _delete() {
    const s = this._slot();
    if (!s || s.empty) { sfx('error'); return; }
    this.ask('Burn this journal?', `${s.name || 'This campaign'} will be gone for good.`, [
      { label: 'Burn it', value: 'yes', color: C.bad },
      { label: 'Keep it', value: null },
    ], (v) => {
      if (v !== 'yes') return;
      safe(() => Save.erase(s.slot));
      delete this._party[s.slot];
      this.slots = arr(safe(() => Save.list(), this.slots)) || this.slots;
      sfx('back');
      this.say('Burned.');
    });
  }

  _write(slot) {
    const st = S();
    if (!st) { this.say('There is no campaign to record.', true); return; }
    const payload = safe(() => saveState(st, serializeChar), null);
    if (!payload) { this.say('The quill snapped — nothing was written.', true); return; }
    safe(() => { payload.meta = stateSummary(st); });
    const res = safe(() => Save.write(slot, payload), null);
    if (!res || res.ok === false) {
      this.say((res && res.reason === 'quota') ? 'No room left in this browser.' : 'That journal will not take ink.', true);
      return;
    }
    delete this._party[slot];
    this.slots = arr(safe(() => Save.list(), this.slots)) || this.slots;
    sfx('quest');
    safe(() => toast('Journal updated.'));
    this.say('Written down.');
  }

  _load(slot) {
    const data = safe(() => Save.read(slot), null);
    if (!data) { this.say('That journal cannot be read.', true); return; }
    this._busy = true;
    softImport('../world/overworld.js', 'overworld').then((ow) => {
      let st = null;
      try { st = loadState(data, deserializeChar); } catch (err) {
        console.error('[menus] load failed', err);
        this._busy = false;
        this.say('That journal is damaged.', true);
        return;
      }
      Game.state = st;
      for (const m of safe(() => Party.all(), []) || []) safe(() => recalc(m));
      if (!ow || !ow.OverworldScene) {
        this._busy = false;
        this.say('The Sword Coast is not yet mapped.', true);
        return;
      }
      safe(() => Audio.music(null));
      Game.transition('fade', () => {
        Game.replace(new ow.OverworldScene(st.mapId, { x: st.x, y: st.y, dir: st.dir }));
      });
    });
  }

  // --- drawing ------------------------------------------------------------

  draw(ctx) {
    MK.desk(ctx);
    this.rowRects = [];

    MK.header(ctx, this.mode === 'load' ? 'Read a Journal' : 'Write the Journal', {
      sub: safe(() => Save.available, true) ? 'Kept in this browser' : 'Storage is off: saves will not survive.',
      subColor: safe(() => Save.available, true) ? '#8a7a5c' : C.warn,
    });

    const CARD_H = 36, CARD_W = VIEW_W - 16;
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      const y = 20 + i * (CARD_H + 2);
      const on = i === this.index;
      this.rowRects.push({ x: 8, y, w: CARD_W, h: CARD_H, i });
      UI.panel(ctx, 8, y, CARD_W, CARD_H, {
        style: s.corrupt ? 'danger' : (s.empty ? 'dark' : 'window'),
        shadow: on ? 0.45 : 0.2, studs: false,
      });
      if (on) {
        const g = ctx.createLinearGradient(8, 0, 8 + CARD_W, 0);
        g.addColorStop(0, 'rgba(255,214,150,0.12)'); g.addColorStop(1, 'rgba(255,214,150,0)');
        ctx.fillStyle = g; ctx.fillRect(10, y + 2, CARD_W - 4, CARD_H - 4);
      }
      // the slot's name in small capitals down the left margin
      MK.text(ctx, 15, y + 5, String(s.label || `Slot ${s.slot}`).toUpperCase(), {
        size: 'fineb', color: s.slot === 0 ? C.cyan : '#c49a4a', letterSpacing: 2, maxWidth: 58,
      });

      if (s.empty) {
        MK.text(ctx, 15, y + 17, 'A blank page', { color: '#6a5d48' });
        if (on) UI.frameSel(ctx, 7, y - 1, CARD_W + 2, CARD_H + 2, this.t);
        continue;
      }
      if (s.corrupt) {
        MK.text(ctx, 15, y + 17, 'This page is torn and cannot be read.', { size: 'fineb', color: C.bad });
        if (on) UI.frameSel(ctx, 7, y - 1, CARD_W + 2, CARD_H + 2, this.t);
        continue;
      }

      // Portraits: painted busts for the highlighted card, initials otherwise.
      const px = 76;
      const party = on ? this._partyFor(s.slot) : null;
      if (party && party.length) {
        party.slice(0, 4).forEach((ch, k) => MK.portrait(ctx, ch, px + k * 23, y + 5, 22, 26, { glow: 0.2 }));
      } else {
        arr(s.partyNames).slice(0, 4).forEach((nm, k) => {
          const f = MK.frame(ctx, px + k * 23, y + 5, 22, 26, { glow: 0.08 });
          MK.title(ctx, f.ix + f.iw / 2, f.iy + f.ih / 2 - 4, String(nm || '?').charAt(0).toUpperCase(), { align: 'center', color: '#8a7a5c' });
        });
      }

      const tx = px + 96;
      MK.title(ctx, tx, y + 5, `${s.name || 'Adventurer'}`, { maxWidth: 124 });
      MK.text(ctx, tx, y + 16, `Level ${num(s.level, 1)} · ${plural(num(s.partySize, 0), 'companion')}`, { color: C.inkBright, maxWidth: 124 });
      MK.text(ctx, tx, y + 23, `${s.mapName || 'The Sword Coast'}${num(s.gold, 0) ? ` · ${goldText(s.gold)}` : ''}`, {
        color: C.inkDim, maxWidth: 124,
      });

      const rx = VIEW_W - 15;
      MK.text(ctx, rx, y + 5, s.playtimeText || playtimeText(num(s.playtime, 0)), { size: 'fineb', color: C.goldBright, align: 'right' });
      MK.text(ctx, rx, y + 16, dateText(num(s.day, 1)), { color: C.ink, align: 'right', maxWidth: 120 });
      MK.text(ctx, rx, y + 23, s.ago ? `written ${s.ago}` : (s.savedAtText || ''), { color: '#8a7a5c', align: 'right', maxWidth: 120 });
      if (on) UI.frameSel(ctx, 7, y - 1, CARD_W + 2, CARD_H + 2, this.t);
    }

    this.drawMessage(ctx, 8, MSG_Y, VIEW_W - 16);
    hintBar(ctx, HINT_Y, [
      [keyFor('cancel'), 'Back'],
      [keyFor('confirm'), this.mode === 'load' ? 'Load' : 'Save'],
      [keyFor('interact'), 'Delete'],
    ]);
    this.drawPrompt(ctx);
  }
}

// ===========================================================================
// 11. EXPORT
// ===========================================================================

export default {
  PauseMenuScene, PartyScene, InventoryScene, SpellbookScene, JournalScene,
  MapScene, OptionsScene, BestiaryScene, SaveMenuScene,
};
