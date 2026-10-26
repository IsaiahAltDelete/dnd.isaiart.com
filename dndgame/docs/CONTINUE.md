# Sword Coast Chronicles — where to pick up
Updated 2 Sep 2026, after the combat / encounter / city / field-magic pass.

## State: playable, verified end to end
- 82 maps, 166 warps — ALL 166 verified in both directions: warp tile walkable,
  landing tile walkable, return warp present and reachable by pathfinding.
- Phandalin -> Baldur's Gate Upper City walks in 11 legs, and back again:
  phandalin -> neverwinter-wood -> neverwinter -> waterdeep -> trade-way-north ->
  daggerford -> the-way-inn -> trade-way-south -> fields-of-the-dead ->
  coast-way-north -> bg-blackgate -> bg-the-wide
- 186 NPCs / 185 dialogue trees, 0 dangling goto, 12 southern shopkeepers and
  10 quest-givers all resolve. 86 quests. 177 spawned entities all on walkable tiles.
- Console clean, `node tools/stamp.mjs --check` passes (70 modules).

## Fixed in this pass
- applyWarpNodes now clears INCOMING landing tiles, not just the tile you step on.
  A scattered prop had sealed the road out of Rosymorn Monastery; the fix is
  structural so no future region pack can reintroduce it.

## Verified NOT bugs (don't re-chase)
- undermountain / dragonspear-castle / rosymorn-cloister / nashkel-mines /
  bg-sewers / tumbledown-crypts look "orphaned" to a WORLD_NODES graph walk
  because their exits are created by their own builder at load time
  (toXY: null = procedural). Each has a working warp back to its surface map.
- 5 NPCs sit on solid tiles in the CATALOGUE, but the spawn path already relocates
  them via clearStanding()/safeTile(). Check entities, not npcs.js coordinates.

## Unfinished
1. Southern quest chain untested in actual play (ids all resolve; nobody has
   played through Daggerford -> Baldur's Gate accepting and completing them).
2. Cast agent was stopped mid-run — its own id cross-check never finished, though
   an independent check of the same things passed here.
3. Cosmetic, low priority: Neverwinter quay scallop is periodic (lag-16 ~0.49);
   WOOD_FLOOR / BONE_FLOOR grid ratio >1.2 (legitimate plank/course art).

## Architecture notes
- Region packs: world/maps_south.js + maps_baldursgate.js export REGION_MAPS +
  REGION_LINKS; maps.js merges them. New region = new pack file, no core edits.
- Painting helpers live in world/mapkit.js — ONE copy, imported by maps.js and
  both region packs. They used to be duplicated three times and had drifted
  (ironDoor / iron / step). Do not reintroduce local copies.
- Never renumber tile ids (append only). Always run node tools/stamp.mjs after edits.
- Cheats: Pause -> Cheats, or type xyzzy / god / ghost / calm / nofight / heal /
  home / coin / boost / unfog / keys / onehit / freecast anywhere in game.


## Session: encounters, cities, combat feel, field magic

The four weakest parts of the game, done together. `node tools/stamp.mjs` has
been run; `test/regress.mjs` is 28/28.

**Encounters (rules/scaling.js, world/battlemap.js, world/overworld.js).** The
wilderness generated no fights at all: `wildEncounters` defaulted to off and no
map ever spawned a `MonsterEntity`, though the class was complete. `_spawnRoamers`
now seeds 2-5 real packs per wild map with satellites that converge on the
leader's notice, and the pack you SEE is the pack you fight (a roamer's
`groupId` used to be discarded and replaced with 1-3 copies of one monster). The
18 hand-authored `map.encounterTable` entries were threaded all the way to
`_pushBattle` and then dropped; they are used now. Ambush is a real stealth vs
passive-perception contest with biome / night / weather terms, and it cuts BOTH
ways: `ambush:'party'` surprises the foes, which was previously impossible. The
arena is sampled from the ground you were actually standing on, gets hazards,
five formations and role-aware deployment, so the wizard no longer starts in the
front rank. Regions remember being cleared.

**Combat engine (rules/combat.js, ai.js, actions.js).** `applyEffect` dropped
every `kind:'debuff'` (18 spells with fully authored mech), `forcedMove` (6) and
`cure` (7) on the floor. Legendary actions, lair actions and `ai.noteDamage`
were complete but uncalled. Ready banked an action `triggerReadied` never fired.
Monsters could not flee. All wired. Anything resolved outside a turn goes onto
`enc.replays` as `{actor, kind, name, results, log}`, which BattleScene drains
after beginTurn / endTurn / moveUnit / perform.

**Combat feel (ui/combatui.js, render/actor.js, sprites.js).** The sprites have
four walk frames per facing and nothing else, so the body carries the blow:
wind-up, lunge, a weapon layer that swings on its own pivot, recoil scaled to
the fraction of max HP taken, hit-stop on a crit, and a topple that leaves a
corpse lying where it fell. `_castFX` is one dispatcher for every `vfx.style`,
so the ~150 aura and wave spells stopped rendering as a generic ring; impacts
pick their particles, colour and sfx from the damage type. Toolbar: click the
field to move or attack, undo a misclicked move, an End Turn that asks once
while your action is unspent, spells grouped by level with slot counts, a live
initiative rail, and per-character reaction stances. One PC's "always" used to
answer for the whole party, and a timed-out prompt used to spend a slot for you.

**Field magic (rules/fieldcast.js and the new rules/fieldworld.js).** 84 spells
were castable outside combat, spent the slot and did nothing, because
`fieldRole` fell through to "buff" for anything carrying effects. Now none do:
37 refuse in the game's voice without burning a slot, 47 do real work, and 8
that were wrongly refused now function. Locks, traps, light, detection,
divination, resurrection, identification, travel, creation and social magic all
reach real overworld state, and movement mech (fly / swim / climb /
ignore-difficult) finally changes where you can walk.

**Cities (world/mapkit.js, render/tiles.js, world/maps*.js).** 23 new tiles:
gable-aware shingle / tile / slate roof sets, awnings, stalls, tents, washing
lines, banners, lanterns, planters, troughs, hay, docks, pier posts.
`building()` grew wings, porches, dormers and lanterns, so a building is no
longer always a rectangle under one repeated roof tile. Neverwinter's
Protector's Enclave and Waterdeep's Trades Ward were rebuilt: they were two
streets with eight identical houses, and seven identical houses with no wall.
Interiors partition into kitchens, back rooms and stock rooms and size
themselves from the exterior footprint. 12 inns gained a real upper floor.
82 maps -> 94, 313 warps -> 337, all verified two-way.

**The music has an orchestra now (`SPECTRA`, `section:`).** The score sounded
like beeps for one measurable reason: every voice was built from a raw
oscillator shape. A triangle wave's harmonics measure [1, 0, 0.11, 0, 0.04, 0,
0.02] — almost nothing above the fundamental, which is literally what a beep
is. `SPECTRA` in audio.js holds real harmonic recipes and `createPeriodicWave`
builds an oscillator from one, so a violin now measures 12 harmonics all
carrying energy, a clarinet has strong odds and near-zero evens (the hollow
woody sound IS the missing 2nd and 4th), and a trumpet peaks at the SECOND
harmonic, which is the brass bite. No samples, no files — the spec's
no-external-assets rule is intact.

`section: n` on an instrument voices a note n times, each a few cents out
(`detuneCents`), each starting a few milliseconds late (`smear`), each panned
to its own seat (`width`). Sixteen violinists are not one violin played louder,
and that spread is the whole difference between a synth pad and "the strings
came in". New instruments: strings, stringsHigh, violas, celli, basses,
pizzicato, horns, trumpets, trombones, tuba, oboeSolo, clarinetSolo,
bassoonSolo, fluteSolo, woodwinds. New percussion: timp, timphi, gong. The
stone-hall IR gained discrete early reflections, which is what carries room
SIZE — a tail on its own is just a wash.

Two new tracks: `orchestral` ("The Coast Road", the full band, sections
entering in turn rather than all at once) and `rivertune` ("Down the
Chionthar", an ORIGINAL Baldur's Gate tavern ballad — the user asked for a
cover of a copyrighted BG3 song, which was declined; this is an original in the
same idiom). Verified by measurement, not by ear: offline harmonic analysis of
each spectrum, and a live node count showing `orchestral` creating 79 panners
and 79 periodic waves in five seconds where `town` creates none (the medieval
consort path is untouched).

**Twenty-two creatures now have bodies of their own (`gapSprites` 1-3).**
With the map wired (below), 22 creatures were still landing on
`MONSTER_SPRITE_MAP`'s last-resort family GUESS — right category, wrong animal,
which reads worse than an obvious placeholder because the player believes it.
A raven was a griffon, a giant fire beetle was a hill giant, a severed crawling
hand was a goblin, a gorgon was a goblin, a giant toad was a frog-MAN.
New sprites: raven, vulture (+giant-vulture by scale), giant-owl, hyena
(+giant-hyena), giant-weasel, giant-elk, giant-fire-beetle, giant-centipede,
giant-wasp, swarm-of-quippers, swarm-of-poisonous-snakes, crawling-claw,
awakened-shrub (+awakened-tree), scarecrow, unicorn, satyr, couatl,
pseudodragon, werewolf (+were-boar/tiger/bear by tint), gorgon, xorn, manes
(+dretch). Two more were one-line map fixes: giant-toad -> the giant-frog body,
wolf-spider -> giant-spider. **275 monsters, 0 unresolved, 0 family guesses.**

Two rules for anyone authoring more, both learned by rendering and looking:
`fit()` pads the BOTTOM, so an array shorter than `h` leaves the creature
hovering above its own feet — every walker must run its last leg row at h-1
(fliers may sit 1-2px high; that is the hover). And `sym()` fills from a half
row's LAST character to the centre line, so a row ending in a colour makes a
body of width 2*(hw - startCol) and a row ending in '.' leaves a centre gap:
fill for bodies, exact for legs and antlers. The first drafts came out as
loaves of bread because every row started at column 4 and filled.

**`monsterlab.html` (new dev page).** Renders every creature with the art the
GAME would pick (`monsterArtFor`), filterable by id/type/size, any frame, with
a walk toggle. A red border means the sprite is a fallback guess rather than
art authored for that creature — the count in the header is the number to keep
at zero. This is how all of the above was found and verified; run it after
adding any monster.

**Half the bestiary was being drawn as a person (`monsterArtFor`).** 127 of
the 275 creatures name a sprite that does not exist — 'dragon', 'spider',
'ooze', 'swarm-bats', 'elemental' — and a missing name falls through the
compositor to the LAYERED humanoid path, so every dragon in the game, all the
oozes, swarms and elementals were humans in tunics. The art was not missing:
`MONSTER_SPRITE_MAP` / `spriteForMonster` in spritedata_monsters.js already
resolve all 275, dragon colours and ages included, and were exported and
imported by NOTHING. `monsterArtFor(id, dataSprite)` is the wired-up entry
point, called from `drawActor`, so every draw path (overworld, battle,
portrait) gets it at once.

Resolving through the map blindly would have made four creatures WORSE: its
last resort is a family-name guess (`FAMILY_HINTS`) that turns a mastiff into a
goblin and a gargoyle into a golem. So an EXPLICIT map key always wins, and a
guess is used only when the catalogue's own sprite does not exist. Guard cases
to keep green: mastiff, giant-goat, myconid-adult, gargoyle, nars-dendrar must
keep their data sprite.

Tinting has three sources with separate strengths — the CALLER's (a hit flash,
a corpse), the INSTANCE's (`ch.tint`, the catalogue's colour for this creature)
and the FAMILY's (which colour of dragon). They must not share an amount: the
caller's `tintAmt` is routinely 0, and `0 ?? 0.6` is 0, which is what made the
first attempt draw a grey red-dragon.

**Buildings cast a shadow now (`_drawSunShadows`, `_tallMask`).** In Baldur's
Gate a grey stone wall stood on grey flagstone and there was nothing to tell
them apart — the districts read as one flat texture. The existing depth passes
could not fix it: `_drawEdges` draws a thin dark lip where ground meets wall,
which says "edge", and `_drawOverhangs` shades the wall under a roof, which
says "eave". Neither says HEIGHT. A silhouette lying on the pavement does.
`_tallMask` marks which solid tiles are actually a building — a solid `over`
tile means a roof, a wall touching one is part of that house, and a run of
three-plus solid tiles is masonry — so a crate does not throw a house's shadow
(it already has a contact shadow). The pass builds the silhouette in an
offscreen buffer, offsets it down-right, then punches the un-offset silhouette
back out with `destination-out` so a building never shadows itself; two offsets
give a near edge and a softer far one. Direction is FIXED down-right because
every tile in the game is lit from the upper left and a moving light would
fight the tileset; the LENGTH carries the hour instead, 5px at noon and 10 at
dawn. Off indoors, off underground, off at night (the grade already does that
work), and off with Path Edges. Costs 0.58ms of a 16.7ms frame.

**Shopfronts and street props.** Three things read wrong on screen. The
`porch` awning was laid on `fy + 1`, which is the STREET tile in front of the
door, so a row of shops had striped canvas lying in the road like mats; it hangs
on `gy` — the ground-floor wall row above the door, on the `over` plane — and
skips a tile that already holds a window or a sign. `building()` also placed
`SIGN` on the facade, but SIGN is a signpost whose post runs to the ground
(rows 8-15), so every shop had a post driven through its plaster. New tile
`SHOP_SIGN` (id 233, `over`, flags 0) is a board on an iron bracket, anchored
to the TOP of the tile with the bottom rows empty, so it hangs; SIGN stays what
it always was, a roadside signpost. Because it goes on `over` the wall tile
underneath survives, where `dset` used to replace it.
BARREL, CRATE and SACK were drawn as front elevations with flat tops, so at the
game's three-quarter angle they read as planks lying face-up. All three have a
top face now: the barrel an elliptical lit lid with hoops that drop a pixel at
the ends (which is what makes a cylinder read as round), the crate an inset
lighter lid over a braced front, the sack a tied neck with a lit shoulder and a
shaded turn. They now sit consistently with WELL and CART, which already read
as volumes.

**Every spell now does something, and the terrain kind is no longer dead.**
An audit of all 362 spells found 9 that did nothing anywhere — every one of
them a spell whose only effect was `kind:'terrain'`, which no layer consumed.
Five are battlefield zones and now live in the encounter: `enc.zones` holds
`{tag, tiles, mech, rounds}`, `_addZone` builds one from the effect, and the
engine asks it three questions — is this square difficult (`_isDifficult`),
solid (`_isSolid`), can you speak here (`zoneSilences`). Sight is the big one:
`lineOfSight` in actions.js now asks `ctx.zoneBlocksSight`, so Fog Cloud and
Darkness cut targeting, cover, advantage and the AI with one hook. Zones expire
on their duration, when concentration drops, and when the caster dies. Radii
authored for the open world are capped to a third of the arena — Plant Growth
is a hundred feet, which would otherwise cover the field and both armies.
combatui draws each zone in its spell's own authored colour.
The other four are world-scale (control-weather, guards-and-wards, move-earth,
mirage-arcane) and became field verbs; `terrainEncounterFactor(st, mapId)`
feeds `_encounterScale`, so Guards and Wards shuts a map to wandering monsters.

**Misty Step only reached 5 ft.** `rangeFeet('self')` is 0 and the option built
its targeting range from it, so a 2nd-level slot bought a one-square shuffle.
A self-ranged spell that MOVES you takes its reach from the teleport effect's
`distance` instead (the 99999 sentinel used by the travel spells is excluded,
since those target through their own numeric range).

**Feeblemind was a duplicate.** The 2024 PHB renames it Befuddlement, which the
game already had at the same level on the same four lists. The duplicate was
removed; Branding Smite was added, which fills a real hole in the smite ladder
(L1 x4, then nothing at L2, then L3/L4/L5). 363 spells, 0 that do nothing,
0 without a vfx style and colour.

**Animals do not speak Common.** Talking to a beast fell through the generic
NPC fallback, so 25 of the 39 animals in the game greeted you with the same
sentence about goblins on the Triboar Trail — in words. `BEAST_MOMENTS` and
`BEAST_VOICES` in data/tables.js are keyed by sprite: the first is what you
SEE (third person, no speech) and is the default; the second is what the animal
SAYS, and is reachable only while Speak with Animals is running. That spell
used to print a line and set no state at all; it now writes
`st.flags.speakBeasts = { until }`, which ui/dialogue.js reads through
fieldworld's `speakingWithAnimals()`. The 14 animals with authored scenes keep
them — the spell adds a spoken opening in front and leaves the authored nodes
untouched. Lines are chosen by a hash of the NPC id, so two geese in one town
differ: 39 animals now draw 32 distinct lines where they used to share one.

**Watch out for:** `package.json` is new and exists only so
`node --input-type=module` can import the game headlessly for testing. Nothing
installs from it and there is still no build step.

**Still open:** the southern quest chain is still unplayed end to end. Roamers
are not seeded on indoor maps, so Undermountain has none. Four Daggerford
interiors and about fifteen pack shops keep their authored single-room shapes.

## Session: action bar, character art, window scale

**Combat action bar auto-fits (src/ui/combatui.js).** `barLayout(n)` sizes the
plates to the verb count: ≤12 verbs get comfortable 26px buttons, 16 get 20px
ones, and everything stays on screen. Paging only survives past ~18 verbs, which
no unit has hit. Verified live on a 16-verb cleric — no `1/16` counter, the last
plate opens its submenu, the back chevron returns.

**Character art refresh (src/render/spritedata_chars.js).** The shared head now
tapers to a jaw and a chin with a 2px neck instead of ending in a brick; the face
gained brows, a 1px nose and a mouth. Shoulders slope — `insetRow()` in
`outfit()` applies the same slope to every outfit automatically, so new outfits
inherit it. Legs split a row higher and are cloth trousers over leather boots,
which stops the whole lower half being one brown mass. Every hair style's fringe
row was opened out so hairlines are no longer flat bowl cuts.

`spritelab.html` (dev-only, alongside dev.html/validate.html) renders variant
sheets at high zoom — `?cachebust#a|b|c|d` for builds / hair / outfits / helms.

**Window Scale now works (src/engine.js).** The setting shipped in
Settings > Display but nothing read it, so every window ran at the maximum
integer scale — 4x on a 1080p monitor, which is why the UI looked huge
fullscreen. `resize()` honours it and re-fits on `settings:changed`. Verified:
pinned 1 → 400px canvas, auto → 800px.

**Still open:** play the southern quest chain end to end (Daggerford → Baldur's
Gate) accepting and completing quests. Two commits remain unpushed in
isaiart: `ad42635`, `74a76bb`.

## Session: class dress and species features

**Class dress (actor.js `CLASS_DRESS`, spritedata_chars.js).** Unarmoured
characters used to collapse into three looks — robe, monastic wrap, or the same
brown tunic for the other nine classes. All twelve now have their own working
clothes: gambeson (fighter), jerkin with baldric (rogue), parti-coloured doublet
(bard), leather harness over cloth (ranger), stole vestments (cleric), rough
robe (druid), long coat (warlock), fur mantle over a bare chest (barbarian),
tabard over mail (paladin); wizard/sorcerer keep robes, monk keeps the wrap.
All nine are in `OUTFIT_STYLES` so character creation can pick them directly.
Armour still wins — `outfitFor` only falls through to class dress when the
armour slot is empty.

**Species features.** `data/species.js` had always declared `snout`, `scales`,
`tusks`, `markings`, `fur` and `height`, and the renderer read none of them — a
dragonborn was a human in horns, a half-orc was a broad human. New layers
`face-snout`, `face-scales`, `face-tusks`, `face-muzzle` and `face-markings`
draw over the face and under the hair. `speciesMods()` reads them from SPECIES
(lineage overriding species) rather than the saved appearance, so characters
rolled before these layers existed still grow their tusks.

**`body-stout`.** Dwarves were tall humans with beards. The head cannot move —
every helm, hair and horn layer is authored against rows 2-9 — so a dwarf reads
short by being thicker through the chest with the legs starting a row lower.
Dwarf `spriteMods.build` is now `'stout'`; `'stout'` is also a build option in
character creation.

`spritelab.html#class` / `#species` / `#zoom` renders these; `spritediff.html`
shows before/after against the pre-refresh art in `devart/`.

## Session: quick start and character-creation layout

**Quick start.** The wizard could always roll a whole character, but the button
lived on the Appearance step -- nine screens in -- which is exactly nine screens
past the player who wants it. `rowsSpecies()` now opens with an "In a hurry"
block: **Quick start** (`quickStart()` = `randomiseAll()` then `finish()`, so the
usual per-step validation still runs and lands you on any gap) and **Roll a
hero** (rolls, then leaves you in the wizard to tweak). `_firstSelectable()`
prefers the row marked `selected`, so the cursor still opens on the current
species rather than on the new buttons.

**Layout.** Confirmed by walking every step:
- The preview sprite is 24px at scale 2 = 48px, drawn into a 44px stage with
  its feet 4px up, so 8px of head was drawn ABOVE the frame every frame. Stage
  is 50px now, feet on the floor, and the stage clips. Paid for by tightening
  the identity lines above it by 1px each.
- Columns rebalanced 117/158/117 -> 137/138/117. The left column holds LISTS,
  which truncate badly ("Warden of_", "Starting g..."); the middle holds prose,
  which wraps and scrolls. Width went where truncation hurts.
- Labels that never fit, shortened rather than ellipsised: 'Ability Scores' ->
  'Abilities', 'Name & Identity' -> 'Identity', 'Auto-assign for class' ->
  'Auto-assign', 'Q BACK' -> 'BACK', 'Reroll the purse' -> 'Reroll purse',
  'Keep this character' -> 'Keep as is', summary buckets to four characters.
- The species list lost its darkvision/speed hint column entirely; both numbers
  are spelled out in THE NUMBERS on the doc panel.
- Preview: subclass shows ' (lv3)' not ' (planned)'; the weapon line shows the
  name without the damage type; the headline cells clamp their values; a long
  name drops from md to sm rather than ellipsising.

**Note on "make the text smaller":** it cannot get smaller. `sm` is the 5x7
bitmap at scale 1 and `md` is the same glyphs with a bold pass, so md->sm is
the only shrink available and it is worth exactly 1px per glyph. Anything
further is a section-size or wording problem, not a font-size one.

**Footer overflow (the real one).** The footer plate is FOOT_Y 218 + FOOT_H 20,
so its frame owns rows 218 and 237 and the inside is 219..236. The two text
lines sat at 222 and 231; a glyph is 7 rows tall (GLYPH_H), so the key line ran
231..237 -- onto the bottom frame -- and `shadow: true` paints an offset copy,
putting a row of it at 238, outside the plate. Lines are at 221 and 229 now.
It was vertical, not horizontal: every footer string already fits FOOT_LINE_W.

**Doc kv rows.** `kv()` gave the value 66% and the key whatever was left, so
once the middle column narrowed, "Resists  Necrotic, Radiant" printed as
"Resis... Necrotic, Rad..." -- both halves cut, and the cut label is the half
that says what the number is. The key now takes its natural width (capped at
half the column) and the value takes the remainder.

**Doc column line pitch (`DOC_LINE`, charcreate.js).** The glyphs cannot shrink
-- the font is a 5x7 bitmap at scale 1 and E/H/M/W/Z all paint column 5, so
`letterSpacing: 0` would fuse "HE" into one blob, and `md` is the same glyphs
with a bold pass. The PITCH was free, though: a glyph occupies rows 0..6 (row 6
only for descenders g j p q y), so 8px rows still leave a clear row between
lines where 9px left two. head/line/wrap/kv all key off `DOC_LINE` now -- about
an eighth more text in the same panel. The rest of the game still runs on 9px
rows (kit.js LINE_GAP is untouched); tightening those too is a one-constant
change if it ever reads well enough to want everywhere.

## Session: populating the world

**`src/data/npcs_extra.js` (new).** 60 entries — 38 people, 22 animals —
concatenated onto CAST in npcs.js exactly as SOUTH_CAST already is, so
`npcsOnMap()` sees them and the region packs' `reservedFor(mapId)` will not
paint scenery on top of them. Phandalin had fifteen souls and five ran shops;
the Trade Way had one person on it; a Baldur's Gate district had four. Now:
labourers, carters, porters, weavers, shepherds, trappers, drovers, fisherfolk,
clerks, bakers, tanners, dockhands, watchmen, minstrels, beggars and the staff
of Sharess's Caress. Every personal name is from the SETTING.md §5 tables.

**Voices without trees.** `dialogue.js _fallbackTree()` now reads the NPC's own
`greeting` (string or array), seeded on npc id + a 3-hour bucket so a person
keeps one line within a visit and may say something else later. `greeting` was
a field nothing read; before this every treeless NPC in the game recited the
same sentence about goblins on the Triboar Trail. Verified: five new NPCs each
return their own line and a greeting-less NPC still falls through to the
generic one.

**18 new NPC sprite families** (16 -> 34). Pure layer stacks over the class
outfits added earlier, so the art was already there: labourer, porter, fisher,
sailor, herder, hunter, scribe, scholar, acolyte, minstrel, festhall-f,
festhall-m, bouncer, beggar, watch, sellsword, goodwife, drover.

**9 new beasts** (5 -> 14): sheep, goat, pig, cow, goose, town-rat, crow, fox,
deer. Same 16x16 frame and BEAST_PAL tokens as dog/cat/chicken/horse/ox.

**Sprite-name collision, fixed.** The ambient rat was registered as `rat`, and
so is the bestiary's rat in spritedata_monsters.js — whichever module called
`defineSprite` last silently won, and nothing warned. The tame one is
`town-rat` now. **Anything added to spritedata_chars.js must not reuse a name
from spritedata_monsters.js; they share one registry.**

**`npccheck.html` (new dev page).** Loads every map and asserts each new NPC is
in bounds, not SOLID, not WATER and not standing on a warp/door/stairs. Caught
two NPCs placed in the Chionthar. Currently 60/60 clean. Re-run it after adding
anyone.

**Not done: more monsters.** The bestiary is already 258 entries and covers the
beasts these sprites imply — rat, giant-rat, swarm-of-rats, raven,
swarm-of-ravens, boar, giant-boar, wolf, dire-wolf, black/brown bear,
giant-elk, giant-goat, owlbear. Adding more would be near-duplicates.

## Session: class palettes

**`CLASS_PALETTE` (actor.js, exported).** The outfit grids already gave each
class its own cut, but the COLOURS still came from one generic eight-swatch
list, so a druid and a warlock could roll the same brown and an unarmoured
party read as one costume in twelve silhouettes. This is the same trick that
makes the NPC families look as distinct as they do: each is pinned to a
coherent palette. Two or three sets per class, so two clerics in a party are
not twins. `randomAppearance(species, r, { classId })` uses it when a class is
known and falls back to the old generic list when one is not — NPCs and
recruits that pass no classId are unaffected. charcreate `_randomiseLook()`
passes `d.classId`.

Verified: a rolled druid comes out in forest green over brown leather, warlock
near-black with a violet accent, cleric pale blue and silver, rogue charcoal
with oxblood, bard blue/pink/gold. Confirmed live in the creation preview.

`spritelab.html#classes` now shows one row per class with every palette it can
roll, front and profile.

## Session: class kits and boots

**Boots are a real layer now.** Footwear used to be painted into the body layer
itself — three rows of LEATHER at the bottom of every character, identical for a
barefoot monk and a knight in plate. `boots-*` draws over the body's legs and
under the outfit, so a long robe still falls over the top. Seven styles: none,
tall, cuffed, sandal, wraps, plate, court. `recolourLegs()` derives each style's
walk patches from the body's own LEGS_F/LEGS_S, so a boot swings with the leg it
is on instead of standing still while the leg moves.

**`CLASS_KIT` + the `'auto'` sentinel (actor.js).** The blocker last session was
that `appearance.helmStyle` defaulted to `'helm-none'`, which is also what a
player picks when they want a bare head — the two were the same value, so a
class default could not be applied without silently overriding a real choice.
`'auto'` means "the class decides"; `'helm-none'` now means what it says.
`styleOr()` resolves it for helm, cloak and boots.

Characters saved before this hold real style ids and keep exactly the look they
had. Boots are the deliberate exception: nothing ever stored a `bootStyle`, so
an old character reads as `'auto'` and gains the boots of their calling.

Armour still wins over everything: body armour of plate or half-plate forces
`boots-plate` whatever the class would otherwise wear.

Character creation exposes Cloak / Headgear / Boots, all reading "By Calling"
by default. Verified live: all twelve classes resolve the right helm/cloak/boot
stack, an explicit `helm-none` wizard still comes out bare-headed, a wizard in
half-plate gets sabatons, and a rolled goliath paladin previews in helm, long
cloak and armoured feet.

## Session: the overhaul (paused 23 Sep 2026)

A multi-agent visual / music / sandbox overhaul began on 22 Sep. The contract is
docs/OVERHAUL.md; where it stands, what is on which branch and how to resume is
docs/overhaul/STATUS.md; each role's notes are docs/overhaul/<role>.md. The repo
is now under git (branch main); deploy copies must exclude .git.
