# lighting — world atmosphere and dynamic light

Role: Art fleet, `lighting`. Owns `render/lighting.js` and
`render/atmosphere.js` (new), the overworld `draw()` and its depth / grade
passes (`world/overworld.js`), and the draw code in `world/entity.js`.

## Baseline (before, 28 Sep 2026)
`output/lighting/before.png` (tools/lightgallery.js). What was wrong:
- Night was barely night: the grade was a 60% multiply of a pale blue, so
  midnight Phandalin read as a slightly grey noon.
- Light pools were smooth radial gradients (the one thing pixel art must not
  have), additive only, and only after dark. Lanterns and glowcaps did not
  glow at all (missing from the table).
- Dungeons, caves and the inn were lit like noon: no darkness underground
  unless a map set `dark` by hand (only Tresendar Manor did). Interiors never
  followed the clock (`dayNight` is false indoors).
- Rain was a handful of faint streaks; no fog banks, clouds, motes or
  fireflies anywhere.

## Plan and status
1. [x] `render/lighting.js`: sky model (ambient multiply colour by hour, with
   dawn rose-gold, noon neutral, dusk amber into violet, night deep blue;
   weather and place adjust it), light-source discovery from tiles (cached per
   map), `map._glows` extras (the encounter director's campfires), the party
   (torch / lantern / Light / darkvision / bare eyes), stepped light stamps (4
   flat bands, Bayer-dithered seams, cached), stepped flicker.
2. [x] Overworld integration. LANDED (increment 1).
3. [x] `render/atmosphere.js`: own rain (streaks, splash crowns, puddles that
   fill, rings on puddles and water, lamp reflections in wet streets, a faint
   echo on 'glow' so night rain shows), snow and ash (with embers), fog banks
   and dawn mist, cloud shadows (in the light map), leaves in forests,
   fireflies on summer nights, god rays through the canopy at dawn and in the
   golden hour, window beams with dust indoors by day. LANDED (increment 2).
4. [x] Entity lights: `entity.heldLight` (`torch` / `lantern`) and guards'
   automatic outdoor night lanterns join the map's sources. Completed in
   the working tree on 20 Oct; stationary fires still use `map._glows`.
5. [x] Measured (below).

## How it works
- `Lighting.update(o)` once per frame (overworld `_lightFrame`, top of
  `draw()`): fills `Lighting.env` { place, amb, lights, sun, night, weather,
  wet, active[] }. The depth passes read `env.sun` (so overcast kills crisp
  shadows too).
- 'grade' layer: `Lighting.drawGrade(ctx, cam, hooks, direct)` paints the
  light map straight into the grade layer's own canvas (a blend layer always
  has one); in the stage's flat debug mode it builds the map offscreen and
  multiplies it on. Ambient fill -> `hooks.shade` (cloud shadows, multiply)
  -> each light's stamp added with `lighter`, plus a small `core` stamp that
  keeps the flame / pane itself unshaded.
- 'glow' layer: `Lighting.drawGlow` (stepped halos) then
  `Atmosphere.drawGlow` (rays, beams, dust, fireflies, reflections, embers).
- 'weather' layer: `Atmosphere.drawAir`. 'ground-shade': `drawGround`
  (puddles, rings — under the actors).
- The engine no longer paints FX's weather for a world scene with
  `ownsWeather = true` (small hook in engine.js `_drawFrame`); the battle
  scene still gets FX's rain. FX's weather SIMULATION (wind, lightning,
  thunder) still runs; only its drawing is skipped in the overworld.

### Adding a light
- A tile: add its key to `TILE_SOURCES` in lighting.js (flame offset in the
  tile), or a family by prefix in `tileSource()`.
- A kind: `KINDS` (r, c, i, ry, flick, halo, core, pool, when).
- Something that burns for a while (a campfire): push
  `{ px, py, kind: 'campfire' }` (world px) or the legacy
  `{ x, y, def: { r, c:[0..255], flick } }` (tiles) onto `map._glows` and
  remove it when it goes out.
- A one-frame light (a spell): pass it in `Lighting.update({ extra: [...] })`.

## Measurements
Headless Chromium on the shared 2-core laptop (other agents running), the
light and air passes timed directly (main-thread ms per frame), whole
`_draw()` median of 40 frames:

| view | frame before | frame after | light | air |
|---|---|---|---|---|
| Phandalin noon | 32.8 | 36.9 | 0.27 | 0.08 |
| Phandalin dusk | 43.5 | 38.6 | 1.07 | 0.07 |
| Phandalin night | 35.9 | 34.8 | 1.11 | 0.07 |
| Phandalin night + rain | 40.9 | 34.3 | 1.07 | 0.97 |
| Neverwinter Wood dawn | 26.9 | 28.2 | 0.19 | 0.35 |
| Redbrand hideout | 15.9 | 19.9 | 0.28 | 0.06 |
| Stonehill Inn night | 24.0 | 25.6 | 0.58 | 0.06 |

Whole-frame numbers swing +-20% with the machine's load; the passes
themselves cost about 2 ms at worst (night rain). Underground now composites
a grade and a glow layer it never had, which is the +4 ms in the dungeon.

## Tools
- `tools/lightgallery.js` — shot.mjs page script: stages every acceptance view
  in ONE browser run and returns a contact sheet; `LG_SET='air'|'all'` adds the
  atmosphere views; `LG_PERF` times frames and the light/air passes.
  `tools/lightgallery-sheet.mjs` writes the PNGs.
  ```sh
  $NODE tools/shot.mjs --scenario town --script tools/lightgallery.js --eval "window.LG_SET='all'" --json output/lighting/g.json --wait 50
  $NODE tools/lightgallery-sheet.mjs output/lighting/g.json output/lighting/after
  ```

## Rules learned
- FX finishes fading the old weather before it takes the new one, so
  `FX.weatherKind` lags a change by up to a second; anything that snapshots
  "the new weather" must wait for it (the gallery does).
- An interior has `dayNight: false` (no street grade) but must still keep the
  clock; `graded` in `Lighting.update` treats it so.

## Resumed 20 Oct 2026

Recovered the unlanded entity-light checkpoint from `overhaul/lighting`.
The party's visible hand item follows its existing inventory/spell-light
selection. Lanterns stow during daylight or when spell light takes priority.
Guard lanterns are outdoor-only; explicitly authored held lights can burn
indoors or underground.

`Lighting.update` now accepts `entities` and `leader`. It asks entities for
their held light after computing the current sky, preventing a stale pool
on the first frame of a time/map change. Hidden, removed, transparent and
offscreen sources are skipped; at most twelve visible entity sources are
collected. The leader is excluded because the party light is already supplied.
`heldLightAt` follows facing, stride, bob and bump motion. Game text snapshots
include player and NPC held-light state.

Validation: 33/33 regression checks, ten acceptance views in
`output/resume-lighting/gallery.png`, and two skill-client walking captures
with corresponding JSON states. No browser errors or draw failures.
The original checkpoint branch remains unchanged; reviewed implementation
and tests are in the current working tree. No remaining carried-light TODOs.
