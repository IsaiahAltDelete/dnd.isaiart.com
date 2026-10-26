/**
 * stamp.mjs — pin every module URL to its own content hash.
 *
 * The problem this solves: the game is 63 ES modules that import each other by
 * relative path. A relative import does NOT inherit the query string of the
 * module doing the importing, so putting `?v=` on the entry point busts exactly
 * one file and leaves the other 62 to the browser's discretion. After a deploy a
 * browser can therefore end up running a *mixed* graph — some modules from the
 * new build, some from the old — which fails in ways that look like the deploy
 * never happened.
 *
 * The fix is an import map. Import maps are consulted at every import site,
 * static and dynamic, and they live in index.html — which GitHub Pages serves
 * with a short max-age, so it is the one file that is reliably fresh. Give it a
 * map from each module's path to that same path plus a hash of its contents and
 * the whole graph turns over the moment any part of it changes:
 *
 *     "./src/rules/combat.js": "./src/rules/combat.js?v=1f4c9ab2"
 *
 * A module whose own bytes did not change keeps its URL and stays cached, but
 * its imports are re-resolved through the fresh map, so it picks up new versions
 * of everything it depends on. Keys are written relative to the document, so the
 * same map works at isaiart.com/dndgame/, at a domain root, and on localhost.
 *
 * Browsers without import map support ignore the block and load unversioned
 * URLs — exactly the behaviour we had before, so nothing gets worse.
 *
 * Run it after changing anything under src/:
 *
 *     node dndgame/tools/stamp.mjs            # rewrite index.html
 *     node dndgame/tools/stamp.mjs --check    # exit 1 if it is out of date
 *
 * Forgetting to run it is not a hazard: the stale entry keeps its old URL, which
 * is just the pre-import-map behaviour for that one file.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML = join(ROOT, 'index.html');
const OPEN = '<!-- importmap:start -->';
const CLOSE = '<!-- importmap:end -->';

/** Every .js under src/, depth-first, sorted so the output is stable. */
function walk(dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

const files = walk(join(ROOT, 'src'));
const imports = {};
for (const abs of files) {
  const rel = './' + relative(ROOT, abs).split(/[\\/]/).join('/');
  const hash = createHash('sha256').update(readFileSync(abs)).digest('hex').slice(0, 8);
  imports[rel] = `${rel}?v=${hash}`;
}

// Two-space indent inside the <script>, matching the rest of the document.
const json = JSON.stringify({ imports }, null, 2).split('\n').map((l) => '    ' + l).join('\n');
const block = [
  OPEN,
  '  <script type="importmap">',
  json,
  '  </script>',
  '  ' + CLOSE,
].join('\n');

const html = readFileSync(HTML, 'utf8');
const a = html.indexOf(OPEN);
const b = html.indexOf(CLOSE);
if (a < 0 || b < 0) {
  console.error(`stamp: ${HTML} is missing the ${OPEN} / ${CLOSE} markers.`);
  process.exit(2);
}
const next = html.slice(0, a) + block + html.slice(b + CLOSE.length);

if (process.argv.includes('--check')) {
  if (next !== html) {
    console.error(`stamp: index.html is out of date — run: node dndgame/tools/stamp.mjs`);
    process.exit(1);
  }
  console.log(`stamp: index.html is up to date (${files.length} modules).`);
  process.exit(0);
}

if (next === html) console.log(`stamp: no change (${files.length} modules).`);
else { writeFileSync(HTML, next); console.log(`stamp: stamped ${files.length} modules into index.html`); }
