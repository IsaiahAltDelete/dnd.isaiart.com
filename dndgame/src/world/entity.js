// world/entity.js — everything that stands on a TileMap and isn't scenery.
//
// One small class hierarchy covers the whole overworld cast: townsfolk who
// wander Phandalin's muddy lanes, goblins that spot you on the Triboar Trail and
// come running, chests, signposts, doors into buildings and the invisible warp
// pads at map edges.
//
// Movement is grid-locked: `step()` commits to the destination tile immediately
// (so occupancy is never ambiguous) and tweens the drawn pixel position across
// it over `moveTime` seconds. Draw order is by feet-y, so a villager standing a
// tile north of you is drawn behind you.

import {
  TILE, DIR_VEC, dirFrom, oppositeDir, WALK_TIME, clamp, timeOfDay,
} from '../constants.js';
import { rng, makeRNG, hashStr } from '../core/rng.js';
import { bus, EV } from '../core/events.js';
import { Audio } from '../core/audio.js';
import { drawSprite, hasSprite, walkFrame, spriteDef, makeColorway } from '../render/sprites.js';
import { drawActor } from '../render/actor.js';
import { drawTile, T } from '../render/tiles.js';
import { Lighting } from '../render/lighting.js';
import { TF } from './tilemap.js';
import { Game } from '../engine.js';
import { chestKey, isChestLooted, markChestLooted } from '../state.js';
import { npcDisposition } from '../rules/reputation.js';

let serial = 0;
const nextId = (p) => `${p}${(++serial).toString(36)}`;

/** Where the game state lives, without hard-failing if we're on a test page. */
function gstate() { return (Game && Game.state) || null; }

/** Seconds of game time, used for tile animation frames. */
function gtime() { return (Game && Game.time) || 0; }

// ---------------------------------------------------------------------------
// Carried lights: a torch or a lantern in the hand, three pixels wide, so the
// pool render/lighting.js throws at night comes from something you can see.
// Offsets are from the feet anchor (px, py) to the item's top-left, per facing:
// the free hand, at hip height, on the side the sprite's weapon is not.
// ---------------------------------------------------------------------------

const HELD_AT = {
  down: [4, -12], up: [-7, -12], left: [-6, -11], right: [3, -11],
};
const IRON_D = '#2a2320', IRON = '#6a5a48', GLASS = '#e0a040', WOOD = '#6a4a2a', WOOD_L = '#8a6440';
const FLAME = ['#ffd070', '#fff0b8'], FIRE = '#f08a2a';

function drawHeld(ctx, kind, x, y, dir, t, moving) {
  const o = HELD_AT[dir] || HELD_AT.down;
  // A step's swing: the hand rises a pixel every other stride.
  const sw = moving && (Math.floor(t * 6) & 1) ? 1 : 0;
  const hx = x + o[0], hy = y + o[1] - sw;
  const f = Math.floor(t * 7 + x * 0.13) & 1;           // two-frame flicker
  if (kind === 'torch') {
    ctx.fillStyle = WOOD; ctx.fillRect(hx + 1, hy + 3, 1, 3);
    ctx.fillStyle = WOOD_L; ctx.fillRect(hx + 1, hy + 3, 1, 1);
    ctx.fillStyle = FIRE; ctx.fillRect(hx, hy + 1, 3, 2); ctx.fillRect(hx + 1, hy - f, 1, 1 + f);
    ctx.fillStyle = FLAME[f]; ctx.fillRect(hx + 1, hy + 1, 1, 1);
    return;
  }
  // A horn lantern on a bail.
  ctx.fillStyle = IRON_D;
  ctx.fillRect(hx + 1, hy, 1, 1);
  ctx.fillRect(hx, hy + 1, 1, 3); ctx.fillRect(hx + 2, hy + 1, 1, 3);
  ctx.fillRect(hx + 1, hy + 4, 1, 1);
  ctx.fillStyle = IRON; ctx.fillRect(hx + 1, hy + 1, 1, 1);
  ctx.fillStyle = FLAME[f]; ctx.fillRect(hx + 1, hy + 2, 1, 1);
  ctx.fillStyle = GLASS; ctx.fillRect(hx + 1, hy + 3, 1, 1);
}

// ===========================================================================
// BASE ENTITY
// ===========================================================================

export class Entity {
  /**
   * opts: { x, y, dir, sprite, colorway, char, solid, kind, id, name, data,
   *         moveTime, scale, tint, tintAmt, zBias, hidden, shadow, bobbing,
   *         flying, swimming, size, footOffset }
   */
  constructor(opts = {}) {
    this.id = opts.id || nextId('e');
    this.kind = opts.kind || 'prop';
    this.name = opts.name || '';

    // Tile position is authoritative; pixels follow.
    this.x = opts.x | 0;
    this.y = opts.y | 0;
    this.fromX = this.x;
    this.fromY = this.y;
    this.footOffset = opts.footOffset || 0;
    this.px = this.x * TILE + TILE / 2;
    this.py = this.y * TILE + TILE + this.footOffset;

    this.dir = opts.dir || 'down';
    this.moving = false;
    this.moveT = 0;
    this.moveTime = opts.moveTime || WALK_TIME;
    this.hopping = null;              // { x, y, h } while vaulting a ledge

    // Presentation.
    this.sprite = opts.sprite || null;
    this.colorway = opts.colorway || null;
    this.char = opts.char || null;    // a full Character -> composed layer sprite
    this.scale = opts.scale || 1;
    this.tint = opts.tint || null;
    this.tintAmt = opts.tintAmt != null ? opts.tintAmt : 0;
    this.shadow = opts.shadow !== false;
    this.bobbing = !!opts.bobbing;    // floaty things (wisps, spectres)
    this.alpha = opts.alpha != null ? opts.alpha : 1;
    this.heldLight = opts.heldLight || null;
    this.frameOverride = null;

    // Rules-ish.
    this.solid = opts.solid !== false;
    this.flying = !!opts.flying;
    this.swimming = !!opts.swimming;
    this.size = Math.max(1, opts.size | 0 || 1);
    this.hidden = !!opts.hidden;
    this.removed = false;
    this.zBias = opts.zBias || 0;

    this.data = opts.data ? { ...opts.data } : {};
    this.map = null;
    this.list = null;

    this.t = 0;                       // local clock
    this.idleOffset = (hashStr(this.id) % 1000) / 137;
    this.animPhase = 0;               // walk-cycle position
    this.bumpT = 0;                   // squish when you walk into something
    this.rng = opts.rng || makeRNG(`${this.id}:${this.x},${this.y}`);
  }

  // --- geometry ------------------------------------------------------------

  get z() { return this.py + this.zBias; }
  get tileKey() { return `${this.x},${this.y}`; }

  /** Pixel centre of the tile the entity occupies (not the tween position). */
  get tilePx() { return this.x * TILE + TILE / 2; }
  get tilePy() { return this.y * TILE + TILE + this.footOffset; }

  /** Force the drawn position back onto the tile grid. */
  snapPixels() {
    this.fromX = this.x; this.fromY = this.y;
    this.px = this.tilePx; this.py = this.tilePy;
    this.moving = false; this.moveT = 0; this.hopping = null;
    return this;
  }

  setTile(x, y, dir) {
    const ox = this.x, oy = this.y;
    this.x = x | 0; this.y = y | 0;
    if (dir) this.dir = dir;
    this.snapPixels();
    if (this.list) this.list.moved(this, ox, oy);
    return this;
  }

  face(dir) { if (dir) this.dir = dir; return this; }
  faceToward(x, y) { this.dir = dirFrom(x - this.x, y - this.y); return this; }
  faceAway(x, y) { this.dir = oppositeDir(dirFrom(x - this.x, y - this.y)); return this; }

  distanceTo(x, y) { return Math.abs(this.x - x) + Math.abs(this.y - y); }
  isAdjacentTo(x, y) { return this.distanceTo(x, y) === 1; }
  /** The tile this entity is looking at. */
  frontTile() {
    const v = DIR_VEC[this.dir] || DIR_VEC.down;
    return { x: this.x + v.x, y: this.y + v.y };
  }

  moveOpts() {
    return { flying: this.flying, swimming: this.swimming, size: this.size, climb: this.climb || 0 };
  }

  // --- movement ------------------------------------------------------------

  /** Could this entity stand on (x, y) right now? */
  canEnter(map, x, y, opts = {}) {
    if (!map) return false;
    if (map.solidAt(x, y, this.moveOpts())) return false;
    if (!opts.ignoreEntities && map.entityBlocks(x, y, this)) return false;
    if (opts.avoidTriggers && (map.flagAt(x, y) & TF.TRIGGER)) return false;
    if (opts.avoidHazards && (map.flagAt(x, y) & TF.DAMAGE)) return false;
    return true;
  }

  /**
   * Begin a step. Commits to the destination tile at once and tweens the sprite
   * across; returns false (and turns to face) if the way is blocked.
   * opts: { turnOnly, run, ignoreEntities, avoidTriggers, force }
   */
  step(dir, map, opts = {}) {
    if (this.moving || this.removed) return false;
    const v = DIR_VEC[dir];
    if (!v) return false;
    this.dir = dir;
    if (opts.turnOnly) return false;

    const tx = this.x + v.x, ty = this.y + v.y;
    let dest = { x: tx, y: ty };
    let hop = null;

    if (map && !opts.force) {
      const legal = map.canStep(this.x, this.y, tx, ty, this.moveOpts());
      if (!legal.ok) { this.bump(); return false; }
      if (legal.hop) { hop = legal.hop; dest = legal.hop; }
      if (!opts.ignoreEntities && map.entityBlocks(dest.x, dest.y, this)) { this.bump(); return false; }
      if (opts.avoidTriggers && (map.flagAt(dest.x, dest.y) & TF.TRIGGER)) return false;
    }

    const ox = this.x, oy = this.y;
    this.fromX = this.x; this.fromY = this.y;
    this.x = dest.x; this.y = dest.y;
    this.moving = true;
    this.moveT = 0;
    this.stepTime = opts.time || (opts.run ? this.moveTime * 0.6 : this.moveTime);
    if (hop) { this.hopping = { h: 8 }; this.stepTime = this.moveTime * 1.6; }
    if (this.list) this.list.moved(this, ox, oy);
    this.onStepStart?.(dest, map);
    return true;
  }

  /** One step along a stored path (see followPath / MonsterEntity). */
  stepAlong(path, map, opts = {}) {
    if (!path || !path.length) return false;
    const n = path[0];
    const dx = n.x - this.x, dy = n.y - this.y;
    if (dx === 0 && dy === 0) { path.shift(); return this.stepAlong(path, map, opts); }
    const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    const ok = this.step(dir, map, opts);
    if (ok) path.shift();
    return ok;
  }

  /** A squash when you walk into a wall — cheap but it sells the collision. */
  bump(sfx = false) {
    this.bumpT = 0.14;
    if (sfx) Audio.sfx('error');
    return false;
  }

  // --- lifecycle -----------------------------------------------------------

  update(dt, map, ctx) {
    if (this.removed) return;
    this.t += dt;
    if (this.bumpT > 0) this.bumpT = Math.max(0, this.bumpT - dt);

    if (this.moving) {
      const dur = this.stepTime || this.moveTime;
      this.moveT += dt;
      const p = clamp(this.moveT / dur, 0, 1);
      const fx = this.fromX * TILE + TILE / 2;
      const fy = this.fromY * TILE + TILE + this.footOffset;
      this.px = fx + (this.tilePx - fx) * p;
      this.py = fy + (this.tilePy - fy) * p;
      // A ledge hop arcs; a normal step is flat.
      if (this.hopping) this.py -= Math.sin(p * Math.PI) * this.hopping.h;
      this.animPhase += dt * (2 / Math.max(0.01, dur));
      if (p >= 1) {
        this.moving = false;
        this.hopping = null;
        this.snapPixelsSoft();
        this.onStepEnd?.(map);
      }
    } else {
      this.px = this.tilePx;
      this.py = this.tilePy;
    }

    this.think?.(dt, map, ctx);
  }

  /** Land exactly on the grid without cancelling anything else. */
  snapPixelsSoft() {
    this.fromX = this.x; this.fromY = this.y;
    this.px = this.tilePx; this.py = this.tilePy;
  }

  /** The sprite frame to draw this instant. */
  frame() {
    if (this.frameOverride) return this.frameOverride;
    if (this.moving) return walkFrame(this.dir, Math.floor(this.animPhase) & 3);
    return `${this.dir}-${this.idlePose() ? 3 : 0}`;
  }

  idlePose() {
    return (this.kind === 'npc' || !!this.char) && (this.t + this.idleOffset) % 4.7 < 0.22;
  }

  /**
   * Draw with the camera's top-left pixel offset.
   * cam: { x, y } in pixels (fractional is fine; we round on output).
   */
  draw(ctx, cam, opts = {}) {
    if (this.removed || this.hidden) return false;
    const cx = cam ? cam.x : 0, cy = cam ? cam.y : 0;
    let x = Math.round(this.px - cx);
    let y = Math.round(this.py - cy);
    if (this.bumpT > 0) {
      const v = DIR_VEC[this.dir] || DIR_VEC.down;
      const k = Math.round(Math.sin((this.bumpT / 0.14) * Math.PI) * 2);
      x += v.x * k; y += v.y * k;
    }
    const bob = this.bobbing ? Math.round(Math.sin(this.t * 2.6) * 1.5) : 0;

    const drawOpts = {
      scale: this.scale, alpha: this.alpha, shadow: this.shadow,
      tint: this.tint, tintAmt: this.tintAmt, colorway: this.colorway, bob,
      ...opts,
    };

    // A carried light is drawn in the hand: behind the body when walking away,
    // in front of it otherwise. render/lighting.js puts its pool at the flame.
    const held = this.heldLightNow();
    if (held && this.dir === 'up') drawHeld(ctx, held, x, y + bob, this.dir, this.t, this.moving);

    let ok;
    // Full characters go through the layered actor compositor.
    if (this.kind === 'monster' && this.monsterId) {
      ok = drawActor(ctx, this, x, y, {dir:this.dir,phase:Math.floor(this.animPhase)&3,moving:this.moving,...drawOpts});
    } else if (this.char) {
      ok = drawActor(ctx, this.char, x, y, {
        idleBob: this.idlePose(), dir: this.dir, phase: Math.floor(this.animPhase) & 3, moving: this.moving,
        ...drawOpts,
      });
    } else if (this.sprite && hasSprite(this.sprite)) {
      ok = drawSprite(ctx, this.sprite, this.frame(), x, y, drawOpts);
    }
    if (ok !== undefined) {
      if (held && this.dir !== 'up') drawHeld(ctx, held, x, y + bob, this.dir, this.t, this.moving);
      return ok;
    }
    if (this.tileId) {
      drawTile(ctx, this.tileId, x - TILE / 2, y - TILE, this.x, this.y, gtime());
      return true;
    }
    return this.drawFallback(ctx, x, y);
  }

  /**
   * What this one carries that burns: 'torch' | 'lantern' | null. The party's
   * lead is told each frame by the overworld (from what is in the packs);
   * NPCs decide for themselves (NPCEntity).
   */
  heldLightNow() { return this.heldLight || null; }

  /** World pixel of the carried flame (where its light pool is centred), into `out`. */
  heldLightAt(out) {
    const o = HELD_AT[this.dir] || HELD_AT.down;
    out.x = Math.round(this.px) + o[0] + 1;
    const sw = this.moving && (Math.floor(this.t * 6) & 1) ? 1 : 0;
    const bob = this.bobbing ? Math.round(Math.sin(this.t * 2.6) * 1.5) : 0;
    out.y = Math.round(this.py) + o[1] + (this.heldLightNow() === 'torch' ? 1 : 2) + bob - sw;
    if (this.bumpT > 0) {
      const v = DIR_VEC[this.dir] || DIR_VEC.down;
      const k = Math.round(Math.sin((this.bumpT / 0.14) * Math.PI) * 2);
      out.x += v.x * k; out.y += v.y * k;
    }
    return out;
  }

  /** Never leave a hole in the world: an unknown sprite draws as a marker. */
  drawFallback(ctx, x, y) {
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#b04a8a';
    ctx.fillRect(Math.round(x - 5), Math.round(y - 12), 10, 12);
    ctx.fillStyle = '#f0d0e8';
    ctx.fillRect(Math.round(x - 3), Math.round(y - 10), 6, 3);
    ctx.restore();
    return true;
  }

  /** What happens when the player presses A while facing this. */
  interact(_ctx) { return null; }

  /** What happens when the player walks onto this entity's tile. */
  onTouch(_ctx) { return null; }

  remove() {
    this.removed = true;
    if (this.map) this.map.removeEntity(this);
    else if (this.list) this.list.remove(this);
    return this;
  }

  serialize() {
    return {
      cls: 'entity', id: this.id, kind: this.kind, name: this.name,
      x: this.x, y: this.y, dir: this.dir, sprite: this.sprite,
      solid: this.solid, hidden: this.hidden, data: { ...this.data },
    };
  }
}

// ===========================================================================
// NPCs
// ===========================================================================

/**
 * A townsperson. Wanders inside a radius of their home tile, stops and turns to
 * face you while you talk, and can walk a patrol route or keep a schedule that
 * moves them between home, work and the taproom as the day turns.
 */
export class NPCEntity extends Entity {
  /**
   * opts (plus Entity's): {
   *   npcId, dialogueId, shopId, questIds, faction, role,
   *   wander:0|1|2|3 (radius; 0 = never moves), wanderChance, idleMin, idleMax,
   *   patrol:[{x,y,wait}], loopPatrol, schedule:{ morning:{x,y,dir}, ... },
   *   facePlayer=true, greeting
   * }
   */
  constructor(opts = {}) {
    super({ kind: 'npc', solid: true, ...opts });
    this.npcId = opts.npcId || opts.id || this.id;
    // Identity, not spawn order or random state, controls the silhouette.
    if (this.sprite?.startsWith('npc-') && !/-v[1-3]$/.test(this.sprite)) {
      const variation = hashStr(this.npcId) % 4;
      const candidate = `${this.sprite}-v${variation}`;
      if (variation && hasSprite(candidate)) this.sprite = candidate;
    }
    if (!this.colorway && /^npc-(villager-[mf]|farmer|labourer|goodwife|porter|child)(-v[1-3])?$/.test(this.sprite || '')) {
      const dyes = [
        ['#526f70', '#b4a079', '#d2c09b'], ['#995b50', '#66516c', '#dbc5a3'],
        ['#777149', '#725344', '#bcaa81'], ['#696487', '#b08b58', '#d6cabb'],
        ['#a5784c', '#4d6d68', '#cabc9a'], ['#5b758d', '#845b55', '#d6c9ad'],
      ];
      const [main, alt, cloth] = dyes[hashStr(this.npcId + ':dye') % dyes.length];
      const dye = makeColorway({ main, alt, cloth });
      this.colorway = { ...spriteDef(this.sprite)?.defaultColorway };
      for (const key of ['MAIN', 'MAIN_D', 'MAIN_L', 'ALT', 'ALT_D', 'ALT_L', 'CLOTH', 'CLOTH_D']) this.colorway[key] = dye[key];
    }
    this.title = opts.title || '';       // the authored caption, e.g. "The Inn Cat"
    this.dialogueId = opts.dialogueId || opts.dialogue || null;
    this.shopId = opts.shopId || opts.shop || null;
    this.questIds = opts.questIds || opts.quests || [];
    this.faction = opts.faction || null;
    this.role = opts.role || 'flavor';
    this.greeting = opts.greeting || null;
    // Kept so rules/crime.js can decide whether the player may draw steel here,
    // and which bestiary entry stands in for this person if they do.
    this.tag = opts.tag || null;
    this.essential = !!opts.essential;
    this.noCombat = !!opts.noCombat;
    this.npc = opts.npc || null;
    this.hostile = false;              // set once they have seen you swing
    this.fleeT = 0;                    // seconds left running from what they saw
    this.fleeFrom = null;
    this.ambleTime = null;             // their own pace, restored when they stop

    this.home = opts.home ? { x: opts.home.x | 0, y: opts.home.y | 0 } : { x: this.x, y: this.y };
    this.homeDir = opts.dir || 'down';
    this.wanderRadius = opts.wander != null ? (opts.wander | 0) : 1;
    this.wanderChance = opts.wanderChance != null ? opts.wanderChance : 0.55;
    this.idleMin = opts.idleMin != null ? opts.idleMin : 1.2;
    this.idleMax = opts.idleMax != null ? opts.idleMax : 4.5;
    this.idleTimer = this.rng.float(this.idleMin, this.idleMax);
    this.moveTime = opts.moveTime || WALK_TIME * 1.9;   // townsfolk amble

    this.patrol = Array.isArray(opts.patrol) ? opts.patrol.map((p) => ({ x: p.x | 0, y: p.y | 0, wait: p.wait || 0 })) : null;
    this.loopPatrol = opts.loopPatrol !== false;
    this.patrolIndex = 0;
    this.patrolWait = 0;
    this.path = null;
    this.repathT = 0;

    this.schedule = opts.schedule || null;              // { morning:{x,y,dir,map}, ... }
    this.schedulePhase = null;

    this.facePlayer = opts.facePlayer !== false;
    this.pauseT = 0;
    this.busy = false;                                  // true while in dialogue
  }

  /**
   * The watch walk their rounds with a lantern after dark. Only out of doors,
   * only once it is properly night, and never a monster's business.
   */
  heldLightNow() {
    if (this.heldLight) return this.heldLight;
    if (this.role !== 'guard') return null;
    const env = Lighting.env;
    return env.place === 'outdoor' && env.night > 0.6 ? 'lantern' : null;
  }

  /** Freeze and turn toward the player for a moment (called on interaction). */
  pauseAndFace(x, y, dur = 2.5) {
    this.pauseT = Math.max(this.pauseT, dur);
    if (this.facePlayer) this.faceToward(x, y);
    return this;
  }

  /** Move to wherever this NPC should be for the given time-of-day phase. */
  applySchedule(phase, map, { instant = false } = {}) {
    if (!this.schedule || phase === this.schedulePhase) return false;
    const slot = this.schedule[phase];
    this.schedulePhase = phase;
    if (!slot) return false;
    if (slot.hidden != null) this.hidden = !!slot.hidden;
    const tx = slot.x != null ? slot.x | 0 : this.home.x;
    const ty = slot.y != null ? slot.y | 0 : this.home.y;
    this.home = { x: tx, y: ty };
    if (slot.dir) this.homeDir = slot.dir;
    if (instant || !map) {
      this.setTile(tx, ty, slot.dir || this.dir);
      return true;
    }
    // Walk there if it's close, otherwise just be there (off-screen bookkeeping).
    if (this.distanceTo(tx, ty) > 14) { this.setTile(tx, ty, slot.dir || this.dir); return true; }
    this.path = map.findPath({ x: this.x, y: this.y }, { x: tx, y: ty }, { maxNodes: 900, partial: true });
    return true;
  }

  /**
   * Someone drew a blade in the street. Townsfolk get out of it — they drop
   * their schedule, their patrol and their errand and put distance between
   * themselves and (x, y) for `seconds`.
   */
  flee(x, y, seconds = 10) {
    this.fleeT = Math.max(this.fleeT || 0, seconds);
    this.fleeFrom = { x: x | 0, y: y | 0 };
    this.busy = false;
    this.pauseT = 0;
    this.path = null;
    // Remember their own pace: a deliberately fast or slow townsfolk keeps it.
    if (this.ambleTime == null) this.ambleTime = this.moveTime;
    this.moveTime = WALK_TIME * 1.1;      // a townsfolk running is still no athlete
    return this;
  }

  /** MonsterEntity's name for the same idea, so callers need not care which. */
  scatter(seconds = 10) { return this.flee(this.x, this.y - 1, seconds); }

  think(dt, map, ctx) {
    if (this.fleeT > 0) {
      this.fleeT -= dt;
      if (this.fleeT <= 0) {
        this.moveTime = this.ambleTime != null ? this.ambleTime : WALK_TIME * 1.9;
        this.fleeFrom = null;
        this.returningHome = true;
      }
      else if (!this.moving && map) { this._stepAway(map); return; }
    }
    if (this.busy) return;
    if (this.pauseT > 0) { this.pauseT -= dt; return; }
    if (this.moving || !map) return;

    const st = gstate();
    const p = ctx?.player || (st ? { x: st.x, y: st.y } : null);
    this.disposition = this.tag === 'animal' ? 'neutral' : npcDisposition(st, this, map);
    const seesParty = p && this.distanceTo(p.x, p.y) <= 4 && map.lineOfSight(this.x, this.y, p.x, p.y);
    // Suspicious civilians keep a little space; guards hold their post and
    // watch. Do not run from the party indefinitely or abandon a shop counter.
    if (seesParty && this.disposition === 'wary' && this.distanceTo(p.x, p.y) <= 2) {
      this.path = null;
      this.faceToward(p.x, p.y);
      if (this.role !== 'guard' && !this.shopId && this.wanderRadius > 0 && this.distanceTo(this.home.x, this.home.y) <= this.wanderRadius + 1) {
        this.fleeFrom = { x: p.x, y: p.y };
        this._stepAway(map);
        this.fleeFrom = null;
        this.returningHome = true;
      }
      return;
    }
    if (this.returningHome && seesParty && this.disposition === 'wary') {
      this.path = null; this.faceToward(p.x, p.y); return;
    }

    // Time-of-day schedule takes priority over both patrol and wander.
    if (this.schedule) {
      const st = gstate();
      this.applySchedule(st ? timeOfDay(st.time) : 'morning', map);
    }

    if (this.path && this.path.length) {
      if (!this.stepAlong(this.path, map, { avoidTriggers: true })) {
        this.repathT -= dt;
        if (this.repathT <= 0) { this.path = null; this.repathT = 0.6; }
      }
      return;
    }
    this.path = null;

    // A panic used to strand a wanderer outside their permitted yard forever.
    if (this.returningHome) {
      if (this.x === this.home.x && this.y === this.home.y) this.returningHome = false;
      else {
        this.repathT -= dt;
        if (this.repathT <= 0) {
          this.repathT = 0.8;
          this.path = map.findPath({ x: this.x, y: this.y }, this.home, { maxNodes: 900, partial: true, avoid: (x, y) => map.entityBlocks(x, y, this) });
        }
        return;
      }
    }

    if (this.patrol && this.patrol.length) { this.doPatrol(dt, map); return; }
    if (this.wanderRadius > 0) this.doWander(dt, map);
  }

  /** One panicked pace directly away from whatever they are running from. */
  _stepAway(map) {
    const from = this.fleeFrom || { x: this.x, y: this.y };
    const dx = this.x - from.x, dy = this.y - from.y;
    const order = Math.abs(dx) >= Math.abs(dy)
      ? [dx >= 0 ? 'right' : 'left', dy >= 0 ? 'down' : 'up', dy >= 0 ? 'up' : 'down', dx >= 0 ? 'left' : 'right']
      : [dy >= 0 ? 'down' : 'up', dx >= 0 ? 'right' : 'left', dx >= 0 ? 'left' : 'right', dy >= 0 ? 'up' : 'down'];
    for (const d of order) {
      const v = DIR_VEC[d];
      const nx = this.x + v.x, ny = this.y + v.y;
      if (Math.abs(nx - from.x) + Math.abs(ny - from.y) <= Math.abs(dx) + Math.abs(dy)) continue;
      if (!map.inBounds(nx, ny)) continue;
      if (map.flagAt(nx, ny) & (TF.TRIGGER | TF.DAMAGE)) continue;
      if (!this.canEnter(map, nx, ny)) continue;
      if (map.entityBlocks(nx, ny, this)) continue;
      this.step(d, map);
      return true;
    }
    this.dir = order[0];
    return false;
  }

  doPatrol(dt, map) {
    if (this.patrolWait > 0) { this.patrolWait -= dt; return; }
    const target = this.patrol[this.patrolIndex % this.patrol.length];
    if (!target) return;
    if (this.x === target.x && this.y === target.y) {
      this.patrolWait = target.wait || 0.8;
      this.patrolIndex = this.loopPatrol
        ? (this.patrolIndex + 1) % this.patrol.length
        : Math.min(this.patrolIndex + 1, this.patrol.length - 1);
      return;
    }
    const path = map.findPath({ x: this.x, y: this.y },
      { x: target.x, y: target.y },
      { maxNodes: 700, partial: true, avoid: (x, y) => map.entityBlocks(x, y, this) });
    if (path && path.length) this.path = path;
    else { this.patrolWait = 1.2; this.patrolIndex++; }
  }

  doWander(dt, map) {
    this.idleTimer -= dt;
    if (this.idleTimer > 0) return;
    this.idleTimer = this.rng.float(this.idleMin, this.idleMax);
    if (!this.rng.chance(this.wanderChance)) {
      // Idle "look around" beat — small life, no movement.
      this.dir = this.rng.pick(['down', 'left', 'right', 'up']);
      return;
    }
    const dirs = this.rng.shuffle(['down', 'left', 'right', 'up']);
    for (const d of dirs) {
      const v = DIR_VEC[d];
      const nx = this.x + v.x, ny = this.y + v.y;
      // Stay in the yard, off triggers (never wander into a warp) and off water.
      if (Math.abs(nx - this.home.x) > this.wanderRadius) continue;
      if (Math.abs(ny - this.home.y) > this.wanderRadius) continue;
      if (!map.inBounds(nx, ny)) continue;
      if (map.flagAt(nx, ny) & (TF.TRIGGER | TF.DAMAGE)) continue;
      if (!this.canEnter(map, nx, ny)) continue;
      if (this.step(d, map, { avoidTriggers: true })) return;
    }
    this.dir = this.rng.pick(dirs);
  }

  interact(ctx = {}) {
    const px = ctx.x != null ? ctx.x : (ctx.player?.x ?? this.x);
    const py = ctx.y != null ? ctx.y : (ctx.player?.y ?? this.y);
    this.pauseAndFace(px, py, 3);
    bus.emit(EV.INTERACT, { entity: this, npcId: this.npcId });

    // A pure shopkeeper with no script opens the counter directly; anyone with
    // dialogue talks first and the dialogue tree decides whether to open a shop.
    if (this.shopId && !this.dialogueId) {
      return { kind: 'shop', data: { shopId: this.shopId, npcId: this.npcId, npc: this, entity: this } };
    }
    return {
      kind: 'dialogue',
      data: {
        dialogueId: this.dialogueId || this.npcId,
        npcId: this.npcId,
        npc: this,
        entity: this,
        name: this.name,
        shopId: this.shopId,
        quests: this.questIds,
        faction: this.faction,
        greeting: this.greeting,
      },
    };
  }

  serialize() {
    return {
      ...super.serialize(), cls: 'npc', npcId: this.npcId,
      dialogueId: this.dialogueId, shopId: this.shopId,
      home: { ...this.home }, wander: this.wanderRadius, schedulePhase: this.schedulePhase,
    };
  }
}

// ===========================================================================
// ROAMING MONSTERS
// ===========================================================================

/**
 * A visible monster on the field. It mills about its lair, notices you inside
 * `sight` when it also has line of sight, chases along a real A* path, gives up
 * a few seconds after losing you and trudges home. Touching you starts a battle.
 */
export class MonsterEntity extends Entity {
  /**
   * opts (plus Entity's): {
   *   monsterId, groupId, level, count, sight=6, leash=12, aggro=true,
   *   speed (tiles/sec) | moveTime, giveUp=3, respawn=90, defeatedKey,
   *   ambush, elite, boss, wander=2, alertSfx,
   *   monsters:[{id,count}]   the whole pack this entity stands for (a roamer)
   *   packId, satellite       pack members share a packId; satellites converge
   *                           on whoever the leader noticed
   *   respawnDays             come back this many in-game days after a defeat
   *                           (st.defeated[defeatedKey] then holds the day)
   * }
   */
  constructor(opts = {}) {
    super({ kind: 'monster', solid: true, ...opts });
    this.monsterId = opts.monsterId || opts.id || 'goblin';
    this.groupId = opts.groupId || null;
    this.level = opts.level || null;
    this.count = opts.count || 0;
    this.elite = !!opts.elite;
    this.boss = !!opts.boss;
    this.ambush = !!opts.ambush;
    this.monsters = Array.isArray(opts.monsters) ? opts.monsters.map((e) => ({ ...e })) : null;
    this.packId = opts.packId || null;
    this.satellite = !!opts.satellite;
    this.roll = opts.roll || null;           // { groupId, name, difficulty } for the title card
    this.respawnDays = opts.respawnDays != null ? opts.respawnDays : 0;

    this.home = opts.home ? { x: opts.home.x | 0, y: opts.home.y | 0 } : { x: this.x, y: this.y };
    this.sight = opts.sight != null ? opts.sight : 6;
    this.leash = opts.leash != null ? opts.leash : 12;
    this.aggro = opts.aggro !== false;
    this.giveUp = opts.giveUp != null ? opts.giveUp : 3;
    this.wanderRadius = opts.wander != null ? (opts.wander | 0) : 2;
    this.moveTime = opts.moveTime || (opts.speed ? 1 / Math.max(0.2, opts.speed) : WALK_TIME * 1.5);
    this.chaseTime = opts.chaseTime || this.moveTime * 0.75;   // they speed up hunting
    this.alertSfx = opts.alertSfx || 'cursor';

    this.state = 'idle';              // idle | chase | return | dead
    this.lostT = 0;
    this.senseT = 0;                  // perception is throttled, not per-frame
    this._sees = false;
    this.idleTimer = this.rng.float(0.6, 2.4);
    this.path = null;
    this.repathT = 0;
    this.repathEvery = opts.repathEvery || 0.45;
    this.alertT = 0;                  // "!" bubble timer

    this.respawn = opts.respawn != null ? opts.respawn : 90;
    this.respawnT = 0;
    this.defeatedKey = opts.defeatedKey || null;
    this.permanent = !!opts.permanent || !!opts.boss;
    this.contactCooldown = 0;
    this.battleReady = false;

    if (this.defeatedKey && this.isMarkedDefeated()) { this.hidden = true; this.state = 'dead'; this.solid = false; }
  }

  isMarkedDefeated() {
    const st = gstate();
    if (!st || !this.defeatedKey || !st.defeated) return false;
    const mark = st.defeated[this.defeatedKey];
    if (!mark) return false;
    // A roamer records the DAY it fell and is back after respawnDays.
    if (typeof mark === 'number' && this.respawnDays > 0) return (st.day || 0) - mark < this.respawnDays;
    return true;
  }

  /** Where is the player right now? The scene keeps this on the EntityList. */
  playerPos(ctx) {
    if (ctx && ctx.player) return ctx.player;
    if (this.list && this.list.player) return this.list.player;
    const st = gstate();
    return st ? { x: st.x | 0, y: st.y | 0 } : null;
  }

  think(dt, map, ctx) {
    if (this.contactCooldown > 0) this.contactCooldown -= dt;
    if (this.alertT > 0) this.alertT -= dt;

    if (this.state === 'dead') {
      if (this.permanent) return;
      if (this.respawnDays > 0) {
        // Day-based respawn: poll the calendar now and then rather than every frame.
        this.respawnT -= dt;
        if (this.respawnT <= 0) { this.respawnT = 2; if (!this.isMarkedDefeated()) this.reviveAtHome(); }
        return;
      }
      if (this.isMarkedDefeated() || this.respawn <= 0) return;
      this.respawnT -= dt;
      if (this.respawnT <= 0) this.reviveAtHome();
      return;
    }
    if (!map) return;

    const p = this.playerPos(ctx);

    // Perception and the chase bookkeeping run EVERY frame — mid-step included.
    // (If they only ran between tiles a fast monster would never lose you, since
    // it is almost always in the middle of a step.)
    this.senseT -= dt;
    if (this.senseT <= 0) { this.senseT = 0.12; this._sees = this.canSee(p, map); }
    const sees = this._sees;

    if (sees && this.aggro && this.state !== 'chase') {
      this.state = 'chase';
      this.lostT = 0;
      this.alertT = 0.9;
      this.path = null;
      this.repathT = 0;
      Audio.sfx(this.alertSfx, { vol: 0.5 });
      bus.emit('monster:notice', { entity: this, monsterId: this.monsterId, packId: this.packId });
      this.onNotice?.(p);
      if (this.packId && !this.satellite) this.alertPack(p);
    }

    if (this.state === 'chase') this.trackTarget(dt, map, p, sees);

    // Only the actual step decision waits for the current tween to finish.
    if (this.moving) return;
    if (this.state === 'chase') this.doChase(dt, map, p);
    else if (this.state === 'return') this.doReturn(dt, map);
    else this.doIdle(dt, map);
  }

  /** Lose-interest, leash and contact checks — the part that must never stall. */
  trackTarget(dt, map, p, sees) {
    if (!p) { this.state = 'return'; this.path = null; return; }

    if (sees) this.lostT = 0;
    else {
      this.lostT += dt;
      if (this.lostT >= this.giveUp) { this.state = 'return'; this.path = null; return; }
    }

    // Leash: a wolf won't follow you across the whole of Neverwinter Wood.
    if (this.leash > 0 && Math.max(Math.abs(this.x - this.home.x), Math.abs(this.y - this.home.y)) > this.leash) {
      this.state = 'return'; this.path = null; return;
    }

    // Contact — the fight starts here; the overworld reads `battleReady`.
    if (this.distanceTo(p.x, p.y) <= 1 && this.contactCooldown <= 0) {
      this.faceToward(p.x, p.y);
      this.battleReady = true;
      this.contactCooldown = 1.5;
      bus.emit('monster:contact', { entity: this, monsterId: this.monsterId });
    }
  }

  canSee(p, map) {
    if (!p || !map || this.hidden) return false;
    const d = Math.max(Math.abs(p.x - this.x), Math.abs(p.y - this.y));
    if (d > this.sight) return false;
    return map.lineOfSight(this.x, this.y, p.x, p.y);
  }

  doIdle(dt, map) {
    if (this.wanderRadius <= 0) return;
    this.idleTimer -= dt;
    if (this.idleTimer > 0) return;
    this.idleTimer = this.rng.float(0.8, 3.0);
    const dirs = this.rng.shuffle(['down', 'left', 'right', 'up']);
    for (const d of dirs) {
      const v = DIR_VEC[d];
      const nx = this.x + v.x, ny = this.y + v.y;
      if (Math.abs(nx - this.home.x) > this.wanderRadius) continue;
      if (Math.abs(ny - this.home.y) > this.wanderRadius) continue;
      if (!this.canEnter(map, nx, ny, { avoidHazards: true })) continue;
      if (this.step(d, map)) return;
    }
    this.dir = this.rng.pick(dirs);
  }

  /** Walk the chase path. State has already been settled by trackTarget(). */
  doChase(dt, map, p) {
    if (!p) return;
    if (this.distanceTo(p.x, p.y) <= 1) { this.faceToward(p.x, p.y); return; }

    this.repathT -= dt;
    if (!this.path || !this.path.length || this.repathT <= 0) {
      this.repathT = this.repathEvery;
      this.path = map.findPath({ x: this.x, y: this.y }, { x: p.x, y: p.y }, {
        maxNodes: 700, partial: true, goalPassable: true,
        avoid: (x, y) => map.entityBlocks(x, y, this),
        ...this.moveOpts(),
      });
    }
    if (this.path && this.path.length) {
      if (!this.stepAlong(this.path, map, { time: this.chaseTime })) { this.path = null; this.repathT = 0.15; }
    } else {
      // No route: shuffle hopefully toward the player so it never looks frozen.
      const d = dirFrom(p.x - this.x, p.y - this.y);
      if (!this.step(d, map, { time: this.chaseTime })) this.dir = d;
    }
  }

  doReturn(dt, map) {
    if (this.x === this.home.x && this.y === this.home.y) {
      this.state = 'idle'; this.path = null; return;
    }
    this.repathT -= dt;
    if (!this.path || !this.path.length || this.repathT <= 0) {
      this.repathT = 0.8;
      this.path = map.findPath({ x: this.x, y: this.y }, this.home, { maxNodes: 900, partial: true, ...this.moveOpts() });
    }
    if (this.path && this.path.length) {
      if (!this.stepAlong(this.path, map)) { this.path = null; this.repathT = 0.2; }
    } else {
      this.setTile(this.home.x, this.home.y, this.dir);
      this.state = 'idle';
    }
  }

  /** Consume the "we touched" edge so the scene only starts one battle. */
  takeBattle() {
    if (!this.battleReady) return null;
    this.battleReady = false;
    return this.interact();
  }

  /** Every other entity sharing this pack, if the map has an entity list. */
  packMates() {
    const list = this.list && this.list.list ? this.list.list : null;
    if (!list || !this.packId) return [];
    return list.filter((e) => e && e !== this && e.packId === this.packId && !e.removed);
  }

  /** Come running: a satellite told where the leader saw the party. */
  alert(p, { giveUp = 8 } = {}) {
    if (this.state === 'dead' || this.hidden || !this.aggro) return this;
    if (this.state !== 'chase') {
      this.state = 'chase';
      this.lostT = 0;
      this.alertT = 0.9;
      this.path = null;
      this.repathT = 0;
      // A satellite that cannot see you yet still knows roughly where you are.
      this.giveUp = Math.max(this.giveUp, giveUp);
    }
    if (p) this.faceToward(p.x, p.y);
    return this;
  }

  /** The leader noticed the party — the whole pack converges. */
  alertPack(p) {
    for (const m of this.packMates()) if (typeof m.alert === 'function') m.alert(p);
    return this;
  }

  /** Called after the party wins: vanish, and maybe come back later. */
  defeat({ permanent = null, pack = true } = {}) {
    this.state = 'dead';
    this.hidden = true;
    this.solid = false;
    this.battleReady = false;
    this.path = null;
    this.respawnT = this.respawn;
    const perm = permanent != null ? permanent : this.permanent;
    const st = gstate();
    if (perm && this.defeatedKey) {
      if (st) { st.defeated = st.defeated || {}; st.defeated[this.defeatedKey] = true; }
      this.remove();
    } else if (this.respawnDays > 0 && this.defeatedKey && st) {
      st.defeated = st.defeated || {};
      st.defeated[this.defeatedKey] = st.day || 0;
      this.respawnT = 2;
    }
    // One fight settles the whole pack: the satellites fell with their leader.
    if (pack && this.packId) for (const m of this.packMates()) if (typeof m.defeat === 'function') m.defeat({ permanent: perm, pack: false });
    return this;
  }

  reviveAtHome() {
    if (this.isMarkedDefeated()) { this.hidden = true; return this; }
    this.state = 'idle';
    this.hidden = false;
    this.solid = true;
    this.lostT = 0;
    this.setTile(this.home.x, this.home.y, this.dir);
    return this;
  }

  /** Fleeing monsters (a fight the party ran from) wander off for a while. */
  scatter(seconds = 6) {
    this.state = 'return';
    this.contactCooldown = seconds;
    this.path = null;
    return this;
  }

  draw(ctx, cam, opts) {
    const ok = super.draw(ctx, cam, opts);
    // The classic "!" when it spots you.
    if (ok && this.alertT > 0) {
      const cx = cam ? cam.x : 0, cy = cam ? cam.y : 0;
      const x = Math.round(this.px - cx), y = Math.round(this.py - cy) - 26;
      ctx.save();
      ctx.fillStyle = '#1a1014';
      ctx.fillRect(x - 3, y - 1, 6, 10);
      ctx.fillStyle = '#ffe45a';
      ctx.fillRect(x - 1, y, 2, 5);
      ctx.fillRect(x - 1, y + 6, 2, 2);
      ctx.restore();
    }
    return ok;
  }

  interact() {
    // A satellite hands the fight to its leader so the pack is fought once, whole.
    const leader = this.satellite ? this.packMates().find((m) => m.packId === this.packId && !m.satellite && m.state !== 'dead') : null;
    const src = leader || this;
    return {
      kind: 'battle',
      data: {
        monsterId: src.monsterId, groupId: src.groupId, level: src.level,
        count: src.count, elite: src.elite, boss: src.boss,
        ambush: src.ambush, entity: src,
        monsters: src.monsters ? src.monsters.map((e) => ({ ...e })) : null,
        packId: src.packId, roll: src.roll, roamer: !!src.monsters,
      },
    };
  }

  serialize() {
    return {
      ...super.serialize(), cls: 'monster', monsterId: this.monsterId,
      groupId: this.groupId, state: this.state, home: { ...this.home },
      defeatedKey: this.defeatedKey, respawnT: this.respawnT,
      monsters: this.monsters, packId: this.packId, satellite: this.satellite,
      respawnDays: this.respawnDays, roll: this.roll,
    };
  }
}

// ===========================================================================
// CHESTS
// ===========================================================================

/** A treasure chest. Opens once; `state.chests` remembers it across saves. */
export class ChestEntity extends Entity {
  /**
   * opts: { loot:[[itemId, qty], ...], gold, mapId, locked, keyId, trapped,
   *         spriteClosed, spriteOpen, once=true }
   */
  constructor(opts = {}) {
    super({ kind: 'chest', solid: true, sprite: opts.sprite || null, ...opts });
    this.loot = Array.isArray(opts.loot) ? opts.loot.map((l) => (Array.isArray(l) ? [l[0], l[1] || 1] : [l, 1])) : [];
    this.gold = opts.gold || 0;
    this.lootTable = opts.lootTable || null;   // resolved by the overworld via data/items
    this.mapId = opts.mapId || null;
    this.locked = !!opts.locked;
    this.keyId = opts.keyId || null;
    this.dc = opts.dc || 0;                    // lockpick DC
    this.trapped = opts.trapped || null;       // { dc, damage, type }
    this.once = opts.once !== false;
    this.spriteClosed = opts.spriteClosed || opts.sprite || 'chest';
    this.spriteOpen = opts.spriteOpen || 'chest-open';
    this.opened = false;
    this.openT = 0;
    this.refreshFromState();
  }

  get saveKey() {
    const mapId = this.mapId || this.map?.id || gstate()?.mapId || 'map';
    return chestKey(mapId, this.x, this.y);
  }

  /** Sync with the save file — a chest you looted last session stays open. */
  refreshFromState() {
    const st = gstate();
    if (!st || !this.once) return this.opened;
    const mapId = this.mapId || this.map?.id || st.mapId;
    if (isChestLooted(st, mapId, this.x, this.y)) { this.opened = true; this.openT = 1; }
    return this.opened;
  }

  draw(ctx, cam, opts) {
    const name = this.opened ? this.spriteOpen : this.spriteClosed;
    if (hasSprite(name)) {
      const saved = this.sprite;
      this.sprite = name;
      this.frameOverride = 'down-0';
      const ok = super.draw(ctx, cam, opts);
      this.sprite = saved;
      this.frameOverride = null;
      return ok;
    }
    // Fall back to the authored tile art, which always exists.
    this.tileId = this.opened ? (T.CHEST_OPEN || 0) : (T.CHEST_CLOSED || 0);
    return super.draw(ctx, cam, opts);
  }

  interact(_ctx = {}) {
    if (this.opened) return { kind: 'sign', data: { text: 'The chest is empty.', entity: this } };
    if (this.locked) {
      return {
        kind: 'chest',
        data: { entity: this, locked: true, keyId: this.keyId, dc: this.dc, chest: this },
      };
    }
    return this.open();
  }

  /** Actually loot it. The overworld hands the payload to Party / the UI. */
  open() {
    if (this.opened) return { kind: 'sign', data: { text: 'The chest is empty.', entity: this } };
    this.opened = true;
    this.openT = 0;
    this.locked = false;
    Audio.sfx('open');
    const st = gstate();
    if (st && this.once) markChestLooted(st, this.mapId || this.map?.id || st.mapId, this.x, this.y);
    bus.emit(EV.CHEST, { entity: this, loot: this.loot, gold: this.gold });
    return {
      kind: 'chest',
      data: {
        entity: this, chest: this, opened: true,
        loot: this.loot.map((l) => [l[0], l[1]]),
        gold: this.gold,
        lootTable: this.lootTable,
        trapped: this.trapped,
      },
    };
  }

  serialize() {
    return { ...super.serialize(), cls: 'chest', opened: this.opened, gold: this.gold, loot: this.loot };
  }
}

// ===========================================================================
// DOORS, WARPS, SIGNS, PROPS
// ===========================================================================

/**
 * A door into a building. Swings open with a little animation and a creak, then
 * hands back the warp the overworld should perform.
 */
export class DoorEntity extends Entity {
  /**
   * opts: { to:{ map, x, y, dir }, locked, keyId, flag, openTime=0.3,
   *         sfx='door', spriteClosed, spriteOpen, lockedText }
   */
  constructor(opts = {}) {
    super({ kind: 'door', solid: opts.solid !== false, ...opts });
    this.to = opts.to || opts.warp || null;
    this.locked = !!opts.locked;
    this.keyId = opts.keyId || null;
    this.flag = opts.flag || null;              // unlocked once this flag is set
    this.lockedText = opts.lockedText || 'The door is locked.';
    this.openTime = opts.openTime != null ? opts.openTime : 0.3;
    this.sfx = opts.sfx || 'door';
    this.spriteClosed = opts.spriteClosed || opts.sprite || 'door';
    this.spriteOpen = opts.spriteOpen || 'door-open';
    this.open = false;
    this.openT = 0;
  }

  isLocked() {
    if (!this.locked) return false;
    const st = gstate();
    if (this.flag && st && st.flags && st.flags[this.flag]) return false;
    return true;
  }

  think(dt) {
    if (this.open && this.openT < 1) this.openT = Math.min(1, this.openT + dt / Math.max(0.01, this.openTime));
  }

  draw(ctx, cam, opts) {
    const name = this.open ? this.spriteOpen : this.spriteClosed;
    if (hasSprite(name)) {
      const saved = this.sprite;
      this.sprite = name;
      this.frameOverride = 'down-0';
      const ok = super.draw(ctx, cam, opts);
      this.sprite = saved;
      this.frameOverride = null;
      return ok;
    }
    this.tileId = this.open ? (T.DOOR_OPEN || 0) : (T.DOOR_CLOSED || 0);
    return super.draw(ctx, cam, opts);
  }

  interact(_ctx = {}) {
    if (this.isLocked()) {
      Audio.sfx('error');
      return { kind: 'sign', data: { text: this.lockedText, entity: this, locked: true, keyId: this.keyId } };
    }
    if (!this.open) {
      this.open = true;
      this.openT = 0;
      this.solid = false;
      Audio.sfx(this.sfx);
    }
    if (!this.to) return { kind: 'sign', data: { text: 'The door will not budge.', entity: this } };
    return {
      kind: 'warp',
      data: {
        map: this.to.map || this.to.mapId, x: this.to.x, y: this.to.y,
        dir: this.to.dir || 'down', delay: this.openTime, transition: this.to.transition || 'fade',
        entity: this,
      },
    };
  }

  onTouch(ctx) { return this.solid ? null : this.interact(ctx); }

  serialize() { return { ...super.serialize(), cls: 'door', to: this.to, locked: this.locked }; }
}

/** An invisible pad that teleports whatever walks onto it (map edges, stairs). */
export class WarpEntity extends Entity {
  /** opts: { to:{ map, x, y, dir }, transition, sfx, requireFacing, prompt } */
  constructor(opts = {}) {
    super({ kind: 'warp', solid: false, hidden: opts.hidden !== false, ...opts });
    this.to = opts.to || opts.warp || { map: null, x: 0, y: 0, dir: 'down' };
    this.transition = opts.transition || 'fade';
    this.sfx = opts.sfx || null;
    this.requireFacing = opts.requireFacing || null;
    this.prompt = opts.prompt || null;
  }

  payload() {
    if (this.sfx) Audio.sfx(this.sfx);
    return {
      kind: 'warp',
      data: {
        map: this.to.map || this.to.mapId, x: this.to.x, y: this.to.y,
        dir: this.to.dir || 'down', transition: this.transition, entity: this,
      },
    };
  }

  onTouch(ctx = {}) {
    if (this.requireFacing && ctx.dir && ctx.dir !== this.requireFacing) return null;
    return this.payload();
  }

  interact() { return this.payload(); }

  serialize() { return { ...super.serialize(), cls: 'warp', to: this.to }; }
}

/** A signpost, gravestone or notice board — something to read. */
export class SignEntity extends Entity {
  /** opts: { text, title, pages:[...], sfx } */
  constructor(opts = {}) {
    super({ kind: 'sign', solid: opts.solid !== false, ...opts });
    this.text = opts.text || '';
    this.title = opts.title || null;
    this.pages = Array.isArray(opts.pages) ? opts.pages.slice() : null;
  }

  interact() {
    Audio.sfx('select');
    return {
      kind: 'sign',
      data: { text: this.text, title: this.title, pages: this.pages, entity: this },
    };
  }

  serialize() { return { ...super.serialize(), cls: 'sign', text: this.text, title: this.title }; }
}

/**
 * Scenery with a heartbeat: a cat on a fence, a campfire, a cart. Optionally
 * animated, optionally examinable, never in a hurry.
 */
export class PropEntity extends Entity {
  /**
   * opts: { frames:[names], fps=4, text, solid=false, tileId, bobbing }
   */
  constructor(opts = {}) {
    super({ kind: 'prop', solid: !!opts.solid, ...opts });
    this.frames = Array.isArray(opts.frames) && opts.frames.length ? opts.frames.slice() : null;
    this.fps = opts.fps || 4;
    this.text = opts.text || null;
    this.tileId = opts.tileId || 0;
  }

  frame() {
    if (this.frames) return this.frames[Math.floor(this.t * this.fps) % this.frames.length];
    return super.frame();
  }

  interact() {
    if (!this.text) return null;
    return { kind: 'sign', data: { text: this.text, entity: this } };
  }

  serialize() { return { ...super.serialize(), cls: 'prop', tileId: this.tileId }; }
}

// ===========================================================================
// THE MANAGER
// ===========================================================================

/**
 * Holds the entities of one map, keeps a tile -> entities index so "what am I
 * facing?" is O(1), updates everything and draws it in feet-y order.
 *
 * Construct it with the map and it adopts `map.entities`, so anything that reads
 * `map.entities` (the HUD minimap) keeps working unchanged.
 */
export class EntityList {
  constructor(map = null) {
    this.map = map || null;
    this.list = map ? map.entities : [];
    this.byTile = new Map();
    this.player = null;               // { x, y } — set by the overworld each step
    this.paused = false;
    if (map) { map.entityList = this; this.rebuild(); }
  }

  get length() { return this.list.length; }
  [Symbol.iterator]() { return this.list[Symbol.iterator](); }

  // --- membership ----------------------------------------------------------

  add(e) {
    if (!e || this.list.includes(e)) return e || null;
    this.list.push(e);
    e.list = this;
    e.map = this.map;
    this.index(e);
    return e;
  }

  addAll(arr) { for (const e of arr || []) this.add(e); return this; }

  remove(e) {
    const i = this.list.indexOf(e);
    if (i >= 0) this.list.splice(i, 1);
    this.unindex(e);
    if (e) { e.list = null; e.removed = true; }
    return e;
  }

  clear() { this.list.length = 0; this.byTile.clear(); return this; }

  rebuild() {
    this.byTile.clear();
    for (const e of this.list) { if (e) { e.list = this; e.map = this.map; this.index(e); } }
    return this;
  }

  // --- spatial index -------------------------------------------------------

  index(e) {
    if (!e) return;
    const k = `${e.x},${e.y}`;
    let a = this.byTile.get(k);
    if (!a) { a = []; this.byTile.set(k, a); }
    if (!a.includes(e)) a.push(e);
  }

  unindex(e, x = null, y = null) {
    if (!e) return;
    const k = `${x != null ? x : e.x},${y != null ? y : e.y}`;
    const a = this.byTile.get(k);
    if (!a) return;
    const i = a.indexOf(e);
    if (i >= 0) a.splice(i, 1);
    if (!a.length) this.byTile.delete(k);
  }

  /** Entities call this from step()/setTile() so the index never goes stale. */
  moved(e, oldX, oldY) {
    this.unindex(e, oldX, oldY);
    this.index(e);
  }

  /** Everything standing on a tile. */
  at(x, y) {
    const a = this.byTile.get(`${x},${y}`);
    if (!a || !a.length) return [];
    return a.filter((e) => e && !e.removed);
  }

  /** The first interesting (visible) entity on a tile. */
  first(x, y) {
    const a = this.at(x, y);
    for (const e of a) if (!e.hidden) return e;
    return a[0] || null;
  }

  solidAt(x, y, ignore = null) {
    for (const e of this.at(x, y)) if (e !== ignore && e.solid && !e.hidden) return e;
    return null;
  }

  /** What the player would talk to by pressing A on this tile. */
  interactableAt(x, y) {
    for (const e of this.at(x, y)) {
      if (e.hidden || e.removed) continue;
      if (typeof e.interact === 'function' && e.interact !== Entity.prototype.interact) return e;
    }
    return null;
  }

  /** What fires by standing here (warps, unlocked doors). */
  touchableAt(x, y) {
    for (const e of this.at(x, y)) {
      if (e.removed) continue;
      if (typeof e.onTouch === 'function' && e.onTouch !== Entity.prototype.onTouch) return e;
    }
    return null;
  }

  near(x, y, r) {
    const out = [];
    for (const e of this.list) {
      if (!e || e.removed) continue;
      if (Math.max(Math.abs(e.x - x), Math.abs(e.y - y)) <= r) out.push(e);
    }
    return out;
  }

  find(id) { return this.list.find((e) => e && (e.id === id || e.npcId === id)) || null; }
  ofKind(kind) { return this.list.filter((e) => e && e.kind === kind && !e.removed); }

  // --- frame ---------------------------------------------------------------

  /**
   * Update everything. `ctx` carries the shared per-frame facts entities need:
   * { player:{x,y}, dir, phase, paused }.
   */
  update(dt, ctx = {}) {
    if (this.paused || ctx.paused) return this;
    if (ctx.player) this.player = ctx.player;
    const map = this.map;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      if (!e) { this.list.splice(i, 1); continue; }
      if (e.removed) { this.list.splice(i, 1); this.unindex(e); continue; }
      try { e.update(dt, map, ctx); }
      catch (err) { console.error(`[entity] ${e.id} update failed`, err); }
    }
    return this;
  }

  /** Any monster that just walked into the party, if any. */
  pendingBattle() {
    for (const e of this.list) if (e && e.battleReady && !e.removed) return e;
    return null;
  }

  /**
   * Draw in feet-y order, culled to the camera.
   * `extra` lets the overworld inject the party sprites into the same sort, so
   * NPCs correctly pass in front of and behind the player.
   */
  draw(ctx, cam, opts = {}) {
    const cx = cam ? cam.x : 0, cy = cam ? cam.y : 0;
    const vw = opts.viewW || 400, vh = opts.viewH || 240;
    const pad = opts.pad != null ? opts.pad : 40;
    const draws = [];
    for (const e of this.list) {
      if (!e || e.removed || e.hidden) continue;
      const sx = e.px - cx, sy = e.py - cy;
      if (sx < -pad || sy < -pad || sx > vw + pad || sy > vh + pad) continue;
      draws.push(e);
    }
    if (opts.extra) for (const e of opts.extra) if (e) draws.push(e);
    draws.sort((a, b) => (a.z || a.py || 0) - (b.z || b.py || 0));
    for (const e of draws) {
      try { e.draw(ctx, cam, opts.drawOpts); }
      catch (err) { console.error(`[entity] ${e.id} draw failed`, err); }
    }
    return draws.length;
  }

  serialize() {
    return this.list.filter((e) => e && typeof e.serialize === 'function').map((e) => e.serialize());
  }
}

// ===========================================================================
// FACTORY
// ===========================================================================

const CLASSES = {
  entity: Entity, npc: NPCEntity, monster: MonsterEntity, chest: ChestEntity,
  door: DoorEntity, warp: WarpEntity, sign: SignEntity, prop: PropEntity,
};

/**
 * Build an entity from a plain definition — how maps.js and mapgen.js populate
 * a map, and how a save file rehydrates one.
 *   makeEntity({ cls:'npc', x:12, y:9, npcId:'toblen-stonehill', ... })
 */
export function makeEntity(def = {}, extra = {}) {
  const cls = CLASSES[def.cls || def.kind || 'entity'] || Entity;
  return new cls({ ...def, ...extra });
}

/** Turn a map's `npc-spawn` triggers into live NPCs. Safe on empty maps. */
export function spawnFromTriggers(map, lookup = null) {
  if (!map) return [];
  const made = [];
  for (const t of map.triggersOfKind('npc-spawn')) {
    const d = t.data || {};
    const base = lookup && d.npcId ? (lookup(d.npcId) || {}) : {};
    const e = makeEntity({
      cls: d.cls || 'npc', ...base, ...d,
      x: t.x, y: t.y, dir: d.dir || base.dir || 'down',
      home: { x: t.x, y: t.y },
    });
    map.addEntity(e);
    made.push(e);
  }
  return made;
}

/** A stable per-entity RNG, so a given goblin always wanders the same way. */
export function entityRng(mapId, x, y, salt = '') {
  return makeRNG(`${mapId}:${x},${y}:${salt}`);
}

export { rng as worldRng };
export default Entity;
