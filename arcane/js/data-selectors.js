// js/data-selectors.js
import { rarities, artifactIcons, defaultIcon } from './data.js';

export const selectRarity = userChoice => {
  if (userChoice !== "Any") {
    return rarities.find(r => r.name === userChoice) || rarities[0];
  }
  const totalWeight = rarities.reduce((sum, rarity) => sum + rarity.weight, 0);
  let rand = Math.random() * totalWeight;
  for (let rarity of rarities) {
    if (rand < rarity.weight) return rarity;
    rand -= rarity.weight;
  }
  return rarities[0];
};

export const selectArtifactIcon = artifactType =>
  artifactIcons[artifactType] || defaultIcon;