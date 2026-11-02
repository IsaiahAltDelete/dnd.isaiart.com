// tools/queue-vfx-check.js — current-frame spell-light checks and in-game review captures for shot.mjs.
const { Game, Party, Stage, FX } = SC;
const { VFX } = await import('/src/render/vfx.js');
const { Lighting } = await import('/src/render/lighting.js');
const s = Game.scenes.find(s => s.id === 'overworld');
const checks = [], shots = [];
const check = (name, ok) => { checks.push({ name, ok: !!ok }); if (!ok) throw new Error(name); };
const capture = name => shots.push({ id: name, x: 0, y: 0, url: Stage.snapshot() });
const from = { x: s.player.px, y: s.player.py - 10 };
const to = { x: from.x + 75, y: from.y + 15 };
const original = { time: Game.state.time, mode: VFX.glowMode, strength: VFX.glowStrength };
try {
  Game.state.time = 1380;
  FX.clear(); VFX.reseed('queue-spell-light');
  const h = VFX.play('fire-bolt', { from, to, dtype: 'fire', blocking: true });
  VFX.update(0.08); Game._draw();
  const first = VFX.lights().map(l => ({ x: l.x, y: l.y }));
  check('spell produces a light in its first rendered frame', first.length > 0);
  check('same-frame grade contains the visible projectile light', first.every(l => Lighting.env.active.some(a => a.x === l.x && a.y === l.y)));
  capture('fire-bolt-first');
  VFX.update(0.08); Game._draw();
  const second = VFX.lights().map(l => ({ x: l.x, y: l.y }));
  check('travelling light advances with the projectile', second.some(l => !first.some(p => p.x === l.x && p.y === l.y)));
  check('grade follows the current projectile position', second.every(l => Lighting.env.active.some(a => a.x === l.x && a.y === l.y)));
  capture('fire-bolt-travel');
  VFX.glowMode = 'none'; Game._draw();
  check('disabled glows leave no spell pools', VFX.lights().length === 0);
  VFX.glowMode = original.mode;
  h.cancel(); Game._draw();
  check('cancel resolves blocking and removes light', !h.playing && !VFX.busy() && VFX.lights().length === 0);
  await Promise.all([h.impact, h.done]);

  for (const [id, dtype, time, age] of [['fireball', 'fire', 1380, 0.45], ['lightning-bolt', 'lightning', 1380, 0.14], ['cure-wounds', 'radiant', 720, 0.3]]) {
    FX.clear(); VFX.reseed('queue-' + id); Game.state.time = time;
    const effect = VFX.play(id, { from, to, dtype, radius: 35 });
    for (let t = 0; t < age; t += 0.01) VFX.update(0.01);
    Game._draw(); capture(id);
    for (let t = 0; t < 12; t += 0.05) VFX.update(0.05);
    Game._draw();
    check(id + ' completes without residual light', !effect.playing && VFX.lights().length === 0);
  }
} finally {
  FX.clear(); Game.state.time = original.time;
  VFX.glowMode = original.mode; VFX.glowStrength = original.strength;
}
window.QUEUE_VFX_CHECKS = checks;
return shots;
