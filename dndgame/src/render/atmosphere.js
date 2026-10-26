// render/atmosphere.js — the air between the eye and the ground: rain that lands and puddles, snow, fog banks, cloud shadows, leaves on the wind, window beams with dust, fireflies and god rays.
//
// Every effect is pixel art first: whole-pixel positions, flat colours, stepped
// alpha, dithered edges; nothing is ever drawn with a smooth gradient or a
// rotated rectangle. Each is also driven by the SAME environment the light
// uses (render/lighting.js `env`): the hour, the place, the weather and its
// blend, so a squall's rain, its grey sky and its wet streets arrive together.
//
// Where each thing draws (the stage's layers, bottom to top):
//   ground-shade  puddles and their rings (under the actors: people walk
//                 through puddles, not under them)
//   weather       rain, splashes, snow, ash, fog banks, leaves
//   grade         cloud shadows (a darkening of the AMBIENT, painted into the
//                 light map before the lamps, so a cloud never dims a lantern)
//   glow          god rays, window beams and their dust, fireflies, the
//                 reflections of lamps in wet streets (all additive light)
//
// Particles live in fixed pools and are reused; the textures (clouds, fog,
// shafts) are built once on first use from a tileable value noise. Randomness
// comes from a private stream of core/rng.js so the air never disturbs a
// gameplay roll.

import { makeRNG } from '../core/rng.js';
import { TF, tileGroup } from './tiles.js';

const VW = 400;
const VH = 240;
const TILE = 16;
const ar = makeRNG('atmosphere-visuals');

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x, y) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;

function hash01(x, y, salt = 0) {
  let h = (x * 374761393 + y * 668265263 + salt * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  return null;
}

/** Tileable fractal value noise: periods px/py lattice cells at the base octave. */
function fbm(x, y, px, py, octaves, seed) {
  let v = 0, amp = 0.5, norm = 0;
  for (let o = 0; o < octaves; o++) {
    const f = 1 << o;
    v += amp * vnoise(x * f, y * f, px * f, py * f, seed + o * 31);
    norm += amp;
    amp *= 0.5;
  }
  return v / norm;
}
function vnoise(x, y, px, py, seed) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const w = (v, p) => ((v % p) + p) % p;
  const a = hash01(w(x0, px), w(y0, py), seed), b = hash01(w(x0 + 1, px), w(y0, py), seed);
  const c = hash01(w(x0, px), w(y0 + 1, py), seed), d = hash01(w(x0 + 1, px), w(y0 + 1, py), seed);
  return lerp(lerp(a, b, sx), lerp(c, d, sx), sy);
}

const rgbOf = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

// ---------------------------------------------------------------------------
// 1. TEXTURES (built once)
// ---------------------------------------------------------------------------

let texClouds = null, texFog = null, texRay = null, texBeam = null;

/**
 * Cloud shadows: a 256px tileable sheet of multiply colours. White where the
 * sky is clear; a cool shade under each cloud, with a lighter rim and a
 * dithered seam between, so a cloud's edge reads as a soft pixel edge.
 */
function cloudTexture() {
  if (texClouds !== null) return texClouds;
  const S = 256;
  const cv = makeCanvas(S, S);
  if (!cv) { texClouds = null; return null; }
  const g = cv.getContext('2d');
  const img = g.createImageData(S, S);
  const d = img.data;
  const core = [196, 202, 222], rim = [224, 227, 238];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const v = fbm(x / 64, y / 64, 4, 4, 4, 101);
      const th = bayer(x, y) * 0.035;
      const o = (y * S + x) * 4;
      let c = null;
      if (v > 0.60 + th) c = core;
      else if (v > 0.555 + th) c = rim;
      d[o] = c ? c[0] : 255; d[o + 1] = c ? c[1] : 255; d[o + 2] = c ? c[2] : 255; d[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  texClouds = cv;
  return cv;
}

/** Fog: a 256x128 tileable sheet of three stepped densities, dithered between. */
function fogTexture() {
  if (texFog !== null) return texFog;
  const W = 256, H = 128;
  const cv = makeCanvas(W, H);
  if (!cv) { texFog = null; return null; }
  const g = cv.getContext('2d');
  const img = g.createImageData(W, H);
  const d = img.data;
  const col = rgbOf('#cdd5dc');
  const A = [0, 70, 125, 175];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // Banks are wide and low: stretch the noise horizontally.
      const v = fbm(x / 64, y / 32, 4, 4, 3, 211);
      // Flat bands of density with a narrow dithered seam between them, not a
      // screen door across the whole bank.
      const q = clamp(Math.floor((v - 0.4) * 8 + (bayer(x, y) - 0.5) * 0.6 + 0.5), 0, 3);
      const o = (y * W + x) * 4;
      d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = A[q];
    }
  }
  g.putImageData(img, 0, 0);
  texFog = cv;
  return cv;
}

/**
 * A shaft of light slanting down to the right (the light comes from the upper
 * left, as everywhere in this world): three flat bands across, stepping down in
 * strength as it falls, dithered at every seam. RGB on black, drawn additively.
 */
function shaftTexture(w, h, slope, fade, tint) {
  const W = Math.ceil(w + slope * h) + 1;
  const cv = makeCanvas(W, h);
  if (!cv) return null;
  const g = cv.getContext('2d');
  const img = g.createImageData(W, h);
  const d = img.data;
  const half = w / 2;
  for (let y = 0; y < h; y++) {
    const along = y / h;
    for (let x = 0; x < W; x++) {
      const u = x - slope * y - half;
      const b = bayer(x, y);
      const au = Math.abs(u) + (b - 0.5) * 2.2;
      const across = au < half * 0.36 ? 1 : au < half * 0.7 ? 0.6 : au < half ? 0.3 : 0;
      if (!across) continue;
      // Fade along the shaft in quarter steps, dithered.
      const f = clamp(Math.floor((1 - along * fade) * 4 + b - 0.5) / 4, 0, 1);
      const v = across * f;
      if (v <= 0) continue;
      const o = (y * W + x) * 4;
      d[o] = Math.round(tint[0] * v); d[o + 1] = Math.round(tint[1] * v); d[o + 2] = Math.round(tint[2] * v); d[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return cv;
}

// ---------------------------------------------------------------------------
// 2. STATE
// ---------------------------------------------------------------------------

const MAX_DROPS = 170, MAX_SPLASH = 48, MAX_RIPPLE = 28, MAX_FLAKES = 170;
const MAX_LEAVES = 40, MAX_FLIES = 24;

const drops = Array.from({ length: MAX_DROPS }, () => ({ x: 0, y: 0, z: 0, len: 5, vy: 200, ground: 200, on: false }));
const splashes = Array.from({ length: MAX_SPLASH }, () => ({ x: 0, y: 0, age: 0, on: false }));
const ripples = Array.from({ length: MAX_RIPPLE }, () => ({ x: 0, y: 0, age: 0, life: 0.6, on: false }));
const flakes = Array.from({ length: MAX_FLAKES }, () => ({ x: 0, y: 0, z: 0, vy: 30, phase: 0, ember: false, on: false }));
const leaves = Array.from({ length: MAX_LEAVES }, () => ({ x: 0, y: 0, vx: 0, vy: 0, phase: 0, spin: 4, pal: 0, on: false }));
const flies = Array.from({ length: MAX_FLIES }, () => ({ hx: 0, hy: 0, x: 0, y: 0, phase: 0, speed: 1, on: false }));
let sHead = 0, rHead = 0;

const A = {
  map: null,
  t: 0,
  wind: -24,                 // px/s, negative blows to the left
  gust: 0,
  camX: 0, camY: 0, lastCamX: null, lastCamY: null,
  rainAmt: 0, snowAmt: 0, ashAmt: 0, fogAmt: 0, leafAmt: 0, flyAmt: 0, rayAmt: 0, cloudAmt: 0, beamAmt: 0,
  kind: 'none',
  reduced: false,
  puddles: null, puddleMap: null,
  beams: [],
};

const FORESTS = new Set(['forest', 'pine-forest', 'jungle', 'wood', 'woods']);
const FIREFLY_LANDS = new Set(['forest', 'pine-forest', 'plains', 'marsh', 'road', 'hills', 'coast', 'city', 'ruins', 'farm']);
const MIST_LANDS = new Set(['forest', 'pine-forest', 'marsh', 'plains', 'hills', 'road', 'coast', 'farm']);

/** Is day-of-year `d` (Harptos, 1..365) high summer? */
const summer = (d) => { const k = ((d - 1) % 365 + 365) % 365 + 1; return k >= 140 && k <= 275; };
/** Late in the year the woods drop brown leaves; earlier they are green. */
const autumn = (d) => { const k = ((d - 1) % 365 + 365) % 365 + 1; return k >= 245 && k <= 330; };

// Tile at a world pixel: what a drop lands on.
function landsOn(map, wx, wy) {
  const tx = Math.floor(wx / TILE), ty = Math.floor(wy / TILE);
  if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return 0;
  const i = ty * map.w + tx;
  if (map.over && map.over[i]) return 0;                     // a roof: it drums, we see nothing
  const f = map.flags ? map.flags[i] : 0;
  if (f & TF.WATER) return 2;
  if (f & TF.SOLID) return 0;
  return 1;
}

/** Puddle spots: some road and dirt tiles hold water once it has rained a while. */
function puddlesFor(map) {
  if (A.puddleMap === map && A.puddles) return A.puddles;
  const out = [];
  if (map && !map.indoor && map.ground) {
    for (let y = 0; y < map.h; y++) {
      for (let x = 0; x < map.w; x++) {
        const i = y * map.w + x;
        if (map.over && map.over[i]) continue;
        if (map.flags && (map.flags[i] & (TF.SOLID | TF.WATER))) continue;
        const grp = tileGroup(map.ground[i]);
        if (grp !== 'road' && grp !== 'dirt') continue;
        if (map.deco && map.deco[i]) continue;
        const h = hash01(x, y, 41);
        if (h > (grp === 'dirt' ? 0.2 : 0.13)) continue;
        const w = 5 + Math.floor(hash01(x, y, 42) * 7);
        const hh = 2 + Math.floor(hash01(x, y, 43) * 2);
        out.push({
          x: x * TILE + 1 + Math.floor(hash01(x, y, 44) * (TILE - w - 2)),
          y: y * TILE + 3 + Math.floor(hash01(x, y, 45) * (TILE - hh - 5)),
          w, h: hh,
          // A puddle fills in its own time: the deep ones first.
          fill: hash01(x, y, 46),
        });
      }
    }
  }
  A.puddles = out;
  A.puddleMap = map;
  return out;
}

/** Interior windows the day comes in through: beams with dust in them. */
function beamsFor(map, lightEnv) {
  const out = A.beams;
  out.length = 0;
  if (!map || !map.indoor || !lightEnv) return out;
  for (const L of lightEnv.active) {
    if (L.def && L.def.when === 'day') out.push(L);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 3. UPDATE
// ---------------------------------------------------------------------------

function resetFor(map) {
  A.map = map;
  for (const d of drops) d.on = false;
  for (const s of splashes) s.on = false;
  for (const r of ripples) r.on = false;
  for (const f of flakes) f.on = false;
  for (const l of leaves) l.on = false;
  for (const f of flies) f.on = false;
  A.lastCamX = null;
}

/** How much of each effect this frame wants, eased so nothing pops. */
function targets(env, map) {
  const out = { rain: 0, snow: 0, ash: 0, fog: 0, leaf: 0, fly: 0, ray: 0, cloud: 0 };
  if (!map || env.place !== 'outdoor') return out;
  const w = env.weather, amt = env.weatherAmt || 0;
  if (w === 'rain') out.rain = amt;
  if (w === 'storm') out.rain = Math.min(1, amt * 1.35);
  if (w === 'snow') out.snow = amt;
  if (w === 'ash') out.ash = amt;
  if (w === 'fog') out.fog = 0.55 + amt * 0.45;
  if (w === 'leaves') out.leaf = 1;
  const clear = w === 'none' || w === 'leaves';
  const m = env.minutes;
  const biome = map.biome;
  // Morning mist in the low places, burning off as the sun climbs.
  if (clear && MIST_LANDS.has(biome) && m > 250 && m < 560) {
    const k = m < 330 ? (m - 250) / 80 : 1 - (m - 330) / 230;
    out.fog = Math.max(out.fog, clamp(k, 0, 1) * (biome === 'marsh' ? 0.7 : 0.5));
  }
  if (biome === 'marsh') out.fog = Math.max(out.fog, 0.22);
  if (clear && FORESTS.has(biome) && env.night < 0.7) out.leaf = Math.max(out.leaf, 0.35);
  if (clear && env.night > 0.55 && summer(env.day) && FIREFLY_LANDS.has(biome)) {
    out.fly = biome === 'city' ? 0.4 : 1;
  }
  // Shafts through the canopy when the sun is low: dawn and the golden hour.
  if (clear && FORESTS.has(biome)) {
    // Full from sunrise to about eight, gone by ten; and again in the golden hour.
    const dawn = clamp((m - 320) / 40, 0, 1) * clamp((600 - m) / 120, 0, 1);
    const eve = clamp((m - 960) / 40, 0, 1) * clamp((1120 - m) / 60, 0, 1);
    out.ray = clamp(Math.max(dawn, eve * 0.8), 0, 1);
  }
  // Fair-weather cloud: some days are patchy, some clear blue.
  if (clear && env.sun > 0.1) {
    const day = hash01(env.day | 0, 7, 3);
    out.cloud = env.sun * (day < 0.15 ? 0 : 0.55 + 0.45 * day);
  }
  return out;
}

const ease = (cur, tgt, dt, up = 0.6, down = 0.8) => (tgt > cur ? Math.min(tgt, cur + dt * up) : Math.max(tgt, cur - dt * down));

/**
 * Advance the air one frame. `env` is Lighting.env for this frame, `cam` the
 * rounded camera, `opts.reduced` thins everything for Reduced Motion.
 */
function update(dt, env, cam, map, opts = {}) {
  dt = clamp(dt || 0, 0, 0.1);
  if (map !== A.map) resetFor(map);
  A.t += dt;
  A.reduced = !!opts.reduced;
  const tg = targets(env, map);
  A.rainAmt = ease(A.rainAmt, tg.rain, dt, 0.5, 0.35);
  A.snowAmt = ease(A.snowAmt, tg.snow, dt, 0.4, 0.4);
  A.ashAmt = ease(A.ashAmt, tg.ash, dt, 0.4, 0.4);
  A.fogAmt = ease(A.fogAmt, tg.fog, dt, 0.15, 0.2);
  A.leafAmt = ease(A.leafAmt, tg.leaf, dt, 0.3, 0.3);
  A.flyAmt = ease(A.flyAmt, tg.fly, dt, 0.3, 0.3);
  A.rayAmt = ease(A.rayAmt, tg.ray, dt, 0.2, 0.2);
  A.cloudAmt = ease(A.cloudAmt, tg.cloud, dt, 0.2, 0.2);
  if (opts.snap) {
    A.rainAmt = tg.rain; A.snowAmt = tg.snow; A.ashAmt = tg.ash; A.fogAmt = tg.fog;
    A.leafAmt = tg.leaf; A.flyAmt = tg.fly; A.rayAmt = tg.ray; A.cloudAmt = tg.cloud;
  }

  // Wind: a base that the weather sets, and gusts that come and go.
  const base = env.weather === 'storm' ? -70 : env.weather === 'rain' ? -30 : env.weather === 'snow' ? -16 : -12;
  A.gust = Math.max(0, A.gust - dt);
  if (A.gust <= 0 && ar.chance(dt * 0.18)) A.gust = ar.float(1, 2.6);
  const gustK = A.gust > 0 ? 1 + 0.8 * Math.sin(Math.PI * Math.min(1, A.gust / 1.8)) : 1;
  A.wind += (base * gustK - A.wind) * Math.min(1, dt * 1.4);

  // The camera moved: screen-space particles slide against it so they sit in
  // the world, not on the glass.
  let dcx = 0, dcy = 0;
  if (A.lastCamX != null) { dcx = cam.x - A.lastCamX; dcy = cam.y - A.lastCamY; }
  if (Math.abs(dcx) > 64 || Math.abs(dcy) > 64) { dcx = 0; dcy = 0; }
  A.lastCamX = cam.x; A.lastCamY = cam.y;
  A.camX = cam.x; A.camY = cam.y;

  stepRain(dt, cam, map, dcx, dcy);
  stepSnow(dt, dcx, dcy);
  stepLeaves(dt, env, dcx, dcy);
  stepFlies(dt, cam);
  for (const s of splashes) if (s.on && (s.age += dt) > 0.24) s.on = false;
  for (const r of ripples) if (r.on && (r.age += dt) > r.life) r.on = false;
}

function stepRain(dt, cam, map, dcx, dcy) {
  const want = Math.round(MAX_DROPS * A.rainAmt * (A.reduced ? 0.4 : 1));
  const vx = A.wind;
  for (let i = 0; i < MAX_DROPS; i++) {
    const d = drops[i];
    if (!d.on) {
      if (i >= want) continue;
      spawnDrop(d, true);
    }
    const k = 0.55 + d.z * 0.45;
    d.x += (vx * k) * dt - dcx * (0.7 + d.z * 0.3);
    d.y += d.vy * dt - dcy * (0.7 + d.z * 0.3);
    if (d.y >= d.ground) {
      // It lands: a crown on open ground, a ring on water, nothing on a roof.
      if (map && d.z > 0.35) {
        const wx = d.x + cam.x, wy = d.ground + cam.y;
        const on = landsOn(map, wx, wy);
        if (on === 1 && ar.chance(0.7)) addSplash(wx, wy);
        else if (on === 2) addRipple(wx, wy, 0.5);
      }
      if (i >= want) { d.on = false; continue; }
      spawnDrop(d, false);
    }
    if (d.x < -20) d.x += VW + 40;
    else if (d.x > VW + 20) d.x -= VW + 40;
  }
  // Rain rings the puddles as it fills them.
  if (A.rainAmt > 0.2 && map) {
    const ps = puddlesFor(map);
    const n = ps.length;
    if (n) {
      const tries = dt * 22 * A.rainAmt;
      let k = tries;
      while (k > 0) {
        if (k < 1 && !ar.chance(k)) break;
        k -= 1;
        const p = ps[ar.int(0, n - 1)];
        if (p.fill > A.rainAmt) continue;
        const sx = p.x - cam.x, sy = p.y - cam.y;
        if (sx < -16 || sy < -16 || sx > VW + 16 || sy > VH + 16) continue;
        addRipple(p.x + ar.int(1, Math.max(1, p.w - 2)), p.y + ar.int(0, p.h - 1), 0.45);
      }
    }
  }
}

function spawnDrop(d, anywhere) {
  d.on = true;
  d.z = ar.next();
  d.len = d.z > 0.66 ? ar.int(6, 8) : d.z > 0.33 ? ar.int(4, 6) : ar.int(3, 4);
  d.vy = 190 + d.z * 90 + ar.float(-12, 12);
  d.x = ar.float(-20, VW + 40);
  d.y = anywhere ? ar.float(-10, VH) : ar.float(-30, -4);
  // Where it hits: anywhere down the view, nearer drops lower.
  d.ground = Math.max(d.y + 8, ar.float(VH * 0.08, VH + 6));
}

function addSplash(x, y) {
  const s = splashes[sHead]; sHead = (sHead + 1) % MAX_SPLASH;
  s.x = Math.round(x); s.y = Math.round(y); s.age = 0; s.on = true;
}

function addRipple(x, y, life) {
  const r = ripples[rHead]; rHead = (rHead + 1) % MAX_RIPPLE;
  r.x = Math.round(x); r.y = Math.round(y); r.age = 0; r.life = life; r.on = true;
}

function stepSnow(dt, dcx, dcy) {
  const amt = Math.max(A.snowAmt, A.ashAmt);
  const want = Math.round(MAX_FLAKES * amt * (A.reduced ? 0.4 : 1) * (A.ashAmt > A.snowAmt ? 0.6 : 1));
  const ash = A.ashAmt > A.snowAmt;
  for (let i = 0; i < MAX_FLAKES; i++) {
    const f = flakes[i];
    if (!f.on) {
      if (i >= want) continue;
      f.on = true; f.z = ar.next(); f.phase = ar.float(0, 6.28);
      f.vy = (ash ? 10 : 18) + f.z * (ash ? 12 : 22);
      f.x = ar.float(-10, VW + 10); f.y = ar.float(-10, VH);
      f.ember = ash && ar.chance(0.12);
    }
    const k = 0.5 + f.z * 0.5;
    f.x += (A.wind * k + Math.sin(A.t * 1.2 + f.phase) * 10) * dt - dcx * (0.6 + f.z * 0.4);
    f.y += f.vy * dt - dcy * (0.6 + f.z * 0.4);
    if (f.y > VH + 4 || f.x < -14 || f.x > VW + 14) {
      if (i >= want) { f.on = false; continue; }
      f.y = ar.float(-8, -2);
      f.x = ar.float(-10, VW + 30);
      f.ember = ash && ar.chance(0.12);
    }
  }
}

function stepLeaves(dt, env, dcx, dcy) {
  const want = Math.round(MAX_LEAVES * A.leafAmt * (A.reduced ? 0.3 : 0.5) * (env.weather === 'leaves' ? 2 : 1));
  const aut = autumn(env.day);
  for (let i = 0; i < MAX_LEAVES; i++) {
    const l = leaves[i];
    if (!l.on) {
      if (i >= want) continue;
      l.on = true;
      l.x = ar.float(VW * 0.2, VW + 30); l.y = ar.float(-20, VH * 0.6);
      l.vx = ar.float(-8, 4); l.vy = ar.float(10, 22);
      l.phase = ar.float(0, 6.28); l.spin = ar.float(3, 7);
      l.pal = aut ? ar.int(1, 2) : (ar.chance(0.3) ? 1 : 0);
    }
    l.x += (A.wind * 1.1 + l.vx + Math.sin(A.t * 1.7 + l.phase) * 14) * dt - dcx;
    l.y += (l.vy + Math.cos(A.t * 2.3 + l.phase) * 10) * dt - dcy;
    if (l.x < -8 || l.y > VH + 8 || l.x > VW + 40) {
      if (i >= want) { l.on = false; continue; }
      l.x = ar.float(VW * 0.3, VW + 30); l.y = ar.float(-16, -4);
    }
  }
}

function stepFlies(dt, cam) {
  const want = Math.round(MAX_FLIES * A.flyAmt * (A.reduced ? 0.5 : 1));
  for (let i = 0; i < MAX_FLIES; i++) {
    const f = flies[i];
    if (!f.on) {
      if (i >= want) continue;
      f.on = true;
      f.hx = cam.x + ar.float(10, VW - 10); f.hy = cam.y + ar.float(20, VH - 10);
      f.phase = ar.float(0, 20); f.speed = ar.float(0.5, 1.1);
    }
    // They wander round a home among the grass; a home the camera has left
    // behind is given up and a new one found in view.
    const sx = f.hx - cam.x, sy = f.hy - cam.y;
    if (sx < -40 || sy < -40 || sx > VW + 40 || sy > VH + 40) {
      if (i >= want) { f.on = false; continue; }
      f.hx = cam.x + ar.float(10, VW - 10); f.hy = cam.y + ar.float(20, VH - 10);
    }
    const t = A.t * f.speed + f.phase;
    f.x = f.hx + Math.sin(t * 0.7) * 14 + Math.sin(t * 1.9) * 5;
    f.y = f.hy + Math.cos(t * 0.5) * 8 + Math.sin(t * 2.3) * 3;
  }
}

// ---------------------------------------------------------------------------
// 4. DRAW
// ---------------------------------------------------------------------------

const RIPPLE_RINGS = [
  [[-1, 0], [1, 0]],
  [[-2, 0], [2, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]],
  [[-3, 0], [3, 0], [-2, -1], [2, -1], [-2, 1], [2, 1], [-1, -1], [1, 1], [0, -1], [0, 1]],
];

/** Puddles and the rings on them, on 'ground-shade' (under the actors). */
function drawGround(ctx, cam, env) {
  const wet = env ? env.wet : 0;
  const map = A.map;
  if (!map || (wet <= 0.02 && A.rainAmt <= 0.02)) return;
  const amt = Math.max(wet, A.rainAmt);
  ctx.save();
  const ps = puddlesFor(map);
  // Standing water mirrors the sky: at night a dark blue slick, by day a pale one.
  const night = env.night || 0;
  const body = night > 0.5 ? '#1d2838' : '#6f8296';
  const lip = night > 0.5 ? '#44566c' : '#b4c4d2';
  for (const p of ps) {
    if (p.fill > amt) continue;
    const sx = p.x - cam.x, sy = p.y - cam.y;
    if (sx < -16 || sy < -8 || sx > VW + 4 || sy > VH + 4) continue;
    const a = clamp((amt - p.fill) * 3, 0, 1);
    // A flat lozenge: full middle rows, ends cut back a pixel.
    ctx.globalAlpha = 0.42 * a;
    ctx.fillStyle = body;
    ctx.fillRect(sx + 1, sy, p.w - 2, p.h);
    ctx.fillRect(sx, sy + 1, p.w, p.h - 1 > 0 ? p.h - 1 : 1);
    // The sheen: the far (top) lip catches the sky.
    ctx.globalAlpha = 0.5 * a;
    ctx.fillStyle = lip;
    ctx.fillRect(sx + 2, sy, Math.max(1, p.w - 5), 1);
  }
  // Rings.
  ctx.fillStyle = night > 0.5 ? '#7d92ac' : '#d2dde6';
  for (const r of ripples) {
    if (!r.on) continue;
    const k = r.age / r.life;
    const ring = RIPPLE_RINGS[Math.min(2, Math.floor(k * 3))];
    const sx = r.x - cam.x, sy = r.y - cam.y;
    if (sx < -4 || sy < -4 || sx > VW + 4 || sy > VH + 4) continue;
    ctx.globalAlpha = 0.55 * (1 - k * 0.6) * amt;
    for (const o of ring) ctx.fillRect(sx + o[0], sy + o[1], 1, 1);
  }
  ctx.restore();
}

const LEAF_FRAMES = [
  [[0, 0, 0], [1, 0, 0], [1, 1, 1], [2, 1, 1]],
  [[0, 0, 0], [1, 0, 1]],
  [[0, 1, 0], [1, 0, 0], [1, 1, 1], [2, 0, 1]],
  [[0, 0, 1], [0, 1, 0], [1, 1, 0]],
];
const LEAF_PAL = [['#6f9a3c', '#3f6a2c'], ['#b09a3a', '#6f5a24'], ['#cf8a30', '#8a4a22']];

/** Rain, splashes, snow, ash, fog banks and leaves, on 'weather'. */
function drawAir(ctx, cam, env) {
  const map = A.map;
  if (!map) return;
  ctx.save();

  // Fog banks first: they sit low, and the rain falls through them.
  if (A.fogAmt > 0.02) {
    const tex = fogTexture();
    if (tex) {
      const W = tex.width, H = tex.height;
      for (let layer = 0; layer < 2; layer++) {
        // World-anchored, drifting on the wind; the near bank a touch faster.
        const drift = A.t * (layer ? 7 : 4) - A.wind * A.t * 0.05;
        const ox = -Math.round(((cam.x * (layer ? 1.08 : 1) + drift) % W + W) % W);
        const oy = -Math.round(((cam.y * (layer ? 1.08 : 1) + layer * 57) % H + H) % H);
        ctx.globalAlpha = clamp(A.fogAmt * (layer ? 0.5 : 0.7), 0, 1);
        for (let x = ox; x < VW; x += W) for (let y = oy; y < VH; y += H) ctx.drawImage(tex, x, y);
      }
    }
  }

  // Rain: one-pixel streaks slanting with the wind, three depths.
  if (A.rainAmt > 0.01) {
    const slope = A.wind / 250;
    for (let pass = 0; pass < 2; pass++) {
      ctx.fillStyle = pass ? '#e2eaf2' : '#a6b6c4';
      ctx.globalAlpha = clamp(A.rainAmt * (pass ? 0.9 : 0.6), 0, 1);
      for (const d of drops) {
        if (!d.on || (d.z > 0.5) !== !!pass) continue;
        streak(ctx, d.x, d.y, d.len, slope);
      }
    }
    ctx.fillStyle = '#d4dee8';
    for (const s of splashes) {
      if (!s.on) continue;
      const sx = s.x - cam.x, sy = s.y - cam.y;
      const f = Math.min(3, Math.floor(s.age / 0.06));
      ctx.globalAlpha = clamp(A.rainAmt * (f < 2 ? 0.8 : 0.45), 0, 1);
      if (f === 0) ctx.fillRect(sx, sy - 1, 1, 1);
      else if (f === 1) { ctx.fillRect(sx - 1, sy - 1, 1, 1); ctx.fillRect(sx + 1, sy - 1, 1, 1); }
      else if (f === 2) { ctx.fillRect(sx - 2, sy - 1, 1, 1); ctx.fillRect(sx + 2, sy - 1, 1, 1); ctx.fillRect(sx, sy, 1, 1); }
      else { ctx.fillRect(sx - 2, sy, 1, 1); ctx.fillRect(sx + 2, sy, 1, 1); }
    }
  }

  // Snow and ash: flat specks, the near ones two pixels square.
  const snowy = Math.max(A.snowAmt, A.ashAmt);
  if (snowy > 0.01) {
    const ash = A.ashAmt > A.snowAmt;
    const far = ash ? '#8a847c' : '#d6e0ec', near = ash ? '#b0a89c' : '#f6f9ff';
    for (let pass = 0; pass < 2; pass++) {
      ctx.fillStyle = pass ? near : far;
      ctx.globalAlpha = clamp(snowy * (pass ? 0.95 : 0.7), 0, 1);
      const s = pass ? 2 : 1;
      for (const f of flakes) {
        if (!f.on || f.ember || (f.z > 0.6) !== !!pass) continue;
        ctx.fillRect(Math.round(f.x), Math.round(f.y), s, s);
      }
    }
  }

  // Leaves on the wind, tumbling through four frames.
  if (A.leafAmt > 0.01) {
    ctx.globalAlpha = 1;
    for (const l of leaves) {
      if (!l.on) continue;
      const fr = LEAF_FRAMES[Math.floor(A.t * l.spin + l.phase) & 3];
      const pal = LEAF_PAL[l.pal];
      const x = Math.round(l.x), y = Math.round(l.y);
      for (const p of fr) { ctx.fillStyle = pal[p[2]]; ctx.fillRect(x + p[0], y + p[1], 1, 1); }
    }
  }
  ctx.restore();
}

/** A one-pixel stepped streak from the drop's head back up its path. */
function streak(ctx, x, y, len, slope) {
  // Pixel j of the tail sits at (x - slope*j, y - j); the pixels that share a
  // column go out as one rect, so a drop is one or two fills, not six.
  const hy = Math.round(y);
  let cx = Math.round(x), start = 0;
  for (let j = 1; j <= len; j++) {
    const px = j < len ? Math.round(x - slope * j) : NaN;
    if (px !== cx) {
      ctx.fillRect(cx, hy - (j - 1), 1, j - start);
      cx = px; start = j;
    }
  }
}

/**
 * Cloud shadows, painted into the light map (render/lighting.js hands it over
 * before the lamps go in). A multiply of the ambient: clouds shade the ground,
 * the roofs and the people alike, and drift on the wind.
 */
function shadeGrade(g, cam) {
  if (A.cloudAmt <= 0.02) return;
  const tex = cloudTexture();
  if (!tex) return;
  const S = tex.width;
  g.save();
  g.globalCompositeOperation = 'multiply';
  g.globalAlpha = clamp(A.cloudAmt, 0, 1);
  const drift = A.t * 5;
  const ox = -Math.round(((cam.x + drift) % S + S) % S);
  const oy = -Math.round(((cam.y + drift * 0.3) % S + S) % S);
  for (let x = ox; x < VW; x += S) for (let y = oy; y < VH; y += S) g.drawImage(tex, x, y);
  g.restore();
}

/** Does anything want the additive 'glow' layer this frame? */
function wantsGlow(env) {
  return A.rayAmt > 0.02 || A.flyAmt > 0.02 || A.ashAmt > 0.02 || (env && env.wet > 0.05 && env.lights > 0.1)
    || (env && env.place === 'interior' && env.night < 0.6);
}

const RAY_TINT = [255, 214, 150];
const BEAM_TINT = [255, 236, 196];

/** God rays, window beams and their dust, fireflies, lamps in wet streets: on 'glow'. */
function drawGlow(ctx, cam, env) {
  const map = A.map;
  if (!map) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // God rays: a few broad shafts slanting down through the canopy, anchored to
  // the wood so they stay put as you walk under them, breathing slowly.
  if (A.rayAmt > 0.02) {
    if (!texRay) texRay = shaftTexture(30, VH + 40, 0.5, 0.8, RAY_TINT) || false;
    if (texRay) {
      const warm = env.minutes > 900;       // evening shafts are later, lower, redder
      const spacing = 150;
      const first = Math.floor((cam.x * 0.92 - 160) / spacing);
      for (let k = first; k < first + 5; k++) {
        const jitter = hash01(k, 3, 9);
        if (jitter < 0.25) continue;         // gaps in the canopy, not a picket fence
        const x = Math.round(k * spacing + jitter * 60 - cam.x * 0.92);
        const breathe = 0.75 + 0.25 * Math.sin(A.t * 0.35 + k * 1.7);
        ctx.globalAlpha = clamp(A.rayAmt * breathe * (warm ? 0.28 : 0.36) * (0.6 + jitter * 0.6), 0, 1);
        ctx.drawImage(texRay, x, -30);
      }
    }
  }

  // Window beams indoors by day, with dust turning slowly in them.
  if (env.place === 'interior' && env.night < 0.6) {
    const day = clamp((0.6 - env.night) / 0.4, 0, 1);
    if (!texBeam) texBeam = shaftTexture(10, 46, 0.55, 0.9, BEAM_TINT) || false;
    const beams = beamsFor(map, env);
    if (texBeam) {
      let bi = 0;
      for (const b of beams) {
        const bx = Math.round(b.fx - cam.x) - 5, by = Math.round(b.fy - cam.y) + 4;
        ctx.globalAlpha = 0.10 * day;
        ctx.drawImage(texBeam, bx, by);
        // Dust: a handful of motes per beam, drifting down and across it.
        ctx.fillStyle = '#fff2d0';
        for (let i = 0; i < 5; i++) {
          const ph = hash01(bi, i, 13) * 40;
          const t = (A.t * 0.06 + ph) % 1;
          const along = t * 40;
          const across = Math.sin(A.t * 0.7 + ph * 3) * 3;
          const mx = Math.round(bx + 5 + along * 0.55 + across), my = Math.round(by + along);
          const tw = 0.5 + 0.5 * Math.sin(A.t * 2.1 + ph * 7);
          ctx.globalAlpha = 0.45 * day * tw * (1 - t);
          ctx.fillRect(mx, my, 1, 1);
        }
        bi++;
      }
    }
  }

  // Lamps in the wet street: a short broken streak of each light's colour
  // straight down from its pool, shivering a pixel as the rain hits.
  if (env.wet > 0.05 && env.lights > 0.1) {
    for (const s of env.active) {
      const def = s.def;
      if (!def.halo || def.when === 'day') continue;
      // From the edge of the pool's bright core downwards: the reflection is
      // what you see past the lit patch, where the wet road is otherwise dark.
      const x = Math.round(s.x - cam.x), y0 = Math.round(s.y - cam.y + def.r * def.ry * 0.25);
      if (x < -4 || x > VW + 4 || y0 < -40 || y0 > VH) continue;
      const tx = map && landsOn(map, s.x, s.y + 6);
      if (tx !== 1 && tx !== 2) continue;
      const c = def.c;
      ctx.fillStyle = `rgb(${Math.round(255 * c[0])},${Math.round(255 * c[1])},${Math.round(255 * c[2])})`;
      const len = Math.round(def.r * 0.6);
      for (let j = 0; j < len; j += 2) {
        const shiver = hash01(Math.floor(A.t * 9), j, x) > 0.7 ? 1 : 0;
        const k = 1 - Math.floor((j / len) * 3) / 3;          // three flat steps
        ctx.globalAlpha = clamp(0.5 * env.wet * env.lights * s.str * k, 0, 1);
        ctx.fillRect(x - 1 + shiver, y0 + j, j < len * 0.5 ? 2 : 1, 1);
      }
    }
  }

  // Fireflies: a green-gold point with a four-pixel halo, blinking on and off.
  if (A.flyAmt > 0.02) {
    for (let i = 0; i < MAX_FLIES; i++) {
      const f = flies[i];
      if (!f.on) continue;
      const cyc = (A.t * 0.45 + f.phase) % 3.2;
      // Stepped blink: off, half, full, half, off.
      const lvl = cyc < 0.3 ? 0.45 : cyc < 1.6 ? 1 : cyc < 1.9 ? 0.45 : 0;
      if (!lvl) continue;
      const x = Math.round(f.x - cam.x), y = Math.round(f.y - cam.y);
      if (x < -2 || y < -2 || x > VW + 2 || y > VH + 2) continue;
      ctx.globalAlpha = clamp(A.flyAmt * lvl * 0.9, 0, 1);
      ctx.fillStyle = '#e4ff8a';
      ctx.fillRect(x, y, 1, 1);
      ctx.globalAlpha = clamp(A.flyAmt * lvl * 0.5, 0, 1);
      ctx.fillStyle = '#9adf4a';
      ctx.fillRect(x - 1, y, 1, 1); ctx.fillRect(x + 1, y, 1, 1);
      ctx.fillRect(x, y - 1, 1, 1); ctx.fillRect(x, y + 1, 1, 1);
    }
  }

  // At night rain is seen by the light it catches: the near streaks again,
  // faintly, as light, so a downpour does not vanish into the dark.
  if (A.rainAmt > 0.05 && env.lights > 0.3) {
    ctx.fillStyle = '#6a7c90';
    ctx.globalAlpha = clamp(A.rainAmt * env.lights * 0.5, 0, 1);
    const slope = A.wind / 250;
    for (const d of drops) if (d.on && d.z > 0.5) streak(ctx, d.x, d.y, d.len, slope);
  }

  // Embers in an ash wind.
  if (A.ashAmt > 0.02) {
    ctx.fillStyle = '#ff9a3c';
    for (const f of flakes) {
      if (!f.on || !f.ember) continue;
      const tw = 0.5 + 0.5 * Math.sin(A.t * 6 + f.phase * 5);
      ctx.globalAlpha = clamp(A.ashAmt * tw * 0.8, 0, 1);
      ctx.fillRect(Math.round(f.x), Math.round(f.y), 1, 1);
    }
  }
  ctx.restore();
}

export const Atmosphere = {
  update,
  drawGround,
  drawAir,
  drawGlow,
  shadeGrade,
  wantsGlow,
  /** Does anything want the 'weather' layer this frame? (An unfetched layer costs nothing.) */
  wantsAir() {
    return A.rainAmt > 0.01 || A.snowAmt > 0.01 || A.ashAmt > 0.01 || A.fogAmt > 0.02 || A.leafAmt > 0.01;
  },
  /** The state, for the inspector and tests. */
  get state() { return A; },
  /** Forget a map's puddles (it was rebuilt). */
  invalidate(map) { if (!map || A.puddleMap === map) { A.puddles = null; A.puddleMap = null; } },
};

export default Atmosphere;
