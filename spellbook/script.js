// Particles.js configuration for background
particlesJS('particles-js', {
    particles: {
        number: { value: 80, density: { enable: true, value_area: 800 } },
        color: { value: '#fbbf24' },
        shape: { type: 'circle' },
        opacity: {
            value: 0.5,
            random: true,
            animation: { enable: true, speed: 1, min: 0.1, sync: false }
        },
        size: {
            value: 3,
            random: true,
            animation: { enable: true, speed: 2, min: 0.1, sync: false }
        },
        line_linked: {
            enable: true,
            distance: 150,
            color: '#fbbf24',
            opacity: 0.2,
            width: 1
        },
        move: {
            enable: true,
            speed: 1,
            direction: 'none',
            random: true,
            straight: false,
            out_mode: 'out',
            bounce: false,
        }
    },
    interactivity: {
        detect_on: 'canvas',
        events: {
            onhover: { enable: true, mode: 'repulse' },
            onclick: { enable: true, mode: 'push' },
            resize: true
        },
        modes: {
            repulse: { distance: 100, duration: 0.4 },
            push: { particles_nb: 4 }
        }
    },
    retina_detect: true
});

// State Management
const state = {
    spellSlots: JSON.parse(localStorage.getItem('spellSlots')) || {
        1: { total: 2, used: [] },
        2: { total: 0, used: [] },
        3: { total: 0, used: [] },
        4: { total: 0, used: [] },
        5: { total: 0, used: [] },
        6: { total: 0, used: [] },
        7: { total: 0, used: [] },
        8: { total: 0, used: [] },
        9: { total: 0, used: [] }
    },
    spellbook: JSON.parse(localStorage.getItem('spellbook')) || [
        { name: 'Fire Bolt', level: 0, prepared: true },
        { name: 'Mage Hand', level: 0, prepared: true },
        { name: 'Magic Missile', level: 1, prepared: true },
        { name: 'Shield', level: 1, prepared: true },
        { name: 'Arcane Warding', level: 2, prepared: false } // Added Arcane Warding
    ],
    characterSheet: JSON.parse(localStorage.getItem('characterSheet')) || {
        name: 'Unnamed Character',
        abilityScores: {
            strength: 10,
            dexterity: 10,
            constitution: 10,
            intelligence: 10,
            wisdom: 10,
            charisma: 10
        },
        levels: {
            level: 1,
            experience: 0
        },
        proficiencies: {
            arcana: false,
            history: false,
            insight: false,
            athletics: false,
            acrobatics: false
            // Add more proficiencies as needed
        },
        race: '',
        class: ''
    },
    diceRollHistory: JSON.parse(localStorage.getItem('diceRollHistory')) || [] // Added dice roll history
};

function saveState() {
    localStorage.setItem('spellSlots', JSON.stringify(state.spellSlots));
    localStorage.setItem('spellbook', JSON.stringify(state.spellbook));
    localStorage.setItem('characterSheet', JSON.stringify(state.characterSheet));
    localStorage.setItem('diceRollHistory', JSON.stringify(state.diceRollHistory));
}

function renderCharacterSheet() {
    // Character Name
    const nameInput = document.getElementById('character-name');
    nameInput.value = state.characterSheet.name;
    nameInput.oninput = () => {
        state.characterSheet.name = nameInput.value;
        saveState();
    };

    // Ability Scores and Modifiers
    const abilities = state.characterSheet.abilityScores;
    for (let ability in abilities) {
        const input = document.getElementById(ability);
        const modSpan = document.getElementById(`${ability}-mod`);
        if (input && modSpan) {
            input.value = abilities[ability];
            const modifier = calculateModifier(abilities[ability]);
            modSpan.textContent = `(${modifier >= 0 ? '+' : ''}${modifier})`;
            input.oninput = () => {
                const value = parseInt(input.value) || 0;
                state.characterSheet.abilityScores[ability] = value;
                const newMod = calculateModifier(value);
                modSpan.textContent = `(${newMod >= 0 ? '+' : ''}${newMod})`;
                saveState();
            };
        }
    }

    // Levels
    const levelInput = document.getElementById('level');
    const experienceInput = document.getElementById('experience');
    if (levelInput) {
        levelInput.value = state.characterSheet.levels.level;
        levelInput.oninput = () => {
            const value = parseInt(levelInput.value) || 1;
            state.characterSheet.levels.level = value;
            saveState();
        };
    }
    if (experienceInput) {
        experienceInput.value = state.characterSheet.levels.experience;
        experienceInput.oninput = () => {
            const value = parseInt(experienceInput.value) || 0;
            state.characterSheet.levels.experience = value;
            saveState();
        };
    }

    // Proficiencies
    const proficiencies = state.characterSheet.proficiencies;
    for (let prof in proficiencies) {
        const checkbox = document.getElementById(prof);
        if (checkbox) {
            checkbox.checked = proficiencies[prof];
            checkbox.onchange = () => {
                state.characterSheet.proficiencies[prof] = checkbox.checked;
                saveState();
            };
        }
    }

    // Race and Class
    const race = document.getElementById('race');
    const charClass = document.getElementById('class');
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
}

function calculateModifier(score) {
    return Math.floor((score - 10) / 2);
}

function renderSpellSlots() {
    const container = document.getElementById('spell-slots-container');
    container.innerHTML = '';

    Object.entries(state.spellSlots).forEach(([level, { total, used }]) => {
        const slotDiv = document.createElement('div');
        slotDiv.className = 'spell-slot';
        slotDiv.id = `slot-level-${level}`;
        
        slotDiv.innerHTML = `
            <div class="slot-header">
                <div><i class="fas fa-star"></i> Level ${level}</div>
                <div class="slot-controls">
                    <button class="slot-btn" onclick="adjustSlots(${level}, false)">
                        <i class="fas fa-minus"></i>
                    </button>
                    <span class="slot-count">${total}</span>
                    <button class="slot-btn" onclick="adjustSlots(${level}, true)">
                        <i class="fas fa-plus"></i>
                    </button>
                </div>
            </div>
            <div class="slot-circles">
                ${Array(total).fill().map((_, i) => `
                    <div class="slot-circle ${used.includes(i) ? 'used' : ''}"
                         onclick="toggleSlot(${level}, ${i})">
                    </div>
                `).join('')}
            </div>
        `;
        
        container.appendChild(slotDiv);
    });
}

function renderSpellbook() {
    const cantripsContainer = document.getElementById('cantrips-container');
    const spellsContainer = document.getElementById('spells-container');
    
    cantripsContainer.innerHTML = '';
    spellsContainer.innerHTML = '';

    state.spellbook.forEach(spell => {
        const spellDiv = document.createElement('div');
        spellDiv.className = 'spell-item';
        
        spellDiv.innerHTML = `
            <div class="spell-info">
                <i class="fas fa-magic sparkle ${spell.prepared ? 'active' : ''}"></i>
                <span>${spell.name}</span>
                ${spell.level > 0 ? `<span class="text-sm opacity-75">Level ${spell.level}</span>` : ''}
            </div>
            <div class="spell-actions">
                <button class="spell-btn ${spell.prepared ? 'prepared' : ''}" 
                        onclick="togglePrepared('${spell.name}')">
                    ${spell.level === 0 ? 
                        (spell.prepared ? 'Known' : 'Learn') : 
                        (spell.prepared ? 'Prepared' : 'Prepare')}
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

// Spell Slots Functions
function adjustSlots(level, increment) {
    const slots = state.spellSlots[level];
    const newTotal = Math.max(0, slots.total + (increment ? 1 : -1));
    state.spellSlots[level] = {
        total: newTotal,
        used: slots.used.filter(i => i < newTotal)
    };
    saveState();
    renderSpellSlots();
}

function toggleSlot(level, index) {
    const slots = state.spellSlots[level];
    if (slots.used.includes(index)) {
        slots.used = slots.used.filter(i => i !== index);
    } else {
        slots.used.push(index);
        triggerBurstEffect(level);
    }
    saveState();
    renderSpellSlots();
}

// Spellbook Functions
function addSpell() {
    const nameInput = document.getElementById('spell-name');
    const levelInput = document.getElementById('spell-level');
    
    const name = nameInput.value.trim();
    const level = parseInt(levelInput.value);

    if (name && !state.spellbook.some(spell => spell.name.toLowerCase() === name.toLowerCase())) {
        state.spellbook.push({
            name,
            level,
            prepared: false
        });
        nameInput.value = '';
        saveState();
        renderSpellbook();
    } else {
        alert('Spell name must be unique and not empty.');
    }
}

function togglePrepared(spellName) {
    state.spellbook = state.spellbook.map(spell =>
        spell.name === spellName
            ? { ...spell, prepared: !spell.prepared }
            : spell
    );
    saveState();
    renderSpellbook();
}

function removeSpell(spellName) {
    if (confirm(`Are you sure you want to remove ${spellName} from your spellbook?`)) {
        state.spellbook = state.spellbook.filter(spell => spell.name !== spellName);
        saveState();
        renderSpellbook();
    }
}

function useSpell(spellName) {
    const spell = state.spellbook.find(s => s.name === spellName);
    if (!spell) return;

    if (spell.level === 0) {
        // Cantrips do not use spell slots
        alert(`${spell.name} used! Cantrips do not consume spell slots.`);
        return;
    }

    const availableLevels = Object.keys(state.spellSlots)
        .filter(level => level >= spell.level && state.spellSlots[level].used.length < state.spellSlots[level].total)
        .map(level => parseInt(level));

    if (availableLevels.length === 0) {
        alert('No available spell slots to cast this spell.');
        return;
    }

    if (availableLevels.length === 1) {
        const selectedLevel = availableLevels[0];
        state.spellSlots[selectedLevel].used.push(state.spellSlots[selectedLevel].used.length);
        triggerBurstEffect(selectedLevel);
        saveState();
        renderSpellSlots();
        alert(`${spell.name} cast using a Level ${selectedLevel} spell slot.`);
        return;
    }

    // If multiple levels available, ask the user
    const levelChoices = availableLevels.map(level => `Level ${level}`).join(', ');
    const chosenLevel = prompt(`Choose a spell slot level to use for casting ${spell.name}:\nAvailable levels: ${levelChoices}`);

    const chosenLevelNum = parseInt(chosenLevel);
    if (availableLevels.includes(chosenLevelNum)) {
        state.spellSlots[chosenLevelNum].used.push(state.spellSlots[chosenLevelNum].used.length);
        triggerBurstEffect(chosenLevelNum);
        saveState();
        renderSpellSlots();
        alert(`${spell.name} cast using a Level ${chosenLevelNum} spell slot.`);
    } else {
        alert('Invalid spell slot level selected.');
    }
}

// Particle Burst Effect
function triggerBurstEffect(level) {
    const slotDiv = document.getElementById(`slot-level-${level}`);
    if (!slotDiv) return;

    const burstDiv = document.createElement('div');
    burstDiv.className = 'burst';
    slotDiv.appendChild(burstDiv);

    // Remove the burst after animation completes
    burstDiv.addEventListener('animationend', () => {
        slotDiv.removeChild(burstDiv);
    });
}

// Rest Functions
function longRest() {
    Object.keys(state.spellSlots).forEach(level => {
        state.spellSlots[level].used = [];
    });
    saveState();
    renderSpellSlots();
    
    const btn = document.querySelector('[data-rest="long"]');
    btn.style.transform = 'scale(1.1)';
    setTimeout(() => btn.style.transform = 'scale(1)', 300);
}

// Tab Switching with Fixed Logic
document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        // Remove 'active' class from all nav buttons
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        // Remove 'active' class from all content sections
        document.querySelectorAll('.content').forEach(c => c.classList.remove('active'));
        // Remove 'active' class from mobile navigation if active
        const mobileNav = document.getElementById('mobile-nav');
        if (mobileNav.classList.contains('active')) {
            mobileNav.classList.remove('active');
        }
        // Remove 'active' class from hamburger menu if active
        const hamburger = document.getElementById('hamburger');
        hamburger.classList.remove('active');
        
        // Add 'active' class to the clicked nav button
        btn.classList.add('active');
        // Add 'active' class to the corresponding content section
        const newContent = document.getElementById(btn.dataset.tab);
        newContent.classList.add('active');
    });
});

// Hamburger Menu Toggle
document.getElementById('hamburger').addEventListener('click', () => {
    const mobileNav = document.getElementById('mobile-nav');
    mobileNav.classList.toggle('active');
    const hamburger = document.getElementById('hamburger');
    hamburger.classList.toggle('active');
});

// Dice Roller Functions
function rollDice() {
    const countInput = document.getElementById('dice-count');
    const typeSelect = document.getElementById('dice-type');
    const resultsContainer = document.getElementById('dice-results');
    const historyContainer = document.getElementById('roll-history');

    const count = parseInt(countInput.value) || 1;
    const type = parseInt(typeSelect.value) || 6;

    if (count < 1) {
        alert('Number of dice must be at least 1.');
        return;
    }

    // Clear previous results
    resultsContainer.innerHTML = '';

    const rollResults = [];

    for (let i = 0; i < count; i++) {
        const resultDiv = document.createElement('div');
        resultDiv.className = 'dice-result';

        const animationDiv = document.createElement('div');
        animationDiv.className = 'dice-animation rolling';

        const valueSpan = document.createElement('span');
        valueSpan.textContent = 'Rolling...';

        resultDiv.appendChild(animationDiv);
        resultDiv.appendChild(valueSpan);
        resultsContainer.appendChild(resultDiv);

        // Simulate dice roll with timeout
        setTimeout(() => {
            const roll = Math.floor(Math.random() * type) + 1;
            animationDiv.classList.remove('rolling');
            valueSpan.textContent = `d${type}: ${roll}`;
            rollResults.push(`d${type}: ${roll}`);
            if (rollResults.length === count) {
                addToRollHistory(rollResults.join(', '));
            }
        }, 1000); // 1 second animation
    }
}

function addToRollHistory(roll) {
    // Add to the beginning of the history array
    state.diceRollHistory.unshift(roll);
    // Keep only the last 5 rolls
    if (state.diceRollHistory.length > 5) {
        state.diceRollHistory.pop();
    }
    saveState();
    renderRollHistory();
}

function renderRollHistory() {
    const historyContainer = document.getElementById('roll-history');
    historyContainer.innerHTML = '';

    state.diceRollHistory.forEach((roll, index) => {
        const rollEntry = document.createElement('p');
        rollEntry.textContent = `${index + 1}. ${roll}`;
        historyContainer.appendChild(rollEntry);
    });
}

// Event Listeners
document.getElementById('add-spell').addEventListener('click', addSpell);
document.querySelector('[data-rest="long"]').addEventListener('click', longRest);
document.getElementById('spell-name').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addSpell();
});
document.getElementById('roll-dice').addEventListener('click', rollDice);

// Initial Render
renderCharacterSheet();
renderSpellSlots();
renderSpellbook();
renderRollHistory();
