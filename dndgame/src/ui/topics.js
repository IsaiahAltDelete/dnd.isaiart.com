// ui/topics.js — conversation topics other modules add to the opening menu of any conversation ("What's the news?", "Any work going?").
//
// Before this, the only line any townsperson had beyond their script was one
// rotating tavern rumour. Now a world module registers a topic once, and every
// conversation that could plausibly carry it offers it: dialogue.js appends the
// topics that apply on the opening node, beside "Draw your weapon.", and plays
// the small tree a topic returns when it is picked. The tree's choices go back
// to `ctx.back` to return to the menu.
//
//   registerTopic(id, {
//     label: 'What\'s the news?' | (ctx) => string,
//     order: 50,                         lower sorts first
//     when:  (ctx) => bool,              offer it to this person now?
//     run:   (ctx) => { start, nodes },  the exchange (dialogue.js node format;
//                                        a node or choice `do: { call: fn }` runs fn(ctx))
//   })
//   ctx = { st, npcId, npc, record, back, dialogue }
//     npcId   the data/npcs.js key when there is one (else the entity's id)
//     record  the NPCS entry (null for a stranger the world put there)
//     back    the node id that returns to this menu

const TOPICS = new Map();

export function registerTopic(id, spec) {
  if (!id || !spec || typeof spec.run !== 'function') return;
  TOPICS.set(id, { id, order: 50, ...spec });
}

export function unregisterTopic(id) { TOPICS.delete(id); }

/** The topics this person will talk about right now, in menu order, labels resolved. */
export function topicsFor(ctx) {
  const out = [];
  for (const t of TOPICS.values()) {
    let ok = false;
    try { ok = !t.when || !!t.when(ctx); } catch (e) { ok = false; }
    if (!ok) continue;
    let label = t.label;
    try { if (typeof label === 'function') label = label(ctx); } catch (e) { label = null; }
    if (!label) continue;
    out.push({ id: t.id, label: String(label), order: t.order, run: t.run });
  }
  return out.sort((a, b) => a.order - b.order);
}
