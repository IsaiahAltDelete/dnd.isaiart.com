// tools/px/arch-ids.mjs — prove tile ids are append-only: every key a reference
// tree (e.g. main, extracted with `git archive main src tools/px | tar -x -C DIR`)
// defines must have the same id here.
//   node tools/px/arch-ids.mjs <reference-root>
import './shim.mjs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const ref = process.argv[2];
const A = await import('../../src/render/tiles.js');
const B = await import(pathToFileURL(path.resolve(ref, 'src/render/tiles.js')).href);
let bad = 0;
for (const [k, id] of Object.entries(B.T)) {
  if (A.T[k] !== id) { console.log(`MOVED ${k}: ${id} -> ${A.T[k]}`); bad++; }
}
console.log(`reference ${Object.keys(B.T).length} keys, here ${Object.keys(A.T).length}; moved or missing: ${bad}`);
process.exit(bad ? 1 : 0);
