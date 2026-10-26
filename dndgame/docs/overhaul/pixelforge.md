# pixelforge — the art pipeline (Art fleet)

Branches `overhaul/pixelforge` (first attempt, stopped by the usage limit) and
`overhaul/pixelforge-r2` (this one). Owns `pixelforge/**`, `tools/pxbuild.mjs`,
`tools/pxprobe.js`, `scripts/build-*.mjs`, both `pixel-art` SKILL.md files, the
generated `src/render/art/*.js` modules and the `.pxa` sources I authored as proof.

## Plan

1. **Format** (`pxlib/fmt.py`), all backward compatible with existing `.pxa`:
   UPPERCASE colorway tokens kept verbatim; `@ramp NAME BASE N KEYS` from an
   exact port of `render/palette.js` `ramp()` (BASE `#hex` or a `RAMPS` name,
   parsed out of palette.js so the two never drift); `@frame NAME dur=MS`,
   `@anim`; `@layer NAME [at=X,Y]` stacks flattened at render; `@recolor`;
   `@export frames` for the satchel's legacy shape; `@anchor`/`@point`; `@lint`.
2. **Craft ops** (`pxlib/ops.py`, `edit`): `--selout`, `--dither`, `--perfect`,
   `--autoshade` with ramp names and a `form` mode, `--layer`, `--flatten`.
3. **Inspection**: `preview --onion --frames --layers --recolor --colorway(s) --lint`;
   `sheet`/`gif` honour `dur=`.
4. **`lint`**: stray, orphan, doubles, jaggy, banding, pillow, light, colors, dupes, ramp.
5. **Export**: `pxforge.py export FILE.pxa --js OUT.js --name ID` and
   `tools/pxbuild.mjs`; the satchel folded in byte-identical.
6. **Proof assets** + in-game probe. 7. selftest, README, SKILL.md.

## Status

- [x] format  - [x] ops  - [x] preview  - [x] lint  - [x] export/pxbuild
- [x] satchel folded (byte-identical, checked by selftest)
- [x] assets  - [x] probe screenshot  - [x] docs  - [x] landed

## For the other art agents

The workflow is in `.claude/skills/pixel-art/SKILL.md` (and the `.agents` copy)
and in full in `pixelforge/files/README.md`. In short: author
`assets/pixel/<area>/NAME.pxa`, `preview` + Read, `lint`, then
`$NODE tools/pxbuild.mjs`; the code that draws a sprite imports its module.

### Sprites ready to use (vfx / lighting / architecture agents)

| sprite id | source | size | anims (ms) | points |
|---|---|---|---|---|
| `fx-torch-flame` | `assets/pixel/light/torch-flame.pxa` | 9x15, anchor 4,15 | `burn` 6 frames x 100ms, loops | `base` 4,14 |
| `fx-impact-burst` | `assets/pixel/vfx/impact-burst.pxa` | 32x32, anchor 16,16 | `burst` 8 frames 40..120ms (570ms), once | `centre` 16,16 |
| `prop-brazier` | `assets/pixel/props/brazier.pxa` | 16x24, anchor 8,24 (stands like a humanoid) | `glow` 3 frames (coals pulse), loops | `flame` 7,10, `light` 7,5 |

Each has damage-type recolours from palette.js `magicRamp` colours:
`<id>-fire -cold -lightning -thunder -acid -poison -necrotic -radiant -psychic
-force -arcane -healing` (the base ids are fire-coloured flame/coals and an
arcane-violet burst).

- A lit brazier: draw `prop-brazier[-kind]` at its anchor, then
  `fx-torch-flame[-kind]` so the flame's `base` point lands on the brazier's
  `flame` point (see `brazier()` in `tools/pxprobe.js`). Light sources for the
  grade/glow layers sit at `prop-brazier` `points.light`.
- A spell hit: `drawSprite(ctx, 'fx-impact-burst-' + dtype, animFrame('fx-impact-burst', 'burst', t), x, y)`
  with `t` from 0 to `DEF.anims.burst.ms / 1000`; `animFrame` holds the last
  frame after a one-shot ends, so stop drawing at `ms`.
- Uneven `dur=` timing is expanded in `anims.<id>.frames` so sprites.js's
  fixed-fps `animFrame()` plays it at the authored tempo; `.seq` and
  `.durations` keep the exact timing.

## Decisions and rules learned

- Python is the only `.pxa` implementation; `pxbuild.mjs` shells out to it once
  per batch (`export --manifest -`) and re-derives every `@ramp` with the real
  palette.js, refusing to write if the port disagrees.
- No generated index module: two agents adding art would both edit it.
- `@ramp` requires KEYS unless the name is exactly N characters long (then the
  name is the keys): auto-assigned keys would silently collide with `@palette`.
- The `doubles` (pixel-perfect) rule is for 1px outlines; VFX rings drawn two
  pixels heavy on purpose skip it (`@lint skip=doubles` with a comment).
- A flame is the light: no outline, and `pillow`/`light` do not apply
  (`@lint emissive=fire` exempts a ramp inside a lit prop).

## Log

- r1: format, ops, lint, export, pxbuild, the three assets, the probe.
- r2: fixed the colorway selftest (it read the bevel pixel, not the gem),
  lint-clean burst, README + SKILL.md rewritten for the game workflow, probe
  screenshot in the running game, landed. Then art-director passes, seen in
  game (`output/px/probe3-*.png`): the brazier's closed bowl with prongs read
  as a robot's visor, so it is now an open dish seen from above (concave inner
  wall lit on the far right, convex body lit on the left, a riveted band, a
  bed of clumped coals); the burst's late frames faded through the darkest
  ramp step, which on lit ground reads as scorch marks or blood, so they now
  fade by thinning, and the scribbled centre is one puff of spent magic that
  rises and comes apart.
- For the vfx agent: the burst is drawn with normal blending in the probe; on
  the `glow` (lighter) layer the same frames also work, brighter.
