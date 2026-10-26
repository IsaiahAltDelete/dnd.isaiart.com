// tools/score/balance.js — page script for tools/music-render.mjs: each layer's loudness alone, from any bar.
//
//   $NODE tools/music-render.mjs --script tools/score/balance.js --ids inn,inn@17 [--seconds 16]
//
// Like tools/secular/balance.js (each layer rendered solo, dry, unnormalised,
// at its written gain, beside the full mix), but `id@bar` starts the render at
// that bar, by rotating every pattern round the loop, so the second strain of
// a long piece can be measured without rendering the first.
const reqs = String(A.ids || '').split(',').filter(Boolean);
const secs = Math.min(Number(A.seconds) || 16, 30);
const SPB = lib.music.SPB;
const out = {};
function rotated(tr, bar) {
  if (!bar) return tr;
  const total = Math.round(tr.loopBars * SPB), off = (bar - 1) * SPB;
  return { ...tr, layers: tr.layers.map((L) => ({ ...L,
    pattern: L.pattern.map((e) => { const c = e.slice(); c[0] = (((c[0] - off) % total) + total) % total; return c; }) })) };
}
for (const req of reqs) {
  const [id, at] = req.split('@');
  const base = lib.music.TRACKS[id];
  if (!base) { out[req] = 'unknown'; continue; }
  const tr = rotated(base, Number(at) || 0);
  const row = {};
  const mix = await lib.Audio.render(tr, { id, seconds: secs, sampleRate: 22050, dry: true, normalize: false });
  row['(mix)'] = lib.stats(mix, 0.5).loudDb;
  for (const L of tr.layers) {
    const buf = await lib.Audio.render({ ...tr, layers: [L] }, { id: id + '.' + L.name, seconds: secs, sampleRate: 22050, dry: true, normalize: false });
    const s = lib.stats(buf, 0.5);
    row[L.name] = s.loudDb < -150 ? 'silent here' : `${s.loudDb} dB  (${L.inst || 'drums'} @ ${L.gain}, centroid ${s.centroid})`;
  }
  out[req] = row;
}
return out;
