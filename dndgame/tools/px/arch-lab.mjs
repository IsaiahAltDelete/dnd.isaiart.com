// tools/px/arch-lab.mjs — the architecture bench, headless (no browser).
//
//   node tools/px/arch-lab.mjs scene <out.png> <mapId> <cx> <cy> [w=25] [h=15] [scale=3]
//        a window of a real map, built by loadMap (so resolveArch has run), drawn
//        ground / deco / over with drawTile, plus the overworld's eave band so a
//        roof reads as it does in game. The AO, sun-shadow and verge passes are
//        NOT run here; use tools/px/arch-capture.js through shot.mjs for those.
//   node tools/px/arch-lab.mjs sheet <out.png> KEY,KEY,... [variants=8] [ground=COBBLE]
//        every variant of each key on a ground tile, 6x.
import './shim.mjs';
import { makeCanvas } from './shim.mjs';
import { writePNG } from './png.mjs';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const [, , MODE = 'scene', OUT = 'output/arch/lab.png', ...rest] = process.argv;
mkdirSync(path.dirname(OUT), { recursive: true });
const TL = await import('../../src/render/tiles.js');
const T = TL.T;

if (MODE === 'gallery') {
  // A synthetic street of every building type, built with the real mapkit and
  // resolved exactly as loadMap resolves a map.
  const { TileMap } = await import('../../src/world/tilemap.js');
  const K = await import('../../src/world/mapkit.js');
  const W = 50, H = 30;
  const map = new TileMap({ w: W, h: H, id: 'gallery', name: 'Gallery', biome: 'city' });
  const g = T.GRASS, road = T.DIRT_PATH, cob = T.COBBLE;
  for (let i = 0; i < W * H; i++) map.ground[i] = g;
  for (let x = 0; x < W; x++) for (const y of [12, 13, 26, 27]) map.ground[y * W + x] = y < 20 ? road : cob;
  K.building(map, { x: 1, y: 5, w: 8, h: 7, wall: 'WATTLE_WALL', roof: 'thatch', lit: true, roofRows: 3, door: 3, windows: [1, 5, 6], upper: [1, 3, 6], sign: 2, trade: 'inn', band: 4, chimney: 6, porch: 3, lantern: true, peak: 1 });
  K.building(map, { x: 10, y: 6, w: 7, h: 6, wall: 'TIMBER_WALL', roof: 'slate', roofRows: 2, door: 3, windows: [1, 5], sign: 4, trade: 'goods', chimney: 1, dormer: [2, 4], loading: [5] });
  K.building(map, { x: 18, y: 8, w: 6, h: 4, wall: 'SHED_WALL', roof: 'shingle', roofRows: 2, open: true, inside: [[1, 'FORGE'], [2, 'FORGE'], [4, 'HAY']], chimney: 1 });
  K.building(map, { x: 25, y: 6, w: 7, h: 6, wall: 'STONE_WALL', roof: 'slate', roofRows: 3, door: 3, stained: [1, 5], lit: false });
  K.tower(map, { x: 32, y: 3, w: 3, h: 9, wall: 'STONE_WALL', roof: 'slate', windows: [3, 5], door: 1 });
  K.building(map, { x: 36, y: 7, w: 7, h: 5, wall: 'PLASTER_WALL', roof: 'thatch', roofRows: 2, door: 2, windows: [4], shutters: [5], stalls: [], chimney: 5 });
  K.building(map, { x: 43, y: 7, w: 6, h: 5, wall: 'LOG_WALL', roof: 'shingle', roofRows: 2, stalls: [1, 2, 4], windows: [], upper: [] });
  K.building(map, { x: 1, y: 18, w: 9, h: 8, wall: 'BRICK_WALL', roof: 'tile', roofRows: 3, door: 4, windows: [1, 2, 6, 7], lit: true, band: 5, chimney: 1, chimney2: 7, wings: [{ dx: 9, dy: 3, w: 3, h: 5, roof: 'tile', windows: [1] }] });
  K.tower(map, { x: 13, y: 20, w: 2, h: 6, wall: 'BRICK_WALL', roof: 'tile', windows: [3] });
  K.building(map, { x: 16, y: 20, w: 6, h: 6, wall: 'STONE_WALL', roof: 'shingle', roofRows: 2, door: 2, windows: [1, 4], sign: 4, trade: 'arms', lit: true, chimney: 4 });
  K.building(map, { x: 23, y: 21, w: 5, h: 5, wall: 'WATTLE_WALL', roof: 'tile', roofRows: 2, door: 2, windows: [1, 3], sign: 3, trade: 'potion' });
  K.noticeBoard(map, 29, 25);
  K.building(map, { x: 31, y: 19, w: 8, h: 7, wall: 'TIMBER_WALL', roof: 'tile', roofRows: 3, door: 4, windows: [1, 2, 6], upper: [1, 3, 5, 6], band: 4, lit: true, sign: 6, trade: 'coin', chimney: 1, dormer: [3, 5] });
  K.building(map, { x: 40, y: 21, w: 5, h: 5, wall: 'STONE_WALL', roof: 'thatch', roofRows: 2, door: 2, windows: [1, 3], chimney: 3, sign: 1, trade: 'bread' });
  map.recomputeFlags({ keep: 0 });
  TL.resolveArchitecture(map);
  const cv = makeCanvas(W * 16, H * 16), c = cv.getContext('2d');
  for (const L of ['ground', 'deco']) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const t = map[L][y * W + x]; if (t) TL.drawTile(c, t, x * 16, y * 16, x, y, 0.3); }
  for (let y = 1; y < H; y++) for (let x = 0; x < W; x++) {
    const up = map.over[(y - 1) * W + x], me = map.over[y * W + x];
    if (!up || me || !(TL.tileFlags(up) & 1)) continue;
    [0.34, 0.24, 0.15, 0.08, 0.03].forEach((a, s) => { c.fillStyle = `rgba(20,14,20,${a})`; c.fillRect(x * 16, y * 16 + s, 16, 1); });
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const t = map.over[y * W + x]; if (t) TL.drawTile(c, t, x * 16, y * 16, x, y, 0.3); }
  writePNG(OUT, cv.data, W * 16, H * 16, +(rest[0] || 2));
  console.log(OUT);
} else if (MODE === 'sheet') {
  const keys = (rest[0] || 'THATCH_M').split(',').filter((k) => T[k] != null);
  const nv = +(rest[1] || 8), ground = T[rest[2] || 'COBBLE'];
  const W = nv * 17 + 1, H = keys.length * 17 + 1;
  const cv = makeCanvas(W, H), c = cv.getContext('2d');
  c.fillStyle = '#1a1620'; c.fillRect(0, 0, W, H);
  keys.forEach((k, j) => {
    const d = TL.tileDef(T[k]);
    for (let v = 0; v < nv; v++) {
      const x = 1 + v * 17, y = 1 + j * 17;
      if (d.layer !== 'ground') TL.drawTilePreview(c, ground, x, y, 0, v);
      TL.drawTilePreview(c, d.id, x, y, 0.001 + v * 0.26, v % d.variants);
    }
  });
  writePNG(OUT, cv.data, W, H, 6);
  console.log(OUT, keys.length, 'keys');
} else {
  const M = await import('../../src/world/maps.js');
  const [id, cx0, cy0, vw = 25, vh = 15, sc = 3] = rest;
  const map = M.loadMap(id, { cache: false });
  const w = +vw, h = +vh;
  const x0 = Math.max(0, Math.min(map.w - w, +cx0 - (w >> 1))), y0 = Math.max(0, Math.min(map.h - h, +cy0 - (h >> 1)));
  const cv = makeCanvas(w * 16, h * 16), c = cv.getContext('2d');
  c.fillStyle = '#07060a'; c.fillRect(0, 0, w * 16, h * 16);
  const layer = (L) => {
    const plane = map[L]; if (!plane) return;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const wx = x0 + x, wy = y0 + y; if (wx >= map.w || wy >= map.h) continue;
      const t = plane[wy * map.w + wx]; if (t) TL.drawTile(c, t, x * 16, y * 16, wx, wy, 0);
    }
  };
  layer('ground'); layer('deco');
  // the eave band _drawOverhangs drops below every solid over tile
  const ramp = [0.34, 0.24, 0.15, 0.08, 0.03];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const wx = x0 + x, wy = y0 + y;
    if (wy < 1 || wx >= map.w || wy >= map.h) continue;
    const up = map.over[(wy - 1) * map.w + wx], me = map.over[wy * map.w + wx];
    if (!up || me || !(TL.tileFlags(up) & 1)) continue;
    ramp.forEach((a, s) => { c.fillStyle = `rgba(20,14,20,${a})`; c.fillRect(x * 16, y * 16 + s, 16, 1); });
  }
  // actors would stand here: mark NPC feet so a layout can be judged with people in it
  for (const e of map.entities || []) {
    if (!e || !e.npcId) continue;
    const x = e.x - x0, y = e.y - y0;
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(x * 16 + 4, y * 16 + 13, 8, 2);
    c.fillStyle = '#e8d8b0'; c.fillRect(x * 16 + 6, y * 16 + 1, 4, 4);
    c.fillStyle = '#8a4a3a'; c.fillRect(x * 16 + 5, y * 16 + 5, 6, 8);
  }
  layer('over');
  writePNG(OUT, cv.data, w * 16, h * 16, +sc);
  console.log(OUT, `${id} @ ${x0},${y0}`);
}
