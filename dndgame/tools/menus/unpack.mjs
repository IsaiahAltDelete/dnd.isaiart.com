// tools/menus/unpack.mjs — writes the snapshots a gallery.js run returned as PNGs.
//   $NODE tools/menus/unpack.mjs output/menus/g.json output/menus/before
import fs from 'node:fs';
import path from 'node:path';

const [, , json, dir] = process.argv;
const r = JSON.parse(fs.readFileSync(json, 'utf8'));
fs.mkdirSync(dir, { recursive: true });
for (const s of (r.script && r.script.shots) || []) {
  if (s.err) { console.log('ERR', s.name, s.err.slice(0, 300)); continue; }
  fs.writeFileSync(path.join(dir, s.name + '.png'), Buffer.from(s.url.split(',')[1], 'base64'));
}
console.log('shots:', ((r.script && r.script.shots) || []).map((s) => s.name).join(' '));
console.log('errors:', JSON.stringify(r.errors || []).slice(0, 800));
console.log('drawFails:', JSON.stringify(r.drawFails || []).slice(0, 400));
