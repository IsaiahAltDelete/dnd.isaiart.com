// core/synth.js — the instrument DSP behind the score: sung formant voices, Karplus-Strong strings, bowed / reed / brass / organ models, rendered bells, drums and rooms.
//
// audio.js owns the AudioContext, the buses and the sequencer; this module owns
// what a note SOUNDS like. Everything takes an `env` (one AudioContext plus the
// caches bound to it), so the same code plays through the speakers or renders
// into an OfflineAudioContext for measurement, and nothing here touches `window`.
//
// Three techniques, chosen per instrument by what the real one does:
//   • Rendered once, played many times. A plucked string and a struck bell are
//     both "excite, then let the physics ring", so they are computed in plain JS
//     (a Karplus-Strong waveguide; inharmonic partials each with its own decay)
//     into one AudioBuffer per (instrument, pitch, sample rate) and replayed as a
//     single buffer source per note. It is the cheapest note there is and the most
//     real one: every harmonic dies at its own rate, which no filter sweep fakes.
//   • A source through a body. Bowed strings, reeds, brass, pipes and the
//     symphonia are a harmonic source (a PeriodicWave built from the instrument's
//     overtone recipe) plus the transient that names the family — bow scrape,
//     reed blip, brass brightening, pipe chiff, the tangent's click — through a
//     resonant body built ONCE per layer rather than once per note.
//   • Formant voices. A singer is a buzz shaped by a throat, so a voice is a
//     band-limited glottal wave with jitter, shimmer and a vibrato that blooms,
//     through five formant filters that also live per layer: a change of vowel
//     is then a smooth automation of five filters, not a new voice, and a
//     melisma glides on one breath instead of re-attacking every note.

import { makeRNG } from './rng.js';

// Audio jitter only: its own stream, never the gameplay rng.
const rng = makeRNG('sword-coast-synth');
const LN1000 = Math.log(1000);          // 60 dB as a natural-log amplitude ratio
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const cents = (c) => Math.pow(2, c / 1200);
export function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }
const clockMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// ─────────────────────────────────────────────────────────────────────────────
// HARMONIC SPECTRA — what makes a sustained note sound like an instrument.
//
// Each list is the amplitude of harmonic 1, 2, 3, … relative to the loudest, and
// createPeriodicWave turns it into an oscillator, so a shawm is built from a
// shawm's overtones without a byte of sample. The facts worth knowing:
//   • a bowed string moves in a near-sawtooth (1/k), and the bow's contact point,
//     1/b of the way along the string, silences every b-th harmonic — the dent
//     at 7, 14 in the vielle is where the player bows;
//   • a cylindrical bore (clarinet, crumhorn, bagpipe drone) suppresses EVEN
//     harmonics, which is the hollow buzz; a conical one (shawm, dulcian,
//     chanter) keeps them all and is loud at 2–5, which is why a shawm carries
//     across a market square;
//   • a stopped organ pipe is closed at one end, so it is odd harmonics only,
//     sweet and flutey; an open principal keeps the evens and sounds "organ";
//   • the voice's buzz falls about 6 dB an octave as it leaves the lips; the throat does the rest.
// ─────────────────────────────────────────────────────────────────────────────

const series = (n, fn) => { const a = []; for (let k = 1; k <= n; k++) a.push(fn(k)); return a; };

export const SPECTRA = {
  // orchestra — rich, dense, slow rolloff
  violin: [1, 0.72, 0.55, 0.42, 0.38, 0.28, 0.22, 0.18, 0.14, 0.11, 0.09, 0.07, 0.05, 0.04, 0.03],
  viola: [1, 0.68, 0.48, 0.34, 0.26, 0.19, 0.14, 0.10, 0.08, 0.06, 0.04, 0.03],
  cello: [1, 0.75, 0.50, 0.35, 0.26, 0.18, 0.13, 0.09, 0.07, 0.05, 0.03],
  contrabass: [1, 0.60, 0.32, 0.18, 0.11, 0.07, 0.04, 0.02],
  horn: [1, 0.55, 0.30, 0.16, 0.09, 0.05, 0.03],
  trombone: [0.90, 1, 0.70, 0.45, 0.30, 0.20, 0.13, 0.08, 0.05],
  trumpet: [0.70, 1, 0.85, 0.62, 0.45, 0.32, 0.22, 0.15, 0.10, 0.07, 0.05],
  tuba: [1, 0.70, 0.38, 0.20, 0.11, 0.06, 0.03],
  oboe: [0.45, 1, 0.90, 0.60, 0.40, 0.30, 0.20, 0.14, 0.10, 0.06],
  bassoon: [0.50, 1, 0.75, 0.50, 0.30, 0.20, 0.12, 0.08, 0.05],
  clarinet: [1, 0.05, 0.60, 0.04, 0.35, 0.03, 0.22, 0.02, 0.12, 0.01, 0.06],
  flute: [1, 0.25, 0.08, 0.04, 0.02],
  panpipe: [1, 0.18, 0.10, 0.05, 0.02],

  // the voice's buzz, before the throat shapes it
  glottal: series(60, (k) => Math.pow(k, -1.05)),
  // bowed medieval strings: sawtooth motion, a bow-point dent, the rebec brightest
  vielle: series(36, (k) => (k % 7 ? 1 : 0.22) * Math.pow(k, -0.95)),
  rebec: series(36, (k) => (k % 6 ? 1 : 0.28) * Math.pow(k, -0.8)),
  viol: series(36, (k) => (k % 9 ? 1 : 0.25) * Math.pow(k, -1.08)),
  // the symphonia's wheel bows harder and more evenly than any arm
  wheel: series(36, (k) => (k % 8 ? 1 : 0.3) * Math.pow(k, -0.74)),
  // reeds
  shawm: [0.62, 1, 0.96, 0.88, 0.80, 0.70, 0.60, 0.52, 0.45, 0.38, 0.32, 0.27, 0.23, 0.20, 0.17, 0.14, 0.12, 0.10, 0.085, 0.07, 0.06, 0.05],
  crumhorn: series(28, (k) => (k % 2 ? 1 : 0.1) * Math.pow(k, -0.6)),
  dulcian: [0.62, 1, 0.78, 0.58, 0.42, 0.30, 0.21, 0.15, 0.10, 0.07, 0.05, 0.035],
  chanter: [0.45, 0.85, 1, 0.95, 0.86, 0.76, 0.66, 0.57, 0.49, 0.42, 0.36, 0.31, 0.26, 0.22, 0.18, 0.15, 0.12, 0.10],
  droneReed: series(24, (k) => (k % 2 ? 1 : 0.22) * Math.pow(k, -0.85)),
  // lip-reeds: the sackbut is a gentler trombone, the cornett nearly a voice
  sackbut: [0.82, 1, 0.78, 0.52, 0.36, 0.25, 0.17, 0.11, 0.075, 0.05, 0.034, 0.022],
  cornett: [1, 0.60, 0.42, 0.26, 0.16, 0.10, 0.06, 0.035, 0.02],
  // organ pipes
  principal: [1, 0.48, 0.26, 0.15, 0.09, 0.055, 0.034, 0.02, 0.012],
  gedackt: [1, 0.035, 0.34, 0.025, 0.12, 0.015, 0.045, 0.01, 0.018],
};

/** A cached PeriodicWave for a named spectrum (or a 'pulse:<duty>'). Null if the context refuses. */
export function waveFor(env, name) {
  if (env.waves.has(name)) return env.waves.get(name);
  let amps = SPECTRA[name];
  if (!amps && name.startsWith('pulse:')) {
    // Duty-cycle pulses, the NES/GBA lead timbres: k-th coefficient (2/kπ)·sin(kπ·duty).
    const duty = +name.slice(6);
    amps = series(33, (k) => (2 / (k * Math.PI)) * Math.sin(Math.PI * k * duty));
  }
  let w = null;
  if (amps) {
    const n = amps.length + 1, re = new Float32Array(n), im = new Float32Array(n);
    for (let k = 1; k < n; k++) im[k] = amps[k - 1];
    try { w = env.ctx.createPeriodicWave(re, im, { disableNormalization: false }); } catch (e) { w = null; }
  }
  env.waves.set(name, w);
  return w;
}

/**
 * Pitch modulation (vibrato, jitter, glides) sampled once per 128-frame quantum
 * instead of every sample. Steps of ~3 ms are far below what the ear hears in a
 * pitch, and the oscillator then runs its cheap fixed-frequency path, which in
 * a choir of dozens of singers is most of the CPU.
 */
function kRate(o) {
  try { o.frequency.automationRate = 'k-rate'; o.detune.automationRate = 'k-rate'; } catch (e) { /* an engine without it stays a-rate */ }
  return o;
}

/** Apply a layer's `wave` to an oscillator: a shape, a pulse, or a named spectrum. */
export function setWave(env, osc, wave) {
  const pulse = { pulse25: 0.25, pulse18: 0.18, pulse12: 0.125, pulse125: 0.125 }[wave];
  if (pulse) { const w = waveFor(env, 'pulse:' + pulse); if (w) osc.setPeriodicWave(w); else osc.type = 'square'; return; }
  switch (wave) {
    case 'saw': case 'sawtooth': osc.type = 'sawtooth'; return;
    case 'sine': case 'triangle': case 'square': osc.type = wave; return;
    default: {
      // A named spectrum falls back to a sawtooth if the browser will not build
      // it, so a missing recipe is a duller note rather than silence.
      const w = SPECTRA[wave] ? waveFor(env, wave) : null;
      if (w) osc.setPeriodicWave(w); else osc.type = SPECTRA[wave] ? 'sawtooth' : 'triangle';
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// env — one AudioContext and everything bound to it
// ─────────────────────────────────────────────────────────────────────────────

/** White and pink noise, 2 s each. Pink (Voss-McCartney-lite) for wind and breath. */
export function noiseBuffers(ctx) {
  const n = Math.floor(ctx.sampleRate * 2);
  const white = ctx.createBuffer(1, n, ctx.sampleRate), pink = ctx.createBuffer(1, n, ctx.sampleRate);
  const wd = white.getChannelData(0), pd = pink.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < n; i++) {
    const w = rng.float(-1, 1);
    wd[i] = w;
    b0 = 0.99765 * b0 + w * 0.0990460;
    b1 = 0.96300 * b1 + w * 0.2965164;
    b2 = 0.57000 * b2 + w * 1.0526913;
    pd[i] = (b0 + b1 + b2 + w * 0.1848) * 0.22;
  }
  return { noise: white, pink };
}

/**
 * `bus.dry` and `bus.wet` are where players and rooms deliver; `live` says
 * whether this is the speakers (background pre-rendering allowed) or an offline
 * render (everything synchronous, nothing ever torn down early).
 */
export function makeEnv(ctx, bus, { live = true, noise = null } = {}) {
  return { ctx, rate: ctx.sampleRate, bus, live, reverb: 1, waves: new Map(), rooms: new Map(), ...(noise || noiseBuffers(ctx)) };
}

function noiseSource(env, t, buf = env.noise) {
  const s = env.ctx.createBufferSource();
  s.buffer = buf; s.loop = true;
  try { s.start(t, rng.float(0, 1.5)); } catch (e) { s.start(t); }
  return s;
}

function biquad(ctx, type, freq, q = 0.7, gainDb = null) {
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  if (gainDb != null) f.gain.value = gainDb;
  return f;
}

/**
 * Band-limited random wander: looping noise through a lowpass, scaled so its
 * RMS is roughly `depth`. Connected to oscillator detune it is jitter (cents);
 * to a gain it is shimmer. One per layer, shared by every note on it.
 */
function slowNoise(env, hz, depth, t) {
  const src = noiseSource(env, t);
  const lp = biquad(env.ctx, 'lowpass', hz, 0.5);
  const g = env.ctx.createGain();
  g.gain.value = depth / (0.577 * Math.sqrt((2 * hz) / env.rate));
  src.connect(lp); lp.connect(g);
  return { src, out: g };
}

// ─────────────────────────────────────────────────────────────────────────────
// ROOMS — procedural convolution impulse responses
//
// A room is heard as three things, in order: the gap before the first bounce
// (pre-delay: how far the walls are), a handful of discrete early reflections
// (their spacing is the room's SIZE — without them a tail is only a wash), and
// a diffuse tail whose treble dies faster than its bass (the material: stone
// keeps the highs longest, wood and people swallow them, a cave's wet rock
// leaves only rumble). The two channels are built from separate noise so the
// reverb has width instead of sitting in the middle of your head.
// ─────────────────────────────────────────────────────────────────────────────

export const ROOMS = {
  // the stone hall every track had before rooms existed
  hall: { rt60: 2.0, pre: 0.012, damp: 0.5, bass: 1.1, erGain: 0.55, wet: 0.36, dry: 0.8,
    er: [[0.0191, 0.62], [0.0295, -0.48], [0.0438, 0.36], [0.0617, -0.27], [0.0834, 0.19]] },
  // nave and vault: long enough to let organum's fifths hang in the air
  chapel: { rt60: 4.2, pre: 0.026, damp: 0.55, bass: 1.25, erGain: 0.45, wet: 0.48, dry: 0.7,
    er: [[0.021, 0.5], [0.034, -0.42], [0.049, 0.4], [0.068, -0.33], [0.093, 0.28], [0.124, -0.22], [0.161, 0.16]] },
  // low beams, wooden floor, forty drinkers soaking up the treble
  tavern: { rt60: 0.7, pre: 0.004, damp: 0.35, bass: 1.0, erGain: 0.7, wet: 0.3, dry: 0.9,
    er: [[0.0047, 0.7], [0.0079, -0.6], [0.0112, 0.5], [0.0151, -0.42], [0.0203, 0.33], [0.0262, -0.25]] },
  // outdoors: the ground's bounce, a few trees and far walls, a short soft air tail
  open: { rt60: 1.1, pre: 0.018, damp: 0.3, bass: 0.9, erGain: 0.6, wet: 0.22, dry: 0.95,
    er: [[0.0061, 0.55], [0.047, 0.16], [0.083, -0.12], [0.131, 0.09], [0.187, -0.07]] },
  // wet rock: long, dark, and the discrete echoes of a passage going on and on
  cave: { rt60: 4.8, pre: 0.034, damp: 0.28, bass: 1.15, erGain: 0.6, wet: 0.5, dry: 0.7,
    er: [[0.043, 0.6], [0.089, -0.5], [0.137, 0.42], [0.192, -0.33], [0.251, 0.25], [0.318, -0.18]] },
};

const IR_CACHE = new Map();   // `${kind}|${rate}` -> AudioBuffer (AudioBuffers are not bound to a context)

function roomIR(ctx, kind) {
  const key = kind + '|' + ctx.sampleRate;
  if (IR_CACHE.has(key)) return IR_CACHE.get(key);
  const R = ROOMS[kind] || ROOMS.hall, rate = ctx.sampleRate;
  const len = Math.floor(Math.min(6, R.pre + R.rt60 * 1.1 + 0.05) * rate);
  const buf = ctx.createBuffer(2, len, rate);
  const pre = Math.floor(R.pre * rate);
  const dLo = Math.exp(-LN1000 / (R.rt60 * R.bass * rate));   // per-sample decay below ~1.5 kHz
  const dHi = Math.exp(-LN1000 / (R.rt60 * R.damp * rate));   // and above it
  const split = 1 - Math.exp((-2 * Math.PI * 1500) / rate);
  const build = Math.max(1, Math.min(0.06, R.rt60 * 0.02) * rate); // the tail thickens rather than appearing
  let energy = 0;
  const chans = [buf.getChannelData(0), buf.getChannelData(1)];
  for (let ch = 0; ch < 2; ch++) {
    const d = chans[ch];
    let lp = 0, eLo = 1, eHi = 1;
    for (let i = pre; i < len; i++) {
      const w = rng.float(-1, 1);
      lp += split * (w - lp);
      d[i] = (lp * 2.2 * eLo + (w - lp) * eHi) * (1 - Math.exp(-(i - pre) / build));
      eLo *= dLo; eHi *= dHi;
      energy += d[i] * d[i];
    }
  }
  // Early reflections, scaled against the tail so erGain means the same in every room.
  const tail = Math.sqrt(energy / 2) || 1;
  let erE = 0;
  for (const [, g] of R.er) erE += g * g;
  const erScale = (R.erGain * tail) / Math.sqrt(erE || 1);
  for (let ch = 0; ch < 2; ch++) {
    const d = chans[ch];
    for (const [t, g] of R.er) {
      const i = pre + Math.floor(t * rate * (ch ? 1.087 : 1));
      if (i + 3 >= len) continue;
      const a = g * erScale * (ch ? 0.92 : 1);
      // A wall is not a mirror: each bounce comes back slightly smeared and dulled.
      d[i] += a * 0.55; d[i + 1] += a * 0.3; d[i + 2] += a * 0.15;
    }
  }
  let total = 0;
  for (const d of chans) for (let i = 0; i < len; i++) total += d[i] * d[i];
  const norm = 1 / Math.sqrt(total / 2 || 1);
  for (const d of chans) for (let i = 0; i < len; i++) d[i] *= norm;
  IR_CACHE.set(key, buf);
  return buf;
}

/**
 * The shared convolver for one room kind in this env (created on first use).
 * Players send into `room.input`; the room delivers to env.bus.wet.
 */
export function roomFor(env, kind) {
  kind = ROOMS[kind] ? kind : 'hall';
  let r = env.rooms.get(kind);
  if (!r) {
    const ctx = env.ctx;
    const input = ctx.createGain();
    // Keep the bass out of the reverb: a boomy low end is what makes a room sound cheap.
    const hp = biquad(ctx, 'highpass', 120, 0.6);
    const conv = ctx.createConvolver();
    conv.normalize = false;
    try { conv.buffer = roomIR(ctx, kind); } catch (e) { /* no reverb, still fine */ }
    const wet = ctx.createGain();
    wet.gain.value = ROOMS[kind].wet * env.reverb;
    input.connect(hp); hp.connect(conv); conv.connect(wet);
    r = { kind, spec: ROOMS[kind], input, wet, users: 0, connected: false, timer: null };
    env.rooms.set(kind, r);
  }
  if (!r.connected) { r.wet.connect(env.bus.wet); r.connected = true; }
  if (r.timer) { clearTimeout(r.timer); r.timer = null; }
  r.users++;
  return r;
}

/**
 * A player no longer uses this room. Once its tail has rung out it is unplugged,
 * so an idle convolver costs nothing; plugging it back in is instant.
 */
export function roomDone(env, r) {
  r.users = Math.max(0, r.users - 1);
  if (r.users || !env.live || r.timer) return;
  r.timer = setTimeout(() => {
    r.timer = null;
    if (!r.users && r.connected) { try { r.wet.disconnect(); } catch (e) { /* ignore */ } r.connected = false; }
  }, (r.spec.rt60 + 1) * 1000);
}

/** Scale every room's wet level (1 = as designed). */
export function setRoomLevel(env, amount) {
  env.reverb = amount;
  for (const r of env.rooms.values()) {
    try { r.wet.gain.setTargetAtTime(r.spec.wet * amount, env.ctx.currentTime, 0.05); } catch (e) { /* ignore */ }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RENDERED VOICES — strings and bells computed once per pitch
// ─────────────────────────────────────────────────────────────────────────────

// LRU by bytes. A lute note is a few hundred KB; a whole consort's pitches fit
// comfortably, and a long session touring every track cannot grow without bound.
const RCACHE = new Map();
let rbytes = 0;
const RBUDGET = 64 * 1024 * 1024;
const instIds = new WeakMap();
let nextInstId = 1;

function instKey(inst) {
  let k = instIds.get(inst);
  if (!k) { k = 'i' + nextInstId++; instIds.set(inst, k); }
  return k;
}

function cacheGet(key) {
  const b = RCACHE.get(key);
  if (b) { RCACHE.delete(key); RCACHE.set(key, b); }
  return b;
}
function cachePut(key, buf) {
  RCACHE.set(key, buf);
  rbytes += buf.length * buf.numberOfChannels * 4;
  while (rbytes > RBUDGET && RCACHE.size > 1) {
    const k = RCACHE.keys().next().value;
    const v = RCACHE.get(k);
    RCACHE.delete(k);
    rbytes -= v.length * v.numberOfChannels * 4;
  }
}

function toBuffer(ctx, data, rate) {
  const b = ctx.createBuffer(1, data.length, rate);
  b.getChannelData(0).set(data);
  return b;
}

/** RBJ biquad applied in place to a Float32Array (bodies are baked into the render). */
function biquadInPlace(x, rate, type, f0, q, db = 0) {
  const w = (2 * Math.PI * Math.min(f0, rate * 0.45)) / rate, cw = Math.cos(w), sw = Math.sin(w);
  const alpha = sw / (2 * (q || 0.707)), A = Math.pow(10, db / 40);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'peaking') { b0 = 1 + alpha * A; b1 = -2 * cw; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cw; a2 = 1 - alpha / A; }
  else if (type === 'highpass') { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; }
  else { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; }
  b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const xi = x[i];
    const y = b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = xi; y2 = y1; y1 = y;
    x[i] = y;
  }
}

/**
 * One Karplus-Strong string added into `out`, starting at sample `d0`.
 *
 * A delay line one period long holds the string's shape; each trip round the
 * loop it passes a gentle lowpass (so the upper harmonics die first, exactly as
 * on a real string) and a first-order allpass that supplies the fractional part
 * of the period, without which high notes land audibly out of tune. The pluck
 * is one period of noise, darkened by `bright` and combed by the pluck position
 * — a string plucked a fifth of the way along cannot sound its 5th harmonic.
 */
function pluckString(out, f, g, d0, t60, P, rate) {
  const period = rate / f;
  const S = P.loss ?? 0.5;
  let N = Math.floor(period - S - 0.15);
  if (N < 2) N = 2;
  const frac = clamp(period - N - S, 0.05, 1.3);
  const C = (1 - frac) / (1 + frac);
  const rho = Math.exp(-LN1000 / (f * t60));
  const dl = new Float32Array(N);
  if (P.hammer) {
    // A hammer is a short soft pulse where it lands, not a noisy pluck.
    const w = Math.max(2, Math.round(rate * P.hammer)), at = Math.floor(N * (P.pluckPos ?? 0.12));
    for (let i = 0; i < w; i++) dl[(at + i) % N] += 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / w);
    for (let i = 0; i < N; i++) dl[i] += rng.float(-0.08, 0.08);
  } else {
    // A finger or quill pulls the string into a triangle and lets go. What the
    // bridge (and so the body) feels is the string's SLOPE: a two-level step
    // whose harmonics fall as 1/k, with a notch at every multiple of
    // 1/pluckPos. Flat noise instead — the textbook pluck — is some 20 dB too
    // bright by the tenth harmonic, which is the "synth guitar" sound. `grit`
    // is the rasp of nail or quill; `bright` the softness of what plucked,
    // a lowpass run twice round the loop so it leaves no seam.
    const pos = clamp(P.pluckPos ?? 0.2, 0.04, 0.5);
    const M = Math.max(1, Math.round(N * pos)), grit = P.grit ?? 0.12;
    for (let i = 0; i < N; i++) dl[i] = (i < M ? 1 - pos : -pos) + rng.float(-grit, grit);
    // `bright` is the one-pole coefficient at 44.1 kHz; held as a frequency so
    // a render at another rate sounds the same.
    const fc = (-Math.log(1 - clamp(P.bright ?? 0.6, 0.01, 0.99)) * 44100) / (2 * Math.PI);
    const b = 1 - Math.exp((-2 * Math.PI * Math.min(fc, rate * 0.45)) / rate);
    let lp = 0;
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < N; i++) { lp += b * (dl[i] - lp); if (pass) dl[i] = lp; }
  }
  let mean = 0, peak = 0;
  for (let i = 0; i < N; i++) mean += dl[i];
  mean /= N;
  for (let i = 0; i < N; i++) { dl[i] -= mean; peak = Math.max(peak, Math.abs(dl[i])); }
  const k = peak > 0 ? g / peak : 0;
  for (let i = 0; i < N; i++) dl[i] *= k;
  // The gothic harp's bray pins: the string slaps a pin on one side, buzzing
  // while it swings wide and ringing clean once it has quietened.
  const buzz = P.buzz || 0, thr = g * (P.buzzAt ?? 0.3);
  let p = 0, prev = 0, apx = 0, apy = 0;
  for (let n = d0; n < out.length; n++) {
    const v = dl[p];
    out[n] += v;
    const y = rho * ((1 - S) * v + S * prev);
    prev = v;
    let a = C * y + apx - C * apy;
    apx = y; apy = a;
    if (buzz && a > thr) a = thr + (a - thr) * (1 - buzz);
    dl[p] = a;
    if (++p === N) p = 0;
  }
}

/** A whole course (or three) rendered, voiced by its body, normalised. */
function renderString(P, m, rate) {
  const f0 = midiToFreq(m);
  // Higher strings are shorter and stiffer and ring for less time.
  const t60 = clamp((P.decay ?? 2) * Math.pow(261.6 / f0, P.decayTilt ?? 0.45), 0.25, P.maxDecay ?? 7);
  const len = Math.floor(rate * Math.min(8, t60 + 0.08));
  const out = new Float32Array(len);
  for (const [c, g, ms] of P.courses || [[0, 1, 0]]) pluckString(out, f0 * cents(c), g, Math.floor((ms / 1000) * rate), t60, P, rate);
  // Renaissance lutes string their bass courses in octaves: the high partner
  // is what gives a low lute note its shimmer.
  if (P.octaveBelow && m < P.octaveBelow) pluckString(out, f0 * 2 * cents(1.5), P.octaveGain ?? 0.4, Math.floor(0.0012 * rate), t60 * 0.55, P, rate);
  // Loudness by the pluck, not by the peak: the body then colours each pitch.
  let e = 0;
  const w = Math.min(len, Math.floor(rate * 0.25));
  for (let i = 0; i < w; i++) e += out[i] * out[i];
  const s = 0.22 / Math.sqrt(e / w || 1);
  for (let i = 0; i < len; i++) out[i] *= s;
  for (const [type, f, q, db] of P.body || []) biquadInPlace(out, rate, type, f, q, db);
  const fade = Math.min(len, Math.floor(rate * 0.03));
  for (let i = 0; i < fade; i++) out[len - 1 - i] *= i / fade;
  return out;
}

/**
 * A bell: partials at their true (inharmonic) ratios, each with its own decay,
 * each split into a slightly detuned doublet — a cast bell is never perfectly
 * round, and that slow warble is what makes it a bell and not a chord.
 * Partials are advanced by a rotating phasor (no sin() per sample).
 */
function renderBell(P, m, rate) {
  const f0 = midiToFreq(m);
  const scale = Math.pow(261.6 / f0, P.decayTilt ?? 0.5);   // big bells ring longer
  let longest = 0;
  for (const p of P.partials) longest = Math.max(longest, p[2] * scale);
  const secs = Math.min(P.maxDecay ?? 8, longest * 0.95 + 0.05);
  const len = Math.floor(secs * rate);
  const out = new Float32Array(len);
  const warble = P.warble ?? 0.7;
  for (const [ratio, amp, t60] of P.partials) {
    const f = f0 * ratio;
    if (f > rate * 0.45) continue;
    const dec = Math.exp(-LN1000 / (Math.min(secs, t60 * scale) * rate));
    for (let side = -1; side <= 1; side += 2) {
      const w = (2 * Math.PI * (f + side * warble * 0.5)) / rate;
      const c = Math.cos(w), s = Math.sin(w);
      const ph = rng.float(0, Math.PI * 2);
      let x = Math.cos(ph), y = Math.sin(ph), a = amp * 0.5;
      const floor = amp * 1e-4;
      for (let i = 0; i < len && a > floor; i++) {
        out[i] += a * y;
        const nx = x * c - y * s;
        y = x * s + y * c; x = nx;
        a *= dec;
        if ((i & 1023) === 0) { const r = 1 / Math.sqrt(x * x + y * y); x *= r; y *= r; }
      }
    }
  }
  // The clapper: a few milliseconds of dull noise under the first ring.
  if (P.strike) {
    const n = Math.min(len, Math.floor(rate * 0.012));
    let lp = 0;
    const k = 1 - Math.exp((-2 * Math.PI * (P.strikeHz ?? 2500)) / rate);
    for (let i = 0; i < n; i++) { lp += k * (rng.float(-1, 1) - lp); out[i] += lp * P.strike * (1 - i / n); }
  }
  const atk = Math.floor(rate * 0.0015);
  for (let i = 0; i < atk && i < len; i++) out[i] *= i / atk;
  let peak = 0;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(out[i]));
  const s = 0.6 / (peak || 1);
  for (let i = 0; i < len; i++) out[i] *= s;
  const fade = Math.min(len, Math.floor(rate * 0.05));
  for (let i = 0; i < fade; i++) out[len - 1 - i] *= i / fade;
  return out;
}

// Background rendering. A live note never waits on the main thread: a
// neighbouring pitch already in the cache stands in (repitched a semitone or
// two, which the ear forgives) while the exact one renders a few ms at a time.
const queue = [];
const queued = new Set();
let pumping = false;

function renderVoice(env, inst, m) {
  return toBuffer(env.ctx, inst.kind === 'ks' ? renderString(inst, m, env.rate) : renderBell(inst, m, env.rate), env.rate);
}

function queueRender(env, inst, m) {
  const k = instKey(inst) + '|' + m + '|' + env.rate;
  if (queued.has(k) || RCACHE.has(k)) return;
  queued.add(k);
  queue.push([env, inst, m, k]);
  if (!pumping) { pumping = true; setTimeout(pump, 0); }
}
function pump() {
  const t0 = clockMs();
  while (queue.length && clockMs() - t0 < 6) {
    const [env, inst, m, k] = queue.shift();
    queued.delete(k);
    if (!RCACHE.has(k)) { try { cachePut(k, renderVoice(env, inst, m)); } catch (e) { /* skip */ } }
  }
  if (queue.length) setTimeout(pump, 4); else pumping = false;
}

/** { buf, rate } for a pitch: the exact render, a stand-in neighbour, or a render done now. */
function renderedFor(env, inst, midi) {
  const m = Math.round(midi), key = instKey(inst);
  const k = key + '|' + m + '|' + env.rate;
  let b = cacheGet(k);
  if (b) return { buf: b, rate: Math.pow(2, (midi - m) / 12) };
  if (env.live) {
    for (const d of [1, -1, 2, -2]) {
      const nb = cacheGet(key + '|' + (m + d) + '|' + env.rate);
      if (nb) { queueRender(env, inst, m); return { buf: nb, rate: Math.pow(2, (midi - m - d) / 12) }; }
    }
  }
  b = renderVoice(env, inst, m);
  cachePut(k, b);
  return { buf: b, rate: Math.pow(2, (midi - m) / 12) };
}

// ─────────────────────────────────────────────────────────────────────────────
// FORMANTS — the throat
//
// Five resonances per vowel, per voice range: [frequencies], [bandwidths] in Hz.
// These are the standard published singing-voice measurements (the table
// behind the classic FOF choir synthesisers); "alto" uses the countertenor row,
// because the altos of a medieval chapel were men. The two lowest formants
// decide the vowel: /i/ is F1 low and F2 high, /u/ both low, /a/ both high and
// close together.
//
// The throat is built as Klatt's cascade: five two-pole resonators in series,
// each with unity gain at DC. Their relative peak heights then come out of the
// physics rather than a table — a formant rides on the skirts of those below
// it exactly as in a real vocal tract — and the fundamental keeps its weight,
// which a bank of parallel bandpasses throws away. (A Web Audio lowpass is that
// resonator; its Q is the peak height in dB, 20·log10(F / bandwidth).)
// ─────────────────────────────────────────────────────────────────────────────

export const FORMANTS = {
  bass: {
    a: [[600, 1040, 2250, 2450, 2750], [60, 70, 110, 120, 130]],
    e: [[400, 1620, 2400, 2800, 3100], [40, 80, 100, 120, 120]],
    i: [[250, 1750, 2600, 3050, 3340], [60, 90, 100, 120, 120]],
    o: [[400, 750, 2400, 2600, 2900], [40, 80, 100, 120, 120]],
    u: [[350, 600, 2400, 2675, 2950], [40, 80, 100, 120, 120]],
  },
  tenor: {
    a: [[650, 1080, 2650, 2900, 3250], [80, 90, 120, 130, 140]],
    e: [[400, 1700, 2600, 3200, 3580], [70, 80, 100, 120, 120]],
    i: [[290, 1870, 2800, 3250, 3540], [40, 90, 100, 120, 120]],
    o: [[400, 800, 2600, 2800, 3000], [40, 80, 100, 120, 120]],
    u: [[350, 600, 2700, 2900, 3300], [40, 60, 100, 120, 120]],
  },
  alto: {
    a: [[660, 1120, 2750, 3000, 3350], [80, 90, 120, 130, 140]],
    e: [[440, 1800, 2700, 3000, 3300], [70, 80, 100, 120, 120]],
    i: [[270, 1850, 2900, 3350, 3590], [40, 90, 100, 120, 120]],
    o: [[430, 820, 2700, 3000, 3300], [40, 80, 100, 120, 120]],
    u: [[370, 630, 2750, 3000, 3400], [40, 60, 100, 120, 120]],
  },
  treble: {
    a: [[800, 1150, 2900, 3900, 4950], [80, 90, 120, 130, 140]],
    e: [[350, 2000, 2800, 3600, 4950], [60, 100, 120, 150, 200]],
    i: [[270, 2140, 2950, 3900, 4950], [60, 90, 100, 120, 120]],
    o: [[450, 800, 2830, 3800, 4950], [40, 80, 100, 120, 120]],
    u: [[325, 700, 2700, 3800, 4950], [50, 60, 170, 180, 200]],
  },
};
export const VOWELS = 'aeiou';
// The "singer's formant": F3-F5 clustered near 3 kHz in trained voices, the
// ring that carries a chapel choir down the nave. `ring` (dB) on an
// instrument sets how much of it; monks at the office sing with little.
const RING_HZ = { bass: 2500, tenor: 2800, alto: 3000, treble: 3300 };

/** Which register sings this pitch, for sections that span several. */
function registerFor(inst, midi) {
  const regs = inst.registers;
  if (!regs) return inst.register || 'tenor';
  const splits = inst.splits || [];
  let i = 0;
  while (i < splits.length && midi >= splits[i]) i++;
  return regs[Math.min(i, regs.length - 1)];
}

function bankFor(rt, reg) {
  let b = rt.banks[reg];
  if (b) return b;
  const ctx = rt.env.ctx;
  const input = ctx.createGain();
  let node = input;
  if (rt.shimmer) {
    // Shimmer: the loudness of real phonation wanders cycle to cycle.
    const sh = ctx.createGain();
    sh.gain.value = 1;
    rt.shimmer.out.connect(sh.gain);
    input.connect(sh); node = sh;
  }
  const filters = [];
  for (let i = 0; i < 5; i++) { const f = biquad(ctx, 'lowpass', 500, 10); node.connect(f); node = f; filters.push(f); }
  const ring = biquad(ctx, 'peaking', RING_HZ[reg] || 2800, 1.4, rt.inst.ring ?? 0);
  const out = ctx.createGain();
  out.gain.value = 0.25;
  node.connect(ring); ring.connect(out); out.connect(rt.out);
  b = { reg, input, filters, vowel: null, seats: null };
  rt.banks[reg] = b;
  vowelTo(rt, b, 'a', 0, ctx.currentTime, 0);
  return b;
}

/** Move a bank to a vowel (tau = 0 jumps; otherwise a glide), tuning F1 above a high fundamental. */
function vowelTo(rt, b, vowel, f0, t, tau) {
  const [F, BW] = FORMANTS[b.reg][vowel] || FORMANTS[b.reg].a;
  const shift = rt.inst.formantShift ?? 1, widen = rt.inst.bandwidth ?? 1;
  // A soprano on a high note opens her mouth until F1 sits above the note —
  // without that, the first formant would filter the fundamental away.
  let f1 = F[0] * shift;
  if (f0 > f1 * 0.85) f1 = f0 * 1.15;
  for (let i = 0; i < 5; i++) {
    let fi = i === 0 ? f1 : F[i] * shift;
    if (i === 1) fi = Math.max(fi, f1 * 1.3);
    fi = Math.min(fi, rt.env.rate * 0.4);
    const q = clamp(20 * Math.log10(fi / (BW[i] * widen)), 2, 28);
    const f = b.filters[i];
    if (tau > 0) { f.frequency.setTargetAtTime(fi, t, tau); f.Q.setTargetAtTime(q, t, tau); }
    else { f.frequency.setValueAtTime(fi, t); f.Q.setValueAtTime(q, t); }
  }
  b.vowel = vowel;
}

/** 'a' | 'ieeio' | 'ky-ri-e' → ['a'] | ['i','e','e','i','o'] | ['i','i','e']: vowels in order, cycled per note. */
function parseVowels(v) {
  if (!v) return null;
  const out = [];
  for (const c of String(v).toLowerCase()) if (VOWELS.includes(c)) out.push(c);
  return out.length ? out : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// LAYER RUNTIME — what a layer builds once and every note on it shares
// ─────────────────────────────────────────────────────────────────────────────

const SUSTAINED = new Set(['bowed', 'reed', 'brass', 'pipe', 'wheel']);

/** Series filters from `[[type, freq, q, gainDb], ...]` into `out`; returns the chain's input. */
function bodyChain(env, body, out, head = null) {
  const nodes = head ? [head] : [];
  for (const [type, freq, q, db] of body || []) nodes.push(biquad(env.ctx, type, freq, q ?? 0.7, db ?? null));
  if (!nodes.length) return out;
  for (let i = 0; i < nodes.length; i++) nodes[i].connect(nodes[i + 1] || out);
  return nodes[0];
}

/**
 * Build a layer's shared machinery. `out` is the layer's gain node; `info.midis`
 * lists the (transposed) pitches the layer will play, so a rendered instrument
 * can start computing them before they are needed.
 */
export function layerRuntime(env, def, inst, out, info = {}) {
  const kind = inst ? (inst.kind || 'pluck') : 'osc';
  const t = env.ctx.currentTime;
  const rt = {
    env, def, inst: inst || {}, kind, out, input: out, open: null, persist: [],
    legato: def.legato ?? inst?.legato ?? kind === 'voice',
    vowels: parseVowels(def.vowel) || parseVowels(inst?.vowel) || ['a'], vi: 0,
    section: def.section ?? inst?.section ?? 0,
    ringing: null, banks: null, jitter: null, jitters: null, shimmer: null, wobble: null,
  };
  if (kind === 'ks' || kind === 'rbell') {
    rt.ringing = new Map();
    if (env.live && info.midis) for (const m of info.midis) queueRender(env, inst, Math.round(m));
  } else if (kind === 'voice') {
    rt.banks = Object.create(null);
    // Every singer wanders in pitch on their own: a section sharing one
    // wander moves as one throat, which is an organ stop, not a choir.
    rt.jitters = [];
    for (let i = 0, n = clamp(rt.section || 1, 1, 3); i < n; i++) {
      const j = slowNoise(env, 14, inst.jitter ?? 7, t);
      rt.jitters.push(j); rt.persist.push(j.src);
    }
    rt.shimmer = slowNoise(env, 22, inst.shimmer ?? 0.06, t);
    rt.persist.push(rt.shimmer.src);
  } else if (SUSTAINED.has(kind)) {
    let head = null;
    if (inst.wheelAM) {
      // The wheel never turns quite evenly: a slow irregular swell on every note.
      head = env.ctx.createGain();
      head.gain.value = 1;
      const am = slowNoise(env, inst.wheelAM.rate ?? 6, inst.wheelAM.depth ?? 0.05, t);
      am.out.connect(head.gain);
      rt.persist.push(am.src);
    }
    rt.input = bodyChain(env, inst.body, out, head);
    if (inst.jitter) { rt.jitter = slowNoise(env, 9, inst.jitter, t); rt.persist.push(rt.jitter.src); }
    if (inst.wobble) {
      // A portative's bellows are pumped by the player's other hand; the wind
      // pressure, and so the pitch, breathes with it.
      rt.wobble = slowNoise(env, inst.wobble.rate ?? 0.8, inst.wobble.cents ?? 3, t);
      rt.persist.push(rt.wobble.src);
    }
  }
  return rt;
}

/** Stop a layer's persistent sources at `t` (the player is going away). */
export function releaseLayer(rt, t) {
  for (const s of rt.persist) { try { s.stop(t); } catch (e) { /* ignore */ } }
  rt.persist.length = 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// SUSTAINED VOICES — shared machinery for anything that can be tied
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A sounding note that a tie may extend. `envs` are the gain params carrying the
 * envelope ({ p, w }: param and its weight), `oscs` the pitched sources
 * ({ o, ratio }), `srcs` everything that needs a stop time.
 */
function newVoice(rel) { return { oscs: [], envs: [], srcs: [], links: [], stopAt: 0, rel, amp: 0, vowel: null, reg: null, f: 0 }; }

/**
 * Connect a layer's long-lived modulator (jitter, bellows wobble) to one note's
 * param. The link is cut when the note's first source ends: otherwise a layer
 * that plays for an hour would hold every note it ever sounded alive through
 * its modulator's fan-out.
 */
function link(v, from, param) {
  from.connect(param);
  if (!v.links.length && v.srcs.length) v.srcs[0].onended = () => unlink(v);
  v.links.push(from, param);
}
function unlink(v) {
  const l = v.links;
  for (let i = 0; i < l.length; i += 2) { try { l[i].disconnect(l[i + 1]); } catch (e) { /* already gone */ } }
  l.length = 0;
}

function stopVoice(v, t) {
  v.stopAt = t;
  for (const s of v.srcs) { try { s.stop(t); } catch (e) { /* ignore */ } }
}

function releaseVoice(v, t) {
  for (const e of v.envs) e.p.setTargetAtTime(0, t, v.rel / 4);
  stopVoice(v, t + v.rel * 1.8 + 0.05);
}

/**
 * End of a note: a real release, or — when the pattern says the next note is
 * tied to this one — a provisional release a little late, which the tie cancels
 * when it arrives. If it never arrives (the track was stopped) the note still
 * dies gracefully instead of droning on.
 */
function finishVoice(rt, v, end, ev) {
  if (rt.legato && ev.tieOut) { releaseVoice(v, end + 0.3); rt.open = v; }
  else { releaseVoice(v, end); rt.open = null; }
}

/** A tie arrived: take back the provisional release and carry on at the new level. */
function holdVoice(v, when, amp) {
  v.amp = amp;
  for (const e of v.envs) { e.p.cancelScheduledValues(when); e.p.setTargetAtTime(amp * e.w, when, 0.02); }
  stopVoice(v, when + 30);
}

function glideVoice(v, f, when, glide) {
  for (const { o, ratio } of v.oscs) o.frequency.setTargetAtTime(f * ratio, when, glide / 3);
  v.f = f;
}

/** Short dip in loudness (a new syllable, a change of bow) inside a tied line. */
function dipVoice(v, when, depth, dur) {
  for (const e of v.envs) {
    e.p.setTargetAtTime(v.amp * e.w * depth, when, dur / 4);
    e.p.setTargetAtTime(v.amp * e.w, when + dur, dur / 2);
  }
}

/** Ornament as pitch movement inside one sounding note (winds, bows, voices). */
function ornamentPitch(v, when, dur, f, orn) {
  const g = Math.min(0.075, dur / 6);
  const fu = midiToFreq(orn.upper), fl = midiToFreq(orn.lower);
  const path = [];
  if (orn.type === 'mordent') path.push([when, f], [when + g, fl], [when + 2 * g, f]);
  else if (orn.type === 'grace') path.push([when, fu], [when + g, f]);
  else {
    // A trill: upper and main note alternating at about 7.5 Hz over the first
    // half of the note, then the main note held.
    const half = 0.066, until = when + Math.max(3 * half, dur * 0.55);
    let t = when, up = true;
    while (t < until) { path.push([t, up ? fu : f]); t += half; up = !up; }
    path.push([t, f]);
  }
  for (const { o, ratio } of v.oscs) for (const [t, fr] of path) o.frequency.setTargetAtTime(fr * ratio, t, 0.007);
}

function attachVibrato(env, v, inst, when, dur, targets) {
  const vib = inst.vibrato;
  if (!vib || !vib.depth || dur < (vib.delay ?? 0.25) * 0.8) return;
  const ctx = env.ctx;
  const lfo = ctx.createOscillator(), lg = ctx.createGain();
  lfo.frequency.value = (vib.rate ?? 5) * rng.float(0.95, 1.05);
  const d0 = when + (vib.delay ?? 0.25);
  // It blooms: a singer or fiddler holds the note straight, then lets it sway.
  lg.gain.setValueAtTime(0, when);
  lg.gain.setValueAtTime(0, d0);
  lg.gain.linearRampToValueAtTime(vib.depth, d0 + (vib.bloom ?? 0.3));
  lfo.connect(lg);
  for (const o of targets) lg.connect(o.detune);
  lfo.start(when + rng.float(0, 0.05));
  v.srcs.push(lfo);
}

/** A short burst of filtered noise: tongue, bow bite, consonant, tangent. */
function burst(env, dest, when, level, freq, q, len) {
  if (level <= 0) return;
  const ctx = env.ctx;
  const t = Math.max(ctx.currentTime, when);
  const s = noiseSource(env, t);
  const f = biquad(ctx, 'bandpass', freq, q);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(level, t + Math.min(0.004, len / 3));
  g.gain.setTargetAtTime(0, t + len * 0.3, len / 3);
  s.connect(f); f.connect(g); g.connect(dest);
  s.stop(t + len * 2.5 + 0.02);
}

// ─────────────────────────────────────────────────────────────────────────────
// THE NOTE — dispatch by instrument kind
// ─────────────────────────────────────────────────────────────────────────────

const NO_EV = Object.freeze({});

/**
 * Sound one note. `midi` is already transposed; `dur` is seconds; `ev` carries
 * the pattern's extras: `vowel`, `tieIn`/`tieOut` (legato), `orn` ({ type,
 * upper, lower } when an ornament was chosen for this note).
 */
export function playNote(rt, when, midi, dur, vol, ev = NO_EV) {
  switch (rt.kind) {
    case 'ks': case 'rbell': return struck(rt, when, midi, dur, vol, ev, renderedNote);
    case 'voice': return singNote(rt, when, midi, dur, vol, ev);
    case 'bowed': case 'reed': case 'brass': case 'pipe': case 'wheel': return sustainNote(rt, when, midi, dur, vol, ev);
    case 'osc': return oscNote(rt, when, midi, dur, vol);
    case 'pluck': case 'bell': return struck(rt, when, midi, dur, vol, ev, legacyNote);
    default: return struck(rt, when, midi, dur, vol, ev, legacyNote);
  }
}

/** Plucked and struck things ornament by striking again. */
function struck(rt, when, midi, dur, vol, ev, fn) {
  const o = ev.orn;
  if (!o) { fn(rt, when, midi, dur, vol); return; }
  const g = Math.min(0.075, dur / 6);
  if (o.type === 'mordent') {
    fn(rt, when, midi, g, vol); fn(rt, when + g, o.lower, g, vol * 0.7); fn(rt, when + 2 * g, midi, dur - 2 * g, vol * 0.8);
  } else if (o.type === 'grace') {
    fn(rt, when, o.upper, g, vol * 0.65); fn(rt, when + g, midi, dur - g, vol);
  } else {
    const half = 0.07, n = Math.max(3, Math.floor((dur * 0.5) / half));
    for (let i = 0; i < n; i++) fn(rt, when + i * half, i % 2 ? midi : o.upper, half, vol * (i ? 0.62 : 0.85));
    fn(rt, when + n * half, midi, dur - n * half, vol * 0.8);
  }
}

// ── rendered strings and bells ─────────────────────────────────────────────

function renderedNote(rt, when, midi, dur, vol) {
  const { env, inst } = rt, ctx = env.ctx;
  const { buf, rate } = renderedFor(env, inst, midi);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  if (rate !== 1) src.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.setValueAtTime(Math.max(0.0002, vol * (inst.gain ?? 1)), when);
  src.connect(g); g.connect(rt.input);
  let stop = when + buf.duration / rate;
  // A string rings past its written length until a finger damps it; a bell and
  // a harp are left to ring (ring: -1).
  const ring = inst.ring ?? 0.4, damp = inst.damp ?? 0.1;
  if (ring >= 0 && when + dur + ring < stop) {
    g.gain.setTargetAtTime(0, when + dur + ring, damp / 4);
    stop = Math.min(stop, when + dur + ring + damp * 1.6);
  }
  // One string, one note: plucking a course again stops what it was sounding.
  const key = Math.round(midi);
  const prev = rt.ringing.get(key);
  if (prev && prev.stop > when + 0.02) {
    prev.g.gain.cancelScheduledValues(when);
    prev.g.gain.setTargetAtTime(0, when, 0.012);
    try { prev.src.stop(when + 0.08); } catch (e) { /* ignore */ }
  }
  rt.ringing.set(key, { src, g, stop });
  src.start(when);
  src.stop(stop);
}

// ── sung voices ────────────────────────────────────────────────────────────

function nextVowel(rt) {
  const v = rt.vowels[rt.vi % rt.vowels.length];
  rt.vi++;
  return v;
}

/** The section's seats: up to three panners per bank, so singers stand apart. */
function seatsFor(rt, b, n) {
  if (n < 2) return null;
  if (b.seats) return b.seats;
  const ctx = rt.env.ctx, w = rt.inst.width ?? 0.5;
  if (typeof ctx.createStereoPanner !== 'function') return null;
  b.seats = [-w, 0, w].map((p) => { const s = ctx.createStereoPanner(); s.pan.value = p; s.connect(b.input); return s; });
  return b.seats;
}

function consonant(rt, when, vol) {
  const c = rt.inst.consonant ?? 0.1;
  if (c > 0) burst(rt.env, rt.out, when - 0.014, c * vol * (rt.inst.gain ?? 1), rng.float(2400, 5200), 1.3, 0.022);
}

function singNote(rt, when, midi, dur, vol, ev) {
  const { env, inst } = rt, ctx = env.ctx;
  const f = midiToFreq(midi);
  const reg = registerFor(inst, midi);
  const bank = bankFor(rt, reg);
  const vowel = (ev.vowel && VOWELS.includes(ev.vowel[0]) ? ev.vowel[0] : null) || nextVowel(rt);
  const amp = Math.max(0.0002, vol * (inst.gain ?? 1));
  const end = when + dur;
  const open = rt.open;
  if (rt.legato && ev.tieIn && open && open.reg === reg && open.stopAt > when + 0.01) {
    // The same breath carries on: glide to the new pitch, and if the vowel
    // changed, that is a new syllable — a soft consonant and a small dip.
    const syll = vowel !== open.vowel;
    vowelTo(rt, bank, vowel, f, when, 0.035);
    holdVoice(open, when, amp);
    glideVoice(open, f, when, inst.glide ?? 0.06);
    if (syll) { dipVoice(open, when, 0.6, 0.08); consonant(rt, when, vol * 0.7); }
    open.vowel = vowel;
    if (ev.orn) ornamentPitch(open, when, dur, f, ev.orn);
    finishVoice(rt, open, end, ev);
    return;
  }
  vowelTo(rt, bank, vowel, f, when - 0.01, 0.012);
  const n = Math.max(1, rt.section || 1);
  const seats = seatsFor(rt, bank, n);
  const v = newVoice(inst.release ?? 0.24);
  v.reg = reg; v.vowel = vowel; v.f = f; v.amp = amp;
  const glottal = waveFor(env, 'glottal');
  const atk = inst.attack ?? 0.09, dc = inst.detuneCents ?? 9, smear = inst.smear ?? 0.035;
  const scoop = ev.orn ? 0 : (inst.scoop ?? 30);
  const breathe = n >= 3 && dur > 5;
  for (let i = 0; i < n; i++) {
    const o = kRate(ctx.createOscillator());
    if (glottal) o.setPeriodicWave(glottal); else o.type = 'sawtooth';
    const t0 = when + (i ? rng.float(0, smear) : 0);
    o.detune.setValueAtTime(n > 1 ? rng.float(-dc, dc) : 0, t0);
    // Singers find a note from just below it.
    o.frequency.setValueAtTime(f * cents(-scoop * rng.float(0.6, 1.3)), t0);
    o.frequency.setTargetAtTime(f, t0 + 0.008, 0.028);
    const g = ctx.createGain();
    const w = (1 / Math.sqrt(n)) * (n > 1 ? rng.float(0.8, 1.2) : 1);
    const p = g.gain;
    p.setValueAtTime(0, t0);
    p.linearRampToValueAtTime(amp * w, t0 + atk * rng.float(0.85, 1.2));
    if (dur > 1.4) {
      // A held note swells a little and settles (messa di voce), as breath does.
      p.setTargetAtTime(amp * w * 1.12, t0 + atk, dur * 0.22);
      p.setTargetAtTime(amp * w * 0.95, t0 + atk + dur * 0.45, dur * 0.25);
    }
    if (breathe) {
      // In a long held chord the singers breathe in turn, never all at once.
      for (let tb = t0 + rng.float(2.5, 5.5); tb < end - 1.4; tb += rng.float(4, 7.5)) {
        p.setTargetAtTime(amp * w * 0.1, tb, 0.07);
        p.setTargetAtTime(amp * w, tb + 0.45, 0.12);
      }
    }
    o.connect(g);
    g.connect(seats ? seats[i % seats.length] : bank.input);
    o.start(t0);
    v.oscs.push({ o, ratio: 1 }); v.envs.push({ p, w }); v.srcs.push(o);
    link(v, rt.jitters[i % rt.jitters.length].out, o.detune);
  }
  // Vibrato: two slightly different rates across a section, one for a soloist.
  const oscs = v.oscs.map((x) => x.o);
  attachVibrato(env, v, inst, when, dur, oscs.filter((_, i) => i % 2 === 0));
  if (n > 1) attachVibrato(env, v, { vibrato: { ...inst.vibrato, rate: (inst.vibrato?.rate ?? 5) * 1.09 } }, when, dur, oscs.filter((_, i) => i % 2 === 1));
  // Breath: aspiration noise through the same throat, so it whispers the vowel.
  if (inst.breath) {
    const s = noiseSource(env, when);
    const bp = biquad(ctx, 'bandpass', 1800, 0.6);
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(0, when);
    bg.gain.linearRampToValueAtTime(amp * inst.breath, when + atk);
    s.connect(bp); bp.connect(bg); bg.connect(bank.input);
    v.envs.push({ p: bg.gain, w: inst.breath }); v.srcs.push(s);
  }
  if (rng.chance(inst.onsetChance ?? 0.75)) consonant(rt, when, vol);
  if (ev.orn) ornamentPitch(v, when, dur, f, ev.orn);
  finishVoice(rt, v, end, ev);
}

// ── bowed, reed, brass, pipe, wheel ────────────────────────────────────────

/** Organ pipes stand on the chest alternately left and right by semitone. */
function pipePan(m, spread) { return clamp((m % 2 ? 1 : -1) * spread * (0.35 + 0.65 * (((m % 24) + 24) % 24) / 23), -1, 1); }
/** Every pipe is voiced very slightly off, and always the same way. */
function pipeCents(m, c) { return ((((m * 2654435761) >>> 0) / 4294967296) * 2 - 1) * c; }

function sustainNote(rt, when, midi, dur, vol, ev) {
  const { env, inst } = rt, ctx = env.ctx;
  const f = midiToFreq(midi);
  const amp = Math.max(0.0002, vol * (inst.gain ?? 1));
  const end = when + dur;
  const open = rt.open;
  if (rt.legato && ev.tieIn && open && open.stopAt > when + 0.01) {
    holdVoice(open, when, amp);
    glideVoice(open, f, when, inst.glide ?? 0.035);
    if (inst.rearticulate) dipVoice(open, when, inst.rearticulate, 0.05);
    if (ev.orn) ornamentPitch(open, when, dur, f, ev.orn);
    finishVoice(rt, open, end, ev);
    return;
  }
  const v = newVoice(inst.release ?? 0.12);
  v.f = f; v.amp = amp;
  let dest = rt.input;
  if (inst.panSpread && typeof ctx.createStereoPanner === 'function') {
    const pn = ctx.createStereoPanner();
    pn.pan.value = pipePan(Math.round(midi), inst.panSpread);
    pn.connect(dest); dest = pn;
  }
  if (inst.bright) {
    // Brass: the lips need a moment to lock on, so the tone brightens through
    // the attack — louder notes open further. That swell of treble is the
    // difference between a sackbut and a filtered sawtooth.
    const [b0, b1] = inst.bright;
    const top = f * (b1 + (inst.brightVel ?? 2) * vol);
    const lp = biquad(ctx, 'lowpass', Math.min(f * b0, env.rate * 0.45), 0.9);
    lp.frequency.setValueAtTime(Math.min(f * b0, env.rate * 0.45), when);
    lp.frequency.setTargetAtTime(Math.min(top * 1.25, env.rate * 0.45), when + 0.004, 0.018);
    lp.frequency.setTargetAtTime(Math.min(top, env.rate * 0.45), when + 0.07, 0.12);
    lp.connect(dest); dest = lp;
  }
  const eg = ctx.createGain();
  eg.connect(dest);
  const atk = inst.attack ?? 0.05, sus = inst.sustainLevel ?? 0.9;
  eg.gain.setValueAtTime(0, when);
  eg.gain.linearRampToValueAtTime(amp, when + atk);
  eg.gain.setTargetAtTime(amp * sus, when + atk, 0.08);
  v.envs.push({ p: eg.gain, w: sus });
  // Sources: ranks of pipes, or courses of strings, or one reed.
  const onset = ev.orn ? 0 : (inst.onsetCents ?? 0);
  const ranks = inst.ranks || [[inst.wave || 'sawtooth', 1, 1]];
  const courses = Math.max(1, inst.courses || 1);
  let norm = 0;
  for (const r of ranks) norm += r[2];
  norm = 1 / (norm * Math.sqrt(courses));
  const detuneBase = inst.pipeCents ? pipeCents(Math.round(midi), inst.pipeCents) : 0;
  for (const [wave, ratio, level] of ranks) {
    for (let c = 0; c < courses; c++) {
      const o = kRate(ctx.createOscillator());
      setWave(env, o, wave);
      const fr = f * ratio;
      if (onset) {
        o.frequency.setValueAtTime(fr * cents(onset), when);
        o.frequency.setTargetAtTime(fr, when + 0.003, inst.onsetTau ?? 0.018);
      } else o.frequency.setValueAtTime(fr, when);
      const spread = courses > 1 ? (c - (courses - 1) / 2) * (inst.spread ?? 5) : 0;
      o.detune.setValueAtTime(detuneBase + spread + rng.float(-1.5, 1.5), when);
      const og = ctx.createGain();
      og.gain.value = level * norm;
      o.connect(og); og.connect(eg);
      o.start(when);
      v.oscs.push({ o, ratio }); v.srcs.push(o);
      if (rt.jitter) link(v, rt.jitter.out, o.detune);
      if (rt.wobble) link(v, rt.wobble.out, o.detune);
    }
  }
  attachVibrato(env, v, inst, when, dur, v.oscs.map((x) => x.o));
  // The noise that rides the tone: bow hair, breath, lip buzz. It bites harder
  // at the attack, then settles to a thread under the note.
  if (inst.noise) {
    const s = noiseSource(env, when);
    const bp = biquad(ctx, 'bandpass', inst.noiseHz ?? Math.min(6000, f * (inst.noiseMul ?? 4)), inst.noiseQ ?? 0.8);
    const ng = ctx.createGain();
    const lvl = amp * inst.noise;
    ng.gain.setValueAtTime(0, when);
    ng.gain.linearRampToValueAtTime(lvl * (inst.noiseAttack ?? 3), when + 0.01);
    ng.gain.setTargetAtTime(lvl, when + 0.02, 0.04);
    s.connect(bp); bp.connect(ng); ng.connect(dest);
    v.envs.push({ p: ng.gain, w: inst.noise }); v.srcs.push(s);
  }
  // Pipe chiff: the air jet overshoots before the pipe speaks — a breathy spit
  // an octave or a twelfth up, over in a few tens of milliseconds.
  if (inst.chiff) burst(env, dest, when, amp * inst.chiff, Math.min(8000, f * (inst.chiffHarm ?? 2)), 3, 0.04);
  // The symphonia's tangent striking the string.
  if (inst.click) burst(env, dest, when, amp * inst.click, 2400, 2, 0.008);
  const buzz = rt.def.trompette ?? inst.trompette ?? 0;
  if (buzz) trompette(rt, when, f, amp * buzz, dest);
  finishVoice(rt, v, end, ev);
}

/**
 * The symphonia's trompette: a string whose loose bridge (the "dog") rattles
 * against the soundboard when the player jerks the wheel, a rhythmic buzz on
 * the stroke. A bright pulse through a narrow band, chopped by a fast rattle.
 */
function trompette(rt, when, f, level, dest) {
  const { env } = rt, ctx = env.ctx;
  const o = ctx.createOscillator();
  setWave(env, o, 'pulse12');
  o.frequency.value = f;
  const bp = biquad(ctx, 'bandpass', 1300, 2.5);
  const chop = ctx.createGain();
  chop.gain.value = 0.5;
  const lfo = ctx.createOscillator(), lg = ctx.createGain();
  lfo.type = 'square'; lfo.frequency.value = rng.float(28, 38); lg.gain.value = 0.5;
  lfo.connect(lg); lg.connect(chop.gain);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(level, when + 0.01);
  g.gain.setTargetAtTime(0, when + 0.05, 0.07);
  o.connect(bp); bp.connect(chop); chop.connect(g); g.connect(dest);
  o.start(when); lfo.start(when);
  o.stop(when + 0.5); lfo.stop(when + 0.5);
}

// ── plain oscillator layers (`wave:` without an instrument) ─────────────────

function oscNote(rt, when, midi, dur, vol) {
  const { env, def } = rt, ctx = env.ctx;
  const osc = ctx.createOscillator();
  setWave(env, osc, def.wave);
  osc.frequency.setValueAtTime(midiToFreq(midi), when);
  try { osc.detune.setValueAtTime((def.detune || 0) + rng.float(-4, 4), when); } catch (e) { /* ignore */ }
  const g = ctx.createGain();
  const rel = def.sustain ?? 0.06, atk = def.attack ?? 0.006, end = when + dur, amp = Math.max(0.0002, vol);
  g.gain.setValueAtTime(0.0001, when);
  g.gain.linearRampToValueAtTime(amp, when + Math.min(atk, dur * 0.5));
  g.gain.setValueAtTime(amp, Math.max(when + 0.001, end - Math.min(rel, dur * 0.5)));
  g.gain.exponentialRampToValueAtTime(0.0001, end + rel);
  let node = osc;
  if (def.filter) node = filterFor(ctx, osc, def.filter, when, dur);
  node.connect(g); g.connect(rt.out);
  osc.start(when); osc.stop(end + rel + 0.06);
}

function filterFor(ctx, src, f, t0, dur) {
  const bq = biquad(ctx, f.type || 'lowpass', Math.max(20, f.freq ?? 1200), f.q ?? 0.7, f.gain ?? null);
  bq.frequency.setValueAtTime(Math.max(20, f.freq ?? 1200), t0);
  if (f.sweepTo != null) bq.frequency.exponentialRampToValueAtTime(Math.max(20, f.sweepTo), t0 + (f.sweepDur ?? dur));
  src.connect(bq);
  return bq;
}

// ── the first score's instruments (kinds pluck / bow / wind / organ / drone / bell) ──
//
// Kept exactly as they were, because the orchestral sections (strings, horns,
// woodwinds, pizzicato) are built on them and sound right.

function legacyNote(rt, when, midi, dur, vol) {
  const { env, inst } = rt, ctx = env.ctx;
  const f = Math.max(8, midiToFreq(midi));
  const amp = Math.max(0.0002, vol * (inst.gain ?? 1));
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.connect(rt.input);
  const kind = inst.kind || 'pluck';
  let stopAt;
  if (kind === 'pluck' || kind === 'bell') {
    // Struck/plucked: ring for the instrument's decay, capped so a whole-note
    // chord doesn't smear into the next bar.
    const decay = Math.min(inst.decay ?? 1.2, dur + (inst.decay ?? 1.2) * 0.5);
    const atk = inst.attack ?? 0.004, curve = inst.curve ?? 2.2;
    g.gain.linearRampToValueAtTime(amp, when + atk);
    for (let i = 1; i <= 6; i++) {
      const t = i / 6;
      g.gain.exponentialRampToValueAtTime(Math.max(0.0001, amp * Math.pow(1 - t, curve)), when + atk + decay * t);
    }
    stopAt = when + atk + decay + 0.05;
  } else {
    const atk = inst.attack ?? 0.05, rel = inst.release ?? 0.12, sus = inst.sustainLevel ?? 0.88, end = when + dur;
    const peak = when + Math.min(atk, dur * 0.6);
    g.gain.linearRampToValueAtTime(amp, peak);
    g.gain.linearRampToValueAtTime(Math.max(0.0002, amp * sus), Math.min(end, peak + 0.14));
    g.gain.setValueAtTime(Math.max(0.0002, amp * sus), Math.max(when + 0.002, end));
    g.gain.exponentialRampToValueAtTime(0.0001, end + rel);
    stopAt = end + rel + 0.06;
  }
  const mix = ctx.createGain();
  const sources = [];
  if (inst.partials) {
    let total = 0;
    for (const [, a] of inst.partials) total += a;
    for (const [ratio, a] of inst.partials) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(f * ratio, when);
      o.detune.setValueAtTime(rng.float(-3, 3), when);
      const pg = ctx.createGain();
      pg.gain.value = a / total;
      o.connect(pg); pg.connect(mix);
      sources.push(o);
    }
  } else {
    // `section: n` voices a note n times, each a few cents out, each a few ms
    // late, each in its own seat: sixteen violinists are not one violin louder.
    const sect = Math.max(0, inst.section || 0);
    const n = Math.max(1, sect || inst.courses || 1);
    const width = inst.width ?? (sect ? 0.55 : 0);
    for (let i = 0; i < n; i++) {
      const o = kRate(ctx.createOscillator());
      setWave(env, o, inst.wave || 'triangle');
      const t0 = sect ? when + rng.float(0, inst.smear ?? 0.022) : when;
      o.frequency.setValueAtTime(f, t0);
      const off = n === 1 ? 0 : (i - (n - 1) / 2) * (inst.spread || 0);
      const c = sect ? rng.float(-(inst.detuneCents ?? 9), inst.detuneCents ?? 9) : rng.float(-3, 3);
      o.detune.setValueAtTime(off + c, t0);
      const pg = ctx.createGain();
      pg.gain.value = (1 / n) * (sect ? rng.float(0.72, 1.28) : 1);
      o.connect(pg);
      if (width > 0 && typeof ctx.createStereoPanner === 'function') {
        const pan = ctx.createStereoPanner();
        pan.pan.value = n === 1 ? 0 : ((i / (n - 1)) * 2 - 1) * width;
        pg.connect(pan); pan.connect(mix);
      } else pg.connect(mix);
      o._startAt = t0;
      sources.push(o);
    }
  }
  if (inst.breath) {
    const s = noiseSource(env, when);
    const bp = biquad(ctx, 'bandpass', f * 2, 1.1);
    const bg = ctx.createGain(); bg.gain.value = inst.breath;
    s.connect(bp); bp.connect(bg); bg.connect(mix);
    s.stop(stopAt);
  }
  if (inst.click) {
    const s = noiseSource(env, when);
    const bp = biquad(ctx, 'bandpass', Math.min(6000, f * 6), 0.9);
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(amp * inst.click, when);
    cg.gain.exponentialRampToValueAtTime(0.0001, when + 0.035);
    s.connect(bp); bp.connect(cg); cg.connect(g);
    s.stop(when + 0.06);
  }
  let node = mix;
  if (inst.filter) {
    const fl = { ...inst.filter };
    if (fl.freq && fl.type === 'lowpass') fl.freq = Math.max(fl.freq, f * 1.6);
    if (fl.sweepTo) fl.sweepTo = Math.max(fl.sweepTo, f * 1.05);
    node = filterFor(ctx, node, fl, when, Math.max(0.05, stopAt - when));
  }
  node.connect(g);
  if (inst.vibrato) {
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.setValueAtTime(inst.vibrato.rate ?? 5, when);
    const delay = inst.vibrato.delay ?? 0;
    lg.gain.setValueAtTime(0.0001, when);
    lg.gain.setValueAtTime(0.0001, when + delay);
    lg.gain.linearRampToValueAtTime(inst.vibrato.depth ?? 4, when + delay + 0.18);
    lfo.connect(lg);
    for (const o of sources) lg.connect(o.detune);
    lfo.start(when); lfo.stop(stopAt);
  }
  for (const o of sources) { o.start(o._startAt || when); o.stop(stopAt); }
}

// ─────────────────────────────────────────────────────────────────────────────
// PERCUSSION — `wave: 'noise'` layers; notes are drum ids
//
// Skins are live synthesis (a pitched body plus filtered noise); anything
// metal — jingles, finger cymbals, bells — is rendered once into a buffer,
// because a metallic ring is a dozen inharmonic partials and a dozen live
// oscillators per hit is waste. A drum id may carry a pitch: 'bellTower:G2'.
// Unknown ids are silent, never an error.
// ─────────────────────────────────────────────────────────────────────────────

export const DRUMS = ['kick', 'snare', 'rim', 'hat', 'openhat', 'shaker', 'tom', 'tabor', 'frame', 'wardrum',
  'timp', 'timphi', 'gong', 'drip', 'crash', 'click',
  'nakers', 'nakersHi', 'tambourine', 'bellTower', 'handbell', 'cymbalettes'];

// Bell recipes shared by the drums and by the pitched bell instruments in music.js.
export const BELL_TOWER = {
  // hum, prime, tierce (the minor third that makes a bell a bell), quint,
  // nominal, and the upper partials — [ratio, amplitude, t60 at middle C]
  partials: [[0.5, 0.55, 9], [1, 0.7, 6], [1.183, 0.8, 5], [1.506, 0.3, 3], [2, 1, 3.6],
    [2.514, 0.45, 2.2], [2.662, 0.3, 1.9], [3.011, 0.35, 1.6], [4.166, 0.18, 1.1], [5.433, 0.12, 0.8], [6.796, 0.07, 0.6]],
  warble: 0.9, strike: 0.25, strikeHz: 1800, decayTilt: 0.55, maxDecay: 8,
};
export const HANDBELL = {
  // English handbells are tuned so the strongest overtone is a twelfth (3.0)
  partials: [[1, 1, 3.2], [3.0, 0.62, 1.7], [5.18, 0.2, 0.9], [8.1, 0.09, 0.5], [2.02, 0.06, 1.2]],
  warble: 0.5, strike: 0.08, strikeHz: 3200, decayTilt: 0.4, maxDecay: 4.5,
};
const METAL = {
  // one jingle pair of a tambourine: small, thin, clashing
  tambourine: { partials: [[1, 1, 0.22], [1.47, 0.8, 0.18], [2.09, 0.55, 0.14], [2.83, 0.3, 0.1]], base: [4200, 7200], hits: 5, noise: 0.35 },
  // finger cymbals: a clean, high, long ring
  cymbalettes: { partials: [[1, 1, 1.5], [2.32, 0.6, 1.0], [3.67, 0.35, 0.7], [5.1, 0.2, 0.45]], base: [2400, 2900], hits: 1, noise: 0.1 },
};

function renderMetal(spec, rate, seed) {
  const r = makeRNG(seed);
  let longest = 0;
  for (const p of spec.partials) longest = Math.max(longest, p[2]);
  const len = Math.floor(rate * Math.min(3, longest + 0.1));
  const out = new Float32Array(len);
  for (let h = 0; h < spec.hits; h++) {
    const base = r.float(spec.base[0], spec.base[1]);
    const d0 = h ? Math.floor(rate * r.float(0.002, 0.02) * h) : 0;
    const hv = h ? r.float(0.3, 0.7) : 1;
    for (const [ratio, amp, t60] of spec.partials) {
      const f = base * ratio;
      if (f > rate * 0.45) continue;
      const w = (2 * Math.PI * f) / rate, c = Math.cos(w), s = Math.sin(w), dec = Math.exp(-LN1000 / (t60 * rate));
      let x = 1, y = 0, a = amp * hv;
      for (let i = d0; i < len && a > 1e-5; i++) { out[i] += a * y; const nx = x * c - y * s; y = x * s + y * c; x = nx; a *= dec; }
    }
    // The shimmer of metal on metal: bright noise dying fast.
    let hp = 0;
    const dec = Math.exp(-LN1000 / (0.12 * rate));
    let a = spec.noise * hv;
    for (let i = d0; i < len && a > 1e-5; i++) { const w = r.float(-1, 1); hp = w - hp * 0.2; out[i] += hp * a; a *= dec; }
  }
  let peak = 0;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(out[i]));
  for (let i = 0; i < len; i++) out[i] *= 0.6 / (peak || 1);
  return out;
}

function metalBuffer(env, id) {
  const v = rng.int(0, 3);
  const k = 'metal|' + id + '|' + v + '|' + env.rate;
  let b = cacheGet(k);
  if (!b) { b = toBuffer(env.ctx, renderMetal(METAL[id], env.rate, id + v), env.rate); cachePut(k, b); }
  return b;
}

const bellInst = { tower: { kind: 'rbell', ...BELL_TOWER }, hand: { kind: 'rbell', ...HANDBELL } };

function noteNum(s) {
  const m = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(s || '');
  if (!m) return NaN;
  const n = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[m[1].toLowerCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return (parseInt(m[3], 10) + 1) * 12 + n;
}

function playBuffer(env, buf, when, vol, dest, rate = 1) {
  const ctx = env.ctx;
  const s = ctx.createBufferSource();
  s.buffer = buf;
  if (rate !== 1) s.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.value = vol;
  s.connect(g); g.connect(dest);
  s.start(when);
}

/** One percussion hit. */
export function playDrum(env, id, when, vol, dest) {
  const ctx = env.ctx;
  const colon = id.indexOf(':');
  const name = colon > 0 ? id.slice(0, colon) : id;
  const mk = (o) => {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(Math.max(0.0002, o.vol), when + (o.atk ?? 0.001));
    g.gain.exponentialRampToValueAtTime(0.0001, when + (o.atk ?? 0.001) + o.dec);
    g.connect(dest);
    return g;
  };
  const osc = (o) => {
    const s = ctx.createOscillator();
    s.type = o.type || 'sine';
    s.frequency.setValueAtTime(o.f0, when);
    if (o.f1) s.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), when + o.dec * 0.9);
    const g = mk(o);
    if (o.filter) filterFor(ctx, s, o.filter, when, o.dec).connect(g); else s.connect(g);
    s.start(when); s.stop(when + o.dec + 0.05);
  };
  const nz = (o) => {
    const s = noiseSource(env, when, o.pink ? env.pink : env.noise);
    const g = mk(o);
    filterFor(ctx, s, o.filter, when, o.dec).connect(g);
    s.stop(when + o.dec + 0.05);
  };
  switch (name) {
    case 'kick':
      osc({ f0: 150, f1: 44, dec: 0.19, vol: 0.9 * vol });
      nz({ filter: { type: 'lowpass', freq: 2400, sweepTo: 300 }, dec: 0.03, vol: 0.25 * vol });
      break;
    case 'snare':
      nz({ filter: { type: 'highpass', freq: 1300, q: 0.8 }, dec: 0.13, vol: 0.55 * vol });
      osc({ f0: 195, f1: 150, dec: 0.07, vol: 0.3 * vol, type: 'triangle' });
      break;
    case 'rim':
      nz({ filter: { type: 'bandpass', freq: 2200, q: 6 }, dec: 0.05, vol: 0.5 * vol });
      osc({ f0: 420, f1: 300, dec: 0.035, vol: 0.25 * vol, type: 'square' });
      break;
    case 'hat': nz({ filter: { type: 'highpass', freq: 7200, q: 0.9 }, dec: 0.035, vol: 0.4 * vol }); break;
    case 'openhat': nz({ filter: { type: 'highpass', freq: 6200, q: 0.9 }, dec: 0.2, vol: 0.32 * vol }); break;
    case 'shaker': nz({ pink: true, filter: { type: 'bandpass', freq: 5200, q: 1.1 }, dec: 0.06, vol: 0.5 * vol }); break;
    case 'tom':
      osc({ f0: 230, f1: 105, dec: 0.24, vol: 0.7 * vol });
      nz({ filter: { type: 'lowpass', freq: 1400, sweepTo: 400 }, dec: 0.07, vol: 0.14 * vol });
      break;
    // ── medieval ───────────────────────────────────────────────────────────
    case 'tabor':          // small snared side-drum, the dance drum of the period
      osc({ f0: 220, f1: 170, dec: 0.075, vol: 0.34 * vol, type: 'triangle' });
      nz({ filter: { type: 'bandpass', freq: 1900, q: 1.2 }, dec: 0.075, vol: 0.30 * vol });
      break;
    case 'frame':          // hand-struck frame drum — soft and woody
      osc({ f0: 128, f1: 78, dec: 0.24, vol: 0.72 * vol });
      nz({ filter: { type: 'lowpass', freq: 900, q: 0.7, sweepTo: 240 }, dec: 0.10, vol: 0.16 * vol });
      break;
    case 'wardrum':        // big deep drum — felt in the chest, not the ears
      osc({ f0: 92, f1: 46, dec: 0.42, vol: 0.95 * vol });
      osc({ f0: 138, f1: 70, dec: 0.16, vol: 0.22 * vol, type: 'triangle' });
      nz({ filter: { type: 'lowpass', freq: 600, q: 0.8, sweepTo: 160 }, dec: 0.09, vol: 0.14 * vol });
      break;
    case 'nakers':         // the paired small kettledrums of a medieval band: a dry, tuned "tok"
      osc({ f0: 205, f1: 170, dec: 0.16, vol: 0.62 * vol });
      osc({ f0: 412, f1: 345, dec: 0.05, vol: 0.12 * vol, type: 'triangle' });
      nz({ filter: { type: 'bandpass', freq: 2700, q: 2 }, dec: 0.016, vol: 0.34 * vol });
      nz({ filter: { type: 'lowpass', freq: 1100, q: 0.7 }, dec: 0.06, vol: 0.12 * vol });
      break;
    case 'nakersHi':       // the higher of the pair
      osc({ f0: 298, f1: 252, dec: 0.13, vol: 0.55 * vol });
      osc({ f0: 600, f1: 510, dec: 0.04, vol: 0.1 * vol, type: 'triangle' });
      nz({ filter: { type: 'bandpass', freq: 3200, q: 2 }, dec: 0.014, vol: 0.34 * vol });
      break;
    case 'tambourine':     // a thumb on the skin and the jingles answering
      osc({ f0: 190, f1: 140, dec: 0.05, vol: 0.18 * vol });
      playBuffer(env, metalBuffer(env, 'tambourine'), when, 0.55 * vol, dest);
      break;
    case 'cymbalettes':    // finger cymbals
      playBuffer(env, metalBuffer(env, 'cymbalettes'), when, 0.42 * vol, dest);
      break;
    case 'bellTower': {    // a great bell in the tower, D3 unless told otherwise
      const m = colon > 0 ? noteNum(id.slice(colon + 1)) : 50;
      const { buf, rate } = renderedFor(env, bellInst.tower, Number.isFinite(m) ? m : 50);
      playBuffer(env, buf, when, 0.7 * vol, dest, rate);
      break;
    }
    case 'handbell': {     // the sanctus bell, A5 unless told otherwise
      const m = colon > 0 ? noteNum(id.slice(colon + 1)) : 81;
      const { buf, rate } = renderedFor(env, bellInst.hand, Number.isFinite(m) ? m : 81);
      playBuffer(env, buf, when, 0.5 * vol, dest, rate);
      break;
    }
    // ── orchestral ─────────────────────────────────────────────────────────
    case 'timp':
      osc({ f0: 110, f1: 82, dec: 0.9, vol: 0.9 * vol });
      osc({ f0: 165, f1: 124, dec: 0.5, vol: 0.30 * vol });
      osc({ f0: 220, f1: 168, dec: 0.28, vol: 0.14 * vol, type: 'triangle' });
      nz({ filter: { type: 'lowpass', freq: 800, q: 0.8, sweepTo: 180 }, dec: 0.12, vol: 0.16 * vol });
      break;
    case 'timphi':
      osc({ f0: 165, f1: 124, dec: 0.75, vol: 0.85 * vol });
      osc({ f0: 248, f1: 186, dec: 0.4, vol: 0.26 * vol });
      nz({ filter: { type: 'lowpass', freq: 950, q: 0.8, sweepTo: 220 }, dec: 0.1, vol: 0.14 * vol });
      break;
    case 'gong':
      osc({ f0: 84, f1: 72, dec: 2.4, vol: 0.34 * vol, atk: 0.02 });
      osc({ f0: 131, f1: 118, dec: 2.0, vol: 0.20 * vol, type: 'triangle', atk: 0.03 });
      osc({ f0: 197, f1: 174, dec: 1.6, vol: 0.13 * vol, type: 'triangle', atk: 0.04 });
      nz({ filter: { type: 'bandpass', freq: 1800, q: 0.5 }, dec: 1.8, vol: 0.16 * vol, atk: 0.05 });
      break;
    case 'drip':
      osc({ f0: 1500, f1: 620, dec: 0.10, vol: 0.30 * vol, atk: 0.002 });
      nz({ filter: { type: 'bandpass', freq: 2600, q: 5 }, dec: 0.035, vol: 0.10 * vol });
      break;
    case 'crash': nz({ filter: { type: 'highpass', freq: 4200, q: 0.7 }, dec: 0.75, vol: 0.3 * vol, atk: 0.004 }); break;
    case 'click': nz({ filter: { type: 'bandpass', freq: 2800, q: 5 }, dec: 0.03, vol: 0.4 * vol }); break;
    default: break;        // unknown drum: silence, by contract
  }
}
