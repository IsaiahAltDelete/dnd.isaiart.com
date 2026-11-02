// tools/lightgallery-sheet.mjs — writes the PNGs a tools/lightgallery.js run returned inside shot.mjs's JSON report.
//
//   $NODE tools/lightgallery-sheet.mjs output/lighting/g.json output/lighting/after
//   -> output/lighting/after.png (the contact sheet) and after-<view>.png per view
import fs from 'node:fs';
import path from 'node:path';

const [src, prefix] = process.argv.slice(2);
if (!src || !prefix) { console.error('usage: lightgallery-sheet.mjs <report.json> <out-prefix>'); process.exit(2); }
const rep = JSON.parse(fs.readFileSync(src, 'utf8'));
const res = rep.script;
if (!res || !res.sheet) { console.error('no gallery in', src, JSON.stringify(rep.errors || []).slice(0, 400)); process.exit(1); }
const put = (file, url) => fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
fs.mkdirSync(path.dirname(path.resolve(prefix)), { recursive: true });
put(`${prefix}.png`, res.sheet);
for (const e of res.each || []) put(`${prefix}-${e.name}.png`, e.url);
console.log(JSON.stringify({ views: res.views, errors: rep.errors, drawFails: rep.drawFails }, null, 1));
