// ui/hudparts.js — the overworld HUD's small parts: fine-grid frames, meters, keycaps, marks and badges.
//
// The HUD draws on the 'hud' layer, a 2x interface layer, so half a logical
// pixel is a real device pixel. Everything here is placed on that half-pixel
// grid (snap) so hairlines stay one device pixel wide and nothing blurs. The
// frames take their fill and edge from the kit's live theme (UI.PANEL_STYLES),
// so the HUD re-skins with Folio, Timber, Iron and Parchment like the menus.

import { UI } from './kit.js';
import { GILT, RUBRIC } from './ornament.js';
import { clamp } from '../constants.js';

/** Round to the fine grid (half a logical px). */
export const snap = (v) => Math.round(v * 2) / 2;

const K = {
  ink: '#efe6d0', dim: '#9a917f', faint: '#6a6258', gold: '#e3b34a', red: '#d4553f', green: '#6fc36a',
  blue: '#6aa8e8', purple: '#b07ae0', hp: '#c8452f', xp: '#e3b34a',
};
/** A kit colour token, with the HUD's own fallback. */
export const C = (k) => (UI.COLORS && UI.COLORS[k]) || K[k] || '#ffffff';

// ---------------------------------------------------------------------------
// text
// ---------------------------------------------------------------------------

/** Text at (x, y) in `size`, never throwing: a broken glyph must not take the frame down. */
export function txt(ctx, x, y, s, size, color, o) {
  try { return UI.text(ctx, snap(x), snap(y), String(s), { size, color, ...(o || {}) }); } catch (e) { return { w: 0 }; }
}
export function tw(s, size) {
  try { return UI.measure(String(s), size, undefined, 2) || 0; } catch (e) { return String(s).length * 3; }
}
export function fit(s, w, size) {
  try { return UI.fit(String(s == null ? '' : s), w, size, 2); } catch (e) { return String(s); }
}
/**
 * A person's name in `w` pixels: the whole name if it fits, else the first
 * word (what everyone at the table calls them), else an ellipsis. "Sildar
 * Hall…" reads as a bug; "Sildar" reads as a name.
 */
export function shortName(name, w, size) {
  const s = String(name == null || name === '' ? 'Unnamed' : name);
  if (tw(s, size) <= w) return s;
  const first = s.split(/[\s,]+/)[0];
  if (first && first !== s && tw(first, size) <= w) return first;
  return fit(s, w, size);
}

// ---------------------------------------------------------------------------
// frames
// ---------------------------------------------------------------------------

/**
 * The edge of the theme's dark material: the first lit/shade ring pair in its
 * fine rings (gilt on Folio, brass on Timber, steel on Iron, pale on Parchment).
 */
function themeEdge(mat) {
  for (const r of (mat && mat.fineRings) || []) if (Array.isArray(r)) return r;
  return [GILT.mid, GILT.lo];
}

const TONES = {
  gilt: [GILT.hi, GILT.lo],
  danger: ['#e0644a', RUBRIC.lo],
  dead: ['#6a6060', '#2a2424'],
  magic: ['#c8a8ff', '#4a2e84'],
};

/**
 * A HUD plate: a one-device-pixel keyline, a lit/shaded bevel and a gradient
 * fill, one logical px of border in all — the kit's panels spend two or three,
 * which a 17px party card cannot afford.
 * o: { tone: 'gilt'|'danger'|'dead'|'magic', alpha (fill), edge (0..1 edge
 *      strength), style (kit material, default 'dark'), shadow (bool),
 *      outline (only the bevel, over something already drawn) }
 */
export function frame(ctx, x, y, w, h, o = {}) {
  x = snap(x); y = snap(y); w = snap(w); h = snap(h);
  if (w <= 1 || h <= 1) return;
  const mat = (UI.PANEL_STYLES && UI.PANEL_STYLES[o.style || 'dark']) || null;
  const fill = (mat && mat.fill) || ['#171a24', '#0c0e15'];
  const [lit, shade] = TONES[o.tone] || themeEdge(mat);
  const prev = ctx.globalAlpha;
  if (o.outline) {
    // Just the bevel, laid over something already drawn (a hovered button).
    ctx.fillStyle = lit;
    ctx.fillRect(x, y, w, 0.5); ctx.fillRect(x, y + 0.5, 0.5, h - 0.5);
    ctx.fillStyle = shade;
    ctx.fillRect(x + 0.5, y + h - 0.5, w - 0.5, 0.5); ctx.fillRect(x + w - 0.5, y + 0.5, 0.5, h - 1);
    return;
  }
  if (o.shadow !== false) {
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.fillRect(x + 0.5, y + h, w, 0.5);
    ctx.fillRect(x + w, y + 0.5, 0.5, h);
  }
  ctx.fillStyle = '#07060a';
  ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = prev * (o.alpha == null ? 0.94 : o.alpha);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, fill[0]); g.addColorStop(1, fill[1]);
  ctx.fillStyle = g;
  ctx.fillRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.globalAlpha = prev * (o.edge == null ? (o.tone ? 1 : 0.62) : o.edge);
  ctx.fillStyle = lit;
  ctx.fillRect(x + 0.5, y + 0.5, w - 1, 0.5);
  ctx.fillRect(x + 0.5, y + 1, 0.5, h - 1.5);
  ctx.fillStyle = shade;
  ctx.fillRect(x + 1, y + h - 1, w - 1.5, 0.5);
  ctx.fillRect(x + w - 1, y + 1, 0.5, h - 2);
  ctx.globalAlpha = prev;
  if (o.tone === 'gilt') {
    // Gilt corner ticks: the leader's card and anything chosen.
    ctx.fillStyle = GILT.spec;
    for (const [cx, cy] of [[x + 0.5, y + 0.5], [x + w - 1, y + 0.5], [x + 0.5, y + h - 1], [x + w - 1, y + h - 1]]) {
      ctx.fillRect(cx, cy, 0.5, 0.5);
    }
  }
}

/** A recessed well inside a frame (portrait boxes, slot faces). */
export function well(ctx, x, y, w, h, fill = '#0c0a0d') {
  x = snap(x); y = snap(y); w = snap(w); h = snap(h);
  ctx.fillStyle = 'rgba(0,0,0,0.8)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = fill;
  ctx.fillRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.fillStyle = 'rgba(255,236,200,0.13)';
  ctx.fillRect(x + 0.5, y + h - 0.5, w - 0.5, 0.5);
  ctx.fillRect(x + w - 0.5, y + 0.5, 0.5, h - 0.5);
}

/** A soft dark wash for text laid straight over the world (the log). */
export function scrim(ctx, x, y, w, h, a = 0.62) {
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, `rgba(10,8,12,${a})`);
  g.addColorStop(0.7, `rgba(10,8,12,${a * 0.7})`);
  g.addColorStop(1, 'rgba(10,8,12,0)');
  ctx.fillStyle = g;
  ctx.fillRect(snap(x), snap(y), snap(w), snap(h));
}

// ---------------------------------------------------------------------------
// meters and keycaps
// ---------------------------------------------------------------------------

/** Lighter / darker versions of a #rrggbb colour, for a meter's bevel. */
function tint(hex, k) {
  const n = parseInt(String(hex).slice(1, 7), 16);
  if (!Number.isFinite(n)) return hex;
  const f = (c) => clamp(Math.round(k > 0 ? c + (255 - c) * k : c * (1 + k)), 0, 255);
  const r = f((n >> 16) & 255), g = f((n >> 8) & 255), b = f(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/**
 * A fine-grid meter: keyline, trough, a draining ghost of what was just lost,
 * the fill with a lit top row and a shaded bottom row, and quarter notches.
 * o: { ghost (0..1), temp (0..1 temp HP cap), pulse (0..1 low-health breath), notches }
 */
export function meter(ctx, x, y, w, h, pct, color, o = {}) {
  x = snap(x); y = snap(y); w = snap(w); h = snap(h);
  pct = clamp(pct || 0, 0, 1);
  ctx.fillStyle = '#060507';
  ctx.fillRect(x - 0.5, y - 0.5, w + 1, h + 1);
  ctx.fillStyle = '#231a18';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(x, y, w, 0.5);
  const ghost = clamp(o.ghost == null ? pct : o.ghost, 0, 1);
  if (ghost > pct) {
    ctx.fillStyle = '#f0c8a0';
    ctx.fillRect(x, y, snap(w * ghost), h);
  }
  const fw = pct > 0 ? Math.max(0.5, snap(w * pct)) : 0;
  if (fw > 0) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, fw, h);
    if (h >= 1.5) {
      ctx.fillStyle = tint(color, 0.35);
      ctx.fillRect(x, y, fw, 0.5);
      ctx.fillStyle = tint(color, -0.35);
      ctx.fillRect(x, y + h - 0.5, fw, 0.5);
    }
    if (o.pulse > 0) {
      const a = ctx.globalAlpha;
      ctx.globalAlpha = a * o.pulse;
      ctx.fillStyle = '#ffd0a0';
      ctx.fillRect(x, y, fw, h);
      ctx.globalAlpha = a;
    }
  }
  if (o.temp > 0) {
    ctx.fillStyle = '#9ac8f4';
    const t = Math.max(0.5, snap(w * clamp(o.temp, 0, 1)));
    ctx.fillRect(Math.max(x, x + fw - t), y, t, 0.5);
  }
  if (o.notches !== false && w >= 20) {
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    for (let i = 1; i < 4; i++) ctx.fillRect(snap(x + (w * i) / 4), y + 0.5, 0.5, h - 0.5);
  }
}

/**
 * A tiny ivory keycap with a letter in the compact face, the fine-grid cousin
 * of UI.keyHint. Returns its width. o: { dim, color }
 */
export function cap(ctx, x, y, key, o = {}) {
  const s = String(key || '').toUpperCase();
  // The plain fine face: at seven device pixels a bold letter fills in.
  const w = snap(Math.max(5.5, tw(s, 'fine') + 2.5));
  const h = 6;
  x = snap(x); y = snap(y);
  const a = ctx.globalAlpha;
  if (o.dim) ctx.globalAlpha = a * 0.6;
  ctx.fillStyle = '#140c05';
  ctx.fillRect(x, y, w, h);
  // the key's front lip in shade, its top lit, a highlight along the far edge
  ctx.fillStyle = o.dim ? '#5a4a30' : '#8a6424';
  ctx.fillRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.fillStyle = o.dim ? '#a8987a' : (o.color || '#ecd08a');
  ctx.fillRect(x + 0.5, y + 0.5, w - 1, h - 1.5);
  ctx.fillStyle = o.dim ? '#c8baa0' : '#fff4d0';
  ctx.fillRect(x + 1, y + 0.5, w - 2, 0.5);
  txt(ctx, x + w / 2 + 0.25, y + 1, s, 'fine', '#241606', { align: 'center' });
  ctx.globalAlpha = a;
  return w;
}

// ---------------------------------------------------------------------------
// 5x5 pixel marks — condition badges, weather, the toasts' little signs.
// ---------------------------------------------------------------------------

export const MARKS = {
  eye: ['.XXX.', 'X...X', 'X.X.X', 'X...X', '.XXX.'],
  heart: ['.X.X.', 'XXXXX', 'XXXXX', '.XXX.', '..X..'],
  drop: ['..X..', '..X..', '.XXX.', 'XXXXX', '.XXX.'],
  chain: ['XX...', 'X.X..', '.XXX.', '..X.X', '...XX'],
  zzz: ['XXXX.', '...X.', '..X..', '.X...', 'XXXX.'],
  flame: ['..X..', '.XX..', '.XXX.', 'XXXXX', '.XXX.'],
  snow: ['X.X.X', '.XXX.', 'XXXXX', '.XXX.', 'X.X.X'],
  down: ['..X..', '..X..', 'XXXXX', '.XXX.', '..X..'],
  star: ['..X..', '.XXX.', 'XXXXX', '.X.X.', 'X...X'],
  bang: ['..X..', '..X..', '..X..', '.....', '..X..'],
  skull: ['.XXX.', 'X.X.X', 'XXXXX', '.X.X.', '.XXX.'],
  fist: ['.XXX.', 'XXXXX', 'XXXXX', '.XXX.', '..X..'],
  stone: ['.XXX.', 'XXXXX', 'XXXXX', 'XXXXX', '.XXX.'],
  coin: ['.XXX.', 'X.X.X', 'X.X.X', 'X.X.X', '.XXX.'],
  scroll: ['XXXXX', 'X...X', 'XXXXX', 'X...X', 'XXXXX'],
  person: ['..X..', '.XXX.', '..X..', '.XXX.', 'X...X'],
  sword: ['....X', '...XX', '..XX.', 'XXX..', 'XX...'],
  sun: ['X.X.X', '.XXX.', 'XXXXX', '.XXX.', 'X.X.X'],
  cloud: ['.....', '.XXX.', 'XXXXX', 'XXXXX', '.....'],
  rain: ['.XXX.', 'XXXXX', '.....', 'X.X.X', 'X.X.X'],
  fog: ['.....', 'XXXXX', '.....', 'XXXXX', '.....'],
  ash: ['X...X', '..X..', 'X...X', '..X..', 'X...X'],
  moon: ['.XXX.', 'XX...', 'XX...', 'XX...', '.XXX.'],
  shield: ['XXXXX', 'XXXXX', 'XXXXX', '.XXX.', '..X..'],
};

/** Plot a 5x5 mark with its top-left at (x, y); `s` is the pixel size (0.5 on the fine grid). */
export function mark(ctx, name, x, y, color, s = 1) {
  const rows = MARKS[name];
  if (!rows) return;
  x = s < 1 ? snap(x) : Math.round(x); y = s < 1 ? snap(y) : Math.round(y);
  ctx.fillStyle = color;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    for (let c = 0; c < row.length; c++) if (row[c] === 'X') ctx.fillRect(x + c * s, y + r * s, s, s);
  }
}

/**
 * A mark with a dark keyline round it, so a 5x5 badge reads on a bright card
 * or straight over grass: the keyline is the mark itself, offset four ways.
 */
export function markKeyed(ctx, name, x, y, color, s = 1) {
  const k = s < 1 ? 0.5 : 1;
  for (const [dx, dy] of [[-k, 0], [k, 0], [0, -k], [0, k]]) mark(ctx, name, x + dx, y + dy, 'rgba(6,5,8,0.9)', s);
  mark(ctx, name, x, y, color, s);
}

// ---------------------------------------------------------------------------
// Conditions and buffs. rules/conditions.js may supply a colour per condition;
// the HUD carries its own table so it never waits on it.
// ---------------------------------------------------------------------------

const COND_BADGE = {
  blinded: { mark: 'eye', color: '#8a8aa0' },
  charmed: { mark: 'heart', color: '#e07ab0' },
  deafened: { mark: 'zzz', color: '#8a8a9a' },
  frightened: { mark: 'bang', color: '#b07ae0' },
  grappled: { mark: 'chain', color: '#a08a60' },
  incapacitated: { mark: 'zzz', color: '#c0c0c0' },
  invisible: { mark: 'eye', color: '#6aa8e8' },
  paralyzed: { mark: 'fist', color: '#e3d24a' },
  petrified: { mark: 'stone', color: '#9a9a9a' },
  poisoned: { mark: 'drop', color: '#7ad36a' },
  prone: { mark: 'down', color: '#b09a7a' },
  restrained: { mark: 'chain', color: '#c88a3a' },
  stunned: { mark: 'star', color: '#e3b34a' },
  unconscious: { mark: 'zzz', color: '#8a8aa0' },
  exhaustion: { mark: 'bang', color: '#c05a4a' },
  burning: { mark: 'flame', color: '#ff7a3a' },
  frozen: { mark: 'snow', color: '#8ad8e8' },
  blessed: { mark: 'star', color: '#e3d24a' },
  bane: { mark: 'bang', color: '#a05aa0' },
  marked: { mark: 'bang', color: '#d4553f' },
  concentrating: { mark: 'eye', color: '#7aa8e8' },
  raging: { mark: 'flame', color: '#e0553f' },
  hidden: { mark: 'eye', color: '#8a8aa2' },
};

/**
 * Buff badges, for what lives in `ch.effects` rather than `ch.conditions`:
 * you cast Mage Armor, and the card should say it is up. Keyed by effect id
 * with a loose match on the name, because a spell may write either.
 */
const BUFF_BADGE = {
  'mage-armor': { mark: 'shield', color: '#8ab4e8' },
  'shield-of-faith': { mark: 'shield', color: '#e3d24a' },
  'blade-ward': { mark: 'shield', color: '#b0b0c8' },
  bless: { mark: 'star', color: '#e3d24a' },
  heroism: { mark: 'heart', color: '#e0a03a' },
  guidance: { mark: 'star', color: '#8ad8c0' },
  resistance: { mark: 'shield', color: '#7aa8e8' },
  longstrider: { mark: 'person', color: '#8ad86a' },
  haste: { mark: 'person', color: '#e3d24a' },
  jump: { mark: 'person', color: '#8ad86a' },
  'water-walk': { mark: 'drop', color: '#7ac8e8' },
  'spider-climb': { mark: 'person', color: '#a08ad8' },
  fly: { mark: 'cloud', color: '#a8c8f0' },
  invisibility: { mark: 'eye', color: '#6aa8e8' },
  'pass-without-trace': { mark: 'fog', color: '#9aaab8' },
  'enhance-ability': { mark: 'fist', color: '#d8a03a' },
  'protection-from-evil-and-good': { mark: 'shield', color: '#e8e0c0' },
  'freedom-of-movement': { mark: 'chain', color: '#8ad8c0' },
  light: { mark: 'sun', color: '#ffe9a3' },
  familiar: { mark: 'eye', color: '#8ad86a' },
  steed: { mark: 'person', color: '#c8a86a' },
  darkvision: { mark: 'eye', color: '#9a8ae0' },
};

function buffBadgeFor(e) {
  const id = String((e && e.id) || '').toLowerCase();
  if (BUFF_BADGE[id]) return BUFF_BADGE[id];
  const name = String((e && e.name) || '').toLowerCase().replace(/[^a-z]+/g, '-');
  if (BUFF_BADGE[name]) return BUFF_BADGE[name];
  for (const key of Object.keys(BUFF_BADGE)) if (id.includes(key) || name.includes(key)) return BUFF_BADGE[key];
  return { mark: 'star', color: '#8ad8a0' };
}

let CONDITIONS_CAT = null;
import('../rules/conditions.js').then((m) => { if (m && m.CONDITIONS) CONDITIONS_CAT = m.CONDITIONS; }).catch(() => {});

function badgeFor(id) {
  const base = COND_BADGE[id] || { mark: 'bang', color: '#b0a890' };
  const cat = CONDITIONS_CAT && CONDITIONS_CAT[id];
  return cat && cat.color ? { ...base, color: cat.color } : base;
}

/**
 * Everything currently true about a character, as badges: buffs first (what
 * you did on purpose matters most when deciding whether to set off), then
 * concentration, then afflictions. Each is { mark, color, good }.
 */
export function badgesOf(m) {
  const seen = new Set();
  const good = [], bad = [];
  const nice = (s) => String(s || '').replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  for (const e of Array.isArray(m.effects) ? m.effects : []) {
    const key = String((e && e.id) || (e && e.name) || '').toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    good.push({ ...buffBadgeFor(e), good: true, name: (e && e.name) || nice(key) });
  }
  if (m.concentration) {
    seen.add('concentrating');
    const on = typeof m.concentration === 'object' ? (m.concentration.name || m.concentration.spellId) : null;
    bad.push({ ...badgeFor('concentrating'), good: false, name: on ? `Concentrating: ${nice(on)}` : 'Concentrating' });
  }
  for (const c of Array.isArray(m.conditions) ? m.conditions : []) {
    const id = typeof c === 'string' ? c : (c && c.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const cat = CONDITIONS_CAT && CONDITIONS_CAT[id];
    bad.push({ ...badgeFor(id), good: false, name: (cat && cat.name) || nice(id) });
  }
  return good.concat(bad);
}

// ---------------------------------------------------------------------------
// Small cached canvases (dials, rings, needles): drawn once in device pixels.
// ---------------------------------------------------------------------------

const CACHE = new Map();
const CACHE_MAX = 64;

/**
 * A canvas of `w` x `h` LOGICAL px at device resolution, drawn once by
 * paint(g) with g in FINE px (1 unit = one device pixel), reused per key.
 */
export function cached(key, w, h, paint) {
  let cv = CACHE.get(key);
  if (cv) return cv;
  cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.ceil(w * 2)); cv.height = Math.max(1, Math.ceil(h * 2));
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  try { paint(g, cv.width, cv.height); } catch (e) { /* an empty canvas is better than a broken frame */ }
  if (CACHE.size >= CACHE_MAX) CACHE.delete(CACHE.keys().next().value);
  CACHE.set(key, cv);
  return cv;
}

/** Blit a cached device-resolution canvas at logical (x, y). */
export function blit(ctx, cv, x, y) {
  if (!cv) return;
  const s = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(cv, snap(x), snap(y), cv.width / 2, cv.height / 2);
  ctx.imageSmoothingEnabled = s;
}

/** Fill every device pixel of a disc (centre cx, cy, radius r, in device px) — no antialiasing. */
export function disc(g, cx, cy, r, color) {
  g.fillStyle = color;
  const r2 = r * r;
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    const dy = y + 0.5 - cy;
    if (dy * dy > r2) continue;
    const half = Math.sqrt(r2 - dy * dy);
    const x0 = Math.round(cx - half), x1 = Math.round(cx + half);
    if (x1 > x0) g.fillRect(x0, y, x1 - x0, 1);
  }
}

/** A one-pixel ring between radii r0 and r1 (device px), split lit (upper left) / shaded. */
export function ring(g, cx, cy, r0, r1, lit, shade) {
  const a2 = r0 * r0, b2 = r1 * r1;
  for (let y = Math.floor(cy - r1); y <= Math.ceil(cy + r1); y++) {
    for (let x = Math.floor(cx - r1); x <= Math.ceil(cx + r1); x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = dx * dx + dy * dy;
      if (d < a2 || d > b2) continue;
      g.fillStyle = shade && dx + dy > 0 ? shade : lit;
      g.fillRect(x, y, 1, 1);
    }
  }
}
