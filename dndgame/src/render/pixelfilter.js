// render/pixelfilter.js — the player's display filters: colour lookup tables applied to the world picture.
//
// Settings > Display > Pixel Filter recolours the WORLD (never the interface)
// once per frame, at world resolution, after every world layer is composited.
// Each filter is a function of one colour, baked into a 64-level-per-channel
// lookup table the first time it is chosen, so a frame costs one table read
// per world pixel whatever the filter does — a colour grade or a full palette
// remap cost the same. Colour-only: no pixel ever blurs or moves.
//
//   warm      late-afternoon sun through a scriptorium window: gilded
//             highlights, shadows kept cool so the light has somewhere to fall
//   tapestry  the world rewoven in a dyer's palette — madder, weld, woad,
//             walnut and undyed wool — every colour taking the dye of its
//             nearest thread, keeping most of its own light and shade
//   gloom     an overcast Sword Coast day: drained, cooler, heavier shadows
//   vivid     fresh-painted gilt and lapis: richer colour, firmer contrast

const clamp8 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
const lumOf = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Push a colour away from (k > 1) or toward (k < 1) its own grey. */
function saturate(r, g, b, k) {
  const l = lumOf(r, g, b);
  return [l + (r - l) * k, l + (g - l) * k, l + (b - l) * k];
}

// The tapestry's threads. Chosen from the dyes a Sword Coast weaver had — the
// madder reds, weld yellows and woad blues of the real medieval dye-pot, weld
// over woad for the greens, orchil purples, the browns of walnut hull and oak
// gall, undyed wool from cream to fleece-grey — with enough dark shades that a
// night street still reads.
const THREADS = [
  // undyed wool and linen
  '#efe4c8', '#d6c6a0', '#b9a37c', '#8e8878', '#6b5541', '#46362a', '#261c18', '#120e0e',
  // madder
  '#e3a78c', '#c7614f', '#9e3a2e', '#6a2322', '#a8583a',
  // weld
  '#e9d58a', '#cdb04c', '#a08530', '#7a5f2a',
  // woad and indigo
  '#b3c4cc', '#7896ae', '#4a6487', '#2d3d5e', '#1a2338',
  // weld over woad
  '#a9b47f', '#7e9150', '#5a7336', '#3e5528', '#28391c', '#172412',
  // orchil
  '#8a6282', '#5c3f5b', '#3a2940',
  // walnut and oak gall
  '#a07a52', '#8a6a4a', '#5e4630',
  // fleece greys
  '#a9a69c', '#767470', '#4c4b4d',
].map((h) => oklab(parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)));

// OKLab (Ottosson 2020): a perceptual space where equal distances look equal,
// so "the nearest thread" is the one a weaver would actually have reached for.
function lin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }
function gam(c) { return 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055); }
function oklab(r, g, b) {
  r = lin(r); g = lin(g); b = lin(b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
function fromOklab(L, A, B) {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [gam(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    gam(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    gam(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)];
}

const GRADES = {
  warm(r, g, b) {
    const l = lumOf(r, g, b) / 255;
    const sun = smooth(0.18, 0.95, l);           // the light lands on what is lit
    const shade = (1 - l) * (1 - l);
    [r, g, b] = saturate(r, g, b, 1.1);
    return [r * 1.02 + 22 * sun - 3 * shade, g + 9 * sun - 2 * shade, b * 0.9 - 12 * sun + 7 * shade];
  },
  gloom(r, g, b) {
    [r, g, b] = saturate(r, g, b, 0.62);
    const l = lumOf(r, g, b) / 255;
    // A toe on the curve: the darks sink, the lights barely move.
    const k = 0.8 + 0.2 * smooth(0.1, 0.85, l);
    return [r * k * 0.93, g * k * 0.97, b * k * 1.05 + 5];
  },
  vivid(r, g, b) {
    [r, g, b] = saturate(r, g, b, 1.28);
    const c = (v) => 128 + (v - 128) * 1.07;
    const l = lumOf(r, g, b) / 255;
    return [c(r) + 5 * l, c(g) + 2 * l, c(b) - 2 * l];
  },
  tapestry(r, g, b) {
    // The hue and strength of the colour choose the thread; the shading is
    // mostly kept, because a woven picture still has its light and shade — it
    // just has them in fewer dyes. Lightness counts for less than colour in the
    // choice, so a shadowed wall stays the wall's dye, only darker.
    // The colour is pushed a third stronger before it is matched, so a sun-faded
    // roof still finds the madder it was dyed with rather than a brown.
    const [L, A, B] = oklab(r, g, b);
    const qa = A * 1.35, qb = B * 1.35;
    let best = THREADS[0], bd = Infinity;
    for (const t of THREADS) {
      const dl = (L - t[0]) * 0.55, da = qa - t[1], db = qb - t[2];
      const d = dl * dl + da * da + db * db;
      if (d < bd) { bd = d; best = t; }
    }
    return fromOklab(best[0] * 0.55 + L * 0.45, best[1], best[2]);
  },
};

export const PIXEL_FILTERS = Object.freeze(['none', ...Object.keys(GRADES)]);

const LE = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
const cache = new Map();

/** The 64x64x64 table for filter `name`, or null for 'none' / an unknown name. */
export function lutFor(name) {
  const f = GRADES[name];
  if (!f) return null;
  let lut = cache.get(name);
  if (lut) return lut;
  lut = new Uint32Array(64 * 64 * 64);
  const lev = (i) => (i << 2) | (i >> 4);          // 6 bits back to 0..255
  for (let ri = 0; ri < 64; ri++) {
    for (let gi = 0; gi < 64; gi++) {
      for (let bi = 0; bi < 64; bi++) {
        const [r, g, b] = f(lev(ri), lev(gi), lev(bi));
        const R = Math.round(clamp8(r)), G = Math.round(clamp8(g)), B = Math.round(clamp8(b));
        lut[(ri << 12) | (gi << 6) | bi] = LE
          ? ((255 << 24) | (B << 16) | (G << 8) | R) >>> 0
          : ((R << 24) | (G << 16) | (B << 8) | 255) >>> 0;
      }
    }
  }
  cache.set(name, lut);
  return lut;
}

/**
 * Recolour opaque RGBA pixels (a Uint32 view of ImageData) through `lut`, in
 * place. The table is indexed by the top 6 bits of each channel; the 2 bits it
 * drops are added back to the result, so a smooth grade stays smooth across a
 * lantern's falloff instead of stepping in bands of four levels.
 */
export function applyLut(px, lut) {
  const n = px.length;
  if (LE) {
    for (let i = 0; i < n; i++) {
      const p = px[i];
      const r = p & 255, g = (p >>> 8) & 255, b = (p >>> 16) & 255;
      const q = lut[((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2)];
      // lev() rebuilt the cell's colour as (v & 0xfc) | (v >> 6); the rest is v's own.
      let R = (q & 255) + (r & 3) - (r >> 6);
      let G = ((q >>> 8) & 255) + (g & 3) - (g >> 6);
      let B = ((q >>> 16) & 255) + (b & 3) - (b >> 6);
      R = R < 0 ? 0 : R > 255 ? 255 : R;
      G = G < 0 ? 0 : G > 255 ? 255 : G;
      B = B < 0 ? 0 : B > 255 ? 255 : B;
      px[i] = ((255 << 24) | (B << 16) | (G << 8) | R) >>> 0;
    }
  } else {
    for (let i = 0; i < n; i++) {
      const p = px[i];
      px[i] = lut[((p >>> 26) << 12) | (((p >>> 18) & 0x3f) << 6) | ((p >>> 10) & 0x3f)];
    }
  }
}
