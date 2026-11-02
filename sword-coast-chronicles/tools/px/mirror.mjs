// tools/px/mirror.mjs — node 14 on this box has no "type":"module", so a .js
// under src/ is parsed as CommonJS and every `export` is a syntax error. Mirror
// the tree to .mjs (rewriting relative specifiers) so the real source can be
// imported unmodified. Read-only with respect to src/.
import { readdirSync, statSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';

const SRC = process.argv[2];
const DST = process.argv[3];
try { rmSync(DST, { recursive: true, force: true }); } catch { /* first run */ }

function walk(dir, rel = '') {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { walk(p, join(rel, name)); continue; }
    if (!name.endsWith('.js')) continue;
    const out = join(DST, rel, name.replace(/\.js$/, '.mjs'));
    mkdirSync(dirname(out), { recursive: true });
    const src = readFileSync(p, 'utf8')
      .replace(/(['"])(\.{1,2}\/[^'"]+)\.js\1/g, '$1$2.mjs$1')
      // node 14 has no logical-assignment operator; the four data tables use it
      .replace(/\(([^()]+?) \|\|= \[\]\)/g, '($1 || ($1 = []))');
    writeFileSync(out, src);
  }
}
walk(SRC);
console.log('mirrored', SRC, '->', DST);
