// tools/px/terrain-arenas.js — page script for tools/shot.mjs --script (use
// --scenario none): builds one painted battle arena per biome through
// world/battlemap.js, stages the fight, and returns a PNG data URL of each field
// with the battle HUD hidden. Decode with tools/px/terrain-decode.mjs.
const BIOMES = ['pine-forest', 'plains', 'road', 'marsh', 'tundra', 'coast', 'hills', 'mountain', 'cave', 'dungeon'];
const { Game, Party, createCharacter } = window.SC;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const { buildEncounter } = await import('/src/rules/combat.js');
const { BattleScene } = await import('/src/ui/combatui.js');
const { buildBattleMap } = await import('/src/world/battlemap.js');
const { newGameState } = await import('/src/state.js');
const canvas = document.getElementById('game');
Game.state = newGameState('terrain-arenas'); Party.clear();
Party.add(createCharacter({ name: 'Tester', speciesId: 'human', classId: 'fighter', level: 3, backgroundId: 'soldier' }));
const out = [];
for (const biome of BIOMES) {
  try {
    const map = buildBattleMap({ biome, seed: 'arena-' + biome, party: Party.members.slice(), foes: 3 });
    const enc = buildEncounter({ party: Party, enemies: ['goblin', 'goblin', 'wolf'], map, seed: 'arena-' + biome, biome, bag: Party.inventory });
    const s = new BattleScene(enc);
    Game.replace(s); Game.paused = false;
    s.drawUI = () => {};
    await wait(900);
    out.push({ id: 'arena-' + biome, x: 0, y: 0, url: canvas.toDataURL('image/png') });
  } catch (e) { out.push({ id: 'arena-' + biome, x: 0, y: 0, err: String(e && e.stack || e) }); }
}
return out;
