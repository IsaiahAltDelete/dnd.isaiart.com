// data/monsters_low.js — the low bestiary: every creature of CR 0 through CR 4 that
// a Sword Coast party actually meets between Phandalin and the shallow Undermountain,
// plus the named encounter packs the wilderness tables draw from.
//
// PURE DATA. Nothing is imported. Nothing here mutates. The catalogue is deep frozen,
// so `rules/scaling.js` may read it freely and must clone to build a Character.
//
// Rules note (2024 Monster Manual conventions):
//   - `hpDice` is the average-hp expression; the engine rolls or averages it.
//   - `skills` values are TOTAL modifiers, not proficiency ranks.
//   - `mech.passive` is a freeform tag consumed by combat hooks; parametric tags use
//     colons, e.g. 'regeneration:10:fire,acid' or 'surprise-attack:2d6'.
//   - Only the `mech` keys listed in SPEC.md §3 appear here.

// ---------------------------------------------------------------------------
// deepFreeze — recursive Object.freeze for the exported catalogue (HARD RULE 8).
// ---------------------------------------------------------------------------
function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const k of Object.keys(o)) deepFreeze(o[k]);
  }
  return o;
}

// ---------------------------------------------------------------------------
// Builders. Small and pure; they exist only so ~120 stat blocks are guaranteed the
// same shape — every optional field present, passive Perception derived, XP filled
// from the CR table — no matter which section wrote them.
// ---------------------------------------------------------------------------

/** DMG experience award by Challenge Rating, for the CR 0–4 band. */
const XP_BY_CR = { 0: 10, 0.125: 25, 0.25: 50, 0.5: 100, 1: 200, 2: 450, 3: 700, 4: 1100 };

/** Ability modifier, the one piece of arithmetic this file is allowed. */
function abmod(score) { return Math.floor((score - 10) / 2); }

/** 'Keen Hearing and Smell' -> 'keen-hearing-and-smell', for trait/action ids. */
function slug(s) {
  return String(s).toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** A stat-block trait. `mech` is read by the rules engine; null means pure flavour. */
function trait(name, desc, mech = null) {
  return { id: slug(name), name, desc, mech };
}

/** Melee or reach weapon attack. */
function melee(name, atkBonus, dice, dtype, o = {}) {
  return {
    id: o.id || slug(name), name, kind: 'attack',
    reach: o.reach || 5, range: null,
    atkBonus, dice, dtype,
    save: o.save || null,
    target: o.target || { kind: 'creature', count: 1 },
    effects: o.effects || [],
    uses: o.uses || null,
    desc: o.desc || '',
    ai: o.ai || { role: 'nuke', weight: 1 },
  };
}

/** Ranged weapon attack. `range` is [normal, long] in feet. */
function ranged(name, atkBonus, dice, dtype, range, o = {}) {
  return {
    id: o.id || slug(name), name, kind: 'attack',
    reach: null, range,
    atkBonus, dice, dtype,
    save: o.save || null,
    target: o.target || { kind: 'creature', count: 1 },
    effects: o.effects || [],
    uses: o.uses || null,
    desc: o.desc || '',
    ai: o.ai || { role: 'nuke', weight: 1 },
  };
}

/** Saving-throw action: breath weapons, gazes, spore clouds, spell-likes. */
function saveAct(name, o) {
  return {
    id: o.id || slug(name), name, kind: 'save',
    reach: null, range: o.range || null,
    atkBonus: null, dice: o.dice || null, dtype: o.dtype || null,
    save: o.save,
    target: o.target || { kind: 'creature', count: 1 },
    effects: o.effects || [],
    uses: o.uses || null,
    desc: o.desc || '',
    ai: o.ai || { role: 'aoe', weight: 1.2 },
  };
}

/** Multiattack routine. `routine` lists the action ids and how many of each. */
function multi(desc, routine, o = {}) {
  return {
    id: 'multiattack', name: 'Multiattack', kind: 'multiattack',
    reach: null, range: null, atkBonus: null, dice: null, dtype: null,
    save: null, target: { kind: 'self' }, effects: [],
    uses: null, desc, routine,
    ai: o.ai || { role: 'nuke', weight: 2 },
  };
}

/** Non-attack utility / heal / summon action. */
function util(name, o = {}) {
  return {
    id: o.id || slug(name), name, kind: o.kind || 'utility',
    reach: o.reach || null, range: o.range || null,
    atkBonus: null, dice: o.dice || null, dtype: o.dtype || null,
    save: o.save || null,
    target: o.target || { kind: 'self' },
    effects: o.effects || [],
    uses: o.uses || null,
    desc: o.desc || '',
    ai: o.ai || { role: 'utility', weight: 0.6 },
  };
}

/**
 * Normalise one stat block. Everything the spec's monster shape names is present on
 * every entry; `o` supplies the real numbers and anything omitted takes a sane default.
 */
function mon(id, name, o) {
  const a = o.abilities;
  const per = o.skills && o.skills.perception != null ? o.skills.perception : abmod(a.wis);
  return {
    id, name, desc: o.desc,
    cr: o.cr, type: o.type, subtype: o.subtype || null, size: o.size,
    ac: o.ac, acNote: o.acNote || null, hpDice: o.hpDice,
    speed: o.speed != null ? o.speed : 30,
    fly: o.fly || 0, swim: o.swim || 0, burrow: o.burrow || 0, climb: o.climb || 0,
    hover: !!o.hover,
    abilities: a,
    saveProf: o.saveProf || [],
    skills: o.skills || {},
    senses: o.senses || {},
    passivePerception: o.pp != null ? o.pp : 10 + per,
    resist: o.resist || [], immune: o.immune || [], vuln: o.vuln || [],
    condImmune: o.condImmune || [],
    languages: o.languages || [],
    traits: o.traits || [],
    actions: o.actions || [],
    bonusActions: o.bonusActions || [],
    reactions: o.reactions || [],
    legendary: o.legendary || null,
    lair: o.lair || null,
    ai: o.ai,
    xp: o.xp != null ? o.xp : (XP_BY_CR[o.cr] || 10),
    loot: o.loot || { gold: '', table: [] },
    sprite: o.sprite, tint: o.tint || null,
    biomes: o.biomes, groupSize: o.groupSize || [1, 1],
    faction: o.faction || null,
    boss: !!o.boss, elite: !!o.elite,
  };
}

// ---------------------------------------------------------------------------
// Reusable trait definitions. Written once, shared by every creature that has them,
// because the rules engine keys off the `passive` tag and not the prose.
// ---------------------------------------------------------------------------

const T_PACK_TACTICS = trait('Pack Tactics',
  "It fights best in a crowd, striking whenever a companion has the quarry occupied.",
  { passive: 'pack-tactics' });

const T_KEEN_SMELL = trait('Keen Smell',
  "It hunts down the wind, reading blood and fear on the air long before it sees prey.",
  { passive: 'keen-smell', skillProf: ['perception'] });

const T_KEEN_HEAR_SMELL = trait('Keen Hearing and Smell',
  "Ears and nose together make an ambush nearly impossible to lay against it.",
  { passive: 'keen-hearing-and-smell', skillProf: ['perception'] });

const T_SUNLIGHT_SENS = trait('Sunlight Sensitivity',
  "Raised in lightless places, it squints and falters under open sky or bright flame.",
  { passive: 'sunlight-sensitivity' });

const T_SPIDER_CLIMB = trait('Spider Climb',
  "It walks walls and ceilings as easily as floor, leaving no purchase behind it.",
  { passive: 'spider-climb' });

const T_WEB_SENSE = trait('Web Sense',
  "Every strand of its web is a nerve; it knows the moment something touches one.",
  { passive: 'web-sense' });

const T_WEB_WALKER = trait('Web Walker',
  "Webbing does not slow it, its own or another's.",
  { passive: 'web-walker' });

const T_AMPHIBIOUS = trait('Amphibious',
  "It breathes air and water alike.",
  { passive: 'amphibious' });

const T_STANDING_LEAP = trait('Standing Leap',
  "It can hurl itself across a gap from a dead stop, no run-up needed.",
  { passive: 'standing-leap', jumpMult: 2 });

const T_UNDEAD_FORTITUDE = trait('Undead Fortitude',
  "A blow that would fell a living thing only knocks it down; the corpse keeps rising.",
  { passive: 'undead-fortitude' });

const T_INCORPOREAL = trait('Incorporeal Movement',
  "It slides through stone and iron as though they were mist, though the passage burns.",
  { passive: 'incorporeal-movement:1d10:force' });

const T_FALSE_APPEARANCE_PLANT = trait('False Appearance',
  "Motionless, it is indistinguishable from ordinary dead wood and bramble.",
  { passive: 'false-appearance' });

const T_BLIND_BEYOND = trait('Blind Beyond Blindsight',
  "It has no eyes at all; beyond the reach of its other senses the world is simply absent.",
  { passive: 'blind-beyond-blindsight' });

const T_AGGRESSIVE = trait('Aggressive',
  "Gruumsh's blood runs hot. It closes the distance to the nearest foe without being told.",
  { passive: 'aggressive' });

const T_RAMPAGE = trait('Rampage',
  "The smell of a fresh kill drives it into a lunging frenzy at the next living thing.",
  { passive: 'rampage' });

const T_NIMBLE_ESCAPE = trait('Nimble Escape',
  "It ducks behind cover and slips away the instant a fight turns against it.",
  { passive: 'nimble-escape' });

const T_BRAVE = trait('Brave',
  "It has stood in a shield wall before and does not rattle easily.",
  { passive: 'brave', advSaveVs: ['frightened'] });

const T_SHADOW_STEALTH = trait('Shadow Stealth',
  "In anything less than full light it simply thins away into the dark.",
  { passive: 'shadow-stealth' });

const T_SUNLIGHT_WEAK = trait('Sunlight Weakness',
  "Direct sunlight unravels it; every effort comes harder beneath the sun.",
  { passive: 'sunlight-weakness' });

const T_MAGIC_RESIST = trait('Magic Resistance',
  "The Weave slides off it. Spells and magical effects find little purchase.",
  { passive: 'magic-resistance', advSaveVs: ['magic'] });

const T_ANTIMAGIC_SUSC = trait('Antimagic Susceptibility',
  "It is animate only by magic; suppress the magic and it clatters to the floor.",
  { passive: 'antimagic-susceptibility' });

const T_AMORPHOUS = trait('Amorphous',
  "It pours through any opening a coin could pass, without slowing.",
  { passive: 'amorphous' });

const T_UNDEAD_NATURE = trait('Undead Nature',
  "It does not require air, food, drink or sleep.",
  { passive: 'undead-nature' });

const T_CONSTRUCT_NATURE = trait('Construct Nature',
  "It does not require air, food, drink or sleep.",
  { passive: 'construct-nature' });

const T_DEVILS_SIGHT = trait("Devil's Sight",
  "Magical darkness is no darkness to it at all.",
  { passive: 'devils-sight', darkvision: 120 });

// Standard swarm chassis — shared condition immunities and the swarm tag.
const SWARM_COND = ['charmed', 'frightened', 'grappled', 'paralyzed', 'petrified', 'prone', 'restrained', 'stunned'];
const T_SWARM = trait('Swarm',
  "The mass can occupy another creature's space and squeeze through any crack a single one of them could.",
  { passive: 'swarm' });

const ALL = [];

// ===========================================================================
// BEASTS — the Triboar Trail, Neverwinter Wood, the Mere, and every cellar in
// Phandalin that has gone too long without a cat.
// ===========================================================================

ALL.push(
  mon('rat', 'Rat', {
    desc: "A common brown rat, bold in a way only Phandalin's grain cellars can teach. Alone it is nothing; rats are rarely alone.",
    cr: 0, type: 'beast', size: 'tiny', ac: 10, hpDice: '1d4-1',
    speed: 20, abilities: { str: 2, dex: 11, con: 9, int: 2, wis: 10, cha: 4 },
    senses: { darkvision: 30 },
    traits: [T_KEEN_SMELL],
    actions: [melee('Bite', 0, '1', 'piercing', { desc: "A quick nip at ankle or finger." })],
    ai: { archetype: 'swarm', aggression: 0.4, selfPreserve: 0.8, preferredRange: 5 },
    loot: { gold: '', table: [] },
    sprite: 'rat', biomes: ['city', 'ruins', 'dungeon', 'cave', 'mine'], groupSize: [3, 8],
  }),

  mon('bat', 'Bat', {
    desc: "A leather-winged sliver of the dark that stitches back and forth across a cave mouth at dusk. Startled, a roost of them can put out torches.",
    cr: 0, type: 'beast', size: 'tiny', ac: 12, hpDice: '1d4-1',
    speed: 5, fly: 30, abilities: { str: 2, dex: 15, con: 8, int: 2, wis: 12, cha: 4 },
    senses: { blindsight: 60 },
    traits: [
      trait('Echolocation', "It maps the dark in sound. Deafen it and it is blind.", { passive: 'echolocation' }),
      T_KEEN_HEAR_SMELL,
    ],
    actions: [melee('Bite', 0, '1', 'piercing')],
    ai: { archetype: 'skirmisher', aggression: 0.3, selfPreserve: 0.9, preferredRange: 5 },
    sprite: 'bat', biomes: ['cave', 'ruins', 'dungeon', 'crypt', 'mine'], groupSize: [2, 6],
  }),

  mon('raven', 'Raven', {
    desc: "Black as a Kelemvorite's sleeve and twice as knowing. Ravens follow warbands along the Triboar Trail because warbands leave meals behind.",
    cr: 0, type: 'beast', size: 'tiny', ac: 12, hpDice: '1d4-1',
    speed: 10, fly: 50, abilities: { str: 2, dex: 14, con: 8, int: 2, wis: 12, cha: 6 },
    skills: { perception: 3 },
    traits: [trait('Mimicry', "It apes any sound it has heard — a whistle, a scream, a name.", { passive: 'mimicry' })],
    actions: [melee('Beak', 4, '1', 'piercing')],
    ai: { archetype: 'skirmisher', aggression: 0.2, selfPreserve: 0.9, preferredRange: 5 },
    sprite: 'raven', biomes: ['plains', 'road', 'forest', 'ruins', 'hills'], groupSize: [2, 5],
  }),

  mon('jackal', 'Jackal', {
    desc: "A lean scavenger with a laughing bark, drawn north along the caravan roads by carrion. Cowardly one at a time, vicious in fours.",
    cr: 0, type: 'beast', size: 'small', ac: 12, hpDice: '1d6',
    speed: 40, abilities: { str: 8, dex: 15, con: 11, int: 3, wis: 12, cha: 6 },
    skills: { perception: 3 },
    traits: [T_KEEN_HEAR_SMELL, T_PACK_TACTICS],
    actions: [melee('Bite', 1, '1d4-1', 'piercing')],
    ai: { archetype: 'skirmisher', aggression: 0.5, selfPreserve: 0.7, preferredRange: 5 },
    sprite: 'wolf', tint: '#b09055', biomes: ['plains', 'road', 'hills'], groupSize: [3, 6],
  }),

  mon('hyena', 'Hyena', {
    desc: "Sloped, filthy and grinning, it runs with gnoll bands out of the Sword Mountains and eats what they leave. Its laugh carries a mile.",
    cr: 0, type: 'beast', size: 'medium', ac: 11, hpDice: '1d8+1',
    speed: 50, abilities: { str: 11, dex: 13, con: 12, int: 2, wis: 12, cha: 5 },
    skills: { perception: 3 },
    traits: [T_PACK_TACTICS],
    actions: [melee('Bite', 2, '1d6', 'piercing')],
    ai: { archetype: 'skirmisher', aggression: 0.6, selfPreserve: 0.6, preferredRange: 5 },
    sprite: 'hyena', biomes: ['plains', 'hills', 'ruins'], groupSize: [2, 6], faction: 'gnoll',
  }),

  mon('giant-fire-beetle', 'Giant Fire Beetle', {
    desc: "A hand-span beetle with two glands above its abdomen that glow a steady red for a day after death. Miners in the Sword Mountains gather them by the jarful.",
    cr: 0, type: 'beast', size: 'small', ac: 13, hpDice: '1d6+1',
    speed: 30, abilities: { str: 8, dex: 10, con: 12, int: 1, wis: 7, cha: 3 },
    senses: { blindsight: 30 },
    traits: [trait('Illumination', "Its glands shed bright light in a 10-foot radius, and dim light 10 feet beyond.", { passive: 'illumination:10' })],
    actions: [melee('Bite', 1, '1d6', 'slashing')],
    ai: { archetype: 'brute', aggression: 0.3, selfPreserve: 0.5, preferredRange: 5 },
    loot: { gold: '', table: [['torch', 0.3]] },
    sprite: 'beetle', biomes: ['cave', 'mine', 'underdark', 'dungeon'], groupSize: [2, 5],
  }),

  mon('giant-rat', 'Giant Rat', {
    desc: "Waist-high at the shoulder and utterly without fear, bred fat on whatever seeps into the undercellars. Tresendar Manor is thick with them.",
    cr: 0.125, type: 'beast', size: 'small', ac: 12, hpDice: '2d6',
    speed: 30, abilities: { str: 7, dex: 15, con: 11, int: 2, wis: 10, cha: 4 },
    senses: { darkvision: 60 },
    traits: [T_KEEN_SMELL, T_PACK_TACTICS],
    actions: [melee('Bite', 4, '1d4+2', 'piercing')],
    ai: { archetype: 'swarm', aggression: 0.6, selfPreserve: 0.5, preferredRange: 5 },
    loot: { gold: '', table: [] },
    sprite: 'rat', tint: '#8a6a4a', biomes: ['city', 'ruins', 'dungeon', 'cave', 'mine', 'crypt'], groupSize: [3, 8],
  }),

  mon('giant-weasel', 'Giant Weasel', {
    desc: "A rippling length of muscle and teeth that pours through burrow and root-tangle. Farmers on Alderleaf land lose whole coops to one.",
    cr: 0.125, type: 'beast', size: 'medium', ac: 13, hpDice: '2d8',
    speed: 40, abilities: { str: 11, dex: 16, con: 10, int: 4, wis: 12, cha: 5 },
    skills: { perception: 3, stealth: 5 },
    senses: { darkvision: 60 },
    traits: [T_KEEN_HEAR_SMELL],
    actions: [melee('Bite', 5, '1d4+3', 'piercing')],
    ai: { archetype: 'skirmisher', aggression: 0.5, selfPreserve: 0.7, preferredRange: 5 },
    sprite: 'weasel', biomes: ['plains', 'forest', 'hills', 'cave'], groupSize: [1, 3],
  }),

  mon('mastiff', 'Mastiff', {
    desc: "A broad-chested hound of the sort Lionshield caravans keep chained to the tailgate. Loyal, loud, and heavy enough to put a man down.",
    cr: 0.125, type: 'beast', size: 'medium', ac: 12, hpDice: '1d8+1',
    speed: 40, abilities: { str: 13, dex: 14, con: 12, int: 3, wis: 12, cha: 7 },
    skills: { perception: 3 },
    traits: [T_KEEN_HEAR_SMELL],
    actions: [melee('Bite', 3, '1d6+1', 'piercing', {
      save: { ability: 'str', dc: 11, onSuccess: 'negate' },
      effects: [{ kind: 'condition', id: 'prone' }],
      desc: "A shoulder-first lunge that bowls the target over.",
    })],
    ai: { archetype: 'brute', aggression: 0.6, selfPreserve: 0.5, preferredRange: 5 },
    sprite: 'wolf', tint: '#7a5a3a', biomes: ['city', 'road', 'plains'], groupSize: [1, 4],
  }),

  mon('poisonous-snake', 'Poisonous Snake', {
    desc: "A thin dark adder of the reed-beds and cellar steps. It wants nothing to do with you until you put a boot beside it.",
    cr: 0.125, type: 'beast', size: 'tiny', ac: 13, hpDice: '1d4',
    speed: 30, swim: 30, abilities: { str: 2, dex: 16, con: 11, int: 1, wis: 10, cha: 3 },
    senses: { blindsight: 10 },
    actions: [melee('Bite', 5, '1', 'piercing', {
      save: { ability: 'con', dc: 10, onSuccess: 'half' },
      dice: '1', desc: "The bite is trivial; the venom is not.",
      effects: [{ kind: 'damage', dice: '2d4', type: 'poison' }],
    })],
    ai: { archetype: 'skirmisher', aggression: 0.3, selfPreserve: 0.8, preferredRange: 5 },
    sprite: 'snake', biomes: ['marsh', 'forest', 'plains', 'ruins', 'cave'], groupSize: [1, 3],
  }),

  mon('giant-crab', 'Giant Crab', {
    desc: "A shield-sized crab of the Sword Coast tide flats, patient in the shallows until something wades past. The claws crack a shinbone as easily as a mussel.",
    cr: 0.125, type: 'beast', size: 'medium', ac: 15, hpDice: '3d8',
    speed: 30, swim: 30, abilities: { str: 13, dex: 15, con: 11, int: 1, wis: 9, cha: 3 },
    skills: { stealth: 4 },
    senses: { blindsight: 30 },
    traits: [T_AMPHIBIOUS],
    actions: [melee('Claw', 3, '1d6+1', 'bludgeoning', {
      save: { ability: 'str', dc: 11, onSuccess: 'negate' },
      effects: [{ kind: 'condition', id: 'grappled' }],
      desc: "The claw closes and does not open.",
    })],
    ai: { archetype: 'tank', aggression: 0.5, selfPreserve: 0.4, preferredRange: 5 },
    sprite: 'crab', biomes: ['coast', 'marsh'], groupSize: [1, 4],
  }),

  mon('stirge', 'Stirge', {
    desc: "A fist-sized horror of wings and proboscis that drops from a cave ceiling and does not let go until it is full. Cragmaw Hideout's upper passages hum with them.",
    cr: 0.125, type: 'beast', size: 'tiny', ac: 14, hpDice: '1d4',
    speed: 10, fly: 40, abilities: { str: 4, dex: 16, con: 11, int: 2, wis: 8, cha: 6 },
    senses: { darkvision: 60 },
    actions: [melee('Blood Drain', 5, '1d4+3', 'piercing', {
      effects: [{ kind: 'condition', id: 'attached' }],
      desc: "It fixes on and drains 1d4+3 hit points each round until it detaches, gorged.",
    })],
    ai: { archetype: 'skirmisher', aggression: 0.9, selfPreserve: 0.2, preferredRange: 5 },
    sprite: 'stirge', biomes: ['cave', 'ruins', 'dungeon', 'marsh', 'mine'], groupSize: [3, 8],
  }),

  mon('giant-bat', 'Giant Bat', {
    desc: "A wingspan the length of a longspear, screeching down the mine shafts under the Sword Mountains. Goblins in Cragmaw Hideout tie tin to the ceilings to scare them off.",
    cr: 0.25, type: 'beast', size: 'large', ac: 13, hpDice: '4d10',
    speed: 10, fly: 60, abilities: { str: 15, dex: 16, con: 11, int: 2, wis: 12, cha: 6 },
    senses: { blindsight: 60 },
    traits: [
      trait('Echolocation', "It maps the dark in sound. Deafen it and it is blind.", { passive: 'echolocation' }),
      T_KEEN_HEAR_SMELL,
    ],
    actions: [melee('Bite', 4, '1d6+3', 'piercing')],
    ai: { archetype: 'skirmisher', aggression: 0.6, selfPreserve: 0.6, preferredRange: 5 },
    sprite: 'bat', tint: '#6b4a3a', biomes: ['cave', 'mine', 'ruins', 'dungeon', 'underdark'], groupSize: [1, 4],
  }),

  mon('giant-centipede', 'Giant Centipede', {
    desc: "Two feet of armoured segments and a pair of venom hooks. It prefers the wet stone under old Netherese foundations.",
    cr: 0.25, type: 'beast', size: 'small', ac: 13, hpDice: '1d6+1',
    speed: 30, climb: 30, abilities: { str: 5, dex: 14, con: 12, int: 1, wis: 7, cha: 3 },
    senses: { blindsight: 30 },
    actions: [melee('Bite', 4, '1d4+2', 'piercing', {
      save: { ability: 'con', dc: 11, onSuccess: 'half' },
      effects: [{ kind: 'damage', dice: '3d4', type: 'poison' }, { kind: 'condition', id: 'paralyzed', onDrop: true }],
      desc: "Venom enough to stop a heart; a victim dropped to 0 lies paralyzed for an hour.",
    })],
    ai: { archetype: 'ambusher', aggression: 0.6, selfPreserve: 0.4, preferredRange: 5 },
    sprite: 'centipede', biomes: ['cave', 'ruins', 'dungeon', 'mine', 'underdark', 'crypt'], groupSize: [2, 5],
  }),

  mon('giant-frog', 'Giant Frog', {
    desc: "Dog-sized, glass-eyed and appallingly fast with its tongue. The Mere of Dead Men is thick with them, and with bullywugs who ride them.",
    cr: 0.25, type: 'beast', size: 'medium', ac: 11, hpDice: '4d8',
    speed: 30, swim: 30, abilities: { str: 12, dex: 13, con: 11, int: 2, wis: 10, cha: 3 },
    skills: { perception: 2, stealth: 3 },
    senses: { darkvision: 30 },
    traits: [T_AMPHIBIOUS, T_STANDING_LEAP],
    actions: [melee('Bite', 3, '1d6+1', 'piercing', {
      save: { ability: 'str', dc: 11, onSuccess: 'negate' },
      effects: [{ kind: 'condition', id: 'grappled' }],
      desc: "The tongue lashes out and the mouth follows.",
    }),
    util('Swallow', {
      kind: 'utility', desc: "It swallows a Small creature it has grappled, which takes 1d6 acid damage each round inside.",
      effects: [{ kind: 'condition', id: 'swallowed' }, { kind: 'damage', dice: '1d6', type: 'acid' }],
      ai: { role: 'control', weight: 1 },
    })],
    ai: { archetype: 'ambusher', aggression: 0.6, selfPreserve: 0.5, preferredRange: 5 },
    sprite: 'frog', biomes: ['marsh', 'coast', 'forest'], groupSize: [2, 5],
  }),

  mon('giant-lizard', 'Giant Lizard', {
    desc: "A pack-lizard the length of a cart, sluggish in cold and vicious when cornered. Some Underdark traders saddle them; most just eat them.",
    cr: 0.25, type: 'beast', size: 'large', ac: 12, hpDice: '3d10+3',
    speed: 30, climb: 30, abilities: { str: 15, dex: 12, con: 13, int: 2, wis: 10, cha: 5 },
    senses: { darkvision: 30 },
    actions: [melee('Bite', 4, '1d8+2', 'piercing')],
    ai: { archetype: 'brute', aggression: 0.5, selfPreserve: 0.5, preferredRange: 5 },
    sprite: 'lizard', biomes: ['cave', 'underdark', 'marsh', 'ruins', 'mine'], groupSize: [1, 3],
  }),

  mon('giant-poisonous-snake', 'Giant Poisonous Snake', {
    desc: "Ten feet of banded muscle with a head like a spade. It hangs in the low branches of Neverwinter Wood and drops on what passes beneath.",
    cr: 0.25, type: 'beast', size: 'medium', ac: 14, hpDice: '2d8+2',
    speed: 30, swim: 30, abilities: { str: 10, dex: 18, con: 13, int: 2, wis: 10, cha: 3 },
    skills: { perception: 2 },
    senses: { blindsight: 10 },
    actions: [melee('Bite', 6, '1d4+4', 'piercing', {
      reach: 10,
      save: { ability: 'con', dc: 11, onSuccess: 'half' },
      effects: [{ kind: 'damage', dice: '3d6', type: 'poison' }],
    })],
    ai: { archetype: 'ambusher', aggression: 0.6, selfPreserve: 0.6, preferredRange: 10 },
    sprite: 'snake', tint: '#4a7a3a', biomes: ['marsh', 'forest', 'pine-forest', 'coast'], groupSize: [1, 2],
  }),

  mon('constrictor-snake', 'Constrictor Snake', {
    desc: "A slow, patient coil of the drowned lands, thick as a man's thigh. It does not bite to kill; the bite is only how it takes hold.",
    cr: 0.25, type: 'beast', size: 'large', ac: 12, hpDice: '2d10+2',
    speed: 30, swim: 30, abilities: { str: 15, dex: 14, con: 12, int: 1, wis: 10, cha: 3 },
    senses: { blindsight: 10 },
    actions: [
      melee('Bite', 4, '1d6+2', 'piercing', { reach: 5 }),
      melee('Constrict', 4, '1d8+2', 'bludgeoning', {
        save: { ability: 'str', dc: 14, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'grappled' }, { kind: 'condition', id: 'restrained' }],
        ai: { role: 'control', weight: 1.4 },
      }),
    ],
    ai: { archetype: 'ambusher', aggression: 0.6, selfPreserve: 0.4, preferredRange: 5 },
    sprite: 'snake', tint: '#7a6a3a', biomes: ['marsh', 'forest', 'coast'], groupSize: [1, 2],
  }),

  mon('wolf', 'Wolf', {
    desc: "Grey, rangy and patient, the wolves of the Neverwinter Wood have learned that lone travellers on the Triboar Trail are the easiest meat on the road.",
    cr: 0.25, type: 'beast', size: 'medium', ac: 13, hpDice: '2d8+2',
    speed: 40, abilities: { str: 12, dex: 15, con: 12, int: 3, wis: 12, cha: 6 },
    skills: { perception: 3, stealth: 4 },
    traits: [T_KEEN_HEAR_SMELL, T_PACK_TACTICS],
    actions: [melee('Bite', 4, '2d4+2', 'piercing', {
      save: { ability: 'str', dc: 11, onSuccess: 'negate' },
      effects: [{ kind: 'condition', id: 'prone' }],
      desc: "It goes for the leg and drags the target down.",
    })],
    ai: { archetype: 'skirmisher', aggression: 0.7, selfPreserve: 0.5, preferredRange: 5 },
    sprite: 'wolf', biomes: ['forest', 'pine-forest', 'hills', 'plains', 'tundra', 'mountain'], groupSize: [3, 6],
  }),

  mon('boar', 'Boar', {
    desc: "A bristled tusker out of the oak scrub, foul-tempered and far heavier than it looks. Phandalin hunters bring three spears and a prayer to Malar.",
    cr: 0.25, type: 'beast', size: 'medium', ac: 11, hpDice: '2d8+2',
    speed: 40, abilities: { str: 13, dex: 11, con: 12, int: 2, wis: 9, cha: 5 },
    traits: [
      trait('Charge', "If it moves 20 feet straight at a target it hits with a tusk, the blow lands with an extra 1d6 slashing and may knock the target prone (DC 11 Strength).", { passive: 'charge:20:1d6:slashing:str:11' }),
      trait('Relentless', "The first blow that would drop it leaves it standing on 1 hit point instead, once per short rest.", { passive: 'relentless:7' }),
    ],
    actions: [melee('Tusk', 3, '1d6+1', 'slashing')],
    ai: { archetype: 'brute', aggression: 0.8, selfPreserve: 0.3, preferredRange: 5 },
    loot: { gold: '', table: [['rations', 0.5]] },
    sprite: 'boar', biomes: ['forest', 'plains', 'hills'], groupSize: [1, 4],
  }),

  mon('panther', 'Panther', {
    desc: "A black cat of the deep wood, seen as a shape between two trunks and then not seen at all. It takes the throat from above.",
    cr: 0.25, type: 'beast', size: 'medium', ac: 12, hpDice: '3d8',
    speed: 50, climb: 40, abilities: { str: 14, dex: 15, con: 10, int: 3, wis: 14, cha: 7 },
    skills: { perception: 4, stealth: 6 },
    traits: [
      T_KEEN_SMELL,
      trait('Pounce', "After a 20-foot run it slams a target prone (DC 12 Strength) and immediately rakes with a claw.", { passive: 'pounce:20:str:12' }),
    ],
    actions: [
      melee('Bite', 4, '1d6+2', 'piercing'),
      melee('Claw', 4, '1d4+2', 'slashing'),
    ],
    ai: { archetype: 'ambusher', aggression: 0.7, selfPreserve: 0.6, preferredRange: 5 },
    sprite: 'panther', biomes: ['forest', 'pine-forest', 'hills'], groupSize: [1, 2],
  }),

  mon('wolf-spider', 'Giant Wolf Spider', {
    desc: "It spins no snare — it runs its prey down across the leaf litter and pins it. Kryptgarden Forest crawls with them each spring.",
    cr: 0.25, type: 'beast', size: 'medium', ac: 13, hpDice: '2d8+2',
    speed: 40, climb: 40, abilities: { str: 12, dex: 16, con: 13, int: 3, wis: 12, cha: 4 },
    skills: { perception: 3, stealth: 7 },
    senses: { darkvision: 60, blindsight: 10 },
    traits: [T_SPIDER_CLIMB, T_WEB_SENSE, T_WEB_WALKER],
    actions: [melee('Bite', 4, '1d6+2', 'piercing', {
      save: { ability: 'con', dc: 11, onSuccess: 'half' },
      effects: [{ kind: 'damage', dice: '2d6', type: 'poison' }],
    })],
    ai: { archetype: 'skirmisher', aggression: 0.7, selfPreserve: 0.4, preferredRange: 5 },
    sprite: 'spider', tint: '#6b5a3a', biomes: ['forest', 'pine-forest', 'cave', 'ruins', 'underdark'], groupSize: [2, 5],
  }),

  mon('swarm-of-bats', 'Swarm of Bats', {
    desc: "The roof of the chamber comes loose all at once. A swarm has no plan beyond panic, and panic is enough to kill in the dark.",
    cr: 0.25, type: 'beast', subtype: 'swarm', size: 'medium', ac: 12, hpDice: '5d8',
    speed: 0, fly: 30, abilities: { str: 5, dex: 15, con: 10, int: 2, wis: 12, cha: 4 },
    senses: { blindsight: 60 },
    resist: ['bludgeoning', 'piercing', 'slashing'], condImmune: SWARM_COND,
    traits: [
      T_SWARM,
      trait('Echolocation', "The swarm navigates by sound; deafened, it blunders.", { passive: 'echolocation' }),
      T_KEEN_HEAR_SMELL,
    ],
    actions: [melee('Bites', 4, '2d4', 'piercing', {
      desc: "Damage halves to 1d4 once the swarm is bloodied.",
      ai: { role: 'nuke', weight: 1 },
    })],
    ai: { archetype: 'swarm', aggression: 0.7, selfPreserve: 0.3, preferredRange: 5 },
    sprite: 'swarm-bats', biomes: ['cave', 'ruins', 'dungeon', 'crypt', 'mine'], groupSize: [1, 2],
  }),

  mon('swarm-of-rats', 'Swarm of Rats', {
    desc: "A living carpet that pours up the stair from the undercellar. Individually contemptible; collectively it strips a body in a morning.",
    cr: 0.25, type: 'beast', subtype: 'swarm', size: 'medium', ac: 10, hpDice: '7d8-7',
    speed: 30, abilities: { str: 9, dex: 11, con: 9, int: 2, wis: 10, cha: 3 },
    senses: { darkvision: 30 },
    resist: ['bludgeoning', 'piercing', 'slashing'], condImmune: SWARM_COND,
    traits: [T_SWARM, T_KEEN_SMELL],
    actions: [melee('Bites', 2, '2d6', 'piercing', { desc: "Damage halves to 1d6 once the swarm is bloodied." })],
    ai: { archetype: 'swarm', aggression: 0.7, selfPreserve: 0.3, preferredRange: 5 },
    sprite: 'swarm-rats', biomes: ['city', 'ruins', 'dungeon', 'cave', 'crypt', 'mine'], groupSize: [1, 2],
  }),

  mon('swarm-of-ravens', 'Swarm of Ravens', {
    desc: "A black gale of beaks and feathers over the Conyberry road. They go for the eyes first, as ravens always have.",
    cr: 0.25, type: 'beast', subtype: 'swarm', size: 'medium', ac: 12, hpDice: '7d8-7',
    speed: 10, fly: 50, abilities: { str: 6, dex: 14, con: 8, int: 3, wis: 12, cha: 6 },
    skills: { perception: 5 },
    resist: ['bludgeoning', 'piercing', 'slashing'], condImmune: SWARM_COND,
    traits: [T_SWARM],
    actions: [melee('Beaks', 4, '2d6', 'piercing', { desc: "Damage halves to 1d6 once the swarm is bloodied." })],
    ai: { archetype: 'swarm', aggression: 0.6, selfPreserve: 0.4, preferredRange: 5 },
    sprite: 'swarm-ravens', biomes: ['plains', 'road', 'ruins', 'forest', 'hills'], groupSize: [1, 2],
  }),

  mon('swarm-of-insects', 'Swarm of Insects', {
    desc: "Hornets, biting flies, or something with too many legs boiling out of a rotted stump. The Mere breeds them in clouds thick enough to blot a lantern.",
    cr: 0.5, type: 'beast', subtype: 'swarm', size: 'medium', ac: 12, hpDice: '5d8',
    speed: 20, climb: 20, abilities: { str: 3, dex: 13, con: 10, int: 1, wis: 7, cha: 1 },
    senses: { blindsight: 10 },
    resist: ['bludgeoning', 'piercing', 'slashing'], condImmune: SWARM_COND,
    traits: [T_SWARM],
    actions: [melee('Bites', 3, '4d4', 'piercing', { desc: "Damage halves to 2d4 once the swarm is bloodied." })],
    ai: { archetype: 'swarm', aggression: 0.8, selfPreserve: 0.2, preferredRange: 5 },
    sprite: 'swarm-insects', biomes: ['marsh', 'forest', 'ruins', 'cave', 'plains'], groupSize: [1, 2],
  }),

  mon('swarm-of-poisonous-snakes', 'Swarm of Poisonous Snakes', {
    desc: "A nest disturbed. The reeds move wrong, and then everything within ten feet is being bitten from every direction at once.",
    cr: 2, type: 'beast', subtype: 'swarm', size: 'medium', ac: 14, hpDice: '8d8',
    speed: 30, swim: 30, abilities: { str: 8, dex: 18, con: 11, int: 1, wis: 10, cha: 3 },
    senses: { blindsight: 10 },
    resist: ['bludgeoning', 'piercing', 'slashing'], condImmune: SWARM_COND,
    traits: [T_SWARM],
    actions: [melee('Bites', 6, '2d6', 'piercing', {
      save: { ability: 'con', dc: 10, onSuccess: 'half' },
      effects: [{ kind: 'damage', dice: '4d4', type: 'poison' }],
      desc: "Both the bites and the venom halve once the swarm is bloodied.",
    })],
    ai: { archetype: 'swarm', aggression: 0.8, selfPreserve: 0.2, preferredRange: 5 },
    sprite: 'swarm-snakes', biomes: ['marsh', 'coast', 'ruins', 'cave'], groupSize: [1, 1],
  }),

  mon('giant-wasp', 'Giant Wasp', {
    desc: "Three feet of striped chitin with a sting like a stiletto. Ettercaps sometimes farm the nests, and regret it.",
    cr: 0.5, type: 'beast', size: 'medium', ac: 12, hpDice: '3d8',
    speed: 10, fly: 50, hover: true, abilities: { str: 10, dex: 14, con: 10, int: 1, wis: 10, cha: 3 },
    actions: [melee('Sting', 4, '1d6+2', 'piercing', {
      save: { ability: 'con', dc: 11, onSuccess: 'half' },
      effects: [{ kind: 'damage', dice: '3d6', type: 'poison' }],
    })],
    ai: { archetype: 'skirmisher', aggression: 0.7, selfPreserve: 0.5, preferredRange: 5 },
    sprite: 'wasp', biomes: ['forest', 'marsh', 'plains', 'hills'], groupSize: [2, 4],
  }),

  mon('black-bear', 'Black Bear', {
    desc: "Shaggy and short-tempered, most common on the lower slopes of the Sword Mountains. It would rather rob a camp than fight one, but it will do both.",
    cr: 0.5, type: 'beast', size: 'medium', ac: 11, hpDice: '3d8+6',
    speed: 40, climb: 30, abilities: { str: 15, dex: 10, con: 14, int: 2, wis: 12, cha: 7 },
    skills: { perception: 3 },
    traits: [T_KEEN_SMELL],
    actions: [
      multi("It bites once and rakes once.", [['bite', 1], ['claws', 1]]),
      melee('Bite', 4, '1d6+2', 'piercing'),
      melee('Claws', 4, '2d4+2', 'slashing'),
    ],
    ai: { archetype: 'brute', aggression: 0.6, selfPreserve: 0.5, preferredRange: 5 },
    loot: { gold: '', table: [['rations', 0.4]] },
    sprite: 'bear', biomes: ['forest', 'pine-forest', 'hills', 'mountain'], groupSize: [1, 2],
  }),

  mon('giant-goat', 'Giant Goat', {
    desc: "A cliff-dweller the size of a warhorse, all horn and contempt. Goliath herders on the high shoulders of the Sword Mountains keep them, barely.",
    cr: 0.5, type: 'beast', size: 'large', ac: 11, hpDice: '3d10+3',
    speed: 40, abilities: { str: 17, dex: 11, con: 12, int: 3, wis: 12, cha: 6 },
    traits: [
      trait('Charge', "A 20-foot run adds 2d4 bludgeoning to the ram and may knock the target prone (DC 13 Strength).", { passive: 'charge:20:2d4:bludgeoning:str:13' }),
      trait('Sure-Footed', "It cannot be shoved or tripped while it has a hoof on stone.", { passive: 'sure-footed', advSaveVs: ['prone'] }),
    ],
    actions: [melee('Ram', 5, '2d4+3', 'bludgeoning')],
    ai: { archetype: 'brute', aggression: 0.5, selfPreserve: 0.5, preferredRange: 5 },
    sprite: 'goat', biomes: ['mountain', 'hills', 'tundra'], groupSize: [1, 3],
  }),

  mon('giant-spider', 'Giant Spider', {
    desc: "Eight feet across the legs, hung in a curtain of grey cable somewhere above the trail. Nezznar's kin have a fondness for them, and the feeling is mutual.",
    cr: 1, type: 'beast', size: 'large', ac: 14, hpDice: '4d10+4',
    speed: 30, climb: 30, abilities: { str: 14, dex: 16, con: 12, int: 2, wis: 11, cha: 4 },
    skills: { stealth: 7 },
    senses: { darkvision: 60, blindsight: 10 },
    traits: [T_SPIDER_CLIMB, T_WEB_SENSE, T_WEB_WALKER],
    actions: [
      melee('Bite', 5, '1d8+3', 'piercing', {
        save: { ability: 'con', dc: 11, onSuccess: 'half' },
        effects: [{ kind: 'damage', dice: '2d8', type: 'poison' }],
      }),
      ranged('Web', 5, null, null, [30, 60], {
        save: { ability: 'dex', dc: 12, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'restrained' }],
        uses: { max: 1, recharge: '5-6' },
        desc: "A gout of sticky cable. The strands are AC 10, 5 hit points, and burn away readily.",
        ai: { role: 'control', weight: 1.6 },
      }),
    ],
    ai: { archetype: 'ambusher', aggression: 0.7, selfPreserve: 0.5, preferredRange: 30 },
    loot: { gold: '2d6', table: [['rope-silk', 0.15], ['gem-amber', 0.08]] },
    sprite: 'spider', biomes: ['forest', 'pine-forest', 'cave', 'ruins', 'dungeon', 'underdark'], groupSize: [1, 3],
  }),

  mon('giant-toad', 'Giant Toad', {
    desc: "A wart-backed bulk squatting in the shallows of the Mere of Dead Men, patient as a stone until the mouth opens.",
    cr: 1, type: 'beast', size: 'large', ac: 11, hpDice: '6d10+6',
    speed: 20, swim: 40, abilities: { str: 15, dex: 13, con: 13, int: 2, wis: 10, cha: 3 },
    senses: { darkvision: 30 },
    traits: [T_AMPHIBIOUS, T_STANDING_LEAP],
    actions: [
      melee('Bite', 4, '1d10+2', 'piercing', {
        save: { ability: 'str', dc: 13, onSuccess: 'negate' },
        effects: [{ kind: 'damage', dice: '1d10', type: 'poison' }, { kind: 'condition', id: 'grappled' }],
      }),
      util('Swallow', {
        desc: "It swallows a Medium or smaller grappled creature, which takes 3d6 acid damage each round inside.",
        effects: [{ kind: 'condition', id: 'swallowed' }, { kind: 'damage', dice: '3d6', type: 'acid' }],
        ai: { role: 'control', weight: 1.2 },
      }),
    ],
    ai: { archetype: 'ambusher', aggression: 0.6, selfPreserve: 0.4, preferredRange: 5 },
    sprite: 'frog', tint: '#6b7a3a', biomes: ['marsh', 'coast', 'cave'], groupSize: [1, 3],
  }),

  mon('dire-wolf', 'Dire Wolf', {
    desc: "Shoulder-high, grey-black, and old enough in the Neverwinter Wood to have learned what a bowstring sounds like. Goblins of the Cragmaw tribe ride them.",
    cr: 1, type: 'beast', size: 'large', ac: 14, hpDice: '5d10+10',
    speed: 50, abilities: { str: 17, dex: 15, con: 15, int: 3, wis: 12, cha: 7 },
    skills: { perception: 3, stealth: 4 },
    traits: [T_KEEN_HEAR_SMELL, T_PACK_TACTICS],
    actions: [melee('Bite', 5, '2d6+3', 'piercing', {
      save: { ability: 'str', dc: 13, onSuccess: 'negate' },
      effects: [{ kind: 'condition', id: 'prone' }],
    })],
    ai: { archetype: 'brute', aggression: 0.8, selfPreserve: 0.4, preferredRange: 5 },
    sprite: 'wolf', tint: '#4a4a55', biomes: ['forest', 'pine-forest', 'hills', 'mountain', 'tundra'], groupSize: [2, 4],
    faction: 'goblinoid',
  }),

  mon('giant-hyena', 'Giant Hyena', {
    desc: "Bred or simply grown monstrous in the gnoll camps below Wyvern Tor. Blood sends it into a lunging fit that outruns its own pack.",
    cr: 1, type: 'beast', size: 'large', ac: 12, hpDice: '6d10+12',
    speed: 50, abilities: { str: 16, dex: 14, con: 14, int: 2, wis: 12, cha: 7 },
    skills: { perception: 3 },
    traits: [T_RAMPAGE],
    actions: [melee('Bite', 5, '2d6+3', 'piercing')],
    ai: { archetype: 'brute', aggression: 0.85, selfPreserve: 0.3, preferredRange: 5 },
    sprite: 'hyena', tint: '#8a6a3a', biomes: ['plains', 'hills', 'ruins'], groupSize: [1, 3], faction: 'gnoll',
  }),

  mon('brown-bear', 'Brown Bear', {
    desc: "Nine feet standing, and it stands often. The Uthgardt call it kin; the Emerald Enclave calls it the reason not to camp near a berry slope.",
    cr: 1, type: 'beast', size: 'large', ac: 11, hpDice: '4d10+12',
    speed: 40, climb: 30, abilities: { str: 19, dex: 10, con: 16, int: 2, wis: 13, cha: 7 },
    skills: { perception: 3 },
    traits: [T_KEEN_SMELL],
    actions: [
      multi("It bites once and rakes once.", [['bite', 1], ['claws', 1]]),
      melee('Bite', 6, '1d8+4', 'piercing'),
      melee('Claws', 6, '2d6+4', 'slashing'),
    ],
    ai: { archetype: 'brute', aggression: 0.7, selfPreserve: 0.4, preferredRange: 5 },
    loot: { gold: '', table: [['rations', 0.5], ['healers-kit', 0.05]] },
    sprite: 'bear', tint: '#8a5a2b', biomes: ['forest', 'pine-forest', 'hills', 'mountain', 'tundra'], groupSize: [1, 2],
  }),

  mon('giant-boar', 'Giant Boar', {
    desc: "A cart-sized tusker out of the Kryptgarden verge, said to be descended from something Claugiyliamatar once cursed. It does not stop when wounded.",
    cr: 2, type: 'beast', size: 'large', ac: 12, hpDice: '5d10+15',
    speed: 40, abilities: { str: 17, dex: 10, con: 16, int: 2, wis: 7, cha: 5 },
    traits: [
      trait('Charge', "A 20-foot run adds 2d6 slashing to the tusk and may knock the target prone (DC 13 Strength).", { passive: 'charge:20:2d6:slashing:str:13' }),
      trait('Relentless', "The first blow that would drop it leaves it on 1 hit point instead, once per short rest.", { passive: 'relentless:11' }),
    ],
    actions: [melee('Tusk', 5, '2d6+3', 'slashing')],
    ai: { archetype: 'brute', aggression: 0.85, selfPreserve: 0.2, preferredRange: 5 },
    loot: { gold: '', table: [['rations', 0.6]] },
    sprite: 'boar', tint: '#5a4632', biomes: ['forest', 'plains', 'hills'], groupSize: [1, 2],
  }),

  mon('giant-elk', 'Giant Elk', {
    desc: "A stag as tall as a cottage, antlers spanning fifteen feet, sacred to Mielikki's folk. It will not begin a fight, and it will finish one.",
    cr: 2, type: 'beast', size: 'huge', ac: 14, hpDice: '5d12+10',
    speed: 60, abilities: { str: 19, dex: 16, con: 14, int: 7, wis: 14, cha: 10 },
    skills: { perception: 4 },
    traits: [trait('Charge', "A 20-foot run adds 2d6 bludgeoning to the ram and may knock the target prone (DC 14 Strength).", { passive: 'charge:20:2d6:bludgeoning:str:14' })],
    actions: [
      melee('Ram', 6, '2d6+4', 'bludgeoning'),
      melee('Hooves', 6, '4d8+4', 'bludgeoning', { desc: "Only against a prone target — a killing stamp." }),
    ],
    ai: { archetype: 'brute', aggression: 0.4, selfPreserve: 0.6, preferredRange: 5 },
    sprite: 'elk', biomes: ['forest', 'pine-forest', 'plains', 'tundra'], groupSize: [1, 2],
  }),
);

// ===========================================================================
// GOBLINOIDS & RAIDERS — the Cragmaw tribe, Wyvern Tor's orcs, and the gnoll
// packs that come down out of the Sword Mountains when the snow does.
// ===========================================================================

ALL.push(
  mon('kobold', 'Kobold', {
    desc: "A knee-high scaled scavenger with a dragon's arrogance and none of the size. Kobolds dig, kobolds trap, and kobolds only ever fight six to one.",
    cr: 0.125, type: 'humanoid', subtype: 'kobold', size: 'small', ac: 12, hpDice: '2d6-2',
    speed: 30, abilities: { str: 7, dex: 15, con: 9, int: 8, wis: 7, cha: 8 },
    senses: { darkvision: 60 }, languages: ['Common', 'Draconic'],
    traits: [T_PACK_TACTICS, T_SUNLIGHT_SENS],
    actions: [
      melee('Dagger', 4, '1d4+2', 'piercing'),
      ranged('Sling', 4, '1d4+2', 'bludgeoning', [30, 120]),
    ],
    ai: { archetype: 'skirmisher', aggression: 0.5, selfPreserve: 0.8, preferredRange: 30 },
    loot: { gold: '2d4', table: [['dagger', 0.2], ['sling', 0.15], ['torch', 0.3], ['caltrops', 0.1]] },
    sprite: 'kobold', biomes: ['cave', 'mine', 'dungeon', 'underdark', 'ruins'], groupSize: [4, 8],
    faction: 'kobold',
  }),

  mon('winged-kobold', 'Winged Kobold', {
    desc: "An urd — a kobold cursed or blessed with leathery wings, insufferable about it either way. It fights by dropping rocks and fleeing upward.",
    cr: 0.25, type: 'humanoid', subtype: 'kobold', size: 'small', ac: 13, hpDice: '3d6-3',
    speed: 30, fly: 30, abilities: { str: 7, dex: 16, con: 9, int: 8, wis: 7, cha: 8 },
    senses: { darkvision: 60 }, languages: ['Common', 'Draconic'],
    traits: [T_PACK_TACTICS, T_SUNLIGHT_SENS],
    actions: [
      melee('Dagger', 5, '1d4+3', 'piercing'),
      ranged('Dropped Rock', 5, '1d6+3', 'bludgeoning', [20, 60], {
        desc: "Only from directly above an unaware target.",
        ai: { role: 'nuke', weight: 1.3 },
      }),
    ],
    ai: { archetype: 'archer', aggression: 0.5, selfPreserve: 0.85, preferredRange: 30 },
    loot: { gold: '2d6', table: [['dagger', 0.2], ['gem-quartz', 0.06]] },
    sprite: 'kobold-winged', biomes: ['cave', 'mountain', 'mine', 'ruins', 'dungeon'], groupSize: [2, 5],
    faction: 'kobold',
  }),

  mon('goblin', 'Goblin', {
    desc: "Small, sallow and mean, with a scavenged blade and somebody else's shield. The Cragmaw tribe has taken the Triboar Trail for its own hunting ground.",
    cr: 0.25, type: 'humanoid', subtype: 'goblinoid', size: 'small', ac: 15, acNote: 'leather armor, shield',
    hpDice: '2d6', speed: 30, abilities: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
    skills: { stealth: 6 }, senses: { darkvision: 60 }, languages: ['Common', 'Goblin'],
    traits: [T_NIMBLE_ESCAPE],
    actions: [
      melee('Scimitar', 4, '1d6+2', 'slashing'),
      ranged('Shortbow', 4, '1d6+2', 'piercing', [80, 320]),
    ],
    bonusActions: [util('Disengage or Hide', {
      desc: "Nimble Escape: it takes the Disengage or Hide action as a bonus action.",
      ai: { role: 'utility', weight: 0.9 },
    })],
    ai: { archetype: 'skirmisher', aggression: 0.6, selfPreserve: 0.8, preferredRange: 30 },
    loot: { gold: '3d6', table: [['scimitar', 0.2], ['shortbow', 0.15], ['arrow', 0.4], ['shield', 0.1], ['goblin-totem', 0.15], ['rations', 0.25]] },
    sprite: 'goblin', biomes: ['forest', 'pine-forest', 'cave', 'hills', 'ruins', 'dungeon', 'road'], groupSize: [3, 7],
    faction: 'goblinoid',
  }),

  mon('goblin-boss', 'Goblin Boss', {
    desc: "The biggest goblin in the cave, in a stolen chain shirt, ruling by the simple argument that he is still alive. Yeemik of Cragmaw Hideout is such a one.",
    cr: 1, type: 'humanoid', subtype: 'goblinoid', size: 'small', ac: 17, acNote: 'chain shirt, shield',
    hpDice: '6d6', speed: 30, abilities: { str: 10, dex: 14, con: 10, int: 10, wis: 8, cha: 10 },
    skills: { stealth: 6 }, senses: { darkvision: 60 }, languages: ['Common', 'Goblin'],
    traits: [T_NIMBLE_ESCAPE],
    actions: [
      multi("It makes two scimitar attacks, the second at a penalty.", [['scimitar', 2]]),
      melee('Scimitar', 4, '1d6+2', 'slashing'),
      ranged('Javelin', 4, '1d6+2', 'piercing', [30, 120]),
    ],
    bonusActions: [util('Disengage or Hide', { desc: "Nimble Escape: Disengage or Hide as a bonus action.", ai: { role: 'utility', weight: 0.9 } })],
    reactions: [util('Redirect Attack', {
      desc: "When a creature it can see hits it, it swaps places with a goblin within 5 feet and that goblin is hit instead.",
      ai: { role: 'utility', weight: 1.5 },
    })],
    ai: { archetype: 'skirmisher', aggression: 0.7, selfPreserve: 0.7, preferredRange: 5 },
    loot: { gold: '4d10', table: [['scimitar', 0.35], ['chain-shirt', 0.15], ['potion-healing', 0.2], ['gem-malachite', 0.15], ['goblin-totem', 0.3]] },
    sprite: 'goblin', tint: '#a8452c', biomes: ['forest', 'cave', 'hills', 'ruins', 'dungeon'], groupSize: [1, 1],
    faction: 'goblinoid', elite: true,
  }),

  mon('hobgoblin', 'Hobgoblin', {
    desc: "Tall, orange-skinned and disciplined where its lesser cousins are not. Hobgoblins drill, keep their mail oiled, and fight in ranks — which is what makes them dangerous.",
    cr: 0.5, type: 'humanoid', subtype: 'goblinoid', size: 'medium', ac: 18, acNote: 'chain mail, shield',
    hpDice: '2d8+2', speed: 30, abilities: { str: 13, dex: 12, con: 12, int: 10, wis: 10, cha: 9 },
    senses: { darkvision: 60 }, languages: ['Common', 'Goblin'],
    traits: [trait('Martial Advantage', "Once per turn it adds 2d6 damage to a hit against a foe that has one of its allies within 5 feet.", { passive: 'martial-advantage:2d6' })],
    actions: [
      melee('Longsword', 3, '1d8+1', 'slashing', { desc: "1d10+1 if wielded in both hands." }),
      ranged('Longbow', 3, '1d8+1', 'piercing', [150, 600]),
    ],
    ai: { archetype: 'tank', aggression: 0.7, selfPreserve: 0.6, preferredRange: 5 },
    loot: { gold: '4d6', table: [['longsword', 0.2], ['chain-mail', 0.08], ['shield', 0.15], ['longbow', 0.12], ['arrow', 0.4]] },
    sprite: 'hobgoblin', biomes: ['forest', 'hills', 'ruins', 'dungeon', 'cave', 'mountain'], groupSize: [2, 5],
    faction: 'goblinoid',
  }),

  mon('hobgoblin-captain', 'Hobgoblin Captain', {
    desc: "Half plate, a greatsword, and a voice that turns a rabble into a firing line. Cragmaw Castle answers to captains like this one, and they answer to King Grol.",
    cr: 3, type: 'humanoid', subtype: 'goblinoid', size: 'medium', ac: 17, acNote: 'half plate',
    hpDice: '6d8+12', speed: 30, abilities: { str: 15, dex: 14, con: 14, int: 12, wis: 10, cha: 13 },
    senses: { darkvision: 60 }, languages: ['Common', 'Goblin'],
    traits: [trait('Martial Advantage', "Once per turn it adds 2d6 damage to a hit against a foe that has one of its allies within 5 feet.", { passive: 'martial-advantage:2d6' })],
    actions: [
      multi("It makes two greatsword attacks.", [['greatsword', 2]]),
      melee('Greatsword', 4, '2d6+2', 'slashing'),
      ranged('Javelin', 4, '1d6+2', 'piercing', [30, 120]),
    ],
    bonusActions: [util('Leadership', {
      desc: "Once per short rest, an ally within 30 feet that can hear it adds 1d4 to an attack roll or saving throw.",
      uses: { max: 1, recharge: 'short' },
      target: { kind: 'creature', count: 1, allowAllies: true },
      effects: [{ kind: 'buff', id: 'leadership', dice: '1d4' }],
      ai: { role: 'buff', weight: 1.4 },
    })],
    ai: { archetype: 'tank', aggression: 0.8, selfPreserve: 0.5, preferredRange: 5 },
    loot: { gold: '6d10', table: [['greatsword', 0.3], ['half-plate', 0.1], ['potion-greater-healing', 0.15], ['gem-onyx', 0.2], ['map', 0.25]] },
    sprite: 'hobgoblin', tint: '#8a3a2a', biomes: ['forest', 'hills', 'ruins', 'dungeon', 'mountain'], groupSize: [1, 1],
    faction: 'goblinoid', elite: true,
  }),

  mon('bugbear', 'Bugbear', {
    desc: "Seven feet of coarse fur and reach, and it moves through undergrowth without a sound — which is the part that kills people. Klarg holds Cragmaw Hideout for the Black Spider.",
    cr: 1, type: 'humanoid', subtype: 'goblinoid', size: 'medium', ac: 16, acNote: 'hide armor, shield',
    hpDice: '5d8+5', speed: 30, abilities: { str: 15, dex: 14, con: 13, int: 8, wis: 11, cha: 9 },
    skills: { stealth: 6, survival: 2 }, senses: { darkvision: 60 }, languages: ['Common', 'Goblin'],
    traits: [
      trait('Brute', "Its melee weapons roll one extra damage die on a hit.", { passive: 'brute' }),
      trait('Surprise Attack', "If it surprises a creature on the first round, that hit deals an extra 2d6 damage.", { passive: 'surprise-attack:2d6' }),
    ],
    actions: [
      melee('Morningstar', 4, '2d8+2', 'piercing'),
      ranged('Javelin', 4, '2d6+2', 'piercing', [30, 120]),
    ],
    ai: { archetype: 'ambusher', aggression: 0.8, selfPreserve: 0.5, preferredRange: 5 },
    loot: { gold: '5d6', table: [['morningstar', 0.25], ['hide-armor', 0.1], ['javelin', 0.2], ['goblin-totem', 0.2], ['gem-quartz', 0.1]] },
    sprite: 'bugbear', biomes: ['forest', 'pine-forest', 'cave', 'hills', 'ruins', 'dungeon'], groupSize: [1, 3],
    faction: 'goblinoid',
  }),

  mon('bugbear-chief', 'Bugbear Chief', {
    desc: "A warlord of the deep wood who holds his band by being the one thing in it nothing frightens. Hruggek's blood, the goblins whisper, and they are not entirely wrong.",
    cr: 3, type: 'humanoid', subtype: 'goblinoid', size: 'medium', ac: 17, acNote: 'chain shirt, shield',
    hpDice: '10d8+20', speed: 30, abilities: { str: 17, dex: 14, con: 14, int: 11, wis: 12, cha: 11 },
    skills: { stealth: 6, survival: 3 }, senses: { darkvision: 60 }, languages: ['Common', 'Goblin'],
    traits: [
      trait('Brute', "Its melee weapons roll one extra damage die on a hit.", { passive: 'brute' }),
      trait('Heart of Hruggek', "It shrugs off the things that break lesser goblinoids.", {
        passive: 'heart-of-hruggek', advSaveVs: ['charmed', 'frightened', 'paralyzed', 'poisoned', 'stunned'],
      }),
      trait('Surprise Attack', "A surprise-round hit deals an extra 2d6 damage.", { passive: 'surprise-attack:2d6' }),
    ],
    actions: [
      multi("It attacks twice with its morningstar.", [['morningstar', 2]]),
      melee('Morningstar', 5, '2d8+3', 'piercing'),
      ranged('Javelin', 5, '2d6+3', 'piercing', [30, 120]),
    ],
    ai: { archetype: 'brute', aggression: 0.85, selfPreserve: 0.4, preferredRange: 5 },
    loot: { gold: '8d10', table: [['morningstar', 0.3], ['chain-shirt', 0.15], ['potion-greater-healing', 0.2], ['gem-jade', 0.2], ['silver-ore-wave-echo', 0.08]] },
    sprite: 'bugbear', tint: '#6b3a2a', biomes: ['forest', 'cave', 'hills', 'ruins', 'dungeon'], groupSize: [1, 1],
    faction: 'goblinoid', elite: true,
  }),

  mon('orc', 'Orc', {
    desc: "Grey-green, tusked, and raised on the certainty that Gruumsh made the world for taking. Bands out of Many-Arrows come down Wyvern Tor to prove it.",
    cr: 0.5, type: 'humanoid', subtype: 'orc', size: 'medium', ac: 13, acNote: 'hide armor',
    hpDice: '2d8+6', speed: 30, abilities: { str: 16, dex: 12, con: 16, int: 7, wis: 11, cha: 10 },
    skills: { intimidation: 2 }, senses: { darkvision: 60 }, languages: ['Common', 'Orc'],
    traits: [T_AGGRESSIVE],
    actions: [
      melee('Greataxe', 5, '1d12+3', 'slashing'),
      ranged('Javelin', 5, '1d6+3', 'piercing', [30, 120]),
    ],
    bonusActions: [util('Aggressive', {
      desc: "It moves up to its speed straight toward a hostile creature it can see.",
      ai: { role: 'utility', weight: 1.1 },
    })],
    ai: { archetype: 'brute', aggression: 0.9, selfPreserve: 0.3, preferredRange: 5 },
    loot: { gold: '4d6', table: [['greataxe', 0.2], ['javelin', 0.25], ['hide-armor', 0.1], ['shadowdark-ale', 0.2], ['rations', 0.25]] },
    sprite: 'orc', biomes: ['hills', 'mountain', 'plains', 'ruins', 'cave', 'road'], groupSize: [3, 6],
    faction: 'many-arrows',
  }),

  mon('orog', 'Orog', {
    desc: "An orc with an ogre's strength and a hobgoblin's cunning, plated in salvaged steel. Orogs command where they walk; other orcs let them.",
    cr: 2, type: 'humanoid', subtype: 'orc', size: 'medium', ac: 18, acNote: 'plate armor',
    hpDice: '5d8+20', speed: 30, abilities: { str: 18, dex: 12, con: 18, int: 12, wis: 11, cha: 12 },
    skills: { intimidation: 3, survival: 2 }, senses: { darkvision: 60 }, languages: ['Common', 'Orc'],
    traits: [T_AGGRESSIVE],
    actions: [
      multi("It makes two greataxe attacks.", [['greataxe', 2]]),
      melee('Greataxe', 6, '1d12+4', 'slashing'),
      ranged('Javelin', 6, '1d6+4', 'piercing', [30, 120]),
    ],
    ai: { archetype: 'brute', aggression: 0.9, selfPreserve: 0.3, preferredRange: 5 },
    loot: { gold: '6d6', table: [['greataxe', 0.3], ['plate-armor', 0.05], ['potion-healing', 0.2], ['gem-onyx', 0.12]] },
    sprite: 'orc', tint: '#4a5a4a', biomes: ['hills', 'mountain', 'underdark', 'cave', 'ruins'], groupSize: [1, 3],
    faction: 'many-arrows',
  }),

  mon('orc-war-chief', 'Orc War Chief', {
    desc: "The strongest arm in the camp, and it stays chief only while that is true. Gruumsh's favour rides on its axe, and it wants everyone to see the blood.",
    cr: 4, type: 'humanoid', subtype: 'orc', size: 'medium', ac: 16, acNote: 'chain mail',
    hpDice: '11d8+44', speed: 30, abilities: { str: 18, dex: 14, con: 18, int: 11, wis: 11, cha: 16 },
    saveProf: ['str', 'con', 'wis'], skills: { intimidation: 5 },
    senses: { darkvision: 60 }, languages: ['Common', 'Orc'],
    traits: [
      T_AGGRESSIVE,
      trait('Gruumshs Fury', "Every weapon it swings carries an extra 1d8 damage; the One-Eyed God is watching.", { passive: 'gruumshs-fury:1d8' }),
    ],
    actions: [
      multi("It makes two greataxe attacks.", [['greataxe', 2]]),
      melee('Greataxe', 6, '1d12+4', 'slashing', { effects: [{ kind: 'damage', dice: '1d8', type: 'slashing' }] }),
      ranged('Spear', 6, '1d6+4', 'piercing', [20, 60], { effects: [{ kind: 'damage', dice: '1d8', type: 'piercing' }] }),
      util('Battle Cry', {
        uses: { max: 1, recharge: 'long' },
        desc: "Once a day, every ally within 30 feet that can hear it gains advantage on attacks until the start of its next turn.",
        target: { kind: 'area', radius: 30, allowAllies: true },
        effects: [{ kind: 'buff', id: 'battle-cry' }],
        ai: { role: 'buff', weight: 1.8 },
      }),
    ],
    ai: { archetype: 'boss', aggression: 0.9, selfPreserve: 0.3, preferredRange: 5 },
    loot: { gold: '2d6*10', table: [['greataxe', 0.4], ['chain-mail', 0.15], ['potion-greater-healing', 0.3], ['gem-ruby', 0.1], ['gem-jade', 0.2]] },
    sprite: 'orc', tint: '#7a2a2a', biomes: ['hills', 'mountain', 'plains', 'ruins', 'cave'], groupSize: [1, 1],
    faction: 'many-arrows', elite: true,
  }),

  mon('gnoll', 'Gnoll', {
    desc: "A hyena-headed thing that walks upright and worships hunger itself. Gnolls do not raid for plunder; Yeenoghu's get raid because the killing is the point.",
    cr: 0.5, type: 'humanoid', subtype: 'gnoll', size: 'medium', ac: 15, acNote: 'hide armor, shield',
    hpDice: '5d8', speed: 30, abilities: { str: 14, dex: 12, con: 11, int: 6, wis: 10, cha: 7 },
    senses: { darkvision: 60 }, languages: ['Gnoll'],
    traits: [T_RAMPAGE],
    actions: [
      melee('Bite', 4, '1d4+2', 'piercing'),
      melee('Spear', 4, '1d6+2', 'piercing', { desc: "1d8+2 if wielded in both hands." }),
      ranged('Longbow', 3, '1d8+1', 'piercing', [150, 600]),
    ],
    bonusActions: [util('Rampage', {
      desc: "After reducing a creature to 0 hit points, it moves half its speed and bites.",
      ai: { role: 'nuke', weight: 1.4 },
    })],
    ai: { archetype: 'brute', aggression: 0.9, selfPreserve: 0.25, preferredRange: 5 },
    loot: { gold: '4d6', table: [['spear', 0.25], ['longbow', 0.12], ['arrow', 0.3], ['hide-armor', 0.1], ['rations', 0.2]] },
    sprite: 'gnoll', biomes: ['plains', 'hills', 'ruins', 'mountain', 'road'], groupSize: [3, 6],
    faction: 'gnoll',
  }),

  mon('gnoll-pack-lord', 'Gnoll Pack Lord', {
    desc: "It wears a cloak of hides taken from things that were people, and whips the pack forward with a glaive taller than a man. Yeenoghu's mark is burned into its chest.",
    cr: 2, type: 'humanoid', subtype: 'gnoll', size: 'medium', ac: 15, acNote: 'hide armor, shield',
    hpDice: '9d8+9', speed: 30, abilities: { str: 16, dex: 14, con: 13, int: 8, wis: 11, cha: 9 },
    senses: { darkvision: 60 }, languages: ['Gnoll'],
    traits: [T_RAMPAGE],
    actions: [
      multi("It makes two glaive attacks or two longbow attacks.", [['glaive', 2]]),
      melee('Glaive', 4, '1d10+3', 'slashing', { reach: 10 }),
      ranged('Longbow', 4, '1d8+2', 'piercing', [150, 600]),
    ],
    bonusActions: [util('Incite Rampage', {
      desc: "A gnoll within 30 feet that can hear it immediately moves half its speed and makes one bite attack.",
      target: { kind: 'creature', count: 1, allowAllies: true },
      ai: { role: 'buff', weight: 1.7 },
    })],
    ai: { archetype: 'brute', aggression: 0.9, selfPreserve: 0.3, preferredRange: 10 },
    loot: { gold: '5d10', table: [['glaive', 0.3], ['longbow', 0.2], ['potion-healing', 0.2], ['gem-onyx', 0.15], ['dragon-cult-token', 0.05]] },
    sprite: 'gnoll', tint: '#6b4a2a', biomes: ['plains', 'hills', 'ruins', 'mountain'], groupSize: [1, 1],
    faction: 'gnoll', elite: true,
  }),

  mon('lizardfolk', 'Lizardfolk', {
    desc: "Cold-eyed marsh hunters out of the Mere of Dead Men, who reckon a drowned caravan the same way they reckon a fish run. Their shields are bone and their gods are older than Faerun's.",
    cr: 0.5, type: 'humanoid', subtype: 'lizardfolk', size: 'medium', ac: 15, acNote: 'natural armor, shield',
    hpDice: '4d8+4', speed: 30, swim: 30, abilities: { str: 15, dex: 10, con: 13, int: 7, wis: 12, cha: 7 },
    skills: { perception: 3, stealth: 4, survival: 5 }, languages: ['Draconic'],
    traits: [trait('Hold Breath', "It holds its breath for fifteen minutes, which is longer than most ambushes need.", { passive: 'hold-breath:15min' })],
    actions: [
      multi("It bites and strikes with spear or club.", [['bite', 1], ['spear', 1]]),
      melee('Bite', 4, '1d6+2', 'piercing'),
      melee('Spear', 4, '1d6+2', 'piercing'),
      melee('Heavy Club', 4, '1d6+2', 'bludgeoning'),
    ],
    ai: { archetype: 'ambusher', aggression: 0.7, selfPreserve: 0.5, preferredRange: 5 },
    loot: { gold: '3d6', table: [['spear', 0.3], ['shield', 0.15], ['gem-malachite', 0.1], ['rations', 0.2]] },
    sprite: 'lizardfolk', biomes: ['marsh', 'coast', 'cave'], groupSize: [2, 5],
    faction: 'lizardfolk',
  }),

  mon('bullywug', 'Bullywug', {
    desc: "A croaking, self-important frog-man of the drowned country, forever declaring itself lord of whichever puddle it stands in. It means every word.",
    cr: 0.25, type: 'humanoid', subtype: 'bullywug', size: 'medium', ac: 15, acNote: 'hide armor, shield',
    hpDice: '2d8+2', speed: 20, swim: 40, abilities: { str: 12, dex: 12, con: 13, int: 7, wis: 10, cha: 7 },
    skills: { stealth: 3 }, languages: ['Bullywug'],
    traits: [
      T_AMPHIBIOUS,
      T_STANDING_LEAP,
      trait('Swamp Camouflage', "In marsh it goes still and vanishes into the reeds.", { passive: 'swamp-camouflage', skillProf: ['stealth'] }),
      trait('Speak with Frogs and Toads', "It converses at length with amphibians, who are unimpressed.", { passive: 'speak-with-frogs' }),
    ],
    actions: [
      multi("It bites and jabs with its spear.", [['bite', 1], ['spear', 1]]),
      melee('Bite', 3, '1d4+1', 'piercing'),
      melee('Spear', 3, '1d6+1', 'piercing'),
    ],
    ai: { archetype: 'ambusher', aggression: 0.6, selfPreserve: 0.6, preferredRange: 5 },
    loot: { gold: '2d6', table: [['spear', 0.25], ['gem-quartz', 0.08], ['gem-pearl', 0.03]] },
    sprite: 'bullywug', biomes: ['marsh', 'coast'], groupSize: [3, 6],
    faction: 'bullywug',
  }),

  mon('troglodyte', 'Troglodyte', {
    desc: "A stooped Underdark savage whose skin shifts colour with the stone and whose stench arrives a full round before it does. It has never seen the sun and hates the idea.",
    cr: 0.25, type: 'humanoid', subtype: 'troglodyte', size: 'medium', ac: 11, acNote: 'natural armor',
    hpDice: '2d8+4', speed: 30, abilities: { str: 14, dex: 10, con: 14, int: 6, wis: 10, cha: 6 },
    skills: { stealth: 2 }, senses: { darkvision: 60 }, languages: ['Troglodyte'],
    traits: [
      trait('Chameleon Skin', "Its hide takes the colour of the rock behind it.", { passive: 'chameleon-skin', skillProf: ['stealth'] }),
      trait('Stench', "Any creature that starts its turn within 5 feet must make a DC 12 Constitution save or be poisoned until its next turn.", { passive: 'stench:12:5' }),
      T_SUNLIGHT_SENS,
    ],
    actions: [
      multi("It bites and rakes with both claws.", [['bite', 1], ['claw', 2]]),
      melee('Bite', 4, '1d4+2', 'piercing'),
      melee('Claw', 4, '1d4+2', 'slashing'),
    ],
    ai: { archetype: 'brute', aggression: 0.7, selfPreserve: 0.5, preferredRange: 5 },
    loot: { gold: '2d6', table: [['gem-quartz', 0.1], ['torch', 0.1]] },
    sprite: 'troglodyte', biomes: ['underdark', 'cave', 'mine', 'dungeon'], groupSize: [2, 6],
  }),

  mon('quaggoth', 'Quaggoth', {
    desc: "A white-furred Underdark brute, driven mad long ago by the drow who broke its people. Wounded, it stops defending itself entirely and simply tears.",
    cr: 2, type: 'humanoid', subtype: 'quaggoth', size: 'medium', ac: 13, acNote: 'natural armor',
    hpDice: '6d8+18', speed: 30, climb: 30, abilities: { str: 17, dex: 12, con: 16, int: 6, wis: 12, cha: 7 },
    skills: { athletics: 5 }, senses: { darkvision: 120 }, languages: ['Undercommon'],
    immune: ['poison'], condImmune: ['poisoned'],
    traits: [
      T_MAGIC_RESIST,
      trait('Wounded Fury', "At 10 hit points or fewer it attacks with advantage and deals an extra 7 damage.", { passive: 'wounded-fury:10:7' }),
    ],
    actions: [
      multi("It rakes with both claws.", [['claw', 2]]),
      melee('Claw', 5, '1d6+3', 'slashing'),
    ],
    ai: { archetype: 'brute', aggression: 0.85, selfPreserve: 0.2, preferredRange: 5 },
    loot: { gold: '3d10', table: [['gem-onyx', 0.15], ['gem-moonstone', 0.08], ['ore-sample-phandalin', 0.1]] },
    sprite: 'quaggoth', biomes: ['underdark', 'cave', 'mine', 'dungeon'], groupSize: [1, 4],
  }),

  mon('half-ogre', 'Half-Ogre', {
    desc: "An ogrillon — ogre blood in a frame just small enough to wear a man's mail, and just large enough to swing a battleaxe one-handed. Bandit captains pay well for one.",
    cr: 1, type: 'giant', size: 'large', ac: 12, acNote: 'hide armor',
    hpDice: '4d10+8', speed: 30, abilities: { str: 17, dex: 10, con: 14, int: 7, wis: 9, cha: 10 },
    senses: { darkvision: 60 }, languages: ['Common', 'Giant'],
    actions: [
      melee('Battleaxe', 5, '2d8+3', 'slashing'),
      ranged('Javelin', 5, '2d6+3', 'piercing', [30, 120]),
    ],
    ai: { archetype: 'brute', aggression: 0.8, selfPreserve: 0.4, preferredRange: 5 },
    loot: { gold: '5d6', table: [['battleaxe', 0.25], ['hide-armor', 0.15], ['shadowdark-ale', 0.2]] },
    sprite: 'ogre', tint: '#a08a6a', biomes: ['hills', 'cave', 'ruins', 'mountain', 'road'], groupSize: [1, 2],
  }),

  mon('ogre', 'Ogre', {
    desc: "Ten feet of appetite in a stitched hide, dull enough to be tricked and strong enough that it rarely matters. One will trail an orc band for the leavings.",
    cr: 2, type: 'giant', size: 'large', ac: 11, acNote: 'hide armor',
    hpDice: '7d10+21', speed: 40, abilities: { str: 19, dex: 8, con: 16, int: 5, wis: 7, cha: 7 },
    senses: { darkvision: 60 }, languages: ['Common', 'Giant'],
    actions: [
      melee('Greatclub', 6, '2d8+4', 'bludgeoning'),
      ranged('Javelin', 6, '2d6+4', 'piercing', [30, 120]),
    ],
    ai: { archetype: 'brute', aggression: 0.85, selfPreserve: 0.3, preferredRange: 5 },
    loot: { gold: '2d6*10', table: [['greatclub', 0.2], ['gem-quartz', 0.2], ['gem-amber', 0.1], ['sack', 0.3], ['rations', 0.3]] },
    sprite: 'ogre', biomes: ['hills', 'mountain', 'cave', 'ruins', 'forest', 'road'], groupSize: [1, 3],
  }),
);

// ===========================================================================
// PEOPLE WHO SHOULD KNOW BETTER — Redbrands in Phandalin, road-agents on the
// Triboar Trail, Cult of the Dragon cells at Thundertree, sellswords, spies.
// ===========================================================================

ALL.push(
  mon('bandit', 'Bandit', {
    desc: "A farmhand who lost a harvest and found a crossbow. Half the road-agents between Leilon and Phandalin would take honest work if anyone offered it.",
    cr: 0.125, type: 'humanoid', size: 'medium', ac: 12, acNote: 'leather armor',
    hpDice: '2d8+2', speed: 30, abilities: { str: 11, dex: 12, con: 12, int: 10, wis: 10, cha: 10 },
    languages: ['Common'],
    actions: [
      melee('Scimitar', 3, '1d6+1', 'slashing'),
      ranged('Light Crossbow', 3, '1d8+1', 'piercing', [80, 320]),
    ],
    ai: { archetype: 'skirmisher', aggression: 0.6, selfPreserve: 0.7, preferredRange: 30 },
    loot: { gold: '3d6', table: [['scimitar', 0.2], ['light-crossbow', 0.15], ['crossbow-bolt', 0.35], ['leather-armor', 0.1], ['rations', 0.3], ['neverwinter-ale', 0.2]] },
    sprite: 'bandit', biomes: ['road', 'plains', 'forest', 'hills', 'ruins', 'coast'], groupSize: [3, 6],
    faction: 'bandits',
  }),

  mon('thug', 'Thug', {
    desc: "Hired muscle with a mace and no imagination whatsoever. In Phandalin they drink at the Sleeping Giant and answer to whoever paid last.",
    cr: 0.5, type: 'humanoid', size: 'medium', ac: 11, acNote: 'leather armor',
    hpDice: '5d8+10', speed: 30, abilities: { str: 15, dex: 11, con: 14, int: 10, wis: 10, cha: 11 },
    skills: { intimidation: 2 }, languages: ['Common'],
    traits: [T_PACK_TACTICS],
    actions: [
      multi("It makes two mace attacks.", [['mace', 2]]),
      melee('Mace', 4, '1d6+2', 'bludgeoning'),
      ranged('Heavy Crossbow', 2, '1d10', 'piercing', [100, 400]),
    ],
    ai: { archetype: 'brute', aggression: 0.7, selfPreserve: 0.5, preferredRange: 5 },
    loot: { gold: '4d6', table: [['mace', 0.25], ['leather-armor', 0.12], ['shadowdark-ale', 0.25], ['manacles', 0.1]] },
    sprite: 'thug', biomes: ['city', 'road', 'ruins', 'dungeon'], groupSize: [2, 5],
    faction: 'zhentarim',
  }),

  mon('redbrand-ruffian', 'Redbrand Ruffian', {
    desc: "A scarlet cloak, a mace, and a swagger the streets of Phandalin have learned to step around. They answer to Glasstaff beneath the ruin of Tresendar Manor.",
    cr: 0.5, type: 'humanoid', size: 'medium', ac: 14, acNote: 'studded leather',
    hpDice: '3d8+3', speed: 30, abilities: { str: 15, dex: 12, con: 12, int: 10, wis: 10, cha: 10 },
    skills: { intimidation: 2 }, languages: ['Common'],
    traits: [T_PACK_TACTICS],
    actions: [
      multi("It makes two melee attacks.", [['mace', 2]]),
      melee('Mace', 4, '1d6+2', 'bludgeoning'),
      ranged('Light Crossbow', 3, '1d8+1', 'piercing', [80, 320]),
    ],
    ai: { archetype: 'brute', aggression: 0.75, selfPreserve: 0.5, preferredRange: 5 },
    loot: { gold: '2d10', table: [['redbrand-cloak', 0.6], ['mace', 0.25], ['studded-leather', 0.12], ['shadowdark-ale', 0.25], ['gaming-dice', 0.2]] },
    sprite: 'thug', tint: '#a02b2b', biomes: ['city', 'dungeon', 'ruins'], groupSize: [2, 5],
    faction: 'redbrands',
  }),

  mon('bandit-captain', 'Bandit Captain', {
    desc: "A duellist's grace gone to the wrong trade, and enough charm to keep two dozen cutthroats loyal. Losing face in front of the band frightens it more than a blade does.",
    cr: 2, type: 'humanoid', size: 'medium', ac: 15, acNote: 'studded leather',
    hpDice: '10d8+20', speed: 30, abilities: { str: 15, dex: 16, con: 14, int: 14, wis: 11, cha: 14 },
    saveProf: ['str', 'dex', 'wis'], skills: { athletics: 4, deception: 4 }, languages: ['Common'],
    actions: [
      multi("It attacks twice with its scimitar and once with its dagger.", [['scimitar', 2], ['dagger', 1]]),
      melee('Scimitar', 5, '1d6+3', 'slashing'),
      ranged('Dagger', 5, '1d4+3', 'piercing', [20, 60]),
    ],
    reactions: [util('Parry', {
      desc: "It adds 2 to its AC against one melee attack that would hit it, if it can see the attacker and has a weapon in hand.",
      ai: { role: 'utility', weight: 1.5 },
    })],
    ai: { archetype: 'skirmisher', aggression: 0.75, selfPreserve: 0.6, preferredRange: 5 },
    loot: { gold: '4d6*5', table: [['scimitar', 0.3], ['studded-leather', 0.15], ['potion-healing', 0.25], ['map', 0.2], ['gem-pearl', 0.12], ['signet-ring', 0.1]] },
    sprite: 'bandit', tint: '#7a5a2a', biomes: ['road', 'plains', 'forest', 'hills', 'ruins', 'coast'], groupSize: [1, 1],
    faction: 'bandits', elite: true,
  }),

  mon('cultist', 'Cultist', {
    desc: "A robed devotee with a scimitar and a certainty that whatever comes next will be worth it. In Thundertree they wear the black-and-purple of the Cult of the Dragon.",
    cr: 0.125, type: 'humanoid', size: 'medium', ac: 12, acNote: 'leather armor',
    hpDice: '2d8', speed: 30, abilities: { str: 11, dex: 12, con: 10, int: 10, wis: 11, cha: 10 },
    skills: { deception: 2, religion: 2 }, languages: ['Common'],
    traits: [trait('Dark Devotion', "Its faith is a wall; fear and charm slide off it.", { passive: 'dark-devotion', advSaveVs: ['charmed', 'frightened'] })],
    actions: [melee('Scimitar', 3, '1d6+1', 'slashing')],
    ai: { archetype: 'brute', aggression: 0.7, selfPreserve: 0.5, preferredRange: 5 },
    loot: { gold: '2d6', table: [['scimitar', 0.2], ['dragon-cult-token', 0.4], ['robe', 0.2], ['candle', 0.3]] },
    sprite: 'cultist', biomes: ['ruins', 'dungeon', 'crypt', 'city', 'ash-waste'], groupSize: [3, 6],
    faction: 'cult-dragon',
  }),

  mon('cult-fanatic', 'Cult Fanatic', {
    desc: "The one holding the sermon. It has traded most of itself away for a handful of borrowed miracles and considers the bargain generous.",
    cr: 2, type: 'humanoid', size: 'medium', ac: 13, acNote: 'leather armor',
    hpDice: '6d8+6', speed: 30, abilities: { str: 11, dex: 14, con: 12, int: 10, wis: 13, cha: 14 },
    skills: { deception: 4, persuasion: 4, religion: 2 }, languages: ['Common'],
    traits: [
      trait('Dark Devotion', "Its faith is a wall; fear and charm slide off it.", { passive: 'dark-devotion', advSaveVs: ['charmed', 'frightened'] }),
      trait('Spellcasting', "It casts as a 4th-level priest of its dark patron (spell save DC 11, +3 to hit).", { passive: 'spellcasting:cleric:4:wis:11' }),
    ],
    actions: [
      multi("It makes two dagger attacks.", [['dagger', 2]]),
      melee('Dagger', 4, '1d4+2', 'piercing'),
      saveAct('Sacred Flame', {
        range: [60, 60], dice: '1d8', dtype: 'radiant',
        save: { ability: 'dex', dc: 11, onSuccess: 'none' },
        desc: "Dull, guttering flame falls on one creature it can see; cover offers no protection.",
        ai: { role: 'nuke', weight: 1 },
      }),
      saveAct('Inflict Wounds', {
        range: null, dice: '3d10', dtype: 'necrotic',
        save: { ability: 'con', dc: 11, onSuccess: 'none' },
        uses: { max: 3, recharge: 'long' },
        desc: "It lays a withering hand on a creature within reach.",
        ai: { role: 'nuke', weight: 1.6 },
      }),
      saveAct('Hold Person', {
        range: [60, 60],
        save: { ability: 'wis', dc: 11, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'paralyzed', duration: '1 minute' }],
        uses: { max: 2, recharge: 'long' },
        desc: "A humanoid it can see locks rigid, jaw working, unable to move.",
        ai: { role: 'control', weight: 1.8 },
      }),
      util('Spiritual Weapon', {
        kind: 'summon', dice: '1d8+2', dtype: 'force',
        uses: { max: 2, recharge: 'long' },
        desc: "A floating blade of dark light attacks at its command each round.",
        effects: [{ kind: 'summon', id: 'spiritual-weapon' }],
        ai: { role: 'buff', weight: 1.3 },
      }),
    ],
    bonusActions: [util('Command the Blade', { desc: "It sends its spiritual weapon at a target within 60 feet.", ai: { role: 'nuke', weight: 1 } })],
    ai: { archetype: 'caster', aggression: 0.7, selfPreserve: 0.6, preferredRange: 30 },
    loot: { gold: '5d10', table: [['dragon-cult-token', 0.5], ['potion-healing', 0.25], ['scroll-2', 0.15], ['holy-symbol', 0.2], ['gem-onyx', 0.15]] },
    sprite: 'cultist', tint: '#6a2a8a', biomes: ['ruins', 'dungeon', 'crypt', 'city', 'ash-waste'], groupSize: [1, 2],
    faction: 'cult-dragon', elite: true,
  }),

  mon('acolyte', 'Acolyte', {
    desc: "A junior priest of Tymora, Lathander or whichever power keeps the shrine lit, with a handful of real prayers and no combat sense at all.",
    cr: 0.25, type: 'humanoid', size: 'medium', ac: 10, hpDice: '2d8',
    speed: 30, abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 14, cha: 11 },
    skills: { medicine: 4, religion: 2 }, languages: ['Common'],
    traits: [trait('Spellcasting', "It casts as a 1st-level cleric (spell save DC 12, +4 to hit).", { passive: 'spellcasting:cleric:1:wis:12' })],
    actions: [
      melee('Club', 2, '1d4', 'bludgeoning'),
      saveAct('Sacred Flame', {
        range: [60, 60], dice: '1d8', dtype: 'radiant',
        save: { ability: 'dex', dc: 12, onSuccess: 'none' },
        ai: { role: 'nuke', weight: 1 },
      }),
      util('Cure Wounds', {
        kind: 'heal', dice: '1d8+2',
        uses: { max: 2, recharge: 'long' },
        target: { kind: 'creature', count: 1, allowAllies: true },
        desc: "A touch and a prayer close the worst of a wound.",
        ai: { role: 'heal', weight: 2 },
      }),
      util('Bless', {
        kind: 'utility', uses: { max: 1, recharge: 'long' },
        target: { kind: 'multi', maxTargets: 3, allowAllies: true },
        effects: [{ kind: 'buff', id: 'blessed', dice: '1d4', duration: '1 minute' }],
        desc: "Three companions add 1d4 to attacks and saves for a minute.",
        ai: { role: 'buff', weight: 1.5 },
      }),
    ],
    ai: { archetype: 'support', aggression: 0.3, selfPreserve: 0.8, preferredRange: 30 },
    loot: { gold: '3d6', table: [['holy-symbol-emblem', 0.4], ['potion-healing', 0.2], ['holy-water', 0.15], ['reliquary', 0.1]] },
    sprite: 'acolyte', biomes: ['city', 'ruins', 'crypt', 'dungeon'], groupSize: [1, 3],
  }),

  mon('guard', 'Guard', {
    desc: "Chain shirt, spear, and a shift that ends at dawn. Harbin Wester's town watch and every caravan on the High Road looks exactly like this.",
    cr: 0.125, type: 'humanoid', size: 'medium', ac: 16, acNote: 'chain shirt, shield',
    hpDice: '2d8+2', speed: 30, abilities: { str: 13, dex: 12, con: 12, int: 10, wis: 11, cha: 10 },
    skills: { perception: 2 }, languages: ['Common'],
    actions: [
      melee('Spear', 3, '1d6+1', 'piercing', { desc: "1d8+1 if used in both hands." }),
      ranged('Light Crossbow', 3, '1d8+1', 'piercing', [80, 320]),
    ],
    ai: { archetype: 'tank', aggression: 0.5, selfPreserve: 0.6, preferredRange: 5 },
    loot: { gold: '2d6', table: [['spear', 0.25], ['chain-shirt', 0.1], ['shield', 0.15], ['signal-whistle', 0.2]] },
    sprite: 'guard', biomes: ['city', 'road', 'plains'], groupSize: [2, 4],
    faction: 'lords-alliance',
  }),

  // The people you are not supposed to draw steel on. They exist because you can,
  // and because the town watch needs something to avenge.
  mon('commoner', 'Commoner', {
    desc: "A farmhand, a potter, a woman carrying water. They own one knife and it is for bread. Kill one in Phandalin and the whole street remembers your face.",
    cr: 0, type: 'humanoid', size: 'medium', ac: 10, hpDice: '1d8',
    speed: 30, abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    skills: {}, languages: ['Common'],
    actions: [melee('Club', 2, '1d4', 'bludgeoning', { desc: "Held wrong, swung in panic." })],
    ai: { archetype: 'skirmisher', aggression: 0.1, selfPreserve: 0.95, preferredRange: 5 },
    loot: { gold: '1d6', table: [['rations', 0.2], ['torch', 0.2]] },
    // No `biomes`: data/monsters.js indexes anything with one into the random
    // encounter pool, and a potter should never come howling out of the tall
    // grass. These two exist to be stood in for by townsfolk you attack.
    sprite: 'commoner', biomes: [], groupSize: [1, 3],
    faction: 'townsfolk',
  }),

  mon('noble', 'Noble', {
    desc: "Rings worth more than the house behind them, and a rapier they have actually been taught to use. They will scream for the watch before they parry.",
    cr: 0.125, type: 'humanoid', size: 'medium', ac: 15, acNote: 'breastplate',
    hpDice: '2d8', speed: 30, abilities: { str: 11, dex: 12, con: 11, int: 12, wis: 14, cha: 16 },
    skills: { deception: 5, insight: 4, persuasion: 5 }, languages: ['Common', 'Elvish'],
    actions: [melee('Rapier', 3, '1d8+1', 'piercing')],
    ai: { archetype: 'skirmisher', aggression: 0.35, selfPreserve: 0.85, preferredRange: 5 },
    loot: { gold: '4d6', table: [['rapier', 0.2], ['signet-ring', 0.3], ['clothes-fine', 0.2]] },
    sprite: 'noble', biomes: [], groupSize: [1, 2],
    faction: 'townsfolk',
  }),

  mon('scout', 'Scout', {
    desc: "A tracker who reads the Triboar Trail the way a clerk reads a ledger. It shoots first from cover and is somewhere else before the second arrow lands.",
    cr: 0.5, type: 'humanoid', size: 'medium', ac: 13, acNote: 'leather armor',
    hpDice: '3d8+3', speed: 30, abilities: { str: 11, dex: 14, con: 12, int: 11, wis: 13, cha: 11 },
    skills: { nature: 4, perception: 5, stealth: 6, survival: 5 }, languages: ['Common', 'Elvish'],
    traits: [trait('Keen Hearing and Sight', "Nothing crosses its watch unnoticed.", { passive: 'keen-hearing-and-sight', skillProf: ['perception'] })],
    actions: [
      multi("It makes two melee or two ranged attacks.", [['shortsword', 2]]),
      melee('Shortsword', 4, '1d6+2', 'piercing'),
      ranged('Longbow', 4, '1d8+2', 'piercing', [150, 600]),
    ],
    ai: { archetype: 'archer', aggression: 0.6, selfPreserve: 0.8, preferredRange: 60 },
    loot: { gold: '3d6', table: [['longbow', 0.25], ['arrow', 0.4], ['shortsword', 0.2], ['map', 0.2], ['rations', 0.3], ['herbalism-kit', 0.08]] },
    sprite: 'scout', biomes: ['forest', 'pine-forest', 'hills', 'plains', 'road', 'mountain', 'tundra'], groupSize: [1, 3],
    faction: 'harpers',
  }),

  mon('spy', 'Spy', {
    desc: "Someone's ears in Phandalin — Zhentarim, Harper, or a little of both if the coin is good. It kills quietly and lies beautifully.",
    cr: 1, type: 'humanoid', size: 'medium', ac: 12, hpDice: '6d8',
    speed: 30, abilities: { str: 10, dex: 15, con: 10, int: 12, wis: 14, cha: 16 },
    skills: { deception: 5, insight: 4, investigation: 5, perception: 6, persuasion: 5, 'sleight-of-hand': 4, stealth: 4 },
    languages: ['Common', 'Thieves Cant'],
    traits: [
      trait('Cunning Action', "It Dashes, Disengages or Hides as a bonus action.", { passive: 'cunning-action' }),
      trait('Sneak Attack', "Once per turn it adds 2d6 damage to a hit with advantage, or against a target flanked by its allies.", { passive: 'sneak-attack:2d6' }),
    ],
    actions: [
      multi("It makes two shortsword attacks.", [['shortsword', 2]]),
      melee('Shortsword', 4, '1d6+2', 'piercing'),
      ranged('Hand Crossbow', 4, '1d6+2', 'piercing', [30, 120]),
    ],
    bonusActions: [util('Cunning Action', { desc: "Dash, Disengage or Hide.", ai: { role: 'utility', weight: 1.2 } })],
    ai: { archetype: 'ambusher', aggression: 0.6, selfPreserve: 0.85, preferredRange: 30 },
    loot: { gold: '5d10', table: [['thieves-tools', 0.3], ['forgery-kit', 0.12], ['disguise-kit', 0.15], ['poison-basic', 0.15], ['signet-ring', 0.12], ['parchment', 0.3]] },
    sprite: 'spy', biomes: ['city', 'road', 'ruins', 'dungeon'], groupSize: [1, 2],
    faction: 'zhentarim',
  }),

  mon('mage-apprentice', 'Apprentice Wizard', {
    desc: "A journeyman of the Art with singed cuffs and three reliable spells. Iarno Albrek recruited a dozen like this before he became Glasstaff.",
    cr: 0.25, type: 'humanoid', size: 'medium', ac: 10, hpDice: '2d8',
    speed: 30, abilities: { str: 10, dex: 10, con: 10, int: 14, wis: 10, cha: 11 },
    skills: { arcana: 4, history: 4 }, languages: ['Common'],
    traits: [trait('Spellcasting', "It casts as a 1st-level wizard (spell save DC 12, +4 to hit).", { passive: 'spellcasting:wizard:1:int:12' })],
    actions: [
      melee('Dagger', 2, '1d4', 'piercing'),
      ranged('Fire Bolt', 4, '1d10', 'fire', [120, 120], { desc: "A whipping mote of flame. Anything flammable it misses starts to smoke.", ai: { role: 'nuke', weight: 1.4 } }),
      saveAct('Burning Hands', {
        dice: '3d6', dtype: 'fire',
        save: { ability: 'dex', dc: 12, onSuccess: 'half' },
        target: { kind: 'cone', length: 15 },
        uses: { max: 2, recharge: 'long' },
        desc: "A thin sheet of fire from the fingertips, fifteen feet deep.",
        ai: { role: 'aoe', weight: 1.7 },
      }),
    ],
    reactions: [util('Shield', {
      uses: { max: 2, recharge: 'long' },
      effects: [{ kind: 'shield', ac: 5 }],
      desc: "A disc of force snaps into being, granting +5 AC until its next turn.",
      ai: { role: 'buff', weight: 1.6 },
    })],
    ai: { archetype: 'caster', aggression: 0.6, selfPreserve: 0.8, preferredRange: 60 },
    loot: { gold: '4d6', table: [['spellbook', 0.25], ['component-pouch', 0.3], ['scroll-1', 0.2], ['focus-wand', 0.12], ['ink', 0.2]] },
    sprite: 'mage', biomes: ['city', 'ruins', 'dungeon', 'crypt'], groupSize: [1, 2],
  }),

  mon('veteran', 'Veteran', {
    desc: "Splint mail worn thin at the shoulders, two swords, and thirty years of other people's wars. Sildar Hallwinter was one of these before the Lords' Alliance found him.",
    cr: 3, type: 'humanoid', size: 'medium', ac: 17, acNote: 'splint armor',
    hpDice: '9d8+18', speed: 30, abilities: { str: 16, dex: 13, con: 14, int: 10, wis: 11, cha: 10 },
    skills: { athletics: 5, perception: 2 }, languages: ['Common'],
    traits: [T_BRAVE],
    actions: [
      multi("Two longsword attacks and one with the shortsword in its off hand.", [['longsword', 2], ['shortsword', 1]]),
      melee('Longsword', 5, '1d8+3', 'slashing', { desc: "1d10+3 if used in both hands." }),
      melee('Shortsword', 5, '1d6+3', 'piercing'),
      ranged('Heavy Crossbow', 3, '1d10+1', 'piercing', [100, 400]),
    ],
    ai: { archetype: 'tank', aggression: 0.75, selfPreserve: 0.5, preferredRange: 5 },
    loot: { gold: '4d6*5', table: [['longsword', 0.3], ['splint-armor', 0.1], ['shortsword', 0.2], ['potion-healing', 0.25], ['whetstone', 0.3]] },
    sprite: 'veteran', biomes: ['city', 'road', 'ruins', 'dungeon', 'hills'], groupSize: [1, 3],
    faction: 'lords-alliance',
  }),

  mon('berserker', 'Berserker', {
    desc: "An Uthgardt tribesman off the Dessarin, or a sellsword who has stopped caring which. It fights wide open and expects to be hit.",
    cr: 2, type: 'humanoid', size: 'medium', ac: 13, acNote: 'hide armor',
    hpDice: '9d8+27', speed: 30, abilities: { str: 16, dex: 12, con: 17, int: 9, wis: 11, cha: 9 },
    languages: ['Common'],
    traits: [trait('Reckless', "At the start of its turn it may trade all defence for advantage on every Strength attack this round.", { passive: 'reckless' })],
    actions: [melee('Greataxe', 5, '1d12+3', 'slashing')],
    ai: { archetype: 'brute', aggression: 0.95, selfPreserve: 0.15, preferredRange: 5 },
    loot: { gold: '3d10', table: [['greataxe', 0.3], ['hide-armor', 0.15], ['shadowdark-ale', 0.3], ['iriaeboran-north-brew', 0.1]] },
    sprite: 'berserker', biomes: ['plains', 'hills', 'tundra', 'forest', 'mountain'], groupSize: [2, 4],
  }),

  mon('wererat', 'Wererat', {
    desc: "A sewer-lord of Neverwinter's Blacklake, human by daylight and something with whiskers by choice. Ordinary steel slides off it as if greased.",
    cr: 2, type: 'humanoid', subtype: 'shapechanger', size: 'medium', ac: 12, hpDice: '6d8+6',
    speed: 30, abilities: { str: 10, dex: 15, con: 12, int: 11, wis: 10, cha: 8 },
    skills: { perception: 2, stealth: 4 }, senses: { darkvision: 60 },
    immune: ['nonmagical-physical-nonsilver'], languages: ['Common'],
    traits: [
      trait('Shapechanger', "It shifts between human, giant rat and a hybrid of both as an action; its gear shifts with it.", { passive: 'shapechanger' }),
      T_KEEN_SMELL,
    ],
    actions: [
      multi("It makes two attacks, only one of which may be a bite.", [['bite', 1], ['shortsword', 1]]),
      melee('Bite', 4, '1d4+2', 'piercing', {
        save: { ability: 'con', dc: 11, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'lycanthropy' }],
        desc: "Only in rat or hybrid form. A humanoid bitten risks the curse.",
      }),
      melee('Shortsword', 4, '1d6+2', 'piercing'),
      ranged('Hand Crossbow', 4, '1d6+2', 'piercing', [30, 120]),
    ],
    ai: { archetype: 'skirmisher', aggression: 0.7, selfPreserve: 0.7, preferredRange: 5 },
    loot: { gold: '4d10', table: [['shortsword', 0.25], ['thieves-tools', 0.2], ['arrow-silvered', 0.05], ['gem-moonstone', 0.1]] },
    sprite: 'wererat', biomes: ['city', 'dungeon', 'ruins', 'crypt', 'mine'], groupSize: [1, 3],
  }),

  mon('doppelganger', 'Doppelganger', {
    desc: "It wore a caravan guard's face for eleven days and nobody noticed. Doppelgangers do not impersonate people so much as replace them.",
    cr: 3, type: 'monstrosity', subtype: 'shapechanger', size: 'medium', ac: 14, hpDice: '8d8+16',
    speed: 30, abilities: { str: 11, dex: 18, con: 14, int: 11, wis: 12, cha: 14 },
    skills: { deception: 6, insight: 3 }, senses: { darkvision: 60 },
    condImmune: ['charmed'], languages: ['Common', 'Deep Speech'],
    traits: [
      trait('Shapechanger', "It takes the shape of any Small or Medium humanoid it has seen, down to the scars.", { passive: 'shapechanger' }),
      trait('Ambusher', "In the first round of a fight it attacks a surprised creature with advantage.", { passive: 'ambusher' }),
      trait('Surprise Attack', "A surprise-round hit deals an extra 3d6 damage.", { passive: 'surprise-attack:3d6' }),
    ],
    actions: [
      multi("It slams twice.", [['slam', 2]]),
      melee('Slam', 6, '1d6+4', 'bludgeoning'),
      saveAct('Read Thoughts', {
        range: [60, 60],
        save: { ability: 'wis', dc: 12, onSuccess: 'negate' },
        effects: [{ kind: 'buff', id: 'thought-read' }],
        desc: "It skims the surface of a mind, gaining advantage on attacks and social checks against that creature.",
        ai: { role: 'debuff', weight: 1.2 },
      }),
    ],
    ai: { archetype: 'ambusher', aggression: 0.7, selfPreserve: 0.8, preferredRange: 5 },
    loot: { gold: '5d10', table: [['disguise-kit', 0.3], ['signet-ring', 0.15], ['gem-jade', 0.15], ['parchment', 0.25]] },
    sprite: 'doppelganger', biomes: ['city', 'dungeon', 'ruins', 'underdark'], groupSize: [1, 2],
  }),
);

// ===========================================================================
// UNDEAD — Old Owl Well, the crypts under Phandalin, the ash-dead of
// Thundertree, and whatever Mormesk left walking in Wave Echo Cave.
// ===========================================================================

ALL.push(
  mon('crawling-claw', 'Crawling Claw', {
    desc: "A severed hand animated by a necromancer too lazy to raise anything whole. It scuttles, it throttles, and it is very hard to take seriously until it reaches your throat.",
    cr: 0, type: 'undead', size: 'tiny', ac: 12, hpDice: '1d4',
    speed: 20, climb: 20, abilities: { str: 13, dex: 14, con: 11, int: 5, wis: 10, cha: 4 },
    senses: { blindsight: 30 }, immune: ['poison'], condImmune: ['charmed', 'exhaustion', 'poisoned'],
    traits: [
      T_UNDEAD_NATURE,
      trait('Turn Immunity', "It is too slight a scrap of unlife for a cleric's rebuke to find.", { passive: 'turn-immunity' }),
    ],
    actions: [melee('Claw', 3, '1d4+1', 'bludgeoning', { desc: "Bludgeoning or slashing, at the claw's whim." })],
    ai: { archetype: 'swarm', aggression: 0.8, selfPreserve: 0.1, preferredRange: 5 },
    sprite: 'crawling-claw', biomes: ['crypt', 'dungeon', 'ruins', 'city'], groupSize: [2, 6],
    faction: 'undead',
  }),

  mon('skeleton', 'Skeleton', {
    desc: "Bound bone in the rags of whatever it died in, moving with the awful economy of a thing that no longer needs to breathe. Old Owl Well is full of them.",
    cr: 0.25, type: 'undead', size: 'medium', ac: 13, acNote: 'armor scraps',
    hpDice: '2d8+4', speed: 30, abilities: { str: 10, dex: 14, con: 15, int: 6, wis: 8, cha: 5 },
    senses: { darkvision: 60 }, languages: [],
    vuln: ['bludgeoning'], immune: ['poison'], condImmune: ['exhaustion', 'poisoned'],
    traits: [T_UNDEAD_NATURE],
    actions: [
      melee('Shortsword', 4, '1d6+2', 'piercing'),
      ranged('Shortbow', 4, '1d6+2', 'piercing', [80, 320]),
    ],
    ai: { archetype: 'brute', aggression: 0.8, selfPreserve: 0.1, preferredRange: 5 },
    loot: { gold: '2d6', table: [['shortsword', 0.15], ['shortbow', 0.1], ['arrow', 0.25], ['gem-quartz', 0.05]] },
    sprite: 'skeleton', biomes: ['crypt', 'dungeon', 'ruins', 'cave', 'mine', 'ash-waste'], groupSize: [3, 6],
    faction: 'undead',
  }),

  mon('warhorse-skeleton', 'Warhorse Skeleton', {
    desc: "A destrier's bones in the shreds of its barding, still answering a command given three centuries ago at Old Owl Well. It will run a shield wall down.",
    cr: 0.5, type: 'undead', size: 'large', ac: 13, acNote: 'barding scraps',
    hpDice: '3d10+6', speed: 60, abilities: { str: 18, dex: 12, con: 15, int: 2, wis: 8, cha: 5 },
    senses: { darkvision: 60 },
    vuln: ['bludgeoning'], immune: ['poison'], condImmune: ['exhaustion', 'poisoned'],
    traits: [T_UNDEAD_NATURE],
    actions: [melee('Hooves', 6, '2d6+4', 'bludgeoning')],
    ai: { archetype: 'brute', aggression: 0.85, selfPreserve: 0.1, preferredRange: 5 },
    loot: { gold: '', table: [['ring-mail', 0.05]] },
    sprite: 'skeletal-horse', biomes: ['crypt', 'ruins', 'plains', 'dungeon'], groupSize: [1, 3],
    faction: 'undead',
  }),

  mon('minotaur-skeleton', 'Minotaur Skeleton', {
    desc: "Something very large died in the deep labyrinth and did not stop. Its horns are longer than a man's arm and its charge folds a door.",
    cr: 2, type: 'undead', size: 'large', ac: 12, acNote: 'natural armor',
    hpDice: '9d10+18', speed: 40, abilities: { str: 18, dex: 11, con: 15, int: 6, wis: 8, cha: 5 },
    senses: { darkvision: 60 },
    vuln: ['bludgeoning'], immune: ['poison'], condImmune: ['exhaustion', 'poisoned'],
    traits: [
      T_UNDEAD_NATURE,
      trait('Charge', "A 10-foot run adds 2d8 piercing to the gore and may knock the target prone (DC 14 Strength).", { passive: 'charge:10:2d8:piercing:str:14' }),
    ],
    actions: [
      melee('Gore', 6, '2d12+4', 'piercing'),
      melee('Slam', 6, '3d6+4', 'bludgeoning'),
    ],
    ai: { archetype: 'brute', aggression: 0.9, selfPreserve: 0.1, preferredRange: 5 },
    loot: { gold: '3d10', table: [['gem-onyx', 0.15], ['greataxe', 0.1]] },
    sprite: 'minotaur-skeleton', biomes: ['crypt', 'dungeon', 'ruins', 'underdark'], groupSize: [1, 2],
    faction: 'undead',
  }),

  mon('zombie', 'Zombie', {
    desc: "A corpse walked back out of the earth with just enough left to hate the living. Cut it down and it may simply stand up again.",
    cr: 0.25, type: 'undead', size: 'medium', ac: 8, hpDice: '3d8+9',
    speed: 20, abilities: { str: 13, dex: 6, con: 16, int: 3, wis: 6, cha: 5 },
    saveProf: ['wis'], senses: { darkvision: 60 },
    immune: ['poison'], condImmune: ['poisoned'],
    traits: [T_UNDEAD_NATURE, T_UNDEAD_FORTITUDE],
    actions: [melee('Slam', 3, '1d6+1', 'bludgeoning')],
    ai: { archetype: 'brute', aggression: 0.9, selfPreserve: 0, preferredRange: 5 },
    loot: { gold: '2d6', table: [['clothes-traveler', 0.15], ['gem-quartz', 0.04]] },
    sprite: 'zombie', biomes: ['crypt', 'dungeon', 'ruins', 'marsh', 'cave', 'ash-waste'], groupSize: [3, 6],
    faction: 'undead',
  }),

  mon('ash-zombie', 'Ash Zombie', {
    desc: "Thundertree's dead, pickled in the volcanic ash that came down from Mount Hotenow. Every blow that lands puffs a grey cloud out of it.",
    cr: 0.25, type: 'undead', size: 'medium', ac: 8, hpDice: '3d8+9',
    speed: 20, abilities: { str: 13, dex: 6, con: 16, int: 3, wis: 6, cha: 5 },
    saveProf: ['wis'], senses: { darkvision: 60 },
    immune: ['poison'], condImmune: ['poisoned'],
    traits: [
      T_UNDEAD_NATURE,
      T_UNDEAD_FORTITUDE,
      trait('Choking Ash', "When it takes damage, ash bursts from the wound; every creature within 5 feet must make a DC 11 Constitution save or be poisoned until the end of its next turn.", { passive: 'choking-ash:11:5' }),
    ],
    actions: [melee('Slam', 3, '1d6+1', 'bludgeoning')],
    ai: { archetype: 'brute', aggression: 0.9, selfPreserve: 0, preferredRange: 5 },
    loot: { gold: '2d6', table: [['clothes-traveler', 0.12], ['dragon-cult-token', 0.06]] },
    sprite: 'zombie', tint: '#8a8a80', biomes: ['ash-waste', 'ruins', 'pine-forest'], groupSize: [3, 6],
    faction: 'undead',
  }),

  mon('shadow', 'Shadow', {
    desc: "A patch of dark that is the wrong shape for the light in the room. It drinks the strength out of a living body and leaves another shadow behind.",
    cr: 0.5, type: 'undead', size: 'medium', ac: 12, hpDice: '3d8+3',
    speed: 40, abilities: { str: 6, dex: 14, con: 13, int: 6, wis: 10, cha: 8 },
    skills: { stealth: 4 }, senses: { darkvision: 60 },
    vuln: ['radiant'],
    resist: ['acid', 'cold', 'fire', 'lightning', 'thunder', 'nonmagical-physical'],
    immune: ['necrotic', 'poison'],
    condImmune: ['exhaustion', 'frightened', 'grappled', 'paralyzed', 'petrified', 'poisoned', 'prone', 'restrained'],
    traits: [
      T_UNDEAD_NATURE,
      T_AMORPHOUS,
      T_SHADOW_STEALTH,
      T_SUNLIGHT_WEAK,
    ],
    actions: [melee('Strength Drain', 4, '2d6+2', 'necrotic', {
      effects: [{ kind: 'drain', ability: 'str', dice: '1d4' }],
      desc: "The victim's Strength drops by 1d4; at 0 it dies, and rises as a new shadow in an hour.",
    })],
    bonusActions: [util('Hide in Shadow', { desc: "It hides as a bonus action while in dim light or darkness.", ai: { role: 'utility', weight: 1.3 } })],
    ai: { archetype: 'ambusher', aggression: 0.7, selfPreserve: 0.6, preferredRange: 5 },
    sprite: 'shadow', biomes: ['crypt', 'dungeon', 'ruins', 'underdark', 'cave'], groupSize: [2, 4],
    faction: 'undead',
  }),

  mon('specter', 'Specter', {
    desc: "A soul denied both rest and body, still furious about it. It slides through the wall of the crypt and takes the years out of you.",
    cr: 1, type: 'undead', size: 'medium', ac: 12, hpDice: '5d8',
    speed: 0, fly: 50, hover: true, abilities: { str: 1, dex: 14, con: 11, int: 10, wis: 10, cha: 11 },
    senses: { darkvision: 60 },
    resist: ['acid', 'cold', 'fire', 'lightning', 'thunder', 'nonmagical-physical'],
    immune: ['necrotic', 'poison'],
    condImmune: ['charmed', 'exhaustion', 'grappled', 'paralyzed', 'petrified', 'poisoned', 'prone', 'restrained', 'unconscious'],
    traits: [T_UNDEAD_NATURE, T_INCORPOREAL, T_SUNLIGHT_SENS],
    actions: [melee('Life Drain', 4, '3d6', 'necrotic', {
      save: { ability: 'con', dc: 10, onSuccess: 'negate' },
      effects: [{ kind: 'maxhp-drain' }],
      desc: "On a failed save the target's hit point maximum drops by the damage dealt until it finishes a long rest.",
    })],
    ai: { archetype: 'skirmisher', aggression: 0.8, selfPreserve: 0.4, preferredRange: 5 },
    sprite: 'specter', biomes: ['crypt', 'dungeon', 'ruins', 'mine', 'underdark'], groupSize: [1, 3],
    faction: 'undead',
  }),

  mon('ghoul', 'Ghoul', {
    desc: "It was a person once, before hunger for the flesh of its own kind hollowed it out. Its claws lock the muscles solid; then it takes its time.",
    cr: 1, type: 'undead', size: 'medium', ac: 12, hpDice: '5d8',
    speed: 30, abilities: { str: 13, dex: 15, con: 10, int: 7, wis: 10, cha: 6 },
    senses: { darkvision: 60 },
    immune: ['poison'], condImmune: ['charmed', 'exhaustion', 'poisoned'],
    traits: [T_UNDEAD_NATURE],
    actions: [
      multi("It bites once and rakes with its claws.", [['bite', 1], ['claws', 1]]),
      melee('Bite', 2, '2d6+2', 'piercing'),
      melee('Claws', 4, '2d4+2', 'slashing', {
        save: { ability: 'con', dc: 10, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'paralyzed', duration: '1 minute' }],
        desc: "Elves are immune to the paralysis; nothing else is.",
      }),
    ],
    ai: { archetype: 'brute', aggression: 0.9, selfPreserve: 0.2, preferredRange: 5 },
    loot: { gold: '3d6', table: [['gem-quartz', 0.08], ['clothes-traveler', 0.1]] },
    sprite: 'ghoul', biomes: ['crypt', 'dungeon', 'ruins', 'underdark', 'cave', 'city'], groupSize: [2, 5],
    faction: 'undead',
  }),

  mon('ghast', 'Ghast', {
    desc: "A ghoul that has fed long enough to grow cunning, and reeks of the grave hard enough to fold a soldier double. Turning it is not as easy as the priests promise.",
    cr: 2, type: 'undead', size: 'medium', ac: 13, hpDice: '8d8',
    speed: 30, abilities: { str: 16, dex: 17, con: 10, int: 11, wis: 10, cha: 8 },
    senses: { darkvision: 60 },
    resist: ['necrotic'], immune: ['poison'], condImmune: ['charmed', 'exhaustion', 'poisoned'],
    traits: [
      T_UNDEAD_NATURE,
      trait('Stench', "Every creature that starts its turn within 5 feet must make a DC 10 Constitution save or be poisoned until its next turn.", { passive: 'stench:10:5' }),
      trait('Turning Defiance', "It and every ghoul within 30 feet resist a cleric's rebuke.", { passive: 'turning-defiance:30' }),
    ],
    actions: [
      multi("It bites once and rakes with its claws.", [['bite', 1], ['claws', 1]]),
      melee('Bite', 3, '2d8+3', 'piercing'),
      melee('Claws', 5, '2d6+3', 'slashing', {
        save: { ability: 'con', dc: 10, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'paralyzed', duration: '1 minute' }],
        desc: "Even elves are not immune to a ghast's touch.",
      }),
    ],
    ai: { archetype: 'brute', aggression: 0.9, selfPreserve: 0.3, preferredRange: 5 },
    loot: { gold: '4d10', table: [['gem-onyx', 0.12], ['potion-healing', 0.1]] },
    sprite: 'ghoul', tint: '#6a7a5a', biomes: ['crypt', 'dungeon', 'ruins', 'underdark', 'city'], groupSize: [1, 3],
    faction: 'undead',
  }),

  mon('wight', 'Wight', {
    desc: "A warlord who refused the summons of Kelemvor and now commands the dead of its own barrow. Its touch takes the life straight out of a body and hands it back as a corpse that walks.",
    cr: 3, type: 'undead', size: 'medium', ac: 14, acNote: 'studded leather',
    hpDice: '6d8+18', speed: 30, abilities: { str: 15, dex: 14, con: 16, int: 10, wis: 13, cha: 15 },
    skills: { perception: 3, stealth: 4 }, senses: { darkvision: 60 }, languages: ['Common'],
    resist: ['necrotic', 'nonmagical-physical-nonsilver'],
    immune: ['poison'], condImmune: ['exhaustion', 'poisoned'],
    traits: [T_UNDEAD_NATURE, T_SUNLIGHT_SENS],
    actions: [
      multi("It makes two longsword or longbow attacks; it may swap one for its life drain.", [['longsword', 2]]),
      melee('Life Drain', 4, '1d6+2', 'necrotic', {
        save: { ability: 'con', dc: 13, onSuccess: 'negate' },
        effects: [{ kind: 'maxhp-drain' }],
        desc: "A humanoid slain this way rises as a zombie under the wight's command in 24 hours.",
        ai: { role: 'nuke', weight: 1.6 },
      }),
      melee('Longsword', 4, '1d8+2', 'slashing'),
      ranged('Longbow', 4, '1d8+2', 'piercing', [150, 600]),
    ],
    ai: { archetype: 'boss', aggression: 0.8, selfPreserve: 0.4, preferredRange: 5 },
    loot: { gold: '6d10', table: [['longsword', 0.25], ['studded-leather', 0.12], ['gem-black-pearl', 0.08], ['gem-onyx', 0.2], ['reliquary', 0.1]] },
    sprite: 'wight', biomes: ['crypt', 'dungeon', 'ruins', 'mine', 'tundra'], groupSize: [1, 1],
    faction: 'undead', elite: true,
  }),
);

// ===========================================================================
// PLANTS & FUNGI — Thundertree's blights, the myconid colonies of the shallow
// Underdark, and whatever Reidoth has been trying to burn back for a decade.
// ===========================================================================

ALL.push(
  mon('awakened-shrub', 'Awakened Shrub', {
    desc: "A bush given a scrap of mind by some passing druid's spell, now deeply opinionated about trespassers. Fire settles the argument quickly.",
    cr: 0, type: 'plant', size: 'small', ac: 9, hpDice: '3d6',
    speed: 20, abilities: { str: 3, dex: 8, con: 11, int: 10, wis: 10, cha: 6 },
    vuln: ['fire'], resist: ['piercing'], languages: ['Common'],
    traits: [T_FALSE_APPEARANCE_PLANT],
    actions: [melee('Rake', 1, '1d4-1', 'slashing')],
    ai: { archetype: 'brute', aggression: 0.4, selfPreserve: 0.4, preferredRange: 5 },
    sprite: 'shrub', biomes: ['forest', 'pine-forest', 'plains', 'marsh'], groupSize: [2, 5],
  }),

  mon('myconid-sprout', 'Myconid Sprout', {
    desc: "A knee-high fungus-child of the deep colonies, which speaks only in clouds of spores and would rather not fight at all.",
    cr: 0, type: 'plant', size: 'small', ac: 10, hpDice: '2d6',
    speed: 10, abilities: { str: 8, dex: 10, con: 10, int: 8, wis: 11, cha: 5 },
    senses: { darkvision: 120 },
    traits: [
      trait('Distress Spores', "When it takes damage, every myconid within 240 feet knows at once.", { passive: 'distress-spores:240' }),
      trait('Sun Sickness', "An hour in sunlight leaves it sickened and failing.", { passive: 'sun-sickness' }),
    ],
    actions: [
      melee('Fist', 0, '1d4-1', 'bludgeoning'),
      saveAct('Rapport Spores', {
        range: [10, 10],
        target: { kind: 'area', radius: 10, allowAllies: true },
        effects: [{ kind: 'utility', tag: 'telepathy' }],
        desc: "A puff of spores links every creature in a 10-foot radius in silent speech for an hour.",
        ai: { role: 'utility', weight: 0.8 },
      }),
    ],
    ai: { archetype: 'support', aggression: 0.2, selfPreserve: 0.8, preferredRange: 5 },
    sprite: 'myconid', tint: '#c8b48a', biomes: ['underdark', 'cave', 'mine'], groupSize: [3, 6],
  }),

  mon('twig-blight', 'Twig Blight', {
    desc: "A knot of dry sticks that unfolds into limbs when you step past it. Thundertree's streets are choked with them, seeded by Venomfang's presence.",
    cr: 0.125, type: 'plant', size: 'small', ac: 13, acNote: 'natural armor',
    hpDice: '1d6+1', speed: 20, abilities: { str: 6, dex: 13, con: 12, int: 4, wis: 8, cha: 3 },
    skills: { stealth: 3 }, senses: { blindsight: 60 },
    vuln: ['fire'], condImmune: ['blinded', 'deafened'],
    traits: [T_FALSE_APPEARANCE_PLANT, T_BLIND_BEYOND],
    actions: [melee('Claws', 3, '1d4+1', 'piercing')],
    ai: { archetype: 'swarm', aggression: 0.8, selfPreserve: 0.2, preferredRange: 5 },
    sprite: 'twig-blight', biomes: ['forest', 'pine-forest', 'ruins', 'ash-waste'], groupSize: [4, 8],
    faction: 'blight',
  }),

  mon('needle-blight', 'Needle Blight', {
    desc: "A man-shaped tangle of pine needles that rustles when nothing is moving the air. It fires a volley of needles hard enough to punch through leather.",
    cr: 0.25, type: 'plant', size: 'medium', ac: 12, acNote: 'natural armor',
    hpDice: '2d8+2', speed: 30, abilities: { str: 12, dex: 12, con: 13, int: 4, wis: 8, cha: 3 },
    senses: { blindsight: 60 }, condImmune: ['blinded', 'deafened'],
    traits: [T_BLIND_BEYOND],
    actions: [
      melee('Claws', 3, '2d4+1', 'piercing'),
      ranged('Needles', 3, '2d6', 'piercing', [30, 60], { desc: "A hissing spray of pine spines.", ai: { role: 'nuke', weight: 1.2 } }),
    ],
    ai: { archetype: 'archer', aggression: 0.8, selfPreserve: 0.3, preferredRange: 30 },
    sprite: 'needle-blight', biomes: ['pine-forest', 'forest', 'ruins', 'ash-waste'], groupSize: [2, 5],
    faction: 'blight',
  }),

  mon('vine-blight', 'Vine Blight', {
    desc: "It looks like a heap of creeper until the heap speaks, in a voice like wet rope. It calls the undergrowth up around your ankles and squeezes.",
    cr: 0.5, type: 'plant', size: 'medium', ac: 12, acNote: 'natural armor',
    hpDice: '4d8+8', speed: 10, abilities: { str: 15, dex: 8, con: 14, int: 5, wis: 10, cha: 3 },
    skills: { stealth: 1 }, senses: { blindsight: 60 },
    condImmune: ['blinded', 'deafened'], languages: ['Common'],
    traits: [T_FALSE_APPEARANCE_PLANT, T_BLIND_BEYOND],
    actions: [
      melee('Constrict', 4, '2d6+2', 'bludgeoning', {
        reach: 10,
        save: { ability: 'str', dc: 12, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'grappled' }, { kind: 'condition', id: 'restrained' }],
      }),
      saveAct('Entangling Plants', {
        uses: { max: 1, recharge: 'long' },
        target: { kind: 'area', radius: 15 },
        save: { ability: 'str', dc: 12, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'restrained', duration: '1 minute' }],
        desc: "Grass and root heave up in a 15-foot radius and become difficult ground.",
        ai: { role: 'control', weight: 1.8 },
      }),
    ],
    ai: { archetype: 'ambusher', aggression: 0.7, selfPreserve: 0.3, preferredRange: 10 },
    sprite: 'vine-blight', biomes: ['forest', 'pine-forest', 'marsh', 'ruins'], groupSize: [1, 3],
    faction: 'blight',
  }),

  mon('myconid-adult', 'Myconid Adult', {
    desc: "A four-foot mushroom that thinks, farms and remembers. It fights only when a colony is threatened, and then it puts intruders quietly to sleep.",
    cr: 0.5, type: 'plant', size: 'medium', ac: 12, hpDice: '4d8+4',
    speed: 20, abilities: { str: 10, dex: 10, con: 12, int: 10, wis: 11, cha: 7 },
    senses: { darkvision: 120 },
    traits: [
      trait('Distress Spores', "When it takes damage, every myconid within 240 feet knows at once.", { passive: 'distress-spores:240' }),
      trait('Sun Sickness', "An hour in sunlight leaves it sickened and failing.", { passive: 'sun-sickness' }),
    ],
    actions: [
      melee('Fist', 2, '1d6', 'bludgeoning'),
      saveAct('Pacifying Spores', {
        range: [5, 5],
        save: { ability: 'con', dc: 11, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'incapacitated', duration: '1 minute' }],
        uses: { max: 1, recharge: '5-6' },
        desc: "A grey puff that leaves a creature standing quite still, quite calm, and quite unable to act.",
        ai: { role: 'control', weight: 1.7 },
      }),
      saveAct('Rapport Spores', {
        range: [20, 20],
        target: { kind: 'area', radius: 20, allowAllies: true },
        effects: [{ kind: 'utility', tag: 'telepathy' }],
        desc: "Silent speech shared by everything in a 20-foot radius for an hour.",
        ai: { role: 'utility', weight: 0.7 },
      }),
    ],
    ai: { archetype: 'support', aggression: 0.3, selfPreserve: 0.6, preferredRange: 5 },
    loot: { gold: '', table: [['herbalism-kit', 0.1], ['goodberry-preserve', 0.2]] },
    sprite: 'myconid', biomes: ['underdark', 'cave', 'mine'], groupSize: [2, 5],
  }),
);

// ===========================================================================
// OOZES — the slow, patient horrors of the Wave Echo tunnels and the drains
// beneath Undermountain's first level.
// ===========================================================================

ALL.push(
  mon('gray-ooze', 'Gray Ooze', {
    desc: "Wet stone that is not stone. It clings to a blade and eats the steel out of it while you watch.",
    cr: 0.5, type: 'ooze', size: 'medium', ac: 8, hpDice: '3d8+9',
    speed: 10, climb: 10, abilities: { str: 12, dex: 6, con: 16, int: 1, wis: 6, cha: 2 },
    skills: { stealth: 2 }, senses: { blindsight: 60 },
    resist: ['acid', 'cold', 'fire'],
    condImmune: ['blinded', 'charmed', 'deafened', 'exhaustion', 'frightened', 'prone'],
    traits: [
      T_AMORPHOUS,
      trait('Corrode Metal', "A nonmagical metal weapon that hits it corrodes; armour struck by it does the same.", { passive: 'corrode-metal' }),
      trait('False Appearance', "Motionless, it is wet rock and nothing more.", { passive: 'false-appearance' }),
    ],
    actions: [melee('Pseudopod', 3, '1d6+1', 'bludgeoning', {
      effects: [{ kind: 'damage', dice: '2d6', type: 'acid' }, { kind: 'utility', tag: 'corrode-armor' }],
    })],
    ai: { archetype: 'ambusher', aggression: 0.6, selfPreserve: 0.1, preferredRange: 5 },
    loot: { gold: '2d10', table: [['gem-quartz', 0.1], ['ore-sample-phandalin', 0.1]] },
    sprite: 'ooze', tint: '#8a8f92', biomes: ['cave', 'dungeon', 'mine', 'underdark', 'crypt'], groupSize: [1, 2],
  }),

  mon('ochre-jelly', 'Ochre Jelly', {
    desc: "A yellow mass the size of a cart that flows under doors and up stairs. Cut it and you have two of them.",
    cr: 2, type: 'ooze', size: 'large', ac: 8, hpDice: '6d10+12',
    speed: 10, climb: 10, abilities: { str: 15, dex: 6, con: 14, int: 2, wis: 6, cha: 1 },
    senses: { blindsight: 60 },
    resist: ['acid'], immune: ['lightning', 'slashing'],
    condImmune: ['blinded', 'charmed', 'deafened', 'exhaustion', 'frightened', 'prone'],
    traits: [
      T_AMORPHOUS,
      T_SPIDER_CLIMB,
      trait('Split', "Lightning or slashing damage splits it into two smaller jellies, each with half the hit points.", { passive: 'split:lightning,slashing' }),
    ],
    actions: [melee('Pseudopod', 4, '2d6+2', 'bludgeoning', {
      effects: [{ kind: 'damage', dice: '1d6', type: 'acid' }],
    })],
    ai: { archetype: 'brute', aggression: 0.7, selfPreserve: 0.1, preferredRange: 5 },
    loot: { gold: '4d10', table: [['gem-amber', 0.12], ['dagger', 0.1], ['gem-quartz', 0.15]] },
    sprite: 'ooze', tint: '#c8a03a', biomes: ['cave', 'dungeon', 'mine', 'underdark', 'crypt'], groupSize: [1, 2],
  }),

  mon('gelatinous-cube', 'Gelatinous Cube', {
    desc: "Ten feet of transparent jelly filling the corridor exactly, with last tenday's adventurer still suspended halfway through it. You will not see it until you are inside.",
    cr: 2, type: 'ooze', size: 'large', ac: 6, hpDice: '8d10+40',
    speed: 15, abilities: { str: 14, dex: 3, con: 20, int: 1, wis: 6, cha: 1 },
    senses: { blindsight: 60 },
    condImmune: ['blinded', 'charmed', 'deafened', 'exhaustion', 'frightened', 'prone'],
    traits: [
      trait('Ooze Cube', "It fills its space entirely and can be entered — which is exactly the problem.", { passive: 'ooze-cube' }),
      trait('Transparent', "Until it moves or attacks it is effectively invisible.", { passive: 'transparent' }),
    ],
    actions: [
      melee('Pseudopod', 4, '3d6', 'acid'),
      saveAct('Engulf', {
        save: { ability: 'dex', dc: 12, onSuccess: 'half' },
        dice: '3d6', dtype: 'acid',
        effects: [{ kind: 'condition', id: 'restrained' }, { kind: 'condition', id: 'engulfed' }],
        desc: "It moves through a creature's space; the victim is drawn inside and takes 6d6 acid each round.",
        ai: { role: 'control', weight: 2 },
      }),
    ],
    ai: { archetype: 'ambusher', aggression: 0.7, selfPreserve: 0, preferredRange: 5 },
    loot: { gold: '5d10', table: [['gem-quartz', 0.2], ['gem-onyx', 0.12], ['longsword', 0.08], ['potion-healing', 0.1]] },
    sprite: 'gelatinous-cube', biomes: ['dungeon', 'cave', 'underdark', 'mine', 'crypt'], groupSize: [1, 1],
  }),

  mon('black-pudding', 'Black Pudding', {
    desc: "A slick black tide with no face and no mercy, dissolving stone, steel and bone at the same unhurried rate. Undermountain's lower drains are full of them.",
    cr: 4, type: 'ooze', size: 'large', ac: 7, hpDice: '10d10+30',
    speed: 20, climb: 20, abilities: { str: 16, dex: 5, con: 16, int: 1, wis: 6, cha: 1 },
    senses: { blindsight: 60 },
    immune: ['acid', 'cold', 'lightning', 'slashing'],
    condImmune: ['blinded', 'charmed', 'deafened', 'exhaustion', 'frightened', 'prone'],
    traits: [
      T_AMORPHOUS,
      T_SPIDER_CLIMB,
      trait('Corrosive Form', "Any creature that touches it or hits it in melee takes 1d8 acid; nonmagical weapons and armour corrode.", { passive: 'corrosive-form:1d8' }),
      trait('Split', "Lightning or slashing damage splits it into two puddings, each with half the hit points.", { passive: 'split:lightning,slashing' }),
    ],
    actions: [melee('Pseudopod', 5, '1d6+3', 'bludgeoning', {
      effects: [{ kind: 'damage', dice: '4d8', type: 'acid' }, { kind: 'utility', tag: 'corrode-armor' }],
    })],
    ai: { archetype: 'brute', aggression: 0.75, selfPreserve: 0.05, preferredRange: 5 },
    loot: { gold: '6d10', table: [['gem-onyx', 0.18], ['gem-black-pearl', 0.08], ['potion-greater-healing', 0.1]] },
    sprite: 'ooze', tint: '#1a1a20', biomes: ['dungeon', 'cave', 'underdark', 'mine', 'crypt'], groupSize: [1, 1],
  }),
);

// ===========================================================================
// MONSTROSITIES & THINGS IN THE DARK — the reason the Lionshield Coster
// charges what it charges for a caravan escort.
// ===========================================================================

ALL.push(
  mon('darkmantle', 'Darkmantle', {
    desc: "It hangs from the ceiling looking exactly like a stalactite until it drops, wraps your head and snuffs every light in the chamber.",
    cr: 0.5, type: 'monstrosity', size: 'small', ac: 11, hpDice: '5d6+5',
    speed: 10, fly: 30, abilities: { str: 16, dex: 12, con: 13, int: 2, wis: 10, cha: 5 },
    skills: { stealth: 3 }, senses: { blindsight: 60 },
    traits: [
      trait('Echolocation', "It maps the dark by sound and is helpless deafened.", { passive: 'echolocation' }),
      trait('False Appearance', "Hanging still, it is a stalactite in every respect.", { passive: 'false-appearance' }),
    ],
    actions: [
      melee('Crush', 5, '1d6+3', 'bludgeoning', {
        effects: [{ kind: 'condition', id: 'grappled' }, { kind: 'condition', id: 'blinded' }],
        desc: "It fastens over the target's head; a blinded, grappled victim cannot breathe well either.",
      }),
      saveAct('Darkness Aura', {
        uses: { max: 1, recharge: 'long' },
        target: { kind: 'area', radius: 15 },
        effects: [{ kind: 'utility', tag: 'magical-darkness' }],
        desc: "Magical darkness spills out 15 feet from it for ten minutes.",
        ai: { role: 'control', weight: 1.5 },
      }),
    ],
    ai: { archetype: 'ambusher', aggression: 0.8, selfPreserve: 0.3, preferredRange: 5 },
    sprite: 'darkmantle', biomes: ['cave', 'underdark', 'mine', 'dungeon'], groupSize: [2, 4],
  }),

  mon('rust-monster', 'Rust Monster', {
    desc: "A twitching, antennaed insect the size of a pony that eats ferrous metal and adores adventurers. It will ignore you entirely in favour of your sword.",
    cr: 0.5, type: 'monstrosity', size: 'medium', ac: 14, acNote: 'natural armor',
    hpDice: '5d8+5', speed: 40, abilities: { str: 13, dex: 12, con: 13, int: 2, wis: 13, cha: 6 },
    senses: { darkvision: 60 },
    traits: [
      trait('Iron Scent', "It smells ferrous metal at sixty feet through stone.", { passive: 'iron-scent:60' }),
      trait('Rust Metal', "Any nonmagical ferrous metal it touches corrodes to red flakes.", { passive: 'rust-metal' }),
    ],
    actions: [
      melee('Bite', 3, '1d8+1', 'piercing'),
      util('Antennae', {
        reach: 5,
        effects: [{ kind: 'utility', tag: 'corrode-metal' }],
        desc: "It brushes a metal object with its feelers; nonmagical iron or steel rusts through in a heartbeat.",
        ai: { role: 'debuff', weight: 1.8 },
      }),
    ],
    ai: { archetype: 'skirmisher', aggression: 0.5, selfPreserve: 0.5, preferredRange: 5 },
    loot: { gold: '', table: [['ore-sample-phandalin', 0.15], ['gem-malachite', 0.08]] },
    sprite: 'rust-monster', biomes: ['cave', 'dungeon', 'mine', 'underdark'], groupSize: [1, 2],
  }),

  mon('harpy', 'Harpy', {
    desc: "A filthy, beautiful voice above a body no one wants to look at twice. It sings travellers off the cliff road and eats what the fall leaves.",
    cr: 1, type: 'monstrosity', size: 'medium', ac: 11, hpDice: '7d8+7',
    speed: 20, fly: 40, abilities: { str: 12, dex: 13, con: 12, int: 7, wis: 10, cha: 13 },
    languages: ['Common'],
    actions: [
      multi("It rakes with both claws and swings its club.", [['claws', 2], ['club', 1]]),
      melee('Claws', 3, '2d4+1', 'slashing'),
      melee('Club', 3, '1d4+1', 'bludgeoning'),
      saveAct('Luring Song', {
        range: [300, 300],
        target: { kind: 'area', radius: 300 },
        save: { ability: 'wis', dc: 11, onSuccess: 'negate', repeatEachTurn: true },
        effects: [{ kind: 'condition', id: 'charmed', duration: '1 minute' }],
        desc: "A charmed listener walks toward the harpy by the shortest route, heedless of drops and traps.",
        ai: { role: 'control', weight: 2 },
      }),
    ],
    ai: { archetype: 'skirmisher', aggression: 0.7, selfPreserve: 0.6, preferredRange: 20 },
    loot: { gold: '4d10', table: [['gem-pearl', 0.1], ['gem-amber', 0.12], ['clothes-fine', 0.15], ['lute', 0.05]] },
    sprite: 'harpy', biomes: ['coast', 'hills', 'mountain', 'ruins', 'marsh'], groupSize: [2, 4],
  }),

  mon('grick', 'Grick', {
    desc: "A worm the colour of wet rock with four barbed tentacles around a beak. Cragmaw's goblins avoid the tunnels where the walls have grooves worn in them.",
    cr: 2, type: 'monstrosity', size: 'medium', ac: 14, acNote: 'natural armor',
    hpDice: '6d8', speed: 30, climb: 30, abilities: { str: 14, dex: 14, con: 11, int: 3, wis: 14, cha: 5 },
    senses: { darkvision: 60 }, resist: ['nonmagical-physical'],
    traits: [trait('Stone Camouflage', "Against rock it is effectively invisible until it moves.", { passive: 'stone-camouflage', skillProf: ['stealth'] })],
    actions: [
      multi("Tentacles first; if they hit, the beak follows.", [['tentacles', 1], ['beak', 1]]),
      melee('Tentacles', 4, '1d6+2', 'slashing'),
      melee('Beak', 4, '1d6+2', 'piercing'),
    ],
    ai: { archetype: 'ambusher', aggression: 0.75, selfPreserve: 0.4, preferredRange: 5 },
    loot: { gold: '3d10', table: [['gem-quartz', 0.15], ['gem-malachite', 0.1], ['torch', 0.2]] },
    sprite: 'grick', biomes: ['cave', 'underdark', 'mine', 'dungeon', 'crypt'], groupSize: [1, 3],
  }),

  mon('ettercap', 'Ettercap', {
    desc: "A hunched spider-thing with a man's cunning that farms giant spiders the way a crofter farms sheep. Its glades are strung with webs and old rope.",
    cr: 2, type: 'monstrosity', size: 'medium', ac: 13, acNote: 'natural armor',
    hpDice: '8d8+8', speed: 30, climb: 30, abilities: { str: 14, dex: 15, con: 13, int: 7, wis: 12, cha: 8 },
    skills: { perception: 3, stealth: 4, survival: 3 }, senses: { darkvision: 60 },
    traits: [T_SPIDER_CLIMB, T_WEB_SENSE, T_WEB_WALKER],
    actions: [
      multi("It bites and rakes with its claws.", [['bite', 1], ['claws', 1]]),
      melee('Bite', 4, '1d8+2', 'piercing', {
        save: { ability: 'con', dc: 11, onSuccess: 'half' },
        effects: [{ kind: 'damage', dice: '1d8', type: 'poison' }],
      }),
      melee('Claws', 4, '2d4+2', 'slashing'),
      ranged('Web', 4, null, null, [30, 60], {
        save: { ability: 'dex', dc: 11, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'restrained' }],
        uses: { max: 1, recharge: '5-6' },
        desc: "A thrown net of cable. AC 10, 5 hit points, immune to poison and psychic.",
        ai: { role: 'control', weight: 1.7 },
      }),
    ],
    ai: { archetype: 'ambusher', aggression: 0.75, selfPreserve: 0.5, preferredRange: 30 },
    loot: { gold: '4d10', table: [['rope-silk', 0.25], ['net', 0.15], ['gem-amber', 0.12], ['poison-basic', 0.1]] },
    sprite: 'ettercap', biomes: ['forest', 'pine-forest', 'cave', 'ruins'], groupSize: [1, 2],
  }),

  mon('mimic', 'Mimic', {
    desc: "The chest at the back of the vault is not a chest. It has been waiting, patient and gluey, for someone to reach for the lid.",
    cr: 2, type: 'monstrosity', subtype: 'shapechanger', size: 'medium', ac: 12, acNote: 'natural armor',
    hpDice: '9d8+18', speed: 15, abilities: { str: 17, dex: 12, con: 15, int: 5, wis: 13, cha: 8 },
    skills: { stealth: 5 }, senses: { darkvision: 60 },
    immune: ['acid'], condImmune: ['prone'],
    traits: [
      trait('Shapechanger', "It reshapes itself into any object of roughly its own mass.", { passive: 'shapechanger' }),
      trait('Adhesive', "Anything that touches it sticks fast, and pulling free is a Strength contest.", { passive: 'adhesive' }),
      trait('False Appearance', "At rest it is furniture in every respect a thief could test.", { passive: 'false-appearance' }),
      trait('Grappler', "It attacks a creature stuck to it with advantage.", { passive: 'grappler' }),
    ],
    actions: [
      melee('Pseudopod', 5, '1d8+3', 'bludgeoning', {
        effects: [{ kind: 'damage', dice: '1d8', type: 'acid' }, { kind: 'condition', id: 'grappled' }],
      }),
      melee('Bite', 5, '1d8+3', 'piercing', { effects: [{ kind: 'damage', dice: '1d8', type: 'acid' }] }),
    ],
    ai: { archetype: 'ambusher', aggression: 0.9, selfPreserve: 0.3, preferredRange: 5 },
    loot: { gold: '4d6*5', table: [['gem-emerald', 0.08], ['gem-onyx', 0.2], ['potion-greater-healing', 0.15], ['scroll-2', 0.12], ['thieves-tools', 0.1]] },
    sprite: 'mimic', biomes: ['dungeon', 'ruins', 'crypt', 'cave', 'mine', 'city'], groupSize: [1, 1],
  }),

  mon('ankheg', 'Ankheg', {
    desc: "A burrowing horror the size of a plough-ox that erupts from beneath a field and folds a farmhand in half. Every steading on the Trail has lost someone to one.",
    cr: 2, type: 'monstrosity', size: 'large', ac: 14, acNote: 'natural armor, 11 while prone',
    hpDice: '6d10+6', speed: 30, burrow: 10, abilities: { str: 17, dex: 11, con: 13, int: 1, wis: 13, cha: 6 },
    senses: { darkvision: 60, tremorsense: 60 },
    traits: [trait('Ambusher', "It waits beneath the soil and strikes at whatever crosses the ground above.", { passive: 'ambusher' })],
    actions: [
      melee('Bite', 5, '2d6+3', 'piercing', {
        effects: [{ kind: 'damage', dice: '1d6', type: 'acid' }, { kind: 'condition', id: 'grappled' }],
      }),
      saveAct('Acid Spray', {
        target: { kind: 'line', length: 30, width: 5 },
        save: { ability: 'dex', dc: 13, onSuccess: 'half' },
        dice: '3d6', dtype: 'acid',
        uses: { max: 1, recharge: '6' },
        desc: "A 30-foot line of digestive acid, spat from the mandibles.",
        ai: { role: 'aoe', weight: 1.8 },
      }),
    ],
    ai: { archetype: 'ambusher', aggression: 0.8, selfPreserve: 0.4, preferredRange: 5 },
    loot: { gold: '4d10', table: [['gem-amber', 0.15], ['gem-quartz', 0.15], ['rations', 0.2]] },
    sprite: 'ankheg', biomes: ['plains', 'hills', 'forest', 'road'], groupSize: [1, 2],
  }),

  mon('phase-spider', 'Phase Spider', {
    desc: "It steps half out of the world, walks three paces through the Ethereal, and reappears behind you with its fangs already closing.",
    cr: 3, type: 'monstrosity', size: 'large', ac: 13, hpDice: '5d10+5',
    speed: 30, climb: 30, abilities: { str: 15, dex: 15, con: 12, int: 6, wis: 10, cha: 6 },
    skills: { stealth: 6 }, senses: { darkvision: 60 },
    traits: [
      trait('Ethereal Jaunt', "As a bonus action it slips to the Ethereal Plane and back, ignoring walls and blades alike.", { passive: 'ethereal-jaunt' }),
      T_SPIDER_CLIMB,
      T_WEB_WALKER,
    ],
    actions: [melee('Bite', 4, '1d10+2', 'piercing', {
      save: { ability: 'con', dc: 11, onSuccess: 'half' },
      effects: [{ kind: 'damage', dice: '4d8', type: 'poison' }],
      desc: "A creature reduced to 0 by the venom is stable but poisoned and paralyzed for an hour.",
    })],
    bonusActions: [util('Ethereal Jaunt', { desc: "It shifts to or from the Ethereal Plane.", ai: { role: 'utility', weight: 1.4 } })],
    ai: { archetype: 'ambusher', aggression: 0.8, selfPreserve: 0.7, preferredRange: 5 },
    loot: { gold: '5d10', table: [['rope-silk', 0.2], ['gem-moonstone', 0.12], ['gem-amber', 0.15], ['potion-healing', 0.12]] },
    sprite: 'spider', tint: '#7a5aa8', biomes: ['underdark', 'cave', 'forest', 'dungeon', 'ruins'], groupSize: [1, 3],
  }),

  mon('owlbear', 'Owlbear', {
    desc: "Feathered head, bear's body, and the temper of neither. Neverwinter Wood rangers say it hunts for the joy of it, and they are not joking.",
    cr: 3, type: 'monstrosity', size: 'large', ac: 13, acNote: 'natural armor',
    hpDice: '7d10+21', speed: 40, abilities: { str: 20, dex: 12, con: 17, int: 3, wis: 12, cha: 7 },
    skills: { perception: 3 }, senses: { darkvision: 60 },
    traits: [trait('Keen Sight and Smell', "It hunts by eye and nose together; hiding from it is very hard.", { passive: 'keen-sight-and-smell', skillProf: ['perception'] })],
    actions: [
      multi("It snaps with its beak and rakes with its claws.", [['beak', 1], ['claws', 1]]),
      melee('Beak', 7, '1d10+5', 'piercing'),
      melee('Claws', 7, '2d8+5', 'slashing'),
    ],
    ai: { archetype: 'brute', aggression: 0.9, selfPreserve: 0.3, preferredRange: 5 },
    loot: { gold: '3d10', table: [['rations', 0.4], ['gem-amber', 0.12], ['arrow', 0.2]] },
    sprite: 'owlbear', biomes: ['forest', 'pine-forest', 'hills', 'cave', 'tundra'], groupSize: [1, 2],
  }),

  mon('manticore', 'Manticore', {
    desc: "A lion's body, a bat's wings, a man's cruel face, and a tail that fires spikes like a ballista. It bargains before it kills, and it enjoys both.",
    cr: 3, type: 'monstrosity', size: 'large', ac: 14, acNote: 'natural armor',
    hpDice: '8d10+24', speed: 30, fly: 50, abilities: { str: 17, dex: 16, con: 17, int: 7, wis: 12, cha: 8 },
    senses: { darkvision: 60 }, languages: ['Common'],
    traits: [trait('Tail Spike Regrowth', "It carries two dozen spikes and grows them back overnight.", { passive: 'tail-spike-regrowth:24' })],
    actions: [
      multi("Bite and both claws, or three tail spikes.", [['bite', 1], ['claw', 2]]),
      melee('Bite', 5, '1d8+3', 'piercing'),
      melee('Claw', 5, '1d6+3', 'slashing'),
      ranged('Tail Spike', 5, '1d8+3', 'piercing', [100, 200]),
    ],
    ai: { archetype: 'archer', aggression: 0.75, selfPreserve: 0.6, preferredRange: 60 },
    loot: { gold: '4d6*5', table: [['gem-ruby', 0.08], ['gem-jade', 0.15], ['potion-healing', 0.2], ['arrow', 0.25]] },
    sprite: 'manticore', biomes: ['mountain', 'hills', 'ruins', 'plains'], groupSize: [1, 2],
  }),

  mon('minotaur', 'Minotaur', {
    desc: "Seven feet of bull-headed fury with a greataxe and a memory for corridors that never fails. Baphomet's get infest the deeper mazes of Undermountain.",
    cr: 3, type: 'monstrosity', size: 'large', ac: 14, acNote: 'natural armor',
    hpDice: '9d10+27', speed: 40, abilities: { str: 18, dex: 11, con: 16, int: 6, wis: 16, cha: 9 },
    skills: { perception: 7 }, senses: { darkvision: 60 }, languages: ['Abyssal'],
    traits: [
      trait('Charge', "A 10-foot run adds 2d8 piercing to the gore and may knock the target prone (DC 14 Strength).", { passive: 'charge:10:2d8:piercing:str:14' }),
      trait('Labyrinthine Recall', "It remembers perfectly any path it has ever walked.", { passive: 'labyrinthine-recall' }),
      trait('Reckless', "It can trade all defence for advantage on its Strength attacks this round.", { passive: 'reckless' }),
    ],
    actions: [
      melee('Greataxe', 6, '2d12+4', 'slashing'),
      melee('Gore', 6, '2d8+4', 'piercing'),
    ],
    ai: { archetype: 'brute', aggression: 0.9, selfPreserve: 0.25, preferredRange: 5 },
    loot: { gold: '5d6*5', table: [['greataxe', 0.3], ['gem-onyx', 0.15], ['potion-greater-healing', 0.15]] },
    sprite: 'minotaur', biomes: ['dungeon', 'underdark', 'ruins', 'crypt', 'cave'], groupSize: [1, 2],
  }),

  mon('water-weird', 'Water Weird', {
    desc: "The fountain moves against itself, rises into a serpent of water, and drags whatever is nearest under. Netherese ruins bind them to guard cisterns.",
    cr: 3, type: 'elemental', size: 'large', ac: 13, hpDice: '9d10+9',
    speed: 0, swim: 60, abilities: { str: 17, dex: 16, con: 13, int: 11, wis: 10, cha: 10 },
    senses: { blindsight: 30 }, languages: ['Aquan'],
    resist: ['fire', 'nonmagical-physical'], immune: ['poison'],
    condImmune: ['exhaustion', 'grappled', 'paralyzed', 'poisoned', 'prone', 'restrained', 'unconscious'],
    traits: [
      trait('Invisible in Water', "Submerged, it is simply water and cannot be picked out.", { passive: 'invisible-in-water' }),
      trait('Water Bound', "It dies if it ends its turn more than 30 feet from the water that birthed it.", { passive: 'water-bound:30' }),
    ],
    actions: [melee('Constrict', 5, '3d6+3', 'bludgeoning', {
      reach: 10,
      save: { ability: 'str', dc: 13, onSuccess: 'negate' },
      effects: [{ kind: 'condition', id: 'grappled' }, { kind: 'condition', id: 'restrained' }],
      desc: "It hauls the victim into the water and holds it under.",
    })],
    ai: { archetype: 'tank', aggression: 0.7, selfPreserve: 0.3, preferredRange: 10 },
    loot: { gold: '4d10', table: [['gem-pearl', 0.15], ['gem-moonstone', 0.1]] },
    sprite: 'water-weird', biomes: ['dungeon', 'ruins', 'cave', 'marsh', 'coast', 'underdark'], groupSize: [1, 1],
  }),
);

// ===========================================================================
// ABERRATIONS — the things that seeped up from the Underdark into the old
// Netherese vaults, and the shallow levels of Halaster's dungeon.
// ===========================================================================

ALL.push(
  mon('flumph', 'Flumph', {
    desc: "A drifting jellyfish of the Underdark, luminous, painfully polite, and secretly the most decent creature down there. It feeds on stray thoughts and disapproves of the ones it finds.",
    cr: 0.125, type: 'aberration', size: 'small', ac: 12, hpDice: '2d6',
    speed: 5, fly: 30, hover: true, abilities: { str: 6, dex: 15, con: 10, int: 14, wis: 14, cha: 11 },
    skills: { arcana: 4, history: 4, religion: 4 }, senses: { darkvision: 60 },
    languages: ['Undercommon'],
    traits: [
      trait('Advanced Telepathy', "It reads the surface thoughts of anything within 60 feet and can speak mind to mind.", { passive: 'advanced-telepathy:60' }),
      trait('Prone Deficiency', "Flipped onto its back it is helpless until it rights itself.", { passive: 'prone-deficiency' }),
      trait('Telepathic Shroud', "It is immune to any effect that would read its mind, and knows when one is tried.", { passive: 'telepathic-shroud', condImmune: ['charmed'] }),
    ],
    actions: [
      melee('Tendrils', 4, '2d4', 'psychic', {
        save: { ability: 'con', dc: 10, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'poisoned', duration: '1 minute' }],
      }),
      saveAct('Stench Spray', {
        uses: { max: 1, recharge: 'long' },
        target: { kind: 'cone', length: 15 },
        save: { ability: 'dex', dc: 10, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'stench-marked', duration: '2d6 hours' }],
        desc: "A jet of foul-smelling fluid that clings for hours and gives it away to everything downwind.",
        ai: { role: 'debuff', weight: 1.2 },
      }),
    ],
    ai: { archetype: 'support', aggression: 0.2, selfPreserve: 0.9, preferredRange: 5 },
    sprite: 'flumph', biomes: ['underdark', 'cave', 'dungeon', 'mine'], groupSize: [1, 3],
  }),

  mon('nothic', 'Nothic', {
    desc: "A wizard who read one page too far and was rewarded with a single enormous eye and a hoard of stolen secrets. Its gaze rots flesh straight off the bone.",
    cr: 2, type: 'aberration', size: 'medium', ac: 15, acNote: 'natural armor',
    hpDice: '6d8+18', speed: 30, abilities: { str: 14, dex: 16, con: 16, int: 13, wis: 10, cha: 8 },
    skills: { arcana: 3, insight: 2, perception: 2, stealth: 5 },
    senses: { truesight: 120 }, languages: ['Undercommon'],
    traits: [trait('Keen Sight', "That one eye misses nothing at a distance.", { passive: 'keen-sight', skillProf: ['perception'] })],
    actions: [
      multi("It rakes with both claws.", [['claw', 2]]),
      melee('Claw', 4, '1d6+3', 'slashing'),
      saveAct('Rotting Gaze', {
        range: [30, 30],
        save: { ability: 'con', dc: 12, onSuccess: 'none' },
        dice: '3d6', dtype: 'necrotic',
        desc: "It fixes its eye on a creature it can see and the flesh begins to blacken.",
        ai: { role: 'nuke', weight: 1.6 },
      }),
      util('Weird Insight', {
        range: [30, 30],
        save: { ability: 'cha', dc: 12, onSuccess: 'negate' },
        desc: "It tears one secret out of a mind — a crime, a fear, a hidden name — and will trade for more.",
        ai: { role: 'debuff', weight: 0.8 },
      }),
    ],
    ai: { archetype: 'caster', aggression: 0.6, selfPreserve: 0.7, preferredRange: 30 },
    loot: { gold: '5d10', table: [['scroll-2', 0.15], ['gem-onyx', 0.2], ['gem-moonstone', 0.12], ['spellbook', 0.1], ['focus-wand', 0.08]] },
    sprite: 'nothic', biomes: ['dungeon', 'ruins', 'underdark', 'crypt', 'cave'], groupSize: [1, 2],
  }),

  mon('spectator', 'Spectator', {
    desc: "A lesser beholder-kin, four eyestalks and one great eye, bound by ritual to guard a vault for a century and a day. It takes the contract very seriously.",
    cr: 3, type: 'aberration', size: 'medium', ac: 14, acNote: 'natural armor',
    hpDice: '6d8+12', speed: 0, fly: 30, hover: true,
    abilities: { str: 8, dex: 14, con: 14, int: 13, wis: 14, cha: 11 },
    skills: { perception: 6 }, senses: { darkvision: 120 },
    condImmune: ['prone'], languages: ['Deep Speech', 'Undercommon'],
    traits: [trait('Bound Guardian', "It was summoned to guard one place or object and will not willingly leave it.", { passive: 'bound-guardian' })],
    actions: [
      melee('Bite', 1, '1d6', 'piercing'),
      saveAct('Confusion Ray', {
        range: [30, 30],
        save: { ability: 'wis', dc: 13, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'confused', duration: '1 round' }],
        desc: "One of four eye rays, fired two at a time and never in a predictable order.",
        ai: { role: 'control', weight: 1.4 },
      }),
      saveAct('Paralyzing Ray', {
        range: [30, 30],
        save: { ability: 'con', dc: 13, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'paralyzed', duration: '1 minute' }],
        ai: { role: 'control', weight: 1.8 },
      }),
      saveAct('Fear Ray', {
        range: [30, 30],
        save: { ability: 'wis', dc: 13, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'frightened', duration: '1 minute' }],
        ai: { role: 'debuff', weight: 1.3 },
      }),
      saveAct('Wounding Ray', {
        range: [30, 30],
        save: { ability: 'con', dc: 13, onSuccess: 'half' },
        dice: '3d10', dtype: 'necrotic',
        ai: { role: 'nuke', weight: 1.6 },
      }),
    ],
    reactions: [util('Spell Reflection', {
      desc: "If it succeeds on a save against a spell that targets it alone, it can bounce the spell back at the caster.",
      ai: { role: 'utility', weight: 1.6 },
    })],
    ai: { archetype: 'caster', aggression: 0.7, selfPreserve: 0.5, preferredRange: 30 },
    loot: { gold: '5d6*5', table: [['gem-emerald', 0.1], ['scroll-3', 0.15], ['potion-greater-healing', 0.15], ['gem-onyx', 0.2]] },
    sprite: 'spectator', biomes: ['dungeon', 'underdark', 'crypt', 'ruins'], groupSize: [1, 1],
  }),
);

// ===========================================================================
// CONSTRUCTS & GARGOYLES — the guardians left behind in Netherese vaults, in
// Tresendar's cellars, and on Undermountain's first three levels.
// ===========================================================================

ALL.push(
  mon('flying-sword', 'Flying Sword', {
    desc: "A longsword hanging in the air at chest height, turning slowly to face whoever came in. There is no hand on the hilt and never was.",
    cr: 0.25, type: 'construct', size: 'small', ac: 17, acNote: 'natural armor',
    hpDice: '5d6', speed: 0, fly: 50, hover: true,
    abilities: { str: 12, dex: 15, con: 11, int: 1, wis: 5, cha: 1 },
    saveProf: ['dex'], senses: { blindsight: 60 },
    immune: ['poison', 'psychic'],
    condImmune: ['blinded', 'charmed', 'deafened', 'frightened', 'paralyzed', 'petrified', 'poisoned', 'prone'],
    traits: [T_CONSTRUCT_NATURE, T_ANTIMAGIC_SUSC, trait('False Appearance', "Motionless, it is an ordinary sword on a rack.", { passive: 'false-appearance' })],
    actions: [melee('Longsword', 3, '1d8+1', 'slashing')],
    ai: { archetype: 'skirmisher', aggression: 0.9, selfPreserve: 0, preferredRange: 5 },
    loot: { gold: '', table: [['longsword', 0.35]] },
    sprite: 'flying-sword', biomes: ['dungeon', 'ruins', 'crypt', 'city'], groupSize: [2, 4],
  }),

  mon('animated-armor', 'Animated Armor', {
    desc: "A suit of plate that steps down off its stand and closes the visor. Nothing is inside; the gauntlets still know how to punch.",
    cr: 1, type: 'construct', size: 'medium', ac: 18, acNote: 'natural armor',
    hpDice: '6d8+6', speed: 25, abilities: { str: 14, dex: 11, con: 13, int: 1, wis: 3, cha: 1 },
    senses: { blindsight: 60 },
    immune: ['poison', 'psychic'],
    condImmune: ['blinded', 'charmed', 'deafened', 'exhaustion', 'frightened', 'paralyzed', 'petrified', 'poisoned'],
    traits: [T_CONSTRUCT_NATURE, T_ANTIMAGIC_SUSC, trait('False Appearance', "Standing still, it is an empty suit of armour and passes any inspection short of a shove.", { passive: 'false-appearance' })],
    actions: [
      multi("It strikes twice with its gauntlets.", [['slam', 2]]),
      melee('Slam', 4, '1d6+2', 'bludgeoning'),
    ],
    ai: { archetype: 'tank', aggression: 0.85, selfPreserve: 0, preferredRange: 5 },
    loot: { gold: '', table: [['plate-armor', 0.1], ['half-plate', 0.15]] },
    sprite: 'animated-armor', biomes: ['dungeon', 'ruins', 'crypt', 'city', 'mine'], groupSize: [1, 3],
  }),

  mon('rug-of-smothering', 'Rug of Smothering', {
    desc: "The carpet by the hearth rears up like a wave and comes down over your head. Halaster is said to find this one funny.",
    cr: 2, type: 'construct', size: 'large', ac: 12, hpDice: '6d10',
    speed: 10, abilities: { str: 17, dex: 14, con: 10, int: 1, wis: 3, cha: 1 },
    senses: { blindsight: 60 },
    immune: ['poison', 'psychic'],
    condImmune: ['blinded', 'charmed', 'deafened', 'frightened', 'paralyzed', 'petrified', 'poisoned'],
    traits: [
      T_CONSTRUCT_NATURE,
      T_ANTIMAGIC_SUSC,
      trait('Damage Transfer', "While it smothers a creature, it takes only half the damage dealt to it and the victim takes the other half.", { passive: 'damage-transfer:0.5' }),
      trait('False Appearance', "Spread flat, it is a rug — a good one, even.", { passive: 'false-appearance' }),
    ],
    actions: [melee('Smother', 5, '2d6+3', 'bludgeoning', {
      save: { ability: 'str', dc: 13, onSuccess: 'negate' },
      effects: [{ kind: 'condition', id: 'grappled' }, { kind: 'condition', id: 'restrained' }, { kind: 'condition', id: 'blinded' }],
      desc: "It wraps a Medium or smaller creature, which cannot breathe while held.",
    })],
    ai: { archetype: 'ambusher', aggression: 0.9, selfPreserve: 0, preferredRange: 5 },
    loot: { gold: '3d10', table: [['gem-amber', 0.1]] },
    sprite: 'rug', biomes: ['dungeon', 'ruins', 'city', 'crypt'], groupSize: [1, 1],
  }),

  mon('gargoyle', 'Gargoyle', {
    desc: "A grotesque of Neverwintan stonework that has been watching the street since before the Ruining, and is now bored. Ordinary steel chips off it.",
    cr: 2, type: 'elemental', size: 'medium', ac: 15, acNote: 'natural armor',
    hpDice: '7d8+21', speed: 30, fly: 60,
    abilities: { str: 15, dex: 11, con: 16, int: 6, wis: 11, cha: 7 },
    senses: { darkvision: 60 }, languages: ['Terran'],
    resist: ['nonmagical-physical-nonadamantine'], immune: ['poison'],
    condImmune: ['exhaustion', 'petrified', 'poisoned'],
    traits: [trait('False Appearance', "Crouched and still, it is carved stone in every respect.", { passive: 'false-appearance' })],
    actions: [
      multi("It bites and rakes with both claws.", [['bite', 1], ['claws', 1]]),
      melee('Bite', 4, '1d6+2', 'piercing'),
      melee('Claws', 4, '1d6+2', 'slashing'),
    ],
    ai: { archetype: 'skirmisher', aggression: 0.75, selfPreserve: 0.4, preferredRange: 5 },
    loot: { gold: '3d10', table: [['gem-malachite', 0.15], ['gem-onyx', 0.1]] },
    sprite: 'gargoyle', biomes: ['city', 'ruins', 'dungeon', 'mountain', 'crypt'], groupSize: [1, 4],
  }),
);

// ===========================================================================
// FIENDS — the small change of the Lower Planes, bound by warlocks, cultists
// and the occasional careless Netherese circle.
// ===========================================================================

ALL.push(
  mon('manes', 'Manes', {
    desc: "The lowest rung of the Abyss: a soul chewed into a shambling lump of claws and hunger. They are conjured in dozens because they are worth nothing individually.",
    cr: 0.125, type: 'fiend', subtype: 'demon', size: 'small', ac: 9, hpDice: '2d6+2',
    speed: 20, abilities: { str: 10, dex: 9, con: 13, int: 3, wis: 8, cha: 4 },
    senses: { darkvision: 60 }, languages: ['Abyssal'],
    resist: ['cold', 'fire', 'lightning'], immune: ['poison'],
    condImmune: ['charmed', 'frightened', 'poisoned'],
    actions: [melee('Claws', 2, '2d4', 'slashing')],
    ai: { archetype: 'swarm', aggression: 0.9, selfPreserve: 0, preferredRange: 5 },
    sprite: 'manes', biomes: ['dungeon', 'ruins', 'crypt', 'underdark'], groupSize: [3, 8],
    faction: 'fiend',
  }),

  mon('dretch', 'Dretch', {
    desc: "A squat, stinking demon with too many teeth and no courage at all. Cornered, it belches a cloud that empties stomachs and lungs together.",
    cr: 0.25, type: 'fiend', subtype: 'demon', size: 'small', ac: 11, acNote: 'natural armor',
    hpDice: '4d6+4', speed: 20, abilities: { str: 11, dex: 11, con: 12, int: 5, wis: 8, cha: 3 },
    senses: { darkvision: 60 }, languages: ['Abyssal'],
    resist: ['cold', 'fire', 'lightning'], immune: ['poison'], condImmune: ['poisoned'],
    actions: [
      multi("It bites and rakes with its claws.", [['bite', 1], ['claws', 1]]),
      melee('Bite', 2, '1d6', 'piercing'),
      melee('Claws', 2, '2d4', 'slashing'),
      saveAct('Fetid Cloud', {
        uses: { max: 1, recharge: 'long' },
        target: { kind: 'area', radius: 10 },
        save: { ability: 'con', dc: 11, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'poisoned', duration: '1 minute' }],
        desc: "A 10-foot cloud of green gas; the poisoned can take an action or a bonus action, not both.",
        ai: { role: 'aoe', weight: 1.6 },
      }),
    ],
    ai: { archetype: 'swarm', aggression: 0.8, selfPreserve: 0.4, preferredRange: 5 },
    sprite: 'dretch', biomes: ['dungeon', 'ruins', 'crypt', 'underdark'], groupSize: [2, 6],
    faction: 'fiend',
  }),

  mon('imp', 'Imp', {
    desc: "A tiny devil with a barbed tail, a lawyer's manner and a talent for being exactly where you cannot see it. It serves a warlock only as long as the contract benefits Baator.",
    cr: 1, type: 'fiend', subtype: 'devil', size: 'tiny', ac: 13, hpDice: '3d4+3',
    speed: 20, fly: 40, abilities: { str: 6, dex: 17, con: 13, int: 11, wis: 12, cha: 14 },
    skills: { deception: 4, insight: 3, persuasion: 4, stealth: 5 },
    senses: { darkvision: 120 }, languages: ['Infernal', 'Common'],
    resist: ['cold', 'nonmagical-physical-nonsilver'], immune: ['fire', 'poison'],
    condImmune: ['poisoned'],
    traits: [
      trait('Shapechanger', "It becomes a rat, a raven or a spider at will, keeping its statistics.", { passive: 'shapechanger' }),
      T_DEVILS_SIGHT,
      T_MAGIC_RESIST,
    ],
    actions: [
      melee('Sting', 5, '1d4+3', 'piercing', {
        save: { ability: 'con', dc: 11, onSuccess: 'half' },
        effects: [{ kind: 'damage', dice: '3d6', type: 'poison' }],
      }),
      util('Invisibility', {
        desc: "It turns invisible, along with anything it carries, until it attacks or ends the effect.",
        effects: [{ kind: 'buff', id: 'invisible' }],
        ai: { role: 'utility', weight: 1.5 },
      }),
    ],
    ai: { archetype: 'ambusher', aggression: 0.6, selfPreserve: 0.9, preferredRange: 5 },
    loot: { gold: '4d10', table: [['gem-ruby', 0.06], ['parchment', 0.3], ['scroll-1', 0.1]] },
    sprite: 'imp', biomes: ['dungeon', 'ruins', 'city', 'crypt'], groupSize: [1, 2],
    faction: 'fiend',
  }),

  mon('quasit', 'Quasit', {
    desc: "A demonic familiar the size of a cat, all wings and spite, that scares its master's enemies into fits and then laughs about it for a tenday.",
    cr: 1, type: 'fiend', subtype: 'demon', size: 'tiny', ac: 13, hpDice: '7d4+7',
    speed: 40, abilities: { str: 5, dex: 17, con: 12, int: 7, wis: 10, cha: 10 },
    skills: { stealth: 5 }, senses: { darkvision: 120 }, languages: ['Abyssal', 'Common'],
    resist: ['cold', 'fire', 'lightning', 'nonmagical-physical'], immune: ['poison'],
    condImmune: ['poisoned'],
    traits: [
      trait('Shapechanger', "It becomes a bat, a centipede or a toad at will, keeping its statistics.", { passive: 'shapechanger' }),
      T_MAGIC_RESIST,
    ],
    actions: [
      melee('Claw', 4, '1d4+3', 'slashing', {
        save: { ability: 'con', dc: 10, onSuccess: 'half' },
        effects: [{ kind: 'damage', dice: '2d4', type: 'poison' }],
        desc: "Only in its true form.",
      }),
      saveAct('Scare', {
        range: [20, 20],
        uses: { max: 1, recharge: 'long' },
        save: { ability: 'wis', dc: 10, onSuccess: 'negate', repeatEachTurn: true },
        effects: [{ kind: 'condition', id: 'frightened', duration: '1 minute' }],
        desc: "It shows a creature something it will not describe afterward.",
        ai: { role: 'debuff', weight: 1.5 },
      }),
      util('Invisibility', {
        desc: "It vanishes, gear and all, until it attacks or ends the effect.",
        effects: [{ kind: 'buff', id: 'invisible' }],
        ai: { role: 'utility', weight: 1.5 },
      }),
    ],
    ai: { archetype: 'skirmisher', aggression: 0.6, selfPreserve: 0.9, preferredRange: 5 },
    loot: { gold: '3d10', table: [['gem-onyx', 0.1], ['poison-basic', 0.12]] },
    sprite: 'quasit', biomes: ['dungeon', 'ruins', 'crypt', 'underdark'], groupSize: [1, 2],
    faction: 'fiend',
  }),

  mon('hell-hound', 'Hell Hound', {
    desc: "A coal-black mastiff with embers where its eyes should be, hunting in packs for whatever devil owns its leash. Its breath sets a shield wall alight.",
    cr: 3, type: 'fiend', subtype: 'devil', size: 'medium', ac: 15, acNote: 'natural armor',
    hpDice: '7d8+14', speed: 50, abilities: { str: 17, dex: 12, con: 14, int: 6, wis: 13, cha: 6 },
    skills: { perception: 5 }, senses: { darkvision: 60 }, languages: ['Infernal'],
    immune: ['fire'],
    traits: [T_KEEN_HEAR_SMELL, T_PACK_TACTICS],
    actions: [
      melee('Bite', 5, '1d8+3', 'piercing', { effects: [{ kind: 'damage', dice: '2d6', type: 'fire' }] }),
      saveAct('Fire Breath', {
        target: { kind: 'cone', length: 15 },
        save: { ability: 'dex', dc: 12, onSuccess: 'half' },
        dice: '6d6', dtype: 'fire',
        uses: { max: 1, recharge: '5-6' },
        desc: "A 15-foot cone of hellfire that leaves the stone glowing.",
        ai: { role: 'aoe', weight: 2 },
      }),
    ],
    ai: { archetype: 'brute', aggression: 0.85, selfPreserve: 0.3, preferredRange: 5 },
    loot: { gold: '4d10', table: [['gem-ruby', 0.08], ['potion-fire-breath', 0.1], ['gem-onyx', 0.15]] },
    sprite: 'hell-hound', biomes: ['dungeon', 'ruins', 'ash-waste', 'mountain', 'crypt'], groupSize: [2, 4],
    faction: 'fiend',
  }),
);

// ===========================================================================
// MEPHITS — elemental vermin from cracked binding circles, steam vents and
// the flooded lower galleries of the Phandelver mines.
// ===========================================================================

ALL.push(
  mon('mud-mephit', 'Mud Mephit', {
    desc: "A wet, sulking lump of animate silt that gurgles insults and bursts into a spray of muck when killed.",
    cr: 0.25, type: 'elemental', size: 'small', ac: 11, hpDice: '6d6+6',
    speed: 20, fly: 20, swim: 20, abilities: { str: 8, dex: 12, con: 12, int: 9, wis: 11, cha: 7 },
    skills: { stealth: 3 }, senses: { darkvision: 60 }, languages: ['Aquan', 'Terran'],
    immune: ['poison'], condImmune: ['poisoned'],
    traits: [
      trait('Death Burst', "It bursts on death; every creature within 5 feet must make a DC 11 Dexterity save or be restrained by hardening mud.", { passive: 'death-burst:mud:11:5' }),
      trait('False Appearance', "Still, it is a heap of wet mud and nothing else.", { passive: 'false-appearance' }),
    ],
    actions: [
      melee('Fists', 3, '1d4+1', 'bludgeoning'),
      saveAct('Mud Breath', {
        uses: { max: 1, recharge: '6' },
        target: { kind: 'creature', count: 1 }, range: [5, 5],
        save: { ability: 'dex', dc: 11, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'restrained', duration: '1 minute' }],
        desc: "It spits a gout of clinging mud over a creature within 5 feet.",
        ai: { role: 'control', weight: 1.4 },
      }),
    ],
    ai: { archetype: 'skirmisher', aggression: 0.6, selfPreserve: 0.5, preferredRange: 5 },
    sprite: 'mephit', tint: '#6b5236', biomes: ['marsh', 'cave', 'mine', 'dungeon', 'underdark'], groupSize: [2, 4],
  }),

  mon('steam-mephit', 'Steam Mephit', {
    desc: "A hissing scald of vapour with a face, forever cheerful about scalding people. It collects in the flooded shafts where hot springs meet cold water.",
    cr: 0.25, type: 'elemental', size: 'small', ac: 10, hpDice: '6d6',
    speed: 30, fly: 30, abilities: { str: 5, dex: 11, con: 10, int: 11, wis: 10, cha: 12 },
    senses: { darkvision: 60 }, languages: ['Aquan', 'Ignan'],
    immune: ['fire', 'poison'], condImmune: ['poisoned'],
    traits: [trait('Death Burst', "It explodes in a cloud of steam; every creature within 5 feet takes 1d8 fire on a failed DC 10 Dexterity save.", { passive: 'death-burst:fire:1d8:10:5' })],
    actions: [
      melee('Claws', 2, '1d4', 'slashing', { effects: [{ kind: 'damage', dice: '1d4', type: 'fire' }] }),
      saveAct('Steam Breath', {
        uses: { max: 1, recharge: '6' },
        target: { kind: 'cone', length: 15 },
        save: { ability: 'dex', dc: 10, onSuccess: 'half' },
        dice: '2d6', dtype: 'fire',
        ai: { role: 'aoe', weight: 1.5 },
      }),
    ],
    ai: { archetype: 'skirmisher', aggression: 0.6, selfPreserve: 0.5, preferredRange: 5 },
    sprite: 'mephit', tint: '#d8e4ea', biomes: ['cave', 'mine', 'dungeon', 'underdark', 'ash-waste'], groupSize: [2, 4],
  }),

  mon('dust-mephit', 'Dust Mephit', {
    desc: "A cloud of grit shaped like a spiteful little imp. It blinds you first and mocks you afterward.",
    cr: 0.5, type: 'elemental', size: 'small', ac: 12, hpDice: '5d6',
    speed: 30, fly: 30, abilities: { str: 5, dex: 14, con: 10, int: 9, wis: 11, cha: 10 },
    skills: { perception: 2, stealth: 4 }, senses: { darkvision: 60 }, languages: ['Auran', 'Terran'],
    immune: ['poison'], condImmune: ['poisoned'],
    traits: [trait('Death Burst', "It bursts into a cloud of dust; every creature within 5 feet must make a DC 10 Constitution save or be blinded for a minute.", { passive: 'death-burst:blind:10:5' })],
    actions: [
      melee('Claws', 4, '1d4+2', 'slashing'),
      saveAct('Blinding Breath', {
        uses: { max: 1, recharge: '6' },
        target: { kind: 'cone', length: 15 },
        save: { ability: 'con', dc: 10, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'blinded', duration: '1 minute' }],
        ai: { role: 'debuff', weight: 1.6 },
      }),
      util('Blur', {
        uses: { max: 1, recharge: 'long' },
        effects: [{ kind: 'buff', id: 'blur' }],
        desc: "Its outline smears; attacks against it have disadvantage for a minute.",
        ai: { role: 'buff', weight: 1.2 },
      }),
    ],
    ai: { archetype: 'skirmisher', aggression: 0.6, selfPreserve: 0.6, preferredRange: 5 },
    sprite: 'mephit', tint: '#a8a094', biomes: ['ash-waste', 'cave', 'ruins', 'dungeon', 'mine'], groupSize: [2, 4],
  }),

  mon('magma-mephit', 'Magma Mephit', {
    desc: "A crust of cooling basalt with fire showing through the cracks, born where Mount Hotenow's heat still runs under the Neverwinter Wood.",
    cr: 0.5, type: 'elemental', size: 'small', ac: 11, hpDice: '5d6+5',
    speed: 30, fly: 30, abilities: { str: 8, dex: 12, con: 12, int: 7, wis: 10, cha: 10 },
    skills: { stealth: 3 }, senses: { darkvision: 60 }, languages: ['Ignan', 'Terran'],
    vuln: ['cold'], immune: ['fire', 'poison'], condImmune: ['poisoned'],
    traits: [
      trait('Death Burst', "It explodes in a gout of lava; every creature within 5 feet takes 1d8 fire on a failed DC 11 Dexterity save.", { passive: 'death-burst:fire:1d8:11:5' }),
      trait('False Appearance', "Motionless, it is a lump of cooling magma.", { passive: 'false-appearance' }),
      trait('Heated Body', "Anything that touches it or hits it in melee takes 1d4 fire.", { passive: 'heated-body:1d4' }),
    ],
    actions: [
      melee('Claws', 3, '1d4+1', 'slashing', { effects: [{ kind: 'damage', dice: '1d4', type: 'fire' }] }),
      saveAct('Fire Breath', {
        uses: { max: 1, recharge: '6' },
        target: { kind: 'cone', length: 15 },
        save: { ability: 'dex', dc: 11, onSuccess: 'half' },
        dice: '2d6', dtype: 'fire',
        ai: { role: 'aoe', weight: 1.6 },
      }),
      util('Heat Metal', {
        uses: { max: 1, recharge: 'long' },
        effects: [{ kind: 'utility', tag: 'heat-metal' }],
        desc: "It heats a metal object it can see until the bearer must drop it or burn.",
        ai: { role: 'debuff', weight: 1.3 },
      }),
    ],
    ai: { archetype: 'skirmisher', aggression: 0.7, selfPreserve: 0.4, preferredRange: 5 },
    sprite: 'mephit', tint: '#d4622a', biomes: ['ash-waste', 'cave', 'mountain', 'mine', 'underdark'], groupSize: [2, 4],
  }),

  mon('ice-mephit', 'Ice Mephit', {
    desc: "A brittle, sneering shard of animate frost out of the Icespire slopes. It shatters into knives when killed, which is entirely deliberate.",
    cr: 0.5, type: 'elemental', size: 'small', ac: 11, hpDice: '6d6',
    speed: 30, fly: 30, abilities: { str: 7, dex: 13, con: 10, int: 9, wis: 11, cha: 12 },
    skills: { perception: 2, stealth: 3 }, senses: { darkvision: 60 }, languages: ['Aquan', 'Auran'],
    vuln: ['bludgeoning', 'fire'], immune: ['cold', 'poison'], condImmune: ['poisoned'],
    traits: [
      trait('Death Burst', "It shatters into shards of ice; every creature within 5 feet takes 1d8 slashing on a failed DC 10 Dexterity save.", { passive: 'death-burst:slashing:1d8:10:5' }),
      trait('False Appearance', "Still, it is an ordinary spar of ice.", { passive: 'false-appearance' }),
    ],
    actions: [
      melee('Claws', 3, '1d4+1', 'slashing', { effects: [{ kind: 'damage', dice: '1d4', type: 'cold' }] }),
      saveAct('Frost Breath', {
        uses: { max: 1, recharge: '6' },
        target: { kind: 'cone', length: 15 },
        save: { ability: 'dex', dc: 10, onSuccess: 'half' },
        dice: '2d4', dtype: 'cold',
        ai: { role: 'aoe', weight: 1.5 },
      }),
      util('Fog Cloud', {
        uses: { max: 1, recharge: 'long' },
        effects: [{ kind: 'utility', tag: 'fog-cloud' }],
        desc: "A 20-foot sphere of freezing fog that blinds everything inside it.",
        ai: { role: 'control', weight: 1.3 },
      }),
    ],
    ai: { archetype: 'skirmisher', aggression: 0.6, selfPreserve: 0.5, preferredRange: 5 },
    sprite: 'mephit', tint: '#a8d8ea', biomes: ['tundra', 'mountain', 'cave', 'dungeon'], groupSize: [2, 4],
  }),
);

// ===========================================================================
// FEY & ODDITIES — the older residents of Neverwinter Wood, and the lights
// that lead travellers off the causeway in the Mere of Dead Men.
// ===========================================================================

ALL.push(
  mon('blink-dog', 'Blink Dog', {
    desc: "A golden-furred hound of the wood that vanishes mid-stride and reappears behind its quarry. They hate lolth-spawn and warn rangers of worse things coming.",
    cr: 0.25, type: 'fey', size: 'medium', ac: 13, hpDice: '4d8+4',
    speed: 40, abilities: { str: 12, dex: 17, con: 12, int: 10, wis: 13, cha: 11 },
    skills: { perception: 3, stealth: 5 }, languages: ['Blink Dog', 'Sylvan'],
    traits: [T_KEEN_HEAR_SMELL],
    actions: [melee('Bite', 4, '1d6+3', 'piercing')],
    bonusActions: [util('Teleport', {
      desc: "It blinks up to 40 feet to an unoccupied space it can see.",
      effects: [{ kind: 'teleport', distance: 40 }],
      ai: { role: 'utility', weight: 1.4 },
    })],
    ai: { archetype: 'skirmisher', aggression: 0.5, selfPreserve: 0.8, preferredRange: 5 },
    sprite: 'blink-dog', biomes: ['forest', 'pine-forest', 'plains', 'hills'], groupSize: [2, 4],
  }),

  mon('sprite', 'Sprite', {
    desc: "A hand-tall guardian of the deep glades with a needle-sword and a poisoned bow. It can read the good and evil in a heart at a glance and is not shy about the verdict.",
    cr: 0.25, type: 'fey', size: 'tiny', ac: 15, acNote: 'leather armor',
    hpDice: '1d4', speed: 10, fly: 40,
    abilities: { str: 3, dex: 18, con: 10, int: 14, wis: 13, cha: 11 },
    skills: { perception: 3, stealth: 8 }, languages: ['Common', 'Elvish', 'Sylvan'],
    traits: [trait('Heart Sight', "A touch tells it a creature's true intentions and alignment.", { passive: 'heart-sight' })],
    actions: [
      melee('Longsword', 2, '1', 'slashing'),
      ranged('Shortbow', 6, '1', 'piercing', [40, 160], {
        save: { ability: 'con', dc: 10, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'poisoned', duration: '1 minute' }],
        desc: "The arrow is a thorn dipped in sleep-venom; a victim reduced to 0 by it merely sleeps.",
      }),
      util('Invisibility', {
        effects: [{ kind: 'buff', id: 'invisible' }],
        desc: "It vanishes until it attacks or casts.",
        ai: { role: 'utility', weight: 1.4 },
      }),
    ],
    ai: { archetype: 'archer', aggression: 0.4, selfPreserve: 0.9, preferredRange: 40 },
    sprite: 'sprite', biomes: ['forest', 'pine-forest', 'plains'], groupSize: [2, 5],
  }),

  mon('pixie', 'Pixie', {
    desc: "A speck of laughter and dragonfly wings, invisible unless it chooses otherwise. It will polymorph a knight into a toad and consider the matter settled.",
    cr: 0.25, type: 'fey', size: 'tiny', ac: 15, hpDice: '1d4-1',
    speed: 10, fly: 30, abilities: { str: 2, dex: 20, con: 8, int: 10, wis: 14, cha: 15 },
    skills: { perception: 4, stealth: 7 }, languages: ['Sylvan'],
    traits: [
      T_MAGIC_RESIST,
      trait('Superior Invisibility', "It is invisible as a matter of course, and stays invisible while it acts and casts.", { passive: 'superior-invisibility' }),
    ],
    actions: [
      saveAct('Confusion', {
        range: [90, 90],
        uses: { max: 1, recharge: 'long' },
        save: { ability: 'wis', dc: 12, onSuccess: 'negate', repeatEachTurn: true },
        effects: [{ kind: 'condition', id: 'confused', duration: '1 minute' }],
        ai: { role: 'control', weight: 1.7 },
      }),
      saveAct('Sleep', {
        range: [90, 90],
        uses: { max: 1, recharge: 'long' },
        save: { ability: 'wis', dc: 12, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'unconscious', duration: '1 minute' }],
        ai: { role: 'control', weight: 1.9 },
      }),
      saveAct('Entangle', {
        range: [90, 90],
        uses: { max: 1, recharge: 'long' },
        save: { ability: 'str', dc: 12, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'restrained', duration: '1 minute' }],
        ai: { role: 'control', weight: 1.4 },
      }),
    ],
    ai: { archetype: 'caster', aggression: 0.3, selfPreserve: 0.95, preferredRange: 60 },
    sprite: 'pixie', biomes: ['forest', 'pine-forest', 'plains', 'hills'], groupSize: [2, 6],
  }),

  mon('pseudodragon', 'Pseudodragon', {
    desc: "A cat-sized dragon with a scorpion's tail and opinions about everything. Wizards court them as familiars; the courting usually goes badly at first.",
    cr: 0.25, type: 'dragon', size: 'tiny', ac: 13, acNote: 'natural armor',
    hpDice: '2d4+2', speed: 15, fly: 60,
    abilities: { str: 6, dex: 15, con: 13, int: 10, wis: 12, cha: 10 },
    skills: { perception: 3, stealth: 4 }, senses: { blindsight: 10, darkvision: 60 },
    languages: ['Common', 'Draconic'],
    traits: [
      trait('Keen Senses', "Sight, hearing and scent are all uncannily sharp.", { passive: 'keen-senses', skillProf: ['perception'] }),
      T_MAGIC_RESIST,
      trait('Limited Telepathy', "It shares simple ideas and images with anything within 100 feet.", { passive: 'limited-telepathy:100' }),
    ],
    actions: [
      melee('Bite', 4, '1d4+2', 'piercing'),
      melee('Sting', 4, '1d4+2', 'piercing', {
        save: { ability: 'con', dc: 11, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'poisoned', duration: '1 hour' }],
        desc: "A badly failed save leaves the victim unconscious for the hour instead.",
      }),
    ],
    ai: { archetype: 'skirmisher', aggression: 0.4, selfPreserve: 0.9, preferredRange: 5 },
    loot: { gold: '2d10', table: [['gem-quartz', 0.15], ['gem-amber', 0.1]] },
    sprite: 'pseudodragon', biomes: ['forest', 'hills', 'ruins', 'cave'], groupSize: [1, 2],
  }),

  mon('satyr', 'Satyr', {
    desc: "Goat-legged, wine-flushed, and lethal with a shortbow when the mood turns. It would far rather challenge you to a drinking contest than a duel.",
    cr: 0.5, type: 'fey', size: 'medium', ac: 14, acNote: 'leather armor',
    hpDice: '7d8', speed: 40, abilities: { str: 12, dex: 16, con: 11, int: 12, wis: 10, cha: 14 },
    skills: { perception: 2, performance: 6, stealth: 5 }, languages: ['Common', 'Elvish', 'Sylvan'],
    traits: [T_MAGIC_RESIST],
    actions: [
      melee('Ram', 3, '2d4+1', 'bludgeoning'),
      melee('Shortsword', 5, '1d6+3', 'piercing'),
      ranged('Shortbow', 5, '1d6+3', 'piercing', [80, 320]),
    ],
    ai: { archetype: 'skirmisher', aggression: 0.5, selfPreserve: 0.7, preferredRange: 40 },
    loot: { gold: '3d10', table: [['pan-flute', 0.25], ['evermead', 0.15], ['shortbow', 0.2], ['zzar', 0.15]] },
    sprite: 'satyr', biomes: ['forest', 'pine-forest', 'plains', 'hills'], groupSize: [1, 4],
  }),

  mon('dryad', 'Dryad', {
    desc: "The soul of an oak, walking. Harm her tree and the whole grove turns; leave it be and she may simply ask you, very reasonably, to go.",
    cr: 1, type: 'fey', size: 'medium', ac: 11, acNote: '16 with barkskin',
    hpDice: '5d8', speed: 30, abilities: { str: 10, dex: 12, con: 11, int: 14, wis: 15, cha: 18 },
    skills: { perception: 4, stealth: 5 }, senses: { darkvision: 60 },
    languages: ['Elvish', 'Sylvan'],
    traits: [
      T_MAGIC_RESIST,
      trait('Speak with Beasts and Plants', "Every living thing in the grove will talk to her.", { passive: 'speak-with-beasts-and-plants' }),
      trait('Tree Stride', "She steps into one living tree and out of another within 60 feet.", { passive: 'tree-stride:60' }),
    ],
    actions: [
      melee('Club', 2, '1d4', 'bludgeoning', { desc: "1d8+4 with shillelagh, and the club strikes as a magic weapon." }),
      saveAct('Fey Charm', {
        range: [30, 30],
        save: { ability: 'wis', dc: 14, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'charmed', duration: '24 hours' }],
        uses: { max: 1, recharge: 'short' },
        desc: "A humanoid or beast regards her as a trusted friend until she or her allies harm it.",
        ai: { role: 'control', weight: 1.8 },
      }),
      saveAct('Entangle', {
        range: [90, 90],
        uses: { max: 3, recharge: 'long' },
        save: { ability: 'str', dc: 14, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'restrained', duration: '1 minute' }],
        ai: { role: 'control', weight: 1.5 },
      }),
    ],
    bonusActions: [util('Barkskin', {
      uses: { max: 1, recharge: 'long' },
      effects: [{ kind: 'buff', id: 'barkskin', ac: 16 }],
      desc: "Her skin roughens to bark; her AC cannot be less than 16 for the hour.",
      ai: { role: 'buff', weight: 1.5 },
    })],
    ai: { archetype: 'caster', aggression: 0.4, selfPreserve: 0.7, preferredRange: 30 },
    loot: { gold: '2d10', table: [['goodberry-preserve', 0.3], ['herbalism-kit', 0.15], ['druidic-focus', 0.15]] },
    sprite: 'dryad', biomes: ['forest', 'pine-forest', 'hills'], groupSize: [1, 2],
  }),

  mon('will-o-wisp', "Will-o'-Wisp", {
    desc: "A pale lantern-light bobbing over the Mere of Dead Men, offering the way to solid ground. It has been offering that way for four hundred years and the bog is full of the people who took it.",
    cr: 2, type: 'undead', size: 'tiny', ac: 19, hpDice: '9d4',
    speed: 0, fly: 50, hover: true,
    abilities: { str: 1, dex: 28, con: 10, int: 13, wis: 14, cha: 11 },
    senses: { darkvision: 120 }, languages: ['Common'],
    resist: ['acid', 'cold', 'fire', 'necrotic', 'thunder', 'nonmagical-physical'],
    immune: ['lightning', 'poison'],
    condImmune: ['exhaustion', 'grappled', 'paralyzed', 'poisoned', 'prone', 'restrained', 'unconscious'],
    traits: [
      T_UNDEAD_NATURE,
      trait('Consume Life', "It can drain a creature already at 0 hit points, killing it outright and healing itself 10 hit points.", { passive: 'consume-life:10' }),
      trait('Ephemeral', "It cannot wear or carry anything at all.", { passive: 'ephemeral' }),
      T_INCORPOREAL,
      trait('Variable Illumination', "It sheds light between dim and bright at will, and can go out entirely.", { passive: 'variable-illumination' }),
    ],
    actions: [
      melee('Shock', 4, '2d8', 'lightning'),
      util('Invisibility', {
        desc: "It winks out, invisible until it attacks or uses its light.",
        effects: [{ kind: 'buff', id: 'invisible' }],
        ai: { role: 'utility', weight: 1.6 },
      }),
    ],
    ai: { archetype: 'skirmisher', aggression: 0.7, selfPreserve: 0.9, preferredRange: 5 },
    sprite: 'will-o-wisp', biomes: ['marsh', 'ruins', 'crypt', 'coast', 'forest'], groupSize: [1, 3],
    faction: 'undead',
  }),
);

// ===========================================================================
// THE ICESPIRE SLOPES — cold-country predators that follow the snowline down
// the Sword Mountains in a hard winter.
// ===========================================================================

ALL.push(
  mon('winter-wolf', 'Winter Wolf', {
    desc: "A white-furred wolf the size of a warhorse, clever enough to speak and cruel enough to enjoy it. Frost giants keep them; around Icespire Peak they keep themselves.",
    cr: 3, type: 'monstrosity', size: 'large', ac: 13, acNote: 'natural armor',
    hpDice: '10d10+20', speed: 50, abilities: { str: 18, dex: 13, con: 14, int: 7, wis: 12, cha: 8 },
    skills: { perception: 5, stealth: 3 }, languages: ['Common', 'Giant', 'Winter Wolf'],
    immune: ['cold'],
    traits: [T_KEEN_HEAR_SMELL, T_PACK_TACTICS,
      trait('Snow Camouflage', "Against snow and ice it is very nearly invisible until it moves.", { passive: 'snow-camouflage', skillProf: ['stealth'] })],
    actions: [
      melee('Bite', 6, '2d6+4', 'piercing', {
        save: { ability: 'str', dc: 14, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'prone' }],
      }),
      saveAct('Cold Breath', {
        target: { kind: 'cone', length: 15 },
        save: { ability: 'dex', dc: 12, onSuccess: 'half' },
        dice: '4d8', dtype: 'cold',
        uses: { max: 1, recharge: '5-6' },
        desc: "A 15-foot cone of killing frost that rimes the ground white.",
        ai: { role: 'aoe', weight: 2 },
      }),
    ],
    ai: { archetype: 'brute', aggression: 0.85, selfPreserve: 0.4, preferredRange: 5 },
    loot: { gold: '4d10', table: [['gem-moonstone', 0.12], ['potion-resistance', 0.08], ['rations', 0.3]] },
    sprite: 'wolf', tint: '#dce8f2', biomes: ['tundra', 'mountain', 'pine-forest'], groupSize: [2, 4],
  }),
);

// ===========================================================================
// THE TOP OF THE BAND — CR 3 and 4 threats: wyrmlings out of Thundertree and
// Icespire, Wave Echo Cave's guardians, and the things that hunt the Wood.
// ===========================================================================

ALL.push(
  mon('vulture', 'Vulture', {
    desc: "A bald, patient scavenger circling the Triboar Trail. Where three of them are turning, somebody's caravan stopped moving.",
    cr: 0, type: 'beast', size: 'medium', ac: 10, hpDice: '1d8+1',
    speed: 10, fly: 50, abilities: { str: 7, dex: 10, con: 13, int: 2, wis: 12, cha: 4 },
    skills: { perception: 3 },
    traits: [T_KEEN_SMELL, T_PACK_TACTICS],
    actions: [melee('Beak', 2, '1d4', 'piercing')],
    ai: { archetype: 'skirmisher', aggression: 0.3, selfPreserve: 0.9, preferredRange: 5 },
    sprite: 'vulture', biomes: ['plains', 'road', 'hills', 'ruins', 'mountain'], groupSize: [2, 5],
  }),

  mon('giant-owl', 'Giant Owl', {
    desc: "A silent nine-foot wingspan over the Neverwinter Wood, old friend to elves and rangers. It speaks Sylvan and judges you quietly.",
    cr: 0.25, type: 'beast', size: 'large', ac: 12, hpDice: '3d10',
    speed: 5, fly: 60, abilities: { str: 13, dex: 15, con: 12, int: 8, wis: 13, cha: 10 },
    skills: { perception: 5, stealth: 4 }, senses: { darkvision: 120 },
    languages: ['Sylvan'],
    traits: [
      trait('Flyby', "It does not provoke an opportunity attack when it flies out of reach.", { passive: 'flyby' }),
      trait('Keen Hearing and Sight', "It hunts by ear in total darkness.", { passive: 'keen-hearing-and-sight', skillProf: ['perception'] }),
    ],
    actions: [melee('Talons', 3, '2d6', 'slashing')],
    ai: { archetype: 'skirmisher', aggression: 0.4, selfPreserve: 0.8, preferredRange: 5 },
    sprite: 'giant-owl', biomes: ['forest', 'pine-forest', 'hills', 'tundra'], groupSize: [1, 2],
  }),

  mon('drow', 'Drow', {
    desc: "A dark elf of the Underdark cities, hand-crossbow loaded with sleep-venom. Nezznar the Black Spider does not travel without a few.",
    cr: 0.25, type: 'humanoid', subtype: 'elf', size: 'medium', ac: 15, acNote: 'chain shirt',
    hpDice: '3d8', speed: 30, abilities: { str: 10, dex: 14, con: 10, int: 11, wis: 11, cha: 12 },
    skills: { perception: 2, stealth: 4 }, senses: { darkvision: 120 },
    languages: ['Elvish', 'Undercommon'],
    traits: [
      T_SUNLIGHT_SENS,
      trait('Fey Ancestry', "Charm slides off it, and it cannot be put magically to sleep.", { passive: 'fey-ancestry', advSaveVs: ['charmed'], condImmune: ['magical-sleep'] }),
      trait('Innate Spellcasting', "It calls up dancing lights at will, and once a day each faerie fire and darkness.", { passive: 'innate-spellcasting:drow:cha:11' }),
    ],
    actions: [
      melee('Shortsword', 4, '1d6+2', 'piercing'),
      ranged('Hand Crossbow', 4, '1d6+2', 'piercing', [30, 120], {
        save: { ability: 'con', dc: 13, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'poisoned', duration: '1 hour' }],
        desc: "The bolt is dipped in drow sleep-poison; a badly failed save leaves the target unconscious.",
      }),
      saveAct('Darkness', {
        uses: { max: 1, recharge: 'long' },
        target: { kind: 'sphere', radius: 15 },
        effects: [{ kind: 'utility', tag: 'magical-darkness' }],
        desc: "A sphere of lightless dark that even darkvision cannot pierce.",
        ai: { role: 'control', weight: 1.4 },
      }),
    ],
    ai: { archetype: 'archer', aggression: 0.6, selfPreserve: 0.8, preferredRange: 60 },
    loot: { gold: '4d6', table: [['hand-crossbow', 0.15], ['shortsword', 0.2], ['poison-basic', 0.15], ['gem-onyx', 0.12], ['chain-shirt', 0.08]] },
    sprite: 'drow', biomes: ['underdark', 'cave', 'dungeon', 'mine', 'ruins'], groupSize: [2, 5],
    faction: 'drow',
  }),

  mon('scarecrow', 'Scarecrow', {
    desc: "Straw, sackcloth and a murdered soul stitched in behind the button eyes. It stands in the field until the moment it does not.",
    cr: 1, type: 'construct', size: 'medium', ac: 11, hpDice: '5d8+10',
    speed: 30, abilities: { str: 11, dex: 13, con: 11, int: 10, wis: 10, cha: 13 },
    senses: { darkvision: 60 }, languages: ['Common'],
    vuln: ['fire'], immune: ['poison'],
    condImmune: ['charmed', 'exhaustion', 'frightened', 'paralyzed', 'petrified', 'poisoned'],
    traits: [
      T_CONSTRUCT_NATURE,
      trait('False Appearance', "On its pole in the field it is a scarecrow and nothing more.", { passive: 'false-appearance' }),
    ],
    actions: [
      multi("It rakes with both claws.", [['claw', 2]]),
      melee('Claw', 3, '1d4+1', 'slashing'),
      saveAct('Terrifying Glare', {
        range: [30, 30],
        save: { ability: 'wis', dc: 11, onSuccess: 'negate', repeatEachTurn: true },
        effects: [{ kind: 'condition', id: 'frightened', duration: '1 minute' }, { kind: 'condition', id: 'paralyzed' }],
        desc: "It turns those button eyes on you, and for a moment you cannot move at all.",
        ai: { role: 'control', weight: 1.7 },
      }),
    ],
    ai: { archetype: 'ambusher', aggression: 0.7, selfPreserve: 0.3, preferredRange: 5 },
    loot: { gold: '2d10', table: [['clothes-traveler', 0.2]] },
    sprite: 'scarecrow', biomes: ['plains', 'ruins', 'road', 'forest'], groupSize: [1, 3],
  }),

  mon('giant-vulture', 'Giant Vulture', {
    desc: "Big enough to carry off a goat and mean enough to make its own carrion. Gnoll camps below Wyvern Tor tolerate them as sentries.",
    cr: 1, type: 'beast', size: 'large', ac: 10, hpDice: '5d10',
    speed: 10, fly: 60, abilities: { str: 15, dex: 10, con: 15, int: 6, wis: 12, cha: 7 },
    skills: { perception: 3 }, languages: [],
    resist: ['necrotic', 'poison'],
    traits: [T_KEEN_SMELL, T_PACK_TACTICS],
    actions: [
      multi("It bites and rakes with its talons.", [['beak', 1], ['talons', 1]]),
      melee('Beak', 4, '1d6+2', 'piercing'),
      melee('Talons', 4, '2d4+2', 'slashing'),
    ],
    ai: { archetype: 'skirmisher', aggression: 0.5, selfPreserve: 0.7, preferredRange: 5 },
    sprite: 'vulture', tint: '#6b5a4a', biomes: ['plains', 'hills', 'mountain', 'ruins'], groupSize: [2, 4],
  }),

  mon('swarm-of-quippers', 'Swarm of Quippers', {
    desc: "The water goes silver, then red. Quippers are small, toothy, and utterly unreasonable about blood in the Mere.",
    cr: 1, type: 'beast', subtype: 'swarm', size: 'medium', ac: 13, hpDice: '7d8-7',
    speed: 0, swim: 40, abilities: { str: 13, dex: 16, con: 9, int: 1, wis: 7, cha: 2 },
    senses: { darkvision: 60 },
    resist: ['bludgeoning', 'piercing', 'slashing'], condImmune: SWARM_COND,
    traits: [
      T_SWARM,
      trait('Blood Frenzy', "It attacks a wounded creature with advantage, and cannot be talked out of it.", { passive: 'blood-frenzy' }),
      trait('Water Breathing', "It can breathe only underwater.", { passive: 'water-breathing' }),
    ],
    actions: [melee('Bites', 5, '4d6', 'piercing', { desc: "Damage halves to 2d6 once the swarm is bloodied." })],
    ai: { archetype: 'swarm', aggression: 0.9, selfPreserve: 0.1, preferredRange: 5 },
    sprite: 'swarm-quippers', biomes: ['marsh', 'coast', 'cave', 'underdark'], groupSize: [1, 2],
  }),

  mon('griffon', 'Griffon', {
    desc: "Eagle before, lion behind, and a temper suited to neither. They nest on the crags of the Sword Mountains and consider horses a delicacy.",
    cr: 2, type: 'monstrosity', size: 'large', ac: 12, hpDice: '7d10+21',
    speed: 30, fly: 80, abilities: { str: 18, dex: 15, con: 16, int: 2, wis: 13, cha: 8 },
    skills: { perception: 5 }, senses: { darkvision: 60 },
    traits: [trait('Keen Sight', "It picks a rider out of a valley from a thousand feet up.", { passive: 'keen-sight', skillProf: ['perception'] })],
    actions: [
      multi("It snaps with its beak and rakes with its claws.", [['beak', 1], ['claws', 1]]),
      melee('Beak', 6, '1d8+4', 'piercing'),
      melee('Claws', 6, '2d6+4', 'slashing'),
    ],
    ai: { archetype: 'skirmisher', aggression: 0.7, selfPreserve: 0.5, preferredRange: 5 },
    loot: { gold: '3d10', table: [['gem-amber', 0.12], ['rations', 0.3]] },
    sprite: 'griffon', biomes: ['mountain', 'hills', 'tundra', 'plains'], groupSize: [1, 3],
  }),

  mon('white-dragon-wyrmling', 'White Dragon Wyrmling', {
    desc: "A hatchling out of Icespire Peak, no bigger than a pony and already convinced the mountain belongs to it. Cryovain has left brood in three valleys.",
    cr: 2, type: 'dragon', size: 'medium', ac: 16, acNote: 'natural armor',
    hpDice: '5d8+10', speed: 30, fly: 60, burrow: 15, swim: 30,
    abilities: { str: 14, dex: 10, con: 14, int: 5, wis: 10, cha: 11 },
    saveProf: ['dex', 'con', 'wis', 'cha'], skills: { perception: 4, stealth: 2 },
    senses: { darkvision: 60, blindsight: 10 }, languages: ['Draconic'],
    immune: ['cold'],
    traits: [trait('Ice Walk', "It crosses ice and snow without slowing and needs no footing check.", { passive: 'ice-walk' })],
    actions: [
      melee('Bite', 4, '1d10+2', 'piercing', { effects: [{ kind: 'damage', dice: '1d4', type: 'cold' }] }),
      saveAct('Cold Breath', {
        target: { kind: 'cone', length: 15 },
        save: { ability: 'con', dc: 12, onSuccess: 'half' },
        dice: '5d8', dtype: 'cold',
        uses: { max: 1, recharge: '5-6' },
        desc: "A 15-foot cone of glacial air that frosts steel brittle.",
        ai: { role: 'aoe', weight: 2.2 },
      }),
    ],
    ai: { archetype: 'boss', aggression: 0.8, selfPreserve: 0.5, preferredRange: 15 },
    loot: { gold: '4d6*10', table: [['gem-moonstone', 0.25], ['gem-diamond', 0.05], ['potion-resistance', 0.15], ['gem-quartz', 0.3]] },
    sprite: 'dragon-wyrmling', tint: '#cfe4f2', biomes: ['tundra', 'mountain', 'cave'], groupSize: [1, 1],
    elite: true,
  }),

  mon('green-dragon-wyrmling', 'Green Dragon Wyrmling', {
    desc: "A hatchling of Kryptgarden stock, already learning that a lie works better than a claw. Venomfang's tower at Thundertree has hosted more than one.",
    cr: 2, type: 'dragon', size: 'medium', ac: 17, acNote: 'natural armor',
    hpDice: '6d8+12', speed: 30, fly: 60, swim: 30,
    abilities: { str: 15, dex: 12, con: 13, int: 14, wis: 11, cha: 13 },
    saveProf: ['dex', 'con', 'wis', 'cha'], skills: { perception: 4, stealth: 3 },
    senses: { darkvision: 60, blindsight: 10 }, languages: ['Draconic'],
    immune: ['poison'], condImmune: ['poisoned'],
    traits: [trait('Amphibious', "It breathes air and water alike.", { passive: 'amphibious' })],
    actions: [
      melee('Bite', 4, '1d10+2', 'piercing', { effects: [{ kind: 'damage', dice: '2d6', type: 'poison' }] }),
      saveAct('Poison Breath', {
        target: { kind: 'cone', length: 15 },
        save: { ability: 'con', dc: 11, onSuccess: 'half' },
        dice: '6d6', dtype: 'poison',
        uses: { max: 1, recharge: '5-6' },
        desc: "A 15-foot cone of stinging green gas that kills the undergrowth where it settles.",
        ai: { role: 'aoe', weight: 2.2 },
      }),
    ],
    ai: { archetype: 'boss', aggression: 0.75, selfPreserve: 0.6, preferredRange: 15 },
    loot: { gold: '4d6*10', table: [['gem-emerald', 0.1], ['gem-jade', 0.25], ['potion-healing', 0.2], ['gem-malachite', 0.3]] },
    sprite: 'dragon-wyrmling', tint: '#4a7a3a', biomes: ['forest', 'pine-forest', 'ash-waste', 'ruins', 'marsh'], groupSize: [1, 1],
    faction: 'cult-dragon', elite: true,
  }),

  mon('werewolf', 'Werewolf', {
    desc: "A woodcutter by day and a nightmare by moonrise, somewhere off the Triboar Trail. Silver settles it; nothing else reliably does.",
    cr: 3, type: 'humanoid', subtype: 'shapechanger', size: 'medium', ac: 12, acNote: '11 in humanoid form',
    hpDice: '9d8+18', speed: 30, abilities: { str: 15, dex: 13, con: 14, int: 10, wis: 11, cha: 10 },
    skills: { perception: 4, stealth: 3 },
    immune: ['nonmagical-physical-nonsilver'], languages: ['Common'],
    traits: [
      trait('Shapechanger', "It shifts between human, wolf and a hybrid of both; its gear does not shift with it.", { passive: 'shapechanger' }),
      T_KEEN_HEAR_SMELL,
    ],
    actions: [
      multi("In hybrid form it bites and rakes with its claws.", [['bite', 1], ['claws', 1]]),
      melee('Bite', 4, '1d8+2', 'piercing', {
        save: { ability: 'con', dc: 12, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'lycanthropy' }],
        desc: "Only in wolf or hybrid form. A humanoid bitten risks the curse of lycanthropy.",
      }),
      melee('Claws', 4, '2d4+2', 'slashing'),
      ranged('Spear', 4, '1d6+2', 'piercing', [20, 60], { desc: "Humanoid form only." }),
    ],
    ai: { archetype: 'brute', aggression: 0.85, selfPreserve: 0.4, preferredRange: 5 },
    loot: { gold: '4d10', table: [['spear', 0.2], ['arrow-silvered', 0.06], ['clothes-traveler', 0.25], ['rations', 0.3]] },
    sprite: 'werewolf', biomes: ['forest', 'pine-forest', 'hills', 'plains', 'road'], groupSize: [1, 3],
  }),

  mon('ettin', 'Ettin', {
    desc: "Two heads, two names, two opinions, and one body that never sleeps because one head is always awake. It bickers with itself all the way through a fight.",
    cr: 4, type: 'giant', size: 'large', ac: 12, acNote: 'natural armor',
    hpDice: '10d10+30', speed: 40, abilities: { str: 21, dex: 8, con: 17, int: 6, wis: 10, cha: 8 },
    skills: { perception: 4 }, senses: { darkvision: 60 }, languages: ['Giant', 'Orc'],
    traits: [
      trait('Two Heads', "Two heads means two watches; it has advantage against being blinded, charmed, deafened, frightened, stunned or knocked unconscious.", {
        passive: 'two-heads', advSaveVs: ['blinded', 'charmed', 'deafened', 'frightened', 'stunned', 'unconscious'], skillProf: ['perception'],
      }),
      trait('Wakeful', "One head is always awake, so an ettin camp cannot be crept up on.", { passive: 'wakeful' }),
    ],
    actions: [
      multi("It swings its battleaxe and its morningstar, one in each hand.", [['battleaxe', 1], ['morningstar', 1]]),
      melee('Battleaxe', 7, '2d8+5', 'slashing'),
      melee('Morningstar', 7, '2d8+5', 'piercing'),
    ],
    ai: { archetype: 'brute', aggression: 0.85, selfPreserve: 0.3, preferredRange: 5 },
    loot: { gold: '3d6*10', table: [['battleaxe', 0.25], ['morningstar', 0.25], ['gem-amber', 0.15], ['gem-onyx', 0.15], ['sack', 0.3]] },
    sprite: 'ettin', biomes: ['hills', 'mountain', 'cave', 'ruins', 'tundra'], groupSize: [1, 2],
  }),

  mon('flameskull', 'Flameskull', {
    desc: "A wizard's skull wreathed in green fire, set to guard a door and left there far past the death of everyone who cared. Wave Echo Cave keeps at least one.",
    cr: 4, type: 'undead', size: 'tiny', ac: 13, hpDice: '8d4+22',
    speed: 0, fly: 40, hover: true,
    abilities: { str: 1, dex: 17, con: 14, int: 16, wis: 10, cha: 11 },
    skills: { arcana: 5, perception: 2 }, senses: { darkvision: 60 },
    languages: ['Common'],
    resist: ['lightning', 'necrotic', 'piercing'],
    immune: ['cold', 'fire', 'poison'],
    condImmune: ['charmed', 'frightened', 'paralyzed', 'prone'],
    traits: [
      T_UNDEAD_NATURE,
      trait('Illumination', "It sheds green light in a 15-foot radius, brighter or dimmer as it pleases.", { passive: 'illumination:15' }),
      trait('Magic Resistance', "The Weave slides off the old bone.", { passive: 'magic-resistance', advSaveVs: ['magic'] }),
      trait('Rejuvenation', "Destroyed, it reforms in an hour unless holy water or a dispelling touches the ashes.", { passive: 'rejuvenation:1hour' }),
    ],
    actions: [
      multi("It hurls two fireballs of green flame.", [['fire-ray', 2]]),
      ranged('Fire Ray', 5, '3d6', 'fire', [30, 30], { id: 'fire-ray', desc: "A lance of green flame from an empty eye socket." }),
      saveAct('Fireball', {
        range: [60, 60],
        target: { kind: 'sphere', radius: 20 },
        save: { ability: 'dex', dc: 13, onSuccess: 'half' },
        dice: '8d6', dtype: 'fire',
        uses: { max: 1, recharge: 'long' },
        desc: "Once a day the skull remembers the spell that killed its owner.",
        ai: { role: 'aoe', weight: 2.4 },
      }),
      saveAct('Blur', {
        uses: { max: 1, recharge: 'long' },
        target: { kind: 'self' },
        effects: [{ kind: 'buff', id: 'blur' }],
        desc: "Its outline doubles and shivers; attacks against it have disadvantage.",
        ai: { role: 'buff', weight: 1.4 },
      }),
    ],
    ai: { archetype: 'caster', aggression: 0.8, selfPreserve: 0.5, preferredRange: 30 },
    loot: { gold: '5d6*5', table: [['scroll-3', 0.2], ['gem-onyx', 0.25], ['spellbook', 0.1], ['potion-greater-healing', 0.15]] },
    sprite: 'flameskull', biomes: ['mine', 'dungeon', 'crypt', 'ruins', 'cave'], groupSize: [1, 2],
    faction: 'undead', elite: true,
  }),

  mon('ghost', 'Ghost', {
    desc: "A death that will not settle, still walking the room where it happened. It can reach into a living chest and age a heart forty years in a heartbeat.",
    cr: 4, type: 'undead', size: 'medium', ac: 11, hpDice: '10d8+10',
    speed: 0, fly: 40, hover: true,
    abilities: { str: 7, dex: 13, con: 10, int: 10, wis: 12, cha: 17 },
    senses: { darkvision: 60 }, languages: ['Common'],
    resist: ['acid', 'cold', 'fire', 'lightning', 'thunder', 'nonmagical-physical'],
    immune: ['necrotic', 'poison'],
    condImmune: ['charmed', 'exhaustion', 'frightened', 'grappled', 'paralyzed', 'petrified', 'poisoned', 'prone', 'restrained'],
    traits: [
      T_UNDEAD_NATURE,
      T_INCORPOREAL,
      trait('Ethereal Sight', "It sees 60 feet into the Ethereal Plane, and out of it.", { passive: 'ethereal-sight:60' }),
    ],
    actions: [
      melee('Withering Touch', 5, '4d6+3', 'necrotic'),
      saveAct('Horrifying Visage', {
        target: { kind: 'cone', length: 60 },
        save: { ability: 'wis', dc: 13, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'frightened', duration: '1 minute' }, { kind: 'utility', tag: 'age-1d4x10-years' }],
        uses: { max: 1, recharge: 'short' },
        desc: "It shows the room how it died. A badly failed save ages the viewer 1d4 x 10 years.",
        ai: { role: 'debuff', weight: 1.9 },
      }),
      saveAct('Possession', {
        range: [5, 5],
        save: { ability: 'cha', dc: 13, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'possessed', duration: '24 hours' }],
        uses: { max: 1, recharge: '6' },
        desc: "It steps into a humanoid body and wears it, keeping its own mind and alignment.",
        ai: { role: 'control', weight: 2 },
      }),
      util('Etherealness', {
        desc: "It steps into the Ethereal Plane, visible from the Material but unable to touch it.",
        ai: { role: 'utility', weight: 1.3 },
      }),
    ],
    ai: { archetype: 'caster', aggression: 0.7, selfPreserve: 0.7, preferredRange: 5 },
    loot: { gold: '4d6*5', table: [['gem-black-pearl', 0.1], ['signet-ring', 0.15], ['reliquary', 0.15]] },
    sprite: 'ghost', biomes: ['crypt', 'ruins', 'dungeon', 'city', 'mine'], groupSize: [1, 1],
    faction: 'undead', elite: true,
  }),
);

// ---------------------------------------------------------------------------
// EXPORT — the frozen catalogue, keyed by id.
// ---------------------------------------------------------------------------

/** Every creature of CR 0 through CR 4, keyed by lowercase-kebab id. */
export const MONSTERS_LOW = deepFreeze(Object.fromEntries(ALL.map((m) => [m.id, m])));

/** Ids in declaration order, which is roughly type-then-CR. */
export const MONSTERS_LOW_IDS = Object.freeze(Object.keys(MONSTERS_LOW));

// ---------------------------------------------------------------------------
// ENCOUNTER PACKS — hand-authored groups with Sword Coast flavour. `members`
// entries are [monsterId, min, max]; `cr` is the rough encounter rating the
// wilderness tables budget against.
// ---------------------------------------------------------------------------

/** Small builder so every pack is guaranteed the same shape. */
function pack(id, name, o) {
  return {
    id, name, desc: o.desc,
    biomes: o.biomes, cr: o.cr,
    members: o.members,
    faction: o.faction || null,
    ambush: !!o.ambush,
    minLevel: o.minLevel || 1,
    maxLevel: o.maxLevel || 20,
    music: o.music || 'battle',
  };
}

const GROUPS = [
  pack('cragmaw-scouts', 'Cragmaw Scouts', {
    desc: "Two or three Cragmaw goblins crouched in the roadside brush with a rope across the track and a wolf on a leash. The oldest trick on the Triboar Trail, and it still works.",
    biomes: ['road', 'forest', 'pine-forest', 'hills'], cr: 0.5, faction: 'goblinoid', ambush: true,
    members: [['goblin', 2, 4], ['wolf', 0, 2]],
    minLevel: 1, maxLevel: 5,
  }),
  pack('cragmaw-ambush', 'Cragmaw Trail Ambush', {
    desc: "The full raiding party: goblins in the bracken, a bugbear waiting behind the deadfall, and a dire wolf that circles to cut off the road east.",
    biomes: ['road', 'forest', 'pine-forest', 'hills'], cr: 2, faction: 'goblinoid', ambush: true,
    members: [['goblin', 3, 5], ['bugbear', 1, 1], ['dire-wolf', 0, 1]],
    minLevel: 2, maxLevel: 7,
  }),
  pack('cragmaw-hideout-den', 'Cragmaw Hideout Den', {
    desc: "The bunk-cave behind the waterfall — goblins around a cook-fire, a boss in stolen mail, and wolves chained in the pit.",
    biomes: ['cave', 'dungeon'], cr: 2, faction: 'goblinoid',
    members: [['goblin', 3, 6], ['goblin-boss', 1, 1], ['wolf', 1, 3]],
    minLevel: 2, maxLevel: 7,
  }),
  pack('cragmaw-castle-guard', 'Cragmaw Castle Guard', {
    desc: "King Grol's household troops: hobgoblins in oiled mail, a captain calling cadence, and a bugbear chief who answers to no one but Grol.",
    biomes: ['ruins', 'dungeon', 'forest'], cr: 4, faction: 'goblinoid',
    members: [['hobgoblin', 2, 4], ['hobgoblin-captain', 1, 1], ['bugbear', 0, 2]],
    minLevel: 4, maxLevel: 10,
  }),
  pack('redbrand-patrol', 'Redbrand Patrol', {
    desc: "Four scarlet cloaks swaggering up Phandalin's main street, looking for a shopkeeper who has forgotten what protection costs.",
    biomes: ['city', 'road'], cr: 1.5, faction: 'redbrands',
    members: [['redbrand-ruffian', 3, 4]],
    minLevel: 1, maxLevel: 6,
  }),
  pack('redbrand-hideout-guard', 'Tresendar Cellar Guard', {
    desc: "Below the burnt manor: ruffians dicing by a brazier, a bugbear bodyguard on loan from the Black Spider, and something in the crevasse that answers when they shout.",
    biomes: ['dungeon', 'ruins'], cr: 3, faction: 'redbrands',
    members: [['redbrand-ruffian', 2, 4], ['bugbear', 0, 1], ['nothic', 0, 1]],
    minLevel: 3, maxLevel: 8,
  }),
  pack('glasstaff-apprentices', "Glasstaff's Apprentices", {
    desc: "Iarno Albrek's hand-picked students, still practising Burning Hands on the cellar rats, with two ruffians to hold the door.",
    biomes: ['dungeon', 'ruins', 'city'], cr: 2, faction: 'redbrands',
    members: [['mage-apprentice', 2, 3], ['redbrand-ruffian', 1, 2]],
    minLevel: 3, maxLevel: 8,
  }),
  pack('thundertree-blights', 'Thundertree Blights', {
    desc: "The ash-choked streets shift, and what looked like dead hedge stands up. Twig blights first, then the needle blights from the treeline.",
    biomes: ['ruins', 'ash-waste', 'pine-forest'], cr: 1, faction: 'blight',
    members: [['twig-blight', 4, 8], ['needle-blight', 1, 3]],
    minLevel: 2, maxLevel: 7,
  }),
  pack('thundertree-ash-dead', 'The Ash-Dead of Thundertree', {
    desc: "Villagers who never got out when Mount Hotenow blew, grey to the bone and still walking the lanes they knew.",
    biomes: ['ash-waste', 'ruins'], cr: 1.5, faction: 'undead',
    members: [['ash-zombie', 3, 6], ['zombie', 0, 2]],
    minLevel: 2, maxLevel: 7,
  }),
  pack('cult-of-the-dragon-cell', 'Cult of the Dragon Cell', {
    desc: "Black-and-purple robes in a ruined shrine, chanting over a hoard they are assembling for a dragon that has not agreed to want it.",
    biomes: ['ruins', 'ash-waste', 'crypt', 'dungeon'], cr: 3, faction: 'cult-dragon',
    members: [['cultist', 3, 5], ['cult-fanatic', 1, 1], ['needle-blight', 0, 2]],
    minLevel: 3, maxLevel: 9,
  }),
  pack('wyvern-tor-orcs', 'Wyvern Tor Orcs', {
    desc: "A Many-Arrows raiding band camped in the saddle of the Tor, with an ogre they bought with somebody else's cattle.",
    biomes: ['hills', 'mountain', 'plains'], cr: 3, faction: 'many-arrows',
    members: [['orc', 3, 5], ['ogre', 0, 1], ['orog', 0, 1]],
    minLevel: 3, maxLevel: 8,
  }),
  pack('many-arrows-warband', 'Many-Arrows Warband', {
    desc: "A full war party under a chief who has taken enough heads to keep the axe. They came down the pass for Phandalin and will settle for a caravan.",
    biomes: ['hills', 'mountain', 'plains', 'road'], cr: 5, faction: 'many-arrows',
    members: [['orc', 4, 6], ['orog', 1, 2], ['orc-war-chief', 1, 1]],
    minLevel: 5, maxLevel: 12,
  }),
  pack('old-owl-well-undead', 'Old Owl Well Undead', {
    desc: "The Netherese watchtower's garrison, raised again by a Thayan's careless excavation — skeleton archers on the broken wall and a warhorse skeleton in the yard.",
    biomes: ['ruins', 'crypt', 'plains'], cr: 2, faction: 'undead',
    members: [['skeleton', 4, 7], ['warhorse-skeleton', 0, 1], ['specter', 0, 1]],
    minLevel: 2, maxLevel: 8,
  }),
  pack('crypt-of-the-restless', 'Crypt of the Restless', {
    desc: "A barrow opened by grave-robbers who never came back out. A wight commands, and everything else in the dark obeys.",
    biomes: ['crypt', 'dungeon', 'ruins'], cr: 4, faction: 'undead',
    members: [['wight', 1, 1], ['zombie', 2, 4], ['skeleton', 2, 4], ['crawling-claw', 0, 4]],
    minLevel: 4, maxLevel: 10,
  }),
  pack('ghoul-warren', 'Ghoul Warren', {
    desc: "Somebody's family vault, chewed open from the inside. The ghasts hold the middle and the ghouls come at you from the niches.",
    biomes: ['crypt', 'dungeon', 'city', 'underdark'], cr: 3, faction: 'undead',
    members: [['ghoul', 2, 5], ['ghast', 0, 1]],
    minLevel: 3, maxLevel: 9,
  }),
  pack('triboar-trail-bandits', 'Triboar Trail Bandits', {
    desc: "A felled pine across the road, six crossbows in the ditch, and a captain who would honestly rather you just paid the toll.",
    biomes: ['road', 'plains', 'forest', 'hills'], cr: 2, faction: 'bandits', ambush: true,
    members: [['bandit', 3, 6], ['bandit-captain', 0, 1]],
    minLevel: 1, maxLevel: 7,
  }),
  pack('high-road-highwaymen', 'High Road Highwaymen', {
    desc: "Leilon-side road agents with a half-ogre for persuasion and a mastiff for the ones who run.",
    biomes: ['road', 'coast', 'plains'], cr: 3, faction: 'bandits',
    members: [['bandit', 3, 5], ['half-ogre', 0, 1], ['mastiff', 0, 2], ['bandit-captain', 1, 1]],
    minLevel: 3, maxLevel: 9,
  }),
  pack('zhentarim-strongarms', 'Zhentarim Strongarms', {
    desc: "Black Network muscle collecting on a debt, with a spy on the roofline making sure nobody leaves to fetch the watch.",
    biomes: ['city', 'road', 'ruins'], cr: 3, faction: 'zhentarim',
    members: [['thug', 3, 5], ['spy', 1, 1], ['veteran', 0, 1]],
    minLevel: 3, maxLevel: 9,
  }),
  pack('neverwinter-wood-wolves', 'Neverwinter Wood Wolves', {
    desc: "The pack has been shadowing you since the last stream crossing. The big grey one is already behind you.",
    biomes: ['forest', 'pine-forest', 'hills', 'tundra'], cr: 1.5,
    members: [['wolf', 3, 6], ['dire-wolf', 0, 2]],
    minLevel: 1, maxLevel: 6,
  }),
  pack('neverwinter-wood-fey', 'Neverwinter Wood Fey', {
    desc: "The path folds back on itself, a light goes out, and a very small voice asks what business you have this deep in the wood.",
    biomes: ['forest', 'pine-forest'], cr: 1.5,
    members: [['sprite', 2, 4], ['pixie', 1, 3], ['blink-dog', 0, 2], ['dryad', 0, 1]],
    minLevel: 2, maxLevel: 8,
  }),
  pack('kryptgarden-spiders', 'Kryptgarden Web Hollow', {
    desc: "Cable strung between the trunks at head height, egg sacs above, and the ground beneath moving with wolf spiders.",
    biomes: ['forest', 'pine-forest', 'cave'], cr: 2,
    members: [['wolf-spider', 2, 4], ['giant-spider', 1, 2], ['ettercap', 0, 1]],
    minLevel: 2, maxLevel: 8,
  }),
  pack('ettercap-web-hollow', "Ettercap's Snare", {
    desc: "A clearing hung with old rope and older bones, and the shepherd of the place watching from directly overhead.",
    biomes: ['forest', 'pine-forest', 'ruins'], cr: 3,
    members: [['ettercap', 1, 2], ['giant-spider', 2, 4]],
    minLevel: 3, maxLevel: 9,
  }),
  pack('mere-of-dead-men-lizardfolk', 'Mere of Dead Men Lizardfolk', {
    desc: "Bone shields rising out of water you were certain was knee-deep, with giant frogs driven ahead of them like hounds.",
    biomes: ['marsh', 'coast'], cr: 2, faction: 'lizardfolk', ambush: true,
    members: [['lizardfolk', 2, 5], ['giant-frog', 1, 3], ['giant-lizard', 0, 1]],
    minLevel: 2, maxLevel: 8,
  }),
  pack('bullywug-bog', 'Bullywug Bog Court', {
    desc: "A self-declared king on a rotten stump, his court croaking approval, and a giant toad tethered to the throne.",
    biomes: ['marsh', 'coast'], cr: 2, faction: 'bullywug',
    members: [['bullywug', 3, 6], ['giant-toad', 0, 2], ['giant-frog', 1, 3]],
    minLevel: 2, maxLevel: 7,
  }),
  pack('mere-wisps', 'Lights Over the Mere', {
    desc: "Two lanterns bobbing helpfully toward what looks like a causeway. There is no causeway.",
    biomes: ['marsh', 'coast', 'ruins'], cr: 3, faction: 'undead',
    members: [['will-o-wisp', 1, 3], ['zombie', 0, 3]],
    minLevel: 3, maxLevel: 9,
  }),
  pack('sword-mountains-gnolls', 'Sword Mountains Gnoll Pack', {
    desc: "They came down the scree in a laughing line with a pack lord behind them, and they are not here for the cattle.",
    biomes: ['hills', 'mountain', 'plains', 'ruins'], cr: 3, faction: 'gnoll',
    members: [['gnoll', 3, 5], ['gnoll-pack-lord', 0, 1], ['hyena', 1, 4], ['giant-hyena', 0, 1]],
    minLevel: 3, maxLevel: 9,
  }),
  pack('icespire-frost-pack', 'Icespire Frost Pack', {
    desc: "White wolves on white snow, and the largest of them speaks Common well enough to tell you exactly how this ends.",
    biomes: ['tundra', 'mountain', 'pine-forest'], cr: 4,
    members: [['winter-wolf', 1, 2], ['wolf', 2, 4], ['ice-mephit', 0, 2]],
    minLevel: 4, maxLevel: 10,
  }),
  pack('kobold-warren', 'Kobold Warren', {
    desc: "Every corridor is trapped, every corner has a sling behind it, and somewhere in the back an urd is dropping rocks down the shaft at you.",
    biomes: ['cave', 'mine', 'dungeon', 'underdark'], cr: 1, faction: 'kobold',
    members: [['kobold', 4, 8], ['winged-kobold', 0, 3]],
    minLevel: 1, maxLevel: 6,
  }),
  pack('phandalin-cellar-vermin', 'Phandalin Cellar Vermin', {
    desc: "Barthen has been losing grain for a tenday. The cellar is alive, and the rats are not the worst of it.",
    biomes: ['city', 'dungeon', 'ruins'], cr: 0.5,
    members: [['giant-rat', 3, 6], ['swarm-of-rats', 0, 1], ['giant-centipede', 0, 2]],
    minLevel: 1, maxLevel: 4,
  }),
  pack('stirge-roost', 'Stirge Roost', {
    desc: "The ceiling of the shaft is furred with them, and the first torch you raise sets the whole roost loose.",
    biomes: ['cave', 'mine', 'ruins', 'dungeon', 'marsh'], cr: 1,
    members: [['stirge', 4, 8], ['swarm-of-bats', 0, 1]],
    minLevel: 1, maxLevel: 5,
  }),
  pack('wave-echo-shafts', 'Wave Echo Deep Shafts', {
    desc: "Flooded galleries where the Forge of Spells still hums somewhere below. Oozes have gotten into the pumps.",
    biomes: ['mine', 'cave', 'dungeon'], cr: 3,
    members: [['gray-ooze', 1, 2], ['ochre-jelly', 0, 1], ['grick', 0, 2], ['skeleton', 0, 3]],
    minLevel: 3, maxLevel: 9,
  }),
  pack('undermountain-first-level', 'Undermountain, Dungeon Level One', {
    desc: "Below the Yawning Portal's rope: kobolds who have learned to live off what falls, and a flying sword nobody has managed to catch.",
    biomes: ['dungeon', 'underdark'], cr: 2,
    members: [['kobold', 3, 6], ['flying-sword', 0, 2], ['giant-rat', 0, 4], ['animated-armor', 0, 1]],
    minLevel: 2, maxLevel: 7,
  }),
  pack('undermountain-ooze-pits', 'Undermountain Ooze Pits', {
    desc: "Halaster's drains. Something down here has been dividing for a very long time.",
    biomes: ['dungeon', 'underdark', 'cave'], cr: 4,
    members: [['ochre-jelly', 1, 2], ['gray-ooze', 1, 2], ['black-pudding', 0, 1], ['gelatinous-cube', 0, 1]],
    minLevel: 4, maxLevel: 11,
  }),
  pack('undermountain-wards', 'Halasters Wards', {
    desc: "The vault door opens and the furniture attacks. Somewhere, a wizard three centuries dead is laughing.",
    biomes: ['dungeon', 'ruins', 'crypt'], cr: 4,
    members: [['animated-armor', 1, 3], ['flying-sword', 1, 3], ['rug-of-smothering', 0, 1], ['spectator', 0, 1]],
    minLevel: 4, maxLevel: 11,
  }),
  pack('myconid-grotto', 'Myconid Grotto', {
    desc: "A cavern of soft light and slow thought. They will not attack unless you break something, and everything here breaks easily.",
    biomes: ['underdark', 'cave', 'mine'], cr: 1.5,
    members: [['myconid-adult', 2, 4], ['myconid-sprout', 2, 5], ['flumph', 0, 1]],
    minLevel: 2, maxLevel: 8,
  }),
  pack('underdark-quaggoth-pack', 'Quaggoth Hunting Pack', {
    desc: "White fur in the dark and a smell of old blood. They were somebody's slaves once and they remember it badly.",
    biomes: ['underdark', 'cave', 'mine'], cr: 4,
    members: [['quaggoth', 2, 4], ['giant-bat', 0, 2]],
    minLevel: 4, maxLevel: 10,
  }),
  pack('troglodyte-warren', 'Troglodyte Warren', {
    desc: "You smell it two turns before you find it. Then the walls change colour and come at you.",
    biomes: ['underdark', 'cave', 'mine', 'dungeon'], cr: 2,
    members: [['troglodyte', 3, 6], ['giant-lizard', 0, 2]],
    minLevel: 2, maxLevel: 7,
  }),
  pack('mephit-vent', 'Cracked Binding Circle', {
    desc: "Some Netherese conjurer's circle has finally failed, and the vent has been venting mephits ever since.",
    biomes: ['cave', 'mine', 'dungeon', 'ash-waste', 'underdark'], cr: 2,
    members: [['magma-mephit', 1, 3], ['steam-mephit', 1, 3], ['dust-mephit', 0, 2], ['mud-mephit', 0, 2]],
    minLevel: 2, maxLevel: 8,
  }),
  pack('bound-fiends', 'Bound Fiends', {
    desc: "A summoning that went well for the summoner right up until it did not. Whatever came through is still in the room.",
    biomes: ['dungeon', 'ruins', 'crypt'], cr: 3, faction: 'fiend',
    members: [['dretch', 2, 4], ['manes', 2, 5], ['quasit', 0, 1], ['imp', 0, 1]],
    minLevel: 3, maxLevel: 9,
  }),
  pack('hellhound-hunt', 'Infernal Hunt', {
    desc: "Three sets of ember-eyes spread out to flank, and the smell of burning fat rolls ahead of them.",
    biomes: ['ash-waste', 'ruins', 'mountain', 'dungeon'], cr: 5, faction: 'fiend',
    members: [['hell-hound', 2, 3], ['cultist', 0, 3]],
    minLevel: 5, maxLevel: 11,
  }),
  pack('ogre-shakedown', 'Ogre Shakedown', {
    desc: "It has parked itself on the bridge and wants a toll it cannot count. Two orcs stand behind it, hoping it stays distracted.",
    biomes: ['road', 'hills', 'forest', 'mountain'], cr: 3,
    members: [['ogre', 1, 2], ['orc', 0, 3], ['half-ogre', 0, 1]],
    minLevel: 3, maxLevel: 9,
  }),
  pack('owlbear-territory', 'Owlbear Territory', {
    desc: "Claw-marks at head height on every third pine, and a den full of bones you would rather not identify.",
    biomes: ['forest', 'pine-forest', 'hills', 'cave'], cr: 3,
    members: [['owlbear', 1, 2], ['black-bear', 0, 1]],
    minLevel: 3, maxLevel: 9,
  }),
  pack('conyberry-ruins-haunts', 'Conyberry Haunts', {
    desc: "The village has been empty since the Uthgardt burned it, but something still keeps the doorways.",
    biomes: ['ruins', 'plains', 'forest'], cr: 2, faction: 'undead',
    members: [['specter', 1, 2], ['shadow', 1, 3], ['swarm-of-ravens', 0, 1]],
    minLevel: 2, maxLevel: 8,
  }),
  pack('trail-scavengers', 'Trail Scavengers', {
    desc: "Something died on the road three days ago and the road has been busy ever since.",
    biomes: ['road', 'plains', 'hills'], cr: 0.5,
    members: [['jackal', 3, 5], ['raven', 2, 4], ['swarm-of-ravens', 0, 1]],
    minLevel: 1, maxLevel: 4,
  }),
  pack('mountain-ambushers', 'Manticore Ledge', {
    desc: "The spikes come first, from a ledge you cannot reach, and the voice that follows them wants to negotiate.",
    biomes: ['mountain', 'hills', 'ruins'], cr: 4,
    members: [['manticore', 1, 2], ['giant-goat', 0, 2]],
    minLevel: 4, maxLevel: 10,
  }),
  pack('labyrinth-guardians', 'Labyrinth Guardians', {
    desc: "Deep in the maze levels, where the corridors stop making sense and the thing that lives here has never once gotten lost.",
    biomes: ['dungeon', 'underdark', 'crypt'], cr: 4,
    members: [['minotaur', 1, 1], ['minotaur-skeleton', 0, 1], ['ghoul', 0, 3]],
    minLevel: 4, maxLevel: 11,
  }),
  pack('sunken-cistern', 'Sunken Cistern', {
    desc: "The water in the old Netherese cistern rises without a wind, and keeps rising.",
    biomes: ['dungeon', 'ruins', 'cave', 'underdark'], cr: 4,
    members: [['water-weird', 1, 2], ['gray-ooze', 0, 2], ['giant-crab', 0, 3]],
    minLevel: 4, maxLevel: 10,
  }),
  pack('phase-hunters', 'Phase Spider Hunt', {
    desc: "The first one is not there when you swing at it. The second one is already behind the rear rank.",
    biomes: ['underdark', 'cave', 'forest', 'dungeon'], cr: 4,
    members: [['phase-spider', 1, 3]],
    minLevel: 4, maxLevel: 11,
  }),
  pack('doppelganger-plot', 'Wearing Another Face', {
    desc: "One of the caravan guards has been quiet for two days. The others have not noticed. They should have.",
    biomes: ['city', 'road', 'dungeon', 'ruins'], cr: 4,
    members: [['doppelganger', 1, 2], ['thug', 0, 3]],
    minLevel: 4, maxLevel: 10,
  }),
  pack('gargoyle-roost', 'Gargoyle Roost', {
    desc: "Four grotesques on the parapet of a Neverwintan ruin. Three of them are decoration.",
    biomes: ['city', 'ruins', 'mountain', 'dungeon'], cr: 4,
    members: [['gargoyle', 2, 4]],
    minLevel: 4, maxLevel: 10,
  }),
  pack('rust-and-ruin', 'Rust and Ruin', {
    desc: "Something in this gallery has been eating the mine-cart rails. It is delighted to see you and your very expensive armour.",
    biomes: ['mine', 'cave', 'dungeon', 'underdark'], cr: 2,
    members: [['rust-monster', 1, 3], ['giant-fire-beetle', 0, 3]],
    minLevel: 2, maxLevel: 8,
  }),
  pack('ankheg-field', 'Ankheg Field', {
    desc: "The furrows are wrong and the ground is hollow. A farmstead on the Trail has stopped answering the post.",
    biomes: ['plains', 'road', 'hills', 'forest'], cr: 3,
    members: [['ankheg', 1, 2], ['giant-wasp', 0, 2]],
    minLevel: 3, maxLevel: 9,
  }),
  pack('harpy-cliffs', 'Harpy Cliffs', {
    desc: "There is singing above the coast road, and two of your party have already stopped walking.",
    biomes: ['coast', 'mountain', 'hills', 'ruins'], cr: 3,
    members: [['harpy', 2, 4]],
    minLevel: 3, maxLevel: 9,
  }),
  pack('uthgardt-warband', 'Uthgardt Warband', {
    desc: "Berserkers off the Dessarin with a scout ahead of them, testing whether the Trail is worth raiding this season.",
    biomes: ['plains', 'hills', 'tundra', 'forest'], cr: 4,
    members: [['berserker', 2, 4], ['scout', 0, 2], ['mastiff', 0, 2]],
    minLevel: 4, maxLevel: 10,
  }),
  pack('sewer-rats-of-neverwinter', 'Blacklake Sewer Rats', {
    desc: "Neverwinter's underside, where the wererats keep their ledgers and the swarms keep the accounts tidy.",
    biomes: ['city', 'dungeon'], cr: 4,
    members: [['wererat', 1, 3], ['swarm-of-rats', 1, 2], ['thug', 0, 2]],
    minLevel: 4, maxLevel: 10,
  }),
  pack('shrine-defilers', 'Shrine Defilers', {
    desc: "Someone has been at the roadside shrine of Tymora with a chisel, and whatever they woke doing it is still inside.",
    biomes: ['ruins', 'crypt', 'road'], cr: 3, faction: 'undead',
    members: [['shadow', 2, 4], ['crawling-claw', 0, 4], ['ghoul', 0, 2]],
    minLevel: 3, maxLevel: 9,
  }),
  pack('black-spider-escort', "The Black Spider's Escort", {
    desc: "Drow hand-crossbows in the dark of the Wave Echo galleries, with giant spiders on the ceiling and orders not to leave witnesses.",
    biomes: ['mine', 'underdark', 'cave', 'dungeon'], cr: 3, faction: 'drow',
    members: [['drow', 2, 4], ['giant-spider', 1, 2], ['bugbear', 0, 2]],
    minLevel: 3, maxLevel: 9,
  }),
  pack('wave-echo-guardians', 'Wave Echo Cave Guardians', {
    desc: "Green light down the flooded gallery, and the skull that holds it has been holding it since the mine fell.",
    biomes: ['mine', 'cave', 'dungeon'], cr: 5, faction: 'undead',
    members: [['flameskull', 1, 1], ['skeleton', 2, 4], ['specter', 0, 2]],
    minLevel: 5, maxLevel: 12,
  }),
  pack('icespire-brood', 'Icespire Brood', {
    desc: "Cryovain's hatchling has claimed a shepherd's cave and lined it with frozen sheep. It is small. It is not harmless.",
    biomes: ['tundra', 'mountain', 'cave'], cr: 4,
    members: [['white-dragon-wyrmling', 1, 1], ['ice-mephit', 1, 3], ['kobold', 0, 4]],
    minLevel: 4, maxLevel: 10,
  }),
  pack('thundertree-tower', 'The Tower at Thundertree', {
    desc: "Green scales in the shadow of the ruined druid's tower, and cultists on their knees in the ash before it.",
    biomes: ['ruins', 'ash-waste', 'pine-forest'], cr: 4, faction: 'cult-dragon',
    members: [['green-dragon-wyrmling', 1, 1], ['cultist', 2, 4], ['twig-blight', 0, 4]],
    minLevel: 4, maxLevel: 10,
  }),
  pack('moonrise-on-the-trail', 'Moonrise on the Trail', {
    desc: "The woodcutter you shared a fire with has not come back, and something is circling the camp on four legs now.",
    biomes: ['forest', 'pine-forest', 'road', 'hills'], cr: 4,
    members: [['werewolf', 1, 2], ['wolf', 2, 4]],
    minLevel: 4, maxLevel: 10,
  }),
  pack('ettin-crag', 'Ettin Crag', {
    desc: "Two voices arguing behind the ridge, both of them belonging to the same enormous problem.",
    biomes: ['hills', 'mountain', 'cave', 'ruins'], cr: 5,
    members: [['ettin', 1, 1], ['ogre', 0, 1], ['orc', 0, 3]],
    minLevel: 5, maxLevel: 11,
  }),
  pack('haunting-of-the-hall', 'The Haunting', {
    desc: "The manor has been empty for forty years and the door still latches itself behind you.",
    biomes: ['ruins', 'city', 'crypt', 'dungeon'], cr: 5, faction: 'undead',
    members: [['ghost', 1, 1], ['shadow', 0, 3], ['crawling-claw', 0, 4]],
    minLevel: 5, maxLevel: 12,
  }),
  pack('griffon-crag', 'Griffon Crag', {
    desc: "The nest is on the ledge above the pass, and the pair that keeps it has already counted your horses.",
    biomes: ['mountain', 'hills', 'tundra'], cr: 3,
    members: [['griffon', 1, 3], ['giant-goat', 0, 2]],
    minLevel: 3, maxLevel: 9,
  }),
  pack('scarecrow-field', 'The Field That Watches', {
    desc: "Four poles, four scarecrows, and one of them was not there when you came through this morning.",
    biomes: ['plains', 'road', 'ruins'], cr: 2,
    members: [['scarecrow', 1, 3], ['swarm-of-ravens', 0, 1], ['vulture', 0, 3]],
    minLevel: 2, maxLevel: 8,
  }),
  pack('drowned-shallows', 'The Drowned Shallows', {
    desc: "You are halfway across before the water turns silver around your knees.",
    biomes: ['marsh', 'coast'], cr: 2,
    members: [['swarm-of-quippers', 1, 2], ['giant-frog', 0, 3]],
    minLevel: 2, maxLevel: 8,
  }),
];

/** Named encounter packs for the CR 0–4 band, keyed by id. */
export const MONSTER_GROUPS_LOW = deepFreeze(Object.fromEntries(GROUPS.map((g) => [g.id, g])));

// ---------------------------------------------------------------------------
// Small pure helpers. `data/monsters.js` builds the real indexes; these exist
// so this module is useful on its own and so the encounter tables can filter
// without importing the merged catalogue.
// ---------------------------------------------------------------------------

/** Ids of low-tier creatures that live in `biome`, optionally CR-bounded. */
export function lowMonstersByBiome(biome, minCR = 0, maxCR = 4) {
  return MONSTERS_LOW_IDS.filter((id) => {
    const m = MONSTERS_LOW[id];
    return m.biomes.includes(biome) && m.cr >= minCR && m.cr <= maxCR;
  });
}

/** Ids of low-tier creatures inside a CR band, inclusive. */
export function lowMonstersByCR(minCR, maxCR) {
  return MONSTERS_LOW_IDS.filter((id) => MONSTERS_LOW[id].cr >= minCR && MONSTERS_LOW[id].cr <= maxCR);
}

/** Encounter packs suited to a biome and party level. */
export function lowGroupsFor(biome, level = 1) {
  return Object.keys(MONSTER_GROUPS_LOW).filter((k) => {
    const g = MONSTER_GROUPS_LOW[k];
    return g.biomes.includes(biome) && level >= g.minLevel && level <= g.maxLevel;
  });
}

/** "CR 1/4" — the fractional CRs the UI needs to print correctly. */
export function crLabel(cr) {
  if (cr === 0.125) return '1/8';
  if (cr === 0.25) return '1/4';
  if (cr === 0.5) return '1/2';
  return String(cr);
}

export function lowMonsterCount() { return MONSTERS_LOW_IDS.length; }
