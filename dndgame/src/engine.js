// engine.js — the game loop, the scene stack, and screen transitions.
//
// Scenes are plain objects (or class instances) with optional hooks:
//   enter(prev)  exit(next)  update(dt)  draw(ctx)  drawOver(ctx)
//   opaque:bool (default true)  pausesBelow:bool (default true)
//   uiLayer:bool (default false) — an interface screen rather than a piece of the
//     world. FX weather/grading stops at the first uiLayer scene, so a blizzard
//     never blows through the inventory.
//   drawUI(ctx) — a world scene's own interface, painted after the weather.
// The stack lets menus, dialogue and battles layer over the overworld without
// any of them knowing about each other.
//
// Every hook paints into a layer of render/stage.js rather than straight onto
// the screen: a world scene's draw() is handed the 'deco' layer (a scene that
// knows about layers fetches its own with Stage.ctx), drawUI() gets 'hud', a UI
// scene's draw() gets 'menu', drawOver() gets 'overlay'. The stage composites
// them onto the 800x480 display at the end of the frame.

import { VIEW_W, VIEW_H, MAX_DT, clamp } from './constants.js';
import { Input } from './core/input.js';
import { FX } from './render/fx.js';
// ui/kit.js pulls in render/sprites.js, core/rng.js and constants.js only, so
// this does not close a cycle back onto the engine.
import { UI } from './ui/kit.js';
import { drawJourney } from './render/journey.js';
import { Save, EV_SETTINGS } from './core/save.js';
import { bus } from './core/events.js';
import { Stage } from './render/stage.js';
import { Layout } from './ui/layout.js';
import { Inspector } from './ui/inspector.js';

export const Game = {
  canvas: null,
  ctx: null,
  scale: 1,
  offX: 0,
  offY: 0,
  scenes: [],
  time: 0,
  dt: 0,
  frame: 0,
  fps: 60,
  paused: false,
  flags: {},
  state: null,          // the GameState (see state.js)
  debug: false,
  _raf: 0,
  _last: 0,
  _fpsAcc: 0,
  _fpsFrames: 0,

  get top() { return this.scenes[this.scenes.length - 1] || null; },

  /** Mount the canvas, size it, and start the loop on `rootScene`. */
  start(rootScene, canvas) {
    this.canvas = canvas || document.getElementById('game');
    // The stage owns the display canvas: an 800x480 backing store, the world
    // blown up 2x from 400x240 and the interface drawn on the finer grid.
    Stage.attach(this.canvas);
    this.ctx = Stage.displayCtx;
    Stage.applySettings(Save.settings);

    Input.attach(this.canvas);
    window.addEventListener('resize', () => this.resize());
    // Window Scale, the pixel filter and scanlines live in Settings > Display;
    // re-fit and re-grade the moment they change, whichever path saved them.
    const refit = () => { this.resize(); Stage.applySettings(Save.settings); };
    bus.on('settings:changed', refit);
    bus.on(EV_SETTINGS, refit);
    this.resize();

    if (rootScene) this.push(rootScene);
    this._last = performance.now();
    this._raf = requestAnimationFrame((t) => this._tick(t));
  },

  /**
   * Fit the game into the window. `scale` is CSS px per LOGICAL px (2 shows the
   * 400x240 world at 800x480), whatever the backing store is.
   *
   * The scale is the largest whole number of DEVICE pixels per game pixel that
   * fits, so every world pixel is the same size on screen: a 125% Windows
   * laptop gets 4 device px (3.2 CSS) rather than 3 CSS px smeared over 3.75.
   * On a small window where whole pixels would leave the game at its native
   * size or less, a fractional fill of 1.25x or more beats a postage stamp.
   */
  resize() {
    const cw = window.innerWidth, chh = window.innerHeight;
    const dpr = window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
    const fit = Math.min(cw / VIEW_W, chh / VIEW_H);
    let s = Math.floor(fit * dpr + 1e-6) / dpr;
    if (s < 1) s = Math.min(1, fit);
    if (s <= 1 && fit >= 1.25) s = fit;
    if (!(s > 0)) s = 1;
    // Settings > Display > Window Scale. 'auto' fills the window, which on a
    // 1080p monitor means 4x -- a 5px font printed 20px tall and menus to
    // match. Pinning it to 2 or 3 keeps the UI the size it was designed at and
    // letterboxes the rest. The option has always been in the list; nothing
    // read it, so every window silently ran at maximum.
    let pref = 'auto';
    try { pref = Save.settings.scale; } catch { pref = 'auto'; }
    const pinned = Number(pref);
    if (pref !== 'auto' && Number.isFinite(pinned) && pinned > 0) s = Math.min(pinned, s);
    this.scale = s;
    const w = Math.round(VIEW_W * s), h = Math.round(VIEW_H * s);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.offX = Math.floor((cw - w) / 2);
    this.offY = Math.floor((chh - h) / 2);
    // The pointer is reported in LOGICAL px (0..400, 0..240), never in
    // backing-store px, so every hit-test in the game keeps working.
    Input.setMouseTransform(s, this.offX, this.offY, VIEW_W, VIEW_H);
  },

  // --- scene stack --------------------------------------------------------

  push(scene) {
    const prev = this.top;
    if (prev && prev.exit) prev.exit(scene);
    this.scenes.push(scene);
    if (scene.enter) scene.enter(prev);
    Input.flush();
    return scene;
  },

  pop(result) {
    const scene = this.scenes.pop();
    if (scene && scene.exit) scene.exit(this.top);
    const now = this.top;
    if (now && now.enter) now.enter(scene, result);
    if (scene && scene.onClose) scene.onClose(result);
    Input.flush();
    return scene;
  },

  /** Replace the whole stack (used for title -> game and game over). */
  replace(scene) {
    while (this.scenes.length) {
      const s = this.scenes.pop();
      if (s && s.exit) s.exit(scene);
    }
    return this.push(scene);
  },

  /** Pop until `pred(scene)` is true (that scene stays on top). */
  popTo(pred) {
    while (this.scenes.length > 1 && !pred(this.top)) this.pop();
  },

  has(sceneClassOrName) {
    return this.scenes.some((s) => s === sceneClassOrName
      || s.constructor?.name === sceneClassOrName
      || s.id === sceneClassOrName);
  },

  // --- transitions --------------------------------------------------------

  /**
   * Run a screen transition. `fn` fires at the midpoint (fully obscured), which
   * is where you swap maps or push the battle scene.
   *   kind: 'fade' | 'wipe' | 'battle' | 'circle' | 'diamond'
   */
  transition(kind = 'fade', fn = null, { dur = 0.45, color = '#000', journey = null } = {}) {
    if (this._trans) { // already transitioning: run immediately
      if (fn) fn();
      return;
    }
    this._trans = { kind, fn, t: 0, dur, color, journey, fired: false };
  },

  get transitioning() { return !!this._trans; },

  // --- loop ---------------------------------------------------------------

  _tick(now) {
    this._raf = requestAnimationFrame((t) => this._tick(t));
    const elapsed = Math.max(0, (now - this._last) / 1000);
    let dt = elapsed;
    this._last = now;
    if (dt > MAX_DT) dt = MAX_DT;  // a stall must not teleport the player
    if (dt < 0) dt = 0;
    this.dt = dt;
    this.time += dt;
    this.frame++;

    this._fpsAcc += elapsed; this._fpsFrames++;
    if (this._fpsAcc >= 0.5) { this.fps = Math.round(this._fpsFrames / this._fpsAcc); this._fpsAcc = 0; this._fpsFrames = 0; }

    this._update(dt, elapsed);
    this._draw();
    Input.update(dt);
  },

  _update(dt, elapsed = dt) {
    // Transition advances even while scenes are frozen.
    if (this._trans) {
      const tr = this._trans;
      const journey = tr.kind === 'journey' && tr.journey;
      // Movement stays capped after a stall; a chapter card must not require
      // 27 rendered frames to finish when the browser is only delivering 1fps.
      tr.t += journey ? elapsed : dt;
      const half = tr.dur / 2;
      if (!tr.fired && tr.t >= half) {
        // Always present an opaque card before doing synchronous map work,
        // then keep the arrival's first world render covered too.
        if (journey) tr.t = half;
        if (!journey || tr.coverPainted) { tr.fired = true; if (tr.fn) tr.fn(); }
      }
      if (tr.t >= tr.dur) this._trans = null;
    }

    FX.update(dt);

    // Developer and layout keys, outside the action map so no rebinding can
    // lose them: F10 the layer inspector, F8 Arrange mode for the world HUD.
    if (Input.tapped('F10')) Inspector.toggle();
    const f8 = Input.tapped('F8');
    if (f8) Layout.toggleArrange(this.worldScene());
    if (Inspector.open) Inspector.update(dt);
    // Arranging the HUD freezes the world under it: the scenes keep drawing but
    // nothing moves, and no click meant for a widget lands on the map. The F8
    // that opened it is not also read as the F8 that closes it.
    if (Layout.editing) { if (!f8) Layout.updateArrange(dt); return; }

    // Update the top scene, plus any scene beneath it that opted out of pausing.
    // Snapshot the stack first: a scene's update() may push or pop (a menu
    // opening, a dialogue closing), and indexing a live array mid-walk would
    // read past the end.
    const stack = this.scenes.slice();
    for (let i = stack.length - 1; i >= 0; i--) {
      const s = stack[i];
      const above = stack[i + 1];
      if (!s) continue;
      if (!above) { if (s.update) s.update(dt); }
      else if (s.update && above.pausesBelow === false) s.update(dt);
      // Stop descending once we hit a scene that pauses everything below it.
      if (above && above.pausesBelow !== false) break;
    }
  },

  /** Say a draw failed — once per site, not sixty times a second. */
  _reportDrawFail(key, err) {
    if (!this._drawFails) this._drawFails = new Set();
    if (this._drawFails.has(key)) return;
    this._drawFails.add(key);
    console.error(`[engine] ${key} threw while drawing; the frame recovered.`, err);
  },

  /**
   * Open Arrange mode on the world HUD from anywhere (Settings > Display >
   * Arrange HUD): the menus stacked over the world close first, so the widgets
   * being moved are the ones on screen. False when no world scene is running.
   */
  arrangeHud() {
    if (!this.scenes.some((s) => s && !s.uiLayer)) return false;
    while (this.top && this.top.uiLayer) this.pop();
    return Layout.beginArrange(this.top);
  },

  /** The world scene whose HUD is on screen (overworld or battle), or null. */
  worldScene() {
    const stack = this.scenes;
    for (let i = stack.length - 1; i >= 0; i--) {
      const s = stack[i];
      if (s && !s.uiLayer) return s;
      if (s && s.opaque !== false) return null;       // covered by a full-screen menu
    }
    return null;
  },

  /**
   * Paint one hook into one layer.
   *
   * A throw inside a draw method used to abort the rest of the frame with the
   * scene's ctx.save() and UI.pushClip() still standing. Every later frame then
   * nested inside the leaked clip — the game shrank into a 400x186 band that no
   * scene change, map change or direct drawUI call could clear, only a reload.
   *
   * So the stage saves every layer the hook touches the first time it is
   * fetched and restores it afterwards, whatever the hook does; if the hook
   * threw, exactly those layers are drained back to clean, so the scenes after
   * this one, the HUD and the toasts still paint on the very frame that failed.
   */
  _paintFn(label, layer, fn) {
    Stage.hookBegin();
    let threw = false;
    try {
      fn(Stage.handed(layer));
    } catch (e) {
      threw = true;
      this._reportDrawFail(label, e);
      UI.resetClips();
    } finally {
      Stage.hookEnd(threw);
    }
  },

  _paint(scene, hook, layer) {
    this._paintFn(`${scene.id || scene.constructor?.name || 'scene'}.${hook}`, layer, (ctx) => scene[hook](ctx));
  },

  _draw() {
    // Only pay for the drain when something outside a hook left a layer dirty
    // last frame. A clean frame does no extra work at all.
    if (this._ctxDirty) { Stage.drainAll(); UI.resetClips(); this._ctxDirty = false; }

    Stage.begin();
    try {
      this._drawFrame();
    } catch (e) {
      this._reportDrawFail('frame', e);
      this._ctxDirty = true;
    }
    try {
      Stage.composite();
    } catch (e) {
      this._reportDrawFail('composite', e);
    }
  },

  _drawFrame() {
    const tr = this._trans;
    const p = tr ? tr.t / tr.dur : 0;
    if (tr?.kind === 'journey' && tr.journey && p >= 0.16 && p <= 0.8 &&
        (!tr.fired || tr.destinationPainted) && !this.debug && !Inspector.open) {
      // The card is opaque. Draw the destination once underneath it to warm
      // its sprites/layers, then avoid repainting an invisible world.
      this._paintFn('transition', 'transition', (c) => this._drawTransition(c));
      return;
    }
    // Find the deepest scene we must draw: walk down while scenes are see-through.
    // Snapshot for the same reason update() does.
    const stack = this.scenes.slice();
    let start = stack.length - 1;
    while (start > 0 && stack[start] && stack[start].opaque === false) start--;

    // The atmosphere layer (rain, snow, day/night grading, vignette) belongs to the
    // world, so it is painted after the last world scene and BEFORE the first UI
    // scene. Without this the storm outside falls across the open inventory.
    // INVARIANT: a scene with opaque:false must also set uiLayer, or the world
    // beneath it will be graded after it draws rather than before. Every scene
    // that layers over the world today (dialogue) does both.
    let uiStart = stack.length;
    for (let i = start; i < stack.length; i++) {
      if (stack[i] && stack[i].uiLayer) { uiStart = i; break; }
    }

    for (let i = start; i < uiStart; i++) {
      const s = stack[i];
      if (s && s.draw) this._paint(s, 'draw', 'deco');
    }
    // Nothing of the world is visible under a full-screen menu — do not paint a
    // storm onto the black behind it. The atmosphere is three layers: the
    // weather itself, FX's colour grade (multiplied along with the scene's own),
    // and the vignette, which stays under the interface.
    // A layer nobody would draw into is not even fetched, so a clear sky costs
    // no clear and no composite.
    const on = (part) => !FX.active || FX.active(part);
    if (uiStart > start) {
      if (FX.drawWeather) {
        // A world scene that paints its own sky (the overworld, through
        // render/atmosphere.js) must not get FX's rain on top of its own.
        let ownSky = false;
        for (let i = start; i < uiStart; i++) if (stack[i] && stack[i].ownsWeather) ownSky = true;
        if (on('weather') && !ownSky) this._paintFn('FX.weather', 'weather', (c) => FX.drawWeather(c));
        if (on('tint')) this._paintFn('FX.tint', 'grade', (c) => FX.drawTint(c));
        if (on('vignette')) this._paintFn('FX.vignette', 'vignette', (c) => FX.drawVignette(c));
      } else {
        this._paintFn('FX.ambient', 'weather', (c) => FX.drawAmbient(c));
      }
    }
    // A world scene's own interface (the overworld HUD, the battle ribbon) goes up
    // after the weather for the same reason the menus do.
    for (let i = start; i < uiStart; i++) {
      const s = stack[i];
      if (s && s.drawUI) this._paint(s, 'drawUI', 'hud');
    }
    for (let i = uiStart; i < stack.length; i++) {
      const s = stack[i];
      if (s && s.draw) this._paint(s, 'draw', 'menu');
    }

    // Overlays that draw even when covered (HUD toasts).
    const top = stack[stack.length - 1];
    for (const s of stack) {
      if (s && s.drawOver && s !== top) this._paint(s, 'drawOver', 'overlay');
    }
    if (Layout.editing) this._paintFn('Layout.arrange', 'overlay', (c) => Layout.drawArrange(c));

    if (on('screen')) this._paintFn('FX.screen', 'screen-fx', (c) => FX.drawScreen(c));
    if (this._trans) {
      if (this._trans.fired) this._trans.destinationPainted = true;
      this._paintFn('transition', 'transition', (c) => this._drawTransition(c));
    }
    if (this.debug) this._paintFn('debug', 'debug', (c) => this._drawDebug(c));
    if (Inspector.open) this._paintFn('Inspector', 'debug', (c) => Inspector.draw(c));
  },

  _drawTransition(ctx) {
    const tr = this._trans;
    const p = clamp(tr.t / tr.dur, 0, 1);
    // 0 -> 1 -> 0 cover curve
    const cover = p < 0.5 ? p * 2 : (1 - p) * 2;
    ctx.save();
    if (tr.kind === 'journey' && tr.journey) {
      drawJourney(ctx, tr.journey, p);
      if (p >= 0.16 && p <= 0.8) tr.coverPainted = true;
    } else if (tr.kind === 'fade') {
      ctx.globalAlpha = cover;
      ctx.fillStyle = tr.color;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    } else if (tr.kind === 'wipe') {
      ctx.fillStyle = tr.color;
      const w = Math.ceil(VIEW_W * cover);
      ctx.fillRect(p < 0.5 ? 0 : VIEW_W - w, 0, w, VIEW_H);
    } else if (tr.kind === 'circle') {
      ctx.fillStyle = tr.color;
      const r = (1 - cover) * Math.hypot(VIEW_W, VIEW_H) / 2;
      ctx.beginPath();
      ctx.rect(0, 0, VIEW_W, VIEW_H);
      ctx.arc(VIEW_W / 2, VIEW_H / 2, Math.max(0, r), 0, Math.PI * 2, true);
      ctx.fill('evenodd');
    } else if (tr.kind === 'diamond') {
      // Classic JRPG diamond-grid dissolve.
      ctx.fillStyle = tr.color;
      const cell = 16, half = cell / 2;
      const size = cover * cell;
      for (let y = 0; y < VIEW_H + cell; y += cell) {
        for (let x = 0; x < VIEW_W + cell; x += cell) {
          const cx = x + half, cy = y + half;
          ctx.beginPath();
          ctx.moveTo(cx, cy - size); ctx.lineTo(cx + size, cy);
          ctx.lineTo(cx, cy + size); ctx.lineTo(cx - size, cy);
          ctx.fill();
        }
      }
    } else if (tr.kind === 'battle') {
      // Flash then horizontal shutters slamming shut.
      if (p < 0.18) {
        ctx.globalAlpha = 1 - p / 0.18;
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, VIEW_W, VIEW_H);
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = tr.color;
      const bars = 10, bh = VIEW_H / bars;
      for (let i = 0; i < bars; i++) {
        const w = Math.ceil(VIEW_W * clamp(cover * 1.35 - (i % 2) * 0.2, 0, 1));
        ctx.fillRect(i % 2 ? VIEW_W - w : 0, Math.floor(i * bh), w, Math.ceil(bh));
      }
    }
    ctx.restore();
  },

  _drawDebug(ctx) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, 92, 26);
    ctx.fillStyle = '#7fff7f';
    ctx.font = '8px monospace';
    ctx.fillText(`fps ${this.fps}  s${this.scenes.length}`, 3, 10);
    ctx.fillText(`${this.top?.constructor?.name || this.top?.id || '-'}`.slice(0, 16), 3, 20);
    ctx.restore();
  },
};

/** A minimal scene that just runs a callback once, then pops. Useful for glue. */
export function actionScene(fn) {
  return { opaque: false, enter() { fn(); Game.pop(); } };
}
