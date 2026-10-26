// src/core/input.js — unified keyboard / gamepad / mouse / touch input for Sword Coast Chronicles.
//
// Design notes
// ------------
// * ONE source of truth: every physical device folds into a small set of named
//   *actions* ('up', 'confirm', 'run', …). Scenes never look at key codes.
// * Edge detection is computed once per frame inside `Input.update(dt)`, which the
//   engine calls AFTER the active scene has updated. That means the `pressed` set a
//   scene observes during frame N was built at the end of frame N-1 and stays stable
//   for the whole frame — no ordering hazards between stacked scenes.
// * `consume(action)` lets a modal scene swallow an edge so the scene underneath
//   (which may also be running `update`, e.g. a HUD) does not react to the same press.
// * Zero imports. This module must be safe to load before anything else exists.

/** Every action the game understands. Scenes should only ever reference these. */
export const ACTIONS = Object.freeze([
  'up', 'down', 'left', 'right',
  'confirm', 'cancel', 'menu', 'run', 'interact',
  'map', 'journal', 'party', 'inventory', 'spells',
  'next', 'prev',
  'tab1', 'tab2', 'tab3', 'tab4', 'tab5',
  'debug',
]);

/**
 * Default keyboard bindings: action -> array of KeyboardEvent.code.
 * `code` (not `key`) so bindings survive layout changes — KeyW is the same physical
 * key on AZERTY even though it types 'z'.
 *
 * NOTE: 'Escape' is deliberately bound to BOTH cancel and menu. A scene that wants
 * Escape to mean "close me" should call `Input.consume('cancel')`, which also blanks
 * the shared edge for that frame so the overworld below does not also open the menu.
 */
const DEFAULTS = {
  up:        ['ArrowUp', 'KeyW'],
  down:      ['ArrowDown', 'KeyS'],
  left:      ['ArrowLeft', 'KeyA'],
  right:     ['ArrowRight', 'KeyD'],
  confirm:   ['KeyZ', 'Enter', 'NumpadEnter', 'Space'],
  cancel:    ['KeyX', 'Escape', 'Backspace'],
  menu:      ['Escape', 'KeyP'],
  run:       ['ShiftLeft', 'ShiftRight'],
  interact:  ['KeyE'],
  map:       ['KeyM'],
  journal:   ['KeyJ'],
  party:     ['Tab'],
  inventory: ['KeyI'],
  spells:    ['KeyK'],
  next:      ['KeyR'],
  prev:      ['KeyQ'],
  tab1:      ['Digit1', 'Numpad1'],
  tab2:      ['Digit2', 'Numpad2'],
  tab3:      ['Digit3', 'Numpad3'],
  tab4:      ['Digit4', 'Numpad4'],
  tab5:      ['Digit5', 'Numpad5'],
  debug:     ['Backquote'],
};

/**
 * Gamepad bindings: action -> array of button indices in the W3C "standard mapping".
 * 0=A 1=B 2=X 3=Y | 4=LB 5=RB 6=LT 7=RT | 8=Back 9=Start | 10=L3 11=R3 | 12-15=DPad
 */
const PAD_DEFAULTS = {
  confirm:   [0],
  cancel:    [1],
  interact:  [2],
  party:     [3],
  prev:      [4],
  next:      [5],
  run:       [6, 7, 10],   // either trigger or L3 = run (held)
  map:       [8],          // Back / Select
  menu:      [9],          // Start
  inventory: [11],         // R3
  up:        [12],
  down:      [13],
  left:      [14],
  right:     [15],
};

/** Keys we swallow so the browser does not scroll the page or move DOM focus. */
const PREVENT = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Space', 'Tab', 'Backspace', "Quote", 'Slash',
  // F10 would otherwise focus the browser's menu bar; F8 and F10 are ours.
  'F8', 'F10',
]);

const DEADZONE = 0.35;      // analog stick deadzone (spec §2)
const TOUCH_DEAD = 6;       // px of finger travel before the virtual dpad engages
const TOUCH_RADIUS = 30;    // px of travel that equals full deflection
const TAP_SLOP = 12;        // px — a touch that moves less than this is a tap
const TAP_TIME = 500;       // ms — …and lifts within this long

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const clone = (o) => { const r = {}; for (const k in o) r[k] = o[k].slice(); return r; };

/** True when the event is aimed at a real DOM text field — never steal those keys. */
function isTextTarget(t) {
  if (!t || !t.tagName) return false;
  const n = t.tagName;
  return n === 'INPUT' || n === 'TEXTAREA' || n === 'SELECT' || t.isContentEditable === true;
}

/** Rescale an analog axis so the value just outside the deadzone starts at 0, not 0.35. */
function axisCurve(v) {
  const a = Math.abs(v);
  if (a < DEADZONE) return 0;
  const s = (a - DEADZONE) / (1 - DEADZONE);
  return v < 0 ? -s : s;
}

export const Input = {
  // ---- public, rebindable -------------------------------------------------
  /** action -> [KeyboardEvent.code]. Mutate freely; changes take effect next frame. */
  bindings: clone(DEFAULTS),
  /** action -> [gamepad button index]. */
  padBindings: clone(PAD_DEFAULTS),
  /** Pristine copy for the options screen's "restore defaults". */
  DEFAULT_BINDINGS: Object.freeze(clone(DEFAULTS)),
  ACTIONS,

  // ---- public, read-only per frame ---------------------------------------
  /** Pointer state in LOGICAL canvas pixels (0..VIEW_W, 0..VIEW_H). */
  mouse: { x: 0, y: 0, dx: 0, dy: 0, down: false, clicked: false, rightClicked: false, wheel: 0, wheelRaw: 0, moved: false, over: false },
  /** Live virtual-dpad state, in logical px, for the HUD to draw a thumbstick. */
  touch: { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0, vx: 0, vy: 0 },
  /** Raw analog sticks, deadzoned and curved. Right stick is free for camera work. */
  padAxes: { lx: 0, ly: 0, rx: 0, ry: 0 },
  /** Which device produced the most recent input — drives on-screen button prompts. */
  lastDevice: 'key',        // 'key' | 'pad' | 'mouse' | 'touch'
  hasGamepad: false,
  /** Set while a rebinding UI is listening; see beginRebind(). */
  rebinding: null,
  /** Non-null while capturing typed text (name entry); see startText(). */
  textCapture: null,
  /** If true, a tap on the non-dpad half of the screen also fires `confirm`. */
  touchConfirmOnTap: true,
  /** Which screen half owns the virtual dpad. */
  touchDpadSide: 'left',
  enabled: true,

  // ---- private ------------------------------------------------------------
  _canvas: null,
  _handlers: null,
  _scale: 1, _ox: 0, _oy: 0,
  _codes: new Set(),        // physical key codes currently down
  _tapped: new Set(),       // codes that saw a keydown since the last update()
  _held: new Set(),         // actions held this frame (all devices merged)
  _heldPrev: new Set(),
  _keyHeld: new Set(),      // keyboard-only, used for digital dir()
  _padDigital: new Set(),   // gamepad dpad/buttons, digital
  _padStick: new Set(),     // gamepad left stick pushed past the deadzone
  _touchHeld: new Set(),    // virtual dpad past the deadzone
  _pressed: new Set(),
  _released: new Set(),
  _hold: {},                // action -> seconds held
  _holdPrev: {},            // action -> seconds held at the previous frame
  _dir: { x: 0, y: 0 },
  _anyTap: false,
  _pad: null,               // last polled Gamepad, kept for rumble()

  // =========================================================================
  // FRAME
  // =========================================================================

  /**
   * Rebuild edges, poll gamepads, clear one-frame flags.
   * Call ONCE per frame, after the scene stack has updated.
   * @param {number} dt seconds since last frame (clamped; defaults to one 60fps tick)
   */
  update(dt = 1 / 60) {
    dt = clamp(Number(dt) || 0, 0, 0.25);

    // One-frame pointer flags are cleared here, i.e. at end-of-frame, so anything
    // the browser dispatched during the frame was visible to every scene first.
    const m = this.mouse;
    m.clicked = false; m.rightClicked = false; m.wheel = 0; m.wheelRaw = 0;
    m.moved = false; m.dx = 0; m.dy = 0;

    this._pollGamepads();

    // --- merge every device into one held-action set -----------------------
    const held = this._held, prev = this._heldPrev;
    prev.clear();
    for (const a of held) prev.add(a);
    held.clear();
    this._keyHeld.clear();

    const typing = this.textCapture !== null || this.rebinding !== null || !this.enabled;
    for (const action of ACTIONS) {
      let on = false;
      if (!typing) {
        const codes = this.bindings[action];
        if (codes) {
          for (let i = 0; i < codes.length; i++) {
            if (this._codes.has(codes[i])) { on = true; break; }
          }
        }
        if (on) this._keyHeld.add(action);
      }
      if (!on && (this._padDigital.has(action) || this._padStick.has(action) || this._touchHeld.has(action))) on = true;
      if (on) held.add(action);
    }

    // --- edges -------------------------------------------------------------
    this._pressed.clear();
    this._released.clear();
    for (const a of held) if (!prev.has(a)) this._pressed.add(a);
    for (const a of prev) if (!held.has(a)) this._released.add(a);

    // A key tapped and released inside a single frame still counts as a press,
    // so 60fps input never eats a fast player's button mash.
    this._anyTap = this._tapped.size > 0;
    if (this._tapped.size && !typing) {
      for (const action of ACTIONS) {
        const codes = this.bindings[action];
        if (!codes) continue;
        for (let i = 0; i < codes.length; i++) {
          if (this._tapped.has(codes[i])) { this._pressed.add(action); break; }
        }
      }
    }
    this._tapped.clear();

    // --- hold timers (drive repeat()) --------------------------------------
    for (const a of ACTIONS) {
      if (held.has(a)) {
        const was = prev.has(a) ? (this._hold[a] || 0) : 0;
        this._holdPrev[a] = was;
        this._hold[a] = was + dt;
      } else {
        this._hold[a] = 0;
        this._holdPrev[a] = 0;
      }
    }

    this._computeDir();
  },

  /** Digital keys win; analog (touch stick, then left stick) fills any idle axis. */
  _computeDir() {
    const dig = (a) => (this._keyHeld.has(a) || this._padDigital.has(a)) ? 1 : 0;
    let x = dig('right') - dig('left');
    let y = dig('down') - dig('up');
    if (x === 0 || y === 0) {
      const ax = this.touch.active ? this.touch.vx : this.padAxes.lx;
      const ay = this.touch.active ? this.touch.vy : this.padAxes.ly;
      if (x === 0) x = ax;
      if (y === 0) y = ay;
    }
    this._dir.x = clamp(x, -1, 1);
    this._dir.y = clamp(y, -1, 1);
  },

  // =========================================================================
  // QUERIES
  // =========================================================================

  /** Held right now (this frame). */
  down(action) { return this._held.has(action); },

  /** True only on the frame the action went from released to held. */
  pressed(action) { return this._pressed.has(action); },

  /** True only on the frame the action was let go. */
  released(action) { return this._released.has(action); },

  /**
   * pressed(), but also swallows the edge so scenes stacked below this one do not
   * react to the same press. Also cancels this frame's auto-repeat tick.
   */
  consume(action) {
    const hit = this._pressed.delete(action);
    if (hit) this._holdPrev[action] = this._hold[action] || 0;
    return hit;
  },

  /** Swallow every edge — use right after pushing a scene mid-frame. */
  consumeAll() {
    for (const a of this._pressed) this._holdPrev[a] = this._hold[a] || 0;
    this._pressed.clear();
    this.mouse.clicked = false;
    this.mouse.rightClicked = false;
  },

  /**
   * Held-key auto-repeat for menu scrolling: fires on the press edge, pauses for
   * `delay`, then ticks every `rate` seconds. Parameterised per call site, so a
   * fast inventory list and a slow map pan can share the same held key.
   */
  repeat(action, delay = 0.30, rate = 0.09) {
    if (this._pressed.has(action)) return true;
    if (!this._held.has(action)) return false;
    const t = this._hold[action] || 0;
    const p = this._holdPrev[action] || 0;
    if (t < delay) return false;
    // Tick when the repeat index crosses an integer boundary between the two frames.
    const n = Math.floor((t - delay) / rate);
    const pn = p < delay ? -1 : Math.floor((p - delay) / rate);
    return n > pn;
  },

  /** repeat() that also swallows the tick. */
  repeatConsume(action, delay = 0.30, rate = 0.09) {
    if (!this.repeat(action, delay, rate)) return false;
    this._pressed.delete(action);
    this._holdPrev[action] = this._hold[action] || 0;
    return true;
  },

  /** Movement vector, each component -1..1. Analog-aware. */
  dir() { return { x: this._dir.x, y: this._dir.y }; },

  /** Movement snapped to a single cardinal step — what grid walking wants. */
  dirCardinal() {
    const d = this._dir;
    if (Math.abs(d.x) >= Math.abs(d.y)) {
      if (Math.abs(d.x) > 0.001) return { x: d.x > 0 ? 1 : -1, y: 0 };
      return { x: 0, y: 0 };
    }
    return { x: 0, y: d.y > 0 ? 1 : -1 };
  },

  /** 'down' | 'left' | 'right' | 'up' | null — matches constants.DIRS ordering. */
  dirName() {
    const d = this.dirCardinal();
    if (d.y > 0) return 'down';
    if (d.y < 0) return 'up';
    if (d.x < 0) return 'left';
    if (d.x > 0) return 'right';
    return null;
  },

  /** Anything at all this frame — for "press any key" title screens. */
  anyPressed() {
    return this._pressed.size > 0 || this._anyTap || this.mouse.clicked || this.mouse.rightClicked;
  },

  /** Debug helper: which actions fired this frame. */
  pressedActions() { return Array.from(this._pressed); },

  /**
   * A physical key (KeyboardEvent.code) went down since the last update(). Only
   * for the few keys that are deliberately NOT actions — F8 Arrange mode, F10
   * the layer inspector, the letters Arrange mode listens for — so no rebinding
   * can take them away. Scenes should keep using actions.
   */
  tapped(code) { return this._tapped.has(code); },

  /** A physical key is held right now (see tapped()). */
  keyHeld(code) { return this._codes.has(code); },

  /** Blank all state. Call on scene transitions, window blur, and after a modal. */
  flush() {
    this._codes.clear(); this._tapped.clear();
    this._held.clear(); this._heldPrev.clear(); this._keyHeld.clear();
    this._padDigital.clear(); this._padStick.clear(); this._touchHeld.clear();
    this._pressed.clear(); this._released.clear();
    for (const a of ACTIONS) { this._hold[a] = 0; this._holdPrev[a] = 0; }
    this._dir.x = 0; this._dir.y = 0;
    this._anyTap = false;
    this.padAxes.lx = this.padAxes.ly = this.padAxes.rx = this.padAxes.ry = 0;
    const m = this.mouse;
    m.down = false; m.clicked = false; m.rightClicked = false; m.wheel = 0; m.wheelRaw = 0; m.moved = false;
    const t = this.touch;
    t.active = false; t.id = null; t.vx = 0; t.vy = 0;
    this._touchPointer = null;
  },

  // =========================================================================
  // MOUSE TRANSFORM
  // =========================================================================

  /**
   * Tell Input how the engine maps the logical canvas onto the page.
   * @param {number} scale CSS px per logical px
   * @param {number} ox    letterbox offset X, in CSS px
   * @param {number} oy    letterbox offset Y, in CSS px
   * @param {number} lw    logical width the pointer is reported in (400)
   * @param {number} lh    logical height (240)
   */
  setMouseTransform(scale, ox = 0, oy = 0, lw = 0, lh = 0) {
    this._scale = scale || 1;
    this._ox = ox || 0;
    this._oy = oy || 0;
    this._lw = lw > 0 ? lw : 0;
    this._lh = lh > 0 ? lh : 0;
  },

  _lw: 0, _lh: 0,

  /** Client (CSS) px -> logical canvas px. Handles CSS-stretched canvases too. */
  _toLogical(clientX, clientY) {
    const c = this._canvas;
    if (!c) return { x: clientX, y: clientY };
    const r = c.getBoundingClientRect();
    // The rect already carries both the canvas's on-screen position AND its
    // displayed size, so scaling by (logical size / displayed size) lands
    // straight in logical pixels. Applying the engine's scale/offset on top of
    // that would correct for the same thing twice — which is exactly the bug
    // that made every click land tens of pixels up and to the left. The logical
    // size is NOT the backing store any more: that is 800x480, twice the world.
    const lw = this._lw || c.width, lh = this._lh || c.height;
    const cssX = r.width > 0 ? (lw / r.width) : 1;
    const cssY = r.height > 0 ? (lh / r.height) : 1;
    return {
      x: (clientX - r.left) * cssX,
      y: (clientY - r.top) * cssY,
    };
  },

  // =========================================================================
  // BINDING MANAGEMENT
  // =========================================================================

  /** Replace an action's key list outright. */
  bind(action, codes) {
    this.bindings[action] = Array.isArray(codes) ? codes.slice() : [codes];
  },

  /** Add one code to an action, removing it from whatever else claimed it. */
  addBinding(action, code, exclusive = true) {
    if (exclusive) {
      for (const a of ACTIONS) {
        if (a === action || !this.bindings[a]) continue;
        this.bindings[a] = this.bindings[a].filter((c) => c !== code);
      }
    }
    const list = this.bindings[action] || (this.bindings[action] = []);
    if (!list.includes(code)) list.push(code);
  },

  removeBinding(action, code) {
    if (this.bindings[action]) this.bindings[action] = this.bindings[action].filter((c) => c !== code);
  },

  resetBindings() {
    this.bindings = clone(DEFAULTS);
    this.padBindings = clone(PAD_DEFAULTS);
  },

  /** First action a physical code is bound to (null if unbound). */
  actionForCode(code) {
    for (const a of ACTIONS) {
      const list = this.bindings[a];
      if (list && list.includes(code)) return a;
    }
    return null;
  },

  /** Persist to Save.settings. */
  exportBindings() { return clone(this.bindings); },
  importBindings(obj) {
    if (!obj) return;
    const next = clone(DEFAULTS);
    for (const a of ACTIONS) if (Array.isArray(obj[a])) next[a] = obj[a].slice();
    this.bindings = next;
  },

  /**
   * Listen for the next physical key and bind it to `action`.
   * Escape aborts. `cb(code|null)` fires exactly once.
   */
  beginRebind(action, cb) {
    this.rebinding = { action, cb: typeof cb === 'function' ? cb : null };
    this.flush();
  },
  cancelRebind() {
    const r = this.rebinding;
    this.rebinding = null;
    if (r && r.cb) r.cb(null);
  },

  // =========================================================================
  // TEXT ENTRY (character names, save labels)
  // =========================================================================

  /**
   * Start swallowing keystrokes into a string. While active, no keyboard action
   * edges fire, so typing "Sildar" never walks the party across Phandalin.
   * opts: { maxLength, filter:RegExp, onChange, onDone, onCancel }
   */
  startText(initial = '', opts = {}) {
    this.textCapture = {
      value: String(initial),
      max: opts.maxLength || 24,
      filter: opts.filter || /^[\p{L}\p{N} '\-.,!?]$/u,
      onChange: opts.onChange || null,
      onDone: opts.onDone || null,
      onCancel: opts.onCancel || null,
    };
    this.flush();
    return this.textCapture;
  },
  stopText() { const t = this.textCapture; this.textCapture = null; return t ? t.value : ''; },
  get text() { return this.textCapture ? this.textCapture.value : ''; },
  get capturingText() { return this.textCapture !== null; },

  _handleText(e) {
    const t = this.textCapture;
    const k = e.key;
    if (k === 'Enter') {
      e.preventDefault();
      const v = t.value; const cb = t.onDone;
      this.textCapture = null;
      if (cb) cb(v);
      return;
    }
    if (k === 'Escape') {
      e.preventDefault();
      const cb = t.onCancel;
      this.textCapture = null;
      if (cb) cb();
      return;
    }
    if (k === 'Backspace') {
      e.preventDefault();
      t.value = t.value.slice(0, -1);
      if (t.onChange) t.onChange(t.value);
      return;
    }
    // Single-character keys only: filters out F5, ArrowLeft, Shift, etc.
    if (k.length === 1 && t.value.length < t.max && t.filter.test(k)) {
      e.preventDefault();
      t.value += k;
      if (t.onChange) t.onChange(t.value);
    }
  },

  // =========================================================================
  // GAMEPAD
  // =========================================================================

  _pollGamepads() {
    this._padDigital.clear();
    this._padStick.clear();
    const axes = this.padAxes;
    axes.lx = axes.ly = axes.rx = axes.ry = 0;
    this.hasGamepad = false;

    const nav = typeof navigator !== 'undefined' ? navigator : null;
    if (!nav || typeof nav.getGamepads !== 'function') return;
    let pads;
    try { pads = nav.getGamepads(); } catch (err) { return; }
    if (!pads) return;

    let activity = false;
    for (let p = 0; p < pads.length; p++) {
      const gp = pads[p];
      if (!gp || !gp.connected) continue;
      this.hasGamepad = true;
      this._pad = gp;

      // Buttons. Analog triggers report .value even when .pressed stays false on
      // some drivers, so test both.
      const b = gp.buttons || [];
      for (const action of ACTIONS) {
        const idx = this.padBindings[action];
        if (!idx) continue;
        for (let i = 0; i < idx.length; i++) {
          const btn = b[idx[i]];
          if (btn && (btn.pressed === true || (typeof btn.value === 'number' && btn.value > 0.5))) {
            this._padDigital.add(action);
            activity = true;
            break;
          }
        }
      }

      // Left stick -> directions (and analog dir()); right stick exposed raw.
      const a = gp.axes || [];
      const lx = axisCurve(a[0] || 0), ly = axisCurve(a[1] || 0);
      const rx = axisCurve(a[2] || 0), ry = axisCurve(a[3] || 0);
      if (Math.abs(lx) > Math.abs(axes.lx)) axes.lx = lx;
      if (Math.abs(ly) > Math.abs(axes.ly)) axes.ly = ly;
      if (Math.abs(rx) > Math.abs(axes.rx)) axes.rx = rx;
      if (Math.abs(ry) > Math.abs(axes.ry)) axes.ry = ry;
      if (lx !== 0 || ly !== 0) activity = true;
    }

    // Stick deflection also produces discrete direction edges so menus scroll.
    if (axes.lx < 0) this._padStick.add('left'); else if (axes.lx > 0) this._padStick.add('right');
    if (axes.ly < 0) this._padStick.add('up');   else if (axes.ly > 0) this._padStick.add('down');

    if (activity) this.lastDevice = 'pad';
  },

  /** Controller rumble, if the pad supports it. Safe no-op otherwise. */
  rumble(strength = 0.5, ms = 120) {
    const gp = this._pad;
    if (!gp || !gp.vibrationActuator || typeof gp.vibrationActuator.playEffect !== 'function') return;
    const s = clamp(strength, 0, 1);
    try {
      gp.vibrationActuator.playEffect('dual-rumble', {
        duration: ms, startDelay: 0, strongMagnitude: s, weakMagnitude: s * 0.6,
      });
    } catch (err) { /* pad disconnected mid-effect; ignore */ }
  },

  // =========================================================================
  // ATTACH / DETACH
  // =========================================================================

  /**
   * Wire pointer + touch listeners to the game canvas. Keyboard listeners live on
   * window and are installed once at module load. Safe to call more than once.
   */
  attach(canvas) {
    if (this._canvas === canvas) return;
    this.detach();
    this._canvas = canvas;
    if (!canvas || typeof canvas.addEventListener !== 'function') return;

    // Kill browser gestures (pinch-zoom, pull-to-refresh, double-tap zoom) on the play area.
    if (canvas.style) {
      canvas.style.touchAction = 'none';
      canvas.style.userSelect = 'none';
      canvas.style.webkitUserSelect = 'none';
      canvas.style.webkitTapHighlightColor = 'transparent';
    }

    const m = this.mouse;
    const self = this;

    const onMove = (e) => {
      const p = self._toLogical(e.clientX, e.clientY);
      m.dx += p.x - m.x; m.dy += p.y - m.y;
      m.x = p.x; m.y = p.y; m.moved = true; m.over = true;
      self.lastDevice = 'mouse';
    };
    const onDown = (e) => {
      const p = self._toLogical(e.clientX, e.clientY);
      m.x = p.x; m.y = p.y; m.over = true;
      self.lastDevice = 'mouse';
      if (e.button === 2) { m.rightClicked = true; }
      else if (e.button === 0) { m.down = true; m.clicked = true; }
    };
    const onUp = (e) => { if (e.button === 0) m.down = false; };
    const onLeave = () => { m.over = false; m.down = false; };
    const onEnter = () => { m.over = true; };
    const onContext = (e) => { e.preventDefault(); m.rightClicked = true; };
    const onWheel = (e) => {
      e.preventDefault();
      m.wheelRaw += e.deltaY;
      m.wheel += e.deltaY > 0 ? 1 : e.deltaY < 0 ? -1 : 0;
      self.lastDevice = 'mouse';
    };

    const opts = { passive: false };
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mousedown', onDown);
    canvas.addEventListener('mouseleave', onLeave);
    canvas.addEventListener('mouseenter', onEnter);
    canvas.addEventListener('contextmenu', onContext);
    canvas.addEventListener('wheel', onWheel, opts);
    canvas.addEventListener('touchstart', this._onTouchStart, opts);
    canvas.addEventListener('touchmove', this._onTouchMove, opts);
    canvas.addEventListener('touchend', this._onTouchEnd, opts);
    canvas.addEventListener('touchcancel', this._onTouchEnd, opts);
    // mouseup on window: catch releases that happen off-canvas after a drag.
    if (typeof window !== 'undefined') window.addEventListener('mouseup', onUp);

    this._handlers = { onMove, onDown, onUp, onLeave, onEnter, onContext, onWheel, opts };
  },

  detach() {
    const c = this._canvas, h = this._handlers;
    if (c && h) {
      c.removeEventListener('mousemove', h.onMove);
      c.removeEventListener('mousedown', h.onDown);
      c.removeEventListener('mouseleave', h.onLeave);
      c.removeEventListener('mouseenter', h.onEnter);
      c.removeEventListener('contextmenu', h.onContext);
      c.removeEventListener('wheel', h.onWheel, h.opts);
      c.removeEventListener('touchstart', this._onTouchStart, h.opts);
      c.removeEventListener('touchmove', this._onTouchMove, h.opts);
      c.removeEventListener('touchend', this._onTouchEnd, h.opts);
      c.removeEventListener('touchcancel', this._onTouchEnd, h.opts);
      if (typeof window !== 'undefined') window.removeEventListener('mouseup', h.onUp);
    }
    this._canvas = null;
    this._handlers = null;
  },

  // ---- touch --------------------------------------------------------------
  // One finger on the dpad half becomes a virtual thumbstick (relative to where it
  // first landed, so there is nothing to aim at). Any other finger acts as the mouse:
  // a short, still press-and-lift is a tap = a click at that spot.
  _touchPointer: null,

  _dpadHalfTest(clientX) {
    const c = this._canvas;
    if (!c) return true;
    const r = c.getBoundingClientRect();
    const mid = r.left + r.width / 2;
    return this.touchDpadSide === 'right' ? clientX >= mid : clientX < mid;
  },

  _onTouchStart(e) {
    const self = Input;
    self.lastDevice = 'touch';
    e.preventDefault();
    const list = e.changedTouches;
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      const p = self._toLogical(t.clientX, t.clientY);
      if (!self.touch.active && self._dpadHalfTest(t.clientX)) {
        const vd = self.touch;
        vd.active = true; vd.id = t.identifier;
        vd.ox = p.x; vd.oy = p.y; vd.x = p.x; vd.y = p.y; vd.vx = 0; vd.vy = 0;
      } else if (!self._touchPointer) {
        self._touchPointer = { id: t.identifier, sx: t.clientX, sy: t.clientY, t: Date.now() };
        const m = self.mouse;
        m.x = p.x; m.y = p.y; m.down = true; m.over = true; m.moved = true;
      }
    }
  },

  _onTouchMove(e) {
    const self = Input;
    e.preventDefault();
    const list = e.changedTouches;
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      const p = self._toLogical(t.clientX, t.clientY);
      const vd = self.touch;
      if (vd.active && t.identifier === vd.id) {
        vd.x = p.x; vd.y = p.y;
        const dx = p.x - vd.ox, dy = p.y - vd.oy;
        const len = Math.hypot(dx, dy);
        if (len < TOUCH_DEAD) { vd.vx = 0; vd.vy = 0; }
        else {
          // Normalise travel over TOUCH_RADIUS px, then re-anchor the origin so the
          // stick "follows" a finger dragged past full deflection.
          const k = Math.min(1, (len - TOUCH_DEAD) / TOUCH_RADIUS) / len;
          vd.vx = clamp(dx * k, -1, 1);
          vd.vy = clamp(dy * k, -1, 1);
          if (len > TOUCH_DEAD + TOUCH_RADIUS) {
            const pull = (len - TOUCH_DEAD - TOUCH_RADIUS) / len;
            vd.ox += dx * pull; vd.oy += dy * pull;
          }
        }
        self._syncTouchDpad();
      } else if (self._touchPointer && t.identifier === self._touchPointer.id) {
        const m = self.mouse;
        m.dx += p.x - m.x; m.dy += p.y - m.y;
        m.x = p.x; m.y = p.y; m.moved = true;
      }
    }
  },

  _onTouchEnd(e) {
    const self = Input;
    e.preventDefault();
    const list = e.changedTouches;
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      const vd = self.touch;
      if (vd.active && t.identifier === vd.id) {
        vd.active = false; vd.id = null; vd.vx = 0; vd.vy = 0;
        self._touchHeld.clear();
      } else if (self._touchPointer && t.identifier === self._touchPointer.id) {
        const tp = self._touchPointer;
        const moved = Math.hypot(t.clientX - tp.sx, t.clientY - tp.sy);
        const m = self.mouse;
        m.down = false;
        if (moved < TAP_SLOP && Date.now() - tp.t < TAP_TIME) {
          m.clicked = true;                       // taps map to a left click
          if (self.touchConfirmOnTap) self._pressed.add('confirm');
        }
        self._touchPointer = null;
      }
    }
  },

  /** Virtual-stick deflection also produces discrete direction actions. */
  _syncTouchDpad() {
    const vd = this.touch, h = this._touchHeld;
    h.clear();
    if (!vd.active) return;
    if (vd.vx < -DEADZONE) h.add('left'); else if (vd.vx > DEADZONE) h.add('right');
    if (vd.vy < -DEADZONE) h.add('up');   else if (vd.vy > DEADZONE) h.add('down');
  },
};

// ===========================================================================
// KEYBOARD — installed once, on window, so menus work before the canvas exists.
// ===========================================================================
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('keydown', (e) => {
    if (isTextTarget(e.target)) return;
    // Let the browser keep its own shortcuts (Ctrl+R, Cmd+Tab, Alt+F4…).
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    Input.lastDevice = 'key';

    // A rebinding UI eats exactly one key.
    const rb = Input.rebinding;
    if (rb) {
      e.preventDefault();
      Input.rebinding = null;
      if (e.code === 'Escape') { if (rb.cb) rb.cb(null); return; }
      Input.addBinding(rb.action, e.code);
      if (rb.cb) rb.cb(e.code);
      return;
    }

    if (Input.textCapture) { Input._handleText(e); return; }
    if (!Input.enabled) return;

    Input._codes.add(e.code);
    if (!e.repeat) Input._tapped.add(e.code);   // OS key-repeat must not fake edges
    if (PREVENT.has(e.code)) e.preventDefault();
  });

  window.addEventListener('keyup', (e) => {
    Input._codes.delete(e.code);
    if (PREVENT.has(e.code) && !isTextTarget(e.target)) e.preventDefault();
  });

  // Losing focus while a key is held would otherwise leave the party sprinting
  // north forever; drop everything whenever the page stops listening.
  window.addEventListener('blur', () => Input.flush());
  document.addEventListener('visibilitychange', () => { if (document.hidden) Input.flush(); });
  window.addEventListener('gamepadconnected', () => { Input.hasGamepad = true; });
  window.addEventListener('gamepaddisconnected', () => { Input._pad = null; });
}

export default Input;
