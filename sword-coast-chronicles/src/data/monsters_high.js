// data/monsters_high.js — the high bestiary: every creature of CR 5 through CR 24 that
// stalks the Sword Coast, the Underdark beneath it and the endless halls of Undermountain,
// plus the named bosses of the campaign and the high-tier encounter packs.
//
// PURE DATA. Nothing is imported. Nothing here mutates. The catalogue is deep frozen,
// so `rules/scaling.js` may read it freely and must clone to build a Character.
//
// Rules note (2024 Monster Manual conventions):
//   - `hpDice` is the average-hp expression; the engine rolls or averages it.
//   - `skills` values are TOTAL modifiers, not proficiency ranks.
//   - `mech.passive` is a freeform tag consumed by combat hooks; parametric tags use
//     colons, e.g. 'regeneration:10:fire,acid' or 'legendary-resistance:3'.
//   - Only the `mech` keys listed in SPEC.md §3 appear here.
//   - Bosses add `boss:true`, `intro`, `defeat`, `phases`, `legendary` and `lair`.

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
// same shape as those in monsters_low.js — every optional field present, passive
// Perception derived, XP filled from the CR table.
// ---------------------------------------------------------------------------

/** DMG experience award by Challenge Rating. */
const XP_BY_CR = {
  0: 10, 0.125: 25, 0.25: 50, 0.5: 100, 1: 200, 2: 450, 3: 700, 4: 1100,
  5: 1800, 6: 2300, 7: 2900, 8: 3900, 9: 5000, 10: 5900, 11: 7200, 12: 8400,
  13: 10000, 14: 11500, 15: 13000, 16: 15000, 17: 18000, 18: 20000, 19: 22000,
  20: 25000, 21: 33000, 22: 41000, 23: 50000, 24: 62000,
};

/** Ability modifier, the one piece of arithmetic this file is allowed. */
function abmod(score) { return Math.floor((score - 10) / 2); }

/** 'Frightful Presence' -> 'frightful-presence', for trait/action ids. */
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
    atkBonus: o.atkBonus != null ? o.atkBonus : null,
    dice: o.dice || null, dtype: o.dtype || null,
    save: o.save || null,
    target: o.target || { kind: 'self' },
    effects: o.effects || [],
    uses: o.uses || null,
    desc: o.desc || '',
    ai: o.ai || { role: 'utility', weight: 0.6 },
  };
}

/** A legendary action. `cost` is how many of the creature's legendary actions it spends. */
function legend(name, cost, desc, o = {}) {
  return {
    id: o.id || slug(name), name, cost,
    kind: o.kind || 'special',
    ref: o.ref || null,                 // action id it repeats, if any
    reach: o.reach || null, range: o.range || null,
    atkBonus: o.atkBonus != null ? o.atkBonus : null,
    dice: o.dice || null, dtype: o.dtype || null,
    save: o.save || null,
    target: o.target || { kind: 'creature', count: 1 },
    effects: o.effects || [],
    desc,
    ai: o.ai || { role: 'nuke', weight: 1 },
  };
}

/** One lair action, taken on initiative count 20 while the boss is in its lair. */
function lairAct(name, desc, o = {}) {
  return {
    id: o.id || slug(name), name, desc,
    kind: o.kind || 'save',
    range: o.range || null,
    dice: o.dice || null, dtype: o.dtype || null,
    save: o.save || null,
    target: o.target || { kind: 'area', radius: 20 },
    effects: o.effects || [],
    ai: o.ai || { role: 'control', weight: 1 },
  };
}

/** A boss lair: the arena block the battle scene reads for its backdrop and hazards. */
function lair(name, desc, actions, o = {}) {
  return {
    name, desc,
    initiative: 20,
    biome: o.biome || 'dungeon',
    music: o.music || 'boss',
    actions,
    regional: o.regional || [],
  };
}

/** A phase transition: fires once when the boss drops below `atPct` of its maximum hp. */
function phase(atPct, message, mech = null) {
  return { atPct, message, mech };
}

/** Legendary Resistance, written once because every boss that has it has the same text. */
function legendaryResistance(n) {
  return trait('Legendary Resistance',
    `${n} times a day, when it fails a saving throw, it can choose to succeed instead.`,
    { passive: `legendary-resistance:${n}` });
}

/**
 * Normalise one stat block. Everything the spec's monster shape names is present on
 * every entry; `o` supplies the real numbers and anything omitted takes a sane default.
 */
function mon(id, name, o) {
  const a = o.abilities;
  const per = o.skills && o.skills.perception != null ? o.skills.perception : abmod(a.wis);
  return {
    id, name, title: o.title || null, desc: o.desc,
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
    intro: o.intro || null, defeat: o.defeat || null,
    phases: o.phases || null,
  };
}

// ---------------------------------------------------------------------------
// Reusable trait definitions. Written once, shared by every creature that has them,
// because the rules engine keys off the `passive` tag and not the prose.
// ---------------------------------------------------------------------------

const T_MAGIC_RESIST = trait('Magic Resistance',
  "Spells slide off it; it has advantage on saving throws against magic of every kind.",
  { passive: 'magic-resistance', advSaveVs: ['spell'] });

const T_MAGIC_WEAPONS = trait('Magic Weapons',
  "Its natural attacks count as magical for the purpose of overcoming resistance.",
  { passive: 'magic-weapons' });

const T_SUNLIGHT_SENS = trait('Sunlight Sensitivity',
  "Raised in lightless places, it squints and falters under open sky or bright flame.",
  { passive: 'sunlight-sensitivity' });

const T_SUNLIGHT_WEAK = trait('Sunlight Hypersensitivity',
  "Direct sunlight sears it, and every attack it makes in the sun goes wide.",
  { passive: 'sunlight-hypersensitivity' });

const T_SPIDER_CLIMB = trait('Spider Climb',
  "It walks walls and ceilings as easily as floor, hands free.",
  { passive: 'spider-climb' });

const T_INCORPOREAL = trait('Incorporeal Movement',
  "It slides through stone and iron as though they were mist, though the passage burns.",
  { passive: 'incorporeal-movement:1d10:force' });

const T_UNDEAD_NATURE = trait('Undead Nature',
  "It does not breathe, eat, drink or sleep, and no living need can be used against it.",
  { passive: 'undead-nature' });

const T_CONSTRUCT_NATURE = trait('Construct Nature',
  "It does not breathe, eat, drink or sleep; it simply continues until broken.",
  { passive: 'construct-nature' });

const T_KEEN_SMELL = trait('Keen Smell',
  "It hunts down the wind, reading blood and fear on the air long before it sees prey.",
  { passive: 'keen-smell', skillProf: ['perception'] });

const T_AMPHIBIOUS = trait('Amphibious',
  "It breathes air and water alike.",
  { passive: 'amphibious' });

const T_OOZE_NATURE = trait('Ooze Nature',
  "It has no mind to read, no blood to poison and no eyes to blind; it simply digests.",
  { passive: 'ooze-nature' });

const T_AMORPHOUS = trait('Amorphous',
  "It pours through any opening a coin could pass, without slowing.",
  { passive: 'amorphous' });

const T_FEY_ANCESTRY = trait('Fey Ancestry',
  "Elf blood: it has advantage against being charmed, and magic cannot put it to sleep.",
  { advSaveVs: ['charmed'], condImmune: ['magic-sleep'], passive: 'fey-ancestry' });

const T_DEVILS_SIGHT = trait("Devil's Sight",
  "Magical darkness is no darkness at all to its eyes.",
  { passive: 'devils-sight' });

const T_SIEGE_MONSTER = trait('Siege Monster',
  "It deals double damage to objects and structures — doors, walls and bridges alike.",
  { passive: 'siege-monster' });

const T_LABYRINTH_RECALL = trait('Labyrinthine Recall',
  "It perfectly recalls any path it has ever walked, however tangled.",
  { passive: 'labyrinthine-recall' });

const T_CHARGE_GORE = trait('Charge',
  "If it moves 30 feet straight at a target before goring, the hit carries an extra 2d8 damage and can knock the target prone.",
  { passive: 'charge:30:2d8:prone' });

const T_RECKLESS = trait('Reckless',
  "At the start of its turn it may attack with advantage, and be attacked with advantage in turn.",
  { passive: 'reckless' });

const T_TURN_RESIST = trait('Turn Resistance',
  "It has advantage on saving throws against effects that turn undead.",
  { passive: 'turn-resistance' });

const T_TURN_IMMUNE = trait('Turning Immunity',
  "No clerical rite has any purchase on it; it cannot be turned.",
  { passive: 'turn-immunity' });

const T_REGEN_TROLL = trait('Regeneration',
  "It regains 10 hit points at the start of its turn. Fire or acid damage stops that healing for a round; only with fire or acid can it be truly killed.",
  { passive: 'regeneration:10:fire,acid' });

const T_FALSE_STONE = trait('False Appearance',
  "Motionless, it is indistinguishable from ordinary rock.",
  { passive: 'false-appearance' });

const T_STONE_CAMO = trait('Stone Camouflage',
  "It has advantage on Stealth checks made to hide in rocky terrain.",
  { passive: 'stone-camouflage', skillProf: ['stealth'] });

const T_SNOW_CAMO = trait('Snow Camouflage',
  "It has advantage on Stealth checks made to hide in snowy terrain.",
  { passive: 'snow-camouflage', skillProf: ['stealth'] });

const T_HEATED_BODY = trait('Heated Body',
  "A creature that touches it or hits it with a melee attack takes 7 (2d6) fire damage.",
  { passive: 'heated-body:2d6:fire' });

const T_HEATED_WEAPONS = trait('Heated Weapons',
  "Its metal weapons glow; each hit carries an extra 3 (1d6) fire damage.",
  { passive: 'heated-weapons:1d6:fire' });

const T_WATER_SUSCEPT = trait('Water Susceptibility',
  "For every 5 feet it moves in water, or every gallon splashed on it, it takes 1 cold damage.",
  { passive: 'water-susceptibility' });

const T_FIRE_ABSORB = trait('Fire Absorption',
  "Fire damage instead heals it, hit point for hit point.",
  { passive: 'absorb:fire' });

const T_LIGHTNING_ABSORB = trait('Lightning Absorption',
  "Lightning damage instead heals it, hit point for hit point.",
  { passive: 'absorb:lightning' });

const T_ILLUMINATION = trait('Illumination',
  "It sheds bright light in a 15-foot radius and dim light for 15 feet beyond.",
  { passive: 'illumination:15' });

const T_PACK_TACTICS = trait('Pack Tactics',
  "It fights best in a crowd, striking whenever a companion has the quarry occupied.",
  { passive: 'pack-tactics' });

// Fiend defences. Written as constants because every devil and every demon shares them.
const DEVIL_RESIST = ['cold', 'bludgeoning-nonmagical', 'piercing-nonmagical', 'slashing-nonmagical'];
const DEVIL_IMMUNE = ['fire', 'poison'];
const DEMON_RESIST = ['cold', 'fire', 'lightning', 'bludgeoning-nonmagical', 'piercing-nonmagical', 'slashing-nonmagical'];
const GOLEM_IMMUNE = ['poison', 'psychic', 'bludgeoning-nonmagical', 'piercing-nonmagical', 'slashing-nonmagical'];
const UNDEAD_COND = ['exhaustion', 'poisoned'];
const GOLEM_COND = ['charmed', 'exhaustion', 'frightened', 'paralyzed', 'petrified', 'poisoned'];

const T_DEMON_MAGIC_RESIST = T_MAGIC_RESIST;

const ALL = [];

// ===========================================================================
// GIANTS AND TROLLKIN — the Sword Mountains, Icespire Peak, the high passes above
// Phandalin, and whatever crawls down out of them when the snow gets deep.
// ===========================================================================

ALL.push(
  mon('troll', 'Troll', {
    desc: "Rubbery green hide over a frame all elbows and hunger, and a wound that closes while you watch. Every hunter on the Triboar Trail carries a torch for exactly one reason.",
    cr: 5, type: 'giant', size: 'large', ac: 15, acNote: 'natural armor',
    hpDice: '8d10+40', speed: 30, abilities: { str: 18, dex: 13, con: 20, int: 7, wis: 9, cha: 7 },
    skills: { perception: 2 }, senses: { darkvision: 60 }, languages: ['Giant'],
    traits: [T_KEEN_SMELL, T_REGEN_TROLL],
    actions: [
      multi("It bites once and rakes with both claws.", [['bite', 1], ['claw', 2]]),
      melee('Bite', 7, '1d6+4', 'piercing'),
      melee('Claw', 7, '2d6+4', 'slashing'),
    ],
    ai: { archetype: 'brute', aggression: 0.95, selfPreserve: 0.15, preferredRange: 5 },
    loot: { gold: '4d10', table: [['potion-healing', 0.25], ['gem-jade', 0.15], ['gem-amber', 0.12], ['rations', 0.2]] },
    sprite: 'troll', biomes: ['hills', 'mountain', 'marsh', 'cave', 'forest', 'underdark'], groupSize: [1, 3],
    faction: 'giant',
  }),

  mon('hill-giant', 'Hill Giant', {
    desc: "Sixteen feet of appetite wrapped in stitched hides, it wanders down from the Sword Mountains whenever a village smells of bread. It thinks in terms of what fits in its mouth.",
    cr: 5, type: 'giant', size: 'huge', ac: 13, acNote: 'natural armor',
    hpDice: '10d12+40', speed: 40, abilities: { str: 21, dex: 8, con: 19, int: 5, wis: 9, cha: 6 },
    skills: { perception: 2 }, languages: ['Giant'],
    traits: [T_SIEGE_MONSTER],
    actions: [
      multi("It makes two greatclub attacks.", [['greatclub', 2]]),
      melee('Greatclub', 8, '3d8+5', 'bludgeoning', { reach: 10 }),
      ranged('Boulder', 8, '3d10+5', 'bludgeoning', [60, 240], { ai: { role: 'nuke', weight: 1.1 } }),
    ],
    ai: { archetype: 'brute', aggression: 0.85, selfPreserve: 0.3, preferredRange: 10 },
    loot: { gold: '5d10', table: [['greatclub', 0.2], ['belt-of-hill-giant-strength', 0.03], ['gem-quartz', 0.3], ['gem-amber', 0.15], ['sack', 0.4]] },
    sprite: 'giant', tint: '#9a8a5a', biomes: ['hills', 'mountain', 'plains', 'forest'], groupSize: [1, 3],
    faction: 'giant',
  }),

  mon('stone-giant', 'Stone Giant', {
    desc: "Grey as the cliff it steps out of, and just as unhurried. Stone giants hold that the surface world is a dream; they walk through it politely, and hurl boulders at whatever wakes them.",
    cr: 7, type: 'giant', size: 'huge', ac: 17, acNote: 'natural armor',
    hpDice: '11d12+55', speed: 40, abilities: { str: 23, dex: 15, con: 20, int: 10, wis: 12, cha: 9 },
    saveProf: ['dex', 'con', 'wis'], skills: { athletics: 12, perception: 4 },
    senses: { darkvision: 60 }, languages: ['Giant'],
    traits: [
      T_STONE_CAMO,
      trait('Boulder Ricochet', "Its thrown stones skip off walls at impossible angles; a boulder that hits can knock a creature prone.", { passive: 'boulder-ricochet' }),
    ],
    actions: [
      multi("It makes two greatclub attacks.", [['greatclub', 2]]),
      melee('Greatclub', 9, '3d8+6', 'bludgeoning', { reach: 15 }),
      ranged('Boulder', 9, '4d10+6', 'bludgeoning', [60, 240], {
        effects: [{ kind: 'condition', id: 'prone', save: { ability: 'str', dc: 17 } }],
        ai: { role: 'nuke', weight: 1.3 },
      }),
    ],
    reactions: [util('Rock Catching', {
      desc: "If a rock or similar missile would hit it, it may catch the missile instead and take no damage.",
      ai: { role: 'utility', weight: 1 },
    })],
    ai: { archetype: 'archer', aggression: 0.6, selfPreserve: 0.5, preferredRange: 60 },
    loot: { gold: '8d10', table: [['gem-moonstone', 0.25], ['gem-onyx', 0.2], ['belt-of-stone-giant-strength', 0.02], ['stone-of-controlling-earth-elementals', 0.02]] },
    sprite: 'giant', tint: '#8a8a92', biomes: ['mountain', 'hills', 'cave', 'underdark'], groupSize: [1, 2],
    faction: 'giant',
  }),

  mon('frost-giant', 'Frost Giant', {
    desc: "A raider out of the Spine of the World, blue-white and bearded with ice, who reckons wealth in what he has taken and glory in who saw him take it. Icespire Peak has grown crowded with them.",
    cr: 8, type: 'giant', size: 'huge', ac: 15, acNote: 'patchwork armor',
    hpDice: '12d12+60', speed: 40, abilities: { str: 23, dex: 9, con: 21, int: 9, wis: 10, cha: 12 },
    saveProf: ['con', 'wis', 'cha'], skills: { athletics: 9, perception: 3 },
    immune: ['cold'], languages: ['Giant'],
    traits: [T_SNOW_CAMO],
    actions: [
      multi("It makes two greataxe attacks.", [['greataxe', 2]]),
      melee('Greataxe', 9, '3d12+6', 'slashing', { reach: 10 }),
      ranged('Boulder', 9, '4d10+6', 'bludgeoning', [60, 240]),
    ],
    ai: { archetype: 'brute', aggression: 0.9, selfPreserve: 0.35, preferredRange: 10 },
    loot: { gold: '2d10*10', table: [['greataxe', 0.25], ['potion-giant-strength-frost', 0.08], ['belt-of-frost-giant-strength', 0.02], ['gem-diamond', 0.05], ['gem-moonstone', 0.25], ['ring-of-warmth', 0.05]] },
    sprite: 'giant', tint: '#8fb6cc', biomes: ['tundra', 'mountain', 'hills', 'cave'], groupSize: [1, 4],
    faction: 'giant',
  }),

  mon('fire-giant', 'Fire Giant', {
    desc: "Coal-black skin, flame-red hair, and a smith's arms — the finest weaponsmiths in Faerun and the cruellest slavers. Where one walks, the ground is scorched in the shape of its boots.",
    cr: 9, type: 'giant', size: 'huge', ac: 18, acNote: 'plate armor',
    hpDice: '13d12+65', speed: 30, abilities: { str: 25, dex: 9, con: 23, int: 10, wis: 14, cha: 13 },
    saveProf: ['dex', 'con', 'cha'], skills: { athletics: 11, perception: 6 },
    immune: ['fire'], languages: ['Giant'],
    traits: [T_HEATED_WEAPONS],
    actions: [
      multi("It makes two greatsword attacks.", [['greatsword', 2]]),
      melee('Greatsword', 11, '6d6+7', 'slashing', { reach: 10 }),
      ranged('Rock', 11, '4d10+7', 'bludgeoning', [60, 240]),
    ],
    ai: { archetype: 'brute', aggression: 0.9, selfPreserve: 0.35, preferredRange: 10 },
    loot: { gold: '3d10*10', table: [['greatsword', 0.3], ['plate-armor', 0.08], ['flame-tongue', 0.03], ['belt-of-fire-giant-strength', 0.02], ['gem-ruby', 0.12], ['smiths-tools', 0.2]] },
    sprite: 'giant', tint: '#5a3a3a', biomes: ['mountain', 'cave', 'ash-waste', 'underdark'], groupSize: [1, 3],
    faction: 'giant',
  }),

  mon('cloud-giant', 'Cloud Giant', {
    desc: "Pale as fog and dressed like a lord, it holds that the world below is a garden it is entitled to prune. It will talk first — cloud giants love a wager — and only then reach for the morningstar.",
    cr: 9, type: 'giant', size: 'huge', ac: 14, acNote: 'natural armor',
    hpDice: '16d12+96', speed: 40, abilities: { str: 27, dex: 10, con: 22, int: 12, wis: 16, cha: 16 },
    saveProf: ['con', 'wis', 'cha'], skills: { insight: 7, perception: 7 },
    senses: {}, languages: ['Common', 'Giant'],
    traits: [
      trait('Keen Smell', "It smells a hidden creature on the wind, and knows exactly how many of you there are.", { passive: 'keen-smell', skillProf: ['perception'] }),
      trait('Innate Spellcasting', "It calls up fog, gusts of wind and feather fall at will, and can turn itself misty and gaseous once a day.", { passive: 'innate-casting:cha:17' }),
    ],
    actions: [
      multi("It makes two morningstar attacks.", [['morningstar', 2]]),
      melee('Morningstar', 12, '3d8+8', 'piercing', { reach: 10 }),
      ranged('Rock', 12, '4d10+8', 'bludgeoning', [60, 240]),
      saveAct('Fog Cloud', {
        range: 120, save: { ability: 'wis', dc: 17, onSuccess: 'negate' },
        target: { kind: 'sphere', radius: 20 },
        effects: [{ kind: 'condition', id: 'blinded', duration: '1 minute' }],
        desc: "A bank of white fog rolls in and swallows the field.",
        uses: { max: 3, recharge: 'long' },
        ai: { role: 'control', weight: 1.2 },
      }),
    ],
    ai: { archetype: 'brute', aggression: 0.7, selfPreserve: 0.5, preferredRange: 10 },
    loot: { gold: '4d10*10', table: [['morningstar', 0.2], ['gem-emerald', 0.12], ['gem-black-pearl', 0.1], ['belt-of-cloud-giant-strength', 0.02], ['potion-flying', 0.1], ['clothes-fine', 0.3]] },
    sprite: 'giant', tint: '#c8c8dc', biomes: ['mountain', 'hills', 'plains'], groupSize: [1, 2],
    faction: 'giant',
  }),

  mon('ettin', 'Ettin', {
    desc: "Two heads, two names, one filthy body, and a running argument that never ends. Neither head sleeps at the same time, which makes an ettin's camp a very poor place to sneak past.",
    cr: 4, type: 'giant', size: 'large', ac: 12, acNote: 'natural armor',
    hpDice: '10d10+30', speed: 40, abilities: { str: 21, dex: 8, con: 17, int: 6, wis: 10, cha: 8 },
    skills: { perception: 4 }, senses: { darkvision: 60 }, languages: ['Giant', 'Orc'],
    traits: [
      trait('Two Heads', "It has advantage on Perception checks and on saves against being blinded, charmed, deafened, frightened, stunned or knocked unconscious.", { passive: 'two-heads', advVs: ['charmed', 'frightened'] }),
      trait('Wakeful', "One head is always awake.", { passive: 'wakeful' }),
    ],
    actions: [
      multi("It attacks once with the battleaxe and once with the morningstar.", [['battleaxe', 1], ['morningstar', 1]]),
      melee('Battleaxe', 7, '2d8+5', 'slashing'),
      melee('Morningstar', 7, '2d8+5', 'piercing'),
    ],
    ai: { archetype: 'brute', aggression: 0.85, selfPreserve: 0.3, preferredRange: 5 },
    loot: { gold: '4d10', table: [['battleaxe', 0.25], ['morningstar', 0.2], ['gem-quartz', 0.2], ['sack', 0.3]] },
    sprite: 'ettin', biomes: ['hills', 'mountain', 'cave', 'ruins'], groupSize: [1, 2],
    faction: 'giant',
  }),

  mon('cyclops', 'Cyclops', {
    desc: "A one-eyed herdsman-giant with no head for numbers and a terrible aim, which it makes up for by throwing something the size of a cart. It counts its sheep, its enemies and its grudges on one hand.",
    cr: 6, type: 'giant', size: 'huge', ac: 14, acNote: 'natural armor',
    hpDice: '13d12+52', speed: 30, abilities: { str: 22, dex: 11, con: 18, int: 8, wis: 6, cha: 10 },
    senses: {}, languages: ['Giant'],
    traits: [trait('Poor Depth Perception', "With one eye it misjudges distance; it has disadvantage on any attack against a target more than 30 feet away.", { passive: 'poor-depth-perception:30' })],
    actions: [
      multi("It makes two greatclub attacks.", [['greatclub', 2]]),
      melee('Greatclub', 9, '3d8+6', 'bludgeoning', { reach: 10 }),
      ranged('Rock', 9, '4d10+6', 'bludgeoning', [30, 120]),
    ],
    ai: { archetype: 'brute', aggression: 0.85, selfPreserve: 0.3, preferredRange: 10 },
    loot: { gold: '6d10', table: [['greatclub', 0.2], ['gem-amber', 0.2], ['gem-jade', 0.1], ['rations', 0.3]] },
    sprite: 'cyclops', biomes: ['hills', 'mountain', 'cave', 'coast'], groupSize: [1, 2],
    faction: 'giant',
  }),

  mon('fomorian', 'Fomorian', {
    desc: "A giant the Feywild cursed and the Underdark kept, twisted into a lopsided ruin of itself. Its evil eye can pass that same curse along, and it enjoys doing so.",
    cr: 8, type: 'giant', size: 'huge', ac: 14, acNote: 'natural armor',
    hpDice: '14d12+70', speed: 30, abilities: { str: 23, dex: 10, con: 20, int: 9, wis: 14, cha: 6 },
    skills: { perception: 8, stealth: 3 }, senses: { darkvision: 120 }, languages: ['Giant', 'Undercommon'],
    traits: [],
    actions: [
      multi("It makes two greatclub attacks, or one greatclub attack and one use of its Evil Eye.", [['greatclub', 2]]),
      melee('Greatclub', 9, '3d8+6', 'bludgeoning', { reach: 10 }),
      saveAct('Evil Eye', {
        range: 60, save: { ability: 'cha', dc: 14, onSuccess: 'half' },
        dice: '5d10', dtype: 'psychic',
        effects: [{ kind: 'condition', id: 'frightened', duration: '1 minute' }],
        desc: "It fixes its swollen eye on a creature it can see; the curse burns through the mind.",
        ai: { role: 'nuke', weight: 1.4 },
      }),
      saveAct('Curse of Deformity', {
        range: 60, save: { ability: 'cha', dc: 14, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'cursed', duration: 'until dispelled' }],
        uses: { max: 1, recharge: 'long' },
        desc: "The victim's body twists to match the fomorian's own; its Charisma is halved until the curse is lifted.",
        ai: { role: 'debuff', weight: 1 },
      }),
    ],
    ai: { archetype: 'brute', aggression: 0.8, selfPreserve: 0.4, preferredRange: 10 },
    loot: { gold: '8d10', table: [['gem-moonstone', 0.2], ['gem-onyx', 0.15], ['potion-greater-healing', 0.15]] },
    sprite: 'fomorian', biomes: ['underdark', 'cave', 'dungeon'], groupSize: [1, 2],
    faction: 'giant',
  }),
);

// ===========================================================================
// MONSTROSITIES — Wyvern Tor, the Sword Mountains, the Kryptgarden verges, and the
// gnawed tunnels under all of them.
// ===========================================================================

ALL.push(
  mon('minotaur', 'Minotaur', {
    desc: "Bull-headed and Baphomet-blessed, it was bred for the maze and never forgets one. It lowers its horns, the floor shakes, and after that there is only the charge.",
    cr: 3, type: 'monstrosity', size: 'large', ac: 14, acNote: 'natural armor',
    hpDice: '9d10+27', speed: 40, abilities: { str: 18, dex: 11, con: 16, int: 6, wis: 16, cha: 9 },
    skills: { perception: 7 }, senses: { darkvision: 60 }, languages: ['Abyssal'],
    traits: [T_CHARGE_GORE, T_LABYRINTH_RECALL, T_RECKLESS],
    actions: [
      melee('Greataxe', 6, '2d12+4', 'slashing'),
      melee('Gore', 6, '2d8+4', 'piercing'),
    ],
    ai: { archetype: 'brute', aggression: 0.95, selfPreserve: 0.2, preferredRange: 5 },
    loot: { gold: '3d10', table: [['greataxe', 0.3], ['gem-onyx', 0.12], ['goblin-totem', 0.05]] },
    sprite: 'minotaur', biomes: ['dungeon', 'cave', 'ruins', 'underdark', 'crypt'], groupSize: [1, 3],
  }),

  mon('minotaur-skeleton', 'Minotaur Skeleton', {
    desc: "The horns outlast the hide. Wave Echo Cave is full of them, still walking the drift they died guarding, still lowering a skull with nothing behind the eyes.",
    cr: 2, type: 'undead', size: 'large', ac: 12, acNote: 'natural armor',
    hpDice: '9d10+18', speed: 40, abilities: { str: 18, dex: 11, con: 15, int: 6, wis: 8, cha: 5 },
    vuln: ['bludgeoning'], immune: ['poison'], condImmune: ['exhaustion', 'poisoned'],
    senses: { darkvision: 60 }, languages: ['Abyssal (understands only)'],
    traits: [T_UNDEAD_NATURE, T_CHARGE_GORE],
    actions: [
      melee('Greataxe', 6, '2d12+4', 'slashing'),
      melee('Gore', 6, '2d8+4', 'piercing'),
    ],
    ai: { archetype: 'brute', aggression: 0.9, selfPreserve: 0, preferredRange: 5 },
    loot: { gold: '', table: [['greataxe', 0.2], ['gem-quartz', 0.1]] },
    sprite: 'minotaur', tint: '#d8d2bc', biomes: ['crypt', 'dungeon', 'mine', 'ruins'], groupSize: [1, 3],
    faction: 'undead',
  }),

  mon('wyvern', 'Wyvern', {
    desc: "A dragon's poor cousin — two legs, two wings, and a barbed tail that does all the thinking. Wyvern Tor is named for the pair that nested there when Phandalin was young.",
    cr: 6, type: 'dragon', size: 'large', ac: 13, acNote: 'natural armor',
    hpDice: '13d10+39', speed: 20, fly: 80, abilities: { str: 19, dex: 10, con: 16, int: 5, wis: 12, cha: 6 },
    skills: { perception: 4 }, senses: { darkvision: 60 }, languages: [],
    actions: [
      multi("It bites and stings.", [['bite', 1], ['stinger', 1]]),
      melee('Bite', 7, '2d6+4', 'piercing', { reach: 10 }),
      melee('Stinger', 7, '2d6+4', 'piercing', {
        save: { ability: 'con', dc: 15, onSuccess: 'half' },
        effects: [{ kind: 'damage', dice: '7d6', type: 'poison' }, { kind: 'condition', id: 'poisoned', duration: '1 minute' }],
        desc: "The barb drives in and pumps venom: DC 15 Constitution save or take 24 (7d6) poison damage, half on a success.",
        ai: { role: 'nuke', weight: 1.6 },
      }),
    ],
    ai: { archetype: 'skirmisher', aggression: 0.85, selfPreserve: 0.4, preferredRange: 10 },
    loot: { gold: '5d10', table: [['gem-amber', 0.2], ['gem-jade', 0.15], ['poisoners-kit', 0.1], ['potion-resistance', 0.08]] },
    sprite: 'wyvern', biomes: ['mountain', 'hills', 'coast', 'ruins'], groupSize: [1, 2],
  }),

  mon('manticore', 'Manticore', {
    desc: "A lion's body, a man's cruel face, bat wings, and a tail that fires iron spikes like a ballista. It talks while it hunts, mostly to hear itself, and it will bargain if the offer is meat.",
    cr: 3, type: 'monstrosity', size: 'large', ac: 14, acNote: 'natural armor',
    hpDice: '11d10+11', speed: 30, fly: 50, abilities: { str: 17, dex: 16, con: 17, int: 7, wis: 12, cha: 8 },
    senses: { darkvision: 60 }, languages: ['Common'],
    traits: [trait('Tail Spike Regrowth', "It carries two dozen spikes at a time and grows them back overnight.", { passive: 'tail-spike-regrowth:24' })],
    actions: [
      multi("It bites and rakes with both claws, or fires three tail spikes.", [['bite', 1], ['claw', 2]]),
      melee('Bite', 5, '1d8+3', 'piercing'),
      melee('Claw', 5, '1d6+3', 'slashing'),
      ranged('Tail Spike', 5, '1d8+3', 'piercing', [100, 200], { ai: { role: 'nuke', weight: 1.2 } }),
    ],
    ai: { archetype: 'archer', aggression: 0.8, selfPreserve: 0.45, preferredRange: 60 },
    loot: { gold: '4d10', table: [['arrow', 0.3], ['gem-amber', 0.15], ['potion-healing', 0.15]] },
    sprite: 'manticore', biomes: ['hills', 'mountain', 'ruins', 'forest'], groupSize: [1, 3],
  }),

  mon('chimera', 'Chimera', {
    desc: "Lion, goat and dragon fused into one screaming argument of a creature. The dragon head breathes fire, the goat head rams, and the lion head does the eating.",
    cr: 6, type: 'monstrosity', size: 'large', ac: 14, acNote: 'natural armor',
    hpDice: '12d10+48', speed: 30, fly: 60, abilities: { str: 19, dex: 11, con: 19, int: 3, wis: 14, cha: 10 },
    skills: { perception: 8 }, senses: { darkvision: 60 }, languages: ['Draconic (understands only)'],
    actions: [
      multi("It bites, gores and rakes — and breathes fire when it can.", [['bite', 1], ['horns', 1], ['claws', 1]]),
      melee('Bite', 7, '2d6+4', 'piercing'),
      melee('Horns', 7, '1d12+4', 'bludgeoning'),
      melee('Claws', 7, '2d6+4', 'slashing'),
      saveAct('Fire Breath', {
        dice: '7d8', dtype: 'fire',
        save: { ability: 'dex', dc: 15, onSuccess: 'half' },
        target: { kind: 'cone', length: 15 },
        uses: { max: 1, recharge: '5-6' },
        desc: "The dragon head exhales a 15-foot cone of flame.",
        ai: { role: 'aoe', weight: 2 },
      }),
    ],
    ai: { archetype: 'brute', aggression: 0.9, selfPreserve: 0.3, preferredRange: 5 },
    loot: { gold: '6d10', table: [['gem-ruby', 0.08], ['gem-jade', 0.15], ['potion-fire-breath', 0.1], ['scroll-fireball', 0.05]] },
    sprite: 'chimera', biomes: ['mountain', 'hills', 'ruins', 'ash-waste'], groupSize: [1, 1],
  }),

  mon('griffon', 'Griffon', {
    desc: "Eagle before, lion behind, and utterly single-minded about horses. Neverwinter's riders raise them from the egg; the wild ones of the Sword Mountains take the mounts and leave the riders.",
    cr: 2, type: 'monstrosity', size: 'large', ac: 12, hpDice: '7d10+21',
    speed: 30, fly: 80, abilities: { str: 18, dex: 15, con: 16, int: 2, wis: 13, cha: 8 },
    skills: { perception: 5 }, senses: { darkvision: 60 }, languages: [],
    traits: [trait('Keen Sight', "It spots a rabbit at a mile and a horse at three.", { passive: 'keen-sight', skillProf: ['perception'] })],
    actions: [
      multi("It bites and rakes with its claws.", [['beak', 1], ['claws', 1]]),
      melee('Beak', 6, '1d8+4', 'piercing'),
      melee('Claws', 6, '2d6+4', 'slashing'),
    ],
    ai: { archetype: 'skirmisher', aggression: 0.75, selfPreserve: 0.45, preferredRange: 5 },
    loot: { gold: '2d10', table: [['gem-quartz', 0.15], ['rations', 0.2]] },
    sprite: 'griffon', biomes: ['mountain', 'hills', 'plains', 'coast'], groupSize: [1, 3],
  }),

  mon('hippogriff', 'Hippogriff', {
    desc: "Half eagle, half horse, wholly bad-tempered in nesting season. Farmers along the Triboar Trail lose more goats to hippogriffs than to wolves and never quite believe it.",
    cr: 1, type: 'monstrosity', size: 'large', ac: 11, hpDice: '3d10+3',
    speed: 40, fly: 60, abilities: { str: 17, dex: 13, con: 13, int: 2, wis: 12, cha: 8 },
    skills: { perception: 5 }, languages: [],
    traits: [trait('Keen Sight', "Its eyes are an eagle's; little escapes them by daylight.", { passive: 'keen-sight', skillProf: ['perception'] })],
    actions: [
      multi("It strikes with beak and claws.", [['beak', 1], ['claws', 1]]),
      melee('Beak', 5, '1d10+3', 'piercing'),
      melee('Claws', 5, '2d6+3', 'slashing'),
    ],
    ai: { archetype: 'skirmisher', aggression: 0.6, selfPreserve: 0.5, preferredRange: 5 },
    loot: { gold: '1d10', table: [['rations', 0.2]] },
    sprite: 'hippogriff', biomes: ['plains', 'hills', 'forest', 'mountain'], groupSize: [1, 4],
  }),

  mon('basilisk', 'Basilisk', {
    desc: "A squat eight-legged lizard with a gullet full of stone dust and eyes that end arguments permanently. Its lair is easy to identify: it is furnished with statues in poses of great surprise.",
    cr: 3, type: 'monstrosity', size: 'medium', ac: 15, acNote: 'natural armor',
    hpDice: '8d8+16', speed: 20, abilities: { str: 16, dex: 8, con: 15, int: 2, wis: 8, cha: 7 },
    senses: { darkvision: 60 }, languages: [],
    traits: [trait('Petrifying Gaze', "Meet its eyes and the flesh begins to set: DC 12 Constitution save or be restrained, then petrified at the start of your next turn unless you save again.", { passive: 'petrifying-gaze:12:30' })],
    actions: [melee('Bite', 5, '2d6+3', 'piercing', { effects: [{ kind: 'damage', dice: '2d6', type: 'poison' }] })],
    ai: { archetype: 'brute', aggression: 0.8, selfPreserve: 0.4, preferredRange: 5 },
    loot: { gold: '2d10', table: [['gem-quartz', 0.2], ['gem-malachite', 0.15], ['gem-onyx', 0.08]] },
    sprite: 'basilisk', biomes: ['cave', 'ruins', 'underdark', 'dungeon', 'hills'], groupSize: [1, 2],
  }),

  mon('medusa', 'Medusa', {
    desc: "Once beautiful, cursed to be looked at once and never again. She keeps her gallery of statues arranged as company and speaks to them by name; do not look up when she asks you to.",
    cr: 6, type: 'monstrosity', size: 'medium', ac: 15, acNote: 'natural armor',
    hpDice: '17d8+51', speed: 30, abilities: { str: 10, dex: 15, con: 16, int: 12, wis: 13, cha: 15 },
    skills: { deception: 5, insight: 4, perception: 4, stealth: 5 },
    senses: { darkvision: 60 }, languages: ['Common'],
    traits: [trait('Petrifying Gaze', "At the start of its turn, any creature within 30 feet that can see her eyes must make a DC 14 Constitution save or begin turning to stone.", { passive: 'petrifying-gaze:14:30' })],
    actions: [
      multi("She looses arrows, or strikes with snake hair and shortsword.", [['snake-hair', 1], ['shortsword', 1]]),
      melee('Snake Hair', 5, '1d4+2', 'piercing', { effects: [{ kind: 'damage', dice: '4d6', type: 'poison' }] }),
      melee('Shortsword', 5, '1d6+2', 'piercing'),
      ranged('Longbow', 5, '1d8+2', 'piercing', [150, 600], { effects: [{ kind: 'damage', dice: '2d6', type: 'poison' }] }),
    ],
    ai: { archetype: 'skirmisher', aggression: 0.7, selfPreserve: 0.5, preferredRange: 30 },
    loot: { gold: '4d10*5', table: [['longbow', 0.2], ['gem-emerald', 0.1], ['gem-pearl', 0.15], ['mirror', 0.4], ['clothes-fine', 0.2]] },
    sprite: 'medusa', biomes: ['ruins', 'dungeon', 'crypt', 'cave'], groupSize: [1, 1],
  }),

  mon('gorgon', 'Gorgon', {
    desc: "A bull of black iron plates that snorts petrifying vapour and charges anything that moves. Nothing eats it and nothing tames it; the Sword Mountains simply have them.",
    cr: 5, type: 'monstrosity', size: 'large', ac: 19, acNote: 'natural armor',
    hpDice: '11d10+55', speed: 40, abilities: { str: 20, dex: 11, con: 18, int: 2, wis: 12, cha: 7 },
    skills: { perception: 4 }, senses: { darkvision: 60 }, languages: [],
    traits: [T_CHARGE_GORE],
    actions: [
      melee('Gore', 8, '2d12+5', 'piercing'),
      melee('Hooves', 8, '2d10+5', 'bludgeoning'),
      saveAct('Petrifying Breath', {
        save: { ability: 'con', dc: 13, onSuccess: 'negate' },
        target: { kind: 'cone', length: 30 },
        effects: [{ kind: 'condition', id: 'restrained', duration: '1 round' }, { kind: 'condition', id: 'petrified', duration: 'until dispelled' }],
        uses: { max: 1, recharge: '5-6' },
        desc: "It exhales a 30-foot cone of grey-green vapour; those caught begin to set like cooling iron.",
        ai: { role: 'aoe', weight: 2.2 },
      }),
    ],
    ai: { archetype: 'brute', aggression: 0.95, selfPreserve: 0.2, preferredRange: 5 },
    loot: { gold: '', table: [['gem-onyx', 0.2], ['gem-malachite', 0.2], ['platinum-ingot', 0.05]] },
    sprite: 'gorgon', biomes: ['hills', 'mountain', 'plains', 'ruins'], groupSize: [1, 2],
  }),

  mon('hydra', 'Hydra', {
    desc: "Five heads on five long necks, and two more for every one you take off unless the stump is burned. It lives in the Mere of Dead Men and it never entirely sleeps.",
    cr: 8, type: 'monstrosity', size: 'huge', ac: 15, acNote: 'natural armor',
    hpDice: '15d12+75', speed: 30, swim: 30, abilities: { str: 20, dex: 12, con: 20, int: 2, wis: 10, cha: 7 },
    skills: { perception: 6 }, senses: { darkvision: 60 }, languages: [],
    traits: [
      trait('Hold Breath', "It can hold its breath for an hour, which is longer than most swamps are deep.", { passive: 'hold-breath:1hr' }),
      trait('Multiple Heads', "It has five heads. Twenty-five damage to one severs it, and two grow back at the start of its next turn unless the stump takes fire damage first.", { passive: 'multiple-heads:5:25' }),
      trait('Reactive Heads', "For each head it still has, it gets one extra reaction each round.", { passive: 'reactive-heads' }),
      trait('Wakeful', "While it sleeps, at least one head is awake.", { passive: 'wakeful' }),
    ],
    actions: [
      multi("It makes as many bite attacks as it has heads.", [['bite', 5]]),
      melee('Bite', 8, '1d10+5', 'piercing', { reach: 10 }),
    ],
    ai: { archetype: 'brute', aggression: 0.9, selfPreserve: 0.2, preferredRange: 10 },
    loot: { gold: '6d10', table: [['gem-emerald', 0.1], ['gem-pearl', 0.15], ['potion-superior-healing', 0.1], ['alchemists-fire', 0.2]] },
    sprite: 'hydra', biomes: ['marsh', 'coast', 'cave'], groupSize: [1, 1],
  }),

  mon('roper', 'Roper', {
    desc: "It is a stalagmite until it is not. Six sticky tendrils take you off your feet and reel you toward a mouth of grinding teeth set in the middle of the rock.",
    cr: 5, type: 'monstrosity', size: 'large', ac: 20, acNote: 'natural armor',
    hpDice: '11d10+33', speed: 10, climb: 10, abilities: { str: 18, dex: 8, con: 17, int: 7, wis: 16, cha: 6 },
    skills: { perception: 6, stealth: 5 }, senses: { darkvision: 60 }, languages: [],
    traits: [
      T_FALSE_STONE,
      T_SPIDER_CLIMB,
      trait('Grasping Tendrils', "It has six tendrils, each with 10 hit points; a severed tendril regrows in a day.", { passive: 'grasping-tendrils:6:10' }),
    ],
    actions: [
      multi("It reels with four tendrils and bites whatever it has drawn in.", [['tendril', 4], ['bite', 1]]),
      melee('Tendril', 7, '1d6+4', 'bludgeoning', {
        reach: 50,
        effects: [{ kind: 'condition', id: 'grappled', save: { ability: 'str', dc: 15 } }],
        desc: "The tendril adheres; the target is grappled and reeled 25 feet closer at the start of the roper's turn.",
        ai: { role: 'control', weight: 1.6 },
      }),
      melee('Bite', 7, '4d8+4', 'piercing'),
    ],
    ai: { archetype: 'ambusher', aggression: 0.8, selfPreserve: 0.2, preferredRange: 40 },
    loot: { gold: '4d10', table: [['gem-onyx', 0.2], ['gem-moonstone', 0.12], ['ore-sample-phandalin', 0.15], ['potion-healing', 0.15]] },
    sprite: 'roper', biomes: ['cave', 'underdark', 'dungeon', 'mine'], groupSize: [1, 2],
  }),

  mon('hook-horror', 'Hook Horror', {
    desc: "A vulture's beak on a beetle's body, hauling itself along Underdark ceilings by two enormous hooks. It sees nothing at all and hears the shape of the whole cavern.",
    cr: 3, type: 'monstrosity', size: 'large', ac: 15, acNote: 'natural armor',
    hpDice: '10d10+20', speed: 30, climb: 30, abilities: { str: 18, dex: 10, con: 15, int: 6, wis: 12, cha: 7 },
    skills: { perception: 3 }, senses: { blindsight: 60 }, languages: ['Hook Horror'],
    traits: [
      trait('Echolocation', "It maps the dark by sound; deafen it and it is blind.", { passive: 'echolocation' }),
      trait('Keen Hearing', "It hears a boot scuff three chambers away.", { passive: 'keen-hearing', skillProf: ['perception'] }),
    ],
    actions: [
      multi("It strikes with both hooks.", [['hook', 2]]),
      melee('Hook', 6, '1d6+4', 'piercing'),
    ],
    ai: { archetype: 'ambusher', aggression: 0.8, selfPreserve: 0.35, preferredRange: 5 },
    loot: { gold: '2d10', table: [['gem-quartz', 0.15], ['ore-sample-phandalin', 0.15]] },
    sprite: 'hook-horror', biomes: ['underdark', 'cave', 'mine', 'dungeon'], groupSize: [2, 5],
  }),

  mon('phase-spider', 'Phase Spider', {
    desc: "It bites from the Ethereal, where your sword is not, and steps back out before the poison takes hold. Trappers on the Neverwinter Wood road call its empty webs ghost lace.",
    cr: 3, type: 'monstrosity', size: 'large', ac: 13, acNote: 'natural armor',
    hpDice: '5d10+5', speed: 30, climb: 30, abilities: { str: 15, dex: 15, con: 12, int: 6, wis: 10, cha: 6 },
    skills: { stealth: 6 }, senses: { darkvision: 60 }, languages: [],
    traits: [
      trait('Ethereal Jaunt', "As a bonus action it steps from the Material Plane to the Ethereal and back, unreachable in between.", { passive: 'ethereal-jaunt' }),
      T_SPIDER_CLIMB,
      trait('Web Walker', "Webbing does not slow it, its own or another's.", { passive: 'web-walker' }),
    ],
    actions: [melee('Bite', 4, '1d10+2', 'piercing', {
      save: { ability: 'con', dc: 11, onSuccess: 'half' },
      effects: [{ kind: 'damage', dice: '4d8', type: 'poison' }, { kind: 'condition', id: 'poisoned', duration: '1 hour' }],
      desc: "DC 11 Constitution save or take 18 (4d8) poison damage; a creature dropped to 0 this way is stable but paralyzed for an hour.",
    })],
    bonusActions: [util('Ethereal Jaunt', { desc: "It shifts to the Ethereal Plane, or back to the Material.", ai: { role: 'utility', weight: 1.3 } })],
    ai: { archetype: 'ambusher', aggression: 0.75, selfPreserve: 0.7, preferredRange: 5 },
    loot: { gold: '3d10', table: [['gem-amber', 0.2], ['antitoxin', 0.15], ['rope-silk', 0.15], ['potion-invisibility', 0.05]] },
    sprite: 'spider', tint: '#8a6ad0', biomes: ['underdark', 'cave', 'forest', 'dungeon', 'ruins'], groupSize: [1, 4],
  }),

  mon('giant-scorpion', 'Giant Scorpion', {
    desc: "Six feet of armoured spite with a sting arched over its back. They came north with Calishite caravans generations ago and have thrived ever since in the sun-warm stones of Old Owl Well.",
    cr: 3, type: 'beast', size: 'large', ac: 15, acNote: 'natural armor',
    hpDice: '7d10+14', speed: 40, abilities: { str: 15, dex: 13, con: 15, int: 1, wis: 9, cha: 3 },
    senses: { blindsight: 60 }, languages: [],
    actions: [
      multi("It grabs with both claws and stings.", [['claw', 2], ['sting', 1]]),
      melee('Claw', 4, '1d8+2', 'bludgeoning', { effects: [{ kind: 'condition', id: 'grappled', save: { ability: 'str', dc: 12 } }] }),
      melee('Sting', 4, '1d10+2', 'piercing', {
        save: { ability: 'con', dc: 12, onSuccess: 'half' },
        effects: [{ kind: 'damage', dice: '4d10', type: 'poison' }],
        desc: "DC 12 Constitution save or take 22 (4d10) poison damage, half on a success.",
      }),
    ],
    ai: { archetype: 'brute', aggression: 0.8, selfPreserve: 0.3, preferredRange: 5 },
    loot: { gold: '', table: [['poisoners-kit', 0.1], ['poison-basic', 0.2], ['gem-quartz', 0.1]] },
    sprite: 'scorpion', biomes: ['ruins', 'cave', 'hills', 'ash-waste'], groupSize: [1, 3],
  }),

  mon('behir', 'Behir', {
    desc: "Forty feet of blue serpent on twelve legs, crackling with stormlight. It hates dragons above all things, and it swallows anything smaller than a horse whole.",
    cr: 11, type: 'monstrosity', size: 'huge', ac: 17, acNote: 'natural armor',
    hpDice: '16d12+80', speed: 50, climb: 40, abilities: { str: 23, dex: 16, con: 18, int: 7, wis: 14, cha: 12 },
    skills: { perception: 6, stealth: 7 }, immune: ['lightning'],
    senses: { darkvision: 90 }, languages: ['Draconic'],
    actions: [
      multi("It bites, then tries to constrict.", [['bite', 1], ['constrict', 1]]),
      melee('Bite', 10, '3d10+6', 'piercing', { reach: 10 }),
      melee('Constrict', 10, '2d10+6', 'bludgeoning', {
        effects: [{ kind: 'damage', dice: '2d10', type: 'slashing' }, { kind: 'condition', id: 'restrained', save: { ability: 'str', dc: 18 } }],
        desc: "It coils around a Large or smaller creature, grappling and restraining it.",
        ai: { role: 'control', weight: 1.5 },
      }),
      saveAct('Lightning Breath', {
        dice: '12d10', dtype: 'lightning',
        save: { ability: 'dex', dc: 16, onSuccess: 'half' },
        target: { kind: 'line', length: 20, width: 5 },
        uses: { max: 1, recharge: '5-6' },
        desc: "It exhales a 20-foot line of blue-white lightning.",
        ai: { role: 'aoe', weight: 2.2 },
      }),
      util('Swallow', {
        kind: 'attack', atkBonus: 10, dice: '6d6', dtype: 'acid',
        desc: "It swallows a Medium or smaller creature it has grappled; the victim is blinded, restrained and takes 21 (6d6) acid damage each turn.",
        effects: [{ kind: 'condition', id: 'swallowed', duration: 'until escaped' }],
        ai: { role: 'nuke', weight: 1.4 },
      }),
    ],
    ai: { archetype: 'brute', aggression: 0.9, selfPreserve: 0.3, preferredRange: 10 },
    loot: { gold: '2d10*20', table: [['gem-emerald', 0.12], ['gem-moonstone', 0.2], ['ring-of-resistance-lightning', 0.04], ['potion-superior-healing', 0.15], ['wand-of-lightning-bolts', 0.03]] },
    sprite: 'behir', biomes: ['cave', 'mountain', 'underdark', 'dungeon'], groupSize: [1, 1],
  }),

  mon('remorhaz', 'Remorhaz', {
    desc: "A forty-foot ice worm that runs so hot the snow steams a hundred paces behind it. Frost giants ride them; everyone else runs, badly, through deep drifts.",
    cr: 11, type: 'monstrosity', size: 'huge', ac: 17, acNote: 'natural armor',
    hpDice: '17d12+85', speed: 30, burrow: 20, abilities: { str: 24, dex: 13, con: 21, int: 4, wis: 10, cha: 5 },
    immune: ['cold', 'fire'], senses: { darkvision: 60, tremorsense: 60 }, languages: [],
    traits: [T_HEATED_BODY],
    actions: [
      melee('Bite', 11, '6d10+7', 'piercing', {
        reach: 10,
        effects: [{ kind: 'damage', dice: '6d6', type: 'fire' }, { kind: 'condition', id: 'grappled', save: { ability: 'str', dc: 19 } }],
        desc: "Its jaws close and the target is grappled and restrained, half-cooked in the bargain.",
      }),
      util('Swallow', {
        kind: 'attack', atkBonus: 11, dice: '6d6', dtype: 'acid',
        desc: "It swallows a Large or smaller creature it has grappled; the victim is blinded, restrained and takes 21 (6d6) acid damage each turn.",
        effects: [{ kind: 'condition', id: 'swallowed', duration: 'until escaped' }],
        ai: { role: 'nuke', weight: 1.5 },
      }),
    ],
    ai: { archetype: 'ambusher', aggression: 0.9, selfPreserve: 0.2, preferredRange: 5 },
    loot: { gold: '3d10*10', table: [['gem-diamond', 0.05], ['gem-moonstone', 0.2], ['ring-of-warmth', 0.05], ['potion-resistance', 0.1], ['potion-giant-strength-frost', 0.05]] },
    sprite: 'remorhaz', biomes: ['tundra', 'mountain', 'cave'], groupSize: [1, 1],
  }),

  mon('purple-worm', 'Purple Worm', {
    desc: "The Underdark's great tunneller: a hundred feet of blind muscle with a mouth at one end and a poisoned spike at the other. Whole drow outposts have simply stopped existing when one passed beneath.",
    cr: 15, type: 'monstrosity', size: 'gargantuan', ac: 18, acNote: 'natural armor',
    hpDice: '15d20+90', speed: 50, burrow: 30, abilities: { str: 28, dex: 7, con: 22, int: 1, wis: 8, cha: 4 },
    saveProf: ['con', 'wis'], senses: { blindsight: 30, tremorsense: 60 }, languages: [],
    traits: [T_SIEGE_MONSTER, T_LABYRINTH_RECALL],
    actions: [
      multi("It bites and stings.", [['bite', 1], ['tail-stinger', 1]]),
      melee('Bite', 14, '3d8+9', 'piercing', {
        reach: 10,
        effects: [{ kind: 'condition', id: 'grappled', save: { ability: 'str', dc: 19 } }],
        desc: "A Large or smaller target is grappled, and can be swallowed next turn.",
      }),
      melee('Tail Stinger', 14, '3d6+9', 'piercing', {
        reach: 10,
        save: { ability: 'con', dc: 19, onSuccess: 'half' },
        effects: [{ kind: 'damage', dice: '12d6', type: 'poison' }],
        desc: "DC 19 Constitution save or take 42 (12d6) poison damage, half on a success.",
        ai: { role: 'nuke', weight: 1.7 },
      }),
      util('Swallow', {
        kind: 'attack', atkBonus: 14, dice: '6d6', dtype: 'acid',
        desc: "It swallows a Large or smaller creature it has grappled; the victim is blinded, restrained and takes 21 (6d6) acid damage each turn.",
        effects: [{ kind: 'condition', id: 'swallowed', duration: 'until escaped' }],
        ai: { role: 'nuke', weight: 1.6 },
      }),
    ],
    ai: { archetype: 'brute', aggression: 0.95, selfPreserve: 0.1, preferredRange: 10 },
    loot: { gold: '5d10*20', table: [['gem-diamond', 0.12], ['gem-ruby', 0.15], ['gem-emerald', 0.15], ['platinum-ingot', 0.2], ['ring-of-free-action', 0.03]] },
    sprite: 'purple-worm', biomes: ['underdark', 'cave', 'mine', 'dungeon'], groupSize: [1, 1],
  }),
);

// ===========================================================================
// ABERRATIONS AND OOZES — what Halaster keeps, what the mind flayers breed, and what
// crawls up out of the Underdark when a mine digs one shaft too deep.
// ===========================================================================

ALL.push(
  mon('gelatinous-cube', 'Gelatinous Cube', {
    desc: "Ten feet of near-invisible acid that keeps a dungeon corridor scrupulously clean. You know it has passed by the coins and belt buckles suspended inside it, drifting like insects in amber.",
    cr: 2, type: 'ooze', size: 'large', ac: 6, hpDice: '8d10+40',
    speed: 15, abilities: { str: 14, dex: 3, con: 20, int: 1, wis: 6, cha: 1 },
    condImmune: ['blinded', 'charmed', 'deafened', 'exhaustion', 'frightened', 'prone'],
    senses: { blindsight: 60 }, languages: [],
    traits: [
      T_OOZE_NATURE,
      trait('Ooze Cube', "It fills its space entirely. Moving into that space means being engulfed.", { passive: 'ooze-cube' }),
      trait('Transparent', "Even alert, a creature must succeed on a DC 15 Perception check to notice it before it strikes.", { passive: 'transparent:15' }),
    ],
    actions: [
      melee('Pseudopod', 4, '3d6', 'acid'),
      saveAct('Engulf', {
        save: { ability: 'dex', dc: 12, onSuccess: 'negate' },
        dice: '3d6', dtype: 'acid',
        effects: [{ kind: 'condition', id: 'restrained', duration: 'until escaped' }, { kind: 'condition', id: 'blinded', duration: 'until escaped' }],
        desc: "It slides forward over a creature, which is engulfed, restrained and unable to breathe.",
        ai: { role: 'control', weight: 1.8 },
      }),
    ],
    ai: { archetype: 'ambusher', aggression: 0.7, selfPreserve: 0, preferredRange: 5 },
    loot: { gold: '4d10', table: [['gem-quartz', 0.25], ['gem-onyx', 0.1], ['dagger', 0.15], ['signet-ring', 0.1]] },
    sprite: 'cube', biomes: ['dungeon', 'cave', 'underdark', 'mine', 'crypt'], groupSize: [1, 1],
  }),

  mon('black-pudding', 'Black Pudding', {
    desc: "A shapeless mound of tar that eats metal, wood, bone and stone with equal enthusiasm. Cut it and it does not die; it becomes two smaller problems.",
    cr: 4, type: 'ooze', size: 'large', ac: 7, hpDice: '10d10+30',
    speed: 20, climb: 20, abilities: { str: 16, dex: 5, con: 16, int: 1, wis: 6, cha: 1 },
    immune: ['acid', 'cold', 'lightning', 'slashing'],
    condImmune: ['blinded', 'charmed', 'deafened', 'exhaustion', 'frightened', 'prone'],
    senses: { blindsight: 60 }, languages: [],
    traits: [
      T_AMORPHOUS,
      T_SPIDER_CLIMB,
      trait('Corrosive Form', "Any nonmagical weapon that strikes it corrodes; armour that touches it sloughs away a point of protection at a time.", { passive: 'corrosive-form:1d8:acid' }),
      trait('Split', "When lightning or slashing damage would hurt it and it has 10 or more hit points, it splits into two puddings instead.", { passive: 'split:10' }),
    ],
    actions: [melee('Pseudopod', 5, '1d6+3', 'bludgeoning', { effects: [{ kind: 'damage', dice: '4d8', type: 'acid' }] })],
    ai: { archetype: 'brute', aggression: 0.8, selfPreserve: 0, preferredRange: 5 },
    loot: { gold: '3d10', table: [['gem-onyx', 0.15], ['gem-malachite', 0.15]] },
    sprite: 'pudding', biomes: ['dungeon', 'cave', 'underdark', 'mine', 'ruins'], groupSize: [1, 2],
  }),

  mon('gibbering-mouther', 'Gibbering Mouther', {
    desc: "A heaving pile of melted faces, all of them talking at once in the voices of everyone it has eaten. The ground goes soft around it and the babble takes your mind apart word by word.",
    cr: 2, type: 'aberration', size: 'medium', ac: 9, hpDice: '9d8+27',
    speed: 10, swim: 10, abilities: { str: 10, dex: 8, con: 16, int: 3, wis: 10, cha: 6 },
    condImmune: ['prone'], senses: { darkvision: 60 }, languages: [],
    traits: [
      trait('Aberrant Ground', "The earth in a 10-foot radius turns to mire; leaving that ground costs every foot of movement doubled.", { passive: 'aberrant-ground:10' }),
      trait('Gibbering', "It babbles constantly. Any creature that starts its turn within 20 feet and can hear it must save or act randomly.", { passive: 'gibbering:10:20' }),
    ],
    actions: [
      multi("It bites with as many mouths as it can bring to bear.", [['bites', 1], ['blinding-spittle', 1]]),
      melee('Bites', 2, '5d6', 'piercing', { desc: "If the target is Medium or smaller it must save or be knocked prone." }),
      saveAct('Blinding Spittle', {
        range: 15, dice: '2d8', dtype: 'radiant',
        save: { ability: 'dex', dc: 10, onSuccess: 'negate' },
        target: { kind: 'sphere', radius: 5 },
        effects: [{ kind: 'condition', id: 'blinded', duration: '1 round' }],
        uses: { max: 1, recharge: '5-6' },
        desc: "It spits a glob of caustic light that bursts and blinds.",
        ai: { role: 'aoe', weight: 1.4 },
      }),
    ],
    ai: { archetype: 'brute', aggression: 0.8, selfPreserve: 0.1, preferredRange: 5 },
    loot: { gold: '2d10', table: [['gem-quartz', 0.15], ['signet-ring', 0.08]] },
    sprite: 'gibbering-mouther', biomes: ['underdark', 'dungeon', 'cave', 'marsh'], groupSize: [1, 2],
  }),

  mon('otyugh', 'Otyugh', {
    desc: "A stinking tripod of a beast with two tentacles and a mouth full of rotten teeth, kept as a garbage disposal by anything with a dungeon and no sense of smell. It is smarter than it looks and it will talk you closer.",
    cr: 5, type: 'aberration', size: 'large', ac: 14, acNote: 'natural armor',
    hpDice: '13d10+42', speed: 30, abilities: { str: 16, dex: 11, con: 19, int: 6, wis: 13, cha: 6 },
    saveProf: ['con'], senses: { darkvision: 120 }, languages: ['Otyugh'],
    traits: [trait('Limited Telepathy', "It can plant crude, insistent images in the mind of any creature within 120 feet — usually the idea that it is harmless.", { passive: 'limited-telepathy:120' })],
    actions: [
      multi("It bites and lashes out with both tentacles.", [['bite', 1], ['tentacle', 2]]),
      melee('Bite', 6, '2d8+3', 'piercing', {
        save: { ability: 'con', dc: 15, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'diseased', duration: 'until cured' }],
        desc: "The filth in its mouth carries a wasting sickness: DC 15 Constitution save or contract otyugh fever.",
      }),
      melee('Tentacle', 6, '1d8+3', 'bludgeoning', {
        reach: 10,
        effects: [{ kind: 'condition', id: 'grappled', save: { ability: 'str', dc: 13 } }, { kind: 'condition', id: 'restrained', duration: 'until escaped' }],
        ai: { role: 'control', weight: 1.4 },
      }),
      util('Tentacle Slam', {
        kind: 'save', dice: '2d6+3', dtype: 'bludgeoning',
        save: { ability: 'con', dc: 14, onSuccess: 'half' },
        effects: [{ kind: 'condition', id: 'stunned', duration: '1 round' }],
        desc: "It slams grappled creatures together, stunning them on a failed save.",
        ai: { role: 'nuke', weight: 1.3 },
      }),
    ],
    ai: { archetype: 'brute', aggression: 0.8, selfPreserve: 0.3, preferredRange: 10 },
    loot: { gold: '4d10', table: [['gem-malachite', 0.15], ['gem-quartz', 0.2], ['potion-healing', 0.15], ['signet-ring', 0.1]] },
    sprite: 'otyugh', biomes: ['dungeon', 'underdark', 'marsh', 'cave', 'mine'], groupSize: [1, 2],
  }),

  mon('umber-hulk', 'Umber Hulk', {
    desc: "It comes through the wall rather than the door, mandibles first, and then you make the mistake of looking at its eyes. Miners call a collapsed shaft with confused corpses in it a hulk's parlour.",
    cr: 5, type: 'aberration', size: 'large', ac: 18, acNote: 'natural armor',
    hpDice: '11d10+55', speed: 30, burrow: 30, abilities: { str: 20, dex: 13, con: 20, int: 9, wis: 10, cha: 10 },
    senses: { darkvision: 120, tremorsense: 60 }, languages: ['Umber Hulk'],
    traits: [
      trait('Confusing Gaze', "Meet its four eyes and the world stops making sense: DC 15 Charisma save or act at random on your turn.", { passive: 'confusing-gaze:15' }),
      trait('Tunneler', "It bores through solid rock at half speed, leaving a 5-foot tunnel behind it.", { passive: 'tunneler' }),
    ],
    actions: [
      multi("It bites once and strikes with both claws.", [['mandibles', 1], ['claw', 2]]),
      melee('Mandibles', 8, '2d8+5', 'slashing'),
      melee('Claw', 8, '1d10+5', 'slashing'),
    ],
    ai: { archetype: 'ambusher', aggression: 0.9, selfPreserve: 0.25, preferredRange: 5 },
    loot: { gold: '5d10', table: [['gem-onyx', 0.2], ['ore-sample-phandalin', 0.2], ['silver-ore-wave-echo', 0.1], ['potion-greater-healing', 0.1]] },
    sprite: 'umber-hulk', biomes: ['underdark', 'cave', 'mine', 'dungeon'], groupSize: [1, 2],
  }),

  mon('chuul', 'Chuul', {
    desc: "A lobster the size of a horse, left behind by an empire that fell before Netheril rose, still guarding a ruin nobody remembers building. Its tentacles paralyze; its claws do the rest.",
    cr: 4, type: 'aberration', size: 'large', ac: 16, acNote: 'natural armor',
    hpDice: '11d10+33', speed: 30, swim: 30, abilities: { str: 19, dex: 10, con: 16, int: 5, wis: 11, cha: 5 },
    skills: { perception: 4 }, immune: ['poison'], condImmune: ['poisoned'],
    senses: { darkvision: 60 }, languages: ['Deep Speech (understands only)'],
    traits: [
      T_AMPHIBIOUS,
      trait('Sense Magic', "It senses magic within 120 feet the way a shark senses blood, and goes for it first.", { passive: 'sense-magic:120' }),
    ],
    actions: [
      multi("It attacks with both pincers, then uses its tentacles on a grappled foe.", [['pincer', 2], ['tentacles', 1]]),
      melee('Pincer', 6, '2d6+4', 'bludgeoning', { effects: [{ kind: 'condition', id: 'grappled', save: { ability: 'str', dc: 14 } }] }),
      saveAct('Tentacles', {
        save: { ability: 'con', dc: 13, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'paralyzed', duration: '1 minute' }],
        desc: "Its mouth tentacles brush a grappled creature, which must save or be paralyzed for a minute.",
        ai: { role: 'control', weight: 1.7 },
      }),
    ],
    ai: { archetype: 'brute', aggression: 0.85, selfPreserve: 0.2, preferredRange: 5 },
    loot: { gold: '4d10', table: [['gem-pearl', 0.15], ['gem-black-pearl', 0.05], ['scroll-2', 0.1], ['potion-water-breathing', 0.1]] },
    sprite: 'chuul', biomes: ['marsh', 'coast', 'underdark', 'ruins', 'cave'], groupSize: [1, 3],
  }),

  mon('cloaker', 'Cloaker', {
    desc: "It hangs among the cloaks on the wall until one of them unfolds, screams a note that turns your knees to water, and wraps itself around your head. Undermountain's cloakrooms are famous.",
    cr: 8, type: 'aberration', size: 'large', ac: 14, acNote: 'natural armor',
    hpDice: '13d10+13', speed: 10, fly: 40, abilities: { str: 17, dex: 15, con: 12, int: 13, wis: 12, cha: 14 },
    skills: { stealth: 5 }, senses: { darkvision: 60 }, languages: ['Deep Speech', 'Undercommon'],
    traits: [
      trait('Damage Transfer', "While attached to a creature it takes only half the damage dealt to it, and that creature takes the other half.", { passive: 'damage-transfer' }),
      trait('False Appearance', "Motionless, it is indistinguishable from a black cloak hanging on a peg.", { passive: 'false-appearance' }),
      T_LIGHTNING_ABSORB,
    ],
    actions: [
      multi("It bites and lashes with its tail.", [['bite', 1], ['tail', 1]]),
      melee('Bite', 6, '2d6+3', 'piercing', { desc: "On a hit against a Medium or smaller creature, it attaches to the target's head, blinding it." }),
      melee('Tail', 6, '2d6+3', 'slashing', { reach: 10 }),
      saveAct('Moan', {
        range: 60, save: { ability: 'wis', dc: 13, onSuccess: 'negate' },
        target: { kind: 'sphere', radius: 60 },
        effects: [{ kind: 'condition', id: 'frightened', duration: '1 minute' }],
        desc: "It emits a subsonic moan; every creature within 60 feet that can hear must save or be frightened.",
        ai: { role: 'debuff', weight: 1.5 },
      }),
      util('Phantasms', {
        uses: { max: 1, recharge: 'short' },
        desc: "It conjures three illusory duplicates of itself that move with it; attacks that hit a duplicate destroy it.",
        effects: [{ kind: 'buff', id: 'mirror-image', count: 3 }],
        ai: { role: 'buff', weight: 1.6 },
      }),
    ],
    ai: { archetype: 'ambusher', aggression: 0.8, selfPreserve: 0.5, preferredRange: 5 },
    loot: { gold: '6d10', table: [['cloak-of-protection', 0.05], ['gem-black-pearl', 0.1], ['gem-onyx', 0.2], ['potion-greater-healing', 0.15]] },
    sprite: 'cloaker', biomes: ['underdark', 'dungeon', 'cave', 'crypt'], groupSize: [1, 3],
  }),

  mon('grell', 'Grell', {
    desc: "A floating brain trailing ten paralytic tentacles and a beak that snaps like shears. It drifts silently down Undermountain's shafts and takes whichever of you is at the back.",
    cr: 3, type: 'aberration', size: 'medium', ac: 12, hpDice: '9d8+18',
    speed: 10, fly: 30, hover: true, abilities: { str: 15, dex: 14, con: 15, int: 12, wis: 11, cha: 9 },
    skills: { perception: 4, stealth: 6 }, immune: ['lightning'], condImmune: ['blinded', 'prone'],
    senses: { blindsight: 60 }, languages: ['Grell'],
    traits: [trait('Blind Beyond Blindsight', "It has no eyes at all; beyond 60 feet the world is simply absent.", { passive: 'blind-beyond-blindsight' })],
    actions: [
      multi("It lashes with its tentacles and snaps with its beak.", [['tentacles', 1], ['beak', 1]]),
      melee('Tentacles', 4, '1d10+2', 'piercing', {
        reach: 10,
        save: { ability: 'con', dc: 11, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'poisoned', duration: '1 minute' }, { kind: 'condition', id: 'paralyzed', duration: '1 minute' }],
        desc: "Its barbs carry a paralytic; DC 11 Constitution save or be poisoned and paralyzed for a minute.",
        ai: { role: 'control', weight: 1.8 },
      }),
      melee('Beak', 4, '2d4+2', 'piercing'),
    ],
    ai: { archetype: 'ambusher', aggression: 0.75, selfPreserve: 0.5, preferredRange: 10 },
    loot: { gold: '3d10', table: [['gem-amber', 0.15], ['antitoxin', 0.15], ['scroll-2', 0.08]] },
    sprite: 'grell', biomes: ['underdark', 'dungeon', 'cave'], groupSize: [1, 3],
  }),

  mon('intellect-devourer', 'Intellect Devourer', {
    desc: "A brain that walks on four clawed legs, sent ahead by the mind flayers to hollow out a body and drive it home. What comes back wearing your friend's face is not your friend.",
    cr: 2, type: 'aberration', size: 'tiny', ac: 12, hpDice: '6d4+6',
    speed: 40, abilities: { str: 6, dex: 14, con: 13, int: 12, wis: 11, cha: 10 },
    skills: { perception: 2, stealth: 4 },
    resist: ['bludgeoning-nonmagical', 'piercing-nonmagical', 'slashing-nonmagical'],
    condImmune: ['blinded'], senses: { blindsight: 60 }, languages: ['Deep Speech (telepathy 60)'],
    traits: [
      trait('Detect Sentience', "It senses the presence of any thinking creature within 300 feet, through stone.", { passive: 'detect-sentience:300' }),
      trait('Blind Beyond Blindsight', "It cannot see past 60 feet; it does not need to.", { passive: 'blind-beyond-blindsight' }),
    ],
    actions: [
      multi("It claws, then attempts to devour a mind.", [['claws', 1], ['devour-intellect', 1]]),
      melee('Claws', 4, '2d4+2', 'slashing'),
      saveAct('Devour Intellect', {
        range: 10, dice: '2d10', dtype: 'psychic',
        save: { ability: 'int', dc: 12, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'stunned', duration: '1 round' }],
        desc: "It reaches for a mind within 10 feet; on a failure the victim takes psychic damage and its Intelligence drops to 0 if the damage exceeds its Intelligence score.",
        ai: { role: 'nuke', weight: 1.8 },
      }),
      util('Body Thief', {
        uses: { max: 1, recharge: 'short' },
        desc: "Against an incapacitated humanoid it burrows into the skull, devours the brain and takes control of the corpse.",
        effects: [{ kind: 'condition', id: 'dominated', duration: 'until dispelled' }],
        ai: { role: 'control', weight: 2 },
      }),
    ],
    ai: { archetype: 'ambusher', aggression: 0.8, selfPreserve: 0.6, preferredRange: 5 },
    loot: { gold: '', table: [['gem-amber', 0.1]] },
    sprite: 'intellect-devourer', biomes: ['underdark', 'dungeon', 'cave', 'city'], groupSize: [1, 4],
    faction: 'illithid',
  }),

  mon('mind-flayer', 'Mind Flayer', {
    desc: "Violet-skinned, four-tentacled and immaculately dressed, it regards you the way a diner regards a plate. It speaks in your own thoughts, politely, while it decides which of you is the freshest.",
    cr: 7, type: 'aberration', size: 'medium', ac: 15, acNote: 'breastplate',
    hpDice: '13d8+13', speed: 30, abilities: { str: 11, dex: 12, con: 12, int: 19, wis: 17, cha: 17 },
    saveProf: ['int', 'wis', 'cha'], skills: { arcana: 7, deception: 6, insight: 6, perception: 6, persuasion: 6, stealth: 4 },
    senses: { darkvision: 120 }, languages: ['Deep Speech', 'Undercommon', 'telepathy 120'],
    traits: [
      T_MAGIC_RESIST,
      trait('Innate Spellcasting', "Its will alone casts detect thoughts and levitate at will, and dominate monster or plane shift once a day.", { passive: 'innate-casting:int:15' }),
    ],
    actions: [
      melee('Tentacles', 7, '2d10+4', 'psychic', {
        save: { ability: 'int', dc: 15, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'stunned', duration: '1 minute' }],
        desc: "The tentacles fasten to the skull; DC 15 Intelligence save or be stunned while it holds on.",
      }),
      util('Extract Brain', {
        kind: 'attack', atkBonus: 7, dice: '10d10', dtype: 'piercing',
        desc: "Against an incapacitated humanoid it opens the skull and eats the brain, killing the victim outright.",
        ai: { role: 'nuke', weight: 2.5 },
      }),
      saveAct('Mind Blast', {
        dice: '4d8+4', dtype: 'psychic',
        save: { ability: 'int', dc: 15, onSuccess: 'half' },
        target: { kind: 'cone', length: 60 },
        effects: [{ kind: 'condition', id: 'stunned', duration: '1 minute' }],
        uses: { max: 1, recharge: '5-6' },
        desc: "It emits a 60-foot cone of psychic energy; those who fail are stunned for a minute.",
        ai: { role: 'aoe', weight: 2.4 },
      }),
    ],
    ai: { archetype: 'caster', aggression: 0.7, selfPreserve: 0.6, preferredRange: 30 },
    loot: { gold: '4d10*5', table: [['headband-of-intellect', 0.05], ['gem-onyx', 0.2], ['scroll-4', 0.12], ['medallion-of-thoughts', 0.05], ['potion-mind-reading', 0.12]] },
    sprite: 'mind-flayer', biomes: ['underdark', 'dungeon', 'cave', 'city'], groupSize: [1, 3],
    faction: 'illithid', elite: true,
  }),

  mon('elder-brain', 'Elder Brain', {
    desc: "A mass of grey tissue twenty feet across, floating in a pool of briny fluid, holding an entire colony's memories and hungers in one will. It has been listening to your thoughts since you entered the level.",
    cr: 14, type: 'aberration', size: 'large', ac: 10, hpDice: '25d10+125',
    speed: 5, swim: 10, abilities: { str: 15, dex: 10, con: 20, int: 21, wis: 19, cha: 24 },
    saveProf: ['int', 'wis', 'cha'], skills: { arcana: 10, deception: 12, insight: 9, perception: 9, persuasion: 12 },
    condImmune: ['blinded', 'prone'], senses: { blindsight: 120 },
    languages: ['Deep Speech', 'Undercommon', 'telepathy 5 miles'],
    traits: [
      T_MAGIC_RESIST,
      legendaryResistance(3),
      trait('Creature Sense', "It knows the location and species of every creature within five miles, and the shape of their thoughts.", { passive: 'creature-sense:5mi' }),
      trait('Telepathic Hub', "It links every mind it has touched into one net, and can speak through any of them.", { passive: 'telepathic-hub' }),
    ],
    actions: [
      multi("It lashes with three tentacles, or blasts a mind.", [['tentacle', 3]]),
      melee('Tentacle', 9, '3d6+2', 'bludgeoning', {
        reach: 30,
        effects: [{ kind: 'condition', id: 'grappled', save: { ability: 'str', dc: 17 } }],
      }),
      saveAct('Psychic Pulse', {
        range: 60, dice: '6d8', dtype: 'psychic',
        save: { ability: 'int', dc: 18, onSuccess: 'half' },
        target: { kind: 'sphere', radius: 60 },
        desc: "The pool ripples and every mind in the chamber is struck at once.",
        ai: { role: 'aoe', weight: 2.3 },
      }),
      saveAct('Sever Psyche', {
        range: 60, dice: '8d8', dtype: 'psychic',
        save: { ability: 'wis', dc: 18, onSuccess: 'half' },
        effects: [{ kind: 'condition', id: 'stunned', duration: '1 minute' }],
        desc: "It closes a mental fist around one mind and squeezes.",
        ai: { role: 'nuke', weight: 2 },
      }),
    ],
    legendary: {
      count: 3, resist: 3,
      actions: [
        legend('Tentacle', 1, "It lashes out with one tentacle.", { ref: 'tentacle', ai: { role: 'nuke', weight: 1 } }),
        legend('Psychic Whisper', 1, "One creature it can sense takes 3d6 psychic damage and has disadvantage on its next attack.", {
          kind: 'save', dice: '3d6', dtype: 'psychic', range: 120,
          save: { ability: 'wis', dc: 18, onSuccess: 'half' },
          ai: { role: 'debuff', weight: 1.2 },
        }),
        legend('Summon Thrall', 2, "A mind flayer or intellect devourer under its control arrives from the tunnels.", {
          kind: 'summon', effects: [{ kind: 'summon', monsterId: 'intellect-devourer', count: 2 }],
          ai: { role: 'utility', weight: 1.5 },
        }),
      ],
    },
    ai: { archetype: 'caster', aggression: 0.6, selfPreserve: 0.9, preferredRange: 60 },
    loot: { gold: '6d10*20', table: [['headband-of-intellect', 0.2], ['tome-of-clear-thought', 0.1], ['gem-black-pearl', 0.3], ['scroll-6', 0.2], ['medallion-of-thoughts', 0.2]] },
    sprite: 'elder-brain', biomes: ['underdark', 'dungeon'], groupSize: [1, 1],
    faction: 'illithid', elite: true,
  }),

  mon('beholder', 'Beholder', {
    desc: "A floating sphere of hate the size of a cart, one great central eye and ten writhing stalks, each carrying a different way to end you. No two agree on anything except that they are the rightful centre of creation.",
    cr: 13, type: 'aberration', size: 'large', ac: 18, acNote: 'natural armor',
    hpDice: '19d10+76', speed: 0, fly: 20, hover: true,
    abilities: { str: 10, dex: 14, con: 18, int: 17, wis: 15, cha: 17 },
    saveProf: ['int', 'wis', 'cha'], skills: { perception: 12 },
    condImmune: ['prone'], senses: { darkvision: 120 }, languages: ['Deep Speech', 'Undercommon'],
    traits: [
      legendaryResistance(3),
      trait('Antimagic Cone', "The great central eye projects a 150-foot cone in which no magic functions at all — not spells, not magic items, not even the beholder's own eye rays.", { passive: 'antimagic-cone:150' }),
    ],
    actions: [
      melee('Bite', 5, '4d6', 'piercing'),
      saveAct('Eye Rays', {
        range: 120,
        save: { ability: 'varies', dc: 16, onSuccess: 'negate' },
        target: { kind: 'multi', maxTargets: 3 },
        desc: "It fires three of its ten rays at random: charm, paralyzing, fear, slowing, enervation (8d8 necrotic), telekinetic, sleep, petrification, disintegration (10d8 force) and death (10d10 necrotic).",
        effects: [{ kind: 'condition', id: 'random-eye-ray' }],
        ai: { role: 'nuke', weight: 2.6 },
      }),
    ],
    legendary: {
      count: 3, resist: 3,
      actions: [
        legend('Eye Ray', 1, "It fires one random eye ray at a target it can see.", { ref: 'eye-rays', range: 120, ai: { role: 'nuke', weight: 1.5 } }),
        legend('Reposition', 1, "It drifts up to its speed without provoking opportunity attacks.", { kind: 'utility', target: { kind: 'self' }, ai: { role: 'utility', weight: 0.8 } }),
        legend('Baleful Glare', 2, "One creature within 60 feet must succeed on a DC 16 Wisdom save or be frightened until the end of its next turn.", {
          kind: 'save', range: 60, save: { ability: 'wis', dc: 16, onSuccess: 'negate' },
          effects: [{ kind: 'condition', id: 'frightened', duration: '1 round' }],
          ai: { role: 'debuff', weight: 1 },
        }),
      ],
    },
    lair: lair('Beholder Lair', "A vaulted cavern gnawed into a sphere, littered with statues and the bones of everything it has ever disliked.", [
      lairAct('Slime Walls', "Wall slime turns a 10-foot square slick and grasping; creatures there must save or be restrained.", {
        save: { ability: 'dex', dc: 15, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'restrained', duration: '1 round' }],
      }),
      lairAct('Grasping Eyestalks', "Eyestalks sprout from the walls and drag a creature 30 feet across the chamber.", {
        save: { ability: 'str', dc: 15, onSuccess: 'negate' },
        effects: [{ kind: 'teleport', distance: 30 }],
      }),
      lairAct('Blinding Bloom', "A cloud of luminous spores bursts; creatures in a 20-foot radius must save or be blinded until the next lair action.", {
        save: { ability: 'con', dc: 15, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'blinded', duration: '1 round' }],
      }),
    ], { biome: 'underdark', regional: ["Within a mile of the lair, minor magic misfires and mirrors show the beholder's eye."] }),
    ai: { archetype: 'caster', aggression: 0.85, selfPreserve: 0.7, preferredRange: 60 },
    loot: { gold: '4d10*25', table: [['gem-diamond', 0.15], ['gem-ruby', 0.2], ['gem-emerald', 0.2], ['ring-of-protection', 0.08], ['wand-of-fear', 0.08], ['scroll-6', 0.15], ['gem-of-seeing', 0.06]] },
    sprite: 'beholder', biomes: ['underdark', 'dungeon', 'cave'], groupSize: [1, 1],
    faction: 'beholder', elite: true,
  }),

  mon('spectator', 'Spectator', {
    desc: "A four-eyed beholderkin bound by a wizard to guard one treasure for a century and one hundred and one years. It takes the contract very seriously, and it is dreadfully bored.",
    cr: 3, type: 'aberration', size: 'medium', ac: 14, acNote: 'natural armor',
    hpDice: '6d8+12', speed: 0, fly: 30, hover: true,
    abilities: { str: 8, dex: 14, con: 14, int: 13, wis: 14, cha: 11 },
    condImmune: ['prone'], senses: { darkvision: 120 }, languages: ['Deep Speech', 'Undercommon', 'telepathy 120'],
    traits: [trait('Bound Guardian', "It was summoned to guard one thing. It will not leave that thing, and it will negotiate at length about what counts as leaving.", { passive: 'bound-guardian' })],
    actions: [
      melee('Bite', 1, '2d6', 'piercing'),
      saveAct('Eye Rays', {
        range: 90, save: { ability: 'varies', dc: 13, onSuccess: 'negate' },
        target: { kind: 'multi', maxTargets: 2 },
        desc: "Two of its four rays fire: confusion, paralyzing, fear, or a wounding ray that deals 3d6 psychic damage.",
        effects: [{ kind: 'condition', id: 'random-eye-ray' }],
        ai: { role: 'nuke', weight: 2 },
      }),
    ],
    reactions: [util('Spell Reflection', {
      desc: "If it succeeds on a save against a spell aimed only at it, it can bounce that spell back at the caster.",
      ai: { role: 'utility', weight: 1.2 },
    })],
    ai: { archetype: 'caster', aggression: 0.6, selfPreserve: 0.5, preferredRange: 40 },
    loot: { gold: '3d10', table: [['gem-amber', 0.15], ['scroll-3', 0.12], ['wand-of-magic-detection', 0.05]] },
    sprite: 'spectator', biomes: ['dungeon', 'underdark', 'ruins', 'crypt'], groupSize: [1, 1],
    faction: 'beholder',
  }),

  mon('gauth', 'Gauth', {
    desc: "A smaller, hungrier beholderkin with a taste for magic itself: it drinks the charges out of wands and the memory of spells out of wizards. It smells of ozone and old blood.",
    cr: 6, type: 'aberration', size: 'medium', ac: 15, acNote: 'natural armor',
    hpDice: '10d8+30', speed: 0, fly: 30, hover: true,
    abilities: { str: 16, dex: 14, con: 16, int: 15, wis: 15, cha: 13 },
    saveProf: ['int', 'wis'], skills: { perception: 5 },
    condImmune: ['prone'], senses: { darkvision: 120 }, languages: ['Deep Speech', 'Undercommon'],
    traits: [
      trait('Stunning Gaze', "Any creature that starts its turn within 30 feet and meets the central eye must save or be stunned.", { passive: 'stunning-gaze:15:30' }),
      trait('Death Throes', "When it dies it explodes in a 20-foot burst of force, 3d6 damage on a failed DC 15 Dexterity save.", { passive: 'death-burst:3d6:force:20' }),
    ],
    actions: [
      melee('Bite', 6, '2d6+3', 'piercing'),
      saveAct('Eye Rays', {
        range: 120, save: { ability: 'varies', dc: 15, onSuccess: 'negate' },
        target: { kind: 'multi', maxTargets: 3 },
        desc: "Three of its six rays fire: devour magic, enervation (3d8 necrotic), paralyzing, fear, sleep, or a pushing ray.",
        effects: [{ kind: 'condition', id: 'random-eye-ray' }],
        ai: { role: 'nuke', weight: 2.4 },
      }),
    ],
    ai: { archetype: 'caster', aggression: 0.8, selfPreserve: 0.6, preferredRange: 60 },
    loot: { gold: '5d10*5', table: [['gem-onyx', 0.2], ['gem-ruby', 0.08], ['wand-of-magic-missiles', 0.06], ['scroll-4', 0.15], ['pearl-of-power', 0.05]] },
    sprite: 'gauth', biomes: ['underdark', 'dungeon', 'cave'], groupSize: [1, 2],
    faction: 'beholder',
  }),

  mon('aboleth', 'Aboleth', {
    desc: "It remembers the world before the gods and considers the arrangement temporary. Its slime drowns you in air, its mind takes you apart, and everything it has ever known it still knows.",
    cr: 10, type: 'aberration', size: 'large', ac: 17, acNote: 'natural armor',
    hpDice: '18d10+36', speed: 10, swim: 40, abilities: { str: 21, dex: 9, con: 15, int: 18, wis: 15, cha: 18 },
    saveProf: ['con', 'int', 'wis'], skills: { history: 12, perception: 10 },
    senses: { darkvision: 120 }, languages: ['Deep Speech', 'telepathy 120'],
    traits: [
      T_AMPHIBIOUS,
      trait('Mucous Cloud', "A creature that touches the water around it must save or lose the ability to breathe air until it is healed.", { passive: 'mucous-cloud:14' }),
      trait('Probing Telepathy', "Speaking with a creature telepathically, it learns that creature's greatest desire.", { passive: 'probing-telepathy' }),
    ],
    actions: [
      multi("It lashes with both tentacles.", [['tentacle', 2]]),
      melee('Tentacle', 9, '2d6+5', 'bludgeoning', {
        reach: 10,
        save: { ability: 'con', dc: 14, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'diseased', duration: 'until cured' }],
        desc: "The slime takes hold: skin turns translucent and membranous, and the victim can no longer breathe air.",
      }),
      melee('Tail', 9, '3d6+5', 'bludgeoning', { reach: 10 }),
      saveAct('Enslave', {
        range: 30, save: { ability: 'wis', dc: 14, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'charmed', duration: 'until dispelled' }],
        uses: { max: 3, recharge: 'long' },
        desc: "It fastens on one mind within 30 feet and simply takes it.",
        ai: { role: 'control', weight: 2.2 },
      }),
    ],
    legendary: {
      count: 3, resist: 0,
      actions: [
        legend('Detect', 1, "It makes a Wisdom (Perception) check, reading the room and every mind in it.", { kind: 'utility', target: { kind: 'self' }, ai: { role: 'utility', weight: 0.6 } }),
        legend('Tail Swipe', 1, "It makes one tail attack.", { ref: 'tail', ai: { role: 'nuke', weight: 1.2 } }),
        legend('Psychic Drain', 2, "One charmed creature takes 3d6 psychic damage and the aboleth heals that much.", {
          kind: 'save', dice: '3d6', dtype: 'psychic', range: 60,
          effects: [{ kind: 'heal', dice: '3d6' }],
          ai: { role: 'nuke', weight: 1.4 },
        }),
      ],
    },
    lair: lair('Sunken Cistern', "A flooded chamber of black water where the walls are carved with a history nobody alive can read.", [
      lairAct('Drowning Air', "The air in a 20-foot radius turns to brine in the lungs; DC 14 Constitution save or take 3d6 damage and be unable to speak.", {
        save: { ability: 'con', dc: 14, onSuccess: 'half' }, dice: '3d6', dtype: 'poison',
      }),
      lairAct('Grasping Slime', "The floor becomes slick with mucus, halving movement until the next lair action.", {
        save: { ability: 'dex', dc: 14, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'slowed', duration: '1 round' }],
      }),
      lairAct('Memory of Drowning', "A creature relives a death by water: DC 14 Wisdom save or be frightened until the next lair action.", {
        save: { ability: 'wis', dc: 14, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'frightened', duration: '1 round' }],
      }),
    ], { biome: 'underdark' }),
    ai: { archetype: 'caster', aggression: 0.7, selfPreserve: 0.7, preferredRange: 30 },
    loot: { gold: '5d10*10', table: [['gem-black-pearl', 0.25], ['gem-pearl', 0.3], ['scroll-5', 0.15], ['amulet-of-proof-against-detection', 0.06], ['potion-water-breathing', 0.2]] },
    sprite: 'aboleth', biomes: ['underdark', 'marsh', 'coast', 'cave'], groupSize: [1, 1],
    elite: true,
  }),
);

// ===========================================================================
// THE DROW — raiding parties out of Menzoberranzan, and what Lolth sends when a
// House is displeased. Nezznar the Black Spider is only the one Phandalin has met.
// ===========================================================================

ALL.push(
  mon('drow', 'Drow', {
    desc: "A soldier of the Underdark cities, black-skinned and white-haired, armoured in adamantine mesh worth more than a Phandalin house. Everything it carries is poisoned and so is everything it says.",
    cr: 0.25, type: 'humanoid', subtype: 'elf', size: 'medium', ac: 15, acNote: 'chain shirt',
    hpDice: '3d8', speed: 30, abilities: { str: 10, dex: 14, con: 10, int: 11, wis: 11, cha: 12 },
    skills: { perception: 2, stealth: 4 }, senses: { darkvision: 120 }, languages: ['Elvish', 'Undercommon'],
    traits: [
      T_FEY_ANCESTRY,
      T_SUNLIGHT_SENS,
      trait('Innate Spellcasting', "Dancing lights at will, and darkness and faerie fire once each per day.", { passive: 'innate-casting:cha:11' }),
    ],
    actions: [
      melee('Shortsword', 4, '1d6+2', 'piercing'),
      ranged('Hand Crossbow', 4, '1d6+2', 'piercing', [30, 120], {
        save: { ability: 'con', dc: 13, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'poisoned', duration: '1 hour' }, { kind: 'condition', id: 'unconscious', duration: '1 hour' }],
        desc: "The bolt is smeared with drow sleep poison: DC 13 Constitution save or fall unconscious for an hour.",
        ai: { role: 'nuke', weight: 1.4 },
      }),
    ],
    ai: { archetype: 'skirmisher', aggression: 0.7, selfPreserve: 0.6, preferredRange: 30 },
    loot: { gold: '4d6', table: [['shortsword', 0.25], ['hand-crossbow', 0.15], ['chain-shirt', 0.1], ['poison-basic', 0.2], ['gem-onyx', 0.1]] },
    sprite: 'drow', biomes: ['underdark', 'cave', 'dungeon', 'mine'], groupSize: [3, 6],
    faction: 'drow',
  }),

  mon('drow-elite-warrior', 'Drow Elite Warrior', {
    desc: "A House blade-master who has survived every rival sent against her. She fights two-handed, moves as if the dark were a courtesy extended to her personally, and never wastes a bolt.",
    cr: 5, type: 'humanoid', subtype: 'elf', size: 'medium', ac: 18, acNote: 'studded leather, shield',
    hpDice: '11d8+22', speed: 30, abilities: { str: 13, dex: 18, con: 14, int: 11, wis: 13, cha: 12 },
    saveProf: ['dex', 'con', 'wis'], skills: { perception: 4, stealth: 10 },
    senses: { darkvision: 120 }, languages: ['Elvish', 'Undercommon'],
    traits: [
      T_FEY_ANCESTRY,
      T_SUNLIGHT_SENS,
      trait('Innate Spellcasting', "Dancing lights at will; darkness, faerie fire and levitate once each per day.", { passive: 'innate-casting:cha:12' }),
    ],
    actions: [
      multi("She makes two shortsword attacks.", [['shortsword', 2]]),
      melee('Shortsword', 8, '1d6+4', 'piercing', { effects: [{ kind: 'damage', dice: '3d6', type: 'poison' }] }),
      ranged('Hand Crossbow', 8, '1d6+4', 'piercing', [30, 120], {
        save: { ability: 'con', dc: 13, onSuccess: 'negate' },
        effects: [{ kind: 'damage', dice: '2d6', type: 'poison' }, { kind: 'condition', id: 'unconscious', duration: '1 hour' }],
        desc: "Drow sleep poison: DC 13 Constitution save or drop unconscious for an hour.",
      }),
    ],
    reactions: [util('Parry', { desc: "She adds 3 to her AC against one melee attack that would hit her.", ai: { role: 'utility', weight: 1.2 } })],
    ai: { archetype: 'skirmisher', aggression: 0.8, selfPreserve: 0.5, preferredRange: 5 },
    loot: { gold: '3d6*10', table: [['shortsword', 0.3], ['hand-crossbow', 0.2], ['studded-leather', 0.15], ['poison-basic', 0.3], ['gem-onyx', 0.2], ['cloak-of-elvenkind', 0.04]] },
    sprite: 'drow', tint: '#5a4a7a', biomes: ['underdark', 'cave', 'dungeon', 'mine', 'forest'], groupSize: [1, 3],
    faction: 'drow', elite: true,
  }),

  mon('drow-mage', 'Drow Mage', {
    desc: "A wizard of Sorcere with a spider-carved staff and a very long memory. Drow magic is patient magic: darkness first, then the cloudkill, then the questions.",
    cr: 7, type: 'humanoid', subtype: 'elf', size: 'medium', ac: 12, acNote: 'mage armor',
    hpDice: '9d8+9', speed: 30, abilities: { str: 9, dex: 14, con: 12, int: 17, wis: 13, cha: 12 },
    saveProf: ['int', 'wis'], skills: { arcana: 6, deception: 4, perception: 4, stealth: 5 },
    senses: { darkvision: 120 }, languages: ['Elvish', 'Undercommon'],
    traits: [
      T_FEY_ANCESTRY,
      T_SUNLIGHT_SENS,
      trait('Spellcasting', "A 10th-level wizard: mage armor, misty step, greater invisibility, lightning bolt, evard's black tentacles and cloudkill, with spell save DC 14.", { passive: 'spellcasting:int:14:10' }),
      trait('Summon Demon', "Once a day it can attempt to call a quasit or shadow demon to serve it for the fight.", { passive: 'summon-demon' }),
    ],
    actions: [
      melee('Staff', 2, '1d6-1', 'bludgeoning'),
      saveAct('Cloudkill', {
        range: 120, dice: '5d8', dtype: 'poison',
        save: { ability: 'con', dc: 14, onSuccess: 'half' },
        target: { kind: 'sphere', radius: 20 },
        uses: { max: 1, recharge: 'long' },
        desc: "A sphere of yellow-green fog rolls out and creeps toward the lowest ground.",
        ai: { role: 'aoe', weight: 2.4 },
      }),
      saveAct('Lightning Bolt', {
        range: 100, dice: '8d6', dtype: 'lightning',
        save: { ability: 'dex', dc: 14, onSuccess: 'half' },
        target: { kind: 'line', length: 100, width: 5 },
        uses: { max: 2, recharge: 'long' },
        desc: "A stroke of violet lightning splits the tunnel.",
        ai: { role: 'aoe', weight: 2 },
      }),
      util('Greater Invisibility', {
        uses: { max: 1, recharge: 'long' },
        desc: "It vanishes entirely and keeps casting.",
        effects: [{ kind: 'buff', id: 'invisible', duration: '1 minute' }],
        ai: { role: 'buff', weight: 1.8 },
      }),
      util('Summon Shadow Demon', {
        uses: { max: 1, recharge: 'long' },
        desc: "It tears a seam in the dark and a shadow demon steps through.",
        effects: [{ kind: 'summon', monsterId: 'quasit', count: 1 }],
        ai: { role: 'utility', weight: 1.5 },
      }),
    ],
    ai: { archetype: 'caster', aggression: 0.7, selfPreserve: 0.7, preferredRange: 60 },
    loot: { gold: '5d6*10', table: [['spider-staff', 0.1], ['scroll-5', 0.2], ['scroll-3', 0.25], ['spellbook', 0.3], ['gem-black-pearl', 0.12], ['potion-invisibility', 0.15]] },
    sprite: 'drow', tint: '#3a2a5a', biomes: ['underdark', 'cave', 'dungeon', 'ruins'], groupSize: [1, 1],
    faction: 'drow', elite: true,
  }),

  mon('drow-priestess-of-lolth', 'Drow Priestess of Lolth', {
    desc: "A Yathrin of the Spider Queen, snake-headed scourge in one hand and her House's future in the other. She kills for Lolth, and she is careful that Lolth is watching when she does.",
    cr: 8, type: 'humanoid', subtype: 'elf', size: 'medium', ac: 16, acNote: 'scale mail',
    hpDice: '13d8+13', speed: 30, abilities: { str: 12, dex: 14, con: 12, int: 13, wis: 17, cha: 18 },
    saveProf: ['con', 'wis', 'cha'], skills: { insight: 9, perception: 9, religion: 5, stealth: 5 },
    senses: { darkvision: 120 }, languages: ['Elvish', 'Undercommon'],
    traits: [
      T_FEY_ANCESTRY,
      T_SUNLIGHT_SENS,
      trait('Spellcasting', "A 10th-level cleric of Lolth: guiding bolt, spiritual weapon, dispel magic, divination, insect plague and mass cure wounds, with spell save DC 15.", { passive: 'spellcasting:wis:15:10' }),
    ],
    actions: [
      multi("She strikes three times with the scourge.", [['scourge', 3]]),
      melee('Scourge', 6, '1d6+2', 'piercing', { effects: [{ kind: 'damage', dice: '5d6', type: 'poison' }] }),
      saveAct('Insect Plague', {
        range: 300, dice: '4d10', dtype: 'piercing',
        save: { ability: 'con', dc: 15, onSuccess: 'half' },
        target: { kind: 'sphere', radius: 20 },
        uses: { max: 1, recharge: 'long' },
        desc: "A boiling sphere of spiders and biting flies fills the chamber.",
        ai: { role: 'aoe', weight: 2.2 },
      }),
      util('Summon Yochlol', {
        uses: { max: 1, recharge: 'long' },
        desc: "She calls a handmaiden of Lolth to the fight, with a 30 percent chance the Spider Queen answers.",
        effects: [{ kind: 'summon', monsterId: 'yochlol', count: 1 }],
        ai: { role: 'utility', weight: 2 },
      }),
      util('Mass Cure Wounds', {
        kind: 'heal', dice: '3d8+3',
        uses: { max: 1, recharge: 'long' },
        target: { kind: 'area', radius: 30, allowAllies: true },
        desc: "Lolth's favour knits her sisters' wounds.",
        ai: { role: 'heal', weight: 2.3 },
      }),
    ],
    ai: { archetype: 'support', aggression: 0.65, selfPreserve: 0.7, preferredRange: 30 },
    loot: { gold: '6d6*10', table: [['holy-symbol', 0.3], ['scroll-5', 0.15], ['potion-superior-healing', 0.2], ['gem-black-pearl', 0.15], ['ring-of-protection', 0.05], ['scale-mail', 0.1]] },
    sprite: 'drow', tint: '#6a2a4a', biomes: ['underdark', 'cave', 'dungeon'], groupSize: [1, 1],
    faction: 'drow', elite: true,
  }),

  mon('drider', 'Drider', {
    desc: "A drow who failed Lolth's test and was remade from the waist down as a spider, then sent away to brood on it. It hates every drow it has ever known and every surfacer on principle.",
    cr: 6, type: 'monstrosity', size: 'large', ac: 19, acNote: 'natural armor',
    hpDice: '13d10+52', speed: 30, climb: 30, abilities: { str: 16, dex: 16, con: 18, int: 13, wis: 16, cha: 12 },
    skills: { perception: 6, stealth: 9 }, senses: { darkvision: 120 }, languages: ['Elvish', 'Undercommon'],
    traits: [
      T_FEY_ANCESTRY,
      T_SUNLIGHT_SENS,
      T_SPIDER_CLIMB,
      trait('Web Walker', "Webbing does not slow it, its own or another's.", { passive: 'web-walker' }),
      trait('Innate Spellcasting', "Dancing lights at will; darkness, faerie fire and levitate once each per day.", { passive: 'innate-casting:wis:13' }),
    ],
    actions: [
      multi("It makes three longsword attacks, or three longbow attacks, or bites and strikes.", [['longsword', 2], ['bite', 1]]),
      melee('Bite', 6, '1d4+3', 'piercing', { effects: [{ kind: 'damage', dice: '2d6', type: 'poison' }] }),
      melee('Longsword', 6, '1d8+3', 'slashing'),
      ranged('Longbow', 6, '1d8+3', 'piercing', [150, 600], { effects: [{ kind: 'damage', dice: '2d6', type: 'poison' }] }),
    ],
    ai: { archetype: 'skirmisher', aggression: 0.8, selfPreserve: 0.5, preferredRange: 30 },
    loot: { gold: '4d10*5', table: [['longsword', 0.2], ['longbow', 0.2], ['gem-onyx', 0.2], ['rope-silk', 0.2], ['poison-basic', 0.25], ['cloak-of-arachnida', 0.03]] },
    sprite: 'drider', biomes: ['underdark', 'cave', 'dungeon', 'ruins', 'forest'], groupSize: [1, 2],
    faction: 'drow',
  }),

  mon('yochlol', 'Yochlol', {
    desc: "A handmaiden of Lolth: a column of yellow tallow and eyes that can wear the shape of a beautiful drow woman when it wants something. It answers only to the Spider Queen, and it reports everything.",
    cr: 10, type: 'fiend', subtype: 'demon', size: 'medium', ac: 15, acNote: 'natural armor',
    hpDice: '17d8+68', speed: 30, climb: 30, abilities: { str: 15, dex: 14, con: 18, int: 13, wis: 15, cha: 15 },
    saveProf: ['dex', 'int', 'wis', 'cha'], skills: { deception: 8, insight: 5 },
    resist: ['cold', 'fire', 'lightning', 'bludgeoning-nonmagical', 'piercing-nonmagical', 'slashing-nonmagical'],
    immune: ['poison'], condImmune: ['poisoned'],
    senses: { darkvision: 120 }, languages: ['Abyssal', 'Elvish', 'Undercommon', 'telepathy 120'],
    traits: [
      T_MAGIC_RESIST,
      T_SPIDER_CLIMB,
      trait('Shapechanger', "It can take the form of a drow woman or a giant spider, or resume its true amorphous shape, as an action.", { passive: 'shapechanger' }),
      trait('Web Walker', "Webbing does not slow it.", { passive: 'web-walker' }),
    ],
    actions: [
      multi("It makes two slam attacks.", [['slam', 2]]),
      melee('Slam', 7, '2d6+3', 'bludgeoning', { effects: [{ kind: 'damage', dice: '3d6', type: 'poison' }] }),
      saveAct('Mist Form', {
        target: { kind: 'sphere', radius: 20 },
        dice: '4d6', dtype: 'poison',
        save: { ability: 'con', dc: 14, onSuccess: 'half' },
        desc: "It dissolves into a choking cloud and rolls through the party.",
        uses: { max: 1, recharge: 'short' },
        ai: { role: 'aoe', weight: 1.8 },
      }),
      saveAct('Dominate Person', {
        range: 60, save: { ability: 'wis', dc: 15, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'charmed', duration: '1 hour' }],
        uses: { max: 1, recharge: 'long' },
        desc: "It looks at you kindly and your will is simply no longer yours.",
        ai: { role: 'control', weight: 2.2 },
      }),
    ],
    ai: { archetype: 'caster', aggression: 0.75, selfPreserve: 0.6, preferredRange: 15 },
    loot: { gold: '4d10*10', table: [['gem-black-pearl', 0.2], ['gem-ruby', 0.12], ['scroll-5', 0.15], ['cloak-of-arachnida', 0.05], ['potion-superior-healing', 0.2]] },
    sprite: 'yochlol', biomes: ['underdark', 'dungeon', 'cave'], groupSize: [1, 2],
    faction: 'drow', elite: true,
  }),
);

// ===========================================================================
// THE RESTLESS DEAD — Wave Echo Cave, Old Owl Well, the barrow country south of the
// Trail, and every crypt Halaster has ever emptied and refilled.
// ===========================================================================

ALL.push(
  mon('wight', 'Wight', {
    desc: "A warrior who refused the grave and kept its rank. Its blade drains the life out of a man and stands him back up as a zombie to carry the shield.",
    cr: 3, type: 'undead', size: 'medium', ac: 14, acNote: 'studded leather',
    hpDice: '6d8+18', speed: 30, abilities: { str: 15, dex: 14, con: 16, int: 10, wis: 13, cha: 15 },
    skills: { perception: 3, stealth: 4 },
    resist: ['necrotic', 'bludgeoning-nonmagical', 'piercing-nonmagical', 'slashing-nonmagical'],
    immune: ['poison'], condImmune: ['exhaustion', 'poisoned'],
    senses: { darkvision: 60 }, languages: ['Common'],
    traits: [
      T_UNDEAD_NATURE,
      T_SUNLIGHT_SENS,
      trait('Life Drain Rising', "A humanoid slain by its life drain rises at the next midnight as a zombie under the wight's command.", { passive: 'raise-zombie' }),
    ],
    actions: [
      multi("It attacks twice with longsword or bow, but only once with life drain.", [['longsword', 1], ['life-drain', 1]]),
      melee('Life Drain', 4, '1d6+2', 'necrotic', {
        save: { ability: 'con', dc: 13, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'max-hp-drain', duration: 'until long rest' }],
        desc: "DC 13 Constitution save or the target's hit point maximum drops by the damage taken.",
        ai: { role: 'nuke', weight: 1.6 },
      }),
      melee('Longsword', 4, '1d8+2', 'slashing'),
      ranged('Longbow', 4, '1d8+2', 'piercing', [150, 600]),
    ],
    ai: { archetype: 'brute', aggression: 0.85, selfPreserve: 0.2, preferredRange: 5 },
    loot: { gold: '4d10', table: [['longsword', 0.25], ['studded-leather', 0.12], ['gem-onyx', 0.15], ['signet-ring', 0.1]] },
    sprite: 'wight', biomes: ['crypt', 'ruins', 'dungeon', 'mine', 'marsh'], groupSize: [1, 3],
    faction: 'undead',
  }),

  mon('wraith', 'Wraith', {
    desc: "A malice so complete it burned the body away and kept going. It passes through the mine wall, through your mail, and what it takes it keeps as a specter on a leash.",
    cr: 5, type: 'undead', size: 'medium', ac: 13, hpDice: '9d8+27',
    speed: 0, fly: 60, hover: true, abilities: { str: 6, dex: 16, con: 16, int: 12, wis: 14, cha: 15 },
    resist: ['acid', 'cold', 'fire', 'lightning', 'thunder', 'bludgeoning-nonmagical', 'piercing-nonmagical', 'slashing-nonmagical'],
    immune: ['necrotic', 'poison'],
    condImmune: ['charmed', 'exhaustion', 'grappled', 'paralyzed', 'petrified', 'poisoned', 'prone', 'restrained'],
    senses: { darkvision: 60 }, languages: ['the languages it knew in life'],
    traits: [T_UNDEAD_NATURE, T_INCORPOREAL, T_SUNLIGHT_SENS],
    actions: [
      melee('Life Drain', 6, '4d8+3', 'necrotic', {
        save: { ability: 'con', dc: 14, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'max-hp-drain', duration: 'until long rest' }],
        desc: "DC 14 Constitution save or the target's hit point maximum drops by the damage taken.",
      }),
      util('Create Specter', {
        uses: { max: 1, recharge: 'long' },
        desc: "It calls the soul of a humanoid dead less than a minute back into a specter bound to its service.",
        effects: [{ kind: 'summon', monsterId: 'specter', count: 1 }],
        ai: { role: 'utility', weight: 1.6 },
      }),
    ],
    ai: { archetype: 'skirmisher', aggression: 0.85, selfPreserve: 0.4, preferredRange: 5 },
    loot: { gold: '3d10*5', table: [['gem-onyx', 0.25], ['gem-black-pearl', 0.08], ['scroll-3', 0.1]] },
    sprite: 'wraith', biomes: ['crypt', 'mine', 'ruins', 'dungeon', 'marsh'], groupSize: [1, 2],
    faction: 'undead',
  }),

  mon('mummy', 'Mummy', {
    desc: "Bound in resin-soaked linen and set to guard a tomb until the sun burns out. Its dry hand carries a rot that no herb touches, and its gaze stops the heart in the chest.",
    cr: 3, type: 'undead', size: 'medium', ac: 11, acNote: 'natural armor',
    hpDice: '9d8+18', speed: 20, abilities: { str: 16, dex: 8, con: 15, int: 6, wis: 10, cha: 12 },
    saveProf: ['wis'], vuln: ['fire'],
    resist: ['bludgeoning-nonmagical', 'piercing-nonmagical', 'slashing-nonmagical'],
    immune: ['necrotic', 'poison'], condImmune: ['charmed', 'exhaustion', 'frightened', 'paralyzed', 'poisoned'],
    senses: { darkvision: 60 }, languages: ['the languages it knew in life'],
    traits: [T_UNDEAD_NATURE],
    actions: [
      multi("It uses its dreadful glare and strikes with a rotting fist.", [['dreadful-glare', 1], ['rotting-fist', 1]]),
      melee('Rotting Fist', 5, '2d6+3', 'bludgeoning', {
        save: { ability: 'con', dc: 12, onSuccess: 'negate' },
        effects: [{ kind: 'damage', dice: '3d6', type: 'necrotic' }, { kind: 'condition', id: 'diseased', duration: 'until cured' }],
        desc: "The blow carries mummy rot: the victim cannot regain hit points and its maximum drops each day until it is cured.",
      }),
      saveAct('Dreadful Glare', {
        range: 60, save: { ability: 'wis', dc: 11, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'frightened', duration: '1 minute' }, { kind: 'condition', id: 'paralyzed', duration: '1 minute' }],
        desc: "It fixes its empty sockets on a creature, which must save or be frightened and paralyzed until the end of its next turn.",
        ai: { role: 'debuff', weight: 1.6 },
      }),
    ],
    ai: { archetype: 'brute', aggression: 0.8, selfPreserve: 0.1, preferredRange: 5 },
    loot: { gold: '5d10', table: [['gem-onyx', 0.2], ['gem-amber', 0.15], ['scroll-3', 0.1], ['holy-symbol', 0.1]] },
    sprite: 'mummy', biomes: ['crypt', 'ruins', 'dungeon', 'ash-waste'], groupSize: [1, 3],
    faction: 'undead',
  }),

  mon('mummy-lord', 'Mummy Lord', {
    desc: "A high priest of a dead empire, heart in one jar and organs in three more, who has spent four thousand years being patient. Kill the body and it reassembles by the next dark of the moon.",
    cr: 15, type: 'undead', size: 'medium', ac: 17, acNote: 'natural armor',
    hpDice: '16d8+80', speed: 20, abilities: { str: 18, dex: 10, con: 17, int: 11, wis: 18, cha: 16 },
    saveProf: ['con', 'int', 'wis', 'cha'], skills: { history: 5, religion: 5 },
    vuln: ['fire'], immune: ['necrotic', 'poison', 'bludgeoning-nonmagical', 'piercing-nonmagical', 'slashing-nonmagical'],
    condImmune: ['charmed', 'exhaustion', 'frightened', 'paralyzed', 'poisoned'],
    senses: { darkvision: 60 }, languages: ['Common', 'the languages it knew in life'],
    traits: [
      T_UNDEAD_NATURE,
      legendaryResistance(3),
      trait('Magic Resistance', "Spells slide off the wrappings; it has advantage on saves against magic.", { passive: 'magic-resistance', advSaveVs: ['spell'] }),
      trait('Rejuvenation', "Destroyed, it re-forms in 24 hours beside its heart, and only destroying the heart ends it.", { passive: 'rejuvenation:heart' }),
      trait('Spellcasting', "A 10th-level priest: command, guiding bolt, hold person, dispel magic, contagion, harm and insect plague, with spell save DC 17.", { passive: 'spellcasting:wis:17:10' }),
    ],
    actions: [
      multi("It uses its dreadful glare and strikes with a rotting fist.", [['dreadful-glare', 1], ['rotting-fist', 1]]),
      melee('Rotting Fist', 9, '3d6+4', 'bludgeoning', {
        save: { ability: 'con', dc: 16, onSuccess: 'negate' },
        effects: [{ kind: 'damage', dice: '6d6', type: 'necrotic' }, { kind: 'condition', id: 'diseased', duration: 'until cured' }],
        desc: "Mummy rot, and this time it is a curse laid by a priest-king.",
      }),
      saveAct('Dreadful Glare', {
        range: 60, save: { ability: 'wis', dc: 16, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'frightened', duration: '1 minute' }, { kind: 'condition', id: 'paralyzed', duration: '1 minute' }],
        desc: "Four thousand years of authority in one look.",
        ai: { role: 'debuff', weight: 1.8 },
      }),
      saveAct('Harm', {
        range: 60, dice: '14d6', dtype: 'necrotic',
        save: { ability: 'con', dc: 17, onSuccess: 'half' },
        uses: { max: 1, recharge: 'long' },
        desc: "It speaks one word and a wasting sickness takes hold instantly.",
        ai: { role: 'nuke', weight: 2.4 },
      }),
    ],
    legendary: {
      count: 3, resist: 3,
      actions: [
        legend('Attack', 1, "It makes one rotting fist attack.", { ref: 'rotting-fist', ai: { role: 'nuke', weight: 1.2 } }),
        legend('Blinding Dust', 2, "Blinding dust swirls around it; each creature within 5 feet must save or be blinded until the end of its next turn.", {
          kind: 'save', save: { ability: 'con', dc: 16, onSuccess: 'negate' },
          target: { kind: 'sphere', radius: 5 },
          effects: [{ kind: 'condition', id: 'blinded', duration: '1 round' }],
          ai: { role: 'debuff', weight: 1 },
        }),
        legend('Whirlwind of Sand', 2, "It dissolves into sand, moves up to 60 feet, and re-forms; it cannot be harmed in transit.", {
          kind: 'utility', target: { kind: 'self' }, effects: [{ kind: 'teleport', distance: 60 }],
          ai: { role: 'utility', weight: 1 },
        }),
      ],
    },
    lair: lair('Tomb of the Priest-King', "A pillared burial hall where the murals move when you are not looking at them and the air is full of dust that was once linen.", [
      lairAct('Sand Blast', "Sand erupts from the floor: DC 16 Dexterity save or take 3d6 slashing damage and be blinded.", {
        save: { ability: 'dex', dc: 16, onSuccess: 'half' }, dice: '3d6', dtype: 'slashing',
      }),
      lairAct('Grasping Hands', "Withered hands burst up through the flagstones and restrain a creature until the next lair action.", {
        save: { ability: 'str', dc: 16, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'restrained', duration: '1 round' }],
      }),
      lairAct('Curse of the Tomb', "The murals scream a dead language: DC 16 Wisdom save or be frightened until the next lair action.", {
        save: { ability: 'wis', dc: 16, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'frightened', duration: '1 round' }],
      }),
    ], { biome: 'crypt' }),
    ai: { archetype: 'boss', aggression: 0.8, selfPreserve: 0.4, preferredRange: 30 },
    loot: { gold: '8d10*20', table: [['gem-diamond', 0.2], ['gem-ruby', 0.25], ['scroll-6', 0.2], ['holy-symbol', 0.3], ['scarab-of-protection', 0.05], ['tome-of-understanding', 0.05]] },
    sprite: 'mummy', tint: '#c8a83a', biomes: ['crypt', 'ruins', 'dungeon'], groupSize: [1, 1],
    faction: 'undead', elite: true,
  }),

  mon('vampire-spawn', 'Vampire Spawn', {
    desc: "A victim who died with the master's blood in them and rose without a will of their own. Fast, strong and permanently starving, they are sent up the stairs first.",
    cr: 5, type: 'undead', size: 'medium', ac: 15, acNote: 'natural armor',
    hpDice: '11d8+33', speed: 30, abilities: { str: 16, dex: 16, con: 16, int: 11, wis: 10, cha: 12 },
    saveProf: ['dex', 'wis'], skills: { perception: 3, stealth: 6 },
    resist: ['necrotic', 'bludgeoning-nonmagical', 'piercing-nonmagical', 'slashing-nonmagical'],
    senses: { darkvision: 60 }, languages: ['the languages it knew in life'],
    traits: [
      T_UNDEAD_NATURE,
      trait('Regeneration', "It regains 10 hit points at the start of its turn unless it took radiant damage or is in running water.", { passive: 'regeneration:10:radiant' }),
      trait('Spider Climb', "It climbs sheer walls head-first, without hands.", { passive: 'spider-climb' }),
      trait('Vampire Weaknesses', "Running water, a stake through the heart and sunlight each undo it; sunlight also blinds and burns.", { passive: 'vampire-weaknesses' }),
    ],
    actions: [
      multi("It claws and bites.", [['claws', 1], ['bite', 1]]),
      melee('Claws', 6, '2d4+3', 'slashing', { effects: [{ kind: 'condition', id: 'grappled', save: { ability: 'str', dc: 13 } }] }),
      melee('Bite', 6, '1d6+3', 'piercing', {
        effects: [{ kind: 'damage', dice: '2d6', type: 'necrotic' }, { kind: 'condition', id: 'max-hp-drain', duration: 'until long rest' }],
        desc: "It bites a grappled, restrained or willing creature and drinks; its own wounds close as it does.",
        ai: { role: 'nuke', weight: 1.7 },
      }),
    ],
    ai: { archetype: 'skirmisher', aggression: 0.9, selfPreserve: 0.3, preferredRange: 5 },
    loot: { gold: '4d10*3', table: [['gem-ruby', 0.08], ['gem-onyx', 0.2], ['clothes-fine', 0.25], ['signet-ring', 0.12]] },
    sprite: 'vampire', tint: '#7a5a5a', biomes: ['crypt', 'dungeon', 'ruins', 'city'], groupSize: [1, 4],
    faction: 'undead',
  }),

  mon('vampire', 'Vampire', {
    desc: "Immaculate, charming and centuries old, it will offer you wine it cannot drink and a bargain you cannot afford. Then the room fills with bats and the charm ends.",
    cr: 13, type: 'undead', size: 'medium', ac: 16, acNote: 'natural armor',
    hpDice: '17d8+68', speed: 30, abilities: { str: 18, dex: 18, con: 18, int: 17, wis: 15, cha: 18 },
    saveProf: ['dex', 'wis', 'cha'], skills: { perception: 7, stealth: 9 },
    resist: ['necrotic', 'bludgeoning-nonmagical', 'piercing-nonmagical', 'slashing-nonmagical'],
    senses: { darkvision: 120 }, languages: ['Common', 'the languages it knew in life'],
    traits: [
      T_UNDEAD_NATURE,
      legendaryResistance(3),
      trait('Shapechanger', "It becomes a bat, a cloud of mist, or itself again, and its gear transforms with it.", { passive: 'shapechanger' }),
      trait('Regeneration', "It regains 20 hit points at the start of its turn unless it took radiant damage or is in running water. At 0 hit points in mist form it flees to its coffin.", { passive: 'regeneration:20:radiant' }),
      trait('Misty Escape', "Reduced to 0 hit points, it turns to mist and streaks for its resting place instead of dying.", { passive: 'misty-escape' }),
      trait('Spider Climb', "It walks the ceiling as easily as the floor.", { passive: 'spider-climb' }),
      trait('Vampire Weaknesses', "Running water, sunlight, a stake through the heart, and it cannot enter a home uninvited.", { passive: 'vampire-weaknesses' }),
    ],
    actions: [
      multi("It makes two attacks, only one of which can be a bite.", [['unarmed-strike', 1], ['bite', 1]]),
      melee('Unarmed Strike', 9, '1d8+4', 'bludgeoning', { effects: [{ kind: 'condition', id: 'grappled', save: { ability: 'str', dc: 18 } }] }),
      melee('Bite', 9, '1d6+4', 'piercing', {
        effects: [{ kind: 'damage', dice: '3d6', type: 'necrotic' }, { kind: 'condition', id: 'max-hp-drain', duration: 'until long rest' }],
        desc: "It drinks, healing itself for as much as it takes; a victim drained to nothing rises as a vampire spawn under its command.",
        ai: { role: 'nuke', weight: 2 },
      }),
      saveAct('Charm', {
        range: 30, save: { ability: 'wis', dc: 17, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'charmed', duration: '24 hours' }],
        desc: "It meets your eyes and asks, courteously, that you come closer.",
        ai: { role: 'control', weight: 2 },
      }),
      util('Children of the Night', {
        uses: { max: 1, recharge: 'long' },
        desc: "It calls swarms of bats and rats out of the dark to fight for it.",
        effects: [{ kind: 'summon', monsterId: 'swarm-of-bats', count: 3 }],
        ai: { role: 'utility', weight: 1.6 },
      }),
    ],
    legendary: {
      count: 3, resist: 3,
      actions: [
        legend('Move', 1, "It moves up to its speed without provoking opportunity attacks.", { kind: 'utility', target: { kind: 'self' }, ai: { role: 'utility', weight: 0.7 } }),
        legend('Unarmed Strike', 1, "It makes one unarmed strike.", { ref: 'unarmed-strike', ai: { role: 'nuke', weight: 1.1 } }),
        legend('Bite', 2, "It makes one bite attack.", { ref: 'bite', ai: { role: 'nuke', weight: 1.8 } }),
      ],
    },
    lair: lair('Vampire Crypt', "A cold hall of black marble, candles that gutter without wind, and a sarcophagus nobody wants to open.", [
      lairAct('Shadow Grasp', "Shadows in a 15-foot radius clutch at the living: DC 17 Strength save or be restrained until the next lair action.", {
        save: { ability: 'str', dc: 17, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'restrained', duration: '1 round' }],
      }),
      lairAct('Swarm of Bats', "Bats pour from the vaults, forcing a DC 17 Dexterity save for 2d6 piercing damage.", {
        save: { ability: 'dex', dc: 17, onSuccess: 'half' }, dice: '2d6', dtype: 'piercing',
      }),
      lairAct('Bloodmist', "A red mist rises; the vampire regains 15 hit points and every living creature has disadvantage on its next save.", {
        effects: [{ kind: 'heal', dice: '15' }, { kind: 'condition', id: 'cursed', duration: '1 round' }],
      }),
    ], { biome: 'crypt' }),
    ai: { archetype: 'boss', aggression: 0.8, selfPreserve: 0.6, preferredRange: 5 },
    loot: { gold: '6d10*20', table: [['gem-ruby', 0.25], ['gem-black-pearl', 0.2], ['ring-of-protection', 0.08], ['cloak-of-protection', 0.1], ['clothes-fine', 0.4], ['sword-of-life-stealing', 0.05]] },
    sprite: 'vampire', biomes: ['crypt', 'city', 'dungeon', 'ruins'], groupSize: [1, 1],
    faction: 'undead', elite: true,
  }),

  mon('ghost', 'Ghost', {
    desc: "Someone who died with a matter left unfinished and has been rehearsing it ever since. It can reach through your ribs to squeeze the heart, or simply step into your body and walk away in it.",
    cr: 4, type: 'undead', size: 'medium', ac: 11, hpDice: '10d8+10',
    speed: 0, fly: 40, hover: true, abilities: { str: 7, dex: 13, con: 10, int: 10, wis: 12, cha: 17 },
    resist: ['acid', 'fire', 'lightning', 'thunder', 'bludgeoning-nonmagical', 'piercing-nonmagical', 'slashing-nonmagical'],
    immune: ['cold', 'necrotic', 'poison'],
    condImmune: ['charmed', 'exhaustion', 'frightened', 'grappled', 'paralyzed', 'petrified', 'poisoned', 'prone', 'restrained'],
    senses: { darkvision: 60 }, languages: ['the languages it knew in life'],
    traits: [
      T_UNDEAD_NATURE,
      T_INCORPOREAL,
      trait('Ethereal Sight', "It sees 60 feet into the Ethereal Plane while on the Material, and the reverse.", { passive: 'ethereal-sight:60' }),
    ],
    actions: [
      melee('Withering Touch', 5, '4d6+3', 'necrotic'),
      saveAct('Horrifying Visage', {
        range: 60, save: { ability: 'wis', dc: 13, onSuccess: 'negate' },
        target: { kind: 'cone', length: 60 },
        effects: [{ kind: 'condition', id: 'frightened', duration: '1 minute' }],
        uses: { max: 1, recharge: 'short' },
        desc: "It shows you how it died. Those who fail age 1d4 x 10 years on the spot.",
        ai: { role: 'debuff', weight: 1.7 },
      }),
      saveAct('Possession', {
        range: 5, save: { ability: 'cha', dc: 13, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'dominated', duration: '24 hours' }],
        uses: { max: 1, recharge: '6' },
        desc: "It steps into a humanoid body and takes the controls; the ghost's own form vanishes while it rides.",
        ai: { role: 'control', weight: 2 },
      }),
    ],
    ai: { archetype: 'caster', aggression: 0.7, selfPreserve: 0.5, preferredRange: 5 },
    loot: { gold: '2d10*5', table: [['gem-moonstone', 0.15], ['signet-ring', 0.15], ['gem-pearl', 0.1]] },
    sprite: 'ghost', biomes: ['crypt', 'ruins', 'dungeon', 'city', 'marsh'], groupSize: [1, 2],
    faction: 'undead',
  }),

  mon('banshee', 'Banshee', {
    desc: "An elf woman who valued her beauty above every living thing and could not bear to leave it. Her wail is grief made audible, and it stops hearts at fifty paces.",
    cr: 4, type: 'undead', size: 'medium', ac: 12, hpDice: '12d8',
    speed: 0, fly: 40, hover: true, abilities: { str: 1, dex: 14, con: 10, int: 12, wis: 11, cha: 17 },
    saveProf: ['wis', 'cha'],
    resist: ['acid', 'fire', 'lightning', 'thunder', 'bludgeoning-nonmagical', 'piercing-nonmagical', 'slashing-nonmagical'],
    immune: ['cold', 'necrotic', 'poison'],
    condImmune: ['charmed', 'exhaustion', 'frightened', 'grappled', 'paralyzed', 'petrified', 'poisoned', 'prone', 'restrained'],
    senses: { darkvision: 60 }, languages: ['Common', 'Elvish'],
    traits: [
      T_UNDEAD_NATURE,
      T_INCORPOREAL,
      trait('Detect Life', "It senses every living creature within five miles and the direction of each.", { passive: 'detect-life:5mi' }),
      trait('Horrifying Visage', "Any creature that starts its turn within 60 feet and can see her must save or be frightened.", { passive: 'horrifying-visage:13:60' }),
    ],
    actions: [
      melee('Corrupting Touch', 4, '3d6+2', 'necrotic'),
      saveAct('Wail', {
        range: 30, dice: '0', dtype: 'necrotic',
        save: { ability: 'con', dc: 13, onSuccess: 'negate' },
        target: { kind: 'sphere', radius: 30 },
        effects: [{ kind: 'condition', id: 'dying', duration: 'instant' }],
        uses: { max: 1, recharge: 'long' },
        desc: "She looses one grief-stricken shriek. Every living creature within 30 feet that can hear it drops to 0 hit points on a failed save.",
        ai: { role: 'nuke', weight: 2.8 },
      }),
    ],
    ai: { archetype: 'caster', aggression: 0.7, selfPreserve: 0.5, preferredRange: 20 },
    loot: { gold: '3d10*5', table: [['gem-pearl', 0.2], ['gem-moonstone', 0.2], ['clothes-fine', 0.2]] },
    sprite: 'banshee', biomes: ['ruins', 'forest', 'crypt', 'marsh'], groupSize: [1, 1],
    faction: 'undead',
  }),

  mon('flameskull', 'Flameskull', {
    desc: "A wizard's skull kept burning as a watchman, still muttering the spells it knew in life. Smash it and it knits itself back together over an hour unless the bone is blessed or ground to dust.",
    cr: 4, type: 'undead', size: 'tiny', ac: 13, hpDice: '11d4',
    speed: 0, fly: 40, hover: true, abilities: { str: 1, dex: 17, con: 14, int: 16, wis: 10, cha: 11 },
    skills: { arcana: 5, perception: 2 },
    resist: ['lightning', 'necrotic', 'piercing'],
    immune: ['cold', 'fire', 'poison'],
    condImmune: ['charmed', 'frightened', 'paralyzed', 'poisoned', 'prone'],
    senses: { darkvision: 60 }, languages: ['Common'],
    traits: [
      T_UNDEAD_NATURE,
      T_ILLUMINATION,
      trait('Rejuvenation', "Destroyed, it re-forms in one hour with all its hit points unless holy water is sprinkled on the remains.", { passive: 'rejuvenation:1hr:holy-water' }),
      trait('Spellcasting', "A 5th-level caster: mage hand, blur, flaming sphere, fireball and magic missile, with spell save DC 13.", { passive: 'spellcasting:int:13:5' }),
    ],
    actions: [
      multi("It hurls two gouts of fire.", [['fire-ray', 2]]),
      ranged('Fire Ray', 5, '3d6', 'fire', [30, 120]),
      saveAct('Fireball', {
        range: 150, dice: '8d6', dtype: 'fire',
        save: { ability: 'dex', dc: 13, onSuccess: 'half' },
        target: { kind: 'sphere', radius: 20 },
        uses: { max: 1, recharge: 'long' },
        desc: "It shrieks a word it learned in life and the corridor fills with fire.",
        ai: { role: 'aoe', weight: 2.5 },
      }),
    ],
    ai: { archetype: 'caster', aggression: 0.8, selfPreserve: 0.4, preferredRange: 60 },
    loot: { gold: '2d10*5', table: [['scroll-3', 0.2], ['spellbook', 0.1], ['gem-ruby', 0.06], ['wand-of-magic-missiles', 0.05]] },
    sprite: 'flameskull', biomes: ['crypt', 'dungeon', 'mine', 'ruins'], groupSize: [1, 2],
    faction: 'undead',
  }),

  mon('revenant', 'Revenant', {
    desc: "A soul that refused Kelemvor's summons because a debt was outstanding. It has one year to find its murderer, it knows exactly where they are, and nothing else in the world interests it.",
    cr: 5, type: 'undead', size: 'medium', ac: 13, acNote: 'leather armor',
    hpDice: '18d8+54', speed: 30, abilities: { str: 18, dex: 14, con: 18, int: 13, wis: 16, cha: 18 },
    saveProf: ['str', 'con', 'wis', 'cha'],
    resist: ['necrotic', 'psychic'], immune: ['poison'],
    condImmune: ['charmed', 'exhaustion', 'frightened', 'paralyzed', 'poisoned', 'stunned'],
    senses: { darkvision: 60 }, languages: ['the languages it knew in life'],
    traits: [
      T_UNDEAD_NATURE,
      trait('Regeneration', "It regains 10 hit points at the start of its turn. Destroyed, it re-forms in 24 hours unless its sworn foe is dead.", { passive: 'regeneration:10:none' }),
      trait('Turn Immunity', "It cannot be turned. Kelemvor's clergy have stopped trying.", { passive: 'turn-immunity' }),
      trait('Vengeful Tracker', "It knows the direction and distance to its sworn foe anywhere on the same plane, and it does not sleep.", { passive: 'vengeful-tracker' }),
    ],
    actions: [
      multi("It makes two fist attacks.", [['fist', 2]]),
      melee('Fist', 7, '2d6+4', 'bludgeoning', {
        desc: "Against its sworn foe the blow lands with unnatural weight, adding 14 (4d6) damage.",
        effects: [{ kind: 'damage', dice: '4d6', type: 'bludgeoning', condition: 'sworn-foe' }],
      }),
      saveAct('Vengeful Glare', {
        range: 30, save: { ability: 'wis', dc: 15, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'paralyzed', duration: '1 minute' }, { kind: 'condition', id: 'frightened', duration: '1 minute' }],
        desc: "It looks its sworn foe in the eye and that creature is paralyzed with terror until it can shake the stare.",
        ai: { role: 'control', weight: 1.8 },
      }),
    ],
    ai: { archetype: 'brute', aggression: 0.95, selfPreserve: 0.05, preferredRange: 5 },
    loot: { gold: '3d10*5', table: [['leather-armor', 0.15], ['signet-ring', 0.2], ['gem-onyx', 0.15], ['potion-heroism', 0.1]] },
    sprite: 'revenant', biomes: ['crypt', 'ruins', 'road', 'city', 'dungeon'], groupSize: [1, 1],
    faction: 'undead',
  }),

  mon('death-knight', 'Death Knight', {
    desc: "A paladin who broke every oath and was denied even death for it. Its armour is fused to what is left of it, its blade is hellfire, and it commands the dead the way it once commanded men.",
    cr: 17, type: 'undead', size: 'medium', ac: 20, acNote: 'plate armor',
    hpDice: '18d8+108', speed: 30, abilities: { str: 20, dex: 11, con: 22, int: 12, wis: 16, cha: 18 },
    saveProf: ['dex', 'wis', 'cha'],
    immune: ['necrotic', 'poison'], condImmune: ['exhaustion', 'frightened', 'poisoned'],
    senses: { darkvision: 120 }, languages: ['Abyssal', 'Common'],
    traits: [
      T_UNDEAD_NATURE,
      T_MAGIC_RESIST,
      trait('Marshal Undead', "Every undead within 60 feet that can hear it has advantage on saves against turning.", { passive: 'marshal-undead:60' }),
      trait('Spellcasting', "A 19th-level oathbreaker: command, compelled duel, searing smite, dispel evil and good, destructive wave and staggering smite, with spell save DC 18.", { passive: 'spellcasting:cha:18:19' }),
    ],
    actions: [
      multi("It makes three longsword attacks.", [['longsword', 3]]),
      melee('Longsword', 11, '1d8+6', 'slashing', {
        effects: [{ kind: 'damage', dice: '4d8', type: 'necrotic' }],
        desc: "Two-handed, the blade deals 1d10+6 slashing plus 18 (4d8) necrotic damage.",
      }),
      saveAct('Hellfire Orb', {
        range: 120, dice: '10d6', dtype: 'fire',
        save: { ability: 'dex', dc: 18, onSuccess: 'half' },
        target: { kind: 'sphere', radius: 20 },
        effects: [{ kind: 'damage', dice: '10d6', type: 'necrotic' }],
        uses: { max: 1, recharge: 'long' },
        desc: "It hurls a black-red sphere that bursts into 35 fire and 35 necrotic damage.",
        ai: { role: 'aoe', weight: 2.8 },
      }),
      saveAct('Destructive Wave', {
        dice: '5d6', dtype: 'thunder',
        save: { ability: 'con', dc: 18, onSuccess: 'half' },
        target: { kind: 'sphere', radius: 30 },
        effects: [{ kind: 'damage', dice: '5d6', type: 'necrotic' }, { kind: 'condition', id: 'prone' }],
        uses: { max: 1, recharge: 'long' },
        desc: "It drives the blade into the ground and the floor answers.",
        ai: { role: 'aoe', weight: 2.6 },
      }),
    ],
    reactions: [util('Parry', { desc: "It adds 6 to its AC against one melee attack that would hit it.", ai: { role: 'utility', weight: 1.3 } })],
    ai: { archetype: 'boss', aggression: 0.85, selfPreserve: 0.4, preferredRange: 5 },
    loot: { gold: '8d10*20', table: [['plate-armor', 0.2], ['longsword', 0.3], ['sword-of-life-stealing', 0.08], ['ring-of-resistance-necrotic', 0.08], ['gem-diamond', 0.2], ['scroll-7', 0.15]] },
    sprite: 'death-knight', biomes: ['crypt', 'dungeon', 'ruins', 'ash-waste'], groupSize: [1, 1],
    faction: 'undead', elite: true,
  }),

  mon('lich', 'Lich', {
    desc: "A wizard who traded everything for time and got it. Its phylactery is hidden somewhere you have not looked, and until you find it, killing the body only annoys it.",
    cr: 21, type: 'undead', size: 'medium', ac: 17, acNote: 'natural armor',
    hpDice: '18d8+54', speed: 30, abilities: { str: 11, dex: 16, con: 16, int: 20, wis: 14, cha: 16 },
    saveProf: ['con', 'int', 'wis'], skills: { arcana: 18, history: 12, insight: 9, perception: 9 },
    resist: ['cold', 'lightning', 'necrotic'],
    immune: ['poison', 'bludgeoning-nonmagical', 'piercing-nonmagical', 'slashing-nonmagical'],
    condImmune: ['charmed', 'exhaustion', 'frightened', 'paralyzed', 'poisoned'],
    senses: { truesight: 120 }, languages: ['Common', 'Draconic', 'Elvish', 'Infernal', 'Undercommon'],
    traits: [
      T_UNDEAD_NATURE,
      legendaryResistance(3),
      trait('Rejuvenation', "If it has a phylactery, its body re-forms beside it in 1d10 days.", { passive: 'rejuvenation:phylactery' }),
      trait('Turn Resistance', "It has advantage on saves against effects that turn undead.", { passive: 'turn-resistance' }),
      trait('Spellcasting', "An 18th-level wizard: counterspell, dispel magic, fireball, cone of cold, finger of death, power word kill, plane shift and time stop, with spell save DC 20.", { passive: 'spellcasting:int:20:18' }),
    ],
    actions: [
      melee('Paralyzing Touch', 12, '3d6', 'cold', {
        save: { ability: 'con', dc: 18, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'paralyzed', duration: '1 minute' }],
        desc: "DC 18 Constitution save or be paralyzed for a minute, saving again at the end of each turn.",
      }),
      saveAct('Finger of Death', {
        range: 60, dice: '7d8+30', dtype: 'necrotic',
        save: { ability: 'con', dc: 20, onSuccess: 'half' },
        uses: { max: 3, recharge: 'long' },
        desc: "A beam of withering green light; a humanoid killed by it rises as a zombie under the lich's command.",
        ai: { role: 'nuke', weight: 2.6 },
      }),
      saveAct('Cone of Cold', {
        dice: '8d8', dtype: 'cold',
        save: { ability: 'con', dc: 20, onSuccess: 'half' },
        target: { kind: 'cone', length: 60 },
        uses: { max: 2, recharge: 'long' },
        desc: "A 60-foot cone of killing frost.",
        ai: { role: 'aoe', weight: 2.4 },
      }),
      saveAct('Power Word Kill', {
        range: 60, save: null,
        uses: { max: 1, recharge: 'long' },
        effects: [{ kind: 'condition', id: 'dying', duration: 'instant' }],
        desc: "It speaks one word. A creature with 100 hit points or fewer simply stops.",
        ai: { role: 'nuke', weight: 3 },
      }),
    ],
    legendary: {
      count: 3, resist: 3,
      actions: [
        legend('Cantrip', 1, "It casts a cantrip.", { kind: 'save', dice: '4d10', dtype: 'fire', range: 120, ai: { role: 'nuke', weight: 1.2 } }),
        legend('Paralyzing Touch', 2, "It makes one paralyzing touch attack.", { ref: 'paralyzing-touch', ai: { role: 'control', weight: 1.6 } }),
        legend('Frightening Gaze', 2, "It fixes its gaze on one creature within 10 feet: DC 18 Wisdom save or be frightened for a minute.", {
          kind: 'save', range: 10, save: { ability: 'wis', dc: 18, onSuccess: 'negate' },
          effects: [{ kind: 'condition', id: 'frightened', duration: '1 minute' }],
          ai: { role: 'debuff', weight: 1.3 },
        }),
        legend('Disrupt Life', 3, "Every living creature within 20 feet takes 6d6 necrotic damage, half on a DC 18 Constitution save.", {
          kind: 'save', dice: '6d6', dtype: 'necrotic',
          save: { ability: 'con', dc: 18, onSuccess: 'half' },
          target: { kind: 'sphere', radius: 20 },
          ai: { role: 'aoe', weight: 2 },
        }),
      ],
    },
    lair: lair('Lich Sanctum', "A vaulted workroom lit by cold green witchlight, where the air is dry as parchment and something is always being copied out in a hand that never tires.", [
      lairAct('Grasping Dead', "Withered hands erupt in a 20-foot radius: DC 18 Dexterity save or be restrained and take 3d6 necrotic damage.", {
        save: { ability: 'dex', dc: 18, onSuccess: 'negate' }, dice: '3d6', dtype: 'necrotic',
        effects: [{ kind: 'condition', id: 'restrained', duration: '1 round' }],
      }),
      lairAct('Rolling Dread', "A wave of dread crosses the room: DC 18 Wisdom save or be frightened until the next lair action.", {
        save: { ability: 'wis', dc: 18, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'frightened', duration: '1 round' }],
      }),
      lairAct('Shadow Sight', "Shadows lengthen and the lich sees through them, gaining advantage on its next attack and negating cover.", {
        effects: [{ kind: 'buff', id: 'true-sight', duration: '1 round' }],
      }),
    ], { biome: 'dungeon' }),
    ai: { archetype: 'boss', aggression: 0.75, selfPreserve: 0.85, preferredRange: 60 },
    loot: { gold: '10d10*50', table: [['spellbook', 0.6], ['scroll-8', 0.3], ['scroll-7', 0.35], ['staff-of-power', 0.06], ['robe-of-the-archmagi', 0.06], ['gem-diamond', 0.4], ['ring-of-spell-storing', 0.1]] },
    sprite: 'lich', biomes: ['dungeon', 'crypt', 'ruins', 'underdark'], groupSize: [1, 1],
    faction: 'undead', elite: true,
  }),

  mon('demilich', 'Demilich', {
    desc: "A lich that let the body rot away and kept only the skull, six soul gems set in its jaw where teeth used to be. It does not cast spells any more. It simply asks for your soul and takes it.",
    cr: 18, type: 'undead', size: 'tiny', ac: 20, acNote: 'natural armor',
    hpDice: '20d4+30', speed: 0, fly: 30, hover: true,
    abilities: { str: 1, dex: 20, con: 20, int: 20, wis: 17, cha: 20 },
    saveProf: ['con', 'int', 'wis', 'cha'],
    resist: ['bludgeoning-magical', 'piercing-magical', 'slashing-magical'],
    immune: ['necrotic', 'poison', 'psychic', 'bludgeoning-nonmagical', 'piercing-nonmagical', 'slashing-nonmagical'],
    condImmune: ['charmed', 'deafened', 'exhaustion', 'frightened', 'paralyzed', 'petrified', 'poisoned', 'prone', 'stunned'],
    senses: { truesight: 120 }, languages: [],
    traits: [
      T_UNDEAD_NATURE,
      legendaryResistance(3),
      trait('Avoidance', "If it makes a saving throw against an effect for half damage, it takes none instead.", { passive: 'avoidance' }),
      trait('Turn Immunity', "It cannot be turned.", { passive: 'turn-immunity' }),
      trait('Rejuvenation', "As long as one soul remains trapped in its gems, the skull re-forms in 1d10 days.", { passive: 'rejuvenation:soul-gems' }),
    ],
    actions: [
      saveAct('Howl', {
        range: 30, save: { ability: 'con', dc: 19, onSuccess: 'negate' },
        target: { kind: 'sphere', radius: 30 },
        effects: [{ kind: 'condition', id: 'dying', duration: 'instant' }, { kind: 'condition', id: 'frightened', duration: '1 minute' }],
        uses: { max: 1, recharge: '5-6' },
        desc: "The skull shrieks. Every creature within 30 feet that can hear it drops to 0 hit points on a failed save.",
        ai: { role: 'nuke', weight: 2.9 },
      }),
      saveAct('Life Drain', {
        range: 10, dice: '10d10', dtype: 'necrotic',
        save: { ability: 'con', dc: 19, onSuccess: 'half' },
        target: { kind: 'multi', maxTargets: 3 },
        desc: "It drains the life from up to three creatures it can see and heals itself for the total.",
        effects: [{ kind: 'heal', dice: '10d10' }],
        ai: { role: 'nuke', weight: 2.6 },
      }),
      saveAct('Trap Soul', {
        range: 30, save: { ability: 'cha', dc: 19, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'soul-trapped', duration: 'until dispelled' }],
        uses: { max: 1, recharge: 'long' },
        desc: "One of the gems flares and a soul is drawn into it; the body drops as an empty shell.",
        ai: { role: 'control', weight: 2.8 },
      }),
    ],
    legendary: {
      count: 3, resist: 3,
      actions: [
        legend('Flight', 1, "The skull drifts up to half its speed without provoking opportunity attacks.", { kind: 'utility', target: { kind: 'self' }, ai: { role: 'utility', weight: 0.6 } }),
        legend('Cloud of Dust', 2, "Choking dust bursts out in a 10-foot radius: DC 15 Constitution save or be blinded until the end of the next turn.", {
          kind: 'save', save: { ability: 'con', dc: 15, onSuccess: 'negate' },
          target: { kind: 'sphere', radius: 10 },
          effects: [{ kind: 'condition', id: 'blinded', duration: '1 round' }],
          ai: { role: 'debuff', weight: 1.2 },
        }),
        legend('Energy Drain', 3, "Every creature within 30 feet must make a DC 19 Constitution save or have its hit point maximum reduced by 20.", {
          kind: 'save', save: { ability: 'con', dc: 19, onSuccess: 'negate' },
          target: { kind: 'sphere', radius: 30 },
          effects: [{ kind: 'condition', id: 'max-hp-drain' }],
          ai: { role: 'aoe', weight: 2.2 },
        }),
      ],
    },
    ai: { archetype: 'boss', aggression: 0.7, selfPreserve: 0.9, preferredRange: 30 },
    loot: { gold: '10d10*40', table: [['gem-diamond', 0.5], ['gem-ruby', 0.4], ['gem-emerald', 0.4], ['scroll-9', 0.2], ['ring-of-spell-turning', 0.08], ['tome-of-clear-thought', 0.1]] },
    sprite: 'demilich', biomes: ['crypt', 'dungeon', 'ruins'], groupSize: [1, 1],
    faction: 'undead', elite: true,
  }),

  mon('dracolich', 'Dracolich', {
    desc: "The Cult of the Dragon's masterwork: a dragon persuaded to die and keep flying. Its scales hang off a lattice of bone, its breath is old poison, and its soul is in a gem somewhere in Faerun.",
    cr: 17, type: 'undead', size: 'huge', ac: 19, acNote: 'natural armor',
    hpDice: '18d12+126', speed: 40, fly: 80, abilities: { str: 27, dex: 10, con: 25, int: 16, wis: 15, cha: 19 },
    saveProf: ['dex', 'con', 'wis', 'cha'], skills: { perception: 13, stealth: 5 },
    immune: ['necrotic', 'poison'], resist: ['bludgeoning-nonmagical', 'piercing-nonmagical', 'slashing-nonmagical'],
    condImmune: ['charmed', 'exhaustion', 'frightened', 'paralyzed', 'poisoned'],
    senses: { blindsight: 60, darkvision: 120 }, languages: ['Common', 'Draconic'],
    traits: [
      T_UNDEAD_NATURE,
      legendaryResistance(3),
      trait('Magic Resistance', "Spells slide off the dead scales; it has advantage on saves against magic.", { passive: 'magic-resistance', advSaveVs: ['spell'] }),
      trait('Rejuvenation', "While its phylactery gem survives, it re-forms in 1d10 days.", { passive: 'rejuvenation:phylactery' }),
    ],
    actions: [
      multi("It bites once and claws twice.", [['bite', 1], ['claw', 2]]),
      melee('Bite', 14, '2d10+8', 'piercing', { reach: 10, effects: [{ kind: 'damage', dice: '4d6', type: 'necrotic' }] }),
      melee('Claw', 14, '2d6+8', 'slashing'),
      melee('Tail', 14, '2d8+8', 'bludgeoning', { reach: 15 }),
      saveAct('Blighting Breath', {
        dice: '16d6', dtype: 'necrotic',
        save: { ability: 'con', dc: 21, onSuccess: 'half' },
        target: { kind: 'cone', length: 60 },
        uses: { max: 1, recharge: '5-6' },
        desc: "It exhales a 60-foot cone of grave-cold rot that kills grass for a season.",
        ai: { role: 'aoe', weight: 2.7 },
      }),
      saveAct('Frightful Presence', {
        range: 120, save: { ability: 'wis', dc: 18, onSuccess: 'negate' },
        target: { kind: 'sphere', radius: 120 },
        effects: [{ kind: 'condition', id: 'frightened', duration: '1 minute' }],
        desc: "A dead thing the size of a barn spreads its wings and screams.",
        ai: { role: 'debuff', weight: 1.8 },
      }),
    ],
    legendary: {
      count: 3, resist: 3,
      actions: [
        legend('Detect', 1, "It makes a Wisdom (Perception) check.", { kind: 'utility', target: { kind: 'self' }, ai: { role: 'utility', weight: 0.5 } }),
        legend('Tail Attack', 1, "It makes one tail attack.", { ref: 'tail', ai: { role: 'nuke', weight: 1.2 } }),
        legend('Wing Attack', 2, "It beats its wings: creatures within 15 feet take 2d6+8 bludgeoning and are knocked prone on a failed DC 22 Dexterity save.", {
          kind: 'save', dice: '2d6+8', dtype: 'bludgeoning',
          save: { ability: 'dex', dc: 22, onSuccess: 'negate' },
          target: { kind: 'sphere', radius: 15 },
          effects: [{ kind: 'condition', id: 'prone' }],
          ai: { role: 'aoe', weight: 1.7 },
        }),
      ],
    },
    ai: { archetype: 'boss', aggression: 0.85, selfPreserve: 0.5, preferredRange: 10 },
    loot: { gold: '10d10*30', table: [['gem-diamond', 0.3], ['gem-emerald', 0.3], ['dragon-cult-token', 0.4], ['scroll-7', 0.2], ['ring-of-resistance-necrotic', 0.1], ['dragonguard', 0.05]] },
    sprite: 'dragon', tint: '#4a4a3a', biomes: ['crypt', 'dungeon', 'ruins', 'mountain'], groupSize: [1, 1],
    faction: 'cult-dragon', elite: true,
  }),
);

// ===========================================================================
// ELEMENTALS AND GENIES — what comes through when a Netherese binding circle in Old
// Owl Well finally cracks, and what the Cult of the Dragon calls up on purpose.
// ===========================================================================

ALL.push(
  mon('air-elemental', 'Air Elemental', {
    desc: "A whirlwind with intent. It has no face to read and no ground to be knocked down onto, and it will happily carry you off the cliff it found you standing near.",
    cr: 5, type: 'elemental', size: 'large', ac: 15, hpDice: '12d10+24',
    speed: 0, fly: 90, hover: true, abilities: { str: 14, dex: 20, con: 14, int: 6, wis: 10, cha: 6 },
    resist: ['lightning', 'thunder', 'bludgeoning-nonmagical', 'piercing-nonmagical', 'slashing-nonmagical'],
    immune: ['poison'],
    condImmune: ['exhaustion', 'grappled', 'paralyzed', 'petrified', 'poisoned', 'prone', 'restrained', 'unconscious'],
    senses: { darkvision: 60 }, languages: ['Auran'],
    traits: [
      trait('Air Form', "It can enter a hostile creature's space and pass through any opening a breeze could.", { passive: 'air-form' }),
      trait('Elemental Nature', "It does not breathe, eat, drink or sleep.", { passive: 'elemental-nature' }),
    ],
    actions: [
      multi("It makes two slam attacks.", [['slam', 2]]),
      melee('Slam', 8, '2d8+5', 'bludgeoning'),
      saveAct('Whirlwind', {
        dice: '3d8+5', dtype: 'bludgeoning',
        save: { ability: 'str', dc: 13, onSuccess: 'negate' },
        target: { kind: 'sphere', radius: 10 },
        effects: [{ kind: 'condition', id: 'prone' }],
        uses: { max: 1, recharge: '4-6' },
        desc: "It becomes a spinning column; creatures in its space are flung 20 feet and knocked prone.",
        ai: { role: 'aoe', weight: 2 },
      }),
    ],
    ai: { archetype: 'skirmisher', aggression: 0.85, selfPreserve: 0.2, preferredRange: 5 },
    loot: { gold: '', table: [['elemental-gem-blue-sapphire', 0.05], ['gem-quartz', 0.15]] },
    sprite: 'elemental', tint: '#cfe4f2', biomes: ['mountain', 'plains', 'coast', 'ruins', 'dungeon'], groupSize: [1, 2],
  }),

  mon('earth-elemental', 'Earth Elemental', {
    desc: "It rises out of the floor as a walking heap of rock and iron ore, and the wall you were leaning on is suddenly a fist. Nothing about it is fast; nothing about it needs to be.",
    cr: 5, type: 'elemental', size: 'large', ac: 17, acNote: 'natural armor',
    hpDice: '12d10+60', speed: 30, burrow: 30, abilities: { str: 20, dex: 8, con: 20, int: 5, wis: 10, cha: 5 },
    vuln: ['thunder'],
    resist: ['bludgeoning-nonmagical', 'piercing-nonmagical', 'slashing-nonmagical'],
    immune: ['poison'],
    condImmune: ['exhaustion', 'paralyzed', 'petrified', 'poisoned', 'unconscious'],
    senses: { darkvision: 60, tremorsense: 60 }, languages: ['Terran'],
    traits: [
      trait('Earth Glide', "It swims through solid stone as easily as a fish through water, disturbing nothing.", { passive: 'earth-glide' }),
      T_SIEGE_MONSTER,
      trait('Elemental Nature', "It does not breathe, eat, drink or sleep.", { passive: 'elemental-nature' }),
    ],
    actions: [
      multi("It makes two slam attacks.", [['slam', 2]]),
      melee('Slam', 8, '2d8+5', 'bludgeoning', { reach: 10 }),
    ],
    ai: { archetype: 'tank', aggression: 0.8, selfPreserve: 0.15, preferredRange: 5 },
    loot: { gold: '', table: [['gem-onyx', 0.2], ['gem-malachite', 0.25], ['ore-sample-phandalin', 0.3]] },
    sprite: 'elemental', tint: '#7a6a52', biomes: ['cave', 'mountain', 'underdark', 'dungeon', 'mine'], groupSize: [1, 2],
  }),

  mon('fire-elemental', 'Fire Elemental', {
    desc: "A bonfire that has decided to walk. It leaves a burning footprint in stone, it is drawn to anything flammable, and it does not understand why you are running.",
    cr: 5, type: 'elemental', size: 'large', ac: 13, hpDice: '12d10+36',
    speed: 50, abilities: { str: 10, dex: 17, con: 16, int: 6, wis: 10, cha: 7 },
    resist: ['bludgeoning-nonmagical', 'piercing-nonmagical', 'slashing-nonmagical'],
    immune: ['fire', 'poison'],
    condImmune: ['exhaustion', 'grappled', 'paralyzed', 'petrified', 'poisoned', 'prone', 'restrained', 'unconscious'],
    senses: { darkvision: 60 }, languages: ['Ignan'],
    traits: [
      trait('Fire Form', "It can move through a space as narrow as an inch; anything it touches that can burn, burns.", { passive: 'fire-form' }),
      T_ILLUMINATION,
      T_WATER_SUSCEPT,
    ],
    actions: [
      multi("It makes two touch attacks.", [['touch', 2]]),
      melee('Touch', 6, '2d6+3', 'fire', { desc: "If the target is a creature or flammable object it also catches fire, taking 1d10 fire damage at the start of each of its turns." }),
    ],
    ai: { archetype: 'brute', aggression: 0.9, selfPreserve: 0.15, preferredRange: 5 },
    loot: { gold: '', table: [['elemental-gem-red-corundum', 0.05], ['gem-ruby', 0.06]] },
    sprite: 'elemental', tint: '#ff8a3a', biomes: ['ash-waste', 'cave', 'ruins', 'dungeon', 'mountain'], groupSize: [1, 2],
  }),

  mon('water-elemental', 'Water Elemental', {
    desc: "A wave that stood up. It engulfs a man whole and holds him under while it walks on, and the sea does not care how well he swims.",
    cr: 5, type: 'elemental', size: 'large', ac: 14, hpDice: '12d10+48',
    speed: 30, swim: 90, abilities: { str: 18, dex: 14, con: 18, int: 5, wis: 10, cha: 8 },
    resist: ['acid', 'bludgeoning-nonmagical', 'piercing-nonmagical', 'slashing-nonmagical'],
    immune: ['poison'],
    condImmune: ['exhaustion', 'grappled', 'paralyzed', 'petrified', 'poisoned', 'prone', 'restrained', 'unconscious'],
    senses: { darkvision: 60 }, languages: ['Aquan'],
    traits: [
      trait('Water Form', "It can enter a hostile creature's space and pass through any opening water could.", { passive: 'water-form' }),
      trait('Freeze', "Cold damage does not hurt it, but it stops moving until the ice breaks.", { passive: 'freeze' }),
    ],
    actions: [
      multi("It makes two slam attacks.", [['slam', 2]]),
      melee('Slam', 7, '2d8+4', 'bludgeoning'),
      saveAct('Whelm', {
        dice: '2d8+4', dtype: 'bludgeoning',
        save: { ability: 'str', dc: 15, onSuccess: 'negate' },
        target: { kind: 'sphere', radius: 5 },
        effects: [{ kind: 'condition', id: 'restrained', duration: 'until escaped' }],
        uses: { max: 1, recharge: '4-6' },
        desc: "It sweeps over its enemies; they are engulfed, restrained and unable to breathe.",
        ai: { role: 'control', weight: 2 },
      }),
    ],
    ai: { archetype: 'brute', aggression: 0.85, selfPreserve: 0.2, preferredRange: 5 },
    loot: { gold: '', table: [['gem-pearl', 0.15], ['potion-water-breathing', 0.08]] },
    sprite: 'elemental', tint: '#4a9ad0', biomes: ['coast', 'marsh', 'cave', 'dungeon'], groupSize: [1, 2],
  }),

  mon('water-weird', 'Water Weird', {
    desc: "A serpent of living water bound to a fountain or cistern by whoever built it, invisible until it strikes. Drop the wrong coin in the wrong well and it will pull you in after it.",
    cr: 3, type: 'elemental', size: 'large', ac: 13, hpDice: '10d10+20',
    speed: 0, swim: 60, abilities: { str: 17, dex: 16, con: 14, int: 11, wis: 10, cha: 10 },
    resist: ['fire', 'bludgeoning-nonmagical', 'piercing-nonmagical', 'slashing-nonmagical'],
    immune: ['poison'],
    condImmune: ['exhaustion', 'grappled', 'paralyzed', 'poisoned', 'prone', 'restrained', 'unconscious'],
    senses: { blindsight: 30, darkvision: 60 }, languages: ['Aquan (understands only)'],
    traits: [
      trait('Invisible in Water', "Submerged, it cannot be seen at all until it moves.", { passive: 'invisible-in-water' }),
      trait('Water Bound', "It dies if it leaves the water it was bound to, and it knows this.", { passive: 'water-bound' }),
    ],
    actions: [melee('Constrict', 5, '3d6+3', 'bludgeoning', {
      reach: 10,
      effects: [{ kind: 'condition', id: 'grappled', save: { ability: 'str', dc: 13 } }, { kind: 'condition', id: 'restrained', duration: 'until escaped' }],
      desc: "It coils and drags the target into the water, where it holds it under.",
    })],
    ai: { archetype: 'ambusher', aggression: 0.8, selfPreserve: 0.2, preferredRange: 10 },
    loot: { gold: '3d10', table: [['gem-pearl', 0.15], ['gem-quartz', 0.2], ['signet-ring', 0.1]] },
    sprite: 'water-weird', biomes: ['dungeon', 'cave', 'ruins', 'crypt', 'coast'], groupSize: [1, 2],
  }),

  mon('invisible-stalker', 'Invisible Stalker', {
    desc: "An air elemental bound to one command and resentful of every second of it. You will not see it; you will see the dust move, and the arrows in flight bend around nothing.",
    cr: 6, type: 'elemental', size: 'medium', ac: 14, hpDice: '16d8+32',
    speed: 50, fly: 50, hover: true, abilities: { str: 16, dex: 19, con: 14, int: 10, wis: 15, cha: 11 },
    skills: { perception: 8, stealth: 10 },
    resist: ['bludgeoning-nonmagical', 'piercing-nonmagical', 'slashing-nonmagical'],
    immune: ['poison'],
    condImmune: ['exhaustion', 'grappled', 'paralyzed', 'petrified', 'poisoned', 'prone', 'restrained', 'unconscious'],
    senses: { darkvision: 60 }, languages: ['Auran'],
    traits: [
      trait('Invisibility', "It is invisible at all times, even to darkvision; only truesight finds it.", { passive: 'invisible' }),
      trait('Faultless Tracker', "Given a quarry it knows the direction and distance to that creature until one of them is dead.", { passive: 'faultless-tracker' }),
    ],
    actions: [
      multi("It makes two slam attacks.", [['slam', 2]]),
      melee('Slam', 6, '2d6+3', 'bludgeoning'),
    ],
    ai: { archetype: 'ambusher', aggression: 0.9, selfPreserve: 0.3, preferredRange: 5 },
    loot: { gold: '', table: [['dust-of-disappearance', 0.05], ['gem-quartz', 0.1]] },
    sprite: 'stalker', biomes: ['plains', 'city', 'dungeon', 'mountain', 'ruins'], groupSize: [1, 1],
  }),

  mon('salamander', 'Salamander', {
    desc: "A serpent-bodied smith out of the Elemental Plane of Fire, coiled around an anvil that would cook a man at ten paces. Its spear is red-hot and so is everything it touches.",
    cr: 5, type: 'elemental', size: 'large', ac: 15, acNote: 'natural armor',
    hpDice: '15d10+8', speed: 30, abilities: { str: 18, dex: 14, con: 15, int: 11, wis: 10, cha: 12 },
    vuln: ['cold'], immune: ['fire'],
    resist: ['bludgeoning-nonmagical', 'piercing-nonmagical', 'slashing-nonmagical'],
    senses: { darkvision: 60 }, languages: ['Ignan'],
    traits: [T_HEATED_BODY, T_HEATED_WEAPONS],
    actions: [
      multi("It attacks with its spear and constricts with its tail.", [['spear', 1], ['tail', 1]]),
      melee('Spear', 7, '1d6+4', 'piercing', { reach: 5, effects: [{ kind: 'damage', dice: '1d6', type: 'fire' }] }),
      melee('Tail', 7, '2d6+4', 'bludgeoning', {
        reach: 10,
        effects: [{ kind: 'damage', dice: '2d6', type: 'fire' }, { kind: 'condition', id: 'grappled', save: { ability: 'str', dc: 14 } }],
        desc: "It wraps its burning coils around the target, grappling and restraining it.",
      }),
    ],
    ai: { archetype: 'brute', aggression: 0.85, selfPreserve: 0.3, preferredRange: 10 },
    loot: { gold: '5d10*2', table: [['spear', 0.25], ['smiths-tools', 0.15], ['gem-ruby', 0.1], ['flame-tongue', 0.03], ['ring-of-resistance-fire', 0.04]] },
    sprite: 'salamander', biomes: ['ash-waste', 'cave', 'mountain', 'dungeon'], groupSize: [1, 3],
  }),

  mon('efreeti', 'Efreeti', {
    desc: "A lord of the City of Brass in cloth-of-gold, twenty feet tall and utterly certain of its own superiority. It will grant a wish, and the wish will be granted exactly as worded.",
    cr: 11, type: 'elemental', subtype: 'genie', size: 'large', ac: 17, acNote: 'natural armor',
    hpDice: '16d10+112', speed: 40, fly: 60, abilities: { str: 22, dex: 12, con: 24, int: 16, wis: 15, cha: 16 },
    saveProf: ['int', 'wis', 'cha'], immune: ['fire'],
    senses: { darkvision: 120 }, languages: ['Ignan', 'Common'],
    traits: [
      trait('Elemental Demise', "Killed, it collapses into a cloud of hot ash, leaving its gear behind.", { passive: 'elemental-demise' }),
      trait('Innate Spellcasting', "Detect magic and elemental form at will; enlarge/reduce, tongues, gaseous form, invisibility, major image, plane shift and wall of fire on command, with spell save DC 15.", { passive: 'innate-casting:cha:15' }),
    ],
    actions: [
      multi("It makes two scimitar attacks, or hurls two flames.", [['scimitar', 2]]),
      melee('Scimitar', 10, '2d6+6', 'slashing', { effects: [{ kind: 'damage', dice: '2d6', type: 'fire' }] }),
      ranged('Hurl Flame', 7, '5d6', 'fire', [120, 120], { ai: { role: 'nuke', weight: 1.4 } }),
      saveAct('Wall of Fire', {
        range: 120, dice: '5d8', dtype: 'fire',
        save: { ability: 'dex', dc: 15, onSuccess: 'half' },
        target: { kind: 'wall', length: 60, width: 5 },
        uses: { max: 1, recharge: 'long' },
        desc: "A sheet of roaring flame rises across the battlefield at its word.",
        ai: { role: 'aoe', weight: 2.2 },
      }),
    ],
    ai: { archetype: 'caster', aggression: 0.75, selfPreserve: 0.6, preferredRange: 30 },
    loot: { gold: '10d10*10', table: [['scimitar', 0.3], ['gem-ruby', 0.3], ['gem-diamond', 0.1], ['efreeti-bottle', 0.04], ['ring-of-resistance-fire', 0.1], ['clothes-fine', 0.4]] },
    sprite: 'genie', tint: '#d4482a', biomes: ['ash-waste', 'ruins', 'dungeon', 'mountain'], groupSize: [1, 1],
    elite: true,
  }),

  mon('djinni', 'Djinni', {
    desc: "A noble of the Elemental Plane of Air, blue-skinned and edged in cloud, who considers a rude question a debt and a courtesy a contract. It builds palaces out of weather.",
    cr: 11, type: 'elemental', subtype: 'genie', size: 'large', ac: 17, acNote: 'natural armor',
    hpDice: '16d10+80', speed: 30, fly: 90, abilities: { str: 21, dex: 15, con: 22, int: 15, wis: 16, cha: 20 },
    saveProf: ['dex', 'wis', 'cha'], immune: ['lightning', 'thunder'],
    senses: { darkvision: 120 }, languages: ['Auran', 'Common'],
    traits: [
      trait('Elemental Demise', "Killed, it disperses into a gust of warm wind, leaving its gear behind.", { passive: 'elemental-demise' }),
      trait('Innate Spellcasting', "Detect evil and good, detect magic and thunderwave at will; create food and water, tongues, wind walk, creation, gaseous form, invisibility, major image and plane shift on command, with spell save DC 17.", { passive: 'innate-casting:cha:17' }),
    ],
    actions: [
      multi("It makes three scimitar attacks.", [['scimitar', 3]]),
      melee('Scimitar', 9, '2d6+5', 'slashing', { effects: [{ kind: 'damage', dice: '3d6', type: 'lightning' }] }),
      saveAct('Create Whirlwind', {
        range: 120, dice: '3d8', dtype: 'bludgeoning',
        save: { ability: 'str', dc: 18, onSuccess: 'negate' },
        target: { kind: 'sphere', radius: 5 },
        effects: [{ kind: 'condition', id: 'restrained', duration: '1 minute' }],
        uses: { max: 1, recharge: 'short' },
        desc: "A 30-foot column of screaming wind rises where it points and carries away whatever it catches.",
        ai: { role: 'control', weight: 2 },
      }),
    ],
    ai: { archetype: 'caster', aggression: 0.7, selfPreserve: 0.6, preferredRange: 30 },
    loot: { gold: '10d10*10', table: [['scimitar', 0.3], ['gem-emerald', 0.25], ['ring-of-djinni-summoning', 0.02], ['wind-fan', 0.08], ['carpet-of-flying', 0.03], ['clothes-fine', 0.4]] },
    sprite: 'genie', tint: '#3a8ad4', biomes: ['plains', 'mountain', 'coast', 'ruins'], groupSize: [1, 1],
    elite: true,
  }),

  mon('xorn', 'Xorn', {
    desc: "Three arms, three eyes, one huge mouth on top of its head, and an appetite strictly for precious metals. It swims through stone and it will politely ask whether you are carrying any gold before it takes it.",
    cr: 5, type: 'elemental', size: 'medium', ac: 19, acNote: 'natural armor',
    hpDice: '10d8+30', speed: 20, burrow: 20, abilities: { str: 17, dex: 10, con: 22, int: 11, wis: 10, cha: 11 },
    skills: { perception: 6, stealth: 3 },
    resist: ['piercing-nonmagical', 'slashing-nonmagical'],
    senses: { darkvision: 60, tremorsense: 60 }, languages: ['Terran'],
    traits: [
      trait('Earth Glide', "It burrows through rock without disturbing it, leaving no tunnel.", { passive: 'earth-glide' }),
      trait('Stone Camouflage', "Pressed against a cave wall it is only another lump of rock.", { passive: 'stone-camouflage', skillProf: ['stealth'] }),
      trait('Treasure Sense', "It smells precious metals and gems within 60 feet, through stone.", { passive: 'treasure-sense:60' }),
    ],
    actions: [
      multi("It makes three claw attacks and one bite.", [['claw', 3], ['bite', 1]]),
      melee('Claw', 6, '1d6+3', 'slashing'),
      melee('Bite', 6, '3d6+3', 'piercing'),
    ],
    ai: { archetype: 'brute', aggression: 0.6, selfPreserve: 0.6, preferredRange: 5 },
    loot: { gold: '6d10*3', table: [['gem-diamond', 0.06], ['gem-ruby', 0.12], ['gem-emerald', 0.12], ['platinum-ingot', 0.15], ['ore-sample-phandalin', 0.25]] },
    sprite: 'xorn', biomes: ['cave', 'underdark', 'mine', 'mountain', 'dungeon'], groupSize: [1, 2],
  }),
);

// ===========================================================================
// CONSTRUCTS, PLANTS AND THE OLD POWERS OF THE WOOD — the Forge of Spells' leftovers,
// Halaster's watchmen, and what walks in Neverwinter Wood when it is angered.
// ===========================================================================

ALL.push(
  mon('helmed-horror', 'Helmed Horror', {
    desc: "An empty suit of plate that has never had anyone inside it, floating an inch off the floor with a sword in each gauntlet. Whatever spells it was made proof against, you were about to cast.",
    cr: 4, type: 'construct', size: 'medium', ac: 20, acNote: 'plate armor',
    hpDice: '7d8+28', speed: 30, fly: 30, hover: true,
    abilities: { str: 18, dex: 13, con: 16, int: 10, wis: 10, cha: 10 },
    immune: ['force', 'necrotic', 'poison'],
    condImmune: ['blinded', 'charmed', 'deafened', 'frightened', 'paralyzed', 'petrified', 'poisoned', 'stunned'],
    senses: { blindsight: 60 }, languages: ['the languages of its creator (understands only)'],
    traits: [
      T_CONSTRUCT_NATURE,
      T_MAGIC_RESIST,
      trait('Spell Immunity', "Its maker chose three spells it simply ignores; fireball, lightning bolt and hold person are the usual choices.", { passive: 'spell-immunity:3' }),
    ],
    actions: [
      multi("It makes two longsword attacks.", [['longsword', 2]]),
      melee('Longsword', 6, '1d8+4', 'slashing', { desc: "Two-handed, 1d10+4 slashing." }),
    ],
    ai: { archetype: 'tank', aggression: 0.8, selfPreserve: 0, preferredRange: 5 },
    loot: { gold: '', table: [['longsword', 0.3], ['plate-armor', 0.1], ['gem-onyx', 0.1]] },
    sprite: 'helmed-horror', biomes: ['dungeon', 'ruins', 'crypt', 'city'], groupSize: [1, 3],
    faction: 'construct',
  }),

  mon('flesh-golem', 'Flesh Golem', {
    desc: "A patchwork of corpses stitched by someone who read too much and slept too little. It fears fire, it is calmed by lightning, and every so often the mismatched pieces remember they were people.",
    cr: 5, type: 'construct', size: 'medium', ac: 9, hpDice: '11d8+44',
    speed: 30, abilities: { str: 19, dex: 9, con: 18, int: 6, wis: 10, cha: 5 },
    immune: ['lightning', 'poison', 'bludgeoning-nonmagical', 'piercing-nonmagical', 'slashing-nonmagical'],
    condImmune: ['charmed', 'exhaustion', 'frightened', 'paralyzed', 'petrified', 'poisoned'],
    senses: { darkvision: 60 }, languages: ['the languages of its creator (understands only)'],
    traits: [
      T_CONSTRUCT_NATURE,
      T_LIGHTNING_ABSORB,
      trait('Berserk', "Below half its hit points it may go berserk on any turn and attack the nearest thing, creator included.", { passive: 'berserk:50' }),
      trait('Aversion to Fire', "If it takes fire damage it has disadvantage on attacks and checks until the end of its next turn.", { passive: 'aversion:fire' }),
      T_MAGIC_RESIST,
    ],
    actions: [
      multi("It makes two slam attacks.", [['slam', 2]]),
      melee('Slam', 7, '2d8+4', 'bludgeoning'),
    ],
    ai: { archetype: 'brute', aggression: 0.85, selfPreserve: 0, preferredRange: 5 },
    loot: { gold: '2d10', table: [['gem-quartz', 0.1], ['healers-kit', 0.15]] },
    sprite: 'golem', tint: '#8a9a7a', biomes: ['dungeon', 'crypt', 'ruins', 'city'], groupSize: [1, 2],
    faction: 'construct',
  }),

  mon('clay-golem', 'Clay Golem', {
    desc: "A crude figure of river clay animated by a priest's rite, with a wound that will not close written into every blow it lands. When it goes berserk the rite does not stop it.",
    cr: 9, type: 'construct', size: 'large', ac: 14, acNote: 'natural armor',
    hpDice: '14d10+56', speed: 20, abilities: { str: 20, dex: 9, con: 18, int: 3, wis: 8, cha: 1 },
    immune: ['acid', 'poison', 'psychic', 'bludgeoning-nonmagical', 'piercing-nonmagical', 'slashing-nonmagical'],
    condImmune: GOLEM_COND,
    senses: { darkvision: 60 }, languages: ['the languages of its creator (understands only)'],
    traits: [
      T_CONSTRUCT_NATURE,
      trait('Acid Absorption', "Acid damage instead heals it.", { passive: 'absorb:acid' }),
      trait('Berserk', "At half hit points or fewer it may go berserk and attack whatever is nearest.", { passive: 'berserk:50' }),
      T_MAGIC_RESIST,
      trait('Immutable Form', "No spell or effect can alter its shape.", { passive: 'immutable-form' }),
    ],
    actions: [
      multi("It makes two slam attacks.", [['slam', 2]]),
      melee('Slam', 9, '2d10+5', 'bludgeoning', {
        effects: [{ kind: 'condition', id: 'max-hp-drain', duration: 'until magically healed' }],
        desc: "The wound refuses to close: the target's hit point maximum drops by the damage dealt until it receives magical healing.",
      }),
      util('Haste', {
        uses: { max: 1, recharge: 'long' },
        desc: "Until the end of its next turn it gains 2 AC, doubles its speed and makes one extra slam attack.",
        effects: [{ kind: 'buff', id: 'haste', duration: '1 round' }],
        ai: { role: 'buff', weight: 1.8 },
      }),
    ],
    ai: { archetype: 'brute', aggression: 0.9, selfPreserve: 0, preferredRange: 5 },
    loot: { gold: '', table: [['gem-malachite', 0.2], ['holy-symbol', 0.1]] },
    sprite: 'golem', tint: '#b08a5a', biomes: ['dungeon', 'ruins', 'crypt', 'city'], groupSize: [1, 1],
    faction: 'construct',
  }),

  mon('stone-golem', 'Stone Golem', {
    desc: "A ten-foot statue in archaic Netherese armour that steps down off its plinth when the wrong door opens. Its gaze slows time around a man until he is walking through honey.",
    cr: 10, type: 'construct', size: 'large', ac: 17, acNote: 'natural armor',
    hpDice: '17d10+85', speed: 30, abilities: { str: 22, dex: 9, con: 20, int: 3, wis: 11, cha: 1 },
    immune: GOLEM_IMMUNE, condImmune: GOLEM_COND,
    senses: { darkvision: 120 }, languages: ['the languages of its creator (understands only)'],
    traits: [
      T_CONSTRUCT_NATURE,
      T_MAGIC_RESIST,
      trait('Immutable Form', "No spell or effect can alter its shape.", { passive: 'immutable-form' }),
    ],
    actions: [
      multi("It makes two slam attacks.", [['slam', 2]]),
      melee('Slam', 10, '3d8+6', 'bludgeoning'),
      saveAct('Slow', {
        range: 10, save: { ability: 'wis', dc: 17, onSuccess: 'negate' },
        target: { kind: 'sphere', radius: 10 },
        effects: [{ kind: 'condition', id: 'slowed', duration: '1 minute' }],
        uses: { max: 1, recharge: '5-6' },
        desc: "Its carved eyes fix on you and the world speeds up around you.",
        ai: { role: 'debuff', weight: 2 },
      }),
    ],
    ai: { archetype: 'tank', aggression: 0.85, selfPreserve: 0, preferredRange: 5 },
    loot: { gold: '', table: [['gem-onyx', 0.25], ['gem-moonstone', 0.15], ['platinum-ingot', 0.1]] },
    sprite: 'golem', tint: '#9a9a9a', biomes: ['dungeon', 'ruins', 'crypt', 'underdark'], groupSize: [1, 1],
    faction: 'construct',
  }),

  mon('iron-golem', 'Iron Golem', {
    desc: "Five tons of black iron with a furnace in its chest and a sword the length of a wagon tongue. Halaster keeps several; they do not rust, they do not tire, and they do not stop.",
    cr: 16, type: 'construct', size: 'large', ac: 20, acNote: 'natural armor',
    hpDice: '20d10+100', speed: 30, abilities: { str: 24, dex: 9, con: 20, int: 3, wis: 11, cha: 1 },
    immune: ['fire', 'poison', 'psychic', 'bludgeoning-nonmagical', 'piercing-nonmagical', 'slashing-nonmagical'],
    condImmune: GOLEM_COND,
    senses: { darkvision: 120 }, languages: ['the languages of its creator (understands only)'],
    traits: [
      T_CONSTRUCT_NATURE,
      T_FIRE_ABSORB,
      T_MAGIC_RESIST,
      trait('Immutable Form', "No spell or effect can alter its shape.", { passive: 'immutable-form' }),
    ],
    actions: [
      multi("It makes two attacks: one slam and one sword.", [['slam', 1], ['sword', 1]]),
      melee('Slam', 13, '3d8+7', 'bludgeoning'),
      melee('Sword', 13, '3d10+7', 'slashing', { reach: 10 }),
      saveAct('Poison Breath', {
        dice: '10d8', dtype: 'poison',
        save: { ability: 'con', dc: 19, onSuccess: 'half' },
        target: { kind: 'cone', length: 15 },
        uses: { max: 1, recharge: '5-6' },
        desc: "The furnace vents a 15-foot cone of poison gas.",
        ai: { role: 'aoe', weight: 2.3 },
      }),
    ],
    ai: { archetype: 'tank', aggression: 0.9, selfPreserve: 0, preferredRange: 10 },
    loot: { gold: '', table: [['platinum-ingot', 0.3], ['gem-diamond', 0.1], ['smiths-tools', 0.2], ['dwarven-plate', 0.02]] },
    sprite: 'golem', tint: '#4a4a52', biomes: ['dungeon', 'ruins', 'crypt', 'city'], groupSize: [1, 1],
    faction: 'construct', elite: true,
  }),

  mon('shield-guardian', 'Shield Guardian', {
    desc: "Bound to an amulet and, through it, to a wizard. It takes the wounds meant for its master, stores one spell for later, and follows the amulet across a continent if it must.",
    cr: 7, type: 'construct', size: 'large', ac: 17, acNote: 'natural armor',
    hpDice: '15d10+60', speed: 30, abilities: { str: 18, dex: 8, con: 18, int: 7, wis: 10, cha: 3 },
    immune: ['poison'], condImmune: ['charmed', 'exhaustion', 'frightened', 'paralyzed', 'poisoned'],
    senses: { blindsight: 10, darkvision: 60 }, languages: ['the languages of its creator (understands only)'],
    traits: [
      T_CONSTRUCT_NATURE,
      trait('Bound', "It is bound to an amulet; while its master wears it, the guardian knows the way and shares the damage.", { passive: 'bound-amulet' }),
      trait('Regeneration', "It regains 10 hit points at the start of its turn as long as it has at least 1.", { passive: 'regeneration:10:none' }),
      trait('Spell Storing', "A spell of 4th level or lower can be stored inside it and cast on command.", { passive: 'spell-storing:4' }),
    ],
    actions: [
      multi("It makes two fist attacks.", [['fist', 2]]),
      melee('Fist', 7, '2d6+4', 'bludgeoning'),
    ],
    reactions: [util('Shield', { desc: "It grants its master +2 AC against one attack it can see.", ai: { role: 'support', weight: 1.4 } })],
    ai: { archetype: 'tank', aggression: 0.6, selfPreserve: 0, preferredRange: 5 },
    loot: { gold: '', table: [['amulet-of-proof-against-detection', 0.06], ['gem-onyx', 0.15], ['scroll-4', 0.1]] },
    sprite: 'golem', tint: '#6a7a8a', biomes: ['dungeon', 'city', 'ruins', 'crypt'], groupSize: [1, 1],
    faction: 'construct',
  }),

  mon('shambling-mound', 'Shambling Mound', {
    desc: "A heap of rotting vine and creeper that stood up in the Mere of Dead Men and started walking. Lightning only makes it bigger, and it engulfs a struggling man the way a compost heap takes a leaf.",
    cr: 5, type: 'plant', size: 'large', ac: 15, acNote: 'natural armor',
    hpDice: '16d10+48', speed: 20, swim: 20, abilities: { str: 18, dex: 8, con: 16, int: 5, wis: 10, cha: 5 },
    skills: { stealth: 2 }, resist: ['cold', 'fire'], immune: ['lightning'],
    condImmune: ['blinded', 'deafened', 'exhaustion'],
    senses: { blindsight: 60 }, languages: [],
    traits: [
      T_LIGHTNING_ABSORB,
      trait('Blind Beyond Blindsight', "It has no eyes and does not miss them.", { passive: 'blind-beyond-blindsight' }),
    ],
    actions: [
      multi("It makes two slam attacks; if both hit a Medium or smaller creature, it engulfs.", [['slam', 2]]),
      melee('Slam', 7, '2d8+4', 'bludgeoning'),
      saveAct('Engulf', {
        save: { ability: 'str', dc: 14, onSuccess: 'negate' },
        dice: '2d8+4', dtype: 'bludgeoning',
        effects: [{ kind: 'condition', id: 'restrained', duration: 'until escaped' }, { kind: 'condition', id: 'blinded', duration: 'until escaped' }],
        desc: "It folds a creature into itself; the victim is blinded, restrained and cannot breathe.",
        ai: { role: 'control', weight: 1.8 },
      }),
    ],
    ai: { archetype: 'ambusher', aggression: 0.8, selfPreserve: 0.2, preferredRange: 5 },
    loot: { gold: '3d10', table: [['gem-malachite', 0.15], ['herbalism-kit', 0.12], ['goodberry-preserve', 0.15]] },
    sprite: 'shambling-mound', biomes: ['marsh', 'forest', 'coast', 'cave'], groupSize: [1, 2],
  }),

  mon('treant', 'Treant', {
    desc: "An oak that woke up angry two hundred years ago and has been walking east ever since. Neverwinter Wood sends them when loggers get greedy, and no axe made has yet impressed one.",
    cr: 9, type: 'plant', size: 'huge', ac: 16, acNote: 'natural armor',
    hpDice: '12d12+60', speed: 30, abilities: { str: 23, dex: 8, con: 21, int: 12, wis: 16, cha: 12 },
    vuln: ['fire'], resist: ['bludgeoning', 'piercing'],
    senses: {}, languages: ['Common', 'Druidic', 'Elvish', 'Sylvan'],
    traits: [
      trait('False Appearance', "Standing still, it is indistinguishable from an ordinary tree.", { passive: 'false-appearance' }),
      trait('Siege Monster', "It deals double damage to objects and structures.", { passive: 'siege-monster' }),
    ],
    actions: [
      multi("It makes two slam attacks.", [['slam', 2]]),
      melee('Slam', 10, '3d6+6', 'bludgeoning'),
      ranged('Rock', 10, '4d10+6', 'bludgeoning', [60, 180]),
      util('Animate Trees', {
        uses: { max: 1, recharge: 'long' },
        desc: "It wakes one or two trees within 60 feet, which pull up their roots and fight alongside it.",
        effects: [{ kind: 'summon', monsterId: 'treant', count: 1 }],
        ai: { role: 'utility', weight: 1.8 },
      }),
    ],
    ai: { archetype: 'tank', aggression: 0.6, selfPreserve: 0.4, preferredRange: 10 },
    loot: { gold: '', table: [['gem-amber', 0.25], ['goodberry-preserve', 0.3], ['staff-of-the-woodlands', 0.03], ['druidic-focus', 0.15]] },
    sprite: 'treant', biomes: ['forest', 'pine-forest', 'marsh'], groupSize: [1, 2],
    faction: 'emerald-enclave',
  }),

  mon('unicorn', 'Unicorn', {
    desc: "A celestial guardian of one particular wood, silver-hoofed and utterly uninterested in your opinion of it. Mielikki's own; it heals with a touch and it gores oath-breakers without hesitation.",
    cr: 5, type: 'celestial', size: 'large', ac: 12, hpDice: '8d10+24',
    speed: 50, abilities: { str: 18, dex: 14, con: 15, int: 11, wis: 17, cha: 16 },
    immune: ['poison'], condImmune: ['charmed', 'paralyzed', 'poisoned'],
    senses: { darkvision: 60 }, languages: ['Celestial', 'Elvish', 'Sylvan', 'telepathy 60'],
    traits: [
      T_MAGIC_RESIST,
      T_MAGIC_WEAPONS,
      trait('Charge', "If it moves 20 feet straight at a target and hits with its horn, the hit carries an extra 2d8 damage.", { passive: 'charge:20:2d8' }),
      trait('Innate Spellcasting', "Detect evil and good, druidcraft and pass without trace at will; calm emotions, dispel evil and good, entangle and word of recall once a day each.", { passive: 'innate-casting:cha:14' }),
    ],
    actions: [
      multi("It attacks once with its hooves and once with its horn.", [['hooves', 1], ['horn', 1]]),
      melee('Hooves', 7, '2d6+4', 'bludgeoning'),
      melee('Horn', 7, '1d8+4', 'piercing'),
      util('Healing Touch', {
        kind: 'heal', dice: '5d8',
        uses: { max: 3, recharge: 'long' },
        target: { kind: 'creature', count: 1, allowAllies: true },
        desc: "It touches a creature with its horn, healing it and lifting one disease or curse.",
        ai: { role: 'heal', weight: 2.2 },
      }),
      saveAct('Shimmering Shield', {
        target: { kind: 'creature', count: 1, allowAllies: true },
        uses: { max: 1, recharge: 'long' },
        effects: [{ kind: 'shield', ac: 2 }, { kind: 'temphp', dice: '10' }],
        desc: "A shield of light surrounds an ally, granting 10 temporary hit points and +2 AC.",
        ai: { role: 'buff', weight: 1.6 },
      }),
    ],
    legendary: {
      count: 3, resist: 0,
      actions: [
        legend('Hooves', 1, "It makes one hooves attack.", { ref: 'hooves', ai: { role: 'nuke', weight: 1 } }),
        legend('Shimmering Shield', 2, "It shields itself or an ally with light.", { ref: 'shimmering-shield', ai: { role: 'buff', weight: 1.2 } }),
        legend('Heal Self', 3, "It magically regains 11 hit points.", { kind: 'heal', dice: '11', target: { kind: 'self' }, ai: { role: 'heal', weight: 1.5 } }),
      ],
    },
    ai: { archetype: 'support', aggression: 0.5, selfPreserve: 0.5, preferredRange: 5 },
    loot: { gold: '', table: [['gem-diamond', 0.05], ['gem-moonstone', 0.2], ['potion-vitality', 0.08]] },
    sprite: 'unicorn', biomes: ['forest', 'pine-forest', 'plains'], groupSize: [1, 1],
    faction: 'emerald-enclave',
  }),

  mon('couatl', 'Couatl', {
    desc: "A feathered serpent of rainbow plumage, older than most kingdoms and sworn to guard something you have probably just walked past. It reads your mind before it decides whether to speak.",
    cr: 4, type: 'celestial', size: 'medium', ac: 19, acNote: 'natural armor',
    hpDice: '13d8+13', speed: 30, fly: 90, abilities: { str: 16, dex: 20, con: 17, int: 18, wis: 20, cha: 18 },
    saveProf: ['con', 'wis', 'cha'],
    resist: ['radiant', 'bludgeoning-nonmagical', 'piercing-nonmagical', 'slashing-nonmagical'],
    immune: ['psychic'],
    senses: { truesight: 120 }, languages: ['all, telepathy 120'],
    traits: [
      T_MAGIC_WEAPONS,
      trait('Shielded Mind', "Its thoughts cannot be read, its emotions cannot be sensed, and it cannot be scried on.", { passive: 'shielded-mind' }),
      trait('Innate Spellcasting', "Detect evil and good, detect magic and detect thoughts at will; bless, create food and water, cure wounds, lesser restoration, protection from poison, sanctuary, shield and dream once a day each.", { passive: 'innate-casting:cha:14' }),
    ],
    actions: [
      melee('Bite', 8, '1d6+5', 'piercing', {
        save: { ability: 'con', dc: 13, onSuccess: 'negate' },
        effects: [{ kind: 'damage', dice: '3d6', type: 'poison' }, { kind: 'condition', id: 'poisoned', duration: '24 hours' }],
        desc: "DC 13 Constitution save or be poisoned for 24 hours, and unconscious while poisoned this way.",
      }),
      melee('Constrict', 8, '2d6+5', 'bludgeoning', {
        effects: [{ kind: 'condition', id: 'restrained', save: { ability: 'str', dc: 15 } }],
        ai: { role: 'control', weight: 1.4 },
      }),
      util('Change Shape', {
        desc: "It takes the shape of any humanoid or beast it has seen, keeping its own mind and statistics.",
        ai: { role: 'utility', weight: 0.8 },
      }),
    ],
    ai: { archetype: 'support', aggression: 0.5, selfPreserve: 0.6, preferredRange: 20 },
    loot: { gold: '3d10*5', table: [['gem-emerald', 0.12], ['gem-pearl', 0.15], ['scroll-3', 0.15], ['potion-vitality', 0.05]] },
    sprite: 'couatl', biomes: ['forest', 'ruins', 'plains', 'coast'], groupSize: [1, 1],
  }),

  mon('oni', 'Oni', {
    desc: "A blue-skinned ogre-mage with a taste for infants and a talent for looking like somebody's uncle. It comes to the window as mist, and it takes something small away with it.",
    cr: 7, type: 'fiend', subtype: 'ogre', size: 'large', ac: 16, acNote: 'chain mail',
    hpDice: '13d10+40', speed: 30, fly: 30, abilities: { str: 19, dex: 11, con: 16, int: 14, wis: 12, cha: 15 },
    saveProf: ['dex', 'con', 'wis', 'cha'], skills: { arcana: 5, deception: 8, perception: 4 },
    senses: { darkvision: 60 }, languages: ['Common', 'Giant'],
    traits: [
      trait('Innate Spellcasting', "Darkness, invisibility, charm person, cone of cold, gaseous form and sleep, with spell save DC 13.", { passive: 'innate-casting:cha:13' }),
      trait('Magic Weapons', "Its glaive counts as magical.", { passive: 'magic-weapons' }),
      trait('Regeneration', "It regains 10 hit points at the start of its turn unless it took fire damage.", { passive: 'regeneration:10:fire' }),
    ],
    actions: [
      multi("It makes two glaive attacks or two claw attacks.", [['glaive', 2]]),
      melee('Claw', 7, '2d8+4', 'slashing', { desc: "In its true form only." }),
      melee('Glaive', 7, '2d10+4', 'slashing', { reach: 10, effects: [{ kind: 'damage', dice: '2d8', type: 'necrotic' }] }),
      saveAct('Cone of Cold', {
        dice: '8d8', dtype: 'cold',
        save: { ability: 'con', dc: 13, onSuccess: 'half' },
        target: { kind: 'cone', length: 60 },
        uses: { max: 1, recharge: 'long' },
        desc: "It breathes out a 60-foot cone of killing frost.",
        ai: { role: 'aoe', weight: 2.3 },
      }),
      util('Change Shape', {
        desc: "It takes the form of a Small or Medium humanoid, or a Large giant, keeping its statistics.",
        ai: { role: 'utility', weight: 1 },
      }),
    ],
    ai: { archetype: 'caster', aggression: 0.75, selfPreserve: 0.6, preferredRange: 10 },
    loot: { gold: '6d10*5', table: [['glaive', 0.25], ['chain-mail', 0.15], ['gem-jade', 0.2], ['potion-invisibility', 0.15], ['scroll-4', 0.12], ['cape-of-the-mountebank', 0.04]] },
    sprite: 'oni', biomes: ['forest', 'hills', 'mountain', 'ruins', 'city'], groupSize: [1, 1],
  }),
);

// ===========================================================================
// FIENDS — the Nine Hells' contract enforcers and the Abyss's screaming tide. Both
// come through the same cracked Netherese circles under Old Owl Well and Undermountain.
// ===========================================================================

ALL.push(
  mon('quasit', 'Quasit', {
    desc: "A knee-high demon of bat wings and spite, kept as a familiar by warlocks who should know better. It shapechanges into a toad or a centipede, and it lies as easily as it breathes.",
    cr: 1, type: 'fiend', subtype: 'demon', size: 'tiny', ac: 13, hpDice: '7d4+7',
    speed: 40, abilities: { str: 5, dex: 17, con: 12, int: 7, wis: 10, cha: 10 },
    saveProf: ['dex'], skills: { stealth: 5 },
    resist: ['cold', 'fire', 'lightning', 'bludgeoning-nonmagical', 'piercing-nonmagical', 'slashing-nonmagical'],
    immune: ['poison'], condImmune: ['poisoned'],
    senses: { darkvision: 120 }, languages: ['Abyssal', 'Common'],
    traits: [
      T_MAGIC_RESIST,
      trait('Shapechanger', "It becomes a bat, a centipede or a toad, and back again, as an action.", { passive: 'shapechanger' }),
      trait('Variant Familiar', "Bound to a master, it can turn invisible at will and report everything it sees.", { passive: 'familiar' }),
    ],
    actions: [
      melee('Claws', 4, '1d4+3', 'piercing', {
        save: { ability: 'con', dc: 10, onSuccess: 'half' },
        effects: [{ kind: 'damage', dice: '2d4', type: 'poison' }, { kind: 'condition', id: 'poisoned', duration: '1 minute' }],
        desc: "In its true form: DC 10 Constitution save or take 5 (2d4) poison damage and be poisoned for a minute.",
      }),
      saveAct('Scare', {
        range: 20, save: { ability: 'wis', dc: 10, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'frightened', duration: '1 minute' }],
        uses: { max: 1, recharge: 'short' },
        desc: "It whispers something true and terrible; the target is frightened for a minute.",
        ai: { role: 'debuff', weight: 1.3 },
      }),
      util('Invisibility', { desc: "It turns invisible until it attacks or uses Scare.", effects: [{ kind: 'buff', id: 'invisible' }], ai: { role: 'buff', weight: 1.2 } }),
    ],
    ai: { archetype: 'skirmisher', aggression: 0.6, selfPreserve: 0.8, preferredRange: 5 },
    loot: { gold: '2d10', table: [['gem-onyx', 0.1], ['scroll-1', 0.1]] },
    sprite: 'quasit', biomes: ['dungeon', 'underdark', 'ruins', 'city'], groupSize: [1, 3],
    faction: 'demon',
  }),

  mon('succubus', 'Succubus', {
    desc: "It wears whatever face you most want to see and keeps that face until the kiss. What it wants is not your body but the slow, voluntary ruin of everything you are.",
    cr: 4, type: 'fiend', subtype: 'shapechanger', size: 'medium', ac: 15, acNote: 'natural armor',
    hpDice: '12d8+12', speed: 30, fly: 60, abilities: { str: 8, dex: 17, con: 13, int: 15, wis: 12, cha: 20 },
    skills: { deception: 9, insight: 5, perception: 5, persuasion: 9, stealth: 7 },
    resist: ['cold', 'fire', 'lightning', 'poison', 'bludgeoning-nonmagical', 'piercing-nonmagical', 'slashing-nonmagical'],
    senses: { truesight: 60 }, languages: ['Abyssal', 'Common', 'Infernal', 'telepathy 60'],
    traits: [
      trait('Shapechanger', "It takes the form of any Small or Medium humanoid, or its true winged shape.", { passive: 'shapechanger' }),
      trait('Telepathic Bond', "Once charmed, a creature can be spoken to across any distance on the same plane.", { passive: 'telepathic-bond' }),
    ],
    actions: [
      melee('Claw', 5, '1d6+3', 'slashing', { desc: "True form only." }),
      saveAct('Charm', {
        range: 30, save: { ability: 'wis', dc: 15, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'charmed', duration: '24 hours' }],
        desc: "It asks one small favour of a humanoid it can see, and the humanoid finds it cannot refuse.",
        ai: { role: 'control', weight: 2 },
      }),
      saveAct('Draining Kiss', {
        range: 5, dice: '5d10+5', dtype: 'psychic',
        save: { ability: 'con', dc: 15, onSuccess: 'half' },
        effects: [{ kind: 'condition', id: 'max-hp-drain', duration: 'until long rest' }],
        desc: "The kiss takes years; the target's hit point maximum falls by the damage dealt.",
        ai: { role: 'nuke', weight: 2.2 },
      }),
      util('Etherealness', { desc: "It steps onto the Ethereal Plane and away.", ai: { role: 'utility', weight: 1.2 } }),
    ],
    ai: { archetype: 'caster', aggression: 0.5, selfPreserve: 0.85, preferredRange: 30 },
    loot: { gold: '5d10*5', table: [['clothes-fine', 0.4], ['gem-ruby', 0.12], ['perfume', 0.3], ['ring-of-mind-shielding', 0.05], ['potion-mind-reading', 0.1]] },
    sprite: 'succubus', biomes: ['city', 'dungeon', 'ruins', 'crypt'], groupSize: [1, 1],
    faction: 'demon',
  }),

  mon('incubus', 'Incubus', {
    desc: "The same fiend, the same bargain, a different face. It works through dreams: an offer nightly, a little more of the sleeper gone each morning, until there is nothing left to bargain with.",
    cr: 4, type: 'fiend', subtype: 'shapechanger', size: 'medium', ac: 15, acNote: 'natural armor',
    hpDice: '12d8+12', speed: 30, fly: 60, abilities: { str: 8, dex: 17, con: 13, int: 15, wis: 12, cha: 20 },
    skills: { deception: 9, insight: 5, perception: 5, persuasion: 9, stealth: 7 },
    resist: ['cold', 'fire', 'lightning', 'poison', 'bludgeoning-nonmagical', 'piercing-nonmagical', 'slashing-nonmagical'],
    senses: { truesight: 60 }, languages: ['Abyssal', 'Common', 'Infernal', 'telepathy 60'],
    traits: [
      trait('Shapechanger', "It takes the form of any Small or Medium humanoid, or its true winged shape.", { passive: 'shapechanger' }),
      trait('Nightmare Haunting', "While a sleeper is haunted, that sleeper regains nothing from rest and loses a point of maximum hit points each night.", { passive: 'nightmare-haunting' }),
    ],
    actions: [
      melee('Claw', 5, '1d6+3', 'slashing', { desc: "True form only." }),
      saveAct('Charm', {
        range: 30, save: { ability: 'wis', dc: 15, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'charmed', duration: '24 hours' }],
        desc: "It makes an offer that sounds, in the moment, entirely reasonable.",
        ai: { role: 'control', weight: 2 },
      }),
      saveAct('Draining Kiss', {
        range: 5, dice: '5d10+5', dtype: 'psychic',
        save: { ability: 'con', dc: 15, onSuccess: 'half' },
        effects: [{ kind: 'condition', id: 'max-hp-drain', duration: 'until long rest' }],
        desc: "It takes what was promised, with interest.",
        ai: { role: 'nuke', weight: 2.2 },
      }),
    ],
    ai: { archetype: 'caster', aggression: 0.5, selfPreserve: 0.85, preferredRange: 30 },
    loot: { gold: '5d10*5', table: [['clothes-fine', 0.4], ['gem-black-pearl', 0.1], ['signet-ring', 0.2], ['ring-of-mind-shielding', 0.05]] },
    sprite: 'succubus', tint: '#6a4a8a', biomes: ['city', 'dungeon', 'ruins', 'crypt'], groupSize: [1, 1],
    faction: 'demon',
  }),

  mon('bearded-devil', 'Bearded Devil', {
    desc: "A barbed-tail infantryman of the Hells whose beard is a nest of writhing serpents. The wounds its glaive opens will not close on their own; that is the point of the glaive.",
    cr: 3, type: 'fiend', subtype: 'devil', size: 'medium', ac: 13, acNote: 'natural armor',
    hpDice: '10d8+8', speed: 30, abilities: { str: 16, dex: 15, con: 15, int: 9, wis: 11, cha: 11 },
    saveProf: ['str', 'con', 'wis'],
    resist: DEVIL_RESIST, immune: DEVIL_IMMUNE, condImmune: ['poisoned'],
    senses: { darkvision: 120 }, languages: ['Infernal', 'telepathy 120'],
    traits: [
      T_DEVILS_SIGHT,
      T_MAGIC_RESIST,
      trait('Steadfast', "It cannot be frightened while it can see an allied creature within 30 feet.", { passive: 'steadfast' }),
    ],
    actions: [
      multi("It attacks once with its beard and once with its glaive.", [['beard', 1], ['glaive', 1]]),
      melee('Beard', 5, '1d8+2', 'piercing', {
        save: { ability: 'con', dc: 12, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'poisoned', duration: '1 minute' }],
        desc: "The serpents bite; DC 12 Constitution save or be poisoned and unable to regain hit points for a minute.",
      }),
      melee('Glaive', 5, '1d10+3', 'slashing', {
        reach: 10,
        save: { ability: 'con', dc: 12, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'bleeding', duration: 'until healed' }],
        desc: "Infernal wound: the target loses 5 hit points at the start of each of its turns until it is magically healed.",
      }),
    ],
    ai: { archetype: 'brute', aggression: 0.9, selfPreserve: 0.25, preferredRange: 10 },
    loot: { gold: '4d10', table: [['glaive', 0.25], ['gem-onyx', 0.15], ['potion-healing', 0.15]] },
    sprite: 'devil', tint: '#4a3a3a', biomes: ['dungeon', 'ruins', 'ash-waste', 'crypt'], groupSize: [2, 5],
    faction: 'devil',
  }),

  mon('barbed-devil', 'Barbed Devil', {
    desc: "A spined jailer of the Hells, red as a fresh burn and covered head to foot in hooks. Grapple it at your peril; it hurls fire and it never once blinks.",
    cr: 5, type: 'fiend', subtype: 'devil', size: 'medium', ac: 15, acNote: 'natural armor',
    hpDice: '13d8+52', speed: 30, abilities: { str: 16, dex: 17, con: 18, int: 12, wis: 14, cha: 14 },
    saveProf: ['str', 'con', 'wis', 'cha'], skills: { deception: 5, insight: 5, perception: 8 },
    resist: DEVIL_RESIST, immune: DEVIL_IMMUNE, condImmune: ['poisoned'],
    senses: { darkvision: 120 }, languages: ['Infernal', 'telepathy 120'],
    traits: [
      T_DEVILS_SIGHT,
      T_MAGIC_RESIST,
      trait('Barbed Hide', "Any creature that grapples it or is grappled by it takes 5 (1d10) piercing damage at the start of each of its turns.", { passive: 'barbed-hide:1d10' }),
    ],
    actions: [
      multi("It makes three attacks: two claws and one bite.", [['claw', 2], ['bite', 1]]),
      melee('Claw', 6, '1d6+3', 'piercing'),
      melee('Bite', 6, '2d8+3', 'piercing'),
      ranged('Hurl Flame', 5, '3d6', 'fire', [150, 150], { desc: "A flammable object hit by it catches fire.", ai: { role: 'nuke', weight: 1.3 } }),
    ],
    ai: { archetype: 'brute', aggression: 0.85, selfPreserve: 0.35, preferredRange: 5 },
    loot: { gold: '5d10*3', table: [['gem-ruby', 0.1], ['gem-onyx', 0.2], ['potion-fire-breath', 0.12], ['scroll-3', 0.1]] },
    sprite: 'devil', tint: '#a03030', biomes: ['dungeon', 'ash-waste', 'ruins', 'crypt'], groupSize: [1, 3],
    faction: 'devil',
  }),

  mon('chain-devil', 'Chain Devil', {
    desc: "Wrapped in animate chains it whips out like living things, it takes the shape of someone you failed to save and lets them scream at you while it works. Torment is its office and it is proud of the work.",
    cr: 8, type: 'fiend', subtype: 'devil', size: 'medium', ac: 16, acNote: 'natural armor',
    hpDice: '10d8+40', speed: 30, abilities: { str: 18, dex: 15, con: 18, int: 11, wis: 12, cha: 14 },
    saveProf: ['con', 'wis', 'cha'],
    resist: DEVIL_RESIST, immune: DEVIL_IMMUNE, condImmune: ['poisoned'],
    senses: { darkvision: 120 }, languages: ['Infernal', 'telepathy 120'],
    traits: [
      T_DEVILS_SIGHT,
      T_MAGIC_RESIST,
      trait('Animate Chains', "Up to four chains within 60 feet animate at its command and fight as it does.", { passive: 'animate-chains:4' }),
    ],
    actions: [
      multi("It makes two chain attacks.", [['chain', 2]]),
      melee('Chain', 8, '2d6+4', 'slashing', {
        reach: 10,
        effects: [{ kind: 'condition', id: 'restrained', save: { ability: 'dex', dc: 15 } }],
        desc: "The chain wraps and holds; a restrained creature takes 2d6 piercing damage each turn from the barbs.",
        ai: { role: 'control', weight: 1.6 },
      }),
      saveAct('Unnerving Mask', {
        range: 30, save: { ability: 'wis', dc: 14, onSuccess: 'negate' },
        dice: '3d6', dtype: 'psychic',
        effects: [{ kind: 'condition', id: 'frightened', duration: '1 minute' }],
        desc: "It wears the face of someone the target watched die.",
        ai: { role: 'debuff', weight: 1.8 },
      }),
    ],
    ai: { archetype: 'skirmisher', aggression: 0.85, selfPreserve: 0.4, preferredRange: 10 },
    loot: { gold: '6d10*5', table: [['chain', 0.3], ['gem-onyx', 0.2], ['manacles', 0.3], ['rope-of-entanglement', 0.04]] },
    sprite: 'devil', tint: '#6a2a2a', biomes: ['dungeon', 'crypt', 'ruins', 'ash-waste'], groupSize: [1, 3],
    faction: 'devil',
  }),

  mon('horned-devil', 'Horned Devil', {
    desc: "A winged sergeant of the infernal legions with a forked tail that leaves a wound that will not stop bleeding. It is the one sent when a mortal has been slow paying a contract.",
    cr: 11, type: 'fiend', subtype: 'devil', size: 'large', ac: 18, acNote: 'natural armor',
    hpDice: '17d10+85', speed: 20, fly: 60, abilities: { str: 22, dex: 17, con: 21, int: 12, wis: 16, cha: 17 },
    saveProf: ['str', 'dex', 'wis', 'cha'],
    resist: DEVIL_RESIST, immune: DEVIL_IMMUNE, condImmune: ['poisoned'],
    senses: { darkvision: 120 }, languages: ['Infernal', 'telepathy 120'],
    traits: [T_DEVILS_SIGHT, T_MAGIC_RESIST],
    actions: [
      multi("It makes three melee attacks: two forks and one tail.", [['fork', 2], ['tail', 1]]),
      melee('Fork', 10, '2d8+6', 'piercing', { reach: 10 }),
      melee('Tail', 10, '1d8+6', 'piercing', {
        save: { ability: 'con', dc: 17, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'bleeding', duration: 'until healed' }],
        desc: "Infernal wound: the target loses 10 hit points at the start of each of its turns until magically healed.",
      }),
      ranged('Hurl Flame', 7, '4d6', 'fire', [150, 150], { ai: { role: 'nuke', weight: 1.4 } }),
    ],
    ai: { archetype: 'brute', aggression: 0.9, selfPreserve: 0.35, preferredRange: 10 },
    loot: { gold: '8d10*10', table: [['gem-ruby', 0.2], ['gem-diamond', 0.06], ['ring-of-resistance-fire', 0.06], ['scroll-5', 0.15], ['potion-superior-healing', 0.2]] },
    sprite: 'devil', tint: '#8a2a2a', biomes: ['ash-waste', 'dungeon', 'ruins', 'mountain'], groupSize: [1, 2],
    faction: 'devil', elite: true,
  }),

  mon('erinyes', 'Erinyes', {
    desc: "A fallen angel in the Hells' service, black-winged and armed with a rope that never misses. It hunts the oath-breaking dead across planes and brings them home tied at the wrists.",
    cr: 12, type: 'fiend', subtype: 'devil', size: 'medium', ac: 18, acNote: 'plate armor',
    hpDice: '18d8+72', speed: 30, fly: 60, abilities: { str: 18, dex: 16, con: 18, int: 14, wis: 14, cha: 18 },
    saveProf: ['dex', 'con', 'wis', 'cha'],
    resist: DEVIL_RESIST, immune: DEVIL_IMMUNE, condImmune: ['poisoned'],
    senses: { truesight: 120 }, languages: ['Infernal', 'telepathy 120'],
    traits: [
      T_MAGIC_RESIST,
      trait('Hellish Weapons', "Its weapons are magical and carry 13 (3d8) poison damage on a hit.", { passive: 'hellish-weapons:3d8:poison' }),
    ],
    actions: [
      multi("It makes three longsword attacks, or two longbow attacks.", [['longsword', 3]]),
      melee('Longsword', 8, '1d8+4', 'slashing', { effects: [{ kind: 'damage', dice: '3d8', type: 'poison' }] }),
      ranged('Longbow', 7, '1d8+3', 'piercing', [150, 600], {
        save: { ability: 'con', dc: 14, onSuccess: 'negate' },
        effects: [{ kind: 'damage', dice: '3d8', type: 'poison' }, { kind: 'condition', id: 'poisoned', duration: '1 hour' }],
      }),
      util('Rope of Entanglement', {
        desc: "It hurls a rope that binds a creature within 30 feet, restraining it until it breaks free.",
        effects: [{ kind: 'condition', id: 'restrained', duration: 'until escaped' }],
        ai: { role: 'control', weight: 1.7 },
      }),
    ],
    reactions: [util('Parry', { desc: "It adds 4 to its AC against one melee attack that would hit it.", ai: { role: 'utility', weight: 1.3 } })],
    ai: { archetype: 'archer', aggression: 0.8, selfPreserve: 0.5, preferredRange: 60 },
    loot: { gold: '8d10*10', table: [['longsword', 0.25], ['longbow', 0.25], ['plate-armor', 0.1], ['rope-of-entanglement', 0.08], ['gem-black-pearl', 0.15], ['flame-tongue', 0.04]] },
    sprite: 'erinyes', biomes: ['ash-waste', 'city', 'ruins', 'dungeon'], groupSize: [1, 1],
    faction: 'devil', elite: true,
  }),

  mon('ice-devil', 'Ice Devil', {
    desc: "A white, insectile lord of Cania whose breath freezes the marrow and whose spear kills what it touches. It commands legions and considers every one of them expendable, itself excepted.",
    cr: 14, type: 'fiend', subtype: 'devil', size: 'large', ac: 18, acNote: 'natural armor',
    hpDice: '18d10+90', speed: 40, abilities: { str: 21, dex: 14, con: 18, int: 18, wis: 15, cha: 18 },
    saveProf: ['dex', 'con', 'wis', 'cha'],
    resist: ['bludgeoning-nonmagical', 'piercing-nonmagical', 'slashing-nonmagical'],
    immune: ['cold', 'fire', 'poison'], condImmune: ['poisoned'],
    senses: { blindsight: 60, darkvision: 120 }, languages: ['Infernal', 'telepathy 120'],
    traits: [T_DEVILS_SIGHT, T_MAGIC_RESIST],
    actions: [
      multi("It makes three attacks: one bite, two claws — or it uses its spear twice.", [['bite', 1], ['claw', 2]]),
      melee('Bite', 10, '2d6+5', 'piercing'),
      melee('Claw', 10, '1d10+5', 'slashing'),
      melee('Tail', 10, '3d6+5', 'bludgeoning', { reach: 10 }),
      saveAct('Wall of Ice', {
        range: 120, dice: '10d6', dtype: 'cold',
        save: { ability: 'dex', dc: 19, onSuccess: 'half' },
        target: { kind: 'wall', length: 60, width: 5 },
        uses: { max: 1, recharge: 'long' },
        desc: "A wall of black ice grinds up out of the floor where it points.",
        ai: { role: 'control', weight: 2 },
      }),
    ],
    ai: { archetype: 'brute', aggression: 0.85, selfPreserve: 0.45, preferredRange: 10 },
    loot: { gold: '10d10*10', table: [['gem-diamond', 0.15], ['gem-moonstone', 0.25], ['ring-of-resistance-cold', 0.08], ['frost-brand', 0.03], ['scroll-6', 0.15]] },
    sprite: 'devil', tint: '#b8d8e8', biomes: ['tundra', 'dungeon', 'ash-waste', 'mountain'], groupSize: [1, 2],
    faction: 'devil', elite: true,
  }),

  mon('pit-fiend', 'Pit Fiend', {
    desc: "Twelve feet of red-scaled generalship, wings like a cathedral door, wreathed in a heat that makes the air shake. Devils kneel; archdevils listen. It has never once made a bargain it lost.",
    cr: 20, type: 'fiend', subtype: 'devil', size: 'large', ac: 19, acNote: 'natural armor',
    hpDice: '26d10+156', speed: 30, fly: 60, abilities: { str: 26, dex: 14, con: 24, int: 22, wis: 18, cha: 24 },
    saveProf: ['dex', 'con', 'wis'],
    resist: ['cold', 'bludgeoning-nonmagical', 'piercing-nonmagical', 'slashing-nonmagical'],
    immune: ['fire', 'poison'], condImmune: ['poisoned'],
    senses: { truesight: 120 }, languages: ['Infernal', 'telepathy 120'],
    traits: [
      T_MAGIC_RESIST,
      trait('Fear Aura', "Any creature that starts its turn within 20 feet must make a DC 21 Wisdom save or be frightened until it leaves the aura.", { passive: 'fear-aura:21:20' }),
      trait('Fiendish Blessing', "Every allied fiend within 20 feet gains a share of its AC.", { passive: 'fiendish-blessing:20' }),
      trait('Innate Spellcasting', "Detect magic and fireball at will; hold monster and wall of fire three times a day, with spell save DC 21.", { passive: 'innate-casting:cha:21' }),
    ],
    actions: [
      multi("It makes four attacks: bite, claw, mace and tail.", [['bite', 1], ['claw', 1], ['mace', 1], ['tail', 1]]),
      melee('Bite', 14, '4d6+8', 'piercing', {
        save: { ability: 'con', dc: 21, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'poisoned', duration: '1 minute' }, { kind: 'damage', dice: '6d6', type: 'poison' }],
        desc: "DC 21 Constitution save or be poisoned, taking 21 (6d6) poison damage at the start of each turn.",
      }),
      melee('Claw', 14, '2d8+8', 'slashing'),
      melee('Mace', 14, '2d6+8', 'bludgeoning', { effects: [{ kind: 'damage', dice: '6d6', type: 'fire' }] }),
      melee('Tail', 14, '3d10+8', 'bludgeoning'),
      saveAct('Fireball', {
        range: 150, dice: '8d6', dtype: 'fire',
        save: { ability: 'dex', dc: 21, onSuccess: 'half' },
        target: { kind: 'sphere', radius: 20 },
        desc: "It casts fireball as casually as a man snaps his fingers.",
        ai: { role: 'aoe', weight: 2.4 },
      }),
    ],
    ai: { archetype: 'boss', aggression: 0.9, selfPreserve: 0.5, preferredRange: 10 },
    loot: { gold: '20d10*20', table: [['gem-diamond', 0.4], ['gem-ruby', 0.4], ['flame-tongue', 0.1], ['ring-of-resistance-fire', 0.15], ['scroll-8', 0.2], ['holy-avenger', 0.02]] },
    sprite: 'devil', tint: '#c02020', biomes: ['ash-waste', 'dungeon', 'ruins'], groupSize: [1, 1],
    faction: 'devil', elite: true,
  }),

  mon('vrock', 'Vrock', {
    desc: "A vulture demon eight feet tall that screeches loud enough to stun a room and sheds spores that eat a man from the outside in. It fights in flocks and it does not retreat.",
    cr: 6, type: 'fiend', subtype: 'demon', size: 'large', ac: 15, acNote: 'natural armor',
    hpDice: '10d10+50', speed: 40, fly: 60, abilities: { str: 17, dex: 15, con: 18, int: 8, wis: 13, cha: 8 },
    saveProf: ['dex', 'wis', 'cha'],
    resist: DEMON_RESIST, immune: ['poison'], condImmune: ['poisoned'],
    senses: { darkvision: 120 }, languages: ['Abyssal', 'telepathy 120'],
    traits: [T_MAGIC_RESIST],
    actions: [
      multi("It makes two attacks: one beak and one talons.", [['beak', 1], ['talons', 1]]),
      melee('Beak', 6, '2d6+3', 'piercing'),
      melee('Talons', 6, '2d10+3', 'slashing'),
      saveAct('Spores', {
        target: { kind: 'sphere', radius: 15 },
        save: { ability: 'con', dc: 14, onSuccess: 'negate' },
        dice: '1d10', dtype: 'poison',
        effects: [{ kind: 'condition', id: 'poisoned', duration: '1 minute' }],
        uses: { max: 1, recharge: '6' },
        desc: "A cloud of toxic spores bursts from it; the poisoned take 5 (1d10) poison damage each turn.",
        ai: { role: 'aoe', weight: 2 },
      }),
      saveAct('Stunning Screech', {
        target: { kind: 'sphere', radius: 20 },
        save: { ability: 'con', dc: 14, onSuccess: 'negate' },
        dice: '3d10', dtype: 'thunder',
        effects: [{ kind: 'condition', id: 'stunned', duration: '1 round' }],
        uses: { max: 1, recharge: 'long' },
        desc: "It throws its head back and screams; every non-demon within 20 feet is stunned on a failed save.",
        ai: { role: 'aoe', weight: 2.3 },
      }),
    ],
    ai: { archetype: 'skirmisher', aggression: 0.9, selfPreserve: 0.2, preferredRange: 5 },
    loot: { gold: '5d10*3', table: [['gem-onyx', 0.2], ['antitoxin', 0.2], ['scroll-3', 0.1]] },
    sprite: 'demon', tint: '#6a7a4a', biomes: ['ruins', 'dungeon', 'ash-waste', 'underdark'], groupSize: [1, 4],
    faction: 'demon',
  }),

  mon('hezrou', 'Hezrou', {
    desc: "A bloated toad demon that stinks badly enough to sicken a whole room, ten feet of muscle under wet warty hide. It is stupid, tireless and almost impossible to put down.",
    cr: 8, type: 'fiend', subtype: 'demon', size: 'large', ac: 16, acNote: 'natural armor',
    hpDice: '13d10+65', speed: 30, abilities: { str: 19, dex: 17, con: 20, int: 5, wis: 12, cha: 13 },
    saveProf: ['str', 'con', 'wis'],
    resist: DEMON_RESIST, immune: ['poison'], condImmune: ['poisoned'],
    senses: { darkvision: 120 }, languages: ['Abyssal', 'telepathy 120'],
    traits: [
      T_MAGIC_RESIST,
      trait('Stench', "Any creature that starts its turn within 10 feet must make a DC 14 Constitution save or be poisoned until the start of its next turn.", { passive: 'stench:14:10' }),
    ],
    actions: [
      multi("It makes three attacks: one bite and two claws.", [['bite', 1], ['claw', 2]]),
      melee('Bite', 7, '2d10+4', 'piercing'),
      melee('Claw', 7, '2d6+4', 'slashing'),
    ],
    ai: { archetype: 'brute', aggression: 0.95, selfPreserve: 0.15, preferredRange: 5 },
    loot: { gold: '6d10*3', table: [['gem-jade', 0.15], ['gem-onyx', 0.2], ['potion-greater-healing', 0.15]] },
    sprite: 'demon', tint: '#4a6a3a', biomes: ['marsh', 'dungeon', 'ruins', 'underdark'], groupSize: [1, 3],
    faction: 'demon',
  }),

  mon('glabrezu', 'Glabrezu', {
    desc: "Four arms — two of them pincers the size of a man's chest — and a dog's snarling head on a barrel body. It offers you your heart's desire in a reasonable voice, and it means to ruin you with it.",
    cr: 9, type: 'fiend', subtype: 'demon', size: 'large', ac: 17, acNote: 'natural armor',
    hpDice: '15d10+75', speed: 40, abilities: { str: 20, dex: 15, con: 21, int: 19, wis: 17, cha: 16 },
    saveProf: ['str', 'con', 'wis', 'cha'],
    resist: DEMON_RESIST, immune: ['poison'], condImmune: ['poisoned'],
    senses: { truesight: 120 }, languages: ['Abyssal', 'telepathy 120'],
    traits: [
      T_MAGIC_RESIST,
      trait('Innate Spellcasting', "Darkness, detect magic and dispel magic at will; confusion, fly, power word stun and wish once a day, with spell save DC 16. The wish is never granted honestly.", { passive: 'innate-casting:int:16' }),
    ],
    actions: [
      multi("It makes four attacks: two pincers and two fists.", [['pincer', 2], ['fist', 2]]),
      melee('Pincer', 9, '2d10+5', 'bludgeoning', {
        reach: 10,
        effects: [{ kind: 'condition', id: 'grappled', save: { ability: 'str', dc: 15 } }],
      }),
      melee('Fist', 9, '2d4+2', 'bludgeoning'),
      saveAct('Power Word Stun', {
        range: 60, save: { ability: 'con', dc: 16, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'stunned', duration: '1 minute' }],
        uses: { max: 1, recharge: 'long' },
        desc: "One word in Abyssal, and a creature with 150 hit points or fewer simply stops.",
        ai: { role: 'control', weight: 2.4 },
      }),
    ],
    ai: { archetype: 'brute', aggression: 0.8, selfPreserve: 0.4, preferredRange: 10 },
    loot: { gold: '8d10*8', table: [['gem-ruby', 0.2], ['gem-emerald', 0.15], ['scroll-5', 0.2], ['ring-of-protection', 0.05], ['potion-superior-healing', 0.2]] },
    sprite: 'demon', tint: '#7a4a2a', biomes: ['dungeon', 'ruins', 'underdark', 'ash-waste'], groupSize: [1, 2],
    faction: 'demon', elite: true,
  }),

  mon('nalfeshnee', 'Nalfeshnee', {
    desc: "A boar-headed, feather-winged mountain of a demon that judges the damned in the Abyss and finds the process delightful. Its horror aura shows you your own worst hour, on a loop.",
    cr: 13, type: 'fiend', subtype: 'demon', size: 'large', ac: 18, acNote: 'natural armor',
    hpDice: '18d10+90', speed: 20, fly: 30, abilities: { str: 21, dex: 10, con: 22, int: 19, wis: 12, cha: 15 },
    saveProf: ['con', 'int', 'wis', 'cha'],
    resist: DEMON_RESIST, immune: ['poison'], condImmune: ['poisoned'],
    senses: { truesight: 120 }, languages: ['Abyssal', 'telepathy 120'],
    traits: [T_MAGIC_RESIST],
    actions: [
      multi("It makes three attacks: one bite and two claws.", [['bite', 1], ['claw', 2]]),
      melee('Bite', 10, '5d10+5', 'piercing'),
      melee('Claw', 10, '3d6+5', 'slashing'),
      saveAct('Horror Nimbus', {
        target: { kind: 'sphere', radius: 15 },
        save: { ability: 'wis', dc: 15, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'frightened', duration: '1 minute' }],
        uses: { max: 1, recharge: '5-6' },
        desc: "It flares with sickly light and every creature within 15 feet that can see it relives its worst memory.",
        ai: { role: 'debuff', weight: 2.2 },
      }),
      util('Teleport', {
        desc: "It vanishes and reappears up to 120 feet away in a space it can see.",
        effects: [{ kind: 'teleport', distance: 120 }],
        ai: { role: 'utility', weight: 1.2 },
      }),
    ],
    ai: { archetype: 'brute', aggression: 0.85, selfPreserve: 0.4, preferredRange: 5 },
    loot: { gold: '10d10*10', table: [['gem-diamond', 0.12], ['gem-ruby', 0.25], ['scroll-6', 0.2], ['wand-of-fear', 0.08], ['potion-superior-healing', 0.25]] },
    sprite: 'demon', tint: '#8a6a2a', biomes: ['dungeon', 'ruins', 'ash-waste', 'underdark'], groupSize: [1, 1],
    faction: 'demon', elite: true,
  }),

  mon('marilith', 'Marilith', {
    desc: "A serpent from the waist down, a beautiful woman from the waist up, and six arms holding six swords in between. She is the Abyss's finest tactician and she is never once out of position.",
    cr: 16, type: 'fiend', subtype: 'demon', size: 'large', ac: 18, acNote: 'natural armor',
    hpDice: '18d10+90', speed: 40, abilities: { str: 18, dex: 20, con: 20, int: 18, wis: 16, cha: 20 },
    saveProf: ['str', 'con', 'wis', 'cha'],
    resist: DEMON_RESIST, immune: ['poison'], condImmune: ['poisoned'],
    senses: { truesight: 120 }, languages: ['Abyssal', 'telepathy 120'],
    traits: [
      T_MAGIC_RESIST,
      T_MAGIC_WEAPONS,
      trait('Reactive', "It takes one reaction on every creature's turn, not just its own.", { passive: 'reactive' }),
    ],
    actions: [
      multi("It makes seven attacks: six longswords and one tail.", [['longsword', 6], ['tail', 1]]),
      melee('Longsword', 9, '2d8+4', 'slashing'),
      melee('Tail', 9, '2d10+4', 'bludgeoning', {
        effects: [{ kind: 'condition', id: 'restrained', save: { ability: 'str', dc: 19 } }],
        desc: "It coils around a Medium or smaller creature and holds it fast.",
      }),
      util('Teleport', {
        desc: "It vanishes and reappears up to 120 feet away.",
        effects: [{ kind: 'teleport', distance: 120 }],
        ai: { role: 'utility', weight: 1.3 },
      }),
    ],
    reactions: [util('Parry', { desc: "It adds 5 to its AC against one melee attack that would hit it.", ai: { role: 'utility', weight: 1.4 } })],
    ai: { archetype: 'boss', aggression: 0.9, selfPreserve: 0.4, preferredRange: 5 },
    loot: { gold: '12d10*15', table: [['longsword', 0.4], ['gem-diamond', 0.2], ['gem-emerald', 0.3], ['scimitar-of-speed', 0.05], ['dancing-sword', 0.05], ['scroll-7', 0.2]] },
    sprite: 'marilith', biomes: ['dungeon', 'ruins', 'ash-waste', 'underdark'], groupSize: [1, 1],
    faction: 'demon', elite: true,
  }),

  mon('balor', 'Balor', {
    desc: "Twenty feet of burning shadow with a flaming whip in one hand and a lightning-forged sword in the other. When it dies it detonates, and the Abyss simply makes another.",
    cr: 19, type: 'fiend', subtype: 'demon', size: 'huge', ac: 19, acNote: 'natural armor',
    hpDice: '21d12+126', speed: 40, fly: 80, abilities: { str: 26, dex: 15, con: 22, int: 20, wis: 16, cha: 22 },
    saveProf: ['str', 'con', 'wis'],
    resist: ['cold', 'lightning', 'bludgeoning-nonmagical', 'piercing-nonmagical', 'slashing-nonmagical'],
    immune: ['fire', 'poison'], condImmune: ['poisoned'],
    senses: { truesight: 120 }, languages: ['Abyssal', 'telepathy 120'],
    traits: [
      T_MAGIC_RESIST,
      trait('Death Throes', "When it dies it explodes: every creature within 30 feet takes 70 (20d6) fire damage, half on a DC 20 Dexterity save.", { passive: 'death-burst:20d6:fire:30' }),
      trait('Fire Aura', "At the start of its turn, every creature within 5 feet takes 10 (3d6) fire damage.", { passive: 'fire-aura:3d6:5' }),
    ],
    actions: [
      multi("It makes two attacks: one with the longsword and one with the whip.", [['longsword', 1], ['whip', 1]]),
      melee('Longsword', 14, '3d8+8', 'slashing', { effects: [{ kind: 'damage', dice: '3d8', type: 'lightning' }] }),
      melee('Whip', 14, '2d6+8', 'slashing', {
        reach: 30,
        effects: [{ kind: 'damage', dice: '3d6', type: 'fire' }, { kind: 'teleport', distance: 25 }],
        desc: "The lash coils and drags the target up to 25 feet toward the balor.",
      }),
      util('Teleport', {
        desc: "It vanishes and reappears up to 120 feet away in a burst of flame.",
        effects: [{ kind: 'teleport', distance: 120 }],
        ai: { role: 'utility', weight: 1.3 },
      }),
    ],
    ai: { archetype: 'boss', aggression: 0.95, selfPreserve: 0.25, preferredRange: 10 },
    loot: { gold: '20d10*20', table: [['gem-diamond', 0.4], ['gem-ruby', 0.4], ['flame-tongue', 0.12], ['ring-of-resistance-fire', 0.15], ['scroll-8', 0.25], ['vorpal-sword', 0.02]] },
    sprite: 'balor', biomes: ['ash-waste', 'dungeon', 'ruins', 'underdark'], groupSize: [1, 1],
    faction: 'demon', elite: true,
  }),
);

// ===========================================================================
// TRUE DRAGONS — the Sword Coast keeps more of them than it admits: Cryovain over
// Icespire, Venomfang in Thundertree, Claugiyliamatar in Kryptgarden, and older,
// worse things sleeping under the Sword Mountains.
//
// Dragons are built by the `drake` helper below because a white wyrm and a gold wyrm
// differ only in breath, hoard and temper — everything else is the same skeleton.
// ===========================================================================

/** Per-colour breath, immunity, palette and lair flavour. */
const DRAGON_KIND = {
  white: { dtype: 'cold', shape: 'cone', save: 'con', tint: '#dbeaf5', biomes: ['tundra', 'mountain', 'cave', 'hills'], hoard: 'gem-moonstone', ring: 'ring-of-resistance-cold' },
  black: { dtype: 'acid', shape: 'line', save: 'dex', tint: '#3a3a44', biomes: ['marsh', 'ruins', 'cave', 'coast'], hoard: 'gem-onyx', ring: 'ring-of-resistance-poison' },
  green: { dtype: 'poison', shape: 'cone', save: 'con', tint: '#3a6a3a', biomes: ['forest', 'pine-forest', 'ruins', 'marsh'], hoard: 'gem-emerald', ring: 'ring-of-resistance-poison' },
  blue: { dtype: 'lightning', shape: 'line', save: 'dex', tint: '#3a6ad4', biomes: ['hills', 'plains', 'cave', 'ash-waste'], hoard: 'gem-jade', ring: 'ring-of-resistance-lightning' },
  red: { dtype: 'fire', shape: 'cone', save: 'dex', tint: '#c02a20', biomes: ['mountain', 'ash-waste', 'cave', 'ruins'], hoard: 'gem-ruby', ring: 'ring-of-resistance-fire' },
  brass: { dtype: 'fire', shape: 'line', save: 'dex', tint: '#c8a24a', biomes: ['plains', 'ruins', 'hills', 'ash-waste'], hoard: 'gem-amber', ring: 'ring-of-resistance-fire' },
  copper: { dtype: 'acid', shape: 'line', save: 'dex', tint: '#b06a3a', biomes: ['hills', 'mountain', 'ruins', 'cave'], hoard: 'gem-malachite', ring: 'ring-of-resistance-poison' },
  bronze: { dtype: 'lightning', shape: 'line', save: 'dex', tint: '#8a7a3a', biomes: ['coast', 'marsh', 'plains', 'ruins'], hoard: 'gem-pearl', ring: 'ring-of-resistance-lightning' },
  silver: { dtype: 'cold', shape: 'cone', save: 'con', tint: '#c8d0da', biomes: ['mountain', 'tundra', 'city', 'hills'], hoard: 'gem-diamond', ring: 'ring-of-resistance-cold' },
  gold: { dtype: 'fire', shape: 'cone', save: 'dex', tint: '#e0b83a', biomes: ['plains', 'coast', 'city', 'hills'], hoard: 'gem-diamond', ring: 'ring-of-resistance-fire' },
};

const DRAGON_AGE = {
  young: { size: 'large', legendary: false, rider: null, gold: '4d10*10', tailReach: 0 },
  adult: { size: 'huge', legendary: true, rider: '1d6', gold: '8d10*30', tailReach: 15 },
  ancient: { size: 'gargantuan', legendary: true, rider: '2d6', gold: '20d10*50', tailReach: 20 },
};

/** Standard dragon hoard for an age band, flavoured with the colour's favourite stone. */
function dragonHoard(kind, age) {
  const t = [[kind.hoard, 0.5], ['gem-onyx', 0.3], ['gem-amber', 0.25]];
  if (age === 'young') return { gold: DRAGON_AGE.young.gold, table: t.concat([['potion-greater-healing', 0.2], ['scroll-3', 0.15], ['dragon-cult-token', 0.1]]) };
  if (age === 'adult') {
    return { gold: DRAGON_AGE.adult.gold, table: t.concat([['gem-ruby', 0.3], ['gem-emerald', 0.25], [kind.ring, 0.1], ['scroll-6', 0.2], ['potion-superior-healing', 0.3], ['dragon-cult-token', 0.2]]) };
  }
  return {
    gold: DRAGON_AGE.ancient.gold,
    table: t.concat([['gem-diamond', 0.5], ['gem-ruby', 0.45], ['gem-emerald', 0.45], [kind.ring, 0.25], ['scroll-8', 0.25],
      ['potion-supreme-healing', 0.35], ['dragonguard', 0.08], ['ring-of-protection', 0.15], ['platinum-ingot', 0.4]]),
  };
}

/**
 * Build one true dragon. `o` carries the numbers that actually differ between
 * entries; everything structural (multiattack, wings, legendary actions, lair) is
 * generated identically for every wyrm so the combat engine sees one shape.
 */
function drake(id, name, color, age, o) {
  const k = DRAGON_KIND[color];
  const a = DRAGON_AGE[age];
  const rider = a.rider ? [{ kind: 'damage', dice: a.rider, type: k.dtype }] : [];
  const actions = [
    multi(a.legendary
      ? "It uses Frightful Presence, then bites once and claws twice."
      : "It bites once and claws twice.",
      a.legendary ? [['frightful-presence', 1], ['bite', 1], ['claw', 2]] : [['bite', 1], ['claw', 2]]),
    melee('Bite', o.atk, `2d10+${o.dmg}`, 'piercing', { reach: age === 'ancient' ? 15 : 10, effects: rider }),
    melee('Claw', o.atk, `2d6+${o.dmg}`, 'slashing', { reach: age === 'ancient' ? 10 : 5 }),
  ];
  if (a.legendary) {
    actions.push(melee('Tail', o.atk, `2d8+${o.dmg}`, 'bludgeoning', { reach: a.tailReach }));
    actions.push(saveAct('Frightful Presence', {
      range: age === 'ancient' ? 120 : 120,
      save: { ability: 'wis', dc: o.frightDC, onSuccess: 'negate' },
      target: { kind: 'sphere', radius: 120 },
      effects: [{ kind: 'condition', id: 'frightened', duration: '1 minute' }],
      desc: "It fills the sky and every creature that can see it must hold its nerve or break.",
      ai: { role: 'debuff', weight: 1.8 },
    }));
  }
  actions.push(saveAct(`${k.dtype[0].toUpperCase()}${k.dtype.slice(1)} Breath`, {
    id: 'breath-weapon',
    dice: o.breath.dice, dtype: k.dtype,
    save: { ability: k.save, dc: o.breath.dc, onSuccess: 'half' },
    target: k.shape === 'cone'
      ? { kind: 'cone', length: o.breath.len }
      : { kind: 'line', length: o.breath.len, width: age === 'young' ? 5 : 10 },
    uses: { max: 1, recharge: '5-6' },
    desc: o.breathDesc,
    ai: { role: 'aoe', weight: 2.8 },
  }));

  const legendary = a.legendary ? {
    count: 3, resist: 3,
    actions: [
      legend('Detect', 1, "It makes a Wisdom (Perception) check, and nothing in the chamber goes unnoticed.", { kind: 'utility', target: { kind: 'self' }, ai: { role: 'utility', weight: 0.5 } }),
      legend('Tail Attack', 1, "It makes one tail attack.", { ref: 'tail', ai: { role: 'nuke', weight: 1.2 } }),
      legend('Wing Attack', 2, `It beats its wings: every creature within ${age === 'ancient' ? 15 : 10} feet takes 2d6+${o.dmg} bludgeoning damage and is knocked prone on a failed DC ${o.wingDC} Dexterity save, then it flies up to half its speed.`, {
        kind: 'save', dice: `2d6+${o.dmg}`, dtype: 'bludgeoning',
        save: { ability: 'dex', dc: o.wingDC, onSuccess: 'negate' },
        target: { kind: 'sphere', radius: age === 'ancient' ? 15 : 10 },
        effects: [{ kind: 'condition', id: 'prone' }],
        ai: { role: 'aoe', weight: 1.8 },
      }),
    ],
  } : null;

  const dragonLair = a.legendary ? lair(`${name} Lair`, o.lairDesc, [
    lairAct('Grasping Terrain', o.lairA, {
      save: { ability: 'dex', dc: o.frightDC, onSuccess: 'negate' },
      effects: [{ kind: 'condition', id: 'restrained', duration: '1 round' }],
    }),
    lairAct('Elemental Surge', o.lairB, {
      save: { ability: k.save, dc: o.frightDC, onSuccess: 'half' },
      dice: '3d6', dtype: k.dtype,
      target: { kind: 'sphere', radius: 20 },
    }),
    lairAct('Draconic Dread', o.lairC, {
      save: { ability: 'wis', dc: o.frightDC, onSuccess: 'negate' },
      effects: [{ kind: 'condition', id: 'frightened', duration: '1 round' }],
    }),
  ], { biome: (o.biomes || k.biomes)[0] }) : null;

  return mon(id, name, {
    desc: o.desc,
    cr: o.cr, type: 'dragon', subtype: color, size: a.size,
    ac: o.ac, acNote: 'natural armor', hpDice: o.hpDice,
    speed: 40, fly: 80, swim: o.swim || 0, burrow: o.burrow || 0, climb: o.climb || 0,
    abilities: o.abilities,
    saveProf: ['dex', 'con', 'wis', 'cha'],
    skills: o.skills,
    senses: { blindsight: 30 + (age === 'ancient' ? 30 : 0), darkvision: 120 },
    immune: [k.dtype],
    languages: age === 'young' ? ['Common', 'Draconic'] : ['Common', 'Draconic', 'and the tongues of those it has eaten'],
    traits: a.legendary ? [legendaryResistance(3), trait('Amphibious', "It is at home in its element and moves through it without effort.", { passive: color === 'bronze' || color === 'black' ? 'amphibious' : 'draconic-nature' })] : [],
    actions,
    legendary,
    lair: dragonLair,
    ai: { archetype: a.legendary ? 'boss' : 'brute', aggression: o.aggression != null ? o.aggression : 0.85, selfPreserve: 0.4, preferredRange: 30 },
    loot: dragonHoard(k, age),
    sprite: 'dragon', tint: k.tint,
    biomes: o.biomes || k.biomes, groupSize: [1, 1],
    faction: 'dragon', elite: true,
  });
}

ALL.push(
  // --- white: the cold, stupid, spiteful end of the chromatic line ---------
  drake('young-white-dragon', 'Young White Dragon', 'white', 'young', {
    desc: "Barely more than an animal and all the more dangerous for it: a killing machine of ice and appetite that remembers every slight. Cryovain of Icespire Peak is one of these, and one is enough for a whole valley.",
    cr: 6, ac: 17, hpDice: '17d10+40', abilities: { str: 18, dex: 10, con: 18, int: 6, wis: 11, cha: 12 },
    atk: 7, dmg: 4, breath: { dice: '8d8', dc: 15, len: 30 }, skills: { perception: 6, stealth: 3 },
    breathDesc: "It exhales a 30-foot cone of killing frost.",
  }),
  drake('adult-white-dragon', 'Adult White Dragon', 'white', 'adult', {
    desc: "Three centuries of grudge in a body the size of a barn, denned in a glacier hung with the frozen dead. It hoards ice as jealously as gold and takes any thaw personally.",
    cr: 13, ac: 18, hpDice: '16d12+96', abilities: { str: 22, dex: 10, con: 26, int: 8, wis: 12, cha: 12 },
    atk: 11, dmg: 6, breath: { dice: '16d8', dc: 19, len: 60 }, frightDC: 14, wingDC: 19,
    skills: { perception: 11, stealth: 5 },
    breathDesc: "It exhales a 60-foot cone of frost that stops a heart mid-beat.",
    lairDesc: "A glacial cave hung with icicles and older corpses, where the cold is a presence and not a temperature.",
    lairA: "Jagged ice erupts from the floor and pins a creature in place until the next lair action.",
    lairB: "A freezing gale howls through the chamber, blasting everything in a 20-foot radius with cold.",
    lairC: "The frozen dead in the walls turn their heads: DC 14 Wisdom save or be frightened until the next lair action.",
  }),
  drake('ancient-white-dragon', 'Ancient White Dragon', 'white', 'ancient', {
    desc: "Eight hundred years of winter given wings. Arveiaturace, the mad white wyrm of the Sea of Moving Ice, still carries her dead rider's saddle strapped to her back and talks to him while she hunts.",
    cr: 20, ac: 20, hpDice: '18d20+144', abilities: { str: 26, dex: 10, con: 26, int: 10, wis: 13, cha: 14 },
    atk: 14, dmg: 8, breath: { dice: '16d8', dc: 22, len: 90 }, frightDC: 18, wingDC: 22,
    skills: { perception: 16, stealth: 7 },
    breathDesc: "It exhales a 90-foot cone of absolute cold; steel goes brittle and shatters.",
    lairDesc: "A cathedral of blue ice at the top of the world, floored with the frozen remains of everything that ever climbed it.",
    lairA: "The floor splits and freezing meltwater grips a creature's legs until the next lair action.",
    lairB: "A blizzard tears through the lair, blinding and freezing everything in a 20-foot radius.",
    lairC: "The ice groans in a voice like the dragon's own: DC 18 Wisdom save or be frightened until the next lair action.",
  }),

  // --- black: swamp tyrants, the cruellest of the chromatics ---------------
  drake('young-black-dragon', 'Young Black Dragon', 'black', 'young', {
    desc: "A lean horror of the drowned country that likes to take a victim apart slowly and in front of its friends. The Mere of Dead Men has had one for a generation, and the caravans have learned another road.",
    cr: 7, ac: 18, hpDice: '15d10+45', abilities: { str: 19, dex: 14, con: 17, int: 12, wis: 11, cha: 15 },
    atk: 7, dmg: 4, breath: { dice: '11d8', dc: 15, len: 30 }, skills: { perception: 6, stealth: 5 },
    swim: 40, breathDesc: "It spits a 30-foot line of clinging acid.",
  }),
  drake('adult-black-dragon', 'Adult Black Dragon', 'black', 'adult', {
    desc: "It rules a stretch of marsh the way a tyrant rules a city, keeping lizardfolk as vassals and drowning anyone who forgets it. The water where it dens is black and smells of vinegar.",
    cr: 14, ac: 19, hpDice: '17d12+85', abilities: { str: 23, dex: 14, con: 21, int: 14, wis: 13, cha: 17 },
    atk: 11, dmg: 6, breath: { dice: '12d8', dc: 18, len: 60 }, frightDC: 16, wingDC: 19,
    skills: { perception: 11, stealth: 7 }, swim: 40,
    breathDesc: "It spits a 60-foot line of acid that strips flesh from bone.",
    lairDesc: "A flooded cypress hollow of black water, hanging moss and the ribs of things that came in and did not leave.",
    lairA: "Grasping roots and muck seize a creature's legs until the next lair action.",
    lairB: "A wave of stinking swamp water surges through the lair, burning everything in a 20-foot radius.",
    lairC: "Swarming insects and whispered drowning-sounds fill the air: DC 16 Wisdom save or be frightened.",
  }),
  drake('ancient-black-dragon', 'Ancient Black Dragon', 'black', 'ancient', {
    desc: "A thousand years of malice denned in a drowned temple, attended by lizardfolk who call it a god and are not entirely wrong. Nothing in its marsh dies quickly.",
    cr: 21, ac: 22, hpDice: '21d20+147', abilities: { str: 27, dex: 14, con: 25, int: 16, wis: 15, cha: 19 },
    atk: 15, dmg: 8, breath: { dice: '15d8', dc: 22, len: 90 }, frightDC: 19, wingDC: 23,
    skills: { perception: 16, stealth: 9 }, swim: 40,
    breathDesc: "It spits a 90-foot line of acid that eats stone.",
    lairDesc: "A sunken temple to a forgotten god, its columns furred with moss, its altar used for something the dragon finds funny.",
    lairA: "Black water erupts and drags a creature under until the next lair action.",
    lairB: "Acidic fog boils out of the flooded nave, searing everything in a 20-foot radius.",
    lairC: "The voices of the drowned rise in chorus: DC 19 Wisdom save or be frightened until the next lair action.",
  }),

  // --- green: the liars of the deep wood ----------------------------------
  drake('young-green-dragon', 'Young Green Dragon', 'green', 'young', {
    desc: "Cunning out of all proportion to its age, it would rather talk you into service than eat you — though it will do both. Venomfang came to Thundertree's ruined tower as one of these.",
    cr: 8, ac: 18, hpDice: '16d10+48', abilities: { str: 19, dex: 12, con: 19, int: 16, wis: 13, cha: 15 },
    atk: 7, dmg: 4, breath: { dice: '12d6', dc: 14, len: 30 },
    skills: { deception: 5, perception: 7, stealth: 4, persuasion: 5 }, swim: 40,
    breathDesc: "It exhales a 30-foot cone of green poison gas that lingers in the lungs.",
  }),
  drake('adult-green-dragon', 'Adult Green Dragon', 'green', 'adult', {
    desc: "The forest's own politician: it knows every road, every debt and every secret in its wood, and it trades them all. Claugiyliamatar of Kryptgarden is the most dangerous of these on the Sword Coast.",
    cr: 15, ac: 19, hpDice: '18d12+90', abilities: { str: 23, dex: 12, con: 21, int: 18, wis: 15, cha: 17 },
    atk: 11, dmg: 6, breath: { dice: '16d6', dc: 18, len: 60 }, frightDC: 16, wingDC: 19,
    skills: { deception: 8, insight: 7, perception: 12, persuasion: 8, stealth: 6 }, swim: 40,
    breathDesc: "It exhales a 60-foot cone of poison the colour of old moss.",
    lairDesc: "A cathedral of ancient trunks grown together over a hoard, where the light is green and nothing sings.",
    lairA: "Roots erupt from the loam and hold a creature fast until the next lair action.",
    lairB: "A cloud of poisonous spores drifts through the grove, choking everything in a 20-foot radius.",
    lairC: "The wood whispers your own secrets back to you: DC 16 Wisdom save or be frightened.",
  }),
  drake('ancient-green-dragon', 'Ancient Green Dragon', 'green', 'ancient', {
    desc: "A wyrm that has ruled the same forest since before Neverwinter had walls, with kobolds, cultists and two barons in its pocket. It has not needed to fight in a hundred years and is very good at it anyway.",
    cr: 22, ac: 21, hpDice: '22d20+154', abilities: { str: 27, dex: 12, con: 25, int: 20, wis: 17, cha: 19 },
    atk: 15, dmg: 8, breath: { dice: '22d6', dc: 22, len: 90 }, frightDC: 19, wingDC: 23,
    skills: { deception: 11, insight: 10, perception: 17, persuasion: 11, stealth: 8 }, swim: 40,
    breathDesc: "It exhales a 90-foot cone of poison thick enough to kill a village downwind.",
    lairDesc: "The heartwood of an old forest, every tree a witness, the hoard grown over with a century of roots.",
    lairA: "The undergrowth animates and pins a creature where it stands until the next lair action.",
    lairB: "A billowing wall of spores and pollen rolls through, poisoning everything in a 20-foot radius.",
    lairC: "The dragon's voice comes from every tree at once: DC 19 Wisdom save or be frightened.",
  }),

  // --- blue: desert and storm ---------------------------------------------
  drake('young-blue-dragon', 'Young Blue Dragon', 'blue', 'young', {
    desc: "A vain, storm-tempered hunter that burrows through sand and rock to strike from beneath. It collects gemstones and grudges in roughly equal measure.",
    cr: 9, ac: 18, hpDice: '16d10+64', abilities: { str: 21, dex: 10, con: 21, int: 14, wis: 11, cha: 17 },
    atk: 9, dmg: 5, breath: { dice: '10d10', dc: 16, len: 60 }, skills: { perception: 7, stealth: 4 },
    burrow: 20, breathDesc: "It exhales a 60-foot line of blue-white lightning.",
  }),
  drake('adult-blue-dragon', 'Adult Blue Dragon', 'blue', 'adult', {
    desc: "It denned in a cave system it hollowed out itself and keeps kobolds to polish the hoard. Storms follow it, and it is insufferable about that.",
    cr: 16, ac: 19, hpDice: '18d12+108', abilities: { str: 25, dex: 10, con: 23, int: 16, wis: 15, cha: 19 },
    atk: 12, dmg: 7, breath: { dice: '12d10', dc: 19, len: 90 }, frightDC: 17, wingDC: 20,
    skills: { perception: 12, stealth: 5 }, burrow: 30,
    breathDesc: "It exhales a 90-foot line of lightning that leaves the air ringing.",
    lairDesc: "A sand-drifted cavern of glassy fulgurite tunnels, thunder rolling somewhere out of sight.",
    lairA: "The sand liquefies and swallows a creature to the waist until the next lair action.",
    lairB: "A crackling static discharge arcs across the chamber, striking everything in a 20-foot radius.",
    lairC: "Thunder speaks in the dragon's voice: DC 17 Wisdom save or be frightened.",
  }),
  drake('ancient-blue-dragon', 'Ancient Blue Dragon', 'blue', 'ancient', {
    desc: "Eight hundred years old, vain as an emperor, and served by an entire kobold nation that considers it divine. It fights from above, patiently, until nothing is left standing.",
    cr: 23, ac: 22, hpDice: '26d20+208', abilities: { str: 29, dex: 10, con: 27, int: 18, wis: 17, cha: 21 },
    atk: 16, dmg: 9, breath: { dice: '16d10', dc: 23, len: 120 }, frightDC: 20, wingDC: 24,
    skills: { perception: 17, stealth: 7 }, burrow: 40,
    breathDesc: "It exhales a 120-foot line of lightning bright enough to blind.",
    lairDesc: "A vaulted vault of fused glass tunnels, the hoard arranged in a spiral the dragon insists is meaningful.",
    lairA: "The floor turns to sinking sand and grips a creature until the next lair action.",
    lairB: "A stroke of lightning splits the chamber, blasting everything in a 20-foot radius.",
    lairC: "The storm outside answers the dragon: DC 20 Wisdom save or be frightened.",
  }),

  // --- red: the worst of them ---------------------------------------------
  drake('young-red-dragon', 'Young Red Dragon', 'red', 'young', {
    desc: "Arrogant before it is even grown, it burns a village to prove the point and then eats the point. Mount Hotenow's slopes are scorched where one has been.",
    cr: 10, ac: 18, hpDice: '17d10+85', abilities: { str: 23, dex: 10, con: 21, int: 14, wis: 11, cha: 19 },
    atk: 10, dmg: 6, breath: { dice: '16d6', dc: 17, len: 30 }, skills: { perception: 8, stealth: 4 },
    climb: 40, breathDesc: "It exhales a 30-foot cone of fire hot enough to melt sand to glass.",
  }),
  drake('adult-red-dragon', 'Adult Red Dragon', 'red', 'adult', {
    desc: "The tyrant of the volcanic peaks, greedy past all sense and utterly certain of its own supremacy. Cult of the Dragon envoys queue up to be eaten by one.",
    cr: 17, ac: 19, hpDice: '19d12+133', abilities: { str: 27, dex: 10, con: 25, int: 16, wis: 13, cha: 21 },
    atk: 14, dmg: 8, breath: { dice: '18d6', dc: 21, len: 60 }, frightDC: 18, wingDC: 22,
    skills: { perception: 13, stealth: 6 }, climb: 40,
    breathDesc: "It exhales a 60-foot cone of fire that turns armour into a kiln.",
    lairDesc: "A magma-lit cavern under a dead volcano, the hoard heaped on a shelf above a lake of fire.",
    lairA: "Molten rock erupts and a creature is caught fast in cooling stone until the next lair action.",
    lairB: "A gout of volcanic gas and flame sweeps the chamber, burning everything in a 20-foot radius.",
    lairC: "The mountain itself rumbles agreement with the dragon: DC 18 Wisdom save or be frightened.",
  }),
  drake('ancient-red-dragon', 'Ancient Red Dragon', 'red', 'ancient', {
    desc: "A thousand years of fire and avarice, the standard against which every other monster on the Sword Coast is measured. Kingdoms have ended because one of these was bored.",
    cr: 24, ac: 22, hpDice: '28d20+252', abilities: { str: 30, dex: 10, con: 29, int: 18, wis: 15, cha: 23 },
    atk: 17, dmg: 10, breath: { dice: '26d6', dc: 24, len: 90 }, frightDC: 21, wingDC: 25,
    skills: { perception: 18, stealth: 7 }, climb: 40,
    breathDesc: "It exhales a 90-foot cone of fire that leaves nothing but ash and slag.",
    lairDesc: "The heart of a living volcano, bridges of basalt over molten rock, and a hoard that could buy Waterdeep.",
    lairA: "The ground cracks and a creature is seized by grasping magma until the next lair action.",
    lairB: "Ash and cinder erupt from every vent, scorching everything in a 20-foot radius.",
    lairC: "The volcano roars with the wyrm: DC 21 Wisdom save or be frightened until the next lair action.",
  }),

  // --- brass: the talkative one -------------------------------------------
  drake('young-brass-dragon', 'Young Brass Dragon', 'brass', 'young', {
    desc: "It would genuinely rather talk than fight, at length, about anything, for hours. Refuse the conversation and you will find out why the sand around its lair is fused to glass.",
    cr: 6, ac: 17, hpDice: '13d10+39', abilities: { str: 19, dex: 10, con: 17, int: 14, wis: 11, cha: 15 },
    atk: 7, dmg: 4, breath: { dice: '12d6', dc: 14, len: 40 }, skills: { history: 4, perception: 6, persuasion: 4, stealth: 3 },
    burrow: 20, aggression: 0.6, breathDesc: "It exhales a 40-foot line of fire, or a cone of sleep gas when it would rather not kill you.",
  }),
  drake('adult-brass-dragon', 'Adult Brass Dragon', 'brass', 'adult', {
    desc: "A hoard of stories, maps and gossip guarded by two tons of amiable, opinionated metal. It will trade a great deal for news from somewhere it has not been.",
    cr: 13, ac: 18, hpDice: '15d12+75', abilities: { str: 23, dex: 10, con: 21, int: 14, wis: 13, cha: 17 },
    atk: 11, dmg: 6, breath: { dice: '12d6', dc: 18, len: 60 }, frightDC: 16, wingDC: 19,
    skills: { history: 7, perception: 11, persuasion: 8, stealth: 5 }, burrow: 30, aggression: 0.6,
    breathDesc: "It exhales a 60-foot line of fire, or a 30-foot cone of sleep gas.",
    lairDesc: "A sun-warmed cave of red rock, its walls covered in scratched maps of places nobody has visited twice.",
    lairA: "Shifting sand pulls a creature down until the next lair action.",
    lairB: "A blast of superheated desert air scours everything in a 20-foot radius.",
    lairC: "A hundred voices the dragon has collected speak at once: DC 16 Wisdom save or be frightened.",
  }),
  drake('ancient-brass-dragon', 'Ancient Brass Dragon', 'brass', 'ancient', {
    desc: "A thousand years of accumulated gossip, geography and unsolicited advice, wrapped around a hoard of maps. It remembers Netheril, and it will tell you about it whether you ask or not.",
    cr: 20, ac: 20, hpDice: '17d20+119', abilities: { str: 27, dex: 10, con: 25, int: 16, wis: 15, cha: 19 },
    atk: 14, dmg: 8, breath: { dice: '16d6', dc: 21, len: 90 }, frightDC: 18, wingDC: 22,
    skills: { history: 11, perception: 16, persuasion: 12, stealth: 7 }, burrow: 40, aggression: 0.6,
    breathDesc: "It exhales a 90-foot line of fire, or a 60-foot cone of sleep gas.",
    lairDesc: "A vast sandstone gallery carved with the history of a dozen fallen kingdoms, most of them accurately.",
    lairA: "The floor becomes quicksand and holds a creature until the next lair action.",
    lairB: "A firestorm of desert wind sweeps the gallery, burning everything in a 20-foot radius.",
    lairC: "The carved kings on the walls turn to look: DC 18 Wisdom save or be frightened.",
  }),

  // --- copper: the comedian -----------------------------------------------
  drake('young-copper-dragon', 'Young Copper Dragon', 'copper', 'young', {
    desc: "A trickster with a taste for riddles and terrible puns, which it delivers while you are stuck to the floor. Insult its jokes at your own considerable risk.",
    cr: 7, ac: 17, hpDice: '14d10+42', abilities: { str: 19, dex: 12, con: 17, int: 16, wis: 13, cha: 15 },
    atk: 7, dmg: 4, breath: { dice: '12d8', dc: 15, len: 40 }, skills: { deception: 5, perception: 6, stealth: 4 },
    climb: 40, aggression: 0.6, breathDesc: "It spits a 40-foot line of acid, or a cone of gas that leaves a creature crawling.",
  }),
  drake('adult-copper-dragon', 'Adult Copper Dragon', 'copper', 'adult', {
    desc: "It hoards art, jokes and unlikely stories, and it will hide an entire party of adventurers from an orc horde purely to see what happens next.",
    cr: 14, ac: 18, hpDice: '16d12+80', abilities: { str: 23, dex: 12, con: 21, int: 18, wis: 15, cha: 17 },
    atk: 11, dmg: 6, breath: { dice: '12d8', dc: 18, len: 60 }, frightDC: 16, wingDC: 19,
    skills: { deception: 8, perception: 12, stealth: 6 }, climb: 40, aggression: 0.6,
    breathDesc: "It spits a 60-foot line of acid, or a 60-foot cone of slowing gas.",
    lairDesc: "A maze of narrow rock chimneys and false passages, half of them practical jokes with teeth.",
    lairA: "Stone hands sprout from the wall and hold a creature until the next lair action.",
    lairB: "Acid drips in sheets from the ceiling, burning everything in a 20-foot radius.",
    lairC: "The passages echo with laughter from every direction: DC 16 Wisdom save or be frightened.",
  }),
  drake('ancient-copper-dragon', 'Ancient Copper Dragon', 'copper', 'ancient', {
    desc: "Nine hundred years of jokes, most of them at somebody's expense, and a hoard of art nobody else knows survived. It has outlived four kingdoms and found each of them funny.",
    cr: 21, ac: 21, hpDice: '20d20+140', abilities: { str: 27, dex: 12, con: 25, int: 20, wis: 17, cha: 19 },
    atk: 15, dmg: 8, breath: { dice: '18d8', dc: 22, len: 90 }, frightDC: 19, wingDC: 23,
    skills: { deception: 11, perception: 17, stealth: 8 }, climb: 40, aggression: 0.6,
    breathDesc: "It spits a 90-foot line of acid, or a 90-foot cone of slowing gas.",
    lairDesc: "A hollow mountain of galleries and trick passages, hung with stolen masterworks and one very good forgery.",
    lairA: "The rock itself grips a creature's boots until the next lair action.",
    lairB: "A curtain of acid sluices down the gallery, burning everything in a 20-foot radius.",
    lairC: "Every statue in the hall turns its head at once: DC 19 Wisdom save or be frightened.",
  }),

  // --- bronze: the coast watchers -----------------------------------------
  drake('young-bronze-dragon', 'Young Bronze Dragon', 'bronze', 'young', {
    desc: "A coastal patroller with a soldier's instincts, forever turning up when a ship is in trouble and asking pointed questions afterwards. It loves a war it thinks is just.",
    cr: 8, ac: 18, hpDice: '15d10+60', abilities: { str: 21, dex: 10, con: 21, int: 14, wis: 13, cha: 17 },
    atk: 9, dmg: 5, breath: { dice: '10d10', dc: 15, len: 60 }, skills: { insight: 5, perception: 7, stealth: 4 },
    swim: 40, aggression: 0.65, breathDesc: "It exhales a 60-foot line of lightning, or a cone of wind that hurls ships and men alike.",
  }),
  drake('adult-bronze-dragon', 'Adult Bronze Dragon', 'bronze', 'adult', {
    desc: "It keeps a stretch of the Sword Coast as its own protectorate, drills with the local militia and is quietly on the Lords' Alliance payroll. Pirates have learned to go around.",
    cr: 15, ac: 19, hpDice: '17d12+102', abilities: { str: 25, dex: 10, con: 25, int: 16, wis: 15, cha: 19 },
    atk: 12, dmg: 7, breath: { dice: '12d10', dc: 19, len: 90 }, frightDC: 17, wingDC: 20,
    skills: { insight: 7, perception: 12, stealth: 5 }, swim: 40, aggression: 0.65,
    breathDesc: "It exhales a 90-foot line of lightning, or a 30-foot cone of repulsion wind.",
    lairDesc: "A sea cave beneath a headland, half flooded, hung with the figureheads of ships it failed to save.",
    lairA: "A surge of seawater slams in and pins a creature against the rock until the next lair action.",
    lairB: "Lightning arcs across the wet stone, striking everything in a 20-foot radius.",
    lairC: "The sea booms in the dragon's voice: DC 17 Wisdom save or be frightened.",
  }),
  drake('ancient-bronze-dragon', 'Ancient Bronze Dragon', 'bronze', 'ancient', {
    desc: "A thousand years of coastal vigilance, with a hoard of salvaged treasure it is scrupulous about returning to the families of the drowned. Slavers do not sail this stretch twice.",
    cr: 22, ac: 22, hpDice: '24d20+192', abilities: { str: 29, dex: 10, con: 27, int: 18, wis: 17, cha: 21 },
    atk: 16, dmg: 9, breath: { dice: '16d10', dc: 23, len: 120 }, frightDC: 20, wingDC: 24,
    skills: { insight: 10, perception: 17, stealth: 7 }, swim: 40, aggression: 0.65,
    breathDesc: "It exhales a 120-foot line of lightning, or a 60-foot cone of repulsion wind.",
    lairDesc: "A drowned fortress under the headland, its halls patrolled by the memory of a garrison long dead.",
    lairA: "The tide surges and drags a creature under until the next lair action.",
    lairB: "A thunderclap rolls through the flooded halls, striking everything in a 20-foot radius.",
    lairC: "The drowned garrison sounds a horn: DC 20 Wisdom save or be frightened.",
  }),

  // --- silver: the friendliest of the great wyrms -------------------------
  drake('young-silver-dragon', 'Young Silver Dragon', 'silver', 'young', {
    desc: "It spends more time as a human than as a dragon, drinking in Neverwinter taverns under a false name and listening for trouble. Then it stops being human.",
    cr: 9, ac: 18, hpDice: '16d10+80', abilities: { str: 23, dex: 10, con: 21, int: 14, wis: 11, cha: 19 },
    atk: 10, dmg: 6, breath: { dice: '12d8', dc: 17, len: 30 }, skills: { arcana: 6, history: 6, perception: 6, stealth: 4 },
    aggression: 0.6, breathDesc: "It exhales a 30-foot cone of frost, or a cone of paralyzing gas.",
  }),
  drake('adult-silver-dragon', 'Adult Silver Dragon', 'silver', 'adult', {
    desc: "Four centuries old and thoroughly fond of mortals, it keeps a human identity, a house in the city and a very great deal of unspent goodwill. Threaten its neighbours and see what happens.",
    cr: 16, ac: 19, hpDice: '18d12+126', abilities: { str: 27, dex: 10, con: 25, int: 16, wis: 13, cha: 21 },
    atk: 14, dmg: 8, breath: { dice: '15d8', dc: 20, len: 60 }, frightDC: 18, wingDC: 22,
    skills: { arcana: 8, history: 8, perception: 12, stealth: 5 }, aggression: 0.6,
    breathDesc: "It exhales a 60-foot cone of frost, or a 60-foot cone of paralyzing gas.",
    lairDesc: "A cloud-wreathed peak above the snowline, with a hall cut into the summit and a hoard nobody has ever tried to steal twice.",
    lairA: "Ice sheets across the floor and holds a creature fast until the next lair action.",
    lairB: "A blast of mountain wind and hail scours everything in a 20-foot radius.",
    lairC: "The mountain wind carries a warning in Draconic: DC 18 Wisdom save or be frightened.",
  }),
  drake('ancient-silver-dragon', 'Ancient Silver Dragon', 'silver', 'ancient', {
    desc: "A thousand years of quiet guardianship over a stretch of the Sword Coast, with a dozen mortal lives lived under a dozen names. Its enemies never see the dragon until the very end.",
    cr: 23, ac: 22, hpDice: '25d20+225', abilities: { str: 30, dex: 10, con: 29, int: 18, wis: 15, cha: 23 },
    atk: 17, dmg: 10, breath: { dice: '17d8', dc: 24, len: 90 }, frightDC: 21, wingDC: 25,
    skills: { arcana: 11, history: 11, perception: 17, stealth: 7 }, aggression: 0.6,
    breathDesc: "It exhales a 90-foot cone of killing frost, or a 90-foot cone of paralyzing gas.",
    lairDesc: "A palace of ice and worked stone inside a mountain's crown, warm at the centre, with a hoard arranged like a museum.",
    lairA: "The floor glazes with ice and grips a creature until the next lair action.",
    lairB: "A howling blizzard fills the hall, freezing everything in a 20-foot radius.",
    lairC: "The dragon's true voice rolls off the walls: DC 21 Wisdom save or be frightened.",
  }),

  // --- gold: the greatest of them -----------------------------------------
  drake('young-gold-dragon', 'Young Gold Dragon', 'gold', 'young', {
    desc: "Grave, courteous and entirely without doubt, it takes a mortal shape to test the character of those it meets. It has already decided about you.",
    cr: 10, ac: 18, hpDice: '17d10+85', abilities: { str: 23, dex: 14, con: 21, int: 16, wis: 13, cha: 20 },
    atk: 10, dmg: 6, breath: { dice: '13d10', dc: 17, len: 30 }, skills: { insight: 5, perception: 8, persuasion: 8, stealth: 6 },
    swim: 40, aggression: 0.6, breathDesc: "It exhales a 30-foot cone of white-hot fire, or a cone of gas that saps the strength.",
  }),
  drake('adult-gold-dragon', 'Adult Gold Dragon', 'gold', 'adult', {
    desc: "Bahamut's own, wise past argument and merciless with the genuinely wicked. It has been advising kings for three hundred years and has never once been wrong in public.",
    cr: 17, ac: 19, hpDice: '19d12+133', abilities: { str: 27, dex: 14, con: 25, int: 16, wis: 15, cha: 24 },
    atk: 14, dmg: 8, breath: { dice: '13d10', dc: 21, len: 60 }, frightDC: 21, wingDC: 22,
    skills: { insight: 8, perception: 13, persuasion: 13, stealth: 8 }, swim: 40, aggression: 0.6,
    breathDesc: "It exhales a 60-foot cone of white-hot fire, or a 60-foot cone of weakening gas.",
    lairDesc: "A sunlit hall of gold-veined marble that should not fit inside the hill it is under, and a hoard kept as a trust.",
    lairA: "Golden light solidifies into bands that hold a creature until the next lair action.",
    lairB: "A wave of radiant fire rolls out from the dais, burning everything in a 20-foot radius.",
    lairC: "The hall itself passes judgement: DC 21 Wisdom save or be frightened until the next lair action.",
  }),
  drake('ancient-gold-dragon', 'Ancient Gold Dragon', 'gold', 'ancient', {
    desc: "The oldest and greatest of the metallic wyrms, a force of judgement with wings. When one takes an interest in a war, the war ends — usually badly for one side and immediately.",
    cr: 24, ac: 22, hpDice: '28d20+252', abilities: { str: 30, dex: 14, con: 29, int: 18, wis: 17, cha: 28 },
    atk: 17, dmg: 10, breath: { dice: '17d10', dc: 24, len: 90 }, frightDC: 24, wingDC: 25,
    skills: { insight: 12, perception: 18, persuasion: 18, stealth: 9 }, swim: 40, aggression: 0.6,
    breathDesc: "It exhales a 90-foot cone of fire white enough to cast shadows through stone.",
    lairDesc: "A vault of living gold beneath a mountain, warm as a summer afternoon, watched over by things older than the dragon.",
    lairA: "Threads of molten gold weave across the floor and pin a creature until the next lair action.",
    lairB: "A pulse of radiant flame sweeps the vault, burning everything in a 20-foot radius.",
    lairC: "The weight of the dragon's judgement settles on the room: DC 24 Wisdom save or be frightened.",
  }),
);

// ===========================================================================
// NAMED BOSSES — the antagonists of the campaign, from the bugbear in the Cragmaw
// cave to the Mad Mage under Waterdeep. Every one of them is canon Forgotten Realms.
//
// Each carries `boss:true`, an `intro` and `defeat` line for the battle scene, phase
// transitions, three legendary actions, a legendary-resistance count, a lair block and
// a guaranteed loot table.
// ===========================================================================

const BOSS_LIST = [];

BOSS_LIST.push(
  mon('klarg', 'Klarg', {
    title: 'Chief of the Cragmaw Hideout',
    desc: "A bugbear who has convinced himself he is a warlord and his cave a fortress. He keeps a wolf named Ripper, a pet grudge against Nezznar's messengers, and Gundren Rockseeker's supply crates stacked where everyone can admire them.",
    cr: 3, type: 'humanoid', subtype: 'goblinoid', size: 'medium', ac: 15, acNote: 'hide armor, shield',
    hpDice: '9d8+18', speed: 30, abilities: { str: 17, dex: 14, con: 15, int: 8, wis: 11, cha: 10 },
    skills: { stealth: 6, survival: 3, intimidation: 4 }, senses: { darkvision: 60 },
    languages: ['Common', 'Goblin'],
    traits: [
      trait('Brute', "A melee weapon in his hands deals one extra die of damage; he calls this being chief.", { passive: 'brute' }),
      trait('Surprise Attack', "If he strikes a creature that has not yet acted, the blow carries an extra 2d6 damage.", { passive: 'surprise-attack:2d6' }),
      trait('Chief of the Cragmaws', "Every goblin within 30 feet that can see him has advantage on saves against being frightened.", { passive: 'rally:30' }),
    ],
    actions: [
      multi("He swings the morningstar twice, roaring the whole time.", [['morningstar', 2]]),
      melee('Morningstar', 5, '2d8+3', 'piercing', { reach: 5 }),
      ranged('Javelin', 5, '2d6+3', 'piercing', [30, 120]),
      util('Call the Pack', {
        uses: { max: 1, recharge: 'long' },
        desc: "He bellows for Ripper and whatever goblins are still breathing.",
        effects: [{ kind: 'summon', monsterId: 'wolf', count: 1 }],
        ai: { role: 'utility', weight: 1.8 },
      }),
    ],
    legendary: {
      count: 3, resist: 1,
      actions: [
        legend('Morningstar Swing', 1, "Klarg makes one morningstar attack.", { ref: 'morningstar', ai: { role: 'nuke', weight: 1.2 } }),
        legend('Bellow', 1, "He roars; one creature within 30 feet must make a DC 12 Wisdom save or be frightened until the end of its next turn.", {
          kind: 'save', range: 30, save: { ability: 'wis', dc: 12, onSuccess: 'negate' },
          effects: [{ kind: 'condition', id: 'frightened', duration: '1 round' }],
          ai: { role: 'debuff', weight: 1 },
        }),
        legend('Hurl Crate', 2, "He heaves one of Gundren's supply crates: DC 13 Dexterity save or take 2d8 bludgeoning damage and be knocked prone.", {
          kind: 'save', dice: '2d8', dtype: 'bludgeoning', range: 30,
          save: { ability: 'dex', dc: 13, onSuccess: 'half' },
          effects: [{ kind: 'condition', id: 'prone' }],
          ai: { role: 'aoe', weight: 1.4 },
        }),
      ],
    },
    lair: lair('Klarg\'s Cave', "A smoke-blackened cavern at the top of the Cragmaw Hideout, a cookfire in the middle and stolen Lionshield crates stacked against the wall.", [
      lairAct('Kick the Fire', "He kicks the cookfire across the floor: DC 12 Dexterity save or take 2d6 fire damage.", {
        save: { ability: 'dex', dc: 12, onSuccess: 'half' }, dice: '2d6', dtype: 'fire',
      }),
      lairAct('Rockslide', "Loose stone showers from the cave roof, forcing a DC 12 Dexterity save against 1d10 bludgeoning damage.", {
        save: { ability: 'dex', dc: 12, onSuccess: 'half' }, dice: '1d10', dtype: 'bludgeoning',
      }),
      lairAct('Goblin Reinforcements', "Two goblins scramble down from the tunnels above.", {
        kind: 'summon', effects: [{ kind: 'summon', monsterId: 'goblin', count: 2 }],
      }),
    ], { biome: 'cave', music: 'boss' }),
    phases: [
      phase(50, "Klarg hurls his shield away and takes the morningstar in both hands. \"KLARG IS CHIEF!\"", { passive: 'reckless' }),
      phase(20, "Bleeding and cornered, he snatches a burning brand from the fire and swings it with the morningstar.", { passive: 'heated-weapons:1d6:fire' }),
    ],
    intro: "\"You come into Klarg's cave? Klarg is CHIEF here! Klarg will grind your bones and Ripper will have the rest!\"",
    defeat: "The morningstar drops first, then the chief. \"Klarg... was... chief...\" The wolf runs. Gundren's crates are still stacked against the wall.",
    ai: { archetype: 'boss', aggression: 0.9, selfPreserve: 0.3, preferredRange: 5 },
    loot: {
      gold: '3d6*10',
      table: [['morningstar', 1.0], ['coster-crate', 1.0], ['potion-healing', 1.0], ['goblin-totem', 0.6], ['hide-armor', 0.4], ['gem-quartz', 0.5], ['rations', 0.8]],
    },
    sprite: 'bugbear', tint: '#8a3a2a', biomes: ['cave'], groupSize: [1, 1],
    faction: 'goblinoid', boss: true, elite: true,
  }),

  mon('yeemik', 'Yeemik', {
    title: 'Second of the Cragmaw Hideout',
    desc: "A goblin with ambition, which among goblins is a terminal condition. He holds Sildar Hallwinter hostage over a twenty-foot drop and offers to sell out Klarg for the chief's chair.",
    cr: 1, type: 'humanoid', subtype: 'goblinoid', size: 'small', ac: 15, acNote: 'leather armor, shield',
    hpDice: '6d6+6', speed: 30, abilities: { str: 10, dex: 14, con: 12, int: 10, wis: 8, cha: 10 },
    skills: { stealth: 6, deception: 4 }, senses: { darkvision: 60 }, languages: ['Common', 'Goblin'],
    traits: [
      trait('Nimble Escape', "He disengages or hides as a bonus action, every single turn, without shame.", { passive: 'nimble-escape' }),
      trait('Hostage Taker', "While he holds a hostage, attacks against him are made with disadvantage.", { passive: 'hostage-taker' }),
    ],
    actions: [
      multi("He stabs twice with the scimitar, or looses two arrows.", [['scimitar', 2]]),
      melee('Scimitar', 4, '1d6+2', 'slashing'),
      ranged('Shortbow', 4, '1d6+2', 'piercing', [80, 320]),
      util('Order the Sentries', {
        uses: { max: 2, recharge: 'long' },
        desc: "He screams orders and two goblins pop up from the tunnel mouths.",
        effects: [{ kind: 'summon', monsterId: 'goblin', count: 2 }],
        ai: { role: 'utility', weight: 1.6 },
      }),
    ],
    legendary: {
      count: 3, resist: 1,
      actions: [
        legend('Quick Stab', 1, "Yeemik makes one scimitar attack.", { ref: 'scimitar', ai: { role: 'nuke', weight: 1 } }),
        legend('Scramble', 1, "He scurries up to his speed along the ledges without provoking opportunity attacks.", { kind: 'utility', target: { kind: 'self' }, ai: { role: 'utility', weight: 0.9 } }),
        legend('Shove the Hostage', 2, "He shoves a prisoner off the ledge to buy himself a round; one ally must spend its action catching them.", {
          kind: 'save', range: 10, save: { ability: 'dex', dc: 12, onSuccess: 'half' },
          dice: '2d6', dtype: 'bludgeoning',
          ai: { role: 'debuff', weight: 1.3 },
        }),
      ],
    },
    lair: lair('The Goblin Ledge', "A shelf of rock twenty feet above a flooded cave floor, with a rope bridge and a very poor safety record.", [
      lairAct('Cut the Bridge', "He hacks at the rope bridge: anyone standing on it must make a DC 12 Dexterity save or fall, taking 2d6 bludgeoning damage.", {
        save: { ability: 'dex', dc: 12, onSuccess: 'negate' }, dice: '2d6', dtype: 'bludgeoning',
      }),
      lairAct('Loose the Flood', "Goblins pull the dam pegs and a wall of water sweeps the lower cave: DC 12 Strength save or be knocked prone and swept 10 feet.", {
        save: { ability: 'str', dc: 12, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'prone' }],
      }),
    ], { biome: 'cave' }),
    phases: [
      phase(40, "\"Yeemik is chief now! YEEMIK IS CHIEF!\" He abandons the hostage and fights like something cornered.", { passive: 'reckless' }),
    ],
    intro: "\"You want this one? Hallwinter? Fine, fine — you kill Klarg, Yeemik gives him back. Yeemik is generous!\"",
    defeat: "\"Yeemik... only wanted... the chair...\" He topples off the ledge, and the cave is suddenly very quiet.",
    ai: { archetype: 'skirmisher', aggression: 0.7, selfPreserve: 0.8, preferredRange: 20 },
    loot: { gold: '4d6*5', table: [['scimitar', 1.0], ['shortbow', 1.0], ['potion-healing', 0.8], ['goblin-totem', 0.5], ['gem-quartz', 0.4]] },
    sprite: 'goblin', tint: '#6a8a3a', biomes: ['cave'], groupSize: [1, 1],
    faction: 'goblinoid', boss: true, elite: true,
  }),

  mon('king-grol', 'King Grol', {
    title: 'King of the Cragmaw Tribe',
    desc: "The biggest bugbear in the Sword Mountains, crowned in a broken helm and served by a doppelganger he does not know is a spy. He has Gundren Rockseeker in a cell and the map to Wave Echo Cave in his fist.",
    cr: 5, type: 'humanoid', subtype: 'goblinoid', size: 'medium', ac: 16, acNote: 'chain shirt, shield',
    hpDice: '12d8+36', speed: 30, abilities: { str: 18, dex: 14, con: 16, int: 11, wis: 12, cha: 14 },
    saveProf: ['str', 'con'], skills: { intimidation: 6, perception: 3, stealth: 6, survival: 3 },
    senses: { darkvision: 60 }, languages: ['Common', 'Goblin'],
    traits: [
      trait('Brute', "His weapons deal one extra die of damage.", { passive: 'brute' }),
      trait('Surprise Attack', "A blow against a creature that has not acted carries an extra 2d6 damage.", { passive: 'surprise-attack:2d6' }),
      trait('King of the Cragmaws', "Allied goblinoids within 30 feet add his Charisma bonus to their damage.", { passive: 'warlord:30' }),
    ],
    actions: [
      multi("He attacks twice with the great battleaxe.", [['battleaxe', 2]]),
      melee('Battleaxe', 7, '2d8+4', 'slashing'),
      ranged('Javelin', 7, '2d6+4', 'piercing', [30, 120]),
      saveAct('Kingly Roar', {
        range: 30, save: { ability: 'wis', dc: 14, onSuccess: 'negate' },
        target: { kind: 'sphere', radius: 30 },
        effects: [{ kind: 'condition', id: 'frightened', duration: '1 minute' }],
        uses: { max: 1, recharge: 'short' },
        desc: "The castle shakes with it and every wolf in the kennels answers.",
        ai: { role: 'debuff', weight: 1.7 },
      }),
    ],
    legendary: {
      count: 3, resist: 2,
      actions: [
        legend('Axe Sweep', 1, "Grol makes one battleaxe attack.", { ref: 'battleaxe', ai: { role: 'nuke', weight: 1.3 } }),
        legend('Command the Tribe', 1, "One allied goblinoid he can see immediately moves half its speed and attacks.", {
          kind: 'utility', range: 60, target: { kind: 'creature', count: 1, allowAllies: true },
          ai: { role: 'support', weight: 1.4 },
        }),
        legend('Hurl the Throne', 2, "He throws a piece of his broken throne: DC 15 Dexterity save or take 3d8 bludgeoning damage and be knocked prone.", {
          kind: 'save', dice: '3d8', dtype: 'bludgeoning', range: 30,
          save: { ability: 'dex', dc: 15, onSuccess: 'half' },
          effects: [{ kind: 'condition', id: 'prone' }],
          ai: { role: 'aoe', weight: 1.6 },
        }),
      ],
    },
    lair: lair('Cragmaw Castle', "A ruined elven fortress swallowed by the forest, its halls tunnelled through by goblins and hung with wolf hides.", [
      lairAct('Wolves Loose', "The kennel gate slams open and two wolves come through it.", {
        kind: 'summon', effects: [{ kind: 'summon', monsterId: 'wolf', count: 2 }],
      }),
      lairAct('Collapsing Masonry', "Elven stonework gives way: DC 14 Dexterity save or take 2d10 bludgeoning damage.", {
        save: { ability: 'dex', dc: 14, onSuccess: 'half' }, dice: '2d10', dtype: 'bludgeoning',
      }),
      lairAct('Arrow Slits', "Goblin archers fire through the murder holes: DC 14 Dexterity save or take 2d6 piercing damage.", {
        save: { ability: 'dex', dc: 14, onSuccess: 'negate' }, dice: '2d6', dtype: 'piercing',
      }),
    ], { biome: 'ruins' }),
    phases: [
      phase(60, "The doppelganger at his side drops its disguise, and Grol does not even look surprised.", { passive: 'summon-ally' }),
      phase(30, "\"THE MAP IS MINE!\" He hurls the shield aside and fights two-handed.", { passive: 'reckless' }),
    ],
    intro: "\"The dwarf is mine. The map is mine. This castle is MINE.\" King Grol rises from a throne of broken elven stone. \"You are meat.\"",
    defeat: "Grol falls across his own throne, the map still crumpled in his fist. Somewhere below, Gundren Rockseeker starts shouting to be let out.",
    ai: { archetype: 'boss', aggression: 0.9, selfPreserve: 0.35, preferredRange: 5 },
    loot: {
      gold: '5d6*20',
      table: [['battleaxe', 1.0], ['chain-mail', 0.6], ['potion-greater-healing', 1.0], ['map', 1.0], ['gem-jade', 0.5], ['goblin-totem', 0.7], ['dragon-cult-token', 0.2]],
    },
    sprite: 'bugbear', tint: '#7a2a3a', biomes: ['ruins', 'forest'], groupSize: [1, 1],
    faction: 'goblinoid', boss: true, elite: true,
  }),

  mon('glasstaff', 'Iarno "Glasstaff" Albrek', {
    title: 'Master of the Redbrands',
    desc: "A wizard the Lords' Alliance sent to Phandalin to establish order, who founded the Redbrands within a month of arriving. He wears a mask of ceramic and carries a staff of smoky glass, and he is a coward with a great deal of talent.",
    cr: 6, type: 'humanoid', subtype: 'human', size: 'medium', ac: 15, acNote: 'staff of defense',
    hpDice: '9d8+9', speed: 30, abilities: { str: 9, dex: 14, con: 12, int: 17, wis: 12, cha: 14 },
    saveProf: ['int', 'wis'], skills: { arcana: 6, deception: 5, investigation: 6 },
    senses: {}, languages: ['Common', 'Draconic', 'Dwarvish'],
    traits: [
      trait('Spellcasting', "A 6th-level wizard: magic missile, shield, charm person, misty step, hold person, suggestion and fireball, with spell save DC 14.", { passive: 'spellcasting:int:14:6' }),
      trait('Staff of Defense', "The glass staff casts mage armor and shield without expending a spell slot.", { passive: 'staff-of-defense' }),
      trait('Coward\'s Instinct', "The moment things go badly he heads for the tunnel behind the tapestry, and he has already worked out the route.", { passive: 'flees-at:25' }),
    ],
    actions: [
      melee('Quarterstaff', 2, '1d6-1', 'bludgeoning'),
      saveAct('Fireball', {
        range: 150, dice: '8d6', dtype: 'fire',
        save: { ability: 'dex', dc: 14, onSuccess: 'half' },
        target: { kind: 'sphere', radius: 20 },
        uses: { max: 1, recharge: 'long' },
        desc: "\"You should have taken the coin.\" The cellar fills with fire.",
        ai: { role: 'aoe', weight: 2.6 },
      }),
      saveAct('Magic Missile', {
        dice: '3d4+3', dtype: 'force', range: 120,
        save: null,
        uses: { max: 3, recharge: 'long' },
        desc: "Three darts of force, unerring — no attack roll, no saving throw — aimed at whoever is casting.",
        ai: { role: 'nuke', weight: 1.8 },
      }),
      saveAct('Hold Person', {
        range: 60, save: { ability: 'wis', dc: 14, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'paralyzed', duration: '1 minute' }],
        uses: { max: 2, recharge: 'long' },
        desc: "A word, a gesture, and the strongest of you is a statue in armour.",
        ai: { role: 'control', weight: 2.2 },
      }),
      util('Misty Step', {
        desc: "He blinks 30 feet through the smoke, always toward a door.",
        effects: [{ kind: 'teleport', distance: 30 }],
        ai: { role: 'utility', weight: 1.5 },
      }),
    ],
    legendary: {
      count: 3, resist: 2,
      actions: [
        legend('Cantrip', 1, "He casts ray of frost at one creature: 2d8 cold damage and its speed drops by 10 feet.", {
          kind: 'attack', dice: '2d8', dtype: 'cold', range: 60, atkBonus: 6,
          ai: { role: 'nuke', weight: 1.2 },
        }),
        legend('Shield of Glass', 1, "The staff flares and he gains 5 AC until the start of his next turn.", {
          kind: 'utility', target: { kind: 'self' }, effects: [{ kind: 'shield', ac: 5 }],
          ai: { role: 'buff', weight: 1.3 },
        }),
        legend('Call the Redbrands', 2, "He shouts down the passage and two Redbrand ruffians shoulder in.", {
          kind: 'summon', effects: [{ kind: 'summon', monsterId: 'redbrand-ruffian', count: 2 }],
          ai: { role: 'utility', weight: 1.6 },
        }),
      ],
    },
    lair: lair('Tresendar Manor Cellars', "The Redbrand hideout under the burnt manor: a workroom of alchemical glassware, a crevasse full of bones and a bolthole nobody else knows about.", [
      lairAct('Alchemical Spill', "Shelves of reagents shatter: DC 14 Dexterity save or take 2d6 acid damage.", {
        save: { ability: 'dex', dc: 14, onSuccess: 'half' }, dice: '2d6', dtype: 'acid',
      }),
      lairAct('Nothic in the Crevasse', "Something in the dark below fixes an eye on a creature: DC 14 Constitution save or take 3d6 necrotic damage.", {
        save: { ability: 'con', dc: 14, onSuccess: 'half' }, dice: '3d6', dtype: 'necrotic',
      }),
      lairAct('Douse the Lamps', "Every lamp in the cellar gutters out; the chamber is in darkness until the next lair action.", {
        effects: [{ kind: 'condition', id: 'blinded', duration: '1 round' }],
      }),
    ], { biome: 'dungeon' }),
    phases: [
      phase(60, "\"This is MY town.\" Glasstaff drops the mask; underneath, Iarno Albrek looks very ordinary and very frightened.", { passive: 'reckless' }),
      phase(25, "He bolts for the bolthole behind the tapestry, casting shield over his shoulder as he goes.", { passive: 'flees' }),
    ],
    intro: "A masked man in fine robes lowers a staff of smoky glass. \"I sent word that Phandalin was under control. You are making a liar of me.\"",
    defeat: "The glass staff cracks across the flagstones. Under the mask is a soft, clever, thoroughly ordinary face — and a letter from the Black Spider in his pocket.",
    ai: { archetype: 'boss', aggression: 0.7, selfPreserve: 0.85, preferredRange: 60 },
    loot: {
      gold: '6d6*20',
      table: [['staff-of-defense', 1.0], ['spellbook', 1.0], ['scroll-3', 1.0], ['potion-greater-healing', 0.8], ['redbrand-cloak', 0.8], ['gem-emerald', 0.4], ['clothes-fine', 0.6]],
    },
    sprite: 'wizard', tint: '#8a1a2a', biomes: ['dungeon', 'city'], groupSize: [1, 1],
    faction: 'redbrands', boss: true, elite: true,
  }),

  mon('nezznar', 'Nezznar the Black Spider', {
    title: 'Drow Mastermind',
    desc: "A drow wizard of no House worth naming, who has spent years assembling the pieces of Wave Echo Cave: the map, the Rockseekers, the Redbrands, and a bodyguard of bugbears. He wants the Forge of Spells and he will burn Phandalin to get it.",
    cr: 8, type: 'humanoid', subtype: 'elf', size: 'medium', ac: 16, acNote: 'mage armor',
    hpDice: '12d8+24', speed: 30, abilities: { str: 10, dex: 16, con: 14, int: 18, wis: 13, cha: 15 },
    saveProf: ['int', 'wis'], skills: { arcana: 8, deception: 5, perception: 4, stealth: 7 },
    senses: { darkvision: 120 }, languages: ['Common', 'Elvish', 'Undercommon', 'Dwarvish'],
    traits: [
      T_FEY_ANCESTRY,
      T_SUNLIGHT_SENS,
      legendaryResistance(2),
      trait('Spellcasting', "A 9th-level wizard: magic missile, shield, web, misty step, lightning bolt, greater invisibility and cloudkill, with spell save DC 16.", { passive: 'spellcasting:int:16:9' }),
      trait('Spider Staff', "His staff is carved as a spider; it casts web and summons giant spiders to his side.", { passive: 'spider-staff' }),
    ],
    actions: [
      multi("He strikes with the staff and casts.", [['spider-staff', 1]]),
      melee('Spider Staff', 6, '1d6+3', 'bludgeoning', { effects: [{ kind: 'damage', dice: '2d6', type: 'poison' }] }),
      saveAct('Lightning Bolt', {
        range: 100, dice: '8d6', dtype: 'lightning',
        save: { ability: 'dex', dc: 16, onSuccess: 'half' },
        target: { kind: 'line', length: 100, width: 5 },
        uses: { max: 2, recharge: 'long' },
        desc: "The cavern lights up violet from wall to wall.",
        ai: { role: 'aoe', weight: 2.4 },
      }),
      saveAct('Web', {
        range: 60, save: { ability: 'dex', dc: 16, onSuccess: 'negate' },
        target: { kind: 'cube', length: 20 },
        effects: [{ kind: 'condition', id: 'restrained', duration: '1 hour' }],
        uses: { max: 2, recharge: 'short' },
        desc: "Cords of grey web spring between the pillars of the Forge.",
        ai: { role: 'control', weight: 2 },
      }),
      util('Summon Spiders', {
        uses: { max: 2, recharge: 'long' },
        desc: "He strikes the staff on the stone and giant spiders pour out of the dark.",
        effects: [{ kind: 'summon', monsterId: 'giant-spider', count: 2 }],
        ai: { role: 'utility', weight: 1.9 },
      }),
    ],
    legendary: {
      count: 3, resist: 2,
      actions: [
        legend('Staff Strike', 1, "Nezznar makes one spider staff attack.", { ref: 'spider-staff', ai: { role: 'nuke', weight: 1.1 } }),
        legend('Faerie Fire', 1, "Cold violet light outlines one creature; attacks against it have advantage until the end of his next turn.", {
          kind: 'save', range: 60, save: { ability: 'dex', dc: 16, onSuccess: 'negate' },
          effects: [{ kind: 'condition', id: 'marked', duration: '1 round' }],
          ai: { role: 'debuff', weight: 1.4 },
        }),
        legend('Darkness and Step', 2, "Magical darkness swallows his corner of the cavern and he steps 30 feet through it.", {
          kind: 'utility', target: { kind: 'self' },
          effects: [{ kind: 'teleport', distance: 30 }, { kind: 'buff', id: 'obscured', duration: '1 round' }],
          ai: { role: 'utility', weight: 1.5 },
        }),
      ],
    },
    lair: lair('The Forge of Spells', "The heart of Wave Echo Cave: a ruined magical forge over a fissure of old magic, the air ringing faintly with every hammer-blow struck here five centuries ago.",[
      lairAct('Wild Magic Surge', "The Forge sputters and raw magic lashes out: DC 16 Dexterity save or take 3d8 force damage.", {
        save: { ability: 'dex', dc: 16, onSuccess: 'half' }, dice: '3d8', dtype: 'force',
      }),
      lairAct('Webbed Gallery', "Webs spring across the gallery: DC 16 Dexterity save or be restrained until the next lair action.", {
        save: { ability: 'dex', dc: 16, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'restrained', duration: '1 round' }],
      }),
      lairAct('Echoing Hammer', "The cave booms with the ghost of the old forge-hammer: DC 16 Constitution save or take 2d6 thunder damage and be deafened.", {
        save: { ability: 'con', dc: 16, onSuccess: 'half' }, dice: '2d6', dtype: 'thunder',
        effects: [{ kind: 'condition', id: 'deafened', duration: '1 round' }],
      }),
    ], { biome: 'mine' }),
    phases: [
      phase(70, "\"The Forge is mine by right of patience.\" He turns invisible and the spiders come first.", { passive: 'invisible' }),
      phase(35, "Nezznar stops pretending to be careful. The staff blazes and every web in the cavern draws tight.", { passive: 'reckless' }),
    ],
    intro: "A slender drow steps out of the dark beside the Forge, spider-carved staff in hand. \"You have been very useful. Set down the map and I will make your deaths quick.\"",
    defeat: "The Black Spider folds up around his broken staff. \"...five years... of work...\" The Forge of Spells hums on, indifferent.",
    ai: { archetype: 'boss', aggression: 0.75, selfPreserve: 0.7, preferredRange: 60 },
    loot: {
      gold: '8d6*30',
      table: [['spider-staff', 1.0], ['spellbook', 1.0], ['scroll-5', 1.0], ['potion-superior-healing', 1.0], ['gem-black-pearl', 0.8], ['cloak-of-elvenkind', 0.35], ['silver-ore-wave-echo', 0.6]],
    },
    sprite: 'drow', tint: '#2a1a3a', biomes: ['mine', 'underdark', 'cave'], groupSize: [1, 1],
    faction: 'drow', boss: true, elite: true,
  }),

  mon('venomfang', 'Venomfang', {
    title: 'The Green of Thundertree',
    desc: "A young green dragon that took the ruined wizard's tower in Thundertree as a starter lair, and now considers the whole ash-choked village its own. It is clever, patient and utterly convinced of its future greatness.",
    cr: 8, type: 'dragon', subtype: 'green', size: 'large', ac: 18, acNote: 'natural armor',
    hpDice: '16d10+48', speed: 40, fly: 80, swim: 40,
    abilities: { str: 19, dex: 12, con: 19, int: 16, wis: 13, cha: 15 },
    saveProf: ['dex', 'con', 'wis', 'cha'], skills: { deception: 5, perception: 7, persuasion: 5, stealth: 4 },
    immune: ['poison'], condImmune: ['poisoned'],
    senses: { blindsight: 30, darkvision: 120 }, languages: ['Common', 'Draconic'],
    traits: [
      legendaryResistance(2),
      trait('Silver Tongue', "It would rather recruit you than eat you, and it is good enough at it that people have said yes.", { passive: 'silver-tongue' }),
    ],
    actions: [
      multi("It bites once and claws twice.", [['bite', 1], ['claw', 2]]),
      melee('Bite', 7, '2d10+4', 'piercing', { reach: 10, effects: [{ kind: 'damage', dice: '2d6', type: 'poison' }] }),
      melee('Claw', 7, '2d6+4', 'slashing'),
      saveAct('Poison Breath', {
        id: 'breath-weapon', dice: '12d6', dtype: 'poison',
        save: { ability: 'con', dc: 14, onSuccess: 'half' },
        target: { kind: 'cone', length: 30 },
        uses: { max: 1, recharge: '5-6' },
        desc: "A 30-foot cone of green gas rolls down the tower stair.",
        ai: { role: 'aoe', weight: 2.8 },
      }),
      saveAct('Frightful Presence', {
        range: 60, save: { ability: 'wis', dc: 13, onSuccess: 'negate' },
        target: { kind: 'sphere', radius: 60 },
        effects: [{ kind: 'condition', id: 'frightened', duration: '1 minute' }],
        desc: "It fills the broken tower and looks at you the way a cat looks at a moth.",
        ai: { role: 'debuff', weight: 1.6 },
      }),
    ],
    legendary: {
      count: 3, resist: 2,
      actions: [
        legend('Detect', 1, "It scents the air; nothing hidden in the tower stays hidden.", { kind: 'utility', target: { kind: 'self' }, ai: { role: 'utility', weight: 0.6 } }),
        legend('Tail Attack', 1, "It lashes with its tail: +7 to hit, 2d8+4 bludgeoning.", {
          kind: 'attack', atkBonus: 7, dice: '2d8+4', dtype: 'bludgeoning', reach: 10,
          ai: { role: 'nuke', weight: 1.2 },
        }),
        legend('Wing Attack', 2, "It beats its wings: creatures within 10 feet take 2d6+4 bludgeoning damage and fall prone on a failed DC 15 Dexterity save, then it flies half its speed.", {
          kind: 'save', dice: '2d6+4', dtype: 'bludgeoning',
          save: { ability: 'dex', dc: 15, onSuccess: 'negate' },
          target: { kind: 'sphere', radius: 10 },
          effects: [{ kind: 'condition', id: 'prone' }],
          ai: { role: 'aoe', weight: 1.7 },
        }),
      ],
    },
    lair: lair('The Thundertree Tower', "The shattered top floor of a wizard's tower in an ash-buried village, the floor littered with twig blight husks and scorched masonry.", [
      lairAct('Falling Masonry', "The tower sheds another course of stone: DC 14 Dexterity save or take 2d10 bludgeoning damage.", {
        save: { ability: 'dex', dc: 14, onSuccess: 'half' }, dice: '2d10', dtype: 'bludgeoning',
      }),
      lairAct('Ash Cloud', "Volcanic ash boils up from the floor, blinding everything in a 20-foot radius until the next lair action.", {
        save: { ability: 'con', dc: 14, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'blinded', duration: '1 round' }],
      }),
      lairAct('Twig Blights', "Three twig blights scuttle up through the rubble at the dragon's word.", {
        kind: 'summon', effects: [{ kind: 'summon', monsterId: 'twig-blight', count: 3 }],
      }),
    ], { biome: 'ruins' }),
    phases: [
      phase(65, "\"You are stubborn. I respect that. It will not save you.\" It takes to the air and fights from above.", { passive: 'airborne' }),
      phase(30, "The dragon stops talking. Whatever charm it had is gone; there is only the green and the gas.", { passive: 'reckless' }),
    ],
    intro: "Green wings unfold above the broken tower. \"Visitors. Have you come to serve, or to be eaten?\"",
    defeat: "Venomfang crashes through the tower's remaining floor and does not get up. Thundertree's ash settles slowly over green scales.",
    ai: { archetype: 'boss', aggression: 0.85, selfPreserve: 1, preferredRange: 30 },
    loot: {
      gold: '6d10*20',
      table: [['gem-emerald', 1.0], ['gem-jade', 1.0], ['scroll-4', 1.0], ['potion-superior-healing', 0.8], ['dragonguard', 0.2], ['dragon-cult-token', 0.5], ['ring-of-resistance-poison', 0.2]],
    },
    sprite: 'dragon', tint: '#3a6a3a', biomes: ['ruins', 'pine-forest'], groupSize: [1, 1],
    faction: 'dragon', boss: true, elite: true,
  }),

  mon('cryovain', 'Cryovain', {
    title: 'The White of Icespire Peak',
    desc: "A young white dragon that came down off Icespire Peak and made the whole Sword Mountains its hunting range. It is not clever. It is fast, cold, permanently hungry and it holds grudges for years.",
    cr: 7, type: 'dragon', subtype: 'white', size: 'large', ac: 17, acNote: 'natural armor',
    hpDice: '17d10+51', speed: 40, fly: 80, burrow: 20,
    abilities: { str: 18, dex: 10, con: 18, int: 6, wis: 11, cha: 12 },
    saveProf: ['dex', 'con', 'wis', 'cha'], skills: { perception: 6, stealth: 3 },
    immune: ['cold'], senses: { blindsight: 30, darkvision: 120 }, languages: ['Common', 'Draconic'],
    traits: [
      legendaryResistance(2),
      T_SNOW_CAMO,
      trait('Ice Walk', "It moves across ice and deep snow without slowing and without leaving tracks it does not want left.", { passive: 'ice-walk' }),
    ],
    actions: [
      multi("It bites once and claws twice.", [['bite', 1], ['claw', 2]]),
      melee('Bite', 7, '2d10+4', 'piercing', { reach: 10, effects: [{ kind: 'damage', dice: '1d8', type: 'cold' }] }),
      melee('Claw', 7, '2d6+4', 'slashing'),
      saveAct('Cold Breath', {
        id: 'breath-weapon', dice: '10d8', dtype: 'cold',
        save: { ability: 'con', dc: 15, onSuccess: 'half' },
        target: { kind: 'cone', length: 30 },
        uses: { max: 1, recharge: '5-6' },
        desc: "A 30-foot cone of glacial cold that frosts armour to the skin.",
        ai: { role: 'aoe', weight: 2.8 },
      }),
      saveAct('Frightful Presence', {
        range: 60, save: { ability: 'wis', dc: 13, onSuccess: 'negate' },
        target: { kind: 'sphere', radius: 60 },
        effects: [{ kind: 'condition', id: 'frightened', duration: '1 minute' }],
        desc: "It screams down out of the cloud and the mountain answers.",
        ai: { role: 'debuff', weight: 1.6 },
      }),
    ],
    legendary: {
      count: 3, resist: 2,
      actions: [
        legend('Detect', 1, "It casts about for the smell of blood on the wind.", { kind: 'utility', target: { kind: 'self' }, ai: { role: 'utility', weight: 0.6 } }),
        legend('Tail Attack', 1, "It lashes with its tail: +7 to hit, 2d8+4 bludgeoning.", {
          kind: 'attack', atkBonus: 7, dice: '2d8+4', dtype: 'bludgeoning', reach: 10,
          ai: { role: 'nuke', weight: 1.2 },
        }),
        legend('Freezing Wing Beat', 2, "It beats its wings and drives a wall of snow outward: creatures within 10 feet take 2d6+4 cold damage and fall prone on a failed DC 15 Dexterity save.", {
          kind: 'save', dice: '2d6+4', dtype: 'cold',
          save: { ability: 'dex', dc: 15, onSuccess: 'negate' },
          target: { kind: 'sphere', radius: 10 },
          effects: [{ kind: 'condition', id: 'prone' }],
          ai: { role: 'aoe', weight: 1.8 },
        }),
      ],
    },
    lair: lair('Icespire Peak', "A wind-scoured shelf near the summit, littered with frozen carcasses — griffons, goats, two prospectors and a mule.", [
      lairAct('Avalanche', "Snow comes off the shoulder of the peak: DC 15 Dexterity save or take 3d6 bludgeoning damage and be knocked prone.", {
        save: { ability: 'dex', dc: 15, onSuccess: 'half' }, dice: '3d6', dtype: 'bludgeoning',
        effects: [{ kind: 'condition', id: 'prone' }],
      }),
      lairAct('Whiteout', "A squall of driving snow blinds everything in a 20-foot radius until the next lair action.", {
        save: { ability: 'con', dc: 15, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'blinded', duration: '1 round' }],
      }),
      lairAct('Black Ice', "The shelf glazes over: DC 15 Dexterity save or fall prone and slide 10 feet toward the drop.", {
        save: { ability: 'dex', dc: 15, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'prone' }],
      }),
    ], { biome: 'tundra' }),
    phases: [
      phase(60, "Cryovain takes wing and starts making passes, breathing on the way through.", { passive: 'airborne' }),
      phase(25, "Wounded and furious, it lands between you and the drop and stops being careful entirely.", { passive: 'reckless' }),
    ],
    intro: "A shadow crosses the snowfield twice before the shrieking starts. Cryovain lands on the shelf above you, ice cracking off its wings, and does not bother to speak.",
    defeat: "The white dragon slides off the shelf in a wash of snow and is still. The Sword Mountains are quiet for the first time in a year.",
    ai: { archetype: 'boss', aggression: 0.9, selfPreserve: 0.4, preferredRange: 30 },
    loot: {
      gold: '6d10*20',
      table: [['gem-moonstone', 1.0], ['gem-diamond', 0.3], ['potion-superior-healing', 0.8], ['ring-of-warmth', 0.35], ['scroll-4', 0.6], ['ring-of-resistance-cold', 0.2], ['platinum-ingot', 0.4]],
    },
    sprite: 'dragon', tint: '#dbeaf5', biomes: ['tundra', 'mountain'], groupSize: [1, 1],
    faction: 'dragon', boss: true, elite: true,
  }),

  mon('agatha', 'Agatha', {
    title: 'The Banshee of Conyberry',
    desc: "Once an elf noble of a wood that no longer exists, now a green-lit shape in the ruins near Conyberry. She answers one question truthfully for anyone who brings her a gift worthy of her vanity — and kills anyone who does not.",
    cr: 6, type: 'undead', size: 'medium', ac: 14, hpDice: '14d8+14',
    speed: 0, fly: 40, hover: true, abilities: { str: 1, dex: 16, con: 12, int: 13, wis: 12, cha: 18 },
    saveProf: ['wis', 'cha'],
    resist: ['acid', 'fire', 'lightning', 'thunder', 'bludgeoning-nonmagical', 'piercing-nonmagical', 'slashing-nonmagical'],
    immune: ['cold', 'necrotic', 'poison'],
    condImmune: ['charmed', 'exhaustion', 'frightened', 'grappled', 'paralyzed', 'petrified', 'poisoned', 'prone', 'restrained'],
    senses: { darkvision: 60 }, languages: ['Common', 'Elvish'],
    traits: [
      T_UNDEAD_NATURE,
      T_INCORPOREAL,
      legendaryResistance(2),
      trait('Detect Life', "She knows every living thing within five miles and precisely where it stands.", { passive: 'detect-life:5mi' }),
      trait('Vanity', "A gift of jewellery or a comb of silver will buy one truthful answer. Insult her and nothing will.", { passive: 'appeasable' }),
    ],
    actions: [
      melee('Corrupting Touch', 6, '4d6+3', 'necrotic'),
      saveAct('Horrifying Visage', {
        range: 60, save: { ability: 'wis', dc: 14, onSuccess: 'negate' },
        target: { kind: 'cone', length: 60 },
        effects: [{ kind: 'condition', id: 'frightened', duration: '1 minute' }],
        desc: "For a moment you see what she looked like when the elves left her behind.",
        ai: { role: 'debuff', weight: 1.8 },
      }),
      saveAct('Wail', {
        range: 30, save: { ability: 'con', dc: 14, onSuccess: 'negate' },
        target: { kind: 'sphere', radius: 30 },
        effects: [{ kind: 'condition', id: 'dying', duration: 'instant' }],
        uses: { max: 1, recharge: 'long' },
        desc: "One shriek of pure grief. Every living creature within 30 feet that can hear it drops to 0 hit points on a failed save.",
        ai: { role: 'nuke', weight: 2.9 },
      }),
    ],
    legendary: {
      count: 3, resist: 2,
      actions: [
        legend('Drift', 1, "She glides up to her speed through the ruins, walls included.", { kind: 'utility', target: { kind: 'self' }, ai: { role: 'utility', weight: 0.7 } }),
        legend('Corrupting Touch', 2, "She makes one corrupting touch attack.", { ref: 'corrupting-touch', ai: { role: 'nuke', weight: 1.5 } }),
        legend('Keening', 2, "A low keening fills the grove: each creature within 20 feet takes 2d6 psychic damage on a failed DC 14 Wisdom save.", {
          kind: 'save', dice: '2d6', dtype: 'psychic',
          save: { ability: 'wis', dc: 14, onSuccess: 'half' },
          target: { kind: 'sphere', radius: 20 },
          ai: { role: 'aoe', weight: 1.6 },
        }),
      ],
    },
    lair: lair('Agatha\'s Grove', "A hollow of dead birches outside ruined Conyberry, where the grass grows in a perfect circle and nothing nests.", [
      lairAct('Grasping Roots', "Dead roots heave up: DC 14 Strength save or be restrained until the next lair action.", {
        save: { ability: 'str', dc: 14, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'restrained', duration: '1 round' }],
      }),
      lairAct('Grave Chill', "The temperature drops sharply: DC 14 Constitution save or take 2d8 cold damage.", {
        save: { ability: 'con', dc: 14, onSuccess: 'half' }, dice: '2d8', dtype: 'cold',
      }),
      lairAct('Elven Lament', "The grove repeats a name in Elvish nobody living remembers: DC 14 Wisdom save or be frightened until the next lair action.", {
        save: { ability: 'wis', dc: 14, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'frightened', duration: '1 round' }],
      }),
    ], { biome: 'forest' }),
    phases: [
      phase(50, "\"You bring me NOTHING?\" The grove goes black and the birches bend away from her.", { passive: 'enraged' }),
      phase(20, "Her form frays at the edges, and the wail builds again in her throat.", { passive: 'recharge-wail' }),
    ],
    intro: "Green light gathers between the dead birches and becomes a woman who was beautiful several centuries ago. \"Speak, and be brief. And if you have brought me nothing — do not speak at all.\"",
    defeat: "Agatha's light goes out like a snuffed candle, and for a moment the grove smells of an elven wood that has not existed for four hundred years.",
    ai: { archetype: 'boss', aggression: 0.7, selfPreserve: 0.5, preferredRange: 20 },
    loot: {
      gold: '5d10*10',
      table: [['gem-pearl', 1.0], ['gem-moonstone', 1.0], ['scroll-4', 0.7], ['cloak-of-elvenkind', 0.25], ['gem-emerald', 0.4], ['clothes-fine', 0.5]],
    },
    sprite: 'banshee', tint: '#7adba8', biomes: ['ruins', 'forest'], groupSize: [1, 1],
    faction: 'undead', boss: true, elite: true,
  }),

  mon('hamun-kost', 'Hamun Kost', {
    title: 'Red Wizard of Thay',
    desc: "A Thayan necromancer excavating Old Owl Well for a Netherese relic, with a pair of zombies who used to be his porters. He is courteous, businesslike and entirely willing to add you to the workforce.",
    cr: 6, type: 'humanoid', subtype: 'human', size: 'medium', ac: 13, acNote: 'mage armor',
    hpDice: '10d8+20', speed: 30, abilities: { str: 10, dex: 14, con: 15, int: 17, wis: 12, cha: 13 },
    saveProf: ['int', 'wis'], skills: { arcana: 7, history: 7, religion: 5 },
    senses: {}, languages: ['Common', 'Thayan', 'Draconic', 'Netherese'],
    traits: [
      legendaryResistance(2),
      trait('Spellcasting', "A 9th-level necromancer: chill touch, ray of sickness, false life, blindness, animate dead, vampiric touch and cloudkill, with spell save DC 15.", { passive: 'spellcasting:int:15:9' }),
      trait('Grim Harvest', "When one of his spells kills a creature, he regains hit points equal to twice the spell's level.", { passive: 'grim-harvest' }),
    ],
    actions: [
      melee('Dagger', 5, '1d4+2', 'piercing'),
      util('Vampiric Touch', {
        kind: 'attack', atkBonus: 7, dice: '3d6', dtype: 'necrotic', reach: 5,
        desc: "He takes the life out of you and puts it into himself.",
        effects: [{ kind: 'heal', dice: '3d6' }],
        ai: { role: 'nuke', weight: 2 },
      }),
      saveAct('Cloudkill', {
        range: 120, dice: '5d8', dtype: 'poison',
        save: { ability: 'con', dc: 15, onSuccess: 'half' },
        target: { kind: 'sphere', radius: 20 },
        uses: { max: 1, recharge: 'long' },
        desc: "Yellow-green fog spills across the excavation and rolls into the trenches.",
        ai: { role: 'aoe', weight: 2.5 },
      }),
      util('Animate Dead', {
        uses: { max: 2, recharge: 'long' },
        desc: "He raises the fallen — his porters, or yours — as zombies.",
        effects: [{ kind: 'summon', monsterId: 'zombie', count: 2 }],
        ai: { role: 'utility', weight: 2 },
      }),
    ],
    legendary: {
      count: 3, resist: 2,
      actions: [
        legend('Chill Touch', 1, "A skeletal hand closes on one creature within 120 feet: 2d8 necrotic damage and it cannot regain hit points until the end of his next turn.", {
          kind: 'attack', atkBonus: 7, dice: '2d8', dtype: 'necrotic', range: 120,
          ai: { role: 'nuke', weight: 1.4 },
        }),
        legend('Command the Dead', 1, "One undead he controls moves half its speed and attacks.", {
          kind: 'utility', range: 60, target: { kind: 'creature', count: 1, allowAllies: true },
          ai: { role: 'support', weight: 1.3 },
        }),
        legend('Necrotic Pulse', 2, "Grave-cold rolls out in a 15-foot radius: 3d6 necrotic damage, half on a DC 15 Constitution save.", {
          kind: 'save', dice: '3d6', dtype: 'necrotic',
          save: { ability: 'con', dc: 15, onSuccess: 'half' },
          target: { kind: 'sphere', radius: 15 },
          ai: { role: 'aoe', weight: 1.8 },
        }),
      ],
    },
    lair: lair('Old Owl Well', "A Netherese ruin on the northern moor, half-excavated, a Thayan tent pitched among the broken columns and trenches full of tools.", [
      lairAct('Open Trench', "The excavation gives way: DC 15 Dexterity save or fall 10 feet, taking 2d6 bludgeoning damage and landing prone.", {
        save: { ability: 'dex', dc: 15, onSuccess: 'negate' }, dice: '2d6', dtype: 'bludgeoning',
        effects: [{ kind: 'condition', id: 'prone' }],
      }),
      lairAct('Netherese Ward', "A buried ward flares: DC 15 Intelligence save or take 3d6 force damage.", {
        save: { ability: 'int', dc: 15, onSuccess: 'half' }, dice: '3d6', dtype: 'force',
      }),
      lairAct('The Diggers Rise', "Two zombies claw their way out of the spoil heaps.", {
        kind: 'summon', effects: [{ kind: 'summon', monsterId: 'zombie', count: 2 }],
      }),
    ], { biome: 'ruins' }),
    phases: [
      phase(55, "\"You are costing me daylight.\" Kost raises every corpse on the site at once.", { passive: 'mass-animate' }),
      phase(25, "He abandons the dig, wraps himself in false life and fights like a man with nothing left to lose.", { passive: 'temphp:25' }),
    ],
    intro: "A shaven-headed man in red robes looks up from a trench, tattoos crawling across his scalp. \"Thay has claim here. Leave, or join the work crew. I am indifferent which.\"",
    defeat: "Kost falls into his own excavation. The zombies stop where they stand, and the moor is silent except for the wind through Old Owl Well.",
    ai: { archetype: 'boss', aggression: 0.7, selfPreserve: 0.7, preferredRange: 60 },
    loot: {
      gold: '6d10*15',
      table: [['spellbook', 1.0], ['scroll-5', 1.0], ['potion-greater-healing', 0.8], ['gem-onyx', 1.0], ['ring-of-mind-shielding', 0.2], ['robe', 0.5], ['scroll-revivify', 0.3]],
    },
    sprite: 'wizard', tint: '#b03030', biomes: ['ruins', 'plains'], groupSize: [1, 1],
    faction: 'zhentarim', boss: true, elite: true,
  }),

  mon('mormesk', 'Mormesk the Wraith', {
    title: 'The Miner-Lord of Wave Echo Cave',
    desc: "A mage who died when the Forge of Spells was broken five hundred years ago and refused to let go of his claim. He haunts the flooded galleries of Wave Echo Cave and counts the ore over and over.",
    cr: 7, type: 'undead', size: 'medium', ac: 14, hpDice: '13d8+39',
    speed: 0, fly: 60, hover: true, abilities: { str: 6, dex: 16, con: 16, int: 14, wis: 14, cha: 17 },
    saveProf: ['wis', 'cha'],
    resist: ['acid', 'cold', 'fire', 'lightning', 'thunder', 'bludgeoning-nonmagical', 'piercing-nonmagical', 'slashing-nonmagical'],
    immune: ['necrotic', 'poison'],
    condImmune: ['charmed', 'exhaustion', 'grappled', 'paralyzed', 'petrified', 'poisoned', 'prone', 'restrained'],
    senses: { darkvision: 60 }, languages: ['Common', 'Dwarvish'],
    traits: [
      T_UNDEAD_NATURE,
      T_INCORPOREAL,
      T_SUNLIGHT_SENS,
      legendaryResistance(2),
      trait('Claim Unbroken', "It cannot leave the workings of Wave Echo Cave, and it will not be argued with about the boundary.", { passive: 'bound-lair' }),
    ],
    actions: [
      multi("It drains the life from one creature and calls its specters forward.", [['life-drain', 1]]),
      melee('Life Drain', 7, '4d8+3', 'necrotic', {
        save: { ability: 'con', dc: 15, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'max-hp-drain', duration: 'until long rest' }],
        desc: "DC 15 Constitution save or the target's hit point maximum falls by the damage taken.",
      }),
      util('Create Specter', {
        uses: { max: 2, recharge: 'long' },
        desc: "It calls the soul of a recent corpse back into a specter bound to the mine.",
        effects: [{ kind: 'summon', monsterId: 'specter', count: 2 }],
        ai: { role: 'utility', weight: 1.8 },
      }),
      saveAct('Toll of the Deep', {
        range: 30, dice: '4d8', dtype: 'necrotic',
        save: { ability: 'wis', dc: 15, onSuccess: 'half' },
        target: { kind: 'sphere', radius: 30 },
        uses: { max: 1, recharge: '5-6' },
        desc: "The cave repeats its old hammer-echo and the sound goes straight through the living.",
        ai: { role: 'aoe', weight: 2.2 },
      }),
    ],
    legendary: {
      count: 3, resist: 2,
      actions: [
        legend('Phase', 1, "It slides through the rock and reappears up to 30 feet away.", {
          kind: 'utility', target: { kind: 'self' }, effects: [{ kind: 'teleport', distance: 30 }],
          ai: { role: 'utility', weight: 1 },
        }),
        legend('Life Drain', 2, "It makes one life drain attack.", { ref: 'life-drain', ai: { role: 'nuke', weight: 1.7 } }),
        legend('Grasp of the Dead', 2, "Dead miners' hands rise around one creature: DC 15 Strength save or be restrained until the end of its next turn.", {
          kind: 'save', range: 60, save: { ability: 'str', dc: 15, onSuccess: 'negate' },
          effects: [{ kind: 'condition', id: 'restrained', duration: '1 round' }],
          ai: { role: 'control', weight: 1.4 },
        }),
      ],
    },
    lair: lair('Wave Echo Cave', "Flooded galleries where the sound of the ancient forge-hammer still rolls through the rock every few minutes, and the ore glitters unmined.", [
      lairAct('The Wave Echo', "The old hammer-beat rolls through the stone: DC 15 Constitution save or take 2d8 thunder damage and be deafened until the next lair action.", {
        save: { ability: 'con', dc: 15, onSuccess: 'half' }, dice: '2d8', dtype: 'thunder',
        effects: [{ kind: 'condition', id: 'deafened', duration: '1 round' }],
      }),
      lairAct('Flooded Drift', "Black water surges up the drift: DC 15 Strength save or be swept 15 feet and knocked prone.", {
        save: { ability: 'str', dc: 15, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'prone' }],
      }),
      lairAct('The Dead Shift', "Two skeletons of the old mining crew shoulder out of a collapsed gallery.", {
        kind: 'summon', effects: [{ kind: 'summon', monsterId: 'skeleton', count: 2 }],
      }),
    ], { biome: 'mine' }),
    phases: [
      phase(60, "\"MINE. The vein is MINE.\" The temperature drops and every lamp in the gallery burns blue.", { passive: 'enraged' }),
      phase(25, "It pours itself into the rock and comes out of the ceiling, dragging specters with it.", { passive: 'summon-ally' }),
    ],
    intro: "The lamplight turns blue. A shape of dust and old malice rises out of the ore face. \"THIEVES. Five hundred years and still they come for MY vein.\"",
    defeat: "Mormesk unravels into cold dust over the ore, and the wave echo rolls through the cave one more time — and then, for the first time in five centuries, does not come back.",
    ai: { archetype: 'boss', aggression: 0.85, selfPreserve: 0.4, preferredRange: 10 },
    loot: {
      gold: '6d10*15',
      table: [['silver-ore-wave-echo', 1.0], ['gem-onyx', 1.0], ['scroll-5', 0.7], ['lightbringer', 0.15], ['potion-superior-healing', 0.7], ['gem-black-pearl', 0.4], ['ore-sample-phandalin', 0.8]],
    },
    sprite: 'wraith', tint: '#5a7a8a', biomes: ['mine', 'cave'], groupSize: [1, 1],
    faction: 'undead', boss: true, elite: true,
  }),
);

BOSS_LIST.push(
  mon('nars-dendrar', 'Nars Dendrar, the Unquiet', {
    title: 'The Revenant of Phandalin',
    desc: "A Phandalin woodcarver the Redbrands hanged for standing between them and his wife. Kelemvor's summons went unanswered; what walked back out of the shallow grave beyond the Sleeping Giant still has one year and one purpose.",
    cr: 6, type: 'undead', size: 'medium', ac: 14, acNote: 'leather armor',
    hpDice: '20d8+60', speed: 30, abilities: { str: 18, dex: 14, con: 18, int: 12, wis: 16, cha: 18 },
    saveProf: ['str', 'con', 'wis', 'cha'],
    resist: ['necrotic', 'psychic'], immune: ['poison'],
    condImmune: ['charmed', 'exhaustion', 'frightened', 'paralyzed', 'poisoned', 'stunned'],
    senses: { darkvision: 60 }, languages: ['Common'],
    traits: [
      T_UNDEAD_NATURE,
      legendaryResistance(2),
      T_TURN_IMMUNE,
      trait('Regeneration', "It regains 10 hit points at the start of its turn; destroyed, it re-forms in 24 hours until the last Redbrand is dead.", { passive: 'regeneration:10:none' }),
      trait('Vengeful Tracker', "It knows the direction and distance to every man who wore a scarlet cloak that night.", { passive: 'vengeful-tracker' }),
      trait('It Knows Your Face', "It will not strike a citizen of Phandalin, no matter what is done to it.", { passive: 'spares-innocents' }),
    ],
    actions: [
      multi("It makes two attacks with the carving mallet.", [['mallet', 2]]),
      melee('Carving Mallet', 8, '2d6+4', 'bludgeoning', {
        effects: [{ kind: 'damage', dice: '4d6', type: 'bludgeoning', condition: 'sworn-foe' }],
        desc: "Against a Redbrand or its master the blow lands with the weight of a whole year of grave-cold patience.",
      }),
      saveAct('Vengeful Glare', {
        range: 30, save: { ability: 'wis', dc: 16, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'paralyzed', duration: '1 minute' }, { kind: 'condition', id: 'frightened', duration: '1 minute' }],
        desc: "It looks at you with a dead man's patience and you cannot make your legs work.",
        ai: { role: 'control', weight: 2 },
      }),
    ],
    legendary: {
      count: 3, resist: 2,
      actions: [
        legend('Relentless Step', 1, "It walks toward its foe up to its speed; opportunity attacks against it are made with disadvantage.", { kind: 'utility', target: { kind: 'self' }, ai: { role: 'utility', weight: 0.9 } }),
        legend('Mallet Blow', 1, "It makes one carving mallet attack.", { ref: 'carving-mallet', ai: { role: 'nuke', weight: 1.4 } }),
        legend('The Debt Called', 2, "It names a crime aloud: one creature that hears must make a DC 16 Wisdom save or take 3d8 psychic damage and be frightened until the end of its next turn.", {
          kind: 'save', dice: '3d8', dtype: 'psychic', range: 60,
          save: { ability: 'wis', dc: 16, onSuccess: 'half' },
          effects: [{ kind: 'condition', id: 'frightened', duration: '1 round' }],
          ai: { role: 'debuff', weight: 1.6 },
        }),
      ],
    },
    lair: lair('The Hanging Tree', "The scrub oak on the rise behind Tresendar Manor where the Redbrands did their work, and the shallow ground beneath it.", [
      lairAct('Grave Soil', "The turned earth grips at boots: DC 15 Strength save or be restrained until the next lair action.", {
        save: { ability: 'str', dc: 15, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'restrained', duration: '1 round' }],
      }),
      lairAct('The Rope Remembers', "A creaking rope swings out of nothing: DC 15 Dexterity save or take 2d8 bludgeoning damage.", {
        save: { ability: 'dex', dc: 15, onSuccess: 'half' }, dice: '2d8', dtype: 'bludgeoning',
      }),
      lairAct('Mirna\'s Voice', "Someone is weeping in the dark and it sounds like a wife: DC 15 Wisdom save or be frightened until the next lair action.", {
        save: { ability: 'wis', dc: 15, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'frightened', duration: '1 round' }],
      }),
    ], { biome: 'ruins' }),
    phases: [
      phase(50, "It stops defending itself entirely. Blows land and it simply keeps walking forward.", { passive: 'reckless' }),
      phase(20, "\"NOT... FINISHED.\" The wounds close as fast as they open.", { passive: 'regeneration:20:none' }),
    ],
    intro: "The dead man from the rise behind Tresendar Manor sets down his carving mallet, then picks it up again. \"You wore the red cloak. I remember the red cloak.\"",
    defeat: "The revenant sinks to its knees and, at last, looks relieved. \"Tell Mirna... it is done.\" What is left of Nars Dendrar goes quietly into the ground.",
    ai: { archetype: 'boss', aggression: 0.95, selfPreserve: 0.05, preferredRange: 5 },
    loot: {
      gold: '3d10*10',
      table: [['woodcarvers-tools', 1.0], ['signet-ring', 1.0], ['potion-greater-healing', 0.6], ['gem-amber', 0.5], ['redbrand-cloak', 0.5]],
    },
    sprite: 'revenant', tint: '#6a5a4a', biomes: ['ruins', 'city'], groupSize: [1, 1],
    faction: 'undead', boss: true, elite: true,
  }),

  mon('claugiyliamatar', 'Claugiyliamatar', {
    title: 'Old Gnawbone, the Green of Kryptgarden',
    desc: "The adult green dragon of Kryptgarden Forest, called Old Gnawbone for the bones she wears woven into her hide. She runs a network of informants from Waterdeep to Neverwinter and has outlived three men who thought they were using her.",
    cr: 15, type: 'dragon', subtype: 'green', size: 'huge', ac: 19, acNote: 'natural armor',
    hpDice: '18d12+90', speed: 40, fly: 80, swim: 40,
    abilities: { str: 23, dex: 12, con: 21, int: 18, wis: 15, cha: 17 },
    saveProf: ['dex', 'con', 'wis', 'cha'],
    skills: { deception: 8, insight: 7, perception: 12, persuasion: 8, stealth: 6 },
    immune: ['poison'], condImmune: ['poisoned'],
    senses: { blindsight: 60, darkvision: 120 }, languages: ['Common', 'Draconic', 'Elvish', 'Dwarvish', 'Undercommon'],
    traits: [
      legendaryResistance(3),
      trait('Spymistress of Kryptgarden', "She knows your name, your debts and who you last spoke to, and she will say so at the worst possible moment.", { passive: 'knows-you' }),
      trait('Bone Shroud', "The bones woven into her hide turn the first blow of each round: she has resistance to piercing damage.", { passive: 'bone-shroud', }),
    ],
    actions: [
      multi("She uses Frightful Presence, then bites once and claws twice.", [['frightful-presence', 1], ['bite', 1], ['claw', 2]]),
      melee('Bite', 11, '2d10+6', 'piercing', { reach: 10, effects: [{ kind: 'damage', dice: '3d6', type: 'poison' }] }),
      melee('Claw', 11, '2d6+6', 'slashing'),
      melee('Tail', 11, '2d8+6', 'bludgeoning', { reach: 15 }),
      saveAct('Poison Breath', {
        id: 'breath-weapon', dice: '16d6', dtype: 'poison',
        save: { ability: 'con', dc: 18, onSuccess: 'half' },
        target: { kind: 'cone', length: 60 },
        uses: { max: 1, recharge: '5-6' },
        desc: "A 60-foot cone of green death rolls between the trunks and settles in the hollows.",
        ai: { role: 'aoe', weight: 2.8 },
      }),
      saveAct('Frightful Presence', {
        range: 120, save: { ability: 'wis', dc: 16, onSuccess: 'negate' },
        target: { kind: 'sphere', radius: 120 },
        effects: [{ kind: 'condition', id: 'frightened', duration: '1 minute' }],
        desc: "She says your name, kindly, and the wood goes silent.",
        ai: { role: 'debuff', weight: 1.9 },
      }),
    ],
    legendary: {
      count: 3, resist: 3,
      actions: [
        legend('Detect', 1, "She reads the grove; nothing hidden stays hidden.", { kind: 'utility', target: { kind: 'self' }, ai: { role: 'utility', weight: 0.6 } }),
        legend('Tail Attack', 1, "She makes one tail attack.", { ref: 'tail', ai: { role: 'nuke', weight: 1.3 } }),
        legend('A Word in Your Ear', 2, "She tells one creature something true it did not want said aloud: DC 16 Wisdom save or take 4d6 psychic damage and have disadvantage on its next attack.", {
          kind: 'save', dice: '4d6', dtype: 'psychic', range: 60,
          save: { ability: 'wis', dc: 16, onSuccess: 'half' },
          effects: [{ kind: 'condition', id: 'cursed', duration: '1 round' }],
          ai: { role: 'debuff', weight: 1.8 },
        }),
      ],
    },
    lair: lair('Kryptgarden Forest', "A dwarf-hold swallowed by root and moss, its gates broken open wide enough for a huge dragon, its treasury still where the dwarves left it.", [
      lairAct('Strangling Roots', "The forest floor heaves: DC 16 Strength save or be restrained until the next lair action.", {
        save: { ability: 'str', dc: 16, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'restrained', duration: '1 round' }],
      }),
      lairAct('Spore Bloom', "A cloud of poisonous spores drifts through the hall: DC 16 Constitution save or take 3d6 poison damage.", {
        save: { ability: 'con', dc: 16, onSuccess: 'half' }, dice: '3d6', dtype: 'poison',
      }),
      lairAct('The Wood Reports', "The trees repeat a secret about one of you: DC 16 Wisdom save or be frightened until the next lair action.", {
        save: { ability: 'wis', dc: 16, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'frightened', duration: '1 round' }],
      }),
    ], { biome: 'forest' }),
    phases: [
      phase(70, "\"You are more trouble than the last lot. Good.\" She takes to the air over the ruined hold.", { passive: 'airborne' }),
      phase(40, "Old Gnawbone stops bargaining. The gas comes without warning now.", { passive: 'recharge-breath' }),
      phase(15, "Bleeding, she calls in a favour: two dragon cultists come out of the trees at a dead run.", { passive: 'summon-ally' }),
    ],
    intro: "Somewhere above the mossy gate a voice says, pleasantly: \"Gundren Rockseeker's friends, unless I am mistaken. I do hope you brought something better than swords.\" Then the trees move.",
    defeat: "Claugiyliamatar comes down through her own gate, bones rattling in her hide, and the whole of Kryptgarden hears it. The dwarven treasury lies open behind her.",
    ai: { archetype: 'boss', aggression: 0.8, selfPreserve: 0.55, preferredRange: 30 },
    loot: {
      gold: '15d10*40',
      table: [['gem-emerald', 1.0], ['gem-diamond', 0.6], ['gem-jade', 1.0], ['scroll-6', 0.8], ['dragonguard', 0.35], ['ring-of-resistance-poison', 0.4], ['potion-supreme-healing', 0.6], ['dwarven-plate', 0.15], ['platinum-ingot', 0.7]],
    },
    sprite: 'dragon', tint: '#2a5a2a', biomes: ['forest', 'ruins'], groupSize: [1, 1],
    faction: 'dragon', boss: true, elite: true,
  }),

  mon('arveiaturace', 'Arveiaturace', {
    title: 'The White Wyrm of the Sea of Moving Ice',
    desc: "An ancient white dragon who still carries the frozen corpse of her wizard rider strapped into a saddle on her back, and speaks to him daily. She is mad, enormously old, and she does not like being interrupted.",
    cr: 20, type: 'dragon', subtype: 'white', size: 'gargantuan', ac: 20, acNote: 'natural armor',
    hpDice: '18d20+144', speed: 40, fly: 80, burrow: 40, swim: 40,
    abilities: { str: 26, dex: 10, con: 26, int: 10, wis: 13, cha: 14 },
    saveProf: ['dex', 'con', 'wis', 'cha'], skills: { perception: 16, stealth: 7 },
    immune: ['cold'], senses: { blindsight: 60, darkvision: 120 }, languages: ['Common', 'Draconic'],
    traits: [
      legendaryResistance(3),
      T_SNOW_CAMO,
      trait('Ice Walk', "She crosses ice and deep snow without slowing.", { passive: 'ice-walk' }),
      trait('The Rider', "The frozen wizard in her saddle is addressed constantly and answered for. Insult him and she loses all interest in tactics.", { passive: 'the-rider' }),
    ],
    actions: [
      multi("She uses Frightful Presence, then bites once and claws twice.", [['frightful-presence', 1], ['bite', 1], ['claw', 2]]),
      melee('Bite', 14, '2d10+8', 'piercing', { reach: 15, effects: [{ kind: 'damage', dice: '2d8', type: 'cold' }] }),
      melee('Claw', 14, '2d6+8', 'slashing', { reach: 10 }),
      melee('Tail', 14, '2d8+8', 'bludgeoning', { reach: 20 }),
      saveAct('Cold Breath', {
        id: 'breath-weapon', dice: '16d8', dtype: 'cold',
        save: { ability: 'con', dc: 22, onSuccess: 'half' },
        target: { kind: 'cone', length: 90 },
        uses: { max: 1, recharge: '5-6' },
        desc: "A 90-foot cone of cold deep enough to shatter steel and stop a heart between beats.",
        ai: { role: 'aoe', weight: 3 },
      }),
      saveAct('Frightful Presence', {
        range: 120, save: { ability: 'wis', dc: 18, onSuccess: 'negate' },
        target: { kind: 'sphere', radius: 120 },
        effects: [{ kind: 'condition', id: 'frightened', duration: '1 minute' }],
        desc: "Eight hundred years of winter looks down at you and finds you uninteresting.",
        ai: { role: 'debuff', weight: 2 },
      }),
    ],
    legendary: {
      count: 3, resist: 3,
      actions: [
        legend('Detect', 1, "She casts about the ice field for movement.", { kind: 'utility', target: { kind: 'self' }, ai: { role: 'utility', weight: 0.5 } }),
        legend('Tail Attack', 1, "She makes one tail attack.", { ref: 'tail', ai: { role: 'nuke', weight: 1.3 } }),
        legend('Wing Attack', 2, "She beats her wings: creatures within 15 feet take 2d6+8 bludgeoning damage and fall prone on a failed DC 22 Dexterity save, then she flies half her speed.", {
          kind: 'save', dice: '2d6+8', dtype: 'bludgeoning',
          save: { ability: 'dex', dc: 22, onSuccess: 'negate' },
          target: { kind: 'sphere', radius: 15 },
          effects: [{ kind: 'condition', id: 'prone' }],
          ai: { role: 'aoe', weight: 1.9 },
        }),
      ],
    },
    lair: lair('The Sea of Moving Ice', "A cathedral of blue ice on a drifting floe, hung with frozen ships and a hoard scattered across the floor like a child's toys.", [
      lairAct('Calving Ice', "A wall of ice shears away: DC 20 Dexterity save or take 4d6 bludgeoning damage and be knocked prone.", {
        save: { ability: 'dex', dc: 20, onSuccess: 'half' }, dice: '4d6', dtype: 'bludgeoning',
        effects: [{ kind: 'condition', id: 'prone' }],
      }),
      lairAct('Killing Cold', "The temperature falls past bearing: DC 20 Constitution save or take 4d8 cold damage.", {
        save: { ability: 'con', dc: 20, onSuccess: 'half' }, dice: '4d8', dtype: 'cold',
      }),
      lairAct('The Rider Speaks', "She answers a question nobody asked, in a dead man's voice: DC 18 Wisdom save or be frightened until the next lair action.", {
        save: { ability: 'wis', dc: 18, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'frightened', duration: '1 round' }],
      }),
    ], { biome: 'tundra' }),
    phases: [
      phase(75, "\"My rider says you are not worth the breath.\" She takes wing and the floe cracks under the downdraft.", { passive: 'airborne' }),
      phase(45, "She lands astride her hoard and will not be moved off it.", { passive: 'guarding-hoard' }),
      phase(20, "Something in her breaks. She screams a dead wizard's name and the sky goes white.", { passive: 'reckless' }),
    ],
    intro: "The floe shudders. A white wyrm the length of a warship settles across the ice, the frozen thing in her saddle swaying. \"Hush now. He is speaking. He says you should not have come.\"",
    defeat: "Arveiaturace goes down across her own hoard, one wing over the saddle, shielding a corpse that has been dead four hundred years.",
    ai: { archetype: 'boss', aggression: 0.85, selfPreserve: 0.5, preferredRange: 30 },
    loot: {
      gold: '25d10*60',
      table: [['gem-diamond', 1.0], ['gem-moonstone', 1.0], ['gem-ruby', 0.8], ['ring-of-resistance-cold', 0.5], ['frost-brand', 0.2], ['scroll-8', 0.5], ['potion-supreme-healing', 0.8], ['platinum-ingot', 1.0], ['staff-of-frost', 0.15]],
    },
    sprite: 'dragon', tint: '#e8f4fb', biomes: ['tundra', 'coast'], groupSize: [1, 1],
    faction: 'dragon', boss: true, elite: true,
  }),

  mon('xanathar', 'Xanathar', {
    title: 'The Eye of Skullport',
    desc: "The beholder crime lord who runs Waterdeep's underworld from a bathysphere-lit lair beneath Skullport, obsessed with his pet goldfish Sylgar and with everyone knowing he is not the previous Xanathar. Cross him and the Guild will bill your family for the cleanup.",
    cr: 14, type: 'aberration', size: 'large', ac: 18, acNote: 'natural armor',
    hpDice: '20d10+80', speed: 0, fly: 20, hover: true,
    abilities: { str: 10, dex: 14, con: 18, int: 18, wis: 15, cha: 18 },
    saveProf: ['int', 'wis', 'cha'], skills: { deception: 8, insight: 6, perception: 12, intimidation: 8 },
    condImmune: ['prone'], senses: { darkvision: 120 }, languages: ['Common', 'Deep Speech', 'Undercommon'],
    traits: [
      legendaryResistance(3),
      trait('Antimagic Cone', "The great central eye projects a 150-foot cone in which magic simply does not work — his own rays included.", { passive: 'antimagic-cone:150' }),
      trait('Paranoia', "He has arranged this room in advance and knows three ways out of it. He cannot be surprised.", { passive: 'cannot-be-surprised' }),
      trait('Sylgar', "The goldfish in the bowl is not to be looked at, mentioned, or harmed. He is watching to see if you do.", { passive: 'sylgar' }),
    ],
    actions: [
      melee('Bite', 6, '4d6', 'piercing'),
      saveAct('Eye Rays', {
        range: 120, save: { ability: 'varies', dc: 17, onSuccess: 'negate' },
        target: { kind: 'multi', maxTargets: 3 },
        desc: "Three of his ten rays fire: charm, paralyzing, fear, slowing, enervation (8d8 necrotic), telekinetic, sleep, petrification, disintegration (10d8 force) and death (10d10 necrotic).",
        effects: [{ kind: 'condition', id: 'random-eye-ray' }],
        ai: { role: 'nuke', weight: 2.7 },
      }),
      util('Summon the Guild', {
        uses: { max: 1, recharge: 'long' },
        desc: "He calls in Guild muscle: two Xanathar enforcers come through the side doors.",
        effects: [{ kind: 'summon', monsterId: 'bandit-captain', count: 2 }],
        ai: { role: 'utility', weight: 1.8 },
      }),
    ],
    legendary: {
      count: 3, resist: 3,
      actions: [
        legend('Eye Ray', 1, "He fires one eye ray at a target he can see.", { ref: 'eye-rays', range: 120, ai: { role: 'nuke', weight: 1.6 } }),
        legend('Reposition', 1, "He drifts up to his speed, keeping the antimagic cone aimed exactly where he wants it.", {
          kind: 'utility', target: { kind: 'self' }, ai: { role: 'utility', weight: 1 },
        }),
        legend('The Eye Judges', 2, "He fixes one creature within 60 feet with the central eye: DC 17 Wisdom save or be frightened until the end of its next turn and take 3d8 psychic damage.", {
          kind: 'save', dice: '3d8', dtype: 'psychic', range: 60,
          save: { ability: 'wis', dc: 17, onSuccess: 'half' },
          effects: [{ kind: 'condition', id: 'frightened', duration: '1 round' }],
          ai: { role: 'debuff', weight: 1.7 },
        }),
      ],
    },
    lair: lair('The Xanathar\'s Lair', "A drowned chamber under Skullport, lit green through thick glass, with a goldfish bowl on a pedestal in the middle of the floor and a great many exits nobody else knows about.", [
      lairAct('Flooded Floor', "Bilge water surges in: DC 16 Strength save or be swept 15 feet and knocked prone.", {
        save: { ability: 'str', dc: 16, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'prone' }],
      }),
      lairAct('Guild Crossbows', "Hidden shooters fire through the murder holes: DC 16 Dexterity save or take 3d6 piercing damage.", {
        save: { ability: 'dex', dc: 16, onSuccess: 'negate' }, dice: '3d6', dtype: 'piercing',
      }),
      lairAct('Grasping Slime', "The wall slime lunges: DC 16 Dexterity save or be restrained until the next lair action.", {
        save: { ability: 'dex', dc: 16, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'restrained', duration: '1 round' }],
      }),
    ], { biome: 'dungeon' }),
    phases: [
      phase(65, "\"You are on the ledger now.\" The antimagic cone swings across the room like a searchlight.", { passive: 'antimagic-sweep' }),
      phase(35, "Guild enforcers pour in from three doors at once.", { passive: 'summon-ally' }),
      phase(15, "He puts himself bodily between you and the goldfish bowl. \"NOT SYLGAR.\"", { passive: 'reckless' }),
    ],
    intro: "A sphere of grey hate rises out of the water, ten stalks weaving. \"You have been noticed. Do you know how expensive it is, being noticed by me? Do not look at the fish.\"",
    defeat: "The Xanathar sinks into the flooded floor, eyestalks going limp one by one. The goldfish bowl, remarkably, is untouched.",
    ai: { archetype: 'boss', aggression: 0.85, selfPreserve: 0.7, preferredRange: 60 },
    loot: {
      gold: '12d10*40',
      table: [['gem-diamond', 1.0], ['gem-ruby', 1.0], ['gem-emerald', 0.8], ['gem-of-seeing', 0.3], ['wand-of-fear', 0.25], ['scroll-7', 0.6], ['ring-of-protection', 0.3], ['ioun-stone-awareness', 0.15], ['potion-supreme-healing', 0.7]],
    },
    sprite: 'beholder', tint: '#8a5a9a', biomes: ['dungeon', 'underdark', 'city'], groupSize: [1, 1],
    faction: 'beholder', boss: true, elite: true,
  }),

  mon('manshoon', 'Manshoon', {
    title: 'The Manshoon Clone, Zhentarim Founder',
    desc: "One of an unknown number of identical archwizards, each convinced it is the original founder of the Black Network. This one has been quietly buying Waterdeep for a decade, and it takes the interference personally.",
    cr: 16, type: 'humanoid', subtype: 'human', size: 'medium', ac: 17, acNote: 'robe of the archmagi',
    hpDice: '20d8+80', speed: 30, abilities: { str: 10, dex: 16, con: 18, int: 21, wis: 16, cha: 18 },
    saveProf: ['int', 'wis', 'cha'], skills: { arcana: 11, deception: 9, history: 11, insight: 8, perception: 8 },
    resist: ['damage-from-spells'], senses: { truesight: 30 },
    languages: ['Common', 'Draconic', 'Elvish', 'Netherese', 'Infernal', 'Undercommon'],
    traits: [
      legendaryResistance(3),
      T_MAGIC_RESIST,
      trait('Spellcasting', "An 18th-level wizard: counterspell, dispel magic, fireball, cone of cold, wall of force, chain lightning, teleport and mind blank, with spell save DC 19.", { passive: 'spellcasting:int:19:18' }),
      trait('The Clones', "If this body dies, another Manshoon wakes somewhere far away and picks up the ledger where this one left off.", { passive: 'clone-rejuvenation' }),
      trait('Contingency', "A prepared contingency fires the first time he drops below half his hit points, wrapping him in stoneskin.", { passive: 'contingency:stoneskin:50' }),
    ],
    actions: [
      melee('Arcane Blade', 9, '2d8+4', 'force', { desc: "A blade of hard blue light, wielded with a duellist's economy." }),
      saveAct('Chain Lightning', {
        range: 150, dice: '10d8', dtype: 'lightning',
        save: { ability: 'dex', dc: 19, onSuccess: 'half' },
        target: { kind: 'multi', maxTargets: 4 },
        uses: { max: 1, recharge: 'long' },
        desc: "One bolt leaps from him and forks to three more targets.",
        ai: { role: 'aoe', weight: 2.7 },
      }),
      saveAct('Cone of Cold', {
        dice: '8d8', dtype: 'cold',
        save: { ability: 'con', dc: 19, onSuccess: 'half' },
        target: { kind: 'cone', length: 60 },
        uses: { max: 2, recharge: 'long' },
        desc: "A 60-foot cone of black frost, delivered without raising his voice.",
        ai: { role: 'aoe', weight: 2.4 },
      }),
      saveAct('Fireball', {
        range: 150, dice: '8d6', dtype: 'fire',
        save: { ability: 'dex', dc: 19, onSuccess: 'half' },
        target: { kind: 'sphere', radius: 20 },
        uses: { max: 3, recharge: 'long' },
        desc: "Efficient, unhurried, precisely centred.",
        ai: { role: 'aoe', weight: 2.3 },
      }),
      util('Wall of Force', {
        uses: { max: 1, recharge: 'long' },
        desc: "An invisible plane of force cuts the battlefield in half exactly where it hurts most.",
        effects: [{ kind: 'shield', ac: 0 }, { kind: 'utility', tag: 'wall-of-force' }],
        ai: { role: 'control', weight: 2.2 },
      }),
    ],
    reactions: [util('Counterspell', {
      desc: "He interrupts a spell as it is cast, with the air of a man correcting a clerk.",
      ai: { role: 'utility', weight: 2.4 },
    })],
    legendary: {
      count: 3, resist: 3,
      actions: [
        legend('Cantrip', 1, "He casts firebolt: +11 to hit, 4d10 fire damage.", {
          kind: 'attack', atkBonus: 11, dice: '4d10', dtype: 'fire', range: 120,
          ai: { role: 'nuke', weight: 1.4 },
        }),
        legend('Misty Step', 1, "He steps 30 feet through folded space, always to a better angle.", {
          kind: 'utility', target: { kind: 'self' }, effects: [{ kind: 'teleport', distance: 30 }],
          ai: { role: 'utility', weight: 1.2 },
        }),
        legend('Zhentarim Discipline', 2, "He names a target for the Network: until the end of his next turn, attacks against that creature have advantage and it takes 3d6 psychic damage.", {
          kind: 'save', dice: '3d6', dtype: 'psychic', range: 120,
          save: { ability: 'wis', dc: 19, onSuccess: 'half' },
          effects: [{ kind: 'condition', id: 'marked', duration: '1 round' }],
          ai: { role: 'debuff', weight: 1.8 },
        }),
      ],
    },
    lair: lair('The Black Network Sanctum', "A vaulted chamber of black marble under Waterdeep, walls covered in ledgers, teleportation circles cut into the floor in four corners.", [
      lairAct('Teleport Circle', "A circle flares and drags a creature across the room: DC 18 Charisma save or be teleported 40 feet into the open.", {
        save: { ability: 'cha', dc: 18, onSuccess: 'negate' },
        effects: [{ kind: 'teleport', distance: 40 }],
      }),
      lairAct('Warded Stone', "The wards in the walls discharge: DC 18 Dexterity save or take 4d6 force damage.", {
        save: { ability: 'dex', dc: 18, onSuccess: 'half' }, dice: '4d6', dtype: 'force',
      }),
      lairAct('Zhent Crossbows', "Black Network agents fire from the gallery: DC 18 Dexterity save or take 3d8 piercing damage.", {
        save: { ability: 'dex', dc: 18, onSuccess: 'negate' }, dice: '3d8', dtype: 'piercing',
      }),
    ], { biome: 'city' }),
    phases: [
      phase(60, "The contingency fires; his skin turns the grey of old granite. \"Tedious.\"", { passive: 'stoneskin' }),
      phase(30, "\"I have been killed before. It is an inconvenience, nothing more.\" He stops conserving spell slots.", { passive: 'reckless-casting' }),
      phase(10, "He begins a teleport and does not stop casting while he does it.", { passive: 'flees' }),
    ],
    intro: "A tall man in black lowers his ledger and looks at you with mild, terrible patience. \"The Black Network built half this city's debts. You are an entry to be corrected.\"",
    defeat: "Manshoon's body folds and burns away to nothing, and somewhere very far from Waterdeep, an identical man opens his eyes and reaches for a ledger.",
    ai: { archetype: 'boss', aggression: 0.75, selfPreserve: 0.8, preferredRange: 90 },
    loot: {
      gold: '15d10*40',
      table: [['robe-of-the-archmagi', 0.25], ['spellbook', 1.0], ['scroll-8', 0.8], ['scroll-7', 0.9], ['staff-of-power', 0.12], ['ring-of-spell-turning', 0.12], ['gem-diamond', 0.9], ['potion-supreme-healing', 0.8], ['ahghairons-sash', 0.08]],
    },
    sprite: 'wizard', tint: '#1a1a2a', biomes: ['city', 'dungeon'], groupSize: [1, 1],
    faction: 'zhentarim', boss: true, elite: true,
  }),

  mon('elder-brain-of-undermountain', 'The Elder Brain of Undermountain', {
    title: 'The Thing in the Cistern',
    desc: "A mind flayer colony's shared soul, twenty feet of grey matter afloat in a Netherese cistern deep beneath Waterdeep. It has been reading the thoughts of everyone on the level since they walked in, and it is bored of them.",
    cr: 16, type: 'aberration', size: 'large', ac: 12, hpDice: '28d10+140',
    speed: 5, swim: 10, abilities: { str: 15, dex: 10, con: 20, int: 22, wis: 19, cha: 24 },
    saveProf: ['int', 'wis', 'cha'], skills: { arcana: 12, deception: 13, insight: 10, perception: 10, persuasion: 13 },
    condImmune: ['blinded', 'prone'], senses: { blindsight: 120 },
    languages: ['Deep Speech', 'Undercommon', 'telepathy 5 miles'],
    traits: [
      legendaryResistance(3),
      T_MAGIC_RESIST,
      trait('Creature Sense', "It knows the location and species of everything within five miles of the cistern.", { passive: 'creature-sense:5mi' }),
      trait('Telepathic Hub', "Every mind flayer, thrall and intellect devourer on the level is an extension of it.", { passive: 'telepathic-hub' }),
      trait('Halaster Watches', "The Mad Mage finds this thing entertaining, and has never once helped it.", { passive: 'halaster-watches' }),
    ],
    actions: [
      multi("It lashes with three tentacles and blasts one mind.", [['tentacle', 3]]),
      melee('Tentacle', 10, '3d6+2', 'bludgeoning', {
        reach: 30,
        effects: [{ kind: 'condition', id: 'grappled', save: { ability: 'str', dc: 18 } }],
      }),
      saveAct('Psychic Pulse', {
        range: 60, dice: '8d8', dtype: 'psychic',
        save: { ability: 'int', dc: 20, onSuccess: 'half' },
        target: { kind: 'sphere', radius: 60 },
        uses: { max: 1, recharge: '5-6' },
        desc: "The cistern ripples and every mind in the chamber is struck at once.",
        ai: { role: 'aoe', weight: 2.6 },
      }),
      saveAct('Break Will', {
        range: 60, save: { ability: 'wis', dc: 20, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'dominated', duration: '1 minute' }],
        uses: { max: 2, recharge: 'long' },
        desc: "It takes hold of one mind and turns it against the others.",
        ai: { role: 'control', weight: 2.6 },
      }),
      util('Call the Colony', {
        uses: { max: 2, recharge: 'long' },
        desc: "Mind flayers come out of the side passages, unhurried, in perfect step.",
        effects: [{ kind: 'summon', monsterId: 'mind-flayer', count: 1 }, { kind: 'summon', monsterId: 'intellect-devourer', count: 2 }],
        ai: { role: 'utility', weight: 2.2 },
      }),
    ],
    legendary: {
      count: 3, resist: 3,
      actions: [
        legend('Tentacle', 1, "It makes one tentacle attack.", { ref: 'tentacle', ai: { role: 'nuke', weight: 1.1 } }),
        legend('Whisper of Doubt', 1, "One creature it can sense takes 3d8 psychic damage and has disadvantage on its next save.", {
          kind: 'save', dice: '3d8', dtype: 'psychic', range: 120,
          save: { ability: 'wis', dc: 20, onSuccess: 'half' },
          effects: [{ kind: 'condition', id: 'cursed', duration: '1 round' }],
          ai: { role: 'debuff', weight: 1.5 },
        }),
        legend('Sever Psyche', 2, "One creature must make a DC 20 Intelligence save or take 6d8 psychic damage and be stunned until the end of its next turn.", {
          kind: 'save', dice: '6d8', dtype: 'psychic', range: 60,
          save: { ability: 'int', dc: 20, onSuccess: 'half' },
          effects: [{ kind: 'condition', id: 'stunned', duration: '1 round' }],
          ai: { role: 'nuke', weight: 2.2 },
        }),
      ],
    },
    lair: lair('The Cistern Level', "A Netherese reservoir the illithids flooded with brine, ringed by thrall pens and lit by the pale glow of the thing floating in the middle of it.", [
      lairAct('Thrall Wave', "Half a dozen hollowed-out thralls shamble out of the pens.", {
        kind: 'summon', effects: [{ kind: 'summon', monsterId: 'zombie', count: 4 }],
      }),
      lairAct('Psychic Static', "The air fills with borrowed screaming: DC 18 Intelligence save or take 3d6 psychic damage and be deafened until the next lair action.", {
        save: { ability: 'int', dc: 18, onSuccess: 'half' }, dice: '3d6', dtype: 'psychic',
        effects: [{ kind: 'condition', id: 'deafened', duration: '1 round' }],
      }),
      lairAct('Rising Brine', "The cistern overflows: DC 18 Strength save or be swept 15 feet and knocked prone.", {
        save: { ability: 'str', dc: 18, onSuccess: 'negate' },
        effects: [{ kind: 'condition', id: 'prone' }],
      }),
    ], { biome: 'underdark' }),
    phases: [
      phase(70, "It stops speaking in your own voices and starts speaking in each other's.", { passive: 'psychic-storm' }),
      phase(40, "The colony arrives: mind flayers at every entrance, in step, unhurried.", { passive: 'summon-ally' }),
      phase(15, "The brine boils. Every thought in the chamber is suddenly, deafeningly, shared.", { passive: 'reckless' }),
    ],
    intro: "The brine shivers. A voice that is not sound arrives fully formed inside your skull: \"You are not the first. There is a shelf below where the others are kept. You will like it there. You will not remember disliking it.\"",
    defeat: "The great grey mass sags and the voices in your head go out one at a time, like lamps down a corridor. Somewhere far above, Halaster Blackcloak laughs.",
    ai: { archetype: 'boss', aggression: 0.7, selfPreserve: 0.9, preferredRange: 60 },
    loot: {
      gold: '12d10*30',
      table: [['headband-of-intellect', 0.4], ['tome-of-clear-thought', 0.2], ['gem-black-pearl', 1.0], ['gem-diamond', 0.5], ['scroll-7', 0.7], ['medallion-of-thoughts', 0.4], ['ring-of-mind-shielding', 0.3], ['potion-supreme-healing', 0.6]],
    },
    sprite: 'elder-brain', tint: '#a86a9a', biomes: ['underdark', 'dungeon'], groupSize: [1, 1],
    faction: 'illithid', boss: true, elite: true,
  }),

  mon('halaster', 'Halaster Blackcloak', {
    title: 'The Mad Mage of Undermountain',
    desc: "The archmage who dug Undermountain and then went comprehensively insane inside it, and has been rearranging the furniture for a thousand years. He is not trying to kill you. He is trying to find out what you do.",
    cr: 23, type: 'humanoid', subtype: 'human', size: 'medium', ac: 21, acNote: 'robe of the archmagi, shield',
    hpDice: '24d8+120', speed: 30, fly: 30,
    abilities: { str: 11, dex: 18, con: 20, int: 26, wis: 20, cha: 18 },
    saveProf: ['int', 'wis', 'cha', 'dex'],
    skills: { arcana: 16, history: 16, insight: 11, perception: 11 },
    resist: ['damage-from-spells'], condImmune: ['charmed', 'frightened'],
    senses: { truesight: 60 }, languages: ['Common', 'Draconic', 'Dwarvish', 'Elvish', 'Netherese', 'Undercommon', 'Abyssal'],
    traits: [
      legendaryResistance(3),
      T_MAGIC_RESIST,
      trait('Spellcasting', "A 20th-level wizard: counterspell, dispel magic, chain lightning, disintegrate, wall of force, prismatic spray, time stop and meteor swarm, with spell save DC 22.", { passive: 'spellcasting:int:22:20' }),
      trait('Master of Undermountain', "Every wall, door, trap and portal in the dungeon answers to him, and he changes them for fun mid-fight.", { passive: 'dungeon-master' }),
      trait('Blackcloak\'s Escape', "Reduced to 0 hit points, he vanishes in a burst of laughter and re-forms elsewhere in Undermountain, delighted.", { passive: 'escapes-death' }),
      trait('Wholly Unpredictable', "One of his spells each round is chosen at random. He considers this a feature.", { passive: 'wild-magic' }),
    ],
    actions: [
      melee('Staff of Power', 12, '2d6+5', 'force', { effects: [{ kind: 'damage', dice: '2d6', type: 'force' }] }),
      saveAct('Meteor Swarm', {
        range: 240, dice: '20d6', dtype: 'fire',
        save: { ability: 'dex', dc: 22, onSuccess: 'half' },
        target: { kind: 'sphere', radius: 40 },
        effects: [{ kind: 'damage', dice: '20d6', type: 'bludgeoning' }],
        uses: { max: 1, recharge: 'long' },
        desc: "\"Oh, I have not done THIS one in a while.\" The ceiling of Undermountain simply is not there any more.",
        ai: { role: 'aoe', weight: 3 },
      }),
      saveAct('Prismatic Spray', {
        dice: '10d6', dtype: 'force',
        save: { ability: 'dex', dc: 22, onSuccess: 'half' },
        target: { kind: 'cone', length: 60 },
        uses: { max: 1, recharge: '5-6' },
        desc: "Eight rays of impossible colour, and he has not the least idea which of you will get which.",
        ai: { role: 'aoe', weight: 2.7 },
      }),
      util('Disintegrate', {
        kind: 'save', range: 60, dice: '10d6+40', dtype: 'force',
        save: { ability: 'dex', dc: 22, onSuccess: 'negate' },
        uses: { max: 2, recharge: 'long' },
        desc: "A thin green ray. Whatever it reduces to 0 hit points becomes a neat pile of grey dust.",
        ai: { role: 'nuke', weight: 2.8 },
      }),
      util('Time Stop', {
        uses: { max: 1, recharge: 'long' },
        desc: "He takes three turns in a row while the world holds still, and uses them badly on purpose.",
        effects: [{ kind: 'buff', id: 'time-stop', duration: '3 rounds' }],
        ai: { role: 'buff', weight: 2.9 },
      }),
    ],
    reactions: [util('Counterspell', {
      desc: "\"No. Try another one.\" The spell comes apart in your hands.",
      ai: { role: 'utility', weight: 2.5 },
    })],
    legendary: {
      count: 3, resist: 3,
      actions: [
        legend('Cantrip', 1, "He casts a cantrip, usually one he invented and named after himself.", {
          kind: 'attack', atkBonus: 14, dice: '4d10', dtype: 'force', range: 120,
          ai: { role: 'nuke', weight: 1.4 },
        }),
        legend('Rearrange the Room', 1, "A wall becomes a door, a floor becomes a pit: one creature must make a DC 20 Dexterity save or be teleported 30 feet and knocked prone.", {
          kind: 'save', range: 120, save: { ability: 'dex', dc: 20, onSuccess: 'negate' },
          effects: [{ kind: 'teleport', distance: 30 }, { kind: 'condition', id: 'prone' }],
          ai: { role: 'control', weight: 1.7 },
        }),
        legend('Arcane Burst', 2, "Raw magic detonates in a 20-foot radius: 6d6 force damage, half on a DC 22 Dexterity save.", {
          kind: 'save', dice: '6d6', dtype: 'force', range: 120,
          save: { ability: 'dex', dc: 22, onSuccess: 'half' },
          target: { kind: 'sphere', radius: 20 },
          ai: { role: 'aoe', weight: 2.2 },
        }),
      ],
    },
    lair: lair('The Halls of Undermountain', "A chamber that was a library an hour ago and will be a menagerie by evening, because the man standing in it is bored and can rebuild it with a gesture.", [
      lairAct('Shifting Walls', "The room reconfigures: DC 20 Dexterity save or be moved 20 feet into a wall and take 3d6 bludgeoning damage.", {
        save: { ability: 'dex', dc: 20, onSuccess: 'negate' }, dice: '3d6', dtype: 'bludgeoning',
        effects: [{ kind: 'teleport', distance: 20 }],
      }),
      lairAct('Summoning Portal', "A portal opens in the ceiling and something unpleasant falls out of it.", {
        kind: 'summon', effects: [{ kind: 'summon', monsterId: 'flameskull', count: 2 }],
      }),
      lairAct('Arcane Backlash', "A thousand years of stacked wards misfire: DC 20 Constitution save or take 4d8 force damage.", {
        save: { ability: 'con', dc: 20, onSuccess: 'half' }, dice: '4d8', dtype: 'force',
      }),
    ], { biome: 'dungeon', regional: ["Deeper in Undermountain, doors lead where Halaster is thinking about, not where they went yesterday."] }),
    phases: [
      phase(75, "\"Oh, good — you can actually FIGHT.\" He starts taking notes mid-battle.", { passive: 'studying' }),
      phase(50, "He rebuilds the room around you and laughs the whole time.", { passive: 'dungeon-shift' }),
      phase(25, "Time stops. When it starts again three of you are somewhere else.", { passive: 'time-stop' }),
      phase(10, "\"Splendid! SPLENDID. Do come back down.\" He begins to fade out mid-cast.", { passive: 'escapes-death' }),
    ],
    intro: "A wiry old man in a black cloak is suddenly sitting on a chair that was not there. \"Ah! The Phandalin lot. I have read your minds and I have to say the plan is terrible. Shall we?\"",
    defeat: "Halaster comes apart into laughter and drifting motes and is not there any more. His chair remains, and on it, one ring and a note: \"LEVEL SIX. BRING FRIENDS. — H.\"",
    ai: { archetype: 'boss', aggression: 0.8, selfPreserve: 0.6, preferredRange: 90 },
    loot: {
      gold: '25d10*60',
      table: [['halasters-ring', 1.0], ['staff-of-power', 0.35], ['robe-of-the-archmagi', 0.3], ['spellbook', 1.0], ['scroll-9', 0.6], ['scroll-8', 0.9], ['gem-diamond', 1.0], ['ahghairons-dragonstaff', 0.06], ['potion-supreme-healing', 1.0], ['ring-of-three-wishes', 0.03]],
    },
    sprite: 'wizard', tint: '#2a2a3a', biomes: ['dungeon', 'underdark'], groupSize: [1, 1],
    faction: 'undermountain', boss: true, elite: true,
  }),
);

// ===========================================================================
// HIGH-TIER ENCOUNTER PACKS — what the wilderness and dungeon tables roll once the
// party has outgrown goblins. `cr` is the pack's rough effective CR, not a sum.
// ===========================================================================

function group(id, name, o) {
  return {
    id, name, desc: o.desc,
    biomes: o.biomes, cr: o.cr,
    members: o.members,
    boss: o.boss || null,
    faction: o.faction || null,
    minLevel: o.minLevel || 5,
  };
}

const GROUPS = {};
for (const g of [
  group('undermountain-drow-raid', 'Drow Raiding Party', {
    desc: "A House raid out of the Underdark: elite blades in front, a mage behind, and something with too many legs bringing up the rear.",
    biomes: ['underdark', 'cave', 'dungeon', 'mine'], cr: 9, faction: 'drow', minLevel: 6,
    members: [['drow', 2, 5], ['drow-elite-warrior', 1, 2], ['drow-mage', 0, 1], ['drider', 0, 1]],
  }),
  group('lolth-yathrin-procession', 'Procession of the Spider Queen', {
    desc: "A priestess of Lolth walking the deep roads with her escort, and a handmaiden of the goddess coiled in the dark behind her.",
    biomes: ['underdark', 'cave', 'dungeon'], cr: 12, faction: 'drow', minLevel: 9,
    members: [['drow-priestess-of-lolth', 1, 1], ['drow-elite-warrior', 2, 3], ['drider', 1, 2], ['yochlol', 0, 1]],
  }),
  group('kryptgarden-dragon-cult', 'Cult of the Dragon Cell', {
    desc: "Cultists out of Kryptgarden bringing tribute to Old Gnawbone, escorted by wyvern-riders and a gnoll pack they have paid in advance.",
    biomes: ['forest', 'pine-forest', 'ruins', 'road'], cr: 10, faction: 'cult-dragon', minLevel: 6,
    members: [['wyvern', 1, 2], ['manticore', 0, 1], ['oni', 0, 1], ['chimera', 0, 1]],
    boss: 'claugiyliamatar',
  }),
  group('thundertree-ash-flight', 'The Ash-Choked Ruins', {
    desc: "Whatever else has moved into Thundertree since the green dragon claimed the tower, and it is not friendly either.",
    biomes: ['ruins', 'pine-forest', 'ash-waste'], cr: 8, faction: 'cult-dragon', minLevel: 5,
    members: [['gibbering-mouther', 0, 1], ['shambling-mound', 1, 2], ['manticore', 0, 1]],
    boss: 'venomfang',
  }),
  group('mere-of-dead-men-wraiths', 'The Drowned Dead', {
    desc: "The Mere of Dead Men earns its name: wraiths and their specters rise out of the standing water where a whole army once sank.",
    biomes: ['marsh', 'coast', 'ruins', 'crypt'], cr: 9, faction: 'undead', minLevel: 6,
    members: [['wraith', 1, 3], ['wight', 1, 3], ['ghost', 0, 2], ['water-weird', 0, 2]],
  }),
  group('wave-echo-restless', 'The Restless Workings', {
    desc: "The old mining crew of Wave Echo Cave, still on shift five hundred years after the roof came in.",
    biomes: ['mine', 'cave', 'crypt'], cr: 8, faction: 'undead', minLevel: 5,
    members: [['wight', 1, 2], ['minotaur-skeleton', 1, 3], ['flameskull', 0, 2], ['wraith', 0, 1]],
    boss: 'mormesk',
  }),
  group('icespire-frost-giants', 'Frost Giant Raiding Band', {
    desc: "Giants down from Icespire Peak with a remorhaz on a chain and a great deal of enthusiasm about other people's livestock.",
    biomes: ['tundra', 'mountain', 'hills', 'cave'], cr: 12, faction: 'giant', minLevel: 8,
    members: [['frost-giant', 1, 3], ['ogre', 1, 3], ['remorhaz', 0, 1], ['troll', 0, 2]],
  }),
  group('sword-mountains-giants', 'Hill Giant Foraging Party', {
    desc: "Hill giants working their way down toward the farms, with trolls trailing them for the leavings.",
    biomes: ['hills', 'mountain', 'plains', 'forest'], cr: 8, faction: 'giant', minLevel: 5,
    members: [['hill-giant', 1, 2], ['troll', 1, 2], ['ettin', 0, 1], ['ogre', 1, 3]],
  }),
  group('stone-giant-quarry', 'Stone Giant Quarry Watch', {
    desc: "Stone giants at the rock face, with a xorn nosing through the tailings and a gorgon somewhere in the scree.",
    biomes: ['mountain', 'cave', 'hills', 'underdark'], cr: 10, faction: 'giant', minLevel: 7,
    members: [['stone-giant', 1, 2], ['xorn', 0, 2], ['gorgon', 0, 1], ['umber-hulk', 0, 1]],
  }),
  group('fire-giant-forgeworks', 'Fire Giant Forgeworks', {
    desc: "A fire giant smith and its salamander labour, hammering out weapons for something further down the mountain.",
    biomes: ['mountain', 'cave', 'ash-waste', 'underdark'], cr: 13, faction: 'giant', minLevel: 9,
    members: [['fire-giant', 1, 2], ['salamander', 2, 4], ['fire-elemental', 0, 2], ['efreeti', 0, 1]],
  }),
  group('skullport-beholder-kin', 'Beholder-Kin of Skullport', {
    desc: "Spectators and gauths working the Skullport underlevels for the Eye, and none of them agree on who is in charge.",
    biomes: ['underdark', 'dungeon', 'city', 'cave'], cr: 11, faction: 'beholder', minLevel: 8,
    members: [['gauth', 1, 3], ['spectator', 1, 2], ['grell', 0, 2], ['cloaker', 0, 1]],
    boss: 'xanathar',
  }),
  group('undermountain-illithid-patrol', 'Illithid Patrol', {
    desc: "A mind flayer walking the deep levels with its intellect devourers ranging ahead of it like hounds.",
    biomes: ['underdark', 'dungeon', 'cave'], cr: 11, faction: 'illithid', minLevel: 8,
    members: [['mind-flayer', 1, 2], ['intellect-devourer', 2, 4], ['grell', 0, 2], ['quaggoth', 0, 3]],
    boss: 'elder-brain-of-undermountain',
  }),
  group('undermountain-construct-watch', 'Halaster\'s Watchmen', {
    desc: "The Mad Mage's guardians: helmed horrors that were never occupied and golems that have not been given a new order in a century.",
    biomes: ['dungeon', 'ruins', 'crypt'], cr: 12, faction: 'construct', minLevel: 9,
    members: [['helmed-horror', 2, 4], ['flameskull', 1, 2], ['stone-golem', 0, 1], ['shield-guardian', 0, 1]],
    boss: 'halaster',
  }),
  group('deep-tunnel-horrors', 'Deep Tunnel Horrors', {
    desc: "What lives in the parts of the Underdark that even the drow route around.",
    biomes: ['underdark', 'cave', 'mine', 'dungeon'], cr: 10, faction: null, minLevel: 7,
    members: [['umber-hulk', 1, 2], ['roper', 1, 2], ['hook-horror', 2, 4], ['black-pudding', 0, 1], ['purple-worm', 0, 1]],
  }),
  group('crypt-of-the-mummy-lord', 'The Sealed Tomb', {
    desc: "A Netherese-era burial vault whose occupants have not finished their duties, presided over by something that used to be a priest-king.",
    biomes: ['crypt', 'ruins', 'dungeon'], cr: 14, faction: 'undead', minLevel: 10,
    members: [['mummy', 2, 4], ['wight', 1, 3], ['flameskull', 0, 2], ['mummy-lord', 1, 1]],
  }),
  group('vampire-court', 'The Nightly Court', {
    desc: "A vampire holding audience in a crypt beneath a respectable house, spawn arranged along the walls like furniture.",
    biomes: ['crypt', 'city', 'dungeon', 'ruins'], cr: 13, faction: 'undead', minLevel: 10,
    members: [['vampire-spawn', 2, 5], ['ghost', 0, 2], ['vampire', 1, 1]],
  }),
  group('hells-incursion', 'Infernal Contract Enforcement', {
    desc: "A devil's collection detail, come through a cracked binding circle to settle an account in person.",
    biomes: ['dungeon', 'ruins', 'ash-waste', 'city'], cr: 13, faction: 'devil', minLevel: 9,
    members: [['bearded-devil', 2, 4], ['barbed-devil', 1, 3], ['chain-devil', 0, 2], ['horned-devil', 0, 1], ['erinyes', 0, 1]],
  }),
  group('abyssal-breach', 'Abyssal Breach', {
    desc: "Demons pouring through a rip in the world, with no plan, no discipline and no intention of stopping.",
    biomes: ['dungeon', 'underdark', 'ruins', 'ash-waste'], cr: 15, faction: 'demon', minLevel: 11,
    members: [['vrock', 1, 3], ['hezrou', 1, 2], ['glabrezu', 0, 2], ['quasit', 2, 4], ['nalfeshnee', 0, 1]],
  }),
  group('abyssal-warhost', 'Abyssal Warhost', {
    desc: "A marilith with a column of demons behind her, and something with wings of fire coming up the corridor last.",
    biomes: ['dungeon', 'underdark', 'ash-waste'], cr: 19, faction: 'demon', minLevel: 15,
    members: [['marilith', 1, 1], ['glabrezu', 1, 2], ['nalfeshnee', 0, 1], ['hezrou', 1, 3], ['balor', 0, 1]],
  }),
  group('elemental-rift', 'Elemental Rift', {
    desc: "A binding gone wrong: elementals loose in a ruin, tearing at each other as much as at you.",
    biomes: ['ruins', 'dungeon', 'mountain', 'coast'], cr: 10, faction: null, minLevel: 6,
    members: [['air-elemental', 0, 2], ['earth-elemental', 0, 2], ['fire-elemental', 0, 2], ['water-elemental', 0, 2], ['invisible-stalker', 0, 1]],
  }),
  group('neverwinter-wood-wardens', 'The Wood Answers', {
    desc: "Neverwinter Wood defending itself: treants, a shambling mound out of the wet ground, and something with a horn that judges you as it comes.",
    biomes: ['forest', 'pine-forest', 'marsh'], cr: 11, faction: 'emerald-enclave', minLevel: 8,
    members: [['treant', 1, 2], ['shambling-mound', 1, 3], ['unicorn', 0, 1], ['griffon', 0, 2]],
  }),
  group('marsh-terrors', 'What the Mere Keeps', {
    desc: "The Mere of Dead Men's living residents: a hydra in the deep channel, black puddings in the reed beds, chuuls in the shallows.",
    biomes: ['marsh', 'coast', 'cave'], cr: 12, faction: null, minLevel: 8,
    members: [['hydra', 0, 1], ['chuul', 1, 3], ['black-pudding', 0, 2], ['otyugh', 0, 2], ['shambling-mound', 1, 2]],
  }),
  group('wyvern-tor-flight', 'Wyvern Tor Flight', {
    desc: "The tor's namesake pair, hunting the Triboar Trail with a manticore that has learned to follow them.",
    biomes: ['mountain', 'hills', 'road', 'plains'], cr: 8, faction: null, minLevel: 5,
    members: [['wyvern', 1, 3], ['manticore', 0, 2], ['hippogriff', 0, 3]],
  }),
  group('petrified-gallery', 'The Statue Garden', {
    desc: "A ruin where the statues are too well observed and too badly posed, and something is still moving between them.",
    biomes: ['ruins', 'dungeon', 'crypt', 'cave'], cr: 9, faction: null, minLevel: 6,
    members: [['medusa', 1, 1], ['basilisk', 1, 3], ['gorgon', 0, 1], ['helmed-horror', 0, 2]],
  }),
  group('dragon-tribute-flight', 'Tribute to the Wyrm', {
    desc: "A dragon's vassals bringing hoard-gold up the mountain, and the dragon itself circling to make sure they do.",
    biomes: ['mountain', 'hills', 'ash-waste', 'cave'], cr: 17, faction: 'dragon', minLevel: 12,
    members: [['adult-red-dragon', 0, 1], ['adult-blue-dragon', 0, 1], ['fire-giant', 0, 2], ['wyvern', 1, 3], ['behir', 0, 1]],
  }),
  group('icespire-white-wyrm', 'The White Wyrm Hunts', {
    desc: "An old white dragon on the wing over the ice, with remorhazes churning the drifts below it.",
    biomes: ['tundra', 'mountain', 'coast'], cr: 20, faction: 'dragon', minLevel: 16,
    members: [['remorhaz', 0, 2], ['frost-giant', 0, 3], ['young-white-dragon', 0, 1]],
    boss: 'arveiaturace',
  }),
  group('zhentarim-black-network', 'Black Network Operation', {
    desc: "Zhentarim muscle running a job for a wizard in black, with hired fiends on the payroll and no witnesses budgeted for.",
    biomes: ['city', 'road', 'dungeon', 'ruins'], cr: 14, faction: 'zhentarim', minLevel: 10,
    members: [['succubus', 0, 1], ['invisible-stalker', 0, 2], ['barbed-devil', 0, 2], ['helmed-horror', 0, 2]],
    boss: 'manshoon',
  }),

  // --- the road south and Baldur's Gate (SOUTHERN CHARTER, levels 8–13) -----
  // The Trade Way below the Delimbiyr, the Fields of the Dead, the Chionthar
  // bank, and the city itself. Every creature already stands in the bestiary;
  // these packs only teach the encounter roller what the south feels like.
  group('coast-way-crews', 'The Coast Way Crews', {
    desc: "Road-thieves with a professional's patience, working the milestones between Daggerford and the Gate: a captain who prices every wagon before he stops it, and two swords who used to wear Fist colours.",
    biomes: ['road', 'plains', 'hills'], cr: 5, faction: 'bandits', minLevel: 7,
    members: [['bandit-captain', 1, 2], ['veteran', 1, 2], ['thug', 2, 4], ['scout', 0, 2]],
  }),
  group('trollbark-foragers', 'Trollbark Foragers', {
    desc: "Trolls down off the Trollbark edge with ogres carrying for them, eating their way along the softest stretch of the Trade Way.",
    biomes: ['road', 'forest', 'plains', 'hills'], cr: 6, faction: 'giant', minLevel: 8,
    members: [['troll', 1, 2], ['ogre', 1, 3]],
  }),
  group('fields-barrow-host', 'The Barrow Host', {
    desc: "The Fields of the Dead giving back what every army left in them: wights walking in rank order, and a wraith where the standard-bearer stood.",
    biomes: ['plains', 'road', 'crypt', 'ruins'], cr: 7, faction: 'undead', minLevel: 9,
    members: [['wight', 1, 3], ['skeleton', 2, 5], ['specter', 1, 2], ['wraith', 0, 1]],
  }),
  group('chionthar-bank-hunters', 'Off the Chionthar Bank', {
    desc: "The river carries things a long way and drops them where the current slows: chuuls in the shallows below the towpath, and standing water on the quay that was not there this morning.",
    biomes: ['coast', 'marsh', 'plains'], cr: 6, faction: null, minLevel: 8,
    members: [['chuul', 1, 2], ['water-weird', 0, 2], ['giant-crab', 0, 3], ['swarm-of-quippers', 0, 2]],
  }),
  group('outer-city-knives', 'Knives in the Outer City', {
    desc: "The unwalled city after the lamps go out: a Guild crew that has stopped pretending to be porters, and one face on the roofline that was buried in Tumbledown last winter.",
    biomes: ['city', 'road'], cr: 6, faction: 'zhentarim', minLevel: 9,
    members: [['thug', 2, 5], ['spy', 1, 2], ['veteran', 0, 2], ['doppelganger', 0, 1]],
  }),
  group('bg-sewer-seep', 'Under the Lower City', {
    desc: "What the drains under Baldur's Gate keep when nobody pays the ratcatcher: wererats with a ledger of their own, and an otyugh in the junction chamber that was old before the Fist was founded.",
    biomes: ['dungeon', 'city', 'cave'], cr: 7, faction: null, minLevel: 10,
    members: [['otyugh', 1, 2], ['wererat', 1, 3], ['swarm-of-rats', 1, 2], ['gray-ooze', 0, 2], ['ghast', 0, 1]],
  }),
  group('bhaalist-remnant', 'The Old Blood', {
    desc: "Four years after the Absolute, the knives that never surrendered: fanatics of the Lord of Murder keeping a shrine nobody has found yet, and one congregant who did not stay dead.",
    biomes: ['city', 'dungeon', 'crypt', 'ruins'], cr: 7, faction: null, minLevel: 10,
    members: [['cult-fanatic', 1, 3], ['cultist', 2, 5], ['spy', 0, 2], ['revenant', 0, 1]],
  }),
  group('tumbledown-emptied-rows', 'The Emptied Rows', {
    desc: "The lower galleries of the Tumbledown crypts, where the ghouls have been doing arithmetic the gravewarden's ledger cannot survive.",
    biomes: ['crypt', 'dungeon'], cr: 5, faction: 'undead', minLevel: 9,
    members: [['ghast', 2, 4], ['ghoul', 2, 5], ['wight', 0, 1]],
  }),
  group('rosymorn-cloister-raiders', 'The Cloister Raiders', {
    desc: "The company squatting in Lathander's abandoned monastery: disciplined blades in the cloister, a construct on the dawn stair, and the thing that leads them doing all of the talking.",
    biomes: ['mountain', 'ruins'], cr: 8, faction: null, minLevel: 10,
    members: [['veteran', 2, 4], ['helmed-horror', 0, 2], ['oni', 0, 1]],
  }),
  group('nashkel-poisoned-seam', 'The Poisoned Seam', {
    desc: "The gallery the Amnish diggers stopped digging toward: hulks in the rock with the ore gone wrong around them, and the flooded dark beyond full of what the mine buried.",
    biomes: ['mine', 'cave'], cr: 8, faction: null, minLevel: 11,
    members: [['umber-hulk', 1, 2], ['gray-ooze', 1, 2], ['wraith', 0, 2]],
  }),
]) GROUPS[g.id] = g;

// ---------------------------------------------------------------------------
// EXPORTS
// ---------------------------------------------------------------------------

/** CR 5–24 bestiary, keyed by id. Bosses live in BOSSES, not here. */
export const MONSTERS_HIGH = deepFreeze(Object.fromEntries(ALL.map((m) => [m.id, m])));

/** Named, unique antagonists with legendary actions, lairs, phases and dialogue. */
export const BOSSES = deepFreeze(Object.fromEntries(BOSS_LIST.map((m) => [m.id, m])));

/** High-tier encounter packs for the wilderness and dungeon tables. */
export const MONSTER_GROUPS_HIGH = deepFreeze(GROUPS);

// ---------------------------------------------------------------------------
// Small pure helpers over this module's own tables. Anything that needs the whole
// bestiary (low + high) belongs in monsters.js instead.
// ---------------------------------------------------------------------------

/** Ids of every CR 5–24 creature, sorted by Challenge Rating. */
export function highMonsterIds() {
  return Object.keys(MONSTERS_HIGH).sort((a, b) => MONSTERS_HIGH[a].cr - MONSTERS_HIGH[b].cr);
}

/** Ids of every named boss, sorted by Challenge Rating. */
export function bossIds() {
  return Object.keys(BOSSES).sort((a, b) => BOSSES[a].cr - BOSSES[b].cr);
}

/** High-tier creatures inside a CR band. */
export function highMonstersByCR(minCR, maxCR) {
  return highMonsterIds().filter((id) => MONSTERS_HIGH[id].cr >= minCR && MONSTERS_HIGH[id].cr <= maxCR);
}

/** High-tier creatures that live in a biome, optionally CR-bounded. */
export function highMonstersByBiome(biome, minCR = 0, maxCR = 30) {
  return highMonsterIds().filter((id) => {
    const m = MONSTERS_HIGH[id];
    return m.biomes.includes(biome) && m.cr >= minCR && m.cr <= maxCR;
  });
}

/** Encounter packs suitable for a biome and party level. */
export function highGroupsFor(biome, partyLevel = 20) {
  return Object.keys(MONSTER_GROUPS_HIGH).filter((id) => {
    const g = MONSTER_GROUPS_HIGH[id];
    return g.biomes.includes(biome) && g.minLevel <= partyLevel;
  });
}

/** The boss a group escalates into, if it has one. */
export function bossForGroup(groupId) {
  const g = MONSTER_GROUPS_HIGH[groupId];
  return g && g.boss ? BOSSES[g.boss] || null : null;
}

/** Every dragon in the module, young through ancient, by colour. */
export function dragonsOfColor(color) {
  return highMonsterIds().filter((id) => MONSTERS_HIGH[id].subtype === color && MONSTERS_HIGH[id].type === 'dragon');
}
