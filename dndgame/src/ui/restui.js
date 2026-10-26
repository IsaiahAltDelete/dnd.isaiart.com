// ui/restui.js — RestScene and CampScene: the fire the party sits at between fights.
//
// Two screens, one hearth:
//
//   RestScene('short', opts)  The party idles in a ring around a campfire (or in the
//                             common room of the Stonehill Inn). Each character is
//                             asked, one at a time, how many Hit Dice to burn. Every
//                             die is rolled for real by rules/character.js#restShort
//                             and shown as it lands — "d10 [7] +2 = 9 healed" — with
//                             the hit-point bar filling behind it. Beside that sits
//                             the honest ledger of what an hour actually buys: Pact
//                             Magic, Second Wind, Channel Divinity, Ki, Superiority
//                             Dice — read from the character's own resource table,
//                             never guessed — and, greyed out, what will not come
//                             back until they sleep.
//
//   RestScene('long', opts)   Eight hours off the clock through state.js#advanceTime,
//                             and coin at an inn. The night passes as a real fade with
//                             the clock turning and Selûne crossing the sky, a dream
//                             out of data/tables.js INN_DREAMS, and then a summary of
//                             everything rules/character.js#restLong gave back.
//                             In the open the night can be broken: an encounter is
//                             rolled from the biome and the party's level, the watch
//                             makes a Perception check that the player watches land,
//                             and a failure drops them into the fight surprised.
//
//   CampScene                 The wilderness camp menu — Rest, Manage Party, Cook,
//                             Talk, Leave.
//
// House rules, same as every other screen in this project:
//   * ALL text goes through ui/kit.js UI.* — never ctx.fillText, never ctx.font.
//   * 400x240 logical pixels. Draw on integers. Text never leaves its panel.
//   * Nothing here may throw because a sibling module is missing; optional
//     catalogues come in through safe() and soft dynamic imports.
//   * No Math.random() anywhere — core/rng.js only.

import { UI } from './kit.js';
import { MK } from './menukit.js';
import { Input } from '../core/input.js';
import { Audio } from '../core/audio.js';
import { Game } from '../engine.js';
import { FX } from '../render/fx.js';
import {
  VIEW_W, VIEW_H, clamp, ordinal, signed, titleCase,
  clockText, timeOfDay, dateText,
} from '../constants.js';
import { bus, EV, toast } from '../core/events.js';
import { rng, makeRNG, hashStr } from '../core/rng.js';
import { d20, roll } from '../core/dice.js';
import { drawActor } from '../render/actor.js';
import {
  restShort, restLong, hitDiceTotal, skillMod, abilityMod, maxHpOf,
  isDown, isDead, isAlive, heal,
} from '../rules/character.js';
import { exhaustionLevel } from '../rules/conditions.js';
import { className } from '../rules/progression.js';
import { Party } from '../world/party.js';
import { advanceTime, hasFlag } from '../state.js';
import { watchMods, setRecallPoint } from '../rules/fieldworld.js';
import { resolveItem } from '../data/items.js';

const C = UI.COLORS;

// ===========================================================================
// 0. SAFETY & SHORTHANDS
// ===========================================================================

function safe(fn, fb) {
  try { const v = fn(); return v === undefined || v === null ? fb : v; } catch (e) { return fb; }
}
function sfx(name) { safe(() => Audio.sfx(name), false); }
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const arr = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);
const R = (n) => Math.round(n) | 0;
const S = () => Game.state || null;

/** Modules that may not be loaded (or written) yet. A miss costs a feature, not a crash. */
const LATE = {};
function softImport(path, key) {
  if (LATE[key] !== undefined) return;
  LATE[key] = null;
  safe(() => import(/* @vite-ignore */ path)
    .then((m) => { LATE[key] = m || false; })
    .catch(() => { LATE[key] = false; }));
}
softImport('../data/tables.js', 'tables');
softImport('../data/npcs.js', 'npcs');
softImport('../rules/scaling.js', 'scaling');
softImport('../rules/combat.js', 'combat');
softImport('./combatui.js', 'combatui');
softImport('./menus.js', 'menus');
softImport('../data/monsters.js', 'monsters');

const RECRUITS = () => arr(LATE.npcs && LATE.npcs.RECRUITS);
const INN_DREAMS = () => arr(LATE.tables && LATE.tables.INN_DREAMS);
const MONSTERS = () => (LATE.monsters && LATE.monsters.MONSTERS) || {};

// --- text helpers ----------------------------------------------------------

function txt(ctx, x, y, s, o) { return UI.text(ctx, R(x), R(y), s, o || {}); }
function txtR(ctx, x, y, s, o) { return UI.text(ctx, R(x), R(y), s, { ...(o || {}), align: 'right' }); }
function txtC(ctx, x, y, s, o) { return UI.text(ctx, R(x), R(y), s, { ...(o || {}), align: 'center' }); }

/**
 * A dim label left, a bright value hard against the right edge.
 *
 * This was byte-identical to the broken copy in menus.js: the value was drawn
 * right-aligned with NO `maxWidth`, so a value wider than the column started at
 * `x + w - vw` — outside the panel — and the `Math.max(8, …)` floor was 3px
 * under what fitText can actually emit, so the label silently overflowed too.
 * The kit owns this arithmetic now; both halves are bounded and neither can
 * cross the other or leave [x, x + w].
 */
function kv(ctx, x, y, w, label, value, o = {}) {
  return UI.kvRow(ctx, x, y, w, label, value, {
    size: 'sm',
    valueSize: o.size || 'sm',
    color: o.color || C.ink,
    labelColor: o.labelColor || C.inkDim,
    shadow: true,
  });
}

/** Gold caption with a rule running out to the right of it. Returns the next y. */
function head(ctx, x, y, w, label, color) {
  txt(ctx, x, y, label, { size: 'sm', color: color || C.goldDim, shadow: true });
  const lw = UI.measure(label, 'sm');
  if (w - lw - 5 > 6) UI.divider(ctx, x + lw + 4, y + 3, w - lw - 5, { color: 'rgba(92,74,42,0.85)' });
  return y + 9;
}

/** "Sildar Hallwinter" -> "Sildar", for the places a full name will not fit. */
function shortName(name) {
  const s = String(name || '').trim();
  if (!s) return '—';
  const first = s.split(/\s+/)[0];
  return first.length >= 3 ? first : s;
}

/** The transient status line. Wraps, so a long refusal is never cut in half. */
function drawStatus(ctx, msg, bad, alpha, y = 204) {
  if (!msg) return;
  const w = Math.min(VIEW_W - 24, Math.max(120, UI.measure(msg, 'sm') + 16));
  const lines = UI.wrapLines(msg, w - 12, 'sm').slice(0, 2);
  const h = 6 + lines.length * 9;
  const x = R((VIEW_W - w) / 2);
  ctx.save();
  ctx.globalAlpha = clamp(alpha == null ? 1 : alpha, 0, 1);
  UI.panel(ctx, x, R(y), w, h, { style: 'dark', shadow: 0.4 });
  let ly = y + 3;
  for (const l of lines) {
    txtC(ctx, VIEW_W / 2, ly, l, { size: 'sm', color: bad ? C.bad : C.goldBright, shadow: true });
    ly += 9;
  }
  ctx.restore();
}

function hintBar(ctx, y, hints) {
  ctx.fillStyle = 'rgba(6,6,10,0.72)';
  ctx.fillRect(0, R(y) - 3, VIEW_W, 17);
  let x = 8;
  for (const h of hints) {
    if (!h) continue;
    if (x > VIEW_W - 30) break;
    x += (safe(() => UI.keyHint(ctx, x, R(y), h[0], h[1]), 0) || 0) + 7;
  }
}

// --- pointer ---------------------------------------------------------------

function hit(m, x, y, w, h) {
  return !!m && m.over !== false && m.x >= x && m.x < x + w && m.y >= y && m.y < y + h;
}
function clickedIn(m, x, y, w, h) {
  if (hit(m, x, y, w, h) && m.clicked) { m.clicked = false; return true; }
  return false;
}

// --- navigation ------------------------------------------------------------

function navV(cur, len) {
  if (len <= 0) return 0;
  let i = clamp(num(cur, 0) | 0, 0, len - 1);
  if (Input.repeatConsume('up')) { i = (i - 1 + len) % len; sfx('cursor'); }
  if (Input.repeatConsume('down')) { i = (i + 1) % len; sfx('cursor'); }
  return i;
}

// --- character helpers -----------------------------------------------------

function hpColor(ch) {
  const max = Math.max(1, num(safe(() => maxHpOf(ch), ch && ch.maxHp), 1));
  const p = num(ch && ch.hp, 0) / max;
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

/** Hit-dice pools, biggest die first: [{ key, sides, max, used, free }]. */
function hitDicePools(ch) {
  const hd = (ch && ch.hitDice) || {};
  return Object.keys(hd)
    .map((k) => {
      const sides = parseInt(String(k).replace(/\D/g, ''), 10) || 0;
      const max = num(hd[k] && hd[k].max, 0);
      const used = clamp(num(hd[k] && hd[k].used, 0), 0, max);
      return { key: k, sides, max, used, free: Math.max(0, max - used) };
    })
    .filter((p) => p.sides > 0 && p.max > 0)
    .sort((a, b) => b.sides - a.sides);
}
function hdFree(ch) {
  const t = safe(() => hitDiceTotal(ch), null);
  if (t) return Math.max(0, num(t.available, num(t.max, 0) - num(t.used, 0)));
  return hitDicePools(ch).reduce((a, p) => a + p.free, 0);
}
function hdLine(ch) {
  const pools = hitDicePools(ch);
  if (!pools.length) return '—';
  return pools.map((p) => `${p.free}/${p.max}${p.key}`).join(' ');
}

/**
 * What an hour by the fire actually gives this character back, and what it does
 * not. Read straight off the sheet — whatever data/classes.js says recharges on a
 * short rest is what appears here, so the screen can never lie about the rules.
 */
function restLedger(ch) {
  const now = [];
  const later = [];
  if (!ch) return { now, later };

  const pact = ch.spells && ch.spells.pact;
  if (pact && num(pact.max, 0) > 0) {
    now.push({
      icon: 'rune',
      name: 'Pact Magic',
      text: `${pact.max}x ${ordinal(num(pact.level, 1))} level`,
      spent: clamp(num(pact.used, 0), 0, num(pact.max, 0)),
      max: num(pact.max, 0),
    });
  }

  const res = (ch.resources && typeof ch.resources === 'object') ? ch.resources : {};
  for (const k of Object.keys(res)) {
    const r = res[k];
    if (!r || !num(r.max, 0)) continue;
    const row = {
      icon: RESOURCE_ICON[r.id] || 'star',
      name: r.name || titleCase(String(r.id || k).replace(/-/g, ' ')),
      text: `${r.max} use${num(r.max, 0) === 1 ? '' : 's'}`,
      spent: clamp(num(r.used, 0), 0, num(r.max, 0)),
      max: num(r.max, 0),
    };
    if (String(r.recharge || 'long') === 'short') now.push(row);
    else later.push(row);
  }

  // Spell slots (the ordinary kind) wait for the night.
  const slots = (ch.spells && ch.spells.slots) || {};
  let slotMax = 0, slotUsed = 0;
  for (let l = 1; l <= 9; l++) {
    const s = slots[l];
    if (s && num(s.max, 0) > 0) { slotMax += num(s.max, 0); slotUsed += clamp(num(s.used, 0), 0, num(s.max, 0)); }
  }
  if (slotMax > 0) {
    later.push({ icon: 'book', name: 'Spell Slots', text: `${slotMax} in all`, spent: slotUsed, max: slotMax });
  }

  const ex = num(safe(() => exhaustionLevel(ch), 0), 0);
  if (ex > 0) later.push({ icon: 'skull', name: 'Exhaustion', text: `level ${ex} → ${ex - 1}`, spent: 0, max: ex });

  return { now, later };
}

const RESOURCE_ICON = {
  rage: 'flame', ki: 'wind', focus: 'wind', 'ki-points': 'wind',
  channelDivinity: 'holy', 'channel-divinity': 'holy',
  superiority: 'sword', 'superiority-dice': 'sword',
  sorceryPoints: 'rune', 'sorcery-points': 'rune',
  secondWind: 'heart', 'second-wind': 'heart',
  actionSurge: 'run', 'action-surge': 'run',
  bardicInspiration: 'book', 'bardic-inspiration': 'book',
  wildShape: 'leaf', 'wild-shape': 'leaf',
  layOnHands: 'plus', 'lay-on-hands': 'plus',
  arcaneRecovery: 'book', 'arcane-recovery': 'book',
};

/** Everything the summary screen needs to diff a rest. */
function restSnapshot(ch) {
  const res = {};
  for (const k of Object.keys((ch && ch.resources) || {})) res[k] = num(ch.resources[k].used, 0);
  const slots = (ch && ch.spells && ch.spells.slots) || {};
  let slotUsed = 0;
  for (let l = 1; l <= 9; l++) if (slots[l]) slotUsed += num(slots[l].used, 0);
  return {
    hp: num(ch && ch.hp, 0),
    maxHp: Math.max(1, num(safe(() => maxHpOf(ch), ch && ch.maxHp), 1)),
    hdFree: hdFree(ch),
    hdMax: hitDicePools(ch).reduce((a, p) => a + p.max, 0),
    slotUsed,
    pactUsed: num(ch && ch.spells && ch.spells.pact && ch.spells.pact.used, 0),
    res,
    exh: num(safe(() => exhaustionLevel(ch), 0), 0),
  };
}

// --- where are we? ---------------------------------------------------------

/** The tilemap the scene below is standing on, if any scene is holding one. */
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

/** How likely the night is to be broken, by biome. City and inns: never. */
const NIGHT_DANGER = {
  city: 0, road: 0.16, plains: 0.20, coast: 0.20, hills: 0.26,
  forest: 0.30, 'pine-forest': 0.34, tundra: 0.30, mountain: 0.32,
  marsh: 0.38, 'ash-waste': 0.38, ruins: 0.42, mine: 0.44,
  cave: 0.48, crypt: 0.52, dungeon: 0.52, underdark: 0.58,
};

/** Realms-flavoured names for the place you are bedding down. */
function placeInfo(opts = {}) {
  const map = currentMap();
  const st = S();
  const biome = String(opts.biome || (map && map.biome) || (st && st.biome) || 'road');
  const indoor = opts.inn ? true : !!(map && map.indoor);
  const kind = (map && map.kind) || '';
  const town = kind === 'town' || kind === 'inn' || biome === 'city';
  return {
    mapId: opts.mapId || (map && map.id) || (st && st.mapId) || null,
    place: opts.place || (map && map.name) || (opts.inn ? 'the Stonehill Inn' : 'the open road'),
    biome,
    indoor,
    sheltered: !!(opts.inn || indoor || town),
    danger: opts.inn || indoor || town ? 0 : num(NIGHT_DANGER[biome], 0.28),
  };
}

// ===========================================================================
// 1. THE FIRE
//
// One little particle system, used by the campfire in the wilds and by the
// hearth in the Stonehill Inn's common room. Deterministic: its stream is
// forked from core/rng.js, never Math.random().
// ===========================================================================

class Fire {
  constructor(seed = 'campfire') {
    this.r = makeRNG(hashStr(`fire:${seed}`));
    this.sparks = [];
    this.acc = 0;
    this.emberAcc = 0;
    this.t = 0;
    this.strength = 1;      // 1 at full blaze, drops as the night burns down
  }

  /** Warm, irregular flicker: three detuned sines so it never visibly loops. */
  flicker() {
    const t = this.t;
    return 0.82 + 0.10 * Math.sin(t * 7.3) + 0.06 * Math.sin(t * 11.9 + 1.7) + 0.04 * Math.sin(t * 19.1 + 0.4);
  }

  update(dt, x, y) {
    this.t += dt;
    const s = clamp(this.strength, 0, 1);

    // Local sparks, drawn tight around the flame.
    this.acc += dt;
    while (this.acc > 0.045) {
      this.acc -= 0.045;
      if (this.sparks.length < 40 && this.r.chance(0.55 * s + 0.15)) {
        this.sparks.push({
          x: x + this.r.float(-4, 4),
          y: y - this.r.float(0, 5),
          v: this.r.float(14, 34) * (0.5 + s * 0.5),
          sway: this.r.float(0, Math.PI * 2),
          life: 0,
          dur: this.r.float(0.7, 1.6),
          size: this.r.chance(0.25) ? 2 : 1,
        });
      }
    }
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const p = this.sparks[i];
      p.life += dt;
      p.y -= p.v * dt;
      p.sway += dt * 3.1;
      if (p.life > p.dur) this.sparks.splice(i, 1);
    }

    // Real FX embers, so the fire throws light and grit into the same layer the
    // rest of the game uses.
    this.emberAcc += dt;
    const gap = 0.16 / Math.max(0.2, s);
    while (this.emberAcc > gap) {
      this.emberAcc -= gap;
      safe(() => FX.burst(x + this.r.float(-3, 3), y - 3, this.r.chance(0.4) ? '#ffd27a' : '#ff8a2a', 1, {
        shape: 'ember', speed: this.r.float(10, 26), dir: -Math.PI / 2, spread: 0.55,
        life: this.r.float(0.9, 1.8), size: 1, glow: 1,
      }));
    }
  }

  /** The warm pool of light this fire casts on everything around it. */
  drawGlow(ctx, x, y, radius = 96) {
    const f = this.flicker() * clamp(this.strength, 0, 1);
    if (f <= 0.01) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const rr = radius * (0.92 + f * 0.12);
    const g = ctx.createRadialGradient(x, y - 4, 2, x, y - 4, rr);
    g.addColorStop(0, `rgba(255,206,130,${0.30 * f})`);
    g.addColorStop(0.45, `rgba(226,124,44,${0.14 * f})`);
    g.addColorStop(1, 'rgba(90,30,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(R(x - rr), R(y - rr - 4), R(rr * 2), R(rr * 2));
    ctx.restore();
  }

  /** Logs, flame and sparks. `hearth` swaps the logs for a stone fireplace grate. */
  draw(ctx, x, y, opts = {}) {
    const s = clamp(this.strength, 0, 1);
    const f = this.flicker();
    x = R(x); y = R(y);

    // scorched ground
    ctx.fillStyle = 'rgba(24,16,12,0.75)';
    ctx.fillRect(x - 11, y - 2, 22, 5);
    ctx.fillStyle = '#2a1c14';
    ctx.fillRect(x - 9, y - 1, 18, 3);

    // ring of stones (camp) — a small cairn either side
    if (!opts.hearth) {
      ctx.fillStyle = '#6a6258';
      ctx.fillRect(x - 13, y - 1, 4, 3);
      ctx.fillRect(x + 9, y - 1, 4, 3);
      ctx.fillRect(x - 4, y + 2, 4, 2);
      ctx.fillRect(x + 1, y + 2, 4, 2);
      ctx.fillStyle = '#88807a';
      ctx.fillRect(x - 13, y - 1, 4, 1);
      ctx.fillRect(x + 9, y - 1, 4, 1);
    }

    // logs, crossed
    ctx.fillStyle = '#4a3320';
    ctx.fillRect(x - 8, y - 3, 16, 3);
    ctx.fillRect(x - 5, y - 5, 11, 2);
    ctx.fillStyle = '#6b4a2a';
    ctx.fillRect(x - 8, y - 3, 16, 1);
    // glowing coals under the logs
    ctx.fillStyle = `rgba(255,120,30,${0.55 * s * f})`;
    ctx.fillRect(x - 6, y - 2, 12, 2);

    if (s > 0.02) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // Three nested tongues of flame, each breathing at its own rate.
      const tongues = [
        { w: 9, h: 26 * s, c0: 'rgba(226,90,20,0.55)', c1: 'rgba(226,90,20,0)', ph: 0 },
        { w: 6, h: 19 * s, c0: 'rgba(255,160,40,0.70)', c1: 'rgba(255,160,40,0)', ph: 1.9 },
        { w: 3, h: 11 * s, c0: 'rgba(255,238,180,0.85)', c1: 'rgba(255,238,180,0)', ph: 3.6 },
      ];
      for (const t of tongues) {
        const hh = t.h * (0.86 + 0.20 * Math.sin(this.t * 8.4 + t.ph));
        const ww = t.w * (0.90 + 0.14 * Math.sin(this.t * 6.1 + t.ph * 1.4));
        const lean = Math.sin(this.t * 2.3 + t.ph) * 1.8;
        const g = ctx.createLinearGradient(0, y - hh, 0, y - 2);
        g.addColorStop(0, t.c1);
        g.addColorStop(0.55, t.c0);
        g.addColorStop(1, t.c0);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(R(x + lean), R(y - hh));
        ctx.lineTo(R(x + ww * 0.75), R(y - hh * 0.42));
        ctx.lineTo(R(x + ww * 0.55), R(y - 2));
        ctx.lineTo(R(x - ww * 0.55), R(y - 2));
        ctx.lineTo(R(x - ww * 0.75), R(y - hh * 0.42));
        ctx.closePath();
        ctx.fill();
      }
      // sparks
      for (const p of this.sparks) {
        const k = p.life / p.dur;
        ctx.globalAlpha = Math.max(0, Math.sin(k * Math.PI)) * 0.85 * s;
        ctx.fillStyle = p.size > 1 ? '#fff0c0' : '#ffb44a';
        ctx.fillRect(R(p.x + Math.sin(p.sway) * 2.4), R(p.y), p.size, p.size);
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }
  }
}

// ===========================================================================
// 2. THE ROOM
//
// Two backdrops. Both are procedural — no tiles, no assets — and both leave the
// top 150 pixels clear for panels.
// ===========================================================================

const GROUND_Y = 152;

/** Where the four members stand around the fire, back row first. */
const RING = [
  { dx: 0, dy: -14, dir: 'down', z: 0 },
  { dx: -50, dy: 0, dir: 'right', z: 1 },
  { dx: 50, dy: 0, dir: 'left', z: 1 },
  { dx: 0, dy: 14, dir: 'up', z: 2 },
];

function drawNightSky(ctx, t, starSeed, moonP = 0.5, brightness = 1) {
  const g = ctx.createLinearGradient(0, 0, 0, GROUND_Y + 20);
  g.addColorStop(0, '#05060f');
  g.addColorStop(0.55, '#0b1023');
  g.addColorStop(1, '#17182a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, GROUND_Y + 20);

  // Stars: fixed positions from a hashed stream so the sky is the same sky.
  const r = makeRNG(hashStr(`sky:${starSeed}`));
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 90; i++) {
    const sx = R(r.float(0, VIEW_W));
    const sy = R(r.float(0, GROUND_Y - 8));
    const tw = 0.35 + 0.65 * Math.abs(Math.sin(t * r.float(0.6, 2.2) + i));
    const a = tw * brightness * (sy < 40 ? 0.9 : 0.55);
    ctx.fillStyle = i % 11 === 0 ? `rgba(190,215,255,${a})` : `rgba(240,238,225,${a * 0.8})`;
    ctx.fillRect(sx, sy, 1, 1);
  }
  ctx.restore();

  // Selûne, crossing east to west, with her Tears trailing behind.
  const mx = 34 + moonP * (VIEW_W - 68);
  const my = 54 - Math.sin(moonP * Math.PI) * 30;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const mg = ctx.createRadialGradient(mx, my, 1, mx, my, 22);
  mg.addColorStop(0, `rgba(226,236,255,${0.34 * brightness})`);
  mg.addColorStop(1, 'rgba(150,180,255,0)');
  ctx.fillStyle = mg;
  ctx.fillRect(R(mx - 24), R(my - 24), 48, 48);
  ctx.restore();
  ctx.fillStyle = `rgba(236,242,255,${0.92 * brightness})`;
  ctx.beginPath();
  ctx.arc(R(mx), R(my), 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0b1023';
  ctx.beginPath();
  ctx.arc(R(mx) + 3, R(my) - 2, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(210,225,255,${0.55 * brightness})`;
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(R(mx - 12 - i * 5), R(my + 6 + i * 2), 1, 1);
  }
}

/** Grass, a treeline and a couple of bedrolls: the wilderness camp. */
function drawCampGround(ctx, t, seed) {
  const r = makeRNG(hashStr(`ground:${seed}`));

  // Treeline silhouette along the horizon.
  ctx.fillStyle = '#0a1410';
  for (let x = -8; x < VIEW_W + 8; x += 7) {
    const h = 12 + (hashStr(`tree${x}${seed}`) % 16);
    ctx.beginPath();
    ctx.moveTo(x, GROUND_Y);
    ctx.lineTo(x + 3.5, GROUND_Y - h);
    ctx.lineTo(x + 7, GROUND_Y);
    ctx.closePath();
    ctx.fill();
  }

  const g = ctx.createLinearGradient(0, GROUND_Y - 2, 0, VIEW_H);
  g.addColorStop(0, '#1b2418');
  g.addColorStop(1, '#0e1310');
  ctx.fillStyle = g;
  ctx.fillRect(0, GROUND_Y - 2, VIEW_W, VIEW_H - GROUND_Y + 2);

  // tufts of grass
  for (let i = 0; i < 120; i++) {
    const gx = R(r.float(0, VIEW_W));
    const gy = R(r.float(GROUND_Y + 2, VIEW_H - 2));
    ctx.fillStyle = r.chance(0.3) ? '#2c3a24' : '#232e1c';
    ctx.fillRect(gx, gy, 1, r.chance(0.4) ? 2 : 1);
  }
}

/** Bedrolls and a pack, laid out either side of the fire. */
function drawCampKit(ctx, fx, fy) {
  // bedrolls
  const rolls = [[fx - 74, fy + 12], [fx + 58, fy + 12]];
  for (const [bx, by] of rolls) {
    ctx.fillStyle = '#3a3026';
    ctx.fillRect(R(bx), R(by), 18, 6);
    ctx.fillStyle = '#544636';
    ctx.fillRect(R(bx), R(by), 18, 2);
    ctx.fillStyle = '#2a2219';
    ctx.fillRect(R(bx) + 15, R(by) + 1, 3, 4);
  }
  // a pack propped against a stone
  ctx.fillStyle = '#4a3a26';
  ctx.fillRect(R(fx - 30), R(fy + 16), 9, 8);
  ctx.fillStyle = '#63502f';
  ctx.fillRect(R(fx - 30), R(fy + 16), 9, 2);
  ctx.fillStyle = '#2c2a26';
  ctx.fillRect(R(fx + 22), R(fy + 18), 8, 5);
  // a cookpot on a tripod over the coals
  ctx.fillStyle = '#3a3a40';
  ctx.fillRect(R(fx) - 1, R(fy) - 20, 1, 8);
  ctx.fillStyle = '#2e2e34';
  ctx.fillRect(R(fx) - 5, R(fy) - 13, 10, 5);
  ctx.fillStyle = '#4a4a52';
  ctx.fillRect(R(fx) - 5, R(fy) - 13, 10, 1);
}

/** Floorboards, a stone hearth, benches and a lantern: the Stonehill common room. */
function drawInnRoom(ctx, t, fx, fy) {
  // Back wall — daub above, wainscot below.
  const wall = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  wall.addColorStop(0, '#241c15');
  wall.addColorStop(1, '#38291c');
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, VIEW_W, GROUND_Y);

  // exposed timbers
  ctx.fillStyle = '#2a1e14';
  for (let x = 18; x < VIEW_W; x += 62) ctx.fillRect(x, 0, 5, GROUND_Y);
  ctx.fillStyle = '#3d2b1c';
  ctx.fillRect(0, 96, VIEW_W, 4);

  // floorboards
  const fl = ctx.createLinearGradient(0, GROUND_Y, 0, VIEW_H);
  fl.addColorStop(0, '#4a3524');
  fl.addColorStop(1, '#2a1e14');
  ctx.fillStyle = fl;
  ctx.fillRect(0, GROUND_Y, VIEW_W, VIEW_H - GROUND_Y);
  ctx.fillStyle = 'rgba(20,12,8,0.55)';
  for (let y = GROUND_Y + 6; y < VIEW_H; y += 9) ctx.fillRect(0, y, VIEW_W, 1);

  // The hearth: a fieldstone surround with a heavy oak lintel.
  const hx = R(fx), hy = R(fy);
  ctx.fillStyle = '#3a3630';
  ctx.fillRect(hx - 34, hy - 62, 68, 62);
  ctx.fillStyle = '#151210';
  ctx.fillRect(hx - 26, hy - 46, 52, 46);
  ctx.fillStyle = '#4e4740';
  for (let i = 0; i < 9; i++) {
    const sx = hx - 34 + ((i * 17) % 62);
    const sy = hy - 62 + ((i * 13) % 50);
    ctx.fillRect(sx, sy, 9, 5);
  }
  ctx.fillStyle = '#5a4222';
  ctx.fillRect(hx - 38, hy - 50, 76, 6);
  ctx.fillStyle = '#7a5c30';
  ctx.fillRect(hx - 38, hy - 50, 76, 1);

  // a kettle hook and a hanging pot
  ctx.fillStyle = '#3a3a40';
  ctx.fillRect(hx + 12, hy - 44, 1, 16);
  ctx.fillStyle = '#2e2e34';
  ctx.fillRect(hx + 8, hy - 30, 9, 6);

  // Trestle table, benches and a tankard or two.
  ctx.fillStyle = '#4a3524';
  ctx.fillRect(60, 196, 74, 7);
  ctx.fillStyle = '#66492f';
  ctx.fillRect(60, 196, 74, 2);
  ctx.fillStyle = '#2f2318';
  ctx.fillRect(66, 203, 4, 8);
  ctx.fillRect(124, 203, 4, 8);
  ctx.fillStyle = '#c8a05a';
  ctx.fillRect(72, 192, 4, 5);
  ctx.fillRect(112, 192, 4, 5);
  ctx.fillStyle = '#e0c890';
  ctx.fillRect(72, 192, 4, 1);
  ctx.fillRect(112, 192, 4, 1);

  // A lantern on the far wall, swinging very slightly.
  const lx = 96 + Math.sin(t * 0.9) * 1.2;
  ctx.fillStyle = '#2e2a24';
  ctx.fillRect(R(lx) - 3, 44, 6, 9);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const lg = ctx.createRadialGradient(lx, 48, 1, lx, 48, 30);
  lg.addColorStop(0, 'rgba(255,214,140,0.30)');
  lg.addColorStop(1, 'rgba(255,180,60,0)');
  ctx.fillStyle = lg;
  ctx.fillRect(R(lx) - 32, 16, 64, 64);
  ctx.restore();
}

/**
 * The party idling around the light. Back row draws first so the front row
 * overlaps it, exactly like the overworld's follower ordering.
 */
function drawPartyRing(ctx, members, fx, fy, t, opts = {}) {
  const list = arr(members).slice(0, 4);
  const rows = list
    .map((ch, i) => ({ ch, i, slot: RING[i] || RING[0] }))
    .sort((a, b) => a.slot.z - b.slot.z);

  for (const row of rows) {
    const { ch, i, slot } = row;
    const x = fx + slot.dx;
    const y = fy + slot.dy;
    const down = safe(() => isDown(ch), false);
    const phase = (t * 1.6 + i * 0.77) % 2;
    const bob = down ? 0 : (phase < 1 ? 0 : -1);

    // Firelight halo under each figure so they read as lit from the fire.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255,170,80,0.07)';
    ctx.fillRect(R(x - 9), R(y - 22), 18, 22);
    ctx.restore();

    safe(() => drawActor(ctx, ch, R(x), R(y + bob), {
      dir: down ? 'down' : slot.dir,
      scale: 1,
      shadow: true,
      idleBob: !down && phase >= 1,
      downed: down,
      alpha: down ? 0.7 : 1,
      tint: opts.tint || '#ffb066',
      tintAmt: opts.tintAmt == null ? 0.18 : opts.tintAmt,
    }));

    if (opts.focus === i) {
      // A small gold caret over whoever is being asked a question.
      const cy = y - 30 + Math.sin(t * 4) * 1.2;
      safe(() => UI.icon(ctx, 'arrow-down', R(x) - 4, R(cy), 8, C.gold));
    }
    if (down) {
      safe(() => UI.icon(ctx, 'skull', R(x) - 4, R(y) - 30, 8, C.bad));
    }
  }
}

// ===========================================================================
// 3. A HAND-DRAWN HIT DIE
//
// UI.diceRoll is the d20 popup; a hit die is a d6/d8/d10/d12, so this draws a
// small faceted solid that can show any face on any die.
// ===========================================================================

function drawHitDie(ctx, cx, cy, sides, face, t, scale = 2) {
  const s = Math.max(1, Math.round(scale));
  const rad = 9 * s;
  const tumbling = face == null;
  const step = Math.floor(t * 24);
  const shown = tumbling ? (hashStr(`hd:${sides}:${step}`) % Math.max(1, sides)) + 1 : face;
  const wob = tumbling ? Math.sin(t * 33) * 0.11 : 0;

  ctx.save();
  ctx.translate(R(cx), R(cy));
  ctx.rotate(wob);

  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.ellipse(0, rad + 4 * s, rad * 0.9, 3 * s, 0, 0, Math.PI * 2);
  ctx.fill();

  const n = sides <= 6 ? 4 : sides <= 8 ? 3 : sides <= 10 ? 5 : 6;
  const rot = sides <= 6 ? Math.PI / 4 : -Math.PI / 2;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    pts.push([Math.cos(a) * rad, Math.sin(a) * rad]);
  }
  const g = ctx.createLinearGradient(0, -rad, 0, rad);
  g.addColorStop(0, '#f4ecd8');
  g.addColorStop(1, '#b0a68e');
  ctx.beginPath();
  ctx.moveTo(R(pts[0][0]), R(pts[0][1]));
  for (let i = 1; i < pts.length; i++) ctx.lineTo(R(pts[i][0]), R(pts[i][1]));
  ctx.closePath();
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = '#4a4234';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(90,80,60,0.55)';
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) { ctx.moveTo(0, 0); ctx.lineTo(R(pts[i][0]), R(pts[i][1])); }
  ctx.stroke();
  ctx.restore();

  txtC(ctx, cx, cy - (tumbling ? 4 : 7), String(shown), {
    size: tumbling ? 'md' : 'lg', color: '#221d16', shadow: false,
  });
  txtC(ctx, cx, cy + rad + 8, `d${sides}`, { size: 'sm', color: C.inkDim, shadow: true });
}

// ===========================================================================
// 4. A SMALL MODAL
//
// Both scenes need "are you sure" and "which rest" prompts. One implementation,
// keyboard and mouse, styled like the rest of the game's windows.
// ===========================================================================

class Modal {
  constructor(title, body, options, onPick) {
    this.title = title || '';
    this.body = body || '';
    this.options = arr(options).map((o) => (typeof o === 'string' ? { label: o, value: o } : o)).filter(Boolean);
    this.onPick = typeof onPick === 'function' ? onPick : null;
    this.index = Math.max(0, this.options.findIndex((o) => !o.disabled));
    this.rects = [];
    sfx('open');
  }

  /** @returns true while the modal is still open. */
  update() {
    this.index = navV(this.index, this.options.length);
    const m = Input.mouse;
    for (let i = 0; i < this.rects.length; i++) {
      const r = this.rects[i];
      if (hit(m, r.x, r.y, r.w, r.h)) {
        if (this.index !== i) { this.index = i; sfx('cursor'); }
        if (clickedIn(m, r.x, r.y, r.w, r.h)) return this._pick();
      }
    }
    if (Input.consume('confirm')) return this._pick();
    if (Input.consume('cancel')) { sfx('back'); if (this.onPick) this.onPick(null, -1); return false; }
    return true;
  }

  _pick() {
    const o = this.options[this.index];
    if (!o || o.disabled) { sfx('error'); return true; }
    sfx('select');
    if (this.onPick) this.onPick(o.value !== undefined ? o.value : o.label, this.index);
    return false;
  }

  draw(ctx, t) {
    UI.scrim(ctx, 0.58);
    const w = 250;
    const lines = this.body ? UI.wrapLines(this.body, w - 26, 'sm') : [];
    const h = 16 + lines.length * 9 + this.options.length * 15 + 8;
    const x = R((VIEW_W - w) / 2);
    const y = clamp(R((VIEW_H - h) / 2), 14, Math.max(14, VIEW_H - h - 8));
    UI.window(ctx, x, y, w, h, this.title, { style: 'window' });
    let ty = y + 8;
    for (const l of lines) { txt(ctx, x + 13, ty, l, { size: 'sm', color: C.ink, shadow: true }); ty += 9; }
    ty += 4;
    this.rects = [];
    this.options.forEach((o, i) => {
      const bw = w - 42, bx = x + 21, by = ty + i * 15;
      UI.button(ctx, bx, by, bw, 13, o.label, {
        selected: i === this.index, disabled: !!o.disabled, t, icon: o.icon || null,
      });
      this.rects.push({ x: bx, y: by, w: bw, h: 13 });
    });
    const sel = this.options[this.index];
    if (sel && sel.disabled && sel.reason) {
      txtC(ctx, VIEW_W / 2, y + h + 5, sel.reason, { size: 'sm', color: C.bad, shadow: true, maxWidth: w });
    }
  }
}

// ===========================================================================
// 5. REST SCENE
// ===========================================================================

/** Parse the die lines rules/character.js#restShort writes into its log. */
const HD_LINE = /spends a (d\d+):\s*\[(\d+)\]([+-]\d+)\s*=\s*(\d+)\s*HP/i;

export class RestScene {
  /**
   * @param {'short'|'long'} kind
   * @param {object} opts { inn:bool, cost:gp, mapId, biome, place, onDone(result) }
   */
  constructor(kind = 'short', opts = {}) {
    this.id = 'rest';
    this.opaque = true;
    this.pausesBelow = true;
    this.uiLayer = true;

    this.kind = kind === 'long' ? 'long' : 'short';
    this.opts = opts || {};
    this.inn = !!this.opts.inn;
    this.cost = Math.max(0, Math.round(num(this.opts.cost, 0)));
    this.where = placeInfo(this.opts);
    this.onDone = typeof this.opts.onDone === 'function' ? this.opts.onDone : null;

    this.t = 0;
    this.phaseT = 0;
    this.phase = 'choose';       // choose | roll | night | watch | summary
    this.msg = '';
    this.msgT = 0;
    this.msgBad = false;
    this.modal = null;
    this._closed = false;

    this.fire = new Fire(`${this.where.mapId || 'camp'}:${this.kind}`);
    this.skySeed = String(this.where.mapId || 'camp');

    // --- short rest ------------------------------------------------------
    this.ci = 0;                 // whose turn it is to decide
    this.spend = 0;              // dice the current character will burn
    this.steps = [];             // resolved die rolls for the current character
    this.step = 0;               // which die is on screen
    this.tumbling = false;       // true while that die is still in the air
    this.stepT = 0;
    this.shownHp = 0;
    this.targetHp = 0;
    this.results = [];           // [{ ch, dice, healed, lines:[], returned:[] }]

    // --- long rest -------------------------------------------------------
    this.nightP = 0;
    this.nightDur = 4.2;
    this.nightMinutes = 480;
    this.advanced = 0;
    this.startMinutes = num(S() && S().time, 480);
    this.dream = null;
    this.encounter = null;       // { spec, dc, watcher, roll, ambush }
    this.interrupted = false;
    this.watchT = 0;
    this.watchStage = 0;         // 0 rolling, 1 landed, 2 read out
    this.before = new Map();
    this.longLog = [];
    this.paid = 0;

    this.scroll = 0;
    this.rowRects = [];
  }

  // --- lifecycle ---------------------------------------------------------

  enter() {
    safe(() => Input.flush());
    safe(() => Audio.music(this.inn ? 'inn' : 'camp'));
    if (this.kind === 'short') this._beginShort();
    else this._askLong();
  }

  exit() { safe(() => FX.clear()); }

  say(text, bad = false, life = 3.0) {
    this.msg = String(text == null ? '' : text);
    this.msgBad = !!bad;
    this.msgT = life;
    if (bad) sfx('error');
  }

  close(result) {
    if (this._closed) return;
    this._closed = true;
    safe(() => FX.clear());
    if (this.onDone) safe(() => this.onDone(result || { kind: this.kind, done: false }));
    if (Game.top === this) Game.pop(result);
  }

  get members() { return arr(Party.members).filter(Boolean); }
  get current() { return this.members[this.ci] || null; }

  // =========================================================================
  // SHORT REST
  // =========================================================================

  _beginShort() {
    this.phase = 'choose';
    this.ci = -1;
    this._nextCharacter();
  }

  /** Walk to the next character who can meaningfully be asked a question. */
  _nextCharacter() {
    const list = this.members;
    let i = this.ci + 1;
    while (i < list.length && safe(() => isDead(list[i]), false)) i++;
    if (i >= list.length) { this._finishShort(); return; }
    this.ci = i;
    const ch = list[i];
    const free = hdFree(ch);
    const missing = Math.max(0, num(safe(() => maxHpOf(ch), ch.maxHp), 1) - num(ch.hp, 0));
    // A sensible opening bid: enough dice to roughly cover the wound, never more
    // than they have. The player can still take it to zero.
    const pools = hitDicePools(ch);
    const avg = pools.length ? pools[0].sides / 2 + 0.5 + num(safe(() => abilityMod(ch, 'con'), 0), 0) : 5;
    this.spend = clamp(Math.ceil(missing / Math.max(1, avg)), 0, free);
    this.steps = [];
    this.step = 0;
    this.tumbling = false;
    this.stepT = 0;
    this.shownHp = num(ch.hp, 0);
    this.targetHp = num(ch.hp, 0);
    this.phase = 'choose';
    this.phaseT = 0;
    sfx('cursor');
  }

  _updateShortChoose() {
    const ch = this.current;
    if (!ch) { this._finishShort(); return; }
    const free = hdFree(ch);

    if (Input.repeatConsume('left', 0.28, 0.10) && this.spend > 0) { this.spend--; sfx('cursor'); }
    if (Input.repeatConsume('right', 0.28, 0.10) && this.spend < free) { this.spend++; sfx('cursor'); }
    if (Input.consume('up')) { this.spend = free; sfx('cursor'); }
    if (Input.consume('down')) { this.spend = 0; sfx('cursor'); }

    const m = Input.mouse;
    for (const r of this.rowRects) {
      if (clickedIn(m, r.x, r.y, r.w, r.h)) {
        if (r.act === 'less' && this.spend > 0) { this.spend--; sfx('cursor'); }
        else if (r.act === 'more' && this.spend < free) { this.spend++; sfx('cursor'); }
        else if (r.act === 'go') { this._spendDice(); return; }
        else if (r.act === 'skip') { sfx('back'); this._nextCharacter(); return; }
      }
    }

    if (Input.consume('confirm')) { this._spendDice(); return; }
    if (Input.consume('cancel')) { sfx('back'); this.spend = 0; this._nextCharacter(); return; }
    if (Input.consume('menu')) { sfx('back'); this._finishShort(); }
  }

  /**
   * Hand the whole plan to rules/character.js in one call — it is the only place
   * allowed to touch hit points — then read the individual dice back out of its
   * log so the screen can show them landing one at a time.
   */
  _spendDice() {
    const ch = this.current;
    if (!ch) { this._nextCharacter(); return; }

    const before = restSnapshot(ch);
    this.before.set(ch.uid, before);
    const log = arr(safe(() => restShort(ch, this.spend), []));

    const steps = [];
    for (const raw of log) {
      const m = HD_LINE.exec(String(raw));
      if (!m) continue;
      steps.push({
        key: m[1],
        sides: parseInt(String(m[1]).replace(/\D/g, ''), 10) || 8,
        rolled: parseInt(m[2], 10) || 1,
        mod: parseInt(m[3], 10) || 0,
        gain: parseInt(m[4], 10) || 1,
      });
    }
    // Belt and braces: if the log format ever changes, synthesise something honest
    // out of the hit points that actually moved rather than showing nothing.
    if (!steps.length && this.spend > 0) {
      const delta = Math.max(0, num(ch.hp, 0) - before.hp);
      const pool = hitDicePools(ch)[0];
      const each = Math.max(1, Math.round(delta / this.spend));
      for (let i = 0; i < this.spend; i++) {
        steps.push({
          key: pool ? pool.key : 'd8', sides: pool ? pool.sides : 8,
          rolled: each, mod: 0, gain: each,
        });
      }
    }

    // What the hour gave back beyond hit points.
    const after = restSnapshot(ch);
    const returned = [];
    if (before.pactUsed > 0 && after.pactUsed === 0) {
      const p = ch.spells && ch.spells.pact;
      returned.push(`Pact Magic — ${num(p && p.max, 0)} slot${num(p && p.max, 0) === 1 ? '' : 's'} of ${ordinal(num(p && p.level, 1))} level`);
    }
    for (const k of Object.keys(before.res)) {
      if (before.res[k] > 0 && num(after.res[k], 0) === 0) {
        const r = ch.resources && ch.resources[k];
        returned.push(`${(r && r.name) || titleCase(k)} — ${num(r && r.max, 0)} back`);
      }
    }

    this.steps = steps;
    this.step = 0;
    this.tumbling = steps.length > 0;
    this.stepT = 0;
    this.shownHp = before.hp;
    this.targetHp = before.hp;
    this.results.push({
      ch,
      dice: steps.length,
      healed: Math.max(0, num(ch.hp, 0) - before.hp),
      before,
      returned,
      lines: [],
    });

    if (!steps.length) {
      // Nothing rolled — still worth reporting the resources, then move along.
      sfx('select');
      this._nextCharacter();
      return;
    }
    this.phase = 'roll';
    this.phaseT = 0;
    sfx('dice');
  }

  _updateShortRoll(dt) {
    this.stepT += dt;
    const res = this.results[this.results.length - 1];

    // The hit-point bar chases the resolved total rather than snapping.
    this.shownHp += (this.targetHp - this.shownHp) * Math.min(1, dt * 7);
    if (Math.abs(this.targetHp - this.shownHp) < 0.4) this.shownHp = this.targetHp;

    const mouse = Input.mouse;
    const skip = Input.consume('confirm') || Input.consume('cancel') || !!(mouse && mouse.clicked);
    if (skip && mouse) mouse.clicked = false;

    // The die is still in the air.
    if (this.tumbling) {
      if (this.stepT > 0.55 || skip) this._landStep();
      if (!skip) return;
    }

    if (skip) {
      // Fast-forward every die this character has left to throw.
      while (this.step < this.steps.length - 1) { this.step++; this._landStep(true); }
      this.shownHp = this.targetHp;
      this.stepT = 99;
    }

    if (this.stepT > 0.85) {
      if (this.step < this.steps.length - 1) {
        this.step++;
        this.tumbling = true;
        this.stepT = 0;
        sfx('dice');
      } else if (this.shownHp === this.targetHp) {
        sfx('select');
        this._nextCharacter();
      }
    }
    if (res && res.lines.length > 4) res.lines.splice(0, res.lines.length - 4);
  }

  /** Resolve the die currently on screen: bar, floater, log line. Idempotent. */
  _landStep(silent = false) {
    this.tumbling = false;
    if (!silent) this.stepT = 0;
    const s = this.steps[this.step];
    if (!s || s.line) return;

    const ch = this.current;
    const maxHp = Math.max(1, num(safe(() => maxHpOf(ch), 1), 1));
    const applied = Math.max(0, Math.min(s.gain, maxHp - this.targetHp));
    this.targetHp = Math.min(maxHp, this.targetHp + s.gain);

    const line = `d${s.sides} [${s.rolled}] ${signed(s.mod)} = ${s.gain} healed`;
    s.line = line;
    s.applied = applied;
    const res = this.results[this.results.length - 1];
    if (res) res.lines.push(line);

    if (!silent) {
      sfx(applied > 0 ? 'heal' : 'select');
      safe(() => FX.floater(200 + (this.step % 2 ? 14 : -14), 118, `+${applied}`, C.hpHeal, { size: 'md', dur: 0.9 }));
    }
  }

  _finishShort() {
    const st = S();
    if (st) safe(() => advanceTime(st, 60));
    safe(() => bus.emit(EV.REST, { kind: 'short' }));
    safe(() => bus.emit(EV.PARTY_CHANGE, { members: Party.members }));
    safe(() => toast('An hour by the fire. Wounds close, a little.'));
    this.phase = 'summary';
    this.phaseT = 0;
    this.scroll = 0;
    sfx('select');
  }

  // =========================================================================
  // LONG REST
  // =========================================================================

  _askLong() {
    const w = this.where;
    const can = Party.canAfford ? safe(() => Party.canAfford(this.cost), true) : true;
    const bits = [];
    bits.push(this.inn
      ? `A room at ${w.place}, eight hours, and nobody stepping over you in the night.`
      : `Eight hours on the ground at ${w.place}.`);
    if (this.cost > 0) bits.push(`Toblen wants ${this.cost} gp for the beds and the breakfast.`);
    if (!this.inn && w.danger > 0.01) bits.push('Somebody will have to keep watch.');
    bits.push('Hit points, half your spent Hit Dice, every slot and resource, and one level of exhaustion.');

    this.modal = new Modal('Long Rest', bits.join(' '), [
      {
        label: this.cost > 0 ? `Take the room — ${this.cost} gp` : 'Sleep',
        value: 'yes',
        icon: 'heart',
        disabled: this.cost > 0 && !can,
        reason: this.cost > 0 && !can ? `The purse holds ${Math.round(num(Party.gold, 0))} gp.` : '',
      },
      { label: 'Not yet', value: null, icon: 'foot' },
    ], (v) => {
      this.modal = null;
      if (v !== 'yes') { this.close({ kind: 'long', done: false }); return; }
      this._beginNight();
    });
  }

  _beginNight() {
    const st = S();
    if (this.cost > 0) {
      const ok = safe(() => Party.spendGold(this.cost), false);
      if (!ok) { this.say('The purse will not stretch that far.', true); this._askLong(); return; }
      this.paid = this.cost;
      sfx('coin');
    }

    // Snapshot everyone before the night so the summary can be honest.
    this.before = new Map();
    for (const ch of arr(Party.all ? Party.all() : Party.members)) {
      if (ch) this.before.set(ch.uid, restSnapshot(ch));
    }

    this.encounter = this._rollNightEncounter();
    this.interrupted = !!this.encounter;
    this.nightMinutes = this.interrupted ? 250 : 480;
    this.nightDur = this.interrupted ? 2.6 : 4.2;

    this.startMinutes = num(st && st.time, 480);
    this.advanced = 0;
    this.nightP = 0;
    this.dream = this._pickDream();
    this.fire.strength = 1;
    this.phase = 'night';
    this.phaseT = 0;
    safe(() => Audio.music(null));
    sfx('close');
  }

  /** Does something come out of the dark? Biome and party level decide. */
  _rollNightEncounter() {
    const w = this.where;
    if (this.inn || w.sheltered || w.danger <= 0) return null;
    const st = S();
    const scaling = LATE.scaling;
    if (!scaling || typeof scaling.rollEncounter !== 'function') return null;

    const level = Math.max(1, Math.round(num(safe(() => Party.levelAvg(), 1), 1)));
    const size = Math.max(1, this.members.length);
    const seedKey = `night:${w.mapId || w.biome}:${num(st && st.day, 1)}:${num(st && st.time, 0)}`;
    const r = makeRNG(hashStr(seedKey));
    if (!r.chance(w.danger)) return null;

    const spec = safe(() => scaling.rollEncounter({
      biome: w.biome, level, size, difficulty: 'medium', seed: hashStr(`${seedKey}:mob`),
    }), null);
    if (!spec || !arr(spec.monsters).length) return null;

    // The DC is the quietest thing out there, so a stealthy raider is harder to
    // hear than an owlbear crashing through the brush.
    let stealth = 2;
    for (const g of arr(spec.monsters)) {
      const m = MONSTERS()[g.id];
      const sk = m && m.skills && num(m.skills.stealth, 0);
      if (sk) stealth = Math.max(stealth, sk);
    }
    const dc = clamp(10 + stealth, 9, 25);

    // Whoever has the sharpest ears takes the watch.
    let watcher = null;
    let best = -99;
    for (const ch of this.members) {
      if (!safe(() => isAlive(ch), false)) continue;
      const sm = num(safe(() => skillMod(ch, 'perception').mod, 0), 0);
      if (sm > best) { best = sm; watcher = ch; }
    }
    if (!watcher) watcher = this.members[0] || null;

    // What the party's magic is worth to the one sitting up with the fire.
    // Alarm means nothing crosses the perimeter unheard: Advantage on the
    // watch, and no ambush even when the roll goes badly. A camp with no light
    // on it, and a watcher with no darkvision, is the other way about.
    const mods = safe(() => watchMods(this._campScene(), st, Party, watcher, w.mapId), null)
      || { adv: false, dis: false, ambush: true, why: '' };

    return {
      spec, dc, watcher, mod: best === -99 ? 0 : best, roll: null, level,
      adv: !!mods.adv, dis: !!mods.dis, canAmbush: mods.ambush !== false,
      why: mods.why || '', ambush: mods.ambush !== false,
    };
  }

  /**
   * A stand-in scene for rules/fieldworld, which reads `map.dark` and
   * `scene.spellLight` to decide whether the watch is squinting into the dark.
   * The real overworld is still on the stack underneath us, so borrow its light
   * rather than pretending the party never cast one.
   */
  _campScene() {
    const ow = safe(() => Game.scenes.find((sc) => sc && sc.id === 'overworld'), null);
    return {
      map: { id: this.where.mapId, dark: this.inn || this.where.sheltered ? 0 : 1 },
      spellLight: (ow && ow.spellLight) || null,
      entities: [],
      state: S(),
    };
  }

  _pickDream() {
    const st = S();
    const level = Math.max(1, Math.round(num(safe(() => Party.levelAvg(), 1), 1)));
    const tables = LATE.tables;
    const opts = {
      hasFlag: (f) => safe(() => hasFlag(st, f), false),
      where: this.where.mapId || null,
    };
    if (this.interrupted) opts.tag = 'omen';
    let d = null;
    if (tables && typeof tables.randomDream === 'function') {
      d = safe(() => tables.randomDream(rng, level, opts), null);
      if (!d && opts.tag) { delete opts.tag; d = safe(() => tables.randomDream(rng, level, opts), null); }
      if (!d) { delete opts.where; d = safe(() => tables.randomDream(rng, level, opts), null); }
    }
    if (!d) {
      const pool = INN_DREAMS();
      if (pool.length) d = safe(() => rng.pick(pool), pool[0]);
    }
    return d || null;
  }

  _updateNight(dt) {
    const st = S();
    const skip = Input.consume('confirm') || Input.consume('cancel') || (Input.mouse && Input.mouse.clicked);
    if (skip && Input.mouse) Input.mouse.clicked = false;
    if (skip) this.nightP = Math.max(this.nightP, 0.92);

    this.nightP = Math.min(1, this.nightP + dt / Math.max(0.5, this.nightDur));

    // Roll the world clock forward for real, in step with the fade, so it lands
    // exactly on the eight hours (or on the moment the night was broken).
    const want = Math.floor(this.nightMinutes * this.nightP);
    if (want > this.advanced) {
      const delta = want - this.advanced;
      this.advanced = want;
      if (st) safe(() => advanceTime(st, delta));
    }

    // The fire burns down as the hours go.
    this.fire.strength = clamp(1 - this.nightP * 0.85, 0.06, 1);

    if (this.nightP >= 1) {
      if (this.interrupted && this.encounter) { this._beginWatch(); return; }
      this._applyLongRest();
    }
  }

  // --- the watch ---------------------------------------------------------

  _beginWatch() {
    const e = this.encounter;
    this.phase = 'watch';
    this.phaseT = 0;
    this.watchT = 0;
    this.watchStage = 0;
    e.roll = safe(() => d20(e.mod, { dc: e.dc, adv: !!e.adv, dis: !!e.dis }), null)
      || { total: e.mod + 10, natural: 10, mod: e.mod, rolls: [10] };
    e.roll.dc = e.dc;
    e.success = num(e.roll.total, 0) >= e.dc;
    // A ward that gets tripped is not a surprise, however the Perception lands.
    e.ambush = !e.success && e.canAmbush !== false;
    sfx('dice');
    safe(() => Audio.music('tense'));
  }

  _updateWatch(dt) {
    this.watchT += dt;
    const e = this.encounter;
    const skip = Input.consume('confirm') || Input.consume('cancel') || (Input.mouse && Input.mouse.clicked);
    if (skip && Input.mouse) Input.mouse.clicked = false;

    if (this.watchStage === 0) {
      if (this.watchT > 0.75 || skip) {
        this.watchStage = 1;
        this.watchT = 0;
        sfx(e.success ? 'buff' : 'encounter');
        if (!e.success) safe(() => FX.shake(0.5, 0.4));
      }
      return;
    }
    if (this.watchStage === 1) {
      if (this.watchT > 1.1 || skip) { this.watchStage = 2; this.watchT = 0; }
      return;
    }
    if (skip || this.watchT > 3.4) this._toBattle();
  }

  _toBattle() {
    if (this._closed) return;
    const e = this.encounter;
    const combat = LATE.combat;
    const combatui = LATE.combatui;
    const scaling = LATE.scaling;

    const enemies = [];
    if (scaling && typeof scaling.makeMonster === 'function') {
      for (const g of arr(e && e.spec && e.spec.monsters)) {
        for (let i = 0; i < Math.max(1, num(g.count, 1)); i++) {
          const mob = safe(() => scaling.makeMonster(g.id, { level: num(e.level, 1) }), null);
          if (mob) { mob.side = 'foe'; enemies.push(mob); }
        }
      }
    }

    if (!enemies.length || !combat || typeof combat.buildEncounter !== 'function'
      || !combatui || typeof combatui.BattleScene !== 'function') {
      // Nothing to fight, or the battle engine is not loaded: the noise was a fox.
      this.say('Whatever it was, it thought better of it.');
      this.interrupted = false;
      this._applyLongRest();
      return;
    }

    const enc = safe(() => combat.buildEncounter({
      party: Party.members,
      enemies,
      biome: this.where.biome,
      ambush: !!e.ambush,
      seed: hashStr(`nightfight:${this.where.mapId || this.where.biome}:${num(S() && S().day, 1)}`),
    }), null);
    if (!enc) { this.interrupted = false; this._applyLongRest(); return; }

    this._closed = true;
    if (this.onDone) safe(() => this.onDone({ kind: 'long', done: false, interrupted: true }));
    safe(() => Game.transition('battle', () => {
      safe(() => FX.clear());
      if (Game.top === this) safe(() => Game.replace(new combatui.BattleScene(enc)));
      else safe(() => Game.push(new combatui.BattleScene(enc)));
    }));
  }

  // --- the morning -------------------------------------------------------

  _applyLongRest() {
    const st = S();
    const all = arr(Party.all ? Party.all() : Party.members).filter(Boolean);
    this.longLog = [];
    for (const ch of all) {
      if (!this.before.has(ch.uid)) this.before.set(ch.uid, restSnapshot(ch));
      const lines = arr(safe(() => restLong(ch), []));
      this.longLog.push({ ch, lines });
    }
    if (st && st.stats) st.stats.longRests = num(st.stats.longRests, 0) + 1;

    // A bed under a roof is a sanctuary, and Word of Recall wants to know where
    // the last one was. Inns and temples only: a bedroll in the Mere of Dead
    // Men is not somewhere the Weave will consent to put you down again.
    if (st && (this.inn || this.where.sheltered)) {
      safe(() => setRecallPoint(st, this.where.mapId || st.mapId, st.x, st.y,
        this.where.place || null, st.dir || 'down'));
    }

    safe(() => bus.emit(EV.REST, { kind: 'long' }));
    safe(() => bus.emit(EV.PARTY_CHANGE, { members: Party.members }));
    safe(() => Audio.music(this.inn ? 'inn' : 'camp'));
    sfx('levelup');
    this.phase = 'summary';
    this.phaseT = 0;
    this.scroll = 0;
  }

  // =========================================================================
  // UPDATE
  // =========================================================================

  update(dt) {
    this.t += dt;
    this.phaseT += dt;
    if (this.msgT > 0) { this.msgT -= dt; if (this.msgT <= 0) this.msg = ''; }

    const fx = this._firePos();
    this.fire.update(dt, fx.x, fx.y);

    // A modal's callback may open a replacement modal, so only clear the one we
    // actually ran.
    if (this.modal) {
      const m = this.modal;
      if (!m.update() && this.modal === m) this.modal = null;
      return;
    }

    if (this.phase === 'choose') this._updateShortChoose();
    else if (this.phase === 'roll') this._updateShortRoll(dt);
    else if (this.phase === 'night') this._updateNight(dt);
    else if (this.phase === 'watch') this._updateWatch(dt);
    else if (this.phase === 'summary') this._updateSummary();
  }

  _updateSummary() {
    const maxScroll = this._summaryMaxScroll();
    if (Input.repeatConsume('down')) { this.scroll = Math.min(maxScroll, this.scroll + 1); sfx('cursor'); }
    if (Input.repeatConsume('up')) { this.scroll = Math.max(0, this.scroll - 1); sfx('cursor'); }
    const m = Input.mouse;
    if (m && m.wheel) { this.scroll = clamp(this.scroll + (m.wheel > 0 ? 1 : -1), 0, maxScroll); m.wheel = 0; }
    const click = m && m.clicked;
    if (Input.consume('confirm') || Input.consume('cancel') || Input.consume('menu') || click) {
      if (click) m.clicked = false;
      sfx('select');
      this.close({ kind: this.kind, done: true, interrupted: false });
    }
  }

  _summaryMaxScroll() {
    const rows = this.kind === 'short' ? this.results.length : this.longLog.length;
    return Math.max(0, rows - 3);
  }

  /** The hearth or the campfire — everything in the scene is laid out around it. */
  _firePos() {
    if (this.inn) return { x: 306, y: 202 };
    return { x: 200, y: this.phase === 'night' ? 206 : 200 };
  }

  /** Where bedrolls go when everyone is asleep — beside the fire, not in it. */
  _sleepCentre(f) {
    return this.inn ? { x: 170, y: 198 } : f;
  }

  // =========================================================================
  // DRAW
  // =========================================================================

  draw(ctx) {
    this.rowRects = [];
    const f = this._firePos();

    this._drawScene(ctx, f);

    if (this.phase === 'choose') this._drawShortChoose(ctx);
    else if (this.phase === 'roll') this._drawShortRoll(ctx);
    else if (this.phase === 'night') this._drawNight(ctx);
    else if (this.phase === 'watch') this._drawWatch(ctx);
    else if (this.phase === 'summary') this._drawSummary(ctx);

    drawStatus(ctx, this.msg, this.msgBad, clamp(this.msgT / 0.5, 0, 1), 198);

    safe(() => FX.draw(ctx, 0, 0));
    if (this.modal) this.modal.draw(ctx, this.t);
  }

  /** Backdrop + fire + party. Everything else is drawn over the top of this. */
  _drawScene(ctx, f) {
    const night = this.phase === 'night';
    const dark = night ? clamp(this.nightP, 0, 1) : 0;

    if (this.inn) {
      drawInnRoom(ctx, this.t, f.x, f.y);
    } else {
      const moonP = night ? clamp(0.12 + this.nightP * 0.76, 0, 1) : 0.42;
      drawNightSky(ctx, this.t, this.skySeed, moonP, night ? 0.5 + dark * 0.5 : 0.8);
      drawCampGround(ctx, this.t, this.skySeed);
      if (!night) drawCampKit(ctx, f.x, f.y);
    }

    this.fire.drawGlow(ctx, f.x, f.y, this.inn ? 118 : 104);
    this.fire.draw(ctx, f.x, f.y, { hearth: this.inn });

    if (night) {
      // The party is asleep: draw them lying down, low and still.
      this._drawSleepers(ctx, this._sleepCentre(f));
    } else {
      drawPartyRing(ctx, this.members, f.x, f.y, this.t, {
        focus: (this.phase === 'choose' || this.phase === 'roll') ? this.ci : -1,
      });
    }

    // A vignette so the panels above always sit on something dark enough to read.
    const v = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    v.addColorStop(0, 'rgba(4,4,10,0.72)');
    v.addColorStop(0.55, 'rgba(4,4,10,0.30)');
    v.addColorStop(1, 'rgba(4,4,10,0.55)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    if (night) {
      ctx.fillStyle = `rgba(2,3,8,${0.28 + dark * 0.34})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
  }

  _drawSleepers(ctx, f) {
    const list = this.members;
    const spots = [[f.x - 62, f.y + 8], [f.x + 46, f.y + 8], [f.x - 30, f.y + 22], [f.x + 16, f.y + 22]];
    list.slice(0, 4).forEach((ch, i) => {
      const [bx, by] = spots[i] || spots[0];
      const cw = (ch && ch.colorway) || null;
      const blanket = (cw && cw.MAIN) || '#4a3a2a';
      const breathe = Math.sin(this.t * 1.1 + i * 1.3) * 0.6;
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(R(bx) - 1, R(by) + 5, 22, 3);
      ctx.fillStyle = blanket;
      ctx.fillRect(R(bx), R(by + breathe), 20, 6);
      ctx.fillStyle = UI.shade ? safe(() => UI.shade(blanket, 0.25), blanket) : blanket;
      ctx.fillRect(R(bx), R(by + breathe), 20, 1);
      // a head at one end
      ctx.fillStyle = (cw && cw.SKIN) || '#e0a878';
      ctx.fillRect(R(bx) - 4, R(by + breathe) + 1, 4, 4);
      ctx.fillStyle = (cw && cw.HAIR) || '#3a2416';
      ctx.fillRect(R(bx) - 4, R(by + breathe), 4, 2);
    });
  }

  _drawHeader(ctx, right) {
    UI.panel(ctx, 2, 2, VIEW_W - 4, 13, { style: 'dark', shadow: 0.3 });
    const title = this.kind === 'short' ? 'Short Rest — one hour' : 'Long Rest — eight hours';
    txt(ctx, 7, 5, title, { size: 'sm', color: C.goldBright, maxWidth: 168, shadow: true });
    const st = S();
    const clock = st ? `${clockText(num(st.time, 0))} · ${titleCase(timeOfDay(num(st.time, 0)))}` : '';
    txt(ctx, 180, 5, this.where.place, { size: 'sm', color: C.inkDim, maxWidth: 110, shadow: true });
    txtR(ctx, VIEW_W - 7, 5, right || clock, { size: 'sm', color: C.inkDim, maxWidth: 100, shadow: true });
  }

  // --- short rest: the question ------------------------------------------

  _drawShortChoose(ctx) {
    const ch = this.current;
    if (!ch) return;
    this._drawHeader(ctx, `${this.ci + 1} of ${this.members.length}`);
    this._drawCharacterCard(ctx, ch, 6, 19, 200, 92, num(ch.hp, 0));
    this._drawLedger(ctx, 210, 19, VIEW_W - 216, 92, ch);

    // --- the dial ---------------------------------------------------------
    // 36 tall put the third line's baseline ON the panel's own bottom ring, so
    // "Spend nothing and keep the dice for a worse day." was drawn with its
    // descenders sheared off. The cards above stop at y=111 and the button
    // below starts at 155, so the plate takes the two spare pixels.
    const p = UI.panel(ctx, 6, 113, VIEW_W - 12, 39, { style: 'window' });
    const ix = p.ix + 5, iw = p.iw - 10;
    const free = hdFree(ch);
    const pools = hitDicePools(ch);
    const die = pools.length ? pools[0].key : 'd8';
    const conMod = num(safe(() => abilityMod(ch, 'con'), 0), 0);

    txt(ctx, ix, p.iy + 3, `How many Hit Dice will ${shortName(ch.name)} spend?`, {
      size: 'sm', color: C.ink, maxWidth: iw - 130, shadow: true,
    });

    // pip row: filled = about to be spent, hollow = still in the pool
    const pipY = p.iy + 16;
    let px = ix;
    const cap = Math.min(free, 14);
    safe(() => UI.pips(ctx, px, pipY, cap, this.spend, { size: 5, gap: 2, color: C.gold, bg: 'rgba(255,255,255,0.13)' }));
    px += cap * 7 + 6;
    if (free > cap) { txt(ctx, px, pipY - 1, `+${free - cap}`, { size: 'sm', color: C.inkDim }); px += 16; }

    // the ◄ n ► stepper
    const sx = ix + iw - 128;
    const lessOn = this.spend > 0;
    const moreOn = this.spend < free;
    txt(ctx, sx, pipY - 1, '◄', { size: 'md', color: lessOn ? C.gold : C.disabled });
    txtC(ctx, sx + 26, pipY - 2, `${this.spend}`, { size: 'lg', color: this.spend ? C.goldBright : C.inkDim });
    txt(ctx, sx + 44, pipY - 1, '►', { size: 'md', color: moreOn ? C.gold : C.disabled });
    txt(ctx, sx + 58, pipY - 1, `of ${free} ${die}`, { size: 'sm', color: C.inkDim, maxWidth: 62 });
    this.rowRects.push({ x: sx - 4, y: pipY - 4, w: 16, h: 14, act: 'less' });
    this.rowRects.push({ x: sx + 40, y: pipY - 4, w: 16, h: 14, act: 'more' });

    // expected value, so the player can make a real decision
    const avg = pools.length ? (pools[0].sides / 2 + 0.5 + conMod) : 5;
    const est = Math.max(0, Math.round(this.spend * avg));
    txt(ctx, ix, p.iy + 25, this.spend
      ? `Around ${est} hit points — ${die} ${signed(conMod)} a die, never under 1.`
      : 'Spend nothing and keep the dice for a worse day.', {
      size: 'sm', color: C.inkDim, maxWidth: iw - 4,
    });

    // "Rest anyway" is 76px at md and a 92px plate carrying a 10px icon has a
    // 71px face, so the default label read "Rest anyw…".
    const bw = 104;
    const bx = VIEW_W - bw - 8;
    UI.button(ctx, bx, 155, bw, 15, this.spend ? 'Roll them' : 'Rest anyway', { selected: true, t: this.t, icon: 'dice' });
    this.rowRects.push({ x: bx, y: 155, w: bw, h: 15, act: 'go' });

    hintBar(ctx, 224, [['←→', 'Dice'], ['Z', 'Confirm'], ['X', 'Skip them'], ['M', 'End the rest']]);
  }

  /** Portrait, name, hit-point bar and the pools of dice they carry. */
  _drawCharacterCard(ctx, ch, x, y, w, h, hpShown) {
    const p = UI.panel(ctx, x, y, w, h, { style: 'window' });
    const ix = p.ix + 4, iw = p.iw - 8;
    safe(() => UI.portrait(ctx, ch, ix, p.iy + 2, 30, { shadow: 0.3 }));
    txt(ctx, ix + 35, p.iy + 3, ch.name || 'Adventurer', { size: 'md', color: C.goldBright, maxWidth: iw - 37, shadow: true });
    txt(ctx, ix + 35, p.iy + 13, classText(ch), { size: 'sm', color: C.inkDim, maxWidth: iw - 37, shadow: true });

    const maxHp = Math.max(1, num(safe(() => maxHpOf(ch), 1), 1));
    const shown = clamp(num(hpShown, num(ch.hp, 0)), 0, maxHp);
    const barW = iw - 37;
    UI.bar(ctx, ix + 35, p.iy + 22, barW, 7, shown / maxHp, {
      color: hpColor(ch), label: `${Math.round(shown)} / ${maxHp}`, labelColor: C.inkBright, size: 'sm',
    });

    let ry = p.iy + 36;
    ry = head(ctx, ix, ry, iw, 'HIT DICE');
    const pools = hitDicePools(ch);
    if (!pools.length) {
      txt(ctx, ix + 2, ry, 'None — this one heals the hard way.', { size: 'sm', color: C.disabled, maxWidth: iw - 4 });
    } else {
      for (const pool of pools.slice(0, 3)) {
        safe(() => UI.icon(ctx, 'dice', ix, ry - 1, 8, pool.free ? C.gold : C.disabled));
        txt(ctx, ix + 11, ry, pool.key, { size: 'sm', color: C.ink, maxWidth: 30 });
        const pipW = safe(() => UI.pips(ctx, ix + 34, ry + 1, Math.min(pool.max, 12), pool.free, {
          size: 4, gap: 2, color: C.goldBright, bg: 'rgba(255,255,255,0.12)',
        }), 0) || 0;
        txtR(ctx, ix + iw, ry, `${pool.free}/${pool.max}`, { size: 'sm', color: C.inkDim });
        ry += 10;
      }
    }
    const ex = num(safe(() => exhaustionLevel(ch), 0), 0);
    if (ex > 0 && ry < p.iy + p.ih - 10) {
      safe(() => UI.icon(ctx, 'skull', ix, ry - 1, 8, C.bad));
      txt(ctx, ix + 11, ry, `Exhaustion ${ex}`, { size: 'sm', color: C.bad, maxWidth: 80 });
      txtR(ctx, ix + iw, ry, 'needs a night', { size: 'sm', color: C.bad, maxWidth: 84 });
    }
    return p;
  }

  /** What the hour buys, and what it does not. */
  _drawLedger(ctx, x, y, w, h, ch) {
    const p = UI.panel(ctx, x, y, w, h, { style: 'window' });
    const ix = p.ix + 4, iw = p.iw - 8;
    const led = restLedger(ch);
    let ry = p.iy + 3;

    ry = head(ctx, ix, ry, iw, 'RETURNS AT THIS FIRE', C.goldDim);
    if (!led.now.length) {
      txt(ctx, ix + 2, ry, 'Nothing but breath and bandages.', { size: 'sm', color: C.disabled, maxWidth: iw - 4 });
      ry += 10;
    } else {
      for (const row of led.now.slice(0, 4)) {
        safe(() => UI.icon(ctx, row.icon, ix, ry - 1, 8, C.good));
        // `iw - 60` for the name and a flat 96 for the value add up to 206 in a
        // 159px row: a long feature name and a long "n spent → m" printed
        // through each other. kv() splits the row instead of guessing at it.
        kv(ctx, ix + 11, ry, iw - 11, row.name,
          row.spent > 0 ? `${row.spent} spent → ${row.max}` : row.text,
          { color: row.spent > 0 ? C.good : C.inkDim, labelColor: C.goldBright });
        ry += 9;
      }
    }

    if (ry < p.iy + p.ih - 20) {
      ry += 2;
      ry = head(ctx, ix, ry, iw, 'WAITS FOR THE NIGHT', 'rgba(140,120,90,0.9)');
      if (!led.later.length) {
        txt(ctx, ix + 2, ry, 'Nothing outstanding.', { size: 'sm', color: C.disabled, maxWidth: iw - 4 });
      } else {
        const room = Math.max(0, Math.floor((p.iy + p.ih - ry - 2) / 9));
        const show = led.later.slice(0, room);
        for (const row of show) {
          safe(() => UI.icon(ctx, row.icon, ix, ry - 1, 8, C.disabled));
          kv(ctx, ix + 11, ry, iw - 11, row.name,
            row.spent > 0 ? `${row.spent} spent` : row.text,
            { color: C.disabled, labelColor: C.disabled });
          ry += 9;
        }
        if (led.later.length > show.length) {
          txt(ctx, ix + 11, ry, `+${led.later.length - show.length} more`, { size: 'sm', color: C.disabled });
        }
      }
    }
  }

  // --- short rest: the dice landing --------------------------------------

  _drawShortRoll(ctx) {
    const ch = this.current;
    if (!ch) return;
    this._drawHeader(ctx, `${this.ci + 1} of ${this.members.length}`);
    this._drawCharacterCard(ctx, ch, 6, 19, 200, 92, this.shownHp);
    this._drawLedger(ctx, 210, 19, VIEW_W - 216, 92, ch);

    const p = UI.panel(ctx, 6, 115, VIEW_W - 12, 56, { style: 'dark', shadow: 0.35 });
    const ix = p.ix + 6, iw = p.iw - 12;

    const idx = clamp(this.step, 0, Math.max(0, this.steps.length - 1));
    const s = this.steps[idx] || null;
    const tumbling = this.tumbling;
    if (s) {
      drawHitDie(ctx, ix + 26, p.iy + 26, s.sides, tumbling ? null : s.rolled, this.stepT, 2);
    }

    // The line, exactly as the rules produced it.
    const lineX = ix + 58;
    if (s && !tumbling) {
      const line = `d${s.sides} [${s.rolled}] ${signed(s.mod)} = ${s.gain} healed`;
      txt(ctx, lineX, p.iy + 8, line, { size: 'lg', color: C.goldBright, maxWidth: iw - 62, shadow: true });
      if (s.applied != null && s.applied < s.gain) {
        txt(ctx, lineX, p.iy + 22, `${s.applied} of it lands; the rest spills over.`, {
          size: 'sm', color: C.inkDim, maxWidth: iw - 62,
        });
      }
    } else {
      txt(ctx, lineX, p.iy + 10, 'The die goes across the blanket…', { size: 'md', color: C.inkDim, maxWidth: iw - 62 });
    }

    // Every die this character has already thrown.
    const done = this.steps.filter((x) => x.line);
    let ry = p.iy + 34;
    const shown = done.slice(-2);
    for (const x of shown) {
      txt(ctx, lineX, ry, x.line, { size: 'sm', color: C.inkDim, maxWidth: iw - 62 });
      ry += 9;
    }
    txtR(ctx, ix + iw, p.iy + 8, `Die ${Math.min(this.steps.length, idx + 1)} of ${this.steps.length}`, {
      size: 'sm', color: C.goldDim,
    });
    const total = done.reduce((a, x) => a + num(x.applied, 0), 0);
    if (total > 0) {
      txtR(ctx, ix + iw, p.iy + 20, `+${total} hit points`, { size: 'md', color: C.hpHeal });
    }

    hintBar(ctx, 224, [['Z', 'Hurry it along']]);
  }

  // --- long rest: the night passing --------------------------------------

  _drawNight(ctx) {
    const st = S();
    const shownMin = this.startMinutes + this.advanced;
    const p = clamp(this.nightP, 0, 1);

    // Big clock, riding above the sleeping camp.
    const cw = 176;
    const cx = R((VIEW_W - cw) / 2);
    UI.panel(ctx, cx, 30, cw, 40, { style: 'dark', shadow: 0.5 });
    txtC(ctx, VIEW_W / 2, 35, clockText(shownMin), { size: 'lg', color: C.goldBright, shadow: true });
    txtC(ctx, VIEW_W / 2, 50, dateText(num(st && st.day, 1)), { size: 'sm', color: C.inkDim, shadow: true, maxWidth: cw - 12 });
    const hours = Math.floor(this.advanced / 60);
    UI.bar(ctx, cx + 8, 60, cw - 16, 5, this.advanced / Math.max(1, this.nightMinutes), {
      color: C.mp, segments: 8,
      label: `${hours} of ${Math.round(this.nightMinutes / 60)} hours`, labelColor: C.ink, size: 'sm',
    });

    // The dream: a soft vignette that swims up in the middle of the night.
    const d = this.dream;
    if (d && p > 0.24 && p < 0.94) {
      const k = clamp(Math.min((p - 0.24) / 0.18, (0.94 - p) / 0.16), 0, 1);
      ctx.save();
      ctx.globalAlpha = k;
      const dw = 300;
      const dx = R((VIEW_W - dw) / 2);
      const lines = UI.wrapLines(String(d.text || ''), dw - 24, 'sm').slice(0, 5);
      const dh = 26 + lines.length * 9;
      UI.panel(ctx, dx, 86, dw, dh, { style: 'window', shadow: 0.5, alpha: 0.94 });
      safe(() => UI.icon(ctx, d.tag === 'dark' || d.tag === 'omen' ? 'eye' : 'star', dx + 8, 92, 10,
        d.tag === 'dark' || d.tag === 'omen' ? C.purple : C.gold));
      txt(ctx, dx + 22, 93, d.tag === 'omen' ? 'AN OMEN' : d.tag === 'dark' ? 'A DARK DREAM' : 'A DREAM', {
        size: 'sm', color: C.goldDim, maxWidth: dw - 30,
      });
      UI.divider(ctx, dx + 8, 103, dw - 16, { color: C.border });
      let dy = 108;
      for (const l of lines) { txt(ctx, dx + 12, dy, l, { size: 'sm', color: C.ink, shadow: true }); dy += 9; }
      ctx.restore();
    }

    // The last of the fire, and the black creeping in from the edges.
    const fade = ctx.createRadialGradient(VIEW_W / 2, 150, 40, VIEW_W / 2, 150, 250);
    fade.addColorStop(0, 'rgba(0,0,0,0)');
    fade.addColorStop(1, `rgba(0,0,0,${0.35 + p * 0.4})`);
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    if (this.interrupted && p > 0.8) {
      const pulse = 0.4 + 0.6 * Math.abs(Math.sin(this.t * 5));
      txtC(ctx, VIEW_W / 2, 196, 'Something is moving out past the firelight.', {
        size: 'sm', color: `rgba(212,85,63,${pulse})`, shadow: true, maxWidth: 320,
      });
    }

    hintBar(ctx, 224, [['Z', 'Sleep on']]);
  }

  // --- long rest: the watch check ----------------------------------------

  _drawWatch(ctx) {
    const e = this.encounter;
    if (!e) return;
    this._drawHeader(ctx, 'The watch');

    UI.panel(ctx, 2, 16, VIEW_W - 4, 13, { style: 'gold', shadow: 0.3, studs: false });
    txt(ctx, 8, 19, 'The night is broken', { size: 'md', color: '#2a1c07', maxWidth: 200 });
    txtR(ctx, VIEW_W - 8, 20, `Wisdom (Perception) vs DC ${e.dc}`, { size: 'sm', color: '#5a4318', maxWidth: 170 });

    // Who is awake.
    const wp = UI.panel(ctx, 6, 34, 150, 62, { style: 'window' });
    const wx = wp.ix + 4, ww = wp.iw - 8;
    safe(() => UI.portrait(ctx, e.watcher, wx, wp.iy + 3, 28, { shadow: 0.3 }));
    txt(ctx, wx + 33, wp.iy + 4, (e.watcher && e.watcher.name) || 'The watch', {
      size: 'md', color: C.goldBright, maxWidth: ww - 35, shadow: true,
    });
    txt(ctx, wx + 33, wp.iy + 14, 'has the watch', { size: 'sm', color: C.inkDim, maxWidth: ww - 35 });
    txt(ctx, wx + 33, wp.iy + 23, `Perception ${signed(num(e.mod, 0))}`, { size: 'sm', color: C.ink, maxWidth: ww - 35 });
    UI.divider(ctx, wx, wp.iy + 36, ww, { color: C.border });
    txt(ctx, wx, wp.iy + 41, 'A stick goes over out in the dark, and then nothing at all.', {
      size: 'sm', color: C.inkDim, maxWidth: ww, wrap: true,
    });

    // The die, big, centre-right.
    const dx = 260, dy = 66;
    safe(() => UI.diceRoll(ctx, dx, dy, { ...e.roll, dc: e.dc }, this.watchT + (this.watchStage ? 1 : 0)));

    if (this.watchStage >= 1) {
      const good = !!e.success;
      const line = `${num(e.roll && e.roll.natural, 10)} ${signed(num(e.mod, 0))} = ${num(e.roll && e.roll.total, 10)} vs DC ${e.dc}`;
      const w = UI.measure(line, 'md') + 18;
      UI.panel(ctx, R(dx - w / 2), 100, w, 15, { style: 'dark', shadow: 0.4 });
      txtC(ctx, dx, 104, line, { size: 'md', color: good ? C.good : C.bad });
      txtC(ctx, dx, 120, good ? 'HEARD THEM' : 'TOO LATE', {
        size: 'md', color: good ? C.good : C.bad, shadow: true,
      });
    }

    if (this.watchStage >= 2) {
      const p = UI.panel(ctx, 6, 128, VIEW_W - 12, 62, { style: 'window' });
      const ix = p.ix + 5, iw = p.iw - 10;
      const good = !!e.success;
      const spec = e.spec || {};
      const names = arr(spec.monsters).map((g) => {
        const mm = MONSTERS()[g.id];
        const nm = (mm && mm.name) || titleCase(String(g.id || '').replace(/-/g, ' '));
        return num(g.count, 1) > 1 ? `${g.count} ${nm}s` : nm;
      });
      let ry = p.iy + 3;
      ry = head(ctx, ix, ry, iw, good ? 'ROUSED IN TIME' : 'CAUGHT IN THE BLANKETS');
      const body = good
        ? `${(e.watcher && e.watcher.name) || 'The watch'} has the party up and armed before they reach the fire. You are not surprised.`
        : `They are inside the firelight before anyone stirs. The party fights at a disadvantage on the first exchange.`;
      const wr = UI.textWrapped(ctx, ix, ry, iw, body, { size: 'sm', color: good ? C.ink : C.bad, maxLines: 3 });
      ry += wr.height + 3;
      UI.divider(ctx, ix, ry, iw, { color: C.border });
      ry += 5;
      safe(() => UI.icon(ctx, 'skull', ix, ry - 1, 8, C.foe));
      txt(ctx, ix + 11, ry, names.join(', ') || 'Something out of the dark', {
        size: 'sm', color: C.foe, maxWidth: iw - 152, shadow: true,
      });
      txtR(ctx, ix + iw, ry, 'The long rest is lost.', { size: 'sm', color: C.warn, maxWidth: 140 });
    }

    hintBar(ctx, 224, [['Z', this.watchStage >= 2 ? 'Draw steel' : 'Go on']]);
  }

  // --- summaries ----------------------------------------------------------

  _drawSummary(ctx) {
    if (this.kind === 'short') this._drawShortSummary(ctx);
    else this._drawLongSummary(ctx);
    hintBar(ctx, 224, [['Z', 'Back to it'], ['↑↓', 'Scroll']]);
  }

  _drawShortSummary(ctx) {
    this._drawHeader(ctx, 'Rested');
    UI.panel(ctx, 2, 16, VIEW_W - 4, 13, { style: 'gold', shadow: 0.3, studs: false });
    txt(ctx, 8, 19, 'An hour gone', { size: 'md', color: '#2a1c07', maxWidth: 200 });
    const healed = this.results.reduce((a, r) => a + num(r.healed, 0), 0);
    const dice = this.results.reduce((a, r) => a + num(r.dice, 0), 0);
    txtR(ctx, VIEW_W - 8, 20, `${dice} Hit ${dice === 1 ? 'Die' : 'Dice'} spent · ${healed} healed`, {
      size: 'sm', color: '#5a4318', maxWidth: 200,
    });

    const p = UI.panel(ctx, 6, 32, VIEW_W - 12, 116, { style: 'window' });
    const ix = p.ix + 5, iw = p.iw - 10;
    const rows = this.results;
    if (!rows.length) {
      txtC(ctx, ix + iw / 2, p.iy + 46, 'Nobody spent anything. The dice keep.', { size: 'sm', color: C.disabled, maxWidth: iw });
      return;
    }
    const start = clamp(this.scroll, 0, Math.max(0, rows.length - 1));
    let ry = p.iy + 4;
    const bottom = p.iy + p.ih - 4;
    for (let i = start; i < rows.length && ry < bottom - 10; i++) {
      const r = rows[i];
      const ch = r.ch;
      const maxHp = Math.max(1, num(safe(() => maxHpOf(ch), 1), 1));
      safe(() => UI.portrait(ctx, ch, ix, ry, 22, { shadow: 0.25 }));
      txt(ctx, ix + 27, ry, ch.name || '—', { size: 'md', color: C.goldBright, maxWidth: 120, shadow: true });
      txtR(ctx, ix + iw, ry, `${num(ch.hp, 0)} / ${maxHp}`, { size: 'sm', color: hpColor(ch) });
      UI.bar(ctx, ix + 27, ry + 11, iw - 27, 5, clamp(num(ch.hp, 0) / maxHp, 0, 1), {
        color: hpColor(ch), ghost: clamp(num(r.before && r.before.hp, 0) / maxHp, 0, 1), ghostColor: 'rgba(110,200,110,0.45)',
      });
      let sub = r.dice > 0
        ? `${r.dice} ${r.dice === 1 ? 'die' : 'dice'} — ${r.lines.length ? r.lines[r.lines.length - 1] : `${r.healed} healed`}`
        : 'Kept every die.';
      if (r.healed > 0) sub = `${r.dice} ${r.dice === 1 ? 'die' : 'dice'} spent, ${r.healed} hit points back.`;
      txt(ctx, ix + 27, ry + 18, sub, { size: 'sm', color: C.inkDim, maxWidth: iw - 27 });
      ry += 27;
      if (arr(r.returned).length && ry < bottom - 8) {
        for (const line of r.returned.slice(0, 2)) {
          safe(() => UI.icon(ctx, 'plus', ix + 27, ry - 1, 8, C.good));
          txt(ctx, ix + 38, ry, line, { size: 'sm', color: C.good, maxWidth: iw - 40 });
          ry += 9;
        }
      }
      ry += 3;
    }
    if (rows.length > 1) {
      txtR(ctx, ix + iw, p.iy + p.ih - 8, `${start + 1}/${rows.length}`, { size: 'sm', color: C.goldDim });
    }

    const np = UI.panel(ctx, 6, 152, VIEW_W - 12, 25, { style: 'dark', shadow: 0.3 });
    UI.textWrapped(ctx, np.ix + 5, np.iy + 3, np.iw - 10,
      'Pact Magic, Second Wind, Action Surge, Channel Divinity, Ki and Superiority Dice come back at a fire. '
      + 'Spell slots and exhaustion wait for a full night.',
      { size: 'sm', color: C.inkDim, maxLines: 2 });
  }

  _drawLongSummary(ctx) {
    this._drawHeader(ctx, 'Morning');
    UI.panel(ctx, 2, 16, VIEW_W - 4, 13, { style: 'gold', shadow: 0.3, studs: false });
    const st = S();
    txt(ctx, 8, 19, this.inn ? 'You wake at the Stonehill Inn' : 'You wake with the light', {
      size: 'md', color: '#2a1c07', maxWidth: 240,
    });
    txtR(ctx, VIEW_W - 8, 20, `${clockText(num(st && st.time, 0))} · ${dateText(num(st && st.day, 1))}`, {
      size: 'sm', color: '#5a4318', maxWidth: 176,
    });

    // Left: what each hero got back.
    const p = UI.panel(ctx, 6, 32, 240, 148, { style: 'window' });
    const ix = p.ix + 5, iw = p.iw - 10;
    const tx = ix + 25, tw = iw - 25;
    const rows = this.longLog;
    const start = clamp(this.scroll, 0, Math.max(0, rows.length - 1));
    let ry = p.iy + 4;
    const bottom = p.iy + p.ih - 4;
    for (let i = start; i < rows.length && ry < bottom - 14; i++) {
      const { ch } = rows[i];
      const b = this.before.get(ch.uid) || restSnapshot(ch);
      const a = restSnapshot(ch);
      safe(() => UI.portrait(ctx, ch, ix, ry, 20, { shadow: 0.25 }));
      txt(ctx, tx, ry, ch.name || '—', { size: 'md', color: C.goldBright, maxWidth: tw - 44, shadow: true });
      txtR(ctx, ix + iw, ry + 1, `${a.hp}/${a.maxHp}`, { size: 'sm', color: C.hpHeal, maxWidth: 42 });

      const bits = [];
      if (a.hp > b.hp) bits.push(`${a.hp - b.hp} HP`);
      if (a.hdFree > b.hdFree) bits.push(`${a.hdFree - b.hdFree} ${a.hdFree - b.hdFree === 1 ? 'die' : 'dice'}`);
      if (b.slotUsed > 0) bits.push(`${b.slotUsed} ${b.slotUsed === 1 ? 'slot' : 'slots'}`);
      if (b.pactUsed > 0) bits.push('pact magic');
      let resBack = 0;
      for (const k of Object.keys(b.res)) if (b.res[k] > 0 && num(a.res[k], 0) === 0) resBack++;
      if (resBack) bits.push(`${resBack} ${resBack === 1 ? 'ability' : 'abilities'}`);
      if (b.exh > a.exh) bits.push(`exhaustion ${b.exh} → ${a.exh}`);
      const body = bits.length ? bits.join(' · ') : 'Already whole. Slept well anyway.';
      const lines = UI.wrapLines(body, tw, 'sm').slice(0, 2);
      let by = ry + 10;
      for (const l of lines) {
        txt(ctx, tx, by, l, { size: 'sm', color: bits.length ? C.good : C.inkDim, maxWidth: tw });
        by += 9;
      }
      ry = Math.max(by, ry + 24) + 4;
    }
    if (rows.length > 1) txtR(ctx, ix + iw, p.iy + p.ih - 8, `${start + 1}/${rows.length}`, { size: 'sm', color: C.goldDim });

    // Right: the dream, the coin, and the plain statement of the rule.
    const q = UI.panel(ctx, 250, 32, VIEW_W - 256, 148, { style: 'window' });
    const qx = q.ix + 4, qw = q.iw - 8;
    let qy = q.iy + 3;
    qy = head(ctx, qx, qy, qw, 'THE NIGHT');
    const dreamText = this.dream ? String(this.dream.text || '') : 'You slept without dreaming, which is its own mercy.';
    const wr = UI.textWrapped(ctx, qx, qy, qw, dreamText, { size: 'sm', color: C.ink, maxLines: 8 });
    qy += wr.height + 4;
    UI.divider(ctx, qx, qy, qw, { color: C.border });
    qy += 5;
    if (this.paid > 0) {
      safe(() => UI.icon(ctx, 'coin', qx, qy - 1, 8, C.gold));
      txt(ctx, qx + 11, qy, `${this.paid} gp for the room`, { size: 'sm', color: C.gold, maxWidth: qw - 13 });
      qy += 10;
    }
    const room = Math.max(0, Math.floor((q.iy + q.ih - qy - 2) / 9));
    if (room > 0) {
      UI.textWrapped(ctx, qx, qy, qw,
        'Hit points full, half your Hit Dice back, every slot and resource, and one level of exhaustion lifted.',
        { size: 'sm', color: C.inkDim, maxLines: room });
    }
  }
}

// ===========================================================================
// 6. CAMP SCENE
// ===========================================================================

const CAMP_ITEMS = [
  {
    id: 'rest', label: 'Rest', icon: 'flame',
    desc: 'An hour with the dice, or the whole night through. Out here somebody had better keep watch.',
  },
  {
    id: 'party', label: 'Manage Party', icon: 'helm',
    desc: 'Sheets, gear, marching order and who sits this one out at the inn.',
  },
  {
    id: 'cook', label: 'Cook', icon: 'flask',
    desc: 'Rations, the pot, and whatever is in the healer\'s kit. Not much, but it beats hard biscuit cold.',
  },
  {
    id: 'talk', label: 'Talk', icon: 'scroll',
    desc: 'Sit a while with the party. You learn more at a fire than on a road.',
  },
  {
    id: 'leave', label: 'Leave', icon: 'foot', desc: 'Kick out the fire and get moving.',
  },
];

/**
 * Camp beats: what a companion is doing when you sit down beside them. Keyed by
 * class where the class says something, with a general pool behind it. Plain,
 * period, Sword Coast — no invented words.
 */
const CAMP_BEATS = {
  fighter: ['works a whetstone down the blade in long, even strokes and does not look up.',
    'checks every strap on the harness twice, the way people do when they have had one break.'],
  barbarian: ['sits closer to the flames than anyone else can stand and seems to find it cold.',
    'is eating, and has been for some time.'],
  paladin: ['kneels a moment out past the light, then comes back and says nothing about it.',
    'polishes a shield boss that is already clean.'],
  ranger: ['has walked the ring of the camp twice and is looking at the treeline again.',
    'strings and unstrings the bow, listening to the cord.'],
  rogue: ['is rolling dice one-handed against a flat stone and winning against nobody.',
    'has your coin purse. Hands it back before you ask.'],
  monk: ['sits very straight with both hands on both knees and breathes.',
    'moves through a slow form at the edge of the firelight, over and over.'],
  cleric: ['says the evening prayer under their breath and marks the last of it with a touch to the holy symbol.',
    'is going through the pack, quietly counting the bandages.'],
  druid: ['is talking to something small in the grass. It seems to be going well.',
    'crumbles a leaf, smells it, and looks east for a long moment.'],
  wizard: ['has the book open on both knees and is copying something by firelight, badly.',
    'is muttering a formula and correcting themselves halfway through.'],
  sorcerer: ['is idly making the sparks go the wrong way up.',
    'flexes both hands like they have gone to sleep, which they have not.'],
  warlock: ['stares into the fire past the fire.',
    'answers a question you did not ask, then apologises.'],
  bard: ['tunes, plays four notes, stops, tunes again.',
    'is telling the story of a thing that happened to somebody else, and improving it.'],
};
const CAMP_BEATS_ANY = [
  'holds both hands to the fire and turns them over.',
  'is mending something small with a bone needle and a squint.',
  'shares out the last of the trail bread without making anything of it.',
  'watches the sparks go up and does not say what they are thinking.',
  'shifts a log with a boot and sends the fire up bright for a moment.',
  'sits back against the pack with both eyes shut and is not asleep.',
];

/** The recruit entry behind a party member, if there is one. */
function recruitFor(ch) {
  if (!ch) return null;
  const list = RECRUITS();
  if (!list.length) return null;
  const id = ch.recruitId || null;
  if (id) {
    const found = list.find((r) => r && r.id === id);
    if (found) return found;
  }
  const name = String(ch.name || '').toLowerCase();
  return list.find((r) => r && String(r.name || '').toLowerCase() === name) || null;
}

export class CampScene {
  /** @param {object} opts { mapId, biome, place, inn, cost, onDone } */
  constructor(opts = {}) {
    this.id = 'camp';
    this.opaque = true;
    this.pausesBelow = true;
    this.uiLayer = true;

    this.opts = opts || {};
    this.where = placeInfo(this.opts);
    this.onDone = typeof this.opts.onDone === 'function' ? this.opts.onDone : null;

    this.t = 0;
    this.index = 0;
    this.modal = null;
    this.view = 'menu';      // menu | talk | cook
    this.talkIndex = 0;
    this.talkSeed = 0;
    this.cook = null;
    this.msg = '';
    this.msgT = 0;
    this.msgBad = false;
    this.rowRects = [];
    this._closed = false;

    this.fire = new Fire(`camp:${this.where.mapId || this.where.biome}`);
  }

  enter() {
    safe(() => Input.flush());
    safe(() => Audio.music(this.where.sheltered ? 'inn' : 'camp'));
    this.talkSeed = num(S() && S().day, 1);
  }

  exit() { safe(() => FX.clear()); }

  say(text, bad = false, life = 3.2) {
    this.msg = String(text == null ? '' : text);
    this.msgBad = !!bad;
    this.msgT = life;
    if (bad) sfx('error');
  }

  close() {
    if (this._closed) return;
    this._closed = true;
    safe(() => FX.clear());
    sfx('back');
    if (this.onDone) safe(() => this.onDone());
    if (Game.top === this) Game.pop();
  }

  get members() { return arr(Party.members).filter(Boolean); }

  // --- update ------------------------------------------------------------

  update(dt) {
    this.t += dt;
    if (this.msgT > 0) { this.msgT -= dt; if (this.msgT <= 0) this.msg = ''; }
    if (this.opts.inn) this.fire.update(dt, 306, 202);
    else this.fire.update(dt, 200, 200);

    if (this.modal) {
      const m = this.modal;
      if (!m.update() && this.modal === m) this.modal = null;
      return;
    }
    if (this.view === 'talk') { this._updateTalk(); return; }
    if (this.view === 'cook') { this._updateCookResult(); return; }
    this._updateMenu();
  }

  _updateMenu() {
    this.index = navV(this.index, CAMP_ITEMS.length);
    const m = Input.mouse;
    for (const r of this.rowRects) {
      if (hit(m, r.x, r.y, r.w, r.h)) {
        if (this.index !== r.i) { this.index = r.i; sfx('cursor'); }
        if (clickedIn(m, r.x, r.y, r.w, r.h)) { this._choose(CAMP_ITEMS[r.i].id); return; }
      }
    }
    if (Input.consume('confirm')) { this._choose(CAMP_ITEMS[this.index].id); return; }
    if (Input.consume('cancel') || Input.consume('menu')) this.close();
  }

  _choose(id) {
    sfx('select');
    switch (id) {
      case 'rest': this._askRest(); break;
      case 'party': this._openParty(); break;
      case 'cook': this._doCook(); break;
      case 'talk': this._openTalk(); break;
      case 'leave': this.close(); break;
      default: break;
    }
  }

  // --- rest --------------------------------------------------------------

  _askRest() {
    const w = this.where;
    const canLong = w.danger < 0.5 || w.sheltered;
    const body = w.sheltered
      ? `${w.place}. Four walls and a door that shuts.`
      : `${w.place}. ${w.danger >= 0.44 ? 'This is a bad place to close your eyes.' : 'It will serve, if somebody watches.'}`;
    this.modal = new Modal('Make Camp', body, [
      { label: 'Short Rest — one hour', value: 'short', icon: 'flame' },
      {
        label: 'Long Rest — eight hours', value: 'long', icon: 'heart',
        disabled: !canLong,
        reason: canLong ? '' : 'Not down here. Find the surface, or clear the level first.',
      },
      { label: 'Never mind', value: null, icon: 'foot' },
    ], (v) => {
      this.modal = null;
      if (v !== 'short' && v !== 'long') return;
      safe(() => Game.push(new RestScene(v, {
        inn: this.opts.inn, cost: v === 'long' ? num(this.opts.cost, 0) : 0,
        mapId: this.where.mapId, biome: this.where.biome, place: this.where.place,
      })));
    });
  }

  _openParty() {
    const menus = LATE.menus;
    if (!menus || typeof menus.PartyScene !== 'function') {
      this.say('The character sheets are not to hand.', true);
      return;
    }
    safe(() => Game.push(new menus.PartyScene({ section: 'roster' })));
  }

  // --- cook --------------------------------------------------------------

  /**
   * A camp meal. Rations for everyone, a better pot if somebody carries cook's
   * utensils, and a little extra tending if there is a healer's kit in the pack.
   * Half an hour, once a day, and never a substitute for a real rest.
   */
  _doCook() {
    const st = S();
    const living = this.members.filter((m) => safe(() => isAlive(m), false));
    if (!living.length) { this.say('There is nobody left to feed.', true); return; }

    if (st && num(st.flags && st.flags.campCookDay, -1) === num(st.day, 0)) {
      this.say('You have eaten today already. Cooking twice only wastes good food.', true);
      return;
    }

    const need = living.length;
    const have = num(safe(() => Party.countItem('rations'), 0), 0);
    if (have < need) {
      this.say(`You need ${need} day${need === 1 ? '' : 's'} of rations. The pack holds ${have}.`, true);
      return;
    }

    const utensils = !!safe(() => Party.hasItem('cooks-utensils'), false);
    const kit = !!safe(() => Party.hasItem('healers-kit'), false);
    const sides = utensils ? 8 : 6;
    const bonus = kit ? 2 : 0;

    const rows = [];
    for (const ch of living) {
      const rr = safe(() => roll(1, sides, rng), { total: Math.ceil(sides / 2), rolls: [Math.ceil(sides / 2)] });
      const face = arr(rr.rolls)[0] || rr.total || 1;
      const amount = Math.max(1, num(rr.total, 1) + bonus);
      const got = num(safe(() => heal(ch, amount), 0), 0);
      rows.push({ ch, sides, face, bonus, amount, got });
      if (got > 0) safe(() => FX.floater(200, 150, `+${got}`, C.hpHeal, { size: 'sm', dur: 0.9 }));
    }

    safe(() => Party.removeItem('rations', need));
    if (st) {
      safe(() => advanceTime(st, 30));
      st.flags = st.flags || {};
      st.flags.campCookDay = num(st.day, 0);
    }
    safe(() => bus.emit(EV.PARTY_CHANGE, { members: Party.members }));
    sfx('heal');

    this.cook = { rows, utensils, kit, need, sides, bonus };
    this.view = 'cook';
  }

  _updateCookResult() {
    const m = Input.mouse;
    const click = m && m.clicked;
    if (Input.consume('confirm') || Input.consume('cancel') || Input.consume('menu') || click) {
      if (click) m.clicked = false;
      sfx('back');
      this.view = 'menu';
      this.cook = null;
    }
  }

  // --- talk --------------------------------------------------------------

  _openTalk() {
    if (!this.members.length) { this.say('You are travelling alone.', true); return; }
    this.talkIndex = 0;
    this.view = 'talk';
    sfx('open');
  }

  _updateTalk() {
    const n = this.members.length;
    if (!n) { this.view = 'menu'; return; }
    let moved = false;
    if (Input.repeatConsume('right') || Input.repeatConsume('down')) { this.talkIndex = (this.talkIndex + 1) % n; moved = true; }
    if (Input.repeatConsume('left') || Input.repeatConsume('up')) { this.talkIndex = (this.talkIndex - 1 + n) % n; moved = true; }
    if (moved) sfx('cursor');

    const m = Input.mouse;
    for (const r of this.rowRects) {
      if (hit(m, r.x, r.y, r.w, r.h) && clickedIn(m, r.x, r.y, r.w, r.h)) {
        if (r.i === this.talkIndex) { this.talkSeed++; sfx('select'); }
        else { this.talkIndex = r.i; sfx('cursor'); }
        return;
      }
    }
    if (Input.consume('confirm')) { this.talkSeed++; sfx('select'); }
    if (Input.consume('cancel') || Input.consume('menu')) { sfx('back'); this.view = 'menu'; }
  }

  /** One companion's beat at the fire, plus the read on them from RECRUITS. */
  _banterFor(ch) {
    if (!ch) return null;
    const rec = recruitFor(ch);
    const classId = arr(ch.classes)[0] && arr(ch.classes)[0].id;
    const pool = (classId && CAMP_BEATS[classId]) ? CAMP_BEATS[classId].concat(CAMP_BEATS_ANY) : CAMP_BEATS_ANY;
    const r = makeRNG(hashStr(`banter:${ch.uid || ch.name}:${this.talkSeed}`));
    const beat = safe(() => r.pick(pool), pool[0]) || pool[0];

    let closing = '';
    if (rec && rec.deity) closing = `Their thanks, when they give them, go to ${rec.deity}.`;
    else if (rec && rec.faction) {
      const f = safe(() => LATE.tables && LATE.tables.factionName && LATE.tables.factionName(rec.faction), null);
      if (f) closing = `They still answer, in the end, to ${f}.`;
    }

    return {
      rec,
      title: (rec && rec.title) || '',
      beat: `${ch.name} ${beat}`,
      read: (rec && rec.personality) || '',
      bio: (rec && rec.bio) || '',
      closing,
    };
  }

  // --- draw --------------------------------------------------------------

  draw(ctx) {
    this.rowRects = [];
    const inn = !!this.opts.inn;
    const fx = inn ? { x: 306, y: 202 } : { x: 200, y: 200 };
    const seed = String(this.where.mapId || 'camp');

    if (inn) {
      drawInnRoom(ctx, this.t, fx.x, fx.y);
    } else {
      drawNightSky(ctx, this.t, seed, 0.42, 0.8);
      drawCampGround(ctx, this.t, seed);
      drawCampKit(ctx, fx.x, fx.y);
    }
    this.fire.drawGlow(ctx, fx.x, fx.y, inn ? 118 : 106);
    this.fire.draw(ctx, fx.x, fx.y, { hearth: inn });
    drawPartyRing(ctx, this.members, fx.x, fx.y, this.t, {
      focus: this.view === 'talk' ? this.talkIndex : -1,
    });

    const v = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    v.addColorStop(0, 'rgba(4,4,10,0.74)');
    v.addColorStop(0.6, 'rgba(4,4,10,0.30)');
    v.addColorStop(1, 'rgba(4,4,10,0.52)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    this._drawHeader(ctx);
    if (this.view === 'talk') this._drawTalk(ctx);
    else if (this.view === 'cook') this._drawCook(ctx);
    else this._drawMenu(ctx);

    drawStatus(ctx, this.msg, this.msgBad, clamp(this.msgT / 0.5, 0, 1), 196);

    safe(() => FX.draw(ctx, 0, 0));
    if (this.modal) this.modal.draw(ctx, this.t);
  }

  _drawHeader(ctx) {
    const st = S();
    UI.panel(ctx, 2, 2, VIEW_W - 4, 13, { style: 'dark', shadow: 0.3 });
    txt(ctx, 7, 5, 'Camp', { size: 'sm', color: C.goldBright, maxWidth: 60, shadow: true });
    txt(ctx, 44, 5, this.where.place, { size: 'sm', color: C.inkDim, maxWidth: 150, shadow: true });
    const clock = st ? `${clockText(num(st.time, 0))} · ${dateText(num(st.day, 1))}` : '';
    txtR(ctx, VIEW_W - 7, 5, clock, { size: 'sm', color: C.inkDim, maxWidth: 180, shadow: true });
  }

  _drawMenu(ctx) {
    const lx = 6, ly = 20, lw = 132, rowH = 17;
    UI.panel(ctx, lx - 3, ly - 3, lw + 6, CAMP_ITEMS.length * rowH + 6, { style: 'dark', shadow: 0.35 });
    CAMP_ITEMS.forEach((it, i) => {
      const y = ly + i * rowH;
      const sel = i === this.index;
      if (sel) UI.highlight(ctx, lx, y, lw, rowH - 1, { alpha: 0.22 });
      if (sel) UI.cursor(ctx, lx + 1, y + 5, this.t);
      safe(() => UI.icon(ctx, it.icon, lx + 10, y + 4, 10, sel ? C.gold : C.inkDim));
      txt(ctx, lx + 24, y + 5, it.label, {
        size: sel ? 'md' : 'sm', color: sel ? C.goldBright : C.ink, maxWidth: lw - 28, shadow: true,
      });
      this.rowRects.push({ x: lx, y, w: lw, h: rowH, i });
    });

    // The description, plus a quick read of the party's state.
    const p = UI.panel(ctx, 144, 20, VIEW_W - 150, CAMP_ITEMS.length * rowH + 6, { style: 'window' });
    const ix = p.ix + 5, iw = p.iw - 10;
    const it = CAMP_ITEMS[this.index] || CAMP_ITEMS[0];
    txt(ctx, ix, p.iy + 3, it.label.toUpperCase(), { size: 'sm', color: C.goldDim, maxWidth: iw });
    UI.divider(ctx, ix, p.iy + 12, iw, { color: C.border });
    const wr = UI.textWrapped(ctx, ix, p.iy + 17, iw, it.desc, { size: 'sm', color: C.ink, maxLines: 3 });
    let ry = p.iy + 17 + wr.height + 3;

    if (it.id === 'cook') {
      const have = num(safe(() => Party.countItem('rations'), 0), 0);
      const need = this.members.filter((m) => safe(() => isAlive(m), false)).length;
      const utensils = !!safe(() => Party.hasItem('cooks-utensils'), false);
      const kit = !!safe(() => Party.hasItem('healers-kit'), false);
      const rname = safe(() => resolveItem('rations').name, 'Rations') || 'Rations';
      kv(ctx, ix, ry, iw, rname, `${have} of ${need} needed`, { color: have >= need ? C.good : C.bad });
      ry += 9;
      kv(ctx, ix, ry, iw, "Cook's utensils", utensils ? 'in the pack, d8' : 'none, d6', { color: utensils ? C.good : C.inkDim });
      ry += 9;
      kv(ctx, ix, ry, iw, "Healer's kit", kit ? 'in the pack, +2' : 'none', { color: kit ? C.good : C.inkDim });
    } else if (it.id === 'rest') {
      const wounded = this.members.filter((m) => num(m.hp, 0) < num(safe(() => maxHpOf(m), 1), 1)).length;
      const dice = this.members.reduce((a, m) => a + hdFree(m), 0);
      kv(ctx, ix, ry, iw, 'Wounded', `${wounded} of ${this.members.length}`, { color: wounded ? C.warn : C.good });
      ry += 9;
      kv(ctx, ix, ry, iw, 'Hit Dice in hand', String(dice), { color: dice ? C.ink : C.bad });
      ry += 9;
      kv(ctx, ix, ry, iw, 'Interruption', this.where.sheltered ? 'none, under a roof'
        : this.where.danger >= 0.44 ? 'high' : this.where.danger >= 0.28 ? 'fair' : 'slight', {
        color: this.where.sheltered ? C.good : this.where.danger >= 0.44 ? C.bad : C.warn,
      });
    } else if (it.id === 'talk') {
      const named = this.members.filter((m) => !!recruitFor(m)).length;
      kv(ctx, ix, ry, iw, 'Around the fire', String(this.members.length), {});
      ry += 9;
      kv(ctx, ix, ry, iw, 'You have their measure', `${named} of ${this.members.length}`, { color: named ? C.good : C.inkDim });
    } else if (it.id === 'party') {
      kv(ctx, ix, ry, iw, 'In the party', String(this.members.length), {});
      ry += 9;
      kv(ctx, ix, ry, iw, 'On the bench', String(arr(Party.reserve).length), {});
      ry += 9;
      kv(ctx, ix, ry, iw, 'Purse', `${Math.round(num(Party.gold, 0))} gp`, { color: C.gold });
    }

    hintBar(ctx, 224, [['↑↓', 'Choose'], ['Z', 'Do it'], ['X', 'Break camp']]);
  }

  _drawTalk(ctx) {
    const list = this.members;
    const ch = list[this.talkIndex] || list[0];
    const b = this._banterFor(ch);
    if (!ch || !b) { this.view = 'menu'; return; }

    // Who is at the fire, along the top.
    const cellW = Math.floor((VIEW_W - 12) / Math.max(1, list.length));
    list.forEach((m, i) => {
      const x = 6 + i * cellW;
      const sel = i === this.talkIndex;
      UI.panel(ctx, x, 20, cellW - 2, 30, { style: sel ? 'gold' : 'dark', shadow: sel ? 0.4 : 0.2 });
      safe(() => UI.portrait(ctx, m, x + 3, 23, 24, { shadow: 0.2 }));
      txt(ctx, x + 29, 25, shortName(m.name), {
        size: 'sm', color: sel ? '#2a1c07' : C.ink, maxWidth: cellW - 33, shadow: !sel,
      });
      txt(ctx, x + 29, 35, classText(m), {
        size: 'sm', color: sel ? '#5a4318' : C.inkDim, maxWidth: cellW - 33, shadow: !sel,
      });
      this.rowRects.push({ x, y: 20, w: cellW - 2, h: 30, i });
    });

    const p = UI.panel(ctx, 6, 54, VIEW_W - 12, 128, { style: 'window' });
    const ix = p.ix + 6, iw = p.iw - 12;
    txt(ctx, ix, p.iy + 4, ch.name || '—', { size: 'md', color: C.goldBright, maxWidth: iw - 100, shadow: true });
    if (b.title) txtR(ctx, ix + iw, p.iy + 5, b.title, { size: 'sm', color: C.goldDim, maxWidth: 190 });
    UI.divider(ctx, ix, p.iy + 15, iw, { color: C.border });

    let ry = p.iy + 20;
    const beat = UI.textWrapped(ctx, ix, ry, iw, b.beat, { size: 'sm', color: C.ink, maxLines: 3 });
    ry += beat.height + 5;

    if (b.read) {
      ry = head(ctx, ix, ry, iw, 'THE MEASURE OF THEM');
      const rd = UI.textWrapped(ctx, ix, ry, iw, b.read, { size: 'sm', color: C.goldBright, maxLines: 3 });
      ry += rd.height + 5;
    } else {
      const rd = UI.textWrapped(ctx, ix, ry, iw,
        'You do not know them well enough yet to say what they are. Give it a few more roads.',
        { size: 'sm', color: C.disabled, maxLines: 2 });
      ry += rd.height + 5;
    }

    if (b.bio && ry < p.iy + p.ih - 26) {
      ry = head(ctx, ix, ry, iw, 'WHAT YOU KNOW');
      const room = Math.max(1, Math.floor((p.iy + p.ih - ry - 12) / 9));
      UI.textWrapped(ctx, ix, ry, iw, b.bio, { size: 'sm', color: C.inkDim, maxLines: room });
    } else if (b.closing && ry < p.iy + p.ih - 12) {
      txt(ctx, ix, ry, b.closing, { size: 'sm', color: C.inkDim, maxWidth: iw });
    }

    if (b.closing && b.bio) {
      txtR(ctx, ix + iw, p.iy + p.ih - 9, b.closing, { size: 'sm', color: C.goldDim, maxWidth: iw - 20 });
    }

    hintBar(ctx, 224, [['←→', 'Who'], ['Z', 'Sit a while longer'], ['X', 'Back to the fire']]);
  }

  _drawCook(ctx) {
    const c = this.cook;
    if (!c) { this.view = 'menu'; return; }
    UI.panel(ctx, 2, 16, VIEW_W - 4, 13, { style: 'gold', shadow: 0.3, studs: false });
    txt(ctx, 8, 19, 'The pot comes off the fire', { size: 'md', color: '#2a1c07', maxWidth: 220 });
    txtR(ctx, VIEW_W - 8, 20, `${c.need} ${c.need === 1 ? 'ration' : 'rations'} · half an hour`, {
      size: 'sm', color: '#5a4318', maxWidth: 160,
    });

    const p = UI.panel(ctx, 6, 32, VIEW_W - 12, 150, { style: 'window' });
    const ix = p.ix + 6, iw = p.iw - 12;
    let ry = p.iy + 4;
    const note = c.utensils
      ? "Somebody in this party can actually cook. The pot is a d8 tonight."
      : "Nobody here owns a proper pan, so it is boiled ration and a d6.";
    const kitNote = c.kit ? " The healer's kit comes out afterwards for the day's small cuts: +2 each." : '';
    const wr = UI.textWrapped(ctx, ix, ry, iw, note + kitNote, { size: 'sm', color: C.inkDim, maxLines: 2 });
    ry += wr.height + 4;
    UI.divider(ctx, ix, ry, iw, { color: C.border });
    ry += 5;

    let total = 0;
    for (const row of c.rows) {
      if (ry > p.iy + p.ih - 12) break;
      total += num(row.got, 0);
      const maxHp = Math.max(1, num(safe(() => maxHpOf(row.ch), 1), 1));
      safe(() => UI.icon(ctx, 'plus', ix, ry - 1, 8, row.got > 0 ? C.good : C.disabled));
      txt(ctx, ix + 11, ry, row.ch.name || '—', { size: 'sm', color: C.ink, maxWidth: 148, shadow: true });
      const line = `d${row.sides} [${row.face}]${row.bonus ? ` +${row.bonus}` : ''} = ${row.amount} healed`;
      txt(ctx, ix + 164, ry, line, { size: 'sm', color: row.got > 0 ? C.goldBright : C.disabled, maxWidth: 158 });
      txtR(ctx, ix + iw, ry, `${num(row.ch.hp, 0)}/${maxHp}`, { size: 'sm', color: hpColor(row.ch) });
      ry += 11;
    }
    ry += 3;
    if (ry < p.iy + p.ih - 10) {
      UI.divider(ctx, ix, ry, iw, { color: C.border });
      ry += 5;
      UI.textWrapped(ctx, ix, ry, iw, total > 0
        ? `${total} hit points across the party, and nobody has to chew cold biscuit tonight.`
        : 'Everyone was already whole. It was still a good meal.', {
        size: 'sm', color: total > 0 ? C.good : C.inkDim, maxLines: 2,
      });
    }

    hintBar(ctx, 224, [['Z', 'Bank the fire']]);
  }
}

export default RestScene;
