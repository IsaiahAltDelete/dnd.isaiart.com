// js/artifact-generator.js
import { randomItem, randomNumber, rollDice, getChargeDieForSpellLevel } from './utils.js';
import {
  artifactTypes, standoutFeatures, adjectives, materials, colors, accentColors, spellLists,
  cantripList, spellEnhancements, disadvantages, staffDesigns, sentientPersonalities,
  sentientAlignments, sentientSenses, sentientPurposes,
  quirks // <-- ADDED 'quirks' to the list here!
} from './data.js';
import { selectRarity, selectArtifactIcon } from './data-selectors.js';

export const generateArtifact = () => {
  // Retrieve user selections (assuming these are globally accessible or passed as arguments if needed).
  const selectedArtifactType = document.getElementById("artifactTypeSelect").value;
  const selectedRarity = document.getElementById("raritySelect").value;

  // Basic selections.
  const adjective = randomItem(adjectives);
  const artifactType =
    selectedArtifactType === "Any" ? randomItem(artifactTypes) : selectedArtifactType;
  const material = randomItem(materials);
  const mainColor = randomItem(colors);
  const accentColor = randomItem(accentColors);
  const rarity = selectRarity(selectedRarity);
  const weight = randomNumber(1, 5) + " lbs";
  const meleeDamage = rarity.meleeDamage;

  // Decide if the item uses a charge system (only for wands and staffs).
  let usesCharges = false;
  if (artifactType === "Wand" || artifactType === "Staff") {
    usesCharges = Math.random() < 0.6; // 60% chance
  }

  // ------------------------------
  // Spell/Charge Info
  // ------------------------------
  let spellInfo = "";
  let atWillInfo = "";
  let chargeInfo = "";

  if (usesCharges) {
    // Charge system allows leveled spells.
    const effectFactor = 2;
    const usageFrequency = 3;
    let maxER = 0;
    const spellList = [];
    for (let i = 0; i < rarity.spellSlots; i++) {
      const school = randomItem(Object.keys(spellLists));
      const availableSpells = spellLists[school].filter(s => s.level >= 1 && s.level <= rarity.maxSpellLevel);
      const spellObj = availableSpells.length > 0
        ? randomItem(availableSpells)
        : randomItem(spellLists[school].filter(s => s.level >= 1));
      const spellER = spellObj.level * effectFactor;
      maxER = Math.max(maxER, spellER);
      const die = getChargeDieForSpellLevel(spellObj.level);
      const spellCharges = rollDice(die);
      spellList.push(
        `${spellObj.name} (${school}, Level ${spellObj.level}) <span class="spell-charges">(Charges: ${spellCharges})</span>`
      );
    }
    spellInfo = `
      <div class="artifact-section">
        <p><i class="fas fa-scroll icon"></i><strong>Spell Slots:</strong></p>
        <p>${spellList.join("</p><p>")}</p>
      </div>
    `;
    // At-Will: Only one cantrip per item.
    const cantrip = randomItem(cantripList);
    atWillInfo = `
      <div class="artifact-section">
        <p><i class="fas fa-infinity icon"></i><strong>At-Will (Cantrip):</strong> ${cantrip.name}</p>
      </div>
    `;
    // Charges Calculation.
    const dailyChargesNeeded = maxER * usageFrequency;
    const totalCapacity = Math.ceil(2 * dailyChargesNeeded);
    const rechargeDieString = `1d${maxER * 2} + ${maxER}`;
    const avgRecharge = (((maxER * 2) + 1) / 2 + maxER).toFixed(1);
    let riskClause = "";
    if (Math.random() < 0.5) {
      riskClause = `<p><i class="fas fa-skull-crossbones icon"></i><strong>Last Charge Risk:</strong> If the final charge is expended, roll a d20. On a 1, the item is destroyed.</p>`;
    }
    chargeInfo = `
      <div class="artifact-section">
        <p><i class="fas fa-bolt icon"></i><strong>Total Charge Capacity:</strong> ${totalCapacity} charges.</p>
        <p><i class="fas fa-bolt icon"></i><strong>Recharge at Dawn:</strong> Roll ${rechargeDieString} (avg ~${avgRecharge} charges).</p>
        ${riskClause}
      </div>
    `;
  } else if (artifactType === "Wand" || artifactType === "Staff") {
    // No charge system: Only one at-will cantrip is used.
    const cantrip = randomItem(cantripList);
    atWillInfo = `
      <div class="artifact-section">
        <p><i class="fas fa-infinity icon"></i><strong>At-Will (Cantrip Only):</strong> ${cantrip.name}</p>
      </div>
    `;
  }

  // ------------------------------
  // Unique Distinguishing Feature
  // ------------------------------
  let uniqueFeatureInfo = "";
  if ((artifactType === "Wand" || artifactType === "Staff") && Math.random() < 0.5) {
    const feature = randomItem(standoutFeatures);
    uniqueFeatureInfo = `
      <div class="artifact-section">
        <p><i class="fas fa-gem icon"></i><strong>Unique Feature:</strong> ${feature}.</p>
      </div>
    `;
  }

  // ------------------------------
  // Enhancements & Disadvantages with Toned Glow
  // ------------------------------
  const allEnhancements = [...spellEnhancements, ...disadvantages];
  const selectedEnhancements = [];
  let disadvantageCount = 0;
  for (let i = 0; i < rarity.enhancement; i++) {
    const enhancement = randomItem(allEnhancements);
    if (disadvantages.includes(enhancement) && disadvantageCount < 1) {
      disadvantageCount++;
      selectedEnhancements.push(enhancement);
    } else if (!disadvantages.includes(enhancement)) {
      selectedEnhancements.push(enhancement);
    }
  }
  const enhancementInfo = selectedEnhancements.length > 0
    ? `
      <div class="artifact-section">
        <p><i class="fas fa-plus-circle icon"></i><strong>Enhancements & Disadvantages:</strong></p>
        <p>${selectedEnhancements.map(e => {
          const glowClass = spellEnhancements.includes(e) ? "glow-green" : "glow-red";
          const baseClass = spellEnhancements.includes(e) ? "enhancement-text" : "disadvantage-text";
          return `<span class="${baseClass} ${glowClass}">${e.name}: ${e.description}</span>`;
        }).join("</p><p>")}</p>
      </div>
    `
    : "";

  // ------------------------------
  // Attunement Info
  // ------------------------------
  const attunementInfo = rarity.attunement
    ? `<div class="artifact-section"><p><i class="fas fa-user-lock icon"></i><strong>Attunement:</strong> Required</p></div>`
    : `<div class="artifact-section"><p><i class="fas fa-user-check icon"></i><strong>Attunement:</strong> Not needed</p></div>`;

  // ------------------------------
  // Title Color: Single vs. Gradient
  // ------------------------------
  let titleStyle = "";
  if (mainColor.name === accentColor.name) {
    titleStyle = `color: ${mainColor.hex};`;
  } else {
    titleStyle = `background: linear-gradient(to right, ${mainColor.hex}, ${accentColor.hex});
-webkit-background-clip: text;
-webkit-text-fill-color: transparent;`;
  }

  // ------------------------------
  // Build Profile-Style Layout
  // ------------------------------
  const mainColorMarkup = `<span class="color-box" style="background: ${mainColor.hex};"></span><strong>${mainColor.name}</strong> (${mainColor.hex})`;
  const accentColorMarkup = `<span class="color-box" style="background: ${accentColor.hex};"></span><strong>${accentColor.name}</strong> (${accentColor.hex})`;
  const staffDesignInfo = artifactType === "Staff" ? `
    <div class="artifact-section">
      <p><i class="fas fa-wand-sparkles icon"></i><strong>Staff Design:</strong> ${randomItem(staffDesigns)}</p>
    </div>
  ` : "";
  let artifactName = `${adjective} ${material} ${artifactType}`;
  let sentientInfo = "";
  if (Math.random() < 0.2) {
    artifactName = `Sentient ${artifactName}`;
    const personality = randomItem(sentientPersonalities);
    const alignment = randomItem(sentientAlignments);
    const senses = randomItem(sentientSenses);
    const purpose = randomItem(sentientPurposes);
    sentientInfo = `
      <div class="artifact-section">
        <p><i class="fas fa-brain icon"></i><strong>Personality:</strong> ${personality}</p>
        <p><i class="fas fa-balance-scale icon"></i><strong>Alignment:</strong> ${alignment}</p>
        <p><i class="fas fa-eye icon"></i><strong>Senses:</strong> ${senses}</p>
        <p><i class="fas fa-bullseye icon"></i><strong>Special Purpose:</strong> ${purpose}</p>
      </div>
    `;
  }
  const quirk = randomItem(quirks);

  // Build the final HTML using a profile card layout.
  const profileHeader = `
    <div class="profile-header basic-info">
      <h2 style="${titleStyle}"><i class="fas ${selectArtifactIcon(artifactType)} icon"></i> ${artifactName}</h2>
      <p><i class="fas fa-star icon"></i><strong>Rarity:</strong> ${rarity.name}</p>
      <p><i class="fas fa-weight icon"></i><strong>Weight:</strong> ${weight}</p>
      <p><i class="fas fa-gavel icon"></i><strong>Melee Damage:</strong> ${meleeDamage}</p>
      <p><i class="fas fa-palette icon"></i><strong>Main Color:</strong> ${mainColorMarkup}</p>
      <p><i class="fas fa-brush icon"></i><strong>Accent Color:</strong> ${accentColorMarkup}</p>
    </div>
  `;

  const profileLeft = `
    <div class="profile-left">
      ${usesCharges ? (spellInfo + atWillInfo + chargeInfo) : atWillInfo}
      ${uniqueFeatureInfo}
      ${artifactType === "Staff" ? staffDesignInfo : ""}
    </div>
  `;

  const profileRight = `
    <div class="profile-right">
      ${enhancementInfo}
      ${attunementInfo}
      ${sentientInfo}
      <div class="artifact-section">
        <p><i class="fas fa-info-circle icon"></i><em>This artifact ${quirk}.</em></p>
      </div>
    </div>
  `;

  const profileDetails = `
    <div class="profile-details">
      ${profileLeft}
      ${profileRight}
    </div>
  `;

  const finalHTML = `
    <div class="profile-card">
      ${profileHeader}
      ${profileDetails}
    </div>
  `;

  document.getElementById("artifactDisplay").innerHTML = finalHTML;
};