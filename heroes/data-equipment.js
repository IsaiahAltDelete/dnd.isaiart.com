// data-equipment.js

const equipmentBase = [ // Utility/Non-Weapon Gear
    { name: "Utility Belt", icon: "construction", type: ["Gadgeteer", "Infiltrator", "Marksman", "Rogue", "Warrior"] },
    { name: "Grappling Hook & Line", icon: "hook", type: ["Infiltrator", "Rogue", "Gadgeteer", "Speedster"] },
    { name: "High-Tech Communicator/Scanner", icon: "headset_mic", type: ["Any"] },
    { name: "Smoke/Flashbang Pellets", icon: "cloud", type: ["Infiltrator", "Rogue", "Gadgeteer"] },
    { name: "Reinforced Gauntlets/Gloves", icon: "pan_tool_alt", type: ["Brawler", "Tank", "Warrior"] },
    { name: "Armored Boots (Magnetic/Silent)", icon: "footprint", type: ["Brawler", "Tank", "Warrior", "Infiltrator"] },
    { name: "Rebreather/Gas Mask", icon: "scuba_diving", type: ["Any"] },
    { name: "Advanced First-Aid Kit", icon: "medical_information", type: ["Healer/Support", "Medicine Skill"] }, // Tied to archetype/skill
    { name: "Med-Spray (Quick Heal)", icon: "spray", type: ["Healer/Support", "Medicine Skill", "Tank"] }, // Slightly broader
    { name: "Universal Tool", icon: "handyman", type: ["Gadgeteer", "Artificer", "Mechanics Skill"] }, // Replaced Multi-tool
    { name: "Laser Cutter", icon: "laser", type: ["Gadgeteer", "Artificer", "Infiltrator"] }, // Specific Tool
    { name: "Sonic Screwdriver Analogue", icon: "tune", type: ["Gadgeteer", "Artificer"] }, // Specific Tool
    { name: "High-Intensity Flashlight/UV Light", icon: "flashlight_on", type: ["Any"] },
    { name: "Enhanced Binoculars/Thermal Vision", icon: "binoculars", type: ["Marksman", "Infiltrator", "Investigation Skill"] },
    { name: "Lockpicks/Bypass Kit (Digital/Manual)", icon: "key", type: ["Rogue", "Infiltrator", "Gadgeteer"] },
    { name: "Throwable Trackers/Audio Bugs", icon: "gps_fixed", type: ["Infiltrator", "Gadgeteer"] },
    { name: "Personal Cloaking Device (Short Duration)", icon: "visibility_off", type: ["Infiltrator", "Gadgeteer"] },
    { name: "EMP Emitter (Small Radius)", icon: "settings_input_component", type: ["Gadgeteer", "Controller", "Artificer"] }, // Renamed
    { name: "Forensic Analysis Kit", icon: "biotech", type: ["Investigation Skill", "Gadgeteer"] },
    { name: "Survival Gear Pack", icon: "backpack", type: ["Survival Skill", "Any"] },
    { name: "Holographic Projector (Disguise/Distraction)", icon: "smart_display", type: ["Gadgeteer", "Infiltrator", "Bard"] },
];

const weapons = [ // Items primarily used for offense/defense
    { name: "Energy Sword/Blade", icon: "sword", type: ["Warrior", "Blaster", "Mystic", "Paladin"] },
    { name: "High-Tech Bow (Trick Arrows)", icon: "archery", type: ["Marksman", "Gadgeteer"] },
    { name: "Vibro-Blades (Daggers/Sword)", icon: "cut", type: ["Rogue", "Warrior", "Infiltrator"] },
    { name: "Plasma Pistol/Rifle", icon: "flare", type: ["Marksman", "Blaster", "Gadgeteer"] },
    { name: "Power Hammer/Maul", icon: "hardware", type: ["Warrior", "Tank", "Brawler"] },
    { name: "Advanced Throwing Stars/Discs (Returning)", icon: "star", type: ["Rogue", "Marksman", "Infiltrator"] },
    { name: "Shield (Energy/Physical/Deployable)", icon: "shield", type: ["Tank", "Warrior", "Support", "Paladin"] },
    { name: "Whip (Monofilament/Energy/Neural)", icon: "whip", type: ["Controller", "Rogue", "Bard"] },
    { name: "Sonic Emitter/Disruptor", icon: "surround_sound", type: ["Controller", "Gadgeteer", "Bard"] },
    { name: "Cryo/Incendiary Grenades", icon: "ac_unit", type: ["Gadgeteer", "Blaster", "Controller"] },
    { name: "Taser Gauntlets/Prods", icon: "flash_on", type: ["Brawler", "Controller", "Rogue"] },
    { name: "Net Launcher/Bolos", icon: "scatter_plot", type: ["Controller", "Gadgeteer", "Marksman"] },
    { name: "Railgun Sniper Rifle", icon: "scope", type: ["Marksman", "Gadgeteer"] },
    { name: "Mystic Staff/Wand/Orb", icon: "magic_button", type: ["Mystic", "Sorcerer", "Elementalist", "Warlock", "Druid"] },
    { name: "Longsword/Katana (Enchanted?)", icon: "sword", type: ["Warrior", "Tank", "Paladin"] },
    { name: "Dagger/Kukri (Pair, Concealed)", icon: "cut", type: ["Rogue", "Infiltrator", "Warlock"] },
    { name: "Mace/Warhammer (Blessed/Cursed?)", icon: "hardware", type: ["Warrior", "Brawler", "Tank", "Paladin"] },
    { name: "Shortbow/Crossbow (Repeating?)", icon: "archery", type: ["Marksman", "Rogue"] },
    { name: "Spear/Glaive/Halberd", icon: "horizontal_rule", type: ["Warrior", "Tank", "Paladin"] },
    { name: "Battleaxe/Greataxe", icon: "axe", type: ["Warrior", "Brawler"] },
    { name: "Quarterstaff/Bo Staff", icon: "horizontal_rule", type: ["Monk", "Mystic", "Druid"] },
    { name: "Flail/Morningstar", icon: "flare", type: ["Warrior", "Brawler"] },
    { name: "Scythe", icon: "agriculture", type: ["Warrior", "Warlock"] },
    { name: "Holy Symbol (Empowered)", icon: "verified", type: ["Paladin", "Mystic", "Support"] },
    { name: "Spellbook/Grimoire", icon: "menu_book", type: ["Mystic", "Sorcerer", "Warlock"] },
    { name: "Heavy Blaster Cannon", icon: "rocket_launch", type: ["Blaster", "Tank", "Warrior"] },
    { name: "Force Pike/Stun Baton", icon: "electric_bolt", type: ["Warrior", "Controller", "Tank"] },
];