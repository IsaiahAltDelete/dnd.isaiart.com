// tools/encsim.mjs — a long journey across the Sword Coast's wild maps, headless, told as a story.
//
// Drives the encounter director (rules/encounters.js) and the groups it puts on the
// map (world/wayfarers.js) on the REAL maps, with a real four-person party, without
// a browser: a traveller walks the road from exit to exit, turns aside to meet the
// people it sees, answers standoffs by a simple temperament, fights when it comes
// to that (the battle itself is assumed won, most of the time), and the director
// does the rest. The output is the journey log a player would have lived.
//
//   NODE=node   # any Node 18+
//   $NODE tools/encsim.mjs                        # 60 minutes of play, normal pacing
//   $NODE tools/encsim.mjs --minutes 20 --pacing perilous --seed ashford --persona bold
//   $NODE tools/encsim.mjs --out output/encounters/journey.txt --quiet
//
// Personas: 'mixed' (default: talks first, pays small tolls, fights when pressed),
// 'diplomat' (never draws first), 'bold' (strikes first when it can).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => import(pathToFileURL(path.join(ROOT, 'src', p)).href);

const A = { minutes: 60, pacing: 'normal', ambush: 'normal', seed: 'sword-coast-journey', persona: 'mixed', out: null, quiet: false };
for (let i = 2; i < process.argv.length; i++) {
  const k = process.argv[i];
  if (!k.startsWith('--')) continue;
  const v = process.argv[i + 1];
  if (v === undefined || v.startsWith('--')) { A[k.slice(2)] = true; continue; }
  A[k.slice(2)] = v; i++;
}
A.minutes = Number(A.minutes);

const { registerCharacterSprites } = await src('render/spritedata_chars.js');
const { registerMonsterSprites } = await src('render/spritedata_monsters.js');
try { registerCharacterSprites(); registerMonsterSprites(); } catch (e) { /* art is not needed to simulate */ }
const { Game } = await src('engine.js');
const { newGameState, advanceTime } = await src('state.js');
const { Party } = await src('world/party.js');
const { createCharacter, restShort, restLong } = await src('rules/character.js');
const M = await src('world/maps.js');
const D = await src('rules/encounters.js');
const W = await src('world/wayfarers.js');
const { makeRNG } = await src('core/rng.js');
const { onDeed } = await src('rules/deeds.js');
const { timeOfDay } = await src('constants.js');

// --- the travellers ----------------------------------------------------------
const st = newGameState(A.seed);
Game.state = st;
st.time = 7 * 60;
const day0 = st.day;
Party._rest.short = restShort;
Party._rest.long = restLong;
const R = makeRNG(`${A.seed}:traveller`);
const CAST = [
  { name: 'Rowan Tallstag', classId: 'fighter', speciesId: 'human', backgroundId: 'soldier' },
  { name: 'Sister Kerri', classId: 'cleric', speciesId: 'human', backgroundId: 'acolyte' },
  { name: 'Merric Tealeaf', classId: 'rogue', speciesId: 'halfling', backgroundId: 'criminal' },
  { name: 'Aelar Liadon', classId: 'wizard', speciesId: 'elf', backgroundId: 'sage' },
];
// The company levels up between legs by being rebuilt at the map's level; the
// purse and the pack are theirs and ride through.
function recruit(level) {
  const gold = Party.gold, pack = Party.inventory.slice();
  Party.clear();
  for (const c of CAST) Party.add(createCharacter({ ...c, level }));
  Party.gold = gold;
  Party.inventory = pack;
}
recruit(2);
Party.addGold(120);
Party.addItem('rations', 8);
Party.addItem('potion-healing', 2);
Party.addItem('healers-kit', 1);

// --- the road -----------------------------------------------------------------
const ROUTE = ['triboar-trail', 'neverwinter-wood', 'conyberry-ruins', 'wave-echo-cave-entrance', 'triboar-trail',
  'trade-way-north', 'trade-way-south', 'fields-of-the-dead', 'coast-way-north', 'coast-way-south', 'rosymorn-monastery'];

const STEP = 0.16;                 // seconds per tile, walking
const CLOCK = 4 * STEP;            // in-game minutes per step (4 per real second)
let played = 0;                    // real seconds of play
const out = [];
const stats = { meetings: 0, fights: 0, beats: 0, telegraphs: 0, ambushes: 0, sprung: 0, arrivals: 0, placed: 0, bySit: {}, outcomes: {}, deeds: {} };
onDeed((d) => { stats.deeds[d.kind] = (stats.deeds[d.kind] || 0) + 1; });

const clock = () => {
  const h = Math.floor(st.time / 60), m = Math.floor(st.time % 60);
  return `Day ${st.day}, ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};
const say = (s = '') => { out.push(s); if (!A.quiet) console.log(s); };
const wrap = (s, ind = '    ') => {
  const words = String(s).split(/\s+/); const lines = []; let cur = '';
  for (const w of words) { if ((cur + ' ' + w).trim().length > 92) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
  if (cur) lines.push(cur);
  return lines.map((l) => ind + l).join('\n');
};

function spend(sec) { played += sec; advanceTime(st, sec * 4); }

// --- choosing ------------------------------------------------------------------
function choose(inst, opts, mode) {
  const has = (id) => opts.find((o) => o.id === id && !o.disabled);
  const pick = (...ids) => { for (const id of ids) { const o = has(id); if (o) return o; } return null; };
  const bold = A.persona === 'bold', dip = A.persona === 'diplomat';
  if (mode === 'sprung') return pick('attack') || opts[0];
  if (mode === 'unnoticed') {
    if (bold && R.chance(0.7)) return pick('ambush', 'hail');
    const r = R.float();
    if (inst.attitude === 'friendly' || inst.plea) return pick('hail');
    if (r < 0.35) return pick('shadow', 'sneak', 'hail');
    if (r < 0.7) return pick('sneak', 'hail');
    if (r < 0.85 && !dip) return pick('ambush', 'hail');
    return pick('hail', 'leave');
  }
  if (mode === 'settled') return pick('ask', 'leave') || opts[0];
  // The courier, the child, the pilgrims, the peddler: the obvious kindness first.
  const kind = pick('potion', 'tend', 'escort', 'carry', 'pray', 'donate', 'hunt');
  if (kind && !inst.done[kind.id]) return kind;
  if (!inst.done.talk && has('talk') && R.chance(0.8)) return has('talk');
  if (!inst.done.ask && has('ask') && R.chance(0.7)) return has('ask');
  if (has('remind')) return has('remind');
  if (has('help') && R.chance(bold ? 0.9 : 0.6)) return has('help');
  if (has('drive')) return has('drive');
  if (has('bargain') && !inst.offer) return has('bargain');
  if (inst.offer) return R.chance(0.5) ? pick('accept', 'refuse') : pick('refuse');
  if (has('trade') && !inst.done.trade && R.chance(0.3)) { inst.done.trade = true; return { id: '_browse', label: 'Browse their wares' }; }
  if (has('food') && (inst.mind !== 'reason' || R.chance(0.5))) return has('food');
  if (has('turn')) return has('turn');
  const pay = has('pay');
  if (pay && inst.demand <= Math.max(15, Party.gold * 0.2) && !bold) return pay;
  if (!dip && bold && has('attack') && inst.attitude === 'hostile') return has('attack');
  const talkers = ['haggle', 'persuade', 'intimidate', 'deceive', 'duel'].map(has).filter((o) => o && !inst.done[o.id]);
  if (talkers.length) return talkers[R.int(0, talkers.length - 1)];
  if (pay) return pay;
  if (inst.plea || inst.attitude === 'friendly') return pick('leave', 'refuse', 'accept');
  if (dip) return pick('surrender', 'flee', 'leave') || opts[0];
  return pick('leave', 'flee', 'attack') || opts[0];
}

// --- meeting a group -----------------------------------------------------------
function standoff(g, mode, ctx, why) {
  const inst = g.inst;
  stats.meetings++;
  stats.bySit[inst.sitId || 'pack'] = (stats.bySit[inst.sitId || 'pack'] || 0) + 1;
  D.noteMeeting(st, inst, mode);
  say(`${clock()} — ${ctx.name}. ${why}`);
  say(`  ${inst.name}: ${inst.leader.full}${inst.attitude ? ` (${inst.attitude})` : ''}`);
  if (mode === 'unnoticed') say(wrap(inst.spotted || 'You see them before they see you.'));
  if (mode === 'settled') say(wrap(inst.again));
  else {
    if (inst.why) say(wrap(inst.why));
    if (mode !== 'unnoticed' && inst.opener) say(wrap(inst.opener));
  }
  let guard = 0;
  let curMode = mode;
  while (guard++ < 8) {
    spend(8);
    const opts = D.standoffOptions(st, inst, ctx, curMode);
    const o = choose(inst, opts, curMode);
    if (!o) break;
    if (o.id === '_browse') { say('  > You look over what they have to sell.'); spend(20); continue; }
    let res = D.resolveOption(st, inst, o.id, ctx);
    if (D.canReroll(st, res)) { say(`  > ${o.label}: ${res.roll.text} — Heroic Inspiration, again...`); res = D.rerollOption(st, inst, res, ctx); }
    const extra = D.applyResult(st, inst, res, ctx);
    const rollTxt = res.roll ? ` [${res.roll.text}${res.roll.success ? ' — success' : ' — failure'}]` : '';
    say(`  > ${o.label}${rollTxt}`);
    for (const l of res.lines.slice(0, 3)) say(wrap(l, '      '));
    for (const l of extra) say(`      * ${l}`);
    const k = res.outcome.kind;
    if (k === 'menu') { if (curMode === 'unnoticed' && !res.keepUnnoticed) curMode = 'noticed'; continue; }
    if (k === 'noticed') { curMode = 'noticed'; continue; }
    stats.outcomes[k] = (stats.outcomes[k] || 0) + 1;
    if (k === 'fight') return fight(g, { ...res.outcome, option: o.id, mode: curMode }, ctx);
    if (o.id === 'escort') g.leave();
    else if (k === 'rout') g.rout();
    else if (k === 'retreat') { g.calmDown(); g.cooldown = 12; }
    else if (o.id === 'sneak' || (o.id === 'leave' && curMode === 'unnoticed')) { g.calmDown(); g.unseen = true; g.cooldown = 20; }
    else g.settle();
    return k;
  }
  g.settle();
  return 'pass';
}

function fight(g, o, ctx) {
  const inst = g.inst;
  stats.fights++;
  const foes = D.foesFor(inst, { champion: !!o.champion });
  const allies = D.alliesFor(st);
  const names = foes.map((f) => f.name);
  const won = R.chance(0.9);
  say(`  ! Battle: ${names.join(', ')}${o.allies ? `, with ${o.allies.map((a) => `${a[1]} ${a[0]}`).join(', ')} beside you` : ''}${allies.length ? ` (hired: ${allies.map((a) => a.count + ' ' + a.id).join(', ')})` : ''}${o.surprise === 'party' ? ' — you strike first' : o.mode === 'sprung' ? ' — you are surprised' : ''}. ${won ? 'Won.' : 'Beaten back; you flee.'}`);
  spend(150);
  const res = won ? { victory: true, defeated: foes, routed: R.chance(0.2) ? foes.slice(0, 1) : [] } : { fled: true, state: 'fled' };
  const lines = D.afterBattle(st, inst, res, ctx, { rescue: !!o.rescue, champion: !!o.champion, robbery: !!o.robbery });
  for (const l of lines) say(`      * ${l}`);
  if (won) { if (o.champion || (o.rescue && inst.plea === 'rescue')) g.settle(); else g.defeated(); }
  else { g.calmDown(); g.cooldown = 14; }
  return 'fight';
}

// --- walking a map ---------------------------------------------------------------
function ctxFor(map, p, extra = {}) {
  const onRoad = W.isRoad(map, p.x, p.y);
  return D.contextFor(st, map, Party, { pacing: A.pacing, ambush: A.ambush, onRoad, cover: !onRoad && W.isCover(map, p.x, p.y), ...extra });
}

function walkMap(mapId, fromId) {
  const map = M.loadMap(mapId, { state: st });
  const lvl = Math.max(1, map.level || 1);
  if (lvl !== Party.members[0].level) { recruit(lvl); }
  const exits = [];
  for (const t of map.triggersOfKind('warp')) if (!exits.some((e) => Math.abs(e.x - t.x) + Math.abs(e.y - t.y) < 5)) exits.push(t);
  const back = M.WORLD_NODES.find((n) => n.from === mapId && n.to === fromId);
  const start = (back && map.nearestWalkable(back.x, back.y, 5)) || map.spawn;
  let p = { x: start.x, y: start.y };
  const ctx0 = ctxFor(map, p);
  say('');
  say(`=== ${clock()} — ${map.name || mapId} (${ctx0.biome}, ${ctx0.night ? 'night' : timeOfDay(st.time)}, ${ctx0.weather}) ===`);
  const insts = D.planMap(st, ctxFor(map, p, { onRoad: false }));
  const groups = [];
  const avoid = { x: p.x, y: p.y };
  const place = (inst, near = null) => {
    const opts = { avoid, player: () => p, onGone: (gg) => { const i = groups.indexOf(gg); if (i >= 0) groups.splice(i, 1); } };
    const g = near ? W.placeGroupNear(inst, map, near, opts) : W.placeGroup(inst, map, opts);
    if (g) { groups.push(g); stats.placed++; }
    return g;
  };
  for (const inst of insts) {
    const g = place(inst);
    if (g) say(`  (on the map: ${inst.name} — ${inst.shape}${inst.status === 'passed' ? ', met before' : ''})`);
  }
  for (const rec of D.ashesOn(st, mapId)) { W.placeAshes(map, rec, { avoid }); say('  (the cold ashes of a camp you broke are still here)'); }

  // The far exit is where we are going; groups we have seen and are curious about come first.
  const far = exits.map((e) => map.nearestWalkable(e.x, e.y, 5)).filter(Boolean)
    .sort((a, b) => (Math.abs(b.x - p.x) + Math.abs(b.y - p.y)) - (Math.abs(a.x - p.x) + Math.abs(a.y - p.y)))[0];
  const visited = new Set();
  let target = far;
  let steps = 0;
  const maxSteps = 1600;
  const list = map.entityList;
  while (steps++ < maxSteps && played < A.minutes * 60) {
    // Turn aside toward anyone in sight we have not met.
    // A curious traveller: half the people it lays eyes on, it goes to meet.
    const seen = groups.find((g) => !visited.has(g) && !g.gone && g.leader
      && Math.max(Math.abs(g.leader.x - p.x), Math.abs(g.leader.y - p.y)) <= 8 && map.lineOfSight(p.x, p.y, g.leader.x, g.leader.y));
    if (seen) { visited.add(seen); if (R.chance(A.curious != null ? Number(A.curious) : 0.5)) target = { x: seen.leader.x, y: seen.leader.y, group: seen }; }
    if (target.group && (target.group.gone || !target.group.leader)) target = far;
    if (target.group) { target.x = target.group.leader.x; target.y = target.group.leader.y; }
    const path = map.findPath(p, target, { maxNodes: 4000, partial: true, avoid: (x, y) => map.entityBlocks(x, y) && !(x === target.x && y === target.y) });
    const next = path && path[0];
    const ctx = ctxFor(map, p);

    // Adjacent to the group we were making for: go and talk.
    if (target.group && Math.max(Math.abs(target.x - p.x), Math.abs(target.y - p.y)) <= 1) {
      const g = target.group;
      target = far;
      if (!g.gone) standoff(g, g.modeForInteract(), ctx, 'You go over to them.');
      continue;
    }
    if (!next || (next.x === p.x && next.y === p.y)) {
      if (Math.max(Math.abs(far.x - p.x), Math.abs(far.y - p.y)) <= 2) break;
      target = far;
    } else p = { x: next.x, y: next.y };
    if (list) list.player = p;

    // The world moves.
    spend(STEP);
    for (let k = 0; k < 2; k++) {
      if (list) list.update(STEP / 2, { player: p, phase: timeOfDay(st.time) });
      for (const g of groups.slice()) {
        g.update(STEP / 2, p, {
          st, night: ctx.night, weather: ctx.weather, onRoad: ctx.onRoad, cover: ctx.cover,
          stealth: (inst) => D.approachRoll(st, inst, ctx),
          hint: (text) => say(`${clock()} — ${text}`),
        });
      }
    }
    // Someone wants words with us.
    const asking = groups.find((g) => g.leader && g.leader.battleReady);
    if (asking) { asking.consumed(); standoff(asking, asking.pendingMode || 'noticed', ctx, 'They come to you.'); continue; }

    // The road itself.
    const ev = D.travelStep(st, ctx);
    if (!ev) continue;
    if (ev.kind === 'beat') {
      stats.beats++;
      say(`${clock()} — ${ev.text}`);
      if (ev.beat.act) { const r = D.beatAct(st, ev.beat, ctx); if (r.text) say(`      ${r.roll ? `[${r.roll.text}] ` : ''}${r.text}`); spend(5); }
    } else if (ev.kind === 'arrival') {
      if (place(ev.inst)) { stats.arrivals++; say(`${clock()} — ${D.arrivalLine(ev.inst)}`); }
    } else if (ev.kind === 'telegraph') {
      stats.telegraphs++;
      say(`${clock()} — ${ev.text}`);
    } else if (ev.kind === 'spring') {
      stats.ambushes++;
      const g = place(ev.inst, p);
      if (!g) continue;
      const sp = D.springAmbush(st, ev.inst, ctx);
      if (sp.mode === 'sprung') stats.sprung++;
      g.noticed = sp.mode !== 'unnoticed';
      standoff(g, sp.mode, ctx, sp.mode === 'sprung' ? 'AMBUSH.' : sp.mode === 'unnoticed' ? 'You spot the ambush before it springs.' : 'They step out of cover.');
    }
  }
  for (const g of groups.slice()) g.despawn();
  const exitNode = M.WORLD_NODES.filter((n) => n.from === mapId).sort((a, b) => (Math.abs(a.x - p.x) + Math.abs(a.y - p.y)) - (Math.abs(b.x - p.x) + Math.abs(b.y - p.y)))[0];
  return exitNode ? exitNode.to : null;
}

// --- the journey -----------------------------------------------------------------
say(`A journey of ${A.minutes} minutes' play, pacing '${A.pacing}', ambushes '${A.ambush}', a ${A.persona} company.`);
let prev = 'phandalin';
let leg = 0;
while (played < A.minutes * 60) {
  const mapId = ROUTE[leg % ROUTE.length];
  walkMap(mapId, prev);
  prev = mapId;
  leg++;
  spend(30);        // a town, an inn, a night's sleep between maps
  if (leg % 3 === 0) advanceTime(st, 8 * 60);
}

const E = D.encounterState(st);
say('');
say('=== the tally ===');
say(`real play ${Math.round(played / 60)} min; in-game ${st.day - day0} days`);
say(`meetings ${stats.meetings}, of which fights ${stats.fights} (${Math.round((100 * stats.fights) / Math.max(1, stats.meetings))}%)`);
say(`groups placed ${stats.placed}, arrivals ${stats.arrivals}, quiet beats ${stats.beats}, telegraphed ambushes ${stats.telegraphs} (sprung ${stats.sprung})`);
say(`outcomes ${JSON.stringify(stats.outcomes)}`);
say(`situations met ${Object.keys(stats.bySit).length}: ${Object.entries(stats.bySit).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`).join(', ')}`);
say(`deeds ${JSON.stringify(stats.deeds)}`);
say(`rumours heard ${E.rumors.length}, leads ${E.leads.length} (${E.leads.map((l) => `${l.sit}:${l.state}`).join(', ')}), leaders remembered ${E.memory.leaders.length}, quests ${Object.keys(E.quests).length}`);
if (A.out) { fs.mkdirSync(path.dirname(path.resolve(ROOT, A.out)), { recursive: true }); fs.writeFileSync(path.resolve(ROOT, A.out), out.join('\n')); }
