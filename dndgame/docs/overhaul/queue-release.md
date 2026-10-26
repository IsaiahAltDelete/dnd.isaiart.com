# Queue continuation and release preparation — 21 October 2026

The changes are local to `C:/Users/Dizzy/Documents/DND GAME`. The player's
localhost:8765 session and saves were not touched. All playtests used private
HTTP origins and isolated browser profiles. Nothing has been committed or deployed.

## What changed

- Combat: large/huge footprint geometry now agrees across placement, legal
  movement, AI, reach, cover, area previews/damage and threatened tiles. Downed
  body picking follows its rotation. Teleport validation happens before resource
  spending. Forced movement checks the entire destination body.
- Presentation: authored attack/cast/hurt poses, casting-hand origins, new ogre
  direction art, biome surfaces on fallback battlefields, and health bars above
  transformed artwork. Existing downed toppling remains the visual treatment.
- Venomfang: numeric legendary-action costs survive stat-block conversion;
  the dragon can withdraw at half health. Winning against a routed Venomfang
  credits the tower objective without recording a false bestiary kill. The
  dragon music selector now reads the runtime creature-type field.
- City life: Waterdeep and Baldur's Gate have additional local exchanges and
  seventy short personal dialogue variants across eleven jobs. Nessa, Bram,
  Hettie and Pell have stable identities; the writing includes domestic concerns,
  familiar teasing, quiet moments, restrained dialect and bracketed gestures.
  Pell's stutter is individual and not a joke. Existing quest trees are intact.
- Elfsong tables vary between meals, papers and empty place settings.
- Audio tools: complete-loop WAV rendering and a searchable local songbook with
  one-at-a-time playback. Existing recovered compositions are preserved.

## Critic results

- Combat: **8.2 -> 8.7 PASS**, same critic, target 8.5, maximum three attempts.
  The two identified defects—bars over bodies and stale interaction evidence—
  were fixed and rechecked. No remaining must-fix issue in that bounded scope.
- City/writing/interiors/campaign: **8.4 -> 8.7 PASS**. Corrected the ineffective
  purse assertions and replaced a recurring "tomorrow" promise with evergreen
  family banter; fresh long-session and both-viewport evidence passed.
- Audio routing and audition tooling: **8.4 -> 8.8 PASS**. Instrument search now
  indexes actual parts, and filtering out a playing track pauses it. Listening
  quality is not claimed by machine measurements.

## Evidence

All paths below are under `output/queue-all/` (generated and git-ignored).

| Evidence | Result | Coverage |
| --- | --- | --- |
| `large-r2/report.json` | 37 pass | Normal-input melee, Extra Attack, cone/burst/line spells, enemy turns, young/adult dragons at both zooms |
| `recovery-final2/report.json` | 22 pass | Downed picking, Healing Word, revival, Bless, opportunity reaction, concentration replay, camera settling, failed/successful retreat |
| `combat-motion/report.json` | 3 pass | Normal-clock keyboard melee and Fire Bolt: 9 swing/lunge and 28 cast/projectile/impact frames; projectile completes without animation skipping |
| `rules-r2.json` | 53 pass | Geometry, terrain from three real maps, cover, narrow passages, difficult ground, KO concentration, defeat, teleport/push, legendary cost |
| `dragon-standard/report.json` | Victory round 6 | Natural approach and standard-ability level-eight party, normal auto-battle feature |
| `dragon-persistence/report.json` | 7 pass; victory round 14 | Natural approach, quest started, dragon withdrawal, aftermath, full reload and no respawn/reward duplication |
| `campaign-final.json` | 104 pass | Forty-day standing/prices/stock, local/faction/personal memory, no arbitrage, reward idempotence, copied saves, travel |
| `reload/report.json` | 4 pass | Full browser reload preserves Elfsong destination, purse, inventory and quest state |
| `cities-r2/report.json` | 12 pass | Eight minutes of final-copy normal clock: seven Waterdeep and four Citadel exchange cycles, no stacking/wall entry; actual purse 41 -> 41 |
| `social-r2/report.json` | 358 pass | Final dialogue copy, sixteen maps/two seeds, activity completion and interruptions; finite Party.gold assertion |
| `voices-r2/report.json`, `voices-r2-secondary/report.json` | 19 each | Six real keyboard dialogues at 800x480 and 1200x720; 68 group lines fit the five-line panel |
| `interiors/report.json`, `interiors-secondary/report.json` | 128 each | Five interiors/two seeds, NPC approaches, doors, travel arrival and fresh pictures |
| `audio-final/report.json` | 12 pass | Live city/rain/battle/dragon/return context and finite non-clipping sampled output |
| `music.json` | 57 clean renders | Every complete loop plus two seconds; 22.05kHz stereo; zero clipped or nonfinite samples |
| `songbook-r2/report.json` | 7 pass | All WAVs present, actual instrument search, playback, previous/hidden tracks pause |
| `regress-release.txt` | 33 pass | Full game regression; content-hash integrity checked separately |

`visuals-r2/`, `visuals-r2-secondary/`, `skill-final/` and the above playtest
directories contain inspected screenshots. The final eight-minute endurance run
uses the final humorous copy. The critic found that earlier social tests read
the wrong gold field; the final tests compare finite Party.gold values. Early
failing or ineffective fixtures are retained for diagnosis, not counted as
passing evidence.

## Remaining practical verification

- A genuine historical campaign export was unavailable. The old-format test is
  explicitly a copied version-one fixture with optional ledgers removed.
- Supplemental normal-clock melee/Fire Bolt frame sequences were inspected after
  the critic pass, including swing contact, casting-hand origin, travel and ogre
  impact. This adds observed motion evidence without changing production code or
  the critic score. Not every reaction/spell/monster pairing is covered, and
  sampled frames do not certify the feel of every complete animation.
- Listening comfort, timbre and music/ambience balance need human audition.
  Measured full-loop loudness ranges from -34.42 to -28.88 dB; this is the tool's
  gated level, not a LUFS certification. No mix changes were made solely to
  flatten intentional dynamics. Use `output/queue-all/music/index.html`.
- Two level-eight dragon wins are useful encounter evidence, not exhaustive
  party-build or global balance testing. Earlier all-10 ability fixtures are
  not comparable balance baselines.

## Deliberate commit and deployment preparation

The accumulated diff includes earlier accepted art, lighting, VFX, city density,
NPC memory/trade and camera work. Preserve that work. `git diff --check` passes;
33 authored art modules build consistently and all 150 module URLs are stamped.
Some existing files show whole-file newline churn; use
`git diff --ignore-space-at-eol` for the substantive review before staging.
The read-only diff inventory is `output/queue-all/release-diff-stat.txt`.

Suggested review groups: (1) art/world/lighting, (2) NPC society and city writing,
(3) combat rules/UI and dragon aftermath, (4) score/routing/tools, (5) evidence
and checkpoint documents. Keep each source `.pxa` with its generated art module.
Do not stage output captures, local saves, or full generated WAVs.

For a release, first preserve the accumulated workspace in reviewed commits,
including new source/tool files. Then verify the intended deployment checkout
and its diff before copying only runtime `index.html`, `src/` and required
assets. Run the stamped-cache and game smoke checks at its deployment path.
Saved stage/pastimes/crafting/travel/ambience branches require separate feature
integration; [branch-audit.md](branch-audit.md) records why wholesale merging
would discard newer work. No commit, push, copy or publication occurred here.
