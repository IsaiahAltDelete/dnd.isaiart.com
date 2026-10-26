// tools/px/terrain-capture.js — page script for tools/shot.mjs --script: tours the
// terrain before/after locations in ONE browser run and returns a PNG data URL of
// the world (HUD hidden) at each, so a whole gallery costs a single browser slot.
// Decode the report with tools/px/terrain-decode.mjs. Edit STOPS to change the tour.
const STOPS = [
  ['phandalin', 12, 35], ['phandalin', 30, 22],
  ['neverwinter-wood', 41, 30], ['neverwinter-wood', 22, 18],
  ['triboar-trail', 59, 9], ['trade-way-north', 13, 47],
  ['ulgoths-beard', 12, 14], ['candlekeep-approach', 39, 32],
  ['rosymorn-monastery', 12, 27], ['wave-echo-cave-entrance', 12, 26],
  ['mere-of-dead-men', 50, 34], ['icespire-peak', 40, 39],
  ['nashkel-mines', 12, 35], ['cragmaw-hideout', 17, 9], ['undermountain', 12, 7],
];
const { Game, cheat } = window.SC;
// Peaceful: an ambush halfway round the tour would photograph a battle instead.
try { cheat.nofight(true); } catch (e) { /* older builds */ }
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = performance.now(); while (!fn()) { if (performance.now() - t > ms) return false; await wait(50); } return true; };
const { travelTo } = await import('/src/world/overworld.js');
const ow = () => Game.scenes.find((s) => s.id === 'overworld');
const canvas = document.getElementById('game');
const out = [];
for (const [id, x, y] of STOPS) {
  try {
    travelTo(id, x, y, 'down');
    await until(() => ow() && ow().map && ow().map.id === id && !Game.transitioning);
    const s = ow();
    if (Game.state) Game.state.time = 12 * 60;
    s.drawUI = () => {};
    await wait(700);
    out.push({ id, x, y, url: canvas.toDataURL('image/png') });
  } catch (e) { out.push({ id, x, y, err: String(e) }); }
}
return out;
