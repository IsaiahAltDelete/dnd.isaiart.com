# director — the world director (never-ending adventure)

Branches `overhaul/director` (first attempt, stopped by the usage limit after
the logic modules) and `overhaul/director-r2` (this one: fixes, the in-game
glue, playtests, landing). Owns `rules/worlddirector.js`, `data/rumors.js`,
the generator half of `data/quests.js`, and the new files listed below.

## What was there before

- `generateQuest` / `generateContractBoard` in data/quests.js built endless
  faction contracts, but **nothing in the game ever called them**. Several
  `QUEST_LOCATIONS` point at maps no warp reaches.
- `progressQuests` only ever hears `kill`, `collect`, `reach` and `talk`.
  Completion only happened through an authored dialogue `complete:`.
- Rumours: one flat table in data/tables.js, one rotating line in dialogue.
  No events, no calendar festivals, no history.
- Canon sites (Cragmaw Hideout, Thundertree, Old Owl Well, Wyvern Tor, Icespire
  Peak, Cragmaw Castle, the Mere, Kryptgarden, Ardeep, Leilon) build as maps,
  but no warp leads to any of them.

## Files

| file | role |
|---|---|
| `data/worldevents.js` | event templates (causes, stages, outcomes, follow-on events), the Harptos festival calendar, regions + starting control, market days, discoverable sites, quest places |
| `data/rumors.js` | rumour families per event stage (true / exaggerated / false), per deed kind, per site, per faction move, trade; who knows what by NPC role (`KNOWLEDGE`); Insight readings |
| `rules/worlddirector.js` | the daily simulation, rumours, postings, the generated-quest lifecycle, sites/lairs, chronicle, contracts below. Pure logic, Node-testable |
| `data/quests.js` | `generateQuest(level, rng, opts?)` keeps its signature; `opts.kind` builds a directed quest (retrieve, escort, investigate, clear, cull, deliver, rescue, negotiate, hunt, bounty) with ordered phases and a `site` description |
| `data/items_director.js` | the quest props (strongbox, parcel, letters, feverfew...) |
| `ui/topics.js` | registry of conversation topics any module can add to every NPC's opening menu |
| `ui/worldtalk.js` | the director's topics: news, work, report / give up, negotiation |
| `world/sites.js` | on MAP_ENTER (and whenever the story moves) stages what `spawnsFor` wants: quest packs, captives, clues, caches, event raiders, visitors, trails to known sites, lairs + hoards, the way out, the notice board |
| `ui/noticeboard.js` | a town's notice board (postings + proclamations), drawn with UI.* |
| `tools/director-sim.mjs` | headless N-day simulation (the acceptance test); `--play` plays the offered quests through `progressQuests` |

### Hooks in files I do not own (all small)
- `state.js` `progressQuests`: a quest whose def says `ordered` only advances
  steps in its current `phase` (+ exported `currentPhase`). Hand-written
  quests are untouched.
- `ui/dialogue.js` (menus agent): `_buildChoices` appends `topicsFor(ctx)` on
  the opening node(s), beside "Draw your weapon."; `_pick` plays a topic
  (`_openTopic`, which merges the topic's nodes and adds a `topic:back` menu
  node); `_runDo` gained `call: fn(ctx)` for runtime trees.
- `main.js`: `installDirector(() => Game.state, { grantXp: awardPartyXp })`,
  `installWorldTalk()`, `installSites()`, `installNoticeBoard()` in `wireGlue`.
- `ui/menus.js` (menus agent): Journal > Lore shows `chronicleEntries(st)` first;
  Done/Failed tabs read a generated quest's title from `st.world.quests[id].title`.
- `data/items.js`: spreads `DIRECTOR_ITEMS` into `ITEMS`.

## State (all under `st.world`, created lazily by `worldState(st)`; old saves load)
`director {v, day, seq, level, levelOverride}`, `events[]`, `eventLog[]`,
`ended[]`, `history{}`, `seen{}`, `pending[]`, `effects[]`, `control{}`,
`controlLog[]`, `gossip[]`, `heard{}`, `postings{}`, `quests{}` (per quest:
event, giver, day, exclusive, title), `sites{}` (found, gen, occupant,
clearedDay, renewDay, tx/ty = where the party comes back out, beside the trail sign), `visitors[]`,
`chronicle[]`. `st.world.deeds` stays deeds.js's. Heard rumours are also
pushed to `st.rumors` (the journal lists it). Staged packs mark
`st.defeated[key] = true` like the roamers do.

A save from before this module has no `st.world`: the first
`advanceDirector` opens the world on the save's current day (verified below).

## Contracts for the other world agents

```js
import * as D from '../rules/worlddirector.js';
D.activeEventsFor(st, mapId)   // -> [{ id, tpl, name, kind, tags, stage, stageName, text, since, until,
                               //       severity, dark, festival, reason,
                               //       encounters: { groups:[[groupId, weight]], rate, biomes } | null }]
                               //    `reason` is a ready sentence for "why is this fight happening".
                               //    Market days appear as kind 'market' with encounters null.
D.eventPriceModifiers(st, mapId) // -> { mult:{ category: factor, '*'?: factor }, notes:[{ text, cats, src }], town }
D.eventPriceFactor(st, mapId, cats) // -> one multiplier for an item with these categories (clamped 0.4..3)
                               //    categories used: food grain drink livestock wool cloth fine ore gem timber
                               //    tool gear weapon armor potion medicine holy poison, and '*' for everything
D.regionControl(st, regionId)  // -> { id, name, holder, holderName, sway:{ power: n } }
D.regionOf(mapId), D.townOf(mapId)
D.festivalOn(st | day)         // -> { id, name, stage } | null
D.rumorsFor(st, npc, { count }) // -> [{ key, kind, truth:'true'|'exaggerated'|'false', text, points:{ site?, event?, quest?, giver? }, liar }]
D.hearRumor(st, npc, rumor)    // remember it; a true one discovers the site it points at -> { discovered?, lead? }
D.chronicle(st, { limit, kind:'world'|'party' }) // -> [{ day, date, kind, text, quest?, event?, site?, deed? }] newest first
D.chronicleEntries(st)         // -> [{ kind:'lore', id:'director-chronicle', label, body, tag }] for the journal
D.postingsFor(st, npcId), D.boardPostings(st, town), D.boardNotices(st, town)
D.acceptQuest(st, questId), D.reportsFor(st, npcId), D.makeReport(st, questId, npcId), D.abandonQuest(st, questId)
D.spawnsFor(st, mapId)         // plain specs; world/sites.js turns them into entities
D.discoverSite(st, siteId, how), D.isSiteKnown(st, siteId), D.lairFor(st, mapId), D.lairCleared(st, siteId)
```
Topics (for npclife / companions / factions who want lines in every conversation):
```js
import { registerTopic } from '../ui/topics.js';
registerTopic('factions:join', { order: 40, label: 'About your company…', when: (ctx) => ..., run: (ctx) => ({ start, nodes }) });
// ctx = { st, npcId, npc, record, back, dialogue }; choices `goto: ctx.back` return to the menu; `do: { call: fn }` runs fn(ctx)
```
The director LISTENS on deeds.js (`onDeed`) and REPORTS `accept`, `quest`,
`questFail`, `discover`, `help`, `persuade/threaten/lie/bribe`, `kill` (lairs).

## How it plays
- Every conversation with a person carries "What's the news?" (2-3 rumours
  this person would know, by map, role and faction; some false or
  exaggerated; Insight DC 12 reads the teller), and, where it applies, "Any
  work going? (n)", "About that work…" (report, hand over, or give a job up),
  and "About <giver>…" for the other side of a negotiation (Persuasion,
  Intimidation, Deception each tried once, or pay).
- A true rumour about a place marks the way there; the trail sign appears on
  the host map, and a passive Survival as good as the site's DC finds it
  unprompted. Inside, a sign by the entrance is the way back.
- Each town has a notice board: postings (seal = the trouble of the day) that
  can be taken straight off it, and proclamations (running events, market
  day, who holds the town).
- Quests stage their quarry, captive, clue, cache or counterpart on the real
  map; beating a staged pack completes the fight step however many ran.
- The world moves on by day whether or not the party acts; an ignored event
  ends the other way (prices, control, follow-on events).
- Walking INTO a staged pack is a fight; walking UP to one that talks (a
  humanoid or giant with a language) and pressing Talk is a parley: Persuasion
  or Intimidation against DC 15 or its Intelligence (the 2024 Influence rule),
  or pay it to leave. A failed word is a fight. Deeds: persuade / threaten /
  bribe, tagged `spared`.
- Troubles bring people to town while they run (the caravan master, the
  burned-out steader, the feverish miner, a herald in Waterdeep).
- News near the party (its region or town, or anything grave) reaches it as a
  log line and at most two toasts a day (`announceNews`).

## How to extend
- **A new event**: add an `ev(...)` to `EVENTS` in data/worldevents.js —
  stages (text, notice, prices, encounters, packs, visitors), quests posted at
  a stage (a `generateQuest` opts spec; tokens from `vars` are filled),
  outcomes (text, prices+days, control shifts, flags, `next` follow-on events).
  Parallel `vars` lists of one length share a pick. Add its rumour family to
  `EVENT_RUMORS` in data/rumors.js (true / exaggerated / false per stage).
- **A new site**: `site(...)` in `SITES` (host map, trail text, found text,
  DC for passive Survival, occupants by level band; the first occupant is the
  canon tenant). It gets a trail sign, a way out, a lair and a hoard for free.
- **A new topic** in every conversation: `registerTopic` (ui/topics.js).
- **Rules learned the hard way**: a spec's `group: '{group}'` must be filled
  from the event's vars before lookup; a lair must not stand beside the
  quest pack sent to the same site (the wrong fight gets fought); contact
  (`takeBattle`) and the player's own approach (`interact`) must be told apart
  or every roamer becomes a parley; an entity dropped on a solid sign traps the
  party, so arrivals go beside it.

## Status
- [x] data/worldevents.js, data/rumors.js (first attempt)
- [x] director core + contracts (first attempt; r2 fixed a crash in deed gossip, unfilled `{group}` tokens, parallel var lists, repetition)
- [x] quest generator + lifecycle + ordered steps
- [x] headless 60-day sim (`tools/director-sim.mjs --play`: 30/30 quests completed)
- [x] topics, notice board, sites glue, hooks (r2)
- [x] parley, event visitors, daily news, canon first tenants, thieves hold stolen goods (r2)
- [x] browser playtests (two scripted runs), save/load (incl. a save with no `st.world`), regress green
- [x] landed (increments at 45754ee, 170b013, and after)
- [ ] later, if wanted: Undermountain's floors re-seeded by an "era" (Halaster's whims) — needs a
  seed hook in overworld `buildMap`, not done to stay out of that file; the journal could show a
  director quest's deadline; st.world.control could be mirrored into st.world.regionControl for
  rules/encounters.js once the factions agent settles that key.

## Acceptance: 60 in-game days, headless

`$NODE tools/director-sim.mjs` (seed `sim`, party level ramps 1 -> 9, nobody intervening: every event runs to its "ignored" end and its consequences), then `--play` (the party takes the top offer every second day and plays it through `progressQuests`). Deterministic; re-run any time.

```text
## The event log (every event, how it began, each stage, how it ended)
- 1 Mirtul, 1496 DR — START Greengrass
- 1 Mirtul, 1496 DR —   Greengrass -> stage:day
- 1 Mirtul, 1496 DR — START A Caravan Missing on the Triboar Trail
- 1 Mirtul, 1496 DR —   A Caravan Missing on the Triboar Trail -> stage:overdue
- 2 Mirtul, 1496 DR —   Greengrass -> stage:after
- 2 Mirtul, 1496 DR — START Trouble at the Claims
- 2 Mirtul, 1496 DR —   Trouble at the Claims -> stage:abandoned
- 3 Mirtul, 1496 DR — END (kept) Greengrass: 
- 3 Mirtul, 1496 DR —   A Caravan Missing on the Triboar Trail -> stage:missing
- 5 Mirtul, 1496 DR —   Trouble at the Claims -> stage:bought
- 8 Mirtul, 1496 DR — END (ignored) Trouble at the Claims: The Miner's Exchange bought up the abandoned claims above Wave Echo Cave. Every pick in those hills now works for Halia Thornton.
- 9 Mirtul, 1496 DR — END (ignored) A Caravan Missing on the Triboar Trail: Olga Greycastle's wagons were never found. Phandalin went short of picks and blasting powder for the claims, and the Trail got a worse name than it had.
- 10 Mirtul, 1496 DR — START Goblins on the Phandalin Road
- 10 Mirtul, 1496 DR —   Goblins on the Phandalin Road -> stage:sign
- 11 Mirtul, 1496 DR — START Blights in the Orchard
- 11 Mirtul, 1496 DR —   Blights in the Orchard -> stage:creeping
- 12 Mirtul, 1496 DR —   Goblins on the Phandalin Road -> stage:raids
- 14 Mirtul, 1496 DR — END (ignored) Blights in the Orchard: Blights stripped a third of Edermath Orchard. Cider will be scarce in Phandalin this year.
- 14 Mirtul, 1496 DR — START Fever in the Miners' Camp
- 14 Mirtul, 1496 DR —   Fever in the Miners' Camp -> stage:cases
- 16 Mirtul, 1496 DR — END (ignored) Goblins on the Phandalin Road: The goblins fired the barn at the Alderleaf farm and carried off the flock. Mutton is dear in Phandalin.
- 16 Mirtul, 1496 DR —   Fever in the Miners' Camp -> stage:spread
- 20 Mirtul, 1496 DR — END (ignored) Fever in the Miners' Camp: The cackle fever ran its course and took three of the miners. The claims above town stood idle for a tenday.
- 20 Mirtul, 1496 DR — START A Bounty Posted
- 20 Mirtul, 1496 DR —   A Bounty Posted -> stage:posted
- 24 Mirtul, 1496 DR — START Barthen and the Lionshield
- 24 Mirtul, 1496 DR —   Barthen and the Lionshield -> stage:undercutting
- 27 Mirtul, 1496 DR — START Orcs at Wyvern Tor
- 27 Mirtul, 1496 DR —   Orcs at Wyvern Tor -> stage:camp
- 28 Mirtul, 1496 DR — END (ignored) A Bounty Posted: The bounty on Blath of the Long Knife lapsed. Blath of the Long Knife was seen drinking in Leilon, paying in other people's coin.
- 28 Mirtul, 1496 DR — START A White Dragon over Icespire Peak
- 28 Mirtul, 1496 DR —   A White Dragon over Icespire Peak -> stage:sighting
- 29 Mirtul, 1496 DR — END (ignored) Barthen and the Lionshield: Barthen and the Lionshield ran their price war until both were nearly broke, then quietly stopped. Neither will say the other's name.
- 1 Kythorn, 1496 DR —   A White Dragon over Icespire Peak -> stage:hunting
- 2 Kythorn, 1496 DR — START The Grey Wolf of Neverwinter Wood
- 2 Kythorn, 1496 DR —   The Grey Wolf of Neverwinter Wood -> stage:howling
- 4 Kythorn, 1496 DR —   The Grey Wolf of Neverwinter Wood -> stage:taking
- 5 Kythorn, 1496 DR — END (ignored) Orcs at Wyvern Tor: The orcs at Wyvern Tor drifted north with a herd that was not theirs.
- 6 Kythorn, 1496 DR — START A Wedding in Waterdeep
- 6 Kythorn, 1496 DR —   A Wedding in Waterdeep -> stage:betrothal
- 7 Kythorn, 1496 DR — END (ignored) A White Dragon over Icespire Peak: Cryovain went back to Icespire Peak fat on mutton. The herders will not go up again this year.
- 8 Kythorn, 1496 DR — START A Caravan Missing on the Triboar Trail
- 8 Kythorn, 1496 DR —   A Caravan Missing on the Triboar Trail -> stage:overdue
- 9 Kythorn, 1496 DR — END (ignored) The Grey Wolf of Neverwinter Wood: The wolf pack out of Neverwinter Wood took half the Alderleaf flock before it moved on.
- 9 Kythorn, 1496 DR —   A Wedding in Waterdeep -> stage:preparations
- 10 Kythorn, 1496 DR —   A Caravan Missing on the Triboar Trail -> stage:missing
- 11 Kythorn, 1496 DR — START An Ogre's Toll
- 11 Kythorn, 1496 DR —   An Ogre's Toll -> stage:toll
- 13 Kythorn, 1496 DR —   A Wedding in Waterdeep -> stage:wedding
- 13 Kythorn, 1496 DR — START A Bounty Posted
- 13 Kythorn, 1496 DR —   A Bounty Posted -> stage:posted
- 14 Kythorn, 1496 DR — END (ignored) A Wedding in Waterdeep: Jhessail of House Nesher married Helm of House Irlingstar. The Sea Ward talked of nothing else for a tenday.
- 16 Kythorn, 1496 DR — END (ignored) A Caravan Missing on the Triboar Trail: Arveene Tallstag's wagons were never found. Phandalin went short of picks and blasting powder for the claims, and the Trail got a worse name than it had.
- 16 Kythorn, 1496 DR — START Lights in the Mere of Dead Men
- 16 Kythorn, 1496 DR —   Lights in the Mere of Dead Men -> stage:lights
- 17 Kythorn, 1496 DR — START Webs in Kryptgarden
- 17 Kythorn, 1496 DR —   Webs in Kryptgarden -> stage:webs
- 19 Kythorn, 1496 DR — END (ignored) An Ogre's Toll: The ogre on the Trade Way grew rich and lazy on its toll. The caravans price it in now.
- 20 Kythorn, 1496 DR —   Lights in the Mere of Dead Men -> stage:vanishings
- 21 Kythorn, 1496 DR — START Players from Waterdeep
- 21 Kythorn, 1496 DR —   Players from Waterdeep -> stage:arrival
- 23 Kythorn, 1496 DR — END (ignored) Webs in Kryptgarden: The webs in Kryptgarden have spread to the edge of the Triboar Trail. Furs are dear in Phandalin.
- 23 Kythorn, 1496 DR —   Players from Waterdeep -> stage:playing
- 23 Kythorn, 1496 DR — START Highwaymen on the Trade Way
- 23 Kythorn, 1496 DR —   Highwaymen on the Trade Way -> stage:posted
- 24 Kythorn, 1496 DR — END (ignored) A Bounty Posted: The bounty on Randal of the Long Knife lapsed. Randal of the Long Knife was seen drinking in Leilon, paying in other people's coin.
- 26 Kythorn, 1496 DR —   Lights in the Mere of Dead Men -> stage:rite
- 26 Kythorn, 1496 DR — END (ignored) Players from Waterdeep: the Yawning Portal Players played their last night of The Siege of Neverwinter to a crowd that stood on the tables, and took the Triboar Trail east in the morning.
- 26 Kythorn, 1496 DR — START Fever in the Miners' Camp
- 26 Kythorn, 1496 DR —   Fever in the Miners' Camp -> stage:cases
- 28 Kythorn, 1496 DR —   Fever in the Miners' Camp -> stage:spread
- 1 Flamerule, 1496 DR — END (ignored) Lights in the Mere of Dead Men: The rite in the Mere of Dead Men was finished. Something black and winged has been seen over Castle Naerytar.
- 1 Flamerule, 1496 DR — END (ignored) Highwaymen on the Trade Way: Morn the Smiler still takes a toll on the Trade Way, and the caravans pay it.

## Day 20 — 21 Mirtul, 1496 DR (party level 3)
Running: A Bounty Posted [posted]
Control: phandalin=redbrands, triboar-trail=cragmaw, neverwinter-wood=emerald-enclave, neverwinter=lords-alliance, waterdeep=lords-alliance, trade-way=lords-alliance, coast-way=flaming-fist, baldurs-gate=flaming-fist

### Rumours in phandalin
- Toblen Stonehill (innkeep): "I had it from a man who was there: The Mere of Dead Men is ten thousand drowned soldiers, and they all still hold their swords." [site/exaggerated]
- Toblen Stonehill (innkeep): "I had it from my cousin: Wyvern Tor is south of Phandalin, down by the Wave Echo hills." [site/false]
- Toblen Stonehill (innkeep): "It's all over town: The cackle fever ran its course and took three of the miners. The claims above town stood idle for a tenday." [event/true]
- Elmar Barthen (shopkeeper): "Halia Thornton runs the Miner's Exchange. The Exchange runs a fair bit more than ore." [static/true, leads to work]
- Elmar Barthen (shopkeeper): "Mosk lost his good pick down a shaft and will not go back for it. He will not say why he will not go back for it." [static/true, leads to work]
- Sister Garaele (priest): "Word is a caravan is forming up for Triboar and they are short of swords. Two days east, no shade, and bandits at the ford." [static/true, leads to work]
- Sister Garaele (priest): "You'll have heard? The cackle fever ran its course and took three of the miners. The claims above town stood idle for a tenday." [event/true]
- Harbin Wester (questgiver): "The Townmaster has put a price on Blath of the Long Knife. Robbed three wagons on the Trail and killed a carter." [event/true, leads to work]
- Harbin Wester (questgiver): "I had it from a man who was there: Leilon is haunted by every wizard the Spellplague ever killed." [site/exaggerated]

### Rumours in neverwinter
- General Sabine (questgiver): "Word is the Cragmaw goblins have a cave off the Triboar Trail, up a stream where it comes out of the thickets. Follow the water." [site/true, points to cragmaw-hideout]
- General Sabine (questgiver): "Blights stripped a third of Edermath Orchard. Cider will be scarce in Phandalin this year." [event/true]
- Esvele Dundragon (shopkeeper): "You won't believe it, but you could buy a horse for what rope and lamp oil costs in Neverwinter this tenday." [trade/exaggerated]
- Esvele Dundragon (shopkeeper): "A carter told me steel is dear in Neverwinter just now — Olga Greycastle's wagons were never found. Phandalin went short of picks and blasting powder for the claims, and the Trail got a worse name than it had." [trade/true]

### Rumours in waterdeep
- Durnan (innkeep): "Word is the High Road runs on south out of Neverwinter to Leilon, where they are still rebuilding what the Spellplague broke." [site/true, points to leilon]
- Durnan (innkeep): "East past Conyberry there is a crag called Wyvern Tor. The drovers' track climbs right up to it." [site/true, points to wyvern-tor]
- Durnan (innkeep): "You won't believe it, but the Lords' Alliance decide who eats in Waterdeep." [faction/exaggerated]
- Volothamp Geddarm (questgiver): "You'll have heard? Blights stripped a third of Edermath Orchard. Cider will be scarce in Phandalin this year." [event/true]
- Volothamp Geddarm (questgiver): "A carter told me in Waterdeep, you ask the Lords' Alliance before you ask anyone else." [faction/true]
- Mirt (questgiver): "South of Neverwinter a drowned causeway leaves the High Road and runs out into the Mere of Dead Men." [site/true, points to mere-of-dead-men]
- Mirt (questgiver): "Word is there is a Netherese watchtower north of the Triboar Trail — Old Owl Well. A road-stone by the verge still points to it." [site/true, points to old-owl-well]

### Rumours in daggerford
- Morwen Daggerford (noble): "In the Trade Way, you ask the Lords' Alliance before you ask anyone else." [faction/true]
- Morwen Daggerford (noble): "A carter told me the Cragmaw goblins have a cave off the Triboar Trail, up a stream where it comes out of the thickets. Follow the water." [site/true, points to cragmaw-hideout]
- Filarion Filvendorson (innkeep): "Mark my words: Wyvern Tor is south of Phandalin, down by the Wave Echo hills." [site/false]
- Filarion Filvendorson (innkeep): "The High Road runs on south out of Neverwinter to Leilon, where they are still rebuilding what the Spellplague broke." [site/true, points to leilon]
- Filarion Filvendorson (innkeep): "Blights stripped a third of Edermath Orchard. Cider will be scarce in Phandalin this year." [event/true]
- Derval Ironeater (smith): "You won't believe it, but the Lords' Alliance decide who eats in the Trade Way." [faction/exaggerated]

## Ten quests the world generated

**Back to the Diggings** — clear, from Harbin Wester (for event ev-3), posted 2 Mirtul, 1496 DR
  Something has driven the miners off their claims in the hills above Wave Echo Cave — a nest of giant spiders, the ones who came back say. Harbin Wester wants the claims working before the Miner's Exchange buys them all for nothing.
  Steps: [p0] Travel in the hills above Wave Echo Cave / [p1] Break the Giant Wolf Spiders in the hills above Wave Echo Cave / [p2] Return to Harbin Wester
  Pays: 25 gp, 100 XP, potion-healing; standing lords-alliance +4, zhentarim -2
  At the hills above Wave Echo Cave: 1x wolf-spider

**Held in the cellars under Tresendar Manor** — rescue, from Harbin Wester, posted 2 Mirtul, 1496 DR
  The Stirges in the cellars under Tresendar Manor are holding Stor Brightwood. Nobody has offered a ransom and nobody means to pay one. Harbin Wester would rather pay you.
  Steps: [p0] Travel in the cellars under Tresendar Manor / [p1] Deal with the Stirge Roost holding Stor Brightwood / [p2] Free Stor Brightwood / [p3] Return to Harbin Wester
  Pays: 25 gp, 100 XP, potion-healing; standing lords-alliance +4, zhentarim -2
  At the Tresendar cellars: 3x stirge

**The Iron Strongbox** — retrieve, from Toblen Stonehill, posted 2 Mirtul, 1496 DR
  Toblen Stonehill lost the Iron Strongbox in Neverwinter Wood to the Goblins, and would pay well to have it back. Nobody needs to explain to anyone how it got there.
  Steps: [p0] Travel in Neverwinter Wood / [p1] Deal with the Goblins holding it / [p1] Recover the Iron Strongbox / [p2] Bring the Iron Strongbox to Toblen Stonehill
  Pays: 20 gp, 80 XP
  At Neverwinter Wood: 2x goblin

**A Quiet Look on the Triboar Trail** — investigate, from Sister Garaele, posted 2 Mirtul, 1496 DR
  The Harpers want someone unremarkable to go on the Triboar Trail, look, and come back able to describe it. No banners, no bodies left in the road.
  Steps: [p0] Travel on the Triboar Trail / [p1] Search on the Triboar Trail for what happened / [p2] Return to Sister Garaele
  Pays: 15 gp, 80 XP, potion-healing; standing harpers +3, zhentarim -1

**Ash Zombies in the cellars under Tresendar Manor** — cull, from Daran Edermath, posted 2 Mirtul, 1496 DR
  The Ash Zombies in the cellars under Tresendar Manor have grown bold enough to take a traveller. Daran Edermath pays by the head.
  Steps: [p0] Travel in the cellars under Tresendar Manor / [p1] Kill 2 Ash Zombies in the cellars under Tresendar Manor / [p2] Return to Daran Edermath
  Pays: 20 gp, 90 XP, potion-healing; standing gauntlet +3, zhentarim -1
  At the Tresendar cellars: 2x ash-zombie

**Wagons to Phandalin** — escort, from Esvele Dundragon, posted 2 Mirtul, 1496 DR
  Esvele Dundragon is sending wagons on the Triboar Trail and on to Phandalin, and the drivers want blades riding with them. There has been trouble on that road, and it has a way of knowing when the wagons leave.
  Steps: [p0] Ride out with the wagons on the Triboar Trail / [p1] Beat off the Bandits that come for the wagons / [p2] See the wagons safely into Phandalin / [p3] Hand the wagons over to Elmar Barthen
  Pays: 20 gp, 90 XP
  At the Triboar Trail: 3x bandit

**Carried to Phandalin** — deliver, from Durnan, posted 2 Mirtul, 1496 DR
  Something small and valuable needs to be in Phandalin by the next market. Durnan will pay you to be the one carrying it, and pay Sister Garaele the rest on arrival.
  Steps: [p0] Carry it to Phandalin / [p1] Deliver the Wrapped Parcel to Sister Garaele
  Pays: 10 gp, 50 XP

**Wanted: Grim the Red** — bounty, from Daran Edermath, posted 11 Mirtul, 1496 DR
  Grim the Red and a gang of Bandits have been robbing travellers in the cellars under Tresendar Manor. Daran Edermath pays on proof, and does not ask whether Grim the Red came quietly.
  Steps: [p0] Travel in the cellars under Tresendar Manor / [p1] Take Grim the Red, dead or alive / [p2] Return to Daran Edermath
  Pays: 60 gp, 280 XP, holy-water, shield; standing gauntlet +4, zhentarim -1
  At the Tresendar cellars: 1x thug, 2x bandit

**A Truce Between Shops** — negotiate, from Elmar Barthen (for event ev-13), posted 24 Mirtul, 1496 DR
  Elmar Barthen will be out of business by Midsummer if Linene Graywind keeps selling rope at a loss to spite him, and he knows she is too proud to stop first. Talk her round. He is too proud to do it himself.
  Steps: [p1] Bring Linene Graywind to terms / [p2] Return to Elmar Barthen
  Pays: 65 gp, 280 XP

**Judgement: the Nameless Wight** — hunt, from Daran Edermath, posted 29 Mirtul, 1496 DR
  The Order has heard the case against the Nameless Wight outside Leilon. What remains is the carrying out of the sentence.
  Steps: [p0] Travel outside Leilon / [p1] Slay the Nameless Wight / [p2] Return to Daran Edermath
  Pays: 315 gp, 1380 XP, mace-plus1; standing gauntlet +6, zhentarim -1
  At Leilon: 1x wight

173 distinct quests offered over 60 days; kinds: clear, rescue, retrieve, investigate, cull, escort, deliver, bounty, negotiate, hunt

## The party's run
- 3 Mirtul, 1496 DR: Back to the Diggings (clear, Harbin Wester) — COMPLETED
- 5 Mirtul, 1496 DR: The Missing Wagons (investigate, Halia Thornton) — COMPLETED
- 7 Mirtul, 1496 DR: Raiders on the Trail (clear, Harbin Wester) — COMPLETED
- 9 Mirtul, 1496 DR: Open the Road on the Triboar Trail (clear, Harbin Wester) — COMPLETED
- 11 Mirtul, 1496 DR: Twig and Root (clear, Daran Edermath) — COMPLETED
- 13 Mirtul, 1496 DR: Wanted: Stedd Blackhand (bounty, Harbin Wester) — COMPLETED
- 15 Mirtul, 1496 DR: Feverfew for the Shrine (retrieve, Sister Garaele) — COMPLETED
- 17 Mirtul, 1496 DR: The Grey Wolf (hunt, Qelline Alderleaf) — COMPLETED
- 19 Mirtul, 1496 DR: The Road through the Wood (rescue, Sister Garaele) — COMPLETED
- 21 Mirtul, 1496 DR: The Toll at Wyvern Tor (clear, Daran Edermath) — COMPLETED
- 23 Mirtul, 1496 DR: The Players' Strongbox (retrieve, Toblen Stonehill) — COMPLETED
- 25 Mirtul, 1496 DR: Lay Conyberry to Rest (clear, Sister Garaele) — COMPLETED
- 27 Mirtul, 1496 DR: Wanted: Ander the Tanner (bounty, Harbin Wester) — COMPLETED
- 29 Mirtul, 1496 DR: Burn the Webs (clear, Reidoth) — COMPLETED
- 1 Kythorn, 1496 DR: Herders on the High Pasture (rescue, Harbin Wester) — COMPLETED
- 3 Kythorn, 1496 DR: Dispatches for Neverwinter (deliver, Harbin Wester) — COMPLETED
- 5 Kythorn, 1496 DR: Break Ront's Warband (clear, Sildar Hallwinter) — COMPLETED
- 7 Kythorn, 1496 DR: Tear Down the Ogre's Gate (clear, Morwen Daggerford) — COMPLETED
- 9 Kythorn, 1496 DR: Rats That Watch You Back (clear, General Sabine) — COMPLETED
- 11 Kythorn, 1496 DR: Dispatches for Waterdeep (deliver, Harbin Wester) — COMPLETED
- 13 Kythorn, 1496 DR: Raiders on the Trail (clear, Harbin Wester) — COMPLETED
- 15 Kythorn, 1496 DR: Back to the Diggings (clear, Harbin Wester) — COMPLETED
- 17 Kythorn, 1496 DR: Somebody Else's Face (investigate, Mirt) — COMPLETED
- 19 Kythorn, 1496 DR: Out of the Mere (clear, General Sabine) — COMPLETED
- 21 Kythorn, 1496 DR: Wanted: Shandri the Smiler (bounty, Harbin Wester) — COMPLETED
- 23 Kythorn, 1496 DR: The Purple in the Mere (clear, General Sabine) — COMPLETED
- 25 Kythorn, 1496 DR: The Missing Wagons (investigate, Toblen Stonehill) — COMPLETED
- 27 Kythorn, 1496 DR: Survivors in the Hills (rescue, Toblen Stonehill) — COMPLETED
- 29 Kythorn, 1496 DR: A Truce Between Shops (negotiate, Elmar Barthen) — COMPLETED
- 1 Flamerule, 1496 DR: Dispatches for Neverwinter (deliver, Harbin Wester) — COMPLETED

30/30 completed through progressQuests. Party purse: 7745 gp.
```

## What a player sees (browser playtests)

Two scripted runs of the real game in headless Chromium
(`tools/shot.mjs --scenario town --script output/director/probe.js` and
`probe2.js`; zero console errors, zero draw failures). Abridged logs:

```text
4 Mirtul, 1496 DR in Phandalin. Running: Goblins on the Phandalin Road [raids]; Trouble at the Claims [bought]

Daran Edermath's opening menu (his authored lines, then the world's):
  What did you do before the apples? | Something is wrong at Old Owl Well. | Your trees are dying. |
  Tell me about the Order of the Gauntlet. | Enjoy the shade, old man. | Any work going? (2) | Heard anything lately? | Draw your weapon.
> Heard anything lately?
Daran: "You'll have heard? The miners are selling their abandoned claims to the Miner's Exchange for a song. Halia Thornton is buying every one."
  Who told you that? [Insight 12] | Is anyone paying to have that dealt with? | What else? | That's all I wanted.
> What else?
Daran: "It's all over town: Linene Graywind lost a whole wagon of Lionshield goods on the Triboar Trail. Goblins — and they knew which wagon to take."
> Any work going?
Daran: "You look like you can handle yourself. Listen."  [Judgement: the Grey Bearded Devil of Thundertree | Ash Zombies in the ash of Thundertree]
  (that epithet is fixed since: dread quarry is now "the Bearded Devil of Thundertree")
> I'll do it.  ->  "Then go, and come back able to say what it cost."

The notice board by the square (12 postings, then proclamations):
  [job] Raiders on the Trail | Back to the Diggings | Wagons to Neverwinter | Wanted: Esvele the Tanner | ... |
  [notice] Goblins on the Phandalin Road | Market day on the green | Who holds Phandalin

A parley on the Triboar Trail (Raiders on the Trail, taken off the board):
  "The goblin watches you come, one hand on a weapon, weighing up your company and the odds."
  There is nothing here worth dying for. Walk away. [Persuasion 15] | Leave now, or leave in pieces. [Intimidation 15] |
  Here — 15 gp to be somewhere else by nightfall. | Draw steel. | Back away slowly.
> (pays)  "The coin is weighed, bitten and pocketed. By dusk there is nobody here but you."
  steps: Travel on the Triboar Trail [done] / Break the Goblins on the Triboar Trail [done] / Return to Harbin Wester; deed: bribe

A hunt in Thundertree: the quarry staged on the map with the site's hoard and the way out;
  beaten, reported to Daran ("About that work…" -> "It is done."), paid, level-up screen.

A visitor the fever brought to town:
  Feverish Miner: "Heh. Hehe. Sorry — it is the fever, it makes you laugh at nothing. Three days I have not slept, and I cannot stop laughing."

INVESTIGATE: The Missing Wagons (for Linene Graywind). A wagon clue staged on the Trail:
  "Something happened here, and not long ago. The ground has not finished telling it." [Search the ground. [Investigation 11]]
  -> "The wagon ruts leave the road here. A wheel lies broken in the ditch and the ground is churned with small bootprints.
      The trail leads off toward the hills."   (and the follow-up rescue in Cragmaw Hideout is offered)

RESCUE: The Road through the Wood (Sister Garaele; the Harper courier Kethra Helder, held by Cragmaw scouts):
  before the guards are dealt with: "Not yet — they are still out there, and they check on me. Deal with them first."
  after: "You came. Tymora's luck, you actually came." > Cut them loose.
  steps all done but "Return to Sister Garaele"; the courier turns up in Phandalin for a few days after.

TRAIL: the Cragmaw track heard of in a rumour is a sign on the Triboar Trail:
  "A goblin track leaves the Trail and follows a stream up into the thickets."  > Follow it to Cragmaw Hideout.
  Cragmaw Hideout: its canon tenants (Cragmaw Hideout Den), a hoard, and a sign by the entrance back to the Trail.

Save round trip keeps events, chronicle and postings; a save with no st.world at all loads and opens the world on its own day.
Journal > Lore opens on "The Chronicle of the Coast".
```
