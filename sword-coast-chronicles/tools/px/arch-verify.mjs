// tools/px/arch-verify.mjs — the settlement checks, headless: every declared warp
// in both directions (warp tile open and carrying a trigger to the right map,
// landing tile walkable, a return warp present and reachable from the landing
// tile by walking), and every spawned NPC on a walkable, dry tile that is not a
// doorway or a warp. The same rules npccheck.html and docs/CONTINUE.md apply,
// run over EVERY map rather than the extra cast only.
//   node tools/px/arch-verify.mjs            summary + every failure
//   node tools/px/arch-verify.mjs --map phandalin
import './shim.mjs';

const only = (() => { const i = process.argv.indexOf('--map'); return i > 0 ? process.argv[i + 1] : null; })();
const M = await import('../../src/world/maps.js');
const { TF } = await import('../../src/world/tilemap.js');

const ids = Object.keys(M.MAP_DEFS);
const maps = new Map();
const fails = [];
const load = (id) => {
  if (maps.has(id)) return maps.get(id);
  let m = null;
  try { m = M.loadMap(id, { cache: false }); } catch (e) { fails.push(`LOAD ${id}: ${e.message}`); }
  maps.set(id, m);
  return m;
};

/** Every tile reachable on foot from (x, y). Doors that were opened are floor. */
function reach(map, x, y) {
  const seen = new Uint8Array(map.w * map.h);
  const q = [[x, y]];
  if (!map.inBounds(x, y)) return seen;
  seen[y * map.w + x] = 1;
  while (q.length) {
    const [cx, cy] = q.pop();
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const nx = cx + dx, ny = cy + dy;
      if (!map.inBounds(nx, ny)) continue;
      const i = ny * map.w + nx;
      if (seen[i] || map.solidAt(nx, ny)) continue;
      seen[i] = 1; q.push([nx, ny]);
    }
  }
  return seen;
}

let warps = 0, warpOk = 0, procedural = 0;
for (const n of M.WORLD_NODES) {
  if (only && n.from !== only && n.to !== only) continue;
  warps++;
  const A = load(n.from), B = load(n.to);
  const bad = [];
  if (!A) bad.push(`no map ${n.from}`);
  if (!B) bad.push(`no map ${n.to}`);
  if (A) {
    const { x, y } = n.fromXY;
    if (!A.inBounds(x, y)) bad.push(`warp tile ${x},${y} out of bounds`);
    else {
      if (A.solidAt(x, y)) bad.push(`warp tile ${x},${y} solid`);
      const t = A.triggers.find((q) => q.kind === 'warp' && q.x === x && q.y === y && q.data && q.data.map === n.to);
      if (!t) bad.push(`no warp trigger at ${x},${y}`);
    }
  }
  if (!n.toXY) { procedural++; if (!bad.length) warpOk++; else fails.push(`WARP ${n.id}: ${bad.join('; ')}`); continue; }
  if (B) {
    const { x, y } = n.toXY;
    if (!B.inBounds(x, y)) bad.push(`landing ${x},${y} out of bounds`);
    else if (B.solidAt(x, y)) bad.push(`landing ${x},${y} solid`);
    const back = M.WORLD_NODES.filter((q) => q.from === n.to && q.to === n.from);
    if (!back.length) bad.push('no return warp');
    else if (B.inBounds(x, y) && !B.solidAt(x, y)) {
      const seen = reach(B, x, y);
      // A return warp counts as reached if its tile or any tile of its mouth
      // (the #offset shoulders applyWarpNodes laid) is walkable-to.
      const mouths = B.triggers.filter((q) => q.kind === 'warp' && q.data && q.data.map === n.from);
      const ok = mouths.some((q) => seen[q.y * B.w + q.x]);
      if (!ok) bad.push(`return warp to ${n.from} not reachable from landing ${x},${y}`);
    }
    for (const e of B.entities || []) {
      if (e && e.solid && e.x === x && e.y === y && e.npcId) bad.push(`npc ${e.npcId} stands on the landing tile`);
    }
  }
  if (bad.length) fails.push(`WARP ${n.id}: ${bad.join('; ')}`); else warpOk++;
}

let npcs = 0, npcOk = 0;
const BLOCKING = new Set(['warp', 'door', 'stairs', 'locked-door', 'ladder']);
for (const id of ids) {
  if (only && id !== only) continue;
  const m = load(id);
  if (!m) continue;
  for (const e of m.entities || []) {
    if (!e || !e.npcId) continue;
    npcs++;
    const p = [];
    if (!m.inBounds(e.x, e.y)) p.push('out of bounds');
    else {
      const f = m.flagAt(e.x, e.y);
      if (f & TF.SOLID) p.push('SOLID');
      if (f & TF.WATER) p.push('WATER');
      const t = m.triggers.find((q) => q.x === e.x && q.y === e.y && BLOCKING.has(q.kind));
      if (t) p.push(`on ${t.kind} ${t.id}`);
      // an NPC who can be walled in by scenery is as stuck as one on a wall
      let open = 0;
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) if (m.inBounds(e.x + dx, e.y + dy) && !m.solidAt(e.x + dx, e.y + dy)) open++;
      if (!open) p.push('boxed in');
    }
    if (p.length) fails.push(`NPC ${id} ${e.npcId} (${e.x},${e.y}): ${p.join(', ')}`); else npcOk++;
  }
}

for (const f of fails) console.log(f);
console.log(`maps ${[...maps.values()].filter(Boolean).length}/${only ? 1 : ids.length}  warps ${warpOk}/${warps} ok (${procedural} procedural ends)  npcs ${npcOk}/${npcs} ok  failures ${fails.length}`);
process.exit(fails.length ? 1 : 0);
