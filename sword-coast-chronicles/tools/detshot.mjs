// tools/detshot.mjs — deterministic before/after captures of the same seeded game state, with pixel diffs.
//
// shot.mjs photographs a live game, so two runs never agree to the pixel: the
// clock, the frame count and every seed derived from Date.now() differ. This
// harness replaces the page's clocks and requestAnimationFrame before any game
// code runs, drives the loop itself at a fixed 1/60 s, stages each case with
// the same steps in every tree, and grabs the display canvas. Serve two trees
// (say, main extracted with `git archive` and your worktree) and it diffs them:
// a tree whose canvas is 400x240 is compared against an 800x480 one by blowing
// it up 2x nearest-neighbour, so "identical" means identical on screen.
//
//   NODE=node   # any Node 18+
//   git archive main -o output/base.tar && mkdir -p output/base && tar -xf output/base.tar -C output/base
//   $NODE tools/detshot.mjs --roots base=output/base,new=. --cases town-noon,town-night,fight --out output/det
//   $NODE tools/detshot.mjs --roots "strict=.@SC.Stage.passThrough=false,new=." --out output/det-pt
//
// `--init "<js>"` (or `name=dir@<js>` per tree) runs in the page before staging.
// Every case is captured twice: `full`, and `world` with every drawUI/drawOver
// silenced, so a change to the interface never hides a change to the world.
// Writes <case>.<root>[.world].png, <case>.diff[.world].png (differences in red
// over a dimmed copy) and report.json: differing pixels, their bounding box, the
// largest channel delta, and each tree's median _draw() time over 60 frames.
//
// Cases: title charcreate town-noon town-night town-rain town-night-rain dungeon
//        fight inventory dialogue shop options (default: all)

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadChromium, browserCandidates } from './pwlocate.mjs';
import { acquireBrowserSlot } from './browserlock.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const A = { roots: 'new=.', cases: '', out: 'output/det', steps: 40, class: 'fighter' };
for (let i = 2; i < process.argv.length; i++) {
  const k = process.argv[i];
  if (!k.startsWith('--')) continue;
  const v = process.argv[i + 1];
  if (v === undefined || v.startsWith('--')) { A[k.slice(2)] = true; continue; }
  A[k.slice(2)] = v; i++;
}
const ALL = ['title', 'charcreate', 'town-noon', 'town-night', 'town-rain', 'town-night-rain',
  'dungeon', 'fight', 'inventory', 'dialogue', 'shop', 'options'];
const CASES = A.cases ? String(A.cases).split(',').map((s) => s.trim()).filter(Boolean) : ALL;
const ROOTS = String(A.roots).split(',').map((s) => {
  const [name, rest] = s.includes('=') ? s.split(/=(.*)/s) : ['new', s];
  const [dir, init] = rest.split('@');
  return { name, dir: path.resolve(ROOT, dir), init: init || '' };
});
const OUT = path.resolve(ROOT, A.out);
fs.mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------- one server per tree
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.png': 'image/png', '.css': 'text/css' };
async function serve(dir) {
  const server = http.createServer((req, res) => {
    try {
      const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      let f = path.join(dir, u === '/' ? 'index.html' : u);
      if (!f.startsWith(dir)) { res.writeHead(403); res.end(); return; }
      if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(f).pipe(res);
    } catch (e) { res.writeHead(500); res.end(String(e)); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

// ---------------------------------------------------------------- the fake clock
// Installed before any module loads. Time only moves when __step() says so.
function installClock() {
  const realNow = performance.now.bind(performance);
  let t = 100000;
  const q = [];
  performance.now = () => t;
  Date.now = () => 1790000000000 + Math.floor(t);
  window.requestAnimationFrame = (cb) => { q.push(cb); return q.length; };
  window.cancelAnimationFrame = () => {};
  window.__step = (n = 1) => {
    for (let i = 0; i < n; i++) {
      t += 1000 / 60;
      const cbs = q.splice(0);
      for (const cb of cbs) cb(t);
    }
  };
  // Median real ms of one Game._draw(), with the real clock back for the
  // stage's own timers, over n frames.
  window.__measure = (n = 60) => {
    const G = window.SC.Game, times = [];
    performance.now = realNow;
    try {
      for (let i = 0; i < n; i++) { const a = realNow(); G._draw(); times.push(realNow() - a); }
    } finally { performance.now = () => t; }
    times.sort((a, b) => a - b);
    const st = window.SC.Stage;
    return { drawMs: +times[n >> 1].toFixed(3), p90: +times[Math.floor(n * 0.9)].toFixed(3),
      compositeMs: st ? +st.compositeMs.toFixed(3) : null };
  };
}

// ---------------------------------------------------------------- staging (runs in the page)
async function stage(A) {
  const { Game } = window.SC;
  // --init "<js>": run in the page before staging (a setting, a Stage switch).
  if (A.init) (0, eval)(A.init);
  const tick = () => new Promise((r) => setTimeout(r, 0));
  // Step one frame at a time, letting async work (module imports, map loads)
  // settle between frames, until `fn` holds.
  const until = async (fn, max = 1200) => {
    for (let i = 0; i < max; i++) { if (fn()) return true; await tick(); await tick(); window.__step(1); }
    return !!fn();
  };
  const settle = async (n) => { for (let i = 0; i < n; i++) { await tick(); window.__step(1); } };
  const ow = () => Game.scenes.find((s) => s.id === 'overworld');
  const hero = async () => {
    window.SC.newGame();
    await until(() => Game.top && Game.top.randomiseAll);
    const s = Game.top;
    s.randomiseAll(); s.setClass(A.class); s.draft.name = 'Tester';
    if (s._autoFillPicks) s._autoFillPicks();
    s.finish();
    await until(() => ow() && ow().map && Game.top === ow() && !Game.transitioning);
  };
  const go = async (mapId) => {
    const { travelTo } = await import('/src/world/overworld.js');
    travelTo(mapId, undefined, undefined, 'down');
    await until(() => ow() && ow().map && ow().map.id === mapId && !Game.transitioning);
  };
  const hour = (h) => { if (Game.state) Game.state.time = h * 60; };
  const c = A.case;
  if (c === 'title') { await settle(A.steps); return 'title'; }
  if (c === 'charcreate') { window.SC.newGame(); await until(() => Game.top && Game.top.randomiseAll); await settle(A.steps); return Game.top.id; }
  await hero();
  if (c.startsWith('town')) {
    hour(/night/.test(c) ? 22 : 12);
    if (/rain/.test(c)) window.SC.FX.weather('rain', 0.8);
  } else if (c === 'dungeon') { await go('undermountain'); }
  else if (c === 'fight') {
    await window.SC.cheat.fight('goblin', 3);
    await until(() => Game.top && Game.top.id === 'battle' && !Game.transitioning);
    await settle(80);
  } else if (c === 'inventory' || c === 'options') {
    const m = await import('/src/ui/menus.js');
    Game.push(new m[c === 'inventory' ? 'InventoryScene' : 'OptionsScene']());
  } else if (c === 'shop') {
    const m = await import('/src/ui/shop.js');
    Game.push(new m.ShopScene('barthens-provisions'));
  } else if (c === 'dialogue') {
    const s = ow();
    const n = s.entities.list.find((e) => e.kind === 'npc' && !e.hidden);
    if (n) { s.player.setTile(n.x, n.y + 1, 'up'); await settle(2); if (s._interact) s._interact(); else if (s.interact) s.interact(); }
  }
  await settle(A.steps);
  return Game.scenes.map((s) => s.id || s.constructor.name).join('>');
}

/** Silence every interface hook (for the `world` capture), then draw one frame. */
function worldOnly() {
  for (const s of window.SC.Game.scenes) {
    if (s.uiLayer) { s.draw = null; }
    s.drawUI = null; s.drawOver = null;
  }
  window.__step(1);
}

const grab = () => document.getElementById('game').toDataURL('image/png');

// ---------------------------------------------------------------- diff (runs in a blank page)
async function diff({ a, b }) {
  const load = (src) => new Promise((r, j) => { const im = new Image(); im.onload = () => r(im); im.onerror = j; im.src = src; });
  const [ia, ib] = await Promise.all([load(a), load(b)]);
  const W = Math.max(ia.width, ib.width), H = Math.max(ia.height, ib.height);
  const px = (im) => {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(im, 0, 0, W, H);
    return g.getImageData(0, 0, W, H);
  };
  const da = px(ia), db = px(ib);
  const out = new ImageData(W, H);
  let n = 0, max = 0, x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let i = 0; i < da.data.length; i += 4) {
    const d = Math.max(Math.abs(da.data[i] - db.data[i]), Math.abs(da.data[i + 1] - db.data[i + 1]), Math.abs(da.data[i + 2] - db.data[i + 2]));
    const p = i >> 2, x = p % W, y = (p / W) | 0;
    if (d > 0) {
      n++; if (d > max) max = d;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      out.data[i] = 255; out.data[i + 1] = 40; out.data[i + 2] = 40;
    } else {
      out.data[i] = db.data[i] * 0.3; out.data[i + 1] = db.data[i + 1] * 0.3; out.data[i + 2] = db.data[i + 2] * 0.3;
    }
    out.data[i + 3] = 255;
  }
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  c.getContext('2d').putImageData(out, 0, 0);
  return { pixels: n, share: +(n / (W * H)).toFixed(5), maxDelta: max, box: n ? [x0, y0, x1, y1] : null, png: c.toDataURL('image/png') };
}

// ---------------------------------------------------------------- run
const chromium = await loadChromium();
const release = await acquireBrowserSlot();
const CANDIDATES = browserCandidates();
let browser = null;
for (const exe of [undefined, ...CANDIDATES]) {
  try { browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] }); break; } catch (e) { /* next */ }
}
if (!browser) { console.error('no launchable browser'); release(); process.exit(2); }

const servers = [];
const report = { cases: {} };
const save = (file, url) => fs.writeFileSync(path.join(OUT, file), Buffer.from(url.split(',')[1], 'base64'));
let failed = false;
try {
  for (const r of ROOTS) { const s = await serve(r.dir); servers.push(s.server); r.base = s.base; }
  for (const c of CASES) {
    const rec = report.cases[c] = {};
    const shots = {};
    for (const r of ROOTS) {
      const page = await browser.newPage({ viewport: { width: 800, height: 480 } });
      const errs = [];
      page.on('pageerror', (e) => errs.push(String(e).slice(0, 300)));
      page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
      await page.addInitScript(installClock);
      await page.goto(`${r.base}/index.html`, { waitUntil: 'load', timeout: 60000 });
      // Boot runs on promises and timers, not frames; wait for it in real time.
      await page.waitForFunction(() => window.SC && window.SC.Game && window.SC.Game.scenes.length > 0, null, { timeout: 60000, polling: 100 });
      await page.evaluate(() => { document.querySelector('#gate')?.classList.remove('show'); try { window.SC.Audio.muted = true; } catch (e) {} });
      const stack = await page.evaluate(stage, { case: c, steps: +A.steps, class: A.class, init: r.init || A.init || '' });
      const timing = await page.evaluate(() => window.__measure(60));
      await page.evaluate(() => window.__step(1));
      shots.full = shots.full || {}; shots.world = shots.world || {};
      shots.full[r.name] = await page.evaluate(grab);
      await page.evaluate(worldOnly);
      shots.world[r.name] = await page.evaluate(grab);
      const fails = await page.evaluate(() => [...(window.SC.Game._drawFails || [])]);
      rec[r.name] = { stack, timing, errors: errs, drawFails: fails };
      if (errs.length || fails.length) failed = true;
      save(`${c}.${r.name}.png`, shots.full[r.name]);
      save(`${c}.${r.name}.world.png`, shots.world[r.name]);
      await page.close();
    }
    if (ROOTS.length > 1) {
      const [ra, rb] = ROOTS;
      const page = await browser.newPage();
      for (const kind of ['full', 'world']) {
        const d = await page.evaluate(diff, { a: shots[kind][ra.name], b: shots[kind][rb.name] });
        save(`${c}.diff${kind === 'world' ? '.world' : ''}.png`, d.png);
        delete d.png;
        rec[`diff_${kind}`] = d;
      }
      await page.close();
    }
    console.log(c, JSON.stringify(rec));
  }
} finally {
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
  await browser.close(); release();
  for (const s of servers) s.close();
}
process.exit(failed ? 1 : 0);
