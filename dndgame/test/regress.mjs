// Playwright is not a dependency of this repo; point PLAYWRIGHT at your install
// if it is not on the default global path.
const PW = process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright/index.mjs';
const { chromium } = await import(PW);
const browser = await chromium.launch({
  executablePath: process.env.CHROME || undefined,
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 560 } });
// The browser asks every origin for /favicon.ico unprompted. The game does not
// ship one (no external assets), so that 404 is the server being honest, not the
// game being broken — it must not fail "boots with no errors".
const IGNORE = /favicon\.ico/i;
const errs=[]; page.on('pageerror',e=>errs.push(String(e.stack||e))); page.on('console',m=>{if(m.type()==='error'&&!IGNORE.test(m.location?.()?.url||''))errs.push('C:'+m.text());});
// Every module the browser actually asks for, so we can prove the import map in
// index.html is being honoured rather than silently ignored.
const asked = [];
page.on('request', (r) => { const u = r.url(); if (/\/src\/.*\.js(\?|$)/.test(u)) asked.push(u); });
const R = [];
const check = (name, ok, detail) => R.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
// GAME lets the same suite run against a copy of the game at another path, so a
// duplicate deployed to dodge a stale CDN is proved working rather than assumed.
const GAME = process.env.GAME || 'dndgame';
await page.goto(`${BASE}/${GAME}/index.html`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
check('boots with no errors', errs.length === 0, errs[0] || '');

// --- cache busting ---------------------------------------------------------
// A relative import does not inherit the query string of the module importing
// it, so a deploy can otherwise leave a browser running some modules from the
// new build and some from the old. index.html carries an import map pinning
// every module to a hash of its contents; these two checks are the difference
// between having written that map and having it actually take effect.
{
  const bare = asked.filter((u) => !/\?v=[0-9a-f]{8}$/.test(u));
  check('cache: every module is fetched content-hashed', bare.length === 0 && asked.length > 20,
    bare.length ? `unstamped: ${bare[0]}` : `${asked.length} modules`);

  const { spawnSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  // stamp.mjs owns dndgame/; a copy at another path carries the map it was copied with.
  // fileURLToPath, not .pathname: on Windows the latter yields "/C:/…", which node
  // cannot resolve, so this check failed for a reason that had nothing to do with
  // the import map.
  const r = spawnSync(process.execPath, [fileURLToPath(new URL('../tools/stamp.mjs', import.meta.url)), '--check'],
    { encoding: 'utf8' });
  check('cache: index.html import map is up to date', r.status === 0,
    (r.stderr || r.stdout || '').trim().split('\n')[0]);
}
await page.mouse.click(450,280); await page.waitForTimeout(400);

// --- char creation stash ---------------------------------------------------
const cc = await page.evaluate(() => {
  SC.newGame();
  const s = SC.Game.top;
  s.setClass('wizard');
  s.draft.skills = ['arcana','history'];
  s.draft.picks = { cantrip: ['fire-bolt'], spell1: ['magic-missile'] };
  const before = JSON.stringify([s.draft.skills, s.draft.picks]);
  s.setClass('rogue'); s.setClass('fighter'); s.setClass('wizard');
  const after = JSON.stringify([s.draft.skills, s.draft.picks]);
  s.setClass('cleric');
  const clean = s.draft.skills.length === 0 && Object.keys(s.draft.picks).length === 0;
  s.setClass('wizard');
  return { preserved: before === after, clean, restored: JSON.stringify([s.draft.skills, s.draft.picks]) === before };
});
check('charcreate: browsing classes preserves picks', cc.preserved);
check('charcreate: a fresh class starts clean', cc.clean);
check('charcreate: returning restores the stash', cc.restored);

const fb = await page.evaluate(() => {
  const s = SC.Game.top;
  s.warn('nope', 'next', 3);
  const shook = s.shakeX('next') !== 0 || s.shakeT > 0;
  const gap = s.firstIncomplete();
  return { shook, blamed: s.blameStep === 3, gap, locked: s.lockedReason(6).length > 0 };
});
check('charcreate: a refusal shakes and blames a step', fb.shook && fb.blamed);
check('charcreate: locked steps explain themselves', fb.locked);

// --- into the world --------------------------------------------------------
// "Randomise everything" must hand back a sheet the wizard will actually
// finish. It used to fill only the CLASS skill bucket, so any species trait or
// origin feat that added a second one left the player on a page they had never
// visited, with a CREATE button that refused.
const roll = await page.evaluate(() => {
  const out = [];
  for (let i = 0; i < 12; i++) {
    while (SC.Game.top && SC.Game.top.id === 'charcreate') SC.Game.pop();
    SC.newGame();
    const s = SC.Game.top;
    s.randomiseAll();
    const gap = s.firstIncomplete();
    if (gap >= 0) out.push(s.constructor.name + ' step ' + gap + ': ' + s.issue(gap));
  }
  while (SC.Game.top && SC.Game.top.id === 'charcreate') SC.Game.pop();
  return out;
});
check('charcreate: a randomised character is always complete', roll.length === 0, roll[0] || '12 rolls');

// start a clean wizard: the stash above holds deliberately bogus picks
await page.evaluate(() => {
  while (SC.Game.top && SC.Game.top.id === 'charcreate') SC.Game.pop();
  SC.newGame();
  const s = SC.Game.top;
  s.randomiseAll(); s.setClass('wizard'); s.draft.name='Reg'; s._autoFillPicks(); s.finish();
});
try {
  await page.waitForFunction(() => SC.Game.top && SC.Game.top.id === 'overworld', { timeout: 25000 });
} catch (e) {
  // A bare timeout tells you nothing; say what the wizard is actually stuck on.
  const why = await page.evaluate(() => {
    const s = SC.Game.top;
    if (!s || s.id !== 'charcreate') return 'top scene is ' + (s && s.id);
    const gap = s.firstIncomplete();
    return 'charcreate stuck on step ' + gap + ': ' + (gap >= 0 ? s.issue(gap) : s.message);
  });
  console.log('FAIL  reached the overworld  ' + why);
  console.log('page errors:', JSON.stringify(errs.slice(0, 3), null, 1));
  await browser.close();
  process.exit(1);
}
await page.waitForTimeout(500);

// --- weather never reaches the UI -----------------------------------------
const px = await page.evaluate(async () => {
  SC.FX.weather('snow', 1);
  await new Promise(r => setTimeout(r, 700));
  const m = await import('/dndgame/src/ui/menus.js');
  SC.Game.push(new m.InventoryScene());
  await new Promise(r => setTimeout(r, 500));
  // sample the top strip of the inventory panel for stray white weather motes.
  // The region is in logical px; the display's backing store is 2x that (the
  // stage composites 400x240 layers onto 800x480), so scale it to match.
  const cv = document.getElementById('game');
  const c = cv.getContext('2d');
  const k = cv.width / 400;
  const d = c.getImageData(30 * k, 30 * k, 340 * k, 60 * k).data;
  let bright = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] > 225 && d[i+1] > 235 && d[i+2] > 245) bright++;
  SC.Game.pop();
  return { bright, layer: SC.Game.scenes.length };
});
check('weather does not fall on the inventory', px.bright === 0, `${px.bright} snow pixels`);

// --- exits and edges -------------------------------------------------------
const ow = await page.evaluate(() => {
  const s = SC.Game.top;
  const mask = s._edgeMask();
  let rimmed = 0; for (const b of mask) if (b) rimmed++;
  const exits = s._visibleExits({ x: 0, y: 0 });
  const named = s._exitName((s.map.triggers||[]).find(t => t.kind === 'warp'));
  return { rimmed, total: mask.length, named };
});
check('overworld: walkable edges are rimmed', ow.rimmed > 100, `${ow.rimmed}/${ow.total} tiles`);
check('overworld: exits resolve a destination name', !!ow.named, ow.named);

// --- carried lights across time and map changes -----------------------------
const lamps = await page.evaluate(async () => {
  const { Lighting } = await import('/dndgame/src/render/lighting.js');
  const { NPCEntity, Entity } = await import('/dndgame/src/world/entity.js');
  const s = SC.Game.top;
  const guard = new NPCEntity({ id: 'lamp-test', role: 'guard', x: 2, y: 2 });
  const lamp = new Entity({ x: 3, y: 2, heldLight: 'torch' });
  const room = Object.assign(Object.create(s.map), { indoor: true });
  const cave = Object.assign(Object.create(s.map), { indoor: true, biome: 'cave' });
  const lit = (map, minutes, entities) => {
    Lighting.update({ map, minutes, cam: { x: 0, y: 0 }, entities });
    return Lighting.env.active.filter(x =>
      x.def === Lighting.kinds.handLantern || x.def === Lighting.kinds.torchHeld).length;
  };
  const out = {};
  try {
    out.noon = lit(s.map, 720, [guard]) === 0 && !guard.heldLightNow();
    out.night = lit(s.map, 1380, [guard]) === 1 && guard.heldLightNow() === 'lantern';
    out.indoor = lit(room, 1380, [guard]) === 0 && !guard.heldLightNow();
    out.outdoor = lit(s.map, 1380, [guard]) === 1;
    out.dawn = lit(s.map, 720, [guard]) === 0 && !guard.heldLightNow();
    out.explicit = lit(cave, 720, [lamp]) === 1;
    lamp.hidden = true;
    out.hidden = lit(cave, 720, [lamp]) === 0;
    lamp.hidden = false; lamp.removed = true;
    out.removed = lit(cave, 720, [lamp]) === 0;
    lamp.removed = false; lamp.px = 10000;
    out.offscreen = lit(cave, 720, [lamp]) === 0;

    // Check the real overworld selects a visible hand item, with magic taking
    // priority, and that the lead's light is not also counted as an NPC lamp.
    const time = SC.Game.state.time, carry = s._carry, spell = s.spellLight;
    const cam = { x: s.player.px - 200, y: s.player.py - 120 };
    try {
      SC.Game.state.time = 1380; s.spellLight = null;
      s._carry = { t: s.t, light: 'carried' }; s._lightFrame(cam);
      out.torch = s.player.heldLight === 'torch'
        && Lighting.env.active.filter(x => x.def === Lighting.kinds.carried).length === 1
        && !Lighting.env.active.some(x => x.def === Lighting.kinds.torchHeld
          && x.x === s._lightParty.x && x.y === s._lightParty.y);
      s._carry.light = 'lanternHeld'; s._lightFrame(cam);
      out.lantern = s.player.heldLight === 'lantern';
      s.spellLight = { radius: 32 }; s._lightFrame(cam);
      out.magic = s.player.heldLight === null && s._lightParty.light === 'spell';
      s.spellLight = null; SC.Game.state.time = 720; s._lightFrame(cam);
      out.stowed = s.player.heldLight === null;
    } finally {
      SC.Game.state.time = time; s._carry = carry; s.spellLight = spell;
    }
  } finally { s._lightFrame({ x: s.player.px - 200, y: s.player.py - 120 }); }
  return out;
});
check('lighting: guards light and stow lanterns on the first frame',
  lamps.noon && lamps.night && lamps.indoor && lamps.outdoor && lamps.dawn, JSON.stringify(lamps));
check('lighting: carried entity lights work underground and skip invisible entities',
  lamps.explicit && lamps.hidden && lamps.removed && lamps.offscreen);
check('lighting: party hand items follow torch, lantern, spell and daylight',
  lamps.torch && lamps.lantern && lamps.magic && lamps.stowed);

// --- casting outside combat ------------------------------------------------
const cast = await page.evaluate(() => import('/dndgame/src/rules/fieldcast.js').then(fc => {
  const ch = SC.Party.members[0];
  ch.spells.known = Array.from(new Set([...(ch.spells.known||[]), 'mage-armor','magic-missile']));
  ch.spells.prepared = Array.from(new Set([...(ch.spells.prepared||[]), 'mage-armor','magic-missile']));
  const ow = SC.Game.top;
  const env = { target: ch, party: SC.Party, state: SC.Game.state, world: ow.spellHooks() };
  const ac0 = ch.ac;
  const r = fc.fieldCast(ch, 'mage-armor', env);
  const ac1 = ch.ac;
  const burn = fc.fieldCast(ch, 'magic-missile', env);
  const slots = JSON.parse(JSON.stringify(ch.spells.slots || {}));
  // expiry
  SC.Game.state.day += 1;
  const gone = fc.expireFieldBuffs(SC.Party.all(), SC.Game.state);
  return { ac0, ac1, ok: r.ok, refused: !burn.ok, why: burn.text, slots, gone, acAfterExpiry: ch.ac,
    cond: (ch.conditions||[]).map(c=>c.id) };
}));
check('fieldcast: Mage Armor raises AC', cast.ok && cast.ac1 > cast.ac0, `${cast.ac0} -> ${cast.ac1}`);
check('fieldcast: Mage Armor is not the flat shielded condition', !cast.cond.includes('shielded'));
check('fieldcast: a damage spell is refused, no slot burnt', cast.refused && /aim it at/.test(cast.why||''), cast.why);
check('fieldcast: field buffs expire on the world clock', cast.gone.length > 0 && cast.acAfterExpiry === cast.ac0);

// --- attacking people ------------------------------------------------------
const crime = await page.evaluate(() => {
  const s = SC.Game.top;
  const child = s.entities.list.find(e => e.kind === 'npc' && e.sprite === 'npc-child');
  const adult = s.entities.list.find(e => e.kind === 'npc' && String(e.sprite||'').startsWith('npc-') && e.sprite !== 'npc-child');
  const out = { hasChild: !!child, hasAdult: !!adult };
  if (child) { s.player.setTile(child.x, child.y+1, 'up'); s.attackNPC(child); out.childBlocked = SC.Game.top.id === 'dialogue' && !SC.Game.state.crime.bounty['phandalin-hills']; while (SC.Game.top.id === 'dialogue') SC.Game.pop(); }
  return out;
});
check('crime: children cannot be attacked', crime.childBlocked !== false);

// --- the hotbar ------------------------------------------------------------
// The whole point of it: every verb the overworld has should be on screen with
// the key that does it, and none of it should need to be read in the source.
const bar = await page.evaluate(async () => {
  const ow = SC.Game.top;
  const ch = SC.Party.members[0];
  ch.spells = ch.spells || {};
  ch.spells.known = Array.from(new Set([...(ch.spells.known || []), 'mage-armor', 'blade-ward']));
  ch.spells.prepared = Array.from(new Set([...(ch.spells.prepared || []), 'mage-armor']));
  ch.spells.cantrips = Array.from(new Set([...(ch.spells.cantrips || []), 'blade-ward']));
  SC.Party.addItem('potion-healing', 2);
  ow._rebuildSlots();

  const out = { slots: ow._slots.map((x) => x.name) };

  // Facing nothing: both verbs greyed, and each says why.
  ow.player.setTile(ow.map.spawn.x, ow.map.spawn.y, 'up');
  const empty = ow._hotbarModel();
  out.idleAction = { on: empty.action.enabled, why: empty.action.why };
  out.idleAttack = { on: empty.attack.enabled, why: empty.attack.why };

  // Facing a townsfolk: Talk and Attack both light up.
  const t = ow.entities.list.find((e) => e.kind === 'npc'
    && String(e.sprite || '').startsWith('npc-') && e.sprite !== 'npc-child');
  if (t) {
    ow.player.setTile(t.x, t.y + 1, 'up');
    const m = ow._hotbarModel();
    out.npcAction = { label: m.action.label, on: m.action.enabled };
    out.npcAttack = { on: m.attack.enabled };
  }

  // Facing a child: Talk lights, Attack refuses with a reason.
  const kid = ow.entities.list.find((e) => e.kind === 'npc' && e.sprite === 'npc-child');
  if (kid) {
    ow.player.setTile(kid.x, kid.y + 1, 'up');
    const m = ow._hotbarModel();
    out.childAttack = { on: m.attack.enabled, why: m.attack.why };
  }

  // Every button is hit-testable where it is drawn. Counted against what the
  // bar actually lays out — one contextual verb, SLOT_COUNT quick slots and
  // however many menu buttons the model supplies — rather than a fixed total,
  // which went stale the moment the belt dropped from two verbs to one.
  // Drawn into the HUD's own stage layer, the way the engine draws it, so the
  // hit rects are the ones a real frame would build.
  const c = SC.Stage.ctx('hud');
  const model = ow._hotbarModel();
  ow.hotbar.draw(c, model);
  const HB = await import('/dndgame/src/ui/hotbar.js');
  out.slotCount = HB.SLOT_COUNT;
  out.menuCount = (model.menus || []).length;
  out.hitRects = ow.hotbar.hot.length;
  out.deadRects = ow.hotbar.hot.filter((r) => !(r.w > 0 && r.h > 0)).length;
  return out;
});
check('hotbar: fills slots, longest ward first', bar.slots[0] === 'Mage Armor', bar.slots.join(', '));
check('hotbar: idle verbs grey out with a reason',
  !bar.idleAction.on && !bar.idleAttack.on && !!bar.idleAttack.why, bar.idleAttack.why);
check('hotbar: facing a townsfolk lights Talk and Attack',
  bar.npcAction && bar.npcAction.label === 'Talk' && bar.npcAction.on && bar.npcAttack.on,
  JSON.stringify(bar.npcAction));
check('hotbar: attacking a child is refused, in words',
  !bar.childAttack || (!bar.childAttack.on && !!bar.childAttack.why),
  bar.childAttack && bar.childAttack.why);
check('hotbar: every button is clickable',
  bar.hitRects === 1 + bar.slotCount + bar.menuCount && bar.deadRects === 0,
  `${bar.hitRects} rects = 1 verb + ${bar.slotCount} slots + ${bar.menuCount} menus, ${bar.deadRects} zero-area`);

// --- the HUD's layouts -------------------------------------------------------
// Every preset must keep every shown widget on screen and clear of the others
// (the toasts and the place banner come and go, so only the standing panels
// are compared), and hiding a widget must take its hit area with it.
const hud = await page.evaluate(async () => {
  const { Layout } = SC;
  const ids = ['hud.party', 'hud.clock', 'hud.quest', 'hud.log', 'hud.minimap', 'hud.toolbar'];
  const out = { bad: [] };
  const was = SC.Save.settings.hudPreset || 'default';
  for (const p of Layout.presets) {
    Layout.applyPreset(p, 'overworld');
    const rs = ids.map((id) => ({ id, ...Layout.rect(id) })).filter((r) => r.visible);
    for (const r of rs) if (r.x < 0 || r.y < 0 || r.x + r.w > 400 || r.y + r.h > 240) out.bad.push(`${p}: ${r.id} off screen`);
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
      const a = rs[i], b = rs[j];
      if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) out.bad.push(`${p}: ${a.id} overlaps ${b.id}`);
    }
  }
  Layout.applyPreset('minimal', 'overworld');
  out.minimalHides = !Layout.visible('hud.minimap') && !Layout.visible('hud.quest') && Layout.visible('hud.toolbar');
  Layout.applyPreset(was, 'overworld');
  return out;
});
check('hud: every preset keeps the panels on screen and apart', !hud.bad.length, hud.bad.join('; '));
check('hud: minimal hides the map and quest, keeps the belt', hud.minimalHides);

// --- portrait captions -----------------------------------------------------
// The caption under a dialogue bust read `role`, an internal enum whose default
// is 'flavor' — so half the town was captioned with the word "flavor". It reads
// the authored title now, and every NPC in the game has one.
const caps = await page.evaluate(async () => {
  const ow = SC.Game.top;
  const mod = await import('/dndgame/src/ui/dialogue.js');
  const probe = new mod.DialogueScene('none', null, {});
  const rows = ow.entities.list.filter((e) => e.kind === 'npc')
    .map((e) => ({ name: e.name, caption: probe._captionFor(e) }));
  return {
    total: rows.length,
    bad: rows.filter((r) => !r.caption || /flavor|questgiver|innkeep\b/i.test(r.caption)),
    sample: rows.slice(0, 3).map((r) => `${r.name}: ${r.caption}`),
  };
});
check('dialogue: every portrait caption is prose, not an enum',
  caps.total > 0 && caps.bad.length === 0,
  caps.bad.length ? JSON.stringify(caps.bad[0]) : caps.sample[0]);

// --- the battle screen -----------------------------------------------------
const fight = await page.evaluate(async () => {
  const ow = SC.Game.top;
  for (const m of SC.Party.members) { m.maxHp = 300; m.hp = 300; }
  const t = ow.entities.list.find(e => e.kind === 'npc'
    && String(e.sprite || '').startsWith('npc-') && e.sprite !== 'npc-child');
  if (!t) return { err: 'no adult npc to fight' };
  ow.player.setTile(t.x, t.y + 1, 'up');
  ow.attackNPC(t);
  for (let i = 0; i < 200 && (!SC.Game.top || SC.Game.top.id !== 'battle'); i++) {
    await new Promise(r => setTimeout(r, 50));
  }
  const b = SC.Game.top;
  if (!b || b.id !== 'battle') return { err: 'never reached battle' };
  for (let i = 0; i < 300 && b.phase !== 'menu'; i++) await new Promise(r => setTimeout(r, 50));

  const out = { phase: b.phase };
  // Off-screen markers must be able to draw in the gutter beside the menu, not
  // under it — the whole point of them.
  const foes = b.enc.units.filter(u => u.side !== 'party');
  b._scanIndex = -1;
  b._scanFoes(1);
  out.scanHint = b.hint;
  out.scanPinned = !!b.inspectPinned;

  // The threat union must not be filtered by spent reactions.
  for (const f of foes) f._reactionUsed = true;
  b._recomputeReach(b.enc.current);
  out.threatWithSpentReactions = b.threat.size;

  // Aiming something out of range must name the creature and the reach.
  const atk = (b.options || []).find(o => o && o.kind === 'attack')
    || ((b.options || []).flatMap(o => o.sub || []).find(o => o && o.kind === 'attack'));
  if (atk) { b._explainNoTarget(b.enc.current, atk); out.noTargetHint = b.hint; }

  // A beat can be skipped.
  b.beats.push({ k: 'banner', dur: 99, text: 'x', sub: 'y' });
  b._updateBeats(0.016);
  const before = b.beats.length;
  b._skipBeat();
  b._updateBeats(0.016);
  out.skipped = b.beats.length < before;
  return out;
});
check('battle: scanning names a foe and pins the card',
  !fight.err && /\d+ft away/.test(fight.scanHint || '') && fight.scanPinned, fight.err || fight.scanHint);
check('battle: threat ignores spent reactions', (fight.threatWithSpentReactions || 0) > 0,
  `${fight.threatWithSpentReactions} tiles`);
check('battle: an unreachable target is explained', /ft/.test(fight.noTargetHint || ''), fight.noTargetHint);
check('battle: animation beats can be skipped', !!fight.skipped);

// --- save / load round trip ------------------------------------------------
const save = await page.evaluate(() => {
  SC.Game.state.crime.bounty['test-region'] = 123;
  SC.Game.state.crime.slain['someone'] = true;
  SC.writeSave(3);
  const ok = SC.continueGame(3);
  return { ok, bounty: SC.Game.state.crime && SC.Game.state.crime.bounty['test-region'],
    slain: !!(SC.Game.state.crime && SC.Game.state.crime.slain['someone']) };
});
check('save: the crime ledger round-trips', save.bounty === 123 && save.slain, JSON.stringify(save));


console.log(R.join('\n'));
console.log('\npage errors:', errs.length ? JSON.stringify(errs.slice(0,3), null, 1) : 'none');
await browser.close();
process.exit(R.some(r => r.startsWith('FAIL')) ? 1 : 0);
