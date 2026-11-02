# The Overhaul — master brief for every agent

Started 22 Sep 2026. Read this whole file before touching anything. It is the
contract between six fleets of agents working in parallel on separate git
branches. If something here is wrong or impossible, write that in your notes
file and your final report — do not silently diverge.

## 1. What the user asked for (their words, condensed)

- "A visual overhaul and music overhaul." Better pixelated visuals — interface,
  screen layout, HUD, elements, layering; spell and battle animations; character
  designs; buildings. "If you need to change the pixel size go for it, no
  limitations. Just make it good."
- "Things should be **separate elements instead of one shared layer** so we can
  adjust and change things but still maintain a pixel look."
- "More **medieval polyphonic** songs."
- Use and improve **PixelForge** (`pixelforge/files/`).
- "I hate the constant zero-lore ambushes." Encounters with logic and reasons.
  Sandbox: buying, selling, trading, factions, **creating factions**, a full
  open world. NPC improvements, companions fleshed out, better buildings.
- "Make it feel like a **unique project of its own**. Customizable, unique, and a
  **never-ending adventure**."

## 2. Non-negotiables (from the project's history — the user enforces these)

1. **Forgotten Realms canon only.** The game is *Sword Coast Chronicles*; never
   rename it. Places, gods, factions, monsters from published Realms lore. **Never
   coin portmanteau fantasy names** ("Aetherfall", "Kaelan" were rejected by the
   user). New minor NPCs use the SETTING.md naming tables (Chondathan / Illuskan /
   Tethyrian, canonical dwarf/elf/halfling patterns), plain and period-correct.
   Player-created faction names are the player's choice; name *suggestions* follow
   the same rule ("the Company of the Silver Stag", "Harrowdale Free Blades").
2. **No external asset files at runtime.** Art and sound are procedural code, or
   PixelForge `.pxa` sources compiled to JS modules (the `satchel` precedent:
   `assets/pixel/*.pxa` -> `scripts/build-*.mjs` -> `src/render/*-art.js`).
   No image/audio/font files loaded by the game, no CDNs, no npm deps, no build step
   for the game itself.
3. ES modules with `.js` extensions and relative paths. All randomness through
   `core/rng.js`. Data catalogues frozen; never mutate an imported table.
   Every new file starts with a one-line comment naming the module and its role.
4. **Old saves must keep loading.** Any new state lives under a new key in
   `Game.state` and is created lazily with defaults (`st.factions ??= ...`).
   Never rename or repurpose an existing saved field. Tile ids are append-only.
5. After any `src/` change: `node tools/stamp.mjs` (the landing script does this).
6. **Match the codebase's voice.** Comments explain *why*, in plain prose, like
   the existing files. Dense, readable, no dead code, no TODO litter.
7. Copyright: no transcriptions of copyrighted music or game assets. Medieval
   and Renaissance works (before ~1650) are public domain and fair game to arrange;
   so is plainchant. Originals in period forms are better still.

## 3. The identity we are building toward

*An illuminated manuscript you can walk around in.* Warm GBA-era pixel art with
real hue-shifted shading and dramatic light; an interface of dark vellum, gilt
rules, rubricated headings, drop-cap initials and heraldry; a score of authentic
medieval polyphony — organum, motets, estampies, rotas — instead of chiptune or
movie orchestra. Every system should reward curiosity and be adjustable by the
player. The world keeps generating reasons to go somewhere.

Customization is a feature, not an afterthought: HUD you can rearrange, UI
themes, display filters, a heraldry designer for your own company, a minstrel's
songbook to choose music, encounter pacing you control.

## 4. Rendering architecture (the "separate elements" request)

### 4.1 Resolution
- The WORLD stays at 400x240 logical pixels, 16px tiles (25x15 tiles). All maps,
  hit-testing and existing UI coordinates are in this logical space.
- The DISPLAY canvas backing store becomes **800x480** (2x). World layers are
  drawn at 1x and upscaled nearest-neighbour; UI layers are drawn at 2x, so the
  interface gains a **fine grid** (1 fine px = half a logical px) for small crisp
  text and detailed frames, while every existing UI call in logical coordinates
  keeps working unchanged.
- CSS scaling of the display canvas: the largest integer that fits; if that is
  1 but a fractional scale >= 1.25 fits, use it (a 1366x768 laptop keeps a
  1200x720 game). Settings > Display > Window Scale keeps its meaning in LOGICAL
  multiples (2 = 800x480 on screen).
- Mouse coordinates stay LOGICAL (0..400, 0..240) everywhere.

### 4.2 `src/render/stage.js` — the layer compositor
Every visual element draws into a named layer. Layers are offscreen canvases
composited in order onto the display canvas each frame. Public API (other fleets
code against exactly these names):

```js
import { Stage } from '../render/stage.js';
Stage.ctx(id)                 // CanvasRenderingContext2D for layer `id`, cleared for this
                              // frame, transform set so you draw in LOGICAL px (fine
                              // layers carry a 2x base transform). Lazily creates
                              // unknown ids as res-1 world layers above 'fx'.
Stage.fine(ctx, fn)           // run fn with the transform switched to FINE px on a fine
                              // layer (1 unit = half a logical px); plain call on res-1 layers
Stage.get(id)                 // the layer record { id, res, visible, alpha, blend,
                              //   offsetX, offsetY, filter, group, z }
Stage.set(id, patch)          // adjust live (dev inspector and settings use this)
Stage.define(id, opts)        // add a layer: { res: 1|2, z, group, blend, alpha }
Stage.list()                  // ordered records
Stage.snapshot()              // PNG data URL of the last composite (tests)
Stage.W, Stage.H, Stage.FINE  // 400, 240, 2
```

Standard layers, bottom to top (`res`, blend):

| id | res | what draws here |
|---|---|---|
| `backdrop` | 1 | sky, parallax, void colour, battle backdrop |
| `ground` | 1 | ground tiles, verges, water |
| `ground-shade` | 1 | edge rims, sun shadows, contact shadows, AO |
| `deco` | 1 | walls, props, deco tiles |
| `actors` | 1 | NPCs, party, monsters, corpses (feet-Y sorted) |
| `fx` | 1 | world particles and spell effects |
| `over` | 1 | roofs, canopies, archways drawn in front of actors |
| `weather` | 1 | rain, snow, fog, motes, falling leaves |
| `grade` | 1 | `multiply`: day/night grade with light sources punched in |
| `glow` | 1 | `lighter`: lantern halos, spell light bloom, fireflies |
| `world-ui` | 2 | world-anchored UI: floaters/damage numbers, name plates, HP pips over units, interact hints, targeting reticles |
| `hud` | 2 | the world scene's interface (overworld HUD, battle HUD) |
| `menu` | 2 | UI scenes (menus, dialogue, shop, char creation, title) |
| `overlay` | 2 | toasts, tooltips, drag previews, HUD arrange mode |
| `screen-fx` | 2 | full-screen flash, tint, vignette, optional scanline/CRT filter |
| `transition` | 2 | scene transitions |
| `debug` | 2 | FPS, layer inspector |

Engine routing (engine.js): a world scene's `draw(ctx)` receives the `deco` ctx
for backward compatibility, but layer-aware scenes call `Stage.ctx(...)` for each
pass; `drawUI(ctx)` receives `hud`; UI scenes' `draw` receives `menu`;
`drawOver` receives `overlay`; FX ambient -> `weather`/`grade`; FX screen ->
`screen-fx`. A scene that throws while drawing must still not break the frame
(keep `_paint`'s guarantees).

**Fetch a layer's ctx right before the pass that uses it.** Plain layers whose
draws arrive in z order share one canvas (the stage's pass-through, which is
what keeps compositing near free), so a ctx kept from an earlier `Stage.ctx()`
and drawn to after a later layer was fetched lands above that later layer.
Prove a change pixel-identical to the single-canvas renderer with
`tools/detshot.mjs --roots "flat=.@SC.Stage.flat=true,new=."` (docs/overhaul/stage.md).

Dev tools (part of the stage work): **F10 layer inspector** (list layers,
toggle visibility/alpha, solo a layer, show per-layer draw time) and
`window.SC.Stage` in the console.

### 4.3 `src/ui/layout.js` — HUD widgets you can move
Every HUD element is a registered widget with an anchor, so the player (and
future agents) can move, hide and re-skin elements independently.

```js
import { Layout } from '../ui/layout.js';
Layout.register(id, { anchor: 'tl'|'tc'|'tr'|'ml'|'mc'|'mr'|'bl'|'bc'|'br',
                      x, y, w, h, label, scene: 'overworld'|'battle'|'*', z, hideable: true })
Layout.rect(id)      // -> { x, y, w, h, visible } in LOGICAL px, user offset applied, clamped on screen
Layout.set(id, patch) / Layout.reset(id?) / Layout.presets / Layout.applyPreset(name)
Layout.editing       // true while Arrange mode is open
```
Overrides persist in `Save.settings.hudLayout`. **Arrange mode** (Settings >
Display > Arrange HUD, or F8 in the world): outlines and labels every widget of
the current scene, drag to move (1px snap, Shift = 8px), H to hide/show, R to
reset one, Shift+R all, Esc to finish. Widgets draw at `Layout.rect(id)` — never
at hard-coded coordinates.

### 4.4 `src/render/palette.js` — one colour language
Already written. `ramp(base, n)` makes hue-shifted ramps (cool shadows, warm
lights); `RAMPS.<material>` are the world's named 5-step ramps; `outlineFor(c)`
gives selective-outline colours; `magicRamp(damageType)` keeps spell FX, UI and
tiles agreeing; `INK` is the UI ink set. Light comes from the **upper left**.
Use these instead of inventing new near-duplicate colours; add ramps here if you
must (append only; coordinate in your notes).

### 4.5 Fonts (ui/kit.js)
`UI.text(ctx, x, y, str, { size })` gains sizes: `'fine'` (the 5x7 glyphs at
half size on the fine grid — crisp small text, ~2.5x3.5 logical px), `'xs'` (a
compact 3x5 or 4x6 fine-grid face for dense numbers), existing `'sm'`/`'md'`,
`'lg'`, and `'title'` (a display face with medieval character — rubricated
capitals / blackletter-inspired — for headings, banners, the logo, drop caps).
`measureGlyphs` understands all sizes. On a res-1 layer, fine sizes fall back to
`sm` so nothing is ever blurry.

### 4.6 Sprites and animation contracts
- Humanoids stay 16x24 on 16px tiles (world pixel density is consistent;
  never mix pixel scales inside the world). Improve them within the frame.
- New pose frames for layered humanoids, named `<pose>-<dir>-<n>`:
  `idle` (breathing, 2-4 frames), `walk` (existing 4), `attack` (wind-up,
  strike, follow-through: 3), `cast` (raise, release: 2-3), `shoot` (2),
  `hurt` (1), `ko` (1, lying). `render/actor.js` exposes
  `actorPoseFrames(ch, pose, dir)` and `drawActor(..., { pose, poseT })`.
  Battle and overworld code request poses by name and fall back to walk frames
  if a pose is missing.
- VFX: `src/render/vfx.js` exports
  `VFX.play(styleId, { from, to, color, dtype, radius, zoom, layer, onImpact })`
  returning a handle with `.done` (Promise). `styleId` covers every existing
  `vfx.style` value in the spell data (bolt, beam, cone, nova, rain, aura, wave,
  burst, chain, summon, heal, ward, ...). Pixel-art frame animations authored in
  PixelForge compile to `src/render/vfx-art.js`. `combatui._castFX` and
  overworld field casts call VFX.play.

### 4.7 Music contracts
- Tracks live in `core/music.js` (existing), `core/music_sacred.js` and
  `core/music_secular.js` (new books; `build(h)` returns `{ tracks, groups }`).
- A track may declare `contexts: [...]` and `weight`. Contexts:
  `title, town, city, village, inn, tavern, shop, market, temple, crypt, castle,
  field, road, forest, hills, mountain, coast, marsh, night, dungeon, cave,
  underdark, battle, boss, dragon, victory, defeat, lament, camp, festival,
  mystery, tense, travel`.
- `Audio.music(id)`: if `id` is a context with several tracks, audio.js picks
  one (seeded by map + in-game day) and rotates to another after a few loops so a
  long session never wears one tune out. Plain track ids still play that track.
- New instruments the audio agent must provide and composers may use (until
  implemented, INSTRUMENTS aliases them to the nearest existing voice):
  `voiceBass, voiceTenor, voiceAlto, voiceTreble` (sung, with vowel control
  `vowel: 'a'|'o'|'u'|'e'|'i'` per layer and syllable-like articulation),
  `choirMen, choirFull` (sections), `sackbut, cornett, dulcian, shawmAlto,
  shawmTenor, portative, positive` (organs), `lutePlucked` (Karplus-Strong),
  `harpGothic, psalteryStruck, citole, gittern, symphonia` (hurdy-gurdy),
  `bells, handbells`. All of these already resolve (aliased) in INSTRUMENTS.
- Percussion is a `wave: 'noise'` layer whose notes are drum ids. Existing:
  `tabor frame shaker wardrum timp timphi gong rim tom drip crash click`. The audio
  agent adds `nakers nakersHi tambourine bellTower handbell cymbalettes`;
  until then an unknown drum id is silent, never an error.
- Layer options composers may use: `vowel`, `ornament` (`'mordent'|'trill'|'grace'`
  applied to long notes), `swing` (0..0.3), `humanize` (timing ms), `pan`
  (-1..1), `room` ('hall'|'chapel'|'tavern'|'open'|'cave').

### 4.8 World and sandbox contracts (world fleet)
New state keys (lazy, default-safe): `st.factions` (standings, ranks, the
player's own company), `st.economy` (regional prices, merchant stock, owned
property), `st.world` (active events, rumors, region control, director
pacing), `st.companions` (approval, flags, quest stages), `st.npcLife`
(memories of the player, schedules overrides).
Modules: `rules/factions.js`, `data/factions.js`, `rules/economy.js`,
`data/tradegoods.js`, `rules/encounters.js` (the encounter director),
`data/encounters.js`, `rules/worlddirector.js`, `data/rumors.js`,
`rules/npclife.js`, `rules/companions.js`, `data/companions.js`. Cross-module
calls go through small exported functions (e.g. `factionStanding(st, id)`,
`rumorsFor(st, npc)`, `priceFor(st, itemId, mapId, 'buy'|'sell')`).

**`rules/deeds.js` already exists**: `noteDeed(st, deed)` is the single place the
world hears about something the player did; `onDeed(fn)` subscribes;
`recentDeeds(st, filter)` queries. Whoever SEES a deed reports it (combat: kill /
spare / flee; crime.js: crime / theft / murder; shop: trade / haggle; dialogue:
persuade / lie / threaten / bribe; quests: quest / questFail). Factions,
companions, NPC memory and the director LISTEN. Never call another world
module directly to tell it about a deed.

## 5. Ownership — who may edit what

Each agent owns files. You may READ anything. Edit files you do not own only
for a small, necessary hook (an import and a call), and say so in your report.
Merges are three-way, so small non-overlapping hooks land cleanly; rewrites of
someone else's region do not.

| fleet | agent | owns |
|---|---|---|
| Interface | `stage` | `render/stage.js` (new), `engine.js`, `core/input.js` (mouse transform), `index.html` (CSS/shell only — the import map is generated), `ui/layout.js` (new), F10 inspector, `test/regress.mjs` pixel-coordinate fixes |
| Interface | `kit` | `ui/kit.js`, `ui/ornament.js`, `kit-test.html` |
| Interface | `title` | `ui/title.js` |
| Interface | `hud` | `ui/hud.js`, `ui/hotbar.js`, overworld `drawUI` and `_drawBanner/_drawPopup/_drawExitLabel/_drawInteractHint` |
| Interface | `combat-hud` | `ui/combatui.js` **`drawUI` and everything only it calls** (toolbar, log, initiative rail, cards, menus, prompts, targeting UI) |
| Interface | `menus` | `ui/menus.js`, `ui/dialogue.js` (presentation), `ui/shop.js` (presentation), `ui/restui.js`, `ui/levelup.js`, `ui/charcreate.js`, `ui/cheatmenu.js` |
| Art | `pixelforge` | `pixelforge/**`, `.claude/skills/pixel-art/**`, `.agents/skills/pixel-art/**`, `tools/pxbuild.mjs` (new), `scripts/build-*.mjs` |
| Art | `terrain` | `render/tiles.js` ground/nature tiles (grass, dirt, roads, water, shore, sand, snow, marsh, cave/dungeon floors, trees, bushes, rocks, cliffs, flowers, crops) |
| Art | `architecture` | `render/tiles.js` building/interior/prop tiles, `world/mapkit.js`, building generation in `world/maps*.js` and `world/mapgen.js` |
| Art | `characters` | `render/spritedata_chars.js`, `render/actor.js`, `render/sprites.js` |
| Art | `monsters` | `render/spritedata_monsters.js`, `monsterlab.html` |
| Art | `vfx` | `render/fx.js`, `render/vfx.js` (new), `render/vfx-art.js` (new), `assets/pixel/vfx/**` |
| Art | `battlefield` | `ui/combatui.js` **`draw` / `_drawField*` / units / animation / `_castFX` / camera**, `world/battlemap.js` |
| Art | `lighting` | `render/lighting.js` (new), overworld `draw()` and its depth/grade passes, `world/entity.js` draw code |
| Music | `audio` | `core/audio.js`, the INSTRUMENTS section of `core/music.js`, context rotation |
| Music | `sacred` | `core/music_sacred.js` |
| Music | `secular` | `core/music_secular.js` |
| Music | `score` | `core/music.js` TRACKS (revising old tracks), `trackForBiome`, map `music:` fields |
| World | `encounters` | `rules/encounters.js`, `data/encounters.js`, `rules/scaling.js`, overworld encounter/roamer code |
| World | `economy` | `rules/economy.js`, `data/tradegoods.js`, `ui/shop.js` (logic), property ownership |
| World | `factions` | `rules/factions.js`, `data/factions.js`, `ui/factions.js` (new), state.js faction code |
| World | `npclife` | `rules/npclife.js`, `world/entity.js` NPC behaviour (not draw code), `data/npcs_extra.js` |
| World | `companions` | `rules/companions.js`, `data/companions.js`, `world/party.js` |
| World | `director` | `rules/worlddirector.js`, `data/rumors.js`, `data/quests.js` generator |
| Sandbox | `crafting` | `rules/crafting.js`, `data/recipes.js`, `data/gathering.js`, `world/gathering.js`, `ui/crafting.js` (all new) |
| Sandbox | `pastimes` | `rules/pastimes.js`, `data/pastimes.js`, `ui/pastimes.js` (+ `ui/pastimes/*`) (all new) |
| Sandbox | `codex` | `ui/codex.js`, `data/books.js`, `data/codex.js` (all new) |
| Roads | `travel` | `rules/travel.js`, `ui/travelmap.js`, `data/routes.js`, mount sprites (names prefixed `mount-`) (all new) |
| Roads | `ambience` | `core/ambience.js`, `core/sfx_extra.js` (new); at most a tiny hook in `core/audio.js` for its context/bus |

`ui/combatui.js` has two owners on purpose: the split is draw() vs drawUI().
`render/tiles.js` has two owners: stay inside your tile categories and put new
shared helpers in your own new module (`render/tiles_terrain.js`,
`render/tiles_arch.js`) rather than editing the shared top of the file.
Palette: import from `render/palette.js`; do not edit `PAL` in tiles.js wholesale.

## 6. How to work (every agent)

**Branch.** You start in your own git worktree. First:
```sh
git branch --list 'overhaul/<role>*'   # a previous attempt may have been interrupted
# none:   git checkout -b overhaul/<role>
# exists: git checkout -b overhaul/<role>-r2 && git merge overhaul/<role>   (then read its notes)
```
**Notes.** Keep `docs/overhaul/<role>.md` current: plan, decisions, what is
done, what is left. It is how a resumed attempt picks up your work.
**Commit early and often** (`git add -A && git commit -m "..."`) — at least after
every milestone. Uncommitted work is lost if the run is interrupted.

**See your work.** Never trust code you have not looked at.
```sh
NODE=C:/Users/Dizzy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe
$NODE tools/shot.mjs --scenario town --out output/<role>/town.png        # then Read the PNG
$NODE tools/shot.mjs --scenario town --hour 22 --out output/<role>/night.png
$NODE tools/shot.mjs --scenario fight --map neverwinter-wood --enemies goblin:4 --class wizard --out output/<role>/fight.png
$NODE tools/shot.mjs --scenario map --map waterdeep --out output/<role>/wd.png
$NODE tools/shot.mjs --scenario title|charcreate|dialogue|menu --menu InventoryScene ...
$NODE tools/shot.mjs ... --eval "<js>"  or  --script probe.js  (window.SC, import('/src/...'))
$NODE tools/regress-run.mjs            # the regression suite; must stay green
$NODE --input-type=module -e "await import('./src/...')"   # headless module checks
```
`shot.mjs` serves YOUR worktree on a private port, so parallel agents never see
each other's half-finished edits. `output/` is git-ignored scratch. The machine
has 4 cores shared by ~8 agents: keep browser runs purposeful, one at a time.
Use `--frames 3 --every 150` to check animation. Look at every screenshot you
take (Read the PNG) and judge it like a demanding art director.

**Quality bar.** Before landing, capture before/after shots of what you
changed, compare them honestly, and fix what looks worse. If a change is not
clearly better, it is not done. Zero console errors, zero draw failures,
regress suite green, `tools/stamp.mjs --check` clean.

**Landing.** When your work is complete and verified:
```sh
git add -A && git commit -m "<role>: ..."    # message ends with the Co-Authored-By line below
sh tools/land.sh                              # merges main in, re-stamps, fast-forwards main
```
If land.sh reports conflicts, resolve them in your worktree (keep both sides'
intent), commit, run the regress suite again, and rerun land.sh. Never edit or
commit in the main checkout directly (`C:/Users/Dizzy/Documents/DND GAME`) —
other agents' landings fast-forward it.

Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## 7. Docs

When you land, append a short section to your `docs/overhaul/<role>.md`
describing what changed, how to use/extend it, and any rule you learned the
hard way. The orchestrator consolidates these into `progress.md` and
`docs/CONTINUE.md` at the end.
