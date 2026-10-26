# architecture — buildings, interiors and settlements

Owner: the `architecture` agent (Art fleet). Branch `overhaul/architecture`.
Scope (OVERHAUL.md section 5): the building / interior / prop tiles in
`render/tiles.js` (painters in the new `render/tiles_arch.js`), `world/mapkit.js`,
building generation in `world/maps*.js` and `world/mapgen.js`.

## Baseline (main at a9b7c6c, before any change)

Judged from `tools/px/arch-capture.js` (23 stops, one browser run; PNGs in
`output/arch/before/`):

- **Roofs** read as flat bands of texture: no pitch, no eave lip, no gable
  verge; shingle reads as brick; the ridge is a thin dark line.
- **Timber framing** is one K-brace stamp every 16px; every Phandalin house is
  the same wall.
- **Doors** are a 12x15 plank box on a grey slab, a head shorter than the
  people walking through them; every door is the same door.
- **Windows** paint lime plaster round themselves, so a stone or brick house
  gets pale plaster patches round every window.
- **Interiors** wall the room with the EXTERIOR wall tile on all four sides
  (the K-brace ring round the Stonehill taproom); no back wall face, no skirting,
  nothing on the walls. Rugs are 16px squares each with its own gold border.
  Furniture sits two or three L* off the floor and vanishes into it.
- **MOSAIC** is a blue diamond stamped every 16px — the plazas of Neverwinter and
  Baldur's Gate are a chequerboard.
- Settlements: streets of rectangles; Baldur's Gate's temple district is a grey
  box on grey flagstone with green squares for hedges.

Verification baseline (`tools/px/arch-verify.mjs`): 96 maps load; warps
190/190 ok (8 procedural ends); NPCs 224/236 ok — 12 failures: 9 "boxed in"
(clearStanding punched a hole in a building because the house was built over
the NPC's catalogue tile: daggerford x3, high-hedge, nashkel, bg-blackgate,
bg-rivington, bg-bloomridge, bg-eastway) and 3 standing ON a warp tile
(bg-blackgate>bg-the-wide, bg-temples-district>high-hall,
bg-citadel-streets>watch-citadel).

## Plan

1. **Tools** (done): `tools/px/arch-capture.js` (browser tour),
   `tools/px/arch-verify.mjs` (warps both ways + NPC standing, headless),
   `tools/px/arch-peek.mjs` (text dump of a map window), `tools/px/arch-lab.mjs`
   (headless tile sheets and map windows through the real tiles + resolve pass).
2. **`render/tiles_arch.js`** — one hand for all built things:
   roofs (thatch / shingle / pantile / slate with ridge, pitch and eave rows and
   gable verges), walls (framed plaster with varied bracing, coursed stone with
   quoins, brick, log), doors and door heads, windows per wall material (lit at
   night), shop signs with trade symbols, interior back-wall faces and wall tops,
   rugs with one border round the whole rug, furniture that stands off the floor.
3. **`resolveArchitecture(map)`** at map load (next to `resolveTileMasses`):
   bakes the context a cached 16x16 raster cannot see — which roof row is the
   eave, which end of a roof is a gable, what wall a window/door sits in, which
   interior wall is a back wall (face) and which a wall top, where a rug's edge
   is. Authoring stays exactly as it is; every map in every pack benefits.
4. **NOTICE_BOARD** tile for contracts and rumours.
5. **Layouts**: Phandalin's centre; one district each in Neverwinter, Waterdeep
   and Baldur's Gate; furnished interiors by type; street dressing.
6. Fix the 12 NPC failures; re-run verification; before/after shots.

## Progress

- 20 Oct continuation: recovered the two saved branch commits (9056d0c,
  32f2999): battlements and dressed gate piers with a raised portcullis,
  Phandalin's animated windmill, and notice boards in Daggerford/the Wide.
  Moved all 32 new tile registrations to the end so every one of the 478
  previous IDs keeps its meaning. Original branch checkpoints remain intact;
  these changes are now in the development working tree.
- Verified 190/190 warps and 236/236 NPC placements, with actual player
  movement through Daggerford's gate. Day/night and 1600x960 windmill frames
  inspected, no browser/render errors; full regressions 33 PASS. Evidence:
  `output/queue-review/architecture`, `gate-walk`, `mill-desktop-*.png`.
  Independent critic batch: 8.6/10 PASS on round 1, no architecture defects.
  Earlier broad layout/roof TODOs below are historical and not all closed by
  this bounded checkpoint recovery.
- [x] tools, baseline numbers
- [x] increment 1: `render/tiles_arch.js` (roofs, walls, openings, interiors,
      rugs, mosaic, notice board) + `resolveArch` at map load; 12 NPC placements
      fixed (verify: warps 190/190, NPCs 236/236); regress 28/28.
- [ ] roof character (dormers, cross gables, moss), furniture pass
- [ ] layouts: Phandalin centre, one district each in Neverwinter, Waterdeep, Baldur's Gate
- [ ] notice boards placed in the director's towns

## How it works (for whoever comes next)

**Authoring is unchanged.** `building()` still lays a ridge row and L/M/R rows
of one roof key, walls of one wall key, `WINDOW`/`WINDOW_LIT`/`SHUTTER`,
`DOOR_CLOSED`; `room()` still rings a room with its wall key; `floorRect` still
lays `CARPET_RED`. At load, `resolveArchitecture(map)` (tiles.js, called in
maps.js `loadMap` after `resolveTileMasses`) swaps each for its member:

| authored | becomes | rule |
|---|---|---|
| `THATCH_M` etc. | `THATCH_RIDGE_L/_R`, `THATCH_EAVE_L/M/R`, `THATCH_SOLO_*` | no roof north = ridge row, none south = eave, neither = one-row roof; no roof west/east = verge |
| any facade wall | `<WALL>_L` / `_R` | a wall under a roof whose west/east neighbour is not part of the house: corner post, quoins, log ends; the wall steps in 1px so the eave overhangs |
| `WINDOW`, `WINDOW_LIT`, `SHUTTER` | `WINDOW_STONE`, `WINDOW_LIT_BRICK`, ... | the wall material beside it (plaster stays the authored key) |
| wall above a door | `DOOR_HEAD_<MAT>` | the top of the doorway: lintel or arch, fanlight or pentice hood |
| `DOOR_CLOSED` in masonry | `DOOR_CLOSED_STONE` | stone jambs |
| `CHIMNEY` | + `SMOKE` on the open tile above | the plume rises clear of the roof |
| interior wall (indoor city map) | `IWALL_<MAT>` face / `ITOP_W#` `ITOP_C#` top | face if the tile south is not structural, top otherwise (mask: 1 N, 2 E, 4 W open) |
| interior door | `IDOOR_<MAT>`, `IDOORWAY_*`, `IEXIT_*` | in a face / in a wall top / on the map's bottom row |
| `CARPET_RED/BLUE` | `CARPET_RED_<mask>` | border where the neighbour is not the same rug (1 N 2 E 4 S 8 W) |

Members keep the flags of what they replace, so collision, doors and triggers
never change. New walls to author with: `TIMBER_WALL` (black-and-white framing
with chevron braces), `PLASTER_WALL` (lime render).

**NOTICE_BOARD** (`T.NOTICE_BOARD`, deco, SOLID): world/sites.js already looks
for it — `stageMap` puts the director's board entity on the first NOTICE_BOARD
tile of a town map (TOWN_ROLES towns + bg-the-wide) and zeroes the entity's own
tile so the painted board shows. To place one: `prop(map, x, y, tid('NOTICE_BOARD'), res)`
on a tile with walkable ground south of it (the reader stands there), or
`noticeBoard(map, x, y, res)` from mapkit.

**Glow.** `glowsFor` in overworld.js maps any `WINDOW_*` / `WINDOW_LIT_*` key
to the authored window's glow (small hook, lighting's file).
