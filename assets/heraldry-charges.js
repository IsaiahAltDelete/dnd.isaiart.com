/* ==============================================================================
   HERALDRY-CHARGES.JS - shield shapes, field divisions, ordinaries and the
   charge library.

   Coordinate systems
     shield  : 200 x 220 box, dexter chief at (0,0). Fess point is (100,105).
     charge  : 100 x 100 box, drawn to fill roughly 8..92 on both axes.

   Every path is authored for fill-rule:nonzero, so overlapping solid subpaths
   simply merge (this is how the creatures are built up out of primitives) and
   holes are authored with reversed winding.
   ============================================================================== */
(function (H) {
'use strict';

var G = H.G, n2 = H.n2, edge = H.edge;

/* Over-draw box: everything is clipped to the shield outline, so partitions and
   ordinaries are drawn well past the edges and never leave a seam. */
var BX = { x0: -40, y0: -40, x1: 240, y1: 260 };
var FESS = { x: 100, y: 105 };

/* -- extra primitives -------------------------------------------------------- */

function revPts(pts) { return pts.slice().reverse(); }
G.polyHole = function (pts) { return G.poly(revPts(pts)); };
/* Round-headed opening (gate, window) authored as a reversed polygon. */
G.archHole = function (cx, yTop, yBottom, r, steps) {
  steps = steps || 10;
  var pts = [[cx - r, yBottom]], i, a;
  for (i = 0; i <= steps; i++) {
    a = Math.PI - (i / steps) * Math.PI;
    pts.push([cx + Math.cos(a) * r, yTop + r - Math.sin(a) * r]);
  }
  pts.push([cx + r, yBottom]);
  return G.polyHole(pts);
};
/* Solid round-headed shape (towers, portals). */
G.arch = function (cx, yTop, yBottom, r, steps) {
  steps = steps || 12;
  var pts = [[cx - r, yBottom]], i, a;
  for (i = 0; i <= steps; i++) {
    a = Math.PI - (i / steps) * Math.PI;
    pts.push([cx + Math.cos(a) * r, yTop + r - Math.sin(a) * r]);
  }
  pts.push([cx + r, yBottom]);
  return G.poly(pts);
};

/* -- 1. SHIELD (AND BANNER) SHAPES ------------------------------------------- */

var SHAPES = {
  heater:  { name: 'heater shield',    d: 'M10,8 H190 V95 C190,148 156,190 100,213 C44,190 10,148 10,95 Z' },
  french:  { name: 'French shield',    d: 'M10,8 H190 V158 C190,188 168,204 146,208 C128,212 110,207 100,202 C90,207 72,212 54,208 C32,204 10,188 10,158 Z' },
  iberian: { name: 'Iberian shield',   d: 'M10,8 H190 V112 A90,90 0 0 1 10,112 Z' },
  kite:    { name: 'kite shield',      d: 'M18,10 C60,2 140,2 182,10 L170,112 C160,176 132,206 100,216 C68,206 40,176 30,112 Z' },
  spade:   { name: 'spade shield',     d: 'M10,8 C40,26 160,26 190,8 V96 C190,150 156,190 100,214 C44,190 10,150 10,96 Z' },
  polish:  { name: 'scrolled shield',  d: 'M22,10 C62,24 138,24 178,10 L178,96 C178,150 144,188 100,212 C56,188 22,150 22,96 Z' },
  bouche:  { name: 'notched tourney shield', d: 'M10,8 H58 L70,30 L82,8 H190 V95 C190,148 156,190 100,213 C44,190 10,148 10,95 Z' },
  dwarven: { name: 'dwarven plate',    d: 'M32,8 H168 L192,54 L166,168 L100,214 L34,168 L8,54 Z' },
  elven:   { name: 'elven leaf',       d: 'M100,4 C148,36 186,78 186,124 C186,176 148,212 100,216 C52,212 14,176 14,124 C14,78 52,36 100,4 Z' },
  orcish:  { name: 'orcish targe',     d: 'M14,16 L52,6 L96,18 L142,4 L188,16 L174,70 L192,106 L162,152 L136,208 L100,186 L64,208 L38,152 L8,106 L26,70 Z' },
  round:   { name: 'round rondache',   d: G.circle(100, 110, 98) },
  oval:    { name: 'oval cartouche',   d: G.ellipse(100, 110, 92, 106) },
  lozenge: { name: 'lozenge',          d: 'M100,4 L192,110 L100,216 L8,110 Z' },
  banner:  { name: 'square banner',    d: 'M10,8 H190 V212 H10 Z' }
};

/* Which shapes suit which cultures - the generator biases, never forces. */
var SHAPE_AFFINITY = {
  Dwarves: ['dwarven', 'heater', 'iberian'],
  Elves: ['elven', 'oval', 'kite'],
  'Half-Orcs': ['orcish', 'round', 'spade'],
  Orcs: ['orcish', 'round'],
  Halflings: ['round', 'oval', 'iberian'],
  Gnomes: ['oval', 'lozenge', 'french'],
  Tieflings: ['spade', 'bouche', 'polish'],
  Dragonborn: ['spade', 'dwarven', 'kite']
};

/* -- 2. FIELD DIVISIONS ------------------------------------------------------ */

/*  A division returns { shapes: [{d, t}], tinctures: n, blazon: fn }.
    `shapes` are painted over a full-bleed base of tinctures[0].          */

function bandStrip(dirDeg, offset, width) {
  /* Infinite strip perpendicular to a direction, used for bends and bendy. */
  var a = dirDeg * Math.PI / 180;
  var ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux, BIG = 460;
  var o0 = offset, o1 = offset + width;
  return G.poly([
    [FESS.x + nx * o0 - ux * BIG, FESS.y + ny * o0 - uy * BIG],
    [FESS.x + nx * o0 + ux * BIG, FESS.y + ny * o0 + uy * BIG],
    [FESS.x + nx * o1 + ux * BIG, FESS.y + ny * o1 + uy * BIG],
    [FESS.x + nx * o1 - ux * BIG, FESS.y + ny * o1 - uy * BIG]
  ]);
}

function repeatStrips(dirDeg, count, span) {
  /* `count` alternating strips covering the shield; returns the odd ones. */
  var w = span / count, out = [], i;
  for (i = 1; i < count; i += 2) out.push(bandStrip(dirDeg, -span / 2 + i * w, w));
  return out;
}

var DIVISIONS = {
  plain: {
    tinctures: 1, line: false,
    shapes: function () { return []; },
    blazon: function (t) { return H.tinct(t[0]).name; }
  },
  perPale: {
    tinctures: 2, line: true,
    shapes: function (t, ls) {
      return [{ t: t[1], d: 'M100,' + BX.y0 + edge(100, BX.y0, 100, BX.y1, ls) + 'L' + BX.x1 + ',' + BX.y1 + 'L' + BX.x1 + ',' + BX.y0 + 'Z' }];
    },
    blazon: function (t, ls) { return 'Per pale ' + lw(ls) + H.tinct(t[0]).name + ' and ' + H.tinct(t[1]).name; }
  },
  perFess: {
    tinctures: 2, line: true,
    shapes: function (t, ls) {
      return [{ t: t[1], d: 'M' + BX.x0 + ',105' + edge(BX.x0, 105, BX.x1, 105, ls) + 'L' + BX.x1 + ',' + BX.y1 + 'L' + BX.x0 + ',' + BX.y1 + 'Z' }];
    },
    blazon: function (t, ls) { return 'Per fess ' + lw(ls) + H.tinct(t[0]).name + ' and ' + H.tinct(t[1]).name; }
  },
  perBend: {
    tinctures: 2, line: true,
    shapes: function (t, ls) {
      return [{ t: t[1], d: 'M-40,-44' + edge(-40, -44, 240, 264, ls) + 'L-40,264Z' }];
    },
    blazon: function (t, ls) { return 'Per bend ' + lw(ls) + H.tinct(t[0]).name + ' and ' + H.tinct(t[1]).name; }
  },
  perBendSinister: {
    tinctures: 2, line: true,
    shapes: function (t, ls) {
      return [{ t: t[1], d: 'M240,-44' + edge(240, -44, -40, 264, ls) + 'L-40,-44Z' }];
    },
    blazon: function (t, ls) { return 'Per bend sinister ' + lw(ls) + H.tinct(t[0]).name + ' and ' + H.tinct(t[1]).name; }
  },
  perChevron: {
    tinctures: 2, line: true,
    shapes: function (t, ls) {
      return [{ t: t[1], d: 'M' + BX.x0 + ',206' + edge(BX.x0, 206, 100, 86, ls, 6) + edge(100, 86, BX.x1, 206, ls, 6) + 'L' + BX.x1 + ',' + BX.y1 + 'L' + BX.x0 + ',' + BX.y1 + 'Z' }];
    },
    blazon: function (t, ls) { return 'Per chevron ' + lw(ls) + H.tinct(t[0]).name + ' and ' + H.tinct(t[1]).name; }
  },
  perChevronInverted: {
    tinctures: 2, line: true,
    shapes: function (t, ls) {
      return [{ t: t[1], d: 'M' + BX.x0 + ',12' + edge(BX.x0, 12, 100, 132, ls, 6) + edge(100, 132, BX.x1, 12, ls, 6) + 'L' + BX.x1 + ',' + BX.y1 + 'L' + BX.x0 + ',' + BX.y1 + 'Z' }];
    },
    blazon: function (t, ls) { return 'Per chevron inverted ' + lw(ls) + H.tinct(t[0]).name + ' and ' + H.tinct(t[1]).name; }
  },
  perSaltire: {
    tinctures: 2, line: false,
    shapes: function (t) {
      return [
        { t: t[1], d: G.poly([[BX.x0, BX.y0], [FESS.x, FESS.y], [BX.x0, BX.y1]]) },
        { t: t[1], d: G.poly([[BX.x1, BX.y0], [FESS.x, FESS.y], [BX.x1, BX.y1]]) }
      ];
    },
    blazon: function (t) { return 'Per saltire ' + H.tinct(t[0]).name + ' and ' + H.tinct(t[1]).name; }
  },
  quarterly: {
    tinctures: 2, line: false,
    shapes: function (t) {
      return [
        { t: t[1], d: G.rect(FESS.x, BX.y0, BX.x1 - FESS.x, FESS.y - BX.y0) },
        { t: t[1], d: G.rect(BX.x0, FESS.y, FESS.x - BX.x0, BX.y1 - FESS.y) }
      ];
    },
    blazon: function (t) { return 'Quarterly ' + H.tinct(t[0]).name + ' and ' + H.tinct(t[1]).name; }
  },
  gyronny: {
    tinctures: 2, line: false,
    shapes: function (t) {
      var ring = [[BX.x0, BX.y0], [FESS.x, BX.y0], [BX.x1, BX.y0], [BX.x1, FESS.y],
                  [BX.x1, BX.y1], [FESS.x, BX.y1], [BX.x0, BX.y1], [BX.x0, FESS.y]];
      var out = [], i;
      for (i = 0; i < 8; i += 2) {
        out.push({ t: t[1], d: G.poly([[FESS.x, FESS.y], ring[i], ring[(i + 1) % 8]]) });
      }
      return out;
    },
    blazon: function (t) { return 'Gyronny of eight ' + H.tinct(t[0]).name + ' and ' + H.tinct(t[1]).name; }
  },
  tiercedPerPale: {
    tinctures: 3, line: false,
    shapes: function (t) {
      return [
        { t: t[1], d: G.rect(67, BX.y0, 66, BX.y1 - BX.y0) },
        { t: t[2], d: G.rect(133, BX.y0, BX.x1 - 133, BX.y1 - BX.y0) }
      ];
    },
    blazon: function (t) { return 'Tierced per pale ' + H.tinct(t[0]).name + ', ' + H.tinct(t[1]).name + ' and ' + H.tinct(t[2]).name; }
  },
  tiercedPerFess: {
    tinctures: 3, line: false,
    shapes: function (t) {
      return [
        { t: t[1], d: G.rect(BX.x0, 73, BX.x1 - BX.x0, 73) },
        { t: t[2], d: G.rect(BX.x0, 146, BX.x1 - BX.x0, BX.y1 - 146) }
      ];
    },
    blazon: function (t) { return 'Tierced per fess ' + H.tinct(t[0]).name + ', ' + H.tinct(t[1]).name + ' and ' + H.tinct(t[2]).name; }
  },
  perPall: {
    tinctures: 3, line: false,
    shapes: function (t) {
      return [
        { t: t[1], d: G.poly([[FESS.x, BX.y0], [BX.x1, BX.y0], [BX.x1, BX.y1], [FESS.x, FESS.y]]) },
        { t: t[2], d: G.poly([[BX.x0, FESS.y], [FESS.x, FESS.y], [BX.x1, BX.y1], [BX.x0, BX.y1]]) }
      ];
    },
    blazon: function (t) { return 'Tierced per pall ' + H.tinct(t[0]).name + ', ' + H.tinct(t[1]).name + ' and ' + H.tinct(t[2]).name; }
  },
  barry: {
    tinctures: 2, line: true, count: [6, 8, 10],
    shapes: function (t, ls, n) {
      var out = [], h = 220 / n, i, y0, y1;
      for (i = 1; i < n; i += 2) {
        y0 = i * h; y1 = y0 + h;
        out.push({ t: t[1], d: 'M' + BX.x0 + ',' + n2(y0) + edge(BX.x0, y0, BX.x1, y0, ls, 4, 40) +
                               'L' + BX.x1 + ',' + n2(y1) + edge(BX.x1, y1, BX.x0, y1, ls, 4, 40) + 'Z' });
      }
      return out;
    },
    blazon: function (t, ls, n) { return 'Barry ' + lw(ls) + 'of ' + numWord(n) + ' ' + H.tinct(t[0]).name + ' and ' + H.tinct(t[1]).name; }
  },
  paly: {
    tinctures: 2, line: true, count: [6, 8],
    shapes: function (t, ls, n) {
      var out = [], w = 200 / n, i, x0, x1;
      for (i = 1; i < n; i += 2) {
        x0 = i * w; x1 = x0 + w;
        out.push({ t: t[1], d: 'M' + n2(x0) + ',' + BX.y0 + edge(x0, BX.y0, x0, BX.y1, ls, 4, 40) +
                               'L' + n2(x1) + ',' + BX.y1 + edge(x1, BX.y1, x1, BX.y0, ls, 4, 40) + 'Z' });
      }
      return out;
    },
    blazon: function (t, ls, n) { return 'Paly ' + lw(ls) + 'of ' + numWord(n) + ' ' + H.tinct(t[0]).name + ' and ' + H.tinct(t[1]).name; }
  },
  bendy: {
    tinctures: 2, line: false, count: [6, 8],
    shapes: function (t, ls, n) {
      return repeatStrips(45, n, 300).map(function (d) { return { t: t[1], d: d }; });
    },
    blazon: function (t, ls, n) { return 'Bendy of ' + numWord(n) + ' ' + H.tinct(t[0]).name + ' and ' + H.tinct(t[1]).name; }
  },
  bendySinister: {
    tinctures: 2, line: false, count: [6, 8],
    shapes: function (t, ls, n) {
      return repeatStrips(-45, n, 300).map(function (d) { return { t: t[1], d: d }; });
    },
    blazon: function (t, ls, n) { return 'Bendy sinister of ' + numWord(n) + ' ' + H.tinct(t[0]).name + ' and ' + H.tinct(t[1]).name; }
  },
  chevronny: {
    tinctures: 2, line: false, count: [6, 8],
    shapes: function (t, ls, n) {
      var out = [], h = 300 / n, i, y;
      for (i = -2; i < n; i += 2) {
        y = 206 - i * h * 0.75;
        out.push({ t: t[1], d: G.poly([[BX.x0, y], [100, y - 120], [BX.x1, y], [BX.x1, y + h * 0.75], [100, y - 120 + h * 0.75], [BX.x0, y + h * 0.75]]) });
      }
      return out;
    },
    blazon: function (t, ls, n) { return 'Chevronny of ' + numWord(n) + ' ' + H.tinct(t[0]).name + ' and ' + H.tinct(t[1]).name; }
  },
  checky: {
    tinctures: 2, line: false,
    shapes: function (t) {
      var s = 200 / 6, out = [], r, c;
      for (r = -1; r < 8; r++) for (c = -1; c < 7; c++) {
        if ((r + c) % 2) out.push({ t: t[1], d: G.rect(c * s, r * s, s, s) });
      }
      return out;
    },
    blazon: function (t) { return 'Checky ' + H.tinct(t[0]).name + ' and ' + H.tinct(t[1]).name; }
  },
  lozengy: {
    tinctures: 2, line: false,
    shapes: function (t) {
      var w = 200 / 5, h = 220 / 5, out = [], r, c, cx, cy;
      for (r = -1; r < 7; r++) for (c = -1; c < 7; c++) {
        if ((r + c) % 2) continue;
        cx = c * w + (r % 2 ? w / 2 : 0); cy = r * h;
        out.push({ t: t[1], d: G.poly([[cx, cy - h / 2], [cx + w / 2, cy], [cx, cy + h / 2], [cx - w / 2, cy]]) });
      }
      return out;
    },
    blazon: function (t) { return 'Lozengy ' + H.tinct(t[0]).name + ' and ' + H.tinct(t[1]).name; }
  },
  fusilly: {
    tinctures: 2, line: false,
    shapes: function (t) {
      var w = 200 / 8, h = 220 / 4, out = [], r, c, cx, cy;
      for (r = -1; r < 6; r++) for (c = -1; c < 10; c++) {
        cx = c * w + (r % 2 ? w / 2 : 0); cy = r * h;
        out.push({ t: t[1], d: G.poly([[cx, cy - h / 2], [cx + w / 2, cy], [cx, cy + h / 2], [cx - w / 2, cy]]) });
      }
      return out;
    },
    blazon: function (t) { return 'Fusilly ' + H.tinct(t[0]).name + ' and ' + H.tinct(t[1]).name; }
  },
  pily: {
    tinctures: 2, line: false,
    shapes: function (t) {
      var out = [], w = 200 / 4, i;
      for (i = 0; i < 4; i++) out.push({ t: t[1], d: G.poly([[i * w, BX.y0], [(i + 1) * w, BX.y0], [i * w + w / 2, 180]]) });
      return out;
    },
    blazon: function (t) { return 'Pily ' + H.tinct(t[0]).name + ' and ' + H.tinct(t[1]).name; }
  }
};

function lw(ls) { var w = H.LINE_WORD[ls]; return w ? w + ' ' : ''; }
function numWord(n) {
  return { 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight', 9: 'nine', 10: 'ten' }[n] || String(n);
}

/* -- 3. ORDINARIES ----------------------------------------------------------- */

/*  Each returns { shapes:[{d}], blazon, weight, holds } where `holds` says how
    many charges may be placed on the ordinary itself.                        */

var ORDINARIES = {
  none:  { blazon: function () { return ''; }, shapes: function () { return []; }, holds: 0 },
  chief: {
    holds: 3, spot: function () { return { x: 100, y: 20, w: 170, h: 40 }; },
    shapes: function (ls) { return [{ d: 'M' + BX.x0 + ',' + BX.y0 + 'L' + BX.x1 + ',' + BX.y0 + 'L' + BX.x1 + ',48' + edge(BX.x1, 48, BX.x0, 48, ls) + 'Z' }]; },
    blazon: function (ls) { return 'a chief ' + lw(ls); }
  },
  base: {
    holds: 2, spot: function () { return { x: 100, y: 190, w: 120, h: 36 }; },
    shapes: function (ls) { return [{ d: 'M' + BX.x0 + ',' + BX.y1 + 'L' + BX.x1 + ',' + BX.y1 + 'L' + BX.x1 + ',176' + edge(BX.x1, 176, BX.x0, 176, ls) + 'Z' }]; },
    blazon: function (ls) { return 'a base ' + lw(ls); }
  },
  fess: {
    holds: 3, spot: function () { return { x: 100, y: 105, w: 170, h: 44 }; },
    shapes: function (ls) {
      return [{ d: 'M' + BX.x0 + ',83' + edge(BX.x0, 83, BX.x1, 83, ls) + 'L' + BX.x1 + ',127' + edge(BX.x1, 127, BX.x0, 127, ls) + 'Z' }];
    },
    blazon: function (ls) { return 'a fess ' + lw(ls); }
  },
  pale: {
    holds: 3, spot: function () { return { x: 100, y: 105, w: 44, h: 180 }; },
    shapes: function (ls) {
      return [{ d: 'M77,' + BX.y0 + edge(77, BX.y0, 77, BX.y1, ls) + 'L123,' + BX.y1 + edge(123, BX.y1, 123, BX.y0, ls) + 'Z' }];
    },
    blazon: function (ls) { return 'a pale ' + lw(ls); }
  },
  bend: {
    holds: 3, spot: function () { return { x: 100, y: 105, w: 44, h: 44, rot: 48 }; },
    shapes: function () { return [{ d: bandStrip(48, -23, 46) }]; },
    blazon: function (ls) { return 'a bend ' + lw(ls); }
  },
  bendSinister: {
    holds: 3, spot: function () { return { x: 100, y: 105, w: 44, h: 44, rot: -48 }; },
    shapes: function () { return [{ d: bandStrip(-48, -23, 46) }]; },
    blazon: function (ls) { return 'a bend sinister ' + lw(ls); }
  },
  chevron: {
    holds: 0, spot: function () { return { x: 100, y: 150, w: 60, h: 50 }; },
    shapes: function (ls) {
      return [{ d: 'M' + BX.x0 + ',196' + edge(BX.x0, 196, 100, 76, ls, 5) + edge(100, 76, BX.x1, 196, ls, 5) +
                    'L' + BX.x1 + ',236' + 'L100,116L' + BX.x0 + ',236Z' }];
    },
    blazon: function (ls) { return 'a chevron ' + lw(ls); }
  },
  chevronels: {
    holds: 0,
    shapes: function (ls) {
      var out = [], i, y;
      for (i = 0; i < 3; i++) {
        y = 206 - i * 44;
        out.push({ d: 'M' + BX.x0 + ',' + y + 'L100,' + (y - 110) + 'L' + BX.x1 + ',' + y + 'L' + BX.x1 + ',' + (y + 20) + 'L100,' + (y - 90) + 'L' + BX.x0 + ',' + (y + 20) + 'Z' });
      }
      return out;
    },
    blazon: function () { return 'three chevronels '; }
  },
  cross: {
    holds: 5, spot: function () { return { x: 100, y: 105, w: 46, h: 46 }; },
    shapes: function (ls) {
      return [
        { d: 'M' + BX.x0 + ',82' + edge(BX.x0, 82, BX.x1, 82, ls) + 'L' + BX.x1 + ',128' + edge(BX.x1, 128, BX.x0, 128, ls) + 'Z' },
        { d: 'M77,' + BX.y0 + edge(77, BX.y0, 77, BX.y1, ls) + 'L123,' + BX.y1 + edge(123, BX.y1, 123, BX.y0, ls) + 'Z' }
      ];
    },
    blazon: function (ls) { return 'a cross ' + lw(ls); }
  },
  saltire: {
    holds: 5, spot: function () { return { x: 100, y: 105, w: 46, h: 46 }; },
    shapes: function () { return [{ d: bandStrip(48, -22, 44) }, { d: bandStrip(-48, -22, 44) }]; },
    blazon: function (ls) { return 'a saltire ' + lw(ls); }
  },
  pall: {
    holds: 0,
    shapes: function () {
      return [
        { d: G.limb(BX.x0, -18, 100, 100, 42, 42) },
        { d: G.limb(BX.x1, -18, 100, 100, 42, 42) },
        { d: G.limb(100, 88, 100, BX.y1, 42, 42) }
      ];
    },
    blazon: function () { return 'a pall '; }
  },
  pile: {
    holds: 1, spot: function () { return { x: 100, y: 60, w: 66, h: 66 }; },
    shapes: function () { return [{ d: G.poly([[34, BX.y0], [166, BX.y0], [100, 196]]) }]; },
    blazon: function () { return 'a pile '; }
  },
  canton: {
    holds: 1, spot: function () { return { x: 36, y: 34, w: 52, h: 52 }; },
    shapes: function () { return [{ d: G.rect(BX.x0, BX.y0, 78 - BX.x0, 76 - BX.y0) }]; },
    blazon: function () { return 'a canton '; }
  },
  flaunches: {
    holds: 0,
    shapes: function () {
      return [
        { d: 'M' + BX.x0 + ',' + BX.y0 + 'L46,' + BX.y0 + 'C10,60 10,150 46,' + BX.y1 + 'L' + BX.x0 + ',' + BX.y1 + 'Z' },
        { d: 'M' + BX.x1 + ',' + BX.y0 + 'L154,' + BX.y0 + 'C190,60 190,150 154,' + BX.y1 + 'L' + BX.x1 + ',' + BX.y1 + 'Z' }
      ];
    },
    blazon: function () { return 'two flaunches '; }
  },
  twoBars: {
    holds: 0,
    shapes: function (ls) {
      return [66, 128].map(function (y) {
        return { d: 'M' + BX.x0 + ',' + y + edge(BX.x0, y, BX.x1, y, ls, 5) + 'L' + BX.x1 + ',' + (y + 26) + edge(BX.x1, y + 26, BX.x0, y + 26, ls, 5) + 'Z' };
      });
    },
    blazon: function (ls) { return 'two bars ' + lw(ls); }
  },
  threeBars: {
    holds: 0,
    shapes: function (ls) {
      return [46, 100, 154].map(function (y) {
        return { d: 'M' + BX.x0 + ',' + y + edge(BX.x0, y, BX.x1, y, ls, 5) + 'L' + BX.x1 + ',' + (y + 22) + edge(BX.x1, y + 22, BX.x0, y + 22, ls, 5) + 'Z' };
      });
    },
    blazon: function (ls) { return 'three bars ' + lw(ls); }
  },
  twoPallets: {
    holds: 0,
    shapes: function (ls) {
      return [52, 126].map(function (x) {
        return { d: 'M' + x + ',' + BX.y0 + edge(x, BX.y0, x, BX.y1, ls, 5) + 'L' + (x + 22) + ',' + BX.y1 + edge(x + 22, BX.y1, x + 22, BX.y0, ls, 5) + 'Z' };
      });
    },
    blazon: function (ls) { return 'two pallets ' + lw(ls); }
  },
  bordure: {
    holds: 0, stroke: 17, inset: 0,
    shapes: function () { return []; },
    blazon: function (ls) { return 'a bordure ' + lw(ls); }
  },
  orle: {
    holds: 0, stroke: 8, inset: 15,
    shapes: function () { return []; },
    blazon: function () { return 'an orle '; }
  },
  tressure: {
    holds: 0, stroke: 5, inset: 13, double: 9,
    shapes: function () { return []; },
    blazon: function () { return 'a double tressure '; }
  }
};

/* -- 4. CHARGE LIBRARY ------------------------------------------------------- */

/*  tags drive the semantic picker: the generator collects tags from the city's
    terrain, trades, faith and rulers, then draws from the matching charges.
    `body:true` marks a full-length creature that can serve as a supporter.    */

var C = {};
function charge(key, name, plural, tags, d, opts) {
  C[key] = Object.assign({ key: key, name: name, plural: plural, tags: tags, d: d, body: false, scale: 1 }, opts || {});
}

/* --- geometric & abstract --- */
charge('roundel', 'roundel', 'roundels', ['coin', 'trade', 'sun', 'abstract'], G.circle(50, 50, 34));
charge('annulet', 'annulet', 'annulets', ['abstract', 'craft', 'oath'], G.circle(50, 50, 34) + G.circle(50, 50, 21, true));
charge('lozengeC', 'lozenge', 'lozenges', ['abstract', 'gem', 'craft'], G.poly([[50, 12], [86, 50], [50, 88], [14, 50]]));
charge('billet', 'billet', 'billets', ['abstract', 'law', 'trade'], G.rect(30, 14, 40, 72));
charge('mullet', 'mullet', 'mullets', ['star', 'night', 'fate', 'abstract'], G.star(50, 50, 40, 17, 5));
charge('mullet6', 'mullet of six points', 'mullets of six points', ['star', 'night', 'arcane'], G.star(50, 50, 40, 19, 6));
charge('mullet8', 'mullet of eight points', 'mullets of eight points', ['star', 'arcane', 'fate'], G.star(50, 50, 40, 20, 8));
charge('estoile', 'estoile', 'estoiles', ['star', 'night', 'arcane'],
  (function () {
    var d = '', i, a;
    for (i = 0; i < 6; i++) {
      a = -Math.PI / 2 + i * Math.PI / 3;
      d += G.poly([
        [50 + Math.cos(a) * 42, 50 + Math.sin(a) * 42],
        [50 + Math.cos(a + 0.42) * 15, 50 + Math.sin(a + 0.42) * 15],
        [50 + Math.cos(a - 0.42) * 15, 50 + Math.sin(a - 0.42) * 15]
      ]);
    }
    return d + G.circle(50, 50, 15);
  })());
charge('sunSplendour', 'sun in splendour', 'suns', ['sun', 'faith', 'light', 'harvest'],
  G.sun(50, 50, 26, 46, 12) + G.circle(50, 50, 26));
charge('crescent', 'crescent', 'crescents', ['moon', 'night', 'faith', 'fate'],
  G.circle(50, 54, 38) + G.circle(62, 44, 32, true));
charge('crossPatty', 'cross patty', 'crosses patty', ['faith', 'law', 'oath'],
  G.poly([[38, 10], [62, 10], [56, 38], [88, 30], [88, 70], [56, 62], [62, 90], [38, 90], [44, 62], [12, 70], [12, 30], [44, 38]]));
charge('crossMoline', 'cross moline', 'crosses moline', ['faith', 'craft', 'mill'],
  G.rect(43, 14, 14, 72) + G.rect(14, 43, 72, 14) +
  G.poly([[43, 14], [24, 8], [30, 26]]) + G.poly([[57, 14], [76, 8], [70, 26]]) +
  G.poly([[43, 86], [24, 92], [30, 74]]) + G.poly([[57, 86], [76, 92], [70, 74]]));
charge('maltese', 'cross of eight points', 'crosses of eight points', ['faith', 'oath', 'war'],
  G.poly([[50, 50], [26, 12], [74, 12]]) + G.poly([[50, 50], [26, 88], [74, 88]]) +
  G.poly([[50, 50], [12, 26], [12, 74]]) + G.poly([[50, 50], [88, 26], [88, 74]]));
charge('fleurdelis', 'fleur-de-lis', 'fleurs-de-lis', ['noble', 'faith', 'bloom', 'court'],
  G.blob([[50, 6], [59, 22], [61, 36], [50, 48], [39, 36], [41, 22]]) +
  G.blob([[40, 50], [28, 50], [21, 40], [24, 27], [34, 30], [36, 42]]) +
  G.blob([[60, 50], [72, 50], [79, 40], [76, 27], [66, 30], [64, 42]]) +
  G.rect(31, 50, 38, 10) +
  G.blob([[44, 60], [42, 76], [50, 94], [58, 76], [56, 60]]));
charge('trefoil', 'trefoil', 'trefoils', ['bloom', 'nature', 'luck'],
  G.circle(50, 26, 17) + G.circle(30, 52, 17) + G.circle(70, 52, 17) + G.rect(46, 56, 8, 34));
charge('quatrefoil', 'quatrefoil', 'quatrefoils', ['bloom', 'nature', 'faith'],
  G.circle(50, 24, 18) + G.circle(50, 76, 18) + G.circle(24, 50, 18) + G.circle(76, 50, 18) + G.circle(50, 50, 16));

/* --- structures --- */
charge('tower', 'tower', 'towers', ['fort', 'watch', 'stone', 'law'],
  G.crenels(20, 80, 20, 40, 4) + G.rect(28, 40, 44, 50) +
  G.archHole(50, 66, 90, 9) + G.rectHole(35, 50, 8, 10) + G.rectHole(57, 50, 8, 10));
charge('castle', 'castle', 'castles', ['fort', 'law', 'stone', 'noble'],
  G.crenels(6, 32, 24, 42, 3) + G.rect(9, 42, 20, 48) +
  G.crenels(68, 94, 24, 42, 3) + G.rect(71, 42, 20, 48) +
  G.crenels(35, 65, 8, 26, 3) + G.rect(37, 26, 26, 64) +
  G.rect(26, 52, 48, 38) + G.archHole(50, 62, 90, 11));
charge('wall', 'embattled wall', 'walls', ['fort', 'watch', 'stone'],
  G.crenels(8, 92, 26, 46, 6) + G.rect(12, 46, 76, 44) + G.archHole(50, 62, 90, 12));
charge('portcullis', 'portcullis', 'portcullises', ['fort', 'law', 'gate', 'watch'],
  G.poly([[14, 16], [86, 16], [86, 76], [50, 92], [14, 76]]) +
  G.rectHole(21, 25, 15, 19) + G.rectHole(42, 25, 16, 19) + G.rectHole(64, 25, 15, 19) +
  G.rectHole(21, 50, 15, 19) + G.rectHole(42, 50, 16, 19) + G.rectHole(64, 50, 15, 19));
charge('bridge', 'bridge of three arches', 'bridges', ['river', 'trade', 'stone', 'road'],
  G.rect(4, 34, 92, 14) + G.rect(8, 48, 84, 42) +
  G.archHole(24, 58, 90, 11) + G.archHole(50, 54, 90, 12) + G.archHole(76, 58, 90, 11));
charge('lighthouse', 'lighthouse', 'lighthouses', ['sea', 'watch', 'light', 'port'],
  G.poly([[38, 34], [62, 34], [70, 90], [30, 90]]) + G.rect(34, 24, 32, 10) +
  G.poly([[42, 8], [58, 8], [62, 24], [38, 24]]) +
  G.poly([[62, 12], [92, 4], [92, 22]]) + G.poly([[38, 12], [8, 4], [8, 22]]));
charge('temple', 'temple', 'temples', ['faith', 'law', 'stone', 'learning'],
  G.poly([[50, 8], [92, 34], [8, 34]]) + G.rect(10, 34, 80, 8) +
  G.rect(16, 42, 10, 40) + G.rect(38, 42, 10, 40) + G.rect(54, 42, 10, 40) + G.rect(76, 42, 10, 40) +
  G.rect(8, 82, 84, 10));
charge('windmill', 'windmill', 'windmills', ['harvest', 'craft', 'wind'],
  G.poly([[36, 40], [64, 40], [72, 92], [28, 92]]) +
  G.limb(50, 40, 50, 6, 9, 5) + G.limb(50, 40, 84, 40, 9, 5) +
  G.limb(50, 40, 50, 74, 9, 5) + G.limb(50, 40, 16, 40, 9, 5) + G.circle(50, 40, 7));
charge('gateArch', 'city gate', 'gates', ['gate', 'trade', 'law', 'road'],
  G.arch(50, 18, 90, 34) + G.archHole(50, 40, 90, 18) +
  G.rect(8, 74, 84, 16) + G.crenels(12, 88, 4, 18, 5));

/* --- arms & war --- */
charge('sword', 'sword', 'swords', ['war', 'watch', 'oath', 'steel'],
  G.poly([[50, 4], [57, 24], [57, 60], [43, 60], [43, 24]]) +
  G.rect(28, 60, 44, 9) + G.rect(45, 69, 10, 17) + G.circle(50, 89, 8), { crossable: true });
charge('axe', 'battle-axe', 'battle-axes', ['war', 'wood', 'craft', 'steel'],
  G.rect(46, 6, 8, 84) +
  G.blob([[54, 18], [74, 20], [86, 34], [86, 52], [72, 66], [54, 68]]) +
  G.blob([[46, 18], [26, 20], [14, 34], [14, 52], [28, 66], [46, 68]]), { crossable: true });
charge('warhammer', 'war hammer', 'war hammers', ['war', 'craft', 'forge', 'stone'],
  G.poly([[22, 16], [78, 16], [84, 30], [78, 44], [22, 44], [16, 30]]) +
  G.rect(45, 44, 10, 48), { crossable: true });
charge('mace', 'mace', 'maces', ['war', 'law', 'steel'],
  G.circle(50, 26, 20) + G.star(50, 26, 32, 20, 8, 0) + G.rect(45, 44, 10, 48));
charge('spear', 'spear', 'spears', ['war', 'hunt', 'watch'],
  G.poly([[50, 4], [60, 26], [50, 34], [40, 26]]) + G.rect(46, 30, 8, 62), { crossable: true });
charge('bow', 'bow', 'bows', ['hunt', 'war', 'wood', 'forest'],
  'M30,8 C58,22 58,78 30,92 L26,86 C50,74 50,26 26,14 Z' + G.limb(28, 10, 28, 90, 4, 4));
charge('arrow', 'arrow', 'arrows', ['hunt', 'war', 'road'],
  G.poly([[50, 4], [62, 28], [50, 22], [38, 28]]) + G.rect(46, 20, 8, 60) +
  G.poly([[46, 78], [46, 94], [36, 84]]) + G.poly([[54, 78], [54, 94], [64, 84]]), { crossable: true });
charge('dagger', 'dagger', 'daggers', ['crime', 'shadow', 'war'],
  G.poly([[50, 8], [56, 26], [56, 56], [44, 56], [44, 26]]) + G.rect(34, 56, 32, 7) + G.rect(46, 63, 8, 22) + G.circle(50, 88, 6), { crossable: true });
charge('helm', 'great helm', 'helms', ['war', 'watch', 'oath', 'steel'],
  'M22,18 C22,10 32,5 50,5 C68,5 78,10 78,18 V50 C78,74 66,90 50,96 C34,90 22,74 22,50 Z' +
  G.rectHole(27, 30, 46, 9) + G.rectHole(34, 50, 32, 6) + G.rectHole(36, 62, 28, 6) +
  G.rect(18, 16, 64, 7));
charge('gauntlet', 'gauntlet', 'gauntlets', ['war', 'oath', 'craft'],
  G.rect(30, 34, 40, 34) + G.rect(26, 68, 48, 22) +
  G.rect(32, 14, 9, 22) + G.rect(45, 8, 9, 28) + G.rect(58, 14, 9, 22) + G.rect(68, 30, 9, 18));
charge('escutcheon', 'escutcheon', 'escutcheons', ['oath', 'law', 'war', 'noble'],
  'M14,12 H86 V52 C86,74 70,88 50,94 C30,88 14,74 14,52 Z');

/* --- craft & trade --- */
charge('anvil', 'anvil', 'anvils', ['forge', 'craft', 'metal', 'dwarf'],
  G.poly([[14, 28], [78, 28], [90, 38], [72, 46], [60, 46], [60, 56], [68, 64], [32, 64], [40, 56], [40, 46], [24, 46], [14, 38]]) +
  G.poly([[36, 64], [64, 64], [76, 90], [24, 90]]));
charge('hammer', 'smith hammer', 'hammers', ['forge', 'craft', 'metal'],
  G.poly([[22, 18], [78, 18], [82, 32], [78, 46], [22, 46], [18, 32]]) + G.rect(45, 46, 10, 46), { crossable: true });
charge('tongs', 'pair of tongs', 'tongs', ['forge', 'craft', 'metal'],
  G.limb(44, 92, 26, 26, 12, 9) + G.limb(56, 92, 74, 26, 12, 9) +
  G.poly([[26, 30], [40, 20], [44, 30], [30, 40]]) + G.poly([[74, 30], [60, 20], [56, 30], [70, 40]]) +
  G.circle(50, 86, 10) + G.circle(50, 86, 4, true) + G.rect(38, 14, 24, 10));
charge('cog', 'cog-wheel', 'cog-wheels', ['craft', 'gnome', 'invention', 'mill'],
  (function () {
    var d = '', i, a;
    for (i = 0; i < 10; i++) {
      a = i * Math.PI / 5;
      d += G.poly([
        [50 + Math.cos(a - 0.14) * 32, 50 + Math.sin(a - 0.14) * 32],
        [50 + Math.cos(a - 0.1) * 45, 50 + Math.sin(a - 0.1) * 45],
        [50 + Math.cos(a + 0.1) * 45, 50 + Math.sin(a + 0.1) * 45],
        [50 + Math.cos(a + 0.14) * 32, 50 + Math.sin(a + 0.14) * 32]
      ]);
    }
    return d + G.circle(50, 50, 33) + G.circle(50, 50, 13, true);
  })());
charge('pickaxe', 'pickaxe', 'pickaxes', ['mine', 'stone', 'dwarf', 'craft'],
  'M8,34 C30,14 70,14 92,34 L86,44 C66,28 34,28 14,44 Z' + G.rect(45, 30, 10, 62), { crossable: true });
charge('chain', 'chain of three links', 'chains', ['bind', 'law', 'craft', 'crime'],
  G.ellipse(50, 22, 13, 18) + G.ellipse(50, 22, 7, 11, 0, true) +
  G.ellipse(50, 50, 13, 18) + G.ellipse(50, 50, 7, 11, 0, true) +
  G.ellipse(50, 78, 13, 18) + G.ellipse(50, 78, 7, 11, 0, true));
charge('scales', 'pair of scales', 'scales', ['law', 'trade', 'court', 'faith'],
  G.rect(46, 12, 8, 68) + G.rect(26, 78, 48, 10) + G.rect(16, 22, 68, 7) +
  'M6,30 C6,46 34,46 34,30 Z' + 'M66,30 C66,46 94,46 94,30 Z' + G.circle(50, 12, 8));
charge('coin', 'coin', 'coins', ['trade', 'coin', 'wealth'],
  G.circle(50, 50, 34) + G.circle(50, 50, 25, true) + G.star(50, 50, 20, 9, 6));
charge('barrel', 'tun', 'tuns', ['trade', 'drink', 'harvest'],
  G.blob([[50, 10], [76, 22], [82, 50], [76, 78], [50, 90], [24, 78], [18, 50], [24, 22]]) +
  G.rectHole(18, 30, 64, 6) + G.rectHole(18, 64, 64, 6));
charge('tankard', 'tankard', 'tankards', ['drink', 'trade', 'feast'],
  G.rect(22, 26, 44, 62) + G.poly([[18, 20], [70, 20], [66, 30], [22, 30]]) +
  'M66,38 C88,38 88,70 66,70 L66,60 C76,60 76,48 66,48 Z');
charge('quill', 'quill pen', 'quills', ['learning', 'law', 'court', 'scribe'],
  G.blob([[74, 8], [84, 26], [70, 52], [46, 74], [30, 80], [40, 60], [56, 34]]) + G.limb(40, 66, 16, 92, 7, 3));
charge('shuttle', 'weaver shuttle', 'shuttles', ['cloth', 'craft', 'trade'],
  G.blob([[8, 50], [34, 34], [66, 34], [92, 50], [66, 66], [34, 66]]) + G.rectHole(38, 44, 24, 12));

/* --- sea & river --- */
charge('anchor', 'anchor', 'anchors', ['sea', 'port', 'trade', 'hope'],
  G.rect(45, 20, 10, 62) + G.rect(26, 30, 48, 9) + G.circle(50, 14, 10) + G.circle(50, 14, 5, true) +
  'M12,54 C12,84 32,92 50,92 C68,92 88,84 88,54 L78,54 C78,74 64,82 50,82 C36,82 22,74 22,54 Z');
charge('ship', 'lymphad', 'lymphads', ['sea', 'port', 'trade', 'raid'],
  'M6,60 C18,86 82,86 94,60 L86,56 H14 Z' + G.rect(10, 52, 80, 9) +
  G.poly([[6, 58], [9, 36], [17, 38], [15, 58]]) + G.poly([[94, 58], [91, 36], [83, 38], [85, 58]]) +
  G.rect(47, 6, 6, 48) + G.rect(16, 14, 68, 6) +
  'M20,20 H80 V44 C64,53 36,53 20,44 Z' +
  G.poly([[53, 2], [76, 7], [53, 12]]));
charge('fish', 'fish naiant', 'fishes', ['river', 'sea', 'food', 'trade'],
  G.blob([[12, 50], [34, 30], [62, 26], [80, 38], [88, 50], [80, 62], [62, 74], [34, 70]]) +
  G.poly([[80, 50], [96, 32], [96, 68]]) + G.circle(30, 44, 5, true));
charge('dolphin', 'dolphin haurient', 'dolphins', ['sea', 'port', 'grace'],
  G.blob([[52, 6], [70, 22], [76, 48], [70, 74], [50, 92], [36, 74], [34, 46], [40, 22]]) +
  G.poly([[70, 30], [92, 26], [74, 46]]) + G.poly([[50, 92], [30, 96], [40, 78]]) + G.circle(56, 20, 4, true));
charge('trident', 'trident', 'tridents', ['sea', 'storm', 'faith', 'war'],
  G.rect(46, 26, 8, 66) + G.rect(20, 26, 60, 8) +
  G.poly([[16, 30], [24, 30], [20, 6]]) + G.poly([[46, 30], [54, 30], [50, 4]]) + G.poly([[76, 30], [84, 30], [80, 6]]));
charge('shell', 'escallop', 'escallops', ['sea', 'pilgrim', 'faith', 'port'],
  (function () {
    var pts = [[50, 92]], i, a;
    for (i = 0; i <= 12; i++) {
      a = Math.PI + (i / 12) * Math.PI;
      pts.push([50 + Math.cos(a) * 44, 60 + Math.sin(a) * 46 * (i % 2 ? 0.86 : 1)]);
    }
    return G.poly(pts) + G.rect(40, 84, 20, 8);
  })());
charge('waves', 'wave', 'waves', ['sea', 'river', 'water', 'port'],
  (function () {
    var d = '', i, y;
    for (i = 0; i < 3; i++) {
      y = 26 + i * 24;
      d += 'M4,' + y + edge(4, y, 96, y, 'wavy', 8, 30) + 'L96,' + (y + 11) + edge(96, y + 11, 4, y + 11, 'wavy', 8, 30) + 'Z';
    }
    return d;
  })());
charge('waterdrop', 'goutte', 'gouttes', ['water', 'river', 'rain', 'alchemy'],
  G.blob([[50, 6], [66, 34], [76, 58], [66, 82], [50, 92], [34, 82], [24, 58], [34, 34]]));

/* --- nature --- */
charge('oakTree', 'oak tree', 'oak trees', ['forest', 'wood', 'growth', 'elf'],
  G.blob([[50, 6], [72, 12], [86, 28], [88, 48], [74, 62], [50, 68], [26, 62], [12, 48], [14, 28], [28, 12]]) +
  G.rect(43, 60, 14, 32) + G.rect(28, 88, 44, 6));
charge('pineTree', 'pine tree', 'pine trees', ['forest', 'mountain', 'cold', 'wood'],
  G.poly([[50, 4], [70, 34], [30, 34]]) + G.poly([[50, 22], [78, 58], [22, 58]]) +
  G.poly([[50, 42], [86, 80], [14, 80]]) + G.rect(44, 78, 12, 14) + G.rect(30, 90, 40, 6));
charge('leaf', 'leaf', 'leaves', ['forest', 'growth', 'elf', 'nature'],
  G.blob([[50, 6], [74, 26], [82, 54], [64, 80], [50, 92], [36, 80], [18, 54], [26, 26]]) + G.limb(50, 40, 50, 92, 5, 3));
charge('rose', 'rose', 'roses', ['bloom', 'court', 'love', 'noble'],
  (function () {
    var d = '', i, a;
    for (i = 0; i < 5; i++) {
      a = -Math.PI / 2 + i * 2 * Math.PI / 5;
      d += G.circle(50 + Math.cos(a) * 26, 50 + Math.sin(a) * 26, 21);
    }
    return d + G.circle(50, 50, 15, true) + G.circle(50, 50, 9);
  })());
charge('wheatSheaf', 'garb of wheat', 'garbs', ['harvest', 'food', 'plenty', 'farm'],
  G.blob([[50, 4], [66, 18], [76, 44], [78, 70], [64, 90], [50, 94], [36, 90], [22, 70], [24, 44], [34, 18]]) +
  G.rectHole(20, 44, 60, 9) + G.rectHole(20, 62, 60, 9));
charge('grapes', 'bunch of grapes', 'bunches of grapes', ['wine', 'harvest', 'feast', 'trade'],
  G.circle(50, 28, 12) + G.circle(34, 44, 12) + G.circle(66, 44, 12) +
  G.circle(50, 52, 12) + G.circle(38, 68, 12) + G.circle(62, 68, 12) + G.circle(50, 84, 11) +
  G.limb(50, 20, 62, 6, 5, 3));
charge('mushroom', 'mushroom', 'mushrooms', ['fungus', 'underdark', 'food', 'strange'],
  'M6,54 C6,22 94,22 94,54 C74,62 26,62 6,54 Z' + G.poly([[38, 56], [62, 56], [58, 92], [42, 92]]));
charge('thistle', 'thistle', 'thistles', ['wild', 'cold', 'hardy', 'nature'],
  G.star(50, 24, 26, 12, 9, -90) + G.blob([[50, 34], [64, 46], [62, 62], [50, 70], [38, 62], [36, 46]]) +
  G.rect(46, 66, 8, 26) + G.poly([[46, 74], [24, 66], [44, 84]]) + G.poly([[54, 74], [76, 66], [56, 84]]));
charge('mountain', 'mountain', 'mountains', ['mountain', 'stone', 'dwarf', 'height'],
  G.poly([[50, 8], [92, 88], [8, 88]]) + G.poly([[50, 8], [66, 38], [50, 32], [34, 38]]) +
  G.poly([[22, 54], [40, 88], [4, 88]]) + G.poly([[78, 54], [96, 88], [60, 88]]));
charge('flame', 'flame', 'flames', ['fire', 'forge', 'faith', 'volcano'],
  G.blob([[50, 4], [64, 28], [78, 46], [76, 70], [58, 90], [42, 90], [24, 70], [26, 44], [36, 34], [40, 46]]));
charge('snowflake', 'snowflake', 'snowflakes', ['cold', 'winter', 'north'],
  (function () {
    var d = '', i, a, x, y;
    for (i = 0; i < 6; i++) {
      a = i * Math.PI / 3; x = 50 + Math.cos(a) * 44; y = 50 + Math.sin(a) * 44;
      d += G.limb(50, 50, x, y, 9, 5);
      d += G.limb(50 + Math.cos(a) * 26, 50 + Math.sin(a) * 26,
                  50 + Math.cos(a + 0.6) * 40, 50 + Math.sin(a + 0.6) * 40, 6, 3);
      d += G.limb(50 + Math.cos(a) * 26, 50 + Math.sin(a) * 26,
                  50 + Math.cos(a - 0.6) * 40, 50 + Math.sin(a - 0.6) * 40, 6, 3);
    }
    return d + G.circle(50, 50, 9);
  })());
charge('lightning', 'thunderbolt', 'thunderbolts', ['storm', 'sky', 'wrath', 'arcane'],
  G.poly([[58, 4], [26, 52], [46, 52], [36, 96], [76, 40], [54, 40], [70, 4]]));
charge('cloud', 'cloud', 'clouds', ['sky', 'storm', 'mist', 'air'],
  G.circle(30, 58, 22) + G.circle(52, 44, 27) + G.circle(74, 58, 20) + G.rect(12, 58, 76, 20));
charge('acorn', 'acorn', 'acorns', ['forest', 'growth', 'wood', 'luck'],
  G.blob([[50, 34], [72, 46], [74, 70], [50, 92], [26, 70], [28, 46]]) +
  'M20,34 C20,16 80,16 80,34 C64,42 36,42 20,34 Z' + G.rect(46, 8, 8, 12));

/* --- civic, faith & lore --- */
charge('crown', 'crown', 'crowns', ['rule', 'noble', 'court', 'law'],
  G.poly([[12, 74], [88, 74], [82, 26], [66, 48], [50, 18], [34, 48], [18, 26]]) +
  G.rect(10, 74, 80, 14) + G.circle(50, 14, 7) + G.circle(18, 22, 6) + G.circle(82, 22, 6));
charge('key', 'key', 'keys', ['gate', 'trade', 'secret', 'faith'],
  G.circle(50, 22, 17) + G.circle(50, 22, 8, true) + G.rect(45, 38, 10, 54) +
  G.rect(55, 62, 16, 9) + G.rect(55, 78, 12, 9), { crossable: true });
charge('chalice', 'chalice', 'chalices', ['faith', 'feast', 'drink', 'healing'],
  'M22,16 H78 C78,50 62,60 50,62 C38,60 22,50 22,16 Z' + G.rect(45, 60, 10, 22) + 'M26,92 C26,78 74,78 74,92 Z');
charge('book', 'open book', 'books', ['learning', 'law', 'arcane', 'scribe'],
  'M6,26 C24,18 44,20 50,28 C56,20 76,18 94,26 L94,78 C76,70 56,72 50,80 C44,72 24,70 6,78 Z' +
  G.rect(46, 28, 8, 52));
charge('scroll', 'scroll', 'scrolls', ['law', 'learning', 'arcane', 'scribe'],
  G.rect(20, 24, 60, 52) + G.ellipse(20, 24, 10, 10) + G.ellipse(80, 24, 10, 10) +
  G.ellipse(20, 76, 10, 10) + G.ellipse(80, 76, 10, 10) + G.rectHole(32, 38, 36, 5) + G.rectHole(32, 52, 36, 5));
charge('harp', 'harp', 'harps', ['music', 'bard', 'court', 'elf'],
  'M22,90 C14,54 26,18 62,8 L74,14 C42,26 28,58 34,90 Z' + G.rect(18, 86, 60, 8) +
  G.limb(64, 20, 40, 88, 4, 4) + G.limb(70, 30, 50, 88, 4, 4) + G.limb(74, 44, 60, 88, 4, 4));
charge('bell', 'bell', 'bells', ['watch', 'faith', 'alarm', 'law'],
  'M18,74 C18,36 32,16 50,12 C68,16 82,36 82,74 Z' + G.rect(12, 74, 76, 10) + G.circle(50, 90, 8));
charge('candle', 'candle', 'candles', ['faith', 'vigil', 'light', 'learning'],
  G.rect(38, 30, 24, 52) + G.rect(28, 82, 44, 10) +
  G.blob([[50, 4], [58, 16], [58, 26], [50, 32], [42, 26], [42, 16]]));
charge('torch', 'torch', 'torches', ['fire', 'light', 'watch', 'freedom'],
  G.blob([[50, 4], [62, 20], [66, 36], [50, 46], [34, 36], [38, 20]]) +
  G.poly([[40, 44], [60, 44], [56, 92], [44, 92]]) + G.rect(34, 44, 32, 9));
charge('hand', 'hand appaumy', 'hands', ['oath', 'law', 'faith', 'craft'],
  G.rect(30, 40, 40, 30) + 'M26,68 C26,90 74,90 74,68 Z' +
  G.rect(30, 18, 9, 24) + G.rect(42, 12, 9, 30) + G.rect(54, 16, 9, 26) + G.rect(65, 26, 9, 18) +
  G.rect(20, 44, 10, 20));
charge('heart', 'heart', 'hearts', ['love', 'faith', 'oath', 'healing'],
  'M50,92 C10,62 8,34 26,22 C40,13 50,26 50,34 C50,26 60,13 74,22 C92,34 90,62 50,92 Z');
charge('eye', 'eye', 'eyes', ['secret', 'watch', 'arcane', 'seer'],
  'M6,50 C24,24 76,24 94,50 C76,76 24,76 6,50 Z' + G.circle(50, 50, 19, true) + G.circle(50, 50, 11));
charge('skull', 'skull', 'skulls', ['death', 'shadow', 'undead', 'warning'],
  G.blob([[50, 8], [76, 20], [84, 44], [76, 64], [62, 70], [62, 82], [38, 82], [38, 70], [24, 64], [16, 44], [24, 20]]) +
  G.circle(37, 44, 9, true) + G.circle(63, 44, 9, true) + G.polyHole([[50, 54], [56, 66], [44, 66]]));
charge('hourglass', 'hourglass', 'hourglasses', ['fate', 'time', 'arcane', 'death'],
  G.rect(18, 8, 64, 10) + G.rect(18, 82, 64, 10) +
  G.poly([[24, 18], [76, 18], [54, 50], [76, 82], [24, 82], [46, 50]]));
charge('lantern', 'lantern', 'lanterns', ['light', 'watch', 'road', 'guide'],
  G.poly([[24, 30], [76, 30], [80, 76], [20, 76]]) + G.rect(16, 76, 68, 10) + G.rect(20, 22, 60, 8) +
  'M34,22 C34,4 66,4 66,22 L58,22 C58,14 42,14 42,22 Z' + G.rectHole(34, 40, 32, 28));

/* --- arcane --- */
charge('pentacle', 'pentacle', 'pentacles', ['arcane', 'ward', 'secret'],
  G.circle(50, 50, 44) + G.circle(50, 50, 37, true) +
  (function () {
    var d = '', pts = [], i, a;
    for (i = 0; i < 5; i++) { a = -Math.PI / 2 + i * 2 * Math.PI / 5; pts.push([50 + Math.cos(a) * 34, 50 + Math.sin(a) * 34]); }
    for (i = 0; i < 5; i++) d += G.limb(pts[i][0], pts[i][1], pts[(i + 2) % 5][0], pts[(i + 2) % 5][1], 6, 6);
    return d;
  })());
charge('crystal', 'crystal', 'crystals', ['gem', 'arcane', 'mine', 'wealth'],
  G.poly([[50, 4], [76, 40], [64, 92], [36, 92], [24, 40]]) +
  G.poly([[50, 4], [62, 40], [50, 46], [38, 40]]) + G.poly([[24, 40], [38, 40], [36, 92]]));
charge('orb', 'orb', 'orbs', ['arcane', 'rule', 'faith', 'seer'],
  G.circle(50, 58, 33) + G.rect(46, 8, 8, 26) + G.rect(34, 18, 32, 8) + G.circle(50, 58, 20, true));
charge('portal', 'planar arch', 'arches', ['arcane', 'planar', 'gate', 'strange'],
  G.arch(50, 8, 92, 40) + G.archHole(50, 22, 92, 27) +
  G.star(50, 52, 14, 6, 4, -90) + G.rect(10, 84, 80, 8));
charge('staff', 'staff', 'staves', ['arcane', 'learning', 'road', 'faith'],
  G.rect(45, 24, 10, 68) + G.circle(50, 18, 15) + G.circle(50, 18, 8, true) + G.star(50, 18, 8, 3, 4, -90));
charge('alembic', 'alembic', 'alembics', ['alchemy', 'craft', 'learning', 'poison'],
  G.blob([[50, 30], [74, 48], [78, 70], [60, 88], [40, 88], [22, 70], [26, 48]]) +
  G.rect(42, 8, 16, 26) + G.rect(34, 4, 32, 8) + 'M74,44 C92,44 92,72 78,74 L76,64 C84,62 84,54 74,54 Z');
charge('rune', 'rune-stone', 'rune-stones', ['rune', 'arcane', 'stone', 'dwarf', 'north'],
  G.poly([[24, 12], [76, 12], [84, 50], [76, 92], [24, 92], [16, 50]]) +
  G.limb(38, 28, 38, 76, 8, 8) + G.limb(38, 34, 64, 52, 8, 8) + G.limb(38, 58, 62, 76, 8, 8));

/* --- creatures (body:true may serve as supporters) ---
   The rearing beasts share one traced outline: a heraldic rampant body facing
   dexter, with head, wings, tail and forelegs added on top. */

var RAMPANT = [
  [8, 28], [12, 17], [17, 7], [23, 15], [31, 6], [43, 10], [53, 20], [63, 33],
  [75, 52], [79, 70], [75, 86], [83, 95], [61, 95], [64, 79], [57, 67], [45, 61],
  [33, 53], [25, 46], [16, 41], [9, 35]
];
/* Same body, but headless: for beasts that get a bird or reptile head. */
var RAMPANT_NECKLESS = [
  [30, 22], [40, 12], [52, 18], [63, 33], [75, 52], [79, 70], [75, 86], [83, 95],
  [61, 95], [64, 79], [57, 67], [45, 61], [33, 53], [26, 42]
];
var FORELEGS =
  G.limb(36, 50, 12, 41, 12, 8) + G.poly([[16, 34], [6, 40], [16, 48]]) +
  G.limb(40, 59, 20, 73, 11, 7) + G.poly([[24, 66], [12, 74], [26, 80]]);
var DRAGON_WING = G.blob([[44, 48], [46, 28], [54, 14], [66, 8], [64, 20], [76, 14],
                          [74, 28], [88, 26], [78, 40], [90, 50], [70, 54], [52, 54]], 0.9);

charge('dragon', 'dragon', 'dragons', ['dragon', 'wyrm', 'fire', 'power', 'fear'],
  DRAGON_WING +
  G.blob([[6, 22], [11, 12], [20, 8], [29, 15], [37, 24], [46, 36], [54, 50], [59, 66],
          [54, 82], [62, 94], [40, 94], [45, 79], [41, 64], [33, 52], [22, 42], [12, 33]], 0.85) +
  G.poly([[16, 9], [30, 1], [24, 13]]) + G.poly([[1, 24], [16, 19], [16, 28]]) +
  G.limb(36, 40, 18, 52, 11, 7) + G.poly([[22, 46], [8, 54], [24, 60]]) +
  G.limb(57, 64, 84, 78, 11, 4) + G.poly([[80, 71], [98, 78], [80, 88]]) +
  G.circle(18, 18, 3, true), { body: true });

charge('wyvern', 'wyvern', 'wyverns', ['dragon', 'wyrm', 'sky', 'fear', 'raid'],
  DRAGON_WING +
  G.blob([[8, 24], [13, 13], [22, 9], [31, 17], [39, 27], [48, 40], [55, 56], [52, 72],
          [46, 88], [54, 96], [32, 96], [38, 80], [36, 64], [28, 52], [18, 42], [11, 34]], 0.85) +
  G.poly([[18, 10], [32, 2], [26, 14]]) + G.poly([[3, 26], [18, 21], [18, 30]]) +
  G.limb(52, 62, 78, 72, 11, 4) +
  G.blob([[74, 66], [92, 60], [86, 74], [94, 90], [74, 80]], 0.8) +
  G.circle(20, 20, 3, true), { body: true });

charge('griffon', 'griffon', 'griffons', ['griffon', 'guard', 'noble', 'sky', 'oath'],
  DRAGON_WING + G.blob(RAMPANT_NECKLESS, 0.85) +
  G.blob([[10, 26], [14, 15], [23, 10], [32, 16], [36, 28], [32, 40], [22, 44], [14, 38]], 0.9) +
  G.poly([[12, 22], [1, 27], [13, 33]]) +
  G.limb(34, 44, 14, 52, 11, 7) + G.poly([[18, 46], [4, 54], [20, 60]]) +
  G.limb(74, 62, 94, 44, 9, 4) + G.blob([[92, 48], [99, 34], [88, 36], [86, 46]], 0.8) +
  G.circle(20, 22, 3, true), { body: true });

charge('lion', 'lion rampant', 'lions', ['lion', 'noble', 'courage', 'rule', 'guard'],
  G.blob(RAMPANT_NECKLESS, 0.85) +
  G.star(29, 27, 23, 16, 9, -90) +                       /* the ruff of the mane */
  G.circle(26, 27, 14) +
  G.blob([[7, 28], [15, 21], [23, 27], [16, 36], [8, 35]], 0.9) +
  G.poly([[17, 11], [12, 2], [25, 6]]) + G.poly([[35, 7], [44, 3], [43, 14]]) +
  FORELEGS +
  G.limb(74, 56, 92, 28, 9, 5) + G.circle(93, 21, 8) +
  G.circle(19, 25, 3, true), { body: true });

charge('bear', 'bear', 'bears', ['bear', 'wild', 'strength', 'forest', 'north'],
  G.blob(RAMPANT_NECKLESS, 0.85) +
  G.circle(25, 29, 17) + G.circle(14, 13, 8) + G.circle(37, 11, 8) +
  G.blob([[4, 32], [13, 25], [21, 32], [13, 41], [5, 39]], 0.9) +
  FORELEGS + G.circle(20, 27, 3, true), { body: true });
charge('wolf', 'wolf', 'wolves', ['wolf', 'wild', 'hunt', 'forest', 'north'],
  G.ellipse(50, 54, 30, 17) +
  G.limb(70, 48, 82, 30, 12, 9) + G.ellipse(88, 26, 13, 8, -18) + G.poly([[97, 20], [84, 24], [88, 32]]) +
  G.poly([[76, 26], [76, 12], [86, 22]]) + G.poly([[86, 22], [92, 10], [94, 24]]) +
  G.limb(28, 62, 22, 88, 9, 7) + G.limb(38, 64, 40, 88, 9, 7) +
  G.limb(62, 64, 60, 88, 9, 7) + G.limb(72, 62, 76, 88, 9, 7) +
  G.limb(22, 50, 6, 34, 9, 4), { body: true });
charge('eagle', 'eagle displayed', 'eagles', ['eagle', 'sky', 'rule', 'watch', 'empire'],
  /* wings sweep up and out, the way a displayed eagle is always drawn */
  G.blob([[44, 34], [34, 20], [20, 8], [6, 4], [12, 18], [2, 18], [10, 32], [1, 34],
          [12, 46], [4, 50], [22, 54], [38, 48]], 0.8) +
  G.blob([[56, 34], [66, 20], [80, 8], [94, 4], [88, 18], [98, 18], [90, 32], [99, 34],
          [88, 46], [96, 50], [78, 54], [62, 48]], 0.8) +
  G.blob([[50, 22], [59, 34], [60, 54], [57, 72], [50, 80], [43, 72], [40, 54], [41, 34]], 0.9) +
  G.circle(50, 20, 11) + G.poly([[52, 13], [68, 20], [52, 27]]) +
  G.poly([[42, 72], [58, 72], [56, 96], [44, 96]]) +
  G.limb(44, 74, 33, 92, 8, 5) + G.poly([[27, 88], [38, 88], [37, 96], [26, 96]]) +
  G.limb(56, 74, 67, 92, 8, 5) + G.poly([[62, 88], [73, 88], [74, 96], [63, 96]]), { body: true });
charge('raven', 'raven', 'ravens', ['raven', 'shadow', 'secret', 'death', 'north'],
  G.ellipse(46, 54, 28, 18, -12) + G.circle(74, 34, 13) + G.poly([[86, 30], [98, 34], [86, 40]]) +
  G.blob([[38, 44], [56, 36], [70, 48], [50, 62], [30, 60]]) +
  G.poly([[18, 60], [4, 74], [26, 68]]) + G.limb(52, 68, 50, 86, 5, 4) + G.rect(42, 84, 18, 6), { body: true });
charge('owl', 'owl', 'owls', ['owl', 'learning', 'night', 'seer', 'watch'],
  G.ellipse(50, 62, 26, 30) + G.ellipse(50, 32, 27, 22) +
  G.poly([[26, 22], [24, 8], [38, 18]]) + G.poly([[74, 22], [76, 8], [62, 18]]) +
  G.circle(38, 34, 10, true) + G.circle(62, 34, 10, true) + G.poly([[50, 38], [56, 48], [44, 48]]) +
  G.rect(38, 88, 8, 6) + G.rect(54, 88, 8, 6), { body: true });
charge('stagHead', 'stag head caboshed', 'stag heads', ['stag', 'forest', 'hunt', 'grace', 'wild'],
  G.blob([[50, 34], [64, 44], [66, 62], [58, 84], [50, 92], [42, 84], [34, 62], [36, 44]]) +
  G.limb(42, 40, 24, 16, 8, 5) + G.limb(24, 16, 12, 8, 6, 4) + G.limb(30, 24, 16, 22, 5, 4) + G.limb(34, 32, 20, 34, 5, 4) +
  G.limb(58, 40, 76, 16, 8, 5) + G.limb(76, 16, 88, 8, 6, 4) + G.limb(70, 24, 84, 22, 5, 4) + G.limb(66, 32, 80, 34, 5, 4) +
  G.circle(43, 52, 5, true) + G.circle(57, 52, 5, true));
charge('boarHead', 'boar head', 'boar heads', ['boar', 'hunt', 'wild', 'courage', 'forest'],
  G.blob([[84, 30], [92, 50], [88, 72], [72, 88], [50, 92], [30, 84], [18, 68], [16, 50],
          [28, 34], [50, 24], [70, 22]], 0.85) +
  G.poly([[70, 24], [66, 6], [84, 20]]) +
  G.blob([[18, 56], [10, 62], [12, 74], [24, 78], [28, 68]], 0.9) +
  G.poly([[20, 66], [4, 74], [20, 76]]) + G.poly([[30, 78], [22, 96], [38, 84]]) +
  G.circle(56, 46, 5, true) + G.circle(14, 66, 3, true));
charge('bullHead', 'bull head', 'bull heads', ['bull', 'farm', 'strength', 'trade', 'plenty'],
  G.blob([[50, 30], [68, 38], [70, 58], [60, 82], [50, 90], [40, 82], [30, 58], [32, 38]]) +
  'M32,38 C14,34 4,18 10,6 C22,10 28,22 36,30 Z' + 'M68,38 C86,34 96,18 90,6 C78,10 72,22 64,30 Z' +
  G.circle(41, 48, 5, true) + G.circle(59, 48, 5, true) + G.ellipse(50, 76, 9, 6, 0, true));
charge('serpent', 'serpent nowed', 'serpents', ['serpent', 'poison', 'secret', 'healing', 'yuan'],
  'M14,86 C14,54 44,60 50,44 C56,28 40,18 30,26 C22,32 26,44 36,44 L36,54 C14,54 8,30 24,18 C42,4 70,16 62,44 C56,64 26,60 26,86 Z' +
  G.circle(64, 14, 9) + G.poly([[72, 12], [88, 8], [74, 18]]));
charge('kraken', 'kraken', 'krakens', ['kraken', 'sea', 'fear', 'deep', 'raid'],
  G.blob([[50, 12], [70, 22], [74, 44], [50, 58], [26, 44], [30, 22]]) +
  G.limb(36, 52, 14, 68, 11, 4) + G.limb(14, 68, 6, 88, 5, 3) +
  G.limb(44, 56, 32, 84, 11, 4) + G.limb(32, 84, 22, 96, 5, 3) +
  G.limb(56, 56, 68, 84, 11, 4) + G.limb(68, 84, 78, 96, 5, 3) +
  G.limb(64, 52, 86, 68, 11, 4) + G.limb(86, 68, 94, 88, 5, 3) +
  G.limb(50, 58, 50, 90, 10, 4) +
  G.circle(41, 34, 6, true) + G.circle(59, 34, 6, true), { body: true });
charge('spider', 'spider', 'spiders', ['spider', 'shadow', 'underdark', 'fear', 'drow'],
  G.ellipse(50, 62, 20, 24) + G.circle(50, 34, 13) +
  (function () {
    var d = '', i, s, y;
    for (i = 0; i < 4; i++) {
      s = i % 2 ? 1 : -1;
      y = 40 + Math.floor(i / 2) * 20;
      d += G.limb(50 + s * 14, y, 50 + s * 34, y - 12, 6, 3) + G.limb(50 + s * 34, y - 12, 50 + s * 44, y + 14, 4, 3);
      d += G.limb(50 + s * 14, y + 12, 50 + s * 36, y + 16, 6, 3) + G.limb(50 + s * 36, y + 16, 50 + s * 46, y + 34, 4, 3);
    }
    return d;
  })(), { body: true });
charge('bat', 'bat displayed', 'bats', ['bat', 'night', 'shadow', 'cave', 'strange'],
  G.blob([[50, 40], [30, 22], [10, 20], [18, 38], [8, 44], [22, 58], [40, 56]]) +
  G.blob([[50, 40], [70, 22], [90, 20], [82, 38], [92, 44], [78, 58], [60, 56]]) +
  G.ellipse(50, 52, 12, 20) + G.circle(50, 30, 11) +
  G.poly([[42, 24], [40, 8], [50, 20]]) + G.poly([[58, 24], [60, 8], [50, 20]]), { body: true });
charge('unicornHead', 'unicorn head', 'unicorn heads', ['unicorn', 'grace', 'fey', 'purity', 'elf'],
  G.blob([[8, 56], [14, 44], [26, 36], [40, 30], [52, 26], [62, 30], [69, 42], [72, 58],
          [70, 74], [60, 88], [46, 90], [38, 78], [28, 68], [16, 64]], 0.85) +
  G.poly([[52, 26], [90, 2], [62, 32]]) + G.poly([[62, 30], [68, 8], [76, 28]]) +
  G.blob([[64, 34], [82, 34], [92, 50], [88, 74], [76, 62], [70, 46]], 0.85) +
  G.circle(46, 46, 4, true) + G.circle(15, 55, 3, true));
charge('horse', 'horse', 'horses', ['horse', 'road', 'trade', 'war', 'plains'],
  G.ellipse(48, 52, 27, 17, -4) +
  G.limb(64, 46, 80, 24, 18, 12) +
  G.blob([[78, 12], [92, 14], [97, 24], [90, 34], [78, 32], [72, 22]], 0.9) +
  G.poly([[78, 14], [80, 2], [88, 13]]) +
  G.limb(30, 58, 24, 90, 11, 7) + G.limb(42, 62, 42, 90, 11, 7) +
  G.limb(58, 62, 60, 90, 11, 7) + G.limb(68, 56, 76, 90, 11, 7) +
  G.rect(20, 88, 10, 6) + G.rect(38, 88, 10, 6) + G.rect(56, 88, 10, 6) + G.rect(72, 88, 10, 6) +
  G.blob([[26, 42], [10, 46], [4, 66], [14, 62], [24, 52]], 0.9) +
  G.circle(84, 22, 3, true), { body: true });

/* -- 5. CRESTS (external ornament above the shield) -------------------------- */

/*  Drawn in a 200 x 70 box, baseline at y = 70. */
var CRESTS = {
  mural: {
    name: 'mural crown', tags: ['civic', 'fort'],
    d: G.crenels(52, 148, 18, 40, 5) + G.rect(48, 40, 104, 22) + G.rect(44, 62, 112, 8) +
       G.rectHole(60, 44, 12, 14) + G.rectHole(80, 44, 12, 14) + G.rectHole(100, 44, 12, 14) + G.rectHole(120, 44, 12, 14)
  },
  naval: {
    name: 'naval crown', tags: ['sea', 'port'],
    d: G.rect(48, 44, 104, 18) + G.rect(44, 62, 112, 8) +
       G.poly([[64, 44], [64, 20], [84, 32]]) + G.poly([[116, 44], [116, 20], [136, 32]]) +
       G.rect(94, 22, 12, 22) + G.rect(84, 30, 32, 6)
  },
  ducal: {
    name: 'ducal coronet', tags: ['rule', 'noble'],
    d: G.rect(46, 48, 108, 14) + G.rect(42, 62, 116, 8) +
       G.blob([[70, 48], [64, 30], [76, 22], [86, 32], [82, 48]]) +
       G.blob([[100, 46], [92, 24], [104, 14], [116, 24], [110, 46]]) +
       G.blob([[130, 48], [124, 32], [134, 22], [144, 30], [138, 48]])
  },
  laurel: {
    name: 'laurel wreath', tags: ['civic', 'law', 'peace'],
    d: 'M100,20 C60,20 34,42 34,66 L46,66 C46,46 68,30 100,30 C132,30 154,46 154,66 L166,66 C166,42 140,20 100,20 Z' +
       G.ellipse(52, 46, 10, 6, -40) + G.ellipse(70, 32, 10, 6, -25) + G.ellipse(92, 25, 10, 6, -8) +
       G.ellipse(148, 46, 10, 6, 40) + G.ellipse(130, 32, 10, 6, 25) + G.ellipse(108, 25, 10, 6, 8)
  },
  helm: {
    name: 'barred helm', tags: ['war', 'rule'],
    d: G.blob([[100, 12], [128, 22], [140, 44], [136, 64], [100, 70], [64, 64], [60, 44], [72, 22]]) +
       G.rectHole(72, 34, 56, 6) + G.rectHole(76, 46, 48, 6) + G.rectHole(80, 56, 40, 5)
  },
  antlers: {
    name: 'pair of antlers', tags: ['wild', 'forest', 'tribe'],
    d: G.limb(92, 68, 66, 24, 9, 5) + G.limb(66, 24, 50, 10, 6, 4) + G.limb(78, 46, 54, 40, 6, 4) + G.limb(84, 58, 62, 56, 6, 4) +
       G.limb(108, 68, 134, 24, 9, 5) + G.limb(134, 24, 150, 10, 6, 4) + G.limb(122, 46, 146, 40, 6, 4) + G.limb(116, 58, 138, 56, 6, 4)
  },
  arcaneOrb: {
    name: 'arcane orb', tags: ['arcane', 'learning'],
    d: G.circle(100, 34, 24) + G.circle(100, 34, 15, true) + G.star(100, 34, 14, 6, 6, -90) +
       G.rect(46, 58, 108, 12) + G.ellipse(100, 34, 30, 12, -20) + G.ellipse(100, 34, 26, 9, -20, true)
  },
  sunburst: {
    name: 'sunburst', tags: ['faith', 'light', 'sun'],
    d: G.sun(100, 40, 20, 40, 12) + G.circle(100, 40, 20) + G.rect(44, 62, 112, 8)
  },
  skullCrown: {
    name: 'crowned skull', tags: ['death', 'undead', 'fear'],
    d: G.blob([[100, 14], [124, 26], [130, 46], [120, 58], [110, 62], [110, 68], [90, 68], [90, 62], [80, 58], [70, 46], [76, 26]]) +
       G.circle(88, 42, 8, true) + G.circle(112, 42, 8, true) +
       G.poly([[70, 20], [76, 4], [86, 16], [100, 2], [114, 16], [124, 4], [130, 20]])
  },
  dragonCrest: {
    name: 'dragon issuant', tags: ['dragon', 'power'],
    d: G.rect(44, 62, 112, 8) + G.limb(100, 66, 84, 30, 20, 13) + G.ellipse(72, 24, 18, 11, -18) +
       G.poly([[54, 26], [78, 18], [78, 34]]) + G.poly([[80, 12], [96, 2], [88, 18]]) +
       G.blob([[104, 56], [126, 34], [148, 30], [140, 50], [122, 62]])
  },
  anvilCrest: {
    name: 'anvil', tags: ['forge', 'craft', 'dwarf'],
    d: G.poly([[52, 26], [132, 26], [148, 38], [124, 46], [112, 46], [112, 54], [120, 62], [80, 62], [88, 54], [88, 46], [64, 46], [52, 38]]) +
       G.rect(44, 62, 112, 8)
  }
};

H.SHAPES = SHAPES;
H.SHAPE_AFFINITY = SHAPE_AFFINITY;
H.DIVISIONS = DIVISIONS;
H.ORDINARIES = ORDINARIES;
H.CHARGES = C;
H.CRESTS = CRESTS;
H.BX = BX;
H.FESS = FESS;
H.numWord = numWord;
H.lineWord = lw;
H.bandStrip = bandStrip;

})(window.Heraldry);
