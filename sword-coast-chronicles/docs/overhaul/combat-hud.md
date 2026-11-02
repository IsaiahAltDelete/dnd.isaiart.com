# combat-hud — the battle interface

Role: Interface fleet, `combat-hud`. Owns `ui/combatui.js` `drawUI()` and
everything only it calls (rail, bar, cards, log, banners, dice, prompts,
results), plus the `battle.*` Layout registrations and the UI hit-testing that
reads the same rects. The battlefield agent owns `draw()`, `_drawField*`, unit
drawing, animation, `_castFX` and the camera, and merges after me.

## Plan (r1)

The field is the star: the interface lives in two thin bands (top 20px, bottom
28px) drawn on the fine grid, and only small, purposeful plates ever float over
the field (the detail tooltip above the bar, the target card, banners, dice).

Layout (logical px, 400x240):

| id | where | what |
|---|---|---|
| `battle.rail` | top band, left | round seal + initiative tokens (portrait, side frame, fine HP pips, current-turn glow), upcoming order from the actor, a round-break marker, smooth slide on reorder |
| `battle.log` | top band, right | last 3 log lines in fine text; J / click opens the full log |
| `battle.unit` | bottom band, left | active unit card: token, name, HP bar + numbers, AC, conditions, concentration, slot gems |
| `battle.menu` | bottom band, centre | verb plates (icon, xs label, keycap), budget gems (Action / Bonus / Reaction) and a movement gauge at its left end; spell submenu grouped by level with slot gems on a header strip |
| `battle.end` | bottom band, right | End Turn as a wax seal plate |
| `battle.detail` | above the selected plate | name, cost / range / concentration, two lines of description, slots, refusal reason |
| `battle.stat` | top-left under the rail | target card on hover: name, HP, AC, hit chance and expected damage for the chosen action, resistances |
| `battle.dice` | centre | the d20 popup, caption and damage arithmetic in fine text |

- Turn banner: heraldic banner (kit `banner` material) hanging under the rail,
  the `title` face sweeping in ("Round 2 — Tester").
- Reaction prompt, victory / defeat / escape panels: kit windows with
  rubricated headings, loot chips and XP rows.
- World-anchored UI (HP slivers, condition dots, focus numbers, turn chevron)
  moves to `world-ui` at fine resolution. `_drawUnits` still calls
  `_drawUnitTag`, which now only records the anchor; one call in
  `_drawField`'s existing world-ui pass draws the recorded tags
  (`_drawWorldUI`). That is the only line touched in the battlefield's code.
- `FIELD` follows the bands (y 20..212) so the camera frames the arena
  between them.

## Status
- [x] bands, rail, log tail (landed r1)
- [x] unit card, action bar, budget, end seal, detail tooltip, spell groups (landed r1)
- [x] target card, world-ui tags, offscreen markers (landed r1)
- [x] banner, dice medallion, prompt, results, full log (landed r1)
- [x] screenshots: output/combat-hud/v4-*.png (banner, menu, spell, hover, target, move, log, prompt, enemy, victory)
- [x] polish: vellum grain + double rules, fine meters, painted busts, boss quote, XP bars, group contents in the detail, mirrored layouts

## What changed (landed)

The battle interface is two thin bands on the fine grid and a few plates that
float over the field only while they have something to say. The field grew
from 176px to 191px tall and nothing hangs down its right-hand side any more.

- **Top band** (y 0..19): the round as a wax seal; the initiative rail reading
  from the creature acting now (larger, gilt frame, lamplight) through everyone
  still to come, a gilt rule-and-gem where the round turns over, five fine HP
  pips under each token, condition dots and a concentration gem on its corners.
  Tokens slide one place when a turn ends; the one that acted drops in at the
  back. People show their painted bust (render/portrait.js, cropped round the
  eyes); creatures their own sprite's head. The last three log lines sit at the
  right in the fine face, newest brightest; J or a click opens the full log.
- **Bottom band** (y 211..239): the acting creature's card (bust, name, HP
  numbers and meter with the kit's damage ghost, AC, conditions, concentration,
  slot gems per level); the budget (Action / Bonus / Reaction gems, a movement
  gauge ticked every 5 ft, attacks left); the action bar (verb plates: icon,
  compact label, digit keycap, a gem in the colour of what it costs, a pointer
  on groups; the spell bar gaps and tabs its plates by level with slot gems);
  End Turn as a wax seal with "SURE?" when an action is unspent. While aiming
  or moving, the bar becomes the verb chip plus Back / Next / Slot / Confirm
  with their keys; on someone else's turn it says who is acting and who is next.
- **Floating**: the verb detail hangs over its own plate (name, cost / range /
  concentration, three lines of description or a group's contents, the reason
  it cannot, slot gems) while the pointer is on the bar or the keyboard drives;
  the target card (top left) on hover or aim: bust, type and CR as printed
  (1/4), HP, AC, speed, distance, conditions, resistances / immunities /
  vulnerabilities, and for the chosen action the hit chance, the expected
  damage against its resistances, Potential KO, the reason for advantage, or
  "Out of reach". Area aiming lists who is caught and their save mods.
- **Banners**: heraldic cloth (the kit's banner material) hanging from the top
  band's rule, azure for the party, gules for foes, other tinctures by colour;
  it unfurls, the name in the display face sweeps in behind a glint, then it
  furls. A turn banner reads ROUND n / name / your move. A boss card is the same
  cloth at titleLg with its quote on two lines.
- **Dice**: the kit's d20 lands on a medallion with twenty gilt notches; the
  rolled face's notch lights. Caption and damage arithmetic in fine type.
- **Prompt, results, log**: the reaction prompt with keycapped buttons and a
  burning fuse; Victory as a page as tall as its contents (rows arrive one by
  one, XP counting up with a bar toward the next level, a wax seal on a level
  gained, loot chips in rarity colours); Defeat / Escape headed in the display
  face; the full log on a folio page with rounds rubricated and a scrollbar.
- **World-anchored UI** is on `world-ui` at fine resolution: HP slivers (with
  damage ghosts), condition dots, the focus numbers, the gilt turn pennant,
  death-save gems.

## How to use / extend

- Widgets: `battle.rail` (not hideable), `battle.log`, `battle.unit`,
  `battle.budget`, `battle.menu` (not hideable), `battle.end` (not hideable),
  `battle.detail`, `battle.stat`, `battle.dice`. Everything draws and
  hit-tests at the synced rects; `_barGeom(rows, inSub, idx)` is the single
  source of the bar's cells for draw and click, `_railAt(x, y)` for the rail,
  `_promptGeom()` for the prompt, `_aimControls()` for the aim buttons.
- HUD pieces at module level in combatui.js (section 1.2): `plate`, `giltRule`,
  `meter` (use this, not `UI.bar`, for thin fine meters), `gem`, `keycap`,
  `bust`, `token`, `hpPips`, `slotGems`, `verbLabel`.
- `_mathFor(unit, target, option)` returns the to-hit / damage / save maths the
  card shows; `_chosenAction()` is which option the card uses.

## Hooks outside my region (small, necessary)

- `_drawField` (battlefield's): its existing world-ui pass also calls
  `this._drawWorldUI(ctx)`. `_drawUnits` still calls `_drawUnitTag`, which now
  only records the anchor; the tags draw in that world-ui pass. If the
  battlefield rewrites `_drawUnits`, keep the `_drawUnitTag(ctx, u, x, y,
  scale)` call (or call `_drawTag` from its own world-ui pass) and the hook.
- `FIELD` (a layout constant) now spans y 20..210 to match the bands; the
  camera reads it as before.
- `ui/kit.js diceRoll`: `result.backdrop === false` skips its 40px square, so
  the die can sit in the medallion.
- Turn banners carry `kind: 'turn', round, side, note` (set in `_openTurn`,
  copied in `_startBeat`).

## Rules learned the hard way

- `UI.bar`'s border is one LOGICAL pixel: a 3px fine meter keeps one pixel of
  fill. Draw a half-pixel keyline yourself and pass `border: false` (`meter`).
- `Layout.rect(id, { w, h })` remembers the live size, and a bottom-anchored
  widget then moves its top edge: never derive a "player offset" from a rect
  whose live size you set. The detail plate keeps its registered size.
- Kit `measure` / `fit` assume the last context's resolution; the battle UI is
  all on 2x layers so fine sizes measure right, but a probe in node must pass
  `res` (the 4th argument of `measure`).
- Enemy turns take several seconds each in headless Chromium at battle speed
  1; the capture script sets `Save.settings.battleSpeed = 5` until the party's
  turn. `output/combat-hud/cap.js` stages every state in one browser run
  (banner, menu, spell, hover, target, move, offscreen, log, prompt, enemy,
  victory, defeat) from Stage.snapshot(); `unpack.mjs` writes the PNGs.

## Known gaps / for later agents

- Target reticles and AoE footprints are still drawn by
  `_drawTacticalOverlays` on `deco` (battlefield's region); moving them to
  `world-ui` belongs with the battlefield agent's pass.
- Old saved offsets for `battle.log` / `battle.budget` / `battle.detail` from
  the previous layout still apply to the new blocks; Shift+R in Arrange resets.
