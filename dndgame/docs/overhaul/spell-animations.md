# Spell animation expansion — October 2026

Combat now uses the shared named-spell VFX library previously connected to exploration. This exposes the existing distinct fire, frost, lightning, healing, ward and teleport effects in battle rather than funneling them through generic projectiles and bursts. Weapon swings and arrows keep their existing renderer.

Five new motifs extend that library:

| Spells | Animation |
| --- | --- |
| Sleep | Rising crescent motes and a faint floor ring |
| Hold Person, Hold Monster | Tightening chain bands and a lock glyph |
| Thorn Whip | Growing thorned strand, impact flare and withdrawal |
| Dispel Magic, successful Counterspell | Runes separating as the central seal collapses |
| Acid Splash | Arcing acid glob, scattered droplets and a low splash ring |

Spell impacts on monsters use their rendered body height; floor rings retain a separate ground anchor. Line and cone effects project the rules' origin-to-aim direction from the caster's visual anchor, so a raised hand cannot tilt the spell away from its selected heading. Ground effects draw before characters, and combat glow stays inside the battlefield clip. Effect impacts control visual hit feedback, while the rules engine still resolves damage and resources. Spell beats wait until impact; decorative tails can finish afterward. Teleportation retains its resolved destination even if the player skips its animation. Failed counterspells use a ward response.

The additions use the existing integer-pixel primitives and private cosmetic RNG, with no new asset downloads or gameplay-stat changes. Each sleep/binding effect visits at most twelve targets, thorn geometry is capped at eighty segments, and particles use the existing fixed 900-slot pool. Reduced-motion particle budgeting remains in effect and Sleep stops its orbital movement with that setting.

## Verification

- `tools/spell-animation-check.mjs`: all 363 catalog spells settle exactly one impact, finish and release particles; cancellation and gameplay RNG isolation are checked separately.
- `tools/spell-animation-playtest.mjs`: actual keyboard Thorn Whip and Misty Step sequence, then reproducible phase captures through the battle renderer for eleven spells at both game zoom levels. Four representative spells also run against a generated dungeon battle. Primary viewport 800×480; secondary 1200×720.
- `tools/combat-large-playtest.mjs`: existing melee, area preview/damage and large-monster camera regression.
- `tools/spell-area-check.mjs`: actual horizontal/diagonal Burning Hands and Lightning Bolt casts at both zooms; captured real area-beat options are replayed at fixed phases for inspection. Deterministic geometry checks also cover six directions and two caster heights, including a displaced casting hand.
- Original develop-web-game client: keyboard Thorn Whip cast, consumed action and returned menu captured under `output/spell-animation/skill`.

Controlled phase captures are visual probes, not additional campaign casts. The catalog sweep verifies effect lifecycle, not the rules or appearance of every spell. Full-campaign balance, long-session frame pacing and every monster/spell combination remain outside this pass. The live wizard campaign stays paused and untouched.
