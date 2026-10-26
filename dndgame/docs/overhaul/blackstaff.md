# Blackstaff Tower

Previously present only in dialogue, equipment and background references, Blackstaff Tower is now a visitable destination. From Waterdeep's upper cross-street, take the west opening into the Castle Ward. A sign at the junction and Volo's Silverhands/Blackstaff topic give directions. Approach the silver ward-mark on the tower to enter; the southern reception threshold returns to the court, and the eastern street returns to Waterdeep.

The two new maps comprise a delivery courtyard with a windowless dark tower, and a compact reception/academy interior. A reading room, practice room, hearth corner and working desk provide different uses for the space. Vajra Safahr offers topics about the tower, her responsibilities, studying magic and preparation for Undermountain, plus a ward-maintenance quest. Tessele and Darvin run a concentration discussion and supervised projection exercises. Lecterns and the work slate can be examined. All classes may visit and train; there is no forced build, class gate or fee.

This is an original campaign interpretation of the publicly accessible rooms. Private chambers are described as warded; upper floors and a recruitable Vajra remain outside this implementation. Vajra uses the existing noncombat NPC setting rather than commoner combat stats. Her portrait and sprite use the same established character layers and palette. The new tower tiles are appended to the tile registry to preserve existing saved IDs and are raster-cached like other scenery.

## Academy work

- **Measure Twice, Cast Once:** enroll with Darvin in the eastern practice room. Use arrows or click to aim and Z/Enter to project; X/Escape returns to the room. Place a single-target projection on a dummy, then cover both dummies with a ten-foot burst while keeping the blue observer clear. Tessele in the western reading room supplies the concentration discussion. Report to Darvin for 120 XP, 25 gold and one Magic Missile scroll.
- **The Ward Round:** accept from Vajra. Inspect the blue crystal beside the west delivery cart and the crystal beside the east courtyard bench. Each repair has a clue, a safe incorrect attempt and a corrective action. Have Tessele compare both readings before reporting to Vajra for 150 XP, 40 gold and one healing potion.

Rewards are one-time. Practice is repeatable and uses a harmless borrowed focus: it spends no party resources, teaches no spell automatically and permits non-casters. The burst preview uses the same grid-area calculation as combat; this is a placement lesson, not a simulated combat encounter. Normal scroll eligibility remains unchanged. Completed lessons can precede enrollment and are synchronized into the journal on enrollment. Flags, active steps and completed quests use the ordinary save format.

Quest activity is deliberately small-scale: ward maintenance, reading notes, supervised exercises and staff banter. It does not add a daily class timetable or a procedural academy curriculum.

## Grounding

- [Wizards of the Coast: Lords of Waterdeep rulebook, Buildings appendix](https://media.wizards.com/downloads/dnd/DnD_LOW_Rulebook_EN.pdf) locates Blackstaff Tower in the Castle Ward.
- [D&D Beyond: Legendary Heroes](https://www.dndbeyond.com/posts/2026-legendary-heroes-the-forgotten-realms-greatest) identifies Vajra and her role as Blackstaff.

The room arrangement, visiting access and dialogue are original to this game, not a reproduction of a published floor plan.

## Checks

`tools/blackstaff-check.mjs` checks all exits and NPC approaches across three seeds for Waterdeep and both new maps, plus dialogue links. `tools/blackstaff-playtest.mjs` walks the street connection, tower entrance, academy rooms and return route using real keyboard input, and exercises Vajra's four topics and both apprentices. Testing uses disposable browser origins; the live paused campaign is untouched.

Tower architecture critic result (before academy quests): **8.0 -> 8.5 PASS**, second attempt. The revision added height, a receding roof, shaded side and cornice, plus physical signposts at all four notice locations. Three-seed reachability checks, both-size visual/readable-object checks, a fresh keyboard roundtrip and the original web-game client passed without reported console errors.

Academy checks: `tools/academy-check.mjs` verifies unsafe/safe placement, credit earned before enrollment, idempotent progress, reward item definitions and three-seed crystal accessibility. `tools/academy-playtest.mjs` uses actual keyboard controls for both full quests, including wrong attempts, early turn-in gates, save/reload, exact rewards, repeat training and a fighter enrollment. `tools/academy-capture.mjs` verifies mouse targeting and Escape at 1200x720; the original web-game skill client verifies a precision exercise at 800x480. Reports and screenshots are under `output/academy/`; all runs reported zero console errors. Save testing also found and fixed retired party sprites remaining solid on cached maps after replacing the overworld scene. The full quest test asserts the party entity count after loading and returning to maps.

Natural campaign discovery, historical-save playthroughs, continuous animation/audio and long-session performance remain unassessed.

Academy critic result: **8.6/10 PASS**, first attempt of three. Review: output/academy/critic-review-1.md. No required revisions and no runtime changes after review. The paused live campaign was not opened or modified.

## Everyday academy life
Six additional apprentices work in pairs: Ilyra and Fen shape harmless light projections (including a light that grows ears); Neris and Oren compare notes and pass annotated sheets; Mira and Joss manage a singing kettle with a wandering lid. Sella and Tam practice contained ward lights in the court, alongside a delivery crew. The existing quest staff stay available. Activity runs during daytime/evening hours; night closes ambient groups without disabling quests.

These scenes use the existing shared approach, request, reply, action, reaction and return sequence. Talking to an apprentice interrupts it; they resume after the conversation. Effects are bounded canvas accents, with no damage, rewards, combat, spell-slot cost or quest-state changes. Only the active map updates. Apprentices yield to the player and preserve protected entrances, lecterns and quest-NPC approaches.

The same pass develops the Wide with named weighing-stall regulars, a cloth seller and tailor, and a household auction. Animated balances, unrolling cloth and a small auction bell distinguish these from the existing produce market, food stall, broadsheet group and musician. Their goods are ambient; Aseir remains the existing shop. Original conversations describe ongoing work and relationships.

Life-scene verification: tools/place-life-check.mjs covers three seeds across Blackstaff Tower, its court, the Wide, Waterdeep and Citadel Streets. All expected activity cycles completed; actors stayed out of scenery and did not stack; exits and quest approaches remained reachable; interrupted scenes resumed and night hours closed them. tools/place-life-playtest.mjs captures five phases and tests actual dialogue interruption for all seven new activity types at800x480 and1200x720, with zero console errors. tools/academy-playtest.mjs replayed both existing quests with the additional crowd, including save/reload and exact rewards. Evidence: output/place-life/. Long-session performance, audio and historical-save coverage remain unassessed.

Everyday-life critic result: **8.5/10 PASS**, first attempt. Review: output/place-life/critic-review-1.md. Minor remaining presentation issue: the nearby Talk prompt can overlap the kettle’s floating lid; no functional impact was observed. No runtime changes after review. Phase captures demonstrate state progression, not a performance benchmark.
