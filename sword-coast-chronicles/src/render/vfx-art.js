// render/vfx-art.js — the PixelForge frame animations spell effects play, drawn by time at any zoom.
//
// The art is authored in assets/pixel/vfx/*.pxa and compiled by tools/pxbuild.mjs
// into src/render/art/<id>.js, which register themselves with render/sprites.js.
// This module only knows which sprite plays which effect, how long each lasts
// (from the authored `dur=` of every frame, not a fixed fps), and how to put a
// frame on screen at its anchor, scaled by whole pixels so a close-zoom battle
// keeps the world's pixel density.
//
//   drawArt(ctx, 'fireball', 'fire', t, x, y, zoom)   -> false once the animation is over
//   artMs('fireball')                                  -> 780
//
// Every recoloured variant (`<sprite>-cold`, `-necrotic` ...) comes from the
// .pxa's `@recolor ... magic` line, so one drawing serves every damage type.

import { getSprite, spriteDef, hasSprite } from './sprites.js';
import './art/fx-impact-burst.js';
import './art/vfx-fireball.js';
import './art/vfx-lightning.js';
import './art/vfx-smite.js';
import './art/vfx-sigil.js';

/** Effect id -> the sprite and the animation it plays. */
const ART = Object.freeze({
  burst: { sprite: 'fx-impact-burst', anim: 'burst' },
  fireball: { sprite: 'vfx-fireball', anim: 'boom' },
  lightning: { sprite: 'vfx-lightning', anim: 'strike' },
  smite: { sprite: 'vfx-smite', anim: 'smite' },
  sigil: { sprite: 'vfx-sigil', anim: 'draw' },
});

// Per effect id: the frame sequence with cumulative end times in seconds.
const timing = new Map();

function timeline(id) {
  let tl = timing.get(id);
  if (tl !== undefined) return tl;
  tl = null;
  const a = ART[id];
  const def = a && spriteDef(a.sprite);
  const an = def && def.anims && def.anims[a.anim];
  if (an) {
    const seq = an.seq || an.frames;
    const dur = an.durations || seq.map(() => 1000 / (an.fps || 10));
    const ends = [];
    let acc = 0;
    for (let i = 0; i < seq.length; i++) { acc += dur[i] / 1000; ends.push(acc); }
    tl = { seq, ends, total: acc, def, sprite: a.sprite };
  }
  timing.set(id, tl);
  return tl;
}

export function hasArt(id) { return !!timeline(id); }

/** Length of an effect's animation in ms (0 when the art is missing). */
export function artMs(id) {
  const tl = timeline(id);
  return tl ? Math.round(tl.total * 1000) : 0;
}

/** The frame name showing at time t (seconds), or null once it is over. */
export function artFrame(id, t) {
  const tl = timeline(id);
  if (!tl || t < 0 || t >= tl.total) return null;
  for (let i = 0; i < tl.ends.length; i++) if (t < tl.ends[i]) return tl.seq[i];
  return null;
}

/**
 * Draw effect `id` recoloured for `kind` at time t with its anchor on the
 * whole-pixel screen point (x, y), each art pixel `u` screen pixels square.
 * Returns false when there is nothing (left) to draw.
 */
export function drawArt(ctx, id, kind, t, x, y, u = 1, opts) {
  const tl = timeline(id);
  if (!tl) return false;
  const frame = artFrame(id, t);
  if (!frame) return false;
  const name = kind && hasSprite(`${tl.sprite}-${kind}`) ? `${tl.sprite}-${kind}` : tl.sprite;
  const img = getSprite(name, frame);
  if (!img) return false;
  const def = tl.def;
  const flip = opts && opts.flip;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (opts && opts.alpha != null) ctx.globalAlpha *= opts.alpha;
  if (flip) {
    ctx.translate(x + (def.anchor.x) * u, y - def.anchor.y * u);
    ctx.scale(-1, 1);
    ctx.drawImage(img, 0, 0, def.w, def.h, 0, 0, def.w * u, def.h * u);
  } else {
    ctx.drawImage(img, 0, 0, def.w, def.h, x - def.anchor.x * u, y - def.anchor.y * u, def.w * u, def.h * u);
  }
  ctx.restore();
  return true;
}

/** The authored size and anchor of an effect's art ({ w, h, ax, ay }), or null. */
export function artBox(id) {
  const tl = timeline(id);
  return tl ? { w: tl.def.w, h: tl.def.h, ax: tl.def.anchor.x, ay: tl.def.anchor.y } : null;
}

export default { drawArt, artMs, artFrame, hasArt, artBox };
