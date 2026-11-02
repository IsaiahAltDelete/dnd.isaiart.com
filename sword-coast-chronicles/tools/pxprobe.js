// tools/pxprobe.js — a tools/shot.mjs --script probe that shows compiled PixelForge art inside the running game.
//
//   $NODE tools/shot.mjs --scenario town --script tools/pxprobe.js --frames 3 --every 180 --out output/px/probe.png
//   $NODE tools/shot.mjs --scenario town --hour 22 --script tools/pxprobe.js --out output/px/night.png
//
// It imports the generated modules (which register their sprites), then hooks
// the overworld: braziers with flames stand on the tiles either side of the
// hero's row two tiles down, drawn inside the world pass so the day/night grade falls on them, and
// a spell burst goes off above the hero's head on a loop. A gallery panel across
// the top shows every frame. To look at your own art, set the lists first:
//   --eval "window.PXPROBE = { modules: ['prop-anvil'], gallery: [[['prop-anvil', 2]]] }"
// Returns what registered, so the JSON report says whether the sprites exist.

const S = await import('/src/render/sprites.js');
const cfg = window.PXPROBE || {};
const modules = cfg.modules || ['fx-torch-flame', 'fx-impact-burst', 'prop-brazier'];
// The registry keeps what sprites.js draws; points, timing and recolours live on
// each module's export, which is where game code should read them too.
const ART = {};
for (const m of modules) ART[m] = (await import(`/src/render/art/${m}.js`)).default;
const { Game } = window.SC;
const ow = Game.scenes.find((s) => s.id === 'overworld');
if (!ow) return { error: 'no overworld scene (use --scenario town/map/forest)' };

const t0 = performance.now();
const now = () => (performance.now() - t0) / 1000;
const art = (id) => ART[id] || S.spriteDef(id);

// A lit brazier: the flame's base point sits on the brazier's `flame` point.
function brazier(ctx, x, y, kind, t) {
  const b = art('prop-brazier'), f = art('fx-torch-flame');
  if (!b || !f) return;
  S.drawSprite(ctx, `prop-brazier${kind}`, S.animFrame('prop-brazier', 'glow', t), x, y);
  const [px, py] = b.points.flame, [fx, fy] = f.points.base;
  S.drawSpriteAt(ctx, `fx-torch-flame${kind}`, S.animFrame('fx-torch-flame', 'burn', t),
    x - (b.w >> 1) + px - fx, y - b.h + py - fy);
}

const drawWorld = ow._drawSparkles;
ow._drawSparkles = function (ctx, cam) {
  drawWorld.call(this, ctx, cam);
  if (cfg.world === false) return;
  const t = now();
  // two tiles below the hero, clear of the gallery panel
  const x = Math.round(this.player.px - cam.x), y = Math.round(this.player.py - cam.y) + 32;
  if (art('prop-brazier')) {
    brazier(ctx, x - 32, y, '', t);
    brazier(ctx, x + 32, y, '-radiant', t + 0.13);
    brazier(ctx, x - 64, y, '-necrotic', t + 0.31);
    brazier(ctx, x + 64, y, '-cold', t + 0.47);
  }
  const burst = art('fx-impact-burst');
  if (burst) {
    const bt = t % (burst.anims.burst.ms / 1000 + 0.35);
    S.drawSprite(ctx, 'fx-impact-burst-fire', S.animFrame('fx-impact-burst', 'burst', bt), x, y + 4);
  }
};

// The gallery: rows of [sprite id, zoom], every frame of each, across the top.
const rows = cfg.gallery || [
  [['fx-torch-flame', 2], ['prop-brazier', 2], ['prop-brazier-radiant', 2]],
  [['fx-impact-burst', 1]],
  [['fx-impact-burst-cold', 1]],
];
const drawHud = ow.drawUI;
ow.drawUI = function (ctx) {
  // Staging toasts ("Journal updated.") would sit on top of the panel.
  if (cfg.gallery !== false) this.hud?.clearToasts?.();
  drawHud.call(this, ctx);
  if (cfg.gallery === false) return;
  const cells = [];
  let y = 4, maxX = 0;
  for (const row of rows) {
    let x = 6, h = 0;
    for (const [id, z] of row) {
      const d = art(id);
      if (!d) continue;
      for (const f of Object.keys(d.frames)) {
        cells.push([id, f, x, y, d.w * z, d.h * z]);
        x += d.w * z + 3;
      }
      h = Math.max(h, d.h * z);
      x += 6;
    }
    maxX = Math.max(maxX, x);
    y += h + 4;
  }
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#0c0a10';
  ctx.fillRect(2, 2, Math.min(396, maxX), y);
  for (const [id, f, x, cy, w, h] of cells) {
    const img = S.getSprite(id, f);
    if (img) ctx.drawImage(img, x, cy, w, h);
  }
  ctx.restore();
};

return {
  registered: S.allSpriteNames().filter((n) => modules.some((m) => n.startsWith(m))).length,
  frames: Object.fromEntries(modules.map((m) => [m, S.spriteFrames(m)])),
};
