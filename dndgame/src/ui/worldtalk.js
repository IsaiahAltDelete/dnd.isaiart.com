// ui/worldtalk.js — the world director in conversation: the news a person has heard, the work they are offering, the job you came back to report, and the other side of a quarrel you were sent to settle.
//
// Every one of these is a ui/topics.js topic, so it turns up on the opening
// menu of anyone it applies to, written or not: Toblen has his tree and the
// news besides; a farmhand with one greeting line now also has gossip. The
// trees are built fresh when the topic is picked, from rules/worlddirector.js,
// so what people say moves with the world (and with what the party did).
// world/sites.js reuses the builders for the strangers it stages.

import { toast } from '../core/events.js';
import { hashStr } from '../core/rng.js';
import { registerTopic } from './topics.js';
import * as D from '../rules/worlddirector.js';
import { SITES } from '../data/worldevents.js';
import { FACTION_CONTRACTS } from '../data/quests.js';
import { NPCS } from '../data/npcs.js';
import { resolveItem } from '../data/items.js';
import { hasFlag, currentPhase } from '../state.js';

const titleCase = (s) => String(s || '').replace(/-/g, ' ').replace(/\b[a-z]/g, (c) => c.toUpperCase());
const npcName = (id) => (NPCS[id] && NPCS[id].name) || titleCase(id);
const itemName = (id) => { try { return (resolveItem(id) || {}).name || titleCase(id); } catch (e) { return titleCase(id); } };
/** A stable pick, so one person says one thing per visit rather than a new thing per click. */
const pickBy = (list, ...salt) => list[hashStr(salt.join(':')) % list.length];

/** People only: an ox has no news, and a quest's own captive has one thing on their mind. */
function isPerson(ctx) {
  const r = ctx.record;
  if (r) return r.role !== 'animal' && !r.beast && r.tag !== 'animal' && r.tag !== 'beast';
  return !!(ctx.npc && ctx.npc.kind === 'npc');
}

// ===========================================================================
// THE NEWS
// ===========================================================================

const NOTHING = [
  'Nothing worth the breath. It has been a quiet tenday, Tymora be thanked.',
  'Nothing I would swear to. Ask at the inn — they hear everything there first.',
  'Not a thing. Which, around here, usually means something is about to happen.',
];
const ASKS = ['What\'s the news?', 'Heard anything lately?', 'What are people saying?'];
const BELIEVE = ['Do you believe that?', 'Who told you that?', 'You\'re sure of it?'];

/** The rumours this person gives, as a tree: one per node, "What else?" to the next. */
export function newsTree(ctx) {
  const st = ctx.st;
  const who = ctx.record ? { ...ctx.record, id: ctx.npcId } : (ctx.npc || ctx.npcId);
  const list = D.rumorsFor(st, who);
  if (!list.length) return { start: 'news:none', nodes: { 'news:none': { text: pickBy(NOTHING, ctx.npcId, st.day), goto: ctx.back } } };
  const nodes = {};
  // Node ids carry the rumour's key: a spent Insight check (dialogue.js keys it by node) belongs to
  // that one story, not to whatever this person says first tomorrow.
  const ids = list.map((rumor) => `news:${rumor.key}`);
  list.forEach((rumor, i) => {
    const id = ids[i];
    const choices = [];
    choices.push({ text: pickBy(BELIEVE, rumor.key), check: { skill: 'insight', dc: 12, once: true }, success: `${id}:read`, failure: `${id}:blank` });
    const site = rumor.points && rumor.points.site && SITES[rumor.points.site];
    if (site) choices.push({ text: `How would I find ${site.name}?`, goto: `${id}:way` });
    const lead = rumor.points && rumor.points.giver && rumor.points.giver !== ctx.npcId ? rumor.points.giver : null;
    if (lead) choices.push({ text: 'Is anyone paying to have that dealt with?', goto: `${id}:lead` });
    if (i + 1 < list.length) choices.push({ text: 'What else?', goto: ids[i + 1] });
    choices.push({ text: 'That\'s all I wanted.', goto: ctx.back, cancel: true });
    nodes[id] = {
      text: rumor.text,
      // Heard now: the journal keeps it, a true one marks the way to what it describes.
      do: { call: () => {
        const res = D.hearRumor(st, who, rumor);
        if (res.discovered) toast(`The way to ${res.discovered} is marked on your map.`, { kind: 'quest' });
        return null;
      } },
      choices,
    };
    nodes[`${id}:read`] = { text: `(${D.insightInto(st, rumor)})`, speaker: 'Insight', goto: id };
    nodes[`${id}:blank`] = { text: '(You cannot tell whether they believe it or are only enjoying the telling.)', speaker: 'Insight', goto: id };
    if (site) nodes[`${id}:way`] = { text: `${site.trail} You cannot miss it, once you know to look.`, goto: id };
    if (lead) nodes[`${id}:lead`] = { text: `Go and see ${npcName(lead)}. If anyone is paying, it is them.`, goto: id };
  });
  return { start: ids[0], nodes, backText: 'Anything else?' };
}

// ===========================================================================
// THE WORK
// ===========================================================================

function payText(def) {
  const rw = def.rewards || {};
  const bits = [];
  if (rw.gold) bits.push(`${rw.gold} gp`);
  for (const it of rw.items || []) bits.push(itemName(it.id));
  const pay = bits.length ? `Pays ${bits.join(', ')}.` : 'The pay is what the work is worth.';
  const up = (rw.rep || []).filter((r) => r.amount > 0).map((r) => (FACTION_CONTRACTS[r.id] ? FACTION_CONTRACTS[r.id].name : titleCase(r.id)));
  const down = (rw.rep || []).filter((r) => r.amount < 0).map((r) => (FACTION_CONTRACTS[r.id] ? FACTION_CONTRACTS[r.id].name : titleCase(r.id)));
  const rep = up.length ? ` ${up.join(' and ')} will remember it${down.length ? `; ${down.join(' and ')} will not thank you` : ''}.` : '';
  return `${pay}${rep}`;
}

const OFFERS = ['There is always something. Here is what I have.', 'Work? I might have. Hear me out.', 'You look like you can handle yourself. Listen.'];
const ACCEPTED = ['Good. Come back when it is done.', 'Then I will not keep you. Luck go with you.', 'Done, then. Do not make me regret it.'];

/** Everything this person is offering, and the terms of each. */
export function workTree(ctx) {
  const st = ctx.st;
  const posts = D.postingsFor(st, ctx.npcId);
  if (!posts.length) return { start: 'work:none', nodes: { 'work:none': { text: 'Nothing just now. Try the board by the square — people post what they cannot say aloud.', goto: ctx.back } } };
  const nodes = {};
  const choices = posts.map((p) => ({ text: p.def.title, goto: `work:${p.id}` }));
  choices.push({ text: 'Nothing for now.', goto: ctx.back, cancel: true });
  nodes.work = { text: pickBy(OFFERS, ctx.npcId, st.day), choices };
  for (const p of posts) {
    const def = p.def;
    const bd = def.faction && FACTION_CONTRACTS[def.faction];
    const due = def.deadline ? ` It needs doing within ${Math.max(1, def.deadline - st.day)} days.` : '';
    nodes[`work:${p.id}`] = {
      text: [def.desc, `${payText(def)}${due}`],
      choices: [
        { text: 'I\'ll do it.', do: { call: () => {
          const q = D.acceptQuest(st, p.id);
          return q ? { goto: `work:${p.id}:yes` } : { say: 'Someone else has taken it.', goto: 'work' };
        } } },
        { text: 'What would I have to do?', goto: `work:${p.id}:steps` },
        { text: 'Not this one.', goto: 'work', cancel: true },
      ],
    };
    nodes[`work:${p.id}:steps`] = { text: def.steps.map((s, i) => `${i + 1}. ${s.text}.`).join('\n'), goto: `work:${p.id}` };
    nodes[`work:${p.id}:yes`] = { text: (bd && bd.lines && bd.lines.accept) || pickBy(ACCEPTED, p.id), goto: ctx.back };
  }
  return { start: 'work', nodes };
}

// ===========================================================================
// COMING BACK
// ===========================================================================

/** Reports and hand-overs waiting on this person, and the giver's view of a job still under way. */
export function reportTree(ctx) {
  const st = ctx.st;
  const nodes = {};
  const choices = [];
  for (const rep of D.reportsFor(st, ctx.npcId)) {
    const q = rep.quest;
    const id = `rep:${q.id}`;
    choices.push({
      text: rep.needs ? `Hand over the ${itemName(rep.needs)}. (${q.title})` : `It is done. (${q.title})`,
      if: rep.needs ? { item: rep.needs, reason: `the ${itemName(rep.needs)}` } : null,
      do: { call: () => {
        const res = D.makeReport(st, q.id, ctx.npcId);
        return res.ok ? { goto: `${id}:paid` } : { say: res.text || 'Not yet.' };
      } },
    });
    const bd = q.def.faction && FACTION_CONTRACTS[q.def.faction];
    nodes[`${id}:paid`] = { text: q.def.giver === ctx.npcId ? ((bd && bd.lines && bd.lines.done) || 'Well done. Here — you have earned it.') : `I will send word to ${npcName(q.def.giver)} that it came safe. Thank you.`, goto: ctx.back };
  }
  // A job this person gave you that is not ready to report: where it stands, or give it up.
  for (const q of st.quests.active) {
    if (!q.def || !q.def.director || q.def.giver !== ctx.npcId) continue;
    if (choices.some((c) => String(c.text).endsWith(`(${q.title})`))) continue;
    const id = `job:${q.id}`;
    choices.push({ text: `About ${q.title}…`, goto: id });
    nodes[id] = {
      text: `Well? ${D.nextStepText(q) ? `You still have to ${D.nextStepText(q).replace(/^[A-Z]/, (c) => c.toLowerCase())}.` : 'I am waiting.'}`,
      choices: [
        { text: 'I am still on it.', goto: ctx.back },
        { text: 'I am giving it up.', goto: `${id}:quit` },
      ],
    };
    nodes[`${id}:quit`] = {
      text: 'Then I will find someone who will not. I had hoped better of you.',
      do: { call: () => { D.abandonQuest(st, q.id); return null; } },
      goto: ctx.back,
    };
  }
  if (!choices.length) return null;
  choices.push({ text: 'Never mind.', goto: ctx.back, cancel: true });
  nodes.rep = { text: 'You are back. Well?', choices };
  return { start: 'rep', nodes };
}

// ===========================================================================
// NEGOTIATION
// ===========================================================================

/** Active negotiate quests whose other side is this person and whose moment has come. */
export function negotiationsWith(st, npcId) {
  const out = [];
  for (const q of (st && st.quests.active) || []) {
    const S = q.def && q.def.director && q.def.kind === 'negotiate' && q.def.site;
    if (!S || !S.with) continue;
    const other = S.with.npc || `site:dq:${q.id}:with`;
    if (other !== npcId) continue;
    const flag = `dq:${q.id}:agreed`;
    if (hasFlag(st, flag)) continue;
    const step = q.steps.find((s) => s.kind === 'flag' && s.target === flag);
    if (step && (step.phase || 0) === currentPhase(q)) out.push(q);
  }
  return out;
}

/**
 * Talking the other side round, D&D-style: argue it (Persuasion), lean on them
 * (Intimidation), or spin them a story (Deception) — each tried once, since a
 * failed argument does not improve by repetition — or make it worth their while.
 */
export function negotiationTree(ctx, q) {
  const st = ctx.st;
  const lvl = q.def.minLevel || 1;
  const dc = (q.def.site.with && q.def.site.with.dc) || (lvl >= 11 ? 18 : lvl >= 5 ? 15 : 12);
  const bribe = Math.max(10, Math.round((q.def.rewards.gold || 20) * 0.6 / 5) * 5);
  const giver = q.def.giverName || npcName(q.def.giver);
  const id = `neg:${q.id}`;
  const win = (how) => ({ call: () => { D.negotiationResult(st, q.id, true, how); return null; } });
  return {
    start: id,
    nodes: {
      [id]: {
        text: `${giver} sent you, did they? Go on, then. Say your piece — I have heard every one of theirs.`,
        choices: [
          { text: `There's more to be made working together than tearing each other down.`, check: { skill: 'persuasion', dc, once: true }, success: `${id}:yes`, failure: `${id}:no`, do: win('persuade') },
          { text: 'Settle it now, while it is still words.', check: { skill: 'intimidation', dc: dc + 2, once: true }, success: `${id}:cowed`, failure: `${id}:no`, do: win('intimidate') },
          { text: `${giver} has friends in places you would not like.`, check: { skill: 'deception', dc, once: true }, success: `${id}:yes`, failure: `${id}:no`, do: win('deceive') },
          { text: `Let ${bribe} gp say it for me.`, if: { gold: bribe }, do: [{ gold: -bribe }, win('bribe')], goto: `${id}:paid` },
          { text: 'Another time.', goto: ctx.back, cancel: true },
        ],
      },
      [`${id}:yes`]: { text: `…Fine. Tell ${giver} I will meet them halfway, and not one step further.`, goto: ctx.back },
      [`${id}:cowed`]: { text: `All right! All right. Tell ${giver} it is settled. And keep your hand off that hilt.`, goto: ctx.back },
      [`${id}:paid`]: { text: `Well. That does change the arithmetic. Tell ${giver} we have an understanding.`, goto: ctx.back },
      [`${id}:no`]: { text: 'No. And you can tell them I said so.', goto: id },
    },
  };
}

// ===========================================================================
// REGISTRATION
// ===========================================================================

let registered = false;

export function installWorldTalk() {
  if (registered) return;
  registered = true;

  registerTopic('director:report', {
    order: 10,
    label: (ctx) => (D.reportsFor(ctx.st, ctx.npcId).length ? 'About that work…' : 'About the work you gave me…'),
    when: (ctx) => !!ctx.st && (D.reportsFor(ctx.st, ctx.npcId).length > 0
      || ctx.st.quests.active.some((q) => q.def && q.def.director && q.def.giver === ctx.npcId)),
    run: (ctx) => reportTree(ctx),
  });

  registerTopic('director:negotiate', {
    order: 12,
    label: (ctx) => { const q = negotiationsWith(ctx.st, ctx.npcId)[0]; return q ? `About ${q.def.giverName || npcName(q.def.giver)}…` : null; },
    when: (ctx) => !!ctx.st && negotiationsWith(ctx.st, ctx.npcId).length > 0,
    run: (ctx) => negotiationTree(ctx, negotiationsWith(ctx.st, ctx.npcId)[0]),
  });

  registerTopic('director:work', {
    order: 20,
    label: (ctx) => { const n = D.postingsFor(ctx.st, ctx.npcId).length; return `Any work going? (${n})`; },
    when: (ctx) => !!ctx.st && !!ctx.record && D.postingsFor(ctx.st, ctx.npcId).length > 0,
    run: (ctx) => workTree(ctx),
  });

  registerTopic('director:news', {
    order: 30,
    label: (ctx) => pickBy(ASKS, ctx.npcId),
    when: (ctx) => !!ctx.st && isPerson(ctx),
    run: (ctx) => newsTree(ctx),
  });
}
