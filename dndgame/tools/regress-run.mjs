// tools/regress-run.mjs — run test/regress.mjs against THIS checkout with no setup.
//
//   $NODE tools/regress-run.mjs
//
// regress.mjs expects the game at <BASE>/dndgame/ (the deployed path) and a
// Playwright + Chromium it can find. This serves the checkout at /dndgame/ on a
// private port, points it at the machine's Playwright and browser, and relays the
// suite's output and exit code. Works from any git worktree.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { acquireBrowserSlot } from './browserlock.mjs';
import { playwrightUrl, browserCandidates } from './pwlocate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const rel = u.startsWith('/dndgame/') ? u.slice('/dndgame/'.length) : u.replace(/^\//, '');
  let f = path.join(ROOT, rel || 'index.html');
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  if (fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const chrome = browserCandidates()[0];
const pw = playwrightUrl();
if (!pw && !process.env.PLAYWRIGHT) { console.error('Playwright not found. Install it with:  npm i -g playwright  &&  npx playwright install chromium'); process.exit(2); }
const env = {
  ...process.env,
  BASE: `http://127.0.0.1:${server.address().port}`,
  GAME: 'dndgame',
  PLAYWRIGHT: process.env.PLAYWRIGHT || pw,
  CHROME: process.env.CHROME || chrome,
};
const releaseSlot = await acquireBrowserSlot();
const child = spawn(process.execPath, [path.join(ROOT, 'test/regress.mjs')], { env, stdio: 'inherit', cwd: ROOT });
child.on('exit', (code) => { releaseSlot(); server.close(); process.exit(code ?? 1); });
