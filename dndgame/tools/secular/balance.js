// tools/secular/balance.js — page script for tools/music-render.mjs: how loud each layer of a track is on its own.
//
//   $NODE tools/music-render.mjs --script tools/secular/balance.js --ids elfsongTourdion,yawningPortalRota [--seconds 12]
//
// Each layer is rendered solo, dry and unnormalised, at its written gain, and
// its gated loudness reported beside the full mix's, so a composer can see which
// part leads and which is buried without hearing any of it.
const ids = String(A.ids || '').split(',').filter(Boolean);
const secs = Math.min(Number(A.seconds) || 12, 30);
const out = {};
for (const id of ids) {
  const tr = lib.music.TRACKS[id];
  if (!tr) { out[id] = 'unknown'; continue; }
  const row = {};
  const mix = await lib.Audio.render(tr, { id, seconds: secs, sampleRate: 22050, dry: true, normalize: false });
  row['(mix)'] = lib.stats(mix, 0.5).loudDb;
  for (const L of tr.layers) {
    const solo = { ...tr, layers: [L] };
    const buf = await lib.Audio.render(solo, { id: id + '.' + L.name, seconds: secs, sampleRate: 22050, dry: true, normalize: false });
    const s = lib.stats(buf, 0.5);
    row[L.name] = `${s.loudDb} dB  (${L.inst || 'drums'} @ ${L.gain}, centroid ${s.centroid})`;
  }
  out[id] = row;
}
return out;
