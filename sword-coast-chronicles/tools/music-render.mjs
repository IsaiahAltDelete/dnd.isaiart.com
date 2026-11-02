// tools/music-render.mjs — render the score offline in headless Chromium: 16-bit WAVs plus measurements.
//
// You cannot hear a CI run, so the score is checked the way a mastering engineer
// checks a mix without speakers: render it, then measure it. Each render writes a
// WAV you can audition later and prints peak / RMS / gated loudness / clipping /
// silence / spectral centroid / stereo correlation.
//
//   NODE=node   # any Node 18+
//   $NODE tools/music-render.mjs --tracks town,battle --seconds 20          # output/music/<id>.wav
//   $NODE tools/music-render.mjs --tracks all --seconds 15 --out output/music/before
//   $NODE tools/music-render.mjs --instruments voiceTenor,lutePlucked      # scale + chord each
//   $NODE tools/music-render.mjs --instruments all --out output/music/instruments
//   $NODE tools/music-render.mjs --loudness                                # rewrite src/core/music_loudness.js
//   $NODE tools/music-render.mjs --loudness --reference -33.3              # ... keeping the score's level where it was
//                                    (the median moves whenever a book adds tracks, and with it every track's level)
//   $NODE tools/music-render.mjs --tracks town --realtime                  # through the LIVE scheduler
//   $NODE tools/music-render.mjs --script my-probe.js                      # your own page code (see below)
//
// Options: --seconds <n> (default 20)  --rate <Hz> (default 44100)  --skip <s> measured
//          --whole-loop renders one complete loop plus two seconds of its repeat
//          from (default 1)  --out <dir>  --room <kind> (override)  --dry (no room, no
//          mastering)  --nowav (measure only)  --json <file> (all stats)
//
// --realtime drives the real Audio.music() path: the page's AudioContext is an
// OfflineAudioContext that claims to be running and is suspended every 100 ms of
// render time so the live lookahead scheduler gets to run. It works on ANY version
// of audio.js (it is how the pre-overhaul baseline was captured) and it exercises
// the scheduler itself; the default path uses Audio.render(), which schedules the
// whole render up front and is several times faster.
//
// --script: the file is the body of an async function run in the page with
// `lib` in scope ({ Audio, music, stats, wav, renderRealtime }); return
// { wavs: { name: base64 }, ...anything } and the wavs are written to --out.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadChromium, browserCandidates } from './pwlocate.mjs';
import { acquireBrowserSlot } from './browserlock.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const A = { seconds: 20, rate: 44100, skip: 1 };
for (let i = 2; i < process.argv.length; i++) {
  const k = process.argv[i];
  if (!k.startsWith('--')) continue;
  const v = process.argv[i + 1];
  if (v === undefined || v.startsWith('--')) { A[k.slice(2)] = true; continue; }
  A[k.slice(2)] = v; i++;
}
A.seconds = Number(A.seconds); A.rate = Number(A.rate); A.skip = Number(A.skip);
const OUT = path.resolve(ROOT, A.out || (A.instruments ? 'output/music/instruments' : 'output/music'));
fs.mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------- server
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  try {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (u === '/__render.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><meta charset="utf-8"><title>render</title>'); return; }
    const f = path.join(ROOT, u);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(f).pipe(res);
  } catch (e) { res.writeHead(500); res.end(String(e)); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

// ---------------------------------------------------------------- browser
const chromium = await loadChromium();
const releaseSlot = await acquireBrowserSlot();
const CANDIDATES = browserCandidates();
let browser = null, launchErr = null;
for (const exe of [undefined, ...CANDIDATES]) {
  try { browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] }); break; } catch (e) { launchErr = e; }
}
if (!browser) { console.error('no launchable browser:', String(launchErr).split('\n')[0]); releaseSlot(); server.close(); process.exit(2); }
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + String(e.stack || e).split('\n').slice(0, 3).join(' | ')));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text().slice(0, 300)); });
await page.goto(`${BASE}/__render.html`);

// ---------------------------------------------------------------- page library
// Installed once as window.__lib; everything below runs inside Chromium.
await page.evaluate(() => {
  const L = {};
  L.load = async () => {
    if (L.Audio) return L;
    L.Audio = (await import('/src/core/audio.js')).Audio;
    L.music = await import('/src/core/music.js');
    L.TABLE_VOLUME = (await import('/src/core/audio.js')).TABLE_VOLUME;
    return L;
  };

  /** Minimal radix-2 FFT, in place. */
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < len / 2; k++) {
          const ar = re[i + k], ai = im[i + k];
          const br = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
          const bi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
          re[i + k] = ar + br; im[i + k] = ai + bi;
          re[i + k + len / 2] = ar - br; im[i + k + len / 2] = ai - bi;
          const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
        }
      }
    }
  }
  L.fft = fft;

  /** Average power spectrum of [t0, t1) of a mono mix. Returns { bins: Float64Array, hz }. */
  L.spectrum = (buf, t0 = 0, t1 = null, N = 8192) => {
    const sr = buf.sampleRate;
    const a = buf.getChannelData(0), b = buf.numberOfChannels > 1 ? buf.getChannelData(1) : a;
    const s0 = Math.floor(t0 * sr), s1 = Math.min(a.length, Math.floor((t1 ?? buf.duration) * sr));
    const pow = new Float64Array(N / 2);
    const re = new Float64Array(N), im = new Float64Array(N);
    let frames = 0;
    for (let s = s0; s + N <= s1; s += N / 2) {
      for (let i = 0; i < N; i++) { const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1)); re[i] = (a[s + i] + b[s + i]) * 0.5 * w; im[i] = 0; }
      fft(re, im);
      for (let i = 0; i < N / 2; i++) pow[i] += re[i] * re[i] + im[i] * im[i];
      frames++;
    }
    if (frames) for (let i = 0; i < N / 2; i++) pow[i] /= frames;
    return { bins: pow, hz: sr / N, frames };
  };

  const db = (x) => (x > 0 ? 20 * Math.log10(x) : -200);
  L.db = db;

  /** The numbers worth knowing about a render. */
  L.stats = (buf, skip = 0) => {
    const sr = buf.sampleRate;
    const a = buf.getChannelData(0), b = buf.numberOfChannels > 1 ? buf.getChannelData(1) : a;
    const s0 = Math.min(a.length, Math.floor(skip * sr));
    let peak = 0, clip = 0, sum = 0, lr = 0, l2 = 0, r2 = 0, bad = 0;
    for (let i = s0; i < a.length; i++) {
      const x = a[i], y = b[i];
      if (!Number.isFinite(x) || !Number.isFinite(y)) { bad++; continue; }
      const ax = Math.abs(x), ay = Math.abs(y);
      if (ax > peak) peak = ax; if (ay > peak) peak = ay;
      if (ax >= 1) clip++; if (ay >= 1) clip++;
      sum += x * x + y * y; lr += x * y; l2 += x * x; r2 += y * y;
    }
    const n = Math.max(1, a.length - s0);
    const rms = Math.sqrt(sum / (2 * n));
    // Gated loudness in the spirit of BS.1770 (no K-weighting): 400 ms blocks on a
    // 100 ms hop, an absolute gate at -70 dBFS and a relative gate 10 dB under the
    // ungated mean, so a sparse track is judged by its notes and not its rests.
    const blk = Math.floor(0.4 * sr), hop = Math.floor(0.1 * sr);
    const es = [];
    for (let s = s0; s + blk <= a.length; s += hop) {
      let e = 0;
      for (let i = s; i < s + blk; i++) e += a[i] * a[i] + b[i] * b[i];
      es.push(e / (2 * blk));
    }
    const gate1 = es.filter((e) => e > 1e-7);
    const m1 = gate1.reduce((x, y) => x + y, 0) / Math.max(1, gate1.length);
    const gate2 = gate1.filter((e) => e > m1 * 0.1);
    const loud = gate2.length ? db(Math.sqrt(gate2.reduce((x, y) => x + y, 0) / gate2.length)) : -200;
    // Silence: 50 ms windows under -60 dBFS.
    const w = Math.floor(0.05 * sr);
    let quiet = 0, wins = 0;
    for (let s = s0; s + w <= a.length; s += w) {
      let e = 0;
      for (let i = s; i < s + w; i++) e += a[i] * a[i];
      wins++; if (Math.sqrt(e / w) < 0.001) quiet++;
    }
    const sp = L.spectrum(buf, skip, null, 4096);
    let num = 0, den = 0, lo = 0, mid = 0, hi = 0;
    for (let i = 1; i < sp.bins.length; i++) {
      const f = i * sp.hz, p = sp.bins[i];
      num += f * p; den += p;
      if (f < 250) lo += p; else if (f < 2000) mid += p; else hi += p;
    }
    const tot = lo + mid + hi || 1;
    return {
      seconds: +(a.length / sr).toFixed(2), peak: +peak.toFixed(4), peakDb: +db(peak).toFixed(2), clip, nonFinite: bad,
      rmsDb: +db(rms).toFixed(2), loudDb: +loud.toFixed(2), crestDb: +(db(peak) - db(rms)).toFixed(2),
      silence: +(quiet / Math.max(1, wins)).toFixed(3), centroid: Math.round(den ? num / den : 0),
      bands: [+(lo / tot).toFixed(3), +(mid / tot).toFixed(3), +(hi / tot).toFixed(3)],
      corrLR: +(lr / Math.sqrt(l2 * r2 || 1)).toFixed(3),
    };
  };

  /** 16-bit PCM WAV of an AudioBuffer, as base64. */
  L.wav = (buf) => {
    const ch = Math.min(2, buf.numberOfChannels), n = buf.length, sr = buf.sampleRate;
    const bytes = new Uint8Array(44 + n * ch * 2);
    const v = new DataView(bytes.buffer);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) bytes[o + i] = s.charCodeAt(i); };
    str(0, 'RIFF'); v.setUint32(4, 36 + n * ch * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * ch * 2, true); v.setUint16(32, ch * 2, true);
    v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * ch * 2, true);
    const data = [];
    for (let c = 0; c < ch; c++) data.push(buf.getChannelData(c));
    let o = 44;
    for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) {
      const x = Math.max(-1, Math.min(1, data[c][i] || 0));
      v.setInt16(o, x < 0 ? x * 0x8000 : x * 0x7fff, true); o += 2;
    }
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  };

  /**
   * Render through the LIVE path: a fresh copy of audio.js whose AudioContext is
   * an OfflineAudioContext that says it is running, suspended every `step`
   * seconds so the real lookahead scheduler fills the next stretch.
   */
  L.renderRealtime = async (trackId, { seconds = 20, rate = 44100, track = null, step = 0.1 } = {}) => {
    const Real = window.OfflineAudioContext;
    class FakeRealtime extends Real {
      constructor() { super(2, Math.ceil(seconds * rate), rate); }
      get state() { return 'running'; }
      resume() { return Promise.resolve(); }
    }
    const saved = window.AudioContext;
    window.AudioContext = FakeRealtime;
    let mod;
    try { mod = await import('/src/core/audio.js?rt=' + Math.random().toString(36).slice(2)); } finally { window.AudioContext = saved; }
    const Au = mod.Audio;
    window.AudioContext = FakeRealtime;
    Au.init();
    window.AudioContext = saved;
    if (track) Au.TRACKS[trackId] = track;
    const ctx = Au.ctx;
    Au.music(trackId, { fade: 0.05 });
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let t = step; t < seconds; t += step) {
      ctx.suspend(t).then(() => wait(30).then(() => Real.prototype.resume.call(ctx)));
    }
    const buf = await ctx.startRendering();
    try { Au.stopAll(); } catch (e) { /* ignore */ }
    if (track) delete Au.TRACKS[trackId];
    return buf;
  };

  window.__lib = L;
});

// ---------------------------------------------------------------- jobs
const results = {};
function writeWav(name, b64) {
  if (!b64 || A.nowav) return null;
  const p = path.join(OUT, name.replace(/[^\w.-]+/g, '_') + '.wav');
  fs.writeFileSync(p, Buffer.from(b64, 'base64'));
  return path.relative(ROOT, p).replace(/\\/g, '/');
}
function row(name, s, extra = '') {
  const f = (v, w) => String(v).padStart(w);
  console.log(`${name.padEnd(22)} peak ${f(s.peakDb, 7)} dB  rms ${f(s.rmsDb, 7)}  loud ${f(s.loudDb, 7)}  crest ${f(s.crestDb, 6)}  clip ${f(s.clip, 5)}  sil ${f(s.silence, 5)}  cent ${f(s.centroid, 5)}  lr ${f(s.corrLR, 6)} ${extra}`);
}

async function renderTrack(id) {
  return page.evaluate(async ({ id, A }) => {
    const L = await window.__lib.load();
    const t0 = performance.now();
    const track = L.music.TRACKS[id];
    const seconds = A['whole-loop'] ? track.loopBars * 4 * 60 / track.bpm + 2 : A.seconds;
    let buf;
    if (A.realtime || !L.Audio.render) buf = await L.renderRealtime(id, { seconds, rate: A.rate });
    else buf = await L.Audio.render(id, { seconds, sampleRate: A.rate, room: A.room || undefined, dry: !!A.dry });
    const ms = performance.now() - t0;
    return { stats: L.stats(buf, A.skip), ms: Math.round(ms), wav: A.nowav ? null : L.wav(buf) };
  }, { id, A });
}

try {
  if (A.tracks) {
    const all = await page.evaluate(async () => Object.keys((await window.__lib.load()).music.TRACKS));
    const ids = A.tracks === true || A.tracks === 'all' ? all : String(A.tracks).split(',').map((s) => s.trim()).filter(Boolean);
    for (const id of ids) {
      if (!all.includes(id)) { console.log(`${id}: unknown track`); continue; }
      const r = await renderTrack(id);
      r.stats.renderMs = r.ms;
      r.stats.wav = writeWav(id, r.wav);
      results[id] = r.stats;
      row(id, r.stats, `${r.ms} ms`);
    }
  }
  if (A.instruments) {
    const res = await page.evaluate(async (A) => {
      const L = await window.__lib.load();
      const ids = A.instruments === true || A.instruments === 'all' ? Object.keys(L.music.INSTRUMENTS) : String(A.instruments).split(',');
      const out = {};
      for (const id of ids) {
        const inst = L.music.INSTRUMENTS[id];
        if (!inst) { out[id] = { error: 'unknown instrument' }; continue; }
        const [lo, hi] = inst.range || [48, 72];
        const root = Math.max(lo, Math.min(hi - 12, Math.round((lo + hi) / 2 - 6)));
        const dor = [0, 2, 3, 5, 7, 9, 10, 12];
        const pattern = dor.map((d, i) => [i * 4, root + d, 4, 0.8]);
        for (const d of [0, 7, 12, 15]) if (root + d <= hi) pattern.push([32, root + d, 24, 0.7]);
        const track = { bpm: 100, loopBars: 5, gain: 1, room: A.room || inst.room || undefined,
          layers: [{ name: 'probe', inst: id, gain: 0.3, pattern, vowel: inst.vowel ? undefined : undefined }] };
        const secs = 60 / 100 / 4 * 16 * 3.8;
        const t0 = performance.now();
        const buf = L.Audio.render && !A.realtime
          ? await L.Audio.render(track, { seconds: secs, sampleRate: A.rate, dry: !!A.dry })
          : await L.renderRealtime('__probe', { seconds: secs, rate: A.rate, track });
        out[id] = { stats: L.stats(buf, 0.05), ms: Math.round(performance.now() - t0), wav: A.nowav ? null : L.wav(buf) };
      }
      return out;
    }, A);
    for (const [id, r] of Object.entries(res)) {
      if (r.error) { console.log(`${id}: ${r.error}`); continue; }
      r.stats.renderMs = r.ms;
      r.stats.wav = writeWav(id, r.wav);
      results[id] = r.stats;
      row(id, r.stats, `${r.ms} ms`);
    }
  }
  if (A.loudness) {
    const res = await page.evaluate(async (A) => {
      const L = await window.__lib.load();
      const out = {};
      for (const id of Object.keys(L.music.TRACKS)) {
        const buf = await L.Audio.render(id, { seconds: Math.min(A.seconds, 24), sampleRate: 22050, dry: true, normalize: false, volume: L.TABLE_VOLUME });
        out[id] = L.stats(buf, 1).loudDb;
      }
      return out;
    }, A);
    const vals = Object.values(res).filter((v) => v > -150).sort((a, b) => a - b);
    const ref = Number.isFinite(Number(A.reference)) ? Number(A.reference) : vals[Math.floor(vals.length / 2)];
    const lines = Object.entries(res).sort(([a], [b]) => a.localeCompare(b))
      .map(([id, v]) => `  ${/^[a-z_$][\w$]*$/i.test(id) ? id : JSON.stringify(id)}: ${v.toFixed(1)},`);
    const src = `// core/music_loudness.js — measured gated loudness of every track (dB), for per-track normalisation. GENERATED.\n//\n// Written by \`tools/music-render.mjs --loudness\`: each track rendered dry for up to\n// 24 s, loudness gated like BS.1770 (a sparse track is judged by its notes, not\n// its rests). audio.js lifts or trims each track toward REFERENCE (the median)\n// within a capped range, then applies the track's own \`gain\` as the composer's\n// intent. A track missing from the table simply plays unnormalised; re-run the\n// tool after adding tracks.\n\nexport const REFERENCE = ${ref.toFixed(1)};\n\nexport const LOUDNESS = Object.freeze({\n${lines.join('\n')}\n});\n`;
    fs.writeFileSync(path.join(ROOT, 'src/core/music_loudness.js'), src);
    console.log(`wrote src/core/music_loudness.js (${lines.length} tracks, reference ${ref.toFixed(1)} dB)`);
    for (const [id, v] of Object.entries(res)) results[id] = { loudDb: v };
  }
  if (A.script) {
    const code = fs.readFileSync(path.resolve(process.cwd(), A.script), 'utf8');
    const r = await page.evaluate(async ({ code, A }) => {
      const lib = await window.__lib.load();
      const f = new Function('lib', 'A', `return (async () => { ${code}\n })();`);
      return f(lib, A);
    }, { code, A });
    if (r && r.wavs) { for (const [n, b] of Object.entries(r.wavs)) console.log('wrote', writeWav(n, b)); delete r.wavs; }
    console.log(JSON.stringify(r, null, 1));
    results.script = r;
  }
} catch (e) {
  errs.push('harness: ' + String(e.stack || e).split('\n').slice(0, 4).join(' | '));
}
if (A.json) fs.writeFileSync(path.resolve(ROOT, A.json), JSON.stringify({ results, errors: errs }, null, 1));
if (errs.length) console.log('errors:\n  ' + errs.slice(0, 12).join('\n  '));
await browser.close(); releaseSlot(); server.close();
process.exit(errs.some((e) => !e.startsWith('warning')) ? 1 : 0);
