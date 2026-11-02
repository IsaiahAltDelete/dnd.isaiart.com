// ui/roadnotice.js — the road's narration: a strip of parchment above the toolbar for what you notice.
//
// The encounter director speaks in sentences — tracks across the ruts, woodsmoke
// where there should be none, a caravan coming up the road from Neverwinter — and a
// sentence does not fit in a toast. This is where they go instead: one or two lines
// of parchment with an illuminated initial, held long enough to read (longer lines
// stay longer), never taking the controls away from the player. A warning is
// rubricated, a quiet moment is lapis, somebody arriving is verdigris.

import { UI } from './kit.js';
import { VIEW_W } from '../constants.js';

const MAX = 2;               // notices on screen at once; a third pushes the oldest off
const FADE_IN = 0.25, FADE_OUT = 0.6;
const W = 272, PAD = 5, LINE_H = 9, MAX_LINES = 3;
const GROUND = { telegraph: 'rubric', sign: 'rubric', beat: 'lapis', arrival: 'verdigris', rumor: 'lapis' };

export class RoadNotice {
  constructor() {
    this.items = [];
  }

  /** Say something. kind: 'beat' | 'telegraph' | 'sign' | 'arrival' | 'rumor'. */
  push(text, opts = {}) {
    const s = String(text || '').trim();
    if (!s) return;
    if (this.items.some((n) => n.text === s)) return;
    const life = Math.min(14, 3.5 + s.length / 16);
    this.items.push({ text: s, kind: opts.kind || 'beat', t: 0, life });
    while (this.items.length > MAX) this.items.shift();
  }

  clear() { this.items.length = 0; }

  update(dt) {
    for (const n of this.items) n.t += dt;
    this.items = this.items.filter((n) => n.t < n.life);
  }

  /** Draw, bottom-up, above `bottom` (the top edge of the toolbar). */
  draw(ctx, { bottom = 208, x = null } = {}) {
    if (!this.items.length) return;
    let y = bottom;
    const left = x != null ? x : Math.round((VIEW_W - W) / 2) - 14;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const n = this.items[i];
      const a = Math.min(1, n.t / FADE_IN, Math.max(0, (n.life - n.t) / FADE_OUT));
      if (a <= 0) continue;
      // A sentence that opens on a letter gets an illuminated initial; one that
      // opens on a quotation mark is simply written out.
      const lettered = /[A-Za-z]/.test(n.text[0]);
      const textX = left + PAD + (lettered ? 17 : 2);
      const lines = UI.wrapLines(n.text, W - (textX - left) - PAD, 'sm').slice(0, MAX_LINES);
      const h = Math.max(22, lines.length * LINE_H + PAD * 2 + 1);
      y -= h;
      const prev = ctx.globalAlpha;
      ctx.globalAlpha = prev * a;
      const p = UI.panel(ctx, left, y, W, h, { style: 'parchment', shadow: 0.35, studs: false });
      if (lettered) UI.initial(ctx, left + PAD - 1, y + 4, n.text[0], { size: 'sm', ground: GROUND[n.kind] || 'lapis', vine: false });
      const ink = (p && p.ink) || '#241708';
      lines.forEach((l, k) => {
        // The first letter lives in the initial; the rest of the first line follows it.
        const s = k === 0 && lettered ? l.slice(1) : l;
        UI.text(ctx, textX, y + PAD + 1 + k * LINE_H, s, { size: 'sm', color: n.kind === 'telegraph' ? '#5a1408' : ink, shadow: false });
      });
      ctx.globalAlpha = prev;
      y -= 3;
    }
  }
}

export default RoadNotice;
