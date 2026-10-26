// tools/shot.mjs — headless screenshot + probe harness for Sword Coast Chronicles.
//
// Serves THIS checkout (the directory above tools/) on a private port, boots the
// real game in headless Chromium, stages a scenario, and writes PNG screenshots
// plus a JSON report (console errors, draw failures, scene stack). Every worktree
// gets its own server, so parallel agents never see each other's half-edits.
//
//   NODE=node   # any Node 18+
//   $NODE tools/shot.mjs --scenario town --out output/shots/town.png
//   $NODE tools/shot.mjs --scenario combat --class wizard --out output/shots/fight.png
//   $NODE tools/shot.mjs --scenario town --hour 22 --out output/shots/night.png
//   $NODE tools/shot.mjs --scenario map --map neverwinter --x 20 --y 30 --out nw.png
//   $NODE tools/shot.mjs --scenario title --wait 2500 --out title.png
//   $NODE tools/shot.mjs --scenario town --eval "SC.cheat('god')" --frames 3 --every 400 --out t.png
//   $NODE tools/shot.mjs --scenario town --script my-probe.js   # file run in page after staging
//
// Scenarios: title | charcreate | town | forest | dungeon | map | fight | combat | menu |
//            dialogue | none (just boot to title, no clicks)
// Options:   --class <id>  --level <n>  --hour <0-23>  --weather rain|snow|storm|fog
//            --enemies goblin,goblin,wolf (combat)  --enemies goblin:4 (fight, with --map)  --wait <ms before shot, default 900>
//            --frames <n> --every <ms>  (writes out-0.png, out-1.png ...)
//            --scale <css px per logical px, default 2>  --out <png path>
//            --eval "<js expression, awaited>"  --script <file>  --json <report path>
//            --keys "ArrowUp,ArrowUp,KeyE"   (pressed after staging, 120ms apart)
// Exit code 1 if the page threw, logged a console error, or a scene draw failed.
//
// In page scripts: window.SC (Game, Party, Save, FX, cheat, ...) and dynamic
// import('/src/...') are available; the import map applies to them.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadChromium, browserCandidates } from './pwlocate.mjs';
import { acquireBrowserSlot } from './browserlock.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------- args
const A = { scenario: 'town', wait: 900, frames: 1, every: 400, scale: 2, class: 'fighter', level: 3 };
for (let i = 2; i < process.argv.length; i++) {
  const k = process.argv[i];
  if (!k.startsWith('--')) continue;
  const v = process.argv[i + 1];
  if (v === undefined || v.startsWith('--')) { A[k.slice(2)] = true; continue; }
  A[k.slice(2)] = v; i++;
}
A.wait = Number(A.wait); A.frames = Number(A.frames); A.every = Number(A.every);
A.scale = Number(A.scale); A.level = Number(A.level);
const OUT = path.resolve(ROOT, A.out || `output/shots/${A.scenario}.png`);
fs.mkdirSync(path.dirname(OUT), { recursive: true });

// ---------------------------------------------------------------- static server
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.png': 'image/png', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  try {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let f = path.join(ROOT, u === '/' ? 'index.html' : u);
    if (!f.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    if (!fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(f).pipe(res);
  } catch (e) { res.writeHead(500); res.end(String(e)); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

// ---------------------------------------------------------------- browser
const chromium = await loadChromium();
// At most two browsers machine-wide (tools/browserlock.mjs): the laptop is shared by many agents.
const releaseSlot = await acquireBrowserSlot();
// Playwright's pinned browser build is often not the one installed; fall back
// through what is actually on this machine rather than failing.
const CANDIDATES = browserCandidates();
let browser = null, launchErr = null;
for (const exe of [undefined, ...CANDIDATES]) {
  try { browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] }); break; }
  catch (e) { launchErr = e; }
}
if (!browser) { console.error('no launchable browser:', String(launchErr).split('\n')[0]); server.close(); process.exit(2); }
const vw = Math.round(400 * A.scale), vh = Math.round(240 * A.scale);
const page = await browser.newPage({ viewport: { width: vw, height: vh } });
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + String(e.stack || e).split('\n').slice(0, 3).join(' | ')));
page.on('console', (m) => {
  if (m.type() === 'error' && !/favicon/i.test(m.location?.()?.url || '')) errs.push('console: ' + m.text().slice(0, 400));
});
const report = { scenario: A.scenario, base: BASE, shots: [], errors: errs };

async function done(code) {
  report.errors = errs;
  const jp = A.json ? path.resolve(ROOT, A.json) : OUT.replace(/\.png$/i, '.json');
  fs.writeFileSync(jp, JSON.stringify(report, null, 1));
  console.log(JSON.stringify({ ok: code === 0, shots: report.shots, errors: errs.slice(0, 8), drawFails: report.drawFails, top: report.top }, null, 1));
  await browser.close(); releaseSlot(); server.close(); process.exit(code);
}

try {
  await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForFunction(() => window.SC && window.SC.Game && window.SC.Game.scenes.length > 0, null, { timeout: 60000 });
  await page.evaluate(() => { document.querySelector('#gate')?.classList.remove('show'); try { window.SC.Audio.muted = true; } catch (e) {} });

  const staged = await page.evaluate(async (A) => {
    const { Game, Party, createCharacter } = window.SC;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const until = async (fn, ms = 20000) => { const t = performance.now(); while (!fn()) { if (performance.now() - t > ms) return false; await wait(50); } return true; };
    const quickHero = async () => {
      window.SC.newGame();
      const s = Game.top;
      s.randomiseAll(); s.setClass(A.class); s.draft.name = 'Tester';
      if (s._autoFillPicks) s._autoFillPicks();
      s.finish();
      return until(() => Game.top && Game.top.id === 'overworld');
    };
    const ow = () => Game.scenes.find((s) => s.id === 'overworld');
    const go = async (mapId, x, y) => {
      const { travelTo } = await import('/src/world/overworld.js');
      travelTo(mapId, x, y, 'down');
      await until(() => ow() && ow().map && ow().map.id === mapId && !Game.transitioning, 15000);
      await wait(300);
    };
    const setHour = (h) => { const st = Game.state; if (st) st.time = (h % 24) * 60; };
    const out = {};
    switch (A.scenario) {
      case 'none': case 'title': break;
      case 'charcreate': window.SC.newGame(); break;
      case 'town': await quickHero(); break;
      case 'forest': await quickHero(); await go(A.map || 'neverwinter-wood', A.x != null ? +A.x : undefined, A.y != null ? +A.y : undefined); break;
      case 'dungeon': await quickHero(); await go(A.map || 'undermountain', A.x != null ? +A.x : undefined, A.y != null ? +A.y : undefined); break;
      case 'map': await quickHero(); await go(A.map, A.x != null ? +A.x : undefined, A.y != null ? +A.y : undefined); break;
      case 'menu': { await quickHero(); const m = await import('/src/ui/menus.js'); Game.push(new (m[A.menu || 'PartyScene'])()); break; }
      case 'dialogue': {
        await quickHero();
        const s = ow(); const n = s.entities.list.find((e) => e.kind === 'npc' && !e.hidden && (!A.npc || e.npcId === A.npc));
        if (n) { s.player.setTile(n.x, n.y + 1, 'up'); await wait(200); if (s._interact) s._interact(); else if (s.interact) s.interact(); }
        out.npc = n && n.npcId; break;
      }
      case 'fight': {
        // A real encounter through the game's own path: terrain-sampled arena,
        // formations, the lot. --map picks where the fight happens.
        await quickHero();
        if (A.map) await go(A.map, A.x != null ? +A.x : undefined, A.y != null ? +A.y : undefined);
        const [id, n] = String(A.enemies || 'goblin:3').split(':');
        await window.SC.cheat.fight(id, n ? +n : 3);
        await until(() => Game.top && Game.top.id === 'battle', 15000);
        break;
      }
      case 'combat': {
        const { Encounter } = await import('/src/rules/combat.js');
        const { BattleScene } = await import('/src/ui/combatui.js');
        const { newGameState } = await import('/src/state.js');
        Game.state = newGameState('shot-combat'); Party.clear();
        const p = createCharacter({ name: 'Tester', speciesId: A.species || 'human', classId: A.class, level: A.level, backgroundId: 'soldier' });
        Party.add(p);
        const enemies = String(A.enemies || 'goblin,goblin,wolf').split(',');
        const enc = new Encounter({ party: Party.members.slice(), enemies, seed: 'shot', biome: A.biome || undefined });
        enc.start();
        Game.replace(new BattleScene(enc)); Game.paused = false;
        break;
      }
      default: out.warn = 'unknown scenario ' + A.scenario;
    }
    if (A.hour != null && A.hour !== true) setHour(+A.hour);
    if (A.weather) { try { window.SC.FX.weather(A.weather, 0.8); } catch (e) {} }
    return out;
  }, A);
  report.staged = staged;

  if (A.eval) report.eval = await page.evaluate(async (code) => { const v = await (0, eval)(code); try { return JSON.parse(JSON.stringify(v ?? null)); } catch (e) { return String(v); } }, A.eval);
  if (A.script) {
    const code = fs.readFileSync(path.resolve(process.cwd(), A.script), 'utf8');
    report.script = await page.evaluate(async (code) => { const f = new Function(`return (async () => { ${code}\n })();`); const v = await f(); try { return JSON.parse(JSON.stringify(v ?? null)); } catch (e) { return String(v); } }, code);
  }
  if (A.keys) for (const k of String(A.keys).split(',')) { await page.keyboard.press(k.trim()); await page.waitForTimeout(120); }

  await page.waitForTimeout(A.wait);
  for (let i = 0; i < A.frames; i++) {
    const p = A.frames > 1 ? OUT.replace(/\.png$/i, `-${i}.png`) : OUT;
    await page.screenshot({ path: p });
    report.shots.push(path.relative(ROOT, p));
    // A probe that pages through views (tools/vfxprobe.js) sets window.SHOT_NEXT: it is
    // awaited between frames, so each frame shows the next view however slow a shot is.
    if (i < A.frames - 1) { await page.evaluate(() => window.SHOT_NEXT && window.SHOT_NEXT()); await page.waitForTimeout(A.every); }
  }
  const tail = await page.evaluate(() => ({
    top: window.SC.Game.top && (window.SC.Game.top.id || window.SC.Game.top.constructor.name),
    stack: window.SC.Game.scenes.map((s) => s.id || s.constructor.name),
    drawFails: [...(window.SC.Game._drawFails || [])],
    fps: window.SC.Game.fps,
    text: window.render_game_to_text ? window.render_game_to_text() : null,
  }));
  Object.assign(report, tail);
  await done(errs.length || tail.drawFails.length ? 1 : 0);
} catch (e) {
  errs.push('harness: ' + String(e.stack || e).split('\n').slice(0, 4).join(' | '));
  try { await page.screenshot({ path: OUT.replace(/\.png$/i, '-failure.png') }); } catch (e2) {}
  await done(1);
}
