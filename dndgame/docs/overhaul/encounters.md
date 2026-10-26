# encounters — the encounter director

Branch `overhaul/encounters` (r1, stopped by the usage limit) and
`overhaul/encounters-r2` (this run). Owner of `rules/encounters.js`,
`data/encounters.js`, `rules/scaling.js` and the overworld's encounter/roamer code.
New files of mine: `world/wayfarers.js` (the entities a situation is made of),
`ui/standoff.js` (the parley card), `ui/roadnotice.js` (the road's narration),
`tools/encsim.mjs` (headless journey simulation), `test/encounters-node.mjs`.

## The problem, as the user put it
"I hate the constant 0 lore ambushes." Before (main @ 0dfffc2):
- `_tickEncounter` counted down every step inside an `encounter-zone` (the Triboar
  Trail's covers 98x30 of its 100x40 tiles) and at zero dropped you into a fight:
  every 5-15 seconds of walking. No line, no who, no why.
- `_spawnRoamers` seeded 2-5 hostile packs per wild map that chased on sight and
  started the fight on contact. Also no who or why.
- A scripted trigger's own `group` (the Cragmaws by the dead horses) was ignored:
  the fight rolled the map's table instead. Fixed.

## What it is now
Encounters are SITUATIONS (data/encounters.js, 36 of them): who they are (a canon
group or creature), why they are here, what they want, where and when they appear
(map / biome / area, time of day, weather, level band), how they stand on the map
(camp, post, travel, patrol, hunt, scene), what can be done and what follows.

1. **Visible first.** Entering a wild map plans 2-4 groups (pacing) and
   `world/wayfarers.js` stands them on it: a Zhentarim chain across the road, a
   caravan walking from one exit to the other with its cart and ox, a Cragmaw band
   trudging a loop through the verges, a camp with tents, a fire that glows at night
   and a thread of smoke you see before the people. A name plate over the leader
   when you are near. Hostile bands leave SIGNS as you close on them (tracks, a
   hushed wolf, woodsmoke) in the road notice before you ever see them.
2. **Parley before steel.** Meeting a group opens `StandoffScene`: the title, the
   leader's name and title, why they are here, what they said, and the options this
   situation allows with their terms (DC, contest, price). Real 2024 checks: Influence
   (Persuasion DC max(15, Int), attitude gives Adv/Dis), Deception/Intimidation vs
   their Insight (Intimidation has Adv/Dis from the XP balance of the two sides),
   group Stealth vs their passive Perception (dark and weather lower it), flee as a
   group Athletics/Acrobatics check, Medicine to save the courier, Turn Undead (each
   kind of undead saves once), Survival to join a hunt, Arcana to see through the
   hag, Animal Handling for wolves and the owlbear. The d20 is shown (UI.diceRoll);
   Heroic Inspiration (from Tymora's cairn) rerolls a failure. Outcomes: fight, pass,
   rout, retreat, trade (inline shop), rumour, lead, quest, allies, grudge.
3. **Ambushes are rare and telegraphed.** When tension crosses its threshold, a share
   of dangers (by `wildEncounters`: off 0, rare .12, normal .25, frequent .45, times
   pacing) is an ambush: a telegraph line first, the band 6-12 steps later in the best
   cover around you, and a real Stealth-vs-passive-Perception contest decides it —
   you may spot them first (strike first, slip past, shadow them).
4. **Tension budget.** Rises per step (x1.45 at night, x0.6 on the road, faster where
   the map outlevels you, scaled by Pass Without Trace / Guards and Wards / a cleared
   region); a danger spends it and buys a grace period. Quiet beats (landmarks,
   weather, wildlife, a shrine, a snare line, a dropped purse) fill the gaps.
   `Save.settings.encounterPacing` 'calm' | 'normal' | 'perilous' (added to
   SETTING_SPEC, so Options lists it), `wildEncounters`, `roamingMonsters` respected.
5. **Remembered history** (`st.encounters`, lazy): cleared camps leave ashes for
   seven days; spared kin greet you differently (a "remind them" option); a grudge
   makes them hostile; a bandit captain you let go comes back with a job (the
   Zhentarim strongbox wagon, which the director then puts on the road); rescued
   merchants give you the friends' price; you paid once, they ask more next time.
6. **Every fight has a line.** Scripted triggers, dungeon tile encounters and the
   fallback roaming packs open on the same card (`packInstance`), with a line from
   `openerFor` (group, then faction, then creature type). A scripted story fight can
   be spotted and struck first but not talked out of. The battle log opens with it.

## Files and API
- `rules/encounters.js` — `encounterState(st)`, `contextFor(st, map, party, opts)`,
  `planMap`, `travelStep`, `arrival`, `springAmbush`, `standoffOptions`,
  `resolveOption` (pure) / `applyResult`, `afterBattle`, `foesFor`, `alliesFor`,
  `packInstance`, `openerFor`, `arrivalLine`, `eventsFor` / `setEventSource`,
  `journeyLog`, `hookQuests`.
- `world/wayfarers.js` — `placeGroup`, `placeGroupNear`, `placeAshes`, `Group`.
- `ui/standoff.js` — `StandoffScene(inst, { st, ctx, mode, entity, onDone, shopScene, beat })`.
- `ui/roadnotice.js` — `RoadNotice#push(text, { kind })`, drawn in overworld drawUI.
- Overworld: `_directorMap`, `_directorCtx`, `_populateWilds`, `_updateGroups`,
  `_directorStep`, `_openStandoff`, `_standoffDone`, `_fightGroup`,
  `_afterSituationFight`; `_pushBattle` takes `allies` (monster-kind party units)
  and `opener`.

## Hooks for other agents
- **World director**: call `setEventSource((st, mapId) => events)` or put events in
  `st.world.events`: `{ id, mapId | maps, situations: [ids to favour x3],
  spawn: [ids put on the road once], note }`.
- **Factions**: `st.world.regionControl[region]` = faction id, `{ faction, strength }`
  or `{ [faction]: 0..1 }` weights that faction's situations; `st.factions.standings`
  (or `st.reputation`) >= 10 makes a wary faction friendly, <= -10 hostile.
- **Deeds** reported: parley, bribe, persuade, lie, threaten, spare, kill, flee,
  rescue, charity, pray, theft, betray, bargain, surrender, gift, help, quest.
- **Menus**: `encounterPacing` is in SETTING_SPEC (group combat).

## Log
- r1: data, director core, scaling helpers, wayfarers (unwired).
- r2: audit (one bad item id), standoff scene, overworld wiring, encsim, trigger-flag
  fix (every trigger marks TF.TRIGGER, and an encounter zone covers the whole wild
  map, so "not on a trigger" meant "nowhere": now only real step triggers block),
  road notice, card layout, mountain / night situations (hill giant at the pass,
  monks from the monastery, travellers' fire with a real Short Rest), talked-past
  lines, repetition penalty, grass fights in dungeons open on the card too.

- r2, second landing: the deeps (Undermountain's floors get at most one group of
  people: Xanathar Guild collectors, another company out of the Yawning Portal),
  shadowing/asking a band finds its lair on the director's map (`discoverSite`),
  the director's events and balance of power (`activeEventsFor`, `regionControl`)
  steer who is on the road, the road's errands complete (`hookQuests` wired in the
  overworld), travellers call a greeting as you pass and people in need come to
  you, a new map announces itself with a beat within ~20-45 steps, scripted
  triggers fight their OWN group (`rollEncounter({ group })`), southern variety
  (Gauntlet riders, a hobgoblin column out of Dragonspear, an ankheg under the
  fields), backing away from a hostile beast is an Animal Handling check, a wary
  band you squared with knows your face for four days, a week of meeting the same
  people makes them rarer.

## Verification (r2)
- `node tools/encsim.mjs --minutes 60` (real maps, real party, the real director
  and groups; battles assumed won 90%): 54-63 meetings an hour, of which fights
  5-13%; 19-25 different situations; 30-40 quiet beats; 1-3 telegraphed ambushes;
  rumours, leads, road quests. `--pacing calm` (30 min): 22 meetings, 1 fight.
  `--pacing perilous --persona bold` (30 min): 19 meetings, 6 fights.
- `node test/encounters-node.mjs`: an old save with no `st.encounters` loads and
  the director starts lazily; tension, rumours, plans and settled groups survive a
  JSON round trip; state stays ~3 KB; the courier's errand starts, is not repeated,
  and pays on delivery.
- Browser (`tools/shot.mjs --script`): probes of a camp by day and night, the
  toll post, a parley card, a roll, a road beat card, a sprung ambush, a caravan
  on the road, the road notice, and a real keyboard-driven walk of the Triboar
  Trail (arrow keys + E through the game's own update loop). Zero console errors,
  zero draw failures. Regress suite 28/28.

### A real walk down the Triboar Trail (browser, keys only)
```
08:04  arrive: Pilgrims of the Morninglord (travel), Merchant Caravan (travel), Travelling Peddler (travel)
08:24  [arrival] Pilgrims of the Morninglord: "Dawn's blessing on you, travellers! We walk to the
       Spires of the Morning in Waterdeep. Will you share the road a while, or a prayer?"
08:28  STANDOFF Pilgrims of the Morninglord [noticed] Greengrass: the first day of spring. Flowers on
       every sill... / They are walking to the Spires of the Morning in Waterdeep to greet the
       Morninglord's sunrise, and singing badly as they go.
08:32    > Talk: Sister Jhessail has led this pilgrimage for years... / The shrine-keepers say the dead
         have been restless on the Fields this year.
09:14    > Kneel with them for the dawn prayer: ...Each of you gains 3 temporary hit points.
09:38  [beat] Old cart ruts, deep as a boot, run straight as a rule toward Triboar.
09:38  STANDOFF Cragmaw Trail Ambush [noticed] Goblins burst from the thickets by the dead horses —
       Cragmaws, who have been waiting for whoever came looking for that cargo.
09:50  BATTLE: Goblins burst from the thickets by the dead horses — ... / Battle begins: ...
10:17  [arrival] Merchant Caravan: "Ho there! Mind the ox, she bites..."
10:25    > Talk: Randal has come up from Neverwinter... / The Zhentarim have a toll chain out on the
         roads now. Pay it and they're sweet as honey. Don't, and they remember your face.
10:49  STANDOFF Travelling Peddler ... Heard there's a banshee at Conyberry who'll answer a question
       if you bring her something pretty.
11:41  reached the east end
```

### From the 60-minute journey (tools/encsim.mjs, seed ashford-road)
```
=== Day 121, 22:39 — Wave Echo Cave (hills, night, clear) ===
Day 121, 22:39 — Somewhere ahead a wolf yips — and something small hisses at it to shut up.
Day 121, 22:53 — Dwarf Prospectors: "Moradin's beard, company! Sit, sit. You don't happen to know
                 the way to a lost mine?"
Day 122, 00:02 — A traveller's cairn stands at the roadside with a copper on top of it for Tymora.
      The coin clinks onto the cairn... Heroic Inspiration: you may reroll one failed check.
=== Day 122, 02:29 — The Triboar Trail (road, night, clear) ===
Day 122, 03:00 — The Triboar Trail. They come to you.
  Refugees on the Road: Taman Lackman, a burned-out farmer (friendly)
    Orcs of Many-Arrows came down out of the north and burned their steading.
  > Give them coin for the road
      The war band camped in the ruins at Conyberry when they were done with us.
      * Lead: Refugees say the Many-Arrows war band camps in the ruins.
...
  Zhentarim Strongbox Wagon: Lureene Tallstag, a Wolf of the Black Network (wary)
    Lureene squints at you. "The ones who let us go, on the road. We remember."
  > Remind them you let them go once [Persuasion: 20 + 0 = 20 vs DC 10 — success]
Day 124, 10:35 — The Triboar Trail. They come to you.
  Orc Camp: Ovak, the war band's chief (hostile)      <- the refugees' lead, a day later
  > Challenge their champion
  ! Battle: Ovak. Won.
      * Your champion stands; theirs does not. The war band lets you pass.
...
Day 126, 13:58 — Hoofprints, shod, many of them — riders waited here not long ago, and then moved
                 into the trees.
Day 126, 14:05 — The Trade Way — Fields Reach. They step out of cover.
  Highwaymen: Stor Stormwind, the band's captain (hostile)
  > Talk them out of it: Persuasion 4 vs DC 15 — Heroic Inspiration, again...
  > Talk them out of it [Persuasion: 10 + 0 = 10 vs DC 15 — failure]
  ! Battle: Bandit x5, Stor Stormwind. Won.
=== the tally ===
meetings 54, of which fights 5 (9%)
groups placed 136, arrivals 5, quiet beats 38, telegraphed ambushes 3
situations met 24
```

## Rules learned the hard way
- Don't test "is a trigger here" with `TF.TRIGGER`: an encounter zone sets it on
  nearly every tile of a wild map. Ask `map.triggersAt(x, y)` for the kinds you mean.
- Toasts are one line of 176px; the road's sentences need `RoadNotice`.
- `Party.clear()` empties the purse and the pack too.
