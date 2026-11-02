# characters — character art, poses and portraits

Owner of `render/spritedata_chars.js`, `render/actor.js`, `render/sprites.js`.

## Plan (in landing order — each step is shippable on its own)

1. **Colour.** `makeColorway()` derives every `_D`/`_L` token from
   `palette.js ramp()` instead of `shadeHex()` toward black, so every layered
   character, NPC family and beast re-shades at once: cool violet shadows,
   warm lights, saturated mids. Token names are unchanged, so colorway seeds
   and saved appearances recolour exactly as before.
2. **Selective outline + rim light**, done once on the COMPOSED actor canvas
   (so it sees the whole silhouette, not one layer): each outline pixel takes
   `outlineFor()` of the fill it borders; interior seams soften to a shade of
   their neighbour; fill pixels on the upper-left edge of the silhouette get
   one warm rim step. Cached with the composite, so still one drawImage/frame.
3. **Poses** (OVERHAUL 4.6): `idle` (breathing), `attack` (wind-up, strike,
   follow-through), `cast` (raise, release, with a glow point), `shoot` (2),
   `hurt` (1), `ko` (1, lying). Derived per layer programmatically from the
   walk frames (row shifts, arm patches), weapon stays on its pivoting layer.
   `actorPoseFrames(ch, pose, dir)` and `drawActor(..., { pose, poseT })`,
   falling back to walk frames for anything missing.
4. **Portraits.** `drawPortrait(ctx, ch, x, y, size, opts)` paints a 40x40
   bust from the same appearance data (species face shape, skin ramp, eyes,
   brows, hair, beard, scars, headgear, class garment at the shoulders),
   cached per signature, blitted at an integer device-pixel scale so it stays
   crisp on the 2x UI layers. `drawActorBust` routes to it; kit's
   `UI.portrait` uses it through a guarded hook in sprites.js.
5. **Silhouettes.** Wizard hat + staff, paladin tabard, barbarian furs,
   cleric holy symbol, ranger hood + bow, bard's instrument; weak NPC families.

## Tools

- `tools/charprobe.js` — shot.mjs `--script` probe; pages `sheet`, `folk`,
  `poses`, `portraits`; `window.CHARPROBE = { pages: [...] }` cycles pages so
  `--frames N --every 1200` shoots N pages in ONE browser run.
- Before/after: `git archive` main into `output/base`, copy the probe in, run
  the same command in both trees.

## Status

- [x] 1 colour  - [x] 2 outline/rim  - [x] 3 poses  - [x] 4 portraits (landed in r2)  - [x] 5 silhouettes + townsfolk (r2)

## Pose API (landed in increment 1)

```js
import { drawActor, actorPoseFrames, actorPosePoint, POSE_NAMES } from '../render/actor.js';
actorPoseFrames(ch, 'attack', 'left')   // ['attack-left-0','attack-left-1','attack-left-2']
drawActor(ctx, ch, x, y, { dir: 'left', pose: 'attack', poseT: 0.4 })  // poseT = progress 0..1
drawActor(ctx, ch, x, y, { frame: 'cast-down-1' })                     // a pose frame by name
actorPosePoint(ch, 'cast', 'down', 1)  // { x, y } of the hands from the feet, for VFX origins
```
- Frame counts: idle 2 (loops), attack 3 (wind-up, strike, follow-through),
  cast 2 (raise, release), shoot 2, hurt 1, ko 1 (lying, eyes shut).
- One-shots hold their last frame from poseT 1 on; idle/walk loop on the
  fraction. `poseFrame: n` picks a frame outright. `swing` still adds to the
  weapon's angle on top of the pose.
- Anything that cannot take a pose (a monster drawn as one sprite with no
  `<pose>-<dir>-<n>` frames of its own) falls back to the walk frames. A
  monster sprite that DOES define e.g. `attack-left-0` gets it drawn as-is.
- Baked NPC families (`npc-*`) take the recipes as one piece (lean, crouch,
  ko), since their arms are flattened in.

How it works: `POSES`/`ATTACK` in actor.js are recipes (upper-body shift, arm
moves 'up' | 'out' | 'diag' | [dx,dy], weapon angle). `composeSprite` runs a
per-layer `xf` on a composite-sized buffer, so the same move applies to body,
outfit and anything else in register; `closeOutline` seals the silhouette
around a moved arm; `finishSprite` then lights it. Arm geometry per build is
`BODY_ARMS` in spritedata_chars.js — a new body build must add its row there.

## Portrait API (landed in r2)

```js
import { drawPortrait, portraitLook } from '../render/actor.js';   // or render/portrait.js
drawPortrait(ctx, ch, x, y, size, { h, flip, bg, tint, tintAmt })   // true if it painted
portraitCanvas(portraitLook(ch))                                     // the raw 40x40 bust canvas
```
- `render/portrait.js` paints a 40x40 bust from `portraitLook(ch)` (actor.js):
  the same helm/outfit/cloak/class-mark resolution the sprite uses, so the face
  in the dialogue box is the person in the street. Baked townsfolk (`npc-*` and
  their `-vN` variants) are read back from the stack they were flattened from
  (`npcLook()` in spritedata_chars.js). Creatures return null -> false, and every
  caller falls back to the old blown-up sprite head.
- Blits at the largest integer DEVICE scale that fits the box (a 20px box on a
  2x UI layer shows the whole bust 1:1), or crops round the eyes when the box
  is smaller. Cached per look signature (`lookKey` — add any new look field).
- Hooks: `drawActorBust` (hud, dialogue, shop) routes to it; kit's `UI.portrait`
  reaches it through `portraitPainter()` in sprites.js (portrait.js registers
  itself with `setPortraitPainter` on load), so kit never imports the character
  modules. That is a small guarded hook in ui/kit.js, owned by `kit`.

## Class marks and townsfolk (landed in r2)

- `marksFor(ch)` in actor.js adds what reads at 16x24 whatever the character
  wears: barbarian `mark-furs` (pelt in MAIN), paladin in armour `mark-tabard`,
  cleric in armour `mark-symbol`, bard `back-lute`, ranger `back-quiver`.
  `appearance.classMarks === false` turns them off. Wizard hat redrawn (bent
  cone, gold band, brim over the brow, eyes under it).
- `mark-*` layers go over the outfit and count as sleeve for poses (the pelt's
  arm tufts move with the arm). `back-*` layers draw after the cloak and behind
  the body, except in `up` frames, where they go over the back. `stackFor()`
  applies the same rule to baked NPC stacks.
- Shared material colours are literal PAL keys off `RAMPS` (wood u/U/v, straw
  y/Y/Q, linen i/I) — not colorway tokens, because a lute is walnut whoever
  carries it.
- New layers: `helm-straw`, `helm-coif` (both in HELM_STYLES), `mark-apron`,
  `mark-straps`, `back-pack`. Families: farmer (straw hat), porter (pack),
  hunter (quiver, cloak moved behind the body, woodland alt), minstrel (lute),
  innkeeper + goodwife (apron, coif), beggar (cloak and cowl drawn in order and
  drab -- it used to be stacked last in default blue, a sack with a beard).
- Rule learned: any `cloak-*` in an npc() stack must come FIRST; flatten draws
  in stack order and a late cloak buries the whole figure.

## Seen from behind (landed in r2)

- `up` frames reorder the stack (actorLayers and `stackFor`): body, outfit,
  front mark, CLOAK, tail, hair (unless the cloak is hooded), helm, slung gear,
  shield, weapon. A cloak used to sit behind the body in every facing, so a
  cloaked hero walking north showed a bare back with a 2px fringe.
- Each cloak has a back drape of its own (`CLOAK_BACK_*`): collar, widening
  shoulders that hide the arms, folds, an A-line hem that swings with the
  stride. A barbarian's pelt is worn over the cape; a tabard under it.
- Long hair from behind has a lit crown and a drifting parting.

## Portrait fixes (r2)

Shaved scalp is one smooth tone (was a stipple that read as a mesh cap);
stubble is a tint with sparse flecks (was a checker); beards streak downward;
horns are swept solid shapes lit from the upper left (were per-point slabs the
outline pass turned into dotted chains); dragonborn frills are rooted in the
jaw; hoods use CLOTH like the sprite's helm-hood; the tabard device is ACCENT
like the sprite's. New busts for helm-straw, helm-coif, apron, porter's pack.

## Followups for other owners

- Nobody requests poses yet: `ui/combatui.js` draw (battlefield) can pass
  `pose: 'attack' | 'cast' | 'shoot' | 'hurt' | 'ko', poseT` to drawActor where
  it now only passes `swing`, and use `actorPosePoint()` as the VFX origin;
  entity.js draw (lighting) can pass `pose: 'idle', poseT` for breathing.
- Character creation (menus) could expose `appearance.classMarks` (on by
  default) and the two new helm styles already listed in HELM_STYLES.

## Tools

### 20 Oct 2026 — city tailoring follow-on

Six outfits now consume separately authored PixelForge `down`, `left` and
`up` grids from `assets/pixel/chars/tailored-*.pxa`: noble, doublet, coat,
robe, plate and jerkin. `outfit()` passes these into the existing sixteen-frame
layer builder; right profiles mirror the left and robe hems swing in the walk
frames. The NPC baker uses the same layers, so merchants, nobles, minstrels
and scribes receive the improvements too. Palette tokens still derive from
the existing appearance record, shared with portraits. No resolution change.

The side-facing plate tasset is a single near-thigh plane with its far side
recessed, rather than the paired front plates. Refine source `.pxa` grids and
rebuild with `tools/pxbuild.mjs`; never edit generated `src/render/art` files.
Evidence: `output/city-art/final/characters.png` and the full city-art review.

- `tools/charsheet.mjs` — renders the game's own actor/portrait code to PNG in
  Node through a tiny canvas stand-in, no browser: pages `classes`, `species`,
  `poses`, `folk`, `portraits` (`--who`, `--dirs`, `--cols`, `--zoom`). `--root
  output/base` renders another tree (e.g. `git archive 895abba src | tar -x -C
  output/base`) for before/after. Confirm finished work in the browser with
  `tools/charprobe.js`; the two have matched pixel for pixel so far.
