// ui/standoff.js — the parley scene: meeting a group on the road, and deciding what happens next.
//
// Walking up to a toll post, being hailed by a caravan or catching a goblin band in
// the open opens this card before any steel is drawn. It shows who they are and why
// they are here (rules/encounters.js wrote that), what they want, and every option
// the situation allows, each with the check it will cost. Choosing one rolls a real
// 2024 check and shows the d20; Heroic Inspiration may reroll a failure. The scene
// never changes the world itself beyond what applyResult() does to the state: when
// the standoff is over it hands its outcome ({ kind: 'fight' | 'pass' | 'rout' |
// 'retreat' }) to `onDone`, and the overworld moves the people and starts the fight.
//
// Drawn entirely with the UI kit so it wears whatever skin the interface has.

import { UI } from './kit.js';
import { Input } from '../core/input.js';
import { Audio } from '../core/audio.js';
import { Game } from '../engine.js';
import { VIEW_W, VIEW_H } from '../constants.js';
import { drawSprite, hasSprite } from '../render/sprites.js';
import { drawActor, drawCreaturePortrait } from '../render/actor.js';
import { drawTile } from '../render/tiles.js';
import {
  standoffOptions, resolveOption, applyResult, canReroll, rerollOption, noteMeeting, encounterState,
} from '../rules/encounters.js';

function safe(fn, fb) { try { return fn(); } catch (e) { return fb; } }
function sfx(name) { safe(() => Audio.sfx(name), false); }

// --- layout (logical px) ------------------------------------------------------
const PX = 22, PY = 12, PW = VIEW_W - 44, PH = VIEW_H - 24;
const PORT_X = PX + 10, PORT_Y = PY + 26, PORT_W = 44, PORT_H = 52;
const BODY_X = PX + 62, BODY_Y = PY + 38, BODY_W = PW - 74, BODY_LINES = 7, LINE_H = 9;
const OPT_Y = PY + 116, ROW_H = 11, OPT_ROWS = 7;
const ROLL_TIME = 0.95;

const ATTITUDE = {
  hostile: { label: 'Hostile', color: '#e8735c' },
  wary: { label: 'Wary', color: '#e8b23a' },
  indifferent: { label: 'Indifferent', color: '#cfc6ae' },
  friendly: { label: 'Friendly', color: '#8fd07a' },
};

const MEMORY_CHIPS = [
  ['spared', 'Remembers your mercy', '#8fd07a'],
  ['grudge', 'Holds a grudge', '#e8735c'],
  ['rescued', 'In your debt', '#8fc8f0'],
  ['yielded', 'You paid them before', '#e8b23a'],
  ['respect', 'Respects you', '#8fd07a'],
  ['cleared', 'Square with you', '#8fd07a'],
  ['friend', 'Friends of yours', '#8fd07a'],
  ['wanted', 'You are wanted', '#e8735c'],
  ['angry', 'Knows what you did', '#e8735c'],
];

/** The few characters an option's row can spare for its terms: "DC 15 dis", "70 gp". */
function shortTag(o) {
  const h = String(o.hint || '');
  if (!h) return '';
  if (/^[A-Z ]+$/.test(h)) return h;
  const parts = [];
  const dc = h.match(/DC (\d+)/);
  const vs = h.match(/vs (?:[A-Za-z]+ )?([+-]?\d+)/);
  if (dc) parts.push(`DC ${dc[1]}`); else if (vs) parts.push(`vs ${vs[1]}`);
  if (/\(ADV\)/.test(h)) parts.push('adv');
  if (/\(DIS\)/.test(h)) parts.push('dis');
  const gp = h.match(/(\d+) gp/);
  if (gp) parts.push(`${gp[1]} gp`);
  if (parts.length) return parts.join(' ');
  return h.length <= 14 ? h : '';
}

/** The whole of an option's terms, in words, for the footer. */
function termsOf(o) {
  const h = String(o.hint || '');
  if (h === 'ATTACK') return 'Starts a fight.';
  if (h === 'SURPRISE') return 'You attack first: they are Surprised.';
  if (h === 'SURPRISED') return 'They attack first: you are Surprised.';
  return h.replace(/\s*\(ADV\)/, ', with Advantage').replace(/\s*\(DIS\)/, ', with Disadvantage');
}

export class StandoffScene {
  /**
   * @param {object} inst  a rules/encounters.js instance
   * @param {object} opts  { st, ctx, mode: 'noticed'|'unnoticed'|'sprung'|'settled',
   *                         entity (the leader, for the portrait), onDone(out),
   *                         shopScene (the ShopScene class, for trade), beat }
   *
   * A `beat` (a roadside shrine, a snare line) uses the same card with its own
   * two choices: { title, text, label, run() -> { text, roll } }.
   */
  constructor(inst, opts = {}) {
    this.opaque = false;
    this.pausesBelow = true;
    this.uiLayer = true;
    this.id = 'standoff';

    this.inst = inst;
    this.opts = opts;
    this.st = opts.st || Game.state;
    this.ctx = opts.ctx || { party: { members: [] } };
    this.mode = opts.mode || 'noticed';
    this.beat = opts.beat || null;
    this.phase = 'choose';        // choose | roll | result
    this.index = 0;
    this.top = 0;
    this.t = 0;
    this.rollT = 0;
    this.result = null;
    this.applied = false;
    this.extra = [];
    this.out = null;              // what onDone receives
    this.footer = null;
    this.footerT = 0;
    this._closed = false;
    this.lines = this._openingLines();
    this.options = [];
    this._refresh();
  }

  enter() {
    safe(() => Input.flush());
    if (!this._met && this.inst && !this.beat) {
      this._met = true;
      safe(() => noteMeeting(this.st, this.inst, this.mode));
      sfx(this.mode === 'sprung' ? 'encounter' : 'open');
    }
    // Back from a trade: the conversation carries on where it stopped.
    if (this._trading) { this._trading = false; this.phase = 'choose'; this._refresh(); }
  }

  exit() { /* nothing to restore; the overworld resumes its own music */ }

  // --- content ------------------------------------------------------------------

  _openingLines() {
    if (this.beat) return [{ text: this.beat.text, color: UI.COLORS.ink }];
    const inst = this.inst;
    const out = [];
    const dim = UI.COLORS.inkDim;
    // Why you came looking: the lead or the news that put them on this road.
    if (inst.leadNote && this.mode !== 'settled') out.push({ text: inst.leadNote, color: UI.COLORS.gold });
    if (this.mode === 'unnoticed') {
      const spotted = safe(() => inst.spotted, null) || `You see them before they see you: ${inst.name.toLowerCase()}.`;
      out.push({ text: spotted, color: UI.COLORS.ink });
      if (inst.why) out.push({ text: inst.why, color: dim });
      return out;
    }
    if (this.mode === 'settled') {
      out.push({ text: inst.again || inst.opener, color: UI.COLORS.ink });
      if (inst.why) out.push({ text: inst.why, color: dim });
      return out;
    }
    if (inst.why) out.push({ text: inst.why, color: dim });
    if (inst.opener) out.push({ text: inst.opener, color: UI.COLORS.ink });
    if (this.mode === 'sprung') out.push({ text: 'Ambush! They have the drop on you.', color: '#e8735c' });
    return out;
  }

  _refresh() {
    if (this.beat) {
      this.options = [
        { id: 'act', label: this.beat.label, hint: this.beat.hint || '' },
        { id: 'walk', label: 'Walk on', hint: '' },
      ];
    } else {
      this.options = safe(() => standoffOptions(this.st, this.inst, this.ctx, this.mode), []) || [];
      if (!this.options.length) this.options = [{ id: 'leave', label: 'Go on your way', hint: '' }];
    }
    this.index = Math.max(0, this.options.findIndex((o) => !o.disabled));
    this.top = 0;
  }

  /** The rows the list shows in the current phase. */
  _rows() {
    if (this.phase === 'choose') return this.options;
    if (this.phase === 'roll') return [];
    if (this.result && !this.applied && safe(() => canReroll(this.st, this.result), false)) {
      return [
        { id: '_reroll', label: 'Call on Heroic Inspiration: roll again', hint: 'INSPIRATION' },
        { id: '_accept', label: 'Let it stand', hint: '' },
      ];
    }
    return [{ id: '_continue', label: this._continueLabel(), hint: '' }];
  }

  _continueLabel() {
    const k = this.result && this.result.outcome && this.result.outcome.kind;
    if (k === 'fight') return 'To arms!';
    if (k === 'pass' || k === 'rout') return 'Go on your way';
    if (k === 'retreat') return 'Fall back';
    return 'Continue';
  }

  // --- update -------------------------------------------------------------------

  update(dt) {
    this.t += dt;
    if (this.footerT > 0) { this.footerT -= dt; if (this.footerT <= 0) this.footer = null; }
    if (this._closed) return;
    if (this.phase === 'roll') {
      this.rollT += dt;
      const skip = Input.consume('confirm') || Input.consume('interact') || Input.consume('cancel');
      if (this.rollT >= ROLL_TIME || (skip && this.rollT > 0.2)) this.phase = 'result';
      return;
    }
    if (this.phase === 'result' && this.result && this.result.roll) this.rollT += dt;

    const rows = this._rows();
    if (!rows.length) return;
    if (Input.repeatConsume('up')) this._move(rows, -1);
    if (Input.repeatConsume('down')) this._move(rows, 1);
    for (let k = 0; k < 5; k++) {
      if (Input.consume(`tab${k + 1}`) && k < rows.length) { this.index = k; this._pick(rows); return; }
    }
    const m = Input.mouse;
    if (m && m.over) {
      const vis = Math.min(OPT_ROWS, rows.length);
      for (let r = 0; r < vis; r++) {
        const i = this.top + r;
        const ry = OPT_Y + r * ROW_H;
        if (m.x >= PX + 8 && m.x <= PX + PW - 8 && m.y >= ry && m.y < ry + ROW_H) {
          if (this.index !== i && !(rows[i] && rows[i].disabled)) { this.index = i; sfx('cursor'); }
          if (m.clicked) { m.clicked = false; this._pick(rows); return; }
          break;
        }
      }
    }
    if (Input.consume('confirm') || Input.consume('interact')) { this._pick(rows); return; }
    if (Input.consume('cancel')) this._cancel(rows);
  }

  _move(rows, d) {
    const n = rows.length;
    if (n < 2) return;
    let i = this.index;
    for (let s = 0; s < n; s++) { i = (i + d + n) % n; if (!rows[i].disabled) break; }
    if (i !== this.index) { this.index = i; sfx('cursor'); }
    if (this.index < this.top) this.top = this.index;
    if (this.index >= this.top + OPT_ROWS) this.top = this.index - OPT_ROWS + 1;
  }

  _cancel(rows) {
    if (this.phase !== 'choose') { this._pick(rows); return; }
    // Escape takes the quiet way out if there is one; an ambush has none.
    const quiet = ['leave', 'walk', 'refuse', 'flee'];
    for (const id of quiet) {
      const i = rows.findIndex((o) => o.id === id && !o.disabled);
      if (i >= 0) { this.index = i; this._pick(rows); return; }
    }
    sfx('error');
  }

  _say(text) { this.footer = text; this.footerT = 2.4; }

  _pick(rows) {
    const o = rows[this.index];
    if (!o) return;
    if (o.disabled) { sfx('error'); this._say(o.reason ? `You need ${o.reason}.` : 'Not now.'); return; }
    if (this.phase === 'result') { this._afterResult(o.id); return; }
    if (this.beat) { this._pickBeat(o.id); return; }

    sfx('select');
    const res = safe(() => resolveOption(this.st, this.inst, o.id, this.ctx), null);
    if (!res) { this._finish({ kind: 'pass' }); return; }
    this.result = res;
    this.applied = false;
    this.extra = [];
    if (res.outcome && res.outcome.kind === 'trade') {
      this._apply();
      this._trade(res.outcome.shop);
      return;
    }
    // A roll the player could take back is shown first and committed after; any
    // other result is the world's at once.
    if (!safe(() => canReroll(this.st, res), false)) this._apply();
    this.lines = this._resultLines();
    this.index = 0;
    this.top = 0;
    if (res.roll) { this.phase = 'roll'; this.rollT = 0; sfx('dice'); } else this.phase = 'result';
  }

  _apply() {
    if (this.applied || !this.result) return;
    this.applied = true;
    this.extra = safe(() => applyResult(this.st, this.inst, this.result, this.ctx), []) || [];
    this.lines = this._resultLines();
  }

  _resultLines() {
    const res = this.result;
    const out = [];
    if (!res) return out;
    if (res.roll && res.roll.text) {
      out.push({ text: res.roll.text, color: res.roll.success ? UI.COLORS.good : UI.COLORS.bad, roll: true });
    }
    for (const l of res.lines || []) out.push({ text: l, color: UI.COLORS.ink });
    for (const l of this.extra || []) out.push({ text: l, color: UI.COLORS.gold });
    return out;
  }

  _afterResult(id) {
    if (id === '_reroll') {
      sfx('select');
      const again = safe(() => rerollOption(this.st, this.inst, this.result, this.ctx), null);
      if (again) {
        this.result = again;
        this.applied = false;
        this._apply();
        this.lines = [{ text: 'Heroic Inspiration: you roll again.', color: UI.COLORS.gold }, ...this._resultLines()];
        this.phase = again.roll ? 'roll' : 'result';
        this.rollT = 0;
        if (again.roll) sfx('dice');
      }
      return;
    }
    this._apply();
    sfx('select');
    const k = this.result && this.result.outcome ? this.result.outcome.kind : 'menu';
    if (k === 'menu' || k === 'noticed') {
      if (k === 'noticed' || (this.mode === 'unnoticed' && !this.result.keepUnnoticed)) this.mode = 'noticed';
      this.phase = 'choose';
      this.result = null;
      this._refresh();
      return;
    }
    this._finish({ ...this.result.outcome, option: this.result.option, robbery: this.result.robbery });
  }

  _pickBeat(id) {
    if (id === 'walk') { sfx('back'); this._finish({ kind: 'pass', quiet: true }); return; }
    sfx('select');
    const res = safe(() => this.beat.run(), null) || { text: '' };
    this.result = { option: 'act', roll: res.roll || null, outcome: { kind: 'pass', quiet: true }, lines: [res.text].filter(Boolean) };
    this.applied = true;
    this.extra = [];
    this.lines = this._resultLines();
    this.index = 0;
    if (res.roll) { this.phase = 'roll'; this.rollT = 0; sfx('dice'); } else this.phase = 'result';
  }

  _trade(shop) {
    const Shop = this.opts.shopScene;
    if (!Shop || !shop) { this._say('They have nothing to sell.'); this.phase = 'choose'; return; }
    this._trading = true;
    safe(() => Game.push(new Shop(shop.id, { shop })));
  }

  _finish(out) {
    if (this._closed) return;
    this._closed = true;
    this.out = { ...out, mode: this.mode };
    out = this.out;
    const done = this.opts.onDone;
    if (Game.top === this) Game.pop();
    if (typeof done === 'function') safe(() => done(out), null);
  }

  // --- draw ---------------------------------------------------------------------

  draw(ctx) {
    UI.scrim(ctx, 0.38);
    const inst = this.inst;
    UI.panel(ctx, PX, PY, PW, PH, { style: this.mode === 'sprung' ? 'danger' : 'window' });

    // --- title and attitude ----------------------------------------------------
    const title = this.beat ? (this.beat.title || 'By the Roadside') : inst.name;
    safe(() => UI.heading(ctx, PX + 12, PY + 9, title, { size: 'title', color: UI.COLORS.ink }));
    let cx = PX + PW - 10;
    if (!this.beat) {
      const plea = inst.plea && inst.attitude !== 'hostile';
      const a = plea ? { label: 'In need', color: '#8fc8f0' } : (ATTITUDE[inst.attitude] || ATTITUDE.indifferent);
      const unseen = this.mode === 'unnoticed' ? { label: 'Unaware of you', color: '#8fd07a' } : null;
      for (const c of [a, unseen].filter(Boolean)) {
        const w = safe(() => UI.measure(c.label, 'sm'), 40) + 6;
        cx -= w;
        safe(() => UI.chip(ctx, cx, PY + 9, c.label, { color: c.color }));
        cx -= 4;
      }
    }
    safe(() => UI.divider(ctx, PX + 10, PY + 22, PW - 20, {}));

    // --- the leader ------------------------------------------------------------
    this._drawPortrait(ctx);
    if (!this.beat) {
      safe(() => UI.text(ctx, BODY_X, PY + 27, inst.leader.full || inst.name, {
        size: 'sm', color: UI.COLORS.gold, shadow: true, maxWidth: BODY_W,
      }));
      // What they remember of you, as small tags under the name.
      let mx = BODY_X;
      for (const [flag, label, color] of MEMORY_CHIPS) {
        if (!inst.flags || !inst.flags[flag]) continue;
        const w = safe(() => UI.measure(label, 'sm'), 40) + 6;
        if (mx + w > BODY_X + BODY_W) break;
        safe(() => UI.chip(ctx, mx, PORT_Y + PORT_H + 4, label, { color }));
        mx += w + 4;
      }
    }

    // --- the body: who, why, what was said, what the dice said ----------------
    let y = BODY_Y;
    let used = 0;
    for (const l of this.lines) {
      if (used >= BODY_LINES) break;
      if (l.roll && this.phase === 'roll') continue;     // the arithmetic waits for the die to land
      const lines = safe(() => UI.wrapLines(l.text, BODY_W, 'sm'), [l.text]) || [l.text];
      for (const s of lines) {
        if (used >= BODY_LINES) break;
        safe(() => UI.text(ctx, BODY_X, y, s, { size: 'sm', color: l.color || UI.COLORS.ink, shadow: true }));
        y += LINE_H;
        used++;
      }
      y += 2;
    }

    safe(() => UI.divider(ctx, PX + 10, OPT_Y - 6, PW - 20, {}));

    // --- the die: in the lower right, where the list is short after a roll ----
    const r = this.result && this.phase !== 'choose' ? this.result.roll : null;
    const showDie = !!r && r.kind !== 'save' && r.kind !== 'group';
    if (showDie) {
      const die = {
        natural: r.natural, total: r.total, mod: (r.mod || 0) + (r.bonus || 0), adv: r.adv, dis: r.dis,
        dc: r.kind === 'contest' ? null : r.dc,
        label: this.rollT > ROLL_TIME * 0.7 ? (r.success ? 'SUCCESS' : 'FAILURE') : null,
        labelColor: r.success ? UI.COLORS.good : UI.COLORS.bad,
      };
      safe(() => UI.diceRoll(ctx, PX + PW - 76, OPT_Y + 36, die, this.rollT));
    }

    // --- the options -------------------------------------------------------------
    // The row carries the words and a short tag (the DC, the price); the full
    // terms of the highlighted option are spelled out in the footer.
    const rows = this._rows();
    const vis = Math.min(OPT_ROWS, rows.length);
    const rowW = showDie ? PW - 170 : PW - 16;
    for (let k = 0; k < vis; k++) {
      const i = this.top + k;
      const o = rows[i];
      if (!o) break;
      const ry = OPT_Y + k * ROW_H;
      const sel = i === this.index;
      if (sel) safe(() => UI.highlight(ctx, PX + 8, ry - 1, rowW, ROW_H, { t: this.t }));
      const col = o.disabled ? UI.COLORS.disabled : o.danger ? '#f09a7a' : sel ? UI.COLORS.goldBright : UI.COLORS.ink;
      const num = i < 5 ? `${i + 1}` : ' ';
      const tag = shortTag(o);
      const tagW = tag ? safe(() => UI.measure(tag, 'sm'), 40) + 8 : 0;
      safe(() => UI.text(ctx, PX + 12, ry + 1, num, { size: 'sm', color: UI.COLORS.inkDim, shadow: true }));
      safe(() => UI.text(ctx, PX + 22, ry + 1, o.label, { size: 'sm', color: col, shadow: true, maxWidth: rowW - 18 - tagW }));
      if (tag) {
        const hc = o.danger ? '#e8735c' : o.disabled ? UI.COLORS.disabled : UI.COLORS.inkDim;
        safe(() => UI.text(ctx, PX + 8 + rowW - 4, ry + 1, tag, { size: 'sm', color: hc, align: 'right', shadow: true }));
      }
    }
    if (rows.length > OPT_ROWS) safe(() => UI.scrollbar(ctx, PX + PW - 7, OPT_Y, OPT_ROWS * ROW_H, this.top, OPT_ROWS, rows.length));

    // --- footer: the terms of the highlighted choice, or what the moment allows --
    const fy = PY + PH - 12;
    const keys = this.phase === 'choose' ? 'Z choose  X leave' : this.phase === 'roll' ? '' : 'Z continue';
    const keysW = keys ? safe(() => UI.measure(keys, 'sm'), 90) + 8 : 0;
    const sel = this.phase === 'choose' ? rows[this.index] : null;
    const terms = sel && sel.disabled && sel.reason ? `Needs ${sel.reason}.` : sel ? termsOf(sel) : '';
    const insp = !this.beat && safe(() => encounterState(this.st).inspiration > 0, false);
    const foot = this.footer || terms || (insp ? 'Inspired: you may reroll one failed check.' : '');
    if (foot) safe(() => UI.text(ctx, PX + 12, fy, foot, { size: 'sm', color: this.footer || !terms ? UI.COLORS.gold : UI.COLORS.inkDim, shadow: true, maxWidth: PW - 24 - keysW }));
    if (keys) safe(() => UI.text(ctx, PX + PW - 10, fy, keys, { size: 'sm', color: UI.COLORS.inkDim, align: 'right', shadow: true }));
  }

  _drawPortrait(ctx) {
    safe(() => UI.panel(ctx, PORT_X, PORT_Y, PORT_W, PORT_H, { style: 'inset' }));
    const e = this.opts.entity;
    const cx = PORT_X + (PORT_W >> 1), feet = PORT_Y + PORT_H - 3;
    ctx.save();
    ctx.beginPath();
    ctx.rect(PORT_X + 2, PORT_Y + 2, PORT_W - 4, PORT_H - 4);
    ctx.clip();
    let drawn = false;
    if(e?.monsterId)drawn=drawCreaturePortrait(ctx,e,PORT_X+2,PORT_Y+2,PORT_W-4,PORT_H-4);
    if (e && e.char) drawn = !!safe(() => drawActor(ctx, e.char, cx, feet, { dir: 'down', scale: 2, shadow: false }), false);
    if (!drawn && e && e.sprite && hasSprite(e.sprite)) drawn = !!safe(() => drawSprite(ctx, e.sprite, 'down-0', cx, feet, { scale: 2, shadow: false }), false);
    if (!drawn && e && e.tileId) { safe(() => drawTile(ctx, e.tileId, cx - 8, feet - 22, 0, 0, this.t), null); drawn = true; }
    if (!drawn) {
      // A beat or a group with no face: a lit waystone.
      ctx.fillStyle = '#5a5048'; ctx.fillRect(cx - 5, feet - 22, 10, 22);
      ctx.fillStyle = '#7a6e62'; ctx.fillRect(cx - 5, feet - 22, 10, 2);
      ctx.fillStyle = UI.COLORS.gold; ctx.fillRect(cx - 1, feet - 16, 2, 6);
    }
    ctx.restore();
  }
}

export default StandoffScene;
