// core/events.js — a tiny synchronous event bus. Combat, quests and the HUD talk
// to each other through this so the modules stay decoupled.

const handlers = new Map();

export const bus = {
  /** Subscribe. Returns an unsubscribe function. */
  on(evt, fn) {
    if (!handlers.has(evt)) handlers.set(evt, new Set());
    handlers.get(evt).add(fn);
    return () => bus.off(evt, fn);
  },

  once(evt, fn) {
    const off = bus.on(evt, (...a) => { off(); fn(...a); });
    return off;
  },

  off(evt, fn) {
    const set = handlers.get(evt);
    if (set) { set.delete(fn); if (!set.size) handlers.delete(evt); }
  },

  /** Fire an event. Handler errors are logged, never thrown at the caller. */
  emit(evt, payload) {
    const set = handlers.get(evt);
    if (set) {
      // Copy so handlers may unsubscribe during dispatch.
      for (const fn of Array.from(set)) {
        try { fn(payload, evt); } catch (e) { console.error(`[bus] ${evt} handler failed`, e); }
      }
    }
    const any = handlers.get('*');
    if (any) for (const fn of Array.from(any)) { try { fn(payload, evt); } catch (e) { console.error(e); } }
  },

  clear(evt) { if (evt) handlers.delete(evt); else handlers.clear(); },
  count(evt) { return handlers.get(evt)?.size || 0; },
};

/**
 * Canonical event names. Using these constants keeps typos out of the wiring.
 */
export const EV = {
  // world
  MAP_ENTER: 'map:enter', MAP_EXIT: 'map:exit', STEP: 'world:step',
  INTERACT: 'world:interact', WARP: 'world:warp', CHEST: 'world:chest',
  DAY_CHANGE: 'world:day', TIME_CHANGE: 'world:time',
  // party
  PARTY_CHANGE: 'party:change', GOLD_CHANGE: 'party:gold', ITEM_GAIN: 'party:item-gain',
  ITEM_LOSE: 'party:item-lose', LEVEL_UP: 'party:level-up', XP_GAIN: 'party:xp',
  MEMBER_JOIN: 'party:join', MEMBER_LEAVE: 'party:leave',
  // combat
  COMBAT_START: 'combat:start', COMBAT_END: 'combat:end',
  TURN_START: 'combat:turn-start', TURN_END: 'combat:turn-end', ROUND: 'combat:round',
  ATTACK: 'combat:attack', DAMAGE: 'combat:damage', HEAL: 'combat:heal',
  DEATH: 'combat:death', DOWNED: 'combat:downed', CONDITION: 'combat:condition',
  SPELL_CAST: 'combat:spell', CRIT: 'combat:crit', MISS: 'combat:miss',
  CONCENTRATION_BREAK: 'combat:conc-break', SAVE: 'combat:save',
  // quests
  QUEST_START: 'quest:start', QUEST_STEP: 'quest:step', QUEST_DONE: 'quest:done',
  QUEST_FAIL: 'quest:fail', FLAG_SET: 'flag:set', KILL: 'stat:kill',
  // ui / system
  LOG: 'ui:log', TOAST: 'ui:toast', SAVE: 'sys:save', LOAD: 'sys:load',
  SHOP_OPEN: 'ui:shop', DIALOGUE_OPEN: 'ui:dialogue', REST: 'sys:rest',
};

/** Convenience: push a line to the message log. */
export function log(text, kind = '') { bus.emit(EV.LOG, { text, kind }); }

/** Convenience: transient corner notification. */
export function toast(text, opts = {}) { bus.emit(EV.TOAST, { text, ...opts }); }
