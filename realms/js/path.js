// A* pathfinding over the world grid (land caravans + sea lanes).
'use strict';

class MinHeap {
  constructor() { this.a = []; }
  push(node) {
    const a = this.a;
    a.push(node);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
  get size() { return this.a.length; }
}

const DIRS8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

// mode: 'land' (caravans/armies) or 'sea' (ships; endpoints may be land)
function findPath(world, sx, sy, tx, ty, mode = 'land', maxCost = 1e9) {
  const { W, H } = world;
  const start = sy * W + sx, target = ty * W + tx;
  if (start === target) return [start];
  const gScore = new Float32Array(W * H).fill(Infinity);
  const came = new Int32Array(W * H).fill(-1);
  const closed = new Uint8Array(W * H);
  gScore[start] = 0;
  const heap = new MinHeap();
  heap.push({ i: start, f: 0 });

  const tileCost = (i, prev) => {
    const b = world.biome[i];
    const info = BIOME_INFO[b];
    if (mode === 'sea') {
      if (info.water) return b === BIOME.SHALLOW ? 1.4 : 1.0;
      return i === target ? 1 : Infinity;
    }
    // land mode
    if (info.water) return Infinity;
    let c = info.moveCost;
    if (world.river[i] > 0) c += 0.8;                    // fords slow travel
    if (world.roadUse[i] > 2) c *= 0.55;                 // established roads
    else if (world.roadUse[i] > 0.5) c *= 0.75;
    return c;
  };

  let iter = 0;
  while (heap.size) {
    if (++iter > 30000) return null;
    const cur = heap.pop();
    const ci = cur.i;
    if (ci === target) {
      const path = [];
      let n = ci;
      while (n !== -1) { path.push(n); n = came[n]; }
      path.reverse();
      return path;
    }
    if (closed[ci]) continue;
    closed[ci] = 1;
    const cx = ci % W, cy = (ci / W) | 0;
    for (const [dx, dy] of DIRS8) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const ni = ny * W + nx;
      if (closed[ni]) continue;
      const tc = tileCost(ni, ci);
      if (tc === Infinity) continue;
      const stepLen = (dx && dy) ? 1.414 : 1;
      const g = gScore[ci] + tc * stepLen;
      if (g >= gScore[ni] || g > maxCost) continue;
      gScore[ni] = g;
      came[ni] = ci;
      const hx = nx - tx, hy = ny - ty;
      heap.push({ i: ni, f: g + Math.sqrt(hx * hx + hy * hy) });
    }
  }
  return null;
}

function pathCost(world, path, mode = 'land') {
  if (!path) return Infinity;
  let c = 0;
  for (let k = 1; k < path.length; k++) {
    const b = world.biome[path[k]];
    c += mode === 'sea' ? 1 : BIOME_INFO[b].moveCost;
  }
  return c;
}
