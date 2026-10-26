// core/rng.js — deterministic seeded random number generation. Nothing in the game
// may call Math.random() directly; every roll, map and loot table flows through here
// so a seed reproduces a whole campaign exactly.

/** FNV-1a string hash -> uint32. Used to turn seed strings into numbers. */
export function hashStr(s) {
  let h = 0x811c9dc5;
  const str = String(s);
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — small, fast, good enough statistically for a game. */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Create an RNG. `seed` may be a number or a string.
 * The returned object is stateful; `fork()` makes an independent stream so that
 * (say) map decoration never disturbs the loot sequence.
 */
export function makeRNG(seed) {
  const numeric = typeof seed === 'number' ? (seed >>> 0) : hashStr(seed == null ? 'sword-coast' : seed);
  let state = numeric || 1;
  let next = mulberry32(state);
  let calls = 0;
  let spare = null; // cached gaussian

  const api = {
    seed: numeric,

    /** float in [0,1) */
    next() { calls++; return next(); },

    /** integer in [a,b] inclusive. int(n) -> [0,n]. */
    int(a, b) {
      if (b === undefined) { b = a; a = 0; }
      if (b < a) { const t = a; a = b; b = t; }
      return a + Math.floor(api.next() * (b - a + 1));
    },

    /** float in [a,b) */
    float(a = 0, b = 1) { return a + api.next() * (b - a); },

    /** true with probability p (0..1) */
    chance(p) { return api.next() < p; },

    /** -1 or 1 */
    sign() { return api.next() < 0.5 ? -1 : 1; },

    /** a random element (undefined for empty arrays) */
    pick(arr) { return arr && arr.length ? arr[api.int(0, arr.length - 1)] : undefined; },

    /** n distinct random elements (fewer if the array is short) */
    pickN(arr, n) { return api.shuffle(arr).slice(0, Math.max(0, Math.min(n, arr.length))); },

    /**
     * Weighted pick. `wfn` maps an element to a non-negative weight; if omitted,
     * elements are expected to be [value, weight] pairs or objects with `.weight`.
     */
    pickWeighted(arr, wfn) {
      if (!arr || !arr.length) return undefined;
      const w = wfn || ((e) => (Array.isArray(e) ? e[1] : (e && e.weight) || 1));
      let total = 0;
      for (const e of arr) total += Math.max(0, w(e));
      if (total <= 0) return api.pick(arr);
      let r = api.next() * total;
      for (const e of arr) {
        r -= Math.max(0, w(e));
        if (r <= 0) return e;
      }
      return arr[arr.length - 1];
    },

    /** Fisher–Yates into a NEW array; never mutates the input. */
    shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = api.int(0, i);
        const t = a[i]; a[i] = a[j]; a[j] = t;
      }
      return a;
    },

    /** Box–Muller normal deviate. Handy for stat jitter and organic map noise. */
    gauss(mean = 0, sd = 1) {
      if (spare !== null) { const v = spare; spare = null; return mean + sd * v; }
      let u, v, s;
      do { u = api.next() * 2 - 1; v = api.next() * 2 - 1; s = u * u + v * v; }
      while (s >= 1 || s === 0);
      const mul = Math.sqrt(-2 * Math.log(s) / s);
      spare = v * mul;
      return mean + sd * (u * mul);
    },

    /** Random angle in radians, and a unit vector along it. */
    angle() { return api.next() * Math.PI * 2; },
    unit() { const a = api.angle(); return { x: Math.cos(a), y: Math.sin(a) }; },

    /** Random point inside a circle (uniform by area). */
    inCircle(radius = 1) {
      const a = api.angle(), r = Math.sqrt(api.next()) * radius;
      return { x: Math.cos(a) * r, y: Math.sin(a) * r };
    },

    /**
     * A new, independent RNG derived from this one's seed plus a salt.
     * Deterministic: the same (seed, salt) always yields the same stream.
     */
    fork(salt = '') { return makeRNG((numeric ^ hashStr(String(salt))) >>> 0); },

    /** Snapshot/restore so a scene can rewind a preview roll. */
    save() { return { state, calls }; },
    restore(snap) { state = snap.state; calls = snap.calls; next = mulberry32(state); for (let i = 0; i < calls; i++) next(); },

    /** How many numbers have been drawn — used by the save file to resume a stream. */
    get calls() { return calls; },
    advance(n) { for (let i = 0; i < n; i++) api.next(); },
  };
  return api;
}

/** The global stream. Reseeded when a new campaign begins. */
export let rng = makeRNG('sword-coast');

/** Point the global stream at a new seed (returns the numeric seed used). */
export function reseed(seed) {
  rng = makeRNG(seed);
  return rng.seed;
}

/** A stable RNG for a fixed thing (a map's decoration, a chest's contents). */
export function rngFor(...parts) {
  return makeRNG(parts.join(':'));
}
