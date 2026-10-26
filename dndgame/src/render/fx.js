// render/fx.js — the visual effects layer: particles, floating combat text, projectiles,
// beams, AoE rings, melee sweeps, screen shake/flash/tint and persistent weather.
//
// Everything here is cosmetic. The rules engine never waits on FX except through
// FX.busy(), which reports whether a *blocking* effect (a loosed arrow, a lightning
// beam, a meteor shower) is still travelling — that is how BattleScene keeps a spell
// animation on screen before printing the damage.
//
// Design notes:
//   • Particles live in a fixed 600-slot ring buffer. Spawning past the cap silently
//     overwrites the OLDEST particle, so a fireball storm can never allocate or stall.
//   • Draw paths allocate nothing per frame: no closures, no array methods, no string
//     building. Colours, shaded colours, glow sprites and rasterised text are memoised.
//   • Cosmetic randomness runs on its own RNG stream forked off the campaign seed. If
//     a spark consumed a number from the global `rng`, adding a particle would silently
//     change the next attack roll.

import { VIEW_W, VIEW_H, clamp } from '../constants.js';
import { rng, makeRNG } from '../core/rng.js';

// Private cosmetic stream. rng.fork() derives from the seed WITHOUT consuming it.
let fxr = rng.fork('fx-visuals');

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

const MAX_PARTICLES = 600;      // hard cap; oldest is recycled first
const MAX_WEATHER = 260;        // screen-space weather motes
const CULL = 56;                // px of slack around the view before we skip a draw
const TEXT_CACHE_MAX = 256;
const COLOR_CACHE_MAX = 512;
const GLOW_CACHE_MAX = 48;

/** Named colours so callers can say FX.floater(x,y,'12','damage'). */
const COLORS = {
  damage: '#ff5f4f', crit: '#ffd34a', heal: '#5fd07a', miss: '#b9b3a6',
  temp: '#7fd3ff', xp: '#c07af0', gold: '#ffb03a', ink: '#f4ecd8',
  poison: '#8fd14f', necrotic: '#8a5fd0', radiant: '#ffe9a3', fire: '#ff8a2a',
  cold: '#9fe4ff', lightning: '#ffe066', acid: '#b6f04a', force: '#c9a6ff',
  psychic: '#ff7fd0', thunder: '#cbd4ff', blood: '#8e1d1d', shadow: '#0b0a10',
};

// Per-shape particle defaults. Spawners override any of these.
const SHAPE_DEF = {
  square: { speed: 54, life: 0.50, size: 2, gravity: 130, drag: 1.8, grow: 0.25 },
  spark: { speed: 112, life: 0.34, size: 3, gravity: 70, drag: 3.4, grow: 0.1, glow: 1 },
  smoke: { speed: 18, life: 1.15, size: 3, gravity: -16, drag: 1.2, grow: 2.4, alpha: 0.5 },
  blood: { speed: 74, life: 0.62, size: 2, gravity: 300, drag: 0.7, grow: 0.5 },
  leaf: { speed: 26, life: 1.7, size: 3, gravity: 26, drag: 1.0, grow: 1, sway: 1 },
  ember: { speed: 36, life: 0.95, size: 2, gravity: -50, drag: 1.3, grow: 0.4, glow: 1, flick: 1 },
};

// ---------------------------------------------------------------------------
// Colour helpers (all memoised — never build a colour string inside a draw loop)
// ---------------------------------------------------------------------------

const rgbCache = new Map();
const shadeCache = new Map();

/** '#rgb' / '#rrggbb' / named FX colour -> packed [r,g,b] (cached array, do not mutate). */
function rgbOf(color) {
  let c = rgbCache.get(color);
  if (c) return c;
  let hex = COLORS[color] || color || '#ffffff';
  if (hex[0] !== '#') hex = '#ffffff';
  if (hex.length === 4) hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
  const n = parseInt(hex.slice(1, 7), 16) || 0;
  c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  if (rgbCache.size > COLOR_CACHE_MAX) rgbCache.clear();
  rgbCache.set(color, c);
  return c;
}

function shadeKey(c, amt) {
  const f = amt >= 0
    ? [c[0] + (255 - c[0]) * amt, c[1] + (255 - c[1]) * amt, c[2] + (255 - c[2]) * amt]
    : [c[0] * (1 + amt), c[1] * (1 + amt), c[2] * (1 + amt)];
  return '#' + ((1 << 24) + (Math.round(f[0]) << 16) + (Math.round(f[1]) << 8) + Math.round(f[2]))
    .toString(16).slice(1);
}

/** Lighten (amt>0) or darken (amt<0) toward white/black by a 0..1 fraction. Memoised. */
function shade(color, amt) {
  const k = color + '|' + amt;
  let v = shadeCache.get(k);
  if (v) return v;
  v = shadeKey(rgbOf(color), amt);
  if (shadeCache.size > COLOR_CACHE_MAX) shadeCache.clear();
  shadeCache.set(k, v);
  return v;
}

// A radial glow sprite per colour, rasterised once and blitted (nearest-neighbour, so
// it stays chunky and in keeping with the 16px art).
const glowCache = new Map();
function glowSprite(color) {
  let c = glowCache.get(color);
  if (c) return c;
  if (typeof document === 'undefined') return null;
  const R = 16;
  c = document.createElement('canvas');
  c.width = c.height = R * 2;
  const g = c.getContext('2d');
  const [r, gg, b] = rgbOf(color);
  const grd = g.createRadialGradient(R, R, 0, R, R, R);
  grd.addColorStop(0, `rgba(${r},${gg},${b},1)`);
  grd.addColorStop(0.32, `rgba(${r},${gg},${b},0.62)`);
  grd.addColorStop(0.68, `rgba(${r},${gg},${b},0.20)`);
  grd.addColorStop(1, `rgba(${r},${gg},${b},0)`);
  g.fillStyle = grd;
  g.fillRect(0, 0, R * 2, R * 2);
  if (glowCache.size > GLOW_CACHE_MAX) glowCache.clear();
  glowCache.set(color, c);
  return c;
}

/** Blit the cached glow centred on (x,y) at `size` px across. */
function drawGlow(ctx, color, x, y, size, alpha) {
  const g = glowSprite(color);
  if (!g) return;
  const a = ctx.globalAlpha;
  ctx.globalAlpha = a * alpha;
  ctx.drawImage(g, x - size / 2, y - size / 2, size, size);
  ctx.globalAlpha = a;
}

// ---------------------------------------------------------------------------
// 5x7 bitmap font — combat text must be crisp at the pixel scale, and the spec
// forbids web fonts. Rows are '1' = ink. Lowercase folds to uppercase.
// ---------------------------------------------------------------------------

const FONT_SRC = {
  '0': '01110/10001/10011/10101/11001/10001/01110',
  '1': '00100/01100/00100/00100/00100/00100/01110',
  '2': '01110/10001/00001/00010/00100/01000/11111',
  '3': '11111/00010/00100/00010/00001/10001/01110',
  '4': '00010/00110/01010/10010/11111/00010/00010',
  '5': '11111/10000/11110/00001/00001/10001/01110',
  '6': '00110/01000/10000/11110/10001/10001/01110',
  '7': '11111/00001/00010/00100/01000/01000/01000',
  '8': '01110/10001/10001/01110/10001/10001/01110',
  '9': '01110/10001/10001/01111/00001/00010/01100',
  A: '01110/10001/10001/11111/10001/10001/10001',
  B: '11110/10001/10001/11110/10001/10001/11110',
  C: '01110/10001/10000/10000/10000/10001/01110',
  D: '11100/10010/10001/10001/10001/10010/11100',
  E: '11111/10000/10000/11110/10000/10000/11111',
  F: '11111/10000/10000/11110/10000/10000/10000',
  G: '01110/10001/10000/10111/10001/10001/01111',
  H: '10001/10001/10001/11111/10001/10001/10001',
  I: '01110/00100/00100/00100/00100/00100/01110',
  J: '00111/00010/00010/00010/00010/10010/01100',
  K: '10001/10010/10100/11000/10100/10010/10001',
  L: '10000/10000/10000/10000/10000/10000/11111',
  M: '10001/11011/10101/10101/10001/10001/10001',
  N: '10001/11001/11001/10101/10011/10011/10001',
  O: '01110/10001/10001/10001/10001/10001/01110',
  P: '11110/10001/10001/11110/10000/10000/10000',
  Q: '01110/10001/10001/10001/10101/10010/01101',
  R: '11110/10001/10001/11110/10100/10010/10001',
  S: '01111/10000/10000/01110/00001/00001/11110',
  T: '11111/00100/00100/00100/00100/00100/00100',
  U: '10001/10001/10001/10001/10001/10001/01110',
  V: '10001/10001/10001/10001/10001/01010/00100',
  W: '10001/10001/10001/10101/10101/11011/10001',
  X: '10001/10001/01010/00100/01010/10001/10001',
  Y: '10001/10001/01010/00100/00100/00100/00100',
  Z: '11111/00001/00010/00100/01000/10000/11111',
  '+': '00000/00100/00100/11111/00100/00100/00000',
  '-': '00000/00000/00000/11111/00000/00000/00000',
  '!': '00100/00100/00100/00100/00100/00000/00100',
  '?': '01110/10001/00001/00010/00100/00000/00100',
  '.': '00000/00000/00000/00000/00000/00000/00100',
  ',': '00000/00000/00000/00000/00100/00100/01000',
  ':': '00000/00100/00100/00000/00100/00100/00000',
  ';': '00000/00100/00100/00000/00100/00100/01000',
  "'": '00100/00100/01000/00000/00000/00000/00000',
  '"': '01010/01010/00000/00000/00000/00000/00000',
  '*': '00000/10101/01110/11111/01110/10101/00000',
  '/': '00001/00010/00010/00100/01000/01000/10000',
  '\\': '10000/01000/01000/00100/00010/00010/00001',
  '(': '00010/00100/01000/01000/01000/00100/00010',
  ')': '01000/00100/00010/00010/00010/00100/01000',
  '[': '01110/01000/01000/01000/01000/01000/01110',
  ']': '01110/00010/00010/00010/00010/00010/01110',
  '%': '11001/11010/00010/00100/01000/01011/10011',
  '#': '01010/01010/11111/01010/11111/01010/01010',
  '&': '01100/10010/10100/01000/10101/10010/01101',
  '<': '00010/00100/01000/10000/01000/00100/00010',
  '>': '01000/00100/00010/00001/00010/00100/01000',
  '=': '00000/00000/11111/00000/11111/00000/00000',
  '@': '01110/10001/10111/10101/10111/10000/01110',
  '$': '00100/01111/10100/01110/00101/11110/00100',
  '°': '01100/10010/01100/00000/00000/00000/00000',
  '×': '00000/10001/01010/00100/01010/10001/00000',
  '♥': '01010/11111/11111/11111/01110/00100/00000',
  '♦': '00100/01110/11111/11111/01110/00100/00000',
  '★': '00100/00100/11111/01110/01010/10001/00000',
  '✦': '00100/00100/10101/01110/10101/00100/00100',
  '…': '00000/00000/00000/00000/00000/00000/10101',
};

// Split once into row arrays for fast lookup.
const FONT = {};
for (const k in FONT_SRC) FONT[k] = FONT_SRC[k].split('/');

const GLYPH_W = 5, GLYPH_H = 7, ADVANCE = 6, SPACE_ADV = 4;

function glyphFor(ch) {
  return FONT[ch] || FONT[ch.toUpperCase()] || null;
}

/** Width in px of `text` at scale 1 (add 2 for the outline pad). */
function textWidth1(text) {
  let w = 0;
  for (let i = 0; i < text.length; i++) w += text[i] === ' ' ? SPACE_ADV : ADVANCE;
  return w > 0 ? w - 1 : 0;
}

/** Stamp the glyph mask into `g` at (dx,dy) in the current fillStyle. */
function paintText(g, text, dx, dy) {
  let x = dx;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === ' ') { x += SPACE_ADV; continue; }
    const rows = glyphFor(ch);
    if (!rows) { x += ADVANCE; continue; }
    for (let ry = 0; ry < GLYPH_H; ry++) {
      const row = rows[ry];
      let run = -1;
      for (let rx = 0; rx <= GLYPH_W; rx++) {
        const on = rx < GLYPH_W && row.charCodeAt(rx) === 49; // '1'
        if (on && run < 0) run = rx;
        else if (!on && run >= 0) { g.fillRect(x + run, dy + ry, rx - run, 1); run = -1; }
      }
    }
    x += ADVANCE;
  }
}

// Rasterised strings are cached at scale 1 and blitted scaled, so a crit pop can use
// any fractional scale without re-rasterising and the cache stays tiny.
const textCache = new Map();
function textSprite(text, color, outline) {
  const key = text + '|' + color + '|' + outline;
  let c = textCache.get(key);
  if (c !== undefined) return c;
  if (typeof document === 'undefined') return null;
  const w = textWidth1(text) + 2, h = GLYPH_H + 2;
  c = document.createElement('canvas');
  c.width = Math.max(1, w); c.height = h;
  const g = c.getContext('2d');
  if (outline) {
    // 8-way outline so numbers read over any tile.
    g.fillStyle = outline;
    for (let oy = 0; oy <= 2; oy++) {
      for (let ox = 0; ox <= 2; ox++) {
        if (ox === 1 && oy === 1) continue;
        paintText(g, text, ox, oy);
      }
    }
  } else {
    g.fillStyle = 'rgba(0,0,0,0.55)';   // plain drop shadow
    paintText(g, text, 2, 2);
  }
  g.fillStyle = color;
  paintText(g, text, 1, 1);
  if (textCache.size > TEXT_CACHE_MAX) textCache.clear();
  textCache.set(key, c);
  return c;
}

// ---------------------------------------------------------------------------
// Smooth value noise for screen shake (deterministic, allocation-free)
// ---------------------------------------------------------------------------

const NOISE = new Float32Array(256);
for (let i = 0; i < 256; i++) NOISE[i] = fxr.float(-1, 1);

function noise1(t) {
  const i = Math.floor(t), f = t - i;
  const a = NOISE[i & 255], b = NOISE[(i + 1) & 255];
  const u = f * f * (3 - 2 * f);        // smoothstep
  return a + (b - a) * u;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** Pre-allocated particle ring. Spawning past the cap overwrites the oldest slot. */
const PARTICLES = new Array(MAX_PARTICLES);
for (let i = 0; i < MAX_PARTICLES; i++) {
  PARTICLES[i] = {
    alive: false, x: 0, y: 0, vx: 0, vy: 0, ax: 0, ay: 0, age: 0, life: 1,
    size: 2, grow: 0.3, drag: 1, sway: 0, glow: 0, flick: 0, rot: 0, vr: 0,
    color: '#fff', dark: '#000', shape: 'square', alpha: 1, seed: 0, z: 0,
  };
}
let pHead = 0;

const floaters = [];
const projectiles = [];
const beams = [];
const rings = [];
const slashes = [];
const novas = [];
const rains = [];
const chains = [];
const auras = [];

// Screen-space state
const shakeState = { trauma: 0, decay: 3.2, amp: 6, x: 0, y: 0 };
const shakeOut = { x: 0, y: 0 };          // reused; valid for the current frame
let flashFx = null;                        // { color, dur, age, alpha }
let tintFx = null;                         // { color, alpha, dur, age, mode }
let vignetteFx = null;                     // { amount, color, dur, age }
let vigGrad = null, vigKey = '';

// Weather
const WEATHER = new Array(MAX_WEATHER);
for (let i = 0; i < MAX_WEATHER; i++) {
  WEATHER[i] = { x: 0, y: 0, vx: 0, vy: 0, size: 1, z: 0, phase: 0, rot: 0, vr: 0, len: 4, kind: '' };
}
let wKind = 'none', wIntensity = 0, wCount = 0, wBlend = 0, wNext = null;
let wWind = 0, wWindTarget = 0, wFogA = 0, wFogB = 0, fogCanvas = null;
let wGust = 0;                    // seconds left in the current gust swell

// Effect systems plugged in with FX.addSystem (render/vfx.js): they tick, draw,
// block and clear with FX, so every scene that already calls FX.draw shows them.
const SYSTEMS = [];

// Camera captured by the last FX.draw(), so screen-space weather can parallax.
let camX = 0, camY = 0, lastCamX = 0, lastCamY = 0;
let clock = 0;

// ---------------------------------------------------------------------------
// Small internals
// ---------------------------------------------------------------------------

/** Compact an effect array in place (no allocation, preserves order). */
function sweep(arr) {
  let w = 0;
  for (let i = 0; i < arr.length; i++) {
    const e = arr[i];
    if (!e.done) arr[w++] = e;
  }
  arr.length = w;
}

/** Grab the next particle slot, recycling the oldest if we're at the cap. */
function nextParticle() {
  const p = PARTICLES[pHead];
  pHead = (pHead + 1) % MAX_PARTICLES;
  p.alive = true; p.age = 0; p.life = 0.5;
  p.vx = 0; p.vy = 0; p.ax = 0; p.ay = 0;
  p.size = 2; p.grow = 0.3; p.drag = 1; p.sway = 0; p.glow = 0; p.flick = 0;
  p.rot = 0; p.vr = 0; p.alpha = 1; p.z = 0;
  p.seed = fxr.float(0, 6.283);
  return p;
}

/** 'up'|'down'|'left'|'right' | radians | {x,y} -> radians. */
function angleOfDir(dir) {
  if (typeof dir === 'number') return dir;
  if (dir && typeof dir === 'object') return Math.atan2(dir.y || 0, dir.x || 0);
  switch (dir) {
    case 'up': return -Math.PI / 2;
    case 'down': return Math.PI / 2;
    case 'left': return Math.PI;
    default: return 0;
  }
}

/** Reduced-motion halves every particle budget (spec §FX). */
function budget(n) {
  const c = Math.max(0, Math.round(n));
  return FX.reducedMotion ? Math.ceil(c / 2) : c;
}

function easeOut3(t) { const u = 1 - t; return 1 - u * u * u; }
function easeIn2(t) { return t * t; }

/** Rough on-screen test in world space (called with world coords). */
function visible(x, y, pad) {
  const sx = x - camX, sy = y - camY, m = pad || CULL;
  return sx > -m && sy > -m && sx < VIEW_W + m && sy < VIEW_H + m;
}

// ---------------------------------------------------------------------------
// The effects object
// ---------------------------------------------------------------------------

export const FX = {
  /** Master switch. When false, decorative effects are skipped entirely and
   *  projectile onHit callbacks fire immediately so battle logic never stalls. */
  enabled: true,
  /** Accessibility: halves particle counts and disables screen shake. */
  reducedMotion: false,
  /** Global time scale for effects (hooks up to the "battle speed" setting). */
  speed: 1,
  COLORS,
  maxParticles: MAX_PARTICLES,

  /**
   * Plug in an effect system: { update(dt), draw(ctx, camX, camY), drawScreen(ctx),
   * busy(), clear(all), active(part), counts() }, every member optional. `dt` is
   * already scaled by FX.speed and clamped like FX's own.
   */
  addSystem(sys) {
    if (sys && !SYSTEMS.includes(sys)) SYSTEMS.push(sys);
    return sys;
  },

  // =========================================================================
  // Spawners
  // =========================================================================

  /**
   * Rising, fading combat text.
   *   opts: { size:number|'sm'|'md'|'lg', rise=22, dur=1.0, crit, delay, outline,
   *           vx, gravity, stagger=true, blocking }
   * Crits render larger with an elastic scale-pop. Simultaneous floaters on nearly
   * the same spot are staggered in time and offset sideways so two hits from a
   * two-weapon attack don't stack into an unreadable blob.
   */
  floater(x, y, text, color = COLORS.ink, opts) {
    const o = opts || {};
    const str = String(text);
    if (!str) return null;
    const crit = !!o.crit;
    let scale = o.size;
    if (typeof scale === 'string') scale = scale === 'lg' ? 2 : scale === 'sm' ? 0.75 : 1;
    if (typeof scale !== 'number') scale = crit ? 1.6 : 1;

    let delay = o.delay || 0;
    let ox = 0, oy = 0;
    if (o.stagger !== false) {
      // Count live floaters occupying roughly this spot and step the newcomer aside.
      let near = 0;
      for (let i = 0; i < floaters.length; i++) {
        const f = floaters[i];
        if (f.done) continue;
        if (Math.abs(f.x0 - x) < 20 && Math.abs(f.y0 - y) < 18) near++;
      }
      if (near) {
        delay += near * 0.10;
        ox = (near % 2 ? 1 : -1) * (5 + ((near / 2) | 0) * 4);
        oy = -Math.min(14, near * 5);
      }
    }

    const rec = {
      kind: 'floater', done: false, blocks: !!o.blocking,
      x0: x, y0: y, x: x + ox, y: y + oy,
      text: str,
      color: COLORS[color] || color || COLORS.ink,
      outline: o.outline === false ? null : (typeof o.outline === 'string' ? o.outline : COLORS.shadow),
      rise: o.rise == null ? 22 : o.rise,
      dur: Math.max(0.1, o.dur == null ? 1.0 : o.dur),
      age: -delay, crit, scale,
      vx: o.vx || (crit ? 0 : fxr.float(-4, 4)),
      gravity: o.gravity || 0,
    };
    floaters.push(rec);
    // A crit gets a spray of sparks behind the number for extra punch.
    if (crit && FX.enabled) FX.burst(x, y - 4, rec.color, 8, { shape: 'spark', speed: 70, life: 0.3 });
    return rec;
  },

  /**
   * A puff of particles.
   *   opts: { speed, spread, gravity, life, size, shape, dir, drag, grow, glow,
   *           sway, alpha, colorAlt, jitter }
   * `spread` is the half-angle (radians) of the cone around `dir`; omit `dir` for a
   * full circle. Shapes: square | spark | smoke | blood | leaf | ember.
   */
  burst(x, y, color = COLORS.ink, count = 12, opts) {
    if (!FX.enabled) return 0;
    const o = opts || {};
    const shape = o.shape || 'square';
    const def = SHAPE_DEF[shape] || SHAPE_DEF.square;
    const n = budget(count);
    const speed = o.speed == null ? def.speed : o.speed;
    const life = o.life == null ? def.life : o.life;
    const size = o.size == null ? def.size : o.size;
    const grav = o.gravity == null ? def.gravity : o.gravity;
    const drag = o.drag == null ? def.drag : o.drag;
    const grow = o.grow == null ? def.grow : o.grow;
    const alpha = o.alpha == null ? (def.alpha == null ? 1 : def.alpha) : o.alpha;
    const hasDir = o.dir !== undefined && o.dir !== null;
    const base = hasDir ? angleOfDir(o.dir) : 0;
    const spread = o.spread == null ? (hasDir ? 0.6 : Math.PI) : o.spread;
    const hex = COLORS[color] || color;
    const dark = shade(hex, -0.45);
    const jitter = o.jitter == null ? 2 : o.jitter;

    for (let i = 0; i < n; i++) {
      const p = nextParticle();
      const a = hasDir ? base + fxr.float(-spread, spread) : fxr.float(-Math.PI, Math.PI);
      const sp = speed * fxr.float(0.55, 1.3);
      p.x = x + fxr.float(-jitter, jitter);
      p.y = y + fxr.float(-jitter, jitter);
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp;
      p.ay = grav;
      p.life = life * fxr.float(0.75, 1.25);
      p.size = size * fxr.float(0.7, 1.35);
      p.grow = grow;
      p.drag = drag;
      p.sway = o.sway == null ? (def.sway || 0) : o.sway;
      p.glow = o.glow == null ? (def.glow || 0) : o.glow;
      p.flick = def.flick || 0;
      p.alpha = alpha;
      p.shape = shape;
      p.color = o.colorAlt && fxr.chance(0.35) ? (COLORS[o.colorAlt] || o.colorAlt) : hex;
      p.dark = dark;
      p.rot = fxr.float(0, 6.283);
      p.vr = shape === 'leaf' ? fxr.float(-4, 4) : fxr.float(-2, 2);
    }
    return n;
  },

  /**
   * A travelling projectile. Returns the record; `onHit(x,y)` fires once on arrival.
   *   opts: { color, shape:'arrow'|'orb'|'bolt'|'rock'|'star'|'dagger', speed=240,
   *           arc=0, trail, onHit, rotate, dur, impact:{color,count,shape}, blocking }
   * `arc` lifts the sprite off the ground in a parabola (thrown rocks, lobbed vials).
   * `rotate`: true = face travel; 'spin' or a number = spin rate (rad/s).
   */
  projectile(x1, y1, x2, y2, opts) {
    const o = opts || {};
    if (!FX.enabled) { if (o.onHit) o.onHit(x2, y2); return null; }
    const dx = x2 - x1, dy = y2 - y1;
    const dist = Math.hypot(dx, dy);
    const speed = o.speed || 240;
    const dur = o.dur || Math.max(0.06, dist / Math.max(1, speed));
    const shape = o.shape || 'orb';
    const hex = COLORS[o.color] || o.color || COLORS.ink;
    const rec = {
      kind: 'proj', done: false,
      blocks: o.blocking === undefined ? true : !!o.blocking,
      x1, y1, x2, y2, dx, dy, dist, dur, age: 0, x: x1, y: y1, ang: Math.atan2(dy, dx),
      color: hex, dark: shade(hex, -0.4), light: shade(hex, 0.55),
      shape, arc: o.arc || 0, trail: o.trail === undefined ? (shape === 'orb' || shape === 'bolt') : o.trail,
      onHit: o.onHit || null, impact: o.impact || null,
      rotate: o.rotate === undefined ? (shape === 'arrow' || shape === 'dagger' || shape === 'bolt') : o.rotate,
      spin: o.rotate === 'spin' ? 9 : (typeof o.rotate === 'number' ? o.rotate : (shape === 'rock' || shape === 'star' ? 6 : 0)),
      rot: fxr.float(0, 6.283), trailAcc: 0,
      verts: null,
    };
    if (shape === 'rock') { // one irregular silhouette per rock, allocated once
      rec.verts = new Float32Array(12);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2, r = fxr.float(0.65, 1);
        rec.verts[i * 2] = Math.cos(a) * r;
        rec.verts[i * 2 + 1] = Math.sin(a) * r;
      }
    }
    projectiles.push(rec);
    return rec;
  },

  /**
   * A beam between two points. `jagged` draws a lightning polyline that re-kinks a
   * few times a second; otherwise it's a clean ray (fire ray, moonbeam, eldritch blast).
   *   opts: { width=3, jagged, segments, glow, blocking }
   */
  beam(x1, y1, x2, y2, color = COLORS.lightning, dur = 0.3, opts) {
    if (!FX.enabled) return null;
    const o = opts || {};
    const hex = COLORS[color] || color;
    const segs = o.segments || (o.jagged ? Math.max(4, Math.min(14, Math.round(Math.hypot(x2 - x1, y2 - y1) / 10))) : 1);
    const rec = {
      kind: 'beam', done: false,
      blocks: o.blocking === undefined ? true : !!o.blocking,
      x1, y1, x2, y2, color: hex, light: shade(hex, 0.7), dark: shade(hex, -0.35),
      dur: Math.max(0.06, dur), age: 0,
      width: o.width || 3, jagged: !!o.jagged, glow: o.glow !== false,
      segs, off: new Float32Array(segs + 1), jit: 0,
    };
    jitterBeam(rec);
    beams.push(rec);
    return rec;
  },

  /**
   * An AoE indicator / shockwave ring. `dur <= 0` means persistent (a targeting
   * reticle) — keep the returned handle and FX.remove() it.
   *   opts: { width=2, fill, expand=true, pulse, segments, blocking }
   */
  ring(x, y, radius, color = COLORS.ink, dur = 0.5, opts) {
    if (!FX.enabled) return null;
    const o = opts || {};
    const hex = COLORS[color] || color;
    const rec = {
      kind: 'ring', done: false, blocks: !!o.blocking,
      x, y, radius, color: hex, light: shade(hex, 0.5), dark: shade(hex, -0.4),
      dur: dur > 0 ? dur : 0, persistent: !(dur > 0), age: 0,
      width: o.width || 2, fill: o.fill === true ? 0.16 : (typeof o.fill === 'number' ? o.fill : 0),
      expand: o.expand !== false, pulse: !!o.pulse,
    };
    rings.push(rec);
    return rec;
  },

  /**
   * An arcing melee sweep centred on the struck tile, bowing across it from the
   * attacker's facing.  opts: { len=18, curve=2.2, dur=0.22, width=3, sparks=5 }
   */
  slash(x, y, dir = 'right', color = '#ffffff', opts) {
    if (!FX.enabled) return null;
    const o = opts || {};
    const hex = COLORS[color] || color;
    const a = angleOfDir(dir);
    const len = o.len || 18;
    const rec = {
      kind: 'slash', done: false, blocks: !!o.blocking,
      // Pivot behind the impact point so the arc sweeps THROUGH the target.
      cx: x - Math.cos(a) * len * 0.5, cy: y - Math.sin(a) * len * 0.5,
      r: len * 0.85, a0: a - (o.curve || 2.2) / 2, curve: o.curve || 2.2,
      color: hex, light: shade(hex, 0.65), dark: shade(hex, -0.4),
      dur: o.dur || 0.22, age: 0, width: o.width || 3,
    };
    slashes.push(rec);
    const sparks = o.sparks == null ? 5 : o.sparks;
    if (sparks) FX.burst(x, y, hex, sparks, { shape: 'spark', speed: 90, life: 0.24, dir: a, spread: 1.1 });
    return rec;
  },

  /** An expanding explosion: stacked shock rings, a glow flash and radial debris. */
  nova(x, y, color = COLORS.fire, opts) {
    if (!FX.enabled) return null;
    const o = opts || {};
    const hex = COLORS[color] || color;
    const radius = o.radius || 34;
    const rec = {
      kind: 'nova', done: false, blocks: !!o.blocking,
      x, y, radius, color: hex, light: shade(hex, 0.6), dark: shade(hex, -0.35),
      dur: o.dur || 0.5, age: 0, rings: o.rings || 3,
    };
    novas.push(rec);
    FX.burst(x, y, hex, o.count == null ? 16 : o.count,
      { shape: o.shape || 'ember', speed: radius * 2.6, life: 0.5, gravity: 40, spread: Math.PI });
    FX.burst(x, y, shade(hex, -0.2), 6, { shape: 'smoke', speed: 22, life: 0.9, size: 4 });
    return rec;
  },

  /**
   * A rain of motes falling into a circle — meteor swarm, arrow volley, spirit
   * guardians, insect plague.  opts: { count=10, dur=0.7, shape, fall=0.42, from=90 }
   */
  rain(x, y, radius = 24, color = COLORS.fire, opts) {
    if (!FX.enabled) return null;
    const o = opts || {};
    const hex = COLORS[color] || color;
    const rec = {
      kind: 'rain', done: false,
      blocks: o.blocking === undefined ? true : !!o.blocking,
      x, y, radius, color: hex, count: budget(o.count == null ? 10 : o.count),
      dur: Math.max(0.05, o.dur == null ? 0.7 : o.dur), age: 0, spawned: 0,
      shape: o.shape || 'bolt', fall: o.fall || 0.42, from: o.from || 90,
    };
    rains.push(rec);
    return rec;
  },

  /**
   * Lightning arcing through a list of points (chain lightning, chromatic bolts).
   * `points` may be [{x,y},...] or [[x,y],...]; revealed segment by segment.
   */
  chain(points, color = COLORS.lightning, dur = 0.45, opts) {
    if (!FX.enabled || !points || points.length < 2) return null;
    const o = opts || {};
    const hex = COLORS[color] || color;
    const pts = new Float32Array(points.length * 2);
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      pts[i * 2] = Array.isArray(p) ? p[0] : p.x;
      pts[i * 2 + 1] = Array.isArray(p) ? p[1] : p.y;
    }
    const rec = {
      kind: 'chain', done: false,
      blocks: o.blocking === undefined ? true : !!o.blocking,
      pts, n: points.length, color: hex, light: shade(hex, 0.7),
      dur: Math.max(0.1, dur), age: 0, width: o.width || 2,
      jit: 0, off: new Float32Array((points.length - 1) * 5),
    };
    jitterChain(rec);
    chains.push(rec);
    return rec;
  },

  /**
   * A persistent swirl bound to a moving unit. `getPos` is called each frame and
   * must return {x,y} (pixel coords) — return null/undefined to end the aura.
   * `dur <= 0` keeps it alive until the unit vanishes or FX.remove() is called.
   * Used for concentration, rage, bless, blur, spirit shroud.
   */
  aura(getPos, color = COLORS.xp, dur = 0, opts) {
    if (!FX.enabled || typeof getPos !== 'function') return null;
    const o = opts || {};
    const hex = COLORS[color] || color;
    const rec = {
      kind: 'aura', done: false, blocks: false,
      getPos, color: hex, light: shade(hex, 0.55), dark: shade(hex, -0.4),
      dur: dur > 0 ? dur : 0, persistent: !(dur > 0), age: 0,
      motes: budget(o.motes == null ? 6 : o.motes),
      rx: o.radius || 9, ry: (o.radius || 9) * 0.42, rise: o.rise == null ? 10 : o.rise,
      spin: o.spin == null ? 2.2 : o.spin, ground: o.ground !== false,
      emit: o.emit || 0, emitAcc: 0,
    };
    auras.push(rec);
    return rec;
  },

  // =========================================================================
  // Screen-space effects
  // =========================================================================

  /**
   * Add screen trauma. Displacement falls off as trauma², the standard
   * "screen shake that doesn't feel like a sine wave" curve: a big hit slams and
   * settles fast instead of wobbling forever.
   */
  shake(amount = 0.4, dur = 0.35) {
    if (!FX.enabled || FX.reducedMotion) return;
    shakeState.trauma = Math.min(1, shakeState.trauma + amount);
    shakeState.decay = 1 / Math.max(0.05, dur);
    shakeState.amp = Math.max(shakeState.amp, 3 + amount * 9);
  },

  /** Current shake displacement, integer pixels. The returned object is reused. */
  shakeOffset() {
    shakeOut.x = shakeState.x;
    shakeOut.y = shakeState.y;
    return shakeOut;
  },

  /** Full-screen flash (crits, lightning, revivify). */
  flash(color = '#ffffff', dur = 0.18, alpha = 0.75) {
    if (!FX.enabled) return null;
    flashFx = { color: COLORS[color] || color, dur: Math.max(0.02, dur), age: 0, alpha };
    return flashFx;
  },

  /**
   * Colour grade. `dur <= 0` (the default) is persistent — this is how the
   * overworld applies its day/night cycle. FX.tint(null) clears it.
   * `mode` defaults to 'multiply', which grades the scene instead of veiling it.
   */
  tint(color, alpha = 0.3, dur = 0, mode = 'multiply') {
    if (!color) { tintFx = null; return null; }
    tintFx = {
      color: COLORS[color] || color, alpha, mode,
      dur: dur > 0 ? dur : 0, persistent: !(dur > 0), age: 0,
    };
    return tintFx;
  },

  /**
   * Darkened screen edges. `amount` 0 clears it. Persistent unless `dur > 0`.
   * Battles push it up a little; low HP pulses it red.
   */
  vignette(amount = 0.35, color = '#000000', dur = 0) {
    if (!amount) { vignetteFx = null; return null; }
    vignetteFx = {
      amount: clamp(amount, 0, 1), color: COLORS[color] || color,
      dur: dur > 0 ? dur : 0, persistent: !(dur > 0), age: 0,
    };
    return vignetteFx;
  },

  /**
   * Persistent screen-space weather layer with three parallax depths and wind.
   *   kind: 'rain' | 'snow' | 'ash' | 'leaves' | 'fog' | 'none'
   *   intensity: 0..1
   * Drawn in drawScreen so it sits over the whole scene, and it drifts against the
   * camera so the world feels like it's moving under the sky.
   */
  weather(kind = 'none', intensity = 0.6) {
    const k = kind || 'none';
    const inten = clamp(intensity, 0, 1);
    if (k === wKind) { wIntensity = inten; wNext = null; retargetWeather(); return; }
    if (wKind === 'none' || wBlend <= 0.01) { wKind = k; wIntensity = inten; wBlend = 0; wNext = null; seedWeather(); }
    else wNext = { kind: k, intensity: inten };   // fade the old layer out first
  },

  get weatherKind() { return wKind; },

  /**
   * Called on each lightning strike as (nearness, loudness), both 0..1, where
   * nearness 0 is directly overhead. The listener plays the thunder — and the
   * DELAY before it should be the distance, which is what puts the storm
   * somewhere rather than everywhere. Set to null to stop listening.
   */
  onLightning: null,

  /** The colour grade the current sky wants, or null. Read by the overworld. */
  weatherGrade() {
    const def = WEATHER_DEF[wKind];
    if (!def || !def.grade || wBlend <= 0.01) return null;
    return { color: def.grade, alpha: def.gradeAmt * wIntensity * wBlend };
  },

  /** True while a blocking effect is still playing — battle waits on this. */
  busy() {
    if (!FX.enabled) return false;
    for (let i = 0; i < projectiles.length; i++) if (projectiles[i].blocks && !projectiles[i].done) return true;
    for (let i = 0; i < beams.length; i++) if (beams[i].blocks && !beams[i].done) return true;
    for (let i = 0; i < chains.length; i++) if (chains[i].blocks && !chains[i].done) return true;
    for (let i = 0; i < rains.length; i++) if (rains[i].blocks && !rains[i].done) return true;
    for (let i = 0; i < novas.length; i++) if (novas[i].blocks && !novas[i].done) return true;
    for (let i = 0; i < slashes.length; i++) if (slashes[i].blocks && !slashes[i].done) return true;
    for (let i = 0; i < floaters.length; i++) if (floaters[i].blocks && !floaters[i].done) return true;
    for (let i = 0; i < SYSTEMS.length; i++) if (SYSTEMS[i].busy && SYSTEMS[i].busy()) return true;
    return false;
  },

  /** Cancel one effect by the handle its spawner returned. */
  remove(handle) {
    if (handle && typeof handle === 'object') handle.done = true;
  },

  /**
   * Drop every transient effect (used on scene changes and battle end).
   * Pending projectile onHit callbacks are NOT fired — busy() simply goes false.
   * Pass true to also clear the persistent grading layers and weather.
   */
  clear(all = false) {
    for (let i = 0; i < MAX_PARTICLES; i++) PARTICLES[i].alive = false;
    pHead = 0;
    floaters.length = 0; projectiles.length = 0; beams.length = 0; rings.length = 0;
    slashes.length = 0; novas.length = 0; rains.length = 0; chains.length = 0; auras.length = 0;
    shakeState.trauma = 0; shakeState.x = 0; shakeState.y = 0;
    flashFx = null;
    for (let i = 0; i < MAX_SPLASH; i++) SPLASH[i].on = false;
    boltFlash = 0; boltStage = 0;
    for (let i = 0; i < SYSTEMS.length; i++) if (SYSTEMS[i].clear) SYSTEMS[i].clear(all);
    if (all) {
      tintFx = null; vignetteFx = null;
      wKind = 'none'; wIntensity = 0; wCount = 0; wBlend = 0; wNext = null;
      wGust = 0; boltIn = 6;
    }
  },

  /** Re-fork the cosmetic RNG (call after reseed() so a replay looks identical). */
  reseed(seed) {
    fxr = seed == null ? rng.fork('fx-visuals') : makeRNG(seed);
  },

  /** Live counts, for the debug overlay. */
  counts() {
    let p = 0;
    for (let i = 0; i < MAX_PARTICLES; i++) if (PARTICLES[i].alive) p++;
    const out = {
      particles: p, floaters: floaters.length, projectiles: projectiles.length,
      beams: beams.length, rings: rings.length, auras: auras.length,
      weather: wCount, busy: FX.busy(),
    };
    for (let i = 0; i < SYSTEMS.length; i++) if (SYSTEMS[i].counts) Object.assign(out, SYSTEMS[i].counts());
    return out;
  },

  /** Width in px of `text` in the built-in 5x7 face at `scale`. */
  textWidth(text, scale = 1) { return textWidth1(String(text)) * scale; },

  // =========================================================================
  // Frame hooks (engine.js drives these)
  // =========================================================================

  update(dt) { updateAll(dt); },
  /**
   * World effects at camera (cx, cy). `{ floaters: false }` leaves the damage
   * numbers out, for a scene that lifts them onto the 'world-ui' layer with
   * drawFloaters() so the night grade and the weather never dim them.
   */
  draw(ctx, cx = 0, cy = 0, opts) { drawWorld(ctx, cx, cy, opts); },
  drawFloaters(ctx, cx = 0, cy = 0) { camX = cx || 0; camY = cy || 0; drawFloaters(ctx); },
  /** Weather + grading + vignette. Engine draws this UNDER the UI scenes. */
  drawAmbient(ctx) { drawAmbient(ctx); },
  /** drawAmbient's three parts, which the stage gives three layers. */
  drawWeather(ctx) { if (FX.enabled) drawWeather(ctx); },
  drawTint(ctx) { drawTint(ctx); },
  drawVignette(ctx) { drawVignette(ctx); },
  /**
   * Would the matching draw paint anything this frame ('weather' | 'tint' |
   * 'vignette' | 'screen')? The engine skips a layer nobody would draw into,
   * which saves a clear and a composite on every quiet frame.
   */
  active(part) {
    if (part === 'weather') return FX.enabled && wBlend > 0.01 && wKind !== 'none';
    if (part === 'tint') return !!tintFx;
    if (part === 'vignette') return !!vignetteFx;
    if (part === 'screen') {
      if (flashFx) return true;
      for (let i = 0; i < SYSTEMS.length; i++) if (SYSTEMS[i].active && SYSTEMS[i].active('screen')) return true;
      return false;
    }
    return true;
  },
  /** The screen flash only. Engine draws this OVER everything. */
  drawScreen(ctx) {
    drawFlash(ctx);
    for (let i = 0; i < SYSTEMS.length; i++) if (SYSTEMS[i].drawScreen) SYSTEMS[i].drawScreen(ctx);
  },
};

// ---------------------------------------------------------------------------
// UPDATE
// ---------------------------------------------------------------------------

function updateAll(dtRaw) {
  let dt = dtRaw > 0.05 ? 0.05 : (dtRaw > 0 ? dtRaw : 0);
  dt *= FX.speed;
  clock += dt;

  // --- particles ---
  for (let i = 0; i < MAX_PARTICLES; i++) {
    const p = PARTICLES[i];
    if (!p.alive) continue;
    p.age += dt;
    if (p.age >= p.life) { p.alive = false; continue; }
    p.vx += p.ax * dt;
    p.vy += p.ay * dt;
    if (p.drag) { const d = 1 / (1 + p.drag * dt); p.vx *= d; p.vy *= d; }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.sway) p.x += Math.sin(clock * 3 + p.seed) * p.sway * 26 * dt;  // leaves wander
    p.rot += p.vr * dt;
  }

  // --- floaters ---
  for (let i = 0; i < floaters.length; i++) {
    const f = floaters[i];
    f.age += dt;
    if (f.age <= 0) continue;
    if (f.age >= f.dur) { f.done = true; continue; }
    f.x += f.vx * dt;
    if (f.gravity) f.y += f.gravity * dt;
  }
  sweep(floaters);

  // --- projectiles ---
  for (let i = 0; i < projectiles.length; i++) {
    const r = projectiles[i];
    if (r.done) continue;
    r.age += dt;
    const t = r.age >= r.dur ? 1 : r.age / r.dur;
    r.x = r.x1 + r.dx * t;
    r.y = r.y1 + r.dy * t - r.arc * Math.sin(Math.PI * t);
    // Facing follows the tangent, so a lobbed rock noses over at the apex.
    const dydt = r.dy - r.arc * Math.PI * Math.cos(Math.PI * t);
    if (r.rotate === true) r.ang = Math.atan2(dydt, r.dx);
    else if (r.spin) r.rot += r.spin * dt;

    if (r.trail) {
      r.trailAcc += dt;
      while (r.trailAcc > 0.018) {
        r.trailAcc -= 0.018;
        const p = nextParticle();
        p.x = r.x + fxr.float(-1, 1); p.y = r.y + fxr.float(-1, 1);
        p.vx = fxr.float(-8, 8); p.vy = fxr.float(-8, 8);
        p.life = 0.22; p.size = 1.6; p.grow = 0.1; p.drag = 4;
        p.shape = 'spark'; p.glow = 1; p.color = r.color; p.dark = r.dark;
      }
    }

    if (t >= 1) {
      r.done = true;
      if (r.impact) {
        FX.burst(r.x2, r.y2, r.impact.color || r.color, r.impact.count == null ? 8 : r.impact.count,
          { shape: r.impact.shape || 'spark', speed: r.impact.speed || 80, life: 0.3 });
      }
      if (r.onHit) { const cb = r.onHit; r.onHit = null; cb(r.x2, r.y2); }
    }
  }
  sweep(projectiles);

  // --- beams ---
  for (let i = 0; i < beams.length; i++) {
    const b = beams[i];
    b.age += dt;
    if (b.age >= b.dur) { b.done = true; continue; }
    if (b.jagged) {
      b.jit -= dt;
      if (b.jit <= 0) { b.jit = 0.045; jitterBeam(b); }
    }
  }
  sweep(beams);

  // --- rings ---
  for (let i = 0; i < rings.length; i++) {
    const r = rings[i];
    r.age += dt;
    if (!r.persistent && r.age >= r.dur) r.done = true;
  }
  sweep(rings);

  // --- slashes ---
  for (let i = 0; i < slashes.length; i++) {
    const s = slashes[i];
    s.age += dt;
    if (s.age >= s.dur) s.done = true;
  }
  sweep(slashes);

  // --- novas ---
  for (let i = 0; i < novas.length; i++) {
    const n = novas[i];
    n.age += dt;
    if (n.age >= n.dur) n.done = true;
  }
  sweep(novas);

  // --- rain volleys: release motes on a schedule, each a non-blocking projectile ---
  for (let i = 0; i < rains.length; i++) {
    const r = rains[i];
    r.age += dt;
    while (r.spawned < r.count && r.age >= (r.spawned / r.count) * r.dur) {
      r.spawned++;
      const a = fxr.float(-Math.PI, Math.PI);
      const rad = Math.sqrt(fxr.next()) * r.radius;     // uniform by area
      const tx = r.x + Math.cos(a) * rad;
      const ty = r.y + Math.sin(a) * rad * 0.7;         // squashed: top-down perspective
      FX.projectile(tx + fxr.float(-6, 6), ty - r.from, tx, ty, {
        color: r.color, shape: r.shape, speed: r.from / r.fall, blocking: false,
        rotate: true, trail: true,
        impact: { color: r.color, count: 7, shape: 'ember' },
      });
    }
    if (r.spawned >= r.count && r.age >= r.dur + r.fall) r.done = true;
  }
  sweep(rains);

  // --- chains ---
  for (let i = 0; i < chains.length; i++) {
    const c = chains[i];
    c.age += dt;
    if (c.age >= c.dur) { c.done = true; continue; }
    c.jit -= dt;
    if (c.jit <= 0) { c.jit = 0.05; jitterChain(c); }
  }
  sweep(chains);

  // --- auras ---
  for (let i = 0; i < auras.length; i++) {
    const a = auras[i];
    a.age += dt;
    if (!a.persistent && a.age >= a.dur) { a.done = true; continue; }
    const pos = a.getPos();
    if (!pos) { a.done = true; continue; }
    a.x = pos.x; a.y = pos.y;
    if (a.emit) {
      a.emitAcc += dt;
      while (a.emitAcc > a.emit) {
        a.emitAcc -= a.emit;
        const p = nextParticle();
        p.x = a.x + fxr.float(-a.rx, a.rx); p.y = a.y + fxr.float(-2, 2);
        p.vx = fxr.float(-6, 6); p.vy = -fxr.float(10, 24);
        p.life = 0.6; p.size = 1.6; p.grow = 0.2; p.drag = 1.2;
        p.shape = 'ember'; p.glow = 1; p.color = a.color; p.dark = a.dark;
      }
    }
  }
  sweep(auras);

  // --- screen shake: trauma decays linearly, displacement uses trauma² ---
  if (shakeState.trauma > 0) {
    shakeState.trauma = Math.max(0, shakeState.trauma - shakeState.decay * dt);
    const s = shakeState.trauma * shakeState.trauma;
    const amp = shakeState.amp * s;
    shakeState.x = Math.round(noise1(clock * 23) * amp);
    shakeState.y = Math.round(noise1(clock * 19 + 91) * amp);
    if (shakeState.trauma === 0) { shakeState.x = 0; shakeState.y = 0; shakeState.amp = 6; }
  }

  // --- screen layers ---
  if (flashFx) { flashFx.age += dt; if (flashFx.age >= flashFx.dur) flashFx = null; }
  if (tintFx && !tintFx.persistent) { tintFx.age += dt; if (tintFx.age >= tintFx.dur) tintFx = null; }
  if (vignetteFx && !vignetteFx.persistent) { vignetteFx.age += dt; if (vignetteFx.age >= vignetteFx.dur) vignetteFx = null; }

  updateWeather(dt);
  for (let i = 0; i < SYSTEMS.length; i++) if (SYSTEMS[i].update) SYSTEMS[i].update(dt);
}

// ---------------------------------------------------------------------------
// Beam / chain jitter (fills pre-allocated arrays; no allocation per frame)
// ---------------------------------------------------------------------------

function jitterBeam(b) {
  const n = b.segs;
  b.off[0] = 0; b.off[n] = 0;
  const spread = b.width * 1.9 + 3;
  for (let i = 1; i < n; i++) b.off[i] = fxr.float(-spread, spread);
}

function jitterChain(c) {
  for (let i = 0; i < c.off.length; i++) c.off[i] = fxr.float(-4, 4);
}

// ---------------------------------------------------------------------------
// DRAW — world layer (called by scenes with the camera origin)
// ---------------------------------------------------------------------------

function drawWorld(ctx, cx, cy, opts) {
  camX = cx || 0; camY = cy || 0;
  lastCamX = camX; lastCamY = camY;
  const floats = !(opts && opts.floaters === false);
  if (!FX.enabled) { if (floats) drawFloaters(ctx); return; }

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  drawRings(ctx);
  drawAuras(ctx);
  drawParticles(ctx);
  drawBeams(ctx);
  drawChains(ctx);
  drawSlashes(ctx);
  drawNovas(ctx);
  drawProjectiles(ctx);
  ctx.globalAlpha = 1;
  ctx.restore();
  for (let i = 0; i < SYSTEMS.length; i++) if (SYSTEMS[i].draw) SYSTEMS[i].draw(ctx, camX, camY);

  if (floats) drawFloaters(ctx);
}

function drawParticles(ctx) {
  for (let i = 0; i < MAX_PARTICLES; i++) {
    const p = PARTICLES[i];
    if (!p.alive) continue;
    const x = p.x - camX, y = p.y - camY;
    if (x < -CULL || y < -CULL || x > VIEW_W + CULL || y > VIEW_H + CULL) continue;
    const t = p.age / p.life;
    let a = p.alpha * (1 - t * t);                       // fade out on a soft curve
    if (p.flick) a *= 0.7 + 0.3 * Math.sin(clock * 26 + p.seed);
    if (a <= 0.02) continue;
    // Size lerps from `size` to `size * grow` over the life (grow<1 shrinks, >1 blooms).
    const sz = Math.max(0.5, p.size * (1 - t) + p.size * p.grow * t);
    ctx.globalAlpha = a;

    switch (p.shape) {
      case 'spark': {
        // A short streak along the direction of travel — reads as a hot spark.
        const sp = Math.hypot(p.vx, p.vy);
        const nx = sp > 1 ? p.vx / sp : 1, ny = sp > 1 ? p.vy / sp : 0;
        const l = Math.min(6, 1.5 + sp * 0.03);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(0.7, sz * 0.8);
        ctx.beginPath();
        ctx.moveTo(x - nx * l, y - ny * l);
        ctx.lineTo(x, y);
        ctx.stroke();
        if (p.glow) drawGlow(ctx, p.color, x, y, sz * 5, 0.35 * a);
        break;
      }
      case 'smoke': {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = a * 0.55;
        ctx.beginPath();
        ctx.arc(x, y, sz, 0, 6.2832);
        ctx.fill();
        break;
      }
      case 'blood': {
        // Drops flatten into a splat as they land.
        ctx.fillStyle = t > 0.75 ? p.dark : p.color;
        const w = t > 0.75 ? sz * 2.2 : sz, h = t > 0.75 ? Math.max(1, sz * 0.6) : sz;
        ctx.fillRect(Math.round(x - w / 2), Math.round(y - h / 2), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
        break;
      }
      case 'leaf': {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(p.rot);
        ctx.fillStyle = Math.cos(p.rot) > 0 ? p.color : p.dark;   // "flip" as it tumbles
        ctx.fillRect(-sz, -sz * 0.55, sz * 2, sz * 1.1);
        ctx.restore();
        break;
      }
      case 'ember': {
        if (p.glow) drawGlow(ctx, p.color, x, y, sz * 6, 0.5 * a);
        ctx.fillStyle = t < 0.4 ? shade(p.color, 0.5) : p.color;
        const s = Math.max(1, Math.round(sz));
        ctx.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), s, s);
        break;
      }
      default: { // 'square' — the pixel-art workhorse
        ctx.fillStyle = t > 0.6 ? p.dark : p.color;
        const s = Math.max(1, Math.round(sz));
        ctx.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), s, s);
      }
    }
  }
  ctx.globalAlpha = 1;
}

function drawRings(ctx) {
  for (let i = 0; i < rings.length; i++) {
    const r = rings[i];
    const x = r.x - camX, y = r.y - camY;
    if (!visible(r.x, r.y, r.radius + CULL)) continue;
    let t = r.persistent ? 1 : r.age / r.dur;
    let rad = r.expand && !r.persistent ? r.radius * easeOut3(t) : r.radius;
    let a = r.persistent
      ? 0.55 + 0.25 * Math.sin(clock * 5)                 // targeting reticle breathes
      : (r.pulse ? 0.9 * (0.6 + 0.4 * Math.sin(clock * 14)) : 1 - t * t);
    if (a <= 0.02 || rad <= 0.5) continue;
    // AoE rings are squashed vertically: a 20-ft radius on the ground, seen top-down
    // at the game's slight tilt, is an ellipse.
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, 0.62);
    if (r.fill) {
      ctx.globalAlpha = a * r.fill;
      ctx.fillStyle = r.color;
      ctx.beginPath(); ctx.arc(0, 0, rad, 0, 6.2832); ctx.fill();
    }
    ctx.globalAlpha = a * 0.5;
    ctx.strokeStyle = r.dark;
    ctx.lineWidth = r.width + 1.5;
    ctx.beginPath(); ctx.arc(0, 0, rad, 0, 6.2832); ctx.stroke();
    ctx.globalAlpha = a;
    ctx.strokeStyle = r.light;
    ctx.lineWidth = r.width;
    ctx.beginPath(); ctx.arc(0, 0, rad, 0, 6.2832); ctx.stroke();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function drawAuras(ctx) {
  for (let i = 0; i < auras.length; i++) {
    const a = auras[i];
    if (a.x === undefined) continue;
    const x = a.x - camX, y = a.y - camY;
    if (!visible(a.x, a.y, 40)) continue;
    // Fade in over 0.2s and out over the last 0.3s of a timed aura.
    let al = Math.min(1, a.age / 0.2);
    if (!a.persistent) al *= Math.min(1, (a.dur - a.age) / 0.3);
    if (al <= 0.02) continue;

    if (a.ground) {
      ctx.globalAlpha = al * 0.35;
      ctx.strokeStyle = a.color;
      ctx.lineWidth = 1;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(1, 0.45);
      ctx.beginPath(); ctx.arc(0, 0, a.rx * 1.15, 0, 6.2832); ctx.stroke();
      ctx.restore();
    }
    for (let m = 0; m < a.motes; m++) {
      const ph = clock * a.spin + (m / a.motes) * 6.2832;
      const mx = x + Math.cos(ph) * a.rx;
      const my = y + Math.sin(ph) * a.ry - a.rise * (0.5 + 0.5 * Math.sin(clock * 1.7 + m));
      const depth = 0.55 + 0.45 * Math.sin(ph);           // motes behind the unit dim
      ctx.globalAlpha = al * depth;
      drawGlow(ctx, a.color, mx, my, 7, 0.55 * al * depth);
      ctx.fillStyle = depth > 0.8 ? a.light : a.color;
      ctx.fillRect(Math.round(mx) - 1, Math.round(my) - 1, 2, 2);
    }
  }
  ctx.globalAlpha = 1;
}

function drawBeams(ctx) {
  for (let i = 0; i < beams.length; i++) {
    const b = beams[i];
    const t = b.age / b.dur;
    // Snap on, hold, fade off.
    const a = t < 0.12 ? t / 0.12 : (t > 0.6 ? (1 - t) / 0.4 : 1);
    if (a <= 0.02) continue;
    const x1 = b.x1 - camX, y1 = b.y1 - camY, x2 = b.x2 - camX, y2 = b.y2 - camY;
    if (Math.max(x1, x2) < -CULL || Math.min(x1, x2) > VIEW_W + CULL) continue;
    if (Math.max(y1, y2) < -CULL || Math.min(y1, y2) > VIEW_H + CULL) continue;

    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const px = -dy / len, py = dx / len;                  // unit perpendicular

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    if (b.jagged) {
      for (let s = 1; s <= b.segs; s++) {
        const f = s / b.segs;
        ctx.lineTo(x1 + dx * f + px * b.off[s], y1 + dy * f + py * b.off[s]);
      }
    } else ctx.lineTo(x2, y2);

    if (b.glow) {
      ctx.globalAlpha = a * 0.28;
      ctx.strokeStyle = b.dark;
      ctx.lineWidth = b.width * 3;
      ctx.stroke();
    }
    ctx.globalAlpha = a * 0.8;
    ctx.strokeStyle = b.color;
    ctx.lineWidth = b.width;
    ctx.stroke();
    ctx.globalAlpha = a;
    ctx.strokeStyle = b.light;
    ctx.lineWidth = Math.max(1, b.width * 0.4);
    ctx.stroke();

    if (b.glow) {
      drawGlow(ctx, b.color, x2, y2, b.width * 8, a * 0.6);
      drawGlow(ctx, b.color, x1, y1, b.width * 5, a * 0.4);
    }
  }
  ctx.globalAlpha = 1;
}

function drawChains(ctx) {
  for (let i = 0; i < chains.length; i++) {
    const c = chains[i];
    const t = c.age / c.dur;
    const reveal = Math.min(1, t / 0.45) * (c.n - 1);     // arcs race outward...
    const a = t > 0.55 ? (1 - t) / 0.45 : 1;              // ...then the whole thing fades
    if (a <= 0.02) continue;
    for (let s = 0; s < c.n - 1; s++) {
      const seg = reveal - s;
      if (seg <= 0) break;
      const f = Math.min(1, seg);
      const ax = c.pts[s * 2] - camX, ay = c.pts[s * 2 + 1] - camY;
      const bx = c.pts[s * 2 + 2] - camX, by = c.pts[s * 2 + 3] - camY;
      const ex = ax + (bx - ax) * f, ey = ay + (by - ay) * f;
      const dx = ex - ax, dy = ey - ay, len = Math.hypot(dx, dy) || 1;
      const px = -dy / len, py = dx / len;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      for (let k = 1; k <= 4; k++) {
        const kf = k / 5;
        const o = c.off[s * 5 + k] * (1 - Math.abs(kf - 0.5) * 1.2);
        ctx.lineTo(ax + dx * kf + px * o, ay + dy * kf + py * o);
      }
      ctx.lineTo(ex, ey);
      ctx.globalAlpha = a * 0.35;
      ctx.strokeStyle = c.color;
      ctx.lineWidth = c.width * 3;
      ctx.stroke();
      ctx.globalAlpha = a;
      ctx.strokeStyle = c.light;
      ctx.lineWidth = c.width;
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

function drawSlashes(ctx) {
  for (let i = 0; i < slashes.length; i++) {
    const s = slashes[i];
    const t = s.age / s.dur;
    if (!visible(s.cx, s.cy, s.r + CULL)) continue;
    const lead = s.a0 + s.curve * easeOut3(t);            // leading edge of the arc
    const tail = s.a0 + s.curve * easeOut3(Math.max(0, t - 0.35));
    const a = t < 0.15 ? t / 0.15 : 1 - easeIn2((t - 0.15) / 0.85);
    if (a <= 0.02 || lead <= tail) continue;
    const x = s.cx - camX, y = s.cy - camY;
    // Three passes: dark backing, body, hot leading edge.
    ctx.globalAlpha = a * 0.45;
    ctx.strokeStyle = s.dark;
    ctx.lineWidth = s.width + 2;
    ctx.beginPath(); ctx.arc(x, y, s.r, tail, lead); ctx.stroke();
    ctx.globalAlpha = a * 0.9;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.width;
    ctx.beginPath(); ctx.arc(x, y, s.r, tail, lead); ctx.stroke();
    ctx.globalAlpha = a;
    ctx.strokeStyle = s.light;
    ctx.lineWidth = Math.max(1, s.width * 0.45);
    ctx.beginPath(); ctx.arc(x, y, s.r, Math.max(tail, lead - 0.5), lead); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawNovas(ctx) {
  for (let i = 0; i < novas.length; i++) {
    const n = novas[i];
    const x = n.x - camX, y = n.y - camY;
    if (!visible(n.x, n.y, n.radius + CULL)) continue;
    const t = n.age / n.dur;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, 0.68);
    for (let k = 0; k < n.rings; k++) {
      const kt = t - k * 0.12;
      if (kt <= 0 || kt >= 1) continue;
      const rad = n.radius * easeOut3(kt) * (1 - k * 0.14);
      const a = (1 - kt) * (1 - k * 0.25);
      ctx.globalAlpha = a * 0.5;
      ctx.strokeStyle = k === 0 ? n.light : n.color;
      ctx.lineWidth = Math.max(1, 4 * (1 - kt));
      ctx.beginPath(); ctx.arc(0, 0, rad, 0, 6.2832); ctx.stroke();
    }
    ctx.restore();
    if (t < 0.5) drawGlow(ctx, n.color, x, y, n.radius * 2.2 * easeOut3(t * 2), (1 - t * 2) * 0.8);
  }
  ctx.globalAlpha = 1;
}

function drawProjectiles(ctx) {
  for (let i = 0; i < projectiles.length; i++) {
    const r = projectiles[i];
    if (r.done) continue;
    const x = r.x - camX, y = r.y - camY;
    if (x < -CULL || y < -CULL || x > VIEW_W + CULL || y > VIEW_H + CULL) continue;
    ctx.globalAlpha = 1;

    switch (r.shape) {
      case 'arrow': {
        ctx.save(); ctx.translate(x, y); ctx.rotate(r.ang);
        ctx.fillStyle = r.dark; ctx.fillRect(-7, -1, 12, 2);      // shaft outline
        ctx.fillStyle = r.color; ctx.fillRect(-6, -0.5, 10, 1);
        ctx.fillStyle = '#e8e2d0';                                 // fletching
        ctx.fillRect(-7, -2, 2, 1); ctx.fillRect(-7, 1, 2, 1);
        ctx.fillStyle = '#cfd6de';                                 // head
        ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(3, -2); ctx.lineTo(3, 2); ctx.fill();
        ctx.restore();
        break;
      }
      case 'dagger': {
        ctx.save(); ctx.translate(x, y); ctx.rotate(r.ang);
        ctx.fillStyle = r.dark; ctx.fillRect(-5, -1.5, 11, 3);
        ctx.fillStyle = '#d7dde6'; ctx.fillRect(-2, -1, 7, 2);     // blade
        ctx.fillStyle = r.color; ctx.fillRect(-5, -0.5, 3, 1);     // grip
        ctx.fillStyle = '#a08040'; ctx.fillRect(-2.5, -2, 1, 4);   // crossguard
        ctx.restore();
        break;
      }
      case 'rock': {
        ctx.save(); ctx.translate(x, y); ctx.rotate(r.rot);
        ctx.fillStyle = r.color;
        ctx.beginPath();
        for (let v = 0; v < 6; v++) {
          const vx = r.verts[v * 2] * 5, vy = r.verts[v * 2 + 1] * 5;
          if (v === 0) ctx.moveTo(vx, vy); else ctx.lineTo(vx, vy);
        }
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = r.dark; ctx.lineWidth = 1; ctx.stroke();
        ctx.restore();
        break;
      }
      case 'star': {
        ctx.save(); ctx.translate(x, y); ctx.rotate(r.rot);
        drawGlow(ctx, r.color, 0, 0, 16, 0.75);
        ctx.fillStyle = r.light;
        ctx.beginPath();
        ctx.moveTo(0, -6); ctx.lineTo(1.6, -1.6); ctx.lineTo(6, 0); ctx.lineTo(1.6, 1.6);
        ctx.lineTo(0, 6); ctx.lineTo(-1.6, 1.6); ctx.lineTo(-6, 0); ctx.lineTo(-1.6, -1.6);
        ctx.closePath(); ctx.fill();
        ctx.restore();
        break;
      }
      case 'bolt': {
        ctx.save(); ctx.translate(x, y); ctx.rotate(r.ang);
        drawGlow(ctx, r.color, 0, 0, 16, 0.7);
        ctx.fillStyle = r.color;
        ctx.beginPath(); ctx.ellipse(0, 0, 7, 2.2, 0, 0, 6.2832); ctx.fill();
        ctx.fillStyle = r.light;
        ctx.beginPath(); ctx.ellipse(1, 0, 4, 1.1, 0, 0, 6.2832); ctx.fill();
        ctx.restore();
        break;
      }
      default: { // 'orb'
        drawGlow(ctx, r.color, x, y, 18, 0.85);
        ctx.fillStyle = r.color;
        ctx.beginPath(); ctx.arc(x, y, 3.2, 0, 6.2832); ctx.fill();
        ctx.fillStyle = r.light;
        ctx.beginPath(); ctx.arc(x - 0.8, y - 0.8, 1.5, 0, 6.2832); ctx.fill();
      }
    }
  }
  ctx.globalAlpha = 1;
}

function drawFloaters(ctx) {
  for (let i = 0; i < floaters.length; i++) {
    const f = floaters[i];
    if (f.age <= 0) continue;                              // still staggered/delayed
    const t = f.age / f.dur;
    const spr = textSprite(f.text, f.color, f.outline);
    if (!spr) continue;
    // Rise fast then coast; hold full opacity for two thirds, then fade.
    const y = f.y - f.rise * easeOut3(t) - camY;
    const x = f.x - camX;
    const a = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
    if (a <= 0.02) continue;

    // Crit pop: overshoot to 1.35x in the first 90ms, settle back with a bounce.
    let s = f.scale;
    if (t < 0.18) {
      const k = t / 0.18;
      s *= f.crit ? 1 + 0.55 * Math.sin(k * Math.PI) : 0.7 + 0.3 * easeOut3(k);
    }
    const wob = f.crit && t < 0.3 ? Math.sin(t * 60) * (1 - t / 0.3) * 1.5 : 0;

    ctx.globalAlpha = a;
    const w = spr.width * s, h = spr.height * s;
    ctx.drawImage(spr, Math.round(x - w / 2 + wob), Math.round(y - h), Math.round(w), Math.round(h));
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------------------
// DRAW — screen overlay (weather, tint, vignette, flash)
// ---------------------------------------------------------------------------

/**
 * The atmosphere layer: weather, colour grading and the vignette. These belong to
 * the WORLD, so engine.js paints them straight after the last world-space scene and
 * before any UI scene draws — rain must fall behind the inventory, not over it.
 */
function drawAmbient(ctx) {
  if (FX.enabled) drawWeather(ctx);
  drawTint(ctx);
  drawVignette(ctx);
}

/**
 * FX.tint's colour grade. On the stage this goes into the 'grade' layer, which
 * is composited with multiply, so the default 'multiply' tint stacks with the
 * overworld's own day/night grade exactly as it did on a shared canvas.
 */
function drawTint(ctx) {
  if (tintFx) {
    let a = tintFx.alpha;
    if (!tintFx.persistent) {
      const t = tintFx.age / tintFx.dur;
      a *= t < 0.2 ? t / 0.2 : 1 - easeIn2((t - 0.2) / 0.8);
    }
    if (a > 0.004) {
      ctx.save();
      ctx.globalCompositeOperation = tintFx.mode || 'multiply';
      ctx.globalAlpha = clamp(a, 0, 1);
      ctx.fillStyle = tintFx.color;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.restore();
    }
  }
}

function drawVignette(ctx) {
  if (vignetteFx) {
    let a = vignetteFx.amount;
    if (!vignetteFx.persistent) {
      const t = vignetteFx.age / vignetteFx.dur;
      a *= t < 0.2 ? t / 0.2 : 1 - easeIn2((t - 0.2) / 0.8);
    }
    if (a > 0.01) {
      const key = vignetteFx.color;
      if (!vigGrad || vigKey !== key) {
        const [r, g, b] = rgbOf(key);
        const grd = ctx.createRadialGradient(
          VIEW_W / 2, VIEW_H / 2, Math.min(VIEW_W, VIEW_H) * 0.32,
          VIEW_W / 2, VIEW_H / 2, Math.max(VIEW_W, VIEW_H) * 0.72);
        grd.addColorStop(0, `rgba(${r},${g},${b},0)`);
        grd.addColorStop(0.6, `rgba(${r},${g},${b},0.35)`);
        grd.addColorStop(1, `rgba(${r},${g},${b},1)`);
        vigGrad = grd; vigKey = key;
      }
      ctx.save();
      ctx.globalAlpha = clamp(a, 0, 1);
      ctx.fillStyle = vigGrad;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.restore();
    }
  }
}

/**
 * The one overlay that genuinely belongs on top of everything: a screen flash is a
 * lightning strike or a fireball going off, and it lights the interface too.
 */
function drawFlash(ctx) {
  if (flashFx) {
    const t = flashFx.age / flashFx.dur;
    // Instant attack, quadratic decay — a struck-flint pop rather than a fade-in.
    let a = flashFx.alpha * (1 - t) * (1 - t);
    if (FX.reducedMotion) a *= 0.4;
    if (a > 0.01) {
      ctx.save();
      ctx.globalAlpha = clamp(a, 0, 1);
      ctx.fillStyle = flashFx.color;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.restore();
    }
  }
}

// ---------------------------------------------------------------------------
// Weather
// ---------------------------------------------------------------------------

const WEATHER_DEF = {
  rain: { count: 110, color: '#9aafba', wind: -28, fall: 155, sizeMin: 2, sizeMax: 4, splash: 1, grade: '#53616c', gradeAmt: 0.12 },
  storm: { count: 180, color: '#a5b7c6', wind: -65, fall: 225, sizeMin: 3, sizeMax: 6, splash: 1, bolts: true, grade: '#394958', gradeAmt: 0.24 },
  snow: { count: 150, color: '#eef4ff', wind: -18, fall: 34, sizeMin: 1, sizeMax: 2.4, grade: '#93a6c0', gradeAmt: 0.12 },
  ash: { count: 120, color: '#9e968c', wind: -10, fall: 20, sizeMin: 1, sizeMax: 2, grade: '#6a5a4a', gradeAmt: 0.18 },
  leaves: { count: 60, color: '#c8823a', wind: -34, fall: 40, sizeMin: 2, sizeMax: 3.6 },
  fog: { count: 0, color: '#c8d2dc', wind: -8, fall: 0, sizeMin: 0, sizeMax: 0, grade: '#8a97a8', gradeAmt: 0.16 },
  none: { count: 0, color: '#ffffff', wind: 0, fall: 0, sizeMin: 0, sizeMax: 0 },
};

// Rain that stops dead at the bottom of the screen reads as an overlay laid
// over the game. Rain that BREAKS on the ground reads as weather happening in
// the world, so every drop is given a ground line somewhere down the view and
// leaves a splash when it reaches it.
const MAX_SPLASH = 24;
const SPLASH = new Array(MAX_SPLASH);
for (let i = 0; i < MAX_SPLASH; i++) SPLASH[i] = { x: 0, y: 0, age: 0, life: 0.28, size: 2, on: false };
let sHead = 0;

function addSplash(x, y, size) {
  const s = SPLASH[sHead];
  sHead = (sHead + 1) % MAX_SPLASH;
  s.x = x; s.y = y; s.age = 0; s.life = fxr.float(0.12, 0.2); s.size = size; s.on = true;
}

// Lightning: a scheduled strike, a two-stage flash (the leader, then the main
// stroke) and a thunder report whose DELAY is the distance to the bolt. That
// delay is the whole trick — a crack a beat after the flash puts the storm
// somewhere, and one three seconds later puts it on the horizon.
let boltIn = 6, boltFlash = 0, boltStage = 0;

/**
 * Recompute how many motes the current kind/intensity wants, and initialise any
 * that aren't already dressed for this weather (raising intensity mid-storm must
 * not teleport the drops that are already falling).
 */
function retargetWeather() {
  const def = WEATHER_DEF[wKind] || WEATHER_DEF.none;
  wCount = Math.min(MAX_WEATHER, budget(def.count * wIntensity));
  wWindTarget = def.wind * (0.5 + wIntensity);
  for (let i = 0; i < wCount; i++) {
    const p = WEATHER[i];
    if (p.kind === wKind) continue;
    p.kind = wKind;
    p.z = i % 3;                                    // 0 far … 2 near
    resetWeatherMote(p, def, true);                 // scattered, so it never "starts"
  }
}

/** Full re-dress of the layer after a change of weather. */
function seedWeather() {
  for (const s of SPLASH) s.on = false;
  for (let i = 0; i < MAX_WEATHER; i++) WEATHER[i].kind = '';
  retargetWeather();
}

function resetWeatherMote(p, def, anywhere) {
  const depth = 0.55 + p.z * 0.32;                  // near motes are bigger and faster
  p.x = fxr.float(-20, VIEW_W + 20);
  p.y = anywhere ? fxr.float(-10, VIEW_H + 10) : fxr.float(-24, -4);
  p.size = fxr.float(def.sizeMin, def.sizeMax) * depth;
  p.len = p.size;
  p.vy = def.fall * depth * fxr.float(0.85, 1.2);
  p.vx = 0;
  p.phase = fxr.float(0, 6.283);
  p.rot = fxr.float(0, 6.283);
  p.vr = fxr.float(-3, 3);
  // Where this drop lands. Spread over the lower view so splashes happen at
  // many depths rather than in a line along the bottom edge.
  p.ground = def.splash ? fxr.float(VIEW_H * 0.35, VIEW_H + 8) : VIEW_H + 24;
}

function updateWeather(dt) {
  if (wNext) {                                       // cross-fade to the new sky
    wBlend -= dt * 1.5;
    if (wBlend <= 0) {
      wKind = wNext.kind; wIntensity = wNext.intensity; wNext = null;
      wBlend = 0; seedWeather();
    }
  } else if (wKind !== 'none') {
    wBlend = Math.min(1, wBlend + dt * 1.2);
  } else {
    wBlend = Math.max(0, wBlend - dt * 1.5);
  }
  if (wKind === 'none' && wBlend <= 0) return;

  const def = WEATHER_DEF[wKind] || WEATHER_DEF.none;
  // Wind gusts: a slow drift toward the target, a lazy noise oscillation, and
  // on top of both a GUST envelope — occasional swells that arrive and pass.
  // Constant wind is a fan; weather comes in waves.
  wGust = Math.max(0, wGust - dt);
  if (wGust <= 0 && fxr.chance(dt * 0.22)) wGust = fxr.float(0.9, 2.4);
  const gustK = wGust > 0 ? 1 + 0.85 * Math.sin(Math.PI * Math.min(1, wGust / 1.6)) : 1;
  wWindTarget = def.wind * (0.5 + wIntensity) * gustK;
  wWind += (wWindTarget * (0.75 + 0.5 * noise1(clock * 0.35)) - wWind) * Math.min(1, dt * 1.6);
  wFogA = (wFogA + dt * (wWind * 0.35 - 6)) % 4096;
  wFogB = (wFogB + dt * (wWind * 0.18 - 3)) % 4096;

  // --- lightning -----------------------------------------------------------
  if (def.bolts) {
    boltIn -= dt;
    if (boltIn <= 0) {
      boltIn = fxr.float(4.5, 13) / (0.5 + wIntensity);
      boltStage = 1;
      boltFlash = 0.055;                        // the leader: short and dim
      const near = fxr.next();                  // 0 = on top of you, 1 = far off
      // The listener plays the thunder; a throw in it must never stop the storm.
      if (FX.onLightning) { try { FX.onLightning(near, 0.35 + (1 - near) * 0.65); } catch (e) { /* ignore */ } }
    }
  }
  if (boltFlash > 0) {
    boltFlash -= dt;
    if (boltFlash <= 0 && boltStage === 1) {
      boltStage = 2; boltFlash = fxr.float(0.09, 0.16);   // the main stroke
      flashFx = { color: '#dce8ff', dur: boltFlash, age: 0, alpha: 0.55 + 0.35 * wIntensity };
    } else if (boltFlash <= 0) {
      boltStage = 0;
    } else if (boltStage === 1) {
      flashFx = { color: '#c8d8f0', dur: 0.05, age: 0, alpha: 0.22 };
    }
  }

  for (let i = 0; i < wCount; i++) {
    const p = WEATHER[i];
    const depth = 0.55 + p.z * 0.32;
    p.y += p.vy * dt;
    let drift = wWind * depth;
    if (wKind === 'snow') drift += Math.sin(clock * 1.3 + p.phase) * 16;
    else if (wKind === 'leaves') drift += Math.sin(clock * 2.1 + p.phase) * 26;
    else if (wKind === 'ash') drift += Math.sin(clock * 0.8 + p.phase) * 10;
    p.x += drift * dt;
    p.rot += p.vr * dt;
    // A drop that reaches its ground line breaks there.
    if (def.splash && p.y >= p.ground) {
      if (p.z > 0 && fxr.chance(0.22)) addSplash(p.x, p.ground, 1);
      resetWeatherMote(p, def, false);
      continue;
    }
    if (p.y > VIEW_H + 12 || p.x < -40 || p.x > VIEW_W + 40) resetWeatherMote(p, def, false);
  }

  for (let i = 0; i < MAX_SPLASH; i++) {
    const s = SPLASH[i];
    if (!s.on) continue;
    s.age += dt;
    if (s.age >= s.life) s.on = false;
  }
}

function fogSprite() {
  if (fogCanvas || typeof document === 'undefined') return fogCanvas;
  // A tileable band of soft blobs — cheaper and softer than per-frame gradients.
  const W = 128, H = 48;
  fogCanvas = document.createElement('canvas');
  fogCanvas.width = W; fogCanvas.height = H;
  const g = fogCanvas.getContext('2d');
  const r = makeRNG('fx-fog');
  for (let i = 0; i < 26; i++) {
    const x = r.float(0, W), y = r.float(0, H), rad = r.float(10, 28);
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, 'rgba(255,255,255,0.16)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    if (x + rad > W) { g.save(); g.translate(-W, 0); g.fillRect(x - rad, y - rad, rad * 2, rad * 2); g.restore(); }
    if (x - rad < 0) { g.save(); g.translate(W, 0); g.fillRect(x - rad, y - rad, rad * 2, rad * 2); g.restore(); }
  }
  return fogCanvas;
}

function drawWeather(ctx) {
  if (wBlend <= 0.01 || wKind === 'none') return;
  const def = WEATHER_DEF[wKind] || WEATHER_DEF.none;

  if (wKind === 'fog') {
    const spr = fogSprite();
    if (!spr) return;
    ctx.save();
    ctx.globalAlpha = wBlend * wIntensity * 0.55;
    ctx.fillStyle = def.color;
    // Two scrolling layers at different depths, offset against the camera.
    for (let layer = 0; layer < 2; layer++) {
      const par = layer ? 0.25 : 0.12;
      const off = layer ? wFogB : wFogA;
      const ox = -(((off - lastCamX * par) % spr.width) + spr.width) % spr.width;
      const oy = layer ? 40 : -6;
      ctx.globalAlpha = wBlend * wIntensity * (layer ? 0.30 : 0.45);
      for (let x = ox - spr.width; x < VIEW_W + spr.width; x += spr.width) {
        for (let y = oy - spr.height; y < VIEW_H + spr.height; y += spr.height * 2) {
          ctx.drawImage(spr, Math.round(x), Math.round(y));
        }
      }
    }
    ctx.restore();
    return;
  }

  ctx.save();

  // Brief pixel impacts, kept small enough to leave terrain and actors legible.
  if (def.splash) {
    for (let i = 0; i < MAX_SPLASH; i++) {
      const s = SPLASH[i];
      if (!s.on) continue;
      const t = s.age / s.life;
      const a = wBlend * (1 - t) * 0.28;
      if (a <= 0.02) continue;
      const spread = t < 0.5 ? 1 : 2;
      ctx.globalAlpha = a;
      ctx.fillStyle = def.color;
      ctx.fillRect(Math.round(s.x) - spread, Math.round(s.y) - 1, 1, 1);
      ctx.fillRect(Math.round(s.x) + spread, Math.round(s.y), 1, 1);
    }
  }

  const baseA = wBlend * (0.35 + 0.5 * wIntensity);
  for (let i = 0; i < wCount; i++) {
    const p = WEATHER[i];
    const depth = 0.55 + p.z * 0.32;
    // Parallax: near layers slide against the camera more than far ones.
    // Rain and its impacts share screen coordinates, so streaks land where
    // they disappear. Other weather keeps its drifting camera parallax.
    const par = def.splash ? 0 : 0.04 + p.z * 0.05;
    let x = p.x - lastCamX * par;
    const y = p.y - lastCamY * par * 0.5;
    // Wrap the parallax offset back into view.
    x = ((x + 40) % (VIEW_W + 80) + (VIEW_W + 80)) % (VIEW_W + 80) - 40;
    ctx.globalAlpha = baseA * (0.45 + p.z * 0.28);

    switch (wKind) {
      case 'storm':
      case 'rain': {
        ctx.fillStyle = def.color;
        const alpha = wBlend * (0.12 + p.z * 0.065) * (0.65 + wIntensity * 0.35);
        const len = Math.max(2, Math.round(p.len));
        const slope = wWind * depth / p.vy;
        // One-pixel stepped trail follows the actual velocity, behind the tip.
        for (let j = 0; j < len; j++) {
          ctx.globalAlpha = alpha * (1 - j / (len * 1.3));
          ctx.fillRect(Math.round(x - slope * j), Math.round(y) - j, 1, 1);
        }
        break;
      }
      case 'snow': {
        ctx.fillStyle = def.color;
        const s = Math.max(1, Math.round(p.size));
        ctx.fillRect(Math.round(x), Math.round(y), s, s);
        break;
      }
      case 'ash': {
        ctx.fillStyle = p.z > 1 ? shade(def.color, 0.25) : def.color;
        const s = Math.max(1, Math.round(p.size));
        ctx.fillRect(Math.round(x), Math.round(y), s, s);
        break;
      }
      case 'leaves': {
        ctx.save();
        ctx.translate(Math.round(x), Math.round(y));
        ctx.rotate(p.rot);
        ctx.fillStyle = Math.cos(p.rot) > 0 ? def.color : shade(def.color, -0.35);
        ctx.fillRect(-p.size, -p.size * 0.5, p.size * 2, p.size);
        ctx.restore();
        break;
      }
      default: break;
    }
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

export default FX;
