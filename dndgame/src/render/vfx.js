// render/vfx.js — the spell and battle effects library: pixel-true particles, shapes and frame art for every spell style.
//
//   const h = VFX.play('nova', { from, to, dtype: 'fire', radius: 40, zoom: 2, onImpact });
//   await h.impact;   // the moment it lands (damage numbers go up here)
//   await h.done;     // the last ember is out
//   VFX.play(VFX.styleFor(spell, dtype), { from, to, spell, ... })   // what a spell looks like
//
// Everything is drawn on whole art pixels — an art pixel is `zoom` screen pixels
// square, so a close-zoom battle keeps the world's pixel density — with
// fillRect spans only: no arcs, no anti-aliased lines, no alpha fades. Things
// fade by ordered (Bayer) dither and by walking down a palette.js ramp, the way
// a sprite artist would draw the frames. Light is separate: stepped pixel pools
// on the Stage's additive 'glow' layer (or blended into the given ctx where
// there is no Stage), full-screen flashes on 'screen-fx'.
//
// VFX plugs itself into FX (FX.addSystem), so it ticks with FX.update, draws in
// every scene that already calls FX.draw, keeps FX.busy() true while a
// blocking effect has not landed, and clears with FX.clear().
//
// Cosmetic randomness runs on its own stream (as in fx.js): a spark must never
// move the next attack roll.

import { FX } from './fx.js';
import { Stage } from './stage.js';
import { VIEW_W, VIEW_H } from '../constants.js';
import { rng, makeRNG } from '../core/rng.js';
import { RAMPS, ramp, mix, hexToHsl, hslToHex } from './palette.js';
import { drawArt, artMs, hasArt, artBox } from './vfx-art.js';

let vr = rng.fork('vfx-visuals');
const rnd = (a, b) => vr.float(a, b);
const chance = (p) => vr.next() < p;
const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// Colour: palette.js ramps, read hottest first ("life ramps")
// ---------------------------------------------------------------------------

const KINDS = ['fire', 'cold', 'lightning', 'thunder', 'acid', 'poison', 'necrotic', 'radiant', 'psychic', 'force', 'arcane', 'healing'];
// Smoke is mid grey going darker as it thins: near-black puffs read as soot on whatever they pass.
const SMOKE = Object.freeze([RAMPS.stone[2], RAMPS.stone[1], RAMPS.stone[0]]);
/** White-hot, yellow, orange, red, ember, smoke: what a flame does as it cools. */
const FIRE_LIFE = Object.freeze([RAMPS.fire[4], RAMPS.fire[3], RAMPS.fire[2], RAMPS.fire[1], RAMPS.fire[0], SMOKE[0], SMOKE[1]]);
/** The body of a fire cone, hottest first: white, yellow, orange, red, deep red. */
// (no deepest red: at the fan's licking rim it read as a wall of blood)
const FIRE_FAN = Object.freeze([RAMPS.fire[4], RAMPS.fire[3], RAMPS.fire[2], RAMPS.fire[1]]);
/** Frost breath: white, pale ice, ice, blue, deep blue. */
const COLD_FAN = Object.freeze([RAMPS.cold[4], RAMPS.cold[3], RAMPS.cold[2], RAMPS.cold[1]]);
/** A fire trail: orange, red, ember, gone. */
const FIRE_TRAIL = Object.freeze([RAMPS.fire[2], RAMPS.fire[2], RAMPS.fire[1], RAMPS.fire[0]]);
const DUST = Object.freeze([RAMPS.dirt[4], RAMPS.dirt[3], RAMPS.dirt[2], RAMPS.dirt[1]]);
const SILVER = Object.freeze([RAMPS.steel[4], RAMPS.steel[3], RAMPS.steel[2], RAMPS.thunder[1], RAMPS.slate[1]]);
// Burnt ground: two and three steps under the soil, never black, so it reads as a mark on the grass and not a hole in it.
const SCORCH = Object.freeze([RAMPS.black[2], RAMPS.dirt[0], RAMPS.dirt[1]]);
/** A weapon's hit spark: white, pale gold, gold, and a dark bronze edge that holds it off any ground. */
const HIT = Object.freeze([RAMPS.steel[4], RAMPS.gold[4], RAMPS.gold[3], RAMPS.gold[1], RAMPS.gold[0]]);
/** Moonlight: silver going to a cold blue. */
const MOON = Object.freeze([RAMPS.steel[4], RAMPS.cold[4], RAMPS.thunder[2], RAMPS.thunder[1], RAMPS.force[1]]);
const BLOOD = Object.freeze([RAMPS.blood[3], RAMPS.blood[2], RAMPS.blood[1], RAMPS.blood[0]]);
const IRON = Object.freeze([RAMPS.steel[4], RAMPS.iron[3], RAMPS.iron[2], RAMPS.iron[1], RAMPS.iron[0]]);
const VINE = Object.freeze([RAMPS.grass[4], RAMPS.grass[3], RAMPS.foliage[2], RAMPS.foliage[1], RAMPS.foliage[0]]);
const WEB = Object.freeze([RAMPS.bone[4], RAMPS.bone[3], RAMPS.bone[2], RAMPS.stone[2]]);
const DARK = Object.freeze([RAMPS.necrotic[1], RAMPS.black[2], RAMPS.black[1], RAMPS.black[0]]);
/** Necrotic wisps: the violet of the ramp going to shadow, never to soot. */
const WISP = Object.freeze([RAMPS.necrotic[3], RAMPS.necrotic[2], RAMPS.necrotic[1]]);
const WATER = Object.freeze([RAMPS.shallows[4], RAMPS.shallows[3], RAMPS.water[3], RAMPS.water[2], RAMPS.water[1]]);
const WOOD = Object.freeze([RAMPS.wood[3], RAMPS.wood[2], RAMPS.wood[1]]);

const hot = (r) => Object.freeze(r.slice().reverse());
const LIFE = {};
for (const k of KINDS) LIFE[k] = hot(RAMPS[k]);
LIFE.fire = FIRE_LIFE;
/** Colour spray, prismatic spray: one mote in each of six spell colours. */
const PRISM = Object.freeze([LIFE.fire, LIFE.radiant, LIFE.acid, LIFE.cold, LIFE.arcane, LIFE.psychic]);

// Damage types without a magic ramp borrow the nearest one.
const DTYPE_KIND = {
  fire: 'fire', cold: 'cold', lightning: 'lightning', thunder: 'thunder', acid: 'acid', poison: 'poison',
  necrotic: 'necrotic', radiant: 'radiant', psychic: 'psychic', force: 'force', arcane: 'arcane', healing: 'healing',
};

const colorRamps = new Map();
/** A hottest-first ramp for an authored colour: the colour sits one step below the top. */
function rampOfColor(c) {
  let r = colorRamps.get(c);
  if (!r) {
    r = hot(ramp(c, 5, { at: 3, spread: 0.6 }));
    if (colorRamps.size > 128) colorRamps.clear();
    colorRamps.set(c, r);
  }
  return r;
}

const kindOfColorCache = new Map();
/** The magic kind whose hue is nearest a colour (which recolour of the art to use). */
function kindOfColor(c) {
  let k = kindOfColorCache.get(c);
  if (k) return k;
  const [h, s, l] = hexToHsl(c);
  let best = 'arcane', bd = 1e9;
  for (const kk of KINDS) {
    if (kk === 'thunder') continue;
    const [h2, s2, l2] = hexToHsl(RAMPS[kk][2]);
    const dh = Math.min(Math.abs(h - h2), 360 - Math.abs(h - h2)) / 180;
    const d = dh * dh * (s > 0.15 ? 4 : 0.5) + (s - s2) * (s - s2) + (l - l2) * (l - l2) * 0.5;
    if (d < bd) { bd = d; best = kk; }
  }
  kindOfColorCache.set(c, best);
  return best;
}

const NAMED = {
  damage: '#ff5f4f', heal: '#5fd07a', poison: '#8fd14f', necrotic: '#8a5fd0', radiant: '#ffe9a3',
  fire: '#ff8a2a', cold: '#9fe4ff', lightning: '#ffe066', acid: '#b6f04a', force: '#c9a6ff',
  psychic: '#ff7fd0', thunder: '#cbd4ff', blood: '#8e1d1d', xp: '#c07af0', gold: '#ffb03a',
};

// ---------------------------------------------------------------------------
// Pixel drawing: whole art pixels, batched per colour
// ---------------------------------------------------------------------------

// 4x4 ordered-dither thresholds: a pixel shows when BAYER[..] < coverage*16.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

let G = null;          // the ctx being drawn
let OX = 0, OY = 0;    // screen offset of art pixel (0,0) (the camera, rounded)
let U = 1;             // screen px per art pixel for the effect being drawn
let COV = 1;           // coverage 0..1 (ordered dither) for the shape being drawn
let penC = '', penN = 0;
let clock = 0;

function pen(c) {
  if (c === penC) return;
  flush();
  penC = c;
}
function flush() {
  if (penN) { G.fillStyle = penC; G.fill(); penN = 0; }
  G.beginPath();
}
/** One art pixel at art coords (ax, ay), subject to the current dither coverage. */
function pp(ax, ay) {
  if (COV < 1 && (COV <= 0 || BAYER[((ay & 3) << 2) | (ax & 3)] >= COV * 16)) return;
  G.rect(OX + ax * U, OY + ay * U, U, U);
  if (++penN > 1800) { const c = penC; flush(); penC = c; }
}
/** A horizontal run of art pixels, inclusive. */
function span(x0, x1, ay) {
  if (x1 < x0) return;
  if (COV >= 1) {
    G.rect(OX + x0 * U, OY + ay * U, (x1 - x0 + 1) * U, U);
    if (++penN > 1800) { const c = penC; flush(); penC = c; }
    return;
  }
  for (let x = x0; x <= x1; x++) pp(x, ay);
}
function vspan(ax, y0, y1) {
  if (y1 < y0) return;
  if (COV >= 1) { G.rect(OX + ax * U, OY + y0 * U, U, (y1 - y0 + 1) * U); penN++; return; }
  for (let y = y0; y <= y1; y++) pp(ax, y);
}
/** Bresenham, 1 art px. */
function line(x0, y0, x1, y1) {
  x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let n = 0; n < 2000; n++) {
    pp(x0, y0);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

// Arc masking for rings: only angles in [ARC0, ARC0+ARCN) (radians, screen y down).
let ARC_ON = false, ARC0 = 0, ARCN = TAU;
function arcOK(dx, dy) {
  if (!ARC_ON) return true;
  let a = Math.atan2(dy, dx) - ARC0;
  a = ((a % TAU) + TAU) % TAU;
  return a < ARCN;
}
function q4(cx, cy, x, y) {
  if (arcOK(x, y)) pp(cx + x, cy + y);
  if (x && arcOK(-x, y)) pp(cx - x, cy + y);
  if (y && arcOK(x, -y)) pp(cx + x, cy - y);
  if (x && y && arcOK(-x, -y)) pp(cx - x, cy - y);
}
/** Midpoint ellipse outline (a circle when rx === ry), 1 art px, no gaps. */
function ring(cx, cy, rx, ry) {
  rx = Math.round(rx); ry = Math.round(ry);
  if (rx <= 0 || ry <= 0) { if (rx >= 0 && ry >= 0) pp(cx, cy); return; }
  const rx2 = rx * rx, ry2 = ry * ry;
  let x = 0, y = ry, px = 0, py = 2 * rx2 * y;
  let p = ry2 - rx2 * ry + 0.25 * rx2;
  while (px < py) {
    q4(cx, cy, x, y);
    x++; px += 2 * ry2;
    if (p < 0) p += ry2 + px;
    else { y--; py -= 2 * rx2; p += ry2 + px - py; }
  }
  p = ry2 * (x + 0.5) * (x + 0.5) + rx2 * (y - 1) * (y - 1) - rx2 * ry2;
  while (y >= 0) {
    q4(cx, cy, x, y);
    y--; py -= 2 * rx2;
    if (p > 0) p += rx2 - py;
    else { x++; px += 2 * ry2; p += rx2 - py + px; }
  }
}
function halfW(rx, ry, dy) {
  const f = dy / (ry + 0.5);
  return Math.floor((rx + 0.5) * Math.sqrt(Math.max(0, 1 - f * f)));
}
/** Filled ellipse, one span per row. */
function disc(cx, cy, rx, ry) {
  rx = Math.round(rx); ry = Math.round(ry == null ? rx : ry);
  if (rx < 0 || ry < 0) return;
  for (let dy = -ry; dy <= ry; dy++) { const hw = halfW(rx, ry, dy); span(cx - hw, cx + hw, cy + dy); }
}
/** Solid band between two concentric ellipses (a thick ring with no moire holes). */
function annulus(cx, cy, rxo, ryo, rxi, ryi) {
  rxo = Math.round(rxo); ryo = Math.round(ryo); rxi = Math.round(rxi); ryi = Math.round(ryi);
  if (rxi < 0 || ryi < 0) { disc(cx, cy, rxo, ryo); return; }
  for (let dy = -ryo; dy <= ryo; dy++) {
    const ho = halfW(rxo, ryo, dy);
    const hi = Math.abs(dy) <= ryi ? halfW(rxi, ryi, dy) : -1;
    if (hi < 0) span(cx - ho, cx + ho, cy + dy);
    else { span(cx - ho, cx - hi - 1, cy + dy); span(cx + hi + 1, cx + ho, cy + dy); }
  }
}
/** A plus sign of arm length n (a glint). */
function plus(ax, ay, n) {
  span(ax - n, ax + n, ay);
  if (n > 0) { vspan(ax, ay - n, ay - 1); vspan(ax, ay + 1, ay + n); }
}
function hash2(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// --- the glow layer --------------------------------------------------------

let GG = null;         // glow ctx for this frame (null: no light this frame)
const glowCache = new Map();

/**
 * The colour a light pool is cast in: the hue of whatever gave it, saturated
 * and pulled to a middle value. Added onto grass or stone, a pale tint only
 * greys the ground; a saturated one colours it, which is what reads as light.
 */
const lightCache = new Map();
function lightOf(c) {
  let o = lightCache.get(c);
  if (o) return o;
  const [h, s, l] = hexToHsl(c);
  o = s < 0.12 ? c : hslToHex(h, Math.min(1, s * 0.6 + 0.4), Math.max(0.42, Math.min(0.58, l)));
  if (lightCache.size > 128) lightCache.clear();
  lightCache.set(c, o);
  return o;
}

/**
 * A stepped pool of light: two hard-edged pixel discs, the inner one brighter.
 * Hard steps and no gradient, the way the sprites shade; small, because a
 * spell lights the ground round it, not the whole field.
 */
function glowSprite(r, u, color) {
  const key = r + '|' + u + '|' + color;
  let c = glowCache.get(key);
  if (c) return c;
  if (typeof document === 'undefined') return null;
  c = document.createElement('canvas');
  const n = 2 * r + 1;
  c.width = c.height = n * u;
  const g = c.getContext('2d');
  g.fillStyle = color;
  for (const [k, a] of [[1, 0.16], [0.55, 0.2]]) {
    const rr = Math.max(1, Math.round(r * k));
    g.globalAlpha = a;
    for (let dy = -rr; dy <= rr; dy++) {
      const hw = halfW(rr, rr, dy);
      g.fillRect((r - hw) * u, (r + dy) * u, (2 * hw + 1) * u, u);
    }
  }
  if (glowCache.size > 96) glowCache.clear();
  glowCache.set(key, c);
  return c;
}
/** Light at caller-space (x, y), radius r in caller px, strength a (0..1.5). */
function glow(x, y, r, color, a) {
  a *= VFX.glowStrength;
  if (!GG || a <= 0.02 || r < 1) return;
  // The strongest light of each effect this frame, for VFX.lights() (the world's grade).
  if (CUR && a > CUR.la) { CUR.la = a; CUR.lx = x; CUR.ly = y; CUR.lr = r; CUR.lc = color; }
  const ar = Math.max(2, Math.min(22, Math.round(r / U * 0.55)));
  const img = glowSprite(ar, U, lightOf(color));
  if (!img) return;
  GG.globalAlpha = Math.min(1, a);
  GG.drawImage(img, OX + (Math.round(x / U) - ar) * U, OY + (Math.round(y / U) - ar) * U);
}

// ---------------------------------------------------------------------------
// Particles: a fixed pool, every one snapped to whole art pixels
// ---------------------------------------------------------------------------

const P_PX = 0, P_SPARK = 1, P_SMOKE = 2, P_MOTE = 3, P_SHARD = 4, P_DROP = 5, P_EMBER = 6, P_GLINT = 7;
const MAX_P = 900;
const POOL = new Array(MAX_P);
for (let i = 0; i < MAX_P; i++) {
  POOL[i] = {
    on: false, x: 0, y: 0, vx: 0, vy: 0, ax: 0, ay: 0, drag: 0, age: 0, life: 1, L: SMOKE, k: 0,
    sz: 1, grow: 0, u: 1, gl: 0, sd: 0, tr: 0, wob: 0, fade: 0.6, gy: NaN, dens: 0.7,
    hx: 0, hy: 0, ha: 0, hr: 0, hw: 0, hrise: 0, helix: false, late: 0, tag: null,
  };
}
let pHead = 0;
// Effects may carry a tag (the lab draws each gallery cell's own); particles
// inherit the tag of the effect that was running when they were spawned.
let curTag = null;
let DTAG;               // undefined: draw everything

/** A fresh particle at caller-space (x, y) for effect unit u. */
function spawn(k, x, y, u, L) {
  const p = POOL[pHead];
  pHead = (pHead + 1) % MAX_P;
  p.on = true; p.k = k; p.x = x; p.y = y; p.u = u; p.L = L;
  p.vx = 0; p.vy = 0; p.ax = 0; p.ay = 0; p.drag = 0; p.age = 0; p.life = 0.5;
  p.sz = 1; p.grow = 0; p.gl = 0; p.sd = vr.next(); p.tr = 0; p.wob = 0; p.fade = 0.6;
  p.gy = NaN; p.dens = 0.7; p.helix = false; p.late = 0; p.tag = curTag;
  return p;
}

function budget(n) {
  const c = Math.max(0, Math.round(n));
  return FX.reducedMotion ? Math.ceil(c / 2) : c;
}

function updateParticles(dt) {
  for (let i = 0; i < MAX_P; i++) {
    const p = POOL[i];
    if (!p.on) continue;
    p.age += dt;
    if (p.age >= p.life) { p.on = false; continue; }
    if (p.helix) {
      p.ha += p.hw * dt;
      p.hr = Math.max(0, p.hr - p.hr * 0.6 * dt);
      p.hy -= p.hrise * dt;
      p.x = p.hx + Math.cos(p.ha) * p.hr;
      p.y = p.hy + Math.sin(p.ha) * p.hr * 0.45;
      continue;
    }
    p.vx += p.ax * dt; p.vy += p.ay * dt;
    if (p.drag) { const d = 1 / (1 + p.drag * dt); p.vx *= d; p.vy *= d; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.wob) p.x += Math.sin(clock * 9 + p.sd * 40) * p.wob * dt;
    if (p.k === P_DROP && p.y >= p.gy) {
      // A drop lands: it becomes a tiny splat that lingers and dissolves.
      p.k = P_PX; p.y = p.gy; p.vx = 0; p.vy = 0; p.ay = 0; p.ax = 0;
      p.age = p.life * 0.55; p.fade = 0.7;
    }
  }
}

function drawParticles() {
  for (let i = 0; i < MAX_P; i++) {
    const p = POOL[i];
    if (!p.on || (DTAG !== undefined && p.tag !== DTAG)) continue;
    const f = p.age / p.life;
    if (f < p.late) continue;
    const L = p.L, n = L.length;
    let ci = (f * n) | 0; if (ci >= n) ci = n - 1;
    U = p.u;
    COV = f > p.fade ? Math.max(0, 1 - (f - p.fade) / (1 - p.fade)) : 1;
    const ax = Math.round(p.x / U), ay = Math.round(p.y / U);
    switch (p.k) {
      case P_PX: {
        pen(L[ci]);
        const s = Math.max(1, Math.round(p.sz + p.grow * p.age));
        if (s === 1) pp(ax, ay);
        else { const h = s >> 1; for (let y = 0; y < s; y++) span(ax - h, ax - h + s - 1, ay - h + y); }
        break;
      }
      case P_SPARK: {
        const sp = Math.hypot(p.vx, p.vy);
        const len = Math.min(p.tr, sp * 0.035 / U);
        if (len >= 1) {
          pen(L[Math.min(n - 1, ci + 1)]);
          line(ax, ay, Math.round(ax - p.vx / sp * len), Math.round(ay - p.vy / sp * len));
        }
        pen(L[ci]); pp(ax, ay);
        break;
      }
      case P_SMOKE: {
        // A puff, not a halftone: one body tone with a lighter cap offset to
        // the upper left (the light), so the lower right keeps the shadow.
        // Coverage comes in quarter steps, so overlapping puffs of one cloud
        // share their dither and merge instead of showing every circle.
        // A puff is solid while it is thick and breaks up by halves at the end
        // of its life; only fog and darkness (dens under 0.45) are see-through
        // all along. A dithered puff under three pixels across only makes glyphs.
        const r = Math.max(0, Math.round(p.sz + p.grow * p.age));
        const thin = f < p.fade ? 1 : f < p.fade + (1 - p.fade) * 0.6 ? 0.5 : 0.25;
        COV = Math.min(thin, p.dens < 0.45 ? 0.5 : 1);
        if (r <= 2 && COV < 1) COV = thin > 0.25 ? 1 : 0.5;
        const ry = Math.max(0, r - (r > 2 ? 1 : 0));
        pen(L[ci]);
        disc(ax, ay, r, ry);
        if (r >= 2 && ci > 0) { pen(L[ci - 1]); disc(ax - 1, ay - 1, r - 2 + (r > 3 ? 1 : 0), Math.max(0, ry - 2)); }
        break;
      }
      case P_MOTE: {
        pen(L[ci]);
        pp(ax, ay);
        if (f < 0.35 && p.sd > 0.6) { pen(L[Math.min(n - 1, ci + 1)]); pp(ax - 1, ay); pp(ax + 1, ay); pp(ax, ay - 1); pp(ax, ay + 1); }
        break;
      }
      case P_SHARD: {
        const sp = Math.hypot(p.vx, p.vy) || 1;
        const dx = p.vx / sp, dy = p.vy / sp;
        const len = Math.max(1, Math.round(p.sz));
        pen(L[Math.min(n - 1, ci + 1)]);
        line(ax, ay, Math.round(ax - dx * len), Math.round(ay - dy * len));
        pen(L[ci]); pp(ax, ay);
        break;
      }
      case P_DROP: {
        pen(L[ci]); pp(ax, ay);
        if (Math.abs(p.vy) > 40 * U) pp(ax, ay - (p.vy > 0 ? 1 : -1));
        break;
      }
      case P_EMBER: {
        if (((clock * 24 + p.sd * 97) | 0) % 5 === 0) break;   // flicker
        pen(L[ci]); pp(ax, ay);
        break;
      }
      case P_GLINT: {
        const arm = f < 0.3 ? 2 : f < 0.7 ? 1 : 0;
        pen(L[Math.min(n - 1, ci + 1)]); plus(ax, ay, arm);
        pen(L[ci]); pp(ax, ay);
        break;
      }
    }
  }
  COV = 1;
}

function glowParticles() {
  if (!GG) return;
  for (let i = 0; i < MAX_P; i++) {
    const p = POOL[i];
    if (!p.on || !p.gl || (DTAG !== undefined && p.tag !== DTAG)) continue;
    const f = p.age / p.life;
    if (f < p.late || f > 0.6) continue;
    const L = p.L;
    const u = p.u;
    GG.globalAlpha = 0.22 * p.gl * (1 - f) * VFX.glowStrength;
    GG.fillStyle = lightOf(L[Math.min(L.length - 1, (f * L.length) | 0)]);
    const ax = Math.round(p.x / u), ay = Math.round(p.y / u);
    GG.fillRect(OX + (ax - 1) * u, OY + (ay - 1) * u, 3 * u, 3 * u);
  }
}

// --- particle recipes (caller units; speeds are art px/s times the unit) ----

/** A spray from (x, y): o { n, speed, spread, dir, life, L, k, grav, drag, sz, gl, trail, up, fade, late }. */
function spray(e, x, y, o) {
  const n = budget(o.n || 8), u = e.u;
  const dir = o.dir == null ? 0 : o.dir, spread = o.spread == null ? Math.PI : o.spread;
  for (let i = 0; i < n; i++) {
    const p = spawn(o.k == null ? P_SPARK : o.k, x + rnd(-1, 1) * (o.jit || 0) * u, y + rnd(-1, 1) * (o.jitY != null ? o.jitY : o.jit || 0) * u, u, o.L || e.L);
    const a = dir + rnd(-spread, spread);
    const sp = (o.speed || 60) * rnd(o.minSpeed == null ? 0.35 : o.minSpeed, 1) * u;
    p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp - (o.up || 0) * u;
    p.ay = (o.grav || 0) * u; p.drag = o.drag == null ? 2.4 : o.drag;
    p.life = (o.life || 0.4) * rnd(0.65, 1.15);
    p.sz = o.sz == null ? 1 : o.sz; p.grow = (o.grow || 0) / 1;
    p.gl = o.gl || 0; p.tr = o.trail == null ? 3 : o.trail; p.fade = o.fade == null ? 0.6 : o.fade;
    p.wob = (o.wob || 0) * u; p.dens = o.dens == null ? 0.7 : o.dens; p.late = o.late || 0;
    if (o.gy != null) p.gy = o.gy;
  }
}

// ---------------------------------------------------------------------------
// Effects and their parts
// ---------------------------------------------------------------------------

const effects = [];
let frozen = 0;          // hit-stop: VFX time holds while > 0

/**
 * One playing effect. Parts are small drawing programs with a start time and
 * a duration, drawn in three bands: 0 ground (rings, decals, circles), 1 body,
 * 2 top (flashes, art over everything). `calls` fire once at their time.
 */
function makeEffect(style, o) {
  const u = Math.max(1, Math.round(o.zoom || 1));
  const from = o.from || o.to || { x: 0, y: 0 };
  const to = o.to || o.from || { x: 0, y: 0 };
  const spell = o.spell || null;
  const dtype = o.dtype || (spell && spell.damage && spell.damage.type) || null;
  const kind = DTYPE_KIND[dtype] || null;
  const color = NAMED[o.color] || o.color || (spell && spell.vfx && spell.vfx.color) || null;
  const L = kind ? LIFE[kind] : color ? rampOfColor(color) : LIFE.arcane;
  const e = {
    style, o, u, spell, dtype, kind, color,
    // What recolour of the frame art matches: the damage type, else the colour's nearest kind.
    art: kind || (color ? kindOfColor(color) : 'arcane'),
    L, t: 0, parts: [], calls: [], end: 0, hit: false, impactT: 0, done: false,
    fx: from.x, fy: from.y, tx: to.x, ty: to.y,
    gy: to.y + (o.ground != null ? o.ground : 8 * u),
    fgy: from.y + (o.fromGround ?? o.ground ?? 8 * u),
    R: o.radius || 16 * u,
    blocking: !!o.blocking, hold: o.hold == null ? 0.1 : o.hold,
    layer: o.layer || 'fx',
    victims: o.victims && o.victims.length ? o.victims : null,
    tag: o.tag == null ? null : o.tag,
  };
  e.dist = Math.hypot(e.tx - e.fx, e.ty - e.fy);
  e.dir = e.dist > 0.5 ? Math.atan2(e.ty - e.fy, e.tx - e.fx) : (o.dir != null && typeof o.dir === 'number' ? o.dir : 0);
  return e;
}

function add(e, part) {
  part.t0 = part.t0 || 0;
  part.z = part.z == null ? 1 : part.z;
  e.parts.push(part);
  e.end = Math.max(e.end, part.t0 + part.dur);
  return part;
}
function at(e, t, fn) {
  e.calls.push({ t, fn, fired: false });
  e.end = Math.max(e.end, t);
}
/** When the blow lands: onImpact fires, handle.impact resolves, a blocking effect lets go. */
function impactAt(e, t) {
  e.impactT = t;
  at(e, t, () => fireImpact(e));
}
function fireImpact(e) {
  if (e.hit) return;
  e.hit = true;
  const cb = e.o.onImpact;
  if (cb) { e.o.onImpact = null; try { cb(e.tx, e.ty); } catch (err) { console.error(err); } }
  if (e.resolveImpact) e.resolveImpact();
}
/** Particles outlive their spawner: keep the effect alive until they have gone. */
function tail(e, t) { e.end = Math.max(e.end, t); }

const ease = {
  out: (k) => 1 - (1 - k) * (1 - k) * (1 - k),
  in: (k) => k * k,
  io: (k) => (k < 0.5 ? 2 * k * k : 1 - 2 * (1 - k) * (1 - k)),
};
const ci = (L, f) => L[Math.min(L.length - 1, Math.max(0, (f * L.length) | 0))];
const ax = (v) => Math.round(v / U);

// --- shapes ------------------------------------------------------------------

/** An expanding pixel ellipse: bright leading edge, a darker trailing band. */
function pRing(e, x, y, o) {
  const L = o.L || e.L;
  return add(e, {
    t0: o.t0, dur: o.dur || 0.4, z: o.z == null ? 0 : o.z,
    draw(k) {
      const q = (o.ease || ease.out)(k);
      const r = (o.r0 || 0) + ((o.r1 || e.R) - (o.r0 || 0)) * q;
      const rx = r / U, ry = rx * (o.ry == null ? 0.5 : o.ry);
      COV = k < (o.hold || 0.5) ? 1 : 1 - (k - (o.hold || 0.5)) / (1 - (o.hold || 0.5));
      const c0 = ci(L, k * 0.8 + (o.cool || 0));
      const th = o.thick == null ? 2 : o.thick;
      const cx = ax(x), cy = ax(y);
      if (th > 1 && rx > th + 1) {
        pen(ci(L, k * 0.8 + 0.3 + (o.cool || 0)));
        annulus(cx, cy, rx - 1, ry - 1, rx - th, ry - th * (ry / rx));
      }
      pen(c0); ring(cx, cy, rx, ry);
    },
    glow(k) { if (o.glow !== false) glow(x, y, ((o.r1 || e.R) * (o.glowR || 0.7)) * ease.out(k), ci(L, 0.4), (o.glow || 0.5) * (1 - k)); },
  });
}

/** The impact frame: a white core and four long rays, gone in a blink. */
function pFlare(e, x, y, o = {}) {
  const L = o.L || e.L;
  return add(e, {
    t0: o.t0, dur: o.dur || 0.16, z: 2,
    draw(k) {
      const s = Math.round((o.size || 6) * (k < 0.35 ? 1 : 1 - (k - 0.35) * 1.1));
      if (s <= 0) return;
      const cx = ax(x), cy = ax(y);
      const d = Math.max(1, Math.round(s * 0.45));
      pen(ci(L, 0.35 + k * 0.4));
      line(cx - d, cy - d, cx + d, cy + d); line(cx - d, cy + d, cx + d, cy - d);
      pen(ci(L, 0.15 + k * 0.4));
      span(cx - s, cx + s, cy); vspan(cx, cy - s, cy + s);
      pen(L[0]);
      if (s > 2) { disc(cx, cy, 1, 1); } else pp(cx, cy);
    },
    glow(k) { glow(x, y, (o.size || 6) * 2 * U, ci(L, 0.3), 0.8 * (1 - k)); },
  });
}

/**
 * The impact frame of a blow: a bold four-point star, long along the line of
 * the blow, filled white-hot and ringed in the ramp's dark so it reads on grass,
 * stone or snow alike; then it breaks into four shards flying out. Two frames
 * of star and two of shards at 60 fps, like a hand-drawn hit spark.
 */
function pStar(e, x, y, o = {}) {
  // Turned off the line of the blow and lopsided, so it reads as a burst and
  // never as a crosshair.
  const L = o.L || e.L, s = o.size || 5, a = (o.dir == null ? e.dir : o.dir) + 0.45;
  const ca = Math.cos(a), sa = Math.sin(a);
  // One spike: a diamond from the centre to the tip, `w` px wide at its root.
  const spike = (cx, cy, dx, dy, len, w, ox, oy) => {
    const tx = cx + Math.round(dx * len), ty = cy + Math.round(dy * len);
    line(cx + ox, cy + oy, tx + ox, ty + oy);
    for (let j = 1; j <= w; j++) {
      const px = Math.round(-dy * j), py = Math.round(dx * j), l2 = Math.round(len * (1 - j / (w + 1)));
      line(cx + px + ox, cy + py + oy, cx + Math.round(dx * l2) + ox, cy + Math.round(dy * l2) + oy);
      line(cx - px + ox, cy - py + oy, cx + Math.round(dx * l2) + ox, cy + Math.round(dy * l2) + oy);
    }
  };
  const star = (cx, cy, r, ox, oy) => {
    const w = r >= 5 ? 1 : 0;
    spike(cx, cy, ca, sa, r, w, ox, oy); spike(cx, cy, -ca, -sa, Math.round(r * 0.55), w, ox, oy);
    spike(cx, cy, -sa, ca, Math.round(r * 0.75), w, ox, oy); spike(cx, cy, sa, -ca, Math.round(r * 0.45), 0, ox, oy);
    for (let i = 0; i < 4; i++) {
      const d = a + Math.PI / 4 + i * Math.PI / 2;
      spike(cx, cy, Math.cos(d), Math.sin(d), Math.round(r * 0.35), 0, ox, oy);
    }
    disc(cx + ox, cy + oy, 1, 1);
  };
  return add(e, {
    t0: o.t0, dur: o.dur || 0.12, z: 2,
    draw(k) {
      const cx = ax(x), cy = ax(y);
      if (k < 0.5) {
        const r = k < 0.25 ? s : Math.round(s * 0.75);
        pen(L[L.length - 1]);
        star(cx, cy, r, 1, 0); star(cx, cy, r, -1, 0); star(cx, cy, r, 0, 1); star(cx, cy, r, 0, -1);
        pen(k < 0.25 ? L[0] : L[1]); star(cx, cy, r, 0, 0);
        pen(L[0]); disc(cx, cy, 1, 1);
        return;
      }
      // The shards: four short dashes thrown out along the star's arms.
      const d = Math.round(s * (0.6 + k * 0.8));
      pen(L[1]);
      for (let i = 0; i < 4; i++) {
        const q = a + Math.PI / 4 + i * Math.PI / 2, qx = Math.cos(q), qy = Math.sin(q);
        line(cx + Math.round(qx * d), cy + Math.round(qy * d), cx + Math.round(qx * (d + 2)), cy + Math.round(qy * (d + 2)));
      }
    },
    glow(k) { glow(x, y, s * 2 * U, L[2], 0.6 * (1 - k)); },
  });
}

/** A pool of light on the glow layer (follows `track` if given). */
function pGlow(e, x, y, o) {
  return add(e, {
    t0: o.t0, dur: o.dur || 0.4, z: 1,
    draw() {},
    glow(k) {
      const env = o.env ? o.env(k) : 1 - k;
      const p = o.track ? o.track() : null;
      glow(p ? p.x : x, p ? p.y : y, o.r, o.color || ci(e.L, 0.35), (o.a == null ? 0.7 : o.a) * env);
    },
  });
}

/** PixelForge frame art, anchored at (x, y). */
function pArt(e, id, x, y, o = {}) {
  const ms = artMs(id);
  if (!ms) return null;
  return add(e, {
    t0: o.t0, dur: ms / 1000, z: o.z == null ? 2 : o.z,
    draw(k, lt) {
      flush();
      drawArt(G, id, o.kind || e.art, lt, OX + ax(x) * U, OY + ax(y) * U, U, o.flip ? { flip: true } : null);
    },
    glow(k) { if (o.glow !== false) glow(x, y - (o.glowDy || 0), (o.glowR || 14) * U, ci(o.L || e.L, 0.3), (o.glow || 0.8) * (1 - k)); },
  });
}

/** A ground decal (scorch, frost, splat) that fades by thinning, not by alpha. */
function pDecal(e, x, y, o) {
  const cols = o.cols || SCORCH, seed = (vr.next() * 1e6) | 0;
  return add(e, {
    t0: o.t0, dur: o.dur || 2.2, z: 0,
    draw(k) {
      // At least ten pixels across: a mark under a creature is covered by its feet.
      const rx = Math.max(5, Math.round((o.rx || e.R * 0.5) / U)), ry = Math.max(2, Math.round(rx * (o.ry || 0.45)));
      const cx = ax(x), cy = ax(y);
      const fade = k < 0.35 ? 1 : 1 - (k - 0.35) / 0.65;
      for (let dy = -ry; dy <= ry; dy++) {
        const hw = halfW(rx, ry, dy);
        for (let dx = -hw; dx <= hw; dx++) {
          const d = Math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry));
          const h = hash2(dx, dy, seed);
          // Ragged edge; the inner part is the deepest tone and outlasts the rim.
          if (h < d * d * 0.95) continue;
          const tone = d < 0.45 ? 0 : d < 0.8 ? 1 : 2;
          if (h > (o.cov == null ? 0.7 : o.cov) * fade * (1.2 - d * 0.5)) continue;
          pen(cols[Math.min(cols.length - 1, tone)]);
          pp(cx + dx, cy + dy);
        }
      }
    },
  });
}

/** Jagged, branching lightning between two points, re-struck every few frames. */
function genBolt(x0, y0, x1, y1, jag, depth) {
  let pts = [x0, y0, x1, y1];
  let amp = Math.hypot(x1 - x0, y1 - y0) * jag;
  for (let d = 0; d < depth; d++) {
    const out = [pts[0], pts[1]];
    for (let i = 0; i + 3 < pts.length; i += 2) {
      const ax0 = pts[i], ay0 = pts[i + 1], ax1 = pts[i + 2], ay1 = pts[i + 3];
      const dx = ax1 - ax0, dy = ay1 - ay0, l = Math.hypot(dx, dy) || 1;
      const off = rnd(-amp, amp);
      out.push((ax0 + ax1) / 2 - (dy / l) * off, (ay0 + ay1) / 2 + (dx / l) * off, ax1, ay1);
    }
    pts = out; amp *= 0.55;
  }
  return pts;
}
function pBolt(e, x0, y0, x1, y1, o = {}) {
  const L = o.L || LIFE.lightning;
  const st = { main: null, br: [], next: 0 };
  const strike = () => {
    const u = e.u, a = [x0 / u, y0 / u, x1 / u, y1 / u];
    const len = Math.hypot(a[2] - a[0], a[3] - a[1]);
    const depth = Math.max(2, Math.min(6, Math.round(Math.log2(len / 3))));
    st.main = genBolt(a[0], a[1], a[2], a[3], o.jag || 0.2, depth);
    st.br.length = 0;
    const nb = o.branches == null ? 2 : o.branches;
    for (let b = 0; b < nb; b++) {
      const i = 2 * Math.floor(rnd(0.2, 0.7) * (st.main.length / 2));
      const bx = st.main[i], by = st.main[i + 1];
      const dir = Math.atan2(a[3] - by, a[2] - bx) + rnd(0.45, 0.95) * (chance(0.5) ? 1 : -1);
      const bl = len * rnd(0.18, 0.34);
      st.br.push(genBolt(bx, by, bx + Math.cos(dir) * bl, by + Math.sin(dir) * bl, 0.28, Math.max(2, depth - 2)));
    }
  };
  const poly = (pts, reveal, dx, dy) => {
    const n = pts.length / 2, m = Math.max(2, Math.ceil(n * reveal));
    for (let i = 0; i + 1 < m; i++) {
      line(Math.round(pts[2 * i]) + dx, Math.round(pts[2 * i + 1]) + dy, Math.round(pts[2 * i + 2]) + dx, Math.round(pts[2 * i + 3]) + dy);
    }
  };
  return add(e, {
    t0: o.t0, dur: o.dur || 0.42, z: o.z == null ? 2 : o.z,
    tick(dt, lt) { if (!st.main || lt >= st.next) { strike(); st.next = lt + (o.every || 0.07); } },
    draw(k) {
      if (!st.main) strike();
      const lead = o.lead == null ? 0.12 : o.lead;
      const reveal = k < lead ? k / lead : 1;
      const flash = k >= lead && k < lead + 0.14;
      COV = k > 0.72 ? 1 - (k - 0.72) / 0.28 : 1;
      if (flash) {
        // The return stroke: three pixels wide and white, the frame the eye keeps.
        pen(L[2]);
        poly(st.main, 1, -1, 0); poly(st.main, 1, 1, 0); poly(st.main, 1, 0, -1); poly(st.main, 1, 0, 1);
        pen(L[1]); for (const b of st.br) { poly(b, 1, 1, 0); }
        pen(L[0]); poly(st.main, 1, 0, 0); for (const b of st.br) poly(b, 1, 0, 0);
        return;
      }
      if (k < 0.6) {
        pen(L[k < lead ? 2 : 1]);
        poly(st.main, reveal, 1, 0);
        if (k >= lead) for (const b of st.br) poly(b, 1, 0, 0);
      }
      pen(k < 0.55 ? L[0] : L[1]); poly(st.main, reveal, 0, 0);
    },
    glow(k) {
      if (!st.main) return;
      const a = k < 0.3 ? 1 : 1 - (k - 0.3) / 0.7;
      const m = st.main, n = m.length / 2;
      for (let i = 0; i < n; i += Math.max(1, (n / 4) | 0)) glow(m[2 * i] * U, m[2 * i + 1] * U, 7 * U, L[2], 0.35 * a);
      glow(x1, y1, 12 * U, L[1], 0.7 * a);
    },
  });
}

/** A ray: a pulsing white core, a saturated body and a flickering edge. */
function pBeam(e, x0, y0, x1, y1, o = {}) {
  const L = o.L || e.L;
  const W = o.width || 2;
  return add(e, {
    t0: o.t0, dur: o.dur || 0.45, z: 1,
    draw(k, lt) {
      const env = k < 0.12 ? k / 0.12 : k > 0.78 ? 1 - (k - 0.78) / 0.22 : 1;
      const w = Math.max(0, W * env + (k < 0.78 ? Math.sin(lt * 45) * 0.5 : 0));
      const a0x = ax(x0), a0y = ax(y0), a1x = ax(x1), a1y = ax(y1);
      const dx = a1x - a0x, dy = a1y - a0y;
      const horiz = Math.abs(dx) >= Math.abs(dy);
      const n = Math.max(Math.abs(dx), Math.abs(dy));
      // Scan along the major axis: one cross-span per step, so any slope is solid.
      const reach = k < 0.12 ? Math.round(n * ease.out(k / 0.12)) : n;
      const layer = (hw, color, wobble) => {
        pen(color);
        for (let i = 0; i <= reach; i++) {
          const f = n ? i / n : 0;
          const c = Math.round((horiz ? a0y + dy * f : a0x + dx * f));
          const m = Math.round(horiz ? a0x + dx * f : a0y + dy * f);
          let h = hw;
          if (wobble) h += (Math.sin(i * 0.9 - lt * 32) > 0.35 ? 1 : 0);
          if (h < 0) continue;
          if (horiz) vspan(m, c - Math.round(h), c + Math.round(h));
          else span(c - Math.round(h), c + Math.round(h), m);
        }
      };
      if (w >= 1.5) { COV = 0.5; layer(w + 1, L[3], true); COV = 1; }
      if (w >= 0.5) layer(w, L[2], true);
      if (w >= 1) layer(w - 1, L[1], false);
      layer(0, L[0], false);
      // Knots of light racing down the beam.
      pen(L[0]);
      if (k < 0.8) for (let j = 0; j < 3; j++) {
        const f = ((lt * 2.6 + j / 3) % 1);
        if (f * n > reach) continue;
        const px = Math.round(a0x + dx * f), py = Math.round(a0y + dy * f);
        if (horiz) vspan(px, py - Math.round(w + 1), py + Math.round(w + 1)); else span(px - Math.round(w + 1), px + Math.round(w + 1), py);
      }
    },
    glow(k) {
      const env = k < 0.12 ? k / 0.12 : 1 - k;
      const n = 5;
      for (let i = 0; i <= n; i++) glow(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, (W + 4) * 3 * U, L[2], 0.5 * env);
    },
  });
}

/**
 * The body of a cone or a breath: a fan of flame (or frost, or gas) drawn
 * like a sprite frame, in hard temperature bands along a ramp: hottest at the
 * hand and down the middle, cooling to the ragged, licking rim. It shoots out,
 * holds, and burns back from the hand while the particles carry the rest off.
 */
function pFan(e, x, y, o) {
  const L = o.L || e.L, half = o.half || 0.46, dur = o.dur || 0.5;
  const ca = Math.cos(o.dir), sa = Math.sin(o.dir), tn = Math.tan(half);
  return add(e, {
    t0: o.t0, dur, z: 1,
    draw(k, lt) {
      const reach = (o.reach || e.R) / U;
      const front = reach * ease.out(Math.min(1, k / 0.3));
      const back = reach * Math.max(0, (k - 0.4) / 0.6) * 0.9;
      if (front - back < 1) return;
      const x0 = ax(x), y0 = ax(y), n = L.length;
      // Past its peak the fan comes apart from the tips inward: pixels drop
      // out (hashed, so it crumbles rather than fades) and the coolest band first.
      const er = k < 0.35 ? 0 : (k - 0.35) / 0.65;
      const ext = Math.ceil(front * tn + 3);
      const xs = [x0, x0 + ca * front - sa * ext, x0 + ca * front + sa * ext];
      const ys = [y0, y0 + sa * front + ca * ext, y0 + sa * front - ca * ext];
      const minx = Math.floor(Math.min(...xs)) - 1, maxx = Math.ceil(Math.max(...xs)) + 1;
      const miny = Math.floor(Math.min(...ys)) - 1, maxy = Math.ceil(Math.max(...ys)) + 1;
      const tick = (lt * 24) | 0;
      // Pixels by band, so each colour is one batch of rects.
      const bands = [];
      for (let py = miny; py <= maxy; py++) {
        for (let px = minx; px <= maxx; px++) {
          const dx = px - x0, dy = py - y0;
          const i = dx * ca + dy * sa, j = -dx * sa + dy * ca;
          // A sector, not a triangle: the far edge is an arc of the reach.
          const r = Math.sqrt(i * i + j * j);
          if (i < back || r > front) continue;
          // Licking edge: the half-width wavers along the fan and in time.
          const lick = 0.8 + 0.28 * Math.sin(i * 0.55 - lt * 26 + (j > 0 ? 1.7 : 0)) + 0.12 * hash2(Math.round(i / 2), tick, j > 0 ? 3 : 5);
          const w = Math.max(1, i * tn * 0.72 * lick + 1);
          const aj = Math.abs(j);
          if (aj > w) continue;
          // Tips of the fan break up into tongues.
          if (r > front - 3 && hash2(px, py, tick) < 0.45) continue;
          if (er && hash2(px, py, tick >> 1) < er * (0.55 + 0.9 * r / reach)) continue;
          const heat = 1 - (r / reach) * 0.75 - (aj / w) * 0.55 + (hash2(px >> 1, py >> 1, tick >> 1) - 0.5) * 0.18 - k * 0.2;
          let b = Math.round((1 - heat) * (n - 1));
          b = b < 0 ? 0 : b >= n ? n - 1 : b;
          if (b === n - 1 && er > 0.2) continue;
          (bands[b] || (bands[b] = [])).push(px, py);
        }
      }
      for (let b = n - 1; b >= 0; b--) {
        const pts = bands[b];
        if (!pts) continue;
        pen(L[b]);
        for (let q = 0; q < pts.length; q += 2) pp(pts[q], pts[q + 1]);
      }
    },
    glow(k) {
      const r = (o.reach || e.R) * 0.4;
      glow(x + ca * r, y + sa * r, r * 0.8, L[2], 0.45 * (k < 0.3 ? 1 : 1 - (k - 0.3) / 0.7));
    },
  });
}

/** A column of light standing on (x, yb), h caller px tall. */
function pPillar(e, x, yb, o = {}) {
  const L = o.L || e.L;
  const W = o.width || 4;
  return add(e, {
    t0: o.t0, dur: o.dur || 0.6, z: 2,
    draw(k, lt) {
      const env = k < 0.15 ? ease.out(k / 0.15) : k > 0.6 ? 1 - ease.in((k - 0.6) / 0.4) : 1;
      const w = W * env;
      if (w < 0.5) return;
      const cx = ax(x), b = ax(yb), top = ax(yb - (o.h || 120 * U));
      const drop = k < 0.15 ? top + Math.round((b - top) * (1 - ease.out(k / 0.15))) : top;
      const hw = Math.round(w), hm = Math.max(0, Math.round(w * 0.55));
      // Soft edge by dither, then body, then the white core with a shimmer.
      COV = 0.5; pen(L[3]);
      for (let y = drop; y <= b; y++) span(cx - hw - 1, cx + hw + 1, y);
      COV = 1; pen(L[2]);
      for (let y = drop; y <= b; y++) { const j = Math.sin(y * 0.8 + lt * 30) > 0.5 ? 1 : 0; span(cx - hw + j, cx + hw - j, y); }
      pen(L[1]);
      for (let y = drop; y <= b; y++) span(cx - hm, cx + hm, y);
      pen(L[0]);
      if (hm >= 1) for (let y = drop; y <= b; y++) span(cx - Math.max(0, hm - 1), cx + Math.max(0, hm - 1), y);
      else vspan(cx, drop, b);
      // The foot of the pillar spreads on the ground.
      pen(L[1]); span(cx - hw - 3, cx + hw + 3, b); pen(L[0]); span(cx - hw - 1, cx + hw + 1, b);
    },
    glow(k) {
      const env = k < 0.15 ? k / 0.15 : 1 - k;
      const h = o.h || 120 * U;
      for (let i = 0; i < 5; i++) glow(x, yb - h * i / 5, (W + 4) * 2 * U, L[2], 0.45 * env);
      glow(x, yb, (W + 6) * 2 * U, L[1], 0.8 * env);
    },
  });
}

/**
 * A curling tendril growing out of (x, y) at angle `ang`, then drawing back.
 * o.ol: an outline colour laid down and to the right of the stroke (away from
 * the light), which lifts a green vine off green grass.
 */
function pTendril(e, x, y, o) {
  const L = o.L || e.L;
  const ph = rnd(0, TAU), len = o.len || 14, curl = o.curl == null ? 0.9 : o.curl, sgn = chance(0.5) ? 1 : -1;
  const path = [];
  return add(e, {
    t0: o.t0, dur: o.dur || 0.7, z: o.z == null ? 1 : o.z,
    draw(k, lt) {
      const grow = k < 0.3 ? ease.out(k / 0.3) : k > 0.7 ? 1 - ease.in((k - 0.7) / 0.3) : 1;
      const n = Math.round(len * grow);
      if (n < 1) return;
      let fx = ax(x), fy = ax(y), a = o.ang;
      path.length = 0; path.push(fx, fy);
      for (let i = 0; i < n; i++) {
        a = o.ang + sgn * curl * Math.sin(i * 0.28 + ph + lt * 5) * (i / len);
        fx += Math.cos(a); fy += Math.sin(a);
        path.push(Math.round(fx), Math.round(fy));
      }
      const m = path.length / 2;
      if (o.ol) {
        pen(o.ol);
        for (let i = 0; i + 1 < m; i++) {
          const f = i / len, w = f < 0.4 ? 2 : 1;
          line(path[2 * i] + w, path[2 * i + 1], path[2 * i + 2] + w, path[2 * i + 3]);
          line(path[2 * i], path[2 * i + 1] + 1, path[2 * i + 2], path[2 * i + 3] + 1);
        }
      }
      for (let i = 0; i + 1 < m; i++) {
        const f = i / len;
        const nx = path[2 * i + 2], ny = path[2 * i + 3];
        pen(f < 0.35 ? L[3] : f < 0.75 ? L[2] : L[1]);
        line(path[2 * i], path[2 * i + 1], nx, ny);
        if (f < 0.4) pp(nx + 1, ny);
        // Thorns, every few pixels, on alternate sides (o.thorns).
        if (o.thorns && i % 4 === 2) { pen(L[0]); pp(nx + (i & 4 ? 1 : -1) * (f < 0.4 ? 2 : 1), ny - 1); }
      }
      pen(L[0]); pp(path[2 * m - 2], path[2 * m - 1]);
    },
    glow(k) { glow(x, y, len * 1.2 * U, L[2], 0.35 * (1 - k)); },
  });
}

/** A honeycomb dome (a ward) around (x, y): cells flare as the sweep finds them, then settle. */
function pHex(e, x, y, o) {
  const L = o.L || e.L;
  const rx = Math.max(4, Math.round((o.rx || 11 * e.u) / e.u)), ry = Math.max(4, Math.round((o.ry || 13 * e.u) / e.u));
  const a = o.cell || 5, h = a * 0.866;
  // The honeycomb is the boundary between nearest lattice points (a Voronoi of
  // the triangular lattice), found once per effect: a clean 1px line.
  const edge = [];
  for (let dy = -ry; dy <= ry; dy++) {
    const hw = halfW(rx, ry, dy);
    for (let dx = -hw; dx <= hw; dx++) {
      const j0 = Math.floor(dy / h);
      let d1 = 1e9, d2 = 1e9;
      for (let j = j0 - 1; j <= j0 + 2; j++) {
        const off = (j & 1) ? a / 2 : 0;
        const i0 = Math.floor((dx - off) / a);
        for (let i = i0 - 1; i <= i0 + 2; i++) {
          const d = Math.hypot(dx - (i * a + off), dy - j * h);
          if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
        }
      }
      const rim = Math.abs(hw - Math.abs(dx)) < 1 || Math.abs(dy) === ry;
      if (d2 - d1 < 0.9 || rim) edge.push(dx, dy, rim ? 1 : 0);
    }
  }
  return add(e, {
    t0: o.t0, dur: o.dur || 0.7, z: 1,
    draw(k, lt) {
      const cx = ax(x), cy = ax(y);
      const sweep = -ry + (2 * ry + 2) * ease.out(Math.min(1, k / 0.4));
      COV = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
      for (let pass = 0; pass < 3; pass++) {
        pen(pass === 0 ? L[2] : pass === 1 ? L[1] : L[0]);
        for (let i = 0; i < edge.length; i += 3) {
          const dx = edge[i], dy = edge[i + 1];
          if (dy > sweep) continue;
          const fresh = sweep - dy < 3;
          const shimmer = Math.sin((dx + dy) * 0.7 - lt * 18) > 0.8;
          const tone = fresh || (shimmer && k < 0.8) ? 2 : edge[i + 2] ? 1 : 0;
          if (tone === pass) pp(cx + dx, cy + dy);
        }
      }
    },
    glow(k) { glow(x, y, Math.max(rx, ry) * 1.6 * U, L[2], 0.45 * (1 - k)); },
  });
}

/** A ring of chain links cinching in around (x, y), then snapping away. */
function pChains(e, x, y, o) {
  const L = o.L || e.L;
  return add(e, {
    t0: o.t0, dur: o.dur || 0.8, z: 1,
    draw(k, lt) {
      const q = ease.out(Math.min(1, k / 0.45));
      const r = ((o.r0 || 16 * e.u) + ((o.r1 || 8 * e.u) - (o.r0 || 16 * e.u)) * q) / U;
      const ry = r * 0.42, cx = ax(x), cy = ax(y);
      const n = Math.max(6, Math.round(TAU * r / 3.2));
      const spin = lt * (k < 0.45 ? 5 : 0.6);
      const snap = k > 0.45 && k < 0.55;
      COV = k > 0.62 ? 1 - (k - 0.62) / 0.38 : 1;
      for (let i = 0; i < n; i++) {
        const a = spin + (i / n) * TAU;
        const px = cx + Math.round(Math.cos(a) * r), py = cy + Math.round(Math.sin(a) * ry);
        const front = Math.sin(a) > 0;
        pen(snap ? L[0] : front ? L[1] : L[3]);
        if (i & 1) { pp(px - 1, py); pp(px + 1, py); }       // a link seen side-on
        else { pp(px, py - 1); pp(px, py + 1); pp(px - 1, py); pp(px + 1, py); pen(snap ? L[0] : front ? L[0] : L[2]); pp(px, py - 1); }
      }
    },
    glow(k) { glow(x, y, 14 * U, L[3], 0.3 * (1 - k)); },
  });
}

/** A chain of links laid along a line (compelled duel, bonds). */
function pChainLine(e, x0, y0, x1, y1, o) {
  const L = o.L || e.L;
  return add(e, {
    t0: o.t0, dur: o.dur || 0.7, z: 1,
    draw(k, lt) {
      const reach = ease.out(Math.min(1, k / 0.35));
      const a0x = ax(x0), a0y = ax(y0), a1x = ax(x1), a1y = ax(y1);
      const len = Math.hypot(a1x - a0x, a1y - a0y), n = Math.max(2, Math.round(len / 3));
      const sag = (1 - reach) * 6 + (k > 0.35 ? 0 : 2);
      COV = k > 0.65 ? 1 - (k - 0.65) / 0.35 : 1;
      for (let i = 0; i <= n * reach; i++) {
        const f = i / n;
        const px = Math.round(a0x + (a1x - a0x) * f), py = Math.round(a0y + (a1y - a0y) * f + Math.sin(f * Math.PI) * sag);
        pen(i & 1 ? L[2] : L[1]);
        if (i & 1) pp(px, py); else { pp(px - 1, py); pp(px + 1, py); pp(px, py - 1); pp(px, py + 1); }
      }
    },
    glow(k) { glow((x0 + x1) / 2, (y0 + y1) / 2, 10 * U, L[2], 0.3 * (1 - k)); },
  });
}

// 3x5 rune glyphs for summoning circles (1 = lit).
const RUNES = [
  '010111010010010', '111100111100111', '101101111001001', '110101110101110',
  '010101101101010', '111010010010111', '100110101011001', '011100010001110',
];
/** A summoning circle drawn on the ground at (x, y): circles, a star and runes. */
function pCircle(e, x, y, o) {
  const L = o.L || e.L;
  // Seven points by default: Mystra's seven stars, the sign of the Weave.
  const pts = o.star == null ? 7 : o.star;
  return add(e, {
    t0: o.t0, dur: o.dur || 1.1, z: 0,
    draw(k, lt) {
      const rx = Math.round((o.r || e.R) / U), ry = Math.max(3, Math.round(rx * 0.5));
      const cx = ax(x), cy = ax(y);
      const draw = Math.min(1, k / 0.3);
      COV = k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
      const lit = k > 0.3 && k < 0.8;
      ARC_ON = draw < 1; ARC0 = -Math.PI / 2 + lt * 0.4; ARCN = TAU * draw;
      pen(lit ? L[1] : L[2]); ring(cx, cy, rx, ry);
      pen(L[2]); ring(cx, cy, rx - 3, ry - 2);
      ARC_ON = false;
      if (k > 0.2 && pts) {
        // The star: every other point of `pts` joined, drawn in as it lights.
        const sk = Math.min(1, (k - 0.2) / 0.25);
        pen(lit ? L[1] : L[3]);
        const rr = rx - 3, rry = ry - 2, rot = lt * 0.4;
        for (let i = 0; i < pts; i++) {
          if (i / pts > sk) break;
          const a1 = rot + i / pts * TAU, a2 = rot + ((i + 2) % pts) / pts * TAU;
          line(cx + Math.round(Math.cos(a1) * rr), cy + Math.round(Math.sin(a1) * rry), cx + Math.round(Math.cos(a2) * rr), cy + Math.round(Math.sin(a2) * rry));
        }
      }
      // Runes stand between the two circles and light one after another.
      const nr = Math.max(4, Math.min(12, Math.round(rx / 3)));
      for (let i = 0; i < nr; i++) {
        const a = -lt * 0.5 + i / nr * TAU;
        const on = k > 0.15 + 0.3 * i / nr;
        if (!on) continue;
        const gx = cx + Math.round(Math.cos(a) * (rx - 1.5)) - 1, gy = cy + Math.round(Math.sin(a) * (ry - 1)) - 2;
        const g = RUNES[i % RUNES.length];
        pen(lit && Math.sin(lt * 10 + i) > -0.2 ? L[0] : L[1]);
        for (let j = 0; j < 15; j++) if (g[j] === '1') pp(gx + (j % 3), gy + ((j / 3) | 0) - 1);
      }
    },
    glow(k) { glow(x, y, (o.r || e.R) * 1.1, L[2], 0.6 * (k < 0.3 ? k / 0.3 : 1 - k)); },
  });
}

/** A crescent: a sword's arc, thick in the middle, drawn in three strokes. */
function pSlash(e, x, y, o) {
  const L = o.L || e.L;
  const r = o.r || 10, a0 = o.a0 == null ? -2.2 : o.a0, sweep = o.sweep || 2.4;
  return add(e, {
    t0: o.t0, dur: o.dur || 0.2, z: 2,
    draw(k) {
      const head = a0 + sweep * ease.out(Math.min(1, k / 0.4));
      const tailA = a0 + sweep * Math.max(0, (k - 0.3) / 0.7);
      if (head - tailA === 0) return;
      const cx = ax(x), cy = ax(y);
      const steps = Math.ceil(Math.abs(head - tailA) * (r + 1) * 1.4);
      for (let pass = 0; pass < 3; pass++) {
        pen(pass === 0 ? ci(L, 0.4 + k * 0.4) : pass === 1 ? ci(L, 0.15 + k * 0.5) : ci(L, k * 0.6));
        for (let s = 0; s <= steps; s++) {
          const f = s / steps;
          const a = tailA + (head - tailA) * f;
          const th = Math.round((o.thick || 3) * Math.sin(Math.PI * f));
          const ca = Math.cos(a), sa = Math.sin(a);
          if (pass === 2) { pp(cx + Math.round(ca * r), cy + Math.round(sa * r)); continue; }
          const inner = pass === 0 ? r - th : r - Math.max(0, th - 1);
          for (let rr = inner; rr < r; rr++) pp(cx + Math.round(ca * rr), cy + Math.round(sa * rr));
        }
      }
    },
    glow(k) { glow(x, y, r * 1.2 * U, ci(L, 0.3), 0.35 * (1 - k)); },
  });
}

/** A travelling head from->to: straight, lobbed (arc) or curved (a bezier bend). */
function pMissile(e, o) {
  const x0 = o.x0 == null ? e.fx : o.x0, y0 = o.y0 == null ? e.fy : o.y0;
  const x1 = o.x1 == null ? e.tx : o.x1, y1 = o.y1 == null ? e.ty : o.y1;
  const d = Math.hypot(x1 - x0, y1 - y0);
  const dur = o.dur || Math.max(0.12, d / ((o.speed || 300) * e.u));
  const nx = d ? -(y1 - y0) / d : 0, ny = d ? (x1 - x0) / d : 0;
  const bend = (o.bend || 0) * d;
  const st = { x: x0, y: y0, px: x0, py: y0, acc: 0 };
  const pos = (k) => {
    const q = o.ease ? o.ease(k) : k;
    const b = 4 * q * (1 - q);
    st.x = x0 + (x1 - x0) * q + nx * bend * b;
    st.y = y0 + (y1 - y0) * q + ny * bend * b - (o.arc || 0) * e.u * b;
  };
  const part = add(e, {
    t0: o.t0, dur, z: 2,
    tick(dt, lt) {
      st.px = st.x; st.py = st.y;
      pos(Math.min(1, lt / dur));
      if (o.trail) {
        // One trail puff per art pixel travelled, whatever the frame rate.
        st.acc += Math.hypot(st.x - st.px, st.y - st.py) / e.u;
        while (st.acc >= (o.every || 1)) {
          st.acc -= (o.every || 1);
          const f = st.acc / Math.max(0.001, Math.hypot(st.x - st.px, st.y - st.py) / e.u);
          o.trail(st.x + (st.px - st.x) * f, st.y + (st.py - st.y) * f, st.x - st.px, st.y - st.py);
        }
      }
    },
    draw(k, lt) { pos(Math.min(1, lt / dur)); o.head(ax(st.x), ax(st.y), st.x - st.px, st.y - st.py, lt); },
    glow() { glow(st.x, st.y, (o.glowR || 8) * U, o.glowC || ci(o.L || e.L, 0.35), o.glowA == null ? 0.7 : o.glowA); },
  });
  part.arrive = (o.t0 || 0) + dur;
  return part;
}

/** Run fn(lt) `rate` times a second from t0 for dur. */
function pEmit(e, o) {
  let acc = 0;
  return add(e, {
    t0: o.t0, dur: o.dur || 0.3, z: 1,
    tick(dt, lt) { acc += o.rate * dt * (FX.reducedMotion ? 0.5 : 1); while (acc >= 1) { acc--; o.fn(lt); } },
    draw() {},
  });
}

/** Spikes of ice punching up out of the ground in a ring, then shattering. */
function pSpikes(e, x, y, o) {
  const L = o.L || LIFE.cold;
  const n = o.n || 7, R = o.r || e.R * 0.6, sp = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rnd(-0.3, 0.3), rr = R * Math.sqrt(rnd(0.05, 1));
    sp.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.5, Math.round(rnd(0.55, 1) * (o.h || 9)), rnd(0, 0.12)]);
  }
  // Back to front, so a near spike stands in front of a far one.
  sp.sort((p, q) => p[1] - q[1]);
  const flat = [].concat(...sp);
  sp.length = 0; sp.push(...flat);
  return add(e, {
    t0: o.t0, dur: o.dur || 0.55, z: 1,
    draw(k) {
      for (let i = 0; i < sp.length; i += 4) {
        const kk = Math.max(0, (k - sp[i + 3]) / 0.25);
        if (kk <= 0 || k > 0.8) continue;
        const h = Math.round(sp[i + 2] * ease.out(Math.min(1, kk)));
        const bx = ax(sp[i]), by = ax(sp[i + 1]);
        const wb = Math.max(1, Math.round(h / 3));
        // Lit face on the left (upper-left light), shadow face on the right.
        for (let yy = 0; yy < h; yy++) {
          const w = Math.round(wb * (1 - yy / h));
          pen(L[1]); span(bx - w, bx - 1, by - yy);
          pen(L[3]); span(bx, bx + w, by - yy);
        }
        pen(L[0]); vspan(bx - 1, by - h + 1, by - Math.round(h / 3));
        pp(bx, by - h);
      }
    },
    glow(k) { glow(x, y, R * 1.2, L[2], 0.4 * (1 - k)); },
  });
}

/** A web: radial threads and sagging rings (Web). */
function pWeb(e, x, y, o) {
  const L = WEB;
  return add(e, {
    t0: o.t0, dur: o.dur || 1.3, z: 0,
    draw(k) {
      const g = ease.out(Math.min(1, k / 0.35));
      const R = (o.r || e.R) / U * g, cx = ax(x), cy = ax(y);
      COV = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      pen(L[2]);
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * TAU + 0.2;
        line(cx, cy, cx + Math.round(Math.cos(a) * R), cy + Math.round(Math.sin(a) * R * 0.55));
      }
      pen(L[1]);
      for (let ring2 = 1; ring2 <= 3; ring2++) {
        const rr = R * ring2 / 3.4;
        for (let i = 0; i < 8; i++) {
          const a1 = i / 8 * TAU + 0.2, a2 = (i + 1) / 8 * TAU + 0.2;
          line(cx + Math.round(Math.cos(a1) * rr), cy + Math.round(Math.sin(a1) * rr * 0.55),
            cx + Math.round(Math.cos(a2) * rr * 0.93), cy + Math.round(Math.sin(a2) * rr * 0.55 * 0.93));
        }
      }
    },
  });
}

/** Rings that wobble like a struck bell or a thought (psychic). */
function pRipple(e, x, y, o) {
  const L = o.L || e.L;
  return add(e, {
    t0: o.t0, dur: o.dur || 0.6, z: 1,
    draw(k, lt) {
      const cx = ax(x), cy = ax(y);
      const n = o.n || 3;
      for (let j = 0; j < n; j++) {
        const kk = k * 1.4 - j * 0.18;
        if (kk <= 0 || kk >= 1) continue;
        const r = ((o.r0 || 2 * e.u) + ((o.r1 || e.R) - (o.r0 || 2 * e.u)) * ease.out(kk)) / U;
        const sq = o.ry == null ? 0.7 : o.ry;
        COV = kk > 0.6 ? 1 - (kk - 0.6) / 0.4 : 1;
        pen(j & 1 ? L[2] : L[1]);
        const steps = Math.max(12, Math.round(TAU * r));
        let lx = 0, ly = 0;
        for (let s = 0; s <= steps; s++) {
          const a = s / steps * TAU;
          const rr = r + Math.sin(a * (o.lobes || 5) + lt * 14 + j) * (o.amp == null ? 1.2 : o.amp);
          const px = cx + Math.round(Math.cos(a) * rr), py = cy + Math.round(Math.sin(a) * rr * sq);
          if (s) line(lx, ly, px, py);
          lx = px; ly = py;
        }
      }
    },
    glow(k) { glow(x, y, (o.r1 || e.R) * 0.9, L[2], 0.35 * (1 - k)); },
  });
}

/** A hole in the air (a portal, a banishment): a lens of dark ringed in light. */
function pRift(e, x, y, o) {
  const L = o.L || e.L;
  return add(e, {
    t0: o.t0, dur: o.dur || 0.6, z: 1,
    draw(k, lt) {
      const open = k < 0.3 ? ease.out(k / 0.3) : k > 0.65 ? 1 - ease.in((k - 0.65) / 0.35) : 1;
      const rx = Math.round((o.rx || 4) * open), ry = Math.round((o.ry || 11) * (0.3 + 0.7 * open));
      if (ry < 1) return;
      const cx = ax(x), cy = ax(y);
      pen(o.core || RAMPS.black[0]); disc(cx, cy, Math.max(0, rx - 1), Math.max(0, ry - 1));
      pen(L[1]); ring(cx, cy, rx, ry);
      pen(L[0]);
      const a = lt * 9;
      pp(cx + Math.round(Math.cos(a) * rx), cy + Math.round(Math.sin(a) * ry));
      pp(cx - Math.round(Math.cos(a) * rx), cy - Math.round(Math.sin(a) * ry));
    },
    glow(k) { glow(x, y, 14 * U, L[2], 0.6 * (1 - k)); },
  });
}

/** A body coming apart into its own pixels, bottom last (death dissolve). */
function pDissolve(e, o) {
  const img = o.image;
  const px = [];
  if (img && typeof img.getContext === 'function') {
    try {
      const w = img.width, h = img.height;
      const d = img.getContext('2d').getImageData(0, 0, w, h).data;
      const s = o.imageScale || 1;
      const ox = e.tx - (o.anchorX == null ? w / 2 : o.anchorX) * s * e.u, oy = e.gy - (o.anchorY == null ? h : o.anchorY) * s * e.u;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (d[i + 3] < 128) continue;
        const col = '#' + ((1 << 24) + (d[i] << 16) + (d[i + 1] << 8) + d[i + 2]).toString(16).slice(1);
        // Top rows go first, with a ragged front.
        const tDie = 0.1 + (y / h) * 0.55 + hash2(x, y, 7) * 0.3;
        px.push(ox + x * s * e.u, oy + y * s * e.u, tDie, col, s);
      }
    } catch (err) { px.length = 0; }
  }
  let next = 0;
  const order = px.length ? px.map((_, i) => i).filter((i) => i % 5 === 0).sort((a, b) => px[a + 2] - px[b + 2]) : [];
  return add(e, {
    t0: o.t0, dur: o.dur || 1.1, z: 1,
    tick(dt, lt) {
      const k = lt / (o.dur || 1.1);
      while (next < order.length && px[order[next] + 2] <= k) {
        const i = order[next++];
        if (i % 10 !== 0 && FX.reducedMotion) continue;
        const p = spawn(chance(0.6) ? P_PX : P_MOTE, px[i], px[i + 1], e.u, [px[i + 3], px[i + 3], ...(o.ash || DARK)]);
        p.vx = rnd(-6, 6) * e.u; p.vy = -rnd(10, 26) * e.u; p.ay = -8 * e.u; p.drag = 1.2;
        p.life = rnd(0.5, 0.9); p.wob = 10 * e.u; p.fade = 0.4;
      }
    },
    draw(k) {
      for (let i = 0; i < px.length; i += 5) {
        if (px[i + 2] <= k) continue;
        const s = px[i + 4];
        // The pixels about to go burn pale first.
        pen(px[i + 2] - k < 0.06 ? (o.ember || LIFE.necrotic[1]) : px[i + 3]);
        const bx = ax(px[i]), by = ax(px[i + 1]);
        if (s === 1) pp(bx, by); else for (let yy = 0; yy < s; yy++) span(bx, bx + s - 1, by + yy);
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Style building blocks (compositions reused across styles)
// ---------------------------------------------------------------------------

const fireKind = (e) => e.kind === 'fire';

/** Where a projectile lands and what it does there, by damage type. */
function impactFor(e, x, y, t0, big) {
  const s = big ? 1.5 : 1;
  switch (e.kind) {
    case 'fire':
      pArt(e, 'burst', x, y, { t0, kind: 'fire', glowR: 16 * s });
      pDecal(e, x, e.gy, { t0, rx: 5 * s * e.u, dur: 2 });
      at(e, t0, () => {
        spray(e, x, y, { n: 12 * s, k: P_EMBER, speed: 55 * s, up: 20, grav: -30, life: 0.7, L: FIRE_LIFE, drag: 2, gl: 1 });
        spray(e, x, y - 2 * e.u, { n: 4 * s, k: P_SMOKE, speed: 12, up: 14, grav: -12, life: 1, L: SMOKE, sz: 1, grow: 3, dens: 0.55, late: 0.1 });
      });
      tail(e, t0 + 1.2);
      return;
    case 'cold':
      pFlare(e, x, y, { t0, size: 5 * s, L: LIFE.cold });
      pSpikes(e, x, e.gy, { t0, n: big ? 6 : 3, r: 5 * s * e.u, h: 7 * s, dur: 0.5 });
      pDecal(e, x, e.gy, { t0, rx: 6 * s * e.u, dur: 1.6, cols: [RAMPS.cold[3], RAMPS.cold[2], RAMPS.cold[1]], cov: 0.6 });
      at(e, t0 + 0.38, () => spray(e, x, e.gy - 4 * e.u, { n: 12 * s, k: P_SHARD, speed: 60, up: 30, grav: 160, life: 0.5, L: LIFE.cold, sz: 2 }));
      tail(e, t0 + 1.6);
      return;
    case 'lightning':
      pFlare(e, x, y, { t0, size: 7 * s, L: LIFE.lightning });
      pBolt(e, x, y - 2 * e.u, x + rnd(-8, 8) * e.u, e.gy + 2 * e.u, { t0, dur: 0.22, branches: 1, jag: 0.3 });
      at(e, t0, () => spray(e, x, y, { n: 12 * s, speed: 110, life: 0.3, L: LIFE.lightning, trail: 4, gl: 1 }));
      return;
    case 'acid':
      acidSplash(e, x, y, t0, s);
      return;
    case 'poison':
      pArt(e, 'burst', x, y, { t0, kind: 'poison' });
      at(e, t0, () => spray(e, x, y, { n: 7 * s, k: P_SMOKE, speed: 14, life: 1.1, L: LIFE.poison, sz: 1, grow: 4, dens: 0.6, grav: -6 }));
      tail(e, t0 + 1.2);
      return;
    case 'necrotic':
      for (let i = 0; i < (big ? 5 : 3); i++) pTendril(e, x + rnd(-4, 4) * e.u, e.gy, { t0: t0 + i * 0.04, ang: -Math.PI / 2 + rnd(-0.9, 0.9), len: rnd(8, 13) * s, dur: 0.6, L: LIFE.necrotic });
      pArt(e, 'burst', x, y, { t0, kind: 'necrotic' });
      at(e, t0, () => spray(e, x, y - 4 * e.u, { n: 4 * s, k: P_SMOKE, speed: 8, grav: -14, life: 0.8, L: WISP, sz: 0, grow: 2, dens: 0.4 }));
      tail(e, t0 + 1);
      return;
    case 'psychic':
      pRipple(e, x, y, { t0, r0: 2 * e.u, r1: 12 * s * e.u, n: 3, dur: 0.55, L: LIFE.psychic });
      pFlare(e, x, y, { t0, size: 4 * s, L: LIFE.psychic });
      return;
    case 'radiant':
      pArt(e, 'burst', x, y, { t0, kind: 'radiant', glowR: 18 * s });
      pFlare(e, x, y, { t0, size: 8 * s, L: LIFE.radiant, dur: 0.2 });
      at(e, t0, () => spray(e, x, y, { n: 10 * s, k: P_GLINT, speed: 40, up: 10, grav: -20, life: 0.6, L: LIFE.radiant, gl: 1 }));
      tail(e, t0 + 0.7);
      return;
    case 'thunder':
      pRing(e, x, e.gy, { t0, r0: 2 * e.u, r1: 16 * s * e.u, dur: 0.35, L: LIFE.thunder, thick: 2 });
      pFlare(e, x, y, { t0, size: 6 * s, L: LIFE.thunder });
      at(e, t0, () => FX.shake(0.18 * s, 0.18));
      return;
    default: {
      pArt(e, 'burst', x, y, { t0, kind: e.art, glowR: 14 * s });
      at(e, t0, () => spray(e, x, y, { n: 10 * s, speed: 80 * s, life: 0.32, trail: 3, gl: 1 }));
    }
  }
}

function acidSplash(e, x, y, t0, s = 1) {
  const L = LIFE.acid;
  pFlare(e, x, y, { t0, size: 4 * s, L });
  pDecal(e, x, e.gy, { t0: t0 + 0.2, rx: 7 * s * e.u, dur: 1.8, cols: [RAMPS.acid[1], RAMPS.acid[0], RAMPS.poison[0]], cov: 0.7 });
  at(e, t0, () => {
    // A crown of drops thrown up, falling back to splat on the ground.
    spray(e, x, y, { n: 16 * s, k: P_DROP, speed: 50 * s, dir: -Math.PI / 2, spread: 1.2, up: 30, grav: 220, drag: 0.4, life: 1.2, L, gy: e.gy + rnd(-2, 2) * e.u });
    spray(e, x, y, { n: 5, k: P_SMOKE, speed: 8, up: 6, grav: -10, life: 0.9, L: [RAMPS.acid[3], RAMPS.acid[2], RAMPS.poison[1]], sz: 1, grow: 2, dens: 0.5, late: 0.15 });
  });
  // Hissing bubbles off the splat.
  pEmit(e, { t0: t0 + 0.3, dur: 0.9, rate: 14, fn: () => {
    const p = spawn(P_MOTE, x + rnd(-6, 6) * s * e.u, e.gy + rnd(-2, 2) * e.u, e.u, L);
    p.vy = -rnd(6, 14) * e.u; p.life = rnd(0.3, 0.5); p.fade = 0.5;
  } });
  tail(e, t0 + 2);
}

/** The fire bolt's head: a flickering plus of flame with a white heart. */
function flameHead(L) {
  return (x, y, dx, dy, lt) => {
    const f = ((lt * 20) | 0) & 1;
    const bx = Math.round(-Math.sign(dx)), by = Math.round(-Math.sign(dy));
    pen(L[3]); pp(x + bx * 2, y + by * 2); pp(x + bx * 3 + (f ? 0 : by), y + by * 3 + (f ? bx : 0));
    pen(L[2]); if (f) plus(x, y, 1); else { span(x - 1, x + 1, y - 1); span(x - 1, x + 1, y + 1); pp(x - 1, y); pp(x + 1, y); }
    pp(x + bx, y + by); pp(x + bx * 2 + by, y + by * 2 + bx);
    pen(L[1]); pp(x, y); pp(x + bx, y + by);
    pen(L[0]); pp(x, y);
  };
}

function orbHead(L, r = 1) {
  return (x, y, dx, dy, lt) => {
    pen(L[3]); disc(x, y, r + 1, r + 1);
    pen(L[1]); disc(x, y, r, r);
    pen(L[0]); pp(x - (r > 0 ? 1 : 0), y - (r > 0 ? 1 : 0)); pp(x, y);
    if (((lt * 16) | 0) & 1) { pen(L[1]); plus(x, y, r + 2); }
  };
}

/** A dart of force, two pixels of light and a streak. */
function dartHead(L) {
  return (x, y, dx, dy) => {
    const d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
    pen(L[2]); line(x, y, Math.round(x - ux * 4), Math.round(y - uy * 4));
    pen(L[1]); line(x, y, Math.round(x - ux * 2), Math.round(y - uy * 2));
    pen(L[0]); pp(x, y); pp(Math.round(x + ux), Math.round(y + uy));
  };
}

function shardHead(L) {
  return (x, y, dx, dy) => {
    const d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
    pen(L[3]); line(Math.round(x - ux * 4), Math.round(y - uy * 4), Math.round(x - ux * 2), Math.round(y - uy * 2));
    pen(L[1]); line(Math.round(x - ux * 2 - uy), Math.round(y - uy * 2 + ux), x, y);
    pen(L[0]); line(Math.round(x - ux * 2 + uy), Math.round(y - uy * 2 - ux), Math.round(x + ux), Math.round(y + uy));
  };
}

/** A hailstone: a lumpy chunk of ice lit from the upper left, with a streak above it. */
function hailHead(x, y) {
  pen(RAMPS.cold[1]); span(x - 1, x + 1, y + 1); pp(x + 1, y); pp(x + 2, y);
  pen(RAMPS.cold[3]); span(x - 1, x + 1, y - 1); span(x - 2, x, y);
  pen(RAMPS.cold[4]); pp(x - 1, y - 1);
  pen(RAMPS.cold[2]); pp(x - 2, y - 3); pp(x - 3, y - 5);
}

function arrowHead(x, y, dx, dy) {
  const d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
  pen(WOOD[1]); line(x, y, Math.round(x - ux * 7), Math.round(y - uy * 7));
  pen(IRON[1]); pp(x, y); pp(Math.round(x + ux), Math.round(y + uy));
  pen(RAMPS.bone[3]);
  pp(Math.round(x - ux * 6 - uy), Math.round(y - uy * 6 + ux)); pp(Math.round(x - ux * 7 + uy), Math.round(y - uy * 7 - ux));
}

/** Eldritch Blast: a knot of violet-black force wrapped in crackle. */
function eldritchHead(L) {
  return (x, y, dx, dy, lt) => {
    pen(RAMPS.necrotic[0]); disc(x, y, 2, 2);
    pen(L[1]); ring(x, y, 2, 2);
    pen(L[0]); pp(x - 1, y - 1);
    pen(L[2]);
    const s = (lt * 30) | 0;
    for (let j = 0; j < 3; j++) {
      const a = (s * 2.1 + j * 2.09) % TAU;
      const ex = x + Math.round(Math.cos(a) * 4), ey = y + Math.round(Math.sin(a) * 4);
      line(x + Math.round(Math.cos(a) * 2), y + Math.round(Math.sin(a) * 2), ex + ((s + j) & 1), ey);
    }
  };
}

// ---------------------------------------------------------------------------
// The styles
// ---------------------------------------------------------------------------

/** A spell or blow's look, built into effect e. Keys are style ids. */
const STYLES = {};

// --- projectiles ---------------------------------------------------------------

STYLES.bolt = (e) => {
  if (e.kind === 'lightning') return STYLES.strike(e);
  if (e.kind === 'force') return STYLES['magic-missile'](e);
  if (e.kind === 'psychic') return STYLES['mind-sliver'](e);
  const L = e.L;
  let head = orbHead(L, 0), trail;
  if (fireKind(e)) {
    head = flameHead(L);
    // The streak behind a fire bolt is orange going to red and out: its white
    // and yellow belong to the head alone, or the whole bolt reads pale.
    trail = (x, y) => {
      const p = spawn(chance(0.7) ? P_EMBER : P_PX, x + rnd(-1, 1) * e.u, y + rnd(-1, 1) * e.u, e.u, FIRE_TRAIL);
      p.vx = rnd(-8, 8) * e.u; p.vy = rnd(-12, 2) * e.u; p.ay = -20 * e.u; p.life = rnd(0.2, 0.4); p.drag = 2;
      if (chance(0.06)) { const s = spawn(P_SMOKE, x, y, e.u, SMOKE); s.vy = -10 * e.u; s.life = 0.45; s.sz = 0; s.grow = 2; s.dens = 0.4; }
    };
  } else if (e.kind === 'cold' || e.dtype === 'piercing') {
    head = shardHead(e.kind === 'cold' ? L : LIFE.cold);
    trail = (x, y) => { const p = spawn(P_MOTE, x, y, e.u, LIFE.cold); p.vy = rnd(-4, 4) * e.u; p.vx = rnd(-4, 4) * e.u; p.life = 0.35; };
  } else if (e.kind === 'radiant') {
    head = (x, y, dx, dy, lt) => { orbHead(L, 1)(x, y, dx, dy, lt); pen(L[1]); plus(x, y, 3 + (((lt * 14) | 0) & 1)); };
    trail = (x, y) => { const p = spawn(P_GLINT, x, y, e.u, L); p.vx = rnd(-6, 6) * e.u; p.vy = rnd(-6, 6) * e.u; p.life = 0.3; p.drag = 3; };
  } else {
    trail = (x, y) => { const p = spawn(P_SPARK, x, y, e.u, L); p.vx = rnd(-10, 10) * e.u; p.vy = rnd(-10, 10) * e.u; p.life = 0.22; p.drag = 4; p.tr = 1; };
  }
  const m = pMissile(e, { speed: e.o.speed || 340, head, trail, L, glowR: 10 });
  impactFor(e, e.tx, e.ty, m.arrive, false);
  impactAt(e, m.arrive);
};

STYLES.orb = (e) => {
  const L = e.L;
  const m = pMissile(e, { speed: 230, arc: 12, head: orbHead(L, 1), L, glowR: 12,
    trail: (x, y) => { const p = spawn(P_MOTE, x, y, e.u, L); p.vx = rnd(-6, 6) * e.u; p.vy = rnd(-6, 6) * e.u; p.life = 0.3; p.drag = 3; } });
  impactFor(e, e.tx, e.ty, m.arrive, true);
  impactAt(e, m.arrive);
};

STYLES.arrow = (e) => {
  const m = pMissile(e, { speed: 380, arc: Math.min(18, e.dist / e.u * 0.12), head: arrowHead, glowA: 0 });
  STYLES['hit-pierce'](e, m.arrive);
  impactAt(e, m.arrive);
};

STYLES['fire-bolt'] = (e) => { e.kind = 'fire'; e.L = FIRE_LIFE; e.art = 'fire'; STYLES.bolt(e); };

STYLES['magic-missile'] = (e) => {
  // Three darts (or o.count) that bend out and in, each striking on its own.
  const L = LIFE.force, n = Math.max(1, Math.min(9, e.o.count || 3));
  const pts = e.victims || [{ x: e.tx, y: e.ty }];
  let last = 0;
  for (let i = 0; i < n; i++) {
    const v = pts[i % pts.length];
    const bend = (i % 2 ? 1 : -1) * rnd(0.18, 0.34) * (i === 1 ? 1.2 : 1);
    const m = pMissile(e, { t0: i * 0.07, x1: v.x, y1: v.y, speed: 300, bend, ease: ease.io, head: dartHead(L), L, glowR: 6,
      trail: (x, y) => { const p = spawn(P_SPARK, x, y, e.u, L); p.life = 0.2; p.vx = rnd(-4, 4) * e.u; p.vy = rnd(-4, 4) * e.u; p.tr = 1; p.fade = 0.3; } });
    pFlare(e, v.x, v.y, { t0: m.arrive, size: 4, L });
    at(e, m.arrive, () => spray(e, v.x, v.y, { n: 5, speed: 70, life: 0.25, L, trail: 2, gl: 1 }));
    last = Math.max(last, m.arrive);
  }
  impactAt(e, last);
};

STYLES['mind-sliver'] = (e) => {
  const L = LIFE.psychic;
  const m = pMissile(e, { speed: 260, head: (x, y, dx, dy, lt) => { pen(L[1]); ring(x, y, 1 + (((lt * 20) | 0) % 2), 1); pen(L[0]); pp(x, y); }, L,
    trail: (x, y) => { const p = spawn(P_MOTE, x, y, e.u, L); p.life = 0.3; } });
  impactFor(e, e.tx, e.ty, m.arrive, false);
  impactAt(e, m.arrive);
};

STYLES['eldritch-blast'] = (e) => {
  const L = LIFE.arcane, n = Math.max(1, Math.min(4, e.o.count || 1));
  const pts = e.victims || [{ x: e.tx, y: e.ty }];
  let last = 0;
  for (let i = 0; i < n; i++) {
    const v = pts[i % pts.length];
    const m = pMissile(e, { t0: i * 0.12, x1: v.x, y1: v.y, speed: 420, head: eldritchHead(L), L, glowR: 12,
      trail: (x, y) => {
        const p = spawn(chance(0.5) ? P_PX : P_SPARK, x + rnd(-1, 1) * e.u, y + rnd(-1, 1) * e.u, e.u, [L[1], L[2], RAMPS.necrotic[1], RAMPS.necrotic[0]]);
        p.vx = rnd(-10, 10) * e.u; p.vy = rnd(-10, 10) * e.u; p.life = rnd(0.2, 0.4); p.drag = 3; p.tr = 2; p.fade = 0.4;
      } });
    pArt(e, 'burst', v.x, v.y, { t0: m.arrive, kind: 'arcane' });
    pRing(e, v.x, v.y, { t0: m.arrive, r0: 2 * e.u, r1: 10 * e.u, ry: 1, dur: 0.25, L, thick: 1 });
    at(e, m.arrive, () => spray(e, v.x, v.y, { n: 9, speed: 90, life: 0.3, L, trail: 3, gl: 1 }));
    last = Math.max(last, m.arrive);
  }
  impactAt(e, last);
};

// --- beams ---------------------------------------------------------------------

STYLES.beam = (e) => {
  if (e.kind === 'radiant') return STYLES['moonbeam'](e);
  if (e.kind === 'lightning') return STYLES['lightning-bolt'](e);
  if (e.kind === 'psychic' || (!e.kind && !(e.spell && e.spell.damage))) return STYLES.whisper(e);
  const L = e.L;
  const w = e.kind === 'force' ? 2 : e.kind === 'cold' ? 1.6 : 1.4;
  pBeam(e, e.fx, e.fy, e.tx, e.ty, { width: w, dur: 0.48, L });
  pFlare(e, e.fx, e.fy, { size: 3, L, dur: 0.3 });
  const t = 0.08;
  if (e.kind === 'cold') {
    pSpikes(e, e.tx, e.gy, { t0: t, n: 4, r: 6 * e.u, h: 7 });
    pDecal(e, e.tx, e.gy, { t0: t, rx: 7 * e.u, dur: 1.4, cols: [RAMPS.cold[3], RAMPS.cold[2], RAMPS.cold[1]], cov: 0.6 });
    pEmit(e, { t0: t, dur: 0.35, rate: 40, fn: () => { const p = spawn(P_SHARD, e.tx, e.ty, e.u, L); const a = rnd(0, TAU); p.vx = Math.cos(a) * 50 * e.u; p.vy = Math.sin(a) * 50 * e.u; p.life = 0.3; p.drag = 3; p.sz = 2; } });
    tail(e, 1.4);
  } else if (e.kind === 'necrotic') {
    for (let i = 0; i < 4; i++) pTendril(e, e.tx + rnd(-5, 5) * e.u, e.gy, { t0: t + i * 0.05, ang: -Math.PI / 2 + rnd(-0.8, 0.8), len: rnd(8, 12), dur: 0.55 });
  } else if (e.kind === 'poison') {
    pEmit(e, { t0: t, dur: 0.4, rate: 20, fn: () => { const p = spawn(P_SMOKE, e.tx + rnd(-3, 3) * e.u, e.ty, e.u, L); p.vy = -8 * e.u; p.life = 0.8; p.grow = 3; p.dens = 0.55; } });
    tail(e, 1.2);
  }
  pEmit(e, { t0: t, dur: 0.36, rate: 45, fn: () => {
    const p = spawn(P_SPARK, e.tx, e.ty, e.u, L); const a = e.dir + Math.PI + rnd(-1.3, 1.3), s = rnd(40, 90) * e.u;
    p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s; p.life = 0.25; p.drag = 3; p.tr = 3; p.gl = 1;
  } });
  impactAt(e, t);
  tail(e, 0.8);
};

STYLES['ray-of-frost'] = (e) => { e.kind = 'cold'; e.L = LIFE.cold; e.art = 'cold'; STYLES.beam(e); };

/** A thread of light carrying a message, or a will, to someone. */
STYLES.whisper = (e) => {
  const L = e.L;
  const m = pMissile(e, { speed: 220, bend: 0.12, head: (x, y) => { pen(L[1]); plus(x, y, 1); pen(L[0]); pp(x, y); }, L,
    trail: (x, y) => { const p = spawn(P_MOTE, x, y, e.u, L); p.life = 0.5; p.vy = -4 * e.u; p.fade = 0.3; } });
  pRipple(e, e.tx, e.ty, { t0: m.arrive, r0: 2 * e.u, r1: 10 * e.u, n: 2, dur: 0.5, amp: e.kind === 'psychic' ? 1.2 : 0.4 });
  impactAt(e, m.arrive);
};

STYLES['lightning-bolt'] = (e) => {
  // A line of lightning a hundred feet long: from the caster through the target and on.
  const L = LIFE.lightning;
  const len = Math.max(e.dist, 90 * e.u);
  const ex = e.fx + Math.cos(e.dir) * len, ey = e.fy + Math.sin(e.dir) * len;
  pBolt(e, e.fx, e.fy, ex, ey, { dur: 0.5, branches: 3, jag: 0.12, lead: 0.08, L });
  pFlare(e, e.fx, e.fy, { size: 6, L });
  at(e, 0.05, () => { VFX.flash(RAMPS.lightning[4], 0.12, 0.5); FX.shake(0.25, 0.2); });
  for (const v of e.victims || [{ x: e.tx, y: e.ty }]) at(e, 0.06, () => spray(e, v.x, v.y, { n: 10, speed: 100, life: 0.3, L, trail: 4, gl: 1 }));
  impactAt(e, 0.06);
};

STYLES.moonbeam = (e) => {
  // Moonbeam is silver; Sunbeam (which borrows the look) is the radiant gold.
  const L = e.spell && e.spell.id === 'sunbeam' ? LIFE.radiant : MOON;
  pPillar(e, e.tx, e.gy, { width: 5 * (e.R > 20 * e.u ? 1.2 : 1), dur: 0.9, L, h: 140 * e.u });
  pRing(e, e.tx, e.gy, { t0: 0.1, r0: 3 * e.u, r1: 14 * e.u, dur: 0.5, L, thick: 1 });
  pEmit(e, { t0: 0.1, dur: 0.6, rate: 26, fn: () => { const p = spawn(P_MOTE, e.tx + rnd(-5, 5) * e.u, e.gy - rnd(0, 6) * e.u, e.u, L); p.vy = -rnd(20, 40) * e.u; p.life = rnd(0.4, 0.7); p.gl = 1; } });
  impactAt(e, 0.12);
  tail(e, 1.3);
};

// --- lightning from the sky ------------------------------------------------------

STYLES.strike = (e) => {
  const L = LIFE.lightning;
  const top = e.gy - 150 * e.u;
  if (hasArt('lightning')) pArt(e, 'lightning', e.tx, e.gy, { kind: 'lightning', glowR: 20, glowDy: 20 * e.u, z: 2 });
  else pBolt(e, e.tx + rnd(-20, 20) * e.u, top, e.tx, e.gy, { dur: 0.45, branches: 3, L });
  pBolt(e, e.tx + rnd(-10, 10) * e.u, top, e.tx, e.gy - 12 * e.u, { dur: 0.3, branches: 2, jag: 0.15, L, t0: 0.02 });
  pRing(e, e.tx, e.gy, { t0: 0.06, r0: 2 * e.u, r1: 14 * e.u, dur: 0.35, L, thick: 1 });
  pDecal(e, e.tx, e.gy, { t0: 0.06, rx: 10 * e.u, dur: 1.8 });
  at(e, 0.05, () => {
    VFX.flash(RAMPS.lightning[4], 0.1, 0.55); FX.shake(0.3, 0.25);
    spray(e, e.tx, e.gy - 2 * e.u, { n: 14, speed: 110, dir: -Math.PI / 2, spread: 1.4, grav: 200, life: 0.45, L, trail: 3, gl: 1 });
  });
  impactAt(e, 0.06);
  tail(e, 1.8);
};
STYLES['call-lightning'] = STYLES.strike;

/** Arcs leaping from point to point (chain lightning, shocking grasp, witch bolt). */
STYLES.chain = (e) => {
  if (e.kind !== 'lightning' && !(e.spell && e.spell.damage)) {
    const k = spellKind(e.spell);
    if (k === 'debuff' || k === 'condition') return STYLES['debuff-chain'](e);
    return STYLES.tether(e);
  }
  const L = e.kind ? e.L : LIFE.lightning;
  const pts = [{ x: e.fx, y: e.fy }, ...(e.victims || [{ x: e.tx, y: e.ty }])];
  for (let i = 0; i + 1 < pts.length; i++) {
    const t0 = i * 0.07;
    pBolt(e, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, { t0, dur: 0.4, branches: 1, jag: 0.18, L });
    pFlare(e, pts[i + 1].x, pts[i + 1].y, { t0: t0 + 0.04, size: 5, L });
    at(e, t0 + 0.04, () => spray(e, pts[i + 1].x, pts[i + 1].y, { n: 8, speed: 90, life: 0.3, L, trail: 3, gl: 1 }));
  }
  at(e, 0.04, () => VFX.flash(L[0], 0.08, 0.3));
  impactAt(e, 0.05);
};

/** A bond between two creatures: a line of motes that settles into a thread. */
STYLES.tether = (e) => {
  const L = e.L;
  const pts = e.victims || [{ x: e.tx, y: e.ty }];
  for (const v of pts) {
    pMissile(e, { x1: v.x, y1: v.y, speed: 160, bend: 0.15, head: (x, y) => { pen(L[1]); plus(x, y, 1); pen(L[0]); pp(x, y); }, L,
      trail: (x, y) => { const p = spawn(P_MOTE, x, y, e.u, L); p.life = 0.7; p.fade = 0.4; } });
    buffAt(e, v.x, v.y, e.dist / (160 * e.u), 0.6);
  }
  impactAt(e, Math.min(0.5, e.dist / (160 * e.u)));
};

STYLES['debuff-chain'] = (e) => {
  const L = e.L;
  for (const v of e.victims || [{ x: e.tx, y: e.ty }]) {
    pChainLine(e, e.fx, e.fy, v.x, v.y, { dur: 0.8, L });
    pChains(e, v.x, v.y, { t0: 0.2, dur: 0.7, L, r0: 12 * e.u, r1: 7 * e.u });
  }
  impactAt(e, 0.3);
};

// --- cones and breath ------------------------------------------------------------

STYLES.cone = (e) => {
  const L = e.L, u = e.u;
  const reach = Math.max(e.R, e.dist, 30 * u);
  const half = e.o.spread || 0.46;
  const k = e.kind;
  const life = 0.42;
  const prism = !!(e.spell && /color-spray|prismatic/.test(e.spell.id));
  const sp = reach / life * 1.25;
  pFlare(e, e.fx, e.fy, { size: 4, L, dur: 0.25 });
  if (k !== 'lightning' && (k || e.dtype)) {
    const body = k === 'fire' || !k ? FIRE_FAN : k === 'cold' ? COLD_FAN : L.slice(0, 4);
    pFan(e, e.fx, e.fy, { dir: e.dir, reach, half, dur: 0.5, L: body });
  }
  pEmit(e, { dur: 0.38, rate: k === 'lightning' ? 30 : 110, fn: () => {
    const a = e.dir + rnd(-half, half) * rnd(0.4, 1);
    const s = sp * rnd(0.45, 1);
    let p;
    if (k === 'cold') { p = spawn(chance(0.3) ? P_SHARD : P_SMOKE, e.fx, e.fy, u, L); p.sz = p.k === P_SHARD ? 2 : 0; p.grow = 5; p.dens = 0.5; }
    else if (k === 'poison' || k === 'necrotic' || k === 'acid') { p = spawn(P_SMOKE, e.fx, e.fy, u, L); p.sz = 0; p.grow = 6; p.dens = 0.55; }
    else if (k === 'lightning') { p = spawn(P_SPARK, e.fx, e.fy, u, L); p.tr = 5; }
    else if (!k && !e.dtype) {
      // A cone of pure spell (colour spray): motes in the spell's colours, no flame.
      const R = prism ? PRISM[(vr.next() * PRISM.length) | 0] : L;
      p = spawn(chance(0.3) ? P_GLINT : P_MOTE, e.fx, e.fy, u, R);
    }
    else if (chance(0.12)) {
      // Smoke rolls off the far end of the fan, after the flame has gone by.
      p = spawn(P_SMOKE, e.fx, e.fy, u, SMOKE); p.sz = 0; p.grow = 5; p.dens = 0.5; p.late = 0.4;
    } else {
      // Flame is many small tongues cooling from white at the mouth to red at the tips.
      p = spawn(chance(0.35) ? P_EMBER : P_PX, e.fx, e.fy, u, k === 'fire' || !k ? FIRE_LIFE : L); p.sz = rnd(1, 2); p.grow = 1.5;
    }
    p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s; p.drag = 2.2; p.life = life * rnd(0.8, 1.2);
    p.wob = 26 * u; p.gl = 0.5; p.fade = 0.55;
  } });
  if (k === 'lightning') for (let i = 0; i < 3; i++) {
    const a = e.dir + rnd(-half, half);
    pBolt(e, e.fx, e.fy, e.fx + Math.cos(a) * reach, e.fy + Math.sin(a) * reach, { t0: i * 0.08, dur: 0.28, branches: 1, L });
  }
  if (k === 'lightning' || !(k || e.dtype)) pGlow(e, e.fx + Math.cos(e.dir) * reach * 0.5, e.fy + Math.sin(e.dir) * reach * 0.5, { r: reach * 0.45, dur: 0.6, env: (q) => (q < 0.2 ? q / 0.2 : 1 - q), color: L[2] });
  if (k === 'fire' || (!k && e.dtype)) pDecal(e, e.fx + Math.cos(e.dir) * reach * 0.55, e.fgy + Math.sin(e.dir) * reach * 0.55, { t0: 0.2, rx: reach * 0.35, dur: 2 });
  if (k === 'cold') pDecal(e, e.fx + Math.cos(e.dir) * reach * 0.55, e.fgy + Math.sin(e.dir) * reach * 0.55, { t0: 0.2, rx: reach * 0.35, dur: 1.8, cols: [RAMPS.cold[3], RAMPS.cold[2], RAMPS.cold[1]], cov: 0.55 });
  impactAt(e, 0.16);
  tail(e, 2);
};
STYLES.breath = STYLES.cone;

// --- area bursts -----------------------------------------------------------------

/** The fireball: a bead flies, the air goes white, a ball of flame the size of the spell, then smoke and a scorch. */
STYLES.fireball = (e) => {
  const u = e.u, L = FIRE_LIFE, R = e.R;
  e.kind = 'fire'; e.L = L; e.art = 'fire';
  let t0 = 0;
  if (e.dist > 12 * u && e.o.travel !== false) {
    const m = pMissile(e, { speed: 260, arc: Math.min(28, e.dist / u * 0.2), head: (x, y, dx, dy, lt) => { pen(L[2]); plus(x, y, 1); pen(L[0]); pp(x, y); }, L, glowR: 8,
      trail: (x, y) => { const p = spawn(P_EMBER, x, y, u, L); p.life = 0.3; p.vy = -6 * u; p.gl = 0.5; } });
    t0 = m.arrive;
  }
  const cx = e.tx, cy = e.gy - 6 * u;
  at(e, t0, () => { VFX.flash('#fff2c8', 0.1, 0.45); FX.shake(0.45, 0.4); VFX.freeze(0.04); });
  pFlare(e, cx, cy, { t0, size: 10, L, dur: 0.12 });
  pArt(e, 'fireball', cx, e.gy, { t0, kind: 'fire', glowR: 24, glowDy: 12 * u, z: 2 });
  // The ball is the art; the spell's real size is carried by the shock ring,
  // the flames licking across the whole area and the scorch left behind.
  pRing(e, e.tx, e.gy, { t0, r0: 6 * u, r1: R * 1.05, dur: 0.4, L, thick: 2, glow: 0.8 });
  pDecal(e, e.tx, e.gy, { t0: t0 + 0.12, rx: R * 0.75, dur: 3.2 });
  pGlow(e, cx, cy, { t0, r: R * 1.3, dur: 0.9, a: 1, env: (q) => (1 - q) * (1 - q) });
  const n = budget(Math.min(14, 4 + R / u / 5));
  for (let i = 0; i < n; i++) {
    const a = rnd(0, TAU), rr = R * Math.sqrt(rnd(0.15, 0.85));
    const x = e.tx + Math.cos(a) * rr, y = e.gy + Math.sin(a) * rr * 0.5 - 4 * u;
    pArt(e, 'burst', x, y, { t0: t0 + 0.04 + rr / R * 0.14 + rnd(0, 0.06), kind: 'fire', glow: 0.4, glowR: 10 });
  }
  at(e, t0 + 0.05, () => {
    spray(e, cx, cy, { n: 30, k: P_EMBER, speed: R / u * 2.6, up: 20, grav: 40, drag: 1.6, life: 0.9, L, gl: 1, jit: 3 });
    spray(e, cx, cy, { n: 10, k: P_SPARK, speed: R / u * 4, dir: -Math.PI / 2, spread: 1.3, grav: 120, life: 0.5, L, trail: 4, gl: 1 });
  });
  pEmit(e, { t0: t0 + 0.3, dur: 0.6, rate: 22, fn: () => {
    const a = rnd(0, TAU), rr = R * 0.7 * Math.sqrt(vr.next());
    const p = spawn(P_SMOKE, e.tx + Math.cos(a) * rr, e.gy + Math.sin(a) * rr * 0.5 - 6 * u, u, SMOKE);
    p.vy = -rnd(10, 22) * u; p.vx = rnd(-5, 5) * u; p.life = rnd(1, 1.5); p.sz = 1; p.grow = rnd(2.5, 4); p.dens = 0.6; p.drag = 0.6;
  } });
  impactAt(e, t0 + 0.02);
  tail(e, t0 + 3.2);
};

STYLES.thunder = (e) => {
  const u = e.u, L = LIFE.thunder, R = e.R;
  const x = e.tx, y = e.gy;
  at(e, 0, () => { FX.shake(0.4, 0.35); VFX.freeze(0.03); VFX.flash(RAMPS.thunder[4], 0.06, 0.25); });
  // The clap: a disc of white air for two frames (a flare inside the ring read as a gunsight).
  add(e, { dur: 0.05, z: 2, draw() { pen(L[0]); disc(ax(x), ax(e.ty), 4, 4); } });
  // The air itself: a full circle for two frames, then the ground rings.
  pRing(e, x, e.ty, { r0: 4 * u, r1: R * 0.8, ry: 1, dur: 0.16, L, thick: 1, hold: 0.2, z: 2 });
  for (let i = 0; i < 3; i++) pRing(e, x, y, { t0: i * 0.07, r0: 3 * u, r1: R * (1 - i * 0.18), dur: 0.42, L, thick: 2 - (i > 1 ? 1 : 0), cool: i * 0.15, glow: i ? false : 0.5 });
  at(e, 0.06, () => {
    // Dust kicked up at the front of the wave.
    const n = budget(18);
    for (let i = 0; i < n; i++) {
      const a = rnd(0, TAU), p = spawn(P_SMOKE, x + Math.cos(a) * R * 0.5, y + Math.sin(a) * R * 0.25, u, DUST);
      p.vx = Math.cos(a) * R * 1.4; p.vy = Math.sin(a) * R * 0.6 - 6 * u; p.drag = 3.5; p.life = rnd(0.5, 0.8); p.sz = 0; p.grow = 3.5; p.dens = 0.55;
    }
  });
  if (e.spell && e.spell.id === 'shatter') {
    at(e, 0.02, () => spray(e, x, e.ty, { n: 18, k: P_SHARD, speed: 90, life: 0.5, L: SILVER, sz: 2, grav: 80 }));
    pFlare(e, x, e.ty, { t0: 0.05, size: 12, L: SILVER, dur: 0.18 });
  }
  impactAt(e, 0.03);
  tail(e, 1);
};

STYLES.radiant = (e) => {
  const u = e.u, L = e.kind === 'radiant' || !e.color ? LIFE.radiant : rampOfColor(e.color), R = e.R;
  pPillar(e, e.tx, e.gy, { width: Math.max(3, Math.min(8, R / u / 4)), dur: 0.75, L, h: 150 * u });
  if (hasArt('smite')) pArt(e, 'smite', e.tx, e.gy, { t0: 0.1, kind: 'radiant', glowR: 20, glowDy: 16 * u });
  pRing(e, e.tx, e.gy, { t0: 0.1, r0: 3 * u, r1: Math.max(R, 14 * u), dur: 0.45, L, thick: 2 });
  at(e, 0.1, () => { VFX.flash(RAMPS.radiant[4], 0.08, 0.3); spray(e, e.tx, e.gy - 4 * u, { n: 16, k: P_GLINT, speed: 50, up: 26, grav: -30, life: 0.8, L, gl: 1 }); });
  pEmit(e, { t0: 0.12, dur: 0.5, rate: 30, fn: () => { const p = spawn(P_MOTE, e.tx + rnd(-6, 6) * u, e.gy, u, L); p.vy = -rnd(25, 50) * u; p.life = rnd(0.4, 0.7); p.gl = 1; } });
  impactAt(e, 0.1);
  tail(e, 1.2);
};

STYLES.tendrils = (e) => {
  const u = e.u, L = e.kind === 'necrotic' || !e.color ? LIFE.necrotic : rampOfColor(e.color), R = e.R;
  const pts = e.victims || [{ x: e.tx, y: e.ty }];
  const n = Math.max(5, Math.min(9, Math.round(R / u / 3)));
  for (const v of pts) {
    const gy = v.y + (e.gy - e.ty);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + ((i / (n - 1)) - 0.5) * 2.4;
      pTendril(e, v.x + Math.cos(a + Math.PI / 2) * 5 * u, gy, { t0: i * 0.03, ang: a, len: rnd(10, 18), dur: 0.8, L, curl: 1.1 });
    }
    pDecal(e, v.x, gy, { rx: 9 * u, dur: 1.2, cols: [RAMPS.necrotic[0], RAMPS.black[2], RAMPS.necrotic[1]], cov: 0.5 });
    at(e, 0.12, () => {
      // What the dark takes out of them rises off them: thin wisps, not soot.
      spray(e, v.x, v.y - 6 * u, { n: 5, k: P_SMOKE, speed: 8, grav: -14, life: 0.9, L: WISP, sz: 0, grow: 2, dens: 0.4 });
      spray(e, v.x, v.y, { n: 6, k: P_MOTE, speed: 10, up: 24, grav: -20, life: 0.9, L: [RAMPS.necrotic[4], RAMPS.necrotic[3], RAMPS.necrotic[2]] });
    });
  }
  if (e.spell && e.spell.id === 'toll-the-dead') {
    for (let i = 0; i < 2; i++) pRing(e, e.tx, e.ty, { t0: i * 0.22, r0: 3 * u, r1: 18 * u, ry: 0.8, dur: 0.5, L, thick: 1 });
  }
  impactAt(e, 0.14);
  tail(e, 1.3);
};

STYLES.psychic = (e) => {
  const u = e.u, L = LIFE.psychic, R = e.R;
  for (const v of e.victims || [{ x: e.tx, y: e.ty }]) {
    // Tight rings round the head, not loops across the field: the mind is the target.
    pRipple(e, v.x, v.y - 6 * u, { r0: 2 * u, r1: Math.max(9 * u, Math.min(R * 0.6, 14 * u)), n: 3, dur: 0.6, L, lobes: 6, amp: 0.8, ry: 0.55 });
    pFlare(e, v.x, v.y - 4 * u, { t0: 0.05, size: 4, L });
    at(e, 0.08, () => spray(e, v.x, v.y - 6 * u, { n: 8, k: P_MOTE, speed: 30, life: 0.6, L, drag: 3, gl: 1 }));
  }
  impactAt(e, 0.1);
};

STYLES.shards = (e) => {
  const u = e.u, L = e.kind === 'force' ? LIFE.force : e.L, R = e.R;
  pRing(e, e.tx, e.ty, { r0: 2 * u, r1: Math.max(R * 0.7, 10 * u), ry: 1, dur: 0.3, L, thick: 1 });
  pFlare(e, e.tx, e.ty, { size: 7, L });
  at(e, 0, () => spray(e, e.tx, e.ty, { n: 16, k: P_SHARD, speed: Math.max(70, R / u * 3), life: 0.45, L, sz: 3, drag: 3, gl: 1 }));
  pHex(e, e.tx, e.ty, { rx: 6 * u, ry: 7 * u, cell: 4, dur: 0.35, L });
  impactAt(e, 0.02);
};

STYLES.ice = (e) => {
  const u = e.u, L = LIFE.cold, R = e.R;
  pSpikes(e, e.tx, e.gy, { n: Math.max(6, Math.min(14, Math.round(R / u / 2.5))), r: R * 0.8, h: 11, dur: 0.7 });
  pDecal(e, e.tx, e.gy, { rx: R * 0.9, dur: 2, cols: [RAMPS.cold[3], RAMPS.cold[2], RAMPS.cold[1]], cov: 0.55 });
  pRing(e, e.tx, e.gy, { r0: 3 * u, r1: R, dur: 0.4, L, thick: 1 });
  at(e, 0.5, () => { spray(e, e.tx, e.gy - 5 * u, { n: 24, k: P_SHARD, speed: R / u * 2.2, up: 30, grav: 200, life: 0.6, L, sz: 2, jit: R / u * 0.4, jitY: R / u * 0.2 }); FX.shake(0.15, 0.15); });
  pEmit(e, { dur: 0.6, rate: 30, fn: () => { const p = spawn(P_SMOKE, e.tx + rnd(-1, 1) * R, e.gy + rnd(-0.4, 0.4) * R, u, [RAMPS.cold[4], RAMPS.cold[3], RAMPS.cold[2]]); p.vy = -4 * u; p.life = 0.9; p.grow = 3; p.dens = 0.4; } });
  impactAt(e, 0.05);
  tail(e, 2);
};

STYLES.acid = (e) => {
  let t0 = 0;
  if (e.dist > 12 * e.u) {
    const m = pMissile(e, { speed: 220, arc: 16, head: orbHead(LIFE.acid, 1), L: LIFE.acid,
      trail: (x, y) => { const p = spawn(P_DROP, x, y, e.u, LIFE.acid); p.vy = 10 * e.u; p.ay = 200 * e.u; p.gy = y + 12 * e.u; p.life = 0.5; } });
    t0 = m.arrive;
  }
  for (const v of e.victims || [{ x: e.tx, y: e.ty }]) acidSplash(e, v.x, v.y, t0, Math.max(1, e.R / e.u / 12));
  impactAt(e, t0);
};

STYLES.cloud = (e) => {
  // A billow that fills the area and hangs there (poison, stinking cloud, fog).
  const u = e.u, R = e.R;
  const L = e.o.cloud || (e.kind === 'poison' ? [RAMPS.poison[3], RAMPS.poison[2], RAMPS.acid[2], RAMPS.poison[1], RAMPS.poison[0]] : e.L);
  pEmit(e, { dur: 0.6, rate: Math.min(60, 20 + R / u), fn: () => {
    const a = rnd(0, TAU), rr = R * Math.sqrt(vr.next());
    const p = spawn(P_SMOKE, e.tx + Math.cos(a) * rr, e.gy + Math.sin(a) * rr * 0.5 - rnd(2, 8) * u, u, L);
    p.vx = Math.cos(a) * 6 * u; p.vy = -rnd(1, 5) * u; p.drag = 0.8; p.life = rnd(1.2, 1.8);
    p.sz = 1; p.grow = rnd(2, 3.5); p.dens = e.o.dens || 0.62; p.fade = 0.5; p.wob = 4 * u;
  } });
  if (e.kind === 'poison') pEmit(e, { t0: 0.2, dur: 0.8, rate: 10, fn: () => { const p = spawn(P_MOTE, e.tx + rnd(-1, 1) * R, e.gy - rnd(0, 10) * u, u, [RAMPS.acid[4], RAMPS.acid[3], RAMPS.poison[2]]); p.vy = -rnd(4, 10) * u; p.life = 0.6; } });
  impactAt(e, 0.2);
  tail(e, 2.4);
};

STYLES.darkness = (e) => {
  e.o.cloud = [RAMPS.black[1], RAMPS.black[0], RAMPS.black[0], RAMPS.necrotic[0]];
  e.o.dens = 0.8;
  STYLES.cloud(e);
};

STYLES.fog = (e) => {
  e.o.cloud = [RAMPS.steel[3], RAMPS.stone[3], RAMPS.stone[2], RAMPS.slate[2]];
  e.o.dens = 0.4;   // see-through: fog is the one cloud you half see through
  STYLES.cloud(e);
};

STYLES.web = (e) => {
  pWeb(e, e.tx, e.gy, { r: Math.max(e.R, 14 * e.u), dur: 1.4 });
  at(e, 0, () => spray(e, e.tx, e.ty, { n: 10, k: P_MOTE, speed: 40, life: 0.5, L: WEB }));
  impactAt(e, 0.2);
};

STYLES.vines = (e) => {
  // Entangle, plant growth, spike growth, wall of thorns: the ground reaches up.
  const u = e.u, R = Math.max(e.R, 12 * u);
  const n = Math.max(6, Math.min(14, Math.round(R / u / 2.5)));
  const L = e.dtype === 'piercing' ? [RAMPS.bone[3], RAMPS.grassDry[3], RAMPS.wood[2], RAMPS.woodDark[1], RAMPS.woodDark[0]] : VINE;
  for (let i = 0; i < n; i++) {
    const a = rnd(0, TAU), rr = R * Math.sqrt(rnd(0.05, 1));
    pTendril(e, e.tx + Math.cos(a) * rr, e.gy + Math.sin(a) * rr * 0.5, { t0: rnd(0, 0.2), ang: -Math.PI / 2 + rnd(-0.6, 0.6), len: rnd(8, 15), dur: 1.1, L, curl: 1.4, z: 1, ol: RAMPS.woodDark[0], thorns: e.dtype === 'piercing' || /thorn|spike/.test((e.spell && e.spell.id) || '') });
  }
  at(e, 0.05, () => spray(e, e.tx, e.gy, { n: 10, k: P_PX, speed: 30, up: 30, grav: 120, life: 0.7, L: [RAMPS.grass[3], RAMPS.grass[2], RAMPS.foliage[1]], jit: R / u * 0.5, jitY: R / u * 0.25 }));
  impactAt(e, 0.2);
  tail(e, 1.3);
};

// --- blessings, wards, curses ------------------------------------------------------

/** Motes rising from a ring at the feet, in waves (the shape of every blessing). */
function buffAt(e, x, y, t0, dur = 0.9, L = e.L) {
  const u = e.u, gy = y + (e.gy - e.ty);
  pRing(e, x, gy, { t0, r0: 3 * u, r1: 11 * u, ry: 0.45, dur: 0.5, L, thick: 2, glow: 0.3 });
  pEmit(e, { t0, dur: dur * 0.7, rate: 46, fn: () => {
    const a = rnd(0, TAU);
    const p = spawn(chance(0.35) ? P_GLINT : P_MOTE, x + Math.cos(a) * 8 * u, gy + Math.sin(a) * 3 * u, u, L);
    p.vy = -rnd(22, 40) * u; p.ay = -12 * u; p.life = rnd(0.5, 0.8); p.gl = 1; p.fade = 0.55;
  } });
  pGlow(e, x, y, { t0, r: 16 * u, dur, env: (q) => (q < 0.2 ? q / 0.2 : 1 - q), a: 0.45, color: L[2] });
}

STYLES.buff = (e) => {
  for (const v of e.victims || [{ x: e.tx, y: e.ty }]) buffAt(e, v.x, v.y, 0, 1);
  impactAt(e, 0.15);
  tail(e, 1.1);
};

STYLES.heal = (e) => {
  const u = e.u, L = e.color && !e.kind ? rampOfColor(e.color) : LIFE.healing;
  let t0 = 0;
  const pts = e.victims || [{ x: e.tx, y: e.ty }];
  if (e.dist > 20 * u && pts.length === 1) {
    const m = pMissile(e, { speed: 200, bend: 0.2, head: (x, y) => { pen(L[1]); plus(x, y, 1); pen(L[0]); pp(x, y); }, L,
      trail: (x, y) => { const p = spawn(P_MOTE, x, y, u, L); p.life = 0.4; p.vy = -6 * u; } });
    t0 = m.arrive;
  }
  for (const v of pts) {
    const gy = v.y + (e.gy - e.ty);
    pRing(e, v.x, gy, { t0, r0: 2 * u, r1: 11 * u, ry: 0.45, dur: 0.55, L, thick: 2, glow: 0.3 });
    // Motes on a helix, closing in as they climb: the wound drawing shut. Two
    // waves, and every third one a glint, so it reads as healing at a glance.
    for (let w = 0; w < 2; w++) at(e, t0 + w * 0.22, () => {
      const n = budget(12);
      for (let i = 0; i < n; i++) {
        const p = spawn(i % 3 === 0 ? P_GLINT : P_MOTE, v.x, gy, u, L);
        p.helix = true; p.hx = v.x; p.hy = gy - rnd(0, 4) * u; p.ha = (i / n) * TAU * 2 + w; p.hr = rnd(7, 10) * u;
        p.hw = rnd(5, 7) * (i & 1 ? 1 : -1); p.hrise = rnd(24, 34) * u; p.life = rnd(0.7, 1); p.gl = 1; p.fade = 0.6;
      }
    });
    pGlow(e, v.x, v.y, { t0, r: 18 * u, dur: 1, env: (q) => (q < 0.15 ? q / 0.15 : 1 - q), a: 0.55, color: L[2] });
  }
  impactAt(e, t0 + 0.1);
  tail(e, t0 + 1.1);
};

STYLES.ward = (e) => {
  const u = e.u, L = e.L;
  for (const v of e.victims || [{ x: e.tx, y: e.ty }]) {
    pHex(e, v.x, v.y - 2 * u, { rx: 10 * u, ry: 13 * u, cell: 5, dur: e.spell && e.spell.id === 'shield' ? 0.5 : 0.8, L });
    pFlare(e, v.x - 6 * u, v.y - 10 * u, { t0: 0.15, size: 3, L, dur: 0.2 });
  }
  impactAt(e, 0.1);
};

STYLES.debuff = (e) => {
  const u = e.u, L = e.L;
  for (const v of e.victims || [{ x: e.tx, y: e.ty }]) {
    pChains(e, v.x, v.y + 2 * u, { dur: 0.85, L, r0: 15 * u, r1: 8 * u });
    at(e, 0.4, () => spray(e, v.x, v.y - 8 * u, { n: 5, k: P_SMOKE, speed: 8, grav: 10, life: 0.7, L: [L[2], L[3], L[4]], sz: 0, grow: 2, dens: 0.4 }));
    if (e.spell && (e.spell.id === 'hex' || e.spell.id === 'bestow-curse')) pArt(e, 'sigil', v.x, v.y - 18 * u, { t0: 0.1, kind: e.art, glowR: 10 });
  }
  impactAt(e, 0.4);
  tail(e, 1.2);
};

/** Charms, sleep, fear: a coloured whorl over the head and motes that drift. */
STYLES.charm = (e) => {
  const u = e.u, L = e.L;
  for (const v of e.victims || [{ x: e.tx, y: e.ty }]) {
    pRipple(e, v.x, v.y - 12 * u, { r0: 1 * u, r1: 8 * u, n: 3, dur: 0.8, L, ry: 0.5, amp: 0.8, lobes: 4 });
    at(e, 0.1, () => spray(e, v.x, v.y - 12 * u, { n: 8, k: P_GLINT, speed: 20, up: 6, grav: 10, life: 0.8, L, drag: 2, gl: 1 }));
  }
  impactAt(e, 0.2);
};

STYLES.summon = (e) => {
  const u = e.u, L = e.L, R = Math.max(12 * u, Math.min(e.R, 28 * u));
  pCircle(e, e.tx, e.gy, { r: R, dur: 1.3, L });
  pPillar(e, e.tx, e.gy, { t0: 0.55, width: 3, dur: 0.5, L, h: 60 * u });
  at(e, 0.6, () => { spray(e, e.tx, e.gy - 6 * u, { n: 18, k: P_MOTE, speed: 30, up: 30, grav: -20, life: 0.8, L, gl: 1, jit: R / u * 0.6, jitY: R / u * 0.3 }); VFX.flash(L[0], 0.06, 0.2); });
  impactAt(e, 0.65);
  tail(e, 1.5);
};

STYLES.sigil = (e) => {
  // Detect magic, identify, alarm, knock: the caster's craft drawn in the air.
  const u = e.u, L = e.L;
  if (hasArt('sigil')) pArt(e, 'sigil', e.tx, e.gy, { kind: e.art, glowR: 16, z: 0 });
  else pCircle(e, e.tx, e.gy, { r: 12 * u, dur: 0.9, L });
  pEmit(e, { t0: 0.15, dur: 0.5, rate: 24, fn: () => { const a = rnd(0, TAU); const p = spawn(P_MOTE, e.tx + Math.cos(a) * 10 * u, e.gy + Math.sin(a) * 4 * u, u, L); p.vy = -rnd(12, 24) * u; p.life = 0.6; p.gl = 1; } });
  if (e.R > 24 * u) pRing(e, e.tx, e.gy, { t0: 0.2, r0: 10 * u, r1: e.R, dur: 0.7, L, thick: 1 });
  impactAt(e, 0.2);
  tail(e, 1);
};

STYLES.teleport = (e) => {
  const u = e.u, L = e.L;
  pRift(e, e.fx, e.fy, { dur: 0.6, L, rx: 5, ry: 12 });
  pRift(e, e.tx, e.ty, { t0: 0.25, dur: 0.6, L, rx: 5, ry: 12 });
  at(e, 0.1, () => spray(e, e.fx, e.fy, { n: 12, k: P_MOTE, speed: 30, life: 0.5, L, gl: 1 }));
  at(e, 0.35, () => { spray(e, e.tx, e.ty, { n: 12, k: P_MOTE, speed: 30, life: 0.5, L, gl: 1 }); VFX.flash(L[0], 0.05, 0.18); });
  impactAt(e, 0.3);
};

STYLES['misty-step'] = (e) => {
  // Silver mist at both ends: it swallows you here and gives you back there.
  const u = e.u, L = SILVER;
  const mist = (x, y, t0, inward) => {
    pEmit(e, { t0, dur: 0.22, rate: 80, fn: () => {
      const a = rnd(0, TAU), r0 = inward ? rnd(8, 12) * u : rnd(0, 3) * u;
      const p = spawn(P_SMOKE, x + Math.cos(a) * r0, y + Math.sin(a) * r0 * 0.8, u, L);
      const s = (inward ? -1 : 1) * rnd(14, 26) * u;
      p.vx = Math.cos(a) * s + Math.sin(a) * 12 * u; p.vy = Math.sin(a) * s * 0.7 - Math.cos(a) * 8 * u - 4 * u;
      p.drag = 2.4; p.life = rnd(0.6, 0.95); p.sz = 1; p.grow = rnd(2, 3.5); p.dens = 0.7; p.fade = 0.35;
    } });
    at(e, t0 + 0.05, () => spray(e, x, y, { n: 8, k: P_GLINT, speed: 26, life: 0.55, L, gl: 1, drag: 2 }));
    pGlow(e, x, y, { t0, r: 18 * u, dur: 0.7, color: RAMPS.steel[3], a: 0.5 });
  };
  mist(e.fx, e.fy, 0, false);
  mist(e.tx, e.ty, 0.18, true);
  // A few motes skip across between the two.
  if (e.dist > 8 * u) for (let i = 0; i < 4; i++) {
    pMissile(e, { t0: 0.04 + i * 0.03, speed: 380, bend: rnd(-0.3, 0.3), head: (x, y) => { pen(L[1]); pp(x, y); }, L, glowA: 0.3,
      trail: (x, y) => { const p = spawn(P_MOTE, x, y, u, L); p.life = 0.3; } });
  }
  impactAt(e, 0.2);
  tail(e, 1.3);
};

// --- weapon hits, crits, death -------------------------------------------------------

STYLES.slash = (e, t0 = 0) => {
  const u = e.u, L = e.kind ? e.L : e.color ? rampOfColor(e.color) : IRON;
  const a = e.dir;
  const side = chance(0.5) ? 1 : -1;
  // The arc sweeps across the line of the blow, centred just past the target.
  const r = Math.max(8, Math.min(16, (e.R / u) * 0.7));
  pSlash(e, e.tx - Math.cos(a) * 2 * u, e.ty - Math.sin(a) * 2 * u, { t0, r, a0: a - side * 1.3 - (side < 0 ? 0 : 0), sweep: side * 2.6, dur: 0.22, L, thick: 3 });
  at(e, t0 + 0.06, () => spray(e, e.tx, e.ty, { n: 7, speed: 80, dir: a + side * 1.2, spread: 0.6, life: 0.25, L: [L[0], L[1], L[2]], trail: 3 }));
  if (e.kind === 'radiant' && hasArt('smite')) { pArt(e, 'smite', e.tx, e.gy, { t0: t0 + 0.08, kind: 'radiant', glowR: 18, glowDy: 16 * u }); at(e, t0 + 0.08, () => VFX.flash(RAMPS.radiant[4], 0.06, 0.25)); }
  else if (e.kind === 'fire') at(e, t0 + 0.06, () => spray(e, e.tx, e.ty, { n: 12, k: P_EMBER, speed: 40, up: 20, grav: -30, life: 0.6, L: FIRE_LIFE, gl: 1 }));
  else if (e.kind === 'psychic') pRipple(e, e.tx, e.ty, { t0: t0 + 0.08, r1: 12 * u, n: 2, dur: 0.4, L });
  else if (e.kind === 'thunder') { pRing(e, e.tx, e.gy, { t0: t0 + 0.08, r0: 2 * u, r1: 16 * u, dur: 0.35, L, thick: 2 }); at(e, t0 + 0.08, () => FX.shake(0.25, 0.2)); }
  else if (e.kind === 'force') pFlare(e, e.tx, e.ty, { t0: t0 + 0.08, size: 5, L });
  impactAt(e, t0 + 0.07);
};

STYLES['hit-slash'] = (e, t0 = 0) => {
  const u = e.u, a = e.dir, side = chance(0.5) ? 1 : -1;
  pSlash(e, e.tx, e.ty, { t0, r: 10, a0: a - side * 1.2, sweep: side * 2.4, dur: 0.2, L: IRON, thick: 3 });
  pStar(e, e.tx, e.ty, { t0: t0 + 0.05, size: 4, L: HIT, dir: a + side * 0.9 });
  at(e, t0 + 0.05, () => {
    spray(e, e.tx, e.ty, { n: 6, k: P_PX, speed: 60, dir: a, spread: 0.7, grav: 260, drag: 1, life: 0.45, L: BLOOD });
    spray(e, e.tx, e.ty, { n: 3, speed: 70, dir: a + side * 1.4, spread: 0.4, life: 0.2, L: IRON, trail: 2 });
  });
  impactAt(e, t0 + 0.05);
};

/** Sparks thrown on along the line of a thrust or an arrow, at (x, y). */
function pierceAt(e, t0, x, y, a, blood = true) {
  const ca = Math.cos(a), sa = Math.sin(a);
  // The thrust itself for two frames: a white line driven through along the blow.
  add(e, {
    t0, dur: 0.07, z: 2,
    draw(k) {
      const cx = ax(x), cy = ax(y), b = k < 0.5 ? 7 : 3, f = k < 0.5 ? 5 : 9;
      pen(IRON[3]); line(cx - Math.round(ca * b), cy - Math.round(sa * b) + 1, cx + Math.round(ca * f), cy + Math.round(sa * f) + 1);
      pen(IRON[0]); line(cx - Math.round(ca * b), cy - Math.round(sa * b), cx + Math.round(ca * f), cy + Math.round(sa * f));
    },
  });
  pStar(e, x, y, { t0: t0 + 0.02, size: 4, L: HIT, dir: a });
  at(e, t0, () => {
    spray(e, x, y, { n: 7, speed: 110, dir: a, spread: 0.35, life: 0.22, L: SPARKS, trail: 4, drag: 3 });
    if (blood) spray(e, x, y, { n: 4, k: P_PX, speed: 50, dir: a, spread: 0.6, grav: 240, life: 0.4, L: BLOOD });
  });
}
const SPARKS = Object.freeze([RAMPS.steel[4], RAMPS.gold[4], RAMPS.gold[3], RAMPS.fire[2]]);

STYLES['hit-pierce'] = (e, t0 = 0) => {
  pierceAt(e, t0, e.tx, e.ty, e.dir);
  impactAt(e, t0);
};

STYLES['hit-bludgeon'] = (e, t0 = 0) => {
  const u = e.u;
  // The impact frame: a fat star, the world held for a beat, then the dust.
  pStar(e, e.tx, e.ty, { t0, size: 6, L: HIT, dir: e.dir, dur: 0.14 });
  pRing(e, e.tx, e.gy, { t0, r0: 2 * u, r1: 11 * u, dur: 0.3, L: DUST, thick: 1, glow: false });
  at(e, t0, () => {
    FX.shake(0.2, 0.15); VFX.freeze(0.03);
    spray(e, e.tx, e.gy - 2 * u, { n: 6, k: P_SMOKE, speed: 24, dir: -Math.PI / 2, spread: 1.4, life: 0.55, L: DUST, sz: 0, grow: 3, dens: 0.6 });
    spray(e, e.tx, e.ty, { n: 4, k: P_PX, speed: 50, dir: -Math.PI / 2, spread: 1.1, grav: 250, life: 0.5, L: DUST });
  });
  impactAt(e, t0);
};

STYLES.crit = (e) => {
  const u = e.u;
  at(e, 0, () => {
    VFX.freeze(0.07);
    const hs = e.o.hitstop || VFX.onHitstop;
    if (hs) try { hs(0.09); } catch (err) { console.error(err); }
    VFX.flash('#ffffff', 0.07, 0.4);
    FX.shake(0.4, 0.3);
  });
  // Speed lines bursting out of the blow, and a star bigger than any normal hit.
  add(e, {
    dur: 0.16, z: 2,
    draw(k) {
      const cx = ax(e.tx), cy = ax(e.ty);
      pen(k < 0.5 ? RAMPS.steel[4] : RAMPS.gold[4]);
      for (let i = 0; i < 10; i++) {
        const a = i / 10 * TAU + 0.15, r0 = 5 + k * 10, r1 = 12 + k * 12;
        line(cx + Math.round(Math.cos(a) * r0), cy + Math.round(Math.sin(a) * r0), cx + Math.round(Math.cos(a) * r1), cy + Math.round(Math.sin(a) * r1));
      }
    },
  });
  pStar(e, e.tx, e.ty, { size: 9, L: HIT, dur: 0.2 });
  const hit = e.o.hit || (e.dtype === 'piercing' ? 'hit-pierce' : e.dtype === 'bludgeoning' ? 'hit-bludgeon' : 'hit-slash');
  (STYLES[hit] || STYLES['hit-slash'])(e, 0);
  at(e, 0.02, () => spray(e, e.tx, e.ty, { n: 14, speed: 130, life: 0.3, L: [RAMPS.steel[4], RAMPS.gold[4], RAMPS.gold[3], RAMPS.fire[2]], trail: 4, gl: 1 }));
};

STYLES.death = (e) => {
  const u = e.u;
  const o = e.o;
  if (o.image) pDissolve(e, { dur: 1.1, ash: o.ash, image: o.image, imageScale: o.imageScale, anchorX: o.anchorX, anchorY: o.anchorY });
  else {
    pEmit(e, { dur: 0.7, rate: 40, fn: (lt) => {
      const p = spawn(chance(0.5) ? P_PX : P_MOTE, e.tx + rnd(-5, 5) * u, e.gy - rnd(0, 20) * (1 - lt) * u, u, DARK);
      p.vy = -rnd(10, 24) * u; p.vx = rnd(-4, 4) * u; p.life = rnd(0.5, 0.9); p.wob = 8 * u; p.fade = 0.4;
    } });
  }
  // What was in them goes up: one pale wisp.
  at(e, 0.3, () => { const p = spawn(P_GLINT, e.tx, e.ty - 6 * u, u, [RAMPS.bone[4], RAMPS.necrotic[4], RAMPS.necrotic[3]]); p.vy = -26 * u; p.life = 0.9; p.wob = 12 * u; p.gl = 1; });
  impactAt(e, 1);
  tail(e, 1.8);
};

// --- the authored data styles, by damage type and what the spell does ----------------

/** What a spell mostly does, read from its effects and tags. */
function spellKind(spell) {
  if (!spell) return null;
  if (spell.heal) return 'heal';
  const eff = spell.effects || [];
  const kinds = eff.map((x) => x && x.kind);
  if (kinds.includes('summon')) return 'summon';
  if (kinds.includes('teleport')) return 'teleport';
  if (kinds.includes('shield')) return 'ward';
  if (kinds.includes('cure')) return 'heal';
  if (kinds.includes('debuff')) return 'debuff';
  if (kinds.includes('condition')) return 'condition';
  if (kinds.includes('buff') || kinds.includes('temphp')) {
    const m = eff.map((x) => x && x.mech).filter(Boolean);
    if (m.some((x) => x.acBonus || x.acFormula || x.resist || x.immune || x.condImmune)) return 'ward';
    return 'buff';
  }
  if (kinds.includes('terrain')) return 'terrain';
  if (kinds.includes('utility')) return 'utility';
  return null;
}

/** Nova / burst / aura / wave / rain for a spell with no damage: what it does sets the look. */
function byKind(e, fallback) {
  const k = spellKind(e.spell) || e.o.kind;
  switch (k) {
    case 'heal': return STYLES.heal(e);
    case 'summon': return STYLES.summon(e);
    case 'teleport': return STYLES.teleport(e);
    case 'ward': return STYLES.ward(e);
    case 'buff': return STYLES.buff(e);
    case 'debuff': return STYLES.debuff(e);
    case 'condition': return STYLES.charm(e);
    case 'terrain': return STYLES.sigil(e);
    case 'utility': return STYLES.sigil(e);
    default: return fallback(e);
  }
}

/** The area styles by damage type. */
function byType(e, generic) {
  switch (e.kind) {
    case 'fire': return STYLES.fireball(e);
    case 'thunder': return STYLES.thunder(e);
    case 'radiant': return STYLES.radiant(e);
    case 'necrotic': return STYLES.tendrils(e);
    case 'psychic': return STYLES.psychic(e);
    case 'force': return STYLES.shards(e);
    case 'cold': return STYLES.ice(e);
    case 'lightning': return STYLES.strike(e);
    case 'acid': return STYLES.acid(e);
    case 'poison': return STYLES.cloud(e);
  }
  if (e.dtype === 'bludgeoning') return STYLES.quake(e);
  if (e.dtype === 'piercing') return STYLES.vines(e);
  if (e.dtype === 'slashing') return STYLES.blades(e);
  return byKind(e, generic);
}

STYLES.nova = (e) => byType(e, STYLES.sigil);

STYLES.burst = (e) => {
  if (e.kind === 'fire' && e.R < 18 * e.u) {
    // A small fire burst (hellish rebuke): the burst art, a ring, embers — not a fireball.
    impactFor(e, e.tx, e.ty, 0, true);
    pRing(e, e.tx, e.gy, { r0: 2 * e.u, r1: Math.max(10 * e.u, e.R), dur: 0.35, thick: 1 });
    impactAt(e, 0.02);
    return;
  }
  if (e.kind || e.dtype) return byType(e, STYLES.spark);
  return byKind(e, STYLES.spark);
};

/** The plain impact: the burst art in the spell's colour, a ring, sparks. */
STYLES.spark = (e) => {
  impactFor(e, e.tx, e.ty, 0, false);
  pRing(e, e.tx, e.gy, { r0: 2 * e.u, r1: Math.max(9 * e.u, e.R * 0.8), dur: 0.35, thick: 1 });
  impactAt(e, 0.02);
};

STYLES.aura = (e) => {
  if (e.kind === 'fire') return STYLES['fire-aura'](e);
  if (e.kind === 'radiant') return STYLES['spirit-guardians'](e);
  if (e.kind === 'psychic') return STYLES.charm(e);
  return byKind(e, STYLES.buff);
};

STYLES['fire-aura'] = (e) => {
  const u = e.u;
  for (const v of e.victims || [{ x: e.tx, y: e.ty }]) {
    const gy = v.y + (e.gy - e.ty);
    pRing(e, v.x, gy, { r0: 3 * u, r1: 10 * u, dur: 0.5, L: FIRE_LIFE, thick: 1 });
    pEmit(e, { dur: 0.7, rate: 50, fn: () => {
      const a = rnd(0, TAU); const p = spawn(P_EMBER, v.x + Math.cos(a) * 8 * u, gy + Math.sin(a) * 3 * u, u, FIRE_LIFE);
      p.vy = -rnd(20, 36) * u; p.vx = -Math.cos(a) * 4 * u; p.life = rnd(0.4, 0.7); p.gl = 1;
    } });
    pGlow(e, v.x, v.y, { r: 18 * u, dur: 0.9, color: RAMPS.fire[2], a: 0.6, env: (q) => (q < 0.2 ? q / 0.2 : 1 - q) });
  }
  impactAt(e, 0.15);
  tail(e, 1.3);
};

STYLES['spirit-guardians'] = (e) => {
  // Motes of radiance wheel round the caster at the spell's radius.
  const u = e.u, L = LIFE.radiant, R = Math.max(14 * u, e.R);
  pRing(e, e.tx, e.gy, { r0: 4 * u, r1: R, dur: 0.6, L, thick: 1 });
  at(e, 0.05, () => {
    const n = budget(18);
    for (let i = 0; i < n; i++) {
      const p = spawn(i % 3 ? P_MOTE : P_GLINT, e.tx, e.gy, u, L);
      p.helix = true; p.hx = e.tx; p.hy = e.gy - rnd(2, 10) * u; p.ha = i / n * TAU; p.hr = R * rnd(0.7, 1); p.hw = 4; p.hrise = 4 * u; p.life = rnd(0.9, 1.3); p.gl = 1;
    }
  });
  impactAt(e, 0.2);
  tail(e, 1.4);
};

STYLES.wave = (e) => {
  switch (e.kind) {
    case 'thunder': return STYLES.thunder(e);
    case 'psychic': return STYLES.psychic(e);
    case 'poison': return STYLES.cloud(e);
    case 'cold': return STYLES.ice(e);
    case 'fire': return STYLES['fire-wall'](e);
    case 'force': return STYLES.shards(e);
  }
  if (e.dtype === 'bludgeoning') return STYLES.quake(e);
  if (e.dtype === 'piercing') return STYLES.vines(e);
  const k = spellKind(e.spell) || e.o.kind;
  if (k === 'condition' || k === 'debuff') return STYLES.spellwave(e);
  if (k === 'terrain') return STYLES.quake(e, true);
  return byKind(e, STYLES.spellwave);
};

/** Sleep, colour spray, command: a soft wave of colour and motes washing over the area. */
STYLES.spellwave = (e) => {
  const u = e.u, L = e.L, R = Math.max(12 * u, e.R);
  const prism = e.spell && /color-spray|prismatic|hypnotic/.test(e.spell.id);
  const ramps = prism ? PRISM : [L];
  pRipple(e, e.tx, e.gy - 4 * u, { r0: 3 * u, r1: R, n: 3, dur: 0.8, L, ry: 0.5, amp: 0.8, lobes: 7 });
  pEmit(e, { dur: 0.6, rate: 40, fn: () => {
    const a = rnd(0, TAU), rr = R * Math.sqrt(vr.next());
    const p = spawn(chance(0.3) ? P_GLINT : P_MOTE, e.tx + Math.cos(a) * rr, e.gy + Math.sin(a) * rr * 0.5 - rnd(4, 14) * u, u, ramps[(vr.next() * ramps.length) | 0]);
    p.vy = (e.spell && e.spell.id === 'sleep' ? rnd(4, 10) : -rnd(6, 16)) * u; p.vx = rnd(-6, 6) * u; p.life = rnd(0.5, 0.9); p.gl = 1; p.wob = 8 * u;
  } });
  impactAt(e, 0.2);
  tail(e, 1.3);
};

STYLES.quake = (e, soft) => {
  const u = e.u, R = Math.max(14 * u, e.R);
  at(e, 0, () => FX.shake(soft === true ? 0.25 : 0.55, 0.6));
  for (let i = 0; i < 2; i++) pRing(e, e.tx, e.gy, { t0: i * 0.12, r0: 4 * u, r1: R, dur: 0.55, L: DUST, thick: 2, glow: false });
  pEmit(e, { dur: 0.5, rate: 50, fn: () => {
    const a = rnd(0, TAU), rr = R * Math.sqrt(vr.next());
    const p = spawn(chance(0.6) ? P_SMOKE : P_PX, e.tx + Math.cos(a) * rr, e.gy + Math.sin(a) * rr * 0.5, u, DUST);
    if (p.k === P_SMOKE) { p.vy = -rnd(4, 10) * u; p.grow = 3; p.dens = 0.55; p.life = rnd(0.6, 1); }
    else { p.vy = -rnd(30, 60) * u; p.ay = 240 * u; p.life = 0.6; p.vx = rnd(-10, 10) * u; }
  } });
  impactAt(e, 0.1);
  tail(e, 1.3);
};

STYLES['fire-wall'] = (e) => {
  const u = e.u, R = Math.max(14 * u, e.R);
  pRing(e, e.tx, e.gy, { r0: 4 * u, r1: R, dur: 0.5, L: FIRE_LIFE, thick: 2 });
  pEmit(e, { dur: 0.8, rate: 90, fn: () => {
    const a = rnd(0, TAU), rr = R * rnd(0.6, 1);
    const p = spawn(chance(0.8) ? P_PX : P_SMOKE, e.tx + Math.cos(a) * rr, e.gy + Math.sin(a) * rr * 0.5, u, FIRE_LIFE);
    p.vy = -rnd(20, 40) * u; p.ay = -20 * u; p.wob = 16 * u; p.life = rnd(0.4, 0.7); p.sz = rnd(1, 2); p.gl = 0.6;
    if (p.k === P_SMOKE) { p.grow = 3; p.dens = 0.5; p.L = SMOKE; p.life = 1; }
  } });
  pGlow(e, e.tx, e.gy - 6 * u, { r: R * 1.2, dur: 1, color: RAMPS.fire[2], env: (q) => (q < 0.2 ? q / 0.2 : 1 - q) });
  pDecal(e, e.tx, e.gy, { t0: 0.3, rx: R, dur: 2.4, cov: 0.5 });
  impactAt(e, 0.15);
  tail(e, 2.4);
};

STYLES.blades = (e) => {
  // Cloud of daggers, blade barrier, wrath of nature: small steel arcs all over the area.
  const u = e.u, R = Math.max(10 * u, e.R);
  for (let i = 0; i < 7; i++) {
    const a = rnd(0, TAU), rr = R * Math.sqrt(vr.next());
    pSlash(e, e.tx + Math.cos(a) * rr, e.gy + Math.sin(a) * rr * 0.5 - 6 * u, { t0: i * 0.06, r: rnd(5, 8), a0: rnd(0, TAU), sweep: 2.2 * (chance(0.5) ? 1 : -1), dur: 0.18, L: IRON, thick: 2 });
  }
  impactAt(e, 0.1);
};

STYLES.rain = (e) => {
  // Things fall out of the sky across the area, each landing on its own.
  const u = e.u, R = Math.max(12 * u, e.R);
  const n = budget(e.o.count || Math.min(14, 6 + Math.round(R / u / 6)));
  const k = e.kind, id = e.spell && e.spell.id;
  const hail = k === 'cold' || e.dtype === 'bludgeoning' || id === 'sleet-storm';
  const arrows = k === 'force' && id === 'conjure-volley';
  const water = !k && !e.dtype;
  const storm = k === 'thunder' || k === 'lightning';
  const L = hail ? LIFE.cold : water ? WATER : e.L;
  let last = 0;
  for (let i = 0; i < n; i++) {
    const a = rnd(0, TAU), rr = R * Math.sqrt(vr.next());
    const x = e.tx + Math.cos(a) * rr, y = e.gy + Math.sin(a) * rr * 0.5;
    const t0 = (i / n) * 0.6 + rnd(0, 0.05);
    if (storm) {
      pBolt(e, x + rnd(-12, 12) * u, y - 130 * u, x, y, { t0, dur: 0.3, branches: 1, L: LIFE.lightning });
      at(e, t0 + 0.04, () => { if (i % 3 === 0) VFX.flash(RAMPS.lightning[4], 0.06, 0.3); spray(e, x, y, { n: 6, speed: 80, dir: -Math.PI / 2, spread: 1.2, grav: 200, life: 0.3, L: LIFE.lightning, trail: 3 }); });
      last = Math.max(last, t0 + 0.04);
      continue;
    }
    const x0 = x - 30 * u, y0 = y - 110 * u;
    const head = arrows ? arrowHead : hail ? hailHead : water ? (px, py) => { pen(L[1]); pp(px, py); pp(px, py - 1); } : flameHead(FIRE_LIFE);
    const m = pMissile(e, { t0, x0, y0, x1: x, y1: y, speed: arrows ? 480 : 360, head, L, glowA: fireKind(e) ? 0.8 : 0,
      trail: fireKind(e) ? (px, py) => { const p = spawn(chance(0.6) ? P_EMBER : P_SMOKE, px, py, u, chance(0.6) ? FIRE_LIFE : SMOKE); p.life = rnd(0.25, 0.5); p.vy = -4 * u; if (p.k === P_SMOKE) { p.grow = 2; p.dens = 0.5; } } : null, every: 1.5 });
    if (fireKind(e)) {
      pArt(e, 'burst', x, y - 4 * u, { t0: m.arrive, kind: 'fire', glowR: 14 });
      pDecal(e, x, y, { t0: m.arrive, rx: 6 * u, dur: 2.2 });
      at(e, m.arrive, () => { FX.shake(0.15, 0.12); spray(e, x, y - 3 * u, { n: 8, k: P_EMBER, speed: 50, up: 20, grav: 20, life: 0.6, L: FIRE_LIFE, gl: 1 }); });
    } else if (hail) {
      // Each stone bursts where it lands and leaves a white splash of frost.
      pDecal(e, x, y, { t0: m.arrive, rx: 5 * u, dur: 1.4, cols: [RAMPS.cold[4], RAMPS.cold[3], RAMPS.cold[2]], cov: 0.5 });
      at(e, m.arrive, () => { FX.shake(0.08, 0.08); spray(e, x, y - 1 * u, { n: 7, k: P_SHARD, speed: 60, dir: -Math.PI / 2, spread: 1.3, grav: 240, life: 0.45, L, sz: 2 }); });
    } else if (arrows) {
      pierceAt(e, m.arrive, x, y, Math.atan2(y - y0, x - x0), false);
    } else {
      at(e, m.arrive, () => spray(e, x, y, { n: 5, k: P_DROP, speed: 30, dir: -Math.PI / 2, spread: 1, grav: 200, life: 0.5, L, gy: y }));
    }
    last = Math.max(last, m.arrive);
  }
  if (fireKind(e)) pGlow(e, e.tx, e.gy, { r: R * 1.2, dur: last + 0.6, env: (q) => Math.sin(q * Math.PI), a: 0.7, color: RAMPS.fire[2] });
  impactAt(e, Math.min(last, 0.45));
  tail(e, last + (fireKind(e) ? 2.2 : 0.6));
};

// --- named spells whose look is their own ---------------------------------------------

// Short, recognizable motifs built from the same integer-pixel primitives.
// Their small fixed geometry avoids new canvases and unbounded particle work.
STYLES['dream-motes']=(e)=>{
  const L=LIFE.psychic,u=e.u;
  for(const v of (e.victims||[{x:e.tx,y:e.ty}]).slice(0,12)){
    pRing(e,v.x,v.y+(v.ground ?? e.gy-e.ty),{r0:3*u,r1:12*u,dur:.6,ry:.35,L,thick:1});
    add(e,{dur:1.05,z:1,draw(k){
      COV=k>.65?(1-k)/.35:1;
      for(let i=0;i<3;i++){
        const a=i*TAU/3+(FX.reducedMotion?0:k*1.4),x=ax(v.x)+Math.round(Math.cos(a)*8),y=ax(v.y)-5-Math.round(k*12)+i*3;
        pen(L[i?2:0]);
        for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++)if(dx*dx+dy*dy<=10&&(dx-2)**2+(dy+1)**2>7)pp(x+dx,y+dy);
      }
    }});
  }impactAt(e,.22);
};
STYLES['binding-seal']=(e)=>{
  const L=LIFE.arcane,u=e.u;
  for(const v of (e.victims||[{x:e.tx,y:e.ty}]).slice(0,12)){
    pChains(e,v.x,v.y+3*u,{r0:19*u,r1:8*u,dur:.85,L});
    pChains(e,v.x,v.y-7*u,{t0:.08,r0:15*u,r1:7*u,dur:.85,L});
    add(e,{t0:.18,dur:.65,z:2,draw(k){
      COV=k>.6?(1-k)/.4:1;pen(L[0]);const x=ax(v.x),y=ax(v.y)-18;
      ring(x,y,3,3);line(x-4,y+3,x+4,y+3);line(x-4,y+3,x-4,y+8);line(x+4,y+3,x+4,y+8);line(x-4,y+8,x+4,y+8);pp(x,y+5);
    }});
  }impactAt(e,.28);
};
STYLES['thorn-whip']=(e)=>{
  const L=VINE;
  add(e,{dur:.65,z:1,draw(k){
    const reach=k<.42?ease.out(k/.42):1-Math.max(0,(k-.62)/.38);
    const x0=ax(e.fx),y0=ax(e.fy),dx=ax(e.tx)-x0,dy=ax(e.ty)-y0;
    const n=Math.max(8,Math.min(80,Math.ceil(Math.hypot(dx,dy)/2)));let px=x0,py=y0;
    COV=k>.82?(1-k)/.18:1;
    for(let i=1;i<=n*reach;i++){
      const f=i/n,bend=Math.sin(f*Math.PI)*Math.sin(k*Math.PI)*5;
      const x=Math.round(x0+dx*f),y=Math.round(y0+dy*f+bend);
      pen(L[2]);line(px,py+1,x,y+1);pen(L[0]);line(px,py,x,y);
      if(i%4===0){pen(L[1]);line(x,y,x-2,y-3);}
      px=x;py=y;
    }
  }});
  pFlare(e,e.tx,e.ty,{t0:.27,dur:.22,size:4,L});impactAt(e,.27);
};
STYLES['dissolve-runes']=(e)=>{
  const L=LIFE.arcane,u=e.u;
  add(e,{dur:.8,z:1,draw(k){
    const x=ax(e.tx),y=ax(e.ty),r=9+k*13;
    COV=k>.35?(1-k)/.65:1;
    for(let i=0;i<6;i++){
      const a=i*TAU/6,px=Math.round(x+Math.cos(a)*r),py=Math.round(y+Math.sin(a)*r*.7);
      const glyph=RUNES[i];pen(L[i%2]);
      for(let j=0;j<15;j++)if(glyph[j]==='1')pp(px+j%3,py+Math.floor(j/3));
    }
    pen(L[2]);ring(x,y,Math.max(0,10-k*16),Math.max(0,13-k*20));
  }});
  pRing(e,e.tx,e.gy,{r0:5*u,r1:24*u,dur:.5,L,thick:1});impactAt(e,.2);
};
STYLES['acid-lob']=(e)=>{
  const L=LIFE.acid;
  const m=pMissile(e,{speed:280,arc:10,head:orbHead(L,0),L,glowR:6,
    trail:(x,y)=>{const p=spawn(P_DROP,x,y,e.u,L);p.life=.25;p.vy=20*e.u;p.ay=80*e.u;}});
  pRing(e,e.tx,e.gy,{t0:m.arrive,r0:2*e.u,r1:13*e.u,ry:.3,dur:.6,L,thick:2});
  at(e,m.arrive,()=>spray(e,e.tx,e.ty,{n:10,k:P_DROP,speed:48,grav:120,life:.45,L,gy:e.gy}));
  impactAt(e,m.arrive);tail(e,m.arrive+.65);
};

/** Spell id -> [style, extra options]. Everything not here is read off its data. */
const SIGNATURES = {
  'fire-bolt': ['fire-bolt'], 'produce-flame': ['fire-bolt'], 'scorching-ray': ['fire-bolt', { count: 3 }],
  'magic-missile': ['magic-missile'], 'eldritch-blast': ['eldritch-blast'], 'mind-sliver': ['mind-sliver'],
  'misty-step': ['misty-step'], 'dimension-door': ['teleport'], 'scatter': ['misty-step'],
  'fireball': ['fireball'], 'delayed-blast-fireball': ['fireball'], 'meteor-swarm': ['rain'], 'flame-strike': ['radiant'],
  'lightning-bolt': ['lightning-bolt'], 'call-lightning': ['strike'], 'witch-bolt': ['chain'],
  'guiding-bolt': ['bolt', { dtype: 'radiant' }], 'sacred-flame': ['radiant'], 'moonbeam': ['moonbeam'], 'sunbeam': ['moonbeam'],
  'ray-of-frost': ['ray-of-frost'], 'toll-the-dead': ['tendrils'], 'chill-touch': ['tendrils'],
  'thunderwave': ['thunder'], 'thunderclap': ['thunder'], 'shatter': ['thunder'],
  'burning-hands': ['cone'], 'dragons-breath': ['cone'], 'cone-of-cold': ['cone'],
  'web': ['web'], 'entangle': ['vines'], 'plant-growth': ['vines'], 'spike-growth': ['vines'], 'wall-of-thorns': ['vines'],
  'fog-cloud': ['fog'], 'darkness': ['darkness'], 'hunger-of-hadar': ['darkness'], 'stinking-cloud': ['cloud'], 'cloudkill': ['cloud'],
  'grease': ['acid', { color: '#4a4438' }], 'acid-splash': ['acid-lob'],
  'spirit-guardians': ['spirit-guardians'], 'shield': ['ward'], 'mage-armor': ['ward'], 'shield-of-faith': ['ward'],
  'hex': ['debuff'], 'bane': ['debuff'], 'bestow-curse': ['debuff'], 'hold-person': ['binding-seal'], 'hold-monster': ['binding-seal'],
  'compelled-duel': ['debuff-chain'], 'faerie-fire': ['spellwave'], 'color-spray': ['spellwave'], 'sleep': ['dream-motes'],
  'thorn-whip':['thorn-whip'],
  'dispel-magic':['dissolve-runes'], 'counterspell':['dissolve-runes'],
  'healing-word': ['heal'], 'cure-wounds': ['heal'], 'mass-healing-word': ['heal'], 'mass-cure-wounds': ['heal'], 'heal': ['heal'],
  'prayer-of-healing': ['heal'], 'revivify': ['radiant'], 'spiritual-weapon': ['slash', { dtype: 'force' }],
  'divine-smite': ['slash'], 'searing-smite': ['slash'], 'thunderous-smite': ['slash'], 'wrathful-smite': ['slash'],
  'banishment': ['teleport'], 'find-familiar': ['summon'], 'find-steed': ['summon'], 'animate-dead': ['summon'],
  'fire-shield': ['fire-aura'], 'heat-metal': ['fire-aura'], 'dancing-lights': ['buff'], 'light': ['buff'],
  'vicious-mockery': ['psychic'], 'dissonant-whispers': ['psychic'], 'synaptic-static': ['psychic'], 'psychic-scream': ['psychic'],
  'ice-knife': ['bolt', { dtype: 'cold' }], 'ice-storm': ['rain'], 'conjure-volley': ['rain'], 'storm-of-vengeance': ['rain'],
  'fire-storm': ['rain'], 'shocking-grasp': ['chain'], 'chain-lightning': ['chain'],
};

// ---------------------------------------------------------------------------
// Frame hooks (FX drives these)
// ---------------------------------------------------------------------------

function tickEffect(e, dt) {
  curTag = e.tag;
  e.t += dt;
  for (let i = 0; i < e.calls.length; i++) {
    const c = e.calls[i];
    if (!c.fired && e.t >= c.t) { c.fired = true; try { c.fn(); } catch (err) { console.error(err); } }
  }
  for (let i = 0; i < e.parts.length; i++) {
    const p = e.parts[i];
    if (!p.tick) continue;
    const lt = e.t - p.t0;
    if (lt >= 0 && lt <= p.dur + dt) p.tick(dt, Math.min(lt, p.dur));
  }
  if (e.t >= e.end) finish(e);
  curTag = null;
}

function finish(e, cancelled) {
  if (e.done) return;
  e.done = true;
  if (!e.hit && !cancelled) fireImpact(e);
  if (!e.hit && cancelled) { e.hit = true; if (e.resolveImpact) e.resolveImpact(); }
  if (e.resolveDone) e.resolveDone();
}

function update(dt) {
  clock += dt;
  if (frozen > 0) { frozen = Math.max(0, frozen - dt); return; }
  for (const e of effects) e.la = 0;
  updateParticles(dt);
  for (let i = 0; i < effects.length; i++) tickEffect(effects[i], dt);
  let w = 0;
  for (let i = 0; i < effects.length; i++) if (!effects[i].done) effects[w++] = effects[i];
  effects.length = w;
}

/** The glow target for a pass drawn into `ctx`: the Stage's additive layer when there is one. */
function glowFor(ctx) {
  if (VFX.glowMode === 'none') return null;
  if (VFX.glowMode === 'inline') return ctx;
  const res1 = ctx && ctx.canvas && ctx.canvas.width <= VIEW_W && Stage && typeof Stage.ctx === 'function';
  if (!res1 || typeof document === 'undefined') return ctx;
  try { return Stage.ctx('glow'); } catch (err) { return ctx; }
}

let particlesLive = false;
function anyParticles() {
  for (let i = 0; i < MAX_P; i++) if (POOL[i].on) return true;
  return false;
}

function drawEffects(band, layer) {
  for (let i = 0; i < effects.length; i++) {
    const e = effects[i];
    if (e.layer !== layer || (DTAG !== undefined && e.tag !== DTAG)) continue;
    U = e.u;
    for (let j = 0; j < e.parts.length; j++) {
      const p = e.parts[j];
      if (p.z !== band) continue;
      const lt = e.t - p.t0;
      if (lt < 0 || lt > p.dur) continue;
      COV = 1; ARC_ON = false;
      p.draw(p.dur > 0 ? lt / p.dur : 1, lt);
    }
  }
  COV = 1; ARC_ON = false;
}

let CUR = null;          // the effect whose light pools are being drawn
function drawGlows(layer) {
  for (let i = 0; i < effects.length; i++) {
    const e = effects[i];
    if (e.layer !== layer && !(layer === 'fx' && e.layer === 'glow')) continue;
    if (DTAG !== undefined && e.tag !== DTAG) continue;
    U = e.u;
    CUR = e; e.la = 0;
    for (let j = 0; j < e.parts.length; j++) {
      const p = e.parts[j];
      if (!p.glow) continue;
      const lt = e.t - p.t0;
      if (lt < 0 || lt > p.dur) continue;
      p.glow(p.dur > 0 ? lt / p.dur : 1, lt);
    }
  }
  CUR = null;
}

// VFX.lights(): one light per glowing effect, in the shape render/lighting.js
// takes as `extra` (so a fireball at night lights the street in the grade, not
// only on the additive layer). Radii come in steps of 8 px and colours in
// sixteenths, so the lighting module's stamp cache stays small.
const lightOut = [], lightPool = [], lightDefs = new Map();
function lightDef(r, color) {
  const key = r + color;
  let d = lightDefs.get(key);
  if (!d) {
    // The hue at full strength, a quarter of the way to white (as the lamps are).
    const n = parseInt(lightOf(color).slice(1), 16);
    const ch = [n >> 16, (n >> 8) & 255, n & 255], top = Math.max(1, ...ch);
    const c = ch.map((v) => Math.round((0.75 * v / top + 0.25) * 16) / 16);
    d = Object.freeze({ r, c: Object.freeze(c), i: 1, ry: 0.8, flick: 0, halo: 0, core: 0 });
    if (lightDefs.size > 64) lightDefs.clear();
    lightDefs.set(key, d);
  }
  return d;
}
function lights() {
  lightOut.length = 0;
  if (!FX.enabled || VFX.glowMode === 'none' || VFX.glowStrength <= 0.02) return lightOut;
  for (let i = 0; i < effects.length; i++) {
    const e = effects[i];
    if (!(e.la > 0.05) || e.done) continue;
    const r = Math.max(24, Math.min(96, Math.round(e.lr * 2.2 / 8) * 8));
    const l = lightPool[lightOut.length] || (lightPool[lightOut.length] = { x: 0, y: 0, def: null, str: 0 });
    l.x = e.lx; l.y = e.ly; l.def = lightDef(r, e.lc); l.str = Math.min(1, e.la);
    lightOut.push(l);
  }
  return lightOut;
}

// Set by drawGround: this frame's ground band already went down under the actors.
let groundDrawn = false;

function begin(ctx, camX, camY) {
  G = ctx; OX = Math.round(-camX || 0); OY = Math.round(-camY || 0);
  G.save();
  G.imageSmoothingEnabled = false;
  G.globalAlpha = 1; G.globalCompositeOperation = 'source-over';
  penC = ''; penN = 0; G.beginPath();
}

function drawGround(ctx, camX, camY, opts) {
  DTAG = opts && 'tag' in opts ? opts.tag : undefined;
  groundDrawn = true;
  if (!effects.length) return;
  begin(ctx, camX, camY);
  drawEffects(0, 'fx');
  flush();
  G.restore();
}

function draw(ctx, camX, camY, opts) {
  DTAG = opts && 'tag' in opts ? opts.tag : undefined;
  const ground = !groundDrawn;
  groundDrawn = false;
  particlesLive = anyParticles();
  if (!effects.length && !particlesLive) return;
  begin(ctx, camX, camY);
  if (ground) drawEffects(0, 'fx');
  drawEffects(1, 'fx');
  pen('#000'); drawParticles();
  drawEffects(2, 'fx');
  flush();
  G.restore();

  // Light, last: its own additive layer on the Stage, or blended in here.
  const gg = glowFor(ctx);
  if (!gg) return;
  GG = gg;
  GG.save();
  if (gg !== ctx) { const m = ctx.getTransform(); GG.setTransform(m); }
  GG.globalCompositeOperation = 'lighter';
  GG.imageSmoothingEnabled = false;
  drawGlows('fx');
  glowParticles();
  GG.restore();
  GG = null;
}

// Full-screen flashes: a flat tint that steps down in three hard levels, like
// a palette flash on old hardware. (A dithered flash read as a screen door
// over the whole field; a flat tint has no edges to break the pixel grid.)
let flashes = [];
function drawScreen(ctx, opts) {
  const tag = opts && 'tag' in opts ? opts.tag : undefined;
  if (!flashes.length) return;
  for (const f of flashes) {
    if (tag !== undefined && f.tag !== tag) continue;
    const k = f.age / f.dur;
    const a = Math.min(0.6, f.strength * 0.9) * (k < 0.34 ? 1 : k < 0.67 ? 0.55 : 0.25);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = f.color;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// The public object
// ---------------------------------------------------------------------------

export const VFX = {
  /** 'auto' (Stage glow layer when drawing into a world layer), 'inline' (blend into the ctx), 'none'. */
  glowMode: 'auto',
  /** Scales every light pool (1 = as authored). A scene lit by day may lower it. */
  glowStrength: 1,
  /** Battle hook: called with seconds when a blow should hold the frame (crits). */
  onHitstop: null,

  /** Every style id VFX knows (data styles, the extras, and named spells). */
  get styles() { return Object.keys(STYLES); },
  get signatures() { return Object.keys(SIGNATURES); },

  /**
   * Play a style. opts: { from, to (points in the caller's space), color, dtype,
   * radius (caller px), zoom (screen px per art px), layer ('fx' | 'glow'),
   * onImpact(x, y), spell, victims [points], dir, count, blocking, hold,
   * ground (px from `to` down to the feet, default 8*zoom), image (death) }.
   * Returns { style, done, impact, cancel(), playing }.
   */
  play(styleId, opts = {}) {
    let id = styleId, o = opts;
    const sig = SIGNATURES[id];
    if (sig && !STYLES[id]) { id = sig[0]; if (sig[1]) o = { ...sig[1], ...opts }; }
    else if (sig && sig[1]) o = { ...sig[1], ...opts };
    const recipe = STYLES[id] || STYLES.spark;
    const e = makeEffect(id, o);
    const handle = {
      style: id,
      cancel: () => finish(e, true),
      get playing() { return !e.done; },
    };
    handle.impact = new Promise((r) => { e.resolveImpact = r; });
    handle.done = new Promise((r) => { e.resolveDone = r; });
    if (!FX.enabled || typeof document === 'undefined' && !VFX.headless) {
      fireImpact(e); finish(e);
      return handle;
    }
    curTag = e.tag;
    try { recipe(e); } catch (err) { console.error(err); fireImpact(e); finish(e); curTag = null; return handle; }
    curTag = null;
    e.end = Math.max(e.end, e.impactT);
    effects.push(e);
    return handle;
  },

  /** play() with the style a spell's data asks for (VFX.styleFor), passing the spell along. */
  cast(spell, opts = {}) {
    return VFX.play(VFX.styleFor(spell, opts.dtype), { ...opts, spell });
  },

  /**
   * The style id for a spell: its signature if it has one, else its authored
   * `vfx.style`, which play() then flavours by damage type and effect kind.
   */
  styleFor(spell, dtype) {
    if (!spell) return 'spark';
    if (SIGNATURES[spell.id]) return spell.id;
    const st = (spell.vfx && spell.vfx.style) || 'burst';
    if (!dtype && !(spell.damage && spell.damage.type)) {
      const k = spellKind(spell);
      if (st === 'aura' || st === 'nova') {
        if (k === 'heal') return 'heal';
        if (k === 'summon') return 'summon';
        if (k === 'teleport') return 'teleport';
        if (k === 'ward') return 'ward';
      }
    }
    return STYLES[st] ? st : 'burst';
  },

  /** The style a signature id plays ('hex' -> 'debuff'); a plain style id is itself. */
  baseOf(id) { return SIGNATURES[id] && !STYLES[id] ? SIGNATURES[id][0] : id; },

  /**
   * This frame's spell light for render/lighting.js: [{ x, y, def, str }] in the
   * space effects were played in (world px on the overworld). After drawing
   * VFX, call Lighting.addLights(VFX.lights(), cam) before drawing the grade.
   * The array is reused: read it, do not keep it.
   */
  lights() { return lights(); },

  /** Hold every effect on its current frame for `sec` (hit-stop). */
  freeze(sec) { frozen = Math.max(frozen, sec || 0); },

  /** A full-screen flash that breaks up by dither on 'screen-fx'. */
  flash(color = '#ffffff', dur = 0.12, strength = 0.5) {
    if (!FX.enabled) return;
    if (FX.reducedMotion) strength *= 0.4;
    flashes.push({ color, dur: Math.max(0.03, dur), age: 0, strength, tag: curTag });
  },

  /** Re-fork the cosmetic stream (after a reseed, so a replay looks identical). */
  reseed(seed) { vr = seed == null ? rng.fork('vfx-visuals') : makeRNG(seed); },

  /** Active effect count and live particles (debug overlay, tests). */
  counts() {
    let p = 0;
    for (let i = 0; i < MAX_P; i++) if (POOL[i].on) p++;
    return { vfx: effects.length, vfxParticles: p };
  },

  clear() {
    for (const e of effects.slice()) finish(e, true);
    effects.length = 0;
    for (let i = 0; i < MAX_P; i++) POOL[i].on = false;
    flashes.length = 0;
    frozen = 0;
  },

  // Frame hooks: FX calls these (see FX.addSystem); the lab calls them directly.
  update(dt) {
    update(dt);
    for (const f of flashes) f.age += dt;
    if (flashes.length) flashes = flashes.filter((f) => f.age < f.dur);
  },
  /** opts.tag: draw only the effects played with that `tag` (the lab's gallery cells). */
  draw(ctx, camX = 0, camY = 0, opts) { draw(ctx, camX, camY, opts); },
  /**
   * The ground band (scorches, shock rings on the ground, summoning circles,
   * webs) drawn UNDER the actors: a scene calls this in a pass before its
   * sprites, and the next draw() leaves that band out. A scene that never
   * calls it still gets the band from draw(), over everything.
   */
  drawGround(ctx, camX = 0, camY = 0, opts) { drawGround(ctx, camX, camY, opts); },
  drawScreen(ctx, opts) { drawScreen(ctx, opts); },
  busy() {
    for (let i = 0; i < effects.length; i++) {
      const e = effects[i];
      if (e.blocking && !e.done && (!e.hit || e.t < e.impactT + e.hold)) return true;
    }
    return false;
  },
  active(part) { return part === 'screen' ? flashes.length > 0 : true; },

  /** For tools: the shared ramps (hottest first). */
  LIFE, FIRE_LIFE, SMOKE,
};

FX.addSystem({
  update: (dt) => VFX.update(dt),
  draw: (ctx, cx, cy) => VFX.draw(ctx, cx, cy),
  drawScreen: (ctx) => VFX.drawScreen(ctx),
  busy: () => VFX.busy(),
  clear: () => VFX.clear(),
  active: (part) => VFX.active(part),
  counts: () => VFX.counts(),
});

export default VFX;
