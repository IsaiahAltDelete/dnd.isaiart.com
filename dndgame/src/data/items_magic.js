// data/items_magic.js — the magical half of the item catalogue: published D&D
// wondrous items, weapons, armour, wands, rods and staves, the Sword Coast
// uniques out of Wave Echo Cave and Waterdeep, the party-level rarity gate, and
// the CR-banded treasure tables that rules/scaling.js rolls against.
//
// Pure data. The only import is the mundane catalogue next door (items_gear.js),
// used so that a "+1 Longsword" inherits the real longsword's die, properties and
// Weapon Mastery instead of a hand-copied guess. No logic beyond the small pure
// builders at the top and the two query helpers at the bottom.
//
// ---------------------------------------------------------------------------
// SHAPES
// ---------------------------------------------------------------------------
// Every entry:
//   { id, name, kind, slot?, desc, cost, weight, rarity, attunement, icon, tint,
//     stack, sellable, magical:true }
//
// Weapons add the base weapon fields plus:
//   magic: { atk:+n, dmg:+n, bonusDice:'1d6', bonusType:'fire', onHit:{...} }
//   — `atk`/`dmg`/`bonusDice`/`bonusType` are read by rules/character.js.
//     Conditional extra damage ("only against dragons") goes in
//     mech.bonusDamage instead, where it carries its own `vs` tag.
//
// Wearables add:
//   mech: { ... }   — merged by character.mechOf() ONLY while equipped (and, for
//                     items flagged `attunement`, only while attuned).
//
// Charged items add:
//   charges:n (also the starting value seeded onto an instance),
//   recharge:'dawn'|'dusk'|'long'|'short'|'week'|'never', rechargeDice:'1d6+1',
//   use:{ kind:'spell'|'heal'|'cure'|'buff'|'temphp'|'utility'|'throw', ... },
//   consumable:false — a hint that spending a charge must NOT destroy the item.
//
// mech vocabulary (SPEC §3 plus the extras rules/character.js merges):
//   asi setAbility speedBonus speedPenalty flySpeed swimSpeed climbSpeed
//   burrowSpeed darkvision blindsight truesight tremorsense hpPerLevel
//   maxHpBonus acBonus saveBonus initiativeBonus spellDcBonus spellAtkBonus
//   atkBonus meleeAtkBonus rangedAtkBonus dmgBonus meleeDmgBonus rangedDmgBonus
//   extraAttack critRange carryMult jumpMult profToInitiative resist immune vuln
//   condImmune advSaveVs advVs advSkill skillProf skillExpertise toolProf
//   weaponProf armorProf saveProf languageProf skillBonus saveBonusBy acFormula
//   naturalWeapon cantrip spellPerRest resource breathWeapon bonusDamage
//   grantFeat passive
//
// NOTE ON SLOTS: the engine's slot list (rules/character.js SLOT_LIST) has no
// belt or waist slot, so belts, sashes, brooches, periapts, medallions, scarabs,
// talismans and ioun stones all ride in the generic worn-trinket slot `amulet`.
// Bracers and gauntlets use `gloves`; circlets, headbands, hats, goggles and
// lenses use `helm`.
//
// NOTE ON RARITY: published rarities are used throughout, even where they differ
// from a designer's shorthand (Bag of Tricks is Uncommon, Oil of Sharpness and
// Ring of Regeneration are Very Rare, a Belt of Hill Giant Strength is Rare).

import { GEAR } from './items_gear.js';

// ---------------------------------------------------------------------------
// deepFreeze — recursive Object.freeze for exported catalogues (HARD RULE 8).
// ---------------------------------------------------------------------------
function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const k of Object.keys(o)) deepFreeze(o[k]);
  }
  return o;
}

// ---------------------------------------------------------------------------
// Builders. Pure; they exist only so ~190 entries stay structurally identical.
// ---------------------------------------------------------------------------

/** Base entry. Anything in `o` overrides; unknown keys pass straight through. */
function mk(id, name, o = {}) {
  const {
    desc = '', kind = 'gear', slot = null, cost = 0, weight = 0,
    rarity = 'uncommon', attunement = false, icon = 'gem', tint = '#c07af0',
    stack = false, sellable = true, ...rest
  } = o;
  const e = {
    id, name, kind, desc, cost, weight, rarity,
    attunement: !!attunement, icon, tint, stack, sellable, magical: true, ...rest,
  };
  if (slot) e.slot = slot;
  return e;
}

/** A worn wondrous item: cloak, boots, gloves, helm, amulet, ring... */
function wond(id, name, slot, o = {}) {
  const kindBySlot = {
    cloak: 'cloak', boots: 'boots', gloves: 'gloves', helm: 'helm',
    amulet: 'amulet', ring: 'ring', armor: 'armor', shield: 'shield',
  };
  return mk(id, name, { kind: kindBySlot[slot] || 'gear', slot, ...o });
}

/** A magic weapon built on a mundane base, inheriting die/props/mastery. */
function magicWeapon(id, name, baseId, o = {}) {
  const b = GEAR[baseId] || {};
  return mk(id, name, {
    kind: 'weapon', slot: 'mainHand',
    icon: b.icon || 'sword', tint: '#c9d2e0',
    category: b.category || 'martial',
    die: b.die, dtype: b.dtype,
    props: (b.props || []).slice(),
    versatileDie: b.versatileDie || null,
    range: b.range || null,
    mastery: b.mastery || null,
    ammoType: b.ammoType || null,
    weight: b.weight ?? 3,
    baseItem: baseId,
    magic: { atk: 0, dmg: 0 },
    ...o,
  });
}

/** A magic suit of armour or shield built on a mundane base. */
function magicArmor(id, name, baseId, o = {}) {
  const b = GEAR[baseId] || {};
  const isShield = b.kind === 'shield';
  return mk(id, name, {
    kind: isShield ? 'shield' : 'armor',
    slot: isShield ? 'shield' : 'armor',
    icon: b.icon || (isShield ? 'shield' : 'armor'), tint: '#9aa4b4',
    ac: b.ac, addDex: b.addDex !== false, dexCap: b.dexCap ?? null,
    category: b.category || 'medium',
    strReq: b.strReq || 0, stealthDis: !!b.stealthDis,
    weight: b.weight ?? 20,
    baseItem: baseId,
    ...o,
  });
}

/** A wand: held in the off hand, spends charges, recharges at dawn. */
function wand(id, name, o = {}) {
  return mk(id, name, {
    kind: 'wand', slot: 'offHand', icon: 'wand', tint: '#c8a05a',
    weight: 1, recharge: 'dawn', consumable: false, ...o,
  });
}

/** A rod: held in the off hand. */
function rod(id, name, o = {}) {
  return mk(id, name, {
    kind: 'rod', slot: 'offHand', icon: 'staff', tint: '#8a6a44',
    weight: 2, consumable: false, ...o,
  });
}

/** A staff. In 5e a staff functions as a quarterstaff, so it is a weapon. */
function staff(id, name, o = {}) {
  return magicWeapon(id, name, 'quarterstaff', {
    icon: 'staff', tint: '#a07a4a', recharge: 'dawn', consumable: false, ...o,
  });
}

/** "+N Longsword" and friends, sharing the id shape items.js magicVariant uses. */
const PLUS_RARITY = { 1: 'uncommon', 2: 'rare', 3: 'very-rare' };
const PLUS_COST = { 1: 500, 2: 4000, 3: 22000 };
function plusWeapon(baseId, n, desc) {
  const b = GEAR[baseId] || {};
  return magicWeapon(`${baseId}-plus${n}`, `+${n} ${b.name || baseId}`, baseId, {
    rarity: PLUS_RARITY[n], cost: PLUS_COST[n] + (b.cost || 0), desc,
    magic: { atk: n, dmg: n }, plus: n,
  });
}
function plusArmor(baseId, n, desc) {
  const b = GEAR[baseId] || {};
  return magicArmor(`${baseId}-plus${n}`, `+${n} ${b.name || baseId}`, baseId, {
    rarity: PLUS_RARITY[n], cost: PLUS_COST[n] + (b.cost || 0), desc,
    ac: (b.ac || 0) + n, plus: n,
  });
}

// Every entry is pushed here and folded into MAGIC_ITEMS at the bottom.
const ALL = [];

// ===========================================================================
// 1. +N WEAPONS, ARMOUR AND SHIELDS
// The plainest magic in the Realms: good steel with a thread of the Weave folded
// into the billet. Smiths in Waterdeep and Neverwinter still turn them out.
// ===========================================================================

ALL.push(
  plusWeapon('longsword', 1, "A Neverwintan arming sword with a single silver wire laid down the fuller. It finds the gap in a mail shirt as if it remembered where the gap was."),
  plusWeapon('longsword', 2, "Twice-folded steel out of the Ironmaster forges, the pommel cut with a rune of Moradin. Blood will not stay on it."),
  plusWeapon('longsword', 3, "A blade so keen the air whines around the edge. Waterdhavian nobles have gone to law over swords like this one."),
  plusWeapon('shortsword', 1, "A soldier's shortsword rewrapped in white leather, the tang stamped by a Gauntlet armourer at Leilon."),
  plusWeapon('dagger', 1, "A slim, cold little knife that never quite warms to the hand that carries it. Zhentarim quartermasters buy them by the dozen."),
  plusWeapon('rapier', 2, "A duelling rapier with a swept guard of blued steel, made for a Waterdhavian who died before collecting it."),
  plusWeapon('greatsword', 2, "Six feet of Illuskan greatsword, the blade acid-etched with the prow of a longship. It swings lighter than it has any right to."),
  plusWeapon('mace', 1, "A flanged mace blessed at the Shrine of Luck, the head chased with Tymora's coin. It rings like a bell on impact."),
  plusWeapon('warhammer', 1, "A dwarven hammer of Battlehammer make, the haft banded in bronze against the shock of the blow."),
  plusWeapon('battleaxe', 1, "A bearded axe with a haft of black Neverwinter Wood ash. It bites deeper than the arm behind it explains."),
  plusWeapon('greataxe', 2, "An orc-cleaver taken off the field at Many-Arrows and rehafted twice since. The edge has never needed a stone."),
  plusWeapon('longbow', 2, "A yew stave cut in the Ardeep and strung with silk. Arrows loosed from it do not drift, even in a Sword Coast gale."),
  plusWeapon('shortbow', 1, "A short hunting bow with a horn nock, quiet as a held breath."),
  plusWeapon('spear', 1, "A lugged spear with a leaf-shaped head, carried by three generations of a Triboar Trail caravan guard family."),
  plusWeapon('scimitar', 2, "A Calishite curve of watered steel, the ripple in the blade running like smoke when it moves."),
  plusWeapon('quarterstaff', 1, "A shod staff of blackthorn, the ferrules worn bright. Every apprentice at Blackstaff Tower is issued one."),
  plusWeapon('handaxe', 1, "A woodsman's throwing axe that comes back to the hand you threw it with — provided you go and pick it up."),
  plusArmor('leather-armor', 1, "Boiled hide oiled with something that smells faintly of pine sap and lightning. Blades slide off the grain."),
  plusArmor('studded-leather', 1, "A studded jerkin whose rivets are all one continuous silver line, if you know how to read the pattern."),
  plusArmor('chain-shirt', 1, "A short hauberk of very fine riveted rings, light enough to wear under a merchant's coat and stiff enough to matter."),
  plusArmor('scale-mail', 1, "Overlapping plates lacquered a deep green, cut from the shed hide of something that lived in Kryptgarden."),
  plusArmor('breastplate', 2, "A Lords' Alliance officer's cuirass, the breast embossed with a rising sun and proof against a crossbow at ten paces."),
  plusArmor('chain-mail', 1, "A full hauberk in which every fourth ring is silver. It hangs heavier on the rack than it does on the shoulders."),
  plusArmor('half-plate', 2, "Half-plate out of the Neverwinter yards, the pauldrons shaped like breaking waves."),
  plusArmor('plate-armor', 3, "Full harness fit for a Vindicator of the Order of the Gauntlet, articulated so finely it whispers rather than clatters."),
  plusArmor('shield', 1, "A banded shield with the Lionshield blue lion still on the face, reinforced with a band of cold iron."),
  plusArmor('shield', 2, "A kite shield of pale wood and silver rim. Arrows that strike it fall away as though they had struck stone."),
  plusArmor('shield', 3, "A tower of a shield, its boss a snarling dwarf-face. The bearer feels the blows land somewhere far away."),
);

// ===========================================================================
// 2. UNCOMMON — the working magic of the Sword Coast
// ===========================================================================

ALL.push(
  mk('alchemy-jug', 'Alchemy Jug', {
    kind: 'tool', cost: 600, weight: 12, icon: 'flask', tint: '#b08a5a',
    desc: "A squat ceramic jug that fills, on command, with water, vinegar, honey, oil, beer, wine or mayonnaise. Caravan cooks on the Triboar Trail would kill for one.",
    charges: 1, recharge: 'dawn', consumable: false,
    use: { kind: 'utility', tag: 'alchemy-jug', cost: 'action' },
  }),
  wond('amulet-of-proof-against-detection', 'Amulet of Proof against Detection and Location', 'amulet', {
    cost: 800, weight: 1, attunement: true, icon: 'amulet', tint: '#6a7a8a',
    desc: "A flat disc of grey lead on a leather thong, cold to the touch. Harper agents wear them into Zhentarim country and take them off for nothing.",
    mech: { advSaveVs: ['divination'], passive: ['nondetection'] },
  }),
  mk('bag-of-holding', 'Bag of Holding', {
    kind: 'tool', cost: 500, weight: 15, icon: 'bag', tint: '#5a4a7a',
    desc: "A plain canvas sack whose inside is a pocket of the Astral Plane: five hundred pounds swallowed and still weighing fifteen. Do not put it inside another one.",
    use: { kind: 'utility', tag: 'extradimensional-bag', capacity: 500, volume: 64 },
    consumable: false,
  }),
  mk('bag-of-tricks-gray', 'Bag of Tricks (Gray)', {
    kind: 'tool', cost: 700, weight: 0.5, icon: 'bag', tint: '#8a8f98',
    desc: "A grey cloth bag holding two fuzzy objects the size of oranges. Thrown, each becomes a living beast that fights for you and vanishes at dawn.",
    charges: 3, recharge: 'dawn', consumable: false,
    use: { kind: 'utility', tag: 'bag-of-tricks', pool: ['weasel', 'giant-rat', 'badger', 'boar', 'panther', 'giant-badger', 'dire-wolf', 'giant-elk'] },
  }),
  wond('boots-of-elvenkind', 'Boots of Elvenkind', 'boots', {
    cost: 500, weight: 1, icon: 'boots', tint: '#5a7a4a',
    desc: "Soft green boots stitched by the Tel'Quessir of the Ardeep. Your steps make no sound at all, on gravel, on dry leaves, on a rotten stair.",
    mech: { advSkill: ['stealth'], passive: ['silent-steps'] },
  }),
  wond('boots-of-striding-and-springing', 'Boots of Striding and Springing', 'boots', {
    cost: 650, weight: 1, attunement: true, icon: 'boots', tint: '#a06a3a',
    desc: "Heavy-soled boots that keep your stride steady no matter the load, and turn any jump into a leap three times as long.",
    mech: { jumpMult: 3, passive: ['striding-springing'] },
  }),
  wond('boots-of-the-winterlands', 'Boots of the Winterlands', 'boots', {
    cost: 700, weight: 2, attunement: true, icon: 'boots', tint: '#bfe6ff',
    desc: "Fur-topped boots out of Icewind Dale. Snow crusts under them without breaking, and your feet stay warm down to forty below.",
    mech: { resist: ['cold'], passive: ['ignore-difficult-ice', 'cold-endurance'] },
  }),
  wond('bracers-of-archery', 'Bracers of Archery', 'gloves', {
    cost: 600, weight: 1, attunement: true, icon: 'bow', tint: '#7a5a3a',
    desc: "Wide leather bracers tooled with a running stag. The string never catches, and the shaft never wanders.",
    mech: { weaponProf: ['longbow', 'shortbow'], rangedDmgBonus: 2 },
  }),
  wond('brooch-of-shielding', 'Brooch of Shielding', 'amulet', {
    cost: 750, weight: 0, attunement: true, icon: 'star', tint: '#a9d8ff',
    desc: "A silver brooch set with a chip of clear quartz. Force itself parts around the wearer, and magic missiles simply stop.",
    mech: { resist: ['force'], immune: ['magic-missile'], passive: ['brooch-of-shielding'] },
  }),
  wond('cap-of-water-breathing', 'Cap of Water Breathing', 'helm', {
    cost: 400, weight: 0.5, icon: 'helm', tint: '#4fc8d8',
    desc: "A soft cap with a bubble of trapped air sewn into the lining. Underwater, speak the word and breathe as easily as on the docks of Neverwinter.",
    mech: { passive: ['water-breathing'] },
  }),
  wond('circlet-of-blasting', 'Circlet of Blasting', 'helm', {
    cost: 500, weight: 0.5, icon: 'crown', tint: '#ffd24a',
    desc: "A thin gold band with a sunburst at the brow, warm as a stone left in Flamerule light.",
    charges: 1, recharge: 'dawn', consumable: false,
    use: { kind: 'spell', spellId: 'guiding-bolt', level: 1, cost: 'action' },
  }),
  wond('cloak-of-elvenkind', 'Cloak of Elvenkind', 'cloak', {
    cost: 700, weight: 1, attunement: true, icon: 'cloak', tint: '#4a6a4a',
    desc: "The colour of the cloak shifts to match whatever is behind it — bark, stone, fog off the Mere. Pull the hood up and you are very nearly not there.",
    mech: { advSkill: ['stealth'], passive: ['cloak-of-elvenkind'] },
  }),
  wond('cloak-of-protection', 'Cloak of Protection', 'cloak', {
    cost: 800, weight: 1, attunement: true, icon: 'cloak', tint: '#8fa8d8',
    desc: "Plain grey wool with a silver clasp, the sort the Harpers hand out without ceremony. Blades land a finger's width wide of where they were aimed.",
    mech: { acBonus: 1, saveBonus: 1 },
  }),
  wond('cloak-of-the-manta-ray', 'Cloak of the Manta Ray', 'cloak', {
    cost: 450, weight: 2, icon: 'cloak', tint: '#3a6a8a',
    desc: "A slick grey cloak that spreads into broad fins in water. You breathe the sea and swim it faster than any sailor of Umberlee's coast.",
    mech: { swimSpeed: 60, passive: ['water-breathing'] },
  }),
  mk('decanter-of-endless-water', 'Decanter of Endless Water', {
    kind: 'tool', cost: 550, weight: 2, icon: 'flask', tint: '#5fb0d8',
    desc: "A stoppered flask that pours a stream, a fountain or a geyser of fresh water on command. Worth a caravan's weight in the Anauroch, worth a laugh in Neverwinter rain.",
    charges: 3, recharge: 'dawn', consumable: false,
    use: { kind: 'utility', tag: 'endless-water', modes: ['stream', 'fountain', 'geyser'] },
  }),
  mk('driftglobe', 'Driftglobe', {
    kind: 'tool', cost: 300, weight: 1, icon: 'star', tint: '#ffe9a8',
    desc: "A glass sphere the size of a fist that lights at a word and drifts along at your shoulder, obedient as a dog. Every Wave Echo Cave expedition takes three.",
    charges: 2, recharge: 'dawn', consumable: false,
    use: { kind: 'spell', spellId: 'daylight', level: 3, cost: 'action', tag: 'light' },
  }),
  mk('dust-of-disappearance', 'Dust of Disappearance', {
    kind: 'material', cost: 300, weight: 0, stack: true, icon: 'wind', tint: '#dfe6f0',
    desc: "A pinch of glittering powder in a folded paper. Thrown into the air, it takes you and everyone near you out of sight for a handful of minutes.",
    use: { kind: 'spell', spellId: 'invisibility', level: 2, cost: 'action' },
  }),
  mk('elemental-gem-blue-sapphire', 'Elemental Gem (Blue Sapphire)', {
    kind: 'gem', cost: 400, weight: 0, icon: 'gem', tint: '#3a7ad8',
    desc: "A flawed sapphire with a storm caught inside it. Break it and an air elemental steps out, bound to you for an hour and furious about it.",
    use: { kind: 'utility', tag: 'summon', monsterId: 'air-elemental', duration: '1 hour', cost: 'action' },
  }),
  mk('elemental-gem-red-corundum', 'Elemental Gem (Red Corundum)', {
    kind: 'gem', cost: 400, weight: 0, icon: 'gem', tint: '#e0503a',
    desc: "A red stone that is always warmer than the hand holding it. Shattered, it looses a fire elemental — mind where you stand.",
    use: { kind: 'utility', tag: 'summon', monsterId: 'fire-elemental', duration: '1 hour', cost: 'action' },
  }),
  mk('eversmoking-bottle', 'Eversmoking Bottle', {
    kind: 'tool', cost: 350, weight: 1, icon: 'flask', tint: '#6a6a72',
    desc: "A brass bottle with a lead stopper. Unstoppered, it vomits a choking cloud of smoke that keeps coming until somebody has the nerve to cork it.",
    consumable: false,
    use: { kind: 'spell', spellId: 'fog-cloud', level: 2, cost: 'action' },
  }),
  wond('eyes-of-the-eagle', 'Eyes of the Eagle', 'helm', {
    cost: 550, weight: 0, attunement: true, icon: 'eye', tint: '#e8d8a0',
    desc: "Crystal lenses in delicate gold frames. Through them a rider on the Triboar Trail a mile off is a face you could name.",
    mech: { advSkill: ['perception'], passive: ['eagle-sight'] },
  }),
  mk('figurine-silver-raven', 'Figurine of Wondrous Power (Silver Raven)', {
    kind: 'tool', cost: 450, weight: 1, icon: 'star', tint: '#c8d0dc',
    desc: "A silver raven the size of a thumb that wakes into a real bird at a word. The Harpers of Phandalin use them to carry messages nobody should read.",
    charges: 1, recharge: 'dawn', consumable: false,
    use: { kind: 'utility', tag: 'figurine', monsterId: 'raven', duration: '12 hours', cost: 'action' },
  }),
  wond('gauntlets-of-ogre-power', 'Gauntlets of Ogre Power', 'gloves', {
    cost: 750, weight: 2, attunement: true, icon: 'armor', tint: '#8a7a5a',
    desc: "Heavy leather gauntlets riveted with iron studs, big enough that the smallest hands still fill them. Doors that were locked stop being an argument.",
    mech: { setAbility: { str: 19 } },
  }),
  mk('gem-of-brightness', 'Gem of Brightness', {
    kind: 'gem', cost: 500, weight: 0, icon: 'gem', tint: '#fff4c0',
    desc: "A prism that glows, throws a beam, or flares hard enough to blind a room. Miners in the Sword Mountains prize them over lanterns for exactly one reason: no smoke.",
    charges: 50, recharge: 'never', consumable: false,
    use: { kind: 'utility', tag: 'gem-of-brightness', save: { ability: 'con', dc: 15 }, effect: 'blinded', cost: 'action' },
  }),
  wond('gloves-of-missile-snaring', 'Gloves of Missile Snaring', 'gloves', {
    cost: 600, weight: 0, attunement: true, icon: 'target', tint: '#7a6a8a',
    desc: "Thin leather gloves that itch faintly whenever something is loosed at you. Arrows arrive in your palm rather than your chest.",
    mech: { passive: ['missile-snaring'] },
  }),
  wond('gloves-of-swimming-and-climbing', 'Gloves of Swimming and Climbing', 'gloves', {
    cost: 500, weight: 0, attunement: true, icon: 'foot', tint: '#4a8a8a',
    desc: "Webbed grey gloves that grip wet rock as readily as dry. The Neverwinter dockhands who own them do not advertise it.",
    mech: { swimSpeed: 30, climbSpeed: 30, advSkill: ['athletics'] },
  }),
  wond('goggles-of-night', 'Goggles of Night', 'helm', {
    cost: 500, weight: 0, icon: 'eye', tint: '#2a4a3a',
    desc: "Smoked crystal in a brass frame. Put them on and the dark of a Sword Mountains tunnel turns to grey daylight sixty feet out.",
    mech: { darkvision: 60 },
  }),
  wond('hat-of-disguise', 'Hat of Disguise', 'helm', {
    cost: 600, weight: 0.5, attunement: true, icon: 'helm', tint: '#7a4a6a',
    desc: "A floppy felt hat with a bent pheasant feather. While you wear it you can look like anyone your size — a Redbrand, a Lord of Waterdeep, your own dead brother.",
    consumable: false,
    use: { kind: 'spell', spellId: 'disguise-self', level: 1, cost: 'action' },
    mech: { passive: ['at-will-disguise'] },
  }),
  wond('hat-of-wizardry', 'Hat of Wizardry', 'helm', {
    cost: 500, weight: 0.5, attunement: true, icon: 'helm', tint: '#4a3a7a',
    desc: "A moth-eaten pointed hat that smells of chalk and old ink. It serves as an arcane focus and coughs up one cantrip you never learned.",
    charges: 1, recharge: 'dawn', consumable: false,
    mech: { cantrip: { choose: 'wizard', ability: 'int' }, passive: ['arcane-focus'] },
  }),
  wond('headband-of-intellect', 'Headband of Intellect', 'helm', {
    cost: 800, weight: 0.5, attunement: true, icon: 'crown', tint: '#5a7ad8',
    desc: "A plain silver band that sits cool on the brow. Wearing it, a mule-driver can argue Netherese conjugation with a Blackstaff apprentice.",
    mech: { setAbility: { int: 19 } },
  }),
  wond('helm-of-comprehending-languages', 'Helm of Comprehending Languages', 'helm', {
    cost: 400, weight: 3, icon: 'helm', tint: '#a8b0bc',
    desc: "An open-faced steel helm with a band of Dethek runes around the brow. Every tongue you hear arrives already translated.",
    consumable: false,
    use: { kind: 'spell', spellId: 'comprehend-languages', level: 1, cost: 'action' },
    mech: { passive: ['comprehend-languages'] },
  }),
  rod('immovable-rod', 'Immovable Rod', {
    cost: 500, weight: 2, rarity: 'uncommon', icon: 'staff', tint: '#7a7f88',
    desc: "A flat iron bar with a button at one end. Press it and the rod simply stops — fixed in the air, holding eight thousand pounds, indifferent to the world turning under it.",
    use: { kind: 'utility', tag: 'immovable-rod', hold: 8000, cost: 'action' },
  }),
  magicWeapon('javelin-of-lightning', 'Javelin of Lightning', 'javelin', {
    cost: 700, rarity: 'uncommon', icon: 'spear', tint: '#8fd0ff',
    desc: "A javelin of blued steel with a hairline of copper spiralling the shaft. Speak the word as you throw and it becomes a bolt of lightning in flight.",
    magic: { atk: 0, dmg: 0 },
    charges: 1, recharge: 'dawn', consumable: false,
    use: { kind: 'spell', spellId: 'lightning-bolt', level: 3, cost: 'action' },
  }),
  mk('keoghtoms-ointment', "Keoghtom's Ointment", {
    kind: 'potion', cost: 400, weight: 0.5, stack: true, icon: 'flask', tint: '#c8e0a8',
    desc: "A pot of thick, sweet-smelling grease. A dose closes wounds, ends a poison, and cures a disease — Sister Garaele keeps one under the altar for bad tendays.",
    charges: 3, recharge: 'never',
    use: { kind: 'heal', dice: '2d8+2', conditions: ['poisoned', 'diseased'], cost: 'action' },
  }),
  mk('lantern-of-revealing', 'Lantern of Revealing', {
    kind: 'tool', cost: 500, weight: 2, icon: 'candle', tint: '#d8e8ff',
    desc: "A hooded lantern whose flame burns a cold blue. Nothing invisible stays invisible inside its light — a fact that has saved more than one Undermountain expedition.",
    consumable: false,
    use: { kind: 'utility', tag: 'reveal-invisible', bright: 30, dim: 60, cost: 'action' },
  }),
  magicArmor('mariners-armor', "Mariner's Armor", 'scale-mail', {
    cost: 600, rarity: 'uncommon', tint: '#3a7a8a',
    desc: "Scale lacquered in fish-green and worked with a wave motif, made in the Neverwinter yards. It floats — and so, therefore, do you.",
    stealthDis: false,
    mech: { swimSpeed: 30, passive: ['water-breathing', 'buoyant'] },
  }),
  wond('medallion-of-thoughts', 'Medallion of Thoughts', 'amulet', {
    cost: 550, weight: 0.5, attunement: true, icon: 'amulet', tint: '#b07af0',
    desc: "A silver medallion showing a closed eye. Three times a day it opens somebody else's head to you for a minute.",
    charges: 3, recharge: 'dawn', consumable: false,
    use: { kind: 'spell', spellId: 'detect-thoughts', level: 2, cost: 'action' },
  }),
  magicArmor('mithral-half-plate', 'Mithral Half Plate', 'half-plate', {
    cost: 900, rarity: 'uncommon', tint: '#cfd8e8',
    desc: "Half-plate beaten from true mithral out of the old Delzoun holds: as light as a linen shirt and utterly silent. The strength of a giant is not required.",
    strReq: 0, stealthDis: false,
    mech: { passive: ['mithral'] },
  }),
  magicArmor('mithral-chain-mail', 'Mithral Chain Mail', 'chain-mail', {
    cost: 900, rarity: 'uncommon', tint: '#cfd8e8',
    desc: "A hauberk of silver-white rings that weighs a third of what the eye insists. Dwarven smiths of Mirabar still argue over who last made one.",
    strReq: 0, stealthDis: false,
    mech: { passive: ['mithral'] },
  }),
  wond('necklace-of-adaptation', 'Necklace of Adaptation', 'amulet', {
    cost: 700, weight: 0.5, attunement: true, icon: 'amulet', tint: '#7ad8c0',
    desc: "A chain of small silver links, each one a tiny bellows. You breathe normally in water, in vacuum, and in whatever the Mere of Dead Men is exhaling today.",
    mech: { immune: ['inhaled-poison'], passive: ['adaptation', 'water-breathing'] },
  }),
  mk('pearl-of-power', 'Pearl of Power', {
    kind: 'gem', cost: 800, weight: 0, attunement: true, icon: 'gem', tint: '#f0e8f8',
    desc: "A pearl the size of a musket ball, warm and faintly luminous. Once a day, roll it in your palm and a spent spell slot comes back to you.",
    charges: 1, recharge: 'dawn', consumable: false,
    use: { kind: 'utility', tag: 'restore-slot', maxLevel: 3, cost: 'bonus' },
  }),
  wond('periapt-of-wound-closure', 'Periapt of Wound Closure', 'amulet', {
    cost: 700, weight: 0.5, attunement: true, icon: 'heart', tint: '#e05a7a',
    desc: "A dark red gem in a plain setting. Wounds stop bleeding of their own accord, and a hit die spent on rest goes twice as far.",
    mech: { passive: ['wound-closure', 'stabilize-self'] },
  }),
  mk('pipes-of-haunting', 'Pipes of Haunting', {
    kind: 'tool', cost: 550, weight: 2, icon: 'wind', tint: '#6a6a8a',
    desc: "A set of reed pipes cut from the yew groves near Conyberry. The tune they play is not a tune, and things that hear it leave.",
    charges: 3, recharge: 'dawn', consumable: false,
    use: { kind: 'spell', spellId: 'fear', level: 3, cost: 'action' },
  }),
  wond('ring-of-jumping', 'Ring of Jumping', 'ring', {
    cost: 450, weight: 0, attunement: true, icon: 'ring', tint: '#7ac06a',
    desc: "A copper ring shaped like a coiled frog. Bend the knees and the ground lets go of you three times as easily as it should.",
    mech: { jumpMult: 3 },
    charges: 3, recharge: 'dawn', consumable: false,
    use: { kind: 'spell', spellId: 'jump', level: 1, cost: 'bonus' },
  }),
  wond('ring-of-mind-shielding', 'Ring of Mind Shielding', 'ring', {
    cost: 700, weight: 0, attunement: true, icon: 'ring', tint: '#8a8ad8',
    desc: "A band of dull grey metal that shows no reflection. Nothing reads your thoughts, nothing compels the truth from you, and nothing knows your alignment — useful when doppelgangers are about.",
    mech: { immune: ['thought-detection'], passive: ['mind-shielded'] },
  }),
  wond('ring-of-swimming', 'Ring of Swimming', 'ring', {
    cost: 400, weight: 0, icon: 'ring', tint: '#4fa8d8',
    desc: "A ring of green sea-glass in a silver mount, dredged out of the Mere. The water simply agrees with you.",
    mech: { swimSpeed: 40 },
  }),
  wond('ring-of-warmth', 'Ring of Warmth', 'ring', {
    cost: 450, weight: 0, attunement: true, icon: 'ring', tint: '#e08a3a',
    desc: "A red gold ring that never goes cold. You can sleep bare on the ice of Icespire Peak and wake with your fingers.",
    mech: { resist: ['cold'], passive: ['cold-endurance'] },
  }),
  wond('ring-of-water-walking', 'Ring of Water Walking', 'ring', {
    cost: 500, weight: 0, icon: 'ring', tint: '#8fd0ff',
    desc: "A pale ring cut with a ripple pattern. Rivers, marshes, mud and Neverwinter's flooded cellars all become floor.",
    mech: { passive: ['water-walk'] },
    use: { kind: 'spell', spellId: 'water-walk', level: 3, cost: 'action' },
    consumable: false,
  }),
  rod('rod-of-the-pact-keeper-plus1', 'Rod of the Pact Keeper +1', {
    cost: 900, rarity: 'uncommon', attunement: true, tint: '#7a3a7a',
    desc: "A black rod carved with the sigil of a patron who is not named aloud. It sharpens the pact-magic and, once between rests, gives back a slot.",
    mech: { spellDcBonus: 1, spellAtkBonus: 1, class: 'warlock' },
    charges: 1, recharge: 'short',
    use: { kind: 'utility', tag: 'restore-pact-slot', cost: 'bonus' },
  }),
  mk('rope-of-climbing', 'Rope of Climbing', {
    kind: 'tool', cost: 450, weight: 3, icon: 'bag', tint: '#c8b088',
    desc: "Sixty feet of silk rope that knots, unknots, coils and climbs on command. It will hold three thousand pounds and never once ask why.",
    consumable: false,
    use: { kind: 'utility', tag: 'rope-of-climbing', length: 60, cost: 'action' },
  }),
  mk('sending-stones', 'Sending Stones', {
    kind: 'gem', cost: 500, weight: 1, stack: false, icon: 'gem', tint: '#a8d8c0',
    desc: "A matched pair of smooth green stones. Hold one and speak twenty-five words to whoever holds the other, wherever in Faerûn they are. The Harpers run half their network on these.",
    charges: 1, recharge: 'dawn', consumable: false,
    use: { kind: 'spell', spellId: 'sending', level: 3, cost: 'action' },
  }),
  wond('slippers-of-spider-climbing', 'Slippers of Spider Climbing', 'boots', {
    cost: 650, weight: 0.5, attunement: true, icon: 'boots', tint: '#3a3a4a',
    desc: "Soft black slippers with soles like a spider's foot. Walls and ceilings become floors — as the Black Spider's people well know.",
    mech: { climbSpeed: 30, passive: ['spider-climb'] },
  }),
  staff('staff-of-the-adder', 'Staff of the Adder', {
    cost: 550, rarity: 'uncommon', attunement: true, tint: '#4a7a3a', icon: 'staff',
    desc: "A blackwood staff whose head is carved as a serpent. Speak the word and the carving becomes a living adder, biting for you, until you speak it again.",
    magic: { atk: 1, dmg: 1 },
    charges: 1, recharge: 'dawn',
    mech: { bonusDamage: [{ dice: '1d6', type: 'poison', when: 'adder-active' }] },
    use: { kind: 'buff', tag: 'adder-head', duration: '1 minute', cost: 'bonus' },
  }),
  staff('staff-of-the-python', 'Staff of the Python', {
    cost: 600, rarity: 'uncommon', attunement: true, tint: '#6a5a3a', icon: 'staff',
    desc: "A knotted staff that becomes a giant constrictor snake when thrown to the ground, and a staff again when you need to lean on something.",
    magic: { atk: 0, dmg: 0 },
    charges: 1, recharge: 'dawn',
    use: { kind: 'utility', tag: 'summon', monsterId: 'giant-constrictor-snake', duration: '1 hour', cost: 'action' },
  }),
  mk('stone-of-good-luck', 'Stone of Good Luck (Luckstone)', {
    kind: 'gem', cost: 800, weight: 0, attunement: true, icon: 'star', tint: '#ffd24a',
    desc: "A polished agate the colour of honey, blessed on Tymora's altar. Everything you try goes very slightly better than it deserves to.",
    slot: 'amulet',
    mech: { saveBonus: 1, passive: ['luckstone'] },
  }),
  magicWeapon('trident-of-fish-command', 'Trident of Fish Command', 'trident', {
    cost: 500, rarity: 'uncommon', attunement: true, tint: '#4fa8d8', icon: 'spear',
    desc: "A brass trident crusted with old salt, taken from a shrine of Umberlee on the Sword Coast. Beasts of the water obey the hand that holds it.",
    magic: { atk: 0, dmg: 0 },
    charges: 3, recharge: 'dawn', consumable: false,
    use: { kind: 'spell', spellId: 'dominate-beast', level: 4, cost: 'action', restrict: 'beast-water' },
  }),
  wand('wand-of-magic-detection', 'Wand of Magic Detection', {
    cost: 450, rarity: 'uncommon', tint: '#8fd0ff',
    desc: "A slim rowan wand that flushes faintly blue near enchantment. Every serious tomb-robber on the Sword Coast owns one or wishes they did.",
    charges: 3, rechargeDice: '1d3',
    use: { kind: 'spell', spellId: 'detect-magic', level: 1, cost: 'action' },
  }),
  wand('wand-of-magic-missiles', 'Wand of Magic Missiles', {
    cost: 800, rarity: 'uncommon', tint: '#b07af0',
    desc: "A short ebony wand banded in silver, the tip pitted from use. Three darts of pure force leap from it and do not miss.",
    charges: 7, rechargeDice: '1d6+1',
    use: { kind: 'spell', spellId: 'magic-missile', level: 1, cost: 'action' },
  }),
  wand('wand-of-secrets', 'Wand of Secrets', {
    cost: 450, rarity: 'uncommon', tint: '#c8a05a',
    desc: "A hazel wand that twitches toward hidden doors and pulls hard toward hidden traps. Undermountain has broken many; it has also saved many.",
    charges: 3, rechargeDice: '1d3',
    use: { kind: 'utility', tag: 'detect-secret-doors', range: 30, cost: 'action' },
  }),
  wand('wand-of-the-war-mage-plus1', 'Wand of the War Mage, +1', {
    cost: 800, rarity: 'uncommon', attunement: true, tint: '#5a7ad8',
    desc: "A battle-wand of the sort issued to Neverwinter's arcane brigade: iron-cored, leather-wrapped, and unbothered by cover.",
    mech: { spellAtkBonus: 1, passive: ['ignore-half-cover'] },
    consumable: false,
  }),
  wand('wand-of-web', 'Wand of Web', {
    cost: 750, rarity: 'uncommon', attunement: true, tint: '#dfe6f0',
    desc: "A pale wand strung with a fine grey filament. Nezznar's people carry a dozen of them into Wave Echo Cave and use them liberally.",
    charges: 7, rechargeDice: '1d6+1',
    use: { kind: 'spell', spellId: 'web', level: 2, cost: 'action' },
  }),
  magicWeapon('weapon-of-warning', 'Weapon of Warning', 'longsword', {
    cost: 700, rarity: 'uncommon', attunement: true, tint: '#e8d8a0',
    desc: "A blade that hums in the scabbard a half-second before the ambush breaks. Caravan captains on the Triboar Trail pay stupid money for one.",
    magic: { atk: 0, dmg: 0 },
    mech: { condImmune: ['surprised'], passive: ['adv-initiative', 'wake-on-danger'] },
  }),
  mk('wind-fan', 'Wind Fan', {
    kind: 'tool', cost: 350, weight: 1, icon: 'wind', tint: '#cfe0f0',
    desc: "A folding fan of painted silk. Snapped open, it throws a gale — very good for clearing gas, very bad for holding a torch.",
    charges: 1, recharge: 'dawn', consumable: false,
    use: { kind: 'spell', spellId: 'gust-of-wind', level: 2, cost: 'action' },
  }),
  wond('winged-boots', 'Winged Boots', 'boots', {
    cost: 900, weight: 2, attunement: true, icon: 'boots', tint: '#e8e0c8',
    desc: "White boots with small feathered wings at the heel that beat when you leave the ground. Four hours of flight a day, and no more; the fall afterwards is ordinary.",
    mech: { flySpeed: 30 },
    charges: 4, recharge: 'dawn', consumable: false,
    use: { kind: 'buff', tag: 'winged-flight', duration: '1 hour', cost: 'bonus' },
  }),
);

// ===========================================================================
// 3. RARE — what a name gets buried with
// ===========================================================================

ALL.push(
  wond('amulet-of-health', 'Amulet of Health', 'amulet', {
    cost: 6000, weight: 1, rarity: 'rare', attunement: true, icon: 'heart', tint: '#d05a5a',
    desc: "A heavy ruby cabochon on a gold chain, beating very faintly against the breastbone. The frailest scholar wears it and stops being frail.",
    mech: { setAbility: { con: 19 } },
  }),
  mk('arrow-of-dragon-slaying', 'Arrow of Dragon Slaying', {
    kind: 'ammo', cost: 2500, weight: 0.05, stack: true, rarity: 'rare',
    icon: 'bow', tint: '#e8b04a', slot: 'ammo', ammoType: 'arrow',
    desc: "A silvered shaft fletched with wyvern quill and graven with a single Draconic word: *end*. It is only ever used once, and it is remembered afterwards.",
    magic: { atk: 0, dmg: 0, slayVs: 'dragon', slayDamage: '6d10', slaySave: { ability: 'con', dc: 17 } },
  }),
  wond('belt-of-hill-giant-strength', 'Belt of Hill Giant Strength', 'amulet', {
    cost: 8000, weight: 3, rarity: 'rare', attunement: true, icon: 'armor', tint: '#8a7a4a',
    desc: "A broad belt of crudely tanned hide with a boulder for a buckle. Hill giants out of the Dessarin make them; they do not make them well, and they do not need to.",
    mech: { setAbility: { str: 21 } },
  }),
  magicWeapon('berserker-axe', 'Berserker Axe', 'greataxe', {
    cost: 5000, rarity: 'rare', attunement: true, tint: '#a03a3a', icon: 'axe',
    desc: "A notched Uthgardt axe, the haft wrapped in hair. It makes its bearer hardier and angrier in exactly equal measure, and it does not like being put down.",
    magic: { atk: 1, dmg: 1 },
    mech: { hpPerLevel: 1, passive: ['cursed', 'berserker-rage'] },
    cursed: true,
  }),
  wond('boots-of-levitation', 'Boots of Levitation', 'boots', {
    cost: 4500, weight: 2, rarity: 'rare', attunement: true, icon: 'boots', tint: '#a8b8e8',
    desc: "Weightless grey boots that lift you straight up twenty feet at a thought, and hold you there while you decide what you have done.",
    consumable: false,
    use: { kind: 'spell', spellId: 'levitate', level: 2, cost: 'action' },
    mech: { passive: ['at-will-levitate'] },
  }),
  wond('boots-of-speed', 'Boots of Speed', 'boots', {
    cost: 5500, weight: 1, rarity: 'rare', attunement: true, icon: 'run', tint: '#e8c04a',
    desc: "Click the heels together and small blue wings unfold at the ankle: your speed doubles and nobody gets a free swing at you as you go.",
    charges: 10, recharge: 'dawn', consumable: false,
    use: { kind: 'buff', tag: 'boots-of-speed', duration: '1 minute', cost: 'bonus' },
    mech: { passive: ['boots-of-speed'] },
  }),
  wond('bracers-of-defense', 'Bracers of Defense', 'gloves', {
    cost: 6000, weight: 1, rarity: 'rare', attunement: true, icon: 'armor', tint: '#b0a070',
    desc: "Matched bracers of dark leather and beaten bronze. They ward the wearer only while no armour and no shield are worn — which is exactly how a monk of Ilmater prefers it.",
    mech: { acBonus: 2, passive: ['unarmored-only'] },
  }),
  wond('cape-of-the-mountebank', 'Cape of the Mountebank', 'cloak', {
    cost: 5000, weight: 1, rarity: 'rare', icon: 'cloak', tint: '#7a3a5a',
    desc: "A theatrical cape of red and black that leaves a puff of smoke and a smell of brimstone where the wearer used to be standing.",
    charges: 1, recharge: 'dawn', consumable: false,
    use: { kind: 'spell', spellId: 'dimension-door', level: 4, cost: 'action' },
  }),
  mk('chime-of-opening', 'Chime of Opening', {
    kind: 'tool', cost: 3500, weight: 1, rarity: 'rare', icon: 'key', tint: '#c8b088',
    desc: "A hollow mithral tube that, struck, sounds a note only locks can hear. Ten strikes and it cracks — Undermountain has eaten hundreds.",
    charges: 10, recharge: 'never', consumable: false,
    use: { kind: 'spell', spellId: 'knock', level: 2, cost: 'action' },
  }),
  wond('cloak-of-displacement', 'Cloak of Displacement', 'cloak', {
    cost: 7000, weight: 1, rarity: 'rare', attunement: true, icon: 'cloak', tint: '#5a4a8a',
    desc: "A cloak of shifting violet that makes you appear to stand a pace from where you are. The illusion fails the moment you are actually hurt, and returns on your turn.",
    mech: { passive: ['displacement'] },
  }),
  wond('cloak-of-the-bat', 'Cloak of the Bat', 'cloak', {
    cost: 6500, weight: 1, rarity: 'rare', attunement: true, icon: 'cloak', tint: '#3a2a3a',
    desc: "Black leather cut in a scalloped hem. In dim light you climb like a bat, hide like a bat, and — for a few beating minutes — fly like one.",
    mech: { climbSpeed: 30, flySpeed: 40, advSkill: ['stealth'] },
    charges: 1, recharge: 'dawn', consumable: false,
    use: { kind: 'buff', tag: 'bat-form', duration: '1 hour', cost: 'action' },
  }),
  magicWeapon('dagger-of-venom', 'Dagger of Venom', 'dagger', {
    cost: 4000, rarity: 'rare', tint: '#5aa04a', icon: 'dagger',
    desc: "A black-bladed dagger with a hollow groove down the spine. On command it sweats a thick green poison that clings for a full minute.",
    magic: { atk: 1, dmg: 1 },
    charges: 1, recharge: 'dawn', consumable: false,
    use: { kind: 'buff', tag: 'venom-coat', duration: '1 minute', cost: 'action' },
    mech: { bonusDamage: [{ dice: '2d10', type: 'poison', when: 'venom-coat', save: { ability: 'con', dc: 15 }, effect: 'poisoned' }] },
  }),
  magicWeapon('dragon-slayer', 'Dragon Slayer', 'longsword', {
    cost: 8000, rarity: 'rare', tint: '#e8b04a', icon: 'sword',
    desc: "A broad-bladed longsword with a wyrm's head for a pommel, forged after Claugiyliamatar last came out of Kryptgarden. Against dragonkind it is a different weapon entirely.",
    magic: { atk: 1, dmg: 1 },
    mech: { bonusDamage: [{ dice: '3d6', type: 'slashing', vs: 'dragon' }] },
  }),
  magicArmor('elven-chain', 'Elven Chain', 'chain-shirt', {
    cost: 6000, rarity: 'rare', tint: '#c8d8b0',
    desc: "A shirt of fine golden rings woven in the elven manner, worn under a shirt without a whisper. You wear it well whether you were trained to or not.",
    ac: 15, stealthDis: false,
    mech: { armorProf: ['light', 'medium'] },
  }),
  magicWeapon('flame-tongue', 'Flame Tongue', 'longsword', {
    cost: 7000, rarity: 'rare', attunement: true, tint: '#ff6a2a', icon: 'flame',
    desc: "Speak the command word and flames run the length of the blade, throwing light forty feet and burning what it cuts. A gift favoured by the priests of Lathander.",
    magic: { atk: 0, dmg: 0 },
    charges: 1, recharge: 'never', consumable: false,
    use: { kind: 'buff', tag: 'flame-tongue', duration: 'until dismissed', cost: 'bonus' },
    mech: { bonusDamage: [{ dice: '2d6', type: 'fire', when: 'flame-tongue' }], passive: ['light-40'] },
  }),
  mk('folding-boat', 'Folding Boat', {
    kind: 'tool', cost: 4000, weight: 4, rarity: 'rare', icon: 'chest', tint: '#8a6a44',
    desc: "A wooden box the length of a forearm that unfolds into a ten-foot rowboat, or a full-rigged twenty-four-foot ship. The Mere of Dead Men has drowned people who forgot the second command word.",
    charges: 3, recharge: 'dawn', consumable: false,
    use: { kind: 'utility', tag: 'folding-boat', cost: 'action' },
  }),
  mk('gem-of-seeing', 'Gem of Seeing', {
    kind: 'gem', cost: 5000, weight: 0, rarity: 'rare', attunement: true, icon: 'eye', tint: '#a9d8ff',
    desc: "A polished lens of clear beryl. Look through it and illusions come apart, invisible things stand plain, and the Ethereal presses close enough to touch.",
    slot: 'helm',
    charges: 3, recharge: 'dawn', consumable: false,
    use: { kind: 'spell', spellId: 'true-seeing', level: 6, cost: 'action' },
  }),
  magicArmor('glamoured-studded-leather', 'Glamoured Studded Leather', 'studded-leather', {
    cost: 5000, rarity: 'rare', tint: '#7a4a7a',
    desc: "Studded leather that will, at a word, look like any garment you please — a scholar's robe, a Waterdhavian ballgown, a Redbrand's scarlet cloak.",
    ac: 12,
    mech: { acBonus: 1, passive: ['glamoured'] },
    consumable: false,
    use: { kind: 'utility', tag: 'glamour', cost: 'bonus' },
  }),
  wond('helm-of-teleportation', 'Helm of Teleportation', 'helm', {
    cost: 7000, weight: 3, rarity: 'rare', attunement: true, icon: 'helm', tint: '#8a5ad8',
    desc: "An open helm of purple-sheened steel, the brow set with three studs of amethyst. Three times a day it puts you somewhere else entirely.",
    charges: 3, recharge: 'dawn', consumable: false,
    use: { kind: 'spell', spellId: 'teleport', level: 7, cost: 'action' },
  }),
  mk('horn-of-blasting', 'Horn of Blasting', {
    kind: 'tool', cost: 4500, weight: 2, rarity: 'rare', icon: 'wind', tint: '#c8a05a',
    desc: "A brass horn banded in silver. Blown, it looses a thirty-foot cone of thunder that deafens the survivors and shatters glass, stone and nerve.",
    charges: 1, recharge: 'dawn', consumable: false,
    use: { kind: 'spell', spellId: 'shatter', level: 4, cost: 'action' },
  }),
  mk('horn-of-valhalla-silver', 'Horn of Valhalla (Silver)', {
    kind: 'tool', cost: 6000, weight: 2, rarity: 'rare', icon: 'wind', tint: '#c8d0dc',
    desc: "A silver-mounted aurochs horn out of the Uthgardt lands. One long note and the spirits of dead warriors arrive, fight for an hour, and go.",
    charges: 1, recharge: 'week', consumable: false,
    use: { kind: 'utility', tag: 'summon-berserkers', count: 3, duration: '1 hour', cost: 'action' },
  }),
  mk('ioun-stone-protection', 'Ioun Stone (Protection)', {
    kind: 'gem', cost: 6000, weight: 0, rarity: 'rare', attunement: true, icon: 'star', tint: '#d0c0a0',
    desc: "A dusky rose prism that orbits your head at arm's length, always just out of the way. Netherese work, and older than Netheril says.",
    slot: 'amulet',
    mech: { acBonus: 1, passive: ['ioun-stone'] },
  }),
  mk('ioun-stone-reserve', 'Ioun Stone (Reserve)', {
    kind: 'gem', cost: 5500, weight: 0, rarity: 'rare', attunement: true, icon: 'star', tint: '#b07af0',
    desc: "A vibrant purple prism that stores a spell you cast into it and gives it back when you ask.",
    slot: 'amulet',
    charges: 3, recharge: 'never', consumable: false,
    mech: { passive: ['ioun-stone', 'spell-reserve'] },
    use: { kind: 'utility', tag: 'release-stored-spell', maxLevel: 3, cost: 'action' },
  }),
  mk('ioun-stone-awareness', 'Ioun Stone (Awareness)', {
    kind: 'gem', cost: 5500, weight: 0, rarity: 'rare', attunement: true, icon: 'star', tint: '#e8b04a',
    desc: "A dark blue rhomboid that circles the head slowly, watching what you are not watching. Nothing takes you unawares.",
    slot: 'amulet',
    mech: { condImmune: ['surprised'], passive: ['ioun-stone'] },
  }),
  magicWeapon('mace-of-disruption', 'Mace of Disruption', 'mace', {
    cost: 8000, rarity: 'rare', attunement: true, tint: '#fff0c0', icon: 'mace',
    desc: "A mace of white ash bound in silver, blessed in the name of Kelemvor. Undead struck by it burn from within, and the weakest of them simply stop existing.",
    magic: { atk: 1, dmg: 1 },
    mech: { bonusDamage: [{ dice: '2d6', type: 'radiant', vs: 'undead' }], passive: ['light-20', 'frighten-undead'] },
  }),
  magicWeapon('mace-of-smiting', 'Mace of Smiting', 'mace', {
    cost: 7000, rarity: 'rare', tint: '#b8c0cc', icon: 'mace',
    desc: "A squat iron mace with no ornament whatever, made to break things that were never alive. Golems and doors fear it about equally.",
    magic: { atk: 1, dmg: 1 },
    mech: { bonusDamage: [{ dice: '2d6', type: 'bludgeoning', vs: 'construct' }], passive: ['smite-construct'] },
  }),
  magicWeapon('mace-of-terror', 'Mace of Terror', 'mace', {
    cost: 7500, rarity: 'rare', attunement: true, tint: '#5a2a3a', icon: 'mace',
    desc: "A black mace whose flanges are cast as screaming faces. Raise it and everything within thirty feet remembers something it would rather not.",
    magic: { atk: 0, dmg: 0 },
    charges: 3, recharge: 'dawn', consumable: false,
    use: { kind: 'spell', spellId: 'fear', level: 3, cost: 'action' },
  }),
  wond('mantle-of-spell-resistance', 'Mantle of Spell Resistance', 'cloak', {
    cost: 6500, weight: 1, rarity: 'rare', attunement: true, icon: 'cloak', tint: '#3a5a7a',
    desc: "A heavy blue mantle with a collar of silver thread, cut in the fashion of Blackstaff Tower. Spells slide off it like rain off slate.",
    mech: { advSaveVs: ['spell'] },
  }),
  mk('necklace-of-fireballs', 'Necklace of Fireballs', {
    kind: 'amulet', slot: 'amulet', cost: 5500, weight: 0.5, rarity: 'rare',
    icon: 'flame', tint: '#ff6a2a',
    desc: "A gold chain hung with small ruby beads that look like nothing at all until one is torn free and thrown. Then it is a fireball, and the chain is one bead shorter.",
    charges: 7, recharge: 'never', consumable: false,
    use: { kind: 'spell', spellId: 'fireball', level: 3, cost: 'action' },
  }),
  wond('periapt-of-proof-against-poison', 'Periapt of Proof against Poison', 'amulet', {
    cost: 4500, weight: 0.5, rarity: 'rare', attunement: true, icon: 'poison', tint: '#6ad06a',
    desc: "A dark amber gem in a plain silver claw. Poison finds nothing in you to work on — a comfort in Zhentarim company.",
    mech: { immune: ['poison'], condImmune: ['poisoned'] },
  }),
  wond('ring-of-animal-influence', 'Ring of Animal Influence', 'ring', {
    cost: 4000, weight: 0, rarity: 'rare', icon: 'ring', tint: '#7a9a4a',
    desc: "A ring of braided copper and green enamel. Beasts will hear you out — or, if you insist, do as they are told.",
    charges: 3, recharge: 'dawn', consumable: false,
    use: { kind: 'spell', spellId: 'animal-friendship', level: 1, cost: 'action' },
  }),
  wond('ring-of-evasion', 'Ring of Evasion', 'ring', {
    cost: 7000, weight: 0, rarity: 'rare', attunement: true, icon: 'ring', tint: '#a8e0c0',
    desc: "A ring of pale jade that grows briefly cold as the blast goes past you. Three times a day, a failed Dexterity save simply becomes a successful one.",
    charges: 3, recharge: 'dawn', consumable: false,
    mech: { passive: ['ring-of-evasion'] },
    use: { kind: 'utility', tag: 'reroll-dex-save', cost: 'reaction' },
  }),
  wond('ring-of-free-action', 'Ring of Free Action', 'ring', {
    cost: 7500, weight: 0, rarity: 'rare', attunement: true, icon: 'ring', tint: '#e0e8f0',
    desc: "A seamless band of white gold. Webs, ice, mud, magic and the grip of a giant's fist all lose their argument with your legs.",
    mech: { condImmune: ['restrained', 'grappled'], passive: ['free-action', 'ignore-difficult-terrain'] },
  }),
  wond('ring-of-protection', 'Ring of Protection', 'ring', {
    cost: 8000, weight: 0, rarity: 'rare', attunement: true, icon: 'ring', tint: '#d8c078',
    desc: "A plain gold band with a hairline of abjuration script cut inside it. The oldest, dullest and most wanted ring in Faerûn.",
    mech: { acBonus: 1, saveBonus: 1 },
  }),
  wond('ring-of-resistance-fire', 'Ring of Resistance (Fire)', 'ring', {
    cost: 6000, weight: 0, rarity: 'rare', attunement: true, icon: 'flame', tint: '#ff6a2a',
    desc: "A garnet ring that stays warm through a Deepwinter night. Flame parts around the hand that wears it.",
    mech: { resist: ['fire'] },
  }),
  wond('ring-of-resistance-cold', 'Ring of Resistance (Cold)', 'ring', {
    cost: 6000, weight: 0, rarity: 'rare', attunement: true, icon: 'frost', tint: '#a9d8ff',
    desc: "A tourmaline ring rimed with a permanent breath of frost. Auril's weather takes its business elsewhere.",
    mech: { resist: ['cold'] },
  }),
  wond('ring-of-resistance-lightning', 'Ring of Resistance (Lightning)', 'ring', {
    cost: 6000, weight: 0, rarity: 'rare', attunement: true, icon: 'thunder', tint: '#ffe066',
    desc: "A citrine ring that makes the hairs on your arm stand up in still air. Talos's favour, worn on a finger.",
    mech: { resist: ['lightning'] },
  }),
  wond('ring-of-resistance-necrotic', 'Ring of Resistance (Necrotic)', 'ring', {
    cost: 6000, weight: 0, rarity: 'rare', attunement: true, icon: 'necrotic', tint: '#7fbf6a',
    desc: "A ring of black pearl set in bone-white metal, dug out of a barrow near Conyberry. The grave's cold cannot get past it.",
    mech: { resist: ['necrotic'] },
  }),
  wond('ring-of-resistance-poison', 'Ring of Resistance (Poison)', 'ring', {
    cost: 6000, weight: 0, rarity: 'rare', attunement: true, icon: 'poison', tint: '#6ad06a',
    desc: "An amethyst ring in a green-gold setting. Talona's gifts trouble the wearer far less than intended.",
    mech: { resist: ['poison'] },
  }),
  wond('ring-of-spell-storing', 'Ring of Spell Storing', 'ring', {
    cost: 8000, weight: 0, rarity: 'rare', attunement: true, icon: 'ring', tint: '#b07af0',
    desc: "A ring of five twisted silver strands, each able to hold a spell someone else cast into it. A wizard's parting gift to a friend with no magic of their own.",
    charges: 5, recharge: 'never', consumable: false,
    use: { kind: 'utility', tag: 'release-stored-spell', maxLevel: 5, cost: 'action' },
  }),
  wond('ring-of-the-ram', 'Ring of the Ram', 'ring', {
    cost: 6500, weight: 0, rarity: 'rare', attunement: true, icon: 'ring', tint: '#a08a5a',
    desc: "An iron ring bearing a ram's head. Point and spend a charge, and an invisible battering ram hits whatever you were pointing at and shoves it backwards.",
    charges: 3, recharge: 'dawn', consumable: false,
    use: { kind: 'utility', tag: 'ram-blast', range: 60, damage: { dice: '2d10', type: 'force' }, push: 15, cost: 'action' },
  }),
  mk('robe-of-useful-items', 'Robe of Useful Items', {
    kind: 'armor', slot: 'armor', cost: 4500, weight: 4, rarity: 'rare',
    icon: 'cloak', tint: '#6a5a8a', ac: 10, addDex: true, category: 'light',
    desc: "A plain robe sewn all over with cloth patches. Tear one off and it becomes the thing it was shaped like: a ladder, a mule, a locked iron door, a pit.",
    charges: 12, recharge: 'never', consumable: false,
    use: { kind: 'utility', tag: 'useful-patch', cost: 'action' },
  }),
  rod('rod-of-the-pact-keeper-plus2', 'Rod of the Pact Keeper +2', {
    cost: 5000, rarity: 'rare', attunement: true, tint: '#6a2a6a',
    desc: "The rod has grown a second sigil since it was last handled, which its owner did not carve. It sharpens the pact-magic further all the same.",
    mech: { spellDcBonus: 2, spellAtkBonus: 2, class: 'warlock' },
    charges: 1, recharge: 'short',
    use: { kind: 'utility', tag: 'restore-pact-slot', cost: 'bonus' },
  }),
  mk('rope-of-entanglement', 'Rope of Entanglement', {
    kind: 'tool', cost: 4000, weight: 3, rarity: 'rare', icon: 'bag', tint: '#7a6a4a',
    desc: "Thirty feet of rope that lunges on command, wraps a creature to the ribs, and holds until it is told otherwise or cut through.",
    charges: 1, recharge: 'dawn', consumable: false,
    use: { kind: 'utility', tag: 'entangle', range: 20, escapeDC: 15, cost: 'action' },
  }),
  staff('staff-of-charming', 'Staff of Charming', {
    cost: 6000, rarity: 'rare', attunement: true, tint: '#e28ad0',
    desc: "A slender staff of white birch topped with a rose quartz. It charms, it commands, it understands every tongue — and it can turn one spell back on the caster.",
    magic: { atk: 0, dmg: 0 },
    charges: 10, rechargeDice: '1d8+2',
    use: { kind: 'spell', spellId: 'charm-person', level: 1, cost: 'action' },
    spells: ['charm-person', 'command', 'comprehend-languages'],
  }),
  staff('staff-of-fire', 'Staff of Fire', {
    cost: 8000, rarity: 'rare', attunement: true, tint: '#ff6a2a', icon: 'flame',
    desc: "A blackened staff of ironwood, the head still smouldering after a century. Its bearer does not burn.",
    magic: { atk: 0, dmg: 0 },
    charges: 10, rechargeDice: '1d6+4',
    mech: { resist: ['fire'] },
    use: { kind: 'spell', spellId: 'fireball', level: 3, cost: 'action' },
    spells: ['burning-hands', 'fireball', 'wall-of-fire'],
  }),
  staff('staff-of-healing', 'Staff of Healing', {
    cost: 7000, rarity: 'rare', attunement: true, tint: '#8fe0a0', icon: 'holy',
    desc: "A staff of pale willow bound with green ribbon, carried by the Ilmatari who walk the Triboar Trail after raids.",
    magic: { atk: 0, dmg: 0 },
    charges: 10, rechargeDice: '1d6+4',
    use: { kind: 'spell', spellId: 'cure-wounds', level: 1, cost: 'action' },
    spells: ['cure-wounds', 'lesser-restoration', 'mass-cure-wounds'],
  }),
  staff('staff-of-swarming-insects', 'Staff of Swarming Insects', {
    cost: 6000, rarity: 'rare', attunement: true, tint: '#6a5a3a',
    desc: "A hollow staff that hums. Break the seal and what comes out is not smoke.",
    magic: { atk: 0, dmg: 0 },
    charges: 10, rechargeDice: '1d6+4',
    use: { kind: 'spell', spellId: 'insect-plague', level: 5, cost: 'action' },
    spells: ['giant-insect', 'insect-plague'],
  }),
  staff('staff-of-the-woodlands', 'Staff of the Woodlands', {
    cost: 8000, rarity: 'rare', attunement: true, tint: '#5a8a3a', icon: 'leaf',
    desc: "A living staff of oak that puts out leaves in your hand. Reidoth of Thundertree carries one, and would tell you it carries him.",
    magic: { atk: 2, dmg: 2 },
    charges: 10, rechargeDice: '1d6+4',
    mech: { spellDcBonus: 0, passive: ['tree-form'] },
    use: { kind: 'spell', spellId: 'barkskin', level: 2, cost: 'action' },
    spells: ['animal-friendship', 'awaken', 'barkskin', 'pass-without-trace', 'speak-with-animals', 'spike-growth', 'wall-of-thorns'],
  }),
  mk('stone-of-controlling-earth-elementals', 'Stone of Controlling Earth Elementals', {
    kind: 'gem', cost: 5000, weight: 5, rarity: 'rare', icon: 'gem', tint: '#8a7a6a',
    desc: "A rough lump of grey stone that is heavier than a rock that size should be. Set it on bare earth and something climbs out of the ground to serve you.",
    charges: 1, recharge: 'dawn', consumable: false,
    use: { kind: 'utility', tag: 'summon', monsterId: 'earth-elemental', duration: '1 hour', cost: 'action' },
  }),
  magicWeapon('sun-blade', 'Sun Blade', 'longsword', {
    cost: 9000, rarity: 'rare', attunement: true, tint: '#ffe9a8', icon: 'radiant',
    desc: "A sword hilt with no blade, until the word is spoken and a bar of pure sunlight springs from it. It was made for a Morninglord's champion and it still knows the work.",
    props: ['finesse', 'versatile'], versatileDie: '1d10', dtype: 'radiant',
    magic: { atk: 2, dmg: 2 },
    mech: { bonusDamage: [{ dice: '1d8', type: 'radiant', vs: 'undead' }], passive: ['sunlight-15', 'light-30'] },
  }),
  magicWeapon('sword-of-life-stealing', 'Sword of Life Stealing', 'longsword', {
    cost: 6000, rarity: 'rare', attunement: true, tint: '#4a2a4a', icon: 'necrotic',
    desc: "A dark blade with a groove that never quite dries. When it finds the gap it takes rather more than blood, and gives some of it to you.",
    magic: { atk: 0, dmg: 0 },
    mech: { bonusDamage: [{ dice: '3d6', type: 'necrotic', when: 'crit' }], passive: ['life-steal-temphp'] },
  }),
  magicWeapon('sword-of-wounding', 'Sword of Wounding', 'longsword', {
    cost: 6500, rarity: 'rare', attunement: true, tint: '#a03a4a', icon: 'sword',
    desc: "A serrated blade whose cuts refuse to close. The wounded bleed at the start of every turn until somebody with a healer's hands intervenes.",
    magic: { atk: 0, dmg: 0 },
    mech: { passive: ['wounding'] },
  }),
  wand('wand-of-binding', 'Wand of Binding', {
    cost: 5500, rarity: 'rare', attunement: true, tint: '#8a8ad8',
    desc: "A wand of grey iron wrapped in copper wire. It holds a creature fast, or breaks a hold laid on you.",
    charges: 7, rechargeDice: '1d6+1',
    use: { kind: 'spell', spellId: 'hold-monster', level: 5, cost: 'action' },
  }),
  wand('wand-of-enemy-detection', 'Wand of Enemy Detection', {
    cost: 5000, rarity: 'rare', attunement: true, tint: '#e05a5a',
    desc: "A wand that quivers and points at anything within sixty feet that means you harm, invisible or not. Scouts of the Lords' Alliance swear by them.",
    charges: 7, rechargeDice: '1d6+1',
    use: { kind: 'utility', tag: 'detect-hostiles', range: 60, duration: '1 minute', cost: 'action' },
  }),
  wand('wand-of-fear', 'Wand of Fear', {
    cost: 5500, rarity: 'rare', attunement: true, tint: '#4a3a5a',
    desc: "A wand of pitted black iron that smells of a battlefield. What it touches runs.",
    charges: 7, rechargeDice: '1d6+1',
    use: { kind: 'spell', spellId: 'fear', level: 3, cost: 'action' },
  }),
  wand('wand-of-fireballs', 'Wand of Fireballs', {
    cost: 8000, rarity: 'rare', attunement: true, tint: '#ff6a2a', icon: 'flame',
    desc: "A red-lacquered wand with a bead of amber at the tip. Seven fireballs, and then a very ordinary stick until dawn.",
    charges: 7, rechargeDice: '1d6+1',
    use: { kind: 'spell', spellId: 'fireball', level: 3, cost: 'action' },
  }),
  wand('wand-of-lightning-bolts', 'Wand of Lightning Bolts', {
    cost: 8000, rarity: 'rare', attunement: true, tint: '#ffe066', icon: 'thunder',
    desc: "A wand of blue-black metal that crackles faintly in damp weather. The bolt goes through the first rank and keeps going.",
    charges: 7, rechargeDice: '1d6+1',
    use: { kind: 'spell', spellId: 'lightning-bolt', level: 3, cost: 'action' },
  }),
  wand('wand-of-paralysis', 'Wand of Paralysis', {
    cost: 7000, rarity: 'rare', attunement: true, tint: '#a8b8e8',
    desc: "A pale wand of polished bone that ends in a small clenched hand. Its victims stay exactly as they were, aware the whole time.",
    charges: 7, rechargeDice: '1d6+1',
    use: { kind: 'spell', spellId: 'hold-person', level: 2, cost: 'action' },
  }),
  wand('wand-of-the-war-mage-plus2', 'Wand of the War Mage, +2', {
    cost: 5000, rarity: 'rare', attunement: true, tint: '#4a6ad8',
    desc: "A war-wand rebuilt after Neverwinter's second siege, the core drawn from a lightning-struck oak of the Neverwinter Wood.",
    mech: { spellAtkBonus: 2, passive: ['ignore-half-cover'] },
    consumable: false,
  }),
  wand('wand-of-wonder', 'Wand of Wonder', {
    cost: 6000, rarity: 'rare', attunement: true, tint: '#e28ad0',
    desc: "A gnomish wand of Lantan make, striped like a barber's pole. Point it, spend a charge, and something happens. Something always happens.",
    charges: 7, rechargeDice: '1d6+1',
    use: { kind: 'utility', tag: 'wild-magic', cost: 'action' },
  }),
  wond('wings-of-flying', 'Wings of Flying', 'cloak', {
    cost: 8000, weight: 4, rarity: 'rare', attunement: true, icon: 'cloak', tint: '#c8d0dc',
    desc: "A cloak that unfolds into a pair of great feathered wings — or bat wings, or dragon wings, depending on who made yours and why.",
    mech: { flySpeed: 60 },
    charges: 1, recharge: 'dawn', consumable: false,
    use: { kind: 'buff', tag: 'wings-of-flying', duration: '1 hour', cost: 'bonus' },
  }),
);

// ===========================================================================
// 4. VERY RARE — the treasure a dragon actually keeps
// ===========================================================================

ALL.push(
  wond('amulet-of-the-planes', 'Amulet of the Planes', 'amulet', {
    cost: 30000, weight: 1, rarity: 'very-rare', attunement: true, icon: 'amulet', tint: '#8a5ad8',
    desc: "A disc of nameless metal in which a different sky is always turning. Name a plane and it takes you there — or, if your nerve fails, somewhere random and unkind.",
    consumable: false,
    use: { kind: 'spell', spellId: 'plane-shift', level: 7, cost: 'action' },
  }),
  wond('belt-of-stone-giant-strength', 'Belt of Stone Giant Strength', 'amulet', {
    cost: 26000, weight: 3, rarity: 'very-rare', attunement: true, icon: 'armor', tint: '#8a8a8a',
    desc: "A belt of grey hide with a buckle of unworked granite, taken from a stone giant thane of the Sword Mountains.",
    mech: { setAbility: { str: 23 } },
  }),
  wond('belt-of-frost-giant-strength', 'Belt of Frost Giant Strength', 'amulet', {
    cost: 26000, weight: 3, rarity: 'very-rare', attunement: true, icon: 'frost', tint: '#a9d8ff',
    desc: "White fur and a buckle of blue ice that never melts. It came south out of the Spine of the World on somebody who did not come back.",
    mech: { setAbility: { str: 23 } },
  }),
  wond('belt-of-fire-giant-strength', 'Belt of Fire Giant Strength', 'amulet', {
    cost: 34000, weight: 3, rarity: 'very-rare', attunement: true, icon: 'flame', tint: '#e05a2a',
    desc: "Blackened leather with a buckle of scorched bronze, still smelling of forge-smoke. Fire giants do not part with these willingly.",
    mech: { setAbility: { str: 25 } },
  }),
  mk('carpet-of-flying', 'Carpet of Flying', {
    kind: 'tool', cost: 30000, weight: 15, rarity: 'very-rare', icon: 'wind', tint: '#8a3a5a',
    desc: "A Calishite carpet six feet by nine, woven with a pattern that is very slightly wrong to look at. It carries four hundred pounds at forty feet a round and never once dips.",
    consumable: false,
    use: { kind: 'utility', tag: 'carpet-of-flying', speed: 40, capacity: 400, cost: 'action' },
  }),
  wond('cloak-of-arachnida', 'Cloak of Arachnida', 'cloak', {
    cost: 28000, weight: 1, rarity: 'very-rare', attunement: true, icon: 'cloak', tint: '#3a2a4a',
    desc: "Black silk shot through with grey, woven — the story goes — in the Underdark under Lolth's own eye. Webs are floor to you, and never a trap.",
    mech: { resist: ['poison'], climbSpeed: 30, passive: ['spider-climb', 'web-walk'] },
    charges: 1, recharge: 'dawn', consumable: false,
    use: { kind: 'spell', spellId: 'web', level: 2, cost: 'action' },
  }),
  mk('crystal-ball', 'Crystal Ball', {
    kind: 'tool', cost: 34000, weight: 3, rarity: 'very-rare', attunement: true, icon: 'gem', tint: '#a9d8ff',
    desc: "A flawless sphere of clear crystal the size of a grapefruit. Look into it and look out of somewhere else — Blackstaff Tower keeps three, and lends none.",
    consumable: false,
    use: { kind: 'spell', spellId: 'scrying', level: 5, cost: 'action' },
  }),
  magicWeapon('dancing-sword', 'Dancing Sword', 'longsword', {
    cost: 30000, rarity: 'very-rare', attunement: true, tint: '#c8d8f0', icon: 'sword',
    desc: "Toss it into the air and it stays there, fighting beside you on its own for four rounds before it drops back into your hand.",
    magic: { atk: 1, dmg: 1 },
    mech: { passive: ['dancing-weapon'] },
    charges: 4, recharge: 'never', consumable: false,
    use: { kind: 'utility', tag: 'dancing-sword', duration: '4 rounds', cost: 'bonus' },
  }),
  magicArmor('dwarven-plate', 'Dwarven Plate', 'plate-armor', {
    cost: 32000, rarity: 'very-rare', tint: '#c8b088',
    desc: "Full harness out of the lost halls of Delzoun, every plate stamped with Moradin's hammer. Something tries to shove you and finds your feet are simply not available.",
    ac: 20,
    mech: { passive: ['dwarven-footing'] },
  }),
  magicWeapon('dwarven-thrower', 'Dwarven Thrower', 'warhammer', {
    cost: 34000, rarity: 'very-rare', attunement: true, tint: '#c8b088', icon: 'hammer',
    desc: "A dwarf-forged warhammer that flies to its target and returns to the hand. Only a dwarf can wake it; in anyone else's fist it is a very good hammer and nothing more.",
    props: ['thrown', 'versatile'], versatileDie: '1d10', range: [20, 60],
    magic: { atk: 3, dmg: 3 },
    mech: { bonusDamage: [{ dice: '2d8', type: 'bludgeoning', vs: 'giant' }, { dice: '1d8', type: 'bludgeoning', when: 'thrown' }], passive: ['dwarf-only', 'returning'] },
  }),
  mk('efreeti-bottle', 'Efreeti Bottle', {
    kind: 'tool', cost: 32000, weight: 1, rarity: 'very-rare', icon: 'flask', tint: '#e0803a',
    desc: "A brass bottle sealed with lead and stamped with the seal of the City of Brass. What is inside has been in there a long time and has opinions about that.",
    charges: 1, recharge: 'dawn', consumable: false,
    use: { kind: 'utility', tag: 'summon', monsterId: 'efreeti', duration: '1 hour', cost: 'action' },
  }),
  magicWeapon('frost-brand', 'Frost Brand', 'longsword', {
    cost: 32000, rarity: 'very-rare', attunement: true, tint: '#a9d8ff', icon: 'frost',
    desc: "A blade of pale blue steel that steams in warm air. It bites with cold, it turns fire aside, and in freezing weather it lights the ground around you.",
    magic: { atk: 0, dmg: 0 },
    mech: { resist: ['fire'], bonusDamage: [{ dice: '1d6', type: 'cold' }], passive: ['extinguish-flames', 'light-10-cold'] },
  }),
  wond('helm-of-brilliance', 'Helm of Brilliance', 'helm', {
    cost: 32000, weight: 3, rarity: 'very-rare', attunement: true, icon: 'crown', tint: '#ffe9a8',
    desc: "A helm set with diamonds, rubies, fire opals and opals, each stone a spell waiting. Undead within thirty feet of it burn without being touched.",
    charges: 10, recharge: 'never', consumable: false,
    mech: { passive: ['scorch-undead', 'light-30'] },
    use: { kind: 'spell', spellId: 'daylight', level: 3, cost: 'action' },
    spells: ['daylight', 'fireball', 'prismatic-spray', 'wall-of-fire'],
  }),
  mk('horn-of-valhalla-bronze', 'Horn of Valhalla (Bronze)', {
    kind: 'tool', cost: 26000, weight: 2, rarity: 'very-rare', icon: 'wind', tint: '#a07a3a',
    desc: "A great bronze-mounted horn whose note carries a mile. Four berserkers answer it, and they do not ask what the fight is about.",
    charges: 1, recharge: 'week', consumable: false,
    use: { kind: 'utility', tag: 'summon-berserkers', count: 4, duration: '1 hour', cost: 'action' },
  }),
  mk('ioun-stone-agility', 'Ioun Stone (Agility)', {
    kind: 'gem', cost: 28000, weight: 0, rarity: 'very-rare', attunement: true, icon: 'star', tint: '#a8e0c0',
    desc: "A deep red sphere that keeps station just behind your ear and moves when you move, a fraction before you do.",
    slot: 'amulet', mech: { asi: { dex: 2 }, passive: ['ioun-stone'] },
  }),
  mk('ioun-stone-fortitude', 'Ioun Stone (Fortitude)', {
    kind: 'gem', cost: 28000, weight: 0, rarity: 'very-rare', attunement: true, icon: 'star', tint: '#e05a7a',
    desc: "A pink rhomboid that pulses with your heartbeat, slightly out of time and slightly stronger.",
    slot: 'amulet', mech: { asi: { con: 2 }, passive: ['ioun-stone'] },
  }),
  mk('ioun-stone-insight', 'Ioun Stone (Insight)', {
    kind: 'gem', cost: 28000, weight: 0, rarity: 'very-rare', attunement: true, icon: 'star', tint: '#9fd6e8',
    desc: "An incandescent blue sphere. Things you had not thought to notice arrive already noticed.",
    slot: 'amulet', mech: { asi: { wis: 2 }, passive: ['ioun-stone'] },
  }),
  mk('ioun-stone-intellect', 'Ioun Stone (Intellect)', {
    kind: 'gem', cost: 28000, weight: 0, rarity: 'very-rare', attunement: true, icon: 'star', tint: '#5a7ad8',
    desc: "A marbled scarlet-and-blue sphere, the favourite of every Blackstaff apprentice who cannot afford one.",
    slot: 'amulet', mech: { asi: { int: 2 }, passive: ['ioun-stone'] },
  }),
  mk('ioun-stone-leadership', 'Ioun Stone (Leadership)', {
    kind: 'gem', cost: 28000, weight: 0, rarity: 'very-rare', attunement: true, icon: 'star', tint: '#e8b04a',
    desc: "A marbled pink sphere. People find themselves agreeing with you and are not sure when they started.",
    slot: 'amulet', mech: { asi: { cha: 2 }, passive: ['ioun-stone'] },
  }),
  mk('ioun-stone-strength', 'Ioun Stone (Strength)', {
    kind: 'gem', cost: 28000, weight: 0, rarity: 'very-rare', attunement: true, icon: 'star', tint: '#c05a3a',
    desc: "A pale blue rhomboid that hums when you lift. Netherese soldiery wore them; Netheril fell anyway.",
    slot: 'amulet', mech: { asi: { str: 2 }, passive: ['ioun-stone'] },
  }),
  mk('manual-of-bodily-health', 'Manual of Bodily Health', {
    kind: 'tool', cost: 30000, weight: 5, rarity: 'very-rare', icon: 'book', tint: '#c05a5a',
    desc: "A dense treatise on diet, breath and endurance that takes six days to read and forty-eight hours to work. Afterwards you are simply harder to kill.",
    use: { kind: 'utility', tag: 'manual', ability: 'con', amount: 2, days: 6 },
  }),
  mk('manual-of-gainful-exercise', 'Manual of Gainful Exercise', {
    kind: 'tool', cost: 30000, weight: 5, rarity: 'very-rare', icon: 'book', tint: '#a06a3a',
    desc: "A brutal regimen of lifting and holding, written by somebody who clearly enjoyed it. Six days of study and your shoulders are not the shoulders you had.",
    use: { kind: 'utility', tag: 'manual', ability: 'str', amount: 2, days: 6 },
  }),
  mk('manual-of-quickness-of-action', 'Manual of Quickness of Action', {
    kind: 'tool', cost: 30000, weight: 5, rarity: 'very-rare', icon: 'book', tint: '#5aa07a',
    desc: "Drills of balance and reaction set out in a cramped Calishite hand. The margins are full of somebody else's corrections.",
    use: { kind: 'utility', tag: 'manual', ability: 'dex', amount: 2, days: 6 },
  }),
  mk('tome-of-clear-thought', 'Tome of Clear Thought', {
    kind: 'tool', cost: 30000, weight: 5, rarity: 'very-rare', icon: 'book', tint: '#5a7ad8',
    desc: "A treatise on memory and logic in a hand that never once hesitates. Six days with it and the world is a slightly more legible place.",
    use: { kind: 'utility', tag: 'manual', ability: 'int', amount: 2, days: 6 },
  }),
  mk('tome-of-leadership-and-influence', 'Tome of Leadership and Influence', {
    kind: 'tool', cost: 30000, weight: 5, rarity: 'very-rare', icon: 'book', tint: '#e8b04a',
    desc: "A merchant-lord's private notes on how to be obeyed, bound in Waterdhavian calf. Half of it is about listening.",
    use: { kind: 'utility', tag: 'manual', ability: 'cha', amount: 2, days: 6 },
  }),
  mk('tome-of-understanding', 'Tome of Understanding', {
    kind: 'tool', cost: 30000, weight: 5, rarity: 'very-rare', icon: 'book', tint: '#7ac0a0',
    desc: "A book of exercises in attention and stillness, copied and recopied by the Oghmanytes of Waterdeep. Six days of it changes what you see.",
    use: { kind: 'utility', tag: 'manual', ability: 'wis', amount: 2, days: 6 },
  }),
  magicWeapon('nine-lives-stealer', 'Nine Lives Stealer', 'longsword', {
    cost: 30000, rarity: 'very-rare', attunement: true, tint: '#4a2a5a', icon: 'skull',
    desc: "A sword with nine notches cut into the ricasso, and room for no more. When it lands truly on a wounded creature it does not wound it — it ends it.",
    magic: { atk: 2, dmg: 2 },
    charges: 9, recharge: 'never', consumable: false,
    mech: { passive: ['soul-steal'] },
  }),
  magicWeapon('oathbow', 'Oathbow', 'longbow', {
    cost: 30000, rarity: 'very-rare', attunement: true, tint: '#5a7a4a', icon: 'bow',
    desc: "A black yew bow that speaks when it is drawn: *Swift defeat to my enemies.* Say the name of the sworn enemy and the bow does not forget it until the day is out.",
    magic: { atk: 0, dmg: 0 },
    mech: { bonusDamage: [{ dice: '3d6', type: 'piercing', vs: 'sworn-enemy' }], passive: ['oathbow'] },
  }),
  wond('ring-of-regeneration', 'Ring of Regeneration', 'ring', {
    cost: 34000, weight: 0, rarity: 'very-rare', attunement: true, icon: 'heart', tint: '#7ae0a0',
    desc: "A ring of braided green gold that never tarnishes. Wounds close as you watch, and given hours enough it will grow back a hand.",
    mech: { passive: ['regeneration'] },
  }),
  wond('ring-of-shooting-stars', 'Ring of Shooting Stars', 'ring', {
    cost: 28000, weight: 0, rarity: 'very-rare', attunement: true, icon: 'star', tint: '#ffe066',
    desc: "A ring set with four small diamonds that fall as burning motes when loosed. It only works in the dark, which is where it is usually needed.",
    charges: 6, recharge: 'dawn', consumable: false,
    use: { kind: 'utility', tag: 'shooting-stars', damage: { dice: '5d4', type: 'radiant' }, cost: 'action' },
    spells: ['dancing-lights', 'faerie-fire', 'light'],
  }),
  wond('ring-of-telekinesis', 'Ring of Telekinesis', 'ring', {
    cost: 30000, weight: 0, rarity: 'very-rare', attunement: true, icon: 'force', tint: '#c8b0ff',
    desc: "A plain steel band with no seam and no maker's mark. Whatever you can see, you can take hold of without moving.",
    consumable: false,
    use: { kind: 'spell', spellId: 'telekinesis', level: 5, cost: 'action' },
  }),
  wond('robe-of-stars', 'Robe of Stars', 'cloak', {
    cost: 32000, weight: 4, rarity: 'very-rare', attunement: true, icon: 'cloak', tint: '#1a1a4a',
    desc: "Deep blue-black cloth strewn with six embroidered stars that can be plucked off and thrown as darts of force. Selûnite prelates are buried in them.",
    mech: { saveBonus: 1, passive: ['astral-travel'] },
    charges: 6, recharge: 'dawn', consumable: false,
    use: { kind: 'spell', spellId: 'magic-missile', level: 5, cost: 'action' },
  }),
  rod('rod-of-absorption', 'Rod of Absorption', {
    cost: 32000, rarity: 'very-rare', attunement: true, tint: '#5a3a7a',
    desc: "A rod of dull violet stone that drinks a spell aimed at you and holds the levels for you to spend later. It can hold fifty, and then it is a paperweight forever.",
    charges: 50, recharge: 'never',
    use: { kind: 'utility', tag: 'absorb-spell', cost: 'reaction' },
    mech: { passive: ['spell-absorption'] },
  }),
  rod('rod-of-alertness', 'Rod of Alertness', {
    cost: 30000, rarity: 'very-rare', attunement: true, tint: '#e8d8a0', icon: 'eye',
    desc: "A rod capped with a flanged head of polished silver. Planted in the ground it throws a ward around the camp; carried, it keeps you a half-step ahead.",
    mech: { initiativeBonus: 1, skillBonus: { perception: 1 }, passive: ['rod-of-alertness'] },
    charges: 1, recharge: 'dawn',
    use: { kind: 'utility', tag: 'alertness-ward', radius: 30, cost: 'action' },
    spells: ['detect-evil-and-good', 'detect-magic', 'protection-from-poison', 'see-invisibility'],
  }),
  magicWeapon('scimitar-of-speed', 'Scimitar of Speed', 'scimitar', {
    cost: 30000, rarity: 'very-rare', attunement: true, tint: '#e8c04a', icon: 'sword',
    desc: "A curved blade so light it seems to want to be moving. Every round it offers you one more cut than you had any right to take.",
    magic: { atk: 2, dmg: 2 },
    mech: { passive: ['bonus-action-attack'] },
  }),
  magicArmor('spellguard-shield', 'Spellguard Shield', 'shield', {
    cost: 30000, rarity: 'very-rare', attunement: true, tint: '#5a8ad8',
    desc: "A shield faced in blue-enamelled steel and ringed with silver glyphs. Spell attacks slide off it, and what you cannot dodge you shrug at.",
    ac: 2,
    mech: { advSaveVs: ['spell'], passive: ['spell-attacks-disadvantage'] },
  }),
  staff('staff-of-frost', 'Staff of Frost', {
    cost: 30000, rarity: 'very-rare', attunement: true, tint: '#a9d8ff', icon: 'frost',
    desc: "A staff of blue-white ice that does not melt, cut — the story goes — from a glacier on Icespire Peak while a white dragon slept below.",
    magic: { atk: 0, dmg: 0 },
    charges: 10, rechargeDice: '1d6+4',
    mech: { resist: ['cold'] },
    use: { kind: 'spell', spellId: 'cone-of-cold', level: 5, cost: 'action' },
    spells: ['cone-of-cold', 'fog-cloud', 'ice-storm', 'wall-of-ice'],
  }),
  staff('staff-of-power', 'Staff of Power', {
    cost: 38000, rarity: 'very-rare', attunement: true, tint: '#b07af0', icon: 'staff',
    desc: "A staff of black wood shod in gold, wielded by archmages who wanted to be seen wielding it. Broken deliberately, it takes a city block with it.",
    magic: { atk: 2, dmg: 2 },
    charges: 20, rechargeDice: '2d8+4',
    mech: { acBonus: 2, saveBonus: 2, spellAtkBonus: 2, bonusDamage: [{ dice: '1d6', type: 'force' }], passive: ['retributive-strike'] },
    use: { kind: 'spell', spellId: 'fireball', level: 5, cost: 'action' },
    spells: ['cone-of-cold', 'fireball', 'globe-of-invulnerability', 'hold-monster', 'levitate', 'lightning-bolt', 'magic-missile', 'ray-of-enfeeblement', 'wall-of-force'],
  }),
  staff('staff-of-striking', 'Staff of Striking', {
    cost: 26000, rarity: 'very-rare', attunement: true, tint: '#8a8a9a', icon: 'staff',
    desc: "A short, heavy staff of banded iron. Spend charges as it lands and it hits like a falling beam.",
    magic: { atk: 3, dmg: 3 },
    charges: 10, rechargeDice: '1d6+4',
    mech: { bonusDamage: [{ dice: '1d6', type: 'force', perCharge: true, maxCharges: 3 }] },
  }),
  staff('staff-of-thunder-and-lightning', 'Staff of Thunder and Lightning', {
    cost: 34000, rarity: 'very-rare', attunement: true, tint: '#ffe066', icon: 'thunder',
    desc: "A staff of scorched oak taken from a tree Talos struck twice. It cracks like a storm and hits like the sky falling in.",
    magic: { atk: 2, dmg: 2 },
    charges: 5, recharge: 'dawn',
    mech: { bonusDamage: [{ dice: '2d6', type: 'lightning', when: 'lightning-charge' }] },
    use: { kind: 'spell', spellId: 'lightning-bolt', level: 3, cost: 'action' },
  }),
  magicWeapon('sword-of-sharpness', 'Sword of Sharpness', 'greatsword', {
    cost: 34000, rarity: 'very-rare', attunement: true, tint: '#e8f0ff', icon: 'sword',
    desc: "The edge is not the point — the edge simply is. On a true stroke it takes an extra four dice of ruin off whatever it met, and sometimes a limb with it.",
    magic: { atk: 0, dmg: 0 },
    mech: { bonusDamage: [{ dice: '4d6', type: 'slashing', when: 'max-die' }], passive: ['sever-limb', 'light-10'] },
  }),
);

// ===========================================================================
// 5. LEGENDARY — items with names people already know
// ===========================================================================

ALL.push(
  magicArmor('armor-of-invulnerability', 'Armor of Invulnerability', 'plate-armor', {
    cost: 180000, rarity: 'legendary', attunement: true, tint: '#e8e0c8',
    desc: "White plate chased with gold, dented nowhere. Ordinary weapons cannot properly hurt you, and for ten minutes a day nothing can.",
    ac: 18,
    charges: 1, recharge: 'dawn', consumable: false,
    mech: { resist: ['nonmagical'], passive: ['invulnerable-10-min'] },
    use: { kind: 'buff', tag: 'invulnerability', duration: '10 minutes', cost: 'action' },
  }),
  wond('belt-of-cloud-giant-strength', 'Belt of Cloud Giant Strength', 'amulet', {
    cost: 120000, weight: 3, rarity: 'legendary', attunement: true, icon: 'wind', tint: '#dfe6f0',
    desc: "Pale hide and a buckle of cloud-white silver, taken from a giant's castle that was, at the time, several thousand feet up.",
    mech: { setAbility: { str: 27 } },
  }),
  wond('belt-of-storm-giant-strength', 'Belt of Storm Giant Strength', 'amulet', {
    cost: 180000, weight: 3, rarity: 'legendary', attunement: true, icon: 'thunder', tint: '#8fd0ff',
    desc: "Deep blue leather with a buckle of raw electrum that stings the fingers. There are perhaps four of these in all Faerûn and every one of them is spoken for.",
    mech: { setAbility: { str: 29 } },
  }),
  wond('cloak-of-invisibility', 'Cloak of Invisibility', 'cloak', {
    cost: 150000, weight: 1, rarity: 'legendary', attunement: true, icon: 'cloak', tint: '#9aa4b4',
    desc: "A grey hooded cloak that takes you out of the world entirely while the hood is up. Two hours a day, spent as you like, and every hour of it a temptation.",
    charges: 2, recharge: 'dawn', consumable: false,
    use: { kind: 'buff', tag: 'invisibility', duration: '1 hour', cost: 'action' },
    mech: { passive: ['cloak-of-invisibility'] },
  }),
  magicWeapon('defender', 'Defender', 'longsword', {
    cost: 160000, rarity: 'legendary', attunement: true, tint: '#c8d8f0', icon: 'shield',
    desc: "A greatsword-slayer of a blade with a fluted guard, made for a bodyguard rather than a duellist. Its bonus can be moved from the edge to your own skin, as the moment demands.",
    magic: { atk: 3, dmg: 3 },
    mech: { passive: ['defender-shift'] },
  }),
  mk('deck-of-many-things', 'Deck of Many Things', {
    kind: 'tool', cost: 200000, weight: 0.5, rarity: 'legendary', icon: 'dice', tint: '#3a2a5a',
    desc: "Twenty-two cards of ivory and vellum in a lacquered box. Every card is a life changed — a keep, a wish, a soul in a jar, a dead god's attention. Nobody who draws twice draws happily.",
    charges: 22, recharge: 'never', consumable: false,
    use: { kind: 'utility', tag: 'deck-of-many-things', cost: 'action' },
  }),
  magicWeapon('hammer-of-thunderbolts', 'Hammer of Thunderbolts', 'maul', {
    cost: 180000, rarity: 'legendary', attunement: true, tint: '#ffe066', icon: 'hammer',
    desc: "A giant-sized maul of grey iron, its head sheathed in perpetual static. With a giant's belt and gauntlets it wakes fully, and then giants die of it.",
    magic: { atk: 1, dmg: 1 },
    charges: 5, recharge: 'dawn',
    mech: { setAbility: { str: 20 }, bonusDamage: [{ dice: '4d6', type: 'thunder', vs: 'giant' }], passive: ['giant-slayer', 'thunderclap'] },
  }),
  magicWeapon('holy-avenger', 'Holy Avenger', 'longsword', {
    cost: 200000, rarity: 'legendary', attunement: true, tint: '#fff0c0', icon: 'holy',
    desc: "A paladin's sword and nothing else's: white steel, a cruciform hilt, and a light that will not be put out. Around its bearer, fiends and undead find the air itself hostile.",
    magic: { atk: 3, dmg: 3 },
    mech: {
      bonusDamage: [{ dice: '2d10', type: 'radiant', vs: 'fiend' }, { dice: '2d10', type: 'radiant', vs: 'undead' }],
      passive: ['holy-avenger-aura', 'paladin-only'],
    },
  }),
  mk('iron-flask', 'Iron Flask', {
    kind: 'tool', cost: 120000, weight: 1, rarity: 'legendary', icon: 'flask', tint: '#4a4a52',
    desc: "A brass-stoppered iron bottle inscribed with mystic script. Whatever is inside will serve you for an hour when released, and will spend that hour deciding what to do about you afterwards.",
    charges: 1, recharge: 'never', consumable: false,
    use: { kind: 'utility', tag: 'iron-flask', cost: 'action' },
  }),
  magicWeapon('luck-blade', 'Luck Blade', 'longsword', {
    cost: 180000, rarity: 'legendary', attunement: true, tint: '#ffd24a', icon: 'star',
    desc: "A short, unremarkable sword blessed on Tymora's altar in some century nobody records. It nudges dice, and in its pommel are one to three wishes nobody sane spends lightly.",
    magic: { atk: 1, dmg: 1 },
    charges: 1, recharge: 'dawn',
    mech: { saveBonus: 1, passive: ['luck-reroll'] },
    use: { kind: 'utility', tag: 'luck-blade-wish', cost: 'action' },
    wishes: 3,
  }),
  wond('ring-of-djinni-summoning', 'Ring of Djinni Summoning', 'ring', {
    cost: 160000, weight: 0, rarity: 'legendary', attunement: true, icon: 'wind', tint: '#8fd0ff',
    desc: "A band of blue-white metal that whistles faintly in still air. A djinni of the Elemental Plane of Air is bound to it, and will serve one hour a day — courteously, and no longer.",
    charges: 1, recharge: 'dawn', consumable: false,
    use: { kind: 'utility', tag: 'summon', monsterId: 'djinni', duration: '1 hour', cost: 'action' },
  }),
  wond('ring-of-invisibility', 'Ring of Invisibility', 'ring', {
    cost: 150000, weight: 0, rarity: 'legendary', attunement: true, icon: 'ring', tint: '#cfd8e8',
    desc: "A plain ring that seems always to be slightly out of focus. Turn it once and nobody has ever seen you.",
    consumable: false,
    use: { kind: 'buff', tag: 'invisibility', duration: 'until dismissed', cost: 'action' },
    mech: { passive: ['at-will-invisibility'] },
  }),
  wond('ring-of-spell-turning', 'Ring of Spell Turning', 'ring', {
    cost: 180000, weight: 0, rarity: 'legendary', attunement: true, icon: 'ring', tint: '#b07af0',
    desc: "A ring cut with a serpent swallowing its tail. Spells aimed at you fail, and the ones that target only you go home to the caster.",
    mech: { advSaveVs: ['spell'], passive: ['spell-turning'] },
  }),
  wond('ring-of-three-wishes', 'Ring of Three Wishes', 'ring', {
    cost: 200000, weight: 0, rarity: 'legendary', icon: 'star', tint: '#ffb03a',
    desc: "A gold ring set with three small stars of white fire, one of which goes out each time it is used. When the last goes out it is an ordinary ring, and you have your life to think about it.",
    charges: 3, recharge: 'never', consumable: false,
    use: { kind: 'spell', spellId: 'wish', level: 9, cost: 'action' },
  }),
  mk('robe-of-the-archmagi', 'Robe of the Archmagi', {
    kind: 'armor', slot: 'armor', cost: 200000, weight: 4, rarity: 'legendary', attunement: true,
    icon: 'cloak', tint: '#2a2a5a', ac: 15, addDex: true, category: 'light', stealthDis: false,
    desc: "White, grey or black by allegiance, sewn with silver runes that move when you are not reading them. The Blackstaff has worn one; so has every archmage worth the title.",
    mech: { acFormula: { base: 15, addDex: true, cap: null }, spellDcBonus: 2, spellAtkBonus: 2, advSaveVs: ['spell'] },
  }),
  magicWeapon('rod-of-lordly-might', 'Rod of Lordly Might', 'mace', {
    cost: 180000, rarity: 'legendary', attunement: true, tint: '#d3a24a', icon: 'staff',
    desc: "A gold-and-silver rod with six studded buttons. It is a mace, and a sword, and a spear, and a climbing pole, and a battering ram, and a thing that tells you which way is north.",
    magic: { atk: 3, dmg: 3 },
    charges: 6, recharge: 'dawn',
    mech: { bonusDamage: [{ dice: '2d6', type: 'necrotic', when: 'drain-button' }], passive: ['lordly-forms'] },
    use: { kind: 'utility', tag: 'rod-of-lordly-might', cost: 'bonus' },
  }),
  mk('scarab-of-protection', 'Scarab of Protection', {
    kind: 'amulet', slot: 'amulet', cost: 140000, weight: 0.5, rarity: 'legendary', attunement: true,
    icon: 'star', tint: '#5a8a5a',
    desc: "A beetle carved from green stone, warm as a living thing. It wards every spell aimed at you and burns itself out twelve times over turning aside the undead.",
    charges: 12, recharge: 'never', consumable: false,
    mech: { advSaveVs: ['spell'], passive: ['scarab-ward'] },
  }),
  mk('sphere-of-annihilation', 'Sphere of Annihilation', {
    kind: 'tool', cost: 150000, weight: 0, rarity: 'legendary', icon: 'shadow', tint: '#0a0a12',
    desc: "A two-foot ball of absolute nothing that hangs in the air, silent and cold. Matter that touches it stops having ever existed. Halaster keeps several, for reasons of his own.",
    consumable: false,
    use: { kind: 'utility', tag: 'sphere-of-annihilation', damage: { dice: '4d10', type: 'force' }, cost: 'action' },
  }),
  staff('staff-of-the-magi', 'Staff of the Magi', {
    cost: 200000, rarity: 'legendary', attunement: true, tint: '#c8b088', icon: 'staff',
    desc: "A gnarled staff of ancient oak, older than the Weave's last catastrophe and utterly unbothered by it. Fifty charges, a library of spells, and a last resort that flattens everything within a bowshot.",
    magic: { atk: 2, dmg: 2 },
    charges: 50, rechargeDice: '4d6+2',
    mech: { advSaveVs: ['spell'], spellAtkBonus: 2, passive: ['spell-absorption', 'retributive-strike'] },
    use: { kind: 'spell', spellId: 'fireball', level: 5, cost: 'action' },
    spells: ['conjure-elemental', 'dispel-magic', 'fireball', 'flaming-sphere', 'ice-storm', 'invisibility', 'knock', 'lightning-bolt', 'passwall', 'plane-shift', 'telekinesis', 'wall-of-fire', 'web'],
  }),
  magicWeapon('sword-of-answering', 'Sword of Answering', 'longsword', {
    cost: 180000, rarity: 'legendary', attunement: true, tint: '#d8c0e8', icon: 'sword',
    desc: "One of nine blades, each forged as the answer to a question nobody wrote down. When you are struck, it answers — immediately, and in kind.",
    magic: { atk: 3, dmg: 3 },
    mech: { passive: ['riposte'] },
  }),
  mk('talisman-of-pure-good', 'Talisman of Pure Good', {
    kind: 'amulet', slot: 'amulet', cost: 160000, weight: 0.5, rarity: 'legendary', attunement: true,
    icon: 'holy', tint: '#fff0c0',
    desc: "A platinum disc set with seven small gems, unbearably warm in a wicked hand. Seven times it will open the ground under an evil creature and close it again.",
    charges: 7, recharge: 'never', consumable: false,
    mech: { spellAtkBonus: 2, passive: ['good-only', 'talisman-good'] },
    use: { kind: 'utility', tag: 'talisman-smite', save: { ability: 'dex', dc: 20 }, cost: 'action' },
  }),
  magicWeapon('vorpal-sword', 'Vorpal Sword', 'greatsword', {
    cost: 200000, rarity: 'legendary', attunement: true, tint: '#f0f8ff', icon: 'sword',
    desc: "A sword whose edge ignores resistance and, on a perfect stroke, ignores the neck as well. Waterdeep's executioners are not permitted to own one.",
    magic: { atk: 3, dmg: 3 },
    mech: { passive: ['vorpal', 'ignore-slashing-resistance'] },
  }),
);

// ===========================================================================
// 6. SWORD COAST UNIQUES
// The Forge of Spells beneath Wave Echo Cave, Glasstaff's study under Tresendar
// Manor, Blackstaff Tower and Ahghairon's Waterdeep. Each carries the history
// that makes it worth taking off a corpse.
// ===========================================================================

ALL.push(
  magicWeapon('lightbringer', 'Lightbringer', 'mace', {
    cost: 900, rarity: 'uncommon', tint: '#ffe9a8', icon: 'radiant',
    desc: "A mace forged at the Forge of Spells in Wave Echo Cave for a cleric of Lathander, and lost when the mine fell five hundred years ago. Speak the word and the head blazes like the sunrise; the undead of the mine remember it and hate it.",
    magic: { atk: 1, dmg: 1 },
    mech: { bonusDamage: [{ dice: '1d6', type: 'radiant', vs: 'undead' }], passive: ['light-20'] },
    unique: true, origin: 'wave-echo-cave',
  }),
  magicWeapon('talon', 'Talon', 'longsword', {
    cost: 900, rarity: 'uncommon', tint: '#8fd0ff', icon: 'thunder',
    desc: "A longsword made at the Forge of Spells for a knight of Neverwinter, its blade etched with a stooping hawk. Underground it sheds a cold blue light, and the storm in the steel earths itself in whatever it cuts.",
    magic: { atk: 1, dmg: 1 },
    mech: { bonusDamage: [{ dice: '1d6', type: 'lightning', when: 'underground' }], passive: ['light-underground'] },
    unique: true, origin: 'wave-echo-cave',
  }),
  magicWeapon('hew', 'Hew', 'battleaxe', {
    cost: 900, rarity: 'uncommon', tint: '#a8c088', icon: 'axe',
    desc: "A dwarven battleaxe of Rockseeker make, carried into Wave Echo Cave and never carried out. The blade takes wood, root and shell apart as though they had agreed to it beforehand.",
    magic: { atk: 1, dmg: 1 },
    mech: { bonusDamage: [{ dice: '1d8', type: 'slashing', vs: 'plant' }, { dice: '1d8', type: 'slashing', vs: 'construct' }] },
    unique: true, origin: 'wave-echo-cave',
  }),
  magicArmor('dragonguard', 'Dragonguard', 'breastplate', {
    cost: 6000, rarity: 'rare', attunement: true, tint: '#4a8a5a',
    desc: "A breastplate of green dragon scale, made at the Forge of Spells in the days when Phandelver's Pact still held. Dragon-fire, dragon-frost and dragon-breath of every colour break on it and go around.",
    ac: 15,
    mech: { resist: ['dragon-breath'], advSaveVs: ['dragon-breath'], passive: ['dragonguard'] },
    unique: true, origin: 'wave-echo-cave',
  }),
  staff('staff-of-defense', 'Staff of Defense', {
    cost: 3000, rarity: 'rare', attunement: true, tint: '#cfd8e8', icon: 'shield',
    desc: "Iarno Albrek carried this glass-headed staff under Tresendar Manor and called himself Glasstaff for it. It clothes its bearer in mage armour and throws up a shield of force at need.",
    magic: { atk: 0, dmg: 0 },
    charges: 6, rechargeDice: '1d6',
    use: { kind: 'spell', spellId: 'shield', level: 1, cost: 'reaction' },
    spells: ['mage-armor', 'shield'],
    unique: true, origin: 'tresendar-manor',
  }),
  staff('spider-staff', 'The Spider Staff', {
    cost: 7000, rarity: 'rare', attunement: true, tint: '#3a2a4a', icon: 'staff',
    desc: "Nezznar the Black Spider carried this staff of black wood, its head carved as a spider with garnet eyes, out of the Underdark and into Phandelver. Lolth's mark is on it, and it webs and poisons at his word.",
    magic: { atk: 1, dmg: 1 },
    charges: 7, rechargeDice: '1d6+1',
    mech: { bonusDamage: [{ dice: '1d6', type: 'poison' }], climbSpeed: 20, passive: ['spider-climb'] },
    use: { kind: 'spell', spellId: 'web', level: 2, cost: 'action' },
    spells: ['spider-climb', 'web'],
    unique: true, origin: 'wave-echo-cave',
  }),
  wond('gauntlets-of-the-blackstaff', 'Gauntlets of the Blackstaff', 'gloves', {
    cost: 30000, weight: 2, rarity: 'very-rare', attunement: true, icon: 'armor', tint: '#2a2a3a',
    desc: "Black leather gauntlets sewn with silver Netherese script, made in Blackstaff Tower for the archmage's own hands. Spells cast through them land harder, and once a day one may be caught and unravelled mid-air.",
    mech: { spellAtkBonus: 2, spellDcBonus: 1, passive: ['blackstaff-gauntlets'] },
    charges: 1, recharge: 'dawn', consumable: false,
    use: { kind: 'spell', spellId: 'counterspell', level: 3, cost: 'reaction' },
    unique: true, origin: 'blackstaff-tower',
  }),
  wond('ahghairons-sash', "Ahghairon's Sash", 'amulet', {
    cost: 34000, weight: 1, rarity: 'very-rare', attunement: true, icon: 'cloak', tint: '#8a6ad8',
    desc: "A wide sash of purple silk worked with the arms of Waterdeep, worn by Ahghairon the first Lord of Waterdeep and kept in his tower for a century after his death. It wards its wearer as the old wizard warded his city.",
    mech: { acBonus: 2, saveBonus: 2, resist: ['force'], advSaveVs: ['spell'] },
    unique: true, origin: 'waterdeep',
  }),
  wond('halasters-ring', "Halaster's Ring", 'ring', {
    cost: 36000, weight: 0, rarity: 'very-rare', attunement: true, icon: 'ring', tint: '#7a3a7a',
    desc: "A ring of pitted brass that Halaster Blackcloak left on a corpse in Undermountain, deliberately, as a joke whose punchline has not arrived. It steps its wearer through stone — usually to somewhere the Mad Mage would like them to be.",
    charges: 3, recharge: 'dawn', consumable: false,
    mech: { passive: ['halaster-attention'] },
    use: { kind: 'spell', spellId: 'dimension-door', level: 4, cost: 'action' },
    spells: ['misty-step', 'dimension-door', 'passwall'],
    unique: true, origin: 'undermountain',
  }),
  staff('ahghairons-dragonstaff', "Ahghairon's Dragonstaff", {
    cost: 200000, rarity: 'legendary', attunement: true, tint: '#8a6ad8', icon: 'staff',
    desc: "The staff with which Ahghairon raised the dragonward over Waterdeep, kept in a sealed tower behind three magical locks. Dragonkind cannot abide its bearer, and the bearer, briefly, cannot be touched by anything at all.",
    magic: { atk: 3, dmg: 3 },
    charges: 10, rechargeDice: '1d8+2',
    mech: {
      acBonus: 2, saveBonus: 2, advSaveVs: ['dragon-breath'],
      bonusDamage: [{ dice: '4d6', type: 'force', vs: 'dragon' }],
      passive: ['dragonward', 'ahghairon'],
    },
    use: { kind: 'spell', spellId: 'globe-of-invulnerability', level: 6, cost: 'action' },
    spells: ['dispel-magic', 'globe-of-invulnerability', 'hold-monster', 'wall-of-force'],
    unique: true, origin: 'waterdeep',
  }),
);

// ===========================================================================
// 7. THE CATALOGUE
// ===========================================================================

/** Every magic item in the game, keyed by id and deep frozen. */
export const MAGIC_ITEMS = deepFreeze(Object.fromEntries(ALL.map((e) => [e.id, e])));
export const MAGIC_ITEM_IDS = Object.freeze(Object.keys(MAGIC_ITEMS));

// ===========================================================================
// 8. MAGIC_TIERS — which rarities a party of a given level is allowed to find.
// rules/scaling.js `magicTierFor(level)` reads { minLevel, rarities, plusMax,
// chance }; `chance` is the per-roll probability that an encounter coughs up
// something magical at all.
// ===========================================================================

export const MAGIC_TIERS = deepFreeze({
  minor: {
    id: 'minor', name: 'Local Trouble', minLevel: 1, maxLevel: 4,
    rarities: ['common', 'uncommon'], plusMax: 1, chance: 0.10,
    desc: "Goblin hoards and Redbrand strongboxes. A +1 blade is the talk of Phandalin for a tenday.",
  },
  lesser: {
    id: 'lesser', name: 'Heroes of the Frontier', minLevel: 5, maxLevel: 10,
    rarities: ['common', 'uncommon', 'rare'], plusMax: 2, chance: 0.16,
    desc: "Cragmaw Castle, Wave Echo Cave, Thundertree. The Forge of Spells still has things in it.",
  },
  greater: {
    id: 'greater', name: 'Masters of the Sword Coast', minLevel: 11, maxLevel: 16,
    rarities: ['uncommon', 'rare', 'very-rare'], plusMax: 2, chance: 0.22,
    desc: "Dragon hoards out of Kryptgarden and Icespire, and the deeper vaults of Undermountain.",
  },
  major: {
    id: 'major', name: 'Masters of the Realms', minLevel: 17, maxLevel: 20,
    rarities: ['rare', 'very-rare', 'legendary'], plusMax: 3, chance: 0.28,
    desc: "What liches, pit fiends and archmages keep. Names that will outlive you.",
  },
  mythic: {
    id: 'mythic', name: 'Beyond the Twentieth', minLevel: 21, maxLevel: 99,
    rarities: ['very-rare', 'legendary', 'artifact'], plusMax: 3, chance: 0.34,
    desc: "Halaster's own reserves, and whatever the deep floors of Undermountain have been hoarding.",
  },
});

// ===========================================================================
// 9. LOOT_TABLES — CR-banded treasure. rules/scaling.js `resolveLootTable`
// accepts the `items` array as [itemId, chance] pairs (a chance above 1 is read
// as a percentage), and `gold` is a plain NdS+M expression for core/dice.js.
// A monster's `loot.table` may name one of these ids directly.
// ===========================================================================

export const LOOT_TABLES = deepFreeze({
  'cr-trivial': {
    id: 'cr-trivial', name: 'Scavenged Pockets', crMin: 0, crMax: 0.5,
    gold: '3d6',
    items: [
      ['rations', 0.30], ['torch', 0.25], ['potion-healing', 0.10],
      ['dagger', 0.10], ['arrow', 0.20], ['rope-hempen', 0.06],
      ['tinderbox', 0.10], ['goblin-totem', 0.08], ['gem-quartz', 0.05],
      ['oil-flask', 0.08], ['sling-bullet', 0.10], ['club', 0.08],
    ],
  },
  'cr-low': {
    id: 'cr-low', name: 'Bandit Spoils', crMin: 1, crMax: 2,
    gold: '4d6+4',
    items: [
      ["coast-cutlass",0.025], ["second-wind-draught",0.025],
      ['potion-healing', 0.20], ['antitoxin', 0.08], ['shortsword', 0.10],
      ['leather-armor', 0.08], ['shield', 0.08], ['crossbow-bolt', 0.15],
      ['gem-malachite', 0.08], ['gem-quartz', 0.08], ['thieves-tools', 0.06],
      ['redbrand-cloak', 0.10], ['healers-kit', 0.08], ['scroll-1', 0.06],
      ['ore-sample-phandalin', 0.06],
    ],
  },
  'cr-mid-low': {
    id: 'cr-mid-low', name: 'Warband Cache', crMin: 3, crMax: 4,
    gold: '2d20+20',
    items: [
      ["dockside-lash",0.025], ["longbow-of-warning",0.025], ["clearhead-tonic",0.025],
      ['potion-healing', 0.25], ['potion-greater-healing', 0.10],
      ['chain-shirt', 0.08], ['scale-mail', 0.06], ['longsword', 0.08],
      ['gem-moonstone', 0.10], ['gem-onyx', 0.08], ['scroll-2', 0.08],
      ['scroll-magic-missile', 0.06], ['oil-slipperiness', 0.06],
      ['longsword-plus1', 0.04], ['shield-plus1', 0.03], ['driftglobe', 0.03],
      ['dragon-cult-token', 0.05],
    ],
  },
  'cr-mid': {
    id: 'cr-mid', name: 'Lair Hoard', crMin: 5, crMax: 7,
    gold: '6d20+40',
    items: [
      ["everburn-blade",0.025], ["vicious-longsword",0.025], ["lamplighters-mace",0.025], ["gold-wyrmling-staff",0.025],
      ['potion-greater-healing', 0.22], ['potion-resistance', 0.08],
      ['scroll-3', 0.10], ['scroll-fireball', 0.05],
      ['gem-pearl', 0.10], ['gem-jade', 0.08], ['gem-amber', 0.08],
      ['longsword-plus1', 0.06], ['studded-leather-plus1', 0.05],
      ['shield-plus1', 0.05], ['cloak-of-protection', 0.03],
      ['boots-of-elvenkind', 0.03], ['bag-of-holding', 0.03],
      ['wand-of-magic-missiles', 0.03], ['pearl-of-power', 0.02],
      ['silver-ore-wave-echo', 0.06],
    ],
  },
  'cr-high-low': {
    id: 'cr-high-low', name: 'Chieftain\'s Vault', crMin: 8, crMax: 10,
    gold: '4d100+100',
    items: [
      ["stormglass-longbow",0.025], ["moonreef-trident",0.025], ["phalar-aluve",0.025], ["defender-flail",0.025],
      ['potion-superior-healing', 0.18], ['potion-heroism', 0.08],
      ['scroll-4', 0.10], ['scroll-5', 0.05],
      ['gem-emerald', 0.08], ['gem-black-pearl', 0.06], ['gem-ruby', 0.05],
      ['longsword-plus2', 0.05], ['chain-mail-plus1', 0.05],
      ['shield-plus2', 0.04], ['ring-of-protection', 0.03],
      ['bracers-of-defense', 0.03], ['cloak-of-displacement', 0.02],
      ['flame-tongue', 0.02], ['staff-of-healing', 0.02],
      ['amulet-of-health', 0.02], ['platinum-ingot', 0.06],
    ],
  },
  'cr-high': {
    id: 'cr-high', name: 'Dragon Hoard', crMin: 11, crMax: 13,
    gold: '6d100+200',
    items: [
      ["flame-tongue-rapier",0.025], ["knife-undermountain-king",0.025],
      ['potion-superior-healing', 0.20], ['potion-flying', 0.06],
      ['scroll-5', 0.10], ['scroll-6', 0.06],
      ['gem-diamond', 0.06], ['gem-ruby', 0.08], ['gem-emerald', 0.08],
      ['half-plate-plus2', 0.05], ['greatsword-plus2', 0.05],
      ['ring-of-protection', 0.04], ['sun-blade', 0.03],
      ['dragon-slayer', 0.03], ['wand-of-fireballs', 0.03],
      ['ioun-stone-protection', 0.02], ['wings-of-flying', 0.02],
      ['belt-of-hill-giant-strength', 0.02],
    ],
  },
  'cr-elite': {
    id: 'cr-elite', name: 'Archmage\'s Reserve', crMin: 14, crMax: 16,
    gold: '10d100+400',
    items: [
      ["frost-brand-greatsword",0.025],
      ['potion-supreme-healing', 0.18], ['potion-giant-strength-fire', 0.05],
      ['scroll-7', 0.08], ['scroll-8', 0.04],
      ['gem-diamond', 0.10], ['diamond-dust', 0.10],
      ['plate-armor-plus3', 0.04], ['longsword-plus3', 0.04],
      ['frost-brand', 0.03], ['scimitar-of-speed', 0.03],
      ['dwarven-plate', 0.02], ['staff-of-power', 0.02],
      ['carpet-of-flying', 0.02], ['crystal-ball', 0.02],
      ['ioun-stone-intellect', 0.02], ['rod-of-absorption', 0.02],
    ],
  },
  'cr-legendary': {
    id: 'cr-legendary', name: 'Godsfall Trove', crMin: 17, crMax: 20,
    gold: '12d100+800',
    items: [
      ['potion-supreme-healing', 0.22], ['potion-vitality', 0.08],
      ['scroll-8', 0.08], ['scroll-9', 0.04],
      ['gem-diamond', 0.14], ['diamond-dust', 0.14],
      ['sword-of-sharpness', 0.04], ['staff-of-frost', 0.03],
      ['robe-of-the-archmagi', 0.02], ['holy-avenger', 0.02],
      ['defender', 0.02], ['luck-blade', 0.02],
      ['belt-of-cloud-giant-strength', 0.02], ['scarab-of-protection', 0.02],
      ['cloak-of-invisibility', 0.01],
    ],
  },
  'cr-mythic': {
    id: 'cr-mythic', name: 'Halaster\'s Deep Cache', crMin: 21, crMax: 24,
    gold: '20d100+1500',
    items: [
      ['potion-supreme-healing', 0.25], ['potion-vitality', 0.12],
      ['scroll-9', 0.08], ['gem-diamond', 0.20], ['diamond-dust', 0.20],
      ['vorpal-sword', 0.03], ['staff-of-the-magi', 0.02],
      ['hammer-of-thunderbolts', 0.02], ['ring-of-three-wishes', 0.01],
      ['sphere-of-annihilation', 0.01], ['deck-of-many-things', 0.01],
      ['belt-of-storm-giant-strength', 0.02], ['halasters-ring', 0.02],
    ],
  },
  'cr-transcendent': {
    id: 'cr-transcendent', name: 'The Mad Mage\'s Own', crMin: 25, crMax: 99,
    gold: '30d100+3000',
    items: [
      ['potion-supreme-healing', 0.30], ['potion-vitality', 0.15],
      ['scroll-9', 0.12], ['gem-diamond', 0.25], ['diamond-dust', 0.25],
      ['ahghairons-dragonstaff', 0.02], ['ring-of-three-wishes', 0.02],
      ['talisman-of-pure-good', 0.02], ['armor-of-invulnerability', 0.02],
      ['sword-of-answering', 0.02], ['iron-flask', 0.02],
    ],
  },

  // --- themed tables a stat block can name directly ------------------------
  'goblinoid': {
    id: 'goblinoid', name: 'Cragmaw Plunder', crMin: 0, crMax: 4,
    gold: '3d6+3',
    items: [
      ['goblin-totem', 0.20], ['rations', 0.25], ['scimitar', 0.10],
      ['shortbow', 0.08], ['arrow', 0.25], ['hide-armor', 0.08],
      ['potion-healing', 0.12], ['coster-crate', 0.06], ['gem-quartz', 0.06],
    ],
  },
  'redbrands': {
    id: 'redbrands', name: 'Redbrand Takings', crMin: 0, crMax: 5,
    gold: '4d10+10',
    items: [
      ['redbrand-cloak', 0.35], ['shortsword', 0.15], ['studded-leather', 0.10],
      ['potion-healing', 0.15], ['thieves-tools', 0.08], ['zzar', 0.10],
      ['gem-malachite', 0.08], ['manacles', 0.06],
    ],
  },
  'undead-crypt': {
    id: 'undead-crypt', name: 'Grave Goods', crMin: 1, crMax: 10,
    gold: '3d20+10',
    items: [
      ['holy-water', 0.12], ['gem-onyx', 0.14], ['gem-black-pearl', 0.06],
      ['scroll-lesser-restoration', 0.08], ['potion-greater-healing', 0.12],
      ['signet-ring', 0.10], ['reliquary', 0.06], ['mace-of-disruption', 0.02],
      ['lightbringer', 0.02], ['periapt-of-wound-closure', 0.03],
    ],
  },
  'cult-dragon': {
    id: 'cult-dragon', name: 'Cult of the Dragon Reliquary', crMin: 2, crMax: 12,
    gold: '5d20+25',
    items: [
      ['dragon-cult-token', 0.30], ['scroll-3', 0.10], ['gem-ruby', 0.08],
      ['potion-fire-breath', 0.10], ['potion-resistance', 0.08],
      ['scale-mail', 0.08], ['dragonguard', 0.02], ['wand-of-fireballs', 0.02],
      ['ring-of-resistance-fire', 0.02],
    ],
  },
  'drow-raiders': {
    id: 'drow-raiders', name: 'Underdark Spoils', crMin: 3, crMax: 14,
    gold: '4d20+40',
    items: [
      ['rapier', 0.10], ['hand-crossbow', 0.08], ['poison-basic', 0.15],
      ['elven-chain', 0.03], ['cloak-of-elvenkind', 0.04],
      ['slippers-of-spider-climbing', 0.03], ['spider-staff', 0.01],
      ['gem-black-pearl', 0.10], ['wand-of-web', 0.03],
    ],
  },
  'forge-of-spells': {
    id: 'forge-of-spells', name: 'The Forge of Spells', crMin: 4, crMax: 12,
    gold: '6d20+60',
    items: [
      ['silver-ore-wave-echo', 0.30], ['lightbringer', 0.12], ['talon', 0.12],
      ['hew', 0.12], ['dragonguard', 0.08], ['spider-staff', 0.05],
      ['potion-greater-healing', 0.20], ['gem-moonstone', 0.12],
      ['longsword-plus1', 0.08], ['shield-plus1', 0.08],
    ],
  },
  'giant-camp': {
    id: 'giant-camp', name: 'Giant Camp Plunder', crMin: 5, crMax: 16,
    gold: '8d20+80',
    items: [
      ['greatclub', 0.15], ['gem-amber', 0.10], ['gem-emerald', 0.08],
      ['potion-giant-strength-hill', 0.08], ['belt-of-hill-giant-strength', 0.03],
      ['belt-of-stone-giant-strength', 0.02], ['hammer-of-thunderbolts', 0.01],
      ['horn-of-valhalla-silver', 0.02], ['maul', 0.08],
    ],
  },
  'wizard-study': {
    id: 'wizard-study', name: "A Wizard's Study", crMin: 3, crMax: 20,
    gold: '4d20+40',
    items: [
      ['spellbook', 0.20], ['ink', 0.20], ['scroll-2', 0.14], ['scroll-3', 0.10],
      ['scroll-4', 0.06], ['component-pouch', 0.12], ['diamond-dust', 0.10],
      ['pearl-of-power', 0.04], ['wand-of-magic-detection', 0.04],
      ['staff-of-defense', 0.02], ['robe-of-useful-items', 0.02],
      ['gauntlets-of-the-blackstaff', 0.01],
    ],
  },
});

// ===========================================================================
// 10. HELPERS — small, pure, and the only functions this module exports.
// ===========================================================================

// Built once at load so the loot roller is not O(catalogue) per drop.
const BY_RARITY = (() => {
  const idx = { common: [], uncommon: [], rare: [], 'very-rare': [], legendary: [], artifact: [] };
  for (const id of MAGIC_ITEM_IDS) {
    const r = MAGIC_ITEMS[id].rarity;
    (idx[r] = idx[r] || []).push(id);
  }
  return deepFreeze(idx);
})();

/**
 * Every magic item id of a rarity. Accepts one rarity or a list of them, and
 * always returns a fresh array so the caller may sort or splice it freely.
 * magicByRarity('rare') -> ['amulet-of-health', 'arrow-of-dragon-slaying', ...]
 */
export function magicByRarity(r) {
  if (Array.isArray(r)) {
    const out = [];
    for (const one of r) for (const id of BY_RARITY[String(one).toLowerCase()] || []) out.push(id);
    return out;
  }
  return (BY_RARITY[String(r).toLowerCase()] || []).slice();
}

/**
 * The treasure table for a challenge rating. Returns the CR-banded table whose
 * range contains `cr` (the themed tables are keyed by name and never matched
 * here). Falls back to the trivial band so a caller never has to null-check.
 */
export function lootTableFor(cr) {
  const c = Number(cr);
  const n = Number.isFinite(c) ? c : 0;
  const bands = [
    'cr-trivial', 'cr-low', 'cr-mid-low', 'cr-mid', 'cr-high-low',
    'cr-high', 'cr-elite', 'cr-legendary', 'cr-mythic', 'cr-transcendent',
  ];
  for (const id of bands) {
    const t = LOOT_TABLES[id];
    if (n >= t.crMin && n <= t.crMax) return t;
  }
  return n < 0 ? LOOT_TABLES['cr-trivial'] : LOOT_TABLES['cr-transcendent'];
}

/** How many magic items are catalogued — used by the debug screen. */
export function magicItemCount() { return MAGIC_ITEM_IDS.length; }
