---
name: pixel-art
description: Create pixel characters, sprites, tilesets and pixel art, and export them as PNG or animated GIF. Use whenever asked to design, draw, edit or animate a sprite or pixel character, produce a sprite sheet or game character art, or convert a PNG into editable pixel art. Sprites are authored as text grids and rendered with a local zero-dependency tool.
---

# Pixel art

Use `pixelforge` at `C:\Users\Dizzy\Documents\DND GAME\pixelforge\files\pxforge.py`
(in a git worktree, the copy inside it: `pixelforge/files/pxforge.py`). It uses
only the Python standard library. On this machine, invoke it with Codex's bundled
runtimes (the system node is too old):

```bash
PY=C:/Users/Dizzy/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe
NODE=C:/Users/Dizzy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe
$PY pixelforge/files/pxforge.py --help
```

Sprites are `.pxa` text files (palette + ASCII grid), so author them with Write
and change them with Edit. The image is a build artifact, never the source.

## The loop (game art for Sword Coast Chronicles)

1. Author `assets/pixel/<area>/NAME.pxa` (`vfx/ light/ props/ chars/ monsters/ tiles/ ui/`).
   `@name` is the sprite id the game registers; keep it unique (`fx-...`, `prop-...`).
2. `preview FILE` → **`Read` the PNG** → locate the flaw by its (x, y). Fix, repeat.
   Animations: `preview FILE --frame F --onion --frames`; outfits: `--colorways`;
   damage-type variants: `--recolor`; the layer stack: `--layers`.
3. `lint FILE` → fix each finding by the frame and cell it names (or add
   `@lint skip=code` with a comment saying why the rule does not apply).
4. `$NODE tools/pxbuild.mjs` → writes `src/render/art/<@name>.js`, a module that
   registers the sprite with `render/sprites.js` when imported. `--check` proves
   every module is fresh (deterministic output, so stamps stay stable).
5. In game code: `import DEF from '../render/art/<id>.js';` then
   `drawSprite(ctx, id, animFrame(id, anim, t), x, y)`. Points and timing live on
   the export (`DEF.points.flame`, `DEF.anims.burn.ms`).
6. See it in the game: `$NODE tools/shot.mjs --scenario town --script tools/pxprobe.js
   --eval "window.PXPROBE={modules:['<id>'],gallery:[[['<id>',2]]]}" --out output/<you>/px.png`,
   then Read the PNG.

Never hand-edit a generated `src/render/art/*.js`; edit the `.pxa` and rebuild.

## Format

```
@name  fx-torch-flame
@scale 12
@size  9x15
@ramp  fire fire 5 01234          # keys 0-4 from palette.js RAMPS.fire (dark -> light)
@ramp  wood #8a5a34 4 abcd        # or hue-shifted from a hex, exactly like ramp()
@palette
K #1d1b24 outline
m MAIN                            # UPPERCASE colorway token: recolours per outfit
@anchor 4,15                      # the pixel that stands on the world
@point  base 4,14                 # attachment points for other sprites
@recolor fire magic               # also fx-torch-flame-cold, -necrotic, -radiant ...
@lint  skip=pillow,light          # a flame is lit from inside

@frame burn-0 dur=100             # burn-0, burn-1 ... form the `burn` animation
....0....
@layer tongue at=3,0              # a layer on top; a @layer with no rows repeats
```

`.` is transparent. Every row the same width (`validate`; `ascii -n` shows rulers).
`@anim ID f0 f1 f0 loop=0` declares an animation explicitly. `@use chr16` gives a
generic palette (`1 2 3` skin, `4 5 6` / `7 8 9` cloth, `m M` metal, `h H` hair,
`K` outline, `k` shadow, `W` highlight, `e` eye), but game art should take its
colours from `@ramp` so it agrees with the world's `render/palette.js`.

## Commands

`new preview lint export render sheet gif watch ascii validate info edit import diff palettes templates`

`edit` ops apply in the order typed (`--frame F`, `--all`, `--layer NAME`):
drawing `--set X,Y=C` `--line` `--rect` `--frect` `--ellipse` `--fellipse` `--fill`
`--row Y=STRING` `--col` `--replace A=B` `--paste X,Y=FILE`; craft
`--autoshade RAMP,tl,.K[,form]` (top-left light; `form` shades the volume, not
the rim) `--selout K` (selective outline) `--dither X,Y,W,H=AB[,grad=v]` (ordered
dither) `--perfect K` (drop L-corner doubles) `--outline K[,diag]`; transforms
`--mirror l|r` `--flip-h` `--trim` `--pad` `--crop` `--scale N` `--rot N`
`--flatten`; frames `--add-frame NAME=COPYOF` `--del-frame`.

In PowerShell use **single** quotes for op values: `--row '16=....K44K....'`.

Full reference and recipes: `pixelforge/files/README.md`. Self-test:
`$PY pixelforge/files/selftest.py`.

## Craft (what lint and the art director check)

- Silhouette first: if the blocked shape doesn't read at 1x, detail won't save it.
- Light from the **upper left**, everywhere. Hue-shift: cool shadows, warm lights.
- ~3 tones per material; 5-step ramps leave room for one highlight and one deep shadow.
- Outline last, then `--selout` so the lit side isn't walled in black; `--perfect`
  for clean 1px lines. Light sources (flames, spells) have no outline.
- No orphan pixels, no pillow shading, no banding (1px parallel ramp stripes),
  no jaggies (stair steps 1,3,1). `lint` finds all of these by cell.
- World sprites keep the world's density: humanoids 16x24 on 16px tiles.
- FX timing: fast in, slow out (40-60ms at impact, 100-120ms as it fades).
