// render/sprites.js — the procedural pixel-sprite engine.
//
// Sprites are authored as arrays of equal-length strings; each character is a
// palette key, '.' and ' ' are transparent. A palette value that is an
// UPPERCASE_TOKEN is resolved per-character from a "colorway", which is how one
// 16x24 adventurer sprite becomes a thousand different-looking heroes.
//
// Everything is rasterised once into an offscreen canvas and memoised, so the
// per-frame cost is a single drawImage.

import { hashStr } from '../core/rng.js';
import { ramp, outlineFor, mix as mixRamp, hexToHsl, hslToHex } from './palette.js';

const sprites = new Map();     // name -> { w, h, frames, palette, anims }
const cache = new Map();       // cacheKey -> HTMLCanvasElement
const CACHE_LIMIT = 1400;

// --- colour helpers -------------------------------------------------------

/** '#rgb' or '#rrggbb' -> {r,g,b} */
export function hexToRgb(hex) {
  let h = String(hex || '#000').replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16) || 0;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex(r, g, b) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Lighten (amt > 0) or darken (amt < 0) a hex colour. amt is -1..1. */
export function shadeHex(hex, amt) {
  const { r, g, b } = hexToRgb(hex);
  if (amt >= 0) return rgbToHex(r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt);
  const k = 1 + amt;
  return rgbToHex(r * k, g * k, b * k);
}

/** Blend two hex colours. t=0 -> a, t=1 -> b. */
export function mixHex(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(A.r + (B.r - A.r) * t, A.g + (B.g - A.g) * t, A.b + (B.b - A.b) * t);
}

/** Rotate a colour toward a hue while keeping its luminance — used for tints. */
export function tintHex(hex, tint, amt) {
  return mixHex(hex, tint, amt);
}

/** Perceived brightness 0..1, for picking readable outline colours. */
export function luma(hex) {
  const { r, g, b } = hexToRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

// --- colorways ------------------------------------------------------------

/** The full token set a sprite palette may reference. */
export const COLOR_TOKENS = [
  'SKIN', 'SKIN_D', 'SKIN_L', 'HAIR', 'HAIR_D', 'HAIR_L', 'EYE',
  'MAIN', 'MAIN_D', 'MAIN_L', 'ALT', 'ALT_D', 'ALT_L',
  'METAL', 'METAL_D', 'METAL_L', 'TRIM', 'TRIM_D',
  'LEATHER', 'LEATHER_D', 'CLOTH', 'CLOTH_D', 'ACCENT', 'ACCENT_D',
  'OUTLINE', 'SHADOW', 'HORN', 'HORN_D', 'WHITE', 'BLACK',
];

const COLORWAY_DEFAULTS = {
  skin: '#e0a878', hair: '#3a2416', eye: '#37527a',
  main: '#7a3030', alt: '#2f4f7f', metal: '#aab2c0',
  leather: '#6b4a2a', cloth: '#c8b58a', accent: '#e3b34a',
  horn: '#8c8377', outline: '#170f0c',
};

/**
 * How far each material's ramp spreads and how hard its hue drifts. Skin keeps
 * a gentle shift (its shadows go ruddy, never green); metal gets the widest
 * value range, because a hard bright spot on steel is what makes it read as steel.
 */
const MATERIAL = {
  skin: { spread: 0.46, shift: 18 },
  hair: { spread: 0.56, shift: 20 },
  cloth: { spread: 0.54, shift: 22 },
  metal: { spread: 0.70, shift: 18 },
  leather: { spread: 0.50, shift: 16 },
  horn: { spread: 0.50, shift: 14 },
};

/** [dark, light]: one hue-shifted ramp step either side of `hex` (palette.js). */
export function shadePair(hex, mat = 'cloth') {
  const r = ramp(hex, 5, MATERIAL[mat] || MATERIAL.cloth);
  return [r[1], r[3]];
}

/**
 * The eye pixel a 16x24 face actually shows. At one pixel an iris colour is
 * noise; what reads is a pupil standing off the skin -- dark in its own hue on
 * a fair face, and the eye's pale light on a deep one, where a dark pixel
 * would vanish. Portraits read the true colour from the appearance.
 */
function eyeFor(eye, skin) {
  const [h, s, l] = hexToHsl(eye);
  if (hexToHsl(skin)[2] > 0.42) return hslToHex(h, Math.min(1, s + 0.1), Math.min(l, 0.24));
  return hslToHex(h, s * 0.5, Math.max(l, 0.74));
}

/**
 * Build a token map from a small, human-friendly appearance object.
 * The _D and _L shades come off palette.js hue-shifted ramps, not a darken
 * toward black: shadows turn cool, lights turn warm, the midtone keeps its
 * saturation. Token names are unchanged, so every seed and saved appearance
 * recolours exactly as before -- only lit like the rest of the world.
 */
export function makeColorway(seedObj = {}) {
  const c = { ...COLORWAY_DEFAULTS, ...seedObj };
  const [skD, skL] = shadePair(c.skin, 'skin');
  const [hD, hL] = shadePair(c.hair, 'hair');
  const [mD, mL] = shadePair(c.main, 'cloth');
  const [aD, aL] = shadePair(c.alt, 'cloth');
  const [meD, meL] = shadePair(c.metal, 'metal');
  const [acD] = shadePair(c.accent, 'metal');
  const [lD] = shadePair(c.leather, 'leather');
  const [cD] = shadePair(c.cloth, 'cloth');
  const [hoD] = shadePair(c.horn, 'horn');
  return {
    SKIN: c.skin, SKIN_D: skD, SKIN_L: skL,
    HAIR: c.hair, HAIR_D: hD, HAIR_L: hL,
    EYE: eyeFor(c.eye, c.skin),
    MAIN: c.main, MAIN_D: mD, MAIN_L: mL,
    ALT: c.alt, ALT_D: aD, ALT_L: aL,
    METAL: c.metal, METAL_D: meD, METAL_L: meL,
    TRIM: c.accent, TRIM_D: acD,
    LEATHER: c.leather, LEATHER_D: lD,
    CLOTH: c.cloth, CLOTH_D: cD,
    ACCENT: c.accent, ACCENT_D: acD,
    HORN: c.horn, HORN_D: hoD,
    OUTLINE: c.outline, SHADOW: 'rgba(0,0,0,0.35)',
    WHITE: '#f4ece0', BLACK: '#120c0a',
  };
}

/** A stable short signature for a colorway, used as part of the cache key. */
function colorwayKey(cw) {
  if (!cw) return '0';
  if (cw.__key) return cw.__key;
  let s = '';
  for (const t of COLOR_TOKENS) if (cw[t]) s += cw[t];
  const k = hashStr(s).toString(36);
  try { Object.defineProperty(cw, '__key', { value: k, enumerable: false }); } catch { /* frozen */ }
  return k;
}

// --- definition -----------------------------------------------------------

/**
 * Register a sprite.
 *   defineSprite('villager', {
 *     w:16, h:24,
 *     palette: { K:'OUTLINE', s:'SKIN', d:'SKIN_D', h:'HAIR', a:'MAIN', b:'ALT' },
 *     frames: { 'down-0':[ '....KKKK....', ... ], ... },
 *     anims: { walkDown:{ frames:['down-0','down-1','down-0','down-2'], fps:8 } }
 *   })
 * Rows shorter than `w` are padded with transparency, so authoring is forgiving.
 */
export function defineSprite(name, def) {
  const frames = {};
  for (const [fname, rows] of Object.entries(def.frames || {})) {
    frames[fname] = normalizeRows(rows, def.w, def.h);
  }
  sprites.set(name, {
    name,
    w: def.w, h: def.h,
    palette: def.palette || {},
    defaultColorway: def.defaultColorway || null,
    frames,
    anims: def.anims || {},
    anchor: def.anchor || { x: Math.floor(def.w / 2), y: def.h },  // feet-centre
    outline: def.outline !== false,
    // Palette key of the outline to finish selectively (see finishSprite), for
    // finished single-canvas figures. Layers leave it unset: their composite
    // is finished whole instead.
    finish: def.finish || null,
  });
  return name;
}

function normalizeRows(rows, w, h) {
  const out = [];
  for (let y = 0; y < h; y++) {
    let r = rows[y] != null ? String(rows[y]) : '';
    if (r.length < w) r = r + '.'.repeat(w - r.length);
    else if (r.length > w) r = r.slice(0, w);
    out.push(r);
  }
  return out;
}

/** Alias one sprite name to another (e.g. 'wolf-dire' -> 'wolf'). */
export function aliasSprite(alias, target) {
  const t = sprites.get(target);
  if (t) sprites.set(alias, { ...t, name: alias });
  return alias;
}

/** Register many at once. */
export function defineSprites(map) { for (const [n, d] of Object.entries(map)) defineSprite(n, d); }

export function hasSprite(name) { return sprites.has(name); }
export function spriteDef(name) { return sprites.get(name) || null; }
export function spriteFrames(name) { const d = sprites.get(name); return d ? Object.keys(d.frames) : []; }
export function spriteSize(name) { const d = sprites.get(name); return d ? { w: d.w, h: d.h } : { w: 16, h: 16 }; }
export function allSpriteNames() { return Array.from(sprites.keys()); }

// --- rasterisation --------------------------------------------------------

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w); c.height = Math.max(1, h);
  // These tiny working surfaces are read and edited by sprite finishing and
  // pose composition. GPU readback can stall the entire frame for seconds on
  // some drivers; keep the pixel workshop in CPU memory, not the world canvas.
  const x = c.getContext('2d', { willReadFrequently: true });
  x.imageSmoothingEnabled = false;
  return c;
}

/** Resolve a palette entry: hex passes through, TOKEN looks up the colorway. */
function resolveColor(v, cw) {
  if (!v) return null;
  if (v[0] === '#' || v.startsWith('rgb')) return v;
  if (cw && cw[v]) return cw[v];
  return DEFAULT_COLORWAY[v] || null;
}

const DEFAULT_COLORWAY = makeColorway();

/**
 * Get (and cache) a rendered frame.
 * Returns an HTMLCanvasElement of exactly (w x h) logical pixels.
 */
export function getSprite(name, frame, colorway = null) {
  const def = sprites.get(name);
  if (!def) return null;
  const rows = def.frames[frame] || def.frames[Object.keys(def.frames)[0]];
  if (!rows) return null;

  colorway = colorway ? (colorway.SKIN ? colorway : makeColorway(colorway)) : def.defaultColorway;
  const ck = `${name}|${frame}|${colorwayKey(colorway)}`;
  let c = cache.get(ck);
  if (c) return c;

  c = makeCanvas(def.w, def.h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(def.w, def.h);
  const data = img.data;

  // Pre-resolve the palette to RGBA once per frame render.
  const lut = {};
  for (const [ch, val] of Object.entries(def.palette)) {
    const hex = resolveColor(val, colorway);
    if (!hex) continue;
    if (hex.startsWith('rgba')) {
      const m = hex.match(/rgba?\(([^)]+)\)/);
      const p = m[1].split(',').map((s) => parseFloat(s));
      lut[ch] = [p[0] | 0, p[1] | 0, p[2] | 0, Math.round((p[3] ?? 1) * 255)];
    } else {
      const { r, g, b } = hexToRgb(hex);
      lut[ch] = [r, g, b, 255];
    }
  }

  for (let y = 0; y < def.h; y++) {
    const row = rows[y];
    for (let x = 0; x < def.w; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ' || ch === undefined) continue;
      const col = lut[ch];
      if (!col) continue;
      const i = (y * def.w + x) * 4;
      data[i] = col[0]; data[i + 1] = col[1]; data[i + 2] = col[2]; data[i + 3] = col[3];
    }
  }
  if (def.finish) finishSprite(c, resolveColor(def.palette[def.finish], colorway), img);
  else ctx.putImageData(img, 0, 0);

  if (cache.size > CACHE_LIMIT) {
    // Cheap eviction: drop the oldest quarter.
    const keys = Array.from(cache.keys()).slice(0, Math.floor(CACHE_LIMIT / 4));
    for (const k of keys) cache.delete(k);
  }
  cache.set(ck, c);
  return c;
}

// --- finishing: selective outline and rim light ----------------------------
//
// The art is authored with ONE outline key, which is right for authoring (a
// silhouette is a silhouette) and wrong for the finished picture: a flat near-
// black line round everything makes a 16x24 character look like a sticker.
// This pass runs once per rasterised or composed canvas -- after the layers are
// stacked, so it sees the whole silhouette, not one garment -- and repaints:
//   outer outline  -> a deep, cool shade of the fill it borders (outlineFor),
//                     clamped dark enough to hold the figure off any ground;
//   inner seams    -> a softer shade of the darker neighbour, so a belt or the
//                     gap between two legs is a crease, not a wire;
//   lit edge fills -> one warm step lighter where the silhouette faces the
//                     upper-left light (left side, and the top of each form's
//                     left half), which is the rim that makes a shape round.

const finishTone = new Map();   // `${kind}|${hex}` -> [r, g, b]

function toneOf(kind, r, g, b) {
  const hex = rgbToHex(r, g, b);
  const k = `${kind}|${hex}`;
  let v = finishTone.get(k);
  if (v) return v;
  let out;
  if (kind === 'edge') {
    const [h, s, l] = hexToHsl(outlineFor(hex));
    out = hslToHex(h, s, Math.min(l, 0.2));
  } else if (kind === 'seam') {
    out = mixRamp(outlineFor(hex), hex, 0.38);
  } else {
    out = ramp(hex, 5, { spread: 0.34, shift: 16 })[3];
  }
  const { r: R, g: G, b: B } = hexToRgb(out);
  v = [R, G, B];
  if (finishTone.size > 4000) finishTone.clear();
  finishTone.set(k, v);
  return v;
}

/**
 * Repaint a canvas's outline pixels (exactly `outlineHex`) selectively and rim
 * the lit edge. In place; returns the canvas.
 */
export function finishSprite(c, outlineHex, pixels = null) {
  if (!c) return c;
  if (!outlineHex) {
    if (pixels) c.getContext('2d').putImageData(pixels, 0, 0);
    return c;
  }
  const w = c.width, h = c.height;
  const ctx = c.getContext('2d');
  const img = pixels || ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const src = new Uint8ClampedArray(d);
  const { r: or, g: og, b: ob } = hexToRgb(outlineHex);
  // 0 = empty, 1 = fill, 2 = outline
  const kind = new Uint8Array(w * h);
  const rowL = new Int16Array(h).fill(w), rowR = new Int16Array(h).fill(-1);
  for (let i = 0, p = 0; p < w * h; p++, i += 4) {
    if (src[i + 3] < 100) continue;
    kind[p] = (src[i] === or && src[i + 1] === og && src[i + 2] === ob) ? 2 : 1;
    const y = (p / w) | 0, x = p - y * w;
    if (x < rowL[y]) rowL[y] = x;
    if (x > rowR[y]) rowR[y] = x;
  }
  const K = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : kind[y * w + x]);
  const luma4 = (p) => src[p * 4] * 0.3 + src[p * 4 + 1] * 0.59 + src[p * 4 + 2] * 0.11;
  const N4 = [[0, -1], [-1, 0], [1, 0], [0, 1]];
  const DIAG = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x;
    const k = kind[p];
    if (k === 2) {
      let best = -1, bestL = 1e9, outer = false;
      for (const [dx, dy] of N4) {
        const nk = K(x + dx, y + dy);
        if (nk === 0) outer = true;
        else if (nk === 1) { const q = (y + dy) * w + x + dx, L = luma4(q); if (L < bestL) { bestL = L; best = q; } }
      }
      if (best < 0) for (const [dx, dy] of DIAG) {
        if (K(x + dx, y + dy) !== 1) continue;
        const q = (y + dy) * w + x + dx, L = luma4(q);
        if (L < bestL) { bestL = L; best = q; }
      }
      if (best < 0) continue;
      const t = toneOf(outer ? 'edge' : 'seam', src[best * 4], src[best * 4 + 1], src[best * 4 + 2]);
      d[p * 4] = t[0]; d[p * 4 + 1] = t[1]; d[p * 4 + 2] = t[2];
    } else if (k === 1) {
      const mid = (rowL[y] + rowR[y]) / 2;
      const litLeft = K(x - 1, y) === 2 && K(x - 2, y) === 0;
      const litTop = x <= mid && K(x, y - 1) === 2 && K(x, y - 2) === 0;
      if (!litLeft && !litTop) continue;
      const t = toneOf('rim', src[p * 4], src[p * 4 + 1], src[p * 4 + 2]);
      d[p * 4] = t[0]; d[p * 4 + 1] = t[1]; d[p * 4 + 2] = t[2];
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// --- tinting --------------------------------------------------------------

const tintCache = new Map();

/** A copy of a sprite frame washed toward `tint` (hit flashes, poison, petrify). */
function getTinted(src, tint, amt, ck) {
  const key = `${ck}|t${tint}|${amt.toFixed(2)}`;
  let c = tintCache.get(key);
  if (c) return c;
  c = makeCanvas(src.width, src.height);
  const ctx = c.getContext('2d');
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = 'source-atop';
  ctx.globalAlpha = amt;
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  if (tintCache.size > 400) tintCache.clear();
  tintCache.set(key, c);
  return c;
}

/** A pure silhouette of a frame — used for spell targeting glows and stealth. */
export function getSilhouette(name, frame, color = '#ffffff', colorway = null) {
  const src = getSprite(name, frame, colorway);
  if (!src) return null;
  return getTinted(src, color, 1, `${name}|${frame}|${colorwayKey(colorway)}|sil`);
}

// --- drawing --------------------------------------------------------------

/**
 * Draw a sprite frame with its FEET at (x, y) — i.e. (x,y) is the bottom-centre
 * anchor, which is what tile-walking wants.
 * opts: { flip, scale=1, alpha=1, tint, tintAmt=0.6, shadow, anchor:'feet'|'topleft',
 *         rotate, bob, outline }
 */
export function drawSprite(ctx, name, frame, x, y, opts = {}) {
  const def = sprites.get(name);
  if (!def) return false;
  const seed = opts.colorway;
  const cw = seed ? (seed.SKIN ? seed : makeColorway(seed)) : def.defaultColorway;
  let img = getSprite(name, frame, cw);
  if (!img) return false;

  const scale = opts.scale || 1;
  const w = def.w * scale, h = def.h * scale;
  const anchorFeet = opts.anchor !== 'topleft';
  let dx = anchorFeet ? Math.round(x - w / 2) : Math.round(x);
  let dy = anchorFeet ? Math.round(y - h) : Math.round(y);
  if (opts.bob) dy += Math.round(opts.bob);

  ctx.save();
  if (opts.alpha != null && opts.alpha < 1) ctx.globalAlpha = opts.alpha;

  if (opts.shadow) {
    const sw = w * 0.62, sh = Math.max(2, h * 0.10);
    ctx.globalAlpha = (opts.alpha ?? 1) * (opts.shadow === true ? 0.32 : opts.shadow);
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(Math.round(x), Math.round(anchorFeet ? y - 1 : y + h - 1), sw / 2, sh / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = opts.alpha ?? 1;
  }

  if (opts.tint && (opts.tintAmt ?? 0.6) > 0) {
    img = getTinted(img, opts.tint, opts.tintAmt ?? 0.6, `${name}|${frame}|${colorwayKey(cw)}`);
  }

  if (opts.rotate) {
    ctx.translate(dx + w / 2, dy + h / 2);
    ctx.rotate(opts.rotate);
    ctx.translate(-w / 2, -h / 2);
    dx = 0; dy = 0;
  }

  if (opts.flip) {
    ctx.translate(dx + w, dy);
    ctx.scale(-1, 1);
    ctx.drawImage(img, 0, 0, def.w, def.h, 0, 0, w, h);
  } else {
    ctx.drawImage(img, 0, 0, def.w, def.h, dx, dy, w, h);
  }
  ctx.restore();
  return true;
}

/** Draw with the top-left at (x,y) — for menus, portraits, item icons. */
export function drawSpriteAt(ctx, name, frame, x, y, opts = {}) {
  return drawSprite(ctx, name, frame, x, y, { ...opts, anchor: 'topleft' });
}

// --- layered actors -------------------------------------------------------

/**
 * Compose several sprite layers into one cached canvas.
 * This is how a character is built: body -> head/hair -> outfit -> armour ->
 * cloak -> weapon, each recoloured from the same colorway.
 *
 *   layers: [{ name, frame, colorway?, dx?, dy?, flip?, alpha?, xf? }]
 *           xf(data, w, h, name) edits the layer's RGBA in place before stacking
 *   sig:    a stable string identifying this exact combination (appearance +
 *           equipment + frame). Composition happens once per unique sig.
 *   opts:   { post(canvas), finish: outline hex } -- post runs on the finished
 *           stack, then finishSprite repaints its outline.
 */
export function composeSprite(sig, w, h, layers, opts = {}) {
  const ck = `~c|${sig}`;
  let c = cache.get(ck);
  if (c) return c;

  c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  for (const L of layers) {
    if (!L || !L.name) continue;
    const def = sprites.get(L.name);
    if (!def) continue;
    let img = getSprite(L.name, L.frame, L.colorway || null);
    if (!img) continue;
    // Layers are bottom-anchored to the composite so a 16x16 hat lines up with
    // a 16x24 body when it declares dy.
    let dx = (L.dx || 0) + Math.floor((w - def.w) / 2);
    let dy = (L.dy || 0) + (h - def.h);
    // A pose moves parts of a layer (an arm, the upper body) before it joins the
    // stack, so every garment moves in register. It works on a composite-sized
    // copy, so an arm flung out sideways has room beyond the layer's own frame.
    if (L.xf) {
      const t = makeCanvas(w, h);
      const tx = t.getContext('2d');
      tx.drawImage(img, dx, dy);
      const id = tx.getImageData(0, 0, w, h);
      L.xf(id.data, w, h, L.name);
      tx.putImageData(id, 0, 0);
      img = t; dx = 0; dy = 0;
    }
    ctx.save();
    if (L.alpha != null) ctx.globalAlpha = L.alpha;
    if (L.flip) {
      ctx.translate(dx + img.width, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0);
    } else {
      ctx.drawImage(img, dx, dy);
    }
    ctx.restore();
  }
  if (opts.post) opts.post(c);
  if (opts.finish) finishSprite(c, opts.finish);
  if (cache.size > CACHE_LIMIT) {
    const keys = Array.from(cache.keys()).slice(0, Math.floor(CACHE_LIMIT / 4));
    for (const k of keys) cache.delete(k);
  }
  cache.set(ck, c);
  return c;
}

/** Draw a composed canvas with feet at (x,y). */
export function drawComposed(ctx, canvas, x, y, opts = {}) {
  if (!canvas) return;
  const scale = opts.scale || 1;
  const w = canvas.width * scale, h = canvas.height * scale;
  let img = canvas;
  const dx = Math.round(x - w / 2);
  const dy = Math.round(y - h) + Math.round(opts.bob || 0);

  ctx.save();
  if (opts.alpha != null && opts.alpha < 1) ctx.globalAlpha = opts.alpha;
  if (opts.shadow) {
    ctx.globalAlpha = (opts.alpha ?? 1) * (opts.shadow === true ? 0.32 : opts.shadow);
    ctx.fillStyle = '#000';
    ctx.beginPath();
    // A posed figure's canvas has room for flung arms; its shadow is still the
    // width of the body standing in it.
    const sw = opts.shadowW != null ? opts.shadowW * scale : w;
    ctx.ellipse(Math.round(x), Math.round(y - 1), sw * 0.31, Math.max(2, h * 0.05), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = opts.alpha ?? 1;
  }
  if (opts.tint && (opts.tintAmt ?? 0.6) > 0) img = getTinted(canvas, opts.tint, opts.tintAmt ?? 0.6, `~comp${canvas.width}x${canvas.height}|${opts.sig || ''}`);
  // A layered character used to ignore `rotate`, so a downed hero stood at
  // attention at 75% alpha while a downed goblin (single-sprite path) lay flat.
  // Pivot on the feet, not the centre: a body that topples swings its head to
  // the ground and stays anchored to the tile it fell on.
  let ddx = dx, ddy = dy;
  if (opts.rotate) {
    ctx.translate(Math.round(x), Math.round(y));
    ctx.rotate(opts.rotate);
    ddx = -Math.round(w / 2); ddy = -Math.round(h);
  }
  if (opts.flip) {
    ctx.translate(ddx + w, ddy);
    ctx.scale(-1, 1);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height, 0, 0, w, h);
  } else {
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height, ddx, ddy, w, h);
  }
  ctx.restore();
}

// --- animation ------------------------------------------------------------

/**
 * Pick the frame name for an animation at time t.
 * anim: { frames:[names], fps, loop=true }
 */
export function animFrame(name, animId, t) {
  const def = sprites.get(name);
  if (!def) return null;
  const a = def.anims[animId];
  if (!a) return animId;                       // treat as a literal frame name
  const n = a.frames.length;
  const i = Math.floor(t * (a.fps || 8));
  return a.frames[a.loop === false ? Math.min(i, n - 1) : ((i % n) + n) % n];
}

/** The standard 4-direction walk cycle frame: 'down-0'..'down-3'. */
export function walkFrame(dir, phase) {
  const seq = [0, 1, 0, 2];
  return `${dir}-${seq[phase & 3]}`;
}

export function clearSpriteCache() { cache.clear(); tintCache.clear(); }

// --- portraits ------------------------------------------------------------

let portraitHook = null;

/**
 * render/portrait.js registers its bust painter here when it loads, so interface
 * code that already draws sprites can paint a person's bust without importing
 * the character modules: portraitPainter()?.(ctx, ch, x, y, size, opts) returns
 * true if it painted, false for anything without a bust (beasts, monsters).
 */
export function setPortraitPainter(fn) { portraitHook = typeof fn === 'function' ? fn : null; }
export function portraitPainter() { return portraitHook; }

/** Debug helper: how much sprite memory we're holding. */
export function spriteStats() {
  return { defs: sprites.size, cached: cache.size, tinted: tintCache.size };
}
