// tools/director-sim.mjs — run the world director headless for N in-game days and print what a player would find: the events, the rumours in each town, the work on offer, and whether that work can actually be finished.
//
//   $NODE tools/director-sim.mjs                 # 60 days, level ramps 1 -> 9, seed 'sim'
//   $NODE tools/director-sim.mjs --days 90 --seed abc --level 4 --play
//
// --play also plays the party through the work it is offered: accepts quests
// as they are posted, walks to them, "wins" their fights, makes the reports,
// and checks every one completes through state.js progressQuests — which is
// the acceptance test for the generator.

import { bus, EV } from '../src/core/events.js';
import { newGameState, advanceTime, progressQuests, recordKill, setFlag } from '../src/state.js';
import { noteDeed } from '../src/rules/deeds.js';
import * as D from '../src/rules/worlddirector.js';
import { NPCS } from '../src/data/npcs.js';
import { Party } from '../src/world/party.js';
import { dateText } from '../src/constants.js';

const A = { days: 60, seed: 'sim', level: 0, play: false };
for (let i = 2; i < process.argv.length; i++) {
  const k = process.argv[i].replace(/^--/, '');
  const v = process.argv[i + 1];
  if (k === 'play') { A.play = true; continue; }
  if (v !== undefined && !v.startsWith('--')) { A[k] = isNaN(+v) ? v : +v; i++; }
}

const st = newGameState(A.seed);
D.installDirector(() => st);
const levelOn = (d) => (A.level ? A.level : Math.min(9, 1 + Math.floor(d / 7)));
D.setDirectorLevel(st, levelOn(0));
D.advanceDirector(st);

const TOWNSFOLK = {
  phandalin: ['toblen-stonehill', 'elmar-barthen', 'sister-garaele', 'harbin-wester', 'daran-edermath', 'qelline-alderleaf', 'halia-thornton', 'narth'],
  neverwinter: ['general-sabine', 'esvele-dundragon'],
  waterdeep: ['durnan', 'volothamp-geddarm', 'mirt'],
  daggerford: ['morwen-daggerford', 'filarion-filvendorson', 'derval-ironeater'],
};

const played = [];      // quests the party took and how they ended
const out = (s = '') => process.stdout.write(`${s}\n`);

/** Walk the party through one quest's steps the way the game would report them. */
function playQuest(q) {
  const def = q.def;
  for (let guard = 0; guard < 12 && st.quests.active.includes(q); guard++) {
    const s = q.steps.find((x) => !x.done && (x.phase || 0) === Math.min(...q.steps.filter((y) => !y.done).map((y) => y.phase || 0)));
    if (!s) break;
    if (s.kind === 'reach') { st.mapId = s.target; bus.emit(EV.MAP_ENTER, { mapId: s.target }); progressQuests(st, 'reach', s.target, 1); }
    else if (s.kind === 'kill') { for (let i = 0; i < (s.count || 1); i++) recordKill(st, s.target); }
    else if (s.kind === 'collect') { Party.addItem(s.target, 1); progressQuests(st, 'collect', s.target, 1); }
    else if (s.kind === 'flag') {
      if (s.target.endsWith(':agreed')) D.negotiationResult(st, q.id, true, 'persuade'); else setFlag(st, s.target, true);
    } else if (s.kind === 'report' || s.kind === 'deliver') {
      if (s.item && Party.countItem(s.item) === 0) Party.addItem(s.item, 1);
      D.makeReport(st, q.id, s.target);
    }
    D.settleQuests(st);
  }
  return st.quests.done.includes(def.id);
}

// ---------------------------------------------------------------------------
out(`# Director simulation — seed '${A.seed}', ${A.days} days from ${dateText(st.day)}${A.play ? ', party playing' : ''}`);
const sampleDays = new Set([1, Math.floor(A.days / 3), Math.floor(2 * A.days / 3), A.days]);
const allPosted = new Map();

for (let d = 1; d <= A.days; d++) {
  D.setDirectorLevel(st, levelOn(d));
  advanceTime(st, 1440);
  // Ask around town, the way a player would.
  for (const list of Object.values(TOWNSFOLK)) for (const id of list) D.postingsFor(st, id);
  for (const list of Object.values(st.world.postings)) for (const p of list) if (!allPosted.has(p.id)) allPosted.set(p.id, { ...p.def, postedDay: st.day });
  if (A.play && d % 2 === 0) {
    const offers = Object.values(st.world.postings).flat().filter((p) => !p.taken).sort((a, b) => (b.event ? 1 : 0) - (a.event ? 1 : 0));
    const p = offers[0];
    if (p) {
      const q = D.acceptQuest(st, p.id);
      if (q) {
        const ok = playQuest(q);
        played.push({ day: st.day, title: q.title, kind: q.def.kind, giver: q.def.giver, ok, event: q.def.event });
      }
    }
    if (d % 6 === 0) noteDeed(st, { kind: 'rescue', target: 'toblen-stonehill', mapId: 'triboar-trail', weight: 3 });
    if (d % 9 === 0) noteDeed(st, { kind: 'kill', target: 'klarg', mapId: 'triboar-trail', weight: 4 });
  }
  if (sampleDays.has(d)) {
    out(`\n## Day ${d} — ${dateText(st.day)} (party level ${levelOn(d)})`);
    const sum = D.directorSummary(st);
    out(`Running: ${sum.events.map((e) => `${e.name} [${e.stage}]`).join('; ') || 'nothing'}`);
    out(`Control: ${Object.entries(sum.control).map(([k, v]) => `${k}=${v}`).join(', ')}`);
    for (const [town, ids] of Object.entries(TOWNSFOLK)) {
      out(`\n### Rumours in ${town}`);
      for (const id of ids.slice(0, 4)) {
        for (const r of D.rumorsFor(st, id)) out(`- ${NPCS[id].name} (${NPCS[id].role}): "${r.text}" [${r.kind}/${r.truth}${r.points.site ? `, points to ${r.points.site}` : ''}${r.points.quest ? ', leads to work' : ''}]`);
      }
    }
  }
}

out('\n## The event log (every event, how it began, each stage, how it ended)');
const names = {};
for (const e of st.world.eventLog) {
  names[e.ev] = names[e.ev] || e.text;
  if (e.what === 'start') out(`- ${dateText(e.day)} — START ${e.text}`);
  else if (e.what.startsWith('end:')) out(`- ${dateText(e.day)} — END (${e.what.slice(4)}) ${names[e.ev]}: ${e.text}`);
  else out(`- ${dateText(e.day)} —   ${names[e.ev]} -> ${e.what}`);
}

out('\n## The chronicle (world and party), oldest first');
for (const c of D.chronicle(st, { limit: 400 }).reverse()) out(`- ${c.date} — ${c.kind === 'party' ? '[party] ' : ''}${c.text}`);

out('\n## Ten quests the world generated');
const sample = [...allPosted.values()];
const pickTen = [];
const kinds = new Set();
for (const q of sample) if (!kinds.has(q.kind) && pickTen.length < 10) { kinds.add(q.kind); pickTen.push(q); }
for (const q of sample) if (pickTen.length < 10 && !pickTen.includes(q)) pickTen.push(q);
for (const q of pickTen) {
  out(`\n**${q.title}** — ${q.kind}, from ${NPCS[q.giver] ? NPCS[q.giver].name : q.giver}${q.event ? ` (for event ${q.event})` : ''}, posted ${dateText(q.postedDay)}`);
  out(`  ${q.desc}`);
  out(`  Steps: ${q.steps.map((s) => `[p${s.phase}] ${s.text}`).join(' / ')}`);
  out(`  Pays: ${q.rewards.gold} gp, ${q.rewards.xp} XP${q.rewards.items.length ? `, ${q.rewards.items.map((i) => i.id).join(', ')}` : ''}${q.rewards.rep.length ? `; standing ${q.rewards.rep.map((r) => `${r.id} ${r.amount > 0 ? '+' : ''}${r.amount}`).join(', ')}` : ''}`);
  if (q.site && q.site.pack) out(`  At ${q.site.name}: ${q.site.pack.map((e) => `${e.count}x ${e.id}`).join(', ')}`);
}
out(`\n${allPosted.size} distinct quests offered over ${A.days} days; kinds: ${[...new Set(sample.map((q) => q.kind))].join(', ')}`);

if (A.play) {
  out('\n## The party\'s run');
  for (const p of played) out(`- ${dateText(p.day)}: ${p.title} (${p.kind}, ${NPCS[p.giver] ? NPCS[p.giver].name : p.giver}) — ${p.ok ? 'COMPLETED' : 'NOT COMPLETED'}`);
  const bad = played.filter((p) => !p.ok);
  out(`\n${played.length - bad.length}/${played.length} completed through progressQuests. Party purse: ${Party.gold} gp.`);
  if (bad.length) process.exitCode = 1;
}
