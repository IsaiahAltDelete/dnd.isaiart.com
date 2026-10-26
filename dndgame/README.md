# Sword Coast Chronicles

A top-down pixel-art RPG set in the Forgotten Realms, running a full D&D 5.5e
(2024 rules) engine in the browser. Walk the Sword Coast from Phandalin to
Baldur's Gate with a party trailing behind you, talk to the people who live
there, take work from factions, and fight tactical turn-based battles on a
5-foot grid.

The feel it aims for: a classic GBA-era JRPG overworld fused with a real
tabletop rules engine, dressed as *an illuminated manuscript you can walk
around in*. Warm, hand-shaded pixel art; an interface of dark vellum, gilt
rules and drop-cap initials; a score of medieval polyphony (organum, motets,
estampies) instead of chiptune.

Zero dependencies and no build step: vanilla ES modules and Canvas2D. Every
sprite, tile and sound is generated in code or compiled from text-based pixel
art, so there are no image or audio files.

## What is in it

- **The world.** 94 maps and 337 two-way warps along the canonical roads:
  Phandalin, Neverwinter and its wood, the High Road, Waterdeep, the Trade Way,
  Daggerford, the Way Inn, the Fields of the Dead, and Baldur's Gate's districts,
  plus procedural dungeons (Undermountain, crypts, mines).
- **People.** 245 NPCs with dialogue trees or their own greetings, 46
  recruitable companions, animals that do not speak Common (unless you cast
  Speak with Animals).
- **Rules.** 12 classes with subclasses, 13 species, backgrounds and origin
  feats, 363 spells (every one does something, in combat and out), 497 items,
  275 monsters, conditions, concentration, reactions, legendary and lair
  actions, crime and bounties, rests, levelling to 20 and Epic Boons beyond.
- **A world that keeps going.** A world director runs calendar events
  (festivals of the Calendar of Harptos, raids, shortages, dragon sightings)
  that advance on their own and change prices, roads and rumours. Quests are
  generated endlessly from events, rumours and faction needs. The encounter
  director puts travellers, caravans, patrols and camps on the roads, with a
  who and a why; you can parley, bribe, sneak or fight, and ambushes are rare
  and telegraphed.
- **Tactical combat** on terrain sampled from where you stood, with formations,
  hazards, cover, zones (Fog Cloud, Darkness) and a choreographed camera.
- **Customization.** Four UI themes, a rearrangeable HUD (F8), display filters,
  a songbook for choosing music, encounter pacing, window scale, rebindable keys.

## Running it

Serve the folder with any static web server and open it in a browser:

```bash
python serve.py 8765
```

Then open http://localhost:8765. (`npx --yes http-server -p 8765` works too.
Opening `index.html` straight from disk does not, because browsers block ES
modules on `file://`.)

**Controls:** arrows or WASD to move, Shift to run, E to interact, Z/Enter to
confirm, X/Esc to cancel, Esc or P for the pause menu, I inventory, K spells,
M map, J journal, Tab party. In battle, 1-5 pick actions. F8 arranges the HUD,
F10 opens the layer inspector, ` shows debug info. Gamepads work.

**Cheats for testing:** type `xyzzy`, `god`, `ghost`, `calm`, `nofight`,
`heal`, `home`, `coin`, `boost`, `unfog`, `keys`, `onehit` or `freecast` in the
game window, or use Pause > Cheats, or `cheat.help()` in the browser console.

## How it is built

```
index.html          boot screen + an import map pinning every module to its content hash
src/main.js         bootstrap and cross-module glue
src/engine.js       game loop, scene stack, transitions
src/core/           input, audio + synth, music books, save, rng, dice, events, cheats
src/data/           frozen catalogues: species, classes, spells, items, monsters, NPCs,
                    quests, dialogue, encounters, rumours, world events
src/rules/          the 5.5e engine: characters, combat, actions, AI, spellcasting,
                    conditions, progression, crime, field magic, encounters, world director, deeds
src/world/          tilemap, maps and region packs, map generation, entities, party, overworld scene
src/render/         the layer compositor (stage.js), sprites, actors, portraits, tiles,
                    effects, palette ramps, compiled pixel art (render/art/)
src/ui/             the UI kit and every screen: HUD, combat UI, menus, dialogue, shop,
                    character creation, level-up, rests, title
assets/pixel/       PixelForge .pxa sources (text grids) compiled into src/render/art/
pixelforge/         PixelForge, the text-based pixel-art tool (Python, no dependencies)
tools/              stamp (import map), screenshots, regression runner, audits, music renders
test/regress.mjs    browser regression suite
docs/               SPEC (engineering spec), SETTING (canon and naming tables),
                    CONTINUE (history and hard-won rules), OVERHAUL (current plan)
*.html (root)       dev pages: spritelab, monsterlab, spritediff, npccheck, kit-test, validate
```

**After changing anything under `src/`, run `node tools/stamp.mjs`.** The import
map in `index.html` pins every module to a hash of its contents so a deploy can
never serve a half-old game; the regression suite fails if it is stale.

**Testing** needs Node 18+ and Playwright (not a dependency of the game):

```bash
npm i -g playwright
npx playwright install chromium
node tools/regress-run.mjs                                  # the regression suite
node tools/shot.mjs --scenario town --out output/town.png   # screenshot a staged scene
```

## Status

A large visual, music and sandbox overhaul is in progress, planned in
[docs/OVERHAUL.md](docs/OVERHAUL.md) and tracked in
[docs/overhaul/STATUS.md](docs/overhaul/STATUS.md): what has landed on `main`,
what is on which branch, and what has not started. Each part of the work has
its own notes in `docs/overhaul/<role>.md`.

## Rules of the house

- **Forgotten Realms canon only.** Real places, gods, factions and monsters
  from published lore. No invented portmanteau fantasy names; minor characters
  are named from the cultures in `docs/SETTING.md`.
- **No external asset files** at runtime, no npm dependencies, no build step.
- **Old saves keep loading.** New state goes under new keys with defaults; tile
  ids are append-only.
- No transcriptions of copyrighted music. Medieval and Renaissance works are
  public domain and are arranged freely; most of the score is original.
