// core/cheatflags.js — the testing switches, and nothing else.
//
// This module imports nothing on purpose. The rules layer needs to read these
// flags (god mode is enforced at the damage boundary), and the cheat console
// needs to write them — routing both through a leaf module keeps character.js
// from importing the engine and creating a cycle.

export const CHEATS = {
  god: false,          // the party cannot be reduced below its current hp
  noclip: false,       // walk through walls, water and locked doors
  noEncounters: false, // suppress grass ambushes regardless of the setting
  oneShot: false,      // player attacks deal lethal damage
  freeCast: false,     // spells and class resources cost nothing
  noCombat: false,     // no fight ever starts: random, roaming or scripted
};

export default CHEATS;
