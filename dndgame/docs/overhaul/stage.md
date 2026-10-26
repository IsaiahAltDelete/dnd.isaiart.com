# stage — layered compositor, layout widgets, inspector

Role: Interface fleet, `stage`. Owns `render/stage.js`, `engine.js`,
`core/input.js` (mouse transform), `index.html` shell/CSS, `ui/layout.js`,
the F10 inspector (`ui/inspector.js`), `render/pixelfilter.js`, and the
pixel-coordinate fixes in `test/regress.mjs`. New tool: `tools/detshot.mjs`.

## Plan and status (r2, all done)
1. [x] Deterministic before/after harness `tools/detshot.mjs`.
2. [x] `render/stage.js` per OVERHAUL 4.2 (res-1 world group composited into
   one 400x240 world buffer, upscaled nearest-neighbour; res-2 interface on
   an 800x480 display).
3. [x] Engine routing: world `draw` -> `deco`, `drawUI` -> `hud`, UI scenes ->
   `menu`, `drawOver` -> `overlay`, FX weather -> `weather`, FX tint ->
   `grade`, FX vignette -> `vignette` (a world layer above `glow`, so the
   battle's red hurt-edge stays under the HUD as before), FX flash ->
   `screen-fx`, transitions -> `transition`, debug + inspector -> `debug`.
4. [x] 800x480 backing store; CSS scale = largest whole number of DEVICE px
   per logical px that fits (a 125% laptop gets 4 device px, not 3.75), else
   a fractional fill >= 1.25; Window Scale is in logical multiples; the
   pointer stays logical (`Input.setMouseTransform(s, ox, oy, 400, 240)`).
5. [x] Overworld and battle passes fetch their own layers (routing only).
   Floaters, the interact chevron and the exit label are on `world-ui`.
6. [x] `ui/layout.js`: widgets, Arrange mode (F8 / `Game.arrangeHud()`),
   `Save.settings.hudLayout`; hud / hotbar / battle HUD read `Layout.rect`.
7. [x] F10 inspector, `window.SC.Stage`, `window.SC.Layout`.
8. [x] `pixelFilter` (none/warm/tapestry/gloom/vivid) and `scanlines`,
   `Stage.applySettings` on boot and on every settings save.
9. [x] regress pixel sampling scaled for the 800x480 store; suite green.
10. [x] Pass-through compositing (below) — the compositor costs ~0 at noon.

## How to use it (for the other agents)

### Drawing into layers
```js
import { Stage } from '../render/stage.js';
const g = Stage.ctx('actors');     // logical px; res-2 layers carry a 2x base transform
Stage.fine(g, (f) => ...);         // on a res-2 layer: 1 unit = half a logical px
Stage.define('bloom', { res: 1, z: 102, blend: 'lighter' });   // a new layer
```
- **Fetch a layer's ctx right before the pass that uses it.** Plain layers
  (source-over, opaque, unfiltered, unmoved) whose draws arrive in z order
  share one canvas (see PASS-THROUGH in stage.js). A ctx kept from an
  earlier `Stage.ctx()` and drawn to after a later layer was fetched lands
  above that later layer. `Stage.passThrough = false` gives every layer its
  own canvas; if a picture changes when you flip it, a pass is holding a
  stale ctx.
- Blend layers (`grade` multiply, `glow` lighter) always get their own canvas:
  draw into them as into a transparent layer; the blend happens once, at
  composite time. The existing overworld grade code sets its own multiply
  per fill, which is equivalent.
- Weather (z 80) is UNDER the grade (z 90), per the 4.2 table: rain at night
  takes the night grade now (the one deliberate world difference, a slightly
  darker, bluer rain), and lantern glow (z 100) lights it.
- `Stage.handed(id)` is the engine's: the ctx it hands a hook. A scene that
  fetches its own layers may ignore the one it is handed.
- A draw that throws drains only the contexts its hook touched; the rest of
  the frame (HUD, toasts) still paints. Verified by throwing mid-clip inside
  `overworld._drawExits`: no clip or transform leaks into the next frame.

### Checking your change is visually identical
```sh
$NODE tools/detshot.mjs --roots "flat=.@SC.Stage.flat=true,new=." --out output/<you>/det
$NODE tools/detshot.mjs --roots base=<git-archive of main>,new=. --cases town-noon,fight
```
Fake clock + manual rAF, fixed 1/60 s steps, same staging in every tree;
`full` and `world` (every drawUI/drawOver silenced) captures, diff PNGs in
red, `report.json` with pixel counts, bounding boxes, max channel delta and
median `_draw()` ms. `name=dir@<js>` runs page code before staging. A tree
captured twice diffs to 0 pixels. Flat mode is the old single-canvas
renderer, so `flat` vs `new` isolates the compositor from anyone's art.

### HUD widgets
```js
import { Layout } from '../ui/layout.js';
Layout.register('hud.party', { anchor: 'tl', x: 3, y: 3, w: 86, h: 130, label: 'Party', scene: 'overworld' });
const r = Layout.rect('hud.party', { h: liveHeight });   // { x, y, w, h, visible }
```
Draw and hit-test at `Layout.rect(id)` every frame. Registered now:
overworld `hud.party hud.clock hud.banner hud.toasts hud.quest hud.log
hud.minimap hud.toolbar`; battle `battle.menu battle.end battle.budget
battle.detail battle.log battle.stat battle.dice` (the initiative rail and
boss bar are not movable: the field's clip starts under the rail). hud.js,
hotbar.js and combatui.js copy each rect into their existing layout records
(`syncLayout()`), so every existing draw and hit-test follows untouched.
Arrange mode: F8 in the world, or `Game.arrangeHud()` from a menu (closes the
menus over the world first). Drag (Shift snaps to 8), arrows nudge, Tab
cycles, H hides, R resets one, Shift+R all, P steps through the presets
(as designed / mirrored / focus), Esc or F8 finishes. The world is frozen
while it is open and the closing Escape never reaches the pause menu.

### Inspector (F10)
Every layer: z, res, blend, how it was painted this frame (`pass` straight
through, `buf` own canvas, `late` broke the plan), visibility (click the
row), alpha (click the number: 1 .75 .5 .25 0), smoothed draw ms with a bar,
S to solo. Header: composite and frame ms, pass/buf counts, switches for
pass-through and flat mode. Everything is on `SC.Stage` in the console
(`Stage.set('grade', { alpha: 0.5 })`, `Stage.solo = 'glow'`,
`Stage.list()`, `Stage.snapshot()`).

### Display filters
`Save.settings.pixelFilter` recolours the world only, at 400x240, through a
64^3 LUT whose two dropped bits are added back (no banding): warm (gilded
lights, cool shadows), tapestry (nearest medieval dye in OKLab, 45% of the
original lightness kept so shading survives), gloom (overcast), vivid.
`Save.settings.scanlines` lays a fine-grid mask over everything below the
transition layer. Both already appear in Settings > Display (the Options
screen lists every non-custom display setting); their help text there is the
generic one until the menus agent adds entries to `SETTING_DESC`.

## Measurements
Headless Chromium on this laptop (Intel HD 4600 through ANGLE, and
SwiftShader), shared with other agents, so ranges:
- Compositor overhead (same page, pass-through vs flat single canvas, main
  thread): +0.4 ms town, +1.0 ms battle. With SwiftShader and a forced
  flush: the world passes through at zero extra cost; the grade and glow
  blits cost ~2 ms at night (advanced blend modes read the destination).
- `Stage.compositeMs` median: battle 0.7 ms, town noon 1.4-2.5 ms, town night
  3 ms (SwiftShader, loaded machine; includes rasterising what the blits
  consume, which a single canvas pays at present time instead).
- Before r2's pass-through: every layer its own canvas, composite 4-13 ms.
- main vs stage whole frame (`_draw()` main thread, min of 8 medians, real
  GPU): town 8.6 -> 11.8 ms, battle 3.3 -> 6.6 ms; fps with the loop
  running 46.5 -> 42.5 town, 59.2 -> 56.7 battle. The CPU profile puts the
  difference in the 2x interface (kit fine faces and frames: `advOf`, `text`,
  `pips`, `grain`, extra `fillRect`s) and the world recording being flushed
  inside the upscale `drawImage` rather than at present time; the stage's
  own functions are under 0.3 ms.

## Rules learned the hard way
- Arrange mode read the F8 that opened it as the F8 that closes it. Keys that
  toggle a mode must not be re-read by the mode on the same frame.
- Action edges are computed at the END of the tick, so `Input.consume()` in
  the frame a modal closes is too early; `Input.flush()` is the tool.
- Per-call wrappers on a canvas context are not free: thousands of HUD
  `fillRect`s a frame make even a one-line wrapper cost a third of a
  millisecond. Trap once, restore the native method.
- `g.shadowColor = ...` and `g.filter = ...` re-parse a string on every set;
  read first.
- Handing a layer-aware scene its default ctx must not count as that layer
  being drawn, or the handed layer pins itself in front of the scene's own
  passes and nothing above it can pass through.
- For identity checks after other agents land art, diff against flat mode in
  the same tree, not against an old main: the ground tiles changed under us.
