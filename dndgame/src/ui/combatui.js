// ui/combatui.js — BattleScene: the tactical D&D 5.5e battle interface.
//
// The rules live in rules/combat.js, which is headless and synchronous. This scene
// is the *theatre*: it asks the Encounter what is legal, tells it what the player
// chose, and then REPLAYS the structured results it gets back as an animation —
// dice tumbling, blades swinging, numbers floating, corpses fading.
//
// Layout (400x240 logical pixels; the interface is drawn on the 2x fine grid):
//   y   0.. 19   top band — round seal, initiative rail, the last lines of the log
//   y  20..210   the battlefield, 16px tiles at 2x zoom, camera panning to the actor;
//                over it only the target card, the verb detail, banners and dice
//   y 211..239   bottom band — acting creature's card, action budget, action bar, End Turn
//
// Everything is drawn through ui/kit.js UI.*; nothing here touches ctx.font.
//
// A NOTE ON REACTIONS. rules/combat.js offers reactions through a synchronous
// callback in the middle of resolving an attack — JavaScript cannot pause there to
// wait for a keypress. So the scene keeps a per-encounter *stance* for each kind of
// reaction ('ask' | 'yes' | 'no'). An armed stance answers instantly; an 'ask'
// falls through to the engine's own sensible default AND queues the timed yes/no
// prompt, whose answer arms the stance for the rest of the fight. Companions the
// player has handed to the AI never prompt at all.

import { UI } from './kit.js';
import { hairFrame, fleuron, grain, GILT, RUBRIC, LAPIS, VERDIGRIS } from './ornament.js';
import { Input } from '../core/input.js';
import { Audio } from '../core/audio.js';
import { battleCue } from '../core/music.js';
import { Save } from '../core/save.js';
import { Game } from '../engine.js';
import { FX } from '../render/fx.js';
import { VFX } from '../render/vfx.js';
import { Stage } from '../render/stage.js';
import { Layout } from './layout.js';
import { bus, EV } from '../core/events.js';
import { avgExpr } from '../core/dice.js';
import { hashStr } from '../core/rng.js';
import {
  TILE, VIEW_W, VIEW_H, SIZES, clamp, lerp, signed, titleCase, ordinal,
} from '../constants.js';

import { drawActor, drawPortrait, drawCreaturePortrait, actorPosePoint, actorPoseFrames } from '../render/actor.js';
import { monsterSpriteSize, monsterArtFor } from '../render/spritedata_monsters.js';
import { hasSprite, spriteSize, getSprite } from '../render/sprites.js';
import { ramp, INK } from '../render/palette.js';
import * as Tiles from '../render/tiles.js';
import { isTreeTile, visibleTrees, drawTree } from '../render/trees.js';
import { drawGroundSurface, drawGroundDetails } from '../render/ground-design.js';
import { drawDungeonScenery } from '../render/dungeon-scenery.js';

import {
  acOf, maxHpOf, isDead, saveMod, speedOf,
} from '../rules/character.js';
import { conditionBadges, conditionName } from '../rules/conditions.js';
import {
  computeAdvantage, hasCover, distanceFt, footprintSize, footprintTiles, TILE_FLAGS,
} from '../rules/actions.js';
import { takeTurn } from '../rules/ai.js';
import { xpProgress } from '../rules/progression.js';
import { getSpell, spellDamageDice } from '../data/spells.js';
import { itemName } from '../data/items.js';
import * as MonsterData from '../data/monsters.js';
import { Party } from '../world/party.js';
import { GameOverScene } from './title.js';

// ===========================================================================
// 0. LAYOUT & TUNING
// ===========================================================================

const R = Math.round;
// FX.draw without the damage numbers, which the field lifts onto 'world-ui'.
const NO_FLOATERS = Object.freeze({ floaters: false });

/**
 * The interface lives in two thin bands drawn on the fine grid — the
 * initiative rail and the log along the top, the acting creature's card, the
 * action bar and End Turn along the bottom — and the battlefield gets
 * everything between them. Only small plates with something to say ever float
 * over the field: the verb under the cursor, the creature under it, banners
 * and dice. The old layout stacked a 50px detail plate, a budget strip and a
 * note strip over the field above a 38px bar, and hung a 66px log down its
 * right-hand side; a third of the arena was interface.
 */
const TOP_H = 20;
const BOT_H = 29;
const BAND_Y = VIEW_H - BOT_H;

/** The battlefield viewport, between the bands. */
const FIELD = { x: 0, y: TOP_H, w: VIEW_W, h: VIEW_H - TOP_H - BOT_H };

// Every block's designed spot. syncLayout() copies the player's arrangement
// (Arrange mode, F8) into these before every draw and hit-test, so both follow.
const RAIL = { x: 2, y: 1, w: 250, h: 18 };
const LOGTAIL = { x: 262, y: 1, w: 136, h: 18 };
const UNIT = { x: 2, y: BAND_Y + 2, w: 102, h: 26 };
const BUDGET = { x: 106, y: BAND_Y + 2, w: 31, h: 26 };
// The action bar starts after the budget and is as wide as its verbs; the
// End Turn plate keeps the right-hand end, always in the same place.
const MENU = { x: 139, y: BAND_Y + 2, w: 226, h: 26 };
const ENDBTN = { x: 367, y: BAND_Y + 2, w: 31, h: 26 };
// The detail of the verb under the cursor hangs over its own plate; this is
// only where its bottom edge sits (and what Arrange mode offsets).
const DETAIL = { x: 139, y: BAND_Y - 40, w: 160, h: 38 };
/** The one-line contextual note (a refusal, the movement key), above the unit card. */
const NOTE = { x: 2, y: BAND_Y - 10, w: 250, h: 9 };
/** The target card, top left under the rail. */
const STAT = { x: 3, w: 120, h: 110 };
const STAT_Y = TOP_H + 3;
const DICE = { x: 200, y: 92 };

const VERB_MAX = 24;       // widest verb plate
const VERB_MIN = 16;       // narrowest before the bar pages: an 11px icon and air
const BAR_PAD = 2.5;
const BAR_BACK = 9;        // the submenu's back chevron
const BAR_PAGER = 14;
const LEVEL_GAP = 3;       // between spell levels in the spell bar
const LOG_ROWS = 34;       // lines on a page of the full log

const WIDGETS = [
  ['battle.rail', RAIL, 'tl', 'Initiative', false],
  ['battle.log', LOGTAIL, 'tr', 'Log', true],
  ['battle.unit', UNIT, 'bl', 'Active unit', true],
  ['battle.budget', BUDGET, 'bl', 'Action budget', true],
  ['battle.menu', MENU, 'bl', 'Actions', false],
  ['battle.end', ENDBTN, 'br', 'End turn', false],
  ['battle.detail', DETAIL, 'bl', 'Details', true],
];
const HOME = new Map(WIDGETS.map(([id, r]) => [id, { x: r.x, y: r.y }]));
for (const [id, r, anchor, label, hideable] of WIDGETS) {
  Layout.register(id, { anchor, x: r.x, y: r.y, w: r.w, h: r.h, label, scene: 'battle', hideable });
}
Layout.register('battle.stat', { anchor: 'tl', x: STAT.x, y: STAT_Y, w: STAT.w, h: STAT.h, label: 'Target card', scene: 'battle' });
Layout.register('battle.dice', { anchor: 'mc', x: DICE.x - 40, y: DICE.y - 34, w: 80, h: 76, label: 'Dice', scene: 'battle' });

function syncLayout() {
  for (const [id, r] of WIDGETS) {
    const q = Layout.rect(id);
    r.x = q.visible ? q.x : -9999; r.y = q.y;
  }
  const s = Layout.rect('battle.stat');
  STAT.x = s.x; STAT.dy = s.y - STAT_Y;
  const d = Layout.rect('battle.dice');
  DICE.x = d.x + 40; DICE.y = d.y + 34;
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];

/** Movement speed of a walking sprite, in world pixels per second. */
const WALK_PX = 52;

/** How long the scene lingers between the steps of an enemy's plan. */
const PLAN_PAUSE = 0.34;

/** The d20 popup holds this long after landing so the maths can be read. */
const DICE_HOLD = 1.05;
const DMG_HOLD = 0.85;

const SIDE_COLOR = { party: '#6ac0f0', foe: '#e0604a' };

/** Log line kind -> ink colour. */
const LOG_COLORS = {
  round: UI.COLORS.gold, turn: UI.COLORS.goldBright, crit: UI.COLORS.goldBright,
  hit: UI.COLORS.ink, miss: UI.COLORS.inkDim, damage: '#e88a70', save: '#8fd8ee',
  heal: UI.COLORS.good, buff: UI.COLORS.good, debuff: UI.COLORS.purple, info: UI.COLORS.inkDim,
};

/** Fallback floor colours per biome, used when render/tiles.js has not registered. */
const BIOME_FLOOR = {
  plains: ['#3f6b3a', '#487a41', '#39602f'], road: ['#7a6a4a', '#6b5c3f', '#84745a'],
  forest: ['#2f5e30', '#376a36', '#28522a'], 'pine-forest': ['#2a5440', '#316049', '#244a39'],
  hills: ['#5a6b3a', '#647541', '#4e5e32'], mountain: ['#6a6a72', '#767680', '#5c5c64'],
  marsh: ['#4a5230', '#545c38', '#3f4629'], coast: ['#a89870', '#b8a880', '#9a8a64'],
  ruins: ['#6a6458', '#767062', '#5c5750'], cave: ['#413a38', '#4a4340', '#38322f'],
  dungeon: ['#4a4650', '#545059', '#403c46'], crypt: ['#3f3a44', '#48434d', '#36323b'],
  mine: ['#4a4038', '#544940', '#403830'], 'ash-waste': ['#4a4442', '#544e4b', '#403a39'],
  tundra: ['#b8c4cc', '#c6d0d8', '#a8b4bd'], underdark: ['#33303f', '#3b3849', '#2b2836'],
  city: ['#6e6a62', '#78746c', '#625e57'],
};

// ===========================================================================
// 1. SMALL HELPERS
// ===========================================================================

function safe(fn, fallback) {
  try {
    const v = fn();
    return v === undefined ? fallback : v;
  } catch (e) { return fallback; }
}

const key = (x, y) => `${x},${y}`;
const posOf = (u) => (u && u.pos ? u.pos : { x: 0, y: 0 });
const arr = (v) => (Array.isArray(v) ? v : []);
const lower = (v) => String(v == null ? '' : v).toLowerCase();

/** Feet at the bottom of the tile, centred horizontally — world pixels. */
function easeOut(t) { const u = 1 - clamp(t, 0, 1); return 1 - u * u * u; }
function easeIn(t) { const u = clamp(t, 0, 1); return u * u; }

function feetOf(u) {
  const p = posOf(u);
  const size=footprintSize(u);
  return { x: (p.x + size/2) * TILE, y: (p.y + size) * TILE };
}

function sizeScale(u) {
  const s = SIZES[String(u?.size || 'medium').toLowerCase()];
  // Large authored bodies already carry their size in their pixel dimensions.
  if(u?.monsterId && (monsterArtFor(u.monsterId,u.sprite)?.worldScale || monsterSpriteSize(u.monsterId).h>=40))return 1;
  return s ? Math.min(2.2, s.scale) : 1;
}

function hpPct(u) {
  const max = safe(() => maxHpOf(u), u?.maxHp || 1) || 1;
  return clamp((u?.hp || 0) / max, 0, 1);
}

function sfx(name, opts) { safe(() => Audio.sfx(name, opts)); }

/** "1d8 [6] +3 = 9 slashing" — the whole point of playing D&D. */
function componentLine(c) {
  if (!c) return '';
  const rolls = Array.isArray(c.rolls) && c.rolls.length ? ` [${c.rolls.join(',')}]` : '';
  const dice = c.dice && c.dice !== '0' ? `${c.dice}${rolls}` : '';
  const mod = c.mod ? `${c.mod > 0 ? ' +' : ' '}${c.mod}` : '';
  const head = dice ? `${dice}${mod}` : `${c.mod || c.total}`;
  return `${head} = ${c.total} ${c.type || ''}`.trim();
}

/** Up to three readable damage lines from an AttackResult / SaveResult breakdown. */
function damageLines(breakdown) {
  const out = [];
  for (const c of breakdown || []) {
    if (!c || c.kind !== 'damage') continue;
    const label = c.label && !/attack roll/i.test(c.label) ? c.label : '';
    const line = componentLine(c);
    if (!line) continue;
    out.push(label && out.length ? `${label}: ${line}` : line);
    if (out.length >= 3) break;
  }
  return out;
}

/** Chance (0..1) that `atk + d20` beats `ac`, folding in advantage. */
function hitChance(atk, ac, adv, dis) {
  let p = clamp((21 - (ac - atk)) / 20, 0.05, 0.95);
  if (adv && !dis) p = 1 - (1 - p) * (1 - p);
  else if (dis && !adv) p *= p;
  return p;
}

/** Average of a dice expression plus a flat modifier; never throws on junk. */
function avgOf(dice, mod) {
  const base = dice ? safe(() => avgExpr(String(dice)), 0) || 0 : 0;
  return Math.max(0, Math.round(base + (mod || 0)));
}

/** A challenge rating as the books print it: 1/8, 1/4, 1/2, 1 ... */
function crText(cr) {
  const n = Number(cr);
  if (n === 0.125) return '1/8';
  if (n === 0.25) return '1/4';
  if (n === 0.5) return '1/2';
  return String(cr);
}

// ---------------------------------------------------------------------------
// 1.1 VERB ICONS
// ---------------------------------------------------------------------------

/**
 * The action bar is icon-only, so the icon IS the label — and eleven of them
 * were the same grey ring.
 *
 * rules/combat.js names its icons for a set the kit does not have ('boot',
 * 'shield-half', 'hide', 'hand', 'speech', 'spell', 'claw', 'rage', 'fist',
 * 'music', and the literal fallback 'dot'). `UI.icon` silently substitutes
 * 'rune' for every unknown name, so Dash, Disengage, Dodge, Hide, Help, Shove,
 * Grapple, Search, Ready, Retreat, Reactions and End Turn all drew the SAME
 * glyph — twelve identical buttons on a bar whose whole premise is that you
 * read it at a glance. The rules module is not ours to edit, so the translation
 * lives here, next to the bar that needs it.
 */
const ICON_ALIAS = {
  boot: 'boots', 'shield-half': 'dodge', hide: 'shadow', hand: 'hammer',
  speech: 'scroll', spell: 'rune', claw: 'dagger', rage: 'flame',
  fist: 'hammer', music: 'wind', grab: 'lock', stun: 'psychic',
  fear: 'skull', ghost: 'shadow', 'eye-off': 'eye', dot: '',
};

/** Per-verb icons, keyed by the engine's own option ids. */
const VERB_ICONS = {
  '@attack': 'sword', '@cast': 'staff', '@class': 'star', '@item': 'potion',
  '@move': 'foot', '@flee': 'run', '@reactions': 'shield',
  dash: 'dash', dodge: 'dodge', disengage: 'boots', hide: 'shadow',
  help: 'plus', shove: 'wind', grapple: 'lock', search: 'eye',
  ready: 'hourglass', end: 'hourglass', 'use-object': 'key', influence: 'scroll',
  'special:rage': 'flame', 'special:second-wind': 'heart',
  'special:action-surge': 'bolt', 'special:channel-divinity': 'holy',
  'special:lay-on-hands': 'plus', 'special:bardic-inspiration': 'wind',
  'special:sneak-attack': 'dagger', 'special:divine-smite': 'radiant',
  'special:wild-shape': 'leaf', 'special:arcane-recovery': 'rune',
  'special:font-of-magic': 'gem', 'special:eldritch-invocation': 'necrotic',
};

/** School -> icon, for any spell whose damage type does not name one. */
const SCHOOL_ICONS = {
  abjuration: 'shield', conjuration: 'rune', divination: 'eye',
  enchantment: 'psychic', evocation: 'bolt', illusion: 'shadow',
  necromancy: 'necrotic', transmutation: 'gem',
};

/** Weapon-name -> icon, so a submenu of six attacks is six different pictures. */
const WEAPON_ICON_WORDS = [
  [/\b(bow|crossbow|sling|dart)\b/, 'bow'],
  [/\b(dagger|knife|kris|stiletto)\b/, 'dagger'],
  [/\b(axe|hatchet|halberd|glaive)\b/, 'axe'],
  [/\b(mace|maul|club|flail|morningstar|warhammer|hammer)\b/, 'mace'],
  [/\b(spear|pike|lance|javelin|trident)\b/, 'spear'],
  [/\b(staff|quarterstaff|rod|wand)\b/, 'staff'],
  [/\b(shield|bash)\b/, 'shield'],
  [/\b(claw|bite|talon|fang|slam|tail|gore|sting)\b/, 'dagger'],
];

/** Item-name -> icon, same idea for a pack full of things. */
const ITEM_ICON_WORDS = [
  [/\bscroll\b/, 'scroll'],
  [/\b(potion|elixir|philter|draught)\b/, 'potion'],
  [/\b(oil|flask|vial|alchemist)\b/, 'flask'],
  [/\b(bomb|fire|flame|torch)\b/, 'flame'],
  [/\b(wand|rod)\b/, 'wand'],
  [/\b(ring|band)\b/, 'ring'],
  [/\b(amulet|pendant|periapt|talisman)\b/, 'amulet'],
  [/\b(gem|stone|crystal|pearl)\b/, 'gem'],
  [/\b(book|tome|grimoire|manual)\b/, 'book'],
  [/\b(rope|kit|tools|caltrops|net)\b/, 'bag'],
  [/\b(holy|water|blessed)\b/, 'holy'],
  [/\b(key|lockpick)\b/, 'key'],
  [/\b(food|ration|bread)\b/, 'leaf'],
];

const ICON_FALLBACK = { attack: 'sword', spell: 'rune', item: 'bag', special: 'star' };

function matchWord(list, name) {
  const s = lower(name);
  for (const [re, id] of list) if (re.test(s)) return id;
  return '';
}

/**
 * The icon this action deserves. Explicit id first, then the damage school or
 * weapon/item name, then the kit alias for whatever the rules asked for, then a
 * per-kind fallback. Never returns '' — a missing icon is a grey ring, and grey
 * rings are the bug.
 */
function verbIcon(row) {
  if (!row) return 'rune';
  const id = String(row.id || '');
  if (VERB_ICONS[id]) return VERB_ICONS[id];
  if (id.startsWith('@stance:')) return 'shield';

  const kind = lower(row.kind);

  if (kind === 'attack') {
    const w = matchWord(WEAPON_ICON_WORDS, row.name);
    if (w) return w;
    const dt = lower(row.damage && row.damage.type);
    if (dt && UI.DAMAGE_ICONS[dt]) return UI.DAMAGE_ICONS[dt];
    if (row.ranged) return 'bow';
    return 'sword';
  }

  if (row.spellId || kind === 'spell' || id.startsWith('spell:')) {
    const sp = row.spellId ? safe(() => getSpell(row.spellId), null) : null;
    // A healing spell is the one a player hunts for under pressure, so it gets
    // its own mark before the school ever gets a look in — otherwise Cure
    // Wounds, Counterspell and Shield are three identical abjuration shields.
    if (sp && sp.heal) return 'plus';
    const dt = lower((sp && sp.damage && sp.damage.type) || (row.damage && row.damage.type));
    if (dt && UI.DAMAGE_ICONS[dt]) return UI.DAMAGE_ICONS[dt];
    if (sp && SCHOOL_ICONS[lower(sp.school)]) return SCHOOL_ICONS[lower(sp.school)];
    const w = matchWord(ITEM_ICON_WORDS, row.name);
    if (w) return w;
    return 'rune';
  }

  if (kind === 'item') {
    const w = matchWord(ITEM_ICON_WORDS, row.name);
    if (w) return w;
  }

  // Whatever the rules module asked for, translated into a name the kit knows.
  const want = String(row.icon || '');
  if (want) {
    const mapped = Object.prototype.hasOwnProperty.call(ICON_ALIAS, want) ? ICON_ALIAS[want] : want;
    if (mapped && UI.iconNames.includes(mapped)) return mapped;
  }
  return ICON_FALLBACK[kind] || 'rune';
}

// ---------------------------------------------------------------------------
// 1.2 HUD PIECES
// ---------------------------------------------------------------------------
// The battle interface is built from a handful of fine-grid parts — a plate, a
// gem, a keycap, a token — so the rail, the bar, the cards and the prompts
// read as one set of pieces rather than a dozen frame styles. Every one is
// drawn in logical px on a 2x layer; the half-pixel steps are device pixels.

const Q = 0.5;
const KEY = '#07050a';
/** The heraldic tincture of each side: token frames, banners, HP. */
const TINCTURE = { party: LAPIS, foe: RUBRIC };
const COST_GEM = { action: '#e3b34a', bonus: '#6fc36a', reaction: '#6aa8e8', free: '#b9c1cf' };
const SIDE_INK = { party: '#a9c8f0', foe: '#f09a84' };

/**
 * A plate of dark vellum: a keyline, a fill falling from warm to deep, and a
 * hairline edge lit from the upper left. `gilt` swaps the edge for gold.
 */
function plate(ctx, x, y, w, h, o = {}) {
  const prev = ctx.globalAlpha;
  if (o.alpha != null && o.alpha < 1) ctx.globalAlpha = prev * o.alpha;
  if (o.shadow !== false) { ctx.fillStyle = 'rgba(0,0,0,0.42)'; ctx.fillRect(x + 1, y + 1, w, h); }
  ctx.fillStyle = KEY;
  ctx.fillRect(x, y, w, h);
  UI.vgrad(ctx, x + Q, y + Q, w - 1, h - 1, o.top || '#2a211b', o.bot || '#141012');
  grain(ctx, 'vellum', x + Q, y + Q, w - 1, h - 1, 0.45);
  hairFrame(ctx, x + Q, y + Q, w - 1, h - 1,
    o.lit || (o.gilt ? GILT.base : '#6b5431'), o.shade || (o.gilt ? GILT.lo : '#2c2014'));
  if (o.gilt) {
    // gilt corner ticks, the binder's brass on a book's corners
    ctx.fillStyle = GILT.hi;
    for (const [cx, cy, dx, dy] of [[x + 1, y + 1, 1, 1], [x + w - 1.5, y + 1, -1, 1], [x + 1, y + h - 1.5, 1, -1], [x + w - 1.5, y + h - 1.5, -1, -1]]) {
      ctx.fillRect(cx, cy, Q, Q);
      ctx.fillRect(cx + dx * Q, cy, Q, Q);
      ctx.fillRect(cx, cy + dy * Q, Q, Q);
    }
  }
  ctx.globalAlpha = prev;
}

/**
 * A meter on the fine grid: a one-device-pixel keyline round the kit's bar.
 * The kit's own border is a whole logical pixel, which on a 3px meter leaves
 * one pixel of fill. `id` keeps the kit's damage ghost.
 */
function meter(ctx, x, y, w, h, p, o = {}) {
  ctx.fillStyle = KEY;
  ctx.fillRect(x - Q, y - Q, w + 1, h + 1);
  UI.bar(ctx, x, y, w, h, p, { ...o, border: false });
}

/** A thin gilt rule that fades toward both ends. */
function giltRule(ctx, x, y, w, alpha = 1) {
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, 'rgba(122,84,24,0)');
  g.addColorStop(0.18, `rgba(184,134,46,${0.9 * alpha})`);
  g.addColorStop(0.5, `rgba(242,210,122,${alpha})`);
  g.addColorStop(0.82, `rgba(184,134,46,${0.9 * alpha})`);
  g.addColorStop(1, 'rgba(122,84,24,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, Q);
}

/** A cut gem centred on (cx, cy), `r` from centre to tip; a dark socket when spent. */
function gem(ctx, cx, cy, r, color, lit = true) {
  const rr = lit ? ramp(color, 5) : ['#0d0b10', '#1c1922', '#26222d', '#302b38', '#3a3444'];
  const rows = Math.round((r * 2) / Q);
  for (let i = 0; i <= rows; i++) {
    const dy = -r + i * Q;
    const hw = Math.max(Q, R((r - Math.abs(dy)) / Q) * Q);
    ctx.fillStyle = KEY;
    ctx.fillRect(cx - hw - Q, cy + dy - Q, hw * 2 + 1, 1);
  }
  for (let i = 1; i < rows; i++) {
    const dy = -r + i * Q;
    const hw = Math.max(Q, R((r - Math.abs(dy)) / Q) * Q - Q);
    // table lit, pavilion in shade: upper-left light
    ctx.fillStyle = dy < -r * 0.35 ? rr[3] : dy < 0 ? rr[2] : dy < r * 0.45 ? rr[1] : rr[0];
    ctx.fillRect(cx - hw, cy + dy, hw * 2, Q);
  }
  if (lit && r >= 1.5) { ctx.fillStyle = rr[4]; ctx.fillRect(cx - Q, cy - r * 0.5, Q, Q); }
}

/** A small gilt keycap with its key in the compact face. Returns its width. */
function keycap(ctx, x, y, k, o = {}) {
  const s = String(k).toUpperCase();
  const w = Math.max(4.5, UI.measure(s, 'xs') + 2);
  const h = 5;
  ctx.fillStyle = KEY; ctx.fillRect(x - Q, y - Q, w + 1, h + 1);
  UI.vgrad(ctx, x, y, w, h, o.dim ? '#6a5a40' : '#f0d890', o.dim ? '#3a3024' : '#b08a3a');
  ctx.fillStyle = o.dim ? '#7a6a50' : '#fff4cc'; ctx.fillRect(x, y, w, Q);
  UI.text(ctx, x + w / 2, y + 1.5, s, { size: 'xs', color: o.dim ? '#1a140c' : '#2a1c07', align: 'center', shadow: false });
  return w;
}

/**
 * A creature's face over a wash of its main colour: the painted bust where it
 * has one, else its own battle sprite drawn through the actor renderer (so a
 * bestiary monster comes out right) and framed on the eyes. `scale` 1 is one
 * sprite pixel per logical pixel on the fine grid.
 */
function bust(ctx, u, x, y, w, h, scale = 1) {
  const cw = (u && u.colorway) || null;
  const back = cw && cw.MAIN ? UI.shade(cw.MAIN, -0.6) : (u && u.side === 'party' ? '#1c2640' : '#301816');
  UI.vgrad(ctx, x, y, w, h, UI.shade(back, 0.2), UI.shade(back, -0.35));
  if(drawCreaturePortrait(ctx,u,x,y,w,h))return;
  // A person has a painted bust (render/portrait.js), cropped round the eyes
  // when the box is small; a creature has none and shows its sprite's head.
  if (u && safe(() => drawPortrait(ctx, u, x, y, w, { h }), false)) return;
  const own = u && u.sprite && !u.layered && safe(() => hasSprite(u.sprite), false) ? spriteSize(u.sprite) : null;
  const sh = own ? own.h : 24;
  // The eyes sit about a third of the way down every body plan we draw.
  const eye = sh * 0.34;
  const top = clamp(eye - h / scale / 2, 0, Math.max(0, sh - h / scale));
  let drew = false;
  UI.pushClip(ctx, x, y, w, h);
  ctx.imageSmoothingEnabled = false;
  try {
    drew = drawActor(ctx, u, R((x + w / 2) * 2) / 2, R((y + (sh - top) * scale) * 2) / 2, { dir: 'down', scale, shadow: false }) !== false;
  } catch (e) { drew = false; }
  UI.popClip(ctx);
  if (!drew) safe(() => UI.portrait(ctx, u, x - 1, y - 1, Math.max(w, h) + 2, { shadow: 0 }));
}

/**
 * An initiative token: the face in a frame of its side's tincture. The acting
 * creature's frame is gilt. { dim, current, lift }
 */
function token(ctx, u, x, y, s, o = {}) {
  const tin = TINCTURE[u && u.side === 'party' ? 'party' : 'foe'];
  ctx.fillStyle = KEY;
  ctx.fillRect(x - Q, y - Q, s + 1, s + 1);
  ctx.fillStyle = o.current ? GILT.mid : tin.base;
  ctx.fillRect(x, y, s, s);
  hairFrame(ctx, x, y, s, s, o.current ? GILT.spec : tin.hi, o.current ? GILT.lo : tin.lo);
  ctx.fillStyle = KEY;
  ctx.fillRect(x + 1, y + 1, s - 2, s - 2);
  bust(ctx, u, x + 1.5, y + 1.5, s - 3, s - 3, o.scale || 1);
  if (o.dim) { ctx.fillStyle = 'rgba(10,6,12,0.58)'; ctx.fillRect(x + 1.5, y + 1.5, s - 3, s - 3); }
  if (o.down) { ctx.fillStyle = 'rgba(140,16,12,0.35)'; ctx.fillRect(x + 1.5, y + 1.5, s - 3, s - 3); }
}

/** Five fine HP pips: who is hurt, at a glance, without a number. */
function hpPips(ctx, x, y, w, u) {
  const n = 5;
  const pw = (w - (n - 1) * Q) / n;
  const p = hpPct(u);
  const on = u.side === 'party' ? '#6fc36a' : INK.hp;
  const hot = u.side === 'party' ? '#b4ec9a' : INK.hpHi;
  const lit = isDead(u) ? 0 : Math.ceil(p * n - 1e-6);
  for (let i = 0; i < n; i++) {
    const px = x + i * (pw + Q);
    ctx.fillStyle = KEY; ctx.fillRect(px - Q, y - Q, pw + 1, 2);
    ctx.fillStyle = i < lit ? (p <= 0.25 ? '#e8b23a' : on) : 'rgba(255,255,255,0.1)';
    ctx.fillRect(px, y, pw, 1);
    if (i < lit) { ctx.fillStyle = hot; ctx.fillRect(px, y, pw, Q); }
  }
}

/** A row of slot gems for one spell level: remaining lit, spent dark. Returns the width used. */
function slotGems(ctx, x, y, lv, slot, o = {}) {
  const max = Math.min(o.cap || 4, slot.max || 0);
  const left = Math.max(0, (slot.max || 0) - (slot.used || 0));
  let cx = x;
  if (o.numeral !== false) {
    UI.text(ctx, cx, y - 1.5, ROMAN[lv] || String(lv), { size: 'xs', color: left ? '#c9b8f0' : UI.COLORS.disabled, shadow: false });
    cx += UI.measure(ROMAN[lv] || String(lv), 'xs') + 1.5;
  }
  const r = o.r || 1.5;
  for (let i = 0; i < max; i++) { gem(ctx, cx + r, y, r, '#9a7ae0', i < left); cx += r * 2 + 0.5; }
  if ((slot.max || 0) > max) {
    UI.text(ctx, cx, y - 1.5, `+${slot.max - max}`, { size: 'xs', color: UI.COLORS.inkDim, shadow: false });
    cx += UI.measure(`+${slot.max - max}`, 'xs') + 1;
  }
  return cx - x;
}

/** The short name a verb plate can carry; the detail keeps the full one. */
const VERB_LABELS = {
  'Attack': 'Attack', 'Cast a Spell': 'Spells', 'Class Action': 'Class', 'Use an Item': 'Items',
  'Move': 'Move', 'Undo Move': 'Undo', 'Tactics': 'Tactics', 'Retreat': 'Flee', 'Reactions': 'React',
  'Opportunity Attack': 'React', 'Bonus Actions': 'Bonus', 'Main Hand': 'Strike', 'Second Wind': 'Wind',
  'Disengage': 'Evade', 'Cantrips': 'Cantrip',
};
function verbLabel(r, w) {
  const raw = String(r.name || r.label || '');
  const want = VERB_LABELS[raw] || raw.replace(/:.*$/, '');
  if (UI.measure(want, 'xs') <= w) return want;
  const first = want.split(/[\s-]/)[0];
  if (UI.measure(first, 'xs') <= w) return first;
  return UI.fit(first, w, 'xs');
}

// ===========================================================================
// 2. THE SCENE
// ===========================================================================

export class BattleScene {
  /**
   * @param {import('../rules/combat.js').Encounter} encounter  a built Encounter
   * @param {object} opts  { onEnd(result), music, fromMapId }
   */
  constructor(encounter, opts = {}) {
    this.id = 'battle';
    this.opaque = true;
    this.pausesBelow = true;

    this.enc = encounter || null;
    this.opts = opts || {};
    this.t = 0;

    // --- presentation ------------------------------------------------------
    // A 22x15 arena is 352x240px; the field is 400x214. At 1x you see the whole
    // battlefield and can actually read the tactical picture, which is the point
    // of a grid game. 'close' keeps the old 2x for anyone who prefers the sprites
    // big. Integer zooms only — pixel art at 1.5x looks like a mistake.
    this.zoom = safe(() => (Save.settings.battleZoom === 'close' ? 2 : 1), 1);
    this.cam = { x: 0, y: 0 };
    this.camTo = { x: 0, y: 0 };
    // Drag-to-pan. The camera normally chases whoever is acting, but the action
    // bar and the log sit over the field, and a creature can end its move
    // underneath one of them where it cannot be clicked. Dragging the
    // battlefield breaks the follow until the next turn (or middle-click /
    // double-tap to recentre), which is the cheapest way to reach anything.
    this.drag = { on: false, blocked: false, moved: 0, x: 0, y: 0 };
    this.camManual = false;
    this.ui = new Map();              // uid -> render state { x, y, dir, phase, ... }

    // --- interaction -------------------------------------------------------
    this.phase = 'intro';             // intro|menu|move|target|anim|enemy|over
    this.menuPath = [];               // [] at the root, [groupId] inside a submenu
    this.menuIndex = 0;
    this.menuTop = 0;
    this.subIndex = 0;
    this.subTop = 0;
    this.options = [];                // cached availableActions(current)
    this.menuDirty = true;
    this.cursor = { x: 0, y: 0 };
    this.pending = null;              // the option being targeted
    this.slotLevel = null;            // chosen slot level while targeting a spell
    this.targetIndex = 0;
    this.targets = { units: [], tiles: [] };
    this.reach = new Map();           // reachableTiles for the current unit
    this.provoke = new Set();         // reachable tiles whose path provokes an OA
    this.threat = new Set();          // every tile some hostile can reach you on
    this.areaCells = [];
    this.areaVictims = [];

    // --- overlays ----------------------------------------------------------
    this.showLog = false;
    this.logScroll = 0;
    this.inspect = null;              // unit being inspected
    this.inspectPinned = false;
    this.inspectHover = false;
    this.banner = null;               // { text, sub, color, t, dur }
    this.dice = null;                 // { roll, t, dur }
    this.rollLines = null;            // { lines, color, t, dur }
    this.prompt = null;               // reaction prompt
    this.results = null;              // victory / defeat panel state
    this._leaving = false;            // one-way latch: the results panel is closing
    this.hint = '';

    // --- sequencing --------------------------------------------------------
    this.beats = [];
    this.ff = false;                  // fast-forward held
    this.speed = 1;
    this.autoEnd = true;

    // --- reactions ---------------------------------------------------------
    this.stance = new Map();          // offer.kind -> 'ask' | 'yes' | 'no'
    this._promptedKinds = new Set();

    // --- enemy plan playback ------------------------------------------------
    this._enemyPlans = null;
    this._planIndex = 0;

    // --- boss --------------------------------------------------------------
    this.boss = null;
    this.bossPhase = 0;
  }

  // =========================================================================
  // 2.1 LIFECYCLE
  // =========================================================================

  enter(prev) {
    const enc = this.enc;
    this.t = 0;
    this.autoEnd = Save?.settings?.autoEndTurn !== false;
    FX.clear();

    if (!enc) { this._bail('There is no one here to fight.'); return; }

    // Hand the engine our reaction desk before anything can be rolled.
    enc._onReaction = (reactor, offer) => this._reactionAnswer(reactor, offer);

    if (enc.state === 'setup') safe(() => enc.start());
    if(enc.state==='blocked'){this._bail(enc.setupError);return;}

    // Render state for everyone on the field.
    for (const u of enc.units || []) this._uiOf(u, true);

    this.boss = this._findBoss();
    this.bossPhase = this.boss ? this._phaseOf(this.boss) : 0;

    const focus = enc.current || (enc.units || [])[0];
    if (focus) {
      const f = feetOf(focus);
      this.cam.x = f.x; this.cam.y = f.y - TILE / 2;
      this.camTo.x = this.cam.x; this.camTo.y = this.cam.y;
      this.cursor = { ...posOf(focus) };
    }

    // The same cue the overworld asked for, so a dragon's theme is kept, not replaced.
    safe(() => { const cue = battleCue(enc); Audio.music(cue.context, { intensity: cue.intensity }); });
    sfx('encounter');

    // Opening beats: the boss card, then "roll for initiative", then turn one.
    this.phase = 'anim';
    if (this.boss) {
      const def = this._monsterDef(this.boss);
      this.beats.push({
        k: 'banner', dur: 2.2, color: UI.COLORS.red,
        text: this.boss.name || 'A terrible foe',
        sub: def?.intro || def?.quote || def?.desc || 'The field goes quiet.',
        big: true, sfx: 'roar',
      });
    }
    // Surprise cuts both ways now: the party can catch a pack unawares.
    const partyAmbush = enc.ambush === 'party';
    const foeAmbush = enc.ambush && !partyAmbush;
    this.beats.push({
      k: 'banner', dur: 1.0, color: partyAmbush ? UI.COLORS.green : UI.COLORS.gold,
      text: foeAmbush ? 'Ambush!' : partyAmbush ? 'Surprise Attack!' : 'Roll for Initiative',
      sub: foeAmbush ? 'They were waiting for you.'
        : partyAmbush ? 'You caught them unawares.' : `Round ${enc.round || 1}`,
      sfx: 'dice',
    });
    this.beats.push({ k: 'fn', fn: () => this._openTurn() });

    // The arena inherits the sky it was rolled under.
    const m = enc.map || {};
    if (m.weather && m.weather !== 'none') safe(() => FX.weather(m.weather, m.weather === 'fog' ? 0.45 : 0.6));
    this.dark = clamp(Number(m.dark) || 0, 0, 1);
  }

  exit() {
    FX.clear();
    if (this.enc) this.enc._onReaction = null;
  }

  /** Something is badly wrong with the encounter — leave without breaking the game. */
  _bail(why) {
    safe(() => bus.emit(EV.TOAST, { text: why }));
    this.phase = 'over';
    this.beats.length = 0;
    if (Game.top === this) Game.pop();
  }

  // =========================================================================
  // 2.2 RENDER STATE PER UNIT
  // =========================================================================

  _uiOf(u, create = false) {
    if (!u || !u.uid) return null;
    let s = this.ui.get(u.uid);
    if (!s && (create || u.uid)) {
      const f = feetOf(u);
      s = {
        x: f.x, y: f.y, dir: u.side === 'foe' ? 'left' : 'right',
        phase: 0, moving: false, wp: [], alpha: 1, flash: 0,
        hp: u.hp || 0, bob: 0, deathDone: false, spawn: this.t,
        // Body animation. The sprites have no attack / hurt / cast frames — four
        // walk frames per facing is the whole set — so a blow is sold with the
        // body itself: a step back (anticipation), a lunge into the target, a
        // recoil out of the hit, a topple to the ground. All in screen pixels,
        // all decaying back to zero on their own.
        ox: 0, oy: 0,                 // current offset from the logical feet
        lunge: null,                  // { t, dur, dx, dy, back } lunge into a blow
        recoil: null,                 // { t, dur, dx, dy } shoved by a hit
        topple: 0,                    // 0 standing .. 1 flat on the ground
        cast: null,                   // { t, dur, color } channelling a spell
        flashColor: null,             // tint used while `flash` decays
        corpse: false,                // dead and lying where it fell
      };
      this.ui.set(u.uid, s);
    }
    return s;
  }

  _updateUnits(dt) {
    const enc = this.enc;
    if (!enc) return;
    for (const u of enc.units || []) {
      const s = this._uiOf(u, true);
      if (!s) continue;

      // Walk toward the next waypoint, or snap-chase the logical tile.
      const target = s.wp.length ? s.wp[0] : feetOf(u);
      const dx = target.x - s.x, dy = target.y - s.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.5) {
        const step = Math.min(d, WALK_PX * dt);
        s.x += (dx / d) * step;
        s.y += (dy / d) * step;
        s.moving = true;
        s.phase += dt * 8;
        if (Math.abs(dx) > Math.abs(dy)) s.dir = dx > 0 ? 'right' : 'left';
        else if (Math.abs(dy) > 0.6) s.dir = dy > 0 ? 'down' : 'up';
      } else {
        s.x = target.x; s.y = target.y;
        if (s.wp.length) { s.wp.shift(); safe(() => Audio.sfx('step', { vol: 0.5 })); }
        else s.moving = false;
      }

      if (s.flash > 0) s.flash = Math.max(0, s.flash - dt * 3.2);

      // --- body animation -------------------------------------------------
      s.ox = 0; s.oy = 0;
      if (s.lunge) {
        const L = s.lunge;
        L.t += dt;
        const t = Math.min(1, L.t / L.dur);
        // Ease out on the way in, snap back on the way out: a blow commits
        // forward fast and the body settles after it lands.
        const k = t < 0.45 ? easeOut(t / 0.45) : 1 - easeIn((t - 0.45) / 0.55);
        const amp = L.back ? -k : k;
        s.ox += L.dx * amp; s.oy += L.dy * amp;
        if (t >= 1) s.lunge = null;
      }
      if (s.recoil) {
        const Rc = s.recoil;
        Rc.t += dt;
        const t = Math.min(1, Rc.t / Rc.dur);
        const k = (1 - t) * (1 - t);
        s.ox += Rc.dx * k; s.oy += Rc.dy * k;
        if (t >= 1) s.recoil = null;
      }
      if (s.cast) {
        s.cast.t += dt;
        if (s.cast.t >= s.cast.dur) s.cast = null;
        else s.oy -= Math.round(Math.sin(s.cast.t * 9) * 0.5 + 0.5);   // a small rising bob
      }
      if (s.swing) {
        const W = s.swing;
        W.t += dt;
        const t = Math.min(1, W.t / W.dur);
        // Cock back over the first third, then whip through: the fast part of
        // the arc is where the blow lands.
        s.swingAngle = t < 0.34
          ? easeOut(t / 0.34) * W.from
          : W.from + (W.to - W.from) * easeIn((t - 0.34) / 0.66);
        if (t >= 1) { s.swing = null; s.swingAngle = 0; }
      } else if (s.swingAngle) {
        s.swingAngle = 0;
      }
      // Topple: a body at 0 hp is on the ground; the swing there takes 0.35s
      // with one small bounce so it reads as a fall, not a rotation.
      const wantsFlat = u.hp <= 0;
      if (wantsFlat && s.topple < 1) s.topple = Math.min(1, s.topple + dt * 2.8);
      else if (!wantsFlat && s.topple > 0) s.topple = Math.max(0, s.topple - dt * 3.5);

      // Death: the body drops where it stood and stays there. A field littered
      // with the fallen is the story of the fight told for free; a corpse that
      // fades to nothing in a second was telling you nothing at all.
      if (isDead(u)) {
        if (!s.deathDone) {
          s.deathDone = true;
          const p = this._fxAt(u);
          FX.burst(p.x, p.y - 8 * this.zoom, u.side === 'foe' ? '#8a2c1e' : '#5a4a7a', 14, { shape: 'smoke', speed: 40, life: 0.7 });
          FX.burst(p.x, p.y - 2, '#3a2a2a', 6, { shape: 'square', speed: 30, life: 0.5, gravity: 60 });
          sfx('death');
          s.corpse = true;
        }
        s.alpha = Math.max(0.42, s.alpha - dt * 1.4);
      } else if (s.alpha < 1) {
        s.alpha = Math.min(1, s.alpha + dt * 2);
      }
    }
  }

  // --- body animation kicks ------------------------------------------------

  /** Direction (unit vector, screen space) from unit `a` toward unit `b`. */
  _toward(a, b) {
    const pa = posOf(a), pb = posOf(b);
    const dx = pb.x - pa.x, dy = pb.y - pa.y;
    const d = Math.hypot(dx, dy) || 1;
    return { x: dx / d, y: dy / d };
  }

  /** Lunge `dist` px toward `target` (or away, with back:true) over `dur` s. */
  _animLunge(unit, target, dist = 6, dur = 0.26, back = false) {
    const s = this._uiOf(unit, true);
    if (!s || !target) return;
    const v = this._toward(unit, target);
    s.lunge = { t: 0, dur, dx: v.x * dist * this.zoom, dy: v.y * dist * this.zoom * 0.7, back };
  }

  /**
   * Swing the weapon through an arc. `from`/`to` are radians; the blade is
   * cocked back first and comes through fast, which is the shape of a real
   * cut and reads correctly even at 16 pixels.
   */
  _animSwing(unit, dur = 0.3, from = -1.15, to = 1.35) {
    const s = this._uiOf(unit, true);
    if (!s) return;
    s.swing = { t: 0, dur, from, to };
  }

  /** Shove the struck unit `dist` px away from `from`; heavier hits go further. */
  _animRecoil(unit, from, dist = 3, dur = 0.22) {
    const s = this._uiOf(unit, true);
    if (!s) return;
    const v = from ? this._toward(from, unit) : { x: 0, y: -1 };
    s.recoil = { t: 0, dur, dx: v.x * dist * this.zoom, dy: v.y * dist * this.zoom * 0.7 };
  }

  /** Channel: the caster bobs and glows in the spell's colour while it builds. */
  _animCast(unit, color, dur = 0.42) {
    const s = this._uiOf(unit, true);
    if (!s) return;
    s.cast = { t: 0, dur, color: color || UI.COLORS.purple };
  }

  /**
   * Hit-stop: the whole battlefield holds for a few frames on a heavy blow.
   * It is the cheapest trick in the action-game book and it works because the
   * eye reads a pause as weight. Beats, sprites and effects all wait on it.
   */
  _hitstop(sec) {
    if (Save?.settings?.screenShake === false) return;
    this.hitstop = Math.max(this.hitstop || 0, sec);
  }

  // =========================================================================
  // 2.3 CAMERA
  // =========================================================================

  /** The screen point the camera parks its focus on. */
  _focusPoint() {
    // Keep the projection anchored while menus, targeting and animations change.
    // Moving this point bypassed camera easing and jumped the whole battlefield.
    return { x: FIELD.x + FIELD.w * 0.60, y: FIELD.y + FIELD.h * 0.34 };
  }

  _focusOn(wx, wy, snap = false) {
    this.camTo.x = wx; this.camTo.y = wy;
    if (snap) { this.cam.x = wx; this.cam.y = wy; }
  }

  _focusUnit(u, snap = false) {
    if (!u) return;
    // A player who has dragged the view keeps it until the turn changes; the
    // camera snapping back mid-decision is exactly what made panning useless.
    if (this.camManual && !snap) return;
    const s = this._uiOf(u, true) || feetOf(u);
    const height=u.monsterId ? monsterSpriteSize(u.monsterId).h : TILE;
    this._focusOn(s.x, s.y - Math.max(TILE/2,height/2), snap);
  }

  /**
   * Pointer drag pans the camera. Returns true while a real drag is in progress
   * so the caller can swallow the click that ends it — otherwise letting go
   * over a tile would also select that tile.
   */
  _updateDrag() {
    const m = Input.mouse;
    const d = this.drag;
    if (!m.over) { d.on = false; d.blocked = false; d.clicked = false; return false; }

    if (!m.down) {
      const wasDrag = d.on && d.moved > 3;
      // A battlefield press might become a pan. Commit its click only on
      // release, so starting a drag cannot cast a spell or walk the character.
      if (d.on && d.clicked && !wasDrag && d.phase === this.phase && this._mouseOnField()) m.clicked = true;
      d.on = false; d.blocked = false;
      d.clicked = false;
      return wasDrag;                       // swallow the release click
    }
    if (d.blocked) return false;

    if (m.down && !d.on) {
      // Only start a drag on the field; a press inside a panel belongs to it.
      // Keep that ownership until release, even if the pointer crosses the field.
      if (!this._mouseOnField() || this.prompt || this.showLog || this.results) { d.blocked = true; return false; }
      d.on = true; d.moved = 0; d.x = m.x; d.y = m.y;
      d.clicked = m.clicked; d.phase = this.phase; m.clicked = false;
      return false;
    }
    const dx = m.x - d.x, dy = m.y - d.y;
    d.x = m.x; d.y = m.y;
    d.moved += Math.abs(dx) + Math.abs(dy);
    if (d.moved <= 3) return false;         // a shaky click is not a drag

    // Screen pixels -> world pixels. Move the camera opposite the pointer so the
    // field follows the hand.
    this.camTo.x -= dx / this.zoom;
    this.camTo.y -= dy / this.zoom;
    this.cam.x -= dx / this.zoom;
    this.cam.y -= dy / this.zoom;
    this.camManual = true;
    this._clampCam();
    return true;
  }

  /** True when the pointer is over one of the floating combat panels. */
  _mouseOverAnyPanel() {
    const m = Input.mouse;
    const inRect = (r) => r && m.x >= r.x && m.x <= r.x + r.w && m.y >= r.y && m.y <= r.y + r.h;
    return m.y >= BAND_Y || m.y < TOP_H || inRect(this._detailR) || inRect(this._statR);
  }

  /** Give the camera back to whoever is acting. */
  /**
   * Change the zoom, keeping the world point under (px,py) — or the camera
   * focus when no pointer is given — where it is on screen.
   */
  _setZoom(z, px, py) {
    if (z === this.zoom) return;
    const o = this._origin();
    // World point under the pointer at the old zoom.
    const wx = px != null ? (px - o.x) / this.zoom : this.cam.x;
    const wy = py != null ? (py - o.y) / this.zoom : this.cam.y;
    this.zoom = z;
    // Keep that world point under the pointer: it becomes the camera's focus,
    // offset by the pointer's distance from the field centre at the new zoom.
    if (px != null) {
      const fc = this._focusPoint();
      this.cam.x = wx - (px - fc.x) / this.zoom;
      this.cam.y = wy - (py - fc.y) / this.zoom;
      this.camTo.x = this.cam.x; this.camTo.y = this.cam.y;
      this.camManual = true;
    }
    for (const s of this.ui.values()) { s.lunge = null; s.recoil = null; }
    this._clampCam();
  }

  _recenter() {
    this.camManual = false;
    const u = safe(() => this.enc.current, null);
    if (u) this._focusUnit(u);
  }

  _updateCam(dt) {
    if (this.inspect?._fled) { this.inspect = null; this.inspectPinned = false; }
    // Constrain the destination before easing. A turn can revoke manual slack;
    // clamping the current view afterwards teleported it back into the arena.
    this._clampCam(true);
    const k = Math.min(1, dt * 6.5);
    this.cam.x = lerp(this.cam.x, this.camTo.x, k);
    this.cam.y = lerp(this.cam.y, this.camTo.y, k);
  }

  _clampCam(targetOnly = false) {
    const enc = this.enc;
    const worldW = (enc?.w || 22) * TILE;
    const worldH = (enc?.h || 15) * TILE;
    const f = this._focusPoint();
    let minX = (f.x - FIELD.x) / this.zoom;
    let maxX = worldW - (FIELD.x + FIELD.w - f.x) / this.zoom;
    let minY = (f.y - FIELD.y) / this.zoom;
    let maxY = worldH - (FIELD.y + FIELD.h - f.y) / this.zoom;

    // While the player is panning by hand, let the field slide further than the
    // automatic camera ever would. A 22x15 arena fits the screen entirely, so
    // the normal clamp pins it dead centre — and a creature standing under the
    // action bar or the log could never be brought into the open, which is the
    // whole reason to offer panning. The slack is one panel's worth in each
    // direction, enough to slide anything out from under a panel and no more.
    if (this.camManual) {
      const slackX = (MENU.w + 24) / this.zoom;
      const slackY = (FIELD.h * 0.5) / this.zoom;
      minX -= slackX; maxX += slackX;
      minY -= slackY; maxY += slackY;
    }

    if (!targetOnly) {
      this.cam.x = minX <= maxX ? clamp(this.cam.x, minX, maxX) : (minX + maxX) / 2;
      this.cam.y = minY <= maxY ? clamp(this.cam.y, minY, maxY) : (minY + maxY) / 2;
    }
    this.camTo.x = minX <= maxX ? clamp(this.camTo.x, minX, maxX) : (minX + maxX) / 2;
    this.camTo.y = minY <= maxY ? clamp(this.camTo.y, minY, maxY) : (minY + maxY) / 2;
  }

  /**
   * Where world pixel (0,0) lands on screen, rounded to a whole device pixel.
   * Rounding here rather than per-sprite keeps the terrain, the grid and the
   * sprites locked to the same pixel lattice — no shimmer while the camera pans.
   */
  _origin() {
    const f = this._focusPoint();
    return { x: R(f.x - this.cam.x * this.zoom), y: R(f.y - this.cam.y * this.zoom) };
  }

  /** World pixels -> screen pixels. */
  _sx(wx) { return wx * this.zoom + this._origin().x; }
  _sy(wy) { return wy * this.zoom + this._origin().y; }

  /** Top-left of a tile in screen pixels. */
  _tileScreen(tx, ty) {
    const o = this._origin();
    return { x: R(tx * TILE * this.zoom + o.x), y: R(ty * TILE * this.zoom + o.y) };
  }

  /** Screen pixels -> tile coords (mouse picking). */
  _screenToTile(px, py) {
    const o = this._origin();
    const wx = (px - o.x) / this.zoom;
    const wy = (py - o.y) / this.zoom;
    return { x: Math.floor(wx / TILE), y: Math.floor(wy / TILE) };
  }

  /**
   * A unit's anchor for FX, in "zoomed world space": FX draws at 1x pixel size, so
   * effects stay crisp and correctly sized while still following the camera.
   */
  _fxAt(u, dy = -10) {
    const s = this._uiOf(u, true) || feetOf(u);
    if(dy===-10&&s.cast&&!u.monsterId){
      const frames=actorPoseFrames(u,'cast',s.dir),n=Math.min(frames.length-1,Math.floor(s.cast.t/s.cast.dur*frames.length));
      const hand=actorPosePoint(u,'cast',s.dir,n);
      if(hand)return{x:s.x*this.zoom+(s.ox||0)+hand.x*this.zoom,y:s.y*this.zoom+(s.oy||0)+hand.y*this.zoom};
    }
    return { x: (s.x) * this.zoom, y: (s.y + dy) * this.zoom };
  }

  _fxTile(tx, ty) {
    return { x: (tx * TILE + TILE / 2) * this.zoom, y: (ty * TILE + TILE / 2) * this.zoom, ground: 0 };
  }

  /** Body-height spell impacts, with a separate floor anchor for ground rings. */
  _spellAt(u) {
    const p = this._fxAt(u), s = this._uiOf(u, true) || feetOf(u);
    const floor = s.y * this.zoom + (s.oy || 0);
    if (u.monsterId) p.y = floor - this._unitBounds(u).source.h * 0.55;
    return { ...p, ground: floor - p.y };
  }

  // =========================================================================
  // 2.4 UPDATE
  // =========================================================================

  update(dt) {
    this.t += dt;
    const enc = this.enc;
    if (!enc) return;
    syncLayout();

    // Fast forward: hold Run to skip the pauses between steps.
    this.ff = Input.down('run');
    const setting = Number(Save?.settings?.battleSpeed) || 1;
    this.speed = clamp(setting * (this.ff ? 3.2 : 1), 0.25, 6);
    FX.speed = this.speed;

    let sdt = dt * this.speed;

    // Hit-stop: a heavy blow holds the whole field for a few frames. Sprites,
    // beats and effects all freeze; the camera and the input still run.
    if (this.hitstop > 0) {
      this.hitstop -= dt;
      FX.speed = 0.02;
      sdt = 0;
    }

    this._updateUnits(sdt);
    // A drag has to run before anything else reads the mouse, and it eats the
    // click that ends it so panning never doubles as a selection.
    this._dragging = this._updateDrag();
    if (this._dragging) Input.mouse.clicked = false;
    // The wheel zooms about the pointer. (M used to be eaten here as
    // "recentre" before _globalKeys could read it as "zoom", so the zoom key
    // was dead; recentring is the drag's own job now — double-tap / M-when-
    // dragged — and the wheel and M both zoom.)
    if (Input.mouse.wheel && this._mouseOnField()) {
      const dir = Input.mouse.wheel < 0 ? 1 : -1;
      const next = clamp(this.zoom + dir, 1, 2);
      if (next !== this.zoom) this._setZoom(next, Input.mouse.x, Input.mouse.y);
      Input.mouse.wheel = 0;
    }
    this._updateCam(dt);
    this._updateOverlayTimers(sdt);
    this._checkBossPhase();

    // Global toggles work in almost every phase.
    this._globalKeys();

    if (this.prompt) { this._updatePrompt(sdt); return; }
    if (this.showLog) { this._updateLog(); return; }
    if (this.results) { this._updateResults(); return; }

    if (this.beats.length) { this._updateBeats(sdt); return; }

    switch (this.phase) {
      case 'menu': this._updateMenu(dt); break;
      case 'move': this._updateMove(dt); break;
      case 'target': this._updateTarget(dt); break;
      case 'enemy': this._runEnemyTurn(); break;
      case 'anim':
        // The queue drained without a beat naming the next phase — recover.
        this.phase = this._isPlayerControlled(enc.current) ? 'menu' : 'enemy';
        this.menuDirty = true;
        break;
      default: break;
    }
  }

  _updateOverlayTimers(dt) {
    if (this.banner) { this.banner.t += dt; if (this.banner.t >= this.banner.dur) this.banner = null; }
    if (this.dice) { this.dice.t += dt; if (this.dice.t >= this.dice.dur) this.dice = null; }
    if (this.rollLines) { this.rollLines.t += dt; if (this.rollLines.t >= this.rollLines.dur) this.rollLines = null; }
  }

  _globalKeys() {
    const m = Input.mouse;
    this._logHover = m.over && m.x >= LOGTAIL.x && m.x < LOGTAIL.x + LOGTAIL.w
      && m.y >= LOGTAIL.y && m.y < LOGTAIL.y + LOGTAIL.h;
    if (!this.showLog && m.clicked && m.x >= LOGTAIL.x && m.x < LOGTAIL.x + LOGTAIL.w
      && m.y >= LOGTAIL.y && m.y < LOGTAIL.y + LOGTAIL.h) {
      m.clicked = false; this.showLog = true; this.logScroll = 0; sfx('open');
    }
    if (Input.pressed('journal')) {
      this.showLog = !this.showLog;
      this.logScroll = 0;
      sfx(this.showLog ? 'open' : 'close');
      Input.consume('journal');
    }
    if (Input.pressed('map')) {
      // M: zoom when the camera is where it belongs; recentre first if the
      // player has dragged it away, so the key always does the useful thing.
      if (this.camManual) this._recenter();
      else this._setZoom(this.zoom === 2 ? 1 : 2);
      sfx('cursor');
      Input.consume('map');
    }
    if (Input.pressed('party') && !this.results) {
      this.inspectPinned = !this.inspectPinned;
      if (!this.inspectPinned) this.inspect = null;
      else this.inspect = this.inspect || this.enc?.current || null;
      sfx('cursor');
      Input.consume('party');
    }
  }

  // =========================================================================
  // 2.5 TURN FLOW
  // =========================================================================

  /** Open whatever turn the encounter says is current. */
  _openTurn() {
    const enc = this.enc;
    if (!enc) return;
    if (this._checkOver()) return;

    if (enc.state !== 'active') { this._checkOver(); return; }

    // beginTurn() rolls death saves internally, so watch the log to make those
    // dice as visible as every other d20 in the fight.
    const logMark = (enc.log || []).length;
    // Preserve framing across turns; reveal the next actor only if its body
    // falls outside the usable field. M still explicitly recentres the view.
    const res = safe(() => enc.beginTurn(), null);
    this._pushDeathSaveBeats((enc.log || []).slice(logMark));
    this._drainReplays();                       // lair actions, routs, legendary
    this._syncAuras();
    this.undo = null;
    this.endConfirmAt = 0;
    if (this._checkOver()) return;

    const unit = enc.current;
    if (!unit) { this._checkOver(); return; }

    // beginTurn may have auto-skipped a stunned or dying creature.
    if (res && res.downed) { this.beats.push({ k: 'fn', fn: () => this._openTurn() }); return; }

    this.menuDirty = true;
    this.pending = null;
    this.slotLevel = null;
    this.menuPath = [];
    this.menuIndex = 0;
    this.menuTop = 0;
    this.hint = '';
    this._scanIndex = -1;         // Q/R field scan starts from the acting unit
    this.cursor = { ...posOf(unit) };
    this._revealUnit(unit);
    this._recomputeReach(unit);

    const mine = this._isPlayerControlled(unit);
    this.beats.push({
      k: 'banner', dur: mine ? 0.7 : 0.5,
      color: unit.side === 'foe' ? UI.COLORS.red : UI.COLORS.blue,
      text: unit.name || 'A combatant',
      sub: `Round ${enc.round} · ${mine ? 'your move' : 'acting'}`,
      kind: 'turn', round: enc.round, side: unit.side === 'party' ? 'party' : 'foe',
      note: mine ? 'your move' : unit.side === 'party' ? 'fights on instinct' : 'acting',
    });
    this.beats.push({
      k: 'fn',
      fn: () => {
        if (this._checkOver()) return;
        if (mine) { this.phase = 'menu'; this.menuDirty = true; }
        else { this.phase = 'enemy'; this._enemyPlans = null; }
      },
    });
    this.phase = 'anim';
  }

  /**
   * Turn a "makes a death saving throw: d20 [13] = 13 vs DC 10 — success" log line
   * back into an animated d20. The engine rolls these inside beginTurn(), so
   * reading them out of the log is the only way to put them on screen.
   */
  _pushDeathSaveBeats(lines) {
    const showRolls = Save?.settings?.showRolls !== false;
    for (const l of lines || []) {
      const text = l && l.text ? String(l.text) : '';
      if (!/death saving throw/i.test(text)) continue;
      const m = text.match(/d20\s*\[([\d/]+)\][^=]*=\s*(-?\d+)/);
      if (!m) continue;
      const faces = m[1].split('/').map((n) => parseInt(n, 10)).filter((n) => !Number.isNaN(n));
      const total = parseInt(m[2], 10);
      const ok = /success|natural 20|stabilis/i.test(text);
      const nat20 = /natural 20/i.test(text);
      const nat1 = /natural 1\b/i.test(text);
      const natural = nat20 ? 20 : nat1 ? 1 : (faces.length ? Math.max(...faces) : total);
      this.beats.push({
        k: 'dice', silent: !showRolls, dur: DICE_HOLD,
        roll: {
          natural, total, mod: total - natural, rolls: faces.length ? faces : [natural],
          crit: nat20, fumble: nat1, adv: faces.length > 1, dis: false,
          dc: 10, hit: ok,
          label: nat20 ? 'REVIVED' : ok ? 'SAVED' : 'FAILED',
          labelColor: nat20 ? UI.COLORS.goldBright : ok ? UI.COLORS.good : UI.COLORS.bad,
        },
      });
      this.beats.push({
        k: 'banner', dur: 0.7,
        color: ok ? UI.COLORS.good : UI.COLORS.red,
        text: 'Death Saving Throw',
        sub: UI.fit(text.replace(/^.*?: /, ''), 240, 'sm'),
      });
    }
  }

  _isPlayerControlled(u) {
    if (!u) return false;
    if (u.side !== 'party') return false;
    if (u.kind === 'monster') return false;                     // a summon runs itself
    if (Party.autoBattle && Party.autoBattle[u.uid]) return false;
    return true;
  }

  _endTurn(force = false) {
    const enc = this.enc;
    if (!enc) return;
    const unit = enc.current;
    // Ending a turn with the action still in hand is the commonest way to
    // throw a fight away by accident. Ask once; the second press within a
    // few seconds goes through. Auto-end (budget spent) never asks.
    if (!force && unit && this._isPlayerControlled(unit)) {
      const b = this._budget();
      const unspent = (b.action || 0) > 0 || (b.attacksLeft || 0) > 0;
      const armed = this.endConfirmAt && (this.t - this.endConfirmAt) < 3;
      if (unspent && !armed) {
        this.endConfirmAt = this.t;
        this.hint = 'Action unspent — End Turn again to confirm.';
        sfx('cursor');
        return;
      }
    }
    this.endConfirmAt = 0;
    this.undo = null;
    this.pending = null;
    this.areaCells = [];
    safe(() => enc.endTurn());
    this._drainReplays();
    if (this._checkOver()) return;
    this.beats.push({ k: 'fn', fn: () => this._openTurn() });
    this.phase = 'anim';
  }

  /** Did the fight just finish? Sets up the results panel if so. */
  _checkOver() {
    const enc = this.enc;
    if (!enc) return true;
    if (this.results) return true;
    if (!safe(() => enc.isOver(), false)) return false;

    this.beats.length = 0;
    this.phase = 'over';
    const r = safe(() => enc.result(), null) || { state: enc.state };
    if (r.victory) this._openVictory(r);
    else if (r.fled || r.state === 'fled') this._openEscape(r);
    else this._openDefeat(r);
    return true;
  }

  // =========================================================================
  // 2.6 THE ACTION MENU
  // =========================================================================

  _refreshOptions() {
    const enc = this.enc;
    const unit = enc?.current;
    this.options = unit ? (safe(() => enc.availableActions(unit), []) || []) : [];

    // The engine decides `enabled` from the action budget and the creature's
    // conditions; it never asks whether there is anything to point the action
    // AT. So "Attack" read as available, a single-weapon character dropped
    // straight into targeting, and the refusal only arrived two presses later.
    // Ask once, here, and let the row say so before it is chosen.
    if (unit) {
      const foes = (enc.units || []).filter((u) => u && !u._fled && !isDead(u) && u.side !== unit.side);
      let nearest = null, nearFt = 0;
      for (const f of foes) {
        const ft = safe(() => distanceFt(unit, f), 0) || 0;
        if (!nearest || ft < nearFt) { nearest = f; nearFt = ft; }
      }
      for (const o of this.options) {
        if (!o || !o.enabled) continue;
        const kind = lower(o.targeting && o.targeting.kind);
        // Only creature-targeted actions can run out of targets; a self buff,
        // a point-blank area or Dodge always has somewhere to go.
        if (kind !== 'creature') continue;
        if (o.targeting && o.targeting.allowAllies) continue;
        const n = safe(() => (enc.targetsFor(unit, o).units || []).length, 1);
        if (n > 0) continue;
        o.enabled = false;
        // 40px is six glyphs — "Bugbe… is 45ft away" named nobody. The plate
        // that shows this reason is 240px wide and the note strip is wider.
        o.reason = nearest
          ? `${UI.fit(nearest.name || 'Nearest foe', 108, 'sm')} is ${nearFt}ft away`
          : 'Nothing to aim at';
      }
    }

    this.menuDirty = false;
  }

  /** Group the engine's flat option list into the screen's short root menu. */
  _rootMenu() {
    const enc = this.enc;
    const unit = enc?.current;
    if (!unit) return [];
    if (this.menuDirty) this._refreshOptions();
    const all = this.options;
    const budget = this._budget();

    const pick = (fn) => all.filter(fn);
    const byId = (id) => all.find((o) => o.id === id);

    const group = (id, name, icon, list, emptyReason) => {
      const enabled = list.some((o) => o.enabled);
      const reason = enabled ? '' : (list.length ? (list.find((o) => o.reason)?.reason || 'Unavailable') : emptyReason);
      return {
        id: `@${id}`, name, icon, group: true, sub: list,
        enabled: enabled && list.length > 0,
        reason: list.length ? reason : emptyReason,
        desc: list.length ? `${list.length} option${list.length === 1 ? '' : 's'}.` : emptyReason,
      };
    };

    const rows = [];

    const attacks = pick((o) => o.kind === 'attack');
    if (attacks.length) rows.push(group('attack', 'Attack', 'sword', attacks, 'Nothing to attack with.'));

    const spells = pick((o) => o.kind === 'spell' || String(o.id).startsWith('spell:'));
    if (spells.length) {
      const g = group('cast', 'Cast a Spell', 'staff', spells, 'You know no spells.');
      // A level-17 wizard has thirty spells, and thirty plates on one bar is a
      // wall, not a menu. Past a dozen, break them by spell level — which is
      // also how a caster thinks about them: "what am I spending?"
      if (spells.length > 12) {
        const byLevel = new Map();
        for (const o of spells) {
          const lv = o.level || 0;
          if (!byLevel.has(lv)) byLevel.set(lv, []);
          byLevel.get(lv).push(o);
        }
        const tiers = [...byLevel.keys()].sort((a, b2) => a - b2).map((lv) => {
          const list = byLevel.get(lv);
          const on = list.some((o) => o.enabled);
          const slots = unit.spells?.slots?.[lv];
          const left = lv > 0 && slots ? Math.max(0, (slots.max || 0) - (slots.used || 0)) : null;
          return {
            id: `@cast:${lv}`, group: true, sub: list,
            name: lv === 0 ? 'Cantrips' : `${ordinal(lv)} Level`,
            icon: lv === 0 ? 'bolt' : 'staff',
            enabled: on,
            reason: on ? '' : (lv > 0 && left === 0 ? 'No slots of that level left' : 'None ready'),
            desc: `${list.length} spell${list.length === 1 ? '' : 's'}${left != null ? ` · ${left} slot${left === 1 ? '' : 's'} left` : ''}.`,
          };
        });
        g.sub = tiers;
        g.desc = `${spells.length} spells, by level.`;
      }
      rows.push(g);
    }

    const specials = pick((o) => String(o.id).startsWith('special:'));
    if (specials.length) rows.push(group('class', 'Class Action', 'star', specials, 'No class features ready.'));

    const items = pick((o) => o.kind === 'item');
    if (items.length) rows.push(group('item', 'Use an Item', 'potion', items, 'The pack is empty.'));

    // Move is not an engine option — it is the scene's own targeting mode.
    rows.push({
      id: '@move', name: 'Move', icon: 'foot', move: true,
      enabled: (budget.movement || 0) > 0 && this.reach.size > 0,
      reason: (budget.movement || 0) > 0 ? 'Nowhere to go.' : 'No movement left.',
      desc: `Walk up to ${budget.movement || 0} ft. Leaving a foe's reach provokes an Opportunity Attack.`,
    });

    // A free take-back of the last move, while nothing has been rolled since.
    if (this.undo && this.undo.uid === unit.uid && this.undo.round === enc.round) {
      rows.push({
        id: '@undo', name: 'Undo Move', icon: 'foot', undo: true, enabled: true,
        desc: 'Step back to where you stood before that move. Free, as long as nothing has happened since.',
      });
    }

    // Keep frequently used movement defenses on the root bar; group situational
    // tactics so the main buttons have room for readable names.
    for (const id of ['dash', 'dodge']) { const o = byId(id); if (o) rows.push(o); }
    const tactics = ['stand', 'escape', 'disengage', 'hide', 'help', 'shove', 'grapple', 'search', 'ready'].map(byId).filter(Boolean);
    if (tactics.length) rows.push(group('tactics', 'Tactics', 'shield', tactics, 'No tactics available.'));

    // Retreat is the scene's own verb; the engine resolves it as a group check.
    rows.push({
      id: '@flee', name: 'Retreat', icon: 'run', flee: true, enabled: (budget.action || 0) > 0,
      reason: 'No action left.',
      desc: 'A group Dexterity contest against the enemy. Fail and you lose your action.',
    });

    rows.push({
      id: '@reactions', name: 'Reactions', icon: 'shield', stance: true, enabled: true,
      desc: 'Set how this character answers reaction prompts for the rest of the fight.',
    });

    // End Turn has its own permanent plate to the right of this toolbar.
    return rows;
  }

  /**
   * The rows on screen. menuPath is a trail of group ids, so the spell menu
   * can nest one deeper (Cast a Spell -> 3rd Level -> Fireball) without any
   * of the navigation code needing to know how deep it went.
   */
  _currentRows() {
    if (!this.menuPath.length) return this._rootMenu();
    if (this.menuPath[0] === '@sub') return this.subRows || [];
    if (this.menuPath[0] === '@reactions') return this._stanceRows();
    let rows = this._rootMenu();
    for (const step of this.menuPath) {
      const g = rows.find((r) => r.id === step);
      if (!g || !g.sub) return rows;
      rows = g.sub;
    }
    return rows;
  }

  _stanceRows() {
    const kinds = [
      ['opportunity-attack', 'Opportunity Attack', 'Strike a foe that leaves your reach.'],
      ['shield', 'Shield', 'Cast Shield for +5 AC against the triggering attack.'],
      ['counterspell', 'Counterspell', 'Spend a slot to try to stop an enemy spell as it is cast.'],
      ['defensive', 'Defensive Reactions', 'Parry, Deflect Attacks, Uncanny Dodge and the like.'],
      ['other', 'Everything Else', 'Any other reaction the rules offer you.'],
    ];
    const who = this.enc?.current;
    return kinds.map(([id, name, desc]) => {
      const st = who ? this._stanceOf(who, id) : 'ask';
      return {
        id: `@stance:${id}`, name: `${name}: ${titleCase(st)}`, icon: 'shield',
        enabled: true, stanceKind: id,
        desc: `${desc}  ${who ? `${who.name}: ` : ''}${st === 'ask' ? 'ask me the first time' : st === 'yes' ? 'always use it' : 'never use it'}.`,
      };
    });
  }

  _budget() {
    const enc = this.enc;
    return (enc && enc.budget) || { action: 0, bonus: 0, reaction: 0, movement: 0, moveMax: 0 };
  }

  _updateMenu(dt) {
    const enc = this.enc;
    const unit = enc?.current;
    if (!unit) { this._checkOver(); return; }
    if (this.menuDirty) this._refreshOptions();

    const rows = this._currentRows();
    if (!rows.length) { this._endTurn(true); return; }
    const inSub = this.menuPath.length > 0;
    let idx = inSub ? this.subIndex : this.menuIndex;
    idx = clamp(idx, 0, rows.length - 1);
    this.hoverMove = null;
    this.hoverAttack = null;

    // --- keyboard ---------------------------------------------------------
    // The bar runs left-to-right, so left/right walk it. Up/down still work for
    // anyone with the old habit (and for the d-pad).
    let moved = 0;
    if (Input.repeat('right', 0.3, 0.08) || Input.repeat('down', 0.3, 0.08)) moved = 1;
    else if (Input.repeat('left', 0.3, 0.08) || Input.repeat('up', 0.3, 0.08)) moved = -1;
    if (moved) {
      idx = (idx + moved + rows.length) % rows.length;
      this.hint = '';
      sfx('cursor');
    }

    // --- mouse ------------------------------------------------------------
    const m = Input.mouse;
    const top = inSub ? this.subTop : this.menuTop;

    // End Turn: its own plate, always in the same place, one click.
    this.endHover = m.over && m.x >= ENDBTN.x && m.x <= ENDBTN.x + ENDBTN.w
      && m.y >= ENDBTN.y && m.y <= ENDBTN.y + ENDBTN.h;
    if (this.endHover) {
      this.hint = "End this creature's turn";
      if (m.clicked) { sfx('select'); this._endTurn(); return; }
    }

    const G = this._barGeom(rows, inSub, idx);
    const inR = (r) => r && m.x >= r.x && m.x < r.x + r.w && m.y >= r.y && m.y < r.y + r.h;
    const onBar = m.over && inR(G);
    if (onBar) {
      if (G.back && m.x < G.back.x + G.back.w + 1) {
        // The back chevron at the left of the bar leaves a submenu.
        if (m.clicked) this._menuBack();
      } else if (G.pager && m.x >= G.pager.x - 1) {
        // The paging gutter: its two halves step the window a page at a time.
        if (m.clicked) {
          const back = m.x < G.pager.x + G.pager.w / 2;
          const pageTop = clamp(top + (back ? -G.vis : G.vis), 0, Math.floor((rows.length - 1) / G.vis) * G.vis);
          idx = pageTop;
          if (inSub) this.subTop = pageTop; else this.menuTop = pageTop;
          if (inSub) this.subIndex = idx; else this.menuIndex = idx;
          sfx('cursor');
        }
      } else {
        const c = G.cells.find((q) => m.x >= q.x - 1 && m.x < q.x + q.w + 1);
        if (c) {
          const hovered = c.i;
          if ((m.moved || m.clicked) && hovered !== idx) { idx = hovered; sfx('cursor'); }
          if (m.clicked) {
            if (inSub) this.subIndex = idx; else this.menuIndex = idx;
            this._chooseRow(rows[idx]);
            return;
          }
        }
      }
    } else if (m.over && this._inRail(m.x, m.y)) {
      // The initiative rail: hover a token to read it, click to look at it.
      const u = this._railAt(m.x, m.y);
      this.inspectHover = !!u;
      if (u && !this.inspectPinned) this.inspect = u;
      if (u) this.hint = `${u.name}${enc.initiative?.[u.uid]?.total != null ? ` · initiative ${enc.initiative[u.uid].total}` : ''}`;
      if (m.clicked && u) { this.inspect = u; this.inspectPinned = true; this._revealUnit(u); sfx('select'); }
    } else if (this._mouseOnField()) {
      // The field itself is the menu for the two commonest verbs: point at a
      // square you can reach and click to walk there; point at an enemy your
      // weapon can reach and click to hit it. Everything else still inspects.
      const t = this._screenToTile(m.x, m.y);
      const u = this._unitAtPoint(m.x, m.y);
      const node = !u && !inSub ? this.reach.get(key(t.x, t.y)) : null;
      const canMove = node && (this._budget().movement || 0) > 0;
      const foe = u && u !== unit && u.side !== unit.side && !isDead(u) && !inSub ? u : null;
      const atk = foe ? this._quickAttackFor(unit, foe) : null;
      this.hoverMove = canMove ? { x: t.x, y: t.y, node } : null;
      this.hoverAttack = atk ? { unit: foe, option: atk } : null;
      this.inspectHover = !!u;
      if (u && !this.inspectPinned) this.inspect = u;
      if (canMove) this.hint = `Click to walk here — ${node.cost} ft${this.provoke.has(key(t.x, t.y)) ? ', provokes' : ''}`;
      else if (atk) this.hint = `Click: ${atk.name} on ${foe.name}`;
      if (m.clicked) {
        if (canMove) { this._commitMove(unit, node); return; }
        if (atk) {
          this.pending = atk;
          this.slotLevel = null;
          this.targets = safe(() => enc.targetsFor(unit, atk), { units: [], tiles: [] }) || { units: [], tiles: [] };
          this.targetIndex = Math.max(0, this.targets.units.findIndex((x) => x === foe || x.uid === foe.uid));
          this._commitOption({ unit: foe });
          return;
        }
        if (u) { this.inspect = u; this.inspectPinned = true; sfx('select'); }
        else { this.inspectPinned = false; this.inspect = null; }
      }
    } else if (!this.inspectPinned) {
      this.inspectHover = false;
    }

    if (inSub) this.subIndex = idx; else this.menuIndex = idx;

    // --- scan the field ---------------------------------------------------
    // The camera follows whoever is acting, and a 400px window at 2x zoom shows
    // about twelve tiles. Q and R walk the enemies so you can actually go and
    // look at what you are about to be told is out of range.
    if (Input.consume('next')) { this._scanFoes(1); return; }
    if (Input.consume('prev')) { this._scanFoes(-1); return; }

    // --- shortcuts --------------------------------------------------------
    if (!inSub) {
      // A group row is only built when it has entries, so a digit that pointed
      // at an absent group did nothing at all and read as a dead key — digit-3
      // with an empty pack was silent in every early fight. Say why instead;
      // these are the same lines the group row itself would have carried.
      const NO_GROUP = {
        '@attack': 'Nothing to attack with.',
        '@cast': 'You know no spells.',
        '@class': 'No class features ready.',
        '@item': 'The pack is empty.',
      };
      const jump = (gid) => {
        const r = this._rootMenu().findIndex((x) => x.id === gid);
        if (r >= 0) { this.menuIndex = r; this._chooseRow(this._rootMenu()[r]); return true; }
        sfx('error');
        this.hint = NO_GROUP[gid] || 'Not available.';
        return false;
      };
      if (Input.consume('tab1')) { jump('@attack'); return; }
      if (Input.consume('tab2')) { jump('@cast'); return; }
      if (Input.consume('tab3')) { jump('@item'); return; }
      if (Input.consume('tab4')) { jump('@move'); return; }
      if (Input.consume('tab5')) { this._endTurn(); return; }
      if (Input.consume('interact')) {
        // Hand this character to the AI for the rest of the fight.
        Party.autoBattle = Party.autoBattle || {};
        Party.autoBattle[unit.uid] = true;
        safe(() => bus.emit(EV.TOAST, { text: `${unit.name} will fight on instinct.` }));
        sfx('select');
        this.phase = 'enemy';
        this._enemyPlans = null;
        return;
      }
    }

    if (Input.consume('confirm')) { this._chooseRow(rows[idx]); return; }
    // Right-click is the universal "back" of every game with a mouse; Input has
    // been tracking it all along and nothing in the battle ever read it.
    if (Input.consume('cancel') || this._rightClick()) {
      if (inSub) this._menuBack();
      else { this.inspect = null; this.inspectPinned = false; sfx('back'); }
    }
  }

  /**
   * Up one level of the menu. The spell list nests (Cast -> 3rd Level ->
   * Fireball), so back has to pop one step rather than jumping to the root —
   * and it should land the cursor back on the group you came out of.
   */
  _menuBack() {
    const from = this.menuPath[this.menuPath.length - 1];
    this.menuPath = this.menuPath.slice(0, -1);
    const rows = this._currentRows();
    const i = rows.findIndex((r) => r.id === from);
    if (this.menuPath.length) { this.subIndex = Math.max(0, i); this.subTop = 0; }
    else if (i >= 0) { this.menuIndex = i; this.menuTop = 0; }
    else { this.subIndex = 0; this.subTop = 0; }
    sfx('back');
  }

  /** True once per frame if the pointer was right-clicked; consumes the flag. */
  _rightClick() {
    const m = Input.mouse;
    if (!m || !m.rightClicked) return false;
    m.rightClicked = false;
    return true;
  }

  /**
   * Step the camera to the next living enemy (or back to the acting unit), pin
   * their stat card, and say how far off they are. `dir` walks the list.
   */
  _scanFoes(dir) {
    const enc = this.enc;
    const cur = enc?.current;
    const foes = (enc?.units || []).filter((u) => u && !u._fled && !isDead(u) && u.side !== (cur?.side || 'party'));
    if (!foes.length) { sfx('error'); this.hint = 'Nothing left to look at.'; return; }

    // Nearest first, so the first press lands on whoever matters most.
    if (cur) foes.sort((a, b) => safe(() => distanceFt(cur, a), 0) - safe(() => distanceFt(cur, b), 0));

    const at = this._scanIndex == null ? -1 : this._scanIndex;
    let next = at + dir;
    if (next >= foes.length || next < -1) next = next >= foes.length ? -1 : foes.length - 1;
    this._scanIndex = next;

    if (next < 0) {
      // Back to the acting unit — always one press away, never a hunt.
      this.inspect = null;
      this.inspectPinned = false;
      if (cur) this._lookAt(cur);
      this.hint = '';
      sfx('cursor');
      return;
    }

    const u = foes[next];
    this.inspect = u;
    this.inspectPinned = true;
    this._lookAt(u);
    const ft = cur ? safe(() => distanceFt(cur, u), 0) : 0;
    this.hint = `${u.name} — ${ft}ft away, ${Math.max(0, u.hp)}/${safe(() => maxHpOf(u), u.maxHp || 1)} hp.`;
    sfx('cursor');
  }

  /** Pan the camera onto a unit without changing whose turn it is. */
  _lookAt(u) {
    if (!u) return;
    const f = feetOf(u);
    this.camTo.x = f.x;
    this.camTo.y = f.y - TILE / 2;
    this.cursor = { ...posOf(u) };
  }

  /** Portrait selection reveals an off-screen unit without recentering a
   * battlefield the player can already see. Explicit Q/R scanning still centres. */
  _revealUnit(u) {
    if (!u) return;
    this.cursor = { ...posOf(u) };
    // Measure at the bounded destination, not at an initial camera position
    // that the next update would clamp underneath the top HUD.
    this._clampCam(true);
    const r = this._unitBounds(u);
    r.x += (this.cam.x - this.camTo.x) * this.zoom;
    r.y += (this.cam.y - this.camTo.y) * this.zoom;
    const shift = (a, size, lo, hi) => size > hi - lo
      ? a + size / 2 - (lo + hi) / 2
      : a < lo ? a - lo : a + size > hi ? a + size - hi : 0;
    // Reveal the whole rendered body, including broad wings and tall heads.
    // A centre point could be visible while most of a large creature was cut off.
    const dx = shift(r.x, r.w, FIELD.x + 8, FIELD.x + FIELD.w - 8);
    const dy = shift(r.y, r.h, FIELD.y + 16 + (this.boss && !this.boss._fled && !isDead(this.boss) ? 12 : 0), FIELD.y + FIELD.h - 8);
    this.camTo.x += dx / this.zoom;
    this.camTo.y += dy / this.zoom;
    if (dx || dy) this.camManual = true;
    this._clampCam(true);
  }

  _revealPoint(wx, wy) {
    const x = this._sx(wx), y = this._sy(wy);
    const left = FIELD.x + 16, right = FIELD.x + FIELD.w - 16;
    const top = FIELD.y + 24, bottom = FIELD.y + FIELD.h - 24;
    const dx = x - clamp(x, left, right), dy = y - clamp(y, top, bottom);
    // Stop a previous portrait's pending pan when the new selection is visible.
    this.camTo.x = this.cam.x + dx / this.zoom;
    this.camTo.y = this.cam.y + dy / this.zoom;
    if (dx || dy) this.camManual = true;
    this._clampCam();
  }

  _chooseRow(row) {
    if (!row) return;
    this._scanIndex = -1;
    const enc = this.enc;
    const unit = enc?.current;
    if (!unit) return;

    if (!row.enabled) { sfx('error'); this.hint = row.reason || 'Not available.'; return; }

    if (row.stance) { this.menuPath = ['@reactions']; this.subIndex = 0; this.subTop = 0; sfx('select'); return; }
    if (row.stanceKind) {
      // Set it for THIS creature: a party-wide answer bound characters who
      // could not even take the reaction being answered for.
      const cur = this._stanceOf(unit, row.stanceKind);
      const next = cur === 'ask' ? 'yes' : cur === 'yes' ? 'no' : 'ask';
      const k = `${unit.uid}|${row.stanceKind}`;
      if (next === 'ask') this.stance.delete(k); else this.stance.set(k, next);
      sfx('select');
      return;
    }
    if (row.group) {
      if (row.sub.length === 1 && row.sub[0].enabled && !row.sub[0].group) { this._beginOption(row.sub[0]); return; }
      this.menuPath = [...this.menuPath, row.id];
      this.subIndex = Math.max(0, row.sub.findIndex((o) => o.enabled));
      this.subTop = 0;
      sfx('select');
      return;
    }
    if (row.move) { this._beginMove(); return; }
    if (row.flee) { this._doFlee(); return; }
    if (row.undo) { this._undoMove(); return; }
    if (row.id === 'end') { sfx('select'); this._endTurn(); return; }

    // Verbs with a mode the engine reads from `extra` get a two-row submenu
    // rather than a silent default: a shove that always knocks prone is half
    // a shove, and a Ready with no trigger is a bet the player never placed.
    if (row.id === 'shove' && !row.extra) {
      this.subRows = [
        { ...row, name: 'Shove: Push 5 ft', extra: { mode: 'push' }, desc: 'Athletics contest. Push the creature 5 feet away from you.' },
        { ...row, name: 'Shove: Knock Prone', extra: { mode: 'prone' }, desc: 'Athletics contest. Knock the creature Prone: melee hits on it have advantage.' },
      ];
      this.menuPath = ['@sub']; this.subIndex = 0; this.subTop = 0; sfx('select');
      return;
    }
    if (row.id === 'ready' && !row.extra) {
      this.subRows = [
        { ...row, name: 'Ready: when a foe approaches', extra: { trigger: 'approach' }, desc: 'Strike the first enemy that comes within your reach, using your Reaction.' },
        { ...row, name: 'Ready: when a foe attacks', extra: { trigger: 'attack' }, desc: 'Strike back the moment an enemy attacks or casts, using your Reaction.' },
      ];
      this.menuPath = ['@sub']; this.subIndex = 0; this.subTop = 0; sfx('select');
      return;
    }

    this._beginOption(row);
  }

  /** Put the acting creature back where it stood before its last move. */
  _undoMove() {
    const enc = this.enc;
    const unit = enc?.current;
    const u = this.undo;
    if (!enc || !unit || !u || u.uid !== unit.uid || u.round !== enc.round) { sfx('error'); return; }
    unit.pos = { ...u.pos };
    const b = enc.budget;
    if (b) { b.movement = u.movement; b.moveUsed = u.moveUsed; }
    const s = this._uiOf(unit, true);
    if (s) { const f = feetOf(unit); s.x = f.x; s.y = f.y; s.wp = []; s.moving = false; }
    this.undo = null;
    this.menuDirty = true;
    this._recomputeReach(unit);
    this.cursor = { ...posOf(unit) };
    this._focusUnit(unit);
    this.hint = 'Back where you were.';
    sfx('back');
  }

  /**
   * The attack the acting creature would use on `foe` with one click: the
   * first enabled weapon attack that can reach them, action-cost first.
   */
  _quickAttackFor(unit, foe) {
    const enc = this.enc;
    if (!unit || !foe || !enc) return null;
    if (this.menuDirty) this._refreshOptions();
    const cands = this.options.filter((o) => o && o.enabled && o.kind === 'attack');
    cands.sort((a, b) => (a.cost === 'action' ? 0 : 1) - (b.cost === 'action' ? 0 : 1));
    for (const o of cands) {
      const t = safe(() => enc.targetsFor(unit, o), null);
      if (t && (t.units || []).some((x) => x === foe || x.uid === foe.uid)) return o;
    }
    return null;
  }

  // =========================================================================
  // 2.7 MOVEMENT
  // =========================================================================

  _recomputeReach(unit) {
    const enc = this.enc;
    this.reach = new Map();
    this.provoke = new Set();
    this.threat = new Set();
    if (!enc || !unit) return;
    this.reach = safe(() => enc.reachableTiles(unit), new Map()) || new Map();

    // Which squares are threatened by which hostile — a move provokes when the path
    // steps OUT of a square a hostile threatens (2024 PHB Opportunity Attacks).
    const threats = [];
    for (const f of enc.units || []) {
      if (!f || f === unit || isDead(f) || f.hp <= 0 || f._fled) continue;
      if (f.side === unit.side) continue;

      const set = new Set();
      for (const t of safe(() => enc.threatTiles(f), []) || []) set.add(key(t.x, t.y));

      // Two different questions, two different filters. "Where can something
      // reach me" is about next turn and does not care about reactions, so the
      // red keyline counts every living enemy. "Will running from here draw an
      // opportunity attack" needs an unspent reaction, so only those go into
      // the provoke pass below.
      for (const k of set) this.threat.add(k);
      if (set.size && !f._reactionUsed) threats.push({ set, at: key(posOf(f).x, posOf(f).y) });
    }
    if (!threats.length) return;

    const start = posOf(unit);
    for (const [k, node] of this.reach) {
      const path = [{ x: start.x, y: start.y }, ...(node.path || [])];
      let bad = false;
      for (let i = 0; i < path.length - 1 && !bad; i++) {
        const a = key(path[i].x, path[i].y), b = key(path[i + 1].x, path[i + 1].y);
        for (const th of threats) {
          if (th.set.has(a) && !th.set.has(b) && b !== th.at) { bad = true; break; }
        }
      }
      if (bad) this.provoke.add(k);
    }
  }

  _beginMove() {
    const unit = this.enc?.current;
    if (!unit) return;
    this._recomputeReach(unit);
    if (!this.reach.size) { sfx('error'); this.hint = 'There is nowhere to go.'; return; }
    this.phase = 'move';
    this.hint = '';
    this.cursor = { ...posOf(unit) };
    sfx('select');
  }

  _updateMove(dt) {
    const enc = this.enc;
    const unit = enc?.current;
    if (!unit) return;

    const before = key(this.cursor.x, this.cursor.y);
    this._moveCursor();
    if (key(this.cursor.x, this.cursor.y) !== before) {
      sfx('cursor');
      this._revealPoint(this.cursor.x * TILE + TILE / 2, this.cursor.y * TILE + TILE / 2);
    }

    const m = Input.mouse;
    const onField = this._mouseOnField();
    if (this._updateAimControls()) return;
    if (onField && (m.moved || m.clicked)) {
      const t = this._screenToTile(m.x, m.y);
      this.cursor = { x: t.x, y: t.y };
    }

    const node = this.reach.get(key(this.cursor.x, this.cursor.y));
    this.hint = node
      ? `${node.cost} ft${this.provoke.has(key(this.cursor.x, this.cursor.y)) ? ' — provokes!' : ''}`
      : 'Out of reach.';

    if (Input.consume('confirm') || (m.clicked && onField)) {
      if (!node) { sfx('error'); return; }
      this._commitMove(unit, node);
      return;
    }
    if (Input.consume('cancel') || this._rightClick()) { this.phase = 'menu'; this.hint = ''; sfx('back'); }
  }

  _commitMove(unit, node) {
    const enc = this.enc;
    const s = this._uiOf(unit, true);
    const path = (node.path || []).slice();
    sfx('select');

    // Remember where we stood, so a misclick is a free take-back — as long as
    // nothing was rolled on the way (no opportunity attack, no readied strike).
    const b0 = this._budget();
    const snap = { uid: unit.uid, round: enc.round, pos: { ...(unit.pos || {}) }, movement: b0.movement, moveUsed: b0.moveUsed };

    const res = safe(() => enc.moveUnit(unit, path), null) || { steps: [], provoked: [] };
    const replays = Array.isArray(enc.replays) ? enc.replays.length : 0;
    this.undo = (res.provoked || []).length || replays ? null : snap;
    this._drainReplays();

    // Walk the sprite across the squares the engine actually let it cross.
    if (s) {
      s.wp = (res.steps || []).map((p) => feetOf({...unit,pos:p}));
      if (!s.wp.length) s.wp = [];
    }

    this.phase = 'anim';
    this.beats.push({ k: 'walk', unit });
    this.beats.push({ k: 'camera', unit, dur: 0.1 });

    // Opportunity attacks that landed while it ran.
    for (const p of res.provoked || []) {
      const atk = enc.byUid ? enc.byUid(p.attacker) : null;
      this.beats.push({ k: 'banner', dur: 0.55, color: UI.COLORS.warn, text: 'Opportunity Attack', sub: atk?.name || '' });
      this._pushAttackBeats(atk, unit, p.result, null);
    }

    this.beats.push({
      k: 'fn',
      fn: () => {
        if (this._checkOver()) return;
        this.menuDirty = true;
        this._recomputeReach(unit);
        this.cursor = { ...posOf(unit) };
        this._focusUnit(unit);
        this.phase = this._isPlayerControlled(unit) ? 'menu' : 'enemy';
      },
    });
  }

  _moveCursor() {
    const enc = this.enc;
    let dx = 0, dy = 0;
    if (Input.repeat('left', 0.26, 0.07)) dx = -1;
    if (Input.repeat('right', 0.26, 0.07)) dx = 1;
    if (Input.repeat('up', 0.26, 0.07)) dy = -1;
    if (Input.repeat('down', 0.26, 0.07)) dy = 1;
    if (!dx && !dy) return;
    const nx = clamp(this.cursor.x + dx, 0, (enc?.w || 22) - 1);
    const ny = clamp(this.cursor.y + dy, 0, (enc?.h || 15) - 1);
    this.cursor = { x: nx, y: ny };
  }

  // =========================================================================
  // 2.8 TARGETING
  // =========================================================================

  _beginOption(option) {
    const enc = this.enc;
    const unit = enc?.current;
    if (!unit || !option) return;
    if (!option.enabled) { sfx('error'); this.hint = option.reason || 'Not available.'; return; }

    const t = option.targeting || { kind: 'self' };
    const kind = String(t.kind || 'self').toLowerCase();
    this.pending = option;
    this.slotLevel = Array.isArray(option.levels) && option.levels.length
      ? option.levels[0]
      : (option.level != null ? option.level : null);

    if (kind === 'self') {
      if (option.spellId && option.level > 0 && option.levels?.length > 1) {
        this.targets = { units: [unit], tiles: [] };
        this.targetIndex = 0; this.cursor = { ...posOf(unit) };
        this.phase = 'target'; sfx('select'); return;
      }
      this._commitOption(null); return;
    }

    this.targets = safe(() => enc.targetsFor(unit, option), { units: [], tiles: [] }) || { units: [], tiles: [] };
    const areaMode = !!t.shape || kind === 'point' || kind === 'area';

    if (areaMode) {
      const first = this.targets.units[0];
      this.cursor = first ? { ...posOf(first) } : { ...posOf(unit) };
    } else {
      if (!this.targets.units.length) {
        this.pending = null;
        sfx('error');
        this._explainNoTarget(unit, option);
        return;
      }
      this.targetIndex = 0;
      this.cursor = { ...posOf(this.targets.units[0]) };
    }
    this.phase = 'target';
    if (!areaMode && !this.camManual) this._revealUnit(this.targets.units[this.targetIndex]);
    this._recomputeArea();
    sfx('select');
  }

  /**
   * "No legal target in range." was true, useless, and — with the enemy off
   * camera — indistinguishable from the game being broken. Say which creature,
   * how far, how far the thing in your hand actually reaches, and then LOOK at
   * them, so the sentence and the screen agree.
   */
  _explainNoTarget(unit, option) {
    const enc = this.enc;
    const foes = (enc.units || []).filter((u) => u && !u._fled && !isDead(u) && u.side !== unit.side);
    if (!foes.length) { this.hint = 'Nothing left to aim at.'; return; }

    foes.sort((a, b) => safe(() => distanceFt(unit, a), 0) - safe(() => distanceFt(unit, b), 0));
    const near = foes[0];
    const ft = safe(() => distanceFt(unit, near), 0) || 0;
    // targeting.range is feet, or a [normal, long] band for a thrown/ranged weapon.
    const raw = option && option.targeting ? option.targeting.range : null;
    const reach = Array.isArray(raw) ? Number(raw[1] || raw[0]) || 0 : Number(raw) || 0;
    const name = near.name || 'the enemy';

    if (reach && ft > reach) {
      this.hint = `${name} is ${ft}ft away — ${option.name || 'that'} reaches ${reach}ft.`;
    } else {
      // In range but rejected: the engine's other refusal is line of sight.
      this.hint = `No clear line to ${name}, ${ft}ft away.`;
    }

    // Put the camera where the sentence is pointing.
    this.inspect = near;
    this.inspectPinned = true;
    this._lookAt(near);
  }

  _isAreaOption(option) {
    const t = option?.targeting || {};
    const kind = String(t.kind || '').toLowerCase();
    return !!t.shape || kind === 'point' || kind === 'area';
  }

  _recomputeArea() {
    const enc = this.enc;
    const unit = enc?.current;
    const o = this.pending;
    this.areaCells = [];
    this.areaVictims = [];
    if (!enc || !unit || !o || !this._isAreaOption(o)) return;
    const cells = safe(() => enc.areaPreview(unit, o, { x: this.cursor.x, y: this.cursor.y }), []) || [];
    this.areaCells = cells;
    const set = new Set(cells.map((c) => key(c.x, c.y)));
    for (const u of enc.units || []) {
      if (!u || u._fled || isDead(u)) continue;
      if (footprintTiles(u).some(p=>set.has(key(p.x,p.y)))) this.areaVictims.push(u);
    }
  }

  _updateTarget(dt) {
    const enc = this.enc;
    const unit = enc?.current;
    const o = this.pending;
    if (!enc || !unit || !o) { this.phase = 'menu'; return; }

    const area = this._isAreaOption(o);
    const m = Input.mouse;
    const onField = this._mouseOnField();
    if (this._updateAimControls()) return;
    let revealTarget = false;
    // A portrait can select a legal target even when a panel covers its tile.
    if (!area && m.clicked && this._inRail(m.x, m.y)) {
      const ru = this._railAt(m.x, m.y);
      const i = ru ? this.targets.units.findIndex(u => u.uid === ru.uid) : -1;
      if (i >= 0) { this.targetIndex = i; revealTarget = true; sfx('cursor'); }
      else { this.hint = 'That creature is not a legal target.'; sfx('error'); }
      m.clicked = false;
    }

    if (area) {
      const before = key(this.cursor.x, this.cursor.y);
      this._moveCursor();
      const keyboardMoved = key(this.cursor.x, this.cursor.y) !== before;
      if (onField && (m.moved || m.clicked)) {
        const t = this._screenToTile(m.x, m.y);
        this.cursor = { x: clamp(t.x, 0, enc.w - 1), y: clamp(t.y, 0, enc.h - 1) };
      }
      if (key(this.cursor.x, this.cursor.y) !== before) {
        sfx('cursor');
        this._recomputeArea();
        // Mouse aim already points at visible terrain. Panning here makes the
        // same pointer chase a moving tile; only keyboard aim needs revealing.
        if (keyboardMoved) this._revealPoint(this.cursor.x * TILE + TILE / 2, this.cursor.y * TILE + TILE / 2);
      }
    } else {
      const list = this.targets.units;
      let moved = 0;
      if (Input.repeat('right', 0.28, 0.1) || Input.repeat('down', 0.28, 0.1) || Input.pressed('next')) moved = 1;
      if (Input.repeat('left', 0.28, 0.1) || Input.repeat('up', 0.28, 0.1) || Input.pressed('prev')) moved = -1;
      if (moved && list.length) {
        this.targetIndex = (this.targetIndex + moved + list.length) % list.length;
        revealTarget = true;
        sfx('cursor');
      }
      if (onField && (m.moved || m.clicked)) {
        const hit = this._unitAtPoint(m.x, m.y);
        const i = hit ? list.findIndex((u) => u.uid === hit.uid) : -1;
        if (m.clicked && i < 0) {
          this.hint = 'Choose a highlighted creature or use Confirm.';
          m.clicked = false; sfx('error'); return;
        }
        if (i >= 0 && i !== this.targetIndex) { this.targetIndex = i; sfx('cursor'); }
      }
      const tgt = list[this.targetIndex];
      if (tgt) {
        this.cursor = { ...posOf(tgt) };
        this.inspect = tgt;
        if (revealTarget) this._revealUnit(tgt);
      }
    }

    // Slot upcasting, when the engine offered more than one level.
    if (Array.isArray(o.levels) && o.levels.length > 1) {
      if (Input.pressed('tab5')) {
        const i = o.levels.indexOf(this.slotLevel);
        this.slotLevel = o.levels[(i + 1) % o.levels.length];
        sfx('cursor');
      }
    }

    if (Input.consume('confirm') || (m.clicked && onField)) { this._confirmTarget(); return; }
    if (Input.consume('cancel') || this._rightClick()) {
      this.pending = null;
      this.areaCells = [];
      this.phase = 'menu';
      sfx('back');
    }
  }

  _confirmTarget() {
    const o = this.pending;
    if (!o) return;
    if (this._isAreaOption(o)) {
      this._commitOption({ x: this.cursor.x, y: this.cursor.y });
    } else {
      const tgt = this.targets.units[this.targetIndex];
      if (!tgt) { sfx('error'); return; }
      this._commitOption({ unit: tgt });
    }
  }

  _updateAimControls() {
    const m = Input.mouse;
    if (!m.clicked || !m.over) return false;
    const r = this._aimControls().find(r => m.x >= r.x && m.x < r.x + r.w && m.y >= r.y && m.y < r.y + r.h);
    if (!r) return false;
    m.clicked = false;
    if (r.id === 'back') { this.pending = null; this.areaCells = []; this.phase = 'menu'; this.hint = ''; sfx('back'); }
    if (r.id === 'next' && this.targets.units.length) { this.targetIndex = (this.targetIndex + 1) % this.targets.units.length; this._revealUnit(this.targets.units[this.targetIndex]); sfx('cursor'); }
    if (r.id === 'slot') { const levels = this.pending.levels; this.slotLevel = levels[(levels.indexOf(this.slotLevel) + 1) % levels.length]; sfx('cursor'); }
    if (r.id === 'confirm') {
      if (this.phase === 'target') this._confirmTarget();
      else { const node = this.reach.get(key(this.cursor.x, this.cursor.y)); if (node) this._commitMove(this.enc.current, node); else sfx('error'); }
    }
    return true;
  }

  /** Send the choice to the engine and turn the results into animation. */
  _commitOption(target) {
    const enc = this.enc;
    const unit = enc?.current;
    const o = this.pending;
    if (!enc || !unit || !o) return;

    let id = o.id;
    if (this.slotLevel != null && String(id).startsWith('spell:') && o.level > 0) id = `${id}@${this.slotLevel}`;

    this.pending = null;
    this.areaCells = [];
    this.phase = 'anim';
    this.undo = null;
    this.endConfirmAt = 0;

    // A submenu choice (Shove: push / prone, Ready: trigger) rides along as
    // `extra`, which is where the engine reads such modes from.
    let tgt = target;
    if (o.extra) tgt = { ...(target || {}), extra: o.extra };

    const spell = o.spellId ? getSpell(o.spellId) : null;
    const res = safe(() => enc.perform(unit, id, tgt), null) || { ok: false, results: [] };
    this._drainReplays();

    if (!res.ok && !(res.results || []).length) {
      sfx('error');
      this.hint = res.error ? `Cannot: ${String(res.error).replace(/-/g, ' ')}.` : 'Nothing happens.';
      this.phase = this._isPlayerControlled(unit) ? 'menu' : 'enemy';
      this.menuDirty = true;
      return;
    }

    this._pushResultBeats(unit, res.results || [], { spell, option: o });
    this.beats.push({
      k: 'fn',
      fn: () => {
        if (this._checkOver()) return;
        this.menuDirty = true;
        this._recomputeReach(unit);
        if (enc.current !== unit) { this.beats.push({ k: 'fn', fn: () => this._openTurn() }); return; }
        // Auto end the turn once the budget is spent, if the player asked for it.
        const b = this._budget();
        if (this.autoEnd && this._isPlayerControlled(unit)
          && (b.action || 0) <= 0 && (b.bonus || 0) <= 0 && (b.movement || 0) <= 0 && (b.attacksLeft || 0) <= 0) {
          this._endTurn();
          return;
        }
        this.phase = this._isPlayerControlled(unit) ? 'menu' : 'enemy';
      },
    });
  }

  _doFlee() {
    const enc = this.enc;
    const unit = enc?.current;
    if (!enc || !unit) return;
    sfx('select');
    const res = safe(() => enc.fleeCheck(unit), null) || { success: false };
    this.phase = 'anim';
    this.beats.push({
      k: 'banner', dur: 1.0,
      color: res.success ? UI.COLORS.good : UI.COLORS.bad,
      text: res.success ? 'You break away!' : 'They cut you off!',
      sub: `${(res.mine || 0).toFixed(1)} vs ${(res.theirs || 0).toFixed(1)} Dexterity`,
    });
    this.beats.push({
      k: 'fn',
      fn: () => {
        if (this._checkOver()) return;
        this.menuDirty = true;
        this.phase = 'menu';
      },
    });
  }

  // =========================================================================
  // 2.9 ENEMY TURNS
  // =========================================================================

  _runEnemyTurn() {
    const enc = this.enc;
    const unit = enc?.current;
    if (!enc || !unit) { this._checkOver(); return; }

    if (!this._enemyPlans) {
      this._enemyPlans = safe(() => takeTurn(enc, unit), null) || [{ kind: 'end' }];
      this._planIndex = 0;
      this._revealUnit(unit);
    }

    const plan = this._enemyPlans[this._planIndex++];
    if (!plan) { this._enemyPlans = null; this._endTurn(); return; }

    if (plan.kind === 'end') { this._enemyPlans = null; this._endTurn(); return; }

    this.phase = 'anim';

    if (plan.kind === 'move') {
      const s = this._uiOf(unit, true);
      const res = safe(() => enc.moveUnit(unit, plan.path || []), null) || { steps: [], provoked: [] };
      if (s) s.wp = (res.steps || []).map((p) => feetOf({...unit,pos:p}));
      this.beats.push({ k: 'camera', unit, dur: 0.12 });
      this.beats.push({ k: 'walk', unit });
      this._drainReplays();                   // a readied strike as it closed
      for (const p of res.provoked || []) {
        const atk = enc.byUid ? enc.byUid(p.attacker) : null;
        this.beats.push({ k: 'banner', dur: 0.5, color: UI.COLORS.warn, text: 'Opportunity Attack', sub: atk?.name || '' });
        this._pushAttackBeats(atk, unit, p.result, null);
      }
    } else if (plan.kind === 'action') {
      const optId = String(plan.optionId || '');
      const spellId = optId.startsWith('spell:') ? optId.slice(6).split('@')[0] : null;
      const spell = spellId ? getSpell(spellId) : null;
      const res = safe(() => enc.perform(unit, plan.optionId, plan.target), null) || { results: [] };
      this.beats.push({ k: 'camera', unit, dur: 0.12 });
      this._pushResultBeats(unit, res.results || [], { spell, option: null });
      this._drainReplays();                   // a counterspell, a readied shot
    }

    this.beats.push({ k: 'wait', dur: PLAN_PAUSE });
    this.beats.push({
      k: 'fn',
      fn: () => {
        if (this._checkOver()) return;
        this.phase = 'enemy';
      },
    });
  }

  // =========================================================================
  // 2.10 REACTIONS
  // =========================================================================

  /**
   * The engine's synchronous reaction desk. Returns true/false to decide, or
   * undefined to let rules/combat.js's own default AI answer.
   */
  _reactionAnswer(reactor, offer) {
    if (!reactor || !offer) return undefined;
    if (!this._isPlayerControlled(reactor)) return undefined;   // companions on auto, monsters

    const kind = this._stanceKey(offer);
    const st = this._stanceOf(reactor, kind);
    if (st === 'yes') { this._noteReaction(reactor, offer, true); return true; }
    if (st === 'no') { this._noteReaction(reactor, offer, false); return false; }

    // Hold unarmed reactions; the prompt configures future offers only.
    this._queuePrompt(reactor, offer, kind);
    return false;
  }

  _stanceKey(offer) {
    const k = String(offer.kind || 'other').toLowerCase();
    if (k.includes('opportunity')) return 'opportunity-attack';
    if (k.includes('counter')) return 'counterspell';
    if (k.includes('shield')) return 'shield';
    if (/parry|deflect|uncanny|riposte|absorb|cutting/.test(k)) return 'defensive';
    return 'other';
  }

  _noteReaction(reactor, offer, used) {
    this.beats.push({
      k: 'banner', dur: 0.5, color: used ? UI.COLORS.good : UI.COLORS.inkDim,
      text: used ? (offer.name || 'Reaction') : 'Reaction held',
      sub: reactor.name || '',
    });
  }

  _queuePrompt(reactor, offer, kind) {
    // One prompt per creature per kind per fight. It used to be one per KIND
    // for the whole party, so the wizard's "always Shield" answer also spoke
    // for the fighter, who has no Shield and a Reaction to spend elsewhere.
    const seen = `${reactor.uid}|${kind}`;
    this._promptedKinds = this._promptedKinds || new Set();
    if (this._promptedKinds.has(seen)) return;
    this._promptedKinds.add(seen);
    this.beats.push({
      k: 'prompt',
      make: () => ({
        reactor, offer, kind,
        title: offer.name || 'Reaction',
        body: 'Held this time. Use automatically from now on?',
        yes: 'Always', no: 'Never',
        // Costed reactions (a spell slot, a superiority die) default to NO on
        // a timeout: the game should never spend a resource because the
        // player looked away. Free ones keep the useful default.
        costly: !!(offer.slot || offer.level || /spell|shield|counter|rebuke|absorb/i.test(String(offer.kind || offer.name || ''))),
        t: 0, dur: 8, index: 0,
      }),
    });
  }

  /** The stance for one creature and one reaction kind. */
  _stanceOf(reactor, kind) {
    return this.stance.get(`${reactor.uid}|${kind}`) ?? this.stance.get(kind) ?? 'ask';
  }

  _updatePrompt(dt) {
    const p = this.prompt;
    if (!p) return;
    p.t += dt;

    if (Input.pressed('left') || Input.pressed('right')) { p.index = p.index ? 0 : 1; sfx('cursor'); }
    const m = Input.mouse;
    const g = this._promptGeom();
    const inR = (r) => m.over && m.x >= r.x && m.x <= r.x + r.w && m.y >= r.y && m.y <= r.y + r.h;
    const onYes = inR(g.yes);
    const onNo = inR(g.no);
    if (onYes || onNo) p.index = onYes ? 0 : 1;

    let answer = null;
    if (Input.consume('confirm') || (m.clicked && (onYes || onNo))) answer = p.index === 0;
    else if (Input.consume('cancel')) answer = false;
    // Timing out never spends a slot or a die: free reactions default on,
    // costed ones default off.
    else if (p.t >= p.dur) answer = !p.costly;

    if (answer !== null) {
      // Per creature: this character's answer, not the party's.
      this.stance.set(`${p.reactor.uid}|${p.kind}`, answer ? 'yes' : 'no');
      safe(() => bus.emit(EV.TOAST, {
        text: `${p.reactor.name || 'They'} — ${p.title}: ${answer ? 'always' : 'never'} from now on.`,
      }));
      sfx(answer ? 'select' : 'back');
      this.prompt = null;
    }
  }

  // =========================================================================
  // 2.11 THE BEAT SEQUENCER
  // ---------------------------------------------------------------------
  // Every animation is a queue of small beats. A beat starts once, runs until
  // it says it is finished, then the next one begins. Beats may splice more
  // beats in behind themselves, which is how one AI plan becomes a dozen dice.
  // =========================================================================

  _updateBeats(dt) {
    // A press skips the beat in front of you. Holding Shift already runs the
    // sequence faster, but "faster" is no help when you have read the line and
    // just want the next turn — and a mouse player had no lever at all.
    if (this.beats.length) {
      let skip = Input.consume('confirm') || Input.consume('cancel') || this._rightClick();
      if (!skip && Input.mouse.clicked) { Input.mouse.clicked = false; skip = true; }
      if (skip) this._skipBeat();
    }

    let guard = 0;
    while (this.beats.length && guard++ < 64) {
      const b = this.beats[0];
      if (!b._started) {
        b._started = true;
        b.t = 0;
        this._startBeat(b);
        if (this.beats[0] !== b) continue;     // the beat replaced itself
      }
      b.t += dt;
      if (this._beatDone(b)) { this.beats.shift(); continue; }
      break;
    }
  }

  /**
   * Force the head beat to its end state: the die has landed, the walk has
   * arrived, the banner has been read. Never skips an 'fn' beat, which is where
   * the rules actually happen.
   */
  _skipBeat() {
    const b = this.beats[0];
    // 'fn' is where the rules actually happen and 'prompt' is a decision the
    // player still owes; neither is a beat to hurry past.
    if (!b || b.k === 'fn' || b.k === 'prompt') return;
    if (!b._started) return;                   // let it run once so it has effect
    b.t = (b.dur || 0) + 1;
    // An fx beat also waits on FX.busy(), so the effects have to go with it.
    if (b.k === 'fx') safe(() => FX.clear());
    if (b.k === 'walk') {
      // Snap the sprite to the end of its path rather than leaving it mid-tile.
      const st = b.unit ? this._uiOf(b.unit) : null;
      if (st) {
        const last = st.wp && st.wp.length ? st.wp[st.wp.length - 1] : null;
        if (last) { st.x = last.x; st.y = last.y; }
        st.wp = [];
        st.moving = false;
      }
    }
    this.dice = null;
    this.rollLines = null;
    this.banner = null;
    sfx('cursor');
  }

  _startBeat(b) {
    switch (b.k) {
      case 'fn': {
        // The callback may clear or re-queue the whole list, so remove this beat
        // by identity rather than trusting it to still be at the front.
        safe(() => b.fn && b.fn());
        const i = this.beats.indexOf(b);
        if (i >= 0) this.beats.splice(i, 1);
        break;
      }
      case 'banner':
        this.banner = {
          text: b.text, sub: b.sub, color: b.color, big: !!b.big, t: 0, dur: b.dur,
          kind: b.kind, round: b.round, side: b.side, note: b.note,
        };
        if (b.sfx) sfx(b.sfx);
        break;
      case 'dice':
        if (b.silent) { b.dur = 0.06; break; }
        this.dice = { roll: b.roll, t: 0, dur: b.dur };
        sfx('dice');
        break;
      case 'rollline':
        this.rollLines = { lines: b.lines, color: b.color, t: 0, dur: b.dur };
        // Keep the die on screen while its damage is spelled out beneath it.
        if (this.dice) this.dice.dur = this.dice.t + b.dur;
        break;
      case 'camera':
        if (b.unit) this._revealUnit(b.unit);
        else if (b.point) this._focusOn(b.point.x * TILE + TILE / 2, b.point.y * TILE + TILE / 2);
        break;
      case 'walk':
        break;
      case 'fx':
        safe(() => b.fn && b.fn());
        break;
      case 'prompt':
        this.prompt = safe(() => b.make(), null);
        if (this.prompt) sfx('open');
        break;
      default:
        break;
    }
  }

  /**
   * Make a hit land at the screen level, scaled to how much of the creature it
   * took. A nine-point graze and a blow that halves you produced exactly the
   * same nothing; and a party member being opened up should feel different
   * from a goblin being opened up.
   */
  _damageFelt(target, dealt) {
    if (!target || !dealt) return;
    if (Save?.settings?.screenShake === false) return;
    const max = safe(() => maxHpOf(target), target.maxHp || 1) || 1;
    const frac = clamp(dealt / max, 0, 1);
    safe(() => FX.shake(0.14 + frac * 0.6, 0.18 + frac * 0.28));
    if (target.side === 'party') {
      safe(() => FX.vignette(0.2 + frac * 0.4, '#3a0006', 0.45));
      if (target.hp > 0 && target.hp / max <= 0.25) safe(() => sfx('lowhp'));
    }
  }

  /**
   * A camera beat framing two combatants: their midpoint if both will fit in
   * the field at this zoom, otherwise the one being hit — the target is the one
   * you need to see, because that is where the damage lands.
   */
  _framePair(a, b) {
    const pa = posOf(a), pb = posOf(b);
    const spanX = Math.abs(pa.x - pb.x) * TILE * this.zoom;
    const spanY = Math.abs(pa.y - pb.y) * TILE * this.zoom;
    const fits = spanX < FIELD.w - 48 && spanY < FIELD.h - 48;
    if (fits) {
      return { k: 'camera', dur: 0.14, point: { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 } };
    }
    return { k: 'camera', dur: 0.14, unit: b };
  }

  _beatDone(b) {
    switch (b.k) {
      case 'walk': {
        const s = this._uiOf(b.unit);
        return !s || (!s.moving && !s.wp.length);
      }
      case 'prompt':
        return this.prompt == null;
      case 'fx':
        return b.t >= (b.dur || 0) && (b.waitFX === false || !FX.busy());
      default:
        return b.t >= (b.dur || 0);
    }
  }

  _wait(dur) { this.beats.push({ k: 'wait', dur }); }

  // =========================================================================
  // 2.12 RESULTS -> BEATS
  // =========================================================================

  _pushResultBeats(actor, results, env = {}) {
    const enc = this.enc;
    const spell = env.spell || null;
    if (spell) {
      // The wind-up: a fireball and a cure wounds used to begin identically,
      // with a banner. Now the caster gathers the spell first — a collapsing
      // ring at their feet, motes rising in the school's colour — and the eye
      // is on them before the payload goes anywhere.
      const color = spell.vfx?.color || UI.COLORS.purple;
      this.beats.push({
        k: 'fx', dur: 0.3,
        fn: () => {
          const p = this._fxAt(actor);
          this._animCast(actor, color, 0.75);
          FX.ring(p.x, p.y, 14 * this.zoom, color, 0.35, { width: 2, expand: false });
          FX.burst(p.x, p.y - 4, color, 10, { shape: 'spark', speed: 18, life: 0.5, gravity: -70, glow: 1, jitter: 6 });
          if ((spell.level || 0) >= 5) { FX.burst(p.x, p.y - 8, color, 14, { shape: 'ember', speed: 30, life: 0.7, gravity: -50 }); FX.shake(0.12, 0.3); }
        },
      });
      this.beats.push({
        k: 'banner', dur: 0.6, color: UI.COLORS.purple,
        text: spell.name || 'A spell', sub: this._spellSub(spell, env.option),
        sfx: 'spell',
      });
      // Concentration is a thing you can SEE now: the aura stays on the caster
      // until it breaks (see _syncAuras).
      if (spell.concentration) this.beats.push({ k: 'fn', fn: () => this._syncAuras() });
    }

    // The area effect plays FIRST, whatever order the engine listed it in: the
    // fireball detonates, then the creatures inside it roll. The per-target
    // save beats then skip their own spell effect, since the area already was it.
    const list = (results || []).filter(Boolean);
    const areaRes = list.find((r) => r.kind === 'area');
    if (areaRes) this._pushAreaBeats(actor, areaRes, spell, list);
    // A spell with no attack and no save — bless, cure wounds, haste, shield of
    // faith — still travels from the caster to whoever it lands on.
    else if (spell && !list.some((r) => r.kind === 'save' || r.kind === 'attack')) {
      const seen = new Set();
      const tgts = [];
      for (const r of list) {
        const id = r.target || (r.kind === 'teleport' ? null : actor?.uid);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const u = enc.byUid ? enc.byUid(id) : null;
        if (u && u.pos) tgts.push(u);
      }
      if (tgts.length) {
        this.beats.push({
          k: 'fx', dur: 0.3,
          fn: () => {
            const from = this._spellAt(actor);
            const pts = tgts.map((u) => this._spellAt(u));
            const style = spell.vfx?.style || 'aura';
            const isHeal = !!spell.heal;
            this._castFX(style === 'nova' || style === 'burst' ? 'aura' : style, from, pts[0], spell.vfx?.color || (isHeal ? UI.COLORS.hpHeal : UI.COLORS.purple),
              { spell, victims: pts, radius: 9 * this.zoom, blocking: true });
          },
        });
      }
    }

    for (const r of list) {
      if (r === areaRes) continue;
      const target = r.target ? (enc.byUid ? enc.byUid(r.target) : null) : null;
      // A concentration check that rode in on a plain damage row gets its own
      // die here. Attack and save rows carry theirs into _pushAttackBeats /
      // _pushSaveBeats, which fire it in the right place in their own sequence
      // — doing it here as well would roll the same save twice on screen.
      if (r.concentration && r.kind !== 'attack' && r.kind !== 'save') this._pushConcentrationBeats(r.concentration);
      switch (r.kind) {
        case 'concentration':
          this._pushConcentrationBeats(r);
          break;
        case 'attack': {
          const atk = r.attacker && enc.byUid ? enc.byUid(r.attacker) : actor;
          this._pushAttackBeats(atk, target, r.result, spell);
          break;
        }
        case 'save':
          this._pushSaveBeats(actor, target, r.result, spell, { areaShown: !!areaRes });
          break;
        case 'area':
          break;                                   // played above, first
        case 'stand':
          this._pushSimple(actor, 'Stands up', UI.COLORS.blue, 'buff');
          break;
        case 'escape':
          this._pushSimple(actor, r.success || r.result?.success ? 'Breaks free' : 'Still held',
            r.success || r.result?.success ? UI.COLORS.good : UI.COLORS.inkDim, r.success || r.result?.success ? 'buff' : 'miss');
          break;
        case 'flee':
        case 'fled':
          this._pushSimple(target || actor, 'flees!', UI.COLORS.inkDim, null);
          this.beats.push({ k: 'fn', fn: () => {
            const u = target || actor;
            const s = u && this._uiOf(u);
            if (s && u._fled) s.alpha = 0;
            if (this.inspect?._fled) { this.inspect = null; this.inspectPinned = false; }
          } });
          break;
        case 'ready':
          this._pushSimple(actor, 'Readied', UI.COLORS.warn, 'buff');
          break;
        case 'counterspell': {
          // The counterspeller reaches across and the spell gutters — or holds.
          const caster = target;
          const stopper = r.source && enc.byUid ? enc.byUid(r.source) : null;
          const won = r.countered !== false && r.countered != null ? !!r.countered : !r.result?.success;
          this.beats.push({
            k: 'fx', dur: 0.45,
            fn: () => {
              const a = stopper ? this._fxAt(stopper) : null;
              const p = this._fxAt(caster || actor, -6);
              if (a) FX.beam(a.x, a.y - 6, p.x, p.y, UI.COLORS.blue, 0.3, { width: 3, blocking: false });
              VFX.play(won?'dissolve-runes':'ward',{from:a||p,to:p,zoom:this.zoom,color:UI.COLORS.blue});
              FX.floater(p.x, p.y - 10, won ? 'Countered!' : 'Counter fails', won ? UI.COLORS.blue : UI.COLORS.inkDim, { size: 'sm' });
              sfx('debuff');
            },
          });
          break;
        }
        case 'damage':
          this._pushDamageFloater(target, r.amount, r.type || 'force');
          break;
        case 'heal':
          this._pushHealBeats(target, r.amount);
          break;
        case 'temphp':
          this._pushSimple(target, `+${r.amount} temp`, UI.COLORS.temp, 'buff');
          break;
        // applyEffect() results are spread into the row, so their own `kind` wins.
        case 'buff':
          this._pushSimple(target || actor, titleCase(String(r.id || 'blessed').replace(/-/g, ' ')), UI.COLORS.good, 'buff');
          break;
        case 'shield':
          this._pushSimple(target || actor, `+${r.ac || 5} AC`, UI.COLORS.silver, 'buff');
          break;
        case 'push':
          this._pushSimple(target, `pushed ${r.distance || 0} ft`, UI.COLORS.warn, 'shove');
          break;
        case 'cure':
          this._pushSimple(target, 'cured', UI.COLORS.good, 'heal');
          break;
        case 'dash':
          this._pushSimple(actor, 'Dash', UI.COLORS.blue, 'buff');
          break;
        case 'dodge':
          this._pushSimple(actor, 'Dodge', UI.COLORS.blue, 'buff');
          break;
        case 'disengage':
          this._pushSimple(actor, 'Disengage', UI.COLORS.blue, 'buff');
          break;
        case 'hide':
          this._pushSimple(actor, r.success ? 'Hidden' : 'Seen', r.success ? UI.COLORS.good : UI.COLORS.bad, r.success ? 'buff' : 'miss');
          break;
        case 'help':
          this._pushSimple(target || actor, 'Helped', UI.COLORS.good, 'buff');
          break;
        case 'shove':
        case 'grapple':
          this._pushSimple(target, r.result?.success ? titleCase(r.kind) : 'Resisted',
            r.result?.success ? UI.COLORS.good : UI.COLORS.inkDim, 'shove');
          break;
        case 'effect':
          if (target) this._pushSimple(target, conditionName(r.id || r.kindId || '') || 'Affected', UI.COLORS.purple, 'debuff');
          break;
        case 'resource':
          this._pushSimple(actor, titleCase(String(r.id || '').replace(/-/g, ' ')), UI.COLORS.gold, 'buff');
          break;
        case 'teleport':
          this.beats.push({
            k: 'fx', dur: 0.3, fn: () => {
              const s = this._uiOf(actor, true);
              const from = this._spellAt(actor), f = feetOf(actor);
              const to = { x: f.x * this.zoom, y: f.y * this.zoom - from.ground, ground: from.ground };
              const arrive = () => { if (s) { s.x = f.x; s.y = f.y; s.wp = []; } };
              arrive(); // Keep the resolved position even if the animation is skipped.
              if (spell) this._castFX('teleport', from, to, UI.COLORS.purple, { spell, blocking: true });
              else FX.burst(to.x, to.y, UI.COLORS.purple, 14, { shape: 'spark', speed: 90, life: 0.4 });
            },
          });
          break;
        default:
          break;
      }
    }
  }

  /**
   * The die a concentrating caster rolls when they are hurt, and the banner
   * when they lose the spell. Losing a Hold Person was the most consequential
   * invisible event in the fight: it happened in the log and nowhere else.
   *   c: { unit|uid, roll, dc, success, spellId, spellName }
   */
  _pushConcentrationBeats(c) {
    if (!c) return;
    const enc = this.enc;
    const unit = c.unit && c.unit.uid ? c.unit : (enc.byUid ? enc.byUid(c.unit || c.uid) : null);
    if (!unit) return;
    const showRolls = Save?.settings?.showRolls !== false;
    const name = c.spellName || (c.spellId && getSpell(c.spellId)?.name) || 'the spell';
    const ok = !!c.success;
    if (c.roll) {
      this.beats.push({
        k: 'dice', silent: !showRolls, dur: DICE_HOLD * 0.8,
        roll: {
          ...c.roll, dc: c.dc, hit: ok,
          label: ok ? 'HELD' : 'BROKEN',
          labelColor: ok ? UI.COLORS.good : UI.COLORS.bad,
          who: unit.name || null, what: `Concentration · ${name}`,
        },
      });
    }
    this.beats.push({
      k: 'fx', dur: ok ? 0.2 : 0.5,
      fn: () => {
        const p = this._fxAt(unit, -16);
        if (ok) {
          FX.floater(p.x, p.y, 'Concentration held', UI.COLORS.purple, { size: 'sm' });
        } else {
          FX.floater(p.x, p.y, `${name} lost!`, UI.COLORS.bad, { size: 'sm' });
          FX.burst(p.x, p.y + 6, UI.COLORS.purple, 14, { shape: 'smoke', speed: 40, life: 0.6, size: 3 });
          sfx('debuff');
          this._syncAuras();
        }
      },
    });
    if (!ok) this.beats.push({ k: 'banner', dur: 0.7, color: UI.COLORS.bad, text: 'Concentration Broken', sub: `${unit.name} loses ${name}` });
  }

  /**
   * One persistent aura per concentrating creature, in the spell's colour,
   * following the sprite; gone the moment the concentration is.
   */
  _syncAuras() {
    this.auras = this.auras || new Map();
    const enc = this.enc;
    const live = new Set();
    for (const u of enc?.units || []) {
      if (!u || isDead(u) || !u.concentration) continue;
      live.add(u.uid);
      // FX.clear() (a skipped beat) drops persistent auras; re-raise those.
      if (this.auras.has(u.uid) && !this.auras.get(u.uid).done) continue;
      const spell = u.concentration.spellId ? getSpell(u.concentration.spellId) : null;
      const color = spell?.vfx?.color || UI.COLORS.purple;
      const h = FX.aura(() => {
        const s = this.ui.get(u.uid);
        if (!s || !u.concentration || isDead(u)) return null;
        return { x: s.x, y: s.y };
      }, color, 0, { motes: 4, radius: 6, rise: 9, spin: 1.8 });
      if (h) this.auras.set(u.uid, h);
    }
    for (const [uid, h] of this.auras) {
      if (!live.has(uid)) { FX.remove(h); this.auras.delete(uid); }
    }
  }

  /**
   * Things the engine did outside anyone's turn — legendary actions, lair
   * actions, a readied strike, a pack breaking and running — arrive on
   * `enc.replays` and are played here with the same beats as everything else.
   */
  _drainReplays() {
    const enc = this.enc;
    const list = enc && Array.isArray(enc.replays) ? enc.replays.splice(0) : [];
    for (const rp of list) {
      if (!rp) continue;
      const actor = rp.actor && rp.actor.uid ? rp.actor : (enc.byUid ? enc.byUid(rp.actor) : null);
      const kind = String(rp.kind || '');
      const TITLES = {
        legendary: ['Legendary Action', UI.COLORS.red],
        lair: ['Lair Action', UI.COLORS.purple],
        readied: ['Readied Action', UI.COLORS.warn],
        morale: ['Rout', UI.COLORS.inkDim],
        counterspell: ['Counterspell', UI.COLORS.blue],
      };
      const [title, color] = TITLES[kind] || [titleCase(kind || 'Reaction'), UI.COLORS.warn];
      if (actor) this.beats.push({ k: 'camera', unit: actor, dur: 0.12 });
      this.beats.push({ k: 'banner', dur: 0.55, color, text: title, sub: actor?.name || '' });
      if (kind === 'morale' && actor) {
        this.beats.push({
          k: 'fx', dur: 0.4,
          fn: () => {
            const p = this._fxAt(actor, -16);
            FX.floater(p.x, p.y, 'flees!', UI.COLORS.inkDim, { size: 'sm' });
            const s = this._uiOf(actor, true);
            if (s) { s.alpha = 0; }
          },
        });
      }
      const optId = String(rp.optionId || '');
      const spellId = optId.startsWith('spell:') ? optId.slice(6).split('@')[0] : rp.spellId || null;
      const spell = spellId ? getSpell(spellId) : null;
      if (rp.results && rp.results.length) this._pushResultBeats(actor, rp.results, { spell });
      else if (rp.log && rp.log.length && actor) {
        const line = typeof rp.log[0] === 'string' ? rp.log[0] : (rp.log[0].text || '');
        if (line) this._pushSimple(actor, UI.fit(line, 120, 'sm'), color, null);
      }
    }
  }

  _spellSub(spell, option) {
    const bits = [];
    if (spell.level === 0) bits.push('Cantrip');
    else bits.push(`${ordinal(this.slotLevel || spell.level)} level`);
    if (spell.school) bits.push(titleCase(spell.school));
    if (spell.concentration) bits.push('Concentration');
    return bits.join(' · ');
  }

  // --- attacks -------------------------------------------------------------

  _pushAttackBeats(attacker, target, res, spell) {
    if (!res || !attacker || !target) return;
    const roll = res.roll;
    const crit = !!res.crit;
    const fumble = !!res.fumble;
    const hit = !!res.hit;
    const showRolls = Save?.settings?.showRolls !== false;

    // 1. face the target
    this.beats.push({
      k: 'fn',
      fn: () => {
        const s = this._uiOf(attacker, true);
        const tp = posOf(target), ap = posOf(attacker);
        if (s) s.dir = Math.abs(tp.x - ap.x) >= Math.abs(tp.y - ap.y)
          ? (tp.x >= ap.x ? 'right' : 'left') : (tp.y >= ap.y ? 'down' : 'up');
      },
    });

    // 1b. frame BOTH of them. The camera sits on whoever is acting, so an
    //     enemy shooting an ally across the field resolved entirely off-screen:
    //     you read that someone took nine damage and never saw it happen.
    this.beats.push(this._framePair(attacker, target));

    // 2. the d20 — captioned, because a die with no name on it is a number
    //    with no story attached.
    if (roll) {
      this.beats.push({
        k: 'dice', silent: !showRolls,
        dur: (crit || fumble ? DICE_HOLD + 0.35 : DICE_HOLD),
        roll: {
          ...roll,
          ac: res.ac,
          hit,
          crit,
          fumble,
          who: attacker.name || null,
          vs: target.name || null,
          what: (spell && spell.name) || null,
          label: crit ? 'CRITICAL' : fumble ? 'FUMBLE' : hit ? 'HIT' : 'MISS',
          labelColor: crit ? UI.COLORS.goldBright : fumble ? '#ff7a60' : hit ? UI.COLORS.good : UI.COLORS.inkDim,
        },
      });
    }

    // 3. wind-up: the body commits before the blow lands. A melee attacker
    //    draws back half a step; an archer draws; a caster gathers the spell.
    const ranged = this._isRangedAttack(attacker, target, spell);
    const dtype = this._damageTypeOf(res, spell);
    this.beats.push({
      k: 'fx', dur: spell ? 0.22 : 0.14,
      fn: () => {
        if (spell) this._animCast(attacker, spell?.vfx?.color, 0.5);
        else {
          this._uiOf(attacker,true).rangedPose=ranged;
          this._animLunge(attacker, target, ranged ? 2 : 3, 0.16, true);
          // The blade starts moving on the wind-up, so the arc is already
          // travelling when the impact beat fires a fraction later.
          if (!ranged) { this._animSwing(attacker, 0.34); sfx('slash', { vol: 0.5 }); }
        }
      },
    });

    // 4. impact
    this.beats.push({
      k: 'fx', dur: ranged ? 0.34 : 0.24,
      fn: () => {
        const a = spell ? this._spellAt(attacker) : this._fxAt(attacker);
        const p = spell ? this._spellAt(target) : this._fxAt(target);
        const dealt = res.applied && res.applied.dealt;
        if (crit) { FX.flash('#fff0b8', 0.12, 0.5); FX.shake(0.75, 0.4); sfx('hitcrit'); }
        if (ranged || spell) {
          const style = spell?.vfx || {};
          this._animLunge(attacker, target, 2, 0.18, false);
          this._castFX(spell ? (style.style || 'bolt') : 'arrow', a, p, style.color || (spell ? UI.COLORS.purple : '#cfc7b4'), {
            spell, dtype, blocking: true,
            onHit: () => {
              if (hit) this._impact(target, crit, spell, dealt, attacker, dtype);
              else this._whiff(target, p);
            },
          });
          sfx(spell ? 'spell' : 'arrow');
        } else {
          const s = this._uiOf(attacker);
          // The lunge carries the attacker INTO the target's square; the arc
          // sweeps through it a beat later, when the body is at full reach.
          this._animLunge(attacker, target, 7, 0.3, false);
          FX.slash(p.x, p.y, s?.dir || 'right', spell?.vfx?.color || (crit ? '#ffe9a3' : '#ffffff'),
            { len: crit ? 24 : 18, width: crit ? 4 : 3, sparks: hit ? 6 : 2 });
          sfx(hit ? (crit ? 'hitcrit' : 'hit') : 'miss');
          if (hit) this._impact(target, crit, spell, dealt, attacker, dtype);
          else this._whiff(target, p, attacker);
        }
      },
    });

    // 4. the damage arithmetic, spelled out
    if (hit && (res.damage || res.applied?.dealt)) {
      const lines = damageLines(res.breakdown);
      const dealt = res.applied?.dealt ?? res.damage ?? 0;
      const resisted = res.applied?.resisted || 0;
      if (resisted) lines.push(`${resisted} resisted`);
      if (showRolls && lines.length) {
        this.beats.push({ k: 'rollline', dur: DMG_HOLD, lines, color: crit ? UI.COLORS.goldBright : '#e88a70' });
      }
      this.beats.push({
        k: 'fx', dur: 0.18,
        fn: () => {
          const p = this._fxAt(target);
          if (Save?.settings?.showDamageNumbers !== false) {
            FX.floater(p.x, p.y - 6, crit ? `${dealt}!` : String(dealt),
              crit ? UI.COLORS.goldBright : '#ff8a70', { crit, size: crit ? 2 : 1.2 });
          }
        },
      });
    }

    // 4b. a blow that broke someone's concentration. This lives here rather
    //     than only in _pushResultBeats because opportunity attacks and
    //     readied strikes come straight through this function.
    if (res.concentration) this._pushConcentrationBeats(res.concentration);

    // 5. riders: mastery, sneak attack, conditions
    for (const e of res.effects || []) {
      if (!e) continue;
      if (e.kind === 'mastery' && e.id) {
        this.beats.push({
          k: 'fx', dur: 0.12,
          fn: () => {
            const p = this._fxAt(target, -18);
            FX.floater(p.x, p.y, titleCase(e.id), UI.COLORS.warn, { size: 'sm' });
          },
        });
      }
      if (e.kind === 'mastery' && e.id === 'cleave' && e.result) {
        const second = e.target && this.enc.byUid ? this.enc.byUid(e.target) : null;
        this._pushAttackBeats(attacker, second, e.result, null);
      }
    }

    this.beats.push({ k: 'wait', dur: 0.12 });
  }

  _isRangedAttack(attacker, target, spell) {
    if (spell) return spell.attack === 'ranged' || (spell.range !== 'touch' && spell.range !== 'self');
    return safe(() => distanceFt(attacker, target), 5) > 5;
  }

  /** The damage type an attack or spell result is mostly made of. */
  _damageTypeOf(res, spell) {
    const bt = res && res.byType;
    if (bt && typeof bt === 'object') {
      let best = null, bestN = -1;
      for (const k in bt) if (bt[k] > bestN) { best = k; bestN = bt[k]; }
      if (best) return lower(best);
    }
    const bd = res && res.breakdown;
    if (Array.isArray(bd) && bd.length && bd[0].type) return lower(bd[0].type);
    return lower(spell?.damage?.type || '') || null;
  }

  /**
   * What a hit looks like, by what it is made of. Steel opens a body; fire
   * flares and leaves embers; cold rimes; lightning cracks; necrotic smoke
   * rolls; radiant flashes. One table, so every attack, spell and save damage
   * in the game reads correctly without each caller knowing about it.
   */
  static IMPACT = {
    slashing: { shape: 'blood', color: '#c83a2a', speed: 90, gravity: 110, sfx: null },
    piercing: { shape: 'blood', color: '#c83a2a', speed: 70, gravity: 130, sfx: null },
    bludgeoning: { shape: 'square', color: '#d8cbb0', speed: 70, gravity: 140, sfx: null, dust: true },
    fire: { shape: 'ember', color: 'fire', speed: 80, gravity: -60, sfx: 'fire', glow: true, flash: '#ffb060' },
    cold: { shape: 'square', color: 'cold', speed: 60, gravity: 50, sfx: 'ice', shards: true },
    lightning: { shape: 'spark', color: 'lightning', speed: 150, gravity: 0, sfx: 'thunder', flash: '#fff6c0', jag: true },
    thunder: { shape: 'smoke', color: 'thunder', speed: 120, gravity: -10, sfx: 'thunder', ring: true },
    acid: { shape: 'square', color: 'acid', speed: 50, gravity: 90, sfx: null, drip: true },
    poison: { shape: 'smoke', color: 'poison', speed: 30, gravity: -30, sfx: 'debuff' },
    necrotic: { shape: 'smoke', color: 'necrotic', speed: 40, gravity: -40, sfx: 'debuff' },
    radiant: { shape: 'spark', color: 'radiant', speed: 90, gravity: -20, sfx: null, flash: '#fff4d0', glow: true },
    force: { shape: 'spark', color: 'force', speed: 110, gravity: 0, sfx: null, ring: true },
    psychic: { shape: 'ember', color: 'psychic', speed: 40, gravity: -50, sfx: 'debuff', ring: true },
  };

  /** Flash the target, shove it, shake the screen, and spray the right stuff. */
  _impact(target, crit, spell, dealt, attacker, dtype) {
    const s = this._uiOf(target, true);
    const p = this._fxAt(target);
    const type = dtype || this._damageTypeOf(null, spell) || 'slashing';
    const I = BattleScene.IMPACT[type] || BattleScene.IMPACT.slashing;
    const col = FX.COLORS[I.color] || I.color || spell?.vfx?.color || '#e0604a';

    if (s) { s.flash = 1; s.flashColor = type === 'slashing' || type === 'piercing' || type === 'bludgeoning' ? '#ff5a4a' : col; }
    // Knocked back along the line of the blow; heavier hits go further.
    const max = safe(() => maxHpOf(target), target.maxHp || 1) || 1;
    const frac = dealt ? clamp(dealt / max, 0, 1) : 0;
    this._animRecoil(target, attacker || null, 2 + frac * 5 + (crit ? 2 : 0), 0.22 + frac * 0.1);

    const n = (crit ? 16 : 8) + Math.round(frac * 8);
    FX.burst(p.x, p.y, col, n, {
      shape: I.shape, speed: I.speed * (crit ? 1.4 : 1), life: 0.36, gravity: I.gravity, glow: I.glow ? 1 : 0,
      dir: attacker ? this._toward(attacker, target) : undefined, spread: attacker ? 1.3 : Math.PI,
    });
    if (I.dust) FX.burst(p.x, p.y, '#8a7a60', 6, { shape: 'smoke', speed: 26, life: 0.5, size: 3 });
    if (I.shards) FX.burst(p.x, p.y - 4, '#e8f6ff', 6, { shape: 'spark', speed: 60, life: 0.3, gravity: 120 });
    if (I.ring) FX.ring(p.x, p.y, 10 * this.zoom, col, 0.3, { width: 2 });
    if (I.jag) FX.beam(p.x + 4, p.y - 22, p.x, p.y - 6, col, 0.14, { jagged: true, width: 2, blocking: false });
    if (I.flash && (crit || frac > 0.3)) FX.flash(I.flash, 0.08, 0.28);
    if (I.sfx) sfx(I.sfx, { vol: 0.6 });

    // A flat 0.22 shake for every hit told you a blow had landed and nothing
    // about its size. Scale it, and let a party member's blood tint the screen.
    if (dealt) this._damageFelt(target, dealt);
    else if (!crit) FX.shake(0.22, 0.2);
    // A crit, or a blow that takes a third of someone, holds the frame.
    if (crit) this._hitstop(0.09);
    else if (frac >= 0.34) this._hitstop(0.05);
  }

  /** A miss: the target sways out of the line, and says so. */
  _whiff(target, p, attacker) {
    const s = this._uiOf(target, true);
    if (s && attacker) {
      // A sidestep: perpendicular to the line of the attack, and back.
      const v = this._toward(attacker, target);
      s.recoil = { t: 0, dur: 0.26, dx: -v.y * 3 * this.zoom, dy: v.x * 2 * this.zoom };
    }
    FX.floater(p.x, p.y - 4, 'MISS', UI.COLORS.inkDim, { size: 'sm' });
  }

  /**
   * One place that turns a spell's authored `vfx.style` into effects, so an
   * attack spell, a save spell and an area spell with the same style look the
   * same. `from`/`to` are screen points; `o`: { spell, dtype, radius, dir,
   * blocking, onHit, victims:[screen points] }.
   */
  _castFX(style, from, to, color, o = {}) {
    if(o.spell){
      // Same named spell language as exploration. Rules have already resolved;
      // the callback only synchronizes the visible impact and damage numbers.
      return VFX.cast(o.spell,{...o,from,to,color,zoom:this.zoom,count:o.count||1,
        ground:to.ground ?? 10*this.zoom,fromGround:from.ground ?? 10*this.zoom,onImpact:o.onHit});
    }
    const col = FX.COLORS[color] || color || UI.COLORS.purple;
    const radius = o.radius || 16 * this.zoom;
    const done = () => { if (o.onHit) o.onHit(to.x, to.y); };
    switch (style) {
      case 'arrow':
        FX.projectile(from.x, from.y, to.x, to.y, { color: col, shape: 'arrow', speed: 340, arc: 14, trail: false, onHit: done, blocking: o.blocking });
        return;
      case 'bolt':
        FX.projectile(from.x, from.y, to.x, to.y, {
          color: col, shape: 'bolt', speed: 360, trail: true, onHit: done, blocking: o.blocking,
          impact: { color: col, count: 8, shape: 'spark' },
        });
        return;
      case 'orb':
        FX.projectile(from.x, from.y, to.x, to.y, { color: col, shape: 'orb', speed: 220, arc: 10, trail: true, onHit: done, blocking: o.blocking });
        return;
      case 'beam':
        FX.beam(from.x, from.y - 6, to.x, to.y - 6, col, 0.34, { width: 4, blocking: o.blocking });
        FX.burst(to.x, to.y - 6, col, 10, { shape: 'spark', speed: 60, life: 0.3 });
        done();
        return;
      case 'chain': {
        const pts = [from, ...(o.victims && o.victims.length ? o.victims : [to])];
        FX.chain(pts, col, 0.42, { blocking: o.blocking });
        for (const v of pts.slice(1)) FX.burst(v.x, v.y - 6, col, 8, { shape: 'spark', speed: 90, life: 0.25 });
        done();
        return;
      }
      case 'nova':
        FX.nova(to.x, to.y, col, { radius, count: 22, blocking: o.blocking });
        FX.shake(0.3, 0.28);
        done();
        return;
      case 'burst':
        // A burst is a nova without the fireball: a bright flash and a spray,
        // the shape of thunderwave, shatter, guiding bolt landing.
        FX.ring(to.x, to.y, radius * 0.9, col, 0.32, { width: 2, fill: 0.2 });
        FX.burst(to.x, to.y - 4, col, 18, { shape: 'spark', speed: radius * 3, life: 0.36, glow: 1 });
        FX.burst(to.x, to.y, FX.COLORS.shadow, 5, { shape: 'smoke', speed: 20, life: 0.5, size: 3 });
        done();
        return;
      case 'cone': {
        const dir = o.dir || Math.atan2(to.y - from.y, to.x - from.x);
        FX.burst(from.x, from.y - 6, col, 34, { shape: o.dtype === 'cold' ? 'square' : 'ember', speed: radius * 4.2, life: 0.42, dir, spread: 0.5, gravity: 0, glow: 1 });
        FX.burst(from.x, from.y - 6, col, 10, { shape: 'smoke', speed: radius * 2.4, life: 0.55, dir, spread: 0.55, size: 4 });
        done();
        return;
      }
      case 'rain':
        FX.rain(to.x, to.y, radius, col, { count: 14, dur: 0.7, blocking: o.blocking });
        done();
        return;
      case 'aura': {
        // A blessing settles on each creature it touches and clings for a
        // moment: motes circling their feet in the spell's colour.
        const pts = o.victims && o.victims.length ? o.victims : [to];
        FX.ring(to.x, to.y, radius, col, 0.5, { width: 2, fill: 0.12 });
        for (const v of pts) {
          const px = v.x, py = v.y;
          FX.aura(() => ({ x: px, y: py }), col, 1.3, { motes: 6, radius: 7 * this.zoom, rise: 12 });
          FX.burst(px, py - 8, col, 6, { shape: 'spark', speed: 22, life: 0.6, gravity: -30, glow: 1 });
        }
        done();
        return;
      }
      case 'wave':
        FX.ring(to.x, to.y, radius, col, 0.42, { width: 3 });
        FX.ring(to.x, to.y, radius * 0.6, col, 0.3, { width: 2 });
        FX.burst(to.x, to.y, col, 16, { shape: 'smoke', speed: radius * 2.2, life: 0.5, size: 3 });
        FX.shake(0.2, 0.2);
        done();
        return;
      case 'slash':
        FX.slash(to.x, to.y, o.dir != null ? o.dir : 'right', col, { len: Math.max(18, radius) });
        done();
        return;
      default:
        FX.burst(to.x, to.y - 6, col, 12, { shape: 'spark', speed: 70, life: 0.32, glow: 1 });
        done();
    }
  }

  // --- saves ---------------------------------------------------------------

  _pushSaveBeats(source, target, res, spell, env = {}) {
    if (!res || !target) return;
    const showRolls = Save?.settings?.showRolls !== false;
    const ok = !!res.success;

    // Frame the creature making the save before it rolls; a saving throw is
    // resolved at the target's feet, not the caster's.
    if (source) this.beats.push(this._framePair(source, target));

    if (res.roll) {
      this.beats.push({
        k: 'dice', silent: !showRolls, dur: DICE_HOLD * 0.85,
        roll: {
          ...res.roll,
          dc: res.dc,
          hit: ok,
          label: ok ? 'SAVED' : 'FAILED',
          labelColor: ok ? UI.COLORS.good : UI.COLORS.bad,
          saveOf: target.name,
          ability: res.ability,
          who: target.name || null,
          what: `${String(res.ability || '').toUpperCase()} save`
            + (spell && spell.name ? ` vs ${spell.name}` : ''),
        },
      });
    }

    const dealt = res.applied?.dealt ?? res.damage ?? 0;
    // The spell itself, in its own colours, arriving at the creature that
    // has to save against it. A single-target save spell used to be a die
    // and an ember — hold person, blindness, banishment all looked the same.
    if (spell && !env.areaShown) {
      const style = spell.vfx?.style || 'burst';
      const dtype = this._damageTypeOf(res, spell);
      this.beats.push({
        k: 'fx', dur: 0.26,
        fn: () => {
          const from = this._spellAt(source || target);
          const to = this._spellAt(target);
          this._castFX(style === 'nova' || style === 'rain' ? 'burst' : style, from, to, spell.vfx?.color, { spell, dtype, blocking: true, radius: 10 * this.zoom });
        },
      });
    }
    if (dealt > 0) {
      const lines = damageLines(res.breakdown);
      if (ok) lines.push(res.evasion ? 'Evasion — no damage' : 'half on a success');
      if (showRolls && lines.length) {
        this.beats.push({ k: 'rollline', dur: DMG_HOLD * 0.8, lines, color: '#e88a70' });
      }
      const dtype = this._damageTypeOf(res, spell);
      this.beats.push({
        k: 'fx', dur: 0.16,
        fn: () => {
          const p = this._fxAt(target);
          if (Save?.settings?.showDamageNumbers !== false) FX.floater(p.x, p.y - 6, String(dealt), '#ff8a70', { size: 1.2 });
          this._impact(target, false, spell, dealt, source && source !== target ? source : null, dtype);
        },
      });
    } else if (ok) {
      this.beats.push({
        k: 'fx', dur: 0.14,
        fn: () => {
          const p = this._fxAt(target);
          FX.floater(p.x, p.y - 6, 'SAVED', UI.COLORS.good, { size: 'sm' });
        },
      });
    }

    if (res.concentration) this._pushConcentrationBeats(res.concentration);

    for (const e of res.effects || []) {
      if (!e || !e.id) continue;
      this.beats.push({
        k: 'fx', dur: 0.1,
        fn: () => {
          const p = this._fxAt(target, -18);
          FX.floater(p.x, p.y, conditionName(e.id) || titleCase(String(e.id)), UI.COLORS.purple, { size: 'sm' });
        },
      });
    }
  }

  // --- areas ---------------------------------------------------------------

  _pushAreaBeats(actor, r, spell, all = []) {
    const enc = this.enc;
    const cells = r.tiles || [];
    const style = spell?.vfx?.style || 'burst';
    const color = spell?.vfx?.color || UI.COLORS.orange;
    const aim = r.aim || (cells.length ? cells[Math.floor(cells.length / 2)] : posOf(actor));

    // Everyone caught, in screen space, so auras and chains can visit each one:
    // the per-target save / attack results in the same batch name them.
    const victimsOf = () => {
      const seen = new Set(), out = [];
      for (const x of all) {
        if (!x || (x.kind !== 'save' && x.kind !== 'attack' && x.kind !== 'buff' && x.kind !== 'heal') || !x.target) continue;
        if (seen.has(x.target)) continue;
        seen.add(x.target);
        const u = enc?.byUid ? enc.byUid(x.target) : null;
        if (u && u.pos) out.push(this._spellAt(u));
      }
      return out;
    };
    const dtype = lower(spell?.damage?.type || '');
    const isCone = spell?.target?.kind === 'cone' || style === 'cone';

    this.beats.push({
      k: 'fx', dur: style === 'rain' ? 0.7 : 0.45,
      fn: () => {
        const c = this._fxTile(aim.x, aim.y);
        const from = this._spellAt(actor);
        if (isCone || spell?.target?.kind === 'line' || r.shape === 'line') {
          // Project the rules' heading at the caster's visual height. Mixing a
          // raised hand with a floor endpoint tilts horizontal/diagonal spells.
          const origin = r.origin || posOf(actor);
          const floor = this._fxTile(origin.x, origin.y);
          c.x = from.x + c.x - floor.x;
          c.y = from.y + c.y - floor.y;
          c.ground = from.ground;
        }
        const radius = Math.max(16, Math.sqrt(Math.max(1, cells.length)) * TILE * this.zoom * 0.5);
        const dir = Math.atan2(c.y - from.y, c.x - from.x);
        // A bolt that flies to the centre and then detonates (fireball), or a
        // shape that simply appears at its origin (cone, aura, wave).
        this._castFX(isCone ? 'cone' : style, from, c, color, {
          spell, dtype, radius, dir, victims: victimsOf(), blocking: true,
        });
        if (!isCone && style !== 'aura') FX.shake(0.3, 0.28);
        const I = BattleScene.IMPACT[dtype];
        sfx(I && I.sfx ? I.sfx : (style === 'bolt' || style === 'beam' || style === 'aura' ? 'spell' : 'fire'));
      },
    });
  }

  // --- small feedback ------------------------------------------------------

  _pushHealBeats(target, amount) {
    if (!target || !amount) return;
    this.beats.push({
      k: 'fx', dur: 0.35,
      fn: () => {
        const p = this._fxAt(target);
        FX.burst(p.x, p.y, UI.COLORS.hpHeal, 12, { shape: 'spark', speed: 26, life: 0.7, gravity: -34 });
        FX.floater(p.x, p.y - 6, `+${amount}`, UI.COLORS.hpHeal, { size: 1.2 });
        sfx('heal');
      },
    });
  }

  _pushDamageFloater(target, amount, type) {
    if (!target || !amount) return;
    this.beats.push({
      k: 'fx', dur: 0.2,
      fn: () => {
        const p = this._fxAt(target);
        const s = this._uiOf(target, true);
        if (s) s.flash = 1;
        FX.floater(p.x, p.y - 6, String(amount), UI.DAMAGE_COLORS?.[type] || '#ff8a70', { size: 1.2 });
      },
    });
  }

  _pushSimple(unit, text, color, sound) {
    if (!unit) return;
    this.beats.push({
      k: 'fx', dur: 0.24,
      fn: () => {
        const p = this._fxAt(unit, -18);
        FX.floater(p.x, p.y, text, color, { size: 'sm' });
        if (sound) sfx(sound);
      },
    });
  }

  // =========================================================================
  // 2.13 BOSS PHASES
  // =========================================================================

  /** The creature the boss bar belongs to: a flagged boss, else the biggest foe. */
  _findBoss() {
    const enc = this.enc;
    if (!enc) return null;
    const foes = (enc.units || []).filter((u) => u && u.side === 'foe');
    for (const u of foes) {
      const def = this._monsterDef(u);
      if (u.boss || u.isBoss || def?.boss || (u.legendary && u.legendary.actions)) return u;
    }
    if (!enc.boss) return null;
    let best = null;
    for (const u of foes) if (!best || (u.maxHp || 0) > (best.maxHp || 0)) best = u;
    return best;
  }

  _monsterDef(u) {
    const id = u?.monsterId || u?.id;
    if (!id) return null;
    return safe(() => (MonsterData.MONSTERS || {})[id], null) || null;
  }

  _phaseOf(u) {
    const p = hpPct(u);
    return p > 0.75 ? 0 : p > 0.5 ? 1 : p > 0.25 ? 2 : 3;
  }

  _checkBossPhase() {
    if (!this.boss || this.boss._fled || isDead(this.boss)) return;
    const now = this._phaseOf(this.boss);
    if (now <= this.bossPhase) return;
    this.bossPhase = now;
    const names = ['', 'Wounded', 'Bloodied', 'Cornered'];
    const lines = [
      '',
      'It shrugs off the wound and presses in.',
      'Blood runs freely — it fights like something with nothing left to lose.',
      'Whatever restraint it had is gone.',
    ];
    this.beats.unshift({
      k: 'banner', dur: 1.1, color: UI.COLORS.red, sfx: 'roar',
      text: `${this.boss.name} — ${names[now]}`, sub: lines[now],
    });
    FX.shake(0.5, 0.5);
  }

  // =========================================================================
  // 2.14 VICTORY & DEFEAT
  // =========================================================================

  _openVictory(result) {
    const enc = this.enc;
    const rw = enc.rewards || safe(() => enc.awardXp(), null) || { xp: 0, share: 0, gold: 0, loot: [], leveled: [] };

    // awardXp normalises both loot sources to { id, qty, name, rarity }; an
    // older encounter object (or a hand-built one) may still hand up bare ids,
    // so accept either rather than resolving a string as an object and adding
    // nothing at all.
    const loot = (rw.loot || rw.items || []).map((e) => (typeof e === 'string'
      ? { id: e, qty: 1, name: safe(() => itemName(e), e) || e, rarity: 'common' }
      : { id: e.id, qty: Math.max(1, e.qty || 1), name: e.name || safe(() => itemName(e.id), e.id) || e.id, rarity: e.rarity || 'common' }))
      .filter((e) => e.id);

    // The engine hands out XP; the purse and the pack are the scene's business.
    if (rw.gold > 0) safe(() => Party.addGold(rw.gold));
    for (const e of loot) safe(() => Party.addItem(e.id, e.qty));

    const members = (enc.units || []).filter((u) => u && u.side === 'party' && u.kind !== 'monster');
    this.results = {
      kind: 'victory',
      xp: rw.xp || 0,
      share: rw.share || 0,
      gold: rw.gold || 0,
      loot,
      leveled: rw.leveled || [],
      members,
      rounds: result?.rounds || enc.round || 1,
      t: 0, index: 0,
    };
    safe(() => Audio.music(null));
    safe(() => (Audio.fanfare ? Audio.fanfare('victory') : Audio.music('victory')));
    sfx('victory');
    FX.flash('#fff4d0', 0.35, 0.5);
  }

  _openDefeat(result) {
    this.results = { kind: 'defeat', t: 0, index: 0, rounds: result?.rounds || this.enc?.round || 1 };
    safe(() => Audio.music(null));
    sfx('defeat');
  }

  /**
   * The party got away. `enc.result()` reports this as its own state — it is
   * neither `victory` nor `defeat` — and treating it as a defeat sent a party at
   * full health to the Game Over screen. Escaping costs the spoils, nothing else.
   */
  _openEscape(result) {
    this.results = { kind: 'fled', t: 0, index: 0, rounds: result?.rounds || this.enc?.round || 1 };
    safe(() => Audio.music(null));
    sfx('select');
  }

  _updateResults() {
    const r = this.results;
    if (!r) return;
    r.t += Game.dt || 0.016;
    if (r.t < 0.6 || this._leaving) return;

    const m = Input.mouse;
    if (Input.consume('confirm') || Input.consume('cancel') || (m.clicked && m.over)) {
      if (r.kind === 'victory') this._leaveVictory();
      else if (r.kind === 'fled') this._leaveEscape();
      else this._leaveDefeat();
    }
  }

  /** Back to the map, no Game Over: the company is alive and running. */
  _leaveEscape() {
    if (this._leaving) return;
    this._leaving = true;
    sfx('select');
    const enc = this.enc;
    if (this.opts.onEnd) safe(() => this.opts.onEnd(safe(() => enc.result(), null)));
    if (Game.top === this) Game.pop();
  }

  _leaveVictory() {
    // import('./levelup.js') is asynchronous, so between the Confirm that starts
    // it and the frame the module lands, _updateResults kept calling straight
    // back in — thirty mashed Confirms pushed twenty-eight LevelUpScenes. One
    // latch, checked by every exit from the results panel.
    if (this._leaving) return;
    this._leaving = true;
    sfx('select');
    const leveled = this.results?.leveled || [];
    const enc = this.enc;
    const chars = leveled
      .map((l) => (enc?.byUid ? enc.byUid(l.uid) : null) || Party.find(l.uid))
      .filter(Boolean);

    const finish = () => {
      if (this.opts.onEnd) safe(() => this.opts.onEnd(safe(() => enc.result(), null)));
      if (Game.top === this) Game.pop();
    };

    if (chars.length) {
      // ui/levelup.js is written by a sibling module; never let a missing file
      // strand the player inside a finished battle.
      import('./levelup.js')
        .then((mod) => {
          const Scene = mod.LevelUpScene || mod.default;
          finish();
          if (Scene) Game.push(new Scene(chars));
        })
        .catch(() => finish());
      return;
    }
    finish();
  }

  _leaveDefeat() {
    if (this._leaving) return;
    this._leaving = true;
    sfx('select');
    const enc = this.enc;
    const killer = (enc?.units || []).find((u) => u && u.side === 'foe' && !isDead(u));
    const reason = killer
      ? `Slain by ${killer.name} after ${enc.round} round${enc.round === 1 ? '' : 's'}.`
      : 'The party was overwhelmed.';
    if (Game.top === this) Game.pop();
    safe(() => Game.push(new GameOverScene(reason)));
  }

  // =========================================================================
  // 2.15 THE LOG PANEL
  // =========================================================================

  _updateLog() {
    const lines = this.enc?.log || [];
    const max = Math.max(0, lines.length - LOG_ROWS);
    if (Input.repeat('up', 0.25, 0.05)) this.logScroll = Math.min(max, this.logScroll + 1);
    if (Input.repeat('down', 0.25, 0.05)) this.logScroll = Math.max(0, this.logScroll - 1);
    const w = Input.mouse.wheel;
    if (w) this.logScroll = clamp(this.logScroll + (w > 0 ? 2 : -2), 0, max);
    if (Input.consume('cancel') || Input.consume('confirm') || this._rightClick() || Input.mouse.clicked) { Input.mouse.clicked = false; this.showLog = false; sfx('close'); }
  }

  /** Is the pointer over open battlefield, rather than a floating panel? */
  _mouseOnField() {
    const m = Input.mouse;
    if (!m.over || m.y <= FIELD.y || m.y >= FIELD.y + FIELD.h) return false;
    const inRect = (r) => r && m.x >= r.x && m.x <= r.x + r.w && m.y >= r.y && m.y <= r.y + r.h;
    // Only the plates that are actually up: the detail over the bar, the
    // target card, and the note slip while it carries a note. The bands are
    // outside the field already.
    if (inRect(this._detailR) || inRect(this._statR)) return false;
    const panelUp = this.phase === 'menu' || this.phase === 'move' || this.phase === 'target';
    const noteUp = this.phase === 'move' || (!!this.hint && panelUp);
    if (noteUp && inRect({ x: NOTE.x, y: NOTE.y, w: NOTE.w, h: 8 })) return false;
    return true;
  }

  _unitAtTile(x, y) {
    for (const u of this.enc?.units || []) {
      if (!u || u._fled || isDead(u)) continue;
      if (footprintTiles(u).some(p=>p.x===x&&p.y===y)) return u;
    }
    return null;
  }

  _unitRotation(u) {
    const t = this._uiOf(u, true)?.topple || 0;
    if (!t) return 0;
    const swing = t < 0.8 ? easeOut(t / 0.8) * 1.08 : 1.08 - 0.08 * ((t - 0.8) / 0.2);
    return swing * Math.PI / 2 * (u.side === 'foe' ? 1 : -1);
  }

  _unitBounds(u) {
    const s = this._uiOf(u, true) || feetOf(u);
    const art = u.monsterId && !u.layered ? monsterArtFor(u.monsterId, u.sprite) : null;
    const dims = art ? spriteSize(art.sprite) : { w: 16, h: 24 };
    const scale = Math.max(1, Math.round(this.zoom * sizeScale(u))) * (art?.scale || 1);
    const w = dims.w * scale, h = dims.h * scale;
    const x = R(R(this._sx(s.x) + (s.ox || 0)) - w / 2);
    const y = R(R(this._sy(s.y) + (s.oy || 0)) - h);
    const rotation = this._unitRotation(u), cos = Math.cos(rotation), sin = Math.sin(rotation);
    // Finished monster sprites rotate about their centre; composed heroes pivot
    // at their feet. Match those render transforms for both bounds and picking.
    const pivot = { x: x + w / 2, y: y + (art ? h / 2 : h) };
    const corners = [[x,y],[x+w,y],[x,y+h],[x+w,y+h]].map(([px,py]) => ({
      x: pivot.x + (px-pivot.x)*cos - (py-pivot.y)*sin,
      y: pivot.y + (px-pivot.x)*sin + (py-pivot.y)*cos,
    }));
    const left = Math.min(...corners.map(p=>p.x)), top = Math.min(...corners.map(p=>p.y));
    return { x:left,y:top,w:Math.max(...corners.map(p=>p.x))-left,h:Math.max(...corners.map(p=>p.y))-top,
      source:{x,y,w,h},pivot,cos,sin,scale,art };
  }

  /** Pick visible bodies in the same front-to-back order as the renderer.
   * Art selection does not change the rules engine's reach or area footprint. */
  _unitAtPoint(x, y) {
    const list = (this.enc?.units || []).filter(u => u && !u._fled && !isDead(u));
    list.sort((a, b) => (this._uiOf(b, true).y - this._uiOf(a, true).y) || (a.uid < b.uid ? 1 : -1));
    for (const u of list) {
      const r = this._unitBounds(u);
      if (x < r.x || y < r.y || x >= r.x + r.w || y >= r.y + r.h) continue;
      const dx=x-r.pivot.x,dy=y-r.pivot.y;
      const sx=r.pivot.x+dx*r.cos+dy*r.sin-r.source.x;
      const sy=r.pivot.y-dx*r.sin+dy*r.cos-r.source.y;
      if(sx<0||sy<0||sx>=r.source.w||sy>=r.source.h)continue;
      if (r.art) {
        const s = this._uiOf(u, true);
        const frame = `${s.dir}-${s.moving ? [0, 1, 0, 2][Math.floor(s.phase) & 3] : 0}`;
        const img = getSprite(r.art.sprite, frame, r.art.colorway);
        // Transparent corners of wings/limbs still belong to the terrain below.
        if (img && !img.getContext('2d').getImageData(Math.floor(sx/r.scale), Math.floor(sy/r.scale), 1, 1).data[3]) continue;
      }
      return u;
    }
    const tile = this._screenToTile(x, y);
    return this._unitAtTile(tile.x, tile.y);
  }

  // =========================================================================
  // 3. DRAWING
  // =========================================================================

  draw() {
    const enc = this.enc;
    const back = Stage.ctx('backdrop');
    back.fillStyle = '#05060c';
    back.fillRect(0, 0, VIEW_W, VIEW_H);
    if (!enc) return;

    this._drawField();
  }

  /**
   * The battle interface, on 'hud': the two bands and the few plates that
   * float over the field while they have something to say. The world-anchored
   * part (tags over the creatures) is on 'world-ui', see _drawWorldUI.
   */
  drawUI(ctx) {
    const enc = this.enc;
    if (!enc) return;
    syncLayout();
    const on = (id) => Layout.visible(id);
    this._logVisible = on('battle.log');
    this._detailR = null;

    this._drawBands(ctx);
    this._drawRail(ctx);
    if (this._logVisible) this._drawLogTail(ctx);
    if (this.boss && !this.boss._fled && !isDead(this.boss)) this._drawBossBar(ctx);

    // The bottom band belongs to whoever is acting; once the fight is decided
    // it is an empty margin under the results page.
    if (!this.results) {
      if (on('battle.unit')) this._drawUnitCard(ctx);
      if (on('battle.budget')) this._drawBudget(ctx);
      if (this.phase === 'menu') this._drawMenu(ctx);
      else if (this.phase === 'target' || this.phase === 'move') this._drawAimBar(ctx);
      else this._drawWaitBar(ctx);
      this._drawEndButton(ctx);
    }

    if (on('battle.detail')) {
      if (this.phase === 'menu') this._drawDetail(ctx);
      else if (this.phase === 'target') this._drawAimDetail(ctx);
    }

    this._statR = null;
    if (on('battle.stat') && this.inspect && !this.dice && !this.results && !this.prompt && !(this.banner && this.banner.big)
      && (this.inspectPinned || this.inspectHover || this.phase === 'target')) {
      this._drawStatCard(ctx);
    }

    // Markers for everyone the camera left behind, clear of the plates above.
    this._drawOffscreen(ctx);

    if (this.rollLines) this._drawRollLines(ctx);
    if (this.dice && on('battle.dice')) {
      this._drawDice(ctx);
      this._drawDiceCaption(ctx);
    }
    if (this.banner) this._drawBanner(ctx);
    if (!this.results && !this.showLog) this._drawHints(ctx);
    if (this.showLog) this._drawLogPanel(ctx);
    if (this.prompt) this._drawPrompt(ctx);
    if (this.results) this._drawResults(ctx);
    if (this.ff) UI.text(ctx, VIEW_W - 4, TOP_H + 3, 'FAST', { size: 'fineb', color: GILT.hi, align: 'right', shadow: true });
    // Tags the unit pass recorded but no world-ui pass drew (a frame whose field
    // threw) must not pile up.
    if (this._tags) this._tags.length = 0;
  }

  // --- the battlefield -----------------------------------------------------

  _drawField() {
    const sh = (Save?.settings?.screenShake === false || !FX.shakeOffset)
      ? { x: 0, y: 0 } : FX.shakeOffset();

    // Which tiles are on screen?
    const o = this._origin();
    const left = Math.floor((FIELD.x - o.x) / this.zoom / TILE) - 1;
    const top = Math.floor((FIELD.y - o.y) / this.zoom / TILE) - 1;
    const cols = Math.ceil(FIELD.w / (TILE * this.zoom)) + 3;
    const rows = Math.ceil(FIELD.h / (TILE * this.zoom)) + 3;

    // Each pass paints its own stage layer, every one inside the same FIELD
    // clip and shake (see _fieldPass).
    // 1. terrain, authored at 1x and blown up by the canvas transform, so every
    //    source pixel becomes an exact 2x2 block instead of a resampled smear.
    this._fieldPass('ground', sh, (ctx) => {
      ctx.imageSmoothingEnabled = false;
      ctx.translate(o.x, o.y);
      ctx.scale(this.zoom, this.zoom);
      this._drawTerrain(ctx, left, top, cols, rows);
      this._drawGroundAccents(ctx,left,top,cols,rows);
    });

    // 1b. night, and any fog the fight was rolled in — pools of light around
    //     the party, everything else in shadow. Purely a read of the arena's
    //     `dark`; the rules for dim light live with the engine.
    if (this.dark > 0.05) this._fieldPass('ground-shade', sh, (ctx) => this._drawDarkness(ctx));

    // 2. tactical overlays (screen space, so the lines stay 1px crisp)
    this._fieldPass('deco', sh, (ctx) => {
      this._drawGrid(ctx, left, top, cols, rows);
      this._drawTacticalOverlays(ctx);
      VFX.drawGround(ctx,-o.x,-o.y);
    });

    // 3. combatants, painters-algorithm by their feet
    this._fieldPass('actors', sh, (ctx) => this._drawUnits(ctx));

    // 4. effects — spawned in zoomed-world space so they follow the camera while
    //    still drawing at 1x pixel size (crisp sparks). The damage numbers go up
    //    on 'world-ui', over everything the world draws.
    this._fieldPass('fx', sh, (ctx) => {
      // Keep light pools inside the battlefield clip, away from action bars.
      const glowMode=VFX.glowMode;
      if(glowMode==='auto')VFX.glowMode='inline';
      try{FX.draw(ctx,-o.x,-o.y,NO_FLOATERS);}finally{VFX.glowMode=glowMode;}
    });
    this._fieldPass('world-ui', sh, (ctx) => { this._drawWorldUI(ctx); FX.drawFloaters(ctx, -o.x, -o.y); });
  }

  /**
   * One layer's share of the battlefield: clipped to FIELD and shaken with the
   * camera. A throw anywhere in the field used to leave its clip and saves
   * standing, and since the clip is exactly FIELD the whole game was then
   * trapped in a 400x186 band for the rest of the session — try/finally
   * unwinds them whatever happens.
   */
  _fieldPass(layer, sh, fn) {
    const ctx = Stage.ctx(layer);
    UI.pushClip(ctx, FIELD.x, FIELD.y, FIELD.w, FIELD.h);
    ctx.save();
    try {
      ctx.translate(R(sh.x), R(sh.y));
      fn(ctx);
    } finally {
      ctx.restore();
      UI.popClip(ctx);
    }
  }

  /** A darkness layer with light carved out around the party (and any lit foe). */
  _drawDarkness(ctx) {
    if (typeof document === 'undefined') return;
    if (!this._darkCanvas) {
      this._darkCanvas = document.createElement('canvas');
      this._darkCanvas.width = FIELD.w; this._darkCanvas.height = FIELD.h;
    }
    const dc = this._darkCanvas, g = dc.getContext('2d');
    const amt = this.dark;
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, dc.width, dc.height);
    g.fillStyle = `rgba(8,10,28,${(0.62 * amt).toFixed(3)})`;
    g.fillRect(0, 0, dc.width, dc.height);
    g.globalCompositeOperation = 'destination-out';
    const flick = 0.92 + 0.08 * Math.sin(this.t * 9);
    for (const u of this.enc?.units || []) {
      if (!u || u._fled || isDead(u)) continue;
      const s = this.ui.get(u.uid);
      if (!s) continue;
      // Everyone carries some light; the party carries torches. A creature
      // with a lit spell effect (light, faerie fire) glows on its own.
      const lit = u.side === 'party' || (u.effects || []).some((e) => /light|flame|fire|radiant/i.test(String(e.id || e.name || '')));
      const r = (lit ? 3.2 : 1.1) * TILE * this.zoom * flick;
      const x = this._sx(s.x) - FIELD.x, y = this._sy(s.y) - 8 * this.zoom - FIELD.y;
      const grd = g.createRadialGradient(x, y, r * 0.25, x, y, r);
      grd.addColorStop(0, 'rgba(0,0,0,1)');
      grd.addColorStop(0.55, 'rgba(0,0,0,0.75)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    g.globalCompositeOperation = 'source-over';
    ctx.drawImage(dc, FIELD.x, FIELD.y);
  }

  _drawTerrain(ctx, left, top, cols, rows) {
    const enc = this.enc;
    const map = enc.map;
    const hasTiles = map && typeof map.at === 'function' && typeof Tiles.drawTile === 'function';
    const palette = BIOME_FLOOR[enc.biome] || BIOME_FLOOR.plains;

    for (let j = 0; j < rows; j++) {
      const ty = top + j;
      for (let i = 0; i < cols; i++) {
        const tx = left + i;
        const px = tx * TILE, py = ty * TILE;
        const inside = tx >= 0 && ty >= 0 && tx < enc.w && ty < enc.h;

        if (!inside) {
          ctx.fillStyle = '#06070d';
          ctx.fillRect(px, py, TILE, TILE);
          continue;
        }

        if (hasTiles) {
          safe(() => {
            const id = map.at('ground',tx,ty);
            if (!drawGroundSurface(ctx,map,id,px,py,tx,ty)) Tiles.drawTile(ctx, id, px, py, tx, ty);
          });
        } else {
          const flags = safe(() => map?.flagAt(tx, ty), 0) || 0;
          // Rules-only arenas use the world's authored surfaces too. Texture is
          // decorative; only the encounter's flags decide cost and collision.
          const surfaces={city:'COBBLE',road:'DIRT_PATH',ruins:'STONE_FLOOR_CRACKED',dungeon:'STONE_FLOOR',
            cave:'CAVE_FLOOR',mine:'CAVE_FLOOR',underdark:'CAVE_FLOOR',crypt:'STONE_FLOOR',
            coast:'SAND',desert:'SAND',marsh:'MUD',tundra:'SNOW',mountain:'GRAVEL',forest:'GRASS_2'};
          const surface=flags&TILE_FLAGS.WATER?'WATER':flags&TILE_FLAGS.SLOW?'GRAVEL':surfaces[enc.biome]||'GRASS';
          if(Tiles.T[surface]!=null)Tiles.drawTile(ctx,Tiles.T[surface],px,py,tx,ty);
          else {ctx.fillStyle=palette[0];ctx.fillRect(px,py,TILE,TILE);}
          if (flags & TILE_FLAGS.SOLID) {
            Tiles.drawTile(ctx,Tiles.T.STONE_WALL,px,py,tx,ty);
          }
        }

        // Difficult terrain, marked ALWAYS — not just while the move range is up.
        // Every foot here costs two, so it is the single biggest reason a route
        // bends: the pathfinder walks around a mud patch and, with nothing drawn
        // to say why, the preview just looks broken. A permanent chevron hatch
        // makes the detour legible before the player ever opens the move menu.
        const f = safe(() => map?.flagAt(tx, ty), 0) || 0;
        if ((f & TILE_FLAGS.SLOW) && !(f & TILE_FLAGS.SOLID)) {
          ctx.fillStyle = 'rgba(24,16,8,0.30)';
          for (let o = 0; o < TILE; o += 4) {
            ctx.fillRect(px + o, py + TILE - 2, 2, 1);
            ctx.fillRect(px + o + 1, py + TILE - 3, 2, 1);
          }
          ctx.fillStyle = 'rgba(255,232,170,0.16)';
          for (let o = 2; o < TILE; o += 4) ctx.fillRect(px + o, py + 3, 1, TILE - 7);
        }
      }
    }
  }

  _drawGroundAccents(ctx,left,top,cols,rows) {
    const map=this.enc.map;
    if(!map?.at)return;
    drawGroundDetails(ctx,map,{x:0,y:0},this.enc.w*TILE,this.enc.h*TILE);
    for(let y=Math.max(0,top);y<Math.min(this.enc.h,top+rows);y++)
      for(let x=Math.max(0,left);x<Math.min(this.enc.w,left+cols);x++){
        const d=map.at('deco',x,y);
        if(d&&!isTreeTile(d))Tiles.drawTile(ctx,d,x*TILE,y*TILE,x,y);
      }
    ctx.save();ctx.translate(left*TILE,top*TILE);
    drawDungeonScenery(ctx,map,{x:left*TILE,y:top*TILE},cols*TILE,rows*TILE);
    ctx.restore();
  }

  _drawGrid(ctx, left, top, cols, rows) {
    if (Save?.settings?.showGrid === false) return;
    const enc = this.enc;
    ctx.fillStyle = 'rgba(240,235,215,0.10)';
    for (let i = 0; i <= cols; i++) {
      const tx = left + i;
      if (tx < 0 || tx > enc.w) continue;
      const x = R(this._sx(tx * TILE));
      if (x < FIELD.x - 1 || x > FIELD.x + FIELD.w) continue;
      ctx.fillRect(x, FIELD.y, 1, FIELD.h);
    }
    for (let j = 0; j <= rows; j++) {
      const ty = top + j;
      if (ty < 0 || ty > enc.h) continue;
      const y = R(this._sy(ty * TILE));
      if (y < FIELD.y - 1 || y > FIELD.y + FIELD.h) continue;
      ctx.fillRect(FIELD.x, y, FIELD.w, 1);
    }
  }

  /** Fill one grid square in screen space. */
  /** '#rrggbb' plus an alpha, as an rgba() string. Memoised per colour. */
  _rgba(hex, a) {
    this._rgbCache = this._rgbCache || new Map();
    let c = this._rgbCache.get(hex);
    if (!c) {
      let h = String(hex || '#ffffff').replace('#', '');
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      const n = parseInt(h, 16) || 0;
      c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      this._rgbCache.set(hex, c);
    }
    return `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(2)})`;
  }

  _fillTile(ctx, tx, ty, color, inset = 0) {
    const s = this._tileScreen(tx, ty);
    const w = R(TILE * this.zoom) - inset * 2;
    if (s.x + w < FIELD.x || s.x > FIELD.x + FIELD.w || s.y + w < FIELD.y || s.y > FIELD.y + FIELD.h) return;
    ctx.fillStyle = color;
    ctx.fillRect(s.x + inset, s.y + inset, w, w);
  }

  _strokeTile(ctx, tx, ty, color, t = 1) {
    const s = this._tileScreen(tx, ty);
    const w = R(TILE * this.zoom);
    UI.rectStroke(ctx, s.x, s.y, w, w, color, t);
  }

  _drawTacticalOverlays(ctx) {
    const enc = this.enc;
    const unit = enc.current;

    // --- where something can reach you -------------------------------------
    // Drawn in menu and target too, faintly: "should I attack from here or step
    // back first" is the same question as "where is it safe to stand", and it
    // was only ever answered while the move cursor happened to be up.
    if (unit && this.threat && this.threat.size
      && (this.phase === 'menu' || this.phase === 'target')) {
      for (const k of this.threat) {
        const c = k.split(',');
        const tx = +c[0], ty = +c[1];
        const sc = this._tileScreen(tx, ty);
        const w = R(TILE * this.zoom);
        ctx.fillStyle = 'rgba(232,110,90,0.28)';
        for (let i = 0; i < w; i += 4) {
          ctx.fillRect(sc.x + i, sc.y, 2, 1);
          ctx.fillRect(sc.x + i, sc.y + w - 1, 2, 1);
        }
      }
    }

    // --- movement range ----------------------------------------------------
    if (this.phase === 'move' && unit) {
      for (const [k, node] of this.reach) {
        const provokes = this.provoke.has(k);
        this._fillTile(ctx, node.x, node.y, provokes ? 'rgba(200,60,45,0.26)' : 'rgba(70,140,230,0.24)');
        if (node.difficult) {
          // Difficult terrain: a hatch so it reads without a second colour.
          const s = this._tileScreen(node.x, node.y);
          const w = R(TILE * this.zoom);
          ctx.fillStyle = 'rgba(230,200,120,0.22)';
          for (let i = 0; i < w; i += 4) ctx.fillRect(s.x + i, s.y, 1, w);
        }
        // A square inside something's reach gets a red keyline. Fill answers
        // "can I get there"; the keyline answers "will I be in melee when I
        // arrive" — the question that actually decides where you stand.
        if (this.threat.has(k)) {
          const s = this._tileScreen(node.x, node.y);
          const w = R(TILE * this.zoom);
          ctx.fillStyle = 'rgba(232,110,90,0.75)';
          for (let i = 0; i < w; i += 3) {
            ctx.fillRect(s.x + i, s.y, 2, 1);
            ctx.fillRect(s.x + i, s.y + w - 1, 2, 1);
            ctx.fillRect(s.x, s.y + i, 1, 2);
            ctx.fillRect(s.x + w - 1, s.y + i, 1, 2);
          }
        }
      }
      this._drawPath(ctx, unit);
    }

    // --- targeting ---------------------------------------------------------
    if (this.phase === 'target' && this.pending) {
      const area = this._isAreaOption(this.pending);
      if (area) {
        for (const c of this.areaCells) this._fillTile(ctx, c.x, c.y, 'rgba(230,150,60,0.30)');
        for (const c of this.areaCells) this._strokeTile(ctx, c.x, c.y, 'rgba(255,200,110,0.35)');
        for (const v of this.areaVictims) {
          for(const p of footprintTiles(v))this._strokeTile(ctx,p.x,p.y,v.side==='party'?UI.COLORS.blue:UI.COLORS.gold,1);
        }
      } else {
        const valid = new Set(this.targets.units.map((u) => u.uid));
        for (const u of enc.units || []) {
          if (!u || u._fled || isDead(u)) continue;
          const p = posOf(u);
          if (valid.has(u.uid)) {
            const chosen = this.targets.units[this.targetIndex] === u;
            const s = this._tileScreen(p.x, p.y);
            const w = R(TILE * this.zoom * footprintSize(u));
            if (chosen) UI.frameSel(ctx, s.x, s.y, w, w, this.t);
            else UI.rectStroke(ctx, s.x, s.y, w, w, UI.COLORS.goldDim, 1);
          } else if (u !== unit) {
            for(const c of footprintTiles(u))this._fillTile(ctx,c.x,c.y,'rgba(6,7,13,0.42)');
          }
        }
      }
    }

    // --- spell zones ---------------------------------------------------------
    // Fog, darkness, briars, a wall of force. Drawn under the tactical overlays
    // so the movement range still reads on top of them, and in the spell's own
    // authored colour so a fog cloud and a cloud of darkness are not the same
    // grey square. Without this a caster spends a slot and sees nothing.
    const zones = enc.zones;
    if (Array.isArray(zones) && zones.length) {
      for (const z of zones) {
        const col = (z.vfx && z.vfx.color) || '#c8ccd4';
        const dark = z.tag === 'darkness';
        const solid = !!z.mech.blocksMovement;
        // Heavy obscurement is a wall you cannot see through: paint it nearly
        // opaque. A wall of force is a hard edge. Briars are a hatch.
        const fill = dark ? 0.82 : z.mech.heavilyObscured ? 0.62 : solid ? 0.5 : 0.26;
        const drift = Math.sin(this.t * 0.9 + z.tiles.length) * 0.04;
        for (const c of z.tiles) {
          this._fillTile(ctx, c.x, c.y, this._rgba(col, clamp(fill + drift, 0.1, 0.92)));
        }
        if (z.mech.difficultTerrain) {
          for (const c of z.tiles) {
            const s = this._tileScreen(c.x, c.y);
            const w = R(TILE * this.zoom);
            ctx.fillStyle = this._rgba(col, 0.5);
            for (let i = 0; i < w; i += 4) ctx.fillRect(s.x + i, s.y, 1, w);
          }
        }
        if (solid) for (const c of z.tiles) this._strokeTile(ctx, c.x, c.y, this._rgba(col, 0.9), 1);
      }
    }

    // --- hazards -------------------------------------------------------------
    // A tile that burns or drowns you should say so before you stand on it,
    // not after. Drawn under everything else, always — a hazard you can only
    // see while the move cursor is up is a trap, not terrain.
    const haz = enc.map && enc.map.hazards;
    if (Array.isArray(haz) && haz.length) {
      const pulse = 0.20 + 0.10 * Math.sin(this.t * 4);
      for (const h of haz) {
        const col = /fire|lava|ember|brazier|coal/i.test(String(h.type || '')) ? '230,110,40'
          : /acid|bog|mire|slime/i.test(String(h.type || '')) ? '150,200,60'
            : /ice|frost/i.test(String(h.type || '')) ? '150,220,255' : '210,90,70';
        for (const c of h.tiles || []) {
          this._fillTile(ctx, c.x, c.y, `rgba(${col},${pulse.toFixed(2)})`);
          const s = this._tileScreen(c.x, c.y);
          const w = R(TILE * this.zoom);
          ctx.fillStyle = `rgba(${col},0.5)`;
          for (let i = 0; i < w; i += 4) { ctx.fillRect(s.x + i, s.y, 2, 1); ctx.fillRect(s.x + i, s.y + w - 1, 2, 1); }
        }
      }
    }

    // --- pointing at the field from the menu ---------------------------------
    if (this.phase === 'menu' && unit) {
      if (this.hoverMove) {
        const k = key(this.hoverMove.x, this.hoverMove.y);
        this._fillTile(ctx, this.hoverMove.x, this.hoverMove.y, this.provoke.has(k) ? 'rgba(200,60,45,0.30)' : 'rgba(70,140,230,0.28)');
        this._drawPath(ctx, unit, this.hoverMove);
      }
      if (this.hoverAttack) {
        const p = posOf(this.hoverAttack.unit);
        const s = this._tileScreen(p.x, p.y);
        const w = R(TILE * this.zoom);
        UI.frameSel(ctx, s.x, s.y, w, w, this.t, { color: UI.COLORS.red });
      }
    }

    // --- the acting creature -----------------------------------------------
    if (unit && (this.phase === 'menu' || this.phase === 'move' || this.phase === 'target')) {
      const p = posOf(unit);
      const s = this._tileScreen(p.x, p.y);
      const w = R(TILE * this.zoom);
      UI.rectStroke(ctx, s.x, s.y, w, w, unit.side === 'foe' ? UI.COLORS.red : UI.COLORS.blue, 1);
    }

    // --- the cursor --------------------------------------------------------
    if (this.phase === 'move' || this.phase === 'target') {
      const s = this._tileScreen(this.cursor.x, this.cursor.y);
      const w = R(TILE * this.zoom);
      UI.frameSel(ctx, s.x, s.y, w, w, this.t, { color: UI.COLORS.goldBright });
    }
  }

  _drawPath(ctx, unit, at) {
    const to = at || this.cursor;
    const node = this.reach.get(key(to.x, to.y));
    if (!node) return;
    const start = posOf(unit);
    const pts = [{ x: start.x, y: start.y }, ...(node.path || [])];
    const half = (TILE * this.zoom) / 2;
    const provokes = this.provoke.has(key(to.x, to.y));
    const col = provokes ? '#ff8a72' : '#a8d4ff';

    // Dotted line: a dot every third pixel along each leg.
    for (let i = 0; i < pts.length - 1; i++) {
      const a = this._tileScreen(pts[i].x, pts[i].y);
      const b = this._tileScreen(pts[i + 1].x, pts[i + 1].y);
      const ax = a.x + half, ay = a.y + half, bx = b.x + half, by = b.y + half;
      const d = Math.hypot(bx - ax, by - ay);
      const steps = Math.max(1, Math.round(d / 3));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const px = R(ax + (bx - ax) * t), py = R(ay + (by - ay) * t);
        if (((s + Math.floor(this.t * 8)) % 2) !== 0) continue;
        ctx.fillStyle = '#0a0708';
        ctx.fillRect(px - 1, py - 1, 3, 3);
        ctx.fillStyle = col;
        ctx.fillRect(px, py, 1, 1);
      }
    }

    // Foot count at the destination.
    const end = this._tileScreen(to.x, to.y);
    const label = `${node.cost} ft`;
    const lw = UI.measure(label, 'sm') + 6;
    const lx = clamp(end.x + half - lw / 2, FIELD.x + 2, FIELD.x + FIELD.w - lw - 2);
    const ly = clamp(end.y - 11, FIELD.y + 2, FIELD.y + FIELD.h - 12);
    UI.panel(ctx, lx, ly, lw, 10, { style: 'dark', shadow: 0.4, studs: false });
    UI.text(ctx, lx + lw / 2, ly + 2, label, { size: 'sm', color: provokes ? '#ff9a86' : UI.COLORS.ink, align: 'center' });
  }

  _drawUnits(ctx) {
    const enc = this.enc;
    const list = (enc.units || []).filter((u) => u && !u._fled && this.ui.get(u.uid));
    list.sort((a, b) => (this._uiOf(a).y - this._uiOf(b).y) || (a.uid < b.uid ? -1 : 1));

    const origin=this._origin();
    const bodies=list.filter(u=>this._uiOf(u).alpha>0.02).map(u=>{
      const st=this._uiOf(u),r=this._unitBounds(u);
      return {x:st.x,y:st.y,left:(r.x-origin.x)/this.zoom,right:(r.x+r.w-origin.x)/this.zoom,
        top:(r.y-origin.y)/this.zoom,bottom:(r.y+r.h-origin.y)/this.zoom};
    });
    const trees=visibleTrees(enc.map,{x:(FIELD.x-origin.x)/this.zoom,y:(FIELD.y-origin.y)/this.zoom,w:FIELD.w/this.zoom,h:FIELD.h/this.zoom},bodies);
    const drawNextTree=()=>drawTree(ctx,trees.shift(),{x:-origin.x/this.zoom,y:-origin.y/this.zoom},this.zoom,bodies);
    for (const u of list) {
      const s = this._uiOf(u);
      while(trees.length&&trees[0].py<=s.y)drawNextTree();
      if (!s || s.alpha <= 0.02) continue;
      const x = R(this._sx(s.x) + s.ox);
      const y = R(this._sy(s.y) + s.oy);
      if (x < FIELD.x - 40 || x > FIELD.x + FIELD.w + 40) continue;
      if (y < FIELD.y - 60 || y > FIELD.y + FIELD.h + 40) continue;

      const dead = isDead(u);
      const down = u.hp <= 0 && !dead;
      // Whole-number scales only: a fractional one resamples the sprite to mush.
      const scale = Math.max(1, Math.round(this.zoom * sizeScale(u)));
      const tint = s.flash > 0.02 ? (s.flashColor || '#ff5a4a') : null;

      // The channelling glow sits under the caster, in the spell's colour.
      if (s.cast) {
        const k = Math.min(1, s.cast.t / 0.15) * (1 - Math.max(0, (s.cast.t - s.cast.dur + 0.15) / 0.15));
        const rad = (7 + Math.sin(s.cast.t * 14) * 1.5) * this.zoom;
        ctx.save();
        ctx.globalAlpha = 0.55 * k;
        ctx.strokeStyle = s.cast.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(x, y - 1, rad, rad * 0.45, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 0.22 * k;
        ctx.fillStyle = s.cast.color;
        ctx.beginPath(); ctx.ellipse(x, y - 1, rad * 0.8, rad * 0.36, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }

      // A toppled body: the swing to the ground overshoots a touch and settles,
      // which is what makes it a fall instead of a rotation. Foes fall away
      // from the party's side of the field, party members toward it.
      const rotate = this._unitRotation(u);
      const animation = !u.monsterId && !down && !dead
        ? s.recoil ? {pose:'hurt',poseT:s.recoil.t/s.recoil.dur}
        : s.cast ? {pose:'cast',poseT:s.cast.t/s.cast.dur}
        : s.swing ? {pose:'attack',poseT:s.swing.t/s.swing.dur}
        : s.lunge ? {pose:s.rangedPose?'shoot':'attack',poseT:s.lunge.t/s.lunge.dur}
        : {} : {};

      safe(() => drawActor(ctx, u, x, y, {
        ...animation,
        dir: s.dir,
        phase: Math.floor(s.phase),
        moving: s.moving,
        scale,
        alpha: s.alpha * (down ? 0.8 : 1),
        tint: dead && s.corpse ? '#2a1c22' : tint,
        tintAmt: dead && s.corpse ? 0.55 : s.flash * 0.75,
        shadow: !dead,
        rotate,
        // The sprite has its own left-facing frames, so never flip it — but
        // the swing needs to know which way the arc goes.
        swing: s.swingAngle || 0,
        facingLeft: s.dir === 'left',
      }));

      if (!dead) this._drawUnitTag(ctx, u, x, y, scale);
    }
    while(trees.length)drawNextTree();
  }

  /**
   * Combatants the camera cannot show you.
   *
   * The camera pans to whoever is acting, and a wide arena at 2x zoom fits about
   * twelve tiles across. So it is entirely possible — it happened — to open
   * Attack, be told "no legal target in range", and have nothing on screen to
   * explain it: the enemy was thirty feet off the left edge and the game never
   * said so. A pinned arrow with a distance is the whole fix.
   */
  _drawOffscreen(ctx) {
    const enc = this.enc;
    if (!enc || !Array.isArray(enc.units)) return;
    const pad = 8;
    // The box the chevrons slide along: the field, less the target card and
    // the detail plate while they are up, so an arrow never hides under one.
    const card = this._statR && this.inspect ? this._statR : null;
    const L = FIELD.x + pad;
    const R2 = FIELD.x + FIELD.w - pad;
    const T = FIELD.y + pad + (this.boss ? 12 : 0);
    const B = FIELD.y + FIELD.h - pad - 10;
    const cx = (L + R2) / 2, cy = (T + B) / 2;
    const cur = enc.current || null;

    for (const u of enc.units) {
      if (!u || u._fled || isDead(u)) continue;
      const st = this.ui.get(u.uid);
      if (!st || st.alpha <= 0.05) continue;
      const sx = this._sx(st.x), sy = this._sy(st.y);
      if (sx >= FIELD.x - 8 && sx <= FIELD.x + FIELD.w + 8
        && sy >= FIELD.y - 4 && sy <= FIELD.y + FIELD.h + 24) continue;

      // Where the line from the middle of the field to the unit leaves the box.
      const dx = sx - cx, dy = sy - cy;
      const tx = dx === 0 ? Infinity : Math.max((L - cx) / dx, (R2 - cx) / dx);
      const ty = dy === 0 ? Infinity : Math.max((T - cy) / dy, (B - cy) / dy);
      const k = Math.min(tx, ty);
      if (!Number.isFinite(k)) continue;
      let ex = R(cx + dx * k), ey = R(cy + dy * k);
      if (card && ex < card.x + card.w + 6 && ey < card.y + card.h + 6) ey = card.y + card.h + 8;

      const foe = u.side !== 'party';
      const col = foe ? SIDE_COLOR.foe : SIDE_COLOR.party;
      const pulse = 0.7 + 0.3 * Math.sin(this.t * 4 + (hashStr(u.uid) % 100) / 16);
      const ang = Math.atan2(dy, dx);
      ctx.save();
      ctx.translate(ex, ey);
      ctx.rotate(ang);
      ctx.globalAlpha = pulse;
      ctx.fillStyle = KEY;
      ctx.beginPath(); ctx.moveTo(5.5, 0); ctx.lineTo(-4.5, -4.5); ctx.lineTo(-2.5, 0); ctx.lineTo(-4.5, 4.5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(-3.2, -3.2); ctx.lineTo(-1.6, 0); ctx.lineTo(-3.2, 3.2); ctx.closePath(); ctx.fill();
      ctx.restore();

      // Name and distance from whoever is acting: whether it is worth the walk.
      if (cur && cur !== u) {
        const ft = safe(() => distanceFt(cur, u), 0) || 0;
        const label = `${UI.fit(u.name || '?', 44, 'fine')} ${ft}ft`;
        const lw = UI.measure(label, 'fine') + 3;
        const lx = clamp(ex - lw / 2, FIELD.x + 1, FIELD.x + FIELD.w - lw - 1);
        const ly = clamp(ey + (dy > 0 ? -10 : 6), FIELD.y + 1, FIELD.y + FIELD.h - 7);
        ctx.fillStyle = 'rgba(6,5,10,0.78)';
        ctx.fillRect(R(lx), R(ly) - 1, R(lw), 6);
        UI.text(ctx, R(lx) + lw / 2, R(ly), label, { size: 'fine', color: col, align: 'center', shadow: false });
      }
    }
  }

  /**
   * The floating HP sliver, conditions and marker above a combatant. The unit
   * pass calls this as it paints each creature; it only records the anchor,
   * and _drawWorldUI draws the tags on 'world-ui' at fine resolution, over
   * everything the world paints (a tag under a roof or a spell flash is a tag
   * you cannot read).
   */
  _drawUnitTag(ctx, u, x, y, scale) {
    (this._tags || (this._tags = [])).push({ u, x, y, scale });
  }

  /** World-anchored interface: the tags recorded by the unit pass. */
  _drawWorldUI(ctx) {
    const tags = this._tags || [];
    for (const t of tags) safe(() => this._drawTag(ctx, t.u, t.x, t.y, t.scale));
    tags.length = 0;
  }

  _drawTag(ctx, u, x, y, scale) {
    const body = this._unitBounds(u);
    const bw = 18;
    const bx = R(x - bw / 2);
    // A creature in the top rows would lose its whole tag off the top of the
    // field; pack it downward instead.
    const by = Math.max(FIELD.y + 11, R(body.y - 6));
    const p = hpPct(u);

    meter(ctx, bx, by, bw, 2, p, {
      id: `tag:${u.uid}`, color: u.side === 'party' ? '#5fc86a' : INK.hp, bg: '#1c0d0c',
    });
    if (u.tempHp > 0) {
      ctx.fillStyle = UI.COLORS.temp;
      ctx.fillRect(bx + Q, by + Q, Math.max(Q, (bw - 1) * clamp(u.tempHp / Math.max(1, maxHpOf(u)), 0, 1)), Q);
    }

    if (u.hp <= 0 && !isDead(u)) {
      // Dying: the skull and the death saves are the whole story.
      UI.icon(ctx, 'skull', bx + bw / 2 - 3.5, by - 8, 7, UI.COLORS.inkDim);
      const ds = u.deathSaves || { success: 0, fail: 0 };
      for (let i = 0; i < 3; i++) {
        gem(ctx, bx + 1 + i * 3, by - 2.5, 1, UI.COLORS.good, i < (ds.success || 0));
        gem(ctx, bx + bw - 1 - i * 3, by - 2.5, 1, UI.COLORS.bad, i < (ds.fail || 0));
      }
      return;
    }

    let top = by - 0.5;
    const lift = (n) => { top = Math.max(FIELD.y + 1 + n, top - n); };

    // Condition dots: colour only, so a stack of five still fits over a sprite.
    const badges = safe(() => conditionBadges(u), []) || [];
    if (badges.length) {
      let cx = bx;
      for (let i = 0; i < Math.min(6, badges.length); i++) {
        ctx.fillStyle = KEY; ctx.fillRect(cx - Q, top - 3, 2.5, 2.5);
        ctx.fillStyle = badges[i].color || UI.COLORS.purple; ctx.fillRect(cx, top - 2.5, 1.5, 1.5);
        cx += 3;
      }
      lift(3.5);
    }
    if (u.concentration) UI.icon(ctx, 'rune', bx + bw + 1, by - 2.5, 6, UI.COLORS.purple);

    // The unit you are looking at, aiming at or acting as gets the numbers:
    // whether one more hit finishes it is what decides where the action goes.
    const focus = this.phase === 'target' ? this.targets.units[this.targetIndex]
      : (this.inspectPinned || this.inspectHover) && this.inspect ? this.inspect : this.enc.current;
    if (focus === u) {
      const max = safe(() => maxHpOf(u), u.maxHp || 1) || 1;
      const label = `${Math.max(0, u.hp)}/${max}`;
      const lw = UI.measure(label, 'fineb') + 3;
      const lx = R(x - lw / 2);
      ctx.fillStyle = 'rgba(6,5,10,0.8)';
      ctx.fillRect(lx, top - 6.5, lw, 6);
      UI.text(ctx, x, top - 5.5, label, {
        size: 'fineb', align: 'center', shadow: false,
        color: p <= 0.25 ? UI.COLORS.bad : p <= 0.5 ? UI.COLORS.warn : UI.COLORS.ink,
      });
      lift(7.5);
    }

    if (this.enc.currentUid === u.uid) {
      // The acting creature's chevron: a gilt pennant point, bobbing.
      const bob = Math.round(Math.sin(this.t * 5) * 1.5 * 2) / 2;
      const cy = top - 5 + bob;
      ctx.fillStyle = KEY;
      for (let i = 0; i < 4; i++) ctx.fillRect(x - 3 + i * Q, cy - Q + i * Q, 6 - i, Q * 2);
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = i < 2 ? GILT.hi : GILT.base;
        ctx.fillRect(x - 2.5 + i * Q, cy + i * Q, 5 - i, Q);
      }
    } else if (u._unaware && u.side === 'foe') {
      // Not yet aware of you: the one to open on, and it will not stay so.
      UI.text(ctx, x, top - 6, '?', { size: 'fineb', color: UI.COLORS.inkDim, align: 'center', shadow: true });
    }
  }

  // --- the bands -----------------------------------------------------------

  /** The two bands the interface lives in, each with a gilt rule on the field edge. */
  _drawBands(ctx) {
    UI.vgrad(ctx, 0, 0, VIEW_W, TOP_H, '#17121a', '#0c0a0f');
    UI.vgrad(ctx, 0, BAND_Y, VIEW_W, BOT_H, '#0c0a0f', '#17121a');
    grain(ctx, 'vellum', 0, 0, VIEW_W, TOP_H, 0.5);
    grain(ctx, 'vellum', 0, BAND_Y, VIEW_W, BOT_H, 0.5);
    ctx.fillStyle = KEY;
    ctx.fillRect(0, TOP_H - 1, VIEW_W, 1);
    ctx.fillRect(0, BAND_Y, VIEW_W, 1);
    giltRule(ctx, 0, TOP_H - 1, VIEW_W, 0.8);
    giltRule(ctx, 0, BAND_Y + Q, VIEW_W, 0.8);
    ctx.fillStyle = 'rgba(168,40,30,0.45)';
    ctx.fillRect(0, TOP_H - 2, VIEW_W, Q);
    ctx.fillRect(0, BAND_Y + 1.5, VIEW_W, Q);
    // the shadow each band throws on the field
    ctx.fillStyle = 'rgba(0,0,0,0.30)'; ctx.fillRect(0, TOP_H, VIEW_W, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.14)'; ctx.fillRect(0, TOP_H + 1, VIEW_W, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.30)'; ctx.fillRect(0, BAND_Y - 1, VIEW_W, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.14)'; ctx.fillRect(0, BAND_Y - 2, VIEW_W, 1);
  }

  // --- initiative rail -----------------------------------------------------

  /**
   * The rail reads left to right from the creature acting now: its token is
   * larger and gilt, then everyone still to come, a round marker where the
   * order wraps, and the rest. When a turn ends the tokens slide up one place
   * and the one that just acted drops in at the far end.
   */
  _drawRail(ctx) {
    const enc = this.enc;
    const now = this.t;
    const dt = clamp(now - (this._railT ?? now), 0, 0.1);
    this._railT = now;
    const X = RAIL.x, Y = RAIL.y;

    // The round: a wax seal with its number in the display face.
    const sx = X + 8.5, sy = Y + 8.5;
    UI.seal(ctx, sx, sy, { r: 7.5, color: RUBRIC.base });
    UI.text(ctx, sx, sy - 4, String(enc.round || 1), { size: 'title', gilt: true, align: 'center', shadow: 'rgba(40,6,4,0.9)' });

    const order = (enc.order || []).map((uid) => (enc.byUid ? enc.byUid(uid) : null)).filter((u) => u && !u._fled && !isDead(u));
    let ci = order.findIndex((u) => u.uid === enc.currentUid);
    if (ci < 0) ci = 0;
    const limit = this._railEnd();
    const slots = [];
    let x = X + 20;
    for (let k = 0; k < order.length; k++) {
      const u = order[(ci + k) % order.length];
      if (k > 0 && (ci + k) % order.length === 0) {
        slots.push({ mark: true, x });            // the round turns over here
        x += 7;
      }
      const cur = k === 0 && u.uid === enc.currentUid;
      const s = cur ? 15 : 12;
      slots.push({ u, x, s, cur });
      x += s + (cur ? 3 : 2);
    }

    this._rail = this._rail || new Map();
    this._railHits = [];
    const seen = new Set();
    let hidden = 0;
    UI.pushClip(ctx, X + 18, 0, Math.max(0, limit - X - 18), TOP_H);
    for (const sl of slots) {
      if (sl.mark) {
        if (sl.x > limit - 4) continue;
        // a gilt rule and a gem: "next round starts here"
        ctx.fillStyle = GILT.lo; ctx.fillRect(sl.x + 2.5, Y + 2, Q, 13);
        gem(ctx, sl.x + 2.75, Y + 8.5, 2, GILT.base);
        continue;
      }
      const u = sl.u;
      seen.add(u.uid);
      let st = this._rail.get(u.uid);
      // A token that jumped more than a couple of places (the one that just
      // acted, going to the back) drops in rather than sliding across the rail.
      if (!st || Math.abs(st.x - sl.x) > 40) { st = { x: sl.x, a: st ? 0 : 1, drop: st ? 1 : 0 }; this._rail.set(u.uid, st); }
      st.x = Math.abs(st.x - sl.x) < 0.25 ? sl.x : lerp(st.x, sl.x, Math.min(1, dt * 12));
      st.a = Math.min(1, st.a + dt * 5);
      st.drop = Math.max(0, st.drop - dt * 5);
      if (sl.x > limit - 6) { hidden++; continue; }
      const px = R(st.x * 2) / 2;
      const py = (sl.cur ? Y + Q : Y + 2) - R(st.drop * 6);
      const s = sl.s;
      const down = u.hp <= 0;
      ctx.save();
      ctx.globalAlpha *= st.a;
      if (sl.cur) {
        // lamplight round the acting creature
        const k = 0.22 + 0.1 * Math.sin(now * 4);
        ctx.fillStyle = `rgba(242,210,122,${k * 0.5})`; ctx.fillRect(px - 2, py - 1.5, s + 4, s + 3);
        ctx.fillStyle = `rgba(242,210,122,${k})`; ctx.fillRect(px - 1, py - 1, s + 2, s + 2);
      }
      token(ctx, u, px, py, s, { current: sl.cur, dim: down, down });
      hpPips(ctx, px + 0.5, py + s + 1, s - 1, u);
      if (this.inspect === u && !sl.cur) {
        ctx.fillStyle = GILT.spec;
        hairFrame(ctx, px - 1, py - 1, s + 2, s + 2, GILT.spec, GILT.hi);
      }
      // conditions in the top-right corner, concentration top-left
      const badges = safe(() => conditionBadges(u), []) || [];
      let bxx = px + s - 2;
      for (let i = 0; i < Math.min(3, badges.length); i++) {
        ctx.fillStyle = KEY; ctx.fillRect(bxx - Q, py - Q, 2.5, 2.5);
        ctx.fillStyle = badges[i].color || UI.COLORS.purple; ctx.fillRect(bxx, py, 1.5, 1.5);
        bxx -= 2.5;
      }
      if (u.concentration) gem(ctx, px + 1, py + 1, 1.5, '#b07ae0');
      ctx.restore();
      this._railHits.push({ x: px - 1, y: 0, w: s + 2, h: TOP_H, u });
    }
    UI.popClip(ctx);
    for (const uid of [...this._rail.keys()]) if (!seen.has(uid)) this._rail.delete(uid);

    const right = Math.min(x, limit);
    if (hidden) {
      UI.text(ctx, right - 1, Y + 6, `+${hidden}`, { size: 'fineb', color: GILT.base, align: 'right', shadow: true });
    }
    Layout.rect('battle.rail', { w: Math.max(40, right - X) });
  }

  /** The creature under a point of the rail, if any (the hit-test the draw recorded). */
  _railAt(mx, my) {
    for (const h of this._railHits || []) {
      if (mx >= h.x && mx < h.x + h.w && my >= h.y && my < h.y + h.h) return h.u;
    }
    return null;
  }

  _inRail(mx, my) {
    return my >= 0 && my < TOP_H && mx >= RAIL.x && mx < this._railEnd();
  }

  /** Where the rail must stop: short of the log tail when that is to its right. */
  _railEnd() {
    return this._logVisible && LOGTAIL.x > RAIL.x && Math.abs(LOGTAIL.y - RAIL.y) < TOP_H ? LOGTAIL.x - 5 : VIEW_W - 3;
  }

  _drawBossBar(ctx) {
    const b = this.boss;
    const w = 190, h = 10;
    const x = R((VIEW_W - w) / 2), y = TOP_H + 2;
    plate(ctx, x, y, w, h, { gilt: true, top: '#2a1414', bot: '#150a0a' });
    const name = UI.fit(b.name || 'Boss', 70, 'fineb');
    UI.text(ctx, x + 4, y + 3.5, name, { size: 'fineb', gilt: true, color: GILT.base, shadow: false });
    const bx = x + 7 + UI.measure(name, 'fineb');
    meter(ctx, bx, y + 3, x + w - 4 - bx, 4, hpPct(b), {
      id: 'boss', color: INK.hp, bg: '#1a0d0c', segments: 4,
    });
  }

  // --- the log -------------------------------------------------------------

  /**
   * The last few lines of the log in the fine face at the right of the top
   * band, where they never cover the field. J or a click opens the whole log.
   */
  _drawLogTail(ctx) {
    const all = this.enc?.log || [];
    const L = LOGTAIL;
    const rowH = 5;
    const rows = 3;
    const tx = L.x + 8, tw = L.w - 9;
    keycap(ctx, L.x + 1, L.y + 6, 'J', { dim: !this._logHover });
    const wrapped = [];
    for (let i = all.length - 1; i >= 0 && wrapped.length < rows; i--) {
      const l = all[i];
      const txt = (l && l.text) || '';
      if (!txt) continue;
      const parts = UI.wrapLines(txt, tw, 'fine') || [txt];
      for (let j = parts.length - 1; j >= 0 && wrapped.length < rows; j--) {
        wrapped.push({ text: parts[j], kind: l.kind, age: all.length - 1 - i });
      }
    }
    wrapped.reverse();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(L.x + 6.5, L.y, Q, L.h);
    let y = L.y + L.h - 1 - wrapped.length * rowH;
    for (const w of wrapped) {
      const a = w.age === 0 ? 1 : w.age < 2 ? 0.82 : 0.64;
      UI.text(ctx, tx, y, UI.fit(w.text, tw, 'fine'), {
        size: 'fine', color: LOG_COLORS[w.kind] || UI.COLORS.ink, shadow: false, alpha: a,
      });
      y += rowH;
    }
  }

  _drawLogPanel(ctx) {
    UI.scrim(ctx, 0.72);
    const X = 40, Y = 22, W = VIEW_W - 80, H = VIEW_H - 40;
    UI.window(ctx, X, Y, W, H, 'Battle Log', { style: 'window', shadow: 0.6 });
    const lines = this.enc?.log || [];
    const start = Math.max(0, lines.length - LOG_ROWS - this.logScroll);
    const tx = X + 8, tw = W - 20;
    let y = Y + 10;
    UI.pushClip(ctx, X + 4, Y + 8, W - 8, H - 18);
    for (let i = start; i < Math.min(lines.length, start + LOG_ROWS); i++) {
      const l = lines[i];
      const txt = String(l.text || '');
      if (l.kind === 'round') {
        // A round is a chapter: a rubricated line of its own.
        giltRule(ctx, tx, y + 2, tw, 0.5);
        UI.text(ctx, tx + tw / 2, y, txt.replace(/^[-—\s]+|[-—\s]+$/g, ''), { size: 'fineb', color: UI.COLORS.rubric, align: 'center', shadow: false });
      } else {
        UI.text(ctx, tx, y, UI.fit(txt, tw, 'fine'), { size: 'fine', color: LOG_COLORS[l.kind] || UI.COLORS.ink, shadow: false });
      }
      y += 5;
    }
    UI.popClip(ctx);
    if (lines.length > LOG_ROWS) UI.scrollbar(ctx, X + W - 7, Y + 9, H - 20, start, LOG_ROWS, lines.length);
    let hx = X + W / 2 - 60;
    hx += keycap(ctx, hx, Y + H - 8, UI.G.up) + 1;
    hx += keycap(ctx, hx, Y + H - 8, UI.G.down) + 2;
    UI.text(ctx, hx, Y + H - 7, 'or wheel: scroll', { size: 'fine', color: UI.COLORS.inkDim, shadow: false });
    hx += UI.measure('or wheel: scroll', 'fine') + 6;
    hx += keycap(ctx, hx, Y + H - 8, 'J') + 2;
    UI.text(ctx, hx, Y + H - 7, 'close', { size: 'fine', color: UI.COLORS.inkDim, shadow: false });
  }

  // --- the acting creature -------------------------------------------------

  /** The acting creature's card: face, name, HP, AC, conditions, concentration, slots. */
  _drawUnitCard(ctx) {
    const u = this.enc?.current;
    if (!u) return;
    const X = UNIT.x, Y = UNIT.y, W = UNIT.w, H = UNIT.h;
    const foe = u.side !== 'party';
    plate(ctx, X, Y, W, H, { top: foe ? '#2a1818' : '#1c1f2a', bot: '#110e12' });
    token(ctx, u, X + 2, Y + 2, 22, { scale: 2 });

    const tx = X + 27, right = X + W - 3;
    const max = safe(() => maxHpOf(u), u.maxHp || 1) || 1;
    const def = this._monsterDef(u);
    const known = !def || !u.monsterId || !!(Game.state?.bestiary?.[u.monsterId]);
    const hpTxt = known ? `${Math.max(0, u.hp)}/${max}` : `${Math.round(hpPct(u) * 100)}%`;
    const hpW = UI.measure(hpTxt, 'xs');
    UI.text(ctx, tx, Y + 3, UI.fit(u.name || '?', right - tx - hpW - 3, 'fineb'), {
      size: 'fineb', color: SIDE_INK[foe ? 'foe' : 'party'], shadow: false,
    });
    const p = hpPct(u);
    UI.text(ctx, right, Y + 3.5, hpTxt, {
      size: 'xs', align: 'right', shadow: false,
      color: p <= 0.25 ? UI.COLORS.bad : p <= 0.5 ? UI.COLORS.warn : UI.COLORS.ink,
    });
    meter(ctx, tx, Y + 8.5, right - tx, 3, p, {
      id: `unit:${u.uid}`, color: foe ? INK.hp : '#5fc86a', bg: '#1c0d0c',
    });
    if (u.tempHp > 0) {
      ctx.fillStyle = UI.COLORS.temp;
      ctx.fillRect(tx + Q, Y + 9, Math.max(Q, (right - tx - 1) * clamp(u.tempHp / max, 0, 1)), Q);
    }

    // AC, then conditions, then concentration, on one line.
    let cx = tx;
    const ac = safe(() => acOf(u), 10);
    UI.icon(ctx, 'shield', cx - 0.5, Y + 13, 6, UI.COLORS.silver);
    cx += 6.5;
    UI.text(ctx, cx, Y + 14.5, `AC ${ac}`, { size: 'xs', color: UI.COLORS.ink, shadow: false });
    cx += UI.measure(`AC ${ac}`, 'xs') + 3;
    const badges = safe(() => conditionBadges(u), []) || [];
    for (const b of badges.slice(0, 4)) {
      const nm = UI.fit(String(b.name || '').toUpperCase(), 26, 'xs');
      const w = UI.measure(nm, 'xs') + 4;
      if (cx + w > right - (u.concentration ? 8 : 0)) break;
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(cx, Y + 13.5, w, 5);
      ctx.fillStyle = b.color || UI.COLORS.purple; ctx.fillRect(cx, Y + 13.5, Q, 5);
      UI.text(ctx, cx + 2, Y + 14.5, nm, { size: 'xs', color: b.color || UI.COLORS.purple, shadow: false });
      cx += w + 1.5;
    }
    if (u.concentration) {
      const cName = String(safe(() => getSpell(u.concentration.spellId)?.name, '') || '');
      const cw = cName ? Math.min(40, right - cx - 8) : 0;
      const gx = cName && cw > 8 ? right - 7 - UI.measure(UI.fit(cName.toUpperCase(), cw, 'xs'), 'xs') : right - 5;
      UI.icon(ctx, 'rune', gx - 0.5, Y + 12.5, 6, UI.COLORS.purple);
      if (cName && cw > 8) UI.text(ctx, gx + 6, Y + 14.5, UI.fit(cName.toUpperCase(), cw, 'xs'), { size: 'xs', color: '#c9a8f0', shadow: false });
    }

    // Spell slots as gems, a group per level; otherwise what the creature is.
    const slots = u.spells?.slots || {};
    let gx = tx;
    let any = false;
    for (let lv = 1; lv <= 9; lv++) {
      const s = slots[lv];
      if (!s || !(s.max > 0)) continue;
      if (gx > right - 10) break;
      gx += slotGems(ctx, gx, Y + 22, lv, s, { cap: 4, r: 2 }) + 3;
      any = true;
    }
    if (!any) {
      const sub = def
        ? `${titleCase(u.size || 'medium')} ${def.type || 'creature'}${def.cr != null ? ` · CR ${crText(def.cr)}` : ''}`
        : `Level ${u.level || 1} ${titleCase((u.classes?.[0]?.id) || 'adventurer')}`;
      UI.text(ctx, tx, Y + 20, UI.fit(sub.toUpperCase(), right - tx, 'xs'), { size: 'xs', color: UI.COLORS.inkDim, shadow: false });
    }
  }

  /** Action, Bonus and Reaction as gems; movement as a gauge in feet. */
  _drawBudget(ctx) {
    const unit = this.enc?.current;
    if (!unit) return;
    const b = this._budget();
    const mine = this._isPlayerControlled(unit);
    const X = BUDGET.x, Y = BUDGET.y, W = BUDGET.w;
    plate(ctx, X, Y, W, BUDGET.h, { alpha: mine ? 1 : 0.7 });
    const gems = [
      ['A', 'action', (b.action || 0) > 0],
      ['B', 'bonus', (b.bonus || 0) > 0],
      ['R', 'reaction', (b.reaction || 0) > 0 && !unit._reactionUsed],
    ];
    gems.forEach(([l, k, on], i) => {
      const cx = X + 6 + i * 9.5;
      gem(ctx, cx, Y + 6, 3, COST_GEM[k], on);
      UI.text(ctx, cx, Y + 11, l, { size: 'xs', color: on ? COST_GEM[k] : UI.COLORS.disabled, align: 'center', shadow: false });
    });
    if ((b.attacksLeft || 0) > 1) {
      UI.text(ctx, X + 10, Y + 1.5, `x${b.attacksLeft}`, { size: 'xs', color: GILT.hi, shadow: false });
    }
    const mv = b.movement || 0, mx = b.moveMax || 0;
    const gw = W - 6, gy = Y + 17;
    ctx.fillStyle = KEY; ctx.fillRect(X + 3 - Q, gy - Q, gw + 1, 3);
    ctx.fillStyle = '#10161a'; ctx.fillRect(X + 3, gy, gw, 2);
    const k = mx > 0 ? clamp(mv / mx, 0, 1) : 0;
    ctx.fillStyle = '#5aa8a0'; ctx.fillRect(X + 3, gy, gw * k, 2);
    ctx.fillStyle = '#a8e8d8'; ctx.fillRect(X + 3, gy, gw * k, Q);
    // a tick every five feet, the grid the rules move in
    if (mx > 0 && mx / 5 <= 16) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      for (let f = 5; f < mx; f += 5) ctx.fillRect(R((X + 3 + gw * f / mx) * 2) / 2, gy, Q, 2);
    }
    UI.text(ctx, X + W / 2, Y + 21, `${mv} FT`, { size: 'xs', color: mv > 0 ? '#a8e8d8' : UI.COLORS.disabled, align: 'center', shadow: false });
  }

  // --- the action bar ------------------------------------------------------

  /**
   * Geometry of the bar for these rows, shared by the draw and the hit-test so
   * the two can never disagree. Plates shrink from 24px to 16px before the bar
   * pages; the spell bar leaves a gap between spell levels.
   */
  _barGeom(rows, inSub, idx) {
    const n = rows.length;
    const lvOf = (r) => (r && r.spellId ? (r.level || 0) : null);
    const spellish = inSub && rows.some((r) => r && r.spellId);
    const brk = (i) => spellish && i > 0 && lvOf(rows[i]) !== lvOf(rows[i - 1]);
    let breaks = 0;
    for (let i = 1; i < n; i++) if (brk(i)) breaks++;
    // The bar grows rightward up to the next block in its row (End Turn as
    // designed; the budget or the card when the layout is mirrored).
    let stop = VIEW_W - 2;
    for (const r of [ENDBTN, BUDGET, UNIT]) {
      if (r.x > MENU.x + 20 && Math.abs(r.y - MENU.y) < MENU.h) stop = Math.min(stop, r.x - 2);
    }
    const room = stop - MENU.x;
    const back = inSub ? BAR_BACK : 0;
    const inner = room - BAR_PAD * 2 - back - breaks * LEVEL_GAP;
    let cw = clamp(Math.floor(inner / Math.max(1, n)), VERB_MIN, VERB_MAX);
    let vis = n;
    let paged = false;
    if (cw * n > inner) {
      paged = true;
      cw = VERB_MIN;
      vis = Math.max(1, Math.floor((inner - BAR_PAGER) / cw));
    }
    const top = paged ? Math.floor(clamp(idx, 0, n - 1) / vis) * vis : 0;
    const cells = [];
    let x = MENU.x + BAR_PAD + back;
    for (let k = 0; k < vis && top + k < n; k++) {
      const i = top + k;
      if (k > 0 && brk(i)) x += LEVEL_GAP;
      cells.push({ i, x, y: MENU.y + 2, w: cw - 1, h: MENU.h - 4 });
      x += cw;
    }
    let w = x - MENU.x + BAR_PAD - 1;
    let pager = null;
    if (paged) { pager = { x: x + 1, y: MENU.y + 2, w: BAR_PAGER - 2, h: MENU.h - 4 }; w += BAR_PAGER; }
    return {
      x: MENU.x, y: MENU.y, w, h: MENU.h, cells, top, vis, paged, pager, cw, spellish, lvOf,
      back: inSub ? { x: MENU.x + 2, y: MENU.y + 2, w: BAR_BACK - 1.5, h: MENU.h - 4 } : null,
    };
  }

  _drawMenu(ctx) {
    const enc = this.enc;
    const unit = enc.current;
    if (!unit) return;
    const rows = this._currentRows();
    const inSub = this.menuPath.length > 0;
    const idx = clamp(inSub ? this.subIndex : this.menuIndex, 0, Math.max(0, rows.length - 1));
    const G = this._barGeom(rows, inSub, idx);
    if (inSub) this.subTop = G.top; else this.menuTop = G.top;
    plate(ctx, G.x, G.y, G.w, G.h, { gilt: true });

    if (G.back) {
      const b = G.back;
      UI.vgrad(ctx, b.x, b.y, b.w, b.h, '#2a2019', '#140f0c');
      hairFrame(ctx, b.x, b.y, b.w, b.h, '#6a5230', '#1a120a');
      ctx.fillStyle = GILT.hi;
      const cy = b.y + b.h / 2;
      for (let i = 0; i < 4; i++) ctx.fillRect(b.x + 2 + i * Q, cy - i * Q - Q, Q, i + 1);
    }

    for (const c of G.cells) this._drawVerb(ctx, c, rows[c.i], c.i === idx, inSub);

    // The spell bar reads by level: a tab over each run of plates with the
    // level and its slot gems — "what am I spending?" before "which spell?".
    if (G.spellish && G.cells.length) {
      const slots = unit.spells?.slots || {};
      let run = null;
      const flush = () => {
        if (!run) return;
        const w = run.x1 - run.x0;
        const lv = run.lv;
        const tabY = G.y - 5.5;
        plate(ctx, run.x0, tabY, w, 6.5, { shadow: false, top: lv ? '#2a2036' : '#20242a', bot: '#141018' });
        const s = slots[lv];
        let label = lv === 0 ? (w >= 30 ? 'CANTRIPS' : 'CANT') : ROMAN[lv];
        UI.text(ctx, run.x0 + 2, tabY + 1.5, label, { size: 'xs', color: lv ? '#c9b8f0' : '#b9c1cf', shadow: false });
        if (lv > 0 && s && s.max > 0) {
          const lx = run.x0 + 3 + UI.measure(label, 'xs');
          const room = run.x1 - 2 - lx;
          const cap = Math.max(1, Math.min(4, Math.floor(room / 3.5)));
          slotGems(ctx, lx, tabY + 3, lv, s, { numeral: false, cap });
        }
        run = null;
      };
      for (const c of G.cells) {
        const lv = G.lvOf(rows[c.i]) ?? 0;
        if (run && run.lv === lv) run.x1 = c.x + c.w;
        else { flush(); run = { lv, x0: c.x, x1: c.x + c.w }; }
      }
      flush();
    }

    if (G.pager) {
      const p = G.pager;
      const pages = Math.ceil(rows.length / G.vis);
      const page = Math.floor(G.top / G.vis) + 1;
      UI.text(ctx, p.x + p.w / 2 - 3, p.y + 4, UI.G.chevLeft, { size: 'fine', align: 'center', color: G.top > 0 ? GILT.base : UI.COLORS.disabled, shadow: false });
      UI.text(ctx, p.x + p.w / 2 + 3, p.y + 4, UI.G.chevRight, { size: 'fine', align: 'center', color: page < pages ? GILT.base : UI.COLORS.disabled, shadow: false });
      UI.text(ctx, p.x + p.w / 2, p.y + 12, `${page}/${pages}`, { size: 'xs', align: 'center', color: UI.COLORS.inkDim, shadow: false });
    }
    this._bar = G;
    Layout.rect('battle.menu', { w: G.w });
  }

  /** One verb plate: icon, compact label, keycap, and a gem for what it costs. */
  _drawVerb(ctx, c, r, sel, inSub) {
    if (!r) return;
    const on = r.enabled !== false;
    const accent = !on ? '#555765' : r.move || r.undo ? '#8ec6bd' : r.cost === 'bonus' ? '#8fc497'
      : r.spellId || r.id === '@cast' || String(r.id).startsWith('@cast:') ? '#b5a2e4' : '#d6b271';
    if (sel) {
      const k = 0.2 + 0.08 * Math.sin(this.t * 5);
      ctx.fillStyle = `rgba(242,210,122,${k})`;
      ctx.fillRect(c.x - 1, c.y - 1, c.w + 2, c.h + 2);
    }
    ctx.fillStyle = KEY; ctx.fillRect(c.x, c.y, c.w, c.h);
    UI.vgrad(ctx, c.x + Q, c.y + Q, c.w - 1, c.h - 1,
      sel ? '#5a4422' : on ? '#30251c' : '#1a171c', sel ? '#2a1c0e' : on ? '#17110d' : '#110f13');
    hairFrame(ctx, c.x + Q, c.y + Q, c.w - 1, c.h - 1,
      sel ? GILT.hi : on ? '#6e5634' : '#35303a', sel ? GILT.lo : on ? '#22170c' : '#18151a');
    ctx.fillStyle = sel && on ? GILT.spec : accent;
    ctx.fillRect(c.x + 2, c.y + c.h - 2, c.w - 4, Q);

    const isz = 11;
    UI.icon(ctx, verbIcon(r), c.x + R((c.w - isz) / 2), c.y + 2, isz,
      on ? (sel ? '#fff0c8' : accent) : UI.COLORS.disabled);
    UI.text(ctx, c.x + c.w / 2, c.y + c.h - 6.5, verbLabel(r, c.w - 2).toUpperCase(), {
      size: 'xs', align: 'center', shadow: false,
      color: !on ? UI.COLORS.disabled : sel ? GILT.spec : UI.COLORS.ink,
    });

    // What it costs, as the budget's own gem; a group gets a gilt pointer.
    if (r.group || r.stance) {
      ctx.fillStyle = on ? GILT.base : UI.COLORS.disabled;
      const gx = c.x + c.w - 3, gy = c.y + 1.5;
      for (let i = 0; i < 3; i++) ctx.fillRect(gx + i * Q, gy + i * Q, Q, 3 - 2 * i * Q);
    } else if (r.cost && COST_GEM[r.cost]) {
      gem(ctx, c.x + c.w - 3, c.y + 3, 1.5, COST_GEM[r.cost], on);
    }
    // Keycaps for the digit shortcuts _updateMenu reads.
    const shortcut = !inSub && { '@attack': '1', '@cast': '2', '@item': '3', '@move': '4' }[r.id];
    if (shortcut) keycap(ctx, c.x + 1, c.y + 1, shortcut, { dim: !on });
  }

  /**
   * The detail of the highlighted verb, hung over its plate: name, what it
   * costs, what it does, why not, and the slots it can burn. Up while the
   * pointer is on the bar (or the keyboard is driving); pointing at the field
   * puts it away, because then the card of whatever you point at matters more.
   */
  _drawDetail(ctx) {
    const enc = this.enc;
    const unit = enc.current;
    const rows = this._currentRows();
    const inSub = this.menuPath.length > 0;
    const idx = clamp(inSub ? this.subIndex : this.menuIndex, 0, Math.max(0, rows.length - 1));
    const row = rows[idx];
    const G = this._bar;
    this._detailR = null;
    if (!row || !G) return;
    const m = Input.mouse;
    const onBar = m.over && m.x >= G.x && m.x <= G.x + G.w && m.y >= G.y - 7 && m.y <= G.y + G.h;
    if (!onBar && Input.lastDevice === 'mouse') return;
    const cell = G.cells.find((c) => c.i === idx);
    if (!cell) return;

    const W = 158;
    const tw = W - 8;
    const bits = [];
    if (row.cost) bits.push(row.cost === 'action' ? 'ACTION' : row.cost === 'bonus' ? 'BONUS' : row.cost === 'reaction' ? 'REACTION' : 'FREE');
    const rng = row.targeting?.range;
    if (rng != null && !row.group) {
      const far = Array.isArray(rng) ? rng[1] : rng;
      if (far) bits.push(`${far} FT`);
    }
    if (row.concentration) bits.push('CONC.');
    if (row.group && Array.isArray(row.sub)) bits.push(`${row.sub.length} OPTION${row.sub.length === 1 ? '' : 'S'}`);
    const tail = bits.join(' · ');
    const tailW = tail ? UI.measure(tail, 'xs') : 0;
    // A group says what is inside it, ready ones first, rather than "7 options."
    const inside = row.group && Array.isArray(row.sub) && row.sub.length
      ? [...row.sub].sort((a, b) => (b.enabled !== false) - (a.enabled !== false)).map((o) => o.name).filter(Boolean).join(', ') + '.'
      : '';
    const desc = String(inside || row.desc || '');
    const reason = !row.enabled && row.reason ? `Cannot: ${row.reason}` : '';
    const lines = desc ? (UI.wrapLines(desc, tw, 'fine') || []).slice(0, 3) : [];
    const slotLv = row.level > 0 && Array.isArray(row.levels) && row.levels.length ? row.levels : null;
    const h = 4 + 6 + (reason ? 5 : 0) + lines.length * 5 + (slotLv ? 6.5 : 0) + 2;

    const home = HOME.get('battle.detail');
    const offX = DETAIL.x - home.x, offY = DETAIL.y - home.y;
    const x = clamp(R(cell.x + cell.w / 2 - W / 2 + offX), 2, VIEW_W - W - 2);
    let y = R(G.y - 7.5 - h + offY);
    if (this.hint && x < NOTE.x + NOTE.w && y + h > NOTE.y - 1) y = R(NOTE.y - 2 - h);
    plate(ctx, x, y, W, h, { gilt: true });
    // the pointer down to the plate it describes
    const px = clamp(cell.x + cell.w / 2, x + 4, x + W - 4);
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = KEY; ctx.fillRect(px - 2.5 + i * Q, y + h + i * Q, 5 - i, Q);
      ctx.fillStyle = GILT.lo; ctx.fillRect(px - 2 + i * Q, y + h - Q + i * Q, 4 - i, Q);
    }

    let ty = y + 3.5;
    const head = String(row.name || row.id || '');
    UI.text(ctx, x + 4, ty, UI.fit(head, tw - tailW - 4, 'fineb'), { size: 'fineb', color: row.enabled ? GILT.hi : UI.COLORS.disabled, shadow: false });
    if (tail) UI.text(ctx, x + W - 4, ty + 0.5, tail, { size: 'xs', color: UI.COLORS.inkDim, align: 'right', shadow: false });
    ty += 6.5;
    if (reason) { UI.text(ctx, x + 4, ty, UI.fit(reason, tw, 'fine'), { size: 'fine', color: UI.COLORS.bad, shadow: false }); ty += 5; }
    for (const l of lines) { UI.text(ctx, x + 4, ty, l, { size: 'fine', color: UI.COLORS.ink, shadow: false }); ty += 5; }
    if (slotLv) {
      // Which levels it can be cast at, and how many of each are left: the
      // number that decides whether to upcast.
      const slots = unit?.spells?.slots || {};
      let gx = x + 4;
      UI.text(ctx, gx, ty + 1, 'SLOTS', { size: 'xs', color: UI.COLORS.inkDim, shadow: false });
      gx += UI.measure('SLOTS', 'xs') + 3;
      for (const lv of slotLv) {
        const s = slots[lv];
        if (!s || gx > x + W - 10) continue;
        gx += slotGems(ctx, gx, ty + 2.5, lv, s, { cap: 4 }) + 3;
      }
    }
    this._detailR = { x, y, w: W, h };
  }

  /** While a creature is acting on its own: whose turn it is, and who is next. */
  _drawWaitBar(ctx) {
    const enc = this.enc;
    const u = enc?.current;
    if (!u || this.results) return;
    const X = MENU.x, Y = MENU.y, W = 150, H = MENU.h;
    plate(ctx, X, Y, W, H, { alpha: 0.92 });
    const mine = this._isPlayerControlled(u);
    UI.icon(ctx, 'hourglass', X + 4, Y + 7.5, 11, mine ? GILT.base : '#d88a74');
    const name = UI.fit(u.name || 'A combatant', W - 24, 'fineb');
    UI.text(ctx, X + 18, Y + 7, name, { size: 'fineb', color: SIDE_INK[u.side === 'party' ? 'party' : 'foe'], shadow: false });
    UI.text(ctx, X + 18, Y + 13.5, mine ? 'YOUR TURN' : 'IS ACTING', { size: 'xs', color: UI.COLORS.inkDim, shadow: false });
    // The next player-controlled creature in the order: when you are on.
    const order = enc.order || [];
    const at = order.indexOf(enc.currentUid);
    for (let k = 1; k <= order.length; k++) {
      const n = enc.byUid ? enc.byUid(order[(at + k) % order.length]) : null;
      if (!n || n === u || isDead(n) || !this._isPlayerControlled(n)) continue;
      const lbl = `NEXT: ${String(n.name || '').toUpperCase()}`;
      UI.text(ctx, X + W - 4, Y + 19.5, UI.fit(lbl, W - 24, 'xs'), { size: 'xs', color: GILT.base, align: 'right', shadow: false });
      break;
    }
  }

  // --- aiming ----------------------------------------------------------------

  /**
   * Choosing a square or a creature: the bar gives way to the verb you picked
   * and the controls for it — Back, Next target, the slot to spend, Confirm.
   * Geometry shared with _updateAimControls.
   */
  _aimControls() {
    const y = MENU.y + 3, h = MENU.h - 6;
    let x = MENU.x + BAR_PAD + 78;
    const rows = [];
    const add = (id, label, k, w) => { rows.push({ id, label, key: k, x, y, w, h }); x += w + 2; };
    add('back', 'Back', 'X', 30);
    if (this.phase === 'target') {
      if (!this._isAreaOption(this.pending)) add('next', 'Next', 'Q', 30);
      if (this.pending?.levels?.length > 1) add('slot', `Slot ${ROMAN[this.slotLevel] || this.slotLevel}`, '5', 34);
    }
    add('confirm', this.phase === 'move' ? 'Go here' : 'Confirm', 'Z', 38);
    return rows;
  }

  _drawAimBar(ctx) {
    const rows = this._aimControls();
    const last = rows[rows.length - 1];
    const W = last.x + last.w + BAR_PAD - MENU.x;
    plate(ctx, MENU.x, MENU.y, W, MENU.h, { gilt: true });
    // The verb being aimed.
    const o = this.phase === 'move' ? { name: 'Move', id: '@move', move: true } : this.pending;
    const cx = MENU.x + BAR_PAD, cy = MENU.y + 3;
    UI.vgrad(ctx, cx, cy, 74, MENU.h - 6, '#3a2c1a', '#1c140c');
    hairFrame(ctx, cx, cy, 74, MENU.h - 6, GILT.base, GILT.lo);
    safe(() => UI.icon(ctx, verbIcon(o), cx + 3, cy + 4.5, 11, '#fff0c8'));
    UI.text(ctx, cx + 16, cy + 5, UI.fit(o?.name || 'Aiming', 56, 'fineb'), { size: 'fineb', color: GILT.hi, shadow: false });
    const sub = this.phase === 'move'
      ? `${this._budget().movement || 0} FT LEFT`
      : `${o?.cost ? o.cost.toUpperCase() : ''}${o?.level > 0 ? ` · LEVEL ${ROMAN[this.slotLevel || o.level] || ''}` : ''}`;
    UI.text(ctx, cx + 16, cy + 11.5, UI.fit(sub, 56, 'xs'), { size: 'xs', color: UI.COLORS.inkDim, shadow: false });

    const m = Input.mouse;
    for (const r of rows) {
      const hot = m.over && m.x >= r.x && m.x < r.x + r.w && m.y >= r.y && m.y < r.y + r.h;
      const main = r.id === 'confirm';
      UI.vgrad(ctx, r.x, r.y, r.w, r.h, hot ? '#5a4422' : main ? '#3a2a16' : '#2a2019', hot ? '#2a1c0e' : '#140f0c');
      hairFrame(ctx, r.x, r.y, r.w, r.h, hot || main ? GILT.hi : '#6a5230', hot || main ? GILT.lo : '#1a120a');
      const kw = keycap(ctx, r.x + 2, r.y + 2, r.key);
      UI.text(ctx, r.x + (r.w + kw + 2) / 2, r.y + r.h / 2 - 1.5, r.label.toUpperCase(), {
        size: 'xs', align: 'center', color: hot ? GILT.spec : main ? GILT.hi : UI.COLORS.ink, shadow: false,
      });
    }
    Layout.rect('battle.menu', { w: W });
  }

  /**
   * While aiming an area: who is caught, and what each has to beat. The
   * single-target maths lives on the target card, next to the creature.
   */
  _drawAimDetail(ctx) {
    const o = this.pending;
    const unit = this.enc?.current;
    this._detailR = null;
    if (!o || !unit || !this._isAreaOption(o)) return;
    const spell = o.spellId ? getSpell(o.spellId) : null;
    const dc = o.dc || o.saveDC || null;
    const ab = spell?.save?.ability || o.targeting?.saveAbility || 'dex';
    const W = 176, h = 17;
    const home = HOME.get('battle.detail');
    const x = clamp(R(MENU.x + (DETAIL.x - home.x)), 2, VIEW_W - W - 2);
    const y = R(MENU.y - 3 - h + (DETAIL.y - home.y));
    plate(ctx, x, y, W, h, { gilt: true });
    let line = `${this.areaVictims.length} caught`;
    if (dc) line += ` · DC ${dc} ${String(ab).toUpperCase()}`;
    if (Array.isArray(o.levels) && o.levels.length > 1) line += ` · slot ${ROMAN[this.slotLevel] || this.slotLevel}`;
    UI.text(ctx, x + 4, y + 3.5, line, { size: 'fineb', color: GILT.hi, shadow: false });
    let cx = x + 4;
    for (const v of this.areaVictims.slice(0, 6)) {
      const sm = safe(() => saveMod(v, ab), 0) || 0;
      const label = `${UI.fit(String(v.name || '?'), 34, 'fine')} ${signed(sm)}`;
      const w = UI.measure(label, 'fine') + 4;
      if (cx + w > x + W - 3) break;
      const col = v.side === 'party' ? SIDE_INK.party : SIDE_INK.foe;
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(cx, y + 10, w, 5.5);
      ctx.fillStyle = col; ctx.fillRect(cx, y + 10, Q, 5.5);
      UI.text(ctx, cx + 2, y + 10.5, label, { size: 'fine', color: col, shadow: false });
      cx += w + 2;
    }
    this._detailR = { x, y, w: W, h };
  }

  // --- the target card -----------------------------------------------------

  /**
   * What the chosen action would do to `tgt`: the to-hit and the expected
   * damage against its own resistances, or the save it has to make.
   */
  _mathFor(unit, tgt, o) {
    if (!o || !unit || !tgt || o.group || o.move) return null;
    const spell = o.spellId ? safe(() => getSpell(o.spellId), null) : null;
    const isAttack = o.kind === 'attack' || !!spell?.attack;
    const dist = safe(() => distanceFt(unit, tgt), 0) || 0;
    const slot = this.pending === o ? (this.slotLevel ?? spell?.level) : spell?.level;
    if (isAttack) {
      const cover = safe(() => hasCover(this.enc, unit, tgt), 0) || 0;
      const ac = (safe(() => acOf(tgt), 10) || 10) + cover;
      const atk = o.attackBonus != null ? o.attackBonus : (o.spellAttack || 0);
      const ad = safe(() => computeAdvantage(this.enc, unit, tgt, { ranged: !!o.ranged, spell }), { adv: false, dis: false }) || {};
      const p = hitChance(atk, ac, ad.adv, ad.dis);
      let dmg = 0;
      if (o.damage) dmg = avgOf(o.damage.dice, o.damage.mod);
      else if (spell) {
        const dice = safe(() => spellDamageDice(spell, slot ?? spell.level, unit.level || 1), spell.damage?.dice);
        dmg = avgOf(dice, 0);
      }
      // A raw average is a lie against a skeleton or a fire elemental.
      const dtype = lower((o.damage && o.damage.type) || (spell && spell.damage && spell.damage.type) || '');
      const soak = this._soakOf(tgt, dtype);
      const adj = soak.mult === 0 ? 0 : Math.round(dmg * soak.mult);
      return {
        kind: 'attack', p, ac, atk, cover, ad, dmg: adj, dtype, soak, dist,
        lethal: soak.mult > 0 && adj >= Math.max(1, tgt.hp || 1),
      };
    }
    if (spell?.damage?.perMissile) {
      const n = (spell.damage.missiles || 3) + Math.max(0, (slot || spell.level) - spell.level) * (spell.damage.scale?.missilesPerSlot || 1);
      return { kind: 'missile', n, dice: spell.damage.dice, dist };
    }
    if (spell?.save) {
      const ab = spell.save.ability || 'dex';
      return { kind: 'save', dc: o.dc || null, ab, sm: safe(() => saveMod(tgt, ab), 0) || 0, dist };
    }
    return { kind: 'plain', dist };
  }

  /** Can `o` reach `tgt` from where `unit` stands? Cached per frame of asking. */
  _canReach(unit, tgt, o) {
    const pu = posOf(unit), pt = posOf(tgt);
    const k = `${o.id}|${tgt.uid}|${pu.x},${pu.y}|${pt.x},${pt.y}|${this.enc?.round}`;
    if (this._reachKey !== k) {
      this._reachKey = k;
      const t = safe(() => this.enc.targetsFor(unit, o), null);
      this._reachVal = !t || (t.units || []).some((x) => x === tgt || x.uid === tgt.uid);
    }
    return this._reachVal;
  }

  /** The action the target card should do the maths for, if any. */
  _chosenAction() {
    if (this.phase === 'target') return this.pending;
    if (this.phase !== 'menu') return null;
    if (this.hoverAttack && this.hoverAttack.unit === this.inspect) return this.hoverAttack.option;
    const rows = this._currentRows();
    const inSub = this.menuPath.length > 0;
    const r = rows[clamp(inSub ? this.subIndex : this.menuIndex, 0, Math.max(0, rows.length - 1))];
    if (r && !r.group && (r.kind === 'attack' || r.spellId)) return r;
    // Pointing at a foe with the whole Attack group highlighted: the swing a
    // click would make.
    const u = this.inspect;
    if (r && r.id === '@attack' && u && this.enc?.current && u.side !== this.enc.current.side) {
      return this._quickAttackFor(this.enc.current, u)
        || (this.options || []).find((o) => o && o.kind === 'attack') || null;
    }
    return null;
  }

  /**
   * How much of `type` this creature actually takes: a multiplier and a short
   * tag. Immunity is zero, resistance halves, vulnerability doubles — the same
   * three cases rules/combat.js applies when the blow lands.
   */
  _soakOf(u, type) {
    const t = lower(type);
    if (!u || !t) return { mult: 1, tag: '' };
    const has = (list) => arr(list).some((x) => lower(x) === t);
    if (has(u.immune)) return { mult: 0, tag: 'immune' };
    if (has(u.vuln)) return { mult: 2, tag: 'x2 vuln.' };
    if (has(u.resist)) return { mult: 0.5, tag: 'resisted' };
    return { mult: 1, tag: '' };
  }

  /**
   * The target card: who that is, how hurt, how hard to hit, and — for the
   * action you have chosen — the odds and the expected damage.
   */
  _drawStatCard(ctx) {
    const u = this.inspect;
    if (!u) return;
    const W = STAT.w;
    const X = STAT.x, Y = STAT_Y + (this.boss ? 12 : 0) + (STAT.dy || 0);
    const tw = W - 8;
    const foe = u.side !== 'party';
    const def = this._monsterDef(u);
    const known = !def || !u.monsterId || !!(Game.state?.bestiary?.[u.monsterId]);
    const unit = this.enc?.current;
    const act = unit && u !== unit ? this._chosenAction() : null;
    const math = act ? this._mathFor(unit, u, act) : null;

    // Lay the card out first, so its plate is exactly as tall as its contents.
    const res = [...(u.resist || [])].slice(0, 4);
    const imm = [...(u.immune || [])].slice(0, 3);
    const vul = [...(u.vuln || [])].slice(0, 3);
    const badges = safe(() => conditionBadges(u), []) || [];
    const traits = known && def ? (def.traits || []).slice(0, 2).map((t) => t.name).join(', ') : '';
    const lines = [];
    if (res.length) lines.push([`Resists ${res.join(', ')}`, '#8fb8ee']);
    if (imm.length) lines.push([`Immune to ${imm.join(', ')}`, '#c9a8f0']);
    if (vul.length) lines.push([`Vulnerable to ${vul.join(', ')}`, '#f0b070']);
    if (traits) lines.push([traits, UI.COLORS.inkDim]);
    else if (def && !known) lines.push(['Slay one to learn its ways.', UI.COLORS.inkDim]);
    const H = 25 + (badges.length ? 6 : 0) + lines.length * 5 + (math ? (math.kind === 'attack' ? 17 : 12) : 0) + 2;

    plate(ctx, X, Y, W, H, { top: foe ? '#2a1a18' : '#1c2030', bot: '#110e12', gilt: !!math });
    token(ctx, u, X + 2.5, Y + 2.5, 17, {});
    const nx = X + 22.5, right = X + W - 4;
    UI.text(ctx, nx, Y + 3, UI.fit(String(u.name || '?'), right - nx, 'fineb'), { size: 'fineb', color: SIDE_INK[foe ? 'foe' : 'party'], shadow: false });
    const sub = def
      ? `${titleCase(u.size || 'medium')} ${def.type || 'creature'}${def.cr != null ? ` · CR ${crText(def.cr)}` : ''}`
      : `Level ${u.level || 1} ${titleCase((u.classes?.[0]?.id) || 'adventurer')}`;
    UI.text(ctx, nx, Y + 9, UI.fit(sub.toUpperCase(), right - nx, 'xs'), { size: 'xs', color: UI.COLORS.inkDim, shadow: false });

    const max = safe(() => maxHpOf(u), u.maxHp || 1) || 1;
    const p = hpPct(u);
    const hpTxt = known ? `${Math.max(0, u.hp)}/${max}` : `${Math.round(p * 100)}%`;
    const hw = UI.measure(hpTxt, 'xs') + 2;
    meter(ctx, nx, Y + 14, right - nx - hw, 3, p, { id: `card:${u.uid}`, color: foe ? INK.hp : '#5fc86a', bg: '#1c0d0c' });
    UI.text(ctx, right, Y + 14.5, hpTxt, { size: 'xs', align: 'right', shadow: false, color: p <= 0.25 ? UI.COLORS.bad : p <= 0.5 ? UI.COLORS.warn : UI.COLORS.ink });

    let cx = nx;
    const ac = safe(() => acOf(u), 10);
    const spd = safe(() => speedOf(u), 30);
    UI.icon(ctx, 'shield', cx - 0.5, Y + 18.5, 6, UI.COLORS.silver);
    UI.text(ctx, cx + 6, Y + 20, `AC ${ac}`, { size: 'xs', color: UI.COLORS.ink, shadow: false });
    cx += 7 + UI.measure(`AC ${ac}`, 'xs') + 3;
    UI.icon(ctx, 'foot', cx - 0.5, Y + 18.5, 6, UI.COLORS.inkDim);
    UI.text(ctx, cx + 6, Y + 20, `${spd} FT`, { size: 'xs', color: UI.COLORS.ink, shadow: false });
    if (unit && u !== unit) {
      const ft = safe(() => distanceFt(unit, u), 0) || 0;
      UI.text(ctx, right, Y + 20, `${ft} FT AWAY`, { size: 'xs', color: UI.COLORS.inkDim, align: 'right', shadow: false });
    }

    let y = Y + 25;
    if (badges.length) {
      let bx = X + 4;
      for (const b of badges.slice(0, 5)) {
        const nm = UI.fit(String(b.text || b.name || '').toUpperCase(), 40, 'xs');
        const w = UI.measure(nm, 'xs') + 4;
        if (bx + w > right) break;
        ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(bx, y, w, 5);
        ctx.fillStyle = b.color || UI.COLORS.purple; ctx.fillRect(bx, y, Q, 5);
        UI.text(ctx, bx + 2, y + 1, nm, { size: 'xs', color: b.color || UI.COLORS.purple, shadow: false });
        bx += w + 1.5;
      }
      y += 6;
    }
    for (const [t, col] of lines) {
      UI.text(ctx, X + 4, y, UI.fit(t, tw, 'fine'), { size: 'fine', color: col, shadow: false });
      y += 5;
    }

    if (math) {
      giltRule(ctx, X + 3, y + 1, W - 6, 0.7);
      y += 2.5;
      const name = String(act.name || '').toUpperCase();
      if (math.kind === 'attack') {
        const pct = `${Math.round(math.p * 100)}%`;
        const pcol = math.soak.mult === 0 ? UI.COLORS.bad : math.ad.dis && !math.ad.adv ? UI.COLORS.bad : math.ad.adv ? UI.COLORS.good : GILT.hi;
        UI.text(ctx, X + 4, y + 1, UI.fit(name, tw - 34, 'xs'), { size: 'xs', color: GILT.base, shadow: false });
        UI.text(ctx, right, y, `${pct} to hit`, { size: 'fineb', color: pcol, align: 'right', shadow: false });
        y += 6;
        const dmg = math.soak.mult === 0 ? 'Immune' : `~${math.dmg}${math.dtype ? ` ${math.dtype}` : ''}${math.soak.tag ? ` (${math.soak.tag})` : ''}`;
        UI.text(ctx, X + 4, y, UI.fit(`${signed(math.atk)} vs AC ${math.ac}${math.cover ? ` (+${math.cover} cover)` : ''} · ${dmg}`, tw, 'fine'), {
          size: 'fine', color: math.soak.mult === 0 ? UI.COLORS.bad : UI.COLORS.ink, shadow: false,
        });
        y += 5;
        const tail = [];
        if (this.phase === 'menu' && !this._canReach(unit, u, act)) tail.push('Out of reach');
        if (math.lethal) tail.push('Potential KO');
        if (math.ad.adv && !math.ad.dis) tail.push('ADV: ' + (arr(math.ad.advReasons)[0] || 'advantage'));
        else if (math.ad.dis && !math.ad.adv) tail.push('DIS: ' + (arr(math.ad.disReasons)[0] || 'disadvantage'));
        else if (math.ad.cancelled) tail.push('adv/dis cancel');
        if (tail.length) {
          const col = tail[0] === 'Out of reach' ? UI.COLORS.warn : math.lethal ? GILT.hi : UI.COLORS.inkDim;
          UI.text(ctx, X + 4, y, UI.fit(tail.join(' · '), tw, 'fine'), { size: 'fine', color: col, shadow: false });
        }
      } else if (math.kind === 'save') {
        UI.text(ctx, X + 4, y + 1, UI.fit(name, tw - 40, 'xs'), { size: 'xs', color: GILT.base, shadow: false });
        UI.text(ctx, right, y, `${math.dc ? `DC ${math.dc} ` : ''}${String(math.ab).toUpperCase()}`, { size: 'fineb', color: GILT.hi, align: 'right', shadow: false });
        y += 6;
        UI.text(ctx, X + 4, y, `${u.name || 'It'} saves at ${signed(math.sm)}`, { size: 'fine', color: UI.COLORS.ink, shadow: false });
      } else if (math.kind === 'missile') {
        UI.text(ctx, X + 4, y + 1, UI.fit(name, tw - 40, 'xs'), { size: 'xs', color: GILT.base, shadow: false });
        UI.text(ctx, right, y, 'Auto-hit', { size: 'fineb', color: UI.COLORS.good, align: 'right', shadow: false });
        y += 6;
        UI.text(ctx, X + 4, y, `${math.n} darts · ${math.dice} each`, { size: 'fine', color: UI.COLORS.ink, shadow: false });
      } else {
        UI.text(ctx, X + 4, y + 1, UI.fit(name, tw, 'xs'), { size: 'xs', color: GILT.base, shadow: false });
        y += 6;
        UI.text(ctx, X + 4, y, `${math.dist} ft away`, { size: 'fine', color: UI.COLORS.inkDim, shadow: false });
      }
    }
    this._statR = { x: X, y: Y, w: W, h: H };
    Layout.rect('battle.stat', { h: H });
  }

  /** The End Turn plate: a wax seal, always at the right-hand end. */
  _drawEndButton(ctx) {
    const enc = this.enc;
    const unit = enc && enc.current;
    const live = this.phase === 'menu' && unit && this._isPlayerControlled(unit);
    const hot = this.endHover && live;
    const armed = live && this.endConfirmAt && (this.t - this.endConfirmAt) < 3;
    const X = ENDBTN.x, Y = ENDBTN.y, W = ENDBTN.w, H = ENDBTN.h;
    plate(ctx, X, Y, W, H, { gilt: !!live, top: hot ? '#4a3420' : '#2a211b', alpha: live ? 1 : 0.6 });
    const pulse = armed ? 0.5 + 0.5 * Math.sin(this.t * 10) : 0;
    UI.seal(ctx, X + W / 2, Y + 9.5, { r: 6.5, color: !live ? '#4a3a3a' : armed ? (pulse > 0.5 ? '#d8402e' : RUBRIC.base) : hot ? '#c8382a' : RUBRIC.base });
    UI.icon(ctx, 'hourglass', X + W / 2 - 3.5, Y + 6, 7, live ? '#ffd8b0' : '#8a7a6a');
    UI.text(ctx, X + W / 2, Y + 19.5, armed ? 'SURE?' : 'END TURN', {
      size: 'xs', align: 'center', shadow: false,
      color: !live ? UI.COLORS.disabled : armed ? UI.COLORS.bad : hot ? GILT.spec : GILT.hi,
    });
    keycap(ctx, X + 1.5, Y + 1.5, '5', { dim: !live });
  }

  // --- transient overlays --------------------------------------------------

  /**
   * Banners hang from the top band like a herald's: a turn banner in the
   * acting side's tincture, the name in the display face sweeping in, gilt,
   * behind a glint. Everything else (Ambush!, Opportunity Attack, a boss
   * card) is the same cloth in its own colour.
   */
  _drawBanner(ctx) {
    const b = this.banner;
    if (!b) return;
    const t = b.t, dur = b.dur || 1;
    const size = b.big ? 'titleLg' : 'title';
    const tm = safe(() => UI.metrics(size), { capH: 8 }) || { capH: 8 };
    const capH = tm.capH || 8;
    const turn = b.kind === 'turn';
    const over = turn ? `ROUND ${b.round || this.enc?.round || 1}` : '';
    const under = turn ? String(b.note || '').toUpperCase() : String(b.sub || '');
    const underSize = turn ? 'xs' : 'fine';
    const tw = UI.measure(b.text || '', size);
    const w = R(Math.max(tw + 26, UI.measure(over, 'xs') + 20, Math.min(260, UI.measure(under, underSize) + 20), 84));
    const subLines = under ? (b.big ? (UI.wrapLines(under, w - 16, underSize) || []).slice(0, 2) : [UI.fit(under, w - 12, underSize)]) : [];
    const h = R(4 + (over ? 5 : 0) + capH + 3 + subLines.length * 5 + (subLines.length ? 1 : 0) + Math.min(8, Math.max(3, R((capH + 12) / 5))));
    const x = R((VIEW_W - w) / 2);
    const y = TOP_H + 1 + (this.boss ? 12 : 0) + (b.big ? 24 : 0);

    // Unfurl, hold, furl.
    const inK = easeOut(t / 0.16);
    const outK = clamp((dur - t) / 0.14, 0, 1);
    const k = Math.min(inK, outK);
    if (k <= 0) return;
    const tint = this._bannerTincture(b);
    UI.pushClip(ctx, x - 8, y - 4, w + 16, R((h + 6) * k) + 1);
    UI.panel(ctx, x, y, w, h, { style: 'banner', color: tint, shadow: 0.45 });
    let ty = y + 4;
    if (over) {
      UI.text(ctx, VIEW_W / 2, ty, over, { size: 'xs', color: GILT.hi, align: 'center', shadow: false, letterSpacing: 0.5 });
      ty += 5;
    }
    // The name sweeps in from the left behind a moving glint.
    const sweep = clamp((t - 0.06) / 0.26, 0, 1);
    const tx = VIEW_W / 2 - (1 - easeOut(sweep)) * 10;
    const left = R(VIEW_W / 2 - tw / 2) - 12;
    const reveal = left + (tw + 24) * easeOut(sweep);
    UI.pushClip(ctx, left, ty - 2, Math.max(0, reveal - left), capH + 6);
    UI.text(ctx, tx, ty, b.text || '', { size, gilt: true, color: GILT.base, align: 'center', shadow: 'rgba(12,6,4,0.85)' });
    UI.popClip(ctx);
    const gl = clamp((t - 0.3) / 0.3, 0, 1);
    if (gl > 0 && gl < 1) {
      const gx = left + (tw + 24) * gl;
      UI.pushClip(ctx, gx - 2, ty - 1, 4, capH + 3);
      UI.text(ctx, VIEW_W / 2, ty, b.text || '', { size, color: GILT.spec, align: 'center', shadow: false });
      UI.popClip(ctx);
    }
    ty += capH + 3;
    for (const l of subLines) {
      UI.text(ctx, VIEW_W / 2, ty, l, {
        size: underSize, color: turn ? '#f0e4c8' : UI.COLORS.ink, align: 'center', shadow: 'rgba(0,0,0,0.6)',
      });
      ty += 5;
    }
    UI.popClip(ctx);
  }

  /** The banner's cloth: azure for the party, gules for foes, else its own hue. */
  _bannerTincture(b) {
    if (b.side === 'party') return LAPIS.base;
    if (b.side === 'foe') return RUBRIC.base;
    const c = String(b.color || '').toLowerCase();
    const C = UI.COLORS;
    if (c === String(C.blue).toLowerCase()) return LAPIS.base;
    if (c === String(C.red).toLowerCase() || c === String(C.bad).toLowerCase()) return RUBRIC.base;
    if (c === String(C.green).toLowerCase() || c === String(C.good).toLowerCase()) return VERDIGRIS.base;
    if (c === String(C.purple).toLowerCase()) return '#5a2e7a';
    if (c === String(C.warn).toLowerCase()) return '#8a4a14';
    return '#3a2a1c';
  }

  /**
   * The die lands on a medallion: a dark disc with a gilt rim of twenty
   * notches, and the notch of the face it shows lights as it settles.
   */
  _drawDice(ctx) {
    const d = this.dice;
    const r = d.roll || {};
    const cx = DICE.x, cy = DICE.y;
    const rr = 19 * (0.55 + 0.45 * easeOut(d.t / 0.12));
    for (let yy = -rr; yy <= rr; yy += Q) {
      const hw = R(Math.sqrt(Math.max(0, rr * rr - yy * yy)) * 2) / 2;
      ctx.fillStyle = 'rgba(8,6,10,0.8)';
      ctx.fillRect(cx - hw, R((cy + yy) * 2) / 2, hw * 2, Q);
    }
    const nat = r.natural != null ? r.natural : (Array.isArray(r.rolls) ? r.rolls[0] : 0);
    const landed = d.t >= 0.35;
    for (let i = 0; i < 20; i++) {
      const a = -Math.PI / 2 + (i / 20) * Math.PI * 2;
      const nx = R((cx + Math.cos(a) * (rr - 1.5)) * 2) / 2;
      const ny = R((cy + Math.sin(a) * (rr - 1.5)) * 2) / 2;
      const hot = landed && i + 1 === nat;
      ctx.fillStyle = hot ? GILT.spec : i % 5 === 4 ? GILT.base : GILT.lo;
      ctx.fillRect(nx - (hot ? 0.5 : 0), ny - (hot ? 0.5 : 0), hot ? 1.5 : 1, hot ? 1.5 : 1);
    }
    UI.diceRoll(ctx, cx, cy, { ...r, backdrop: false }, d.t);
  }

  /** Who is rolling, at whom, with what — a slip above the tumbling die. */
  _drawDiceCaption(ctx) {
    const r = this.dice && this.dice.roll;
    if (!r || !r.who) return;
    let label = String(r.who);
    if (r.vs) label += ' → ' + r.vs;
    if (r.what) label += ' · ' + r.what;
    label = UI.fit(label, 190, 'fineb');
    const w = UI.measure(label, 'fineb') + 10;
    const x = clamp(R(DICE.x - w / 2), 2, VIEW_W - w - 2);
    const y = Math.max(TOP_H + 2, DICE.y - 32);
    plate(ctx, x, y, w, 8, { gilt: true });
    UI.text(ctx, x + w / 2, y + 2.5, label, { size: 'fineb', color: GILT.hi, align: 'center', shadow: false });
  }

  /** The damage arithmetic, under the die: "1d8 [6] +3 = 9 slashing". */
  _drawRollLines(ctx) {
    const r = this.rollLines;
    if (!r || !r.lines.length) return;
    let w = 0;
    for (const l of r.lines) w = Math.max(w, UI.measure(l, 'fineb'));
    w += 10;
    const h = 4 + r.lines.length * 5.5;
    const x = clamp(R(DICE.x - w / 2), 2, VIEW_W - w - 2);
    const y = DICE.y + 33;
    const a = clamp(Math.min(r.t / 0.12, (r.dur - r.t) / 0.18), 0, 1);
    ctx.save();
    ctx.globalAlpha = a;
    plate(ctx, x, y, w, h, {});
    let ly = y + 2.5;
    for (const l of r.lines) {
      UI.text(ctx, x + w / 2, ly, l, { size: 'fineb', color: r.color || UI.COLORS.ink, align: 'center', shadow: false });
      ly += 5.5;
    }
    ctx.restore();
  }

  /** The reaction prompt's geometry, shared with _updatePrompt's hit-test. */
  _promptGeom() {
    const W = 220, H = 62;
    const X = R((VIEW_W - W) / 2), Y = 80;
    const bw = 70, bh = 13, gap = 10;
    const bx = R((VIEW_W - bw * 2 - gap) / 2), by = Y + 30;
    return { X, Y, W, H, yes: { x: bx, y: by, w: bw, h: bh }, no: { x: bx + bw + gap, y: by, w: bw, h: bh } };
  }

  _drawPrompt(ctx) {
    const p = this.prompt;
    if (!p) return;
    UI.scrim(ctx, 0.45);
    const g = this._promptGeom();
    UI.window(ctx, g.X, g.Y, g.W, g.H, 'Reaction', { style: 'window', shadow: 0.6 });
    const who = `${p.reactor?.name || 'You'} — ${p.title}`;
    UI.text(ctx, g.X + g.W / 2, g.Y + 9, UI.fit(who, g.W - 14, 'fineb'), { size: 'fineb', color: GILT.hi, align: 'center', shadow: false });
    const lines = (UI.wrapLines(p.body || '', g.W - 16, 'fine') || []).slice(0, 2);
    let y = g.Y + 16;
    for (const l of lines) { UI.text(ctx, g.X + g.W / 2, y, l, { size: 'fine', color: UI.COLORS.ink, align: 'center', shadow: false }); y += 5; }
    const m = Input.mouse;
    for (const [i, r, label, k] of [[0, g.yes, p.yes, 'Z'], [1, g.no, p.no, 'X']]) {
      const hover = m.over && m.x >= r.x && m.x <= r.x + r.w && m.y >= r.y && m.y <= r.y + r.h;
      UI.button(ctx, r.x, r.y, r.w, r.h, label, { selected: p.index === i, hover, t: this.t });
      keycap(ctx, r.x + 3.5, r.y + 4, k, { dim: p.index !== i });
    }
    // The fuse burns down; running out keeps the useful default.
    const left = clamp(1 - p.t / p.dur, 0, 1);
    const fx = g.X + 8, fw = g.W - 16, fy = g.Y + g.H - 5;
    ctx.fillStyle = KEY; ctx.fillRect(fx - Q, fy - Q, fw + 1, 2);
    ctx.fillStyle = '#1a120c'; ctx.fillRect(fx, fy, fw, 1);
    ctx.fillStyle = left > 0.35 ? GILT.base : RUBRIC.hi; ctx.fillRect(fx, fy, fw * left, 1);
    ctx.fillStyle = '#fff4c8'; ctx.fillRect(fx + fw * left - 1, fy - Q, 1, 2);
    UI.text(ctx, g.X + g.W / 2, g.yes.y + g.yes.h + 3, p.costly ? 'IF IGNORED: NEVER SPEND IT' : 'IF IGNORED: USE IT', { size: 'xs', color: UI.COLORS.inkDim, align: 'center', shadow: false });
  }

  // --- results -------------------------------------------------------------

  _drawResults(ctx) {
    const r = this.results;
    const t = r.t || 0;
    UI.scrim(ctx, 0.72 * clamp(t / 0.3, 0, 1));
    const rise = R((1 - easeOut(t / 0.35)) * 10);
    if (r.kind === 'defeat' || r.kind === 'fled') {
      const W = 220, H = 74, X = R((VIEW_W - W) / 2), Y = 76 + rise;
      const defeat = r.kind === 'defeat';
      UI.panel(ctx, X, Y, W, H, { style: defeat ? 'dark' : 'window', shadow: 0.6 });
      UI.ribbon(ctx, VIEW_W / 2, Y - 7, defeat ? 'Defeat' : 'Escape', { size: 'title', h: 13 });
      UI.text(ctx, VIEW_W / 2, Y + 11, defeat ? 'The party falls.' : 'You break away.', {
        size: 'title', gilt: true, color: defeat ? RUBRIC.hi : GILT.base, align: 'center', shadow: 'rgba(0,0,0,0.8)',
      });
      giltRule(ctx, X + 30, Y + 25, W - 60, 0.8);
      fleuron(ctx, VIEW_W / 2, Y + 25.25, {});
      UI.text(ctx, VIEW_W / 2, Y + 31, defeat ? `The fight lasted ${r.rounds} round${r.rounds === 1 ? '' : 's'}.` : `You held them for ${r.rounds} round${r.rounds === 1 ? '' : 's'}.`, { size: 'fine', color: UI.COLORS.ink, align: 'center', shadow: false });
      UI.text(ctx, VIEW_W / 2, Y + 38, defeat ? 'Tymora turns her face away.' : 'No spoils — but the road is still yours.', { size: 'fine', color: UI.COLORS.inkDim, align: 'center', shadow: false });
      this._drawContinue(ctx, Y + H - 12, defeat ? 'Continue' : 'Back to the road');
      return;
    }

    // Victory: a folio page — the heading, who earned what, and the spoils —
    // exactly as tall as what is written on it.
    const W = 232, X = R((VIEW_W - W) / 2);
    const rows = r.members.slice(0, 4);
    const chips = [];
    {
      let cx = 0, line = 0;
      for (const e of r.loot.slice(0, 10)) {
        const raw = e.name || safe(() => itemName(e.id), null);
        let name = raw && raw !== e.id ? raw : titleCase(String(e.id).replace(/-/g, ' '));
        if (e.qty > 1) name += ` ×${e.qty}`;
        name = UI.fit(name, 74, 'fine');
        const w = UI.measure(name, 'fine') + 12;
        if (cx + w > W - 20 && cx > 0) { cx = 0; line++; }
        if (line > 2) break;
        chips.push({ e, name, w, x: cx, line });
        cx += w + 2;
      }
    }
    const lootH = chips.length ? (chips[chips.length - 1].line + 1) * 8.5 : 6;
    const H = R(16 + 8 + rows.length * 12 + 9 + 9 + lootH + 14);
    const Y = R((VIEW_H - H) / 2) - 6 + rise;
    UI.panel(ctx, X, Y, W, H, { style: 'window', shadow: 0.6 });
    UI.ribbon(ctx, VIEW_W / 2, Y - 7, 'Victory', { size: 'title', h: 13 });
    UI.text(ctx, VIEW_W / 2, Y + 9, `The field is yours after ${r.rounds} round${r.rounds === 1 ? '' : 's'}.`, { size: 'fine', color: UI.COLORS.ink, align: 'center', shadow: false });

    UI.divider(ctx, X + 8, Y + 18, W - 16, { label: 'Experience', size: 'fineb' });
    let y = Y + 23;
    for (const [i, m] of rows.entries()) {
      const lv = r.leveled.find((l) => l.uid === m.uid);
      const dead = isDead(m);
      // Rows arrive one after another, the scribe filling the page.
      const k = clamp((t - 0.25 - i * 0.12) / 0.2, 0, 1);
      if (k > 0) {
        ctx.save();
        ctx.globalAlpha *= k;
        token(ctx, m, X + 10, y, 10, { dim: dead });
        UI.text(ctx, X + 24, y + 1.5, UI.fit(m.name || '?', 80, 'fineb'), { size: 'fineb', color: dead ? UI.COLORS.disabled : SIDE_INK.party, shadow: false });
        const hpTxt = dead ? 'FALLEN' : `${Math.max(0, m.hp)}/${safe(() => maxHpOf(m), m.maxHp || 1)} HP`;
        UI.text(ctx, X + 24, y + 7, hpTxt, { size: 'xs', color: dead ? UI.COLORS.bad : UI.COLORS.inkDim, shadow: false });
        if (!dead) {
          // The share counting up, and the bar toward the next level filling
          // with it; a level gained is a wax seal with the new number.
          const k2 = clamp((t - 0.35 - i * 0.12) / 0.5, 0, 1);
          const bx = X + 104, bw = 84;
          UI.text(ctx, bx + bw, y + 1, `+${Math.round((r.share || 0) * k2)} XP`, { size: 'fineb', color: GILT.hi, align: 'right', shadow: false });
          if (lv) {
            const on = Math.floor(t * 4) % 2 === 0;
            UI.text(ctx, bx, y + 7.5, 'LEVEL UP', { size: 'xs', color: on ? GILT.spec : GILT.base, shadow: false });
            UI.seal(ctx, X + W - 14, y + 5, { r: 5, color: on ? RUBRIC.hi : RUBRIC.base });
            UI.text(ctx, X + W - 14, y + 3, String(lv.level), { size: 'fineb', color: GILT.spec, align: 'center', shadow: false });
          } else {
            meter(ctx, bx, y + 7.5, bw, 2, (safe(() => xpProgress(m), 0) || 0) * k2, { color: INK.xp, bg: '#1a140c' });
          }
        }
        ctx.restore();
      }
      y += 12;
    }

    y += 1;
    UI.divider(ctx, X + 8, y, W - 16, { label: 'Spoils', size: 'fineb' });
    y += 6;
    UI.icon(ctx, 'coin', X + 10, y - 0.5, 7, null);
    UI.text(ctx, X + 19, y + 1, `${r.gold} gp`, { size: 'fineb', color: GILT.hi, shadow: false });
    UI.text(ctx, X + W - 10, y + 1, `${r.xp} XP IN ALL`, { size: 'xs', color: UI.COLORS.inkDim, align: 'right', shadow: false });
    y += 9;
    if (chips.length) {
      for (const c of chips) {
        const cx = X + 10 + c.x, cy = y + c.line * 8.5;
        const col = UI.RARITY_COLORS?.[c.e.rarity] || UI.COLORS.ink;
        ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(cx, cy, c.w, 7);
        hairFrame(ctx, cx, cy, c.w, 7, UI.shade(col, -0.2), UI.shade(col, -0.55));
        UI.icon(ctx, matchWord(ITEM_ICON_WORDS, c.name) || 'bag', cx + 1, cy + 0.5, 6, col);
        UI.text(ctx, cx + 8.5, cy + 2, c.name, { size: 'fine', color: col, shadow: false });
      }
    } else {
      UI.text(ctx, X + 10, y + 1, 'Nothing worth carrying.', { size: 'fine', color: UI.COLORS.inkDim, shadow: false });
    }
    this._drawContinue(ctx, Y + H - 10, 'March on');
  }

  /** "[Z] March on", centred: the key that closes a results page. */
  _drawContinue(ctx, y, label) {
    if ((this.results?.t || 0) < 0.6) return;
    const lw = UI.measure(label, 'fineb');
    const kw = 6;
    let x = R(VIEW_W / 2 - (kw + 3 + lw) / 2);
    x += keycap(ctx, x, y, 'Z') + 3;
    UI.text(ctx, x, y + 1, label, { size: 'fineb', color: GILT.hi, shadow: false });
  }

  // --- notes and key hints -------------------------------------------------

  /**
   * The contextual one-liner — a refusal, where a click would walk you, a
   * portrait's name — on its own dark slip above the unit card, so it is never
   * bare text over grass.
   */
  _drawNote(ctx, label, color) {
    const txt = UI.fit(String(label || ''), NOTE.w - 8, 'fine');
    if (!txt) return;
    const w = Math.min(NOTE.w, UI.measure(txt, 'fine') + 8);
    plate(ctx, NOTE.x, NOTE.y, w, 8, { shadow: false });
    UI.text(ctx, NOTE.x + 4, NOTE.y + 2.5, txt, { size: 'fine', color: color || UI.COLORS.warn, shadow: false });
  }

  /**
   * A three-swatch key for the movement overlay — unless the square under the
   * cursor is about to cost you something, in which case the slip says that.
   */
  _drawMoveLegend(ctx) {
    const k = key(this.cursor.x, this.cursor.y);
    const provokes = this.provoke.has(k);
    const threatened = this.threat.has(k);
    if ((provokes || threatened) && this.reach.has(k)) {
      this._drawNote(ctx, provokes ? 'Running from here provokes an attack.' : 'You will be standing in reach.',
        provokes ? UI.COLORS.bad : UI.COLORS.warn);
      return;
    }
    const items = [
      ['rgba(90,160,240,0.95)', 'reach'],
      ['rgba(200,60,45,0.95)', 'provokes'],
      ['rgba(232,110,90,0.95)', 'in melee'],
    ];
    let w = 5;
    for (const [, label] of items) w += 5 + UI.measure(label, 'fine') + 5;
    plate(ctx, NOTE.x, NOTE.y, w, 8, { shadow: false });
    let cx = NOTE.x + 4;
    for (const [col, label] of items) {
      ctx.fillStyle = KEY; ctx.fillRect(cx - Q, NOTE.y + 2, 4, 4);
      ctx.fillStyle = col; ctx.fillRect(cx, NOTE.y + 2.5, 3, 3);
      cx += 5;
      UI.text(ctx, cx, NOTE.y + 2.5, label, { size: 'fine', color: UI.COLORS.inkDim, shadow: false });
      cx += UI.measure(label, 'fine') + 5;
    }
  }

  /** Key hints, right-aligned on a slip just above the bottom band. */
  _drawHints(ctx) {
    if (this.results || this.prompt) return;
    const list = [];
    if (this.phase === 'move') list.push(['X', 'Back'], ['Z', 'Go']);
    else if (this.phase === 'target') {
      list.push(['X', 'Back']);
      if (Array.isArray(this.pending?.levels) && this.pending.levels.length > 1) list.push(['5', 'Slot']);
      list.push(['Z', this.pending?.spellId ? 'Cast' : 'Use']);
    } else if (this.phase === 'menu') list.push(['Q', 'Scan'], ['Z', 'Pick']);
    else if (this.beats.length) list.push(['Sh', 'Fast'], ['Z', 'Skip']);
    else list.push(['Sh', 'Fast']);
    if (this.phase !== 'move' && this.phase !== 'target') list.unshift(['M', 'Zoom']);

    let w = 3;
    for (const [k, l] of list) w += Math.max(4.5, UI.measure(k.toUpperCase(), 'xs') + 2) + 2 + UI.measure(l, 'fine') + 4;
    const y = BAND_Y - 8.5;
    let x = VIEW_W - 2 - w;
    ctx.fillStyle = 'rgba(6,5,10,0.62)';
    ctx.fillRect(x, y - 1, w, 7);
    x += 2;
    for (const [k, l] of list) {
      x += keycap(ctx, x, y, k) + 2;
      UI.text(ctx, x, y + 1, l, { size: 'fine', color: UI.COLORS.inkDim, shadow: false });
      x += UI.measure(l, 'fine') + 4;
    }

    if (this.phase === 'move') this._drawMoveLegend(ctx);
    else if (this.hint && (this.phase === 'menu' || this.phase === 'target')) this._drawNote(ctx, this.hint, UI.COLORS.warn);
  }
}

export default BattleScene;
