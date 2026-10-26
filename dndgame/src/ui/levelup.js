// ui/levelup.js — LevelUpScene and EpicBoonScene: the advancement flow.
//
// One character at a time, one level at a time:
//   1. BANNER   "Sildar Hallwinter reaches level 5!" — the sprite in a golden
//               pillar of light beside a before/after column (hit points,
//               proficiency bonus, armour class, hit dice, spell slots) and the
//               features this level unlocks. The "next" column is exact, not
//               guessed: it is read off a clone of the character with the class
//               level bumped and rules/character.js#recalc re-run.
//   2. CHOICES  everything rules/progression.js#pendingChoicesFor hands back —
//               subclass at 3, ASI-or-feat at 4/8/12/16/19, fighting styles,
//               Battle Master maneuvers, Eldritch Invocations (with the
//               swap-one-on-level-up rule), Metamagic, Expertise, cantrips,
//               spells, Weapon Mastery and hit points. Every option shows its
//               full rules text; anything you cannot take is greyed out and
//               says why.
//   3. APPLY    applyLevel(ch, level, picks) — the single source of truth.
//   4. SUMMARY  the returned log as "What you gained", beside the real
//               before/after numbers.
//
// EpicBoonScene runs the same machinery for the never-ending post-20 ladder:
// mythicChoicesFor / applyMythic, an Epic Boon out of data/backgrounds.js plus
// +1 to an ability with the ceiling lifted from 20 to 30.
//
// Layout is 400x240 logical pixels. All text goes through UI.* — never ctx.fillText.

import { UI } from './kit.js';
import { MK } from './menukit.js';
import { Input } from '../core/input.js';
import { Audio } from '../core/audio.js';
import { Game } from '../engine.js';
import { VIEW_W, VIEW_H, clamp, ordinal, signed, MAX_ABILITY, MAX_ABILITY_EPIC } from '../constants.js';
import { bus, EV } from '../core/events.js';
import { FX } from '../render/fx.js';
import { drawActor } from '../render/actor.js';
import { ABILITIES, ABILITY_NAMES, ABILITY_ABBR, mod as abMod } from '../rules/abilities.js';

import {
  pendingChoicesFor, applyLevel, profForLevel, className, subclassName,
  levelForXp, pendingLevelsFor, activeClassId, classLevelOf, classEntry, hitDieSize,
  mythicChoicesFor, applyMythic, mythicLevel, mythicTierInfo, pendingMythic,
  MANEUVERS, METAMAGIC, INVOCATIONS, featuresAtLevel,
} from '../rules/progression.js';
import { cloneChar, recalc, acOf, abilityScore } from '../rules/character.js';

const C = UI.COLORS;

// ===========================================================================
// 0. SAFETY & TINY HELPERS
//
// Several catalogues in this project are still being written by sibling agents.
// Nothing in this scene may throw because a table is missing — a level-up that
// crashes strands the player between a battle and the overworld.
// ===========================================================================

function safe(fn, fb) {
  try { const v = fn(); return v === undefined || v === null ? fb : v; } catch (e) { return fb; }
}
function sfx(name) { safe(() => Audio.sfx(name), false); }
const R = Math.round;
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const arr = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** Optional catalogues — loaded lazily so a missing file only costs a label. */
const LATE = { spells: null, items: null, subclasses: null, feats: null, classes: null };
safe(() => import('../data/spells.js').then((m) => { LATE.spells = m || false; }).catch(() => { LATE.spells = false; }));
safe(() => import('../data/items.js').then((m) => { LATE.items = m || false; }).catch(() => { LATE.items = false; }));
safe(() => import('../data/subclasses.js').then((m) => { LATE.subclasses = m || false; }).catch(() => { LATE.subclasses = false; }));
safe(() => import('../data/backgrounds.js').then((m) => { LATE.feats = m || false; }).catch(() => { LATE.feats = false; }));
safe(() => import('../data/classes.js').then((m) => { LATE.classes = m || false; }).catch(() => { LATE.classes = false; }));

const SPELLS = () => (LATE.spells && LATE.spells.SPELLS) || {};
const ITEMS = () => (LATE.items && LATE.items.ITEMS) || {};
const SUBCLASSES = () => (LATE.subclasses && LATE.subclasses.SUBCLASSES) || {};
const FEATS = () => (LATE.feats && LATE.feats.FEATS) || {};
const CLASSES = () => (LATE.classes && LATE.classes.CLASSES) || {};

/** Pull one id out of whatever shape a pick uses. */
function oneId(v) {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return oneId(v[0]);
  if (isObj(v)) return v.id || v.to || null;
  return null;
}

// ===========================================================================
// 1. CHOICE PRESENTATION TABLES
// ===========================================================================

const CHOICE_ICON = {
  class: 'crown', subclass: 'crown', asi: 'star', feat: 'star',
  fightingStyle: 'sword', maneuver: 'sword', mastery: 'sword',
  metamagic: 'rune', invocation: 'eye', expertise: 'check', skill: 'check',
  cantrip: 'book', spell: 'book', prepared: 'book',
  spellSwap: 'scroll', invocationSwap: 'scroll', metamagicSwap: 'scroll', maneuverSwap: 'scroll',
  wildShape: 'leaf', hp: 'heart', boon: 'holy', subclassOption: 'rune',
};

/** A choice whose answer is { from, to } rather than a plain id. */
function isSwap(choice) {
  return !!choice && (/Swap$/.test(String(choice.type || '')) || Array.isArray(choice.replacements));
}

// ===========================================================================
// 2. SNAPSHOTS — the before/after column
// ===========================================================================

/** Compact "1:4 2:3 3:2" spell-slot line, plus the Pact Magic row. */
function slotLine(ch) {
  const slots = ch?.spells?.slots || {};
  const bits = [];
  for (let l = 1; l <= 9; l++) {
    const s = slots[l];
    if (s && s.max > 0) bits.push(`${l}:${s.max}`);
  }
  return bits.join(' ');
}

function pactLine(ch) {
  const p = ch?.spells?.pact;
  if (!p || !p.max) return '';
  return `${p.max}x lvl ${p.level}`;
}

function hitDiceLine(ch) {
  const hd = ch?.hitDice || {};
  const bits = [];
  for (const k of Object.keys(hd).sort((a, b) => Number(b.slice(1)) - Number(a.slice(1)))) {
    if (hd[k] && hd[k].max) bits.push(`${hd[k].max}${k}`);
  }
  return bits.join(' ') || '—';
}

/** Every feature name the character currently owns, so we can diff them. */
function featureNames(ch) {
  const out = new Set();
  const classes = arr(ch?.classes);
  for (const c of classes) {
    const def = CLASSES()[c?.id];
    for (let l = 1; l <= (c?.level || 0); l++) {
      for (const f of arr(def?.features?.[l])) if (f?.name) out.add(f.name);
    }
    const sub = SUBCLASSES()[c?.subclassId];
    for (let l = 1; l <= (c?.level || 0); l++) {
      for (const f of arr(sub?.features?.[l])) if (f?.name) out.add(f.name);
    }
  }
  return out;
}

function snapshot(ch) {
  return {
    level: num(ch?.level, 1),
    maxHp: num(ch?.maxHp, 1),
    hp: num(ch?.hp, 0),
    prof: num(ch?.prof, safe(() => profForLevel(num(ch?.level, 1)), 2)),
    ac: safe(() => acOf(ch), num(ch?.ac, 10)),
    slots: slotLine(ch),
    pact: pactLine(ch),
    hitDice: hitDiceLine(ch),
    speed: num(ch?.speed, 30),
    scores: ABILITIES.reduce((o, ab) => { o[ab] = safe(() => abilityScore(ch, ab), num(ch?.base?.[ab], 10)); return o; }, {}),
    features: featureNames(ch),
  };
}

/**
 * The exact stats the character will have after taking one level in `classId`,
 * computed on a throwaway clone so nothing here can corrupt the real sheet.
 * Hit points use the fixed average (a rolled die is shown for real in the
 * summary once applyLevel has actually rolled it).
 */
function project(ch, classId) {
  return safe(() => {
    const cl = cloneChar(ch);
    cl.classes = arr(cl.classes).map((c) => ({ ...c }));
    let entry = cl.classes.find((c) => c && c.id === classId);
    if (!entry) { entry = { id: classId, level: 0, subclassId: null }; cl.classes.push(entry); }
    entry.level = num(entry.level, 0) + 1;
    cl.level = cl.classes.reduce((a, c) => a + num(c?.level, 0), 0);
    // A subclass chosen this level is not known yet; the preview simply omits it.
    recalc(cl);
    return snapshot(cl);
  }, null);
}

/** The features this level actually unlocks, for the banner's preview list. */
function newFeaturesFor(ch, classId, newClassLevel) {
  const out = [];
  const rows = safe(() => featuresAtLevel(ch, classId, newClassLevel, classEntry(ch, classId)?.subclassId), []) || [];
  for (const row of rows) {
    const f = row && row.f;
    if (f && f.name) out.push({ name: f.name, desc: f.desc || '', source: row.source || '' });
  }
  return out;
}

// ===========================================================================
// 3. OPTION DETAIL TEXT
//
// Every option must be able to explain itself in full. These builders turn an
// option id into the rules text for the right-hand detail panel.
// ===========================================================================

/** Extra lines under an option's description, keyed by the choice type. */
function detailExtras(choice, option, ch) {
  const id = String(option?.id || '');
  const type = String(choice?.type || '');
  const out = [];

  if (type === 'subclass') {
    const sub = SUBCLASSES()[id];
    if (sub) {
      const feats = sub.features || {};
      const levels = Object.keys(feats).map(Number).sort((a, b) => a - b);
      if (levels.length) out.push({ head: 'Features by level' });
      for (const l of levels) {
        const names = arr(feats[l]).map((f) => f?.name).filter(Boolean).join(', ');
        if (names) out.push({ label: `${ordinal(l)}`, text: names });
      }
      const spells = sub.spells || {};
      const slv = Object.keys(spells).map(Number).sort((a, b) => a - b);
      if (slv.length) {
        out.push({ head: 'Always prepared' });
        for (const l of slv) {
          const names = arr(spells[l]).map((s) => SPELLS()[s]?.name || s).join(', ');
          if (names) out.push({ label: `${ordinal(l)}`, text: names });
        }
      }
    }
    return out;
  }

  if (type === 'asi' || type === 'feat' || type === 'boon') {
    const fid = id.replace(/^feat:/, '');
    const f = FEATS()[fid];
    if (f) {
      if (f.category) out.push({ label: 'Category', text: String(f.category).replace(/-/g, ' ') });
      if (f.prereq) {
        const p = f.prereq;
        const bits = [];
        if (p.level) bits.push(`level ${p.level}`);
        if (p.ability) for (const ab of Object.keys(p.ability)) bits.push(`${ABILITY_NAMES[ab] || ab} ${p.ability[ab]}`);
        if (p.feat) bits.push(`the ${FEATS()[p.feat]?.name || p.feat} feat`);
        if (p.class) bits.push(`a level in ${className(p.class)}`);
        if (p.spellcasting) bits.push('the Spellcasting or Pact Magic feature');
        if (p.prof) bits.push(`${p.prof} proficiency`);
        if (bits.length) out.push({ label: 'Requires', text: bits.join(', ') });
      }
      if (Array.isArray(f.asi) && f.asi.length) {
        out.push({ label: '+1 to', text: f.asi.map((a) => ABILITY_ABBR[a] || a).join(' / ') });
      }
      if (f.repeatable) out.push({ label: 'Repeatable', text: 'You may take this feat more than once.' });
    }
    return out;
  }

  if (type === 'cantrip' || type === 'spell' || type === 'prepared' || type === 'spellSwap') {
    const s = SPELLS()[id];
    if (s) {
      out.push({ label: 'Level', text: s.level ? `${ordinal(s.level)} — ${s.school || ''}` : `Cantrip — ${s.school || ''}` });
      const cast = [s.castTime || 'action'];
      if (s.ritual) cast.push('ritual');
      if (s.concentration) cast.push('concentration');
      out.push({ label: 'Casting', text: cast.join(', ') });
      const rng = s.range === 'self' ? 'Self' : s.range === 'touch' ? 'Touch'
        : (typeof s.range === 'number' ? `${s.range} ft` : String(s.range || '—'));
      out.push({ label: 'Range', text: `${rng} · ${s.duration || 'instant'}` });
      if (s.damage) out.push({ label: 'Damage', text: `${s.damage.dice} ${s.damage.type || ''}`.trim() });
      if (s.heal) out.push({ label: 'Heals', text: String(s.heal.dice || '') });
      if (s.save) out.push({ label: 'Save', text: `${(ABILITY_ABBR[s.save.ability] || s.save.ability)} — ${s.save.onSuccess || 'negate'} on a success` });
    }
    return out;
  }

  if (type === 'mastery') {
    const it = ITEMS()[id];
    if (it) {
      out.push({ label: 'Weapon', text: `${it.die || ''} ${it.dtype || ''}`.trim() || '—' });
      if (Array.isArray(it.props) && it.props.length) out.push({ label: 'Properties', text: it.props.join(', ') });
      if (it.mastery) out.push({ label: 'Mastery', text: String(it.mastery) });
    }
    return out;
  }

  if (type === 'maneuver' && MANEUVERS && MANEUVERS[id]?.cost) {
    out.push({ label: 'Cost', text: String(MANEUVERS[id].cost) });
  }
  if (type === 'metamagic' && METAMAGIC && METAMAGIC[id]?.cost != null) {
    out.push({ label: 'Sorcery points', text: String(METAMAGIC[id].cost) });
  }
  if (type === 'invocation' && INVOCATIONS && INVOCATIONS[id]?.prereq) {
    const p = INVOCATIONS[id].prereq;
    const bits = [];
    if (p.level) bits.push(`warlock level ${p.level}`);
    if (p.pact) bits.push(`Pact of the ${p.pact}`);
    if (p.spell) bits.push(`${SPELLS()[p.spell]?.name || p.spell}`);
    if (bits.length) out.push({ label: 'Requires', text: bits.join(', ') });
  }
  return out;
}

// ===========================================================================
// 4. GOLDEN PILLAR OF LIGHT
// ===========================================================================

class Pillar {
  constructor() { this.motes = []; this.acc = 0; }

  update(dt, cx, baseY) {
    this.acc += dt;
    while (this.acc > 0.055) {
      this.acc -= 0.055;
      if (this.motes.length < 42) {
        this.motes.push({
          x: cx + (Math.random() * 34 - 17),
          y: baseY - Math.random() * 6,
          v: 16 + Math.random() * 26,
          life: 0,
          dur: 1.1 + Math.random() * 0.9,
          s: Math.random() < 0.3 ? 2 : 1,
          sway: Math.random() * Math.PI * 2,
        });
      }
    }
    for (let i = this.motes.length - 1; i >= 0; i--) {
      const m = this.motes[i];
      m.life += dt;
      m.y -= m.v * dt;
      m.sway += dt * 3;
      if (m.life > m.dur) this.motes.splice(i, 1);
    }
  }

  draw(ctx, cx, baseY, t, height = 150) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // The shaft: two overlapping tapered gradients so the edges shimmer.
    for (let pass = 0; pass < 2; pass++) {
      const w = (pass ? 16 : 30) + Math.sin(t * (pass ? 4.3 : 2.7)) * 2;
      const g = ctx.createLinearGradient(0, baseY - height, 0, baseY);
      g.addColorStop(0, 'rgba(255,236,180,0)');
      g.addColorStop(0.30, pass ? 'rgba(255,244,205,0.18)' : 'rgba(255,214,120,0.13)');
      g.addColorStop(1, pass ? 'rgba(255,250,225,0.30)' : 'rgba(240,190,90,0.22)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(R(cx - w * 0.55), R(baseY - height));
      ctx.lineTo(R(cx + w * 0.55), R(baseY - height));
      ctx.lineTo(R(cx + w), R(baseY));
      ctx.lineTo(R(cx - w), R(baseY));
      ctx.closePath();
      ctx.fill();
    }

    // Ground pool.
    const pool = ctx.createRadialGradient(cx, baseY, 1, cx, baseY, 34);
    pool.addColorStop(0, 'rgba(255,236,175,0.42)');
    pool.addColorStop(1, 'rgba(255,190,80,0)');
    ctx.fillStyle = pool;
    ctx.fillRect(R(cx - 36), R(baseY - 14), 72, 28);

    for (const m of this.motes) {
      const k = m.life / m.dur;
      ctx.globalAlpha = Math.max(0, Math.sin(k * Math.PI)) * 0.9;
      ctx.fillStyle = m.s > 1 ? '#fff6d8' : C.gold;
      ctx.fillRect(R(m.x + Math.sin(m.sway) * 3), R(m.y), m.s, m.s);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}

// ===========================================================================
// 5. THE SHARED ADVANCEMENT SCENE
//
// LevelUpScene and EpicBoonScene differ only in what a "unit of advancement"
// is and how it is applied. Everything else — the banner, the choice pages,
// the ASI board, the dice, the summary — is shared.
// ===========================================================================

class AdvanceScene {
  constructor(chars, opts = {}) {
    this.id = 'levelup';
    this.opaque = true;
    this.pausesBelow = true;
    this.uiLayer = true;

    this.chars = arr(chars).filter(Boolean);
    this.opts = opts || {};
    this.onDone = typeof opts.onDone === 'function' ? opts.onDone : null;

    this.ci = 0;                 // which character
    this.phase = 'intro';        // intro | choice | hpRoll | summary | done
    this.t = 0;
    this.phaseT = 0;

    this.ch = null;
    this.before = null;
    this.after = null;
    this.preview = null;
    this.newLevel = 1;
    this.classId = null;
    this.picks = {};
    this.queue = [];
    this.qi = 0;
    this.log = [];

    // per-page cursor state
    this.index = 0;
    this.listTop = 0;
    this.selected = [];          // multi-pick working set
    this.detailScroll = 0;
    this.logScroll = 0;

    // swap sub-state
    this.swapFrom = null;

    // ASI board
    this.asiTab = 0;             // 0 = ability scores, 1 = feats
    this.asiAlloc = {};
    this.featAbility = null;     // pending "+1 to which ability?" sub-prompt

    // hit-die reveal
    this.dice = null;            // { sides, rolled, conMod, gain, t }

    this.pillar = new Pillar();
    this.msg = '';
    this.msgT = 0;
    this.rowRects = [];
    this.tabRects = [];
    this.btnRects = [];
    this._closed = false;
  }

  // --- lifecycle ---------------------------------------------------------

  enter() {
    safe(() => Input.flush());
    if (!this.chars.length) { this._finish(); return; }
    this._startUnit();
  }

  exit() {}

  _finish() {
    if (this._closed) return;
    this._closed = true;
    safe(() => FX.clear());
    if (this.onDone) safe(() => this.onDone(this.chars));
    if (Game.top === this) Game.pop();
  }

  say(text, bad = false, life = 2.6) {
    this.msg = String(text || '');
    this.msgT = life;
    if (bad) sfx('error');
  }

  // --- subclass hooks ----------------------------------------------------

  /* eslint-disable class-methods-use-this */
  _unitsLeft() { return 0; }
  _query() { return []; }
  _apply() { return []; }
  _bannerText() { return ''; }
  _subText() { return ''; }
  /* eslint-enable class-methods-use-this */

  /** Begin the next character, or the next level of the current one. */
  _startUnit() {
    // Advance past characters with nothing pending.
    while (this.ci < this.chars.length && this._unitsLeft(this.chars[this.ci]) <= 0) this.ci++;
    if (this.ci >= this.chars.length) { this._finish(); return; }

    this.ch = this.chars[this.ci];
    this.before = snapshot(this.ch);
    this.newLevel = num(this.ch.level, 1) + 1;
    this.classId = safe(() => activeClassId(this.ch), null) || arr(this.ch.classes)[0]?.id || null;
    this.picks = {};
    this.log = [];
    this.after = null;
    this.dice = null;
    this.preview = this._buildPreview();
    this.queue = this._query();
    this.qi = 0;
    this._resetPage();
    this.pillar = new Pillar();
    this.phase = 'intro';
    this.phaseT = 0;
    sfx('levelup');
    safe(() => FX.flash('rgba(255,225,150,0.55)', 0.35, 0.5));
  }

  _buildPreview() { return null; }

  _resetPage() {
    this.index = 0;
    this.listTop = 0;
    this.selected = [];
    this.detailScroll = 0;
    this.swapFrom = null;
    this.asiTab = 0;
    this.asiAlloc = {};
    this.featAbility = null;
    for (const ab of ABILITIES) this.asiAlloc[ab] = 0;
    // Land the cursor on the first option you can actually take.
    const c = this.choice;
    if (c) {
      const opts = this._optionRows(c);
      const first = opts.findIndex((o) => !o.disabled);
      this.index = first >= 0 ? first : 0;
    }
  }

  get choice() { return this.queue[this.qi] || null; }

  /** Rows for the current page — swaps show either side depending on stage. */
  _optionRows(choice) {
    if (!choice) return [];
    if (isSwap(choice) && this.swapFrom) return arr(choice.replacements);
    return arr(choice.options);
  }

  // =========================================================================
  // UPDATE
  // =========================================================================

  update(dt) {
    this.t += dt;
    this.phaseT += dt;
    if (this.msgT > 0) { this.msgT -= dt; if (this.msgT <= 0) this.msg = ''; }
    this.pillar.update(dt, 82, 196);

    if (this.phase === 'intro') this._updateIntro();
    else if (this.phase === 'choice') this._updateChoice();
    else if (this.phase === 'hpRoll') this._updateDice(dt);
    else if (this.phase === 'summary') this._updateSummary();
  }

  _updateIntro() {
    const m = Input.mouse;
    if (Input.consume('confirm') || Input.consume('interact') || (m && m.clicked)) {
      sfx('select');
      this._enterChoices();
    } else if (Input.consume('cancel')) {
      // Nothing to cancel out of — a level is not optional. Skip to the picks.
      sfx('select');
      this._enterChoices();
    }
  }

  _enterChoices() {
    if (!this.queue.length) { this._applyNow(); return; }
    this.phase = 'choice';
    this.phaseT = 0;
    this._resetPage();
  }

  // --- the choice pages ---------------------------------------------------

  _updateChoice() {
    const c = this.choice;
    if (!c) { this._applyNow(); return; }

    if (this.featAbility) { this._updateFeatAbility(); return; }
    if (c.type === 'asi' && !isSwap(c)) { this._updateAsi(c); return; }

    const rows = this._optionRows(c);
    const n = rows.length;
    const count = Math.max(1, num(c.count, 1));

    // detail-pane scrolling
    if (Input.repeatConsume('next', 0.3, 0.06)) this.detailScroll++;
    if (Input.repeatConsume('prev', 0.3, 0.06)) this.detailScroll = Math.max(0, this.detailScroll - 1);
    if (Input.mouse && Input.mouse.wheel && Input.mouse.x > 186) {
      this.detailScroll = Math.max(0, this.detailScroll + (Input.mouse.wheel > 0 ? 1 : -1));
    }

    if (n) {
      let moved = false;
      if (Input.repeatConsume('down')) { this.index = (this.index + 1) % n; moved = true; }
      if (Input.repeatConsume('up')) { this.index = (this.index - 1 + n) % n; moved = true; }
      if (Input.repeatConsume('right')) { this.index = Math.min(n - 1, this.index + 8); moved = true; }
      if (Input.repeatConsume('left')) { this.index = Math.max(0, this.index - 8); moved = true; }
      if (moved) { sfx('cursor'); this.detailScroll = 0; }
    }

    // mouse: hover selects, click confirms
    const m = Input.mouse;
    if (m) {
      for (const r of this.rowRects) {
        if (m.x >= r.x && m.x < r.x + r.w && m.y >= r.y && m.y < r.y + r.h) {
          if (r.i !== this.index) { this.index = r.i; this.detailScroll = 0; sfx('cursor'); }
          if (m.clicked) { m.clicked = false; this._pick(c, rows); }
          break;
        }
      }
    }

    if (Input.consume('confirm')) this._pick(c, rows);

    if (Input.consume('cancel')) {
      if (this.swapFrom) { this.swapFrom = null; this._resetSwapCursor(c); sfx('back'); return; }
      if (this.selected.length) { this.selected.pop(); sfx('back'); return; }
      if (c.optional) { sfx('back'); this._answer(c, 'none'); return; }
      this.say('This choice cannot be skipped.', true);
    }

    // `menu` finishes an optional or partially-filled multi-pick.
    if (Input.consume('menu')) {
      if (c.optional) { sfx('back'); this._answer(c, 'none'); }
      else if (this.selected.length) { sfx('select'); this._answer(c, this.selected.slice()); }
      else this.say(`Choose ${count === 1 ? 'an option' : `${count} options`} to continue.`, true);
    }
  }

  _resetSwapCursor(c) {
    const rows = this._optionRows(c);
    const first = rows.findIndex((o) => !o.disabled);
    this.index = first >= 0 ? first : 0;
    this.listTop = 0;
    this.detailScroll = 0;
  }

  /** Confirm on the highlighted row. */
  _pick(c, rows) {
    const o = rows[this.index];
    if (!o) return;
    if (o.disabled) { this.say(o.reason || 'You cannot take that.', true); return; }

    // --- swap choices: pick the victim, then its replacement ---------------
    if (isSwap(c)) {
      if (!this.swapFrom) {
        if (o.id === 'none') { sfx('select'); this._answer(c, 'none'); return; }
        this.swapFrom = o.id;
        sfx('select');
        this._resetSwapCursor(c);
        return;
      }
      sfx('select');
      this._answer(c, { from: this.swapFrom, to: o.id });
      return;
    }

    // --- a feat that carries its own +1 needs an ability -------------------
    const fid = String(o.id || '').replace(/^feat:/, '');
    const feat = FEATS()[fid];
    if ((c.type === 'feat' || c.type === 'boon') && feat && Array.isArray(feat.asi) && feat.asi.length > 1) {
      this.featAbility = { choice: c, optionId: o.id, list: feat.asi.slice(), index: 0, name: o.name };
      sfx('select');
      return;
    }

    const count = Math.max(1, num(c.count, 1));
    if (count <= 1) { sfx('select'); this._answer(c, o.id); return; }

    // multi-pick: toggle
    const at = this.selected.indexOf(o.id);
    if (at >= 0) { this.selected.splice(at, 1); sfx('back'); return; }
    this.selected.push(o.id);
    sfx('select');
    if (this.selected.length >= count) this._answer(c, this.selected.slice());
  }

  _updateFeatAbility() {
    const fa = this.featAbility;
    const n = fa.list.length;
    if (Input.repeatConsume('down') || Input.repeatConsume('right')) { fa.index = (fa.index + 1) % n; sfx('cursor'); }
    if (Input.repeatConsume('up') || Input.repeatConsume('left')) { fa.index = (fa.index - 1 + n) % n; sfx('cursor'); }
    const m = Input.mouse;
    if (m) {
      for (const r of this.btnRects) {
        if (m.x >= r.x && m.x < r.x + r.w && m.y >= r.y && m.y < r.y + r.h) {
          if (r.i !== fa.index) { fa.index = r.i; sfx('cursor'); }
          if (m.clicked) { m.clicked = false; this._confirmFeatAbility(); }
          break;
        }
      }
    }
    if (Input.consume('confirm')) this._confirmFeatAbility();
    if (Input.consume('cancel')) { this.featAbility = null; sfx('back'); }
  }

  _confirmFeatAbility() {
    const fa = this.featAbility;
    if (!fa) return;
    sfx('select');
    this.picks['feat-ability'] = fa.list[fa.index];
    this.featAbility = null;
    const c = fa.choice;
    const count = Math.max(1, num(c.count, 1));
    if (count <= 1) { this._answer(c, fa.optionId); return; }
    this.selected.push(fa.optionId);
    if (this.selected.length >= count) this._answer(c, this.selected.slice());
  }

  // --- the ASI / feat board ----------------------------------------------

  _asiCap() { return this.epic ? MAX_ABILITY_EPIC : (this.ch?.abilityCap === MAX_ABILITY_EPIC ? MAX_ABILITY_EPIC : MAX_ABILITY); }
  _asiBudget() { return this.epic ? 1 : 2; }
  _asiSpent() { return ABILITIES.reduce((a, ab) => a + num(this.asiAlloc[ab], 0), 0); }

  _asiCanRaise(ab) {
    const cap = this._asiCap();
    const score = num(this.before?.scores?.[ab], safe(() => abilityScore(this.ch, ab), 10));
    if (score + num(this.asiAlloc[ab], 0) >= cap) return false;
    if (num(this.asiAlloc[ab], 0) >= this._asiBudget()) return false;
    return this._asiSpent() < this._asiBudget();
  }

  _updateAsi(c) {
    // Tabs: 0 = spend the increase, 1 = take a feat instead.
    if (Input.consume('tab1')) { this.asiTab = 0; this._resetAsiCursor(c); sfx('cursor'); }
    if (Input.consume('tab2')) { this.asiTab = 1; this._resetAsiCursor(c); sfx('cursor'); }
    if (Input.consume('next')) { this.asiTab = (this.asiTab + 1) % 2; this._resetAsiCursor(c); sfx('cursor'); }
    if (Input.consume('prev')) { this.asiTab = (this.asiTab + 1) % 2; this._resetAsiCursor(c); sfx('cursor'); }

    const m = Input.mouse;
    if (m && m.clicked) {
      for (const r of this.tabRects) {
        if (m.x >= r.x && m.x < r.x + r.w && m.y >= r.y && m.y < r.y + r.h) {
          m.clicked = false;
          if (this.asiTab !== r.i) { this.asiTab = r.i; this._resetAsiCursor(c); sfx('cursor'); }
          return;
        }
      }
    }

    if (this.asiTab === 1) { this._updateAsiFeats(c); return; }

    // --- ability board ----------------------------------------------------
    const rows = ABILITIES.length + 1;              // six abilities + Confirm
    if (Input.repeatConsume('down')) { this.index = (this.index + 1) % rows; sfx('cursor'); }
    if (Input.repeatConsume('up')) { this.index = (this.index - 1 + rows) % rows; sfx('cursor'); }

    const onConfirmRow = this.index >= ABILITIES.length;
    const ab = ABILITIES[this.index];

    if (!onConfirmRow) {
      if (Input.repeatConsume('right', 0.3, 0.12)) this._asiAdd(ab, +1);
      if (Input.repeatConsume('left', 0.3, 0.12)) this._asiAdd(ab, -1);
    }

    if (m) {
      for (const r of this.rowRects) {
        if (m.x >= r.x && m.x < r.x + r.w && m.y >= r.y && m.y < r.y + r.h) {
          if (r.i !== this.index) { this.index = r.i; sfx('cursor'); }
          if (m.clicked) {
            m.clicked = false;
            if (r.i >= ABILITIES.length) this._asiCommit(c);
            else this._asiAdd(ABILITIES[r.i], +1);
          }
          break;
        }
      }
    }

    if (Input.consume('confirm')) {
      if (onConfirmRow) this._asiCommit(c);
      else if (!this._asiAdd(ab, +1)) this._asiCommit(c);
    }
    if (Input.consume('cancel')) {
      if (this._asiSpent() > 0) { for (const a of ABILITIES) this.asiAlloc[a] = 0; sfx('back'); }
      else this.say('The increase must be spent, or take a feat instead.', true);
    }
    if (Input.consume('menu')) this._asiCommit(c);
  }

  _asiAdd(ab, delta) {
    if (delta > 0) {
      if (!this._asiCanRaise(ab)) {
        const cap = this._asiCap();
        const score = num(this.before?.scores?.[ab], 10);
        if (score + num(this.asiAlloc[ab], 0) >= cap) this.say(`${ABILITY_NAMES[ab]} is already at the maximum of ${cap}.`, true);
        else if (this._asiSpent() >= this._asiBudget()) this.say('Every point is spent.', true);
        else this.say(`No more than +${this._asiBudget()} may go into one ability.`, true);
        return false;
      }
      this.asiAlloc[ab] = num(this.asiAlloc[ab], 0) + 1;
      sfx('select');
      return true;
    }
    if (num(this.asiAlloc[ab], 0) <= 0) return false;
    this.asiAlloc[ab] -= 1;
    sfx('back');
    return true;
  }

  _asiCommit(c) {
    const spent = this._asiSpent();
    const budget = this._asiBudget();
    if (spent < budget) { this.say(`${budget - spent} point${budget - spent === 1 ? '' : 's'} still to spend.`, true); return; }
    const abilities = {};
    for (const ab of ABILITIES) if (this.asiAlloc[ab] > 0) abilities[ab] = this.asiAlloc[ab];
    sfx('select');
    this.picks['asi-abilities'] = abilities;
    this._answer(c, 'asi');
  }

  _resetAsiCursor(c) {
    this.index = 0;
    this.listTop = 0;
    this.detailScroll = 0;
    if (this.asiTab === 1) {
      const rows = this._asiFeatRows(c);
      const first = rows.findIndex((o) => !o.disabled);
      this.index = first >= 0 ? first : 0;
    }
  }

  _asiFeatRows(c) { return arr(c?.options).filter((o) => o && o.id !== 'asi'); }

  _updateAsiFeats(c) {
    const rows = this._asiFeatRows(c);
    const n = rows.length;
    if (Input.repeatConsume('next', 0.3, 0.06)) this.detailScroll++;
    if (Input.repeatConsume('prev', 0.3, 0.06)) this.detailScroll = Math.max(0, this.detailScroll - 1);
    if (!n) return;
    let moved = false;
    if (Input.repeatConsume('down')) { this.index = (this.index + 1) % n; moved = true; }
    if (Input.repeatConsume('up')) { this.index = (this.index - 1 + n) % n; moved = true; }
    if (Input.repeatConsume('right')) { this.index = Math.min(n - 1, this.index + 8); moved = true; }
    if (Input.repeatConsume('left')) { this.index = Math.max(0, this.index - 8); moved = true; }
    if (moved) { sfx('cursor'); this.detailScroll = 0; }

    const m = Input.mouse;
    if (m) {
      for (const r of this.rowRects) {
        if (m.x >= r.x && m.x < r.x + r.w && m.y >= r.y && m.y < r.y + r.h) {
          if (r.i !== this.index) { this.index = r.i; this.detailScroll = 0; sfx('cursor'); }
          if (m.clicked) { m.clicked = false; this._pickAsiFeat(c, rows); }
          break;
        }
      }
    }
    if (Input.consume('confirm')) this._pickAsiFeat(c, rows);
    if (Input.consume('cancel')) { this.asiTab = 0; this._resetAsiCursor(c); sfx('back'); }
  }

  _pickAsiFeat(c, rows) {
    const o = rows[this.index];
    if (!o) return;
    if (o.disabled) { this.say(o.reason || 'You do not qualify for that feat.', true); return; }
    const fid = String(o.id).replace(/^feat:/, '');
    const feat = FEATS()[fid];
    if (feat && Array.isArray(feat.asi) && feat.asi.length > 1) {
      this.featAbility = { choice: c, optionId: o.id, list: feat.asi.slice(), index: 0, name: o.name };
      sfx('select');
      return;
    }
    sfx('select');
    this._answer(c, o.id);
  }

  // --- answering ----------------------------------------------------------

  _answer(choice, value) {
    this.picks[choice.id] = value;

    // Which class advances decides every later question — re-ask progression.
    if (choice.type === 'class') {
      this.classId = oneId(value) || this.classId;
      this.preview = this._buildPreview();
      this.queue = this._query();
      this.qi = 0;
      this._resetPage();
      if (!this.queue.length) this._applyNow();
      return;
    }

    this.qi++;
    if (this.qi >= this.queue.length) this._applyNow();
    else this._resetPage();
  }

  // --- applying -----------------------------------------------------------

  _applyNow() {
    const rolledHp = String(oneId(this.picks.hp) || '') === 'roll';
    this.log = arr(this._apply());
    this.after = snapshot(this.ch);
    safe(() => bus.emit(EV.PARTY_CHANGE, { members: null }));

    if (rolledHp) {
      const line = this.log.find((l) => /rolled a d\d+/i.test(String(l))) || '';
      const m = /rolled a d(\d+) for (\d+)/i.exec(String(line));
      const sides = m ? Number(m[1]) : safe(() => hitDieSize(CLASSES()[this.classId]?.hitDie || 8), 8);
      const gain = m ? Number(m[2]) : Math.max(1, num(this.after.maxHp - this.before.maxHp, 1));
      const conMod = abMod(num(this.after.scores?.con, 10));
      this.dice = { sides, gain, conMod, rolled: Math.max(1, gain - conMod), t: 0, done: false };
      this.phase = 'hpRoll';
      this.phaseT = 0;
      sfx('dice');
      return;
    }
    this._toSummary();
  }

  _toSummary() {
    this.phase = 'summary';
    this.phaseT = 0;
    this.logScroll = 0;
    sfx('levelup');
  }

  _updateDice(dt) {
    const d = this.dice;
    if (!d) { this._toSummary(); return; }
    d.t += dt;
    if (!d.done && d.t >= 0.75) { d.done = true; sfx('select'); }
    const skip = Input.consume('confirm') || Input.consume('cancel') || (Input.mouse && Input.mouse.clicked);
    if (skip && !d.done) { d.t = 0.8; d.done = true; sfx('select'); return; }
    if (d.done && (skip || d.t > 2.4)) this._toSummary();
  }

  // --- summary ------------------------------------------------------------

  _updateSummary() {
    const maxScroll = Math.max(0, this.log.length - 9);
    if (Input.repeatConsume('down')) { this.logScroll = Math.min(maxScroll, this.logScroll + 1); sfx('cursor'); }
    if (Input.repeatConsume('up')) { this.logScroll = Math.max(0, this.logScroll - 1); sfx('cursor'); }
    if (Input.mouse && Input.mouse.wheel) this.logScroll = clamp(this.logScroll + (Input.mouse.wheel > 0 ? 1 : -1), 0, maxScroll);

    const m = Input.mouse;
    const clicked = m && m.clicked;
    if (Input.consume('confirm') || Input.consume('cancel') || Input.consume('menu') || clicked) {
      if (clicked) m.clicked = false;
      sfx('select');
      this._nextUnit();
    }
  }

  _nextUnit() {
    // More levels for this character? Otherwise move along the roster.
    if (this._unitsLeft(this.ch) > 0) { this._startUnit(); return; }
    this.ci++;
    this._startUnit();
  }

  // =========================================================================
  // DRAW
  // =========================================================================

  draw(ctx) {
    this.rowRects = [];
    this.tabRects = [];
    this.btnRects = [];
    this._drawBackdrop(ctx);

    if (this.phase === 'intro') this._drawIntro(ctx);
    else if (this.phase === 'choice') this._drawChoice(ctx);
    else if (this.phase === 'hpRoll') this._drawDice(ctx);
    else if (this.phase === 'summary') this._drawSummary(ctx);

    if (this.msg) {
      const w = Math.min(300, UI.measure(this.msg, 'sm') + 14);
      UI.panel(ctx, R((VIEW_W - w) / 2), 200, w, 14, { style: 'danger', shadow: 0.4 });
      UI.text(ctx, VIEW_W / 2, 204, this.msg, { size: 'sm', color: '#f0c0b0', align: 'center', maxWidth: w - 8 });
    }
    safe(() => FX.draw(ctx, 0, 0));
  }

  /** A slow gold sunburst so every advancement screen feels like a reward. */
  _drawBackdrop(ctx) {
    ctx.fillStyle = '#0a0b12';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const cx = VIEW_W / 2, cy = VIEW_H / 2;
    const spokes = 14;
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * Math.PI * 2 + this.t * 0.10;
      const wob = 0.055 + Math.sin(this.t * 1.4 + i) * 0.012;
      ctx.fillStyle = i % 2 ? 'rgba(226,168,60,0.045)' : 'rgba(140,90,30,0.045)';
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a - wob) * 320, cy + Math.sin(a - wob) * 320);
      ctx.lineTo(cx + Math.cos(a + wob) * 320, cy + Math.sin(a + wob) * 320);
      ctx.closePath();
      ctx.fill();
    }
    const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, 190);
    g.addColorStop(0, 'rgba(255,214,120,0.10)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.restore();
    // vignette
    const v = ctx.createRadialGradient(cx, cy, 90, cx, cy, 250);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.62)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  _drawHeader(ctx, right) {
    const ch = this.ch;
    UI.panel(ctx, 2, 2, VIEW_W - 4, 13, { style: 'dark', shadow: 0.3 });
    UI.text(ctx, 7, 5, ch?.name || 'Adventurer', { size: 'sm', color: C.goldBright, maxWidth: 150 });
    UI.text(ctx, 160, 5, this._subText(), { size: 'sm', color: C.inkDim, maxWidth: 150 });
    if (right) UI.text(ctx, VIEW_W - 7, 5, right, { size: 'sm', color: C.inkDim, align: 'right', maxWidth: 90 });
  }

  // --- 1. banner ----------------------------------------------------------

  _drawIntro(ctx) {
    const ch = this.ch;
    const pv = this.preview || {};
    const before = this.before || {};
    const after = pv.after || null;

    // Banner
    const pop = Math.min(1, this.phaseT / 0.28);
    const bh = R(4 + 26 * pop);
    UI.panel(ctx, 12, 8, VIEW_W - 24, bh, { style: 'gold', shadow: 0.45 });
    if (pop >= 0.95) {
      UI.text(ctx, VIEW_W / 2, 14, this._bannerText(), {
        size: 'md', color: '#2a1c07', align: 'center', maxWidth: VIEW_W - 40, shadow: 'rgba(255,235,180,0.4)',
      });
      UI.text(ctx, VIEW_W / 2, 24, pv.classLine || '', {
        size: 'sm', color: '#5a4318', align: 'center', maxWidth: VIEW_W - 40,
      });
    }

    // Sprite in the pillar
    const cx = 82, baseY = 196;
    this.pillar.draw(ctx, cx, baseY, this.t, 152);
    const bob = Math.sin(this.t * 2.4) * 1.5;
    safe(() => drawActor(ctx, ch, cx, baseY + bob, {
      dir: 'down', scale: 2, shadow: false, idleBob: (Math.sin(this.t * 2.4) > 0),
    }));
    // sparkle motes drawn over the sprite as well, so it sits inside the light
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const mo of this.pillar.motes) {
      if (mo.y > baseY - 46) continue;
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#fff4d0';
      ctx.fillRect(R(mo.x + Math.sin(mo.sway) * 3), R(mo.y), 1, 1);
    }
    ctx.restore();

    // XP line under the sprite
    UI.panel(ctx, 10, 200, 138, 14, { style: 'dark', shadow: 0.25 });
    UI.text(ctx, 15, 204, `XP ${num(ch?.xp, 0).toLocaleString()}`, { size: 'sm', color: C.xp, maxWidth: 128 });

    // Before / after table
    this._drawCompare(ctx, 154, 44, VIEW_W - 160, 156, before, after, pv.features || []);

    UI.keyHint(ctx, 10, 222, 'Z', 'Continue');
    UI.text(ctx, VIEW_W - 8, 224, `${this.ci + 1} of ${this.chars.length}`, { size: 'sm', color: C.inkDim, align: 'right' });
  }

  /**
   * Two-column stat comparison. `after` may be null (unknown yet), in which case
   * the right column simply shows a dash instead of inventing a number.
   */
  _drawCompare(ctx, x, y, w, h, before, after, features) {
    const p = UI.panel(ctx, x, y, w, h, { style: 'window' });
    const ix = p.ix + 4, iw = p.iw - 8;
    const colA = ix + iw - 84, colB = ix + iw - 34;

    UI.text(ctx, ix, p.iy + 3, 'THE COMPANY LEDGER', { size: 'sm', color: C.goldDim, maxWidth: iw - 90 });
    UI.text(ctx, colA + 18, p.iy + 3, 'NOW', { size: 'sm', color: C.inkDim, align: 'center' });
    UI.text(ctx, colB + 16, p.iy + 3, 'NEXT', { size: 'sm', color: C.gold, align: 'center' });
    UI.divider(ctx, ix, p.iy + 12, iw, { color: C.border });

    const rows = [
      ['Hit Points', String(num(before.maxHp, 0)), after ? String(num(after.maxHp, 0)) : '—', 'heart', true],
      ['Prof. Bonus', signed(num(before.prof, 2)), after ? signed(num(after.prof, 2)) : '—', 'star', true],
      ['Armour Class', String(num(before.ac, 10)), after ? String(num(after.ac, 10)) : '—', 'shield', true],
      ['Hit Dice', before.hitDice || '—', after ? (after.hitDice || '—') : '—', 'dice', false],
      ['Speed', `${num(before.speed, 30)}`, after ? `${num(after.speed, 30)}` : '—', 'foot', true],
    ];
    if (before.slots || (after && after.slots)) rows.push(['Spell Slots', before.slots || '—', after ? (after.slots || '—') : '—', 'book', false]);
    if (before.pact || (after && after.pact)) rows.push(['Pact Magic', before.pact || '—', after ? (after.pact || '—') : '—', 'rune', false]);

    let ry = p.iy + 16;
    for (const [label, a, b, icon, numeric] of rows) {
      UI.icon(ctx, icon, ix, ry - 1, 8, C.inkDim);
      UI.text(ctx, ix + 11, ry, label, { size: 'sm', color: C.ink, maxWidth: colA - ix - 13 });
      UI.text(ctx, colA + 18, ry, a, { size: 'sm', color: C.inkDim, align: 'center', maxWidth: 46 });
      let col = C.ink;
      if (numeric && after) {
        const na = parseInt(String(a).replace('+', ''), 10);
        const nb = parseInt(String(b).replace('+', ''), 10);
        if (Number.isFinite(na) && Number.isFinite(nb)) col = nb > na ? C.good : nb < na ? C.bad : C.ink;
      } else if (after && b !== a) col = C.good;
      UI.text(ctx, colB + 16, ry, b, { size: 'sm', color: col, align: 'center', maxWidth: 46 });
      ry += 10;
    }

    UI.divider(ctx, ix, ry + 1, iw, { color: C.border });
    ry += 5;
    UI.text(ctx, ix, ry, 'NEW FEATURES', { size: 'sm', color: C.goldDim });
    ry += 9;
    const room = p.iy + p.ih - ry - 2;
    const maxRows = Math.max(0, Math.floor(room / 9));
    const list = arr(features);
    if (!list.length) {
      UI.text(ctx, ix + 2, ry, 'A steadier hand and a stouter heart.', { size: 'sm', color: C.disabled, maxWidth: iw - 4 });
    } else {
      for (let i = 0; i < Math.min(maxRows, list.length); i++) {
        const f = list[i];
        const last = i === maxRows - 1 && list.length > maxRows;
        const label = last ? `${f.name} +${list.length - maxRows + 1} more` : f.name;
        UI.icon(ctx, 'plus', ix + 1, ry - 1, 8, C.good);
        UI.text(ctx, ix + 12, ry, label, { size: 'sm', color: C.goldBright, maxWidth: iw - 14 });
        ry += 9;
      }
    }
  }

  // --- 2. choices ---------------------------------------------------------

  _drawChoice(ctx) {
    const c = this.choice;
    if (!c) return;
    this._drawHeader(ctx, `Choice ${Math.min(this.qi + 1, this.queue.length)}/${this.queue.length}`);

    if (c.type === 'asi' && !isSwap(c)) { this._drawAsi(ctx, c); }
    else this._drawList(ctx, c);

    if (this.featAbility) this._drawFeatAbility(ctx);
  }

  _drawTitleBar(ctx, title, right) {
    UI.panel(ctx, 2, 16, VIEW_W - 4, 13, { style: 'gold', shadow: 0.3, studs: false });
    UI.text(ctx, 8, 19, title, { size: 'md', color: '#2a1c07', maxWidth: VIEW_W - 120 });
    if (right) UI.text(ctx, VIEW_W - 8, 20, right, { size: 'sm', color: '#5a4318', align: 'right', maxWidth: 100 });
  }

  _drawList(ctx, c) {
    const swapping = isSwap(c) && !!this.swapFrom;
    const count = Math.max(1, num(c.count, 1));
    const rows = this._optionRows(c);

    let title = c.title || 'Choose';
    if (swapping) title = `Replace with…`;
    let right = '';
    if (isSwap(c)) right = swapping ? 'step 2 of 2' : 'optional';
    else if (count > 1) right = `${this.selected.length}/${count} chosen`;
    this._drawTitleBar(ctx, title, right);

    // --- left: options ----------------------------------------------------
    // 178, not 176: the two extra pixels are exactly what "Champion of the
    // Sword Coast" needed, and the panel still stops short of the detail pane.
    const lx = 6, ly = 32, lw = 178, rowH = 13, visible = 12;
    UI.panel(ctx, lx - 3, ly - 3, lw + 6, visible * rowH + 6, { style: 'dark', shadow: 0.3 });

    const self = this;
    const items = rows.map((o) => ({ ...o, label: o.name || o.id }));
    const res = UI.list(ctx, lx, ly, lw, items, this.index, {
      rows: visible, rowH, top: this.listTop, t: this.t, scrollbar: true, cursor: false,
      empty: 'Nothing to choose here.',
      render(g, it, ix, rx, ry, rw, rh, sel) {
        const dis = !!it.disabled;
        const picked = self.selected.indexOf(it.id) >= 0;
        if (sel) UI.highlight(g, rx, ry, rw, rh - 1, { alpha: dis ? 0.10 : 0.22 });
        // pick box for multi-select
        let tx = rx + 3;
        if (count > 1 && !isSwap(c)) {
          g.fillStyle = '#0a0708';
          g.fillRect(rx + 2, ry + 2, 8, 8);
          g.fillStyle = picked ? C.gold : 'rgba(255,255,255,0.10)';
          g.fillRect(rx + 3, ry + 3, 6, 6);
          if (picked) UI.icon(g, 'check', rx + 2, ry + 1, 8, '#1a1206');
          tx = rx + 13;
        } else if (sel && !dis) {
          UI.cursor(g, rx + 1, ry + 3, self.t);
          tx = rx + 9;
        } else {
          tx = rx + 9;
        }
        const col = dis ? C.disabled : (picked ? C.goldBright : (sel ? C.goldBright : C.ink));
        // The selected row is set bold, which is 1px per glyph wider — so
        // HIGHLIGHTING "Investment of the Chain Master" was what cut it to
        // "Investment of the Cha…" while its neighbours showed in full. Bold
        // only when bold still fits.
        const label = String(it.label);
        const room = rw - (tx - rx) - 2;
        UI.text(g, tx, ry + 3, label, {
          size: sel && UI.measure(label, 'md') <= room ? 'md' : 'sm', color: col, maxWidth: room,
        });
        if (dis) {
          g.fillStyle = 'rgba(10,7,8,0.30)';
          for (let i = 1; i < rh - 1; i += 2) g.fillRect(rx, ry + i, rw, 1);
        }
      },
    });
    this.listTop = res.top;
    for (let i = 0; i < res.rows && res.top + i < rows.length; i++) {
      this.rowRects.push({ x: lx, y: ly + i * rowH, w: lw, h: rowH, i: res.top + i });
    }

    // --- right: the full rules text ---------------------------------------
    this._drawDetail(ctx, 188, 32, VIEW_W - 194, visible * rowH, c, rows[this.index]);

    // --- bottom: what this choice is + hints -------------------------------
    const dp = UI.panel(ctx, 6, 194, VIEW_W - 12, 28, { style: 'dark', shadow: 0.28 });
    const descText = swapping
      ? `Replacing ${this._nameOf(c, this.swapFrom)}. Pick what takes its place.`
      : (c.desc || '');
    UI.textWrapped(ctx, dp.ix + 4, dp.iy + 3, dp.iw - 8, descText, { size: 'sm', color: C.inkDim, maxLines: 3 });

    let hx = 8;
    hx += UI.keyHint(ctx, hx, 224, 'Z', count > 1 && !isSwap(c) ? 'Toggle' : 'Choose') + 8;
    if (count > 1 && !isSwap(c)) hx += UI.keyHint(ctx, hx, 224, 'ESC', 'Undo') + 8;
    else if (c.optional || swapping) hx += UI.keyHint(ctx, hx, 224, 'X', swapping ? 'Back' : 'Skip') + 8;
    UI.keyHint(ctx, hx, 224, 'QR', 'Scroll text');
    if (count > 1 && !isSwap(c)) {
      UI.text(ctx, VIEW_W - 8, 226, `Pick ${count}`, { size: 'sm', color: C.gold, align: 'right' });
    }
  }

  _nameOf(c, id) {
    const o = arr(c?.options).find((x) => x && x.id === id);
    if (o) return o.name || id;
    return SPELLS()[id]?.name || (INVOCATIONS && INVOCATIONS[id]?.name) || (METAMAGIC && METAMAGIC[id]?.name)
      || (MANEUVERS && MANEUVERS[id]?.name) || String(id);
  }

  /** The right-hand panel: name, rules text, and type-specific extras. */
  _drawDetail(ctx, x, y, w, h, c, option) {
    const p = UI.panel(ctx, x, y, w, h, { style: 'window' });
    const ix = p.ix + 4, iw = p.iw - 8;
    if (!option) {
      UI.text(ctx, ix + iw / 2, p.iy + h / 2 - 6, 'No options available.', { size: 'sm', color: C.disabled, align: 'center', maxWidth: iw });
      return;
    }

    UI.icon(ctx, CHOICE_ICON[c.type] || 'rune', ix, p.iy + 2, 10, option.disabled ? C.disabled : C.gold);
    // "Investment of the Chain Master" is 209px bold in a 177px header. The
    // panel exists to tell you what you are about to take permanently, so the
    // name drops to the small face rather than dropping its last two words.
    const oname = String(option.name || option.id || '');
    const onameW = iw - 13;
    UI.text(ctx, ix + 12, p.iy + 3, oname, {
      size: UI.measure(oname, 'md') <= onameW ? 'md' : 'sm',
      color: option.disabled ? C.disabled : C.goldBright, maxWidth: onameW,
    });
    UI.divider(ctx, ix, p.iy + 14, iw, { color: C.border });

    // Build every line first, then window them with detailScroll.
    const lines = [];
    if (option.disabled && option.reason) {
      lines.push({ kind: 'warn', text: option.reason });
    }
    for (const l of UI.wrapLines(String(option.desc || 'No further description.'), iw, 'sm')) {
      lines.push({ kind: 'body', text: l });
    }
    for (const ex of detailExtras(c, option, this.ch)) {
      if (ex.head) { lines.push({ kind: 'head', text: ex.head }); continue; }
      const label = `${ex.label}: `;
      const lw = UI.measure(label, 'sm');
      const wrapped = UI.wrapLines(String(ex.text || ''), iw - lw, 'sm');
      wrapped.forEach((t, i) => lines.push({ kind: 'kv', label: i === 0 ? label : '', text: t, indent: lw }));
    }

    const lineH = 8;
    const room = Math.floor((p.ih - 20) / lineH);
    const maxScroll = Math.max(0, lines.length - room);
    if (this.detailScroll > maxScroll) this.detailScroll = maxScroll;
    let ly = p.iy + 18;
    for (let i = this.detailScroll; i < Math.min(lines.length, this.detailScroll + room); i++) {
      const l = lines[i];
      if (l.kind === 'head') {
        UI.text(ctx, ix, ly, l.text.toUpperCase(), { size: 'sm', color: C.goldDim, maxWidth: iw });
      } else if (l.kind === 'warn') {
        UI.text(ctx, ix, ly, l.text, { size: 'sm', color: C.bad, maxWidth: iw });
      } else if (l.kind === 'kv') {
        if (l.label) UI.text(ctx, ix, ly, l.label, { size: 'sm', color: C.inkDim, maxWidth: iw });
        UI.text(ctx, ix + (l.indent || 0), ly, l.text, { size: 'sm', color: C.ink, maxWidth: iw - (l.indent || 0) });
      } else {
        UI.text(ctx, ix, ly, l.text, { size: 'sm', color: C.ink, maxWidth: iw });
      }
      ly += lineH;
    }
    if (maxScroll > 0) {
      UI.text(ctx, ix + iw, p.iy + p.ih - 8, `${this.detailScroll + 1}/${maxScroll + 1}`, {
        size: 'sm', color: C.goldDim, align: 'right',
      });
    }
  }

  // --- the ASI board ------------------------------------------------------

  _drawAsi(ctx, c) {
    this._drawTitleBar(ctx, c.title || 'Ability Score Improvement', this.asiTab === 0 ? '+2 to spend' : 'or take a feat');

    const tabY = 31;
    const tabW = Math.floor((VIEW_W - 12) / 2);
    MK.tabs(ctx, 6, tabY, VIEW_W - 12, [
      { label: 'Ability Scores', icon: 'star' },
      { label: 'Feats', icon: 'book' },
    ], this.asiTab, { h: 13 });
    this.tabRects.push({ x: 6, y: tabY, w: tabW, h: 13, i: 0 });
    this.tabRects.push({ x: 6 + tabW, y: tabY, w: tabW, h: 13, i: 1 });

    if (this.asiTab === 1) { this._drawAsiFeats(ctx, c); return; }

    // --- ability board ----------------------------------------------------
    const bx = 6, by = 48, bw = 210;
    const p = UI.panel(ctx, bx, by, bw, 130, { style: 'window' });
    const ix = p.ix + 4, iw = p.iw - 8;
    const cap = this._asiCap();
    const budget = this._asiBudget();
    const spent = this._asiSpent();

    UI.text(ctx, ix, p.iy + 3, 'ABILITY', { size: 'sm', color: C.goldDim });
    UI.text(ctx, ix + 104, p.iy + 3, 'NOW', { size: 'sm', color: C.inkDim, align: 'center' });
    UI.text(ctx, ix + 144, p.iy + 3, 'NEW', { size: 'sm', color: C.gold, align: 'center' });
    UI.divider(ctx, ix, p.iy + 12, iw, { color: C.border });

    let ry = p.iy + 16;
    ABILITIES.forEach((ab, i) => {
      const sel = this.index === i;
      const score = num(this.before?.scores?.[ab], 10);
      const add = num(this.asiAlloc[ab], 0);
      const nv = Math.min(cap, score + add);
      const atCap = score >= cap;
      if (sel) UI.highlight(ctx, ix - 2, ry - 2, iw + 4, 12, { alpha: 0.20 });
      if (sel) UI.cursor(ctx, ix - 1, ry, this.t);
      UI.text(ctx, ix + 8, ry, ABILITY_NAMES[ab], { size: sel ? 'md' : 'sm', color: atCap ? C.disabled : C.ink, maxWidth: 92 });
      UI.text(ctx, ix + 104, ry, `${score} (${signed(abMod(score))})`, { size: 'sm', color: C.inkDim, align: 'center', maxWidth: 44 });
      UI.text(ctx, ix + 144, ry, add ? `${nv} (${signed(abMod(nv))})` : '—', {
        size: 'sm', color: add ? C.good : C.disabled, align: 'center', maxWidth: 44,
      });
      // +/- affordance
      if (sel) {
        UI.text(ctx, ix + 172, ry, add > 0 ? '◄' : ' ', { size: 'sm', color: C.goldDim });
        UI.text(ctx, ix + 184, ry, this._asiCanRaise(ab) ? '►' : ' ', { size: 'sm', color: C.gold });
      }
      if (add > 0) UI.pips(ctx, ix + 196, ry + 1, add, add, { size: 4, gap: 1, color: C.gold });
      this.rowRects.push({ x: ix - 2, y: ry - 2, w: iw + 4, h: 12, i });
      ry += 12;
    });

    UI.divider(ctx, ix, ry + 1, iw, { color: C.border });
    ry += 6;
    const ready = spent >= budget;
    const selBtn = this.index >= ABILITIES.length;
    UI.button(ctx, ix, ry, iw, 15, ready ? 'Take the increase' : `${budget - spent} point${budget - spent === 1 ? '' : 's'} left`, {
      selected: selBtn, disabled: !ready, t: this.t, icon: 'check',
    });
    this.rowRects.push({ x: ix, y: ry, w: iw, h: 15, i: ABILITIES.length });

    // --- right: the rule, spelled out -------------------------------------
    const dp = UI.panel(ctx, 220, 48, VIEW_W - 226, 130, { style: 'window' });
    const dx = dp.ix + 4, dw = dp.iw - 8;
    UI.icon(ctx, 'star', dx, dp.iy + 2, 10, C.gold);
    UI.text(ctx, dx + 13, dp.iy + 3, 'Ability Score Improvement', { size: 'md', color: C.goldBright, maxWidth: dw - 15 });
    UI.divider(ctx, dx, dp.iy + 14, dw, { color: C.border });
    const body = `Increase one ability score by 2, or two ability scores by 1 each. No score may pass ${cap}. `
      + 'Or move to the Feats tab and take a feat instead — you cannot do both.';
    const wr = UI.textWrapped(ctx, dx, dp.iy + 18, dw, body, { size: 'sm', color: C.ink, maxLines: 7 });
    let dy = dp.iy + 18 + wr.height + 3;
    UI.divider(ctx, dx, dy, dw, { color: C.border });
    dy += 5;
    // Live consequences of the current allocation.
    const changed = ABILITIES.filter((ab) => this.asiAlloc[ab] > 0);
    if (!changed.length) {
      UI.text(ctx, dx, dy, 'Nothing allocated yet.', { size: 'sm', color: C.disabled, maxWidth: dw });
    } else {
      UI.text(ctx, dx, dy, 'THIS WILL CHANGE', { size: 'sm', color: C.goldDim });
      dy += 9;
      for (const ab of changed) {
        const score = num(this.before?.scores?.[ab], 10);
        const nv = Math.min(cap, score + this.asiAlloc[ab]);
        const dm = abMod(nv) - abMod(score);
        const txt = `${ABILITY_ABBR[ab]} ${score} → ${nv}${dm ? `  modifier ${signed(abMod(nv))}` : ''}`;
        UI.icon(ctx, 'arrow-up', dx, dy - 1, 8, C.good);
        UI.text(ctx, dx + 11, dy, txt, { size: 'sm', color: dm ? C.good : C.ink, maxWidth: dw - 13 });
        dy += 9;
      }
    }

    let hx = 8;
    hx += UI.keyHint(ctx, hx, 194, '←→', 'Spend') + 8;
    hx += UI.keyHint(ctx, hx, 194, 'Z', 'Confirm') + 8;
    hx += UI.keyHint(ctx, hx, 194, '2', 'Feats') + 8;
    UI.keyHint(ctx, hx, 194, 'X', 'Reset');
    const dp2 = UI.panel(ctx, 6, 212, VIEW_W - 12, 22, { style: 'dark', shadow: 0.28 });
    UI.textWrapped(ctx, dp2.ix + 4, dp2.iy + 3, dp2.iw - 8, c.desc || '', { size: 'sm', color: C.inkDim, maxLines: 2 });
  }

  _drawAsiFeats(ctx, c) {
    const rows = this._asiFeatRows(c);
    const lx = 6, ly = 48, lw = 176, rowH = 13, visible = 10;
    UI.panel(ctx, lx - 3, ly - 3, lw + 6, visible * rowH + 6, { style: 'dark', shadow: 0.3 });
    const self = this;
    const res = UI.list(ctx, lx, ly, lw, rows.map((o) => ({ ...o, label: o.name || o.id })), this.index, {
      rows: visible, rowH, top: this.listTop, t: this.t, cursor: false, empty: 'No feats available.',
      render(g, it, ix, rx, ry, rw, rh, sel) {
        const dis = !!it.disabled;
        if (sel) UI.highlight(g, rx, ry, rw, rh - 1, { alpha: dis ? 0.10 : 0.22 });
        if (sel && !dis) UI.cursor(g, rx + 1, ry + 3, self.t);
        UI.text(g, rx + 9, ry + 3, String(it.label), {
          size: sel ? 'md' : 'sm', color: dis ? C.disabled : (sel ? C.goldBright : C.ink), maxWidth: rw - 12,
        });
        if (dis) {
          g.fillStyle = 'rgba(10,7,8,0.30)';
          for (let i = 1; i < rh - 1; i += 2) g.fillRect(rx, ry + i, rw, 1);
        }
      },
    });
    this.listTop = res.top;
    for (let i = 0; i < res.rows && res.top + i < rows.length; i++) {
      this.rowRects.push({ x: lx, y: ly + i * rowH, w: lw, h: rowH, i: res.top + i });
    }
    this._drawDetail(ctx, 188, 48, VIEW_W - 194, visible * rowH, { ...c, type: 'feat' }, rows[this.index]);

    let hx = 8;
    hx += UI.keyHint(ctx, hx, 186, 'Z', 'Take feat') + 8;
    hx += UI.keyHint(ctx, hx, 186, '1', 'Ability scores') + 8;
    UI.keyHint(ctx, hx, 186, 'QR', 'Scroll text');
    const dp = UI.panel(ctx, 6, 204, VIEW_W - 12, 30, { style: 'dark', shadow: 0.28 });
    UI.textWrapped(ctx, dp.ix + 4, dp.iy + 3, dp.iw - 8, c.desc || '', { size: 'sm', color: C.inkDim, maxLines: 3 });
  }

  /** Modal: which ability does this feat's +1 go into? */
  _drawFeatAbility(ctx) {
    const fa = this.featAbility;
    UI.scrim(ctx, 0.62);
    const w = 210, h = 44 + fa.list.length * 0;
    const x = R((VIEW_W - w) / 2), y = 78;
    const p = UI.window(ctx, x, y, w, h, fa.name || 'Feat', { style: 'gold' });
    UI.textWrapped(ctx, p.ix + 5, p.iy + 6, p.iw - 10, 'This feat also raises an ability by 1. Which one?', {
      size: 'sm', color: '#3a2a08', maxLines: 2,
    });
    const bw = Math.floor((p.iw - 10 - (fa.list.length - 1) * 3) / fa.list.length);
    let bx = p.ix + 5;
    fa.list.forEach((ab, i) => {
      UI.button(ctx, bx, p.iy + 22, bw, 15, ABILITY_ABBR[ab] || ab, { selected: i === fa.index, t: this.t });
      this.btnRects.push({ x: bx, y: p.iy + 22, w: bw, h: 15, i });
      bx += bw + 3;
    });
    UI.keyHint(ctx, x, y + h + 4, 'Z', 'Confirm');
  }

  // --- 3. the hit-die reveal ----------------------------------------------

  _drawDice(ctx) {
    this._drawHeader(ctx, 'Hit Points');
    this._drawTitleBar(ctx, 'Roll your hit die', 'no take-backs');
    const d = this.dice;
    const cx = VIEW_W / 2, cy = 116;
    drawDie(ctx, cx, cy, d.sides, d.done ? d.rolled : null, d.t, 3);

    if (d.done) {
      const line = `d${d.sides} [${d.rolled}] ${signed(d.conMod)} = ${d.gain} hit points`;
      const w = UI.measure(line, 'md') + 18;
      UI.panel(ctx, R(cx - w / 2), 158, w, 16, { style: 'dark', shadow: 0.4 });
      UI.text(ctx, cx, 162, line, { size: 'md', color: C.goldBright, align: 'center', maxWidth: w - 8 });
      const total = `Maximum hit points ${num(this.before?.maxHp, 0)} → ${num(this.after?.maxHp, 0)}`;
      UI.text(ctx, cx, 180, total, { size: 'sm', color: C.good, align: 'center', maxWidth: VIEW_W - 40 });
      UI.keyHint(ctx, 8, 222, 'Z', 'Continue');
    } else {
      UI.text(ctx, cx, 160, 'The die tumbles across the map table…', {
        size: 'sm', color: C.inkDim, align: 'center', maxWidth: VIEW_W - 40,
      });
    }
  }

  // --- 4. summary ---------------------------------------------------------

  _drawSummary(ctx) {
    this._drawHeader(ctx, `${this.ci + 1} of ${this.chars.length}`);
    this._drawTitleBar(ctx, 'What you gained', this._subText());

    // left: the real before/after
    const before = this.before || {};
    const after = this.after || {};
    const p = UI.panel(ctx, 6, 32, 138, 158, { style: 'window' });
    const ix = p.ix + 4, iw = p.iw - 8;
    UI.text(ctx, ix, p.iy + 3, 'BEFORE  →  AFTER', { size: 'sm', color: C.goldDim, maxWidth: iw });
    UI.divider(ctx, ix, p.iy + 12, iw, { color: C.border });
    const rows = [
      ['Level', String(num(before.level, 1)), String(num(after.level, 1))],
      ['Hit Points', String(num(before.maxHp, 0)), String(num(after.maxHp, 0))],
      ['Prof. Bonus', signed(num(before.prof, 2)), signed(num(after.prof, 2))],
      ['Armour Class', String(num(before.ac, 10)), String(num(after.ac, 10))],
      ['Hit Dice', before.hitDice || '—', after.hitDice || '—'],
    ];
    if (before.slots || after.slots) rows.push(['Slots', before.slots || '—', after.slots || '—']);
    if (before.pact || after.pact) rows.push(['Pact', before.pact || '—', after.pact || '—']);
    for (const ab of ABILITIES) {
      const a = num(before.scores?.[ab], 0), b = num(after.scores?.[ab], 0);
      if (a !== b) rows.push([ABILITY_NAMES[ab], String(a), String(b)]);
    }
    let ry = p.iy + 16;
    for (const [label, a, b] of rows) {
      if (ry > p.iy + p.ih - 10) break;
      UI.text(ctx, ix, ry, label, { size: 'sm', color: C.inkDim, maxWidth: 68 });
      UI.text(ctx, ix + 88, ry, a, { size: 'sm', color: C.inkDim, align: 'right', maxWidth: 28 });
      UI.text(ctx, ix + 92, ry, '→', { size: 'sm', color: C.goldDim });
      const grew = a !== b;
      UI.text(ctx, ix + iw, ry, b, { size: 'sm', color: grew ? C.good : C.ink, align: 'right', maxWidth: 30 });
      ry += 10;
    }

    // right: the applyLevel log
    const lp = UI.panel(ctx, 150, 32, VIEW_W - 156, 158, { style: 'window' });
    const lx = lp.ix + 4, lw = lp.iw - 8;
    UI.text(ctx, lx, lp.iy + 3, 'THE CHRONICLE', { size: 'sm', color: C.goldDim, maxWidth: lw });
    UI.divider(ctx, lx, lp.iy + 12, lw, { color: C.border });

    // Each log line is "Name: rules text" — colour the name gold.
    const flat = [];
    for (const raw of this.log) {
      const s = String(raw);
      const cut = s.indexOf(': ');
      if (cut > 0 && cut < 34) {
        flat.push({ head: s.slice(0, cut + 1), rest: s.slice(cut + 2) });
      } else {
        flat.push({ head: '', rest: s });
      }
    }
    let ly = lp.iy + 17;
    const bottom = lp.iy + lp.ih - 3;
    const start = clamp(this.logScroll, 0, Math.max(0, flat.length - 1));
    for (let i = start; i < flat.length && ly < bottom - 6; i++) {
      const e = flat[i];
      let tx = lx + 9;
      UI.icon(ctx, 'plus', lx, ly - 1, 8, C.good);
      if (e.head) {
        const hw = UI.measure(e.head, 'sm');
        if (hw < lw - 12) {
          UI.text(ctx, tx, ly, e.head, { size: 'sm', color: C.goldBright, maxWidth: lw - 10 });
          const wr = UI.wrapLines(e.rest, lw - 10, 'sm');
          // First fragment tucks in beside the heading when there is room.
          let first = 0;
          if (lw - 10 - hw > 40) {
            UI.text(ctx, tx + hw + 2, ly, UI.fit(wr[0] || '', lw - 12 - hw, 'sm'), { size: 'sm', color: C.ink, maxWidth: lw - 12 - hw });
            first = 1;
          }
          ly += 8;
          const rest = first ? UI.wrapLines(wr.slice(1).join(' '), lw - 10, 'sm') : wr;
          for (const l of rest) {
            if (ly >= bottom - 6) break;
            UI.text(ctx, tx, ly, l, { size: 'sm', color: C.ink, maxWidth: lw - 10 });
            ly += 8;
          }
          ly += 2;
          continue;
        }
      }
      const wrapped = UI.wrapLines(e.head ? `${e.head} ${e.rest}` : e.rest, lw - 10, 'sm');
      for (const l of wrapped) {
        if (ly >= bottom - 6) break;
        UI.text(ctx, tx, ly, l, { size: 'sm', color: C.ink, maxWidth: lw - 10 });
        ly += 8;
      }
      ly += 2;
    }
    if (flat.length) {
      UI.text(ctx, lx + lw, lp.iy + 3, `${start + 1}/${flat.length}`, { size: 'sm', color: C.goldDim, align: 'right' });
    }

    let hx = 8;
    hx += UI.keyHint(ctx, hx, 196, 'Z', this._continueLabel()) + 8;
    UI.keyHint(ctx, hx, 196, '↑↓', 'Scroll');
    const rem = this._unitsLeft(this.ch);
    if (rem > 0) {
      UI.text(ctx, VIEW_W - 8, 198, `${rem} more level${rem === 1 ? '' : 's'} to take`, {
        size: 'sm', color: C.gold, align: 'right', maxWidth: 160,
      });
    }
    // A ribbon of the character in their light, so the moment lands.
    this.pillar.draw(ctx, 34, 236, this.t, 34);
    safe(() => drawActor(ctx, this.ch, 34, 236, { dir: 'down', scale: 1, shadow: false }));
    UI.text(ctx, 52, 220, this.ch?.name || '', { size: 'sm', color: C.goldBright, maxWidth: 120 });
    UI.text(ctx, 52, 229, this._subText(), { size: 'sm', color: C.inkDim, maxWidth: 120 });
  }

  _continueLabel() {
    if (this._unitsLeft(this.ch) > 0) return 'Next level';
    return this.ci + 1 < this.chars.length ? 'Next hero' : 'Onward';
  }
}

// ===========================================================================
// 6. A HAND-DRAWN POLYHEDRAL DIE
//
// UI.diceRoll is the d20 popup used in battle; a hit die is a d6/d8/d10/d12, so
// this draws a small faceted die that can show any face.
// ===========================================================================

function drawDie(ctx, cx, cy, sides, face, t, scale = 2) {
  const s = Math.max(1, Math.round(scale));
  const r = 9 * s;
  const tumbling = face == null;
  const wob = tumbling ? Math.sin(t * 34) * 0.10 : 0;
  const shown = tumbling ? 1 + Math.floor(((t * 22) % 1) * sides) : face;

  ctx.save();
  ctx.translate(R(cx), R(cy));
  ctx.rotate(wob);

  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.ellipse(0, r + 4 * s, r * 0.9, 3 * s, 0, 0, Math.PI * 2);
  ctx.fill();

  // body: a hexagon for d6/d8, a pentagon-ish for d10, a rounded shape for d12/d20
  const n = sides <= 6 ? 4 : sides <= 8 ? 3 : sides <= 10 ? 5 : 6;
  const rot = sides <= 6 ? Math.PI / 4 : -Math.PI / 2;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const g = ctx.createLinearGradient(0, -r, 0, r);
  g.addColorStop(0, '#f2ead6');
  g.addColorStop(1, '#b4ab93');
  ctx.beginPath();
  ctx.moveTo(R(pts[0][0]), R(pts[0][1]));
  for (let i = 1; i < pts.length; i++) ctx.lineTo(R(pts[i][0]), R(pts[i][1]));
  ctx.closePath();
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = '#4a4234';
  ctx.lineWidth = 1;
  ctx.stroke();

  // interior facet lines so it reads as a solid
  ctx.strokeStyle = 'rgba(90,80,60,0.55)';
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    ctx.moveTo(0, 0);
    ctx.lineTo(R(pts[i][0]), R(pts[i][1]));
  }
  ctx.stroke();
  ctx.restore();

  // face number + the die's name
  const big = tumbling ? 'md' : 'lg';
  UI.text(ctx, R(cx), R(cy) - (tumbling ? 4 : 7), String(shown), {
    size: big, color: '#221d16', align: 'center', shadow: false,
  });
  UI.text(ctx, R(cx), R(cy) + r + 8, `d${sides}`, { size: 'sm', color: C.inkDim, align: 'center' });
}

// ===========================================================================
// 7. LEVEL UP
// ===========================================================================

export class LevelUpScene extends AdvanceScene {
  /**
   * @param {Array} chars characters who have earned at least one level
   * @param {object} opts { onDone(chars) }
   */
  constructor(chars, opts = {}) {
    super(chars, opts);
    this.id = 'levelup';
    this.epic = false;
  }

  /** Levels still owed to this character. */
  _unitsLeft(ch) {
    return pendingLevelsFor(ch);
  }

  _buildPreview() {
    const ch = this.ch;
    const classId = this.classId;
    const after = classId ? project(ch, classId) : null;
    const curLevel = safe(() => classLevelOf(ch, classId), 0);
    const sub = safe(() => classEntry(ch, classId)?.subclassId, null);
    const classLine = classId
      ? `${className(classId)} ${curLevel} → ${curLevel + 1}${sub ? ` — ${subclassName(sub)}` : ''}`
      : '';
    const features = classId ? newFeaturesFor(ch, classId, curLevel + 1) : [];
    return { after, classLine, features };
  }

  _query() {
    const opts = this.classId ? { classId: this.classId } : {};
    const list = safe(() => pendingChoicesFor(this.ch, this.newLevel, opts), []) || [];
    // `auto` choices need no player input — progression fills them itself.
    return list.filter((c) => c && !c.auto && arr(c.options).length);
  }

  _apply() {
    const opts = this.classId ? { classId: this.classId } : {};
    return safe(() => applyLevel(this.ch, this.newLevel, this.picks, opts), ['The level could not be applied.']);
  }

  _bannerText() {
    return `${this.ch?.name || 'The hero'} reaches level ${this.newLevel}!`;
  }

  _subText() {
    const ch = this.ch;
    if (!ch) return '';
    const parts = arr(ch.classes).map((c) => `${className(c.id)} ${c.level}`);
    return parts.join(' / ') || `Level ${num(ch.level, 1)}`;
  }
}

// ===========================================================================
// 8. EPIC BOONS — the never-ending ladder past 20
// ===========================================================================

export class EpicBoonScene extends AdvanceScene {
  /**
   * @param {Array} chars 20th-level characters with unspent Mythic tiers
   * @param {object} opts { onDone(chars) }
   */
  constructor(chars, opts = {}) {
    super(chars, opts);
    this.id = 'epicboon';
    this.epic = true;
    this.tier = 1;
  }

  _unitsLeft(ch) { return safe(() => pendingMythic(ch), 0); }

  _startUnit() {
    super._startUnit();
    if (this.ch) this.tier = safe(() => mythicLevel(this.ch), 0) + 1;
  }

  _buildPreview() {
    const info = safe(() => mythicTierInfo(safe(() => mythicLevel(this.ch), 0) + 1), null);
    const after = safe(() => {
      const cl = cloneChar(this.ch);
      // A Mythic tier grants +5 maximum hit points and +1 to an ability.
      cl.maxHp = num(cl.maxHp, 1) + 5;
      return snapshot(cl);
    }, null);
    return {
      after,
      classLine: info ? info.desc : '',
      features: info ? [{ name: `${info.name} — Epic Boon`, desc: info.desc }] : [],
    };
  }

  _query() {
    const list = safe(() => mythicChoicesFor(this.ch), []) || [];
    return list.filter((c) => c && arr(c.options).length);
  }

  _apply() {
    const boonId = oneId(this.picks.boon);
    const ability = oneId(this.picks['boon-ability']);
    const res = safe(() => applyMythic(this.ch, boonId, ability), null);
    if (!res) return ['The boon could not be claimed.'];
    if (!res.ok) return [res.reason || 'The boon could not be claimed.'].concat(arr(res.log));
    return arr(res.log);
  }

  _bannerText() {
    const info = safe(() => mythicTierInfo(this.tier), null);
    return `${this.ch?.name || 'The hero'} becomes ${info ? info.name : 'a legend'}!`;
  }

  _subText() {
    return `Level 20 · Mythic ${Math.max(0, this.tier - 1)} → ${this.tier}`;
  }

  // The ASI board on an Epic Boon spends a single point with a ceiling of 30.
  _asiCap() { return MAX_ABILITY_EPIC; }
  _asiBudget() { return 1; }
}

export default LevelUpScene;
