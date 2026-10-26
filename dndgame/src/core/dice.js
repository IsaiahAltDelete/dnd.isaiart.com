// core/dice.js — the dice engine. Every attack, save, check and damage roll in the
// game resolves through these functions so the combat log can always show real dice.

import { rng } from './rng.js';

/**
 * Parse a dice expression.
 *   "2d6+3"    -> { n:2, sides:6, mod:3 }
 *   "4d6kh3"   -> keep highest 3
 *   "2d20kl1"  -> keep lowest 1 (disadvantage, expressed as dice)
 *   "1d8"      -> { n:1, sides:8, mod:0 }
 *   "7"        -> flat 7 (n:0)
 * Returns null for anything unparseable so callers can fail soft.
 */
export function parseDice(expr) {
  if (typeof expr === 'number') return { n: 0, sides: 0, mod: expr, keep: null, raw: String(expr) };
  if (!expr) return null;
  const s = String(expr).trim().toLowerCase().replace(/\s+/g, '');

  // Flat number
  if (/^[+-]?\d+$/.test(s)) return { n: 0, sides: 0, mod: parseInt(s, 10), keep: null, raw: s };

  const m = s.match(/^(\d*)d(\d+)(k[hl]\d+)?([+-]\d+)?$/);
  if (!m) return null;
  const n = m[1] === '' ? 1 : parseInt(m[1], 10);
  const sides = parseInt(m[2], 10);
  let keep = null;
  if (m[3]) keep = { mode: m[3][1] === 'h' ? 'high' : 'low', count: parseInt(m[3].slice(2), 10) };
  const mod = m[4] ? parseInt(m[4], 10) : 0;
  return { n, sides, mod, keep, raw: s };
}

/** Roll n dice of the given size. Returns { total, rolls }. */
export function roll(n, sides, r = rng) {
  const rolls = [];
  let total = 0;
  for (let i = 0; i < n; i++) {
    const v = r.int(1, sides);
    rolls.push(v);
    total += v;
  }
  return { total, rolls };
}

/**
 * Roll a dice expression.
 * Returns { total, rolls, kept, dropped, mod, expr }.
 * `total` already includes the modifier and never drops below 0 for damage callers
 * (use `raw` if you need the signed value).
 */
export function rollExpr(expr, r = rng) {
  const p = parseDice(expr);
  if (!p) return { total: 0, rolls: [], kept: [], dropped: [], mod: 0, expr: String(expr), raw: 0, ok: false };

  let rolls = [];
  if (p.n > 0 && p.sides > 0) rolls = roll(p.n, p.sides, r).rolls;

  let kept = rolls, dropped = [];
  if (p.keep && rolls.length > p.keep.count) {
    const idx = rolls.map((v, i) => i).sort((a, b) => (p.keep.mode === 'high' ? rolls[b] - rolls[a] : rolls[a] - rolls[b]));
    const keepIdx = new Set(idx.slice(0, p.keep.count));
    kept = rolls.filter((_, i) => keepIdx.has(i));
    dropped = rolls.filter((_, i) => !keepIdx.has(i));
  }

  const sum = kept.reduce((a, b) => a + b, 0);
  const raw = sum + p.mod;
  return { total: raw, raw, rolls, kept, dropped, mod: p.mod, sides: p.sides, count: p.n, expr: p.raw, ok: true };
}

/**
 * The d20 test — the heart of 5e.
 * opts: { adv, dis, critRange=20, bonusDice:'1d4', luck, fixed }
 * Advantage and disadvantage cancel exactly (2024 PHB), and multiple sources of
 * each do not stack.
 */
export function d20(mod = 0, opts = {}, r = rng) {
  const adv = !!opts.adv && !opts.dis;
  const dis = !!opts.dis && !opts.adv;
  const critRange = opts.critRange || 20;

  const rolls = [];
  if (typeof opts.fixed === 'number') {
    rolls.push(opts.fixed);
  } else {
    rolls.push(r.int(1, 20));
    if (adv || dis) rolls.push(r.int(1, 20));
  }

  const natural = adv ? Math.max(...rolls) : dis ? Math.min(...rolls) : rolls[0];

  // Bless / Guidance / Bardic Inspiration style floating dice.
  let bonus = 0;
  const bonusRolls = [];
  if (opts.bonusDice) {
    const list = Array.isArray(opts.bonusDice) ? opts.bonusDice : [opts.bonusDice];
    for (const b of list) {
      const br = rollExpr(b, r);
      bonus += br.total;
      bonusRolls.push({ expr: b, total: br.total, rolls: br.rolls });
    }
  }

  const total = natural + mod + bonus;
  return {
    total, natural, rolls, mod, bonus, bonusRolls,
    crit: natural >= critRange,
    fumble: natural === 1,
    adv, dis,
    /** "d20 [17] +5 = 22" for the combat log */
    text: `d20${rolls.length > 1 ? ` [${rolls.join('/')}]` : ` [${natural}]`}${mod ? (mod > 0 ? ` +${mod}` : ` ${mod}`) : ''}${bonus ? ` +${bonus}` : ''} = ${total}`,
  };
}

/** Roll a d20 test against a DC. Returns the roll plus `success` and `margin`. */
export function check(mod, dc, opts = {}, r = rng) {
  const res = d20(mod, opts, r);
  res.dc = dc;
  res.success = res.total >= dc;
  res.margin = res.total - dc;
  return res;
}

/**
 * Damage roll. In 5e a critical hit doubles the number of DICE, not the modifier.
 * `bonusDice` is a list of {dice, type} riders (Sneak Attack, Divine Smite, a
 * Flame Tongue's 2d6 fire) which are also doubled on a crit.
 */
export function rollDamage({ dice, mod = 0, type = 'bludgeoning', crit = false, bonusDice = [], min = 0 }, r = rng) {
  const parts = [];
  const base = parseDice(dice) || { n: 0, sides: 0, mod: 0 };
  const rollCount = crit ? base.n * 2 : base.n;
  const main = rollCount > 0 ? roll(rollCount, base.sides, r) : { total: 0, rolls: [] };
  let total = main.total + base.mod + mod;
  parts.push({ type, dice, rolls: main.rolls, mod: base.mod + mod, total: main.total + base.mod + mod, crit });

  const byType = { [type]: main.total + base.mod + mod };

  for (const b of bonusDice) {
    const bp = parseDice(b.dice);
    if (!bp) continue;
    const bn = crit && b.crits !== false ? bp.n * 2 : bp.n;
    const br = bn > 0 ? roll(bn, bp.sides, r) : { total: 0, rolls: [] };
    const sub = br.total + bp.mod + (b.mod || 0);
    total += sub;
    parts.push({ type: b.type || type, dice: b.dice, rolls: br.rolls, mod: bp.mod + (b.mod || 0), total: sub, crit });
    byType[b.type || type] = (byType[b.type || type] || 0) + sub;
  }

  total = Math.max(min, total);
  return { total, parts, byType, crit, type };
}

/** Average of a dice expression (used for AI heuristics and item tooltips). */
export function avgExpr(expr) {
  const p = parseDice(expr);
  if (!p) return 0;
  if (p.keep) {
    // Approximate: keeping the highest k of n biases upward. Good enough for AI.
    const per = (p.sides + 1) / 2;
    const bias = p.keep.mode === 'high' ? (p.sides - per) * (1 - p.keep.count / p.n) * 0.5 : -(per - 1) * (1 - p.keep.count / p.n) * 0.5;
    return p.keep.count * (per + bias) + p.mod;
  }
  return p.n * (p.sides + 1) / 2 + p.mod;
}

/** Maximum of a dice expression. */
export function maxExpr(expr) {
  const p = parseDice(expr);
  if (!p) return 0;
  const n = p.keep ? p.keep.count : p.n;
  return n * p.sides + p.mod;
}

/** Minimum of a dice expression. */
export function minExpr(expr) {
  const p = parseDice(expr);
  if (!p) return 0;
  const n = p.keep ? p.keep.count : p.n;
  return n * 1 + p.mod;
}

/** Add a flat modifier onto a dice expression string: addMod('1d8', 3) -> '1d8+3'. */
export function addMod(expr, m) {
  const p = parseDice(expr);
  if (!p) return expr;
  const total = p.mod + m;
  if (p.n === 0) return String(total);
  return `${p.n}d${p.sides}${total ? (total > 0 ? `+${total}` : total) : ''}`;
}

/** Scale a dice expression by extra dice: scaleDice('1d10', 3) -> '4d10'. */
export function scaleDice(expr, extraDice) {
  const p = parseDice(expr);
  if (!p || p.n === 0) return expr;
  const n = p.n + extraDice;
  return `${n}d${p.sides}${p.mod ? (p.mod > 0 ? `+${p.mod}` : p.mod) : ''}`;
}

/** Roll 4d6 drop lowest — the classic ability score roll. */
export function rollAbility(r = rng) {
  const res = rollExpr('4d6kh3', r);
  return { total: res.total, rolls: res.rolls, dropped: res.dropped };
}

/** Roll a full set of six ability scores. */
export function rollAbilitySet(r = rng) {
  return Array.from({ length: 6 }, () => rollAbility(r));
}

/** Percentile roll, 1–100. */
export function d100(r = rng) { return r.int(1, 100); }

/** Roll hit points for a level: average-rounded-up is the 5e default for PCs. */
export function hitPointsForLevel(hitDie, conMod, { average = true, r = rng } = {}) {
  const die = typeof hitDie === 'number' ? hitDie : parseInt(String(hitDie).replace(/\D/g, ''), 10);
  const rolled = average ? Math.floor(die / 2) + 1 : r.int(1, die);
  return Math.max(1, rolled + conMod);
}
