// tools/score/relevel.mjs — re-measure the loudness of a few tracks and patch them into core/music_loudness.js.
//
//   $NODE tools/score/relevel.mjs town,inn,battle
//
// `tools/music-render.mjs --loudness` renders every track to rewrite the
// table; after revising three of them that is minutes of a shared laptop's
// time for three numbers. This measures only the named tracks, exactly as the
// full pass does (dry, unnormalised, 22.05 kHz, 20 s, gated), and keeps
// REFERENCE and every other entry as they were.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ids = String(process.argv[2] || '').split(',').filter(Boolean);
if (!ids.length) { console.log('usage: relevel.mjs id,id,...'); process.exit(1); }
const probe = path.join(ROOT, 'output/score-relevel.js');
const json = 'output/score-relevel.json';
fs.mkdirSync(path.dirname(probe), { recursive: true });
fs.writeFileSync(probe, `const out = {};
for (const id of ${JSON.stringify(ids)}) {
  if (!lib.music.TRACKS[id]) { out[id] = null; continue; }
  const buf = await lib.Audio.render(id, { seconds: 20, sampleRate: 22050, dry: true, normalize: false, volume: lib.TABLE_VOLUME });
  out[id] = lib.stats(buf, 1).loudDb;
}
return { loud: out };`);
execFileSync(process.execPath, [path.join(ROOT, 'tools/music-render.mjs'), '--script', probe, '--json', json], { cwd: ROOT, stdio: 'inherit' });
const loud = JSON.parse(fs.readFileSync(path.join(ROOT, json), 'utf8')).results.script.loud;
const file = path.join(ROOT, 'src/core/music_loudness.js');
const src = fs.readFileSync(file, 'utf8');
const m = /export const LOUDNESS = Object\.freeze\(\{\n([\s\S]*?)\n\}\);/.exec(src);
const table = new Map(m[1].split('\n').map((l) => /^\s*"?([\w$-]+)"?: (-?[\d.]+),/.exec(l)).filter(Boolean).map((r) => [r[1], Number(r[2])]));
for (const [id, v] of Object.entries(loud)) {
  if (v == null || v < -150) { console.log(`${id}: no measurement`); continue; }
  console.log(`${id}: ${table.has(id) ? table.get(id).toFixed(1) : '(new)'} -> ${v.toFixed(1)}`);
  table.set(id, v);
}
const lines = [...table].sort(([a], [b]) => a.localeCompare(b))
  .map(([id, v]) => `  ${/^[a-z_$][\w$]*$/i.test(id) ? id : JSON.stringify(id)}: ${v.toFixed(1)},`);
fs.writeFileSync(file, src.replace(m[0], `export const LOUDNESS = Object.freeze({\n${lines.join('\n')}\n});`));
