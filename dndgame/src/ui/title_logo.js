// ui/title_logo.js — the logotype: SWORD COAST in raised gilt Lombardic capitals, a compass rose for the O, a sword for the rule.
//
// The letters are not a font. Each is built the way a scribe builds a Lombardic
// capital — swelling strokes that thin to hairlines, a pen slit down the heavy
// side, hairline serifs with drooping ends — as a handful of strokes swept with
// a round nib of varying radius, rasterised once at the fine grid (1 px = half a
// logical px) with hard pixel-centre edges. The O of COAST is a compass rose
// in its ring; a sword laid under the words is the rule; CHRONICLES is the same
// alphabet at half size. Then the whole mask is gilded in one pass: a burnished
// ramp that dips to a dark reflected horizon below the middle of the letter,
// a bright bevel on the upper-left edges and a dark one on the lower right, a
// bronze extrusion down and to the right, and a keyline round everything.
// A frame costs one drawImage, plus a narrow sheen when the shine sweeps.

import { Raster, hex, bay } from './title_vista.js';

const CAN = typeof document !== 'undefined' && typeof document.createElement === 'function';

// ===========================================================================
// The pen
// ===========================================================================

/** Material ids in the mask. */
const GOLD = 1, JEWEL = 3, STEEL = 4, GRIP = 5, FULLER = 6, GOLD_DK = 7, SILVER = 8, SILVER_DK = 9, ENAMEL = 10;

function bez(P, t) {
  let pts = P;
  while (pts.length > 1) {
    const nx = [];
    for (let i = 0; i + 1 < pts.length; i++) nx.push([pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t]);
    pts = nx;
  }
  return pts[0];
}
/** A radius profile: one number, or values spaced evenly along the stroke, eased between. */
function profile(r, t) {
  if (typeof r === 'number') return r;
  const f = t * (r.length - 1), i = Math.min(r.length - 2, Math.floor(f)), u = f - i;
  const e = u * u * (3 - 2 * u);
  return r[i] + (r[i + 1] - r[i]) * e;
}

/** Draws glyph strokes into a material mask, in glyph units (cap height 44) at origin/scale. */
class Pen {
  /** `ids` (optional) records which line of the logo drew each pixel (`line`). */
  constructor(mask, ids = null) { this.m = mask; this.ids = ids; this.line = 0; this.ox = 0; this.oy = 0; this.s = 1; this.v = GOLD; }
  at(ox, oy, s) { this.ox = ox; this.oy = oy; this.s = s; return this; }
  X(x) { return this.ox + x * this.s; }
  Y(y) { return this.oy + y * this.s; }
  put(i, j) { this.m.set(i, j, this.v); if (this.ids) this.ids.set(i, j, this.line); }
  /** Paint (or with erase(), clear) everything drawn inside fn in material `v`. */
  as(v, fn) { const o = this.v; this.v = v; try { fn(); } finally { this.v = o; } }
  erase(fn) { this.as(0, fn); }
  disc(x, y, r) {
    const r2 = r * r;
    for (let j = Math.floor(y - r - 1); j <= Math.ceil(y + r); j++) {
      for (let i = Math.floor(x - r - 1); i <= Math.ceil(x + r); i++) {
        const dx = i + 0.5 - x, dy = j + 0.5 - y;
        if (dx * dx + dy * dy <= r2) this.put(i, j);
      }
    }
    // A hairline never breaks, however thin it is drawn.
    if (r < 0.75) this.put(Math.floor(x), Math.floor(y));
  }
  /** A stroke along a bezier (2 points = line, 3 = quadratic, 4 = cubic), nib radius by `r`. */
  sw(pts, r) {
    const P = pts.map(([x, y]) => [this.X(x), this.Y(y)]);
    let len = 0;
    for (let i = 0; i + 1 < P.length; i++) len += Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]);
    const n = Math.max(2, Math.ceil(len * 4));
    for (let k = 0; k <= n; k++) {
      const t = k / n, [x, y] = bez(P, t);
      this.disc(x, y, Math.max(0.55, profile(r, t) * this.s));
    }
  }
  el(cx, cy, rx, ry) {
    const X = this.X(cx), Y = this.Y(cy), RX = rx * this.s, RY = ry * this.s;
    for (let j = Math.floor(Y - RY); j <= Math.ceil(Y + RY); j++) {
      for (let i = Math.floor(X - RX); i <= Math.ceil(X + RX); i++) {
        const dx = (i + 0.5 - X) / RX, dy = (j + 0.5 - Y) / RY;
        if (dx * dx + dy * dy <= 1) this.put(i, j);
      }
    }
  }
  rect(x, y, w, h) { this.poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]); }
  poly(pts) {
    const P = pts.map(([x, y]) => [this.X(x), this.Y(y)]);
    let y0 = Infinity, y1 = -Infinity;
    for (const [, y] of P) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    for (let j = Math.floor(y0); j <= Math.ceil(y1); j++) {
      const sy = j + 0.5, xs = [];
      for (let i = 0; i < P.length; i++) {
        const [ax, ay] = P[i], [bx, by] = P[(i + 1) % P.length];
        if ((ay <= sy && by > sy) || (by <= sy && ay > sy)) xs.push(ax + (sy - ay) / (by - ay) * (bx - ax));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let i = Math.ceil(xs[k] - 0.5); i <= Math.floor(xs[k + 1] - 0.5); i++) this.put(i, j);
      }
    }
  }
}

// ===========================================================================
// The alphabet: only the letters the title needs. Glyph units, cap height 44,
// top at 0, baseline at 44; `w` is the advance before tracking.
// ===========================================================================

/** A hairline serif bar whose ends droop toward the stem, top or bottom. */
function serif(p, x0, x1, top) {
  const y = top ? 1.3 : 42.7, d = top ? 4.5 : -4.5;
  p.sw([[x0, y], [x1, y]], 1.2);
  p.sw([[x0, y], [x0 + 0.6, y + d]], [1.2, 0.6]);
  p.sw([[x1, y], [x1 - 0.6, y + d]], [1.2, 0.6]);
}
/** A stem that swells toward its middle, with the pen slit down it. */
function stem(p, x, slit = true) {
  p.sw([[x, 1.5], [x, 22], [x, 42.5]], [3.2, 5, 3.2]);
  if (slit) p.erase(() => p.el(x - 0.2, 22, 0.8, 9));
}
/** The round bowl shared by C and E: a heavy left side, open on the right, the arms ending in beaks. */
function roundBowl(p) {
  p.el(20, 22, 19.5, 22.5);
  p.erase(() => {
    p.el(23.5, 22, 12.5, 16.5);
    p.poly([[22, 22], [46, 2], [46, 42]]);
    p.el(5.3, 22, 0.8, 10);
  });
  p.poly([[28, 0.4], [35.5, 0.4], [35.5, 11], [31, 5]]);
  p.poly([[28, 43.6], [35.5, 43.6], [35.5, 33], [31, 39]]);
}

const GLYPHS = {
  ' ': { w: 14, draw() {} },
  A: { w: 42, draw(p) {
    p.sw([[3, 42.5], [8, 24], [19, 3]], [1.1, 1.3]);
    p.sw([[18.5, 2.5], [25, 20], [33.5, 42.5]], [3, 5.2, 3.2]);
    p.erase(() => p.el(26, 22, 0.8, 8));
    p.sw([[8.5, 29], [30, 29]], 1.1);
    p.sw([[12, 1.3], [27, 1.3]], 1.4);
    serif(p, 0, 8, false); serif(p, 27, 41, false);
  } },
  C: { w: 38, draw(p) { roundBowl(p); } },
  D: { w: 42, draw(p) {
    p.el(19, 22, 21.5, 22.5);
    p.erase(() => { p.el(18, 22, 11.5, 16.5); p.rect(-4, -2, 12, 50); p.el(35.5, 22, 0.8, 9); });
    stem(p, 8, false);
    serif(p, 1, 12, true); serif(p, 1, 12, false);
  } },
  E: { w: 38, draw(p) {
    roundBowl(p);
    p.sw([[8, 21.5], [27, 21.5]], 1.4);
    p.sw([[27, 21.5], [29, 17.5]], [1.4, 0.6]);
    p.sw([[27, 21.5], [29, 25.5]], [1.4, 0.6]);
  } },
  H: { w: 43, draw(p) {
    stem(p, 8); stem(p, 34);
    p.sw([[8, 22], [34, 22]], 1.3);
    serif(p, 1, 15, true); serif(p, 27, 41, true); serif(p, 1, 15, false); serif(p, 27, 41, false);
  } },
  I: { w: 18, draw(p) { stem(p, 8.5); serif(p, 1.5, 15.5, true); serif(p, 1.5, 15.5, false); } },
  L: { w: 34, draw(p) {
    p.sw([[8, 1.5], [8, 22], [8, 40]], [3.2, 5, 3.6]);
    p.erase(() => p.el(7.8, 20, 0.8, 8));
    p.sw([[8, 40], [16, 44.5], [30, 38]], [3.6, 2.4, 1.2]);
    p.poly([[27, 39], [32, 30], [33, 44], [29, 44]]);
    serif(p, 1, 15, true);
  } },
  N: { w: 43, draw(p) {
    p.sw([[7, 2], [7, 42.5]], 1.2);
    p.sw([[7, 2], [21, 22], [35, 42]], [2.8, 5.2, 2.8]);
    p.sw([[35, 1.5], [35, 43]], 1.2);
    serif(p, 0, 12, true); serif(p, 29, 42, true); serif(p, 0, 14, false);
  } },
  O: { w: 42, draw(p) {
    p.el(21, 22, 20, 22.5);
    p.erase(() => { p.el(21.5, 21.5, 10.5, 16.5); p.el(5.4, 22, 0.8, 10); p.el(36.6, 22, 0.8, 10); });
  } },
  R: { w: 41, draw(p) {
    p.el(19, 12.5, 15.5, 12);
    p.erase(() => { p.el(17.5, 12.5, 7.5, 6.6); p.rect(-2, -2, 10, 30); });
    stem(p, 8);
    p.sw([[14, 23.5], [28, 23], [31, 42]], [1.6, 4.6, 2.6]);
    p.sw([[31, 42], [35, 45], [39, 37]], [2.6, 0.9]);
    serif(p, 1, 13, true); serif(p, 0, 16, false);
  } },
  S: { w: 33, draw(p) {
    p.sw([[27, 6], [22, -1.5], [3, -0.5], [5, 12]], [0.9, 2.6, 3.8]);
    p.sw([[5, 12], [6, 21], [27, 22], [27, 32]], [3.8, 5.6, 3.8]);
    p.sw([[27, 32], [28, 45.5], [7, 45.5], [4, 37]], [3.8, 2.6, 0.9]);
    p.poly([[24.5, 0.5], [30.5, 0], [30.5, 11], [26.5, 7]]);
    p.poly([[2, 33], [6.5, 37], [6.5, 44], [2, 44]]);
  } },
  T: { w: 39, draw(p) {
    p.sw([[3, 9], [9, 0.5], [29, 0.5], [35, 9]], [2.4, 2, 2, 2.4]);
    p.poly([[0.5, 5], [5, 4], [3, 15]]);
    p.poly([[37.5, 5], [33, 4], [35, 15]]);
    p.sw([[19, 2], [15, 24], [17, 38], [27, 42.5]], [3.8, 5.2, 3.6, 1.3]);
    p.erase(() => p.el(16.4, 22, 0.8, 8));
    p.sw([[27, 42.5], [31, 43.5], [32.5, 37]], [1.3, 0.8]);
  } },
  W: { w: 56, draw(p) {
    p.sw([[5, 2], [8, 24], [16.5, 42.5]], [2.6, 5, 2.2]);
    p.erase(() => p.el(8.6, 21, 0.8, 8));
    p.sw([[16.5, 42.5], [22, 25], [27.5, 7]], 1.1);
    p.sw([[26.5, 5], [30, 25], [38.5, 42.5]], [2.4, 4.8, 2.2]);
    p.sw([[38.5, 42.5], [45, 22], [50, 2]], 1.1);
    serif(p, 0, 11, true); serif(p, 44, 55, true);
  } },
  /** The compass rose that stands for the O of COAST: a gilt ring round a lapis card, gilt and silver points, a garnet at the heart. */
  '*': { w: 46, draw(p) {
    const cx = 23, cy = 22;
    p.el(cx, cy, 20.5, 22.5);
    p.as(ENAMEL, () => p.el(cx, cy, 13.5, 15.5));
    // Half of each point catches the light, half is in shadow, like an engraved card.
    const point = (ang, len, half, light, dark) => {
      const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx;
      const tip = [cx + dx * len, cy + dy * len];
      p.as(light, () => p.poly([[cx, cy], tip, [cx + nx * half, cy + ny * half]]));
      p.as(dark, () => p.poly([[cx, cy], tip, [cx - nx * half, cy - ny * half]]));
    };
    for (let k = 0; k < 4; k++) point(Math.PI / 4 + k * Math.PI / 2, 15.5, 4.6, SILVER, SILVER_DK);
    for (let k = 0; k < 4; k++) point(-Math.PI / 2 + k * Math.PI / 2, k % 2 ? 25 : 29, 6.5, GOLD, GOLD_DK);
    p.as(JEWEL, () => p.el(cx, cy, 3.4, 3.4));
  } },
};

// ===========================================================================
// Layout: every line in fine px inside the logo raster
// ===========================================================================

const LINE1 = 'SWORD C*AST', LINE2 = 'CHRONICLES';
/** Glyph scale of SWORD COAST (cap height 50) and CHRONICLES (22). */
const BIG = 50 / 44, SMALL = 0.5;
const TRACK1 = 5, TRACK2 = 7;
const PAD = 8;                       // room round the art for the keyline and extrusion
const TOP1 = 13, CAP1 = 50;          // SWORD COAST: cap top and height
const BLADE_Y = TOP1 + CAP1 + 12;    // the sword's centre line
const TOP2 = BLADE_Y + 15, CAP2 = 44 * SMALL;
const LOGO_H = TOP2 + CAP2 + PAD + 4;

function lineWidth(s, track, scale) {
  let w = 0;
  for (const ch of s) w += GLYPHS[ch].w * scale + track;
  return w - track;
}
/** Set a line of glyphs; returns where each character started. */
function setLine(p, s, x, y, track, scale) {
  const at = [];
  for (const ch of s) { const g = GLYPHS[ch]; at.push(x); g.draw(p.at(x, y, scale)); x += g.w * scale + track; }
  return at;
}

/** The sword: garnet pommel, wrapped grip, gilt cross, and a fullered blade tapering to the point. */
function drawSword(p, x0, x1, cy) {
  p.at(0, 0, 1);
  const guard = x0 + 38;
  p.as(STEEL, () => {
    p.poly([[guard + 2, cy - 5], [x1 - 34, cy - 4], [x1, cy + 0.5], [x1 - 34, cy + 4], [guard + 2, cy + 5]]);
  });
  p.as(FULLER, () => p.poly([[guard + 8, cy - 1], [x1 - 90, cy - 0.6], [x1 - 70, cy], [x1 - 90, cy + 0.6], [guard + 8, cy + 1]]));
  p.as(GRIP, () => p.rect(x0 + 9, cy - 3, guard - x0 - 11, 6));
  p.as(GOLD, () => {
    // The cross: a bar with quillons that flare and curl toward the blade.
    p.sw([[guard, cy - 12], [guard - 1.5, cy], [guard, cy + 12]], [1.6, 2.6, 1.6]);
    p.sw([[guard, cy - 12], [guard + 4, cy - 15]], [1.6, 0.8]);
    p.sw([[guard, cy + 12], [guard + 4, cy + 15]], [1.6, 0.8]);
    p.rect(guard - 3, cy - 4, 6, 8);
    p.rect(x0 + 7, cy - 4, 3, 8);
    p.el(x0 + 3.5, cy, 5.5, 5.5);
  });
  p.as(JEWEL, () => p.el(x0 + 3.5, cy, 2.6, 2.6));
  p.as(JEWEL, () => p.el(guard, cy, 1.6, 1.6));
}

/** Small lozenges on hairlines either side of CHRONICLES. */
function drawFlourish(p, x, cy, dir) {
  p.at(0, 0, 1);
  p.as(GOLD, () => {
    p.sw([[x, cy], [x + dir * 34, cy]], [1.1, 0.6]);
    p.poly([[x - dir * 1, cy], [x + dir * 5, cy - 4.5], [x + dir * 11, cy], [x + dir * 5, cy + 4.5]]);
  });
  p.as(JEWEL, () => p.poly([[x + dir * 2.5, cy], [x + dir * 5, cy - 2], [x + dir * 7.5, cy], [x + dir * 5, cy + 2]]));
}

// ===========================================================================
// Gilding
// ===========================================================================

const RAMPS = {
  gold: ['#3e1f0a', '#6e3e12', '#a8681e', '#d69a36', '#f2cb66', '#fff0b4'].map(hex),
  goldDk: ['#2c1408', '#4e2a0e', '#7a4816', '#a0682a', '#c48a3c', '#e0b060'].map(hex),
  steel: ['#1e2232', '#3a4258', '#66728c', '#9aa6bc', '#ccd6e6', '#f6faff'].map(hex),
  lapis: ['#0c1238', '#18286a', '#2a44a0', '#4a6ccc', '#7898e8', '#b4c8ff'].map(hex),
  jewel: ['#2a0608', '#5a1010', '#8e1c18', '#c83a2a', '#f07a5a', '#ffd0b8'].map(hex),
  grip: ['#1c0a08', '#3a1610', '#5a2418', '#7e3622', '#a04a2c', '#c4684a'].map(hex),
};
const KEY = hex('#1a0b06'), HALO = 0x66000000 >>> 0;
const EXTRUDE = ['#7a4414', '#5c3010', '#43220c', '#301708'].map(hex);

/**
 * Pick from a 6-step ramp by tone 0..1. Only the middle of each step is
 * dithered into the next, so metal reads as flat burnished planes with a
 * narrow stipple where they meet, not as an all-over checkerboard.
 */
function tone(ramp, t, x, y) {
  const f = Math.max(0, Math.min(1, t)) * (ramp.length - 1);
  const i = Math.floor(f);
  if (i >= ramp.length - 1) return ramp[i];
  const u = (f - i - 0.3) / 0.4;
  return u > bay(x, y) ? ramp[i + 1] : ramp[i];
}
/** Burnished gold: light at the top, a dark reflected horizon just below the middle, light again under it. */
function burnish(v) {
  const K = [[0, 0.9], [0.3, 0.74], [0.48, 0.56], [0.53, 0.3], [0.6, 0.5], [0.78, 0.7], [1, 0.46]];
  for (let i = 1; i < K.length; i++) {
    if (v <= K[i][0]) { const [a, ta] = K[i - 1], [b, tb] = K[i]; return ta + (tb - ta) * (v - a) / (b - a); }
  }
  return K[K.length - 1][1];
}

function gild(m, ids, lines) {
  const out = new Raster(m.w, m.h);
  const on = (x, y) => m.get(x, y) !== 0;
  // Extrusion first, keyline round face + extrusion, then the soft halo outside it.
  const ext = new Uint8Array(m.w * m.h);
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) {
      if (on(x, y)) continue;
      for (let k = 1; k <= 4; k++) {
        if (on(x - (k >> 1), y - k)) { ext[y * m.w + x] = k; break; }
      }
    }
  }
  const solid = (x, y) => x >= 0 && y >= 0 && x < m.w && y < m.h && (on(x, y) || ext[y * m.w + x] > 0);
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) {
      const k = ext[y * m.w + x];
      if (k) { out.set(x, y, EXTRUDE[k - 1]); continue; }
      if (on(x, y)) continue;
      let near = false, far = false;
      for (let j = -2; j <= 2 && !near; j++) {
        for (let i = -2; i <= 2; i++) {
          if (!solid(x + i, y + j)) continue;
          if (Math.abs(i) <= 1 && Math.abs(j) <= 1) { near = true; break; }
          far = true;
        }
      }
      if (near) out.set(x, y, KEY);
      else if (far) out.set(x, y, HALO);
    }
  }
  // The face.
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) {
      const mat = m.get(x, y);
      if (!mat) continue;
      const L = lines[ids.get(x, y)] || lines[0];
      const lit = !on(x - 1, y) || !on(x, y - 1) || !on(x - 1, y - 1);
      const dark = !on(x + 1, y) || !on(x, y + 1) || !on(x + 1, y + 1);
      const inner = !lit && (!on(x - 2, y - 2) || !on(x - 2, y) || !on(x, y - 2));
      let t;
      if (mat === GOLD || mat === GOLD_DK) {
        t = burnish((y - L.top) / L.cap) + (mat === GOLD_DK ? -0.28 : 0);
        t += lit ? 0.34 : inner ? 0.14 : dark ? -0.36 : 0;
        out.set(x, y, tone(mat === GOLD_DK ? RAMPS.goldDk : RAMPS.gold, t, x, y));
      } else if (mat === STEEL || mat === FULLER) {
        const blade = L.blade;
        const v = blade ? (y - (blade - 5)) / 10 : 0.5;
        t = mat === FULLER ? 0.3 : v < 0.12 ? 1 : v < 0.5 ? 0.78 : v < 0.8 ? 0.55 : 0.36;
        t += lit ? 0.12 : dark ? -0.2 : 0;
        out.set(x, y, tone(RAMPS.steel, t, x, y));
      } else if (mat === SILVER || mat === SILVER_DK) {
        out.set(x, y, tone(RAMPS.steel, (mat === SILVER ? 0.86 : 0.5) + (lit ? 0.14 : dark ? -0.2 : 0), x, y));
      } else if (mat === ENAMEL) {
        // The card of the rose: deep lapis, lighter toward the upper left.
        const d = (x - L.ex) * 0.7 + (y - L.ey);
        out.set(x, y, tone(RAMPS.lapis, 0.36 - d / 60 + (dark ? -0.12 : 0), x, y));
      } else if (mat === JEWEL) {
        out.set(x, y, tone(RAMPS.jewel, lit ? 0.95 : dark ? 0.35 : 0.6, x, y));
      } else if (mat === GRIP) {
        // Cord wound diagonally round the grip.
        const wrap = ((x + y) % 4) < 2;
        out.set(x, y, tone(RAMPS.grip, (wrap ? 0.72 : 0.4) + (lit ? 0.2 : dark ? -0.3 : 0), x, y));
      }
    }
  }
  return out;
}

// ===========================================================================
// The logo
// ===========================================================================

/** Build the logotype's pixels. Pure: runs in node for previews and tests. */
export function buildLogo() {
  const w1 = lineWidth(LINE1, TRACK1, BIG), w2 = lineWidth(LINE2, TRACK2, SMALL);
  const W = Math.ceil(w1 + PAD * 2 + 20);
  const m = new Raster(W, LOGO_H);
  const p = new Pen(m, new Raster(W, LOGO_H));
  const cx = W / 2;
  const sx0 = Math.round(cx - w1 / 2 - 8), sx1 = Math.round(cx + w1 / 2 + 8);
  // Each part of the art is gilded against its own line (where its light falls
  // from and where its horizon lies), so the pen tags every pixel with one.
  p.line = 1;
  drawSword(p, sx0, sx1, BLADE_Y);
  p.line = 0;
  const at1 = setLine(p, LINE1, Math.round(cx - w1 / 2), TOP1, TRACK1, BIG);
  p.line = 2;
  const x2 = Math.round(cx - w2 / 2);
  setLine(p, LINE2, x2, TOP2, TRACK2, SMALL);
  drawFlourish(p, x2 - 10, TOP2 + CAP2 / 2, -1);
  drawFlourish(p, x2 + w2 + 10, TOP2 + CAP2 / 2, 1);
  const rose = at1[LINE1.indexOf('*')] + 23 * BIG;
  const lines = [
    { top: TOP1, cap: CAP1, blade: BLADE_Y, ex: rose, ey: TOP1 + 22 * BIG },
    { top: BLADE_Y - 15, cap: 30, blade: BLADE_Y },
    { top: TOP2, cap: CAP2, blade: BLADE_Y },
  ];
  const face = gild(m, p.ids, lines);
  // The sheen mask: every lit metal pixel of the face.
  const sheen = new Raster(W, LOGO_H);
  const spec = hex('#fffbe8');
  for (let i = 0; i < m.px.length; i++) {
    const k = m.px[i];
    if (k === GOLD || k === STEEL) sheen.px[i] = spec;
  }
  // Where a star of light catches once the sheen has passed: the rose's north
  // point, then the sword's.
  const glints = [[Math.round(rose), Math.round(TOP1 + 22 * BIG - 29 * BIG) + 1], [sx1 - 2, BLADE_Y]];
  return { face, sheen, glints, w: W, h: LOGO_H };
}

/** Sweep timing: one pass every PERIOD seconds, lasting SWEEP. */
const PERIOD = 6.5, SWEEP = 1.4, SLOPE = 0.55;
/** The sheen: a soft band, then its bright core ([alpha, offset, width] in fine px). */
const BANDS = [[0.3, -14, 34], [0.55, -3, 11], [0.8, 0, 4]];
/** Each twinkle lasts TWINKLE seconds; the next glint point follows TWINKLE_GAP later. */
const TWINKLE = 0.45, TWINKLE_GAP = 0.3;

export class TitleLogo {
  constructor() { this.art = null; }

  _build() {
    const a = buildLogo();
    this.w = a.w; this.h = a.h;
    this.face = a.face.canvas();
    this.sheen = a.sheen.canvas();
    this.art = a;
  }

  /** Logical size (the art is authored on the fine grid). */
  get size() { if (!this.art && CAN) this._build(); return { w: (this.w || 0) / 2, h: (this.h || 0) / 2 }; }

  /**
   * Draw centred on `cx` with its top at `y` (logical px) on a fine layer: one
   * blit, plus the sheen when it is sweeping.
   */
  draw(ctx, cx, y, t) {
    if (!CAN) return;
    if (!this.art) this._build();
    const x = Math.round(cx - this.w / 4), W = this.w, H = this.h;
    ctx.drawImage(this.face, x, y, W / 2, H / 2);
    const ph = t % PERIOD;
    if (ph >= SWEEP) { this._twinkle(ctx, x, y, ph - SWEEP); return; }
    // A soft band with a bright core runs left to right, leaning like light off a blade.
    const pos = -H * SLOPE - 30 + (W + H * SLOPE + 60) * (ph / SWEEP);
    // The sheen is sliced straight out of the prerendered mask, a run of rows
    // at a time along the diagonal: no scratch canvas to fill and read back,
    // which is what costs on a software-rendered canvas.
    // Added light, not paint: the burnished dark band flares as brightly as the highlights.
    const save = ctx.globalAlpha, op = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    for (const [a, off, bw] of BANDS) {
      ctx.globalAlpha = save * a;
      for (let r = 0; r < H;) {
        const sx = Math.round(pos + (H - r) * SLOPE) + off;
        let n = 1;
        while (r + n < H && Math.round(pos + (H - r - n) * SLOPE) + off === sx) n++;
        const a0 = Math.max(0, sx), a1 = Math.min(W, sx + bw);
        if (a1 > a0) ctx.drawImage(this.sheen, a0, r, a1 - a0, n, x + a0 / 2, y + r / 2, (a1 - a0) / 2, n / 2);
        r += n;
      }
    }
    ctx.globalAlpha = save;
    ctx.globalCompositeOperation = op;
  }

  /** A four-pointed star swells and fades on each glint point in turn, `p` seconds after the sweep. */
  _twinkle(ctx, x, y, p) {
    const op = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = '#fff6d8';
    this.art.glints.forEach(([gx, gy], i) => {
      const u = (p - i * TWINKLE_GAP) / TWINKLE;
      if (u <= 0 || u >= 1) return;
      const s = Math.round(Math.sin(Math.PI * u) * 6);
      if (s < 1) return;
      const cx = x + gx / 2, cy = y + gy / 2, f = 0.5;
      ctx.fillRect(cx - s * f, cy, (s * 2 + 1) * f, f);
      ctx.fillRect(cx, cy - s * f, f, (s * 2 + 1) * f);
      if (s > 3) ctx.fillRect(cx - f, cy - f, 3 * f, 3 * f);
    });
    ctx.globalCompositeOperation = op;
  }
}
