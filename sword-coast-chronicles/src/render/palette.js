// render/palette.js — the shared colour language: hue-shifted ramps every artist module draws from.
//
// Good pixel art does not shade by darkening a colour toward black. Shadows turn
// COOL (toward blue-violet) and lose a little saturation; highlights turn WARM
// (toward yellow) and lose a little more; the most saturated step sits in the
// midtones. That one rule is most of what separates a GBA-era sprite from a
// programmer's rectangle, and it is what makes tiles, characters, monsters and
// spell effects look as if one person painted them.
//
//   ramp('#5a8a3a', 5)        -> 5 hex colours, darkest first, base in the middle
//   RAMPS.grass[2]            -> a named material ramp (index 0 = deepest shadow)
//   shadeStep(RAMPS.stone, 2, -1)  -> one step darker on the same ramp, clamped
//
// The light in this world comes from the UPPER LEFT, always (tiles.js, actor.js
// and the sun-shadow pass all assume it). Ramps are colour only; direction is
// the artist's job.
//
// No imports: data-like, safe to use from any render or UI module.

// --- colour space helpers (HSL is enough for ramp work) -------------------

function hexToRgb(hex) {
  let h = String(hex || '#000').replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h.slice(0, 6), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r, g, b) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function hexToHsl(hex) {
  const [r0, g0, b0] = hexToRgb(hex);
  const r = r0 / 255, g = g0 / 255, b = b0 / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

export function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360; s = Math.max(0, Math.min(1, s)); l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

/** Move hue `h` toward `target` by up to `amt` degrees along the short way round. */
function hueToward(h, target, amt) {
  let d = ((target - h + 540) % 360) - 180;
  if (Math.abs(d) < amt) return target;
  return h + Math.sign(d) * amt;
}

const COOL = 245;   // shadows drift toward blue-violet
const WARM = 55;    // highlights drift toward yellow

/**
 * A hue-shifted ramp of `steps` colours around `base`, darkest first.
 *   opts.spread  total lightness span (default 0.52)
 *   opts.shift   degrees of hue drift at the extremes (default 22)
 *   opts.desat   saturation lost at the extremes (default 0.18)
 *   opts.at      index the base colour lands on (default the middle)
 * Greys (saturation < 0.06) still shift, gently — a cold shadow and a warm
 * light make stone read as lit rather than as grey paint.
 */
export function ramp(base, steps = 5, opts = {}) {
  const { spread = 0.52, shift = 22, desat = 0.18 } = opts;
  const at = opts.at != null ? opts.at : Math.floor((steps - 1) / 2);
  const [h, s, l] = hexToHsl(base);
  const chroma = s * (1 - Math.abs(2 * l - 1));   // HSL saturation overstates pale colours
  const out = [];
  for (let i = 0; i < steps; i++) {
    const k = steps === 1 ? 0 : (i - at) / Math.max(at, steps - 1 - at);   // -1 .. 1
    const lt = Math.min(0.95, Math.max(0.04, l + k * spread / 2));
    if (chroma < 0.05) {
      // Near-greys have no hue worth rotating (and rotating a faint yellow toward
      // blue goes the long way round, through olive). Tint them outright: a whisper
      // of blue-violet in the shadows, of warm straw in the light.
      const tint = Math.abs(k) * 0.12;
      const hh = k < 0 ? COOL - 20 : k > 0 ? WARM - 10 : h;
      out.push(k === 0 ? base : hslToHex(hh, Math.max(s * 0.5, tint), lt));
      continue;
    }
    // Pale, weakly-saturated colours (plaster, parchment, bone) shift less, or
    // their shadows turn pink on the way from yellow to blue.
    const hs = shift * Math.min(1, chroma / 0.3);
    const hh = k < 0 ? hueToward(h, COOL, -k * hs) : hueToward(h, WARM, k * hs);
    const ss = s * (1 - Math.abs(k) * desat) + (k === 0 ? 0 : 0.02);
    out.push(hslToHex(hh, ss, lt));
  }
  return out;
}

/** One step along a ramp from index `i`, clamped to its ends. */
export function shadeStep(r, i, delta) {
  return r[Math.max(0, Math.min(r.length - 1, i + delta))];
}

/** Blend two hex colours; t=0 -> a. */
export function mix(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}

/**
 * The outline colour for a fill: never pure black. A dark, saturated, cool
 * version of the neighbouring colour ("selective outline"), so a green tunic is
 * edged in deep green-blue and a face in deep red-brown.
 */
export function outlineFor(fill, strength = 1) {
  const [h, s, l] = hexToHsl(fill);
  return hslToHex(hueToward(h, COOL, 18 * strength), Math.min(1, s * 0.9 + 0.1), Math.max(0.05, l * (0.32 - 0.1 * (strength - 1))));
}

// --- the world's named material ramps (5 steps, index 0 = deepest shadow) --
// Tuned for the Sword Coast: temperate, slightly weathered, warm light.

const R5 = (hex, o) => Object.freeze(ramp(hex, 5, o));

export const RAMPS = Object.freeze({
  // ground
  grass:     R5('#5f9a3c'),
  grassDry:  R5('#9aa04a', { shift: 16 }),
  moss:      R5('#4a7a3a'),
  foliage:   R5('#3f7a34', { spread: 0.56 }),
  pine:      R5('#2f5f3e', { spread: 0.5 }),
  dirt:      R5('#8a6440', { shift: 18 }),
  mud:       R5('#5f4a36', { shift: 14 }),
  sand:      R5('#d8bf84', { shift: 14, spread: 0.44 }),
  snow:      R5('#e4ecf2', { spread: 0.34, shift: 26 }),
  // stone and building
  stone:     R5('#8a8a88'),
  cobble:    R5('#7c7670'),
  slate:     R5('#5a6272'),
  granite:   R5('#9a928a'),
  plaster:   R5('#e2d6b8', { spread: 0.4 }),
  brick:     R5('#a4553e'),
  thatch:    R5('#c49a4a', { shift: 16 }),
  roofTile:  R5('#b0503a'),
  wood:      R5('#8a5a34', { shift: 16 }),
  woodDark:  R5('#5a3a26', { shift: 14 }),
  // water and sky
  water:     R5('#3a78a8', { shift: 14 }),
  shallows:  R5('#5aa8b8', { shift: 12 }),
  swamp:     R5('#4a6a4a'),
  sky:       R5('#8ab8e0', { spread: 0.4 }),
  dusk:      R5('#b0607a', { shift: 26 }),
  // people
  skinPale:  R5('#f0c8a0', { spread: 0.42, shift: 14 }),
  skinFair:  R5('#e0ac80', { spread: 0.44, shift: 14 }),
  skinTan:   R5('#c08858', { spread: 0.46, shift: 14 }),
  skinBrown: R5('#8a5a3a', { spread: 0.46, shift: 14 }),
  skinDeep:  R5('#5a3a2a', { spread: 0.42, shift: 12 }),
  // materials
  iron:      R5('#7a808a', { spread: 0.6 }),
  steel:     R5('#a8b0bc', { spread: 0.6 }),
  gold:      R5('#d4a032', { spread: 0.56, shift: 18 }),
  bronze:    R5('#a8703a', { spread: 0.56 }),
  leather:   R5('#7a4a2a', { shift: 16 }),
  bone:      R5('#d8ccaa', { spread: 0.44 }),
  // dyes a Realms tailor would actually have
  red:       R5('#a8322e'),
  madder:    R5('#b8503a'),
  woad:      R5('#3a5a9a'),
  green:     R5('#3a7a44'),
  ochre:     R5('#c08a2a'),
  purple:    R5('#6a3a7a'),
  black:     R5('#2e2a34', { spread: 0.34 }),
  undyed:    R5('#c8b894', { spread: 0.42 }),
  // magic — the damage types, so spell FX, UI chips and tiles agree
  fire:      R5('#f07a2a', { spread: 0.64, shift: 28 }),
  cold:      R5('#8ad0f0', { spread: 0.56 }),
  lightning: R5('#e8e070', { spread: 0.6 }),
  thunder:   R5('#a0a8f0'),
  acid:      R5('#8ad040'),
  poison:    R5('#6aa040'),
  necrotic:  R5('#6a4a8a', { spread: 0.56 }),
  radiant:   R5('#f8e08a', { spread: 0.5, shift: 18 }),
  psychic:   R5('#d070c0'),
  force:     R5('#7a8af0'),
  arcane:    R5('#a070f0', { spread: 0.6 }),
  healing:   R5('#70e0a0'),
  blood:     R5('#9a1e1e'),
});

/** The ramp for a damage type or magic school, with a sane default. */
export function magicRamp(kind) {
  return RAMPS[kind] || RAMPS.arcane;
}

/**
 * UI ink, shared with ui/kit.js. Parchment-and-iron: dark warm panels, gold
 * trim, parchment text. Kept here so world-anchored labels (damage numbers,
 * name plates) use the same inks as the HUD.
 */
export const INK = Object.freeze({
  text: '#efe6d0', dim: '#9a917f', faint: '#6a6258',
  gold: '#e3b34a', goldHi: '#f6d77a', goldLo: '#8a6424',
  panel: '#15121a', panelHi: '#241e28', edge: '#3a2c1c',
  hp: '#c8452f', hpHi: '#ec7a5a', mp: '#4a7ad0', xp: '#e3b34a',
  good: '#6fc36a', bad: '#d4553f', warn: '#e8a23a', info: '#6aa8e8',
});

export default { ramp, shadeStep, mix, outlineFor, RAMPS, magicRamp, INK, hexToHsl, hslToHex };
