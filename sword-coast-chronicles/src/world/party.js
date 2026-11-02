// world/party.js — the adventuring party: up to four active members, a reserve
// bench of hirelings, and the shared purse and pack.

import { PARTY_MAX, RESERVE_MAX } from '../constants.js';
import { bus, EV } from '../core/events.js';
import { resolveItem, isMagic } from '../data/items.js';

let nextUid = 1;
function uid() { return `i${(nextUid++).toString(36)}${Date.now().toString(36).slice(-3)}`; }

export const Party = {
  members: [],      // Character[] — the four who walk the world
  reserve: [],      // Character[] — benched companions waiting at the inn
  gold: 0,
  inventory: [],    // [{ uid, id, qty }] — one shared pack, as in a tabletop game
  trail: [],        // leader position history, so followers snake behind
  formation: 'line',
  autoBattle: {},   // uid -> bool: let the AI run this companion in combat

  get leader() { return this.members[0] || null; },
  get size() { return this.members.length; },

  // --- roster -------------------------------------------------------------

  add(ch) {
    if (!ch) return false;
    if (this.members.length < PARTY_MAX) {
      this.members.push(ch);
      bus.emit(EV.MEMBER_JOIN, { ch });
      bus.emit(EV.PARTY_CHANGE, { members: this.members });
      return true;
    }
    if (this.reserve.length < RESERVE_MAX) {
      this.reserve.push(ch);
      bus.emit(EV.MEMBER_JOIN, { ch, benched: true });
      return true;
    }
    return false;
  },

  remove(uidOrCh) {
    const id = typeof uidOrCh === 'string' ? uidOrCh : uidOrCh?.uid;
    let i = this.members.findIndex((m) => m.uid === id);
    if (i >= 0 && this.members.length > 1) {
      const [ch] = this.members.splice(i, 1);
      bus.emit(EV.MEMBER_LEAVE, { ch });
      bus.emit(EV.PARTY_CHANGE, { members: this.members });
      return ch;
    }
    i = this.reserve.findIndex((m) => m.uid === id);
    if (i >= 0) return this.reserve.splice(i, 1)[0];
    return null;
  },

  /** Move a member between the active party and the bench. */
  bench(uidStr) {
    const i = this.members.findIndex((m) => m.uid === uidStr);
    if (i <= 0) return false;                    // never bench the player character
    if (this.reserve.length >= RESERVE_MAX) return false;
    this.reserve.push(this.members.splice(i, 1)[0]);
    bus.emit(EV.PARTY_CHANGE, { members: this.members });
    return true;
  },

  activate(uidStr) {
    if (this.members.length >= PARTY_MAX) return false;
    const i = this.reserve.findIndex((m) => m.uid === uidStr);
    if (i < 0) return false;
    this.members.push(this.reserve.splice(i, 1)[0]);
    bus.emit(EV.PARTY_CHANGE, { members: this.members });
    return true;
  },

  /** Reorder the marching line (index 0 is the sprite the player controls). */
  swap(a, b) {
    if (a < 0 || b < 0 || a >= this.members.length || b >= this.members.length) return false;
    const t = this.members[a]; this.members[a] = this.members[b]; this.members[b] = t;
    bus.emit(EV.PARTY_CHANGE, { members: this.members });
    return true;
  },

  find(uidStr) {
    return this.members.find((m) => m.uid === uidStr) || this.reserve.find((m) => m.uid === uidStr) || null;
  },

  all() { return this.members.concat(this.reserve); },

  // --- status -------------------------------------------------------------

  alive() { return this.members.filter((m) => m.hp > 0); },
  aliveCount() { return this.alive().length; },
  downed() { return this.members.filter((m) => m.hp <= 0 && !m.dead); },
  wiped() { return this.members.every((m) => m.hp <= 0); },

  levelAvg() {
    if (!this.members.length) return 1;
    const t = this.members.reduce((a, m) => a + (m.level || 1), 0);
    return Math.max(1, Math.round(t / this.members.length));
  },

  /** Highest level in the party — used to gate content and shop stock. */
  levelMax() { return this.members.reduce((a, m) => Math.max(a, m.level || 1), 1); },

  hpPct() {
    let cur = 0, max = 0;
    for (const m of this.members) { cur += Math.max(0, m.hp || 0); max += m.maxHp || 1; }
    return max ? cur / max : 0;
  },

  // --- purse --------------------------------------------------------------

  addGold(n) {
    this.gold = Math.max(0, Math.round(this.gold + n));
    bus.emit(EV.GOLD_CHANGE, { gold: this.gold, delta: n });
    return this.gold;
  },

  spendGold(n) {
    if (this.gold < n) return false;
    this.addGold(-n);
    return true;
  },

  canAfford(n) { return this.gold >= n; },

  // --- shared pack --------------------------------------------------------

  /**
   * A magic item pulled out of a chest is a mystery until somebody names it.
   *
   * `unidentified` was read in two places and written in none, so every wand
   * and ring in the game arrived pre-appraised and Identify had nothing to do.
   * The rule: anything above common rarity that carries an enchantment comes
   * out of LOOT unnamed. Bought stock, conjured food, quest handouts and a
   * companion's own kit are named already — the shop showed you the label and
   * the spell made the thing, so pass `{ identified: true }` for those.
   */
  _isMystery(item, id) {
    if (!item || !item.rarity || item.rarity === 'common') return false;
    let magic = false;
    try { magic = !!isMagic(id); } catch (e) { magic = false; }
    return magic || !!item.magic || !!item.mech;
  },

  addItem(id, qty = 1, opts = null) {
    const item = resolveItem(id);
    if (!item) return null;
    const o = opts && typeof opts === 'object' ? opts : null;
    const mystery = o && o.identified === false ? true
      : o && (o.identified === true || o.source === 'shop') ? false
        : (o && o.source === 'loot') || !o ? this._isMystery(item, id) : false;

    // Stackables merge; anything with per-instance state gets its own entry.
    // A mystery never merges: it has a state of its own to keep.
    if (item.stack !== false && !opts && !mystery) {
      const e = this.inventory.find((x) => x.id === id && !x.opts && !x.unidentified);
      if (e) {
        e.qty += qty;
        bus.emit(EV.ITEM_GAIN, { id, qty });
        return e;
      }
    }
    const entry = { uid: uid(), id, qty, ...(opts ? { opts } : {}) };
    if (mystery) entry.unidentified = true;
    else entry.identified = true;
    this.inventory.push(entry);
    bus.emit(EV.ITEM_GAIN, { id, qty, unidentified: !!entry.unidentified });
    return entry;
  },

  /**
   * Hand a character's personal purse and pack over to the company.
   *
   * Character creation rolls the starting kit and starting gold onto the
   * CHARACTER (`ch.gold`, `ch.inventory`), but every consumer in the game — the
   * HUD purse, the inventory screen, both shop tills, the inn's room charge —
   * reads the shared `Party.gold` / `Party.inventory`. Whoever starts or joins a
   * campaign therefore has to tip their kit into the shared pack, or the player
   * lands in Phandalin with 0 gp and "The pack is empty here."
   *
   * Worn equipment is left alone; only the pack and the purse move.
   * Returns { gold, items } for a caller that wants to report it.
   */
  absorbKit(ch) {
    const out = { gold: 0, items: 0 };
    if (!ch) return out;
    const pack = Array.isArray(ch.inventory) ? ch.inventory.slice() : [];
    for (const e of pack) {
      if (!e || !e.id) continue;
      const qty = Math.max(1, Number(e.qty) || 1);
      // Anything beyond uid/id/qty is per-instance state (charges, an enchant)
      // and has to ride along or the item silently loses it.
      const { uid: _uid, id, qty: _qty, ...rest } = e;
      const carry = Object.keys(rest).length ? rest : null;
      // A companion's own kit is not loot: they know what they are carrying.
      if (this.addItem(id, qty, carry || { identified: true })) out.items += qty;
    }
    if (Array.isArray(ch.inventory)) ch.inventory.length = 0;
    const gold = Math.max(0, Math.round(Number(ch.gold) || 0));
    if (gold) { this.addGold(gold); out.gold = gold; }
    ch.gold = 0;
    return out;
  },

  removeItem(id, qty = 1) {
    let left = qty;
    for (let i = this.inventory.length - 1; i >= 0 && left > 0; i--) {
      const e = this.inventory[i];
      if (e.id !== id) continue;
      const take = Math.min(e.qty, left);
      e.qty -= take; left -= take;
      if (e.qty <= 0) this.inventory.splice(i, 1);
    }
    if (left < qty) bus.emit(EV.ITEM_LOSE, { id, qty: qty - left });
    return left === 0;
  },

  removeByUid(uidStr, qty = 1) {
    const i = this.inventory.findIndex((e) => e.uid === uidStr);
    if (i < 0) return false;
    const e = this.inventory[i];
    e.qty -= qty;
    if (e.qty <= 0) this.inventory.splice(i, 1);
    bus.emit(EV.ITEM_LOSE, { id: e.id, qty });
    return true;
  },

  countItem(id) { return this.inventory.reduce((a, e) => a + (e.id === id ? e.qty : 0), 0); },
  hasItem(id, qty = 1) { return this.countItem(id) >= qty; },

  /** Everything in the pack of a given kind, for the "use item" combat menu. */
  itemsOfKind(kind) {
    return this.inventory.filter((e) => resolveItem(e.id)?.kind === kind);
  },

  /** Consumables usable in combat, sorted by usefulness. */
  usableInCombat() {
    return this.inventory.filter((e) => {
      const it = resolveItem(e.id);
      return it && (it.kind === 'potion' || it.kind === 'scroll' || (it.use && it.use.combat !== false));
    });
  },

  // --- rest ---------------------------------------------------------------

  /** Wired up by main.js to the real rules functions (avoids a circular import). */
  _rest: { short: null, long: null },

  shortRest(spend = {}) {
    const logs = [];
    for (const m of this.members) if (this._rest.short) logs.push(...(this._rest.short(m, spend[m.uid] || 0) || []));
    bus.emit(EV.REST, { kind: 'short' });
    return logs;
  },

  longRest() {
    const logs = [];
    for (const m of this.all()) if (this._rest.long) logs.push(...(this._rest.long(m) || []));
    bus.emit(EV.REST, { kind: 'long' });
    bus.emit(EV.PARTY_CHANGE, { members: this.members });
    return logs;
  },

  healAll() {
    for (const m of this.members) { m.hp = m.maxHp; m.deathSaves = { success: 0, fail: 0, stable: false }; m.dead = false; }
    bus.emit(EV.PARTY_CHANGE, { members: this.members });
  },

  // --- movement trail -----------------------------------------------------

  /**
   * Record where the leader has been so followers can retrace the path.
   * Each entry is {x, y, dir} in tile coordinates.
   */
  pushTrail(x, y, dir) {
    this.trail.unshift({ x, y, dir });
    const need = PARTY_MAX * 2 + 4;
    if (this.trail.length > need) this.trail.length = need;
  },

  /** Where follower `index` (1..3) should stand and face. */
  trailFor(index) {
    return this.trail[Math.min(index * 2 - 1, this.trail.length - 1)] || null;
  },

  resetTrail(x, y, dir) {
    this.trail = [];
    for (let i = 0; i < PARTY_MAX * 2 + 4; i++) this.trail.push({ x, y, dir });
  },

  // --- persistence --------------------------------------------------------

  serialize(serializeChar) {
    return {
      members: this.members.map(serializeChar),
      reserve: this.reserve.map(serializeChar),
      gold: this.gold,
      inventory: this.inventory.map((e) => ({ ...e })),
      formation: this.formation,
      autoBattle: { ...this.autoBattle },
    };
  },

  load(obj, deserializeChar) {
    this.members = (obj?.members || []).map(deserializeChar);
    this.reserve = (obj?.reserve || []).map(deserializeChar);
    this.gold = obj?.gold || 0;
    this.inventory = (obj?.inventory || []).map((e) => ({ ...e }));
    this.formation = obj?.formation || 'line';
    this.autoBattle = { ...(obj?.autoBattle || {}) };
    bus.emit(EV.PARTY_CHANGE, { members: this.members });
  },

  clear() {
    this.members = []; this.reserve = []; this.gold = 0;
    this.inventory = []; this.trail = []; this.autoBattle = {};
  },
};
