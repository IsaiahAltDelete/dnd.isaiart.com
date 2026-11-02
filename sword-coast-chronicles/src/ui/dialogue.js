// ui/dialogue.js — DialogueScene: the conversation window used for every NPC on
// the Sword Coast, plus `say()` for one-off lines.
//
// Layout (400x240 logical):
//   y 100..156   choice window (only while a node offers choices)
//   y 162..236   the message box: a 64px gilt-framed painted bust, the speaker's
//                name plate, a drop-cap initial opening each speech, typewriter
//   centre       an animated d20 whenever a [Persuasion 15] style check is rolled
//
// The scene is non-opaque and pauses the scene below, so Phandalin keeps sitting
// behind the window while Toblen Stonehill talks.
//
// Every catalogue this file reads (dialogue, npcs, quests, tables, overworld,
// combat) is pulled in with a dynamic import so a module that has not been
// written yet leaves an empty holder instead of breaking the module graph.

import { UI } from './kit.js';
import { MK } from './menukit.js';
import { ShopScene } from './shop.js';
import { AcademyTrainingScene } from './academy.js';
import { syncAcademy } from '../rules/academy.js';
import { Input } from '../core/input.js';
import { Audio } from '../core/audio.js';
import { Save } from '../core/save.js';
import { Game } from '../engine.js';
import { FX } from '../render/fx.js';
import { VIEW_W, VIEW_H, clamp, titleCase } from '../constants.js';
import { rng, hashStr } from '../core/rng.js';
import { bus, EV, toast } from '../core/events.js';
import { SKILLS, ABILITIES, ABILITY_ABBR } from '../rules/abilities.js';
import { abilityCheck } from '../rules/actions.js';
import {
  createCharacter, recalc, skillMod, abilityMod, abilityScore,
} from '../rules/character.js';
import { recomputeSpells } from '../rules/spellcasting.js';
import { canAttack } from '../rules/crime.js';
import { socialGreeting } from '../rules/reputation.js';
import { noteDeed } from '../rules/deeds.js';
import { isCharmed, socialCheckMods, speakingWithAnimals } from '../rules/fieldworld.js';
import { BEAST_MOMENTS, BEAST_VOICES } from '../data/tables.js';
import { grantXp } from '../rules/progression.js';
import { getSpell } from '../data/spells.js';
import { resolveItem, itemName as catalogueItemName } from '../data/items.js';
import { Party } from '../world/party.js';
import { topicsFor } from './topics.js';
import {
  setFlag, hasFlag, isQuestActive, isQuestDone, startQuest, completeQuest,
  addReputation, advanceTime,
} from '../state.js';

// ===========================================================================
// 0. SAFETY
// ===========================================================================

/** Run `fn`; return `fb` if it throws or produces nothing. Nothing here may throw. */
function safe(fn, fb) {
  try { const v = fn(); return v === undefined || v === null ? fb : v; } catch (e) { return fb; }
}
function sfx(name) { safe(() => Audio.sfx(name), false); }
const arr = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const S = () => Game.state || null;

// --- late catalogues -------------------------------------------------------
// null = still loading, false = absent, object = loaded.
const LATE = {
  dialogue: null, npcs: null, quests: null, tables: null,
  overworld: null, combat: null, scaling: null, combatui: null,
};
function pull(key, path) {
  safe(() => import(/* @vite-ignore */ path)
    .then((m) => { LATE[key] = m || false; })
    .catch(() => { LATE[key] = false; }));
}
pull('dialogue', '../data/dialogue.js');
pull('npcs', '../data/npcs.js');
pull('quests', '../data/quests.js');
pull('tables', '../data/tables.js');
pull('overworld', '../world/overworld.js');
pull('combat', '../rules/combat.js');
pull('scaling', '../rules/scaling.js');
pull('combatui', './combatui.js');

const DIALOGUE = () => (LATE.dialogue && LATE.dialogue.DIALOGUE) || {};
const NPCS = () => (LATE.npcs && LATE.npcs.NPCS) || {};
const RECRUITS = () => arr(LATE.npcs && LATE.npcs.RECRUITS);
const QUESTS = () => (LATE.quests && LATE.quests.QUESTS) || {};
const RUMORS = () => arr(LATE.tables && LATE.tables.RUMORS);
const FACTIONS = () => (LATE.tables && LATE.tables.FACTIONS) || {};

function itemDefOf(id) { return safe(() => resolveItem(id), null); }
function itemLabel(id) {
  return safe(() => itemDefOf(id).name, null) || safe(() => catalogueItemName(id), null)
    || String(id || '').replace(/-/g, ' ');
}
/** "harpers" -> "The Harpers" once tables.js lands, "Harpers" before it does. */
function factionName(id) {
  const f = FACTIONS()[id];
  return (f && (f.name || f.title)) || titleCase(String(id || '').replace(/-/g, ' '));
}

// ===========================================================================
// 1. GEOMETRY
// ===========================================================================

const BOX_X = 4;
const BOX_W = VIEW_W - 8;          // 392
const BOX_H = 74;
const BOX_Y = VIEW_H - BOX_H - 4;  // 162

// The bust is painted 40px square and drawn at whole device-pixel multiples;
// a 60px interior on the 2x layer is 120 device px, so it shows at exactly 3x.
const PORT_S = 64;
const PORT_X = BOX_X + 5;
const PORT_Y = BOX_Y + 5;

const TEXT_X = PORT_X + PORT_S + 8;             // 81
const TEXT_W = BOX_X + BOX_W - 8 - TEXT_X;      // 307
const TEXT_Y = BOX_Y + 11;
const TEXT_LINES = 5;
const TEXT_LH = 9;

// The drop cap opening a speech: the kit's large initial (a 24px box) stands
// beside the first three lines of body text, which start this far in.
const CAP_LINES = 3;
const CAP_INDENT = 29;

const CH_X = 96;
const CH_W = 300;
const CH_ROW = 12;
const CH_MAX_ROWS = 4;

const PAUSE_TIME = 0.34;      // \p hold, in seconds
const ROLL_MIN = 0.85;        // shortest a d20 may stay on screen
const ROLL_HOLD = 2.1;        // auto-advance after this long

// ===========================================================================
// 2. TEXT MARKUP
// ===========================================================================
// Supported inline markup:
//   {name}   the player character's name        {party} a random companion
//   {npc}    the speaker                        {gold}  the party purse
//   [gold]…[/]  [red]…[/]  [blue]…[/]  (also green/purple/cyan/dim/white/yellow)
//   \p       a short dramatic pause

const TAG_COLORS = {
  gold: UI.COLORS.gold, red: UI.COLORS.red, blue: UI.COLORS.blue,
  green: UI.COLORS.green, purple: UI.COLORS.purple, cyan: UI.COLORS.cyan,
  dim: UI.COLORS.inkDim, white: UI.COLORS.inkBright, yellow: UI.COLORS.yellow,
  ink: UI.COLORS.ink,
};
const TAG_RE = /\[(\/?)(gold|red|blue|green|purple|cyan|dim|white|yellow|ink)\]|\[\/\]|\\p/g;

/** Substitute the {…} tokens once, when a page is built. */
function expandTokens(str, speakerName) {
  let s = String(str == null ? '' : str);
  if (s.indexOf('{') < 0) return s;
  const lead = Party.members[0];
  const mates = Party.members.filter((m) => m && m !== lead);
  const mate = mates.length ? safe(() => rng.pick(mates), mates[0]) : lead;
  return s
    .replace(/\{name\}/g, (lead && lead.name) || 'friend')
    .replace(/\{party\}/g, (mate && mate.name) || (lead && lead.name) || 'your companion')
    .replace(/\{npc\}/g, speakerName || 'they')
    .replace(/\{gold\}/g, String(Party.gold | 0))
    .replace(/\{level\}/g, String(Party.levelAvg()));
}

/** Split marked-up text into colour runs, recording the \p pause offsets. */
function parseRuns(str) {
  const src = String(str == null ? '' : str);
  const runs = [];
  const pauses = new Set();
  const stack = [];
  let plain = '';
  const push = (text) => {
    if (!text) return;
    runs.push({ text, color: stack.length ? stack[stack.length - 1] : null });
    plain += text;
  };
  TAG_RE.lastIndex = 0;
  let last = 0;
  let m = TAG_RE.exec(src);
  while (m) {
    push(src.slice(last, m.index));
    last = TAG_RE.lastIndex;
    const tok = m[0];
    if (tok === '\\p') pauses.add(plain.length);
    else if (tok === '[/]' || m[1] === '/') stack.pop();
    else stack.push(TAG_COLORS[m[2]] || null);
    m = TAG_RE.exec(src);
  }
  push(src.slice(last));
  return { runs, pauses, plain, length: plain.length };
}

let _advCache = null;
/** Pixels of advance per glyph — the bitmap font is fixed-pitch, so this is exact. */
function advOf(size) {
  if (!_advCache) _advCache = {};
  if (_advCache[size] == null) {
    _advCache[size] = safe(() => UI.measure('nn', size) - UI.measure('n', size), 6) || 6;
  }
  return _advCache[size];
}

/**
 * Wrap the runs into drawable line segments.
 * -> [{ start, ind, segs:[{ text, color, off }] }]  where `start` is the absolute
 * character index of the line, `ind` its indent in px (the lines beside a drop
 * cap) and `off` the segment's offset inside it.
 * indent: { lines, px } narrows the first `lines` lines by `px`.
 */
function layoutRuns(parsed, maxW, size, indent = null) {
  const adv = advOf(size);
  const fullChars = Math.max(1, Math.floor((maxW + 1) / adv));
  const plain = parsed.plain;
  const n = plain.length;

  // per-character colour, so segments can be regrouped after wrapping
  const cols = new Array(n);
  let k = 0;
  for (const r of parsed.runs) for (let i = 0; i < r.text.length; i++) cols[k++] = r.color;

  const lines = [];
  let i = 0;
  let guard = 0;
  while (i <= n && guard++ < 4000) {
    if (i === n && lines.length) break;
    const ind = indent && lines.length < indent.lines ? indent.px : 0;
    const maxChars = ind ? Math.max(1, Math.floor((maxW - ind + 1) / adv)) : fullChars;
    const hardEnd = Math.min(n, i + maxChars);
    const nl = plain.indexOf('\n', i);
    let start = i;
    let end;
    if (nl >= 0 && nl <= hardEnd) { end = nl; i = nl + 1; }
    else if (hardEnd >= n) { end = n; i = n + 1; }
    else {
      let cut = hardEnd;
      while (cut > start && plain[cut] !== ' ') cut--;
      if (cut <= start) cut = hardEnd;            // one very long word: hard break
      end = cut;
      i = cut;
      while (i < n && plain[i] === ' ') i++;
      if (i <= start) i = start + 1;              // never stall
    }
    // regroup [start,end) into same-colour segments
    const segs = [];
    let sIdx = start;
    while (sIdx < end) {
      const c = cols[sIdx];
      let e = sIdx;
      while (e < end && cols[e] === c) e++;
      segs.push({ text: plain.slice(sIdx, e), color: c, off: sIdx - start });
      sIdx = e;
    }
    lines.push({ start, ind, segs });
    if (i > n) break;
  }
  return lines;
}

/**
 * Lift the opening letter off a parsed page to be drawn as a drop cap. Only a
 * plain letter qualifies: a speech that opens on a quotation mark, an ellipsis
 * or an *action* keeps its first character in the line. A one-letter first
 * word ("A", "I") loses the space after it too, since the cap stands apart.
 */
function takeInitial(parsed) {
  const first = parsed.plain.charAt(0);
  if (!/^\p{L}$/u.test(first) || parsed.plain.length < 12) return null;
  let cut = 1;
  if (parsed.plain.charAt(1) === ' ') cut = 2;
  let left = cut;
  for (const r of parsed.runs) {
    if (!left) break;
    const k = Math.min(left, r.text.length);
    r.text = r.text.slice(k);
    left -= k;
  }
  parsed.runs = parsed.runs.filter((r) => r.text.length);
  parsed.plain = parsed.plain.slice(cut);
  parsed.length = parsed.plain.length;
  parsed.pauses = new Set([...parsed.pauses].map((at) => Math.max(0, at - cut)));
  return first;
}

// ===========================================================================
// 3. SKILL-CHECK TAGS
// ===========================================================================

// "[Persuasion 15]", "[Insight DC 12]", "[STR 13]" — parsed straight out of the
// choice text so a writer never has to hand-build a check object.
const CHECK_RE = /\[\s*([A-Za-z][A-Za-z' -]*?)\s+(?:DC\s*)?(\d{1,2})\s*\]/;

function skillIdFor(label) {
  const key = String(label || '').trim().toLowerCase().replace(/\s+/g, '-');
  if (SKILLS[key]) return key;
  const alt = key.replace(/-/g, '');
  for (const id of Object.keys(SKILLS)) if (id.replace(/-/g, '') === alt) return id;
  return null;
}

function abilityIdFor(label) {
  const key = String(label || '').trim().toLowerCase();
  if (ABILITIES.includes(key)) return key;
  for (const ab of ABILITIES) {
    if (String(ABILITY_ABBR[ab]).toLowerCase() === key) return ab;
    if (key.startsWith(ab)) return ab;
  }
  return null;
}

/** -> { label, tag, check:{skill, ability, dc} } — `tag` is the visible "[…]" part. */
function parseCheckTag(text) {
  const s = String(text == null ? '' : text);
  const m = CHECK_RE.exec(s);
  if (!m) return { label: s, tag: null, check: null };
  const skill = skillIdFor(m[1]);
  const ability = skill ? SKILLS[skill].ability : abilityIdFor(m[1]);
  if (!skill && !ability) return { label: s, tag: null, check: null };
  const label = (s.slice(0, m.index) + s.slice(m.index + m[0].length)).replace(/\s{2,}/g, ' ').trim();
  return {
    label: label || s,
    tag: m[0].trim(),
    check: { skill, ability: ability || 'cha', dc: parseInt(m[2], 10) || 10 },
  };
}

/**
 * The companion with the best odds — a party sends its face to do the talking.
 *
 * `skillMod` already folds in a buff's `skillBonus` and `advSkill`, so Disguise
 * Self and Pass Without Trace count here on their own. The rest of the field
 * buffs — Guidance's bonus die, Enhance Ability's Advantage — live in
 * `socialCheckMods`, which is what makes the choice of speaker honest: the
 * cleric with Guidance up should be the one who opens their mouth.
 */
function bestChecker(skill, ability) {
  let best = null;
  let bm = -99;
  for (const m of Party.members) {
    if (!m || m.hp <= 0) continue;
    let v = skill ? safe(() => skillMod(m, skill).mod, 0) : safe(() => abilityMod(m, ability), 0);
    const mods = safe(() => socialCheckMods(m, skill, ability), null);
    if (mods) {
      // Advantage is worth roughly +3.3 on a d20; a d4 of Guidance is +2.5.
      v += mods.bonus + (mods.adv ? 3 : 0) - (mods.dis ? 3 : 0) + mods.dice.length * 2;
    }
    if (v > bm) { bm = v; best = m; }
  }
  return best || Party.members[0] || null;
}

// ===========================================================================
// 4. CONDITIONS  —  if:{ flag, quest, gold, level, faction, item, ability }
// ===========================================================================

/**
 * -> { ok, reason, hide }
 * Narrative gates (flags, quests, species) hide the choice entirely; resource
 * gates (gold, level, items, reputation, ability scores) show it greyed with the
 * reason, because "you can see what you cannot yet afford" is better play.
 */
function evalIf(cond, scene) {
  if (!cond) return { ok: true, reason: '', hide: false };
  if (Array.isArray(cond)) {
    for (const c of cond) { const r = evalIf(c, scene); if (!r.ok) return r; }
    return { ok: true, reason: '', hide: false };
  }
  if (typeof cond === 'string') return evalIf({ flag: cond }, scene);
  if (typeof cond === 'function') {
    const v = safe(() => cond(scene), true);
    return v ? { ok: true, reason: '', hide: false } : { ok: false, reason: '', hide: true };
  }
  if (!isObj(cond)) return { ok: true, reason: '', hide: false };

  if (cond.notRecruited && Party.all().some(m => m?.recruitId === cond.notRecruited)) {
    return { ok: false, reason: '', hide: true };
  }

  const st = S();
  const fail = (reason, hide) => ({
    ok: false,
    reason: cond.reason != null ? String(cond.reason) : reason,
    hide: cond.hide != null ? !!cond.hide : (cond.grey ? false : !!hide),
  });

  if (cond.not) { const r = evalIf(cond.not, scene); if (r.ok) return fail('', true); }
  if (cond.all) { const r = evalIf(arr(cond.all), scene); if (!r.ok) return r; }
  if (cond.any) {
    const list = arr(cond.any);
    if (list.length && !list.some((c) => evalIf(c, scene).ok)) return fail('', true);
  }

  // --- flags -------------------------------------------------------------
  for (const f of arr(cond.flag)) {
    const name = isObj(f) ? f.name : String(f);
    const want = isObj(f) ? (f.value === undefined ? true : f.value) : true;
    const has = st ? hasFlag(st, name) : false;
    if (!!has !== !!want) return fail('', true);
  }
  for (const f of arr(cond.notFlag ?? cond.noFlag)) {
    if (st && hasFlag(st, String(f))) return fail('', true);
  }

  // --- enchantment -------------------------------------------------------
  // `if: { charmed: true }` opens a line only while this NPC is under Charm
  // Person or Suggestion. It cannot be a plain flag test: the flag holds the
  // minute the charm lapses, so `hasFlag` would keep returning true forever.
  if (cond.charmed != null) {
    const who = cond.charmed === true ? (scene && scene.npcId) : String(cond.charmed);
    const on = !!(st && who && safe(() => isCharmed(st, who), false));
    if (on !== (cond.charmed !== false)) return fail('', true);
  }
  if (cond.notCharmed) {
    const who = cond.notCharmed === true ? (scene && scene.npcId) : String(cond.notCharmed);
    if (st && who && safe(() => isCharmed(st, who), false)) return fail('', true);
  }

  // --- quests ------------------------------------------------------------
  for (const q of arr(cond.quest ?? cond.questActive)) {
    if (!st || !isQuestActive(st, String(q))) return fail('', true);
  }
  for (const q of arr(cond.questDone)) {
    if (!st || !isQuestDone(st, String(q))) return fail('', true);
  }
  for (const q of arr(cond.questNot ?? cond.noQuest)) {
    if (st && (isQuestActive(st, String(q)) || isQuestDone(st, String(q)))) return fail('', true);
  }

  // --- purse, level ------------------------------------------------------
  if (cond.gold != null && Party.gold < Number(cond.gold)) {
    return fail(`${Number(cond.gold)} gp`, false);
  }
  if (cond.level != null && Party.levelMax() < Number(cond.level)) {
    return fail(`Level ${Number(cond.level)}`, false);
  }

  // --- carried items -----------------------------------------------------
  for (const it of arr(cond.item)) {
    const id = isObj(it) ? (it.id || it.item) : String(it);
    const qty = isObj(it) ? (it.qty || it.count || 1) : 1;
    const held = Party.countItem(id) + Party.members.reduce(
      (a, m) => a + arr(m && m.inventory).reduce((b, e) => b + (e.id === id ? (e.qty || 1) : 0), 0), 0);
    if (held < qty) return fail(qty > 1 ? `${qty}× ${itemLabel(id)}` : itemLabel(id), false);
  }

  // --- reputation --------------------------------------------------------
  const facs = cond.faction != null ? cond.faction : cond.rep;
  if (facs != null) {
    for (const f of arr(facs)) {
      const id = isObj(f) ? (f.id || f.faction) : String(f);
      const min = isObj(f) ? (f.min ?? f.value ?? 1) : (cond.repMin ?? 1);
      const have = (st && st.reputation && st.reputation[id]) || 0;
      if (have < min) return fail(`${factionName(id)} ${min}`, false);
    }
  }

  // --- ability scores ----------------------------------------------------
  if (isObj(cond.ability)) {
    const pairs = cond.ability.ability
      ? [[cond.ability.ability, cond.ability.min ?? cond.ability.value ?? 13]]
      : Object.entries(cond.ability);
    for (const [ab, min] of pairs) {
      if (!ABILITIES.includes(ab)) continue;
      const best = Party.members.reduce((a, m) => Math.max(a, safe(() => abilityScore(m, ab), 10)), 0);
      if (best < Number(min)) return fail(`${ABILITY_ABBR[ab]} ${min}`, false);
    }
  }

  // --- party composition -------------------------------------------------
  for (const c of arr(cond.classId ?? cond.class)) {
    if (!Party.members.some((m) => arr(m && m.classes).some((k) => k.id === c))) return fail('', true);
  }
  for (const sp of arr(cond.species ?? cond.speciesId)) {
    if (!Party.members.some((m) => m && m.speciesId === sp)) return fail('', true);
  }

  return { ok: true, reason: '', hide: false };
}

// ===========================================================================
// 5. RUMOURS
// ===========================================================================

/** A rotating rumour: same speaker, same day, same line — a new one tomorrow. */
function rumorLine(seedKey) {
  const st = S();
  const day = (st && st.day) || 1;
  const lvl = Party.levelMax();
  const pool = RUMORS().filter((r) => {
    if (!r) return false;
    if (typeof r === 'string') return true;
    if (r.minLevel != null && lvl < r.minLevel) return false;
    if (r.flag && st && !hasFlag(st, r.flag)) return false;
    return true;
  });
  if (!pool.length) return null;
  const i = hashStr(`${seedKey}:${day}`) % pool.length;
  const r = pool[i];
  return typeof r === 'string' ? r : (r.text || r.line || r.desc || null);
}

// ===========================================================================
// 6. THE SCENE
// ===========================================================================

export class DialogueScene {
  /**
   * @param {string|object} dialogueId  a DIALOGUE key, or an inline {start,nodes} tree
   * @param {object} npc                NPCS entry / Character used for the bust
   * @param {object} opts               { node, speaker, rumor, onClose, shopId, tint }
   */
  constructor(dialogueId, npc = null, opts = {}) {
    this.opaque = false;         // Phandalin keeps showing through
    this.pausesBelow = true;
    this.uiLayer = true;         // …but the rain does not fall on the text box
    this.id = 'dialogue';

    this.dialogueId = typeof dialogueId === 'string' ? dialogueId : (opts.id || 'inline');
    this.inlineTree = isObj(dialogueId) ? dialogueId : (opts.tree || null);
    this.npc = npc || null;
    this.npcId = (npc && (npc.npcId || npc.id)) || (typeof dialogueId === 'string' ? dialogueId : 'stranger');
    this.opts = opts || {};
    this.onClose = opts.onClose || null;

    this.tree = null;
    this.node = null;
    this.nodeId = null;
    this.startNode = opts.node || opts.start || null;

    this.mode = 'text';          // 'text' | 'choose' | 'roll'
    this.pages = [];
    this.page = 0;
    this.shown = 0;
    this.holdT = 0;
    this.seenPause = new Set();

    this.choices = [];
    this.authoredCount = 0;      // how many of `choices` the writer wrote
    this._entryIds = null;       // lazily-walked "opening of the tree" node ids
    this.index = 0;
    this.listTop = 0;
    this._choiceMouseX = Input.mouse?.x;
    this._choiceMouseY = Input.mouse?.y;

    this.roll = null;            // { display, res, choice, t }
    this.t = 0;
    this.waitT = 0;
    this.footer = null;          // transient status line
    this.footerT = 0;
    this._closed = false;
    this._started = false;
    this._announced = false;
  }

  // --- lifecycle ---------------------------------------------------------

  enter() {
    safe(() => Input.flush());
    this._resolveTree();
    if (!this._announced) {
      this._announced = true;
      safe(() => bus.emit(EV.DIALOGUE_OPEN, { id: this.dialogueId, npc: this.npcId }));
      const st = S();
      if (st) {
        st.npcState = st.npcState || {};
        const rec = st.npcState[this.npcId] || { met: false, talkCount: 0 };
        rec.met = true;
        rec.talkCount = (rec.talkCount || 0) + 1;
        st.npcState[this.npcId] = rec;
      }
    }
  }

  exit() { /* the window simply stops drawing */ }

  /** Resolve the dialogue tree once data/dialogue.js has landed. */
  _resolveTree() {
    if (this.tree) return;
    if (this.inlineTree && isObj(this.inlineTree.nodes)) {
      this.tree = this.inlineTree;
    } else if (LATE.dialogue === null && this.waitT < 1.5) {
      return;                                   // still loading; try again next frame
    } else {
      const found = DIALOGUE()[this.dialogueId];
      this.tree = isObj(found) && isObj(found.nodes) ? found : this._fallbackTree();
      // An authored animal scene is written as something you WATCH — the dog
      // asleep across the bridge road, the cat declining to move. That is the
      // right scene when you cannot talk to it. With Speak with Animals up it
      // should not be the only scene, so the beast gets a spoken opening and
      // the authored one stays underneath it.
      if (this.tree !== this._lastBeastWrap && this._isBeast()
        && safe(() => speakingWithAnimals(S()), false)) {
        this.tree = this._withBeastVoice(this.tree);
        this._lastBeastWrap = this.tree;
      }
    }
    if (!this._started) {
      this._started = true;
      this._goto(this.startNode || this.tree.start || Object.keys(this.tree.nodes)[0]);
    }
  }

  /**
   * Something to say when there is no authored tree.
   *
   * The NPC's own `greeting` comes first: it is per-character, it may be an
   * array of lines to vary between visits, and it is what makes a crowd of
   * flavour townsfolk feel like a crowd rather than one person copied sixty
   * times. Before this, every treeless NPC in the game said the identical
   * sentence about goblins on the Triboar Trail.
   */
  _fallbackTree() {
    // An animal is not a townsperson who has run out of things to say. It has
    // no Common at all, so it must never reach the generic human line below —
    // a sow, a goose and a crow used to greet you identically, in words, about
    // goblins on the Triboar Trail.
    if (this._isBeast()) return this._beastTree();

    const g = this.npc && this.npc.greeting;
    let line = '';
    if (Array.isArray(g) && g.length) {
      // Seeded on the npc id so one person keeps one line within a visit, but
      // the cast as a whole is not reciting in unison.
      line = g[Math.abs(hashStr(String(this.npcId || '') + this.visitSalt())) % g.length];
    } else if (typeof g === 'string' && g.trim()) {
      line = g.trim();
    }
    if (!line) {
      line = (this.opts.rumor && rumorLine(this.npcId))
        || 'Well met. Keep to the Triboar Trail after dark — the goblins have grown bold.';
    }
    return { start: 'n1', nodes: { n1: { text: line } } };
  }

  /** The NPC record behind this conversation, however it was addressed. */
  _record() {
    const n = this.npc;
    if (n && typeof n === 'object' && (n.tag || n.species || n.sprite)) return n;
    const id = this.npcId || (n && (n.npcId || n.id));
    return (id && NPCS()[id]) || null;
  }

  /** Is the thing in front of us a beast rather than a person? */
  _isBeast() {
    const r = this._record();
    if (!r) return false;
    return r.tag === 'animal' || r.species === 'beast';
  }

  /** One line from a per-species table, stable for this animal for this visit. */
  _beastLine(table) {
    const r = this._record() || {};
    const rows = table[r.sprite] || table.default || [''];
    const i = Math.abs(hashStr(String(this.npcId || r.sprite || '') + this.visitSalt())) % rows.length;
    return rows[i];
  }

  /**
   * Put the animal's own voice in front of an authored scene, with a way into
   * the scene underneath. The authored nodes are untouched — this only adds a
   * new start node — so nothing an author wrote is lost or rewritten.
   */
  _withBeastVoice(tree) {
    const r = this._record() || {};
    const inner = tree.start || Object.keys(tree.nodes)[0];
    return {
      start: '_beast',
      nodes: {
        ...tree.nodes,
        _beast: {
          text: this._beastLine(BEAST_VOICES),
          speaker: r.name || null,
          beast: true,
          choices: [
            { text: 'Watch it a while.', goto: inner },
            { text: 'Leave it be.', goto: 'close', cancel: true },
          ],
        },
      },
    };
  }

  /**
   * What a beast gives you.
   *
   * Without Speak with Animals you get an observation: what it does, in the
   * third person, with no speech in it. With the spell up it actually answers,
   * and the answers stay inside the 2024 rule that a beast's knowledge is
   * bounded by its intelligence — the here, the now, the recent, and food.
   */
  _beastTree() {
    const r = this._record() || {};
    const speaking = safe(() => speakingWithAnimals(S()), false);
    if (!speaking) {
      const text = this._beastLine(BEAST_MOMENTS);
      return { start: 'n1', nodes: { n1: { text, speaker: r.name || null, beast: true } } };
    }
    return {
      start: 'n1',
      nodes: {
        n1: {
          text: this._beastLine(BEAST_VOICES),
          speaker: r.name || null,
          beast: true,
          choices: [
            { text: 'Watch it instead.', goto: 'watch' },
            { text: 'Leave it be.', goto: 'close', cancel: true },
          ],
        },
        watch: { text: this._beastLine(BEAST_MOMENTS), speaker: r.name || null, beast: true },
      },
    };
  }

  /** Changes slowly, so a second conversation can draw a different line. */
  visitSalt() {
    const st = S();
    return String(Math.floor(Number(st && st.time) / 180) || 0) + ':' + String((st && st.day) || 0);
  }

  // --- node navigation ---------------------------------------------------

  _goto(id) {
    if (id == null || id === 'close' || id === 'end' || id === false) { this._close(); return; }
    const node = this.tree && this.tree.nodes ? this.tree.nodes[id] : null;
    if (!node) { this._close(); return; }
    this.nodeId = id;
    this.node = node;
    this.mode = 'text';
    this.index = 0;
    this.listTop = 0;
    this.roll = null;

    if (node.once && S()) setFlag(S(), `seen:${this.dialogueId}:${id}`, true);
    if (node.do) {
      const r = this._runDo(node.do);
      if (r.close) { this._close(); return; }
      if (r.goto) { this._goto(r.goto); return; }
    }

    this._buildPages(node);
    this._buildChoices(node);
  }

  _speakerName(node) {
    return (node && node.speaker)
      || this.opts.speaker
      || (this.npc && (this.npc.name || this.npc.title))
      || 'Stranger';
  }

  _buildPages(node) {
    const name = this._speakerName(node);
    let raw = node.text != null ? node.text : node.lines;
    if (node.rumor || (this.opts.rumor && node.allowRumor !== false && !raw)) {
      const line = rumorLine(`${this.npcId}:${this.nodeId}`);
      if (line) raw = raw ? `${raw}\n\n${line}` : line;
    }
    let pages = Array.isArray(raw) ? raw.slice() : String(raw == null ? '' : raw).split(/\n\s*\n/);
    pages = pages.map((p) => String(p == null ? '' : p).trim()).filter((p) => p.length);
    if (!pages.length) pages = ['…'];
    if (!this._socialGreeted) {
      this._socialGreeted = true;
      // Add one opening beat, preserving every authored line and quest choice.
      const map = Game.scenes.find(s => s.id === 'overworld')?.map;
      const greeting = !this._isBeast() && socialGreeting(S(), this.npc || this._record(), map);
      if (greeting) pages.unshift(greeting);
    }
    this.pages = pages.map((p, i) => {
      const parsed = parseRuns(expandTokens(p, name));
      // A speech opens with a drop cap, the way a chapter does in a book of
      // hours; the pages after it inside the same speech run on without one.
      const cap = i === 0 ? takeInitial(parsed) : null;
      const lines = layoutRuns(parsed, TEXT_W, 'sm', cap ? { lines: CAP_LINES, px: CAP_INDENT } : null);
      return { ...parsed, cap, lines };
    });
    this.page = 0;
    this.shown = 0;
    this.holdT = 0;
    this.seenPause = new Set();
  }

  _buildChoices(node) {
    const out = [];
    const st = S();
    arr(node && node.choices).forEach((raw, i) => {
      if (!raw) return;
      const c = typeof raw === 'string' ? { text: raw } : raw;
      const parsed = parseCheckTag(expandTokens(c.text || c.label || '…', this._speakerName(node)));
      const check = c.check ? { dc: 10, ability: 'cha', ...c.check } : parsed.check;
      if (check && !check.skill && check.ability == null) check.ability = 'cha';

      const gate = evalIf(c.if || c.cond, this);
      // A one-shot check that has already been failed stays visible but spent.
      const spentKey = check && (check.once || c.once)
        ? `check:${this.dialogueId}:${this.nodeId}:${i}` : null;
      const spent = spentKey && st ? hasFlag(st, spentKey) : false;

      if (!gate.ok && gate.hide) return;
      out.push({
        raw: c,
        index: i,
        label: parsed.label.replace(/\[(?:\/?(?:gold|red|blue|green|purple|cyan|dim|white|yellow|ink)|\/)\]/g, ''),
        tag: check ? (parsed.tag || `[${checkLabel(check)} ${check.dc}]`) : null,
        check,
        spentKey,
        disabled: !gate.ok || spent,
        reason: spent ? 'already tried' : gate.reason,
      });
    });
    // How many choices the WRITER put on this node. The "Draw your weapon."
    // line below is appended by the engine, and _advancePage has to be able to
    // tell the two apart: an engine-added option must never be the reason a
    // node stops and shows a menu instead of following its own `goto`.
    this.authoredCount = out.length;

    // Topics the world modules registered (ui/topics.js): the news, the work
    // going, the job you came back to report. Opening menu only, like the attack.
    for (const t of this._topics(node)) {
      out.push({ raw: { topic: t.id }, index: -1, label: t.label, tag: null, check: null, spentKey: null, topic: t, disabled: false, reason: null });
    }

    // --- the option that is always on the table -----------------------------
    //
    // Baldur's Gate 3's rule: you may always draw steel. It is a terrible idea
    // and the game lets you find that out yourself. Only the opening node
    // carries it, so it never interrupts a scripted exchange mid-flow, and
    // never on a node that is already a fight or a shop.
    if (this._canOfferAttack(node)) {
      out.push({
        raw: { attack: true },
        index: -1,
        label: 'Draw your weapon.',
        tag: null,
        check: null,
        spentKey: null,
        attack: true,
        disabled: false,
        reason: null,
      });
    }

    this.choices = out;
    this.index = out.findIndex((c) => !c.disabled);
    if (this.index < 0) this.index = 0;
  }

  /**
   * The nodes that count as "the opening of the conversation".
   *
   * Most trees are written as a start node that is pure narration and defers to
   * a hub with `goto: 'hub'`. The player never gets a menu on the start node, so
   * pinning "Draw your weapon." to `tree.start` alone put it on a node that has
   * no menu — which is what forced the whole conversation into an attack-only
   * choice list. The opening is therefore the start node PLUS every node reached
   * from it by nothing but `goto`/`next`, up to and including the first one that
   * carries choices of its own. Purely structural: no `do:` block is run here.
   */
  _entryNodes() {
    if (this._entryIds) return this._entryIds;
    const ids = new Set();
    const nodes = (this.tree && this.tree.nodes) || {};
    let id = this.startNode || (this.tree && this.tree.start) || null;
    for (let i = 0; i < 64 && id != null && nodes[id] && !ids.has(id); i++) {
      ids.add(id);
      const n = nodes[id];
      if (Array.isArray(n.choices) && n.choices.length) break;   // the menu itself
      const nxt = n.goto ?? n.next;
      id = (nxt === 'close' || nxt === 'end' || nxt === false) ? null : nxt;
    }
    this._entryIds = ids;
    return ids;
  }

  /** The ui/topics.js context for this conversation. */
  _topicCtx() {
    const record = this._record();
    const npcId = (this.npc && this.npc.npcId) || (record && record.id) || this.npcId;
    return { st: S(), npcId, npc: this.npc, record, back: 'topic:back', dialogue: this };
  }

  /** Registered topics for this node: the opening of a conversation with a person. */
  _topics(node) {
    if (!node || !this.npc || !this._entryNodes().has(this.nodeId)) return [];
    if ((this.tree && this.tree.noTopics) || node.noTopics || this._isBeast()) return [];
    return safe(() => topicsFor(this._topicCtx()), []);
  }

  /**
   * Play a topic's tree inside this conversation. Its nodes join the tree, and
   * `topic:back` is the menu the topic was picked from — the same choices,
   * without replaying that node's narration or its `do:` block.
   */
  _openTopic(t) {
    const back = this.nodeId;
    const tree = safe(() => t.run(this._topicCtx()), null);
    if (!tree || !isObj(tree.nodes) || !tree.nodes[tree.start]) { this._say('They have nothing to say about that.'); return; }
    this._homeNodes = this._homeNodes || this.tree.nodes;
    const home = (back === 'topic:back' ? this.tree.nodes[back] : this._homeNodes[back]) || {};
    const backNode = { ...home, text: tree.backText || 'Anything else?', do: undefined, once: false, goto: undefined, next: undefined };
    this.tree = { ...this.tree, nodes: { ...this._homeNodes, ...tree.nodes, 'topic:back': backNode } };
    this._entryNodes().add('topic:back');
    this._goto(tree.start);
  }

  /** Is "Draw your weapon" a legal thing to offer on this node? */
  _canOfferAttack(node) {
    if (!node || !this._entryNodes().has(this.nodeId)) {
      // Only the opening of the tree, unless the writer explicitly asked for it.
      if (!node || !node.allowAttack) return false;
    }
    if (this.tree && this.tree.noCombat) return false;
    if (node && node.noCombat) return false;
    if (!this.npc) return false;
    // The NPCS record carries `tag`/`essential`; the entity may only be a sprite
    // that maps.js placed, so fall back to the catalogue before deciding.
    // The entity may be `this.npc`, and its own catalogue record may hang off
    // `.npc`. Fall back to the catalogue keyed on the ENTITY's npcId — this.npcId
    // is derived from `id` first, which for an entity is 'npc-toblen', not a key.
    const record = (this.npc && this.npc.npc)
      || NPCS()[(this.npc && this.npc.npcId) || this.npcId]
      || NPCS()[this.npcId]
      || this.npc;
    const gate = safe(() => canAttack(record, this.npc), { ok: false });
    return !!(gate && gate.ok);
  }

  /** The player chose violence. Hand it to the overworld, which owns the crime. */
  _doAttack() {
    const ow = LATE.overworld;
    const target = this.opts.entity || (this.npc && this.npc.kind === 'npc' ? this.npc : null);
    this._closed = true;
    if (Game.top === this) Game.pop();
    if (!ow || !target) { safe(() => toast('There is no one here to fight.')); return; }
    const scene = Game.top;
    if (scene && typeof scene.attackNPC === 'function') safe(() => scene.attackNPC(target));
    else safe(() => toast('The moment passes.'));
  }

  // --- update ------------------------------------------------------------

  update(dt) {
    this.t += dt;
    this.waitT += dt;
    if (this.footerT > 0) { this.footerT -= dt; if (this.footerT <= 0) this.footer = null; }
    if (!this.tree) { this._resolveTree(); if (!this.tree) return; }
    if (this._closed) return;

    if (this.mode === 'roll') this._updateRoll(dt);
    else if (this.mode === 'choose') this._updateChoose();
    else this._updateText(dt);
  }

  /**
   * Typewriter speed in characters per second, from Save.settings.textSpeed.
   * 'instant' comes back as Infinity, which _updateText reads as "print the
   * whole page this frame".
   */
  _cps() {
    let v = safe(() => Save.textSpeedCps(), null);
    if (v == null) {
      const named = safe(() => Save.settings.textSpeed, 'normal');
      v = { slow: 18, normal: 42, fast: 90, instant: Infinity }[named];
    }
    return typeof v === 'number' && v > 0 ? v : 42;
  }

  _updateText(dt) {
    const pg = this.pages[this.page];
    if (!pg) { this._advancePage(); return; }
    const done = this.shown >= pg.length;

    if (!done) {
      if (this.holdT > 0) this.holdT -= dt;
      else {
        const at = Math.floor(this.shown);
        if (pg.pauses.has(at) && !this.seenPause.has(at)) {
          this.seenPause.add(at);
          this.holdT = PAUSE_TIME;
        } else {
          const cps = this._cps();
          this.shown = Math.min(pg.length, this.shown + (cps === Infinity ? pg.length : cps * dt));
        }
      }
    }

    const m = Input.mouse;
    const clicked = !!(m && m.clicked && m.y >= BOX_Y - 8);
    const pressed = Input.consume('confirm') || Input.consume('interact') || clicked;
    if (clicked && m) m.clicked = false;
    const skipped = Input.consume('cancel');

    if (pressed || skipped) {
      if (this.shown < pg.length) {
        // First press fills the line; the second one turns the page.
        this.shown = pg.length;
        this.holdT = 0;
        sfx('cursor');
      } else {
        this._advancePage();
      }
    }
  }

  _advancePage() {
    if (this.page + 1 < this.pages.length) {
      this.page++;
      this.shown = 0;
      this.holdT = 0;
      this.seenPause = new Set();
      sfx('page');
      return;
    }
    const nxt = this.node && (this.node.goto ?? this.node.next);
    // A node's own `goto` outranks the engine-appended "Draw your weapon.":
    // stopping on an option the writer never wrote would strand the player in a
    // one-item menu and hide the whole rest of the tree. Only authored choices
    // hold the conversation here — or an engine option on a node that has
    // nowhere else to go, which is the one place it is the entire menu.
    if (this.choices.length && (this.authoredCount > 0 || !nxt)) {
      this.mode = 'choose';
      sfx('cursor');
      return;
    }
    sfx('select');
    if (nxt) this._goto(nxt); else this._close();
  }

  _moveCursor(delta) {
    const n = this.choices.length;
    if (n < 2) return;
    let i = this.index;
    for (let step = 0; step < n; step++) {
      i = (i + delta + n) % n;
      if (!this.choices[i].disabled) break;
    }
    if (i !== this.index) { this.index = i; sfx('cursor'); }
  }

  _updateChoose() {
    const up = Input.repeatConsume('up'), down = Input.repeatConsume('down');
    if (up) this._moveCursor(-1);
    if (down) this._moveCursor(1);

    const L = this._choiceLayout();
    const m = Input.mouse;
    const moved = m && (m.x !== this._choiceMouseX || m.y !== this._choiceMouseY);
    if (m) { this._choiceMouseX = m.x; this._choiceMouseY = m.y; }
    if (m && m.over && (m.clicked || (moved && !up && !down))) {
      for (let r = 0; r < L.rows; r++) {
        const i = this.listTop + r;
        if (i >= this.choices.length) break;
        const ry = L.listY + r * CH_ROW;
        if (m.x >= L.listX && m.x <= L.listX + L.listW && m.y >= ry && m.y < ry + CH_ROW) {
          if (this.index !== i && !this.choices[i].disabled) { this.index = i; sfx('cursor'); }
          if (m.clicked) { m.clicked = false; this._pick(); }
          break;
        }
      }
    }

    // Number keys jump straight to a choice, the way a keyboard player expects.
    for (let k = 0; k < 5; k++) {
      if (Input.consume(`tab${k + 1}`) && k < this.choices.length && !this.choices[k].disabled) {
        this.index = k;
        this._pick();
        return;
      }
    }

    if (Input.consume('confirm') || Input.consume('interact')) this._pick();
    if (Input.consume('cancel')) {
      const bail = this.choices.findIndex((c) => !c.disabled && (c.raw.cancel || c.raw.leave));
      if (bail >= 0) { this.index = bail; this._pick(); }
      else if (this.node && this.node.cancelable !== false) { sfx('back'); this._close(); }
      else sfx('error');
    }
  }

  _pick() {
    const c = this.choices[this.index];
    if (!c) { this._close(); return; }
    if (c.disabled) {
      sfx('error');
      this._say(c.reason ? `You need ${c.reason}.` : 'Not just now.');
      return;
    }
    if (c.attack) { sfx('select'); this._doAttack(); return; }
    if (c.topic) { sfx('select'); this._openTopic(c.topic); return; }
    if (c.check) { this._beginRoll(c); return; }
    sfx('select');
    this._resolveChoice(c, true);
  }

  /** Roll the gate, then show the d20 before the story branches. */
  _beginRoll(c) {
    const skill = c.check.skill || null;
    const ability = skill ? SKILLS[skill].ability : (c.check.ability || 'cha');
    const who = bestChecker(skill, ability);

    // Everything the party has going for it that abilityCheck cannot see on its
    // own: Guidance's die, Enhance Ability's Advantage, a flat check bonus off a
    // condition. Without this, casting Guidance before a [Persuasion 15] gate
    // changed precisely nothing, which made the cantrip a decoration.
    const mods = safe(() => socialCheckMods(who, skill, ability), null)
      || { bonus: 0, adv: false, dis: false, dice: [], why: [], spend: () => {}, rollDice: () => 0 };
    // A charmed listener is arguing with a friend. Advantage, per the condition.
    const charmed = !!(S() && this.npcId && safe(() => isCharmed(S(), this.npcId), false));

    const res = safe(() => abilityCheck(null, who, ability, {
      skill: skill || undefined,
      dc: c.check.dc,
      bonus: mods.bonus + safe(() => mods.rollDice(), 0),
      adv: !!c.check.adv || mods.adv || charmed,
      advReason: charmed ? 'they think you are a friend' : (mods.why[0] || 'a spell'),
      dis: (!!c.check.dis || mods.dis) && !charmed,
    }), null);
    // Guidance is spent on the roll, not on opening the menu.
    safe(() => mods.spend());
    const success = res ? !!res.success : true;
    const display = res && res.roll ? {
      ...res.roll,
      mod: res.mod,
      total: res.total,
      dc: res.dc,
      hit: success,
      adv: res.adv,
      dis: res.dis,
      label: success ? 'SUCCESS' : 'FAILED',
      labelColor: success ? UI.COLORS.good : UI.COLORS.bad,
    } : null;

    this.roll = { c, res, display, success, who, t: 0 };
    this.mode = 'roll';
    sfx('dice');
    if (c.spentKey && S()) setFlag(S(), c.spentKey, true);
  }

  _updateRoll(dt) {
    const r = this.roll;
    if (!r) { this.mode = 'choose'; return; }
    r.t += dt;
    const m = Input.mouse;
    const clicked = !!(m && m.clicked);
    if (clicked && m) m.clicked = false;
    const pressed = Input.consume('confirm') || Input.consume('cancel') || clicked;
    if (r.t >= ROLL_HOLD || (pressed && r.t >= ROLL_MIN)) {
      sfx(r.success ? 'select' : 'back');
      this.roll = null;
      this._resolveChoice(r.c, r.success);
    }
  }

  /** Apply a chosen branch: run its `do`, then jump. */
  _resolveChoice(c, success) {
    const raw = c.raw || {};
    const ck = c.check || {};
    let target;
    if (c.check) {
      target = success
        ? (ck.success ?? raw.success ?? raw.goto ?? raw.next)
        : (ck.failure ?? ck.fail ?? raw.failure ?? raw.fail ?? raw.goto ?? raw.next);
    } else {
      target = raw.goto ?? raw.next;
    }

    const act = c.check ? (success ? (raw.do || ck.do) : (raw.failDo || ck.failDo)) : raw.do;
    if (act) {
      const r = this._runDo(act);
      if (r.close) { this._close(); return; }
      if (r.goto) { this._goto(r.goto); return; }
    }
    // A branch with nowhere to go ends the conversation — _goto handles null.
    this._goto(target == null ? null : target);
  }

  // --- node / choice actions ---------------------------------------------

  /**
   * Run a `do:{}` block. Supported keys:
   *   shop, quest, complete, flag, give, take, gold, recruit, heal, rest,
   *   teach, battle, warp, rep, xp, close, say, goto
   * -> { close, goto }
   */
  _runDo(d) {
    const out = { close: false, goto: null };
    if (!d) return out;
    if (Array.isArray(d)) {
      for (const one of d) {
        const r = this._runDo(one);
        if (r.close) return r;
        if (r.goto) return r;
      }
      return out;
    }
    if (!isObj(d)) return out;
    const st = S();
    const msgs = [];

    if (d.flag != null) {
      for (const f of arr(d.flag)) {
        if (isObj(f)) { for (const [k, v] of Object.entries(f)) if (st) setFlag(st, k, v); }
        else if (st) setFlag(st, String(f), true);
      }
    }
    if (d.clearFlag != null && st) for (const f of arr(d.clearFlag)) setFlag(st, String(f), false);

    if (d.gold != null) {
      const n = Number(d.gold) || 0;
      if (n < 0 && !Party.canAfford(-n)) msgs.push('You cannot cover that.');
      else { Party.addGold(n); sfx('coin'); msgs.push(n >= 0 ? `+${n} gp` : `${n} gp`); }
      if (st) { if (n > 0) st.stats.goldEarned += n; else st.stats.goldSpent += -n; }
    }

    for (const g of arr(d.give ?? d.giveItem)) {
      const spec = isObj(g) ? g : { id: g, qty: 1 };
      const id = spec.id || spec.item;
      const qty = spec.qty || spec.count || 1;
      if (Party.addItem(id, qty)) { sfx('item'); msgs.push(`Received ${itemLabel(id)}${qty > 1 ? ` ×${qty}` : ''}`); }
    }
    for (const g of arr(d.take ?? d.takeItem)) {
      const spec = isObj(g) ? g : { id: g, qty: 1 };
      Party.removeItem(spec.id || spec.item, spec.qty || spec.count || 1);
    }

    for (const q of arr(d.quest ?? d.startQuest)) {
      const id = isObj(q) ? q.id : String(q);
      const def = QUESTS()[id] || (isObj(q) ? q : null);
      if (st && def && startQuest(st, def)) {
        sfx('quest');
        safe(() => toast(`Quest: ${def.title || id}`, { kind: 'quest' }));
      }
    }
    if(d.academySync || d.academy) syncAcademy(st);
    if(d.academy === 'practice') {
      this._close();
      Game.push(new AcademyTrainingScene());
      out.close=true;
      return out;
    }
    for (const q of arr(d.complete ?? d.turnIn ?? d.questDone)) {
      const id = isObj(q) ? q.id : String(q);
      if (st && completeQuest(st, id)) {
        noteDeed(st, { kind: 'quest', questId: id, npcId: this.npcId, mapId: st.mapId, weight: 2 });
        sfx('quest');
        this._grantQuestRewards(QUESTS()[id]);
        safe(() => toast(`Completed: ${QUESTS()[id]?.title || id}`, { kind: 'quest' }));
      }
    }

    if (d.rep) {
      for (const r of arr(d.rep)) {
        const id = isObj(r) ? (r.id || r.faction) : String(r);
        const amt = isObj(r) ? (r.amount ?? r.value ?? 1) : 1;
        if (st) { addReputation(st, id, amt); msgs.push(`${factionName(id)} ${amt >= 0 ? '+' : ''}${amt}`); }
      }
    }

    if (d.xp != null) {
      const n = Number(d.xp) || 0;
      for (const m of Party.members) safe(() => grantXp(m, n));
      if (n) msgs.push(`+${n} XP`);
    }

    if (d.recruit) { const m = this._recruit(d.recruit); if (m) msgs.push(m); }
    if (d.teach) { const m = this._teach(d.teach); if (m) msgs.push(m); }
    if (d.heal || d.rest) { const m = this._heal(d.heal === true ? {} : (d.heal || d.rest)); if (m) msgs.push(m); }

    if (d.shop) {
      const spec = isObj(d.shop) ? d.shop : { id: String(d.shop) };
      safe(() => Game.push(new ShopScene(spec.id || spec.shop, { npc: this.npc, ...spec })));
    }

    if (d.battle) { this._startBattle(isObj(d.battle) ? d.battle : { group: String(d.battle) }); out.close = true; }
    if (d.warp) { this._warp(d.warp); out.close = true; }

    // A runtime tree (ui/topics.js) can carry its own action: fn(ctx) -> { say, goto, close }.
    if (typeof d.call === 'function') {
      const r = safe(() => d.call(this._topicCtx()), null);
      if (r && r.say) msgs.push(String(r.say));
      if (r && r.close) out.close = true;
      if (r && r.goto) out.goto = r.goto;
    }

    if (d.say) msgs.push(String(d.say));
    if (msgs.length) this._say(msgs.join('   '));
    if (d.close) out.close = true;
    if (d.goto) out.goto = d.goto;
    return out;
  }

  _grantQuestRewards(def) {
    const rw = def && def.rewards;
    if (!rw) return;
    if (rw.gold) { Party.addGold(rw.gold); sfx('coin'); }
    if (rw.xp) for (const m of Party.members) safe(() => grantXp(m, rw.xp));
    for (const it of arr(rw.items)) {
      const spec = isObj(it) ? it : { id: it, qty: 1 };
      Party.addItem(spec.id || spec.item, spec.qty || 1);
    }
  }

  /** Hire a companion from data/npcs.js RECRUITS for a purse of gold. */
  _recruit(spec) {
    const s = isObj(spec) ? spec : { id: String(spec) };
    const entry = RECRUITS().find((r) => r && r.id === s.id) || (isObj(s.entry) ? s.entry : null);
    if (!entry) return 'They have already taken another road.';
    if (Party.all().some((m) => m && m.recruitId === entry.id)) return 'They already march with you.';
    const cost = s.cost != null ? Number(s.cost) : Number(entry.cost || 0);
    if (!Party.canAfford(cost)) return `${entry.name} wants ${cost} gp.`;

    const ch = safe(() => createCharacter({
      name: entry.name,
      speciesId: entry.speciesId,
      lineageId: entry.lineageId || null,
      classId: entry.classId,
      subclassId: entry.subclassId || null,
      backgroundId: entry.backgroundId || entry.background || null,
      level: entry.level || Math.max(1, Party.levelAvg()),
      abilities: entry.abilities || null,
      appearance: entry.appearance || null,
      kind: 'pc',
    }), null);
    if (!ch) return 'They cannot be found.';
    ch.recruitId = entry.id;
    if (entry.colorway) ch.colorway = entry.colorway;
    if (entry.personality) ch.notes = entry.personality;
    safe(() => recalc(ch));

    if (!Party.add(ch)) return 'Your party is already full.';
    Party.spendGold(cost);
    sfx('levelup');
    safe(() => toast(`${entry.name} joins the party.`, { kind: 'party' }));
    return `${entry.name} joins you for ${cost} gp.`;
  }

  /** Teach a spell — Sister Garaele and the Phandalin hedge-mages do this. */
  _teach(spec) {
    const s = isObj(spec) ? spec : { spell: String(spec) };
    const spellId = s.spell || s.id;
    const sp = safe(() => getSpell(spellId), null);
    if (!sp) return 'That lore is lost to the Realms.';
    const lists = arr(sp.lists);
    const target = Party.members.find((m) => m && m.uid === s.uid)
      || Party.members.find((m) => m && arr(m.classes).some((k) => lists.includes(k.id)))
      || Party.members.find((m) => m && m.spells);
    if (!target) return 'None of you can hold that spell.';
    const cost = Number(s.cost || 0);
    if (cost && !Party.spendGold(cost)) return `That teaching costs ${cost} gp.`;

    target.spells = target.spells || { known: [], prepared: [], cantrips: [] };
    const bucket = sp.level === 0 ? 'cantrips' : 'known';
    target.spells[bucket] = arr(target.spells[bucket]);
    if (!target.spells[bucket].includes(spellId)) target.spells[bucket].push(spellId);
    safe(() => recomputeSpells(target));
    safe(() => recalc(target));
    sfx('spell');
    return `${target.name} learns ${sp.name}.`;
  }

  _heal(spec) {
    const s = isObj(spec) ? spec : {};
    const cost = Number(s.cost || 0);
    if (cost && !Party.spendGold(cost)) return `That would cost ${cost} gp.`;
    if (cost) sfx('coin');
    // The clock moves FIRST. Party.longRest() emits EV.REST, and the overworld
    // listens for it to claim the morning — so advancing the eight hours
    // afterwards let the wake-up time be computed from the hour you lay down.
    // Sleeping at 21:40 woke the party at 15:08 the same day.
    const st = S();
    if (st) {
      safe(() => advanceTime(st, s.minutes != null ? s.minutes : (s.hours != null ? s.hours * 60 : 480)));
      st.stats.longRests = (st.stats.longRests || 0) + 1;
    }
    safe(() => Party.longRest());
    safe(() => Party.healAll());
    sfx('heal');
    safe(() => FX.flash('#ffe9a8', 0.45));
    return 'The party is rested and whole.';
  }

  _startBattle(spec) {
    const { combat, scaling, combatui } = LATE;
    if (!combat || !scaling || !combatui) { this._say('That fight can wait.'); return; }
    safe(() => {
      const level = Math.max(1, Party.levelAvg());
      const enemies = [];
      const listed = arr(spec.monsters || spec.enemies || (spec.id ? [spec.id] : []));
      for (const e of listed) {
        const one = isObj(e) ? e : { id: String(e), count: 1 };
        for (let i = 0; i < (one.count || 1); i++) {
          const mob = scaling.makeMonster(one.id, { level: one.level || level });
          if (mob) enemies.push(mob);
        }
      }
      if (!enemies.length && spec.group && scaling.rollEncounter) {
        const roll = scaling.rollEncounter({ biome: spec.biome || 'road', level, size: Party.size });
        for (const g of arr(roll && roll.monsters)) {
          for (let i = 0; i < (g.count || 1); i++) {
            const mob = scaling.makeMonster(g.id, { level });
            if (mob) enemies.push(mob);
          }
        }
      }
      if (!enemies.length) return;
      const enc = combat.buildEncounter({
        party: Party.members, enemies, biome: spec.biome || 'road',
        boss: !!spec.boss, ambush: !!spec.ambush,
      });
      Game.transition('battle', () => { safe(() => Game.push(new combatui.BattleScene(enc))); });
    });
  }

  _warp(w) {
    const spec = typeof w === 'string' ? { map: w } : (w || {});
    const ow = LATE.overworld;
    if (!ow || typeof ow.travelTo !== 'function') { this._say('The road is not open yet.'); return; }
    Game.transition('fade', () => {
      safe(() => ow.travelTo(spec.map || spec.mapId, spec.x, spec.y, spec.dir || 'down'));
    });
  }

  // --- helpers -----------------------------------------------------------

  _say(text, seconds = 2.4) { this.footer = String(text); this.footerT = seconds; }

  _close(result) {
    if (this._closed) return;
    this._closed = true;
    sfx('back');
    if (Game.top === this) Game.pop(result);
  }

  _choiceLayout() {
    const n = Math.max(1, this.choices.length);
    const rows = Math.max(1, Math.min(CH_MAX_ROWS, n));
    const h = rows * CH_ROW + 8;
    const y = BOX_Y - h - 6;
    return { x: CH_X, y, w: CH_W, h, rows, listX: CH_X + 5, listY: y + 4, listW: CH_W - 10 };
  }

  /** The character whose bust fills the portrait frame. */
  _portraitOf() {
    const p = this.node && this.node.portrait;
    if (p === 'player') return Party.members[0] || this.npc;
    if (p === 'party') return Party.members[1] || Party.members[0] || this.npc;
    if (typeof p === 'string') return NPCS()[p] || this.npc;
    if (isObj(p)) return p;
    return this.npc;
  }

  // --- draw --------------------------------------------------------------

  draw(ctx) {
    // The street stays in view: only the lower part of the screen sinks into
    // shade, so the box reads as a lit page laid over the scene.
    UI.scrim(ctx, 0.16);
    const shadeTop = BOX_Y - 64;
    const g = ctx.createLinearGradient(0, shadeTop, 0, VIEW_H);
    g.addColorStop(0, 'rgba(6,4,8,0)'); g.addColorStop(1, 'rgba(6,4,8,0.6)');
    ctx.fillStyle = g; ctx.fillRect(0, shadeTop, VIEW_W, VIEW_H - shadeTop);
    if (!this.tree) { this._drawBox(ctx, '…'); return; }
    this._drawBox(ctx, null);
    if (this.mode === 'choose' || (this.mode === 'roll' && this.choices.length)) this._drawChoices(ctx);
    if (this.mode === 'roll' && this.roll) this._drawRoll(ctx);
  }

  _drawBox(ctx, placeholder) {
    const p = UI.panel(ctx, BOX_X, BOX_Y, BOX_W, BOX_H, { style: 'window' });
    const ch = this._portraitOf();
    this._drawPortrait(ctx, ch, PORT_X, PORT_Y, PORT_S);
    this._drawNamePlate(ctx, this._speakerName(this.node), this._captionFor(ch));

    if (placeholder != null) {
      MK.text(ctx, TEXT_X, TEXT_Y + 12, placeholder, { size: 'sm', color: UI.COLORS.inkDim });
      return;
    }

    // --- typewriter body ----------------------------------------------------
    const pg = this.pages[this.page];
    const ink = p.ink || UI.COLORS.ink;
    if (pg) {
      const adv = advOf('sm');
      const shown = Math.floor(this.shown);
      const first = Math.max(0, Math.min(pg.lines.length - TEXT_LINES, this._scrollFor(pg, shown)));
      if (pg.cap && first < CAP_LINES) {
        // the initial scrolls away with the lines it stands beside
        ctx.save();
        ctx.beginPath(); ctx.rect(TEXT_X - 2, BOX_Y + 4, CAP_INDENT, BOX_H - 8); ctx.clip();
        safe(() => UI.initial(ctx, TEXT_X, TEXT_Y - 0.5 - first * TEXT_LH, pg.cap, { size: 'lg', vine: false }));
        ctx.restore();
      }
      for (let li = 0; li < TEXT_LINES; li++) {
        const line = pg.lines[first + li];
        if (!line) break;
        const ly = TEXT_Y + li * TEXT_LH;
        const lx = TEXT_X + (line.ind || 0);
        for (const seg of line.segs) {
          const segStart = line.start + seg.off;
          const vis = clamp(shown - segStart, 0, seg.text.length);
          if (vis <= 0) continue;
          UI.text(ctx, lx + seg.off * adv, ly, seg.text.slice(0, vis), {
            size: 'sm', color: seg.color || ink, shadow: true,
          });
        }
      }
    }

    // --- foot of the page: status line, page lozenges, keys -----------------
    const fy = BOX_Y + BOX_H - 11;
    if (this.footer) {
      MK.text(ctx, TEXT_X, fy + 1.5, this.footer, { color: UI.COLORS.goldBright, maxWidth: TEXT_W - 90 });
    }
    let rx = BOX_X + BOX_W - 8;
    if (this.mode === 'choose') {
      rx = this._drawKeys(ctx, rx, fy, [['X', 'Leave'], ['Z', 'Choose']]);
    } else if (pg && this.shown >= pg.length) {
      UI.advanceCaret(ctx, BOX_X + BOX_W - 14, BOX_Y + BOX_H - 14, this.t);
      rx -= 14;
    }
    if (pg && this.pages.length > 1 && this.mode === 'text') {
      // one lozenge per page of this speech, the current one lit
      const n = Math.min(12, this.pages.length);
      for (let i = n - 1; i >= 0; i--) {
        const cx = rx - 3 - (n - 1 - i) * 5;
        const on = i === this.page;
        ctx.fillStyle = on ? UI.COLORS.goldBright : 'rgba(184,137,58,0.45)';
        ctx.fillRect(cx - 0.5, fy + 2, 1, 3); ctx.fillRect(cx - 1.5, fy + 3, 3, 1);
        if (on) { ctx.fillStyle = '#fff4c8'; ctx.fillRect(cx - 0.5, fy + 2, 1, 0.5); }
      }
    }
  }

  /** [KEY] label pairs laid out leftwards from `right`; returns the new left edge. */
  _drawKeys(ctx, right, y, pairs) {
    let x = right;
    for (const [k, label] of pairs) {
      x -= MK.measure(label);
      MK.text(ctx, x, y + 2, label, { color: '#cfc3a6', shadow: 'rgba(0,0,0,0.8)' });
      x -= 2.5 + Math.max(6.5, MK.measure(k, 'fineb') + 3);
      MK.keycap(ctx, x, y + 0.5, k);
      x -= 7;
    }
    return x;
  }

  /**
   * The speaker's cartouche over the top rule of the box: the name in the
   * display face (a gilt Lombardic capital, textura after it) and, in the fine
   * face after it, who they are.
   */
  _drawNamePlate(ctx, speaker, caption) {
    const nameW = MK.measure(speaker, 'title');
    const capW = caption ? MK.measure(caption) : 0;
    const w = Math.min(TEXT_W - 8, Math.ceil(nameW + (caption ? capW + 9 : 0) + 12));
    const x = TEXT_X - 3;
    const y = BOX_Y - 7;
    MK.plate(ctx, x, y, w, 13);
    const r = MK.title(ctx, x + 6, y + 2.5, speaker, { maxWidth: w - 12 });
    if (caption) {
      const cx = x + 6 + ((r && r.w) || nameW) + 5;
      const left = x + w - 6 - cx;
      if (left > 14) {
        ctx.fillStyle = 'rgba(217,164,65,0.6)';
        ctx.fillRect(cx - 3, y + 6, 1, 1);
        MK.text(ctx, cx, y + 5, caption, { color: '#bfae8a', maxWidth: left });
      }
    }
  }

  /** Which wrapped line to scroll to while a long page is still typing. */
  _scrollFor(pg, shown) {
    if (pg.lines.length <= TEXT_LINES) return 0;
    let at = 0;
    for (let i = 0; i < pg.lines.length; i++) if (pg.lines[i].start <= shown) at = i;
    return Math.max(0, at - TEXT_LINES + 1);
  }

  _drawPortrait(ctx, ch, x, y, size) {
    // A person gets the painted bust at a whole multiple of device pixels, a
    // beast its sprite's head, anyone else a gilt signet (menukit.portrait).
    MK.portrait(ctx, ch, x, y, size, size, { ground: ['#3b2b1d', '#0d0907'] });
  }

  /**
   * What to print under a portrait. The authored title first; failing that a
   * readable name for the handful of roles that mean something to a player;
   * failing that the faction. `flavor` and `questgiver` are bookkeeping, not
   * characterisation, so they say nothing at all.
   */
  _captionFor(ch) {
    if (!ch) return '';
    const record = (ch.npc && typeof ch.npc === 'object' ? ch.npc : null)
      || NPCS()[ch.npcId || ch.id] || null;
    const title = ch.title || (record && record.title) || '';
    if (title) return String(title);

    const ROLE_LABEL = {
      shopkeeper: 'Shopkeeper', innkeep: 'Innkeeper',
      guard: 'Town Guard', priest: 'Priest',
    };
    const role = ch.role || (record && record.role) || '';
    if (ROLE_LABEL[role]) return ROLE_LABEL[role];

    const faction = ch.faction || (record && record.faction) || null;
    return faction ? String(factionName(faction)).replace(/-/g, ' ') : '';
  }

  _drawChoices(ctx) {
    const L = this._choiceLayout();
    UI.panel(ctx, L.x, L.y, L.w, L.h, { style: 'window' });
    const n = this.choices.length;
    let top = clamp(this.listTop | 0, 0, Math.max(0, n - L.rows));
    if (this.index < top) top = this.index;
    if (this.index >= top + L.rows) top = this.index - L.rows + 1;
    this.listTop = top;
    const scroll = n > L.rows;
    const rowW = L.listW - (scroll ? 6 : 0);
    const m = Input.mouse;
    for (let r = 0; r < L.rows; r++) {
      const i = top + r;
      const c = this.choices[i];
      if (!c) break;
      const ry = L.listY + r * CH_ROW;
      const sel = i === this.index;
      if (sel) MK.selRow(ctx, L.listX, ry, rowW, CH_ROW, this.t);
      else if (m && m.over && m.x >= L.listX && m.x <= L.listX + rowW && m.y >= ry && m.y < ry + CH_ROW) MK.hoverRow(ctx, L.listX, ry, rowW, CH_ROW);

      // What the option costs or risks, hard right in the fine face: the check
      // it calls for, why it is barred, or that it means a fight.
      const hint = c.disabled ? (c.reason || 'barred') : c.attack ? 'means a fight' : (c.tag ? c.tag.replace(/^\[|\]$/g, '') : '');
      const hintCol = c.disabled ? '#b0605a' : c.attack ? '#e0664f' : UI.COLORS.goldBright;
      let hintW = 0;
      if (hint) {
        hintW = Math.min(rowW * 0.45, MK.measure(hint) + 9);
        const hx = L.listX + rowW - hintW;
        if (c.tag && !c.disabled) {
          // a check sits on a small dark slip ruled in gilt
          ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(hx, ry + 2.5, hintW - 1, 7);
          ctx.fillStyle = 'rgba(217,164,65,0.35)';
          ctx.fillRect(hx, ry + 2.5, hintW - 1, 0.5); ctx.fillRect(hx, ry + 9, hintW - 1, 0.5);
        }
        MK.bullet(ctx, hx + 3, ry + 6, hintCol);
        MK.text(ctx, hx + 6, ry + 4.5, hint, { color: hintCol, maxWidth: hintW - 7 });
      }
      // the option itself, in the body face; violence in red so it is never picked by accident
      const icon = c.attack ? 'sword' : c.topic ? 'quill' : null;
      let lx = L.listX + 4;
      if (icon) { safe(() => UI.icon(ctx, icon, lx, ry + 2, 8, c.attack ? UI.COLORS.red : UI.COLORS.gold)); lx += 11; }
      const col = c.disabled ? UI.COLORS.disabled : c.attack ? UI.COLORS.red : sel ? UI.COLORS.inkBright : UI.COLORS.ink;
      UI.text(ctx, lx, ry + 2.5, c.label, { size: 'sm', color: col, shadow: true, maxWidth: L.listX + rowW - hintW - 4 - lx });
    }
    if (scroll) MK.scroll(ctx, L.listX + L.listW - 3, L.listY, L.rows * CH_ROW, top, L.rows, n);
  }

  _drawRoll(ctx) {
    const r = this.roll;
    UI.scrim(ctx, 0.35);
    const cx = 200;
    const cy = 84;
    safe(() => UI.diceRoll(ctx, cx, cy, r.display, r.t));

    // Who is rolling, and against what — the maths is the point.
    const who = (r.who && r.who.name) || 'The party';
    const what = r.c.check.skill ? SKILLS[r.c.check.skill].name : (ABILITY_ABBR[r.c.check.ability] || 'Check');
    const head = `${who} — ${what}`;
    const tw = Math.min(268, MK.measure(head, 'title'));
    MK.plate(ctx, cx - tw / 2 - 7, cy - 51, tw + 14, 13);
    MK.title(ctx, cx - tw / 2, cy - 48.5, head, { maxWidth: 268 });
    if (r.c.check.dc) MK.text(ctx, cx, cy - 34, `against DC ${r.c.check.dc}`, { color: '#bfae8a', align: 'center' });
    if (r.t >= ROLL_MIN) this._drawKeys(ctx, cx + 22, cy + 42, [['Z', 'Continue']]);
  }
}

function checkLabel(check) {
  if (check.skill && SKILLS[check.skill]) return SKILLS[check.skill].name;
  return ABILITY_ABBR[check.ability] || 'Check';
}

// ===========================================================================
// 7. say() — one-off lines without authoring a dialogue tree
// ===========================================================================

/**
 * Show a quick message (or a list of pages) in the standard dialogue window.
 *   say('The chest is empty.')
 *   say(['Gundren clasps your arm.', 'Meet me in Phandalin, {name}.'], { npc, speaker })
 * opts: { npc, speaker, choices, rumor, onClose, push:false }
 * -> the DialogueScene (already pushed unless opts.push === false)
 */
export function say(lines, opts = {}) {
  const pages = arr(lines).map((l) => String(l == null ? '' : l)).filter((l) => l.length);
  const list = pages.length ? pages : ['…'];
  const nodes = {};
  list.forEach((text, i) => {
    const last = i === list.length - 1;
    nodes[`p${i}`] = {
      text,
      speaker: opts.speaker,
      goto: last ? null : `p${i + 1}`,
      choices: last ? opts.choices : null,
      portrait: opts.portrait,
    };
  });
  const scene = new DialogueScene({ start: 'p0', nodes }, opts.npc || null, {
    ...opts, id: opts.id || 'say',
  });
  if (opts.push !== false) safe(() => Game.push(scene));
  return scene;
}

export default DialogueScene;
