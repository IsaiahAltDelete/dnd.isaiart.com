// core/savefile.js — a campaign out of this browser, or into it. Saves live in
// localStorage, which is tied to the domain and the machine: a new browser, a
// new PC or a site that moved domains (which this one did) starts with nothing.
// A slot goes out as a small text file (its base64 export, which also lands on
// the clipboard where the browser allows), and comes back through the file
// picker, a drop onto the window, or a paste. Thin wrappers around
// Save.exportSlot / Save.importSlot: every entry point reports through a plain
// result object or a Promise of one and never throws at the caller.

import { Save } from './save.js';
import { Input } from './input.js';

const FILE_PREFIX = 'sword-coast-chronicles';

const pad2 = (n) => String(n).padStart(2, '0');

function slug(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'adventurer';
}

/** "sword-coast-chronicles-slot2-ilikan-20261102.txt" */
export function exportFileName(slot) {
  let who = 'save';
  try { const m = Save.meta(slot); if (m && m.name) who = slug(m.name); } catch (_) { /* name is optional */ }
  const d = new Date();
  const where = slot === Save.AUTOSAVE_SLOT ? 'autosave' : `slot${slot}`;
  return `${FILE_PREFIX}-${where}-${who}-${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}.txt`;
}

/** Hand `text` to the browser as a download. -> bool */
function download(name, text) {
  try {
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => { try { URL.revokeObjectURL(url); } catch (_) { /* already gone */ } }, 10000);
    return true;
  } catch (e) {
    console.warn('[savefile] download failed', e);
    return false;
  }
}

/** Put `text` on the clipboard where the browser allows it. -> Promise<bool> */
function copy(text) {
  try {
    const cb = navigator.clipboard;
    if (cb && typeof cb.writeText === 'function') return cb.writeText(text).then(() => true, () => false);
  } catch (_) { /* no clipboard here */ }
  return Promise.resolve(false);
}

/**
 * Export a slot: it downloads as a text file, and the same code is copied to the
 * clipboard when the browser lets us. -> Promise<{ ok, file, copied, name, reason }>
 * reason is 'empty' (nothing in the slot, or the host lacks btoa) or 'blocked'.
 */
export function exportSlotToFile(slot) {
  let code = null;
  try { code = Save.exportSlot(slot); } catch (e) { console.warn('[savefile] export failed', e); }
  if (!code) return Promise.resolve({ ok: false, file: false, copied: false, name: '', reason: 'empty' });
  const name = exportFileName(slot);
  const file = download(name, code);
  return copy(code).then((copied) => ({
    ok: file || copied, file, copied, name, reason: file || copied ? '' : 'blocked',
  }));
}

/** Read a File as text. -> Promise<string|null> */
function readFile(f) {
  if (!f) return Promise.resolve(null);
  if (typeof f.text === 'function') return f.text().catch(() => null);
  return new Promise((resolve) => {
    try {
      const r = new FileReader();
      r.onload = () => resolve(typeof r.result === 'string' ? r.result : null);
      r.onerror = () => resolve(null);
      r.readAsText(f);
    } catch (_) { resolve(null); }
  });
}

/**
 * Open the browser's file picker for a save file. -> Promise<string|null>
 * Resolves null when the player cancels. If the browser refuses to open the
 * picker at all (no recent user gesture) the promise never settles, so callers
 * must not block on it; a toast telling the player what to do is enough.
 */
export function pickSaveFile() {
  return new Promise((resolve) => {
    try {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.txt,.scc,text/plain';
      input.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0';
      let done = false;
      const finish = (v) => { if (done) return; done = true; try { input.remove(); } catch (_) { /* gone */ } resolve(v); };
      input.addEventListener('change', () => {
        const f = input.files && input.files[0];
        if (!f) { finish(null); return; }
        readFile(f).then(finish);
      });
      input.addEventListener('cancel', () => finish(null));
      // Browsers without the cancel event: focus comes back to the window when
      // the dialog closes; if no file arrived shortly after, treat it as cancelled.
      const onFocus = () => { window.removeEventListener('focus', onFocus); setTimeout(() => finish(null), 1500); };
      setTimeout(() => { if (!done) window.addEventListener('focus', onFocus); }, 300);
      document.body.appendChild(input);
      input.click();
    } catch (e) {
      console.warn('[savefile] picker failed', e);
      resolve(null);
    }
  });
}

/** True when `text` decodes as one of our save envelopes (or a bare game state). */
export function looksLikeSave(text) {
  if (typeof text !== 'string' || text.length < 16) return false;
  try { return !!Save.inspectExport(text); } catch (_) { return false; }
}

/**
 * Write a save code into the game. It goes into `slot` when that is a free
 * manual slot; otherwise into the first free manual slot, so an import never
 * paints over a campaign and never lands in the autosave (which the next
 * autosave would overwrite).
 * -> { ok, slot, meta, reason } with reason 'bad' | 'full' | 'write'.
 */
export function importSaveText(text, slot = 1) {
  let meta = null;
  try { meta = Save.inspectExport(text); } catch (_) { meta = null; }
  if (!meta) return { ok: false, slot: -1, meta: null, reason: 'bad' };

  let list = [];
  try { list = Save.list() || []; } catch (_) { list = []; }
  const free = (n) => { const s = list[n]; return !!s && s.empty && n !== Save.AUTOSAVE_SLOT; };
  let target = free(slot) ? slot : -1;
  if (target < 0) {
    for (const n of Save.MANUAL_SLOTS) { if (free(n)) { target = n; break; } }
  }
  if (target < 0) return { ok: false, slot: -1, meta, reason: 'full' };

  let ok = false;
  try { ok = !!Save.importSlot(target, text); } catch (e) { console.warn('[savefile] import failed', e); }
  return { ok, slot: ok ? target : -1, meta, reason: ok ? '' : 'write' };
}

// ---------------------------------------------------------------------------
// Drop and paste
// ---------------------------------------------------------------------------
// While a load screen is open, a save file dropped anywhere on the window, or a
// save code pasted, is handed to the screen. One listener set at a time; the
// screen that opened it closes it.

let hooks = null;

/** Start listening; `onText(text, how)` gets the save code, how = 'drop' | 'paste'. */
export function listenForSaves(onText) {
  stopListening();
  if (typeof window === 'undefined' || typeof onText !== 'function') return;
  const onDragOver = (e) => {
    const types = e.dataTransfer && e.dataTransfer.types;
    if (types && Array.prototype.indexOf.call(types, 'Files') >= 0) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }
  };
  const onDrop = (e) => {
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!f) return;
    e.preventDefault();
    readFile(f).then((t) => { if (t) onText(t, 'drop'); });
  };
  const onPaste = (e) => {
    if (Input.capturingText) return;                 // a name field has the keyboard
    let t = '';
    try { t = e.clipboardData ? e.clipboardData.getData('text') : ''; } catch (_) { t = ''; }
    if (!looksLikeSave(t)) return;
    e.preventDefault();
    onText(t, 'paste');
  };
  window.addEventListener('dragover', onDragOver);
  window.addEventListener('drop', onDrop);
  window.addEventListener('paste', onPaste);
  hooks = { onDragOver, onDrop, onPaste };
}

export function stopListening() {
  if (!hooks || typeof window === 'undefined') { hooks = null; return; }
  window.removeEventListener('dragover', hooks.onDragOver);
  window.removeEventListener('drop', hooks.onDrop);
  window.removeEventListener('paste', hooks.onPaste);
  hooks = null;
}

export default { exportFileName, exportSlotToFile, pickSaveFile, looksLikeSave, importSaveText, listenForSaves, stopListening };
