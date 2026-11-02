// world/sites.js — puts the world director's wants on the map: the quarry a quest sends you after, captives, clues and caches, raiders from a running event, the tracks to places you have heard of, lairs and their hoards, and each town's notice board.
//
// rules/worlddirector.js decides WHAT should be somewhere (spawnsFor: plain
// specs with stable keys); this module decides WHERE on the map and makes the
// entities. It runs on every MAP_ENTER and again whenever the story moves
// while you stand there (a quest taken, a clue found, a pack broken), adding
// what is newly wanted and taking away what no longer is. Keys are stable, so
// re-entering a map never doubles anything, and a beaten pack stays beaten
// (st.defeated, as the roamers do).
//
// Spots are seeded by map and key, walkable, off the triggers, and reachable
// from where the party comes in, so a captive is never sealed inside a wall.

import { bus, EV } from '../core/events.js';
import { makeRNG } from '../core/rng.js';
import { Game } from '../engine.js';
import { MonsterEntity, NPCEntity, PropEntity, ChestEntity } from './entity.js';
import { T } from '../render/tiles.js';
import { MONSTERS, MONSTER_GROUPS } from '../data/monsters.js';
import { SITES } from '../data/worldevents.js';
import { lootTableFor } from '../data/items_magic.js';
import { mapMeta } from './maps.js';
import { Party } from './party.js';
import { advanceTime } from '../state.js';
import { skillMod } from '../rules/character.js';
import * as D from '../rules/worlddirector.js';
import { negotiationTree } from '../ui/worldtalk.js';
import { noteDeed } from '../rules/deeds.js';

const KEY = '_siteKey';
const titleCase = (s) => String(s || '').replace(/-/g, ' ').replace(/\b[a-z]/g, (c) => c.toUpperCase());
const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
function safe(fn, fb) { try { const v = fn(); return v === undefined ? fb : v; } catch (e) { return fb; } }
const mapName = (id) => safe(() => mapMeta(id).name, null) || titleCase(id);

// ===========================================================================
// PLACEMENT
// ===========================================================================

function occupied(map, x, y) {
  return map.entities.some((e) => e && !e.removed && !e.hidden && e.x === x && e.y === y);
}

/**
 * A spot for a spec: 'far' is out in the map, well away from where you arrive;
 * 'town' is within a short walk of it; 'near' is beside it (the way back out).
 */
function spotFor(map, key, placement, spread = false) {
  const r = makeRNG(`site:${map.id}:${key}`);
  const from = map.spawn || { x: map.w >> 1, y: map.h >> 1 };
  const [lo, hi] = placement === 'near' ? [1, 3] : placement === 'town' ? [3, 14] : [Math.min(12, Math.floor(Math.max(map.w, map.h) / 4)), 999];
  // Two staged packs side by side are one fight nobody asked for.
  const packs = spread ? map.entities.filter((e) => e && e[KEY] && e.kind === 'monster' && !e.hidden) : [];
  let searches = 0;              // A* is the dear part: a dozen tries, then trust the map
  for (let i = 0; i < 80; i++) {
    const s = map.randomWalkable(r, { avoidTriggers: true, away: from, awayDist: lo });
    if (!s || cheb(s, from) > hi || occupied(map, s.x, s.y)) continue;
    if (i < 60 && packs.some((e) => cheb(e, s) < 8)) continue;
    if (placement !== 'near' && searches++ < 12 && !safe(() => map.findPath(from, s, { maxNodes: 9000 }), null)) continue;
    return s;
  }
  for (const [x, y] of [[from.x + 2, from.y + 1], [map.w >> 1, map.h >> 1], [from.x - 2, from.y - 1]]) {
    const n = map.nearestWalkable(x, y, 12);
    if (n && !occupied(map, n.x, n.y)) return n;
  }
  return null;
}

// ===========================================================================
// THE ENTITIES
// ===========================================================================

/**
 * A pack the director staged. Beating it tells the director, once.
 *
 * Walking into it is a fight, as with any roamer. Walking UP to it and
 * speaking is a parley, if it is the kind of thing that talks (a humanoid or
 * a giant with a language): argue them off the road, frighten them off it, or
 * pay them to go. The 2024 rules' Influence check: DC 15 or the creature's
 * Intelligence, whichever is higher. A failed word means they draw steel.
 */
class SitePack extends MonsterEntity {
  constructor(opts) { super(opts); this.onBroken = opts.onBroken || null; this.parleyed = false; }
  defeat(o) {
    const out = super.defeat(o);
    if (!this.satellite && this.onBroken && !this._broken) {
      this._broken = true;
      safe(() => this.onBroken(), null);
      queueRestage();
    }
    return out;
  }
  leader() {
    return this.satellite ? (this.packMates().find((m) => m.packId === this.packId && !m.satellite && m.state !== 'dead') || this) : this;
  }
  /** Contact is always a fight; only the player's own approach opens a parley. */
  takeBattle() {
    if (!this.battleReady) return null;
    this.battleReady = false;
    return MonsterEntity.prototype.interact.call(this.leader());
  }
  interact(ctx) {
    const lead = this.leader();
    const tree = !lead.parleyed && lead.onBroken ? safe(() => parleyTree(lead), null) : null;
    if (!tree) return MonsterEntity.prototype.interact.call(lead);
    lead.parleyed = true;
    lead.state = 'idle';
    return { kind: 'dialogue', data: { dialogueId: tree, name: lead.name, entity: null } };
  }
}

function parleyTree(pack) {
  const b = MONSTERS[pack.monsterId];
  if (!b || !['humanoid', 'giant'].includes(b.type) || !b.languages || /^(none|—|-)?$/i.test(String(b.languages).trim())) return null;
  const st = Game.state;
  const dc = Math.max(15, (b.abilities && b.abilities.int) | 0);
  const heads = (pack.monsters || []).reduce((n, m) => n + (m.count || 1), 0) || 1;
  const price = Math.max(10, Math.round((Party.levelAvg() * 8 + heads * 6) / 5) * 5);
  // 'Grim the Smiler' is one man with friends; 'Zhentarim toughs' are already a crowd;
  // a pack known only by its kind is that kind, however many.
  const proper = pack.name !== b.name;
  const many = heads > 1;
  const who = proper ? (/s$/.test(pack.name) || !many ? pack.name : `${pack.name} and the rest`)
    : many ? `The ${b.name.replace(/f$/, 've').replace(/([^s])$/, '$1s').toLowerCase()}` : `The ${b.name.toLowerCase()}`;
  const watch = many || /s$/.test(pack.name) ? 'watch' : 'watches';
  const fight = () => { pack.battleReady = true; return null; };
  const yieldTo = (how) => () => {
    noteDeed(st, { kind: how, target: pack.monsterId, mapId: st && st.mapId, weight: 2, tags: ['parley', 'spared'] });
    pack.defeat({ permanent: true });
    return null;
  };
  return {
    noTopics: true, noCombat: true, start: 'p',
    nodes: {
      p: {
        text: many
          ? `${who} ${watch} you come, weapons half-raised. Nobody has struck the first blow yet. Somebody at the back is counting your company.`
          : `${who} ${watch} you come, one hand on a weapon, weighing up your company and the odds. Nobody has struck the first blow yet.`,
        speaker: pack.name,
        choices: [
          { text: 'There is nothing here worth dying for. Walk away.', check: { skill: 'persuasion', dc }, success: 'go', failure: 'no', do: { call: yieldTo('persuade') } },
          { text: 'Leave now, or leave in pieces.', check: { skill: 'intimidation', dc }, success: 'run', failure: 'no', do: { call: yieldTo('threaten') } },
          { text: `Here — ${price} gp to be somewhere else by nightfall.`, if: { gold: price }, do: [{ gold: -price }, { call: yieldTo('bribe') }], goto: 'paid' },
          { text: 'Draw steel.', do: { call: fight }, goto: 'close' },
          // Nothing was tried, so nothing is spent: the parley is still open next time.
          { text: 'Back away slowly.', do: { call: () => { pack.parleyed = false; return null; } }, goto: 'close', cancel: true },
        ],
      },
      go: { text: 'A long look, a spat word, and they go — not quickly, and not far enough for comfort, but they go.', speaker: pack.name },
      run: { text: 'Whoever is counting stops counting. They break and scatter into the brush, and do not come back.', speaker: pack.name },
      paid: { text: 'The coin is weighed, bitten and pocketed. By dusk there is nobody here but you.', speaker: pack.name },
      no: { text: 'Laughter, and then the rasp of steel. So much for talking.', speaker: pack.name, do: { call: fight } },
    },
  };
}

/** A person the director put here, whose words depend on the moment you speak. */
class SiteNPC extends NPCEntity {
  constructor(opts) { super(opts); this.treeFn = opts.treeFn; }
  interact(ctx) {
    const tree = safe(() => this.treeFn(), null);
    if (tree) this.dialogueId = tree;
    return super.interact(ctx);
  }
}

/** Something to read, search or use: a clue, a trail marker, the notice board. */
class SiteProp extends PropEntity {
  constructor(opts) { super({ solid: true, ...opts }); this.use = opts.use; }
  interact() { return safe(() => this.use(this), null); }
}

/** Monsters for a MONSTER_GROUPS pack, sized for the party the way the roamers are. */
function packFromGroup(groupId, seed) {
  const g = MONSTER_GROUPS[groupId];
  if (!g) return [];
  const r = makeRNG(`sitepack:${seed}`);
  const cap = 2 + Math.max(1, Party.members.length) + Math.floor(Party.levelAvg() / 3);
  const out = [];
  let n = 0;
  for (const [id, lo, hi] of g.members || []) {
    if (!MONSTERS[id]) continue;
    const c = Math.max(lo | 0 || 1, Math.min(hi | 0 || 1, r.int(lo | 0 || 1, hi | 0 || 1)));
    const take = Math.max(1, Math.min(c, cap - n));
    if (n >= cap && out.length) break;
    out.push({ id, count: take });
    n += take;
  }
  return out;
}

function makePack(map, spec, spot, monsters, onBroken) {
  if (!monsters.length) return null;
  const lead = monsters.find((m) => MONSTERS[m.id] && MONSTERS[m.id].boss) || monsters[monsters.length > 1 && spec.boss ? monsters.length - 1 : 0];
  const block = MONSTERS[lead.id] || {};
  const common = { sight: 6, leash: 10, wander: 2, level: Party.levelAvg(), permanent: true };
  const leader = new SitePack({
    ...common, x: spot.x, y: spot.y, home: { ...spot }, monsterId: lead.id,
    name: spec.title || block.name || titleCase(lead.id), sprite: block.sprite || lead.id, size: block.size === 'large' ? 2 : 1,
    monsters: monsters.map((m) => ({ ...m })), boss: !!spec.boss, packId: spec.key, defeatedKey: spec.key, onBroken,
  });
  if (leader.hidden) return null;          // beaten already (st.defeated)
  leader[KEY] = spec.key;
  map.addEntity(leader);
  // One or two of the rest, milling about: the fight is still one fight, with the leader.
  const r = makeRNG(`sitemates:${spec.key}`);
  const rest = monsters.filter((m) => m !== lead);
  for (let i = 0; i < Math.min(2, rest.length + (lead.count > 1 ? 1 : 0)); i++) {
    const id = (rest[i] || lead).id;
    const nx = spot.x + r.int(-2, 2), ny = spot.y + r.int(-2, 2);
    if (!map.inBounds(nx, ny) || map.solidAt(nx, ny) || occupied(map, nx, ny)) continue;
    const b = MONSTERS[id] || {};
    const mate = new SitePack({ ...common, x: nx, y: ny, home: { x: nx, y: ny }, monsterId: id, name: b.name || titleCase(id),
      sprite: b.sprite || id, packId: spec.key, satellite: true, defeatedKey: `${spec.key}:${i}` });
    if (mate.hidden) continue;
    mate[KEY] = spec.key;
    map.addEntity(mate);
  }
  return leader;
}

function makeNPC(map, spec, spot, treeFn, opts = {}) {
  const e = new SiteNPC({ npcId: `site:${spec.key}`, name: spec.name, sprite: spec.sprite || 'npc-villager-m', x: spot.x, y: spot.y,
    home: { ...spot }, wander: opts.wander != null ? opts.wander : 1, role: spec.role || 'flavor', treeFn, dialogueId: null });
  e[KEY] = spec.key;
  map.addEntity(e);
  return e;
}

function makeProp(map, spec, spot, tile, use, name) {
  const e = new SiteProp({ x: spot.x, y: spot.y, tileId: T[tile] || T.SIGN || T.CRATE || 0, name: name || '', use });
  e[KEY] = spec.key;
  map.addEntity(e);
  return e;
}

function makeChest(map, spec, spot, opts) {
  const e = new ChestEntity({ x: spot.x, y: spot.y, mapId: map.id, ...opts });
  e[KEY] = spec.key;
  map.addEntity(e);
  return e;
}

const dialogue = (tree, name, entity) => ({ kind: 'dialogue', data: { dialogueId: tree, name, entity } });

// --- the trees for staged things --------------------------------------------

function captiveTree(st, spec) {
  const q = st.quests.active.find((x) => x.id === spec.quest);
  const guarded = !!(q && q.steps.some((s) => s.kind === 'kill' && !s.done));
  if (guarded) {
    return { noTopics: true, noCombat: true, start: 'c', nodes: { c: { text: 'Not yet — they are still out there, and they check on me. Deal with them first, then cut me loose. Please.', speaker: spec.name } } };
  }
  return {
    noTopics: true, noCombat: true, start: 'c',
    nodes: {
      c: { text: 'You came. Tymora\'s luck, you actually came. Get these ropes off me.', speaker: spec.name,
        choices: [{ text: 'Cut them loose.', goto: 'free',
          do: [{ flag: `dq:${spec.quest}:freed` }, { call: () => { noteDeed(st, { kind: 'free', target: spec.name, mapId: st.mapId, weight: 2 }); return null; } }] },
        { text: 'In a moment.', goto: 'close', cancel: true }] },
      free: { text: 'I know the way home from here. Go and tell them I am coming — I would not have them bury an empty box.', speaker: spec.name },
    },
  };
}

function clueTree(st, spec) {
  const gather = !!spec.item;
  const skill = spec.skill || (gather ? 'nature' : 'investigation');
  const dc = spec.dc || 12;
  return {
    noTopics: true, start: 'look',
    nodes: {
      look: {
        text: gather ? 'Here, among the weeds and the nettles, is what you were sent for — if you can tell it from its lookalikes.' : 'Something happened here, and not long ago. The ground has not finished telling it.',
        speaker: gather ? 'Gathering' : 'Searching',
        choices: [
          { text: gather ? 'Gather it with care.' : 'Search the ground.', check: { skill, dc }, success: 'found', failure: 'miss' },
          { text: 'Leave it for now.', goto: 'close', cancel: true },
        ],
      },
      found: {
        text: gather ? 'You have it — the right leaves, cut clean and wrapped.' : spec.text,
        speaker: gather ? 'Gathering' : 'Searching',
        do: gather ? { give: spec.item } : { flag: `dq:${spec.quest}:clue` },
      },
      miss: {
        text: gather ? 'You pull up something that only looks like it. You can try again.' : 'Nothing you can read yet. You could keep looking. (Ten minutes pass.)',
        speaker: gather ? 'Gathering' : 'Searching',
        do: { call: () => { advanceTime(st, 10); return null; } },
        goto: 'look',
      },
    },
  };
}

function trailTree(st, spec) {
  const S = SITES[spec.site];
  return {
    noTopics: true, start: 't',
    nodes: {
      t: { text: spec.text, speaker: spec.sign,
        choices: [{ text: `Follow it to ${S ? S.name : spec.sign}.`, do: { warp: { map: spec.to } } }, { text: 'Not now.', goto: 'close', cancel: true }] },
    },
  };
}

function exitTree(st, spec) {
  const back = D.siteState(st, spec.site);
  const to = spec.to;
  return {
    noTopics: true, start: 'x',
    nodes: {
      x: { text: `The way you came in, back to ${mapName(to)}.`, speaker: 'The way out',
        choices: [{ text: 'Go back.', do: { warp: { map: to, x: back && back.tx, y: back && back.ty } } }, { text: 'Stay.', goto: 'close', cancel: true }] },
    },
  };
}

// ===========================================================================
// STAGING
// ===========================================================================

let boardHandler = null;
/** ui/noticeboard.js registers how a board is read (kept out of here so the world needs no UI). */
export function setNoticeBoardHandler(fn) { boardHandler = fn; }

function build(st, map, spec) {
  switch (spec.type) {
    case 'pack': {
      const spot = spotFor(map, spec.key, spec.placement, true);
      if (!spot) return;
      const monsters = spec.monsters || packFromGroup(spec.group, spec.key);
      const onBroken = spec.quest ? () => D.sitePackBroken(st, spec.quest) : spec.event ? () => D.eventPackBroken(st, spec.event) : null;
      makePack(map, spec, spot, monsters, onBroken);
      return;
    }
    case 'lair': {
      const spot = spotFor(map, spec.key, 'far', true);
      if (spot) makePack(map, { ...spec, boss: true }, spot, packFromGroup(spec.group, spec.key), () => D.lairCleared(st, spec.site));
      return;
    }
    case 'npc': {
      // A captive is kept where its captors camp, not somewhere across the map.
      const guards = spec.role === 'captive' ? map.entities.find((e) => e && e[KEY] === `dq:${spec.quest}:pack` && !e.satellite) : null;
      const r = makeRNG(`captive:${spec.key}`);
      const spot = (guards && [0, 1, 2, 3, 4, 5].map(() => ({ x: guards.x + r.int(-3, 3), y: guards.y + r.int(-3, 3) }))
        .find((p) => map.inBounds(p.x, p.y) && !map.solidAt(p.x, p.y) && !occupied(map, p.x, p.y)))
        || spotFor(map, spec.key, spec.placement) || map.nearestWalkable((map.w >> 1), (map.h >> 1), 20);
      if (!spot) return;
      if (spec.role === 'captive') makeNPC(map, spec, spot, () => captiveTree(st, spec), { wander: 0 });
      else if (spec.role === 'negotiator') {
        makeNPC(map, spec, spot, () => {
          const q = st.quests.active.find((x) => x.id === spec.quest);
          const tree = q ? negotiationTree({ st, npcId: `site:${spec.key}`, back: 'close' }, q) : { start: 'n', nodes: { n: { text: 'We have said all there is to say.' } } };
          return { ...tree, noTopics: true };
        });
      } else makeNPC(map, spec, spot, () => ({ start: 'v', nodes: { v: { text: spec.line || 'Well met.', speaker: spec.name } } }));
      return;
    }
    case 'clue': {
      const spot = spotFor(map, spec.key, spec.placement);
      if (spot) makeProp(map, spec, spot, spec.tile, (e) => dialogue(clueTree(st, spec), spec.item ? 'Gathering' : 'Searching', e));
      return;
    }
    case 'cache': {
      const spot = spotFor(map, spec.key, 'far');
      if (spot) makeChest(map, spec, spot, { loot: [[spec.item, 1]] });
      return;
    }
    case 'hoard': {
      const spot = spotFor(map, spec.key, 'far');
      if (!spot) return;
      const lvl = Math.max(1, spec.level || 1);
      const r = makeRNG(`hoard:${spec.key}`);
      makeChest(map, spec, spot, { gold: Math.round((10 + lvl * r.int(6, 14)) / 5) * 5, lootTable: safe(() => lootTableFor(lvl * 0.6).id, null) });
      return;
    }
    case 'trail': {
      // Beside the road the party arrives on, where a way off it would be seen.
      const spot = spotFor(map, spec.key, 'town');
      if (!spot) return;
      const rec = D.siteState(st, spec.site);
      // Coming back out, the party stands beside the sign, not in it.
      const by = [[0, 1], [1, 0], [-1, 0], [0, -1]].map(([dx, dy]) => ({ x: spot.x + dx, y: spot.y + dy })).find((p) => map.inBounds(p.x, p.y) && !map.solidAt(p.x, p.y)) || spot;
      if (rec) { rec.tx = by.x; rec.ty = by.y; }
      makeProp(map, spec, spot, 'SIGN', (e) => dialogue(trailTree(st, spec), spec.sign, e), spec.sign);
      return;
    }
    case 'exit': {
      const spot = spotFor(map, spec.key, 'near');
      if (spot) makeProp(map, spec, spot, 'SIGN', (e) => dialogue(exitTree(st, spec), 'The way out', e), 'The way out');
      return;
    }
    case 'board': {
      // The architecture pass may have built a NOTICE_BOARD into the square:
      // then the tile is the board, and the entity only answers for it.
      const built = T.NOTICE_BOARD ? safe(() => map.findTiles('deco', T.NOTICE_BOARD)[0], null) : null;
      const spot = built || spotFor(map, spec.key, 'town');
      if (!spot) return;
      const e = makeProp(map, spec, spot, T.NOTICE_BOARD ? 'NOTICE_BOARD' : 'SIGN', () => {
        if (boardHandler) { safe(() => boardHandler(spec.town), null); return { kind: 'none' }; }
        return { kind: 'sign', data: { text: 'The board is plastered with notices, most of them rained on.', title: 'Notice Board' } };
      }, 'Notice Board');
      // The painted board is the map's own tile: the entity only answers for it.
      // (tileId 0 alone fell through to the magenta missing-sprite marker.)
      if (built) { e.tileId = 0; e.draw = () => true; e.shadow = false; }
      return;
    }
    default:
  }
}

/** Bring one map's staged things in line with what the director wants now. */
export function stageMap(st, map, mapId) {
  if (!st || !map || typeof map.addEntity !== 'function') return;
  const id = String(mapId || map.id || '').replace(/@\d+$/, '');
  const specs = safe(() => D.spawnsFor(st, id), []);
  const want = new Set(specs.map((s) => s.key));
  for (const e of map.entities.slice()) {
    if (!e || !e[KEY] || want.has(e[KEY])) continue;
    // A pack that is mid-chase keeps its fight; everything else goes quietly.
    if (e.state === 'chase') continue;
    if (typeof e.remove === 'function') e.remove(); else map.removeEntity(e);
  }
  for (const s of specs) {
    if (map.entities.some((e) => e && !e.removed && e[KEY] === s.key)) continue;
    safe(() => build(st, map, s), null);
  }
  // Walking a road, a sharp eye may spot a way off it nobody mentioned (the director says so).
  const passive = Math.max(0, ...Party.members.map((m) => safe(() => skillMod(m, 'survival').passive, 10)));
  if (safe(() => D.searchForSites(st, id, passive), []).length) queueRestage();
}

let restageQueued = false;
function queueRestage() {
  if (restageQueued) return;
  restageQueued = true;
  // Deferred: the director's news arrives mid-battle or mid-dialogue, and the
  // map must not change under whoever is iterating its entities right now.
  setTimeout(() => {
    restageQueued = false;
    const st = Game.state, map = Game.map;
    if (st && map) safe(() => stageMap(st, map, st.mapId), null);
  }, 0);
}

let installed = false;
export function installSites() {
  if (installed) return;
  installed = true;
  bus.on(EV.MAP_ENTER, (p) => { const st = Game.state; if (st && p && p.map) safe(() => stageMap(st, p.map, p.mapId), null); });
  for (const ev of [EV.QUEST_START, EV.QUEST_STEP, EV.QUEST_DONE, EV.QUEST_FAIL, EV.DAY_CHANGE]) bus.on(ev, queueRestage);
  bus.on(EV.FLAG_SET, (p) => { if (p && String(p.name || '').startsWith('dq:')) queueRestage(); });
}
