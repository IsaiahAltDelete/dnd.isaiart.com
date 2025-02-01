/* --- Data Arrays --- */

// Basic monster options
const monsterTypes = [
    "Aberration", "Beast", "Celestial", "Construct", "Dragon", "Elemental", "Fey", "Fiend",
    "Giant", "Humanoid", "Monstrosity", "Ooze", "Plant", "Undead", "Swarm", "Titan",
    "Snake", "Bat", "Big Cat", "Bear", "Wolf", "Spider", "Rat", "Crocodile", "Ape", "Boar",
    "Eagle", "Owl", "Shark", "Squid", "Scorpion", "Beetle", "Centipede", "Lizard", "Frog", "Toad",
    "Mermaid", "Centaur", "Harpy", "Griffin", "Sphinx", "Gorgon", "Minotaur", "Satyr", "Dryad", "Nymph",
    "Banshee", "Ghoul", "Lich", "Mummy", "Specter", "Wraith", "Golem", "Homunculus", "Animated Armor",
    "Treant", "Shambling Mound", "Myconid", "Blink Dog", "Displacer Beast", "Rust Monster", "Mimic",
    "Beholder", "Mind Flayer", "Aboleth", "Slaad", "Yuan-ti", "Githyanki", "Githzerai", "Modron",
    "Couatl", "Deva", "Planetar", "Solar", "Erinyes", "Imp", "Succubus", "Pit Fiend", "Balor",
    "Efreeti", "Djinn", "Marid", "Dao", "Salamander", "Gargoyle", "Medusa", "Lamia", "Naga",
    "Tarrasque", "Kraken", "Leviathan", "Phoenix", "Unicorn", "Pegasus", "Basilisk", "Cockatrice"
  ];
  
  const monsterStyles = [
    "Skeletal", "Armored", "Fleshy", "Gaseous", "Crystalline", "Shadowy", "Ethereal", "Mechanical",
    "Plant-like", "Insectoid", "Aquatic", "Avian", "Reptilian", "Fungal", "Demonic", "Angelic",
    "Chaotic", "Orderly", "Primal", "Ancient", "Futuristic", "Magical", "Psionic", "Mutated",
    "Corrupted", "Radiant", "Abyssal", "Celestial", "Infernal", "Feywild", "Shadowfell", "Astral",
    "Elemental", "Clockwork", "Golemic", "Spectral", "Venomous", "Bioluminescent",
    "Chitinous", "Scaly", "Feathered", "Furred", "Spiked", "Tendriled", "Segmented", "Amorphous"
  ];
  
  const monsterColors = [
    { name: "Crimson", hex: "#DC143C" },
    { name: "Emerald", hex: "#50C878" },
    { name: "Sapphire", hex: "#0F52BA" },
    { name: "Amethyst", hex: "#9966CC" },
    { name: "Obsidian", hex: "#2A2A2A" },
    { name: "Golden", hex: "#FFD700" },
    { name: "Silver", hex: "#C0C0C0" },
    { name: "Bronze", hex: "#CD7F32" },
    { name: "Ruby", hex: "#E0115F" },
    { name: "Topaz", hex: "#FFC87C" },
    { name: "Turquoise", hex: "#40E0D0" },
    { name: "Magenta", hex: "#FF00FF" },
    { name: "Bone White", hex: "#F0E68C" },
    { name: "Forest Green", hex: "#228B22" },
    { name: "Sky Blue", hex: "#87CEEB" },
    { name: "Rust Brown", hex: "#A0522D" },
    { name: "Midnight Black", hex: "#191970" },
    { name: "Coral Pink", hex: "#FF7F50" },
    { name: "Lavender", hex: "#E6E6FA" },
    { name: "Charcoal Gray", hex: "#36454F" },
    { name: "Lime Green", hex: "#32CD32" },
    { name: "Violet", hex: "#EE82EE" }
  ];
  
  const monsterAbilities = [
    { name: "Claws", type: "melee", damage: "1d6 slashing" },
    { name: "Bite", type: "melee", damage: "1d6 piercing" },
    { name: "Stomp", type: "melee", damage: "1d8 bludgeoning" },
    { name: "Tail Whip", type: "melee", damage: "1d6 bludgeoning" },
    { name: "Acid Spit", type: "ranged", damage: "2d6 acid" },
    { name: "Fire Breath", type: "ranged", damage: "3d6 fire", recharge: "5-6" },
    { name: "Ice Blast", type: "ranged", damage: "3d6 cold", recharge: "5-6" },
    { name: "Lightning Bolt", type: "ranged", damage: "3d6 lightning", recharge: "5-6" },
    { name: "Teleportation", type: "movement", description: "Teleports up to 30 feet" },
    { name: "Invisibility", type: "defense", description: "Becomes invisible for 1 minute" },
    { name: "Mind Control", type: "spell", description: "Attempts to control the mind of a target", save: "Wisdom" },
    { name: "Regeneration", type: "defense", description: "Regains 5 hit points at the start of its turn" },
    { name: "Flight", type: "movement", description: "Has a flying speed of 60 feet" },
    { name: "Burrowing", type: "movement", description: "Has a burrowing speed of 30 feet" },
    { name: "Camouflage", type: "defense", description: "Has advantage on stealth checks in its natural environment" },
    { name: "Webbing", type: "ranged", description: "Shoots webs to restrain targets", save: "Strength" },
    { name: "Poison Sting", type: "melee", damage: "1d4 piercing + 2d4 poison", save: "Constitution" },
    { name: "Sonic Scream", type: "ranged", damage: "2d6 thunder", description: "Can knock targets prone", save: "Constitution" },
    { name: "Petrification Gaze", type: "ranged", description: "Attempts to petrify a target", save: "Constitution" },
    { name: "Shadow Step", type: "movement", description: "Teleports between shadows" },
    { name: "Ethereal Jaunt", type: "movement", description: "Can move into the Ethereal Plane" },
    { name: "Spellcasting", type: "spell", description: "Can cast spells" },
    { name: "Aura of Fear", type: "defense", description: "Frightens nearby enemies", save: "Wisdom" },
    { name: "Life Drain", type: "melee", damage: "1d6 necrotic", description: "Heals for half the damage dealt" },
    { name: "Energy Drain", type: "melee", damage: "1d6 necrotic", description: "Reduces a target's ability score", save: "Constitution" },
    { name: "Summoning", type: "spell", description: "Can summon allies" },
    { name: "Telekinesis", type: "spell", description: "Can move objects with its mind" },
    { name: "Shapechanging", type: "defense", description: "Can change its form" },
    { name: "Mimicry", type: "defense", description: "Can mimic sounds and voices" },
    { name: "Amphibious", type: "movement", description: "Can breathe air and water" },
    { name: "Trampling Charge", type: "melee", damage: "2d8 bludgeoning", description: "Can charge and trample enemies" },
    { name: "Constrict", type: "melee", damage: "1d8 bludgeoning", description: "Can constrict targets", save: "Strength" },
    { name: "Venomous Bite", type: "melee", damage: "1d4 piercing + 2d6 poison", save: "Constitution" },
    { name: "Acidic Blood", type: "defense", description: "Deals acid damage to attackers" },
    { name: "Freezing Touch", type: "melee", damage: "1d4 cold", description: "Reduces a target's speed", save: "Constitution" },
    { name: "Thunderous Roar", type: "ranged", damage: "2d8 thunder", description: "Can knock targets prone", save: "Constitution" },
    { name: "Hypnotic Gaze", type: "ranged", description: "Attempts to charm a target", save: "Wisdom" },
    { name: "Illusory Form", type: "defense", description: "Can create illusions of itself" },
    { name: "Berserk Rage", type: "buff", description: "Enters a rage, gaining strength and damage" },
    { name: "Divine Smite", type: "melee", damage: "2d8 radiant", description: "Deals extra radiant damage" },
    { name: "Unholy Aura", type: "defense", description: "Reduces the saving throws of nearby enemies", save: "Wisdom" },
    { name: "Elemental Absorption", type: "defense", description: "Absorbs elemental damage to heal itself" },
    { name: "Gravity Manipulation", type: "spell", description: "Can manipulate gravity" },
    { name: "Time Manipulation", type: "spell", description: "Can manipulate time" },
    { name: "Reality Warping", type: "spell", description: "Can warp reality" },
    { name: "Astral Projection", type: "movement", description: "Can project its consciousness into the Astral Plane" }
  ];
  
  // Additional monster details and options
  const monsterOrigins = [
    "Material Plane", "Plane of Fire", "Plane of Water", "Plane of Earth", "Plane of Air",
    "Feywild", "Shadowfell", "Nine Hells", "Abyss", "Astral Plane", "Ethereal Plane",
    "Mount Celestia", "Bytopia", "Elysium", "The Beastlands", "Arborea", "Ysgard", "Limbo",
    "Pandemonium", "The Gray Waste", "Carceri", "Hades", "Gehenna", "Baator", "Acheron",
    "Arctic Tundra", "Tropical Rainforest", "Volcanic Mountains", "Deep Ocean Trenches", "Desolate Desert",
    "Ancient Ruins", "Forgotten Caves", "Haunted Forests", "Floating Islands", "Underground Cities",
    "The Elemental Chaos", "The Far Realm", "The Positive Energy Plane", "The Negative Energy Plane"
  ];
  
  const monsterSizes = ["Tiny", "Small", "Medium", "Large", "Huge", "Gargantuan"];
  
  const monsterAlignments = [
    "Lawful Good", "Neutral Good", "Chaotic Good", "Lawful Neutral", "True Neutral",
    "Chaotic Neutral", "Lawful Evil", "Neutral Evil", "Chaotic Evil", "Unaligned"
  ];
  
  const monsterSenses = [
    "Darkvision", "Blindsight", "Truesight", "Tremorsense", "Keen Smell", "Keen Hearing", "Keen Sight"
  ];
  
  // Languages based on origin
  const monsterLanguages = {
    "Material Plane": ["Common"],
    "Plane of Fire": ["Primordial", "Infernal"],
    "Plane of Water": ["Primordial", "Aquan"],
    "Plane of Earth": ["Primordial", "Terran"],
    "Plane of Air": ["Primordial", "Auran"],
    "Feywild": ["Sylvan", "Elvish"],
    "Shadowfell": ["Undercommon", "Abyssal"],
    "Nine Hells": ["Infernal", "Common"],
    "Abyss": ["Abyssal", "Common"],
    "Astral Plane": ["Telepathy", "Celestial"],
    "Ethereal Plane": ["Telepathy"],
    "Mount Celestia": ["Celestial", "Common"],
    "Bytopia": ["Celestial", "Common"],
    "Elysium": ["Celestial", "Elvish"],
    "The Beastlands": ["Sylvan", "Common"],
    "Arborea": ["Elvish", "Sylvan"],
    "Ysgard": ["Giant", "Common"],
    "Limbo": ["Primordial", "Telepathy"],
    "Pandemonium": ["Abyssal", "Infernal"],
    "The Gray Waste": ["Infernal", "Abyssal"],
    "Carceri": ["Infernal", "Abyssal"],
    "Hades": ["Infernal", "Abyssal"],
    "Gehenna": ["Infernal", "Abyssal"],
    "Baator": ["Infernal", "Abyssal"],
    "Acheron": ["Infernal", "Abyssal"],
    "Arctic Tundra": ["Giant", "Common"],
    "Tropical Rainforest": ["Sylvan", "Common"],
    "Volcanic Mountains": ["Primordial", "Infernal"],
    "Deep Ocean Trenches": ["Aquan", "Common"],
    "Desolate Desert": ["Common", "Primordial"],
    "Ancient Ruins": ["Undercommon", "Common"],
    "Forgotten Caves": ["Undercommon", "Common"],
    "Haunted Forests": ["Sylvan", "Common"],
    "Floating Islands": ["Auran", "Common"],
    "Underground Cities": ["Undercommon", "Common"],
    "The Elemental Chaos": ["Primordial", "Telepathy"],
    "The Far Realm": ["Telepathy", "Deep Speech"],
    "The Positive Energy Plane": ["Celestial", "Telepathy"],
    "The Negative Energy Plane": ["Abyssal", "Telepathy"]
  };
  
  // Physical characteristics
  const monsterCharacteristics = {
    "wings": ["Has Wings", "No Wings"],
    "scales": ["Has Scales", "No Scales"],
    "hair": ["Has Hair", "Hairless"],
    "horns": ["Has Horns", "No Horns"],
    "tail": ["Has Tail", "No Tail"],
    "extraLimbs": ["Has Extra Limbs", "No Extra Limbs"],
    "eyes": ["Multiple Eyes", "Two Eyes", "No Eyes"]
  };
  
  const monsterShapes = [
    "Aberration", "Beast", "Celestial", "Construct", "Dragon", "Elemental", "Fey", "Fiend",
    "Giant", "Humanoid", "Monstrosity", "Ooze", "Plant", "Undead", "Swarm", "Titan"
  ];
  
  // Name generation parts
  const namePrefixes = ["Gnar", "Vor", "Xyl", "Zar", "Kry", "Mor", "Thal", "Vex", "Jor", "Fey", "Gloom", "Shad", "Ebon", "Crim", "Aeth", "Lum", "Sol", "Ter", "Aqua", "Pyro", "Cryo", "Geo", "Aero"];
  const nameMiddles = ["ath", "oth", "yth", "eth", "ith", "ar", "or", "yr", "er", "ir", "ax", "ox", "yx", "ex", "ix", "un", "en", "in", "on", "an"];
  const nameSuffixes = ["os", "us", "is", "as", "es", "on", "an", "en", "in", "ar", "or", "yr", "er", "ir", "ax", "ox", "yx", "ex", "ix"];
  
  // Monster quirks
  const monsterQuirks = [
    "Has a collection of shiny objects", "Hums a strange melody when idle", "Is afraid of heights",
    "Speaks in riddles", "Has a third eye", "Is always hungry", "Glows in the dark",
    "Leaves a trail of slime", "Has a habit of collecting teeth", "Is obsessed with cleanliness",
    "Has a terrible sense of direction", "Can only speak in rhymes", "Is always telling bad jokes",
    "Has a fear of open spaces", "Can predict the weather", "Is always covered in mud",
    "Has a collection of bones", "Is afraid of its own shadow", "Can only see in black and white",
    "Has a habit of hoarding food", "Is always trying to make friends", "Is obsessed with shiny objects",
    "Has a fear of small creatures", "Can only speak in whispers", "Is always covered in feathers",
    "Has a collection of rocks", "Is afraid of loud noises", "Can only see in shades of green",
    "Has a habit of collecting buttons", "Is always trying to start a fight", "Is obsessed with cleanliness",
    "Has a fear of water", "Can only speak in song", "Is always covered in leaves",
    "Has a collection of keys", "Is afraid of the dark", "Can only see in shades of blue",
    "Has a habit of collecting string", "Is always trying to help others", "Is obsessed with patterns",
    "Has a fear of enclosed spaces", "Can only speak in questions", "Is always covered in fur",
    "Has a collection of maps", "Is afraid of fire", "Can only see in shades of red",
    "Has a habit of collecting coins", "Is always trying to steal things", "Is obsessed with symmetry",
    "Has a fear of heights", "Can only speak in gibberish", "Is always covered in scales",
    "Has a collection of books", "Is afraid of magic", "Can only see in shades of yellow",
    "Has a habit of collecting flowers", "Is always trying to impress others", "Is obsessed with order",
    "Has a fear of crowds", "Can only speak in quotes", "Is always covered in vines",
    "Has a collection of tools", "Is afraid of silence", "Can only see in shades of purple",
    "Has a habit of collecting feathers", "Is always trying to trick others", "Is obsessed with chaos",
    "Has a fear of the unknown", "Can only speak in rhymes", "Is always covered in moss",
    "Has a collection of gems", "Is afraid of ghosts", "Can only see in shades of orange",
    "Has a habit of collecting shells", "Is always trying to be the center of attention", "Is obsessed with cleanliness"
  ];
  
  // *** NEW ARRAYS FOR EXTRA FEATURES ***
  
  // Habitats (for a new select option and flavor)
  const monsterHabitats = [
    "Forest", "Desert", "Cave", "Swamp", "Urban Ruins", "Mountains", "Underwater", "Volcano", "Grassland", "Tundra", "Ruins"
  ];
  
  // Condition immunities and vulnerabilities
  const conditionImmunities = ["Charmed", "Exhaustion", "Frightened", "Paralyzed", "Poisoned", "Stunned"];
  const vulnerabilities = ["Fire", "Cold", "Lightning", "Acid", "Necrotic", "Radiant", "Psychic"];
  
  // Loot and behavior
  const monsterLoot = ["Coins", "Magical Artifact", "Potion of Healing", "Ancient Scroll", "Gemstone", "Weapon", "Armor", "Ring", "Cursed Item", "Spellbook"];
  const monsterBehavior = ["Aggressive", "Territorial", "Solitary", "Pack Hunter", "Mischievous", "Cunning", "Lazy", "Curious", "Reclusive", "Bloodthirsty"];
  
  /* --- Utility Functions --- */
  function randomItem(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }
  function randomNumber(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  function generateAbilityScore() {
    return randomNumber(3, 18);
  }
  function generateChallengeRating() {
    const crValues = ["0", "1/8", "1/4", "1/2", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "30"];
    return randomItem(crValues);
  }
  function generateMonsterName(monsterType, monsterStyle, mainColorName) {
    if (Math.random() < 0.7) { // 70% chance for a generated name
      const prefix = randomItem(namePrefixes);
      const middle = randomItem(nameMiddles);
      const suffix = randomItem(nameSuffixes);
      return `${prefix}${middle}${suffix}`;
    } else { // 30% chance for an adjective-based name
      return `${mainColorName} ${monsterStyle} ${monsterType}`;
    }
  }
  function showToast(message) {
    const toastContainer = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.classList.add('toast');
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => { toast.classList.add('show'); }, 10);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => { toastContainer.removeChild(toast); }, 300);
    }, 3000);
  }
  function generateHitPoints(cr, con) {
    let baseHP = 0, diceType = 8, numDice = 0;
    let conMod = Math.floor((con - 10) / 2);
    switch (cr) {
      case "0": baseHP = 1; numDice = 1; diceType = 4; break;
      case "1/8": baseHP = 5; numDice = 1; diceType = 6; break;
      case "1/4": baseHP = 10; numDice = 2; diceType = 6; break;
      case "1/2": baseHP = 20; numDice = 3; diceType = 8; break;
      case "1": baseHP = 30; numDice = 4; diceType = 8; break;
      case "2": baseHP = 50; numDice = 5; diceType = 8; break;
      case "3": baseHP = 70; numDice = 6; diceType = 8; break;
      case "4": baseHP = 90; numDice = 7; diceType = 8; break;
      case "5": baseHP = 110; numDice = 8; diceType = 10; break;
      case "6": baseHP = 130; numDice = 9; diceType = 10; break;
      case "7": baseHP = 150; numDice = 10; diceType = 10; break;
      case "8": baseHP = 170; numDice = 11; diceType = 10; break;
      case "9": baseHP = 190; numDice = 12; diceType = 10; break;
      case "10": baseHP = 210; numDice = 13; diceType = 10; break;
      case "11": baseHP = 230; numDice = 14; diceType = 10; break;
      case "12": baseHP = 250; numDice = 15; diceType = 10; break;
      case "13": baseHP = 270; numDice = 16; diceType = 10; break;
      case "14": baseHP = 290; numDice = 17; diceType = 10; break;
      case "15": baseHP = 310; numDice = 18; diceType = 10; break;
      case "16": baseHP = 330; numDice = 19; diceType = 10; break;
      case "17": baseHP = 350; numDice = 20; diceType = 10; break;
      case "18": baseHP = 370; numDice = 21; diceType = 10; break;
      case "19": baseHP = 390; numDice = 22; diceType = 10; break;
      case "20": baseHP = 410; numDice = 23; diceType = 10; break;
      case "21": baseHP = 430; numDice = 24; diceType = 10; break;
      case "22": baseHP = 450; numDice = 25; diceType = 10; break;
      case "23": baseHP = 470; numDice = 26; diceType = 10; break;
      case "24": baseHP = 490; numDice = 27; diceType = 10; break;
      case "25": baseHP = 510; numDice = 28; diceType = 10; break;
      case "26": baseHP = 530; numDice = 29; diceType = 10; break;
      case "27": baseHP = 550; numDice = 30; diceType = 10; break;
      case "28": baseHP = 570; numDice = 31; diceType = 10; break;
      case "29": baseHP = 590; numDice = 32; diceType = 10; break;
      case "30": baseHP = 610; numDice = 33; diceType = 10; break;
      default: baseHP = 10; numDice = 1; diceType = 6;
    }
    let hp = baseHP + (numDice * conMod);
    return `${hp} (${numDice}d${diceType} + ${numDice * conMod})`;
  }
  
  /* --- Populate Select Options --- */
  const monsterTypeSelect = document.getElementById("monsterTypeSelect");
  monsterTypes.forEach(type => {
    const option = document.createElement("option");
    option.value = type;
    option.textContent = type;
    monsterTypeSelect.appendChild(option);
  });
  
  const styleSelect = document.getElementById("styleSelect");
  monsterStyles.forEach(style => {
    const option = document.createElement("option");
    option.value = style;
    option.textContent = style;
    styleSelect.appendChild(option);
  });
  
  const crSelect = document.getElementById("crSelect");
  const crValues = ["Any", "0", "1/8", "1/4", "1/2", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "30"];
  crValues.forEach(cr => {
    const option = document.createElement("option");
    option.value = cr;
    option.textContent = cr;
    crSelect.appendChild(option);
  });
  
  // Populate the new Habitat select
  const habitatSelect = document.getElementById("habitatSelect");
  monsterHabitats.forEach(habitat => {
    const option = document.createElement("option");
    option.value = habitat;
    option.textContent = habitat;
    habitatSelect.appendChild(option);
  });
  
  /* --- Main Generation Function --- */
  function generateMonster() {
    // Retrieve user selections
    const selectedMonsterType = monsterTypeSelect.value;
    const selectedStyle = styleSelect.value;
    const selectedCR = crSelect.value;
    const selectedHabitat = habitatSelect.value;
    
    // Determine basic monster details based on selection or random choice
    const monsterType = (selectedMonsterType === "Any") ? randomItem(monsterTypes) : selectedMonsterType;
    const monsterStyle = (selectedStyle === "Any") ? randomItem(monsterStyles) : selectedStyle;
    const mainColor = randomItem(monsterColors);
    let accentColor = null;
    if (Math.random() < 0.4) {
      accentColor = randomItem(monsterColors);
      while (accentColor === mainColor) {
        accentColor = randomItem(monsterColors);
      }
    }
    
    // Extra abilities, origin, size, alignment, senses, languages, and challenge rating
    const ability1 = randomItem(monsterAbilities);
    const ability2 = randomItem(monsterAbilities);
    const origin = randomItem(monsterOrigins);
    const size = randomItem(monsterSizes);
    const alignment = randomItem(monsterAlignments);
    const senses = randomItem(monsterSenses);
    
    let language1 = "Common", language2 = "Common";
    if (monsterLanguages[origin]) {
      language1 = randomItem(monsterLanguages[origin]);
      language2 = randomItem(monsterLanguages[origin]);
      if (language1 === language2 && monsterLanguages[origin].length > 1) {
        language2 = randomItem(monsterLanguages[origin].filter(lang => lang !== language1));
      }
    }
    const cr = (selectedCR === "Any") ? generateChallengeRating() : selectedCR;
    
    // Generate ability scores
    const str = generateAbilityScore();
    const dex = generateAbilityScore();
    const con = generateAbilityScore();
    const int = generateAbilityScore();
    const wis = generateAbilityScore();
    const cha = generateAbilityScore();
    
    // Physical characteristics
    const hasWings = randomItem(monsterCharacteristics.wings);
    const hasScales = randomItem(monsterCharacteristics.scales);
    const hasHair = randomItem(monsterCharacteristics.hair);
    const hasHorns = randomItem(monsterCharacteristics.horns);
    const hasTail = randomItem(monsterCharacteristics.tail);
    const hasExtraLimbs = randomItem(monsterCharacteristics.extraLimbs);
    const hasEyes = randomItem(monsterCharacteristics.eyes);
    const shape = randomItem(monsterShapes);
    
    // Generate name
    const monsterName = generateMonsterName(monsterType, monsterStyle, mainColor.name);
    const mainColorMarkup = `<span class="color-box" style="background: ${mainColor.hex};"></span><strong>${mainColor.name}</strong> (${mainColor.hex})`;
    const accentColorMarkup = accentColor ? `<span class="color-box" style="background: ${accentColor.hex};"></span><strong>${accentColor.name}</strong> (${accentColor.hex})` : "";
    
    // Optional quirk
    let quirkInfo = "";
    if (Math.random() < 0.5) {
      const quirk = randomItem(monsterQuirks);
      quirkInfo = `<p><i class="fas fa-question-circle icon"></i><strong>Quirk:</strong> ${quirk}</p>`;
    }
    
    // Extra stats: Hit Points, Armor Class, and Speed
    const hp = generateHitPoints(cr, con);
    const ac = randomNumber(10, 20);
    const landSpeed = randomNumber(20, 60);
    let flySpeed = null;
    if (hasWings === "Has Wings") {
      flySpeed = randomNumber(30, 80);
    }
    let swimSpeed = null;
    // Use habitat selection (if "Any", choose randomly from monsterHabitats)
    const habitat = (selectedHabitat === "Any") ? randomItem(monsterHabitats) : selectedHabitat;
    if (habitat === "Underwater") {
      swimSpeed = randomNumber(20, 60);
    }
    
    // Extra defense options: condition immunities and damage vulnerabilities
    let condImmunities = [];
    if (Math.random() < 0.2) {
      condImmunities.push(randomItem(conditionImmunities));
    }
    let vulnerability = [];
    if (Math.random() < 0.2) {
      vulnerability.push(randomItem(vulnerabilities));
    }
    
    // Extra monster traits: behavior and treasure
    const behavior = randomItem(monsterBehavior);
    let loot = null;
    if (Math.random() < 0.3) {
      loot = randomItem(monsterLoot);
    }
    
    // Build the monster description with extra sections
    const description = `
      <h2>${monsterName}</h2>
      <h3><i class="fas fa-shapes icon"></i><strong>${shape}</strong>, <i class="fas fa-paw icon"></i><strong>${monsterType}</strong></h3>
      <p><i class="fas fa-palette icon"></i><strong>Color:</strong> ${mainColorMarkup} ${accentColorMarkup}</p>
      <p><i class="fas fa-ruler icon"></i><strong>Size:</strong> ${size}</p>
      <p><i class="fas fa-align-center icon"></i><strong>Alignment:</strong> ${alignment}</p>
      <p><i class="fas fa-heart icon"></i><strong>Hit Points:</strong> ${hp}</p>
      
      <div class="section-title">Abilities</div>
      <ul class="abilities-list">
        <li><i class="fas fa-bolt icon"></i><strong>${ability1.name}:</strong> ${ability1.damage ? `Damage: ${ability1.damage}, ` : ""}${ability1.description || ""}${ability1.save ? ` (Save: ${ability1.save})` : ""}</li>
        <li><i class="fas fa-bolt icon"></i><strong>${ability2.name}:</strong> ${ability2.damage ? `Damage: ${ability2.damage}, ` : ""}${ability2.description || ""}${ability2.save ? ` (Save: ${ability2.save})` : ""}</li>
      </ul>
      
      <div class="section-title">Origin & Languages</div>
      <p><i class="fas fa-globe icon"></i><strong>Origin:</strong> ${origin}</p>
      <p><i class="fas fa-eye icon"></i><strong>Senses:</strong> ${senses}</p>
      <p><i class="fas fa-language icon"></i><strong>Languages:</strong> ${language1}, ${language2}</p>
      
      <div class="section-title">Stats</div>
      <p><i class="fas fa-balance-scale icon"></i><strong>Challenge Rating:</strong> ${cr}</p>
      <div class="ability-scores">
        <div class="ability-score"><strong>STR</strong><br>${str}</div>
        <div class="ability-score"><strong>DEX</strong><br>${dex}</div>
        <div class="ability-score"><strong>CON</strong><br>${con}</div>
        <div class="ability-score"><strong>INT</strong><br>${int}</div>
        <div class="ability-score"><strong>WIS</strong><br>${wis}</div>
        <div class="ability-score"><strong>CHA</strong><br>${cha}</div>
      </div>
      
      <div class="section-title">Defenses & Movement</div>
      <p><i class="fas fa-shield icon"></i><strong>Armor Class:</strong> ${ac}</p>
      <p><i class="fas fa-running icon"></i><strong>Speed:</strong> Land ${landSpeed} ft.${flySpeed ? `, Fly ${flySpeed} ft.` : ""}${swimSpeed ? `, Swim ${swimSpeed} ft.` : ""}</p>
      ${condImmunities.length > 0 ? `<p><i class="fas fa-ban icon"></i><strong>Condition Immunities:</strong> ${condImmunities.join(", ")}</p>` : ""}
      ${vulnerability.length > 0 ? `<p><i class="fas fa-exclamation-triangle icon"></i><strong>Damage Vulnerabilities:</strong> ${vulnerability.join(", ")}</p>` : ""}
      
      <div class="section-title">Habitat & Behavior</div>
      <p><i class="fas fa-tree icon"></i><strong>Habitat:</strong> ${habitat}</p>
      <p><i class="fas fa-brain icon"></i><strong>Behavior:</strong> ${behavior}</p>
      ${loot ? `<p><i class="fas fa-gem icon"></i><strong>Treasure:</strong> ${loot}</p>` : ""}
      
      <div class="section-title">Physical Characteristics</div>
      <p><i class="fas fa-feather icon"></i><strong>Wings:</strong> ${hasWings}</p>
      <p><i class="fas fa-shield-alt icon"></i><strong>Scales:</strong> ${hasScales}</p>
      <p><i class="fas fa-user icon"></i><strong>Hair:</strong> ${hasHair}</p>
      <p><i class="fas fa-bullhorn icon"></i><strong>Horns:</strong> ${hasHorns}</p>
      <p><i class="fas fa-long-arrow-alt-down icon"></i><strong>Tail:</strong> ${hasTail}</p>
      <p><i class="fas fa-hand-spock icon"></i><strong>Extra Limbs:</strong> ${hasExtraLimbs}</p>
      <p><i class="fas fa-eye-slash icon"></i><strong>Eyes:</strong> ${hasEyes}</p>
      ${quirkInfo}
    `;
    
    document.getElementById("monsterDisplay").innerHTML = description;
  }
  
  // Copy monster details (plain text) to clipboard.
  function copyMonsterDetails() {
    const monsterText = document.getElementById("monsterDisplay").innerText;
    navigator.clipboard.writeText(monsterText)
      .then(() => showToast("Monster details copied to clipboard!"))
      .catch(err => showToast("Failed to copy: " + err));
  }
  
  // Event listeners for Generate & Copy buttons.
  document.getElementById("generateBtn").addEventListener("click", generateMonster);
  document.getElementById("copyBtn").addEventListener("click", copyMonsterDetails);
  