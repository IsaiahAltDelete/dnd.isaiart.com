// tools/music-check.mjs — headless validation of every track and instrument in the score, no browser needed.
//
//   NODE=node   # any Node 18+
//   $NODE tools/music-check.mjs            # errors and warnings; exit 1 on any error
//   $NODE tools/music-check.mjs --quiet    # errors only
//
// A composer writes numbers, and a wrong number is silence or a squeal that
// nobody hears until a player does. This reads the same tables audio.js reads
// and checks what it can without sound:
//   errors   — an instrument id that does not exist, a note that is not a
//              number or name, a non-positive duration, a step or volume that is
//              NaN, a drum id nobody plays, an unknown room / ornament / vowel,
//              a context that is not in the contract;
//   warnings — a note outside the instrument's compass (`range`), a note that
//              starts or rings past the loop's end (loopBars * 16 steps), a
//              layer with no notes.

import { TRACKS, INSTRUMENTS, SPB, TRACK_GROUPS } from '../src/core/music.js';
import { DRUMS, ROOMS, VOWELS } from '../src/core/synth.js';

const quiet = process.argv.includes('--quiet');
// The contract's list (docs/OVERHAUL.md §4.7), mirrored from audio.js so this
// tool imports no browser-only module.
const CONTEXTS = new Set(['title', 'town', 'city', 'village', 'inn', 'tavern', 'shop', 'market',
  'temple', 'crypt', 'castle', 'field', 'road', 'forest', 'hills', 'mountain', 'coast', 'marsh', 'night',
  'dungeon', 'cave', 'underdark', 'battle', 'boss', 'dragon', 'victory', 'defeat', 'lament', 'camp',
  'festival', 'mystery', 'tense', 'travel']);
const ORNAMENTS = new Set(['mordent', 'trill', 'grace']);
const SEMI = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const midiOf = (n) => {
  if (typeof n === 'number') return n > 0 && n < 128 ? n : n >= 128 ? 69 + 12 * Math.log2(n / 440) : NaN;
  const m = /^([A-Ga-g])([#s+]*|[b-]*)(-?\d+)$/.exec(String(n).trim());
  if (!m) return NaN;
  let v = SEMI[m[1].toLowerCase()];
  for (const c of m[2]) v += (c === '#' || c === 's' || c === '+') ? 1 : -1;
  return (parseInt(m[3], 10) + 1) * 12 + v;
};
const keyShift = (key) => {
  if (!key) return 0;
  const m = midiOf(String(key).replace(/m(in(or)?)?$/i, '') + '4');
  return Number.isNaN(m) ? 0 : ((m - 60) % 12 + 12) % 12;
};

const errors = [], warns = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const warn = (where, msg) => warns.push(`${where}: ${msg}`);

for (const [id, inst] of Object.entries(INSTRUMENTS)) {
  if (!inst || typeof inst !== 'object') { err(`inst ${id}`, 'not an object'); continue; }
  if (inst.range && !(inst.range[0] < inst.range[1])) err(`inst ${id}`, `bad range ${inst.range}`);
  if (!(Number(inst.gain ?? 1) > 0)) err(`inst ${id}`, `gain ${inst.gain}`);
}

let notes = 0;
for (const [id, tr] of Object.entries(TRACKS)) {
  const W = `track ${id}`;
  if (!(tr.bpm > 0)) err(W, `bpm ${tr.bpm}`);
  const total = Math.round((tr.loopBars || 4) * SPB);
  const shift = (tr.transpose || 0) + (tr.relative ? keyShift(tr.key) : 0);
  if (tr.room != null && !ROOMS[tr.room]) err(W, `unknown room '${tr.room}'`);
  for (const c of tr.contexts || []) if (!CONTEXTS.has(c)) err(W, `context '${c}' is not in the contract`);
  if (tr.weight != null && !(Number(tr.weight) >= 0)) err(W, `weight ${tr.weight}`);
  if (!Array.isArray(tr.layers) || !tr.layers.length) { err(W, 'no layers'); continue; }
  tr.layers.forEach((L, li) => {
    const LW = `${W} layer ${L.name || li}`;
    const drums = L.wave === 'noise';
    const inst = L.inst ? INSTRUMENTS[L.inst] : null;
    if (L.inst && !inst) err(LW, `unknown instrument '${L.inst}'`);
    if (!drums && !L.inst && !L.wave) err(LW, 'neither inst nor wave');
    if (L.ornament != null && !ORNAMENTS.has(L.ornament)) err(LW, `unknown ornament '${L.ornament}'`);
    if (L.vowel != null && !/[aeiou]/i.test(String(L.vowel))) err(LW, `vowel '${L.vowel}' has no vowel in it`);
    if (L.swing != null && !(L.swing >= 0 && L.swing <= 0.3)) warn(LW, `swing ${L.swing} outside 0..0.3`);
    if (L.pan != null && !(L.pan >= -1 && L.pan <= 1)) warn(LW, `pan ${L.pan} outside -1..1`);
    if (L.humanize != null && !(L.humanize >= 0 && L.humanize <= 80)) warn(LW, `humanize ${L.humanize} ms outside 0..80`);
    const pat = L.pattern || [];
    if (!pat.length) warn(LW, 'no notes');
    const [lo, hi] = (inst && inst.range) || [0, 127];
    let low = 0, high = 0, late = 0, ring = 0;
    for (const e of pat) {
      notes++;
      if (!Array.isArray(e)) { err(LW, `entry ${JSON.stringify(e)} is not an array`); continue; }
      const [s, n, d, v] = e;
      if (!Number.isFinite(Number(s))) { err(LW, `step ${s} is not a number`); continue; }
      if (!(Number(d ?? 1) > 0)) err(LW, `duration ${d} at step ${s}`);
      if (v != null && !Number.isFinite(Number(v))) err(LW, `volume ${v} at step ${s}`);
      if (s < 0 || s >= total) late++;
      else if (s + (d || 1) > total + 0.01) ring++;
      if (e[4] != null && !VOWELS.includes(String(e[4])[0])) err(LW, `note vowel '${e[4]}' at step ${s}`);
      if (drums) {
        const name = String(n).split(':')[0];
        if (!DRUMS.includes(name)) err(LW, `unknown drum '${n}' at step ${s}`);
        continue;
      }
      const m = midiOf(n);
      if (!Number.isFinite(m)) { err(LW, `note ${JSON.stringify(n)} at step ${s}`); continue; }
      if (m + shift < lo) low++;
      if (m + shift > hi) high++;
    }
    if (late) warn(LW, `${late} note(s) start outside the ${total}-step loop (they wrap)`);
    if (ring) warn(LW, `${ring} note(s) ring past the loop's end`);
    if (low || high) warn(LW, `${low + high} note(s) outside ${L.inst}'s range [${lo}, ${hi}] (${low} low, ${high} high)`);
  });
}
for (const [g, ids] of Object.entries(TRACK_GROUPS)) for (const t of ids) if (!TRACKS[t]) err(`group ${g}`, `unknown track '${t}'`);

if (!quiet) for (const w of warns) console.log('warn  ' + w);
for (const e of errors) console.log('ERROR ' + e);
console.log(`music-check: ${Object.keys(TRACKS).length} tracks, ${notes} notes, ${Object.keys(INSTRUMENTS).length} instruments — ${errors.length} error(s), ${warns.length} warning(s)`);
process.exit(errors.length ? 1 : 0);
