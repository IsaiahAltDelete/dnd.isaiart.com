// tools/lightgallery.js — page script for shot.mjs: stages the lighting acceptance views and returns them as one contact sheet.
//
//   $NODE tools/shot.mjs --scenario town --script tools/lightgallery.js --json output/lighting/g.json --wait 50
//   $NODE tools/lightgallery-sheet.mjs output/lighting/g.json output/lighting/after     # -> after.png + after-<view>.png
//
// One browser run, every view: travel, set the hour and the sky, let a few frames
// settle, grab the WORLD at 1x (the display is 2x; nearest-neighbour halving gives
// back the world pixels exactly). The HUD is hidden so the light is what you judge.
// `window.LG_VIEWS` (set with --eval) replaces the default list; `window.LG_HUD`
// keeps the interface on; `window.LG_PERF` also times frames in each view.
const { Game } = window.SC;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = performance.now(); while (!fn()) { if (performance.now() - t > ms) return false; await wait(50); } return true; };
const ow = () => Game.scenes.find((s) => s.id === 'overworld');
const { travelTo } = await import('/src/world/overworld.js');
const { Stage } = await import('/src/render/stage.js');
const { FX } = await import('/src/render/fx.js');
const { Atmosphere } = await import('/src/render/atmosphere.js');
const { Lighting } = await import('/src/render/lighting.js');

const VIEWS = window.LG_VIEWS || [
  { name: 'phandalin-noon', map: 'phandalin', hour: 12 },
  { name: 'phandalin-dusk', map: 'phandalin', hour: 18.6 },
  { name: 'phandalin-night', map: 'phandalin', hour: 23 },
  { name: 'phandalin-rain', map: 'phandalin', hour: 23, weather: 'rain' },
  { name: 'phandalin-torch', map: 'phandalin', hour: 1, torch: true },
  { name: 'wood-dawn', map: 'neverwinter-wood', hour: 6 },
  { name: 'dungeon', map: 'redbrand-hideout', hour: 23 },
  { name: 'dungeon-torch', map: 'redbrand-hideout', hour: 23, torch: true },
  { name: 'inn-night', map: 'stonehill-inn', hour: 22 },
  { name: 'cave', map: 'cragmaw-hideout', hour: 12 },
];
// The rest of the air: tools/shot.mjs --eval "window.LG_SET='air'"
const AIR = [
  { name: 'trail-noon', map: 'triboar-trail', hour: 13, day: 126 },
  { name: 'wood-summer-night', map: 'neverwinter-wood', hour: 23, day: 200 },
  { name: 'wood-fog', map: 'neverwinter-wood', hour: 10, weather: 'fog' },
  { name: 'trail-snow', map: 'triboar-trail', hour: 15, weather: 'snow' },
  { name: 'phandalin-storm-day', map: 'phandalin', hour: 14, weather: 'storm' },
  { name: 'inn-day', map: 'stonehill-inn', hour: 11 },
];
const SET = window.LG_SET === 'air' ? AIR : window.LG_SET === 'all' ? VIEWS.concat(AIR) : VIEWS;

// With LG_PERF, time the light and air passes themselves (ms per frame), so a
// busy shared machine's noise in the whole frame does not hide what they cost.
const cost = { light: 0, air: 0, frames: 0 };
if (window.LG_PERF) {
  const wrap = (obj, name, key) => {
    const f = obj[name];
    obj[name] = function (...args) { const t0 = performance.now(); try { return f.apply(this, args); } finally { cost[key] += performance.now() - t0; } };
  };
  for (const n of ['update', 'drawGrade', 'drawGlow']) wrap(Lighting, n, 'light');
  for (const n of ['update', 'drawGround', 'drawAir', 'drawGlow']) wrap(Atmosphere, n, 'air');
  const up = Lighting.update;
  Lighting.update = function (...a) { cost.frames++; return up.apply(this, a); };
}

if (!window.LG_HUD) for (const id of ['hud', 'overlay', 'debug']) try { Stage.set(id, { visible: false }); } catch (e) { /* older stage */ }

const out = [];
const shots = [];
for (const v of SET) {
  const s0 = ow();
  if (!s0 || !s0.map || s0.map.id !== v.map || v.x != null) {
    travelTo(v.map, v.x, v.y, v.dir || 'down');
    await until(() => ow() && ow().map && ow().map.id === v.map && !Game.transitioning);
    await wait(250);
  }
  const s = ow();
  try {
    const { Party } = window.SC;
    const has = Party.hasItem('torch');
    if (v.torch && !has) Party.addItem('torch', 1);
    if (!v.torch && has) Party.removeItem('torch', Party.countItem('torch'));
    s._carry = null;
  } catch (e) { /* ignore */ }
  if (Game.state) {
    Game.state.time = Math.round(v.hour * 60);
    Game.state.weather = v.weather || 'clear';
    if (v.day) Game.state.day = v.day;
  }
  if (s && s.map) s.map.weather = null;
  try { s._applyWeather(true); } catch (e) { /* ignore */ }
  try { FX.weather(v.weather || 'none', v.weather ? 0.8 : 0); } catch (e) { /* ignore */ }
  // FX finishes fading the old sky before it takes the new one; wait for it.
  await until(() => FX.weatherKind === (v.weather || 'none'), 4000);
  await wait(120);
  if (s) s._airSnap = true;                     // the sky as it would be after a while, not fading in
  await wait(v.weather ? 900 : 500);
  let perf = null;
  if (window.LG_PERF) {
    const ms = [];
    cost.light = 0; cost.air = 0; cost.frames = 0;
    for (let i = 0; i < 40; i++) {
      const t0 = performance.now();
      try { Game._draw ? Game._draw() : null; } catch (e) { /* ignore */ }
      ms.push(performance.now() - t0);
      await wait(16);
    }
    ms.sort((a, b) => a - b);
    const per = (v) => +(v / Math.max(1, cost.frames)).toFixed(2);
    perf = { median: +ms[20].toFixed(2), p90: +ms[36].toFixed(2), fps: Game.fps, light: per(cost.light), air: per(cost.air) };
  }
  const url = Stage.snapshot();
  const img = new Image();
  await new Promise((r) => { img.onload = r; img.onerror = r; img.src = url; });
  const c = document.createElement('canvas');
  c.width = 400; c.height = 240;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(img, 0, 0, 400, 240);
  shots.push({ name: v.name, canvas: c });
  const A = Atmosphere.state, E = Lighting.env;
  const air = { rain: +A.rainAmt.toFixed(2), snow: +A.snowAmt.toFixed(2), fog: +A.fogAmt.toFixed(2), leaf: +A.leafAmt.toFixed(2), fly: +A.flyAmt.toFixed(2), ray: +A.rayAmt.toFixed(2), cloud: +A.cloudAmt.toFixed(2), w: E.weather, lights: +E.lights.toFixed(2), n: E.active.length };
  out.push({ name: v.name, map: s && s.map && s.map.id, time: Game.state && Game.state.time, air, perf, fails: [...(Game._drawFails || [])].length });
}

// Contact sheet: two columns, labelled.
const cols = 2, rows = Math.ceil(shots.length / cols), lab = 10;
const sheet = document.createElement('canvas');
sheet.width = 400 * cols + (cols - 1) * 4;
sheet.height = rows * (240 + lab) + (rows - 1) * 4;
const sg = sheet.getContext('2d');
sg.fillStyle = '#111'; sg.fillRect(0, 0, sheet.width, sheet.height);
sg.imageSmoothingEnabled = false;
shots.forEach((sh, i) => {
  const x = (i % cols) * 404, y = Math.floor(i / cols) * (244 + lab);
  sg.fillStyle = '#ddd'; sg.font = '8px monospace'; sg.fillText(sh.name, x + 2, y + 8);
  sg.drawImage(sh.canvas, x, y + lab);
});
return { views: out, sheet: sheet.toDataURL('image/png'), each: shots.map((s) => ({ name: s.name, url: s.canvas.toDataURL('image/png') })) };
