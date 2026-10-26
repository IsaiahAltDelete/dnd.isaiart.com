// core/music.js — the score for Sword Coast Chronicles.
//
// This is deliberately NOT chiptune. A Realms tavern in 1496 DR has a lute, a
// recorder, a bowed vielle and a tabor, so the synth models those instead of
// NES pulse waves: plucked strings with real decay envelopes and doubled
// courses, bowed strings with slow attack and vibrato, reed pipes with breath
// noise, and a portative organ built from stacked partials. Everything runs
// through a stone-hall reverb in audio.js, which is most of what stops a
// synthesised loop sounding harsh.
//
// The writing is modal, as period music is: Dorian, Aeolian, Mixolydian and
// Phrygian rather than functional major/minor. Cadences fall bVII–I or iv–i, not
// V–I; open fifths and parallel motion are correct here, not mistakes.
//
// Pattern entry: [step, note, durSteps, vol]. One step = a 16th, 16 steps = a bar.
// `note` is a MIDI number (from the degree helpers) or a drum id on noise layers.

import { build as buildSacred } from './music_sacred.js';
import { build as buildSecular } from './music_secular.js';
import { CATALOGUE } from './music_catalogue.js';

export const SPB = 16;

// ── note helpers (local copies so this module has no import cycle) ───────────

const SEMI = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

export function noteToMidi(name) {
  const m = /^([a-gA-G])([#b+\-s]*)(-?\d)$/.exec(String(name).trim());
  if (!m) return NaN;
  let n = SEMI[m[1].toLowerCase()];
  for (const c of m[2]) n += (c === '#' || c === 's' || c === '+') ? 1 : -1;
  return (parseInt(m[3], 10) + 1) * 12 + n;
}

/** Church modes as semitone offsets from the tonic. */
export const MODES = {
  ionian: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
  // Not a church mode, but the raised-4th sound of eastern-Faerûnian tunes.
  hijaz: [0, 1, 4, 5, 7, 8, 10],
};

/**
 * Scale degree -> MIDI. `d` is 1-based and may run past 7 or below 1, wrapping
 * into the octave above/below, so a melody can climb without bookkeeping.
 */
export function deg(root, mode, d) {
  const steps = MODES[mode] || MODES.aeolian;
  const n = steps.length;
  const i = Math.round(d) - 1;
  const oct = Math.floor(i / n);
  const within = ((i % n) + n) % n;
  return root + steps[within] + oct * 12;
}

/**
 * Write a melody in scale degrees.
 *   tune(root, 'dorian', 0, [[1,4],[3,2],[null,2],[5,4]])
 * pairs are [degree|null, durSteps, vol?]; null is a rest. Degrees may be
 * fractional-free integers, or a string note name for an accidental.
 */
export function tune(root, mode, start, pairs, vol = 1) {
  const out = [];
  let s = start;
  for (const [d, dur, v] of pairs) {
    if (d != null) {
      const note = typeof d === 'string' ? noteToMidi(d) : deg(root, mode, d);
      out.push([s, note, dur, v ?? vol]);
    }
    s += dur;
  }
  return out;
}

/** Repeat a degree-written figure across `count` bars, optionally transposing per bar. */
export function rep(count, root, mode, fig, { every = SPB, shift = null, vol = 1 } = {}) {
  const out = [];
  for (let b = 0; b < count; b++) {
    const r = root + (shift ? shift[b % shift.length] : 0);
    for (const [st, d, dur, v] of fig) {
      if (d == null) continue;
      const note = typeof d === 'string' ? noteToMidi(d) : deg(r, mode, d);
      out.push([b * every + st, note, dur ?? 1, (v ?? 1) * vol]);
    }
  }
  return out;
}

/** A sustained open-fifth drone: the bagpipe/hurdy-gurdy bed under most of this. */
export function drone(root, bars, { fifth = true, octave = false, dur = SPB, vol = 1 } = {}) {
  const out = [];
  for (let b = 0; b < bars; b++) {
    const s = b * SPB;
    out.push([s, root, dur, vol]);
    if (fifth) out.push([s, root + 7, dur, vol * 0.8]);
    if (octave) out.push([s, root + 12, dur, vol * 0.5]);
  }
  return out;
}

/** Broken-chord accompaniment in a mode — the lute's default job. */
export function pluckFig(root, mode, bars, degrees, { pattern = [0, 4, 8, 12], dur = 3, vol = 0.9, shift = null } = {}) {
  const out = [];
  for (let b = 0; b < bars; b++) {
    const r = root + (shift ? shift[b % shift.length] : 0);
    pattern.forEach((st, i) => {
      const d = degrees[i % degrees.length];
      out.push([b * SPB + st, deg(r, mode, d), dur, vol]);
    });
  }
  return out;
}

/** Drum hits at the given absolute steps. */
export function hits(steps, name, vol = 1, dur = 1) { return steps.map((s) => [s, name, dur, vol]); }

/** Drum hits at per-bar offsets, repeated over `count` bars. */
export function beat(count, offsets, name, vol = 1) {
  const out = [];
  for (let b = 0; b < count; b++) for (const s of offsets) out.push([b * SPB + s, name, 1, vol]);
  return out;
}

// ── part-book notation ───────────────────────────────────────────────────────
//
// The first score's revised tracks are counterpoint, and counterpoint is read,
// checked and corrected in note names, so each part is written out as text.
// Everything returns [step, midi, dur, vol] events carrying a `.len` in steps,
// so parts chain with seq() and repeat with times().

const withLen = (evs, len) => Object.assign(evs, { len });

/**
 * One part: 'A4:4 B4 C5 A4 | G#4:8 - r:4 D3+A3:8 C5@0.6'. A token is a note
 * (or notes joined by '+', a chord) with an optional length in 16ths that
 * carries forward; 'r' rests; '-' adds its length to the note before (a tie);
 * '@v' sets that note's volume; '|' is a bar line for the eye. Notes on the
 * `beat` grid sound at `vol`, the others at `vol * weak`, which is all the
 * metrical accent a dance needs. A misspelt note throws, so a typo fails the
 * checks instead of playing silence.
 */
export function line(src, { vol = 0.85, weak = 0.8, beat = 4, shift = 0 } = {}) {
  const out = [];
  let t = 0, dur = 4, last = [];
  for (const tok of src.split(/\s+/)) {
    if (!tok || tok === '|') continue;
    const [body, v] = tok.split('@');
    const [p, d] = body.split(':');
    if (d) dur = Number(d);
    if (p === '-') for (const e of last) e[2] += dur;
    else if (p === 'r') last = [];
    else {
      const loud = v ? Number(v) : vol * (t % beat === 0 ? 1 : weak);
      last = p.split('+').map((n) => {
        const m = noteToMidi(n);
        if (!Number.isFinite(m)) throw new Error(`music.js line(): bad note "${n}"`);
        return [t, m + shift, dur, loud];
      });
      out.push(...last);
    }
    t += dur;
  }
  return withLen(out, t);
}

/** Parts one after another; a number is a rest of that many steps. */
export function seq(...parts) {
  const out = [];
  let t = 0;
  for (const p of parts) {
    if (typeof p === 'number') { t += p; continue; }
    for (const e of p) { const c = e.slice(); c[0] += t; out.push(c); }
    t += p.len;
  }
  return withLen(out, t);
}

/** A part played n times running. */
export const times = (evs, n) => seq(...Array.from({ length: n }, () => evs));

/**
 * Percussion from a grid: one character per 16th, '.' silent, anything else
 * looked up in `kit` as [drumId, vol]; spaces and '|' are for the eye.
 */
export function drums(kit, ...bars) {
  const out = [];
  let t = 0;
  for (const bar of bars) for (const ch of bar) {
    if (ch === ' ' || ch === '|') continue;
    if (kit[ch]) out.push([t, kit[ch][0], 1, kit[ch][1]]);
    t++;
  }
  return withLen(out, t);
}

/**
 * Sung vowels, one per note, from a text's syllables written as vowels
 * ('a e i o u'); a shorter list starts again. The singer re-articulates on a
 * change of vowel and glides through a repeated one, so a syllabic line needs
 * its words or its repeated notes melt into one.
 */
export function sing(evs, vowels) {
  const vs = vowels.trim().split(/\s+/);
  return withLen(evs.map((e, i) => [e[0], e[1], e[2], e[3], vs[i % vs.length]]), evs.len);
}

// Convenient roots.
const C3 = 48, D3 = 50, E3 = 52, F3 = 53, G3 = 55, A3 = 57, Bb3 = 58, B3 = 59;
const C4 = 60, D4 = 62, E4 = 64, F4 = 65, G4 = 67, A4 = 69;

// ─────────────────────────────────────────────────────────────────────────────
// INSTRUMENTS — how each voice is built. core/synth.js reads these.
//
// `kind` picks the model; everything else is that model's parameters, so a new
// instrument is usually a new entry here and no new code. `range` is the
// instrument's comfortable compass in MIDI (tools/music-check.mjs warns when a
// track writes outside it). `gain` is set by measurement (tools/music-render.mjs
// --instruments): a new instrument is calibrated so that equal layer gains sound
// about equally loud, while an id the first score already used keeps the level
// its tracks were mixed at (both engines rendered and matched within a dB), so
// re-voicing it changed its sound, not the mix.
//
//   kind:'ks'     Karplus-Strong string, rendered once per pitch: courses
//                 [[cents, level, msLate]], decay (t60 at middle C), bright (softness
//                 of what plucks: 0.3 flesh .. 0.9 quill), grit (nail / quill rasp),
//                 pluckPos, hammer (struck), buzz (bray pins), body filters,
//                 ring (seconds past the written end before damping; -1 = ring on)
//   kind:'voice'  formant singer: register or registers+splits, section,
//                 vowel, vibrato {rate, depth cents, delay, bloom}, scoop,
//                 jitter, shimmer, breath, consonant, ring (singer's formant dB)
//   kind:'bowed' | 'reed' | 'brass' | 'pipe' | 'wheel'
//                 a spectrum (`wave`, or organ `ranks` [[wave, ratio, level]])
//                 through a per-layer `body`; onsetCents (reed blip, bow
//                 settle, lip scoop), noise (bow hair / breath / buzz), bright
//                 (brass [start, sustain] harmonic multiple), chiff, click,
//                 trompette, wobble, wheelAM, vibrato, legato
//   kind:'rbell'  inharmonic partials [[ratio, amp, t60]], rendered per pitch
//   kind:'pluck' | 'bow' | 'wind' | 'organ' | 'drone' | 'bell'
//                 the first score's oscillator models, kept for the orchestra
// ─────────────────────────────────────────────────────────────────────────────

// The bell recipes live with the drum kit that also rings them.
import { BELL_TOWER, HANDBELL } from './synth.js';

// Body resonances, shared where instruments share a body.
const LUTE_BODY = [['highpass', 75, 0.7], ['peaking', 115, 3, 5], ['peaking', 240, 2.5, 4], ['peaking', 480, 2, 2],
  ['peaking', 1400, 1.5, -2], ['peaking', 2800, 1.2, 2], ['lowpass', 6500, 0.7]];
const HARP_BODY = [['highpass', 70, 0.7], ['peaking', 210, 1.5, 3], ['peaking', 900, 1.2, 2], ['lowpass', 7000, 0.7]];
const PSALTERY_BODY = [['highpass', 180, 0.7], ['peaking', 420, 2, 3], ['peaking', 950, 2, 2], ['peaking', 3200, 1, 3], ['lowpass', 9000, 0.7]];
const VIELLE_BODY = [['highpass', 150, 0.7], ['peaking', 290, 2.2, 5], ['peaking', 520, 2, 3], ['peaking', 1250, 1.2, -3],
  ['peaking', 2700, 1.3, 4], ['lowpass', 5200, 0.7]];
const VIOL_BODY = [['highpass', 45, 0.7], ['peaking', 110, 2, 4], ['peaking', 230, 2, 3], ['peaking', 900, 1.2, -2], ['lowpass', 2200, 0.7]];
const WHEEL_BODY = [['highpass', 140, 0.7], ['peaking', 320, 2, 4], ['peaking', 1100, 2, 4], ['peaking', 2800, 1.5, 3], ['lowpass', 6000, 0.7]];

// A singer's defaults; each part overrides what differs.
const SINGER = {
  kind: 'voice', section: 2, detuneCents: 5, smear: 0.02, width: 0.22,
  attack: 0.1, release: 0.26, scoop: 28, glide: 0.06,
  vibrato: { rate: 5.0, depth: 14, delay: 0.45, bloom: 0.5 },
  jitter: 6, shimmer: 0.05, breath: 0.06, consonant: 0.12, ring: 3, bandwidth: 1.1,
};

export const INSTRUMENTS = {
  // --- plucked strings (Karplus-Strong) ------------------------------------
  // The lute: gut, finger-plucked, double courses a few cents apart (the beating
  // between the pair is the lute's bloom), bass courses strung in octaves.
  lutePlucked: {
    kind: 'ks', range: [40, 79], gain: 1.1,
    courses: [[-1.8, 1, 0], [1.8, 0.85, 2.5]], octaveBelow: 55, octaveGain: 0.38,
    decay: 2.4, decayTilt: 0.5, bright: 0.6, pluckPos: 0.18, body: LUTE_BODY, ring: 0.5, damp: 0.12,
  },
  lute: {
    kind: 'ks', range: [40, 79], gain: 1,
    courses: [[-1.8, 1, 0], [1.8, 0.85, 2.5]], octaveBelow: 55, octaveGain: 0.38,
    decay: 2.2, decayTilt: 0.5, bright: 0.6, pluckPos: 0.18, body: LUTE_BODY, ring: 0.45, damp: 0.12,
  },
  // Gittern: the small gut-strung lute of the fourteenth century, plectrum-played, quick and bright.
  gittern: {
    kind: 'ks', range: [40, 84], gain: 0.58,
    courses: [[-2.5, 1, 0], [2.5, 0.8, 3.5]], decay: 1.2, decayTilt: 0.55, bright: 0.8, pluckPos: 0.12,
    body: [['highpass', 110, 0.7], ['peaking', 190, 3, 4], ['peaking', 380, 2, 3], ['peaking', 2000, 1.4, 3], ['lowpass', 7500, 0.7]],
    ring: 0.25, damp: 0.08,
  },
  // Citole: wire strings and a plectrum — the brightest, shortest pluck here.
  citole: {
    kind: 'ks', range: [48, 86], gain: 0.7,
    courses: [[-3, 1, 0], [3, 0.75, 3]], decay: 1.4, bright: 0.9, pluckPos: 0.1, loss: 0.42,
    body: [['highpass', 140, 0.7], ['peaking', 230, 2.5, 3], ['peaking', 650, 2, 3], ['peaking', 2600, 1.3, 4], ['lowpass', 8500, 0.7]],
    ring: 0.3, damp: 0.08,
  },
  // A clean gut harp, left to ring.
  harp: {
    kind: 'ks', range: [36, 91], gain: 1.5,
    courses: [[0, 1, 0]], decay: 3.2, decayTilt: 0.55, bright: 0.5, pluckPos: 0.3, body: HARP_BODY, ring: -1,
  },
  // The gothic harp's bray pins press on each string so it buzzes while it swings wide.
  harpGothic: {
    kind: 'ks', range: [45, 91], gain: 0.95,
    courses: [[0, 1, 0]], decay: 3.4, decayTilt: 0.55, bright: 0.55, pluckPos: 0.3, buzz: 0.35, buzzAt: 0.3,
    body: HARP_BODY, ring: -1,
  },
  // Psaltery: a box zither plucked with quills, three strings to a course. (6 dB
  // over the first score's level, which had it all but inaudible.)
  psaltery: {
    kind: 'ks', range: [55, 91], gain: 0.26,
    courses: [[-3, 1, 0], [0.5, 0.9, 1.5], [3.5, 0.8, 3]], decay: 2.6, decayTilt: 0.4, bright: 0.85, pluckPos: 0.14, loss: 0.4,
    body: PSALTERY_BODY, ring: -1,
  },
  // Hammered: a soft pulse where the hammer lands, metal strings ringing on.
  psalteryStruck: {
    kind: 'ks', range: [55, 91], gain: 0.6,
    courses: [[-3, 1, 0], [0.5, 0.9, 0.6], [3.5, 0.8, 1.1]], decay: 3.2, decayTilt: 0.4, hammer: 0.0009, pluckPos: 0.12, loss: 0.35,
    body: PSALTERY_BODY, ring: -1,
  },

  // --- bowed strings --------------------------------------------------------
  // Bow hair on gut: a scratch at the bite, a thread of noise under the tone,
  // vibrato only once the note has settled.
  vielle: {
    kind: 'bowed', wave: 'vielle', range: [43, 84], gain: 0.23, courses: 2, spread: 4,
    attack: 0.075, release: 0.16, sustainLevel: 0.86, onsetCents: 10, onsetTau: 0.02,
    noise: 0.05, noiseHz: 3200, noiseQ: 0.7, noiseAttack: 3.5, body: VIELLE_BODY,
    vibrato: { rate: 5.3, depth: 11, delay: 0.3, bloom: 0.35 }, jitter: 2.5, rearticulate: 0.75,
  },
  rebec: {
    kind: 'bowed', wave: 'rebec', range: [60, 88], gain: 0.35, courses: 1,
    attack: 0.05, release: 0.1, sustainLevel: 0.82, onsetCents: 14, onsetTau: 0.018,
    noise: 0.07, noiseHz: 3800, noiseQ: 0.7, noiseAttack: 3,
    body: [['highpass', 220, 0.7], ['peaking', 420, 2.5, 4], ['peaking', 1600, 1.4, 4], ['peaking', 3200, 1.5, 3], ['lowpass', 6500, 0.7]],
    vibrato: { rate: 5.9, depth: 14, delay: 0.22, bloom: 0.3 }, jitter: 3, rearticulate: 0.7,
  },
  // Low bowed bass, the floor of a consort.
  viol: {
    kind: 'bowed', wave: 'viol', range: [36, 67], gain: 0.22, courses: 2, spread: 3,
    attack: 0.1, release: 0.2, sustainLevel: 0.9, onsetCents: 8, onsetTau: 0.025,
    noise: 0.035, noiseHz: 2000, noiseQ: 0.7, noiseAttack: 3, body: VIOL_BODY,
    vibrato: { rate: 4.6, depth: 8, delay: 0.38, bloom: 0.4 }, jitter: 2, rearticulate: 0.8,
  },

  // --- reeds ----------------------------------------------------------------
  // A reed starts a little flat and snaps up to pitch: that blip is the tongue.
  shawmAlto: {
    kind: 'reed', wave: 'shawm', range: [60, 84], gain: 0.55,
    attack: 0.025, release: 0.07, sustainLevel: 0.92, onsetCents: -45, onsetTau: 0.012,
    noise: 0.03, noiseHz: 2600, noiseQ: 0.6, noiseAttack: 4,
    body: [['highpass', 200, 0.7], ['peaking', 1150, 1.6, 7], ['peaking', 2700, 1.8, 5], ['lowpass', 7500, 0.7]],
    vibrato: { rate: 5.4, depth: 6, delay: 0.3, bloom: 0.3 }, jitter: 3,
  },
  shawmTenor: {
    kind: 'reed', wave: 'shawm', range: [48, 72], gain: 0.6,
    attack: 0.03, release: 0.08, sustainLevel: 0.92, onsetCents: -40, onsetTau: 0.014,
    noise: 0.03, noiseHz: 2200, noiseQ: 0.6, noiseAttack: 4,
    body: [['highpass', 120, 0.7], ['peaking', 800, 1.6, 7], ['peaking', 2100, 1.8, 5], ['lowpass', 6000, 0.7]],
    vibrato: { rate: 5.2, depth: 6, delay: 0.32, bloom: 0.3 }, jitter: 3,
  },
  // The score's first shawm, now the alto model at the level its tracks expect.
  shawm: {
    kind: 'reed', wave: 'shawm', range: [55, 86], gain: 0.1,
    attack: 0.025, release: 0.07, sustainLevel: 0.92, onsetCents: -45, onsetTau: 0.012,
    noise: 0.03, noiseHz: 2600, noiseQ: 0.6, noiseAttack: 4,
    body: [['highpass', 200, 0.7], ['peaking', 1150, 1.6, 7], ['peaking', 2700, 1.8, 5], ['lowpass', 7500, 0.7]],
    vibrato: { rate: 5.4, depth: 6, delay: 0.3, bloom: 0.3 }, jitter: 3,
  },
  // Capped cylindrical reed: odd harmonics, a nasal buzz, no vibrato possible.
  crumhorn: {
    kind: 'reed', wave: 'crumhorn', range: [48, 74], gain: 0.14,
    attack: 0.015, release: 0.05, sustainLevel: 0.95, onsetCents: -30, onsetTau: 0.01,
    noise: 0.015, noiseHz: 2400, noiseAttack: 3,
    body: [['highpass', 120, 0.7], ['peaking', 1400, 2, 5], ['lowpass', 2800, 0.8]], jitter: 2,
  },
  // The dulcian (curtal): a folded conical bore, warm and round, the bass of the reed band.
  dulcian: {
    kind: 'reed', wave: 'dulcian', range: [34, 64], gain: 0.75,
    attack: 0.04, release: 0.1, sustainLevel: 0.92, onsetCents: -25, onsetTau: 0.016,
    noise: 0.02, noiseHz: 1800, noiseAttack: 3,
    body: [['highpass', 50, 0.7], ['peaking', 480, 1.5, 5], ['peaking', 1150, 1.8, 3], ['lowpass', 3200, 0.7]],
    vibrato: { rate: 5, depth: 5, delay: 0.35, bloom: 0.3 }, jitter: 2,
  },
  // The bagpipe chanter never stops sounding; notes are joined, and separated
  // only by grace notes, so it is legato by nature.
  chanter: {
    kind: 'reed', wave: 'chanter', range: [66, 81], gain: 0.42, legato: true, glide: 0.012,
    attack: 0.02, release: 0.06, sustainLevel: 0.96, onsetCents: -20, onsetTau: 0.01,
    noise: 0.025, noiseHz: 3200, noiseAttack: 2,
    body: [['highpass', 300, 0.7], ['peaking', 1250, 1.5, 6], ['peaking', 3000, 1.5, 5], ['lowpass', 8000, 0.7]], jitter: 2.5,
  },
  // The drones: cylindrical, single-reed, two a few cents apart. A bed under the
  // tune, 6 dB over the first score's near-inaudible level.
  bagpipe: {
    kind: 'reed', wave: 'droneReed', range: [36, 62], gain: 0.06, courses: 2, spread: 5,
    attack: 0.15, release: 0.3, sustainLevel: 0.95, noise: 0.02, noiseHz: 2400, noiseAttack: 2,
    body: [['highpass', 60, 0.7], ['peaking', 900, 1.4, 4], ['lowpass', 3000, 0.7]], jitter: 1.5,
  },

  // --- lip-reeds ------------------------------------------------------------
  sackbut: {
    kind: 'brass', wave: 'sackbut', range: [40, 72], gain: 0.8,
    attack: 0.04, release: 0.14, sustainLevel: 0.9, bright: [1.4, 4.2], brightVel: 2.5,
    onsetCents: -22, onsetTau: 0.02, noise: 0.015, noiseMul: 3, noiseAttack: 4,
    body: [['highpass', 55, 0.7], ['peaking', 520, 1.2, 3]], jitter: 1.5,
  },
  // The cornett, a curved wooden horn with finger holes, was praised as the
  // instrument nearest the human voice: soft attack, a vocal formant, vibrato.
  cornett: {
    kind: 'brass', wave: 'cornett', range: [57, 84], gain: 0.7,
    attack: 0.05, release: 0.11, sustainLevel: 0.9, bright: [1.8, 4], brightVel: 1.5,
    onsetCents: -35, onsetTau: 0.025, noise: 0.02, noiseHz: 2200, noiseAttack: 2,
    body: [['highpass', 150, 0.7], ['peaking', 1000, 1.5, 4], ['peaking', 2400, 2, 2]],
    vibrato: { rate: 5.2, depth: 9, delay: 0.3, bloom: 0.3 }, jitter: 2,
  },

  // --- recorders and flutes -------------------------------------------------
  recorder: {
    kind: 'wind', wave: 'triangle', range: [60, 91], attack: 0.045, release: 0.09, sustainLevel: 0.9,
    breath: 0.055, filter: { type: 'lowpass', freq: 2300, q: 1.0 },
    vibrato: { rate: 5.0, depth: 3.2, delay: 0.28 }, gain: 0.6,
  },
  flute: {
    kind: 'wind', wave: 'sine', range: [60, 96], attack: 0.07, release: 0.12, sustainLevel: 0.9,
    breath: 0.10, filter: { type: 'lowpass', freq: 2800, q: 0.8 },
    vibrato: { rate: 4.6, depth: 4, delay: 0.3 }, gain: 0.65,
  },
  horn: {                          // hunting/war horn
    kind: 'wind', wave: 'triangle', range: [41, 77], attack: 0.05, release: 0.2, sustainLevel: 0.85,
    breath: 0.03, filter: { type: 'lowpass', freq: 1400, q: 1.4 },
    vibrato: { rate: 4.2, depth: 3, delay: 0.35 }, gain: 0.6,
  },

  // --- organs ---------------------------------------------------------------
  // Pipes speak with a chiff, never vibrate, and each is voiced a hair off.
  portative: {
    kind: 'pipe', range: [60, 88], gain: 0.5,
    ranks: [['principal', 1, 1], ['principal', 2, 0.25]],
    attack: 0.028, release: 0.07, sustainLevel: 1, chiff: 0.35, chiffHarm: 2,
    noise: 0.012, noiseMul: 2, noiseQ: 1.2, noiseAttack: 2, pipeCents: 2.5,
    wobble: { rate: 0.7, cents: 2.5 }, panSpread: 0.2, body: [['highpass', 90, 0.7], ['lowpass', 7000, 0.7]],
  },
  // The positive: a chamber organ on a table, stopped 8' flue (odd partials)
  // with an open 4' and 2' over it.
  positive: {
    kind: 'pipe', range: [36, 84], gain: 0.55,
    ranks: [['gedackt', 1, 1], ['principal', 2, 0.32], ['principal', 4, 0.1]],
    attack: 0.035, release: 0.09, sustainLevel: 1, chiff: 0.45, chiffHarm: 3,
    noise: 0.01, noiseMul: 2, noiseQ: 1.2, noiseAttack: 2, pipeCents: 2,
    wobble: { rate: 0.4, cents: 1 }, panSpread: 0.35, body: [['highpass', 45, 0.7], ['lowpass', 6500, 0.7]],
  },
  // The score's first organ, played low as a bed: a principal with a stopped octave.
  organetto: {
    kind: 'pipe', range: [36, 88], gain: 0.25,
    ranks: [['principal', 1, 1], ['gedackt', 2, 0.3]],
    attack: 0.04, release: 0.12, sustainLevel: 1, chiff: 0.25, chiffHarm: 2,
    noise: 0.008, noiseMul: 2, noiseQ: 1.2, noiseAttack: 2, pipeCents: 2,
    wobble: { rate: 0.6, cents: 1.5 }, panSpread: 0.25, body: [['highpass', 50, 0.7], ['lowpass', 5000, 0.7]],
  },

  // --- symphonia (hurdy-gurdy) ----------------------------------------------
  // A rosined wheel bows the strings continuously; keys stop them, so the tune
  // is joined (legato) and a tangent clicks at each key. `trompette` adds the
  // buzzing bridge the player sets rattling with a jerk of the crank.
  symphonia: {
    kind: 'wheel', wave: 'wheel', range: [43, 79], gain: 0.6, courses: 2, spread: 3,
    attack: 0.03, release: 0.12, sustainLevel: 0.95, legato: true, glide: 0.008,
    click: 0.5, noise: 0.035, noiseHz: 3000, noiseAttack: 1.5,
    wheelAM: { rate: 6, depth: 0.06 }, body: WHEEL_BODY, jitter: 1.5, trompette: 0,
  },
  hurdygurdy: {
    kind: 'wheel', wave: 'wheel', range: [36, 79], gain: 0.11, courses: 3, spread: 6,
    attack: 0.09, release: 0.25, sustainLevel: 0.95, legato: true, glide: 0.008,
    click: 0.2, noise: 0.03, noiseHz: 2600, noiseAttack: 1.5,
    wheelAM: { rate: 5.5, depth: 0.07 }, body: WHEEL_BODY, jitter: 1.5, trompette: 0.25,
  },

  // --- voices ---------------------------------------------------------------
  // Two singers to a part by default (a small schola); a layer may say
  // `section: 1` for a true soloist.
  voiceBass: { ...SINGER, register: 'bass', range: [38, 64], gain: 0.9, vowel: 'o', vibrato: { rate: 4.8, depth: 13, delay: 0.5, bloom: 0.5 } },
  voiceTenor: { ...SINGER, register: 'tenor', range: [48, 69], gain: 0.85, vowel: 'a' },
  voiceAlto: { ...SINGER, register: 'alto', range: [53, 77], gain: 0.8, vowel: 'a', vibrato: { rate: 5.2, depth: 13, delay: 0.42, bloom: 0.45 } },
  voiceTreble: { ...SINGER, register: 'treble', range: [60, 81], gain: 0.72, vowel: 'a', formantShift: 1.06, ring: 2, breath: 0.08,
    vibrato: { rate: 5.4, depth: 11, delay: 0.4, bloom: 0.45 }, scoop: 20 },
  // Sections: each note sung by several, a few cents apart, a few ms apart,
  // seated across the stalls, breathing in turn through long chords.
  choirMen: { ...SINGER, registers: ['bass', 'tenor'], splits: [52], range: [38, 69], gain: 0.85, vowel: 'a',
    section: 5, detuneCents: 10, smear: 0.045, width: 0.55, jitter: 7 },
  choirFull: { ...SINGER, registers: ['bass', 'tenor', 'alto', 'treble'], splits: [50, 59, 67], range: [40, 81], gain: 0.8, vowel: 'a',
    section: 6, detuneCents: 11, smear: 0.05, width: 0.65, jitter: 7 },
  // The score's first choir: the full section, humming on a closed 'o'.
  choir: { ...SINGER, registers: ['bass', 'tenor', 'alto', 'treble'], splits: [50, 59, 67], range: [40, 81], gain: 0.23, vowel: 'o',
    section: 5, detuneCents: 10, smear: 0.05, width: 0.6, attack: 0.22, release: 0.45 },

  // --- the orchestra --------------------------------------------------------
  //
  // The consort above is a handful of players in a room, which is right for a
  // tavern and thin for a dragon. These are SECTIONS: `section: n` voices the
  // note n times, each a few cents out, each starting a few milliseconds late,
  // each panned to its own seat. That smear is the entire difference between a
  // synth pad and "the strings came in" — sixteen violinists are not one violin
  // played louder. `wave` names a harmonic spectrum in synth.js.

  strings: {                       // violins I+II together — the main singing line
    kind: 'bow', wave: 'violin', range: [55, 100], section: 7, detuneCents: 9, smear: 0.03, width: 0.62,
    attack: 0.16, release: 0.34, sustainLevel: 0.92,
    filter: { type: 'lowpass', freq: 3600, q: 0.7 },
    vibrato: { rate: 5.4, depth: 5, delay: 0.35 }, gain: 0.5,
  },
  stringsHigh: {                   // violins alone, up in the light
    kind: 'bow', wave: 'violin', range: [60, 103], section: 6, detuneCents: 7, smear: 0.024, width: 0.7,
    attack: 0.13, release: 0.28, sustainLevel: 0.9,
    filter: { type: 'lowpass', freq: 4800, q: 0.6 },
    vibrato: { rate: 5.8, depth: 6, delay: 0.3 }, gain: 0.4,
  },
  violas: {
    kind: 'bow', wave: 'viola', range: [48, 88], section: 5, detuneCents: 10, smear: 0.03, width: 0.4,
    attack: 0.17, release: 0.32, sustainLevel: 0.9,
    filter: { type: 'lowpass', freq: 2400, q: 0.9 },
    vibrato: { rate: 5.0, depth: 4, delay: 0.36 }, gain: 0.44,
  },
  celli: {
    kind: 'bow', wave: 'cello', range: [36, 76], section: 5, detuneCents: 8, smear: 0.032, width: 0.34,
    attack: 0.19, release: 0.4, sustainLevel: 0.92,
    filter: { type: 'lowpass', freq: 1500, q: 0.9 },
    vibrato: { rate: 4.6, depth: 4, delay: 0.4 }, gain: 0.56,
  },
  basses: {                        // the floor everything else stands on
    kind: 'bow', wave: 'contrabass', range: [28, 60], section: 4, detuneCents: 7, smear: 0.036, width: 0.24,
    attack: 0.22, release: 0.45, sustainLevel: 0.94,
    filter: { type: 'lowpass', freq: 700, q: 0.8 },
    vibrato: { rate: 4.0, depth: 3, delay: 0.5 }, gain: 0.62,
  },
  pizzicato: {                     // the same players, plucking
    kind: 'pluck', wave: 'cello', range: [28, 84], section: 4, detuneCents: 8, smear: 0.014, width: 0.4,
    attack: 0.003, decay: 0.5, curve: 3.0,
    filter: { type: 'lowpass', freq: 2600, q: 1.0, sweepTo: 700, sweepDur: 0.35 },
    click: 0.06, gain: 0.5,
  },
  horns: {                         // the heroic sound: four horns in unison
    kind: 'bow', wave: 'horn', range: [34, 77], section: 4, detuneCents: 6, smear: 0.026, width: 0.36,
    attack: 0.10, release: 0.3, sustainLevel: 0.9,
    filter: { type: 'lowpass', freq: 1900, q: 0.9 },
    vibrato: { rate: 4.4, depth: 2.5, delay: 0.45 }, gain: 0.55,
  },
  trumpets: {
    kind: 'bow', wave: 'trumpet', range: [52, 84], section: 3, detuneCents: 5, smear: 0.016, width: 0.3,
    attack: 0.045, release: 0.2, sustainLevel: 0.9,
    filter: { type: 'lowpass', freq: 3400, q: 1.0 },
    vibrato: { rate: 5.2, depth: 3, delay: 0.4 }, gain: 0.36,
  },
  trombones: {
    kind: 'bow', wave: 'trombone', range: [34, 72], section: 3, detuneCents: 6, smear: 0.022, width: 0.3,
    attack: 0.07, release: 0.26, sustainLevel: 0.92,
    filter: { type: 'lowpass', freq: 2000, q: 0.9 },
    gain: 0.46,
  },
  tuba: {
    kind: 'bow', wave: 'tuba', range: [26, 58], section: 2, detuneCents: 5, smear: 0.03, width: 0.2,
    attack: 0.11, release: 0.34, sustainLevel: 0.94,
    filter: { type: 'lowpass', freq: 620, q: 0.8 }, gain: 0.6,
  },
  oboeSolo: {                      // one player: no section, no smear
    kind: 'wind', wave: 'oboe', range: [58, 91], attack: 0.055, release: 0.13, sustainLevel: 0.9,
    breath: 0.03, filter: { type: 'lowpass', freq: 3000, q: 1.1 },
    vibrato: { rate: 5.5, depth: 5, delay: 0.25 }, gain: 0.34,
  },
  clarinetSolo: {
    kind: 'wind', wave: 'clarinet', range: [50, 91], attack: 0.05, release: 0.14, sustainLevel: 0.92,
    breath: 0.035, filter: { type: 'lowpass', freq: 2600, q: 0.9 },
    vibrato: { rate: 4.8, depth: 3, delay: 0.3 }, gain: 0.38,
  },
  bassoonSolo: {
    kind: 'wind', wave: 'bassoon', range: [34, 75], attack: 0.06, release: 0.16, sustainLevel: 0.9,
    breath: 0.03, filter: { type: 'lowpass', freq: 1400, q: 1.0 },
    vibrato: { rate: 4.4, depth: 3, delay: 0.35 }, gain: 0.42,
  },
  fluteSolo: {
    kind: 'wind', wave: 'flute', range: [60, 96], attack: 0.075, release: 0.15, sustainLevel: 0.9,
    breath: 0.11, filter: { type: 'lowpass', freq: 3400, q: 0.7 },
    vibrato: { rate: 5.0, depth: 4.5, delay: 0.3 }, gain: 0.5,
  },
  woodwinds: {                     // flutes and clarinets doubling, as a pad
    kind: 'wind', wave: 'clarinet', range: [48, 96], section: 4, detuneCents: 7, smear: 0.028, width: 0.5,
    attack: 0.09, release: 0.2, sustainLevel: 0.9,
    breath: 0.05, filter: { type: 'lowpass', freq: 2800, q: 0.8 },
    vibrato: { rate: 4.9, depth: 3, delay: 0.34 }, gain: 0.34,
  },
  pad: {                           // low sustained fifth, felt more than heard
    kind: 'organ', range: [24, 72], partials: [[1, 1], [2, 0.22], [3, 0.07]],
    attack: 0.6, release: 0.9, sustainLevel: 0.8,
    filter: { type: 'lowpass', freq: 700, q: 0.7 }, gain: 0.34,
  },

  // --- bells ----------------------------------------------------------------
  bells: { kind: 'rbell', ...BELL_TOWER, range: [43, 84], ring: -1, gain: 1 },
  handbells: { kind: 'rbell', ...HANDBELL, range: [60, 96], ring: -1, gain: 0.9 },
  bell: { kind: 'rbell', ...BELL_TOWER, range: [36, 96], ring: -1, gain: 0.39 },
  chime: { kind: 'rbell', ...HANDBELL, maxDecay: 2.5, range: [60, 100], ring: -1, gain: 0.39 },
};

// ─────────────────────────────────────────────────────────────────────────────
// TRACKS
// ─────────────────────────────────────────────────────────────────────────────

export const TRACKS = {

  // ── TITLE — "The Sword Coast" ─────────────────────────────────────────────
  // A slow Aeolian ballad for solo vielle over a lute. Noble, cold, a little sad:
  // the sound of the North before you have done anything worth singing about.
  title: {
    title: 'The Sword Coast', contexts: ['title'], weight: 1,
    bpm: 66, loopBars: 8, gain: 0.92,
    layers: [
      { name: 'melody', inst: 'vielle', gain: 0.34, pattern: [
        ...tune(A3 + 12, 'aeolian', 0, [
          [1, 6], [2, 2], [3, 4], [2, 4],
          [1, 6], [7 - 7, 2], [1, 8],
          [3, 4], [4, 4], [5, 6], [4, 2],
          [3, 8], [null, 8],
          [5, 6], [6, 2], [5, 4], [4, 4],
          [3, 6], [2, 2], [1, 8],
          [1, 4], [2, 4], [3, 4], [2, 4],
          [1, 12], [null, 4],
        ]),
      ] },
      { name: 'lute', inst: 'lute', gain: 0.30, pattern: [
        ...pluckFig(A3, 'aeolian', 8, [1, 5, 8, 5], { pattern: [0, 4, 8, 12], dur: 4, vol: 0.75,
          shift: [0, 0, -4, -4, 3, 3, 0, 0] }),
      ] },
      { name: 'bass', inst: 'viol', gain: 0.30, pattern: [
        ...drone(A3 - 12, 2, { dur: SPB, vol: 0.8 }),
        ...drone(A3 - 12 - 4, 2, { dur: SPB, vol: 0.8 }).map(([s, n, d, v]) => [s + 32, n, d, v]),
        ...drone(A3 - 12 + 3, 2, { dur: SPB, vol: 0.8 }).map(([s, n, d, v]) => [s + 64, n, d, v]),
        ...drone(A3 - 12, 2, { dur: SPB, vol: 0.8 }).map(([s, n, d, v]) => [s + 96, n, d, v]),
      ] },
      { name: 'perc', wave: 'noise', gain: 0.16,
        pattern: beat(8, [0], 'frame', 0.34).concat(beat(8, [10], 'frame', 0.16)) },
    ],
  },

  // ── TOWN — "The Carters' Ductia" ──────────────────────────────────────────
  // Form:   a ductia, the quick textless dance Grocheio heard in Paris streets
  //         about 1300: two puncta, each played twice, sharing an open
  //         ending that stops on the F chord and a closed one that comes home
  //         to G the Mixolydian way, up from the flat seventh with no
  //         leading tone. Each punctum grows as it repeats: the rebec's
  //         counter joins the second time, the pipe's descant over the second
  //         punctum. Original.
  // Mode:   G Mixolydian, swinging between G and F the way the old dances do,
  //         4/4, walking pace for a cart.
  // Voices: symphonia (tune), rebec (counter), recorder (descant), lute
  //         (bass on the beat, the fifth off it), tabor.
  // Plays:  the market towns: Phandalin, Daggerford, Beregost, Nashkel, and
  //         Rivington below Baldur's Gate.
  town: (() => {
    const o = { beat: 8, weak: 0.82 };
    const tuneI = line('G4:2 A4 B4 G4 D5:4 B4 | C5:2 A4 F4 A4 B4 A4 G4:4 | D5:4 B4:2 G4 E5:4 C5 | A4:2 C5 F5 C5 D5:4 B4', o);
    const tuneII = line('E5:2 F5 G5:4 E5:2 D5 C5:4 | D5:2 C5 B4 C5 D5:4 G4 | A4:2 G4 A4 C5 F5:4 C5 | E5:2 D5 C5 E5 D5:4 B4', o);
    const tuneO = line('E5:2 D5 C5 E5 F5:8', o), tuneC = line('A4:2 C5 A4 F4 G4:8', o);
    const v = { beat: 8, vol: 0.72, weak: 0.85 };
    const ctrI = line('D4:8 B4 | A4 G4 | B4 C5 | C5 B4', v), ctrII = line('G4:8 C5 | B4 G4 | C5 A4 | C5 B4', v);
    const ctrO = line('C5:8 A4', v), ctrC = line('C5:8 B4', v);
    const d = { beat: 8, vol: 0.6 };
    const desII = line('G5:16 | G5 | A5 | G5', d), desO = line('G5:8 A5', d), desC = line('A5:8 G5', d);
    const b = { beat: 8, weak: 0.6 };
    const bassI = line('G2:4 D3 G2 D3 | F2 C3 G2 D3 | G2 D3 C3 G3 | F2 C3 G2 D3', b);
    const bassII = line('C3:4 G3 C3 G3 | G2 D3 G2 D3 | F2 C3 F2 C3 | C3 G3 G2 D3', b);
    const bassO = line('C3:4 G3 F2 C3', b), bassC = line('F2:4 C3 G2:8', b);
    const kit = { T: ['tabor', 0.5], t: ['tabor', 0.24], k: ['click', 0.12] };
    const g = 'T..tT.t.T..tT.t.', end = 'T..tT.t.T...T...';
    const punctum = drums(kit, g, g, g, g, end);
    const P = tuneI.len + tuneO.len;
    return {
      title: "The Carters' Ductia", contexts: ['town'], weight: 1.2, room: 'open', pulse: 8,
      bpm: 112, loopBars: 4 * P / SPB, gain: 0.9,
      layers: [
        { name: 'tune', inst: 'symphonia', gain: 0.5, pan: 0.1, humanize: 6, pattern: seq(tuneI, tuneO, tuneI, tuneC, tuneII, tuneO, tuneII, tuneC) },
        { name: 'counter', inst: 'rebec', gain: 0.4, pan: -0.35, humanize: 8, pattern: seq(P, ctrI, ctrC, ctrII, ctrO, ctrII, ctrC) },
        { name: 'descant', inst: 'recorder', gain: 0.24, pan: 0.4, humanize: 10, pattern: seq(2 * P, desII, desO, desII, desC) },
        { name: 'bass', inst: 'lute', gain: 0.36, pan: -0.15, humanize: 6, pattern: seq(bassI, bassO, bassI, bassC, bassII, bassO, bassII, bassC) },
        { name: 'drum', wave: 'noise', gain: 1, pan: 0.05, pattern: times(punctum, 4) },
      ],
    };
  })(),

  // ── FIELD — "The Triboar Trail" ───────────────────────────────────────────
  // Form:   an estampie of three puncta, each played twice, first with the
  //         open ending (up to E over a C chord, which leaves the question
  //         hanging) and then the closed one (the raised C# pulling home to
  //         D). The vielle has the tune and the lute walks the bass under it;
  //         the recorder joins with a counter in half-notes the second time
  //         the first punctum comes round and stays for the second. For the
  //         third punctum the vielle hands its tune to a bagpipe chanter over
  //         the pipe's own drone and drops beneath it to play the counter, the
  //         way a band on the road swaps parts to rest its arms. Original.
  // Mode:   D Dorian, 4/4, a walking pace.
  // Voices: vielle (tune, then counter), recorder (counter), chanter (tune of
  //         the third punctum), bagpipe drone, lute (bass), tabor.
  // Plays:  the open country and the roads between towns: the Triboar Trail,
  //         the High Road, the Trade Way, the moors in daylight.
  field: (() => {
    const o = { beat: 8, weak: 0.82 };
    const [tuneI, tuneII, tuneIII] = [
      'D5:4 F5:2 E5 D5:4 A4 | E5:4 C5:2 D5 C5:4 G4 | A4:2 C5 F5:4 E5:2 D5 C5:4 | D5:2 E5 F5 D5 E5:4 C5',
      'A5:4 G5:2 F5 C5:4 E5 | F5:2 G5 A5 F5 D5:4 B4 | E5:2 D5 C5 E5 A5:4 E5 | F5:2 E5 D5 F5 E5:4 C5',
      'A4:2 D5 D5 E5 F5:4 D5 | E5:2 D5 C5 D5 E5:4 A4 | F5:2 E5 D5 C5 A4:4 G4 | A4:2 G4 A4 C5 E5:4 D5',
    ].map((s) => line(s, o));
    const ouv = line('F5:4 E5:2 D5 C5:4 D5 | E5:16', o), clos = line('F5:4 E5:2 D5 E5:4 C#5 | D5:16', o);
    const c = { beat: 8, vol: 0.75, weak: 0.9 };
    const [ctrI, ctrII, ctrIII] = ['A4:8 F4 | G4 E4 | F4 E4 | F4 C5', 'C5:8 G4 | A4 B4 | G4 C5 | A4 E4',
      'F4:8 A4 | E4 C5 | C5 E4 | F4 E4'].map((s) => line(s, c));
    const ctrO = line('D4:8 G4 | E4:16', c), ctrC = line('A4:8 C#5 | D5:16', c);
    const b = { beat: 8, weak: 0.7 };
    const [bassI, bassII, bassIII] = ['D3:4 A2 D3 A2 | C3 G2 C3 G2 | F2 C3 C3 G2 | D3 A2 A2 E3',
      'F2:4 C3 C3 G2 | F2 C3 G2 D3 | C3 G2 A2 E3 | D3 A2 C3 G2',
      'D3:4 A2 D3 A2 | C3 G2 A2 E3 | F2 C3 C3 G2 | D3 A2 C3 G2'].map((s) => line(s, b));
    const bassO = line('D3:4 A2 C3 G2 | C3:16', b), bassC = line('D3:4 A2 A2:8 | D3:16', b);
    const P = tuneI.len + ouv.len;
    const both = (x, y, O, C) => seq(x, O, y, C);
    const kit = { T: ['tabor', 0.5], t: ['tabor', 0.24], f: ['frame', 0.2] };
    const g = 'T..tT.t.T..tf.t.', end = 'T...T...T.t.T...';
    return {
      title: 'The Triboar Trail', contexts: ['field', 'road', 'travel'], weight: 1.2, room: 'open', pulse: 8,
      bpm: 108, loopBars: 6 * P / SPB, gain: 0.9,
      layers: [
        { name: 'vielle', inst: 'vielle', gain: 0.7, pan: 0.15, humanize: 6,
          pattern: seq(both(tuneI, tuneI, ouv, clos), both(tuneII, tuneII, ouv, clos)) },
        { name: 'counter', inst: 'vielle', gain: 0.4, pan: 0.15, humanize: 6, pattern: seq(4 * P, both(ctrIII, ctrIII, ctrO, ctrC)) },
        { name: 'recorder', inst: 'recorder', gain: 0.17, pan: 0.4, humanize: 10,
          pattern: seq(P, ctrI, ctrC, both(ctrII, ctrII, ctrO, ctrC)) },
        { name: 'chanter', inst: 'chanter', gain: 0.3, pan: -0.3, humanize: 5, pattern: seq(4 * P, both(tuneIII, tuneIII, ouv, clos)) },
        { name: 'drone', inst: 'bagpipe', gain: 0.16, pan: -0.3, pattern: seq(4 * P, line('D3:96 D3:96', { vol: 0.55 })) },
        { name: 'lute', inst: 'lute', gain: 0.28, pan: -0.1, humanize: 6,
          pattern: seq(both(bassI, bassI, bassO, bassC), both(bassII, bassII, bassO, bassC), both(bassIII, bassIII, bassO, bassC)) },
        { name: 'drum', wave: 'noise', gain: 1.8, pan: 0.05, pattern: times(drums(kit, g, g, g, g, g, end), 6) },
      ],
    };
  })(),

  // ── BATTLE — "The Sellswords' Estampie" ───────────────────────────────────
  // Form:   an estampie of three puncta, each played with its open ending
  //         (onto a bright A-major chord) and then its closed one (A to D,
  //         the leading tone raised). The string band that marches with a
  //         free company rather than the alta capella of a lord: rebec on the
  //         tune in driving quavers, the vielle a tenor counter in half-notes,
  //         gittern chopping the off-beats, viol hammering the roots. The
  //         third punctum sinks lower and a shawm doubles the rebec for it.
  //         Original.
  // Mode:   D Dorian, 4/4, fast.
  // Voices: rebec (tune), shawm (doubling, third punctum), vielle (counter),
  //         gittern (off-beat chords), viol (roots), war drum, tabor, nakers.
  // Plays:  a proper fight (intensity 2): bandits on the Trade Way, a patrol
  //         that will not be talked down.
  battle: (() => {
    const o = { beat: 8, weak: 0.84 };
    const body = [
      'D5:2 D5 F5 D5 A5 G5 F5 E5 | E5 C5 G5 E5 F5 E5 D5 A4 | F5 A5 C6 A5 E5 G5 C5 E5',
      'A5:2 G5 F5 A5 C6 A5 F5 A5 | G5 B5 D6 B5 C6 G5 E5 G5 | F5 E5 D5 F5 E5 C5 A4 C5',
      'D5:2 A4 D5 F5 E5 C5 G4 C5 | F5 D5 A4 D5 D5 B4 G4 B4 | E5 G5 E5 C5 F5 A5 F5 C5',
    ].map((s) => line(s, o));
    const ouv = line('B4:2 C#5 D5 B4 C#5:8', o), clos = line('E5:2 D5 C#5 E5 D5:8', o);
    const c = { beat: 8, vol: 0.78, weak: 0.9 };
    const ctr = ['A4:8 F4 | G4 F4 | A4 E4', 'C5:8 A4 | B4 E4 | A4 A4', 'F4:8 G4 | F4 G4 | G4 A4'].map((s) => line(s, c));
    const ctrO = line('G#4:8 A4', c), ctrC = line('A4:16', c);
    const b = { beat: 8, weak: 0.78 };
    const bass = ['D3:4 D3 D3 D3 | C3 C3 D3 D3 | F2 F2 C3 C3', 'F2:4 F2 F2 F2 | G2 G2 E2 E2 | D3 D3 C3 C3',
      'D3:4 D3 C3 C3 | D3 D3 G2 G2 | C3 C3 F2 F2'].map((s) => line(s, b));
    const bassO = line('E2:4 E2 A2:8', b), bassC = line('A2:4 A2 D3:8', b);
    // Off-beat chops: a dyad on the second and fourth quaver of every half-bar.
    const DYAD = { Dm: 'D4+A4', C: 'C4+G4', F: 'C4+F4', G: 'B3+D4', Am: 'C4+E4', E: 'G#3+B3', A: 'A3+C#4' };
    const chop = (s) => line(s.split(' ').map((ch) => `r:2 ${DYAD[ch]}:2 r:2 ${DYAD[ch]}:2`).join(' '), { vol: 0.7, beat: 4, weak: 0.8 });
    const chops = ['Dm Dm C Dm F C', 'F F G C Dm Am', 'Dm C Dm G C F'].map(chop);
    const chopO = chop('E A'), chopC = chop('A Dm');
    const kit = { W: ['wardrum', 0.62], T: ['tabor', 0.42], t: ['tabor', 0.2], N: ['nakers', 0.45], n: ['nakersHi', 0.3] };
    const g = 'W.t.T.t.W.t.T.tt', end = 'W.t.T.t.N.nnN.n.';
    const pdrum = drums(kit, g, g, g, end, g, g, g, end);
    const punctum = (i, parts, O, C) => seq(parts[i], O, parts[i], C);
    const all = (parts, O, C) => seq(punctum(0, parts, O, C), punctum(1, parts, O, C), punctum(2, parts, O, C));
    const tune = all(body, ouv, clos);
    return {
      title: "The Sellswords' Estampie", contexts: ['battle'], weight: 1.2, intensity: 2, room: 'open', pulse: 8,
      bpm: 144, loopBars: tune.len / SPB, gain: 0.95,
      layers: [
        { name: 'rebec', inst: 'rebec', gain: 0.55, pan: 0.2, humanize: 5, pattern: tune },
        { name: 'shawm', inst: 'shawmAlto', gain: 0.32, pan: 0.3, humanize: 5,
          pattern: seq(2 * punctum(0, body, ouv, clos).len, punctum(2, body, ouv, clos)) },
        { name: 'vielle', inst: 'vielle', gain: 0.45, pan: -0.25, humanize: 6, pattern: all(ctr, ctrO, ctrC) },
        { name: 'gittern', inst: 'gittern', gain: 0.6, pan: 0.45, humanize: 4, pattern: all(chops, chopO, chopC) },
        { name: 'viol', inst: 'viol', gain: 0.4, pan: -0.1, humanize: 4, pattern: all(bass, bassO, bassC) },
        { name: 'drum', wave: 'noise', gain: 1, pan: -0.05, pattern: times(pdrum, 3) },
      ],
    };
  })(),

  // ── BOSS — "The Warlord's Hour" ───────────────────────────────────────────
  // Form:   a battaglia for the alta capella, the loud band a lord kept for
  //         war and ceremony: the shawm sounds trumpet calls on repeated notes
  //         over a pounding tonic, then a strain that drives down the Phrygian
  //         tetrachord A-G-F-E. Every phrase ends on the Phrygian cadence, the
  //         bass falling a semitone F to E while the tenor shawm rises D to E,
  //         the oldest "this is final" in European music. Played twice; the
  //         second time a cornett doubles the calls, a dulcian doubles the
  //         bass and a tower bell tolls each strain in. Original.
  // Mode:   E Phrygian, 4/4, a hard march.
  // Voices: alto shawm (calls), tenor shawm (counter), sackbut (bass),
  //         cornett and dulcian (doubling, second time), bell, war drum and
  //         nakers.
  // Plays:  the named foe: a warlord, a bandit captain, a cult's champion.
  boss: (() => {
    const o = { beat: 8, weak: 0.84 };
    const callA = line('E5:2 E5 E5 B4 E5:4 G5 | F5:2 F5 F5 D5 G5:4 E5 | E5:2 E5 E5 B4 E5:2 F5 G5 A5 | A5:4 G5:2 F5 E5:8 | '
      + 'C5:2 C5 C5 A4 E5:4 C5 | B4:2 B4 B4 G4 E5:4 G5 | E5:2 D5 C5 E5 D5:2 F5 A5 F5 | A5:4 G5:2 F5 E5:8', o);
    const callB = line('C5:2 B4 C5 E5 A5:2 G5 A5 E5 | B4:2 D5 G5 D5 B4:2 C5 D5 B4 | A4:2 C5 F5 C5 A4:2 G4 A4 C5 | G4:2 A4 B4 G4 E5:8 | '
      + 'C5:2 B4 C5 E5 G5:4 E5 | B4:2 C5 D5 B4 F5:4 D5 | C5:2 D5 E5 C5 A4:4 D5 | A4:4 G4:2 F4 E4:8', o);
    const c = { beat: 8, vol: 0.8, weak: 0.9 };
    const ctrA = line('B3:8 G4 | F4 B4 | G4 B4 | D4 E4 | E4 A4 | D4 C4 | G4 F4 | D4 E4', c);
    const ctrB = line('E4:16 | G4:8 D4 | F4 C4 | E4 B3 | C4 E4 | D4:16 | A4:8 F4 | D4 E4', c);
    const b = { beat: 8, weak: 0.75 };
    const bassA = line('E2:4 B2 E2 B2 | D3 A2 E2 B2 | E2 B2 E2 B2 | F2 C3 E2:8 | A2:4 E3 A2 E3 | G2 D3 C3 G2 | C3 G2 D3 A2 | F2 C3 E2:8', b);
    const bassB = line('A2:4 E3 A2 E3 | G2 D3 G2 D3 | F2 C3 F2 C3 | E2 B2 E2 B2 | A2 E3 C3 G2 | G2 D3 D3 A2 | F2 C3 D3 A2 | F2 C3 E2:8', b);
    const H = callA.len + callB.len;
    const kit = { W: ['wardrum', 0.72], N: ['nakers', 0.46], n: ['nakersHi', 0.3], T: ['timp', 0.5] };
    const a = 'W.n.N.n.W.n.N.nn', ca = 'W.n.N.n.W...T...', d = 'W.nnN.nnW.nnN.nn', cd = 'W.nnN.nnW...TTTT';
    const half = drums(kit, a, a, a, ca, a, a, a, ca, d, d, d, cd, d, d, d, cd);
    return {
      title: "The Warlord's Hour", contexts: ['boss'], weight: 1.2, intensity: 3, room: 'hall', pulse: 8,
      bpm: 120, loopBars: 2 * H / SPB, gain: 0.95,
      layers: [
        { name: 'calls', inst: 'shawmAlto', gain: 0.6, pan: 0.2, humanize: 4, pattern: times(seq(callA, callB), 2) },
        { name: 'cornett', inst: 'cornett', gain: 0.2, pan: 0.35, humanize: 5, pattern: seq(H, callA, callB) },
        { name: 'counter', inst: 'shawmTenor', gain: 0.34, pan: -0.25, humanize: 5, pattern: times(seq(ctrA, ctrB), 2) },
        { name: 'bass', inst: 'sackbut', gain: 0.3, pan: -0.05, humanize: 4, pattern: times(seq(bassA, bassB), 2) },
        { name: 'dulcian', inst: 'dulcian', gain: 0.24, pan: -0.35, humanize: 5, pattern: seq(H, bassA, bassB) },
        { name: 'bell', inst: 'bells', gain: 0.4, pan: 0.1, pattern: seq(H, line('E3:32 r:96 E3:32 r:96', { vol: 0.7 })) },
        { name: 'drum', wave: 'noise', gain: 1, pan: -0.05, pattern: times(half, 2) },
      ],
    };
  })(),

  // ── DUNGEON — "Beneath the Old Stones" ────────────────────────────────────
  // Form:   a tenor in long notes, one to a bar, walking down from D to the
  //         D an octave below, with a duplum above it in half-notes that
  //         keeps stopping to listen; a struck psaltery answers every fourth
  //         bar with a falling figure, like water finding its way down. It
  //         closes with the old double-leading-tone cadence (E to D in the
  //         tenor, C# to D and G# to A above), the sound the oldest stones in
  //         the Realms were built to. In the second half a bass voice hums the
  //         tenor, as if the walls had learned it. Original.
  // Mode:   D Dorian, 4/4, slow.
  // Voices: viol (tenor), vielle (duplum), psaltery (answers), bass voice
  //         (hum), drips and a far-off gong.
  // Plays:  dungeons and delves: Wave Echo Cave, Cragmaw Castle's cellars,
  //         the Redbrand hideout, barrows and old keeps.
  dungeon: (() => {
    const tenor = line('D3:16 | F3 | E3 | D3 | C3 | D3 | A2 | A2 | G2 | A2 | F2 | G2 | E2 | F2 | E2 | D2', { vol: 0.8, beat: 16 });
    const duplum = line('r:8 A4:8 | A4 C5 | G4 B4 | F4:12 r:4 | E4:8 G4 | F4:16 | E4:8 C5 | A4:12 r:4 | '
      + 'B4:8 D5 | C5 E5 | A4 C5 | B4 D5 | G4 B4 | A4 C5 | G4 C#5 | D5:16', { vol: 0.75, beat: 8, weak: 0.85 });
    const drop = (s) => line(s, { vol: 0.7, beat: 8, weak: 0.85 });
    const psaltery = seq(2 * SPB, drop('r:4 G5:2 F5 E5:4 r:4 | A4:4 r:12'), 2 * SPB, drop('r:4 A5:2 G5 E5:4 r:4 | C5:4 r:12'),
      2 * SPB, drop('r:4 A5:2 G5 F5:4 r:4 | D5:4 r:12'), 2 * SPB, drop('r:4 B4:2 A4 G#4:4 r:4 | A4:8 r:8'));
    const hum = sing(seq(8 * SPB, line('G2:16 | A2 | F2 | G2 | E2 | F2 | E2 | D2', { vol: 0.6, beat: 16 })), 'u u o u o u o u');
    return {
      title: 'Beneath the Old Stones', contexts: ['dungeon'], weight: 1.2, room: 'cave', pulse: 8,
      bpm: 64, loopBars: 16, gain: 0.72,
      layers: [
        { name: 'tenor', inst: 'viol', gain: 0.3, pan: -0.2, pattern: tenor },
        { name: 'duplum', inst: 'vielle', gain: 0.5, pan: 0.2, humanize: 10, pattern: duplum },
        { name: 'psaltery', inst: 'psalteryStruck', gain: 0.45, pan: 0.45, humanize: 8, pattern: psaltery },
        { name: 'hum', inst: 'voiceBass', vowel: 'u', gain: 0.16, pan: -0.1, humanize: 12, pattern: hum },
        { name: 'water', wave: 'noise', gain: 0.5, pattern: [...hits([22, 71, 118, 165, 203, 237], 'drip', 0.4),
          ...hits([0, 128], 'gong', 0.14, 8)] },
      ],
    };
  })(),

  // ── VICTORY ───────────────────────────────────────────────────────────────
  // Short Mixolydian flourish: shawms and bells, the sound of a gate opening.
  victory: {
    title: 'The Gate Opens', contexts: ['victory'], weight: 1,
    bpm: 120, loopBars: 2, gain: 1,
    layers: [
      { name: 'fanfare', inst: 'shawm', gain: 0.34, pattern: [
        ...tune(G4, 'mixolydian', 0, [[1, 2], [3, 2], [5, 2], [8, 6], [7, 2], [8, 8], [null, 8]]),
      ] },
      { name: 'harmony', inst: 'horn', gain: 0.24, pattern: [
        ...tune(G3, 'mixolydian', 0, [[1, 6], [5, 2], [8, 8], [5, 8], [1, 8]]),
      ] },
      { name: 'bells', inst: 'bell', gain: 0.24, pattern: hits([0, 8, 16], 79, 0.6, 8).concat(hits([16], 74, 0.4, 8)) },
      { name: 'perc', wave: 'noise', gain: 0.26, pattern: beat(2, [0, 8], 'tabor', 0.5) },
    ],
  },

  // ── INN — "The Stonehill Common Room" ─────────────────────────────────────
  // Form:   a lute duet over a tenor, the way a fifteenth-century pair played
  //         for a hall: the tenorista holds the tune's foundation in plucked
  //         half-notes and his partner divides a discant above it. Sixteen
  //         bars in two strains (an open cadence on A, closes on C and on D,
  //         each a sixth opening to the octave). Played twice: the second
  //         time a recorder takes the discant, the first lute drops to a
  //         contratenor and a viol draws the tenor under them, so the room's
  //         music thickens as the evening does. Original.
  // Mode:   D Dorian, the closes with their double leading tones (C# and G#
  //         to D, F# to G), 4/4, unhurried.
  // Voices: lute (discant, then contratenor), lute (tenor), recorder, viol.
  // Plays:  inns: the Stonehill, the Way Inn, the Friendly Arm's common room,
  //         every guest floor upstairs. Meant to be half-heard behind talk.
  inn: (() => {
    const discant = line('A4:4 B4 C5 A4 | G4 E4 F4 A4 | C5 A4 B4 D5 | B4 G#4 A4:8 | C5:4 D5 E5 C5 | D5 B4 C5 A4 | '
      + 'B4 D5 C5 A4 | B4 C#5 D5:8 | A4:4 C5 B4:8 | E5:4 C5 D5 A4 | B4 G4 C5 G4 | A4 B4 C5:8 | '
      + 'G4:4 C5 A4 F4:2 G4 | B4:4 D5 C5 E5 | D5 A4 B4 C#5 | D5:16', { beat: 8, weak: 0.78 });
    const tenor = line('D3:8 F3 | E3 D3 | F3 G3 | B3 A3 | A3 C4 | B3 A3 | G3 F3 | E3 D3 | '
      + 'F3 G3 | A3 F3 | G3 E3 | D3 C3 | E3 F3 | G3 A3 | F3 E3 | D3:16', { beat: 16, weak: 0.85 });
    const contra = line('A3:8 A3 | B3 D4 | A3 B3 | E3 A2 | E4 E4 | G3 A3 | D4 A3 | G#3 A3 | '
      + 'A3 D4 | C4 A3 | D4 G3 | F#3 G3 | C4 C4 | B3 E4 | A3 G#3 | A3:16', { beat: 16, weak: 0.85 });
    const pass = discant.len;
    return {
      title: 'The Stonehill Common Room', contexts: ['inn'], weight: 1.2, room: 'tavern', pulse: 8,
      bpm: 72, loopBars: 2 * pass / SPB, gain: 0.9,
      layers: [
        { name: 'discant', inst: 'lutePlucked', gain: 0.5, pan: 0.3, humanize: 10, pattern: seq(discant, pass) },
        { name: 'contra', inst: 'lutePlucked', gain: 0.36, pan: 0.3, humanize: 10, pattern: seq(pass, contra) },
        { name: 'tenor', inst: 'lute', gain: 0.4, pan: -0.3, humanize: 10, pattern: times(tenor, 2) },
        { name: 'recorder', inst: 'recorder', gain: 0.3, pan: 0.1, humanize: 12, ornament: 'grace', pattern: seq(pass, discant) },
        { name: 'viol', inst: 'viol', gain: 0.26, pan: -0.15, pattern: seq(pass, tenor) },
      ],
    };
  })(),

  // ── SHOP — "The Chandler's Branle" ────────────────────────────────────────
  // Form:   a branle double set in four parts the way the Paris and Antwerp
  //         printers set their dances: the tune on top, the harmony moving in
  //         half-notes under it, root-position closes. Two strains of eight
  //         bars, each played twice; the psaltery joins with the altus on the
  //         repeats. The first strain opens on G and closes on C, the second
  //         turns to G through its D-major chord and comes home. Original.
  // Mode:   C Ionian (Glarean's twelfth mode, the dancing-masters' favourite),
  //         cut time, brisk.
  // Voices: gittern (tune), psaltery (altus), lute (bassus on the beat and
  //         the tenor-and-altus chord on the off-beat), tabor.
  // Plays:  every shop and smithy counter, while the purse is out.
  shop: (() => {
    const DYAD = { C: 'G3+E4', G: 'B3+D4', Am: 'C4+E4', F: 'A3+C4', Dm: 'A3+D4', Em: 'B3+E4', D: 'A3+F#4' };
    const comp = (s) => line(s.split(' ').map((rc) => { const [r, c] = rc.split('/'); return `${r}:4 ${DYAD[c]}:4`; }).join(' '), { beat: 8, weak: 0.55 });
    const tuneA = line('E5:4 C5 D5 B4 | C5 E5 F5 C5 | E5:2 D5 C5 E5 D5 E5 F5:4 | D5:4 C5:2 B4 D5:8 | '
      + 'C5:2 D5 E5 F5 G5:4 D5 | C5 E5 B4 E5 | A4 C5 D5:2 C5 B4:4 | C5:12 r:4', { beat: 8, weak: 0.8 });
    const tuneB = line('B4:4 D5 E5 G5 | G5:2 F#5 G5 D5 F#5 E5 D5:4 | D5:4 G5 E5:2 F#5 G5:4 | A5:4 F#5 G5:8 | '
      + 'G5:4 E5 A5 F5 | E5:2 F5 G5:4 D5 B4 | A4 C5 B4:2 C5 D5:4 | C5:12 r:4', { beat: 8, weak: 0.8 });
    const altA = line('G4:16 | A4 | G4:8 F4 | G4:16 | G4:8 B4 | A4 G4 | C5 B4 | E4:16', { vol: 0.7 });
    const altB = line('G4:16 | B4:8 A4 | B4:16 | D5:8 B4 | C5 A4 | C5 B4 | C5 G4 | E4:16', { vol: 0.7 });
    const lowA = comp('C3/C G2/G A2/Am F2/F C3/C D3/Dm G2/G G2/G C3/C G2/G A2/Am E2/Em F2/F G2/G C3/C C3/C');
    const lowB = comp('G2/G C3/C G2/G D3/D G2/G E3/Em D3/D G2/G C3/C F2/F C3/C G2/G F2/F G2/G C3/C C3/C');
    const kit = { T: ['tabor', 0.5], t: ['tabor', 0.24], s: ['shaker', 0.14], J: ['tambourine', 0.3] };
    const g = 'T...t.s.T...t.s.', close = 'T...t...T.t.J...';
    const strain = drums(kit, g, g, g, close, g, g, g, close);
    const n = tuneA.len;
    return {
      title: "The Chandler's Branle", contexts: ['shop'], weight: 1, room: 'tavern', pulse: 8,
      bpm: 126, loopBars: 4 * n / SPB, gain: 0.9,
      layers: [
        { name: 'tune', inst: 'gittern', gain: 0.9, pan: 0.2, humanize: 7, pattern: seq(tuneA, tuneA, tuneB, tuneB) },
        { name: 'altus', inst: 'psaltery', gain: 1.1, pan: 0.45, humanize: 7, pattern: seq(n, altA, n, altB) },
        { name: 'lute', inst: 'lute', gain: 0.26, pan: -0.3, humanize: 7, pattern: seq(lowA, lowA, lowB, lowB) },
        { name: 'drum', wave: 'noise', gain: 1, pan: -0.1, pattern: times(strain, 4) },
      ],
    };
  })(),

  // ── TENSE — "The Held Breath" ─────────────────────────────────────────────
  // Form:   a ground: the viol walks down the Phrygian fourth and back, one
  //         note to a bar, closing each strain the Phrygian way (F falling to
  //         E under a sixth that opens to the octave). The vielle climbs in
  //         thirds over it; in the second strain the rebec comes in above
  //         and the line rises a step a bar before it breaks. Under it all
  //         the lute plucks the ground and its third, late, like a pulse
  //         that has skipped. Original.
  // Mode:   E Phrygian, 4/4, slow.
  // Voices: viol (ground), vielle, rebec, lute, nakers.
  // Plays:  places on edge: the Sleeping Giant, the Burning Wizard, the
  //         Undercellar, Conyberry, the Fields of the Dead; a rest broken by
  //         something in the dark.
  tense: (() => {
    const o = { beat: 16, weak: 0.85 };
    const ground = line('E3:16 | D3 | C3 | B2 | C3 | D3 | F3 | E3 | A2 | B2 | C3 | D3 | C3 | A2 | F2 | E2', { vol: 0.8, ...o });
    const vielle = line('B3:8 G3 | A3 F3 | E3 G3 | D4:16 | C4:8 E4 | F4 D4 | A3 D4 | E4:16 | '
      + 'C4:16 | D4 | E4 | F4 | G4:8 E4 | E4 C4 | A3 D4 | E4:16', { vol: 0.8, beat: 8, weak: 0.9 });
    const rebec = line('E4:16 | B4 | G4 | D5 | E5 | C5 | A4 | B4', { vol: 0.7, ...o });
    const lute = line('E3:6 G3:10 | D3:6 F3:10 | C3:6 E3:10 | B2:6 D3:10 | C3:6 E3:10 | D3:6 F3:10 | F3:6 A3:10 | E3:6 G3:10 | '
      + 'A2:6 C3:10 | B2:6 D3:10 | C3:6 E3:10 | D3:6 F3:10 | C3:6 E3:10 | A2:6 C3:10 | F2:6 A2:10 | E2:6 G2:10', { vol: 0.6, beat: 16, weak: 0.7 });
    const kit = { N: ['nakers', 0.34], n: ['nakersHi', 0.18] };
    const g = 'N.......n.......', turn = 'N.......n...n.n.';
    const perc = drums(kit, g, g, g, turn, g, g, g, turn);
    return {
      title: 'The Held Breath', contexts: ['tense'], weight: 1.2, room: 'hall', pulse: 8,
      bpm: 80, loopBars: ground.len / SPB, gain: 0.88,
      layers: [
        { name: 'ground', inst: 'viol', gain: 0.3, pan: -0.2, pattern: ground },
        { name: 'vielle', inst: 'vielle', gain: 0.36, pan: 0.2, humanize: 8, pattern: vielle },
        { name: 'rebec', inst: 'rebec', gain: 0.26, pan: 0.45, humanize: 8, pattern: seq(8 * SPB, rebec) },
        { name: 'lute', inst: 'lute', gain: 0.28, pan: -0.4, humanize: 14, pattern: lute },
        { name: 'drum', wave: 'noise', gain: 0.5, pattern: times(perc, 2) },
      ],
    };
  })(),

  // ── TEMPLE — "Carol at the Shrine of Luck" ────────────────────────────────
  // Form:   a carol in the fifteenth-century English manner: a burden for
  //         three voices, sung note against note with the tune on top and a
  //         little organ under it, then a verse for two soloists over a harp,
  //         and the burden again. Tymora is the goddess of good fortune and her
  //         shrines are the cheerful ones, so the mode is the bright sixth
  //         with its B-flat, in a swinging three; the burden's half-close
  //         falls on C and its full close comes home to F through E, a
  //         leading tone the carol writers loved. Original.
  // Mode:   F (sixth mode, B-flat), 3/4, a bar = 12 sixteenths.
  // Voices: treble, tenor and bass voices (burden), alto and tenor (verse),
  //         positive organ, Gothic harp, handbells.
  // Plays:  temples and shrines: the Shrine of Luck, the Hall of Justice's
  //         side chapels, the House of Inspired Hands, wayside shrines.
  temple: (() => {
    const o = { vol: 0.85, weak: 0.82, beat: 12 };
    const treble = line('F4:8 G4:4 | A4:8 A4:4 | Bb4:4 A4 G4 | A4:12 | C5:8 Bb4:4 | A4:4 G4 F4 | G4:8 E4:4 | F4:12', o);
    const mid = line('C4:12 | C4:8 D4:4 | F4:8 E4:4 | F4:12 | A4:4 G4:8 | C4:8 A3:4 | E4:8 C4:4 | C4:12', o);
    const bass = line('F3:8 E3:4 | F3:8 D3:4 | Bb2:4 F3 C3 | F3:12 | F3:4 E3 G3 | F3:4 E3 D3 | C3:12 | F3:12', o);
    const upper = line('A4:8 C5:4 | Bb4:4 A4 G4 | A4:8 F4:4 | G4:12 | A4:8 Bb4:4 | C5:4 A4 F4 | G4:8 E4:4 | F4:12', o);
    const lower = line('F3:8 A3:4 | G3:4 F3 E3 | F3:8 D3:4 | C3:12 | F3:8 G3:4 | A3:4 F3 D3 | C3:12 | F3:12', o);
    const S = treble.len;
    // The words are the goddess's own: "Fortuna mater, laeta spes, lux Tymorae, fave nobis".
    const bells = line('r:36 C5+F5:12 r:36 F5+A5+C6:12', { vol: 0.5 });
    return {
      title: 'Carol at the Shrine of Luck', contexts: ['temple'], weight: 1.2, room: 'chapel', pulse: 4,
      bpm: 84, loopBars: 4 * S / SPB, gain: 0.9,
      layers: [
        { name: 'treble', inst: 'voiceTreble', vowel: 'a', gain: 0.3, pan: 0.15, humanize: 8,
          pattern: seq(sing(treble, 'o u a a e a e e u i i o a a e o'), S, sing(treble, 'o u a a e a e e u i i o a a e o'), S) },
        { name: 'tenor', inst: 'voiceTenor', vowel: 'o', gain: 0.27, pan: -0.15, humanize: 8,
          pattern: seq(sing(mid, 'o a e a e e u i o a e o o'), sing(lower, 'a e i o a e a i o u e a o i'),
            sing(mid, 'o a e a e e u i o a e o o'), sing(lower, 'e a o i a e u a i o a e o a')) },
        { name: 'bass', inst: 'voiceBass', vowel: 'o', gain: 0.28, pan: 0, humanize: 8,
          pattern: seq(sing(bass, 'o u a e a e e u i o a e o a o'), S, sing(bass, 'o u a e a e e u i o a e o a o'), S) },
        { name: 'alto', inst: 'voiceAlto', vowel: 'a', gain: 0.3, pan: 0.25, humanize: 10,
          pattern: seq(S, sing(upper, 'a e i o a e a i o u e a o i e a'), S, sing(upper, 'e a o i a e u a i o a e o a i a')) },
        { name: 'harp', inst: 'harpGothic', gain: 0.4, pan: -0.35, humanize: 6, pattern: seq(S, lower, S, lower) },
        { name: 'organ', inst: 'positive', gain: 0.14, pan: 0, pattern: seq(bass, S, bass, S) },
        { name: 'bells', inst: 'handbells', gain: 0.14, pan: 0.4, pattern: seq(bells, S, bells, S) },
      ],
    };
  })(),

  // ── FOREST — "Neverwinter Wood" ───────────────────────────────────────────
  // Form:   a ballade in the fourteenth-century French manner, AAB: a cantus
  //         over a tenor with a contratenor between them, in a rocking six-
  //         eight. The first A stops open on G through the double leading
  //         tone (F# and C# rising to G and D); the second closes on F the
  //         same way (E and B rising to F and C), and the B strain climbs to
  //         the top of the flute before it comes home. The raised fourth of
  //         the F mode, B natural, is what makes the wood sound enchanted
  //         rather than merely green. Original.
  // Mode:   F Lydian (fifth mode), 6/8, a bar = 12 sixteenths.
  // Voices: flute (cantus), vielle (tenor), Gothic harp (contratenor).
  // Plays:  woodland: the Neverwinter Wood, the Misty Forest, the Trollbark,
  //         the Cloak Wood by day.
  forest: (() => {
    const o = { vol: 0.8, weak: 0.82, beat: 6 };
    const head = { c: 'C5:4 D5:2 A4:6 | C5:4 B4:2 A4:6 | E5:6 G5:6 | F5:4 E5:2 G5:6 | F5:6 D5:6 | C5:4 D5:2 E5:6',
      t: 'F3:12 | E3:6 D3:6 | C3:12 | D3:6 E3:6 | F3:6 G3:6 | A3:6 G3:6',
      h: 'A3:6 C4:6 | G3:6 F3:6 | G3:6 E4:6 | A3:6 C4:6 | C4:6 B3:6 | E4:6 B3:6' };
    const ouv = { c: 'A4:4 G4:2 F#4:6 | G4:12', t: 'F3:6 A3:6 | G3:12', h: 'C4:6 C#4:6 | D4:12' };
    const clos = { c: 'B4:4 D5:2 E5:6 | F5:12', t: 'G3:12 | F3:12', h: 'D4:6 B3:6 | C4:12' };
    const B = { c: 'C5:6 A4:6 | D5:6 A4:6 | G4:6 A4:6 | E5:4 D5:2 C5:6 | F5:6 C5:6 | G4:6 A4:6 | B4:4 D5:2 E5:6 | F5:12',
      t: 'A3:12 | G3:6 F3:6 | E3:6 D3:6 | C3:12 | D3:6 F3:6 | E3:6 D3:6 | G3:12 | F3:12',
      h: 'C4:12 | B3:6 C4:6 | C4:6 F3:6 | G4:6 E4:6 | A4:6 A3:6 | C4:6 F4:6 | D4:6 B3:6 | C4:12' };
    const part = (k, opts = o) => line(`${head[k]} | ${ouv[k]} | ${head[k]} | ${clos[k]} | ${B[k]}`, opts);
    const cantus = part('c');
    return {
      title: 'Neverwinter Wood', contexts: ['forest'], weight: 1.2, room: 'open', pulse: 6,
      bpm: 90, loopBars: cantus.len / SPB, gain: 0.86,
      layers: [
        { name: 'cantus', inst: 'flute', gain: 0.3, pan: 0.2, humanize: 10, ornament: 'grace', pattern: cantus },
        { name: 'tenor', inst: 'vielle', gain: 0.6, pan: -0.25, humanize: 8, pattern: part('t', { ...o, vol: 0.75 }) },
        { name: 'contra', inst: 'harpGothic', gain: 0.65, pan: 0.4, humanize: 6, pattern: part('h', { ...o, vol: 0.7 }) },
      ],
    };
  })(),

  // ── CAVE — "The Dripping Dark" ────────────────────────────────────────────
  // Form:   organum purum, the oldest written polyphony there is: a tenor
  //         holds each note for bars at a time while a single voice wanders
  //         above it in a slow melisma, touching a consonance with the held
  //         note on every beat and stopping to breathe. Here the tenor is a
  //         viol (C, then B-flat and D-flat, then C again), the voice an alto
  //         singing "u" into the dark, and in the last strain a bass hums the
  //         tenor with her. Between the beats a struck psaltery lets fall a
  //         single high note now and then, like water. Original.
  // Mode:   C Phrygian (the D-flat), 4/4, very slow.
  // Voices: viol (tenor), alto voice (duplum), bass voice (hum), struck
  //         psaltery, drips.
  // Plays:  caves, mines and the Underdark.
  cave: (() => {
    const tenor = line('C3:64 | Bb2:32 | Db3:32 | C3:64', { vol: 0.75 });
    const duplum = line('G4:8 Ab4:4 G4:4 | Eb4:8 r:8 | C4:4 Db4:4 Eb4:8 | G4:8 r:8 | F4:8 G4:4 F4:4 | Db4:12 r:4 | '
      + 'F4:8 Ab4:8 | Bb4:4 Ab4:4 F4:8 | Eb4:8 G4:8 | Ab4:4 G4:4 Eb4:8 | Eb4:4 Db4:4 C4:8 | r:16', { vol: 0.75, beat: 8, weak: 0.85 });
    const hum = seq(8 * SPB, line('C3:48 r:16', { vol: 0.6 }));
    const water = [[13, 79], [45, 87], [83, 85], [117, 77], [150, 79], [181, 84]].map(([s, n]) => [s, n, 2, 0.5]);
    return {
      title: 'The Dripping Dark', contexts: ['cave', 'underdark'], weight: 1.2, room: 'cave', pulse: 8,
      bpm: 60, loopBars: 12, gain: 0.72,
      layers: [
        { name: 'tenor', inst: 'viol', gain: 0.3, pan: -0.15, pattern: tenor },
        { name: 'duplum', inst: 'voiceAlto', vowel: 'u', gain: 0.3, pan: 0.2, humanize: 14, pattern: duplum },
        { name: 'hum', inst: 'voiceBass', vowel: 'u', gain: 0.18, pan: -0.2, humanize: 14, pattern: hum },
        { name: 'water', inst: 'psalteryStruck', gain: 0.35, pan: 0.45, pattern: withLen(water, 12 * SPB) },
        { name: 'drip', wave: 'noise', gain: 0.5, pattern: hits([29, 70, 101, 139, 170], 'drip', 0.4) },
      ],
    };
  })(),

  // ── NIGHT — "Nightfall on the Sword Coast" ────────────────────────────────
  // Form:   an air in two strains over a slow bass, the harp breaking each
  //         chord upward from its third so it never sits on the bass's
  //         octave. The first strain falls from E to a half-close on A; the
  //         second rises to G, turns through C and closes the Renaissance way,
  //         the recorder's G# leaning up into the final A. Original.
  // Mode:   A Aeolian, 4/4, slow.
  // Voices: recorder (air), harp (broken chords), viol (bass).
  // Plays:  the open country after dark, when the day's own music yields.
  night: (() => {
    const air = line('E5:4 D5 C5:8 | D5:6 C5:2 B4:8 | A4:6 B4:2 C5:8 | G4:8 B4 | A4:4 B4:2 A4 G4:8 | D5:8 C5 | C5 B4 | A4:16 | '
      + 'E5:8 G5 | B4 D5 | C5 A4 | G4 B4 | A4:4 C5 F5:8 | E5 G4 | A4 G#4 | A4:16', { vol: 0.8, beat: 8, weak: 0.85 });
    const bass = line('A2:16 | G2 | F2 | E2 | A2:8 C3 | G2 A2 | F2 G2 | A2:16 | C3:16 | G2 | A2:8 F2 | C3 G2 | F2:16 | C3:8 E3 | D3 E3 | A2:16',
      { vol: 0.75, beat: 16, weak: 0.9 });
    // The harp breaks each chord upward, starting where a player's hand
    // would: on the third if it can, else the fifth, else the root, but
    // never on the air's own note and never a fifth or octave parallel to
    // the air or the bass from the last chord.
    const CH = { Am: ['A3', 'C4', 'E4'], G: ['G3', 'B3', 'D4'], F: ['F3', 'A3', 'C4'], Em: ['E3', 'G3', 'B3'],
      C: ['C4', 'E4', 'G4'], Dm: ['D4', 'F4', 'A4'], E: ['E3', 'G#3', 'B3'] };
    const chords = 'Am Am G G F F Em Em Am C G Am F G Am Am C C G G Am F C G F F C Em Dm E Am Am'.split(' ');
    const at = (evs, t) => evs.find((e) => e[0] <= t && t < e[0] + e[2])[1];
    const parallel = (h0, x0, h1, x1) => h0 !== h1 && x0 !== x1 && Math.sign(h1 - h0) === Math.sign(x1 - x0)
      && [0, 7].includes(Math.abs(h0 - x0) % 12) && Math.abs(h0 - x0) % 12 === Math.abs(h1 - x1) % 12;
    let prev = null;
    const harp = line(chords.map((c, i) => {
      const [r, third, fifth] = CH[c];
      const a = at(air, i * 8), b = at(bass, i * 8);
      const shapes = [[third, fifth, r, fifth], [fifth, third, r, third], [r, fifth, third, fifth]];
      const ok = (s) => {
        const h = noteToMidi(s[0]);
        return (h - a) % 12 !== 0 && !(prev && (parallel(prev.h, prev.a, h, a) || parallel(prev.h, prev.b, h, b)));
      };
      const s = shapes.find(ok) || shapes[0];
      prev = { h: noteToMidi(s[0]), a, b };
      return s.map((n) => n + ':2').join(' ');
    }).join(' '), { vol: 0.62, beat: 8, weak: 0.75 });
    return {
      title: 'Nightfall on the Sword Coast', contexts: ['night'], weight: 1.2, room: 'open', pulse: 8,
      bpm: 66, loopBars: air.len / SPB, gain: 0.8,
      layers: [
        { name: 'air', inst: 'recorder', gain: 0.3, pan: 0.2, humanize: 12, ornament: 'grace', pattern: air },
        { name: 'harp', inst: 'harp', gain: 0.26, pan: -0.25, humanize: 8, pattern: harp },
        { name: 'bass', inst: 'viol', gain: 0.32, pan: -0.05, pattern: bass },
      ],
    };
  })(),

  // ── WILDS — "Past the Last Farm" ──────────────────────────────────────────
  // Form:   a virelai, the dance-song of the fourteenth century, in its full
  //         shape A B B A A: the refrain, a couplet sung twice (the first
  //         time left open on G, the second closed on E), the refrain's music
  //         for the last verse, and the refrain itself. Three voices, the
  //         tune on a vielle, a citole between and a lute beneath, every A
  //         strain closing the Phrygian way (F falling to E under D rising to
  //         E); in the A strains a hurdy-gurdy drones E and B, the sound of
  //         someone playing to keep their own spirits up. Original.
  // Mode:   E Phrygian, 4/4, watchful.
  // Voices: vielle (tune), citole (counter), lute (tenor), hurdy-gurdy
  //         drone, frame drum.
  // Plays:  off the road past the last farm, marsh, ruin and ash; places
  //         that are merely uneasy.
  wilds: (() => {
    const o = { vol: 0.8, beat: 8, weak: 0.82 };
    const A = { tune: 'E5:6 D5:2 B4:8 | C5:6 B4:2 A4:8 | G4:6 A4:2 B4:8 | D5:8 E5:8',
      ctr: 'B3:8 G3 | E4 D4 | E4 D4 | A3 B3', ten: 'E3:16 | A3:8 F3 | C3 G3 | F3 E3' };
    const B = { tune: 'C5:6 D5:2 E5:8 | F5:6 E5:2 D5:8 | B4:6 C5:2 G4:8', ctr: 'E4:8 C4 | A3 A3 | D4 E4', ten: 'A2:8 C3 | D3 F3 | G3 E3' };
    const ouv = { tune: 'A4:8 B4:8', ctr: 'C4:8 B3', ten: 'F3:8 G3' };
    const clos = { tune: 'D5:8 E5:8', ctr: 'A3:8 B3', ten: 'F3:8 E3' };
    const part = (k, opts) => { const a = line(A[k], opts); return seq(a, line(`${B[k]} | ${ouv[k]}`, opts), line(`${B[k]} | ${clos[k]}`, opts), a, a); };
    const tune = part('tune', o);
    const S = 4 * SPB;
    const drone = line('E2+B2:64', { vol: 0.5 });
    return {
      title: 'Past the Last Farm', contexts: ['tense', 'marsh'], weight: 1, room: 'open', pulse: 8,
      bpm: 88, loopBars: tune.len / SPB, gain: 0.84,
      layers: [
        { name: 'tune', inst: 'vielle', gain: 0.55, pan: 0.2, humanize: 8, pattern: tune },
        { name: 'counter', inst: 'citole', gain: 0.55, pan: 0.4, humanize: 8, pattern: part('ctr', { ...o, vol: 0.7 }) },
        { name: 'tenor', inst: 'lute', gain: 0.36, pan: -0.3, humanize: 8, pattern: part('ten', { ...o, vol: 0.72 }) },
        { name: 'drone', inst: 'hurdygurdy', gain: 0.5, pan: -0.1, pattern: seq(drone, 2 * S, drone, drone) },
        { name: 'drum', wave: 'noise', gain: 1, pan: 0.1, pattern: times(drums({ F: ['frame', 0.28], f: ['frame', 0.12] }, 'F.......f.....f.'), 20) },
      ],
    };
  })(),

  // ── CITY — "The Protector's Enclave" ──────────────────────────────────────
  // Form:   a rondellus, the thirteenth-century English round of voice
  //         exchange: three phrases sound at once, one in each voice, and at
  //         every statement each voice passes its phrase to the next, so the
  //         listener hears every tune on top in turn while the chords never
  //         change. Here it is played by a city's waits from the gate towers,
  //         cornett and two shawms over a sackbut singing a two-bar pes: the
  //         first rondellus over G, E, C and D, the second over C, A, D and G,
  //         each phrase written so that any of the three can sit on top.
  //         Original.
  // Mode:   G (eighth mode with F#, the waits' bright tuning), 4/4, stately.
  // Voices: cornett and two alto shawms (exchanging), sackbut (pes), tower
  //         bells, tabor in the second rondellus.
  // Plays:  the great cities: Neverwinter, Waterdeep, Baldur's Gate.
  city: (() => {
    const o = { vol: 0.8, beat: 8, weak: 0.82 };
    const [A, B, C, D, E, F] = [
      'B4:6 A4:2 B4:4 C5:4 | C5:6 B4:2 A4:8 | D5:4 C5:2 D5:2 E5:8 | E5:4 D5:2 E5:2 F#5:8',
      'G4:12 A4:4 | G4:8 F#4:8 | G4:6 A4:2 G4:8 | G4:8 D5:8',
      'D5:8 E5:8 | E5:4 D5:2 C5:2 D5:8 | B4:12 A4:2 B4:2 | C5:8 A4:8',
      'E5:8 E5:4 D5:4 | F#5:8 G5:8 | G5:8 A5:4 G5:4 | F#5:8 G5:8',
      'C5:16 | D5:16 | E5:16 | D5:16',
      'G4:8 A4:8 | A4:8 B4:4 C5:2 B4:2 | C5:16 | A4:8 B4:8',
    ].map((s) => line(s, o));
    const p = { vol: 0.8, beat: 8, weak: 0.9 };
    const pes = seq(times(line('G2:8 E2:8 | C3:8 D3:8', p), 6), times(line('C3:8 A2:8 | D3:8 G2:8', p), 6));
    const R = A.len;
    const kit = { T: ['tabor', 0.42], t: ['tabor', 0.2] };
    return {
      title: "The Protector's Enclave", contexts: ['city'], weight: 1.2, room: 'open', pulse: 8,
      bpm: 96, loopBars: 6 * R / SPB, gain: 0.88,
      layers: [
        { name: 'cornett', inst: 'cornett', gain: 0.27, pan: 0.35, humanize: 6, pattern: seq(A, B, C, D, E, F) },
        { name: 'shawm1', inst: 'shawmAlto', gain: 0.46, pan: -0.35, humanize: 6, pattern: seq(B, C, A, E, F, D) },
        { name: 'shawm2', inst: 'shawmAlto', gain: 0.46, pan: 0.05, humanize: 7, pattern: seq(C, A, B, F, D, E) },
        { name: 'pes', inst: 'sackbut', gain: 0.26, pan: -0.1, humanize: 4, pattern: pes },
        { name: 'bells', inst: 'bells', gain: 0.6, pan: 0.2, pattern: line('G3:32 r:160 C4:32 r:160', { vol: 0.6 }) },
        { name: 'drum', wave: 'noise', gain: 2, pattern: seq(3 * R, times(drums(kit, 'T.......t...t...'), 12)) },
      ],
    };
  })(),

  // ── UNDERMOUNTAIN — "Halaster's Halls" ────────────────────────────────────
  // Form:   a chanson in the ars subtilior, the over-clever style of the
  //         late fourteenth century, which suits a mad archmage: the cantus
  //         moves in dotted crotchets across a tenor in whole bars, three
  //         against four, so it is never where the ear expects it; on the
  //         beats it is always consonant, and the chromatic notes (C# against
  //         C, F# against F, an E-flat over D) fall in the cracks between
  //         them. A tower bell rings a D and then, four bars later, an
  //         E-flat that belongs to nothing. The second time round a psaltery
  //         shadows the cantus. Original.
  // Mode:   D, with the accidentals of the ars subtilior, 4/4.
  // Voices: rebec (cantus), Gothic harp (contratenor), viol (tenor), struck
  //         psaltery (second time), tower bell.
  // Plays:  Undermountain and the deepest dungeons.
  undermountain: (() => {
    const o = { vol: 0.8, beat: 8, weak: 0.8 };
    const cantus = line('A4:6 F4 D5 C#5 F#4 G4:2 | G4:6 E4 D5 Eb5 F4 E4:2 | C#5:6 E5 A4 G#4 C5 B4:2 | A4:6 F4 D4 E4 F#4 A4:2', o);
    const tenor = line('D3:32 | C3:16 | Bb2:16 | A2:32 | D3:32', { vol: 0.75 });
    const contra = line('F3:8 A3:24 | E3:8 G3:8 | D3:8 F3:8 | A3:16 | E4:16 | F4:8 D4:8 | A3:16', { vol: 0.7, beat: 8, weak: 0.85 });
    const P = cantus.len;
    return {
      title: "Halaster's Halls", contexts: ['underdark', 'dungeon'], weight: 1, room: 'cave', pulse: 8,
      bpm: 72, loopBars: 2 * P / SPB, gain: 0.8,
      layers: [
        { name: 'cantus', inst: 'rebec', gain: 0.4, pan: 0.25, humanize: 8, pattern: times(cantus, 2) },
        { name: 'shadow', inst: 'psalteryStruck', gain: 0.3, pan: 0.45, humanize: 8, pattern: seq(P, cantus) },
        { name: 'contra', inst: 'harpGothic', gain: 0.45, pan: -0.35, humanize: 6, pattern: times(contra, 2) },
        { name: 'tenor', inst: 'viol', gain: 0.3, pan: -0.1, pattern: times(tenor, 2) },
        { name: 'bell', inst: 'bells', gain: 0.5, pan: 0.1, pattern: line('D4:32 r:32 Eb4:32 r:160', { vol: 0.6 }) },
      ],
    };
  })(),

  // ── LAMENT — "Lament for the Fallen" ──────────────────────────────────────
  // Form:   a déploration, the fifteenth-century lament for a dead master:
  //         a tenor sings a chant-like cantus firmus in long notes, one to a
  //         bar, rising from D to G and sinking home, while a vielle sighs
  //         above it in falling pairs and a viol walks beneath. The E-flat
  //         in the bass at the top of the arch is the lament's one sob; the
  //         close is the old one, C# rising to D over the tenor's E falling
  //         to D. A tower bell tolls every fourth bar. Original.
  // Mode:   D Aeolian, 4/4, very slow.
  // Voices: tenor voice (cantus firmus), vielle (superius), viol (bassus),
  //         tower bell.
  // Plays:  a death, a hard defeat, the graves.
  lament: (() => {
    const o = { vol: 0.8, beat: 8, weak: 0.85 };
    const cf = line('D4:16 | F4 | E4 | D4 | C4 | D4 | E4 | F4 | G4 | F4 | E4 | D4', { vol: 0.8, beat: 16 });
    const sup = line('A4:6 C5:2 D5:8 | C5:6 Bb4:2 A4:8 | C5:16 | D5:6 C5:2 Bb4:8 | A4:16 | F4:12 G4:2 F4:2 | '
      + 'G4:6 A4:2 C5:8 | A4:6 C5:2 D5:8 | D5:8 Bb4 | D5:6 C5:2 D5:8 | C5:8 C#5 | D5:8 A4', o);
    const bass = line('D3:8 Bb2 | A2 D3 | C3 A2 | Bb2 G2 | A2 F2 | Bb2 D3 | C3 A2 | D3 Bb2 | G2 Eb3 | D3 Bb2 | C3 A2 | D3:16', o);
    return {
      title: 'Lament for the Fallen', contexts: ['lament'], weight: 1.2, room: 'chapel', pulse: 8,
      bpm: 56, loopBars: 12, gain: 0.84,
      layers: [
        { name: 'tenor', inst: 'voiceTenor', vowel: 'e', gain: 0.26, pan: 0, humanize: 10, pattern: sing(cf, 'e u e a i e o e a e u e') },
        { name: 'superius', inst: 'vielle', gain: 0.75, pan: 0.3, humanize: 12, pattern: sup },
        { name: 'bassus', inst: 'viol', gain: 0.32, pan: -0.3, humanize: 8, pattern: bass },
        { name: 'bell', inst: 'bells', gain: 0.7, pan: 0.1, pattern: line('D3:16 r:48 D3:16 r:48 D3:16 r:48', { vol: 0.6 }) },
      ],
    };
  })(),

  // ── MYSTERY — "The Harpers' Errand" ───────────────────────────────────────
  // Form:   a strict canon at the unison, two bars apart, over a falling
  //         ground (D, C, B-flat, A) plucked on a harp: the same line heard
  //         twice, the second time chasing the first, which is exactly what
  //         a Harper does. Each two-bar segment is written to sound against
  //         the ground and against the segment before it, so the canon runs
  //         round the loop for ever; once each time round the psaltery drops
  //         out and comes back in, as if it had lost the trail. The flat
  //         second, E-flat, leans in over the C once per round. Original.
  // Mode:   D Dorian with a Phrygian E-flat, 4/4, a careful walk.
  // Voices: lute (dux), struck psaltery (comes), harp (ground).
  // Plays:  intrigue: Harper safehouses, sealed letters, the Zhentarim's
  //         back rooms, riddles and locked doors.
  mystery: (() => {
    const o = { vol: 0.8, beat: 8, weak: 0.78 };
    const [s1, s2, s3, s4] = ['F4:4 G4:2 F4:2 E4:6 F4:2 | D4:4 E4:2 D4:2 C#4:8', 'A4:8 A4:4 Bb4:2 A4:2 | G4:6 F4:2 E4:8',
      'D5:6 C5:2 E5:8 | Bb4:4 A4:2 Bb4:2 C5:8', 'F5:4 E5:2 F5:2 G5:4 Eb5:4 | D5:6 C5:2 A4:8'].map((s) => line(s, o));
    const dux = seq(s1, s2, s3, s4);
    const ground = line('D3:8 C3 Bb2 A2', { vol: 0.75, beat: 8, weak: 0.9 });
    const G = ground.len;
    return {
      title: "The Harpers' Errand", contexts: ['mystery'], weight: 1.2, room: 'hall', pulse: 8,
      bpm: 84, loopBars: 16, gain: 0.84,
      layers: [
        { name: 'dux', inst: 'lutePlucked', gain: 0.45, pan: -0.3, humanize: 10, pattern: times(dux, 2) },
        { name: 'comes', inst: 'psalteryStruck', gain: 0.65, pan: 0.35, humanize: 10, pattern: seq(G, s1, s2, s3, s4, s1, s2, s3) },
        { name: 'ground', inst: 'harp', gain: 0.2, pan: 0, humanize: 6, pattern: times(ground, 8) },
      ],
    };
  })(),

  // ── DRAGON — "The Wyrm Comes" ─────────────────────────────────────────────
  // Form:   a conductus and its cauda, as the Notre-Dame singers built them.
  //         The conductus is three voices note against note, horn over
  //         tenor shawm over sackbut, falling through the Phrygian D-flat to
  //         C at every close; perfect consonances on the strong beats and the
  //         outer voices in contrary motion, so eight bars of it sound like
  //         something enormous walking. The cauda is a hocket: one quaver
  //         line split note by note between an alto shawm and a cornett over
  //         a held C, the medieval sound of breath being knocked out of you.
  //         Played twice; the second time a positive organ doubles the
  //         conductus and a dulcian the tenor. Original.
  // Mode:   C Phrygian, 4/4, heavy.
  // Voices: horn (triplum), tenor shawm (duplum), sackbut (tenor), alto
  //         shawm and cornett (hocket), dulcian, positive organ, gong, timpani,
  //         war drum and nakers.
  // Plays:  a dragon, or anything that size.
  dragon: (() => {
    const o = { vol: 0.9, beat: 8, weak: 0.88 };
    const T = line('C3:8 Bb2 | Db3 C3 | Ab2 Eb3 | F3 Db3 | C3 Bb2 | Ab2 Eb3 | F3 Db3 | Db3 C3', o);
    const D = line('G3:8 Bb3 | Ab3 C4 | C4 Bb3 | Ab3 Ab3 | C4 Db4 | Eb4 Bb3 | Ab3 Ab3 | F4 G4', o);
    const Tr = line('C4:8 Db4 | F4 Eb4 | Eb4 G4 | Ab4 F4 | G4 Bb4 | C5 G4 | C5 F4 | Bb4 C5', o);
    const pedal = line('C3:64 Db3:32 C3:32', { vol: 0.85 });
    // The cauda's line, then dealt out alternately: the downbeats fall to the
    // shawm, every other quaver to the cornett.
    const cauda = line('G4:2 Ab4 G4 F4 Eb4 F4 G4 Eb4 | C5 Bb4 Ab4 G4 Ab4 G4 F4 Eb4 | G4 C5 Eb5 C5 G4 Ab4 G4 F4 | '
      + 'Eb4 F4 G4 Ab4 G4 F4 Eb4 Db4 | F4 Ab4 Db5 C5 Bb4 Ab4 Bb4 C5 | Db5 C5 Bb4 Ab4 F4 Ab4 Bb4 Ab4 | '
      + 'G4 Ab4 G4 F4 Eb4 Db4 C4 Db4 | Eb4 F4 Eb4 Db4 C4:8', { vol: 0.9, beat: 8, weak: 0.8 });
    const deal = (k) => withLen(cauda.filter((_, i) => i % 2 === k), cauda.len);
    const L = T.len;
    const organ = [...T, ...D, ...Tr].map((e) => [e[0] + 2 * L, e[1], e[2], 0.7]);
    const kit = { G: ['gong', 0.6], T: ['timp', 0.7], W: ['wardrum', 0.75], N: ['nakers', 0.5], n: ['nakersHi', 0.32] };
    const walk = drums(kit, 'G.......T.......', ...Array(6).fill('W.......T.......'), 'W.......T...T.T.');
    const run = drums(kit, ...Array(7).fill('W.n.N.n.W.nnN.n.'), 'W.n.N.n.T.T.T.T.');
    return {
      title: 'The Wyrm Comes', contexts: ['dragon'], weight: 1.2, intensity: 3, room: 'hall', pulse: 8,
      bpm: 100, loopBars: 4 * L / SPB, gain: 0.95,
      layers: [
        { name: 'triplum', inst: 'horn', gain: 0.42, pan: 0.25, humanize: 6, pattern: seq(Tr, L, Tr, L) },
        { name: 'duplum', inst: 'shawmTenor', gain: 0.35, pan: -0.25, humanize: 6, pattern: seq(D, L, D, L) },
        { name: 'tenor', inst: 'sackbut', gain: 0.2, pan: 0, humanize: 4, pattern: seq(T, pedal, T, pedal) },
        { name: 'dulcian', inst: 'dulcian', gain: 0.25, pan: -0.1, pattern: seq(2 * L, T, pedal) },
        { name: 'hocketA', inst: 'shawmAlto', gain: 0.75, pan: -0.35, humanize: 3, pattern: seq(L, deal(0), L, deal(0)) },
        { name: 'hocketB', inst: 'cornett', gain: 0.5, pan: 0.4, humanize: 3, pattern: seq(L, deal(1), L, deal(1)) },
        { name: 'organ', inst: 'positive', gain: 0.12, pan: 0, pattern: withLen(organ, 4 * L) },
        { name: 'drum', wave: 'noise', gain: 0.7, pan: -0.05, pattern: times(seq(walk, run), 2) },
      ],
    };
  })(),

  // ── DEFEAT ────────────────────────────────────────────────────────────────
  defeat: {
    title: 'The Last Light', contexts: ['defeat'], weight: 1,
    bpm: 60, loopBars: 2, gain: 0.9,
    layers: [
      { name: 'vielle', inst: 'vielle', gain: 0.3, pattern: [
        ...tune(C4, 'aeolian', 0, [[3, 6], [2, 4], [1, 6], [7 - 7, 16]]),
      ] },
      { name: 'organ', inst: 'organetto', gain: 0.24, pattern: [
        [0, C3, SPB, 0.7], [16, C3 - 1, SPB, 0.6],
      ] },
      { name: 'bell', inst: 'bell', gain: 0.18, pattern: hits([0], 48, 0.5, 12) },
    ],
  },

  // ── CAMP — "The Watch by the Fire" ────────────────────────────────────────
  // Form:   a ground with divisions, the way a lutenist passed a long watch:
  //         a four-bar ground on a second lute (G, F, C, G; E minor, A minor,
  //         F and home, the Mixolydian F-to-G close), and over it the tune,
  //         then the tune broken into running quavers, then both again while
  //         whoever else is awake whistles a descant on a recorder and taps
  //         the frame drum on a knee. Original.
  // Mode:   G Mixolydian, 4/4, unhurried.
  // Voices: lute (tune and divisions), lute (ground), recorder (descant),
  //         frame drum.
  // Plays:  resting in the wilds, and the Rest screen outdoors.
  camp: (() => {
    const o = { vol: 0.8, beat: 8, weak: 0.8 };
    const ground = line('G2:4 D3 F2 C3 | C3 G2 G2 D3 | E2 B2 A2 E3 | F2 C3 G2:8', { vol: 0.7, beat: 8, weak: 0.6 });
    const tune = line('B4:4 A4:2 G4 C5:8 | E5:6 D5:2 D5:8 | G4:6 A4:2 C5:8 | A4:4 B4:2 A4 G4:8', o);
    const div = line('B4:2 C5 D5 B4 C5 B4 A4 C5 | E5:2 D5 C5 E5 D5 C5 B4 D5 | G4:2 A4 B4 G4 C5 D5 E5 C5 | A4:2 C5 B4 A4 G4 A4 B4 G4', o);
    const descant = line('D5:8 F5 | E5 G5 | G5 E5 | F5 D5', { vol: 0.65, beat: 8, weak: 0.9 });
    const knee = drums({ F: ['frame', 0.3], f: ['frame', 0.14] }, 'F.....f.F.....f.');
    const S = ground.len;
    return {
      title: 'The Watch by the Fire', contexts: ['camp'], weight: 1.2, room: 'open', pulse: 8,
      bpm: 76, loopBars: 4 * S / SPB, gain: 0.82,
      layers: [
        { name: 'tune', inst: 'lutePlucked', gain: 0.5, pan: 0.25, humanize: 12, pattern: seq(tune, div, tune, div) },
        { name: 'ground', inst: 'lute', gain: 0.44, pan: -0.25, humanize: 10, pattern: times(ground, 4) },
        { name: 'descant', inst: 'recorder', gain: 0.24, pan: 0.05, humanize: 14, pattern: seq(2 * S, descant, descant) },
        { name: 'drum', wave: 'noise', gain: 1, pan: -0.1, pattern: seq(2 * S, times(knee, 8)) },
      ],
    };
  })(),

  // ── ORCHESTRAL — "The Coast Road" ─────────────────────────────────────────
  // The full band, and the reason the section instruments exist: five string
  // desks, four horns and a pair of kettles. Written so the sections ENTER
  // rather than all playing at once — basses and celli lay the floor, violas
  // fill, the violins take the tune, and the horns answer them a bar later.
  // That staggering is what an orchestra sounds like; everyone playing all the
  // time is what a synthesiser sounds like.
  orchestral: {
    title: 'The Coast Road', contexts: ['travel', 'road'], weight: 0.5,
    bpm: 76, loopBars: 8, gain: 0.95,
    layers: [
      // The tune: a rising Aeolian line that reaches for the sixth and falls back.
      { name: 'violins', inst: 'strings', gain: 0.34, pattern: [
        ...tune(D4, 'aeolian', 0, [
          [1, 8], [2, 4], [3, 4],
          [5, 12], [4, 4],
          [3, 8], [4, 4], [5, 4],
          [6, 12], [5, 4],
          [4, 8], [3, 4], [2, 4],
          [1, 16],
          [null, 8], [5, 4], [4, 4],
          [3, 8], [1, 8],
        ]),
      ] },
      // Violins an octave up, only over the second half: the moment it opens out.
      { name: 'descant', inst: 'stringsHigh', gain: 0.16, pattern: [
        ...tune(D4 + 12, 'aeolian', 64, [
          [3, 8], [4, 4], [5, 4],
          [6, 12], [5, 4],
          [4, 8], [3, 4], [2, 4],
          [1, 16],
        ]),
      ] },
      // Horns answer the violins one bar behind, which is the oldest trick in
      // orchestration and still the most effective.
      { name: 'horns', inst: 'horns', gain: 0.26, pattern: [
        ...tune(D3, 'aeolian', 16, [
          [1, 8], [2, 4], [3, 4],
          [5, 12], [null, 4],
        ]),
        ...tune(D3, 'aeolian', 80, [
          [3, 8], [4, 4], [5, 4],
          [6, 12], [null, 4],
        ]),
      ] },
      { name: 'violas', inst: 'violas', gain: 0.2, pattern: [
        ...rep(8, D3 + 7, 'aeolian', [[0, 1, 8, 0.7], [8, 3, 8, 0.6]],
          { shift: [0, 0, -2, -2, 3, 3, 0, 0] }),
      ] },
      { name: 'celli', inst: 'celli', gain: 0.3, pattern: [
        ...rep(8, D3, 'aeolian', [[0, 1, 12, 0.85], [12, 5, 4, 0.6]],
          { shift: [0, 0, -2, -2, 3, 3, 0, 0] }),
      ] },
      { name: 'basses', inst: 'basses', gain: 0.34, pattern: [
        ...rep(8, D3 - 12, 'aeolian', [[0, 1, 16, 0.9]],
          { shift: [0, 0, -2, -2, 3, 3, 0, 0] }),
      ] },
      // Kettles on the bar lines, and the pair answering each other at the turn.
      { name: 'timp', wave: 'noise', gain: 0.3,
        pattern: beat(8, [0], 'timp', 0.55)
          .concat(hits([56, 60, 120, 124], 'timphi', 0.4), hits([112], 'gong', 0.5)) },
    ],
  },

  // ── RIVER BALLAD — "Down the Chionthar" ───────────────────────────────────
  // An ORIGINAL tavern song for Baldur's Gate, not a cover of anyone's. The
  // Chionthar is the river the city stands on, so the tune moves the way the
  // barge traffic does: a long lilting three-feel, the fiddle carrying it, the
  // lute walking underneath, and a bodhrán keeping the oars honest. Dorian, so
  // it is wistful without being a dirge — a song for people who work water.
  rivertune: {
    title: 'Down the Chionthar', contexts: ['tavern', 'inn'], weight: 1,
    bpm: 96, loopBars: 8, gain: 0.88,
    layers: [
      { name: 'fiddle', inst: 'vielle', gain: 0.32, pattern: [
        ...tune(D4, 'dorian', 0, [
          [5, 6], [4, 3], [3, 3], [4, 4],
          [3, 6], [2, 3], [1, 3], [2, 4],
          [1, 6], [2, 3], [3, 3], [5, 4],
          [4, 12], [null, 4],
          [5, 6], [6, 3], [5, 3], [4, 4],
          [3, 6], [4, 3], [3, 3], [2, 4],
          [1, 6], [2, 3], [3, 3], [2, 4],
          [1, 12], [null, 4],
        ]),
      ] },
      // The whistle takes the second half an octave up, the way a second player
      // joins a chorus once everyone knows how it goes.
      { name: 'whistle', inst: 'recorder', gain: 0.15, pattern: [
        ...tune(D4 + 12, 'dorian', 64, [
          [5, 6], [6, 3], [5, 3], [4, 4],
          [3, 6], [4, 3], [3, 3], [2, 4],
          [1, 6], [2, 3], [3, 3], [2, 4],
          [1, 12], [null, 4],
        ]),
      ] },
      { name: 'lute', inst: 'lute', gain: 0.24, pattern: [
        ...rep(8, D3, 'dorian', [
          [0, 1, 3, 0.85], [3, 5, 3, 0.4], [6, 8, 3, 0.45],
          [9, 5, 3, 0.35], [12, 3, 2, 0.5], [14, 5, 2, 0.3],
        ], { shift: [0, 0, -2, -2, 5, 5, 3, 0] }),
      ] },
      { name: 'celli', inst: 'celli', gain: 0.22, pattern: [
        ...rep(8, D3 - 12, 'dorian', [[0, 1, 10, 0.8], [10, 5, 6, 0.55]],
          { shift: [0, 0, -2, -2, 5, 5, 3, 0] }),
      ] },
      { name: 'perc', wave: 'noise', gain: 0.24,
        pattern: beat(8, [0, 6], 'frame', 0.5)
          .concat(beat(8, [3, 9, 12], 'frame', 0.22), beat(8, [14], 'shaker', 0.16)) },
    ],
  },
};

// The polyphony books. Each is a separate module so its tracks can be written
// without touching this file; build() is handed the helpers rather than
// importing them, which would be a cycle.
const BOOK_HELPERS = { SPB, MODES, noteToMidi, deg, tune, rep, drone, pluckFig, hits, beat };
const BOOKS = [buildSacred, buildSecular].map((b) => {
  try { return b(BOOK_HELPERS) || {}; } catch (e) { try { console.error('[music] a track book failed to build', e); } catch (e2) { /* ignore */ } return {}; }
});
for (const book of BOOKS) Object.assign(TRACKS, book.tracks || {});

/** Track ids grouped by where they belong, so callers can pick sensibly. */
export const TRACK_GROUPS = {
  menu: ['title'],
  settlement: ['town', 'city', 'inn', 'shop', 'temple'],
  overworld: ['field', 'forest', 'wilds', 'night'],
  underground: ['dungeon', 'cave', 'undermountain'],
  combat: ['battle', 'boss', 'dragon'],
  sting: ['victory', 'defeat', 'lament'],
  mood: ['tense', 'mystery', 'camp'],
  grand: ['orchestral', 'rivertune'],
};
for (const book of BOOKS) {
  for (const [g, ids] of Object.entries(book.groups || {})) TRACK_GROUPS[g] = [...new Set([...(TRACK_GROUPS[g] || []), ...ids])];
}

const BOOK_NAMES = ['sacred', 'secular'];
const BOOK_OF = {};
BOOKS.forEach((b, i) => { for (const id of Object.keys(b.tracks || {})) BOOK_OF[id] = BOOK_NAMES[i]; });

/**
 * Every track as a songbook lists it, in score order: { id, title, form,
 * mood, source, contexts, weight, intensity, seconds (one pass), room, book
 * ('first' | 'sacred' | 'secular') }. Fresh objects, so a UI may sort them.
 */
export function trackCatalogue() {
  return Object.keys(TRACKS).map((id) => {
    const t = TRACKS[id], notes = CATALOGUE[id] || {};
    return {
      id, title: t.title || id, form: notes.form || '', mood: notes.mood || '', source: notes.source || null,
      contexts: (t.contexts || []).slice(), weight: t.weight ?? 1, intensity: t.intensity ?? null,
      seconds: Math.round((t.loopBars || 4) * SPB * 15 / (t.bpm || 90)), room: t.room || null,
      book: BOOK_OF[id] || 'first',
    };
  });
}

// ── where the music comes from ──────────────────────────────────────────────
//
// The game asks for PLACES, never tunes: a map's `music:` names a context
// (docs/OVERHAUL.md §4.7) and audio.js rotates among every track that answers
// it. These three functions are the whole vocabulary between the world and
// the score, so a new map, biome or kind of fight is routed here and nowhere
// else.

/** The context a biome implies when a map does not name its own. */
const BIOME_CONTEXT = Object.freeze({
  city: 'city', plains: 'field', road: 'road', forest: 'forest', 'pine-forest': 'forest',
  hills: 'hills', mountain: 'mountain', tundra: 'mountain', coast: 'coast', marsh: 'marsh',
  ruins: 'tense', 'ash-waste': 'tense', cave: 'cave', mine: 'cave', dungeon: 'dungeon',
  crypt: 'crypt', underdark: 'underdark',
});

// Open country and the streets go quiet after dark and hear the night's
// tunes instead; a temple, a keep, a crypt or a place already on edge keeps
// its own music, because what it is matters more than the hour.
const NIGHT_YIELDS = new Set(['field', 'road', 'travel', 'forest', 'hills', 'mountain', 'coast',
  'town', 'village', 'city', 'market']);

/** The context for a biome: an `indoor` settlement is a common room, open country at `night` is 'night'. */
export function trackForBiome(biome, { night = false, indoor = false } = {}) {
  const ctx = BIOME_CONTEXT[biome] || 'field';
  if (indoor) return ctx === 'city' || ctx === 'field' || ctx === 'coast' ? 'inn' : ctx;
  return night && NIGHT_YIELDS.has(ctx) ? 'night' : ctx;
}

/**
 * What a map plays right now: its own `music:` context, else its biome's,
 * yielding to 'night' outdoors after dark. A map may still name a plain
 * track id ('wilds'), which then plays as written.
 */
export function musicForMap(map, { night = false } = {}) {
  if (!map) return 'field';
  const ctx = map.music || trackForBiome(map.biome, { indoor: map.indoor });
  return night && !map.indoor && NIGHT_YIELDS.has(ctx) ? 'night' : ctx;
}

const DANGER = Object.freeze({ trivial: 1, easy: 1, low: 1, medium: 2, moderate: 2, hard: 3, high: 3, deadly: 3 });

/**
 * The music a fight deserves, from what is on the field: `{ context,
 * intensity }` for `Audio.music(context, { intensity })`. A grown dragon, or
 * something far beyond the party, is 'dragon'; a boss or a legendary
 * creature is 'boss'; anything else is 'battle' at 1 (a skirmish), 2 (a
 * proper fight) or 3 (the line is giving ground), starting from the
 * difficulty the encounter was budgeted at and moved by how the foes actually
 * compare with the party.
 */
export function battleCue(enc) {
  const foes = [], party = [];
  for (const u of (enc && enc.units) || []) {
    if (u && u.side === 'party') party.push(u);
    else if (u && u.side === 'foe') foes.push(u);
  }
  const cr = (u) => Number(u.cr) || 0;
  const level = party.length ? party.reduce((n, u) => n + (Number(u.level) || 1), 0) / party.length : 1;
  const top = foes.reduce((m, u) => Math.max(m, cr(u)), 0);
  if (foes.some((u) => ((u.creatureType || u.monsterType || u.type) === 'dragon' && cr(u) >= 6) || (cr(u) >= 10 && cr(u) >= level + 3))) {
    return { context: 'dragon', intensity: 3 };
  }
  if ((enc && enc.boss) || foes.some((u) => u.boss || u.legendary)) return { context: 'boss', intensity: 3 };
  let n = DANGER[String((enc && enc.difficulty) || 'medium').toLowerCase()] || 2;
  if (top >= level + 2 || foes.length >= 2 * Math.max(1, party.length) + 2) n++;
  else if (top <= level - 4 && foes.length <= party.length) n--;
  return { context: 'battle', intensity: Math.max(1, Math.min(3, n)) };
}

