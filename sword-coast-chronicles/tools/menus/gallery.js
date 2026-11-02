// tools/menus/gallery.js — shot.mjs page script: opens every menu-type scene in
// turn and returns Stage snapshots, so one browser run photographs them all.
//   $NODE tools/shot.mjs --scenario town --class wizard --script tools/menus/gallery.js --out output/menus/g.png
//   $NODE tools/menus/unpack.mjs output/menus/g.json output/menus/before
// Set window.GALLERY_ONLY (comma list of name prefixes, via --eval) to shoot a few.
// The party is seeded first (quests under way, one done, a level owed, some
// gear) so the journal, level-up and inventory pages have something to show.
const { Game, Stage } = window.SC;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const shots = [];
const only = String(window.GALLERY_ONLY || '').split(',').filter(Boolean);
const want = (n) => !only.length || only.some((o) => n.startsWith(o));
const snap = async (name, ms = 450) => { await wait(ms); shots.push({ name, url: Stage.snapshot() }); };
const popTo = (n) => { while (Game.scenes.length > n) Game.pop(); };
const base = Game.scenes.length;

// --- seed ------------------------------------------------------------------
try {
  const st = Game.state;
  const S = await import('/src/state.js');
  const Q = await import('/src/data/quests.js');
  for (const id of ['stonehill-cellar-rats', 'toblens-brother', 'pips-lost-cat']) {
    if (Q.QUESTS[id]) S.startQuest(st, Q.QUESTS[id]);
  }
  const first = st.quests.active[0];
  if (first && first.steps[0]) { first.steps[0].progress = first.steps[0].count || 1; first.steps[0].done = true; }
  if (st.quests.active[2]) S.completeQuest(st, st.quests.active[2].id);
  const P = window.SC.Party;
  for (const id of ['potion-healing', 'potion-healing', 'dagger', 'rope-hempen', 'torch', 'leather-armor', 'shortbow', 'arrow', 'potion-climbing']) {
    try { P.addItem(id, 1); } catch (e) {}
  }
} catch (e) { shots.push({ name: 'seed', err: String(e && e.stack || e) }); }

const M = await import('/src/ui/menus.js');
const scene = async (name, make, tweaks = [null]) => {
  if (!tweaks.some((t) => want(name + (t ? '-' + t[0] : '')))) return;
  try {
    const s = make(); Game.push(s);
    for (const t of tweaks) {
      const n = name + (t ? '-' + t[0] : '');
      if (t) { try { await t[1](s); } catch (e) { shots.push({ name: n, err: String(e) }); continue; } }
      if (want(n)) await snap(n);
    }
  } catch (e) { shots.push({ name, err: String(e && e.stack || e) }); }
  popTo(base);
  await wait(120);
};
const tab = (k, v) => [k + v, (s) => { s[{ t: 'tab', g: 'group', s: 'section' }[k]] = v; }];
await scene('pause', () => new M.PauseMenuScene());
await scene('party', () => new M.PartyScene(), [null, tab('s', 1), tab('s', 2), tab('s', 3), tab('s', 4), tab('s', 5)]);
await scene('inventory', () => new M.InventoryScene());
await scene('spellbook', () => new M.SpellbookScene());
await scene('journal', () => new M.JournalScene(), [null, tab('t', 1), tab('t', 2), tab('t', 3), tab('t', 4)]);
await scene('map', () => new M.MapScene());
await scene('options', () => new M.OptionsScene(), [null, tab('g', 1), tab('g', 2), ['g2b', (s) => { s.index[2] = 0; }], tab('g', 3), tab('g', 4), tab('g', 5),
  ['g5b', (s) => { s.index[5] = 3; }]]);
await scene('bestiary', () => {
  const st = Game.state;
  st.bestiary = Object.assign({ goblin: 3, wolf: 2, 'giant-rat': 5 }, st.bestiary || {});
  return new M.BestiaryScene();
}, [null, ['seen', (s) => { const L = s.list.length ? s.list : s._build(); s.index = Math.max(0, L.findIndex((e) => e.id === 'goblin')); }]]);
await scene('save', () => new M.SaveMenuScene('save'));
const Sh = await import('/src/ui/shop.js');
await scene('shop', () => new Sh.ShopScene('barthens-provisions'), [null, tab('t', 1)]);
const Ru = await import('/src/ui/restui.js');
await scene('rest', () => new Ru.RestScene('short'));
await scene('camp', () => new Ru.CampScene({}));
const Lu = await import('/src/ui/levelup.js');
await scene('levelup', () => {
  const ch = window.SC.Party.members[0];
  ch.flags = ch.flags || {}; ch.flags.pendingLevels = 1; ch.xp = Math.max(ch.xp || 0, 300);
  return new Lu.LevelUpScene([ch]);
}, [null, ['next', async (s) => { await wait(1200); if (s.phase === 'intro' && s._enterChoices) s._enterChoices(); }]]);
const Ch = await import('/src/ui/cheatmenu.js');
await scene('cheats', () => new Ch.CheatsScene());
if (want('dialogue')) {
  const ow = Game.scenes.find((s) => s.id === 'overworld');
  const D = await import('/src/ui/dialogue.js');
  const npcs = ow ? ow.entities.list.filter((e) => e.kind === 'npc' && !e.hidden) : [];
  const who = window.GALLERY_NPC || 'toblen-stonehill';
  const A = await import('/src/render/actor.js');
  const n = npcs.find((e) => e.npcId === who || e.id === who)
    || npcs.find((e) => A.portraitLook(e) && e.dialogueId && /the |of /i.test(e.title || '')) || npcs[0];
  const open = async (npc, id) => {
    const d = new D.DialogueScene(id, npc, {});
    Game.push(d);
    await wait(60);
    return d;
  };
  const finish = (d) => { const pg = d.pages && d.pages[d.page]; if (pg) d.shown = pg.length; };
  try {
    const d = await open(n, (n && n.dialogueId) || 'toblen');
    await snap('dialogue', 700);
    finish(d); await snap('dialogue-full', 200);
    for (let i = 0; i < 12 && d.mode === 'text' && Game.top === d; i++) { finish(d); d._advancePage(); }
    await snap('dialogue-choices', 300);
  } catch (e) { shots.push({ name: 'dialogue', err: String(e && e.stack || e) }); }
  popTo(base); await wait(150);
  const beast = npcs.find((e) => e.npcId && /ox|cat|dog|horse/.test(e.npcId)) || npcs.find((e) => /Ox|Cat/.test(e.name || ''));
  if (beast) {
    try { const d = await open(beast, beast.dialogueId || beast.npcId); finish(d); await snap('dialogue-beast', 500); } catch (e) { shots.push({ name: 'dialogue-beast', err: String(e) }); }
    popTo(base); await wait(150);
  }
}
if (want('cc')) {
  window.SC.newGame(); await wait(300);
  const c = Game.top;
  if (c.randomiseAll) c.randomiseAll();
  for (let i = 0; i < 12; i++) { c.gotoStep(i); await snap('cc-' + String(i).padStart(2, '0'), 380); }
  while (Game.top && Game.top.id === 'charcreate') Game.pop();
}
return { n: shots.length, shots };
