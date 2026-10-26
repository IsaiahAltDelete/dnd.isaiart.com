// tools/px/arch-peek.mjs — print a map window as text: each cell is the deco key
// (or .ground key), '#' in front when the tile is solid, '@' where an NPC stands.
//   node tools/px/arch-peek.mjs <mapId> <cx> <cy> [radius=4]
import './shim.mjs';
const M = await import('../../src/world/maps.js');
const TL = await import('../../src/render/tiles.js');
const [id, cx, cy, r = 4] = process.argv.slice(2);
const m = M.loadMap(id, { cache: false });
const at = new Map((m.entities || []).filter((e) => e && e.npcId).map((e) => [`${e.x},${e.y}`, e.npcId]));
for (let y = +cy - +r; y <= +cy + +r; y++) {
  let s = '';
  for (let x = +cx - +r; x <= +cx + +r; x++) {
    if (!m.inBounds(x, y)) { s += ' ####### '; continue; }
    const d = m.deco[y * m.w + x], g = m.ground[y * m.w + x];
    const k = (d ? TL.tileKey(d) : '.' + TL.tileKey(g)).slice(0, 7).padEnd(7);
    s += (at.has(`${x},${y}`) ? '@' : (m.solidAt(x, y) ? '#' : ' ')) + k + ' ';
  }
  console.log(String(y).padStart(3), s);
}
for (const [k, v] of at) { const [x, y] = k.split(',').map(Number); if (Math.abs(x - cx) <= r && Math.abs(y - cy) <= r) console.log(' @', k, v); }
