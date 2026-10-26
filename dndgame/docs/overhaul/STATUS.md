# Overhaul status — updated 22 Oct 2026

## Prioritized work list

Updated 22 October 2026. This is the current queue; the older role and branch lists
below are historical checkpoints. Completed work should be extended, not reapplied.
Unchecked items are remaining verification, not all confirmed defects. Current
evidence and release preparation: [queue-release.md](queue-release.md).

### Next combat verification

- [x] General lag and location-loading pass: critic **8.8/10**, first review.
  CPU sprite finishing, bounded static-tile viewport caches, cached journey art,
  hidden-world draw suppression, and elapsed-time journey timing. 166 checks pass;
  real keyboard entry into Elfsong and movement after arrival verified. Comparable
  draw medians roughly halved; travel samples19–33s became3–6s on a busy host.
  Evidence: `output/performance/summary.json`, `output/performance/critic-r1.md`.
  Remaining browser scheduling stalls and hardware variation are not claimed fixed.

- [x] Melee, area-spell and standing large-monster pass: critic **8.6/10**, first
  review. Body clicks, legal reach, Extra Attack, cone/burst/line previews and
  damage, young/adult dragon framing at both zooms, and both desktop window sizes
  verified. 117 assertions pass; primary run explicitly exercises enemy turns.
  Evidence: `output/combat-large/REVIEW.md`. Downed-body picking remains below.
- [x] Playtest opportunity reactions, concentration, friendly healing,
  downed-character revival, retreat and defeat. Verify the camera and action
  budget through each interruption and return to normal turns. Make downed-body
  picking follow the rendered topple rotation: the horizontal body should be
  selectable, and its former upright rectangle must not intercept other targets.
- [x] Exercise combat on actual terrain: walls, cover, narrow passages, difficult
  ground and arena edges. The recent controlled combat fixtures use open ground.
- [x] Run a natural Venomfang encounter from Thundertree through its aftermath.
  Check party-level balance, breath telegraphs, escape, rewards and persistence.
  Two level-eight standard-ability parties won (rounds six and fourteen). Final
  run verifies dragon withdrawal, quest credit, rewards, full reload and absence.
  This is encounter coverage, not a global balance certification.
- [ ] Verify save/reload and recovery across travel, shopping, quest rewards and
  combat boundaries using copied test saves, including an older campaign.
  Current-format full reload, forty-day economy and synthetic old-format copy
  pass. A genuine historical campaign export was not available for testing.

### High value gameplay and presentation improvements

- [x] Give large creatures consistent multi-tile footprints across deployment,
  movement, occupancy, reach, AI, cover, area previews/damage and threat overlays.
  Invalid teleport/forced-movement placement is rejected. Combat critic
  **8.2 -> 8.7 PASS**; health bars now clear the actual creature artwork.
- [x] Connect authored attack, cast and hurt poses; move spell origins with the
  casting hand. Retain the existing downed topple and match picking to it. Pose
  captures and actual recovery pass. Supplemental normal-clock melee/Fire Bolt
  sequences show swing contact, hand origin, projectile travel and ogre impact;
  this does not certify every animation pairing or its continuous feel.
- [x] Improve battlefield presentation where the fallback checkerboard appears;
  audit real encounter terrain before replacing it. Keep hazards and reach clear.
- [x] Extend authored monster art beyond the completed goblin, orc, skeleton,
  wolf and dragon families. Prioritize frequently encountered creatures; the
  ogre now has authored directional art with a clearer face, clothes and club.
- [x] Run longer Waterdeep/Baldur's Gate sessions to check activity repetition,
  interruptions and crowd movement. Add more distinctive conversations and
  neighborhood events where repetition is noticeable.
- [x] Test reputation and trade over a campaign: price progression, supply,
  faction consequences and remembered encounters. The bounded implementation
  passes 104 checks over forty simulated days plus a full browser reload. This
  covers bounded progression and exploits, not weeks of player balance feedback.
- [x] Continue interior and travel polish selectively: vary repeated tabletop
  arrangements, improve remaining bland rooms, and review transition pacing.

### Later queue and release work

- [ ] Audition music and ambience in play, including battle and dragon transitions.
  Live city/rain/battle/dragon/return routing and finite output pass; fixed the
  dragon creature-type lookup. All 57 full-loop renders are clean and available
  in a searchable audition page. Human listening comfort remains unassessed.
  See [score.md](score.md); recovered compositions have not been rewritten again.
- [x] Audit saved stage, pastimes, crafting, travel and ambience work before
  choosing the next feature. Confirm what is integrated versus branch-only.
- [x] Inspect the accumulated local diff,
  run release checks and prepare a deliberate commit/deployment. These local
  improvements have not been published. [Release preparation](queue-release.md)
  records the local change groups, evidence, limits and publication sequence.

### Recently completed

- [x] Longer tree visibility/performance playtest: critic **8.7/10 PASS**, review1.
  603.841 seconds across forest, town, ruins, overlapping crowns and both combat
  zooms; primary800x480 and secondary1200x720. Fixed cumulative canopy opacity
  and body-edge misses; world creature sizes and rotated combat bounds now fade
  overlapping crowns together. 94checksPASS plus keyboard-client attack; no
  browser/draw errors. All segment framep95 about16.8ms; isolated hitches up to
  84.5ms remain. Controlled events were suppressed to preserve the test route;
  combat mostly tested prolonged turn cycling plus separately confirmed attacks.
  Evidence: `output/tree-soak/completed/report.json`, `supplemental/report.json`,
  `critic-r1.md`. Wider hardware, sustained complex combat and multi-hour memory
  remain unassessed. Live campaign untouched; local changes only.

- [x] Tree and canine scale correction: critic **8.4 -> 8.7 PASS**. Five tree
  species and assembled oak/pine crowns now stand above people in both world
  and battle, with feet sorting and visibility fading. Collision roots stay
  unchanged. Eight canine art mappings share restrained world/combat scales;
  mastiff alias included after review. 166 checks across this pass, including
  final39 at each desktop size and mouse/keyboard mastiff attacks to victory.
  Evidence: `output/scale/critic-r2.md` and `output/scale/r2-final-primary/`.
  Continuous fade feel and long-session performance remain unassessed.
- [x] Dire wolf and missed monster sprite upgrades: critic **8.6/10 PASS**,
  first review. Reauthored wolf facings and repaired nine variant assets that
  cloned their families before authored replacements; material ramps and hit
  flashes remain intact. All 275 catalogue entries resolve art. 143 checks pass
  across two desktop sizes and general regression, plus keyboard melee playtest.
  Evidence: `output/monster-upgrade/critic-r1.md`, `verified-primary/report.json`
  and `verified-secondary/report.json` under the same output folder. Minor later
  polish: wolf side-view hocks and near/far paws. Local; live campaign untouched.
- [x] Character creator revamp: four chapters, free browsing with final validation,
  portrait plus equipped sprite, manual facing/walk controls, story and editable
  review checklist. Larger explanations and fully wrapped mechanical values.
  Critic **8.1 → 8.6 PASS**; 56 input/render checks at each desktop size, eight
  extra controls checks, five readability checks and 33 general regressions pass.
  [Creator details and controls](creator.md). Local; live campaign untouched.
- [x] Appearance expansion: six new hairstyles (18 total),16 selectable outfit
  cuts, Body/Hair/Dress tabs, Linen colour and emblem controls. Portrait/sprite
  materials and silhouettes agree; front locks overlay collars and braid/loc
  tips move on the stride. Critic **8.1 -> 8.6 PASS**;139 checks at each desktop
  size,56 creator checks and33 general regressions pass.
  [Appearance details and evidence](appearance.md). Fresh preview open;
  original draft/campaign preserved. No commit/deployment.
- [x] Slice-of-life NPC writing: seventy short variants, four named locals,
  personal verbal habits, light humor and roleplay gestures. City/content critic
  **8.4 -> 8.7 PASS**. Final-copy eight-minute endurance and 358 activity checks
  pass; player purse preserved. Audio/tooling critic **8.4 -> 8.8 PASS**.
- [x] Denser city streets and interiors; shared NPC activities and gestures.
- [x] Broadsheet exchanges resume after dialogue.
- [x] Combat portrait selection no longer causes aggressive camera movement.
- [x] Full three-character encounter through victory, including targeting,
  dragging, zoom and turn handoffs; critic 8.8/10, 71 checks passing for that pass.
- [x] Dragon art and Thundertree encounter access; improved travel illustrations.
- [x] Initial NPC memory, reputation and trade pass; critic 8.6/10.

## Previous NPC activity checkpoint

The **shared NPC activity and animation pass** is complete locally:
critic **8.0 -> 8.5 PASS**, target8.5/max3, same queue_critic. Ten street activity
types now coordinate approach, request, reply, action, acknowledgement and return
sequences. Customers receive goods, neighbours exchange small items, news readers
pass broadsheets, audiences request songs and applaud, and repair helpers hold
fittings at the anvil. Participants face one another, use directional hand
poses, and carry received props back to their stopping places. Musicians strum
and bow with separate head/torso motion and planted feet. Timing is staggered;
short alternating exchanges leave quiet gaps between scenes.

Dialogue, danger and closing hours release shared activity ownership. Ambient
exchanges do not change player gold, inventory or quest flags. Existing player
access and crowd pass-through remain. Two PixelForge sources contain17 gesture
and item frames; strict lint passes and148 import hashes are current.

Evidence: `output/street-social/round2/` (30 phase screenshots, two seeds and
1200x720 secondary) and `motion-r2/` (five16-second recordings at6fps with GIFs
and filmstrips: music, market, repairs, night music, news). All358 interaction
checks pass across16 maps/two seeds, including70-second motion, completion,
handoff proximity, non-stacking, and interruption by dialogue/danger/hours.
All33 regressions pass, no browser/draw errors; real-keyboard listener dialogue
passes in `controls-r2/`. The critic marked every earlier defect fixed and found
no further revision necessary within scope. Real-time playback feel, long-session
repetition, every template visually, all seeds, historical saves and audio remain
unassessed. No runtime edits after the passing review. Live campaign untouched;
save then refresh to load the changes. No commit/deployment.

### Previous street density pass

The **Waterdeep / Baldur's Gate street-life pass** is complete locally:
critic **8.0 -> 8.5 PASS**, target8.5/max3, same queue_critic across both rounds.
Sixteen outdoor districts now have market customers, performers and audiences,
news readers, repair work, food stalls, porters, couriers and watch activity,
selected for the neighbourhood. Daytime trades close while evening activity
continues. Short local routes and cross-district errands animate the gaps.
Activity-specific formations, reserved stopping places and ambient crowd
avoidance prevent stacking; the player can pass through ambient residents.
Workers face their real work surfaces, and participants have their own dialogue.
Props preserve previously reachable floor and protect doors and story NPC posts.

Evidence: `output/street-life/round2/` and `round2-seed-b/`, including later/night
views and1200x720 secondary capture. All480 checks pass across16 maps/two seeds;
all33 regressions pass with no page errors or draw failures. Real-keyboard
performer/listener conversations and two walking bursts were verified in private
campaigns. Current146 import hashes and git diff --check pass. The critic found
no remaining defects requiring revision; gestures remain deliberately simple.
Continuous movement feel, extended interactions, every seed, historical saves
and audio were not assessed. No runtime changes after the passing review.
The live campaign was not reloaded or used for tests. Save then refresh to load
the changes. No commit/deployment. This completes the street-density request,
not every historical checkpoint in the broader queue.

### Previous interior density correction

The follow-on **interior density correction** is complete locally: critic
**8.5 PASS on round 1** (target8.5/max3). Elfsong now has grouped trestles,
smaller seating rugs, hearth seating and a wall booth. Sundries has appraisal
and packing bays; Baldur's Mouth has composing and dispatch benches; High Hall
has clerks' workspaces and entrance seating; the Portal has provisioning and
shared dining tables. These are real map furnishings with collision.
Two-seed checks cover128 NPC, service, trigger and arrival routes, all passing.
They caught and fixed a Volo access problem before review; the older well sign
is now reachable. Evidence: `output/interior-density/round1/`. All33 regression
checks pass, and real-keyboard Elfsong/Sundries shop openings and Portal descent
into Undermountain passed. Remaining critic suggestion: vary
one Elfsong tabletop arrangement; nonblocking. Extended NPC movement, every
seed and historical saves were not assessed. No runtime edits after review;
the player's live campaign was not used for testing. No commit/deployment.

### Previous character and interior pass

The follow-on **character / Waterdeep / Baldur's Gate interior pass** is
complete locally, critic **8.0 -> 8.5 -> 8.5 PASS** across three reviews.
Six PixelForge outfits now have authored fronts, profiles and backs: noble,
doublet, coat, robe, plate and jerkin. They feed both the actor compositor and
baked city NPCs while preserving portrait colours and equipment.

The Yawning Portal has a shaft/windlass and compass textiles; its open-house
taproom is excluded from random street clutter. The Elfsong has lyre rugs and
table settings; Sundries has orb/potion cabinets and arcane counter goods;
Baldur's Mouth has a printing press and documents; High Hall has civic ship
banners, runner and delegates' papers. Floor plans and interactions remain.
Well destination labels sit above the mechanism so the shaft stays visible.

Evidence: `output/city-art/critic2/` (eight inspected views including night and
1200x720 secondary capture), final verification in `output/city-art/final/`.
Real-keyboard skill-client fixtures in `controls-portal`, `controls-elfsong`
and `controls-sundries` verify descent and both shop openings. Thirty generated
art modules and 145 import hashes are current; all 16 new sources pass strict
lint (square timber/embroidery/bottle corners have documented exceptions).
Final verification has 30 passing checks, including two-seed paths from the
Waterdeep spawn to its doors, shaft and inn-service approach. This found that
seating could surround the service table; clearing (17,17) guarantees access.
The fourth keyboard fixture, `controls-portalinn`, opens its inn dialogue.
The third critic review confirmed this functional fix without changing the
approved art. The final 33-check regression suite passed, with zero browser
errors. No runtime changes after the final review. Continuous animation feel,
exhaustive body/equipment combinations, every procedural seed
and historical saves were not assessed. No blocking critic notes remain;
display cabinets deliberately use the game's restrained pixel silhouettes.
The player's live Baldur's Gate tab was not reloaded or used for tests.
Changes remain uncommitted and undeployed.

### Previous visual pass

The user-directed visual pass is complete in the working tree. Independent
critic history: **7.3 -> 8.2 -> 8.5, PASS** (target 8.5, three attempts).

- New PixelForge goblin, orc, skeleton, wolf, and young/adult dragon art;
  roaming monsters use the same family mapping and tint as combat. Creature
  portraits fit the resolved art, and large native sprites avoid a second size
  multiplier in combat. Character clothing has directional shading, folds,
  collars, and buckles using the portrait's existing appearance colours.
  Dragon scales and membranes use separate colourways, preserving ivory
  chest plates, horns, claws, eyes and outlines. The boss intro fits in full.
- Thundertree is an authored outdoor ruin reached by a signed westward path
  in Neverwinter Wood. Venomfang waits in the tower, opens the normal standoff
  and combat flow, and stays defeated across reloads. This does not restore
  the whole old Thundertree quest chain or rebalance a CR 8 dragon.
- Stonehill and Barthen's have woven room-sized textiles and counter goods;
  safe interiors receive window light on walkable floor. Doorways and regional
  fast travel use illustrated destination cards with contextual prose,
  distinct architecture, layered cave depth, and day/night skies.
- Evidence: 13 inspected captures in `output/world-art/final/`, report
  `output/world-art/review3.json`, ten targeted behavioral checks,
  33 regression checks, all 192 warp directions and 236 NPC placements,
  strict art lint and generated-art/import-map freshness checks. The skill
  client traversed the actual new route. No browser errors or draw failures.
  All 14 generated art modules and 129 import-map hashes are current. New art
  passes strict lint with documented intentional tail/material exceptions.
- Final critic residual: optional reduction of the cave illustration's
  exterior texture density. No runtime changes were made after the pass.
  Natural CR8 battle balance, audio/animation feel, full campaign progression
  and exhaustive historical saves were not assessed. The victory fixture
  sets foes to zero HP, then exercises results, the actual completion callback,
  persistence and reload; it is not a combat-balance test.
- This is a bounded visual pass, not a repaint of the full bestiary or a
  conversion of the world to portrait-resolution characters. Native world
  sprites remain 16x24; the existing portraits keep their finer detail.

The user steered the next pass to NPC behavior, reputation and trade. That
bounded pass is implemented and passed its critic loop **7.9 -> 8.3 -> 8.6**;
35 targeted browser checks and 33 regression checks pass. Details and validation
are in [society.md](society.md). The earlier queue checkpoints below remain
integrated. The broader saved role queue has not been silently completed.

Resumed in `C:\Users\Dizzy\Documents\DND GAME`, the newer development checkout.
The `GitHub/isaiart/dndgame` folder is an older deployment copy.

- Continued the three saved checkpoints with the installed `critic-loop`
  skill: spell illumination (`vfx-r2`), cave/Undermountain music (`score-r2`),
  and architecture (windmill, gate/battlements, Daggerford/Wide notice boards).
  Independent critic history: **8.6/10, PASS on round 1** (8.5 target, up to
  three attempts). The sole residual was misleading light API documentation;
  corrected afterward without re-scoring. Actual audio listening and
  long-session performance were not assessed.
- Spell lights now enter the grade after the current effect frame is drawn.
  Architecture appends 32 keys, preserving all 478 prior tile IDs. Revised
  music has updated catalogue entries and measured normalization; 60-second
  renders have no clipping/nonfinite samples and differ by 0.17 dB loudness.
- Batch verification: 33/33 regressions, 190/190 warps, 236/236 NPC placements,
  score checker zero errors/warnings, actual gateway traversal, inspected
  VFX and architecture captures at native and desktop sizes. Evidence and
  two audition WAVs: `output/queue-review/`. Role notes contain details.
- Baseline verified: 30/30 browser checks; 120 import-map hashes current.
- Lighting checkpoint `994e1a1` recovered into the working tree, reviewed and
  completed: visible party torches/lanterns and guards' night lanterns.
  Entity lights now use the current frame's environment, including the first
  frame after dawn or entering a building; explicit carried lights also work
  underground. The light centre follows the hand's stride.
- Validation: 33/33 browser checks, ten lighting gallery scenes and two
  movement captures inspected; no page errors or draw failures.
  Artifacts: `output/resume-lighting/`.
- These changes are in the working tree, not committed or deployed.
  The original `overhaul/lighting` branch is preserved; do not blindly apply
  its checkpoint again.
- The saved vfx-r2, score-r2 and architecture deltas are now recovered and
  reviewed in this working tree; do not blindly reapply them. This does not
  close every broader art/music TODO. Next new roles in the saved order are
  monsters and battlefield, followed by World, Sandbox and Roads; stage-r2
  still has its separate unreviewed polish checkpoint.
- Machine note: PATH resolves Node 14, which cannot run the installed
  Playwright. Use the bundled Node at
  `C:/Users/Dizzy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe`
  (Node 24). Browser checks need access to their loopback server.

## Historical checkpoint — stopped 28 Sep 2026, 07:20

The overhaul (docs/OVERHAUL.md) was paused at the user's request. Everything
the agents made is either on `main` or committed on its own `overhaul/*`
branch; nothing is lost. On `main` at the move: `tools/regress-run.mjs` 30/30,
`tools/stamp.mjs --check` clean (120 modules), no page errors.

## Third session (28 Sep, 06:30-07:20): landed on main

| role | what it did |
|---|---|
| `menus` | Finished the manuscript restyle: party sheet, inventory, spellbook, journal, map, bestiary and save screens (earlier: pause menu, Options style page, Minstrel's Songbook) |
| `title` | Title screen rebuilt (layered vista, new lettering) — see docs/overhaul/title.md |
| `vfx` | Spell/battle effects library landed in part (render/vfx.js, vfx-art); 1 more commit on `overhaul/vfx-r2` |
| `lighting` | Lighting landed in part; 1 WIP commit on `overhaul/lighting` |
| `score` | More of the music integration landed; 1 WIP commit on `overhaul/score-r2` |

Unlanded now: `overhaul/lighting` +1, `overhaul/vfx-r2` +1, `overhaul/score-r2` +1,
`overhaul/architecture` +2, `overhaul/stage-r2` +1, and the Sandbox/Roads
branches `pastimes`, `crafting`, `travel`, `ambience`.

Never started: `monsters`, `battlefield` (the battle arena is still a
checkerboard), `economy`, `factions`, `npclife`, `companions`, `codex`.

Roles to resolve (not re-run) when relaunching: stage, kit, terrain,
pixelforge, audio, sacred, director, encounters, hud, combat-hud, characters,
secular, menus, title. Resume (they continue their branch): lighting, vfx,
score, architecture. Then monsters -> battlefield, and the World fleet
(economy, factions, npclife, companions), then Sandbox and Roads.

## Second session (23 Sep, 06:50-08:10): landed on main

| role | what it did |
|---|---|
| `hud` | Overworld HUD rebuilt as Layout widgets on the fine grid: compact party card, sun-dial clock/date/weather/purse, heraldic location banner, slim action belt, round minimap; presets |
| `combat-hud` | Battle HUD: slim log strip at the top (no longer over the field), portrait initiative rail, unit card with A/B/R budget pips, End Turn plate |
| `characters` | Poses, painted portraits (render/portrait.js), ramp re-shade, selective outline |
| `secular` | Secular polyphony book (estampies, rota, dances) |
| `menus` | Shared menu chrome (ui/menukit.js), pause menu, Options style page, the Minstrel's Songbook — partial; more screens left |
| `architecture` | Interiors furnished by trade, notice board, hedges, BG temple lanes — partial; 2 more commits on the branch |
| `score` | Part landed; 2 commits on the branch |

Still on branches (WIP, not landed): `architecture` +2, `vfx` +2, `score` +2,
`title` +2, plus the earlier `stage-r2`, `pastimes`, `crafting`, `travel`,
`ambience`.

Never started yet: `lighting` (it was queued first but the reorder did not
take effect — start it with a direct run() call, not behind Promise.all),
`monsters`, `battlefield`, `economy`, `factions`, `npclife`,
`companions`, `codex`.

New known issue: regress 'charcreate: a randomised character is always
complete' fails intermittently (a random elf's Keen Senses pick can collide
with an existing skill). charcreate/species/character were NOT changed in the
overhaul, so this is an old randomiser gap surfaced by chance; everything else
is 28/28.

Fleet scripts for the next session: resolve every role above that has landed
(the same way stage/kit/terrain/... are resolved) before relaunching.

## First session: what landed (on main)

The visible change is still small. That is by design for the foundation
(the Stage was built to reproduce the old frame pixel-for-pixel before anyone
restyles on top of it), and because the agents that redesign the HUD, battle
arena, lighting, poses and spell effects never got to run. What landed:

| role | what it did | notes |
|---|---|---|
| `stage` | Layered compositor: 17 named layers (world at 400x240, interface on an 800x480 fine grid), engine routing, F10 layer inspector, F8 HUD arrange mode (`ui/layout.js`), pixel filters + scanlines hooks, `tools/detshot.mjs` deterministic before/after shots | `docs/overhaul/stage.md` |
| `kit` | Illuminated-manuscript UI kit: fine / xs / title faces, drop caps, rubricated headings, gilt text, new materials, four themes (`UI.setTheme`) | `docs/overhaul/kit.md` |
| `terrain` | Repaint of grass, trees (clustered canopies), water, pools, cobbles, furrows; no 16px rhythm; arena verge API `drawGroundBlended` for the battlefield | `docs/overhaul/terrain.md` |
| `pixelforge` | `@ramp` / `@layer` / `@frame dur=` / recolor, lint, `tools/pxbuild.mjs` compiling `assets/pixel/**/*.pxa` to `src/render/art/*.js`, in-game probe, a layered brazier asset | `docs/overhaul/pixelforge.md` |
| `audio` | `core/synth.js`: formant sung voices, Karplus-Strong plucks, rooms (chapel/tavern/hall/cave), loudness normalisation, context rotation; `tools/music-render.mjs` offline renders | `docs/overhaul/audio.md` |
| `sacred` | 14 sacred and courtly polyphonic pieces (Dies irae, organum, motets, a Tyr conductus, an Alustriel ballade, Llibre Vermell songs ...) with contexts | `docs/overhaul/sacred.md` |
| `director` | World director: calendar events with stages and consequences, rumours, endless generated quests actually wired into the game | `docs/overhaul/director.md` |
| `encounters` | Encounter director: wayfarers on the roads, situations with who/why, a parley card (`ui/standoff.js`), road narration, telegraphed ambushes; grass ambushes no longer fire every few seconds | `docs/overhaul/encounters.md` |
| `characters` | Part landed (palette-ramp re-shade); poses and portraits are on the branch | `docs/overhaul/characters.md` |

## Committed on branches, not landed

Each ends in a "WIP checkpoint" commit that may be mid-edit. Resume from the
branch (the fleet scripts already tell agents how).

| branch | state |
|---|---|
| `overhaul/stage-r2` | one WIP polish commit on top of what landed |
| `overhaul/characters` | pose frames, `render/portrait.js`, selective outline — WIP |
| `overhaul/secular` | secular polyphony book — WIP |
| `overhaul/pastimes` | Three-Dragon Ante engine, tavern rules, headless tests |
| `overhaul/crafting` | recipes, gathering data, crafting rules — WIP |
| `overhaul/travel` | routes, travel rules, mount sprites (`mount-*`) — WIP |
| `overhaul/ambience` | ambience DSP core: beds, calls, rooms — WIP |

## Never started

Interface: `title`, `hud`, `combat-hud`, `menus`. Art: `architecture`, `vfx`,
`monsters`, `lighting`, `battlefield`. Music: `score`. World: `economy`,
`factions`, `npclife`, `companions`. Sandbox: `codex`.

## Known issues seen at pause

- Battle: the arena is still a raw checkerboard (owned by `battlefield`; the
  terrain agent's `drawGroundBlended` is ready for it). The log overlap was
  fixed by `combat-hud` in the second session.
- neverwinter-wood: two pale square tiles sit on the Triboar Trail road —
  check whether they are snow patches without verges (terrain) or a tile
  mix-up.
- The kit's fine text should be re-checked on the real Stage 2x layers now
  that both have landed.

## How to resume

1. Check the usage window first (`get_usage`). Twelve parallel Opus agents
   burned a whole 5-hour window in ~40 minutes; run about 6-8 at a time.
2. The six fleet scripts are in `docs/overhaul/fleet-scripts/` (Workflow tool,
   `scriptPath`). Before relaunching, replace every role that has already
   landed with a resolved result (as `overhaul-interface.js` does for `kit`)
   so it is not re-run: currently `stage`, `kit`, `terrain`, `pixelforge`,
   `audio`, `sacred`, `director`, `encounters`.
3. Agents work in their own git worktrees and land with `sh tools/land.sh`
   (merge main in, regenerate the import map, fast-forward main). Never
   commit in the main checkout while agents are landing.
4. Deploying to the site: copy without `.git` and `output`:
   `robocopy "C:\Users\Dizzy\Documents\DND GAME" "C:\Users\Dizzy\Documents\GitHub\isaiart\dndgame" /E /XD .git output __pycache__ .claude\worktrees`
