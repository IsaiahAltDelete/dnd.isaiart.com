/* PARTICLES BACKGROUND */
particlesJS("particles-js", {
  particles: {
    number: { value: 80, density: { enable: true, value_area: 800 } },
    color: { value: "#fbbf24" },
    shape: { type: "circle" },
    opacity: {
      value: 0.5,
      random: true,
      animation: { enable: true, speed: 1, min: 0.1, sync: false },
    },
    size: {
      value: 3,
      random: true,
      animation: { enable: true, speed: 2, min: 0.1, sync: false },
    },
    line_linked: {
      enable: true,
      distance: 150,
      color: "#fbbf24",
      opacity: 0.2,
      width: 1,
    },
    move: {
      enable: true,
      speed: 1,
      direction: "none",
      random: true,
      straight: false,
      out_mode: "out",
      bounce: false,
    },
  },
  interactivity: {
    detect_on: "canvas",
    events: {
      onhover: { enable: true, mode: "repulse" },
      onclick: { enable: true, mode: "push" },
      resize: true,
    },
    modes: {
      repulse: { distance: 100, duration: 0.4 },
      push: { particles_nb: 4 },
    },
  },
  retina_detect: true,
});

/* GLOBAL STATE */
const state = {
spellSlots: JSON.parse(localStorage.getItem("spellSlots")) || {
  1: { total: 2, used: [] },
  2: { total: 0, used: [] },
  3: { total: 0, used: [] },
  4: { total: 0, used: [] },
  5: { total: 0, used: [] },
  6: { total: 0, used: [] },
  7: { total: 0, used: [] },
  8: { total: 0, used: [] },
  9: { total: 0, used: [] },
},
spellbook: JSON.parse(localStorage.getItem("spellbook")) || [
  { name: "Fire Bolt", level: 0, prepared: true },
  { name: "Mage Hand", level: 0, prepared: true },
  { name: "Magic Missile", level: 1, prepared: true },
  { name: "Shield", level: 1, prepared: true },
  { name: "Arcane Warding", level: 2, prepared: false },
],
characterSheet: JSON.parse(localStorage.getItem("characterSheet")) || {
  name: "Unnamed Character",
  abilityScores: {
    strength: 10,
    dexterity: 10,
    constitution: 10,
    intelligence: 10,
    wisdom: 10,
    charisma: 10,
  },
  levels: {
    level: 1,
    experience: 0,
  },
  // Store skill proficiencies as booleans
  skillProficiencies: {
    arcana: false,
    history: false,
    insight: false,
    athletics: false,
    acrobatics: false,
    stealth: false,
    perception: false,
    investigation: false,
    performance: false,
    persuasion: false,
    intimidation: false,
  },
  race: "",
  class: "",
  maxHP: 20,
  currentHP: 20,
  ac: 10,
},
diceRollHistory: JSON.parse(localStorage.getItem("diceRollHistory")) || [],
inventory: JSON.parse(localStorage.getItem("inventory")) || [],
notes: JSON.parse(localStorage.getItem("notes")) || [],
coins: JSON.parse(localStorage.getItem("coins")) || {
  platinum: 0,
  gold: 0,
  electrum: 0,
  silver: 0,
  copper: 0,
},
};

/* SAVE STATE */
function saveState() {
localStorage.setItem("spellSlots", JSON.stringify(state.spellSlots));
localStorage.setItem("spellbook", JSON.stringify(state.spellbook));
localStorage.setItem("characterSheet", JSON.stringify(state.characterSheet));
localStorage.setItem(
  "diceRollHistory",
  JSON.stringify(state.diceRollHistory)
);
localStorage.setItem("inventory", JSON.stringify(state.inventory));
localStorage.setItem("notes", JSON.stringify(state.notes));
localStorage.setItem("coins", JSON.stringify(state.coins));
}

/* RENDER FUNCTIONS */
function renderCharacterSheet() {
// Name
const nameInput = document.getElementById("character-name");
nameInput.value = state.characterSheet.name;
nameInput.oninput = () => {
  state.characterSheet.name = nameInput.value;
  saveState();
};

// Abilities & Modifiers
const abilities = state.characterSheet.abilityScores;
for (let ability in abilities) {
  const input = document.getElementById(ability);
  const modSpan = document.getElementById(`${ability}-mod`);
  if (input && modSpan) {
    input.value = abilities[ability];
    const modifier = calculateModifier(abilities[ability]);
    modSpan.textContent = `(${modifier >= 0 ? "+" : ""}${modifier})`;
    input.oninput = () => {
      const val = parseInt(input.value) || 0;
      state.characterSheet.abilityScores[ability] = val;
      const newMod = calculateModifier(val);
      modSpan.textContent = `(${newMod >= 0 ? "+" : ""}${newMod})`;
      saveState();
      calculateAllSkillMods(); // Recalculate skills
    };
  }
}

// Level & Experience
const levelInput = document.getElementById("level");
const expInput = document.getElementById("experience");
if (levelInput) {
  levelInput.value = state.characterSheet.levels.level;
  levelInput.oninput = () => {
    const val = parseInt(levelInput.value) || 1;
    state.characterSheet.levels.level = val;
    saveState();
    calculateAllSkillMods(); // Recalculate proficiency bonus
  };
}
if (expInput) {
  expInput.value = state.characterSheet.levels.experience;
  expInput.oninput = () => {
    const val = parseInt(expInput.value) || 0;
    state.characterSheet.levels.experience = val;
    saveState();
  };
}

// Race & Class
const race = document.getElementById("race");
const charClass = document.getElementById("class");
if (race) {
  race.value = state.characterSheet.race;
  race.oninput = () => {
    state.characterSheet.race = race.value;
    saveState();
  };
}
if (charClass) {
  charClass.value = state.characterSheet.class;
  charClass.oninput = () => {
    state.characterSheet.class = charClass.value;
    saveState();
  };
}

// Skills (Proficiencies)
const skills = state.characterSheet.skillProficiencies || {};
const skillKeys = Object.keys(skills);
skillKeys.forEach((skill) => {
  const checkbox = document.getElementById(`${skill}-proficient`);
  const modSpan = document.getElementById(`${skill}-mod`);
  if (checkbox && modSpan) {
    checkbox.checked = skills[skill];
    checkbox.onchange = () => {
      state.characterSheet.skillProficiencies[skill] = checkbox.checked;
      saveState();
      calculateSkillMod(skill); // Recalculate this skill
    };
    // Initial calculation
    calculateSkillMod(skill);
  }
});

// HP & AC
const maxHPInput = document.getElementById("max-hp");
const currentHPDisplay = document.getElementById("current-hp-display");
const hpAnimate = document.getElementById("hp-animate");
const hpMinusBtn = document.getElementById("hp-minus");
const hpPlusBtn = document.getElementById("hp-plus");

const acSlider = document.getElementById("ac");
const acDisplay = document.getElementById("ac-display");

if (maxHPInput && currentHPDisplay && hpAnimate) {
  maxHPInput.value = state.characterSheet.maxHP;
  currentHPDisplay.textContent = state.characterSheet.currentHP;

  maxHPInput.oninput = () => {
    const val = parseInt(maxHPInput.value) || 1;
    state.characterSheet.maxHP = val;
    // if currentHP > new maxHP, adjust
    if (state.characterSheet.currentHP > val) {
      state.characterSheet.currentHP = val;
      currentHPDisplay.textContent = state.characterSheet.currentHP;
      showHPChange(`HP adjusted down to ${val}`, hpAnimate);
    }
    saveState();
  };

  hpMinusBtn.onclick = () => {
    if (state.characterSheet.currentHP > 0) {
      state.characterSheet.currentHP--;
      currentHPDisplay.textContent = state.characterSheet.currentHP;
      showHPChange("-1 HP!", hpAnimate);
      saveState();
    }
  };

  hpPlusBtn.onclick = () => {
    if (state.characterSheet.currentHP < state.characterSheet.maxHP) {
      state.characterSheet.currentHP++;
      currentHPDisplay.textContent = state.characterSheet.currentHP;
      showHPChange("+1 HP!", hpAnimate);
      saveState();
    }
  };
}

if (acSlider && acDisplay) {
  acSlider.value = state.characterSheet.ac || 10;
  acDisplay.textContent = acSlider.value;
  acSlider.oninput = () => {
    state.characterSheet.ac = parseInt(acSlider.value);
    acDisplay.textContent = state.characterSheet.ac;
    saveState();
  };
}
}

/* SHOW HP CHANGE ANIMATION */
function showHPChange(text, hpAnimateDiv) {
hpAnimateDiv.textContent = text;
hpAnimateDiv.style.display = "block";
// Force reflow
hpAnimateDiv.classList.remove("hp-animation");
void hpAnimateDiv.offsetWidth;
hpAnimateDiv.classList.add("hp-animation");

setTimeout(() => {
  hpAnimateDiv.style.display = "none";
}, 1000);
}

/* CALCULATE MODIFIER */
function calculateModifier(score) {
return Math.floor((score - 10) / 2);
}

/* MAP SKILLS TO ABILITIES */
const SKILL_ABILITY_MAP = {
arcana: "intelligence",
history: "intelligence",
insight: "wisdom",
athletics: "strength",
acrobatics: "dexterity",
stealth: "dexterity",
perception: "wisdom",
investigation: "intelligence",
performance: "charisma",
persuasion: "charisma",
intimidation: "charisma",
};

/* CALCULATE PROFICIENCY BONUS */
function getProficiencyBonus(level) {
if (level >= 1 && level <= 4) return 2;
if (level >= 5 && level <= 8) return 3;
if (level >= 9 && level <= 12) return 4;
if (level >= 13 && level <= 16) return 5;
if (level >= 17 && level <= 20) return 6;
return 2; // Default fallback
}

/* CALCULATE ALL SKILL MODIFIERS */
function calculateAllSkillMods() {
const { abilityScores, levels, skillProficiencies } = state.characterSheet;
const proficiencyBonus = getProficiencyBonus(levels.level);

Object.keys(SKILL_ABILITY_MAP).forEach((skill) => {
  calculateSkillMod(skill, abilityScores, proficiencyBonus, skillProficiencies);
});
}

/* CALCULATE SINGLE SKILL MODIFIER */
function calculateSkillMod(skill, abilityScores = state.characterSheet.abilityScores, proficiencyBonus = getProficiencyBonus(state.characterSheet.levels.level), skillProficiencies = state.characterSheet.skillProficiencies) {
const associatedAbility = SKILL_ABILITY_MAP[skill];
const abilityScore = abilityScores[associatedAbility];
const abilityMod = calculateModifier(abilityScore);

let finalSkillMod = abilityMod;

if (skillProficiencies[skill]) {
  finalSkillMod += proficiencyBonus;
}

// Update the UI
const modSpan = document.getElementById(`${skill}-mod`);
if (modSpan) {
  modSpan.textContent = `${finalSkillMod >= 0 ? "+" : ""}${finalSkillMod}`;
}
}

/* RENDER SPELL SLOTS */
function renderSpellSlots() {
const container = document.getElementById("spell-slots-container");
if (!container) return;
container.innerHTML = "";

Object.entries(state.spellSlots).forEach(([lvl, { total, used }]) => {
  const slotDiv = document.createElement("div");
  slotDiv.className = "spell-slot";
  slotDiv.id = `slot-level-${lvl}`;
  slotDiv.innerHTML = `
    <div class="slot-header">
      <div><i class="fas fa-star"></i> Level ${lvl}</div>
      <div class="slot-controls">
        <button class="slot-btn" onclick="adjustSlots(${lvl}, false)">
          <i class="fas fa-minus"></i>
        </button>
        <span class="slot-count">${total}</span>
        <button class="slot-btn" onclick="adjustSlots(${lvl}, true)">
          <i class="fas fa-plus"></i>
        </button>
      </div>
    </div>
    <div class="slot-circles">
      ${Array(total)
        .fill()
        .map(
          (_, i) => `
        <div 
            class="slot-circle ${used.includes(i) ? "used" : ""}"
            onclick="toggleSlot(${lvl}, ${i})">
        </div>
      `
        )
        .join("")}
    </div>
  `;
  container.appendChild(slotDiv);
});
}

/* RENDER SPELLBOOK */
function renderSpellbook() {
const cantripsContainer = document.getElementById("cantrips-container");
const spellsContainer = document.getElementById("spells-container");
if (!cantripsContainer || !spellsContainer) return;

cantripsContainer.innerHTML = "";
spellsContainer.innerHTML = "";

state.spellbook.forEach((spell) => {
  const spellDiv = document.createElement("div");
  spellDiv.className = "spell-item";
  spellDiv.innerHTML = `
    <div class="spell-info">
      <i class="fas fa-magic sparkle ${spell.prepared ? "active" : ""}"></i>
      <span>${spell.name}</span>
      ${
        spell.level > 0
          ? `<span class="text-sm opacity-75">Level ${spell.level}</span>`
          : ""
      }
    </div>
    <div class="spell-actions">
      <button class="spell-btn ${
        spell.prepared ? "prepared" : ""
      }" onclick="togglePrepared('${spell.name}')">
        ${
          spell.level === 0
            ? spell.prepared
              ? "Known"
              : "Learn"
            : spell.prepared
            ? "Prepared"
            : "Prepare"
        }
      </button>
      <button class="spell-btn" onclick="useSpell('${spell.name}')">
        <i class="fas fa-play"></i>
        <span>Use</span>
      </button>
      <button class="spell-btn" onclick="removeSpell('${spell.name}')">
        <i class="fas fa-trash-alt"></i>
      </button>
    </div>
  `;

  if (spell.level === 0) {
    cantripsContainer.appendChild(spellDiv);
  } else {
    spellsContainer.appendChild(spellDiv);
  }
});
}

/* RENDER INVENTORY */
function renderInventory() {
const grid = document.getElementById("inventory-grid");
if (!grid) return;
grid.innerHTML = "";

state.inventory.forEach((item, index) => {
  const itemDiv = document.createElement("div");
  itemDiv.className = "inventory-item";
  itemDiv.dataset.index = index;
  // Show the emoji and a hidden name that appears on hover
  itemDiv.innerHTML = `
    ${item.emoji}
    <span class="item-name">${item.name}</span>
    <div class="item-actions">
      <button class="item-btn edit-btn">
        <i class="fas fa-edit"></i>
      </button>
      <button class="item-btn delete-btn">
        <i class="fas fa-trash-alt"></i>
      </button>
    </div>
  `;
  grid.appendChild(itemDiv);
});
}

/* RENDER COINS */
function renderCoins() {
const platinum = document.getElementById("platinum");
const gold = document.getElementById("gold");
const electrum = document.getElementById("electrum");
const silver = document.getElementById("silver");
const copper = document.getElementById("copper");

if (platinum && gold && electrum && silver && copper) {
  platinum.value = state.coins.platinum || 0;
  gold.value = state.coins.gold || 0;
  electrum.value = state.coins.electrum || 0;
  silver.value = state.coins.silver || 0;
  copper.value = state.coins.copper || 0;

  platinum.oninput = () => {
    state.coins.platinum = parseInt(platinum.value) || 0;
    saveState();
  };
  gold.oninput = () => {
    state.coins.gold = parseInt(gold.value) || 0;
    saveState();
  };
  electrum.oninput = () => {
    state.coins.electrum = parseInt(electrum.value) || 0;
    saveState();
  };
  silver.oninput = () => {
    state.coins.silver = parseInt(silver.value) || 0;
    saveState();
  };
  copper.oninput = () => {
    state.coins.copper = parseInt(copper.value) || 0;
    saveState();
  };
}
}

/* RENDER NOTES */
function renderNotes() {
const notesList = document.getElementById("notes-list");
if (!notesList) return;
notesList.innerHTML = "";

state.notes.forEach((note, index) => {
  const noteDiv = document.createElement("div");
  noteDiv.className = "note-item";
  noteDiv.dataset.index = index;
  noteDiv.innerHTML = `
    <div class="note-title">${note.title}</div>
    <div class="note-content">${note.content}</div>
    <div class="note-actions">
      <button class="note-btn" onclick="editNote(${index})">
        <i class="fas fa-edit"></i>
      </button>
      <button class="note-btn" onclick="deleteNote(${index})">
        <i class="fas fa-trash-alt"></i>
      </button>
    </div>
  `;
  notesList.appendChild(noteDiv);
});
}

/* RENDER ROLL HISTORY */
function renderRollHistory() {
const historyContainer = document.getElementById("roll-history");
if (!historyContainer) return;
historyContainer.innerHTML = "";

state.diceRollHistory.forEach((roll, index) => {
  const rollEntry = document.createElement("p");
  rollEntry.textContent = `${index + 1}. ${roll}`;
  historyContainer.appendChild(rollEntry);
});
}

/* RENDER ALL SECTIONS */
function renderAll() {
renderCharacterSheet();
renderSpellSlots();
renderSpellbook();
renderInventory();
renderCoins();
renderNotes();
renderRollHistory();
}

/* SPELL SLOTS */
function adjustSlots(level, increment) {
const slots = state.spellSlots[level];
const newTotal = Math.max(0, slots.total + (increment ? 1 : -1));
state.spellSlots[level] = {
  total: newTotal,
  used: slots.used.filter((i) => i < newTotal),
};
saveState();
renderSpellSlots();
}

function toggleSlot(level, index) {
const slots = state.spellSlots[level];
if (slots.used.includes(index)) {
  slots.used = slots.used.filter((i) => i !== index);
} else {
  if (slots.used.length >= slots.total) {
    alert("No available spell slots at this level.");
    return;
  }
  slots.used.push(index);
  triggerBurstEffect(level); // Magical burst
}
saveState();
renderSpellSlots();
}

/* SPELLBOOK */
function addSpell() {
const nameInput = document.getElementById("spell-name");
const levelInput = document.getElementById("spell-level");
if (!nameInput || !levelInput) return;

const name = nameInput.value.trim();
const level = parseInt(levelInput.value);

if (
  name &&
  !state.spellbook.some((s) => s.name.toLowerCase() === name.toLowerCase())
) {
  state.spellbook.push({
    name,
    level,
    prepared: false,
  });
  nameInput.value = "";
  saveState();
  renderSpellbook();
} else {
  alert("Spell name must be unique and not empty.");
}
}

function togglePrepared(spellName) {
state.spellbook = state.spellbook.map((spell) =>
  spell.name === spellName ? { ...spell, prepared: !spell.prepared } : spell
);
saveState();
renderSpellbook();
}

function removeSpell(spellName) {
if (confirm(`Remove "${spellName}" from your spellbook?`)) {
  state.spellbook = state.spellbook.filter((s) => s.name !== spellName);
  saveState();
  renderSpellbook();
}
}

function useSpell(spellName) {
const spell = state.spellbook.find((s) => s.name === spellName);
if (!spell) return;

if (spell.level === 0) {
  alert(`${spell.name} used! Cantrips do not consume spell slots.`);
  return;
}

const availableLevels = Object.keys(state.spellSlots)
  .filter(
    (l) =>
      parseInt(l) >= spell.level &&
      state.spellSlots[l].used.length < state.spellSlots[l].total
  )
  .map(Number);

if (availableLevels.length === 0) {
  alert("No available spell slots to cast this spell.");
  return;
}

if (availableLevels.length === 1) {
  const selectedLevel = availableLevels[0];
  state.spellSlots[selectedLevel].used.push(
    state.spellSlots[selectedLevel].used.length
  );
  triggerBurstEffect(selectedLevel);
  saveState();
  renderSpellSlots();
  alert(`${spell.name} cast using a Level ${selectedLevel} slot.`);
  return;
}

// Show a custom modal for selecting spell slot level
showSpellSlotModal(spellName, availableLevels);
}

/* CUSTOM MODAL FOR SELECTING SPELL SLOT */
function showSpellSlotModal(spellName, levels) {
const modal = document.getElementById("spell-slot-modal");
const closeBtn = document.getElementById("close-spell-slot-modal");
const body = document.getElementById("spell-slot-modal-body");

// Clear previous content
body.innerHTML = "";
levels.forEach((lvl) => {
  const btn = document.createElement("button");
  btn.className = "spell-btn";
  btn.innerHTML = `<i class="fas fa-star"></i> Level ${lvl}`;
  btn.onclick = () => {
    state.spellSlots[lvl].used.push(state.spellSlots[lvl].used.length);
    triggerBurstEffect(lvl);
    saveState();
    renderSpellSlots();
    alert(`${spellName} cast using Level ${lvl}.`);
    modal.style.display = "none";
  };
  body.appendChild(btn);
});

modal.style.display = "block";
closeBtn.onclick = () => {
  modal.style.display = "none";
};
window.onclick = (event) => {
  if (event.target === modal) {
    modal.style.display = "none";
  }
};
}

/* MAGICAL BURST EFFECT */
function triggerBurstEffect(level) {
const slotDiv = document.getElementById(`slot-level-${level}`);
if (!slotDiv) return;
const burstDiv = document.createElement("div");
burstDiv.className = "burst";
slotDiv.appendChild(burstDiv);

burstDiv.addEventListener("animationend", () => {
  if (burstDiv.parentNode) {
    burstDiv.parentNode.removeChild(burstDiv);
  }
});
}

/* REST */
function longRest() {
Object.keys(state.spellSlots).forEach((level) => {
  state.spellSlots[level].used = [];
});
saveState();
renderSpellSlots();

const btn = document.querySelector('[data-rest="long"]');
btn.style.transform = "scale(1.1)";
setTimeout(() => (btn.style.transform = "scale(1)"), 300);
}

/* TAB SWITCH */
document.querySelectorAll(".nav-btn").forEach((btn) => {
btn.addEventListener("click", () => {
  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
  document.querySelectorAll(".content").forEach((c) => c.classList.remove("active"));
  const mobileNav = document.getElementById("mobile-nav");
  if (mobileNav.classList.contains("active")) {
    mobileNav.classList.remove("active");
  }
  const hamburger = document.getElementById("hamburger");
  hamburger.classList.remove("active");

  btn.classList.add("active");
  const newContent = document.getElementById(btn.dataset.tab);
  if (newContent) newContent.classList.add("active");
});
});

/* HAMBURGER TOGGLE */
document.getElementById("hamburger").addEventListener("click", () => {
const mobileNav = document.getElementById("mobile-nav");
mobileNav.classList.toggle("active");
document.getElementById("hamburger").classList.toggle("active");
});

/* DICE ROLLER */
function rollDice() {
const countInput = document.getElementById("dice-count");
const typeSelect = document.getElementById("dice-type");
const resultsContainer = document.getElementById("dice-results");
if (!countInput || !typeSelect || !resultsContainer) return;

const count = parseInt(countInput.value) || 1;
const type = parseInt(typeSelect.value) || 6;
if (count < 1) {
  alert("Number of dice must be at least 1.");
  return;
}

resultsContainer.innerHTML = "";
const rollResults = [];

for (let i = 0; i < count; i++) {
  const resultDiv = document.createElement("div");
  resultDiv.className = "dice-result";

  // Enhanced 3D spin effect
  const animationDiv = document.createElement("div");
  animationDiv.className = "dice-animation rolling";
  animationDiv.textContent = `?`;

  const valueSpan = document.createElement("span");
  valueSpan.textContent = "Rolling...";

  resultDiv.appendChild(animationDiv);
  resultDiv.appendChild(valueSpan);
  resultsContainer.appendChild(resultDiv);

  setTimeout(() => {
    const rollVal = Math.floor(Math.random() * type) + 1;
    animationDiv.classList.remove("rolling");
    animationDiv.textContent = rollVal;
    valueSpan.textContent = `d${type}: ${rollVal}`;
    rollResults.push(`d${type}: ${rollVal}`);
    if (rollResults.length === count) {
      addToRollHistory(rollResults.join(", "));
    }
  }, 1000);
}
}

function addToRollHistory(roll) {
state.diceRollHistory.unshift(roll);
if (state.diceRollHistory.length > 5) {
  state.diceRollHistory.pop();
}
saveState();
renderRollHistory();
}

/* INVENTORY */
function addItemModal() {
const form = document.getElementById("item-form");
const modalTitle = document.getElementById("item-modal-title");
const saveBtn = document.getElementById("save-item-btn");

form.reset();
modalTitle.textContent = "Add Item";
saveBtn.innerHTML = '<i class="fas fa-save"></i><span>Add</span>';
form.dataset.mode = "add";
form.dataset.index = "";

document.getElementById("item-modal").style.display = "block";
}

function closeItemModal() {
document.getElementById("item-modal").style.display = "none";
}

function saveItem(e) {
e.preventDefault();
const form = e.target;
const mode = form.dataset.mode;
const index = form.dataset.index;

const name = document.getElementById("item-name").value.trim();
const emoji = document.getElementById("item-emoji").value.trim();
const quantity = parseInt(document.getElementById("item-quantity").value) || 1;
const description = document.getElementById("item-description").value.trim();

if (!name || !emoji) {
  alert("Please provide at least a name and emoji.");
  return;
}

if (mode === "add") {
  state.inventory.push({ name, emoji, description, quantity });
} else if (mode === "edit") {
  state.inventory[index] = { name, emoji, description, quantity };
}

saveState();
renderInventory();
closeItemModal();
}

function initInventoryActions() {
const grid = document.getElementById("inventory-grid");
grid.addEventListener("click", (e) => {
  const editBtn = e.target.closest(".edit-btn");
  const deleteBtn = e.target.closest(".delete-btn");
  const itemDiv = e.target.closest(".inventory-item");

  if (!itemDiv) return;
  const idx = itemDiv.dataset.index;

  if (editBtn) {
    editItem(idx);
  } else if (deleteBtn) {
    deleteItem(idx);
  } else {
    // Show item view popup
    showItemViewModal(idx);
  }
});
}

function editItem(index) {
const form = document.getElementById("item-form");
const modalTitle = document.getElementById("item-modal-title");
const saveBtn = document.getElementById("save-item-btn");
const item = state.inventory[index];

if (!item) return;

document.getElementById("item-name").value = item.name;
document.getElementById("item-emoji").value = item.emoji;
document.getElementById("item-description").value = item.description;
document.getElementById("item-quantity").value = item.quantity;

modalTitle.textContent = "Edit Item";
saveBtn.innerHTML = '<i class="fas fa-save"></i><span>Save</span>';
form.dataset.mode = "edit";
form.dataset.index = index;

document.getElementById("item-modal").style.display = "block";
}

function deleteItem(index) {
if (confirm(`Delete "${state.inventory[index].name}" from inventory?`)) {
  state.inventory.splice(index, 1);
  saveState();
  renderInventory();
}
}

function showItemViewModal(index) {
const item = state.inventory[index];
if (!item) return;

const modal = document.getElementById("item-view-modal");
const closeBtn = document.getElementById("close-item-view-modal");

document.getElementById("item-view-title").textContent = item.name;
document.getElementById("item-view-emoji").textContent = item.emoji;
document.getElementById("item-view-description").textContent = item.description;
document.getElementById("item-view-quantity").textContent = item.quantity;

modal.style.display = "block";

closeBtn.onclick = () => {
  modal.style.display = "none";
};
window.onclick = (event) => {
  if (event.target === modal) {
    modal.style.display = "none";
  }
};
}

/* NOTES */
function addNoteModal() {
const form = document.getElementById("note-form");
const modalTitle = document.getElementById("note-modal-title");
const saveBtn = document.getElementById("save-note-btn");

form.reset();
modalTitle.textContent = "Add Note";
saveBtn.innerHTML = '<i class="fas fa-save"></i><span>Add</span>';
form.dataset.mode = "add";
form.dataset.index = "";

document.getElementById("note-modal").style.display = "block";
}

function closeNoteModal() {
document.getElementById("note-modal").style.display = "none";
}

function saveNote(e) {
e.preventDefault();
const form = e.target;
const mode = form.dataset.mode;
const index = form.dataset.index;

const title = document.getElementById("note-title").value.trim();
const content = document.getElementById("note-content").value.trim();

if (!title || !content) {
  alert("Please fill out both title and content.");
  return;
}

if (mode === "add") {
  state.notes.push({ title, content });
} else if (mode === "edit") {
  state.notes[index] = { title, content };
}

saveState();
renderNotes();
closeNoteModal();
}

function editNote(index) {
const note = state.notes[index];
if (!note) return;

const form = document.getElementById("note-form");
const modalTitle = document.getElementById("note-modal-title");
const saveBtn = document.getElementById("save-note-btn");

document.getElementById("note-title").value = note.title;
document.getElementById("note-content").value = note.content;

modalTitle.textContent = "Edit Note";
saveBtn.innerHTML = '<i class="fas fa-save"></i><span>Save</span>';
form.dataset.mode = "edit";
form.dataset.index = index;

document.getElementById("note-modal").style.display = "block";
}

function deleteNote(index) {
if (confirm(`Delete note "${state.notes[index].title}"?`)) {
  state.notes.splice(index, 1);
  saveState();
  renderNotes();
}
}

function searchNotes() {
const query = document.getElementById("search-notes").value.toLowerCase();
const notesList = document.getElementById("notes-list");
notesList.innerHTML = "";

const filtered = state.notes.filter(
  (n) =>
    n.title.toLowerCase().includes(query) ||
    n.content.toLowerCase().includes(query)
);

filtered.forEach((note) => {
  const actualIndex = state.notes.indexOf(note);
  const noteDiv = document.createElement("div");
  noteDiv.className = "note-item";
  noteDiv.dataset.index = actualIndex;
  noteDiv.innerHTML = `
    <div class="note-title">${note.title}</div>
    <div class="note-content">${note.content}</div>
    <div class="note-actions">
      <button class="note-btn" onclick="editNote(${actualIndex})">
        <i class="fas fa-edit"></i>
      </button>
      <button class="note-btn" onclick="deleteNote(${actualIndex})">
        <i class="fas fa-trash-alt"></i>
      </button>
    </div>
  `;
  notesList.appendChild(noteDiv);
});
}

/* EVENT LISTENERS (INVENTORY) */
document.getElementById("add-item-btn").addEventListener("click", addItemModal);
document
.getElementById("close-item-modal")
.addEventListener("click", closeItemModal);
document.getElementById("item-form").addEventListener("submit", saveItem);
initInventoryActions();

/* EVENT LISTENERS (ITEM VIEW MODAL) */
document
.getElementById("close-item-view-modal")
.addEventListener("click", () => {
  document.getElementById("item-view-modal").style.display = "none";
});

/* EVENT LISTENERS (COINS) */
document
.getElementById("platinum")
.addEventListener("input", () => saveState());
document.getElementById("gold").addEventListener("input", () => saveState());
document
.getElementById("electrum")
.addEventListener("input", () => saveState());
document.getElementById("silver").addEventListener("input", () => saveState());
document.getElementById("copper").addEventListener("input", () => saveState());

/* EVENT LISTENERS (NOTES) */
document.getElementById("add-note-btn").addEventListener("click", addNoteModal);
document
.getElementById("close-note-modal")
.addEventListener("click", closeNoteModal);
document.getElementById("note-form").addEventListener("submit", saveNote);
document.getElementById("search-notes").addEventListener("input", searchNotes);

/* CLOSE MODALS ON BACKDROP CLICK (Slot selection / item view / etc.) */
window.addEventListener("click", (e) => {
const itemModal = document.getElementById("item-modal");
const noteModal = document.getElementById("note-modal");
const itemViewModal = document.getElementById("item-view-modal");
const slotModal = document.getElementById("spell-slot-modal");

if (e.target === itemModal) itemModal.style.display = "none";
if (e.target === noteModal) noteModal.style.display = "none";
if (e.target === itemViewModal) itemViewModal.style.display = "none";
if (e.target === slotModal) slotModal.style.display = "none";
});

/* LONG REST BUTTON */
document.querySelector('[data-rest="long"]').addEventListener("click", longRest);

/* SPELL ADD BUTTON */
document.getElementById("add-spell").addEventListener("click", addSpell);

/* ROLL DICE BUTTON */
document.getElementById("roll-dice").addEventListener("click", rollDice);

/* IMPORT & EXPORT BUTTONS */
document.getElementById("export-btn").addEventListener("click", exportCharacter);
document.getElementById("import-btn").addEventListener("click", () => {
document.getElementById("import-file").click();
});
document.getElementById("import-file").addEventListener("change", importCharacter);

/* EXPORT CHARACTER FUNCTION */
function exportCharacter() {
const exportData = {
  spellSlots: state.spellSlots,
  spellbook: state.spellbook,
  characterSheet: state.characterSheet,
  diceRollHistory: state.diceRollHistory,
  inventory: state.inventory,
  notes: state.notes,
  coins: state.coins,
};

const dataStr = JSON.stringify(exportData, null, 2);
const blob = new Blob([dataStr], { type: "application/json" });
const url = URL.createObjectURL(blob);

const a = document.createElement("a");
a.href = url;
a.download = `${state.characterSheet.name || "character"}.json`;
document.body.appendChild(a);
a.click();
document.body.removeChild(a);
URL.revokeObjectURL(url);
}

/* IMPORT CHARACTER FUNCTION */
function importCharacter(event) {
const file = event.target.files[0];
if (!file) return;

const reader = new FileReader();
reader.onload = function(e) {
  try {
    const importedData = JSON.parse(e.target.result);
    
    // Validate the imported data structure
    if (
      importedData.spellSlots &&
      importedData.spellbook &&
      importedData.characterSheet &&
      importedData.diceRollHistory &&
      importedData.inventory &&
      importedData.notes &&
      importedData.coins
    ) {
      // Update the state
      state.spellSlots = importedData.spellSlots;
      state.spellbook = importedData.spellbook;
      state.characterSheet = importedData.characterSheet;
      state.diceRollHistory = importedData.diceRollHistory;
      state.inventory = importedData.inventory;
      state.notes = importedData.notes;
      state.coins = importedData.coins;

      saveState();
      renderAll();
      alert("Character imported successfully!");
    } else {
      alert("Invalid character file.");
    }
  } catch (error) {
    alert("Failed to import character. Please ensure the file is a valid JSON.");
    console.error(error);
  }
};
reader.readAsText(file);
}

/* INITIAL RENDER */
renderAll();
