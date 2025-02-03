// js/data.js
export const artifactTypes = ["Staff", "Wand"];
export const artifactIcons = { Staff: "fa-staff", Wand: "fa-magic-wand-sparkles" };
export const defaultIcon = "fa-gem";

export const standoutFeatures = [
  "a pattern of thorns", "mysterious inscribings", "an ornate handle", "a unique texture", "glowing runes",
  "shimmering rings", "carved eyes", "a row of jagged teeth"
];

export const adjectives = [
  "Arcane", "Mystic", "Ethereal", "Celestial", "Shadowy", "Ancient", "Enchanted",
  "Runed", "Whispering", "Luminous", "Resonant", "Harmonious", "Astral", "Eldritch",
  "Prismatic", "Veiled", "Chaotic", "Boundless", "Ephemeral", "Forbidden",
  "Tempestuous", "Shimmering", "Soggy", "Awkward", "Gassy", "Clumsy", "Quacking",
  "Snazzy", "Dorky", "Jiggling", "Funky", "Cheesy", "Spicy", "Wobbly", "Flatulent",
  "Overcaffeinated", "Itchy", "Goopy", "Bedazzled", "Slippery", "Sassy",
  "Blindingly Glittery", "Lumpy", "Mediocre", "Confused", "Unhinged", "Perpetually Damp",
  "Ridiculously Bright", "Tacky", "Overdramatic", "Overly Sincere", "Chronically Embarrassed",
  "Super Annoying", "Excessively Chatty", "Slightly Crooked"
];

export const materials = [
  "Oak", "Ebony", "Rosewood", "Ashwood", "Birch", "Maple", "Willow", "Pine", "Mahogany",
  "Yew", "Silver", "Gold", "Electrum", "Platinum", "Mithril", "Adamantine", "Copper",
  "Bronze", "Orichalcum", "Quicksilver", "Crystal", "Sapphire", "Ruby", "Emerald",
  "Amethyst", "Topaz", "Moonstone", "Sunstone", "Obsidian", "Jade", "Onyx", "Opal",
  "Peridot", "Garnet", "Aquamarine", "Spinel", "Zircon", "Starmetal", "Petrified Wood",
  "Living Wood", "Frozen Tears", "Phoenix Feather", "Unicorn Horn", "Astral Shard",
  "Void Stone", "Dreamweave", "Heartwood", "Soulsteel", "Whisperwood", "Emberglass",
  "Shadowsilk", "Celestium", "Aetherium", "Etherglass", "Bloodstone", "Driftstone",
  "Duskwood", "Frostwood", "Luminite", "Nethercrystal", "Arcane Resin", "Spellglass",
  "Eclipsium", "Twilight Ore",
  "Paper Mache", "Cheesecloth", "Duct Tape", "Cardboard", "Bubble Wrap", "Styrofoam", "Rubber",
  "Old Shoe Leather", "Goblin Earwax", "Unicorn Farts", "Chicken Bone", "Recycled Goblin Toenails",
  "Melted Candles", "Beeswax", "Sock Fabric", "Mossy Pebbles", "Belly Button Lint", "Petrified Bread",
  "Glitter Glue", "Toenail Clippings", "Worn-Out Sandals", "Discarded Toothpicks"
];

export const spellLists = {
  Abjuration: [
    { name: "Shield", level: 1 }, { name: "Mage Armor", level: 1 }, { name: "Counterspell", level: 3 },
    { name: "Dispel Magic", level: 3 }, { name: "Antimagic Field", level: 8 }, { name: "Absorb Elements", level: 1 },
    { name: "Protection from Evil and Good", level: 1 }, { name: "Warding Bond", level: 2 }, { name: "Magic Circle", level: 3 },
    { name: "Globe of Invulnerability", level: 6 }, { name: "Barrier of Faith", level: 2 }, { name: "Arcane Aegis", level: 3 },
    { name: "Deflecting Ward", level: 1 }, { name: "Mystic Bulwark", level: 4 }, { name: "Ethereal Shield", level: 2 },
    { name: "Guardian's Barrier", level: 3 }, { name: "Protective Veil", level: 1 }, { name: "Sacred Ward", level: 2 },
    { name: "Force Barrier", level: 4 }, { name: "Resilient Aegis", level: 3 }, { name: "Divine Shield", level: 1 },
    { name: "Mystic Deflection", level: 2 }, { name: "Celestial Barrier", level: 3 }, { name: "Ward of Serenity", level: 1 },
    { name: "Final Bastion", level: 4 }
  ],
  Conjuration: [
    { name: "Summon Familiar", level: 1 }, { name: "Misty Step", level: 2 }, { name: "Teleportation Circle", level: 5 },
    { name: "Conjure Elemental", level: 5 }, { name: "Gate", level: 9 }, { name: "Healing Word", level: 1 },
    { name: "Spiritual Weapon", level: 2 }, { name: "Conjure Animals", level: 3 }, { name: "Dimension Door", level: 4 },
    { name: "Teleport", level: 7 }, { name: "Summon Minor Elemental", level: 1 }, { name: "Conjure Minor Beast", level: 2 },
    { name: "Ethereal Step", level: 2 }, { name: "Portal of Shadows", level: 4 }, { name: "Call to the Void", level: 3 },
    { name: "Ethereal Summons", level: 1 }, { name: "Spectral Servant", level: 2 }, { name: "Summon Ethereal Entity", level: 3 },
    { name: "Mystic Portal", level: 4 }, { name: "Celestial Conjuring", level: 5 }, { name: "Phantom Steed", level: 3 },
    { name: "Summon Elemental Fury", level: 5 }, { name: "Conjure Celestial", level: 7 }, { name: "Transient Gateway", level: 2 },
    { name: "Arcane Conjuration", level: 4 }
  ],
  Divination: [
    { name: "Detect Magic", level: 1 }, { name: "Clairvoyance", level: 3 }, { name: "Scrying", level: 5 },
    { name: "Foresight", level: 9 }, { name: "True Seeing", level: 6 }, { name: "Identify", level: 1 },
    { name: "See Invisibility", level: 2 }, { name: "Locate Object", level: 2 }, { name: "Legend Lore", level: 5 },
    { name: "Contact Other Plane", level: 5 }, { name: "Mystic Insight", level: 2 }, { name: "Arcane Vision", level: 3 },
    { name: "Future Glimpse", level: 4 }, { name: "Hidden Truths", level: 2 }, { name: "Divine Revelation", level: 5 },
    { name: "Omniscient Gaze", level: 7 }, { name: "Ethereal Insight", level: 1 }, { name: "Secrets Unveiled", level: 3 },
    { name: "Mystical Perception", level: 2 }, { name: "Clairaudience", level: 3 }, { name: "Mind's Eye", level: 1 },
    { name: "Prophetic Dream", level: 4 }, { name: "Vision of Destiny", level: 5 }, { name: "Foretold Future", level: 6 },
    { name: "Oracle's Whisper", level: 2 }
  ],
  Enchantment: [
    { name: "Charm Person", level: 1 }, { name: "Suggestion", level: 2 }, { name: "Hypnotic Pattern", level: 3 },
    { name: "Dominate Person", level: 5 }, { name: "Mass Suggestion", level: 6 }, { name: "Sleep", level: 1 },
    { name: "Tasha's Hideous Laughter", level: 1 }, { name: "Crown of Madness", level: 2 }, { name: "Geas", level: 5 },
    { name: "Modify Memory", level: 5 }, { name: "Enthrall", level: 1 }, { name: "Mesmerize", level: 2 },
    { name: "Captivate", level: 1 }, { name: "Charm of Bliss", level: 2 }, { name: "Willing Enchantment", level: 3 },
    { name: "Spellbound", level: 1 }, { name: "Alluring Gaze", level: 2 }, { name: "Mind Charm", level: 3 },
    { name: "Beguiling Smile", level: 1 }, { name: "Trance", level: 2 }, { name: "Irresistible Persuasion", level: 4 },
    { name: "Enchanting Melody", level: 3 }, { name: "Subjugate", level: 5 }, { name: "Fascination", level: 1 },
    { name: "Captivating Whisper", level: 2 }
  ],
  Evocation: [
    { name: "Magic Missile", level: 1 }, { name: "Fireball", level: 3 }, { name: "Lightning Bolt", level: 3 },
    { name: "Cone of Cold", level: 5 }, { name: "Meteor Swarm", level: 9 }, { name: "Thunderwave", level: 1 },
    { name: "Shatter", level: 2 }, { name: "Scorching Ray", level: 2 }, { name: "Wall of Fire", level: 4 },
    { name: "Chain Lightning", level: 6 }, { name: "Arcane Explosion", level: 2 }, { name: "Flame Burst", level: 1 },
    { name: "Lightning Surge", level: 3 }, { name: "Thunder Strike", level: 2 }, { name: "Solar Flare", level: 4 },
    { name: "Energy Beam", level: 1 }, { name: "Inferno", level: 5 }, { name: "Static Shock", level: 2 },
    { name: "Force Wave", level: 3 }, { name: "Blazing Orb", level: 4 }, { name: "Electro Burst", level: 2 },
    { name: "Searing Light", level: 1 }, { name: "Pyroclasm", level: 6 }, { name: "Frost Nova", level: 3 },
    { name: "Explosive Impact", level: 4 }
  ],
  Illusion: [
    { name: "Minor Illusion", level: 0 }, { name: "Invisibility", level: 2 }, { name: "Major Image", level: 3 },
    { name: "Mirage Arcane", level: 7 }, { name: "Project Image", level: 7 }, { name: "Silent Image", level: 1 },
    { name: "Disguise Self", level: 1 }, { name: "Blur", level: 2 }, { name: "Hallucinatory Terrain", level: 4 },
    { name: "Mislead", level: 3 }, { name: "Phantom Vision", level: 1 }, { name: "Spectral Mirage", level: 2 },
    { name: "Veil of Shadows", level: 3 }, { name: "Illusory Double", level: 1 }, { name: "Mirror Image", level: 2 },
    { name: "Shadow Play", level: 1 }, { name: "Ethereal Image", level: 3 }, { name: "Dazzling Illusion", level: 2 },
    { name: "Optical Trickery", level: 1 }, { name: "Hallucinatory Veil", level: 2 }, { name: "Fanciful Vision", level: 1 },
    { name: "Imaginary Form", level: 2 }, { name: "Deceptive Mirage", level: 3 }, { name: "Specter’s Ruse", level: 1 },
    { name: "Luminous Illusion", level: 2 }
  ],
  Necromancy: [
    { name: "Chill Touch", level: 0 }, { name: "Animate Dead", level: 3 }, { name: "Vampiric Touch", level: 3 },
    { name: "Circle of Death", level: 6 }, { name: "Finger of Death", level: 7 }, { name: "False Life", level: 1 },
    { name: "Ray of Enfeeblement", level: 2 }, { name: "Bestow Curse", level: 3 }, { name: "Blight", level: 4 },
    { name: "Danse Macabre", level: 5 }, { name: "Ghoul Touch", level: 1 }, { name: "Spectral Wail", level: 2 },
    { name: "Bone Shatter", level: 3 }, { name: "Grave Chill", level: 1 }, { name: "Soul Drain", level: 4 },
    { name: "Wraith's Embrace", level: 3 }, { name: "Dark Resurrection", level: 5 }, { name: "Curse of Decay", level: 2 },
    { name: "Necrotic Grasp", level: 1 }, { name: "Deathly Whispers", level: 3 }, { name: "Lifeless Aura", level: 2 },
    { name: "Phantom Pain", level: 1 }, { name: "Mourning Touch", level: 2 }, { name: "Reaper's Call", level: 4 },
    { name: "Spectral Requiem", level: 5 }
  ],
  Transmutation: [
    { name: "Alter Self", level: 2 }, { name: "Fly", level: 3 }, { name: "Polymorph", level: 4 },
    { name: "Shapechange", level: 9 }, { name: "Time Stop", level: 9 }, { name: "Expeditious Retreat", level: 1 },
    { name: "Levitate", level: 2 }, { name: "Haste", level: 3 }, { name: "Stone Shape", level: 4 },
    { name: "Control Weather", level: 8 }, { name: "Molecular Shift", level: 2 }, { name: "Transmute Matter", level: 3 },
    { name: "Flexible Form", level: 1 }, { name: "Essence Swap", level: 2 }, { name: "Altered Reality", level: 4 },
    { name: "Vital Transmutation", level: 3 }, { name: "Elemental Conversion", level: 2 }, { name: "Rapid Morph", level: 1 },
    { name: "Metamorphic Flow", level: 2 }, { name: "Shifting Aura", level: 3 }, { name: "Reconfigure", level: 1 },
    { name: "Form Change", level: 2 }, { name: "Transmutative Burst", level: 3 }, { name: "Adaptive Body", level: 1 },
    { name: "Prime Transmutation", level: 4 }
  ]
};


export const cantripList = [];
for (const school in spellLists) {
  cantripList.push(...spellLists[school].filter(spell => spell.level === 0));
}

export const spellEnhancements = [
  { name: "Enhanced Ability", type: "beneficial", description: "While attuned, one ability score (DM’s choice) increases by 2 (max 24)." },
  { name: "Regeneration", type: "beneficial", description: "Regain 1d6 HP at the start of each turn if above 0 HP." },
  { name: "Extra Force Damage", type: "offensive", description: "Extra 1d6 Force damage on a hit while attuned." },
  { name: "Increased Speed", type: "beneficial", description: "Speed increases by 10 feet while attuned." },
  { name: "Immunity to Conditions", type: "beneficial", description: "Immune to Blinded, Deafened, Petrified, and Stunned while attuned." },
  { name: "Skill Proficiency", type: "beneficial", description: "Gain proficiency in one skill (DM’s choice) while attuned." },
  { name: "Immunity to Poisoned", type: "beneficial", description: "Immune to Poisoned while attuned." },
  { name: "Charm & Fear Immunity", type: "beneficial", description: "Immune to Charmed and Frightened while attuned." },
  { name: "Damage Resistance", type: "beneficial", description: "Gain resistance to one damage type (DM’s choice) while attuned." },
  { name: "+1 Armor Class", type: "beneficial", description: "Gain a +1 bonus to AC while attuned." },
  { name: "Arcane Insight", type: "beneficial", description: "Advantage on Arcana checks while attuned." },
  { name: "Mystic Recovery", type: "beneficial", description: "Once per day, regain one expended spell slot." },
  { name: "Ethereal Step", type: "beneficial", description: "Move through difficult terrain without penalty." },
  { name: "Quickened Casting", type: "beneficial", description: "Cast a cantrip as a bonus action once per turn." },
  { name: "Focused Mind", type: "beneficial", description: "Advantage on saves against being charmed." },
  { name: "Resilient Spirit", type: "beneficial", description: "Advantage on saves against exhaustion while attuned." },
  { name: "Elemental Affinity", type: "beneficial", description: "Deal extra 1d4 elemental damage (DM’s choice) while attuned." },
  { name: "Mystic Shield", type: "beneficial", description: "Add proficiency bonus to AC for one round, once per day." },
  { name: "Swift Recovery", type: "beneficial", description: "Regain an extra hit die when taking a short rest." },
  { name: "Spell Echo", type: "beneficial", description: "Once per long rest, cast a spell a second time without an extra slot." },
  { name: "Arcane Magnetism", type: "beneficial", description: "Advantage on checks to find hidden magical objects." },
  { name: "Mystical Ward", type: "beneficial", description: "Gain temporary HP equal to your level when hit." },
  { name: "Enchanted Reflexes", type: "beneficial", description: "Gain a +2 bonus to initiative rolls." },
  { name: "Lucky Charm", type: "beneficial", description: "Once per day, re-roll a failed ability check." },
  { name: "Boon of Fortitude", type: "beneficial", description: "Gain resistance to one damage type (DM’s choice) while attuned." },
  { name: "Aura of Calm", type: "beneficial", description: "Allies within 10 feet have advantage on saves against fear." },
  { name: "Arcane Resilience", type: "beneficial", description: "Advantage on saves against spells while attuned." },
  { name: "Swift Strikes", type: "beneficial", description: "Attack one extra time when taking the Attack action." },
  { name: "Steadfast Resolve", type: "beneficial", description: "Advantage on saves against being frightened while attuned." },
  { name: "Mystic Bond", type: "beneficial", description: "When casting a spell, regain 1 charge if the item has charges." }
];

export const disadvantages = [
  { name: "Attunement Shock", type: "detrimental", description: "Each attunement requires a DC 10 Con save or you die (and become a Wight)." },
  { name: "Potion Diffusion", type: "detrimental", description: "Diffuses potions within 10 feet, making them nonmagical." },
  { name: "Arcane Backlash", type: "detrimental", description: "Whenever you cast, roll a d6; on a 1, take 1d6 force damage." },
  { name: "Unstable Magic", type: "detrimental", description: "Disadvantage on concentration checks while attuned." },
  { name: "Cursed Touch", type: "detrimental", description: "Touching a creature has a 25% chance to curse it for 1 minute." },
  { name: "Draining Aura", type: "detrimental", description: "Lose 1 HP at the start of each turn while attuned." },
  { name: "Reckless Power", type: "detrimental", description: "Disadvantage on spell attack rolls while casting." },
  { name: "Fleeting Focus", type: "detrimental", description: "Disadvantage on initiative rolls." },
  { name: "Unpredictable Charges", type: "detrimental", description: "Charges deplete unpredictably, sometimes losing extra." },
  { name: "Magical Overload", type: "detrimental", description: "10% chance to overload, preventing spellcasting for one round." },
  { name: "Haunted Essence", type: "detrimental", description: "Disadvantage on Wisdom checks due to disturbing whispers." },
  { name: "Fading Light", type: "detrimental", description: "Reduces spell effectiveness by 1 level once per day." },
  { name: "Unruly Magic", type: "detrimental", description: "5% chance that spells target a random creature." },
  { name: "Brittle Construction", type: "detrimental", description: "5% chance to break after each use." },
  { name: "Draining Aura II", type: "detrimental", description: "Lose an extra 1 HP if moving more than 30 feet in a round." },
  { name: "Erratic Behavior", type: "detrimental", description: "May force a roll on a random effect table (DM’s choice)." },
  { name: "Cursed Burden", type: "detrimental", description: "Maximum HP reduced by 2 while attuned." },
  { name: "Disruptive Energy", type: "detrimental", description: "Disadvantage on spellcasting checks when near another magical item." },
  { name: "Arcane Fatigue", type: "detrimental", description: "Suffer a level of exhaustion after casting until a long rest." },
  { name: "Chaotic Resonance", type: "detrimental", description: "Occasionally emit 1d4 damage bursts randomly." },
  { name: "Inhibiting Bond", type: "detrimental", description: "Cannot cast spells of a different school than the item's primary school." },
  { name: "Haunting Memories", type: "detrimental", description: "Disadvantage on Charisma checks due to painful memories." },
  { name: "Mana Leak", type: "detrimental", description: "Lose enough energy to reduce effective spell slots by 1 (once per day)." },
  { name: "Fragile Attunement", type: "detrimental", description: "If knocked unconscious, the item becomes inert until reattuned." },
  { name: "Dark Whispers", type: "detrimental", description: "Constant murmurs impose disadvantage on Insight checks." },
  { name: "Unending Chills", type: "detrimental", description: "Suffer 1 point of cold damage per minute." },
  { name: "Burdened Soul", type: "detrimental", description: "Movement speed reduced by 10 feet while attuned." },
  { name: "Magical Muddle", type: "detrimental", description: "Once per day, spells may scramble, causing one to fail." },
  { name: "Vengeful Echo", type: "detrimental", description: "Damage from backlash is also reflected to an ally within 5 feet." },
  { name: "Chaotic Flux", type: "detrimental", description: "10% chance any spell has an unintended side effect." }
];

export const spellConditions = [
  "with a whisper", "while touching the ground", "under moonlight", "when blood is spilled",
  "after a moment of meditation", "while holding a gem", "when a secret is spoken",
  "when a song is sung", "when a sacrifice is made", "when a promise is broken",
  "when a tear is shed", "when a heart is full", "when a mind is clear", "when a soul is lost",
  "when a star is seen", "when a shadow falls", "when a flame dances", "when a storm rages"
];

export const quirks = [
  "pulses with arcane energy", "whispers forgotten spells", "reacts to emotions", "changes color with the seasons",
  "feels warm to the touch", "seems to hum a melody", "occasionally emits sparks", "reflects nearby magic",
  "shows visions of the future", "feels lighter than it should", "feels heavier than it should", "seems to grow in power",
  "seems to shrink in power", "occasionally vibrates", "occasionally glows", "occasionally chills", "occasionally burns",
  "occasionally whispers", "occasionally sings", "is Blissful: You feel fortunate and optimistic about what the future holds.",
  "is Confident: The item helps you feel self-assured", "is Covetus: You become obsessed with material wealth",
  "is Fragile: The item crumbles, frays, or cracks slightly when wielded.", "is Loud: This item makes a loud noise when used.",
  "is Metamorphic: The item periodically alters its appearance in slight ways.", "is Painful: You experience a harmless flash of pain when using the item.",
  "is Repulsive: You feel a sense of distaste when in contact with the item."
];

export const colors = [
  { name: "Azure", hex: "#007FFF" }, { name: "Veridian", hex: "#40826D" }, { name: "Opal", hex: "#A8CABA" },
  { name: "Garnet", hex: "#800000" }, { name: "Onyx", hex: "#000000" }, { name: "Gold", hex: "#FFD700" },
  { name: "Silver", hex: "#C0C0C0" }, { name: "Bronze", hex: "#CD7F32" }, { name: "Amethyst", hex: "#9966CC" },
  { name: "Jade", hex: "#00A86B" }, { name: "Sapphire", hex: "#0F52BA" }, { name: "Ruby", hex: "#E0115F" }
];

export const accentColors = [
  { name: "Electric Blue", hex: "#7DF9FF" }, { name: "Neon Green", hex: "#39FF14" }, { name: "Violet", hex: "#8A2BE2" },
  { name: "Hot Pink", hex: "#FF69B4" }, { name: "Sunset Orange", hex: "#FF4500" }, { name: "Lime", hex: "#BFFF00" },
  { name: "Fuchsia", hex: "#FF77FF" }
];

export const rarities = [
  {
    name: "Uncommon", weight: 40, spellSlots: 1, atWill: 1, enhancement: 1, attunement: false,
    meleeDamage: "1d4 bludgeoning", maxSpellLevel: 1
  },
  {
    name: "Rare", weight: 30, spellSlots: 2, atWill: 1, enhancement: 2, attunement: true,
    meleeDamage: "1d4 bludgeoning", maxSpellLevel: 2
  },
  {
    name: "Very Rare", weight: 20, spellSlots: 3, atWill: 1, enhancement: 3, attunement: true,
    meleeDamage: "1d6 bludgeoning", maxSpellLevel: 3
  },
  {
    name: "Legendary", weight: 10, spellSlots: 4, atWill: 1, enhancement: 4, attunement: true,
    meleeDamage: "1d6 bludgeoning", maxSpellLevel: 4
  }
];

export const sentientAlignments = [
  "Lawful Good", "Neutral Good", "Chaotic Good", "Lawful Neutral", "True Neutral",
  "Chaotic Neutral", "Lawful Evil", "Neutral Evil", "Chaotic Evil"
];
export const sentientPersonalities = [
  "Arrogant", "Benevolent", "Cautious", "Chaotic", "Compassionate", "Cowardly", "Cruel",
  "Curious", "Cynical", "Deceitful", "Devout", "Disciplined", "Envious", "Greedy",
  "Honest", "Honorable", "Idealistic", "Impulsive", "Independent", "Jealous", "Jovial",
  "Lazy", "Loyal", "Malicious", "Mischievous", "Modest", "Optimistic", "Pessimistic",
  "Pious", "Playful", "Practical", "Proud", "Rebellious", "Reckless", "Reserved",
  "Sarcastic", "Secretive", "Selfish", "Stoic", "Stubborn", "Suspicious", "Tactful",
  "Timid", "Vain", "Vengeful", "Wise", "Witty"
];
export const sentientSenses = [
  "Hearing and standard vision out to 30 feet", "Hearing and standard vision out to 60 feet",
  "Hearing and standard vision out to 120 feet", "Hearing and Darkvision out to 120 feet"
];
export const sentientPurposes = [
  "Aligned. The item seeks to defeat or destroy those of a diametrically opposed alignment. Such an item is never Neutral",
  "Bane. The item seeks to thwart or destroy creatures of a particular type, such as Constructs, fiends, or Undead",
  "Creator Seeker. The item seeks its creator and wants to understand why it was created",
  "Destiny Seeker. The item believes it and its bearer have key roles to play in future events.",
  "Destroyer. The item craves destruction and goads its user to fight arbitrarily.",
  "Glory Seeker. The item seeks renown as the greatest magic item in the world by winning fame or notoriety for its user.",
  "Lore Seeker. The item craves knowledge or is determined to solve a mystery, learn a secret, or unravel a cryptic prophecy",
  "Protector. The item seeks to defend a particular kind of creature, such as elves or werewolves.",
  "Soulmate Seeker. The item seeks another sentient magic item, perhaps one that is similar to itself.",
  "Templar. The item seeks to defend the servants and interests of a particular deity."
];

export const staffDesigns = [
  "a simple, unadorned shaft", "a polished jewel at the top", "a glowing orb at the top",
  "a skull at the top", "intricate carvings along the shaft", "a leather-wrapped grip",
  "a metal ferrule at the base", "a series of small bells along the shaft", "a cluster of feathers at the top",
  "a winding vine pattern", "a smooth, polished surface", "a rough, bark-like texture",
  "a spiral design along the shaft", "a series of runes etched into the surface", "a small, caged flame at the top",
  "a cluster of crystals at the top", "a small, caged creature at the top", "a series of small mirrors along the shaft",
  "a small, caged storm at the top", "a series of small gears along the shaft", "a small, caged star at the top",
  "a series of small faces along the shaft", "a small, caged eye at the top", "a series of small hands along the shaft",
  "a small, caged heart at the top"
];