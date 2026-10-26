// tools/pxbuild.mjs — compile every PixelForge source (assets/pixel/**/*.pxa) into a game module.
//
//   NODE=node   # any Node 18+
//   $NODE tools/pxbuild.mjs                 # build all; writes only modules whose bytes changed
//   $NODE tools/pxbuild.mjs --check         # exit 1 if any module is stale or orphaned (writes nothing)
//   $NODE tools/pxbuild.mjs assets/pixel/vfx/impact-burst.pxa   # just these sources
//   $NODE tools/pxbuild.mjs --lint          # also lint each source (--strict: findings fail the build)
//
// Each NAME.pxa becomes src/render/art/<@name>.js (or wherever its @export says),
// a module that registers the sprite with render/sprites.js on import — so the
// code that draws it imports it:  import '../render/art/fx-torch-flame.js';
// No index is generated on purpose: two agents adding art would both edit it.
//
// The compiler is pixelforge/files/pxforge.py (one Python process for the whole
// batch), so the .pxa format has exactly one implementation. This script owns
// what Python cannot check: it re-derives every @ramp with the REAL
// src/render/palette.js ramp() and refuses to write if the Python port ever
// disagrees, removes generated modules whose source is gone, and re-stamps the
// import map when anything changed. Output is deterministic, so a clean tree
// rebuilds to identical bytes and `--check` is a reliable gate.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = path.join(ROOT, 'assets', 'pixel');
const ART_DIR = path.join(ROOT, 'src', 'render', 'art');
const PXFORGE = path.join(ROOT, 'pixelforge', 'files', 'pxforge.py');
const MARK = 'by tools/pxbuild.mjs; edit the .pxa';

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const CHECK = flag('--check'), LINT = flag('--lint') || flag('--strict'), STRICT = flag('--strict');
const only = args.filter((a) => !a.startsWith('--')).map((a) => path.resolve(process.cwd(), a));

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir).sort()) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.pxa')) out.push(p);
  }
  return out;
}

/** The first Python that can run pxforge: $PYTHON, the bundled runtime, then PATH. */
function python() {
  const bundled = 'C:/Users/Dizzy/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';
  const cands = [process.env.PYTHON, fs.existsSync(bundled) ? bundled : null, 'python3', 'python', 'py'].filter(Boolean);
  for (const exe of cands) {
    const r = spawnSync(exe, ['-c', 'import sys; sys.exit(0 if sys.version_info >= (3, 6) else 1)'], { encoding: 'utf8' });
    if (r.status === 0) return exe;
  }
  console.error('pxbuild: no Python 3 found (set PYTHON=...)');
  process.exit(2);
}

const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const sources = only.length ? only : walk(SRC_DIR);
if (!sources.length) { console.log('pxbuild: no .pxa sources'); process.exit(0); }

const PY = python();
const run = spawnSync(PY, [PXFORGE, 'export', '--manifest', '-', '--root', ROOT], {
  input: JSON.stringify(sources.map((src) => ({ src }))), encoding: 'utf8', maxBuffer: 64 << 20,
  env: { ...process.env, PXFORGE_PALETTE_JS: path.join(ROOT, 'src', 'render', 'palette.js') },
});
if (run.status !== 0) { console.error('pxbuild: pxforge export failed\n' + run.stderr); process.exit(2); }
const results = JSON.parse(run.stdout);

// --- cross-check every ramp against the game's own palette.js ----------------
const { ramp, RAMPS } = await import(pathToFileURL(path.join(ROOT, 'src', 'render', 'palette.js')).href);
const same = (a, b) => a.length === b.length && a.every((v, i) => v.toLowerCase() === b[i].toLowerCase());
let failed = 0;
const fail = (src, msg) => { failed++; console.error(`pxbuild: ${rel(src)}: ${msg}`); };
for (const r of results) {
  if (r.error) { fail(r.src, r.error); continue; }
  for (const rp of r.ramps) {
    if (!rp.base.startsWith('#')) continue;
    const js = ramp(rp.base, rp.n, rp.opts);
    if (!same(js, rp.colors)) fail(r.src, `@ramp ${rp.name}: Python ${rp.colors.join(' ')} != palette.js ${js.join(' ')}`);
  }
  for (const [name, cols] of Object.entries(r.gameRamps)) {
    if (!RAMPS[name]) fail(r.src, `RAMPS.${name} does not exist in palette.js`);
    else if (!same(RAMPS[name], cols)) fail(r.src, `RAMPS.${name}: Python ${cols.join(' ')} != palette.js ${RAMPS[name].join(' ')}`);
  }
  for (const w of r.warnings || []) console.warn(`pxbuild: ${rel(r.src)}: warning: ${w}`);
}

// One registry: two sources may not claim the same sprite id or output file.
const byId = new Map(), byOut = new Map();
for (const r of results.filter((x) => !x.error)) {
  if (r.kind === 'sprite' && byId.has(r.id)) fail(r.src, `sprite id '${r.id}' is also ${rel(byId.get(r.id))}`);
  if (byOut.has(r.out)) fail(r.src, `output ${r.out} is also written by ${rel(byOut.get(r.out))}`);
  byId.set(r.id, r.src); byOut.set(r.out, r.src);
}
if (failed) { console.error(`pxbuild: ${failed} problem(s); nothing written`); process.exit(1); }

// --- write (or check) ---------------------------------------------------------
let changed = 0, stale = 0;
for (const r of results) {
  const out = path.join(ROOT, r.out);
  const old = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : null;
  if (old === r.text) continue;
  if (CHECK) { stale++; console.error(`pxbuild: stale ${r.out} (from ${rel(r.src)})`); continue; }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, r.text);
  changed++;
  console.log(`pxbuild: wrote ${r.out}  (${r.id}: ${r.frames.length} frame${r.frames.length === 1 ? '' : 's'}${r.variants.length ? ', ' + r.variants.length + ' recolours' : ''})`);
}

// A generated module whose source was deleted or renamed would linger forever.
if (!only.length && fs.existsSync(ART_DIR)) {
  const made = new Set(results.map((r) => path.join(ROOT, r.out)));
  for (const name of fs.readdirSync(ART_DIR).sort()) {
    const p = path.join(ART_DIR, name);
    if (!name.endsWith('.js') || made.has(p)) continue;
    if (!fs.readFileSync(p, 'utf8').split('\n', 1)[0].includes(MARK)) continue;
    if (CHECK) { stale++; console.error(`pxbuild: orphaned ${rel(p)} (no .pxa builds it)`); continue; }
    fs.unlinkSync(p); changed++;
    console.log(`pxbuild: removed ${rel(p)} (its source is gone)`);
  }
}

if (LINT) {
  const lint = spawnSync(PY, [PXFORGE, 'lint', ...sources.map(rel), ...(STRICT ? ['--strict'] : [])],
    { encoding: 'utf8', cwd: ROOT });
  process.stdout.write(lint.stdout);
  if (lint.status !== 0) { console.error('pxbuild: lint --strict failed'); process.exit(1); }
}

if (CHECK) {
  if (stale) { console.error(`pxbuild: ${stale} module(s) out of date — run: node tools/pxbuild.mjs`); process.exit(1); }
  console.log(`pxbuild: ${results.length} module(s) up to date`);
  process.exit(0);
}
if (changed) {
  const st = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'stamp.mjs')], { encoding: 'utf8' });
  process.stdout.write(st.stdout);
}
console.log(`pxbuild: ${results.length} source(s), ${changed} module(s) changed`);
