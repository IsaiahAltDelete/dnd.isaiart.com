// tools/hudprobe.js — a tools/shot.mjs --script probe that stages the overworld HUD with a full, busy party.
//
//   $NODE tools/shot.mjs --scenario town --script tools/hudprobe.js --out output/hud/town.png
//   $NODE tools/shot.mjs --scenario town --eval "window.HUDPROBE={preset:'minimal'}" --script tools/hudprobe.js --out m.png
//
// Adds three companions (cleric, rogue, fighter) to the quick hero, wounds two,
// drops one to death saves, gives out conditions and a ward, starts and tracks
// a quest, raises a toast and a log line, and (when the tree has it) a bark.
// Options on window.HUDPROBE: preset, arrange ('drag' opens Arrange mode with a
// widget mid-drag), bark (false to skip), toast (false to skip), walk (true
// leaves the leader walking, for the cinematic preset).
// Written to run against any tree, so the same probe photographs main for a
// before/after pair: anything the tree lacks is skipped, not thrown.

const cfg = window.HUDPROBE || {};
const { Game, Party, bus, EV } = window.SC;
const C = await import('/src/rules/character.js');
const ow = Game.scenes.find((s) => s.id === 'overworld');
const out = { members: 0 };

const crew = [
  { name: 'Aldith Tanner', classId: 'cleric', speciesId: 'human', level: 3 },
  { name: 'Tamsin Brushgather', classId: 'rogue', speciesId: 'halfling', level: 3 },
  { name: 'Brottor Ironfist', classId: 'fighter', speciesId: 'dwarf', level: 3 },
];
for (const o of crew) {
  if (Party.members.length >= 4) break;
  try {
    const ch = C.createCharacter({ ...o, kind: 'pc' });
    if (C.recalc) C.recalc(ch);
    Party.add(ch);
  } catch (e) { out.err = String(e); }
}
const M = Party.members;
out.members = M.length;
// Wounds and states worth showing: a scratch, a bad hit, a member on death saves.
if (M[1]) { M[1].hp = Math.max(1, Math.round(M[1].maxHp * 0.62)); M[1].conditions = ['poisoned']; }
if (M[2]) { M[2].hp = 0; M[2].deathSaves = { success: 1, fail: 1 }; M[2].conditions = ['unconscious']; }
if (M[3]) { M[3].hp = Math.max(1, Math.round(M[3].maxHp * 0.2)); M[3].effects = [{ id: 'bless', name: 'Bless' }]; }
if (M[0] && M[0].spells && M[0].spells.slots && M[0].spells.slots[1]) M[0].spells.slots[1].used = 1;
Party.gold = 1284;

// A tracked quest with a target somewhere else, so the tracker has a heading.
try {
  const { startQuest } = await import('/src/state.js');
  const { QUESTS } = await import('/src/data/quests.js');
  const st = Game.state;
  const q = startQuest(st, QUESTS['deliver-barthens-supplies']);
  if (q) st.quests.tracked = q.id;
  out.quest = q && q.id;
} catch (e) { out.qerr = String(e); }

if (ow) {
  // Park the leader where the view is busy but the HUD corners are not special.
  if (cfg.tile && ow.player) ow.player.setTile(cfg.tile[0], cfg.tile[1], 'down');
  // Face the nearest townsperson, so the interact hint shows its verb.
  if (cfg.face && ow.player && ow.entities) {
    const n = ow.entities.list.filter((e) => e.kind === 'npc' && !e.hidden && String(e.sprite || '').startsWith('npc-'))
      .sort((a, b) => Math.hypot(a.x - ow.player.x, a.y - ow.player.y) - Math.hypot(b.x - ow.player.x, b.y - ow.player.y))[0];
    if (n) { ow.player.setTile(n.x, n.y + 1, 'up'); out.facing = n.npcId; }
  }
  // As if the party had walked about a while: the minimap has something to show.
  if (cfg.explore && ow.map && ow.map.revealAround) ow.map.revealAround(ow.player.x, ow.player.y, cfg.explore);
  if (cfg.toast !== false) {
    bus.emit(EV.TOAST, { text: 'Tamsin found 12 gp in the gutter', kind: 'gold' });
    bus.emit(EV.LOG, { text: 'The Stonehill Inn is to the north-east.', kind: 'quest' });
  }
  if (cfg.bark !== false && ow.hud && typeof ow.hud.bark === 'function') {
    const npc = (ow.entities && ow.entities.list || []).find((e) => e.kind === 'npc' && !e.hidden
      && String(e.sprite || '').startsWith('npc-') && e.npcId !== out.facing
      && Math.abs(e.x - ow.player.x) < 10 && Math.abs(e.y - ow.player.y) < 6);
    if (npc) ow.hud.bark(npc, cfg.barkText || 'Mind the cart, friend!', { ttl: 8 });
    ow.hud.bark(ow.player, 'Onward to the Trail.', { ttl: 8, kind: 'party' });
    out.bark = !!npc;
    // Every kind at once, on the nearest folk, plus one on a bare tile.
    if (cfg.barkAll) {
      const folk = (ow.entities.list || []).filter((e) => e.kind === 'npc' && !e.hidden && e !== npc)
        .sort((a, b) => Math.hypot(a.x - ow.player.x, a.y - ow.player.y) - Math.hypot(b.x - ow.player.x, b.y - ow.player.y));
      const lines = [['shout', 'Thief! Stop that halfling!'], ['whisper', 'Psst. Not here. The Redbrands are watching.'],
        ['hostile', 'You picked the wrong road, stranger.'], ['thought', 'Is that the Stonehill Inn?'], ['say', 'Fresh bread, two coppers!']];
      lines.forEach(([kind, s], i) => { if (folk[i]) ow.hud.bark(folk[i], s, { ttl: 9, kind }); });
      ow.hud.bark({ x: ow.player.x + 3, y: ow.player.y + 2 }, 'Something glints in the mud.', { ttl: 9, kind: 'thought' });
    }
  }
  if (cfg.preset) {
    const { Layout } = window.SC;
    if (Layout.applyPreset) out.preset = Layout.applyPreset(cfg.preset, 'overworld');
    if (window.SC.Save && window.SC.Save.settings) window.SC.Save.settings.hudPreset = cfg.preset;
  }
  // Raise the place banner afresh (with a sub line), to film it unrolling.
  if (cfg.banner) ow.banner = { text: cfg.banner, sub: cfg.bannerSub || 'Dusk', t: 0 };
  // Skin, a Found slip, the pointer parked somewhere, a click on the minimap.
  if (cfg.theme) { const { UI } = await import('/src/ui/kit.js'); UI.setTheme(cfg.theme, false); }
  if (cfg.popup) ow.popup = { title: 'Found', lines: ['Potion of Healing ×2', '14 gp', 'A rusted iron key'], t: 0, life: 60 };
  if (cfg.mouse) { const m = window.SC.Input.mouse; m.over = true; m.x = cfg.mouse[0]; m.y = cfg.mouse[1]; }
  if (cfg.zoomClick && ow.hud) {
    const r = window.SC.Layout.rect('hud.minimap');
    const m = window.SC.Input.mouse;
    for (let i = 0; i < cfg.zoomClick; i++) { m.over = true; m.x = r.x + 10; m.y = r.y + 10; m.clicked = true; ow.hud.update(0.016); }
    out.zoom = window.SC.Save.settings.minimapZoom;
  }
  // A blow to the leader `hurt` ms in: the flash, then the ghost draining.
  if (cfg.hurt && M[0]) {
    setTimeout(() => {
      M[0].hp = Math.max(1, Math.round(M[0].maxHp * 0.35));
      bus.emit(EV.DAMAGE, { target: M[0], amount: 6 });
    }, cfg.hurt);
  }
  // Keep the party "walking" (for the cinematic preset's fade).
  if (cfg.walk && ow.hud) setInterval(() => { ow.hud._walkT = 0; }, 50);
  // One preset after another, `presetEvery` ms apart, for --frames N --every M.
  if (Array.isArray(cfg.presetSeq)) {
    const { Layout } = window.SC;
    cfg.presetSeq.forEach((p, i) => setTimeout(() => {
      Layout.applyPreset(p, 'overworld');
      if (p === 'cinematic' && ow.hud) setInterval(() => { ow.hud._walkT = 0; }, 50);
    }, i * (cfg.presetEvery || 1500)));
  }
  if (cfg.arrange) {
    const { Layout, Input } = window.SC;
    Layout.beginArrange(ow);
    // Grab a widget (the minimap unless told otherwise) and hold it part-way
    // to a new home.
    const r = Layout.rect(cfg.arrangeId || 'hud.minimap');
    const [dx, dy] = cfg.drag || [-120, -64];
    const m = Input.mouse;
    m.over = true; m.x = r.x + 8; m.y = r.y + 8; m.clicked = true; m.down = true;
    Layout.updateArrange(0.016);
    m.x += dx; m.y += dy; m.clicked = false;
    Layout.updateArrange(0.016);
    out.arrange = Layout.editing;
  }
}
return out;
