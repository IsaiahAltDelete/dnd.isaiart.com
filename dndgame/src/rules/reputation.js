// Local standing and personal memory. Separate from the existing faction ranks.
// Lazy, serializable state keeps pre-reputation saves valid; commerce never buys esteem.
let maps = {};
export function configureReputationMaps(defs) { maps = defs; }
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const civic = npc => ![npc?.tag, npc?.role, npc?.npc?.tag, npc?.npc?.role].includes('villain');

export function socialRegion(map) {
  let m = typeof map === 'string' ? (maps[map] || { id: map }) : { ...maps[map?.id], ...map };
  if (!m.parent && maps[m.id]?.parent) m.parent = maps[m.id].parent;
  const seen = new Set();
  while (m.parent && maps[m.parent] && !seen.has(m.parent)) {
    seen.add(m.parent); m = maps[m.parent];
  }
  return m.region || maps[m.id]?.region || m.parent || m.id || 'wilds';
}

function ledger(st) {
  if (!st) return null;
  st.social ??= {};
  st.social.regions ??= {};
  st.social.people ??= {};
  st.social.credits ??= {};
  return st.social;
}

export function rememberNPC(st, id, kind) {
  if (!id || !st) return;
  const s = ledger(st), p = s.people[id] ??= {};
  p[kind] = true;
  p.day = st.day || 0;
}

// Positive deeds have a daily regional cap and stable quest identities. Repeated
// conversations, small purchases and buy/sell loops cannot farm a reputation.
export function applyReputationDeed(st, d) {
  const good = { help: 2, rescue: 3, free: 2, quest: 2, charity: 1, donate: 1 };
  const bad = { crime: -3, murder: -5, theft: -3, betray: -3 };
  // A private offer/acceptance is not a reported crime. Completed criminal
  // work is marked by the director; direct witnessed crimes have their own kind.
  const criminal = d.kind === 'quest' && d.tags?.includes('crime');
  let delta = criminal ? -3 * d.weight : (good[d.kind] || bad[d.kind] || 0) * d.weight;
  if (!delta || !st) return;
  const s = ledger(st), region = socialRegion(d.region ? { region: d.region } : d.mapId || st.mapId);
  const rec = s.regions[region] ??= { value: 0 };
  if (delta > 0) {
    if (d.questId && s.credits[d.questId]) return;
    if (d.questId) s.credits[d.questId] = true;
    if (rec.creditDay !== d.day) { rec.creditDay = d.day; rec.earned = 0; }
    delta = Math.min(delta, Math.max(0, 12 - (rec.earned || 0)));
    rec.earned = (rec.earned || 0) + delta;
    if (d.npcId) rememberNPC(st, d.npcId, 'helped');
  }
  if (!delta) return;
  rec.value = clamp((rec.value || 0) + delta, -50, 50);
  rec.reason = criminal ? 'criminal work' : ({ crime: 'assault', murder: 'a killing', theft: 'theft', quest: 'completed work', rescue: 'a rescue', help: 'helping locals', free: 'freeing a captive', charity: 'charity', donate: 'a donation' }[d.kind] || d.kind);
  rec.day = d.day;
}

export function localStanding(st, map) {
  const region = socialRegion(map || st?.mapId), rec = st?.social?.regions?.[region];
  const value = rec?.value || 0;
  const rank = value >= 25 ? 'Respected' : value >= 10 ? 'Trusted' : value <= -25 ? 'Feared' : value <= -10 ? 'Distrusted' : 'Unknown';
  const buy = value >= 25 ? 0.9 : value >= 10 ? 0.95 : value <= -25 ? 1.2 : value <= -10 ? 1.1 : 1;
  const sell = value >= 25 ? 1.1 : value >= 10 ? 1.05 : value <= -25 ? 0.8 : value <= -10 ? 0.9 : 1;
  return { region, value, rank, buy, sell, reason: rec?.reason || null };
}

export function npcDisposition(st, npc, map) {
  const p = st?.social?.people?.[npc?.npcId || npc?.id];
  if (p?.attacked || p?.witnessed) return 'wary';
  if (p?.helped) return 'friendly';
  if (!civic(npc)) return 'neutral';
  if (localStanding(st, map).value >= 10) return 'friendly';
  return localStanding(st, map).value <= -10 ? 'wary' : 'neutral';
}

export function socialGreeting(st, npc, map) {
  if (!npc || npc.tag === 'animal' || npc.npc?.tag === 'animal') return null;
  const p = st?.social?.people?.[npc.npcId || npc.id];
  if (p?.attacked) return 'Keep your weapon sheathed. I remember the last time.';
  if (p?.witnessed) return npc.role === 'guard' ? 'I saw that assault. Keep the peace this time.' : 'I saw what happened. Keep your distance.';
  if (p?.helped) return 'I have not forgotten your help. You are welcome here.';
  if (!civic(npc)) return p?.customer ? 'Back again? Let us see what you need today.' : null;
  const standing = localStanding(st, map);
  if (standing.value >= 10) return npc.role === 'guard' ? 'Word of your help has reached the watch. Safe travels.' : 'Word of your help has got around. Good to see you.';
  if (standing.value <= -10) return npc.role === 'guard' ? 'We have heard the reports. You are being watched.' : 'People here have heard the reports. Mind how you behave.';
  if (p?.customer) return 'Back again? Let us see what you need today.';
  return null;
}
