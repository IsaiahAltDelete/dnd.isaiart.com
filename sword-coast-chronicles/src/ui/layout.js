// ui/layout.js — HUD widgets the player can move, hide and reset, and the Arrange mode that does it.
//
// Every block of a world scene's interface registers here once, at the spot it
// was designed for, and draws wherever Layout.rect(id) says — so the player (or
// a later agent) can rearrange the screen without touching the widget's code,
// and the widget's hit-testing, reading the same rect, follows it.
//
//   Layout.register('hud.party', { anchor: 'tl', x: 3, y: 3, w: 86, h: 130,
//                                  label: 'Party', scene: 'overworld' });
//   const r = Layout.rect('hud.party', { h: rows * 31 + 6 });   // live height
//   if (r.visible) drawPartyAt(r.x, r.y);
//
// x, y, w, h are the widget's DEFAULT rect in logical px. The anchor is the
// point of the screen the widget hangs from: a 'br' widget that grows keeps its
// bottom-right corner where it was, a 'tc' widget stays centred on its column.
// The player's changes are offsets from the default, persisted per widget in
// Save.settings.hudLayout as { dx, dy, hidden }, and every rect is clamped on
// screen so no layout, however mangled, can lose a widget off the edge.
//
// Arrange mode (F8 in the world, or Layout.beginArrange() from a menu):
// outlines and names every widget of the current scene. Drag to move (1px
// steps; hold Shift to snap to an 8px grid), arrow keys nudge the selection,
// Tab cycles it, H hides/shows, R resets one, Shift+R resets them all, P steps
// through the presets (Layout.definePreset), Esc or F8 finishes. engine.js freezes the scenes while
// it is open.

import { VIEW_W, VIEW_H, clamp } from '../constants.js';
import { Input } from '../core/input.js';
import { Save, EV_SETTINGS } from '../core/save.js';
import { bus } from '../core/events.js';
import { Stage } from '../render/stage.js';
import { UI } from './kit.js';

const W = VIEW_W, H = VIEW_H;
const R = Math.round;

// Where each anchor sits on the screen, as fractions of the width and height.
const ANCHOR = {
  tl: [0, 0], tc: [0.5, 0], tr: [1, 0],
  ml: [0, 0.5], mc: [0.5, 0.5], mr: [1, 0.5],
  bl: [0, 1], bc: [0.5, 1], br: [1, 1],
};

const widgets = new Map();       // id -> { id, anchor, x, y, w, h, label, scene, z, hideable, order }
let order = 0;

// Presets are rules applied to whatever widgets a scene has registered, so
// they survive the HUD being redesigned underneath: `place` puts named widgets
// at a top-left (logical px, at their designed size), `hide` hides them,
// `mirror` flips every widget left to right, and `mode` is data the widgets
// read back through Layout.mode() (the overworld HUD's party pips and its
// cinematic fade). Widget owners add their own with Layout.definePreset();
// the one in force is Save.settings.hudPreset.
const PRESETS = {
  default: { label: 'As designed' },
  mirrored: { label: 'Mirrored', mirror: true },
};

function store() {
  const s = Save.settings;
  if (!s.hudLayout || typeof s.hudLayout !== 'object' || Array.isArray(s.hudLayout)) s.hudLayout = {};
  return s.hudLayout;
}

function overrideOf(id) {
  const o = Save.settings && Save.settings.hudLayout && Save.settings.hudLayout[id];
  return o && typeof o === 'object' ? o : null;
}

function persist() {
  // Drop empty overrides so a reset widget leaves nothing behind in the file.
  const all = store();
  for (const k of Object.keys(all)) {
    const o = all[k];
    if (!o || (!o.dx && !o.dy && !o.hidden)) delete all[k];
  }
  try { Save.saveSettings(); } catch (e) { /* storage full or blocked: the layout still applies this session */ }
}

/** Where the widget's top-left sits by default at its live size (before any offset). */
function home(w) {
  const [fx, fy] = ANCHOR[w.anchor] || ANCHOR.tl;
  const ww = w.lw || w.w, hh = w.lh || w.h;
  return { x: w.x + (w.w - ww) * fx, y: w.y + (w.h - hh) * fy };
}

/** The rect for widget `w` at size (ww, hh), offset (dx, dy) from its default. */
function place(w, ww, hh, dx, dy) {
  const [fx, fy] = ANCHOR[w.anchor] || ANCHOR.tl;
  // The anchor point of the default rect, then the same point of the new size.
  const ax = w.x + w.w * fx + dx, ay = w.y + w.h * fy + dy;
  const x = R(ax - ww * fx), y = R(ay - hh * fy);
  return {
    x: clamp(x, 0, Math.max(0, W - ww)),
    y: clamp(y, 0, Math.max(0, H - hh)),
    w: ww, h: hh,
  };
}

export const Layout = {
  /** True while Arrange mode is open. */
  editing: false,
  /** The scene id Arrange mode is editing. */
  scene: null,

  register(id, o = {}) {
    const prev = widgets.get(id);
    const w = {
      id,
      anchor: ANCHOR[o.anchor] ? o.anchor : 'tl',
      x: Number(o.x) || 0, y: Number(o.y) || 0,
      w: Math.max(1, Number(o.w) || 1), h: Math.max(1, Number(o.h) || 1),
      label: o.label || id,
      scene: o.scene || '*',
      z: Number.isFinite(o.z) ? o.z : 0,
      hideable: o.hideable !== false,
      order: prev ? prev.order : order++,
    };
    widgets.set(id, w);
    return w;
  },

  has(id) { return widgets.has(id); },

  /**
   * { x, y, w, h, visible } in LOGICAL px, the player's offset applied and the
   * rect clamped on screen. `size` ({ w, h }) overrides the registered size for
   * widgets whose extent changes (a party panel with three members, not four).
   */
  rect(id, size) {
    const w = widgets.get(id);
    if (!w) return { x: 0, y: 0, w: (size && size.w) || 0, h: (size && size.h) || 0, visible: true };
    // A live size is remembered, so Arrange mode outlines the panel as drawn.
    if (size && size.w) w.lw = size.w;
    if (size && size.h) w.lh = size.h;
    const ww = Math.max(1, R(w.lw || w.w)), hh = Math.max(1, R(w.lh || w.h));
    const o = overrideOf(id);
    const r = place(w, ww, hh, o ? Number(o.dx) || 0 : 0, o ? Number(o.dy) || 0 : 0);
    r.visible = !(o && o.hidden && w.hideable);
    return r;
  },

  /** Is the widget shown? (Cheaper than rect() when only that is wanted.) */
  visible(id) {
    const w = widgets.get(id), o = overrideOf(id);
    return !(w && o && o.hidden && w.hideable);
  },

  /**
   * Change a widget: { x, y } moves it to that logical position, { dx, dy }
   * sets the offset from its default directly, { hidden } shows or hides it.
   */
  set(id, patch = {}) {
    const w = widgets.get(id);
    if (!w || !patch) return null;
    const all = store();
    const o = { ...(all[id] || {}) };
    const at = home(w);
    if (Number.isFinite(patch.x)) o.dx = R(patch.x - at.x);
    if (Number.isFinite(patch.y)) o.dy = R(patch.y - at.y);
    if (Number.isFinite(patch.dx)) o.dx = R(patch.dx);
    if (Number.isFinite(patch.dy)) o.dy = R(patch.dy);
    if (typeof patch.hidden === 'boolean') o.hidden = patch.hidden && w.hideable;
    all[id] = o;
    if (!patch.quiet) persist();
    return Layout.rect(id);
  },

  /** Back to the designed spot: one widget, or every widget (of `scene`, if given). */
  reset(id, scene) {
    const all = store();
    if (id) delete all[id];
    else for (const w of widgets.values()) if (!scene || w.scene === scene) delete all[w.id];
    persist();
  },

  /** Widgets registered for `scene` (plus scene '*'), in registration order. */
  widgets(scene) {
    return [...widgets.values()]
      .filter((w) => !scene || w.scene === scene || w.scene === '*')
      .sort((a, b) => (a.z - b.z) || (a.order - b.order));
  },

  get presets() { return Object.keys(PRESETS); },
  presetLabel(name) { return (PRESETS[name] && PRESETS[name].label) || name; },

  /**
   * Add (or replace) a preset: { label, place: { id: { x, y } }, hide: [ids],
   * mirror, mode: { ... } }. Registration order is the order Arrange mode's P
   * key and the settings picker step through.
   */
  definePreset(name, def = {}) {
    if (!name) return false;
    PRESETS[name] = { label: def.label || name, place: def.place || null, hide: def.hide || null,
      mirror: !!def.mirror, mode: def.mode || null };
    PRESET_ORDER.length = 0;
    PRESET_ORDER.push(...Object.keys(PRESETS));
    return true;
  },

  /** The preset in force (Save.settings.hudPreset), 'default' when unset or unknown. */
  get preset() {
    const p = Save.settings && Save.settings.hudPreset;
    return PRESETS[p] ? p : 'default';
  },

  /** A behaviour flag of the preset in force: Layout.mode('party') -> 'pips'. */
  mode(key) {
    const p = PRESETS[Layout.preset];
    return p && p.mode ? p.mode[key] : undefined;
  },

  /** Lay out every widget (of `scene`, if given) by one of the presets, and make it the one in force. */
  applyPreset(name, scene) {
    const p = PRESETS[name];
    if (!p) return false;
    const all = store();
    for (const w of Layout.widgets(scene)) {
      delete all[w.id];
      const o = {};
      const at = p.place && p.place[w.id];
      if (at) { o.dx = R((Number(at.x) || 0) - w.x); o.dy = R((Number(at.y) || 0) - w.y); }
      if (p.mirror) o.dx = R((W - (at ? at.x : w.x) - w.w) - w.x);
      if (p.hide && p.hide.includes(w.id) && w.hideable) o.hidden = true;
      if (o.dx || o.dy || o.hidden) all[w.id] = o;
    }
    if (Save.settings) Save.settings.hudPreset = name;
    applied = name;
    persist();
    return true;
  },

  // --- Arrange mode ---------------------------------------------------------

  /** Open Arrange mode on a world scene (an object with an id, or the id). */
  beginArrange(scene) {
    const id = typeof scene === 'string' ? scene : scene && scene.id;
    if (!id || !Layout.widgets(id).some((w) => w.scene === id)) return false;
    Layout.editing = true;
    Layout.scene = id;
    arr.sel = null; arr.drag = null; arr.t = 0;
    return true;
  },

  endArrange() {
    if (!Layout.editing) return;
    Layout.editing = false;
    arr.drag = null;
    persist();
    // The Escape that closed us must not also open the pause menu: its action
    // edge is only computed at the end of this frame, so consuming it here would
    // be too early. Blank the input instead, as after any modal.
    Input.flush();
  },

  toggleArrange(scene) {
    if (Layout.editing) { Layout.endArrange(); return false; }
    return Layout.beginArrange(scene);
  },

  updateArrange(dt) {
    arr.t += dt || 0;
    const list = Layout.widgets(Layout.scene).filter((w) => w.scene === Layout.scene);
    if (!list.length) { Layout.endArrange(); return; }
    const m = Input.mouse;
    const shift = Input.keyHeld('ShiftLeft') || Input.keyHeld('ShiftRight');

    // The topmost widget under the pointer (the last one drawn wins).
    arr.hover = null;
    if (m.over) {
      for (let i = list.length - 1; i >= 0; i--) {
        const r = Layout.rect(list[i].id);
        if (m.x >= r.x && m.x < r.x + r.w && m.y >= r.y && m.y < r.y + r.h) { arr.hover = list[i].id; break; }
      }
    }

    if (m.clicked) {
      m.clicked = false;
      arr.sel = arr.hover;
      if (arr.hover) {
        const r = Layout.rect(arr.hover);
        arr.drag = { id: arr.hover, mx: m.x, my: m.y, x: r.x, y: r.y };
      }
    }
    if (arr.drag) {
      const d = arr.drag;
      if (m.down) {
        let x = d.x + (m.x - d.mx), y = d.y + (m.y - d.my);
        if (shift) { x = R(x / 8) * 8; y = R(y / 8) * 8; }
        const r = Layout.rect(d.id);
        Layout.set(d.id, { x: clamp(R(x), 0, W - r.w), y: clamp(R(y), 0, H - r.h), quiet: true });
      } else {
        arr.drag = null;
        persist();
      }
    }

    // (F8 is the engine's: it toggles Arrange mode from wherever it is.)
    if (Input.tapped('Escape')) { Layout.endArrange(); return; }
    if (Input.tapped('Tab')) {
      const i = list.findIndex((w) => w.id === arr.sel);
      arr.sel = list[(i + (shift ? list.length - 1 : 1)) % list.length].id;
    }
    const target = arr.sel || arr.hover;
    if (Input.tapped('KeyR')) {
      if (shift) Layout.reset(null, Layout.scene);
      else if (target) Layout.reset(target);
    }
    // P steps through the presets (Layout.definePreset adds more).
    if (Input.tapped('KeyP')) {
      const i = PRESET_ORDER.indexOf(Layout.preset);
      Layout.applyPreset(PRESET_ORDER[(i + 1) % PRESET_ORDER.length], Layout.scene);
    }
    if (target && Input.tapped('KeyH')) {
      const w = widgets.get(target);
      if (w && w.hideable) Layout.set(target, { hidden: Layout.visible(target) });
    }
    if (arr.sel && !arr.drag) {
      const step = shift ? 8 : 1;
      const nx = (Input.tapped('ArrowRight') ? step : 0) - (Input.tapped('ArrowLeft') ? step : 0);
      const ny = (Input.tapped('ArrowDown') ? step : 0) - (Input.tapped('ArrowUp') ? step : 0);
      if (nx || ny) {
        const r = Layout.rect(arr.sel);
        Layout.set(arr.sel, { x: clamp(r.x + nx, 0, W - r.w), y: clamp(r.y + ny, 0, H - r.h) });
      }
    }
  },

  /** The outlines, names and instructions, on the 'overlay' layer. */
  drawArrange(ctx) {
    const list = Layout.widgets(Layout.scene).filter((w) => w.scene === Layout.scene);
    const pulse = 0.5 + 0.5 * Math.sin(arr.t * 5);
    const shift = Input.keyHeld('ShiftLeft') || Input.keyHeld('ShiftRight');
    ctx.save();
    // A veil says "the world is paused and you are editing" without hiding it.
    ctx.fillStyle = 'rgba(10,7,14,0.34)';
    ctx.fillRect(0, 0, W, H);
    if (arr.drag && shift) {
      ctx.fillStyle = 'rgba(227,179,74,0.12)';
      for (let x = 0; x < W; x += 8) ctx.fillRect(x, 0, 0.5, H);
      for (let y = 0; y < H; y += 8) ctx.fillRect(0, y, W, 0.5);
    }
    for (const w of list) {
      const r = Layout.rect(w.id);
      const sel = w.id === arr.sel, hov = w.id === arr.hover;
      const col = !r.visible ? '#c0604e' : sel ? '#f7dc92' : hov ? '#e3b34a' : '#b08a44';
      // The widget's footprint, washed so it reads against any backdrop.
      ctx.fillStyle = !r.visible ? 'rgba(70,16,14,0.5)'
        : sel ? `rgba(247,220,146,${(0.12 + 0.08 * pulse).toFixed(3)})` : hov ? 'rgba(227,179,74,0.12)' : 'rgba(176,138,68,0.07)';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      if (sel || hov) outline(ctx, r, col, 1);
      else dashRect(ctx, r.x, r.y, r.w, r.h, col, 0.9, arr.t);
      tag(ctx, r, (r.visible ? '' : 'hidden: ') + w.label, col, sel ? `${r.x},${r.y}` : '');
    }
    // The instruction plate, sized to its text, in the first free band down
    // the middle of the screen: the HUD lives round the edges, and the world is
    // frozen, so the middle is the one place it hides nothing being arranged.
    const res = Stage.resOf(ctx);
    const preset = Layout.presetLabel(Layout.preset);
    const l1 = 'ARRANGE HUD  -  drag a panel to move it, Shift snaps to 8';
    const l2 = `Arrows nudge   Tab next   H hide   R reset   Shift+R all   P: ${preset}   Esc done`;
    const pw = Math.ceil(Math.max(UI.measure(l1, 'fineb', undefined, res), UI.measure(l2, 'fine', undefined, res))) + 12;
    const ph = 15, px = R(W / 2 - pw / 2);
    const m = Input.mouse;
    const free = (y) => !(m.over && m.y >= y - 4 && m.y < y + ph + 4 && m.x >= px && m.x < px + pw)
      && !list.some((w) => { const r = Layout.rect(w.id); return r.visible && r.x < px + pw && r.x + r.w > px && r.y < y + ph && r.y + r.h > y; });
    const py = [60, 150, 100, 36, 180].find(free) ?? 60;
    UI.panel(ctx, px, py, pw, ph, { style: 'dark', alpha: 0.94 });
    fine(ctx, W / 2, py + 3, l1, '#f7dc92', 'center', true);
    fine(ctx, W / 2, py + 8.5, l2, '#cbb894', 'center');
    ctx.restore();
  },
};

// Arrange-mode state (module-private).
const arr = { sel: null, hover: null, drag: null, t: 0 };
const PRESET_ORDER = Object.keys(PRESETS);

// Choosing a preset in the Options screen saves Save.settings.hudPreset like
// any other setting; this is what then lays the widgets out by it. `applied`
// is the last preset laid out, so the save applyPreset itself makes (which
// comes back through here) does not lay everything out a second time.
let applied = (Save.settings && Save.settings.hudPreset) || 'default';
bus.on(EV_SETTINGS, (s) => {
  const p = s && s.hudPreset;
  if (p && p !== applied && PRESETS[p]) Layout.applyPreset(p);
});

/** Text in the kit's half-size face (crisp on the fine interface layers, 'sm' anywhere else). */
function fine(ctx, x, y, str, color, align, bold) {
  UI.text(ctx, x, y, str, { size: bold ? 'fineb' : 'fine', color, align: align || 'left' });
}

/** A solid outline, one device pixel wide on a fine layer. */
function outline(ctx, r, color, alpha) {
  const t = Stage.resOf(ctx) >= 2 ? 0.5 : 1;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(r.x, r.y, r.w, t); ctx.fillRect(r.x, r.y + r.h - t, r.w, t);
  ctx.fillRect(r.x, r.y, t, r.h); ctx.fillRect(r.x + r.w - t, r.y, t, r.h);
  ctx.restore();
}

/** Marching ants: a dashed outline that crawls round the widget. */
function dashRect(ctx, x, y, w, h, color, alpha, t) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  const phase = Math.floor(t * 8) % 4;
  const k = Stage.resOf(ctx) >= 2 ? 0.5 : 1;
  const run = (len, put) => { for (let i = 0; i < len; i++) if (((i + phase) & 3) < 2) put(i); };
  run(w, (i) => { ctx.fillRect(x + i, y, 1, k); ctx.fillRect(x + w - 1 - i, y + h - k, 1, k); });
  run(h, (i) => { ctx.fillRect(x + w - k, y + i, k, 1); ctx.fillRect(x, y + h - 1 - i, k, 1); });
  ctx.restore();
}

/** The widget's name on a small plate at its top-left corner, in fine text. */
function tag(ctx, r, label, color, extra) {
  const text = extra ? `${label}  ${extra}` : label;
  const tw = UI.measure(text, 'fineb', undefined, Stage.resOf(ctx)) + 3;
  const tx = clamp(r.x, 0, W - tw), ty = r.y >= 6 ? r.y - 5.5 : r.y + 1;
  ctx.fillStyle = 'rgba(12,9,16,0.9)';
  ctx.fillRect(tx, ty, tw, 5.5);
  ctx.fillStyle = color;
  ctx.fillRect(tx, ty + 5, tw, 0.5);
  fine(ctx, tx + 1.5, ty + 1, text, color, 'left', true);
}

export default Layout;
