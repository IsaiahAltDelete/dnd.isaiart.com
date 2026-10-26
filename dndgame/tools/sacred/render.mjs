// tools/sacred/render.mjs — offline renders of music tracks to WAV, with loudness and spectrum measurements.
//
//   $NODE tools/sacred/render.mjs                       # every track in the sacred book, 24 s each
//   $NODE tools/sacred/render.mjs dawnOrganum@20 temple  # id@bar starts the render at that bar
//   $NODE tools/sacred/render.mjs --secs 12 --nowav dawnOrganum
//   $NODE tools/sacred/render.mjs --loudness            # gated loudness exactly as core/music_loudness.js is measured
//
// Runs tools/shot.mjs --scenario none --script <probe> (one browser, taken from
// the machine-wide slot lock), four tracks per browser run so a batch never
// holds a huge payload. WAVs land in output/music/sacred/<id>[@bar].wav. The
// numbers: peak and RMS in dBFS, crest (peak minus RMS), clipped samples, the
// longest near-silent stretch, the 95th/10th percentile window loudness, the
// spectral centroid and the share of energy per band (sub <120 Hz, low <500,
// mid <2k, presence <5k, air above).

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'output/music/sacred');
fs.mkdirSync(OUT, { recursive: true });

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const secs = Number(opt('secs', 24)), rate = Number(opt('rate', 32000));
const loud = argv.includes('--loudness');
const wav = !argv.includes('--nowav') && !loud;
const skip = new Set();
argv.forEach((a, i) => { if (a === '--secs' || a === '--rate') skip.add(i + 1); });
let ids = argv.filter((a, i) => !a.startsWith('--') && !skip.has(i));
if (!ids.length) {
  const { build } = await import('../../src/core/music_sacred.js');
  const h = await import('../../src/core/music.js');
  ids = Object.keys(build(h).tracks);
}
const jobs = ids.map((s) => { const [id, bar] = s.split('@'); return { id, bar: bar ? Number(bar) : 0, secs, rate, wav, loud }; });

const probe = fs.readFileSync(path.join(ROOT, 'tools/sacred/probe.js'), 'utf8');
const rows = [];
for (let i = 0; i < jobs.length; i += 4) {
  const batch = jobs.slice(i, i + 4);
  const script = path.join(OUT, '_probe.js');
  fs.writeFileSync(script, `const JOBS = ${JSON.stringify(batch)};\n${probe}`);
  const r = spawnSync(process.execPath, ['tools/shot.mjs', '--scenario', 'none', '--wait', '0', '--script', script,
    '--out', path.join(OUT, '_probe.png')], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.status !== 0 && r.status !== 1) { console.error(r.stdout, r.stderr); process.exit(2); }
  const rep = JSON.parse(fs.readFileSync(path.join(OUT, '_probe.json'), 'utf8'));
  if (rep.errors && rep.errors.length) console.log('page errors:', rep.errors.slice(0, 5));
  for (const res of rep.script || []) {
    if (res.error) { console.log(`${res.id}: ERROR ${res.error}`); rows.push(res); continue; }
    if (loud) { console.log(`  ${res.id}: ${res.loudDb.toFixed(1)},`); rows.push(res); continue; }
    if (res.wav) {
      const name = `${res.id}${res.bar ? '@' + res.bar : ''}.wav`;
      fs.writeFileSync(path.join(OUT, name), Buffer.from(res.wav, 'base64'));
      res.file = path.relative(ROOT, path.join(OUT, name)).replace(/\\/g, '/');
      delete res.wav;
    }
    rows.push(res);
    const b = res.bands;
    console.log(`${(res.id + (res.bar ? '@' + res.bar : '')).padEnd(24)} peak ${String(res.peakDb).padStart(6)}  rms ${String(res.rmsDb).padStart(6)}  crest ${String(res.crest).padStart(4)}  clips ${res.clips}  nan ${res.nan}  silent ${res.silentMaxSec}s  ` +
      `win95 ${res.loud95} win10 ${res.quiet10}  centroid ${res.centroidHz}Hz  sub/low/mid/pres/air ${b.sub}/${b.low}/${b.mid}/${b.pres}/${b.air}  (${res.ms} ms)`);
  }
  fs.rmSync(path.join(OUT, '_probe.json'), { force: true });
}
fs.writeFileSync(path.join(OUT, 'metrics.json'), JSON.stringify(rows, null, 1));
