// constants.js — shared runtime constants for Sword Coast Chronicles.

export const TITLE = 'Sword Coast Chronicles';
export const VERSION = '1.1.0';
export const YEAR_DR = 1496;

// --- geometry -------------------------------------------------------------
export const TILE = 16;        // pixels per tile; one tile = 5 feet
export const VIEW_W = 400;     // logical canvas width  (25 tiles)
export const VIEW_H = 240;     // logical canvas height (15 tiles)
export const SPRITE_W = 16;    // humanoid sprite width
export const SPRITE_H = 24;    // humanoid sprite height (feet at tile bottom)
export const FEET_PER_TILE = 5;

export const DIRS = ['down', 'left', 'right', 'up'];
export const DIR_VEC = {
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
};
export const DIR_INDEX = { down: 0, left: 1, right: 2, up: 3 };

/** Turn a delta into a facing name. Ties resolve to the larger absolute axis. */
export function dirFrom(dx, dy) {
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

export function oppositeDir(d) {
  return { up: 'down', down: 'up', left: 'right', right: 'left' }[d] || 'down';
}

// --- timing ---------------------------------------------------------------
export const WALK_TIME = 0.16;   // seconds to cross one tile walking
export const RUN_TIME = 0.09;    // seconds to cross one tile running
export const MAX_DT = 0.05;      // frame delta clamp
export const MINUTES_PER_SECOND = 4; // in-game clock speed on the overworld

// --- party / rules --------------------------------------------------------
export const PARTY_MAX = 4;
export const RESERVE_MAX = 8;
export const MAX_LEVEL = 20;
export const MAX_ABILITY = 20;
export const MAX_ABILITY_EPIC = 30;

// --- damage types ---------------------------------------------------------
export const DAMAGE_TYPES = [
  'slashing', 'piercing', 'bludgeoning',
  'fire', 'cold', 'lightning', 'thunder', 'acid', 'poison',
  'necrotic', 'radiant', 'psychic', 'force',
];
export const PHYSICAL_TYPES = ['slashing', 'piercing', 'bludgeoning'];

// --- creature sizes -------------------------------------------------------
export const SIZES = {
  tiny: { id: 'tiny', name: 'Tiny', tiles: 1, scale: 0.6, space: 2.5, carry: 0.5 },
  small: { id: 'small', name: 'Small', tiles: 1, scale: 0.85, space: 5, carry: 1 },
  medium: { id: 'medium', name: 'Medium', tiles: 1, scale: 1, space: 5, carry: 1 },
  large: { id: 'large', name: 'Large', tiles: 2, scale: 1.5, space: 10, carry: 2 },
  huge: { id: 'huge', name: 'Huge', tiles: 3, scale: 2.1, space: 15, carry: 4 },
  gargantuan: { id: 'gargantuan', name: 'Gargantuan', tiles: 4, scale: 2.8, space: 20, carry: 8 },
};

// --- equipment slots ------------------------------------------------------
export const EQUIP_SLOTS = [
  'mainHand', 'offHand', 'armor', 'helm', 'cloak',
  'boots', 'gloves', 'amulet', 'ring1', 'ring2', 'ammo',
];
export const SLOT_NAMES = {
  mainHand: 'Main Hand', offHand: 'Off Hand', armor: 'Armor', helm: 'Head',
  cloak: 'Back', boots: 'Feet', gloves: 'Hands', amulet: 'Neck',
  ring1: 'Ring I', ring2: 'Ring II', ammo: 'Ammunition',
};

// --- biomes ---------------------------------------------------------------
export const BIOMES = [
  'road', 'plains', 'forest', 'pine-forest', 'hills', 'mountain', 'marsh',
  'coast', 'ruins', 'cave', 'dungeon', 'crypt', 'mine', 'ash-waste',
  'tundra', 'underdark', 'city',
];

// --- rarity ---------------------------------------------------------------
export const RARITY = {
  common: { name: 'Common', color: '#cfc3a4', mult: 1 },
  uncommon: { name: 'Uncommon', color: '#5fd07a', mult: 6 },
  rare: { name: 'Rare', color: '#5aa8ff', mult: 30 },
  'very-rare': { name: 'Very Rare', color: '#c07af0', mult: 120 },
  legendary: { name: 'Legendary', color: '#ffb03a', mult: 500 },
  artifact: { name: 'Artifact', color: '#ff5f4f', mult: 0 },
};

// --- misc helpers ---------------------------------------------------------
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const approach = (a, b, step) => (a < b ? Math.min(a + step, b) : Math.max(a - step, b));
export const sign = (n) => (n > 0 ? 1 : n < 0 ? -1 : 0);
export const key = (x, y) => `${x},${y}`;
export const titleCase = (s) => String(s).replace(/(^|[\s-])(\w)/g, (m, a, b) => a + b.toUpperCase());
export const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + 's'}`;
export const signed = (n) => (n >= 0 ? `+${n}` : `${n}`);

/** Ordinal spell/level suffix: 1st, 2nd, 3rd, 4th... */
export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** Format a CR the way a stat block does. */
export function crText(cr) {
  if (cr === 0.125) return '1/8';
  if (cr === 0.25) return '1/4';
  if (cr === 0.5) return '1/2';
  return String(cr);
}

/** Seconds -> "1:04:22" for the save menu. */
export function playtimeText(sec) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

/** In-game clock: minutes since midnight -> "6:42 am". */
export function clockText(minutes) {
  const m = ((minutes % 1440) + 1440) % 1440;
  let h = Math.floor(m / 60); const mm = String(Math.floor(m % 60)).padStart(2, '0');
  const ap = h < 12 ? 'am' : 'pm';
  h = h % 12; if (h === 0) h = 12;
  return `${h}:${mm} ${ap}`;
}

export const TIME_OF_DAY = [
  { id: 'night', from: 0, to: 300, name: 'Night' },
  { id: 'dawn', from: 300, to: 420, name: 'Dawn' },
  { id: 'morning', from: 420, to: 720, name: 'Morning' },
  { id: 'afternoon', from: 720, to: 1020, name: 'Afternoon' },
  { id: 'dusk', from: 1020, to: 1200, name: 'Dusk' },
  { id: 'night2', from: 1200, to: 1440, name: 'Night' },
];

export function timeOfDay(minutes) {
  const m = ((minutes % 1440) + 1440) % 1440;
  for (const t of TIME_OF_DAY) if (m >= t.from && m < t.to) return t.id === 'night2' ? 'night' : t.id;
  return 'night';
}

/** Calendar of Harptos — the Realms' months. */
export const MONTHS = [
  'Hammer', 'Alturiak', 'Ches', 'Tarsakh', 'Mirtul', 'Kythorn',
  'Flamerule', 'Eleasis', 'Eleint', 'Marpenoth', 'Uktar', 'Nightal',
];
export const MONTH_NICKNAMES = {
  Hammer: 'Deepwinter', Alturiak: 'The Claw of Winter', Ches: 'The Claw of Sunsets',
  Tarsakh: 'The Claw of Storms', Mirtul: 'The Melting', Kythorn: 'The Time of Flowers',
  Flamerule: 'Summertide', Eleasis: 'Highsun', Eleint: 'The Fading',
  Marpenoth: 'Leaffall', Uktar: 'The Rotting', Nightal: 'The Drawing Down',
};

/** Day number (1-based) -> "12 Mirtul, 1496 DR". */
export function dateText(day) {
  const d = ((day - 1) % 360 + 360) % 360;
  const month = MONTHS[Math.floor(d / 30)];
  const year = YEAR_DR + Math.floor((day - 1) / 360);
  return `${(d % 30) + 1} ${month}, ${year} DR`;
}
