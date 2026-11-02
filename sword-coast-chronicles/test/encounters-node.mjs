// test/encounters-node.mjs — headless checks for the encounter director: old saves, round trips, bounded state.
const { newGameState, saveState, loadState } = await import('../src/state.js');
const { Party } = await import('../src/world/party.js');
const { createCharacter, serializeChar, deserializeChar } = await import('../src/rules/character.js');
const M = await import('../src/world/maps.js');
const D = await import('../src/rules/encounters.js');
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) process.exitCode = 1; };

// 1. A save written before the director: no st.encounters at all.
const old = newGameState('pre-director');
Party.clear();
for (const c of ['fighter', 'cleric']) Party.add(createCharacter({ name: c, classId: c, level: 2 }));
const oldJson = JSON.parse(JSON.stringify(saveState(old, serializeChar)));
delete oldJson.encounters;
const st = loadState(oldJson, deserializeChar);
ok(st.encounters === undefined, 'an old save loads without the key');
const map = M.loadMap('triboar-trail', { state: st });
const ctx = D.contextFor(st, map, Party, {});
const insts = D.planMap(st, ctx);
ok(insts.length > 0 && !!st.encounters, `the director starts lazily on an old save (${insts.length} groups)`);

// 2. Play a little: walk, meet, settle, remember.
for (let i = 0; i < 600; i++) D.travelStep(st, ctx);
const first = insts[0];
const opts = D.standoffOptions(st, first, ctx, 'noticed');
const pick = opts.find((o) => o.id === 'talk') || opts.find((o) => o.id === 'leave') || opts[0];
const res = D.resolveOption(st, first, pick.id, ctx);
D.applyResult(st, first, res, ctx);
D.settle(st, first, 'passed');
D.addRumor(st, 'probe rumour', 'probe');

// 3. Round trip.
const json = JSON.parse(JSON.stringify(saveState(st, serializeChar)));
const st2 = loadState(json, deserializeChar);
const E1 = D.encounterState(st), E2 = D.encounterState(st2);
ok(E2.steps === E1.steps && E2.tension === E1.tension, `tension and steps survive (${E2.steps} steps, tension ${E2.tension.toFixed(1)})`);
ok(E2.rumors.some((r) => r.text === 'probe rumour'), 'rumours survive');
const again = D.planMap(st2, D.contextFor(st2, map, Party, {}));
ok(insts.every((i) => again.some((a) => a.uid === i.uid && a.leader.full === i.leader.full)), `the same cast (and the same names) is on the road after a reload (+${again.length - insts.length} who arrived since)`);
ok(again.find((i) => i.uid === first.uid).status === 'passed', 'a group you settled with stays settled');
ok(JSON.stringify(E2).length < 60000, `the director's state stays small (${JSON.stringify(E2).length} bytes)`);

// 4. The courier's letter: saved with a potion, carried to Sister Garaele, paid for.
const { progressQuests } = await import('../src/state.js');
D.hookQuests(() => st2, () => Party);
Party.addItem('potion-healing', 1);
const tctx = D.contextFor(st2, map, Party, {});
const courier = D.instantiate(st2, D.situation('harper-courier'), tctx, 'test:courier');
const saved = D.resolveOption(st2, courier, 'potion', tctx);
const extra = D.applyResult(st2, courier, saved, tctx);
ok(saved.outcome.kind === 'rout' && extra.some((l) => /^Quest:/.test(l)), `saving the courier starts her errand (${extra.join('; ')})`);
ok(!D.standoffOptions(st2, courier, tctx, 'settled').some((o) => o.id === 'tend'), 'a saved courier is not tended twice');
const left = D.resolveOption(st2, courier, 'leave', tctx);
ok(!left.fx.dead, 'walking away from a courier you saved does not kill her');
const before = Party.gold;
progressQuests(st2, 'talk', 'sister-garaele', 1);
ok(Party.gold > before && !st2.quests.active.some((q) => String(q.id).startsWith('enc-letter')), `the letter delivered pays (${Party.gold - before} gp)`);
