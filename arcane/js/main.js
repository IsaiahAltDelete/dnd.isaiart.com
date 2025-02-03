// js/main.js
import { generateArtifact } from './artifact-generator.js';
import { copyArtifactDetails } from './ui-helpers.js';
import { artifactTypes, artifactIcons, defaultIcon } from './data.js'; // Import if needed in main.js - in this case for initialization

// Event Listeners
document.getElementById("generateBtn").addEventListener("click", generateArtifact);
document.getElementById("copyBtn").addEventListener("click", copyArtifactDetails);

// Populate Artifact Type options on page load.
const artifactTypeSelect = document.getElementById("artifactTypeSelect");
artifactTypes.forEach(type => {
  const option = document.createElement("option");
  option.value = type;
  option.textContent = type;
  artifactTypeSelect.appendChild(option);
});