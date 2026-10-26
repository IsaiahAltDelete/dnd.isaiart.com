// tools/px/shim.mjs — the smallest Canvas2D the tileset actually uses.
// render/tiles.js only ever touches fillStyle / fillRect / imageSmoothingEnabled
// and drawImage(canvas, x, y), so that is all this provides. Import it BEFORE
// anything that imports render/tiles.js: ESM evaluates in import order, and
// makeCanvas() bails out when `document` is undefined.

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const RGBA = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/;

function parse(col) {
  if (typeof col !== 'string') return [255, 0, 255, 1];
  const h = HEX.exec(col);
  if (h) {
    let s = h[1];
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16), 1];
  }
  const m = RGBA.exec(col);
  if (m) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]];
  return [255, 0, 255, 1];
}

class Ctx {
  constructor(cv) { this.cv = cv; this._fill = '#000000'; this._rgba = [0, 0, 0, 1]; this.imageSmoothingEnabled = false; }
  get fillStyle() { return this._fill; }
  set fillStyle(v) { if (v !== this._fill) { this._fill = v; this._rgba = parse(v); } }
  fillRect(x, y, w, h) {
    const cv = this.cv, d = cv.data;
    const [r, g, b, a] = this._rgba;
    let x0 = Math.max(0, x | 0), y0 = Math.max(0, y | 0);
    let x1 = Math.min(cv.width, (x | 0) + (w | 0)), y1 = Math.min(cv.height, (y | 0) + (h | 0));
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) {
        const i = (yy * cv.width + xx) * 4;
        if (a >= 1) { d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255; }
        else {
          const na = a + (d[i + 3] / 255) * (1 - a);
          d[i] = Math.round(r * a + d[i] * (1 - a));
          d[i + 1] = Math.round(g * a + d[i + 1] * (1 - a));
          d[i + 2] = Math.round(b * a + d[i + 2] * (1 - a));
          d[i + 3] = Math.round(na * 255);
        }
      }
    }
  }
  clearRect(x, y, w, h) {
    const cv = this.cv, d = cv.data;
    const x0 = Math.max(0, x | 0), y0 = Math.max(0, y | 0);
    const x1 = Math.min(cv.width, (x | 0) + (w | 0)), y1 = Math.min(cv.height, (y | 0) + (h | 0));
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const i = (yy * cv.width + xx) * 4; d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 0; }
  }
  drawImage(src, dx, dy) {
    const cv = this.cv, d = cv.data, s = src.data;
    for (let yy = 0; yy < src.height; yy++) {
      const ty = (dy | 0) + yy; if (ty < 0 || ty >= cv.height) continue;
      for (let xx = 0; xx < src.width; xx++) {
        const tx = (dx | 0) + xx; if (tx < 0 || tx >= cv.width) continue;
        const si = (yy * src.width + xx) * 4, di = (ty * cv.width + tx) * 4;
        const a = s[si + 3] / 255;
        if (a <= 0) continue;
        if (a >= 1) { d[di] = s[si]; d[di + 1] = s[si + 1]; d[di + 2] = s[si + 2]; d[di + 3] = 255; }
        else {
          d[di] = Math.round(s[si] * a + d[di] * (1 - a));
          d[di + 1] = Math.round(s[si + 1] * a + d[di + 1] * (1 - a));
          d[di + 2] = Math.round(s[si + 2] * a + d[di + 2] * (1 - a));
          d[di + 3] = Math.max(d[di + 3], s[si + 3]);
        }
      }
    }
  }
}

export class Canvas {
  constructor() { this.width = 0; this.height = 0; this.data = null; this._ctx = null; }
  getContext() { if (!this.data) { this.data = new Uint8ClampedArray(this.width * this.height * 4); this._ctx = new Ctx(this); } return this._ctx; }
}

export function makeCanvas(w, h) { const cv = new Canvas(); cv.width = w; cv.height = h; cv.getContext(); return cv; }

if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    createElement(tag) {
      if (tag !== 'canvas') throw new Error(`shim: no <${tag}>`);
      return new Canvas();
    },
  };
}
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
