// tools/px/maps.mjs — build the real maps headlessly and count, in situ, the
// things the judge counted: unverged dirt-group joins and lone islands.
import '../px/shim.mjs';
import { pathToFileURL } from 'node:url';

const ROOT = process.argv[2];              // mirrored src/ root
const which = process.argv[3] || '';

async function main() {
  const TL = await import(pathToFileURL(`${ROOT}/render/tiles.mjs`).href);
  const M = await import(pathToFileURL(`${ROOT}/world/maps.mjs`).href);
  const ids = Object.keys(M.MAP_DEFS || {});
  const sub = TL.tileSubgroup || ((id) => TL.tileGroup(id));

  const tot = { joins: 0, isles: {}, byPair: {} };
  for (const id of ids) {
    if (which && id !== which) continue;
    let map;
    try { map = M.loadMap(id); } catch (e) { console.log(`${id}: FAILED ${e.message}`); continue; }
    if (!map || !map.ground) continue;
    const w = map.w, h = map.h, g = map.ground;
    let joins = 0;
    const isle = {};
    const around = {};
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const a = g[y * w + x];
      if (TL.tileLayer(a) !== 'ground') continue;
      const ga = TL.tileGroup(a), sa = sub(a);
      let kin = 0, nb = 0;
      const nbs = [];
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        nb++;
        const b = g[ny * w + nx];
        nbs.push(b);
        if (sub(b) === sa) kin++;
        // a "join" the old group test could not see: same group, different subgroup
        if (dx >= 0 && dy >= 0 && TL.tileGroup(b) === ga && sub(b) !== sa) {
          joins++;
          const k = [sa, sub(b)].sort().join('<->');
          tot.byPair[k] = (tot.byPair[k] || 0) + 1;
        }
      }
      if (nb && !kin) {
        isle[TL.tileKey(a)] = (isle[TL.tileKey(a)] || 0) + 1;
        const kk = TL.tileKey(a);
        around[kk] = around[kk] || {};
        for (const b of nbs) around[kk][TL.tileKey(b)] = (around[kk][TL.tileKey(b)] || 0) + 1;
      }
    }
    tot.joins += joins;
    for (const k of Object.keys(isle)) tot.isles[k] = (tot.isles[k] || 0) + isle[k];
    const top = Object.keys(isle).sort((a, b) => isle[b] - isle[a]).slice(0, 6).map((k) => `${k} ${isle[k]}`).join('  ');
    if (joins || top) console.log(`${id.padEnd(26)} same-group/diff-subgroup joins ${String(joins).padStart(5)}   islands: ${top}`);
    if (which) for (const k of Object.keys(around)) console.log('   ', k, 'sits in', JSON.stringify(around[k]));
  }
  console.log('\nTOTAL same-group/different-subgroup joins:', tot.joins);
  console.log('by pair:', JSON.stringify(tot.byPair, null, 0));
  const isles = Object.keys(tot.isles).sort((a, b) => tot.isles[b] - tot.isles[a]);
  console.log('TOTAL islands (no same-subgroup cardinal neighbour):');
  for (const k of isles) if (tot.isles[k] > 2) console.log('   ', k.padEnd(20), tot.isles[k]);
}
main().catch((e) => { console.error(e); process.exit(1); });
