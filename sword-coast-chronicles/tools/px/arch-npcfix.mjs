// tools/px/arch-npcfix.mjs — for every NPC arch-verify.mjs would fail, the
// nearest tile that would pass: walkable, dry, not a warp/door/stairs, not a
// door's front step, open on at least two sides, and not already somebody's.
//   node tools/px/arch-npcfix.mjs [--map id]
import './shim.mjs';
const only = (() => { const i = process.argv.indexOf('--map'); return i > 0 ? process.argv[i + 1] : null; })();
const M = await import('../../src/world/maps.js');
const { TF } = await import('../../src/world/tilemap.js');
const BLOCK = new Set(['warp', 'door', 'stairs', 'locked-door', 'ladder']);
for (const id of Object.keys(M.MAP_DEFS)) {
  if (only && id !== only) continue;
  let m; try { m = M.loadMap(id, { cache: false }); } catch { continue; }
  const taken = new Set((m.entities || []).filter((e) => e && e.npcId).map((e) => `${e.x},${e.y}`));
  const trig = (x, y) => m.triggers.some((q) => q.x === x && q.y === y && BLOCK.has(q.kind));
  const front = (x, y) => m.triggers.some((q) => BLOCK.has(q.kind) && q.x === x && q.y === y - 1);
  const open = (x, y) => [[0, -1], [1, 0], [0, 1], [-1, 0]].filter(([dx, dy]) => m.inBounds(x + dx, y + dy) && !m.solidAt(x + dx, y + dy)).length;
  const good = (x, y) => m.inBounds(x, y) && !(m.flagAt(x, y) & (TF.SOLID | TF.WATER)) && !trig(x, y) && !front(x, y) && open(x, y) >= 2 && !taken.has(`${x},${y}`);
  for (const e of m.entities || []) {
    if (!e || !e.npcId) continue;
    const n = e.npc || {};
    const ox = n.x != null ? n.x : e.x, oy = n.y != null ? n.y : e.y;
    const bad = !m.inBounds(e.x, e.y) || (m.flagAt(e.x, e.y) & (TF.SOLID | TF.WATER)) || trig(e.x, e.y) || open(e.x, e.y) === 0;
    if (!bad) continue;
    let best = null;
    for (let r = 1; r < 12 && !best; r++) {
      for (let dy = -r; dy <= r && !best; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (good(ox + dx, oy + dy)) { best = { x: ox + dx, y: oy + dy }; break; }
      }
    }
    console.log(`${id} ${e.npcId} catalogue (${ox},${oy}) spawned (${e.x},${e.y}) -> ${best ? `${best.x},${best.y}` : 'none'}`);
  }
}
