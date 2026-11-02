// src/core/audio.js — procedural WebAudio: synthesised SFX, the music sequencer, rooms, mastering and context rotation for Sword Coast Chronicles.
//
// Everything here is generated from oscillators, noise buffers, gain envelopes and
// biquad filters. No audio files, no external libraries. The module is written so
// that a missing / blocked / suspended AudioContext degrades to silence instead of
// throwing — the game must keep running on browsers with no WebAudio at all.
// What an instrument sounds like lives in core/synth.js; the notes in core/music.js.
//
// Signal graph:
//    sfx voices ─────────────────────────────────────▶ sfxBus ──┐
//    player(A) ─┬─▶ dry(room A) ─▶ dryBus ─┐                     ├─▶ master ─▶ limiter ─▶ destination
//               └─▶ room A convolver ─▶ wetBus ─┴─▶ glue comp ─▶ musicBus ─▶ duck ─┘
//    player(B) ─┘ (a second player exists during a crossfade or a segue)

import { makeRNG } from './rng.js';
import { TRACKS, SPB, INSTRUMENTS, TRACK_GROUPS, trackForBiome, trackCatalogue } from './music.js';
import { makeEnv, noiseBuffers, roomFor, roomDone, setRoomLevel, layerRuntime, releaseLayer, playNote, playDrum, ROOMS } from './synth.js';
import { LOUDNESS, REFERENCE } from './music_loudness.js';

// Dedicated RNG stream for audio jitter. Deliberately NOT the global `rng`: audio
// must never consume numbers from the gameplay stream or saves would desync.
const arng = makeRNG('sword-coast-audio');

// ─────────────────────────────────────────────────────────────────────────────
// Note / pitch helpers
// ─────────────────────────────────────────────────────────────────────────────

const SEMI = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

/** "A4" | "F#3" | "Bb5" -> MIDI number. Returns NaN for junk. */
export function noteToMidi(name) {
  if (typeof name === 'number') return name;
  const m = /^([A-Ga-g])([#s+]*|[b-]*)(-?\d+)$/.exec(String(name).trim());
  if (!m) return NaN;
  let n = SEMI[m[1].toLowerCase()];
  for (const c of m[2]) n += (c === '#' || c === 's' || c === '+') ? 1 : -1;
  return (parseInt(m[3], 10) + 1) * 12 + n;
}

/** MIDI number -> Hz (A4 = 69 = 440 Hz, equal temperament). */
export function midiToFreq(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

/** Accepts a Hz number (>= 20), a MIDI number (< 20 treated as MIDI is ambiguous, so use names) or a note name. */
function freqOf(note, transpose = 0) {
  if (typeof note === 'number') return note > 0 && note < 128 ? midiToFreq(note + transpose) : note;
  const midi = noteToMidi(note);
  return Number.isNaN(midi) ? 440 : midiToFreq(midi + transpose);
}

/** Key name -> semitone transpose from C. Used to move a whole track into another key. */
function keyTranspose(key) {
  if (!key) return 0;
  const midi = noteToMidi(String(key).replace(/m(in(or)?)?$/i, '') + '4');
  return Number.isNaN(midi) ? 0 : ((midi - 60) % 12 + 12) % 12;
}

// ─────────────────────────────────────────────────────────────────────────────
// Engine state
// ─────────────────────────────────────────────────────────────────────────────

const state = {
  ctx: null,
  master: null,
  musicBus: null,
  sfxBus: null,
  ok: false,          // true once a context exists and the graph is built
  dead: false,        // true if WebAudio is unavailable — stop trying
  vol: { master: 0.7, music: 0.55, sfx: 0.8 },
  muted: false,
  noiseBuf: null,     // white noise, 2 s
  pinkBuf: null,      // pink-ish noise (softer, for wind / roars)
  amb: null,          // the looping weather bed: { kind, intensity, gain, srcs }
  pendingAmb: null,   // a sky asked for before the context was allowed to run
  voices: 0,          // live sfx voices, for the polyphony cap
  lastAt: Object.create(null), // sfx name -> ctx time of last trigger (machine-gun guard)
  // music
  env: null,          // synth env for the live context (see core/synth.js)
  players: [],        // active MusicPlayer instances (2 during a crossfade)
  currentId: null,
  pendingId: null,
  timer: null,        // setInterval handle for the lookahead scheduler
  ahead: 0.2,         // current lookahead; widens when the tab's timers are throttled
  lastTick: 0,
  fanfareResume: null,// track id to return to after a one-shot fanfare
  duckUntil: 0,
  // context rotation (docs/OVERHAUL.md §4.7)
  context: null,      // the context the current track is serving, or null for a plain track id
  intensity: null,    // 1..3 when a fight asked for music by danger (music.js battleCue)
  rotation: { loops: 0, history: [] },
  songbook: { pinned: Object.create(null), banned: new Set() },
  place: null,        // () => { map, day }: seeds which tune a place gets today
};

const MAX_VOICES = 24;       // hard polyphony cap; extra sfx are dropped, not queued
const LOOKAHEAD_MS = 25;     // scheduler wake-up interval
const SCHEDULE_AHEAD = 0.2;  // seconds of music scheduled beyond `now`
const CROSSFADE = 0.6;       // seconds

// DynamicsCompressorNode applies its own automatic makeup gain (the Web Audio
// spec's "makeup = (1 / full-range gain) ^ 0.6"), which would lift quiet music
// by several dB. These trims cancel it, measured in Chromium by rendering a
// quiet tone through each stage (+3.85 dB and +1.14 dB), so the compressors
// only ever turn peaks DOWN and a quiet passage plays exactly as written.
const GLUE_TRIM = 0.642;
const LIMIT_TRIM = 0.877;

/**
 * The music's mastering: dry and wet sums into a gentle glue compressor, so a
 * stacked choir plus a chapel's reverb bends instead of piling up.
 */
function buildMusicChain(ctx) {
  const dry = ctx.createGain(), wet = ctx.createGain(), sum = ctx.createGain();
  dry.connect(sum); wet.connect(sum);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 2.2;
  comp.attack.value = 0.025; comp.release.value = 0.3;
  const trim = ctx.createGain();
  trim.gain.value = GLUE_TRIM;
  sum.connect(comp); comp.connect(trim);
  return { bus: { dry, wet }, out: trim };
}

/** The last word before the speakers: a fast, high limiter so nothing ever clips. */
function buildLimiter(ctx) {
  const lim = ctx.createDynamicsCompressor();
  lim.threshold.value = -2; lim.knee.value = 0; lim.ratio.value = 20;
  lim.attack.value = 0.002; lim.release.value = 0.12;
  const trim = ctx.createGain();
  trim.gain.value = LIMIT_TRIM;
  lim.connect(trim);
  return { input: lim, out: trim };
}

/** Lazily create the AudioContext. MUST be called from a user gesture on most browsers. */
function ensure() {
  if (state.ok) { resume(); return true; }
  if (state.dead) return false;
  const AC = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);
  if (!AC) { state.dead = true; return false; }
  try {
    const ctx = new AC();
    const master = ctx.createGain();
    const musicBus = ctx.createGain();
    const duckGain = ctx.createGain();   // separate node so ducking never fights setVolume()
    const sfxBus = ctx.createGain();
    const chain = buildMusicChain(ctx);
    const limiter = buildLimiter(ctx);
    chain.out.connect(musicBus);
    musicBus.connect(duckGain);
    duckGain.connect(master);
    sfxBus.connect(master);
    master.connect(limiter.input);
    limiter.out.connect(ctx.destination);
    state.ctx = ctx; state.master = master; state.musicBus = musicBus; state.sfxBus = sfxBus;
    state.duckGain = duckGain;
    // Flush anything that was requested before the context was allowed to run.
    try { ctx.onstatechange = () => { if (ctx.state === 'running') flushPending(); }; } catch (e) { /* ignore */ }
    const nb = noiseBuffers(ctx);
    state.noiseBuf = nb.noise; state.pinkBuf = nb.pink;
    state.env = makeEnv(ctx, chain.bus, { live: true, noise: nb });
    state.ok = true;
    applyVolumes(0);
    resume();
    return true;
  } catch (e) {
    state.dead = true;
    return false;
  }
}

/** Contexts start 'suspended' until a gesture; retry cheaply on every audio call. */
function resume() {
  const ctx = state.ctx;
  if (!ctx) return;
  if (ctx.state === 'suspended' || ctx.state === 'interrupted') {
    try { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ }
  }
}

function now() { return state.ok ? state.ctx.currentTime : 0; }

/** Push the volume model into the gain nodes. `ramp` seconds of smoothing avoids clicks. */
function applyVolumes(ramp = 0.05) {
  if (!state.ok) return;
  const t = now();
  const m = state.muted ? 0 : state.vol.master;
  setGain(state.master, m, t, ramp);
  setGain(state.musicBus, state.vol.music, t, ramp);
  setGain(state.sfxBus, state.vol.sfx, t, ramp);
}

function setGain(node, v, t, ramp) {
  const p = node.gain;
  try {
    p.cancelScheduledValues(t);
    p.setValueAtTime(Math.max(0.0001, p.value), t);
    if (ramp > 0) p.linearRampToValueAtTime(Math.max(0, v), t + ramp);
    else p.setValueAtTime(Math.max(0, v), t);
  } catch (e) { try { p.value = v; } catch (e2) { /* ignore */ } }
}

/** Voice bookkeeping so a spammed sfx can't melt the audio thread. */
function claimVoice(dur) {
  if (state.voices >= MAX_VOICES) return false;
  state.voices++;
  const ms = Math.min(6000, Math.max(40, dur * 1000 + 120));
  setTimeout(() => { state.voices = Math.max(0, state.voices - 1); }, ms);
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Voice builders — the primitives every sfx is composed from
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single pitched voice.
 * @param {object} o
 *   freq      Hz or note name ("A4"); required
 *   type      'sine'|'square'|'triangle'|'sawtooth' (default 'square')
 *   dur       seconds of sustain+decay (default 0.15)
 *   vol       peak gain (default 0.3)
 *   attack    seconds to peak (default 0.005)
 *   decay     seconds of release tail (default = dur, exponential)
 *   hold      seconds held at peak before decay (default 0)
 *   slideTo   Hz/note to glide to over `dur` (portamento)
 *   slideCurve 'exp'|'lin'
 *   vibrato   {rate, depth} — depth in Hz
 *   detune    cents
 *   filter    {type,freq,q,sweepTo} biquad on this voice
 *   pan       -1..1
 *   delay     seconds to wait before starting
 *   dest      AudioNode override (defaults to the sfx bus)
 */
export function tone(o = {}) {
  if (!ensure()) return null;
  const ctx = state.ctx;
  const t0 = now() + (o.delay || 0);
  const dur = Math.max(0.01, o.dur ?? 0.15);
  const vol = o.vol ?? 0.3;
  const atk = Math.min(o.attack ?? 0.005, dur * 0.9);
  const dec = o.decay ?? dur;
  const hold = o.hold ?? 0;

  const osc = ctx.createOscillator();
  osc.type = o.type || 'square';
  const f0 = freqOf(o.freq ?? 440);
  osc.frequency.setValueAtTime(Math.max(1, f0), t0);
  if (o.detune) try { osc.detune.setValueAtTime(o.detune, t0); } catch (e) { /* ignore */ }
  if (o.slideTo != null) {
    const f1 = Math.max(1, freqOf(o.slideTo));
    if (o.slideCurve === 'lin') osc.frequency.linearRampToValueAtTime(f1, t0 + dur);
    else osc.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  }

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(Math.max(0.0002, vol), t0 + atk);
  if (hold > 0) g.gain.setValueAtTime(Math.max(0.0002, vol), t0 + atk + hold);
  // Exponential release reads as a "pluck"; linear reads as a fade. Chiptunes want the pluck.
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + atk + hold + Math.max(0.01, dec));

  let node = osc;
  if (o.filter) node = chainFilter(node, o.filter, t0, dur);
  const out = o.dest || state.sfxBus;
  connectPanned(node, g, out, o.pan);

  if (o.vibrato) {
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(o.vibrato.rate ?? 6, t0);
    lg.gain.setValueAtTime(o.vibrato.depth ?? 6, t0);
    lfo.connect(lg); lg.connect(osc.frequency);
    lfo.start(t0); lfo.stop(t0 + atk + hold + dec + 0.05);
  }

  const stopAt = t0 + atk + hold + dec + 0.05;
  osc.start(t0);
  osc.stop(stopAt);
  return { osc, gain: g, endsAt: stopAt };
}

/**
 * A noise burst — the percussive half of every impact, whoosh and elemental effect.
 * @param {object} o
 *   dur, vol, attack, decay, delay, pan, dest  (as in tone)
 *   filter {type:'lowpass'|'highpass'|'bandpass', freq, q, sweepTo}
 *   sweep  shorthand for a lowpass sweeping freq -> sweep
 *   pink   true for the softer pink buffer (wind, roars, fire)
 *   rate   playbackRate of the buffer (pitch of the hiss)
 */
export function noise(o = {}) {
  if (!ensure()) return null;
  const ctx = state.ctx;
  const t0 = now() + (o.delay || 0);
  const dur = Math.max(0.01, o.dur ?? 0.15);
  const vol = o.vol ?? 0.25;
  const atk = Math.min(o.attack ?? 0.002, dur * 0.9);
  const dec = o.decay ?? dur;

  const src = ctx.createBufferSource();
  src.buffer = o.pink ? state.pinkBuf : state.noiseBuf;
  src.loop = true;
  if (o.rate) src.playbackRate.setValueAtTime(o.rate, t0);
  // Start at a random offset so consecutive hits aren't bit-identical.
  const off = arng.float(0, 1.5);

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(Math.max(0.0002, vol), t0 + atk);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + atk + Math.max(0.01, dec));

  const filt = o.filter || (o.sweep ? { type: 'lowpass', freq: 6000, q: 1, sweepTo: o.sweep } : null);
  let node = src;
  if (filt) node = chainFilter(node, filt, t0, dur);
  connectPanned(node, g, o.dest || state.sfxBus, o.pan);

  const stopAt = t0 + atk + dec + 0.05;
  try { src.start(t0, off); } catch (e) { src.start(t0); }
  src.stop(stopAt);
  return { src, gain: g, endsAt: stopAt };
}

/** Wire `src` through a biquad, optionally sweeping its cutoff over `dur`. Returns the filter. */
function chainFilter(src, f, t0, dur) {
  const ctx = state.ctx;
  const bq = ctx.createBiquadFilter();
  bq.type = f.type || 'lowpass';
  bq.frequency.setValueAtTime(Math.max(20, f.freq ?? 1200), t0);
  if (f.q != null) bq.Q.setValueAtTime(f.q, t0);
  if (f.gain != null) try { bq.gain.setValueAtTime(f.gain, t0); } catch (e) { /* ignore */ }
  if (f.sweepTo != null) bq.frequency.exponentialRampToValueAtTime(Math.max(20, f.sweepTo), t0 + (f.sweepDur ?? dur));
  src.connect(bq);
  return bq;
}

/** node -> gain -> [panner] -> dest. StereoPanner is missing on old Safari; degrade gracefully. */
function connectPanned(node, gain, dest, pan) {
  node.connect(gain);
  if (pan != null && state.ctx.createStereoPanner) {
    const p = state.ctx.createStereoPanner();
    try { p.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), now()); } catch (e) { /* ignore */ }
    gain.connect(p); p.connect(dest);
  } else {
    gain.connect(dest);
  }
}

/** Play several `tone` specs simultaneously (a chord). `common` is merged into each. */
export function chord(specs, common = {}) {
  const out = [];
  for (const s of specs) out.push(tone(Object.assign({}, common, typeof s === 'object' ? s : { freq: s })));
  return out;
}

/** Play tone specs in sequence. `gap` seconds between onsets (default: each note's dur). */
export function arp(specs, common = {}, gap = null) {
  let t = common.delay || 0;
  const out = [];
  for (const s of specs) {
    const spec = Object.assign({}, common, typeof s === 'object' ? s : { freq: s });
    spec.delay = t;
    out.push(tone(spec));
    t += gap != null ? gap : (spec.dur ?? 0.12);
  }
  return out;
}

/** ±cents of pitch jitter so a repeated sfx never machine-guns identically. */
function jitter(cents = 30) { return arng.float(-cents, cents); }
/** Multiply a frequency by a small random amount (cents -> ratio). */
function jf(f, cents = 30) { return freqOf(f) * Math.pow(2, jitter(cents) / 1200); }

// ─────────────────────────────────────────────────────────────────────────────
// SFX catalogue
//
// Each entry is `(A) => void` where A is the normalised opts bundle:
//   A.g   volume multiplier (caller's opts.vol, default 1)
//   A.pan stereo position or undefined
//   A.d   start delay in seconds
//   A.pm  pitch multiplier from opts.pitch (semitones)
// Design rules: UI blips stay under 0.12 s, combat hits land in 0.15–0.35 s,
// spells and stingers may run long. Every entry uses jitter so repeats breathe.
// ─────────────────────────────────────────────────────────────────────────────

/** Minimum seconds between two triggers of the same sfx name (anti machine-gun). */
const THROTTLE = {
  cursor: 0.035, step: 0.09, 'footstep-grass': 0.09, 'footstep-stone': 0.09,
  hit: 0.03, slash: 0.04, dice: 0.03, lowhp: 0.9, page: 0.05, coin: 0.04,
};

const SFX = {
  // ── UI ────────────────────────────────────────────────────────────────────
  // Dry, high, very short. These fire constantly while navigating menus.
  cursor: (A) => {
    tone({ freq: jf(1180, 45) * A.pm, type: 'square', dur: 0.045, vol: 0.10 * A.g, attack: 0.001, decay: 0.04, pan: A.pan, delay: A.d });
  },
  select: (A) => {
    // Rising perfect fifth — the classic "yes".
    tone({ freq: jf(760, 20) * A.pm, type: 'square', dur: 0.05, vol: 0.13 * A.g, attack: 0.001, decay: 0.05, pan: A.pan, delay: A.d });
    tone({ freq: jf(1140, 20) * A.pm, type: 'square', dur: 0.09, vol: 0.12 * A.g, attack: 0.001, decay: 0.08, pan: A.pan, delay: A.d + 0.045 });
  },
  back: (A) => {
    // Falling fourth — the mirror of `select`.
    tone({ freq: jf(700, 20) * A.pm, type: 'square', dur: 0.05, vol: 0.11 * A.g, attack: 0.001, decay: 0.05, pan: A.pan, delay: A.d });
    tone({ freq: jf(470, 20) * A.pm, type: 'square', dur: 0.09, vol: 0.10 * A.g, attack: 0.001, decay: 0.09, pan: A.pan, delay: A.d + 0.04 });
  },
  error: (A) => {
    // Minor second buzz: two clashing squares through a lowpass. Unmistakably "no".
    tone({ freq: 196 * A.pm, type: 'square', dur: 0.18, vol: 0.13 * A.g, attack: 0.002, decay: 0.16, filter: { type: 'lowpass', freq: 1400, q: 2 }, pan: A.pan, delay: A.d });
    tone({ freq: 208 * A.pm, type: 'square', dur: 0.18, vol: 0.11 * A.g, attack: 0.002, decay: 0.16, pan: A.pan, delay: A.d + 0.01 });
  },
  open: (A) => {
    // Menu window sliding open: quick upward arpeggio + a soft air swell.
    arp(['C5', 'E5', 'G5'], { type: 'triangle', dur: 0.07, vol: 0.10 * A.g, attack: 0.002, decay: 0.07, pan: A.pan, delay: A.d }, 0.028);
    noise({ dur: 0.14, vol: 0.05 * A.g, pink: true, filter: { type: 'bandpass', freq: 900, q: 1.2, sweepTo: 2600 }, pan: A.pan, delay: A.d });
  },
  close: (A) => {
    arp(['G5', 'E5', 'C5'], { type: 'triangle', dur: 0.06, vol: 0.09 * A.g, attack: 0.002, decay: 0.06, pan: A.pan, delay: A.d }, 0.026);
    noise({ dur: 0.12, vol: 0.05 * A.g, pink: true, filter: { type: 'bandpass', freq: 2400, q: 1.2, sweepTo: 700 }, pan: A.pan, delay: A.d });
  },
  page: (A) => {
    // Paper turn: a short filtered noise scrape, no pitch at all.
    noise({ dur: 0.12, vol: 0.10 * A.g, pink: true, rate: arng.float(0.9, 1.1), filter: { type: 'highpass', freq: 1600, q: 0.7, sweepTo: 4200 }, pan: A.pan, delay: A.d });
  },

  // ── Movement / world ──────────────────────────────────────────────────────
  step: (A) => { SFX['footstep-grass'](A); },
  'footstep-grass': (A) => {
    // Soft, high, brief rustle. Deliberately quiet: it plays every half-tile.
    noise({ dur: 0.075, vol: 0.055 * A.g, pink: true, rate: arng.float(0.85, 1.25),
      filter: { type: 'bandpass', freq: arng.float(1500, 2400), q: 0.9, sweepTo: 900 }, pan: A.pan, delay: A.d });
  },
  'footstep-stone': (A) => {
    // Hard boot on flagstone: clicky noise transient + a low thud body.
    noise({ dur: 0.05, vol: 0.07 * A.g, rate: arng.float(0.9, 1.2), filter: { type: 'highpass', freq: 900, q: 0.8 }, pan: A.pan, delay: A.d });
    tone({ freq: jf(150, 60), type: 'sine', dur: 0.07, vol: 0.07 * A.g, attack: 0.001, decay: 0.06, slideTo: 90, pan: A.pan, delay: A.d });
  },
  door: (A) => {
    // Creaking hinge (bandpass noise sliding up) then the latch clunk.
    noise({ dur: 0.35, vol: 0.07 * A.g, pink: true, rate: arng.float(0.9, 1.1),
      filter: { type: 'bandpass', freq: 480, q: 6, sweepTo: arng.float(900, 1300), sweepDur: 0.32 }, pan: A.pan, delay: A.d });
    tone({ freq: 120, type: 'square', dur: 0.09, vol: 0.10 * A.g, attack: 0.001, decay: 0.08, slideTo: 70, filter: { type: 'lowpass', freq: 700 }, pan: A.pan, delay: A.d + 0.3 });
  },
  chest: (A) => {
    // Lid creak, latch, then a small sparkle so loot always feels rewarding.
    noise({ dur: 0.28, vol: 0.08 * A.g, pink: true, filter: { type: 'bandpass', freq: 420, q: 7, sweepTo: 1000, sweepDur: 0.26 }, pan: A.pan, delay: A.d });
    tone({ freq: 95, type: 'square', dur: 0.12, vol: 0.11 * A.g, attack: 0.001, decay: 0.11, filter: { type: 'lowpass', freq: 600 }, pan: A.pan, delay: A.d + 0.26 });
    arp(['G5', 'B5', 'D6', 'G6'], { type: 'triangle', dur: 0.11, vol: 0.09 * A.g, attack: 0.002, decay: 0.13, pan: A.pan, delay: A.d + 0.34 }, 0.055);
  },

  // ── Attacks & impacts ─────────────────────────────────────────────────────
  slash: (A) => {
    // Blade whoosh: fast bandpass noise sweeping down through the swing arc.
    noise({ dur: 0.16, vol: 0.16 * A.g, rate: arng.float(0.9, 1.15),
      filter: { type: 'bandpass', freq: arng.float(2600, 3400), q: 1.4, sweepTo: 600, sweepDur: 0.15 }, pan: A.pan, delay: A.d });
    tone({ freq: jf(620, 80), type: 'sawtooth', dur: 0.1, vol: 0.05 * A.g, attack: 0.002, decay: 0.09, slideTo: 180, pan: A.pan, delay: A.d });
  },
  hit: (A) => {
    // Weapon connecting with meat/mail: low square thump + broadband crack.
    tone({ freq: jf(210, 70) * A.pm, type: 'square', dur: 0.12, vol: 0.16 * A.g, attack: 0.001, decay: 0.11, slideTo: 70,
      filter: { type: 'lowpass', freq: 1600, q: 1 }, pan: A.pan, delay: A.d });
    noise({ dur: 0.1, vol: 0.13 * A.g, filter: { type: 'lowpass', freq: 3200, q: 0.9, sweepTo: 500 }, pan: A.pan, delay: A.d });
  },
  hitcrit: (A) => {
    // A natural 20: everything `hit` does, plus a sub-bass drop and a bright ring.
    tone({ freq: 300, type: 'square', dur: 0.22, vol: 0.20 * A.g, attack: 0.001, decay: 0.21, slideTo: 55, filter: { type: 'lowpass', freq: 2200 }, pan: A.pan, delay: A.d });
    noise({ dur: 0.24, vol: 0.20 * A.g, filter: { type: 'lowpass', freq: 5200, q: 1, sweepTo: 320 }, pan: A.pan, delay: A.d });
    tone({ freq: 1320, type: 'triangle', dur: 0.3, vol: 0.10 * A.g, attack: 0.002, decay: 0.3, slideTo: 990, pan: A.pan, delay: A.d + 0.02 });
    tone({ freq: 44, type: 'sine', dur: 0.35, vol: 0.22 * A.g, attack: 0.004, decay: 0.34, pan: A.pan, delay: A.d + 0.01 });
  },
  miss: (A) => {
    // Whiff: airy noise sweep with no impact transient at all.
    noise({ dur: 0.2, vol: 0.09 * A.g, pink: true, rate: arng.float(0.9, 1.1),
      filter: { type: 'bandpass', freq: 1800, q: 0.8, sweepTo: 380, sweepDur: 0.19 }, pan: A.pan, delay: A.d });
  },
  arrow: (A) => {
    // Bowstring release then the fletching hiss doppler-ing away.
    tone({ freq: jf(340, 60), type: 'triangle', dur: 0.06, vol: 0.10 * A.g, attack: 0.001, decay: 0.05, slideTo: 150, pan: A.pan, delay: A.d });
    noise({ dur: 0.26, vol: 0.09 * A.g, rate: 1.2, filter: { type: 'bandpass', freq: 3600, q: 2.2, sweepTo: 1400, sweepDur: 0.25 }, pan: A.pan, delay: A.d + 0.02 });
  },
  shove: (A) => {
    // Body-check: dull low thud, cloth rustle, no metal.
    tone({ freq: jf(120, 60), type: 'sine', dur: 0.18, vol: 0.18 * A.g, attack: 0.003, decay: 0.17, slideTo: 55, pan: A.pan, delay: A.d });
    noise({ dur: 0.16, vol: 0.09 * A.g, pink: true, filter: { type: 'lowpass', freq: 1400, q: 0.8, sweepTo: 400 }, pan: A.pan, delay: A.d });
  },

  // ── Magic ─────────────────────────────────────────────────────────────────
  spell: (A) => {
    // Generic arcane release: shimmering rising fifth pair + airy tail.
    tone({ freq: jf(440, 25) * A.pm, type: 'triangle', dur: 0.3, vol: 0.11 * A.g, attack: 0.02, decay: 0.28, slideTo: 1320, vibrato: { rate: 9, depth: 8 }, pan: A.pan, delay: A.d });
    tone({ freq: jf(660, 25) * A.pm, type: 'sine', dur: 0.34, vol: 0.08 * A.g, attack: 0.03, decay: 0.31, slideTo: 1760, pan: A.pan, delay: A.d + 0.03 });
    noise({ dur: 0.34, vol: 0.05 * A.g, pink: true, filter: { type: 'bandpass', freq: 900, q: 1.1, sweepTo: 5200 }, pan: A.pan, delay: A.d });
  },
  heal: (A) => {
    // Warm major triad blooming upward — sine + triangle only, no noise, no edge.
    arp(['C5', 'E5', 'G5', 'C6'], { type: 'sine', dur: 0.5, vol: 0.10 * A.g, attack: 0.03, decay: 0.5, pan: A.pan, delay: A.d }, 0.075);
    tone({ freq: 'G4', type: 'triangle', dur: 0.7, vol: 0.06 * A.g, attack: 0.12, decay: 0.6, vibrato: { rate: 4.5, depth: 3 }, pan: A.pan, delay: A.d + 0.05 });
  },
  fire: (A) => {
    // Ignition thump then a long crackling pink-noise roar sweeping down.
    tone({ freq: 180, type: 'sawtooth', dur: 0.18, vol: 0.12 * A.g, attack: 0.004, decay: 0.17, slideTo: 60, filter: { type: 'lowpass', freq: 1200 }, pan: A.pan, delay: A.d });
    noise({ dur: 0.55, vol: 0.17 * A.g, pink: true, rate: arng.float(0.85, 1.1),
      filter: { type: 'lowpass', freq: 4200, q: 1.4, sweepTo: 420, sweepDur: 0.5 }, pan: A.pan, delay: A.d });
    // Crackle: a handful of tiny random pops over the burn.
    for (let i = 0; i < 5; i++) noise({ dur: 0.05, vol: 0.05 * A.g, delay: A.d + arng.float(0.05, 0.42), filter: { type: 'bandpass', freq: arng.float(1800, 4200), q: 6 }, pan: A.pan });
  },
  ice: (A) => {
    // Brittle crystal: high shattering noise + a descending glassy sine.
    noise({ dur: 0.3, vol: 0.11 * A.g, filter: { type: 'highpass', freq: 3200, q: 1.5, sweepTo: 7600 }, pan: A.pan, delay: A.d });
    tone({ freq: jf(2100, 20), type: 'sine', dur: 0.4, vol: 0.09 * A.g, attack: 0.004, decay: 0.4, slideTo: 620, pan: A.pan, delay: A.d });
    arp([2640, 3140, 2200], { type: 'triangle', dur: 0.12, vol: 0.06 * A.g, attack: 0.002, decay: 0.14, pan: A.pan, delay: A.d + 0.04 }, 0.05);
  },
  thunder: (A) => {
    // Crack (bright transient) followed by a rolling low rumble.
    noise({ dur: 0.14, vol: 0.24 * A.g, filter: { type: 'highpass', freq: 1800, q: 0.7, sweepTo: 400 }, pan: A.pan, delay: A.d });
    noise({ dur: 1.1, vol: 0.2 * A.g, pink: true, rate: 0.55, filter: { type: 'lowpass', freq: 900, q: 1.2, sweepTo: 90, sweepDur: 1.0 }, pan: A.pan, delay: A.d + 0.04 });
    tone({ freq: 70, type: 'sine', dur: 0.8, vol: 0.22 * A.g, attack: 0.005, decay: 0.8, slideTo: 34, pan: A.pan, delay: A.d + 0.02 });
  },
  buff: (A) => {
    // Ascending whole-tone shimmer: something good just landed on you.
    arp(['E5', 'G#5', 'B5', 'E6'], { type: 'triangle', dur: 0.22, vol: 0.09 * A.g, attack: 0.006, decay: 0.24, pan: A.pan, delay: A.d }, 0.055);
    noise({ dur: 0.4, vol: 0.04 * A.g, pink: true, filter: { type: 'bandpass', freq: 1400, q: 1.4, sweepTo: 6000 }, pan: A.pan, delay: A.d });
  },
  debuff: (A) => {
    // Descending, detuned, filtered down — the inverse of `buff`.
    arp(['B4', 'G4', 'Eb4', 'B3'], { type: 'sawtooth', dur: 0.24, vol: 0.08 * A.g, attack: 0.008, decay: 0.26,
      filter: { type: 'lowpass', freq: 2200, q: 1.5, sweepTo: 400 }, detune: -18, pan: A.pan, delay: A.d }, 0.06);
    noise({ dur: 0.45, vol: 0.05 * A.g, pink: true, filter: { type: 'bandpass', freq: 5200, q: 1.3, sweepTo: 700 }, pan: A.pan, delay: A.d });
  },

  // ── Rewards & stingers ────────────────────────────────────────────────────
  coin: (A) => {
    // Two tiny bright squares a major third apart — the classic coin chime.
    tone({ freq: jf(1980, 40), type: 'square', dur: 0.06, vol: 0.09 * A.g, attack: 0.001, decay: 0.06, pan: A.pan, delay: A.d });
    tone({ freq: jf(2640, 40), type: 'square', dur: 0.16, vol: 0.08 * A.g, attack: 0.001, decay: 0.17, pan: A.pan, delay: A.d + 0.05 });
  },
  item: (A) => {
    // Item obtained: a confident rising triad with a soft bell tail.
    arp(['G5', 'C6', 'E6'], { type: 'square', dur: 0.09, vol: 0.09 * A.g, attack: 0.002, decay: 0.1, pan: A.pan, delay: A.d }, 0.06);
    tone({ freq: 'G6', type: 'sine', dur: 0.5, vol: 0.06 * A.g, attack: 0.01, decay: 0.5, pan: A.pan, delay: A.d + 0.18 });
  },
  potion: (A) => {
    // Cork pop, three glugs, then the warm swallow.
    tone({ freq: 700, type: 'sine', dur: 0.05, vol: 0.12 * A.g, attack: 0.001, decay: 0.045, slideTo: 1500, pan: A.pan, delay: A.d });
    for (let i = 0; i < 3; i++) {
      tone({ freq: 300 + i * 40, type: 'sine', dur: 0.09, vol: 0.09 * A.g, attack: 0.003, decay: 0.08, slideTo: 170 + i * 30, pan: A.pan, delay: A.d + 0.09 + i * 0.09 });
    }
    tone({ freq: 'C5', type: 'triangle', dur: 0.35, vol: 0.07 * A.g, attack: 0.02, decay: 0.34, slideTo: freqOf('G5'), pan: A.pan, delay: A.d + 0.38 });
  },
  equip: (A) => {
    // Steel on leather: metallic bandpass ring + buckle click.
    noise({ dur: 0.14, vol: 0.10 * A.g, filter: { type: 'bandpass', freq: 2600, q: 3.5, sweepTo: 1500 }, pan: A.pan, delay: A.d });
    tone({ freq: jf(880, 25), type: 'square', dur: 0.13, vol: 0.08 * A.g, attack: 0.001, decay: 0.13, slideTo: 1320, pan: A.pan, delay: A.d + 0.02 });
  },
  unequip: (A) => {
    noise({ dur: 0.13, vol: 0.08 * A.g, filter: { type: 'bandpass', freq: 1700, q: 3.0, sweepTo: 900 }, pan: A.pan, delay: A.d });
    tone({ freq: jf(880, 25), type: 'square', dur: 0.12, vol: 0.07 * A.g, attack: 0.001, decay: 0.12, slideTo: 520, pan: A.pan, delay: A.d + 0.02 });
  },
  quest: (A) => {
    // Journal update: a small horn-ish fanfare, dotted rhythm, no percussion.
    const V = { type: 'square', vol: 0.09 * A.g, attack: 0.006, pan: A.pan };
    tone(Object.assign({ freq: 'D5', dur: 0.12, decay: 0.13, delay: A.d }, V));
    tone(Object.assign({ freq: 'F#5', dur: 0.12, decay: 0.13, delay: A.d + 0.12 }, V));
    tone(Object.assign({ freq: 'A5', dur: 0.34, decay: 0.36, delay: A.d + 0.24 }, V));
    tone({ freq: 'D4', type: 'triangle', dur: 0.6, vol: 0.07 * A.g, attack: 0.01, decay: 0.6, pan: A.pan, delay: A.d + 0.24 });
  },
  levelup: (A) => {
    // Six-note rising major run, then a sustained I chord. The big one.
    const notes = ['C5', 'E5', 'G5', 'C6', 'E6', 'G6'];
    arp(notes, { type: 'square', dur: 0.11, vol: 0.10 * A.g, attack: 0.003, decay: 0.13, pan: A.pan, delay: A.d }, 0.075);
    chord(['C5', 'E5', 'G5', 'C6'], { type: 'triangle', dur: 1.1, vol: 0.07 * A.g, attack: 0.03, decay: 1.05, pan: A.pan, delay: A.d + 0.5 });
    noise({ dur: 0.9, vol: 0.04 * A.g, pink: true, filter: { type: 'bandpass', freq: 900, q: 1.1, sweepTo: 7000, sweepDur: 0.85 }, pan: A.pan, delay: A.d + 0.42 });
  },
  dice: (A) => {
    // A d20 tumbling: several short woody clicks at irregular spacing.
    const n = 5;
    for (let i = 0; i < n; i++) {
      const d = A.d + i * arng.float(0.035, 0.06);
      tone({ freq: arng.float(340, 900), type: 'square', dur: 0.035, vol: 0.07 * A.g * (1 - i / (n + 2)), attack: 0.001, decay: 0.03,
        filter: { type: 'bandpass', freq: arng.float(1200, 2600), q: 2 }, pan: A.pan, delay: d });
      noise({ dur: 0.03, vol: 0.05 * A.g, filter: { type: 'highpass', freq: 2200 }, pan: A.pan, delay: d });
    }
  },

  // ── Battle flow ───────────────────────────────────────────────────────────
  encounter: (A) => {
    // Ambush sting: a rising minor-second alarm over a rumble. Plays into the battle wipe.
    tone({ freq: 'D4', type: 'square', dur: 0.16, vol: 0.13 * A.g, attack: 0.002, decay: 0.16, pan: A.pan, delay: A.d });
    tone({ freq: 'Eb4', type: 'square', dur: 0.16, vol: 0.13 * A.g, attack: 0.002, decay: 0.16, pan: A.pan, delay: A.d + 0.14 });
    tone({ freq: 'D5', type: 'square', dur: 0.5, vol: 0.14 * A.g, attack: 0.002, decay: 0.5, slideTo: freqOf('Eb5'), pan: A.pan, delay: A.d + 0.28 });
    noise({ dur: 0.7, vol: 0.10 * A.g, pink: true, rate: 0.6, filter: { type: 'lowpass', freq: 260, q: 1.4, sweepTo: 1400, sweepDur: 0.65 }, pan: A.pan, delay: A.d });
  },
  victory: (A) => {
    // Short triumphant flourish (the full loop lives in the `victory` music track).
    const V = { type: 'square', vol: 0.10 * A.g, attack: 0.004, pan: A.pan };
    tone(Object.assign({ freq: 'G4', dur: 0.1, decay: 0.1, delay: A.d }, V));
    tone(Object.assign({ freq: 'C5', dur: 0.1, decay: 0.1, delay: A.d + 0.1 }, V));
    tone(Object.assign({ freq: 'E5', dur: 0.1, decay: 0.1, delay: A.d + 0.2 }, V));
    tone(Object.assign({ freq: 'G5', dur: 0.55, decay: 0.6, delay: A.d + 0.3 }, V));
    chord(['C4', 'G4', 'C5'], { type: 'triangle', dur: 0.9, vol: 0.06 * A.g, attack: 0.02, decay: 0.9, pan: A.pan, delay: A.d + 0.3 });
  },
  defeat: (A) => {
    // Sagging chromatic fall into a minor chord.
    arp(['G4', 'F#4', 'F4', 'E4'], { type: 'triangle', dur: 0.28, vol: 0.10 * A.g, attack: 0.01, decay: 0.3,
      filter: { type: 'lowpass', freq: 2400, q: 1, sweepTo: 700 }, pan: A.pan, delay: A.d }, 0.2);
    chord(['C3', 'Eb3', 'G3'], { type: 'sawtooth', dur: 1.4, vol: 0.06 * A.g, attack: 0.05, decay: 1.4,
      filter: { type: 'lowpass', freq: 1200, q: 1, sweepTo: 300 }, pan: A.pan, delay: A.d + 0.8 });
  },
  death: (A) => {
    // A creature drops: descending detuned wail + body-fall thud.
    tone({ freq: jf(520, 60), type: 'sawtooth', dur: 0.6, vol: 0.11 * A.g, attack: 0.006, decay: 0.6, slideTo: 90,
      filter: { type: 'lowpass', freq: 2600, q: 1.2, sweepTo: 400 }, vibrato: { rate: 7, depth: 12 }, pan: A.pan, delay: A.d });
    tone({ freq: 90, type: 'sine', dur: 0.3, vol: 0.16 * A.g, attack: 0.004, decay: 0.3, slideTo: 40, pan: A.pan, delay: A.d + 0.45 });
    noise({ dur: 0.3, vol: 0.08 * A.g, pink: true, filter: { type: 'lowpass', freq: 1100, q: 0.8, sweepTo: 200 }, pan: A.pan, delay: A.d + 0.45 });
  },
  roar: (A) => {
    // Dragon/giant bellow: growling saw pair under a swelling pink roar.
    const base = arng.float(70, 95);
    tone({ freq: base, type: 'sawtooth', dur: 1.0, vol: 0.14 * A.g, attack: 0.06, decay: 0.95, slideTo: base * 0.65,
      filter: { type: 'lowpass', freq: 800, q: 2.5, sweepTo: 260, sweepDur: 0.9 }, vibrato: { rate: 18, depth: 9 }, pan: A.pan, delay: A.d });
    tone({ freq: base * 1.5, type: 'sawtooth', dur: 0.9, vol: 0.08 * A.g, attack: 0.08, decay: 0.85, slideTo: base,
      vibrato: { rate: 23, depth: 14 }, filter: { type: 'lowpass', freq: 1400, q: 2, sweepTo: 400 }, pan: A.pan, delay: A.d + 0.03 });
    noise({ dur: 1.0, vol: 0.10 * A.g, pink: true, rate: 0.7, filter: { type: 'bandpass', freq: 500, q: 0.9, sweepTo: 180, sweepDur: 0.95 }, pan: A.pan, delay: A.d });
  },
  lowhp: (A) => {
    // The nagging "you're about to die" pulse. Two beeps, dry and urgent.
    tone({ freq: 'A5', type: 'square', dur: 0.09, vol: 0.09 * A.g, attack: 0.001, decay: 0.08, pan: A.pan, delay: A.d });
    tone({ freq: 'A5', type: 'square', dur: 0.09, vol: 0.09 * A.g, attack: 0.001, decay: 0.08, pan: A.pan, delay: A.d + 0.14 });
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Music engine: the lookahead sequencer, players, rooms, loudness and context
// rotation. The notes are in core/music.js; what they sound like, core/synth.js.
// ─────────────────────────────────────────────────────────────────────────────

const _pending = [];  // callbacks deferred until the context is actually running
function flushPending() {
  while (_pending.length) { const f = _pending.shift(); try { f(); } catch (e) { /* ignore */ } }
  // The sky is usually asked for on the title screen, before a gesture has
  // unlocked audio; start it now that one has.
  if (state.pendingAmb) {
    const p = state.pendingAmb;
    state.pendingAmb = null;
    try { Audio.ambience(p.kind, p.intensity); } catch (e) { /* ignore */ }
  }
}
/** Run `fn` now if the context is running, otherwise once it starts (autoplay policy). */
function whenRunning(fn) {
  if (!ensure()) return false;
  if (state.ctx.state === 'running') { fn(); return true; }
  _pending.push(fn);
  resume();
  return false;
}

const clampN = (v, a, b) => (v < a ? a : v > b ? b : v);

/** The places and moods a track may declare in `contexts` (docs/OVERHAUL.md §4.7). */
export const CONTEXTS = Object.freeze(['title', 'town', 'city', 'village', 'inn', 'tavern', 'shop', 'market',
  'temple', 'crypt', 'castle', 'field', 'road', 'forest', 'hills', 'mountain', 'coast', 'marsh', 'night',
  'dungeon', 'cave', 'underdark', 'battle', 'boss', 'dragon', 'victory', 'defeat', 'lament', 'camp',
  'festival', 'mystery', 'tense', 'travel']);

// Where a track is heard when it does not say (a track's own `room:` wins):
// first by the first score's track ids, then by the first context that implies
// a building, else the stone hall every track used to share.
const ROOM_OF_TRACK = {
  temple: 'chapel', inn: 'tavern', shop: 'tavern', rivertune: 'tavern',
  cave: 'cave', dungeon: 'cave', undermountain: 'cave',
  field: 'open', forest: 'open', night: 'open', wilds: 'open', camp: 'open',
};
const ROOM_OF_CONTEXT = {
  temple: 'chapel', crypt: 'chapel', inn: 'tavern', tavern: 'tavern', shop: 'tavern',
  cave: 'cave', underdark: 'cave', dungeon: 'cave',
  field: 'open', road: 'open', forest: 'open', hills: 'open', mountain: 'open', coast: 'open', marsh: 'open',
  camp: 'open', travel: 'open', night: 'open', village: 'open', market: 'open', festival: 'open',
  castle: 'hall', city: 'hall', town: 'hall',
};
function roomOf(id, track) {
  if (track.room && ROOMS[track.room]) return track.room;
  if (ROOM_OF_TRACK[id]) return ROOM_OF_TRACK[id];
  for (const c of track.contexts || []) if (ROOM_OF_CONTEXT[c]) return ROOM_OF_CONTEXT[c];
  return 'hall';
}

/**
 * Gain that brings a track to the score's reference loudness, from the table
 * measured offline (core/music_loudness.js), within ±9 dB so a deliberately
 * hushed track is lifted, not blared. The track's own `gain` then applies on
 * top as the composer's intent. A track the table has not seen is measured
 * the first time it plays (see measureLater) and plays as written until then.
 */
function loudnessGain(id) {
  const l = LOUDNESS[id] ?? MEASURED.get(id);
  if (!Number.isFinite(l) || REFERENCE == null) return 1;
  return clampN(Math.pow(10, (REFERENCE - l) / 20), 0.35, 2.8);
}

// A book that lands after the last `tools/music-render.mjs --loudness` run would
// otherwise play unnormalised forever, so a track missing from the table is
// measured here, once a session, exactly as the tool measures: a short dry
// offline render (its own context, so the speakers never wait on it) a moment
// after the track has started, then the player eases to the normalised level.
const MEASURED = new Map();            // id -> dB (NaN while in flight or if it failed)
export const TABLE_VOLUME = 0.7 * 0.55; // master x music at the defaults the table is rendered with

/**
 * Gated loudness in dB, in the spirit of BS.1770 without K-weighting: 400 ms
 * blocks on a 100 ms hop, an absolute gate at -70 dBFS and a relative gate 10 dB
 * under the mean, so a sparse track is judged by its notes and not its rests.
 */
export function gatedLoudness(buf, skip = 1) {
  const sr = buf.sampleRate, a = buf.getChannelData(0), b = buf.numberOfChannels > 1 ? buf.getChannelData(1) : a;
  const blk = Math.floor(0.4 * sr), hop = Math.floor(0.1 * sr), es = [];
  for (let s = Math.floor(skip * sr); s + blk <= a.length; s += hop) {
    let e = 0;
    for (let i = s; i < s + blk; i++) e += a[i] * a[i] + b[i] * b[i];
    if (e / (2 * blk) > 1e-7) es.push(e / (2 * blk));
  }
  if (!es.length) return -200;
  const m1 = es.reduce((x, y) => x + y, 0) / es.length;
  const g2 = es.filter((e) => e > m1 * 0.1);
  return 10 * Math.log10(g2.reduce((x, y) => x + y, 0) / g2.length);
}

function measureLater(id) {
  if (REFERENCE == null || LOUDNESS[id] != null || MEASURED.has(id) || typeof OfflineAudioContext === 'undefined') return;
  MEASURED.set(id, NaN);
  setTimeout(() => {
    Audio.render(id, { seconds: 10, sampleRate: 16000, dry: true, normalize: false, volume: TABLE_VOLUME }).then((buf) => {
      const db = gatedLoudness(buf);
      if (!(db > -150)) return;
      MEASURED.set(id, db);
      for (const p of state.players) {
        if (p.id === id && p.normalize && !p.stopping) { p.targetGain = p.baseGain * loudnessGain(id); p.fadeIn(2); }
      }
    }).catch(() => { /* stays unnormalised */ });
  }, 2500);
}

/** Pattern note → MIDI: numbers under 128 are MIDI, larger ones Hz, strings note names. */
function midiOf(n) {
  if (typeof n === 'number') return n > 0 && n < 128 ? n : n >= 128 ? 69 + 12 * Math.log2(n / 440) : NaN;
  return noteToMidi(n);
}

/** Every pitch class a track uses. Ornaments borrow neighbours from it, so a trill stays in the mode. */
function pitchClasses(track, transpose) {
  const pcs = new Set();
  for (const L of track.layers || []) {
    if (L.wave === 'noise') continue;
    for (const e of L.pattern || []) {
      const m = midiOf(e && e[1]);
      if (Number.isFinite(m)) pcs.add((((Math.round(m + transpose)) % 12) + 12) % 12);
    }
  }
  return pcs;
}
/** The nearest note of the track's scale a step above (dir 1) or below (-1). */
function neighbour(pcs, midi, dir) {
  for (let d = 1; d <= 2; d++) { const m = Math.round(midi) + dir * d; if (pcs.has(((m % 12) + 12) % 12)) return m; }
  return Math.round(midi) + dir * 2;
}

const ORNAMENTS = new Set(['mordent', 'trill', 'grace']);

/**
 * A playing instance of one track in one env (the speakers, or an offline
 * render). Owns a gain for fades, a dry send and a room send, and per layer a
 * step-indexed event table plus the layer's synth runtime. Everything a tick
 * needs is precomputed here, so scheduling walks arrays and allocates nothing
 * but the notes themselves.
 */
class MusicPlayer {
  constructor(env, id, track, { loop = true, gain = 1, onEnd = null, onLoop = null, startAt = null, normalize = true, room = null } = {}) {
    const ctx = env.ctx;
    this.env = env; this.id = id; this.track = track; this.loop = loop;
    this.onEnd = onEnd; this.onLoop = onLoop;
    this.done = false; this.stopping = false; this.destroyed = false; this.endStep = Infinity;
    this.stepDur = 60 / (track.bpm || 120) / 4;              // 16th note in seconds
    this.totalSteps = Math.max(1, Math.round((track.loopBars || 4) * SPB));
    this.transpose = (track.transpose || 0) + (track.relative ? keyTranspose(track.key) : 0);
    this.baseGain = gain * (track.gain ?? 1); this.normalize = normalize;
    this.targetGain = this.baseGain * (normalize ? loudnessGain(id) : 1);
    this.gain = ctx.createGain();
    this.gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    this.room = room === false ? null : roomFor(env, room || roomOf(id, track));
    this.dry = ctx.createGain();
    this.dry.gain.value = this.room ? this.room.spec.dry : 1;
    this.gain.connect(this.dry); this.dry.connect(env.bus.dry);
    if (this.room) this.gain.connect(this.room.input);
    this.startTime = startAt ?? ctx.currentTime + 0.06;     // a small pad so the first step isn't in the past
    const pcs = pitchClasses(track, this.transpose);
    this.layers = [];
    for (const L of track.layers || []) {
      try { this.layers.push(this._layer(L, pcs)); } catch (e) { /* a broken layer is skipped, never the track */ }
    }
    this.step = 0;                                           // absolute step counter (grows past totalSteps)
  }

  _layer(L, pcs) {
    const env = this.env, ctx = env.ctx, total = this.totalSteps;
    const node = ctx.createGain();
    node.gain.value = L.gain ?? 0.25;
    if (L.pan && typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.value = clampN(Number(L.pan) || 0, -1, 1);
      node.connect(p); p.connect(this.gain);
    } else node.connect(this.gain);
    const drums = L.wave === 'noise';
    const inst = drums || !L.inst ? null : INSTRUMENTS[L.inst] || null;
    const evs = [];
    for (const e of L.pattern || []) {
      if (!Array.isArray(e)) continue;
      const s0 = Math.round(Number(e[0])), steps = Number(e[2]) || 1, vol = e[3] == null ? 1 : Number(e[3]);
      if (!Number.isFinite(s0) || !(steps > 0) || !Number.isFinite(vol)) continue;
      const s = ((s0 % total) + total) % total;
      if (drums) { evs.push({ s, drum: String(e[1]), steps, vol, shift: 0 }); continue; }
      const midi = midiOf(e[1]);
      if (!Number.isFinite(midi)) continue;
      evs.push({ s, midi: midi + this.transpose, steps, vol, vowel: typeof e[4] === 'string' ? e[4] : null,
        tieIn: false, tieOut: false, orn: null, alt: null, shift: 0 });
    }
    evs.sort((a, b) => a.s - b.s);
    if (!drums) this._ties(evs);
    // Swing: the off-beat eighths (and, half as much, the odd sixteenths) come late.
    const swing = clampN(Number(L.swing) || 0, 0, 0.3);
    const orn = ORNAMENTS.has(L.ornament) ? L.ornament : null;
    const byStep = new Array(total).fill(null);
    for (const ev of evs) {
      if (swing) ev.shift = (ev.s % 4 === 2 ? 2 * swing : ev.s % 2 ? swing : 0) * this.stepDur;
      // Whether a long note is ornamented is decided each time it plays (see
      // _play), so no two passes of the loop are graced quite alike.
      if (orn && ev.steps >= (L.ornamentMin ?? 4)) {
        ev.alt = { ...ev, orn: { type: orn, upper: neighbour(pcs, ev.midi, 1), lower: neighbour(pcs, ev.midi, -1) } };
      }
      (byStep[ev.s] || (byStep[ev.s] = [])).push(ev);
    }
    const midis = drums ? null : [...new Set(evs.map((e) => Math.round(e.midi)))];
    return {
      def: L, node, drums, byStep,
      rt: drums ? null : layerRuntime(env, L, inst, node, { midis }),
      human: clampN(Number(L.humanize) || 0, 0, 80) / 1000,
      ornRate: clampN(L.ornamentRate ?? 0.5, 0, 1),
    };
  }

  /**
   * Mark legato ties. In a line that never overlaps itself, a note that begins
   * exactly where the last one ended is joined to it (and, when the track
   * loops, the last note of the loop to the first). Voices sing a tied line on
   * one breath, and any instrument marked `legato` slurs it; chords never tie.
   */
  _ties(evs) {
    const n = evs.length, total = this.totalSteps;
    if (!n) return;
    for (let i = 1; i < n; i++) if (evs[i].s < evs[i - 1].s + evs[i - 1].steps - 0.01) return;
    if (evs[n - 1].s + evs[n - 1].steps > total + evs[0].s + 0.01) return;
    for (let i = 0; i < n; i++) {
      const wrap = i === n - 1;
      if (wrap && !this.loop) break;
      const a = evs[i], b = wrap ? evs[0] : evs[i + 1];
      if (Math.abs(a.s + a.steps - (wrap ? b.s + total : b.s)) < 0.01) { a.tieOut = true; b.tieIn = true; }
    }
  }

  timeOf(absStep) { return this.startTime + absStep * this.stepDur; }
  get loopSeconds() { return this.totalSteps * this.stepDur; }

  /** Schedule everything that falls before `until`. Returns false once finished. */
  advance(until) {
    if (this.done) return false;
    const total = this.totalSteps;
    while (this.timeOf(this.step) < until) {
      const s = this.step % total;
      if (s === 0 && this.step > 0 && this.onLoop && this.step < this.endStep) this.onLoop(this, this.step / total, this.timeOf(this.step));
      if (this.step >= this.endStep || (!this.loop && this.step >= total)) {
        this.done = true;
        if (this.onEnd) { const f = this.onEnd; this.onEnd = null; f(this.timeOf(this.step)); }
        return false;
      }
      const t = this.timeOf(this.step);
      for (let li = 0; li < this.layers.length; li++) {
        const L = this.layers[li], evs = L.byStep[s];
        if (evs) for (let k = 0; k < evs.length; k++) this._play(L, evs[k], t);
      }
      this.step++;
    }
    return true;
  }

  _play(L, ev, t) {
    const env = this.env;
    let when = t + ev.shift;
    if (L.human) when += (arng.next() + arng.next() - 1) * L.human;
    if (when < env.ctx.currentTime) when = env.ctx.currentTime;
    const vol = L.human ? ev.vol * (0.96 + arng.next() * 0.08) : ev.vol;
    try {
      if (L.drums) { playDrum(env, ev.drum, when, vol, L.node); return; }
      const full = ev.steps * this.stepDur;
      // A 6% gap is the articulation between detached notes; a tied note runs its full length into the next.
      const dur = ev.tieOut ? full : Math.max(0.02, full * 0.94);
      playNote(L.rt, when, ev.midi, dur, vol, ev.alt && arng.next() < L.ornRate ? ev.alt : ev);
    } catch (e) { /* one bad note never stops the music */ }
  }

  fadeIn(dur) { setGain(this.gain, this.targetGain, this.env.ctx.currentTime, dur); }

  /** Fade to silence from `at` (default now), stop the layers' own sources, let go of the room. Safe twice. */
  fadeOut(dur, at = null) {
    if (this.stopping) return;
    this.stopping = true;
    this.done = true;
    const ctx = this.env.ctx, t = Math.max(ctx.currentTime, at ?? 0);
    const p = this.gain.gain;
    try { p.cancelScheduledValues(t); p.setTargetAtTime(0, t, Math.max(0.01, dur / 4)); } catch (e) { /* ignore */ }
    const end = t + dur * 1.8 + 0.1;
    for (const L of this.layers) if (L.rt) releaseLayer(L.rt, end);
    if (this.env.live) setTimeout(() => this.destroy(), Math.max(0, end - ctx.currentTime) * 1000 + 60);
  }

  /** Stop at this loop boundary and let the last notes and the room ring out: a minstrel's segue. */
  segue(boundaryStep, t) {
    this.endStep = boundaryStep;
    this.fadeOut(3, t + 0.6);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    try { this.gain.disconnect(); this.dry.disconnect(); } catch (e) { /* ignore */ }
    if (this.room) roomDone(this.env, this.room);
    const i = state.players.indexOf(this);
    if (i >= 0) state.players.splice(i, 1);
    if (!state.players.length) stopScheduler();
  }
}

function tick() {
  if (!state.ok) return;
  const t = state.ctx.currentTime;
  const gap = t - state.lastTick;
  state.lastTick = t;
  // A hidden or busy tab wakes this timer late (browsers hold background timers
  // to about once a second), so look further ahead then and the music never gaps.
  const hidden = typeof document !== 'undefined' && document.hidden;
  state.ahead = hidden ? 1.4 : gap > 0.12 ? Math.min(1.4, gap * 1.5 + 0.1) : Math.max(SCHEDULE_AHEAD, state.ahead - 0.01);
  const until = t + state.ahead;
  for (let i = state.players.length - 1; i >= 0; i--) { const p = state.players[i]; if (p) p.advance(until); }
}

function startScheduler() {
  if (state.timer != null || !state.ok) return;
  state.lastTick = state.ctx.currentTime;
  state.timer = setInterval(tick, LOOKAHEAD_MS);
}

function stopScheduler() {
  if (state.timer != null) { clearInterval(state.timer); state.timer = null; }
}

/** Fade every live player out and forget the current track id. */
function stopMusic(fade = CROSSFADE) {
  for (const p of state.players.slice()) p.fadeOut(fade);
  state.currentId = null;
  state.context = null;
}

function startTrack(id, { loop = true, fade = CROSSFADE, onEnd = null, startAt = null } = {}) {
  const track = TRACKS[id];
  if (!track || !state.env) return null;
  const p = new MusicPlayer(state.env, id, track, { loop, onEnd, startAt, onLoop: loop ? rotateAtLoop : null });
  state.players.push(p);
  p.advance(now() + state.ahead);
  p.fadeIn(fade);
  startScheduler();
  measureLater(id);
  return p;
}

const livePlayer = (id) => state.players.some((p) => p.id === id && !p.stopping);

// ── context rotation ───────────────────────────────────────────────────────
//
// `Audio.music('town')` names a PLACE, not a tune. Every track that lists the
// context (plus a track of that very name, so the first score's 'town' is in
// its own pool) may answer. Which one a place opens with is seeded by the map
// and the in-game day, so a town has a tune today and perhaps another
// tomorrow; walking between two maps of the same context keeps what is
// playing; and after a few passes the minstrel moves on to another tune of the
// same kind at a loop boundary. A long session never wears one tune thin.

function contextPool(ctxId, { all = false } = {}) {
  const ids = [];
  for (const id in TRACKS) {
    const c = TRACKS[id].contexts;
    if (id === ctxId || (Array.isArray(c) && c.includes(ctxId))) ids.push(id);
  }
  if (all) return ids;
  const ok = ids.filter((id) => !state.songbook.banned.has(id));
  return ok.length ? ok : ids;
}

// A fight asks for music by danger: a track's own `intensity` (1 skirmish, 2
// a proper fight, 3 desperate; 2 when unstated) near the asked-for one is
// strongly preferred, but the pool is never narrowed to nothing.
const INTENSITY_FIT = [1, 0.15, 0.01];

function weightOf(id) {
  const w = Number(TRACKS[id] && TRACKS[id].weight);
  const base = Number.isFinite(w) && w >= 0 ? w : 1;
  if (state.intensity == null) return base;
  const d = Math.abs((Number(TRACKS[id].intensity) || 2) - state.intensity);
  return base * (INTENSITY_FIT[Math.min(2, Math.round(d))]);
}

function weightedPick(pool, u) {
  let total = 0;
  for (const id of pool) total += weightOf(id);
  if (total <= 0) return pool[Math.floor(u * pool.length) % pool.length];
  let x = u * total;
  for (const id of pool) { x -= weightOf(id); if (x < 0) return id; }
  return pool[pool.length - 1];
}

/** Which tune this place plays today: the same map on the same day always opens with the same one. */
function seededPick(pool, ctxId) {
  let place = null;
  try { place = state.place ? state.place() : null; } catch (e) { place = null; }
  return weightedPick(pool, makeRNG(`${(place && place.map) ?? ''}|${(place && place.day) ?? 0}|${ctxId}`).next());
}

function remember(id) {
  const h = state.rotation.history;
  h.push(id);
  if (h.length > 3) h.shift();
}

/** About two and a half minutes of a tune before moving on: 2 to 6 passes, or the track's own `rotateLoops`. */
function rotationLoops(p) {
  const n = Number(p.track.rotateLoops);
  return n >= 1 ? n : clampN(Math.round(150 / p.loopSeconds), 2, 6);
}

/** Called by a looping player at each loop boundary. */
function rotateAtLoop(p, loops, t) {
  const ctxId = state.context;
  if (!ctxId || p.stopping || p.id !== state.currentId || state.songbook.pinned[ctxId]) return;
  if (loops < rotationLoops(p)) return;
  const pool = contextPool(ctxId).filter((id) => id !== p.id);
  if (!pool.length) return;
  const fresh = pool.filter((id) => !state.rotation.history.includes(id));
  const next = weightedPick(fresh.length ? fresh : pool, arng.next());
  // The old tune finishes its phrase and rings out; the next begins a breath later.
  p.segue(p.step, t);
  remember(next);
  state.currentId = next; state.pendingId = next;
  startTrack(next, { loop: true, fade: 0.25, startAt: t + clampN(4 * p.stepDur, 0.3, 0.9) });
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/** Friendly aliases so callers can use the vocabulary that reads best at the call site. */
const SFX_ALIAS = {
  confirm: 'select', accept: 'select', cancel: 'back', menu: 'open', close_menu: 'close',
  crit: 'hitcrit', critical: 'hitcrit', footstep: 'footstep-grass', walk: 'step',
  gold: 'coin', gp: 'coin', pickup: 'item', loot: 'chest', drink: 'potion',
  d20: 'dice', roll: 'dice', ambush: 'encounter', win: 'victory', lose: 'defeat',
  ko: 'death', bless: 'buff', curse: 'debuff', lightning: 'thunder', frost: 'ice',
  burn: 'fire', cast: 'spell', bow: 'arrow', sword: 'slash', push: 'shove',
};

const _warned = new Set();

export const Audio = {
  /** Must be called from a user gesture (click / keypress) — browsers block audio otherwise. */
  init() {
    const ok = ensure();
    if (ok) { resume(); flushPendingSoon(); }
    return ok;
  },

  /** True once a usable AudioContext exists and is running. */
  get ready() { return !!state.ok && state.ctx.state === 'running'; },
  get available() { return !state.dead; },
  get ctx() { return state.ctx; },

  /**
   * Play a procedural sound effect.
   * @param {string} name  see SFX above (aliases accepted)
   * @param {object} opts  { vol=1 multiplier, pan=-1..1, pitch=semitones, delay=seconds, force }
   */
  sfx(name, opts = {}) {
    if (state.muted || !name) return false;
    if (!ensure()) return false;
    resume();
    let key = String(name);
    if (!SFX[key] && SFX_ALIAS[key]) key = SFX_ALIAS[key];
    const fn = SFX[key];
    if (!fn) {
      if (!_warned.has(key)) { _warned.add(key); try { console.warn('[audio] unknown sfx:', name); } catch (e) { /* ignore */ } }
      return false;
    }
    // Anti machine-gun: identical rapid triggers are dropped rather than stacked.
    const t = now();
    const gap = THROTTLE[key];
    if (gap && !opts.force && (t - (state.lastAt[key] || -99)) < gap) return false;
    state.lastAt[key] = t;
    if (!claimVoice(0.5)) return false;

    const A = {
      g: opts.vol == null ? 1 : Math.max(0, opts.vol),
      pan: opts.pan,
      d: Math.max(0, opts.delay || 0),
      pm: Math.pow(2, (opts.pitch || 0) / 12),
    };
    try { fn(A); } catch (e) { /* never let a sound crash a frame */ return false; }
    return true;
  },

  /**
   * Play music for a context ('town', 'battle', 'crypt' …) or a track id,
   * crossfading from whatever is playing. A context with several tracks picks
   * one seeded by map and in-game day, keeps it while the context holds, and
   * rotates to another after a few loops (see "context rotation" above). A
   * plain track id plays that track; `{ exact: true }` forces an id to be read
   * as a track even when it is also a context; `{ intensity: 1..3 }` leans a
   * context's pick toward tracks of that danger (a fight's battleCue). Pass
   * null/'' to fade out.
   * Re-requesting what is already playing is a no-op.
   */
  music(trackId, opts = {}) {
    const fade = opts.fade ?? CROSSFADE;
    if (!trackId) {
      state.pendingId = null;
      state.fanfareResume = null;
      if (state.ok) stopMusic(fade);
      return;
    }
    const pool = opts.exact ? [] : contextPool(trackId);
    let pick = null, ctxId = opts.context ?? null;
    state.intensity = opts.exact ? state.intensity : Number(opts.intensity) || null;
    if (pool.length > 1) {
      ctxId = trackId;
      // From one field to the next field, the tune that is playing carries on.
      const cur = state.currentId;
      if (cur && pool.includes(cur) && livePlayer(cur)) { state.context = ctxId; state.pendingId = cur; return; }
      const pin = state.songbook.pinned[ctxId];
      pick = pin && TRACKS[pin] ? pin : seededPick(pool, ctxId);
    } else if (TRACKS[trackId]) pick = trackId;
    else if (pool.length === 1) { pick = pool[0]; ctxId = trackId; }
    else {
      if (!_warned.has('trk:' + trackId)) { _warned.add('trk:' + trackId); try { console.warn('[audio] unknown track:', trackId); } catch (e) { /* ignore */ } }
      return;
    }
    // Remember the request even if audio can't start yet, so init() can honour it.
    state.pendingId = pick;
    whenRunning(() => {
      if (state.pendingId !== pick) return;                 // superseded while the context was suspended
      state.context = ctxId;
      if (state.currentId === pick && livePlayer(pick)) return;
      state.fanfareResume = null;
      for (const p of state.players.slice()) p.fadeOut(fade);
      state.currentId = pick;
      remember(pick);
      startTrack(pick, { loop: true, fade });
    });
  },

  /** Currently playing (or queued) loop id, or null. */
  get playing() { return state.currentId || state.pendingId || null; },
  /** { track, context }: what is playing and which context (if any) it is serving. */
  get nowPlaying() { return { track: state.currentId || state.pendingId || null, context: state.context }; },
  get tracks() { return Object.keys(TRACKS); },
  get sounds() { return Object.keys(SFX); },
  hasTrack(id) { return !!TRACKS[id]; },
  hasSfx(name) { return !!(SFX[name] || SFX[SFX_ALIAS[name]]); },

  /** Every context in use: the contract's list plus any a track declares. */
  get contexts() {
    const s = new Set(CONTEXTS);
    for (const id in TRACKS) for (const c of TRACKS[id].contexts || []) s.add(c);
    return [...s];
  },
  /** Every track that may answer a context (banned ones included), for a songbook UI. */
  contextTracks(ctxId) { return contextPool(ctxId, { all: true }); },
  /** Every track with its title, form, mood and contexts (music.js trackCatalogue), for a songbook screen. */
  catalogue() { return trackCatalogue(); },
  /**
   * The player's own choices, e.g. from a minstrel's songbook screen:
   * `pinned` maps a context to the one track it should always play; `banned`
   * lists tracks never to rotate in (ignored if it would leave a context empty).
   */
  setSongbook({ pinned = {}, banned = [] } = {}) {
    state.songbook.pinned = Object.assign(Object.create(null), pinned);
    state.songbook.banned = new Set(banned);
  },
  /** `fn()` -> { map, day }: where the party is, which seeds each place's tune for the day. */
  setPlaceSource(fn) { state.place = typeof fn === 'function' ? fn : null; },
  /** { db, gain } a track is normalised by: from the table, measured this session, or null (plays as written). */
  loudnessOf(id) {
    const db = LOUDNESS[id] ?? MEASURED.get(id);
    return { db: Number.isFinite(db) ? db : null, gain: loudnessGain(id) };
  },

  /**
   * Play `trackId` once (e.g. 'victory') and then return to the loop that was
   * playing before. Used by the battle-won / level-up flow. A context id picks
   * one of its tracks.
   */
  fanfare(trackId, opts = {}) {
    const pool = contextPool(trackId);
    const id = pool.length > 1 ? weightedPick(pool, arng.next()) : TRACKS[trackId] ? trackId : pool[0];
    const track = TRACKS[id];
    if (!track) return;
    const resumeId = state.fanfareResume || state.currentId || state.pendingId || null;
    const resumeCtx = state.context;
    whenRunning(() => {
      state.fanfareResume = (resumeId === id) ? null : resumeId;
      for (const p of state.players.slice()) p.fadeOut(opts.fadeOut ?? 0.25);
      state.currentId = id;
      state.pendingId = id;
      state.context = null;
      startTrack(id, {
        loop: false,
        fade: opts.fade ?? 0.05,
        onEnd: (endTime) => {
          // Give the last notes their release tail, then restore the previous loop.
          const wait = Math.max(0, (endTime - now())) * 1000 + 350;
          setTimeout(() => {
            const back = state.fanfareResume;
            state.fanfareResume = null;
            if (state.currentId === id) {
              state.currentId = null; state.pendingId = null;
              if (back) Audio.music(back, { fade: 0.5, exact: true, context: resumeCtx });
              else stopMusic(0.4);
            }
          }, wait);
        },
      });
    });
  },

  /**
   * Render a track (id or track object) offline, exactly as the player would
   * hear it: same instruments, room and mastering. Resolves to an AudioBuffer.
   * Used by tools/music-render.mjs to measure and audition the score.
   *   seconds (20), sampleRate (44100), loop (true), room (override),
   *   dry (no room, no mastering), master (false: room but no mastering),
   *   normalize (false: skip loudness normalisation), volume (default: the
   *   current music x master volume)
   */
  async render(what, opts = {}) {
    const track = typeof what === 'string' ? TRACKS[what] : what;
    if (!track || typeof track !== 'object') throw new Error('Audio.render: unknown track ' + what);
    const id = typeof what === 'string' ? what : (opts.id || '__render');
    const OAC = typeof OfflineAudioContext !== 'undefined' ? OfflineAudioContext : null;
    if (!OAC) throw new Error('Audio.render: no OfflineAudioContext here');
    const rate = opts.sampleRate || 44100, secs = Math.max(0.5, opts.seconds || 20);
    const ctx = new OAC(2, Math.ceil(rate * secs), rate);
    const vol = ctx.createGain();
    vol.gain.value = opts.volume ?? state.vol.music * state.vol.master;
    let bus;
    if (opts.dry || opts.master === false) {
      bus = { dry: ctx.createGain(), wet: ctx.createGain() };
      bus.dry.connect(vol); bus.wet.connect(vol);
      vol.connect(ctx.destination);
    } else {
      const chain = buildMusicChain(ctx), lim = buildLimiter(ctx);
      bus = chain.bus;
      chain.out.connect(vol); vol.connect(lim.input); lim.out.connect(ctx.destination);
    }
    const env = makeEnv(ctx, bus, { live: false });
    if (state.env) env.reverb = state.env.reverb;
    const p = new MusicPlayer(env, id, track, { loop: opts.loop ?? true, startAt: 0.02, normalize: opts.normalize !== false,
      room: opts.dry ? false : opts.room || null });
    p.fadeIn(0.01);
    // Scheduled in two-second slices while it renders, so a long render never builds its whole graph up front.
    const SLICE = 2;
    p.advance(Math.min(secs, SLICE + 0.5));
    for (let t = SLICE; t < secs; t += SLICE) {
      ctx.suspend(t).then(() => { p.advance(Math.min(secs + 0.1, t + SLICE + 0.5)); ctx.resume(); });
    }
    return ctx.startRendering();
  },

  /**
   * Temporarily pull the music down so a stinger or dialogue can cut through.
   * @param {number} amount 0..1 (1 = full silence)  @param {number} dur seconds at the low level
   */
  duck(amount = 0.6, dur = 0.8) {
    if (!state.ok || !state.duckGain) return;
    const a = Math.max(0, Math.min(1, amount));
    const t = now();
    const g = state.duckGain.gain;
    try {
      g.cancelScheduledValues(t);
      g.setValueAtTime(Math.max(0.0001, g.value), t);
      g.linearRampToValueAtTime(Math.max(0.0001, 1 - a), t + 0.08);
      g.setValueAtTime(Math.max(0.0001, 1 - a), t + 0.08 + Math.max(0, dur));
      g.linearRampToValueAtTime(1, t + 0.08 + Math.max(0, dur) + 0.45);
    } catch (e) { /* ignore */ }
    state.duckUntil = t + dur + 0.5;
  },

  /**
   * Set any subset of the three volumes (0..1). Undefined/null values are left alone.
   * Mirrors Save.settings.{volMaster,volMusic,volSfx}.
   */
  setVolume(master, music, sfx) {
    if (master != null) state.vol.master = clamp01(master);
    if (music != null) state.vol.music = clamp01(music);
    if (sfx != null) state.vol.sfx = clamp01(sfx);
    applyVolumes(0.08);
    return { ...state.vol };
  },
  getVolume() { return { ...state.vol }; },

  /** Global mute. Reads/writes as a plain boolean property. */
  get muted() { return state.muted; },
  set muted(v) { state.muted = !!v; applyVolumes(0.08); },
  toggleMute() { this.muted = !state.muted; return state.muted; },

  /** Suspend/resume the whole context (used when the tab loses focus). */
  pause() { if (state.ok) { try { state.ctx.suspend(); } catch (e) { /* ignore */ } } },
  unpause() { resume(); },

  /** Hard stop: kill music and forget queued requests. SFX tails are left to decay. */
  stopAll() {
    state.pendingId = null; state.fanfareResume = null;
    if (state.ok) stopMusic(0.15);
    stopScheduler();
  },

  // Exposed builders so other modules (spell VFX, monster cries) can compose one-offs.
  tone, noise, chord, arp,
  TRACKS, TRACK_GROUPS, INSTRUMENTS, CONTEXTS, trackForBiome,

  /**
   * The sound of the sky: a looping bed under everything, crossfaded on change.
   *
   * Weather you can only SEE is a screen effect. What sells rain is the hiss of
   * it, and what sells a gale is the note the wind makes — so each kind is
   * filtered noise with its own colour: rain is bright and busy, a storm adds a
   * low roar under it, wind is a slow sweep, and snow is almost nothing, which
   * is exactly what snow sounds like.
   *
   *   Audio.ambience('rain', 0.7)   Audio.ambience(null)  to fade out
   */
  ambience(kind, intensity = 0.6) {
    if (!state.ok) { state.pendingAmb = { kind, intensity }; return; }
    const ctx = state.ctx;
    const want = kind && kind !== 'none' && kind !== 'clear' ? String(kind) : null;
    const inten = clamp01(intensity);

    // Same sky, new strength: ride the gain rather than rebuilding the graph.
    if (state.amb && state.amb.kind === want) {
      try { state.amb.gain.gain.setTargetAtTime(AMB_LEVEL[want] * inten, ctx.currentTime, 0.6); } catch (e) { /* ignore */ }
      state.amb.intensity = inten;
      return;
    }

    // Fade the old sky out and let it stop itself.
    if (state.amb) {
      const old = state.amb;
      state.amb = null;
      try {
        old.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.7);
        setTimeout(() => { try { old.srcs.forEach((s) => s.stop()); } catch (e) { /* ignore */ } }, 2600);
      } catch (e) { /* ignore */ }
    }
    if (!want || !AMB_LEVEL[want]) return;

    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, ctx.currentTime);
    out.connect(state.sfxBus);
    const srcs = [];
    const layer = (filter, freq, q, level, sweep) => {
      const s = ctx.createBufferSource();
      s.buffer = state.noiseBuf; s.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = filter; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = level;
      s.connect(f); f.connect(g); g.connect(out);
      if (sweep) {
        // A slow wander on the cutoff: wind is never one note for long.
        const lfo = ctx.createOscillator(), lg = ctx.createGain();
        lfo.type = 'sine'; lfo.frequency.value = sweep.rate;
        lg.gain.value = sweep.depth;
        lfo.connect(lg); lg.connect(f.frequency);
        lfo.start(); srcs.push(lfo);
      }
      try { s.start(0, arng.float(0, 1.5)); } catch (e) { s.start(0); }
      srcs.push(s);
    };

    switch (want) {
      case 'rain':
        layer('bandpass', 3200, 0.6, 0.55);                       // the hiss on stone
        layer('lowpass', 700, 0.7, 0.18, { rate: 0.09, depth: 180 });
        break;
      case 'storm':
        layer('bandpass', 3600, 0.5, 0.75);
        layer('lowpass', 480, 0.8, 0.45, { rate: 0.07, depth: 200 });  // the roar under it
        layer('bandpass', 900, 1.2, 0.22, { rate: 0.13, depth: 300 });
        break;
      case 'fog':
      case 'snow':
        layer('lowpass', 340, 0.7, 0.30, { rate: 0.05, depth: 120 });  // near silence
        break;
      case 'ash':
        layer('lowpass', 520, 0.8, 0.34, { rate: 0.06, depth: 150 });
        break;
      case 'leaves':
      case 'wind':
        layer('bandpass', 1100, 0.7, 0.40, { rate: 0.11, depth: 420 });
        layer('lowpass', 600, 0.6, 0.22, { rate: 0.08, depth: 160 });
        break;
      default: return;
    }
    state.amb = { kind: want, intensity: inten, gain: out, srcs };
    try { out.gain.setTargetAtTime(AMB_LEVEL[want] * inten, ctx.currentTime, 1.1); } catch (e) { /* ignore */ }
  },

  /** How much room the music has, 0 = dry closet, 0.34 = each room as designed, 1 = everything a cathedral. */
  setReverb(amount = 0.34) {
    if (state.env) setRoomLevel(state.env, clamp01(amount) / 0.34);
  },
};

/** How loud each sky sits under the game at full intensity. */
const AMB_LEVEL = {
  rain: 0.16, storm: 0.24, fog: 0.05, snow: 0.05, ash: 0.07, leaves: 0.09, wind: 0.11,
};

function clamp01(v) { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0; }

/** After init() the context may need a tick before it reports 'running'. */
function flushPendingSoon() {
  if (!state.ok) return;
  if (state.ctx.state === 'running') { flushPending(); return; }
  setTimeout(() => { if (state.ok && state.ctx.state === 'running') flushPending(); }, 120);
}

export default Audio;
