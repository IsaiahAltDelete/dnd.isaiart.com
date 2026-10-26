// ui/inspector.js — the F10 layer inspector: every stage layer, live, with visibility, alpha, solo and draw time.
//
// Drawn on the 'debug' layer in the kit's fine faces. Click a layer's row to
// hide/show it, its alpha to step it down (1, .75, .5, .25, 0), S to show that
// layer alone (a multiply or additive layer is shown plain, so you can see the
// mask it carries). The header switches pass-through compositing and the flat
// single-canvas renderer, which is how to tell a layering bug from a drawing
// one. `how` says whether a layer painted straight through ('pass') or on a
// canvas of its own ('buf') this frame; times are smoothed milliseconds spent
// drawing into each layer, then the composite and the whole frame. The same
// controls are on window.SC.Stage in the console.

import { Stage } from '../render/stage.js';
import { Input } from '../core/input.js';
import { UI } from './kit.js';

const X = 4, Y = 4, WIDTH = 170, HEAD = 15, ROW = 5;
// Column offsets, logical px from the panel's left edge.
const COL = { z: 3, id: 12, res: 52, blend: 60, how: 75, eye: 91, alpha: 98, ms: 112, bar: 126, solo: 154 };
const ALPHAS = [1, 0.75, 0.5, 0.25, 0];
const BLEND = { 'source-over': 'norm', multiply: 'mult', lighter: 'add', screen: 'scrn', overlay: 'ovly' };
// The two switches on the second header row: [x0, x1) in panel px.
const SW_PASS = [3, 56], SW_FLAT = [58, 88];

const GOLD = '#f7dc92', INK = '#e6d8b8', DIM = '#7d6a4a', OFF = '#5a5060', RULE = '#9a7a3c';

const avg = new Map();           // layer id -> smoothed ms
let compAvg = 0, frameAvg = 0;

function smooth(prev, v) { return prev ? prev + (v - prev) * 0.12 : v; }

function txt(ctx, x, y, str, color, size, align) {
  UI.text(ctx, x, y, str, { size: size || 'fine', color, align: align || 'left' });
}

function panelHeight() { return HEAD + Stage.list().length * ROW + 3; }

export const Inspector = {
  open: false,

  toggle() {
    Inspector.open = !Inspector.open;
    if (!Inspector.open) Stage.solo = null;
  },

  /** Clicks on the panel act on the layers and never reach the game. */
  update() {
    const m = Input.mouse;
    if (!m.clicked || m.x < X || m.x >= X + WIDTH || m.y < Y || m.y >= Y + panelHeight()) return;
    m.clicked = false;
    const cx = m.x - X, cy = m.y - Y;
    if (cy >= 5.5 && cy < 10.5) {
      if (cx >= SW_PASS[0] && cx < SW_PASS[1]) Stage.passThrough = !Stage.passThrough;
      else if (cx >= SW_FLAT[0] && cx < SW_FLAT[1]) Stage.flat = !Stage.flat;
      return;
    }
    const rows = Stage.list();
    const L = rows[Math.floor((cy - HEAD) / ROW)];
    if (!L || cy < HEAD) return;
    if (cx >= COL.solo - 3) Stage.solo = Stage.solo === L.id ? null : L.id;
    else if (cx >= COL.alpha && cx < COL.ms) {
      const k = ALPHAS.findIndex((a) => Math.abs(a - L.alpha) < 0.01);
      Stage.set(L.id, { alpha: ALPHAS[(k + 1) % ALPHAS.length] });
    } else Stage.set(L.id, { visible: !L.visible });
  },

  draw(ctx) {
    const rows = Stage.list();
    for (const L of rows) avg.set(L.id, smooth(avg.get(L.id) || 0, L.drawn ? L.ms : 0));
    compAvg = smooth(compAvg, Stage.compositeMs);
    frameAvg = smooth(frameAvg, Stage.frameMs);
    const h = panelHeight();

    ctx.save();
    ctx.fillStyle = 'rgba(9,7,12,0.92)';
    ctx.fillRect(X, Y, WIDTH, h);
    ctx.fillStyle = RULE;
    ctx.fillRect(X, Y, WIDTH, 1); ctx.fillRect(X, Y + h - 1, WIDTH, 1);
    ctx.fillRect(X, Y, 1, h); ctx.fillRect(X + WIDTH - 1, Y, 1, h);
    ctx.fillStyle = 'rgba(154,122,60,0.35)';
    ctx.fillRect(X + 1, Y + HEAD - 1, WIDTH - 2, 0.5);

    txt(ctx, X + 3, Y + 1.5, 'STAGE LAYERS', GOLD, 'fineb');
    txt(ctx, X + WIDTH - 3, Y + 1.5, `composite ${compAvg.toFixed(2)} ms   frame ${frameAvg.toFixed(1)} ms`, INK, 'xs', 'right');
    const pass = Stage.passThrough, flat = Stage.flat;
    txt(ctx, X + SW_PASS[0], Y + 6.5, `pass-through ${pass ? 'ON' : 'off'}`, pass ? '#9fd08a' : '#d08a6a', 'xs');
    txt(ctx, X + SW_FLAT[0], Y + 6.5, `flat ${flat ? 'ON' : 'off'}`, flat ? '#e8a060' : DIM, 'xs');
    txt(ctx, X + WIDTH - 3, Y + 6.5, `${Stage.directCount} pass  ${Stage.bufferedCount} buf${Stage.solo ? `   solo ${Stage.solo}` : ''}`, DIM, 'xs', 'right');
    const hy = Y + HEAD - 4.5;
    txt(ctx, X + COL.z, hy, 'z', DIM, 'xs');
    txt(ctx, X + COL.id, hy, 'layer', DIM, 'xs');
    txt(ctx, X + COL.res, hy, 'res', DIM, 'xs');
    txt(ctx, X + COL.blend, hy, 'blend', DIM, 'xs');
    txt(ctx, X + COL.how, hy, 'how', DIM, 'xs');
    txt(ctx, X + COL.eye - 1, hy, 'vis', DIM, 'xs');
    txt(ctx, X + COL.alpha, hy, 'alpha', DIM, 'xs');
    txt(ctx, X + COL.ms, hy, 'ms', DIM, 'xs');
    txt(ctx, X + COL.solo, hy, 'solo', DIM, 'xs');

    const m = Input.mouse;
    for (let i = 0; i < rows.length; i++) {
      const L = rows[i];
      const y = Y + HEAD + i * ROW;
      if (m.over && m.x >= X && m.x < X + WIDTH && m.y >= y && m.y < y + ROW) {
        ctx.fillStyle = 'rgba(227,179,74,0.12)';
        ctx.fillRect(X + 1, y, WIDTH - 2, ROW);
      } else if (i % 2) {
        ctx.fillStyle = 'rgba(255,240,200,0.025)';
        ctx.fillRect(X + 1, y, WIDTH - 2, ROW);
      }
      const soloed = Stage.solo === L.id;
      const on = L.visible && L.alpha > 0;
      const ink = !L.drawn ? OFF : on ? INK : '#8a6a5a';
      const ty = y + 0.5;
      txt(ctx, X + COL.z, ty + 0.5, String(Math.round(L.z)), DIM, 'xs');
      txt(ctx, X + COL.id, ty, L.id, soloed ? GOLD : ink);
      txt(ctx, X + COL.res, ty + 0.5, `${L.res}x`, L.res === 2 ? '#8daee0' : '#88c89b', 'xs');
      txt(ctx, X + COL.blend, ty + 0.5, BLEND[L.blend] || L.blend.slice(0, 4), L.blend === 'source-over' ? DIM : '#d4a0e0', 'xs');
      const how = !L.mode ? '' : L.mode === 'direct' ? 'pass' : L.mode === 'late' ? 'late' : 'buf';
      txt(ctx, X + COL.how, ty + 0.5, how, how === 'pass' ? '#7fb070' : how === 'late' ? '#e07050' : '#c0a060', 'xs');
      // The eye: a filled square when shown, a hollow one when hidden.
      ctx.fillStyle = on ? '#e3b34a' : '#6a5040';
      if (on) ctx.fillRect(X + COL.eye, y + 1, 3, 3);
      else { ctx.fillRect(X + COL.eye, y + 1, 3, 0.5); ctx.fillRect(X + COL.eye, y + 3.5, 3, 0.5); ctx.fillRect(X + COL.eye, y + 1, 0.5, 3); ctx.fillRect(X + COL.eye + 2.5, y + 1, 0.5, 3); }
      txt(ctx, X + COL.alpha, ty + 0.5, L.alpha.toFixed(2), L.alpha < 1 ? '#e8a060' : DIM, 'xs');
      const ms = avg.get(L.id) || 0;
      txt(ctx, X + COL.ms, ty + 0.5, L.drawn ? ms.toFixed(2) : '-', ink, 'xs');
      // A bar beside the number makes the expensive layer jump out.
      if (L.drawn) {
        ctx.fillStyle = ms > 2 ? '#c05040' : ms > 0.5 ? '#c0a040' : '#4a7a4a';
        ctx.fillRect(X + COL.bar, y + 1.5, Math.max(0.5, Math.min(24, ms * 4)), 2);
      }
      txt(ctx, X + COL.solo + 2, ty, 'S', soloed ? GOLD : DIM, 'fineb');
    }
    ctx.restore();
  },
};

export default Inspector;
