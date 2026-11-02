// tools/px/terrain-gallery.mjs — headless terrain sheets, no browser needed.
//
//   node tools/px/terrain-gallery.mjs <outdir> [swatch|field|scene|all] [KEY,KEY,...]
//
//   swatch  every variant (and animation frame) of each key, side by side, 4x
//   field   a 12x7 field of each key through the real position hash, 3x — the
//           view in which seams and 16px periodicity show up
//   scene   real map windows (ground, deco, over) drawn with drawTile, 2x. The
//           overworld's verge/AO/shadow passes are NOT run here; for those use
//           tools/px/terrain-capture.js through shot.mjs.
import './shim.mjs';
import { makeCanvas } from './shim.mjs';
import { writePNG } from './png.mjs';
import { mkdirSync } from 'node:fs';

const OUT = process.argv[2] || 'output/terrain/gallery';
const WHAT = process.argv[3] || 'all';
const KEYS = process.argv[4] ? process.argv[4].split(',') : null;
mkdirSync(OUT, { recursive: true });

const TL = await import('../../src/render/tiles.js');
const T = TL.T;

const DEFAULT_KEYS = [
  'GRASS', 'GRASS_2', 'GRASS_3', 'GRASS_4', 'CLOVER', 'FLOWERS_RED', 'FLOWERS_YELLOW', 'FLOWERS_BLUE', 'GRASS_TALL',
  'DIRT', 'DIRT_PATH', 'DIRT_PATH_RUT', 'COBBLE', 'GRAVEL', 'MUD', 'FARMLAND', 'CROP_WHEAT', 'CROP_CABBAGE',
  'SAND', 'SNOW', 'SNOW_GRASS', 'ICE', 'WATER', 'WATER_DEEP', 'SWAMP_WATER', 'SHORE_N', 'QUAY_N',
  'CAVE_FLOOR', 'CAVE_FLOOR_RUBBLE', 'DUNGEON_FLOOR', 'STONE_FLOOR_CRACKED', 'BONE_FLOOR', 'CLIFF_TOP',
];
const DECO_KEYS = [
  'TREE_OAK', 'TREE_PINE', 'DEAD_TREE', 'STUMP', 'BUSH', 'BERRY_BUSH', 'REEDS', 'CATTAILS', 'LILY_PAD',
  'ROCK', 'BOULDER', 'RUBBLE', 'CLIFF', 'CLIFF_N', 'CLIFF_S', 'MOUNTAIN', 'CAVE_WALL', 'CAVE_WALL_S',
  'MUSHROOM_RED', 'STALAGMITE', 'DRIFTWOOD', 'CRYSTAL',
];

function put(name, cv, scale) { writePNG(`${OUT}/${name}.png`, cv.data, cv.width, cv.height, scale); console.log(`${OUT}/${name}.png`); }

/** Deco tiles are shown on the ground they usually stand on, so shadows read. */
function groundFor(key) {
  if (/CAVE|STALAG|CRYSTAL|MUSHROOM/.test(key)) return T.CAVE_FLOOR;
  if (/LILY/.test(key)) return T.SWAMP_WATER ?? T.WATER;
  if (/REED|CATTAIL|DRIFT/.test(key)) return T.MUD;
  if (/CLIFF|MOUNTAIN|RUBBLE|BOULDER/.test(key)) return T.GRAVEL;
  return T.GRASS;
}

function swatch(keys, name) {
  const rows = keys.filter((k) => T[k] != null).map((k) => TL.tileDef(T[k]));
  // frame 0 of each variant, at most 16 across (animation: see `synth`)
  const cols = Math.min(16, Math.max(...rows.map((d) => d.variants)));
  const cv = makeCanvas(cols * 17 + 1, rows.length * 17 + 1);
  const cx = cv.getContext('2d');
  cx.fillStyle = '#1a1620'; cx.fillRect(0, 0, cv.width, cv.height);
  rows.forEach((d, j) => {
    for (let v = 0; v < Math.min(cols, d.variants); v++) {
      const x = 1 + v * 17, y = 1 + j * 17;
      if (d.layer !== 'ground') TL.drawTilePreview(cx, groundFor(d.key), x, y, 0, 0);
      TL.drawTilePreview(cx, d.id, x, y, 0.001, v);
    }
  });
  put(name, cv, 4);
}

function fields(keys) {
  const list = keys.filter((k) => T[k] != null);
  const fw = 12, fh = 7, per = 3;
  const cv = makeCanvas(per * (fw * 16 + 4), Math.ceil(list.length / per) * (fh * 16 + 4));
  const cx = cv.getContext('2d');
  cx.fillStyle = '#1a1620'; cx.fillRect(0, 0, cv.width, cv.height);
  list.forEach((k, n) => {
    const ox = (n % per) * (fw * 16 + 4), oy = Math.floor(n / per) * (fh * 16 + 4);
    const d = TL.tileDef(T[k]);
    for (let ty = 0; ty < fh; ty++) for (let tx = 0; tx < fw; tx++) {
      if (d.layer !== 'ground') TL.drawTile(cx, groundFor(k), ox + tx * 16, oy + ty * 16, 50 + tx, 50 + ty, 0);
      TL.drawTile(cx, d.id, ox + tx * 16, oy + ty * 16, 50 + tx, 50 + ty, 0);
    }
  });
  put('fields', cv, 3);
}

async function scenes() {
  const M = await import('../../src/world/maps.js');
  const STOPS = [
    ['phandalin', 12, 35], ['neverwinter-wood', 41, 30], ['triboar-trail', 59, 9], ['trade-way-north', 13, 47],
    ['ulgoths-beard', 12, 14], ['candlekeep-approach', 39, 32], ['wave-echo-cave-entrance', 12, 26],
    ['mere-of-dead-men', 50, 34], ['cragmaw-hideout', 17, 9], ['undermountain', 26, 20],
  ];
  for (const [id, cx0, cy0] of STOPS) {
    let map; try { map = M.loadMap(id); } catch (e) { console.log(id, 'failed', e.message); continue; }
    const x0 = Math.max(0, Math.min(map.w - 25, cx0 - 12)), y0 = Math.max(0, Math.min(map.h - 15, cy0 - 7));
    const cv = makeCanvas(400, 240), c = cv.getContext('2d');
    c.fillStyle = '#07060a'; c.fillRect(0, 0, 400, 240);
    for (const L of ['ground', 'deco', 'over']) {
      const plane = map[L]; if (!plane) continue;
      for (let y = 0; y < 15; y++) for (let x = 0; x < 25; x++) {
        const wx = x0 + x, wy = y0 + y; if (wx >= map.w || wy >= map.h) continue;
        const t = plane[wy * map.w + wx]; if (t) TL.drawTile(c, t, x * 16, y * 16, wx, wy, 0);
      }
    }
    put(`scene-${id}`, cv, 2);
  }
}

/**
 * Synthetic scenes: small hand-laid maps that put each terrain next to the ones
 * it meets in the game. Water edges resolve through autotileEdges (the member a
 * one- or two-sided bank would draw), which is close enough to judge the paint.
 * `frame` picks the animation time.
 */
function synth(frame = 0) {
  const W = 25, H = 15;
  const H6 = (x, y, s, n) => TL.tileHash(x, y, s) % n;
  const scenes = {
    // a pond with a deep core, a river leaving it, a bog corner with lilies
    pond: (x, y) => {
      const d = Math.hypot((x - 9) / 6.5, (y - 7) / 4.6);
      if (d < 0.55) return ['WATER_DEEP'];
      if (d < 1) return ['WATER'];
      if (x > 14 && Math.abs(y - (7 + Math.round(Math.sin(x * 0.5) * 1.5))) < 1) return ['WATER'];
      if (x > 17 && y > 10) return ['SWAMP_WATER', (x + y) % 3 === 0 ? 'LILY_PAD' : null];
      if (x > 16 && y > 9) return ['MUD', (x * 7 + y) % 4 === 0 ? 'REEDS' : ((x + y) % 5 === 0 ? 'CATTAILS' : null)];
      const t = ['GRASS', 'GRASS_2', 'GRASS', 'CLOVER', 'GRASS_3', 'GRASS_TALL'][H6(x, y, 5, 6)];
      const deco = H6(x, y, 9, 11) === 0 ? 'TREE_OAK' : (H6(x, y, 9, 13) === 0 ? 'BUSH' : null);
      return [t, deco];
    },
    // a wood: every species in clumps, stacked columns, a 2x2 oak and pine
    wood: (x, y) => {
      const g = ['GRASS', 'GRASS_2', 'GRASS', 'CLOVER', 'GRASS_TALL'][H6(x, y, 5, 5)];
      if (x >= 2 && x <= 3 && y >= 2 && y <= 3) return [g, ['OAK_TL', 'OAK_TR', 'OAK_BL', 'OAK_BR'][(y - 2) * 2 + (x - 2)]];
      if (x >= 20 && x <= 21 && y >= 9 && y <= 10) return [g, ['PINE_TL', 'PINE_TR', 'PINE_BL', 'PINE_BR'][(y - 9) * 2 + (x - 20)]];
      const band = Math.floor(x / 5);
      const sp = ['TREE_OAK', 'TREE_PINE', 'TREE_BIRCH', 'TREE_WILLOW', 'TREE_OAK'][band];
      const dense = Math.hypot((x % 5) - 2, (y % 7) - 3) < 2.2 + (H6(x, y, 3, 3) * 0.3);
      if (y === 13) return [g, ['DEAD_TREE', 'STUMP', 'BUSH', 'BERRY_BUSH', 'ROCK'][band]];
      if (y === 14) return [g, x % 2 ? 'BOULDER' : null];
      return [g, dense ? (H6(x, y, 4, 7) === 0 ? 'BUSH' : sp) : null];
    },
    // a cliff mass on grass and gravel, rocks, rubble, a mountain skyline
    rock: (x, y) => {
      if (y === 0) return ['GRASS', 'MOUNTAIN'];
      const g = x < 12 ? 'GRASS' : 'GRAVEL';
      const inCliff = Math.hypot((x - 7) / 5, (y - 5) / 3) < 1 || (x > 14 && x < 21 && y > 2 && y < 6);
      if (inCliff) return [g, 'CLIFF'];
      if (y > 10 && x < 8) return ['CLIFF_TOP', null];
      if (y === 12) return [g, ['ROCK', 'BOULDER', 'RUBBLE', null][x % 4]];
      return [g, H6(x, y, 8, 17) === 0 ? 'ROCK' : null];
    },
    // a cave: wall masses round a room, floors, rubble, a puddle, stalagmites
    cave: (x, y) => {
      const room = Math.hypot((x - 12) / 10, (y - 7) / 5.5) < 1 && !(x > 5 && x < 9 && y > 3 && y < 7);
      if (!room) return ['CAVE_FLOOR', 'CAVE_WALL'];
      const f = x < 12 ? (H6(x, y, 2, 5) === 0 ? 'CAVE_FLOOR_RUBBLE' : 'CAVE_FLOOR') : (y < 7 ? 'DUNGEON_FLOOR' : (H6(x, y, 2, 3) === 0 ? 'STONE_FLOOR_CRACKED' : 'STONE_FLOOR'));
      const d = H6(x, y, 6, 19);
      return [f, d === 0 ? 'STALAGMITE' : d === 1 ? 'RUBBLE' : d === 2 ? 'BONES' : d === 3 ? 'ROCK' : null];
    },
  };
  for (const name of Object.keys(scenes)) {
    const cells = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) cells.push(scenes[name](x, y));
    const map = { w: W, h: H, ground: cells.map((q) => T[q[0]]), deco: cells.map((q) => (q[1] && T[q[1]]) || 0), inBounds: (x, y) => x >= 0 && y >= 0 && x < W && y < H };
    TL.resolveTileMasses(map);
    const cv = makeCanvas(W * 16, H * 16), c = cv.getContext('2d');
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let id = map.ground[y * W + x];
      if (TL.tileGroup(id) === 'water' && id !== T.SWAMP_WATER) id = TL.autotileEdges(map, x, y, id).tile;
      TL.drawTile(c, id, x * 16, y * 16, x, y, frame / 3 + 0.01);
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const id = map.deco[y * W + x]; if (id) TL.drawTile(c, id, x * 16, y * 16, x, y, frame / 3 + 0.01); }
    put(`synth-${name}-f${frame}`, cv, 2);
  }
}

if (WHAT === 'synth') { synth(0); synth(1); }
if (WHAT === 'synth1') synth(0);
if (WHAT === 'swatch' || WHAT === 'all') { swatch(KEYS || DEFAULT_KEYS, 'swatch-ground'); if (!KEYS) swatch(DECO_KEYS, 'swatch-deco'); }
if (WHAT === 'field' || WHAT === 'all') fields(KEYS || DEFAULT_KEYS.concat(DECO_KEYS));
if (WHAT === 'scene' || WHAT === 'all') await scenes();
