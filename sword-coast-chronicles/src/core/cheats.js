// core/cheats.js — the testing console.
//
// Not shipped-game features: this is the trapdoor you use while building the
// thing, so you can stand in Undermountain at level 20 thirty seconds after a
// reload instead of playing there. Everything lives behind `SC.cheat` (or the
// shorter `cheat` alias) in the browser console, plus one secret key sequence
// for the parts you want mid-play without opening devtools.
//
// God mode is implemented at the damage boundary rather than by inflating HP, so
// combat still runs its real maths — attacks still roll, saves still happen, the
// log still tells the truth — you simply never drop.

import { Game } from '../engine.js';
import { Party } from '../world/party.js';
import { bus, EV, toast } from '../core/events.js';
import { rng } from './rng.js';
import { CHEATS } from './cheatflags.js';
import { Input } from './input.js';

/** The live switches. Re-exported so `SC.Cheats` shows the same object the rules read. */
export const Cheats = CHEATS;

function say(msg) {
  try { toast(msg, { kind: 'cheat' }); } catch (e) { /* ignore */ }
  console.info('[cheat] ' + msg);
  return msg;
}

const st = () => Game.state;

/** Every party member, active and benched. */
function everyone() { return Party.all ? Party.all() : Party.members.slice(); }

export const cheat = {
  // ── survival ────────────────────────────────────────────────────────────
  /** Nothing can reduce the party below 1 hp. Toggle, or pass true/false. */
  god(on = !CHEATS.god) {
    CHEATS.god = !!on;
    return say(`God mode ${CHEATS.god ? 'ON — the party cannot drop' : 'off'}`);
  },
  /** Full heal, clear conditions, restore slots and resources. */
  heal() {
    for (const c of everyone()) {
      c.hp = c.maxHp; c.tempHp = 0; c.dead = false;
      c.deathSaves = { success: 0, fail: 0, stable: false };
      c.conditions = [];
      for (const lv of Object.keys(c.spells?.slots || {})) c.spells.slots[lv].used = 0;
      if (c.spells?.pact) c.spells.pact.used = 0;
      for (const r of Object.values(c.resources || {})) if (r && typeof r === 'object') r.used = 0;
      for (const hd of Object.values(c.hitDice || {})) if (hd && typeof hd === 'object') hd.used = 0;
    }
    bus.emit(EV.PARTY_CHANGE, { members: Party.members });
    return say('Party restored');
  },
  /** Your attacks kill whatever they hit. */
  oneShot(on = !CHEATS.oneShot) {
    CHEATS.oneShot = !!on;
    return say(`One-shot kills ${CHEATS.oneShot ? 'ON' : 'off'}`);
  },
  /** Spells and class resources cost nothing. */
  freeCast(on = !CHEATS.freeCast) {
    CHEATS.freeCast = !!on;
    return say(`Free casting ${CHEATS.freeCast ? 'ON' : 'off'}`);
  },

  // ── movement ────────────────────────────────────────────────────────────
  /** Walk through walls, water and locked doors. */
  noclip(on = !CHEATS.noclip) {
    CHEATS.noclip = !!on;
    return say(`Noclip ${CHEATS.noclip ? 'ON' : 'off'}`);
  },
  /**
   * Peaceful mode: no fight starts at all — not random ambushes, not roaming
   * monsters, not scripted encounters. For walking the Sword Coast and looking
   * at it. `calm` only silences the grass; this stops everything.
   */
  nofight(on = !CHEATS.noCombat) {
    CHEATS.noCombat = !!on;
    CHEATS.noEncounters = CHEATS.noCombat || CHEATS.noEncounters;
    return say(`Peaceful mode ${CHEATS.noCombat ? 'ON — nothing will attack you' : 'off'}`);
  },

  /** Silence the grass. (The setting does this too; this is the quick switch.) */
  peace(on = !CHEATS.noEncounters) {
    CHEATS.noEncounters = !!on;
    return say(`Random ambushes ${CHEATS.noEncounters ? 'suppressed' : 'back on'}`);
  },
  /** Jump to any map: cheat.tp('undermountain') or cheat.tp('phandalin', 24, 30). */
  async tp(mapId, x, y, dir = 'down') {
    if (!mapId) return say('cheat.tp(mapId[, x, y]) — try cheat.maps()');
    const ow = await import('../world/overworld.js');
    try {
      ow.travelTo(mapId, x, y, dir);
      return say(`Travelled to ${mapId}`);
    } catch (e) { return say(`Could not reach ${mapId}: ${e.message}`); }
  },
  /** Straight home, from anywhere. */
  town() { return this.tp('phandalin', 24, 30); },
  /** List every map id you can tp to. */
  async maps() {
    const m = await import('../world/maps.js');
    const ids = Object.keys(m.MAP_DEFS || {});
    console.table(ids);
    return ids;
  },
  /** Reveal the whole current map on the minimap. */
  reveal() {
    const s = st(); const map = Game.top && Game.top.map;
    if (!s || !map) return say('No map loaded');
    const set = (s.discovered[map.id] = s.discovered[map.id] || []);
    const seen = new Set(set);
    for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) seen.add(`${x},${y}`);
    s.discovered[map.id] = Array.from(seen);
    return say(`Revealed ${map.id}`);
  },

  // ── progression ─────────────────────────────────────────────────────────
  /** Set every party member to a level: cheat.level(12). */
  async level(n = 5) {
    const prog = await import('../rules/progression.js');
    const target = Math.max(1, Math.min(20, n | 0));
    for (const c of Party.members) {
      let guard = 0;
      while (c.level < target && guard++ < 40) {
        const next = c.level + 1;
        const choices = prog.pendingChoicesFor(c, next) || [];
        const picks = {};
        for (const ch of choices) {
          const opts = (ch.options || []).filter((o) => !o.disabled);
          if (opts.length) picks[ch.id] = opts.slice(0, ch.count || 1).map((o) => o.id);
        }
        try { prog.applyLevel(c, next, picks); } catch (e) { break; }
      }
    }
    bus.emit(EV.PARTY_CHANGE, { members: Party.members });
    return say(`Party set to level ${target}`);
  },
  /** Grant XP to everyone. */
  async xp(amount = 1000) {
    const prog = await import('../rules/progression.js');
    for (const c of Party.members) prog.grantXp(c, amount);
    return say(`+${amount} XP`);
  },
  gold(n = 1000) { Party.addGold(n); return say(`+${n} gp`); },

  // ── stuff ───────────────────────────────────────────────────────────────
  /** cheat.give('longsword-plus1', 1) — or cheat.give() for a useful test kit. */
  give(id, qty = 1) {
    if (!id) {
      // These were 'potion-of-healing', 'potion-of-greater-healing' and
      // 'scroll-of-fireball' — none of which are in ITEMS. Party.addItem
      // returned null for all three, nothing was checked, and the kit reported
      // success while containing no potions at all: the one thing a test kit is
      // for. Real catalogue ids, and the report now counts what actually landed.
      const kit = [['potion-healing', 10], ['potion-greater-healing', 5],
        ['rations', 10], ['torch', 10], ['thieves-tools', 1], ['arrow', 60],
        ['scroll-fireball', 3], ['antitoxin', 3]];
      const missed = [];
      for (const [k, q] of kit) if (!Party.addItem(k, q)) missed.push(k);
      return say(missed.length
        ? `Test kit added, but ${missed.join(', ')} ${missed.length === 1 ? 'is' : 'are'} not in the catalogue`
        : 'Test kit added to the pack');
    }
    if (!Party.addItem(id, qty)) return say(`No such item: ${id}`);
    return say(`+${qty} ${id}`);
  },
  /** Search the item catalogue: cheat.find('sword'). */
  async find(text = '') {
    const items = await import('../data/items.js');
    const q = String(text).toLowerCase();
    const hits = Object.values(items.ITEMS)
      .filter((i) => i.id.includes(q) || String(i.name).toLowerCase().includes(q))
      .slice(0, 40).map((i) => ({ id: i.id, name: i.name, kind: i.kind, rarity: i.rarity, cost: i.cost }));
    console.table(hits);
    return hits.length;
  },
  /** Start a fight on demand: cheat.fight('goblin', 4) or cheat.fight('venomfang'). */
  async fight(monsterId = 'goblin', count = 3) {
    const [scaling, bmap, combat, cui] = await Promise.all([
      import('../rules/scaling.js'), import('../world/battlemap.js'),
      import('../rules/combat.js'), import('../ui/combatui.js')]);
    const foes = [];
    for (let i = 0; i < Math.max(1, count | 0); i++) {
      try { foes.push(scaling.makeMonster(monsterId, { level: Party.levelAvg() })); }
      catch (e) { return say(`No such creature: ${monsterId}`); }
    }
    const biome = (Game.top && Game.top.map && Game.top.map.biome) || 'plains';
    const map = bmap.buildBattleMap({ biome, seed: `cheat-${rng.int(1, 1e6)}` });
    const enc = combat.buildEncounter({ party: Party.members, enemies: foes, map, biome,
      seed: `cheat-${rng.int(1, 1e6)}` });
    enc.start();
    Game.push(new cui.BattleScene(enc));
    return say(`Fighting ${count}x ${monsterId}`);
  },
  /** Advance the clock: cheat.time(22) for 10pm, cheat.time('night'). */
  time(v = 12) {
    const s = st(); if (!s) return say('No game running');
    const named = { dawn: 5.5, morning: 9, noon: 12, dusk: 19, night: 23, midnight: 0 };
    const h = typeof v === 'string' ? (named[v] ?? 12) : v;
    s.time = Math.max(0, Math.min(1439, Math.round(h * 60)));
    return say(`Clock set to ${Math.floor(s.time / 60)}:${String(s.time % 60).padStart(2, '0')}`);
  },
  /** Set a story flag, e.g. to open gated content. */
  flag(name, value = true) {
    const s = st(); if (!s) return say('No game running');
    s.flags[name] = value;
    return say(`flag ${name} = ${value}`);
  },
  /** Unlock every region gate. */
  unlockAll() {
    const s = st(); if (!s) return say('No game running');
    for (const k of Object.keys(s.unlocked || {})) s.unlocked[k] = true;
    s.flags['endless-dungeon-open'] = true;
    return say('All regions unlocked');
  },

  /** Everything on, level 10, kitted out — the "just let me look around" button. */
  async explore() {
    this.god(true); this.peace(true);
    await this.level(10);
    this.gold(5000); this.give(); this.unlockAll(); this.heal();
    return say('Explore mode on: invulnerable, no ambushes, level 10, kitted. Type "ghost" to walk through walls.');
  },

  help() {
    const lines = [
      'cheat.god()      invulnerable          cheat.heal()     full restore',
      'cheat.noclip()   walk through walls    cheat.peace()    no random ambushes',
      'cheat.tp(id,x,y) jump to a map         cheat.town()     back to Phandalin',
      'cheat.maps()     list map ids          cheat.reveal()   reveal this map',
      'cheat.level(n)   set party level       cheat.xp(n)      grant xp',
      'cheat.gold(n)    add coin              cheat.give(id,n) add item (blank = kit)',
      'cheat.find(txt)  search items          cheat.fight(id,n) start a fight',
      'cheat.time(h)    set the clock         cheat.flag(k,v)  set a story flag',
      'cheat.unlockAll() open every region    cheat.oneShot()  your hits kill',
      'cheat.freeCast() spells are free       cheat.explore()  all of the above',
      '',
      'Or just TYPE these in the game window — no console needed:',
      '  xyzzy  everything       god    invulnerable   ghost  walk through walls',
      '  calm   no ambushes      heal   full restore   home   back to Phandalin',
      '  coin   +2000 gp         boost  +3 levels      unfog  reveal the map',
      '  keys   unlock regions   onehit your hits kill freecast  free spells',
      '  nofight  no combat at all — nothing ever attacks you',
    ];
    console.info('%cSword Coast test console', 'color:#e3b34a;font-weight:bold');
    for (const l of lines) console.info('  ' + l);
    return lines.length + ' commands';
  },
};

// ── the secret handshake ────────────────────────────────────────────────────
// Type the word on the keyboard anywhere in the game (not in a text field) and
// explore mode switches on. Short, unlikely, and memorable.
// ── typed codes ─────────────────────────────────────────────────────────────
// Type the word in the game window. No console, no menu, no modifier keys.
//
// Two rules keep them from fighting the game's own keys:
//   1. No code STARTS with a bound gameplay letter (WASD move, Z/X, P menu,
//      E interact, M map, J journal, I inventory, Q/R page) — typing "peace"
//      used to open the pause menu on its first keystroke.
//   2. Once you are two characters into a possible code, the keystrokes are
//      swallowed, so finishing a word never walks you into a wall.

const CODES = {
  xyzzy: (c) => c.explore(),          // everything at once
  god: (c) => c.god(),                // invulnerable        (toggle)
  ghost: (c) => c.noclip(),           // through walls       (toggle)
  calm: (c) => c.peace(),             // no random ambushes  (toggle)
  nofight: (c) => c.nofight(),        // NO combat at all    (toggle)
  heal: (c) => c.heal(),              // full restore
  home: (c) => c.town(),              // back to Phandalin
  coin: (c) => c.gold(2000),
  boost: (c) => c.level(Math.min(20, partyLevel() + 3)),
  unfog: (c) => c.reveal(),
  keys: (c) => c.unlockAll(),
  onehit: (c) => c.oneShot(),         // your hits kill      (toggle)
  freecast: (c) => c.freeCast(),      // spells cost nothing (toggle)
};

function partyLevel() { try { return Party.levelAvg(); } catch (e) { return 1; } }

const CODE_LIST = Object.keys(CODES);
const CODE_MAX = CODE_LIST.reduce((n, k) => Math.max(n, k.length), 0);
let buf = '';

/**
 * Cancel a keystroke that belongs to a cheat code.
 *
 * stopImmediatePropagation alone is not enough: Input attaches its own listener
 * during Game.start(), before this one, so on a shared target it has already seen
 * the key by the time we run. Clearing the edge afterwards is order-independent.
 */
function swallow(e) {
  e.preventDefault();
  e.stopImmediatePropagation();
  try { Input.flush(); } catch (_) { /* ignore */ }
}

/** Is `tail` the beginning of a code we might still be typing? */
function isPrefix(tail) {
  for (const k of CODE_LIST) if (k.length > tail.length && k.startsWith(tail)) return true;
  return false;
}

export const CHEAT_CODES = Object.freeze(CODE_LIST.slice());

export function installCheatKeys() {
  if (typeof window === 'undefined') return;
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // Never eat typing meant for a text field (the name box in character creation).
    const el = e.target;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
    try { if (Input.text && Input.text.active) return; } catch (_) { /* ignore */ }

    const k = (e.key || '').toLowerCase();
    if (k.length !== 1 || k < 'a' || k > 'z') { if (k !== 'shift') buf = ''; return; }
    buf = (buf + k).slice(-CODE_MAX);

    // Complete match? Fire it and swallow the key. Longest wins.
    for (let len = CODE_MAX; len >= 3; len--) {
      const tail = buf.slice(-len);
      if (CODES[tail]) {
        buf = '';
        swallow(e);
        try { CODES[tail](cheat); } catch (err) { console.warn('[cheat]', err); }
        return;
      }
    }

    // Mid-word: swallow so the rest of the code does not also play the game.
    for (let len = Math.min(buf.length, CODE_MAX); len >= 2; len--) {
      if (isPrefix(buf.slice(-len))) { swallow(e); return; }
    }
  }, true);
}
