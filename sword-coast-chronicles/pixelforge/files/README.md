# pixelforge

A pixel-art pipeline for Claude. Sprites are **text** (`.pxa`: a palette plus an
ASCII grid), so they can be authored with `Write`, changed with `Edit`, reviewed
with `diff`, linted like code, rasterized to PNG/GIF on demand, and compiled into
the game (*Sword Coast Chronicles*) as ES modules.

Pure stdlib — PNG and GIF encoders are written from scratch. Nothing to install.

```bash
PY=C:/Users/Dizzy/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe
NODE=C:/Users/Dizzy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe
$PY pixelforge/files/pxforge.py --help
```

## Why this shape

I can't push pixels around a canvas, but I can write and edit a character grid
precisely. So the sprite lives as text and the image is a build artifact. The
loop that actually works:

1. `new` a canvas (optionally over a proportion guide)
2. Write or `edit` the grid
3. `preview` → **`Read` the PNG** → find the mistake by its (x, y)
4. `lint` → fix what it names by (frame, x, y)
5. Fix that coordinate, repeat
6. `render` / `sheet` / `gif` for standalone output, or `tools/pxbuild.mjs` for the game

Step 3 is the point. `preview` draws numbered rulers, a pixel grid and a palette
legend, so a flaw in the image maps back to an exact cell to change.

## The game pipeline

```
assets/pixel/<area>/NAME.pxa   (the source; commit it)
      │  $PY pxforge.py preview / lint   (look, fix, look again)
      ▼
$NODE tools/pxbuild.mjs         (every .pxa -> one module each)
      ▼
src/render/art/<@name>.js      (generated; registers the sprite on import)
      ▼
import '../render/art/fx-torch-flame.js';
drawSprite(ctx, 'fx-torch-flame', animFrame('fx-torch-flame', 'burn', t), x, y);
```

- **Areas** are folders by owner: `vfx/` (spell FX), `light/` (flames, glows),
  `props/`, `chars/`, `monsters/`, `tiles/`, `ui/`. The folder is only for people;
  the module name comes from `@name`, which must be unique across the repo.
- **A generated module** exports a frozen definition — `{ w, h, anchor, points,
  palette, frames, anims, recolor }` — as a named constant and as `default`, and
  calls `defineSprite(id, def)` from `render/sprites.js` for itself and every
  `@recolor` variant. Frames are string rows plus a palette, exactly what
  `defineSprite` expects; UPPERCASE colorway tokens stay tokens, so a character
  still recolours per outfit.
- **Deterministic.** Same `.pxa` -> same bytes, every time, on every machine, so
  `tools/stamp.mjs` hashes stay stable and `pxbuild --check` is a real gate.
- `pxbuild` rewrites only modules whose bytes changed, deletes modules whose
  source is gone, re-derives every `@ramp` with the *real* `render/palette.js`
  `ramp()` (it refuses to write if the Python port ever disagrees), and re-stamps
  the import map. No index module is generated: two agents adding art would both
  edit it. The code that draws a sprite imports its module.
- `pxbuild --check` exits 1 if anything is stale; `--lint` / `--strict` lint the
  sources as they build.
- One sprite: `$PY pxforge.py export FILE.pxa --js OUT.js --name ID` (`--check`
  compares instead of writing).
- **The satchel** (`assets/pixel/satchel.pxa` -> `src/render/satchel-art.js`)
  builds the same way through `@export frames SATCHEL src/render/satchel-art.js`,
  byte-identical to the old `scripts/build-satchel.mjs` (which now just calls
  pxbuild).

In game code, read timing and attachment points from the module's export, not
from the sprite registry (which keeps only what `drawSprite` needs):

```js
import BRAZIER from '../render/art/prop-brazier.js';
import FLAME from '../render/art/fx-torch-flame.js';
const [px, py] = BRAZIER.points.flame, [fx, fy] = FLAME.points.base;
BRAZIER.anims.glow.ms   // one pass in ms; .seq/.durations keep uneven timing
```

`tools/pxprobe.js` is a `tools/shot.mjs --script` probe that imports compiled
art and draws it inside the running game (braziers beside the hero, a burst
looping, a gallery of every frame). Point it at your own sprites with
`--eval "window.PXPROBE = { modules: ['prop-anvil'], gallery: [[['prop-anvil', 2]]] }"`.

## The .pxa format

```
@name   fx-torch-flame       # also the sprite id the game registers
@use    chr16                # load a built-in palette's key->color map
@scale  12                   # default render scale
@fps    8                    # default frame rate (a frame's dur= wins)
@size   16x24                # frame size; needed only when layers are offset
@ramp   fire fire 5 01234    # 5 keys, dark -> light, from palette.js RAMPS.fire
@ramp   wood #8a5a34 4 abcd shift=16   # or from ramp('#8a5a34', 4, {shift:16})
@palette                     # per-file additions/overrides
c #7fd4ff cape               # <key> <#hex | transparent | TOKEN> [note]
a MAIN                       # an UPPERCASE colorway token: recoloured in game
@anchor 8,24                 # the point that stands on the world
@point  flame 7,10           # named attachment points
@anim   burn burn-0 burn-1 burn-2 loop=0
@recolor fire magic          # also register one sprite per damage-type ramp
@lint   skip=orphan,stray colors=12 emissive=fire

@frame burn-0 dur=100        # or a bare @grid for a single-frame sprite
....KKKK....                 # rows straight after @frame: the base layer
@layer flame at=2,0          # more layers, stacked bottom to top
..33..
@layer bowl                  # a layer with no rows repeats its last grid
```

- `.` is transparent unless redefined. Every row of a frame is the same width.
  Full-line `#` comments are ignored outside grid blocks and survive `edit`.
- Colors: `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgba(...)`, `transparent`, or an
  UPPERCASE colorway token (`MAIN MAIN_D MAIN_L ALT SKIN SKIN_D HAIR EYE METAL
  LEATHER CLOTH ACCENT OUTLINE ...`, the tokens `render/sprites.js` recolours).
  Previews resolve tokens through a port of `makeColorway()`.
- A UTF-8 BOM is tolerated, so PowerShell heredocs into `Out-File` work.

### @ramp — hue-shifted ramps

`@ramp NAME BASE N KEYS [spread=] [shift=] [desat=] [at=]` creates N palette
keys, dark to light, with cool shadows and warm lights. BASE is a `#hex` (run
through an exact port of `render/palette.js` `ramp()`, options and all) or the
name of one of palette.js's `RAMPS` (`iron fire cold arcane leaf stone ...`),
which is taken verbatim. A NAME as long as N doubles as its keys
(`@ramp abcde #8a5a34 5`). Use ramps rather than hand-picked hexes: the game's
tiles, FX and UI share them, so your sprite agrees with the world around it.

### @frame, @anim — timing

`@frame NAME dur=MS` gives a frame its own hold time. Frames named
`group-0 group-1 ...` form an animation automatically; `@anim ID f0 f1 ...
[loop=0]` declares one explicitly (a frame may appear more than once). Uneven
durations are expanded by their common divisor in the export, so sprites.js's
fixed-fps `animFrame()` plays them at the authored tempo. `gif` and `sheet`
honour `dur=`.

### @layer — a stack inside one file

Rows right after `@frame` are the base layer; each `@layer NAME [at=X,Y]` draws
on top, offset by `at`. A layer with no rows repeats that layer's previous grid,
so a brazier's bowl is drawn once and only the coals animate. Layers are
flattened (bottom to top, `.` lets lower layers show) at render and export.
`edit --layer NAME` paints into one layer; `edit --flatten` bakes them.

### @recolor — one shape, many lights

`@recolor RAMP magic` registers `ID-fire`, `ID-cold`, `ID-lightning`,
`ID-necrotic`, `ID-radiant` ... (every palette.js damage-type ramp, plus arcane
and healing) with that ramp's keys swapped. `@recolor RAMP teal=#2a9a9a,cold`
picks names and adds a custom base. A spell that deals cold damage draws
`fx-impact-burst-cold`.

### @export — legacy shapes

`@export frames CONST PATH` writes `export const CONST = { frame: [rows] }` to
PATH (the satchel's shape) instead of a registering module.

## chr16 — the default palette

Built for character work: ramps are adjacent keys, so shading is `+1`/`-1` on a
character rather than a color decision.

| keys | meaning | keys | meaning |
|------|---------|------|---------|
| `1 2 3` | skin dark → light | `m M` | metal dark / light |
| `4 5 6` | cloth A dark → light | `h H` | hair dark / light |
| `7 8 9` | cloth B dark → light | `W` | highlight |
| `K` | outline | `e` | eye |
| `k` | shadow | `s` | guide grey (template blocking) |

Others: `pico8`, `sweetie16`, `db16`, `edg32`, `gb`, `mono`. List with
`pxforge.py palettes [name]`. For game art, prefer `@ramp` from palette.js.

## Commands

| command | what it does |
|---------|--------------|
| `new FILE --size WxH [--template T] [--frames a,b]` | scaffold a canvas |
| `preview FILE [--frame F] [--scale N] [flags]` | **annotated PNG for inspection** |
| `lint FILE... [--skip codes] [--max-colors N] [--strict]` | pixel-art faults by cell |
| `export FILE --js OUT.js [--name ID] [--check]` | compile one sprite to a game module |
| `render FILE [--scale N] [--bg #hex] [--pad N]` | clean PNG of one frame |
| `sheet FILE [--cols N] [--gap N] [--label] [--onion] [--recolor K]` | all frames as a sprite sheet |
| `gif FILE [--fps N] [--loop N]` | animated GIF (per-frame `dur=`) |
| `watch FILE [--port N]` | live browser view that repaints on every save |
| `ascii FILE [-n] [--all]` | grid as text; `-n` adds rulers |
| `validate FILE` | row widths, frame sizes, undefined keys |
| `info FILE` | size, frames, color histogram |
| `edit FILE [ops...]` | drawing, craft ops and transforms (below) |
| `import FILE.png [--grid N] [--max-colors N]` | PNG → editable `.pxa` |
| `diff A B` | list differing cells |
| `palettes` / `templates` | list what's built in |

`ascii -n` works on **invalid** files on purpose — it's the diagnostic tool, and
it marks ragged rows with their character delta.

### preview flags

| flag | shows |
|------|-------|
| `--onion` | the previous frame ghosted red and the next blue underneath (animation arcs, popping) |
| `--frames` | a strip of every frame with its ms |
| `--layers` | a strip of this frame's layers, bottom to top |
| `--recolor` | a strip of every `@recolor` variant |
| `--colorway [LABEL:]main=#3a5a9a,skin=...` | tokens resolved with these seeds (or `TOKEN=#hex`) |
| `--colorways` | the preset outfits side by side: check a character recolours cleanly |
| `--lint` | this frame's lint findings boxed on the image |

### edit ops

Applied in the order typed. `--frame` targets one frame (default: first),
`--all` targets every frame, `--layer NAME` one layer of a layered frame (`base`
is the unnamed one). `--dry` prints instead of saving. Comments are kept.

Drawing — `--set X,Y=C` `--line X0,Y0,X1,Y1=C` `--rect X,Y,W,H=C`
`--frect` (filled) `--ellipse` `--fellipse` `--fill X,Y=C` (flood)
`--row Y=STRING` `--col X=STRING` `--replace A=B[,C=D]`
`--paste X,Y=FILE[:FRAME]`

Craft —
- `--autoshade RAMP[,LIGHT[,EMPTY]][,form][,depth=N]` lightens lit edges and
  darkens shadowed ones from LIGHT (`tl` is this world's light). RAMP is keys
  (`456`) or an `@ramp` name. `form` shades the volume from a blurred-mask normal
  instead of the rim (no pillow shading); `depth` is how far in it reaches.
- `--selout K[,light=tl][,shadow]` selective outline: outline cells on the lit
  side take a darker step of the fill they wrap, the shadow side stays `K`.
- `--dither X,Y,W,H=AB[,t=0.5][,grad=v|h|r][,pattern=bayer4|bayer2|checker][,mask=*]`
  ordered dither between keys A and B, flat (`t`) or as a gradient; `mask` limits
  it to cells of one key.
- `--perfect [X,Y,W,H=]KEYS` the pixel-perfect pass: drops L-corner doubles from
  1px lines of KEYS (what `lint` calls `doubles`).
- `--outline C[,diag][,in]` re-derives an outline from the silhouette.

Transforms — `--flip-h` `--flip-v` `--mirror l|r` `--rot N` `--shift DX,DY`
`--trim` `--pad L,R,T,B` `--crop X,Y,W,H` `--scale N` `--flatten`

Size-changing ops (`trim`, `pad`, `crop`, `scale`, `rot`) always apply to every
frame, so frames can't drift out of sync.

Frames — `--add-frame NAME[=COPYOF]` `--del-frame NAME`

### lint

Every finding names a frame and a cell. Heuristics tuned to be quiet on clean
art; switch a check off per file with `@lint skip=code,...` and say why in a
comment (a flame is *meant* to be brightest in the middle).

| code | fault |
|------|-------|
| `stray` | an opaque pixel with nothing around it |
| `orphan` | a lone pixel too close in value to its neighbours to read (noise) |
| `doubles` | an L-corner in a 1px outline (fix: `edit --perfect K`) |
| `jaggy` | a silhouette edge stepping 1,3,1 instead of changing smoothly |
| `banding` | ramp steps running as 1px parallel stripes |
| `pillow` | a form darkened toward every edge alike, lit from nowhere |
| `light` | a form lit from the lower right (this world is lit from the upper left) |
| `colors` | more colours than the sprite can justify (`@lint colors=N`, `--max-colors`) |
| `dupes` | two keys of nearly the same colour |
| `ramp` | neighbouring ramp steps too close in value to read as two tones |

`@lint emissive=RAMP` exempts light sources from `pillow`/`light`;
`@lint outline=K` names the outline keys `doubles` checks (else it guesses).

## Recipes

Block in a character over a proportion guide, then drop the guide:

```bash
python pxforge.py new hero.pxa --size 16x24 --template humanoid16
# ...paint over the 's' cells...
python pxforge.py edit hero.pxa --replace "s=."
```

Symmetric character — draw the left half only, then mirror:

```bash
python pxforge.py edit hero.pxa --mirror l
```

Outline, shade from the top-left as a volume, then selective-outline and clean
the line (once outlined, pass `.K` as EMPTY so the outline counts as outside):

```bash
python pxforge.py edit hero.pxa --all --outline 'K,diag' --autoshade 'cloth,tl,.K,form' \
  --selout K --perfect K
python pxforge.py lint hero.pxa
```

A soft glow falloff with a dither instead of a hard band:

```bash
python pxforge.py edit glow.pxa --dither '0,6,16,4=23,grad=v'
```

An animation: check the arcs with onion skin, then the timing as a GIF:

```bash
python pxforge.py preview fx.pxa --frame burst-3 --onion --frames
python pxforge.py gif fx.pxa --scale 6
```

A character in every outfit:

```bash
python pxforge.py preview hero.pxa --colorways
```

Recover editable art from a rendered PNG (`--grid` = pixels per art pixel):

```bash
python pxforge.py import hero.png --grid 8 --max-colors 16
```

## Craft notes

- **Silhouette first.** If the blocked-in shape doesn't read at 1x, no amount of
  interior detail rescues it.
- **Few colors.** Three tones per material is usually plenty; five-step `@ramp`s
  leave room for a highlight and a deep shadow.
- **Hue-shift, don't just darken.** Shadows go cool, lights go warm — that is what
  `@ramp` does for you.
- **Outline last**, after the shape is settled — `--outline` re-derives it; then
  `--selout` so the lit side isn't walled in black.
- **Light from the upper left**, always. Pass `tl` to every `--autoshade`.
- **Light sources have no outline**: a flame's darkest ramp step is its edge.
- Eyes and any read-critical feature want maximum contrast against what's behind
  them, not "correct" color.
- **FX timing**: fast in, slow out (40-60ms at impact, 100-120ms as it fades).

## Gotchas

- In PowerShell, wrap op values in **single** quotes: `--row '16=....K44K....'`.
  Grid strings contain `.` and `=`; nested double quotes break the parser.
- `edit` writes in place unless given `-o`; on a layered frame it refuses to guess
  and asks for `--layer` (or `--flatten`).
- Never hand-edit `src/render/art/*.js`; the next `pxbuild` overwrites it.
- GIF export uses uncompressed-LZW: larger files, but provably decodable.
  Verified pixel-exact against an independent decoder.

## Watching it happen

```bash
python pxforge.py watch examples/dragon.pxa --port 8765
```

Serves `http://localhost:8765` — a page that polls the file, repaints when it
changes, and **flashes the cells that just changed**, with a running activity
log. Under Claude Code the `pixel-live` entry in `.claude/launch.json` opens it
via `preview_start`.

## Verify

```bash
$PY pixelforge/files/selftest.py        # 116 checks
$NODE tools/pxbuild.mjs --check          # generated modules match their sources
```

The selftest exercises every command, checks that invalid input is *rejected*,
decodes the emitted PNG and GIF with independently written decoders, compares
the colour port against the live `palette.js` (when node is on PATH), and
proves the export is deterministic and the satchel byte-identical.

## Layout

```
pxforge.py        CLI
selftest.py       full self-test
pxlib/fmt.py      .pxa parse / serialize / validate / rasterize (layers, ramps, tokens)
pxlib/color.py    exact ports of palette.js ramp()/outlineFor()/RAMPS and makeColorway()
pxlib/ops.py      drawing, transforms, autoshade, selout, dither, perfect
pxlib/lint.py     the pixel-art lint
pxlib/export.py   game module compiler (deterministic)
pxlib/render.py   canvas, preview (onion, strips, lint boxes), sprite sheet
pxlib/png.py      PNG encoder + decoder
pxlib/gif.py      animated GIF encoder
pxlib/palettes.py built-in palettes
pxlib/templates.py proportion guides
pxlib/font.py     3x5 font for ruler and legend labels
examples/         knight.pxa (single frame), walk.pxa (3-frame cycle), mage, dragon
```
