// render/actor.js — turns a Character into a drawable sprite by stacking the
// body / ears / hair / outfit / cloak / helm / weapon layers and recolouring each
// from the character's colorway. The composited result is cached by a signature,
// so a character costs one drawImage per frame no matter how many layers it has.

import { composeSprite, drawComposed, drawSprite, hasSprite, makeColorway, spriteDef } from './sprites.js';
import { monsterArtFor } from './spritedata_monsters.js';
import { weaponSprite, weaponAnimationKind } from './weapon-art.js';
import { SPRITE_W, SPRITE_H, DIRS } from '../constants.js';
import { hashStr } from '../core/rng.js';
import { resolveItem } from '../data/items.js';
import { SPECIES } from '../data/species.js';
import { BODY_ARMS, npcBody, npcLook } from './spritedata_chars.js';
import { drawPortrait } from './portrait.js';

export { drawPortrait };

/** Fit the resolved creature art, including its tint, into small UI frames. */
export function drawCreaturePortrait(ctx,ch,x,y,w,h=w) {
  if(!ch?.monsterId)return false;
  const art=monsterArtFor(ch.monsterId,ch.sprite),def=art&&spriteDef(art.sprite);
  if(!def)return false;
  const fit=Math.min((w-2)/def.w,(h-2)/def.h);
  return drawSprite(ctx,art.sprite,'left-0',x+w/2,y+(h+def.h*fit)/2,
    {scale:fit,shadow:false,colorway:art.colorway,tint:art.tint,tintAmt:art.tintAmt});
}

// Draw order, back to front. Cloaks go behind the body; hair behind a helm.
const ORDER = ['cloak', 'tail', 'body', 'boots', 'ears', 'face', 'hair', 'beard', 'outfit', 'horns', 'helm', 'shield', 'weapon'];

/**
 * The species sprite flags for a character, lineage overriding species.
 * Read from the data rather than the saved appearance so a character rolled
 * before these layers existed still grows their tusks.
 */
function speciesMods(ch) {
  const sp = SPECIES?.[ch.speciesId];
  if (!sp) return {};
  const lin = (sp.lineages || []).find((l) => l.id === ch.lineageId);
  return { ...(sp.spriteMods || {}), ...(lin?.spriteMods || {}) };
}

// --- equipment -> sprite layer mapping ------------------------------------

/**
 * The rest of the outfit: what a class puts on its head, over its shoulders and
 * on its feet when the player has not chosen otherwise.
 *
 * `'auto'` is the point of this. Before it, `appearance.helmStyle` defaulted to
 * `'helm-none'`, which is also what a player picks when they want a bare head --
 * the two were the same value, so a class default could not be applied without
 * silently overriding a deliberate choice. `'auto'` means "you decide", and
 * `'helm-none'` now means what it says.
 *
 * Characters saved before this have real style ids and so keep exactly the look
 * they had. Boots are the exception: nothing ever stored a bootStyle, so an old
 * character reads as `'auto'` and gets the boots of their calling.
 */
const CLASS_KIT = {
  barbarian: { helm: 'helm-none', cloak: 'cloak-short', boots: 'boots-wraps' },
  bard: { helm: 'helm-cap', cloak: 'cloak-short', boots: 'boots-court' },
  cleric: { helm: 'helm-circlet', cloak: 'cloak-none', boots: 'boots-cuffed' },
  druid: { helm: 'helm-hood', cloak: 'cloak-none', boots: 'boots-wraps' },
  fighter: { helm: 'helm-cap', cloak: 'cloak-none', boots: 'boots-tall' },
  monk: { helm: 'helm-none', cloak: 'cloak-none', boots: 'boots-sandal' },
  paladin: { helm: 'helm-cap', cloak: 'cloak-long', boots: 'boots-plate' },
  ranger: { helm: 'helm-hood', cloak: 'cloak-short', boots: 'boots-tall' },
  rogue: { helm: 'helm-hood', cloak: 'cloak-short', boots: 'boots-cuffed' },
  sorcerer: { helm: 'helm-none', cloak: 'cloak-short', boots: 'boots-court' },
  warlock: { helm: 'helm-none', cloak: 'cloak-long', boots: 'boots-tall' },
  wizard: { helm: 'helm-wizard', cloak: 'cloak-long', boots: 'boots-cuffed' },
};

const KIT_FALLBACK = { helm: 'helm-none', cloak: 'cloak-none', boots: 'boots-cuffed' };

/** One slot of a class's default kit. */
function kitFor(ch, slot) {
  const k = CLASS_KIT[ch.classes?.[0]?.id];
  return (k && k[slot]) || KIT_FALLBACK[slot];
}

/** Resolve a chosen style, letting 'auto' (or nothing at all) defer to the class. */
function styleOr(chosen, ch, slot) {
  if (chosen && chosen !== 'auto') return chosen;
  return kitFor(ch, slot);
}

/** What each calling wears when it is not wearing armour. */
const CLASS_DRESS = {
  barbarian: 'outfit-fur',
  bard: 'outfit-doublet',
  cleric: 'outfit-vestments',
  druid: 'outfit-druidwear',
  fighter: 'outfit-gambeson',
  monk: 'outfit-monk',
  paladin: 'outfit-tabard',
  ranger: 'outfit-ranger',
  rogue: 'outfit-jerkin',
  sorcerer: 'outfit-robe',
  warlock: 'outfit-coat',
  wizard: 'outfit-robe',
};

/** Which body-armour sprite an equipped armour maps to. */
function outfitFor(ch) {
  // A deliberate cosmetic choice takes priority; old outfitStyle defaults keep
  // their original equipment/class behaviour when no wardrobe was chosen.
  const wardrobe = ch.appearance?.wardrobe;
  if (APPEARANCE_OPTIONS.wardrobe.includes(wardrobe) && wardrobe !== 'auto' && hasSprite(wardrobe)) return wardrobe;
  const armor = ch.equipment?.armor;
  const id = typeof armor === 'string' ? armor : armor?.id;
  const it = id ? resolveItem(id) : null;
  if (it) {
    const byId = {
      padded: 'outfit-tunic', leather: 'outfit-leather', 'studded-leather': 'outfit-studded',
      hide: 'outfit-hide', 'chain-shirt': 'outfit-chain', 'scale-mail': 'outfit-scale',
      breastplate: 'outfit-brigandine', 'half-plate': 'outfit-half-plate',
      'ring-mail': 'outfit-chain', 'chain-mail': 'outfit-chain', splint: 'outfit-half-plate',
      plate: 'outfit-plate',
    };
    if (byId[id]) return byId[id];
    if (it.category === 'heavy') return 'outfit-plate';
    if (it.category === 'medium') return 'outfit-scale';
    if (it.category === 'light') return 'outfit-leather';
  }
  // No armour: dress by class. This used to fold twelve classes into three
  // looks -- robe, wrap, or the same brown tunic -- so an unarmoured party was
  // six people in one costume.
  const cls = ch.classes?.[0]?.id;
  if (CLASS_DRESS[cls] && hasSprite(CLASS_DRESS[cls])) return CLASS_DRESS[cls];
  return ch.appearance?.outfitStyle || 'outfit-tunic';
}

/** Which weapon sprite the character holds. */
function weaponFor(ch) {
  const mh = ch.equipment?.mainHand;
  const id = typeof mh === 'string' ? mh : mh?.id;
  const it = id ? resolveItem(id) : null;
  if (!it) return 'wep-none';
  if (it.kind==='weapon')return weaponSprite(it);
  return 'wep-none';
}

function shieldFor(ch) {
  const oh = ch.equipment?.offHand;
  const id = typeof oh === 'string' ? oh : oh?.id;
  if (!id) return 'shield-none';
  const it = resolveItem(id);
  if (!it || it.kind !== 'shield') return 'shield-none';
  if (String(id).includes('tower')) return 'shield-tower';
  if (String(id).includes('kite')) return 'shield-kite';
  return 'shield-round';
}

function helmFor(ch) {
  const h = ch.equipment?.helm;
  const id = typeof h === 'string' ? h : h?.id;
  if (id) {
    if (String(id).includes('crown')) return 'helm-crown';
    if (String(id).includes('circlet') || String(id).includes('headband')) return 'helm-circlet';
    if (String(id).includes('hat')) return 'helm-wizard';
    if (String(id).includes('hood')) return 'helm-hood';
    if (String(id).includes('great') || String(id).includes('plate')) return 'helm-great';
    if (String(id).includes('horn')) return 'helm-horned';
    return 'helm-cap';
  }
  return styleOr(ch.appearance?.helmStyle, ch, 'helm');
}

/** Cloaks are appearance-only; nothing in the equipment list maps to one yet. */
function cloakFor(ch) {
  return styleOr(ch.appearance?.cloakStyle, ch, 'cloak');
}

/**
 * Boots. Armour on the body implies armoured feet: a character in plate gets
 * sabatons whatever their calling would otherwise have put them in.
 */
function bootsFor(ch) {
  const a = ch.appearance || {};
  if (a.bootStyle && a.bootStyle !== 'auto') return a.bootStyle;
  const armor = outfitFor(ch);
  if (armor === 'outfit-plate' || armor === 'outfit-half-plate') return 'boots-plate';
  return kitFor(ch, 'boots');
}

/**
 * What a calling carries that reads at 16x24 whatever the character wears:
 * `front` layers go over the outfit, `back` layers are slung on the back (see
 * the CLASS MARKS note in spritedata_chars.js). `appearance.classMarks: false`
 * turns them off for a player who wants the plain costume.
 */
function marksFor(ch) {
  const none = { front: null, back: null };
  if (ch.appearance?.classMarks === false) return none;
  const cls = ch.classes?.[0]?.id;
  const outfit = outfitFor(ch);
  const armoured = outfit !== CLASS_DRESS[cls];
  switch (cls) {
    case 'barbarian': return { front: 'mark-furs', back: null };
    case 'paladin': return { front: armoured && outfit !== 'outfit-robe' ? 'mark-tabard' : null, back: null };
    case 'cleric': return { front: armoured ? 'mark-symbol' : null, back: null };
    case 'bard': return { front: null, back: 'back-lute' };
    case 'ranger': return { front: null, back: 'back-quiver' };
    default: return none;
  }
}

function bodyFor(ch) {
  const a = ch.appearance || {};
  if (a.bodyStyle) return a.bodyStyle;
  const size = ch.size || 'medium';
  if (size === 'small') return 'body-small';
  // A dwarf is not a short human and cannot be drawn as one -- the head is
  // pinned to rows 2-9 by every helm and hair layer. The stout frame carries
  // it instead: thicker chest, shorter shank.
  const sm = speciesMods(ch);
  if (sm.build === 'stout') return 'body-stout';
  const build = a.build || 'normal';
  if (build === 'stout') return 'body-stout';
  if (build === 'slim') return 'body-slim';
  if (build === 'broad') return 'body-broad';
  if (build === 'tall') return 'body-tall';
  return 'body-normal';
}

// --- colorway -------------------------------------------------------------

/**
 * Build (and cache on the character) the colour token map the sprite layers use.
 * Armour tints the METAL/LEATHER tokens so a plate-armoured knight reads as steel
 * even though the sprite art is shared.
 */
export function colorwayOf(ch) {
  const a = ch.appearance || {};
  const sig = [a.skin, a.hair, a.eye, a.outfit, a.outfitAlt, a.accent, a.metal, a.leather, a.cloth, a.hornColor].join('|');
  if (ch._cwSig === sig && ch.colorway) return ch.colorway;
  const cw = makeColorway({
    skin: a.skin || '#e0a878',
    hair: a.hair || '#3a2416',
    eye: a.eye || '#37527a',
    main: a.outfit || '#7a3030',
    alt: a.outfitAlt || '#2f4f7f',
    metal: a.metal || '#aab2c0',
    leather: a.leather || '#6b4a2a',
    cloth: a.cloth || '#c8b58a',
    accent: a.accent || '#e3b34a',
    horn: a.hornColor || '#8c8377',
  });
  ch.colorway = cw;
  ch._cwSig = sig;
  return cw;
}

// --- layer assembly -------------------------------------------------------

/** The list of layers for a character at a given animation frame. */
export function actorLayers(ch, frame) {
  const a = ch.appearance || {};
  const cw = colorwayOf(ch);
  const L = [];
  const push = (name, extra) => { if (name && name.endsWith('-none') === false && hasSprite(name)) L.push({ name, frame, colorway: cw, ...extra }); };

  const marks = marksFor(ch);
  const facingUp = String(frame).startsWith('up');
  const cloak = cloakFor(ch);
  const helm = helmFor(ch);
  const hair = () => {
    // A great helm hides the hair; a circlet or cap sits on top of it.
    if (helm !== 'helm-great' && helm !== 'helm-hood') push(`hair-${a.hairStyle || 'short'}`);
    if (a.beard && a.beard !== 'none') push(`beard-${a.beard}`);
  };
  // Seen from the front or side, a cloak and anything slung on the back hang
  // BEHIND the body. Seen from behind they are what you see: the cloak goes
  // over the back (hair and tail over it, unless it has its own hood), and the
  // lute or quiver over that.
  if (!facingUp) {
    push(cloak);
    push(marks.back);
    if (a.tail) push(`tail-${a.tail}`);
  }
  push(bodyFor(ch));
  push(bootsFor(ch));
  const sm = speciesMods(ch);
  const ears = a.ears || sm.ears;
  if (ears && ears !== 'round' && ears !== 'none') push(`ears-${ears}`);
  // Species features, over the face and under the hair.
  if (a.scales ?? sm.scales) push('face-scales');
  if (a.snout ?? sm.snout) push((a.fur ?? sm.fur) ? 'face-muzzle' : 'face-snout');
  if (a.tusks ?? sm.tusks) push('face-tusks');
  if (a.markings ?? sm.markings) push('face-markings');
  const hooded = cloak === 'cloak-hooded';
  if (facingUp && hooded) hair();
  push(outfitFor(ch));
  // A tabard or a pendant is under the cloak; a pelt is worn over everything.
  const mantle = marks.front === 'mark-furs';
  if (!(facingUp && mantle)) push(marks.front);
  // Front locks and beards fall over collars, rather than being cut off by them.
  if (!facingUp) hair();
  if (facingUp) {
    push(cloak);
    if (mantle) push(marks.front);
    if (a.tail) push(`tail-${a.tail}`);
    if (!hooded) hair();
  }
  if (a.horns) push(`horns-${a.horns}`);
  push(helm);
  if (facingUp) push(marks.back);
  push(shieldFor(ch));
  push(weaponFor(ch));
  return L;
}

/** A stable signature so identical appearances share one composed canvas. */
function actorSig(ch, frame) {
  const a = ch.appearance || {};
  const eq = ch.equipment || {};
  const idOf = (v) => (typeof v === 'string' ? v : v?.id || '');
  return hashStr([
    frame, bodyFor(ch), a.hairStyle, a.beard, a.ears, a.horns, a.tail,
    ch.speciesId, ch.lineageId, ch.classes?.[0]?.id,
    a.cloakStyle, a.helmStyle, a.outfitStyle, a.wardrobe, a.bootStyle, a.classMarks,
    helmFor(ch), cloakFor(ch), bootsFor(ch),
    idOf(eq.armor), idOf(eq.mainHand), idOf(eq.offHand), idOf(eq.helm),
    a.skin, a.hair, a.eye, a.outfit, a.outfitAlt, a.accent, a.metal, a.leather, a.cloth, a.hornColor,
  ].join('')).toString(36);
}

/** Get the composed canvas for one frame of a character. */
export function actorCanvas(ch, frame, opts = {}) {
  let layers = actorLayers(ch, frame);
  if (!layers.length) return null;
  // The weapon can be pulled out and drawn separately so it can swing on its
  // own — a body that lunges with a sword welded to its fist is a body being
  // shoved, not a body striking. `omitWeapon` leaves the hand empty.
  if (opts.omitWeapon) layers = layers.filter((l) => !String(l.name).startsWith('wep-'));
  if (!layers.length) return null;
  // Composite height is the tallest layer so hats and weapons aren't clipped.
  let h = SPRITE_H, w = SPRITE_W;
  for (const l of layers) {
    const d = spriteDef(l.name);
    if (d) { h = Math.max(h, d.h); w = Math.max(w, d.w); }
  }
  const sig = `${actorSig(ch, frame)}${opts.omitWeapon ? '|nw' : ''}|${w}x${h}`;
  return composeSprite(sig, w, h, layers, { finish: colorwayOf(ch).OUTLINE });
}

/** The character's weapon sprite name, or null when their hands are empty. */
export function weaponSpriteOf(ch) {
  const n = weaponFor(ch);
  return n && n !== 'wep-none' && hasSprite(n) ? n : null;
}

// --- poses ------------------------------------------------------------------
//
// OVERHAUL 4.6 asks for idle, attack, cast, shoot, hurt and ko frames for every
// layered humanoid. Drawing them by hand would mean every outfit x build x
// facing again, five times over, and the first new outfit would break the set.
// Instead each pose frame is a RECIPE applied to every layer's raster in the
// same way, so the whole stack moves in register whatever it is wearing:
//   base  which walk frame to start from (1 = mid-stride, 3 = eyes shut)
//   body  [dx, dy] for the upper body, rows 0 to the hands; dy +1 is a crouch
//   w, o  the weapon arm and the other arm. The arm's pixels lift out of the
//         body and outfit, the torso edge closes behind them, and they land:
//           [dx, dy]  shifted, still hanging
//           'up'      raised straight up beside the head (facing the camera)
//           'out'     held out level: sideways facing the camera, forward side-on
//           'diag'    raised forward and up at 45 degrees (side-on)
//         A shield rides with the other arm; a shield arm is never flung up.
//   rot   radians the weapon turns about the hand (it stays its own layer)
//   glow  'w' (the weapon hand) or 'mid' (between both hands): the VFX point
// Side-on, x runs FORWARD (the way the character faces). Facing the camera or
// away, an arm's x runs OUTWARD from the body. Side views show one arm, the
// near one, which is also the weapon hand. Attack recipes differ by what is in
// the hand: a blade (or a fist) arcs, a pole thrusts, a bow bashes.

const ATTACK = {
  blade: {
    side: [
      { body: [-1, 0], w: 'diag', rot: -2.2 },
      { base: 1, body: [1, 0], w: 'out', rot: 1.57 },
      { base: 1, body: [1, 1], w: [1, 1], rot: 2.5 },
    ],
    front: [
      { w: 'up', rot: 0.3 },
      { base: 1, body: [0, 1], w: 'out', rot: 1.57 },
      { base: 1, body: [0, 1], w: [0, 1], rot: 2.6 },
    ],
  },
  pole: {
    side: [
      { body: [-1, 0], w: [-1, 0], rot: 0.9 },
      { base: 1, body: [1, 0], w: 'out', rot: 1.57 },
      { base: 1, body: [1, 1], w: 'out', rot: 1.57 },
    ],
    front: [
      { w: 'up', rot: 0 },
      { base: 1, body: [0, 1], w: [0, 1], rot: 0.7 },
      { base: 1, body: [0, 1], w: [1, 1], rot: 1.2 },
    ],
  },
  bow: {
    side: [
      { body: [-1, 0], w: [-1, 0], rot: -0.4 },
      { base: 1, body: [1, 0], w: 'out', rot: 0 },
      { base: 1, body: [1, 1], w: 'out', rot: 0.35 },
    ],
    front: [
      { w: [0, -2], rot: 0 },
      { base: 1, body: [0, 1], w: [0, 1], rot: 0.5 },
      { base: 1, body: [0, 1], w: [1, 1], rot: 0.8 },
    ],
  },
};

const POSES = {
  idle: {
    side: [{}, { body: [0, 1] }],
    front: [{}, { body: [0, 1] }],
  },
  attack: ATTACK.blade,
  cast: {
    side: [
      { w: 'diag', glow: 'w' },
      { body: [1, 0], w: 'out', glow: 'w' },
    ],
    front: [
      { w: 'up', o: 'up', glow: 'mid' },
      { w: 'out', o: 'out', glow: 'mid' },
    ],
  },
  shoot: {
    side: [
      { w: 'out' },
      { body: [-1, 0], w: 'out' },
    ],
    front: [
      { w: [0, -2], o: [0, -2] },
      { body: [0, 1], w: [0, -1], o: [0, -1] },
    ],
  },
  hurt: {
    side: [{ base: 3, body: [-1, 1], w: [-1, -1], rot: -0.5 }],
    front: [{ base: 3, body: [0, 1], w: [1, -1], o: [1, -1], rot: -0.5 }],
  },
  ko: { side: [{ lying: true }], front: [{ lying: true }] },
};

/** How a weapon moves in an attack: which ATTACK recipe its sprite takes. */
const WEAPON_KIND = {
  'wep-spear': 'pole', 'wep-staff': 'pole', 'wep-halberd': 'pole',
  'wep-bow': 'bow', 'wep-crossbow': 'bow',
};

/** Every pose name drawActor understands (walk is the plain cycle). */
export const POSE_NAMES = Object.freeze(['idle', 'walk', ...Object.keys(POSES).filter((p) => p !== 'idle')]);

const POSE_RE = /^(idle|attack|cast|shoot|hurt|ko)-(down|left|right|up)-(\d)$/;

/**
 * The frame names of a pose, in order, for a character facing `dir`. A pose the
 * character cannot take (a creature drawn as one finished sprite, without art
 * of its own for it) falls back to the walk frames, as the contract asks.
 */
export function actorPoseFrames(ch, pose, dir = 'down') {
  const walk = [`${dir}-0`, `${dir}-1`, `${dir}-0`, `${dir}-2`];
  if (!ch || !pose || pose === 'walk') return walk;
  const single = singleSpriteOf(ch);
  if (single) {
    const own = [];
    for (let i = 0; hasFrame(single, `${pose}-${dir}-${i}`); i++) own.push(`${pose}-${dir}-${i}`);
    if (own.length) return own;
    if (!npcBody(single) || !POSES[pose]) return walk;
  } else if (!POSES[pose]) return walk;
  const n = POSES[pose][viewOf(dir)].length;
  return Array.from({ length: n }, (_, i) => `${pose}-${dir}-${i}`);
}

function hasFrame(name, frame) { const d = spriteDef(name); return !!(d && d.frames[frame]); }
function viewOf(dir) { return dir === 'left' || dir === 'right' ? 'side' : 'front'; }

/** The finished sprite a character is drawn from, when it is not layered. */
function singleSpriteOf(ch) {
  if (ch.layered) return null;
  const art = ch.monsterId ? monsterArtFor(ch.monsterId, ch.sprite) : null;
  const n = art ? art.sprite : ch.sprite;
  return n && hasSprite(n) ? n : null;
}

/**
 * The geometry a recipe needs for one build and facing: the arm bands (two
 * columns each: the outline column and `inner`, the one against the torso;
 * `out` is the outward direction) and the last row of the upper body.
 */
function poseGeom(body, dir) {
  const g = BODY_ARMS[body] || BODY_ARMS['body-normal'];
  if (dir === 'left' || dir === 'right') {
    const s = g.side;
    const near = dir === 'left'
      ? { c0: s.f, c1: s.f + 1, inner: s.f + 1, out: -1 }
      : { c0: 14 - s.f, c1: 15 - s.f, inner: 14 - s.f, out: 1 };
    return { top: s.top, bot: s.bot, w: near, o: null, fwd: dir === 'left' ? -1 : 1, rotSign: dir === 'left' ? -1 : 1 };
  }
  const f = g.front;
  const L = { c0: f.l, c1: f.l + 1, inner: f.l + 1, out: -1 };
  const R = { c0: f.r - 1, c1: f.r, inner: f.r - 1, out: 1 };
  // The weapon is authored on the viewer's right facing the camera and mirrored
  // for the back view, so the weapon arm swaps sides with the facing.
  return dir === 'up'
    ? { top: f.top, bot: f.bot, w: L, o: R, fwd: 0, rotSign: -1 }
    : { top: f.top, bot: f.bot, w: R, o: L, fwd: 0, rotSign: 1 };
}

/**
 * A recipe resolved into pixel offsets for one build and facing. `kit` says
 * what the hands hold: { wep: sprite name or null, shield: bool }.
 */
function resolvePose(pose, dir, n, body, kit = {}) {
  const table = pose === 'attack' ? ATTACK[WEAPON_KIND[kit.wep] || weaponAnimationKind(kit.wep)] : POSES[pose];
  const set = table && table[viewOf(dir)];
  if (!set) return null;
  const r = set[Math.max(0, Math.min(set.length - 1, n | 0))];
  const G = poseGeom(body, dir);
  const side = G.fwd !== 0;
  const b = r.body || [0, 0];
  const bx = side ? b[0] * G.fwd : b[0], by = b[1];
  const arm = (band, v) => {
    if (!band || !v) return null;
    if (typeof v === 'string') return { band, mode: v, dx: 0, dy: 0 };
    return { band, mode: 'shift', dx: side ? v[0] * G.fwd : v[0] * band.out, dy: v[1] };
  };
  let o = arm(G.o, r.o);
  if (o && o.mode !== 'shift' && kit.shield) o = null;
  return {
    geom: G, lying: !!r.lying, base: r.base || 0,
    bx, by, w: arm(G.w, r.w), o,
    rot: (r.rot || 0) * G.rotSign, glow: r.glow || null,
  };
}

// --- raster helpers for the recipes (RGBA arrays on composite-sized buffers) --

function shiftUpper(d, w, h, bot, dx, dy) {
  if (!dx && !dy) return;
  const src = new Uint8ClampedArray(d);
  const last = Math.min(h - 1, bot + Math.max(0, dy));
  for (let y = 0; y <= last; y++) for (let x = 0; x < w; x++) {
    const sx = x - dx, sy = y - dy, i = (y * w + x) * 4;
    const inside = sx >= 0 && sx < w && sy >= 0 && sy <= bot;
    for (let k = 0; k < 4; k++) d[i + k] = inside ? src[(sy * w + sx) * 4 + k] : 0;
  }
}

/**
 * Where one pixel of an arm band lands. `t` runs down the arm from the shoulder
 * (0) to the hand; `outer` is the outline column. Returns a list, because the
 * diagonal arm doubles its fill to stay two pixels thick.
 */
function armDest(A, top, x, y) {
  const b = A.band, t = y - top, outer = x !== b.inner;
  switch (A.mode) {
    case 'up':   // reflected above the shoulder, one pixel out to clear the head
      return [[x + b.out, top - 1 - t]];
    case 'out':  // transposed: the outline becomes the top edge of a level arm
      return [[b.inner + b.out * t, top + (outer ? 0 : 1)]];
    case 'diag': // forward and up, 45 degrees, outline above the fill
      return outer ? [[b.inner + b.out * t, top - t - 1]]
        : [[b.inner + b.out * t, top - t], [b.inner + b.out * t, top - t + 1]];
    default:
      return [[x + A.dx, y + A.dy]];
  }
}

/**
 * Lift one arm band out of a layer and set it down per its mode. On the body
 * layer the torso edge the arm leaves behind is closed with the outline colour.
 */
function moveArm(d, w, h, A, top, bot, isBody, K) {
  if (A.mode === 'shift' && !A.dx && !A.dy) return;
  const band = A.band, cells = [];
  for (let y = top; y <= bot; y++) for (let x = band.c0; x <= band.c1; x++) {
    if (x < 0 || x >= w || y < 0 || y >= h) continue;
    const i = (y * w + x) * 4;
    if (d[i + 3]) cells.push([x, y, d[i], d[i + 1], d[i + 2], d[i + 3]]);
    const tx = band.inner - band.out;              // the torso column beside the arm
    const torso = isBody && x === band.inner && tx >= 0 && tx < w && d[(y * w + tx) * 4 + 3];
    if (torso) { d[i] = K[0]; d[i + 1] = K[1]; d[i + 2] = K[2]; d[i + 3] = 255; }
    else d[i + 3] = 0;
  }
  for (const [x, y, r, g, b, a] of cells) {
    for (const [X, Y] of armDest(A, top, x, y)) {
      if (X < 0 || X >= w || Y < 0 || Y >= h) continue;
      const i = (Y * w + X) * 4;
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a;
    }
  }
}

/** The box an arm occupies before and after its move, one pixel out. */
function armRect(A, top, bot) {
  let x0 = A.band.c0, x1 = A.band.c1, y0 = top, y1 = bot;
  for (let y = top; y <= bot; y++) for (let x = A.band.c0; x <= A.band.c1; x++) {
    for (const [X, Y] of armDest(A, top, x, y)) {
      x0 = Math.min(x0, X); x1 = Math.max(x1, X); y0 = Math.min(y0, Y); y1 = Math.max(y1, Y);
    }
  }
  return [x0 - 1, y0 - 1, x1 + 1, y1 + 1];
}

/** Close any silhouette a moved arm opened: empty pixels touching fill turn outline. */
function closeOutline(c, rects, K) {
  const w = c.width, h = c.height;
  const ctx = c.getContext('2d');
  const id = ctx.getImageData(0, 0, w, h), d = id.data;
  const isK = (i) => d[i] === K[0] && d[i + 1] === K[1] && d[i + 2] === K[2];
  const add = [];
  for (const [x0, y0, x1, y1] of rects) {
    for (let y = Math.max(0, y0); y <= Math.min(h - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(w - 1, x1); x++) {
      const i = (y * w + x) * 4;
      if (d[i + 3]) continue;
      for (const [ax, ay] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) {
        const X = x + ax, Y = y + ay;
        if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
        const j = (Y * w + X) * 4;
        if (d[j + 3] > 100 && !isK(j)) { add.push(i); break; }
      }
    }
  }
  for (const i of add) { d[i] = K[0]; d[i + 1] = K[1]; d[i + 2] = K[2]; d[i + 3] = 255; }
  ctx.putImageData(id, 0, 0);
}

const rgbOf = (hex) => { const n = parseInt(String(hex).slice(1), 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

/** A recipe's arms in the coordinates of a (w x h) buffer: bands offset by the frame and the body shift. */
function placedArms(P, w, h) {
  const ox = (w - SPRITE_W) >> 1, oy = h - SPRITE_H;
  const top = P.geom.top + oy + P.by, bot = P.geom.bot + oy + P.by;
  const place = (A) => A && { ...A, band: { ...A.band, c0: A.band.c0 + ox + P.bx, c1: A.band.c1 + ox + P.bx, inner: A.band.inner + ox + P.bx } };
  return { top, bot, oy, w: place(P.w), o: place(P.o) };
}

/**
 * The layer transform for a resolved recipe. The upper body moves first, then
 * each arm moves from where the body shift left it. Body and outfit carry the
 * arms; a shield rides with a shifted other arm; every other layer (hair,
 * cloak, helm...) moves only with the upper body.
 */
function poseXf(P, K) {
  return (d, w, h, name) => {
    const Q = placedArms(P, w, h);
    shiftUpper(d, w, h, P.geom.bot + Q.oy, P.bx, P.by);
    // A class mark over the outfit (a pelt's shoulder tufts) is sleeve too.
    const armLayer = name.startsWith('body-') || name.startsWith('outfit-') || name.startsWith('mark-');
    for (const A of [Q.w, Q.o]) {
      if (!A) continue;
      if (armLayer) moveArm(d, w, h, A, Q.top, Q.bot, name.startsWith('body-'), K);
      else if (name.startsWith('shield-') && A === Q.o && A.mode === 'shift') shiftUpper(d, w, h, h - 1, A.dx, A.dy);
    }
  };
}

/** Where a pose's weapon hand (or glow) sits, in the pixels of a 16x24 frame. */
function handOf(P, which = 'w') {
  const G = P.geom, L = G.bot - G.top;
  const at = (A, band) => {
    const cx = (band.c0 + band.c1 + 1) / 2;
    let x = cx, y = G.bot + 0.5;
    if (A) {
      if (A.mode === 'up') { x = cx + band.out; y = G.top - L - 0.5; }
      else if (A.mode === 'out') { x = band.inner + band.out * L + 0.5; y = G.top + 1; }
      else if (A.mode === 'diag') { x = band.inner + band.out * L + 0.5; y = G.top - L + 0.5; }
      else { x += A.dx; y += A.dy; }
    }
    return { x: x + P.bx, y: y + P.by };
  };
  if (which === 'mid' && G.o) {
    const a = at(P.w, G.w), b = at(P.o, G.o);
    return { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - 2 };
  }
  return at(P.w, G.w);
}

/** What a character holds, for the recipes that care. */
function kitOf(ch) {
  return { wep: weaponSpriteOf(ch), shield: shieldFor(ch) !== 'shield-none' };
}

/**
 * The VFX point of a pose frame, relative to the feet (x right, y up negative),
 * in logical px at scale 1. Cast frames give the hands; other poses the weapon
 * hand. Null for a pose the character cannot take, and for ko.
 */
export function actorPosePoint(ch, pose, dir = 'down', n = 0) {
  if (!ch) return null;
  const single = singleSpriteOf(ch);
  const P = resolvePose(pose, dir, n, single ? (npcBody(single) || 'body-normal') : bodyFor(ch), single ? {} : kitOf(ch));
  if (!P || P.lying) return null;
  const p = handOf(P, P.glow || 'w');
  return { x: p.x - SPRITE_W / 2, y: p.y - SPRITE_H };
}

const lyingCache = new Map();

/**
 * A knocked-out body: the standing frame with its eyes shut, laid on its back
 * along the ground (head away from the way it faced), cropped so it rests on the
 * tile rather than floating above it. Rotating by a right angle is pixel-exact.
 */
function lyingCanvas(src, key, headLeft) {
  let c = lyingCache.get(key);
  if (c) return c;
  const w = src.width, h = src.height;
  const sd = src.getContext('2d').getImageData(0, 0, w, h).data;
  const R = document.createElement('canvas');
  R.width = h; R.height = w;
  const rctx = R.getContext('2d');
  const out = rctx.createImageData(h, w), od = out.data;
  let lowest = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    // headLeft: rotate counter-clockwise (top -> left); else clockwise.
    const X = headLeft ? y : h - 1 - y, Y = headLeft ? w - 1 - x : x;
    const i = (y * w + x) * 4, j = (Y * h + X) * 4;
    for (let k = 0; k < 4; k++) od[j + k] = sd[i + k];
    if (sd[i + 3] && Y > lowest) lowest = Y;
  }
  rctx.putImageData(out, 0, 0);
  c = document.createElement('canvas');
  c.width = h; c.height = lowest + 1;
  c.getContext('2d').drawImage(R, 0, 0);
  if (lyingCache.size > 200) lyingCache.clear();
  lyingCache.set(key, c);
  return c;
}

/** Pose canvases are this much wider than the standing frame, for flung arms. */
const POSE_PAD = 4;

/**
 * The composed canvas for one pose frame of a layered character (weapon left
 * out -- it is drawn on its own so it can turn in the hand), with the resolved
 * recipe. Cached with the composite.
 */
function poseCanvas(ch, pose, dir, n) {
  const P = resolvePose(pose, dir, n, bodyFor(ch), kitOf(ch));
  if (!P) return null;
  const cw = colorwayOf(ch);
  const K = rgbOf(cw.OUTLINE);
  if (P.lying) {
    const flat = actorCanvas(ch, 'down-3', { omitWeapon: true });
    return flat ? { canvas: lyingCanvas(flat, `${actorSig(ch, 'down-3')}|ko|${dir}`, dir !== 'left'), P } : null;
  }
  const frame = `${dir}-${P.base}`;
  let layers = actorLayers(ch, frame).filter((l) => !String(l.name).startsWith('wep-'));
  if (!layers.length) return null;
  let h = SPRITE_H, w = SPRITE_W;
  for (const l of layers) { const d = spriteDef(l.name); if (d) { h = Math.max(h, d.h); w = Math.max(w, d.w); } }
  w += POSE_PAD * 2;
  const xf = poseXf(P, K);
  layers = layers.map((l) => ({ ...l, xf }));
  // Where each arm was and where it went, one pixel out: the only places a
  // silhouette can have opened.
  const Q = placedArms(P, w, h);
  const rects = [Q.w, Q.o].filter(Boolean).map((A) => armRect(A, Q.top, Q.bot));
  const sig = `${actorSig(ch, frame)}|pose|${pose}-${dir}-${n}|${w}x${h}`;
  const canvas = composeSprite(sig, w, h, layers, {
    post: rects.length ? (c) => closeOutline(c, rects, K) : null,
    finish: cw.OUTLINE,
  });
  return { canvas, P };
}

/** The same recipes on a baked NPC family: it moves as one piece, arms and all. */
function singlePoseCanvas(name, cw, pose, dir, n) {
  const body = npcBody(name);
  if (!body) return null;
  const P = resolvePose(pose, dir, n, body, {});
  if (!P) return null;
  const def = spriteDef(name);
  const frame = P.lying ? 'down-3' : `${dir}-${P.base}`;
  const key = `${name}|${frame}|${cw ? [cw.MAIN, cw.ALT, cw.CLOTH, cw.SKIN, cw.HAIR].join('') : ''}`;
  if (P.lying) {
    const flat = composeSprite(`~npc|${key}`, def.w, def.h, [{ name, frame, colorway: cw }]);
    return flat ? { canvas: lyingCanvas(flat, `${key}|ko|${dir}`, dir !== 'left'), P } : null;
  }
  const flatP = { ...P, w: null, o: null };   // no separable arms in a baked sprite
  const xf = poseXf(flatP, [0, 0, 0]);
  return { canvas: composeSprite(`~npc|${key}|${pose}-${dir}-${n}`, def.w, def.h, [{ name, frame, colorway: cw, xf }]), P: flatP };
}

// --- public draw API ------------------------------------------------------

/**
 * Which frame of a pose to show. `poseT` is progress through the pose, 0..1:
 * a one-shot (attack, cast, shoot, hurt, ko) holds its last frame from 1 on;
 * idle and walk loop, so any poseT works (its fraction is used). `poseFrame`
 * picks a frame outright.
 */
function poseIndex(pose, n, opts) {
  if (opts.poseFrame != null) return Math.max(0, Math.min(n - 1, opts.poseFrame | 0));
  const t = +opts.poseT || 0;
  if (pose === 'idle' || pose === 'walk') return Math.floor((((t % 1) + 1) % 1) * n) % n;
  return Math.max(0, Math.min(n - 1, Math.floor(t * n)));
}

/**
 * Draw a character with their feet at (x, y).
 * opts: { dir='down', phase=0, moving, scale=1, alpha, tint, tintAmt, shadow=true,
 *         flip, bob, downed, swing,
 *         pose: 'idle'|'walk'|'attack'|'cast'|'shoot'|'hurt'|'ko', poseT, poseFrame }
 * A pose frame name ('attack-left-1') in `frame` works too. A pose the
 * character has no frames for falls back to the walk cycle.
 */
export function drawActor(ctx, ch, x, y, opts = {}) {
  if (!ch) return false;
  let dir = opts.dir || ch.dir || 'down';
  let pose = opts.pose || null, poseN = 0;
  const named = opts.frame && POSE_RE.exec(opts.frame);
  if (named) { pose = named[1]; dir = named[2]; poseN = +named[3]; }
  let frame = opts.frame || `${dir}-${opts.moving ? [0, 1, 0, 2][(opts.phase | 0) & 3] : (opts.idleBob ? 3 : 0)}`;
  if (pose && !named) {
    const list = actorPoseFrames(ch, pose, dir);
    poseN = poseIndex(pose, list.length, opts);
    frame = list[poseN];
    if (!POSE_RE.test(frame)) pose = null;       // fell back to a walk frame
  }

  // Monsters and NPCs that ship as a single finished sprite skip composition.
  // A creature resolves its art through the bestiary's own map, which knows
  // that 'dragon' means dragon-adult in red at 62% tint and that 'spider' means
  // the phase-spider body. Without this every creature whose catalogue sprite
  // name has no art — 127 of 275, dragons included — fell through to the
  // LAYERED path below and was drawn as a human being.
  const art = ch.monsterId && !ch.layered ? monsterArtFor(ch.monsterId, ch.sprite) : null;
  const spriteName = art ? art.sprite : ch.sprite;
  if (spriteName && hasSprite(spriteName) && !ch.layered) {
    // Three tints can apply, in order of authority: the one the CALLER passes
    // (a hit flash, a corpse), the one on the INSTANCE (the catalogue's own
    // colour for this creature), and the FAMILY one (which colour of dragon
    // this is). Each carries its own strength — a caller's amount belongs only
    // to a caller's tint, and it is routinely 0, so it must not be inherited by
    // the other two or a red dragon comes out grey.
    let tint = opts.tint || null;
    let tintAmt = opts.tintAmt;
    if (!tint && ch.tint && !art?.bakedPalette) { tint = ch.tint; tintAmt = art && art.tint ? art.tintAmt : 0.6; }
    if (!tint && art && art.tint) { tint = art.tint; tintAmt = art.tintAmt; }
    if(art?.colorway&&!opts.tint)tint=null;
    const cw = art?.colorway || ch.colorway || (ch.appearance ? colorwayOf(ch) : null);
    const scale = (opts.scale || 1) * (art ? art.scale : 1);
    // A baked townsfolk family takes the pose recipes as one piece; a sprite
    // with art of its own for the pose draws that frame, and anything else the
    // plain standing frame.
    if (pose && !hasFrame(spriteName, frame)) {
      const pc = singlePoseCanvas(spriteName, cw, pose, dir, poseN);
      if (pc && pc.canvas) {
        drawComposed(ctx, pc.canvas, x, y, {
          scale, alpha: opts.alpha, tint, tintAmt,
          shadow: opts.shadow !== false, flip: opts.flip, bob: opts.bob, sig: `${spriteName}|${frame}`,
        });
        return true;
      }
      frame = `${dir}-0`;
    }
    return drawSprite(ctx, spriteName, frame, x, y, {
      colorway: cw, scale, alpha: opts.alpha, tint, tintAmt,
      shadow: opts.shadow !== false, flip: opts.flip, bob: opts.bob,
      rotate: opts.rotate != null ? opts.rotate : (opts.downed ? Math.PI / 2 : 0),
    });
  }

  const sc = opts.scale || 1;
  const common = {
    scale: sc, alpha: opts.alpha, tint: opts.tint, tintAmt: opts.tintAmt,
    flip: opts.flip, bob: opts.bob,
    rotate: opts.rotate != null ? opts.rotate : (opts.downed ? Math.PI / 2 : 0),
  };

  if (pose) {
    const pc = poseCanvas(ch, pose, dir, poseN);
    if (pc && pc.canvas) {
      const { canvas, P } = pc;
      drawComposed(ctx, canvas, x, y, {
        ...common, rotate: P.lying ? 0 : common.rotate, shadowW: P.lying ? null : SPRITE_W,
        shadow: opts.shadow !== false, sig: `${actorSig(ch, frame)}|pose`,
      });
      const wep = P.lying ? null : weaponSpriteOf(ch);
      if (wep) drawHeldWeapon(ctx, ch, wep, `${dir}-${P.base}`, x, y, P, opts.swing || 0, common, opts);
      return true;
    }
    frame = `${dir}-0`;
  }

  // A swing: the weapon layer is composed separately and rotated about the
  // fist, so the blade travels through the arc while the body holds its pose.
  // `swing` is radians; 0 is the rest position.
  const swing = opts.swing || 0;
  const wep = swing ? weaponSpriteOf(ch) : null;

  const canvas = actorCanvas(ch, frame, { omitWeapon: !!wep });
  if (!canvas) return false;
  drawComposed(ctx, canvas, x, y, { ...common, shadow: opts.shadow !== false, sig: `${actorSig(ch, frame)}${wep ? '|nw' : ''}` });

  if (wep) {
    const wc = weaponCanvas(ch, wep, frame);
    if (wc) {
      const left = !!(opts.facingLeft || opts.flip);
      // Pivot at the fist: a little under half way up the sprite, off centre
      // on the side the character is facing.
      const px = x + (left ? -3 : 3) * sc;
      const py = y - (wc.height * 0.45) * sc;
      ctx.save();
      ctx.translate(Math.round(px), Math.round(py));
      ctx.rotate(swing * (left ? -1 : 1));
      ctx.translate(-Math.round(px), -Math.round(py));
      drawComposed(ctx, wc, x, y, { ...common, shadow: false, sig: `${wep}|${frame}` });
      ctx.restore();
    }
  }
  return true;
}

/** The weapon on its own, finished like the body, for drawing in the hand. */
function weaponCanvas(ch, wep, frame) {
  return composeSprite(`~wep|${wep}|${frame}|${actorSig(ch, frame)}`,
    spriteDef(wep)?.w || SPRITE_W, spriteDef(wep)?.h || SPRITE_H,
    [{ name: wep, frame, colorway: colorwayOf(ch) }], { finish: colorwayOf(ch).OUTLINE });
}

/**
 * A posed character's weapon: carried along with the hand the recipe moved,
 * then turned about that hand by the recipe's angle plus any caller swing.
 */
function drawHeldWeapon(ctx, ch, wep, frame, x, y, P, swing, common, opts) {
  const wc = weaponCanvas(ch, wep, frame);
  if (!wc) return;
  const sc = common.scale;
  const rest = handOf({ ...P, bx: 0, by: 0, w: null, o: null });
  const hand = handOf(P);
  let dx = (hand.x - rest.x) * sc;
  const dy = (hand.y - rest.y) * sc;
  let px = x + (hand.x - SPRITE_W / 2) * sc;
  const py = y + (hand.y - SPRITE_H) * sc;
  let rot = P.rot + swing * P.geom.rotSign;
  if (opts.flip) { dx = -dx; px = 2 * x - px; rot = -rot; }
  ctx.save();
  if (rot) {
    ctx.translate(Math.round(px), Math.round(py));
    ctx.rotate(rot);
    ctx.translate(-Math.round(px), -Math.round(py));
  }
  drawComposed(ctx, wc, x + dx, y + dy, { ...common, rotate: 0, shadow: false, sig: `${wep}|${frame}` });
  ctx.restore();
}

// --- portraits ----------------------------------------------------------------

const NPC_SPECIES = { 'npc-dwarf': 'dwarf', 'npc-halfling': 'halfling', 'npc-elf': 'elf' };

/**
 * Everything render/portrait.js needs to paint a bust, resolved exactly as the
 * sprite resolves it -- the same helm, outfit, cloak and species features -- so
 * the face in the dialogue box is the person standing in the street. Works for
 * layered characters and for baked townsfolk families (read back from the
 * stack they were flattened from); null for creatures, which have no bust.
 */
export function portraitLook(ch) {
  if (!ch) return null;
  const single = singleSpriteOf(ch);
  if (single) {
    const nl = npcLook(single);
    if (!nl) return null;
    const cw = ch.colorway || spriteDef(single)?.defaultColorway || {};
    const c = nl.colors;
    const find = (p, fb) => nl.stack.find((n) => n.startsWith(p)) || fb;
    const fam = single.replace(/-v\d$/, '');
    const speciesId = ch.speciesId || nl.speciesId || NPC_SPECIES[fam] || 'human';
    const sp = SPECIES?.[speciesId]?.spriteMods || {};
    return {
      skin: cw.SKIN || c.skin || '#e0a878', hair: cw.HAIR || c.hair || '#3a2416', eye: c.eye || '#37527a',
      main: cw.MAIN || c.main || '#7a3030', alt: cw.ALT || c.alt || '#2f4f7f', accent: cw.ACCENT || c.accent || '#e3b34a',
      metal: cw.METAL || c.metal || '#aab2c0', leather: cw.LEATHER || c.leather || '#6b4a2a',
      cloth: cw.CLOTH || c.cloth || '#c8b58a', horn: cw.HORN || c.horn || '#8c8377', outline: cw.OUTLINE || '#170f0c',
      hairStyle: find('hair-', 'hair-bald').slice(5), beard: find('beard-', 'beard-none').slice(6),
      ears: find('ears-', '').slice(5) || (sp.ears !== 'round' ? sp.ears : '') || 'round',
      horns: null, scales: false, snout: false, fur: false, tusks: !!sp.tusks, markings: false,
      helm: find('helm-', 'helm-none'), outfit: find('outfit-', 'outfit-tunic'), cloak: find('cloak-', 'cloak-none'),
      weapon: find('wep-', 'wep-none'), shield: find('shield-', 'shield-none'),
      marks: nl.stack.filter((n) => n.startsWith('mark-') || n.startsWith('back-')),
      speciesId, classId: null, body: nl.body || (fam.endsWith('-f') || fam.includes('goodwife') ? 'f' : 'm'),
      build: npcBody(single) || 'body-normal', scar: null, seed: hashStr(String(ch.id || ch.name || single)),
    };
  }
  const a = ch.appearance || {};
  const sm = speciesMods(ch);
  const helm = helmFor(ch);
  return {
    skin: a.skin || '#e0a878', hair: a.hair || '#3a2416', eye: a.eye || '#37527a',
    main: a.outfit || '#7a3030', alt: a.outfitAlt || '#2f4f7f', accent: a.accent || '#e3b34a',
    metal: a.metal || '#aab2c0', leather: a.leather || '#6b4a2a', cloth: a.cloth || '#c8b58a',
    horn: a.hornColor || '#8c8377', outline: '#170f0c',
    hairStyle: a.hairStyle || 'short', beard: a.beard || 'none',
    ears: a.ears || (sm.ears && sm.ears !== 'none' ? sm.ears : 'round'), horns: a.horns || null,
    scales: !!(a.scales ?? sm.scales), snout: !!(a.snout ?? sm.snout), fur: !!(a.fur ?? sm.fur),
    tusks: !!(a.tusks ?? sm.tusks), markings: !!(a.markings ?? sm.markings),
    helm, outfit: outfitFor(ch), cloak: cloakFor(ch), weapon: weaponFor(ch), shield: shieldFor(ch),
    marks: [marksFor(ch).front, marksFor(ch).back].filter(Boolean),
    speciesId: ch.speciesId || 'human', classId: ch.classes?.[0]?.id || null, body: a.body || 'n',
    build: bodyFor(ch), scar: a.scar || null,
    seed: hashStr(String(ch.id || ch.name || '') + (a.skin || '') + (a.hair || '')),
  };
}

/** Draw just the head-and-shoulders of a character, for portraits and dialogue. */
export function drawActorBust(ctx, ch, x, y, size = 32) {
  // A person gets a painted bust; a creature still gets its sprite blown up.
  if (portraitLook(ch) && drawPortrait(ctx, ch, x, y, size)) return;
  const canvas = ch.sprite && hasSprite(ch.sprite) && !ch.layered
    ? null : actorCanvas(ch, 'down-0');
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, size, size);
  ctx.clip();
  const scale = size / 14;             // zoom so the head fills the frame
  if (canvas) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(canvas, 0, 0, canvas.width, 12, Math.round(x - (canvas.width * scale - size) / 2), Math.round(y - 1), Math.round(canvas.width * scale), Math.round(12 * scale));
  } else if (ch.sprite && hasSprite(ch.sprite)) {
    drawSprite(ctx, ch.sprite, 'down-0', x + size / 2, y + size * 1.6, {
      colorway: ch.colorway, scale, shadow: false,
    });
  }
  ctx.restore();
}

/**
 * Randomise an appearance for a species — used by "randomise" in character
 * creation and to give every generated NPC and recruit a distinct look.
 */
export function randomAppearance(species, r, opts = {}) {
  const cwPal = species?.colorways || {};
  const mods = species?.spriteMods || {};
  const pick = (arr, fb) => (arr && arr.length ? r.pick(arr) : fb);
  // A class dresses in its own colours when we know the class. Without this
  // the outfit came from one generic swatch list and a druid could roll the
  // same brown as a warlock.
  const cp = classPalette(opts.classId, r);
  const HAIR = APPEARANCE_OPTIONS.hairStyle;
  const BEARD = mods.beard === 'common' ? ['full', 'braided', 'goatee', 'mustache', 'stubble']
    : mods.beard === 'none' ? ['none'] : ['none', 'none', 'stubble', 'goatee', 'full'];
  const OUTFITS = ['#7a3030', '#2f4f7f', '#3f6b3a', '#5a3a6b', '#8a6a2a', '#4a4a52', '#7a4a20', '#2f6b6b'];

  return {
    body: opts.body || r.pick(['m', 'f', 'n']),
    build: mods.build || r.pick(['slim', 'normal', 'normal', 'broad']),
    skin: pick(cwPal.skin, '#e0a878'),
    hair: pick(cwPal.hair, '#3a2416'),
    hairStyle: r.pick(HAIR),
    beard: r.pick(BEARD),
    eye: pick(cwPal.eye, '#37527a'),
    outfit: cp ? cp.main : r.pick(OUTFITS),
    outfitAlt: cp ? cp.alt : r.pick(OUTFITS),
    accent: cp ? cp.accent : r.pick(['#e3b34a', '#c0c6d0', '#b06a2a', '#7fbf6a']),
    metal: cp ? cp.metal : r.pick(['#aab2c0', '#c8b06a', '#9a8f80']),
    leather: cp ? cp.leather : r.pick(['#6b4a2a', '#54381f', '#7a5a34']),
    cloth: cp ? cp.cloth : r.pick(['#c8b58a', '#a89878', '#d8ccae']),
    ears: mods.ears && mods.ears !== 'round' ? mods.ears : null,
    horns: mods.horns ? r.pick(['curved', 'straight', 'ram', 'crown']) : null,
    tail: mods.tail ? r.pick(['thin', 'tufted', 'cat', 'scaled']) : null,
    hornColor: pick(cwPal.horn, '#8c8377'),
    // 'auto' hands these to the class. A player who wants a bare head or no
    // cloak picks the explicit 'none' and it is honoured.
    cloakStyle: 'auto',
    helmStyle: 'auto',
    bootStyle: 'auto',
    outfitStyle: 'outfit-tunic',
    wardrobe: 'auto',
    height: mods.height || 1,
  };
}


/**
 * What each calling actually wears, in colour.
 *
 * The outfit GRIDS gave every class its own cut, but the colours came out of
 * one generic eight-swatch list, so a druid and a warlock could both roll the
 * same brown and the party read as one costume in different silhouettes. The
 * NPC families in spritedata_chars.js look as distinct as they do for exactly
 * this reason: each one is pinned to a coherent palette. This gives the player
 * classes the same treatment, with two or three sets each so two clerics in
 * one party are not twins.
 *
 * main = the garment, alt = its second colour, accent = trim and metal fittings,
 * cloth = the shirt/underlayer the body layer shows at the arms.
 */
export const CLASS_PALETTE = Object.freeze({
  barbarian: [
    { main: '#8a5a3a', alt: '#5a3f22', accent: '#c8b06a', metal: '#9a8f80', leather: '#6b4a2a', cloth: '#b8a678' },
    { main: '#6a5a4a', alt: '#3f2c18', accent: '#b8ab97', metal: '#8e939c', leather: '#4e3218', cloth: '#a89878' },
  ],
  bard: [
    { main: '#8a2a5a', alt: '#c8a860', accent: '#f0d264', metal: '#c8b06a', leather: '#6b4a2a', cloth: '#d8ccae' },
    { main: '#2f4f7f', alt: '#c8306a', accent: '#e3b34a', metal: '#c8b06a', leather: '#54381f', cloth: '#d8ccae' },
    { main: '#3f6b3a', alt: '#e0a020', accent: '#f0d264', metal: '#c8b06a', leather: '#6b4a2a', cloth: '#c8b58a' },
  ],
  cleric: [
    { main: '#e8e2d2', alt: '#c8b06a', accent: '#e3b34a', metal: '#c8b06a', leather: '#7a6a48', cloth: '#ddd6c4' },
    { main: '#dfe4ec', alt: '#8a9ab8', accent: '#c0c6d0', metal: '#aab2c0', leather: '#6b4a2a', cloth: '#d8ccae' },
  ],
  druid: [
    { main: '#5a6b3a', alt: '#7a5a34', accent: '#8a9a6a', metal: '#9a8f80', leather: '#4e3218', cloth: '#b8a678' },
    { main: '#6a7a4a', alt: '#54381f', accent: '#c8b06a', metal: '#8e939c', leather: '#5a3f22', cloth: '#a89878' },
  ],
  fighter: [
    { main: '#7a3030', alt: '#4a4a52', accent: '#c4a24a', metal: '#a8b0bd', leather: '#57381d', cloth: '#c8b58a' },
    { main: '#3a4a6a', alt: '#4a4a52', accent: '#c0c6d0', metal: '#9aa2b0', leather: '#4e3218', cloth: '#a8a090' },
  ],
  monk: [
    { main: '#c07a2a', alt: '#7a2a2a', accent: '#e0a020', metal: '#9a8f80', leather: '#6b4a2a', cloth: '#d8ccae' },
    { main: '#8a6a3a', alt: '#4a3a2a', accent: '#c8b06a', metal: '#8e939c', leather: '#54381f', cloth: '#c8b58a' },
  ],
  paladin: [
    { main: '#2a3a6a', alt: '#c0c6d0', accent: '#e3b34a', metal: '#c0c6d0', leather: '#3f2c18', cloth: '#d8ccae' },
    { main: '#7a1f1f', alt: '#e8e2d2', accent: '#c8b06a', metal: '#aab2c0', leather: '#4e3218', cloth: '#ddd6c4' },
  ],
  ranger: [
    { main: '#3f5f3a', alt: '#4e3218', accent: '#8a6a2a', metal: '#8e939c', leather: '#4e3218', cloth: '#5a6b3a' },
    { main: '#4a5a4a', alt: '#54381f', accent: '#a89878', metal: '#9a8f80', leather: '#5a3f22', cloth: '#6a7a4a' },
  ],
  rogue: [
    { main: '#3a3a42', alt: '#2e2116', accent: '#8a2a2a', metal: '#8e939c', leather: '#2e2116', cloth: '#5a5a62' },
    { main: '#2f3a4a', alt: '#3f2c18', accent: '#6aa8b0', metal: '#8e939c', leather: '#3f2c18', cloth: '#4a5a6a' },
  ],
  sorcerer: [
    { main: '#8a1f3a', alt: '#c8306a', accent: '#f0d264', metal: '#c8b06a', leather: '#54381f', cloth: '#d8ccae' },
    { main: '#5a2a6a', alt: '#8a2a5a', accent: '#e3b34a', metal: '#c8b06a', leather: '#4e3218', cloth: '#c8b58a' },
  ],
  warlock: [
    { main: '#2a2230', alt: '#5a2a6a', accent: '#b07ae0', metal: '#8e939c', leather: '#2e2116', cloth: '#c8b58a' },
    { main: '#22303a', alt: '#2a5a5a', accent: '#6aa8b0', metal: '#8e939c', leather: '#3f2c18', cloth: '#a8a090' },
  ],
  wizard: [
    { main: '#2f4f7f', alt: '#1c2a4a', accent: '#c8b06a', metal: '#c8b06a', leather: '#54381f', cloth: '#d8ccae' },
    { main: '#3a2a5a', alt: '#5a4a7a', accent: '#e3b34a', metal: '#c8b06a', leather: '#4e3218', cloth: '#c8b58a' },
  ],
});

/** One of a class's palettes, or null for a class with none listed. */
export function classPalette(classId, r) {
  const sets = CLASS_PALETTE[classId];
  if (!sets || !sets.length) return null;
  if (r && typeof r.pick === 'function') return r.pick(sets);
  return sets[0];
}

/** Options the character-creation appearance step cycles through. */
export const APPEARANCE_OPTIONS = {
  hairStyle: ['short', 'sidepart', 'undercut', 'long', 'ponytail', 'braid', 'twinbraids', 'locs', 'curly', 'afro', 'topknot', 'lowbun', 'bob', 'wild', 'widowspeak', 'mohawk', 'shaved', 'bald'],
  beard: ['none', 'stubble', 'goatee', 'mustache', 'full', 'braided'],
  build: ['slim', 'normal', 'broad', 'stout', 'tall'],
  cloakStyle: ['auto', 'cloak-none', 'cloak-short', 'cloak-long', 'cloak-hooded'],
  helmStyle: ['auto', 'helm-none', 'helm-cap', 'helm-hood', 'helm-circlet', 'helm-horned', 'helm-wizard', 'helm-great'],
  bootStyle: ['auto', 'boots-none', 'boots-tall', 'boots-cuffed', 'boots-sandal', 'boots-wraps', 'boots-plate', 'boots-court'],
  outfitStyle: ['outfit-tunic', 'outfit-robe', 'outfit-leather', 'outfit-noble', 'outfit-peasant', 'outfit-monk'],
  wardrobe: ['auto', 'outfit-tunic', 'outfit-doublet', 'outfit-noble', 'outfit-coat', 'outfit-robe', 'outfit-jerkin', 'outfit-ranger', 'outfit-monk', 'outfit-vestments', 'outfit-druidwear', 'outfit-gambeson', 'outfit-peasant', 'outfit-fur', 'outfit-tabard', 'outfit-leather', 'outfit-plate'],
  horns: [null, 'curved', 'straight', 'ram', 'crown'],
  tail: [null, 'thin', 'tufted', 'cat', 'scaled'],
  ears: [null, 'pointed', 'long', 'cat'],
};

/** Fallback palettes when a species doesn't supply its own. */
export const GENERIC_PALETTES = {
  skin: ['#f6d5b4', '#e8bd95', '#e0a878', '#c98d5e', '#a86f45', '#8a5734', '#6b4227', '#4e2f1c'],
  hair: ['#1c1410', '#3a2416', '#5a3a20', '#7a5a2a', '#a8823a', '#c8a860', '#8a2a2a', '#b04a2a',
    '#6a6a72', '#a8a8b0', '#d8d8e0', '#2a3a5a', '#4a2a5a', '#2a5a3a'],
  eye: ['#37527a', '#2a6a4a', '#6a4a2a', '#4a2a1a', '#7a2a2a', '#5a4a7a', '#8a8a3a', '#3a3a3a', '#c8b060'],
};
