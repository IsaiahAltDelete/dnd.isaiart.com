// script.js - Main Hero Builder Logic

// --- Constants ---
const MAX_HISTORY = 5;
const HISTORY_KEY = 'heroBuilderHistory';

// --- DOM Elements ---
// It's good practice to define these after the DOM is loaded,
// but since the script is at the end of the body, it's usually safe.
// Alternatively, wrap the main logic in a DOMContentLoaded listener.
const characterSheet = document.getElementById('characterSheet');
const placeholderText = document.getElementById('placeholderText'); // Get initial placeholder
const generateButton = document.getElementById('generateButton');
const copyButton = document.getElementById('copyButton');
const historySection = document.getElementById('historySection');
const historyList = document.getElementById('historyList');

// --- State ---
let currentCharacterData = null;
let generationHistory = [];
let activeHistoryIndex = -1;

// --- Helper Functions ---
function getRandomElement(arr) { if (!arr || arr.length === 0) return null; return arr[Math.floor(Math.random() * arr.length)]; }
function rollDice(sides) { return Math.floor(Math.random() * sides) + 1; }
function generateStat() { const rolls = Array(4).fill(0).map(() => rollDice(6)); rolls.sort((a, b) => a - b); return rolls[1] + rolls[2] + rolls[3]; }
function calculateModifier(statValue) { const mod = Math.floor((statValue - 10) / 2); return mod >= 0 ? `+${mod}` : `${mod}`; }
function generateUniqueList(sourceArray, maxCount, filterFn = () => true) { const available = sourceArray.filter(filterFn); const count = Math.min(available.length, Math.floor(Math.random() * (maxCount + 1))); if (count === 0) return []; const shuffled = available.sort(() => 0.5 - Math.random()); return shuffled.slice(0, count); }
function generateRandomHexColor() { let color = '#'; for (let i = 0; i < 6; i++) { color += Math.floor(Math.random() * 16).toString(16); } let r = parseInt(color.substring(1, 3), 16); let g = parseInt(color.substring(3, 5), 16); let b = parseInt(color.substring(5, 7), 16); let luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255; if (luminance < 0.25) { return generateRandomHexColor(); } return color; }
function getAlignmentClass(alignment) { if (alignment.includes("Good")) return 'text-good'; if (alignment.includes("Evil")) return 'text-evil'; return 'text-neutral'; }
function getSkinHex(skinToneName) { const key = Object.keys(skinTones).find(k => skinToneName.toLowerCase().includes(k.toLowerCase())); return key ? skinTones[key] : '#CCCCCC'; }
function generateFameStars(level) { let starsHTML = ''; for (let i = 0; i < 5; i++) { starsHTML += `<span class="material-symbols-outlined ${i < level ? 'filled' : 'empty'}">${i < level ? 'star' : 'star_outline'}</span>`; } return starsHTML; }

// --- Generation Logic ---
function generateHeroName() { let baseName = ""; const formatChance = Math.random(); if (formatChance < 0.60) { const numParts = Math.random() < 0.6 ? 2 : 3; baseName = getRandomElement(nameStarts); if (numParts === 3) { let middle = getRandomElement(nameMiddles); while (nameMiddles.length > 1 && middle === baseName.slice(-middle.length)) { middle = getRandomElement(nameMiddles); } baseName += middle; } let end = getRandomElement(nameEnds); while (nameEnds.length > 1 && end === baseName.slice(-end.length)) { end = getRandomElement(nameEnds); } baseName += end; baseName = baseName.replace(/([aeiou])\1+/gi, '$1'); baseName = baseName.replace(/([bcdfghjklmnpqrstvwxyz])\1{1,}/gi, '$1'); baseName = baseName.charAt(0).toUpperCase() + baseName.slice(1).toLowerCase(); } else { baseName = `${getRandomElement(heroNamePrefixes)} ${getRandomElement(heroNameSuffixes)}`; } const titleChance = 0.15; if (Math.random() < titleChance) { const title = getRandomElement(heroTitles); if (title) { return `${title} ${baseName}`; } } return baseName; }
function generatePowersLogical(archetype, race, level) { let numPowers = 0; const powerRoll = Math.random(); if (level <= 4) { if (powerRoll < 0.15) numPowers = 0; else if (powerRoll < 0.65) numPowers = 1; else numPowers = 2; } else if (level <= 8) { if (powerRoll < 0.05) numPowers = 0; else if (powerRoll < 0.40) numPowers = 1; else if (powerRoll < 0.80) numPowers = 2; else numPowers = 3; } else { if (powerRoll < 0.20) numPowers = 2; else if (powerRoll < 0.70) numPowers = 3; else numPowers = 4; } let bonusChance = 0; if (["Mutant", "Alien", "Metahuman", "Celestial Descendant", "Infernal Scion", "Nephilim", "Cambion"].some(r => race.includes(r))) { bonusChance += 0.20; } if (["Mystic", "Psychic", "Elementalist", "Sorcerer", "Blaster", "Warlock", "Shapeshifter"].includes(archetype)) { bonusChance += 0.15; } if (Math.random() < bonusChance) numPowers += 1; if (["Gadgeteer", "Warrior", "Rogue", "Artificer", "Monk"].includes(archetype)) { if (Math.random() < (0.30 - level * 0.015) && numPowers > 0) { numPowers -= 1; } } numPowers = Math.max(0, Math.min(numPowers, 5)); if (numPowers === 0) return [{ name: "None (Relies on Skills/Gear)", icon: "block" }]; const selectedPowers = []; const availablePowers = [...powers.filter(p => !p.drawback)]; const archetypePowers = availablePowers.filter(p => p.type.includes(archetype)); const numArchPowers = Math.min(archetypePowers.length, Math.ceil(numPowers / 2)); for (let i = 0; i < numArchPowers && selectedPowers.length < numPowers; i++) { if (archetypePowers.length === 0) break; const idx = Math.floor(Math.random() * archetypePowers.length); const powerToAdd = archetypePowers[idx]; selectedPowers.push(powerToAdd); availablePowers.splice(availablePowers.findIndex(p => p.name === powerToAdd.name), 1); archetypePowers.splice(idx, 1); } while (selectedPowers.length < numPowers && availablePowers.length > 0) { const randomIndex = Math.floor(Math.random() * availablePowers.length); selectedPowers.push(availablePowers[randomIndex]); availablePowers.splice(randomIndex, 1); } const drawbackChance = 0.15 + (selectedPowers.length * 0.03) + (level * 0.005); if (selectedPowers.length > 0 && Math.random() < drawbackChance) { const availableDrawbacks = powers.filter(p => p.drawback); if (availableDrawbacks.length > 0) { selectedPowers.push(getRandomElement(availableDrawbacks)); } } return selectedPowers; }
function generateEquipmentLogical(archetype, selectedPowers, skillsData, level) {
    let items = [];
    const maxItems = Math.min(6, rollDice(2) + Math.floor(level / 4) + 1);

    const hasSkill = (skillName) => skillsData.some(s => s.name.includes(skillName));
    const hasPower = (powerName) => selectedPowers.some(p => p.name.includes(powerName));
    const isCombatArchetype = ["Warrior", "Marksman", "Rogue", "Brawler", "Paladin", "Warlock", "Blaster", "Tank"].includes(archetype);

    const filterBaseEquipment = (item) => {
        if (item.name.includes("First-Aid") && !(archetype === "Healer/Support" || hasSkill("Medicine"))) return false;
        if (item.name.includes("Med-Spray") && !(archetype === "Healer/Support" || hasSkill("Medicine") || archetype === "Tank")) return false;
        if (item.name.includes("Universal Tool") && !(archetype === "Gadgeteer" || archetype === "Artificer" || hasSkill("Mechanics"))) return false;
        if (item.name.includes("Laser Cutter") && !(archetype === "Gadgeteer" || archetype === "Artificer" || archetype === "Infiltrator")) return false;
        if (item.name.includes("Sonic Screwdriver") && !(archetype === "Gadgeteer" || archetype === "Artificer")) return false;
        if (item.name.includes("Forensic") && !(hasSkill("Investigation") || archetype === "Gadgeteer")) return false;
        if (item.name.includes("Survival Gear") && !hasSkill("Survival")) return false;
        return item.type.includes(archetype) || item.type.includes("Any") || item.type.some(t => t.endsWith("Skill") && hasSkill(t.replace(" Skill", "")));
    };

    const archetypeBaseItems = equipmentBase.filter(filterBaseEquipment);
    const numBaseItems = Math.min(rollDice(2) + Math.floor(level / 5), archetypeBaseItems.length);
    for(let i=0; i < numBaseItems && items.length < maxItems; i++) {
        if (archetypeBaseItems.length === 0) break;
        const idx = Math.floor(Math.random() * archetypeBaseItems.length);
        items.push(archetypeBaseItems[idx]);
        archetypeBaseItems.splice(idx, 1);
    }

    const offensivePowers = ["Super Strength", "Energy Blasts", "Bone/Claw", "Weapon Summoning", "Acid/Poison Generation", "Explosion Generation"];
    const hasCombatPower = selectedPowers.some(p => offensivePowers.some(op => p.name.includes(op)));
    const needsWeapon = !hasCombatPower || isCombatArchetype;
    const weaponChance = needsWeapon ? (0.80 + level * 0.01) : (0.20 + level * 0.01);

    const filterWeapon = (w) => {
        if ((w.name.includes("Spellbook") || w.name.includes("Holy Symbol")) &&
            !["Mystic", "Sorcerer", "Warlock", "Paladin", "Support", "Healer/Support"].includes(archetype)) {
            return false;
        }
        return w.type.includes(archetype) || w.type.includes("Any");
    };

    if (items.length < maxItems && Math.random() < weaponChance) {
        const relevantWeapons = weapons.filter(filterWeapon);
        const weaponPool = relevantWeapons.length > 0 ? relevantWeapons : weapons.filter(w => w.type.includes("Any"));
         if (weaponPool.length > 0) {
            items.push(getRandomElement(weaponPool));
        }
    }

     while (items.length < maxItems) {
         const fillChance = Math.random();
         const remainingBase = equipmentBase.filter(item => !items.some(existing => existing.name === item.name) && filterBaseEquipment(item));
         const remainingWeapons = weapons.filter(w => !items.some(existing => existing.name === w.name) && filterWeapon(w));
         const weaponCount = items.filter(i => weapons.some(w => w.name === i.name)).length;

         if (fillChance < 0.6 && remainingBase.length > 0) {
             items.push(getRandomElement(remainingBase));
         } else if (fillChance < 0.75 && remainingWeapons.length > 0 && weaponCount < 2 && isCombatArchetype) {
             items.push(getRandomElement(remainingWeapons));
         } else {
             if (remainingBase.length > 0) {
                 items.push(getRandomElement(remainingBase));
             } else {
                 break;
             }
         }
         items = items.filter((item, index, self) => index === self.findIndex((t) => t.name === item.name));
         if (items.length >= maxItems) break;
     }


    if (items.length === 0 && !hasCombatPower) {
        items.push({ name: "Unarmed / Relies on Powers", icon: "pan_tool", type: ["Any"] });
    }

    items = items.filter((item, index, self) => index === self.findIndex((t) => t.name === item.name));
    return items.slice(0, maxItems);
}
function generateTeamName() { return `${getRandomElement(teamNamePrefixes)} ${getRandomElement(teamNameSuffixes)}`; }

// --- Core Character Generation Function ---
function createCharacterObject() {
    const firstName = getRandomElement(firstNames);
    const lastName = getRandomElement(lastNames);
    const heroName = generateHeroName();
    const age = Math.floor(Math.random() * 33) + 17;
    const selectedRace = getRandomElement(races);
    const selectedArchetype = getRandomElement(archetypes); // Correct variable declared here
    const selectedAlignment = getRandomElement(alignments);
    const characterLevel = rollDice(6) + rollDice(6);
    const selectedFinancialStatus = getRandomElement(financialStatuses);
    const fameLevel = Math.floor(Math.random() * 6);
    const selectedNemesis = getRandomElement(nemesisConcepts);
    const stats = { str: generateStat(), dex: generateStat(), con: generateStat(), int: generateStat(), wis: generateStat(), cha: generateStat() };
    const selectedHeight = getRandomElement(heights);
    const selectedBuild = getRandomElement(builds);
    const selectedHair = `${getRandomElement(hairColors)} Hair`;
    const selectedEyes = `${getRandomElement(eyeColors)} Eyes`;
    const selectedSkinToneName = getRandomElement(Object.keys(skinTones));
    const selectedSkin = `${selectedSkinToneName} Skin`;
    const skinHex = getSkinHex(selectedSkinToneName);
    const selectedFeatures = getRandomElement(distinguishingFeatures);
    const selectedOutfit = getRandomElement(outfitStyles);
    const randomPalette = [generateRandomHexColor(), generateRandomHexColor(), generateRandomHexColor()];
    const selectedPowers = generatePowersLogical(selectedArchetype, selectedRace, characterLevel);
    const numSkills = Math.min(skills.length, rollDice(4) + Math.floor(characterLevel / 3));
    const selectedSkills = generateUniqueList(skills, numSkills);
    const selectedEquipment = generateEquipmentLogical(selectedArchetype, selectedPowers, selectedSkills, characterLevel);
    const id = Date.now() + Math.random().toString(16).slice(2);
    const selectedOrigin = getRandomElement(originHooks);
    const selectedMotivation = getRandomElement(motivations);
    const selectedSecretId = getRandomElement(secretIdStatus);
    const selectedBase = getRandomElement(baseOfOperations);
    let selectedAffiliation = getRandomElement(teamAffiliations);
    if (selectedAffiliation.includes("[Generated Team Name]")) { selectedAffiliation = selectedAffiliation.replace("[Generated Team Name]", generateTeamName()); }

    // Refined Power Source Logic
    let potentialSources = [...powerSources];
    if (selectedRace.includes("Alien")) potentialSources = ["Alien Physiology", "Cosmic Event"];
    else if (selectedRace.includes("Cyborg") || selectedRace.includes("Android") || selectedRace.includes("Synthezoid")) potentialSources = ["Technological Augmentation", "Cybernetic Enhancement", "Advanced Technology"];
    else if (selectedRace.includes("Mystical") || selectedRace.includes("Celestial") || selectedRace.includes("Infernal") || selectedRace.includes("Fae") || selectedRace.includes("Nephilim") || selectedRace.includes("Cambion") || selectedRace.includes("Elemental")) potentialSources = ["Magic/Sorcery", "Divine/Celestial Blessing", "Infernal/Demonic Pact", "Elemental Infusion", "Ancient Prophecy"];
    else if (selectedRace === "Mutant" || selectedRace === "Metahuman (Genetic)") potentialSources = ["Genetic Mutation", "Experimental Subject"];
    else if (selectedRace === "Metahuman (Mystical Origin)") potentialSources = ["Magic/Sorcery", "Mystical Artifact", "Cursed"];
    else if (selectedRace === "Undead") potentialSources = ["Necromancy (Limited)", "Cursed", "Infernal/Demonic Pact"];

    if (selectedOrigin === "Lab Accident") potentialSources = ["Cosmic Radiation", "Chemical Exposure", "Experimental Subject", "Genetic Mutation"];
    else if (selectedOrigin === "Technological Augmentation") potentialSources = ["Technological Augmentation", "Cybernetic Enhancement", "Advanced Technology"];
    else if (selectedOrigin === "Mystical Artifact" || selectedOrigin === "Ancient Prophecy" || selectedOrigin === "Cursed") potentialSources = ["Magic/Sorcery", "Mystical Artifact", "Cursed", "Divine/Celestial Blessing", "Infernal/Demonic Pact"];
    else if (selectedOrigin === "Cosmic Event") potentialSources = ["Cosmic Radiation", "Cosmic Event", "Unknown/Anomalous"];
    else if (selectedOrigin === "Inherited Powers") potentialSources = ["Genetic Mutation", "Inherited Powers"];

    // Archetype influence
    if (selectedArchetype === "Psychic") potentialSources = ["Psionic Awakening", "Genetic Mutation", "Experimental Subject"];
    else if (selectedArchetype === "Gadgeteer" || selectedArchetype === "Artificer") potentialSources = ["Advanced Technology", "Training/Discipline", "Self-Taught/Trained"];
    else if (selectedArchetype === "Monk") potentialSources = ["Training/Discipline", "Psionic Awakening", "Elemental Infusion"];

    // If no powers, source is likely training or tech
    if (selectedPowers.length === 1 && selectedPowers[0].name.includes("None")) {
         potentialSources = ["Training/Discipline", "Advanced Technology", "Self-Taught/Trained"];
    }

    const selectedPowerSource = getRandomElement(potentialSources.filter(s => s !== undefined && s !== null)) || "Unknown/Anomalous";


    return {
        id, heroName, realName: `${firstName} ${lastName}`, level: characterLevel, age, race: selectedRace, archetype: selectedArchetype, alignment: selectedAlignment,
        financialStatus: selectedFinancialStatus, fameLevel, nemesisConcept: selectedNemesis,
        stats,
        height: selectedHeight, build: selectedBuild, hair: selectedHair, eyes: selectedEyes, skin: selectedSkin, skinHex, features: selectedFeatures, outfit: selectedOutfit, palette: randomPalette,
        powers: selectedPowers,
        skills: selectedSkills,
        equipment: selectedEquipment,
        origin: selectedOrigin,
        motivation: selectedMotivation,
        secretId: selectedSecretId,
        base: selectedBase,
        affiliation: selectedAffiliation,
        powerSource: selectedPowerSource
    };
}

// --- DOM Display Function ---
function displayCharacter(data) {
    if (!data) return;
    currentCharacterData = data;

    const placeholder = document.getElementById('placeholderText');
    if (placeholder) {
        placeholder.remove();
    }

    characterSheet.innerHTML = '';
    characterSheet.classList.remove('hidden');

    const col1 = document.createElement('div'); col1.className = 'sheet-column';
    const col2 = document.createElement('div'); col2.className = 'sheet-column';
    const col3 = document.createElement('div'); col3.className = 'sheet-column';

    // --- Column 1: Core Info, Background & Status ---
    col1.innerHTML = `
        <div>
            <h2 class="text-xl md:text-2xl font-bold text-white mb-0.5" id="heroName">${data.heroName}</h2>
            <p class="text-md md:text-lg text-subtle italic mb-3" id="realName">${data.realName}</p>
            <div class="details-list text-sm space-y-1">
                <p><strong>Level:</strong> <span id="level" class="font-medium text-white">${data.level}</span></p>
                <p><strong>Age:</strong> <span id="age">${data.age}</span></p>
                <p><strong>Race:</strong> <span id="race">${data.race}</span></p>
                <p><strong>Archetype:</strong> <span id="archetype">${data.archetype}</span></p>
                <p><strong>Alignment:</strong> <span id="alignment" class="${getAlignmentClass(data.alignment)}">${data.alignment}</span></p>
            </div>
        </div>
        <div class="background-section">
            <h3 class="section-header"><span class="material-symbols-outlined">auto_stories</span>Background</h3>
            <div class="details-list text-sm space-y-1">
                <p><strong>Origin:</strong> <span id="origin">${data.origin}</span></p>
                <p><strong>Motivation:</strong> <span id="motivation">${data.motivation}</span></p>
                <p><strong>Power Source:</strong> <span id="powerSource">${data.powerSource}</span></p>
                <p><strong>Secret ID:</strong> <span id="secretId">${data.secretId}</span></p>
                <p><strong>Base:</strong> <span id="base">${data.base}</span></p>
                <p><strong>Affiliation:</strong> <span id="affiliation">${data.affiliation}</span></p>
            </div>
        </div>
        <div class="status-section">
            <h3 class="section-header"><span class="material-symbols-outlined">social_leaderboard</span>Status</h3>
            <div class="details-list text-sm space-y-1">
                <p><strong>Fame Level:</strong> <span id="fameLevel" class="fame-stars" data-level="${data.fameLevel}">${generateFameStars(data.fameLevel)}</span></p>
                <p><strong>Finances:</strong> <span id="financialStatus">${data.financialStatus}</span></p>
                <p><strong>Nemesis:</strong> <span id="nemesisConcept" class="italic text-subtle">${data.nemesisConcept}</span></p>
            </div>
        </div>
    `;

    // --- Column 2: Attributes & Appearance ---
    const statsHTML = Object.keys(data.stats).map(stat => `
        <div class="stat-block">
            <div class="stat-value">${data.stats[stat]}</div>
            <div class="stat-modifier">${calculateModifier(data.stats[stat])}</div>
            <div class="stat-label" data-tooltip="${getStatTooltip(stat)}">${stat.toUpperCase()}</div>
            <span class="tooltip">${getStatTooltip(stat)}</span>
        </div>
    `).join('');

    const appearanceHTML = `
        <div class="appearance-section">
            <h3 class="section-header"><span class="material-symbols-outlined">visibility</span>Appearance</h3>
            <div class="details-list text-sm space-y-1">
                <p><strong>Height:</strong> <span id="height">${data.height}</span></p>
                <p><strong>Build:</strong> <span id="build">${data.build}</span></p>
                <p><strong>Hair:</strong> <span id="hair">${data.hair}</span></p>
                <p><strong>Eyes:</strong> <span id="eyes">${data.eyes}</span></p>
                <p><strong>Skin:</strong> <span>${data.skin}<span id="skinColorDisplay" class="color-swatch" style="background-color:${data.skinHex};" title="${data.skinHex}"></span></span></p>
                <p><strong>Features:</strong> <span id="features">${data.features}</span></p>
                <p><strong>Outfit:</strong> <span id="outfit">${data.outfit}</span></p>
                <p><strong>Colors:</strong> <span id="colorPalette">${data.palette.map(c => `<span class="color-swatch" style="background-color:${c};" title="${c}"></span>`).join('')}</span></p>
            </div>
        </div>
    `;

    col2.innerHTML = `
        <div class="attributes-section">
            <h3 class="section-header"><span class="material-symbols-outlined">equalizer</span>Attributes</h3>
            <div class="stats-grid">${statsHTML}</div>
        </div>
        ${appearanceHTML}
    `;

    // --- Column 3: Powers, Skills, Equipment ---
    const powersHTML = data.powers.length > 0 ? data.powers.map(p => `
        <li class="list-item ${p.drawback ? 'drawback' : ''}">
            <span class="material-symbols-outlined">${p.icon}</span>
            <span>${p.name}</span>
        </li>`).join('') : `<li class="list-item text-subtle italic"><span class="material-symbols-outlined">block</span><span>None</span></li>`;

    const skillsHTML = data.skills.length > 0 ? data.skills.map(s => `
        <li class="list-item">
            <span class="material-symbols-outlined">${s.icon}</span>
            <span>${s.name}</span>
        </li>`).join('') : `<li class="list-item text-subtle italic"><span class="material-symbols-outlined">block</span><span>Untrained</span></li>`;

    const equipmentHTML = data.equipment.length > 0 ? data.equipment.map(e => {
         let icon = e.icon;
         if (e.name.toLowerCase().includes('cryo')) icon = 'ac_unit';
         if (e.name.toLowerCase().includes('incendiary')) icon = 'local_fire_department';
         if (e.name.toLowerCase().includes('laser cutter')) icon = 'laser';
         if (e.name.toLowerCase().includes('sonic screwdriver')) icon = 'tune';
         if (e.name.toLowerCase().includes('med-spray')) icon = 'spray';
         if (e.name.toLowerCase().includes('holographic projector')) icon = 'smart_display';
         if (e.name.toLowerCase().includes('universal tool')) icon = 'handyman';

         return `
            <li class="list-item">
                <span class="material-symbols-outlined">${icon}</span>
                <span>${e.name}</span>
            </li>`
         }).join('') : `<li class="list-item text-subtle italic"><span class="material-symbols-outlined">block</span><span>Minimal Gear</span></li>`;

    col3.innerHTML = `
        <div class="powers-section list-section">
            <h3 class="section-header"><span class="material-symbols-outlined">bolt</span>Abilities & Powers</h3>
            <ul id="powersList">${powersHTML}</ul>
        </div>
        <div class="skills-section list-section">
            <h3 class="section-header"><span class="material-symbols-outlined">psychology</span>Skills</h3>
            <ul id="skillsList">${skillsHTML}</ul>
        </div>
        <div class="equipment-section list-section">
            <h3 class="section-header"><span class="material-symbols-outlined">shield</span>Equipment</h3>
            <ul id="equipmentList">${equipmentHTML}</ul>
        </div>
    `;

    characterSheet.appendChild(col1);
    characterSheet.appendChild(col2);
    characterSheet.appendChild(col3);

    copyButton.disabled = false;

    characterSheet.classList.remove('visible');
    setTimeout(() => {
        characterSheet.classList.add('visible');
    }, 0);

    updateHistoryActiveStyle();
}

// Helper for stat tooltips
function getStatTooltip(stat) {
    switch (stat.toLowerCase()) {
        case 'str': return 'Strength: Physical power, melee attacks, lifting, breaking things.';
        case 'dex': return 'Dexterity: Agility, reflexes, coordination, ranged attacks, stealth.';
        case 'con': return 'Constitution: Health, stamina, endurance, resisting poison/disease.';
        case 'int': return 'Intelligence: Logic, knowledge, technology, investigation, tactics.';
        case 'wis': return 'Wisdom: Awareness, intuition, perception, willpower, common sense.';
        case 'cha': return 'Charisma: Force of personality, leadership, persuasion, deception.';
        default: return '';
    }
}

// --- History Management ---
function loadHistory() {
    const storedHistory = localStorage.getItem(HISTORY_KEY);
    if (storedHistory) {
        try {
            generationHistory = JSON.parse(storedHistory);
            if (!Array.isArray(generationHistory)) {
                 generationHistory = [];
                 localStorage.removeItem(HISTORY_KEY);
            }
        } catch (e) {
            console.error("Error parsing history from localStorage:", e);
            generationHistory = [];
            localStorage.removeItem(HISTORY_KEY);
        }
        renderHistoryList();
    }
    if (generationHistory.length > 0) {
        activeHistoryIndex = 0;
        displayCharacter(generationHistory[0]);
    } else {
        // Ensure placeholder is present if no history and sheet is empty
        if (!characterSheet.hasChildNodes() || characterSheet.innerHTML.trim() === '') {
             characterSheet.innerHTML = `<div class="text-center text-xl text-subtle italic py-10 md:col-span-3" id="placeholderText">Click the button below to forge your hero...</div>`;
        }
        characterSheet.classList.remove('visible'); // Keep it hidden initially
    }
}

function saveToHistory(characterData) {
    generationHistory.unshift(characterData);
    generationHistory = generationHistory.slice(0, MAX_HISTORY);
    try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(generationHistory));
    } catch (e) {
        console.error("Error saving history to localStorage:", e);
    }
    renderHistoryList();
}

function renderHistoryList() {
    historyList.innerHTML = '';
    if (generationHistory.length > 0) {
        historySection.classList.remove('hidden');
        generationHistory.forEach((gen, index) => {
            const item = document.createElement('button');
            item.className = 'history-item';
            item.textContent = gen.heroName || 'Unnamed Hero';
            item.setAttribute('data-index', index);
            item.addEventListener('click', () => {
                activeHistoryIndex = index;
                displayCharacter(generationHistory[index]);
            });
            historyList.appendChild(item);
        });
        updateHistoryActiveStyle();
    } else {
        historySection.classList.add('hidden');
    }
}

function updateHistoryActiveStyle() {
     const historyItems = historyList.querySelectorAll('.history-item');
     historyItems.forEach((item, index) => {
         if (index === activeHistoryIndex) {
             item.classList.add('active');
         } else {
             item.classList.remove('active');
         }
     });
}

// --- Copy Function ---
function copyCharacterSheet() {
    if (!currentCharacterData) return;
    const data = currentCharacterData;

    const statsText = `STR: ${data.stats.str} (${calculateModifier(data.stats.str)}) | DEX: ${data.stats.dex} (${calculateModifier(data.stats.dex)}) | CON: ${data.stats.con} (${calculateModifier(data.stats.con)}) | INT: ${data.stats.int} (${calculateModifier(data.stats.int)}) | WIS: ${data.stats.wis} (${calculateModifier(data.stats.wis)}) | CHA: ${data.stats.cha} (${calculateModifier(data.stats.cha)})`;
    const colorText = data.palette.join(', ') || 'N/A';
    const appearanceText = `Appearance: ${data.height}, ${data.build} build. ${data.hair}, ${data.eyes}, ${data.skin} skin. Features: ${data.features}. Outfit: ${data.outfit}. Colors: ${colorText}.`;
    const statusText = `Status: Fame: ${data.fameLevel}/5 Stars | Finances: ${data.financialStatus} | Nemesis Concept: ${data.nemesisConcept}`;
    const backgroundText = `Background: Origin: ${data.origin} | Motivation: ${data.motivation} | Power Source: ${data.powerSource} | Secret ID: ${data.secretId} | Base: ${data.base} | Affiliation: ${data.affiliation}`;
    const powersText = data.powers.map(p => p.name).join(', ') || 'None';
    const skillsText = data.skills.map(s => s.name).join(', ') || 'None';
    const equipmentText = data.equipment.map(e => e.name).join(', ') || 'None';

    const textToCopy = `
## ${data.heroName} (${data.realName}) ##

**Level:** ${data.level} | **Age:** ${data.age} | **Race:** ${data.race} | **Archetype:** ${data.archetype} | **Alignment:** ${data.alignment}

**Attributes:**
${statsText}

**Appearance:**
${appearanceText}

**Background & Status:**
${backgroundText}
${statusText}

**Powers & Abilities:**
${powersText}

**Skills:**
${skillsText}

**Equipment:**
${equipmentText}
            `.trim().replace(/^ +/gm, '');

    navigator.clipboard.writeText(textToCopy).then(() => {
        const originalText = copyButton.innerHTML;
        copyButton.innerHTML = `<span class="material-symbols-outlined">check</span> Copied!`;
        copyButton.disabled = true;
        setTimeout(() => {
            copyButton.innerHTML = originalText;
            copyButton.disabled = false;
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy text: ', err);
        alert("Failed to copy character sheet.");
    });
}

// --- Event Listeners ---
generateButton.addEventListener('click', () => {
    const newCharacter = createCharacterObject();
    activeHistoryIndex = 0;
    saveToHistory(newCharacter);
    displayCharacter(newCharacter);
});

copyButton.addEventListener('click', copyCharacterSheet);

// --- Initial Load ---
// Wrap initialization in DOMContentLoaded to ensure elements exist
document.addEventListener('DOMContentLoaded', () => {
    loadHistory();
});