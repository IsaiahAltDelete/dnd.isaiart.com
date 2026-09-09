/* ==============================================================================
   HERALDRY-RENDER.JS - paints an arms object onto three surfaces.

   Everything is drawn in shield space (200 x 220) and then transformed, so the
   shield, the banner and the seal all show the same design.
   ============================================================================== */
(function (H) {
'use strict';

var G = H.G, n2 = H.n2, T = H.TINCTURE, CH = H.CHARGES;
var uidCounter = 0;

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* -- defs: gradients, furs, texture ------------------------------------------ */

function ermineSpot(x, y, fill) {
  return '<g transform="translate(' + x + ',' + y + ')" fill="' + fill + '">' +
    '<path d="M7,1 C11,8 14,11 14,15 C14,19 11,21 7,21 C3,21 0,19 0,15 C0,11 3,8 7,1 Z"/>' +
    '<circle cx="1.5" cy="3.5" r="1.6"/><circle cx="7" cy="-0.5" r="1.6"/><circle cx="12.5" cy="3.5" r="1.6"/>' +
    '</g>';
}

function furPattern(uid, key) {
  var t = T[key], id = uid + '-f-' + key;
  if (t.fur === 'ermine') {
    return '<pattern id="' + id + '" width="36" height="42" patternUnits="userSpaceOnUse">' +
      '<rect width="36" height="42" fill="' + t.hex + '"/>' +
      ermineSpot(4, 5, t.spot) + ermineSpot(22, 26, t.spot) + '</pattern>';
  }
  if (t.fur === 'vair') {
    return '<pattern id="' + id + '" width="34" height="34" patternUnits="userSpaceOnUse">' +
      '<rect width="34" height="34" fill="' + t.hex + '"/>' +
      '<path d="M0,0 H17 C17,10 11,13 8.5,17 C6,13 0,10 0,0 Z" fill="' + t.spot + '"/>' +
      '<path d="M17,34 H34 C34,24 28,21 25.5,17 C23,21 17,24 17,34 Z" fill="' + t.spot + '"/>' +
      '</pattern>';
  }
  /* potent */
  return '<pattern id="' + id + '" width="32" height="32" patternUnits="userSpaceOnUse">' +
    '<rect width="32" height="32" fill="' + t.hex + '"/>' +
    '<path d="M0,0 H16 V6 H10 V16 H6 V6 H0 Z" fill="' + t.spot + '"/>' +
    '<path d="M16,32 H32 V26 H26 V16 H22 V26 H16 Z" fill="' + t.spot + '"/>' +
    '</pattern>';
}

function gradient(uid, key) {
  var t = T[key];
  return '<linearGradient id="' + uid + '-g-' + key + '" x1="0.15" y1="0" x2="0.75" y2="1">' +
    '<stop offset="0%" stop-color="' + (t.hi || t.hex) + '"/>' +
    '<stop offset="46%" stop-color="' + t.hex + '"/>' +
    '<stop offset="100%" stop-color="' + (t.lo || t.hex) + '"/></linearGradient>';
}

function paint(uid, key) {
  var t = T[key];
  if (!t) return '#888';
  return t.fur ? 'url(#' + uid + '-f-' + key + ')' : 'url(#' + uid + '-g-' + key + ')';
}

function usedTinctures(a) {
  var keys = [];
  function add(k) { if (k && keys.indexOf(k) === -1) keys.push(k); }
  a.field.tinctures.forEach(add);
  if (a.ordinary) add(a.ordinary.t);
  a.charges.forEach(function (c) { add(c.t); });
  if (a.bordure) add(a.bordure.t);
  if (a.supporters) add(a.supporters.t);
  return keys;
}

function defsFor(uid, a, extra) {
  var d = '';
  usedTinctures(a).forEach(function (k) {
    d += gradient(uid, k);
    if (T[k].fur) d += furPattern(uid, k);
  });
  d += '<linearGradient id="' + uid + '-gloss" x1="0" y1="0" x2="0.4" y2="1">' +
       '<stop offset="0%" stop-color="#fff" stop-opacity="0.30"/>' +
       '<stop offset="42%" stop-color="#fff" stop-opacity="0.05"/>' +
       '<stop offset="100%" stop-color="#000" stop-opacity="0.28"/></linearGradient>';
  d += '<radialGradient id="' + uid + '-vig" cx="0.5" cy="0.42" r="0.75">' +
       '<stop offset="55%" stop-color="#000" stop-opacity="0"/>' +
       '<stop offset="100%" stop-color="#000" stop-opacity="0.38"/></radialGradient>';
  d += '<filter id="' + uid + '-grain"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" result="n"/>' +
       '<feColorMatrix in="n" type="saturate" values="0"/>' +
       '<feComponentTransfer><feFuncA type="linear" slope="0.5"/></feComponentTransfer>' +
       '<feComposite operator="in" in2="SourceGraphic"/></filter>';
  d += '<filter id="' + uid + '-drop" x="-25%" y="-25%" width="150%" height="150%">' +
       '<feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="#0d0805" flood-opacity="0.55"/></filter>';
  return '<defs>' + d + (extra || '') + '</defs>';
}

/* -- field, ordinary, bordure ------------------------------------------------ */

function fieldLayer(uid, a) {
  var div = H.DIVISIONS[a.field.division];
  var s = '<path d="' + G.rect(H.BX.x0, H.BX.y0, H.BX.x1 - H.BX.x0, H.BX.y1 - H.BX.y0) +
          '" fill="' + paint(uid, a.field.tinctures[0]) + '"/>';
  div.shapes(a.field.tinctures, a.field.line, a.field.count).forEach(function (sh) {
    s += '<path d="' + sh.d + '" fill="' + paint(uid, sh.t) + '"/>';
  });
  return s;
}

function ordinaryLayer(uid, a, shapeD) {
  if (!a.ordinary) return '';
  var def = H.ORDINARIES[a.ordinary.key], s = '';
  if (def.stroke) {
    var inset = def.inset || 0;
    var sc = (200 - inset * 2) / 200;
    var tf = 'translate(' + n2(100 - 100 * sc) + ',' + n2(110 - 110 * sc) + ') scale(' + n2(sc) + ')';
    s += '<g transform="' + tf + '"><path d="' + shapeD + '" fill="none" stroke="' + paint(uid, a.ordinary.t) +
         '" stroke-width="' + (def.stroke / sc) + '"/></g>';
    if (def.double) {
      var sc2 = (200 - (inset + def.double) * 2) / 200;
      var tf2 = 'translate(' + n2(100 - 100 * sc2) + ',' + n2(110 - 110 * sc2) + ') scale(' + n2(sc2) + ')';
      s += '<g transform="' + tf2 + '"><path d="' + shapeD + '" fill="none" stroke="' + paint(uid, a.ordinary.t) +
           '" stroke-width="' + (def.stroke / sc2) + '"/></g>';
    }
    return s;
  }
  def.shapes(a.ordinary.line).forEach(function (sh) {
    s += '<path d="' + sh.d + '" fill="' + paint(uid, a.ordinary.t) + '"/>';
  });
  return s;
}

function bordureLayer(uid, a, shapeD) {
  if (!a.bordure) return '';
  return '<path d="' + shapeD + '" fill="none" stroke="' + paint(uid, a.bordure.t) + '" stroke-width="17"/>';
}

/* -- charge placement -------------------------------------------------------- */

/*  Slots are normalised (0..1) inside a usable box, so the same arrangement
    works on a tall shield and on a wide banner.                               */
var SLOTS = {
  single: { f: 0.62, p: [[0.50, 0.50]] },
  two:    { f: 0.44, p: [[0.28, 0.46], [0.72, 0.46]] },
  three:  { f: 0.40, p: [[0.26, 0.26], [0.74, 0.26], [0.50, 0.76]] },
  around: { f: 0.40, p: [[0.26, 0.26], [0.74, 0.26], [0.50, 0.76]] },
  four:   { f: 0.35, p: [[0.27, 0.25], [0.73, 0.25], [0.27, 0.73], [0.73, 0.73]] },
  five:   { f: 0.30, p: [[0.24, 0.22], [0.76, 0.22], [0.50, 0.50], [0.24, 0.80], [0.76, 0.80]] },
  seme:   { f: 0.17, p: [[0.18, 0.12], [0.50, 0.12], [0.82, 0.12], [0.34, 0.37], [0.66, 0.37],
                         [0.18, 0.62], [0.50, 0.62], [0.82, 0.62], [0.34, 0.87], [0.66, 0.87],
                         [0.02, 0.37], [0.98, 0.37]] },
  crossed: { f: 0.60, p: [[0.50, 0.50], [0.50, 0.50]], rot: [-38, 38] },
  inLine: { f: 0.72, p: [[0.5, 0.5]] }
};

/* When a central ordinary occupies the middle, field charges move to its flanks. */
var AVOID = {
  fess:        [[0.50, 0.16], [0.20, 0.84], [0.80, 0.84]],
  twoBars:     [[0.50, 0.10], [0.50, 0.90], [0.20, 0.50]],
  threeBars:   [[0.50, 0.08], [0.50, 0.92], [0.50, 0.50]],
  pale:        [[0.14, 0.36], [0.86, 0.36], [0.14, 0.78]],
  twoPallets:  [[0.50, 0.30], [0.50, 0.75], [0.10, 0.50]],
  cross:       [[0.18, 0.20], [0.82, 0.20], [0.18, 0.76], [0.82, 0.76]],
  saltire:     [[0.50, 0.14], [0.14, 0.50], [0.86, 0.50], [0.50, 0.86]],
  chevron:     [[0.18, 0.20], [0.82, 0.20], [0.50, 0.72]],
  chevronels:  [[0.18, 0.16], [0.82, 0.16], [0.50, 0.10]],
  bend:        [[0.76, 0.20], [0.24, 0.78], [0.50, 0.50]],
  bendSinister:[[0.24, 0.20], [0.76, 0.78], [0.50, 0.50]],
  pall:        [[0.50, 0.16], [0.16, 0.72], [0.84, 0.72]],
  pile:        [[0.16, 0.30], [0.84, 0.30], [0.50, 0.86]],
  flaunches:   [[0.50, 0.22], [0.50, 0.55], [0.50, 0.86]],
  canton:      [[0.60, 0.60], [0.28, 0.82], [0.85, 0.30]]
};

function chargeMarkup(uid, key, tKey, cx, cy, size, rot) {
  var def = CH[key];
  if (!def) return '';
  var s = size / 100;
  var tf = 'translate(' + n2(cx) + ',' + n2(cy) + ')' + (rot ? ' rotate(' + rot + ')' : '') +
           ' scale(' + n2(s) + ') translate(-50,-50)';
  var t = T[tKey] || T.argent;
  var outline = t.klass === 'metal' || t.tone === 'bright' ? '#2a2018' : 'rgba(255,255,255,0.35)';
  return '<g transform="' + tf + '">' +
    '<path d="' + def.d + '" fill="' + paint(uid, tKey) + '" stroke="' + outline +
    '" stroke-width="' + n2(1.6 / s) + '" stroke-linejoin="round" paint-order="stroke"/>' +
    '</g>';
}

function chargeLayer(uid, a, box) {
  var s = '';
  var ordKey = a.ordinary ? a.ordinary.key : null;
  var avoid = ordKey && AVOID[ordKey] ? AVOID[ordKey] : null;

  a.charges.forEach(function (c) {
    var spec = SLOTS[c.arrangement] || SLOTS.single;
    var pts = spec.p.slice(0, Math.max(1, c.count));
    var factor = spec.f;

    if (c.on === 'ordinary' && a.ordinary) {
      var def = H.ORDINARIES[a.ordinary.key];
      var spot = def.spot ? def.spot() : { x: 100, y: 105, w: 150, h: 60 };
      var n = Math.max(1, c.count);
      var horiz = spot.w >= spot.h;
      var size = Math.min(horiz ? spot.w / n : spot.w, horiz ? spot.h : spot.h / n) * 0.84;
      for (var i = 0; i < n; i++) {
        var off = (i - (n - 1) / 2) * (horiz ? spot.w / n : spot.h / n);
        s += chargeMarkup(uid, c.key, c.t,
          spot.x + (horiz ? off : 0), spot.y + (horiz ? 0 : off), size, spot.rot || 0);
      }
      return;
    }

    if (avoid && c.arrangement !== 'seme' && c.arrangement !== 'crossed') {
      pts = avoid.slice(0, Math.max(1, c.count));
      factor = Math.min(factor, 0.34);
    }
    var side = Math.min(box.w, box.h);
    pts.forEach(function (p, i) {
      s += chargeMarkup(uid, c.key, c.t,
        box.x + p[0] * box.w, box.y + p[1] * box.h,
        side * factor, spec.rot ? spec.rot[i % spec.rot.length] : 0);
    });
  });
  return s;
}

/* -- the shield itself ------------------------------------------------------- */

function shieldGroup(uid, a, opts) {
  opts = opts || {};
  var shapeD = H.SHAPES[a.shape].d;
  var clipId = uid + '-clip';
  var box = opts.box || { x: 24, y: 22, w: 152, h: 168 };
  return '<clipPath id="' + clipId + '"><path d="' + shapeD + '"/></clipPath>' +
    '<g' + (opts.shadow === false ? '' : ' filter="url(#' + uid + '-drop)"') + '>' +
    '<g clip-path="url(#' + clipId + ')">' +
      fieldLayer(uid, a) +
      ordinaryLayer(uid, a, shapeD) +
      bordureLayer(uid, a, shapeD) +
      chargeLayer(uid, a, box) +
      '<path d="' + G.rect(H.BX.x0, H.BX.y0, H.BX.x1 - H.BX.x0, H.BX.y1 - H.BX.y0) + '" fill="url(#' + uid + '-gloss)" style="mix-blend-mode:soft-light"/>' +
      '<path d="' + G.rect(H.BX.x0, H.BX.y0, H.BX.x1 - H.BX.x0, H.BX.y1 - H.BX.y0) + '" fill="url(#' + uid + '-vig)"/>' +
      '<path d="' + G.rect(H.BX.x0, H.BX.y0, H.BX.x1 - H.BX.x0, H.BX.y1 - H.BX.y0) + '" fill="#7a5c34" filter="url(#' + uid + '-grain)" opacity="0.16" style="mix-blend-mode:multiply"/>' +
    '</g>' +
    '<path d="' + shapeD + '" fill="none" stroke="#1a120a" stroke-width="5" stroke-opacity="0.85"/>' +
    '<path d="' + shapeD + '" fill="none" stroke="#c5a059" stroke-width="2"/>' +
    '</g>';
}

/* -- crest, supporters, motto ------------------------------------------------ */

function crestGroup(uid, a) {
  var crest = H.CRESTS[a.crest];
  var metal = a.livery.filter(function (k) { return T[k].klass === 'metal'; })[0] || 'or';
  return '<g transform="translate(80,-4)">' +
    '<path d="' + crest.d + '" fill="' + paint(uid, metal) + '" stroke="#1a120a" stroke-width="2.2" stroke-linejoin="round" paint-order="stroke"/>' +
    '</g>';
}

function supporterGroup(uid, a) {
  if (!a.supporters) return '';
  var d = CH[a.supporters.key].d, fill = paint(uid, a.supporters.t);
  var one = '<path d="' + d + '" fill="' + fill + '" stroke="#1a120a" stroke-width="2" stroke-linejoin="round" paint-order="stroke"/>';
  return '<g opacity="0.97">' +
    '<g transform="translate(2,146) scale(1.5)">' + one + '</g>' +
    '<g transform="translate(358,146) scale(-1.5,1.5)">' + one + '</g>' +
    '</g>';
}

function compartmentGroup(uid, a) {
  if (!a.supporters) return '';
  return '<g><ellipse cx="180" cy="296" rx="140" ry="15" fill="#3c2a18" opacity="0.55"/>' +
    '<ellipse cx="180" cy="292" rx="134" ry="12" fill="#6b4a24" opacity="0.75"/>' +
    '<ellipse cx="180" cy="289" rx="120" ry="7" fill="#8a6432" opacity="0.6"/></g>';
}

/* Shrink the motto until it fits between the curls of the ribbon. */
function mottoSize(text) {
  var n = Math.max(1, String(text).length);
  return Math.max(9, Math.min(17, Math.floor((286 / n - 1.6) / 0.58)));
}

function mottoGroup(uid, a, y) {
  var text = a.motto.text, sub = a.motto.tongue === 'Common' ? '' : a.motto.en;
  var ribbon =
    'M22,' + (y + 8) + ' C46,' + (y - 4) + ' 314,' + (y - 4) + ' 338,' + (y + 8) +
    ' L338,' + (y + 36) + ' C314,' + (y + 48) + ' 46,' + (y + 48) + ' 22,' + (y + 36) + ' Z';
  var tailL = 'M22,' + (y + 8) + ' C10,' + (y + 12) + ' 6,' + (y + 30) + ' 14,' + (y + 42) +
              ' L26,' + (y + 36) + ' C20,' + (y + 26) + ' 20,' + (y + 16) + ' 22,' + (y + 8) + ' Z';
  var tailR = 'M338,' + (y + 8) + ' C350,' + (y + 12) + ' 354,' + (y + 30) + ' 346,' + (y + 42) +
              ' L334,' + (y + 36) + ' C340,' + (y + 26) + ' 340,' + (y + 16) + ' 338,' + (y + 8) + ' Z';
  return '<g>' +
    '<path d="' + tailL + '" fill="#b7a887" stroke="#4a3520" stroke-width="1.6"/>' +
    '<path d="' + tailR + '" fill="#b7a887" stroke="#4a3520" stroke-width="1.6"/>' +
    '<path d="' + ribbon + '" fill="#e8dcc0" stroke="#4a3520" stroke-width="1.8"/>' +
    '<text x="180" y="' + (y + 27) + '" text-anchor="middle" font-family="Cinzel, Georgia, serif" font-size="' +
    mottoSize(text) + '" letter-spacing="1.6" fill="#3a2412">' + esc(text) + '</text>' +
    (sub ? '<text x="180" y="' + (y + 60) + '" text-anchor="middle" font-family="IM Fell English, Georgia, serif" ' +
           'font-style="italic" font-size="13" fill="#7d6a4c">&#8220;' + esc(sub) + '&#8221;</text>' : '') +
    '</g>';
}

/* -- public renderers -------------------------------------------------------- */

function renderAchievement(a, opts) {
  opts = opts || {};
  var uid = 'h' + (++uidCounter);
  var mottoY = 306;
  var height = a.motto.tongue === 'Common' ? 366 : 382;
  return '<svg viewBox="0 0 360 ' + height + '" xmlns="http://www.w3.org/2000/svg" ' +
    'preserveAspectRatio="xMidYMid meet" class="arms-svg" role="img" aria-label="' + esc(opts.label || 'Coat of arms') + '">' +
    defsFor(uid, a) +
    supporterGroup(uid, a) +
    compartmentGroup(uid, a) +
    crestGroup(uid, a) +
    '<g transform="translate(80,62)">' + shieldGroup(uid, a) + '</g>' +
    mottoGroup(uid, a, mottoY) +
    '</svg>';
}

/* A bare shield, for the page header and small badges. */
function renderShield(a, opts) {
  opts = opts || {};
  var uid = 'h' + (++uidCounter);
  return '<svg viewBox="-6 -6 212 232" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" ' +
    'class="arms-svg" role="img" aria-label="' + esc(opts.label || 'Coat of arms') + '">' +
    defsFor(uid, a) + shieldGroup(uid, a, { shadow: opts.shadow !== false }) + '</svg>';
}

/* --- flags --- */

var FLAGS = {
  banner:      { d: 'M36,28 C92,20 162,32 216,24 L224,208 C162,216 92,204 36,212 Z', box: [46, 36, 168, 168], pole: 'staff' },
  rect:        { d: 'M36,46 C112,36 214,52 296,42 L302,188 C214,198 112,182 36,192 Z', box: [48, 54, 240, 126], pole: 'staff' },
  gonfalon:    { d: 'M64,58 H246 V196 L220,240 L194,196 L168,240 L142,196 L116,240 L90,196 L64,196 Z', box: [76, 66, 158, 122], pole: 'cross' },
  pennon:      { d: 'M36,62 C126,50 232,72 308,92 C232,112 126,134 36,122 Z', box: [50, 70, 150, 44], pole: 'staff' },
  swallowtail: { d: 'M36,46 C112,36 204,50 292,42 L254,116 L296,190 C204,198 112,182 36,192 Z', box: [48, 54, 190, 126], pole: 'staff' },
  guidon:      { d: 'M36,50 C112,40 200,54 288,46 C258,96 258,140 292,186 C200,194 112,178 36,186 Z', box: [48, 58, 190, 120], pole: 'staff' },
  standard:    { d: 'M36,62 C124,50 236,64 306,72 C292,86 292,98 306,112 C236,124 124,138 36,126 Z', box: [48, 70, 170, 48], pole: 'staff' }
};

function renderBanner(a, kind, opts) {
  opts = opts || {};
  kind = FLAGS[kind] ? kind : 'banner';
  var f = FLAGS[kind], uid = 'h' + (++uidCounter);
  var bx = f.box[0], by = f.box[1], bw = f.box[2], bh = f.box[3];

  /* Cover-scale the shield-space design into the flag's usable box. */
  var s = Math.max(bw / 190, bh / 200);
  var tx = bx + bw / 2 - 100 * s, ty = by + bh / 2 - 110 * s;
  /* The visible slice of shield space, used to lay the charges out. */
  var vis = { x: (bx - tx) / s, y: (by - ty) / s, w: bw / s, h: bh / s };
  var inner = { x: vis.x + vis.w * 0.10, y: vis.y + vis.h * 0.10, w: vis.w * 0.80, h: vis.h * 0.80 };

  var clipId = uid + '-fclip';
  var shapeD = H.SHAPES[a.shape].d;

  var folds = '', i;
  for (i = 0; i < 7; i++) {
    var fx = 30 + i * 42;
    folds += '<path d="M' + fx + ',0 C' + (fx + 10) + ',90 ' + (fx - 10) + ',170 ' + fx + ',260 L' +
             (fx + 18) + ',260 C' + (fx + 8) + ',170 ' + (fx + 28) + ',90 ' + (fx + 18) + ',0 Z" fill="' +
             (i % 2 ? '#ffffff' : '#000000') + '" opacity="0.07"/>';
  }

  var pole = f.pole === 'cross'
    ? '<rect x="150" y="8" width="9" height="46" rx="3" fill="#5a3a1e"/>' +
      '<rect x="44" y="46" width="222" height="11" rx="5" fill="#6b4726"/>' +
      '<circle cx="44" cy="51" r="8" fill="#c5a059"/><circle cx="266" cy="51" r="8" fill="#c5a059"/>' +
      '<path d="M154.5,10 L149,22 L160,22 Z" fill="#c5a059"/>'
    : '<rect x="26" y="26" width="11" height="238" rx="4" fill="#6b4726"/>' +
      '<path d="M31.5,2 C40,12 40,20 31.5,28 C23,20 23,12 31.5,2 Z" fill="#c5a059" stroke="#8f7236" stroke-width="1.5"/>' +
      '<rect x="24" y="30" width="15" height="6" rx="2" fill="#c5a059"/>';

  return '<svg viewBox="0 0 320 268" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" ' +
    'class="arms-svg" role="img" aria-label="' + esc(opts.label || 'Banner') + '">' +
    defsFor(uid, a, '<clipPath id="' + clipId + '"><path d="' + f.d + '"/></clipPath>') +
    pole +
    '<g filter="url(#' + uid + '-drop)">' +
      '<g clip-path="url(#' + clipId + ')">' +
        '<g transform="translate(' + n2(tx) + ',' + n2(ty) + ') scale(' + n2(s) + ')">' +
          fieldLayer(uid, a) +
          ordinaryLayer(uid, a, shapeD) +
        '</g>' +
        '<g transform="translate(' + n2(tx) + ',' + n2(ty) + ') scale(' + n2(s) + ')">' +
          chargeLayer(uid, a, inner) +
        '</g>' +
        folds +
        '<path d="' + f.d + '" fill="#7a5c34" filter="url(#' + uid + '-grain)" opacity="0.2" style="mix-blend-mode:multiply"/>' +
      '</g>' +
      '<path d="' + f.d + '" fill="none" stroke="#1a120a" stroke-width="3" stroke-opacity="0.7"/>' +
    '</g>' +
    '</svg>';
}

/* --- wax seal --- */

/*  Sealing wax only ever came in warm, readable colours - a sable seal on dark
    parchment shows nothing - so the livery is matched to the nearest real wax. */
var WAX_TINCTURES = ['gules', 'murrey', 'sanguine', 'tenne', 'vert', 'purpure', 'azure', 'copper'];
function waxTincture(a) {
  var fromLivery = a.livery.filter(function (k) { return WAX_TINCTURES.indexOf(k) !== -1; })[0];
  if (fromLivery) return fromLivery;
  /* Fall back on the mood of the arms rather than always defaulting to red. */
  var dark = a.livery.some(function (k) { return T[k].tone === 'dark'; });
  return dark ? 'sanguine' : 'gules';
}

function renderSeal(a, name, opts) {
  opts = opts || {};
  var uid = 'h' + (++uidCounter);
  var rng = H.makeRng(H.hashStr('seal|' + (name || '') + '|' + (a.seed || 0)));
  var pts = [], i, ang, r;
  for (i = 0; i < 44; i++) {
    ang = i / 44 * Math.PI * 2;
    r = 92 + (rng() - 0.5) * 7;
    pts.push([100 + Math.cos(ang) * r, 100 + Math.sin(ang) * r]);
  }
  var wax = T[waxTincture(a)];
  var main = a.charges[0];
  var rimId = uid + '-rim';

  return '<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" ' +
    'xmlns:xlink="http://www.w3.org/1999/xlink" preserveAspectRatio="xMidYMid meet" ' +
    'class="arms-svg" role="img" aria-label="' + esc(opts.label || 'City seal') + '">' +
    '<defs>' +
      '<radialGradient id="' + uid + '-wax" cx="0.4" cy="0.35" r="0.8">' +
        '<stop offset="0%" stop-color="' + (wax.hi || wax.hex) + '"/>' +
        '<stop offset="60%" stop-color="' + wax.hex + '"/>' +
        '<stop offset="100%" stop-color="' + (wax.lo || wax.hex) + '"/></radialGradient>' +
      '<filter id="' + uid + '-emboss"><feDropShadow dx="0" dy="1.5" stdDeviation="1" flood-color="#000" flood-opacity="0.5"/></filter>' +
      '<path id="' + rimId + '" d="M100,100 m-76,0 a76,76 0 1,1 152,0" fill="none"/>' +
      '<filter id="' + uid + '-grain"><feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="3" result="n"/>' +
      '<feColorMatrix in="n" type="saturate" values="0"/>' +
      '<feComponentTransfer><feFuncA type="linear" slope="0.5"/></feComponentTransfer>' +
      '<feComposite operator="in" in2="SourceGraphic"/></filter>' +
    '</defs>' +
    '<g filter="url(#' + uid + '-emboss)">' +
      '<path d="' + G.blob(pts, 0.6) + '" fill="url(#' + uid + '-wax)"/>' +
      '<path d="' + G.blob(pts, 0.6) + '" fill="#000" filter="url(#' + uid + '-grain)" opacity="0.22" style="mix-blend-mode:multiply"/>' +
      '<circle cx="100" cy="100" r="84" fill="none" stroke="' + (wax.lo || '#000') + '" stroke-width="2" opacity="0.7"/>' +
      '<circle cx="100" cy="100" r="60" fill="none" stroke="' + (wax.lo || '#000') + '" stroke-width="1.5" opacity="0.5"/>' +
      (main ? '<g opacity="0.95">' +
        '<path d="' + CH[main.key].d + '" transform="translate(101.5,102) scale(0.86) translate(-50,-50)" fill="' +
        (wax.lo || '#000') + '" opacity="0.8"/>' +
        '<path d="' + CH[main.key].d + '" transform="translate(99,98) scale(0.86) translate(-50,-50)" fill="' +
        (wax.hi || '#fff') + '" opacity="0.7"/></g>' : '') +
      (name ? '<text font-family="Cinzel, Georgia, serif" font-size="13" letter-spacing="3.4" fill="' +
        (wax.lo || '#000') + '" opacity="0.9"><textPath href="#' + rimId + '" xlink:href="#' + rimId +
        '" startOffset="50%" text-anchor="middle">' +
        esc(String(name).toUpperCase()) + '</textPath></text>' : '') +
    '</g>' +
    '</svg>';
}

H.renderAchievement = renderAchievement;
H.renderShield = renderShield;
H.renderBanner = renderBanner;
H.renderSeal = renderSeal;
H.waxTincture = waxTincture;
H.FLAG_KINDS = Object.keys(FLAGS);
H.escapeXml = esc;

})(window.Heraldry);
