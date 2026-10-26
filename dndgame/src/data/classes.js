// src/data/classes.js — catalogue of all 12 D&D 5.5e (2024 PHB) classes, levels 1–20.
//
// PURE DATA MODULE. No imports. Read by rules/character.js, rules/progression.js,
// rules/spellcasting.js and ui/levelup.js. Never mutate — the export is deep-frozen.
//
// ---------------------------------------------------------------------------
// SHAPE (see docs/SPEC.md §3)
//   CLASSES[id] = {
//     id, name, desc, hitDie, primary[], saves[], armorProf[], weaponProf[],
//     toolProf[], skillChoices:{count,from[]}, startingGold, startingGoldFixed,
//     startingKits[], spellcasting|null, features:{1..20}, subclassLevel,
//     subclassFeatureLevels[], subclasses[], weaponMasteryCount|null, progression{}
//   }
//   featureObj = { id, name, desc, mech?, uses?, choice?, alt? }
//
// TABLE CONVENTION: every progression array in this file is 21 entries long and is
// indexed by CLASS LEVEL, so table[0] is a dead slot and table[5] is the value at
// 5th level. `uses:{ max:<array>, recharge:'long' }` means "index this by level".
//
// ---------------------------------------------------------------------------
// `mech` VOCABULARY
//   Core keys (identical to species.js, see SPEC §3):
//     asi, speedBonus, darkvision, resist, immune, vuln, condImmune, advSaveVs,
//     advVs, skillProf, skillExpertise, toolProf, weaponProf, armorProf, saveProf,
//     hpPerLevel, maxHpBonus, acFormula, unarmedDie, naturalWeapon, cantrip,
//     spellPerRest, extraAttack, critRange, initiativeBonus, profToInitiative,
//     carryMult, jumpMult, breathWeapon, resource, grantFeat, passive
//   Class extras (consumed by rules/combat.js + rules/character.js):
//     rageDamage, sneakAttack, martialArtsDie, bardicDie, wildShape, layOnHands,
//     aura, masteryCount, invocationsKnown, metamagicKnown, mysticArcanum,
//     alwaysPrepared, freeCasts, damageBonus, tempHpFormula, reroll, capAbility
// ---------------------------------------------------------------------------

// ─── SHARED PROGRESSION TABLES ─────────────────────────────────────────────

// Prepared-spell counts, 2024 PHB class tables. All 2024 casters PREPARE spells.
const PREP_FULL = [0, 4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 17, 18, 18, 19, 20, 21, 22];
const PREP_SORC = [0, 2, 4, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 17, 18, 18, 19, 20, 21, 22];
const PREP_HALF = [0, 2, 3, 4, 5, 6, 6, 7, 7, 9, 9, 10, 10, 11, 11, 12, 12, 14, 14, 15, 15];
const PREP_PACT = [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15];

// Cantrips known. 2/3/4-at-first-level variants; +1 at 4th and +1 at 10th.
const CANTRIPS_2 = [0, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
const CANTRIPS_3 = [0, 3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
const CANTRIPS_4 = [0, 4, 4, 4, 5, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6];
const CANTRIPS_0 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

// Weapon Mastery counts (2024). Monks are NOT granted Weapon Mastery by the 2024
// PHB, so their table is all zeroes — kept present so the UI can read every class
// through the same field.
const MASTERY_BARB = [0, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
const MASTERY_FIGHTER = [0, 3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6];
const MASTERY_HALF = [0, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3];
const MASTERY_ROGUE = [0, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
const MASTERY_NONE = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

// Ability Score Improvement. In the 2024 rules an ASI is really "take the Ability
// Score Improvement feat, or any other feat you qualify for" — hence `alt`.
const ASI = {
  id: 'asi',
  name: 'Ability Score Improvement',
  desc: 'Hard-won mastery settles into bone and habit. Raise one ability score by 2, or two scores by 1 each (maximum 20) — or take another feat you qualify for instead.',
  choice: { type: 'asi', count: 1, from: 'auto' },
  alt: { type: 'feat', count: 1, from: 'general' },
};

// 2024 replaces the 19th-level ASI with an Epic Boon feat; `alt` keeps the old
// +2/+1 available for players who would rather have the numbers.
const EPIC_BOON = {
  id: 'epic-boon',
  name: 'Epic Boon',
  desc: 'You brush something greater than mortal skill — a gift of Mystra, of Tempus, of the raw Weave itself. Gain an Epic Boon feat, or another feat you qualify for.',
  choice: { type: 'feat', count: 1, from: 'epic-boon' },
  alt: { type: 'asi', count: 1, from: 'auto' },
};

// Skill lists reused by several classes.
const ALL_SKILLS = [
  'acrobatics', 'animal-handling', 'arcana', 'athletics', 'deception', 'history',
  'insight', 'intimidation', 'investigation', 'medicine', 'nature', 'perception',
  'performance', 'persuasion', 'religion', 'sleight-of-hand', 'stealth', 'survival',
];

export const CLASSES = {

  // ═══════════════════════════════════════════════════════════════════════════
  // BARBARIAN
  // ═══════════════════════════════════════════════════════════════════════════
  barbarian: {
    id: 'barbarian',
    name: 'Barbarian',
    desc: 'A furious warrior of the wild places — an Uthgardt of the Reghed plains, a Nether Mountains raider, a Northlander who fights on the strength of a rage older than any city. Armour is for people who expect to be hit.',
    hitDie: 12,
    primary: ['str'],
    saves: ['str', 'con'],
    armorProf: ['light', 'medium', 'shields'],
    weaponProf: ['simple', 'martial'],
    toolProf: [],
    skillChoices: { count: 2, from: ['animal-handling', 'athletics', 'intimidation', 'nature', 'perception', 'survival'] },
    startingGold: '2d4*10',
    startingGoldFixed: 75,
    startingKits: [
      { id: 'uthgardt-raider', name: 'Uthgardt Raider', desc: 'The kit of a Great Wyrm tribesman come down out of the Nether Mountains.', items: [['greataxe', 1], ['handaxe', 4], ['explorers-pack', 1], ['bedroll', 1]], gold: 15 },
      { id: 'reghed-nomad', name: 'Reghed Nomad', desc: 'Spear and hide-shield of the northern tundra, where the cold kills more often than the axe.', items: [['greatsword', 1], ['javelin', 4], ['hide-armor', 1], ['explorers-pack', 1]], gold: 12 },
      { id: 'barbarian-purse', name: 'Coin and Nothing Else', desc: 'You sold everything at Barthen\'s and mean to buy your own war.', items: [], gold: 75 },
    ],
    spellcasting: null,
    subclassLevel: 3,
    subclassFeatureLevels: [3, 6, 10, 14],
    subclasses: ['berserker', 'wild-heart', 'world-tree', 'zealot'],
    weaponMasteryCount: MASTERY_BARB,
    progression: {
      rageUses: [0, 2, 2, 3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 6, 6, 6, 6],
      rageDamage: [0, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4],
      brutalStrikeDice: [0, 0, 0, 0, 0, 0, 0, 0, 0, '1d10', '1d10', '1d10', '1d10', '1d10', '1d10', '1d10', '1d10', '2d10', '2d10', '2d10', '2d10'],
    },
    features: {
      1: [
        {
          id: 'rage', name: 'Rage',
          desc: 'As a Bonus Action you give the fury its head: advantage on Strength checks and saves, bonus damage on Strength-based weapon attacks, and resistance to bludgeoning, piercing and slashing damage. It lasts ten minutes, and ends early if you neither attack nor take damage.',
          uses: { max: [0, 2, 2, 3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 6, 6, 6, 6], recharge: 'long' },
          mech: {
            resource: { id: 'rage', name: 'Rage', max: 2, recharge: 'long' },
            rageDamage: 2, resist: ['bludgeoning', 'piercing', 'slashing'],
            advVs: ['str-check'], advSaveVs: ['str'], passive: 'rage',
          },
        },
        {
          id: 'barb-unarmored-defense', name: 'Unarmored Defense',
          desc: 'Scars, sinew and animal wariness serve where a breastplate would only slow you. While you wear no armour your AC equals 10 + Dexterity modifier + Constitution modifier; a shield is still allowed.',
          mech: { acFormula: { base: 10, addDex: true, addCon: true, cap: null, requiresNoArmor: true, allowShield: true } },
        },
        {
          id: 'barb-weapon-mastery', name: 'Weapon Mastery',
          desc: 'You know two weapons the way a smith knows a hammer, and can use their mastery properties. Swap one for another after every Long Rest.',
          mech: { masteryCount: 2 },
          choice: { type: 'mastery', count: 2, from: 'auto' },
        },
      ],
      2: [
        { id: 'danger-sense', name: 'Danger Sense', desc: 'Something in the treeline moves wrong and you are already turning. You have advantage on Dexterity saving throws unless you are Incapacitated.', mech: { advSaveVs: ['dex'], passive: 'danger-sense' } },
        { id: 'reckless-attack', name: 'Reckless Attack', desc: 'You abandon all defence for the first swing of your turn. Melee attacks using Strength gain advantage this turn — and every attack against you gains it too.', mech: { passive: 'reckless-attack' } },
      ],
      3: [
        {
          id: 'primal-knowledge', name: 'Primal Knowledge',
          desc: 'The wild taught you things no tutor in Neverwinter could. Gain proficiency in one more barbarian skill, and while Raging you may make Strength checks in place of Acrobatics, Intimidation, Perception, Stealth or Survival checks.',
          mech: { passive: 'primal-knowledge' },
          choice: { type: 'skill', count: 1, from: ['animal-handling', 'athletics', 'intimidation', 'nature', 'perception', 'survival'] },
        },
        {
          id: 'barb-subclass', name: 'Barbarian Subclass',
          desc: 'The shape your fury takes: the raw Berserker, the totem-bound Wild Heart, the World Tree\'s branches, or the god-driven Zealot.',
          choice: { type: 'subclass', count: 1, from: ['berserker', 'wild-heart', 'world-tree', 'zealot'] },
        },
      ],
      4: [ASI],
      5: [
        { id: 'barb-extra-attack', name: 'Extra Attack', desc: 'One swing was never going to be enough. You attack twice whenever you take the Attack action.', mech: { extraAttack: 1 } },
        { id: 'fast-movement', name: 'Fast Movement', desc: 'You cover ground like something being hunted, or hunting. Your speed increases by 10 feet while you wear no Heavy armour.', mech: { speedBonus: 10, passive: 'fast-movement' } },
      ],
      6: [{ id: 'barb-subclass-6', name: 'Subclass Feature', desc: 'Your path deepens and grants a new feature.', choice: { type: 'subclassOption', count: 1, from: 'auto' } }],
      7: [
        { id: 'feral-instinct', name: 'Feral Instinct', desc: 'You come awake fighting. You have advantage on Initiative rolls.', mech: { passive: 'adv-initiative' } },
        { id: 'instinctive-pounce', name: 'Instinctive Pounce', desc: 'When you enter your Rage as a Bonus Action, you can move up to half your speed as part of that same Bonus Action.', mech: { passive: 'instinctive-pounce' } },
      ],
      8: [ASI],
      9: [
        {
          id: 'brutal-strike', name: 'Brutal Strike',
          desc: 'When you use Reckless Attack you can forgo advantage on one attack to make it truly savage: on a hit it deals an extra 1d10 damage and you may apply Forceful Blow (push the target 15 feet and follow) or Hamstring Blow (its speed drops by 15 feet).',
          mech: { damageBonus: '1d10', passive: 'brutal-strike' },
        },
      ],
      10: [{ id: 'barb-subclass-10', name: 'Subclass Feature', desc: 'Your path deepens and grants a new feature.', choice: { type: 'subclassOption', count: 1, from: 'auto' } }],
      11: [
        { id: 'relentless-rage', name: 'Relentless Rage', desc: 'The rage refuses to let the body quit. When you drop to 0 hit points while Raging and do not die outright, make a DC 10 Constitution save to drop to 1 hit point instead; the DC rises by 5 each time until you finish a rest.', mech: { passive: 'relentless-rage' } },
      ],
      12: [ASI],
      13: [
        { id: 'improved-brutal-strike', name: 'Improved Brutal Strike', desc: 'Two more ways to break a foe: Staggering Blow (it has disadvantage on its next save and cannot take Reactions) and Sundering Blow (the next attack against it by another creature gains +5).', mech: { passive: 'improved-brutal-strike' } },
      ],
      14: [{ id: 'barb-subclass-14', name: 'Subclass Feature', desc: 'Your path reaches its full expression and grants a new feature.', choice: { type: 'subclassOption', count: 1, from: 'auto' } }],
      15: [
        { id: 'persistent-rage', name: 'Persistent Rage', desc: 'The fire banks but never goes out. When you roll Initiative you regain one expended use of Rage, and your Rage lasts ten minutes without needing you to attack or be attacked.', mech: { passive: 'persistent-rage' } },
      ],
      16: [ASI],
      17: [
        { id: 'brutal-strike-3', name: 'Improved Brutal Strike (2d10)', desc: 'Your Brutal Strike now deals an extra 2d10 damage, and you may apply two of its effects to a single blow.', mech: { damageBonus: '2d10', passive: 'brutal-strike-2' } },
      ],
      18: [
        { id: 'indomitable-might', name: 'Indomitable Might', desc: 'Raw strength overrules chance. If the total of a Strength check or Strength saving throw is less than your Strength score, use the score instead.', mech: { passive: 'indomitable-might' } },
      ],
      19: [EPIC_BOON],
      20: [
        { id: 'primal-champion', name: 'Primal Champion', desc: 'You are the storm the Uthgardt sing about. Your Strength and Constitution increase by 4, and their maximum becomes 25.', mech: { asi: { str: 4, con: 4 }, capAbility: { str: 25, con: 25 } } },
      ],
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // BARD
  // ═══════════════════════════════════════════════════════════════════════════
  bard: {
    id: 'bard',
    name: 'Bard',
    desc: 'A student of the Words of Creation, whether trained in a Waterdhavian college or taught in the common room of the Stonehill Inn. Bards carry rumour, courage and a very old kind of magic in the same breath.',
    hitDie: 8,
    primary: ['cha'],
    saves: ['dex', 'cha'],
    armorProf: ['light'],
    weaponProf: ['simple'],
    toolProf: ['musical-instrument-x3'],
    skillChoices: { count: 3, from: ALL_SKILLS },
    startingGold: '5d4*10',
    startingGoldFixed: 90,
    startingKits: [
      { id: 'college-troubadour', name: 'Troubadour of New Olamn', desc: 'The travelling kit of a Waterdhavian college student: lute, leathers and a good coat.', items: [['leather-armor', 1], ['dagger', 2], ['lute', 1], ['entertainers-pack', 1]], gold: 19 },
      { id: 'road-skald', name: 'Road Skald', desc: 'A rapier, a horn and a repertoire that gets you fed between Leilon and Phandalin.', items: [['leather-armor', 1], ['rapier', 1], ['horn', 1], ['entertainers-pack', 1], ['dagger', 1]], gold: 14 },
      { id: 'bard-purse', name: 'A Full Purse', desc: 'The songs paid well this season. Outfit yourself as you please.', items: [], gold: 90 },
    ],
    spellcasting: {
      ability: 'cha', type: 'prepared', list: 'bard',
      cantripsKnown: CANTRIPS_2,
      prepFormula: PREP_FULL, preparedTable: PREP_FULL,
      spellsKnownTable: null,
      ritual: true, focus: 'arcane', focusItem: 'lute',
      slotTable: 'full', swapOnLevelUp: 1, startLevel: 1,
    },
    subclassLevel: 3,
    subclassFeatureLevels: [3, 6, 14],
    subclasses: ['dance', 'glamour', 'lore', 'valor'],
    weaponMasteryCount: null,
    progression: {
      bardicDie: [0, '1d6', '1d6', '1d6', '1d6', '1d8', '1d8', '1d8', '1d8', '1d8', '1d10', '1d10', '1d10', '1d10', '1d10', '1d12', '1d12', '1d12', '1d12', '1d12', '1d12'],
    },
    features: {
      1: [
        {
          id: 'bardic-inspiration', name: 'Bardic Inspiration',
          desc: 'A word, a chord, a look — and someone believes they can do it. As a Bonus Action, give a creature within 60 feet a Bardic Inspiration die it can add to one d20 Test or damage roll within the hour.',
          uses: { max: 'cha', recharge: 'long' },
          mech: { resource: { id: 'bardic-inspiration', name: 'Bardic Inspiration', max: 'cha', recharge: 'long' }, bardicDie: '1d6' },
        },
        { id: 'bard-spellcasting', name: 'Spellcasting', desc: 'Your music is the shape you force on the Weave. You prepare and cast bard spells with Charisma, using a musical instrument as your focus.', mech: { passive: 'spellcasting' }, choice: { type: 'cantrip', count: 2, from: 'bard' } },
      ],
      2: [
        {
          id: 'bard-expertise', name: 'Expertise',
          desc: 'Two of your skills become the thing you are actually famous for: your proficiency bonus is doubled for their checks.',
          mech: { skillExpertise: [] },
          choice: { type: 'expertise', count: 2, from: 'proficient-skills' },
        },
        { id: 'jack-of-all-trades', name: 'Jack of All Trades', desc: 'You have picked up a passable amount of everything. Add half your proficiency bonus (rounded down) to any ability check that does not already include it.', mech: { passive: 'jack-of-all-trades' } },
      ],
      3: [
        { id: 'bard-subclass', name: 'Bard Subclass', desc: 'The college that claims you: Dance, Glamour, Lore or Valor.', choice: { type: 'subclass', count: 1, from: ['dance', 'glamour', 'lore', 'valor'] } },
      ],
      4: [ASI],
      5: [
        { id: 'font-of-inspiration', name: 'Font of Inspiration', desc: 'Inspiration comes as easily as breathing. You regain all expended Bardic Inspiration on a Short or Long Rest, and can expend a spell slot to regain one use.', mech: { resource: { id: 'bardic-inspiration', name: 'Bardic Inspiration', max: 'cha', recharge: 'short' }, bardicDie: '1d8' } },
      ],
      6: [{ id: 'bard-subclass-6', name: 'Subclass Feature', desc: 'Your college teaches you a new art.', choice: { type: 'subclassOption', count: 1, from: 'auto' } }],
      7: [
        { id: 'countercharm', name: 'Countercharm', desc: 'When you or a creature within 30 feet fails a save against being Frightened or Charmed, you can use your Reaction to spend a Bardic Inspiration die and force a reroll — the new roll stands.', mech: { passive: 'countercharm' } },
      ],
      8: [ASI],
      9: [
        {
          id: 'bard-expertise-2', name: 'Expertise (Second Pair)',
          desc: 'Two more skills become unmistakably yours, your proficiency bonus doubled for their checks.',
          mech: { skillExpertise: [] },
          choice: { type: 'expertise', count: 2, from: 'proficient-skills' },
        },
      ],
      10: [
        {
          id: 'magical-secrets', name: 'Magical Secrets',
          desc: 'No tradition is closed to a good enough ear. When you prepare bard spells you may also choose from the cleric, druid and wizard lists; they count as bard spells for you.',
          mech: { passive: 'magical-secrets', bardicDie: '1d10' },
        },
      ],
      11: [
        { id: 'bard-circle-6', name: 'Songs of the Sixth Circle', desc: 'Your repertoire admits sixth-circle magic — the songs that move armies and unmake weather.', mech: { passive: 'spell-tier-6' } },
      ],
      12: [ASI],
      13: [
        { id: 'bard-circle-7', name: 'Songs of the Seventh Circle', desc: 'Seventh-circle workings enter your repertoire, and your prepared list widens with them.', mech: { passive: 'spell-tier-7' } },
      ],
      14: [{ id: 'bard-subclass-14', name: 'Subclass Feature', desc: 'Your college grants its highest teaching.', choice: { type: 'subclassOption', count: 1, from: 'auto' } }],
      15: [
        { id: 'bard-inspiration-d12', name: 'Peerless Inspiration', desc: 'Your Bardic Inspiration die becomes a d12. A single word from you can turn a rout into a rally.', mech: { bardicDie: '1d12' } },
      ],
      16: [ASI],
      17: [
        { id: 'bard-circle-9', name: 'Songs of the Ninth Circle', desc: 'The highest circle opens. Very few singers on the Sword Coast have ever held a ninth-circle song in memory.', mech: { passive: 'spell-tier-9' } },
      ],
      18: [
        { id: 'superior-inspiration', name: 'Superior Inspiration', desc: 'When you roll Initiative you regain expended uses of Bardic Inspiration until you have two.', mech: { passive: 'superior-inspiration' } },
      ],
      19: [EPIC_BOON],
      20: [
        { id: 'words-of-creation', name: 'Words of Creation', desc: 'You have mastered two of the Words that shaped the world. Power Word Heal and Power Word Kill are always prepared, and when you cast either you may target a second creature within 10 feet of the first.', mech: { alwaysPrepared: ['power-word-heal', 'power-word-kill'], passive: 'words-of-creation' } },
      ],
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CLERIC
  // ═══════════════════════════════════════════════════════════════════════════
  cleric: {
    id: 'cleric',
    name: 'Cleric',
    desc: 'A mortal conduit for a god of Faerûn — Tymora\'s luck, Lathander\'s dawn, Tempus\'s war, Kelemvor\'s cold mercy. Clerics do not borrow divine power so much as agree to carry it.',
    hitDie: 8,
    primary: ['wis'],
    saves: ['wis', 'cha'],
    armorProf: ['light', 'medium', 'shields'],
    weaponProf: ['simple'],
    toolProf: [],
    skillChoices: { count: 2, from: ['history', 'insight', 'medicine', 'persuasion', 'religion'] },
    startingGold: '5d4*10',
    startingGoldFixed: 110,
    startingKits: [
      { id: 'shrine-acolyte', name: 'Acolyte of the Shrine of Luck', desc: 'Sister Garaele would recognise every piece: chain shirt, shield, mace and a coin-marked symbol of Tymora.', items: [['chain-shirt', 1], ['shield', 1], ['mace', 1], ['holy-symbol', 1], ['priests-pack', 1]], gold: 7 },
      { id: 'battle-chaplain', name: 'Battle Chaplain of Tempus', desc: 'Scale, warhammer and a field kit — the gear of a priest who follows the Lord of Battles onto the road.', items: [['scale-mail', 1], ['warhammer', 1], ['shield', 1], ['holy-symbol', 1], ['explorers-pack', 1], ['healers-kit', 1]], gold: 5 },
      { id: 'cleric-purse', name: 'Temple Stipend', desc: 'Your order sent you out with coin and their blessing, and left the rest to you.', items: [], gold: 110 },
    ],
    spellcasting: {
      ability: 'wis', type: 'prepared', list: 'cleric',
      cantripsKnown: CANTRIPS_3,
      prepFormula: PREP_FULL, preparedTable: PREP_FULL,
      spellsKnownTable: null,
      ritual: true, focus: 'holy', focusItem: 'holy-symbol',
      slotTable: 'full', swapOnLevelUp: 'all', startLevel: 1,
    },
    subclassLevel: 3,
    subclassFeatureLevels: [3, 6, 17],
    subclasses: ['life', 'light', 'trickery', 'war'],
    weaponMasteryCount: null,
    progression: {
      channelDivinityUses: [0, 0, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4],
    },
    features: {
      1: [
        { id: 'cleric-spellcasting', name: 'Spellcasting', desc: 'Your god answers in the language of prayer. You prepare and cast cleric spells with Wisdom, using a holy symbol as your focus.', mech: { passive: 'spellcasting' }, choice: { type: 'cantrip', count: 3, from: 'cleric' } },
        {
          id: 'divine-order', name: 'Divine Order',
          desc: 'Choose your service. A Protector takes up heavy armour and martial arms; a Thaumaturge takes up deeper study of the divine.',
          choice: { type: 'subclassOption', count: 1, from: ['protector', 'thaumaturge'] },
          options: [
            { id: 'protector', name: 'Protector', desc: 'Training in Martial weapons and Heavy armour.', mech: { weaponProf: ['martial'], armorProf: ['heavy'] } },
            { id: 'thaumaturge', name: 'Thaumaturge', desc: 'One extra cleric cantrip, and your Wisdom modifier is added to Arcana and Religion checks concerning gods, planes and the divine.', mech: { cantrip: { choose: 'cleric', ability: 'wis' }, passive: 'thaumaturge' } },
          ],
        },
      ],
      2: [
        {
          id: 'channel-divinity', name: 'Channel Divinity',
          desc: 'You spend a fraction of your god\'s attention directly. Use Divine Spark or Turn Undead — and your domain will add more options.',
          uses: { max: [0, 0, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4], recharge: 'short' },
          mech: { resource: { id: 'channel-divinity', name: 'Channel Divinity', max: 2, recharge: 'short' }, passive: 'channel-divinity' },
        },
        { id: 'divine-spark', name: 'Channel Divinity: Divine Spark', desc: 'As a Magic action you point a finger and pour divine energy into a creature within 30 feet, healing it or forcing a Constitution save against radiant or necrotic damage.', mech: { passive: 'divine-spark' } },
        { id: 'turn-undead', name: 'Channel Divinity: Turn Undead', desc: 'Undead within 30 feet must make a Wisdom save or be Dazed and driven away from you for a minute. The dead of Old Owl Well have learned to run from this.', mech: { passive: 'turn-undead' } },
      ],
      3: [
        { id: 'cleric-subclass', name: 'Cleric Subclass', desc: 'The domain your god grants you: Life, Light, Trickery or War.', choice: { type: 'subclass', count: 1, from: ['life', 'light', 'trickery', 'war'] } },
      ],
      4: [ASI],
      5: [
        { id: 'sear-undead', name: 'Sear Undead', desc: 'When you Turn Undead, each turned creature also takes radiant damage equal to your Wisdom modifier in d8s. Ghouls burn as readily as parchment.', mech: { passive: 'sear-undead' } },
      ],
      6: [
        { id: 'cleric-subclass-6', name: 'Subclass Feature', desc: 'Your domain grants a new blessing.', choice: { type: 'subclassOption', count: 1, from: 'auto' } },
        { id: 'channel-divinity-3', name: 'Channel Divinity (3 Uses)', desc: 'Your god listens more often. You now have three uses of Channel Divinity per Short or Long Rest.', mech: { resource: { id: 'channel-divinity', name: 'Channel Divinity', max: 3, recharge: 'short' } } },
      ],
      7: [
        {
          id: 'blessed-strikes', name: 'Blessed Strikes',
          desc: 'Divine power spills into your work. Choose Divine Strike or Potent Spellcasting; the choice is permanent.',
          choice: { type: 'subclassOption', count: 1, from: ['divine-strike', 'potent-spellcasting'] },
          options: [
            { id: 'divine-strike', name: 'Divine Strike', desc: 'Once per turn a weapon hit deals an extra 1d8 Necrotic or Radiant damage.', mech: { damageBonus: '1d8', passive: 'divine-strike' } },
            { id: 'potent-spellcasting', name: 'Potent Spellcasting', desc: 'Add your Wisdom modifier to the damage of your cleric cantrips.', mech: { passive: 'potent-spellcasting' } },
          ],
        },
      ],
      8: [ASI],
      9: [
        { id: 'cleric-circle-5', name: 'Prayers of the Fifth Circle', desc: 'Fifth-circle prayers become answerable — mass cure wounds, raise dead, the words a temple keeps for its worst days.', mech: { passive: 'spell-tier-5' } },
      ],
      10: [
        {
          id: 'divine-intervention', name: 'Divine Intervention',
          desc: 'As a Magic action you ask outright. Choose any cleric spell of level 5 or lower and cast it without components or a spell slot; you cannot do so again until you finish a Long Rest.',
          uses: { max: 1, recharge: 'long' },
          mech: { resource: { id: 'divine-intervention', name: 'Divine Intervention', max: 1, recharge: 'long' }, passive: 'divine-intervention' },
        },
      ],
      11: [
        { id: 'cleric-circle-6', name: 'Prayers of the Sixth Circle', desc: 'Your god trusts you with sixth-circle workings: heroes\' feast, planar ally, word of recall.', mech: { passive: 'spell-tier-6' } },
      ],
      12: [ASI],
      13: [
        { id: 'cleric-circle-7', name: 'Prayers of the Seventh Circle', desc: 'Seventh-circle prayers — resurrection, divine word — enter the range of what you may ask for.', mech: { passive: 'spell-tier-7' } },
      ],
      14: [
        { id: 'improved-blessed-strikes', name: 'Improved Blessed Strikes', desc: 'Divine Strike now deals 2d8; Potent Spellcasting also grants temporary hit points equal to half your cleric level to a creature you can see whenever your cantrip damages a target.', mech: { damageBonus: '2d8', passive: 'improved-blessed-strikes' } },
      ],
      15: [
        { id: 'cleric-circle-8', name: 'Prayers of the Eighth Circle', desc: 'Eighth-circle magic — holy aura, antimagic field — becomes part of your liturgy.', mech: { passive: 'spell-tier-8' } },
      ],
      16: [ASI],
      17: [
        { id: 'cleric-subclass-17', name: 'Subclass Feature', desc: 'Your domain reveals its final mystery.', choice: { type: 'subclassOption', count: 1, from: 'auto' } },
        { id: 'cleric-circle-9', name: 'Prayers of the Ninth Circle', desc: 'The ninth circle opens: mass heal, true resurrection, gate.', mech: { passive: 'spell-tier-9' } },
      ],
      18: [
        { id: 'channel-divinity-4', name: 'Channel Divinity (4 Uses)', desc: 'You now have four uses of Channel Divinity per Short or Long Rest.', mech: { resource: { id: 'channel-divinity', name: 'Channel Divinity', max: 4, recharge: 'short' } } },
      ],
      19: [EPIC_BOON],
      20: [
        { id: 'greater-divine-intervention', name: 'Greater Divine Intervention', desc: 'When you use Divine Intervention you may choose Wish. It is not free — you cannot use Divine Intervention again for 2d4 Long Rests.', mech: { passive: 'greater-divine-intervention' } },
      ],
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // DRUID
  // ═══════════════════════════════════════════════════════════════════════════
  druid: {
    id: 'druid',
    name: 'Druid',
    desc: 'A priest of the Old Faith, sworn to Silvanus or Mielikki and to the balance itself. The circles of Neverwinter Wood count Reidoth of Thundertree among them; they count the wolves as well.',
    hitDie: 8,
    primary: ['wis'],
    saves: ['int', 'wis'],
    armorProf: ['light', 'shields'],
    weaponProf: ['simple'],
    toolProf: ['herbalism-kit'],
    skillChoices: { count: 2, from: ['arcana', 'animal-handling', 'insight', 'medicine', 'nature', 'perception', 'religion', 'survival'] },
    startingGold: '2d4*10',
    startingGoldFixed: 50,
    startingKits: [
      { id: 'circle-warden', name: 'Warden of the Emerald Enclave', desc: 'Leathers, shield and sickle, with a mistletoe focus cut at the proper season.', items: [['leather-armor', 1], ['shield', 1], ['sickle', 1], ['druidic-focus', 1], ['explorers-pack', 1], ['herbalism-kit', 1]], gold: 9 },
      { id: 'thundertree-hermit', name: 'Thundertree Hermit', desc: 'A quarterstaff, a scarred robe and enough herbs to keep a stranger breathing.', items: [['quarterstaff', 1], ['druidic-focus', 1], ['robe', 1], ['herbalism-kit', 1], ['explorers-pack', 1], ['healers-kit', 1]], gold: 12 },
      { id: 'druid-purse', name: 'Traded in Kind', desc: 'The circle sent you south with coin instead of gear.', items: [], gold: 50 },
    ],
    spellcasting: {
      ability: 'wis', type: 'prepared', list: 'druid',
      cantripsKnown: CANTRIPS_2,
      prepFormula: PREP_FULL, preparedTable: PREP_FULL,
      spellsKnownTable: null,
      ritual: true, focus: 'druidic', focusItem: 'druidic-focus',
      slotTable: 'full', swapOnLevelUp: 'all', startLevel: 1,
    },
    subclassLevel: 3,
    subclassFeatureLevels: [3, 6, 10, 14],
    subclasses: ['land', 'moon', 'sea', 'stars'],
    weaponMasteryCount: null,
    progression: {
      wildShapeUses: [0, 0, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4],
      wildShapeMaxCR: [0, 0, 0.25, 0.25, 0.5, 0.5, 0.5, 0.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    },
    features: {
      1: [
        { id: 'druid-spellcasting', name: 'Spellcasting', desc: 'The Old Faith is not written down; it is remembered. You prepare and cast druid spells with Wisdom, using a druidic focus of wood, mistletoe or bone.', mech: { passive: 'spellcasting' }, choice: { type: 'cantrip', count: 2, from: 'druid' } },
        { id: 'druidic', name: 'Druidic', desc: 'You know Druidic, the secret tongue of the circles, and can leave a hidden message that only another speaker will notice.', mech: { passive: 'druidic', language: ['druidic'] } },
        {
          id: 'primal-order', name: 'Primal Order',
          desc: 'Choose the shape of your service to the balance: Magician or Warden.',
          choice: { type: 'subclassOption', count: 1, from: ['magician', 'warden'] },
          options: [
            { id: 'magician', name: 'Magician', desc: 'One extra druid cantrip, and your Wisdom modifier is added to Arcana and Nature checks.', mech: { cantrip: { choose: 'druid', ability: 'wis' }, passive: 'magician' } },
            { id: 'warden', name: 'Warden', desc: 'Training in Martial weapons and Medium armour.', mech: { weaponProf: ['martial'], armorProf: ['medium'] } },
          ],
        },
      ],
      2: [
        {
          id: 'wild-shape', name: 'Wild Shape',
          desc: 'As a Bonus Action you take the form of a beast you have seen — CR 1/4 at first, no flying or swimming speed. You keep your mind, your Wisdom and your Charisma, and the form has its own hit points.',
          uses: { max: [0, 0, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4], recharge: 'short' },
          mech: {
            resource: { id: 'wild-shape', name: 'Wild Shape', max: 2, recharge: 'short' },
            wildShape: { maxCR: 0.25, fly: false, swim: false }, passive: 'wild-shape',
          },
        },
        { id: 'wild-companion', name: 'Wild Companion', desc: 'You can expend a use of Wild Shape to cast Find Familiar without a spell slot; the familiar is a Fey spirit and lasts an hour.', mech: { passive: 'wild-companion' } },
      ],
      3: [
        { id: 'druid-subclass', name: 'Druid Subclass', desc: 'The circle that trained you: Land, Moon, Sea or Stars.', choice: { type: 'subclass', count: 1, from: ['land', 'moon', 'sea', 'stars'] } },
        { id: 'wild-shape-swim', name: 'Wild Shape: Swimmers', desc: 'Your beast forms may now be CR 1/2 and may have a Swim Speed — otters of the Neverwinter River, seals off the coast.', mech: { wildShape: { maxCR: 0.5, swim: true, fly: false } } },
      ],
      4: [ASI],
      5: [
        { id: 'wild-resurgence', name: 'Wild Resurgence', desc: 'Once per turn, if you have no Wild Shape uses left, you can expend a spell slot to regain one; and once per Long Rest you can spend a Wild Shape use to gain a level 1 spell slot.', mech: { passive: 'wild-resurgence' } },
      ],
      6: [
        { id: 'druid-subclass-6', name: 'Subclass Feature', desc: 'Your circle grants a new gift.', choice: { type: 'subclassOption', count: 1, from: 'auto' } },
        { id: 'wild-shape-3', name: 'Wild Shape (3 Uses)', desc: 'You have three uses of Wild Shape per Short or Long Rest.', mech: { resource: { id: 'wild-shape', name: 'Wild Shape', max: 3, recharge: 'short' } } },
      ],
      7: [
        {
          id: 'elemental-fury', name: 'Elemental Fury',
          desc: 'The raw elements answer more directly. Choose Potent Spellcasting or Primal Strike.',
          choice: { type: 'subclassOption', count: 1, from: ['potent-spellcasting', 'primal-strike'] },
          options: [
            { id: 'potent-spellcasting', name: 'Potent Spellcasting', desc: 'Add your Wisdom modifier to the damage of your druid cantrips.', mech: { passive: 'potent-spellcasting' } },
            { id: 'primal-strike', name: 'Primal Strike', desc: 'Once per turn, a hit with a weapon or a Wild Shape attack deals an extra 1d8 Cold, Fire, Lightning or Thunder damage.', mech: { damageBonus: '1d8', passive: 'primal-strike' } },
          ],
        },
      ],
      8: [
        { id: 'wild-shape-fly', name: 'Wild Shape: Fliers', desc: 'Your beast forms may now be CR 1 and may have a Fly Speed. Ravens over Kryptgarden, hawks above the Triboar Trail.', mech: { wildShape: { maxCR: 1, swim: true, fly: true } } },
        ASI,
      ],
      9: [
        { id: 'druid-circle-5', name: 'Rites of the Fifth Circle', desc: 'Fifth-circle rites open to you: awaken, commune with nature, the greater healings of the grove.', mech: { passive: 'spell-tier-5' } },
      ],
      10: [{ id: 'druid-subclass-10', name: 'Subclass Feature', desc: 'Your circle deepens its teaching.', choice: { type: 'subclassOption', count: 1, from: 'auto' } }],
      11: [
        { id: 'druid-circle-6', name: 'Rites of the Sixth Circle', desc: 'Sixth-circle magic — heal, wall of thorns, transport via plants — enters your memory.', mech: { passive: 'spell-tier-6' } },
      ],
      12: [ASI],
      13: [
        { id: 'druid-circle-7', name: 'Rites of the Seventh Circle', desc: 'Seventh-circle workings such as regenerate and fire storm become yours to hold.', mech: { passive: 'spell-tier-7' } },
      ],
      14: [{ id: 'druid-subclass-14', name: 'Subclass Feature', desc: 'Your circle grants its greatest boon.', choice: { type: 'subclassOption', count: 1, from: 'auto' } }],
      15: [
        { id: 'improved-elemental-fury', name: 'Improved Elemental Fury', desc: 'Potent Spellcasting doubles the range of your damaging cantrips; Primal Strike rises to an extra 2d8 elemental damage.', mech: { damageBonus: '2d8', passive: 'improved-elemental-fury' } },
      ],
      16: [ASI],
      17: [
        { id: 'wild-shape-4', name: 'Wild Shape (4 Uses)', desc: 'You have four uses of Wild Shape per Short or Long Rest.', mech: { resource: { id: 'wild-shape', name: 'Wild Shape', max: 4, recharge: 'short' } } },
        { id: 'druid-circle-9', name: 'Rites of the Ninth Circle', desc: 'The ninth circle opens: foresight, storm of vengeance, shapechange.', mech: { passive: 'spell-tier-9' } },
      ],
      18: [
        { id: 'beast-spells', name: 'Beast Spells', desc: 'You can cast druid spells in any Wild Shape form, ignoring the Somatic and Verbal components. A wolf that speaks in lightning is a very old story in the North.', mech: { passive: 'beast-spells' } },
      ],
      19: [EPIC_BOON],
      20: [
        { id: 'archdruid', name: 'Archdruid', desc: 'When you roll Initiative and have no Wild Shape uses left, you regain one. You can also ignore the Verbal and Somatic components of your druid spells, and you no longer age.', mech: { passive: 'archdruid' } },
      ],
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // FIGHTER
  // ═══════════════════════════════════════════════════════════════════════════
  fighter: {
    id: 'fighter',
    name: 'Fighter',
    desc: 'The professional. Neverwinter guardsmen, Lords\' Alliance sellswords, Waterdhavian duellists and old Sildar Hallwinter himself — all of them fighters, all of them alive because they drilled the same cut ten thousand times.',
    hitDie: 10,
    primary: ['str', 'dex'],
    saves: ['str', 'con'],
    armorProf: ['light', 'medium', 'heavy', 'shields'],
    weaponProf: ['simple', 'martial'],
    toolProf: [],
    skillChoices: { count: 2, from: ['acrobatics', 'animal-handling', 'athletics', 'history', 'insight', 'intimidation', 'perception', 'persuasion', 'survival'] },
    startingGold: '5d4*10',
    startingGoldFixed: 155,
    startingKits: [
      { id: 'alliance-vanguard', name: 'Lords\' Alliance Vanguard', desc: 'Chain mail, greatsword, a flail and a sheaf of javelins — the standard issue of a caravan-road soldier.', items: [['chain-mail', 1], ['greatsword', 1], ['flail', 1], ['javelin', 8], ['dungeoneers-pack', 1]], gold: 4 },
      { id: 'coster-outrider', name: 'Lionshield Outrider', desc: 'Linene Graywind kits her riders like this: studded leather, a pair of blades and a longbow.', items: [['studded-leather', 1], ['scimitar', 1], ['shortsword', 1], ['longbow', 1], ['arrow', 20], ['quiver', 1], ['dungeoneers-pack', 1]], gold: 11 },
      { id: 'fighter-purse', name: 'Mustering Pay', desc: 'Paid out in full and free to arm yourself however you like.', items: [], gold: 155 },
    ],
    spellcasting: null,
    subclassLevel: 3,
    subclassFeatureLevels: [3, 7, 10, 15, 18],
    subclasses: ['battle-master', 'champion', 'eldritch-knight', 'psi-warrior'],
    weaponMasteryCount: MASTERY_FIGHTER,
    progression: {
      secondWindUses: [0, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
      actionSurgeUses: [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2],
      indomitableUses: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3],
    },
    features: {
      1: [
        {
          id: 'fighting-style', name: 'Fighting Style',
          desc: 'The habit your arms default to under pressure. Choose a Fighting Style feat: Archery, Defense, Duelling, Great Weapon Fighting, Interception, Protection, Thrown Weapon Fighting, Two-Weapon Fighting, Unarmed Fighting or Blind Fighting.',
          choice: { type: 'fightingStyle', count: 1, from: 'auto' },
        },
        {
          id: 'second-wind', name: 'Second Wind',
          desc: 'You find one more breath. As a Bonus Action regain 1d10 + fighter level hit points; you regain one use on a Short Rest and all on a Long Rest.',
          uses: { max: [0, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4], recharge: 'short' },
          mech: { resource: { id: 'second-wind', name: 'Second Wind', max: 2, recharge: 'short' }, passive: 'second-wind' },
        },
        {
          id: 'fighter-weapon-mastery', name: 'Weapon Mastery',
          desc: 'Three weapons are extensions of your hands, and you use their mastery properties. Swap one after each Long Rest.',
          mech: { masteryCount: 3 },
          choice: { type: 'mastery', count: 3, from: 'auto' },
        },
      ],
      2: [
        {
          id: 'action-surge', name: 'Action Surge',
          desc: 'A moment where everything happens at once. On your turn you can take one additional action; you must finish a Short or Long Rest before doing it again.',
          uses: { max: 1, recharge: 'short' },
          mech: { resource: { id: 'action-surge', name: 'Action Surge', max: 1, recharge: 'short' }, passive: 'action-surge' },
        },
        { id: 'tactical-mind', name: 'Tactical Mind', desc: 'When you fail an ability check you can expend a use of Second Wind to add 1d10 to the roll — and if it still fails, the use is not spent.', mech: { passive: 'tactical-mind' } },
      ],
      3: [
        { id: 'fighter-subclass', name: 'Fighter Subclass', desc: 'The school you belong to: Battle Master, Champion, Eldritch Knight or Psi Warrior.', choice: { type: 'subclass', count: 1, from: ['battle-master', 'champion', 'eldritch-knight', 'psi-warrior'] } },
      ],
      4: [ASI],
      5: [
        { id: 'fighter-extra-attack', name: 'Extra Attack', desc: 'You attack twice whenever you take the Attack action.', mech: { extraAttack: 1 } },
        { id: 'tactical-shift', name: 'Tactical Shift', desc: 'Whenever you activate Second Wind you can move up to half your speed without provoking Opportunity Attacks.', mech: { passive: 'tactical-shift' } },
      ],
      6: [ASI],
      7: [{ id: 'fighter-subclass-7', name: 'Subclass Feature', desc: 'Your school teaches you something new.', choice: { type: 'subclassOption', count: 1, from: 'auto' } }],
      8: [ASI],
      9: [
        {
          id: 'indomitable', name: 'Indomitable',
          desc: 'You refuse the result. Reroll a failed saving throw, adding your fighter level to the new roll; you must use the new result.',
          uses: { max: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3], recharge: 'long' },
          mech: { resource: { id: 'indomitable', name: 'Indomitable', max: 1, recharge: 'long' }, reroll: 'save', passive: 'indomitable' },
        },
        { id: 'tactical-master', name: 'Tactical Master', desc: 'When you attack with a weapon whose mastery property you can use, you can replace that property with Push, Sap or Slow for that attack.', mech: { passive: 'tactical-master' } },
      ],
      10: [{ id: 'fighter-subclass-10', name: 'Subclass Feature', desc: 'Your school deepens its instruction.', choice: { type: 'subclassOption', count: 1, from: 'auto' } }],
      11: [
        { id: 'fighter-extra-attack-2', name: 'Two Extra Attacks', desc: 'You attack three times whenever you take the Attack action.', mech: { extraAttack: 2 } },
      ],
      12: [ASI],
      13: [
        { id: 'indomitable-2', name: 'Indomitable (2 Uses)', desc: 'You have two uses of Indomitable per Long Rest.', mech: { resource: { id: 'indomitable', name: 'Indomitable', max: 2, recharge: 'long' } } },
        { id: 'studied-attacks', name: 'Studied Attacks', desc: 'You learn from a miss. If you miss a creature with an attack, you have advantage on your next attack roll against it before the end of your next turn.', mech: { passive: 'studied-attacks' } },
      ],
      14: [ASI],
      15: [{ id: 'fighter-subclass-15', name: 'Subclass Feature', desc: 'Your school grants a rare technique.', choice: { type: 'subclassOption', count: 1, from: 'auto' } }],
      16: [ASI],
      17: [
        { id: 'action-surge-2', name: 'Action Surge (2 Uses)', desc: 'You can use Action Surge twice before a rest, though never twice in the same turn.', mech: { resource: { id: 'action-surge', name: 'Action Surge', max: 2, recharge: 'short' } } },
        { id: 'indomitable-3', name: 'Indomitable (3 Uses)', desc: 'You have three uses of Indomitable per Long Rest.', mech: { resource: { id: 'indomitable', name: 'Indomitable', max: 3, recharge: 'long' } } },
      ],
      18: [{ id: 'fighter-subclass-18', name: 'Subclass Feature', desc: 'Your school gives up its last secret.', choice: { type: 'subclassOption', count: 1, from: 'auto' } }],
      19: [EPIC_BOON],
      20: [
        { id: 'fighter-extra-attack-3', name: 'Three Extra Attacks', desc: 'You attack four times whenever you take the Attack action. There is no trick left in you — only the drill, perfected.', mech: { extraAttack: 3 } },
      ],
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MONK
  // ═══════════════════════════════════════════════════════════════════════════
  // NOTE: the 2024 PHB does NOT grant Monks Weapon Mastery. The table below is
  // present and all-zero so the level-up UI can read every class uniformly.
  monk: {
    id: 'monk',
    name: 'Monk',
    desc: 'A disciple of a monastic tradition — the cloisters of Kara-Tur, the Order of the Long Death, or a lonely master in the Sword Mountains. The monk\'s weapon is the body, and its edge is focus.',
    hitDie: 8,
    primary: ['dex', 'wis'],
    saves: ['str', 'dex'],
    armorProf: [],
    weaponProf: ['simple', 'martial-light'],
    toolProf: ['artisans-tools-or-instrument'],
    skillChoices: { count: 2, from: ['acrobatics', 'athletics', 'history', 'insight', 'religion', 'stealth'] },
    startingGold: '5d4',
    startingGoldFixed: 50,
    startingKits: [
      { id: 'wandering-ascetic', name: 'Wandering Ascetic', desc: 'A spear, a fan of daggers and a set of tools to earn your bread on the road.', items: [['spear', 1], ['dagger', 5], ['artisans-tools', 1], ['explorers-pack', 1]], gold: 11 },
      { id: 'temple-initiate', name: 'Temple Initiate of Ilmater', desc: 'A quarterstaff, plain robes and the discipline of the Broken God\'s houses.', items: [['quarterstaff', 1], ['dagger', 2], ['robe', 1], ['explorers-pack', 1], ['healers-kit', 1]], gold: 8 },
      { id: 'monk-purse', name: 'Alms and Nothing More', desc: 'You carry only coin, and expect to need very little of it.', items: [], gold: 50 },
    ],
    spellcasting: null,
    subclassLevel: 3,
    subclassFeatureLevels: [3, 6, 11, 17],
    subclasses: ['open-hand', 'shadow', 'mercy', 'elements'],
    weaponMasteryCount: MASTERY_NONE,
    progression: {
      martialArtsDie: [0, '1d6', '1d6', '1d6', '1d6', '1d8', '1d8', '1d8', '1d8', '1d8', '1d8', '1d10', '1d10', '1d10', '1d10', '1d10', '1d10', '1d12', '1d12', '1d12', '1d12'],
      focusPoints: [0, 0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
      unarmoredMovement: [0, 0, 10, 10, 10, 10, 15, 15, 15, 15, 20, 20, 20, 20, 25, 25, 25, 25, 30, 30, 30],
    },
    features: {
      1: [
        {
          id: 'martial-arts', name: 'Martial Arts',
          desc: 'Your unarmed strikes and Monk weapons use Dexterity, deal your Martial Arts die in damage, and let you make an extra Unarmed Strike as a Bonus Action after attacking.',
          mech: { unarmedDie: '1d6', martialArtsDie: '1d6', passive: 'martial-arts' },
        },
        {
          id: 'monk-unarmored-defense', name: 'Unarmored Defense',
          desc: 'Awareness is armour. While you wear no armour and carry no shield your AC equals 10 + Dexterity modifier + Wisdom modifier.',
          mech: { acFormula: { base: 10, addDex: true, addWis: true, cap: null, requiresNoArmor: true, allowShield: false } },
        },
      ],
      2: [
        {
          id: 'monks-focus', name: 'Monk\'s Focus',
          desc: 'You gather Focus Points equal to your monk level and spend them on Flurry of Blows (two extra Unarmed Strikes), Patient Defense (Disengage plus Dodge) and Step of the Wind (Disengage plus Dash, jump distance doubled).',
          uses: { max: [0, 0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20], recharge: 'short' },
          mech: { resource: { id: 'focus', name: 'Focus Points', max: 2, recharge: 'short' }, passive: 'monks-focus' },
        },
        { id: 'unarmored-movement', name: 'Unarmored Movement', desc: 'Your speed increases by 10 feet while you wear no armour and carry no shield.', mech: { speedBonus: 10, passive: 'unarmored-movement' } },
        { id: 'uncanny-metabolism', name: 'Uncanny Metabolism', desc: 'Once per Long Rest, when you roll Initiative you can regain all Focus Points and heal your monk level plus one roll of your Martial Arts die.', uses: { max: 1, recharge: 'long' }, mech: { resource: { id: 'uncanny-metabolism', name: 'Uncanny Metabolism', max: 1, recharge: 'long' }, passive: 'uncanny-metabolism' } },
      ],
      3: [
        { id: 'monk-subclass', name: 'Monk Subclass', desc: 'The tradition you follow: Warrior of the Open Hand, of Shadow, of Mercy, or of the Elements.', choice: { type: 'subclass', count: 1, from: ['open-hand', 'shadow', 'mercy', 'elements'] } },
        { id: 'deflect-attacks', name: 'Deflect Attacks', desc: 'As a Reaction to a Bludgeoning, Piercing or Slashing hit, reduce the damage by 1d10 + Dexterity modifier + monk level. If you reduce it to 0 you can spend 1 Focus Point to hurl it back at another creature.', mech: { passive: 'deflect-attacks' } },
      ],
      4: [
        ASI,
        { id: 'slow-fall', name: 'Slow Fall', desc: 'As a Reaction when you fall, reduce the damage by five times your monk level. Monks of the Sword Mountains train on cliffs for exactly this reason.', mech: { passive: 'slow-fall' } },
      ],
      5: [
        { id: 'monk-extra-attack', name: 'Extra Attack', desc: 'You attack twice whenever you take the Attack action.', mech: { extraAttack: 1, martialArtsDie: '1d8', unarmedDie: '1d8' } },
        { id: 'stunning-strike', name: 'Stunning Strike', desc: 'Once per turn, when you hit with a Monk weapon or Unarmed Strike, spend 1 Focus Point to force a Constitution save. On a failure the target is Stunned until the end of your next turn; on a success its speed is halved and the next attack against it has advantage.', mech: { passive: 'stunning-strike' } },
      ],
      6: [
        { id: 'empowered-strikes', name: 'Empowered Strikes', desc: 'Your Unarmed Strikes can deal Force damage instead of Bludgeoning — bone means nothing to a wraith, but force does.', mech: { passive: 'empowered-strikes' } },
        { id: 'monk-subclass-6', name: 'Subclass Feature', desc: 'Your tradition teaches a new discipline.', choice: { type: 'subclassOption', count: 1, from: 'auto' } },
      ],
      7: [
        { id: 'monk-evasion', name: 'Evasion', desc: 'When a Dexterity save would halve damage on you, you take none on a success and half on a failure. This does not work while Incapacitated.', mech: { passive: 'evasion' } },
      ],
      8: [ASI],
      9: [
        { id: 'acrobatic-movement', name: 'Acrobatic Movement', desc: 'While unarmoured you can move along vertical surfaces and across liquids without falling during the move.', mech: { passive: 'acrobatic-movement' } },
      ],
      10: [
        { id: 'heightened-focus', name: 'Heightened Focus', desc: 'Flurry of Blows grants three strikes; Patient Defense also grants temporary hit points equal to two rolls of your Martial Arts die; Step of the Wind can carry a willing ally with you.', mech: { passive: 'heightened-focus' } },
        { id: 'self-restoration', name: 'Self-Restoration', desc: 'At the end of your turn you can end one Charmed, Frightened or Poisoned condition on yourself, and you no longer need food or water.', mech: { passive: 'self-restoration' } },
      ],
      11: [{ id: 'monk-subclass-11', name: 'Subclass Feature', desc: 'Your tradition deepens.', choice: { type: 'subclassOption', count: 1, from: 'auto' }, mech: { martialArtsDie: '1d10', unarmedDie: '1d10' } }],
      12: [ASI],
      13: [
        { id: 'deflect-energy', name: 'Deflect Energy', desc: 'Deflect Attacks now works against damage of any type. You have learned to catch fire the way you catch a fist.', mech: { passive: 'deflect-energy' } },
      ],
      14: [
        { id: 'disciplined-survivor', name: 'Disciplined Survivor', desc: 'You gain proficiency in all saving throws, and can spend 1 Focus Point to reroll a failed save, using the new result.', mech: { saveProf: ['str', 'dex', 'con', 'int', 'wis', 'cha'], passive: 'disciplined-survivor' } },
      ],
      15: [
        { id: 'perfect-focus', name: 'Perfect Focus', desc: 'When you roll Initiative with fewer than 4 Focus Points, you regain enough to have 4.', mech: { passive: 'perfect-focus' } },
      ],
      16: [ASI],
      17: [{ id: 'monk-subclass-17', name: 'Subclass Feature', desc: 'Your tradition gives up its last secret.', choice: { type: 'subclassOption', count: 1, from: 'auto' }, mech: { martialArtsDie: '1d12', unarmedDie: '1d12' } }],
      18: [
        { id: 'superior-defense', name: 'Superior Defense', desc: 'At the start of your turn you can spend 3 Focus Points to gain resistance to all damage except Force for one minute, or until you are Incapacitated.', mech: { passive: 'superior-defense' } },
      ],
      19: [EPIC_BOON],
      20: [
        { id: 'body-and-mind', name: 'Body and Mind', desc: 'Body and mind finish becoming the same instrument. Your Dexterity and Wisdom increase by 4, and their maximum becomes 25.', mech: { asi: { dex: 4, wis: 4 }, capAbility: { dex: 25, wis: 25 } } },
      ],
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PALADIN
  // ═══════════════════════════════════════════════════════════════════════════
  paladin: {
    id: 'paladin',
    name: 'Paladin',
    desc: 'An oath given form in armour. Whether sworn before Torm\'s altar or shouted alone on a battlefield, the oath is the source of the power — and Daran Edermath of the Order of the Gauntlet will tell you it never truly retires.',
    hitDie: 10,
    primary: ['str', 'cha'],
    saves: ['wis', 'cha'],
    armorProf: ['light', 'medium', 'heavy', 'shields'],
    weaponProf: ['simple', 'martial'],
    toolProf: [],
    skillChoices: { count: 2, from: ['athletics', 'insight', 'intimidation', 'medicine', 'persuasion', 'religion'] },
    startingGold: '5d4*10',
    startingGoldFixed: 150,
    startingKits: [
      { id: 'gauntlet-oathsworn', name: 'Oathsworn of the Gauntlet', desc: 'Chain mail, shield, longsword and a sheaf of javelins, blessed at the Shrine of Luck before the road.', items: [['chain-mail', 1], ['shield', 1], ['longsword', 1], ['javelin', 6], ['holy-symbol', 1], ['priests-pack', 1]], gold: 9 },
      { id: 'hospitaller', name: 'Hospitaller of Ilmater', desc: 'A warhammer and a healer\'s kit — you were sworn to mend before you were sworn to strike.', items: [['chain-mail', 1], ['shield', 1], ['warhammer', 1], ['holy-symbol', 1], ['healers-kit', 1], ['priests-pack', 1]], gold: 7 },
      { id: 'paladin-purse', name: 'Chapter Endowment', desc: 'Your order gave you coin and expects to see it spent well.', items: [], gold: 150 },
    ],
    spellcasting: {
      ability: 'cha', type: 'prepared', list: 'paladin',
      cantripsKnown: CANTRIPS_0,
      prepFormula: PREP_HALF, preparedTable: PREP_HALF,
      spellsKnownTable: null,
      ritual: false, focus: 'holy', focusItem: 'holy-symbol',
      slotTable: 'half', swapOnLevelUp: 1, startLevel: 1,
    },
    subclassLevel: 3,
    subclassFeatureLevels: [3, 7, 15, 20],
    subclasses: ['devotion', 'glory', 'ancients', 'vengeance'],
    weaponMasteryCount: MASTERY_HALF,
    progression: {
      layOnHandsPool: [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100],
      channelDivinityUses: [0, 0, 0, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
      auraRadius: [0, 0, 0, 0, 0, 0, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 30, 30, 30],
    },
    features: {
      1: [
        {
          id: 'lay-on-hands', name: 'Lay on Hands',
          desc: 'A pool of healing equal to five times your paladin level, spent as a Bonus Action by touch. Five points from the pool will also end one poison or disease.',
          uses: { max: [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100], recharge: 'long' },
          mech: { resource: { id: 'lay-on-hands', name: 'Lay on Hands', max: 5, recharge: 'long' }, layOnHands: '5*level', passive: 'lay-on-hands' },
        },
        { id: 'paladin-spellcasting', name: 'Spellcasting', desc: 'Your oath is a channel as much as a promise. You prepare and cast paladin spells with Charisma, using a holy symbol as your focus.', mech: { passive: 'spellcasting' } },
        {
          id: 'paladin-weapon-mastery', name: 'Weapon Mastery',
          desc: 'You use the mastery properties of two weapons, and can change one after each Long Rest.',
          mech: { masteryCount: 2 },
          choice: { type: 'mastery', count: 2, from: 'auto' },
        },
      ],
      2: [
        {
          id: 'paladin-fighting-style', name: 'Fighting Style',
          desc: 'Choose a Fighting Style feat — or take Blessed Warrior instead, learning two cleric cantrips that count as paladin spells for you.',
          choice: { type: 'fightingStyle', count: 1, from: 'auto' },
        },
        {
          id: 'paladins-smite', name: 'Paladin\'s Smite',
          desc: 'You always have the Divine Smite spell prepared, and can cast it once without a spell slot; you must finish a Long Rest before doing so again.',
          uses: { max: 1, recharge: 'long' },
          mech: { alwaysPrepared: ['divine-smite'], freeCasts: { spellId: 'divine-smite', uses: 1, recharge: 'long' }, passive: 'paladins-smite' },
        },
      ],
      3: [
        {
          id: 'paladin-channel-divinity', name: 'Channel Divinity',
          desc: 'Your oath answers when called. You gain your subclass\'s Channel Divinity options and regain one use on a Short Rest, all on a Long Rest.',
          uses: { max: [0, 0, 0, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3], recharge: 'short' },
          mech: { resource: { id: 'channel-divinity', name: 'Channel Divinity', max: 2, recharge: 'short' }, passive: 'channel-divinity' },
        },
        { id: 'paladin-subclass', name: 'Paladin Subclass', desc: 'The oath you swear: Devotion, Glory, the Ancients, or Vengeance.', choice: { type: 'subclass', count: 1, from: ['devotion', 'glory', 'ancients', 'vengeance'] } },
      ],
      4: [ASI],
      5: [
        { id: 'paladin-extra-attack', name: 'Extra Attack', desc: 'You attack twice whenever you take the Attack action.', mech: { extraAttack: 1 } },
        { id: 'faithful-steed', name: 'Faithful Steed', desc: 'You always have Find Steed prepared, and can cast it once without a spell slot per Long Rest. Something answers — a warhorse, a great elk, a beast of the upper planes.', uses: { max: 1, recharge: 'long' }, mech: { alwaysPrepared: ['find-steed'], freeCasts: { spellId: 'find-steed', uses: 1, recharge: 'long' } } },
      ],
      6: [
        { id: 'aura-of-protection', name: 'Aura of Protection', desc: 'You and every ally within 10 feet add your Charisma modifier (minimum +1) to all saving throws. Standing near a paladin is a tactic, not a sentiment.', mech: { aura: { id: 'protection', radius: 10, saveBonus: 'cha' }, passive: 'aura-of-protection' } },
      ],
      7: [{ id: 'paladin-subclass-7', name: 'Subclass Feature', desc: 'Your oath grants a new power.', choice: { type: 'subclassOption', count: 1, from: 'auto' } }],
      8: [ASI],
      9: [
        { id: 'abjure-foes', name: 'Channel Divinity: Abjure Foes', desc: 'As a Magic action, spend a use of Channel Divinity to overwhelm foes with awe: creatures equal to your Charisma modifier within 60 feet must save or be Frightened for a minute, able to do only one thing on each of their turns.', mech: { passive: 'abjure-foes' } },
      ],
      10: [
        { id: 'aura-of-courage', name: 'Aura of Courage', desc: 'You and your allies within 10 feet cannot be Frightened, and if a fright-effect is already on them it ends.', mech: { aura: { id: 'courage', radius: 10 }, condImmune: ['frightened'], passive: 'aura-of-courage' } },
      ],
      11: [
        { id: 'radiant-strikes', name: 'Radiant Strikes', desc: 'Your blows carry the oath itself. Every hit with a melee weapon or Unarmed Strike deals an extra 1d8 Radiant damage.', mech: { damageBonus: '1d8', passive: 'radiant-strikes' } },
      ],
      12: [ASI],
      13: [
        { id: 'paladin-circle-4', name: 'Fourth-Circle Oaths', desc: 'Fourth-circle paladin spells — banishment, staggering smite — become part of your prepared prayers.', mech: { passive: 'spell-tier-4' } },
      ],
      14: [
        { id: 'restoring-touch', name: 'Restoring Touch', desc: 'When you use Lay on Hands you can also spend 5 points from the pool for each of these conditions you wish to end: Blinded, Charmed, Deafened, Frightened, Paralyzed or Stunned.', mech: { passive: 'restoring-touch' } },
      ],
      15: [{ id: 'paladin-subclass-15', name: 'Subclass Feature', desc: 'Your oath deepens toward its final form.', choice: { type: 'subclassOption', count: 1, from: 'auto' } }],
      16: [ASI],
      17: [
        { id: 'paladin-circle-5', name: 'Fifth-Circle Oaths', desc: 'The fifth circle opens: destructive wave, holy weapon, the prayers spoken before a war ends.', mech: { passive: 'spell-tier-5' } },
      ],
      18: [
        { id: 'aura-expansion', name: 'Aura Expansion', desc: 'Your auras now reach 30 feet. An entire skirmish line can stand inside your oath.', mech: { aura: { radius: 30 }, passive: 'aura-expansion' } },
      ],
      19: [EPIC_BOON],
      20: [{ id: 'paladin-subclass-20', name: 'Subclass Capstone', desc: 'Your oath reaches its full and terrible expression.', choice: { type: 'subclassOption', count: 1, from: 'auto' } }],
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // RANGER
  // ═══════════════════════════════════════════════════════════════════════════
  ranger: {
    id: 'ranger',
    name: 'Ranger',
    desc: 'A hunter of the borderlands between the settled Sword Coast and everything else. Rangers walk the Triboar Trail and the eaves of Neverwinter Wood, and know exactly which tracks in the mud belong to a bugbear.',
    hitDie: 10,
    primary: ['dex', 'wis'],
    saves: ['str', 'dex'],
    armorProf: ['light', 'medium', 'shields'],
    weaponProf: ['simple', 'martial'],
    toolProf: [],
    skillChoices: { count: 3, from: ['animal-handling', 'athletics', 'insight', 'investigation', 'nature', 'perception', 'stealth', 'survival'] },
    startingGold: '5d4*10',
    startingGoldFixed: 150,
    startingKits: [
      { id: 'trail-warden', name: 'Triboar Trail Warden', desc: 'Studded leather, paired blades and a longbow — the working kit of the road-wardens between Phandalin and Triboar.', items: [['studded-leather', 1], ['scimitar', 1], ['shortsword', 1], ['longbow', 1], ['arrow', 20], ['quiver', 1], ['druidic-focus', 1], ['explorers-pack', 1]], gold: 7 },
      { id: 'wood-stalker', name: 'Neverwinter Wood Stalker', desc: 'Leathers, a spear and a hunting bow, and a coil of rope that has saved you twice.', items: [['leather-armor', 1], ['spear', 1], ['shortbow', 1], ['arrow', 20], ['quiver', 1], ['rope-hempen', 1], ['explorers-pack', 1], ['healers-kit', 1]], gold: 10 },
      { id: 'ranger-purse', name: 'Bounty Paid', desc: 'The last contract settled in coin. Buy what the next one needs.', items: [], gold: 150 },
    ],
    spellcasting: {
      ability: 'wis', type: 'prepared', list: 'ranger',
      cantripsKnown: CANTRIPS_0,
      prepFormula: PREP_HALF, preparedTable: PREP_HALF,
      spellsKnownTable: null,
      ritual: false, focus: 'druidic', focusItem: 'druidic-focus',
      slotTable: 'half', swapOnLevelUp: 1, startLevel: 1,
    },
    subclassLevel: 3,
    subclassFeatureLevels: [3, 7, 11, 15],
    subclasses: ['beast-master', 'fey-wanderer', 'gloom-stalker', 'hunter'],
    weaponMasteryCount: MASTERY_HALF,
    progression: {
      huntersMarkCasts: [0, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6],
    },
    features: {
      1: [
        { id: 'ranger-spellcasting', name: 'Spellcasting', desc: 'You learned your magic the way you learned tracking — from the land. You prepare and cast ranger spells with Wisdom.', mech: { passive: 'spellcasting' } },
        {
          id: 'favored-enemy', name: 'Favored Enemy',
          desc: 'You always have Hunter\'s Mark prepared and can cast it without a spell slot a number of times per Long Rest that grows with your level. Whatever you are hunting this tenday becomes your favoured enemy.',
          uses: { max: [0, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6], recharge: 'long' },
          mech: { alwaysPrepared: ['hunters-mark'], freeCasts: { spellId: 'hunters-mark', uses: 2, recharge: 'long' }, passive: 'favored-enemy' },
        },
        {
          id: 'ranger-weapon-mastery', name: 'Weapon Mastery',
          desc: 'You use the mastery properties of two weapons, and can change one after each Long Rest.',
          mech: { masteryCount: 2 },
          choice: { type: 'mastery', count: 2, from: 'auto' },
        },
      ],
      2: [
        {
          id: 'deft-explorer', name: 'Deft Explorer',
          desc: 'Long roads make a specialist of you. Gain Expertise in one skill you are proficient with, and learn two more languages.',
          mech: { languageCount: 2 },
          choice: { type: 'expertise', count: 1, from: 'proficient-skills' },
        },
        { id: 'ranger-fighting-style', name: 'Fighting Style', desc: 'Choose a Fighting Style feat — or take Druidic Warrior instead, learning two druid cantrips that count as ranger spells for you.', choice: { type: 'fightingStyle', count: 1, from: 'auto' } },
      ],
      3: [
        { id: 'ranger-subclass', name: 'Ranger Subclass', desc: 'Your specialty: Beast Master, Fey Wanderer, Gloom Stalker or Hunter.', choice: { type: 'subclass', count: 1, from: ['beast-master', 'fey-wanderer', 'gloom-stalker', 'hunter'] } },
      ],
      4: [ASI],
      5: [
        { id: 'ranger-extra-attack', name: 'Extra Attack', desc: 'You attack twice whenever you take the Attack action.', mech: { extraAttack: 1 } },
      ],
      6: [
        { id: 'roving', name: 'Roving', desc: 'Your speed increases by 10 feet, and you gain a Climb Speed and a Swim Speed equal to your speed. Cliffs and rivers stop being obstacles.', mech: { speedBonus: 10, passive: 'roving' } },
      ],
      7: [{ id: 'ranger-subclass-7', name: 'Subclass Feature', desc: 'Your specialty sharpens.', choice: { type: 'subclassOption', count: 1, from: 'auto' } }],
      8: [ASI],
      9: [
        {
          id: 'ranger-expertise', name: 'Expertise',
          desc: 'Two more of your skills become expert work, your proficiency bonus doubled for their checks.',
          mech: { skillExpertise: [] },
          choice: { type: 'expertise', count: 2, from: 'proficient-skills' },
        },
      ],
      10: [
        {
          id: 'tireless', name: 'Tireless',
          desc: 'As a Magic action, grant yourself temporary hit points equal to 1d8 + your Wisdom modifier, a number of times per Long Rest equal to your proficiency bonus. Every Short Rest also reduces your Exhaustion by one.',
          uses: { max: 'prof', recharge: 'long' },
          mech: { resource: { id: 'tireless', name: 'Tireless', max: 'prof', recharge: 'long' }, tempHpFormula: '1d8+wis', passive: 'tireless' },
        },
      ],
      11: [{ id: 'ranger-subclass-11', name: 'Subclass Feature', desc: 'Your specialty deepens.', choice: { type: 'subclassOption', count: 1, from: 'auto' } }],
      12: [ASI],
      13: [
        { id: 'relentless-hunter', name: 'Relentless Hunter', desc: 'Taking damage can no longer break your Concentration on Hunter\'s Mark. Once you have marked a thing, you keep it marked.', mech: { passive: 'relentless-hunter' } },
      ],
      14: [
        {
          id: 'natures-veil', name: 'Nature\'s Veil',
          desc: 'As a Bonus Action you draw the wild in around yourself and become Invisible until the end of your next turn, a number of times per Long Rest equal to your proficiency bonus.',
          uses: { max: 'prof', recharge: 'long' },
          mech: { resource: { id: 'natures-veil', name: 'Nature\'s Veil', max: 'prof', recharge: 'long' }, passive: 'natures-veil' },
        },
      ],
      15: [{ id: 'ranger-subclass-15', name: 'Subclass Feature', desc: 'Your specialty reaches its full expression.', choice: { type: 'subclassOption', count: 1, from: 'auto' } }],
      16: [ASI],
      17: [
        { id: 'precise-hunter', name: 'Precise Hunter', desc: 'You have advantage on attack rolls against the creature currently marked by your Hunter\'s Mark.', mech: { passive: 'precise-hunter' } },
      ],
      18: [
        { id: 'feral-senses', name: 'Feral Senses', desc: 'You gain Blindsight out to 30 feet. Invisibility, darkness and the Mere of Dead Men\'s fog are all the same to you now.', mech: { senses: { blindsight: 30 }, passive: 'feral-senses' } },
      ],
      19: [EPIC_BOON],
      20: [
        { id: 'foe-slayer', name: 'Foe Slayer', desc: 'The die of your Hunter\'s Mark becomes a d10. Nothing you have named survives long.', mech: { passive: 'foe-slayer', huntersMarkDie: '1d10' } },
      ],
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ROGUE
  // ═══════════════════════════════════════════════════════════════════════════
  rogue: {
    id: 'rogue',
    name: 'Rogue',
    desc: 'A specialist in the things that only work once — the unlocked window, the unwatched second, the knife that arrives before the alarm. Half the Redbrands were rogues; so are half the Harpers.',
    hitDie: 8,
    primary: ['dex'],
    saves: ['dex', 'int'],
    armorProf: ['light'],
    weaponProf: ['simple', 'martial-finesse-or-light'],
    toolProf: ['thieves-tools'],
    skillChoices: {
      count: 4,
      from: ['acrobatics', 'athletics', 'deception', 'insight', 'intimidation', 'investigation', 'perception', 'performance', 'persuasion', 'sleight-of-hand', 'stealth'],
    },
    startingGold: '4d4*10',
    startingGoldFixed: 100,
    startingKits: [
      { id: 'burglar', name: 'Phandalin Housebreaker', desc: 'Leathers, two daggers, a shortsword and the tools that make locks a formality.', items: [['leather-armor', 1], ['dagger', 2], ['shortsword', 1], ['shortbow', 1], ['arrow', 20], ['quiver', 1], ['thieves-tools', 1], ['burglars-pack', 1]], gold: 8 },
      { id: 'harper-agent', name: 'Harper Agent', desc: 'A rapier, a hooded cloak and the quiet habits of Sister Garaele\'s network.', items: [['leather-armor', 1], ['rapier', 1], ['dagger', 2], ['thieves-tools', 1], ['cloak-common', 1], ['burglars-pack', 1]], gold: 12 },
      { id: 'rogue-purse', name: 'Last Job\'s Cut', desc: 'You already fenced the take. Buy your own kit.', items: [], gold: 100 },
    ],
    spellcasting: null,
    subclassLevel: 3,
    subclassFeatureLevels: [3, 9, 13, 17],
    subclasses: ['arcane-trickster', 'assassin', 'soulknife', 'thief'],
    weaponMasteryCount: MASTERY_ROGUE,
    progression: {
      sneakAttack: [0, '1d6', '1d6', '2d6', '2d6', '3d6', '3d6', '4d6', '4d6', '5d6', '5d6', '6d6', '6d6', '7d6', '7d6', '8d6', '8d6', '9d6', '9d6', '10d6', '10d6'],
    },
    features: {
      1: [
        {
          id: 'rogue-expertise', name: 'Expertise',
          desc: 'Two skills — very often Stealth and Thieves\' Tools work — become doubled proficiency for you.',
          mech: { skillExpertise: [] },
          choice: { type: 'expertise', count: 2, from: 'proficient-skills' },
        },
        {
          id: 'sneak-attack', name: 'Sneak Attack',
          desc: 'Once per turn, when you hit with a Finesse or Ranged weapon and either have advantage or an ally is adjacent to the target, add extra damage — 1d6 at first level, rising by 1d6 every odd level to 10d6.',
          mech: { sneakAttack: '1d6', passive: 'sneak-attack' },
        },
        { id: 'thieves-cant', name: 'Thieves\' Cant', desc: 'You know the coded jargon and chalk-marks of the criminal underworld, and one more language of your choice. A door in Waterdeep can tell you whether the house behind it is worth robbing.', mech: { language: ['thieves-cant'], languageCount: 1, passive: 'thieves-cant' } },
        {
          id: 'rogue-weapon-mastery', name: 'Weapon Mastery',
          desc: 'You use the mastery properties of two Simple or Martial weapons with the Finesse or Light property, swapping one after each Long Rest.',
          mech: { masteryCount: 2 },
          choice: { type: 'mastery', count: 2, from: 'finesse-or-light' },
        },
      ],
      2: [
        { id: 'cunning-action', name: 'Cunning Action', desc: 'Your Bonus Action can Dash, Disengage or Hide. Speed is the whole profession.', mech: { passive: 'cunning-action' } },
      ],
      3: [
        { id: 'rogue-subclass', name: 'Rogue Subclass', desc: 'Your line of work: Arcane Trickster, Assassin, Soulknife or Thief.', choice: { type: 'subclass', count: 1, from: ['arcane-trickster', 'assassin', 'soulknife', 'thief'] } },
        { id: 'steady-aim', name: 'Steady Aim', desc: 'As a Bonus Action, if you have not moved this turn, gain advantage on your next attack roll this turn — but your speed drops to 0 until the end of the turn.', mech: { passive: 'steady-aim' } },
      ],
      4: [ASI],
      5: [
        {
          id: 'cunning-strike', name: 'Cunning Strike',
          desc: 'When you deal Sneak Attack damage you can trade dice for cruelty: Poison (1 die, Con save or Poisoned for a minute), Trip (1 die, Dex save or Prone) or Withdraw (1 die, move half your speed without provoking).',
          mech: { passive: 'cunning-strike' },
        },
        { id: 'uncanny-dodge', name: 'Uncanny Dodge', desc: 'As a Reaction when an attacker you can see hits you, halve the damage. The alley teaches this or it kills you.', mech: { passive: 'uncanny-dodge' } },
      ],
      6: [
        {
          id: 'rogue-expertise-2', name: 'Expertise (Second Pair)',
          desc: 'Two more skills become doubled proficiency.',
          mech: { skillExpertise: [] },
          choice: { type: 'expertise', count: 2, from: 'proficient-skills' },
        },
      ],
      7: [
        { id: 'rogue-evasion', name: 'Evasion', desc: 'When a Dexterity save would halve damage, you take none on a success and half on a failure — unless you are Incapacitated.', mech: { passive: 'evasion' } },
        { id: 'reliable-talent', name: 'Reliable Talent', desc: 'Whenever you make an ability check using a skill or tool you are proficient with, treat a d20 roll of 9 or lower as a 10. You simply do not fumble your own trade.', mech: { passive: 'reliable-talent' } },
      ],
      8: [ASI],
      9: [{ id: 'rogue-subclass-9', name: 'Subclass Feature', desc: 'Your line of work teaches you something new.', choice: { type: 'subclassOption', count: 1, from: 'auto' } }],
      10: [ASI],
      11: [
        { id: 'improved-cunning-strike', name: 'Improved Cunning Strike', desc: 'You can apply two Cunning Strike effects to the same Sneak Attack.', mech: { passive: 'improved-cunning-strike' } },
      ],
      12: [ASI],
      13: [{ id: 'rogue-subclass-13', name: 'Subclass Feature', desc: 'Your line of work deepens.', choice: { type: 'subclassOption', count: 1, from: 'auto' } }],
      14: [
        { id: 'devious-strikes', name: 'Devious Strikes', desc: 'Three more Cunning Strike options: Daze (2 dice), Knock Out (6 dice, Con save or Unconscious for a minute) and Obscure (3 dice, Dex save or Blinded).', mech: { passive: 'devious-strikes' } },
      ],
      15: [
        { id: 'slippery-mind', name: 'Slippery Mind', desc: 'You gain proficiency in Wisdom and Charisma saving throws. Doppelgangers find you hard work.', mech: { saveProf: ['wis', 'cha'] } },
      ],
      16: [ASI],
      17: [{ id: 'rogue-subclass-17', name: 'Subclass Feature', desc: 'Your line of work gives up its last secret.', choice: { type: 'subclassOption', count: 1, from: 'auto' } }],
      18: [
        { id: 'elusive', name: 'Elusive', desc: 'No attack roll has advantage against you unless you are Incapacitated. Being flanked stopped mattering to you some years ago.', mech: { passive: 'elusive' } },
      ],
      19: [EPIC_BOON],
      20: [
        {
          id: 'stroke-of-luck', name: 'Stroke of Luck',
          desc: 'Once per Short or Long Rest, turn a miss into a hit, or treat a failed d20 Test as a 20. Tymora is only part of it; the rest is preparation.',
          uses: { max: 1, recharge: 'short' },
          mech: { resource: { id: 'stroke-of-luck', name: 'Stroke of Luck', max: 1, recharge: 'short' }, passive: 'stroke-of-luck' },
        },
      ],
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SORCERER
  // ═══════════════════════════════════════════════════════════════════════════
  sorcerer: {
    id: 'sorcerer',
    name: 'Sorcerer',
    desc: 'Magic that was never studied — inherited, or inflicted. Dragon blood out of the Sword Mountains, a wild surge born under a Weave-storm, clockwork order stitched into a bloodline in Mechanus.',
    hitDie: 6,
    primary: ['cha'],
    saves: ['con', 'cha'],
    armorProf: [],
    weaponProf: ['simple'],
    toolProf: [],
    skillChoices: { count: 2, from: ['arcana', 'deception', 'insight', 'intimidation', 'persuasion', 'religion'] },
    startingGold: '3d4*10',
    startingGoldFixed: 50,
    startingKits: [
      { id: 'blooded-heir', name: 'Blooded Heir', desc: 'A spear, two daggers and a crystal focus that hums when you are angry.', items: [['spear', 1], ['dagger', 2], ['crystal', 1], ['dungeoneers-pack', 1]], gold: 28 },
      { id: 'storm-touched', name: 'Storm-Touched Wanderer', desc: 'A quarterstaff, travelling robes and an arcane focus you did not buy so much as find.', items: [['quarterstaff', 1], ['dagger', 2], ['robe', 1], ['arcane-focus', 1], ['explorers-pack', 1]], gold: 20 },
      { id: 'sorcerer-purse', name: 'Coin Instead', desc: 'You would rather choose your own focus than inherit someone else\'s.', items: [], gold: 50 },
    ],
    spellcasting: {
      ability: 'cha', type: 'prepared', list: 'sorcerer',
      cantripsKnown: CANTRIPS_4,
      prepFormula: PREP_SORC, preparedTable: PREP_SORC,
      spellsKnownTable: null,
      ritual: false, focus: 'arcane', focusItem: 'arcane-focus',
      slotTable: 'full', swapOnLevelUp: 1, startLevel: 1,
    },
    subclassLevel: 3,
    subclassFeatureLevels: [3, 6, 14, 18],
    subclasses: ['aberrant', 'clockwork', 'draconic', 'wild-magic'],
    weaponMasteryCount: null,
    progression: {
      sorceryPoints: [0, 0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
      metamagicKnown: [0, 0, 2, 2, 2, 2, 2, 2, 2, 2, 4, 4, 4, 4, 4, 4, 4, 6, 6, 6, 6],
    },
    features: {
      1: [
        { id: 'sorcerer-spellcasting', name: 'Spellcasting', desc: 'You do not read the Weave; it answers when you want it to. You prepare and cast sorcerer spells with Charisma.', mech: { passive: 'spellcasting' }, choice: { type: 'cantrip', count: 4, from: 'sorcerer' } },
        {
          id: 'innate-sorcery', name: 'Innate Sorcery',
          desc: 'As a Bonus Action, let the birthright off its leash for one minute: your spell save DC increases by 1 and you have advantage on the attack rolls of your sorcerer spells.',
          uses: { max: 2, recharge: 'long' },
          mech: { resource: { id: 'innate-sorcery', name: 'Innate Sorcery', max: 2, recharge: 'long' }, passive: 'innate-sorcery' },
        },
      ],
      2: [
        {
          id: 'font-of-magic', name: 'Font of Magic',
          desc: 'You carry Sorcery Points equal to your sorcerer level, and can burn them to create spell slots or dissolve slots back into points.',
          uses: { max: [0, 0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20], recharge: 'long' },
          mech: { resource: { id: 'sorcery-points', name: 'Sorcery Points', max: 2, recharge: 'long' }, passive: 'font-of-magic' },
        },
        {
          id: 'metamagic', name: 'Metamagic',
          desc: 'Two ways to bend a spell out of its usual shape, paid for in Sorcery Points. You may swap one option whenever you gain a sorcerer level.',
          mech: { metamagicKnown: 2 },
          choice: {
            type: 'metamagic', count: 2,
            from: ['careful-spell', 'distant-spell', 'empowered-spell', 'extended-spell', 'heightened-spell', 'quickened-spell', 'seeking-spell', 'subtle-spell', 'transmuted-spell', 'twinned-spell'],
          },
        },
      ],
      3: [
        { id: 'sorcerer-subclass', name: 'Sorcerer Subclass', desc: 'The source of your power: Aberrant, Clockwork, Draconic or Wild Magic.', choice: { type: 'subclass', count: 1, from: ['aberrant', 'clockwork', 'draconic', 'wild-magic'] } },
      ],
      4: [ASI],
      5: [
        { id: 'sorcerous-restoration', name: 'Sorcerous Restoration', desc: 'When you finish a Short Rest you can regain Sorcery Points equal to half your sorcerer level, once per Long Rest.', mech: { passive: 'sorcerous-restoration' } },
      ],
      6: [{ id: 'sorcerer-subclass-6', name: 'Subclass Feature', desc: 'Your bloodline asserts itself further.', choice: { type: 'subclassOption', count: 1, from: 'auto' } }],
      7: [
        { id: 'sorcery-incarnate', name: 'Sorcery Incarnate', desc: 'If you have no uses of Innate Sorcery left, you can spend 2 Sorcery Points to activate it anyway — and while it is active you can use two Metamagic options on a single spell.', mech: { passive: 'sorcery-incarnate' } },
      ],
      8: [ASI],
      9: [
        { id: 'sorcerer-circle-5', name: 'Fifth-Circle Magic', desc: 'Fifth-circle spells come as easily as the rest: cone of cold, hold monster, telekinesis.', mech: { passive: 'spell-tier-5' } },
      ],
      10: [
        {
          id: 'metamagic-2', name: 'Metamagic (Two More)',
          desc: 'Two further ways to reshape your magic mid-cast.',
          mech: { metamagicKnown: 4 },
          choice: {
            type: 'metamagic', count: 2,
            from: ['careful-spell', 'distant-spell', 'empowered-spell', 'extended-spell', 'heightened-spell', 'quickened-spell', 'seeking-spell', 'subtle-spell', 'transmuted-spell', 'twinned-spell'],
          },
        },
      ],
      11: [
        { id: 'sorcerer-circle-6', name: 'Sixth-Circle Magic', desc: 'Sixth-circle spells — disintegrate, chain lightning — become part of what you simply are.', mech: { passive: 'spell-tier-6' } },
      ],
      12: [ASI],
      13: [
        { id: 'sorcerer-circle-7', name: 'Seventh-Circle Magic', desc: 'Seventh-circle magic answers: finger of death, plane shift, reverse gravity.', mech: { passive: 'spell-tier-7' } },
      ],
      14: [{ id: 'sorcerer-subclass-14', name: 'Subclass Feature', desc: 'Your bloodline grants a greater power.', choice: { type: 'subclassOption', count: 1, from: 'auto' } }],
      15: [
        { id: 'sorcerer-circle-8', name: 'Eighth-Circle Magic', desc: 'Eighth-circle workings — sunburst, dominate monster — are within reach.', mech: { passive: 'spell-tier-8' } },
      ],
      16: [ASI],
      17: [
        {
          id: 'metamagic-3', name: 'Metamagic (Two More)',
          desc: 'Two final Metamagic options, and the ninth circle opens alongside them.',
          mech: { metamagicKnown: 6, passive: 'spell-tier-9' },
          choice: {
            type: 'metamagic', count: 2,
            from: ['careful-spell', 'distant-spell', 'empowered-spell', 'extended-spell', 'heightened-spell', 'quickened-spell', 'seeking-spell', 'subtle-spell', 'transmuted-spell', 'twinned-spell'],
          },
        },
      ],
      18: [{ id: 'sorcerer-subclass-18', name: 'Subclass Feature', desc: 'Your bloodline reaches its full expression.', choice: { type: 'subclassOption', count: 1, from: 'auto' } }],
      19: [EPIC_BOON],
      20: [
        { id: 'arcane-apotheosis', name: 'Arcane Apotheosis', desc: 'While Innate Sorcery is active you can use one Metamagic option on each of your turns without spending Sorcery Points. The blood has finished replacing the study.', mech: { passive: 'arcane-apotheosis' } },
      ],
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // WARLOCK
  // ═══════════════════════════════════════════════════════════════════════════
  // 2024 NOTE: Pact of the Blade / Chain / Tome are Eldritch Invocations, not a
  // separate level-3 Pact Boon feature — they appear in the invocation list below.
  warlock: {
    id: 'warlock',
    name: 'Warlock',
    desc: 'Someone made a bargain, and something on the other side agreed. Archfey of the High Forest, fiends bound under Baldur\'s Gate, or a Great Old One dreaming beneath the Sea of Swords — the terms are always worse than they looked.',
    hitDie: 8,
    primary: ['cha'],
    saves: ['wis', 'cha'],
    armorProf: ['light'],
    weaponProf: ['simple'],
    toolProf: [],
    skillChoices: { count: 2, from: ['arcana', 'deception', 'history', 'intimidation', 'investigation', 'nature', 'religion'] },
    startingGold: '4d4*10',
    startingGoldFixed: 100,
    startingKits: [
      { id: 'pact-scholar', name: 'Pact Scholar', desc: 'Leathers, a sickle, a pair of daggers and a book of occult lore you should probably not have opened.', items: [['leather-armor', 1], ['sickle', 1], ['dagger', 2], ['arcane-focus', 1], ['book', 1], ['scholars-pack', 1]], gold: 15 },
      { id: 'hexblade-sellsword', name: 'Bargain-Struck Sellsword', desc: 'Studded leather and a blade that whispers. Grista at the Sleeping Giant has seen your type before.', items: [['studded-leather', 1], ['longsword', 1], ['dagger', 2], ['arcane-focus', 1], ['dungeoneers-pack', 1]], gold: 10 },
      { id: 'warlock-purse', name: 'Payment Up Front', desc: 'Your patron settled in coin. Spend it before it is missed.', items: [], gold: 100 },
    ],
    spellcasting: {
      ability: 'cha', type: 'pact', list: 'warlock',
      cantripsKnown: CANTRIPS_2,
      prepFormula: PREP_PACT, preparedTable: PREP_PACT,
      spellsKnownTable: null,
      ritual: false, focus: 'arcane', focusItem: 'arcane-focus',
      slotTable: 'pact', swapOnLevelUp: 1, startLevel: 1,
      mysticArcanum: { 11: 6, 13: 7, 15: 8, 17: 9 },
    },
    subclassLevel: 3,
    subclassFeatureLevels: [3, 6, 10, 14],
    subclasses: ['archfey', 'celestial', 'fiend', 'great-old-one'],
    weaponMasteryCount: null,
    progression: {
      invocationsKnown: [0, 1, 3, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 12, 12],
    },
    invocationList: [
      'agonizing-blast', 'armor-of-shadows', 'ascendant-step', 'devils-sight', 'devouring-blade',
      'eldritch-mind', 'eldritch-smite', 'eldritch-spear', 'fiendish-vigor', 'gaze-of-two-minds',
      'gift-of-the-depths', 'gift-of-the-protectors', 'investment-of-the-chain-master',
      'lessons-of-the-first-ones', 'lifedrinker', 'mask-of-many-faces', 'master-of-myriad-forms',
      'misty-visions', 'one-with-shadows', 'otherworldly-leap', 'pact-of-the-blade',
      'pact-of-the-chain', 'pact-of-the-tome', 'repelling-blast', 'thirsting-blade',
      'visions-of-distant-realms', 'whispers-of-the-grave', 'witch-sight',
    ],
    features: {
      1: [
        {
          id: 'eldritch-invocations', name: 'Eldritch Invocations',
          desc: 'Fragments of forbidden knowledge that reshape you permanently. You begin with one, and gain more as your pact deepens; Pact of the Blade, Chain and Tome are all invocations in their own right.',
          mech: { invocationsKnown: 1 },
          choice: { type: 'invocation', count: 1, from: 'auto' },
        },
        { id: 'pact-magic', name: 'Pact Magic', desc: 'Your magic comes as a small number of slots that always burn at your highest level and return on a Short Rest. You prepare warlock spells using Charisma.', mech: { passive: 'pact-magic' }, choice: { type: 'cantrip', count: 2, from: 'warlock' } },
      ],
      2: [
        {
          id: 'magical-cunning', name: 'Magical Cunning',
          desc: 'A one-minute rite regains expended Pact Magic slots up to half your maximum, once per Long Rest. The patron finds it easier to give than to be asked twice.',
          uses: { max: 1, recharge: 'long' },
          mech: { resource: { id: 'magical-cunning', name: 'Magical Cunning', max: 1, recharge: 'long' }, passive: 'magical-cunning' },
        },
        { id: 'warlock-invocations-3', name: 'Eldritch Invocations (3 Known)', desc: 'Two further invocations settle into you.', mech: { invocationsKnown: 3 }, choice: { type: 'invocation', count: 2, from: 'auto' } },
      ],
      3: [
        { id: 'warlock-subclass', name: 'Warlock Subclass', desc: 'The thing on the other end of the bargain: Archfey, Celestial, Fiend or Great Old One.', choice: { type: 'subclass', count: 1, from: ['archfey', 'celestial', 'fiend', 'great-old-one'] } },
        { id: 'warlock-invocations-5', name: 'Eldritch Invocations (5 Known)', desc: 'Two more invocations, and the shape of your pact becomes obvious to anyone who knows the signs.', mech: { invocationsKnown: 5 }, choice: { type: 'invocation', count: 2, from: 'auto' } },
      ],
      4: [ASI],
      5: [
        { id: 'warlock-pact-3', name: 'Third-Circle Pact Slots', desc: 'Your Pact Magic slots now burn at the third circle — every spell you cast is cast at that strength.', mech: { passive: 'pact-tier-3' }, choice: { type: 'invocation', count: 1, from: 'auto' } },
      ],
      6: [{ id: 'warlock-subclass-6', name: 'Subclass Feature', desc: 'Your patron grants a new gift, and expects it used.', choice: { type: 'subclassOption', count: 1, from: 'auto' } }],
      7: [
        { id: 'warlock-pact-4', name: 'Fourth-Circle Pact Slots', desc: 'Your pact slots rise to the fourth circle, and another invocation takes root.', mech: { passive: 'pact-tier-4' }, choice: { type: 'invocation', count: 1, from: 'auto' } },
      ],
      8: [ASI],
      9: [
        {
          id: 'contact-patron', name: 'Contact Patron',
          desc: 'You always have Contact Other Plane prepared and can cast it without a spell slot once per Long Rest to speak with your patron directly — and you automatically succeed on the save.',
          uses: { max: 1, recharge: 'long' },
          mech: { alwaysPrepared: ['contact-other-plane'], freeCasts: { spellId: 'contact-other-plane', uses: 1, recharge: 'long' }, passive: 'contact-patron' },
          choice: { type: 'invocation', count: 1, from: 'auto' },
        },
      ],
      10: [{ id: 'warlock-subclass-10', name: 'Subclass Feature', desc: 'Your patron deepens its investment in you.', choice: { type: 'subclassOption', count: 1, from: 'auto' } }],
      11: [
        {
          id: 'mystic-arcanum-6', name: 'Mystic Arcanum (Level 6)',
          desc: 'Your patron entrusts you with one sixth-circle warlock spell, castable once per Long Rest without a slot.',
          uses: { max: 1, recharge: 'long' },
          mech: { mysticArcanum: 6 },
          choice: { type: 'spell', count: 1, from: 'warlock-6' },
        },
      ],
      12: [ASI],
      13: [
        {
          id: 'mystic-arcanum-7', name: 'Mystic Arcanum (Level 7)',
          desc: 'A seventh-circle spell is given to you outright, once per Long Rest.',
          uses: { max: 1, recharge: 'long' },
          mech: { mysticArcanum: 7 },
          choice: { type: 'spell', count: 1, from: 'warlock-7' },
        },
      ],
      14: [{ id: 'warlock-subclass-14', name: 'Subclass Feature', desc: 'Your patron reveals the last of what it promised.', choice: { type: 'subclassOption', count: 1, from: 'auto' } }],
      15: [
        {
          id: 'mystic-arcanum-8', name: 'Mystic Arcanum (Level 8)',
          desc: 'An eighth-circle spell, held in trust and cast once per Long Rest.',
          uses: { max: 1, recharge: 'long' },
          mech: { mysticArcanum: 8 },
          choice: { type: 'spell', count: 1, from: 'warlock-8' },
        },
      ],
      16: [ASI],
      17: [
        {
          id: 'mystic-arcanum-9', name: 'Mystic Arcanum (Level 9)',
          desc: 'The ninth circle, granted rather than earned. Once per Long Rest, without a slot.',
          uses: { max: 1, recharge: 'long' },
          mech: { mysticArcanum: 9 },
          choice: { type: 'spell', count: 1, from: 'warlock-9' },
        },
      ],
      18: [
        { id: 'warlock-invocations-12', name: 'Eldritch Invocations (12 Known)', desc: 'Your final invocations settle. Whatever you were before the bargain, this is what you are now.', mech: { invocationsKnown: 12 }, choice: { type: 'invocation', count: 1, from: 'auto' } },
      ],
      19: [EPIC_BOON],
      20: [
        {
          id: 'eldritch-master', name: 'Eldritch Master',
          desc: 'As a Magic action you can regain all expended Pact Magic slots, once per Long Rest. The patron no longer answers you — it simply pays out.',
          uses: { max: 1, recharge: 'long' },
          mech: { resource: { id: 'eldritch-master', name: 'Eldritch Master', max: 1, recharge: 'long' }, passive: 'eldritch-master' },
        },
      ],
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // WIZARD
  // ═══════════════════════════════════════════════════════════════════════════
  wizard: {
    id: 'wizard',
    name: 'Wizard',
    desc: 'Magic taken apart, written down and put back together on purpose. The tradition runs from Netheril\'s ruins through Blackstaff Tower to whichever hedge-mage in Phandalin will sell you a scroll — and Iarno Albrek proved how badly it can go wrong.',
    hitDie: 6,
    primary: ['int'],
    saves: ['int', 'wis'],
    armorProf: [],
    weaponProf: ['simple'],
    toolProf: [],
    skillChoices: { count: 2, from: ['arcana', 'history', 'insight', 'investigation', 'medicine', 'nature', 'religion'] },
    startingGold: '4d4*10',
    startingGoldFixed: 55,
    startingKits: [
      { id: 'apprentice-of-the-tower', name: 'Apprentice of Blackstaff Tower', desc: 'Two daggers, a quarterstaff focus, a robe and the spellbook you copied by hand.', items: [['dagger', 2], ['quarterstaff', 1], ['robe', 1], ['spellbook', 1], ['scholars-pack', 1]], gold: 5 },
      { id: 'hedge-conjurer', name: 'Hedge Conjurer', desc: 'A component pouch, a light crossbow and a battered spellbook of small, practical workings.', items: [['dagger', 1], ['light-crossbow', 1], ['crossbow-bolt', 20], ['component-pouch', 1], ['spellbook', 1], ['explorers-pack', 1]], gold: 8 },
      { id: 'wizard-purse', name: 'Sold the Library', desc: 'You kept the spellbook and sold everything else. Coin buys better reagents anyway.', items: [['spellbook', 1]], gold: 55 },
    ],
    spellcasting: {
      ability: 'int', type: 'prepared', list: 'wizard',
      cantripsKnown: CANTRIPS_3,
      prepFormula: PREP_FULL, preparedTable: PREP_FULL,
      spellsKnownTable: null,
      ritual: true, focus: 'arcane', focusItem: 'arcane-focus',
      slotTable: 'full', swapOnLevelUp: 1, startLevel: 1,
      spellbook: { startingSpells: 6, perLevel: 2, scribeCostPerLevel: 50, scribeHoursPerLevel: 2, prepareFrom: 'spellbook' },
    },
    subclassLevel: 3,
    subclassFeatureLevels: [3, 6, 10, 14],
    subclasses: ['abjurer', 'diviner', 'evoker', 'illusionist'],
    weaponMasteryCount: null,
    progression: {
      arcaneRecoverySlotLevels: [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10],
    },
    features: {
      1: [
        { id: 'wizard-spellcasting', name: 'Spellcasting', desc: 'Your spellbook is the real class feature. You prepare wizard spells from it with Intelligence, and copy new ones into it wherever you find them.', mech: { passive: 'spellcasting' }, choice: { type: 'cantrip', count: 3, from: 'wizard' } },
        { id: 'ritual-adept', name: 'Ritual Adept', desc: 'You can cast any spell in your spellbook as a Ritual if it has the Ritual tag — no slot spent, ten minutes added. It need not even be prepared.', mech: { passive: 'ritual-adept' } },
        {
          id: 'arcane-recovery', name: 'Arcane Recovery',
          desc: 'Once per day, after a Short Rest, recover expended spell slots with a combined level equal to half your wizard level (rounded up), none of them level 6 or higher.',
          uses: { max: 1, recharge: 'long' },
          mech: { resource: { id: 'arcane-recovery', name: 'Arcane Recovery', max: 1, recharge: 'long' }, passive: 'arcane-recovery' },
        },
      ],
      2: [
        {
          id: 'wizard-scholar', name: 'Scholar',
          desc: 'Years in the stacks show. Gain Expertise in one of Arcana, History, Investigation, Medicine, Nature or Religion that you are proficient in.',
          mech: { skillExpertise: [] },
          choice: { type: 'expertise', count: 1, from: ['arcana', 'history', 'investigation', 'medicine', 'nature', 'religion'] },
        },
      ],
      3: [
        { id: 'wizard-subclass', name: 'Wizard Subclass', desc: 'The school you specialise in: Abjurer, Diviner, Evoker or Illusionist.', choice: { type: 'subclass', count: 1, from: ['abjurer', 'diviner', 'evoker', 'illusionist'] } },
      ],
      4: [ASI],
      5: [
        { id: 'memorize-spell', name: 'Memorize Spell', desc: 'Whenever you finish a Short Rest you can study your spellbook and swap one prepared wizard spell for another one written there.', mech: { passive: 'memorize-spell' } },
      ],
      6: [{ id: 'wizard-subclass-6', name: 'Subclass Feature', desc: 'Your school grants a new technique.', choice: { type: 'subclassOption', count: 1, from: 'auto' } }],
      7: [
        { id: 'wizard-circle-4', name: 'Fourth-Circle Spells', desc: 'Fourth-circle magic enters your book: polymorph, dimension door, greater invisibility.', mech: { passive: 'spell-tier-4' } },
      ],
      8: [ASI],
      9: [
        { id: 'wizard-circle-5', name: 'Fifth-Circle Spells', desc: 'Fifth-circle workings — wall of force, animate objects, telekinesis — are now within your reach.', mech: { passive: 'spell-tier-5' } },
      ],
      10: [{ id: 'wizard-subclass-10', name: 'Subclass Feature', desc: 'Your school deepens its instruction.', choice: { type: 'subclassOption', count: 1, from: 'auto' } }],
      11: [
        { id: 'wizard-circle-6', name: 'Sixth-Circle Spells', desc: 'The sixth circle opens: disintegrate, globe of invulnerability, true seeing.', mech: { passive: 'spell-tier-6' } },
      ],
      12: [ASI],
      13: [
        { id: 'wizard-circle-7', name: 'Seventh-Circle Spells', desc: 'Seventh-circle magic — teleport, forcecage, prismatic spray — can be written into your book.', mech: { passive: 'spell-tier-7' } },
      ],
      14: [{ id: 'wizard-subclass-14', name: 'Subclass Feature', desc: 'Your school grants its highest working.', choice: { type: 'subclassOption', count: 1, from: 'auto' } }],
      15: [
        { id: 'wizard-circle-8', name: 'Eighth-Circle Spells', desc: 'Eighth-circle spells such as maze and mind blank become yours to prepare.', mech: { passive: 'spell-tier-8' } },
      ],
      16: [ASI],
      17: [
        { id: 'wizard-circle-9', name: 'Ninth-Circle Spells', desc: 'The ninth circle — wish, time stop, meteor swarm. Very few in the North have ever held these in memory at once.', mech: { passive: 'spell-tier-9' } },
      ],
      18: [
        {
          id: 'spell-mastery', name: 'Spell Mastery',
          desc: 'Choose one level 1 and one level 2 wizard spell in your book. You can cast them at their lowest level without expending a slot, as often as you like.',
          mech: { passive: 'spell-mastery' },
          choice: { type: 'spell', count: 2, from: 'spellbook-1-2' },
        },
      ],
      19: [EPIC_BOON],
      20: [
        {
          id: 'signature-spells', name: 'Signature Spells',
          desc: 'Choose two level 3 wizard spells. They are always prepared, and you can cast each once without a slot, regaining that use on a Short Rest.',
          uses: { max: 2, recharge: 'short' },
          mech: { passive: 'signature-spells' },
          choice: { type: 'spell', count: 2, from: 'spellbook-3' },
        },
      ],
    },
  },
};

deepFreeze(CLASSES);

// ─── HELPERS (pure) ─────────────────────────────────────────────────────────

/** Every class id, in the canonical PHB order. */
export const CLASS_IDS = Object.freeze(Object.keys(CLASSES));

/** Recursively freeze a catalogue; safe on shared references and cycles. */
function deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object' || Object.isFrozen(obj)) return obj;
  Object.freeze(obj);
  for (const key of Object.keys(obj)) deepFreeze(obj[key]);
  return obj;
}

/** All class entries as an array, alphabetical by display name. */
export function classList() {
  return Object.values(CLASSES).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** Features gained AT exactly `level` for a class. Always returns an array. */
export function featuresAt(classId, level) {
  const cls = CLASSES[classId];
  if (!cls) return [];
  const lvl = Math.max(1, Math.min(20, Math.floor(level)));
  return cls.features[lvl] || [];
}

/** Every feature a character of `level` has accumulated, levels 1..level. */
export function featuresThrough(classId, level) {
  const out = [];
  const top = Math.max(1, Math.min(20, Math.floor(level)));
  for (let l = 1; l <= top; l++) out.push(...featuresAt(classId, l));
  return out;
}

/** The spellcasting block for a class, or null for non-casters. */
export function spellcastingOf(classId) {
  const cls = CLASSES[classId];
  return cls ? cls.spellcasting || null : null;
}

/** True if the class casts spells at all. */
export function isSpellcaster(classId) {
  return spellcastingOf(classId) !== null;
}

/** Subclass ids offered by a class. */
export function subclassesOf(classId) {
  const cls = CLASSES[classId];
  return cls ? cls.subclasses : [];
}

/** How many Weapon Mastery properties this class knows at `level` (0 if none). */
export function weaponMasteryAt(classId, level) {
  const cls = CLASSES[classId];
  if (!cls || !cls.weaponMasteryCount) return 0;
  const lvl = Math.max(0, Math.min(20, Math.floor(level)));
  return cls.weaponMasteryCount[lvl] || 0;
}

/**
 * Read one of a class's progression tables at a given level, e.g.
 * progressionAt('rogue','sneakAttack',9) -> '5d6'.
 * Returns null when the class or table does not exist.
 */
export function progressionAt(classId, key, level) {
  const cls = CLASSES[classId];
  if (!cls || !cls.progression) return null;
  const table = cls.progression[key];
  if (!Array.isArray(table)) return table === undefined ? null : table;
  const lvl = Math.max(0, Math.min(20, Math.floor(level)));
  return table[lvl];
}

/**
 * Resolve a feature's `uses.max` at a given level. Handles the three forms used
 * in this file: a flat number, a 21-entry table indexed by level, and the
 * strings 'prof' / an ability id, which the caller must resolve per character.
 */
export function usesAt(feature, level) {
  if (!feature || !feature.uses) return null;
  const max = feature.uses.max;
  if (Array.isArray(max)) return max[Math.max(0, Math.min(20, Math.floor(level)))];
  return max;
}

/** Levels at which a class presents any player choice (for the level-up UI). */
export function choiceLevels(classId) {
  const cls = CLASSES[classId];
  if (!cls) return [];
  const out = [];
  for (let l = 1; l <= 20; l++) {
    if ((cls.features[l] || []).some((f) => f.choice)) out.push(l);
  }
  return out;
}
