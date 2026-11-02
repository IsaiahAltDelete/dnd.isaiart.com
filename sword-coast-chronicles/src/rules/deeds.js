// rules/deeds.js — the single channel through which the world hears what the player did.
//
// Factions, companions, NPC memory, rumours and the world director all care
// about the same events — a bandit spared, a shrine robbed, a caravan saved, a
// hard bargain driven — and none of them should have to import the others or be
// called from a dozen places. So whoever SEES a deed reports it here once, and
// everyone who cares listens:
//
//   noteDeed(st, { kind: 'spare', target: 'bandit', faction: 'zhentarim', mapId, weight: 2 })
//   onDeed((deed, st) => { ... })          // returns an unsubscribe function
//   recentDeeds(st, { kind, faction, since, limit })
//
// A deed: { kind, target?, faction?, mapId?, npcId?, weight? (1-5, default 1),
//           tags?: string[], day, time, seq }
// Kinds in use (add freely; listeners ignore what they do not know):
//   kill spare flee crime theft murder help rescue charity gift bribe trade haggle
//   quest questFail betray join leave donate desecrate pray lie threaten persuade
//   free (freed a prisoner) found (founded a company) claim (took property)
//
// Deeds persist in st.world.deeds as a bounded ring (oldest dropped first), so a
// save remembers roughly the last few weeks of what the party has done.

import { applyReputationDeed } from './reputation.js';

const MAX_DEEDS = 400;
const listeners = new Set();

function ledger(st) {
  if (!st) return null;
  st.world ??= {};
  st.world.deeds ??= [];
  st.world.deedSeq ??= 0;
  return st.world;
}

/** Report something the party did. Returns the stored deed (or null with no state). */
export function noteDeed(st, deed) {
  const w = ledger(st);
  if (!w || !deed || !deed.kind) return null;
  const d = {
    kind: String(deed.kind),
    weight: Math.max(1, Math.min(5, deed.weight | 0 || 1)),
    day: st.day | 0, time: st.time | 0, seq: ++w.deedSeq,
  };
  for (const k of ['target', 'faction', 'mapId', 'region', 'npcId', 'itemId', 'questId']) if (deed[k] != null) d[k] = deed[k];
  if (Array.isArray(deed.tags) && deed.tags.length) d.tags = deed.tags.slice(0, 8);
  w.deeds.push(d);
  if (w.deeds.length > MAX_DEEDS) w.deeds.splice(0, w.deeds.length - MAX_DEEDS);
  applyReputationDeed(st, d);
  for (const fn of listeners) {
    try { fn(d, st); } catch (e) { try { console.error('[deeds] a listener threw', e); } catch (e2) { /* ignore */ } }
  }
  return d;
}

/** Listen for deeds as they happen. Returns an unsubscribe function. */
export function onDeed(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Deeds matching a filter, newest first. `since` is an in-game day number. */
export function recentDeeds(st, { kind = null, faction = null, target = null, since = null, limit = 50 } = {}) {
  const w = st && st.world;
  if (!w || !w.deeds) return [];
  const out = [];
  for (let i = w.deeds.length - 1; i >= 0 && out.length < limit; i--) {
    const d = w.deeds[i];
    if (kind && (Array.isArray(kind) ? !kind.includes(d.kind) : d.kind !== kind)) continue;
    if (faction && d.faction !== faction) continue;
    if (target && d.target !== target) continue;
    if (since != null && d.day < since) break;
    out.push(d);
  }
  return out;
}
