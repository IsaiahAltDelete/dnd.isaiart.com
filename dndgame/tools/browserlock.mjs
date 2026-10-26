// tools/browserlock.mjs — a machine-wide limit on concurrent headless browsers.
//
// Several agents share one laptop (2 cores, ~7 GB). Each headless Chromium costs
// a few hundred MB, so unbounded parallel screenshots would swap the machine to
// a halt. Every browser-launching tool takes a slot first; slots are plain files
// created with O_EXCL in a shared temp folder, so this works across processes
// and git worktrees with no daemon. A slot whose owner died is reclaimed after
// STALE_MS or when its pid is gone.
//
//   import { acquireBrowserSlot } from './browserlock.mjs';
//   const release = await acquireBrowserSlot();   // waits for a free slot
//   try { ... } finally { release(); }

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const DIR = path.join(process.env.SC_LOCK_DIR || os.tmpdir(), 'sc-browser-slots');
const SLOTS = Number(process.env.SC_BROWSER_SLOTS || 2);
const STALE_MS = 6 * 60 * 1000;

function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

function reclaim(file) {
  try {
    const { pid, at } = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!alive(pid) || Date.now() - at > STALE_MS) fs.unlinkSync(file);
  } catch (e) {
    try { if (Date.now() - fs.statSync(file).mtimeMs > STALE_MS) fs.unlinkSync(file); } catch (e2) { /* gone */ }
  }
}

export async function acquireBrowserSlot({ timeoutMs = 20 * 60 * 1000 } = {}) {
  fs.mkdirSync(DIR, { recursive: true });
  const start = Date.now();
  let told = false;
  for (;;) {
    for (let i = 0; i < SLOTS; i++) {
      const file = path.join(DIR, `slot-${i}`);
      try {
        const fd = fs.openSync(file, 'wx');
        fs.writeSync(fd, JSON.stringify({ pid: process.pid, at: Date.now(), cwd: process.cwd() }));
        fs.closeSync(fd);
        let released = false;
        const release = () => { if (!released) { released = true; try { fs.unlinkSync(file); } catch (e) { /* ignore */ } } };
        process.once('exit', release);
        return release;
      } catch (e) {
        if (e.code !== 'EEXIST') throw e;
        reclaim(file);
      }
    }
    if (!told) { console.error(`[browserlock] all ${SLOTS} browser slots busy; waiting...`); told = true; }
    if (Date.now() - start > timeoutMs) throw new Error('browserlock: timed out waiting for a browser slot');
    await new Promise((r) => setTimeout(r, 1500 + Math.random() * 1500));
  }
}
