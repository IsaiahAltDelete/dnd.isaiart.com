// render/portrait.js — painted 40x40 busts for dialogue and the party UI, from the same appearance data as the sprite.
//
// A 16x24 sprite blown up to fill a dialogue frame is eight pixels of face at
// 5x: two blue dots and a brown rectangle. This paints a real bust instead, at
// 40x40, from exactly what the sprite is made of (render/actor.js portraitLook):
// the species' face shape, the skin, eye and hair colours, the hair style and
// beard, horns and tusks and scales, the helm, and the calling's garment at the
// shoulders. Every surface is shaded off a hue-shifted ramp (palette.js) by a
// normal from its form, lit from the upper left like the world, and the finished
// bust gets the same selective outline and rim light as the sprites.
//
//   drawPortrait(ctx, ch, x, y, size, { h, bg, flip }) -> true if it painted
//
// The bust is drawn at an integer multiple of DEVICE pixels, whatever the
// transform (the 2x UI layers included), so it is always crisp: a 20px HUD slot
// on a fine layer is 40 device pixels and shows it 1:1, a 44px dialogue frame
// shows it at 2x. Painted once per look and cached.

import { ramp, outlineFor, mix, hexToHsl, RAMPS } from './palette.js';
import { finishSprite, setPortraitPainter } from './sprites.js';
import { portraitLook } from './actor.js';

export const PORTRAIT_SIZE = 40;
const S = 40, CX = 20;               // a symmetric row of half-width hw spans CX-hw .. CX+hw-1

// --- the raster: every pixel is a ramp and a step on it ----------------------

const TAG = { SKIN: 1, HAIR: 2, BEARD: 3, GARB: 4, HELM: 5, HORN: 6, FEAT: 7, BACK: 8 };

function raster() {
  const R = new Array(S * S).fill(null), L = new Int8Array(S * S), T = new Uint8Array(S * S);
  const ok = (x, y) => x >= 0 && y >= 0 && x < S && y < S;
  return {
    R, L, T,
    set(x, y, r, i, tag = 0) {
      if (!ok(x, y) || !r) return;
      const p = y * S + x;
      R[p] = r; L[p] = Math.max(0, Math.min(r.length - 1, i | 0)); T[p] = tag;
    },
    tag(x, y) { return ok(x, y) ? T[y * S + x] : 0; },
    has(x, y) { return ok(x, y) && R[y * S + x] !== null; },
    shade(x, y, d, tag) {
      if (!ok(x, y)) return;
      const p = y * S + x;
      if (!R[p] || (tag && T[p] !== tag)) return;
      L[p] = Math.max(0, Math.min(R[p].length - 1, L[p] + d));
    },
    level(x, y) { return ok(x, y) ? L[y * S + x] : 0; },
  };
}

/** Diffuse light off a unit normal, from the upper left and a little in front. */
function lit(nx, ny) {
  const q = 1 - nx * nx - ny * ny;
  return -0.58 * nx - 0.52 * ny + 0.63 * (q > 0 ? Math.sqrt(q) : 0);
}
/** Light -> step on a 5-step ramp. The midtone band is the widest. */
function band(v) { return v > 0.86 ? 4 : v > 0.56 ? 3 : v > 0.14 ? 2 : v > -0.22 ? 1 : 0; }
/**
 * Metal sits darker than cloth: polished steel is mostly the colour of what it
 * reflects, with the light concentrated into a small hard spot, not a white dome.
 */
function bandMetal(v) { return band(v - 0.24); }

const one = (hex) => [hex];

// --- the face -----------------------------------------------------------------

const HEAD_TOP = 6, CHIN = 28;
const BROW_Y = 14, LID_Y = 16, EYE_Y = 17, MOUTH_Y = 24;

/** Half-width of the head on each row, by the species' face and the body. */
function headRows(look) {
  const hw = new Array(S).fill(0);
  const base = { 6: 4, 7: 6, 8: 7, 9: 8, 22: 7, 23: 7, 24: 6, 25: 6, 26: 5, 27: 4, 28: 3 };
  for (let y = HEAD_TOP; y <= CHIN; y++) hw[y] = base[y] ?? 8;
  const sp = look.speciesId;
  const broad = sp === 'dwarf' || sp === 'orc' || sp === 'half-orc' || sp === 'goliath';
  const round = sp === 'halfling' || sp === 'gnome';
  const fine = sp === 'elf' || sp === 'aasimar' || look.body === 'f';
  if (broad) Object.assign(hw, { 14: 9, 15: 9, 16: 9, 17: 9, 18: 9, 19: 9, 20: 9, 21: 9, 22: 8, 23: 8, 24: 7, 25: 7, 26: 6, 27: 5, 28: 4 });
  else if (round) Object.assign(hw, { 7: 6, 8: 7, 20: 8, 21: 8, 22: 8, 23: 7, 24: 7, 25: 6, 26: 5, 27: 4, 28: 2 });
  if (fine && !broad) Object.assign(hw, { 22: 7, 23: 6, 24: 6, 25: 5, 26: 4, 27: 3, 28: 2 });
  return hw;
}

function paintHead(P, look, hw, K) {
  for (let y = HEAD_TOP; y <= CHIN; y++) {
    const w = hw[y];
    for (let x = CX - w; x < CX + w; x++) {
      const nx = (x + 0.5 - CX) / (w + 0.6), ny = (y - 15.5) / 13.5;
      P.set(x, y, K.skin, band(lit(nx * 0.95, ny) - (y > 24 ? 0.1 : 0)), TAG.SKIN);
    }
  }
  // Brow ridge and eye sockets: the one bit of modelling that makes a face a face.
  for (const ex of [CX - 6, CX + 3]) for (let x = ex; x < ex + 3; x++) P.shade(x, BROW_Y + 1, -1, TAG.SKIN);
  // Under the cheekbone, on the shadow side.
  P.shade(CX + 5, 21, -1, TAG.SKIN); P.shade(CX + 5, 22, -1, TAG.SKIN);
}

function paintNeck(P, look, K) {
  const w = look.build === 'body-broad' || look.build === 'body-tall' || look.build === 'body-stout' ? 5 : 4;
  for (let y = 24; y <= 33; y++) for (let x = CX - w; x < CX + w; x++) {
    const nx = (x + 0.5 - CX) / (w + 0.5);
    // Under the jaw is the darkest skin on the body.
    const v = lit(nx, 0.1) - (y < 30 ? 0.55 : 0.3);
    P.set(x, y, K.skin, band(v), TAG.SKIN);
  }
}

function paintEars(P, look, hw, K) {
  const ears = look.ears || 'round';
  if (look.snout) return;
  const shapes = {
    // [row, how far out from the face edge] from the top of the ear down
    round: [[16, 1], [17, 2], [18, 2], [19, 2], [20, 1]],
    pointed: [[12, 4], [13, 4], [14, 3], [15, 3], [16, 3], [17, 2], [18, 2], [19, 2], [20, 1]],
    long: [[9, 6], [10, 6], [11, 5], [12, 5], [13, 4], [14, 4], [15, 3], [16, 3], [17, 2], [18, 2], [19, 2], [20, 1]],
  };
  const sh = shapes[ears] || shapes.round;
  for (const side of [-1, 1]) {
    for (const [y, out] of sh) {
      const edge = side < 0 ? CX - hw[y] : CX + hw[y] - 1;
      for (let k = 1; k <= out; k++) P.set(edge + side * k, y, K.skin, side < 0 ? (k === out ? 3 : 2) : 1, TAG.SKIN);
    }
    // The ear's inner fold.
    const y = ears === 'round' ? 18 : 16;
    P.set(side < 0 ? CX - hw[y] - 1 : CX + hw[y], y, K.skin, 0, TAG.SKIN);
  }
}

function eyeColours(look, K) {
  const sclera = mix('#efe6d6', look.skin, 0.18);
  const iris = look.eye;
  const pupil = mix(ramp(iris, 5, { spread: 0.5 })[0], '#0c0808', 0.4);
  const lash = mix(outlineFor(look.skin, 1.2), K.hair[0], 0.45);
  return { sclera: one(sclera), iris: one(iris), pupil: one(pupil), lash: one(lash) };
}

function paintFace(P, look, hw, K) {
  const E = eyeColours(look, K);
  const glow = look.speciesId === 'tiefling' || look.speciesId === 'aasimar';
  // Eyes: a lid line over sclera and iris, pupils toward the middle so the
  // bust looks at the viewer rather than past them.
  for (const [ex, flip] of [[CX - 6, false], [CX + 3, true]]) {
    for (let x = ex; x < ex + 3; x++) P.set(x, LID_Y, E.lash, 0, TAG.FEAT);
    const row = glow ? [E.iris, E.iris, E.iris] : [E.sclera, E.iris, E.pupil];
    if (flip) row.reverse();
    row.forEach((c, k) => P.set(ex + k, EYE_Y, c, 0, TAG.FEAT));
    if (look.body === 'f') P.set(flip ? ex + 3 : ex - 1, LID_Y - (look.speciesId === 'elf' ? 1 : 0), E.lash, 0, TAG.FEAT);
  }
  // Brows, in the hair's shadow colour. A stern set tips the inner ends down.
  const stern = (look.seed >>> 3) % 3 === 0 || look.classId === 'barbarian' || look.speciesId === 'orc' || look.speciesId === 'half-orc';
  const heavy = ['dwarf', 'orc', 'half-orc', 'goliath'].includes(look.speciesId);
  const browC = K.hair;
  for (const [bx, inward] of [[CX - 7, 1], [CX + 3, -1]]) {
    for (let k = 0; k < 4; k++) {
      const x = bx + k;
      const inner = inward > 0 ? k >= 2 : k <= 1;
      const y = BROW_Y + (stern && inner ? 1 : 0);
      P.set(x, y, browC, 1, TAG.FEAT);
      if (heavy) P.set(x, y - 1, browC, 1, TAG.FEAT);
    }
  }
  // Nose: a lit bridge, the shadow falling to the right, a nostril under it.
  const big = look.speciesId === 'gnome' || look.speciesId === 'orc' || look.speciesId === 'half-orc';
  P.set(CX - 1, 18, K.skin, 3, TAG.SKIN); P.set(CX - 1, 19, K.skin, 3, TAG.SKIN);
  P.set(CX, 20, K.skin, 1, TAG.SKIN); P.set(CX + 1, 21, K.skin, 0, TAG.SKIN);
  P.set(CX - 1, 21, K.skin, 1, TAG.SKIN); P.set(CX, 21, K.skin, 1, TAG.SKIN);
  if (big) { P.set(CX - 2, 20, K.skin, 3, TAG.SKIN); P.set(CX - 2, 21, K.skin, 1, TAG.SKIN); P.set(CX + 1, 20, K.skin, 1, TAG.SKIN); P.set(CX + 2, 21, K.skin, 0, TAG.SKIN); }
  // Mouth: the parting line, a lit lower lip, a shadow under it.
  const lip = one(mix(K.skin[0], '#8a2a2a', look.body === 'f' ? 0.45 : 0.25));
  for (let x = CX - 2; x < CX + 2; x++) P.set(x, MOUTH_Y, lip, 0, TAG.FEAT);
  P.set(CX - 3, MOUTH_Y - 1, K.skin, 1, TAG.SKIN);
  P.set(CX - 1, MOUTH_Y + 1, K.skin, 3, TAG.SKIN); P.set(CX, MOUTH_Y + 1, K.skin, 3, TAG.SKIN);
  P.shade(CX - 1, MOUTH_Y + 2, -1, TAG.SKIN); P.shade(CX, MOUTH_Y + 2, -1, TAG.SKIN);
  // Cheeks: a touch of colour on the young and the small folk.
  if (look.body === 'f' || look.speciesId === 'halfling' || look.speciesId === 'gnome') {
    const blush = one(mix(K.skin[2], '#c85a5a', 0.3));
    P.set(CX - 6, 20, blush, 0, TAG.SKIN); P.set(CX - 5, 20, blush, 0, TAG.SKIN);
    P.set(CX + 4, 20, blush, 0, TAG.SKIN);
  }
  if (look.tusks) {
    const bone = ramp('#e8dcc0', 5, { spread: 0.4 });
    for (const tx of [CX - 3, CX + 2]) { P.set(tx, MOUTH_Y, bone, 3, TAG.FEAT); P.set(tx, MOUTH_Y - 1, bone, 4, TAG.FEAT); }
  }
  if (look.markings) {
    const ink = K.skin;
    for (const [x, y] of [[CX - 6, 19], [CX - 7, 20], [CX - 7, 21], [CX + 5, 19], [CX + 6, 20], [CX + 6, 21], [CX - 1, 10], [CX, 11], [CX - 1, 12]]) P.set(x, y, ink, 0, TAG.FEAT);
  }
  if (look.scar) {
    const scar = one(mix(K.skin[3], '#e8b0a0', 0.4));
    const lines = { cheek: [[CX + 3, 19], [CX + 4, 20], [CX + 5, 21], [CX + 6, 22]], eye: [[CX - 5, 13], [CX - 5, 14], [CX - 5, 15], [CX - 5, 18], [CX - 5, 19]], brow: [[CX + 4, 12], [CX + 4, 13], [CX + 5, 14]] };
    for (const [x, y] of lines[look.scar] || lines.cheek) P.set(x, y, scar, 0, TAG.FEAT);
  }
}

// --- dragonborn and tabaxi have heads of their own ----------------------------

function paintDragonHead(P, look, K) {
  // Front on, a dragon's head is a wide skull over the jaw hinges and a long
  // snout that tapers to a blunt, nostrilled tip; the mouth line runs from the
  // tip back to the hinge, which is what makes it read as a reptile and not a
  // horse.
  const rows = { 5: 5, 6: 7, 7: 8, 8: 8, 9: 9, 10: 9, 11: 9, 12: 9, 13: 9, 14: 9, 15: 9, 16: 9, 17: 9, 18: 9, 19: 8,
    20: 7, 21: 6, 22: 6, 23: 6, 24: 5, 25: 5, 26: 5, 27: 5, 28: 4, 29: 3 };
  for (const [ys, w] of Object.entries(rows)) {
    const y = +ys;
    for (let x = CX - w; x < CX + w; x++) {
      const nx = (x + 0.5 - CX) / (w + 0.6), ny = (y - 14) / 15;
      let lv = band(lit(nx, ny));
      // Scales: a staggered scallop on the lit mid-tones reads as texture, not noise.
      if (lv >= 2 && y % 3 === 0 && (x + (y % 6 ? 0 : 2)) % 4 === 0) lv -= 1;
      P.set(x, y, K.skin, lv, TAG.SKIN);
    }
  }
  // Cheek frills: three spines fanning up and out from the jaw hinge, each one
  // rooted in the head's edge (loose pixels beside it outlined into specks).
  for (const y0 of [16, 19, 22]) {
    const w = rows[y0];
    for (let k = 0; k < 3; k++) {
      const y = y0 - (k >> 1);
      P.set(CX - w - 1 - k, y, K.skin, k ? 3 : 2, TAG.SKIN);
      P.set(CX + w + k, y, K.skin, k ? 1 : 0, TAG.SKIN);
    }
  }
  // Heavy brow ridges slanting down to the snout, slit eyes under them.
  for (let k = 0; k < 4; k++) { P.set(CX - 8 + k, 12 + (k >> 1), K.skin, 0, TAG.FEAT); P.set(CX + 7 - k, 12 + (k >> 1), K.skin, 0, TAG.FEAT); }
  const E = eyeColours(look, K);
  for (const [x, y] of [[CX - 7, 14], [CX - 6, 14], [CX - 5, 15], [CX + 6, 14], [CX + 5, 14], [CX + 4, 15]]) P.set(x, y, E.iris, 0, TAG.FEAT);
  P.set(CX - 6, 15, E.pupil, 0, TAG.FEAT); P.set(CX + 5, 15, E.pupil, 0, TAG.FEAT);
  // The snout's lit ridge, nostrils at the tip.
  for (let y = 16; y <= 24; y++) P.set(CX - 1, y, K.skin, y < 21 ? 3 : 4, TAG.SKIN);
  P.set(CX - 3, 25, K.skin, 0, TAG.FEAT); P.set(CX + 2, 25, K.skin, 0, TAG.FEAT);
  // The long mouth line with a row of teeth along it.
  const bone = ramp('#e8dcc0', 5, { spread: 0.4 });
  const mouth = [[-4, 28], [-5, 27], [-5, 26], [-6, 25], [-6, 24], [-7, 23], [-7, 22]];
  for (const [dx, y] of mouth) { P.set(CX + dx, y, K.skin, 0, TAG.FEAT); P.set(CX - 1 - dx, y, K.skin, 0, TAG.FEAT); }
  for (const [dx, y] of [[-4, 27], [-5, 25], [-6, 23]]) { P.set(CX + dx + 1, y, bone, 3, TAG.FEAT); P.set(CX - 2 - dx, y, bone, 2, TAG.FEAT); }
  for (let x = CX - 3; x < CX + 3; x++) P.set(x, 29, K.skin, 0, TAG.FEAT);
}

function paintCatHead(P, look, hw, K) {
  paintHead(P, look, hw, K);
  // Ears on top of the skull, leaning out, with a pale inner fold.
  const inner = one(mix(K.skin[3], '#e8a0a0', 0.35));
  for (let r = 0; r < 7; r++) {
    const y = 2 + r;
    for (let x = CX - 6 - (r >> 1); x <= CX - 6 + Math.floor(r / 3); x++) P.set(x, y, K.skin, 2, TAG.SKIN);
    for (let x = CX + 5 - Math.floor(r / 3); x <= CX + 5 + (r >> 1); x++) P.set(x, y, K.skin, 1, TAG.SKIN);
    if (r > 2) { P.set(CX - 6, y, inner, 0, TAG.SKIN); P.set(CX + 5, y, inner, 0, TAG.SKIN); }
  }
  // Slit pupils in a wide eye.
  const E = eyeColours(look, K);
  for (const ex of [CX - 6, CX + 3]) {
    for (let x = ex; x < ex + 3; x++) { P.set(x, LID_Y, E.lash, 0, TAG.FEAT); P.set(x, EYE_Y, E.iris, 0, TAG.FEAT); }
    P.set(ex + 1, EYE_Y, E.pupil, 0, TAG.FEAT);
  }
  // Muzzle: a paler pad round a pink nose and a split lip.
  const pale = ramp(mix(look.skin, '#f4ece0', 0.45), 5, { spread: 0.4 });
  for (let y = 19; y <= 26; y++) {
    const w = y < 21 ? 2 : y < 25 ? 4 : 3;
    for (let x = CX - w; x < CX + w; x++) P.set(x, y, pale, x < CX ? 3 : 2, TAG.SKIN);
  }
  const nose = one(mix('#c86a78', look.skin, 0.25));
  P.set(CX - 1, 20, nose, 0, TAG.FEAT); P.set(CX, 20, nose, 0, TAG.FEAT); P.set(CX - 1, 21, nose, 0, TAG.FEAT);
  const dark = one(K.skin[0]);
  P.set(CX - 1, 22, dark, 0, TAG.FEAT); P.set(CX - 2, 23, dark, 0, TAG.FEAT); P.set(CX + 1, 23, dark, 0, TAG.FEAT);
  // Whisker pads and cheek tufts that break the outline.
  for (const [x, y] of [[CX - 3, 22], [CX - 4, 23], [CX + 2, 22], [CX + 3, 23]]) P.set(x, y, pale, 1, TAG.SKIN);
  for (const [x, y] of [[CX - 9, 20], [CX - 9, 22], [CX - 10, 21], [CX + 8, 20], [CX + 8, 22], [CX + 9, 21]]) P.set(x, y, K.skin, x < CX ? 2 : 1, TAG.SKIN);
  // Stripes on the brow.
  for (const [x, y] of [[CX - 1, 8], [CX - 1, 9], [CX - 4, 9], [CX - 4, 10], [CX + 2, 9], [CX + 2, 10]]) P.set(x, y, K.skin, 0, TAG.FEAT);
}

// --- hair ---------------------------------------------------------------------

/**
 * vol: how far the hair stands off the skull; side: the row the side locks
 * reach; lock: how far they come in over the face; fringe: the hairline's shape.
 */
const HAIR = {
  short: { vol: 1, fringe: 'swept', side: 17, lock: 1 },
  long: { vol: 1, fringe: 'part', side: 37, lock: 2, back: 'long' },
  ponytail: { vol: 1, fringe: 'back', side: 16, lock: 1, back: 'tail' },
  braid: { vol: 1, fringe: 'part', side: 18, lock: 1, back: 'braid' },
  curly: { vol: 2, fringe: 'curly', side: 21, lock: 2 },
  topknot: { vol: 0, fringe: 'back', side: 15, lock: 1, bun: true },
  bob: { vol: 1, fringe: 'straight', side: 25, lock: 3 },
  wild: { vol: 3, fringe: 'spiky', side: 25, lock: 2 },
  widowspeak: { vol: 1, fringe: 'peak', side: 16, lock: 1 },
  mohawk: { vol: 0, fringe: 'none', side: 0, lock: 0, crest: true, stubble: true },
  shaved: { vol: 0, fringe: 'none', side: 0, lock: 0, stubble: true },
  sidepart: { vol: 1, fringe: 'sidepart', side: 18, lock: 1 },
  undercut: { vol: 1, fringe: 'swept', side: 15, lock: 1, undercut: true },
  locs: { vol: 2, fringe: 'curly', side: 35, lock: 2, back: 'long', locs: true },
  afro: { vol: 4, fringe: 'curly', side: 23, lock: 2, round: true },
  lowbun: { vol: 0, fringe: 'part', side: 17, lock: 1, back: 'bun' },
  twinbraids: { vol: 1, fringe: 'part', side: 20, lock: 1, back: 'twins' },
};

function hairline(fr, x, seed) {
  const d = Math.abs(x + 0.5 - CX);
  switch (fr) {
    case 'sidepart': return x < CX - 3 ? 10 : 13 - Math.floor((x - CX + 3) / 4);
    case 'swept': return x < CX - 4 ? 13 : x < CX - 1 ? 12 : x < CX + 3 ? 11 : 10;
    case 'part': return 10 + Math.floor(d / 2.4);
    case 'back': return d > 6 ? 11 : 10;
    case 'straight': return 13;
    case 'curly': return 11 + ((x * 5 + 3) % 3 === 0 ? 1 : 0);
    case 'spiky': return 11 + [0, 2, 1, 0, 2, 1, 0, 1][(x + seed) & 7];
    case 'peak': return Math.max(9, 12 - Math.floor(d / 2.2));
    default: return 0;
  }
}

/** The hair mass behind the head and shoulders: long falls, tails, braids. */
function paintBackHair(P, look, hw, K) {
  const st = HAIR[look.hairStyle];
  if (!st || !st.back) return;
  if (st.back === 'long') {
    for (let y = 10; y <= 38; y++) {
      const w = y < 30 ? 11 : 11 - Math.floor((y - 30) / 2);
      for (let x = CX - w; x < CX + w; x++) {
        const nx = (x + 0.5 - CX) / (w + 0.5);
        P.set(x, y, K.hair, band(lit(nx, 0.25) - 0.18), TAG.BACK);
      }
    }
  } else if (st.back === 'bun') {
    for (let y = 19; y <= 27; y++) for (let x = CX + 6; x < CX + 13; x++) {
      const nx = (x - CX - 9) / 3.5, ny = (y - 23) / 4.5;
      if (nx * nx + ny * ny <= 1) P.set(x, y, K.hair, band(lit(nx, ny)), TAG.BACK);
    }
  } else if (st.back === 'tail') {
    for (let y = 14; y <= 31; y++) {
      const cx = CX + 8 + Math.floor((y - 14) / 6);
      for (let x = cx; x < cx + 3; x++) P.set(x, y, K.hair, x === cx ? 2 : 1, TAG.BACK);
    }
  }
}

function paintHair(P, look, hw, K) {
  const st = HAIR[look.hairStyle];
  if (!st) return;
  const vol = st.vol;
  const cy = 14.5 - vol * 0.3, rx = 8.6 + vol, ry = 9.2 + vol;
  const seed = look.seed & 7;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const ex = (x + 0.5 - CX) / rx, ey = (y + 0.5 - cy) / ry;
    const inCap = ex * ex + ey * ey <= 1;
    const face = hw[y] || 0;
    const d = Math.abs(x + 0.5 - CX);
    let hair = false;
    if (st.stubble) {
      if (inCap && y < 13 + (d > 6 ? 3 : 0)) hair = true;
    } else if (inCap && y < hairline(st.fringe, x, seed)) hair = true;
    else if (y < st.side && d > face - st.lock && (inCap || (y > cy && d <= Math.max(face, 7) + vol + 0.5 && d > face - st.lock))) hair = true;
    // Long hair keeps falling past the jaw, in front of the shoulders.
    if (st.back === 'long' && y > CHIN - 4 && y <= 36 && d > 4.5 && d <= 9.5 - (y > 33 ? y - 33 : 0)) hair = true;
    // A rounded cut follows the skull all the way around; the generic hanging
    // side-lock rule would give it the squared-off lower edge of a bob.
    if (st.round) hair = inCap && (y < hairline(st.fringe, x, seed) || d > face - st.lock);
    if (st.round && inCap && y < 12 && (x + y * 3) % 5 === 0 && ex * ex + ey * ey > .88) hair = false;
    if (st.locs && y > 18 && (x % 4 === 0 || y > 32 + (x % 3))) hair = false;
    if (!hair) continue;
    if (st.undercut && x < CX - 3 && y > 9) {
      P.set(x, y, K.scalp, band(lit(ex, ey)), TAG.HAIR);
      continue;
    }
    if (st.stubble && !(st.crest && d < 2.5)) {
      // A shaved scalp is skin, a shade cooler where the stubble grows: one
      // smooth tone over the crown with a soft edge at the old hairline. (A
      // stipple here read as a mesh cap at every size.)
      const lv = band(lit(ex * 0.9, ey * 0.9));
      const edge = y >= 12 + (d > 6 ? 3 : 0);
      P.set(x, y, edge ? K.skin : K.scalp, lv, edge ? TAG.SKIN : TAG.HAIR);
      continue;
    }
    // Below the skull the hair hangs: light it as a falling curtain, not as the
    // underside of a sphere, or every long fall goes black.
    let lv = ey > 0.55 && !inCap ? band(lit((x + 0.5 - CX) / 11, 0.3)) : band(lit(ex * 0.9, Math.min(ey, 0.6) * 0.95));
    // Strands: sparse darker streaks running down the fall of the hair.
    if (lv >= 2 && ((x * 3 + (y >> 2) + seed) % 7 === 0)) lv -= 1;
    if (st.round && (x * 3 + y * 5) % 7 < 2) lv = Math.max(1, lv - 1);
    if (st.locs && x % 4 === 1) lv = Math.max(1, lv - 1);
    if (lv === 3 && ey < -0.35 && ey > -0.75 && ex < 0) lv = 4;
    P.set(x, y, K.hair, lv, TAG.HAIR);
  }
  if (st.crest) {
    for (let y = 1; y < 13; y++) for (let x = CX - 2; x < CX + 2; x++) {
      if (y < 4 && ((x + y) & 1)) continue;
      P.set(x, y, K.hair, x < CX ? 3 : 1, TAG.HAIR);
    }
  }
  if (st.bun) {
    for (let y = 1; y <= 6; y++) for (let x = CX - 3; x < CX + 3; x++) {
      const nx = (x + 0.5 - CX) / 3.2, ny = (y - 3.5) / 3;
      if (nx * nx + ny * ny > 1) continue;
      P.set(x, y, K.hair, band(lit(nx, ny)), TAG.HAIR);
    }
  }
  if (st.back === 'braid') {
    for (let k = 0; k < 7; k++) {
      const bx = CX - 9 - (k >> 2), by = 24 + k * 2;
      for (let x = bx; x < bx + 3; x++) { P.set(x, by, K.hair, x === bx ? 3 : 2, TAG.HAIR); P.set(x, by + 1, K.hair, 1, TAG.HAIR); }
    }
  }
  if (st.back === 'twins') {
    for (const side of [-1, 1]) for (let k = 0; k < 8; k++) {
      const bx = CX + side * (9 - (k >> 2)) - 1, by = 21 + k * 2;
      for (let x = bx; x < bx + 3; x++) {
        P.set(x, by, k === 7 ? K.accent : K.hair, x === bx ? 3 : 2, TAG.HAIR);
        P.set(x, by + 1, K.hair, 1, TAG.HAIR);
      }
    }
  }
}

function paintBeard(P, look, hw, K) {
  const b = look.beard;
  if (!b || b === 'none') return;
  const put = (x, y, sh = 0) => {
    const nx = (x + 0.5 - CX) / 9, ny = (y - 22) / 11;
    let lv = band(lit(nx, ny)) + sh;
    // Strands run DOWN a beard: short vertical streaks, never a checker.
    if (lv >= 2 && ((x * 3 + (y >> 2)) % 5 === 0)) lv -= 1;
    P.set(x, y, K.hair, lv, TAG.BEARD);
  };
  if (b === 'stubble') {
    for (let y = 20; y <= CHIN; y++) for (let x = CX - hw[y]; x < CX + hw[y]; x++) {
      const d = Math.abs(x + 0.5 - CX);
      const jaw = y >= 23 || d > hw[y] - 2;
      if (!jaw || y === MOUTH_Y && d < 2.5) continue;
      // A shadow of stubble: the jaw takes the stubble tint at its own light
      // level, with a few scattered flecks -- a checker read as a net.
      const fleck = (x * 7 + y * 3) % 5 === 0;
      P.set(x, y, K.stubble, Math.max(0, P.level(x, y) - (fleck ? 1 : 0)), TAG.BEARD);
    }
    return;
  }
  const must = () => {
    for (let x = CX - 4; x < CX + 4; x++) put(x, MOUTH_Y - 1);
    for (let x = CX - 3; x < CX + 3; x++) put(x, MOUTH_Y - 2, -1);
    put(CX - 4, MOUTH_Y); put(CX + 3, MOUTH_Y);
  };
  if (b === 'mustache') { must(); return; }
  if (b === 'goatee') {
    must();
    for (let y = MOUTH_Y + 1; y <= CHIN + 3; y++) { const w = y > CHIN ? 2 : 3; for (let x = CX - w; x < CX + w; x++) put(x, y); }
    return;
  }
  // full, braided: sideburns into a jaw beard that hangs past the chin.
  for (let y = 18; y <= CHIN + 5; y++) {
    const face = hw[Math.min(y, CHIN)] || 3;
    const w = y <= CHIN ? face : Math.max(2, 6 - (y - CHIN));
    for (let x = CX - w; x < CX + w; x++) {
      const d = Math.abs(x + 0.5 - CX);
      if (y < MOUTH_Y - 2 && d < face - 2) continue;         // cheeks stay clear
      if (y === MOUTH_Y && d < 2.5) continue;                 // the mouth shows
      if (y === MOUTH_Y - 1 && d < 2) { put(x, y, -1); continue; }
      put(x, y);
    }
  }
  if (b === 'braided') {
    for (let k = 0; k < 3; k++) for (let x = CX - 1; x < CX + 1; x++) { P.set(x, CHIN + 6 + k * 2, K.hair, 2, TAG.BEARD); P.set(x, CHIN + 7 + k * 2, K.hair, 1, TAG.BEARD); }
    P.set(CX - 1, CHIN + 12, K.metal, 3, TAG.BEARD); P.set(CX, CHIN + 12, K.metal, 1, TAG.BEARD);
  }
}

// --- horns --------------------------------------------------------------------

/**
 * A tapering horn along a path of pixel cells: the path is resampled finely so
 * a jump between two points is still a solid shape, swept with a radius that
 * narrows from root to tip, and lit on whichever side faces the upper left.
 * (Stamping one short slab per point left gaps that the outline pass turned
 * into a dotted chain.)
 */
function stroke(P, pts, r, tag) {
  if (pts.length < 2) return;
  const smp = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 3));
    for (let k = 0; k < n; k++) smp.push([x0 + (x1 - x0) * k / n + 0.5, y0 + (y1 - y0) * k / n + 0.5]);
  }
  smp.push([pts[pts.length - 1][0] + 0.5, pts[pts.length - 1][1] + 0.5]);
  const N = smp.length, best = new Map();
  smp.forEach(([sx, sy], i) => {
    const t = i / (N - 1), rad = 1.55 * (1 - t) + 0.5;
    const [ax, ay] = smp[Math.max(0, i - 1)], [bx, by] = smp[Math.min(N - 1, i + 1)];
    const L = Math.hypot(bx - ax, by - ay) || 1, dx = (bx - ax) / L, dy = (by - ay) / L;
    for (let y = Math.floor(sy - rad); y <= Math.floor(sy + rad); y++) for (let x = Math.floor(sx - rad); x <= Math.floor(sx + rad); x++) {
      const px = x + 0.5 - sx, py = y + 0.5 - sy, d = Math.hypot(px, py);
      if (d > rad) continue;
      const k = y * S + x, prev = best.get(k);
      if (prev && prev.d <= d) continue;
      // Which side of the centre line, and how much that side faces the light.
      const side = Math.sign(dx * py - dy * px) || 1;
      const lit = side * (-dy * -0.6 + dx * -0.8) * Math.min(1, d / Math.max(0.6, rad));
      best.set(k, { d, x, y, lv: t > 0.85 ? 3 : lit > 0.25 ? 4 : lit > -0.25 ? 2 : 1 });
    }
  });
  for (const { x, y, lv } of best.values()) P.set(x, y, r, lv, tag);
}

function paintHorns(P, look, K) {
  if (!look.horns) return;
  const L = {
    curved: [[13, 10], [12, 9], [11, 8], [11, 7], [10, 6], [10, 5], [10, 4], [11, 3], [11, 2]],
    straight: [[14, 9], [14, 8], [13, 7], [13, 6], [13, 5], [12, 4], [12, 3], [12, 2]],
    ram: [[12, 9], [10, 8], [9, 9], [8, 10], [8, 12], [9, 14], [10, 15], [11, 15]],
    crown: [[14, 7], [14, 6], [17, 6], [17, 5]],
  }[look.horns] || [];
  stroke(P, L, K.horn, TAG.HORN);
  stroke(P, L.map(([x, y]) => [S - 2 - x, y]), K.horn.map((c, i) => K.horn[Math.max(0, i - 1)]), TAG.HORN);
}

// --- headgear -----------------------------------------------------------------

function dome(P, rows, r, tag, metal = true) {
  for (const [ys, w] of Object.entries(rows)) {
    const y = +ys;
    for (let x = CX - w; x < CX + w; x++) {
      const nx = (x + 0.5 - CX) / (w + 0.5), ny = (y - 11) / 8;
      let lv = metal ? bandMetal(lit(nx, ny)) : band(lit(nx, ny));
      if (metal && nx < -0.3 && nx > -0.65 && ny < -0.35 && ny > -0.8) lv = 4;
      P.set(x, y, r, lv, tag);
    }
  }
}

function paintHelm(P, look, hw, K) {
  const h = look.helm;
  if (!h || h === 'helm-none') return;
  const steel = hexToHsl(look.metal)[1] < 0.18;
  if (h === 'helm-cap' || h === 'helm-horned') {
    if (steel || h === 'helm-horned') {
      dome(P, { 4: 4, 5: 6, 6: 8, 7: 9, 8: 9, 9: 9, 10: 9, 11: 10, 12: 10 }, K.metal, TAG.HELM);
      for (let x = CX - 10; x < CX + 10; x++) { P.set(x, 12, K.metal, x < CX - 4 ? 2 : 1, TAG.HELM); if (x % 3 === 0) P.set(x, 11, K.metal, 4, TAG.HELM); }
    } else {
      // A soft cap: a bonnet with a turned brim, and for a bard a feather.
      dome(P, { 5: 5, 6: 8, 7: 9, 8: 10, 9: 10, 10: 10, 11: 10 }, K.metal, TAG.HELM, false);
      for (let x = CX - 10; x < CX + 11; x++) P.set(x, 12, K.metal, x < CX ? 1 : 0, TAG.HELM);
      if (look.classId === 'bard' || look.outfit === 'outfit-doublet') {
        const pts = [[CX + 7, 9], [CX + 8, 8], [CX + 9, 7], [CX + 10, 6], [CX + 11, 5], [CX + 12, 4], [CX + 13, 3], [CX + 14, 3]];
        for (const [x, y] of pts) { P.set(x, y, K.accent, 3, TAG.HELM); P.set(x, y + 1, K.accent, 1, TAG.HELM); }
      }
    }
    if (h === 'helm-horned') {
      const pts = [[CX - 11, 9], [CX - 12, 8], [CX - 13, 7], [CX - 14, 6], [CX - 14, 5], [CX - 14, 4], [CX - 13, 3]];
      stroke(P, pts, K.horn, TAG.HORN);
      stroke(P, pts.map(([x, y]) => [S - 2 - x, y]), K.horn.map((c, i) => K.horn[Math.max(0, i - 1)]), TAG.HORN);
    }
  } else if (h === 'helm-hood') {
    // A peaked cowl: the tip leans back off the crown, the opening is a deep
    // shadowed rim, and two folds run down to the shoulders. The sprite's hood
    // is CLOTH, so the bust's is too (a hooded cloak's own cowl is its ALT).
    const hood = K.cloth;
    const top = { 1: [1, 3], 2: [-1, 4], 3: [-4, 5], 4: [-7, 7], 5: [-9, 9] };
    for (let y = 1; y <= 36; y++) {
      const [a, b] = top[y] || [-11 - Math.max(0, y - 25), 11 + Math.max(0, y - 25)];
      for (let x = CX + Math.max(a, -17); x < CX + Math.min(b, 17); x++) {
        const fx = (x + 0.5 - CX) / 7.2, fy = (y - 19.5) / 10.5, f = fx * fx + fy * fy;
        if (f < 1 && y >= 9) continue;
        const nx = (x + 0.5 - CX) / 12, ny = (y - 14) / 16;
        let lv = band(lit(nx, ny));
        if (f < 1.45 && y >= 8) lv = f < 1.2 ? 0 : Math.max(0, lv - 1);
        if ((x === CX - 9 || x === CX + 8) && y > 13 && y < 31) lv = Math.max(0, lv - 1);
        P.set(x, y, hood, lv, TAG.HELM);
      }
    }
    for (let y = 9; y <= 14; y++) for (let x = CX - 8; x < CX + 8; x++) P.shade(x, y, y < 12 ? -2 : -1, TAG.SKIN);
  } else if (h === 'helm-circlet') {
    for (let x = CX - 8; x < CX + 8; x++) { P.set(x, 11, K.accent, x < CX - 3 ? 3 : 2, TAG.HELM); P.set(x, 12, K.accent, 1, TAG.HELM); }
    const gem = ramp(look.classId === 'cleric' ? '#e8e0a0' : '#5ab0d8', 5, { spread: 0.5 });
    P.set(CX - 1, 11, gem, 4, TAG.HELM); P.set(CX, 11, gem, 2, TAG.HELM); P.set(CX - 1, 12, gem, 2, TAG.HELM); P.set(CX, 12, gem, 1, TAG.HELM);
  } else if (h === 'helm-crown') {
    const gold = K.accent;
    for (let x = CX - 8; x < CX + 8; x++) for (let y = 9; y <= 11; y++) P.set(x, y, gold, y === 9 ? 3 : y === 10 ? 2 : 1, TAG.HELM);
    for (const px of [CX - 8, CX - 4, CX - 1, CX + 3, CX + 7]) { P.set(px, 8, gold, 3, TAG.HELM); P.set(px, 7, gold, 4, TAG.HELM); }
    P.set(CX - 1, 10, one('#c83a4a'), 0, TAG.HELM); P.set(CX, 10, one('#8a1a2a'), 0, TAG.HELM);
  } else if (h === 'helm-wizard') {
    // Brim, band, and a cone that leans and bends its tip.
    for (let y = 11; y <= 13; y++) {
      const w = y === 12 ? 15 : 14;
      for (let x = CX - w; x < CX + w; x++) P.set(x, y, K.main, y === 11 ? (x < CX - 4 ? 3 : 2) : y === 12 ? 1 : 0, TAG.HELM);
    }
    for (let y = 0; y <= 10; y++) {
      const t = (10 - y) / 10, w = Math.max(1, Math.round(9 - t * 8)), c = CX + Math.round(t * t * 5);
      for (let x = c - w; x < c + w; x++) {
        const nx = (x + 0.5 - c) / (w + 0.5);
        P.set(x, y, K.main, band(lit(nx, -0.2)), TAG.HELM);
      }
    }
    for (let x = CX - 9; x < CX + 9; x++) { P.set(x, 9, K.accent, x < CX - 3 ? 3 : 2, TAG.HELM); P.set(x, 10, K.accent, 1, TAG.HELM); }
  } else if (h === 'helm-straw') {
    // A broad straw brim over a low crown with a leather band.
    const straw = ramp(RAMPS.thatch[2], 5, { spread: 0.5 });
    for (let y = 5; y <= 10; y++) {
      const w = 5 + (y - 5);
      for (let x = CX - w; x < CX + w; x++) P.set(x, y, straw, band(lit((x + 0.5 - CX) / (w + 0.5), -0.4)) - ((x + y) % 4 === 0 ? 1 : 0), TAG.HELM);
    }
    for (let x = CX - 10; x < CX + 10; x++) P.set(x, 10, K.leather, x < CX - 4 ? 2 : 1, TAG.HELM);
    for (let y = 11; y <= 13; y++) {
      const w = y === 11 ? 17 : y === 12 ? 18 : 17;
      for (let x = CX - w; x < CX + w; x++) {
        if (y === 13 && Math.abs(x + 0.5 - CX) < 12) continue;
        P.set(x, y, straw, y === 11 ? (x < CX - 6 ? 4 : 3) : y === 12 ? 2 : 1, TAG.HELM);
      }
    }
  } else if (h === 'helm-coif') {
    // A linen coif: close over the crown, framing the face, tied under the jaw.
    const linen = ramp(RAMPS.bone[3], 5, { spread: 0.4 });
    for (let y = 5; y <= 31; y++) {
      const w = y < 7 ? 6 + (y - 5) * 2 : y < 26 ? 12 : 12 - (y - 25);
      for (let x = CX - w; x < CX + w; x++) {
        const fx = (x + 0.5 - CX) / 8.4, fy = (y - 19) / 10.5;
        if (fx * fx + fy * fy < 1 && y > 10) continue;
        P.set(x, y, linen, band(lit((x + 0.5 - CX) / 13, (y - 16) / 16)), TAG.HELM);
      }
    }
  } else if (h === 'helm-great') {
    for (let y = 4; y <= 30; y++) {
      const w = y < 5 ? 7 : y < 6 ? 9 : 10;
      for (let x = CX - w; x < CX + w; x++) {
        const nx = (x + 0.5 - CX) / (w + 0.5), ny = (y - 14) / 18;
        let lv = bandMetal(lit(nx, ny * 0.7));
        if (nx < -0.45 && nx > -0.8 && y > 6 && y < 13) lv = 4;
        P.set(x, y, K.metal, lv, TAG.HELM);
      }
    }
    for (let x = CX - 8; x < CX + 8; x++) if (x < CX - 1 || x > CX) { P.set(x, 16, K.metal, 0, TAG.HELM); P.set(x, 17, one('#0c0a0c'), 0, TAG.HELM); }
    for (let y = 12; y <= 27; y++) P.set(CX - 1, y, K.metal, 4, TAG.HELM);
    for (const [x, y] of [[CX + 3, 21], [CX + 5, 21], [CX + 3, 23], [CX + 5, 23], [CX + 4, 25]]) P.set(x, y, one('#0c0a0c'), 0, TAG.HELM);
  }
}

// --- the shoulders: what the calling wears -------------------------------------

const GARB = {
  'outfit-tunic': { base: 'main', collar: 'v', under: 'cloth' },
  'outfit-peasant': { base: 'cloth', collar: 'v', under: 'skin', lace: true },
  'outfit-robe': { base: 'main', collar: 'v', trim: 'accent', under: 'cloth' },
  'outfit-noble': { base: 'main', collar: 'round', trim: 'accent', chain: true },
  'outfit-monk': { base: 'main', collar: 'wrap', under: 'skin' },
  'outfit-leather': { base: 'leather', collar: 'round' },
  'outfit-studded': { base: 'leather', collar: 'round', pattern: 'studs' },
  'outfit-hide': { base: 'leather', collar: 'fur' },
  'outfit-chain': { base: 'metal', collar: 'round', pattern: 'mail' },
  'outfit-scale': { base: 'metal', collar: 'round', pattern: 'scale' },
  'outfit-brigandine': { base: 'main', collar: 'round', pattern: 'rivets', pauldrons: true },
  'outfit-half-plate': { base: 'metal', collar: 'gorget', pattern: 'plate', pauldrons: true },
  'outfit-plate': { base: 'metal', collar: 'gorget', pattern: 'plate', pauldrons: true },
  'outfit-fur': { base: 'skin', collar: 'none', mantle: true },
  'outfit-doublet': { base: 'main', collar: 'round', parti: true, trim: 'accent', puff: true },
  'outfit-vestments': { base: 'main', collar: 'round', stole: true },
  'outfit-druidwear': { base: 'main', collar: 'v', under: 'cloth', strap: true, leaf: true },
  'outfit-gambeson': { base: 'main', collar: 'round', pattern: 'quilt' },
  'outfit-tabard': { base: 'metal', collar: 'round', pattern: 'mail', tabard: true },
  'outfit-ranger': { base: 'cloth', collar: 'round', trim: 'leather', strap: true },
  'outfit-jerkin': { base: 'leather', collar: 'v', under: 'cloth', strap: true },
  'outfit-coat': { base: 'main', collar: 'high', trim: 'alt', clasp: true },
};

function shoulderRows(look) {
  const rows = { 29: 7, 30: 10, 31: 12, 32: 14, 33: 16, 34: 17, 35: 18, 36: 18, 37: 18, 38: 18, 39: 18 };
  const b = look.build;
  const d = b === 'body-broad' || b === 'body-tall' || b === 'body-stout' ? 1 : b === 'body-small' ? -3 : b === 'body-slim' ? -1 : 0;
  for (const k of Object.keys(rows)) rows[k] = Math.max(5, Math.min(19, rows[k] + (k > 30 ? d : 0)));
  return rows;
}

function paintGarb(P, look, K) {
  const g = { ...(GARB[look.outfit] || GARB['outfit-tunic']) };
  const marks = look.marks || [];
  if (marks.includes('mark-tabard')) g.tabard = true;
  if (marks.includes('mark-furs')) g.mantle = true;
  const rows = shoulderRows(look);
  const R = K[g.base] || K.main;
  // Behind the shoulder: a ranger's quiver shows its fletching.
  if (look.weapon === 'wep-bow' || marks.includes('back-quiver')) {
    const fl = ramp('#e8e0d0', 5, { spread: 0.4 }), red = ramp('#b03a2a', 5);
    for (const [x, y, c] of [[CX - 12, 24, fl], [CX - 11, 25, fl], [CX - 10, 23, red], [CX - 9, 24, red], [CX - 13, 26, fl]]) P.set(x, y, c, 3, TAG.GARB);
    for (let y = 25; y <= 31; y++) for (let x = CX - 13; x < CX - 9; x++) P.set(x, y, K.leather, x === CX - 13 ? 2 : 1, TAG.GARB);
  }
  for (const [ys, w] of Object.entries(rows)) {
    const y = +ys;
    for (let x = CX - w; x < CX + w; x++) {
      const nx = (x + 0.5 - CX) / (w + 0.5), ny = (y - 44) / 15;
      let lv = g.base === 'metal' ? bandMetal(lit(nx * 0.9, ny)) : band(lit(nx * 0.9, ny));
      let r = R;
      if (g.parti && x >= CX) r = K.alt;
      // Surface patterns, kept to the mid-tones so they read as texture.
      const p = g.pattern;
      if (p === 'mail' && lv > 1 && ((x + 2 * y) % 4 === 0)) lv -= 1;
      if (p === 'scale' && lv > 0 && ((y % 3 === 0 && x % 3 === 1) || (y % 3 === 1 && x % 3 !== 1))) lv -= (y % 3 === 0 ? 1 : 0);
      if (p === 'quilt' && lv > 1 && y % 3 === 2 && (x + y) % 2 === 0) lv -= 1;
      if (p === 'plate' && (y === 35 || y === 38)) lv = Math.max(0, lv - 2);
      if (p === 'plate' && x === CX - 1 && y > 31) lv = Math.min(4, lv + 1);
      if (p === 'plate' && x === CX && y > 31) lv = Math.max(0, lv - 1);
      P.set(x, y, r, lv, TAG.GARB);
      if ((p === 'studs' || p === 'rivets') && y > 31 && y % 3 === 0 && x % 3 === 1) P.set(x, y, K.metal, 3, TAG.GARB);
    }
  }
  // Collars and necklines.
  if (g.collar === 'v' || g.collar === 'wrap') {
    const under = g.under === 'skin' ? K.skin : K.cloth;
    for (let y = 29; y <= 35; y++) {
      const w = g.collar === 'wrap' ? Math.max(0, 4 - (y - 29)) : Math.max(0, Math.floor((36 - y) / 2));
      const off = g.collar === 'wrap' ? -1 : 0;
      for (let x = CX - w + off; x < CX + w + off; x++) P.set(x, y, under, g.under === 'skin' ? (y < 31 ? 1 : 2) : 2, TAG.GARB);
      if (g.trim && w > 0) { P.set(CX - w - 1 + off, y, K[g.trim], 3, TAG.GARB); P.set(CX + w + off, y, K[g.trim], 1, TAG.GARB); }
      else if (w > 0) { P.set(CX - w - 1 + off, y, R, 3, TAG.GARB); P.set(CX + w + off, y, R, 0, TAG.GARB); }
    }
    if (g.lace) for (let y = 31; y <= 34; y += 2) { P.set(CX - 1, y, K.leather, 0, TAG.GARB); P.set(CX, y, K.leather, 0, TAG.GARB); }
  } else if (g.collar === 'round') {
    const tr = g.trim ? K[g.trim] : R;
    for (let x = CX - 6; x < CX + 6; x++) { P.set(x, 29, tr, g.trim ? 3 : 2, TAG.GARB); P.set(x, 30, tr, g.trim ? 1 : 0, TAG.GARB); }
  } else if (g.collar === 'high') {
    const tr = g.trim ? K[g.trim] : R;
    for (let y = 26; y <= 31; y++) for (const x of [CX - 6, CX - 5, CX + 4, CX + 5]) P.set(x, y, tr, x < CX ? (y < 29 ? 3 : 2) : 1, TAG.GARB);
    for (let y = 30; y <= 39; y++) P.set(CX, y, R, 0, TAG.GARB);
  } else if (g.collar === 'gorget') {
    for (let y = 27; y <= 31; y++) for (let x = CX - 6; x < CX + 6; x++) P.set(x, y, K.metal, y === 27 ? 4 : band(lit((x + 0.5 - CX) / 6.5, -0.3)), TAG.GARB);
  } else if (g.collar === 'hooddown') {
    for (let y = 28; y <= 32; y++) for (let x = CX - 10; x < CX + 10; x++) {
      const d = Math.abs(x + 0.5 - CX);
      if (y === 28 && d > 7) continue;
      P.set(x, y, K.main, band(lit((x + 0.5 - CX) / 11, (y - 30) / 3)), TAG.GARB);
    }
  } else if (g.collar === 'fur') {
    for (let x = CX - 8; x < CX + 8; x++) for (let y = 28; y <= 31 + ((x * 7) % 3 === 0 ? 1 : 0); y++) P.set(x, y, K.cloth, y === 28 ? 3 : (x + y) % 3 ? 2 : 1, TAG.GARB);
  }
  if (g.pauldrons) {
    for (const side of [-1, 1]) {
      const pc = CX + side * 13 - (side > 0 ? 1 : 0);
      for (let y = 29; y <= 36; y++) for (let x = pc - 5; x <= pc + 5; x++) {
        const nx = (x - pc) / 5.5, ny = (y - 33.5) / 4.5;
        if (nx * nx + ny * ny > 1) continue;
        let lv = bandMetal(lit(nx, ny));
        if (nx < -0.2 && nx > -0.6 && ny < -0.25 && ny > -0.75) lv = 4;
        P.set(x, y, K.metal, lv, TAG.GARB);
      }
    }
  }
  if (g.mantle) {
    // A fur mantle over a bare chest: tufts break its lower edge.
    for (let x = CX - 18; x < CX + 18; x++) {
      const d = Math.abs(x + 0.5 - CX);
      const top = d < 7 ? 29 : 28 + Math.floor((d - 7) / 4);
      const bottom = (d < 6 ? 31 : 34) + ((x * 7 + 3) % 4 === 0 ? 2 : (x * 3) % 5 === 0 ? 1 : 0);
      for (let y = top; y <= bottom; y++) {
        let lv = band(lit((x + 0.5 - CX) / 18, (y - 36) / 8));
        // Locks of fur: sparse streaks that run down with the pelt.
        if (lv > 0 && (x * 3 + (y >> 1)) % 7 === 0) lv -= 1;
        P.set(x, y, K.main, lv, TAG.GARB);
      }
    }
  }
  if (g.stole) {
    for (const sx of [CX - 6, CX + 3]) for (let y = 29; y <= 39; y++) for (let x = sx; x < sx + 3; x++) P.set(x, y, K.alt, x === sx ? 3 : 1, TAG.GARB);
  }
  if (g.tabard) {
    for (let y = 31; y <= 39; y++) for (let x = CX - 5; x < CX + 5; x++) {
      const lv = band(lit((x + 0.5 - CX) / 8, (y - 40) / 12));
      P.set(x, y, K.main, lv, TAG.GARB);
    }
    // The device in the trim colour, as the sprite's tabard carries it.
    for (let y = 33; y <= 38; y++) { P.set(CX - 1, y, K.accent, 3, TAG.GARB); P.set(CX, y, K.accent, 2, TAG.GARB); }
    for (let x = CX - 3; x < CX + 3; x++) P.set(x, 35, K.accent, x < CX ? 3 : 2, TAG.GARB);
  }
  if (marks.includes('mark-symbol') || g.stole) {
    // The holy symbol on its chain: a sunburst disc.
    const sym = K.accent;
    for (const [x, y, lv] of [[CX - 1, 33, 4], [CX, 33, 3], [CX - 2, 34, 3], [CX - 1, 34, 3], [CX, 34, 2], [CX + 1, 34, 1], [CX - 1, 35, 2], [CX, 35, 1]]) P.set(x, y, sym, lv, TAG.GARB);
    for (let y = 30; y <= 32; y++) { P.set(CX - 3 + (y - 30), y, K.metal, 2, TAG.GARB); P.set(CX + 2 - (y - 30), y, K.metal, 1, TAG.GARB); }
  }
  if (g.strap) {
    // A baldric from the left shoulder across to the right hip.
    for (let k = 0; k < 11; k++) {
      const x = Math.floor(CX - 9 + k * 1.5), y = 29 + k;
      P.set(x, y, K.leather, 2, TAG.GARB); P.set(x + 1, y, K.leather, 1, TAG.GARB);
    }
  }
  if (g.leaf) {
    const leaf = ramp('#5a8a3a', 5);
    for (const [x, y, lv] of [[CX - 9, 31, 3], [CX - 8, 31, 2], [CX - 8, 32, 2], [CX - 7, 32, 1], [CX - 9, 32, 3]]) P.set(x, y, leaf, lv, TAG.GARB);
  }
  if (g.chain) for (let x = CX - 5; x < CX + 5; x++) P.set(x, 33 + (Math.abs(x + 0.5 - CX) < 3 ? 1 : 0), K.accent, x < CX ? 4 : 2, TAG.GARB);
  if (g.clasp) { P.set(CX - 1, 31, K.accent, 4, TAG.GARB); P.set(CX, 31, K.accent, 2, TAG.GARB); }
  if (g.puff) for (const side of [-1, 1]) for (let k = 0; k < 3; k++) P.set(CX + side * (14 + k) - (side > 0 ? 1 : 0), 33 + k, K.accent, 3, TAG.GARB);
  if (marks.includes('mark-apron')) {
    // A linen bib apron, its neck strap up to the collar.
    const linen = ramp(RAMPS.bone[3], 5, { spread: 0.4 });
    for (let y = 33; y <= 39; y++) for (let x = CX - 5; x < CX + 5; x++) P.set(x, y, linen, x < CX - 3 ? 3 : x > CX + 2 ? 1 : 2, TAG.GARB);
    for (let y = 29; y <= 32; y++) { P.set(CX - 5, y, linen, 2, TAG.GARB); P.set(CX + 4, y, linen, 1, TAG.GARB); }
  }
  if (marks.includes('back-pack') || marks.includes('mark-straps')) {
    // A porter's load: the pack rides above the shoulders, straps down the chest.
    const burlap = ramp(RAMPS.thatch[2], 5, { spread: 0.5 });
    for (let y = 22; y <= 30; y++) for (let x = CX - 17; x < CX + 17; x++) {
      if (Math.abs(x + 0.5 - CX) < 12 - Math.max(0, y - 28) * 2) continue;
      P.set(x, y, burlap, y < 24 ? 3 : (x < CX ? 2 : 1), TAG.BACK);
    }
    for (let y = 29; y <= 39; y++) { P.set(CX - 7, y, K.leather, 2, TAG.GARB); P.set(CX + 6, y, K.leather, 1, TAG.GARB); }
  }
  // A cloak over the shoulders, fastened at the throat.
  if (look.cloak && look.cloak !== 'cloak-none') {
    for (const [ys, w] of Object.entries(rows)) {
      const y = +ys;
      if (y < 30) continue;
      for (let x = CX - w; x < CX + w; x++) {
        const d = Math.abs(x + 0.5 - CX);
        if (d < w - 4 - (y - 30) * 0.2) continue;
        P.set(x, y, K.alt, band(lit((x + 0.5 - CX) / (w + 0.5), (y - 42) / 14)), TAG.GARB);
      }
    }
    P.set(CX - 7, 31, K.accent, 4, TAG.GARB); P.set(CX - 6, 31, K.accent, 2, TAG.GARB); P.set(CX + 5, 31, K.accent, 2, TAG.GARB);
  }
  // A bard carries the instrument: the lute's neck and pegbox over the shoulder.
  if (marks.includes('back-lute')) {
    const wood = ramp('#8a5a34', 5, { spread: 0.56 });
    for (let k = 0; k < 11; k++) { const x = CX + 14 - (k >> 1), y = 22 + k; P.set(x, y, wood, 3, TAG.GARB); P.set(x + 1, y, wood, 1, TAG.GARB); }
    for (const [x, y] of [[CX + 13, 22], [CX + 16, 23], [CX + 13, 24], [CX + 16, 25]]) P.set(x, y, K.metal, 3, TAG.GARB);
  }
}

// --- assembly -------------------------------------------------------------------

function ramps(look) {
  const r = (hex, o) => ramp(hex, 5, o);
  const hair = r(look.hair, { spread: 0.6, shift: 20 });
  return {
    skin: r(look.skin, { spread: 0.5, shift: 18 }),
    hair,
    stubble: r(mix(look.skin, look.hair, 0.42), { spread: 0.46 }),
    scalp: r(mix(look.skin, look.hair, 0.16), { spread: 0.5, shift: 18 }),
    main: r(look.main, { spread: 0.56 }), alt: r(look.alt, { spread: 0.56 }),
    // Steel's own colour is its LIT face: the ramp runs down into deep shadow
    // from there, with one hard highlight above it.
    accent: r(look.accent, { spread: 0.62, shift: 18 }), metal: r(look.metal, { spread: 0.8, shift: 16, at: 3 }),
    leather: r(look.leather, { spread: 0.52 }), cloth: r(look.cloth, { spread: 0.5 }),
    // Horns sit against the frame's dark ground, so their ramp is centred a
    // step lighter than the horn colour or a tiefling's crown vanishes.
    horn: r(look.horn, { spread: 0.56, at: 1 }),
  };
}

const cache = new Map();

function lookKey(L) {
  return [L.skin, L.hair, L.eye, L.main, L.alt, L.accent, L.metal, L.leather, L.cloth, L.horn,
    L.hairStyle, L.beard, L.ears, L.horns, L.scales, L.snout, L.fur, L.tusks, L.markings,
    L.helm, L.outfit, L.cloak, L.weapon, L.speciesId, L.classId, L.body, L.build, L.scar, L.seed & 15,
    (L.marks || []).join(',')].join('|');
}

const tinted = new Map();

/** A copy of a bust washed toward `tint` -- the hit flash and the poisoned green. */
function tintedCanvas(art, key, tint, amt) {
  const k = `${key}|${tint}|${amt.toFixed(2)}`;
  let c = tinted.get(k);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = S; c.height = S;
  const x = c.getContext('2d');
  x.drawImage(art, 0, 0);
  x.globalCompositeOperation = 'source-atop';
  x.globalAlpha = amt;
  x.fillStyle = tint;
  x.fillRect(0, 0, S, S);
  if (tinted.size > 60) tinted.clear();
  tinted.set(k, c);
  return c;
}

/** Paint (or fetch) the 40x40 bust canvas for a resolved look. */
export function portraitCanvas(look) {
  const key = lookKey(look);
  let c = cache.get(key);
  if (c) return c;
  const K = ramps(look);
  const P = raster();
  const hw = headRows(look);
  const hides = look.helm === 'helm-great';
  const hooded = look.helm === 'helm-hood' || hides;
  const special = look.snout ? (look.fur ? 'cat' : 'dragon') : null;
  if (!hooded && !special) paintBackHair(P, look, hw, K);
  paintNeck(P, look, K);
  paintGarb(P, look, K);
  if (!hides) {
    if (special === 'dragon') paintDragonHead(P, look, K);
    else if (special === 'cat') paintCatHead(P, look, hw, K);
    else {
      if (!hooded) paintEars(P, look, hw, K);
      paintHead(P, look, hw, K);
      paintFace(P, look, hw, K);
    }
    if (special !== 'dragon') paintBeard(P, look, hw, K);
    if (!hooded && !special) paintHair(P, look, hw, K);
    // Hair and helm brims throw a shadow on the brow beneath them.
    for (let y = 1; y < S; y++) for (let x = 0; x < S; x++) {
      const above = P.tag(x, y - 1);
      if (P.tag(x, y) === TAG.SKIN && (above === TAG.HAIR || above === TAG.HELM)) P.shade(x, y, -1, TAG.SKIN);
    }
    paintHorns(P, look, K);
  }
  paintHelm(P, look, hw, K);
  // To pixels, outline everything that is not cut by the frame's bottom edge,
  // then light it the way the sprites are lit.
  c = document.createElement('canvas');
  c.width = S; c.height = S;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S), d = img.data;
  const K0 = look.outline || '#170f0c';
  const k0 = parseInt(K0.slice(1), 16);
  const hexRGB = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  for (let p = 0; p < S * S; p++) {
    const r = P.R[p];
    if (!r) continue;
    const [R, G, B] = hexRGB(r[P.L[p]]);
    d[p * 4] = R; d[p * 4 + 1] = G; d[p * 4 + 2] = B; d[p * 4 + 3] = 255;
  }
  const edge = [];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const p = y * S + x;
    if (P.R[p]) continue;
    const n = [[x, y - 1], [x - 1, y], [x + 1, y], [x, y + 1]].some(([a, b]) => a >= 0 && b >= 0 && a < S && b < S && P.R[b * S + a]);
    if (n) edge.push(p);
  }
  for (const p of edge) { d[p * 4] = (k0 >> 16) & 255; d[p * 4 + 1] = (k0 >> 8) & 255; d[p * 4 + 2] = k0 & 255; d[p * 4 + 3] = 255; }
  ctx.putImageData(img, 0, 0);
  finishSprite(c, K0);
  if (cache.size > 160) cache.clear();
  cache.set(key, c);
  return c;
}

/**
 * Draw a character's painted bust into the box (x, y, size, opts.h || size),
 * bottom-aligned and centred, at the largest integer DEVICE scale that fits (or
 * cropped round the face when the box is smaller than the bust). Returns false
 * for anything without a bust -- beasts and monsters -- so callers can fall back.
 */
export function drawPortrait(ctx, ch, x, y, size = 32, opts = {}) {
  const look = portraitLook(ch);
  if (!look) return false;
  let art = portraitCanvas(look);
  if (opts.tint && (opts.tintAmt ?? 0.6) > 0) art = tintedCanvas(art, lookKey(look), opts.tint, opts.tintAmt ?? 0.6);
  const t = ctx.getTransform();
  const kx = Math.hypot(t.a, t.b) || 1, ky = Math.hypot(t.c, t.d) || 1;
  const bw = Math.floor(size * kx), bh = Math.floor((opts.h || size) * ky);
  const k = Math.max(1, Math.floor(Math.min(bw, bh) / S));
  // What of the bust fits: all of it, or a window centred on the eyes.
  const cw = Math.min(S, Math.floor(bw / k)), chh = Math.min(S, Math.floor(bh / k));
  const sx = (S - cw) >> 1;
  const sy = chh >= S ? 0 : Math.max(0, Math.min(S - chh, Math.round(EYE_Y - chh / 2)));
  const X = Math.round(t.a * x + t.c * y + t.e) + ((bw - cw * k) >> 1);
  const Y = Math.round(t.b * x + t.d * y + t.f) + (bh - chh * k);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  if (opts.bg) { ctx.fillStyle = opts.bg; ctx.fillRect(X - ((bw - cw * k) >> 1), Y - (bh - chh * k), bw, bh); }
  if (opts.flip) { ctx.translate(X * 2 + cw * k, 0); ctx.scale(-1, 1); }
  ctx.drawImage(art, sx, sy, cw, chh, X, Y, cw * k, chh * k);
  ctx.restore();
  return true;
}

setPortraitPainter(drawPortrait);
