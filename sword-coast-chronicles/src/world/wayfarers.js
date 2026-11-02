// world/wayfarers.js — the people and creatures a situation puts on the map, and what they do there.
//
// rules/encounters.js decides that a Zhentarim toll post, a caravan and a Cragmaw
// raiding party are on the Triboar Trail today. This module makes them STAND
// somewhere: a chain of hard men across the road at the junction, a wagon creaking
// from one end of the map to the other with its guards strung out behind, goblins
// trudging a loop through the verges, a camp with a fire and two tents. You can
// see every one of them from a distance, read who they are off the name plate
// over the leader, and decide what to do before they decide for you.
//
// A Group owns its entities and drives them; the entities only walk and draw. The
// overworld updates groups once a frame and turns a group's "we want words with
// you" (a leader's `battleReady`) into a standoff through the same pendingBattle()
// poll the old roaming monsters used.

import { Entity } from './entity.js';
import { TF } from './tilemap.js';
import { TILE, DIR_VEC, dirFrom, WALK_TIME, clamp } from '../constants.js';
import { makeRNG, hashStr } from '../core/rng.js';
import { T, tileKey, tileGroup } from '../render/tiles.js';
import { hasSprite } from '../render/sprites.js';
import { UI } from '../ui/kit.js';
import { blockOf, lineOf, situation } from '../rules/encounters.js';

const arr = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);
const cheb = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));

/** Ground a caravan would call a road. */
const ROAD_KEY = /^(DIRT_PATH|GRAVEL|ROAD|COBBLE|BRIDGE|FLAGSTONE|PAVING)/;
export function isRoad(map, x, y) {
  if (!map || !map.inBounds(x, y)) return false;
  const g = map.at('ground', x, y);
  return ROAD_KEY.test(tileKey(g)) || tileGroup(g) === 'road';
}

/** Tiles the eye reads as cover: tall grass, brush, a treeline close by. */
export function isCover(map, x, y) {
  if (!map || !map.inBounds(x, y)) return false;
  const k = tileKey(map.at('ground', x, y));
  if (/GRASS_TALL|REED|FERN|SWAMP/.test(k)) return true;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const d = tileKey(map.at('deco', x + dx, y + dy));
      if (/TREE|BUSH|HEDGE|BOULDER|ROCK|RUIN|WALL/.test(d)) return true;
    }
  }
  return false;
}

/**
 * Would standing here set something off — a warp, a scripted fight, a door? Every
 * trigger marks its tiles, and an encounter zone covers most of a wild map, so the
 * flag alone would forbid nearly all the open ground.
 */
function setsOff(map, x, y) {
  for (const t of map.triggersAt(x, y)) if (t && t.kind !== 'encounter-zone' && t.kind !== 'npc-spawn') return true;
  return false;
}

// ---------------------------------------------------------------------------
// ENTITIES
// ---------------------------------------------------------------------------

/**
 * One member of a group: a Zhent thug, a caravan ox, the wagon itself, a goblin.
 * Walking and drawing only; the Group does the thinking.
 */
export class WayfarerEntity extends Entity {
  constructor(opts = {}) {
    super({ kind: 'wayfarer', solid: true, shadow: true, ...opts });
    this.group = opts.group || null;
    this.role = opts.role || 'member';
    this.downed = !!opts.downed;
    this.tileId = opts.tileId || 0;
    this.moveTime = opts.moveTime || WALK_TIME * 2.2;
  }

  /** What the E key says over this one. */
  get verb() {
    const g = this.group;
    if (!g) return 'Look';
    if (g.inst.mind === 'beast' || g.inst.mind === 'feral' || g.inst.mind === 'mindless') return 'Face';
    if (!g.noticed && g.hostileish()) return 'Watch';
    return 'Talk';
  }

  interact() {
    const g = this.group;
    if (!g || g.gone) return null;
    return { kind: 'standoff', data: { group: g, mode: g.modeForInteract() } };
  }

  /** The leader's request for a standoff, picked up by EntityList.pendingBattle(). */
  takeBattle() {
    if (!this.battleReady) return null;
    this.battleReady = false;
    const g = this.group;
    if (!g || g.gone) return null;
    return { kind: 'standoff', data: { group: g, mode: g.pendingMode || 'noticed' } };
  }

  draw(ctx, cam, opts = {}) {
    const extra = this.downed ? { rotate: Math.PI / 2, downed: true } : {};
    const ok = super.draw(ctx, cam, { ...opts, ...extra });
    if (ok && this.group && this.role === 'leader') this.group.drawOverhead(ctx, cam, this);
    return ok;
  }

  // No think(): the Group moves its people.
}

/**
 * A campfire: a ring of stones, a few logs and a fire that moves. Drawn in code so
 * it needs no new tile, and pushed into the overworld's light list so it throws a
 * glow at night like a brazier does.
 */
export class CampfireEntity extends Entity {
  constructor(opts = {}) {
    super({ kind: 'prop', solid: true, shadow: false, ...opts });
    this.lit = opts.lit !== false;
    this.glow = { x: this.x, y: this.y, def: { r: 36, c: [255, 150, 60], flick: 1 }, phase: (hashStr(`${this.x},${this.y}`) % 32) / 32 };
  }

  update(dt, map, ctx) {
    super.update(dt, map, ctx);
    // The overworld caches its light sources on the map; a fire that is really
    // burning belongs on that list, and a cold one does not.
    const g = map && map._glows;
    if (Array.isArray(g)) {
      const i = g.indexOf(this.glow);
      if (this.lit && !this.removed && i < 0) g.push(this.glow);
      else if ((!this.lit || this.removed) && i >= 0) g.splice(i, 1);
    }
  }

  remove() {
    const g = this.map && this.map._glows;
    if (Array.isArray(g)) { const i = g.indexOf(this.glow); if (i >= 0) g.splice(i, 1); }
    return super.remove();
  }

  draw(ctx, cam) {
    if (this.removed || this.hidden) return false;
    const x = Math.round(this.px - (cam ? cam.x : 0));
    const y = Math.round(this.py - (cam ? cam.y : 0));
    // stones
    ctx.fillStyle = '#3a3634';
    for (const [dx, dy] of [[-6, -2], [-4, 0], [0, 1], [4, 0], [6, -2], [4, -4], [-4, -4]]) ctx.fillRect(x + dx - 1, y + dy - 2, 3, 2);
    ctx.fillStyle = '#6a625a';
    for (const [dx, dy] of [[-6, -3], [0, 0], [6, -3]]) ctx.fillRect(x + dx - 1, y + dy - 2, 2, 1);
    // logs, crossed
    ctx.fillStyle = '#4a2e1a';
    ctx.fillRect(x - 4, y - 4, 8, 2);
    ctx.fillStyle = '#6a4424';
    ctx.fillRect(x - 3, y - 5, 2, 3); ctx.fillRect(x + 1, y - 5, 2, 3);
    if (!this.lit) {
      ctx.fillStyle = '#2a2624';
      ctx.fillRect(x - 3, y - 6, 6, 2);
      return true;
    }
    // fire: three tongues that rise and fall out of step
    const t = this.t * 9;
    const h1 = 6 + Math.round(Math.sin(t) * 1.5), h2 = 8 + Math.round(Math.sin(t * 1.3 + 1) * 2), h3 = 5 + Math.round(Math.sin(t * 0.8 + 2) * 1.5);
    ctx.fillStyle = '#b8401c';
    ctx.fillRect(x - 3, y - 4 - h1, 2, h1); ctx.fillRect(x - 1, y - 4 - h2, 2, h2); ctx.fillRect(x + 1, y - 4 - h3, 2, h3);
    ctx.fillStyle = '#f08a2a';
    ctx.fillRect(x - 2, y - 4 - (h1 - 2), 1, h1 - 2); ctx.fillRect(x - 1, y - 4 - (h2 - 2), 2, h2 - 2); ctx.fillRect(x + 1, y - 4 - (h3 - 2), 1, h3 - 2);
    ctx.fillStyle = '#f7dc92';
    ctx.fillRect(x - 1, y - 4 - Math.max(1, h2 - 5), 2, Math.max(1, h2 - 5));
    // a spark now and then
    const sp = (this.t * 1.7) % 1;
    if (sp < 0.5) { ctx.fillStyle = '#ffd070'; ctx.fillRect(x + Math.round(Math.sin(this.t * 3) * 3), y - 12 - Math.round(sp * 10), 1, 1); }
    // A thread of woodsmoke leaning off with the wind: the camp is seen from far
    // off by its smoke long before anyone at it is.
    for (let i = 0; i < 5; i++) {
      const k = ((this.t * 0.35) + i / 5) % 1;
      const sx = x + Math.round(Math.sin(k * 5 + i) * 1.5 + k * 9);
      const sy = y - 14 - Math.round(k * 34);
      const s = 2 + Math.round(k * 3);
      ctx.globalAlpha = 0.34 * (1 - k);
      ctx.fillStyle = '#b8b4ac';
      ctx.fillRect(sx - (s >> 1), sy - (s >> 1), s, s);
    }
    ctx.globalAlpha = 1;
    return true;
  }
}

/** A tile drawn as a thing standing in the world: a tent, a cold fire-ring. */
export class PropTileEntity extends Entity {
  constructor(opts = {}) {
    super({ kind: 'prop', solid: opts.solid !== false, shadow: false, ...opts });
    this.tileId = opts.tileId || 0;
  }
}

// ---------------------------------------------------------------------------
// THE GROUP
// ---------------------------------------------------------------------------

const SIGHT = { camp: 7, post: 9, travel: 7, patrol: 7, hunt: 8, scene: 6 };
const PACE = { camp: 0.5, post: 0.5, travel: 0.4, patrol: 0.45, hunt: 0.36, scene: 0.6, approach: 0.28 };

/** Short shouts, by how they feel about you. */
const SHOUTS = {
  hostile: ['Halt!', 'You there!', 'Stop!'],
  beast: ['Grrr...', '*snarl*'],
  mindless: ['...'],
  wary: ['Halt!', 'Hold there.', 'Easy now.'],
  friendly: ['Well met!', 'Hail!', 'Good day!'],
  plea: ['Help!', 'Please!', 'Over here!'],
};

export class Group {
  /**
   * @param {object} inst   a rules/encounters.js instance
   * @param {TileMap} map
   * @param {object} opts   { avoid:{x,y} the party's arrival point, onGone(group) }
   */
  constructor(inst, map, opts = {}) {
    this.inst = inst;
    this.uid = inst.uid;
    this.map = map;
    this.members = [];
    this.props = [];
    this.leader = null;
    this.opts = opts;
    this.r = makeRNG(`${inst.seed}:walk`);
    this.noticed = false;
    this.unseen = null;          // null: no stealth roll yet this approach; true/false after
    this.state = 'idle';         // idle | approach | halt | leaving
    this.settled = inst.status === 'passed';
    this.gone = false;
    this.cooldown = 0;
    this.pendingMode = null;
    this.moveT = 0;
    this.senseT = 0;
    this.route = null;           // travel/patrol waypoints
    this.routeI = 0;
    this.trail = [];             // leader's recent tiles, for the members to follow
    this.anchor = null;
    this.bubble = null;          // { text, t, color }
    this.greeted = false;
    this.orbit = 0;
    this.lostT = 0;
  }

  hostileish() { return this.inst.attitude === 'hostile' || this.inst.attitude === 'wary'; }

  /** How an E press on this group opens the standoff. */
  modeForInteract() {
    if (this.settled) return 'settled';
    if (!this.noticed && this.hostileish()) return 'unnoticed';
    return 'noticed';
  }

  // --- placement -------------------------------------------------------------

  /** Walkable for a group member: no wall, no water, no warp, no hazard, nobody there. */
  free(x, y, ignoreSelf = null) {
    const map = this.map;
    if (!map.inBounds(x, y) || x < 1 || y < 1 || x >= map.w - 1 || y >= map.h - 1) return false;
    if (map.solidAt(x, y)) return false;
    const f = map.flagAt(x, y);
    if (f & (TF.DAMAGE | TF.WATER) || ((f & TF.TRIGGER) && setsOff(map, x, y))) return false;
    if (map.entityBlocks(x, y, ignoreSelf)) return false;
    return true;
  }

  /** A tile of the given kind, away from where the party came in. */
  findSpot(kind) {
    const map = this.map, r = this.r;
    const away = this.opts.avoid || map.spawn || { x: map.w >> 1, y: map.h >> 1 };
    const minAway = 9;
    const roads = [];
    for (let y = 1; y < map.h - 1; y++) for (let x = 1; x < map.w - 1; x++) if (isRoad(map, x, y)) roads.push({ x, y });
    const nearRoad = (x, y, lo, hi) => roads.some((p) => { const d = cheb(p.x, p.y, x, y); return d >= lo && d <= hi; });
    const ok = (x, y) => this.free(x, y) && cheb(x, y, away.x, away.y) >= minAway;
    for (let i = 0; i < 400; i++) {
      let x, y;
      if ((kind === 'road') && roads.length) {
        const p = roads[r.int(0, roads.length - 1)];
        x = p.x; y = p.y;
        // A toll post wants the middle of the map, not the doorstep of an exit.
        if (x < map.w * 0.2 || x > map.w * 0.8) { if (map.w > map.h) continue; }
        if (y < map.h * 0.15 || y > map.h * 0.85) { if (map.h >= map.w) continue; }
      } else {
        x = r.int(2, map.w - 3); y = r.int(2, map.h - 3);
      }
      if (!ok(x, y)) continue;
      if (kind === 'roadside' && roads.length && (isRoad(map, x, y) || !nearRoad(x, y, 2, 6))) continue;
      if (kind === 'wild' && isRoad(map, x, y) && i < 300) continue;
      if (kind === 'water') {
        let wet = false;
        for (let dy = -2; dy <= 2 && !wet; dy++) for (let dx = -2; dx <= 2 && !wet; dx++) if (map.flagAt(x + dx, y + dy) & TF.WATER) wet = true;
        if (!wet && i < 350) continue;
      }
      if (kind === 'ruins') {
        let grave = false;
        for (let dy = -3; dy <= 3 && !grave; dy++) for (let dx = -3; dx <= 3 && !grave; dx++) {
          if (/GRAVE|TOMB|BONE|SKULL|RUIN|PILLAR|STATUE/.test(tileKey(map.at('deco', x + dx, y + dy)))) grave = true;
        }
        if (!grave && i < 320) continue;
      }
      return { x, y };
    }
    return null;
  }

  /** Every exit cluster on the map, as the tile just inside each. */
  exits() {
    const map = this.map;
    const warps = map.triggersOfKind ? map.triggersOfKind('warp') : [];
    const out = [];
    for (const t of warps) {
      if (out.some((e) => cheb(e.wx, e.wy, t.x, t.y) <= 3)) continue;
      // Step two tiles inward from the edge so nobody stands on the warp itself.
      const ix = t.x <= 1 ? t.x + 2 : t.x >= map.w - 2 ? t.x - 2 : t.x;
      const iy = t.y <= 1 ? t.y + 2 : t.y >= map.h - 2 ? t.y - 2 : t.y;
      const spot = map.nearestWalkable(ix, iy, 4);
      if (spot) out.push({ wx: t.x, wy: t.y, x: spot.x, y: spot.y });
    }
    return out;
  }

  /** A path that keeps to the road where there is one. */
  roadPath(a, b) {
    const map = this.map;
    const strict = map.findPath(a, b, { maxNodes: 9000, avoid: (x, y) => !isRoad(map, x, y) && cheb(x, y, b.x, b.y) > 2 && cheb(x, y, a.x, a.y) > 2 });
    return strict && strict.length ? strict : map.findPath(a, b, { maxNodes: 9000, partial: true });
  }

  /** Put the group on the map. Returns false if there was nowhere to stand. */
  spawn() {
    const inst = this.inst;
    const shape = inst.shape;
    if (shape === 'travel') return this.spawnTravel();
    if (inst.arrive) return this.spawnArriving();
    const place = shape === 'post' ? 'road' : inst.place;
    const spot = this.findSpot(place) || this.findSpot('wild');
    if (!spot) return false;
    this.anchor = spot;
    if (shape === 'camp') return this.spawnCamp(spot);
    if (shape === 'post') return this.spawnPost(spot);
    this.placeFolk(spot, this.formationAround(spot));
    if (shape === 'patrol') this.route = this.loopAround(spot, 10);
    return this.members.length > 0;
  }

  spawnTravel() {
    const ex = this.exits();
    if (ex.length < 2) {
      // Nowhere to go from and to: they are simply on the road somewhere.
      const spot = this.findSpot('road') || this.findSpot('wild');
      if (!spot) return false;
      this.anchor = spot;
      this.placeFolk(spot, this.formationAround(spot));
      this.route = this.loopAround(spot, 12);
      return this.members.length > 0;
    }
    const a = ex[this.r.int(0, ex.length - 1)];
    const others = ex.filter((e) => e !== a).sort((p, q) => cheb(q.x, q.y, a.x, a.y) - cheb(p.x, p.y, a.x, a.y));
    const b = others[0];
    const path = this.roadPath({ x: a.x, y: a.y }, { x: b.x, y: b.y });
    if (!path || path.length < 6) return false;
    // A group planned when the party arrived is already somewhere along the road;
    // one that arrives later walks in from the edge.
    const away = this.opts.avoid || { x: -99, y: -99 };
    let start = 0;
    if (!this.inst.arrive) {
      const picks = [];
      for (let i = Math.floor(path.length * 0.2); i < Math.floor(path.length * 0.8); i++) {
        if (cheb(path[i].x, path[i].y, away.x, away.y) >= 10) picks.push(i);
      }
      if (picks.length) start = picks[this.r.int(0, picks.length - 1)];
    }
    this.route = path.slice(start);
    this.routeI = 0;
    const head = this.route[0];
    this.anchor = { x: head.x, y: head.y };
    const behind = path.slice(Math.max(0, start - 8), start).reverse();
    const slots = [head, ...behind];
    this.placeFolk(head, slots);
    return this.members.length > 0;
  }

  /**
   * Someone who walks onto the map while the party is on it: in at the edge the
   * party is not standing near, then off toward wherever the party is, the way a
   * band that has picked up your trail would. Once there they work the ground.
   */
  spawnArriving() {
    const p = this.opts.avoid || { x: this.map.w >> 1, y: this.map.h >> 1 };
    const ex = this.exits().filter((e) => cheb(e.x, e.y, p.x, p.y) >= 12);
    const from = ex.length ? ex[this.r.int(0, ex.length - 1)] : this.findSpot('wild');
    if (!from) return false;
    this.anchor = { x: from.x, y: from.y };
    this.placeFolk(from, this.formationAround(from));
    if (!this.members.length) return false;
    const path = this.map.findPath({ x: from.x, y: from.y }, { x: p.x, y: p.y }, { maxNodes: 6000, partial: true });
    this.route = path && path.length > 4 ? path.slice(0, -3) : this.loopAround(from, 8);
    this.routeI = 0;
    this.seeking = true;
    return true;
  }

  /**
   * An ambush springs: the band is suddenly THERE, a few paces off, in the best
   * cover the ground offers around the party.
   */
  spawnNear(p) {
    const spots = [];
    for (let dy = -5; dy <= 5; dy++) {
      for (let dx = -5; dx <= 5; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        if (d < 2 || d > 5) continue;
        const x = p.x + dx, y = p.y + dy;
        if (!this.free(x, y)) continue;
        spots.push({ x, y, score: (isCover(this.map, x, y) ? 4 : 0) + (d === 3 ? 2 : 0) + this.r.float(0, 1) });
      }
    }
    if (!spots.length) return false;
    spots.sort((a, b) => b.score - a.score);
    const at = spots[0];
    this.anchor = { x: at.x, y: at.y };
    this.placeFolk(at, [at, ...spots.slice(1).sort((a, b) => cheb(a.x, a.y, at.x, at.y) - cheb(b.x, b.y, at.x, at.y))]);
    if (!this.members.length) return false;
    this.route = this.loopAround(at, 6);
    for (const m of this.members) m.faceToward(p.x, p.y);
    return true;
  }

  spawnCamp(spot) {
    const map = this.map;
    // The fire, the tents, and everyone sitting round it.
    const fire = new CampfireEntity({ x: spot.x, y: spot.y, lit: true });
    this.addProp(fire);
    const tentN = this.inst.camp ? this.r.int(this.inst.camp.tents[0], this.inst.camp.tents[1]) : 1;
    const tentSpots = [[-2, -2], [2, -2], [0, -3], [-3, 0]];
    for (let i = 0; i < tentN; i++) {
      const [dx, dy] = tentSpots[i];
      const x = spot.x + dx, y = spot.y + dy;
      if (!this.free(x, y)) continue;
      this.addProp(new PropTileEntity({ x, y, tileId: T.TENT || 0, solid: true }));
    }
    const ring = [[0, 1], [-1, 0], [1, 0], [-1, 1], [1, 1], [0, 2], [-2, 1], [2, 1], [-1, -1], [1, -1]];
    this.placeFolk(spot, ring.map(([dx, dy]) => ({ x: spot.x + dx, y: spot.y + dy })));
    this.fire = fire;
    void map;
    return this.members.length > 0;
  }

  spawnPost(spot) {
    const map = this.map;
    // Which way does the road run here? Chain the post across it.
    let horiz = 0, vert = 0;
    for (let d = -3; d <= 3; d++) { if (isRoad(map, spot.x + d, spot.y)) horiz++; if (isRoad(map, spot.x, spot.y + d)) vert++; }
    const across = horiz >= vert ? [0, 1] : [1, 0];
    const slots = [{ x: spot.x, y: spot.y }];
    for (let k = 1; k <= 3; k++) {
      slots.push({ x: spot.x + across[0] * k, y: spot.y + across[1] * k });
      slots.push({ x: spot.x - across[0] * k, y: spot.y - across[1] * k });
    }
    this.placeFolk(spot, slots);
    this.postFacing = horiz >= vert ? 'left' : 'up';
    return this.members.length > 0;
  }

  formationAround(spot) {
    const out = [{ x: spot.x, y: spot.y }];
    const ring = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1], [2, 0], [-2, 0], [0, 2], [0, -2]];
    for (const [dx, dy] of ring) out.push({ x: spot.x + dx, y: spot.y + dy });
    return out;
  }

  loopAround(spot, radius) {
    const pts = [];
    for (let i = 0; i < 40 && pts.length < 4; i++) {
      const x = spot.x + this.r.int(-radius, radius), y = spot.y + this.r.int(-radius, radius);
      if (!this.free(x, y)) continue;
      pts.push({ x, y });
    }
    pts.push({ x: spot.x, y: spot.y });
    return pts;
  }

  addProp(e) {
    this.props.push(e);
    this.map.addEntity(e);
    return e;
  }

  /** Stand the folk on the slots, first slot first. */
  placeFolk(anchor, slots) {
    const folk = this.inst.folk.length ? this.inst.folk : [{ role: 'leader', monsterId: this.inst.leader.monsterId }];
    let si = 0;
    for (const f of folk) {
      let spot = null;
      while (si < slots.length && !spot) {
        const s = slots[si++];
        if (s && this.free(s.x, s.y)) spot = s;
      }
      if (!spot) { const n = this.map.nearestWalkable(anchor.x, anchor.y, 5); if (n && this.free(n.x, n.y)) spot = n; }
      if (!spot) continue;
      const e = this.makeMember(f, spot);
      if (!e) continue;
      this.members.push(e);
      this.map.addEntity(e);
      if (!this.leader && (f.role === 'leader' || folk.indexOf(f) === 0)) { this.leader = e; e.role = 'leader'; }
    }
    if (!this.leader && this.members.length) { this.leader = this.members[0]; this.leader.role = 'leader'; }
  }

  makeMember(f, spot) {
    const inst = this.inst;
    const base = {
      x: spot.x, y: spot.y, group: this, role: f.role, downed: !!f.downed, scale: f.scale || 1,
      name: f.role === 'leader' || f.role === 'merchant' ? inst.leader.full : inst.name,
      dir: 'down', moveTime: WALK_TIME * (1 / PACE[inst.shape] || 2.2) * 0.2,
    };
    base.moveTime = PACE[inst.shape] || 0.45;
    if (f.tile) {
      const id = T[f.tile];
      if (!id) return null;
      return new WayfarerEntity({ ...base, tileId: id, shadow: false, role: 'cart' });
    }
    if (f.beast) return new WayfarerEntity({ ...base, sprite: hasSprite(f.beast) ? f.beast : 'dog' });
    if (f.sprite) {
      let sprite = f.sprite;
      // The same NPC variation the townsfolk get, keyed on this group's identity.
      const v = hashStr(`${inst.uid}:${this.members.length}`) % 4;
      if (v && hasSprite(`${sprite}-v${v}`)) sprite = `${sprite}-v${v}`;
      return new WayfarerEntity({ ...base, sprite: hasSprite(sprite) ? sprite : 'npc-villager-m' });
    }
    const id = f.monsterId || inst.leader.monsterId || (inst.monsters[0] && inst.monsters[0].id);
    const block = blockOf(id);
    // The green hag goes about as the old woman she pretends to be.
    const sprite = (block && block.sprite) || 'npc-villager-m';
    if (id === 'green-hag' && !inst.revealed) return new WayfarerEntity({ ...base, sprite: 'npc-goodwife' });
    return new WayfarerEntity({
      ...base, char: { monsterId: id, sprite, name: block ? block.name : id, tint: block ? block.tint || null : null },
    });
  }

  // --- life ------------------------------------------------------------------

  shout(kind) {
    const pool = SHOUTS[kind] || SHOUTS.hostile;
    this.bubble = { text: pool[this.r.int(0, pool.length - 1)], t: 2.2 };
  }

  /**
   * Once a frame. `p` is the party leader's tile; `env` carries the facts the
   * group needs from the scene: { st, ctx, night, onRoad, cover, stealth(inst) }.
   */
  update(dt, p, env = {}) {
    if (this.gone || !this.leader) return;
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.bubble) { this.bubble.t -= dt; if (this.bubble.t <= 0) this.bubble = null; }
    const L = this.leader;
    if (L.removed) { this.gone = true; return; }

    this.senseT -= dt;
    if (this.senseT <= 0 && p) { this.senseT = 0.2; this.sense(p, env); }

    this.moveT -= dt;
    if (this.moveT > 0 || L.moving) return;
    const pace = this.state === 'approach' ? PACE.approach : (PACE[this.inst.shape] || 0.45);
    this.moveT = pace;
    this.act(p, env);
  }

  sense(p, env) {
    const inst = this.inst;
    const L = this.leader;
    const d = cheb(L.x, L.y, p.x, p.y);
    let sight = SIGHT[inst.shape] || 7;
    if (inst.mind === 'mindless') sight = 5;
    if (env.night && inst.shape === 'camp') sight = 4;
    if (env.night && inst.mind !== 'beast' && inst.mind !== 'mindless') sight = Math.max(4, sight - 2);
    const sees = d <= sight && this.map.lineOfSight(L.x, L.y, p.x, p.y);

    if (this.settled) {
      if (d <= 3 && !this.greeted && inst.mind === 'reason') { this.greeted = true; this.shout('friendly'); }
      if (d > 8) this.greeted = false;
      return;
    }

    // A hostile band the party has not yet laid eyes on still leaves signs: tracks
    // across the ruts, a wolf's yip hushed, woodsmoke. Said once, as they near.
    if (!this.hinted && this.hostileish() && !sees && d <= 13 && typeof env.hint === 'function') {
      this.hinted = true;
      const def = situation(inst.sitId);
      const signs = def && def.lines && def.lines.sign ? arr(def.lines.sign) : arr(def && def.telegraph);
      if (signs.length) env.hint(signs[this.r.int(0, signs.length - 1)], inst);
    }

    if (!this.noticed) {
      if (!sees) { if (d > sight + 4) this.unseen = null; return; }
      if (this.unseen === null) {
        // Open road by day is open road. Off it, in the grass or the dark, the
        // party gets a Stealth check against these particular eyes.
        const hidden = !env.onRoad && (env.cover || env.night || ['fog', 'rain', 'storm'].includes(env.weather));
        if (hidden && this.hostileish() && typeof env.stealth === 'function') {
          const roll = env.stealth(inst);
          this.unseen = !!(roll && roll.success);
          if (env.floater) env.floater(this.unseen ? 'Unseen' : 'Spotted!', this.unseen ? '#7ad07a' : '#e0604a');
        } else this.unseen = false;
      }
      if (this.unseen && d > 1) return;
      this.notice(p);
      return;
    }

    // Already aware of the party.
    if (this.state === 'approach') {
      if (d > sight + 6) { this.lostT += 0.2; if (this.lostT > 3) this.calmDown(); }
      else this.lostT = 0;
    }
    if (this.cooldown > 0) return;
    const hostile = inst.attitude === 'hostile';
    if (hostile && d <= 1) this.request('noticed');
    else if (inst.attitude === 'wary' && d <= 3) this.request('noticed');
    else if (inst.plea === 'rescue' && d <= 4) this.request('noticed');
    // People in need come to you, once: the refugees ask, the child runs up.
    else if (inst.plea && !this.asked && d <= 2) { this.asked = true; this.request('noticed'); }
    // Friendly travellers call a greeting as you pass, and let you walk on.
    else if (!inst.plea && inst.attitude === 'friendly' && !this.greeted && d <= 3 && typeof env.hint === 'function') {
      this.greeted = true;
      env.hint(`${inst.name}: ${inst.opener}`, inst, 'greet');
    }
  }

  notice(p) {
    const inst = this.inst;
    this.noticed = true;
    this.inst.noticed = true;
    this.lostT = 0;
    if (inst.plea) { this.shout('plea'); if (inst.plea === 'rescue') this.state = 'idle'; return; }
    if (inst.attitude === 'hostile') {
      this.shout(inst.mind === 'beast' || inst.mind === 'feral' ? 'beast' : inst.mind === 'mindless' ? 'mindless' : 'hostile');
      this.state = 'approach';
    } else if (inst.attitude === 'wary') {
      this.shout('wary');
      this.state = 'halt';
    } else {
      this.shout('friendly');
    }
    this.leader.faceToward(p.x, p.y);
  }

  calmDown() {
    this.state = 'idle';
    this.noticed = false;
    this.unseen = null;
    this.lostT = 0;
  }

  request(mode) {
    if (this.pendingMode || this.cooldown > 0) return;
    this.pendingMode = mode;
    this.leader.battleReady = true;
  }

  /** The overworld opened (or declined) the standoff this group asked for. */
  consumed() { this.pendingMode = null; if (this.leader) this.leader.battleReady = false; }

  /** One decision per pace: where each member goes next. */
  act(p, env) {
    const inst = this.inst;
    const L = this.leader;
    if (this.state === 'leaving') { this.walkRoute(true); return; }
    if (this.state === 'approach' && p) {
      this.stepToward(L, p, true);
      this.follow();
      return;
    }
    if (this.state === 'halt' && p) { L.faceToward(p.x, p.y); for (const m of this.members) if (m !== L) m.faceToward(p.x, p.y); return; }
    if (this.seeking) { this.walkRoute(false); return; }

    switch (inst.shape) {
      case 'travel': this.walkRoute(false); break;
      case 'patrol': this.walkRoute(false, true); break;
      case 'hunt': this.wander(L, 8); this.follow(); break;
      case 'camp': this.campLife(env); break;
      case 'post': this.postLife(); break;
      case 'scene': this.sceneLife(); break;
      default: break;
    }
  }

  walkRoute(leaving, loop = false) {
    const L = this.leader;
    if (!this.route || !this.route.length) {
      if (leaving) this.leave();
      return;
    }
    const target = this.route[this.routeI];
    if (!target) {
      if (loop) { this.routeI = 0; return; }
      // An arrival has reached the ground it was making for: it works it from here.
      if (this.seeking) {
        this.seeking = false;
        this.anchor = { x: L.x, y: L.y };
        this.route = this.loopAround(this.anchor, 8);
        this.routeI = 0;
        return;
      }
      // The far end of the road: they walk off the map and are gone.
      this.leave();
      return;
    }
    if (L.x === target.x && L.y === target.y) {
      this.routeI++;
      if (loop && this.routeI >= this.route.length) this.routeI = 0;
      return;
    }
    if (!this.stepToward(L, target, false)) {
      // Something is in the way (usually the party standing in the road): wait,
      // and after a while find a way round.
      this.blockedT = (this.blockedT || 0) + 1;
      if (this.blockedT > 6) {
        this.blockedT = 0;
        const rest = this.map.findPath({ x: L.x, y: L.y }, target, { maxNodes: 2000, partial: true, avoid: (x, y) => !!this.map.entityBlocks(x, y, L) });
        if (rest && rest.length) this.route.splice(this.routeI, 0, ...rest.slice(0, -1));
      }
    } else this.blockedT = 0;
    this.follow();
  }

  /** One step for `e` toward `t`. Returns true if it moved. */
  stepToward(e, t, chasing) {
    if (e.x === t.x && e.y === t.y) return false;
    if (chasing && cheb(e.x, e.y, t.x, t.y) <= 1) { e.faceToward(t.x, t.y); return false; }
    const path = cheb(e.x, e.y, t.x, t.y) <= 1
      ? [t]
      : this.map.findPath({ x: e.x, y: e.y }, t, { maxNodes: 600, partial: true, goalPassable: true, avoid: (x, y) => !this.memberFree(x, y, e) });
    const n = path && path[0];
    if (!n) return false;
    if (!this.memberFree(n.x, n.y, e)) return false;
    return this.moveMember(e, n.x, n.y);
  }

  memberFree(x, y, self) {
    const map = this.map;
    if (!map.inBounds(x, y) || map.solidAt(x, y)) return false;
    const f = map.flagAt(x, y);
    if (f & (TF.DAMAGE | TF.WATER) || ((f & TF.TRIGGER) && setsOff(map, x, y))) return false;
    const blocker = map.entityBlocks(x, y, self);
    if (blocker && !(blocker.group === this)) return false;
    return true;
  }

  moveMember(e, x, y) {
    const dir = dirFrom(x - e.x, y - e.y);
    if (!dir) return false;
    const legal = this.map.canStep(e.x, e.y, x, y, e.moveOpts());
    if (!legal.ok || legal.hop) return false;
    const ox = e.x, oy = e.y;
    const ok = e.step(dir, this.map, { force: true, time: e.moveTime });
    if (ok && e === this.leader) {
      this.trail.unshift({ x: ox, y: oy });
      if (this.trail.length > 16) this.trail.length = 16;
    }
    return ok;
  }

  /** Members walk where the leader has just been, in a line. */
  follow() {
    let k = 0;
    for (const m of this.members) {
      if (m === this.leader || m.moving) continue;
      const t = this.trail[k] || null;
      k++;
      if (!t) continue;
      const d = cheb(m.x, m.y, t.x, t.y);
      if (d === 0) continue;
      if (d > 4) { if (this.free(t.x, t.y, m)) m.setTile(t.x, t.y, m.dir); continue; }
      this.stepToward(m, t, false);
    }
  }

  wander(e, radius) {
    const a = this.anchor || { x: e.x, y: e.y };
    if (!this.wanderTo || (e.x === this.wanderTo.x && e.y === this.wanderTo.y) || this.r.chance(0.04)) {
      for (let i = 0; i < 12; i++) {
        const x = a.x + this.r.int(-radius, radius), y = a.y + this.r.int(-radius, radius);
        if (this.free(x, y)) { this.wanderTo = { x, y }; break; }
      }
    }
    if (this.wanderTo) this.stepToward(e, this.wanderTo, false);
  }

  campLife(env) {
    const a = this.anchor;
    for (const m of this.members) {
      if (m.moving) continue;
      if (env.night) { m.faceToward(a.x, a.y); continue; }       // asleep round the fire
      if (this.r.chance(0.18)) {
        const x = a.x + this.r.int(-2, 2), y = a.y + this.r.int(-1, 2);
        if (this.free(x, y, m) && cheb(x, y, a.x, a.y) >= 1) this.stepToward(m, { x, y }, false);
      } else if (this.r.chance(0.3)) m.faceToward(a.x, a.y);
    }
  }

  postLife() {
    for (const m of this.members) if (!m.moving && this.postFacing) m.face(this.r.chance(0.5) ? this.postFacing : (this.postFacing === 'left' ? 'right' : 'down'));
  }

  sceneLife() {
    const inst = this.inst;
    // Wolves circle the shepherd, a slot at a time.
    if (inst.kin === 'wolves') {
      const c = this.leader;
      this.orbit = (this.orbit + 1) % 8;
      const ring = [[2, 0], [2, 1], [1, 2], [0, 2], [-1, 2], [-2, 1], [-2, 0], [-2, -1], [-1, -2], [0, -2], [1, -2], [2, -1]];
      let i = 0;
      for (const m of this.members) {
        if (m.moving || m.role !== 'attacker') continue;
        const [dx, dy] = ring[(this.orbit + i * 3) % ring.length];
        i++;
        const t = { x: c.x + dx, y: c.y + dy };
        if (this.memberFree(t.x, t.y, m)) this.stepToward(m, t, false);
        m.faceToward(c.x, c.y);
      }
      return;
    }
    // Everyone else in a scene stays put; the attackers in a caravan raid press in.
    for (const m of this.members) {
      if (m.moving || m.role !== 'attacker') continue;
      if (this.r.chance(0.35)) {
        const x = this.anchor.x + this.r.int(-3, 3), y = this.anchor.y + this.r.int(-2, 2);
        if (this.memberFree(x, y, m)) this.stepToward(m, { x, y }, false);
      }
      m.faceToward(this.anchor.x, this.anchor.y);
    }
  }

  // --- endings ---------------------------------------------------------------

  /** They have been dealt with peaceably: they carry on, and do not trouble you again. */
  settle() {
    this.settled = true;
    this.noticed = true;
    this.state = 'idle';
    this.consumed();
    if (this.inst.plea === 'rescue') {
      // The attackers are gone from a rescued caravan.
      for (const m of this.members.slice()) if (m.role === 'attacker') this.drop(m);
    }
  }

  /** They head for the nearest edge and out of the story (the wounded get up first). */
  rout() {
    this.settled = true;
    this.consumed();
    for (const m of this.members) m.downed = false;
    const ex = this.exits();
    const L = this.leader;
    if (!ex.length || !L) { this.leave(); return; }
    const far = ex.sort((a, b) => cheb(a.x, a.y, L.x, L.y) - cheb(b.x, b.y, L.x, L.y))[0];
    const path = this.map.findPath({ x: L.x, y: L.y }, { x: far.x, y: far.y }, { maxNodes: 6000, partial: true });
    if (!path || !path.length) { this.leave(); return; }
    this.route = path;
    this.routeI = 0;
    this.state = 'leaving';
    this.leaveBy = 30;     // seconds; nobody walks forever
  }

  /** A fight they lost, or the far edge of the map: gone. The camp's fire goes cold. */
  leave() {
    if (this.gone) return;
    this.gone = true;
    for (const m of this.members) this.drop(m, true);
    this.members = [];
    if (this.fire) this.fire.lit = false;
    if (this.opts.onGone) this.opts.onGone(this);
  }

  /** Beaten: the group vanishes, but the camp's cold fire and tents stay where they were. */
  defeated() {
    if (this.fire) this.fire.lit = false;
    this.leave();
  }

  drop(m, keep = false) {
    const i = this.members.indexOf(m);
    if (i >= 0 && !keep) this.members.splice(i, 1);
    if (this.map && this.map.removeEntity) this.map.removeEntity(m);
    else if (m.remove) m.remove();
    m.removed = true;
  }

  /** Remove everything this group put on the map, props included (a plan changed). */
  despawn() {
    for (const m of this.members) this.drop(m, true);
    for (const p of this.props) { if (p.remove) p.remove(); else if (this.map) this.map.removeEntity(p); p.removed = true; }
    this.members = [];
    this.props = [];
    this.gone = true;
  }

  // --- drawing ---------------------------------------------------------------

  /** Over the leader: a name plate when the party is near, and whatever they are shouting. */
  drawOverhead(ctx, cam, L) {
    const p = this.opts.player ? this.opts.player() : null;
    const cx = cam ? cam.x : 0, cy = cam ? cam.y : 0;
    const x = Math.round(L.px - cx);
    const y = Math.round(L.py - cy) - 28;
    const near = p && cheb(p.x, p.y, L.x, L.y) <= 6;
    const inst = this.inst;
    if (near && !this.bubble) {
      const col = inst.attitude === 'hostile' ? '#e8735c' : inst.attitude === 'wary' ? '#e8b23a' : inst.plea ? '#8fc8f0' : '#cfe0a8';
      try { UI.text(ctx, x, y - 2, this.settled ? inst.name : inst.name, { size: 'sm', color: col, align: 'center', shadow: true }); } catch (e) { /* font not ready */ }
    }
    if (this.bubble) {
      const w = Math.max(14, (this.bubble.text.length * 6) + 6);
      const bx = x - (w >> 1), by = y - 8;
      ctx.fillStyle = 'rgba(20,14,12,0.85)';
      ctx.fillRect(bx, by, w, 11);
      ctx.fillStyle = '#efe6d0';
      ctx.fillRect(bx, by, w, 1); ctx.fillRect(bx, by + 10, w, 1);
      ctx.fillRect(x - 1, by + 11, 2, 2);
      try { UI.text(ctx, x, by + 2, this.bubble.text, { size: 'sm', color: '#fffaf0', align: 'center', shadow: false }); } catch (e) { /* ignore */ }
    } else if (!near && this.noticed && this.state === 'approach') {
      ctx.fillStyle = '#1a1014'; ctx.fillRect(x - 3, y - 1, 6, 10);
      ctx.fillStyle = '#ffe45a'; ctx.fillRect(x - 1, y, 2, 5); ctx.fillRect(x - 1, y + 6, 2, 2);
    }
  }
}

/** Make and place a group; null if the map had nowhere for it. */
export function placeGroup(inst, map, opts = {}) {
  const g = new Group(inst, map, opts);
  if (!g.spawn()) { g.despawn(); return null; }
  if (inst.status === 'passed') g.settled = true;
  return g;
}

/** Make a group that is suddenly there, a few paces from `p` (a sprung ambush). */
export function placeGroupNear(inst, map, p, opts = {}) {
  const g = new Group(inst, map, opts);
  if (!g.spawnNear(p)) { g.despawn(); return null; }
  return g;
}

/** The cold ring of a camp somebody broke: a landmark, and a reminder. */
export function placeAshes(map, rec, opts = {}) {
  const r = makeRNG(`${rec.seed}:ashes`);
  const g = new Group({ uid: `${rec.uid}:ashes`, seed: rec.seed, shape: 'camp', place: 'roadside', folk: [], leader: {}, monsters: [], attitude: 'friendly' }, map, opts);
  g.r = r;
  const spot = g.findSpot('roadside') || g.findSpot('wild');
  if (!spot) return null;
  const fire = new CampfireEntity({ x: spot.x, y: spot.y, lit: false });
  map.addEntity(fire);
  const bones = T.BONES ? new PropTileEntity({ x: spot.x + 1, y: spot.y + 1, tileId: T.BONES, solid: false }) : null;
  if (bones && g.free(bones.x, bones.y)) map.addEntity(bones);
  return [fire, bones].filter(Boolean);
}

export { lineOf };
