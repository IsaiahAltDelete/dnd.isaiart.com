// ui/title_vista.js — the title screen's Sword Coast at dusk: parallax depths, one Stage layer each.
//
// Looking north up the coast road at sundown: the Sea of Swords to the west with
// the sun going into it, the Sword Mountains in haze inland, Neverwinter's walls
// and Castle Never on the headland ahead, and on the near cliff a waystation with
// its lantern lit. Every depth is painted ONCE, pixel by pixel into a plain
// buffer (no antialiasing anywhere, so the upscale stays crisp), in two palettes:
// dusk and night. A frame blits one prerendered picture per depth and paints the
// small living things (stars, glints, the cog, gulls, flames, smoke, surf) on
// top. Dusk and night are cross-faded in sixteen steps and each step is cached,
// so the slow drift into night costs one extra blit per depth sixteen times, not
// every frame.
//
// Each depth sits on its own res-1 world layer (z 11-17, between the standard
// backdrop and ground), so the F10 inspector can hide, solo or fade any of them;
// the light halos go on the standard additive `glow` layer.

import { Stage } from '../render/stage.js';
import { makeRNG } from '../core/rng.js';

const W = 400, H = 240;
const HORIZON = 148;
const SUN_X = 190;
/** How far the nearest depth drifts either side, and how long one sweep takes. */
const PAN = 9, PAN_PERIOD = 80;
const CAN = typeof document !== 'undefined' && typeof document.createElement === 'function';

export const TITLE_LAYERS = Object.freeze([
  ['title-sky', 11], ['title-clouds', 12], ['title-hills', 13], ['title-sea', 14],
  ['title-city', 15], ['title-birds', 16], ['title-near', 17],
]);
for (const [id, z] of TITLE_LAYERS) Stage.define(id, { res: 1, z, group: 'world' });

// ===========================================================================
// Pixel buffers
// ===========================================================================

/** '#rrggbb' -> a little-endian RGBA word for a Uint32 view of ImageData. */
export function hex(s) {
  const n = parseInt(s.slice(1), 16);
  return (0xff000000 | ((n & 0xff) << 16) | (n & 0xff00) | ((n >> 16) & 0xff)) >>> 0;
}
const CLEAR = 0;

export class Raster {
  constructor(w, h) { this.w = w; this.h = h; this.px = new Uint32Array(w * h); }
  set(x, y, c) { if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y * this.w + x] = c; }
  get(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.px[y * this.w + x] : CLEAR; }
  rect(x, y, w, h, c) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c); }
  /** A copy of the rows from `y0` down. */
  rows(y0) { const o = new Raster(this.w, this.h - y0); o.px.set(this.px.subarray(y0 * this.w)); return o; }
  /** Scanline polygon fill, pixel centres only, so edges are hard. */
  poly(pts, c) {
    let y0 = Infinity, y1 = -Infinity;
    for (const [, y] of pts) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
      const sy = y + 0.5, xs = [];
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
        if ((ay <= sy && by > sy) || (by <= sy && ay > sy)) xs.push(ax + (sy - ay) / (by - ay) * (bx - ax));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.ceil(xs[k] - 0.5); x <= Math.floor(xs[k + 1] - 0.5); x++) this.set(x, y, c);
      }
    }
  }
  canvas() {
    const c = document.createElement('canvas');
    c.width = this.w; c.height = this.h;
    const g = c.getContext('2d');
    g.putImageData(new ImageData(new Uint8ClampedArray(this.px.buffer), this.w, this.h), 0, 0);
    return c;
  }
}

/** Paint `rows` (strings, '.' = clear) with `pal` (char -> hex) into a raster. */
function sprite(rows, pal) {
  const r = new Raster(Math.max(...rows.map((s) => s.length)), rows.length);
  const cols = {};
  for (const k in pal) cols[k] = hex(pal[k]);
  rows.forEach((s, y) => { for (let x = 0; x < s.length; x++) if (cols[s[x]]) r.set(x, y, cols[s[x]]); });
  return r;
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const bay = (x, y) => (BAYER[((y & 3) << 2) | (x & 3)] + 0.5) / 16;

/** Integer hash noise in [0,1): stable texture without spending the seeded stream. */
function hash(x, y, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** Smooth 1-D value noise, for ridgelines and coast edges. */
function noise1(x, s) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return hash(i, 0, s) * (1 - u) + hash(i + 1, 0, s) * u;
}

/**
 * Flat bands with a dithered seam between neighbours, the way a pixel artist
 * shades a sky: `stops` is [[v, word], ...] ascending; `soft` is how much of each
 * gap is dithered (the rest is solid colour).
 */
function band(stops, v, x, y, soft = 0.55) {
  if (v <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    const b = stops[i][0];
    if (v > b) continue;
    const a = stops[i - 1][0];
    const f = ((v - a) / (b - a) - (1 - soft) / 2) / soft;
    return f > bay(x, y) ? stops[i][1] : stops[i - 1][1];
  }
  return stops[stops.length - 1][1];
}
const stops = (list) => list.map(([v, c]) => [v, hex(c)]);
const words = (pal) => { const o = {}; for (const k in pal) o[k] = typeof pal[k] === 'string' ? hex(pal[k]) : pal[k]; return o; };

/** Any pixel of `r` whose neighbour at (dx,dy) is clear takes `c`: rim light on one side of a silhouette. */
function rim(r, mask, dx, dy, c, only = null) {
  const out = [];
  for (let y = 0; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) {
      const k = mask.get(x, y);
      if (!k || (only && !only.has(k))) continue;
      if (!mask.get(x + dx, y + dy)) out.push(x, y);
    }
  }
  for (let i = 0; i < out.length; i += 2) r.set(out[i], out[i + 1], c);
}

// ===========================================================================
// Depth painters. Each is called once per palette with the same seed, so the
// dusk and night pictures share every silhouette pixel for pixel.
// ===========================================================================

const SKY = {
  dusk: stops([[0, '#16163a'], [0.2, '#222350'], [0.37, '#352b60'], [0.52, '#53336b'], [0.64, '#7c3e6e'],
    [0.74, '#a54f6d'], [0.83, '#c96864'], [0.9, '#e2885c'], [0.955, '#f1ab62'], [1.0, '#f8cc80'], [1.1, '#fde6b0']]),
  night: stops([[0, '#05071a'], [0.3, '#090e2a'], [0.58, '#0f1739'], [0.8, '#162048'], [0.95, '#1d2a54'], [1.0, '#26345e']]),
};

function paintSky(night) {
  const r = new Raster(W, HORIZON + 2);
  for (let y = 0; y < r.h; y++) {
    const v = y / HORIZON;
    for (let x = 0; x < W; x++) {
      if (night) { r.set(x, y, band(SKY.night, v + (hash(x, y, 3) - 0.5) * 0.02, x, y)); continue; }
      // The bands arc round the sun: the glow pushes each pixel toward the warm
      // end of the ramp by its (flattened) distance from the sun's disc.
      const dx = (x - SUN_X) / 2.1, dy = (HORIZON - y) * 1.0;
      const g = Math.max(0, 1 - Math.hypot(dx, dy) / 130);
      r.set(x, y, band(SKY.dusk, v + g * g * 0.42, x, y));
    }
  }
  return r;
}

/** A sun half gone into the sea. */
function paintSun() {
  const R = 12, r = new Raster(R * 2 + 1, R * 2 + 1);
  const core = hex('#fff8dc'), mid = hex('#ffe7a2'), edge = hex('#ffcf74');
  for (let y = 0; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) {
      const d = Math.hypot(x - R, y - R);
      if (d > R + 0.3) continue;
      r.set(x, y, d > R - 1.4 ? edge : d > R - 4 - (y > R ? 1 : 0) ? mid : core);
    }
  }
  return r;
}

/** Selune at the full, maria and all, lit from the upper left. */
function paintMoon() {
  const R = 9, r = new Raster(R * 2 + 1, R * 2 + 1);
  const base = hex('#ece6cf'), hi = hex('#fffbea'), sh = hex('#c6bea6'), mare = hex('#d2cab2');
  const maria = [[-3, -2, 2.6], [2, 2, 3.2], [3, -4, 1.6], [-2, 4, 1.4]];
  for (let y = 0; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) {
      const dx = x - R, dy = y - R, d = Math.hypot(dx, dy);
      if (d > R + 0.3) continue;
      let c = base;
      for (const [mx, my, mr] of maria) if (Math.hypot(dx - mx, dy - my) < mr) c = mare;
      if (d > R - 1.3) c = dx + dy < -2 ? hi : dx + dy > 3 ? sh : c;
      r.set(x, y, c);
    }
  }
  return r;
}

// --- clouds ----------------------------------------------------------------

const CLOUD_W = 800;
const CLOUDS = {
  high: { y: 22, h: 44, speed: 1.4, depth: 0.06,
    dusk: { rim: '#ffc58e', lit: '#ef9a7c', base: '#a65d7c', top: '#6b406f' },
    night: { rim: '#1c2146', lit: '#262d56', base: '#2c345e', top: '#4c5888' } },
  low: { y: 100, h: 48, speed: 3.2, depth: 0.14,
    dusk: { rim: '#ffe3a4', lit: '#f5a46e', base: '#c26a6e', top: '#8c4a6c' },
    night: { rim: '#161c40', lit: '#1e2549', base: '#232a52', top: '#46528a' } },
};

function cloudMask(kind) {
  const cfg = CLOUDS[kind], rng = makeRNG('title-clouds-' + kind);
  const m = new Raster(CLOUD_W, cfg.h);
  const puff = (cx, cy, rx, ry, flat) => {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      if (y > flat) continue;
      for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
        const e = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
        if (e <= 1 + (hash(x, y, 7) - 0.5) * 0.3) m.set(((x % CLOUD_W) + CLOUD_W) % CLOUD_W, y, 1);
      }
    }
  };
  if (kind === 'high') {
    // Long mare's-tail streaks, stretched thin by the wind aloft.
    for (let i = 0; i < 9; i++) {
      let x = i * 88 + rng.int(0, 40);
      const y = rng.int(4, cfg.h - 8), n = rng.int(3, 6);
      for (let k = 0; k < n; k++) {
        puff(x, y + rng.int(-2, 2), rng.int(14, 34), rng.float(1.2, 2.8), cfg.h);
        x += rng.int(14, 30);
      }
    }
  } else {
    // A broken bank sitting on the haze: flat bottoms, heaped tops.
    for (let i = 0; i < 11; i++) {
      let x = i * 73 + rng.int(0, 30);
      const base = rng.int(26, cfg.h - 4), n = rng.int(3, 7);
      for (let k = 0; k < n; k++) {
        const ry = rng.float(3.5, 9.5);
        puff(x, base - ry * 0.55 + rng.int(-2, 1), rng.int(8, 24), ry, base);
        x += rng.int(9, 20);
      }
    }
  }
  return m;
}

function paintClouds(kind, night) {
  const cfg = CLOUDS[kind], m = cloudMask(kind), P = words(night ? cfg.night : cfg.dusk);
  const r = new Raster(m.w, m.h);
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) {
      if (!m.get(x, y)) continue;
      const wx = (dx) => m.get((x + dx + m.w) % m.w, y);
      const up = m.get(x, y - 1), up2 = m.get(x, y - 2), dn = m.get(x, y + 1), dn2 = m.get(x, y + 2);
      let c;
      if (night) {
        // Moonlight from above: silver tops, dark undersides.
        c = !up ? P.top : !up2 && bay(x, y) < 0.5 ? P.top : !dn ? P.rim : P.base;
      } else {
        // Sunset from below: the undersides catch fire, the tops go violet.
        c = !dn ? P.rim : !dn2 ? P.lit : !up || (!up2 && bay(x, y) < 0.5) ? P.top : P.base;
        if (c === P.base && !wx(-1)) c = P.lit;
      }
      r.set(x, y, c);
    }
  }
  return r;
}

// --- the Sword Mountains ----------------------------------------------------

const HILLS = {
  y: 78, depth: 0.22,
  far: [[190, 149], [210, 139], [228, 128], [246, 121], [262, 108], [278, 113], [296, 97], [312, 106],
    [330, 90], [348, 101], [364, 94], [382, 105], [398, 98], [420, 104]],
  near: [[222, 149], [240, 139], [258, 132], [278, 126], [296, 130], [316, 119], [336, 127], [356, 121], [378, 129], [420, 123]],
  dusk: { lit: '#b57088', lit2: '#ca8690', shade: '#6d4877', deep: '#5b406e', snow: '#f8cbb6', snowSh: '#a98bb2', haze: '#d9938a',
    nLit: '#7e4b72', nShade: '#4d3162', nHaze: '#b56d7c' },
  night: { lit: '#343d6d', lit2: '#3f4979', shade: '#252c54', deep: '#20264a', snow: '#7a88b8', snowSh: '#4c5686', haze: '#253058',
    nLit: '#1f2649', nShade: '#181d3e', nHaze: '#1f2a50' },
};

function ridge(points, amp, seed) {
  const top = new Float32Array(W + 40);
  for (let x = 0; x < top.length; x++) {
    const sx = x - 20;
    let y = 999;
    for (let i = 1; i < points.length; i++) {
      const [ax, ay] = points[i - 1], [bx, by] = points[i];
      if (sx >= ax && sx <= bx) { y = ay + (by - ay) * (sx - ax) / (bx - ax); break; }
    }
    if (y < 999) y += (noise1(sx / 7, seed) - 0.5) * amp + (noise1(sx / 2.3, seed + 1) - 0.5) * amp * 0.45;
    top[x] = y;
  }
  return (sx) => top[Math.max(0, Math.min(top.length - 1, Math.round(sx) + 20))];
}

function paintHills(night, pad) {
  const P = words(night ? HILLS.night : HILLS.dusk);
  const r = new Raster(W + pad * 2, HORIZON + 1 - HILLS.y);
  const far = ridge(HILLS.far, 7, 11), near = ridge(HILLS.near, 5, 23);
  for (let u = 0; u < r.w; u++) {
    const x = u - pad;
    for (let j = 0; j < r.h; j++) {
      const y = j + HILLS.y;
      const tn = near(x), tf = far(x);
      if (y >= tn) {
        // The foothills: nearer, so less haze and no snow.
        const s = near(x - 2 + (y - tn) * 0.5) - near(x + 2 + (y - tn) * 0.5);
        let c = s > 0.3 ? P.nLit : P.nShade;
        const hz = Math.max(0, (y - 136) / 14);
        if (bay(u, y) < hz * 0.8) c = P.nHaze;
        r.set(u, j, c);
      } else if (y >= tf) {
        const d = y - tf;
        // Faces that climb toward the west catch the last of the sun: sample the
        // slope a little uphill of the pixel, so the lit/shaded split runs down
        // from each peak on a slant instead of straight down.
        const sx = x - d * 0.45;
        const s = far(sx - 2) - far(sx + 2);
        let c = s > 0.4 ? (d < 3 ? P.lit2 : P.lit) : s < -2.5 ? P.deep : P.shade;
        const snowLine = 112 + (noise1(x / 3, 5) - 0.5) * 6;
        if (tf < snowLine && d < 2 + (snowLine - tf) * 0.45 && y < snowLine + 2) c = s > 0.4 ? P.snow : P.snowSh;
        // Haze swallows the roots of the range.
        const hz = Math.max(0, (y - 120) / 28);
        if (bay(u, y) < hz * hz * 1.1) c = P.haze;
        r.set(u, j, c);
      }
    }
  }
  return r;
}

// --- the Sea of Swords ------------------------------------------------------

const SEA = {
  depth: 0.34, h: H - HORIZON,
  dusk: stops([[0, '#fcd495'], [0.025, '#efa373'], [0.07, '#c86f72'], [0.17, '#924b70'], [0.32, '#633667'],
    [0.52, '#452a5c'], [0.76, '#302152'], [1, '#241a46']]),
  night: stops([[0, '#3a4876'], [0.03, '#26325c'], [0.16, '#1a244c'], [0.45, '#121b40'], [1, '#0a1233']]),
};

function paintSea(night, pad) {
  const ramp = night ? SEA.night : SEA.dusk;
  const r = new Raster(W + pad * 2, SEA.h);
  const rng = makeRNG('title-sea');
  for (let j = 0; j < r.h; j++) {
    const v = j / (r.h - 1);
    const colW = 5 + v * 64;
    for (let u = 0; u < r.w; u++) {
      const x = u - pad;
      let vv = v;
      // The sun path: the water under the sun takes the sky's brighter colours.
      if (!night) { const dx = Math.abs(x - SUN_X) / colW; if (dx < 1) vv -= 0.1 * (1 - dx) * (1 - dx) * (1 + v); }
      r.set(u, j, band(ramp, vv, u, j + HORIZON, 0.6));
    }
    // Swell: short horizontal dashes, longer as the water comes nearer.
    const n = 2 + Math.round(v * 7);
    for (let k = 0; k < n; k++) {
      const len = 2 + Math.round(v * rng.float(3, 12));
      const x0 = rng.int(0, r.w - 1);
      const lighter = rng.chance(0.55);
      const c = band(ramp, v + (lighter ? -0.09 - v * 0.05 : 0.1), x0, j, 1);
      for (let i = 0; i < len; i++) r.set(x0 + i, j, c);
    }
  }
  return r;
}

/** A cog running for Neverwinter under a single square sail. */
const COG = [
  '......pP.....',
  '......|pp....',
  '....yyyyyy...',
  '....SSSSSSs..',
  '...SSSSSSSs..',
  '...SSSSSSSs..',
  '...sSSSSSSs..',
  '...ssSSSSss..',
  '....ssSSss...',
  '......|......',
  'hh....|....hh',
  'hHHHHHHHHHHHh',
  '.HHHHHHHHHHh.',
  '..kkkkkkkkk..',
];
const COG_PAL = {
  dusk: { p: '#d2463c', P: '#f0705a', '|': '#3a2432', y: '#4a2c3a', S: '#f6cda4', s: '#b77c82', H: '#3c2336', h: '#8a4e5a', k: '#26162a' },
  night: { p: '#6a3050', P: '#8a4060', '|': '#141630', y: '#1a1c38', S: '#6c78a8', s: '#434c7c', H: '#141730', h: '#262c54', k: '#0c0e22' },
};

// --- Neverwinter on its headland ---------------------------------------------

const CITY = {
  y: 94, depth: 0.34,
  dusk: { body: '#3b2644', rim: '#a3596a', roof: '#4f2c48', roofRim: '#c3706a', land: '#34213e', landRim: '#b86a6c', glass: '#241828',
    trees: '#281a32', cliff: '#7a4458', cliffDk: '#56304a', foam: '#f4c0a0' },
  night: { body: '#141a37', rim: '#2b3565', roof: '#191f40', roofRim: '#36417a', land: '#10152e', landRim: '#27305c', glass: '#0c1024',
    trees: '#0b0f24', cliff: '#1f264a', cliffDk: '#151a38', foam: '#5a6a9e' },
};

/** Builds the headland once; returns the painted raster and the windows it left. */
function paintCity(night, pad) {
  const P = words(night ? CITY.night : CITY.dusk);
  const r = new Raster(W + pad * 2, HORIZON + 2 - CITY.y);
  const m = new Raster(r.w, r.h);          // material ids, for the rim pass
  const rng = makeRNG('title-city');
  const windows = [];
  const X = (x) => x + pad, Y = (y) => y - CITY.y;
  const put = (x, y, w, h, id) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) m.set(X(i), Y(j), id); };
  const tri = (x0, x1, yb, yt, id) => {
    const cx = (x0 + x1) / 2;
    for (let y = yt; y < yb; y++) {
      const half = (x1 - x0) / 2 * (y - yt + 1) / (yb - yt);
      for (let x = Math.round(cx - half); x < Math.round(cx + half); x++) m.set(X(x), Y(y), id);
    }
  };
  const win = (x, y, th) => windows.push({ x, y, th });

  // The headland: a low sea cliff at its point, rising to the castle hill.
  for (let x = 244; x < W + pad; x++) {
    const rise = Math.min(1, (x - 244) / 18);
    const hill = Math.max(0, 1 - Math.abs(x - 330) / 34) * 6;
    const top = Math.round(HORIZON - rise * 9 - hill + (noise1(x / 5, 41) - 0.5) * 2);
    put(x, top, 1, HORIZON + 2 - top, 1);
  }
  // A harbour light at the point.
  put(250, 130, 3, 11, 2); tri(249, 254, 130, 126, 3); win(251, 132, -1);

  // Houses crowd up behind the wall, gables every which way.
  for (let x = 262; x < W + pad - 4;) {
    const w = rng.int(5, 9), hgt = rng.int(4, 9), base = 134;
    put(x, base - hgt, w, hgt + 2, 2);
    tri(x - 1, x + w + 1, base - hgt, base - hgt - rng.int(3, 5), 3);
    for (let k = 0; k < 2; k++) if (rng.chance(0.7)) win(x + rng.int(1, w - 2), base - hgt + rng.int(1, hgt - 1), rng.float(0.05, 0.95));
    x += w + rng.int(-1, 1);
  }
  // The Hall of Justice's tower and nave.
  put(284, 116, 6, 20, 2); tri(283, 291, 116, 104, 3); put(290, 122, 12, 14, 2); tri(289, 303, 122, 115, 3);
  win(286, 119, 0.3); win(286, 124, 0.55); win(293, 126, 0.2); win(297, 126, 0.4);
  // Castle Never on the hill: keep, curtain and its spires.
  put(314, 114, 30, 22, 2);
  for (let x = 314; x < 344; x += 3) put(x, 112, 2, 2, 2);
  put(316, 102, 6, 12, 2); tri(315, 323, 102, 92, 3);
  put(338, 104, 6, 10, 2); tri(337, 345, 104, 95, 3);
  put(325, 96, 8, 18, 2); tri(324, 334, 96, 82, 3);
  put(328, 80, 2, 3, 3);
  for (const [x, y, th] of [[318, 105, 0.1], [319, 109, 0.5], [340, 107, 0.35], [328, 99, 0.15], [328, 104, 0.6],
    [320, 118, 0.7], [326, 118, 0.25], [332, 118, 0.8], [338, 118, 0.45], [323, 126, 0.65], [335, 126, 0.3]]) win(x, y, th);
  // The city wall and its towers, merlons against the sky.
  put(260, 134, W + pad - 260, 6, 2);
  for (let x = 260; x < W + pad; x += 3) put(x, 132, 2, 2, 2);
  for (const tx of [262, 276, 306, 352, 372, 394]) {
    put(tx, 124, 6, 12, 2);
    if (tx % 2) { for (let k = 0; k < 6; k += 2) put(tx + k, 122, 1, 2, 2); } else tri(tx - 1, tx + 7, 124, 118, 3);
    win(tx + 2, 127, rng.float(0.1, 0.9));
  }

  // Paint: body, roofs, the land; rim light on the side the light comes from.
  const col = { 1: P.land, 2: P.body, 3: P.roof };
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) { const k = m.get(x, y); if (k) r.set(x, y, col[k]); }
  // The headland itself: wooded slopes under the wall, a low sea cliff at its
  // foot, and surf breaking along the waterline.
  for (let y = 0; y < r.h; y++) {
    const wy = y + CITY.y;
    for (let x = 0; x < r.w; x++) {
      if (m.get(x, y) !== 1) continue;
      const sx = x - pad;
      if (wy >= HORIZON + 1) { if (hash(sx >> 1, 0, 43) < 0.55) r.set(x, y, P.foam); }
      else if (wy >= HORIZON - 3) r.set(x, y, hash(sx, 0, 44) < 0.35 ? P.cliffDk : P.cliff);
      else if (noise1(sx / 4, 45) + (hash(sx, wy, 46) - 0.5) * 0.3 > 0.58) r.set(x, y, P.trees);
    }
  }
  if (night) {
    rim(r, m, 0, -1, P.rim, new Set([2]));
    rim(r, m, 1, 0, P.roofRim, new Set([3]));
    rim(r, m, 0, -1, P.landRim, new Set([1]));
  } else {
    rim(r, m, -1, 0, P.rim, new Set([2]));
    rim(r, m, -1, 0, P.roofRim, new Set([3]));
    rim(r, m, -1, 0, P.landRim, new Set([1]));
    rim(r, m, 0, -1, P.landRim, new Set([1]));
  }
  for (const w of windows) r.set(X(w.x), Y(w.y), P.glass);
  return { r, windows };
}

// --- the near cliff, the road and the waystation ----------------------------

const NEAR = {
  depth: 1, top: 146,
  dusk: { grass: '#2b1f31', grass2: '#34253a', grassRim: '#b0676a', rock: '#6e3d4e', rockLit: '#a25960', rockHi: '#c47466',
    rockDk: '#44283e', road: '#4b3445', roadHi: '#654556', roadRim: '#9a6060', rut: '#382736', stone: '#3d2b3d', stoneHi: '#5a3e4c',
    plaster: '#5b4152', beam: '#241826', roof: '#2e1d2d', roofHi: '#3c2536', roofRim: '#bd6a5c', frame: '#7a4a2e',
    dark: '#1a1220', wood: '#4a2e2c', bank: '#221828', bankRim: '#8a5060' },
  night: { grass: '#0f1022', grass2: '#141528', grassRim: '#2e3764', rock: '#1d2140', rockLit: '#262c52', rockHi: '#343d6c',
    rockDk: '#12142a', road: '#1b1d34', roadHi: '#23263f', roadRim: '#2e3660', rut: '#131426', stone: '#16172c', stoneHi: '#20223c',
    plaster: '#1f2038', beam: '#0b0b18', roof: '#121328', roofHi: '#181a32', roofRim: '#343e70', frame: '#4a3020',
    dark: '#08080f', wood: '#1a1622', bank: '#0b0b18', bankRim: '#262d58' },
};

/** Where the plateau ends on the left: the cliff edge, from the water up. */
function cliffEdge(y) { return 300 - (y - 180) * 0.3 + (noise1(y / 4, 61) - 0.5) * 5; }
/** The far rim of the plateau against the city behind it. */
function plateau(x) { return 178 - (x - 300) * 0.03 + (noise1(x / 9, 67) - 0.5) * 4; }
/** The road's centre line and half width at a given row. */
function roadAt(y) {
  const t = (y - 176) / 64;             // 0 at the far rim, 1 at the bottom edge
  return { cx: 306 + t * t * 58 + Math.sin(t * 3.2) * 6, half: 1 + t * t * 15 };
}

export const WAYSTATION = Object.freeze({
  lantern: { x: 332, y: 186 },
  torches: [{ x: 354, y: 193 }, { x: 367, y: 193 }],
  chimney: { x: 371, y: 151 },
  windows: [{ x: 348, y: 184, w: 4, h: 5 }, { x: 367, y: 184, w: 4, h: 5 }, { x: 347, y: 198, w: 4, h: 4 }, { x: 359, y: 171, w: 2, h: 2 }],
  door: { x: 357, y: 197, w: 6, h: 9 },
  hero: { x: 350, y: 237 },
  milestone: { x: 310, y: 196 },
  surf: 222,
});

function paintNear(night, pad) {
  const P = words(night ? NEAR.night : NEAR.dusk);
  const r = new Raster(W + pad * 2, H);
  const m = new Raster(r.w, r.h);
  const X = (x) => x + pad;
  const put = (x, y, w, h, id) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) m.set(X(i), j, id); };

  // 1 grass, 2 rock face, 3 road, 4 stone, 5 plaster, 6 beam, 7 roof, 8 bank, 9 dark, 10 wood
  for (let y = 170; y < H; y++) {
    const e = cliffEdge(y);
    const face = 6 + (y - 176) * 0.22;             // the face seen at an angle widens as it nears
    for (let x = Math.floor(e - face); x < W + pad; x++) {
      if (x >= e && y < plateau(x)) continue;
      if (x < e && y < 184) continue;
      m.set(X(x), y, x < e ? 2 : 1);
    }
  }
  // The road, worn pale down the middle, running off toward the city gate.
  for (let y = 176; y < H; y++) {
    const { cx, half } = roadAt(y);
    for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) if (m.get(X(x), y) === 1) m.set(X(x), y, 3);
  }
  // The waystation: stone ground floor, timber-framed upper storey, steep gable.
  put(342, 194, 36, 12, 4);                          // ground floor
  put(341, 180, 38, 14, 5);                          // jettied upper floor
  for (const bx of [341, 350, 359, 368, 377]) put(bx, 180, 2, 14, 6);
  put(341, 180, 38, 1, 6); put(341, 187, 38, 1, 6); put(341, 193, 38, 1, 6);
  for (let k = 0; k < 6; k++) { m.set(X(343 + k), 181 + k, 6); m.set(X(357 - k), 181 + k, 6); m.set(X(370 + k), 181 + k, 6); }
  for (let y = 154; y < 181; y++) {                  // the gable roof, eaves overhanging
    const half = (y - 154) * 0.84 + 1;
    for (let x = Math.round(360 - half); x <= Math.round(360 + half); x++) m.set(X(x), y, 7);
  }
  put(369, 151, 5, 13, 4); put(368, 150, 7, 2, 4);   // chimney
  put(378, 190, 20, 16, 10);                         // the stable lean-to
  for (let x = 377; x < 400; x++) { const t = Math.round(186 + (x - 377) * 0.3); put(x, t, 1, 4, 7); }
  put(382, 196, 12, 10, 9);
  const ws = WAYSTATION;
  put(ws.door.x, ws.door.y, ws.door.w, ws.door.h, 9);
  for (const w of ws.windows) put(w.x - 1, w.y - 1, w.w + 2, w.h + 2, 10);
  // Lantern post by the road and a hanging sign on its arm.
  put(331, 188, 2, 18, 10); put(331, 184, 1, 1, 10); put(333, 186, 5, 1, 10);
  put(335, 187, 1, 2, 10); put(334, 189, 5, 4, 10);
  // A bank of gorse and stone along the bottom left, under the menu's feet.
  for (let x = 0; x < 250; x++) {
    const t = Math.round(229 + (noise1(x / 11, 71) - 0.5) * 8 + (noise1(x / 3, 72) - 0.5) * 3 + Math.max(0, x - 170) * 0.12);
    for (let y = t; y < H; y++) m.set(X(x), y, 8);
  }

  const col = { 1: P.grass, 2: P.rock, 3: P.road, 4: P.stone, 5: P.plaster, 6: P.beam, 7: P.roof, 8: P.bank, 9: P.dark, 10: P.wood };
  for (let y = 0; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) {
      const k = m.get(x, y);
      if (!k) continue;
      let c = col[k];
      const sx = x - pad;
      if (k === 1 && hash(sx, y, 81) < 0.18) c = P.grass2;
      if (k === 3) {
        const { cx, half } = roadAt(y);
        const off = Math.abs(sx - cx) / Math.max(1, half);
        if (off < 0.35 && hash(sx >> 1, y, 83) < 0.6) c = P.roadHi;
        // Cart ruts either side of the crown.
        if (half > 4 && Math.abs(off - 0.45) < 0.5 / half && hash(sx, y >> 1, 86) < 0.8) c = P.rut;
        if (off > 0.55 && off < 0.75 && hash(sx, y, 84) < 0.5) c = P.grass2;
      }
      if (k === 2) {
        // Bedded rock: strata that dip toward the sea, cracks between them.
        const e = cliffEdge(y), into = (e - sx) / (6 + (y - 176) * 0.22);
        const bed = (y + sx * 0.35 + (noise1(sx / 3, 91) - 0.5) * 3) % 7;
        c = bed < 1 ? P.rockDk : into > 0.72 ? P.rockHi : into > 0.35 ? P.rockLit : P.rock;
        if (night) c = bed < 1 ? P.rockDk : into < 0.3 ? P.rockLit : P.rock;
      }
      if (k === 4 && ((y % 4 === 0) || ((x + (y >> 2) * 3) % 7 === 0))) c = P.stoneHi;
      if (k === 7 && y % 3 === 0 && hash(sx, y, 85) < 0.7) c = P.roofHi;
      r.set(x, y, c);
    }
  }
  if (night) {
    rim(r, m, 0, -1, P.grassRim, new Set([1, 3]));
    rim(r, m, 1, 0, P.roofRim, new Set([7]));
    rim(r, m, 0, -1, P.roofRim, new Set([7, 4]));
    rim(r, m, 0, -1, P.bankRim, new Set([8]));
  } else {
    rim(r, m, 0, -1, P.grassRim, new Set([1, 3]));
    rim(r, m, -1, 0, P.roofRim, new Set([7, 4]));
    rim(r, m, 0, -1, P.bankRim, new Set([8]));
  }
  // Tufts on the bank's crest.
  const rng = makeRNG('title-near');
  for (let i = 0; i < 70; i++) {
    const x = rng.int(0, 248), top = (() => { for (let y = 200; y < H; y++) if (m.get(X(x), y) === 8) return y; return H; })();
    const h = rng.int(1, 4);
    for (let k = 1; k <= h; k++) r.set(X(x), top - k, k === h ? P.bankRim : P.bank);
  }
  // Grass tufts across the clifftop, their tips catching the light, and field
  // stones along the verges.
  for (let i = 0; i < 110; i++) {
    const x = rng.int(252, W - 1), y = rng.int(180, H - 1);
    if (m.get(X(x), y) !== 1 || m.get(X(x), y - 3) !== 1) continue;
    const h = rng.int(1, 3);
    for (let k = 0; k < h; k++) r.set(X(x), y - k, k === h - 1 ? P.grassRim : P.grass2);
    if (rng.chance(0.5)) r.set(X(x + rng.sign()), y, P.grass2);
  }
  for (let i = 0; i < 16; i++) {
    const y = rng.int(186, H - 3), { cx, half } = roadAt(y);
    const x = Math.round(cx + (half + rng.int(2, 7)) * rng.sign());
    if (m.get(X(x), y) !== 1 || m.get(X(x + 2), y + 1) !== 1) continue;
    r.rect(X(x), y, 3, 2, P.rockDk);
    r.set(X(x), y, P.rockLit); r.set(X(x + 1), y, P.rockLit);
  }
  // A milestone on the verge: so many leagues to Neverwinter.
  const ms = WAYSTATION.milestone;
  r.rect(X(ms.x), ms.y + 1, 4, 6, P.rockDk);
  r.rect(X(ms.x + 1), ms.y, 2, 1, P.rockDk);
  r.rect(X(ms.x), ms.y + 1, 1, 6, P.rockLit);
  r.set(X(ms.x + 1), ms.y, P.rockHi);
  r.rect(X(ms.x + 1), ms.y + 3, 2, 1, P.rock);
  for (const w of ws.windows) r.rect(X(w.x), w.y, w.w, w.h, P.dark);
  return r;
}

// --- light: halos for the glow layer -----------------------------------------

/** A dithered, stepped radial falloff in `color`, premultiplied for an additive layer. */
function paintHalo(rad, color, steps = 4) {
  const n = parseInt(color.slice(1), 16), cr = n >> 16, cg = (n >> 8) & 255, cb = n & 255;
  const r = new Raster(rad * 2 + 1, rad * 2 + 1);
  for (let y = 0; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) {
      const d = Math.hypot(x - rad, y - rad) / rad;
      if (d >= 1) continue;
      const f = (1 - d) * (1 - d) * steps;
      const q = Math.floor(f) + (f - Math.floor(f) > bay(x, y) ? 1 : 0);
      if (q <= 0) continue;
      const k = q / steps;
      r.set(x, y, (0xff000000 | (Math.round(cb * k) << 16) | (Math.round(cg * k) << 8) | Math.round(cr * k)) >>> 0);
    }
  }
  return r;
}

// ===========================================================================
// The living scene
// ===========================================================================

const smooth = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const padFor = (depth) => Math.ceil(PAN * depth) + 1;

/** A prerendered depth: dusk and night pictures and the cached cross-fade between them. */
class Depth {
  constructor(dusk, night) { this.dusk = dusk.canvas(); this.night = night.canvas(); this.mix = null; this.step = -1; }
  image(n) {
    const step = Math.round(n * 16);
    if (step <= 0) return this.dusk;
    if (step >= 16) return this.night;
    if (step !== this.step) {
      if (!this.mix) { this.mix = document.createElement('canvas'); this.mix.width = this.dusk.width; this.mix.height = this.dusk.height; }
      const g = this.mix.getContext('2d');
      g.globalAlpha = 1; g.clearRect(0, 0, this.mix.width, this.mix.height);
      g.drawImage(this.dusk, 0, 0);
      g.globalAlpha = step / 16; g.drawImage(this.night, 0, 0); g.globalAlpha = 1;
      this.step = step;
    }
    return this.mix;
  }
}

export class TitleVista {
  constructor() {
    this.t = 0;
    this.night = 0;       // 0 dusk .. 1 full night, eased by the scene
    this.ready = false;
  }

  /** Paint every depth. Deferred to the first draw so a headless boot pays nothing. */
  _build() {
    this.ready = true;
    if (!CAN) return;
    this.pads = { hills: padFor(HILLS.depth), sea: padFor(SEA.depth), city: padFor(CITY.depth), near: padFor(NEAR.depth) };
    this.sky = new Depth(paintSky(false), paintSky(true));
    this.clouds = {};
    for (const k of Object.keys(CLOUDS)) this.clouds[k] = new Depth(paintClouds(k, false), paintClouds(k, true));
    this.hills = new Depth(paintHills(false, this.pads.hills), paintHills(true, this.pads.hills));
    this.sea = new Depth(paintSea(false, this.pads.sea), paintSea(true, this.pads.sea));
    const cd = paintCity(false, this.pads.city), cn = paintCity(true, this.pads.city);
    this.city = new Depth(cd.r, cn.r);
    this.cityWindows = cd.windows;
    // The near depth only has pixels below its roof line: blit just those rows.
    this.near = new Depth(paintNear(false, this.pads.near).rows(NEAR.top), paintNear(true, this.pads.near).rows(NEAR.top));
    this.sun = paintSun().canvas();
    this.moon = paintMoon().canvas();
    this.cog = new Depth(sprite(COG, COG_PAL.dusk), sprite(COG, COG_PAL.night));
    this.cogFlag = [sprite(['PP', 'p.'], COG_PAL.dusk).canvas(), sprite(['.P', 'pp'], COG_PAL.dusk).canvas()];
    this.halo = {
      sun: paintHalo(46, '#a8502a', 5).canvas(),
      fire: paintHalo(18, '#c07030', 4).canvas(),
      small: paintHalo(6, '#a06028', 3).canvas(),
      moon: paintHalo(30, '#343c64', 4).canvas(),
    };

    const rng = makeRNG('title-vista');
    this.stars = [];
    for (let i = 0; i < 140; i++) {
      const y = Math.round(Math.pow(rng.next(), 1.5) * 128);
      this.stars.push({
        x: rng.int(0, W - 1), y, th: rng.float(0, 1), sp: rng.float(0.7, 2.6), ph: rng.float(0, 6.28),
        big: rng.chance(0.06), c: rng.pick(['#fff4dc', '#d4deff', '#ffe2b8', '#ffffff']),
      });
    }
    this.glints = [];
    for (let i = 0; i < 64; i++) this.glints.push(this._glint(rng, true));
    this.gulls = [];
    for (let i = 0; i < 5; i++) {
      this.gulls.push({
        cx: rng.pick([150, 205, 238]) + rng.int(-10, 10), cy: rng.int(96, 128), rx: rng.int(14, 34), ry: rng.int(4, 9),
        w: rng.float(0.32, 0.55) * rng.sign(), ph: rng.float(0, 6.28), flap: rng.float(5, 7.5),
      });
    }
    this.smoke = [];
    for (let i = 0; i < 16; i++) this.smoke.push(this._puff(rng, rng.float(0, 1)));
    this._rng = rng;
    // The cog starts in the open water between the menu and the headland.
    this.cogX = 178;
  }

  _glint(rng, seeded) {
    const v = Math.pow(rng.next(), 1.6);
    return { v, u: rng.gauss(0, 0.45), len: 1 + Math.round(v * rng.float(0, 4)), life: seeded ? rng.float(0, 1) : 0, dur: rng.float(0.35, 1.1), moon: false };
  }

  _puff(rng, age) {
    return { age, life: rng.float(3.5, 6), dx: rng.float(-0.5, 0.5), s: rng.chance(0.4) ? 3 : 2 };
  }

  update(dt) {
    if (!this.ready) return;
    this.t += dt;
    if (!CAN) return;
    const r = this._rng, n = this.night;
    for (const gl of this.glints) {
      gl.life += dt / gl.dur;
      if (gl.life >= 1) { Object.assign(gl, this._glint(r, false)); gl.moon = r.next() < n; }
    }
    for (const p of this.smoke) { p.age += dt / p.life; if (p.age >= 1) Object.assign(p, this._puff(r, 0)); }
    this.cogX += dt * 0.55;
    if (this.cogX > 262) this.cogX = -16;
  }

  /**
   * Paint the vista into its layers. `onNear(g, x, y)` draws the traveller on the
   * near layer at the foot of the road, before the light goes over it; the caller
   * then draws the interface.
   */
  draw(onNear) {
    if (!this.ready) this._build();
    if (!CAN) return;
    const n = this.night, t = this.t;
    const cam = Math.sin(t * Math.PI * 2 / PAN_PERIOD) * PAN;
    const shift = (depth) => -Math.round(cam * depth);
    const moonUp = smooth(0.25, 1, n);
    // Selune rises clear of the logotype, in the corner of sky over the mountains.
    const moonX = 374, moonY = Math.round(172 - moonUp * 144);
    const sunY = Math.round(HORIZON + 2 + n * 26);

    // --- sky: bands, stars, the sun going down, Selune coming up -----------
    let g = Stage.ctx('title-sky');
    g.drawImage(this.sky.image(n), 0, 0);
    for (const s of this.stars) {
      // A star shows once the sky behind it is dark enough: the zenith at dusk,
      // everywhere by full night.
      const dark = n + (1 - n) * Math.max(0, 1 - s.y / 70) * 0.55;
      const a = Math.min(1, (dark - s.th) * 3);
      if (a <= 0) continue;
      const tw = 0.62 + 0.38 * Math.sin(t * s.sp + s.ph);
      g.globalAlpha = a * tw;
      g.fillStyle = s.c;
      g.fillRect(s.x, s.y, 1, 1);
      if (s.big && a * tw > 0.7) {
        g.globalAlpha = a * tw * 0.45;
        g.fillRect(s.x - 1, s.y, 3, 1); g.fillRect(s.x, s.y - 1, 1, 3);
      }
    }
    g.globalAlpha = 1;
    if (sunY < HORIZON + 13) g.drawImage(this.sun, SUN_X - 12, sunY - 12);
    if (moonUp > 0) {
      g.drawImage(this.moon, moonX - 9, moonY - 9);
      g.fillStyle = '#eef0ff';
      for (let i = 0; i < 7; i++) {
        // Selune's Tears trail the Moonmaiden down the sky.
        const a = 1.05 + i * 0.07, d = 16 + i * 5;
        g.globalAlpha = moonUp * (0.55 + 0.35 * Math.sin(t * 1.4 + i * 1.7));
        g.fillRect(Math.round(moonX + Math.cos(a) * d), Math.round(moonY + Math.sin(a) * d * 0.7), i < 2 ? 2 : 1, i < 2 ? 2 : 1);
      }
      g.globalAlpha = 1;
    }

    // --- clouds: two strips on their own winds ------------------------------
    g = Stage.ctx('title-clouds');
    for (const k of Object.keys(CLOUDS)) {
      const c = CLOUDS[k], img = this.clouds[k].image(n);
      const off = Math.round(((t * c.speed + cam * c.depth) % CLOUD_W + CLOUD_W) % CLOUD_W);
      g.drawImage(img, -off, c.y); g.drawImage(img, CLOUD_W - off, c.y);
    }

    // --- the Sword Mountains --------------------------------------------------
    g = Stage.ctx('title-hills');
    g.drawImage(this.hills.image(n), shift(HILLS.depth) - this.pads.hills, HILLS.y);

    // --- the sea: glints on the sun path (the moon's by night), a cog ----------
    g = Stage.ctx('title-sea');
    const ss = shift(SEA.depth);
    g.drawImage(this.sea.image(n), ss - this.pads.sea, HORIZON);
    const sunLit = 1 - smooth(0, 0.45, n);
    for (const gl of this.glints) {
      const a = Math.sin(Math.PI * gl.life);
      if (a < 0.35) continue;
      const y = HORIZON + 1 + Math.round(gl.v * (SEA.h - 3));
      if (gl.moon) {
        if (moonUp < 0.3) continue;
        const x = Math.round(214 + gl.u * 40 + gl.v * 20) + ss;
        g.fillStyle = a > 0.8 ? '#e6ecff' : '#7d8cc4';
        g.fillRect(x, y, gl.len, 1);
      } else {
        if (sunLit <= 0.05 || hash(gl.len, y, Math.round(gl.dur * 97)) > sunLit) continue;
        const x = Math.round(SUN_X + gl.u * (5 + gl.v * 64)) + ss;
        g.fillStyle = a > 0.8 ? '#fff6cc' : '#ffc27a';
        g.fillRect(x, y, gl.len + (a > 0.8 ? 1 : 0), 1);
      }
    }
    // Neverwinter's lit windows, broken into the swell under the headland.
    const cs = shift(CITY.depth);
    const lamp = (w) => 0.2 + n * 1.05 - w.th;
    if (n > 0.15) {
      g.fillStyle = '#e8a050';
      for (const w of this.cityWindows) {
        if (lamp(w) < 0.3) continue;
        for (let k = 0; k < 3; k++) {
          const wob = Math.round(Math.sin(t * 2.3 + w.x * 0.7 + k * 1.9));
          g.globalAlpha = n * (0.55 - k * 0.15);
          g.fillRect(w.x + cs + wob, HORIZON + 2 + k * 2 + ((w.x >> 2) & 1), 1 + (k === 0 ? 1 : 0), 1);
        }
      }
      g.globalAlpha = 1;
    }
    const bob = Math.sin(t * 1.3) > 0.4 ? 1 : 0;
    const cx = Math.round(this.cogX) + ss, cy = 147 + bob;
    const cog = this.cog.image(n);
    g.drawImage(cog, cx, cy);
    g.drawImage(this.cogFlag[Math.floor(t * 3) % 2], cx + 7, cy);
    g.fillStyle = n > 0.5 ? '#0c1230' : '#3a2450';
    for (let k = 0; k < 3; k++) g.fillRect(cx + 2 + k * 2 + (Math.sin(t * 2 + k) > 0 ? 1 : 0), cy + 15 + k, 8 - k * 2, 1);

    // --- Neverwinter: walls, spires, windows lighting one by one ---------------
    g = Stage.ctx('title-city');
    g.drawImage(this.city.image(n), cs - this.pads.city, CITY.y);
    const lit = [];
    for (const w of this.cityWindows) {
      // A few are lit already at sundown; the rest follow as the dark comes on.
      const on = lamp(w);
      if (on <= 0) continue;
      const flick = hash(w.x, w.y, Math.floor(t * 2)) < 0.02 ? 0.6 : 1;
      g.fillStyle = on > 0.25 && flick === 1 ? '#ffd47c' : '#c9803e';
      g.fillRect(w.x + cs, w.y, 1, 1);
      lit.push(w);
    }

    // --- gulls wheeling over the water -------------------------------------------
    const gullsA = 1 - smooth(0.4, 0.8, n);
    if (gullsA > 0) {
      g = Stage.ctx('title-birds');
      g.fillStyle = '#2a1830';
      g.globalAlpha = gullsA;
      const bs = shift(0.5);
      for (const b of this.gulls) {
        const a = b.ph + t * b.w;
        const x = Math.round(b.cx + Math.cos(a) * b.rx) + bs, y = Math.round(b.cy + Math.sin(a) * b.ry);
        // Glide on the way down, flap on the way up.
        const f = Math.sin(a) * Math.sign(b.w) > 0.2 ? 1 : Math.floor((t * b.flap + b.ph) % 3);
        g.fillRect(x - 1, y, 3, 1);
        if (f === 0) { g.fillRect(x - 2, y - 1, 1, 1); g.fillRect(x + 2, y - 1, 1, 1); }
        else if (f === 1) { g.fillRect(x - 2, y, 1, 1); g.fillRect(x + 2, y, 1, 1); }
        else { g.fillRect(x - 2, y + 1, 1, 1); g.fillRect(x + 2, y + 1, 1, 1); }
      }
      g.globalAlpha = 1;
    }

    // --- the near cliff: surf, the waystation's lights, smoke, the traveller ------
    g = Stage.ctx('title-near');
    const ns = shift(NEAR.depth);
    const ws = WAYSTATION;
    g.drawImage(this.near.image(n), ns - this.pads.near, NEAR.top);
    for (let k = 0; k < 7; k++) {
      // Surf climbing the foot of the cliff and falling back.
      const y = ws.surf + k * 3;
      const e = Math.round(cliffEdge(y) - 6 - (y - 176) * 0.22) + ns;
      const reach = Math.max(0, Math.round(3 + Math.sin(t * 1.1 - k * 0.6) * 4));
      g.fillStyle = n > 0.5 ? '#8f9cd0' : '#f6d2b4';
      g.fillRect(e - reach, y, reach, 1);
      if (reach > 4) g.fillRect(e - reach - 3, y + 1, 2, 1);
    }
    for (const w of ws.windows) {
      g.fillStyle = '#ffcc66';
      g.fillRect(w.x + ns, w.y, w.w, w.h);
      g.fillStyle = '#e8963c';
      g.fillRect(w.x + ns, w.y + w.h - 1, w.w, 1);
    }
    const d = ws.door;
    g.fillStyle = '#f0a444'; g.fillRect(d.x + 1 + ns, d.y + 1, d.w - 2, d.h - 1);
    g.fillStyle = '#ffd88a'; g.fillRect(d.x + 2 + ns, d.y + 2, 2, d.h - 2);
    const flame = (x, y, seed) => {
      const f = hash(seed, Math.floor(t * 9), 5);
      const h = 3 + (f > 0.6 ? 1 : 0), sway = f < 0.25 ? -1 : f > 0.85 ? 1 : 0;
      g.fillStyle = '#e0542a'; g.fillRect(x - 1, y - h + 1, 3, h);
      g.fillStyle = '#ffa436'; g.fillRect(x + (sway > 0 ? 0 : -1) + (sway < 0 ? 0 : 0), y - h + 2, 2, h - 1);
      g.fillStyle = '#fff0b0'; g.fillRect(x, y - 1, 1, 1);
      g.fillStyle = '#ffd070'; g.fillRect(x + sway, y - h, 1, 1);
    };
    for (let i = 0; i < ws.torches.length; i++) {
      const tc = ws.torches[i];
      g.fillStyle = '#2a1a18'; g.fillRect(tc.x + ns, tc.y, 1, 4);
      flame(tc.x + ns, tc.y, i + 1);
    }
    const L = ws.lantern;
    g.fillStyle = '#2a1a18'; g.fillRect(L.x - 1 + ns, L.y - 1, 3, 1);
    g.fillStyle = '#ffdf8e'; g.fillRect(L.x - 1 + ns, L.y, 3, 3);
    g.fillStyle = '#fff6d0'; g.fillRect(L.x + ns, L.y + 1, 1, 1);
    for (const p of this.smoke) {
      const a = p.age;
      const x = Math.round(ws.chimney.x + a * 22 + Math.sin(a * 6 + p.dx * 9) * 2) + ns;
      const y = Math.round(ws.chimney.y - a * 30);
      g.globalAlpha = (1 - a) * 0.55;
      g.fillStyle = n > 0.5 ? '#2b3052' : '#6a4a60';
      g.fillRect(x, y, p.s + Math.round(a * 2), p.s);
    }
    g.globalAlpha = 1;
    if (onNear) onNear(g, ws.hero.x + ns, ws.hero.y);

    // --- light ---------------------------------------------------------------------
    g = Stage.ctx('glow');
    if (sunLit > 0.02) {
      g.globalAlpha = sunLit * 0.55;
      g.drawImage(this.halo.sun, SUN_X - 46, Math.min(sunY, HORIZON) - 46);
    }
    if (moonUp > 0) { g.globalAlpha = moonUp * 0.8; g.drawImage(this.halo.moon, moonX - 30, moonY - 30); }
    const fireA = 0.55 + n * 0.45;
    for (let i = 0; i < ws.torches.length; i++) {
      const tc = ws.torches[i];
      g.globalAlpha = fireA * (0.8 + hash(i, Math.floor(t * 9), 9) * 0.2);
      g.drawImage(this.halo.fire, tc.x + ns - 18, tc.y - 20);
    }
    g.globalAlpha = fireA; g.drawImage(this.halo.fire, L.x + ns - 18, L.y - 17);
    g.globalAlpha = 0.5 + n * 0.5;
    for (const w of ws.windows) g.drawImage(this.halo.small, w.x + ns + (w.w >> 1) - 6, w.y + (w.h >> 1) - 6);
    g.globalAlpha = n * 0.6;
    if (n > 0.05) for (const w of lit) g.drawImage(this.halo.small, w.x + cs - 6, w.y - 6);
    g.globalAlpha = 1;
  }
}
