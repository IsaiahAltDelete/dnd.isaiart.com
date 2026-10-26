// tools/secular/check.mjs — headless validation of the secular music book: data, compass, and counterpoint.
//
//   NODE=node   # any Node 18+
//   $NODE tools/secular/check.mjs                      # every track in core/music_secular.js
//   $NODE tools/secular/check.mjs elfsongTourdion --dis # one track, listing every dissonant beat
//
// It imports the real music.js (which merges the book), so what it checks is what
// audio.js will play. Errors exit 1: an unknown instrument / drum / room / vowel /
// context, a step that is not an integer or falls outside loopBars*16, a zero or
// NaN length or volume, a note outside the instrument's compass. Warnings: a
// monophonic line that overlaps itself. The counterpoint report is a
// measurement: on every beat, the sounding pitches of the non-drone voices are
// judged against the lowest (a fourth over the bass counts as a dissonance, as
// it did then) and against each other (seconds, sevenths, the tritone).

import * as M from '../../src/core/music.js';
import { build } from '../../src/core/music_secular.js';
import { DRUMS, ROOMS, VOWELS } from '../../src/core/synth.js';

const { TRACKS, INSTRUMENTS, SPB } = M;
const args = process.argv.slice(2);
const only = args.filter((a) => !a.startsWith('--'));
const showDis = args.includes('--dis');

const CONTEXTS = new Set(('title town city village inn tavern shop market temple crypt castle field road forest hills ' +
  'mountain coast marsh night dungeon cave underdark battle boss dragon victory defeat lament camp festival mystery tense travel').split(' '));
const DRUM = new Set(DRUMS);
const MONO_KINDS = new Set(['voice', 'reed', 'brass', 'wind', 'bowed']);
const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const nm = (m) => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);

// Beat length in steps per track, where it is not a quarter note: compound and
// triple metres are judged on their dotted or half-note beats. A track that
// changes metre gives [fromStep, beat] pairs.
const BEAT = {
  yawningPortalRota: 6, elfsongTourdion: 4, jewelPavane: 8, calishiteMourisque: 4, drawnSteelEstampie: 6,
  phandalinEstampie: 4, greengrassBranles: [[0, 4], [256, 6]], neverwinterWoodCaccia: 6, flamingFistSaltarello: 6,
  dolphinBridgeBallata: 4, seaOfSwordsCarole: 6, delzounBasseDanse: 8, brokenShieldEstampie: 4, rageOfDragons: 8,
  mereLament: [[0, 8], [384, 6]], highRoadPassamezzo: 4, triboarEstampie: 4, dockWardIstampitta: 4, daggerfordPastourelle: 4,
};
function beatAt(id, t) {
  const b = BEAT[id] || 4;
  if (!Array.isArray(b)) return b;
  let v = b[0][1];
  for (const [from, len] of b) if (t >= from) v = len;
  return v;
}

const book = build({ SPB, MODES: M.MODES, noteToMidi: M.noteToMidi, deg: M.deg, tune: M.tune, rep: M.rep,
  drone: M.drone, pluckFig: M.pluckFig, hits: M.hits, beat: M.beat });
const ids = Object.keys(book.tracks).filter((id) => !only.length || only.includes(id));

let errors = 0, warns = 0;
const err = (w, m) => { errors++; console.log(`  ERROR ${w}: ${m}`); };
const warn = (w, m) => { warns++; console.log(`  warn  ${w}: ${m}`); };

for (const id of ids) {
  const tr = TRACKS[id];
  console.log(`\n${id} — ${tr && tr.title}`);
  if (!tr) { err(id, 'not merged into TRACKS'); continue; }
  const total = Math.round((tr.loopBars || 4) * SPB);
  if (Math.abs(total - (tr.loopBars || 4) * SPB) > 1e-9) err(id, `loopBars ${tr.loopBars} is not a whole number of steps`);
  if (!(tr.bpm > 0)) err(id, `bpm ${tr.bpm}`);
  if (!tr.title) err(id, 'no title');
  if (!Array.isArray(tr.contexts) || !tr.contexts.length) err(id, 'no contexts');
  for (const c of tr.contexts || []) if (!CONTEXTS.has(c)) err(id, `unknown context '${c}'`);
  if (!Number.isFinite(tr.weight)) err(id, 'no weight');
  if (!['tavern', 'open', 'hall'].includes(tr.room)) err(id, `room '${tr.room}' (tavern | open | hall)`);
  if (!ROOMS[tr.room]) err(id, `room '${tr.room}' not in synth.js ROOMS`);

  const lines = [];
  let notes = 0;
  for (const L of tr.layers) {
    const W = `${id}.${L.name}`;
    const drums = L.wave === 'noise';
    const inst = drums ? null : INSTRUMENTS[L.inst];
    if (!drums && !inst) { err(W, `unknown instrument '${L.inst}'`); continue; }
    if (L.vowel && !VOWELS.includes(L.vowel)) err(W, `vowel '${L.vowel}'`);
    if (!(L.gain > 0)) err(W, `gain ${L.gain}`);
    if (!L.pattern || !L.pattern.length) { warn(W, 'no notes'); continue; }
    const [lo, hi] = (inst && inst.range) || [0, 127];
    const ev = [];
    for (const e of L.pattern) {
      const [s, n, d, v, vw] = e;
      notes++;
      if (!Number.isInteger(s)) err(W, `step ${s} is not an integer`);
      if (!(s >= 0 && s < total)) err(W, `step ${s} outside 0..${total - 1}`);
      if (!(d > 0) || !Number.isFinite(d)) err(W, `duration ${d} at ${s}`);
      if (!(v > 0 && v <= 1.5)) err(W, `volume ${v} at ${s}`);
      if (vw != null && !VOWELS.includes(vw)) err(W, `vowel '${vw}' at ${s}`);
      if (drums) { if (!DRUM.has(n)) err(W, `unknown drum '${n}' at ${s}`); continue; }
      if (!Number.isFinite(n)) { err(W, `note ${n} at ${s}`); continue; }
      if (n < lo || n > hi) err(W, `${nm(n)} (${n}) at step ${s} outside ${L.inst} ${nm(lo)}..${nm(hi)}`);
      ev.push([s, n, d]);
    }
    if (inst && MONO_KINDS.has(inst.kind)) {
      const sorted = ev.slice().sort((a, b) => a[0] - b[0]);
      let over = 0;
      for (let i = 1; i < sorted.length; i++) if (sorted[i][0] < sorted[i - 1][0] + sorted[i - 1][2] - 1e-9) over++;
      if (over) warn(W, `${over} overlapping notes in a one-note-at-a-time line`);
    }
    if (!drums && !/^drone|^bells?$/.test(L.name)) lines.push({ name: L.name, ev });
  }

  // Counterpoint on the beat. A note sounds at step t if it began at or before
  // t and has not ended; notes that wrap past the loop's end are folded back.
  let beats = 0, bad = 0;
  const listed = [];
  for (let t = 0; t < total; t += beatAt(id, t)) {
    const sound = [];
    for (const ln of lines) for (const [s, n, d] of ln.ev) {
      const on = (t >= s && t < s + d) || (s + d > total && t < s + d - total);
      if (on) sound.push({ n, v: ln.name });
    }
    if (sound.length < 2) continue;
    beats++;
    const bass = Math.min(...sound.map((x) => x.n));
    const why = [];
    for (const x of sound) {
      const ic = (x.n - bass) % 12;
      if ([1, 2, 5, 6, 10, 11].includes(ic)) why.push(`${x.v} ${nm(x.n)} over ${nm(bass)}`);
    }
    for (let i = 0; i < sound.length; i++) for (let j = i + 1; j < sound.length; j++) {
      const a = sound[i], b = sound[j];
      if (a.n === bass || b.n === bass) continue;
      const ic = Math.abs(a.n - b.n) % 12;
      if ([1, 2, 6, 10, 11].includes(ic)) why.push(`${a.v} ${nm(a.n)} ~ ${b.v} ${nm(b.n)}`);
    }
    if (why.length) { bad++; if (showDis || listed.length < 6) listed.push(`    step ${t} (bar ${Math.floor(t / SPB) + 1}): ${why.join('; ')}`); }
  }
  const secs = total * 60 / tr.bpm / 4;
  console.log(`  ${tr.layers.length} layers, ${notes} events, loop ${total} steps = ${secs.toFixed(1)} s at ${tr.bpm} bpm; ` +
    `contexts ${tr.contexts.join(',')}; room ${tr.room}`);
  console.log(`  counterpoint: ${beats - bad}/${beats} beats consonant (${beats ? Math.round(100 * (beats - bad) / beats) : 100}%)`);
  for (const l of listed) console.log(l);
  if (!showDis && bad > listed.length) console.log(`    ... ${bad - listed.length} more (--dis lists them)`);
}

console.log(`\n${ids.length} tracks, ${errors} errors, ${warns} warnings`);
process.exit(errors ? 1 : 0);
