// render/stage.js — the layer compositor: every visual element draws into a named layer.
//
// The screen used to be one 400x240 canvas that every pass painted over in turn,
// so nothing could be adjusted without adjusting everything. Now each pass asks
// for its layer by name, and the layers are composited in z order onto the
// 800x480 display canvas:
//
//   res 1 (400x240)  the WORLD. Tiles, actors, weather, grading. Every res-1
//                    layer in the 'world' group is composited into one 400x240
//                    world buffer first, so a multiply grade or an additive glow
//                    acts on the world as a single picture, exactly as it did
//                    when everything shared a canvas; the buffer is then blown
//                    up nearest-neighbour (through the player's pixel filter).
//   res 2 (800x480)  the INTERFACE. Drawn with a 2x base transform, so every
//                    existing call in logical coordinates lands where it always
//                    did, and Stage.fine() drops to the half-pixel grid for
//                    small crisp text and detailed frames.
//
// PASS-THROUGH. A layer is a named place in the z order, not necessarily a
// canvas. Blitting a dozen offscreen canvases a frame costs milliseconds on a
// software-rendered browser, and in the common frame the passes already arrive
// bottom to top (ground, walls, actors, roofs; then the HUD). So a plain layer
// — source-over, fully opaque, unfiltered, unmoved — whose draws arrive in z
// order paints straight into its target (the world buffer, or the display),
// and only the layers that must be separate get a canvas of their own: blends
// (the grade, the glow), anything the inspector or a setting has adjusted, and
// anything whose draws arrive out of order (the weather comes after the grade,
// but sits under it). Which is which is planned from the previous frame's
// order of requests; a buffered layer is composited into its target the moment
// the first pass-through layer above it starts, so z order holds exactly.
// When the order changes (a new scene, a pass that only runs at night) the
// frame still paints everything, a stray layer lands late for that one frame,
// and the plan adapts; a layer that keeps doing that is kept buffered.
//
// The one rule this asks of drawing code: fetch a layer's ctx right before the
// pass that uses it. Two plain layers may share one canvas, so a ctx kept from
// an earlier Stage.ctx() and drawn to after a later layer was fetched lands
// above that later layer. `Stage.passThrough = false` turns sharing off; if a
// picture changes when you do that, some pass is holding a stale ctx.
//
// The engine brackets every scene hook with hookBegin/hookEnd: each context the
// hook touches is saved on first use and restored at the end, and if the hook
// throws, just those contexts are drained back to a clean state — a broken draw
// can never leave a clip or a transform standing into the next pass.

import { VIEW_W, VIEW_H } from '../constants.js';
import { lutFor, applyLut } from './pixelfilter.js';

const W = VIEW_W, H = VIEW_H, FINE = 2;
const DW = W * FINE, DH = H * FINE;
/** Deepest save stack a hook may leave behind; restore() past the bottom is a no-op. */
const MAX_DEPTH = 32;
/** Frames a layer that broke the plan stays buffered. */
const STICKY = 120;
/** Where the scanline mask sits: just above whatever screen-fx drew. */
const SCAN_Z = 150.5;

// The standard stack, bottom to top (docs/OVERHAUL.md 4.2). z leaves room to
// slot new layers between neighbours. `vignette` is ours: the vignette belongs
// to the world (the battle's red "you are hurt" edge must not colour the HUD).
const STANDARD = [
  ['backdrop', 1, 10], ['ground', 1, 20], ['ground-shade', 1, 30], ['deco', 1, 40],
  ['actors', 1, 50], ['fx', 1, 60], ['over', 1, 70], ['weather', 1, 80],
  ['grade', 1, 90, 'multiply'], ['glow', 1, 100, 'lighter'], ['vignette', 1, 105],
  ['world-ui', 2, 110], ['hud', 2, 120], ['menu', 2, 130], ['overlay', 2, 140],
  ['screen-fx', 2, 150], ['transition', 2, 160], ['debug', 2, 170],
];

const layers = new Map();        // id -> record
let ordered = [];                // records by z
const byCtx = new WeakMap();     // ctx -> { res } (for fine() and resOf())
let frame = 0;
let autoZ = 0;                   // lazily created layers stack up above 'fx'
let seq = 0;                     // request counter within the frame

// Per-hook bookkeeping and draw-time attribution.
const hookCtx = new Map();       // ctx -> res, every context the running hook touched
let inHook = false;
let curLayer = null, markT = 0;

let display = null, dctx = null;
let worldBuf = null, wctx = null;
let gradeBuf = null;             // the world after the pixel filter
let scanBuf = null;
let pixelFilter = 'none', filterLut = null;
let scanlines = false, scanDone = false;
let solo = null;
let passThrough = true;
let compositeMs = 0, frameMs = 0, frameT0 = 0, flushMs = 0;
let lastDirect = 0, lastBuffered = 0;

// The two surfaces a plain layer can paint straight into.
const WORLD = { id: 'world', res: 1, ctx: null, cur: null, cursor: -Infinity, open: false, final: false };
const DISP = { id: 'display', res: FINE, ctx: null, cur: null, cursor: -Infinity };

// Flat mode: every id resolves to one opaque 400x240 canvas, painted in call
// order and blown up once — the single-canvas renderer this module replaced.
// It exists to measure the compositor's overhead and to bisect a layering bug
// (does it happen flat too?), from the inspector or the console.
let flatMode = false;
const FLAT = { id: 'flat', res: 1, z: 0, group: 'world', canvas: null, ctx: null, frame: -1, ms: 0, inked: true, flat: true };

const canMake = typeof document !== 'undefined' && typeof document.createElement === 'function';

/** A context that swallows every call: layers still resolve headlessly (node tests). */
const NULL_CTX = typeof Proxy === 'function'
  ? new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } })
  : {};

// Every call that can put a pixel on a canvas. A layer's context reports the
// first of them each frame, so a layer that was fetched but never painted (the
// grade at noon, the world-ui with no damage numbers up) is neither cleared nor
// composited. On a shared surface the report goes to whichever layer is
// painting there now. The watch is a trap that springs once: the first such
// call marks the layer and puts the context's own methods back, and the trap
// is re-armed when the layer is next prepared (or, on a shared surface, when
// the next layer starts painting) — one wrapped call per layer per frame, not
// one per rectangle, which on a busy HUD is thousands.
const INK = ['fillRect', 'strokeRect', 'fill', 'stroke', 'drawImage', 'fillText', 'strokeText', 'putImageData'];

function watchInk(g, owner) {
  const orig = {}, trap = {};
  const shared = owner.cur !== undefined;
  for (const k of INK) {
    const f = g[k];
    if (typeof f !== 'function') continue;
    orig[k] = f;
    trap[k] = function () {
      disarm(g);
      if (shared) { if (owner.cur) owner.cur.inkF = frame; } else owner.inked = true;
      return f.apply(this, arguments);
    };
  }
  g.__ink = { orig, trap, armed: false };
  arm(g);
}

function arm(g) {
  const w = g.__ink;
  if (!w || w.armed) return;
  w.armed = true;
  for (const k in w.trap) g[k] = w.trap[k];
}

function disarm(g) {
  const w = g.__ink;
  if (!w || !w.armed) return;
  w.armed = false;
  for (const k in w.orig) g[k] = w.orig[k];
}

function makeCanvas(w, h, opts) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', opts);
  g.imageSmoothingEnabled = false;
  return { c, g };
}

function resort() {
  ordered = [...layers.values()].sort((a, b) => a.z - b.z);
}

function define(id, o = {}) {
  let L = layers.get(id);
  if (!L) {
    L = {
      id, res: 1, z: 0, group: null, blend: 'source-over', alpha: 1, visible: true,
      offsetX: 0, offsetY: 0, filter: 'none',
      canvas: null, ctx: null, ms: 0, inked: false,
      // this frame: when it was first/last asked for, by a pass or by the
      // engine handing a hook its ctx, and how it is being painted
      frame: -1, own: -1, flushed: false, mode: null, inkF: -1,
      sFirst: 0, sLast: 0, hFirst: 0, hLast: 0,
      plan: 'buffer', sticky: 0,
    };
    layers.set(id, L);
  }
  if (o.res === 1 || o.res === 2) {
    if (L.res !== o.res) { L.canvas = null; L.ctx = null; L.own = -1; }
    L.res = o.res;
  }
  if (Number.isFinite(o.z)) L.z = o.z;
  if (o.blend) L.blend = o.blend;
  if (Number.isFinite(o.alpha)) L.alpha = Math.max(0, Math.min(1, o.alpha));
  if (typeof o.visible === 'boolean') L.visible = o.visible;
  if (Number.isFinite(o.offsetX)) L.offsetX = o.offsetX;
  if (Number.isFinite(o.offsetY)) L.offsetY = o.offsetY;
  if (typeof o.filter === 'string') L.filter = o.filter || 'none';
  if (o.group) L.group = o.group;
  if (!L.group) L.group = L.res === 1 ? 'world' : 'ui';
  resort();
  return L;
}

for (const [id, res, z, blend, group] of STANDARD) define(id, { res, z, blend, group });

/** The surface a layer composites into: the world buffer, the display, or none (it needs a canvas). */
function targetOf(L) {
  if (L.res === 1) return L.group === 'world' ? WORLD : null;
  return DISP;
}

/** Can this layer share its target's canvas at all? */
function plain(L) {
  return L.visible && L.alpha === 1 && L.blend === 'source-over' && (!L.filter || L.filter === 'none')
    && !L.offsetX && !L.offsetY && targetOf(L) !== null;
}

/** Put a context back to a layer's base state: logical px, nothing blended. */
function base(g, res) {
  g.setTransform(res, 0, 0, res, 0, 0);
  g.globalAlpha = 1;
  // Read before writing: a string property set is parsed every time.
  if (g.globalCompositeOperation !== 'source-over') g.globalCompositeOperation = 'source-over';
  if (g.filter !== 'none') g.filter = 'none';
  g.imageSmoothingEnabled = false;
  if (g.shadowBlur || g.shadowOffsetX || g.shadowOffsetY) { g.shadowBlur = 0; g.shadowOffsetX = 0; g.shadowOffsetY = 0; }
}

/** Give a buffered layer its own canvas, wiped and in base state for this frame. */
function prepare(L) {
  if (!L.ctx) {
    if (!canMake) { L.ctx = NULL_CTX; L.own = frame; return; }
    const { c, g } = makeCanvas(W * L.res, H * L.res);
    L.canvas = c; L.ctx = g;
    byCtx.set(g, L);
    watchInk(g, L);
  }
  const g = L.ctx;
  if (g === NULL_CTX) { L.own = frame; return; }
  if (L.inked) {
    // reset() wipes the bitmap AND the whole state stack, clip included; older
    // engines get the drain-and-clear it replaces.
    if (typeof g.reset === 'function') g.reset();
    else {
      for (let i = 0; i < MAX_DEPTH; i++) g.restore();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, L.canvas.width, L.canvas.height);
    }
  } else {
    // Nothing was painted since the last clear: the bitmap is still empty,
    // only the state needs putting back.
    for (let i = 0; i < MAX_DEPTH; i++) g.restore();
  }
  base(g, L.res);
  L.inked = false;
  L.own = frame;
  L.flushed = false;
  arm(g);
}

/** Charge the time since the last layer switch to the layer that was drawing. */
function mark(L) {
  const now = performance.now();
  if (curLayer) curLayer.ms += now - markT;
  curLayer = L; markT = now;
}

function drainCtx(g, res) {
  if (!g || g === NULL_CTX) return;
  for (let i = 0; i < MAX_DEPTH; i++) g.restore();
  // The bottom of the stack is the state the hook found, but a hook that never
  // saved could have left a transform: put the base back regardless.
  base(g, res);
}

/** Has this buffered layer got pixels waiting to be composited? */
function pending(L) {
  return L.own === frame && !L.flushed && L.inked && L.canvas;
}

function shown(L) {
  if (solo) return L.id === solo;
  return L.visible && L.alpha > 0;
}

/** Composite one buffered layer onto `g` (the world buffer or the display). */
function blit(g, L, toDisplay) {
  L.flushed = true;
  if (!shown(L)) return;
  g.globalCompositeOperation = solo ? 'source-over' : L.blend;
  g.globalAlpha = solo ? 1 : L.alpha;
  g.filter = L.filter || 'none';
  const k = toDisplay ? FINE : 1;
  if (L.res === FINE || !toDisplay) g.drawImage(L.canvas, L.offsetX * k, L.offsetY * k);
  else g.drawImage(L.canvas, L.offsetX * k, L.offsetY * k, DW, DH);
}

/**
 * Composite every buffered layer of target T lying below z, in z order, into
 * T's canvas. Runs in the middle of whatever is drawing there, so it brackets
 * itself with its own save/restore.
 */
function flushBelow(T, z) {
  const t0 = performance.now();
  const g = T.ctx;
  let saved = false;
  for (const L of ordered) {
    if (L.z >= z) break;
    if (T === DISP && scanlines && !scanDone && !solo && L.z > SCAN_Z) {
      if (!saved) { g.save(); saved = true; g.setTransform(1, 0, 0, 1, 0, 0); }
      scanPass(g);
    }
    if (!pending(L)) continue;
    // A world layer still waiting when the display is flushed missed the world
    // buffer (it arrived after the world was finished): it goes up now, blown up.
    if (targetOf(L) !== T && !(T === DISP && L.res === 1)) continue;
    if (!saved) { g.save(); saved = true; g.setTransform(1, 0, 0, 1, 0, 0); }
    blit(g, L, T === DISP);
  }
  if (T === DISP && scanlines && !scanDone && !solo && z > SCAN_Z) {
    if (!saved) { g.save(); saved = true; g.setTransform(1, 0, 0, 1, 0, 0); }
    scanPass(g);
  }
  if (saved) g.restore();
  flushMs += performance.now() - t0;
}

/** The fine-grid scanline mask: one darker half-row under every logical row. */
function scanMask() {
  if (scanBuf || !canMake) return scanBuf;
  const { c, g } = makeCanvas(DW, DH);
  for (let y = 1; y < DH; y += 2) {
    // Every fourth logical row a touch deeper, so the grid breathes instead of
    // reading as a flat grey screen door.
    g.fillStyle = (y >> 1) % 4 === 3 ? 'rgba(6,4,10,0.2)' : 'rgba(6,4,10,0.13)';
    g.fillRect(0, y, DW, 1);
  }
  scanBuf = c;
  return c;
}

function scanPass(g) {
  scanDone = true;
  const m = scanMask();
  if (!m) return;
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.filter = 'none';
  g.drawImage(m, 0, 0);
}

/** Start painting the world buffer this frame: opaque black, exactly the old canvas. */
function openWorld() {
  if (WORLD.open) return;
  WORLD.open = true;
  const g = wctx;
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.filter = 'none';
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, H);
  g.restore();
}

/** The world is complete: composite what is left of it, filter it, and blow it up onto the display. */
function finishWorld() {
  if (WORLD.final) return;
  const t0 = performance.now();
  // Any world layer with pixels opens the buffer, even if none painted into it directly.
  for (const L of ordered) if (targetOf(L) === WORLD && pending(L) && shown(L)) { openWorld(); break; }
  if (WORLD.open) flushBelow(WORLD, Infinity);
  WORLD.final = true;
  const d = dctx;
  d.save();
  d.setTransform(1, 0, 0, 1, 0, 0);
  d.globalAlpha = 1; d.globalCompositeOperation = 'source-over'; d.filter = 'none';
  d.imageSmoothingEnabled = false;
  if (WORLD.open) {
    let src = worldBuf;
    if (filterLut && !solo) {
      // The pixel filter, at world resolution before the blow-up: a quarter
      // of the pixels, and every recoloured pixel is a whole world pixel.
      if (!gradeBuf) gradeBuf = makeCanvas(W, H, { alpha: false, willReadFrequently: true });
      const g = gradeBuf.g;
      g.drawImage(worldBuf, 0, 0);
      const img = g.getImageData(0, 0, W, H);
      applyLut(new Uint32Array(img.data.buffer), filterLut);
      g.putImageData(img, 0, 0);
      src = gradeBuf.c;
    }
    // Opaque and full-screen, so it stands in for clearing the display.
    d.drawImage(src, 0, 0, DW, DH);
  } else {
    d.fillStyle = '#000';
    d.fillRect(0, 0, DW, DH);
  }
  d.restore();
  flushMs += performance.now() - t0;
}

/** Make L the layer painting on shared surface T, starting from base state. */
function switchTo(T, L) {
  if (T.cur === L) return;
  T.cur = L;
  base(T.ctx, T.res);
  arm(T.ctx);
}

/**
 * Can L paint straight into T right now? Its draws have to land above
 * everything already there, and (on the display) the world has to be done.
 */
function canDirect(T, L) {
  if (T.cursor > L.z) return false;
  return T === WORLD ? !WORLD.final : true;
}

/** A layer broke the plan this frame: keep it on its own canvas for a while. */
function broke(L) { L.sticky = frame + STICKY; }

/**
 * Plan the next frame from this one's order of requests. Walking each target's
 * layers bottom to top, a plain layer may paint straight through when all of
 * its requests come after every request of every layer below it on the same
 * target — then whatever is below is finished (or flushed) before it starts,
 * and nothing below arrives after it. The display also has to wait for the
 * whole world. A layer that broke the plan counts as asked for at any time,
 * so nothing above it on its target passes through while it is sticky.
 */
function plan() {
  let worldLast = -1;
  for (const L of ordered) {
    L.plan = 'buffer';
    if (targetOf(L) === WORLD && (L.frame === frame || L.sticky > frame)) {
      worldLast = Math.max(worldLast, L.sticky > frame ? Infinity : Math.max(L.sLast, L.hLast));
    }
  }
  for (const T of [WORLD, DISP]) {
    let below = T === DISP ? worldLast : -1;
    for (const L of ordered) {
      if (targetOf(L) !== T) {
        // A res-1 interface layer composites onto the display, blown up.
        if (T === DISP && L.res === 1 && L.group !== 'world' && L.frame === frame) below = Math.max(below, L.sLast, L.hLast);
        continue;
      }
      const sticky = L.sticky > frame;
      if (L.frame !== frame && !sticky) continue;
      const self = L.sFirst > 0;
      const first = sticky ? -Infinity : self ? L.sFirst : L.hFirst;
      const last = sticky ? Infinity : self ? Math.max(L.sLast, L.hLast) : L.hLast;
      if (!sticky && plain(L) && first > below) L.plan = self ? 'self' : 'handed';
      below = Math.max(below, last);
    }
  }
}

function request(id, handed) {
  let L = flatMode ? null : layers.get(id);
  if (flatMode) return flatCtx();
  if (!L) L = define(id, { res: 1, z: 60 + Math.min(9.9, (autoZ += 0.1)), group: 'world' });
  seq++;
  if (L.frame !== frame) {
    L.frame = frame; L.mode = null; L.ms = 0;
    L.sFirst = L.sLast = L.hFirst = L.hLast = 0;
  }
  if (handed) { if (!L.hFirst) L.hFirst = seq; L.hLast = seq; }
  else { if (!L.sFirst) L.sFirst = seq; L.sLast = seq; }

  const T = targetOf(L);
  let g;
  if (L.mode === 'direct') {
    if (canDirect(T, L)) { switchTo(T, L); g = T.ctx; }
    else {
      // Something above it has started painting since: from here on, a canvas of its own.
      broke(L);
      L.mode = 'late';
    }
  } else if (L.mode === null && T && passThrough && !solo && dctx && wctx && plain(L)
    && (L.plan === 'handed' || (L.plan === 'self' && !handed)) && canDirect(T, L)) {
    // Everything below it on this surface is finished: composite what is
    // buffered there, then paint straight on top.
    if (T === DISP) finishWorld();
    else openWorld();
    flushBelow(T, L.z);
    // The engine handed this layer's canvas to a hook before the pass fetched
    // it: whatever the hook drew there goes down first.
    if (pending(L)) { const s = T.ctx; s.save(); s.setTransform(1, 0, 0, 1, 0, 0); blit(s, L, T === DISP); s.restore(); }
    L.mode = 'direct';
    T.cursor = L.z;
    switchTo(T, L);
    g = T.ctx;
  }
  if (!g && L.mode === null && L.plan === 'self' && handed) {
    // Handed to a hook, but last frame the scene fetched this layer itself for
    // the pass that really draws there: lend the layer's own canvas and leave
    // the layer free to pass through when that fetch comes.
    if (L.own !== frame) prepare(L);
    g = L.ctx;
  }
  if (!g) {
    if (L.mode === null) {
      L.mode = 'buffer';
      // Arriving after something above it already went up means it composites late.
      if (T && T.cursor > L.z) broke(L);
    }
    if (L.own !== frame) prepare(L);
    else if (L.flushed) {
      // Composited already, and now drawn to again: the rest goes up late.
      broke(L);
      prepare(L);
    }
    g = L.ctx;
  }
  if (curLayer !== L) mark(L);
  if (inHook && !hookCtx.has(g)) { hookCtx.set(g, g === L.ctx ? L.res : T.res); g.save(); }
  return g;
}

function flatCtx() {
  const L = FLAT;
  if (!L.ctx) {
    if (!canMake) { L.ctx = NULL_CTX; L.frame = frame; return L.ctx; }
    const { c, g } = makeCanvas(W, H, { alpha: false });
    L.canvas = c; L.ctx = g;
    byCtx.set(g, L);
  }
  if (L.frame !== frame) {
    const g = L.ctx;
    for (let i = 0; i < MAX_DEPTH; i++) g.restore();
    base(g, 1);
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, H);
    L.frame = frame;
  }
  if (inHook && !hookCtx.has(L.ctx)) { hookCtx.set(L.ctx, 1); L.ctx.save(); }
  return L.ctx;
}

export const Stage = {
  W, H, FINE,
  /** Display backing-store size. */
  DW, DH,

  /** Bind the display canvas. Its backing store becomes 800x480. */
  attach(canvas) {
    display = canvas || null;
    if (!display) { dctx = null; DISP.ctx = null; return; }
    display.width = DW; display.height = DH;
    dctx = display.getContext('2d', { alpha: false });
    dctx.imageSmoothingEnabled = false;
    DISP.ctx = dctx;
    byCtx.set(dctx, DISP);
    if (!dctx.__ink) watchInk(dctx, DISP);
    if (canMake && !worldBuf) {
      const b = makeCanvas(W, H, { alpha: false });
      worldBuf = b.c; wctx = b.g;
      WORLD.ctx = wctx;
      byCtx.set(wctx, WORLD);
      watchInk(wctx, WORLD);
    }
  },

  get display() { return display; },
  get displayCtx() { return dctx; },
  get frame() { return frame; },
  /** ms the compositing took last frame (every flush, the blow-up and the final pass), and the whole frame. */
  get compositeMs() { return compositeMs; },
  get frameMs() { return frameMs; },
  /** How many layers painted straight through / on a canvas of their own last frame. */
  get directCount() { return lastDirect; },
  get bufferedCount() { return lastBuffered; },
  /** The id being shown alone by the inspector, or null. */
  get solo() { return solo; },
  set solo(id) { solo = id && layers.has(id) ? id : null; },
  /** Single-canvas mode (see FLAT above). */
  get flat() { return flatMode; },
  set flat(on) { flatMode = !!on; },
  /** Let plain layers share their target's canvas (see PASS-THROUGH above). */
  get passThrough() { return passThrough; },
  set passThrough(on) { passThrough = !!on; },

  /** Start a frame: every layer counts as undrawn until someone asks for it. */
  begin() {
    frame++;
    seq = 0;
    curLayer = null;
    flushMs = 0;
    frameT0 = performance.now();
    WORLD.cur = null; WORLD.cursor = -Infinity; WORLD.open = false; WORLD.final = false;
    DISP.cur = null; DISP.cursor = -Infinity;
    scanDone = false;
  },

  /**
   * The context for layer `id` this frame, drawing in LOGICAL px (res-2 layers
   * carry a 2x base transform). Unknown ids become res-1 world layers stacked
   * just above 'fx'. Fetch it right before the pass that uses it (see the
   * header): a plain layer may be sharing a canvas with its neighbours.
   */
  ctx(id) { return request(id, false); },

  /**
   * The context the engine hands a hook for its default layer. The same as
   * ctx(id), except that a scene which fetches its own layers and never draws
   * on the one it was handed does not, by being handed it, pin that layer in
   * front of the passes it actually draws.
   */
  handed(id) { return request(id, true); },

  /**
   * Run fn(ctx) on the FINE grid (1 unit = half a logical px) when ctx belongs to
   * a res-2 layer; on a res-1 layer it is a plain call, because there is no finer
   * grid to draw on and nothing may ever be drawn blurry.
   */
  fine(ctx, fn) {
    const L = byCtx.get(ctx);
    if (!L || L.res !== FINE) return fn(ctx);
    ctx.save();
    ctx.scale(1 / FINE, 1 / FINE);
    try { return fn(ctx); } finally { ctx.restore(); }
  },

  /** 1 or 2: the pixel density of whatever layer `ctx` belongs to (1 if none). */
  resOf(ctx) {
    const L = ctx && byCtx.get(ctx);
    return L ? L.res : 1;
  },

  get(id) { return layers.get(id) || null; },

  set(id, patch) {
    if (!layers.has(id) || !patch) return null;
    return define(id, patch);
  },

  define(id, opts) { return define(id, opts || {}); },

  /** Every layer, bottom to top, as plain records (safe to keep). */
  list() {
    return ordered.map((L) => ({
      id: L.id, res: L.res, z: L.z, group: L.group, blend: L.blend, alpha: L.alpha,
      visible: L.visible, offsetX: L.offsetX, offsetY: L.offsetY, filter: L.filter,
      drawn: L.frame === frame && (L.inkF === frame || (L.own === frame && L.inked)), ms: L.ms,
      mode: L.frame === frame ? L.mode : null,
    }));
  },

  /** PNG data URL of the last composite. */
  snapshot() {
    return display ? display.toDataURL('image/png') : null;
  },

  /** Read the display settings that belong to the compositor. */
  applySettings(s) {
    const st = s || {};
    filterLut = lutFor(st.pixelFilter);
    pixelFilter = filterLut ? st.pixelFilter : 'none';
    scanlines = !!st.scanlines;
  },

  get pixelFilter() { return pixelFilter; },
  get scanlines() { return scanlines; },

  // --- engine hooks -------------------------------------------------------

  hookBegin() {
    hookCtx.clear();
    inHook = true;
  },

  /** Close a hook. `threw` drains every context the hook touched. */
  hookEnd(threw) {
    for (const [g, res] of hookCtx) {
      if (threw) drainCtx(g, res);
      else g.restore();
    }
    hookCtx.clear();
    inHook = false;
    mark(null);
  },

  /** Drain every context (after a frame-level failure). */
  drainAll() {
    for (const L of layers.values()) if (L.ctx) drainCtx(L.ctx, L.res);
    if (wctx) drainCtx(wctx, 1);
    if (dctx) drainCtx(dctx, FINE);
    if (FLAT.ctx) drainCtx(FLAT.ctx, 1);
    hookCtx.clear();
    inHook = false;
  },

  /** Finish the frame: composite whatever is still waiting onto the display. */
  composite() {
    const d = dctx;
    if (!d) return;
    const t0 = performance.now();
    mark(null);
    if (flatMode) {
      d.setTransform(1, 0, 0, 1, 0, 0);
      d.globalAlpha = 1; d.globalCompositeOperation = 'source-over'; d.filter = 'none';
      d.imageSmoothingEnabled = false;
      if (FLAT.canvas && FLAT.frame === frame) d.drawImage(FLAT.canvas, 0, 0, DW, DH);
      const t1 = performance.now();
      compositeMs = t1 - t0; frameMs = t1 - frameT0;
      return;
    }
    // Flushes that already ran mid-frame count towards the composite too.
    const before = flushMs;
    finishWorld();
    flushBelow(DISP, Infinity);
    base(d, FINE);
    lastDirect = 0; lastBuffered = 0;
    for (const L of ordered) {
      if (L.frame !== frame) continue;
      if (L.mode === 'direct') lastDirect++;
      else if (L.own === frame && L.inked) lastBuffered++;
    }
    plan();
    const t1 = performance.now();
    compositeMs = (t1 - t0) + before;
    frameMs = t1 - frameT0;
  },
};

export default Stage;
