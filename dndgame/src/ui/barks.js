// ui/barks.js — speech bubbles over people in the world: short lines said aloud, drawn on 'world-ui'.
//
//   import { bark } from '../ui/barks.js';
//   bark(entity, 'Mind the cart!');                         // follows the entity
//   bark({ x: 12, y: 8 }, 'Help!', { ttl: 3, kind: 'shout' });   // a map tile
//   scene.hud.bark(target, text, opts)                      // the same thing
//
// target: anything with px/py (an entity or the player: followed as it moves),
// { px, py } a world-pixel point, or { x, y } a map tile (the bubble sits over
// its centre). opts: { ttl seconds (default from the length of the line),
// kind: 'say' | 'shout' | 'whisper' | 'party' | 'hostile' | 'thought' }.
// A speaker has one bubble at a time (a new line replaces the old); at most
// five are up at once; bubbles stack upward rather than overlap, keep clear
// of every visible HUD widget and of the interact hint, and fade near the
// screen edge instead of being cut off. Returns the bark record, or null.

import { UI } from './kit.js';
import { snap, tw, txt } from './hudparts.js';
import { VIEW_W, VIEW_H, TILE, clamp } from '../constants.js';

const MAX = 5;
const WRAP = 76;                 // logical px of text per line before wrapping
const LINES = 3;
const REVEAL = 55;               // characters per second, typed in

const KINDS = {
  say: { fill: '#f1e6c8', edge: '#2a1c10', ink: '#2a1c10', tail: 'point' },
  shout: { fill: '#fff2d6', edge: '#8a1c12', ink: '#7a1810', tail: 'point', bold: true },
  whisper: { fill: '#d8d2c4', edge: '#5a5448', ink: '#4a443a', tail: 'point', alpha: 0.85 },
  party: { fill: '#e2e8f4', edge: '#1e2e58', ink: '#1a2648', tail: 'point' },
  hostile: { fill: '#f4d8cc', edge: '#6a1410', ink: '#5a1410', tail: 'point', bold: true },
  thought: { fill: '#ece6da', edge: '#4a4238', ink: '#3a3228', tail: 'bubbles' },
};

const list = [];

function wrap(text, bold) {
  const size = bold ? 'fineb' : 'fine';
  let lines;
  try { lines = UI.wrapLines(String(text), WRAP, size, undefined, 2); } catch (e) { lines = [String(text)]; }
  if (lines.length > LINES) {
    lines = lines.slice(0, LINES);
    lines[LINES - 1] = UI.fit(lines[LINES - 1] + '…', WRAP, size, 2);
  }
  return lines;
}

/** Say `text` over `target`. See the header for the arguments. */
export function bark(target, text, opts = {}) {
  if (!target || !text) return null;
  const kind = KINDS[opts.kind] ? opts.kind : 'say';
  const s = String(text).trim();
  if (!s) return null;
  // A speaker who speaks again replaces their own bubble rather than stacking two.
  for (let i = list.length - 1; i >= 0; i--) if (list[i].target === target) list.splice(i, 1);
  const b = {
    target, text: s, kind, t: 0,
    ttl: Number.isFinite(opts.ttl) && opts.ttl > 0 ? opts.ttl : clamp(1.6 + s.length * 0.06, 2.2, 6),
    lines: wrap(s, KINDS[kind].bold),
    y: null,                     // eased screen y, so a bubble pushed up glides
  };
  list.push(b);
  while (list.length > MAX) list.shift();
  return b;
}

/** Drop every bubble (a new map, a cutscene). */
export function clearBarks() { list.length = 0; }

/** The live bubbles, oldest first (read-only use). */
export function barks() { return list; }

export function updateBarks(dt) {
  for (let i = list.length - 1; i >= 0; i--) {
    const b = list[i];
    b.t += dt;
    if (b.t >= b.ttl || (b.target && b.target.removed)) list.splice(i, 1);
  }
}

/** Where the speaker's head is on screen (logical px), or null. */
function anchorOf(target, cam) {
  let wx, wy, tall = 0;
  if (Number.isFinite(target.px) && Number.isFinite(target.py)) {
    wx = target.px; wy = target.py;
    // An entity's py is its tile centre; its head is a sprite height above.
    tall = target.char || target.sprite || target.kind ? 26 : 0;
    if (target.kind === 'monster' || target.kind === 'chest' || target.kind === 'sign') tall = 18;
  } else if (Number.isFinite(target.x) && Number.isFinite(target.y)) {
    wx = target.x * TILE + TILE / 2; wy = target.y * TILE + TILE / 2; tall = 10;
  } else return null;
  return { x: wx - cam.x, y: wy - cam.y - tall };
}

const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/**
 * Draw every bubble. cam: { x, y } in world px. avoid: rects (logical) the
 * bubbles must stay off — the visible HUD widgets and the interact hint.
 */
export function drawBarks(ctx, cam, avoid = [], dt = 0) {
  if (!list.length) return;
  const placed = [];
  // Nearest the bottom of the screen first: the lower speaker keeps the spot
  // closest to their head and the one behind them steps up.
  const order = list.map((b) => ({ b, a: anchorOf(b.target, cam) }))
    .filter((o) => o.a && o.a.x > -40 && o.a.x < VIEW_W + 40 && o.a.y > -20 && o.a.y < VIEW_H + 40)
    .sort((p, q) => q.a.y - p.a.y);
  for (const { b, a } of order) {
    const k = KINDS[b.kind];
    const size = k.bold ? 'fineb' : 'fine';
    const shown = Math.min(b.text.length, Math.floor(b.t * REVEAL) + 1);
    const w = snap(Math.max(14, ...b.lines.map((l) => tw(l, size))) + 5);
    const h = snap(b.lines.length * 5 + 3);
    const r = { x: snap(clamp(a.x - w / 2, 2, VIEW_W - w - 2)), y: snap(a.y - h - 4), w, h };
    // Step up past anything already there (other bubbles, the hint, the HUD).
    for (let guard = 0; guard < 12; guard++) {
      const hit = placed.find((p) => overlaps(r, p)) || avoid.find((p) => p && overlaps(r, p));
      if (!hit) break;
      // A HUD widget beside the speaker: slide sideways off it before climbing.
      if (avoid.includes(hit) && guard === 0) {
        const left = hit.x - w - 1, right = hit.x + hit.w + 1;
        const nx = Math.abs(left - r.x) < Math.abs(right - r.x) && left >= 2 ? left : right;
        if (nx >= 2 && nx + w <= VIEW_W - 2) { r.x = snap(nx); continue; }
      }
      r.y = snap(hit.y - h - 1);
    }
    if (r.y < 1) continue;                         // no room left above: skip, never cover the HUD
    b.y = b.y == null ? r.y : b.y + (r.y - b.y) * Math.min(1, dt * 14);
    const y = snap(b.y);
    placed.push(r);

    const inT = clamp(b.t / 0.12, 0, 1), outT = clamp((b.ttl - b.t) / 0.35, 0, 1);
    const alpha = (k.alpha || 1) * Math.min(inT, outT);
    if (alpha <= 0.02) continue;
    const a0 = ctx.globalAlpha;
    ctx.globalAlpha = a0 * alpha;
    bubble(ctx, r.x, y, w, h, a, k, inT);
    let left = shown;
    for (let i = 0; i < b.lines.length && left > 0; i++) {
      const line = b.lines[i].slice(0, left);
      left -= b.lines[i].length + 1;
      txt(ctx, r.x + 2.5, y + 2 + i * 5, line, size, k.ink);
    }
    ctx.globalAlpha = a0;
  }
}

/** The bubble: a rounded parchment slip with a keyline and a tail to the speaker. */
function bubble(ctx, x, y, w, h, a, k, grow) {
  const tx = snap(clamp(a.x, x + 3, x + w - 3));
  // keyline, then the fill one device pixel in, with the corners knocked off
  ctx.fillStyle = k.edge;
  ctx.fillRect(x + 1, y, w - 2, h);
  ctx.fillRect(x, y + 1, w, h - 2);
  ctx.fillRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.fillStyle = k.fill;
  ctx.fillRect(x + 1, y + 0.5, w - 2, h - 1);
  ctx.fillRect(x + 0.5, y + 1, w - 1, h - 2);
  // a lit top edge and a shaded foot, so the slip reads as paper, not a box
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fillRect(x + 1.5, y + 1, w - 3, 0.5);
  ctx.fillStyle = 'rgba(60,40,20,0.18)';
  ctx.fillRect(x + 1, y + h - 1.5, w - 2, 0.5);
  const by = y + h;
  if (k.tail === 'bubbles') {
    ctx.fillStyle = k.edge;
    ctx.fillRect(tx - 1, by + 0.5, 2, 2); ctx.fillRect(tx + 0.5, by + 3, 1, 1);
    ctx.fillStyle = k.fill;
    ctx.fillRect(tx - 0.5, by + 1, 1, 1);
    return;
  }
  // A pointed tail, three device rows, drawn in by `grow` as the bubble pops.
  const rows = Math.max(1, Math.round(4 * grow));
  for (let i = 0; i < rows; i++) {
    const half = snap(Math.max(0.5, 1.5 - i * 0.5));
    ctx.fillStyle = k.edge;
    ctx.fillRect(tx - half - 0.5, by - 0.5 + i * 0.5, half * 2 + 1, 0.5);
    if (half > 0.5) { ctx.fillStyle = k.fill; ctx.fillRect(tx - half + 0.5, by - 0.5 + i * 0.5, half * 2 - 1, 0.5); }
  }
  ctx.fillStyle = k.edge;
  ctx.fillRect(tx - 0.5, by - 0.5 + rows * 0.5, 0.5, 0.5);
}
