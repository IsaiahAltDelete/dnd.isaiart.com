// data/monsters.js — the merged bestiary and its query helpers.
// Raw stat blocks live in monsters_low.js (CR 0–4) and monsters_high.js (CR 5–24 + named bosses).

import { MONSTERS_LOW, MONSTER_GROUPS_LOW } from './monsters_low.js';
import { MONSTERS_HIGH, BOSSES, MONSTER_GROUPS_HIGH } from './monsters_high.js';

/** Every creature in the game, keyed by id. Bosses are included. */
export const MONSTERS = Object.freeze({ ...MONSTERS_LOW, ...MONSTERS_HIGH, ...BOSSES });
export const MONSTER_IDS = Object.freeze(Object.keys(MONSTERS));
export const MONSTER_GROUPS = Object.freeze({ ...MONSTER_GROUPS_LOW, ...MONSTER_GROUPS_HIGH });
export { BOSSES };

/** Experience awarded per Challenge Rating (DMG table). */
export const CR_XP = Object.freeze({
  0: 10, 0.125: 25, 0.25: 50, 0.5: 100,
  1: 200, 2: 450, 3: 700, 4: 1100, 5: 1800, 6: 2300, 7: 2900, 8: 3900,
  9: 5000, 10: 5900, 11: 7200, 12: 8400, 13: 10000, 14: 11500, 15: 13000,
  16: 15000, 17: 18000, 18: 20000, 19: 22000, 20: 25000, 21: 33000,
  22: 41000, 23: 50000, 24: 62000, 25: 75000, 26: 90000, 27: 105000,
  28: 120000, 29: 135000, 30: 155000,
});

/** Proficiency bonus by CR — needed when scaling a stat block. */
export function profForCR(cr) {
  if (cr <= 4) return 2;
  return 2 + Math.floor((Math.min(cr, 30) - 1) / 4);
}

export const CREATURE_TYPES = Object.freeze([
  'aberration', 'beast', 'celestial', 'construct', 'dragon', 'elemental', 'fey',
  'fiend', 'giant', 'humanoid', 'monstrosity', 'ooze', 'plant', 'undead',
]);

// --- indexes ---------------------------------------------------------------

const byBiome = {};
const byType = {};
const byCR = [];
for (const id of MONSTER_IDS) {
  const m = MONSTERS[id];
  for (const b of m.biomes || []) (byBiome[b] ||= []).push(id);
  (byType[m.type] ||= []).push(id);
  byCR.push({ id, cr: m.cr ?? 0 });
}
byCR.sort((a, b) => a.cr - b.cr);

export function getMonster(id) { return MONSTERS[id] || null; }
export function monsterName(id) { return MONSTERS[id]?.name || id; }

/** Creatures that live in a biome, optionally filtered by CR range. */
export function monstersByBiome(biome, minCR = 0, maxCR = 30, { includeBosses = false } = {}) {
  return (byBiome[biome] || []).filter((id) => {
    const m = MONSTERS[id];
    if (!includeBosses && m.boss) return false;
    return (m.cr ?? 0) >= minCR && (m.cr ?? 0) <= maxCR;
  });
}

export function monstersByCR(minCR, maxCR, { includeBosses = false } = {}) {
  return byCR.filter((e) => e.cr >= minCR && e.cr <= maxCR && (includeBosses || !MONSTERS[e.id].boss)).map((e) => e.id);
}

export function monstersByType(type) { return (byType[type] || []).slice(); }

/**
 * Named bosses in a CR band. With a `biome`, bosses that list that biome are
 * preferred; when none do, every boss in the band is returned so a milestone
 * floor is never headless.
 */
export function bossesForTier(minCR, maxCR, biome = null) {
  const all = Object.keys(BOSSES).filter((id) => {
    const cr = BOSSES[id].cr ?? 0;
    return cr >= minCR && cr <= maxCR;
  });
  if (!biome) return all;
  const local = all.filter((id) => (BOSSES[id].biomes || []).includes(biome));
  return local.length ? local : all;
}

/**
 * Encounter groups appropriate to a biome and CR band. With a party `level`,
 * packs outside their authored minLevel..maxLevel window are dropped, falling
 * back to the biome-only list when that leaves nothing (a level-20 party on the
 * Triboar Trail still meets *something* rather than an empty road).
 */
export function groupsForBiome(biome, maxCR = 30, level = null) {
  const base = Object.keys(MONSTER_GROUPS).filter((k) => {
    const g = MONSTER_GROUPS[k];
    return (!g.biomes || g.biomes.includes(biome)) && (g.cr ?? 0) <= maxCR;
  });
  if (level == null || !Number.isFinite(level)) return base;
  const fit = base.filter((k) => {
    const g = MONSTER_GROUPS[k];
    return level >= (g.minLevel ?? 1) && level <= (g.maxLevel ?? 20);
  });
  return fit.length ? fit : base;
}

export function xpForCR(cr) {
  if (CR_XP[cr] != null) return CR_XP[cr];
  // Interpolate for scaled/odd CRs.
  const keys = Object.keys(CR_XP).map(Number).sort((a, b) => a - b);
  let lo = keys[0], hi = keys[keys.length - 1];
  for (const k of keys) { if (k <= cr) lo = k; if (k >= cr) { hi = k; break; } }
  if (lo === hi) return CR_XP[lo];
  const t = (cr - lo) / (hi - lo);
  return Math.round(CR_XP[lo] + (CR_XP[hi] - CR_XP[lo]) * t);
}

export function xpOf(id) {
  const m = MONSTERS[id];
  if (!m) return 0;
  return m.xp != null ? m.xp : xpForCR(m.cr ?? 0);
}

/** "Medium humanoid (goblinoid), CR 1/4" for the bestiary UI. */
export function statLine(m) {
  const cr = m.cr === 0.125 ? '1/8' : m.cr === 0.25 ? '1/4' : m.cr === 0.5 ? '1/2' : m.cr;
  const size = m.size ? m.size[0].toUpperCase() + m.size.slice(1) : 'Medium';
  return `${size} ${m.type}${m.subtype ? ` (${m.subtype})` : ''} · CR ${cr}`;
}

export function monsterCount() { return MONSTER_IDS.length; }
