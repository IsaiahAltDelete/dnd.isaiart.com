// src/data/species.js — pure data: 2024 PHB species catalogue (traits, lineages, colorways, sprite mods).
// No imports. Rules engine reads only the `mech` keys listed in SPEC.md §3.
// 2024 rules reminder: species grant NO ability score increases — backgrounds do.

/** Recursively freeze a plain object/array tree. Exported catalogues must never be mutated. */
function deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object' || Object.isFrozen(obj)) return obj;
  for (const k of Object.keys(obj)) deepFreeze(obj[k]);
  return Object.freeze(obj);
}

// ---------------------------------------------------------------------------
// Shared palette fragments (kept local so every species can compose its own set)
// ---------------------------------------------------------------------------
const HUMAN_SKIN = ['#f8e2cc', '#f5d6b8', '#e8c19a', '#d9a878', '#c08a5e', '#a06b45', '#7d4f33', '#5c3a26'];
const HUMAN_HAIR = ['#1b1410', '#2e2119', '#4a3222', '#6b4a2c', '#8a5a2b', '#a8702f', '#c98a3c', '#d9a441', '#eccb7a', '#b23a2a', '#8b8b8b', '#e6e6e6'];
const HUMAN_EYE = ['#3b2a1a', '#5a3d22', '#2f6b8f', '#4f8fbf', '#3f7a4a', '#6b8f3f', '#7a7a7a', '#1b1b1b'];

const ELF_SKIN = ['#f7e3cd', '#efd2b4', '#e0bd96', '#cfa377', '#b98a61', '#9c6f4c', '#e9dcc9', '#d8c9b0'];
const ELF_HAIR = ['#f2ecdf', '#dcd3c0', '#c9bfa4', '#e2c169', '#c99a3f', '#8a5a2b', '#5a3a20', '#2a2018', '#101010', '#9fb3c8', '#b8845f', '#6f7f6a'];
const ELF_EYE = ['#2f6b8f', '#5aa0c4', '#3f7a4a', '#7fbf6a', '#c9a227', '#7a6a8f', '#8a8a8a', '#2a2a2a'];

// ---------------------------------------------------------------------------
// Dragonborn ancestry palettes — scale / horn / eye per chromatic & metallic dragon
// ---------------------------------------------------------------------------
const DRAKE = {
  black: {
    scale: ['#131316', '#1e1e22', '#2a2a2e', '#38383d', '#46464c', '#54545b', '#62626a', '#7a7a82'],
    horn: ['#0f0f12', '#1a1a1e', '#2e2e33', '#46464c', '#6b6b72', '#8f8f96', '#b0b0b8', '#d0d0d6'],
    eye: ['#7fbf6a', '#4a7a3a', '#c9a227', '#d97a3c', '#a33028', '#8f8a80', '#e0e6ea', '#2a2a2a'],
  },
  blue: {
    scale: ['#16304a', '#1f4062', '#2a5580', '#3f6f9f', '#5288b8', '#6ba0cc', '#8bb9dd', '#a8cdea'],
    horn: ['#0f2236', '#1b3550', '#2e4c6b', '#4a6b8a', '#7089a6', '#9aabc0', '#c3ceda', '#e2e8ef'],
    eye: ['#c9a227', '#d9b23c', '#e0e6ea', '#5aa0c4', '#2f6b8f', '#f2f2f2', '#8f8a80', '#2a2a2a'],
  },
  brass: {
    scale: ['#4a3a16', '#6b5320', '#8a6c2b', '#b08d3f', '#c9a552', '#d9bb72', '#e6cf95', '#f2e2bb'],
    horn: ['#3a2e12', '#5a481c', '#7c6428', '#9c8038', '#bda055', '#d6bd82', '#e8d6ac', '#f6ecd2'],
    eye: ['#c9a227', '#d9b23c', '#b5643a', '#7a4a22', '#e0d8c0', '#8f8a80', '#4a7a3a', '#2a2a2a'],
  },
  bronze: {
    scale: ['#3a2c14', '#55411c', '#725628', '#8a6a3a', '#a5824c', '#bd9e68', '#d2b98d', '#e6d5b6'],
    horn: ['#2e2410', '#4a3a1a', '#665028', '#84693a', '#a1875a', '#c0a684', '#dbc7ae', '#efe3d1'],
    eye: ['#3f6f9f', '#5aa0c4', '#c9a227', '#d9b23c', '#e0e6ea', '#8f8a80', '#4a7a3a', '#2a2a2a'],
  },
  copper: {
    scale: ['#4a2412', '#69351c', '#8c4a26', '#b4703a', '#c98a4f', '#d9a26e', '#e6bd95', '#f2d8bd'],
    horn: ['#3a1c0e', '#582c18', '#7a4526', '#9c6138', '#bb8258', '#d3a582', '#e6c6ac', '#f4e0cd'],
    eye: ['#c9a227', '#d97a3c', '#b5643a', '#4a7a3a', '#e0d8c0', '#8f8a80', '#2f6b8f', '#2a2a2a'],
  },
  gold: {
    scale: ['#5a4210', '#7c5c18', '#9e7a24', '#c09b32', '#d9b23c', '#e6c860', '#f0dc93', '#f8edc4'],
    horn: ['#463210', '#68481a', '#8a6528', '#ac853c', '#c9a55c', '#ddc188', '#eddcb4', '#f8f0da'],
    eye: ['#c9a227', '#f2e2a0', '#d9b23c', '#e0e6ea', '#b5643a', '#8f8a80', '#4a7a3a', '#2a2a2a'],
  },
  green: {
    scale: ['#16260f', '#20381a', '#2c4d22', '#3a6329', '#4a7a3a', '#5f9149', '#7cae64', '#a0c78a'],
    horn: ['#101c0c', '#1c2e18', '#2c4326', '#425c38', '#5f7a52', '#849a76', '#aebda3', '#d6e0cd'],
    eye: ['#c9a227', '#d9b23c', '#7fbf6a', '#e0d8c0', '#b5643a', '#8f8a80', '#f2f2f2', '#2a2a2a'],
  },
  red: {
    scale: ['#3a0f0c', '#561714', '#75211c', '#8f2b24', '#a33028', '#bb4a3a', '#cf6b56', '#e29483'],
    horn: ['#2c0c0a', '#461814', '#642722', '#833c34', '#a05a50', '#c08278', '#dbaca4', '#efd4ce'],
    eye: ['#c9a227', '#d97a3c', '#e0d8c0', '#f2c46a', '#a33028', '#8f8a80', '#2a2a2a', '#f2f2f2'],
  },
  silver: {
    scale: ['#4a5057', '#5f676f', '#767f88', '#8e98a1', '#a8b2ba', '#c2cbd2', '#dbe1e6', '#f0f4f7'],
    horn: ['#3a4046', '#4f565d', '#666e76', '#7f878f', '#9aa2aa', '#b6bec5', '#d3d9de', '#eef2f5'],
    eye: ['#2f6b8f', '#5aa0c4', '#c9a227', '#e0e6ea', '#f2f2f2', '#8f8a80', '#7a6a8f', '#2a2a2a'],
  },
  white: {
    scale: ['#8f9aa4', '#a3aeb8', '#b7c2cb', '#cbd5dd', '#dde5ea', '#eef2f5', '#f7fafc', '#78838d'],
    horn: ['#6f7a84', '#848f99', '#99a4ae', '#aeb9c2', '#c4ced6', '#dae2e8', '#eef3f7', '#5c666f'],
    eye: ['#5aa0c4', '#7fbfd6', '#e0e6ea', '#f2f2f2', '#c9a227', '#8f8a80', '#2f6b8f', '#2a2a2a'],
  },
};

/** Build one dragonborn ancestry lineage entry (10 of these, per SPEC.md). */
function drakeLineage(id, name, dragon, dtype, shape, desc, lore) {
  const p = DRAKE[dragon];
  return {
    id,
    name,
    desc,
    lore,
    damageType: dtype,
    breathShape: shape,
    traits: [
      {
        id: 'dragonborn-resistance-' + id,
        name: 'Draconic Resistance',
        desc: "The blood of your progenitor sheds the element it was born to. You take reduced harm from " + dtype + " damage.",
        level: 1,
        mech: { resist: [dtype] },
      },
      {
        id: 'dragonborn-breath-' + id,
        name: 'Breath Weapon',
        desc: "When you take the Attack action you can replace one attack with a gout of " + dtype + " in a " +
          (shape === 'cone' ? '15-foot Cone' : '30-foot Line, 5 feet wide') +
          ". Each creature there makes a Dexterity save (DC 8 + Constitution modifier + Proficiency Bonus), taking the damage on a failure and half as much on a success.",
        level: 1,
        mech: {
          breathWeapon: {
            die: '1d10',
            type: dtype,
            shape,
            save: 'dex',
            // scaling per 2024 PHB: 1d10 / 2d10 at 5th / 3d10 at 11th / 4d10 at 17th
            scale: [{ level: 1, die: '1d10' }, { level: 5, die: '2d10' }, { level: 11, die: '3d10' }, { level: 17, die: '4d10' }],
            length: shape === 'cone' ? 15 : 30,
            width: shape === 'cone' ? 0 : 5,
            onSuccess: 'half',
          },
        },
      },
    ],
    colorways: { skin: p.scale, hair: p.horn, eye: p.eye },
    spriteMods: { scales: true, snout: true, tail: true, horns: true },
  };
}

// ---------------------------------------------------------------------------
// THE CATALOGUE
// ---------------------------------------------------------------------------
const RAW = {

  // =========================================================================
  'human': {
    id: 'human',
    name: 'Human',
    desc: "Chondathan farmers, Illuskan sailors and Tethyrian traders crowd every road from Waterdeep to Neverwinter. Humans are short-lived and restless, and they build faster than the old peoples can object.",
    size: 'medium',
    speed: 30,
    darkvision: 0,
    resist: [],
    immune: [],
    skillGrants: [],
    toolGrants: [],
    languageCount: 2,
    homelands: ['Phandalin', 'Neverwinter', 'Waterdeep', 'Leilon', 'the Dessarin Valley'],
    loreHook: "Illuskan stock out of Neverwinter and Chondathan farmers off the Triboar Trail make up most of Phandalin's muddy little population.",
    lineages: null,
    traits: [
      {
        id: 'human-resourceful',
        name: 'Resourceful',
        desc: "Human stubbornness is its own kind of magic. You gain Heroic Inspiration whenever you finish a Long Rest.",
        level: 1,
        mech: {
          resource: { id: 'heroic-inspiration', name: 'Heroic Inspiration', max: 1, recharge: 'long' },
          passive: 'heroic-inspiration-on-long-rest',
        },
      },
      {
        id: 'human-skillful',
        name: 'Skillful',
        desc: "You picked up a trade, a knack or a bad habit that turned useful. You gain proficiency in one skill of your choice.",
        level: 1,
        mech: {},
        choice: { type: 'skill', count: 1, from: 'any' },
      },
      {
        id: 'human-versatile',
        name: 'Versatile',
        desc: "Humans specialise early and hard. You gain an Origin feat of your choice.",
        level: 1,
        mech: {},
        choice: { type: 'feat', count: 1, from: 'origin' },
      },
    ],
    colorways: { skin: HUMAN_SKIN, hair: HUMAN_HAIR, eye: HUMAN_EYE },
    spriteMods: { ears: 'round', horns: false, tail: false, beard: 'optional', height: 1.0, build: 'normal', snout: false, scales: false, fur: false, wings: false },
  },

  // =========================================================================
  'elf': {
    id: 'elf',
    name: 'Elf',
    desc: "Touched by the Feywild and slow to forget anything, elves measure a human life the way a human measures a season. Some walk the Sword Coast openly; others watch it from the pines and never step onto the road.",
    size: 'medium',
    speed: 30,
    darkvision: 60,
    resist: [],
    immune: [],
    skillGrants: [],
    toolGrants: [],
    languageCount: 2,
    homelands: ['Neverwinter Wood', 'Ardeep Forest', 'Evermeet', 'the High Forest', 'Menzoberranzan (drow)'],
    loreHook: "Wood elves of Neverwinter Wood still trade arrowheads at Barthen's, while drow surface from the Underdark on errands nobody in Phandalin wants explained.",
    traits: [
      {
        id: 'elf-darkvision',
        name: 'Darkvision',
        desc: "You see in dim light within 60 feet as if it were bright light, and in Darkness as if it were dim light — in shades of grey.",
        level: 1,
        mech: { darkvision: 60 },
      },
      {
        id: 'elf-fey-ancestry',
        name: 'Fey Ancestry',
        desc: "Feywild blood resists the pull of another will. You have Advantage on saving throws you make to avoid or end the Charmed condition.",
        level: 1,
        mech: { advSaveVs: ['charmed'], advVs: ['charmed'] },
      },
      {
        id: 'elf-keen-senses',
        name: 'Keen Senses',
        desc: "Centuries of watching teach a keen eye. You gain proficiency in Insight, Perception or Survival.",
        level: 1,
        mech: {},
        choice: { type: 'skill', count: 1, from: ['insight', 'perception', 'survival'] },
      },
      {
        id: 'elf-trance',
        name: 'Trance',
        desc: "You do not sleep. You meditate through the reverie of ancestral memory, and finish a Long Rest in only 4 hours.",
        level: 1,
        mech: { passive: 'trance' },
      },
      {
        id: 'elf-lineage',
        name: 'Elven Lineage',
        desc: "You are of the drow, the high elves or the wood elves, and that heritage sharpens as you grow. Choose the ability used for its spells: Intelligence, Wisdom or Charisma.",
        level: 1,
        mech: {},
        choice: { type: 'ability', count: 1, from: ['int', 'wis', 'cha'] },
      },
    ],
    lineages: [
      {
        id: 'high-elf',
        name: 'High Elf',
        desc: "Raised among towers, libraries and long arguments about the Weave. High elves treat a cantrip the way a smith treats a hammer.",
        lore: "Sun and moon elf houses out of Evermeet and the ruins of Illefarn, some of them now magists in Neverwinter's Protector's Enclave.",
        traits: [
          {
            id: 'elf-high-prestidigitation',
            name: 'Prestidigitation',
            desc: "You know the Prestidigitation cantrip, and may swap it for another Wizard cantrip whenever you finish a Long Rest.",
            level: 1,
            mech: { cantrip: { spellId: 'prestidigitation', ability: 'int' }, passive: 'swap-cantrip-on-long-rest' },
          },
          {
            id: 'elf-high-detect-magic',
            name: 'Detect Magic',
            desc: "You always have Detect Magic prepared and can cast it once per Long Rest without a spell slot, or with slots as normal.",
            level: 3,
            mech: { spellPerRest: [{ spellId: 'detect-magic', level: 1, ability: 'int', uses: 1, recharge: 'long' }] },
          },
          {
            id: 'elf-high-misty-step',
            name: 'Misty Step',
            desc: "You always have Misty Step prepared and can cast it once per Long Rest without a spell slot.",
            level: 5,
            mech: { spellPerRest: [{ spellId: 'misty-step', level: 2, ability: 'int', uses: 1, recharge: 'long' }] },
          },
        ],
        colorways: {
          skin: ['#f7e3cd', '#efd2b4', '#e6d7c4', '#e0bd96', '#cfa377', '#e9dcc9', '#d8c9b0', '#b98a61'],
          hair: ['#f2ecdf', '#e2c169', '#c99a3f', '#d9c07a', '#8a5a2b', '#5a3a20', '#2a2018', '#101010', '#9fb3c8', '#c9bfa4', '#b8845f', '#dcd3c0'],
          eye: ['#c9a227', '#e2c169', '#2f6b8f', '#5aa0c4', '#7a6a8f', '#3f7a4a', '#8a8a8a', '#2a2a2a'],
        },
        spriteMods: { ears: 'long', height: 1.03, build: 'slim' },
      },
      {
        id: 'wood-elf',
        name: 'Wood Elf',
        desc: "Wood elves move through old pine like water through a sieve — quick, quiet and gone before the branch settles.",
        lore: "The green folk of Neverwinter Wood, kin to the archers who still leave carved warnings on the Thundertree road.",
        traits: [
          {
            id: 'elf-wood-speed',
            name: 'Fleet of Foot',
            desc: "Your Speed increases to 35 feet. You do not so much run as decide to be elsewhere.",
            level: 1,
            mech: { speedBonus: 5 },
          },
          {
            id: 'elf-wood-druidcraft',
            name: 'Druidcraft',
            desc: "You know the Druidcraft cantrip, and may swap it for another Druid cantrip when you finish a Long Rest.",
            level: 1,
            mech: { cantrip: { spellId: 'druidcraft', ability: 'wis' }, passive: 'swap-cantrip-on-long-rest' },
          },
          {
            id: 'elf-wood-longstrider',
            name: 'Longstrider',
            desc: "You always have Longstrider prepared and can cast it once per Long Rest without a spell slot.",
            level: 3,
            mech: { spellPerRest: [{ spellId: 'longstrider', level: 1, ability: 'wis', uses: 1, recharge: 'long' }] },
          },
          {
            id: 'elf-wood-pass-without-trace',
            name: 'Pass without Trace',
            desc: "You always have Pass without Trace prepared and can cast it once per Long Rest without a spell slot.",
            level: 5,
            mech: { spellPerRest: [{ spellId: 'pass-without-trace', level: 2, ability: 'wis', uses: 1, recharge: 'long' }] },
          },
        ],
        colorways: {
          skin: ['#e8cfa8', '#d9b58a', '#c89a6c', '#b0824f', '#94693d', '#7a5330', '#cdb997', '#a98d63'],
          hair: ['#5a3a20', '#3f2a16', '#2a2018', '#6f7f6a', '#4f6b3a', '#8a5a2b', '#a8702f', '#c9bfa4', '#7c6a4a', '#101010', '#b8845f', '#d9c07a'],
          eye: ['#4a7a3a', '#7fbf6a', '#6b8f3f', '#c9a227', '#5a3d22', '#2f6b8f', '#8a8a8a', '#2a2a2a'],
        },
        spriteMods: { ears: 'pointed', height: 1.0, build: 'slim' },
      },
      {
        id: 'drow',
        name: 'Drow',
        desc: "Born under stone, raised under Lolth's regard, and burdened forever by a surface world that recognises the face. Drow eyes cut through darkness that blinds even other elves.",
        lore: "Menzoberranzan sends raiders up through the Underdark; Nezznar the Black Spider is only the nearest example of what those errands look like.",
        traits: [
          {
            id: 'elf-drow-darkvision',
            name: 'Superior Darkvision',
            desc: "Your Darkvision has a range of 120 feet. Sunlight, by contrast, is a personal insult.",
            level: 1,
            mech: { darkvision: 120 },
          },
          {
            id: 'elf-drow-dancing-lights',
            name: 'Dancing Lights',
            desc: "You know the Dancing Lights cantrip, and may swap it for another Wizard cantrip when you finish a Long Rest.",
            level: 1,
            mech: { cantrip: { spellId: 'dancing-lights', ability: 'cha' }, passive: 'swap-cantrip-on-long-rest' },
          },
          {
            id: 'elf-drow-faerie-fire',
            name: 'Faerie Fire',
            desc: "You always have Faerie Fire prepared and can cast it once per Long Rest without a spell slot.",
            level: 3,
            mech: { spellPerRest: [{ spellId: 'faerie-fire', level: 1, ability: 'cha', uses: 1, recharge: 'long' }] },
          },
          {
            id: 'elf-drow-darkness',
            name: 'Darkness',
            desc: "You always have Darkness prepared and can cast it once per Long Rest without a spell slot.",
            level: 5,
            mech: { spellPerRest: [{ spellId: 'darkness', level: 2, ability: 'cha', uses: 1, recharge: 'long' }] },
          },
        ],
        colorways: {
          skin: ['#2f2b38', '#3d3846', '#4a4453', '#5a5266', '#6b6275', '#7a7286', '#8c8399', '#9a90a8'],
          hair: ['#f4f1ea', '#e6e0d4', '#d8d0c2', '#cfc7d6', '#bdb3c9', '#9a92a8', '#7f7690', '#3d3648', '#2a2632', '#c9b892', '#a89a7c', '#e8dfe8'],
          eye: ['#c94f4f', '#d97a3c', '#c9a227', '#8f6ac9', '#b04b7a', '#e0d8f0', '#9f9f9f', '#5aa0c4'],
        },
        spriteMods: { ears: 'long', height: 0.98, build: 'slim' },
      },
    ],
    colorways: { skin: ELF_SKIN, hair: ELF_HAIR, eye: ELF_EYE },
    spriteMods: { ears: 'pointed', horns: false, tail: false, beard: 'none', height: 1.02, build: 'slim', snout: false, scales: false, fur: false, wings: false },
  },

  // =========================================================================
  'dwarf': {
    id: 'dwarf',
    name: 'Dwarf',
    desc: "Carved out of the mountains they claim to remember building, dwarves keep grudges, ledgers and load-bearing walls in equal order. Stone speaks to them, and mostly it complains.",
    size: 'medium',
    speed: 30,
    darkvision: 120,
    resist: ['poison'],
    immune: [],
    skillGrants: [],
    toolGrants: [],
    languageCount: 2,
    homelands: ['Mithral Hall', 'Citadel Adbar', 'Citadel Felbarr', 'Gauntlgrym', 'Icewind Dale delves'],
    loreHook: "Shield dwarves of Mithral Hall still drift south to the Sword Coast chasing old claims — the Rockseeker brothers came to Phandalin looking for Wave Echo Cave.",
    lineages: null,
    traits: [
      {
        id: 'dwarf-darkvision',
        name: 'Darkvision',
        desc: "You see in dim light within 120 feet as if it were bright light, and in Darkness as if it were dim light. A dwarf carries a lantern out of courtesy, not need.",
        level: 1,
        mech: { darkvision: 120 },
      },
      {
        id: 'dwarf-resilience',
        name: 'Dwarven Resilience',
        desc: "Bad ale, worse air and centuries of both. You have Resistance to Poison damage and Advantage on saving throws you make to avoid or end the Poisoned condition.",
        level: 1,
        mech: { resist: ['poison'], advSaveVs: ['poison', 'poisoned'] },
      },
      {
        id: 'dwarf-toughness',
        name: 'Dwarven Toughness',
        desc: "Your Hit Point maximum increases by 1, and it increases by 1 again every time you gain a level.",
        level: 1,
        mech: { hpPerLevel: 1 },
      },
      {
        id: 'dwarf-stonecunning',
        name: 'Stonecunning',
        desc: "As a Bonus Action you gain Tremorsense out to 60 feet for 10 minutes, so long as you and the stone share the ground. You can do this a number of times equal to your Proficiency Bonus per Long Rest.",
        level: 1,
        mech: {
          resource: { id: 'stonecunning', name: 'Stonecunning', max: 'prof', recharge: 'long' },
          passive: 'stonecunning-tremorsense',
        },
      },
    ],
    colorways: {
      skin: ['#f7ddc0', '#f0cba8', '#e0b48c', '#c9946a', '#ad7a52', '#8c5f3d', '#6b482e', '#d9b08c'],
      hair: ['#8c2f1e', '#b34a24', '#c96a2a', '#7a4a22', '#5a3418', '#3a2414', '#1c1410', '#5f4a3a', '#7f7f7f', '#a8a8a8', '#e2e2e2', '#d9a441'],
      eye: ['#3b2a1a', '#5a3d22', '#2f6b8f', '#3f7a4a', '#7a7a7a', '#c9a227', '#4a3a55', '#1b1b1b'],
    },
    spriteMods: { ears: 'round', horns: false, tail: false, beard: 'common', height: 0.85, build: 'stout', snout: false, scales: false, fur: false, wings: false },
  },

  // =========================================================================
  'halfling': {
    id: 'halfling',
    name: 'Halfling',
    desc: "Cheerful, practical and very hard to kill, halflings farm the safe green places and wander the dangerous ones anyway. Luck follows them about like a dog that will not be sent home.",
    size: 'small',
    speed: 30,
    darkvision: 0,
    resist: [],
    immune: [],
    skillGrants: [],
    toolGrants: [],
    languageCount: 2,
    homelands: ['Alderleaf Farm in Phandalin', 'Goldenfields', 'the Dessarin Valley', 'Luiren-descended families of Waterdeep'],
    loreHook: "Qelline Alderleaf farms the south edge of Phandalin and knows every trail into Neverwinter Wood, mostly because her boy Carp keeps finding them.",
    lineages: null,
    traits: [
      {
        id: 'halfling-brave',
        name: 'Brave',
        desc: "You have Advantage on saving throws you make to avoid or end the Frightened condition. Halflings simply refuse to be impressed.",
        level: 1,
        mech: { advSaveVs: ['frightened'], advVs: ['frightened'] },
      },
      {
        id: 'halfling-nimbleness',
        name: 'Halfling Nimbleness',
        desc: "You can move through the space of any creature that is a size larger than you, though you cannot stop there.",
        level: 1,
        mech: { passive: 'move-through-larger' },
      },
      {
        id: 'halfling-luck',
        name: 'Lucky',
        desc: "When you roll a 1 on the d20 of a D20 Test, you reroll the die and must use the new roll. Tymora likes small folk.",
        level: 1,
        mech: { passive: 'halfling-luck' },
      },
      {
        id: 'halfling-naturally-stealthy',
        name: 'Naturally Stealthy',
        desc: "You can take the Hide action even when you are obscured only by a creature at least one size larger than you.",
        level: 1,
        mech: { passive: 'naturally-stealthy' },
      },
    ],
    colorways: {
      skin: ['#f6dcbb', '#eac89f', '#f2cdaa', '#e3b78f', '#d8ab7c', '#c08f60', '#a2724a', '#7f5734'],
      hair: ['#3a2414', '#5a3418', '#7a4a22', '#a8702f', '#c98a3c', '#d9a441', '#e6c67a', '#8c2f1e', '#b34a24', '#1c1410', '#8b8b8b', '#5f4a3a'],
      eye: ['#3b2a1a', '#5a3d22', '#3f7a4a', '#6b8f3f', '#2f6b8f', '#7a7a7a', '#c9a227', '#1b1b1b'],
    },
    spriteMods: { ears: 'round', horns: false, tail: false, beard: 'optional', height: 0.85, build: 'slim', snout: false, scales: false, fur: false, wings: false },
  },

  // =========================================================================
  'dragonborn': {
    id: 'dragonborn',
    name: 'Dragonborn',
    desc: "Scaled, proud and built like a door, dragonborn carry the breath of a true dragon in their throats. Clan honour is the first thing they mention and the last thing they surrender.",
    size: 'medium',
    speed: 30,
    darkvision: 60,
    resist: [],
    immune: [],
    skillGrants: [],
    toolGrants: [],
    languageCount: 2,
    homelands: ['Tymanther expatriate clans', 'Neverwinter mercenary companies', 'Waterdeep', 'Baldur’s Gate caravan guards'],
    loreHook: "Dragonborn sellswords hire out of Neverwinter to walk the High Road, and the Cult of the Dragon courts every one of them it can find.",
    traits: [
      {
        id: 'dragonborn-darkvision',
        name: 'Darkvision',
        desc: "You see in dim light within 60 feet as if it were bright light, and in Darkness as if it were dim light.",
        level: 1,
        mech: { darkvision: 60 },
      },
      {
        id: 'dragonborn-ancestry',
        name: 'Draconic Ancestry',
        desc: "Your lineage traces to one kind of true dragon, which sets the damage your breath deals and the harm your scales shrug off.",
        level: 1,
        mech: {},
        choice: { type: 'lineage', count: 1, from: 'auto' },
      },
      {
        id: 'dragonborn-breath-uses',
        name: 'Breath Weapon Uses',
        desc: "You can use your Breath Weapon a number of times equal to your Proficiency Bonus, and regain all uses on a Long Rest.",
        level: 1,
        mech: { resource: { id: 'breath-weapon', name: 'Breath Weapon', max: 'prof', recharge: 'long' } },
      },
      {
        id: 'dragonborn-draconic-flight',
        name: 'Draconic Flight',
        desc: "As a Bonus Action you sprout spectral wings for 10 minutes, gaining a Fly Speed equal to your Speed. Once per Long Rest.",
        level: 5,
        mech: {
          passive: 'draconic-flight',
          resource: { id: 'draconic-flight', name: 'Draconic Flight', max: 1, recharge: 'long' },
        },
      },
    ],
    lineages: [
      drakeLineage('black-dragon', 'Black Dragon Ancestry', 'black', 'acid', 'line',
        "Bog-black scales and a spitting line of acid. Black-blooded dragonborn are patient in the way a swamp is patient.",
        "Black wyrms brood in the Mere of Dead Men; their scions inherit the temper along with the scales."),
      drakeLineage('blue-dragon', 'Blue Dragon Ancestry', 'blue', 'lightning', 'line',
        "Storm-blue plating and a lance of lightning that leaves the air smelling scorched.",
        "Blue-blooded clans favour the dry hills east of the Sword Mountains, where the storms come in hard."),
      drakeLineage('brass-dragon', 'Brass Dragon Ancestry', 'brass', 'fire', 'line',
        "Warm brass scales and a talkative streak. Your breath comes out as a searing line of flame.",
        "Brass-blooded dragonborn make notoriously good caravan guides and impossible drinking companions."),
      drakeLineage('bronze-dragon', 'Bronze Dragon Ancestry', 'bronze', 'lightning', 'line',
        "Sea-bronze scales and a lightning line like a snapped cable. Bronze blood runs to duty.",
        "Bronze-blooded families take Lords’ Alliance coin along the coast road from Leilon to Neverwinter."),
      drakeLineage('copper-dragon', 'Copper Dragon Ancestry', 'copper', 'acid', 'line',
        "Copper scales, a joker’s grin and a stream of acid for anyone who does not laugh.",
        "Copper-blooded dragonborn haunt the Sword Mountain passes and steal from the Cragmaw goblins for fun."),
      drakeLineage('gold-dragon', 'Gold Dragon Ancestry', 'gold', 'fire', 'cone',
        "Gilded scales and a cone of righteous fire. Gold blood carries expectations the bearer rarely asked for.",
        "Gold-blooded dragonborn are courted hard by the Order of the Gauntlet, and sometimes even accept."),
      drakeLineage('green-dragon', 'Green Dragon Ancestry', 'green', 'poison', 'cone',
        "Forest-green scales and a billow of poisonous vapour. Green blood whispers before it strikes.",
        "Venomfang keeps a tower in Thundertree; green-blooded dragonborn are never sure whether that is kin or quarry."),
      drakeLineage('red-dragon', 'Red Dragon Ancestry', 'red', 'fire', 'cone',
        "Crimson scales and a cone of furnace fire. Red blood is proud, loud and slow to cool.",
        "Red-blooded clans came north with the Thayan trade and settled where the forges are hottest."),
      drakeLineage('silver-dragon', 'Silver Dragon Ancestry', 'silver', 'cold', 'cone',
        "Mirror-silver scales and a cone of killing frost. Silver blood tends to protect first and explain later.",
        "Silver-blooded dragonborn walk the High Road in winter because nobody else will."),
      drakeLineage('white-dragon', 'White Dragon Ancestry', 'white', 'cold', 'cone',
        "Rime-white scales and a cone of glacial cold. White blood is simple, hungry and direct.",
        "Cryovain hunts out of Icespire Peak, and white-blooded dragonborn hear about it constantly."),
    ],
    colorways: {
      skin: ['#2a2a2e', '#3f6f9f', '#b08d3f', '#8a6a3a', '#b4703a', '#d9b23c', '#4a7a3a', '#a33028', '#c9d0d6', '#eef2f5'],
      hair: ['#e8e0cf', '#d8cdb4', '#c2b79a', '#8f866f', '#5f5a4c', '#3a362e', '#1e1c18', '#b08d3f', '#c9d0d6', '#a33028', '#3f6f9f', '#4a7a3a'],
      eye: ['#c9a227', '#d97a3c', '#c94f4f', '#4a7a3a', '#3f6f9f', '#8a8a8a', '#e0e6ea', '#2a2a2a'],
    },
    spriteMods: { ears: 'none', horns: true, tail: true, beard: 'none', height: 1.08, build: 'broad', snout: true, scales: true, fur: false, wings: false },
  },

  // =========================================================================
  'gnome': {
    id: 'gnome',
    name: 'Gnome',
    desc: "Small, bright-eyed and dangerously curious, gnomes take apart anything that holds still. Garl Glittergold gave them enthusiasm; nobody thought to give them caution.",
    size: 'small',
    speed: 30,
    darkvision: 60,
    resist: [],
    immune: [],
    skillGrants: [],
    toolGrants: [],
    languageCount: 2,
    homelands: ['the Rock of Bral warrens', 'Lantan expatriates', 'Neverwinter Wood burrows', 'Waterdeep’s Trades Ward'],
    loreHook: "Rock gnome tinkers rent workshop corners in Neverwinter and sell clockwork trinkets down the Triboar Trail; forest gnomes just watch from the ferns.",
    traits: [
      {
        id: 'gnome-darkvision',
        name: 'Darkvision',
        desc: "You see in dim light within 60 feet as if it were bright light, and in Darkness as if it were dim light.",
        level: 1,
        mech: { darkvision: 60 },
      },
      {
        id: 'gnome-cunning',
        name: 'Gnomish Cunning',
        desc: "A mind like a locked box with the key on the inside. You have Advantage on Intelligence, Wisdom and Charisma saving throws.",
        level: 1,
        mech: { advSaveVs: ['int', 'wis', 'cha'], passive: 'gnomish-cunning' },
      },
      {
        id: 'gnome-lineage',
        name: 'Gnomish Lineage',
        desc: "You are of the forest gnomes or the rock gnomes. Choose the ability used for the lineage spells: Intelligence, Wisdom or Charisma.",
        level: 1,
        mech: {},
        choice: { type: 'ability', count: 1, from: ['int', 'wis', 'cha'] },
      },
    ],
    lineages: [
      {
        id: 'forest-gnome',
        name: 'Forest Gnome',
        desc: "Woodland gnomes hide well, talk to squirrels and consider both to be practical skills.",
        lore: "Forest gnome burrows honeycomb the western edge of Neverwinter Wood; Reidoth the druid knows where three of them are.",
        traits: [
          {
            id: 'gnome-forest-minor-illusion',
            name: 'Minor Illusion',
            desc: "You know the Minor Illusion cantrip, and use it mostly for pranks and once, memorably, for a war.",
            level: 1,
            mech: { cantrip: { spellId: 'minor-illusion', ability: 'int' } },
          },
          {
            id: 'gnome-forest-speak-with-animals',
            name: 'Speak with Animals',
            desc: "You always have Speak with Animals prepared and can cast it without a spell slot a number of times equal to your Proficiency Bonus per Long Rest.",
            level: 1,
            mech: { spellPerRest: [{ spellId: 'speak-with-animals', level: 1, ability: 'int', uses: 'prof', recharge: 'long' }] },
          },
        ],
        colorways: {
          skin: ['#e8d0a8', '#d6b88c', '#c2a070', '#a8854f', '#8f6c3e', '#efc9a6', '#cdbb99', '#75552f'],
          hair: ['#6f7f4a', '#4f6b3a', '#7a4a22', '#a8702f', '#c2a56a', '#dcd0b8', '#f0ece0', '#5a3418', '#2e2119', '#8c2f1e', '#9f9f9f', '#d9a441'],
          eye: ['#3f7a4a', '#6b8f3f', '#c9a227', '#5a3d22', '#2f6b8f', '#7a6a8f', '#8a8a8a', '#1b1b1b'],
        },
        spriteMods: { ears: 'pointed', beard: 'optional', height: 0.84, build: 'slim' },
      },
      {
        id: 'rock-gnome',
        name: 'Rock Gnome',
        desc: "Rock gnomes build. Constantly. Their pockets rattle with springs, and something in there is usually still ticking.",
        lore: "Rock gnome artificers keep Gond’s house in Neverwinter and sell their odder inventions quietly at Barthen’s Provisions.",
        traits: [
          {
            id: 'gnome-rock-cantrips',
            name: 'Artificer’s Lore',
            desc: "You know the Mending and Prestidigitation cantrips. Nothing in your possession stays broken for long.",
            level: 1,
            mech: { cantrip: { spellId: 'mending', ability: 'int' }, passive: 'rock-gnome-prestidigitation' },
          },
          {
            id: 'gnome-rock-tinker',
            name: 'Tinker',
            desc: "Spending 10 minutes and Prestidigitation, you build a Tiny clockwork device that makes noise, gives off light or throws sparks for 8 hours.",
            level: 1,
            mech: { toolProf: ['tinkers-tools'], passive: 'gnome-tinker-device' },
          },
        ],
        colorways: {
          skin: ['#f2d6b3', '#e4bf96', '#d0a274', '#b8854f', '#9a6a3f', '#7c5230', '#efc9a6', '#dbb083'],
          hair: ['#f0ece0', '#dcd0b8', '#c2a56a', '#a8702f', '#7a4a22', '#5a3418', '#2e2119', '#8c2f1e', '#b34a24', '#9f9f9f', '#d9a441', '#5f4a3a'],
          eye: ['#2f6b8f', '#3f7a4a', '#c9a227', '#5a3d22', '#7a6a8f', '#8a8a8a', '#6b8f3f', '#1b1b1b'],
        },
        spriteMods: { ears: 'pointed', beard: 'common', height: 0.86, build: 'normal' },
      },
    ],
    colorways: {
      skin: ['#f2d6b3', '#e4bf96', '#d0a274', '#b8854f', '#9a6a3f', '#7c5230', '#efc9a6', '#dbb083'],
      hair: ['#f0ece0', '#dcd0b8', '#c2a56a', '#a8702f', '#7a4a22', '#5a3418', '#2e2119', '#8c2f1e', '#6f7f4a', '#4f6b3a', '#9f9f9f', '#d9a441'],
      eye: ['#2f6b8f', '#3f7a4a', '#c9a227', '#5a3d22', '#7a6a8f', '#8a8a8a', '#6b8f3f', '#1b1b1b'],
    },
    spriteMods: { ears: 'pointed', horns: false, tail: false, beard: 'common', height: 0.85, build: 'normal', snout: false, scales: false, fur: false, wings: false },
  },

  // =========================================================================
  'orc': {
    id: 'orc',
    name: 'Orc',
    desc: "Gruumsh made orcs to endure, and endure they do — through blizzards, sieges and the long grudge of every kingdom that ever locked a gate against them. An orc who decides to keep going is very difficult to stop.",
    size: 'medium',
    speed: 30,
    darkvision: 120,
    resist: [],
    immune: [],
    skillGrants: [],
    toolGrants: [],
    languageCount: 2,
    homelands: ['the Kingdom of Many-Arrows', 'the Spine of the World', 'Wyvern Tor camps', 'the Sword Mountains'],
    loreHook: "Many-Arrows warbands still drift down to Wyvern Tor, but plenty of orcs walk into Phandalin for honest work and get treated like a raid anyway.",
    lineages: null,
    traits: [
      {
        id: 'orc-darkvision',
        name: 'Darkvision',
        desc: "You see in dim light within 120 feet as if it were bright light, and in Darkness as if it were dim light. Underdark ancestry leaves its mark.",
        level: 1,
        mech: { darkvision: 120 },
      },
      {
        id: 'orc-adrenaline-rush',
        name: 'Adrenaline Rush',
        desc: "You can take the Dash action as a Bonus Action, gaining Temporary Hit Points equal to your Proficiency Bonus when you do. Uses equal to your Proficiency Bonus, regained on a Short or Long Rest.",
        level: 1,
        mech: {
          passive: 'adrenaline-rush',
          resource: { id: 'adrenaline-rush', name: 'Adrenaline Rush', max: 'prof', recharge: 'short' },
        },
      },
      {
        id: 'orc-relentless-endurance',
        name: 'Relentless Endurance',
        desc: "When you are reduced to 0 Hit Points but not killed outright, you drop to 1 Hit Point instead. Once per Long Rest. Gruumsh is not finished with you.",
        level: 1,
        mech: {
          passive: 'relentless-endurance',
          resource: { id: 'relentless-endurance', name: 'Relentless Endurance', max: 1, recharge: 'long' },
        },
      },
      {
        id: 'orc-powerful-build',
        name: 'Powerful Build',
        desc: "You have Advantage on ability checks made to end the Grappled condition, and you count as one size larger for carrying capacity and lifting.",
        level: 1,
        mech: { carryMult: 2, passive: 'powerful-build' },
      },
    ],
    colorways: {
      skin: ['#9fb27f', '#8fa96f', '#7f9b62', '#6b8a52', '#5a7745', '#4a6539', '#6f7f6a', '#55604f', '#8a8f6a', '#a0a882'],
      hair: ['#141414', '#1e1a18', '#2a2420', '#3a3028', '#4a3a2c', '#5a4a3a', '#3f4a3a', '#2a3326', '#6b6b6b', '#8f8f8f', '#b5b5b5', '#e2e2e2'],
      eye: ['#c9a227', '#d97a3c', '#a33028', '#7a7a7a', '#4a6539', '#2f6b8f', '#e0d8c0', '#1b1b1b'],
    },
    spriteMods: { ears: 'pointed', horns: false, tail: false, beard: 'optional', height: 1.1, build: 'broad', snout: false, scales: false, fur: false, wings: false, tusks: true },
  },

  // =========================================================================
  'tiefling': {
    id: 'tiefling',
    name: 'Tiefling',
    desc: "Somewhere back down the bloodline a bargain was struck, and the interest is still being paid in horns, tails and suspicious looks. Tieflings are plane-touched, not damned — though try telling a Phandalin farmer that.",
    size: 'medium',
    speed: 30,
    darkvision: 60,
    resist: [],
    immune: [],
    skillGrants: [],
    toolGrants: [],
    languageCount: 2,
    homelands: ['Neverwinter’s Blacklake District', 'Baldur’s Gate', 'Waterdeep', 'the ruins of old Netheril'],
    loreHook: "Tiefling families have kept shops in Neverwinter since the Spellplague years, and every one of them has heard the Blacklake rumours twice.",
    traits: [
      {
        id: 'tiefling-darkvision',
        name: 'Darkvision',
        desc: "You see in dim light within 60 feet as if it were bright light, and in Darkness as if it were dim light.",
        level: 1,
        mech: { darkvision: 60 },
      },
      {
        id: 'tiefling-otherworldly-presence',
        name: 'Otherworldly Presence',
        desc: "You know the Thaumaturgy cantrip, cast with the ability chosen for your Fiendish Legacy. Doors slam when you are annoyed.",
        level: 1,
        mech: { cantrip: { spellId: 'thaumaturgy', ability: 'cha' } },
        choice: { type: 'ability', count: 1, from: ['int', 'wis', 'cha'] },
      },
      {
        id: 'tiefling-fiendish-legacy',
        name: 'Fiendish Legacy',
        desc: "Your bloodline runs Abyssal, Chthonic or Infernal, and the plane it came from shapes what you resist and what you can call up.",
        level: 1,
        mech: {},
        choice: { type: 'lineage', count: 1, from: 'auto' },
      },
    ],
    lineages: [
      {
        id: 'abyssal',
        name: 'Abyssal Legacy',
        desc: "Demon-touched: chaotic, corrosive, and never quite still. Abyssal tieflings tend to run hot and heal poorly.",
        lore: "Abyssal blood surfaces around old cult sites — the Dessarin ruins and the deeper cells of the Zhentarim keep turning them up.",
        traits: [
          {
            id: 'tiefling-abyssal-resist',
            name: 'Abyssal Resilience',
            desc: "You have Resistance to Poison damage, and know the Poison Spray cantrip.",
            level: 1,
            mech: { resist: ['poison'], cantrip: { spellId: 'poison-spray', ability: 'cha' } },
          },
          {
            id: 'tiefling-abyssal-ray-of-sickness',
            name: 'Ray of Sickness',
            desc: "You always have Ray of Sickness prepared and can cast it once per Long Rest without a spell slot.",
            level: 3,
            mech: { spellPerRest: [{ spellId: 'ray-of-sickness', level: 1, ability: 'cha', uses: 1, recharge: 'long' }] },
          },
          {
            id: 'tiefling-abyssal-hold-person',
            name: 'Hold Person',
            desc: "You always have Hold Person prepared and can cast it once per Long Rest without a spell slot.",
            level: 5,
            mech: { spellPerRest: [{ spellId: 'hold-person', level: 2, ability: 'cha', uses: 1, recharge: 'long' }] },
          },
        ],
        colorways: {
          skin: ['#7a2f4a', '#8f3a5c', '#5f3a6b', '#4a3f7a', '#6b2f2f', '#a04a6a', '#c9603f', '#3d2a48'],
          hair: ['#141014', '#2a1a24', '#5f3a6b', '#7a4f8f', '#8c2f1e', '#b34a24', '#2f4a7a', '#c9a227', '#e8e0e8', '#9f9f9f', '#d9a441', '#3a2414'],
          eye: ['#7a4f8f', '#c94f4f', '#4a7a3a', '#c9a227', '#e8e8e8', '#d97a3c', '#2f6b8f', '#1b1b1b'],
        },
        spriteMods: { horns: true, tail: true },
      },
      {
        id: 'chthonic',
        name: 'Chthonic Legacy',
        desc: "Touched by the grey lands of the dead. Chthonic tieflings feel cold to the touch and are unbothered by graveyards.",
        lore: "Kelemvor’s clergy in Waterdeep watch chthonic bloodlines closely, and Thayan agents like Hamun Kost court them.",
        traits: [
          {
            id: 'tiefling-chthonic-resist',
            name: 'Chthonic Resilience',
            desc: "You have Resistance to Necrotic damage, and know the Chill Touch cantrip.",
            level: 1,
            mech: { resist: ['necrotic'], cantrip: { spellId: 'chill-touch', ability: 'cha' } },
          },
          {
            id: 'tiefling-chthonic-false-life',
            name: 'False Life',
            desc: "You always have False Life prepared and can cast it once per Long Rest without a spell slot.",
            level: 3,
            mech: { spellPerRest: [{ spellId: 'false-life', level: 1, ability: 'cha', uses: 1, recharge: 'long' }] },
          },
          {
            id: 'tiefling-chthonic-ray-of-enfeeblement',
            name: 'Ray of Enfeeblement',
            desc: "You always have Ray of Enfeeblement prepared and can cast it once per Long Rest without a spell slot.",
            level: 5,
            mech: { spellPerRest: [{ spellId: 'ray-of-enfeeblement', level: 2, ability: 'cha', uses: 1, recharge: 'long' }] },
          },
        ],
        colorways: {
          skin: ['#4a3f7a', '#3f5f7a', '#5a5a6b', '#6b6478', '#3a3f4a', '#8a8496', '#a89aae', '#2b2b36'],
          hair: ['#141014', '#2a2632', '#3d3648', '#5f3a6b', '#2f4a7a', '#7a7690', '#9f9f9f', '#c8c2d2', '#e8e0e8', '#8c2f1e', '#c9a227', '#3a2414'],
          eye: ['#e8e8e8', '#c8c2d2', '#7a4f8f', '#2f6b8f', '#c94f4f', '#c9a227', '#8a8a8a', '#1b1b1b'],
        },
        spriteMods: { horns: true, tail: true },
      },
      {
        id: 'infernal',
        name: 'Infernal Legacy',
        desc: "Nine Hells stock: orderly, contractual and warm to the touch. Infernal tieflings usually know exactly what their ancestor signed.",
        lore: "Infernal pacts still bind old Neverwintan merchant houses, and their heirs walk the High Road carrying the bill.",
        traits: [
          {
            id: 'tiefling-infernal-resist',
            name: 'Infernal Resilience',
            desc: "You have Resistance to Fire damage, and know the Fire Bolt cantrip.",
            level: 1,
            mech: { resist: ['fire'], cantrip: { spellId: 'fire-bolt', ability: 'cha' } },
          },
          {
            id: 'tiefling-infernal-hellish-rebuke',
            name: 'Hellish Rebuke',
            desc: "You always have Hellish Rebuke prepared and can cast it once per Long Rest without a spell slot.",
            level: 3,
            mech: { spellPerRest: [{ spellId: 'hellish-rebuke', level: 1, ability: 'cha', uses: 1, recharge: 'long' }] },
          },
          {
            id: 'tiefling-infernal-darkness',
            name: 'Darkness',
            desc: "You always have Darkness prepared and can cast it once per Long Rest without a spell slot.",
            level: 5,
            mech: { spellPerRest: [{ spellId: 'darkness', level: 2, ability: 'cha', uses: 1, recharge: 'long' }] },
          },
        ],
        colorways: {
          skin: ['#b8443a', '#9a2f2f', '#c9603f', '#d98a6a', '#7a2020', '#e0b39a', '#8f3320', '#5f1c1c'],
          hair: ['#141014', '#2a1a1a', '#8c2f1e', '#b34a24', '#d9a441', '#c9a227', '#e8e0e8', '#9f9f9f', '#5f3a6b', '#2f4a7a', '#3a2414', '#f0e0d0'],
          eye: ['#c94f4f', '#d97a3c', '#c9a227', '#e8e8e8', '#7a4f8f', '#2f6b8f', '#4a7a3a', '#1b1b1b'],
        },
        spriteMods: { horns: true, tail: true },
      },
    ],
    colorways: {
      skin: ['#b8443a', '#9a2f2f', '#c9603f', '#d98a6a', '#7a2f4a', '#5f3a6b', '#4a3f7a', '#3f5f7a', '#e0b39a', '#6b2f2f'],
      hair: ['#141014', '#2a1a24', '#8c2f1e', '#b34a24', '#5f3a6b', '#7a4f8f', '#2f4a7a', '#c9a227', '#e8e0e8', '#9f9f9f', '#d9a441', '#3a2414'],
      eye: ['#c94f4f', '#d97a3c', '#c9a227', '#7a4f8f', '#2f6b8f', '#e8e8e8', '#4a7a3a', '#1b1b1b'],
    },
    spriteMods: { ears: 'long', horns: true, tail: true, beard: 'none', height: 1.0, build: 'normal', snout: false, scales: false, fur: false, wings: false },
  },

  // =========================================================================
  'aasimar': {
    id: 'aasimar',
    name: 'Aasimar',
    desc: "An aasimar carries a shard of the Upper Planes in the soul, placed there by a celestial with plans it rarely explains. Light leaks out of them at the worst possible moments.",
    size: 'medium',
    speed: 30,
    darkvision: 60,
    resist: ['necrotic', 'radiant'],
    immune: [],
    skillGrants: [],
    toolGrants: [],
    languageCount: 2,
    homelands: ['Waterdeep temple wards', 'Neverwinter', 'the House of the Morning in Phandalin’s hinterland', 'Elturel exiles'],
    loreHook: "Lathander’s and Torm’s clergy both claim any aasimar who walks the Triboar Trail, and the Order of the Gauntlet asks first.",
    traits: [
      {
        id: 'aasimar-darkvision',
        name: 'Darkvision',
        desc: "You see in dim light within 60 feet as if it were bright light, and in Darkness as if it were dim light.",
        level: 1,
        mech: { darkvision: 60 },
      },
      {
        id: 'aasimar-celestial-resistance',
        name: 'Celestial Resistance',
        desc: "You have Resistance to Necrotic damage and Radiant damage. The grave and the sun both go gently with you.",
        level: 1,
        mech: { resist: ['necrotic', 'radiant'] },
      },
      {
        id: 'aasimar-healing-hands',
        name: 'Healing Hands',
        desc: "As a Magic action you touch a creature and roll a number of d4s equal to your Proficiency Bonus, restoring that many Hit Points. Once per Long Rest.",
        level: 1,
        mech: {
          passive: 'healing-hands',
          resource: { id: 'healing-hands', name: 'Healing Hands', max: 1, recharge: 'long' },
        },
      },
      {
        id: 'aasimar-light-bearer',
        name: 'Light Bearer',
        desc: "You know the Light cantrip, cast with Charisma. Dark rooms have a habit of forgetting themselves around you.",
        level: 1,
        mech: { cantrip: { spellId: 'light', ability: 'cha' } },
      },
      {
        id: 'aasimar-celestial-revelation',
        name: 'Celestial Revelation',
        desc: "As a Bonus Action you unveil your celestial nature for 1 minute, once per Long Rest. Once per turn while transformed, you deal extra damage equal to your Proficiency Bonus when you hit with an attack or a damaging spell.",
        level: 3,
        mech: {
          passive: 'celestial-revelation',
          resource: { id: 'celestial-revelation', name: 'Celestial Revelation', max: 1, recharge: 'long' },
        },
        choice: { type: 'lineage', count: 1, from: 'auto' },
      },
    ],
    lineages: [
      {
        id: 'heavenly-wings',
        name: 'Heavenly Wings',
        desc: "Spectral wings unfold from your shoulders and you leave the ground behind. Older texts call this the Radiant Soul.",
        lore: "Winged aasimar are read as omens all along the Sword Coast, which makes quiet travel impossible.",
        traits: [
          {
            id: 'aasimar-heavenly-wings',
            name: 'Heavenly Wings',
            desc: "While transformed you have a Fly Speed equal to your Speed, and the extra damage from your Revelation is Radiant.",
            level: 3,
            mech: { passive: 'revelation-heavenly-wings' },
          },
        ],
        colorways: {
          skin: ['#f7e6cf', '#f0d5b4', '#e0bd96', '#c9a077', '#a8825c', '#efe4d0', '#d8c2a8', '#856245'],
          hair: ['#f5efdc', '#e8dcbf', '#d9c07a', '#c9a227', '#b8863f', '#8a5a2b', '#5a3a20', '#2a2018', '#dfe6ee', '#b9c6d6', '#e6d0d0', '#9f9f9f'],
          eye: ['#e8e2c8', '#c9a227', '#7fbfd6', '#2f6b8f', '#f2f2f2', '#7a6a8f', '#3f7a4a', '#3b2a1a'],
        },
        spriteMods: { wings: true },
      },
      {
        id: 'inner-radiance',
        name: 'Inner Radiance',
        desc: "You burn. Light pours off you in a 10-foot circle and scalds anything standing too close. Older texts call this Radiant Consumption.",
        lore: "Morninglord priests in Neverwinter treat inner radiance as Lathander answering a question nobody asked out loud.",
        traits: [
          {
            id: 'aasimar-inner-radiance',
            name: 'Inner Radiance',
            desc: "While transformed you shed Bright Light in a 10-foot radius and dim light for another 10 feet, and each creature that ends its turn within 10 feet of you takes Radiant damage equal to your Proficiency Bonus. The extra damage from your Revelation is Radiant.",
            level: 3,
            mech: { passive: 'revelation-inner-radiance' },
          },
        ],
        colorways: {
          skin: ['#fbf1dc', '#f5e2c2', '#e9cfa6', '#d6b585', '#bd9a68', '#9c7c4e', '#f0e6d6', '#c8b49a'],
          hair: ['#f8f2d8', '#eddcae', '#dcc57a', '#c9a227', '#b08d3f', '#8a6a2b', '#5a4620', '#2a2418', '#f2e2a0', '#e6d0a0', '#cfcfcf', '#9f9f9f'],
          eye: ['#f2e2a0', '#e8e2c8', '#c9a227', '#d9b23c', '#f2f2f2', '#7fbfd6', '#3f7a4a', '#3b2a1a'],
        },
        spriteMods: { wings: false },
      },
      {
        id: 'necrotic-shroud',
        name: 'Necrotic Shroud',
        desc: "Your eyes go black, a lightless halo opens behind your head, and the room understands the situation immediately.",
        lore: "Kelemvor’s faithful say the shroud is mercy wearing its working clothes; most Phandalin folk just back away.",
        traits: [
          {
            id: 'aasimar-necrotic-shroud',
            name: 'Necrotic Shroud',
            desc: "When you transform, each creature within 10 feet must succeed on a Charisma saving throw (DC 8 + Charisma modifier + Proficiency Bonus) or have the Frightened condition until the end of your next turn. The extra damage from your Revelation is Necrotic.",
            level: 3,
            mech: { passive: 'revelation-necrotic-shroud' },
          },
        ],
        colorways: {
          skin: ['#e6d8c8', '#d2c0ac', '#b8a48e', '#9a8672', '#7d6a58', '#5f5044', '#cbbdb0', '#453b34'],
          hair: ['#f0eae0', '#d6cec2', '#b0a89c', '#8a8278', '#5f5a52', '#3a362e', '#1a1a1a', '#2a2632', '#4a4453', '#7a7286', '#c9c2d2', '#9f9f9f'],
          eye: ['#1b1b1b', '#2a2632', '#7a6a8f', '#c9c2d2', '#e8e2c8', '#8a8a8a', '#c9a227', '#3b2a1a'],
        },
        spriteMods: { wings: false },
      },
    ],
    colorways: {
      skin: ['#f7e6cf', '#f0d5b4', '#e0bd96', '#c9a077', '#a8825c', '#856245', '#efe4d0', '#d8c2a8', '#e8d9c0', '#c0a898'],
      hair: ['#f5efdc', '#e8dcbf', '#d9c07a', '#c9a227', '#b8863f', '#8a5a2b', '#5a3a20', '#2a2018', '#dfe6ee', '#b9c6d6', '#e6d0d0', '#9f9f9f'],
      eye: ['#e8e2c8', '#c9a227', '#2f6b8f', '#7fbfd6', '#7a6a8f', '#3f7a4a', '#f2f2f2', '#3b2a1a'],
    },
    spriteMods: { ears: 'round', horns: false, tail: false, beard: 'optional', height: 1.02, build: 'normal', snout: false, scales: false, fur: false, wings: false },
  },

  // =========================================================================
  'goliath': {
    id: 'goliath',
    name: 'Goliath',
    desc: "Giant blood runs through goliaths, written on their grey skin in dark lithoderm markings that no two of them share. They keep score honestly, carry more than they should, and do not complain about the cold.",
    size: 'medium',
    speed: 35,
    darkvision: 0,
    resist: [],
    immune: [],
    skillGrants: [],
    toolGrants: [],
    languageCount: 2,
    homelands: ['the Spine of the World', 'Icewind Dale', 'Icespire Peak', 'the high Sword Mountains'],
    loreHook: "Goliath clans winter high on Icespire Peak, and lately they have been coming down early with word of a white dragon called Cryovain.",
    traits: [
      {
        id: 'goliath-large-form',
        name: 'Large Form',
        desc: "As a Bonus Action you grow to Large size for 10 minutes, if there is room. While Large you have Advantage on Strength checks and your Speed increases by 10 feet. Once per Long Rest.",
        level: 5,
        mech: {
          passive: 'large-form',
          resource: { id: 'large-form', name: 'Large Form', max: 1, recharge: 'long' },
        },
      },
      {
        id: 'goliath-powerful-build',
        name: 'Powerful Build',
        desc: "You have Advantage on ability checks made to end the Grappled condition, and count as one size larger for carrying capacity.",
        level: 1,
        mech: { carryMult: 2, passive: 'powerful-build' },
      },
      {
        id: 'goliath-swift',
        name: 'Little Giant',
        desc: "Long legs and longer strides — your Speed is 35 feet.",
        level: 1,
        mech: { speedBonus: 0, passive: 'goliath-speed-35' },
      },
      {
        id: 'goliath-giant-ancestry',
        name: 'Giant Ancestry',
        desc: "You carry a supernatural boon from one giant bloodline. You can call on it a number of times equal to your Proficiency Bonus, regaining all uses on a Long Rest.",
        level: 1,
        mech: { resource: { id: 'giant-ancestry', name: 'Giant Ancestry', max: 'prof', recharge: 'long' } },
        choice: { type: 'lineage', count: 1, from: 'auto' },
      },
    ],
    lineages: [
      {
        id: 'cloud-giant',
        name: 'Cloud’s Jaunt',
        desc: "Cloud giant blood lets you step sideways out of the world for an instant.",
        lore: "The cloud clans keep old castles above the Sword Mountains and rarely bother to land.",
        traits: [
          {
            id: 'goliath-clouds-jaunt',
            name: 'Cloud’s Jaunt',
            desc: "As a Bonus Action you teleport up to 30 feet to an unoccupied space you can see.",
            level: 1,
            mech: { passive: 'giant-clouds-jaunt' },
          },
        ],
        colorways: { skin: ['#b4bcc4', '#a2aab4', '#8f97a2', '#7d8590', '#6b737e', '#c6ced6', '#98a2b0', '#5c646e'] },
        spriteMods: { build: 'broad' },
      },
      {
        id: 'fire-giant',
        name: 'Fire’s Burn',
        desc: "Fire giant blood puts a forge under your skin, and it shows on every strike you land.",
        lore: "Fire clans hold the deep smithies beneath the mountains, and their kin run hot in every sense.",
        traits: [
          {
            id: 'goliath-fires-burn',
            name: 'Fire’s Burn',
            desc: "When you hit a target with an attack roll, you can deal an extra 1d10 Fire damage to it.",
            level: 1,
            mech: { passive: 'giant-fires-burn' },
          },
        ],
        colorways: { skin: ['#a8968c', '#96837a', '#847068', '#725e56', '#605046', '#b8a69a', '#8a6f60', '#4e403a'] },
        spriteMods: { build: 'broad' },
      },
      {
        id: 'frost-giant',
        name: 'Frost’s Chill',
        desc: "Frost giant blood freezes the ground out from under whatever you hit.",
        lore: "Frost clans raid down out of the Spine of the World when the ice road holds.",
        traits: [
          {
            id: 'goliath-frosts-chill',
            name: 'Frost’s Chill',
            desc: "When you hit a target with an attack roll, you can deal an extra 1d6 Cold damage and reduce its Speed by 10 feet until the start of your next turn.",
            level: 1,
            mech: { passive: 'giant-frosts-chill' },
          },
        ],
        colorways: { skin: ['#c2ccd4', '#b0bac4', '#9ea8b4', '#8c96a2', '#7a8490', '#d0dae2', '#a6b6c4', '#68727e'] },
        spriteMods: { build: 'broad' },
      },
      {
        id: 'hill-giant',
        name: 'Hill’s Tumble',
        desc: "Hill giant blood makes your blows land like a falling boulder — things go down.",
        lore: "The hill clans squat in the Anchorite hills and take what the trail leaves unguarded.",
        traits: [
          {
            id: 'goliath-hills-tumble',
            name: 'Hill’s Tumble',
            desc: "When you hit a Large or smaller creature with an attack roll, you can give it the Prone condition.",
            level: 1,
            mech: { passive: 'giant-hills-tumble' },
          },
        ],
        colorways: { skin: ['#a89c86', '#968a76', '#847866', '#726858', '#60564a', '#b8ac96', '#8c8068', '#4e463c'] },
        spriteMods: { build: 'broad' },
      },
      {
        id: 'stone-giant',
        name: 'Stone’s Endurance',
        desc: "Stone giant blood lets you shrug off a blow the way a cliff shrugs off rain.",
        lore: "Stone clans carve the deep galleries under the Sword Mountains and consider the surface a rumour.",
        traits: [
          {
            id: 'goliath-stones-endurance',
            name: 'Stone’s Endurance',
            desc: "When you take damage, you can use a Reaction to reduce it by 1d12 plus your Constitution modifier.",
            level: 1,
            mech: { passive: 'giant-stones-endurance' },
          },
        ],
        colorways: { skin: ['#9c9c96', '#8a8a84', '#787872', '#666660', '#54544e', '#aeaea8', '#86868f', '#42423e'] },
        spriteMods: { build: 'broad' },
      },
      {
        id: 'storm-giant',
        name: 'Storm’s Thunder',
        desc: "Storm giant blood answers pain with thunder, and it does not wait for your permission.",
        lore: "Storm clans are all but gone from the Sword Coast, which makes their descendants very interesting to the Harpers.",
        traits: [
          {
            id: 'goliath-storms-thunder',
            name: 'Storm’s Thunder',
            desc: "When you take damage from a creature within 60 feet, you can use a Reaction to deal 1d8 Thunder damage to that creature.",
            level: 1,
            mech: { passive: 'giant-storms-thunder' },
          },
        ],
        colorways: { skin: ['#9aa4b4', '#8892a2', '#768090', '#646e7e', '#525c6c', '#acb6c6', '#7e88a0', '#404a5a'] },
        spriteMods: { build: 'broad' },
      },
    ],
    colorways: {
      skin: ['#c4bfb4', '#b8b4ac', '#a8a49c', '#96928a', '#847f78', '#726d66', '#605c56', '#8f8f9a', '#7a8288', '#6b7278'],
      hair: ['#1c1c1c', '#2a2622', '#3a342c', '#4a443a', '#5f5a50', '#7a746a', '#9a9488', '#b8b2a6', '#d8d2c6', '#6b6258', '#38332c', '#e0dcd2'],
      eye: ['#8fa0b0', '#6b7a8a', '#c9a227', '#7a7a7a', '#3f7a4a', '#2f6b8f', '#e0e6ea', '#2a2a2a'],
    },
    spriteMods: { ears: 'round', horns: false, tail: false, beard: 'optional', height: 1.15, build: 'broad', snout: false, scales: false, fur: false, wings: false, markings: 'lithoderm' },
  },

  // =========================================================================
  'half-elf': {
    id: 'half-elf',
    name: 'Half-Elf',
    desc: "Born between two long-lived grudges, half-elves belong everywhere for about a season and nowhere for the rest. They learn a little of everything, because everywhere keeps asking them to prove it.",
    size: 'medium',
    speed: 30,
    darkvision: 60,
    resist: [],
    immune: [],
    skillGrants: [],
    toolGrants: [],
    languageCount: 2,
    homelands: ['Phandalin', 'Neverwinter', 'Ardeep Forest border steadings', 'the Dessarin Valley'],
    loreHook: "Daran Edermath keeps an apple orchard on the north edge of Phandalin — a retired half-elf paladin of the Order of the Gauntlet who still notices everything on the Triboar Trail.",
    lineages: null,
    traits: [
      {
        id: 'half-elf-darkvision',
        name: 'Darkvision',
        desc: "You see in dim light within 60 feet as if it were bright light, and in Darkness as if it were dim light.",
        level: 1,
        mech: { darkvision: 60 },
      },
      {
        id: 'half-elf-fey-ancestry',
        name: 'Fey Ancestry',
        desc: "The elven half of you does not bend easily. You have Advantage on saving throws you make to avoid or end the Charmed condition.",
        level: 1,
        mech: { advSaveVs: ['charmed'], advVs: ['charmed'] },
      },
      {
        id: 'half-elf-skill-versatility',
        name: 'Skill Versatility',
        desc: "Two worlds, two educations. You gain proficiency in two skills of your choice.",
        level: 1,
        mech: {},
        choice: { type: 'skill', count: 2, from: 'any' },
      },
      {
        id: 'half-elf-heritage-of-two-worlds',
        name: 'Heritage of Two Worlds',
        desc: "You inherited human stubbornness alongside elven poise. You gain Heroic Inspiration whenever you finish a Long Rest.",
        level: 1,
        mech: {
          resource: { id: 'heroic-inspiration', name: 'Heroic Inspiration', max: 1, recharge: 'long' },
          passive: 'heroic-inspiration-on-long-rest',
        },
      },
    ],
    colorways: {
      skin: ['#f7e3cd', '#f0d5b4', '#e8c19a', '#d9a878', '#c08a5e', '#a06b45', '#7d4f33', '#e9dcc9'],
      hair: ['#1b1410', '#2e2119', '#4a3222', '#6b4a2c', '#8a5a2b', '#a8702f', '#c98a3c', '#d9a441', '#e2c169', '#9fb3c8', '#b23a2a', '#f2ecdf'],
      eye: ['#2f6b8f', '#5aa0c4', '#3f7a4a', '#6b8f3f', '#c9a227', '#5a3d22', '#7a6a8f', '#1b1b1b'],
    },
    spriteMods: { ears: 'pointed', horns: false, tail: false, beard: 'optional', height: 1.0, build: 'normal', snout: false, scales: false, fur: false, wings: false },
  },

  // =========================================================================
  'half-orc': {
    id: 'half-orc',
    name: 'Half-Orc',
    desc: "Half-orcs get the tusks, the shoulders and the whole reputation. Most of them decide early whether to argue with it or lean into it, and either way the argument tends to end quickly.",
    size: 'medium',
    speed: 30,
    darkvision: 60,
    resist: [],
    immune: [],
    skillGrants: ['intimidation'],
    toolGrants: [],
    languageCount: 2,
    homelands: ['Luskan', 'Many-Arrows border villages', 'Neverwinter’s dockside', 'Uthgardt hunting grounds'],
    loreHook: "Half-orc caravan guards hire on at the Sleeping Giant in Phandalin, mostly because the Lionshield Coster will not take them and Grista does not care.",
    lineages: null,
    traits: [
      {
        id: 'half-orc-darkvision',
        name: 'Darkvision',
        desc: "You see in dim light within 60 feet as if it were bright light, and in Darkness as if it were dim light.",
        level: 1,
        mech: { darkvision: 60 },
      },
      {
        id: 'half-orc-menacing',
        name: 'Menacing',
        desc: "You gain proficiency in Intimidation. Half of it is the tusks; the rest is practice.",
        level: 1,
        mech: { skillProf: ['intimidation'] },
      },
      {
        id: 'half-orc-relentless-endurance',
        name: 'Relentless Endurance',
        desc: "When you are reduced to 0 Hit Points but not killed outright, you drop to 1 Hit Point instead. Once per Long Rest.",
        level: 1,
        mech: {
          passive: 'relentless-endurance',
          resource: { id: 'relentless-endurance', name: 'Relentless Endurance', max: 1, recharge: 'long' },
        },
      },
      {
        id: 'half-orc-savage-attacks',
        name: 'Savage Attacks',
        desc: "When you score a Critical Hit with a weapon or an Unarmed Strike, roll one of the damage dice one additional time and add it to the extra damage.",
        level: 1,
        mech: { passive: 'savage-attacks' },
      },
    ],
    colorways: {
      skin: ['#c9a074', '#b8946a', '#a8a06a', '#a8875a', '#9fb27f', '#8fa96f', '#7f8f62', '#6b8a52', '#8a7550', '#6b5a3c'],
      hair: ['#141414', '#1e1a18', '#2a2420', '#3a3028', '#4a3a2c', '#5a4a3a', '#3f4a3a', '#6b6b6b', '#8f8f8f', '#b5b5b5', '#8c2f1e', '#e2e2e2'],
      eye: ['#c9a227', '#d97a3c', '#a33028', '#4a6539', '#3b2a1a', '#2f6b8f', '#7a7a7a', '#1b1b1b'],
    },
    spriteMods: { ears: 'pointed', horns: false, tail: false, beard: 'optional', height: 1.08, build: 'broad', snout: false, scales: false, fur: false, wings: false, tusks: true },
  },

  // =========================================================================
  'tabaxi': {
    id: 'tabaxi',
    name: 'Tabaxi',
    desc: "Cat-folk out of the far south, driven up the trade lanes by a curiosity that never quite gets satisfied. A tabaxi will cross a continent for a rumour and leave the moment the rumour is explained.",
    size: 'medium',
    speed: 30,
    darkvision: 60,
    resist: [],
    immune: [],
    skillGrants: ['perception', 'stealth'],
    toolGrants: [],
    languageCount: 2,
    homelands: ['Maztica', 'Waterdeep’s Dock Ward', 'Baldur’s Gate', 'the caravan roads of the Sword Coast'],
    loreHook: "Tabaxi step off Maztican trade ships at Waterdeep and follow the High Road north on whatever story they heard on the dock — several have turned up asking about Wave Echo Cave.",
    lineages: null,
    traits: [
      {
        id: 'tabaxi-darkvision',
        name: 'Darkvision',
        desc: "You see in dim light within 60 feet as if it were bright light, and in Darkness as if it were dim light.",
        level: 1,
        mech: { darkvision: 60 },
      },
      {
        id: 'tabaxi-cats-claws',
        name: 'Cat’s Claws',
        desc: "Your claws give you a Climb Speed of 30 feet, and your Unarmed Strike deals 1d6 Slashing damage on a hit.",
        level: 1,
        mech: {
          unarmedDie: '1d6',
          naturalWeapon: { name: 'Claws', die: '1d6', type: 'slashing' },
          passive: 'climb-speed-30',
        },
      },
      {
        id: 'tabaxi-cats-talent',
        name: 'Cat’s Talent',
        desc: "You gain proficiency in Perception and Stealth. Doors do not hear you and neither does anything else.",
        level: 1,
        mech: { skillProf: ['perception', 'stealth'] },
      },
      {
        id: 'tabaxi-feline-agility',
        name: 'Feline Agility',
        desc: "When you move on your turn you can double your Speed until the end of that turn. You cannot do it again until you spend a turn moving 0 feet.",
        level: 1,
        mech: { passive: 'feline-agility' },
      },
    ],
    colorways: {
      skin: ['#d9a441', '#c98a3c', '#a8702f', '#7a4a22', '#5a3418', '#2a2018', '#e8dcc0', '#c4bfb4', '#b5643a', '#f0e6d2'],
      hair: ['#2a2018', '#141414', '#5a3418', '#7a4a22', '#a8702f', '#c98a3c', '#d9a441', '#e8dcc0', '#c4bfb4', '#8f8a80', '#f0e6d2', '#b5643a'],
      eye: ['#c9a227', '#d9b23c', '#4a7a3a', '#7fbf6a', '#2f6b8f', '#5aa0c4', '#b5643a', '#8f8a80'],
    },
    spriteMods: { ears: 'cat', horns: false, tail: true, beard: 'none', height: 1.02, build: 'slim', snout: true, scales: false, fur: true, wings: false },
  },
};

/** The frozen species catalogue. Never mutate — clone instead. */
export const SPECIES = deepFreeze(RAW);

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** All species entries, alphabetical by display name. */
export function speciesList() {
  return Object.values(SPECIES).sort((a, b) => a.name.localeCompare(b.name));
}

/** Look up one species entry, or null. */
export function speciesById(id) {
  return (id && SPECIES[id]) || null;
}

/** Lineages (elf lineages, draconic ancestries, giant ancestries…) — always an array. */
export function lineagesOf(id) {
  const sp = speciesById(id);
  return sp && sp.lineages ? sp.lineages : [];
}

/** True if the species requires a lineage pick at character creation. */
export function hasLineages(id) {
  return lineagesOf(id).length > 0;
}

/** One lineage entry of a species, or null. */
export function lineageOf(id, lineageId) {
  return lineagesOf(id).find((l) => l.id === lineageId) || null;
}

/**
 * Every species + lineage trait unlocked at or below `level`.
 * Returns a new array of the frozen trait objects (safe to read, never mutate).
 */
export function speciesTraits(id, lineageId = null, level = 20) {
  const sp = speciesById(id);
  if (!sp) return [];
  const out = [];
  for (const t of sp.traits || []) if ((t.level || 1) <= level) out.push(t);
  const lin = lineageOf(id, lineageId);
  if (lin) for (const t of lin.traits || []) if ((t.level || 1) <= level) out.push(t);
  return out.sort((a, b) => (a.level || 1) - (b.level || 1));
}

/** Customization palettes, with the lineage's palette overriding the species default. */
export function colorwaysFor(id, lineageId = null) {
  const sp = speciesById(id);
  if (!sp) return { skin: [], hair: [], eye: [] };
  const lin = lineageOf(id, lineageId);
  const base = sp.colorways;
  const over = (lin && lin.colorways) || null;
  return {
    skin: (over && over.skin) || base.skin,
    hair: (over && over.hair) || base.hair,
    eye: (over && over.eye) || base.eye,
  };
}

/** Sprite-builder flags, with the lineage's partial overrides merged over the species defaults. */
export function spriteModsFor(id, lineageId = null) {
  const sp = speciesById(id);
  if (!sp) return {};
  const lin = lineageOf(id, lineageId);
  return Object.assign({}, sp.spriteMods, (lin && lin.spriteMods) || {});
}
