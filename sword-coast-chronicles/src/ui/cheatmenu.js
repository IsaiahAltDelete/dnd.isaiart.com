// ui/cheatmenu.js — the CHEATS screen.
//
// Every trapdoor in core/cheats.js, on one page a player can drive with the
// keyboard. No console, no memorised magic word, no guessing which switch is
// currently on.
//
// This file owns NO cheat logic. Each row is a label over a call into
// core/cheats.js, and every ON/OFF state is read straight out of
// core/cheatflags.js on the frame it is drawn — so a flag flipped by a typed
// code, by the console, or by Explore Mode shows here immediately and can never
// go stale. The row table is validated against the live API at load: a row whose
// cheat function or flag no longer exists is dropped rather than left to lie to
// the player.
//
// House rules, same as ui/menus.js:
//   * ALL drawing goes through ui/kit.js UI.* — never ctx.fillText, never ctx.font.
//   * Keyboard/gamepad first, mouse as well. 400x240 logical px, integer coords.
//   * Text never leaves its panel: every column is measured against the longest
//     label that actually appears in it.

import { UI } from './kit.js';
import { MK } from './menukit.js';
import { Input } from '../core/input.js';
import { Audio } from '../core/audio.js';
import { Game } from '../engine.js';
import { Party } from '../world/party.js';
import { VIEW_W, VIEW_H, clamp } from '../constants.js';
import { cheat, CHEAT_CODES } from '../core/cheats.js';
import { CHEATS } from '../core/cheatflags.js';
import { MAP_DEFS } from '../world/maps.js';

// ===========================================================================
// 0. SHORTHANDS  (private copies of the ui/menus.js house helpers)
// ===========================================================================

const C = UI.COLORS;
const R = (n) => Math.round(n) | 0;

function safe(fn, fb) {
  try { const v = fn(); return v === undefined || v === null ? fb : v; } catch (e) { return fb; }
}
function sfx(name) { safe(() => Audio.sfx(name), false); }
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

function txt(ctx, x, y, s, opts) { return UI.text(ctx, R(x), R(y), s, opts || {}); }
function txtR(ctx, x, y, s, opts) { return UI.text(ctx, R(x), R(y), s, { ...(opts || {}), align: 'right' }); }
function txtC(ctx, x, y, s, opts) { return UI.text(ctx, R(x), R(y), s, { ...(opts || {}), align: 'center' }); }

/** A small gold caption with a rule running out to the right of it. */
function sectionHead(ctx, x, y, w, label, color) {
  txt(ctx, x, y, label, { size: 'sm', color: color || C.goldDim, shadow: true });
  const lw = UI.measure(label, 'sm');
  if (w - lw - 5 > 6) UI.divider(ctx, x + lw + 4, y + 3, w - lw - 5, { color: 'rgba(92,74,42,0.85)' });
  return y + 9;
}

// --- key prompts (same labels the rest of the UI prints) --------------------

const KEY_LABEL = {
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Enter: 'ENT', NumpadEnter: 'ENT', Space: 'SPC', Escape: 'ESC', Backspace: 'BSP',
  ShiftLeft: 'SHF', ShiftRight: 'SHF', Tab: 'TAB', Backquote: 'TIL',
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

/** The dark strip of [KEY] Label prompts along the bottom of every screen. */
function hintBar(ctx, y, hints) {
  ctx.save();
  ctx.fillStyle = 'rgba(8,10,18,0.88)';
  ctx.fillRect(0, R(y) - 4, VIEW_W, VIEW_H - R(y) + 4);
  ctx.fillStyle = 'rgba(92,74,42,0.85)';
  ctx.fillRect(0, R(y) - 4, VIEW_W, 1);
  ctx.restore();
  let x = 4;
  for (const h of hints) {
    if (!h) continue;
    if (x > VIEW_W - 24) break;
    const w = safe(() => UI.keyHint(ctx, x, R(y), h[0], h[1]), 0) || 0;
    x += w + 7;
  }
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
  const v = num(m && m.wheel, 0);
  if (!v) return 0;
  m.wheel = 0;
  return v > 0 ? 1 : -1;
}

// ===========================================================================
// 1. THE ROWS — labels over the cheat API, nothing more
// ===========================================================================

/** The clock stops the spinner offers. Every id is a name cheat.time() knows. */
const TIME_PHASES = [
  { id: 'dawn', label: 'Dawn', mins: 330 },
  { id: 'noon', label: 'Noon', mins: 720 },
  { id: 'dusk', label: 'Dusk', mins: 1140 },
  { id: 'midnight', label: 'Midnight', mins: 0 },
];

/**
 * `fn` names the cheat.* method the row needs and `flag` the CHEATS key it
 * reads; both are checked against the live API before the row is offered.
 * `call` is printed in the detail pane so the console equivalent is discoverable.
 */
const SPEC = [
  { kind: 'head', label: 'TOGGLES' },
  {
    kind: 'toggle', label: 'God Mode', flag: 'god', fn: 'god', call: 'cheat.god()',
    desc: 'You cannot be reduced below 1 hp',
    run: () => cheat.god(),
  },
  {
    kind: 'toggle', label: 'Peaceful', flag: 'noCombat', fn: 'nofight', call: 'cheat.nofight()',
    desc: 'No fight ever starts',
    run: () => cheat.nofight(),
  },
  {
    kind: 'toggle', label: 'No Ambushes', flag: 'noEncounters', fn: 'peace', call: 'cheat.peace()',
    desc: 'Nothing jumps you in the grass',
    run: () => cheat.peace(),
  },
  {
    kind: 'toggle', label: 'Walk Through Walls', flag: 'noclip', fn: 'noclip', call: 'cheat.noclip()',
    desc: 'Ignore walls, water and locked doors',
    run: () => cheat.noclip(),
  },
  {
    kind: 'toggle', label: 'One-Hit Kills', flag: 'oneShot', fn: 'oneShot', call: 'cheat.oneShot()',
    desc: 'Your attacks are always lethal',
    run: () => cheat.oneShot(),
  },
  {
    kind: 'toggle', label: 'Free Spells', flag: 'freeCast', fn: 'freeCast', call: 'cheat.freeCast()',
    desc: 'Spells and class resources cost nothing',
    run: () => cheat.freeCast(),
  },

  { kind: 'head', label: 'ACTIONS' },
  {
    kind: 'action', label: 'Full Heal', fn: 'heal', call: 'cheat.heal()', sound: 'heal',
    desc: 'Hit points, slots, hit dice and conditions, all put back',
    run: () => cheat.heal(),
  },
  {
    kind: 'action', label: 'Add 1000 Gold', fn: 'gold', call: 'cheat.gold(1000)', sound: 'coin',
    desc: 'A thousand gold pieces into the party purse',
    run: () => cheat.gold(1000),
  },
  {
    kind: 'action', label: 'Test Kit', fn: 'give', call: 'cheat.give()',
    desc: 'Potions, rations, torches, arrows, tools and a scroll or three',
    run: () => cheat.give(),
  },
  {
    kind: 'action', label: 'Level Up (+1)', fn: 'level', call: 'cheat.level(n)', sound: 'levelup',
    desc: 'Every companion gains one level, choices picked for you',
    run: () => cheat.level(Math.min(20, num(safe(() => Party.levelAvg(), 1), 1) + 1)),
  },
  {
    kind: 'action', label: 'Reveal Map', fn: 'reveal', call: 'cheat.reveal()',
    desc: 'Uncovers every tile of the map you are standing on',
    run: () => cheat.reveal(),
  },
  {
    kind: 'action', label: 'Unlock All Regions', fn: 'unlockAll', call: 'cheat.unlockAll()',
    desc: 'Opens every region gate, and the endless dungeon with them',
    run: () => cheat.unlockAll(),
  },
  {
    kind: 'action', label: 'Return to Phandalin', fn: 'town', call: 'cheat.town()',
    desc: 'Straight back to town from anywhere on the Sword Coast',
    run: () => cheat.town(),
  },
  {
    kind: 'time', label: 'Set Time', fn: 'time', call: 'cheat.time(when)',
    desc: 'Move the world clock to dawn, noon, dusk or midnight',
  },
  {
    kind: 'action', label: 'Explore Mode', fn: 'explore', call: 'cheat.explore()', sound: 'levelup',
    desc: 'Turns on several of the above at once, then levels and kits the party',
    run: () => cheat.explore(),
  },
];

/**
 * Drop any row the API no longer backs. Nothing here should ever fire in a
 * healthy build, which is why it warns once instead of failing quietly: a row
 * that has drifted away from core/cheats.js is a bug in this file, not a
 * condition to design around.
 */
function buildRows() {
  const dropped = [];
  const rows = SPEC.filter((r) => {
    if (r.kind === 'head') return true;
    if (r.fn && typeof cheat[r.fn] !== 'function') { dropped.push(`${r.label} (no cheat.${r.fn})`); return false; }
    if (r.flag && !(r.flag in CHEATS)) { dropped.push(`${r.label} (no CHEATS.${r.flag})`); return false; }
    return true;
  });
  if (dropped.length) console.warn('[cheats] rows dropped, API drifted:', dropped.join(', '));
  // A group whose every member was dropped loses its heading too.
  return rows.filter((r, i) => r.kind !== 'head' || (rows[i + 1] && rows[i + 1].kind !== 'head'));
}

const ROWS = buildRows();
const SWITCHES = ROWS.filter((r) => r.kind === 'toggle');

/** The value column is sized once, against the widest thing that lands in it. */
const STATE_W = Math.max(UI.measure('ON', 'md'), UI.measure('OFF', 'md'));
const SPIN_W = 12 + Math.max(...TIME_PHASES.map((p) => UI.measure(p.label, 'md'))) + 12;
const LVL_W = UI.measure('Lv 20', 'md');

// ===========================================================================
// 1b. TRAVEL — one row per map in the world, straight out of MAP_DEFS
// ===========================================================================
//
// The destination list is READ from world/maps.js, never written out here: a
// region pack that lands new maps in MAP_DEFS is on this screen for free, and
// nothing in this file names a single place. Interiors are hidden by default —
// with every inn room and cellar included the list is mostly doors — behind a
// switch at the top of the section.

const INTERIORS_ROW = Object.freeze({
  kind: 'trvopt', label: 'Show Interiors', call: 'cheat.maps()',
  desc: 'List inn rooms, shops and cellars too, not just the places under the sky',
});

function regionTitle(key) {
  return String(key || 'elsewhere').replace(/-/g, ' ').toUpperCase();
}

/** One 'travel' row per MAP_DEFS entry, grouped under 'sub' headings by region. */
function travelRows(showInteriors) {
  const groups = new Map();
  for (const d of Object.values(MAP_DEFS || {})) {
    if (!d || !d.id) continue;
    if (!showInteriors && d.kind === 'interior') continue;
    // Group by region; a def without one (the Phandalin interiors, Tresendar
    // Manor) borrows its parent map's region, so the Stonehill Inn lists under
    // PHANDALIN HILLS beside the town it stands in, not in a kind-named bucket.
    const parent = d.parent ? (MAP_DEFS || {})[d.parent] : null;
    const key = String(d.region || (parent && parent.region) || d.kind || 'elsewhere');
    let list = groups.get(key);
    if (!list) groups.set(key, (list = []));
    list.push({
      kind: 'travel', id: d.id, label: String(d.name || d.id),
      level: clamp(num(d.level, 1) | 0, 1, 20), safe: !!d.safe,
      call: `cheat.tp('${d.id}')`,
      desc: d.desc || 'No field notes on this place.',
    });
  }
  const rows = [];
  for (const [key, list] of groups) {
    rows.push({ kind: 'sub', label: regionTitle(key) });
    for (const r of list) rows.push(r);
  }
  return rows;
}

/**
 * The full row list for one setting of the interiors switch. Both variants are
 * built once — MAP_DEFS is frozen at load, so they cannot go stale — and the
 * TRAVEL section simply does not appear if cheat.tp has drifted away.
 */
const SCENE_ROWS = { on: null, off: null };
function sceneRows(showInteriors) {
  const key = showInteriors ? 'on' : 'off';
  if (SCENE_ROWS[key]) return SCENE_ROWS[key];
  const rows = ROWS.slice();
  if (typeof cheat.tp === 'function') {
    const dests = travelRows(showInteriors);
    if (dests.length) rows.push({ kind: 'head', label: 'TRAVEL' }, INTERIORS_ROW, ...dests);
  } else console.warn('[cheats] TRAVEL hidden: cheat.tp is missing');
  return (SCENE_ROWS[key] = rows);
}

/** The party's average level, the yardstick every destination is held against. */
function partyLevel() {
  return clamp(num(safe(() => Party.levelAvg(), 1), 1) | 0, 1, 20);
}
/** 0 = at or below the party, 1 = above it, 2 = far above it. */
function threat(level, p) { return level > p + 4 ? 2 : level > p ? 1 : 0; }
const THREAT_COLOR = [C.inkDim, C.warn, C.bad];
const THREAT_TEXT = [
  'At or below your level',
  'Above your level — a hard fight',
  'Far above your level — likely death',
];

// ===========================================================================
// 2. FOOTER — the typed codes, wrapped to fit rather than ellipsised away
// ===========================================================================

/**
 * Break `words` into the fewest lines that fit `maxW`, then even them out.
 *
 * The plain greedy wrap packs line one to the brim and leaves "onehit freecast"
 * rattling around on line two. Aiming each line at total/lines instead gives two
 * balanced rows. The hard `maxW` test still runs first, so a line can never
 * overflow, and the result is passed through UI.wrapLines as a belt-and-braces
 * guarantee that nothing leaves the panel.
 */
function balancedLines(words, maxW, size = 'sm') {
  const list = (words || []).map(String).filter(Boolean);
  if (!list.length) return [];
  const total = UI.measure(list.join(' '), size);
  if (total <= maxW) return [list.join(' ')];
  const want = Math.max(2, Math.ceil(total / maxW));
  const target = Math.ceil(total / want);
  const packed = [];
  let line = '';
  for (const word of list) {
    const test = line ? `${line} ${word}` : word;
    const full = UI.measure(line, size) >= target && packed.length < want - 1;
    if (line && (UI.measure(test, size) > maxW || full)) { packed.push(line); line = word; }
    else line = test;
  }
  if (line) packed.push(line);
  const out = [];
  for (const l of packed) for (const s of UI.wrapLines(l, maxW, size)) out.push(s);
  return out;
}

// ===========================================================================
// 3. THE SCENE
// ===========================================================================

const TITLE_Y = 2, TITLE_H = 13;
const CY = 18;                 // content top
const LX = 2, LW = 234;        // list panel
const DX = 238, DW = 160;      // detail panel
const ROW_H = 12;
const HINT_Y = 224;            // the key strip owns 220..240
const SUBTITLE = 'Testing tools — none of this is a game feature';

/** Headings — the gold section heads and the region sub-heads — hold no cursor. */
function selectable(r) { return !!r && r.kind !== 'head' && r.kind !== 'sub'; }

function firstSelectable(rows, from = 0, dir = 1) {
  const n = rows.length;
  if (!n) return 0;
  let i = ((from % n) + n) % n;
  for (let k = 0; k < n; k++) {
    if (selectable(rows[i])) return i;
    i = (i + dir + n) % n;
  }
  return 0;
}

/** Which phase the world clock is nearest right now — the spinner's start. */
function nearestPhase() {
  const st = safe(() => Game.state, null);
  if (!st) return 1;
  const mins = clamp(num(st.time, 720), 0, 1439);
  let best = 1, bd = Infinity;
  for (let i = 0; i < TIME_PHASES.length; i++) {
    const raw = Math.abs(mins - TIME_PHASES[i].mins);
    const d = Math.min(raw, 1440 - raw);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

/** The world clock as hh:mm, or '' when no campaign is running. */
function clockText() {
  const st = safe(() => Game.state, null);
  if (!st) return '';
  const m = clamp(num(st.time, 0) | 0, 0, 1439);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

export class CheatsScene {
  constructor(opts = {}) {
    this.id = 'cheats';
    this.opaque = true;         // a full screen, like every other pause-menu page
    this.pausesBelow = true;
    this.uiLayer = true;
    this.t = 0;
    this.opts = opts || {};
    this.showInteriors = false;
    this.rows = sceneRows(false);
    this.index = firstSelectable(this.rows, 0, 1);
    this.top = 0;
    this.phase = nearestPhase();
    this.msg = '';
    this.msgT = 0;
    this.msgBad = false;
    this.rowRects = [];
    this.spinRects = [];
    this.listRect = { x: LX, y: CY, w: LW, h: 0 };
    this._lines = null;         // cached footer wrap
    this._closing = false;
  }

  enter() { safe(() => Input.flush()); this._closing = false; }
  exit() {}

  /**
   * The map the party is standing on, borrowed from the world scene below.
   *
   * cheat.reveal() reveals `Game.top.map` — and while this screen is open,
   * Game.top is this screen, so Reveal Map answered "No map loaded" and did
   * nothing at all. MapScene already carries the world's map for the same
   * reason (`this.map = currentMap()`); this does it as a getter so travelling
   * away — Return to Phandalin, one row down — cannot leave it stale.
   * Read-only, and it is the same object the stack walk would find anyway.
   */
  get map() {
    const stack = safe(() => Game.scenes, null) || [];
    for (let i = stack.length - 1; i >= 0; i--) {
      const s = stack[i];
      if (!s || s === this) continue;
      const m = s.map || s.tilemap || (s.world && s.world.map) || null;
      if (m && (m.w || m.width)) return m;
    }
    return null;
  }

  close() {
    if (this._closing) return;
    this._closing = true;
    sfx('back');
    if (Game.top === this) Game.pop();
  }

  say(text, bad = false, life = 4.5) {
    this.msg = String(text == null ? '' : text);
    this.msgBad = !!bad;
    this.msgT = life;
    if (bad) sfx('error');
  }

  // --- input --------------------------------------------------------------

  update(dt) {
    this.t += num(dt, 0);
    if (this.msgT > 0) { this.msgT -= num(dt, 0); if (this.msgT <= 0) this.msg = ''; }
    if (!this.rows.length) { if (Input.consume('cancel') || Input.consume('menu')) this.close(); return; }

    if (Input.repeatConsume('up')) this._move(-1);
    if (Input.repeatConsume('down')) this._move(1);

    const row = this.rows[this.index];
    if (row && row.kind === 'time') {
      if (Input.repeatConsume('left')) this._spin(-1);
      if (Input.repeatConsume('right')) this._spin(1);
    } else if (row && row.kind === 'trvopt') {
      if (Input.repeatConsume('left') || Input.repeatConsume('right')) this._toggleInteriors();
    }

    // --- mouse ---
    const m = Input.mouse;
    const lr = this.listRect;
    const w = wheelOver(m, lr.x, lr.y, lr.w, lr.h);
    if (w) this.top = clamp(this.top + w * 2, 0, Math.max(0, this.rows.length - this._visible()));
    for (const s of this.spinRects) {
      if (clicked(m, s.x, s.y, s.w, s.h)) { this.index = s.i; this._spin(s.dir); return; }
    }
    for (const r of this.rowRects) {
      if (!hit(m, r.x, r.y, r.w, r.h)) continue;
      // Hover only claims the cursor when the pointer actually MOVES. Without
      // this the row under a resting pointer reassigned this.index on every
      // frame, so Down moved the cursor and the same frame put it straight
      // back — the keyboard could not leave whichever row the mouse happened
      // to be sitting on. combatui.js guards its field hover the same way.
      if (m.moved && this.index !== r.i) { this.index = r.i; sfx('cursor'); }
      if (clicked(m, r.x, r.y, r.w, r.h)) { this.index = r.i; this._activate(this.rows[r.i]); return; }
    }

    if (Input.consume('confirm')) { this._activate(this.rows[this.index]); return; }
    if (Input.consume('cancel') || Input.consume('menu')) this.close();
  }

  _visible() {
    return Math.max(1, Math.floor((this.listRect.h - 8) / ROW_H));
  }

  /** Move the cursor, stepping over the group and region headings. */
  _move(dir) {
    const rows = this.rows;
    const n = rows.length;
    let i = this.index;
    for (let k = 0; k < n; k++) {
      i = (i + dir + n) % n;
      if (selectable(rows[i])) break;
    }
    if (i !== this.index) { this.index = i; sfx('cursor'); }
  }

  _spin(dir) {
    const row = this.rows[this.index];
    if (!row || row.kind !== 'time') return;
    const n = TIME_PHASES.length;
    this.phase = (this.phase + dir + n) % n;
    this._fire(row, 'cursor');
  }

  _activate(row) {
    if (!selectable(row)) { sfx('error'); return; }
    if (row.kind === 'trvopt') { this._toggleInteriors(); return; }
    if (row.kind === 'travel') { this._travel(row); return; }
    this._fire(row);
  }

  /**
   * Swap the row list for the other interiors variant. The cursor stays on the
   * switch itself — it exists in both variants at the same position — and the
   * scroll is re-clamped because the list below it just changed length.
   */
  _toggleInteriors() {
    this.showInteriors = !this.showInteriors;
    sfx('select');
    this.rows = sceneRows(this.showInteriors);
    const i = this.rows.indexOf(INTERIORS_ROW);
    this.index = i >= 0 ? i : firstSelectable(this.rows, 0, 1);
    this.top = clamp(this.top, 0, Math.max(0, this.rows.length - this._visible()));
    const n = this.rows.reduce((a, r) => a + (r.kind === 'travel' ? 1 : 0), 0);
    this.say(`${this.showInteriors ? 'Interiors listed' : 'Interiors hidden'} — ${n} destinations`);
  }

  /**
   * Warp there and drop the whole menu stack, so the player lands in the world
   * rather than in the pause menu this screen was opened from. cheat.tp toasts
   * its own arrival (or failure) line; this screen is gone before it lands.
   */
  _travel(row) {
    sfx('select');
    let res;
    try { res = cheat.tp(row.id); } catch (e) {
      this.say(`${row.label} failed: ${(e && e.message) || 'unknown error'}`, true);
      return;
    }
    if (res && typeof res.catch === 'function') res.catch(() => {});
    this._closing = true;
    safe(() => Game.popTo((s) => !s || !s.uiLayer));
  }

  /**
   * Call into core/cheats.js and report whatever it says. Every cheat returns
   * its own message (and toasts it), so this never has to invent one — which is
   * also what keeps the screen honest when a cheat declines to do anything.
   */
  _fire(row, sound) {
    sfx(sound || row.sound || 'select');
    let res;
    try {
      res = row.kind === 'time' ? cheat.time(TIME_PHASES[this.phase].id) : row.run();
    } catch (e) {
      this.say(`${row.label} failed: ${(e && e.message) || 'unknown error'}`, true);
      return;
    }
    if (res && typeof res.then === 'function') {
      res.then((msg) => this.say(msg == null ? `${row.label} done` : String(msg)),
        (e) => this.say(`${row.label} failed: ${(e && e.message) || 'unknown error'}`, true));
      return;
    }
    this.say(res == null ? `${row.label} done` : String(res));
  }

  // --- drawing ------------------------------------------------------------

  draw(ctx) {
    ctx.fillStyle = C.bgDeep;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    this.rowRects = [];
    this.spinRects = [];

    // The footer sizes itself around however many lines the code list needs, and
    // the list panel takes what is left. Add a code to cheats.js and this screen
    // gives it a row instead of hiding it behind an ellipsis.
    const codeW = VIEW_W - 4 - 12;
    if (!this._lines) this._lines = balancedLines(CHEAT_CODES, codeW);
    const footH = 13 + this._lines.length * 9;
    const footY = 218 - footH;
    const contentH = footY - 4 - CY;
    this.listRect = { x: LX, y: CY, w: LW, h: contentH };

    // title bar
    UI.panel(ctx, 2, TITLE_Y, VIEW_W - 4, TITLE_H, { style: 'dark' });
    txt(ctx, 8, TITLE_Y + 2, 'CHEATS', { size: 'md', color: C.gold, shadow: true });
    txtR(ctx, VIEW_W - 8, TITLE_Y + 3, SUBTITLE, {
      size: 'sm', color: C.disabled, shadow: true, maxWidth: VIEW_W - 70,
    });

    this._drawList(ctx, LX, CY, LW, contentH);
    this._drawDetail(ctx, DX, CY, DW, contentH);
    this._drawCodes(ctx, LX, footY, VIEW_W - 4, footH);

    hintBar(ctx, HINT_Y, [
      [keyFor('confirm'), 'Use'], [keyFor('cancel'), 'Back'],
      [`${keyFor('left')}${keyFor('right')}`, 'Adjust'], [`${keyFor('up')}${keyFor('down')}`, 'Move'],
    ]);
  }

  _drawList(ctx, x, y, w, h) {
    UI.panel(ctx, x, y, w, h, { style: 'window' });
    const rows = this.rows;
    if (!rows.length) {
      txtC(ctx, x + w / 2, y + h / 2 - 3, 'The cheat API is unavailable.', {
        size: 'sm', color: C.disabled, shadow: true, maxWidth: w - 12,
      });
      return;
    }
    const visible = this._visible();
    const scrolls = rows.length > visible;
    let top = this.top;
    if (this.index < top) top = this.index;
    if (this.index > top + visible - 1) top = this.index - visible + 1;
    // A group heading directly above the first visible row is worth keeping.
    if (top > 0 && rows[top - 1] && !selectable(rows[top - 1]) && this.index > top) top -= 1;
    this.top = top = clamp(top, 0, Math.max(0, rows.length - visible));

    const plv = partyLevel();
    const rowX = x + 3;
    const rowW = w - 6;
    const labelX = x + 12;
    // The gutter is reserved whether or not the bar is showing, so the value
    // column never shifts when the list happens to fit.
    const valueR = x + w - 9;

    UI.pushClip(ctx, x + 2, y + 3, w - 4, visible * ROW_H + 2);
    for (let i = 0; i < visible && top + i < rows.length; i++) {
      const idx = top + i;
      const r = rows[idx];
      const ry = y + 4 + i * ROW_H;
      if (r.kind === 'head') {
        sectionHead(ctx, labelX - 6, ry + 3, rowW - 12, r.label);
        continue;
      }
      if (r.kind === 'sub') {
        // Region names: a step in from the gold heads, and a step down in tone.
        sectionHead(ctx, labelX, ry + 3, rowW - 24, r.label, C.inkDim);
        continue;
      }
      const on = idx === this.index;
      if (on) UI.highlight(ctx, rowX, ry, rowW, ROW_H - 1, { alpha: 0.22 });
      this.rowRects.push({ x: rowX, y: ry, w: rowW, h: ROW_H - 1, i: idx });

      // Reserve the value column FIRST, then give the label everything left.
      // Measured against "Walk Through Walls" + OFF and "Return to Phandalin",
      // the widest label in each column, both at the selected 'md' weight.
      let reserve = 11;
      if (r.kind === 'toggle' || r.kind === 'trvopt') reserve = STATE_W + 6;
      else if (r.kind === 'time') reserve = SPIN_W + 6;
      else if (r.kind === 'travel') reserve = LVL_W + 8;
      // Destinations sit a step further in, under their region name.
      const lx = r.kind === 'travel' ? labelX + 5 : labelX;
      txt(ctx, lx, ry + 3, r.label, {
        size: on ? 'md' : 'sm', color: on ? C.goldBright : C.ink, shadow: true,
        maxWidth: Math.max(10, valueR - lx - reserve),
      });

      if (r.kind === 'toggle' || r.kind === 'trvopt') {
        // Read live, every frame: a typed code or the console flips this too.
        const v = r.kind === 'toggle' ? !!CHEATS[r.flag] : this.showInteriors;
        txtR(ctx, valueR, ry + 3, v ? 'ON' : 'OFF', {
          size: 'md', color: v ? C.good : C.disabled, shadow: true, maxWidth: STATE_W,
        });
      } else if (r.kind === 'travel') {
        // The level band, tinted by how far it sits above the party.
        const t = threat(r.level, plv);
        txtR(ctx, valueR, ry + 3, `Lv ${r.level}`, {
          size: on ? 'md' : 'sm', color: t ? THREAT_COLOR[t] : (on ? C.ink : C.inkDim),
          shadow: true, maxWidth: LVL_W + 4,
        });
      } else if (r.kind === 'time') {
        const p = TIME_PHASES[this.phase];
        const sx = valueR - SPIN_W;
        txt(ctx, sx, ry + 3, '◀', { size: 'sm', color: on ? C.gold : C.disabled });
        txtC(ctx, sx + SPIN_W / 2, ry + 3, p.label, {
          size: on ? 'md' : 'sm', color: on ? C.goldBright : C.ink, shadow: true, maxWidth: SPIN_W - 22,
        });
        txtR(ctx, valueR, ry + 3, '▶', { size: 'sm', color: on ? C.gold : C.disabled });
        this.spinRects.push({ x: sx - 2, y: ry, w: 12, h: ROW_H - 1, i: idx, dir: -1 });
        this.spinRects.push({ x: valueR - 10, y: ry, w: 12, h: ROW_H - 1, i: idx, dir: 1 });
      } else {
        txtR(ctx, valueR, ry + 3, '▶', { size: 'sm', color: on ? C.gold : C.goldDim });
      }
      if (on) UI.cursor(ctx, rowX + 1, ry + 3, this.t);
    }
    UI.popClip(ctx);

    if (scrolls) {
      const bx = x + w - 6, by = y + 4, bh = visible * ROW_H;
      const th = Math.max(6, Math.round((visible / rows.length) * bh));
      const ty = by + Math.round(((bh - th) * top) / Math.max(1, rows.length - visible));
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(bx, by, 3, bh);
      ctx.fillStyle = C.goldDim;
      ctx.fillRect(bx, ty, 3, th);
      ctx.restore();
    }
  }

  /** The detail strip: what the highlighted row does, and what it did last. */
  _drawDetail(ctx, x, y, w, h) {
    UI.panel(ctx, x, y, w, h, { style: 'window' });
    const ix = x + 6, iw = w - 12;
    const r = this.rows[this.index] || null;
    if (!r) return;

    txt(ctx, ix, y + 5, r.label, { size: 'md', color: C.gold, shadow: true, maxWidth: iw });
    // The sections flow from the description rather than sitting at fixed
    // offsets, so a two-line row does not leave forty pixels of nothing above
    // STATE. Longest description here is four lines at this width.
    const d = UI.textWrapped(ctx, ix, y + 17, iw, r.desc || '', { size: 'sm', color: C.ink, maxLines: 5 });
    let ty = y + 17 + d.height + 6;

    ty = sectionHead(ctx, ix, ty, iw, r.kind === 'travel' ? 'DESTINATION' : 'STATE');
    if (r.kind === 'toggle' || r.kind === 'trvopt') {
      const v = r.kind === 'toggle' ? !!CHEATS[r.flag] : this.showInteriors;
      txt(ctx, ix, ty, v ? 'ON' : 'OFF', { size: 'md', color: v ? C.good : C.disabled, shadow: true });
      // On its own line: "OFF Confirm turns it on" on one row leaves the hint
      // 122px for 119px of text, which is not a margin, it is a coincidence.
      txt(ctx, ix, ty + 10, v ? 'Confirm turns it off' : 'Confirm turns it on', {
        size: 'sm', color: C.inkDim, shadow: true, maxWidth: iw,
      });
      ty += 22;
    } else if (r.kind === 'travel') {
      // The informed-choice block: the destination's level against the party's,
      // so warping a level-2 party into Undermountain is a decision, not a trap.
      const plv = partyLevel();
      const t = threat(r.level, plv);
      const a = UI.textWrapped(ctx, ix, ty, iw, `Level ${r.level} — the party is level ${plv}`, {
        size: 'sm', color: C.ink, maxLines: 2,
      });
      ty += a.height + 2;
      const verdict = t === 0 && r.safe ? 'Safe ground — nothing fights you here' : THREAT_TEXT[t];
      const b = UI.textWrapped(ctx, ix, ty, iw, verdict, {
        size: 'sm', color: t ? THREAT_COLOR[t] : C.good, maxLines: 2,
      });
      ty += b.height + 2;
      txt(ctx, ix, ty, 'Confirm warps and closes the menu', {
        size: 'sm', color: C.inkDim, shadow: true, maxWidth: iw,
      });
      ty += 12;
    } else if (r.kind === 'time') {
      const now = clockText();
      txt(ctx, ix, ty, now ? `Clock reads ${now}` : 'No game running', {
        size: 'sm', color: now ? C.ink : C.bad, shadow: true, maxWidth: iw,
      });
      ty += 12;
    } else {
      txt(ctx, ix, ty, 'Fires once on Confirm', { size: 'sm', color: C.inkDim, shadow: true, maxWidth: iw });
      ty += 12;
    }

    ty = sectionHead(ctx, ix, ty, iw, 'CONSOLE');
    txt(ctx, ix, ty, r.call || '', { size: 'sm', color: C.cyan, shadow: true, maxWidth: iw });
    ty += 12;

    // The longest message any cheat returns is explore()'s 96-character report,
    // five lines at this width. `avail` is the number of 9px lines left above
    // the panel's inner edge, so the block can never print through the frame.
    ty = sectionHead(ctx, ix, ty, iw, 'RESULT');
    const avail = Math.max(1, Math.floor((y + h - 3 - ty - 6) / 9) + 1);
    if (this.msg) {
      UI.textWrapped(ctx, ix, ty, iw, this.msg, {
        size: 'sm', color: this.msgBad ? C.bad : C.goldBright, maxLines: avail,
        alpha: clamp(this.msgT / 0.6, 0, 1),
      });
    } else {
      txt(ctx, ix, ty, 'Nothing yet.', { size: 'sm', color: C.disabled, shadow: true, maxWidth: iw });
    }
  }

  /** The typed codes still work; print them all, wrapped, never cut. */
  _drawCodes(ctx, x, y, w, h) {
    UI.panel(ctx, x, y, w, h, { style: 'dark' });
    const ix = x + 6, iw = w - 12;
    const lit = SWITCHES.reduce((n, s) => n + (CHEATS[s.flag] ? 1 : 0), 0);
    const tally = `${lit} of ${SWITCHES.length} switches on`;
    const tw = UI.measure(tally, 'sm');
    let ty = sectionHead(ctx, ix, y + 3, Math.max(20, iw - tw - 8), 'TYPE THESE ANYWHERE IN THE GAME');
    txtR(ctx, ix + iw, y + 3, tally, {
      size: 'sm', color: lit ? C.warn : C.disabled, shadow: true, maxWidth: tw + 2,
    });
    for (const line of this._lines) {
      txt(ctx, ix, ty, line, { size: 'sm', color: C.ink, shadow: true, maxWidth: iw });
      ty += 9;
    }
  }
}

export default CheatsScene;
