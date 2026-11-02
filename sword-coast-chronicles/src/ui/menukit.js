// ui/menukit.js — the chrome every menu-type scene shares: desk, heading, section heads, key strip, fine rows.
//
// The menus, dialogue, shop, rest, level-up, character creation and cheat
// screens were each written with their own copy of "a gold caption with a
// rule", "a strip of [KEY] prompts" and "a dark fill behind everything". The
// copies had drifted, and all of them spoke in the 5x7 face at full size, which
// on the 2x interface layer is large print. This is the one copy: the screens
// call it, so the whole game reads as one manuscript.
//
// The type scale it sets:
//   title   the screen's name, a Lombardic capital in gilt and textura after it
//   sm/md   what a list is a list OF (item names, menu entries) — unchanged
//   fineb   section rubrics, in spaced capitals
//   fine    everything that explains: descriptions, key/value rows, prompts
// Everything here snaps to the fine grid (half a logical px) and falls back
// cleanly on a 1x context, where the kit turns fine sizes into sm.

import { UI } from './kit.js';
import { GILT, RUBRIC, fleuron, hairFrame, makeCanvas, resOf } from './ornament.js';
import { drawPortrait } from '../render/portrait.js';
import { drawActorBust } from '../render/actor.js';
import { drawSprite, hasSprite, spriteSize } from '../render/sprites.js';
import { monsterSpriteName } from '../render/spritedata_monsters.js';

const W = 400;
const H = 240;
const C = UI.COLORS;
const snap = (v) => Math.round(v * 2) / 2;

function safe(fn, fb) { try { return fn(); } catch (e) { return fb; } }

// ---------------------------------------------------------------------------
// the desk — what an opaque menu stands on
// ---------------------------------------------------------------------------

// Each theme's desk: a dark board under the pages, warmer or cooler with the
// binding, with a faint tooled diaper pattern (the lozenge lattice a binder
// pressed into calf) so the gaps between panels are not dead black.
const DESKS = {
  folio: { top: '#1b140f', bot: '#090706', tool: 'rgba(227,179,74,0.045)', dot: 'rgba(227,179,74,0.10)' },
  timber: { top: '#1e160d', bot: '#0b0806', tool: 'rgba(210,160,90,0.05)', dot: 'rgba(210,160,90,0.10)' },
  iron: { top: '#15171c', bot: '#07080b', tool: 'rgba(170,185,205,0.045)', dot: 'rgba(170,185,205,0.09)' },
  parchment: { top: '#1f1810', bot: '#0c0906', tool: 'rgba(220,190,130,0.05)', dot: 'rgba(220,190,130,0.10)' },
};
const deskCache = new Map();

function paintDesk(theme) {
  const d = DESKS[theme] || DESKS.folio;
  const cv = makeCanvas(W * 2, H * 2);
  if (!cv) return null;
  const g = cv.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, H * 2);
  gr.addColorStop(0, d.top); gr.addColorStop(1, d.bot);
  g.fillStyle = gr; g.fillRect(0, 0, W * 2, H * 2);
  // Tooled lattice: one-device-pixel diagonals every 24 device px, and a
  // small four-dot rosette where they cross.
  g.fillStyle = d.tool;
  const S = 24;
  for (let y = 0; y < H * 2; y++) {
    for (let k = -H * 2; k < W * 2; k += S) {
      g.fillRect(k + y, y, 1, 1);
      g.fillRect(k + (H * 2 - y), y, 1, 1);
    }
  }
  g.fillStyle = d.dot;
  for (let y = S / 2; y < H * 2; y += S) {
    for (let x = ((y / S) & 1 ? 0 : S / 2); x < W * 2; x += S) {
      g.fillRect(x - 2, y, 1, 1); g.fillRect(x + 2, y, 1, 1);
      g.fillRect(x, y - 2, 1, 1); g.fillRect(x, y + 2, 1, 1);
    }
  }
  // Grain: sparse specks placed by a hash so they never crawl between frames.
  for (let i = 0; i < 2600; i++) {
    const h = Math.imul(i * 2654435761 ^ 0x5bd1e995, 0x27d4eb2d) >>> 0;
    const x = h % (W * 2), y = (h >>> 11) % (H * 2);
    g.fillStyle = (h & 7) < 3 ? 'rgba(255,230,180,0.035)' : 'rgba(0,0,0,0.16)';
    g.fillRect(x, y, 1, 1);
  }
  // Vignette: the lamp is on the page, not in the corners.
  const vg = g.createRadialGradient(W, H * 0.9, H * 0.4, W, H, W * 1.15);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  g.fillStyle = vg; g.fillRect(0, 0, W * 2, H * 2);
  return cv;
}

/** Fill the whole screen with the theme's desk (an opaque menu's backdrop). */
export function desk(ctx) {
  const th = safe(() => UI.theme, 'folio') || 'folio';
  let cv = deskCache.get(th);
  if (cv === undefined) { cv = safe(() => paintDesk(th), null); deskCache.set(th, cv); }
  if (!cv) { ctx.fillStyle = C.bgDeep; ctx.fillRect(0, 0, W, H); return; }
  const s = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(cv, 0, 0, W, H);
  ctx.imageSmoothingEnabled = s;
}

/**
 * Dim the world behind a menu that lets it show through (pause, dialogue,
 * camp): a scrim with the edges pulled darker, so the panels sit in a pool of
 * light instead of on a flat grey sheet.
 */
export function veil(ctx, alpha = 0.6) {
  UI.scrim(ctx, alpha * 0.8);
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.62);
  g.addColorStop(0, 'rgba(5,4,6,0)');
  g.addColorStop(1, `rgba(5,4,6,${Math.min(0.9, alpha * 0.75).toFixed(3)})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

// ---------------------------------------------------------------------------
// type
// ---------------------------------------------------------------------------

/** Text that never throws; `size` defaults to fine. Returns the kit's { w, h, lines }. */
export function text(ctx, x, y, s, o = {}) {
  return safe(() => UI.text(ctx, snap(x), snap(y), String(s == null ? '' : s), { size: 'fine', ...o }), { w: 0, h: 0, lines: 0 });
}

/** Width of `s` in `size` (fine by default), measured for the 2x interface. */
export function measure(s, size = 'fine') {
  return safe(() => UI.measure(String(s == null ? '' : s), size, undefined, 2), 0) || 0;
}

/** `s` cut to `w` px with an ellipsis, in `size`. */
export function fit(s, w, size = 'fine') {
  return safe(() => UI.fit(String(s == null ? '' : s), w, size, 2), String(s));
}

/** Word-wrapped prose; returns the kit's { lines, height, total, lineH }. o: { size, color, maxLines } */
export function para(ctx, x, y, w, s, o = {}) {
  return safe(() => UI.textWrapped(ctx, snap(x), snap(y), w, String(s == null ? '' : s),
    { size: 'fine', color: C.ink, ...o }), { lines: 0, height: 0, total: 0, lineH: 5 });
}

/**
 * Prose in the fine face opening on a drop cap: the first letter as the kit's
 * small initial (a 14px box, three lines deep) with the first paragraph's
 * words flowing round it. Text that does not open on a letter is set plain.
 * o: { color, lineH (6), ground, maxH (clip height), shadow } -> { height, lines, clipped }
 */
export function capPara(ctx, x, y, w, s, o = {}) {
  const str = String(s == null ? '' : s).trim();
  const lh = o.lineH || 6;
  const maxH = o.maxH == null ? Infinity : o.maxH;
  const col = o.color || C.ink;
  const shadow = o.shadow == null ? 'rgba(0,0,0,0.7)' : o.shadow;
  const put = (lines, x0, y0) => {
    let n = 0;
    for (const l of lines) {
      if (y0 + n * lh + lh > y + maxH + 1) return false;
      text(ctx, x0, y0 + n * lh, l, { color: col, shadow });
      n++;
    }
    return true;
  };
  const first = str.charAt(0);
  if (!/^\p{L}$/u.test(first) || str.length < 24 || w < 60) {
    const lines = wrap(str, w);
    const ok = put(lines, x, y);
    return { height: Math.min(maxH, lines.length * lh), lines: lines.length, clipped: !ok };
  }
  const cap = safe(() => UI.initial(ctx, x, y - 0.5, first, { size: 'sm', ground: o.ground, vine: false }), null) || { w: 14, h: 14 };
  const ind = (cap.w || 14) + 3;
  const deep = Math.ceil((cap.h + 1) / lh);
  let rest = str.slice(1);
  if (rest[0] === ' ') rest = rest.slice(1);
  const nl = rest.indexOf('\n');
  const firstPara = nl >= 0 ? rest.slice(0, nl) : rest;
  const after = nl >= 0 ? rest.slice(nl + 1) : '';
  const words = firstPara.split(/\s+/).filter(Boolean);
  const head = [];
  let cur = '';
  let k = 0;
  while (k < words.length && head.length < deep) {
    const t = cur ? `${cur} ${words[k]}` : words[k];
    if (!cur || measure(t) <= w - ind) { cur = t; k++; } else { head.push(cur); cur = ''; }
  }
  if (cur && head.length < deep) head.push(cur);
  const remain = words.slice(k).join(' ');
  const tail = [].concat(remain ? wrap(remain, w) : [], after ? wrap(after, w) : []);
  put(head, x + ind, y);
  const ty = y + Math.max(deep, head.length) * lh;
  const ok = put(tail, x, ty);
  const total = Math.max(deep, head.length) + tail.length;
  return { height: Math.min(maxH, total * lh), lines: total, clipped: !ok };
}

/** Lines `s` wraps to in `w` px at `size` (fine by default). */
export function wrap(s, w, size = 'fine') {
  return safe(() => UI.wrapLines(String(s == null ? '' : s), w, size, undefined, 2), [String(s)]);
}

/** Line pitch of a size on the 2x interface. */
export function lineH(size = 'fine') {
  return safe(() => UI.metrics(size, undefined, 2).lineH, 5);
}

/**
 * A name in the display face — a Lombardic capital in gilt, the rest in
 * textura. For the thing a pane is ABOUT: a spell, an item, a speaker.
 * o: { color, maxWidth, align, rule }
 */
export function title(ctx, x, y, s, o = {}) {
  let str = String(s == null ? '' : s);
  if (o.maxWidth && measure(str, 'title') > o.maxWidth) str = fit(str, o.maxWidth, 'title');
  return safe(() => UI.heading(ctx, snap(x), snap(y), str, { size: 'title', color: o.color || C.goldBright,
    align: o.align, rule: o.rule }), { w: 0, h: 8 });
}

// ---------------------------------------------------------------------------
// headings and rules
// ---------------------------------------------------------------------------

/**
 * A screen's running head across the top 16px: the name in the display face,
 * an optional fine note hard right, and a gilt rule under both with a
 * fleuron at its heart. o: { sub, subColor, x, w, y, note } -> bottom y.
 */
export function header(ctx, name, o = {}) {
  const x = o.x == null ? 4 : o.x;
  const w = o.w == null ? W - 8 : o.w;
  const y = o.y == null ? 0 : o.y;
  // a band of shadow behind the head, so it reads over any desk
  const g = ctx.createLinearGradient(0, y, 0, y + 16);
  g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0.15)');
  ctx.fillStyle = g; ctx.fillRect(0, y, W, 16);
  title(ctx, x + 3, y + 3, name, { maxWidth: o.sub ? w * 0.55 : w - 6 });
  if (o.sub) {
    text(ctx, x + w - 2, y + 6, o.sub, { color: o.subColor || C.inkDim, align: 'right',
      maxWidth: Math.max(40, w - measure(name, 'title') - 20) });
  }
  rule(ctx, x, y + 14.5, w);
  return y + 16;
}

/** A gilt hairline rule scored into the page, with a fleuron at its heart when it is long enough. */
export function rule(ctx, x, y, w, o = {}) {
  safe(() => UI.divider(ctx, x, y, w, { ornament: o.ornament !== false && w >= 60, color: o.color || 'rgba(138,106,52,0.9)' }));
}

/**
 * A rubric: a section's name in spaced capitals, with a hairline running out
 * to the right edge of the column and a lozenge where it stops.
 * o: { color, rule (false to omit), size } -> the y the section's first line sits on.
 */
export function section(ctx, x, y, w, label, o = {}) {
  const s = String(label == null ? '' : label).toUpperCase();
  const size = o.size || 'fineb';
  const col = o.color || '#d9a441';
  const small = size === 'fine' || size === 'fineb' || size === 'xs';
  const r = text(ctx, x, y, s, { size, color: col, letterSpacing: small ? 2 : undefined, shadow: 'rgba(0,0,0,0.8)', maxWidth: w });
  const lw = r && r.w ? r.w : measure(s, size);
  const rx = snap(x + lw + 3);
  const rw = snap(x + w - rx - 2);
  if (o.rule !== false && rw > 6) {
    const fine = resOf(ctx) >= 2;
    const t = fine ? 0.5 : 1;
    const ry = snap(y + (small && fine ? 1.5 : 3));
    const g = ctx.createLinearGradient(rx, 0, rx + rw, 0);
    g.addColorStop(0, 'rgba(217,164,65,0.75)'); g.addColorStop(1, 'rgba(138,106,52,0.35)');
    ctx.fillStyle = g; ctx.fillRect(rx, ry, rw, t);
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(rx, ry + t, rw, t);
    // the lozenge that stops the rule
    ctx.fillStyle = GILT.base;
    ctx.fillRect(rx + rw, ry - t, t, t * 3); ctx.fillRect(rx + rw - t, ry, t * 3, t);
  }
  return snap(y + lineH(size) + 2);
}

// ---------------------------------------------------------------------------
// rows
// ---------------------------------------------------------------------------

/**
 * "Speed ......... 30 ft." in the fine face: a dim label hard left, the value
 * hard right, never crossing (UI.kvRow does the arithmetic).
 * o: { color, labelColor, size, valueSize, lead (dotted leader) }
 */
export function kv(ctx, x, y, w, label, value, o = {}) {
  const size = o.size || 'fine';
  const s = safe(() => UI.kvRow(ctx, snap(x), snap(y), w, label, value, {
    size, valueSize: o.valueSize || size, color: o.color || C.ink, labelColor: o.labelColor || C.inkDim,
    valueMax: o.valueMax, labelMax: o.labelMax, gap: o.gap == null ? 3 : o.gap,
  }), null);
  // A dotted leader between label and value, as a contents page has.
  if (s && o.lead !== false && s.fits && resOf(ctx) >= 2) {
    const x0 = snap(x + s.labelW + 2), x1 = snap(x + w - s.valueW - 2);
    ctx.fillStyle = 'rgba(160,140,100,0.28)';
    for (let lx = x0; lx < x1; lx += 1.5) ctx.fillRect(lx, snap(y + 3), 0.5, 0.5);
  }
  return s;
}

/**
 * The selected row: lamplight across it, gilt hairlines top and foot, the
 * bobbing arrow in the margin. o: { alpha, cursor (false), color }
 */
export function selRow(ctx, x, y, w, h, t = 0, o = {}) {
  safe(() => UI.highlight(ctx, x, y, w, h, { alpha: o.alpha == null ? 0.24 : o.alpha, color: o.color }));
  if (o.cursor !== false) safe(() => UI.cursor(ctx, x - 3, y + Math.max(0, Math.round((h - 7) / 2)), t));
}

/** A row under the pointer but not selected: a faint wash, no arrow. */
export function hoverRow(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(255,230,170,0.05)';
  ctx.fillRect(x, y, w, h);
}

// ---------------------------------------------------------------------------
// tabs
// ---------------------------------------------------------------------------

/**
 * A row of bookmark tabs, the same geometry as UI.tabs (n equal columns of
 * `w`, `h` tall, from `y`) so every caller's hit rects still line up. The
 * shut tabs are dark calf with their names in spaced fine capitals; the open
 * one is lit, edged in gilt and runs into the page below with no seam.
 * tabList: strings or { label, icon, disabled, badge }. -> the y under the row
 */
export function tabs(ctx, x, y, w, tabList, index, o = {}) {
  const list = tabList || [];
  const n = Math.max(1, list.length);
  const h = o.h || 13;
  const tw = Math.floor(w / n);
  const fine = resOf(ctx) >= 2;
  const t = fine ? 0.5 : 1;
  const base = y + h;
  // the rule the tabs stand on, broken under the open one
  ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(x, base, w, 1);
  ctx.fillStyle = GILT.lo; ctx.fillRect(x, base, w, t);
  for (let i = 0; i < n; i++) {
    const raw = list[i];
    const it = typeof raw === 'string' ? { label: raw } : (raw || {});
    const tx = x + i * tw;
    const cw = i === n - 1 ? w - tw * (n - 1) : tw;
    const on = i === index;
    const ty = on ? y - 1 : y + 1;
    const th = base - ty;
    const bx = tx + 0.5, bw = cw - 1;
    // body: chamfered top corners, cut row by row so nothing antialiases
    ctx.fillStyle = on ? GILT.key : '#0a0705';
    ctx.fillRect(bx + 1, ty, bw - 2, th); ctx.fillRect(bx, ty + 1, bw, th - 1);
    const g = ctx.createLinearGradient(0, ty, 0, base);
    if (on) { g.addColorStop(0, '#5a4128'); g.addColorStop(1, '#2c1f13'); }
    else { g.addColorStop(0, '#271c13'); g.addColorStop(1, '#150f0a'); }
    ctx.fillStyle = g;
    ctx.fillRect(bx + 1, ty + t, bw - 2, th - t); ctx.fillRect(bx + t, ty + 1, bw - t * 2, th - 1);
    if (on) {
      // gilt edging up one side, across the top and down the other
      ctx.fillStyle = GILT.hi; ctx.fillRect(bx + 1, ty, bw - 2, t); ctx.fillRect(bx, ty + 1, t, th - 1);
      ctx.fillStyle = GILT.lo; ctx.fillRect(bx + bw - t, ty + 1, t, th - 1);
      if (fine) { ctx.fillStyle = GILT.spec; ctx.fillRect(bx + 1, ty, Math.min(8, bw - 2), t); }
      // a pool of lamplight on the open tab, and no seam into the page
      const rg = ctx.createRadialGradient(bx + bw / 2, ty + 2, 1, bx + bw / 2, ty + 2, bw * 0.6);
      rg.addColorStop(0, 'rgba(255,220,150,0.16)'); rg.addColorStop(1, 'rgba(255,220,150,0)');
      ctx.fillStyle = rg; ctx.fillRect(bx + t, ty + t, bw - t * 2, th - t);
      ctx.fillStyle = '#2c1f13'; ctx.fillRect(bx + t, base, bw - t * 2, 1);
    } else {
      ctx.fillStyle = 'rgba(255,230,180,0.10)'; ctx.fillRect(bx + 1, ty, bw - 2, t);
      ctx.fillStyle = 'rgba(184,137,58,0.30)'; ctx.fillRect(bx, ty + 1, t, th - 1); ctx.fillRect(bx + bw - t, ty + 1, t, th - 1);
    }
    const label = String(it.label == null ? raw : it.label);
    const col = on ? C.goldBright : (it.disabled ? C.disabled : '#a8987a');
    const ly = ty + (th - 3.5) / 2 - 0.5;
    const iconW = it.icon ? 10 : 0;
    const caps = label.toUpperCase();
    const room = cw - 6 - iconW;
    const sp = measure(caps, 'fineb') + (caps.length - 1) * 0.5 <= room ? 1 : 0;
    const lw = Math.min(room, measure(caps, 'fineb') + (sp ? (caps.length - 1) * 0.5 : 0));
    let lx = snap(tx + (cw - lw - iconW) / 2);
    if (it.icon) {
      safe(() => UI.icon(ctx, it.icon, lx, snap(ty + (th - 8) / 2), 8, on ? null : '#8a7a5c'));
      lx += iconW;
    }
    text(ctx, lx, snap(ly), caps, { size: 'fineb', color: col, letterSpacing: sp ? 2 : undefined,
      shadow: 'rgba(0,0,0,0.85)', maxWidth: room });
    if (it.badge) {
      ctx.fillStyle = RUBRIC.hi; ctx.fillRect(tx + cw - 5, ty + 2, 2, 2);
    }
  }
  return base + 1;
}

// ---------------------------------------------------------------------------
// the key strip
// ---------------------------------------------------------------------------

/**
 * A keycap in the fine face: an ivory key with a dark letter, 7px tall.
 * Returns its width. o: { dim }
 */
export function keycap(ctx, x, y, key, o = {}) {
  const s = String(key == null ? '' : key).toUpperCase();
  const fine = resOf(ctx) >= 2;
  if (!fine) return safe(() => UI.keyHint(ctx, x, y - 2, s, ''), 10);
  const w = snap(Math.max(6.5, measure(s, 'fineb') + 3));
  const h = 7;
  x = snap(x); y = snap(y);
  const a = ctx.globalAlpha;
  if (o.dim) ctx.globalAlpha = a * 0.55;
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(x + 0.5, y + 0.5, w, h);
  ctx.fillStyle = '#140c05'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#7a5620'; ctx.fillRect(x + 0.5, y + 0.5, w - 1, h - 1);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#f8e6b0'); g.addColorStop(1, '#d2a852');
  ctx.fillStyle = g; ctx.fillRect(x + 0.5, y + 0.5, w - 1, h - 1.5);
  ctx.fillStyle = '#fff8e0'; ctx.fillRect(x + 1, y + 0.5, w - 2, 0.5);
  text(ctx, x + w / 2 + 0.25, y + 1.5, s, { size: 'fineb', color: '#2a1806', align: 'center', shadow: false });
  ctx.globalAlpha = a;
  return w;
}

/**
 * The foot of every screen: a dark band under a gilt hairline, and the
 * keys that work here as [KEY] label pairs. hints: [[key, label], ...]
 * (falsy entries skipped). o: { y (strip top, default 220), right: text for the right end, rightColor }
 */
export function keys(ctx, hints, o = {}) {
  const top = o.y == null ? 220 : o.y;
  const g = ctx.createLinearGradient(0, top, 0, H);
  g.addColorStop(0, 'rgba(10,8,10,0.94)'); g.addColorStop(1, 'rgba(4,3,5,0.98)');
  ctx.fillStyle = g; ctx.fillRect(0, top, W, H - top);
  const fine = resOf(ctx) >= 2;
  const t = fine ? 0.5 : 1;
  ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillRect(0, top, W, t);
  const rg = ctx.createLinearGradient(0, 0, W, 0);
  rg.addColorStop(0, 'rgba(184,137,58,0.25)'); rg.addColorStop(0.5, 'rgba(242,210,122,0.8)'); rg.addColorStop(1, 'rgba(184,137,58,0.25)');
  ctx.fillStyle = rg; ctx.fillRect(0, top + t, W, t);
  if (fine) safe(() => fleuron(ctx, W / 2, top + 0.75, {}));
  const cy = snap(top + (H - top - 7) / 2 + 0.5);
  let x = 6;
  for (const h of hints || []) {
    if (!h) continue;
    if (x > W - 30) break;
    const kw = keycap(ctx, x, cy, h[0], { dim: h[2] === false });
    let w = kw;
    if (h[1]) {
      const r = text(ctx, x + kw + 2.5, cy + 1.5, h[1], { color: h[2] === false ? C.disabled : '#cfc3a6', shadow: 'rgba(0,0,0,0.8)' });
      w += 2.5 + (r.w || measure(h[1]));
    }
    x = snap(x + w + 8);
  }
  if (o.right) text(ctx, W - 6, cy + 1.5, o.right, { color: o.rightColor || C.goldBright, align: 'right', maxWidth: Math.max(30, W - x - 12) });
  return x;
}

// ---------------------------------------------------------------------------
// surfaces
// ---------------------------------------------------------------------------

/** The ink a parchment page carries. */
export const PAGE_INK = Object.freeze({ body: '#2a1a0a', dim: '#6a5030', title: '#3a2712', rubric: '#9a2a1a', gilt: '#8a5a12' });

/**
 * A sheet of parchment: the kit's parchment material with a ruled margin, for
 * the screens that are the party's own writing (journal, lore, letters).
 * Returns the kit's interior { ix, iy, iw, ih }.
 */
export function page(ctx, x, y, w, h, o = {}) {
  const p = safe(() => UI.panel(ctx, x, y, w, h, { style: 'parchment', ...o }), null)
    || { ix: x + 3, iy: y + 3, iw: w - 6, ih: h - 6 };
  if (o.margin !== false && resOf(ctx) >= 2 && w > 60) {
    // a scribe's ruled margin, drawn with a dry point: barely there
    ctx.fillStyle = 'rgba(154,42,26,0.22)';
    ctx.fillRect(snap(p.ix + 3), p.iy + 1, 0.5, p.ih - 2);
  }
  return p;
}

/** Text on parchment: dark ink, no drop shadow (a shadow on a pale page reads as a smudge). */
export function ink(ctx, x, y, s, o = {}) {
  return text(ctx, x, y, s, { color: PAGE_INK.body, shadow: false, ...o });
}

/** A rubric on parchment: red capitals, spaced, with a red hairline. -> next y */
export function pageSection(ctx, x, y, w, label) {
  const s = String(label == null ? '' : label).toUpperCase();
  const r = text(ctx, x, y, s, { size: 'fineb', color: PAGE_INK.rubric, letterSpacing: 2, shadow: false, maxWidth: w });
  const lw = r.w || measure(s, 'fineb');
  const rx = snap(x + lw + 3), rw = snap(x + w - rx);
  if (rw > 6) {
    ctx.fillStyle = 'rgba(154,42,26,0.45)';
    ctx.fillRect(rx, snap(y + 1.5), rw, resOf(ctx) >= 2 ? 0.5 : 1);
  }
  return snap(y + lineH('fineb') + 2);
}

/**
 * A pale inset well for a list or a figure, one device pixel of keyline and a
 * lit/shaded bevel (light from the upper left).
 */
export function well(ctx, x, y, w, h, fill = 'rgba(6,5,8,0.55)') {
  ctx.fillStyle = fill; ctx.fillRect(x, y, w, h);
  safe(() => hairFrame(ctx, x, y, w, h, 'rgba(0,0,0,0.7)', 'rgba(255,232,190,0.12)'));
}

/**
 * A list's scrollbar: a 3px groove with a gilt thumb, nothing drawn outside
 * it (the kit's chevrons hang past the ends, which a tight panel cannot spare).
 * Draws nothing when everything fits.
 */
export function scroll(ctx, x, y, h, top, rows, total) {
  if (!(total > rows) || h < 8) return;
  x = snap(x); y = snap(y); h = snap(h);
  const fine = resOf(ctx) >= 2;
  const t = fine ? 0.5 : 1;
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x, y, 3, h);
  safe(() => hairFrame(ctx, x, y, 3, h, 'rgba(0,0,0,0.75)', 'rgba(255,232,190,0.12)'));
  const th = Math.max(6, Math.round((rows / total) * h));
  const maxTop = Math.max(1, total - rows);
  const ty = snap(y + ((h - th) * Math.max(0, Math.min(1, top / maxTop))));
  const g = ctx.createLinearGradient(x, 0, x + 3, 0);
  g.addColorStop(0, GILT.hi); g.addColorStop(1, GILT.lo);
  ctx.fillStyle = g; ctx.fillRect(x + t, ty, 3 - t * 2, th);
  ctx.fillStyle = GILT.spec || '#fff4c8'; ctx.fillRect(x + t, ty, 3 - t * 2, t);
  ctx.fillStyle = 'rgba(40,24,6,0.8)'; ctx.fillRect(x + t, ty + th - t, 3 - t * 2, t);
}

/** A thin meter: the kit's bar with a one-device-pixel keyline instead of its whole-pixel border. */
export function meter(ctx, x, y, w, h, p, o = {}) {
  const t = resOf(ctx) >= 2 ? 0.5 : 1;
  ctx.fillStyle = '#0a0705';
  ctx.fillRect(Math.round(x) - t, Math.round(y) - t, Math.round(w) + t * 2, Math.round(h) + t * 2);
  safe(() => UI.bar(ctx, x, y, w, h, p, { ...o, border: false }));
}

/**
 * A boxed figure on a character sheet: the number in the body face in the
 * middle of a sunken well, its name in small capitals beneath (AC, HP, SPEED).
 * o: { color, size }
 */
export function statBox(ctx, x, y, w, h, label, value, o = {}) {
  well(ctx, x, y, w, h, 'rgba(0,0,0,0.38)');
  const t = resOf(ctx) >= 2 ? 0.5 : 1;
  ctx.fillStyle = 'rgba(217,164,65,0.45)'; ctx.fillRect(x + 2, y + t, w - 4, t);
  text(ctx, x + w / 2, y + 2.5, value, { size: o.size || 'md', color: o.color || C.goldBright, align: 'center',
    shadow: 'rgba(0,0,0,0.8)', maxWidth: w - 2 });
  text(ctx, x + w / 2 + 0.5, y + h - 5, String(label).toUpperCase(), { size: 'xs', color: '#a8987a', align: 'center', shadow: false, maxWidth: w - 2 });
}

/**
 * A tag in the fine face: a dark slip with a coloured hairline, 7px tall
 * (the kit's chip is a whole-size tag; these sit in rows of fine text).
 * Returns its width. o: { color, bg }
 */
export function chip(ctx, x, y, label, o = {}) {
  const s = String(label == null ? '' : label);
  const col = o.color || C.inkDim;
  x = snap(x); y = snap(y);
  const w = snap(measure(s) + 5);
  ctx.fillStyle = o.bg || 'rgba(0,0,0,0.5)'; ctx.fillRect(x, y, w, 7);
  ctx.save(); ctx.globalAlpha *= 0.75;
  safe(() => hairFrame(ctx, x, y, w, 7, col, col));
  ctx.restore();
  text(ctx, x + 2.5, y + 1.5, s, { color: col, shadow: false });
  return w;
}

/** A small rubric-red lozenge bullet, for lists on parchment or vellum. */
export function bullet(ctx, x, y, color = RUBRIC.hi) {
  const t = resOf(ctx) >= 2 ? 0.5 : 1;
  ctx.fillStyle = color;
  ctx.fillRect(snap(x), snap(y) - t, t, t * 3); ctx.fillRect(snap(x) - t, snap(y), t * 3, t);
}

// ---------------------------------------------------------------------------
// frames, plates and portraits
// ---------------------------------------------------------------------------

/**
 * A gilt picture frame round a dark, lamp-lit ground: a keyline, a gilt
 * bevel lit from the upper left, an inner keyline. Returns the interior.
 * o: { ground: [top, bottom] colours, glow: warm backlight alpha }
 */
export function frame(ctx, x, y, w, h, o = {}) {
  x = snap(x); y = snap(y); w = snap(w); h = snap(h);
  const fine = resOf(ctx) >= 2;
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(x + 1, y + 1.5, w, h);
  ctx.fillStyle = GILT.key; ctx.fillRect(x, y, w, h);
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, GILT.hi); g.addColorStop(0.45, GILT.base); g.addColorStop(1, GILT.lo);
  ctx.fillStyle = g; ctx.fillRect(x + 0.5, y + 0.5, w - 1, h - 1);
  if (fine) safe(() => hairFrame(ctx, x + 0.5, y + 0.5, w - 1, h - 1, GILT.spec, GILT.lo));
  ctx.fillStyle = GILT.key; ctx.fillRect(x + 1.5, y + 1.5, w - 3, h - 3);
  const ix = x + 2, iy = y + 2, iw = w - 4, ih = h - 4;
  const gr = o.ground || ['#3a2a1c', '#0e0a08'];
  const bg = ctx.createLinearGradient(0, iy, 0, iy + ih);
  bg.addColorStop(0, gr[0]); bg.addColorStop(1, gr[1]);
  ctx.fillStyle = bg; ctx.fillRect(ix, iy, iw, ih);
  // a lamp behind the sitter's head, so a dark cloak still has a silhouette
  const glow = o.glow == null ? 0.22 : o.glow;
  if (glow > 0) {
    const rg = ctx.createRadialGradient(ix + iw * 0.42, iy + ih * 0.38, 1, ix + iw * 0.45, iy + ih * 0.45, Math.max(iw, ih) * 0.7);
    rg.addColorStop(0, `rgba(255,214,150,${glow})`); rg.addColorStop(1, 'rgba(255,214,150,0)');
    ctx.fillStyle = rg; ctx.fillRect(ix, iy, iw, ih);
  }
  // gilt corner studs, where the joiner pinned the mitres
  if (fine && w >= 24) {
    for (const [cx, cy] of [[x, y], [x + w - 2, y], [x, y + h - 2], [x + w - 2, y + h - 2]]) {
      ctx.fillStyle = GILT.key; ctx.fillRect(cx - 0.5, cy - 0.5, 3, 3);
      ctx.fillStyle = GILT.hi; ctx.fillRect(cx, cy, 2, 2);
      ctx.fillStyle = GILT.spec; ctx.fillRect(cx, cy, 1, 0.5);
      ctx.fillStyle = GILT.lo; ctx.fillRect(cx + 1, cy + 1.5, 1, 0.5);
    }
  }
  return { ix, iy, iw, ih };
}

/**
 * A character in a gilt frame: the painted bust for a person, a creature's
 * head from its sprite at a whole-number scale, a lettered signet failing
 * both. o: { ground, glow, dim (a downed or absent character), flip }
 */
export function portrait(ctx, ch, x, y, w, h = w, o = {}) {
  const f = frame(ctx, x, y, w, h, o);
  ctx.save();
  ctx.beginPath(); ctx.rect(f.ix, f.iy, f.iw, f.ih); ctx.clip();
  let drew = false;
  if (ch) drew = safe(() => drawPortrait(ctx, ch, f.ix, f.iy, f.iw, { h: f.ih, flip: o.flip }) === true, false);
  const fam = ch && (ch.monsterId ? monsterSpriteName(ch.monsterId) : (ch.sprite || ch.spriteName));
  if (!drew && fam && safe(() => hasSprite(fam), false)) {
    // Fit the creature rather than cropping the top fifteen rows. Large wolf
    // art has empty space above its head, which made that crop look blank.
    const sz = spriteSize(fam);
    const fit = Math.min(f.iw / sz.w, f.ih / sz.h);
    const s = fit >= 1 ? Math.floor(fit) : fit;
    drew = safe(() => drawSprite(ctx, fam, 'down-0', f.ix + f.iw / 2, f.iy + (f.ih + sz.h * s) / 2,
      { scale: s, colorway: ch.colorway || undefined, shadow: false }), false);
  }
  if (!drew && ch && ch.appearance) drew = safe(() => { drawActorBust(ctx, ch, f.ix, f.iy, Math.min(f.iw, f.ih)); return true; }, false);
  if (!drew) {
    const L = String((ch && ch.name) || '?').charAt(0).toUpperCase();
    safe(() => UI.text(ctx, f.ix + f.iw / 2, f.iy + f.ih / 2 - 8, L, { size: 'titleLg', gilt: true, align: 'center' }));
  }
  if (o.dim) { ctx.fillStyle = 'rgba(20,10,10,0.55)'; ctx.fillRect(f.ix, f.iy, f.iw, f.ih); }
  ctx.restore();
  // the sitter is under the frame's lip: a soft shadow along the top
  const sh = ctx.createLinearGradient(0, f.iy, 0, f.iy + 4);
  sh.addColorStop(0, 'rgba(0,0,0,0.45)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sh; ctx.fillRect(f.ix, f.iy, f.iw, 4);
  return f;
}

/**
 * A cartouche: a dark plate edged in gilt with a lozenge finial at each end,
 * for a speaker's name or a card's title. o: { colors: [top, bottom] }
 */
export function plate(ctx, x, y, w, h, o = {}) {
  x = snap(x); y = snap(y); w = snap(w); h = snap(h);
  const fine = resOf(ctx) >= 2;
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x + 1, y + 1.5, w, h);
  ctx.fillStyle = GILT.key; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = GILT.base; ctx.fillRect(x + 0.5, y + 0.5, w - 1, h - 1);
  if (fine) safe(() => hairFrame(ctx, x + 0.5, y + 0.5, w - 1, h - 1, GILT.hi, GILT.lo));
  const c = o.colors || ['#33241a', '#150e09'];
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, c[0]); g.addColorStop(1, c[1]);
  ctx.fillStyle = g; ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  ctx.fillStyle = 'rgba(255,232,190,0.10)'; ctx.fillRect(x + 1, y + 1, w - 2, fine ? 0.5 : 1);
  // lozenge finials, drawn in whole rows so nothing antialiases
  const r = Math.max(1, Math.min(3, Math.floor(h / 2) - 1));
  const top = Math.round(y + h / 2 - r - 0.5);
  for (let i = 0; i <= r * 2; i++) {
    const hw = r - Math.abs(r - i);
    const yy = top + i;
    ctx.fillStyle = GILT.key;
    ctx.fillRect(x - hw - 1, yy, hw + 1, 1); ctx.fillRect(x + w, yy, hw + 1, 1);
    if (hw > 0) {
      ctx.fillStyle = i <= r ? GILT.hi : GILT.lo;
      ctx.fillRect(x - hw - 0.5, yy, hw, 1); ctx.fillRect(x + w, yy, hw, 1);
    }
  }
  return { x, y, w, h };
}

export const MK = {
  desk, veil, text, measure, fit, para, capPara, wrap, lineH, title, header, rule, section, kv,
  selRow, hoverRow, tabs, keycap, keys, page, ink, pageSection, well, scroll, bullet, meter, statBox, chip, PAGE_INK,
  frame, portrait, plate,
};
export default MK;
