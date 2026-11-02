// ui/hud.js — the overworld heads-up display: party cards, clock, quest compass, minimap, log, toasts, banner.
//
// Not a Scene: OverworldScene owns an instance, calls hud.update(dt) while the
// world runs and hud.draw(ctx) on the 'hud' layer every frame, so the HUD can
// fade out from under a menu or a conversation instead of popping.
//
// Every block is a Layout widget (ui/layout.js): it registers where it was
// designed to sit, draws and hit-tests at Layout.rect(id) every frame, and can
// be moved or hidden in Arrange mode (F8). The designed layout, on the 2x
// 'hud' layer's fine grid (half a logical px is one device pixel):
//   top-left      party cards: bust, name, HP with a damage ghost, slots or
//                 death saves, conditions and buffs
//   top-right     clock (a little sky dial), date, weather, purse; under it
//                 the quest compass: objective, a needle to it, the distance
//   top-centre    the heraldic place banner; toasts below it (on 'overlay')
//   bottom-left   the running log, straight on the world over a soft wash
//   bottom-centre the action belt (ui/hotbar.js)
//   bottom-right  the parchment minimap roundel (ui/hudmap.js)
// Presets (Layout.presets): classic (close to the old HUD), minimal (clock,
// party pips, belt), cinematic (the HUD fades while you walk and comes back
// when you stop, point at it, or get hurt); Save.settings.hudPreset holds it.
// Barks (ui/barks.js) are drawn from here on 'world-ui': hud.bark(target, text, opts).

import { Game } from '../engine.js';
import { UI } from './kit.js';
import { GILT, RUBRIC } from './ornament.js';
import { bus, EV } from '../core/events.js';
import { Input } from '../core/input.js';
import { Save } from '../core/save.js';
import { Party } from '../world/party.js';
import { drawActorBust } from '../render/actor.js';
import { Layout } from './layout.js';
import {
  snap, C, txt, tw, fit, shortName, frame, well, scrim, meter, mark, markKeyed, badgesOf,
  cached, blit, disc, ring,
} from './hudparts.js';
import { drawMinimap, questGoal, trackedQuest, currentStep, ZOOMS } from './hudmap.js';
import { bark as addBark, drawBarks, updateBarks, clearBarks } from './barks.js';
import {
  VIEW_W, VIEW_H, TILE, clamp, approach, titleCase, clockText, dateText, timeOfDay,
} from '../constants.js';

// ---------------------------------------------------------------------------
// Geometry (logical px) and the widgets
// ---------------------------------------------------------------------------

const CARD = { w: 66, h: 18, gap: 1 };
const PIPS = { w: 36, row: 6 };
const CLOCK = { w: 106, h: 15 };
const QUEST = { w: 106, h: 20 };
const MAP_R = 22;                              // the roundel is 2r across
const LOG = { w: 106, h: 18, lines: 3, life: 6 };
const TOAST = { max: 4, life: 3.4, slide: 0.22, h: 8, gap: 1.5, w: 120 };

const partyH = (n) => n * CARD.h + Math.max(0, n - 1) * CARD.gap;

Layout.register('hud.party', { anchor: 'tl', x: 3, y: 3, w: CARD.w, h: partyH(4), label: 'Party', scene: 'overworld' });
Layout.register('hud.clock', { anchor: 'tr', x: VIEW_W - 3 - CLOCK.w, y: 3, w: CLOCK.w, h: CLOCK.h, label: 'Clock & purse', scene: 'overworld' });
Layout.register('hud.quest', { anchor: 'tr', x: VIEW_W - 3 - QUEST.w, y: 20, w: QUEST.w, h: QUEST.h, label: 'Quest', scene: 'overworld' });
Layout.register('hud.banner', { anchor: 'tc', x: 110, y: 6, w: 180, h: 30, label: 'Place name', scene: 'overworld' });
Layout.register('hud.toasts', { anchor: 'tr', x: VIEW_W - 3 - TOAST.w, y: 49, w: TOAST.w, h: TOAST.max * (TOAST.h + TOAST.gap), label: 'Notices', scene: 'overworld' });
Layout.register('hud.log', { anchor: 'bl', x: 3, y: VIEW_H - 3 - LOG.h, w: LOG.w, h: LOG.h, label: 'Log', scene: 'overworld' });
// The "Found" slip the overworld raises over a chest or a search, centred
// above the party ('mc': it grows about its middle).
Layout.register('hud.popup', { anchor: 'mc', x: 125, y: 54, w: 150, h: 40, label: 'Found slip', scene: 'overworld' });
Layout.register('hud.minimap', { anchor: 'br', x: VIEW_W - 3 - MAP_R * 2, y: VIEW_H - 3 - MAP_R * 2, w: MAP_R * 2, h: MAP_R * 2, label: 'Minimap', scene: 'overworld' });

// The presets. Classic puts the redrawn widgets back where the old HUD had
// them (quest over the belt, belt and log bottom-left); minimal keeps only
// the clock, a strip of party pips and the belt; cinematic keeps the designed
// layout and changes behaviour only.
Layout.definePreset('classic', {
  label: 'Classic',
  place: {
    'hud.quest': { x: 147, y: 170 },
    'hud.log': { x: 3, y: 180 },
    'hud.toolbar': { x: 3, y: 219 },
    'hud.toasts': { x: 140, y: 38 },
  },
});
Layout.definePreset('minimal', {
  label: 'Minimal',
  hide: ['hud.quest', 'hud.log', 'hud.minimap', 'battle.log'],
  mode: { party: 'pips' },
});
Layout.definePreset('cinematic', { label: 'Cinematic', mode: { fade: 'cinematic' } });

// Spell-slot pip colours, 1st through 9th.
const SLOT_COLORS = [
  '#6aa8e8', '#5f9ee0', '#7a94e0', '#9088e0', '#a87ce0',
  '#c078d8', '#d478c8', '#e07ab0', '#e88a90',
];

// Widgets the walking fade and the cinematic fade act on (toasts and the
// banner are news: they always show).
const FADERS = ['hud.party', 'hud.clock', 'hud.quest', 'hud.log', 'hud.minimap', 'hud.toolbar'];

// ===========================================================================
// HUD
// ===========================================================================

export class HUD {
  /** opts: { scene } — the OverworldScene, for its entities, player, camera and menus. */
  constructor(opts = {}) {
    this.opts = opts || {};
    this.scene = this.opts.scene || null;
    this.t = 0;
    this.visible = true;
    this.hidden = false;         // hard hide (cutscene)
    this.alpha = 1;              // the whole HUD's fade (menus, dialogue)
    this.fades = Object.create(null);   // widget id -> its own alpha

    this.map = null;
    this.entities = null;        // optional override of the scene's entity list
    this.player = null;          // { sx, sy, moving } in screen px (setPlayerScreen)
    // Spell markers, shared by reference with the overworld scene:
    // rules/fieldworld.js owns the array, the HUD only draws it.
    this.markers = null;

    this.toasts = [];
    this.log = [];               // [{ text, kind, t, lines }]
    this.ghosts = Object.create(null);   // uid -> { v, hold, last }
    this.flash = Object.create(null);    // uid -> seconds of hit flash left
    this._walkT = 9;             // seconds since the party last moved
    this._hurtT = 9;             // seconds since someone was hurt (cinematic returns)
    this._dialogue = false;
    this._dlgGrace = 0;
    this._hover = null;          // the widget under the pointer
    this._goal = null;           // the quest compass's target this frame
    this._hint = null;           // the interact hint's rect, for barks to avoid

    this._off = [];
    this._wire();
  }

  // --- wiring -------------------------------------------------------------

  _wire() {
    const on = (evt, fn) => { this._off.push(bus.on(evt, fn)); };

    on(EV.TOAST, (p) => {
      if (!p) return;
      this.toast(p.text || String(p), { color: p.color, mark: p.icon || p.mark, kind: p.kind });
    });
    on(EV.ITEM_GAIN, (p) => {
      if (!p || !p.id) return;
      const it = safeItem(p.id);
      const name = (it && it.name) || titleCase(String(p.id).replace(/-/g, ' '));
      const qty = p.qty && p.qty > 1 ? ` ×${p.qty}` : '';
      this.toast(`${name}${qty}`, { color: (it && it.tint) || C('ink'), mark: 'bag', kind: 'item' });
    });
    on(EV.GOLD_CHANGE, (p) => {
      if (!p || !p.delta) return;
      const d = Math.round(p.delta);
      this.toast(`${d > 0 ? '+' : '−'}${Math.abs(d)} gp`, { color: C('gold'), mark: 'coin', kind: 'gold' });
    });
    on(EV.LEVEL_UP, (p) => {
      const ch = (p && (p.ch || p.character || p.unit)) || null;
      const name = (ch && ch.name) || (p && p.name) || 'Someone';
      const lvl = p?.to || p?.level || ch?.level || '';
      const text = p?.applied ? `${name} reached level ${lvl}` : `${name} earned a level-up`;
      this.toast(text, { color: C('xp'), mark: 'star', kind: 'level' });
    });
    on(EV.QUEST_DONE, (p) => {
      const title = (p && p.quest && p.quest.title) || (p && p.title) || 'a task';
      this.toast(`Quest complete: ${title}`, { color: C('green'), mark: 'quest', kind: 'quest' });
    });
    on(EV.QUEST_START, (p) => {
      const title = (p && p.quest && p.quest.title) || (p && p.title) || null;
      if (title) this.toast(`New quest: ${title}`, { color: C('gold'), mark: 'quest', kind: 'quest' });
    });
    on(EV.MEMBER_JOIN, (p) => {
      const ch = p && p.ch;
      if (!ch) return;
      this.toast(`${ch.name || 'A companion'} joined the party`, { color: C('blue'), mark: 'helm', kind: 'party' });
    });
    on(EV.LOG, (p) => {
      const text = (p && (p.text || p.msg)) || (typeof p === 'string' ? p : '');
      if (!text) return;
      this.log.push({ text: String(text), kind: (p && p.kind) || '', t: 0, lines: null });
      while (this.log.length > 4) this.log.shift();
    });
    on(EV.STEP, () => { this._walkT = 0; });
    on(EV.MAP_ENTER, (p) => {
      const m = (p && (p.map || p.tilemap)) || null;
      if (m) this.setMap(m);
      clearBarks();
    });
    on(EV.DIALOGUE_OPEN, (p) => {
      if (p && p.open === false) { this._dlgGrace = 0; this._dialogue = false; }
      else { this._dialogue = true; this._dlgGrace = 0.3; }
    });
    // Flash the bar of whoever just got hit, whatever the payload calls them.
    on(EV.DAMAGE, (p) => {
      const u = p && (p.target || p.unit || p.ch || p.victim);
      if (u && u.uid) this.flashHP(u.uid);
    });
    on(EV.DOWNED, (p) => {
      const u = p && (p.target || p.unit || p.ch);
      if (u && u.uid) this.flashHP(u.uid);
    });
  }

  /** Drop every bus subscription. Call when the overworld is torn down. */
  destroy() {
    for (const off of this._off) { try { off(); } catch (e) { /* ignore */ } }
    this._off = [];
  }

  // --- public API ---------------------------------------------------------

  /** Show or hide the whole HUD (it fades rather than popping). */
  setVisible(v) { this.visible = !!v; return this.visible; }

  /** Pulse a party member's HP bar — call it when they take a hit. */
  flashHP(uid) { if (uid) { this.flash[uid] = 0.55; this._hurtT = 0; } }

  /** The TileMap the minimap should draw. */
  setMap(map) { this.map = map || null; return this.map; }

  /** Entities to plot on the minimap; defaults to the scene's. */
  setEntities(list) { this.entities = Array.isArray(list) ? list : null; }

  /**
   * Where the player sprite is on screen, so the HUD knows when to get out of
   * the way. The overworld calls this every frame.
   */
  setPlayerScreen(sx, sy, moving) {
    this.player = { sx, sy, moving: !!moving };
    if (moving) this._walkT = 0;
  }

  /** Queue a toast. opts: { color, mark (a kit icon or a 5x5 mark), kind, life } */
  toast(text, opts = {}) {
    if (!text) return null;
    const t = {
      text: String(text), color: opts.color || null, mark: opts.mark || null,
      kind: opts.kind || '', life: opts.life || TOAST.life, t: 0, slot: -1,
    };
    this.toasts.push(t);
    while (this.toasts.length > TOAST.max) this.toasts.shift();
    return t;
  }

  clearToasts() { this.toasts.length = 0; }

  /**
   * A speech bubble over `target` (an entity, { px, py } world px, or { x, y }
   * a map tile). opts: { ttl, kind: 'say'|'shout'|'whisper'|'party'|'hostile'|'thought' }.
   * See ui/barks.js.
   */
  bark(target, text, opts) { return addBark(target, text, opts); }

  /** The alpha a widget is drawn at this frame (the hotbar asks for 'hud.toolbar'). */
  alphaOf(id) {
    if (Layout.editing) return 1;
    return clamp(this.alpha * (this.fades[id] == null ? 1 : this.fades[id]), 0, 1);
  }

  // --- update -------------------------------------------------------------

  update(dt) {
    const d = clamp(dt || 0, 0, 0.1);
    this.t += d;
    this._walkT += d;
    this._hurtT += d;
    if (this._dlgGrace > 0) this._dlgGrace -= d;
    updateBarks(d);

    for (const l of this.log) l.t += d;
    this.log = this.log.filter((l) => l.t < LOG.life);

    // Damage ghosts and hit flashes.
    for (const m of Party.members || []) {
      if (!m || !m.uid) continue;
      const pct = clamp((m.hp || 0) / Math.max(1, m.maxHp || 1), 0, 1);
      let g = this.ghosts[m.uid];
      if (!g) g = this.ghosts[m.uid] = { v: pct, hold: 0 };
      if (pct > g.v) g.v = pct;                       // healing snaps the ghost up
      else if (pct < g.v - 0.0005) {
        if (g.hold <= 0 && g.last !== pct) { g.hold = 0.35; g.last = pct; this._hurtT = 0; }
        if (g.hold > 0) g.hold -= d;
        else g.v = Math.max(pct, g.v - d * 0.55);
      } else g.v = pct;
      if (this.flash[m.uid] > 0) { this.flash[m.uid] -= d; if (this.flash[m.uid] <= 0) delete this.flash[m.uid]; }
    }

    this._clicks();
  }

  /** Clicks on the HUD itself: the minimap zooms, a card opens the party, the quest the journal. */
  _clicks() {
    const m = Input.mouse;
    if (!m || !m.over || !m.clicked || Layout.editing) return;
    const hit = (id) => {
      if (!Layout.visible(id) || this.alphaOf(id) < 0.3) return false;
      const r = Layout.rect(id);
      return m.x >= r.x && m.x < r.x + r.w && m.y >= r.y && m.y < r.y + r.h;
    };
    const open = (which) => { const s = this.scene; if (s && typeof s._openMenu === 'function') s._openMenu(which); };
    if (hit('hud.minimap')) {
      const i = ZOOMS.indexOf(this._zoom());
      Save.settings.minimapZoom = ZOOMS[(i + 1) % ZOOMS.length];
      try { Save.saveSettings(); } catch (e) { /* the zoom still applies this session */ }
      m.clicked = false;
    } else if (hit('hud.party') && (Party.members || []).length) {
      m.clicked = false; open('party');
    } else if (hit('hud.quest') && trackedQuest(Game.state)) {
      m.clicked = false; open('journal');
    }
  }

  _zoom() {
    const z = Number(Save.settings && Save.settings.minimapZoom);
    return ZOOMS.includes(z) ? z : 1;
  }

  _isWalking() {
    if (this.player && this.player.moving) return true;
    return this._walkT < 0.32;
  }

  _syncDialogue() {
    if (this._dlgGrace > 0) return;
    let found = false;
    for (const s of (Game.scenes || [])) {
      const n = (s && (s.id || (s.constructor && s.constructor.name))) || '';
      if (/dialog/i.test(String(n))) { found = true; break; }
    }
    this._dialogue = found;
  }

  /**
   * Fades, worked out in draw() with the frame's own dt: the world's update
   * stops under a menu, and the HUD still has to fade away beneath it.
   */
  _fade(dt, rects) {
    this._syncDialogue();
    const covered = Game.top && this.scene && Game.top !== this.scene;
    let target = 1;
    if (!this.visible || this.hidden || this._dialogue || covered) target = 0;
    this.alpha = approach(this.alpha, target, dt * 5);

    const walking = this._isWalking();
    const cinematic = Layout.mode('fade') === 'cinematic';
    const m = Input.mouse;
    this._hover = null;
    for (const id of FADERS) {
      const r = rects[id];
      // (Arrange mode draws its own highlight; the widgets' hover looks stay out of it.)
      const hovered = !Layout.editing && !!(r && m && m.over && m.x >= r.x && m.x < r.x + r.w && m.y >= r.y && m.y < r.y + r.h);
      if (hovered) this._hover = id;
      let want = 1;
      if (cinematic && (walking || this._walkT < 0.9) && !hovered && this._hurtT > 3) want = 0;
      else if (walking && r && this._under(r)) want = 0.25;
      const cur = this.fades[id] == null ? 1 : this.fades[id];
      this.fades[id] = approach(cur, want, dt * (want > cur ? 6 : cinematic ? 2.2 : 4.5));
    }
  }

  /** Is the player sprite inside (or just under) rect r? */
  _under(r) {
    const p = this.player;
    if (!p) return false;
    return p.sx >= r.x - 6 && p.sx <= r.x + r.w + 6 && p.sy >= r.y - 6 && p.sy <= r.y + r.h + 22;
  }

  /** True when the player sprite sits under any visible panel. */
  _playerUnderHud() {
    for (const id of FADERS) if (Layout.visible(id) && this._under(Layout.rect(id))) return true;
    return false;
  }

  // --- draw ---------------------------------------------------------------

  /** Every visible widget's rect this frame (for fades, barks and Arrange mode). */
  _rects() {
    const out = {};
    const n = Math.max(1, Math.min(4, (Party.members || []).length));
    const pips = Layout.mode('party') === 'pips';
    out['hud.party'] = Layout.rect('hud.party', pips ? { w: PIPS.w, h: n * PIPS.row + 3 } : { w: CARD.w, h: partyH(n) });
    // A long objective takes a second line rather than an ellipsis.
    const ql = this._questLines(Game.state);
    out['hud.quest'] = Layout.rect('hud.quest', { w: QUEST.w, h: QUEST.h + (ql && ql.lines.length > 1 ? 5 : 0) });
    for (const id of ['hud.clock', 'hud.log', 'hud.minimap', 'hud.toolbar']) out[id] = Layout.rect(id);
    for (const id of Object.keys(out)) if (!out[id].visible) delete out[id];
    return out;
  }

  draw(ctx) {
    const dt = clamp(Game.dt || 0, 0, 0.1);
    const rects = this._rects();
    this._rectsNow = rects;
    this._fade(dt, rects);
    if (this.alpha <= 0.02 && !Layout.editing) return;
    const st = Game.state || {};
    const scene = this.scene;
    this._goal = scene && this.map ? safe(() => questGoal(st, this.map, this._ents(), scene.player), null) : null;

    const paint = (id, fn) => {
      const r = rects[id];
      if (!r) return;
      const a = this.alphaOf(id);
      if (a <= 0.02) return;
      ctx.save();
      ctx.globalAlpha = a;
      try { fn.call(this, ctx, r, st); } catch (e) { reportOnce(id, e); }
      ctx.restore();
    };
    paint('hud.party', Layout.mode('party') === 'pips' ? this._drawPips : this._drawParty);
    paint('hud.clock', this._drawClock);
    paint('hud.quest', this._drawQuest);
    paint('hud.minimap', this._drawMinimap);
    paint('hud.log', this._drawLog);
  }

  _ents() {
    if (this.entities) return this.entities;
    const s = this.scene;
    return (s && s.entities && s.entities.list) || (this.map && Array.isArray(this.map.entities) ? this.map.entities : []);
  }

  // --- party cards --------------------------------------------------------

  _drawParty(ctx, r) {
    const members = (Party.members || []).slice(0, 4);
    const m = Input.mouse;
    const step = CARD.h + CARD.gap;
    const hi = this._hover === 'hud.party' && m ? Math.floor((m.y - r.y) / step) : -1;
    for (let i = 0; i < members.length; i++) this._card(ctx, r.x, r.y + i * step, members[i], i === 0, i === hi);
    if (members[hi]) this._cardTip(ctx, r, r.y + hi * step, members[hi]);
  }

  /**
   * Pointing at a card spells out what its badges only hint at: level and
   * calling, HP and AC, death saves, and every condition and blessing by name.
   */
  _cardTip(ctx, r, y, m) {
    const cls = (m.classes || []).map((c) => titleCase(String(c.id || '').replace(/-/g, ' '))).filter(Boolean).join(' / ');
    const rows = [];
    rows.push({ s: m.name || 'Unnamed', size: 'fineb', color: '#f6e3b0' });
    rows.push({ s: `Level ${m.level || 1}${cls ? ' ' + cls : ''}`, size: 'xs', color: '#a89a7c' });
    const hp = `HP ${Math.max(0, m.hp | 0)}/${m.maxHp | 0}${m.tempHp > 0 ? ` +${m.tempHp | 0}` : ''}   AC ${m.ac || 10}`;
    rows.push({ s: hp, size: 'fine', color: '#e8dcc0' });
    const toNext = PROG && PROG.xpToNext ? safe(() => PROG.xpToNext(m), null) : null;
    if (toNext != null) rows.push({ s: `${m.xp | 0} XP, ${toNext} to the next level`, size: 'xs', color: '#c8a458' });
    if (!m.dead && (m.hp || 0) <= 0) {
      const ds = m.deathSaves || {};
      rows.push({ s: `Death saves ${ds.success || 0} of 3, failures ${ds.fail || 0} of 3`, size: 'fine', color: '#e07a64' });
    }
    for (const b of badgesOf(m)) rows.push({ s: b.name, size: 'fine', color: b.good ? '#9ad8a8' : '#e8a08a', mark: b });
    const w = snap(Math.min(150, Math.max(...rows.map((o) => tw(o.s, o.size) + (o.mark ? 7 : 0)))) + 7);
    const h = snap(rows.reduce((a, o) => a + (o.size === 'xs' ? 4.5 : 5.5), 0) + 3.5);
    const x = r.x + r.w + 2 + w > VIEW_W - 2 ? r.x - w - 2 : r.x + r.w + 2;
    const ty = clamp(y, 2, VIEW_H - h - 2);
    frame(ctx, x, ty, w, h, { tone: 'gilt', alpha: 0.97 });
    let yy = ty + 2;
    for (const o of rows) {
      let tx = x + 3.5;
      if (o.mark) { mark(ctx, o.mark.mark, tx, yy + 0.5, o.mark.color, 0.5); tx += 4; }
      txt(ctx, tx, yy + 0.5, fit(o.s, w - (tx - x) - 3, o.size), o.size, o.color);
      yy += o.size === 'xs' ? 4.5 : 5.5;
    }
  }

  _card(ctx, x, y, m, leader, hover) {
    const w = CARD.w, h = CARD.h;
    const dead = !!m.dead, down = !dead && (m.hp || 0) <= 0, grey = dead || down;
    frame(ctx, x, y, w, h, { tone: dead ? 'dead' : down ? 'danger' : leader || hover ? 'gilt' : null });

    // The bust, in a recessed well, at the world's own pixel scale.
    well(ctx, x + 1.5, y + 1.5, 15, 15, grey ? '#140c0c' : '#16121a');
    ctx.save();
    ctx.beginPath(); ctx.rect(x + 2, y + 2, 14, 14); ctx.clip();
    if (grey) ctx.globalAlpha *= 0.45;
    safe(() => drawActorBust(ctx, m, x + 2, y + 2, 14));
    ctx.restore();
    if (grey) markKeyed(ctx, 'skull', x + 6.5, y + 6.5, dead ? '#b0a8a0' : C('red'));

    const tx = x + 19, right = x + w - 2.5;
    // HP readout, then the name in what room is left.
    const readout = dead ? 'DEAD' : down ? 'DOWN' : `${Math.max(0, m.hp | 0)}/${m.maxHp | 0}`;
    txt(ctx, right, y + 3, readout, 'xs', grey ? '#e07a64' : hpColor(m), { align: 'right' });
    const nameW = right - tx - tw(readout, 'xs') - 2.5;
    txt(ctx, tx, y + 2.5, shortName(m.name, nameW, 'fineb'), 'fineb', grey ? C('dim') : leader ? '#f6e3b0' : C('ink'));

    // HP meter with the damage ghost, a temp-HP cap and the low-health breath.
    const pct = clamp((m.hp || 0) / Math.max(1, m.maxHp || 1), 0, 1);
    const g = this.ghosts[m.uid];
    const low = pct > 0 && pct <= 0.25 && !dead;
    meter(ctx, tx, y + 8, right - tx, 2.5, pct, dead ? '#4a3a3a' : hpColor(m), {
      ghost: g ? g.v : pct,
      temp: m.tempHp > 0 ? m.tempHp / Math.max(1, m.maxHp || 1) : 0,
      pulse: low ? 0.18 + 0.18 * Math.sin(this.t * 7) : 0,
    });
    const f = this.flash[m.uid];
    if (f > 0) {
      const a = ctx.globalAlpha;
      ctx.globalAlpha = a * clamp(f / 0.55, 0, 1);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(tx - 0.5, y + 7.5, right - tx + 1, 3.5);
      ctx.globalAlpha = a;
    }

    // The status row: death saves when down, else spell slots (or AC), and
    // the condition and buff badges from the right.
    const rowY = y + 12;
    let used;
    if (down) used = this._deathSaves(ctx, tx, rowY + 1, m);
    else used = this._slotPips(ctx, tx, rowY + 1.5, right - tx - 14, m, grey);
    if (!used && !down) {
      mark(ctx, 'shield', tx, rowY + 0.5, '#8a8272', 0.5);
      txt(ctx, tx + 3.5, rowY + 0.5, `AC ${m.ac || 10}`, 'xs', C('dim'));
    }
    // A gilt hairline along the foot of the card: the way to the next level.
    const xp = PROG && PROG.xpProgress ? safe(() => PROG.xpProgress(m), 0) : 0;
    if (!grey) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(x + 17.5, y + h - 1.5, w - 19, 0.5);
      if (xp > 0) { ctx.fillStyle = 'rgba(226,182,84,0.8)'; ctx.fillRect(x + 17.5, y + h - 1.5, snap((w - 19) * xp), 0.5); }
    }
    this._badges(ctx, right, rowY - 0.5, m, down ? 22 : 26);
  }

  /** Three saves and three failures, as lit lozenges. */
  _deathSaves(ctx, x, y, m) {
    const ds = m.deathSaves || {};
    const gem = (px, on, col, off) => {
      ctx.fillStyle = '#07060a'; ctx.fillRect(px - 0.5, y - 0.5, 3, 3);
      ctx.fillStyle = on ? col : off; ctx.fillRect(px, y, 2, 2);
      if (on) { ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(px, y, 0.5, 0.5); }
    };
    for (let j = 0; j < 3; j++) gem(x + j * 3, j < (ds.success || 0), C('green'), '#26302a');
    for (let j = 0; j < 3; j++) gem(x + 10 + j * 3, j < (ds.fail || 0), C('red'), '#352628');
    return true;
  }

  /** Slot pips for casters, on the fine grid. False when this character casts nothing. */
  _slotPips(ctx, x, y, w, m, grey) {
    const sp = m.spells;
    if (!sp) return false;
    const groups = [];
    const slots = sp.slots || {};
    for (let lvl = 1; lvl <= 9; lvl++) {
      const s = slots[lvl];
      const max = s && (s.max | 0);
      if (max > 0) groups.push({ max, used: (s.used | 0), color: SLOT_COLORS[lvl - 1] });
    }
    if (sp.pact && (sp.pact.max | 0) > 0) groups.push({ max: sp.pact.max | 0, used: sp.pact.used | 0, color: C('purple') });
    if (!groups.length) return false;
    const a = ctx.globalAlpha;
    if (grey) ctx.globalAlpha = a * 0.5;
    let px = x;
    for (const g of groups) {
      for (let i = 0; i < g.max; i++) {
        if (px > x + w - 1.5) { ctx.globalAlpha = a; return true; }   // out of room: the rest are implied
        const spent = i >= g.max - g.used;
        ctx.fillStyle = '#07060a'; ctx.fillRect(px - 0.5, y - 0.5, 2.5, 2.5);
        ctx.fillStyle = spent ? '#2a2834' : g.color; ctx.fillRect(px, y, 1.5, 1.5);
        if (!spent) { ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(px, y, 0.5, 0.5); }
        px += 2;
      }
      px += 1.5;
    }
    ctx.globalAlpha = a;
    return true;
  }

  /** Condition and buff badges, right-aligned at `right`, never wider than `maxW`. */
  _badges(ctx, right, y, m, maxW) {
    const list = badgesOf(m);
    if (!list.length) return;
    const per = 6;
    const n = Math.min(list.length, Math.max(1, Math.floor(maxW / per)));
    let px = right - n * per + 1;
    for (let i = 0; i < n; i++) {
      const b = list[i];
      // Blessings sit on a lit chip, afflictions on a dark one, so the two read
      // apart without relying on colour.
      ctx.fillStyle = b.good ? 'rgba(150,220,170,0.28)' : 'rgba(6,5,8,0.85)';
      ctx.fillRect(px - 0.5, y, 6, 6);
      mark(ctx, b.mark, px, y + 0.5, b.color);
      px += per;
    }
    if (list.length > n) txt(ctx, right - n * per - 0.5, y + 1.5, `+${list.length - n}`, 'xs', C('dim'), { align: 'right' });
  }

  // --- party pips (the minimal preset) -------------------------------------

  _drawPips(ctx, r) {
    const members = (Party.members || []).slice(0, 4);
    frame(ctx, r.x, r.y, r.w, r.h, { alpha: 0.8 });
    for (let i = 0; i < members.length; i++) {
      const m = members[i];
      const y = r.y + 1.5 + i * PIPS.row;
      const dead = !!m.dead, down = !dead && (m.hp || 0) <= 0;
      const initial = String(m.name || '?').trim().charAt(0).toUpperCase();
      txt(ctx, r.x + 2.5, y + 1, initial, 'fineb', i === 0 ? GILT.hi : C('ink'));
      if (down || dead) markKeyed(ctx, 'skull', r.x + 7, y + 0.5, dead ? '#b0a8a0' : C('red'), 0.5);
      const pct = clamp((m.hp || 0) / Math.max(1, m.maxHp || 1), 0, 1);
      const g = this.ghosts[m.uid];
      meter(ctx, r.x + 11, y + 1.5, r.w - 13.5, 2, pct, hpColor(m), { ghost: g ? g.v : pct, notches: false });
    }
  }

  // --- clock, date, weather, purse ----------------------------------------

  _drawClock(ctx, r, st) {
    frame(ctx, r.x, r.y, r.w, r.h);
    const time = st.time == null ? 480 : st.time;
    const phase = timeOfDay(time);
    const night = phase === 'night';
    const weather = st.weather || 'clear';
    // The sky dial redraws every ten minutes of game time, not every frame.
    const cv = cached(`dial:${Math.floor(time / 10)}:${weather}`, 13, 13, (g) => paintDial(g, time, weather));
    blit(ctx, cv, r.x + 1, r.y + 1);
    txt(ctx, r.x + 16, r.y + 2.5, clockText(time), 'fineb', night ? '#b4c8f0' : '#f2e6c8');
    txt(ctx, r.x + 16, r.y + 9, fit(dateText(st.day || 1).replace(',', ''), r.w - 44, 'xs'), 'xs', C('dim'));
    const ph = PHASE_WORD[phase];
    if (ph) txt(ctx, r.x + 16 + tw(clockText(time), 'fineb') + 3, r.y + 3, ph, 'xs', night ? '#7a8ab0' : '#a89a7c');
    const right = r.x + r.w - 2.5;
    const gold = String(Party.gold | 0);
    txt(ctx, right, r.y + 2.5, gold, 'fineb', GILT.hi, { align: 'right' });
    const cx = right - tw(gold, 'fineb') - 4.5;
    coin(ctx, cx, r.y + 2.5);
    txt(ctx, right, r.y + 9, WEATHER_WORD[weather] || titleCase(weather), 'xs', '#8a8272', { align: 'right' });
  }

  // --- quest compass ------------------------------------------------------

  /** The tracked quest, its current step and the objective wrapped to two lines at most. */
  _questLines(st) {
    const q = trackedQuest(st);
    if (!q) return null;
    const step = currentStep(q);
    const line = step ? objectiveText(step) : 'Return to the one who sent you.';
    const c = this._qlCache;
    if (c && c.line === line) return { q, step, lines: c.lines };
    let lines;
    try { lines = UI.wrapLines(line, QUEST.w - 19.5, 'fine', undefined, 2); } catch (e) { lines = [line]; }
    if (lines.length > 2) lines = [lines[0], fit(lines.slice(1).join(' '), QUEST.w - 19.5, 'fine')];
    this._qlCache = { line, lines };
    return { q, step, lines };
  }

  _drawQuest(ctx, r, st) {
    const ql = this._questLines(st);
    if (!ql) return;
    const { q, step, lines } = ql;
    const hover = this._hover === 'hud.quest';
    frame(ctx, r.x, r.y, r.w, r.h, { tone: hover ? 'gilt' : null });
    const goal = this._goal;
    const pl = this.scene && this.scene.player;
    const tx = r.x + 17, tw2 = r.w - 19.5;

    // The needle: a little brass compass pointing at the goal, or the quest
    // seal when the goal is not somewhere the HUD can point.
    let dist = null, wind = '';
    if (goal && goal.here && pl) {
      const dx = goal.x + 0.5 - pl.px / TILE, dy = goal.y + 0.5 - pl.py / TILE;
      const ang = Math.atan2(dy, dx);
      // The needle swings to a new heading on a damped spring, as a real one
      // settles, rather than snapping.
      const dt = clamp(Game.dt || 0, 0, 0.1);
      if (this._na == null) { this._na = ang; this._nv = 0; }
      const d = Math.atan2(Math.sin(ang - this._na), Math.cos(ang - this._na));
      this._nv += (d * 70 - this._nv * 9) * dt;
      this._na += this._nv * dt;
      const k = ((Math.round(this._na / (Math.PI / 8)) % 16) + 16) % 16;
      blit(ctx, cached(`needle:${k}`, 14, 14, (g) => paintNeedle(g, k)), r.x + 1.5, r.y + snap((r.h - 14) / 2));
      dist = Math.round(Math.max(Math.abs(dx), Math.abs(dy))) * 5;
      wind = WINDS[Math.round(((ang + Math.PI / 2) / (Math.PI / 4)) + 8) % 8];
    } else {
      const wy = r.y + snap((r.h - 13) / 2);
      well(ctx, r.x + 2, wy, 13, 13);
      safe(() => UI.icon(ctx, 'quest', r.x + 4, wy + 2, 9, GILT.base));
    }

    txt(ctx, tx, r.y + 2.5, fit(q.title || 'Untitled Task', tw2, 'fineb'), 'fineb', GILT.hi);
    lines.forEach((s, i) => txt(ctx, tx, r.y + 8 + i * 5, s, 'fine', step ? '#e8dcc0' : C('green')));
    const ly = r.y + 14 + (lines.length - 1) * 5;

    // The last line: how far and which way, what it goes through, and a count.
    const count = step ? Math.max(1, step.count || 1) : 1;
    const counter = step && count > 1 ? `${clamp(step.progress || 0, 0, count)}/${count}` : '';
    let where = '';
    if (dist != null) where = dist <= 5 ? 'here' : `${dist} ft ${wind}`;
    if (goal && goal.via) where += `${where ? ' · ' : ''}via ${goal.via}`;
    else if (goal && !goal.here && goal.label) where = `toward ${goal.label}`;
    const cw = counter ? tw(counter, 'xs') + 3 : 0;
    if (where) txt(ctx, tx, ly, fit(where, tw2 - cw, 'xs'), 'xs', '#a89a7c');
    if (counter) txt(ctx, r.x + r.w - 2.5, ly, counter, 'xs', GILT.base, { align: 'right' });
  }

  // --- minimap ------------------------------------------------------------

  _drawMinimap(ctx, r) {
    const pl = this.scene && this.scene.player;
    const R = Math.floor(Math.min(r.w, r.h) / 2);
    drawMinimap(ctx, r.x, r.y, R, {
      map: this.map,
      player: pl ? { px: pl.px, py: pl.py, dir: pl.dir } : null,
      entities: this._ents(),
      markers: this._markers(),
      goal: this._goal,
      zoom: this._zoom(),
      t: this.t,
    });
    // The compass rose's letters, on the rim: north in rubric, the rest in gilt.
    const cx = r.x + R, cy = r.y + R;
    txt(ctx, cx, r.y - 3.5, 'N', 'fineb', RUBRIC.hi, { align: 'center', keyline: '#0a0705' });
    if (this._hover === 'hud.minimap') {
      const z = this._zoom();
      const label = `${z >= 1 ? '×' + z : '×½'}  click to zoom`;
      const w = tw(label, 'xs') + 5;
      // Below the roundel, or above it when that would run off the screen.
      const ly = r.y + r.h + 6 <= VIEW_H - 1 ? r.y + r.h : r.y - 11;
      frame(ctx, cx - w / 2, ly, w, 6, { alpha: 0.9 });
      txt(ctx, cx, ly + 1.5, label, 'xs', C('ink'), { align: 'center' });
    }
    if (!this.map) txt(ctx, cx, cy - 2, 'no map', 'fine', 'rgba(154,145,127,0.6)', { align: 'center' });
    this._markerLabel(ctx, r);
  }

  /** The live spell markers — never null. */
  _markers() {
    const m = this.markers;
    return Array.isArray(m) ? m.filter((k) => k && Number.isFinite(k.x) && Number.isFinite(k.y)) : [];
  }

  /** What the nearest spell pin is, spelled out above the roundel. */
  _markerLabel(ctx, r) {
    const list = this._markers();
    const pl = this.scene && this.scene.player;
    if (!list.length || !pl) return;
    const ox = pl.px / TILE, oy = pl.py / TILE;
    const cheb = (k) => Math.max(Math.abs(k.x - ox), Math.abs(k.y - oy));
    const near = list.slice().sort((a, b) => cheb(a) - cheb(b))[0];
    if (!near || !near.label) return;
    const line = `${near.label} ${Math.round(cheb(near)) * 5} ft`;
    const w = Math.min(100, tw(line, 'fine') + 9);
    const x = clamp(r.x + r.w - w, 2, VIEW_W - 2 - w), y = Math.max(2, r.y - 13);
    frame(ctx, x, y, w, 8);
    ctx.fillStyle = near.color || '#9a6ae0';
    ctx.fillRect(snap(x + 2.5), snap(y + 3), 2, 2);
    txt(ctx, x + 6, y + 2.5, fit(line, w - 8, 'fine'), 'fine', C('ink'));
  }

  // --- the log ------------------------------------------------------------

  _drawLog(ctx, r) {
    if (!this.log.length) return;
    // Newest at the bottom; every entry wraps to at most two lines.
    const rows = [];
    for (const l of this.log) {
      if (!l.lines) {
        let lines;
        try { lines = UI.wrapLines(l.text, r.w - 7, 'fine', undefined, 2); } catch (e) { lines = [l.text]; }
        if (lines.length > 2) { lines = lines.slice(0, 2); lines[1] = fit(lines[1] + '…', r.w - 7, 'fine'); }
        l.lines = lines;
      }
      l.lines.forEach((s, i) => rows.push({ s, l, first: i === 0 }));
    }
    const shown = rows.slice(-LOG.lines);
    const y0 = r.y + r.h - shown.length * 5 - 1.5;
    scrim(ctx, r.x - 1, y0 - 1.5, r.w + 12, shown.length * 5 + 3, 0.62);
    const a = ctx.globalAlpha;
    shown.forEach((row, i) => {
      const age = row.l.t;
      ctx.globalAlpha = a * (age > LOG.life - 0.8 ? clamp((LOG.life - age) / 0.8, 0, 1) : 1) * clamp(age / 0.15, 0, 1);
      const y = y0 + i * 5;
      if (row.first) { ctx.fillStyle = logColor(row.l.kind); ctx.fillRect(snap(r.x + 1), snap(y + 1), 1.5, 1.5); }
      txt(ctx, r.x + 4.5, y, row.s, 'fine', '#eadfc6', { shadow: 'rgba(0,0,0,0.6)' });
    });
    ctx.globalAlpha = a;
  }

  // --- toasts (on 'overlay') -------------------------------------------------

  /**
   * The toasts, on the 'overlay' layer so they read above the world, its
   * readouts and the HUD. The overworld calls this from drawUI while it is the
   * top scene; under a menu or a conversation nothing calls it, so the toasts
   * wait, un-aged, and come up when you are back in the world.
   */
  drawToasts(ctx) {
    if (!this.toasts.length || !Layout.visible('hud.toasts')) return;
    this._syncDialogue();
    if (this._dialogue || !this.visible || this.hidden) return;
    const dt = clamp(Game.dt || 0, 0, 0.1);
    const r = Layout.rect('hud.toasts');
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      const t = this.toasts[i];
      t.t += dt;
      if (t.t >= t.life) this.toasts.splice(i, 1);
    }
    const step = TOAST.h + TOAST.gap;
    const shown = this._toastRects = [];
    for (let i = 0; i < this.toasts.length; i++) {
      const t = this.toasts[i];
      const target = i * step;
      t.slot = t.slot < 0 ? target : approach(t.slot, target, dt * 90);
      const inT = clamp(t.t / TOAST.slide, 0, 1);
      const outT = t.t > t.life - 0.5 ? clamp((t.life - t.t) / 0.5, 0, 1) : 1;
      const ease = 1 - (1 - inT) * (1 - inT);
      const hasMark = !!t.mark;
      const label = fit(t.text, r.w - (hasMark ? 14 : 8), 'fine');
      const w = snap(Math.max(40, tw(label, 'fine') + (hasMark ? 14 : 8)));
      // Hug whichever side of the screen the notices were put on; centred in
      // the middle third. They slide in from that side.
      const side = r.x + r.w / 2 > VIEW_W * 0.66 ? 1 : r.x + r.w / 2 < VIEW_W * 0.33 ? -1 : 0;
      const x0 = side > 0 ? r.x + r.w - w : side < 0 ? r.x : r.x + r.w / 2 - w / 2;
      const x = snap(x0 + side * (1 - ease) * 10);
      const y = snap(r.y + t.slot - (side ? 0 : (1 - ease) * 6));
      shown.push({ x: x - 1, y: y - 1, w: w + 2, h: TOAST.h + 2 });
      ctx.save();
      ctx.globalAlpha = ease * outT;
      frame(ctx, x, y, w, TOAST.h, { alpha: 0.95 });
      const accent = t.color || kindColor(t.kind);
      ctx.fillStyle = accent;
      ctx.fillRect(x + 1, y + 1, 1, TOAST.h - 2);
      let tx = x + 3.5;
      if (hasMark) { toastMark(ctx, t.mark, tx, y + 1, accent); tx += 7; }
      txt(ctx, tx, y + 2.5, label, 'fine', '#f2e8d0');
      ctx.restore();
    }
  }

  // --- barks (on 'world-ui') -----------------------------------------------

  /** Speech bubbles, kept clear of every visible HUD widget and the interact hint. */
  drawBarks(ctx, cam) {
    // Last frame's toasts and banner: they are drawn after the world, so this
    // frame's are not placed yet, and a frame late is invisible.
    const avoid = Object.values(this._rectsNow || {});
    if (this._hint) avoid.push(this._hint);
    if (this.toasts.length && this._toastRects) avoid.push(...this._toastRects);
    if (this._bannerRect) avoid.push(this._bannerRect);
    if (this._exitRect) avoid.push(this._exitRect);
    safe(() => drawBarks(ctx, cam, avoid, clamp(Game.dt || 0, 0, 0.1)));
  }

  // --- the place banner ---------------------------------------------------

  /**
   * A heraldic banner unfurling from a gilt rod with the place name in the
   * display face; its field is the tincture of the kind of place (gules for a
   * town, vert for the wild, azure for a city or the coast, sable underground).
   * b: { text, sub, t } from the overworld; it lives 3.2 s.
   */
  drawBanner(ctx, b, map) {
    this._bannerRect = null;
    if (!b || !Layout.visible('hud.banner')) return;
    const at = Layout.rect('hud.banner');
    const T = 3.2;
    const unroll = b.t < 0.4 ? easeOut(b.t / 0.4) : b.t > T - 0.5 ? clamp((T - b.t) / 0.5, 0, 1) : 1;
    const fade = b.t > T - 0.35 ? clamp((T - b.t) / 0.35, 0, 1) : clamp(b.t / 0.12, 0, 1);
    if (unroll <= 0.02 || fade <= 0.02) return;
    const name = String(b.text || '');
    const size = tw(name, 'title') > at.w - 28 ? 'lgb' : 'title';
    const tw0 = Math.min(at.w - 28, tw(name, size));
    const w = Math.round(Math.max(72, tw0 + 28));
    const full = b.sub ? 30 : 25;
    const h = Math.max(6, Math.round(full * unroll));
    const cx = at.x + at.w / 2;
    const x = Math.round(cx - w / 2), y = at.y + 2;
    this._bannerRect = { x: x - 4, y: y - 4, w: w + 8, h: h + 5 };
    ctx.save();
    ctx.globalAlpha = fade;
    safe(() => UI.panel(ctx, x, y, w, h, { style: 'banner', color: tinctureOf(map) }));
    // The lettering is uncovered by the cloth as it drops, never drawn past it.
    const body = h - Math.max(3, Math.min(8, Math.round(h / 5)));
    ctx.beginPath(); ctx.rect(x, y, w, body); ctx.clip();
    safe(() => UI.text(ctx, cx, y + 5, fit(name, w - 20, size), { size, gilt: true, align: 'center' }));
    if (b.sub) txt(ctx, cx, y + 17.5, String(b.sub).toUpperCase(), 'xs', '#f0d8c0', { align: 'center' });
    ctx.restore();
  }
}

// ===========================================================================
// helpers
// ===========================================================================

function safe(fn, fb) { try { const v = fn(); return v === undefined ? fb : v; } catch (e) { return fb; } }

const reported = new Set();
function reportOnce(id, e) {
  if (reported.has(id)) return;
  reported.add(id);
  console.warn(`[hud] ${id} failed to draw:`, e);
}

const easeOut = (k) => 1 - (1 - clamp(k, 0, 1)) ** 3;

/**
 * HP colour by remaining fraction: green, amber, red. Deliberately not the
 * kit's arterial red — a bar that is red at full health cannot say who is in
 * trouble at a glance, which is the whole point of the strip.
 */
function hpColor(m) {
  const pct = clamp((m.hp || 0) / Math.max(1, m.maxHp || 1), 0, 1);
  if (pct <= 0) return '#5a3a38';
  if (pct <= 0.25) return '#e04a34';
  if (pct <= 0.5) return '#e0a03a';
  return '#4fbf5a';
}

function logColor(kind) {
  switch (kind) {
    case 'damage': case 'crit': return '#d4553f';
    case 'heal': return '#6fc36a';
    case 'quest': return GILT.base;
    case 'loot': case 'item': return '#6aa8e8';
    case 'warn': case 'fail': return '#c08a3a';
    default: return '#8a7a5a';
  }
}

function kindColor(kind) {
  switch (kind) {
    case 'gold': return GILT.base;
    case 'quest': return GILT.hi;
    case 'level': return '#e3b34a';
    case 'party': return '#6aa8e8';
    case 'item': return '#88c89b';
    case 'warn': case 'crime': return '#d4553f';
    default: return GILT.mid;
  }
}

// Old callers pass the HUD's 5x5 mark names; the kit's icon names read better
// on the fine grid, so the familiar ones are translated.
const MARK_TO_ICON = { scroll: 'quest', person: 'helm', sword: 'sword', coin: 'coin', star: 'star', skull: 'skull', heart: 'heart', shield: 'shield' };

function toastMark(ctx, name, x, y, color) {
  const icon = MARK_TO_ICON[name] || name;
  if (UI.iconNames && UI.iconNames.includes(icon)) {
    safe(() => UI.icon(ctx, icon, snap(x), snap(y), 6, color));
    return;
  }
  mark(ctx, name, x + 0.5, y + 1, color, 0.5);
}

/** A gilt coin on the fine grid. */
function coin(ctx, x, y) {
  x = snap(x); y = snap(y);
  ctx.fillStyle = '#1a0f06'; ctx.fillRect(x, y - 0.5, 3, 4); ctx.fillRect(x - 0.5, y, 4, 3);
  ctx.fillStyle = GILT.base; ctx.fillRect(x + 0.5, y, 2, 3); ctx.fillRect(x, y + 0.5, 3, 2);
  ctx.fillStyle = GILT.hi; ctx.fillRect(x + 0.5, y + 0.5, 1, 1);
  ctx.fillStyle = GILT.lo; ctx.fillRect(x + 1.5, y + 1.5, 1, 1);
}

const WEATHER_WORD = { clear: 'Clear', rain: 'Rain', storm: 'Storm', snow: 'Snow', fog: 'Fog', ash: 'Ashfall', cloudy: 'Overcast' };
const WINDS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const PHASE_WORD = { night: 'night', dawn: 'dawn', morning: 'morning', afternoon: 'afternoon', dusk: 'dusk' };

/** The sky's colour at `time` (minutes): night, dawn, day, dusk, blended. */
function skyAt(time) {
  const keys = [[0, [22, 28, 64]], [300, [30, 36, 78]], [390, [200, 130, 108]], [480, [110, 160, 208]],
    [960, [110, 160, 208]], [1110, [176, 92, 118]], [1230, [30, 36, 78]], [1440, [22, 28, 64]]];
  const m = ((time % 1440) + 1440) % 1440;
  for (let i = 1; i < keys.length; i++) {
    if (m > keys[i][0]) continue;
    const [t0, a] = keys[i - 1], [t1, b] = keys[i];
    const k = (m - t0) / Math.max(1, t1 - t0);
    return `rgb(${a.map((v, j) => Math.round(v + (b[j] - v) * k)).join(',')})`;
  }
  return 'rgb(22,28,64)';
}

/**
 * The clock's dial, in device px (26 across): a round window on the sky with
 * the sun or moon riding an arc above a dark horizon, under a gilt ring, with
 * the weather laid over it.
 */
function paintDial(g, time, weather) {
  const c = 13, r = 12;
  disc(g, c, c, r, skyAt(time));
  const m = ((time % 1440) + 1440) % 1440;
  const night = m < 330 || m > 1170;
  if (night) {
    g.fillStyle = 'rgba(255,250,230,0.8)';
    for (const [sx, sy] of [[7, 7], [16, 5], [19, 10], [10, 4], [5, 11]]) g.fillRect(sx, sy, 1, 1);
  }
  // Sun by day, moon by night, both on the same arc: noon (or midnight) at the top.
  const k = night ? ((m + 720) % 1440) / 1440 : m / 1440;
  const a = k * Math.PI * 2;
  const bx = c - Math.sin(a) * 8.5, by = c + Math.cos(a) * 8.5 + 1;
  if (night) {
    disc(g, bx, by, 3, '#e8ecf8');
    disc(g, bx + 1.5, by - 1, 2.6, skyAt(time));
  } else {
    disc(g, bx, by, 3.6, 'rgba(255,220,120,0.35)');
    disc(g, bx, by, 2.6, '#ffd862');
    g.fillStyle = '#fff4c0'; g.fillRect(Math.round(bx) - 1, Math.round(by) - 1, 1, 1);
  }
  // Weather over the sky.
  if (weather === 'rain' || weather === 'storm') {
    disc(g, c - 3, 8, 4.5, weather === 'storm' ? '#4a4e60' : '#8a90a4'); disc(g, c + 3, 8.5, 4, weather === 'storm' ? '#40445a' : '#7a8096');
    g.fillStyle = '#9ac0f0';
    for (const [sx, sy] of [[8, 13], [12, 14], [16, 13], [10, 16], [14, 17]]) g.fillRect(sx, sy, 1, 2);
    if (weather === 'storm') { g.fillStyle = '#ffe86a'; g.fillRect(14, 11, 1, 3); g.fillRect(13, 13, 1, 2); }
  } else if (weather === 'snow') {
    disc(g, c - 2, 8, 4.5, '#b8bccb'); disc(g, c + 3, 8.5, 4, '#a8aebf');
    g.fillStyle = '#ffffff';
    for (const [sx, sy] of [[8, 14], [13, 13], [17, 15], [11, 17]]) g.fillRect(sx, sy, 1, 1);
  } else if (weather === 'fog' || weather === 'cloudy' || weather === 'ash') {
    g.fillStyle = weather === 'ash' ? 'rgba(150,130,120,0.7)' : 'rgba(210,214,222,0.55)';
    g.fillRect(3, 9, 20, 2); g.fillRect(5, 13, 16, 2);
  }
  // The horizon: dark hills across the lower third.
  g.fillStyle = '#1e1a14';
  for (let x = 0; x < 26; x++) {
    const hy = 17 + Math.round(1.2 * Math.sin(x * 0.55) + 0.8 * Math.sin(x * 1.3));
    g.fillRect(x, hy, 1, 26 - hy);
  }
  // Trim to the round window in ONE composite: under destination-in every
  // separate fill would erase everything outside itself.
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(cached('dial-mask', 13, 13, (mk) => disc(mk, c, c, r, '#000')), 0, 0);
  g.globalCompositeOperation = 'source-over';
  ring(g, c, c, r - 1.5, r + 0.5, GILT.hi, GILT.lo);
  ring(g, c, c, r - 2.2, r - 1.5, 'rgba(8,6,4,0.7)');
}

/**
 * The quest compass, in device px (28 across): a brass ring round a dark face,
 * a needle in rubric pointing to direction k (sixteenths of a turn, 0 = east,
 * clockwise as the screen runs), an ivory tail and a gilt pin.
 */
function paintNeedle(g, k) {
  const c = 14, r = 12.5;
  disc(g, c, c, r + 1, '#0a0705');
  disc(g, c, c, r, '#2a2018');
  disc(g, c, c, r - 3, '#1a1410');
  ring(g, c, c, r - 1.5, r, GILT.hi, GILT.lo);
  g.fillStyle = 'rgba(242,210,122,0.55)';
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2;
    g.fillRect(Math.round(c + Math.cos(a) * (r - 3.5)), Math.round(c + Math.sin(a) * (r - 3.5)), 1, 1);
  }
  const a = (k / 16) * Math.PI * 2;
  const ux = Math.cos(a), uy = Math.sin(a), vx = -uy, vy = ux;
  // The needle is a lozenge: widest a little behind the pin, narrowing to the tip.
  for (let t = -6; t <= 9; t += 0.5) {
    const half = t >= 0 ? Math.max(0, 1.6 * (1 - t / 9)) : Math.max(0, 1.6 * (1 + t / 6));
    for (let s = -half; s <= half; s += 0.5) {
      const x = c + ux * t + vx * s, y = c + uy * t + vy * s;
      g.fillStyle = t >= 0 ? (s < 0 ? '#e0503a' : '#a8281e') : (s < 0 ? '#efe6d0' : '#a89e8a');
      g.fillRect(Math.round(x - 0.5), Math.round(y - 0.5), 1, 1);
    }
  }
  g.fillStyle = GILT.hi; g.fillRect(c - 1, c - 1, 2, 2);
  g.fillStyle = GILT.lo; g.fillRect(c, c, 1, 1);
}

/** The heraldic tincture for a map, by what kind of place it is. */
function tinctureOf(map) {
  const b = String((map && (map.biome || map.meta?.biome)) || '');
  const k = String((map && (map.kind || map.meta?.kind)) || '');
  if (/dungeon|crypt|cave|mine|underdark|ruins/.test(b) || /dungeon|cave|ruins/.test(k)) return '#2e2a30';
  // A TileMap carries biome and music but not the catalogue's kind; its
  // music says whether a 'city' biome is a market town or a great city.
  const mus = String((map && map.music) || '');
  if (k === 'interior' || (map && map.indoor)) return '#6a3a1e';
  if (k === 'town' || k === 'village' || /town|village/.test(mus)) return '#9a2a20';
  if (/coast|city/.test(b) || k === 'city') return '#28408a';
  if (/forest|marsh|plains|road|hills|wild/.test(b) || k === 'wild' || k === 'road') return '#2e6a3a';
  if (/mountain|tundra|snow/.test(b)) return '#4a5a78';
  if (/ash/.test(b)) return '#6a2a1e';
  if (map && map.indoor) return '#6a3a1e';
  return '#9a2a20';
}

/**
 * The item catalogue is only used to put a pretty name on a pickup toast, so
 * it is pulled in lazily: a half-authored data barrel must never be the reason
 * the HUD fails to load. Until then toasts fall back to the title-cased id.
 */
let ITEM_LOOKUP = null;
import('../data/items.js').then((m) => { if (m && typeof m.resolveItem === 'function') ITEM_LOOKUP = m.resolveItem; }).catch(() => {});
// The XP hairline on each card, loaded late for the same reason.
let PROG = null;
import('../rules/progression.js').then((m) => { PROG = m; }).catch(() => {});

function safeItem(id) {
  if (!ITEM_LOOKUP) return null;
  try { return ITEM_LOOKUP(id); } catch (e) { return null; }
}

const PRETTY = (s) => titleCase(String(s || '').replace(/-/g, ' '));

/** Turn a quest step into one short line of plain English. */
function objectiveText(step) {
  if (!step) return 'Objective';
  if (step.text) return String(step.text);
  if (step.desc) return String(step.desc);
  const t = step.target ? PRETTY(step.target) : '';
  switch (step.kind) {
    case 'kill': return t ? `Defeat ${t}` : 'Defeat your quarry';
    case 'boss': return t ? `Slay ${t}` : 'Slay the beast';
    case 'fetch': case 'collect': return t ? `Recover ${t}` : 'Recover the goods';
    case 'deliver': return t ? `Deliver ${t}` : 'Make the delivery';
    case 'talk': return t ? `Speak with ${t}` : 'Find someone to talk to';
    case 'escort': return t ? `Escort ${t}` : 'See them home safely';
    case 'reach': case 'goto': case 'travel': return t ? `Travel to ${t}` : 'Travel on';
    case 'clear': return t ? `Clear ${t}` : 'Clear the lair';
    case 'explore': return t ? `Explore ${t}` : 'Explore';
    case 'flag': case 'event': return t || 'Follow the trail';
    default: return t ? `${PRETTY(step.kind || 'Objective')}: ${t}` : PRETTY(step.kind || 'Objective');
  }
}

export default HUD;
