// tools/sacred/probe.js — page-side half of render.mjs: renders tracks offline through the real audio engine.
//
// Not run directly: render.mjs prepends `const JOBS = [...]` and hands the file
// to tools/shot.mjs --script. Each job goes through Audio.render(), the engine's
// own offline path — same instruments, room, mastering and loudness
// normalisation the player hears, in a context of its own. A job that starts
// at a bar renders a copy of the track rotated so that bar comes first, under
// the real id so the loudness table still applies.

/* global JOBS */
const { Audio, gatedLoudness, TABLE_VOLUME } = await import('/src/core/audio.js');
const { TRACKS } = await import('/src/core/music.js');

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}

function measure(buf) {
  const L = buf.getChannelData(0), R = buf.getChannelData(1), sr = buf.sampleRate, n = L.length;
  let peak = 0, sum = 0, clips = 0, nan = 0;
  for (let i = 0; i < n; i++) {
    const a = L[i], b = R[i];
    if (!Number.isFinite(a) || !Number.isFinite(b)) { nan++; continue; }
    const m = Math.max(Math.abs(a), Math.abs(b));
    if (m > peak) peak = m;
    if (m >= 0.999) clips++;
    sum += a * a + b * b;
  }
  const db = (x) => (x > 0 ? 20 * Math.log10(x) : -200);
  const rms = Math.sqrt(sum / (2 * n));
  // 100 ms windows: the longest near-silent stretch (after the first second)
  // and the loudness spread, which says whether the piece breathes.
  const W = Math.floor(sr / 10), wins = [];
  for (let s = 0; s + W <= n; s += W) {
    let e = 0;
    for (let i = s; i < s + W; i++) e += L[i] * L[i] + R[i] * R[i];
    wins.push(db(Math.sqrt(e / (2 * W))));
  }
  let run = 0, silentMax = 0;
  wins.forEach((w, i) => { if (i < 10) return; run = w < -50 ? run + 1 : 0; silentMax = Math.max(silentMax, run); });
  const sorted = [...wins.slice(10)].sort((a, b) => a - b);
  const pct = (p) => sorted.length ? sorted[Math.floor(p * (sorted.length - 1))] : -200;
  // Average power spectrum over frames spread across the render.
  const N = 4096, frames = 24, spec = new Float64Array(N / 2);
  for (let f = 0; f < frames; f++) {
    const s0 = Math.floor((n - N) * (f + 0.5) / frames);
    if (s0 < 0) break;
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = (L[s0 + i] + R[s0 + i]) * 0.5 * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
    fft(re, im);
    for (let k = 0; k < N / 2; k++) spec[k] += re[k] * re[k] + im[k] * im[k];
  }
  let tot = 0, cen = 0;
  const bands = { sub: 0, low: 0, mid: 0, pres: 0, air: 0 };
  for (let k = 1; k < N / 2; k++) {
    const hz = k * sr / N, p = spec[k];
    tot += p; cen += p * hz;
    if (hz < 120) bands.sub += p; else if (hz < 500) bands.low += p; else if (hz < 2000) bands.mid += p;
    else if (hz < 5000) bands.pres += p; else bands.air += p;
  }
  for (const k in bands) bands[k] = +(100 * bands[k] / (tot || 1)).toFixed(1);
  return {
    peakDb: +db(peak).toFixed(2), rmsDb: +db(rms).toFixed(2), crest: +(db(peak) - db(rms)).toFixed(1),
    clips, nan, silentMaxSec: silentMax / 10, loud95: +pct(0.95).toFixed(1), quiet10: +pct(0.1).toFixed(1),
    centroidHz: Math.round(cen / (tot || 1)), bands,
  };
}

function wav(buf) {
  const ch = 2, n = buf.length, sr = buf.sampleRate;
  const out = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const str = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); out.setUint32(4, 36 + n * ch * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true);
  out.setUint32(24, sr, true); out.setUint32(28, sr * ch * 2, true); out.setUint16(32, ch * 2, true);
  out.setUint16(34, 16, true); str(36, 'data'); out.setUint32(40, n * ch * 2, true);
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  for (let i = 0, o = 44; i < n; i++, o += 4) {
    out.setInt16(o, Math.max(-1, Math.min(1, L[i] || 0)) * 32767, true);
    out.setInt16(o + 2, Math.max(-1, Math.min(1, R[i] || 0)) * 32767, true);
  }
  const bytes = new Uint8Array(out.buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

const results = [];
for (const job of JOBS) {
  const t0 = performance.now();
  try {
    const track = TRACKS[job.id];
    if (!track) { results.push({ id: job.id, error: 'no such track' }); continue; }
    if (job.loud) {
      // Exactly the measurement tools/music-render.mjs --loudness makes for the table.
      const b = await Audio.render(job.id, { seconds: Math.min(job.secs, 24), sampleRate: 22050, dry: true, normalize: false, volume: TABLE_VOLUME });
      results.push({ id: job.id, loudDb: +gatedLoudness(b, 1).toFixed(1), ms: Math.round(performance.now() - t0) });
      continue;
    }
    const from = Math.round((job.bar || 0) * 16), total = track.loopBars * 16;
    const what = !from ? job.id : {
      ...track,
      layers: track.layers.map((L) => ({ ...L, pattern: L.pattern.map(([s, ...rest]) => [((s - from) % total + total) % total, ...rest]) })),
    };
    const buf = await Audio.render(what, { id: job.id, seconds: job.secs, sampleRate: job.rate, loop: job.loop ?? true, volume: 0.7 * 0.55 });
    const m = measure(buf);
    results.push({ id: job.id, bar: job.bar || 0, secs: job.secs, rate: job.rate, ms: Math.round(performance.now() - t0), ...m, wav: job.wav ? wav(buf) : null });
  } catch (e) {
    results.push({ id: job.id, error: String(e && e.stack || e).slice(0, 600) });
  }
}
return results;
