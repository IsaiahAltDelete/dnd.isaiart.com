/* ==============================================================================
   HERALDRY.JS - a procedural coat-of-arms engine for fantasy settlements.

   Produces a structured `arms` object (field division, ordinary, charges, chief,
   bordure, crest, supporters, motto) and renders it to SVG on three surfaces:
   an achievement (shield + crest + supporters + motto scroll), a cloth banner,
   and a wax seal. All three share one renderer, so a blazon looks the same
   wherever it is drawn.

   Everything is deterministic given a seed, so a settlement's arms can be
   re-created from its name alone.
   ============================================================================== */
(function (global) {
'use strict';

/* -- 0. RANDOM --------------------------------------------------------------- */

function hashStr(s) {
  var h = 2166136261 >>> 0;
  for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function makeRng(seed) {
  var a = (typeof seed === 'string' ? hashStr(seed) : seed) >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* A tiny pick/weight toolkit bound to one rng. */
function Chance(rng) { this.r = rng; }
Chance.prototype.f = function () { return this.r(); };
Chance.prototype.int = function (min, max) { return min + Math.floor(this.r() * (max - min + 1)); };
Chance.prototype.pick = function (arr) { return arr[Math.floor(this.r() * arr.length)]; };
Chance.prototype.chance = function (p) { return this.r() < p; };
Chance.prototype.shuffle = function (arr) {
  var a = arr.slice();
  for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(this.r() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
};
Chance.prototype.some = function (arr, n) { return this.shuffle(arr).slice(0, n); };
/* weighted: takes [[value, weight], ...] */
Chance.prototype.weighted = function (pairs) {
  var total = 0, i;
  for (i = 0; i < pairs.length; i++) total += pairs[i][1];
  var roll = this.r() * total;
  for (i = 0; i < pairs.length; i++) { roll -= pairs[i][1]; if (roll <= 0) return pairs[i][0]; }
  return pairs[pairs.length - 1][0];
};

/* -- 1. TINCTURES ------------------------------------------------------------ */

/*  klass drives the rule of tincture: metal may not lie on metal, colour may
    not lie on colour. Furs are neutral and may sit against anything. */
var TINCTURE = {
  or:        { name: 'Or',           klass: 'metal',  hex: '#d9ac3c', hi: '#f7e09a', lo: '#96701d', mood: 'gold',        tone: 'bright' },
  argent:    { name: 'Argent',       klass: 'metal',  hex: '#e6e3dc', hi: '#ffffff', lo: '#aca79c', mood: 'silver',      tone: 'bright' },
  copper:    { name: 'Copper',       klass: 'metal',  hex: '#b96f3c', hi: '#e29c65', lo: '#7d4620', mood: 'copper',      tone: 'warm'   },
  gules:     { name: 'Gules',        klass: 'colour', hex: '#a5202a', hi: '#c9444c', lo: '#6c1218', mood: 'red',         tone: 'bold'   },
  azure:     { name: 'Azure',        klass: 'colour', hex: '#22477f', hi: '#4872ad', lo: '#132a50', mood: 'blue',        tone: 'cool'   },
  sable:     { name: 'Sable',        klass: 'colour', hex: '#231f1c', hi: '#443c37', lo: '#0c0a09', mood: 'black',       tone: 'dark'   },
  vert:      { name: 'Vert',         klass: 'colour', hex: '#1f6b3c', hi: '#3f9159', lo: '#0e3f22', mood: 'green',       tone: 'cool'   },
  purpure:   { name: 'Purpure',      klass: 'colour', hex: '#5d2a70', hi: '#83479a', lo: '#3a1748', mood: 'purple',      tone: 'rich'   },
  celeste:   { name: 'Bleu celeste', klass: 'colour', hex: '#5590c9', hi: '#83b4e2', lo: '#35618d', mood: 'sky blue',    tone: 'cool'   },
  cendree:   { name: 'Cendree',      klass: 'colour', hex: '#77736b', hi: '#9b968c', lo: '#4e4b45', mood: 'ash grey',    tone: 'muted'  },
  tenne:     { name: 'Tenne',        klass: 'colour', hex: '#8e4d1c', hi: '#b3702f', lo: '#5d3010', mood: 'tawny',       tone: 'warm'   },
  murrey:    { name: 'Murrey',       klass: 'colour', hex: '#6b1f3e', hi: '#8f3459', lo: '#450f26', mood: 'mulberry',    tone: 'rich'   },
  sanguine:  { name: 'Sanguine',     klass: 'colour', hex: '#6d1616', hi: '#8f2a2a', lo: '#460c0c', mood: 'blood red',   tone: 'dark'   },
  carnation: { name: 'Carnation',    klass: 'colour', hex: '#c68a6a', hi: '#dda98b', lo: '#8f5b41', mood: 'flesh',       tone: 'warm'   },
  /* furs - rendered as SVG patterns */
  ermine:    { name: 'Ermine',       klass: 'fur', fur: 'ermine', hex: '#e6e3dc', spot: '#231f1c', hi: '#ffffff', lo: '#aca79c', mood: 'white fur',  tone: 'bright' },
  ermines:   { name: 'Ermines',      klass: 'fur', fur: 'ermine', hex: '#231f1c', spot: '#e6e3dc', hi: '#443c37', lo: '#0c0a09', mood: 'black fur',  tone: 'dark'   },
  erminois:  { name: 'Erminois',     klass: 'fur', fur: 'ermine', hex: '#d9ac3c', spot: '#231f1c', hi: '#f7e09a', lo: '#96701d', mood: 'gold fur',   tone: 'bright' },
  pean:      { name: 'Pean',         klass: 'fur', fur: 'ermine', hex: '#231f1c', spot: '#d9ac3c', hi: '#443c37', lo: '#0c0a09', mood: 'black-and-gold fur', tone: 'dark' },
  vair:      { name: 'Vair',         klass: 'fur', fur: 'vair',   hex: '#e6e3dc', spot: '#22477f', hi: '#ffffff', lo: '#aca79c', mood: 'blue-and-white fur', tone: 'cool' },
  vairVert:  { name: 'Vair vert',    klass: 'fur', fur: 'vair',   hex: '#e6e3dc', spot: '#1f6b3c', hi: '#ffffff', lo: '#aca79c', mood: 'green-and-white fur', tone: 'cool' },
  potent:    { name: 'Potent',       klass: 'fur', fur: 'potent', hex: '#e6e3dc', spot: '#5d2a70', hi: '#ffffff', lo: '#aca79c', mood: 'crutch-pattern fur', tone: 'rich' }
};

var METALS  = ['or', 'argent', 'copper'];
var COLOURS = ['gules', 'azure', 'sable', 'vert', 'purpure', 'celeste', 'cendree', 'tenne', 'murrey', 'sanguine'];
var FURS    = ['ermine', 'ermines', 'erminois', 'pean', 'vair', 'vairVert', 'potent'];

function tinct(key) { return TINCTURE[key] || TINCTURE.argent; }
function isMetal(key) { return tinct(key).klass === 'metal'; }
function isFur(key) { return tinct(key).klass === 'fur'; }

/* The rule of tincture: never metal on metal, never colour on colour. */
function contrasts(a, b) {
  if (a === b) return false;
  if (isFur(a) || isFur(b)) return true;
  return isMetal(a) !== isMetal(b);
}

/* Given a background, return every tincture that may legally sit on it. */
function opposedTo(bg, pool) {
  var src = pool || METALS.concat(COLOURS, FURS);
  return src.filter(function (t) { return contrasts(t, bg); });
}

/* -- 2. GEOMETRY HELPERS ----------------------------------------------------- */

function n2(v) { return Math.round(v * 100) / 100; }

var G = {
  /* Circle. ccw reverses winding so it punches a hole under fill-rule:nonzero. */
  circle: function (cx, cy, r, ccw) {
    var s = ccw ? 0 : 1;
    return 'M' + n2(cx - r) + ',' + n2(cy) +
           'a' + r + ',' + r + ' 0 1,' + s + ' ' + (2 * r) + ',0' +
           'a' + r + ',' + r + ' 0 1,' + s + ' ' + (-2 * r) + ',0Z';
  },
  /* Ellipse, optionally rotated (degrees). */
  ellipse: function (cx, cy, rx, ry, rot, ccw) {
    rot = rot || 0;
    var rad = rot * Math.PI / 180, c = Math.cos(rad), s = Math.sin(rad);
    var ax = cx - rx * c, ay = cy - rx * s, bx = cx + rx * c, by = cy + rx * s;
    var sw = ccw ? 0 : 1;
    return 'M' + n2(ax) + ',' + n2(ay) +
           'A' + rx + ',' + ry + ' ' + rot + ' 0,' + sw + ' ' + n2(bx) + ',' + n2(by) +
           'A' + rx + ',' + ry + ' ' + rot + ' 0,' + sw + ' ' + n2(ax) + ',' + n2(ay) + 'Z';
  },
  rect: function (x, y, w, h) { return 'M' + n2(x) + ',' + n2(y) + 'h' + n2(w) + 'v' + n2(h) + 'h' + n2(-w) + 'Z'; },
  rectHole: function (x, y, w, h) { return 'M' + n2(x) + ',' + n2(y) + 'v' + n2(h) + 'h' + n2(w) + 'v' + n2(-h) + 'Z'; },
  poly: function (pts) { return 'M' + pts.map(function (p) { return n2(p[0]) + ',' + n2(p[1]); }).join('L') + 'Z'; },
  /* Tapered limb / beam between two points. */
  limb: function (x1, y1, x2, y2, w1, w2) {
    var dx = x2 - x1, dy = y2 - y1, len = Math.sqrt(dx * dx + dy * dy) || 1;
    var nx = -dy / len, ny = dx / len;
    return G.poly([
      [x1 + nx * w1 / 2, y1 + ny * w1 / 2], [x2 + nx * w2 / 2, y2 + ny * w2 / 2],
      [x2 - nx * w2 / 2, y2 - ny * w2 / 2], [x1 - nx * w1 / 2, y1 - ny * w1 / 2]
    ]);
  },
  /* Regular star / mullet. */
  star: function (cx, cy, R, r, points, rotDeg) {
    var d = '', rot = (rotDeg === undefined ? -90 : rotDeg) * Math.PI / 180;
    for (var i = 0; i < points * 2; i++) {
      var a = rot + i * Math.PI / points, rad = (i % 2) ? r : R;
      d += (i ? 'L' : 'M') + n2(cx + Math.cos(a) * rad) + ',' + n2(cy + Math.sin(a) * rad);
    }
    return d + 'Z';
  },
  /* Sun in splendour: alternating arc / flame ray, drawn as one closed path. */
  sun: function (cx, cy, ri, ro, rays) {
    var d = '', step = Math.PI * 2 / rays;
    var p = function (ang, r) { return n2(cx + Math.cos(ang) * r) + ',' + n2(cy + Math.sin(ang) * r); };
    for (var i = 0; i < rays; i++) {
      var a0 = i * step, a1 = a0 + step * 0.42, tip = a0 + step * 0.62, a2 = a0 + step;
      d += (i ? 'L' : 'M') + p(a0, ri);
      d += 'A' + ri + ',' + ri + ' 0 0,1 ' + p(a1, ri);
      d += 'L' + p(tip, ro) + 'L' + p(a2, ri);
    }
    return d + 'Z';
  },
  /* Closed Catmull-Rom through points -> smooth organic silhouette. */
  blob: function (pts, tension) {
    var t = tension === undefined ? 1 : tension, n = pts.length;
    var d = 'M' + n2(pts[0][0]) + ',' + n2(pts[0][1]);
    for (var i = 0; i < n; i++) {
      var p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      d += 'C' + n2(p1[0] + (p2[0] - p0[0]) / 6 * t) + ',' + n2(p1[1] + (p2[1] - p0[1]) / 6 * t) +
           ' ' + n2(p2[0] - (p3[0] - p1[0]) / 6 * t) + ',' + n2(p2[1] - (p3[1] - p1[1]) / 6 * t) +
           ' ' + n2(p2[0]) + ',' + n2(p2[1]);
    }
    return d + 'Z';
  },
  /* Crenellated block, left->right, used by towers, walls and mural crowns. */
  crenels: function (x1, x2, yTop, yBase, merlons) {
    var span = x2 - x1, unit = span / (merlons * 2 - 1);
    var d = 'M' + n2(x1) + ',' + n2(yBase);
    for (var i = 0; i < merlons * 2 - 1; i++) {
      var xa = x1 + i * unit, xb = xa + unit, up = (i % 2 === 0);
      d += 'L' + n2(xa) + ',' + n2(up ? yTop : yBase) + 'L' + n2(xb) + ',' + n2(up ? yTop : yBase);
    }
    return d + 'L' + n2(x2) + ',' + n2(yBase) + 'Z';
  }
};

/* -- 3. HERALDIC LINE STYLES ------------------------------------------------- */

/*  Every partition line and every ordinary edge can be drawn in one of these
    treatments. edge() walks from A to B emitting the decorated path segment
    (without the leading M), so the same code serves divisions and ordinaries. */

var LINE_STYLES = ['plain', 'wavy', 'nebuly', 'indented', 'dancetty', 'embattled',
                   'raguly', 'dovetailed', 'engrailed', 'invected', 'potenty', 'rayonny'];

function edge(ax, ay, bx, by, style, amp, wavelength) {
  var dx = bx - ax, dy = by - ay, len = Math.sqrt(dx * dx + dy * dy);
  if (!len || style === 'plain' || !style) return 'L' + n2(bx) + ',' + n2(by);
  var ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
  amp = amp === undefined ? 7 : amp;
  var wl = wavelength || 30;
  if (style === 'dancetty') { wl = 62; amp *= 1.7; }
  if (style === 'nebuly')   { wl = 34; amp *= 1.4; }
  if (style === 'rayonny')  { wl = 26; amp *= 1.3; }
  var n = Math.max(2, Math.round(len / wl));
  var step = len / n, d = '', i, o;
  var P = function (t, off) { return n2(ax + ux * t + nx * off) + ',' + n2(ay + uy * t + ny * off); };

  switch (style) {
    case 'wavy':
      for (i = 0; i < n; i++) {
        o = (i % 2 ? -amp : amp);
        d += 'C' + P(i * step + step * 0.25, o * 1.35) + ' ' + P(i * step + step * 0.75, o * 1.35) + ' ' + P((i + 1) * step, 0);
      }
      break;
    case 'nebuly':
      for (i = 0; i < n; i++) {
        o = (i % 2 ? -amp : amp);
        d += 'C' + P(i * step - step * 0.3, o * 1.9) + ' ' + P(i * step + step * 1.3, o * 1.9) + ' ' + P((i + 1) * step, 0);
      }
      break;
    case 'indented':
    case 'dancetty':
      for (i = 0; i < n; i++) d += 'L' + P(i * step + step / 2, (i % 2 ? -amp : amp)) + 'L' + P((i + 1) * step, 0);
      break;
    case 'embattled':
      for (i = 0; i < n; i++) { o = (i % 2 ? 0 : amp); d += 'L' + P(i * step, o) + 'L' + P((i + 1) * step, o); }
      d += 'L' + P(len, 0);
      break;
    case 'potenty':
      for (i = 0; i < n; i++) {
        o = (i % 2 ? 0 : amp);
        d += 'L' + P(i * step - step * 0.14, o) + 'L' + P((i + 1) * step + step * 0.14, o) + 'L' + P((i + 1) * step, o * 0.5);
      }
      d += 'L' + P(len, 0);
      break;
    case 'raguly':
      for (i = 0; i < n; i++) { o = (i % 2 ? 0 : amp); d += 'L' + P(i * step + step * 0.3, o) + 'L' + P((i + 1) * step + step * 0.3, o); }
      d += 'L' + P(len, 0);
      break;
    case 'dovetailed':
      for (i = 0; i < n; i++) {
        o = (i % 2 ? 0 : amp);
        d += 'L' + P(i * step + step * 0.18, o) + 'L' + P((i + 1) * step - step * 0.18, o) + 'L' + P((i + 1) * step, 0);
      }
      d += 'L' + P(len, 0);
      break;
    case 'engrailed':
    case 'invected':
      var sweep = style === 'engrailed' ? 1 : 0, r = step / 2;
      for (i = 0; i < n; i++) d += 'A' + n2(r) + ',' + n2(r * 0.9) + ' 0 0,' + sweep + ' ' + P((i + 1) * step, 0);
      break;
    case 'rayonny':
      for (i = 0; i < n; i++) {
        o = (i % 2 ? -amp : amp);
        d += 'Q' + P(i * step + step / 2, o * 2.1) + ' ' + P((i + 1) * step, 0);
      }
      break;
    default:
      d = 'L' + n2(bx) + ',' + n2(by);
  }
  return d;
}

/* Adjective form used in the blazon. */
var LINE_WORD = {
  plain: '', wavy: 'wavy', nebuly: 'nebuly', indented: 'indented', dancetty: 'dancetty',
  embattled: 'embattled', raguly: 'raguly', dovetailed: 'dovetailed', engrailed: 'engrailed',
  invected: 'invected', potenty: 'potenty', rayonny: 'rayonny'
};

global.Heraldry = {
  hashStr: hashStr, makeRng: makeRng, Chance: Chance,
  TINCTURE: TINCTURE, METALS: METALS, COLOURS: COLOURS, FURS: FURS,
  tinct: tinct, isMetal: isMetal, isFur: isFur, contrasts: contrasts, opposedTo: opposedTo,
  G: G, n2: n2, edge: edge, LINE_STYLES: LINE_STYLES, LINE_WORD: LINE_WORD
};

})(typeof window !== 'undefined' ? window : this);
