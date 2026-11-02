// ui/kit.js — the illuminated-manuscript interface kit: typefaces, themed panels, meters, icons, widgets.
// EVERY other UI module draws through this file so the whole game looks like one product.
//
// The look: dark vellum and tooled leather, gilt hairlines, rubricated
// headings, drop-cap initials and heraldry. Four themes (folio, timber, iron,
// parchment) re-skin the same surfaces; the player picks one in Options.
//
// Two grids. All coordinates are LOGICAL px (400x240). On a fine layer (the
// Stage draws UI through a 2x base transform, see ui/ornament.js `resOf`) the
// kit also draws on the half-pixel FINE grid: the `fine` and `xs` typefaces,
// gilt hairlines, rivets and jewels, icon keylines. On a plain 1x context the
// same calls fall back to whole pixels, so nothing is ever blurry and every
// call site works on either.
//
// Text sizes (see glyphs.js for the faces):
//   sm md lg lgb xl xxl  the 5x7 body face at scales 1..4 (md/lgb bold)
//   fine fineb           the body face at half size on the fine grid (-> sm on 1x)
//   xs                   the compact 4x6 face on the fine grid (-> sm on 1x)
//   title titleLg        the Lombardic/textura display face, 8px / 16px capitals
//
// Rendering strategy: a glyph atlas is baked ONCE per (face, resolution,
// colour, style), then every character is a single drawImage. Never fillRect
// per pixel per frame — a full screen of text is ~600 glyphs.

import { drawSprite, hasSprite, shadeHex, portraitPainter } from '../render/sprites.js';
import { ramp, INK } from '../render/palette.js';
import { drawWeaponIcon } from '../render/weapon-art.js';
import { hashStr } from '../core/rng.js';
import { bus } from '../core/events.js';
import { Save, EV_SETTINGS } from '../core/save.js';
import { VIEW_W, VIEW_H } from '../constants.js';
import { FACES, HEAD, BODY } from './glyphs.js';
import {
  resOf, makeCanvas, stamp, rivet, boss, fleuron, vine, grain, hairFrame, corners, deckle,
  GILT, RUBRIC, LAPIS, VERDIGRIS,
} from './ornament.js';

// ---------------------------------------------------------------------------
// 0. TINY HELPERS
// ---------------------------------------------------------------------------

const R = Math.round;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
/** Round to the grid a context draws on: whole px on 1x, half px on a fine layer. */
const snap = (v, res) => (res >= 2 ? Math.round(v * 2) / 2 : Math.round(v));

/**
 * shadeHex() only understands '#rgb'/'#rrggbb'. Callers hand us rgba() strings
 * and gradients all the time, so pass anything else straight through instead of
 * silently turning it black.
 */
function shade(color, amt) {
  return (typeof color === 'string' && color.charCodeAt(0) === 35) ? shadeHex(color, amt) : color;
}

/** A crisp 1px-per-side rectangle outline built from fillRects (no half-pixel stroke). */
function rectStroke(ctx, x, y, w, h, color, t = 1) {
  if (w <= 0 || h <= 0 || !color) return;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, t);                 // top
  ctx.fillRect(x, y + h - t, w, t);         // bottom
  ctx.fillRect(x, y + t, t, h - t * 2);     // left
  ctx.fillRect(x + w - t, y + t, t, h - t * 2); // right
}

/** Vertical two-stop gradient fill. */
function vgrad(ctx, x, y, w, h, top, bot) {
  if (w <= 0 || h <= 0) return;
  if (!bot || bot === top) { ctx.fillStyle = top; ctx.fillRect(x, y, w, h); return; }
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, top);
  g.addColorStop(1, bot);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
}

/** Bounded LRU-ish cache: cheap Map with an eviction cap. */
function boundedCache(limit) {
  const m = new Map();
  return {
    get(k) {
      const v = m.get(k);
      if (v !== undefined) { m.delete(k); m.set(k, v); }  // touch = most recent
      return v;
    },
    set(k, v) {
      if (m.size >= limit) { const first = m.keys().next().value; m.delete(first); }
      m.set(k, v);
      return v;
    },
    clear() { m.clear(); },
    get size() { return m.size; },
  };
}

// ---------------------------------------------------------------------------
// 1. THE TYPEFACES
// ---------------------------------------------------------------------------

export const GLYPH_W = 5;
export const GLYPH_H = 7;
export const LINE_GAP = 2;   // blank rows between baselines, in glyph pixels

/** The body face's glyph table (char -> 7 rows), kept for tools and tests. */
export const FONT = BODY;

/** Convenience: the sentinel characters, so callers can write UI.G.heart inline. */
export const G = Object.freeze({
  heart: '♥', diamond: '♦', star: '★', check: '✓', cross: '✗',
  dot: '●', ring: '○', up: '↑', down: '↓', left: '←', right: '→',
  sword: '⚔', shield: '⛨', flame: '☲', skull: '☠', times: '×',
  ellipsis: '…', degree: '°', chevUp: '▲', chevDown: '▼',
  chevLeft: '◀', chevRight: '▶', scales: '⚖', holy: '✡', dash: '—',
  sparkle: '✦', minus: '−', section: '§', fleuron: '❦', pilcrow: '¶',
});

/**
 * Size tokens -> face and scale. `fine` sizes draw at half a logical pixel
 * and only exist on a fine layer; on a 1x context they become `fallback`.
 * Line gaps are in glyph px of the face.
 */
const SIZE_DEFS = {
  sm: { face: 'body', scale: 1 },
  md: { face: 'body', scale: 1, bold: true },
  lg: { face: 'body', scale: 2 },
  lgb: { face: 'body', scale: 2, bold: true },
  xl: { face: 'body', scale: 3 },
  xxl: { face: 'body', scale: 4 },
  // Half-size body text gets one extra fine row between lines (5 logical px
  // per line, a whole number, so fine paragraphs stack on the logical grid).
  fine: { face: 'body', scale: 1, fine: true, lineGap: 3, fallback: 'sm' },
  fineb: { face: 'body', scale: 1, fine: true, bold: true, lineGap: 3, fallback: 'md' },
  xs: { face: 'compact', scale: 1, fine: true, fallback: 'sm' },
  title: { face: 'display', scale: 1 },
  titleLg: { face: 'display', scale: 2 },
};
const SIZES = Object.freeze(Object.keys(SIZE_DEFS));

// The resolution of the last context the kit drew to. measure() / wrap() /
// fit() are called without a ctx, before the draw they are measuring for,
// and the whole interface lives on one kind of layer — so the last draw is
// the right answer. Pass a ctx (or `res`) to be exact.
let curRes = 1;
function ctxRes(ctx) {
  if (!ctx) return curRes;
  curRes = resOf(ctx);
  return curRes;
}

/** True when `ctx` (or, with none, the last context drawn to) is a fine layer. */
function fineReady(ctx) { return (ctx ? resOf(ctx) : curRes) >= 2; }

const metricsCache = new Map();

/**
 * Resolve a size token to pixel metrics, in LOGICAL px.
 *   px     logical px per glyph pixel (0.5 on the fine grid)
 *   adv    advance of a monospaced glyph; proportional faces sum glyph widths
 *   lineH  baseline-to-baseline distance    capH  capital height
 * A raw number is an explicit integer scale of the body face.
 */
function metrics(size, letterSpacing, res = curRes) {
  let key; let def;
  if (typeof size === 'number' && isFinite(size)) {
    key = `n${Math.max(1, size | 0)}`;
    def = { face: 'body', scale: Math.max(1, size | 0) };
  } else {
    key = SIZE_DEFS[size] ? size : 'sm';
    def = SIZE_DEFS[key];
    if (def.fine && res < 2) { key = def.fallback; def = SIZE_DEFS[key]; }
  }
  const ck = `${key}|${letterSpacing == null ? '' : letterSpacing}`;
  let m = metricsCache.get(ck);
  if (m) return m;
  const face = FACES[def.face];
  const unit = def.fine ? 0.5 : 1;
  const px = unit * def.scale;
  const sp = letterSpacing == null ? face.spacing : letterSpacing;
  const boldPx = def.bold ? unit : 0;
  const lineGap = def.lineGap != null ? def.lineGap : face.lineGap;
  m = {
    size: key, face, mono: face.mono, fine: !!def.fine,
    scale: def.scale, bold: !!def.bold, sp, boldPx, px,
    adv: (face.cellW + sp) * px + boldPx,
    gap: sp * px,
    lineH: (face.cellH + lineGap) * px,
    lineGap: lineGap * px,
    w: face.cellW * px,
    h: face.cellH * px,
    capH: face.capH * px,
  };
  metricsCache.set(ck, m);
  return m;
}

// Glyph lookup: exact, then the letter under its accents (NFD), then tofu.
const baseCache = new Map();
function glyphOf(face, ch) {
  const g = face.map.get(ch);
  if (g) return g;
  let base = baseCache.get(ch);
  if (base === undefined) {
    const d = typeof ch.normalize === 'function' ? ch.normalize('NFD') : ch;
    base = d.length > 1 && d[0] !== ch ? d[0] : '';
    baseCache.set(ch, base);
  }
  return (base && face.map.get(base)) || null;
}

// Unknown characters draw a hollow box so a missing glyph is visible in dev
// rather than silently swallowing text.
const TOFU = ['....', '.##.', '.#.#', '.#.#', '.##.', '....'];
const TOFU_W = 4;

/** Advance of one glyph in logical px. */
function advOf(g, m) {
  return m.mono ? m.adv : ((g ? g.w : TOFU_W) + m.sp) * m.px + m.boldPx;
}

/** Width in logical px of a SINGLE line (no '\n' handling). */
function lineWidth(line, m) {
  const n = line.length;
  if (n <= 0) return 0;
  if (m.mono) return n * m.adv - m.gap;
  let w = 0;
  for (const ch of line) w += advOf(glyphOf(m.face, ch), m);
  return w - m.gap;
}

// ---------------------------------------------------------------------------
// 2. GLYPH ATLASES — one baked canvas per (face, px-per-glyph-px, colour, style)
// ---------------------------------------------------------------------------

const atlasCache = boundedCache(64);
const faceSlots = new Map();   // face id -> { keys, slot: Map(glyph -> index) }

function slotsFor(face) {
  let s = faceSlots.get(face.id);
  if (!s) {
    const glyphs = [...face.map.values()];
    s = { glyphs, slot: new Map(glyphs.map((g, i) => [g, i])) };
    faceSlots.set(face.id, s);
  }
  return s;
}

/** Gilt ramp for a base colour: [lo, base, mid, hi] from the palette's hue-shifted ramp. */
function giltRamp(color) {
  const r = ramp(typeof color === 'string' && color[0] === '#' ? color : GILT.base, 5, { spread: 0.5 });
  return { lo: r[1], base: r[2], mid: r[3], hi: r[4] };
}

/**
 * Bake an atlas. `k` is atlas px per glyph px. `style` null = flat colour;
 * 'gilt' = a lit bevel (light from the upper left, like everything else):
 * exposed top edges take the highlight, exposed bottom and right edges the
 * shade. At k >= 2 the bevel is one atlas px wide, so on a fine layer a
 * title's gold catches the light along a hairline instead of a whole pixel.
 */
function buildAtlas(face, k, color, style) {
  const { glyphs } = slotsFor(face);
  const cols = 16;
  const n = glyphs.length + 1;               // + tofu
  const cw = face.cellW * k;
  const ch = (HEAD + face.cellH) * k;
  const cv = makeCanvas(cols * cw, Math.ceil(n / cols) * ch);
  const c = cv.getContext('2d');
  c.imageSmoothingEnabled = false;
  const gr = style === 'gilt' ? giltRamp(color) : null;
  const tofuRows = [];
  for (let i = 0; i < HEAD + face.cellH; i++) tofuRows.push(TOFU[i - HEAD] || '....');
  for (let i = 0; i < n; i++) {
    const rows = i < glyphs.length ? glyphs[i].rows : tofuRows;
    const gw = i < glyphs.length ? glyphs[i].w : TOFU_W;
    const ox = (i % cols) * cw;
    const oy = ((i / cols) | 0) * ch;
    const on = (r, q) => r >= 0 && r < rows.length && q >= 0 && q < gw && rows[r].charCodeAt(q) === 35;
    for (let ry = 0; ry < rows.length; ry++) {
      if (!gr) {
        // Flat: collapse horizontal runs of lit pixels into one fillRect.
        c.fillStyle = color;
        let run = -1;
        for (let rx = 0; rx <= gw; rx++) {
          const lit = rx < gw && on(ry, rx);
          if (lit && run < 0) run = rx;
          else if (!lit && run >= 0) { c.fillRect(ox + run * k, oy + ry * k, (rx - run) * k, k); run = -1; }
        }
        continue;
      }
      for (let rx = 0; rx < gw; rx++) {
        if (!on(ry, rx)) continue;
        const X = ox + rx * k, Y = oy + ry * k;
        const up = !on(ry - 1, rx), dn = !on(ry + 1, rx), lf = !on(ry, rx - 1), rt = !on(ry, rx + 1);
        if (k === 1) {
          c.fillStyle = up ? gr.hi : dn ? gr.lo : gr.base;
          c.fillRect(X, Y, 1, 1);
          continue;
        }
        c.fillStyle = gr.base; c.fillRect(X, Y, k, k);
        if (lf) { c.fillStyle = gr.mid; c.fillRect(X, Y, 1, k); }
        if (rt) { c.fillStyle = gr.lo; c.fillRect(X + k - 1, Y, 1, k); }
        if (up) { c.fillStyle = gr.hi; c.fillRect(X, Y, k, 1); }
        if (dn) { c.fillStyle = gr.lo; c.fillRect(X, Y + k - 1, k, 1); }
      }
    }
  }
  return { cv, cw, ch, cols, tofu: n - 1 };
}

function atlasFor(face, k, color, style) {
  const key = `${face.id}|${k}|${color}|${style || ''}`;
  let a = atlasCache.get(key);
  if (!a) a = atlasCache.set(key, buildAtlas(face, k, color, style));
  return a;
}

/** Drop every cached atlas/icon/meter memory (call after a palette change). */
export function clearUICache() { atlasCache.clear(); iconCache.clear(); barMemory.clear(); }

/**
 * Blit one line of glyphs. `res` is the grid we draw on; `style` 'gilt' bakes
 * a bevelled atlas (at fine resolution when res is 2). Returns the advance.
 */
function drawRun(ctx, str, x, y, m, color, alpha, res = 1, style = null, grid = 0) {
  const apl = grid || (m.fine || (style && res >= 2) ? 2 : 1);   // atlas px per logical px
  const k = m.px * apl;
  const a = atlasFor(m.face, k, color, style);
  const { slot } = slotsFor(m.face);
  const prevAlpha = ctx.globalAlpha;
  const prevSmooth = ctx.imageSmoothingEnabled;
  if (alpha != null && alpha < 1) ctx.globalAlpha = prevAlpha * alpha;
  ctx.imageSmoothingEnabled = false;
  const x0 = apl === 2 ? snap(x, 2) : R(x);
  let px = x0;
  const py = (apl === 2 ? snap(y, 2) : R(y)) - HEAD * m.px;
  const dh = a.ch / apl;
  for (const ch of str) {
    const g = glyphOf(m.face, ch);
    if (ch !== ' ') {
      const i = g ? slot.get(g) : a.tofu;
      const sx = (i % a.cols) * a.cw;
      const sy = ((i / a.cols) | 0) * a.ch;
      const sw = (g ? g.w : TOFU_W) * k;
      ctx.drawImage(a.cv, sx, sy, sw, a.ch, px, py, sw / apl, dh);
      if (m.bold) ctx.drawImage(a.cv, sx, sy, sw, a.ch, px + m.boldPx, py, sw / apl, dh);
    }
    px += advOf(g, m);
  }
  ctx.globalAlpha = prevAlpha;
  ctx.imageSmoothingEnabled = prevSmooth;
  return px - x0 - m.gap;
}

/**
 * Low-level public glyph blitter (spec-mandated signature): the body face at
 * an integer scale, 1px letter spacing (scaled), '\n' supported.
 */
export function drawGlyphs(ctx, str, x, y, scale = 1, color = '#ffffff') {
  const m = metrics(typeof scale === 'number' ? scale : 1, 1);
  const s = String(str == null ? '' : str);
  if (s.indexOf('\n') < 0) return drawRun(ctx, s, x, y, m, color, 1);
  let ly = y;
  let widest = 0;
  for (const line of s.split('\n')) {
    widest = Math.max(widest, drawRun(ctx, line, x, ly, m, color, 1));
    ly += m.lineH;
  }
  return widest;
}

/** Measure a (possibly multi-line) string. `res` pins the grid; default: the last drawn. */
export function measureGlyphs(str, size = 'sm', letterSpacing, res) {
  const m = metrics(size, letterSpacing, res == null ? curRes : res);
  const s = String(str == null ? '' : str);
  if (s.indexOf('\n') < 0) return lineWidth(s, m);
  let widest = 0;
  for (const line of s.split('\n')) widest = Math.max(widest, lineWidth(line, m));
  return widest;
}

/** Greedy word wrap to `w` px. Long single words are hard-broken. */
export function wrapLines(str, w, size = 'sm', letterSpacing, res) {
  const m = metrics(size, letterSpacing, res == null ? curRes : res);
  const out = [];
  const maxW = Math.max(m.adv, w);
  for (const para of String(str == null ? '' : str).split('\n')) {
    if (!para) { out.push(''); continue; }
    let line = '';
    for (const word of para.split(/\s+/)) {
      if (!word) continue;
      const test = line ? `${line} ${word}` : word;
      if (lineWidth(test, m) <= maxW) { line = test; continue; }
      if (line) { out.push(line); line = ''; }
      // Word alone is too wide: chop it into pieces that fit.
      let chunk = word;
      while (lineWidth(chunk, m) > maxW && chunk.length > 1) {
        let cut = chunk.length;
        while (cut > 1 && lineWidth(chunk.slice(0, cut), m) > maxW) cut--;
        out.push(chunk.slice(0, cut));
        chunk = chunk.slice(cut);
      }
      line = chunk;
    }
    out.push(line);
  }
  return out;
}

/**
 * Truncate a string with an ellipsis so it fits `w` px.
 *
 * The old loop stopped at `s.length > 1`, so it ALWAYS emitted at least two
 * glyphs — 11px at sm, 13px at md — no matter how narrow the slot was. Every
 * caller with a `Math.max(8, …)` width floor therefore overflowed its column
 * by 3px without any visible sign. A slot too narrow for one glyph plus the
 * ellipsis now gets the ellipsis alone, and one too narrow even for that gets
 * nothing: the column ALWAYS wins, and a starved column reads as starved.
 */
export function fitText(str, w, size = 'sm', res) {
  let s = String(str == null ? '' : str);
  if (measureGlyphs(s, size, undefined, res) <= w) return s;
  const ell = '…';
  if (measureGlyphs(ell, size, undefined, res) > w) return '';
  while (s.length > 1 && measureGlyphs(s + ell, size, undefined, res) > w) s = s.slice(0, -1);
  return measureGlyphs(s + ell, size, undefined, res) > w ? ell : s + ell;
}

/**
 * UI.splitRow — divide a row between a left label and a right value.
 *
 * This is the arithmetic that four separate `kv()` copies each got wrong in a
 * different way: measure both halves, hand each a percentage, and let the two
 * percentages add up past 100 so a long value prints straight through its own
 * label (or, right-aligned with no `maxWidth`, straight out of the panel).
 *
 * The contract here: label + value + gap NEVER exceed `w`. When both fit, both
 * get their natural width. When they do not, the value is capped at
 * `valueMax` (default two thirds) and the label keeps the rest, but the label
 * is never squeezed below `labelMin` — a label cut to "Al…" tells the player
 * nothing, so the value is the half that yields.
 *
 * Returns { labelW, valueW, gap, fits }. Feed labelW/valueW to `maxWidth`.
 */
function splitRow(w, label, value, opts = {}) {
  const size = opts.size || 'sm';
  const valueSize = opts.valueSize || size;
  const gap = opts.gap == null ? 4 : opts.gap;
  const total = Math.max(0, Math.round(w));
  const lNeed = Math.ceil(measureGlyphs(label == null ? '' : label, size));
  const vNeed = Math.ceil(measureGlyphs(value == null ? '' : value, valueSize));
  if (vNeed <= 0) return { labelW: total, valueW: 0, gap: 0, fits: lNeed <= total };
  if (lNeed <= 0) return { labelW: 0, valueW: Math.min(vNeed, total), gap: 0, fits: vNeed <= total };
  const avail = Math.max(0, total - gap);
  if (lNeed + vNeed <= avail) return { labelW: lNeed, valueW: vNeed, gap, fits: true };
  const valueMax = Math.round(avail * (opts.valueMax == null ? 0.66 : opts.valueMax));
  const labelMax = Math.round(avail * (opts.labelMax == null ? 0.62 : opts.labelMax));
  const labelFloor = Math.round(avail * (opts.labelFloor == null ? 0.4 : opts.labelFloor));
  let labelW;
  let valueW;
  if (lNeed <= labelMax) {
    // The label fits inside its share: it gets exactly what it needs, and the
    // value takes the rest. This is what saves "Alignment" and "Location".
    labelW = lNeed;
    valueW = avail - labelW;
  } else {
    // The label is going to be cut whatever we do, so stop starving the value
    // for it: the value takes what it needs up to its cap, and the label keeps
    // the remainder — never less than `labelFloor`, so it cannot collapse to
    // two glyphs and a full stop.
    valueW = Math.min(vNeed, valueMax);
    labelW = avail - valueW;
    if (labelW < labelFloor) { labelW = Math.min(labelFloor, avail); valueW = Math.max(0, avail - labelW); }
  }
  return { labelW: Math.max(0, labelW), valueW: Math.max(0, valueW), gap, fits: false };
}

/**
 * UI.kvRow — "Speed        30 ft." drawn correctly: a dim label hard against
 * the left edge, a bright value hard against the right, and a guarantee that
 * neither ever crosses the other or leaves [x, x+w].
 *
 * opts: { size, valueSize, color, labelColor, gap, valueMax, labelMax, align }
 * Returns the split it used.
 */
function kvRow(ctx, x, y, w, label, value, opts = {}) {
  ctxRes(ctx);
  const size = opts.size || 'sm';
  const valueSize = opts.valueSize || size;
  const v = value == null ? '' : String(value);
  const k = label == null ? '' : String(label);
  const s = splitRow(w, k, v, { size, valueSize, gap: opts.gap, valueMax: opts.valueMax, labelMax: opts.labelMax, labelMin: opts.labelMin });
  if (k && s.labelW > 0) {
    text(ctx, R(x), R(y), k, {
      size, color: opts.labelColor || COLORS.inkDim, shadow: opts.shadow == null ? true : opts.shadow,
      maxWidth: s.labelW,
    });
  }
  if (v && s.valueW > 0) {
    text(ctx, R(x + w), R(y), v, {
      size: valueSize, color: opts.color || COLORS.ink, align: 'right',
      shadow: opts.shadow == null ? true : opts.shadow, maxWidth: s.valueW,
    });
  }
  return s;
}

// ---------------------------------------------------------------------------
// 3. PALETTE
// ---------------------------------------------------------------------------

const COLORS = {
  // ink
  ink: INK.text,
  inkDim: INK.dim,
  dim: INK.dim,            // legacy alias — several modules already read `dim`
  inkBright: '#fffaf0',
  white: '#f6efe0',
  black: '#0a0708',

  // metals & accents
  gold: INK.gold,
  goldDim: '#a37a26',
  goldBright: '#f7dc92',
  bronze: '#8a6a28',
  silver: '#b9c1cf',

  // manuscript pigments: rubric red for headings, lapis for initials,
  // verdigris for vines — the illuminator's three colours besides gold
  rubric: RUBRIC.hi,
  lapis: LAPIS.hi,
  verdigris: VERDIGRIS.hi,

  // hues
  red: '#d4553f',
  green: '#6fc36a',
  blue: '#6aa8e8',
  purple: '#b07ae0',
  cyan: '#63d6d0',
  orange: '#e8863a',
  yellow: '#f0d264',
  pink: '#e08ab0',
  brown: '#8a5a30',

  // surfaces
  bg: '#0b0d16',
  bgDeep: '#05060c',
  panel: '#1e1712',
  panelLite: '#2a2019',
  border: '#5c4a2a',
  borderLite: '#8a6a34',
  shadow: 'rgba(0,0,0,0.45)',

  // gameplay meters
  hp: INK.hp,
  hpDark: '#6d1f16',
  hpHeal: '#5fc86a',
  mp: INK.mp,
  mpDark: '#223d75',
  xp: INK.xp,
  xpDark: '#7a5c22',
  temp: '#7fd0e8',

  // semantics
  good: '#6fc36a',
  bad: '#d4553f',
  warn: '#e8b23a',
  info: '#6aa8e8',
  party: '#6ac0f0',
  foe: '#e0604a',
  neutral: '#c0b49a',
  disabled: '#5a5548',
};

/** Damage-type colours — used by floaters, spell VFX, resistance chips, tooltips. */
const DAMAGE_COLORS = {
  slashing: '#d8d2c2',
  piercing: '#c8cddb',
  bludgeoning: '#b09a7a',
  fire: '#f07a2a',
  cold: '#8fd8ee',
  lightning: '#ffe066',
  thunder: '#b8a0e8',
  acid: '#8ed24a',
  poison: '#6fbf4a',
  necrotic: '#7a5f9e',
  radiant: '#ffe9a8',
  psychic: '#e070c0',
  force: '#c3a2ff',
  healing: '#5fc86a',
  none: '#c0b49a',
};
COLORS.DAMAGE_COLORS = DAMAGE_COLORS;

/** Rarity colours, matching the item tiers in data/items.js. */
const RARITY_COLORS = {
  common: '#cfc7b4',
  uncommon: '#6fc36a',
  rare: '#6aa8e8',
  'very-rare': '#b07ae0',
  legendary: '#e8a33a',
  artifact: '#e0604a',
};
COLORS.RARITY_COLORS = RARITY_COLORS;

// ---------------------------------------------------------------------------
// 4. CLIP STACK
// ---------------------------------------------------------------------------

const clipStack = [];

function pushClip(ctx, x, y, w, h) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(R(x), R(y), Math.max(0, R(w)), Math.max(0, R(h)));
  ctx.clip();
  clipStack.push(ctx);
  return { x: R(x), y: R(y), w: R(w), h: R(h) };
}

function popClip(ctx) {
  const c = clipStack.pop() || ctx;
  if (c) c.restore();
}

/** How many clips are outstanding. Zero at the end of a well-formed frame. */
function clipDepth() { return clipStack.length; }

/**
 * Forget every outstanding clip without restoring anything.
 *
 * `clipStack` is a module global, so a draw call that throws between pushClip
 * and popClip leaves an entry behind for ever, and every later popClip then
 * restores one level too far — the leak compounds frame after frame until the
 * whole screen is stuck inside a stale clip rectangle. engine.js drains the
 * canvas state stack at the top of each frame; this drops the bookkeeping that
 * went with it, so the two stay in step. Returns how many were abandoned.
 */
function resetClips() {
  const n = clipStack.length;
  clipStack.length = 0;
  return n;
}

// ---------------------------------------------------------------------------
// 5. TEXT API
// ---------------------------------------------------------------------------

/**
 * UI.text — the workhorse.
 * opts: { color, size, align:'left'|'center'|'right', shadow, outline, alpha,
 *         maxWidth, wrap, letterSpacing, lineHeight, valign:'top'|'middle'|'baseline',
 *         gilt (bevelled gold, or bevel `color`), keyline (hairline outline colour) }
 * Returns { w, h, lines }.
 */
function text(ctx, x, y, str, opts = {}) {
  const s = String(str == null ? '' : str);
  if (!s) return { w: 0, h: 0, lines: 0 };
  const res = ctxRes(ctx);
  const color = opts.color || (opts.gilt ? GILT.base : COLORS.ink);
  const style = opts.gilt ? 'gilt' : null;
  const m = metrics(opts.size, opts.letterSpacing, res);
  const lineH = opts.lineHeight != null ? opts.lineHeight : m.lineH;

  let lines;
  if (opts.wrap && opts.maxWidth) lines = wrapLines(s, opts.maxWidth, opts.size, opts.letterSpacing, res);
  else lines = s.indexOf('\n') >= 0 ? s.split('\n') : [s];

  // Non-wrapping overflow is clipped rather than spilling over neighbouring widgets.
  let clipped = false;
  if (!opts.wrap && opts.maxWidth) {
    let widest = 0;
    for (const l of lines) widest = Math.max(widest, lineWidth(l, m));
    if (widest > opts.maxWidth) {
      if (opts.ellipsis !== false && lines.length === 1) {
        lines = [fitText(lines[0], opts.maxWidth, opts.size, res)];
      } else {
        pushClip(ctx, x - (opts.align === 'right' ? opts.maxWidth : opts.align === 'center' ? opts.maxWidth / 2 : 0),
          y - 2, opts.maxWidth, lines.length * lineH + 4);
        clipped = true;
      }
    }
  }

  const shadowCol = opts.shadow === true ? 'rgba(0,0,0,0.72)'
    : (typeof opts.shadow === 'string' ? opts.shadow : null);
  const outlineCol = opts.outline === true ? '#0a0708'
    : (typeof opts.outline === 'string' ? opts.outline : null);
  const keyCol = opts.keyline === true ? '#0a0708' : (typeof opts.keyline === 'string' ? opts.keyline : null);

  const grid = m.fine || (style && res >= 2) ? 2 : 1;
  let ly = snap(y, grid);
  if (opts.valign === 'middle') ly = snap(y - (lines.length * lineH - m.lineGap) / 2, grid);
  else if (opts.valign === 'baseline') ly = snap(y - m.capH, grid);

  let widest = 0;
  for (const line of lines) {
    const lw = lineWidth(line, m);
    widest = Math.max(widest, lw);
    let lx = x;
    if (opts.align === 'center') lx = x - lw / 2;
    else if (opts.align === 'right') lx = x - lw;
    lx = snap(lx, grid);

    if (outlineCol) {
      // 4-way outline keeps small text readable on busy overworld tiles.
      const o = m.px;
      drawRun(ctx, line, lx - o, ly, m, outlineCol, opts.alpha, res);
      drawRun(ctx, line, lx + o, ly, m, outlineCol, opts.alpha, res);
      drawRun(ctx, line, lx, ly - o, m, outlineCol, opts.alpha, res);
      drawRun(ctx, line, lx, ly + o, m, outlineCol, opts.alpha, res);
      if (opts.outlineFull) {
        drawRun(ctx, line, lx - o, ly - o, m, outlineCol, opts.alpha, res);
        drawRun(ctx, line, lx + o, ly - o, m, outlineCol, opts.alpha, res);
        drawRun(ctx, line, lx - o, ly + o, m, outlineCol, opts.alpha, res);
        drawRun(ctx, line, lx + o, ly + o, m, outlineCol, opts.alpha, res);
      }
    } else if (shadowCol !== null || opts.shadow === undefined) {
      // Default: a single 1px drop shadow. That one pixel is what makes the
      // whole UI look like a Game Boy Advance game instead of a web page.
      // The display face's letters are big enough that a scaled shadow reads
      // as a second letter; it keeps a single-pixel one at any size.
      const so = m.face.id === 'display' ? Math.min(1, m.px) : m.px;
      drawRun(ctx, line, lx + so, ly + so, m, shadowCol || 'rgba(0,0,0,0.72)', opts.alpha, res);
    }
    if (keyCol) {
      // A hairline keyline: one device pixel all round on a fine layer.
      const o = res >= 2 ? 0.5 : 1;
      for (const [dx, dy] of [[-o, 0], [o, 0], [0, -o], [0, o]]) drawRun(ctx, line, lx + dx, ly + dy, m, keyCol, opts.alpha, res, null, res >= 2 ? 2 : 1);
    }

    drawRun(ctx, line, lx, ly, m, color, opts.alpha, res, style);
    ly += lineH;
  }

  if (clipped) popClip(ctx);
  return { w: widest, h: lines.length * lineH, lines: lines.length };
}

/** Shorthand: always-shadowed text. */
function shadowText(ctx, x, y, str, opts = {}) {
  return text(ctx, x, y, str, { shadow: true, ...opts });
}

/** Wrap `str` into `w` px and draw it. Returns { lines, height }. */
function textWrapped(ctx, x, y, w, str, opts = {}) {
  const res = ctxRes(ctx);
  const lines = wrapLines(str, w, opts.size, opts.letterSpacing, res);
  const m = metrics(opts.size, opts.letterSpacing, res);
  const lineH = opts.lineHeight != null ? opts.lineHeight : m.lineH;
  const max = opts.maxLines || 0;
  const shown = max > 0 && lines.length > max ? lines.slice(0, max) : lines;
  if (max > 0 && lines.length > max && shown.length) {
    shown[shown.length - 1] = fitText(`${shown[shown.length - 1]}…`, w, opts.size, res);
  }
  let ly = y;
  for (const line of shown) {
    let lx = x;
    if (opts.align === 'center') lx = x + (w - lineWidth(line, m)) / 2;
    else if (opts.align === 'right') lx = x + w - lineWidth(line, m);
    text(ctx, lx, ly, line, { ...opts, wrap: false, maxWidth: 0, align: 'left' });
    ly += lineH;
  }
  return { lines: shown.length, height: shown.length * lineH, total: lines.length, lineH };
}

/**
 * UI.heading — a rubricated heading in the display face: the first capital
 * in gilt (or `capColor`), the rest in `color`. Returns { w, h }.
 * opts: { size ('title'|'titleLg'), color, capColor, capGilt, align, shadow, rule }
 * `rule: w` draws a fleuron rule under it, `w` px wide from x.
 */
function heading(ctx, x, y, str, opts = {}) {
  const s = String(str == null ? '' : str);
  if (!s) return { w: 0, h: 0 };
  const size = opts.size || 'title';
  const first = [...s][0];
  const rest = s.slice(first.length);
  const fw = measureGlyphs(first, size);
  const total = measureGlyphs(s, size);
  const m = metrics(size);
  let lx = x;
  if (opts.align === 'center') lx = x - total / 2;
  else if (opts.align === 'right') lx = x - total;
  const shadow = opts.shadow == null ? 'rgba(0,0,0,0.8)' : opts.shadow;
  text(ctx, lx, y, first, { size, gilt: opts.capGilt !== false, color: opts.capColor || GILT.base, shadow, keyline: opts.keyline });
  if (rest) text(ctx, lx + fw + m.gap, y, rest, { size, color: opts.color || COLORS.goldBright, shadow, keyline: opts.keyline });
  if (opts.rule) divider(ctx, x, y + m.capH + 3, opts.rule, { ornament: true });
  return { w: total, h: m.capH };
}

/**
 * UI.initial — a decorated drop cap: a Lombardic capital, gilt, on a
 * coloured ground with white penwork and a gilt frame, and a vine running
 * out of its corner. The opening of a dialogue, a book, a screen title.
 * opts: { size: 'lg' (24px box, 16px capital) | 'sm' (14px box, 8px capital),
 *         ground: 'lapis' | 'rubric' | 'verdigris' | hex, vine: true, gilt: true, t }
 * Returns { x, y, w, h } of the box so text can flow beside it.
 */
function initial(ctx, x, y, letter, opts = {}) {
  const ch = [...String(letter == null ? '' : letter).trim()][0];
  x = R(x); y = R(y);
  if (!ch) return { x, y, w: 0, h: 0 };
  const res = ctxRes(ctx);
  const big = opts.size !== 'sm';
  const size = big ? 'titleLg' : 'title';
  const m = metrics(size);
  const L = ch.toUpperCase();
  const lw = measureGlyphs(L, size);
  const side = big ? 24 : 14;
  const w = Math.max(side, R(lw) + (big ? 6 : 4));
  const h = side;
  // Ground: alternate lapis and rubric by letter, the way a scribe did, unless told.
  const grounds = { lapis: LAPIS, rubric: RUBRIC, verdigris: VERDIGRIS };
  let gnd = typeof opts.ground === 'string' && grounds[opts.ground] ? grounds[opts.ground] : null;
  if (!gnd && typeof opts.ground === 'string' && opts.ground[0] === '#') {
    const r = ramp(opts.ground, 5); gnd = { lo: r[1], base: r[2], hi: r[3] };
  }
  if (!gnd) gnd = (hashStr(L) & 1) ? RUBRIC : LAPIS;

  // Shadow, keyline, gilt frame.
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(x + 1, y + 2, w, h);
  ctx.fillStyle = GILT.key; ctx.fillRect(x, y, w, h);
  vgrad(ctx, x + 1, y + 1, w - 2, h - 2, GILT.hi, GILT.lo);
  vgrad(ctx, x + 2, y + 2, w - 4, h - 4, gnd.base, gnd.lo);
  if (res >= 2) {
    hairFrame(ctx, x + 1, y + 1, w - 2, h - 2, GILT.spec, GILT.mid);
    hairFrame(ctx, x + 2, y + 2, w - 4, h - 4, 'rgba(0,0,0,0.55)', 'rgba(255,255,255,0.12)');
  }
  // White penwork: a lattice of dots, the filigree a pen-flourisher adds.
  const dot = res >= 2 ? 0.5 : 1;
  const step = res >= 2 ? 2 : 3;
  ctx.fillStyle = 'rgba(240,232,214,0.30)';
  for (let yy = y + 3; yy < y + h - 3; yy += step) {
    for (let xx = x + 3 + (((yy - y) / step) & 1 ? step / 2 : 0); xx < x + w - 3; xx += step) ctx.fillRect(xx, yy, dot, dot);
  }
  // The capital, centred on its cap height (not its cell: capitals have no descenders here).
  const lx = x + (w - lw) / 2;
  const ly = y + (h - m.capH) / 2;
  text(ctx, lx, ly, L, { size, gilt: opts.gilt !== false, color: opts.color || GILT.base, shadow: 'rgba(10,6,4,0.85)' });
  // a tendril hangs from the foot of the box into the margin below it
  if (opts.vine !== false) vine(ctx, x + 1, y + h - 1, 1, {});
  return { x, y, w, h };
}

// ---------------------------------------------------------------------------
// 6. PANELS — themed 9-slice windows
// ---------------------------------------------------------------------------
//
// A style is a material. `rings` are the 1x border, one colour per logical px,
// outermost first; their COUNT is the border width, and it is what the
// interior rect (ix/iy/iw/ih) is computed from, so it never changes between
// themes: every caller's content sits exactly where it always has.
// `fineRings` is the same border on the fine grid: two entries per logical
// ring, each a colour or a [lit, shade] pair (top/left, bottom/right).
// `corners`: 'boss' | 'rivet' | null, drawn on fine layers when the panel is
// large enough and the caller has not said `studs: false`.

const GILT_RULE = [GILT.hi, GILT.lo];

const MATERIALS = {
  // --- folio: dark calf vellum in a tooled binding, gilt and rubric rules
  // A tooled calf binding: two gilt fillets on brown leather round a page
  // of dark vellum, gilt corner-pieces with a garnet in each.
  vellum: {
    vignette: 0.32,
    rings: ['#0b0705', '#b8893a', '#3a2614'],
    fineRings: ['#0b0705', [GILT.hi, GILT.mid], '#452a16', [GILT.base, GILT.lo], '#24160c', ['#0a0604', '#3a2818']],
    fill: ['#2b2019', '#16100c'], grain: 'vellum',
    hi: 'rgba(255,231,178,0.10)', lo: 'rgba(0,0,0,0.30)', innerShade: 0.35,
    studs: '#f0cf7a', studDark: '#5a4318', corners: 'gilt', shadow: 0.38,
  },
  night: {
    vignette: 0.25,
    rings: ['#05060a', '#4a3f2a'],
    fineRings: ['#05060a', '#1a1822', [GILT.mid, '#5a4418'], '#0a0b10'],
    fill: ['#171a24', '#0c0e15'], grain: 'vellum', grainAlpha: 0.6,
    hi: 'rgba(150,175,220,0.08)', lo: 'rgba(0,0,0,0.35)', innerShade: 0.3,
    studs: null, shadow: 0.42,
  },
  hair: {
    rings: ['#151824'],
    fineRings: ['#0a0b10', ['#3a3444', '#211e28']],
    fill: ['#221f28', '#17151c'], grain: 'vellum', grainAlpha: 0.5,
    hi: 'rgba(255,255,255,0.05)', lo: null, studs: null, shadow: 0.22,
  },
  well: {
    rings: ['#0a0c12'],
    fineRings: ['#07080c', ['rgba(0,0,0,0.75)', 'rgba(255,236,200,0.13)']],
    fill: ['#100d0c', '#1b1613'], inset: true, studs: null, shadow: 0,
  },
  gilt: {
    rings: ['#120c05', '#8a6a28'],
    fineRings: ['#120c05', '#5a4012', ['#fff2c4', '#8a6420'], ['#ecc970', '#b8892c']],
    fill: ['#f4d98d', '#c9992f'],
    hi: 'rgba(255,251,230,0.55)', lo: 'rgba(80,52,8,0.32)', specular: 'rgba(255,250,225,0.35)',
    studs: '#6b5220', studDark: '#2a1c07', shadow: 0.40,
  },
  parchment: {
    vignette: 0.22,
    rings: ['#3a2712', '#8a6a34', '#c8ab6e'],
    fineRings: ['#2a1a0c', '#5a3e1e', ['#a8864a', '#6a4a24'], '#c8ab6e', ['#f0e2bc', '#b89a62'], ['#8a2a1a', '#8a2a1a']],
    fill: ['#ecdcb2', '#d2bd8a'], grain: 'vellum', grainAlpha: 1.4,
    hi: 'rgba(255,255,255,0.35)', lo: 'rgba(90,60,25,0.22)', deckle: ['#f4e6c0', '#6a4a24'],
    studs: '#8a6a34', studDark: '#5a4318', corners: 'boss', shadow: 0.36,
  },
  danger: {
    vignette: 0.3,
    rings: ['#140506', '#c0472f', '#5a1c14'],
    fineRings: ['#140506', '#3a0e0a', '#5a1810', ['#f08a68', '#8a2c1e'], '#1a0806', ['#6a2014', '#3a0e0a']],
    fill: ['#3b1a16', '#20100e'], grain: 'vellum',
    hi: 'rgba(255,160,130,0.14)', lo: 'rgba(0,0,0,0.32)', innerShade: 0.3,
    studs: '#e88a68', studDark: '#8a2c1e', corners: 'gilt', jewel: '#1e1a1a', shadow: 0.44,
  },
  magic: {
    vignette: 0.3,
    rings: ['#080614', '#9a6ae0', '#3d2470'],
    fineRings: ['#080614', '#1e1238', '#2e1c58', ['#d8b8ff', '#6a44b0'], '#0e0820', ['#4a2e84', '#2a1850']],
    fill: ['#251b40', '#130d22'], grain: 'vellum',
    hi: 'rgba(200,170,255,0.18)', lo: 'rgba(0,0,0,0.34)', innerShade: 0.3,
    studs: '#cfaaff', studDark: '#5a3a9a', corners: 'gilt', jewel: '#3a8ac0', glow: 'rgba(150,110,230,0.18)', shadow: 0.44,
  },
  // --- iron: blackened plate with a riveted steel band (combat)
  iron: {
    vignette: 0.3,
    rings: ['#050506', '#6a707c', '#26282e'],
    fineRings: ['#050506', '#1e2026', ['#a8b0bc', '#3a3e46'], '#4a4e58', ['#2a2c32', '#101114'], '#0c0d10'],
    fill: ['#25272d', '#16171b'], grain: 'iron',
    hi: 'rgba(200,215,235,0.09)', lo: 'rgba(0,0,0,0.35)', innerShade: 0.35,
    studs: '#c8d0dc', studDark: '#3a3e46', corners: 'rivet', edgeRivets: 26,
    rivet: { hi: '#e8eef6', mid: '#8a929e', lo: '#2a2e36' }, shadow: 0.42,
  },
  gunmetal: {
    vignette: 0.25,
    rings: ['#050506', '#4a4e58'],
    fineRings: ['#050506', '#15171c', ['#7a828e', '#2a2c32'], '#0c0d10'],
    fill: ['#1a1c22', '#101115'], grain: 'iron', grainAlpha: 0.8,
    hi: 'rgba(200,215,235,0.07)', lo: 'rgba(0,0,0,0.35)', innerShade: 0.3, studs: null, shadow: 0.42,
  },
  steel: {
    rings: ['#0a0b0e', '#5a606c'],
    fineRings: ['#0a0b0e', '#3a3e46', ['#ffffff', '#6a707c'], ['#d8dde6', '#9aa2ae']],
    fill: ['#e2e6ee', '#9aa3b2'], specular: 'rgba(255,255,255,0.45)',
    hi: 'rgba(255,255,255,0.55)', lo: 'rgba(20,24,32,0.30)', studs: '#4a4e58', studDark: '#1a1c20', shadow: 0.40,
  },
  // --- timber: oak boards bound in brass (world toolbars)
  timber: {
    vignette: 0.28,
    rings: ['#120c09', '#8a6a3a', '#33241a'],
    fineRings: ['#120c09', ['#e0c080', '#6a4e28'], '#8a6a3a', ['#b89458', '#4a3418'], ['#2a1c10', '#1a120c'], '#0e0a08'],
    fill: ['#3e2d1e', '#261b12'], grain: 'wood', grainAlpha: 1.7,
    hi: 'rgba(255,220,170,0.09)', lo: 'rgba(0,0,0,0.30)', innerShade: 0.35,
    studs: '#e4c38c', studDark: '#4a3420', corners: 'brass', edgeRivets: 34,
    rivet: { hi: '#fff0c0', mid: '#c8a060', lo: '#5a3e1a' }, shadow: 0.40,
  },
  stain: {
    vignette: 0.25,
    rings: ['#0c0806', '#6a4e2c'],
    fineRings: ['#0c0806', '#2a1c10', ['#b89458', '#4a3418'], '#140e08'],
    fill: ['#241a12', '#15100b'], grain: 'wood', grainAlpha: 0.9,
    hi: 'rgba(255,220,170,0.07)', lo: 'rgba(0,0,0,0.35)', innerShade: 0.3, studs: null, shadow: 0.42,
  },
  deal: {
    rings: ['#1a120c'],
    fineRings: ['#0c0806', ['#5a4028', '#2a1c10']],
    fill: ['#2a1f15', '#1e160e'], grain: 'wood', grainAlpha: 0.8,
    hi: 'rgba(255,220,170,0.06)', lo: null, studs: null, shadow: 0.22,
  },
  groove: {
    rings: ['#0c0806'],
    fineRings: ['#080504', ['rgba(0,0,0,0.75)', 'rgba(255,220,170,0.12)']],
    fill: ['#130d09', '#1e160e'], inset: true, grain: 'wood', grainAlpha: 0.6, studs: null, shadow: 0,
  },
  brass: {
    rings: ['#140c04', '#7a5a28'],
    fineRings: ['#140c04', '#4a3414', ['#fff0c8', '#7a5820'], ['#e8c888', '#b08a48']],
    fill: ['#ecd29a', '#b8904c'], specular: 'rgba(255,250,225,0.30)',
    hi: 'rgba(255,251,230,0.50)', lo: 'rgba(80,52,8,0.30)', studs: '#6b5220', studDark: '#2a1c07', shadow: 0.40,
  },
  // --- sepia: the parchment theme's dark-ink vellum with pale deckled edges
  sepia: {
    vignette: 0.32,
    rings: ['#1a1008', '#d8bf88', '#6a4e2a'],
    fineRings: ['#1a1008', ['#f0dcaa', '#b0925a'], '#d8bf88', '#8a6a3a', '#2a1c10', ['#7a2a1a', '#4a1a10']],
    fill: ['#4a3826', '#2e2218'], grain: 'vellum', grainAlpha: 1.6,
    hi: 'rgba(255,236,196,0.12)', lo: 'rgba(0,0,0,0.30)', innerShade: 0.3,
    studs: '#f0dcaa', studDark: '#6a4e2a', corners: 'boss', jewel: '#2e4a8a', deckle: ['#f0dcaa', '#1a1008'], shadow: 0.38,
  },
  umber: {
    vignette: 0.28,
    rings: ['#120a05', '#a88a58'],
    fineRings: ['#120a05', '#2a1c10', ['#e8d4a0', '#7a5e34'], '#1a1008'],
    fill: ['#33261a', '#1f160e'], grain: 'vellum', grainAlpha: 1.2,
    hi: 'rgba(255,236,196,0.08)', lo: 'rgba(0,0,0,0.35)', innerShade: 0.3, studs: null, shadow: 0.42,
  },
  rag: {
    rings: ['#1a120a'],
    fineRings: ['#0e0906', ['#8a6e46', '#3a2a18']],
    fill: ['#3a2c1e', '#2a2016'], grain: 'vellum', grainAlpha: 1.2,
    hi: 'rgba(255,236,196,0.06)', lo: null, studs: null, shadow: 0.22,
  },
  // --- extras any theme can ask for by name
  leather: {
    vignette: 0.3,
    rings: ['#0c0806', '#5a3a22', '#2a1a10'],
    fineRings: ['#0c0806', '#4a2e1a', '#5a3a22', ['#1a0e08', '#8a603c'], '#3a2416', '#2a1a10'],
    fill: ['#3a2618', '#23160d'], grain: 'vellum', grainAlpha: 1.2,
    hi: 'rgba(255,220,180,0.08)', lo: 'rgba(0,0,0,0.30)', innerShade: 0.3,
    studs: '#a88b58', studDark: '#3a2a18', corners: 'rivet', shadow: 0.40,
  },
  banner: {
    rings: ['#120806', '#c9992f'],
    fineRings: ['#120806', '#6a4a14', GILT_RULE, '#2a0806'],
    fill: ['#9a2a20', '#5a140e'], grain: 'cloth', grainAlpha: 1,
    hi: 'rgba(255,200,170,0.14)', lo: 'rgba(0,0,0,0.30)', innerShade: 0.25,
    studs: null, banner: true, shadow: 0.40,
  },
  seal: {
    rings: ['#1a0404', '#6a1410'],
    fineRings: ['#1a0404', '#4a0c0a', ['#e0584a', '#5a0e0a'], ['#b8322a', '#7a1812']],
    fill: ['#c0392e', '#7a1812'], specular: 'rgba(255,190,170,0.30)',
    hi: 'rgba(255,190,170,0.35)', lo: 'rgba(40,0,0,0.35)', studs: null, seal: true, shadow: 0.45,
  },
};

/**
 * Themes map the five base styles every screen uses onto materials. The
 * extras (parchment, danger, magic, iron, timber, leather, banner, seal,
 * vellum) are always available by name, whatever the theme.
 */
const THEMES = {
  folio: { name: 'Folio', window: 'vellum', dark: 'night', plain: 'hair', inset: 'well', gold: 'gilt' },
  timber: { name: 'Timber', window: 'timber', dark: 'stain', plain: 'deal', inset: 'groove', gold: 'brass' },
  iron: { name: 'Iron', window: 'iron', dark: 'gunmetal', plain: 'hair', inset: 'well', gold: 'steel' },
  parchment: { name: 'Parchment', window: 'sepia', dark: 'umber', plain: 'rag', inset: 'well', gold: 'gilt' },
};
const THEME_IDS = Object.freeze(Object.keys(THEMES));

// The live style table. Base entries are re-pointed by setTheme; the object
// itself is never replaced, so references to UI.PANEL_STYLES stay valid.
const PANEL_STYLES = {};
const FIXED_STYLES = {
  parchment: 'parchment', danger: 'danger', magic: 'magic', iron: 'iron', timber: 'timber',
  leather: 'leather', banner: 'banner', seal: 'seal', vellum: 'vellum', steel: 'steel', brass: 'brass',
};

/**
 * The ink each panel style can actually carry, by role.
 *
 * `PANEL_STYLES.gold` is a genuine LIGHT fill (gilt, brass or steel). Half a
 * dozen call sites drew `goldBright` / `ink` / `dim` on it, which is 1.03:1 to
 * 1.20:1 — literally invisible. This table gives every style a
 * title/body/dim/accent set that is legible on its own fill, and `inkFor()`
 * is the one place to ask. Contrast against the darker fill stop is >= 4.5:1.
 */
const DARK_INK = { title: COLORS.gold, body: COLORS.ink, dim: COLORS.inkDim, accent: COLORS.goldBright };
const LIGHT_INK = { title: '#2a1c07', body: '#2a1c07', dim: '#5a4318', accent: '#7a2010' };
const PANEL_INK = {
  window: DARK_INK, dark: DARK_INK, plain: DARK_INK,
  inset: { title: COLORS.goldDim, body: COLORS.ink, dim: COLORS.inkDim, accent: COLORS.gold },
  gold: LIGHT_INK,
  parchment: { title: '#3a2712', body: '#241708', dim: '#5a4318', accent: '#7a2010' },
  danger: { title: '#ffb9a4', body: '#f0c0b0', dim: '#c08878', accent: '#ffd0a0' },
  magic: { title: '#cfaaff', body: '#dcccff', dim: '#a494c8', accent: '#f0d264' },
  iron: DARK_INK, timber: DARK_INK, leather: DARK_INK, vellum: DARK_INK,
  banner: { title: '#f7dc92', body: '#f6efe0', dim: '#e0b8a8', accent: '#f7dc92' },
  seal: { title: '#fff0d8', body: '#fff0d8', dim: '#f0c0a8', accent: '#f7dc92' },
  steel: { title: '#1a1c22', body: '#1a1c22', dim: '#3a3e46', accent: '#6a1a12' },
  brass: LIGHT_INK,
};

let themeId = 'folio';

function applyTheme(id) {
  const th = THEMES[id] || THEMES.folio;
  themeId = THEMES[id] ? id : 'folio';
  for (const base of ['window', 'dark', 'plain', 'inset', 'gold']) PANEL_STYLES[base] = MATERIALS[th[base]];
  for (const [k, mat] of Object.entries(FIXED_STYLES)) PANEL_STYLES[k] = MATERIALS[mat];
  PANEL_INK.gold = th.gold === 'steel' ? PANEL_INK.steel : LIGHT_INK;
  // Label plates behind divider captions match the window they sit on.
  COLORS.panel = PANEL_STYLES.window.fill[1];
  COLORS.panelLite = PANEL_STYLES.window.fill[0];
}

/**
 * UI.setTheme — re-skin the interface: 'folio' | 'timber' | 'iron' | 'parchment'.
 * Persists to Save.settings.uiTheme unless `persist` is false. Returns the id in force.
 */
function setTheme(id, persist = true) {
  applyTheme(id);
  if (persist) {
    try {
      if (Save.settings.uiTheme !== themeId) Save.setSetting('uiTheme', themeId);
    } catch (e) { /* storage off: the theme still applies for this session */ }
  }
  return themeId;
}

// Boot: the saved theme, and follow every later settings change (the Options
// screen cycles `uiTheme` through Save like any other setting).
try { applyTheme(Save.settings.uiTheme || 'folio'); } catch (e) { applyTheme('folio'); }
bus.on(EV_SETTINGS, (s) => { if (s && s.uiTheme && s.uiTheme !== themeId) applyTheme(s.uiTheme); });

/**
 * UI.inkFor — the legible ink for `style` in `role`
 * ('body' | 'dim' | 'title' | 'accent'). Call sites that hard-code a colour on
 * a panel they did not choose are how light-on-light happens; ask instead.
 */
function inkFor(style, role = 'body') {
  const key = typeof style === 'string' ? style : '';
  const set = PANEL_INK[key] || PANEL_INK.window;
  return set[role] || set.body;
}

/** Draw the fine-grid border: `fineRings` one device px each, outermost first. */
function fineBorder(ctx, x, y, w, h, fr) {
  for (let i = 0; i < fr.length; i++) {
    const inset = i * 0.5;
    if (w - inset * 2 <= 1 || h - inset * 2 <= 1) break;
    const c = fr[i];
    if (Array.isArray(c)) hairFrame(ctx, x, y, w, h, c[0], c[1], inset);
    else hairFrame(ctx, x, y, w, h, c, c, inset);
  }
}

/**
 * Generic border/fill engine. `panel` is a thin wrapper over this, but other
 * widgets (buttons, bars, tooltips) reuse it directly.
 * opts: { style, alpha, shadow, rings, fill, studs:false, color (banner field) }
 */
function nineSlice(ctx, x, y, w, h, opts = {}) {
  x = R(x); y = R(y); w = R(w); h = R(h);
  if (w <= 0 || h <= 0) return { x, y, w, h, ix: x, iy: y, iw: 0, ih: 0 };
  const res = ctxRes(ctx);
  const st = typeof opts.style === 'string'
    ? (PANEL_STYLES[opts.style] || PANEL_STYLES.window)
    : (opts.style || PANEL_STYLES.window);
  if (st.banner && h >= 16 && w >= 8) return bannerPanel(ctx, x, y, w, h, st, opts, res);
  const alpha = opts.alpha == null ? 1 : opts.alpha;
  const prev = ctx.globalAlpha;
  if (alpha < 1) ctx.globalAlpha = prev * alpha;
  const fine = res >= 2 && !opts.rings && st.fineRings;

  // 1. soft drop shadow, offset down-right — cheap "floating window" cue
  const sh = opts.shadow != null ? opts.shadow : st.shadow;
  if (sh) {
    ctx.fillStyle = `rgba(0,0,0,${sh * 0.5})`;
    ctx.fillRect(x + 1, y + 2, w, h);
    ctx.fillStyle = `rgba(0,0,0,${sh})`;
    ctx.fillRect(x + 2, y + 3, w - 2, h - 2);
  }
  // 2. magical bloom behind the frame
  if (st.glow) {
    ctx.fillStyle = st.glow;
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  }

  // 3. the border: whole-pixel rings, or their fine-grid version
  const rings = opts.rings || st.rings || [];
  let inset = 0;
  for (let i = 0; i < rings.length; i++) {
    if (w - inset * 2 <= 2 || h - inset * 2 <= 2) break;
    if (!fine) rectStroke(ctx, x + inset, y + inset, w - inset * 2, h - inset * 2, rings[i], 1);
    inset++;
  }
  if (fine) {
    // Paint the band solid first (so no gap ever shows the scene through),
    // then the hairlines over it.
    ctx.fillStyle = rings[0] || '#000';
    ctx.fillRect(x, y, w, inset); ctx.fillRect(x, y + h - inset, w, inset);
    ctx.fillRect(x, y + inset, inset, h - inset * 2); ctx.fillRect(x + w - inset, y + inset, inset, h - inset * 2);
    fineBorder(ctx, x, y, w, h, st.fineRings.slice(0, inset * 2));
  }

  // 4. interior fill (banners take their field colour from the caller)
  const ix = x + inset, iy = y + inset;
  const iw = Math.max(0, w - inset * 2), ih = Math.max(0, h - inset * 2);
  let fill = opts.fill || st.fill;
  if (st.banner && opts.color && !opts.fill) fill = [shade(opts.color, 0.08), shade(opts.color, -0.35)];
  if (fill && iw > 0 && ih > 0) vgrad(ctx, ix, iy, iw, ih, fill[0], fill[1] || fill[0]);
  // Grain is a device-pixel texture; at 1x each speck is a whole logical
  // pixel and reads as dirt, so it is kept to a whisper there.
  if (st.grain && iw > 4 && ih > 4) grain(ctx, st.grain, ix, iy, iw, ih, (st.grainAlpha == null ? 1 : st.grainAlpha) * (fine ? 1 : 0.45));
  if (st.vignette && iw >= 40 && ih >= 30) {
    // Candlelight: the page is brightest where you read and falls off to its
    // edges. An elliptical gradient, drawn in a scaled space so it fits any
    // aspect ratio of window.
    ctx.save();
    ctx.translate(ix + iw / 2, iy + ih / 2);
    ctx.scale(iw / 2, ih / 2);
    const vg = ctx.createRadialGradient(-0.25, -0.35, 0.1, 0, 0, 1.45);
    vg.addColorStop(0, 'rgba(255,226,170,0.035)');
    vg.addColorStop(0.55, 'rgba(0,0,0,0)');
    vg.addColorStop(1, `rgba(0,0,0,${st.vignette})`);
    ctx.fillStyle = vg;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  }

  // 5. bevel — highlight on the lit edges, shade on the far ones.
  const t = fine ? 0.5 : 1;
  if (iw > 2 && ih > 2) {
    if (st.inset) {
      if (!fine) {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(ix, iy, iw, 1);
        ctx.fillRect(ix, iy, 1, ih);
        ctx.fillStyle = 'rgba(255,240,210,0.10)';
        ctx.fillRect(ix, iy + ih - 1, iw, 1);
        ctx.fillRect(ix + iw - 1, iy, 1, ih);
      } else {
        // A recess: the lip casts a two-step shadow into it.
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(ix, iy, iw, 0.5); ctx.fillRect(ix, iy, 0.5, ih);
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fillRect(ix + 0.5, iy + 0.5, iw - 0.5, 0.5); ctx.fillRect(ix + 0.5, iy + 0.5, 0.5, ih - 0.5);
        ctx.fillStyle = 'rgba(255,240,210,0.07)';
        ctx.fillRect(ix, iy + ih - 0.5, iw, 0.5); ctx.fillRect(ix + iw - 0.5, iy, 0.5, ih);
      }
    } else {
      if (fine && st.innerShade) {
        // The frame stands proud of the page: a soft shadow under its top edge.
        ctx.fillStyle = `rgba(0,0,0,${st.innerShade})`;
        ctx.fillRect(ix, iy, iw, 0.5);
        ctx.fillStyle = `rgba(0,0,0,${st.innerShade * 0.45})`;
        ctx.fillRect(ix, iy + 0.5, iw, 0.5);
        ctx.fillRect(ix, iy + 0.5, 0.5, ih - 0.5);
      } else {
        if (st.hi) {
          ctx.fillStyle = st.hi;
          ctx.fillRect(ix, iy, iw, t);
          ctx.fillRect(ix, iy, t, ih - t);
        }
      }
      if (st.lo) {
        ctx.fillStyle = st.lo;
        ctx.fillRect(ix, iy + ih - t, iw, t);
        ctx.fillRect(ix + iw - t, iy + t, t, ih - t);
      }
      if (fine && st.specular && ih >= 4) {
        // Polished metal and wax catch a band of light across the upper third.
        ctx.fillStyle = st.specular;
        ctx.fillRect(ix + 0.5, iy + 0.5, iw - 1, 0.5);
        ctx.fillRect(ix + 1, iy + Math.max(1, R(ih * 0.28)), iw - 2, 0.5);
      }
    }
  }

  // 6. corners: 2x2 studs on 1x; bosses or rivets on a fine layer
  if (fine && st.deckle && w >= 12 && h >= 12) deckle(ctx, x, y, w, h, st.deckle[0], st.deckle[1]);
  const wantCorners = opts.studs !== false;
  const plates = st.corners === 'gilt' || st.corners === 'brass';
  if (wantCorners && fine && st.corners && w >= (plates ? 30 : 22) && h >= (plates ? 24 : 18)) {
    const o = inset / 2 + 0.25;
    const cs = [[x + o, y + o], [x + w - o, y + o], [x + o, y + h - o], [x + w - o, y + h - o]];
    if (plates) corners(ctx, x, y, w, h, st.corners, { jewel: st.jewel });
    if (st.corners === 'gilt') {
      // a fleuron tooled into the middle of each long run of fillet
      if (w >= 140) { fleuron(ctx, x + w / 2, y + o, {}); fleuron(ctx, x + w / 2, y + h - o, {}); }
      if (h >= 110) { fleuron(ctx, x + o, y + h / 2, {}); fleuron(ctx, x + w - o, y + h / 2, {}); }
    }
    else if (st.corners === 'boss') for (const [cx, cy] of cs) boss(ctx, cx, cy, { jewel: st.jewel });
    else for (const [cx, cy] of cs) rivet(ctx, cx, cy, st.rivet);
    if (st.edgeRivets && w >= st.edgeRivets * 2) {
      const n = Math.floor(w / st.edgeRivets);
      for (let i = 1; i < n; i++) {
        const rx = x + R((w * i) / n);
        rivet(ctx, rx, y + o, st.rivet);
        rivet(ctx, rx, y + h - o, st.rivet);
      }
    }
  } else {
    const studs = !wantCorners ? null : (opts.studs || st.studs);
    if (studs && w >= 12 && h >= 12) {
      const dk = opts.studDark || st.studDark || 'rgba(0,0,0,0.5)';
      const cs = [[x + 2, y + 2], [x + w - 4, y + 2], [x + 2, y + h - 4], [x + w - 4, y + h - 4]];
      for (const [sx, sy] of cs) {
        ctx.fillStyle = dk; ctx.fillRect(sx, sy, 2, 2);
        ctx.fillStyle = studs; ctx.fillRect(sx, sy, 1, 1);
      }
    }
  }

  ctx.globalAlpha = prev;
  return { x, y, w, h, ix, iy, iw, ih, pad: inset, ink: inkFor(typeof opts.style === 'string' ? opts.style : 'window') };
}

function panel(ctx, x, y, w, h, opts = {}) {
  return nineSlice(ctx, x, y, w, h, opts);
}

/**
 * A heraldic banner: cloth hung from a gilt rod, cut into a swallowtail at
 * the foot, with a gilt edge and soft vertical folds. The field colour is
 * `opts.color` (default a madder red). The interior returned stops above the
 * tails, so a charge or a name drawn inside never falls into the notch.
 */
function bannerPanel(ctx, x, y, w, h, st, opts, res) {
  const fine = res >= 2;
  const q = fine ? 0.5 : 1;
  const prev = ctx.globalAlpha;
  if (opts.alpha != null && opts.alpha < 1) ctx.globalAlpha = prev * opts.alpha;
  const field = opts.color || st.fill[0];
  const fr = ramp(field, 5);
  const depth = clamp(R(h / 5), 3, 8);
  const cx = x + w / 2;
  const body = h - depth;
  // Row by row, so the notch's diagonals stay on the pixel grid (a clip path
  // would antialias them). Folds are a horizontal gradient: light, deep, light.
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, fr[1]); g.addColorStop(0.18, fr[3]); g.addColorStop(0.4, fr[2]);
  g.addColorStop(0.62, fr[3]); g.addColorStop(0.85, fr[2]); g.addColorStop(1, fr[1]);
  const spans = [];
  for (let yy = y; yy < y + h; yy += q) {
    const k = yy < y + body ? 0 : (yy - (y + body) + q) / depth;
    spans.push([yy, snap((w / 2) * k, res)]);
  }
  const sh = opts.shadow != null ? opts.shadow : st.shadow;
  if (sh) {
    ctx.fillStyle = 'rgba(0,0,0,' + sh + ')';
    for (const [yy, nh] of spans) { ctx.fillRect(x + 1, yy + 2, w / 2 - nh, q); ctx.fillRect(cx + nh + 1, yy + 2, w / 2 - nh, q); }
  }
  for (const [yy, nh] of spans) {
    ctx.fillStyle = g;
    ctx.fillRect(x, yy, w / 2 - nh, q); ctx.fillRect(cx + nh, yy, w / 2 - nh, q);
  }
  if (st.grain) {
    for (const [yy, nh] of spans) {
      grain(ctx, st.grain, x, yy, w / 2 - nh, q, 1);
      grain(ctx, st.grain, cx + nh, yy, w / 2 - nh, q, 1);
    }
  }
  // gilt edge: down both sides and along the cut of the tails
  ctx.fillStyle = GILT.key;
  ctx.fillRect(x - q, y, q, h); ctx.fillRect(x + w, y, q, h);
  for (const [yy, nh] of spans) {
    if (yy < y + body) continue;
    ctx.fillStyle = GILT.base;
    ctx.fillRect(cx - nh - q, yy, q, q); ctx.fillRect(cx + nh, yy, q, q);
  }
  ctx.fillStyle = GILT.base;
  ctx.fillRect(x, y, q, h); ctx.fillRect(x + w - q, y, q, h);
  const last = spans[spans.length - 1][1];
  ctx.fillStyle = GILT.lo;
  ctx.fillRect(x, y + h - q, w / 2 - last, q);
  ctx.fillRect(cx + last, y + h - q, w / 2 - last, q);
  // an inner bordure, one pixel in: the company-colours edge of a real banner
  if (w >= 16 && body >= 12) {
    ctx.fillStyle = fine ? 'rgba(242,210,122,0.55)' : 'rgba(242,210,122,0.35)';
    ctx.fillRect(x + 2, y + 3, q, body - 3); ctx.fillRect(x + w - 2 - q, y + 3, q, body - 3);
  }
  // the rod, with finials
  const rodY = y - 2;
  ctx.fillStyle = GILT.key; ctx.fillRect(x - 3, rodY - 1, w + 6, 3);
  ctx.fillStyle = GILT.mid; ctx.fillRect(x - 2, rodY, w + 4, 1);
  if (fine) { ctx.fillStyle = GILT.hi; ctx.fillRect(x - 2, rodY, w + 4, 0.5); }
  fleuron(ctx, x - 3, rodY + 0.5, {});
  fleuron(ctx, x + w + 3, rodY + 0.5, {});
  ctx.globalAlpha = prev;
  const ix = x + 3, iy = y + 2;
  return { x, y, w, h, ix, iy, iw: Math.max(0, w - 6), ih: Math.max(0, body - 3), pad: 3, ink: inkFor('banner') };
}

/**
 * A ribbon title plate: a gilt band with folded tails, the device a scribe
 * paints a chapter title on. Centred on cx; the band's top edge is at y.
 * Returns { x, y, w, h } of the band.
 */
function ribbon(ctx, cx, y, label, opts = {}) {
  const res = ctxRes(ctx);
  const size = opts.size || 'md';
  const tw = measureGlyphs(label, size);
  const h = opts.h || 12;
  const w = R(tw + 12);
  const x = R(cx - w / 2);
  y = R(y);
  const tail = 5;
  const back = opts.tailColor || '#8a6420';
  // Tails: folded behind the band, a step lower, cut in a V.
  for (const side of [-1, 1]) {
    const tx = side < 0 ? x - tail + 1 : x + w - 1;
    ctx.fillStyle = GILT.key;
    ctx.fillRect(tx - (side < 0 ? 1 : 0), y + 2, tail + 1, h);
    vgrad(ctx, tx + (side < 0 ? 0 : 0), y + 3, tail, h - 2, back, shade(back, -0.45));
    // V notch at the far end
    ctx.fillStyle = GILT.key;
    const nx = side < 0 ? tx : tx + tail - 1;
    for (let i = 0; i < 3; i++) ctx.fillRect(nx - side * i, y + 3 + (h - 2) / 2 - 2 + i, 1, 4 - i * 2 + 1);
  }
  const p = nineSlice(ctx, x, y, w, h, { style: opts.style || 'gold', shadow: 0.35, studs: false });
  text(ctx, R(cx), y + R((h - metrics(size, undefined, res).capH) / 2) - (size === 'md' ? 0 : 0), label, {
    size, color: opts.color || inkFor(opts.style || 'gold', 'title'), align: 'center',
    shadow: opts.shadow == null ? 'rgba(255,236,190,0.35)' : opts.shadow,
  });
  return { x, y, w, h, inner: p };
}

/** Panel + a ribbon title plate, the most common composite in the game. */
function window_(ctx, x, y, w, h, title, opts = {}) {
  const p = panel(ctx, x, y, w, h, opts);
  if (title) ribbon(ctx, x + w / 2, y - 5, title, { size: 'md' });
  return p;
}

// ---------------------------------------------------------------------------
// 7. BARS & GAUGES
// ---------------------------------------------------------------------------

const pct = (v, max) => (max > 0 ? clamp01(v / max) : 0);

// Meters that remember: `bar(..., { id })` keeps the last value it drew for
// that id and lets a ghost of it drain after a hit, so every HP bar in the
// game gets the damage trail without its caller tracking anything.
const barMemory = new Map();
const GHOST_HOLD = 0.35;    // seconds the lost chunk hangs before draining
const GHOST_RATE = 0.9;     // fraction of the bar drained per second

function nowSec() { return (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000; }

function trackGhost(id, p) {
  const now = nowSec();
  let e = barMemory.get(id);
  if (!e) {
    e = { p, ghost: p, at: now, heal: 0, t0: now };
    barMemory.set(id, e);
    if (barMemory.size > 256) barMemory.delete(barMemory.keys().next().value);
    return e;
  }
  const dt = Math.min(0.25, Math.max(0, now - e.t0));
  e.t0 = now;
  if (p < e.p) { e.ghost = Math.max(e.ghost, e.p); e.at = now; }
  else if (p > e.p) { e.heal = now; e.ghost = Math.max(e.ghost, p); }
  e.p = p;
  if (now - e.at > GHOST_HOLD) e.ghost = Math.max(p, e.ghost - GHOST_RATE * dt);
  return e;
}

/**
 * UI.bar — HP / MP / XP meters.
 * opts: { color, bg, border, segments, ghost (0..1 trailing damage), id (auto ghost),
 *         label, labelColor, labelAlign:'left'|'center'|'right', alpha, glow, size, gloss }
 * The ghost is the classic JRPG "damage trail": the old value drains toward the
 * new one so the player sees how much was just lost.
 */
function bar(ctx, x, y, w, h, p, opts = {}) {
  x = R(x); y = R(y); w = R(w); h = R(h);
  if (w <= 2 || h <= 0) return;
  const res = ctxRes(ctx);
  const fine = res >= 2;
  p = clamp01(p);
  const col = opts.color || COLORS.hp;
  const bg = opts.bg || '#150f10';
  const border = opts.border === false ? null : (opts.border || '#0a0708');
  const alpha = opts.alpha == null ? 1 : opts.alpha;
  const prev = ctx.globalAlpha;
  if (alpha < 1) ctx.globalAlpha = prev * alpha;

  let ghost = opts.ghost;
  let healAt = 0;
  if (opts.id != null) {
    const e = trackGhost(opts.id, p);
    if (ghost == null) ghost = e.ghost;
    healAt = e.heal;
  }

  // frame + trough
  if (border) { rectStroke(ctx, x, y, w, h, border, 1); }
  const ix = border ? x + 1 : x, iy = border ? y + 1 : y;
  const iw = border ? w - 2 : w, ih = border ? h - 2 : h;
  vgrad(ctx, ix, iy, iw, ih, shade(bg, 0.12), bg);
  if (fine && ih >= 2) {
    // the trough is sunk: its top edge is in shadow
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(ix, iy, iw, 0.5);
  }

  // trailing "ghost" of the value we just lost
  const fw = Math.round(iw * p);
  if (ghost != null && ghost > p) {
    const gw = Math.round(iw * clamp01(ghost));
    ctx.fillStyle = opts.ghostColor || 'rgba(240,190,120,0.55)';
    ctx.fillRect(ix + fw, iy, Math.max(1, gw - fw), ih);
    if (fine) { ctx.fillStyle = 'rgba(255,240,210,0.35)'; ctx.fillRect(ix + fw, iy, Math.max(0.5, gw - fw), 0.5); }
  }

  // the fill itself: lighter at the top so it reads as a lit tube
  if (fw > 0) {
    vgrad(ctx, ix, iy, fw, ih, shade(col, 0.34), shade(col, -0.24));
    if (ih >= 3) {
      if (fine) {
        // Glass: a bright hairline at the top, a soft band below it, a dark
        // hairline at the foot. That is what makes a meter look filled with
        // something rather than painted.
        ctx.fillStyle = shade(col, 0.66); ctx.fillRect(ix, iy, fw, 0.5);
        ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.fillRect(ix, iy + 0.5, fw, Math.max(0.5, R(ih / 3) - 0.5));
        ctx.fillStyle = 'rgba(0,0,0,0.30)'; ctx.fillRect(ix, iy + ih - 0.5, fw, 0.5);
      } else {
        ctx.fillStyle = shade(col, 0.58);
        ctx.fillRect(ix, iy, fw, 1);                        // top highlight
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.fillRect(ix, iy + ih - 1, fw, 1);               // bottom shade
      }
    } else if (fine && ih >= 1) {
      ctx.fillStyle = shade(col, 0.5); ctx.fillRect(ix, iy, fw, 0.5);
    }
    if ((opts.glow || (healAt && nowSec() - healAt < 0.6)) && fw > 1) {
      ctx.fillStyle = shade(col, 0.7);
      ctx.fillRect(ix + fw - (fine ? 0.5 : 1), iy, fine ? 0.5 : 1, ih);   // leading edge spark
    }
  }

  // segment ticks (e.g. one notch per 10 HP, or per spell slot)
  if (opts.segments && opts.segments > 1 && iw > opts.segments * 2) {
    ctx.fillStyle = opts.tickColor || 'rgba(0,0,0,0.55)';
    const tw = fine ? 0.5 : 1;
    for (let i = 1; i < opts.segments; i++) {
      const tx = ix + Math.round((iw * i) / opts.segments);
      ctx.fillRect(tx, iy, tw, ih);
    }
  }

  if (opts.label != null && opts.label !== '') {
    const size = opts.size || 'sm';
    const lc = opts.labelColor || COLORS.ink;
    const align = opts.labelAlign || 'center';
    const ly = y + Math.round((h - metrics(size, undefined, res).capH) / 2) - (metrics(size, undefined, res).fine ? 0 : 1);
    const lx = align === 'left' ? x + 3 : align === 'right' ? x + w - 3 : x + w / 2;
    // The label sits ON the meter, so half of it lands on the bright fill and
    // half on the dark trough: pale ink over a green/gold fill is ~1.3:1 and
    // a 1px drop shadow does not save it. A full keyline does, and it costs
    // nothing on the dark half. `labelOutline: false` opts back out.
    const keyline = opts.labelOutline === false ? null : (opts.labelOutline || '#0a0708');
    text(ctx, lx, ly, String(opts.label), keyline
      ? { size, color: lc, align, outline: keyline }
      : { size, color: lc, align, shadow: true });
  }
  ctx.globalAlpha = prev;
}

/**
 * UI.gauge — a circular meter (concentration, rage rounds, breath recharge).
 * Drawn as discrete pixels around the ring so it stays crisp at 1x.
 */
function gauge(ctx, cx, cy, r, p, opts = {}) {
  cx = R(cx); cy = R(cy); r = Math.max(2, R(r));
  const fine = ctxRes(ctx) >= 2;
  p = clamp01(p);
  const col = opts.color || COLORS.gold;
  const bg = opts.bg || 'rgba(0,0,0,0.55)';
  const thick = Math.max(1, opts.thickness || 2);
  const start = opts.start != null ? opts.start : -Math.PI / 2;   // 12 o'clock
  const q = fine ? 0.5 : 1;
  const steps = Math.max(24, Math.round(2 * Math.PI * r / q));
  const prev = ctx.globalAlpha;
  if (opts.alpha != null) ctx.globalAlpha = prev * opts.alpha;
  for (let i = 0; i < steps; i++) {
    const f = i / steps;
    const a = start + f * Math.PI * 2;
    const on = f <= p;
    for (let tt = 0; tt < thick / q; tt++) {
      const rr = r - tt * q;
      // light from the upper left: the lit arc of the ring is a touch brighter
      ctx.fillStyle = on ? (fine && tt === 0 && Math.cos(a + 2.4) > 0.3 ? shade(col, 0.35) : col) : bg;
      ctx.fillRect(snap(cx + Math.cos(a) * rr, fine ? 2 : 1), snap(cy + Math.sin(a) * rr, fine ? 2 : 1), q, q);
    }
  }
  if (opts.label != null) {
    text(ctx, cx, cy - 3, String(opts.label), { size: opts.size || 'sm', color: opts.labelColor || COLORS.ink, align: 'center', shadow: true });
  }
  ctx.globalAlpha = prev;
}

/** A row of small pips — HP hearts, hit dice, death saves, ammo. */
function pips(ctx, x, y, count, filled, opts = {}) {
  const fine = ctxRes(ctx) >= 2;
  const size = opts.size || 5;
  const gap = opts.gap == null ? 2 : opts.gap;
  const on = opts.color || COLORS.hp;
  const off = opts.bg || 'rgba(255,255,255,0.14)';
  for (let i = 0; i < count; i++) {
    const px = R(x + i * (size + gap));
    if (opts.icon) icon(ctx, opts.icon, px, R(y), size + 3, i < filled ? on : off);
    else {
      ctx.fillStyle = '#0a0708';
      ctx.fillRect(px - 1, R(y) - 1, size + 2, size + 2);
      ctx.fillStyle = i < filled ? on : off;
      ctx.fillRect(px, R(y), size, size);
      if (i < filled) {
        ctx.fillStyle = shade(on, 0.45);
        if (fine) {
          // a jewel, not a square: lit corner, shaded foot
          ctx.fillRect(px, R(y), size, 0.5);
          ctx.fillRect(px, R(y), 0.5, size);
          ctx.fillStyle = shade(on, 0.8); ctx.fillRect(px + 0.5, R(y) + 0.5, 0.5, 0.5);
          ctx.fillStyle = shade(on, -0.35); ctx.fillRect(px, R(y) + size - 0.5, size, 0.5);
        } else ctx.fillRect(px, R(y), size, 1);
      }
    }
  }
  return count * (size + gap) - gap;
}

// ---------------------------------------------------------------------------
// 8. CURSORS & SELECTION
// ---------------------------------------------------------------------------

// A gilt arrowhead on the fine grid: 8x14 device px, 4x7 logical, keylined.
const CURSOR_FINE = [
  'k.......',
  'kk......',
  'khk.....',
  'khhk....',
  'khhGk...',
  'khGGGk..',
  'khGGGGk.',
  'kGGGGGgk',
  'kGGGGgk.',
  'kGGGgk..',
  'kGggk...',
  'kggk....',
  'kgk.....',
  'kk......',
];

/** Bobbing gold arrow that marks the active menu row. */
function cursor(ctx, x, y, t = 0) {
  // The arrow is 4x7 and points right; it bobs +/-1px on a ~1Hz sine so the eye
  // is always pulled to the active row without any flashing.
  const bob = Math.round(Math.sin(t * 6) * 1.5);
  const px = R(x) + bob;
  const py = R(y);
  if (ctxRes(ctx) >= 2) {
    // the keyline is the arrow's own outer ring of 'k'; a soft shadow sits under it
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(px + 0.5, py + 1, 3, 6.5);
    stamp(ctx, 'cursor', CURSOR_FINE, { k: '#0a0708', h: GILT.spec, G: GILT.base, g: GILT.lo }, px - 0.5, py - 0.5, 0.5);
    return;
  }
  // widths of each scanline of the triangle, top -> bottom
  const rows = [1, 2, 3, 4, 3, 2, 1];
  // 1px black keyline first, so the arrow reads over any tile or portrait
  ctx.fillStyle = '#0a0708';
  for (let i = 0; i < rows.length; i++) {
    ctx.fillRect(px - 1, py + i - 1, rows[i] + 2, 3);
  }
  for (let i = 0; i < rows.length; i++) {
    ctx.fillStyle = i < 3 ? COLORS.goldBright : (i === 3 ? COLORS.gold : COLORS.goldDim);
    ctx.fillRect(px, py + i, rows[i], 1);
  }
}

/**
 * Animated selection outline: marching gold dashes plus pulsing corner brackets.
 * Used everywhere a grid cell / portrait / card is highlighted. On a fine
 * layer the dashes are hairlines with a dark companion inside them, so they
 * read on a bright portrait as well as a dark slot.
 */
function frameSel(ctx, x, y, w, h, t = 0, opts = {}) {
  x = R(x); y = R(y); w = R(w); h = R(h);
  if (w <= 2 || h <= 2) return;
  const fine = ctxRes(ctx) >= 2;
  const col = opts.color || COLORS.gold;
  const bright = opts.bright || COLORS.goldBright;
  const period = opts.period || 8;             // dash cycle length in px
  const offset = Math.floor((t * (opts.speed || 14)) % period);

  if (fine) {
    ctx.fillStyle = 'rgba(10,7,8,0.55)';
    ctx.fillRect(x + 0.5, y + 0.5, w - 1, 0.5); ctx.fillRect(x + 0.5, y + h - 1, w - 1, 0.5);
    ctx.fillRect(x + 0.5, y + 0.5, 0.5, h - 1); ctx.fillRect(x + w - 1, y + 0.5, 0.5, h - 1);
  }
  const th = fine ? 0.5 : 1;
  // marching ants around the perimeter
  ctx.fillStyle = col;
  for (let i = 0; i < w; i++) {
    if ((i + offset) % period < period / 2) {
      ctx.fillRect(x + i, y, 1, th);
      ctx.fillRect(x + w - 1 - i, y + h - th, 1, th);
    }
  }
  for (let i = 0; i < h; i++) {
    if ((i + offset) % period < period / 2) {
      ctx.fillRect(x + w - th, y + i, th, 1);
      ctx.fillRect(x, y + h - 1 - i, th, 1);
    }
  }

  // corner brackets pulse in and out by one pixel
  const puls = Math.sin(t * 5) > 0 ? 1 : 0;
  const L = Math.min(4, Math.floor(Math.min(w, h) / 3));
  const cs = [[x - puls, y - puls, 1, 1], [x + w - 1 + puls, y - puls, -1, 1],
    [x - puls, y + h - 1 + puls, 1, -1], [x + w - 1 + puls, y + h - 1 + puls, -1, -1]];
  for (const [cx, cy, sx, sy] of cs) {
    ctx.fillStyle = bright;
    for (let i = 0; i < L; i++) {
      ctx.fillRect(cx + sx * i, cy, 1, 1);
      ctx.fillRect(cx, cy + sy * i, 1, 1);
    }
    if (fine) {
      // the bracket's inner edge is shaded, so it reads as a bent strip of gold
      ctx.fillStyle = GILT.lo;
      for (let i = 1; i < L; i++) {
        ctx.fillRect(cx + sx * i + (sx > 0 ? 0 : 0.5), cy + (sy > 0 ? 0.5 : 0), 0.5, 0.5);
        ctx.fillRect(cx + (sx > 0 ? 0.5 : 0), cy + sy * i + (sy > 0 ? 0 : 0.5), 0.5, 0.5);
      }
    }
  }
}

/** Static highlight wash behind a selected row: a gilt rule on the left fading to the right. */
function highlight(ctx, x, y, w, h, opts = {}) {
  x = R(x); y = R(y); w = R(w); h = R(h);
  if (w <= 0 || h <= 0) return;
  const fine = ctxRes(ctx) >= 2;
  const col = opts.color || COLORS.gold;
  const a = opts.alpha == null ? 0.16 : opts.alpha;
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * a;
  if (fine && typeof col === 'string' && col[0] === '#') {
    // Lamplight across the row: strongest where the cursor is, gone by the
    // far edge, so a long list reads as one line lit rather than a stripe.
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, shade(col, 0.2));
    g.addColorStop(0.55, shade(col, -0.2));
    g.addColorStop(1, shade(col, -0.6));
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
  } else vgrad(ctx, x, y, w, h, shade(col, 0.3), shade(col, -0.35));
  ctx.globalAlpha = prev;
  ctx.fillStyle = col;
  ctx.fillRect(x, y, 1, h);
  if (fine) {
    ctx.fillStyle = shade(col, 0.5); ctx.fillRect(x, y, 0.5, h);
    // gilt hairlines along the top and foot of the row, fading out
    const g2 = ctx.createLinearGradient(x, 0, x + w, 0);
    g2.addColorStop(0, `rgba(242,210,122,${(0.55 * Math.min(1, a * 3)).toFixed(3)})`);
    g2.addColorStop(1, 'rgba(242,210,122,0)');
    ctx.fillStyle = g2;
    ctx.fillRect(x + 1, y, w - 1, 0.5);
    ctx.fillRect(x + 1, y + h - 0.5, w - 1, 0.5);
  }
}

// ---------------------------------------------------------------------------
// 9. PIXEL ICONS
// ---------------------------------------------------------------------------
// Each icon is an 8x8 grid. Palette chars:
//   .  transparent      K outline/black    W white/bone-light   N bone  n bone-dark
//   M base colour (the `color` argument)   L base light   D base dark
//   S steel  s steel-dark   G gold  g gold-dark   B wood  b wood-dark
//   R red    r red-dark     E green e green-dark  U blue  u blue-dark
//   P purple p purple-dark  C cyan  Y yellow      H skin  X near-black
//
// On a fine layer an icon is re-drawn at device resolution: the 8x8 grid is
// upscaled with Scale2x/3x (clean diagonals instead of staircases), then every
// exposed edge gets a one-device-pixel keyline and the upper-left edges catch
// the light. Same art, twice the detail.

const ICON_FIXED = {
  K: '#140f0c', W: '#f6efe0', N: '#e8e0c8', n: '#a89a78',
  S: '#b9c1cf', s: '#79839a', G: '#e3b34a', g: '#a37a26',
  B: '#8a5a30', b: '#5a3a1e', R: '#c8452f', r: '#8a2c1e',
  E: '#5fae52', e: '#2f7a3c', U: '#4a7ad0', u: '#2b4c96',
  P: '#a76ad8', p: '#6b3f9e', C: '#63d6d0', Y: '#f0d264',
  H: '#e0a878', X: '#1a1414',
};

/** name -> { base, g:[8 rows of 8] } */
const ICONS = {
  // --- weapons ---------------------------------------------------------------
  sword: { base: '#c9d2e0', g: ['....S...', '...SSs..', '...SSs..', '...SSs..', '.GGGGGG.', '...Bb...', '...Bb...', '...GG...'] },
  axe: { base: '#c9d2e0', g: ['.SSSB...', 'SSSSB...', 'SSSSB...', '.SSSB...', '....B...', '....B...', '....b...', '....b...'] },
  bow: { base: '#8a5a30', g: ['....B...', '....NBb.', '....N.B.', '....N.B.', '....N.B.', '....NBb.', '....B...', '........'] },
  dagger: { base: '#c9d2e0', g: ['....S...', '...SSs..', '...SSs..', '..GGGGG.', '....Bb..', '....Bb..', '...GGG..', '........'] },
  staff: { base: '#63d6d0', g: ['...CC...', '..CWWC..', '...CC...', '....B...', '....B...', '....B...', '....B...', '....b...'] },
  mace: { base: '#c9d2e0', g: ['...s.s..', '..sSSSs.', '..SSSSS.', '...sSs..', '....B...', '....B...', '....B...', '...GGG..'] },
  spear: { base: '#c9d2e0', g: ['....S...', '...SSS..', '...SSS..', '....S...', '....B...', '....B...', '....B...', '....b...'] },
  // --- protection ------------------------------------------------------------
  shield: { base: '#c9d2e0', g: ['.SSSSSS.', '.SGGGGS.', '.SGWWGS.', '.SGWWGS.', '.sSGGSs.', '..sSSs..', '...ss...', '........'] },
  helm: { base: '#c9d2e0', g: ['..SSSS..', '.SSSSSS.', 'SSSSSSSS', 'SKKSSKKS', 'SSSSSSSS', 'SsSSSSsS', '.ss..ss.', '........'] },
  armor: { base: '#c9d2e0', g: ['.SS..SS.', 'SSSSSSSS', 'SSSSSSSS', 'SSsSSsSS', '.SSSSSS.', '.SSSSSS.', '..S..S..', '........'] },
  boots: { base: '#8a5a30', g: ['........', '.BB..BB.', '.BB..BB.', '.BB..BB.', '.BB..BB.', '.BBB.BBB', 'bbbb.bbb', '........'] },
  cloak: { base: '#7a3050', g: ['..MMMM..', '.MMMMMM.', 'MMDMMDMM', 'MMMMMMMM', 'MMMMMMMM', '.MMMMMM.', '.M.MM.M.', '........'] },
  // --- trinkets --------------------------------------------------------------
  ring: { base: '#e3b34a', g: ['...CC...', '..GCCG..', '.G....G.', '.G....G.', '.G....G.', '..G..G..', '...GG...', '........'] },
  amulet: { base: '#e3b34a', g: ['.n....n.', '..n..n..', '...GG...', '..GCCG..', '.GCWWCG.', '.GCCCCG.', '..GGGG..', '........'] },
  gem: { base: '#63d6d0', g: ['........', '..MMMM..', '.MWWMMM.', 'MMMMMMMM', '.MMMMMM.', '..MMMM..', '...MM...', '........'] },
  coin: { base: '#e3b34a', g: ['..gggg..', '.gGGGGg.', 'gGGWWGGg', 'gGWGGWGg', 'gGGWWGGg', '.gGGGGg.', '..gggg..', '........'] },
  crown: { base: '#e3b34a', g: ['........', 'G..GG..G', 'GG.GG.GG', 'GGGGGGGG', 'GGCGGCGG', 'GGGGGGGG', 'gggggggg', '........'] },
  // --- consumables & tools ---------------------------------------------------
  potion: { base: '#c8452f', g: ['...bb...', '...KK...', '...MM...', '..KMMK..', '.KMMMMK.', '.KMLLMK.', '.KMMMMK.', '..KKKK..'] },
  flask: { base: '#5fae52', g: ['...bb...', '...SS...', '...SS...', '..SSSS..', '.SMMMMS.', 'SMMMMMMS', 'SMMMMMMS', '.SSSSSS.'] },
  scroll: { base: '#e8e0c8', g: ['.nnnnnn.', 'nNNNNNNn', 'nNbbbbNn', 'nNNNNNNn', 'nNbbbbNn', 'nNNNNNNn', 'nNbbbNNn', '.nnnnnn.'] },
  book: { base: '#8a2c1e', g: ['.RRRRRR.', 'RRNNNNRR', 'RRNGGNRR', 'RRNNNNRR', 'RRNGGNRR', 'RRNNNNRR', '.rrrrrr.', '........'] },
  wand: { base: '#63d6d0', g: ['.....W..', '....WCW.', '.....W..', '....B...', '...B....', '..B.....', '.b......', 'b.......'] },
  key: { base: '#e3b34a', g: ['..GGG...', '.G.g.G..', '.G...G..', '..GGG...', '...G....', '...GG...', '...G....', '...GGG..'] },
  chest: { base: '#8a5a30', g: ['.bbbbbb.', 'bBBBBBBb', 'bBGGGGBb', '.bbbbbb.', 'bBBGGBBb', 'bBBGGBBb', 'bBBBBBBb', '.bbbbbb.'] },
  bag: { base: '#8a5a30', g: ['..b..b..', '..bbbb..', '.BBBBBB.', 'BBBBBBBB', 'BBBGGBBB', 'BBBGGBBB', 'BBBBBBBB', '.BBBBBB.'] },
  candle: { base: '#f07a2a', g: ['....M...', '...MMM..', '...MM...', '....K...', '..NNNN..', '..NNNN..', '..NNNN..', '.nnnnnn.'] },
  anvil: { base: '#c9d2e0', g: ['........', '.SSSSSS.', 'SSSSSSSS', '.sSSSSs.', '..SSSS..', '..sSSs..', '.SSSSSS.', '.ssssss.'] },
  hammer: { base: '#c9d2e0', g: ['.SSSSSS.', 'SSSSSSSS', 'SSsSSsSS', '...BB...', '...BB...', '...BB...', '...BB...', '...bb...'] },
  map: { base: '#e8e0c8', g: ['.NNnNNn.', 'NNNnNNnN', 'NNNnNNnN', 'NRNnNNnN', 'NNRnNNnN', 'NNNnNNnN', 'NNNnNNnN', '.NNnNNn.'] },
  hourglass: { base: '#e3b34a', g: ['GGGGGGGG', '.YYYYYY.', '..YYYY..', '...YY...', '...YY...', '..Y..Y..', '.Y....Y.', 'GGGGGGGG'] },
  dice: { base: '#f6efe0', g: ['.WWWWWW.', 'WWWWWWWW', 'WWKWWKWW', 'WWWWWWWW', 'WWWWWWWW', 'WWKWWKWW', 'WWWWWWWW', '.WWWWWW.'] },
  d20: { base: '#c3a2ff', g: ['...MM...', '..MLLM..', '.MLLLLM.', 'MLLLLLLM', 'MDLLLLDM', '.DMMMMD.', '..DMMD..', '...DD...'] },
  lock: { base: '#e3b34a', g: ['..SSSS..', '.SS..SS.', '.SS..SS.', 'GGGGGGGG', 'GGGKKGGG', 'GGGKKGGG', 'GGGGGGGG', '........'] },
  quest: { base: '#e3b34a', g: ['..GGGG..', '.GGGGGG.', 'GGGKKGGG', 'GGGKKGGG', 'GGGKKGGG', 'GGGGGGGG', 'GGGKKGGG', '.GGGGGG.'] },
  eye: { base: '#c9d2e0', g: ['........', '..MMMM..', '.MWWWWM.', 'MWUKKUWM', 'MWUKKUWM', '.MWWWWM.', '..MMMM..', '........'] },
  // --- vitals ----------------------------------------------------------------
  heart: { base: COLORS.hp, g: ['.MM..MM.', 'MLMMMMMM', 'MLMMMMMM', 'MMMMMMMM', '.MMMMMM.', '..MMMM..', '...MM...', '........'] },
  mana: { base: COLORS.mp, g: ['...MM...', '...MM...', '..MMMM..', '.MMMMMM.', 'MMMMMMMM', 'MMLMMMMM', '.MMMMMM.', '..MMMM..'] },
  star: { base: COLORS.gold, g: ['...MM...', '...MM...', 'MMMMMMMM', '.MMMMMM.', '..MMMM..', '.MMMMMM.', '.MM..MM.', '........'] },
  skull: { base: '#e8e0c8', g: ['..NNNN..', '.NNNNNN.', 'NKKNNKKN', 'NKKNNKKN', 'NNNKNNNN', '.NNNNNN.', '..NNNN..', '..N.N.N.'] },
  // --- damage schools --------------------------------------------------------
  flame: { base: DAMAGE_COLORS.fire, g: ['....M...', '...MM...', '..MMM...', '..MMMM..', '.MMLMMM.', 'MMLLLMMM', 'MMLLLMMM', '.MMMMMM.'] },
  frost: { base: DAMAGE_COLORS.cold, g: ['...M....', 'M..M..M.', '.M.M.M..', '..MMM...', 'MMMMMMMM', '..MMM...', '.M.M.M..', 'M..M..M.'] },
  bolt: { base: DAMAGE_COLORS.lightning, g: ['....MMM.', '...MMM..', '..MMM...', '.MMMMMM.', '...MMM..', '..MMM...', '.MMM....', '.MM.....'] },
  thunder: { base: DAMAGE_COLORS.thunder, g: ['..MMMM..', '.MMMMMM.', 'MMMMMMMM', '.MMMMMM.', '...LL...', '..LL....', '...LL...', '..L.....'] },
  acid: { base: DAMAGE_COLORS.acid, g: ['....M...', '...MMM..', '..MMMMM.', '.MMLMMMM', '.MMMMMMM', '..MMMMM.', 'M.......', 'MM....M.'] },
  poison: { base: DAMAGE_COLORS.poison, g: ['...MM...', '..MMMM..', '.MMMMMM.', 'MMKMMKMM', 'MMMMMMMM', '.MKMMKM.', '..MMMM..', '...MM...'] },
  psychic: { base: DAMAGE_COLORS.psychic, g: ['..MMMM..', '.MLMMLM.', 'MMMLMMMM', 'MLMMMLMM', 'MMMLMMMM', '.MMLMMM.', '..MMMM..', '........'] },
  force: { base: DAMAGE_COLORS.force, g: ['..MMMM..', '.M....M.', 'M......M', 'M......M', 'M......M', 'M......M', '.M....M.', '..MMMM..'] },
  radiant: { base: DAMAGE_COLORS.radiant, g: ['...M....', 'M..M..M.', '.M.M.M..', '..LLL...', 'MMLLLMM.', '..LLL...', '.M.M.M..', 'M..M..M.'] },
  necrotic: { base: DAMAGE_COLORS.necrotic, g: ['..MMMM..', '.MMMMMM.', 'MMKMMMMM', 'MMMKMMMM', 'MMMMKMMM', '.MMMKMM.', '..MMMM..', '..M..M..'] },
  holy: { base: '#ffe9a8', g: ['...MM...', '...MM...', '.M.MM.M.', 'MMMMMMMM', '.M.MM.M.', '...MM...', '...MM...', '........'] },
  shadow: { base: '#5a4a7a', g: ['..MMMM..', '.MMMMMM.', 'MMWMMWMM', 'MMMMMMMM', 'MMMMMMMM', '.MMMMMM.', '..M.M.M.', '........'] },
  leaf: { base: '#5fae52', g: ['......MM', '....MMMM', '..MMMMMM', '.MMLMMM.', 'MMLMMM..', 'MMLMM...', '.MLM....', '..M.....'] },
  wind: { base: '#b8d0e0', g: ['........', '.MMMMM..', '.....MM.', '...MMM..', 'MMMMMMM.', '......M.', '.MMMMM..', '........'] },
  rune: { base: '#c3a2ff', g: ['..MMMM..', '.M....M.', 'M..MM..M', 'M.MMMM.M', 'M.MMMM.M', 'M..MM..M', '.M....M.', '..MMMM..'] },
  // --- markers & verbs -------------------------------------------------------
  check: { base: COLORS.good, g: ['.......M', '......MM', '.....MM.', 'M...MM..', 'MM.MM...', '.MMM....', '..M.....', '........'] },
  cross: { base: COLORS.bad, g: ['M......M', 'MM....MM', '.MM..MM.', '..MMMM..', '..MMMM..', '.MM..MM.', 'MM....MM', 'M......M'] },
  plus: { base: COLORS.good, g: ['........', '...MM...', '...MM...', '.MMMMMM.', '.MMMMMM.', '...MM...', '...MM...', '........'] },
  minus: { base: COLORS.bad, g: ['........', '........', '........', '.MMMMMM.', '.MMMMMM.', '........', '........', '........'] },
  'arrow-up': { base: COLORS.good, g: ['...MM...', '..MMMM..', '.MMMMMM.', 'MMMMMMMM', '...MM...', '...MM...', '...MM...', '........'] },
  'arrow-down': { base: COLORS.bad, g: ['...MM...', '...MM...', '...MM...', 'MMMMMMMM', '.MMMMMM.', '..MMMM..', '...MM...', '........'] },
  target: { base: COLORS.bad, g: ['...MM...', '.MMMMMM.', '.MM..MM.', 'MM.RR.MM', 'MM.RR.MM', '.MM..MM.', '.MMMMMM.', '...MM...'] },
  foot: { base: '#e0a878', g: ['.M.M.M..', '..MMM...', '.MMMMM..', '.MMMMM..', '..MMM...', '..MMM...', '.MMMM...', '..MM....'] },
  run: { base: '#6ac0f0', g: ['.....MM.', '.....MM.', '..M.MM..', '.MMMMM..', 'M.MM.M..', '..MM....', '.MM.MM..', 'MM...MM.'] },
  dash: { base: '#6ac0f0', g: ['M...M...', '.M...M..', '..M...M.', '...M...M', '..M...M.', '.M...M..', 'M...M...', '........'] },
  dodge: { base: '#6ac0f0', g: ['....MM..', '..MM..M.', '.M.....M', 'M.......', '.M......', '..MM....', '....MM..', '.....MM.'] },
  // --- the manuscript's own marks ---------------------------------------------
  quill: { base: '#e8e0c8', g: ['.......N', '.....NNn', '....NNn.', '...NNn..', '..NNn...', '..Nn....', '.K......', 'K.......'] },
  banner: { base: '#a8281e', g: ['GGGGGGGG', '.MMMMMM.', '.MLMMMM.', '.MMGGMM.', '.MMGGMM.', '.MMMMMM.', '.MM..MM.', '.M....M.'] },
  seal: { base: '#b8322a', g: ['..MMMM..', '.MMLLMM.', 'MMLMMDMM', 'MLMGGMDM', 'MMMGGMDM', 'MMDMMDMM', '.MMDDMM.', '..MMMM..'] },
  lute: { base: '#b07840', g: ['......KK', '.....KK.', '....BB..', '..MMMB..', '.MMKMM..', 'MMKKMMM.', 'MMMMMM..', '.MMMM...'] },
};

const iconCache = boundedCache(320);

/** Build the per-icon palette; `M/L/D` derive from the requested base colour. */
function iconPalette(base) {
  return {
    ...ICON_FIXED,
    M: base,
    L: shade(base, 0.34),
    D: shade(base, -0.34),
  };
}

/** One pass of Scale2x (EPX): doubles a char grid, rounding off staircase diagonals. */
function scale2x(g) {
  const h = g.length, w = g[0].length;
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? '.' : g[y][x]);
  const out = Array.from({ length: h * 2 }, () => new Array(w * 2));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const P = at(x, y), A = at(x, y - 1), B = at(x + 1, y), C = at(x - 1, y), D = at(x, y + 1);
      let e0 = P, e1 = P, e2 = P, e3 = P;
      if (C === A && C !== D && A !== B) e0 = A;
      if (A === B && A !== C && B !== D) e1 = B;
      if (D === C && D !== B && C !== A) e2 = C;
      if (B === D && B !== A && D !== C) e3 = D;
      out[y * 2][x * 2] = e0; out[y * 2][x * 2 + 1] = e1;
      out[y * 2 + 1][x * 2] = e2; out[y * 2 + 1][x * 2 + 1] = e3;
    }
  }
  return out.map((r) => r.join(''));
}

/** Bake the 1x icon: the 8x8 grid spread across `size` logical px. */
function buildIcon(name, size, color) {
  const def = ICONS[name];
  if (!def) return null;
  const pal = iconPalette(color || def.base || COLORS.ink);
  const cv = makeCanvas(size, size);
  const c = cv.getContext('2d');
  c.imageSmoothingEnabled = false;
  // Distribute the 8 source pixels across `size` device pixels without gaps:
  // each column/row gets floor((i+1)*s) - floor(i*s) pixels, so 12px works too.
  const edge = [];
  for (let i = 0; i <= 8; i++) edge.push(Math.round((i * size) / 8));
  for (let ry = 0; ry < 8; ry++) {
    const row = def.g[ry] || '........';
    for (let rx = 0; rx < 8; rx++) {
      const ch = row[rx];
      if (!ch || ch === '.' || ch === ' ') continue;
      const col = pal[ch];
      if (!col) continue;
      c.fillStyle = col;
      c.fillRect(edge[rx], edge[ry], Math.max(1, edge[rx + 1] - edge[rx]), Math.max(1, edge[ry + 1] - edge[ry]));
    }
  }
  return cv;
}

/**
 * Bake the fine icon: `size` logical px = 2*size device px, plus a one-pixel
 * margin all round for the keyline. The art is enlarged whichever way fills
 * the box best — Scale2x (clean diagonals instead of staircases) or a plain
 * integer upscale — then every exposed edge gets a keyline and the upper-left
 * edges catch the light. A pixel that is itself outline (K, X) keeps its colour.
 */
function buildIconFine(name, size, color) {
  const def = ICONS[name];
  if (!def) return null;
  const S = size * 2;
  const src = def.g.map((r) => r.padEnd(8, '.').slice(0, 8));
  // candidates: plain 8x8, Scale2x 16x16, Scale2x twice 32x32; the biggest
  // integer fit wins, ties go to the smoother grid
  let best = null;
  let g = src; let n = 8;
  for (let pass = 0; pass < 3; pass++) {
    const k = Math.floor(S / n);
    if (k >= 1 && (!best || n * k >= best.span)) best = { g, n, k, span: n * k };
    if (n * 2 > S) break;
    g = scale2x(g); n *= 2;
  }
  ({ g, n } = best);
  const { k, span } = best;
  const pal = iconPalette(color || def.base || COLORS.ink);
  const cv = makeCanvas(S + 2, S + 2);
  const c = cv.getContext('2d');
  const o = 1 + Math.floor((S - span) / 2);
  const lit = (x, y) => x >= 0 && y >= 0 && x < n && y < n && g[y][x] !== '.' && g[y][x] !== ' ' && !!pal[g[y][x]];
  // keyline: one device px on every empty side of the art
  c.fillStyle = 'rgba(12,8,6,0.9)';
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!lit(x, y)) continue;
      const px = o + x * k, py = o + y * k;
      if (!lit(x - 1, y)) c.fillRect(px - 1, py, 1, k);
      if (!lit(x + 1, y)) c.fillRect(px + k, py, 1, k);
      if (!lit(x, y - 1)) c.fillRect(px, py - 1, k, 1);
      if (!lit(x, y + 1)) c.fillRect(px, py + k, k, 1);
    }
  }
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!lit(x, y)) continue;
      const ch = g[y][x];
      const base = pal[ch];
      const px = o + x * k, py = o + y * k;
      c.fillStyle = base;
      c.fillRect(px, py, k, k);
      if (ch === 'K' || ch === 'X') continue;
      // light from the upper left: a lit rim where the art meets air above or
      // to the left, a shaded one below and to the right
      if (!lit(x, y - 1)) { c.fillStyle = shade(base, 0.30); c.fillRect(px, py, k, 1); }
      if (!lit(x - 1, y)) { c.fillStyle = shade(base, 0.18); c.fillRect(px, py, 1, k); }
      if (!lit(x, y + 1)) { c.fillStyle = shade(base, -0.30); c.fillRect(px, py + k - 1, k, 1); }
      if (!lit(x + 1, y)) { c.fillStyle = shade(base, -0.18); c.fillRect(px + k - 1, py, 1, k); }
    }
  }
  return cv;
}

/**
 * UI.icon — draw a procedural pixel icon, cached per name|size|color|grid.
 * Unknown names draw a small neutral rune so a typo never blanks the UI.
 */
function icon(ctx, name, x, y, size = 8, color = null) {
  if(String(name).startsWith('weapon:'))return drawWeaponIcon(ctx,String(name).slice(7),x,y,size);
  size = Math.max(4, R(size));
  const fine = ctxRes(ctx) >= 2;
  const key = `${name}|${size}|${color || ''}|${fine ? 2 : 1}`;
  let cv = iconCache.get(key);
  if (cv === undefined) {
    const build = fine ? buildIconFine : buildIcon;
    cv = iconCache.set(key, build(name, size, color) || build('rune', size, color || COLORS.inkDim));
  }
  if (!cv) return false;
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  // the fine bake carries a half-pixel keyline margin outside the icon box
  if (fine) ctx.drawImage(cv, R(x) - 0.5, R(y) - 0.5, size + 1, size + 1);
  else ctx.drawImage(cv, R(x), R(y), size, size);
  ctx.imageSmoothingEnabled = prev;
  return true;
}

/** Every registered icon id — useful for editors and debug screens. */
const ICON_NAMES = Object.freeze(Object.keys(ICONS));

/** Damage type -> icon id, so combat logs can decorate themselves. */
const DAMAGE_ICONS = Object.freeze({
  slashing: 'sword', piercing: 'spear', bludgeoning: 'hammer',
  fire: 'flame', cold: 'frost', lightning: 'bolt', thunder: 'thunder',
  acid: 'acid', poison: 'poison', necrotic: 'necrotic', radiant: 'radiant',
  psychic: 'psychic', force: 'force', healing: 'plus',
});

// ---------------------------------------------------------------------------
// 10. WIDGETS
// ---------------------------------------------------------------------------

/**
 * UI.button — a framed, label-centred control.
 * opts: { selected, disabled, hover, pressed, icon, hint, t, style, color, align }
 * Normal is a leather plate with a gilt hairline; hover warms it; pressed
 * sinks it a pixel; selected is the gilt plate; disabled is hatched.
 * `style: 'seal'` gives the red wax face used for a decisive action.
 */
function button(ctx, x, y, w, h, label, opts = {}) {
  x = R(x); y = R(y); w = R(w); h = R(h);
  const fine = ctxRes(ctx) >= 2;
  const sel = !!opts.selected;
  const dis = !!opts.disabled;
  const hov = !!opts.hover && !dis;
  const prs = !!opts.pressed && !dis;
  const style = opts.style || (dis ? 'plain' : sel ? 'gold' : 'window');
  const light = style === 'gold' || style === 'steel' || style === 'brass';
  const p = nineSlice(ctx, x, y + (prs ? 1 : 0), w, h - (prs ? 1 : 0), {
    style, alpha: dis ? 0.62 : 1, shadow: prs ? 0.15 : sel ? 0.5 : 0.3, studs: h >= 18 ? undefined : false,
  });
  if (hov && p.iw > 0) {
    // lamplight falling on the plate from above
    const g = ctx.createLinearGradient(0, p.iy, 0, p.iy + p.ih);
    g.addColorStop(0, light ? 'rgba(255,255,240,0.30)' : 'rgba(255,214,140,0.16)');
    g.addColorStop(1, 'rgba(255,214,140,0)');
    ctx.fillStyle = g;
    ctx.fillRect(p.ix, p.iy, p.iw, p.ih);
    if (fine) hairFrame(ctx, x, y, w, h, GILT.spec, GILT.mid, 1);
  }
  if (prs && p.iw > 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(p.ix, p.iy, p.iw, fine ? 1 : 1);
  }

  let ink = opts.color || (light ? inkFor(style, 'title') : style === 'seal' ? inkFor('seal', 'body') : COLORS.ink);
  if (dis) ink = COLORS.disabled;
  if (sel && !light) ink = COLORS.goldBright;
  if (hov && !sel && !light && !opts.color) ink = COLORS.inkBright;

  const m = metrics('md');
  const ty = y + Math.round((h - m.capH) / 2) - 1 + (prs ? 1 : 0);
  let tx = x + Math.round(w / 2);
  let align = opts.align || 'center';

  let ix = x + 4;
  if (opts.icon) {
    const isz = Math.min(10, h - 4);
    icon(ctx, opts.icon, ix, y + Math.round((h - isz) / 2) + (prs ? 1 : 0), isz, dis ? COLORS.disabled : null);
    ix += isz + 3;
    if (align === 'center') { align = 'left'; tx = ix; }
  }

  // Same rule as `list()`: a right-aligned hint with no `maxWidth` walks off
  // the left edge of its own button. It keeps at most 40% of the face.
  const face = w - (ix - x) - 4;
  let hintW = 0;
  if (opts.hint) {
    const hw = Math.min(measureGlyphs(opts.hint, 'sm'), Math.round(face * 0.4));
    hintW = hw + 4;
    text(ctx, x + w - 4, ty + 1, opts.hint, {
      size: 'sm', color: dis ? COLORS.disabled : (light ? inkFor(style, 'dim') : COLORS.inkDim), align: 'right', shadow: !light, maxWidth: hw,
    });
  }

  const avail = face - hintW;
  // A centred label centres on the WHOLE face, so with a hint on the right it
  // still ran under the hint even though `avail` had been reduced for it.
  // Recentre on the space the hint leaves.
  if (align === 'center' && hintW > 0) tx -= Math.round(hintW / 2);
  text(ctx, tx, ty, String(label == null ? '' : label), {
    size: 'md', color: ink, align, shadow: light ? 'rgba(255,236,190,0.40)' : true, maxWidth: Math.max(0, avail),
  });

  if (sel && !dis) frameSel(ctx, x - 1, y - 1, w + 2, h + 2, opts.t || 0);
  if (dis) {
    // hatch the face so "disabled" reads without relying on colour alone
    ctx.fillStyle = 'rgba(10,7,8,0.28)';
    const step = fine ? 1 : 2;
    for (let i = 0; i < p.ih; i += step) ctx.fillRect(p.ix, p.iy + i, p.iw, fine ? 0.5 : 1);
  }
  return { x, y, w, h };
}

/**
 * A small keycap + label, e.g. [Z] Confirm. Returns the total width drawn.
 * The cap is a little block of ivory-gold with a darker front lip, so it reads
 * as a key you press rather than a sticker.
 */
function keyHint(ctx, x, y, key, label, opts = {}) {
  key = String(key == null ? '' : key).toUpperCase();
  const fine = ctxRes(ctx) >= 2;
  const kw = Math.max(9, measureGlyphs(key, 'sm') + 6);
  const kh = opts.h || 11;
  const dim = opts.disabled ? 0.5 : 1;
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * dim;
  x = R(x); y = R(y);

  if (fine) {
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(x + 1, y + 1, kw, kh);
    ctx.fillStyle = '#140c05'; ctx.fillRect(x, y, kw, kh);
    // the lip: the key's front face, in shade
    vgrad(ctx, x + 0.5, y + 0.5, kw - 1, kh - 1, '#b08a3a', '#6a4c18');
    // the top of the key, lit
    vgrad(ctx, x + 0.5, y + 0.5, kw - 1, kh - 2, '#f6e0a0', '#d4aa50');
    ctx.fillStyle = '#fff6d8'; ctx.fillRect(x + 1, y + 0.5, kw - 2, 0.5);
    ctx.fillStyle = 'rgba(255,250,230,0.6)'; ctx.fillRect(x + 0.5, y + 1, 0.5, kh - 3);
    ctx.fillStyle = 'rgba(90,60,20,0.55)'; ctx.fillRect(x + kw - 1, y + 1, 0.5, kh - 3);
  } else {
    nineSlice(ctx, x, y, kw, kh, { style: 'gold', shadow: 0.28, studs: false });
  }
  text(ctx, R(x + kw / 2), y + 2, key, { size: 'sm', color: '#2a1c07', align: 'center', shadow: fine ? 'rgba(255,240,200,0.45)' : false });

  let w = kw;
  if (label) {
    text(ctx, x + kw + 3, y + 2, String(label), { size: 'sm', color: opts.color || COLORS.inkDim, shadow: true });
    w += 3 + measureGlyphs(label, 'sm');
  }
  ctx.globalAlpha = prev;
  return w;
}

/**
 * Horizontal rule: a gilt line that fades at both ends, with a centred
 * caption or (on a fine layer, when long enough) a fleuron at its heart.
 * opts: { color, label, size, labelColor, bg, ornament }
 */
function divider(ctx, x, y, w, opts = {}) {
  x = R(x); y = R(y); w = R(w);
  if (w <= 0) return y + 2;
  const fine = ctxRes(ctx) >= 2;
  const col = opts.color || COLORS.border;
  // A caption interrupts the rule rather than sitting on a patch of
  // background colour, which never quite matched the panel under it.
  let gap0 = 0, gap1 = 0;
  if (opts.label) {
    const lw = R(measureGlyphs(opts.label, opts.size || 'sm')) + 8;
    gap0 = R(x + (w - lw) / 2); gap1 = gap0 + lw;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x - 1, y - 4, gap0 - x + 1, 8);
    ctx.rect(gap1, y - 4, x + w - gap1 + 1, 8);
    ctx.clip();
  }
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.15, col);
  g.addColorStop(0.85, col);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  if (fine) {
    // a gilt hairline over a dark one: a rule scored into the page
    ctx.fillRect(x, y, w, 0.5);
    const g2 = ctx.createLinearGradient(x, 0, x + w, 0);
    g2.addColorStop(0, 'rgba(242,210,122,0)');
    g2.addColorStop(0.25, 'rgba(242,210,122,0.55)');
    g2.addColorStop(0.75, 'rgba(242,210,122,0.55)');
    g2.addColorStop(1, 'rgba(242,210,122,0)');
    ctx.fillStyle = g2;
    ctx.fillRect(x, y + 0.5, w, 0.5);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x + w * 0.1, y + 1, w * 0.8, 0.5);
  } else {
    ctx.fillRect(x, y, w, 1);
    ctx.fillStyle = 'rgba(255,235,190,0.10)';
    ctx.fillRect(x, y + 1, w, 1);
  }
  if (opts.label) {
    ctx.restore();
    text(ctx, R(x + w / 2), y - 3, opts.label, {
      size: opts.size || 'sm', color: opts.labelColor || COLORS.goldDim, align: 'center', shadow: true,
    });
    if (fine) {
      // small lozenges where the rule breaks for the caption
      for (const dx of [gap0 + 1, gap1 - 1.5]) {
        ctx.fillStyle = GILT.base; ctx.fillRect(dx, y - 0.5, 0.5, 1.5); ctx.fillRect(dx - 0.5, y, 1.5, 0.5);
      }
    }
  } else if (fine && (opts.ornament || w >= 60)) {
    const cx = x + w / 2;
    ctx.fillStyle = opts.bg || 'rgba(0,0,0,0)';
    fleuron(ctx, cx, y + 0.5, {});
  }
  return y + 2;
}

/**
 * UI.scrollbar — a groove with a gilt thumb. Used by `list`, exported for
 * panels that scroll their own content.
 */
function scrollbar(ctx, x, y, h, top, rows, n, opts = {}) {
  x = R(x); y = R(y); h = R(h);
  const barW = opts.w || 4;
  const fine = ctxRes(ctx) >= 2;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(x, y, barW, h);
  rectStroke(ctx, x, y, barW, h, 'rgba(0,0,0,0.8)', 1);
  if (fine) {
    ctx.fillStyle = 'rgba(255,236,200,0.08)';
    ctx.fillRect(x + barW - 1, y + 1, 0.5, h - 2);
  }
  // thumb: proportional, minimum 6px so it never vanishes on long lists
  const th = Math.max(6, Math.round((rows / Math.max(1, n)) * h));
  const maxTop = Math.max(1, n - rows);
  const ty = y + Math.round(((h - th) * clamp(top, 0, maxTop)) / maxTop);
  vgrad(ctx, x + 1, ty, barW - 2, th, COLORS.gold, COLORS.goldDim);
  ctx.fillStyle = COLORS.goldBright;
  ctx.fillRect(x + 1, ty, barW - 2, fine ? 0.5 : 1);
  if (fine) {
    ctx.fillStyle = GILT.lo; ctx.fillRect(x + 1, ty + th - 0.5, barW - 2, 0.5);
    // a grip notch in the middle of the thumb
    ctx.fillStyle = GILT.lo; ctx.fillRect(x + 1.5, ty + R(th / 2) - 0.5, barW - 3, 0.5);
    ctx.fillStyle = GILT.hi; ctx.fillRect(x + 1.5, ty + R(th / 2), barW - 3, 0.5);
  }
  // more-below / more-above chevrons
  if (top > 0) text(ctx, x + barW / 2, y - 6, '▲', { size: 'sm', color: COLORS.goldDim, align: 'center' });
  if (top + rows < n) text(ctx, x + barW / 2, y + h + 1, '▼', { size: 'sm', color: COLORS.goldDim, align: 'center' });
}

/**
 * UI.list — scrolling menu list with a window and scrollbar.
 * items: string | { label, icon, value, color, hint, disabled, sub }
 * opts:  { rows, rowH, top, size, t, cursor, scrollbar, empty, render, width }
 * Returns { top, rows, rowH, h } — persist `top` on the caller for smooth scroll.
 */
function list(ctx, x, y, w, items, index, opts = {}) {
  x = R(x); y = R(y); w = R(w);
  ctxRes(ctx);
  items = items || [];
  const rowH = opts.rowH || 12;
  const rows = Math.max(1, opts.rows || 6);
  const t = opts.t || 0;
  const n = items.length;

  // keep the cursor inside the window
  let top = opts.top | 0;
  if (index >= 0) {
    if (index < top) top = index;
    if (index > top + rows - 1) top = index - rows + 1;
  }
  top = clamp(top, 0, Math.max(0, n - rows));

  const h = rows * rowH;
  const showBar = opts.scrollbar !== false && n > rows;
  const barW = showBar ? 4 : 0;
  const rowW = w - barW - (showBar ? 2 : 0);

  if (opts.style) nineSlice(ctx, x - 2, y - 2, w + 4, h + 4, { style: opts.style });

  if (!n) {
    text(ctx, R(x + w / 2), y + Math.round(h / 2) - 3, opts.empty || '(nothing here)', {
      size: 'sm', color: COLORS.disabled, align: 'center', shadow: true,
    });
    return { top, rows, rowH, h };
  }

  pushClip(ctx, x - 1, y - 1, w + 2, h + 2);
  for (let i = 0; i < rows && top + i < n; i++) {
    const ix = top + i;
    const raw = items[ix];
    const it = typeof raw === 'string' ? { label: raw } : (raw || {});
    const ry = y + i * rowH;
    const sel = ix === index;
    const dis = !!it.disabled;

    if (sel) highlight(ctx, x, ry, rowW, rowH - 1, { alpha: dis ? 0.10 : 0.20 });
    if (opts.stripe && (ix & 1)) { ctx.fillStyle = 'rgba(255,255,255,0.03)'; ctx.fillRect(x, ry, rowW, rowH - 1); }

    if (typeof opts.render === 'function') {
      opts.render(ctx, it, ix, x, ry, rowW, rowH, sel);
    } else {
      let lx = x + (opts.cursor === false ? 3 : 9);
      if (it.icon) { icon(ctx, it.icon, lx, ry + Math.round((rowH - 9) / 2), 8, dis ? COLORS.disabled : it.iconColor || null); lx += 11; }
      // The row is split label-first: a refusal reason like
      // "✗ Kingdom of Many-Arrows 2" is 155px, and drawing it right-aligned
      // with no `maxWidth` used to leave the choice itself 20 characters of a
      // 294px row. The hint keeps at most 40% and is clamped to it.
      const avail = rowW - (lx - x) - 2;
      let hintW = 0;
      if (it.hint != null && it.hint !== '') {
        const hs = String(it.hint);
        const hw = Math.min(measureGlyphs(hs, 'sm'), Math.round(avail * 0.4));
        hintW = hw + 5;
        text(ctx, x + rowW - 3, ry + Math.round((rowH - 6) / 2), hs, {
          size: 'sm', color: dis ? COLORS.disabled : (it.hintColor || COLORS.inkDim), align: 'right', shadow: true,
          maxWidth: hw,
        });
      }
      const col = dis ? COLORS.disabled : (it.color || (sel ? COLORS.goldBright : COLORS.ink));
      text(ctx, lx, ry + Math.round((rowH - 6) / 2), String(it.label == null ? raw : it.label), {
        size: sel ? 'md' : 'sm', color: col, shadow: true, maxWidth: avail - hintW,
      });
    }
    if (sel && opts.cursor !== false && !dis) cursor(ctx, x + 1, ry + Math.round((rowH - 7) / 2), t);
  }
  popClip(ctx);

  if (showBar) scrollbar(ctx, x + w - barW, y, h, top, rows, n, { w: barW });

  return { top, rows, rowH, h };
}

/**
 * UI.tabs — a horizontal strip of bookmark tabs. tabs: string[] | {label, icon}[]
 * The active tab is a gilt bookmark standing a pixel proud of the rule; the
 * rest are leather. Returns the y of the content area's top edge.
 */
function tabs(ctx, x, y, w, tabList, index, opts = {}) {
  x = R(x); y = R(y); w = R(w);
  const fine = ctxRes(ctx) >= 2;
  const n = Math.max(1, (tabList || []).length);
  const h = opts.h || 13;
  const tw = Math.floor(w / n);
  for (let i = 0; i < n; i++) {
    const raw = tabList[i];
    const it = typeof raw === 'string' ? { label: raw } : (raw || {});
    const tx = x + i * tw;
    const cw = i === n - 1 ? w - tw * (n - 1) : tw;
    const on = i === index;
    nineSlice(ctx, tx, on ? y - 1 : y + 1, cw, on ? h + 1 : h - 1, {
      style: on ? 'gold' : 'dark', shadow: on ? 0.35 : 0.15, studs: false,
    });
    if (fine && on) {
      // the bookmark's foot runs into the rule below: no seam under the active tab
      ctx.fillStyle = PANEL_STYLES.gold.fill[1];
      ctx.fillRect(tx + 1, y + h - 0.5, cw - 2, 1);
    }
    let lx = tx + Math.round(cw / 2);
    let align = 'center';
    if (it.icon) {
      icon(ctx, it.icon, tx + 3, y + 2, 8, on ? '#3a2a08' : null);
      lx = tx + 13; align = 'left';
    }
    text(ctx, lx, y + (on ? 2 : 4), String(it.label == null ? raw : it.label), {
      size: on ? 'md' : 'sm', color: on ? inkFor('gold', 'title') : (it.disabled ? COLORS.disabled : COLORS.inkDim),
      align, shadow: on ? 'rgba(255,230,170,0.3)' : true, maxWidth: cw - (it.icon ? 16 : 6),
    });
    if (it.badge) {
      ctx.fillStyle = COLORS.bad;
      ctx.fillRect(tx + cw - 5, y + 1, 3, 3);
      if (fine) { ctx.fillStyle = '#ffb0a0'; ctx.fillRect(tx + cw - 5, y + 1, 1, 0.5); }
    }
  }
  // baseline that the active tab "sits on"
  ctx.fillStyle = COLORS.goldDim;
  ctx.fillRect(x, y + h, w, 1);
  if (fine) { ctx.fillStyle = GILT.hi; ctx.fillRect(x, y + h, w, 0.5); }
  return y + h + 1;
}

/**
 * UI.grid — slot grid for inventory / equipment / spell slots.
 * Returns the array of cell rects so callers can hit-test and draw contents.
 */
function grid(ctx, x, y, cols, rows, cell, opts = {}) {
  x = R(x); y = R(y);
  const gap = opts.gap == null ? 2 : opts.gap;
  const cw = opts.cellW || cell;
  const ch = opts.cellH || cell;
  const out = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const cx = x + c * (cw + gap);
      const cy = y + r * (ch + gap);
      const rect = { x: cx, y: cy, w: cw, h: ch, i, col: c, row: r };
      out.push(rect);
      const it = opts.items ? opts.items[i] : null;
      nineSlice(ctx, cx, cy, cw, ch, { style: opts.style || 'inset', shadow: 0 });
      if (typeof opts.drawCell === 'function') opts.drawCell(ctx, i, rect, it);
      else if (it) {
        if (it.icon) icon(ctx, it.icon, cx + Math.round((cw - 10) / 2), cy + Math.round((ch - 10) / 2), 10, it.tint || null);
        if (it.qty > 1) {
          text(ctx, cx + cw - 2, cy + ch - 8, String(it.qty), { size: 'sm', color: COLORS.ink, align: 'right', shadow: true });
        }
      }
      if (i === opts.index) frameSel(ctx, cx - 1, cy - 1, cw + 2, ch + 2, opts.t || 0);
    }
  }
  return out;
}

/**
 * UI.tooltip — an auto-sized dark panel, clamped inside the logical viewport.
 * opts: { title, w, size, color, icon, footer, anchor:'above'|'below'|'auto' }
 */
function tooltip(ctx, x, y, body, opts = {}) {
  const res = ctxRes(ctx);
  const maxW = opts.w || 132;
  const size = opts.size || 'sm';
  const lines = wrapLines(String(body == null ? '' : body), maxW - 10, size, undefined, res);
  const m = metrics(size, undefined, res);
  const titleH = opts.title ? 11 : 0;
  const footH = opts.footer ? 9 : 0;
  let widest = 0;
  for (const l of lines) widest = Math.max(widest, measureGlyphs(l, size, undefined, res));
  if (opts.title) widest = Math.max(widest, measureGlyphs(opts.title, 'md') + (opts.icon ? 11 : 0));
  if (opts.footer) widest = Math.max(widest, measureGlyphs(opts.footer, 'sm'));
  const w = Math.min(maxW, R(widest) + 10);
  const h = 8 + titleH + R(lines.length * m.lineH) + footH;

  // clamp so the tip never leaves the 400x240 logical screen
  const px = clamp(R(x), 2, VIEW_W - w - 2);
  let py = R(y);
  if (opts.anchor === 'above' || (opts.anchor !== 'below' && py + h > VIEW_H - 2)) py = R(y) - h - 4;
  py = clamp(py, 2, VIEW_H - h - 2);

  const p = nineSlice(ctx, px, py, w, h, { style: opts.style || 'dark', shadow: 0.5 });
  let ty = py + 4;
  if (opts.title) {
    let tx = px + 5;
    if (opts.icon) { icon(ctx, opts.icon, tx, ty - 1, 8, opts.iconColor || null); tx += 11; }
    text(ctx, tx, ty, opts.title, { size: 'md', color: opts.titleColor || COLORS.gold, shadow: true, maxWidth: w - (tx - px) - 4 });
    divider(ctx, px + 4, ty + 8, w - 8, { color: COLORS.goldDim });
    ty += titleH;
  }
  for (const l of lines) {
    text(ctx, px + 5, ty, l, { size, color: opts.color || COLORS.ink, shadow: true });
    ty += m.lineH;
  }
  if (opts.footer) {
    text(ctx, px + 5, ty, opts.footer, { size: 'sm', color: opts.footerColor || COLORS.inkDim, shadow: true });
  }
  return { x: px, y: py, w, h, inner: p };
}

/** A tiny coloured chip with a label — resistances, tags, damage types. */
function chip(ctx, x, y, label, opts = {}) {
  const fine = ctxRes(ctx) >= 2;
  const size = opts.size || 'sm';
  const pad = opts.icon ? 12 : 3;
  const w = R(measureGlyphs(label, size)) + pad + 3;
  const h = opts.h || 9;
  const col = opts.color || COLORS.inkDim;
  x = R(x); y = R(y);
  ctx.fillStyle = opts.bg || 'rgba(0,0,0,0.55)';
  ctx.fillRect(x, y, w, h);
  if (fine) {
    // a tag: coloured hairline, lit along the top, and a punched eyelet
    hairFrame(ctx, x, y, w, h, shade(col, -0.2), shade(col, -0.55));
    ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillRect(x - 0.5, y + 0.5, 0.5, h - 1);
    if (!opts.icon) { ctx.fillStyle = shade(col, -0.3); ctx.fillRect(x + 1, y + R(h / 2) - 0.5, 0.5, 1); }
  } else {
    rectStroke(ctx, x, y, w, h, shade(col, -0.4), 1);
  }
  if (opts.icon) icon(ctx, opts.icon, x + 1, y + Math.round((h - 8) / 2), 8, col);
  text(ctx, x + pad, y + Math.round((h - 6) / 2), label, { size, color: col, shadow: false });
  return w;
}

/**
 * UI.seal — a wax seal centred on (cx, cy): the mark of a finished contract,
 * a sworn oath, a company's charter. opts: { r, color, letter, icon }
 */
function seal(ctx, cx, cy, opts = {}) {
  const r = opts.r || 7;
  const fine = ctxRes(ctx) >= 2;
  const base = opts.color || '#a8281e';
  const rr = ramp(base, 5);
  const q = fine ? 0.5 : 1;
  // a blobby disc: the radius wobbles, the way wax spreads
  for (let yy = -r - 1; yy <= r + 1; yy += q) {
    for (let xx = -r - 1; xx <= r + 1; xx += q) {
      const a = Math.atan2(yy, xx);
      const rad = r + Math.sin(a * 5 + 1.3) * 0.6 + Math.sin(a * 3) * 0.4;
      const d = Math.hypot(xx, yy);
      if (d > rad) continue;
      let c = rr[2];
      if (d > rad - q) c = rr[0];
      else if (d > rad - 1.5 && Math.cos(a + 2.4) > 0.2) c = rr[3];
      else if (d < r * 0.62 && d > r * 0.62 - q) c = rr[1];
      else if (d < r * 0.62) c = Math.cos(a + 2.4) * d > r * 0.25 ? rr[3] : rr[2];
      ctx.fillStyle = c;
      ctx.fillRect(R((cx + xx) / q) * q, R((cy + yy) / q) * q, q, q);
    }
  }
  if (opts.icon) icon(ctx, opts.icon, R(cx - 4), R(cy - 4), 8, rr[4]);
  else if (opts.letter) {
    text(ctx, cx, cy - 4, String(opts.letter)[0].toUpperCase(), { size: 'title', color: rr[4], align: 'center', shadow: rr[0] });
  }
}

// ---------------------------------------------------------------------------
// 11. PORTRAITS
// ---------------------------------------------------------------------------

/**
 * UI.portrait — a framed bust for a Character.
 * Uses the character's sprite family if one is registered, otherwise paints a
 * procedural bust straight from ch.colorway. Never throws on a missing sprite.
 */
function portrait(ctx, ch, x, y, size = 32, opts = {}) {
  x = R(x); y = R(y); size = R(size);
  const style = opts.style || (ch && ch.side === 'foe' ? 'danger' : 'window');
  const f = nineSlice(ctx, x, y, size, size, { style, shadow: opts.shadow != null ? opts.shadow : 0.35, studs: size >= 30 ? undefined : false });
  const ix = f.ix + 1, iy = f.iy + 1;
  const iw = Math.max(1, f.iw - 2), ih = Math.max(1, f.ih - 2);

  // backdrop wash keyed to the character's main colour
  const cw = (ch && ch.colorway) || null;
  const back = (cw && cw.MAIN) ? shade(cw.MAIN, -0.62) : '#12141d';
  vgrad(ctx, ix, iy, iw, ih, shade(back, 0.18), shade(back, -0.25));

  pushClip(ctx, ix, iy, iw, ih);
  let drew = false;
  // A person gets the painted bust (render/portrait.js); a creature its sprite.
  const paint = portraitPainter();
  if (paint && ch) {
    try { drew = paint(ctx, ch, ix, iy, iw, { h: ih, tint: opts.tint, tintAmt: opts.tintAmt }) === true; } catch (e) { drew = false; }
  }
  const fam = ch && (ch.sprite || ch.spriteName);
  if (fam && !drew) {
    try {
      if (hasSprite(fam)) {
        // Sprites are 16x24 with the head in rows ~1..13; blow that band up to
        // fill the frame and clip the rest away.
        const s = Math.max(1, Math.round(ih / 13));
        const dx = ix + Math.round((iw - 16 * s) / 2);
        const dy = iy - Math.round(1 * s);
        drew = drawSprite(ctx, fam, opts.frame || 'down-0', dx, dy, {
          anchor: 'topleft', scale: s, colorway: cw || undefined,
          tint: opts.tint, tintAmt: opts.tintAmt,
        });
      }
    } catch (e) { drew = false; }   // a broken sprite must never kill the frame
  }
  if (!drew) fallbackBust(ctx, ch, ix, iy, iw, ih, cw);

  // downed / dead overlays
  if (ch && (ch.hp != null) && ch.hp <= 0) {
    ctx.fillStyle = 'rgba(120,10,10,0.34)';
    ctx.fillRect(ix, iy, iw, ih);
    icon(ctx, 'skull', ix + Math.round((iw - 10) / 2), iy + Math.round((ih - 10) / 2), 10, '#e8dcc0');
  } else if (opts.dim) {
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.fillRect(ix, iy, iw, ih);
  }
  popClip(ctx);

  if (opts.selected) frameSel(ctx, x - 1, y - 1, size + 2, size + 2, opts.t || 0);
  if (opts.label) {
    text(ctx, x + size / 2, y + size + 1, String(opts.label), {
      size: 'sm', color: COLORS.ink, align: 'center', shadow: true, maxWidth: size + 8,
    });
  }
  return { x, y, w: size, h: size, ix, iy, iw, ih };
}

/** Procedural bust: shoulders, neck, head, hair, eyes — all from the colorway. */
function fallbackBust(ctx, ch, ix, iy, iw, ih, cw) {
  const skin = (cw && cw.SKIN) || '#e0a878';
  const skinD = (cw && cw.SKIN_D) || shade(skin, -0.26);
  const hair = (cw && cw.HAIR) || '#3a2416';
  const hairD = (cw && cw.HAIR_D) || shade(hair, -0.32);
  const main = (cw && cw.MAIN) || '#7a3030';
  const mainD = (cw && cw.MAIN_D) || shade(main, -0.30);
  const eye = (cw && cw.EYE) || '#37527a';
  const outline = (cw && cw.OUTLINE) || '#170f0c';

  const u = Math.max(1, Math.floor(ih / 16));          // one "sprite pixel"
  const cx = ix + Math.round(iw / 2);
  const headW = u * 8, headH = u * 8;
  const hx = cx - Math.round(headW / 2);
  const hy = iy + u * 2;

  // shoulders / torso
  const shW = u * 14, shH = ih - (hy - iy) - headH;
  if (shH > 0) {
    ctx.fillStyle = outline;
    ctx.fillRect(cx - Math.round(shW / 2) - u, hy + headH, shW + u * 2, shH);
    vgrad(ctx, cx - Math.round(shW / 2), hy + headH, shW, shH, main, mainD);
    ctx.fillStyle = (cw && cw.TRIM) || '#e3b34a';
    ctx.fillRect(cx - u, hy + headH, u * 2, shH);       // collar seam
  }
  // neck
  ctx.fillStyle = skinD;
  ctx.fillRect(cx - u, hy + headH - u, u * 2, u * 2);
  // head
  ctx.fillStyle = outline;
  ctx.fillRect(hx - u, hy - u, headW + u * 2, headH + u * 2);
  vgrad(ctx, hx, hy, headW, headH, skin, skinD);
  // hair cap + sideburns
  ctx.fillStyle = hair;
  ctx.fillRect(hx, hy, headW, u * 2);
  ctx.fillRect(hx - u, hy, u, u * 4);
  ctx.fillRect(hx + headW, hy, u, u * 4);
  ctx.fillStyle = hairD;
  ctx.fillRect(hx, hy + u * 2, headW, u);
  // eyes
  ctx.fillStyle = eye;
  ctx.fillRect(hx + u, hy + u * 4, u, u);
  ctx.fillRect(hx + headW - u * 2, hy + u * 4, u, u);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(hx, hy + headH - u, headW, u);           // chin shade

  if (!ch) {
    // unknown character: stamp a question mark over the silhouette
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(ix, iy, iw, ih);
    text(ctx, ix + iw / 2, iy + Math.round(ih / 2) - 4, '?', { size: 'lg', color: COLORS.inkDim, align: 'center' });
  }
}

// ---------------------------------------------------------------------------
// 12. THE d20 POPUP
// ---------------------------------------------------------------------------

const TUMBLE_TIME = 0.35;    // seconds of spinning before the face locks
const POP_TIME = 0.12;       // squash-and-stretch after the lock
const STAMP_DELAY = 0.18;    // pause before HIT / MISS slams down

/** The die body: a flat-topped icosahedron silhouette, 15x15 at scale 1. */
function drawD20Body(ctx, cx, cy, s, faceCol, edgeCol, darkCol) {
  // Every vertex is rounded to a whole pixel and strokes sit on .5 boundaries,
  // so the die stays as crisp as the rest of the UI.
  const half = R(7 * s);
  const sh = R(half * 0.45);   // shoulder height of the hexagonal silhouette
  const ft = R(half * 0.72);   // top vertex of the lit face triangle
  const fb = R(half * 0.50);   // bottom edge of the lit face triangle
  const P = (px, py) => ctx.lineTo(R(px), R(py));

  ctx.fillStyle = darkCol;
  ctx.beginPath();
  ctx.moveTo(cx, cy - half);
  P(cx + half, cy - sh); P(cx + half, cy + sh); P(cx, cy + half);
  P(cx - half, cy + sh); P(cx - half, cy - sh);
  ctx.closePath();
  ctx.fill();

  // inner triangle — the numbered face pointing up at the reader
  ctx.fillStyle = faceCol;
  ctx.beginPath();
  ctx.moveTo(cx, cy - ft);
  P(cx + ft, cy + fb); P(cx - ft, cy + fb);
  ctx.closePath();
  ctx.fill();

  // three facet seams radiating from the face's corners to the silhouette
  ctx.strokeStyle = edgeCol;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx + 0.5, cy - half); ctx.lineTo(cx + 0.5, cy - ft);
  ctx.moveTo(cx - half + 0.5, cy - sh + 0.5); ctx.lineTo(cx - ft + 0.5, cy + fb + 0.5);
  ctx.moveTo(cx + half - 0.5, cy - sh + 0.5); ctx.lineTo(cx + ft - 0.5, cy + fb + 0.5);
  ctx.stroke();
}

/**
 * UI.diceRoll — the big animated d20 popup shown on every attack roll.
 *
 * `result` accepts a core/dice.js d20() object, optionally decorated by
 * rules/actions.js: { natural, total, mod, crit, fumble, adv, dis, ac, dc, hit,
 *                     label, damage }
 * `t` is seconds since the roll began.
 *
 * Phase 1 (t < 0.35s) the die tumbles through pseudo-random faces; then it locks
 * to `natural` with a pop. A natural 20 glows gold and throws sparks; a natural 1
 * turns red and cracks. The readout is the full arithmetic — "d20 17 +5 = 22 vs
 * AC 15" — because seeing the maths is half the fun of D&D.
 */
function diceRoll(ctx, x, y, result, t = 0) {
  if (!result) return;
  const res = ctxRes(ctx);
  const nat = result.natural != null ? result.natural
    : (Array.isArray(result.rolls) ? result.rolls[0] : result.total) || 1;
  const mod = result.mod || 0;
  const total = result.total != null ? result.total : nat + mod;
  const target = result.ac != null ? result.ac : (result.dc != null ? result.dc : null);
  const targetLabel = result.ac != null ? 'AC' : 'DC';

  const tumbling = t < TUMBLE_TIME;
  // Deterministic tumble faces: hash the frame index so replays look identical.
  const step = Math.floor(t * 26);
  const face = tumbling ? (hashStr(`d20:${nat}:${step}`) % 20) + 1 : nat;

  const crit = !tumbling && (result.crit || nat === 20);
  const fumble = !tumbling && (result.fumble || nat === 1);

  // pop scale: overshoot on lock, settle back to 1
  const since = t - TUMBLE_TIME;
  let s = 1;
  if (tumbling) s = 1 + Math.sin(t * 40) * 0.05;
  else if (since < POP_TIME) s = 1 + (1 - since / POP_TIME) * 0.35;

  const jitter = tumbling ? [(hashStr(`jx${step}`) % 5) - 2, (hashStr(`jy${step}`) % 5) - 2] : [0, 0];
  const cx = R(x) + jitter[0];
  const cy = R(y) + jitter[1];
  const scale = 2 * s;   // the die is authored at ~15px, drawn around 30px

  ctx.save();

  // --- glow / aura ---------------------------------------------------------
  if (crit) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 12);
    const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, 26 + pulse * 6);
    g.addColorStop(0, 'rgba(255,220,120,0.55)');
    g.addColorStop(1, 'rgba(255,180,60,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - 34, cy - 34, 68, 68);
  } else if (fumble) {
    const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, 24);
    g.addColorStop(0, 'rgba(210,50,40,0.50)');
    g.addColorStop(1, 'rgba(160,20,20,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - 30, cy - 30, 60, 60);
  } else if (result.backdrop !== false) {
    // A caller that sets the die in its own medallion asks for no square.
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.fillRect(cx - 20, cy - 20, 40, 40);
  }

  // --- die body ------------------------------------------------------------
  const faceCol = crit ? '#f3d789' : fumble ? '#b8352a' : '#e2dbca';
  const edgeCol = crit ? '#8a6410' : fumble ? '#4a0f0b' : '#6d6656';
  const darkCol = crit ? '#c99a2c' : fumble ? '#7a1a14' : '#a9a08c';
  drawD20Body(ctx, cx, cy, scale, faceCol, edgeCol, darkCol);

  // number on the face
  const numCol = crit ? '#3a2607' : fumble ? '#ffe0d8' : '#221d16';
  text(ctx, cx, cy - 6, String(face), { size: 'lg', color: numCol, align: 'center', shadow: false });

  // advantage / disadvantage marker under the die
  if (result.adv || result.dis) {
    const advCol = result.adv ? COLORS.good : COLORS.bad;
    const advTxt = result.adv ? 'ADV' : 'DIS';
    text(ctx, cx, cy + 12, advTxt, { size: 'sm', color: advCol, align: 'center', shadow: true });
  }

  // --- nat 20 sparks / nat 1 cracks ---------------------------------------
  if (crit) {
    const k = Math.min(1, since / 0.4);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + t * 2;
      const r0 = 14 + k * 12;
      const r1 = r0 + 4 + Math.sin(t * 20 + i) * 2;
      ctx.strokeStyle = i % 2 ? '#fff0b8' : COLORS.gold;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(R(cx + Math.cos(a) * r0), R(cy + Math.sin(a) * r0));
      ctx.lineTo(R(cx + Math.cos(a) * r1), R(cy + Math.sin(a) * r1));
      ctx.stroke();
    }
  } else if (fumble) {
    ctx.strokeStyle = '#2a0806';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 8, cy - 6); ctx.lineTo(cx - 2, cy + 1); ctx.lineTo(cx + 3, cy - 3); ctx.lineTo(cx + 9, cy + 6);
    ctx.moveTo(cx - 2, cy + 1); ctx.lineTo(cx - 5, cy + 8);
    ctx.stroke();
  }

  // --- the arithmetic readout ---------------------------------------------
  if (!tumbling) {
    const parts = [`d20 ${nat}`];
    if (mod) parts.push(`${mod >= 0 ? '+' : '−'}${Math.abs(mod)}`);
    let line = `${parts.join(' ')} = ${total}`;
    if (target != null) line += `  vs ${targetLabel} ${target}`;
    const lw = measureGlyphs(line, 'sm', undefined, res);
    const by = cy + 20;
    nineSlice(ctx, R(cx - lw / 2) - 5, by - 2, R(lw) + 10, 11, { style: 'dark', shadow: 0.4, studs: false });
    text(ctx, cx, by + 1, line, { size: 'sm', color: crit ? COLORS.goldBright : fumble ? '#f0a898' : COLORS.ink, align: 'center', shadow: true });

    // --- HIT / MISS / CRITICAL stamp ---------------------------------------
    if (since > STAMP_DELAY) {
      const st = since - STAMP_DELAY;
      const ss = st < 0.14 ? 3 - (st / 0.14) * 2 : 1;      // slams down from 3x
      let word = null; let wc = COLORS.ink;
      if (result.label) { word = String(result.label).toUpperCase(); wc = result.labelColor || COLORS.gold; }
      else if (crit) { word = 'CRITICAL'; wc = COLORS.goldBright; }
      else if (fumble) { word = 'FUMBLE'; wc = '#ff7a60'; }
      else if (result.hit === true) { word = 'HIT'; wc = COLORS.good; }
      else if (result.hit === false) { word = 'MISS'; wc = COLORS.inkDim; }
      if (word) {
        const sc = Math.max(1, Math.round(ss * 2));
        const m = metrics(sc, 1);
        const ww = lineWidth(word, m);
        const sy = cy - 26;
        drawRun(ctx, word, R(cx - ww / 2) + 1, sy + 1, m, 'rgba(0,0,0,0.75)', 1);
        drawRun(ctx, word, R(cx - ww / 2), sy, m, wc, 1);
      }
    }
  }

  ctx.restore();
}

// ---------------------------------------------------------------------------
// 13. MISC OVERLAYS
// ---------------------------------------------------------------------------

/** Full-screen dim, for modal scenes stacked over the overworld. */
function scrim(ctx, alpha = 0.55, color = '#05060c') {
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * alpha;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.globalAlpha = prev;
}

/** A framed message box across the bottom of the screen (dialogue, prompts). */
function messageBox(ctx, str, opts = {}) {
  const h = opts.h || 58;
  const x = opts.x != null ? opts.x : 6;
  const y = opts.y != null ? opts.y : VIEW_H - h - 6;
  const w = opts.w != null ? opts.w : VIEW_W - 12;
  const p = panel(ctx, x, y, w, h, { style: opts.style || 'window' });
  if (opts.speaker) {
    const sw = R(measureGlyphs(opts.speaker, 'md')) + 10;
    nineSlice(ctx, x + 5, y - 5, sw, 12, { style: 'gold', shadow: 0.3, studs: false });
    text(ctx, x + 10, y - 2, opts.speaker, { size: 'md', color: '#2a1c07', shadow: false });
  }
  if (str) textWrapped(ctx, p.ix + 5, p.iy + 5, p.iw - 10, str, { size: opts.size || 'sm', color: p.ink });
  return p;
}

/** A blinking "press to continue" caret in the corner of a message box. */
function advanceCaret(ctx, x, y, t) {
  if (Math.sin(t * 8) < 0) return;
  const bob = Math.round(Math.sin(t * 8) * 1);
  text(ctx, R(x), R(y) + bob, '▼', { size: 'sm', color: COLORS.gold, shadow: true });
}

// ---------------------------------------------------------------------------
// 14. EXPORT
// ---------------------------------------------------------------------------

export const UI = {
  // font / text
  FONT,
  GLYPH_W,
  GLYPH_H,
  G,
  SIZES,
  FACES,
  drawGlyphs,
  text,
  shadowText,
  textWrapped,
  heading,
  initial,
  measure: measureGlyphs,
  wrapLines,
  fit: fitText,
  lineHeight: (size) => metrics(size).lineH,
  metrics,
  fineReady,

  // two-column rows: allocate the width, then draw it
  splitRow,
  kvRow,
  inkFor,

  // surfaces
  panel,
  window: window_,
  nineSlice,
  ribbon,
  divider,
  scrim,
  messageBox,
  advanceCaret,
  seal,

  // themes
  setTheme,
  get theme() { return themeId; },
  THEMES: THEME_IDS,
  themeName: (id) => (THEMES[id] || THEMES.folio).name,

  // meters
  bar,
  gauge,
  pips,
  pct,

  // selection
  cursor,
  frameSel,
  highlight,

  // widgets
  icon,
  iconNames: ICON_NAMES,
  button,
  list,
  tabs,
  grid,
  tooltip,
  chip,
  keyHint,
  scrollbar,

  // characters
  portrait,
  diceRoll,

  // plumbing
  pushClip,
  popClip,
  clipDepth,
  resetClips,
  rectStroke,
  vgrad,
  clearCache: clearUICache,

  // palette
  COLORS,
  DAMAGE_COLORS,
  RARITY_COLORS,
  DAMAGE_ICONS,
  PANEL_STYLES,
  PANEL_INK,
  shade,
  shadeHex,
};

export { COLORS, DAMAGE_COLORS, RARITY_COLORS, DAMAGE_ICONS, ICON_NAMES, PANEL_STYLES, PANEL_INK, SIZES, THEME_IDS };
export default UI;
