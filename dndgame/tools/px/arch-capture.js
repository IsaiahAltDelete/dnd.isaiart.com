// tools/px/arch-capture.js — page script for tools/shot.mjs --script: tours the
// architecture before/after locations (town centres, districts, interiors, day
// and night) in ONE browser run and returns a PNG data URL of the world (HUD
// hidden) at each. Decode with tools/px/terrain-decode.mjs. x/y null = map centre.
// Set window.ARCH_STOPS with --eval before the script to change the tour.
const STOPS = (window.ARCH_STOPS || [
  ['phandalin', 21, 26, 12], ['phandalin', 33, 31, 12], ['phandalin', 10, 31, 12], ['phandalin', 40, 30, 12],
  ['phandalin', 21, 26, 22], ['phandalin', 33, 31, 22],
  ['neverwinter', 32, 12, 12], ['neverwinter', 15, 18, 12], ['neverwinter', 32, 12, 22],
  ['waterdeep', 21, 17, 12], ['waterdeep', 35, 16, 12], ['waterdeep', 35, 16, 22],
  ['bg-temples-district', 24, 14, 12], ['bg-temples-district', 22, 33, 12], ['bg-temples-district', 24, 14, 22],
  ['stonehill-inn', null, null, 12], ['lionshield-coster', null, null, 12], ['shrine-of-luck', null, null, 12],
  ['daggerford-smithy', null, null, 12], ['sleeping-giant', null, null, 12], ['townmasters-hall', null, null, 12],
  ['barthens-provisions', null, null, 12], ['stonehill-inn', null, null, 22],
]);
const { Game, cheat } = window.SC;
try { cheat.nofight(true); } catch (e) { /* older builds */ }
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = performance.now(); while (!fn()) { if (performance.now() - t > ms) return false; await wait(50); } return true; };
const { travelTo } = await import('/src/world/overworld.js');
const { loadMap } = await import('/src/world/maps.js');
const ow = () => Game.scenes.find((s) => s.id === 'overworld');
const canvas = document.getElementById('game');
const out = [];
for (const [id, x0, y0, hour] of STOPS) {
  try {
    let x = x0, y = y0;
    if (x == null) { const m = loadMap(id, { state: Game.state }); x = m.w >> 1; y = m.h >> 1; }
    travelTo(id, x, y, 'down');
    await until(() => ow() && ow().map && ow().map.id === id && !Game.transitioning);
    const s = ow();
    if (Game.state) Game.state.time = (Math.floor((Game.state.time || 0) / 1440) * 1440) + hour * 60;
    s.drawUI = () => {};
    await wait(800);
    out.push({ id: `${id}-h${hour}`, x, y, url: canvas.toDataURL('image/png') });
  } catch (e) { out.push({ id, x: x0, y: y0, err: String(e && e.stack || e) }); }
}
return out;
