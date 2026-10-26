// ui/ornament.js — the illuminator's toolbox: fine-grid stamps, rivets, fleurons, vines, vellum/wood/iron grain, frames.
//
// Everything here is plain canvas drawing with no dependency on the kit, so
// ui/kit.js (and the HUD, directly) can build on it without an import cycle.
//
// The fine grid. The display is 800x480 and UI layers draw in LOGICAL px
// (400x240) through a 2x base transform, so one logical px is 2x2 device
// pixels and half a logical px is a real, crisp pixel. `resOf(ctx)` tells a
// caller which world it is in: 2 on a fine layer (hairlines, jewels and
// grain can be drawn at half-pixel size), 1 on a plain 1x layer (the same
// ornament, drawn at the logical grid). Every ornament has both forms, so
// nothing ever lands between pixels and blurs.

import { makeRNG } from '../core/rng.js';

/** 2 when `ctx` draws logical px through a >= 2x transform (a fine layer), else 1. */
export function resOf(ctx) {
  if (!ctx || typeof ctx.getTransform !== 'function') return 1;
  const t = ctx.getTransform();
  return Math.abs(t.a) >= 1.99 || Math.abs(t.b) >= 1.99 ? 2 : 1;
}

/** Create an offscreen canvas (DOM canvas where available so it works in every browser). */
export function makeCanvas(w, h) {
  w = Math.max(1, w | 0); h = Math.max(1, h | 0);
  if (typeof document !== 'undefined' && document.createElement) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  /* eslint-disable-next-line no-undef */
  return new OffscreenCanvas(w, h);
}

// ---------------------------------------------------------------------------
// Stamps — tiny palette bitmaps baked once, blitted at fine or logical size
// ---------------------------------------------------------------------------

const stampCache = new Map();

/**
 * Bake `rows` (strings of palette keys, '.' clear) with palette `pal` into a
 * canvas, once. `id` + the palette identify it in the cache.
 */
function stampCanvas(id, rows, pal) {
  const key = id + '|' + Object.values(pal).join(',');
  let cv = stampCache.get(key);
  if (cv) return cv;
  const w = rows.reduce((m, r) => Math.max(m, r.length), 0), h = rows.length;
  cv = makeCanvas(w, h);
  const c = cv.getContext('2d');
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = rows[y][x];
      if (!k || k === '.' || !pal[k]) continue;
      c.fillStyle = pal[k];
      c.fillRect(x, y, 1, 1);
    }
  }
  if (stampCache.size > 400) stampCache.delete(stampCache.keys().next().value);
  stampCache.set(key, cv);
  return cv;
}

/**
 * Draw a stamp with its top-left at logical (x, y). `px` is the size of one
 * stamp pixel in logical px (0.5 = fine). Positions snap to that grid.
 */
export function stamp(ctx, id, rows, pal, x, y, px = 1) {
  const cv = stampCanvas(id, rows, pal);
  const s = 1 / px;
  const dx = Math.round(x * s) / s, dy = Math.round(y * s) / s;
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(cv, dx, dy, cv.width * px, cv.height * px);
  ctx.imageSmoothingEnabled = prev;
  return { w: cv.width * px, h: cv.height * px };
}

// ---------------------------------------------------------------------------
// Gilt — the one gold everything shares (ramps agree with render/palette.js RAMPS.gold)
// ---------------------------------------------------------------------------

export const GILT = Object.freeze({
  key: '#1a0f06', lo: '#7a5418', mid: '#b8862e', base: '#d9a83e', hi: '#f2d27a', spec: '#fff4c8',
});
export const RUBRIC = Object.freeze({ lo: '#5a1410', base: '#a8281e', hi: '#d8503a' });
export const LAPIS = Object.freeze({ lo: '#141c44', base: '#28408a', hi: '#4a6cc4' });
export const VERDIGRIS = Object.freeze({ lo: '#16382e', base: '#2e6a52', hi: '#5aa482' });

// ---------------------------------------------------------------------------
// Rivets, bosses and fleurons
// ---------------------------------------------------------------------------

const RIVET_FINE = ['.kk.', 'khmk', 'kmlk', '.kk.'];
const RIVET_COARSE = ['hm', 'ml'];

/** A domed rivet centred on logical (cx, cy). opts: { hi, mid, lo, key } */
export function rivet(ctx, cx, cy, opts = {}) {
  const pal = { k: opts.key || '#0a0806', h: opts.hi || '#e8d6a8', m: opts.mid || '#a88b58', l: opts.lo || '#4a3a22' };
  if (resOf(ctx) >= 2) stamp(ctx, 'rivet', RIVET_FINE, pal, cx - 1, cy - 1, 0.5);
  else stamp(ctx, 'rivet1', RIVET_COARSE, pal, Math.round(cx - 1), Math.round(cy - 1), 1);
}

// A lozenge boss with a red jewel: the corner piece of a bound book.
const BOSS_FINE = [
  '....k....',
  '...khk...',
  '..khGgk..',
  '.khGrGgk.',
  'khGrwrGgk',
  '.kGGrGgk.',
  '..kGGgk..',
  '...kgk...',
  '....k....',
];
const BOSS_COARSE = ['.k.', 'kGk', '.k.'];

// A four-petal fleuron (quatrefoil) for dividers and the middle of long rules.
const FLEURON_FINE = [
  '...kkk...',
  '..khGgk..',
  '.kkhGgkk.',
  'khGkrkGgk',
  'kGGrwrGgk',
  'kgGkrkggk',
  '.kkGggkk.',
  '..kGggk..',
  '...kkk...',
];
const FLEURON_COARSE = ['.G.', 'GrG', '.G.'];

function giltPal(o = {}) {
  return {
    k: o.key || GILT.key, h: o.hi || GILT.hi, G: o.base || GILT.base, g: o.lo || GILT.lo,
    r: o.jewel || RUBRIC.base, w: o.glint || '#f0a890',
  };
}

/** A corner boss (lozenge with a jewel) centred on logical (cx, cy). */
export function boss(ctx, cx, cy, opts = {}) {
  const pal = giltPal(opts);
  if (resOf(ctx) >= 2) stamp(ctx, 'boss', BOSS_FINE, pal, cx - 2.25, cy - 2.25, 0.5);
  else stamp(ctx, 'boss1', BOSS_COARSE, pal, Math.round(cx) - 1, Math.round(cy) - 1, 1);
}

/** A quatrefoil fleuron centred on logical (cx, cy). */
export function fleuron(ctx, cx, cy, opts = {}) {
  const pal = giltPal(opts);
  if (resOf(ctx) >= 2) stamp(ctx, 'fleuron', FLEURON_FINE, pal, cx - 2.25, cy - 2.25, 0.5);
  else stamp(ctx, 'fleuron1', FLEURON_COARSE, pal, Math.round(cx) - 1, Math.round(cy) - 1, 1);
}

// A book's gilt corner-piece: a triangular plate over the corner of the
// binding with a scalloped inner edge and a jewel. Authored for the top-left
// corner; the other three are mirrors.
const CORNER_FINE = [
  'kkkkkkkkkkkk',
  'khhhhhhhhhk.',
  'khGGGGGGgk..',
  'khGGGGGgk...',
  'khGGrrgkk...',
  'khGGrwgk....',
  'khGgggk.....',
  'khGgkk......',
  'khgk........',
  'khk.........',
  'kk..........',
  'k...........',
];
const CORNER_COARSE = ['kkkk', 'kGGk', 'kGk.', 'kk..'];

// A brass L-strap with two rivets, for the corners of a timber board.
const BRACKET_FINE = [
  'kkkkkkkkkkkk',
  'khhhhhhhhhmk',
  'khmmmmmmmmlk',
  'khmrrmlllllk',
  'khmrrlkkkkkk',
  'khmmlk......',
  'khmllk......',
  'khmllk......',
  'khmrrk......',
  'khmrrk......',
  'kmlllk......',
  'kkkkkk......',
];
const BRACKET_COARSE = ['kkkk', 'kmmk', 'kmkk', 'kkk.'];

function mirror(rows, fx, fy) {
  let out = rows;
  if (fy) out = out.slice().reverse();
  if (fx) out = out.map((r) => r.split('').reverse().join(''));
  return out;
}

/**
 * Four corner pieces on the rect (x, y, w, h). kind: 'gilt' (corner plates
 * with a jewel) or 'brass' (riveted L-straps). opts: { jewel }
 * The fine plate spans 6 logical px along each edge; the 1x one 4.
 */
export function corners(ctx, x, y, w, h, kind = 'gilt', opts = {}) {
  const fine = resOf(ctx) >= 2;
  const brass = kind === 'brass';
  const rows0 = brass ? (fine ? BRACKET_FINE : BRACKET_COARSE) : (fine ? CORNER_FINE : CORNER_COARSE);
  const pal = brass
    ? { k: '#140c04', h: '#fff0c0', m: '#c8a060', l: '#6a4a20', r: '#f4dca0' }
    : { k: GILT.key, h: GILT.hi, G: GILT.base, g: GILT.lo, r: opts.jewel || RUBRIC.base, w: '#ffd0b8' };
  const px = fine ? 0.5 : 1;
  const s = rows0.length * px;
  for (const [fx, fy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const rows = mirror(rows0, fx, fy);
    stamp(ctx, `${kind}${fine}${fx}${fy}${pal.r}`, rows, pal, fx ? x + w - s : x, fy ? y + h - s : y, px);
  }
}

/**
 * Deckle the edge of a sheet: the ragged, fibrous border of hand-made
 * parchment. A few pale fibres stand out past the edge and a few bites are
 * taken out of it, placed by a hash of their position so they never crawl.
 * Fine layers only — at 1x a deckle is just noise.
 */
export function deckle(ctx, x, y, w, h, pale, dark) {
  if (resOf(ctx) < 2) return;
  const hit = (i, salt) => ((Math.imul(i * 73856093 ^ salt * 19349663, 0x9e3779b1) >>> 0) % 100);
  for (let i = 2; i < w * 2 - 2; i++) {
    const fx = x + i * 0.5;
    const a = hit(i, 1), b = hit(i, 2);
    ctx.fillStyle = pale;
    if (a < 14) ctx.fillRect(fx, y - 0.5, 0.5, 0.5);
    if (b < 14) ctx.fillRect(fx, y + h, 0.5, 0.5);
    ctx.fillStyle = dark;
    if (a > 90) ctx.fillRect(fx, y + 0.5, 0.5, 0.5);
    if (b > 90) ctx.fillRect(fx, y + h - 1, 0.5, 0.5);
  }
  for (let i = 2; i < h * 2 - 2; i++) {
    const fy = y + i * 0.5;
    const a = hit(i, 3), b = hit(i, 4);
    ctx.fillStyle = pale;
    if (a < 14) ctx.fillRect(x - 0.5, fy, 0.5, 0.5);
    if (b < 14) ctx.fillRect(x + w, fy, 0.5, 0.5);
    ctx.fillStyle = dark;
    if (a > 90) ctx.fillRect(x + 0.5, fy, 0.5, 0.5);
    if (b > 90) ctx.fillRect(x + w - 1, fy, 0.5, 0.5);
  }
}

// ---------------------------------------------------------------------------
// Vines — the tendrils an illuminator runs out of an initial into the margin
// ---------------------------------------------------------------------------

// A gilt stem that hangs from its root (top-left) down the margin, throwing
// verdigris leaves to either side and ending in a curl.
const VINE_FINE = [
  '.ss.........',
  '..s...LL....',
  '..s..LlLL...',
  '..ss..LL....',
  '...s........',
  '..LLs.......',
  '.LlL.s......',
  '..LL.s......',
  '.....s..LL..',
  '....s..LlLL.',
  '...s....LL..',
  '...s........',
  '....ss......',
  '......s.....',
  '...ss.s.....',
  '..s..s......',
  '...ss.......',
];
const VINE_COARSE = ['s..', '.sL', '.s.', 'Ls.', '.s.', 'ss.'];

/**
 * A tendril with leaves, hanging from logical (x, y) down the margin.
 * `dir` -1 mirrors it to hang to the left. opts: { stem, leaf, leafHi }
 */
export function vine(ctx, x, y, dir = 1, opts = {}) {
  const pal = { s: opts.stem || GILT.base, L: opts.leaf || VERDIGRIS.base, l: opts.leafHi || VERDIGRIS.hi };
  const fine = resOf(ctx) >= 2;
  let rows = fine ? VINE_FINE : VINE_COARSE;
  if (dir < 0) rows = mirror(rows, 1, 0);
  const px = fine ? 0.5 : 1;
  const w = rows[0].length * px;
  stamp(ctx, (dir < 0 ? 'vineL' : 'vineR') + fine, rows, pal, dir < 0 ? x - w : x, y, px);
}

// ---------------------------------------------------------------------------
// Grain — vellum mottle, wood grain, brushed iron (baked tiles, pattern-filled)
// ---------------------------------------------------------------------------

const tileCache = new Map();

/** A 64x64 grain tile, baked once per kind. Values are light/dark specks at low alpha. */
function grainTile(kind) {
  let cv = tileCache.get(kind);
  if (cv) return cv;
  const N = 64;
  cv = makeCanvas(N, N);
  const c = cv.getContext('2d');
  const r = makeRNG('ornament-grain-' + kind);
  if (kind === 'vellum') {
    // Soft mottling: a few broad pale clouds and darker flecks, the way
    // calfskin takes ink unevenly. Kept faint: text sits on this.
    for (let i = 0; i < 26; i++) {
      const x = r.int(0, N - 1), y = r.int(0, N - 1), s = r.int(3, 9);
      c.fillStyle = `rgba(255,236,196,${0.018 + r.next() * 0.02})`;
      for (let k = 0; k < s * 3; k++) c.fillRect((x + r.int(-s, s) + N) % N, (y + r.int(-s, s) + N) % N, r.int(1, 3), 1);
    }
    for (let i = 0; i < 70; i++) {
      c.fillStyle = `rgba(0,0,0,${0.05 + r.next() * 0.07})`;
      c.fillRect(r.int(0, N - 1), r.int(0, N - 1), 1, 1);
    }
    for (let i = 0; i < 5; i++) {
      // a hair-fine fibre
      let x = r.int(0, N - 1), y = r.int(0, N - 1);
      c.fillStyle = 'rgba(255,236,196,0.035)';
      for (let k = 0; k < 9; k++) { c.fillRect(x % N, y % N, 1, 1); x += 1; if (r.next() < 0.4) y += 1; }
    }
  } else if (kind === 'wood') {
    // Long horizontal grain lines with the odd knot, lit from the upper left.
    for (let y = 0; y < N; y++) {
      const a = 0.03 + 0.05 * Math.abs(Math.sin(y * 0.9 + Math.sin(y * 0.23) * 2));
      c.fillStyle = `rgba(0,0,0,${a.toFixed(3)})`;
      let x = r.int(0, N - 1);
      const len = r.int(18, 48);
      for (let k = 0; k < len; k++) c.fillRect((x + k) % N, y, 1, 1);
      if (r.next() < 0.25) { c.fillStyle = 'rgba(255,220,170,0.05)'; x = r.int(0, N - 1); c.fillRect(x, y, r.int(6, 20), 1); }
    }
    const kx = r.int(8, 56), ky = r.int(8, 56);
    c.fillStyle = 'rgba(0,0,0,0.16)';
    c.fillRect(kx, ky, 3, 1); c.fillRect(kx - 1, ky + 1, 5, 1); c.fillRect(kx, ky + 2, 3, 1);
  } else if (kind === 'iron') {
    // Brushed, pitted plate: faint horizontal streaks and a few pits.
    for (let y = 0; y < N; y++) {
      c.fillStyle = `rgba(255,255,255,${(0.01 + r.next() * 0.025).toFixed(3)})`;
      c.fillRect(r.int(0, N - 1), y, r.int(10, 40), 1);
    }
    for (let i = 0; i < 40; i++) { c.fillStyle = `rgba(0,0,0,${0.12 + r.next() * 0.12})`; c.fillRect(r.int(0, N - 1), r.int(0, N - 1), 1, 1); }
  } else if (kind === 'cloth') {
    // A woven twill for banners: diagonal ribs.
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if ((x + y) % 4 === 0) { c.fillStyle = 'rgba(0,0,0,0.10)'; c.fillRect(x, y, 1, 1); }
      else if ((x + y) % 4 === 2 && r.next() < 0.5) { c.fillStyle = 'rgba(255,255,255,0.04)'; c.fillRect(x, y, 1, 1); }
    }
  }
  tileCache.set(kind, cv);
  return cv;
}

/**
 * Fill a logical rect with grain of `kind` ('vellum' | 'wood' | 'iron' | 'cloth').
 * On a fine layer one tile pixel is one device pixel; on 1x it is one logical px.
 */
const patternCache = new Map();

export function grain(ctx, kind, x, y, w, h, alpha = 1) {
  if (w <= 0 || h <= 0 || typeof ctx.createPattern !== 'function') return;
  const res = resOf(ctx);
  // One pattern per kind and grid, made once: panels ask for grain every frame.
  const key = kind + res;
  let pat = patternCache.get(key);
  if (pat === undefined) {
    pat = ctx.createPattern(grainTile(kind), 'repeat');
    if (pat && res >= 2 && typeof pat.setTransform === 'function' && typeof DOMMatrix === 'function') {
      pat.setTransform(new DOMMatrix([0.5, 0, 0, 0.5, 0, 0]));
    }
    patternCache.set(key, pat);
  }
  if (!pat) return;
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * alpha;
  ctx.fillStyle = pat;
  ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = prev;
}

// ---------------------------------------------------------------------------
// Fine rules — hairlines that land on device pixels
// ---------------------------------------------------------------------------

/**
 * A one-device-pixel frame around a logical rect, inset by `inset` logical
 * px. Top and left take `lit`, bottom and right `shade` (light from the upper
 * left). On a 1x layer it is a 1px frame.
 */
export function hairFrame(ctx, x, y, w, h, lit, shade = lit, inset = 0) {
  const t = resOf(ctx) >= 2 ? 0.5 : 1;
  x += inset; y += inset; w -= inset * 2; h -= inset * 2;
  if (w <= t * 2 || h <= t * 2) return;
  ctx.fillStyle = lit;
  ctx.fillRect(x, y, w - t, t);
  ctx.fillRect(x, y + t, t, h - t * 2);
  ctx.fillStyle = shade;
  ctx.fillRect(x + t, y + h - t, w - t, t);
  ctx.fillRect(x + w - t, y, t, h - t);
}

// ---------------------------------------------------------------------------
// medievalPanel — the HUD's wood-and-leather frame (hud.js, hotbar.js, combatui.js)
// ---------------------------------------------------------------------------

/**
 * A timber frame with brass edging and rivets. The geometry is fixed: a 3px
 * border, content from (x+3, y+3) — callers lay their contents out on that.
 * On a fine layer the edging, grain and rivets are drawn at half-pixel size.
 */
export function medievalPanel(ctx, x, y, w, h, { active = false, inset = false } = {}) {
  x = Math.round(x); y = Math.round(y);
  if (w <= 6 || h <= 6) return;
  const fine = resOf(ctx) >= 2;
  ctx.save();
  // Outer keyline and the brass band.
  ctx.fillStyle = '#120c09'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = active ? '#b89050' : '#6e5030'; ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  ctx.fillStyle = '#33241a'; ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
  // The board itself, with its grain.
  const top = inset ? '#1f1712' : '#2e2219', bot = inset ? '#171109' : '#211811';
  const g = ctx.createLinearGradient(0, y + 3, 0, y + h - 3);
  g.addColorStop(0, top); g.addColorStop(1, bot);
  ctx.fillStyle = g; ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
  grain(ctx, 'wood', x + 3, y + 3, w - 6, h - 6, fine ? 1 : 0.4);
  if (fine) {
    // Brass: a lit top-left hairline and a dark lower-right one, so the band
    // reads as a rounded strip of metal rather than a flat stroke.
    hairFrame(ctx, x + 1, y + 1, w - 2, h - 2, active ? '#f4dc9c' : '#a88a58', active ? '#7a5a28' : '#4a3620');
    hairFrame(ctx, x + 2.5, y + 2.5, w - 5, h - 5, 'rgba(0,0,0,0.55)', 'rgba(255,230,180,0.10)');
  } else {
    ctx.fillStyle = active ? '#ecd19a' : '#9c7950'; ctx.fillRect(x + 3, y + 1, w - 6, 1);
    ctx.fillStyle = '#130e0b'; ctx.fillRect(x + 3, y + h - 3, w - 6, 1);
  }
  if (w >= 10 && h >= 10) {
    const pal = active ? { hi: '#fff0c0', mid: '#e4c38c', lo: '#6a4a20' } : { hi: '#d8c090', mid: '#a88b58', lo: '#3a2a18' };
    for (const dx of [3, w - 3]) for (const dy of [3, h - 3]) rivet(ctx, x + dx, y + dy, pal);
  }
  ctx.restore();
}
