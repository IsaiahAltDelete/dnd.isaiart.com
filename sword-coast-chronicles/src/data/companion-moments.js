// Small exchanges about shared experience, never introductions or quest facts.
export const COMPANION_MOMENTS = {
  victory: [
    ['*checks everyone over* Still with us? Good. Breathe first; boasting later.', 'I can do both. *tries, coughs* Apparently not.'],
    ['Next time we agree on a plan before the screaming.', 'That was the plan. I was exceptionally committed.'],
    ['*offers a steadying hand* Easy. The floor has made its point.', 'Then I shall stop arguing with it.'],
  ],
  discovery: [
    ['*squints at the find* Useful, or another thing we carry for a week?', 'Useful. For weighing down the other things.'],
    ['Leave the little things as they were. Someone lived here.', '*sets a cup upright* Aye. I know.'],
    ['There is a story here somewhere.', 'And probably a receipt. People keep those forever.'],
  ],
  road: [
    ['*adjusts a slipping pack* Same shoulder again. Every morning.', 'Swap with me a while. You can complain about mine.'],
    ['When we get back, I am having soup.', 'You said that yesterday.', 'And I remain a person of firm convictions.'],
    ['*hums two bars, loses the tune* How does the rest go?', 'Worse, if I remember it rightly. Keep those two.'],
    ['A moment. Stone in my boot.', 'The adventurous one? You have carried it for miles.'],
    ['D-don\'t laugh. I packed the good tea.', 'Laugh? You have just become indispensable.'],
  ],
};

export function companionMoment(st, members, kind) {
  const companions = members.slice(1).filter(m => m && m.hp > 0 && !m.dead);
  if (!companions.length) return null;
  const memory = st.companionMoments ||= { serial: 0, lastStep: -180, used: {} };
  const step = st.stats?.steps || 0;
  if (step - memory.lastStep < (kind === 'road' ? 180 : 24)) return null;
  const pool = COMPANION_MOMENTS[kind];
  if (!pool) return null;
  const index = (memory.used[kind] || 0) % pool.length;
  memory.used[kind] = index + 1;
  memory.lastStep = step;
  const first = memory.serial++ % companions.length;
  const exchange = companions.length > 1 ? pool[index] : [pool[index][0]];
  return exchange.map((line, i) => `${companions[(first + i % 2) % companions.length].name}: ${line}`);
}
