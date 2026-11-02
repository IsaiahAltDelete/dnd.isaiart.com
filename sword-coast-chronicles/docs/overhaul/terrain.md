# terrain — the natural world repaint

Owner: the `terrain` agent (Art fleet). Branches `overhaul/terrain` (first attempt,
stopped by the usage limit) and `overhaul/terrain-r2` (this one, continued from it).
Scope (OVERHAUL.md section 5): the ground/nature tiles in `render/tiles.js` —
grass, dirt, roads, water, shore, sand, snow, marsh, cave/dungeon floors, trees,
bushes, rocks, cliffs, flowers, crops — with the painters in
`render/tiles_terrain.js`. Buildings, interiors and props belong to `architecture`.

## What the world looked like before (main at 4b260ea)

Judged at 1x and 2x in situ (`tools/px/terrain-capture.js`, one browser run):

- **Grass** a flat felt of 1px speckle; **tall grass** a dark 16px square.
- **Trees** 16px blobs, each in a dark 18px frame (the overworld's AO pass rims
  every solid tile, so every tree, bush and boulder was boxed).
- **Water** flat blue; deep water a navy 16px staircase at every WATER|WATER_DEEP
  join (Ulgoth's Beard, Candlekeep).
- **Cliffs** a wall of grey masonry blocks, no ledge, no lit top, no face.
- **Cave floor** flat brown with a visible checker; **cave walls** a busy mottle.
- **Dungeon** purple brick beside grey 2x2 slabs at different values: a patchwork.
- **Marsh** bog water a dark green rug; reeds a comb of 1px lines.
- **Snow patches** in Neverwinter Wood white squares.
- **Mountains** sealing a map's sides: a column of identical teeth.
- **Battle arenas** raw tile checkerboards (battlefield's job; see the API below).

## What it looks like now (and why)

All painters live in `render/tiles_terrain.js`, one hand, sections:

| § | what | the decision that matters |
|---|---|---|
| 3 | grass, clover, flowers, tall grass | tufts (V-fans lit at the tip) over one sward; tall grass is blades over their own shade, not a square |
| 4 | oak, birch, willow, pine, bush, berry bush, big 2x2 trees, dead tree, stump | a crown FILLS its tile so a wood closes up; leaf clumps are applied to the *quantised* level (clean shapes, no noise); selective outline dark on the lower right only |
| 5 | water, deep water, shelves, shore/quay banks, bog, lily pads | deep sits one ramp step under shallow; the join is a baked WATER_SHELF member (a band of the shallow body with a dithered lip whose width follows the shared-border rule); one glint a frame, deep water seldom |
| 6 | dirt, path, ruts, cobble, gravel, mud, sand, farmland, crops | earth told apart by surface, values within a few L* of the old bases |
| 7 | verges | two painters recorded into buffers, a mask picks per pixel |
| 8 | snow, snowy grass, ice | form from blue shadows |
| 9 | lone patches (_ISLE) | soft edge, sparse stipple; snow lies ON the grass (lower-edge shade + a cast pixel), scuffs are SUNK (the turf's lip shades their top) |
| 10 | cliff / cave-wall masses, clifftop, mountain skyline | tops are a quiet surface with a web of joints keyed to the shared borders (continuous, never repeating); south faces are broad rock columns split by a few long fractures, lit lip, talus; cave tops are dark so floors read; the skyline is a massif whose summits straddle seams |
| 11 | cave floor, rubbled floor, flagstones, stone brick, bone floor | flagstones are CUT per variant (8 cuts, mirrored) with joints on the tile border; brick and flag share one cool stone so a mixed room is one floor |
| 12 | boulder, rock, rubble, stalagmite | faceted granite lit flat, keyline on the shaded side only, cool hue to part from warm ground |
| 13 | reeds, cattails, driftwood | clumps from one root, stems a pixel or two apart |

Map-load passes (`resolveTileMasses` in tiles.js, called from `loadMap`):
`resolveMasses` bakes CLIFF/CAVE_WALL rims and faces and turns a MOUNTAIN with
more mass north of it into CLIFF (a skyline only makes sense against open
ground); `resolveShelves` bakes the deep-water shelves.

## Hooks outside my files (small, per OVERHAUL.md section 5)

- `world/maps.js` `loadMap`: one call, `resolveTileMasses(map)` (first attempt).
- `world/overworld.js` (lighting's): `roundSolid(map)`; `_edgeMask` and
  `_tallMask` skip a solid cell whose deco is free-standing (tree, bush, boulder,
  stump, stalagmite, crystal) on non-solid ground. Asks `tiles.js
  tileFreeStanding(id)`, feature-detected like the other TILESET hooks. Those
  things paint their own round contact shadow; the square AO rim and the tall
  cast band boxed every tree in a dark frame.

## New tile ids (appended)

`TREE_BIRCH`, `TREE_WILLOW`, `WATER_SHELF_{N,E,NE,S,NS,ES,NES,W,NW,EW,NEW,SW,NSW,ESW,NESW}`
(flags = WATER_DEEP's). Variant counts changed on many natural tiles (visual only).
STONE_FLOOR / STONE_FLOOR_CRACKED are no longer edge-variant; DUNGEON_FLOOR and
BONE_FLOOR now are.

## Tools

- `tools/px/terrain-capture.js` — shot.mjs `--script`: tours 15 locations in ONE
  browser run (peaceful mode, HUD hidden), returns data URLs.
- `tools/px/terrain-arenas.js` — one painted battle arena per biome.
- `tools/px/terrain-decode.mjs <after.json> <dir> <scale> [before.json]` — PNGs,
  or with a 4th argument BEFORE stacked over AFTER per location.
- `tools/px/terrain-lab.mjs <out.png> KEY,KEY [ground] [n]` — every variant of each
  key plus a 5x3 cluster of the first, 8x, headless. The daily bench.
- `tools/px/terrain-gallery.mjs <dir> swatch|field|scene|synth1` — sheets and
  synthetic scenes (pond, wood, rock, cave) through the real resolve passes.
- `tools/px/crop.mjs in out x y w h [scale]`, `tools/px/pngio.mjs`.

Before shots: `git archive main` into a scratch dir, copy the terrain-* tools in,
run the same capture there (shot.mjs serves whichever tree it is run from).

## Progress

- [x] kit + grass family (first attempt)
- [x] trees, bushes, dead tree, stump; AO/tall-shadow hook
- [x] water, shelves, shore/quay, bog, lilies
- [x] earth: dirt, path, ruts, cobble, gravel, mud, farmland, crops (first attempt)
- [x] rock: cliffs, cliff top, mountain, cave walls, boulders, rocks, rubble, stalagmites
- [x] floors: cave, rubble, flagstone, cracked, stone brick, bone
- [x] snow, ice, sand; marsh (reeds, cattails, driftwood)
- [x] verges, banks, isles
- [ ] arena verge API for the battlefield agent
- [ ] lag-16 audit numbers; before/after write-up with images
