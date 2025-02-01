// script.js

/* Constants for races, classes, etc. */
const races = [
    { name: "Human", subraces: ["Standard", "Variant"] },
    { name: "Elf", subraces: ["High Elf", "Wood Elf", "Dark Elf"] },
    { name: "Dwarf", subraces: ["Hill Dwarf", "Mountain Dwarf"] },
    { name: "Halfling", subraces: ["Lightfoot", "Stout"] },
    { name: "Dragonborn", subraces: [] },
    { name: "Gnome", subraces: ["Forest Gnome", "Rock Gnome"] },
    { name: "Half-Orc", subraces: [] },
    { name: "Tiefling", subraces: [] },
    { name: "Half-Elf", subraces: [] }
  ];
  const classes = [
    "Fighter",
    "Wizard",
    "Rogue",
    "Cleric",
    "Bard",
    "Paladin",
    "Ranger",
    "Sorcerer",
    "Warlock",
    "Monk",
    "Druid"
  ];
  const subclasses = {
    Fighter: ["Champion", "Battle Master", "Eldritch Knight", "Samurai"],
    Wizard: [
      "Evocation",
      "Necromancy",
      "Illusion",
      "Divination",
      "Abjuration",
      "Enchantment",
      "Transmutation"
    ],
    Rogue: ["Thief", "Assassin", "Arcane Trickster", "Swashbuckler"],
    Cleric: [
      "Life Domain",
      "War Domain",
      "Tempest Domain",
      "Trickery Domain",
      "Grave Domain",
      "Nature Domain",
      "Light Domain"
    ],
    Bard: ["Lore", "Valor", "Glamour", "Swords", "Whispers", "Creation"],
    Paladin: ["Devotion", "Vengeance", "Ancients", "Conquest", "Oathbreaker", "Redemption"],
    Ranger: [
      "Hunter",
      "Beast Master",
      "Gloom Stalker",
      "Horizon Walker",
      "Drake Warden",
      "Fey Wanderer"
    ],
    Sorcerer: [
      "Draconic Bloodline",
      "Wild Magic",
      "Storm Sorcery",
      "Shadow Magic",
      "Aberrant Mind",
      "Clockwork Soul"
    ],
    Warlock: [
      "Archfey",
      "Fiend",
      "Great Old One",
      "Celestial",
      "Hexblade",
      "Genie"
    ],
    Monk: [
      "Way of Open Hand",
      "Way of Shadow",
      "Way of Four Elements",
      "Way of Mercy",
      "Drunken Master",
      "Astral Self"
    ],
    Druid: [
      "Circle of the Land",
      "Circle of the Moon",
      "Circle of the Shepherd",
      "Circle of Spores",
      "Circle of Stars",
      "Circle of Wildfire"
    ]
  };
  const backgrounds = [
    "Acolyte",
    "Criminal",
    "Folk Hero",
    "Noble",
    "Sage",
    "Soldier",
    "Urchin",
    "Entertainer",
    "Merchant",
    "Guild Artisan",
    "Hermit",
    "Outlander",
    "Charlatan"
  ];
  const alignments = [
    "Lawful Good",
    "Neutral Good",
    "Chaotic Good",
    "Lawful Neutral",
    "True Neutral",
    "Chaotic Neutral",
    "Lawful Evil",
    "Neutral Evil",
    "Chaotic Evil"
  ];
  const genders = ["Male", "Female", "Non-Binary", "Agender"];
  const builds = [
    "Slender",
    "Muscular",
    "Stocky",
    "Lean",
    "Lanky",
    "Athletic",
    "Heavyset",
    "Chubby",
    "Brawny",
    "Wiry"
  ];
  const hairColors = [
    "Black",
    "Brown",
    "Blonde",
    "Red",
    "White",
    "Gray",
    "Auburn",
    "Silver",
    "Blue",
    "Green",
    "Pink",
    "Multicolor",
    "Purple",
    "Orange",
    "Teal"
  ];
  const hairStyles = [
    "Curly",
    "Straight",
    "Wavy",
    "Braided",
    "Dreadlocks",
    "Shaved",
    "Bald",
    "Mohawk",
    "Topknot",
    "Undercut",
    "Afro",
    "Buzzcut",
    "Long",
    "Spiky",
    "Pixie Cut"
  ];
  const eyeColors = [
    "Amber",
    "Blue",
    "Brown",
    "Green",
    "Gray",
    "Hazel",
    "Golden",
    "Heterochromatic",
    "Violet",
    "Red",
    "Black",
    "Silver"
  ];
  const tones = [
    "Boisterous",
    "Whispery",
    "Gravelly",
    "Melodic",
    "Monotone",
    "Singsong",
    "Raspy",
    "Clear",
    "Silky",
    "Deep",
    "High-Pitched",
    "Soft"
  ];
  const classAbilities = {
    Fighter: { primary: "Strength", secondary: "Constitution" },
    Wizard: { primary: "Intelligence", secondary: "Wisdom" },
    Rogue: { primary: "Dexterity", secondary: "Intelligence" },
    Cleric: { primary: "Wisdom", secondary: "Charisma" },
    Bard: { primary: "Charisma", secondary: "Dexterity" },
    Paladin: { primary: "Strength", secondary: "Charisma" },
    Ranger: { primary: "Dexterity", secondary: "Wisdom" },
    Sorcerer: { primary: "Charisma", secondary: "Constitution" },
    Warlock: { primary: "Charisma", secondary: "Wisdom" },
    Monk: { primary: "Dexterity", secondary: "Wisdom" },
    Druid: { primary: "Wisdom", secondary: "Intelligence" }
  };
  const nameParts = {
    prefixes: [
      "el",
      "ara",
      "len",
      "thor",
      "fin",
      "syl",
      "mor",
      "kal",
      "dra",
      "wyn",
      "ry",
      "nar",
      "tar",
      "vor",
      "zim",
      "dal",
      "glen",
      "fey",
      "jax",
      "lorn"
    ],
    suffixes: [
      "en",
      "ara",
      "ion",
      "wyn",
      "eth",
      "mir",
      "thas",
      "dor",
      "lan",
      "var",
      "lyn",
      "iel",
      "ius",
      "ian",
      "rin",
      "don",
      "wen",
      "dae",
      "rick",
      "van"
    ],
    surnamePrefixes: [
      "Moon",
      "Star",
      "Iron",
      "Storm",
      "Night",
      "Bright",
      "Fire",
      "Shadow",
      "Stone",
      "Silver",
      "Gold",
      "Winter",
      "Summer",
      "Spring",
      "Autumn"
    ],
    surnameSuffixes: [
      "shadow",
      "blade",
      "helm",
      "crest",
      "wind",
      "stone",
      "fang",
      "heart",
      "wood",
      "river",
      "field",
      "sky",
      "song",
      "light",
      "fall",
      "flower"
    ]
  };
  const abilityIcons = {
    Strength: "fa-hand-fist",
    Dexterity: "fa-person-running",
    Constitution: "fa-heart-pulse",
    Intelligence: "fa-brain",
    Wisdom: "fa-eye",
    Charisma: "fa-masks-theater"
  };
  const raceIcons = {
    Human: "fa-person",
    Elf: "fa-sparkles",
    Dwarf: "fa-helmet-safety",
    Halfling: "fa-clover",
    Dragonborn: "fa-dragon",
    Gnome: "fa-hat-wizard",
    "Half-Orc": "fa-hand-back-fist",
    Tiefling: "fa-hornbill",
    "Half-Elf": "fa-person-rays"
  };
  
  // Expanded Data for Subraces, Traits, Gear, etc.
  const subraceTraits = {
    "High Elf": {
      bonus: { Intelligence: 1 },
      traits: ["Cantrip: Prestidigitation", "Extra Language"]
    },
    "Wood Elf": {
      bonus: { Wisdom: 1 },
      traits: ["Fleet of Foot", "Mask of the Wild", "Elf Weapon Training"]
    },
    "Dark Elf": {
      bonus: { Charisma: 1 },
      traits: ["Darkvision", "Drow Magic", "Superior Darkvision"]
    },
    "Hill Dwarf": {
      bonus: { Wisdom: 1 },
      traits: ["Dwarven Toughness", "Dwarven Resilience"]
    },
    "Mountain Dwarf": {
      bonus: { Strength: 2 },
      traits: ["Dwarven Armor Training", "Dwarven Resilience"]
    },
    Lightfoot: {
      bonus: { Charisma: 1 },
      traits: ["Naturally Stealthy", "Lucky"]
    },
    Stout: {
      bonus: { Constitution: 1 },
      traits: ["Stout Resilience", "Lucky"]
    },
    "Forest Gnome": {
      bonus: { Dexterity: 1 },
      traits: ["Natural Illusionist", "Speak with Small Beasts"]
    },
    "Rock Gnome": {
      bonus: { Constitution: 1 },
      traits: ["Artificer's Lore", "Tinker"]
    }
  };
  const startingGear = {
    Fighter: [
      "Chainmail",
      "Longsword",
      "Shield",
      "Explorer's Pack",
      "Dungeoneer's Pack"
    ],
    Wizard: ["Spellbook", "Component Pouch", "Scholar's Pack", "Arcane Focus"],
    Rogue: [
      "Leather Armor",
      "Dagger",
      "Thieves' Tools",
      "Burglar's Pack",
      "Shortbow"
    ],
    Cleric: ["Scale Mail", "Mace", "Shield", "Priest's Pack", "Holy Symbol"],
    Bard: ["Leather Armor", "Rapier", "Diplomat's Pack", "Musical Instrument"],
    Paladin: [
      "Chainmail",
      "Longsword",
      "Shield",
      "Explorer's Pack",
      "Holy Symbol",
      "Javelins"
    ],
    Ranger: [
      "Leather Armor",
      "Longbow",
      "Quiver",
      "Explorer's Pack",
      "Shortswords",
      "Hunting Trap"
    ],
    Sorcerer: ["Dagger", "Component Pouch", "Explorer's Pack", "Arcane Focus"],
    Warlock: [
      "Leather Armor",
      "Dagger",
      "Component Pouch",
      "Scholar's Pack",
      "Pact Symbol"
    ],
    Monk: ["Quarterstaff", "Explorer's Pack", "10 Darts"],
    Druid: [
      "Leather Armor",
      "Wooden Shield",
      "Scimitar",
      "Explorer's Pack",
      "Druidic Focus",
      "Herbalism Kit"
    ]
  };
  const personalityTraits = [
    "Always tells jokes",
    "Collects strange trinkets",
    "Writes poetry",
    "Loves to gamble",
    "Obsessed with cleanliness",
    "Always humming",
    "Knows all the local gossip",
    "Prefers silence",
    "Believes in fate",
    "Can't resist a dare",
    "Dreams of faraway places",
    "Has a secret language"
  ];
  const ideals = [
    "Might: The strong must rule",
    "Knowledge: Secrets are meant to be uncovered",
    "Justice: Everyone deserves a fair trial",
    "Freedom: Chains are meant to be broken",
    "Tradition: The old ways are best",
    "Adventure: Life is meant to be explored",
    "Kindness: Treat others with compassion",
    "Ambition: Seize any opportunity",
    "Power: Dominate all foes"
  ];
  const bonds = [
    "Protective of siblings",
    "Sworn to avenge mentor",
    "Loyal to a noble house",
    "Bound by a magical oath",
    "Seeking a lost artifact",
    "Driven to protect a sacred site",
    "Carries a family heirloom",
    "Haunted by a past mistake",
    "Pursues an ancient prophecy",
    "Seeks to prove worth to society",
    "Aimed at a particular noble",
    "Lost a precious friend"
  ];
  const flaws = [
    "Greedy",
    "Paranoid",
    "Cowardly",
    "Reckless",
    "Vengeful",
    "Distrustful",
    "Arrogant",
    "Stubborn",
    "Lazy",
    "Forgetful",
    "Gullible",
    "Envious",
    "Impatient",
    "Rude",
    "Suspicious"
  ];
  const backstoryEvents = {
    childhood: [
      "Orphaned",
      "Noble Birth",
      "Apprenticed",
      "Raised by Wolves",
      "Street Urchin",
      "Lived in a monastery",
      "From a seafaring family",
      "Grew up in the forest"
    ],
    definingEvent: [
      "Survived Dragon Attack",
      "Betrayed by Mentor",
      "Found a Magical Artifact",
      "Witnessed a great tragedy",
      "Made a deal with a powerful being",
      "Recovered an ancient tome",
      "Lost a loved one in a war",
      "Survived a shipwreck"
    ],
    secret: [
      "Wanted for Murder",
      "Heir to Fallen Kingdom",
      "Possessed by a Demon",
      "Member of a secret society",
      "Harbors forbidden knowledge",
      "Is a reincarnation of a legendary figure",
      "Has a dark past in the military",
      "Hiding from an old enemy"
    ]
  };
  const factions = [
    "Harpers",
    "Zhentarim",
    "Emerald Enclave",
    "Lord's Alliance",
    "Order of the Gauntlet",
    "The Harpers",
    "The Brethren of the Coast",
    "The Seekers"
  ];
  const deities = {
    Cleric: [
      "Lathander",
      "Moradin",
      "Selûne",
      "Tymora",
      "Ilmater",
      "Oghma",
      "Garl Glittergold",
      "Bane",
      "Mystra",
      "Corellon Larethian"
    ],
    Paladin: [
      "Tyr",
      "Bahamut",
      "Helm",
      "Sune",
      "Torm",
      "Kelemvor",
      "Ehlonna",
      "Gruumsh",
      "Wee Jas",
      "Vecna"
    ]
  };
  
  // NEW: Race-specific skin tones with names and color codes
  const raceSkinTones = {
    Human: [
      { name: "Light", color: "#FAD7A0" },
      { name: "Tan", color: "#D2B48C" },
      { name: "Olive", color: "#808000" },
      { name: "Brown", color: "#8B4513" }
    ],
    Elf: [
      { name: "Pale", color: "#F9E79F" },
      { name: "Light", color: "#FDEBD0" },
      { name: "Golden", color: "#F0C674" }
    ],
    Dwarf: [
      { name: "Ruddy", color: "#B87333" },
      { name: "Deep Brown", color: "#5D4037" },
      { name: "Copper", color: "#B87333" }
    ],
    Halfling: [
      { name: "Peach", color: "#FFDAB9" },
      { name: "Light Brown", color: "#C4A484" }
    ],
    Dragonborn: [
      { name: "Gold", color: "#FFD700" },
      { name: "Red", color: "#FF0000" },
      { name: "Blue", color: "#0000FF" },
      { name: "Green", color: "#008000" },
      { name: "Bronze", color: "#CD7F32" }
    ],
    Drow: [
      { name: "Ebony", color: "#555555" },
      { name: "Crimson", color: "#DC143C" },
      { name: "Violet", color: "#8A2BE2" },
      { name: "Indigo", color: "#4B0082" },
      { name: "Rose", color: "#FF66CC" }
    ],
    Gnome: [
      { name: "Rose", color: "#FF66CC" },
      { name: "Pale", color: "#F9E79F" },
      { name: "Light Brown", color: "#C4A484" }
    ],
    "Half-Orc": [
      { name: "Grey", color: "#808080" },
      { name: "Olive", color: "#808000" },
      { name: "Greenish", color: "#8FBC8F" }
    ],
    Tiefling: [
      { name: "Crimson", color: "#DC143C" },
      { name: "Purple", color: "#800080" },
      { name: "Blue", color: "#0000FF" },
      { name: "Obsidian", color: "#1C1C1C" }
    ],
    "Half-Elf": [
      { name: "Light", color: "#FAD7A0" },
      { name: "Tan", color: "#D2B48C" }
    ]
  };
  
  // Spell Lists by Class
  const classSpells = {
    Wizard: {
      cantrips: [
        "Fire Bolt",
        "Prestidigitation",
        "Mage Hand",
        "Minor Illusion",
        "Blade Ward",
        "Ray of Frost",
        "Shocking Grasp",
        "Message",
        "Mending",
        "Acid Splash",
        "Dancing Lights"
      ],
      1: [
        "Magic Missile",
        "Shield",
        "Mage Armor",
        "Detect Magic",
        "Charm Person",
        "Sleep",
        "Burning Hands",
        "Feather Fall",
        "Thunderwave",
        "Identify",
        "Fog Cloud",
        "Expeditious Retreat"
      ],
      2: [
        "Misty Step",
        "Scorching Ray",
        "Mirror Image",
        "Hold Person",
        "Invisibility",
        "Shatter",
        "Web",
        "Detect Thoughts",
        "Gust of Wind",
        "Levitate",
        "Darkness",
        "See Invisibility"
      ],
      3: [
        "Fireball",
        "Counterspell",
        "Fly",
        "Lightning Bolt",
        "Dispel Magic",
        "Haste",
        "Slow",
        "Hypnotic Pattern",
        "Gaseous Form",
        "Water Breathing",
        "Sleet Storm",
        "Bestow Curse"
      ],
      4: [
        "Greater Invisibility",
        "Polymorph",
        "Wall of Fire",
        "Banishment",
        "Dimension Door",
        "Ice Storm",
        "Arcane Eye",
        "Confusion",
        "Phantasmal Killer"
      ],
      5: [
        "Cone of Cold",
        "Hold Monster",
        "Wall of Force",
        "Teleportation Circle",
        "Dominate Person",
        "Cloudkill",
        "Bigby's Hand",
        "Passwall",
        "Animate Objects"
      ],
      6: [
        "Disintegrate",
        "Globe of Invulnerability",
        "Chain Lightning",
        "Sunbeam",
        "Freezing Sphere",
        "Mass Suggestion",
        "Programmed Illusion",
        "Investiture of Flame"
      ],
      7: [
        "Finger of Death",
        "Plane Shift",
        "Teleport",
        "Reverse Gravity",
        "Delayed Blast Fireball",
        "Prismatic Spray",
        "Forcecage",
        "Simulacrum"
      ],
      8: [
        "Dominate Monster",
        "Power Word Stun",
        "Maze",
        "Sunburst",
        "Mind Blank",
        "Clone",
        "Feeblemind"
      ],
      9: [
        "Wish",
        "Meteor Swarm",
        "Time Stop",
        "Power Word Kill",
        "True Polymorph",
        "Gate",
        "Foresight"
      ]
    },
    Sorcerer: {
      cantrips: [
        "Fire Bolt",
        "Prestidigitation",
        "Ray of Frost",
        "Shocking Grasp",
        "Mage Hand",
        "Minor Illusion",
        "Acid Splash",
        "Poison Spray"
      ],
      1: [
        "Magic Missile",
        "Shield",
        "Burning Hands",
        "Charm Person",
        "Feather Fall",
        "Chromatic Orb",
        "Thunderwave",
        "Jump",
        "Fog Cloud"
      ],
      2: [
        "Scorching Ray",
        "Misty Step",
        "Mirror Image",
        "Hold Person",
        "Invisibility",
        "Web",
        "Levitate",
        "Darkvision"
      ],
      3: [
        "Fireball",
        "Counterspell",
        "Fly",
        "Lightning Bolt",
        "Haste",
        "Slow",
        "Gaseous Form",
        "Water Breathing"
      ],
      4: [
        "Greater Invisibility",
        "Polymorph",
        "Wall of Fire",
        "Banishment",
        "Dimension Door",
        "Ice Storm",
        "Confusion"
      ],
      5: [
        "Cone of Cold",
        "Hold Monster",
        "Wall of Force",
        "Dominate Person",
        "Cloudkill",
        "Telekinesis"
      ],
      6: [
        "Disintegrate",
        "Chain Lightning",
        "Sunbeam",
        "Globe of Invulnerability",
        "Mass Suggestion",
        "Arcane Gate"
      ],
      7: [
        "Finger of Death",
        "Plane Shift",
        "Teleport",
        "Reverse Gravity",
        "Prismatic Spray",
        "Fire Storm"
      ],
      8: [
        "Dominate Monster",
        "Power Word Stun",
        "Sunburst",
        "Maze",
        "Mind Blank",
        "Earthquake"
      ],
      9: [
        "Wish",
        "Meteor Swarm",
        "Time Stop",
        "Power Word Kill",
        "Shapechange",
        "Time Stop"
      ]
    },
    Cleric: {
      cantrips: [
        "Sacred Flame",
        "Thaumaturgy",
        "Guidance",
        "Light",
        "Spare the Dying",
        "Resistance",
        "Mending",
        "Toll the Dead"
      ],
      1: [
        "Bless",
        "Cure Wounds",
        "Healing Word",
        "Shield of Faith",
        "Inflict Wounds",
        "Detect Evil and Good",
        "Command",
        "Guiding Bolt"
      ],
      2: [
        "Lesser Restoration",
        "Spiritual Weapon",
        "Hold Person",
        "Prayer of Healing",
        "Silence",
        "Protection from Poison",
        "Aid",
        "Blindness/Deafness"
      ],
      3: [
        "Revivify",
        "Spirit Guardians",
        "Dispel Magic",
        "Mass Healing Word",
        "Magic Circle",
        "Animate Dead",
        "Bestow Curse",
        "Clairvoyance"
      ],
      4: [
        "Guardian of Faith",
        "Banishment",
        "Death Ward",
        "Freedom of Movement",
        "Control Water",
        "Divination",
        "Locate Creature"
      ],
      5: [
        "Greater Restoration",
        "Mass Cure Wounds",
        "Flame Strike",
        "Raise Dead",
        "Holy Weapon",
        "Contagion",
        "Geas",
        "Insect Plague"
      ],
      6: [
        "Heal",
        "Harm",
        "Heroes' Feast",
        "Word of Recall",
        "Blade Barrier",
        "Create Undead",
        "Forbiddance",
        "Planar Ally"
      ],
      7: [
        "Divine Word",
        "Fire Storm",
        "Regenerate",
        "Resurrection",
        "Conjure Celestial",
        "Symbol",
        "Etherealness",
        "Plane Shift"
      ],
      8: [
        "Holy Aura",
        "Earthquake",
        "Sunburst",
        "Antimagic Field",
        "Control Weather",
        "Holy Aura"
      ],
      9: [
        "Mass Heal",
        "True Resurrection",
        "Gate",
        "Astral Projection",
        "Mass Heal",
        "Power Word Heal"
      ]
    },
    Bard: {
      cantrips: [
        "Vicious Mockery",
        "Prestidigitation",
        "Minor Illusion",
        "Message",
        "Mage Hand",
        "Dancing Lights",
        "True Strike",
        "Friends"
      ],
      1: [
        "Healing Word",
        "Faerie Fire",
        "Disguise Self",
        "Dissonant Whispers",
        "Tasha's Hideous Laughter",
        "Charm Person",
        "Cure Wounds",
        "Silent Image"
      ],
      2: [
        "Heat Metal",
        "Suggestion",
        "Invisibility",
        "Enhance Ability",
        "Hold Person",
        "Shatter",
        "Detect Thoughts",
        "Knock"
      ],
      3: [
        "Hypnotic Pattern",
        "Dispel Magic",
        "Counterspell",
        "Fear",
        "Bestow Curse",
        "Clairvoyance",
        "Motivational Speech",
        "Mass Healing Word"
      ],
      4: [
        "Greater Invisibility",
        "Polymorph",
        "Dimension Door",
        "Freedom of Movement",
        "Confusion",
        "Hallucinatory Terrain",
        "Locate Creature"
      ],
      5: [
        "Mass Cure Wounds",
        "Animate Objects",
        "Greater Restoration",
        "Hold Monster",
        "Dominate Person",
        "Synaptic Static",
        "Modify Memory"
      ],
      6: [
        "Otto's Irresistible Dance",
        "Mass Suggestion",
        "Eyebite",
        "True Seeing",
        "Programmed Illusion",
        "Eyebite",
        "Magic Jar"
      ],
      7: [
        "Forcecage",
        "Mirage Arcane",
        "Regenerate",
        "Resurrection",
        "Teleport",
        "Power Word Pain",
        "Prismatic Spray"
      ],
      8: [
        "Dominate Monster",
        "Feeblemind",
        "Glibness",
        "Power Word Stun",
        "Mind Blank",
        "Power Word Stun"
      ],
      9: [
        "Power Word Heal",
        "Foresight",
        "True Polymorph",
        "Wish",
        "Time Stop",
        "Mass Heal"
      ]
    },
    Warlock: {
      cantrips: [
        "Eldritch Blast",
        "Prestidigitation",
        "Mage Hand",
        "Minor Illusion",
        "Chill Touch",
        "Poison Spray",
        "Toll the Dead",
        "Guidance"
      ],
      1: [
        "Hex",
        "Armor of Agathys",
        "Hellish Rebuke",
        "Protection from Evil and Good",
        "Charm Person",
        "Cause Fear",
        "Witch Bolt",
        "Burning Hands"
      ],
      2: [
        "Misty Step",
        "Darkness",
        "Mirror Image",
        "Hold Person",
        "Invisibility",
        "Shatter",
        "Web",
        "Cloud of Daggers"
      ],
      3: [
        "Counterspell",
        "Dispel Magic",
        "Fly",
        "Hunger of Hadar",
        "Gaseous Form",
        "Fear",
        "Remove Curse",
        "Summon Lesser Demons"
      ],
      4: [
        "Banishment",
        "Dimension Door",
        "Shadow of Moil",
        "Sickening Radiance",
        "Blight",
        "Dimension Door",
        "Confusion",
        "Summon Greater Demons"
      ],
      5: [
        "Hold Monster",
        "Synaptic Static",
        "Wall of Light",
        "Far Step",
        "Contact Other Plane",
        "Telekinesis",
        "Wall of Stone",
        "Dream"
      ],
      6: [
        "Circle of Death",
        "Create Undead",
        "Flesh to Stone",
        "Soul Cage",
        "Mass Suggestion",
        "Arcane Gate",
        "Eyebite"
      ],
      7: [
        "Finger of Death",
        "Forcecage",
        "Plane Shift",
        "Crown of Stars",
        "Etherealness",
        "Prismatic Spray",
        "Teleport"
      ],
      8: [
        "Dominate Monster",
        "Feeblemind",
        "Glibness",
        "Power Word Stun",
        "Mind Blank",
        "Maze",
        "Demiplane"
      ],
      9: [
        "True Polymorph",
        "Foresight",
        "Power Word Kill",
        "Wish",
        "Astral Projection",
        "Time Stop",
        "Imprisonment"
      ]
    },
    Druid: {
      cantrips: [
        "Druidcraft",
        "Produce Flame",
        "Shillelagh",
        "Thorn Whip",
        "Guidance",
        "Poison Spray",
        "Resistance",
        "Mending"
      ],
      1: [
        "Entangle",
        "Cure Wounds",
        "Faerie Fire",
        "Goodberry",
        "Thunderwave",
        "Healing Word",
        "Detect Magic",
        "Speak with Animals"
      ],
      2: [
        "Barkskin",
        "Flame Blade",
        "Heat Metal",
        "Moonbeam",
        "Pass Without Trace",
        "Lesser Restoration",
        "Spike Growth",
        "Animal Messenger"
      ],
      3: [
        "Call Lightning",
        "Conjure Animals",
        "Dispel Magic",
        "Plant Growth",
        "Water Breathing",
        "Meld into Stone",
        "Protection from Energy",
        "Wind Wall"
      ],
      4: [
        "Blight",
        "Freedom of Movement",
        "Giant Insect",
        "Polymorph",
        "Conjure Minor Elementals",
        "Grasping Vine",
        "Locate Creature",
        "Stone Shape"
      ],
      5: [
        "Commune with Nature",
        "Greater Restoration",
        "Mass Cure Wounds",
        "Tree Stride",
        "Conjure Elemental",
        "Reincarnate",
        "Wall of Stone",
        "Insect Plague"
      ],
      6: [
        "Heal",
        "Heroes' Feast",
        "Sunbeam",
        "Wall of Thorns",
        "Transport via Plants",
        "Druid Grove",
        "Move Earth",
        "Wind Walk"
      ],
      7: [
        "Fire Storm",
        "Regenerate",
        "Reverse Gravity",
        "Whirlwind",
        "Mirage Arcane",
        "Plane Shift",
        "Project Image",
        "Regenerate"
      ],
      8: [
        "Animal Shapes",
        "Earthquake",
        "Feeblemind",
        "Sunburst",
        "Control Weather",
        "Tsunami",
        "Antipathy/Sympathy",
        "Dominate Monster"
      ],
      9: [
        "Foresight",
        "Shapechange",
        "Storm of Vengeance",
        "True Resurrection",
        "Astral Projection",
        "Mass Heal",
        "Time Stop",
        "Gate"
      ]
    },
    Paladin: {
      1: [
        "Bless",
        "Cure Wounds",
        "Divine Favor",
        "Shield of Faith",
        "Protection from Evil and Good",
        "Command",
        "Detect Evil and Good",
        "Thunderous Smite"
      ],
      2: [
        "Find Steed",
        "Lesser Restoration",
        "Magic Weapon",
        "Zone of Truth",
        "Aid",
        "Branding Smite",
        "Magic Weapon",
        "Prayer of Healing"
      ],
      3: [
        "Aura of Vitality",
        "Crusader's Mantle",
        "Dispel Magic",
        "Revivify",
        "Blinding Smite",
        "Remove Curse",
        "Spirit Guardians",
        "Elemental Weapon"
      ],
      4: [
        "Banishment",
        "Death Ward",
        "Freedom of Movement",
        "Guardian of Faith",
        "Aura of Life",
        "Locate Creature",
        "Staggering Smite",
        "Find Greater Steed"
      ],
      5: [
        "Circle of Power",
        "Destructive Wave",
        "Dispel Evil and Good",
        "Raise Dead",
        "Holy Weapon",
        "Geas",
        "Greater Restoration",
        "Banishing Smite"
      ]
    }
  };
  
  // Additional Variables
  const mysticalItems = [
    "Ring of Protection",
    "Amulet of Health",
    "Cloak of Invisibility",
    "Boots of Speed",
    "Belt of Giant Strength",
    "Bracers of Defense",
    "Staff of Power",
    "Wand of Magic Missiles"
  ];
  
  // Helper Functions
  function getRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }
  
  function generateName() {
    const firstName = getRandom(nameParts.prefixes) + getRandom(nameParts.suffixes);
    const lastName = getRandom(nameParts.surnamePrefixes) + getRandom(nameParts.surnameSuffixes);
    return `${firstName.charAt(0).toUpperCase() + firstName.slice(1)} ${lastName}`;
  }
  
  function getRacialBonus(race, subrace) {
    const bonuses = {
      Human: [1, 1, 1, 1, 1, 1],
      Elf: [0, 2, 0, 0, 0, 1],
      Dwarf: [0, 0, 2, 0, 1, 0],
      Halfling: [0, 2, 1, 0, 0, 0],
      Dragonborn: [2, 0, 0, 0, 0, 1],
      "Half-Orc": [2, 0, 1, 0, 0, 0],
      Tiefling: [0, 0, 0, 1, 0, 2],
      "Half-Elf": [0, 0, 0, 0, 0, 2],
      Gnome: [0, 1, 0, 2, 0, 0]
    };
    const baseBonus = bonuses[race] || [0, 0, 0, 0, 0, 0];
    const subraceBonus = subraceTraits[subrace]?.bonus || {};
    return baseBonus.map((val, i) => val + (subraceBonus[Object.keys(subraceBonus)[i]] || 0));
  }
  
  function calculateAbilityScores(race, subrace, charClass, level) {
    let base = [15, 14, 13, 12, 10, 8];
    base.sort(() => Math.random() - 0.5);
    const racialBonus = getRacialBonus(race, subrace);
    let bonusBreakdown = {
      Strength: { base: base[0], racial: racialBonus[0], asi: 0 },
      Dexterity: { base: base[1], racial: racialBonus[1], asi: 0 },
      Constitution: { base: base[2], racial: racialBonus[2], asi: 0 },
      Intelligence: { base: base[3], racial: racialBonus[3], asi: 0 },
      Wisdom: { base: base[4], racial: racialBonus[4], asi: 0 },
      Charisma: { base: base[5], racial: racialBonus[5], asi: 0 }
    };
    const asiCount = Math.floor(level / 4);
    const { primary, secondary } = classAbilities[charClass];
    for (let i = 0; i < asiCount; i++) {
      if (
        bonusBreakdown[primary].base +
          bonusBreakdown[primary].racial +
          bonusBreakdown[primary].asi <
        20
      ) {
        bonusBreakdown[primary].asi += 2;
      } else if (
        bonusBreakdown[secondary].base +
          bonusBreakdown[secondary].racial +
          bonusBreakdown[secondary].asi <
        20
      ) {
        bonusBreakdown[secondary].asi += 2;
      } else {
        const highest = Object.entries(bonusBreakdown)
          .filter(([k]) => k !== primary && k !== secondary)
          .sort(
            (a, b) =>
              b[1].base + b[1].racial + b[1].asi -
              (a[1].base + a[1].racial + a[1].asi)
          )[0][0];
        bonusBreakdown[highest].asi += 2;
      }
    }
    let abilities = {};
    let breakdowns = {};
    Object.entries(bonusBreakdown).forEach(([stat, values]) => {
      const total = values.base + values.racial + values.asi;
      abilities[stat] = total;
      breakdowns[stat] = `Base: ${values.base} | Race: +${values.racial} | ASI: +${values.asi}`;
    });
    return { scores: abilities, breakdowns: breakdowns };
  }
  
  function generateLevel() {
    return Math.floor(Math.random() * 20) + 1;
  }
  
  function generatePersonality() {
    return {
      trait: getRandom(personalityTraits),
      ideal: getRandom(ideals),
      bond: getRandom(bonds),
      flaw: getRandom(flaws),
      quirk: getRandom([
        "Always humming",
        "Twirls hair when nervous",
        "Snorts when laughing",
        "Talks to inanimate objects",
        "Has a nervous tic",
        "Always late",
        "Constantly fidgeting",
        "Mumbles to themselves"
      ])
    };
  }
  
  function generateBackstory() {
    return {
      childhood: getRandom(backstoryEvents.childhood),
      definingEvent: getRandom(backstoryEvents.definingEvent),
      secret: getRandom(backstoryEvents.secret)
    };
  }
  
  function generateSpells(charClass, level) {
    if (!classSpells[charClass]) return null;
    let spellbook = {};
    const maxSpellLevel = Math.min(Math.ceil(level / 2), 9);
    if (classSpells[charClass].cantrips) {
      spellbook.cantrips = getRandomSpells(
        classSpells[charClass].cantrips,
        Math.min(4, 2 + Math.floor(level / 4))
      );
    }
    for (let i = 1; i <= maxSpellLevel; i++) {
      if (classSpells[charClass][i]) {
        const slots = level >= i * 2 ? 2 : 1;
        spellbook[i] = getRandomSpells(
          classSpells[charClass][i],
          slots + Math.floor(level / 4)
        );
      }
    }
    return spellbook;
  }
  
  function getRandomSpells(spellList, count) {
    let spells = [...spellList];
    let selected = [];
    while (selected.length < count && spells.length > 0) {
      const index = Math.floor(Math.random() * spells.length);
      selected.push(spells.splice(index, 1)[0]);
    }
    return selected;
  }
  
  function generateFaction() {
    return Math.random() < 0.5 ? null : getRandom(factions);
  }
  
  function generateDeity(charClass) {
    if (charClass === "Cleric" || charClass === "Paladin") {
      return getRandom(deities[charClass]);
    }
    return null;
  }
  
  function generateEquipment(charClass) {
    return startingGear[charClass] ? [...startingGear[charClass]] : [];
  }
  
  function generateMulticlass(charClass) {
    if (Math.random() < 0.3) {
      const otherClasses = classes.filter((c) => c !== charClass);
      return getRandom(otherClasses);
    }
    return null;
  }
  
  function generateCharacter() {
    const raceData = getRandom(races);
    const race = raceData.name;
    const subrace =
      raceData.subraces.length > 0 ? getRandom(raceData.subraces) : null;
    const charClass = getRandom(classes);
    const multiclass = generateMulticlass(charClass);
    const level = generateLevel();
    const alignment = getRandom(alignments);
    const background = getRandom(backgrounds);
    const gender = getRandom(genders);
    const pronouns =
      gender === "Non-Binary" || gender === "Agender"
        ? "they/them"
        : gender === "Female"
        ? "she/her"
        : "he/him";
    const fullName = generateName();
    const abilityData = calculateAbilityScores(race, subrace, charClass, level);
    const abilities = abilityData.scores;
    const breakdowns = abilityData.breakdowns;
    const subclass = getRandom(subclasses[charClass]);
    const personality = generatePersonality();
    const backstory = generateBackstory();
    const faction = generateFaction();
    const deity = generateDeity(charClass);
    const equipment = generateEquipment(charClass);
  
    // Add a mystical item with a 20% chance.
    if (Math.random() < 0.2) {
      equipment.push(getRandom(mysticalItems));
    }
  
    // Hair generation.
    const style = getRandom(hairStyles);
    const hairDescription =
      style === "Bald" || style === "Shaved" ? style : `${getRandom(hairColors)} ${style}`;
  
    // NEW: Use raceSkinTones for skin tone selection.
    const availableSkinTones = raceSkinTones[race] || raceSkinTones["Human"];
    const skinTone = getRandom(availableSkinTones);
  
    // NEW: Generate facial hair for males.
    const facialHair =
      gender === "Male"
        ? getRandom([
            "Clean Shaven",
            "Beard",
            "Mustache",
            "Goatee",
            "Sideburns",
            "Stubble"
          ])
        : "None";
  
    // Generate spells if applicable.
    let spellbook = null;
    if (classSpells[charClass]) {
      spellbook = generateSpells(charClass, level);
    }
  
    const character = `
      <h2>${fullName}</h2>
      <div class="grid-2col">
        <div class="section">
          <h3><i class="fas fa-scroll"></i> Core Identity</h3>
          <div class="pill">
            <i class="fas ${raceIcons[race]}"></i>${race}${
      subrace ? ` (${subrace})` : ""
    }
          </div>
          <div class="pill">
            <i class="fas fa-tower"></i>Level ${level}
          </div>
          <div class="pill">
            <i class="fas fa-swords"></i>${charClass}${
      multiclass ? ` / ${multiclass}` : ""
    } (${subclass})
          </div>
          <div class="pill">
            <i class="fas fa-balance-scale"></i>${alignment}
          </div>
          ${
            faction
              ? `<div class="pill"><i class="fas fa-flag"></i>${faction}</div>`
              : ""
          }
          ${
            deity
              ? `<div class="pill"><i class="fas fa-pray"></i>${deity}</div>`
              : ""
          }
        </div>
        <div class="section">
          <h3><i class="fas fa-user"></i> Vital Statistics</h3>
          <ul class="trait-list">
            <li><i class="fas fa-landmark"></i>Background: ${background}</li>
            <li><i class="fas fa-venus-mars"></i>Gender: ${gender} (${pronouns})</li>
            <li><i class="fas fa-comment"></i>Voice: ${getRandom(tones)}</li>
            <li><i class="fas fa-eye"></i>Eyes: ${getRandom(eyeColors)}</li>
            <li><i class="fas fa-cut"></i>Hair: ${hairDescription}</li>
            <li>
              <i class="fas fa-adjust"></i>
              Skin Tone: ${skinTone.name}
              <span class="color-swatch" style="background-color: ${skinTone.color}; display:inline-block; width:15px; height:15px; margin-left:5px; border:1px solid #000;"></span>
            </li>
            <li><i class="fas fa-user-secret"></i>Facial Hair: ${facialHair}</li>
          </ul>
        </div>
      </div>
      <div class="section">
        <h3><i class="fas fa-dumbbell"></i> Abilities</h3>
        <div class="ability-grid">
          ${Object.entries(abilities)
            .map(
              ([stat, value]) => `
            <div class="ability-card" data-breakdown="${breakdowns[stat]}">
              <i class="fas ${abilityIcons[stat]}"></i>
              <div style="font-weight:700">${stat}</div>
              <div>${value} (${Math.floor((value - 10) / 2)})</div>
            </div>
          `
            )
            .join("")}
        </div>
      </div>
      <div class="grid-2col">
        <div class="section">
          <h3><i class="fas fa-body"></i> Physical Presence</h3>
          <ul class="trait-list">
            <li><i class="fas fa-ruler-vertical"></i>Height: ${Math.floor(
              4 + Math.random() * 3
            )}'${Math.floor(Math.random() * 12)}"</li>
            <li><i class="fas fa-weight-hanging"></i>Build: ${getRandom(builds)}</li>
            <li><i class="fas fa-hourglass"></i>Age: ${
              race === "Elf"
                ? Math.floor(Math.random() * 200 + 50)
                : race === "Dwarf"
                ? Math.floor(Math.random() * 150 + 50)
                : Math.floor(Math.random() * 80 + 16)
            }</li>
            <li><i class="fas fa-stamp"></i>Mark: ${getRandom([
              "Scar",
              "Tattoo",
              "Piercing",
              "Birthmark",
              "War Paint",
              "Brand",
              "Missing Finger",
              "Missing Eye"
            ])}</li>
          </ul>
        </div>
        <div class="section">
          <h3><i class="fas fa-brain"></i> Personality Matrix</h3>
          <ul class="trait-list">
            <li><i class="fas fa-star"></i>Trait: "${personality.trait}"</li>
            <li><i class="fas fa-bullseye"></i>Ideal: "${personality.ideal}"</li>
            <li><i class="fas fa-link"></i>Bond: "${personality.bond}"</li>
            <li><i class="fas fa-skull"></i>Flaw: "${personality.flaw}"</li>
            <li><i class="fas fa-face-grin-tongue"></i>Quirk: "${personality.quirk}"</li>
          </ul>
        </div>
      </div>
      <div class="section">
        <h3><i class="fas fa-shield"></i> Combat Loadout</h3>
        <div class="combat-stats">
          <div class="combat-card">
            <div class="pill"><i class="fas fa-helmet-battle"></i>Class Features</div>
            <ul class="trait-list">
              <li><i class="fas fa-fist-raised"></i>Style: ${getRandom([
                "Aggressive",
                "Defensive",
                "Tactical",
                "Stealthy",
                "Reckless",
                "Calculated"
              ])}</li>
              <li><i class="fas fa-shield-alt"></i>Armor: ${getRandom([
                "Chainmail",
                "Leather",
                "Robes",
                "Plate Armor",
                "Studded Leather",
                "Hide Armor"
              ])}</li>
            </ul>
          </div>
          <div class="combat-card">
            <div class="pill"><i class="fas fa-bolt"></i>Combat Stats</div>
            <ul class="trait-list">
              <li><i class="fas fa-heart"></i>Health: ${Math.floor(
                level * (5 + Math.random() * 3)
              )} HP</li>
              <li><i class="fas fa-fire"></i>Signature: ${getRandom([
                "Power Attack",
                "Sneak Attack",
                "Fireball",
                "Divine Smite",
                "Eldritch Blast",
                "Wild Shape"
              ])}</li>
            </ul>
          </div>
        </div>
      </div>
      ${
        spellbook
          ? `
      <div class="section">
        <h3><i class="fas fa-book-sparkles"></i> ${
            charClass === "Paladin" ? "Prayer Book" : "Spellbook"
          }</h3>
        <div class="spellbook">
          ${Object.entries(spellbook)
            .map(
              ([lvl, spells]) => `
            <div class="spell-level">
              <h4>${
                lvl === "cantrips" ? "Cantrips" : `Level ${lvl} Spells`
              }</h4>
              <div class="spell-list">
                ${spells
                  .map((spell) => `<div class="spell">${spell}</div>`)
                  .join("")}
              </div>
            </div>
          `
            )
            .join("")}
        </div>
      </div>
      `
          : ""
      }
      <div class="section">
        <h3><i class="fas fa-history"></i> Backstory</h3>
        <ul class="trait-list">
          <li><i class="fas fa-child"></i>Childhood: ${backstory.childhood}</li>
          <li><i class="fas fa-dragon"></i>Defining Event: ${backstory.definingEvent}</li>
          <li><i class="fas fa-mask"></i>Secret: ${backstory.secret}</li>
        </ul>
      </div>
      <div class="section">
        <h3><i class="fas fa-backpack"></i> Equipment</h3>
        <ul class="trait-list">
          ${equipment
            .map((item) => `<li><i class="fas fa-shield-alt"></i>${item}</li>`)
            .join("")}
        </ul>
      </div>
    `;
    document.getElementById("characterSheet").innerHTML = character;
    window.generatedCharacterData = {
      fullName: fullName,
      race: `${race}${subrace ? ` (${subrace})` : ""}`,
      level: level,
      class: `${charClass}${
        multiclass ? ` / ${multiclass}` : ""
      } (${subclass})`,
      alignment: alignment,
      faction: faction,
      deity: deity,
      gender: `${gender} (${pronouns})`,
      voice: getRandom(tones),
      eyes: getRandom(eyeColors),
      hair: hairDescription,
      skinTone: skinTone,
      facialHair: facialHair,
      abilities: abilities,
      height: `${Math.floor(4 + Math.random() * 3)}'${Math.floor(
        Math.random() * 12
      )}"`,
      build: getRandom(builds),
      age:
        race === "Elf"
          ? Math.floor(Math.random() * 200 + 50)
          : race === "Dwarf"
          ? Math.floor(Math.random() * 150 + 50)
          : Math.floor(Math.random() * 80 + 16),
      mark: getRandom([
        "Scar",
        "Tattoo",
        "Piercing",
        "Birthmark",
        "War Paint",
        "Brand",
        "Missing Finger",
        "Missing Eye"
      ]),
      personality: personality,
      combatStyle: getRandom([
        "Aggressive",
        "Defensive",
        "Tactical",
        "Stealthy",
        "Reckless",
        "Calculated"
      ]),
      armor: getRandom([
        "Chainmail",
        "Leather",
        "Robes",
        "Plate Armor",
        "Studded Leather",
        "Hide Armor"
      ]),
      health: `${Math.floor(level * (5 + Math.random() * 3))} HP`,
      signature: getRandom([
        "Power Attack",
        "Sneak Attack",
        "Fireball",
        "Divine Smite",
        "Eldritch Blast",
        "Wild Shape"
      ]),
      spellbook: spellbook,
      backstory: backstory,
      equipment: equipment
    };
  }
  
  function copyCharacter() {
    if (!window.generatedCharacterData) {
      alert("Generate a character first!");
      return;
    }
    const data = window.generatedCharacterData;
    let text = `
  Character Name: ${data.fullName}
  Race: ${data.race}
  Level: ${data.level}
  Class: ${data.class}
  Alignment: ${data.alignment}
  ${
    data.faction ? `Faction: ${data.faction}\n` : ""
  }${data.deity ? `Deity: ${data.deity}\n` : ""}
  Gender: ${data.gender}
  Voice: ${data.voice}
  Eyes: ${data.eyes}
  Hair: ${data.hair}
  Skin Tone: ${data.skinTone.name} (${data.skinTone.color})
  Facial Hair: ${data.facialHair}
  
  Abilities:
  ${Object.entries(data.abilities)
    .map(
      ([stat, value]) =>
        `  ${stat}: ${value} (${Math.floor((value - 10) / 2)})`
    )
    .join("\n")}
  
  Physical Presence:
    Height: ${data.height}
    Build: ${data.build}
    Age: ${data.age}
    Mark: ${data.mark}
  
  Personality:
    Trait: "${data.personality.trait}"
    Ideal: "${data.personality.ideal}"
    Bond: "${data.personality.bond}"
    Flaw: "${data.personality.flaw}"
    Quirk: "${data.personality.quirk}"
  
  Combat Loadout:
    Style: ${data.combatStyle}
    Armor: ${data.armor}
    Health: ${data.health}
    Signature: ${data.signature}
  `;
    if (data.spellbook) {
      text += `\nSpellbook:\n`;
      for (const lvl in data.spellbook) {
        text += `  ${
          lvl === "cantrips" ? "Cantrips" : `Level ${lvl} Spells`
        }:\n`;
        data.spellbook[lvl].forEach((spell) => {
          text += `    - ${spell}\n`;
        });
      }
    }
    text += `\nBackstory:
    Childhood: ${data.backstory.childhood}
    Defining Event: ${data.backstory.definingEvent}
    Secret: ${data.backstory.secret}
  
  Equipment:
  ${data.equipment.map((item) => `  - ${item}`).join("\n")}
  `;
    navigator.clipboard.writeText(text).then(
      () => {
        alert("Character data copied to clipboard!");
      },
      () => {
        alert("Failed to copy character data.");
      }
    );
  }
  
  generateCharacter();
  