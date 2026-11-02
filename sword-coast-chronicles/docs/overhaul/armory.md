# Armory expansion

The 38 existing mundane weapon families now have separate pixel silhouettes shared by held equipment, inventory miniatures and shop icons. This covers all 122 explicitly catalogued weapons plus generated enhancement variants. Magic variants preserve their base weapon shape; selected named weapons have special profiles. NPC equipment inherits the same revised base art. Art source: `assets/pixel/weapons/armory.pxa`; generated module: `src/render/art/armory.js`.

## New stock: 22 weapons, six items

| Source | Additions |
| --- | --- |
| Handbook variants | Silvered Rapier, Silvered Spear, Vicious Longsword, Vicious War Pick, Flame Tongue Rapier, Flame Tongue Scimitar, Frost Brand Greatsword, Longbow of Warning |
| BG3 adaptations | Everburn Blade, Gold Wyrmling Staff, Knife of the Undermountain King, Sorrow, Phalar Aluve, Defender Flail |
| Original weapons | Coast Cutlass, Boar Spear, Harbor Hookglaive, Lamplighter's Mace, Dockside Lash, Stormglass Longbow, Dockworker's Cudgel, Moonreef Trident |
| Original items | Surveyor's Compass, Duelist's Wraps, Streetrunner Boots, Cinderward Ring, Second Wind Draught, Clearhead Tonic |

Find early weapons at Lionshield Coster; martial and silvered weapons at Thunderhammer Smithy; coastal equipment at Baldur's Gate's Wide Market; Phalar Aluve, warning/storm bows and Moonreef Trident at Waterdeep Bazaar; and the infernal blade, staff, Sorrow, Undermountain knife and elemental variants at Sorcerous Sundries. All 28 have finite stock and level gates; several also enter the existing dungeon loot pools. Old saves resolve these catalogue additions without a migration. The current shop's stock limits and reputation prices still apply.

## Adaptations and rules

These are campaign adaptations, with local prices and no new attunement requirements. Existing tabletop/BG3 rules are not reproduced wholesale. Item descriptions state implemented effects:

- Vicious weapons use the 2014 flat **7 additional damage on a critical**, applied once after critical dice. Silvered weapons use the existing silver bypass rules.
- Flame Tongue and Frost Brand variants have their listed elemental damage; Frost Brand also grants fire resistance. They do not add activation, extinguishing, light-radius or weather simulation.
- Longbow of Warning grants the wielder surprise immunity and +2 initiative. It does not implement tabletop initiative advantage or a party-wide warning aura.
- Everburn Blade adds 1d4 fire to weapon hits without an attack enchantment bonus. Its visual fire has no world-light effect.
- Gold Wyrmling Staff grants +1 attacks/damage, 1d4 fire and Fire Bolt while wielded. The granted spell uses Intelligence unless already learned as a cantrip.
- Knife of the Undermountain King grants +2 and critical range 19–20 while wielded. It does not add low-damage rerolls or obscured-target advantage.
- Sorrow grants +1 and an **action** Thorn Whip, using Wisdom unless already learned. This is not BG3's bonus-action Sorrowful Lash.
- Phalar Aluve grants +1, finesse and +1 Performance. Sing/Shriek auras are not implemented.
- Defender Flail grants +1 and +1 AC while wielded, without BG3's flat physical damage reduction.
- Weapon-granted cantrips appear alongside existing prepared magic, disappear on unequip, and never consume a learned or prepared choice. Ordinary casting restrictions and actions still apply.
- Second Wind Draught grants 1d6+4 temporary HP (no stacking); Clearhead Tonic removes poisoned and frightened. Both are consumed on successful use.

## References

The mundane table was already complete for this game's equipment system, so the handbook expansion focuses on silvered and magical variants. Reference material: [D&D 2014 equipment](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/equipment), [2024 equipment](https://www.dndbeyond.com/sources/dnd/br-2024/equipment), [magic items](https://www.dndbeyond.com/sources/dnd/br-2024/magic-items-a-z). BG3 references: [Everburn Blade](https://bg3.wiki/wiki/Everburn_Blade), [Gold Wyrmling Staff](https://bg3.wiki/wiki/Gold_Wyrmling_Staff), [Undermountain knife](https://bg3.wiki/wiki/Knife_of_the_Undermountain_King), [Sorrow](https://bg3.wiki/wiki/Sorrow), [Phalar Aluve](https://bg3.wiki/wiki/Phalar_Aluve), [Defender Flail](https://bg3.wiki/wiki/Defender_Flail). Descriptions and pixel art are original.

## Verification

- `node tools/armory-check.mjs`: catalogue coverage, directional frames, shop reachability, equip/unequip and JSON restoration, prepared spell coexistence, critical damage, AC and resistance.
- `node tools/armory-playtest.mjs [output] [scale]`: isolated Edge campaign; actual keyboard purchase/equip, inventory, consumables, melee hit and equipment cantrip casting. Scale 2 is 800×480, scale 3 is 1200×720. Full silhouette and pose galleries saved beside reports.
- `node tools/armory-preview-check.mjs [output] [scale]`: equipment-spell accuracy in the character sheet and spellbook versus a normally learned cantrip, unequip removal, and staff-only fighter spellbook access. The header says Base atk; individual spells show their actual attack bonus.
- `node tools/creator-skill-run.mjs --armory --out output/armory/skill`: original develop-web-game input/screenshot client on a disposable origin.
- `node tools/combat-large-playtest.mjs output/armory/combat-regression`: existing melee/AoE/large-monster camera checks.

The player's paused wizard campaign is not used for testing. Full campaign balance, every historical save and long-session performance are not established by these bounded checks.

Final result: **critic 8.4 → 8.7, PASS** (attempt 2/3). Ten grouped rule checks, eleven browser checks at each size, both focused spell-preview runs, the required game client, and all 37 broader combat checks passed. No browser/draw errors were recorded. The critic's sole blocking defect—incorrect equipment-spell accuracy previews—was fixed and independently verified. A separate concern about high-level ability-score reconstruction in the existing spellcasting code is recorded in `progress.md` for follow-up; this review does not certify that calculation.
