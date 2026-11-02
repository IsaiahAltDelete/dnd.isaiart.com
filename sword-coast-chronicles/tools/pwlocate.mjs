// tools/pwlocate.mjs — find Playwright and a Chromium-family browser on whatever machine this is.
//
// The screenshot, regression and render tools drive the real game in headless
// Chromium. Playwright is not a dependency of the game (there is no npm install
// for it), so the tools look for it where it tends to live:
//   1. $PLAYWRIGHT (a path or file:// URL to playwright/index.mjs)
//   2. the bundled runtime the original laptop had under ~/.cache/codex-runtimes
//   3. the global npm root (npm i -g playwright)
//   4. a node_modules/playwright next to this repo
// and for a browser: $CHROME, any ms-playwright download (newest first), then
// installed Chrome or Edge. A fresh machine needs only:
//   npm i -g playwright  &&  npx playwright install chromium

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HOME = os.homedir();
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LAPP = process.env.LOCALAPPDATA || path.join(HOME, 'AppData', 'Local');

function toPath(p) { return p.startsWith('file:') ? fileURLToPath(p) : p; }

/** Every place Playwright might be, as filesystem paths to playwright/index.mjs. */
export function playwrightCandidates() {
  const out = [];
  if (process.env.PLAYWRIGHT) out.push(toPath(process.env.PLAYWRIGHT));
  out.push(path.join(HOME, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'));
  try {
    const g = execSync('npm root -g', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000 }).trim();
    if (g) out.push(path.join(g, 'playwright', 'index.mjs'));
  } catch (e) { /* no npm on PATH */ }
  out.push(path.join(REPO, 'node_modules', 'playwright', 'index.mjs'));
  return out.filter((p) => fs.existsSync(p));
}

/** file:// URL of the first Playwright found, for tools that pass it to a child process. */
export function playwrightUrl() {
  const p = playwrightCandidates()[0];
  return p ? pathToFileURL(p).href : null;
}

const HELP = 'Playwright not found. Install it with:  npm i -g playwright  &&  npx playwright install chromium'
  + '\n(or set PLAYWRIGHT=<path to playwright/index.mjs>)';

/** Playwright's chromium launcher, or a clear error saying how to install it. */
export async function loadChromium() {
  for (const p of playwrightCandidates()) {
    try { return (await import(pathToFileURL(p).href)).chromium; } catch (e) { /* try the next */ }
  }
  try { return (await import('playwright')).chromium; } catch (e) { /* not resolvable either */ }
  throw new Error(HELP);
}

/** Browser executables worth trying, best first. An empty list still lets Playwright use its own. */
export function browserCandidates() {
  const out = [process.env.CHROME];
  const pw = path.join(LAPP, 'ms-playwright');
  try {
    for (const d of fs.readdirSync(pw).sort().reverse()) {
      if (d.startsWith('chromium_headless_shell-')) out.push(path.join(pw, d, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe'));
      else if (/^chromium-\d/.test(d)) out.push(path.join(pw, d, 'chrome-win64', 'chrome.exe'));
    }
  } catch (e) { /* no Playwright browser downloads */ }
  out.push('C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe');
  return out.filter((p) => p && fs.existsSync(p));
}
