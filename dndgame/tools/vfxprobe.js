// tools/vfxprobe.js — a tools/shot.mjs --script probe that screenshots vfxlab.html frame strips (shot.mjs only opens index.html).
//
//   $NODE tools/shot.mjs --scenario none --scale 4 --script tools/vfxprobe.js --out output/vfx/styles.png
//   $NODE tools/shot.mjs --scenario none --scale 4 --eval "window.VFXPROBE={set:'types',page:2}" --script tools/vfxprobe.js --out t.png
//   every page in one browser run: each --frames shot turns to the next page (shot.mjs awaits SHOT_NEXT)
//   $NODE tools/shot.mjs --scenario none --scale 4 --script tools/vfxprobe.js --frames 10 --every 200 --out output/vfx/styles.png
//
// VFXPROBE: { set: styles|types|spells, strip (frames, default 6), every ('auto' or ms),
//   zoom, bg: grass|stone|dusk, per (rows a page, default 6), page, filt }.
// The lab covers the game in an iframe; its page number is printed bottom right
// of every shot so a strip can be matched to its page. Returns the page count.

const cfg = Object.assign({ set: 'styles', strip: 6, every: 'auto', zoom: 1, bg: 'grass', per: 6, page: 0, scale: 2 }, window.VFXPROBE || {});
const q = new URLSearchParams({ shot: 1, set: cfg.set, strip: cfg.strip, every: cfg.every, zoom: cfg.zoom, bg: cfg.bg, per: cfg.per, page: cfg.page, scale: cfg.scale });
if (cfg.filt) q.set('filt', cfg.filt);
const f = document.createElement('iframe');
f.src = `/vfxlab.html?${q}`;
f.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;border:0;z-index:99999;background:#14131a';
document.body.appendChild(f);
const t0 = performance.now();
while (!(f.contentWindow && f.contentWindow.LAB && f.contentWindow.LAB.ready)) {
  if (performance.now() - t0 > 30000) return { error: 'vfxlab did not become ready' };
  await new Promise((r) => setTimeout(r, 50));
}
const LAB = f.contentWindow.LAB;
let k = cfg.page;
window.SHOT_NEXT = () => { if (k + 1 < LAB.pages) LAB.showPage(++k); };
return { pages: LAB.pages, count: LAB.count, page: cfg.page };
