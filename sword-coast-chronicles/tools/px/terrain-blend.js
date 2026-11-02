// tools/px/terrain-blend.js — page script for tools/shot.mjs --script (use
// --scenario none): builds one battle map per biome with world/battlemap.js and
// paints its ground twice — raw drawTile (what the arena shows today) over
// drawGroundBlended (the arena verge API) — with the deco on both, returning a
// PNG data URL per biome. Decode with tools/px/terrain-decode.mjs.
const BIOMES = ['plains', 'road', 'forest', 'hills', 'mountain', 'marsh', 'coast', 'tundra', 'cave', 'dungeon'];
const { Party, createCharacter, Game } = window.SC;
const TL = await import('/src/render/tiles.js');
const { buildBattleMap } = await import('/src/world/battlemap.js');
const { newGameState } = await import('/src/state.js');
Game.state = newGameState('terrain-blend'); Party.clear();
Party.add(createCharacter({ name: 'Tester', speciesId: 'human', classId: 'fighter', level: 3, backgroundId: 'soldier' }));
const out = [];
for (const biome of BIOMES) {
  try {
    const map = buildBattleMap({ biome, seed: 'arena-' + biome, party: Party.members.slice(), foes: 3 });
    const W = map.w * 16, H = map.h * 16;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H * 2 + 4;
    const c = cv.getContext('2d'); c.imageSmoothingEnabled = false;
    c.fillStyle = '#fa28c8'; c.fillRect(0, 0, cv.width, cv.height);
    for (let pass = 0; pass < 2; pass++) {
      const oy = pass * (H + 4);
      for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
        if (pass) TL.drawGroundBlended(c, map, x, y, x * 16, oy + y * 16, 0);
        else TL.drawTile(c, map.at('ground', x, y), x * 16, oy + y * 16, x, y, 0);
      }
      for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
        const d = map.at('deco', x, y); if (d) TL.drawTile(c, d, x * 16, oy + y * 16, x, y, 0);
      }
    }
    out.push({ id: 'blend-' + biome, x: map.w, y: map.h, url: cv.toDataURL('image/png') });
  } catch (e) { out.push({ id: 'blend-' + biome, x: 0, y: 0, err: String(e && e.stack || e) }); }
}
return out;
