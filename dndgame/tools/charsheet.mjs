// tools/charsheet.mjs — renders character sprites, pose strips and portraits to PNG in Node, no browser.
//
//   $NODE tools/charsheet.mjs --page classes --out output/characters/classes.png [--zoom 6]
//   $NODE tools/charsheet.mjs --page poses|species|folk|portraits|all --out ...
//   $NODE tools/charsheet.mjs --root output/base --page classes --out before.png   # another tree, same page
//
// The browser is rationed on this machine and a sprite iteration only needs the
// pixels, so this installs a tiny 2D-canvas stand-in (integer pixels, affine
// transforms sampled nearest-neighbour, source-over and source-atop) and runs the
// game's OWN actor.js / portrait.js / sprites.js against it. What it writes is
// what the game composes, finish pass and all -- but always confirm a finished
// piece in the real game with tools/shot.mjs.

import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { encode, upscale } from './px/pngio.mjs';

const A = { page: 'classes', out: 'output/characters/sheet.png', bg: '#4a5a4a' };
for (let i = 2; i < process.argv.length; i++) {
  const k = process.argv[i];
  if (k.startsWith('--')) A[k.slice(2)] = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : true;
}
const ROOT = path.resolve(A.root || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));

// ---------------------------------------------------------------- canvas stand-in

function parseColor(s) {
  s = String(s || '#000').trim();
  if (s[0] === '#') {
    if (s.length === 4) s = '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
    const n = parseInt(s.slice(1, 7), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, s.length >= 9 ? parseInt(s.slice(7, 9), 16) / 255 : 1];
  }
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (m) { const p = m[1].split(',').map(Number); return [p[0] | 0, p[1] | 0, p[2] | 0, p[3] ?? 1]; }
  return [0, 0, 0, 1];
}

const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
function inv(m) {
  const det = m[0] * m[3] - m[1] * m[2];
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det,
    (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
}

class Ctx {
  constructor(c) {
    this.canvas = c; this.m = [1, 0, 0, 1, 0, 0]; this.stack = [];
    this.globalAlpha = 1; this.fillStyle = '#000'; this.strokeStyle = '#000';
    this.globalCompositeOperation = 'source-over'; this.imageSmoothingEnabled = false;
    this.font = ''; this.lineWidth = 1; this.filter = 'none';
  }
  save() { this.stack.push([this.m.slice(), this.globalAlpha, this.fillStyle, this.globalCompositeOperation]); }
  restore() { const s = this.stack.pop(); if (s) [this.m, this.globalAlpha, this.fillStyle, this.globalCompositeOperation] = s; }
  setTransform(a, b, c, d, e, f) { this.m = typeof a === 'object' ? [a.a, a.b, a.c, a.d, a.e, a.f] : [a, b, c, d, e, f]; }
  resetTransform() { this.m = [1, 0, 0, 1, 0, 0]; }
  getTransform() { const [a, b, c, d, e, f] = this.m; return { a, b, c, d, e, f }; }
  transform(a, b, c, d, e, f) { this.m = mul(this.m, [a, b, c, d, e, f]); }
  translate(x, y) { this.m = mul(this.m, [1, 0, 0, 1, x, y]); }
  scale(x, y) { this.m = mul(this.m, [x, 0, 0, y, 0, 0]); }
  rotate(r) { const c = Math.cos(r), s = Math.sin(r); this.m = mul(this.m, [c, s, -s, c, 0, 0]); }
  createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; }
  getImageData(x, y, w, h) {
    const o = this.createImageData(w, h), C = this.canvas;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const sx = x + i, sy = y + j;
      if (sx < 0 || sy < 0 || sx >= C.width || sy >= C.height) continue;
      const s = (sy * C.width + sx) * 4, d = (j * w + i) * 4;
      for (let k = 0; k < 4; k++) o.data[d + k] = C.data[s + k];
    }
    return o;
  }
  putImageData(img, x, y) {
    const C = this.canvas;
    for (let j = 0; j < img.height; j++) for (let i = 0; i < img.width; i++) {
      const dx = x + i, dy = y + j;
      if (dx < 0 || dy < 0 || dx >= C.width || dy >= C.height) continue;
      const s = (j * img.width + i) * 4, d = (dy * C.width + dx) * 4;
      for (let k = 0; k < 4; k++) C.data[d + k] = img.data[s + k];
    }
  }
  // Paint the unit-space rectangle (0,0)-(w,h) under matrix M, sampling col(u, v).
  _paint(M, w, h, col) {
    const C = this.canvas, I = inv(M);
    const pts = [[0, 0], [w, 0], [0, h], [w, h]].map(([u, v]) => [M[0] * u + M[2] * v + M[4], M[1] * u + M[3] * v + M[5]]);
    const x0 = Math.max(0, Math.floor(Math.min(...pts.map((p) => p[0])))), x1 = Math.min(C.width, Math.ceil(Math.max(...pts.map((p) => p[0]))));
    const y0 = Math.max(0, Math.floor(Math.min(...pts.map((p) => p[1])))), y1 = Math.min(C.height, Math.ceil(Math.max(...pts.map((p) => p[1]))));
    const ga = this.globalAlpha, op = this.globalCompositeOperation;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const u = I[0] * (x + 0.5) + I[2] * (y + 0.5) + I[4], v = I[1] * (x + 0.5) + I[3] * (y + 0.5) + I[5];
      if (u < 0 || v < 0 || u >= w || v >= h) continue;
      const s = col(u, v);
      if (!s) continue;
      const a = (s[3] / 255) * ga;
      if (a <= 0) continue;
      const d = (y * C.width + x) * 4, da = C.data[d + 3] / 255;
      if (op === 'source-atop') {
        if (!da) continue;
        for (let k = 0; k < 3; k++) C.data[d + k] = s[k] * a + C.data[d + k] * (1 - a);
        continue;
      }
      const oa = a + da * (1 - a);
      for (let k = 0; k < 3; k++) C.data[d + k] = (s[k] * a + C.data[d + k] * da * (1 - a)) / oa;
      C.data[d + 3] = oa * 255;
    }
  }
  drawImage(img, ...a) {
    let sx = 0, sy = 0, sw = img.width, sh = img.height, dx, dy, dw, dh;
    if (a.length === 2) [dx, dy] = a, dw = sw, dh = sh;
    else if (a.length === 4) [dx, dy, dw, dh] = a;
    else [sx, sy, sw, sh, dx, dy, dw, dh] = a;
    if (!sw || !sh || !dw || !dh) return;
    const M = mul(this.m, [dw / sw, 0, 0, dh / sh, dx, dy]);
    const src = img.data, W = img.width, H = img.height;
    this._paint(M, sw, sh, (u, v) => {
      const X = Math.floor(sx + u), Y = Math.floor(sy + v);
      if (X < 0 || Y < 0 || X >= W || Y >= H) return null;
      const p = (Y * W + X) * 4;
      return src[p + 3] ? [src[p], src[p + 1], src[p + 2], src[p + 3]] : null;
    });
  }
  fillRect(x, y, w, h) {
    const c = parseColor(this.fillStyle), s = [c[0], c[1], c[2], c[3] * 255];
    this._paint(mul(this.m, [1, 0, 0, 1, x, y]), w, h, () => s);
  }
  clearRect(x, y, w, h) {
    const C = this.canvas;
    for (let j = Math.max(0, y); j < Math.min(C.height, y + h); j++) for (let i = Math.max(0, x); i < Math.min(C.width, x + w); i++) C.data.fill(0, (j * C.width + i) * 4, (j * C.width + i) * 4 + 4);
  }
  // Shadows, strokes and text are not part of a sprite sheet.
  beginPath() {} closePath() {} moveTo() {} lineTo() {} ellipse() {} arc() {} rect() {} fill() {} stroke() {} clip() {}
  fillText() {} strokeText() {} measureText(s) { return { width: String(s).length * 6 }; }
}

class Canvas {
  constructor(w = 300, h = 150) { this._w = w; this._h = h; this.data = new Uint8ClampedArray(w * h * 4); this._ctx = null; }
  get width() { return this._w; } set width(v) { this._w = Math.max(1, v | 0); this.data = new Uint8ClampedArray(this._w * this._h * 4); }
  get height() { return this._h; } set height(v) { this._h = Math.max(1, v | 0); this.data = new Uint8ClampedArray(this._w * this._h * 4); }
  getContext() { return this._ctx || (this._ctx = new Ctx(this)); }
}
globalThis.document = { createElement: () => new Canvas(), body: { appendChild() {} } };
globalThis.OffscreenCanvas = Canvas;
globalThis.window = globalThis.window || globalThis;

// ---------------------------------------------------------------- the game's modules

const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const S = await imp('src/render/sprites.js');
const chars = await imp('src/render/spritedata_chars.js');
(chars.registerCharacterSprites || chars.default)();
try { const mon = await imp('src/render/spritedata_monsters.js'); (mon.registerMonsterSprites || mon.default)?.(); } catch { /* optional */ }
const AC = await imp('src/render/actor.js');
const { SPECIES } = await imp('src/data/species.js');

// ---------------------------------------------------------------- the cast

const BASE = { skin: '#e0a878', hair: '#4a3018', eye: '#37527a', hairStyle: 'short', beard: 'none', cloakStyle: 'auto', helmStyle: 'auto', bootStyle: 'auto', build: 'normal' };
const CLASSES = ['barbarian', 'bard', 'cleric', 'druid', 'fighter', 'monk', 'paladin', 'ranger', 'rogue', 'sorcerer', 'warlock', 'wizard'];
const HAIRS = ['wild', 'long', 'short', 'braid', 'short', 'shaved', 'short', 'ponytail', 'bob', 'curly', 'long', 'long'];
const BEARDS = ['full', 'none', 'none', 'full', 'stubble', 'none', 'none', 'none', 'none', 'none', 'goatee', 'full'];
const KIT = {
  barbarian: { mainHand: 'greataxe' }, bard: { mainHand: 'rapier' }, cleric: { mainHand: 'mace', offHand: 'shield' },
  druid: { mainHand: 'quarterstaff' }, fighter: { mainHand: 'longsword', offHand: 'shield', armor: 'chain-mail' },
  monk: {}, paladin: { mainHand: 'longsword', offHand: 'shield', armor: 'plate-armor' }, ranger: { mainHand: 'longbow' },
  rogue: { mainHand: 'dagger' }, sorcerer: {}, warlock: {}, wizard: { mainHand: 'quarterstaff' },
};
const SKINS = ['#f5d6b8', '#e8c19a', '#c08a5e', '#a06b45', '#7d4f33', '#d9a878'];
const HAIRC = ['#2e2119', '#8a5a2b', '#1b1410', '#b23a2a', '#d9a441', '#4a3222'];

function classChar(id, i, armed = false, extra = {}) {
  const p = AC.CLASS_PALETTE?.[id]?.[0] || {};
  return {
    name: id, speciesId: 'human', classes: [{ id }], size: 'medium', equipment: armed ? { ...KIT[id] } : {},
    appearance: { ...BASE, hairStyle: HAIRS[i % 12], beard: BEARDS[i % 12], skin: SKINS[i % 6], hair: HAIRC[i % 6],
      outfit: p.main, outfitAlt: p.alt, accent: p.accent, metal: p.metal, leather: p.leather, cloth: p.cloth, ...extra },
  };
}
const SPEC = ['human', 'elf', 'dwarf', 'halfling', 'dragonborn', 'gnome', 'orc', 'tiefling', 'aasimar', 'goliath', 'half-elf', 'half-orc', 'tabaxi'];
const SPEC_CLASS = ['fighter', 'wizard', 'cleric', 'rogue', 'paladin', 'bard', 'barbarian', 'warlock', 'sorcerer', 'fighter', 'ranger', 'barbarian', 'monk'];
function speciesChar(id, i) {
  const sp = SPECIES[id] || {}, cw = sp.colorways || {}, lin = (sp.lineages || [])[0], lcw = lin?.colorways || {};
  const pick = (arr, k) => (arr && arr.length ? arr[k % arr.length] : undefined);
  const mods = { ...(sp.spriteMods || {}), ...(lin?.spriteMods || {}) };
  const ch = classChar(SPEC_CLASS[i], i, true, {
    skin: pick(cw.skin || lcw.skin, 2) || '#e0a878', hair: pick(cw.hair || lcw.hair, 3) || '#3a2416', eye: pick(cw.eye || lcw.eye, 1) || '#37527a',
    beard: mods.beard === 'common' ? 'full' : 'none', horns: mods.horns ? ['curved', 'ram', 'straight'][i % 3] : null,
    tail: mods.tail ? (id === 'dragonborn' ? 'scaled' : id === 'tabaxi' ? 'cat' : 'thin') : null,
    ears: mods.ears && mods.ears !== 'round' ? mods.ears : null, hornColor: id === 'dragonborn' ? '#d8cdb4' : '#5a4a44',
  });
  ch.speciesId = id; ch.lineageId = lin?.id; ch.size = (id === 'halfling' || id === 'gnome') ? 'small' : 'medium';
  return ch;
}

// ---------------------------------------------------------------- pages

const out = new Canvas(10, 10);
const g = out.getContext();
function page(w, h) { out.width = w; out.height = h; g.resetTransform(); g.globalAlpha = 1; g.fillStyle = A.bg; g.fillRect(0, 0, w, h); }
const actor = (ch, x, y, o = {}) => { try { AC.drawActor(g, ch, x + 8, y + 24, { shadow: false, ...o }); } catch (e) { console.error('draw', ch.name, e.message); } };

const PAGES = {
  classes() {    // per class: unarmed then armed, front / side / back; four classes a row
    const list = A.who ? String(A.who).split(',') : CLASSES;
    const cols = +A.cols || 4, cw = 16 * 6 + 10;
    page(4 + cols * cw, 4 + Math.ceil(list.length / cols) * 28);
    list.forEach((id, n) => {
      const i = CLASSES.indexOf(id), x = 4 + (n % cols) * cw, y = 2 + Math.floor(n / cols) * 28;
      [false, true].forEach((armed, r) => ['down', 'left', 'up'].forEach((d, k) =>
        actor(classChar(id, i, armed), x + r * 50 + k * 16, y, { dir: d, frame: `${d}-0` })));
    });
  },
  species() {
    const cols = 7, cw = 16 * 3 + 6;
    page(4 + cols * cw, 4 + Math.ceil(SPEC.length / cols) * 28);
    SPEC.forEach((id, i) => ['down', 'left', 'up'].forEach((d, k) =>
      actor(speciesChar(id, i), 4 + (i % cols) * cw + k * 16, 2 + Math.floor(i / cols) * 28, { dir: d, frame: `${d}-0` })));
  },
  poses() {
    const who = (A.who ? String(A.who).split(',') : ['fighter', 'wizard', 'ranger', 'cleric', 'barbarian', 'bard', 'paladin', 'rogue']);
    const poses = ['idle', 'attack', 'cast', 'shoot', 'hurt', 'ko'];
    const dirs = A.dirs ? String(A.dirs).split(',') : ['down', 'right'];
    const rowW = poses.reduce((s, p) => s + AC.actorPoseFrames(classChar('fighter', 4, true), p, 'down').length * 26 + 6, 0);
    page(rowW + 8, 8 + who.length * dirs.length * 32);
    who.forEach((cls, r) => dirs.forEach((dir, dn) => {
      const ch = classChar(cls, CLASSES.indexOf(cls), true);
      let x = 4;
      for (const pose of poses) {
        AC.actorPoseFrames(ch, pose, dir).forEach((f, k) => { actor(ch, x + 5, 6 + (r * dirs.length + dn) * 32, { dir, pose, poseFrame: k }); x += 26; });
        x += 6;
      }
    }));
  },
  folk() {
    const names = S.allSpriteNames().filter((n) => n.startsWith('npc-') && !/-v\d$/.test(n));
    const cols = 9, cw = 16 * 3 + 4;
    page(8 + cols * cw, 8 + Math.ceil(names.length / cols) * 28);
    names.forEach((n, i) => ['down', 'left', 'up'].forEach((d, k) => {
      const x = 4 + (i % cols) * cw + k * 16, y = 4 + Math.floor(i / cols) * 28;
      S.drawSpriteAt(g, n, `${d}-0`, x, y, {});
    }));
  },
  portraits() {
    // An older tree has no painted bust: show what it had, the sprite head blown up.
    const bust = AC.drawPortrait || ((c, ch, x, y, sz) => AC.drawActorBust(c, ch, x, y, sz));
    const list = CLASSES.map((id, i) => classChar(id, i, true)).concat(SPEC.map((id, i) => speciesChar(id, i)));
    for (const n of ['npc-guard', 'npc-smith', 'npc-priest', 'npc-merchant', 'npc-noble', 'npc-farmer', 'npc-scholar', 'npc-villager-f', 'npc-sellsword', 'npc-beggar', 'npc-porter', 'npc-goodwife', 'npc-innkeeper', 'npc-minstrel', 'npc-hunter', 'npc-watch'])
      if (S.hasSprite(n)) list.push({ sprite: n, name: n, colorway: S.spriteDef(n).defaultColorway, speciesId: 'human', classes: [{ id: n.slice(4) }] });
    const cols = 12;
    page(4 + cols * 44, 4 + Math.ceil(list.length / cols) * 44);
    list.forEach((ch, i) => {
      const x = 4 + (i % cols) * 44, y = 4 + Math.floor(i / cols) * 44;
      g.fillStyle = '#15121a'; g.fillRect(x, y, 40, 40);
      try { bust(g, ch, x, y, 40, {}); } catch (e) { console.error('portrait', ch.name, e.message); }
    });
  },
};

const ZOOM = { classes: 4, species: 4, poses: 5, folk: 4, portraits: 3 };
const want = A.page === 'all' ? Object.keys(PAGES) : String(A.page).split(',');
for (const p of want) {
  PAGES[p]();
  const file = want.length > 1 ? A.out.replace(/\.png$/, `-${p}.png`) : A.out;
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const z = +A.zoom || ZOOM[p] || 4;   // sized so a page reads at full resolution
  fs.writeFileSync(file, encode(upscale({ w: out.width, h: out.height, data: Buffer.from(out.data.buffer) }, z)));
  console.log('wrote', file, `${out.width}x${out.height} x${z}`);
}
