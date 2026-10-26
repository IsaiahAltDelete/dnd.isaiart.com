// render/lighting.js — the world's light: the sky's grade by hour, weather and place, and every lamp, window, fire and torch punched into it as stepped pixel pools.
//
// The model is the one a painter uses, not a physics engine:
//
//   final pixel = albedo x (ambient + sum of lights)
//
// `ambient` is the sky: rose at dawn, white at noon, amber sliding into violet at
// dusk, deep blue at night, grey under rain, near-black underground. Each light
// ADDS to it inside its pool. Both live in one small 400x240 LIGHT MAP, painted
// fresh every frame and laid over the finished world with `multiply` on the
// stage's 'grade' layer. Because a light only adds towards white, a lantern at
// noon changes nothing and the same lantern at midnight carves a warm room out of
// the dark — no special cases for "night-only" sources.
//
// Pixel art must never meet a smooth gradient, so a pool is four FLAT bands with
// Bayer-dithered seams, rendered once per (kind, radius) into a stamp and reused.
// Flicker is stepped too: a fire's pool breathes by whole pixels at a slow,
// irregular cadence, and its strength wavers by a few percent.
//
// The 'glow' layer (additive, above the grade) gets small stepped halos round
// the flames themselves, so a torch reads as a light and not just a lit patch.
//
// Sources are found three ways and merged each frame:
//   tiles     scanned once per map (lamps, lit windows, hearths, braziers,
//             glowcaps, crystals, lava ...), cached on the map
//   extras    `map._glows`: lights other modules push while they burn (the
//             encounter director's campfires). Legacy shape { x, y, def:{ r, c, flick } }
//             in TILE coordinates with 0..255 colours, still honoured.
//   frame     the party's torch, lantern or Light spell, entity lights, spell FX
//
// Everything here is deterministic (hashes, not dice), allocation-free per
// frame, and never throws into the draw loop.

import { T } from './tiles.js';

const TILE = 16;
const VW = 400;
const VH = 240;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

/** Cheap integer hash -> 0..1, for per-tile decisions that must not change frame to frame. */
function hash01(x, y, salt = 0) {
  let h = (x * 374761393 + y * 668265263 + salt * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// ---------------------------------------------------------------------------
// 1. THE SKY — ambient light by hour
// ---------------------------------------------------------------------------
//
// Multiply colours (0..1), keyed on minutes after midnight. The ramp is hue-
// shifted the way render/palette.js shifts a material: the dark end cool and
// blue, the warm end gold, and the turn between them passes through rose and
// violet rather than grey. Noon is exactly white so the art is seen as painted.

const SKY_KEYS = [
  { t: 0,    c: [0.32, 0.37, 0.62] },   // midnight: moonlit blue
  { t: 270,  c: [0.32, 0.36, 0.60] },   // the small hours
  { t: 325,  c: [0.56, 0.48, 0.68] },   // first light: violet
  { t: 370,  c: [1.00, 0.78, 0.70] },   // dawn: rose-gold on the mud
  { t: 430,  c: [1.00, 0.90, 0.80] },
  { t: 540,  c: [1.00, 0.97, 0.94] },
  { t: 720,  c: [1.00, 1.00, 1.00] },   // noon: the art as painted
  { t: 960,  c: [1.00, 0.97, 0.90] },
  { t: 1050, c: [1.00, 0.89, 0.72] },   // the golden hour
  { t: 1105, c: [0.98, 0.75, 0.55] },   // dusk: amber
  { t: 1160, c: [0.78, 0.57, 0.64] },   // amber going violet
  { t: 1225, c: [0.46, 0.43, 0.67] },   // blue hour
  { t: 1300, c: [0.32, 0.37, 0.62] },
  { t: 1440, c: [0.32, 0.37, 0.62] },
];

/** Weather as a multiply on the sky: overcast cools and flattens, a storm more. */
const WEATHER_SKY = {
  rain:   [0.74, 0.78, 0.86],
  storm:  [0.56, 0.60, 0.72],
  snow:   [0.90, 0.94, 1.00],
  fog:    [0.84, 0.87, 0.92],
  ash:    [0.78, 0.70, 0.62],
  leaves: [1.00, 0.98, 0.94],
};

/** Inside a house: dim window light by day, near dark by night (the hearth does the rest). */
const INDOOR_DAY = [0.84, 0.80, 0.74];
const INDOOR_NIGHT = [0.36, 0.34, 0.46];
/** Underground, with nothing burning: enough to read the room's shape, no more. */
const UNDER = [0.11, 0.10, 0.16];
/** Daylight (the spell) in a cave: true sunlight, a little flat. */
const TRUE_SUN = [0.96, 0.94, 0.88];

const UNDERGROUND = new Set(['dungeon', 'cave', 'mine', 'crypt', 'underdark', 'sewer', 'lair']);

/** How hard the sun is up, 0..1, by minutes (shadows, clouds, god rays read it). */
export function sunAt(minutes) {
  const m = ((minutes % 1440) + 1440) % 1440;
  if (m >= 450 && m <= 1000) return 1;
  if (m > 1000 && m < 1150) return clamp(1 - (m - 1000) / 150, 0, 1);
  if (m > 300 && m < 450) return clamp((m - 300) / 150, 0, 1);
  return 0;
}

/** The open sky's multiply colour at `minutes`, written into `out` (no allocation). */
export function skyAt(minutes, out = [1, 1, 1]) {
  const m = ((minutes % 1440) + 1440) % 1440;
  let a = SKY_KEYS[0], b = SKY_KEYS[SKY_KEYS.length - 1];
  for (let i = 0; i < SKY_KEYS.length - 1; i++) {
    if (m >= SKY_KEYS[i].t && m <= SKY_KEYS[i + 1].t) { a = SKY_KEYS[i]; b = SKY_KEYS[i + 1]; break; }
  }
  const k = clamp((m - a.t) / Math.max(1, b.t - a.t), 0, 1);
  // Smoothstep between keys so the sky never visibly changes gear.
  const s = k * k * (3 - 2 * k);
  out[0] = lerp(a.c[0], b.c[0], s);
  out[1] = lerp(a.c[1], b.c[1], s);
  out[2] = lerp(a.c[2], b.c[2], s);
  return out;
}

/** Is this map underground (truly dark without a light)? */
export function isUnderground(map) {
  if (!map) return false;
  return UNDERGROUND.has(map.biome) || (map.dark || 0) >= 0.6;
}

// ---------------------------------------------------------------------------
// 2. LIGHT KINDS
// ---------------------------------------------------------------------------
//
// r      pool radius in logical px (the dim edge; the bright core is ~half)
// c      light colour, 0..1 — what the pool ADDS to the ambient at full strength
// i      strength 0..1
// ry     vertical squash of the pool (a pool on the ground seen from above-south)
// flick  0..1, how much it breathes
// halo   0..1, strength of the additive halo round the source on 'glow'
// core   radius of the small self-light that keeps the flame itself unshaded
// when   'night' only after dark (windows); 'day' only by day (interior windows)

const KINDS = {
  torch:      { r: 46, c: [1.00, 0.60, 0.26], i: 0.95, ry: 0.78, flick: 1.0, halo: 0.55, core: 6 },
  brazier:    { r: 54, c: [1.00, 0.56, 0.22], i: 1.00, ry: 0.78, flick: 1.0, halo: 0.60, core: 7 },
  campfire:   { r: 60, c: [1.00, 0.56, 0.22], i: 1.00, ry: 0.80, flick: 1.0, halo: 0.60, core: 7 },
  candle:     { r: 22, c: [1.00, 0.76, 0.44], i: 0.80, ry: 0.80, flick: 0.6, halo: 0.35, core: 3 },
  chandelier: { r: 58, c: [1.00, 0.78, 0.48], i: 0.85, ry: 0.80, flick: 0.4, halo: 0.40, core: 7 },
  hearth:     { r: 64, c: [1.00, 0.52, 0.22], i: 1.00, ry: 0.80, flick: 1.0, halo: 0.60, core: 8 },
  forge:      { r: 56, c: [1.00, 0.44, 0.16], i: 1.00, ry: 0.80, flick: 1.0, halo: 0.65, core: 8 },
  embers:     { r: 26, c: [1.00, 0.54, 0.24], i: 0.75, ry: 0.80, flick: 0.8, halo: 0.35, core: 4 },
  lava:       { r: 34, c: [1.00, 0.36, 0.10], i: 0.80, ry: 0.90, flick: 0.5, halo: 0.45, core: 8 },
  crystal:    { r: 34, c: [0.42, 0.78, 1.00], i: 0.75, ry: 0.85, flick: 0.2, halo: 0.45, core: 5 },
  glowcap:    { r: 28, c: [0.40, 0.60, 1.00], i: 0.70, ry: 0.85, flick: 0.15, halo: 0.45, core: 4 },
  portal:     { r: 42, c: [0.72, 0.46, 1.00], i: 0.85, ry: 0.85, flick: 0.5, halo: 0.55, core: 8 },
  shrine:     { r: 30, c: [1.00, 0.90, 0.62], i: 0.70, ry: 0.80, flick: 0.2, halo: 0.35, core: 5 },
  lantern:    { r: 44, c: [1.00, 0.70, 0.36], i: 0.95, ry: 0.72, flick: 0.35, halo: 0.50, core: 5 },
  // A lit window spills a short fan onto the street in front of it; its pane
  // keeps its own light via `core`.
  window:     { r: 26, c: [1.00, 0.72, 0.38], i: 0.85, ry: 0.55, flick: 0.1, halo: 0.30, core: 6, pool: 13 },
  windowDim:  { r: 22, c: [1.00, 0.68, 0.36], i: 0.60, ry: 0.55, flick: 0.1, halo: 0.20, core: 5, pool: 12, when: 'night' },
  stained:    { r: 30, c: [0.92, 0.56, 0.78], i: 0.75, ry: 0.55, flick: 0.1, halo: 0.30, core: 6, pool: 14 },
  // Indoors, a window lets the day in: a cool pool on the boards below it.
  daylight:   { r: 30, c: [0.30, 0.30, 0.26], i: 1.00, ry: 0.70, flick: 0, halo: 0, core: 0, pool: 18, when: 'day' },
  // Carried by townsfolk (the watch after dark).
  handLantern:{ r: 40, c: [1.00, 0.72, 0.38], i: 0.85, ry: 0.80, flick: 0.35, halo: 0.45, core: 3 },
  torchHeld:  { r: 48, c: [1.00, 0.60, 0.26], i: 0.90, ry: 0.80, flick: 1.0, halo: 0.50, core: 3 },
  // The party's own light.
  carried:    { r: 92, c: [1.00, 0.62, 0.30], i: 0.95, ry: 0.82, flick: 0.7, halo: 0.40, core: 0 },
  lanternHeld:{ r: 108, c: [1.00, 0.70, 0.38], i: 0.95, ry: 0.82, flick: 0.3, halo: 0.40, core: 0 },
  spell:      { r: 120, c: [0.92, 0.92, 0.84], i: 0.95, ry: 0.82, flick: 0, halo: 0.30, core: 0 },
  darkvision: { r: 72, c: [0.34, 0.34, 0.40], i: 1.00, ry: 0.85, flick: 0, halo: 0, core: 0 },
  eyes:       { r: 56, c: [0.30, 0.30, 0.38], i: 1.00, ry: 0.85, flick: 0, halo: 0, core: 0 },
};
export const LIGHT_KINDS = KINDS;

/**
 * Which tiles give light, and where on the tile the light sits (flame offset
 * from the tile's top-left). Names that are families (every WINDOW_LIT_<wall>
 * the architecture pass resolves) are matched by prefix in `tileSource`.
 */
const TILE_SOURCES = {
  TORCH:        { kind: 'torch', ox: 7, oy: 4 },
  BRAZIER:      { kind: 'brazier', ox: 8, oy: 5 },
  CANDLE:       { kind: 'candle', ox: 7, oy: 4 },
  CHANDELIER:   { kind: 'chandelier', ox: 8, oy: 5 },
  HEARTH:       { kind: 'hearth', ox: 8, oy: 9 },
  FORGE:        { kind: 'forge', ox: 8, oy: 8 },
  COOKING_POT:  { kind: 'embers', ox: 8, oy: 12 },
  LAVA:         { kind: 'lava', ox: 8, oy: 8, sparse: true },
  CRYSTAL:      { kind: 'crystal', ox: 8, oy: 7 },
  MUSHROOM_GLOW:{ kind: 'glowcap', ox: 8, oy: 10 },
  PORTAL:       { kind: 'portal', ox: 8, oy: 8 },
  SHRINE:       { kind: 'shrine', ox: 8, oy: 6 },
  LANTERN:      { kind: 'lantern', ox: 8, oy: 10 },
};

function tileSource(key) {
  if (!key) return null;
  if (TILE_SOURCES[key]) return TILE_SOURCES[key];
  if (key.startsWith('WINDOW_STAINED_LIT') || key.startsWith('WINDOW_ROSE_LIT')) return { kind: 'stained', ox: 8, oy: 8, window: true };
  if (key.startsWith('WINDOW_LIT')) return { kind: 'window', ox: 8, oy: 8, window: true };
  if (key === 'WINDOW' || /^WINDOW_[A-Z]+$/.test(key) && !key.startsWith('WINDOW_STAINED') && !key.startsWith('WINDOW_ROSE')) {
    return { kind: 'windowDim', ox: 8, oy: 8, window: true, sometimes: true };
  }
  if (key.startsWith('IWINDOW_')) return { kind: 'daylight', ox: 8, oy: 8, window: true };
  return null;
}

// ---------------------------------------------------------------------------
// 3. STAMPS — a pool as four flat bands with dithered seams
// ---------------------------------------------------------------------------

/** 4x4 Bayer thresholds, 0..15. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** Band edges (fraction of the radius) and the light each band carries. */
const BAND_R = [0.30, 0.54, 0.78, 1.0];
const BAND_V = [1.0, 0.64, 0.36, 0.15];
/** Halo on 'glow': two bands, tight round the source. */
const HALO_R = [0.5, 1.0];
const HALO_V = [1.0, 0.45];
/** How wide the dithered seam between two bands is, in px. */
const SEAM = 2.6;

const stampCache = new Map();

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  return null;
}

/**
 * A pool stamp: radius r, vertical squash ry, colour c (0..1), bands radii/levels.
 * Returns { canvas, cx, cy } or null where there is no canvas (headless tests).
 */
function stamp(r, ry, c, radii, levels, tag) {
  const key = `${tag}|${r}|${ry}|${c[0]},${c[1]},${c[2]}`;
  let s = stampCache.get(key);
  if (s !== undefined) return s;
  const rx = Math.max(2, Math.round(r));
  const rh = Math.max(2, Math.round(r * ry));
  const w = rx * 2 + 1, h = rh * 2 + 1;
  const cv = makeCanvas(w, h);
  if (!cv) { stampCache.set(key, null); return null; }
  const g = cv.getContext('2d');
  const img = g.createImageData(w, h);
  const d = img.data;
  const seam = SEAM / rx;
  const last = radii.length - 1;
  for (let y = 0; y < h; y++) {
    const dy = (y - rh) / (rh || 1);
    for (let x = 0; x < w; x++) {
      const dx = (x - rx) / rx;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > radii[last] + seam) continue;
      const th = (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16 - 0.5;
      const dd = dist + th * seam;
      let b = -1;
      for (let i = 0; i <= last; i++) if (dd <= radii[i]) { b = i; break; }
      if (b < 0) continue;
      const v = levels[b];
      const o = (y * w + x) * 4;
      d[o] = Math.round(255 * clamp(c[0] * v, 0, 1));
      d[o + 1] = Math.round(255 * clamp(c[1] * v, 0, 1));
      d[o + 2] = Math.round(255 * clamp(c[2] * v, 0, 1));
      d[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  s = { canvas: cv, cx: rx, cy: rh };
  stampCache.set(key, s);
  return s;
}

/** Stepped, irregular breathing: -1, 0 or +1 px, changing ~8 times a second. */
function flickStep(t, phase) {
  const q = Math.floor(t * 8 + phase * 13);
  const n = hash01(q, Math.floor(phase * 997), 7);
  return n < 0.22 ? -1 : n > 0.84 ? 1 : 0;
}

/** Smooth-ish strength waver, 1 +- a few percent (the stamp's bands stay flat). */
function flickAmp(t, phase) {
  return 1 + 0.045 * Math.sin(t * 9.1 + phase * 40) + 0.03 * Math.sin(t * 23.3 + phase * 17);
}

// ---------------------------------------------------------------------------
// 4. SOURCES
// ---------------------------------------------------------------------------

/** The tile lights of a map, scanned once and cached on it. */
export function tileLights(map) {
  if (!map) return [];
  if (map._tileLights) return map._tileLights;
  const byId = new Map();
  for (const [key, id] of Object.entries(T)) {
    const src = tileSource(key);
    if (src) byId.set(id, src);
  }
  const out = [];
  const W = map.w, H = map.h;
  const planes = [map.deco, map.over, map.ground];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      let src = null;
      for (const p of planes) { if (p && p[i]) { src = byId.get(p[i]); if (src) break; } }
      if (!src) continue;
      // A lava lake or a field of glowcaps is one light per few tiles, not one each.
      if (src.sparse && ((x & 1) || (y & 1))) continue;
      // Not every house has a candle burning: about half the plain windows
      // stay dark, decided per window so the street keeps its pattern.
      if (src.sometimes && hash01(x, y, 3) > 0.5) continue;
      const k = KINDS[src.kind];
      out.push({
        kind: src.kind, def: k,
        // A window's light falls on the street in front of the wall.
        x: x * TILE + src.ox,
        y: y * TILE + src.oy + (k.pool || 0),
        fx: x * TILE + src.ox, fy: y * TILE + src.oy,
        phase: hash01(x, y, 11),
        late: src.sometimes ? 0.5 + hash01(x, y, 5) * 0.5 : 1,   // how late this window stays lit
      });
    }
  }
  map._tileLights = out;
  if (!Array.isArray(map._glows)) map._glows = [];
  return out;
}

/** Forget a map's cached lights (a tile that burns was placed or put out). */
export function invalidateLights(map) {
  if (map) { map._tileLights = null; }
}

/** A legacy `map._glows` record { x, y, def:{ r, c:[0..255], flick } } as a light kind. */
const legacyKinds = new Map();
function legacyKind(def) {
  const key = `${def.r}|${def.c}|${def.flick}`;
  let k = legacyKinds.get(key);
  if (!k) {
    const c = (def.c || [255, 170, 80]).map((v) => clamp(v / 255, 0, 1));
    // The old table's radius was a smooth gradient's; a stepped pool needs more.
    k = { r: Math.round((def.r || 30) * 1.6), c, i: 1, ry: 0.8, flick: def.flick || 0, halo: 0.55, core: 6 };
    legacyKinds.set(key, k);
  }
  return k;
}

// ---------------------------------------------------------------------------
// 5. THE FRAME
// ---------------------------------------------------------------------------

/**
 * Per-frame environment. Filled by `Lighting.update` and read by the passes
 * (and by overworld's shadow passes through `Lighting.env.sun`).
 */
const env = {
  map: null,
  place: 'outdoor',          // 'outdoor' | 'interior' | 'underground'
  amb: [1, 1, 1],            // ambient multiply colour 0..1
  lights: 0,                 // how much artificial light shows, 0..1
  sun: 1,                    // how hard the sun is out (shadows, clouds, rays)
  night: 0,                  // 0 day .. 1 deep night (outdoors)
  minutes: 720, day: 121,
  weather: 'none', wet: 0,   // wet: 0..1 how rain-soaked the ground looks
  t: 0,
  active: [],                // lights in or near view this frame
};

const _sky = [1, 1, 1];
const _wx = [1, 1, 1];
let wBlend = 0, wKind = 'none';

function lum(c) { return 0.3 * c[0] + 0.55 * c[1] + 0.15 * c[2]; }

/**
 * Work out this frame's light. `o`:
 *   map, minutes, day, t (seconds), dt, weather (FX kind), weatherInt (0..1),
 *   cam {x,y}, party { x, y, light: 'carried'|'lanternHeld'|'spell'|'darkvision'|'eyes'|null, radius },
 *   sunlight (true: a Daylight spell burns here), extra: [{ x, y, kind|def }] world px,
 *   entities: entities whose heldLightNow / heldLightAt supply carried lights
 */
function update(o) {
  const map = o.map;
  env.map = map;
  env.t = o.t || 0;
  env.minutes = o.minutes != null ? o.minutes : 720;
  env.day = o.day || 121;
  const dt = clamp(o.dt || 0, 0, 0.1);

  // The weather fades in and out as FX's does, so a squall arrives and lifts.
  const wk = o.weather && o.weather !== 'none' ? o.weather : 'none';
  if (wk !== wKind) {
    wBlend -= dt * 1.5;
    if (wBlend <= 0) { wBlend = 0; wKind = wk; }
  } else if (wk !== 'none') wBlend = Math.min(1, wBlend + dt * 1.2);
  if (o.snapWeather) { wKind = wk; wBlend = wk === 'none' ? 0 : 1; }
  env.weather = wKind;
  env.weatherAmt = wBlend * clamp(o.weatherInt != null ? o.weatherInt : 0.7, 0, 1);

  const indoor = !!(map && map.indoor);
  const under = isUnderground(map);
  // An interior keeps the clock, though it never takes the street's grade.
  const graded = map ? (map.dayNight !== false || indoor) : true;
  env.place = under ? 'underground' : indoor ? 'interior' : 'outdoor';

  const sky = graded ? skyAt(env.minutes, _sky) : (_sky[0] = _sky[1] = _sky[2] = 1, _sky);
  const sun = graded ? sunAt(env.minutes) : 1;
  const a = env.amb;
  if (under) {
    a[0] = UNDER[0]; a[1] = UNDER[1]; a[2] = UNDER[2];
    env.sun = 0;
    env.night = 1;
  } else if (indoor) {
    // The room follows the sky, but gently: it is never as bright as noon
    // outside, nor as dark as the street at midnight.
    const k = clamp(lum(sky), 0, 1);
    const d = clamp((k - 0.33) / 0.67, 0, 1);
    for (let i = 0; i < 3; i++) a[i] = lerp(INDOOR_NIGHT[i], INDOOR_DAY[i], d) * lerp(1, sky[i] / Math.max(0.3, k), 0.25);
    env.sun = sun * 0.4;
    env.night = 1 - d;
  } else {
    a[0] = sky[0]; a[1] = sky[1]; a[2] = sky[2];
    env.sun = sun;
    env.night = clamp((0.95 - lum(sky)) / 0.55, 0, 1);
  }

  // Overcast takes the light out of the day (and the moon out of the night).
  if (!indoor && !under && wKind !== 'none' && wBlend > 0) {
    const w = WEATHER_SKY[wKind];
    if (w) {
      const k = clamp(env.weatherAmt * 1.25, 0, 1);
      for (let i = 0; i < 3; i++) { _wx[i] = lerp(1, w[i], k); a[i] *= _wx[i]; }
      if (wKind !== 'leaves' && wKind !== 'snow') env.sun *= 1 - 0.8 * k;
    }
  }
  env.wet = (!indoor && !under && (wKind === 'rain' || wKind === 'storm')) ? wBlend : 0;

  // A partial darkness (a ruin's cellar authored with `dark`) sinks towards the underground's.
  const dark = map && !under ? clamp(map.dark || 0, 0, 1) : 0;
  if (dark > 0) for (let i = 0; i < 3; i++) a[i] = lerp(a[i], UNDER[i], dark);

  // A map-authored wash (crypts, the Redbrand cellar).
  if (map && map.ambient && map.ambient.color) {
    const c = hexRgb(map.ambient.color);
    const k = clamp(map.ambient.alpha != null ? map.ambient.alpha : 0.3, 0, 1) * (under ? 0.4 : 1);
    for (let i = 0; i < 3; i++) a[i] *= lerp(1, c[i], k);
  }

  if (o.sunlight) { a[0] = TRUE_SUN[0]; a[1] = TRUE_SUN[1]; a[2] = TRUE_SUN[2]; }

  // How much a lamp shows against this ambient: nothing at noon, fully at night.
  env.lights = clamp((0.97 - lum(a)) / 0.5, 0, 1);

  gather(o);
  return env;
}

const _hex = new Map();
function hexRgb(hex) {
  let c = _hex.get(hex);
  if (c) return c;
  const s = String(hex).replace('#', '');
  const n = parseInt(s.length === 3 ? s.split('').map((ch) => ch + ch).join('') : s, 16) || 0;
  c = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  _hex.set(hex, c);
  return c;
}

// Active-light records are pooled: the frame loop reuses them.
const pool = [];
const heldPoint = { x: 0, y: 0 };
function slot(i) {
  let r = pool[i];
  if (!r) { r = { x: 0, y: 0, fx: 0, fy: 0, def: null, str: 1, phase: 0 }; pool[i] = r; }
  return r;
}

/** Collect every light that can touch the view this frame into env.active. */
function gather(o) {
  const act = env.active;
  act.length = 0;
  const map = env.map;
  if (!map) return;
  const cam = o.cam || { x: 0, y: 0 };
  const x0 = cam.x, y0 = cam.y, x1 = cam.x + VW, y1 = cam.y + VH;
  const min = env.minutes;
  const nightNow = env.night;
  const dayNow = 1 - env.night;
  let n = 0;
  const push = (x, y, fx, fy, def, str, phase) => {
    if (str <= 0.01 || n >= 96) return;
    const r = def.r + 2;
    if (x + r < x0 || x - r > x1 || y + r < y0 || y - r > y1) return;
    const s = slot(n++);
    s.x = x; s.y = y; s.fx = fx; s.fy = fy; s.def = def; s.str = str; s.phase = phase;
    act.push(s);
  };

  // How late in the night a house keeps its candle lit: the plain windows go
  // dark one by one from about midnight, until only the lit ones are left.
  const m = ((min % 1440) + 1440) % 1440;
  const lateness = m >= 1320 ? (m - 1320) / 240 : m < 300 ? 0.5 + m / 600 : 0;

  for (const L of tileLights(map)) {
    const def = L.def;
    let str = def.i;
    if (def.when === 'night') {
      str *= clamp((nightNow - 0.15) / 0.5, 0, 1);
      if (L.late < lateness) continue;
    } else if (def.when === 'day') {
      if (env.place !== 'interior') continue;
      str *= clamp((dayNow - 0.2) / 0.5, 0, 1);
    }
    push(L.x, L.y, L.fx, L.fy, def, str, L.phase);
  }

  // Lights other modules keep on the map while they burn (campfires).
  const extra = map._glows;
  if (Array.isArray(extra)) {
    for (const g of extra) {
      if (!g) continue;
      const def = g.kind ? KINDS[g.kind] : g.def ? legacyKind(g.def) : null;
      if (!def) continue;
      const px = g.px != null ? g.px : g.x * TILE + TILE / 2;
      const py = g.py != null ? g.py : g.y * TILE + TILE / 2;
      push(px, py, px, py - 4, def, def.i, g.phase || 0);
    }
  }

  // Ask after computing this frame's sky: travelling indoors or crossing
  // dawn must change the visible lantern and its pool in the same frame.
  let heldCount = 0;
  for (const e of o.entities || []) {
    if (!e || e.removed || e.hidden || e.alpha === 0 || e === o.leader
      || typeof e.heldLightNow !== 'function' || typeof e.heldLightAt !== 'function') continue;
    const held = e.heldLightNow();
    const def = held === 'torch' ? KINDS.torchHeld : held === 'lantern' ? KINDS.handLantern : null;
    if (!def) continue;
    e.heldLightAt(heldPoint);
    const before = n;
    push(heldPoint.x, heldPoint.y, heldPoint.x, heldPoint.y, def, def.i, e.idleOffset || 0);
    if (n > before && ++heldCount >= 12) break;
  }

  // This frame's own: the party's light and spell light.
  if (Array.isArray(o.extra)) {
    for (const e of o.extra) {
      if (!e) continue;
      const def = e.def || KINDS[e.kind];
      if (!def) continue;
      push(e.x, e.y, e.fx != null ? e.fx : e.x, e.fy != null ? e.fy : e.y, def, e.str != null ? e.str : def.i, e.phase || 0);
    }
  }
  const p = o.party;
  if (p && p.light && KINDS[p.light]) {
    let def = KINDS[p.light];
    if (p.light === 'spell' && p.radius) def = spellKind(p.radius);
    push(p.x, p.y, p.x, p.y, def, def.i, 0.37);
  }
}

const spellKinds = new Map();
function spellKind(radius) {
  // The Light cantrip: bright for `radius`, dim as far again.
  const r = clamp(Math.round(radius * 1.7), 60, 200);
  let k = spellKinds.get(r);
  if (!k) { k = { ...KINDS.spell, r }; spellKinds.set(r, k); }
  return k;
}

// ---------------------------------------------------------------------------
// 6. PASSES
// ---------------------------------------------------------------------------

let lightMap = null, lmg = null;

function lightCanvas() {
  if (!lightMap) {
    lightMap = makeCanvas(VW, VH);
    lmg = lightMap ? lightMap.getContext('2d') : null;
  }
  return lmg;
}

const rgbStr = (c) => `rgb(${Math.round(255 * clamp(c[0], 0, 1))},${Math.round(255 * clamp(c[1], 0, 1))},${Math.round(255 * clamp(c[2], 0, 1))})`;

/**
 * The grade: the light map (ambient + pools) multiplied over the world. `hooks`
 * lets other passes paint into the light map before the pools go in (cloud
 * shadows are a darkening of the ambient; they must not dim a lamp).
 *
 * `direct`: ctx is a canvas of its own that the stage multiplies over the
 * world at composite time (the 'grade' layer always is), so the light map is
 * painted straight into it and one full-screen blit is saved. Without it (the
 * stage's flat debug mode, where every layer shares one canvas) the map is
 * built offscreen and multiplied on.
 */
function drawGrade(ctx, cam, hooks, direct = false) {
  const a = env.amb;
  const plain = a[0] > 0.995 && a[1] > 0.995 && a[2] > 0.995;
  const shaded = hooks && hooks.shade;
  if (plain && !shaded) return;                  // noon under a clear sky: nothing to grade
  const g = direct ? ctx : lightCanvas();
  if (!g) return;
  g.save();
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
  g.fillStyle = rgbStr(a);
  g.fillRect(0, 0, VW, VH);
  if (shaded) { try { hooks.shade(g, cam, env); } catch (e) { /* the air never breaks the light */ } }
  g.globalCompositeOperation = 'source-over';

  const L = env.lights;
  if (L > 0.01 && env.active.length) {
    g.globalCompositeOperation = 'lighter';
    const t = env.t;
    for (const s of env.active) {
      const def = s.def;
      const str = s.str * (def.when === 'day' ? 1 : L);
      if (str <= 0.01) continue;
      const step = def.flick >= 0.3 ? flickStep(t, s.phase) : 0;
      const st = stamp(def.r + step * Math.round(1 + def.flick), def.ry, def.c, BAND_R, BAND_V, 'pool');
      if (!st) continue;
      g.globalAlpha = clamp(str * (def.flick ? lerp(1, flickAmp(t, s.phase), def.flick) : 1), 0, 1);
      g.drawImage(st.canvas, Math.round(s.x - cam.x) - st.cx, Math.round(s.y - cam.y) - st.cy);
      // The flame (or the pane) is a light, not a thing the light falls on.
      if (def.core) {
        const cs = stamp(def.core, 1, def.c, [0.6, 1.0], [1.0, 0.7], 'core');
        if (cs) {
          g.globalAlpha = clamp(str * 1.2, 0, 1);
          g.drawImage(cs.canvas, Math.round(s.fx - cam.x) - cs.cx, Math.round(s.fy - cam.y) - cs.cy);
        }
      }
    }
  }
  g.restore();
  if (direct) return;

  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 1;
  ctx.drawImage(lightMap, 0, 0);
  ctx.restore();
}

/** Halos round the flames and panes, additive, on 'glow'. */
function drawGlow(ctx, cam) {
  const L = env.lights;
  if (L <= 0.02 || !env.active.length) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const t = env.t;
  for (const s of env.active) {
    const def = s.def;
    if (!def.halo) continue;
    const str = s.str * L * def.halo;
    if (str <= 0.02) continue;
    const r = Math.max(4, Math.round(def.r * 0.34));
    const step = def.flick >= 0.5 ? flickStep(t + 0.37, s.phase) : 0;
    const st = stamp(r + step, 0.9, def.c, HALO_R, HALO_V, 'halo');
    if (!st) continue;
    ctx.globalAlpha = clamp(str * 0.38, 0, 1);
    ctx.drawImage(st.canvas, Math.round(s.fx - cam.x) - st.cx, Math.round(s.fy - cam.y) - st.cy);
  }
  ctx.restore();
}

export const Lighting = {
  env,
  update,
  /** Add spell pools after FX draws, before the grade, using this frame's positions. */
  addLights(sources, cam = { x: 0, y: 0 }) {
    for (const e of sources || []) {
      if (!e || env.active.length >= 96) continue;
      const def = e.def || KINDS[e.kind];
      if (!def) continue;
      const str = e.str != null ? e.str : def.i;
      const r = def.r + 2;
      if (str <= 0.01 || e.x + r < cam.x || e.x - r > cam.x + VW
        || e.y + r < cam.y || e.y - r > cam.y + VH) continue;
      const s = slot(env.active.length);
      s.x = e.x; s.y = e.y; s.fx = e.fx ?? e.x; s.fy = e.fy ?? e.y;
      s.def = def; s.str = str; s.phase = e.phase || 0;
      env.active.push(s);
    }
  },
  drawGrade,
  drawGlow,
  /** Would the grade change anything? False at noon under a clear sky. */
  wantsGrade() { const a = env.amb; return a[0] < 0.995 || a[1] < 0.995 || a[2] < 0.995; },
  kinds: KINDS,
  skyAt, sunAt, isUnderground, tileLights, invalidateLights,
  /** Tests and tools: how many stamps are cached. */
  get stamps() { return stampCache.size; },
};

export default Lighting;
