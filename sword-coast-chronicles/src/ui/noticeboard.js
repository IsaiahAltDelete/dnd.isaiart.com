// ui/noticeboard.js — a town's notice board: the work people will pay for, and the proclamations the running events nail up (bounties, closures, market days, who holds the town).
//
// The board is the director's shop window. Everything posted in a town by
// anyone is here, with who is paying and where to find them; a posting can be
// taken straight off the board (the giver still wants the report). The
// proclamations are how a player who never talks to anyone still sees the
// world moving: the fever in the camp, the toll on the Trade Way, Shieldmeet.
// Drawn entirely with the UI kit, so it wears whatever theme is set.

import { Game } from '../engine.js';
import { Input } from '../core/input.js';
import { Audio } from '../core/audio.js';
import { toast } from '../core/events.js';
import { UI } from './kit.js';
import * as D from '../rules/worlddirector.js';
import { FACTION_CONTRACTS } from '../data/quests.js';
import { NPCS } from '../data/npcs.js';
import { mapMeta } from '../world/maps.js';
import { dateText } from '../constants.js';
import { setNoticeBoardHandler } from '../world/sites.js';

function safe(fn, fb) { try { const v = fn(); return v === undefined || v === null ? fb : v; } catch (e) { return fb; } }
const sfx = (n) => safe(() => Audio.sfx(n), null);
const titleCase = (s) => String(s || '').replace(/-/g, ' ').replace(/\b[a-z]/g, (c) => c.toUpperCase());
const npcName = (id) => (NPCS[id] && NPCS[id].name) || titleCase(id);
const townName = (id) => (id === 'baldurs-gate' ? "Baldur's Gate" : safe(() => mapMeta(id).name, null) || titleCase(id));

const X = 16, Y = 20, W = 368, H = 204;
const LIST_W = 152, ROW = 12, ROWS = 12;

export class NoticeBoardScene {
  constructor(town) {
    this.opaque = false;
    this.pausesBelow = true;
    this.uiLayer = true;
    this.id = 'noticeboard';
    this.town = town;
    this.index = 0;
    this.top = 0;
    this.t = 0;
    this.flash = null;
    this.flashT = 0;
    this._build();
  }

  _build() {
    const st = Game.state;
    const posts = safe(() => D.boardPostings(st, this.town), []);
    const notices = safe(() => D.boardNotices(st, this.town), []);
    this.entries = [
      ...posts.map((p) => ({ kind: 'post', p, label: p.def.title, icon: p.event ? 'seal' : 'quill' })),
      ...notices.map((n) => ({ kind: 'notice', n, label: n.title, icon: 'banner' })),
    ];
    if (this.index >= this.entries.length) this.index = Math.max(0, this.entries.length - 1);
  }

  enter() { safe(() => Input.flush(), null); sfx('open'); }
  exit() {}

  _take() {
    const e = this.entries[this.index];
    if (!e || e.kind !== 'post') { sfx('error'); return; }
    const q = safe(() => D.acceptQuest(Game.state, e.p.id), null);
    if (!q) { sfx('error'); this._say('Someone has already torn that one down.'); this._build(); return; }
    sfx('quest');
    toast(`Report to ${npcName(q.def.turnIn || q.def.giver)} when it is done.`, { kind: 'quest' });
    this._build();
  }

  _say(s) { this.flash = s; this.flashT = 2.6; }

  _close() { sfx('back'); if (Game.top === this) Game.pop(); }

  update(dt) {
    this.t += dt;
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.flash = null; }
    const n = this.entries.length;
    if (n) {
      if (Input.repeatConsume('up')) { this.index = (this.index - 1 + n) % n; sfx('cursor'); }
      if (Input.repeatConsume('down')) { this.index = (this.index + 1) % n; sfx('cursor'); }
    }
    const m = Input.mouse;
    if (m && m.clicked) {
      const lx = X + 10, ly = Y + 26;
      if (m.x >= lx && m.x < lx + LIST_W && m.y >= ly && m.y < ly + ROWS * ROW) {
        const i = this.top + Math.floor((m.y - ly) / ROW);
        if (i < n) { m.clicked = false; if (i === this.index) this._take(); else { this.index = i; sfx('cursor'); } }
      } else if (this._btn && m.x >= this._btn.x && m.x < this._btn.x + this._btn.w && m.y >= this._btn.y && m.y < this._btn.y + this._btn.h) {
        m.clicked = false; this._take();
      }
    }
    if (Input.consume('confirm') || Input.consume('interact')) this._take();
    if (Input.consume('cancel') || Input.consume('menu')) this._close();
  }

  draw(ctx) {
    const st = Game.state;
    UI.scrim(ctx, 0.5);
    UI.window(ctx, X, Y, W, H, `Notice Board — ${townName(this.town)}`, { style: 'timber' });
    UI.text(ctx, X + W - 10, Y + 10, st ? dateText(st.day) : '', { size: 'sm', color: UI.COLORS.inkDim, align: 'right', shadow: true });

    // --- the list: postings first (a seal on the ones the trouble of the day put there), then proclamations
    const lx = X + 10, ly = Y + 26;
    const res = UI.list(ctx, lx, ly, LIST_W, this.entries, this.index, { rows: ROWS, rowH: ROW, top: this.top, t: this.t,
      empty: 'Nothing posted.', style: 'inset' });
    this.top = res.top;

    // --- the sheet you are reading
    const dx = lx + LIST_W + 12, dw = X + W - 10 - dx;
    let y = Y + 26;
    const e = this.entries[this.index];
    this._btn = null;
    if (!e) {
      UI.textWrapped(ctx, dx, y, dw, 'Old nails and the corners of torn-down notices. Nobody in town needs anything done — or nobody is saying so in writing.', { size: 'sm', color: UI.COLORS.inkDim });
    } else if (e.kind === 'notice') {
      UI.heading(ctx, dx, y, e.n.title, { size: 'title', rule: Math.min(dw, 120) });
      y += 16;
      UI.textWrapped(ctx, dx, y, dw, e.n.text, { size: 'sm', color: UI.COLORS.ink, lineHeight: 9 });
    } else {
      const def = e.p.def;
      UI.heading(ctx, dx, y, def.title, { size: 'title', rule: Math.min(dw, 120) });
      y += 16;
      const r = UI.textWrapped(ctx, dx, y, dw, def.desc, { size: 'sm', color: UI.COLORS.ink, lineHeight: 9, maxLines: 7 });
      y += r.height + 5;
      const bd = def.faction && FACTION_CONTRACTS[def.faction];
      const pay = [def.rewards.gold ? `${def.rewards.gold} gp` : null, def.rewards.xp ? `${def.rewards.xp} XP` : null].filter(Boolean).join('  ·  ');
      UI.text(ctx, dx, y, pay, { size: 'sm', color: UI.COLORS.gold, shadow: true }); y += 10;
      UI.text(ctx, dx, y, `Ask ${npcName(def.giver)}${bd ? ` (${bd.name})` : ''}.`, { size: 'sm', color: UI.COLORS.inkDim, shadow: true, maxWidth: dw }); y += 10;
      for (const s of def.steps.slice(0, 4)) {
        UI.text(ctx, dx + 4, y, `• ${s.text}`, { size: 'sm', color: UI.COLORS.inkDim, shadow: true, maxWidth: dw - 4 });
        y += 9;
      }
      const bw = 70, bh = 16, bx = X + W - 10 - bw, by = Y + H - 26;
      const m = Input.mouse;
      const hover = !!(m && m.over && m.x >= bx && m.x < bx + bw && m.y >= by && m.y < by + bh);
      UI.button(ctx, bx, by, bw, bh, 'Take it', { style: 'seal', hover, selected: true });
      this._btn = { x: bx, y: by, w: bw, h: bh };
    }

    const fy = Y + H - 12;
    UI.keyHint(ctx, lx, fy - 2, 'E', 'Take');
    UI.keyHint(ctx, lx + 46, fy - 2, 'Esc', 'Leave');
    if (this.flash) UI.text(ctx, dx, Y + H - 20, this.flash, { size: 'sm', color: UI.COLORS.bad, shadow: true, maxWidth: dw - 80 });
  }
}

/** Reading a board pushes this scene (world/sites.js calls it). */
export function installNoticeBoard() {
  setNoticeBoardHandler((town) => Game.push(new NoticeBoardScene(town)));
}
