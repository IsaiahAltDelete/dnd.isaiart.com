// core/save.js — persistence layer: five save slots, versioned save envelopes with a
// migration chain, base64 export/import, and the persisted settings object. Nothing in
// here may throw at the caller: a corrupt slot, a full disk or a browser with storage
// switched off must all degrade into a polite return value, never a crash mid-game.

import { titleCase, playtimeText, clamp } from '../constants.js';
import { bus, EV } from './events.js';

// ---------------------------------------------------------------------------
// Constants & storage keys
// ---------------------------------------------------------------------------

/** Bump this whenever the shape of a GameState changes, and add a MIGRATIONS entry. */
export const SAVE_VERSION = 1;

export const SLOT_COUNT = 5;      // slot 0 = autosave, slots 1..4 = manual
export const AUTOSAVE_SLOT = 0;
export const MANUAL_SLOTS = [1, 2, 3, 4];

const PREFIX = 'swordcoast.';
const slotKey = (n) => `${PREFIX}save.${n}`;
const SETTINGS_KEY = `${PREFIX}settings`;
const LAST_SLOT_KEY = `${PREFIX}lastSlot`;

/** Magic string stamped into exported files so importSlot can sniff foreign data. */
const MAGIC = 'SWORDCOAST';

/** Any one of these marks a plain object as plausibly being a GameState (see §7). */
const GAMESTATE_KEYS = [
  'party', 'mapId', 'seed', 'worldSeed', 'flags', 'quests', 'playtime', 'stats',
];

/** Emitted (with the settings object) whenever settings are saved or reset. */
export const EV_SETTINGS = 'sys:settings';

const isSlot = (n) => Number.isInteger(n) && n >= 0 && n < SLOT_COUNT;

// ---------------------------------------------------------------------------
// Storage abstraction
// ---------------------------------------------------------------------------
// Safari private mode and hardened browser profiles throw on the *first* setItem,
// not on access, so we probe with a real write. If localStorage is unusable we fall
// back to an in-memory map: the player can still save and reload within the session,
// and `Save.available === false` lets the UI warn that nothing will persist.

function probeStorage() {
  try {
    const ls = globalThis.localStorage;
    if (!ls) return null;
    const probe = `${PREFIX}__probe`;
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch (_) {
    return null;
  }
}

const LS = probeStorage();
const memory = new Map();

/** True for the various browser spellings of "you are out of room". */
function isQuotaError(e) {
  if (!e) return false;
  return (
    e.name === 'QuotaExceededError' ||
    e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    e.code === 22 || e.code === 1014
  );
}

const store = {
  persistent: !!LS,

  get(k) {
    try {
      if (LS) {
        const v = LS.getItem(k);
        if (v != null) return v;
      }
    } catch (_) { /* fall through to memory */ }
    // Also covers values that only ever made it into the memory mirror (a write that
    // failed on quota) so the session can still read back what it just saved.
    return memory.has(k) ? memory.get(k) : null;
  },

  /** -> { ok, reason } ; reason is 'quota' | 'error' | 'memory' (wrote, but volatile). */
  set(k, v) {
    if (!LS) { memory.set(k, v); return { ok: true, reason: 'memory' }; }
    try {
      LS.setItem(k, v);
      return { ok: true, reason: '' };
    } catch (e) {
      // Keep the value in memory so the current session is not lost even though the
      // write to disk failed — the player can still export the slot as base64.
      memory.set(k, v);
      return { ok: false, reason: isQuotaError(e) ? 'quota' : 'error', error: e };
    }
  },

  del(k) {
    memory.delete(k);
    try { if (LS) LS.removeItem(k); return true; } catch (_) { return false; }
  },
};

// ---------------------------------------------------------------------------
// Migration chain
// ---------------------------------------------------------------------------
// Each entry upgrades a save's inner `data` from one version to the next. They run in
// sequence (0 -> 1 -> 2 ...) until the data reaches SAVE_VERSION. A migrate() gets the
// parsed data and returns the upgraded data; throwing marks the slot corrupt rather
// than taking the game down.

export const MIGRATIONS = [
  {
    from: 0, to: 1,
    // v0 = pre-release saves written before the envelope carried a version stamp.
    // Normalise the containers every later module assumes exist.
    migrate(d) {
      if (!d || typeof d !== 'object') return d;
      if (d.mapId == null && typeof d.map === 'string') d.mapId = d.map;
      if (!d.quests || typeof d.quests !== 'object') d.quests = {};
      for (const k of ['active', 'done', 'failed']) {
        if (!Array.isArray(d.quests[k])) d.quests[k] = [];
      }
      for (const k of ['flags', 'discovered', 'chests', 'defeated', 'depth', 'stats', 'shops']) {
        if (!d[k] || typeof d[k] !== 'object') d[k] = {};
      }
      if (!Number.isFinite(d.playtime)) d.playtime = 0;
      if (!Number.isFinite(d.day)) d.day = 1;
      return d;
    },
  },
];

/**
 * Walk `data` from `version` up to SAVE_VERSION.
 * -> { ok, data, version, reason } — reason is 'future' | 'no-path' | 'failed'.
 */
function runMigrations(data, version) {
  let v = Number.isFinite(version) ? version : 0;
  let d = data;
  // A save from a *newer* build may reference content this build does not have.
  if (v > SAVE_VERSION) return { ok: false, data: d, version: v, reason: 'future' };

  let guard = 0;
  while (v < SAVE_VERSION) {
    if (++guard > 64) return { ok: false, data: d, version: v, reason: 'failed' };
    const step = MIGRATIONS.find((m) => m.from === v);
    if (!step) return { ok: false, data: d, version: v, reason: 'no-path' };
    try {
      d = step.migrate(d);
    } catch (e) {
      console.error(`[save] migration ${step.from}->${step.to} failed`, e);
      return { ok: false, data: d, version: v, reason: 'failed' };
    }
    v = step.to;
  }
  return { ok: true, data: d, version: v, reason: '' };
}

// ---------------------------------------------------------------------------
// Place names — canonical Sword Coast locations for the save menu
// ---------------------------------------------------------------------------
// Map ids are kebab-case; the save menu wants the published Forgotten Realms spelling
// (apostrophes and all), plus a biome for the slot's little scenery swatch.

const MAP_INFO = {
  // Phandalin and its interiors
  'phandalin': { name: 'Phandalin', biome: 'city' },
  'stonehill-inn': { name: 'Stonehill Inn', biome: 'city' },
  'barthens-provisions': { name: "Barthen's Provisions", biome: 'city' },
  'lionshield-coster': { name: 'Lionshield Coster', biome: 'city' },
  'shrine-of-luck': { name: 'Shrine of Luck', biome: 'city' },
  'miners-exchange': { name: "Phandalin Miner's Exchange", biome: 'city' },
  'townmasters-hall': { name: "Townmaster's Hall", biome: 'city' },
  'alderleaf-farm': { name: 'Alderleaf Farm', biome: 'plains' },
  'edermath-orchard': { name: 'Edermath Orchard', biome: 'plains' },
  'sleeping-giant': { name: 'The Sleeping Giant', biome: 'city' },
  'dendrar-home': { name: 'The Dendrar House', biome: 'city' },
  'phandalin-manor': { name: 'Tresendar Manor', biome: 'ruins' },
  'tresendar-manor': { name: 'Tresendar Manor', biome: 'ruins' },
  'redbrand-hideout': { name: 'Redbrand Hideout', biome: 'dungeon' },
  // The road and the wilds
  'triboar-trail': { name: 'Triboar Trail', biome: 'road' },
  'high-road': { name: 'The High Road', biome: 'road' },
  'neverwinter-wood': { name: 'Neverwinter Wood', biome: 'pine-forest' },
  'kryptgarden-forest': { name: 'Kryptgarden Forest', biome: 'forest' },
  'sword-mountains': { name: 'Sword Mountains', biome: 'mountain' },
  'mere-of-dead-men': { name: 'Mere of Dead Men', biome: 'marsh' },
  'wyvern-tor': { name: 'Wyvern Tor', biome: 'hills' },
  'icespire-peak': { name: 'Icespire Peak', biome: 'tundra' },
  // Ruins, lairs and dungeons
  'cragmaw-hideout': { name: 'Cragmaw Hideout', biome: 'cave' },
  'cragmaw-castle': { name: 'Cragmaw Castle', biome: 'ruins' },
  'wave-echo-cave': { name: 'Wave Echo Cave', biome: 'mine' },
  'wave-echo-cave-entrance': { name: 'Wave Echo Cave', biome: 'mine' },
  'conyberry-ruins': { name: 'Conyberry', biome: 'ruins' },
  'agatha-grove': { name: "Agatha's Grove", biome: 'forest' },
  'thundertree': { name: 'Thundertree', biome: 'ash-waste' },
  'old-owl-well': { name: 'Old Owl Well', biome: 'ruins' },
  // Cities and the endless dungeon
  'leilon': { name: 'Leilon', biome: 'city' },
  'neverwinter': { name: 'Neverwinter', biome: 'city' },
  'waterdeep': { name: 'Waterdeep', biome: 'city' },
  'yawning-portal': { name: 'The Yawning Portal', biome: 'city' },
  'undermountain': { name: 'Undermountain', biome: 'underdark' },
  'world': { name: 'The Sword Coast', biome: 'road' },
  'overworld': { name: 'The Sword Coast', biome: 'road' },
};

/** Words that stay lowercase inside a generated place name. */
const SMALL_WORDS = new Set(['of', 'the', 'and', 'in', 'on', 'at', 'to', 'a']);

/** Fallback prettifier for procedurally generated map ids ("deep-cave-4"). */
function prettyMapName(id) {
  const s = String(id || '').trim();
  if (!s) return 'The Sword Coast';
  return s.split(/[-_\s]+/).map((w, i) => {
    const lw = w.toLowerCase();
    return i > 0 && SMALL_WORDS.has(lw) ? lw : titleCase(lw);
  }).join(' ');
}

// ---------------------------------------------------------------------------
// Meta derivation
// ---------------------------------------------------------------------------

const EMPTY_META = () => ({
  name: 'Adventurer',
  level: 1,
  playtime: 0,
  mapName: 'The Sword Coast',
  biome: 'road',
  partyNames: [],
  gold: 0,
  day: 1,
  difficulty: 'normal',
  partySize: 0,
  avgLevel: 1,
});

const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

/** A member's total level: explicit `level`, else the sum of its multiclass levels. */
function memberLevel(m) {
  const lvl = num(m && m.level, 0);
  if (lvl > 0) return lvl;
  if (m && Array.isArray(m.classes)) {
    let sum = 0;
    for (const c of m.classes) sum += num(c && c.level, 0);
    if (sum > 0) return sum;
  }
  return 0;
}

/**
 * Build the save-menu header from a GameState. Deliberately paranoid: a half-built
 * state, a state mid-character-creation, or outright garbage must all produce a
 * usable card rather than an exception that eats the player's save.
 */
export function computeMeta(data, overrides = null) {
  const meta = EMPTY_META();
  try {
    const d = (data && typeof data === 'object') ? data : {};
    const party = (d.party && typeof d.party === 'object') ? d.party : {};

    // Party roster may live at data.party.members or (older shapes) data.members.
    const raw = Array.isArray(party.members) ? party.members
      : Array.isArray(d.members) ? d.members : [];
    let levelSum = 0, counted = 0;
    for (const m of raw) {
      if (!m || typeof m !== 'object') continue;
      const nm = String(m.name == null ? '' : m.name).slice(0, 24).trim();
      meta.partyNames.push(nm || 'Unnamed');
      const l = memberLevel(m);
      if (l > 0) { levelSum += l; counted++; }
    }
    meta.partySize = meta.partyNames.length;
    meta.avgLevel = counted ? Math.max(1, Math.round(levelSum / counted)) : 1;

    // The card shows the leader: their name, their level.
    const leader = raw.find((m) => m && typeof m === 'object') || null;
    if (leader) {
      const nm = String(leader.name == null ? '' : leader.name).slice(0, 24).trim();
      if (nm) meta.name = nm;
      meta.level = memberLevel(leader) || meta.avgLevel;
    } else {
      meta.level = meta.avgLevel;
    }

    meta.playtime = Math.max(0, Math.floor(num(d.playtime, 0)));
    meta.gold = Math.max(0, Math.floor(num(party.gold != null ? party.gold : d.gold, 0)));
    meta.day = Math.max(1, Math.floor(num(d.day, 1)));

    const mapId = typeof d.mapId === 'string' ? d.mapId
      : (d.map && typeof d.map === 'object' && typeof d.map.name === 'string') ? d.map.name : '';
    const info = MAP_INFO[mapId];
    meta.mapName = info ? info.name : prettyMapName(mapId);
    meta.biome = String(
      d.biome || (d.map && d.map.biome) || (info && info.biome) || 'road'
    );

    const diff = d.difficulty || (d.settings && d.settings.difficulty);
    if (typeof diff === 'string' && diff) meta.difficulty = diff;
  } catch (e) {
    // Never let a malformed state block a save — a bland card beats no save at all.
    console.warn('[save] meta derivation failed; using defaults', e);
  }
  if (overrides && typeof overrides === 'object') Object.assign(meta, overrides);
  return meta;
}

// ---------------------------------------------------------------------------
// Envelope read/write
// ---------------------------------------------------------------------------

// list() may be called from a menu's draw() every frame, so parsed envelopes are
// cached per slot. Any write/erase through this module invalidates its entry, and a
// `storage` event (another tab) drops the whole cache.
const metaCache = new Map();

if (typeof globalThis.addEventListener === 'function') {
  try {
    globalThis.addEventListener('storage', (e) => {
      if (!e || !e.key || String(e.key).startsWith(PREFIX)) metaCache.clear();
    });
  } catch (_) { /* non-browser host; nothing to listen to */ }
}

/** Parse a slot's raw JSON into an envelope, tolerating anything on disk. */
function readEnvelope(slot) {
  const rawText = store.get(slotKey(slot));
  if (rawText == null || rawText === '') return null;
  let env;
  try {
    env = JSON.parse(rawText);
  } catch (e) {
    return { corrupt: true, reason: 'parse', bytes: rawText.length };
  }
  if (!env || typeof env !== 'object' || !('data' in env)) {
    return { corrupt: true, reason: 'shape', bytes: rawText.length };
  }
  env.bytes = rawText.length;
  if (!Number.isFinite(env.version)) env.version = 0;
  if (!env.meta || typeof env.meta !== 'object') env.meta = computeMeta(env.data);
  return env;
}

function cachedEnvelope(slot) {
  if (metaCache.has(slot)) return metaCache.get(slot);
  const env = readEnvelope(slot);
  metaCache.set(slot, env);
  return env;
}

// ---------------------------------------------------------------------------
// Base64 (UTF-8 safe)
// ---------------------------------------------------------------------------
// btoa() only accepts Latin-1, so character names with accents or a stray em dash in
// a note would corrupt a naive btoa(JSON.stringify(x)). Encode to UTF-8 bytes first
// and feed btoa a binary string, chunked so a huge save never blows the call stack.

function bytesToBase64(bytes) {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function base64ToBytes(b64) {
  // Tolerate wrapped lines and the URL-safe alphabet, and re-pad if stripped.
  let s = String(b64).replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  const rem = s.length % 4;
  if (rem) s += '='.repeat(4 - rem);
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const hasB64 = typeof btoa === 'function' && typeof atob === 'function';

// ---------------------------------------------------------------------------
// Timestamps
// ---------------------------------------------------------------------------

/** "1496-08-25 21:04" style stamp — locale-independent so it never reflows the UI. */
function stampText(ms) {
  const t = Number(ms);
  if (!Number.isFinite(t) || t <= 0) return '';
  const d = new Date(t);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function timeAgo(ms) {
  const t = Number(ms);
  if (!Number.isFinite(t) || t <= 0) return '';
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 90) return 'just now';
  const m = s / 60;
  if (m < 60) return `${Math.round(m)} min ago`;
  const h = m / 60;
  if (h < 24) return `${Math.round(h)} hr ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
// One source of truth: SETTING_SPEC drives the defaults, the sanitiser AND the
// OptionsScene's widget list, so adding an option in one place is enough.

export const SETTING_SPEC = Object.freeze({
  volMaster: { kind: 'range', def: 0.8, min: 0, max: 1, step: 0.05, name: 'Master Volume', group: 'audio' },
  volMusic: { kind: 'range', def: 0.6, min: 0, max: 1, step: 0.05, name: 'Music Volume', group: 'audio' },
  volSfx: { kind: 'range', def: 0.8, min: 0, max: 1, step: 0.05, name: 'Effects Volume', group: 'audio' },
  muted: { kind: 'bool', def: false, name: 'Mute All', group: 'audio' },
  // Track ids the player starred in the Minstrel's Songbook (Options > Songbook).
  musicFavorites: { kind: 'custom', def: null, name: 'Favourite Songs', group: 'audio' },

  textSpeed: { kind: 'enum', def: 'normal', options: ['slow', 'normal', 'fast', 'instant'], name: 'Text Speed', group: 'display' },
  scale: { kind: 'enum', def: 'auto', options: ['auto', 1, 2, 3, 4, 5], name: 'Window Scale', group: 'display' },
  showGrid: { kind: 'bool', def: true, name: 'Battle Grid', group: 'display' },
  showDamageNumbers: { kind: 'bool', def: true, name: 'Damage Numbers', group: 'display' },
  showRolls: { kind: 'bool', def: true, name: 'Show Dice Rolls', group: 'display' },
  screenShake: { kind: 'bool', def: true, name: 'Screen Shake', group: 'display' },
  reducedMotion: { kind: 'bool', def: false, name: 'Reduced Motion', group: 'display' },
  showEdges: { kind: 'bool', def: true, name: 'Path Edges', group: 'display' },
  showExits: { kind: 'bool', def: true, name: 'Exit Markers', group: 'display' },
  colorblind: { kind: 'enum', def: 'none', options: ['none', 'protanopia', 'deuteranopia', 'tritanopia'], name: 'Colour Filter', group: 'display' },
  // Read by render/stage.js (Stage.applySettings): a colour grade over the
  // world only, and a fine scanline mask over the whole screen.
  pixelFilter: { kind: 'enum', def: 'none', options: ['none', 'warm', 'tapestry', 'gloom', 'vivid'], name: 'Pixel Filter', group: 'display' },
  scanlines: { kind: 'bool', def: false, name: 'Scanlines', group: 'display' },
  // Where the player has moved each HUD widget (ui/layout.js): { id: { dx, dy, hidden } }.
  hudLayout: { kind: 'custom', def: null, name: 'HUD Layout', group: 'display' },
  // Which HUD preset is in force (ui/layout.js; ui/hud.js defines classic,
  // minimal and cinematic). Choosing one lays the widgets out by it.
  hudPreset: { kind: 'enum', def: 'default', options: ['default', 'classic', 'minimal', 'cinematic', 'mirrored'], name: 'HUD Preset', group: 'display' },
  // Logical px per tile on the overworld minimap; clicking the roundel cycles it.
  minimapZoom: { kind: 'enum', def: 1, options: [0.5, 1, 2], name: 'Minimap Zoom', group: 'display' },
  // The interface skin (ui/kit.js THEMES); the kit applies it at load and on every save.
  uiTheme: { kind: 'enum', def: 'folio', options: ['folio', 'timber', 'iron', 'parchment'], name: 'Interface Theme', group: 'display' },

  autoEndTurn: { kind: 'bool', def: true, name: 'Auto End Turn', group: 'combat' },
  battleSpeed: { kind: 'enum', def: 1, options: [0.5, 1, 1.5, 2, 3], name: 'Battle Speed', group: 'combat' },
  difficulty: { kind: 'enum', def: 'normal', options: ['story', 'easy', 'normal', 'hard', 'deadly'], name: 'Difficulty', group: 'combat' },
  // Ambushes out of the grass default to 'normal' — a moderate rate that sits
  // alongside the visible wandering packs. 'off' leaves only the packs you can
  // see coming and walk around.
  wildEncounters: {
    kind: 'enum', def: 'normal', options: ['off', 'rare', 'normal', 'frequent'],
    name: 'Random Ambushes', group: 'combat',
  },
  roamingMonsters: { kind: 'bool', def: true, name: 'Visible Wandering Foes', group: 'combat' },
  // How eventful the open road is (rules/encounters.js PACING): how many groups
  // are out, how fast tension builds, how long the quiet lasts after trouble.
  encounterPacing: { kind: 'enum', def: 'normal', options: ['calm', 'normal', 'perilous'], name: 'Encounter Pacing', group: 'combat' },
  battleZoom: { kind: 'enum', def: 'fit', options: ['fit', 'close'], name: 'Battle Camera', group: 'combat' },

  bindings: { kind: 'custom', def: null, name: 'Key Bindings', group: 'controls' },
});

/** The exact persisted defaults (frozen; use Save.settings for the live object). */
export const DEFAULT_SETTINGS = Object.freeze(
  Object.fromEntries(Object.entries(SETTING_SPEC).map(([k, s]) => [k, s.def]))
);

/** Dialogue/typewriter characters per second for each textSpeed. */
export const TEXT_SPEED_CPS = Object.freeze({ slow: 18, normal: 42, fast: 90, instant: Infinity });

/** Coerce one value against its spec; returns the default when it cannot be salvaged. */
function coerceSetting(k, v) {
  const spec = SETTING_SPEC[k];
  if (!spec) return undefined;                       // unknown key: dropped
  if (v === undefined || v === null) return spec.def; // (bindings' default *is* null)
  switch (spec.kind) {
    case 'bool':
      return typeof v === 'boolean' ? v : (v === 'true' ? true : v === 'false' ? false : !!v);
    case 'range': {
      const n = Number(v);
      return Number.isFinite(n) ? clamp(n, spec.min, spec.max) : spec.def;
    }
    case 'enum': {
      if (spec.options.includes(v)) return v;
      const n = Number(v);                            // '2' from a slider -> 2
      if (!Number.isNaN(n) && spec.options.includes(n)) return n;
      return spec.def;
    }
    case 'custom':
    default:
      return v;
  }
}

/** Key bindings must be { action: [codeString, ...] } or null. */
function sanitizeBindings(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return null;
  const out = {};
  for (const [action, codes] of Object.entries(b)) {
    if (!Array.isArray(codes)) continue;
    const list = codes.filter((c) => typeof c === 'string' && c).slice(0, 8);
    if (list.length) out[action] = list;
  }
  return Object.keys(out).length ? out : null;
}

/** HUD offsets must be { widgetId: { dx, dy, hidden } } with small whole numbers, or null. */
function sanitizeHudLayout(h) {
  if (!h || typeof h !== 'object' || Array.isArray(h)) return null;
  const out = {};
  for (const [id, o] of Object.entries(h)) {
    if (!o || typeof o !== 'object' || id.length > 64) continue;
    const dx = clamp(Math.round(Number(o.dx) || 0), -800, 800);
    const dy = clamp(Math.round(Number(o.dy) || 0), -480, 480);
    if (dx || dy || o.hidden === true) out[id] = { dx, dy, ...(o.hidden === true ? { hidden: true } : {}) };
  }
  return Object.keys(out).length ? out : null;
}

/** Favourite track ids must be a short list of distinct short strings, or null. */
function sanitizeFavorites(f) {
  if (!Array.isArray(f)) return null;
  const out = [...new Set(f.filter((id) => typeof id === 'string' && id && id.length <= 64))].slice(0, 200);
  return out.length ? out : null;
}

/** Merge stored settings onto defaults, dropping anything unrecognised or invalid. */
function sanitizeSettings(raw) {
  const out = { ...DEFAULT_SETTINGS };
  if (raw && typeof raw === 'object') {
    for (const k of Object.keys(SETTING_SPEC)) {
      if (!(k in raw)) continue;
      const v = coerceSetting(k, raw[k]);
      if (v !== undefined) out[k] = v;
    }
  }
  out.bindings = sanitizeBindings(out.bindings);
  out.hudLayout = sanitizeHudLayout(out.hudLayout);
  out.musicFavorites = sanitizeFavorites(out.musicFavorites);
  return out;
}

function loadSettings() {
  try {
    const txt = store.get(SETTINGS_KEY);
    if (!txt) return { ...DEFAULT_SETTINGS };
    return sanitizeSettings(JSON.parse(txt));
  } catch (e) {
    console.warn('[save] settings unreadable; falling back to defaults', e);
    return { ...DEFAULT_SETTINGS };
  }
}

// The live settings object. Other modules keep a reference to it (`const s =
// Save.settings`), so it is mutated in place and never reassigned.
const settings = loadSettings();

// ---------------------------------------------------------------------------
// Save API
// ---------------------------------------------------------------------------

export const Save = {
  SAVE_VERSION,
  SLOT_COUNT,
  AUTOSAVE_SLOT,
  MANUAL_SLOTS,
  MIGRATIONS,
  SETTING_SPEC,
  DEFAULT_SETTINGS,

  /** True when writes actually survive a reload (false = private mode / storage off). */
  available: store.persistent,

  /** The live, mutable settings object. Edit it, then call Save.saveSettings(). */
  settings,

  // --- slots -------------------------------------------------------------

  /**
   * Write a GameState to a slot.
   * -> { ok, slot, bytes, meta, persisted, reason }
   * Never throws: a full quota or an unserialisable state returns ok:false.
   */
  write(slot, data, opts = {}) {
    if (!isSlot(slot)) return { ok: false, reason: 'bad-slot', slot };

    const meta = computeMeta(data, opts.meta || null);
    const env = {
      magic: MAGIC,
      version: SAVE_VERSION,
      savedAt: Number.isFinite(opts.savedAt) ? opts.savedAt : Date.now(),
      meta,
      data,
    };

    let text;
    try {
      text = JSON.stringify(env);
    } catch (e) {
      // Circular reference or a BigInt somewhere in the state.
      console.error('[save] state is not serialisable', e);
      return { ok: false, reason: 'serialize', slot, error: String(e && e.message || e) };
    }

    const res = store.set(slotKey(slot), text);
    metaCache.delete(slot);

    if (!res.ok) {
      bus.emit(EV.SAVE, { slot, ok: false, reason: res.reason, meta });
      return { ok: false, reason: res.reason, slot, bytes: text.length, meta, persisted: false };
    }

    // Remember the slot for the title screen's Continue entry.
    store.set(LAST_SLOT_KEY, String(slot));

    const out = {
      ok: true, slot, bytes: text.length, meta,
      persisted: res.reason !== 'memory',
      reason: res.reason,
    };
    bus.emit(EV.SAVE, { slot, ok: true, meta, bytes: text.length });
    return out;
  },

  /** Shorthand for the autosave slot. */
  autosave(data, opts) { return Save.write(AUTOSAVE_SLOT, data, opts); },

  /**
   * Read a slot's GameState, migrating it forward to SAVE_VERSION.
   * -> data object, or null when the slot is empty/corrupt/from a newer build.
   */
  read(slot) {
    if (!isSlot(slot)) return null;
    const env = cachedEnvelope(slot);
    if (!env || env.corrupt) return null;

    const mig = runMigrations(env.data, env.version);
    if (!mig.ok) {
      console.warn(`[save] slot ${slot}: cannot load (${mig.reason}, v${env.version} -> v${SAVE_VERSION})`);
      return null;
    }

    // A migrated save is rewritten so the upgrade is paid for once, not every load.
    if (mig.version !== env.version) {
      Save.write(slot, mig.data, { savedAt: env.savedAt });
    }
    store.set(LAST_SLOT_KEY, String(slot));
    bus.emit(EV.LOAD, { slot, meta: env.meta });
    return mig.data;
  },

  /** The whole envelope ({version, savedAt, meta, data}) — for inspectors/debug. */
  readRaw(slot) {
    if (!isSlot(slot)) return null;
    const env = cachedEnvelope(slot);
    return env && !env.corrupt ? env : null;
  },

  /** Just the header of a slot, or null when empty. Cheap: served from the cache. */
  meta(slot) {
    if (!isSlot(slot)) return null;
    const e = Save.list()[slot];
    return e && !e.empty ? e : null;
  },

  /**
   * Five entries (index === slot) describing every slot for the load menu.
   * Empty slots still return an object so the menu can draw the "- Empty -" card.
   */
  list() {
    const out = [];
    for (let slot = 0; slot < SLOT_COUNT; slot++) {
      const label = slot === AUTOSAVE_SLOT ? 'Autosave' : `Slot ${slot}`;
      const env = cachedEnvelope(slot);

      if (!env) {
        out.push({
          slot, label, empty: true, corrupt: false, future: false,
          ...EMPTY_META(), name: '', level: 0, partyNames: [],
          savedAt: 0, savedAtText: '', ago: '', playtimeText: '',
          version: 0, bytes: 0,
        });
        continue;
      }

      if (env.corrupt) {
        out.push({
          slot, label, empty: false, corrupt: true, future: false,
          ...EMPTY_META(), name: 'Corrupt Save', mapName: '—', level: 0,
          savedAt: 0, savedAtText: '', ago: '', playtimeText: '',
          version: 0, bytes: env.bytes || 0,
        });
        continue;
      }

      const meta = { ...EMPTY_META(), ...env.meta };
      out.push({
        slot, label, empty: false, corrupt: false,
        future: env.version > SAVE_VERSION,
        ...meta,
        partyNames: Array.isArray(meta.partyNames) ? meta.partyNames.slice() : [],
        savedAt: num(env.savedAt, 0),
        savedAtText: stampText(env.savedAt),
        ago: timeAgo(env.savedAt),
        playtimeText: playtimeText(num(meta.playtime, 0)),
        version: env.version,
        bytes: env.bytes || 0,
      });
    }
    return out;
  },

  /** Wipe a slot. -> bool (true even if it was already empty). */
  erase(slot) {
    if (!isSlot(slot)) return false;
    store.del(slotKey(slot));
    metaCache.delete(slot);
    bus.emit(EV.SAVE, { slot, ok: true, erased: true });
    return true;
  },

  /** Wipe every slot (settings survive). Used by the "delete all data" option. */
  eraseAll() {
    for (let i = 0; i < SLOT_COUNT; i++) { store.del(slotKey(i)); }
    store.del(LAST_SLOT_KEY);
    metaCache.clear();
    return true;
  },

  /** Copy one slot's contents onto another (e.g. autosave -> a manual slot). */
  copy(from, to) {
    if (!isSlot(from) || !isSlot(to) || from === to) return { ok: false, reason: 'bad-slot' };
    const env = Save.readRaw(from);
    if (!env) return { ok: false, reason: 'empty' };
    return Save.write(to, env.data, { savedAt: env.savedAt, meta: env.meta });
  },

  /** True when the slot holds anything at all (including a corrupt blob). */
  hasSlot(slot) { return isSlot(slot) && !!cachedEnvelope(slot); },

  /** Any save at all? Drives whether the title screen shows "Continue". */
  hasAny() {
    for (let i = 0; i < SLOT_COUNT; i++) if (Save.hasSlot(i)) return true;
    return false;
  },

  /** Most recently written non-corrupt slot, or -1. */
  newest() {
    let best = -1, bestAt = -1;
    for (let slot = 0; slot < SLOT_COUNT; slot++) {
      const env = cachedEnvelope(slot);
      if (!env || env.corrupt) continue;
      const at = num(env.savedAt, 0);
      if (at > bestAt) { bestAt = at; best = slot; }
    }
    return best;
  },

  /** The slot last written or read this session (or -1) — for Continue. */
  lastSlot() {
    const v = parseInt(store.get(LAST_SLOT_KEY), 10);
    if (isSlot(v) && Save.hasSlot(v)) return v;
    return Save.newest();
  },

  /** Drop the parsed-envelope cache (call after editing localStorage by hand). */
  refresh() { metaCache.clear(); },

  /** Rough footprint report for the options screen: { bytes, slots:[{slot,bytes}] }. */
  usage() {
    let bytes = 0;
    const slots = [];
    for (let i = 0; i < SLOT_COUNT; i++) {
      const t = store.get(slotKey(i));
      const b = t ? t.length : 0;
      slots.push({ slot: i, bytes: b });
      bytes += b;
    }
    const st = store.get(SETTINGS_KEY);
    bytes += st ? st.length : 0;
    return { bytes, slots, settingsBytes: st ? st.length : 0, persistent: store.persistent };
  },

  // --- export / import ---------------------------------------------------

  /**
   * Serialise a slot to a base64 string the player can paste anywhere.
   * -> string, or null when the slot is empty (or the host lacks btoa).
   */
  exportSlot(slot) {
    if (!isSlot(slot) || !hasB64) return null;
    const env = Save.readRaw(slot);
    if (!env) return null;
    try {
      const payload = JSON.stringify({
        magic: MAGIC,
        version: env.version,
        savedAt: env.savedAt,
        meta: env.meta,
        data: env.data,
      });
      return bytesToBase64(new TextEncoder().encode(payload));
    } catch (e) {
      console.error('[save] export failed', e);
      return null;
    }
  },

  /**
   * Import a base64 string (from exportSlot) into a slot, migrating as needed.
   * -> bool. The original savedAt is preserved so the load menu keeps its ordering.
   */
  importSlot(slot, str) {
    if (!isSlot(slot) || !hasB64 || typeof str !== 'string' || !str.trim()) return false;
    let env;
    try {
      const json = new TextDecoder().decode(base64ToBytes(str));
      env = JSON.parse(json);
    } catch (e) {
      console.warn('[save] import: not a valid save string', e);
      return false;
    }
    if (!env || typeof env !== 'object' || Array.isArray(env)) return false;
    if (env.magic && env.magic !== MAGIC) return false;      // some other game's blob

    // Accept a bare GameState too (someone pasted the inner object) as a convenience.
    const isEnvelope = !!env.data && typeof env.data === 'object' && !Array.isArray(env.data);
    const data = isEnvelope ? env.data : env;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
    // Sanity-gate a bare paste: it has to look like a GameState, not arbitrary JSON.
    if (!isEnvelope && !GAMESTATE_KEYS.some((k) => k in data)) return false;

    const version = isEnvelope && Number.isFinite(env.version) ? env.version : SAVE_VERSION;

    const mig = runMigrations(data, version);
    if (!mig.ok) {
      console.warn(`[save] import rejected (${mig.reason})`);
      return false;
    }
    const res = Save.write(slot, mig.data, {
      savedAt: isEnvelope && Number.isFinite(env.savedAt) ? env.savedAt : Date.now(),
    });
    return !!res.ok;
  },

  /** Peek at an export string without writing it: -> meta object or null. */
  inspectExport(str) {
    if (!hasB64 || typeof str !== 'string') return null;
    try {
      const env = JSON.parse(new TextDecoder().decode(base64ToBytes(str)));
      if (!env || typeof env !== 'object') return null;
      const data = ('data' in env) ? env.data : env;
      return {
        ...EMPTY_META(),
        ...(env.meta && typeof env.meta === 'object' ? env.meta : computeMeta(data)),
        version: Number.isFinite(env.version) ? env.version : 0,
        savedAt: num(env.savedAt, 0),
        savedAtText: stampText(env.savedAt),
      };
    } catch (_) {
      return null;
    }
  },

  // --- settings ----------------------------------------------------------

  /** Persist Save.settings. -> { ok, reason } (never throws). */
  saveSettings() {
    // Re-sanitise in place: the UI edits the live object directly, so a bad widget
    // value gets clamped here rather than poisoning the file.
    const clean = sanitizeSettings(settings);
    for (const k of Object.keys(settings)) if (!(k in clean)) delete settings[k];
    Object.assign(settings, clean);

    let res;
    try {
      res = store.set(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
      res = { ok: false, reason: 'error' };
    }
    bus.emit(EV_SETTINGS, settings);
    return res;
  },

  /** Set one option (validated) and persist. -> the value actually stored. */
  setSetting(key, value) {
    if (!(key in SETTING_SPEC)) return undefined;
    const v = key === 'bindings' ? sanitizeBindings(value) : coerceSetting(key, value);
    settings[key] = v;
    Save.saveSettings();
    return v;
  },

  getSetting(key, fallback) {
    return (key in settings) ? settings[key] : (fallback !== undefined ? fallback : DEFAULT_SETTINGS[key]);
  },

  /** Step an enum/range option to its next value — the arrow keys in OptionsScene. */
  cycleSetting(key, dir = 1) {
    const spec = SETTING_SPEC[key];
    if (!spec) return undefined;
    if (spec.kind === 'bool') return Save.setSetting(key, !settings[key]);
    if (spec.kind === 'range') {
      const step = spec.step || 0.05;
      // Snap to the step grid and round off binary-float dust (0.8500000000000001).
      const raw = Math.round((num(settings[key], spec.def) + step * dir) / step) * step;
      return Save.setSetting(key, Math.round(raw * 1000) / 1000);
    }
    if (spec.kind === 'enum') {
      const n = spec.options.length;
      const i = Math.max(0, spec.options.indexOf(settings[key]));
      return Save.setSetting(key, spec.options[(((i + dir) % n) + n) % n]);
    }
    return settings[key];
  },

  /** Restore factory settings (mutating the live object so references stay valid). */
  resetSettings() {
    for (const k of Object.keys(settings)) delete settings[k];
    Object.assign(settings, DEFAULT_SETTINGS);
    Save.saveSettings();
    return settings;
  },

  /** Typewriter speed in characters/second; Infinity means "print it all at once". */
  textSpeedCps() {
    const v = TEXT_SPEED_CPS[settings.textSpeed];
    return Number.isFinite(v) || v === Infinity ? v : TEXT_SPEED_CPS.normal;
  },

  /** Effective volumes after the mute toggle — hand straight to Audio.setVolume(). */
  volumes() {
    const m = settings.muted ? 0 : 1;
    return {
      master: clamp(num(settings.volMaster, 0.8), 0, 1) * m,
      music: clamp(num(settings.volMusic, 0.6), 0, 1),
      sfx: clamp(num(settings.volSfx, 0.8), 0, 1),
    };
  },
};

export default Save;
