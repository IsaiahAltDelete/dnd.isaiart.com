// ui/hotbar.js — the action belt: what you can do right now, and the key that does it.
//
// One contextual E verb, four quick slots and four menu shortcuts on a single
// belt at the foot of the screen. Shift changes the verb to Attack only while
// facing a creature; empty ground shows a quiet Explore state rather than a
// second permanent attack button. The overworld owns verb selection; this
// module owns the drawing and the hit geometry, which are built from the same
// rects every frame, so wherever the 'hud.toolbar' widget is moved (ui/layout.js)
// every button is clickable exactly where it is drawn.
//
// Drawn on the 2x 'hud' layer: the plates, keycaps and labels sit on the fine
// grid (ui/hudparts.js), which is how the belt fits three kinds of button into
// under half the width the old one needed.

import { UI } from './kit.js';
import { GILT } from './ornament.js';
import { Layout } from './layout.js';
import { Input } from '../core/input.js';
import { frame, well, cap, txt, tw, fit, snap, cached, blit } from './hudparts.js';
import { VIEW_W, VIEW_H, clamp } from '../constants.js';

function safe(fn, fb) { try { const v = fn(); return v === undefined ? fb : v; } catch (e) { return fb; } }

const C = UI.COLORS;

export const SLOT_COUNT = 4;

// Plate sizes (logical px).
const VERB_W = 46;
const SLOT_W = 15;
const MENU_W = 13;
const PLATE_H = 15;
const GAP = 1;
const SEP = 5;            // a separator's whole width, rule included
const PAD = 1.5;
const BELT_W = PAD * 2 + VERB_W + SEP + SLOT_COUNT * SLOT_W + (SLOT_COUNT - 1) * GAP + SEP + 4 * MENU_W + 3 * GAP;
const BELT_H = PLATE_H + PAD * 2;

// BAR follows the 'hud.toolbar' widget each draw, so the plates and the hit
// rects built from them go wherever the player moved the belt.
export const BAR = { x: Math.round((VIEW_W - BELT_W) / 2), y: VIEW_H - 2 - Math.ceil(BELT_H), w: Math.ceil(BELT_W), h: Math.ceil(BELT_H) };
Layout.register('hud.toolbar', { anchor: 'bc', ...BAR, label: 'Action belt', scene: 'overworld' });

// What each verb looks like on the plate.
const VERB_ICON = { Talk: 'talk', Fight: 'sword', Attack: 'sword', Open: 'chest', Empty: 'chest', Enter: 'arrow-up', Read: 'book', Shop: 'coin', Rest: 'candle', Look: 'eye', Explore: 'eye' };

export class Hotbar {
  constructor() {
    this.t = 0;
    this.hot = [];         // { x, y, w, h, fn, tip } — rebuilt every draw
    this.tip = '';         // the line shown above the belt when hovering
    this.tipT = 0;
    this.flash = -1;       // slot index to pulse after it fires
    this.flashT = 0;
    this.hoverIndex = -1;
    this.hidden = false;   // the player hid the belt in Arrange mode
  }

  update(dt) {
    this.t += dt;
    if (this.tipT > 0) this.tipT -= dt;
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.flash = -1; }
  }

  say(text) { this.tip = String(text || ''); this.tipT = 2.4; }

  /** Pulse a slot that just fired, so a click reads as having done something. */
  pulse(i) { this.flash = i; this.flashT = 0.35; }

  // -------------------------------------------------------------------------
  // INPUT
  // -------------------------------------------------------------------------

  /** Is (mx, my) over the belt at all? Used to swallow world clicks. */
  contains(mx, my) {
    if (this.hidden) return false;
    return mx >= BAR.x - 1 && mx <= BAR.x + BAR.w + 1 && my >= BAR.y - 1 && my <= BAR.y + BAR.h + 1;
  }

  /** Run whatever sits under the pointer. Returns true if something did. */
  click(mx, my) {
    for (let i = this.hot.length - 1; i >= 0; i--) {
      const r = this.hot[i];
      if (mx < r.x || mx > r.x + r.w || my < r.y || my > r.y + r.h) continue;
      if (r.fn) { safe(() => r.fn()); return true; }
      if (r.tip) { this.say(r.tip); return true; }
      return true;
    }
    return false;
  }

  /** Hovering names the thing under the pointer without clicking it. */
  hover(mx, my) {
    this.hoverIndex = -1;
    for (let i = this.hot.length - 1; i >= 0; i--) {
      const r = this.hot[i];
      if (mx < r.x || mx > r.x + r.w || my < r.y || my > r.y + r.h) continue;
      this.hoverIndex = i;
      if (r.tip) { this.tip = r.tip; this.tipT = 0.2; }
      return;
    }
  }

  // -------------------------------------------------------------------------
  // DRAW
  // -------------------------------------------------------------------------

  /**
   * model: {
   *   context / action: { key, label, enabled, why, tip, fn } | null  — the E verb
   *   attack: { label, enabled, why, fn } | null                      — the Shift+E verb
   *   aggressive: bool                                                  — Shift is held over a creature
   *   slots:  [{ name, icon, ready, why, count, fn, needsChoice, kind, role }]  — quick slots 1..4
   *           `needsChoice` marks a spell that has to ask something before it
   *           can be cast (Teleport: where?). The belt has no room to ask, so it
   *           says where the question lives instead of firing a verb that can
   *           only refuse; rules/fieldcast.js exports fieldNeedsChoice(spellId).
   *   menus:  [{ key, icon, label, fn }]                                — the fixed shortcuts
   * }
   */
  draw(ctx, model) {
    this.hot = [];
    const m = model || {};
    const at = Layout.rect('hud.toolbar');
    BAR.x = at.x; BAR.y = at.y;
    this.hidden = !at.visible;
    if (this.hidden) return;

    frame(ctx, BAR.x, BAR.y, BAR.w, BAR.h, { style: 'window', alpha: 0.96 });
    const y = BAR.y + PAD;
    let x = BAR.x + PAD;
    x = this._verb(ctx, x, y, m.context || m.action, m);
    x = this._sep(ctx, x, y);
    for (let i = 0; i < SLOT_COUNT; i++) x = this._slot(ctx, x, y, i, (m.slots || [])[i]) + (i < SLOT_COUNT - 1 ? GAP : 0);
    x = this._sep(ctx, x, y);
    const menus = m.menus || [];
    menus.forEach((b, i) => { x = this._menuBtn(ctx, x, y, b) + (i < menus.length - 1 ? GAP : 0); });

    if (this.tipT > 0 && this.tip) this._tip(ctx);
  }

  _sep(ctx, x, y) {
    const cx = snap(x + SEP / 2 - 0.25);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(cx + 0.5, y + 2, 0.5, PLATE_H - 4);
    ctx.fillStyle = 'rgba(217,168,62,0.55)';
    ctx.fillRect(cx, y + 2, 0.5, PLATE_H - 4);
    ctx.fillStyle = GILT.hi;
    ctx.fillRect(cx - 0.5, y + PLATE_H / 2 - 0.5, 1.5, 1.5);
    return x + SEP;
  }

  /** A button plate: a recessed face, lit when the pointer is on it, sunk when pressed. */
  _plate(ctx, x, y, w, active) {
    const hover = this.hoverIndex === this.hot.length;
    const pressed = hover && Input.mouse && Input.mouse.down;
    well(ctx, x, y, w, PLATE_H, pressed ? '#0a0806' : hover && active ? '#2a2016' : '#17120e');
    if (hover) frame(ctx, x, y, w, PLATE_H, { tone: 'gilt', outline: true });
    return { x, y, w, h: PLATE_H, hover, pressed };
  }

  _verb(ctx, x, y, v, m) {
    const on = !!(v && v.enabled);
    const label = (v && v.label) || 'Explore';
    const hostile = !!m.aggressive;
    const r = this._plate(ctx, x, y, VERB_W, on);
    const ink = on ? (hostile ? '#f08a6a' : '#f2dca0') : '#7a6c58';
    const icon = VERB_ICON[label] || 'eye';
    if (icon === 'talk') blit(ctx, cached(`talk:${on}`, 9, 9, (g) => paintTalk(g, on)), x + 2, y + 3);
    else safe(() => UI.icon(ctx, icon, x + 2, y + 3, 9, on ? (hostile ? '#e0553f' : GILT.hi) : '#5a4e40'));
    txt(ctx, x + 13, y + 2.5, fit(label, VERB_W - 15, 'fineb'), 'fineb', ink);
    // The key, and the second verb Shift gives it when there is one.
    let kx = x + 13;
    kx += cap(ctx, kx, y + 8, hostile ? UI.G.chevUp + 'E' : 'E', { dim: !on }) + 1.5;
    const alt = m.attack && m.attack.enabled && !hostile ? '+shift: attack' : '';
    if (alt) txt(ctx, kx, y + 9.5, fit(alt, x + VERB_W - kx - 1, 'xs'), 'xs', '#b08a70');
    const tip = v ? (on ? (v.tip || label) : (v.why || 'Not just now.')) : 'Nothing in front of you.';
    this.hot.push({ x: r.x, y: r.y, w: r.w, h: r.h, fn: on ? v.fn : null, tip });
    return x + VERB_W;
  }

  _slot(ctx, x, y, i, s) {
    const ready = !!(s && s.ready), lit = this.flash === i && this.flashT > 0;
    const color = s && (s.kind === 'item' || s.role === 'heal') ? '#8ad0a0' : s && s.role === 'world' ? '#e6c47a' : '#98b8ec';
    const r = this._plate(ctx, x, y, SLOT_W, ready);
    if (s) {
      const icon = s.icon || (s.kind === 'item' ? 'potion' : s.role === 'heal' ? 'plus' : s.role === 'world' ? 'wand' : 'shield');
      safe(() => UI.icon(ctx, icon, x + 4.5, y + 4.5, 9, ready ? color : '#5a5048'));
      if (!ready) { ctx.fillStyle = 'rgba(8,6,6,0.45)'; ctx.fillRect(x + 0.5, y + 0.5, SLOT_W - 1, PLATE_H - 1); }
      if (s.count != null) txt(ctx, x + SLOT_W - 1.5, y + PLATE_H - 4.5, String(s.count), 'xs', '#f2e8d0', { align: 'right', keyline: '#0a0708' });
    } else {
      // An empty slot: a faint dotted socket.
      ctx.fillStyle = 'rgba(176,146,100,0.5)';
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        ctx.fillRect(snap(x + 9 + Math.cos(a) * 3 - 0.25), snap(y + 9 + Math.sin(a) * 3 - 0.25), 0.5, 0.5);
      }
    }
    cap(ctx, x + 0.5, y + 0.5, String(i + 1), { dim: !ready });
    if (lit) {
      const a = ctx.globalAlpha;
      ctx.globalAlpha = a * clamp(this.flashT / 0.35, 0, 1);
      ctx.fillStyle = color;
      ctx.fillRect(x + 0.5, y + 0.5, SLOT_W - 1, PLATE_H - 1);
      ctx.globalAlpha = a;
    }
    const tip = !s ? 'Empty slot - assign from your spellbook or inventory.'
      : !ready ? (s.why || 'Not available.')
        : s.needsChoice ? `${s.name} - open the spellbook to choose` : (s.tip || s.name);
    this.hot.push({ x: r.x, y: r.y, w: r.w, h: r.h, fn: ready ? s.fn : null, tip });
    return x + SLOT_W;
  }

  _menuBtn(ctx, x, y, b) {
    const r = this._plate(ctx, x, y, MENU_W, true);
    if (b.icon) safe(() => UI.icon(ctx, b.icon, x + 2, y + 1.5, 9, r.hover ? GILT.spec : GILT.base));
    txt(ctx, x + MENU_W / 2, y + 10.5, b.key, 'xs', r.hover ? '#f6e7c0' : '#a8987a', { align: 'center' });
    this.hot.push({ x: r.x, y: r.y, w: r.w, h: r.h, fn: b.fn || null, tip: `${b.label}  [${b.key}]` });
    return x + MENU_W;
  }

  /** The hover or refusal line, floated just above the belt (below it if the belt is at the top). */
  _tip(ctx) {
    const label = fit(this.tip, 240, 'fineb');
    const w = snap(tw(label, 'fineb') + 8);
    const x = clamp(snap(BAR.x + BAR.w / 2 - w / 2), 2, VIEW_W - w - 2);
    const y = BAR.y >= 12 ? BAR.y - 9.5 : BAR.y + BAR.h + 1.5;
    ctx.save();
    ctx.globalAlpha *= clamp(this.tipT / 0.25, 0, 1);
    frame(ctx, x, y, w, 8, { alpha: 0.95 });
    txt(ctx, x + 4, y + 2.5, label, 'fineb', C.goldBright || GILT.hi);
    ctx.restore();
  }
}

/**
 * The Talk verb's icon, which the kit does not have: a parchment speech
 * bubble with three ink dots and a tail, in device pixels (18 across).
 */
function paintTalk(g, on) {
  const K = '#140c06', P = on ? '#f2e2b8' : '#6a5e4c', H = on ? '#fff8e0' : '#847660', D = on ? '#5a3a1a' : '#3a3024';
  g.fillStyle = K;
  g.fillRect(3, 1, 12, 1); g.fillRect(2, 2, 14, 1); g.fillRect(1, 3, 16, 7); g.fillRect(2, 10, 14, 1); g.fillRect(3, 11, 12, 1);
  g.fillRect(4, 12, 4, 1); g.fillRect(4, 13, 3, 1); g.fillRect(4, 14, 2, 1); g.fillRect(4, 15, 1, 1);
  g.fillStyle = P;
  g.fillRect(3, 2, 12, 1); g.fillRect(2, 3, 14, 7); g.fillRect(3, 10, 12, 1);
  g.fillRect(5, 11, 2, 1); g.fillRect(5, 12, 2, 1); g.fillRect(5, 13, 1, 1);
  g.fillStyle = H;
  g.fillRect(3, 3, 3, 1); g.fillRect(3, 4, 1, 2);
  g.fillStyle = D;
  g.fillRect(5, 6, 2, 2); g.fillRect(8, 6, 2, 2); g.fillRect(11, 6, 2, 2);
}

export default Hotbar;
