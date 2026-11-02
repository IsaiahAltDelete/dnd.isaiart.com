// tools/sacred/check.mjs — headless validation of the sacred music book: data, ranges, and counterpoint.
//
//   $NODE tools/sacred/check.mjs            # every track in core/music_sacred.js
//   $NODE tools/sacred/check.mjs dawnOrganum --dis   # one track, listing every dissonance
//
// It imports the real music.js (which merges the book), so what it checks is
// exactly what audio.js will play. Hard errors (a missing instrument, a step
// outside the loop, NaN, a zero duration, an illegal context) exit 1. Range and
// overlap problems are listed as warnings; the counterpoint report is a
// measurement, printed for every track that names its voices below.

import { TRACKS, INSTRUMENTS, SPB, MODES, noteToMidi, deg, tune, rep, drone, pluckFig, hits, beat } from '../../src/core/music.js';
import { build } from '../../src/core/music_sacred.js';

const args = process.argv.slice(2);
const only = args.filter((a) => !a.startsWith('--'));
const showDis = args.includes('--dis');

const CONTEXTS = new Set(('title town city village inn tavern shop market temple crypt castle field road forest hills ' +
  'mountain coast marsh night dungeon cave underdark battle boss dragon victory defeat lament camp festival mystery tense travel').split(' '));
const DRUMS = new Set(('kick snare rim hat openhat shaker tom tabor frame wardrum timp timphi gong drip crash click ' +
  'nakers nakersHi tambourine bellTower handbell cymbalettes').split(' '));

// Comfortable written ranges (MIDI) — a sung line outside these is a mistake,
// an instrument outside them is at least suspicious.
const RANGE = {
  voiceBass: [38, 62], voiceTenor: [47, 69], voiceAlto: [53, 77], voiceTreble: [59, 81],
  choirMen: [38, 69], choirFull: [38, 81], choir: [36, 81],
  vielle: [50, 86], rebec: [55, 88], viol: [33, 67], symphonia: [43, 79], hurdygurdy: [36, 79],
  harp: [36, 91], harpGothic: [41, 89], psaltery: [55, 93], psalteryStruck: [55, 93],
  lute: [40, 81], lutePlucked: [40, 81], gittern: [52, 86], citole: [52, 86],
  recorder: [60, 93], flute: [60, 96], shawm: [55, 86], shawmAlto: [55, 81], shawmTenor: [48, 74],
  cornett: [55, 86], sackbut: [40, 72], dulcian: [34, 65], crumhorn: [50, 76],
  organetto: [48, 96], portative: [55, 91], positive: [36, 91], pad: [24, 72],
  bell: [36, 96], bells: [36, 96], chime: [60, 100], handbells: [60, 100],
};
// Instruments that play one note at a time: overlapping notes in one layer mean a typo.
const MONO = /^(voice|recorder|shawm|cornett|sackbut|dulcian|crumhorn|flute|vielle|rebec)/;

// Which layers carry the counterpoint, and how to judge it. `beat` is the
// strong-position grid in 16ths; `fourth` says whether a 4th over the lowest
// sounding voice counts as consonant (it does in organum and conductus). A
// voice given as a list is those layers merged (one part, re-orchestrated).
const VOICES = {
  dawnOrganum: { voices: ['tenor', 'duplum', 'triplum'], beat: 6, fourth: true, sixths: false },
  tyrConductus: { voices: ['tenor', 'duplum', 'triplum'], beat: 6, fourth: true, sixths: false },
  helmFaburden: { voices: ['bassus', 'chant', 'treble'], beat: 8, fourth: false },
  doomguideDies: { voices: ['chant', 'organal'], beat: 4, fourth: true },
  alustrielBallade: { voices: [['tenor', 'tenor2'], 'contra', ['cantus', 'cantus2']], beat: 4, fourth: false },
  moonbridgeRondeau: { voices: ['tenor', 'contra', ['cantus', 'voice', 'hockA', 'hockB']], beat: 6, fourth: false },
  bindersMotet: { voices: ['tenor', 'motetus', 'triplum'], beat: 6, fourth: true, sixths: false },
  seluneGymel: { voices: ['tenor', 'low', 'high'], beat: 4, fourth: false },
  // The lament sings over a drone whose F-against-E is the point; measure the
  // two singers, and list the drone clashes with --dis on the full set.
  dragonspearPlanctus: { voices: ['answer', 'voice'], beat: 8, fourth: true },
  blackHandHocket: { voices: ['tenor', 'motetus', 'triplum'], beat: 4, fourth: true },
  mysteriesChant: { voices: ['second', 'chant'], beat: 8, fourth: true },
  tempusConductus: { voices: ['tenor', 'duplum', 'triplum'], beat: 4, fourth: true },
  wayfireSong: { voices: ['bass', 'tenor', 'alto', 'descant'], beat: 6, fourth: false },
  pilgrimStella: { voices: [['secunda', 'vielle'], ['cantus', 'recorder']], beat: 8, fourth: true },
};

const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const nm = (m) => NAMES[m % 12] + (Math.floor(m / 12) - 1);
const IV = ['P1', 'm2', 'M2', 'm3', 'M3', 'P4', 'TT', 'P5', 'm6', 'M6', 'm7', 'M7'];

const book = build({ SPB, MODES, noteToMidi, deg, tune, rep, drone, pluckFig, hits, beat });
const ids = Object.keys(book.tracks).filter((id) => !only.length || only.includes(id));
let errors = 0, warnings = 0;
const err = (id, m) => { errors++; console.log(`  ERROR ${id}: ${m}`); };
const warn = (id, m) => { warnings++; console.log(`  warn  ${id}: ${m}`); };

for (const [g, list] of Object.entries(book.groups || {})) {
  for (const id of list) if (!book.tracks[id]) err('groups', `group ${g} names missing track ${id}`);
}

for (const id of ids) {
  const t = TRACKS[id];
  if (!t || t.title !== book.tracks[id].title) { err(id, 'not merged into TRACKS (id collision with another book?)'); continue; }
  const total = (t.loopBars || 0) * SPB;
  const secs = total * (60 / t.bpm / 4);
  console.log(`\n${id}  "${t.title || '?'}"  ${t.loopBars} bars @ ${t.bpm} bpm = ${secs.toFixed(1)} s  ctx=${(t.contexts || []).join(',')} w=${t.weight}`);
  if (!Number.isInteger(t.loopBars) || t.loopBars < 1) err(id, `loopBars ${t.loopBars}`);
  if (!(t.bpm > 20 && t.bpm < 240)) err(id, `bpm ${t.bpm}`);
  if (!Array.isArray(t.contexts) || !t.contexts.length) err(id, 'no contexts');
  for (const c of t.contexts || []) if (!CONTEXTS.has(c)) err(id, `unknown context ${c}`);
  if (!(t.weight > 0)) err(id, `weight ${t.weight}`);
  const names = new Set();
  let notes = 0;
  for (const L of t.layers) {
    if (names.has(L.name)) err(id, `duplicate layer name ${L.name}`);
    names.add(L.name);
    const noise = L.wave === 'noise';
    if (!noise && !INSTRUMENTS[L.inst]) err(id, `${L.name}: unknown instrument ${L.inst}`);
    if (!(L.gain > 0 && L.gain < 1)) warn(id, `${L.name}: gain ${L.gain}`);
    const rng = RANGE[L.inst];
    let lo = 999, hi = -1;
    const evs = [...L.pattern].sort((a, b) => a[0] - b[0]);
    for (const ev of evs) {
      notes++;
      const [s, n, d, v] = ev;
      if (!Number.isInteger(s) || s < 0 || s >= total) err(id, `${L.name}: step ${s} outside 0..${total - 1}`);
      if (!(d > 0) || !Number.isFinite(d)) err(id, `${L.name}: duration ${d} at step ${s}`);
      if (!(v > 0 && v <= 1.5)) err(id, `${L.name}: volume ${v} at step ${s}`);
      if (noise) { if (!DRUMS.has(String(n))) warn(id, `${L.name}: unknown drum ${n}`); continue; }
      if (!Number.isFinite(n)) { err(id, `${L.name}: note ${n} at step ${s}`); continue; }
      lo = Math.min(lo, n); hi = Math.max(hi, n);
      if (s + d > total + 0.01) warn(id, `${L.name}: ${nm(n)} at ${s} rings ${s + d - total} steps past the loop end`);
    }
    // A sung line that never overlaps itself is sung legato (audio.js _ties):
    // a note that starts where the last ended glides on, and only a change of
    // vowel re-articulates — so a repeated pitch on the same vowel is one long
    // note, and the repetition the composer wrote is lost.
    if (/^(voice|choir)/.test(L.inst) && evs.every((e, i) => !i || e[0] >= evs[i - 1][0] + evs[i - 1][2] - 0.01)) {
      const cyc = [...String(L.vowel || INSTRUMENTS[L.inst].vowel || 'a')].filter((c) => 'aeiou'.includes(c));
      let vi = 0, melted = 0;
      const vow = evs.map((e) => (typeof e[4] === 'string' ? e[4] : cyc[vi++ % cyc.length]));
      for (let i = 1; i < evs.length; i++) {
        const a = evs[i - 1], b = evs[i];
        if (Math.abs(a[0] + a[2] - b[0]) < 0.01 && a[1] === b[1] && vow[i] === vow[i - 1]) melted++;
      }
      if (melted) warn(id, `${L.name}: ${melted} repeated note(s) tied on the same vowel — they will sound as one`);
    }
    if (!noise && MONO.test(L.inst)) {
      for (let i = 1; i < evs.length; i++) {
        const a = evs[i - 1], b = evs[i];
        if (b[0] < a[0] + a[2] - 0.01) warn(id, `${L.name}: ${nm(a[1])}@${a[0]} overlaps ${nm(b[1])}@${b[0]} in a one-voice line`);
      }
    }
    if (!noise && evs.length) {
      const bad = rng && (lo < rng[0] || hi > rng[1]);
      if (bad) warn(id, `${L.name} (${L.inst}) range ${nm(lo)}..${nm(hi)} outside ${nm(rng[0])}..${nm(rng[1])}`);
      console.log(`    ${L.name.padEnd(10)} ${String(L.inst).padEnd(12)} ${String(evs.length).padStart(4)} notes  ${nm(lo)}..${nm(hi)}${L.vowel ? '  /' + L.vowel + '/' : ''}${L.room ? '  ' + L.room : ''}`);
    } else if (noise) console.log(`    ${L.name.padEnd(10)} drums        ${String(evs.length).padStart(4)} hits   ${[...new Set(evs.map((e) => e[1]))].join(' ')}`);
  }
  if (!notes) err(id, 'no notes at all');
  counterpoint(id, t, total);
}

console.log(`\n${ids.length} tracks, ${errors} errors, ${warnings} warnings`);
process.exit(errors ? 1 : 0);

// ── counterpoint measurement ────────────────────────────────────────────────
function counterpoint(id, t, total) {
  const cfg = VOICES[id];
  if (!cfg) return;
  const layers = cfg.voices.map((v) => ({ pattern: [].concat(v).flatMap((n) => (t.layers.find((L) => L.name === n) || { pattern: [] }).pattern) }))
    .filter((L) => L.pattern.length);
  if (layers.length < 2) return;
  // What each voice is sounding at step s (null for silence).
  const at = (L, s) => { for (const [st, n, d] of L.pattern) if (s >= st && s < st + d) return n; return null; };
  let n = 0, ok = 0, perf = 0, imperf = 0, par = 0;
  const bad = [];
  let prev = null;
  for (let s = 0; s < total; s += cfg.beat) {
    const sound = layers.map((L) => at(L, s));
    const live = sound.filter((x) => x != null);
    if (live.length < 2) { prev = null; continue; }
    n++;
    const low = Math.min(...live);
    let good = true, allPerfect = true;
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = Math.min(live[i], live[j]), b = Math.max(live[i], live[j]);
        const ic = (b - a) % 12;
        const vsBass = a === low;
        // 13th-century theory counts 3rds as consonant but 6ths as (mild)
        // discords; by the 14th century 6ths are imperfect consonances.
        const cons = ic === 0 || ic === 7 || ic === 3 || ic === 4 ||
          ((ic === 8 || ic === 9) && cfg.sixths !== false) ||
          (ic === 5 && (cfg.fourth || !vsBass));
        if (![0, 7, 5].includes(ic)) allPerfect = false;
        if (!cons) good = false;
      }
    }
    if (good) ok++; else bad.push(`bar ${Math.floor(s / 16) + 1} step ${s}: ${sound.map((x, i) => x == null ? '-' : [].concat(cfg.voices[i])[0] + ' ' + nm(x)).join(' / ')}`);
    if (allPerfect) perf++; else imperf++;
    // Parallel perfect intervals between the two outer voices, for information.
    const hiV = Math.max(...live);
    if (prev && prev.low !== low && prev.hi !== hiV && (prev.hi - prev.low) % 12 === (hiV - low) % 12 && [0, 7].includes((hiV - low) % 12)) par++;
    prev = { low, hi: hiV };
  }
  const pct = n ? (100 * ok / n).toFixed(0) : '-';
  console.log(`    counterpoint: ${n} strong sonorities, ${pct}% consonant, ${perf} open (5ths/8ves/4ths), ${imperf} with 3rds/6ths, ${par} outer parallels`);
  if (bad.length) {
    console.log(`    ${bad.length} dissonant strong beats${showDis ? ':' : ' (--dis to list)'}`);
    if (showDis) for (const b of bad) console.log('      ' + b);
  }
}
