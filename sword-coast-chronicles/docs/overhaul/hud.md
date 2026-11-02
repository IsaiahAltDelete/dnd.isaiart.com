# hud — the overworld interface, redrawn as Layout widgets on the fine grid

Role: Interface fleet, `hud`. Owns `ui/hud.js`, `ui/hotbar.js`, and the
overworld's `drawUI`, `_drawBanner`, `_drawPopup`, `_drawExitLabel`,
`_drawInteractHint`. New files (mine): `ui/hudparts.js` (fine-grid parts),
`ui/hudmap.js` (minimap + quest compass), `ui/barks.js` (speech bubbles),
`tools/hudprobe.js` (a shot.mjs probe that stages a busy four-member party).

Hooks outside my files (small, additive):
- `ui/layout.js` (stage's): `Layout.definePreset(name, def)`, `Layout.preset`,
  `Layout.mode(key)`; a preset may `place` widgets; applying one sets
  `Save.settings.hudPreset`; an EV_SETTINGS listener lays out a preset picked
  in Options. The old generic `focus` preset is folded into `minimal`.
- `core/save.js`: `hudPreset` and `minimapZoom` in SETTING_SPEC (so the
  sanitiser keeps them; the Options screen lists both automatically).
- `world/overworld.js`: `new HUD({ scene: this })`; `hud.drawBarks(ui, cam)`
  after the interact hint in `draw()`; the exit-label record carries `dir`.

## Status
1. [x] Presets API in layout.js; hudPreset / minimapZoom settings.
2. [x] hudparts.js: frame (theme-aware, one logical px of border), well,
   meter (ghost, temp cap, pulse, notches), keycap, marks, badges, caches.
3. [x] Party cards: painted bust (characters' drawPortrait, 1:1 device px),
   name, HP readout, meter with damage ghost and hit flash, spell-slot pips /
   death saves / AC, condition and buff badges. Pips mode for `minimal`.
4. [x] Clock: sky dial (sun/moon riding an arc, stars, weather over a
   horizon), time, day phase, full date, purse, weather word.
5. [x] Quest compass: brass needle to the goal on this map, or to the doorway
   or road that leads to it (BFS over WORLD_NODES), distance in feet + wind,
   `via <next map>`, step count; click opens the journal.
6. [x] Minimap: parchment plan painted once per map and then only the newly
   revealed tiles, zoom 0.5 / 1 / 2 px per tile (click cycles; persisted),
   hard-edged mask, gilt rim with cardinal ticks, rubric N, fog hides every
   marker, quest star and spell pins pinned to the rim on their bearing.
7. [x] Log: last three lines over a soft wash, bottom-left, fading.
8. [x] Toasts on 'overlay', in the right column under the quest; they wait
   un-aged under menus and conversations instead of printing across them.
9. [x] Banner: heraldic banner (kit `banner` material) unrolling from its rod,
   the place name in the `title` face, tincture by kind of place.
10. [x] Action belt: E verb (icon, label, keycap, "+shift: attack"), four
   slots (icon, digit cap, count, dotted empty socket), four menu buttons.
11. [x] Interact hint with a "[E] Talk" plate; exit label; Found popup.
12. [x] Barks API.
13. [x] Fades: under menus/dialogue (worked out in draw with Game.dt, since
   the world's update stops under a menu), per widget when the player walks
   under it, cinematic preset.
14. [x] Screens: town day/night, forest, dungeon, arrange mid-drag, presets.
15. [x] regress green, stamp clean, landed (increments 1-3).
16. [x] Pointing at a party card opens a gilt tooltip: level and calling, HP,
   AC, XP to the next level, death saves, every badge by name. Clicking a
   card opens the party screen.
17. [x] A gilt XP hairline on each card; the compass needle swings to a new
   heading on a damped spring; long objectives wrap to a second line (the
   widget grows, anchored top-right).
18. [x] The Found slip is the `hud.popup` widget (anchor mc).
19. [x] Talk has its own speech-bubble icon on the belt; keycaps use the plain
   fine face (a bold letter fills in at seven device pixels).
20. [x] regress: `hud: every preset keeps the panels on screen and apart`,
   `hud: minimal hides the map and quest, keeps the belt` (new checks).

## Before / after
Before (main at the start): party rail 86x130, clock 120x28, quest 238x32
over the lower third, log ribbon 300x12, belt 300x24, minimap 56x65 — all in
the 5x7 face at 1x. After: party 66x75, clock 106x15, quest 106x20 (top
right), log 106x18, belt 177x18, minimap 44x44; the lower two thirds of the
screen are the world's except for the belt and the roundel. Measured HUD cost
(town, headless): hud.draw 0.9 ms + belt 0.4 ms per frame.

## How to use it

### Layout widgets (all scene 'overworld')
`hud.party hud.clock hud.quest hud.banner hud.toasts hud.log hud.minimap
hud.toolbar hud.popup`. Every one draws and hit-tests at `Layout.rect(id)` each frame;
hide one with `Layout.set(id, { hidden: true })`. `hud.alphaOf(id)` is the
alpha a widget is drawn at this frame (menus, walking-under, cinematic).

### Presets
`Layout.presets` -> `default` (as designed), `mirrored`, `classic` (the old
spots: quest over the belt, belt and log bottom-left, notices centred),
`minimal` (clock, party pips, belt; also hides `battle.log`), `cinematic`
(designed layout; the HUD fades while walking and returns after 0.9 s still,
on hover, or for 3 s after anyone is hurt). `Layout.applyPreset(name)` lays
it out and sets `Save.settings.hudPreset`; Arrange mode's P key steps them;
choosing one in Options (the `hudPreset` setting) applies it too.
`Layout.mode('party')` / `Layout.mode('fade')` read the preset's behaviour.
Add your own: `Layout.definePreset(name, { label, place: { id: {x, y} }, hide: [ids], mode })`.

### Barks — speech bubbles for the world fleet
```js
import { bark } from '../ui/barks.js';        // or scene.hud.bark(...)
bark(entity, 'Mind the cart!');                // follows the entity (anything with px/py)
bark({ x: 12, y: 8 }, 'Help!', { ttl: 3, kind: 'shout' });   // a map tile
bark({ px: 200, py: 96 }, '...', { kind: 'thought' });       // a world-pixel point
```
kinds: `say` (parchment), `shout` (bold, rubric keyline), `whisper` (faded),
`party` (lapis, for companions), `hostile` (bold, blood), `thought` (bubble
tail). `ttl` defaults from the length of the line (2.2-6 s). One bubble per
speaker (a new line replaces the old), at most five, typed in at 55 cps.
Bubbles stack upward rather than overlap, slide off or climb over every
visible HUD widget, the toasts, the banner, the exit label and the interact
hint, and are skipped (never drawn over the HUD) when there is no room. They
clear on a map change. `clearBarks()`, `barks()` for the list.

### Quest compass data
`questGoal(st, map, entities, player)` (ui/hudmap.js) ->
`{ here: true, x, y, kind, via, label }` (a tile on this map) or
`{ here: false, label }` or null. Uses the step's `map`, a talk/deliver
target's `npc.map`, or the giver when every step is done.

### Probe
```sh
$NODE tools/shot.mjs --scenario town --script tools/hudprobe.js --out output/hud/town.png
$NODE tools/shot.mjs --scenario town --hour 22 --eval "window.HUDPROBE={face:true,explore:16}" --script tools/hudprobe.js ...
$NODE tools/shot.mjs --scenario town --eval "window.HUDPROBE={arrange:true}" --script tools/hudprobe.js ...
$NODE tools/shot.mjs --scenario town --eval "window.HUDPROBE={presetSeq:['classic','minimal','cinematic'],presetEvery:1600}" --script tools/hudprobe.js --frames 3 --every 1600 ...
```

## Rules learned the hard way
- `globalCompositeOperation = 'destination-in'` applies per draw call: a disc
  filled row by row erases everything but its last row. Mask with ONE
  drawImage of a cached mask canvas.
- The world's `update` does not run under a menu (`pausesBelow`), so any fade
  meant to happen under one must be advanced in `draw` with `Game.dt`.
- Toasts drawn over a covering menu land on the menu's own text wherever they
  go; holding them until the world is back reads better.
- A 14px portrait well on the 2x layer is 28 device px: the characters
  fleet's `drawPortrait` crops its 40px bust round the eyes 1:1 there, which
  is exactly right for a card; do not scale it.
