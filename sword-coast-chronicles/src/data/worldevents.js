// data/worldevents.js — what happens on the Sword Coast whether or not the party is watching: the festival calendar, the powers that hold each region, the places a job can send you, the lairs waiting to be found, and every kind of trouble with its causes, stages and consequences.
//
// PURE DATA, deep frozen. rules/worlddirector.js runs it; nothing here decides
// anything. The shapes (all fields optional unless the director says otherwise):
//
//   FESTIVALS[id] = { id, name, doy, leap, towns, stages, prices, text }
//     `doy` is the day of the game's 360-day year (constants.dateText). That
//     reckoning has no intercalary days, so each Harptos festival is kept on the
//     first day of the month it precedes: Greengrass on 1 Mirtul, Midsummer on
//     1 Eleasis, Shieldmeet on 2 Eleasis (in years divisible by four), and so on.
//
//   EVENTS[id] = { id, name, kind, towns, maps, region, level:[lo,hi], months,
//                  weight, cooldown, requires, vars, stages:[stage], quests:[{at,spec}],
//                  outcomes:{ resolved, ignored | [[chance, outcome], ...], <named> } }
//   stage   = { id, name, days:[a,b], text, notice, prices:{cat:mult},
//               encounters:{ groups:[[groupId, weight]], rate }, packs:[{map,group,title}],
//               visitors:[{map, name, sprite, line}] }
//   outcome = { text, prices, days, maps, control:[[region, faction, delta]], flags, next:[[tpl, chance, delay]] }
//   spec    = a quest request for data/quests.js generateQuest (see the director notes).
//
// Price categories: item kinds (weapon armor shield potion scroll food gem
// material tool gear ammo) and trade tags (grain livestock wool ore cloth timber
// drink medicine holy fine). The economy decides which items carry which tag.
//
// Setting: every place, power, house and creature is published Forgotten Realms
// canon (docs/SETTING.md). Names in `vars` follow the §5 naming tables.

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const k of Object.keys(o)) deepFreeze(o[k]);
  }
  return o;
}

// ===========================================================================
// 1. THE CALENDAR
// ===========================================================================

export const DAYS_PER_YEAR = 360;
export const TENDAY = 10;

/** Day number -> { doy (1-360), month (0-11), dom (1-30), year DR, tenday (0-2), tendayDay (1-10) }. */
export function calendarOf(day, yearDR = 1496) {
  const d = ((Math.floor(day) - 1) % DAYS_PER_YEAR + DAYS_PER_YEAR) % DAYS_PER_YEAR;
  const month = Math.floor(d / 30);
  const dom = (d % 30) + 1;
  return {
    doy: d + 1, month, dom,
    year: yearDR + Math.floor((Math.floor(day) - 1) / DAYS_PER_YEAR),
    tenday: Math.floor((dom - 1) / TENDAY), tendayDay: ((dom - 1) % TENDAY) + 1,
  };
}

const CIVIL_TOWNS = ['phandalin', 'neverwinter', 'waterdeep', 'daggerford', 'beregost', 'nashkel',
  'friendly-arm-inn', 'ulgoths-beard', 'bg-the-wide', 'bg-temples-district', 'bg-bloomridge', 'bg-rivington'];

function fest(id, name, doy, o = {}) {
  return {
    id, name, doy, leap: !!o.leap, towns: o.towns || CIVIL_TOWNS,
    lead: o.lead != null ? o.lead : 3,        // days of preparation before the day itself
    text: o.text || '', eve: o.eve || '', after: o.after || '',
    prices: o.prices || {}, encounters: o.encounters || null,
    notice: o.notice || '', quest: o.quest || null, music: o.music || 'festival',
  };
}

export const FESTIVALS = deepFreeze({
  midwinter: fest('midwinter', 'Midwinter', 31, {
    eve: 'Houses are hanging evergreen over the doors for Midwinter, and the lords are sealing their alliances for the year.',
    text: 'Midwinter: the dead of the year. Bargains struck today are said to hold, and nobody travels who can help it.',
    after: 'Midwinter is past. The roads open again, slowly.',
    prices: { food: 1.1, drink: 1.1, fine: 1.15 },
    encounters: { rate: 0.8 },
    notice: 'By order of the council: the gates close at dusk through Midwinter night.',
  }),
  greengrass: fest('greengrass', 'Greengrass', 121, {
    eve: 'Flower-sellers are coming in from the farms for Greengrass, and somebody has put a ribbon on every post in town.',
    text: 'Greengrass: the first day of spring. Flowers on every sill, dancing on the green, and the first fresh greens at market.',
    after: 'The Greengrass garlands are wilting on the posts. Spring work begins in earnest.',
    prices: { food: 0.9, drink: 1.15 },
    encounters: { rate: 0.85 },
    notice: 'Greengrass on the green at noon. Bring flowers. Leave your quarrels at the well.',
    quest: { kind: 'retrieve', title: 'Flowers for the Green', tier: 'trivial', item: 'greengrass-posies', place: 'wild-near', giver: 'town-host',
      desc: 'Every house wants flowers on its sill for Greengrass and the near meadows are picked bare. Somebody will have to go further out — past where it is quite safe — and bring back an armful of wild posies.' },
  }),
  midsummer: fest('midsummer', 'Midsummer', 211, {
    eve: 'The taverns are laying in casks for Midsummer, and half the town is quietly working up the nerve to propose to the other half.',
    text: 'Midsummer: feasting and courting under the longest light of the year. Betrothals made tonight are thought lucky.',
    after: 'Midsummer is over, and so are several reputations.',
    prices: { drink: 1.2, food: 1.1, fine: 1.1 },
    notice: 'Midsummer feast in the square from dusk. The watch will be sober. Nobody else is expected to be.',
  }),
  shieldmeet: fest('shieldmeet', 'Shieldmeet', 212, {
    leap: true, lead: 5,
    eve: 'Heralds are crying Shieldmeet, the leap-year day of open council, and every lord on the Coast is sending someone to renew old pacts.',
    text: 'Shieldmeet: pacts renewed, grievances heard in open council, and a tourney for anyone who can hold a lance.',
    after: 'Shieldmeet is done; the pacts are sealed for another four years, and the tourney field is being raked.',
    prices: { weapon: 1.1, armor: 1.1, drink: 1.15 },
    notice: 'Shieldmeet. The council sits in the open to hear any grievance. The tourney lists close at noon.',
    quest: { kind: 'negotiate', title: 'A Grievance for Shieldmeet', tier: 'minor', giver: 'town-host', faction: 'lords-alliance',
      desc: 'Two neighbours have a quarrel about a boundary stone that has run a generation. Shieldmeet is the day it can be settled without steel, if someone persuades them both to stand before the council.' },
  }),
  highharvestide: fest('highharvestide', 'Highharvestide', 271, {
    eve: 'Wagons are coming in heavy for Highharvestide, and the last caravans are making ready to leave before the roads turn.',
    text: 'Highharvestide: the harvest feast. Tables in the street, the year\'s grain counted, and the caravans set out before winter.',
    after: 'Highharvestide is over. The granaries are shut and the caravans have gone.',
    prices: { grain: 0.8, food: 0.85, livestock: 0.9, drink: 1.1 },
    notice: 'Highharvestide. The tithe barn is open. Caravans for the south muster at first light the day after.',
    quest: { kind: 'escort', title: 'The Last Wagons Out', tier: 'small', giver: 'town-host', faction: 'lords-alliance',
      desc: 'The Highharvestide wagons leave for the next town at first light, loaded with the year\'s grain and everything anybody owes anybody. They want a few more blades along than they can pay for. They can pay for yours.' },
  }),
  'feast-of-the-moon': fest('feast-of-the-moon', 'The Feast of the Moon', 331, {
    eve: 'Families are cleaning their graves and cooking for the Feast of the Moon, when the dead are remembered and the stories of heroes are told.',
    text: 'The Feast of the Moon: the dead are honoured and their stories told. Candles burn on every grave, and the old barrows are restless.',
    after: 'The Feast of the Moon is past; the candles are cold on the graves.',
    prices: { holy: 1.2, food: 1.05 },
    encounters: { groups: [['crypt-of-the-restless', 2], ['old-owl-well-undead', 2], ['shrine-defilers', 1]], rate: 1.15, biomes: ['crypt', 'ruins', 'plains'] },
    notice: 'The Feast of the Moon. The shrine keeps vigil all night. Bring a candle and a name.',
    quest: { kind: 'clear', title: 'Quiet Graves', tier: 'small', giver: 'town-priest', faction: 'gauntlet', place: 'crypt-near', group: 'undead',
      desc: 'Every Feast of the Moon something under the old stones forgets that it is dead. The shrine wants the graves quiet before the vigil candles are lit, and does not much mind how.' },
  }),
});

/** Is `year` (Dale Reckoning) a Shieldmeet year? */
export function isShieldmeetYear(year) { return year % 4 === 0; }

// ===========================================================================
// 2. REGIONS AND WHO HOLDS THEM
//
// A region is a handful of maps that share one balance of power. `sway` is a
// share out of roughly a hundred; the largest share is the holder. Local powers
// that are not joinable factions (the Cragmaw tribe) carry their own names.
// ===========================================================================

export const POWER_NAMES = deepFreeze({
  'lords-alliance': "the Lords' Alliance", zhentarim: 'the Zhentarim', harpers: 'the Harpers',
  gauntlet: 'the Order of the Gauntlet', 'emerald-enclave': 'the Emerald Enclave',
  'cult-dragon': 'the Cult of the Dragon', redbrands: 'the Redbrands', 'many-arrows': 'the orcs of Many-Arrows',
  cragmaw: 'the Cragmaw goblins', 'flaming-fist': 'the Flaming Fist', thay: 'the Red Wizards of Thay',
});

function region(id, name, maps, sway) { return { id, name, maps, sway }; }

export const REGIONS = deepFreeze({
  phandalin: region('phandalin', 'Phandalin', ['phandalin', 'stonehill-inn', 'barthens-provisions', 'lionshield-coster',
    'shrine-of-luck', 'miners-exchange', 'townmasters-hall', 'alderleaf-farm', 'sleeping-giant', 'phandalin-manor', 'redbrand-hideout'],
  { redbrands: 40, 'lords-alliance': 32, zhentarim: 28 }),
  'triboar-trail': region('triboar-trail', 'the Triboar Trail', ['triboar-trail', 'wave-echo-cave-entrance', 'conyberry-ruins',
    'cragmaw-hideout', 'old-owl-well', 'wyvern-tor', 'icespire-peak', 'kryptgarden-forest'],
  { cragmaw: 40, 'lords-alliance': 30, zhentarim: 15, 'many-arrows': 15 }),
  'neverwinter-wood': region('neverwinter-wood', 'Neverwinter Wood', ['neverwinter-wood', 'thundertree', 'cragmaw-castle'],
    { 'emerald-enclave': 45, 'cult-dragon': 30, cragmaw: 25 }),
  neverwinter: region('neverwinter', 'Neverwinter', ['neverwinter', 'mere-of-dead-men', 'leilon'],
    { 'lords-alliance': 65, zhentarim: 25, 'cult-dragon': 10 }),
  waterdeep: region('waterdeep', 'Waterdeep', ['waterdeep', 'undermountain', 'ardeep-forest'],
    { 'lords-alliance': 55, zhentarim: 25, harpers: 20 }),
  'trade-way': region('trade-way', 'the Trade Way', ['trade-way-north', 'trade-way-south', 'daggerford', 'the-way-inn', 'fields-of-the-dead', 'dragonspear-castle'],
    { 'lords-alliance': 50, zhentarim: 30, 'many-arrows': 20 }),
  'coast-way': region('coast-way', 'the Coast Way', ['coast-way-north', 'coast-way-south', 'friendly-arm-inn', 'beregost', 'nashkel', 'nashkel-mines', 'high-hedge', 'candlekeep-approach', 'ulgoths-beard', 'rosymorn-monastery'],
    { 'flaming-fist': 45, zhentarim: 35, 'lords-alliance': 20 }),
  'baldurs-gate': region('baldurs-gate', "Baldur's Gate", ['bg-the-wide', 'bg-blackgate', 'bg-norchapel', 'bg-little-calimshan', 'bg-tumbledown',
    'bg-sows-foot', 'bg-twin-songs', 'bg-wyrms-crossing', 'bg-rivington', 'bg-gray-harbour', 'bg-bloomridge', 'bg-heapside', 'bg-eastway',
    'bg-temples-district', 'bg-citadel-streets', 'bg-sewers', 'tumbledown-crypts'],
  { 'flaming-fist': 50, zhentarim: 35, harpers: 15 }),
});

/** Which region a map belongs to (interiors resolve through the region list). */
export function regionOfMap(mapId) {
  const id = String(mapId || '');
  for (const r of Object.values(REGIONS)) if (r.maps.includes(id)) return r.id;
  if (id.startsWith('bg-')) return 'baldurs-gate';
  return null;
}

// ===========================================================================
// 3. THE PEOPLE WHO RUN EACH TOWN
//
// Who posts the notices, who a board's work is reported to, and who the
// director asks when an event needs a host, a priest, a merchant or a captain.
// Every id is a real NPC in data/npcs*.js.
// ===========================================================================

export const TOWN_ROLES = deepFreeze({
  phandalin: { host: 'harbin-wester', priest: 'sister-garaele', merchant: 'elmar-barthen', arms: 'linene-graywind',
    captain: 'sildar-hallwinter', inn: 'toblen-stonehill', shadow: 'halia-thornton', wild: 'reidoth', knight: 'daran-edermath', farm: 'qelline-alderleaf' },
  neverwinter: { host: 'general-sabine', captain: 'general-sabine', merchant: 'esvele-dundragon', priest: 'sister-garaele', inn: 'general-sabine' },
  waterdeep: { host: 'mirt', captain: 'mirt', inn: 'durnan', merchant: 'zasheir-rein', lore: 'volothamp-geddarm', priest: 'mirt' },
  daggerford: { host: 'morwen-daggerford', captain: 'sherlen-spearslayer', priest: 'lucian-dlusker', inn: 'filarion-filvendorson', merchant: 'derval-ironeater' },
  beregost: { host: 'kelddath-ormlyr', priest: 'kelddath-ormlyr', inn: 'feldepost', merchant: 'taerom-fuiruim', captain: 'kelddath-ormlyr' },
  nashkel: { host: 'berrun-ghastkill', captain: 'berrun-ghastkill', inn: 'vitiare-calabra', merchant: 'berrun-ghastkill', priest: 'berrun-ghastkill' },
  'friendly-arm-inn': { host: 'bentley-mirrorshade', inn: 'bentley-mirrorshade', priest: 'gellana-mirrorshade', captain: 'mival-chernin' },
  'ulgoths-beard': { host: 'westra-helder', inn: 'westra-helder', captain: 'westra-helder' },
  'the-way-inn': { host: 'jasmal-rein', inn: 'jasmal-rein' },
  'fields-of-the-dead': { host: 'hulmarra-stayanoga', priest: 'hulmarra-stayanoga' },
  'baldurs-gate': { host: 'ulder-ravengard', captain: 'ulder-ravengard', priest: 'navarra-dyernina', shadow: 'rilsa-rael', inn: 'kethra-buckman', lore: 'jaheira', merchant: 'aseir-basha' },
});

/** The town whose people a map's troubles are reported to. */
export const TOWN_OF_MAP = deepFreeze({
  phandalin: 'phandalin', 'triboar-trail': 'phandalin', 'wave-echo-cave-entrance': 'phandalin', 'conyberry-ruins': 'phandalin',
  'neverwinter-wood': 'phandalin', 'phandalin-manor': 'phandalin', 'cragmaw-hideout': 'phandalin', 'old-owl-well': 'phandalin',
  'wyvern-tor': 'phandalin', 'icespire-peak': 'phandalin', 'kryptgarden-forest': 'phandalin', thundertree: 'phandalin', 'cragmaw-castle': 'neverwinter',
  neverwinter: 'neverwinter', 'mere-of-dead-men': 'neverwinter', leilon: 'neverwinter',
  waterdeep: 'waterdeep', undermountain: 'waterdeep', 'ardeep-forest': 'waterdeep', 'trade-way-north': 'daggerford',
  daggerford: 'daggerford', 'trade-way-south': 'daggerford', 'the-way-inn': 'daggerford', 'fields-of-the-dead': 'daggerford', 'dragonspear-castle': 'daggerford',
  'coast-way-north': 'friendly-arm-inn', 'friendly-arm-inn': 'friendly-arm-inn', 'coast-way-south': 'beregost', beregost: 'beregost', 'high-hedge': 'beregost',
  nashkel: 'nashkel', 'nashkel-mines': 'nashkel', 'candlekeep-approach': 'beregost', 'ulgoths-beard': 'ulgoths-beard', 'rosymorn-monastery': 'daggerford',
});

/** Market towns and the day of each tenday their market is kept. */
export const MARKETS = deepFreeze({
  phandalin: { day: 1, name: 'market day on the green' },
  daggerford: { day: 4, name: 'the Daggerford market' },
  beregost: { day: 6, name: 'the Beregost fair' },
  neverwinter: { day: 3, name: 'the Enclave market' },
  waterdeep: { day: 5, name: 'the Trades Ward market' },
  'bg-the-wide': { day: 1, name: 'market on the Wide' },
  nashkel: { day: 8, name: 'the Nashkel carnival' },
});

// ===========================================================================
// 4. PLACES A JOB CAN SEND YOU
//
// Only maps a party can actually walk to, plus the discoverable sites below
// (which join the pool once found). `kind` separates wild country, where a pack
// can be staged, from a town, where only talk and deliveries make sense.
// ===========================================================================

function place(map, name, prep, biome, lo, hi, o = {}) {
  return { id: map, map, name, prep, biome, band: [lo, hi], kind: o.kind || 'wild', road: !!o.road, near: o.near || TOWN_OF_MAP[map] || null };
}

export const PLACES = deepFreeze([
  place('triboar-trail', 'the Triboar Trail', 'on the Triboar Trail', 'road', 1, 9, { road: true }),
  place('neverwinter-wood', 'Neverwinter Wood', 'in Neverwinter Wood', 'pine-forest', 2, 12),
  place('conyberry-ruins', 'the ruins of Conyberry', 'among the ruins of Conyberry', 'ruins', 3, 10),
  place('wave-echo-cave-entrance', 'the hills above Wave Echo Cave', 'in the hills above Wave Echo Cave', 'hills', 3, 10),
  place('phandalin-manor', 'the Tresendar cellars', 'in the cellars under Tresendar Manor', 'ruins', 2, 6, { kind: 'dungeon' }),
  place('undermountain', 'Undermountain', 'beneath Waterdeep', 'dungeon', 8, 30, { kind: 'dungeon' }),
  place('trade-way-north', 'the Trade Way', 'on the Trade Way north of Daggerford', 'road', 7, 15, { road: true }),
  place('trade-way-south', 'the Trade Way', 'on the Trade Way south of Daggerford', 'road', 8, 16, { road: true }),
  place('fields-of-the-dead', 'the Fields of the Dead', 'in the Fields of the Dead', 'plains', 9, 20),
  place('coast-way-north', 'the Coast Way', 'on the Coast Way', 'road', 10, 18, { road: true }),
  place('coast-way-south', 'the Coast Way', 'on the Coast Way south of Beregost', 'road', 11, 19, { road: true }),
  place('dragonspear-castle', 'Dragonspear Castle', 'under Dragonspear Castle', 'dungeon', 12, 24, { kind: 'dungeon' }),
  place('rosymorn-monastery', 'Rosymorn Monastery', 'at Rosymorn Monastery', 'mountain', 11, 20),
  place('bg-sewers', 'the Lower City sewers', 'in the sewers under the Lower City', 'dungeon', 10, 22, { kind: 'dungeon' }),
  place('tumbledown-crypts', 'the Tumbledown crypts', 'in the Tumbledown crypts', 'crypt', 10, 20, { kind: 'dungeon' }),
  place('nashkel-mines', 'the Nashkel Mines', 'in the Nashkel Mines', 'mine', 11, 20, { kind: 'dungeon' }),
]);

/** Towns a delivery can go to, with the person who signs for it. */
export const DELIVERY_ENDS = deepFreeze([
  { map: 'phandalin', npc: 'elmar-barthen', band: [1, 30] },
  { map: 'phandalin', npc: 'sister-garaele', band: [1, 30] },
  { map: 'phandalin', npc: 'linene-graywind', band: [1, 30] },
  { map: 'neverwinter', npc: 'general-sabine', band: [3, 30] },
  { map: 'neverwinter', npc: 'esvele-dundragon', band: [3, 30] },
  { map: 'waterdeep', npc: 'durnan', band: [5, 30] },
  { map: 'waterdeep', npc: 'volothamp-geddarm', band: [5, 30] },
  { map: 'daggerford', npc: 'morwen-daggerford', band: [7, 30] },
  { map: 'daggerford', npc: 'derval-ironeater', band: [7, 30] },
  { map: 'beregost', npc: 'taerom-fuiruim', band: [10, 30] },
  { map: 'nashkel', npc: 'berrun-ghastkill', band: [11, 30] },
  { map: 'bg-the-wide', npc: 'aseir-basha', band: [10, 30] },
]);

// ===========================================================================
// 5. SITES — lairs and landmarks waiting to be found
//
// Each resolves as a procedural map (world/maps.js PROC_SITES) that no warp
// leads to until the party finds the way: a rumour, a job, or a passive
// Wisdom (Survival) check on the host map. Once found, a trail appears on the
// host map. A lair that is cleared stands empty for a few weeks, then something
// else moves in — `occupants` is the ladder, by party level.
// ===========================================================================

function site(id, name, o = {}) {
  return {
    id, name, map: o.map || id, host: o.host, prep: o.prep || `at ${name}`, biome: o.biome || 'cave', band: o.band || [1, 30],
    trail: o.trail || `A way off the road leads toward ${name}.`, sign: o.sign || name,
    dc: o.dc != null ? o.dc : 14, found: o.found || `You find the way to ${name}.`,
    occupants: o.occupants || [], renew: o.renew || [21, 35], hoard: o.hoard != null ? o.hoard : 1,
  };
}

export const SITES = deepFreeze({
  'cragmaw-hideout': site('cragmaw-hideout', 'Cragmaw Hideout', {
    host: 'triboar-trail', prep: 'in Cragmaw Hideout', biome: 'cave', band: [1, 7], dc: 12,
    trail: 'A goblin track leaves the Trail and follows a stream up into the thickets.',
    found: 'Goblin sign: a snapped branch, a greasy rag, bootprints too small for a man. The track runs up the stream to a cave mouth.',
    occupants: [['cragmaw-hideout-den', 1, 6], ['kobold-warren', 1, 6], ['stirge-roost', 1, 5], ['owlbear-territory', 3, 9], ['ghoul-warren', 4, 10]],
  }),
  'old-owl-well': site('old-owl-well', 'Old Owl Well', {
    host: 'triboar-trail', prep: 'at Old Owl Well', biome: 'crypt', band: [3, 10], dc: 13,
    trail: 'A worn Netherese road-stone points north into the hills: Old Owl Well.',
    found: 'Half-buried in the verge is a Netherese road-stone. Its arrow still points north, toward the ruined watchtower at Old Owl Well.',
    occupants: [['old-owl-well-undead', 2, 8], ['crypt-of-the-restless', 4, 10], ['shrine-defilers', 3, 9], ['haunting-of-the-hall', 6, 12]],
  }),
  'wyvern-tor': site('wyvern-tor', 'Wyvern Tor', {
    host: 'conyberry-ruins', prep: 'at Wyvern Tor', biome: 'hills', band: [3, 10], dc: 13,
    trail: 'A cattle track climbs east out of Conyberry toward the crags of Wyvern Tor.',
    found: 'Orc spoor and old cattle bones on a track climbing east. The crags of Wyvern Tor stand over it.',
    occupants: [['wyvern-tor-orcs', 3, 8], ['ogre-shakedown', 4, 9], ['ettin-crag', 5, 11], ['wyvern-tor-flight', 6, 14]],
  }),
  'icespire-peak': site('icespire-peak', 'Icespire Peak', {
    host: 'wave-echo-cave-entrance', prep: 'under Icespire Peak', biome: 'tundra', band: [6, 20], dc: 15,
    trail: 'A herders\' path climbs toward the snowline and the white fang of Icespire Peak.',
    found: 'A herders\' path climbs out of the hills toward the snow. Icespire Peak is a white fang above it, and nothing grazes on its lower slopes any more.',
    occupants: [['icespire-frost-pack', 4, 10], ['icespire-brood', 5, 11], ['griffon-crag', 4, 9], ['icespire-frost-giants', 9, 20]],
  }),
  'kryptgarden-forest': site('kryptgarden-forest', 'Kryptgarden Forest', {
    host: 'triboar-trail', prep: 'in Kryptgarden Forest', biome: 'forest', band: [5, 20], dc: 14,
    trail: 'A hunters\' ride runs south off the Trail into the dark eaves of Kryptgarden Forest.',
    found: 'South of the road the trees change: older, closer, too quiet. A hunters\' ride runs in under them toward Kryptgarden.',
    occupants: [['kryptgarden-spiders', 3, 9], ['ettercap-web-hollow', 4, 10], ['kryptgarden-dragon-cult', 7, 20], ['owlbear-territory', 4, 9]],
  }),
  thundertree: site('thundertree', 'Thundertree', {
    host: 'neverwinter-wood', prep: 'in the ash of Thundertree', biome: 'ash-waste', band: [3, 12], dc: 12,
    trail: 'An overgrown road runs west into grey ash: the ruins of Thundertree.',
    found: 'Under the pine needles, old cobbles: a road, running west into ground that has gone grey with ash. Thundertree.',
    occupants: [['thundertree-blights', 2, 7], ['thundertree-ash-dead', 3, 8], ['cult-of-the-dragon-cell', 4, 9], ['thundertree-ash-flight', 6, 14]],
  }),
  'cragmaw-castle': site('cragmaw-castle', 'Cragmaw Castle', {
    host: 'neverwinter-wood', prep: 'in Cragmaw Castle', biome: 'ruins', band: [4, 11], dc: 15,
    trail: 'A goblin-trodden path winds east through the wood toward a ruined keep: Cragmaw Castle.',
    found: 'Hobgoblin boots have worn a path east through the undergrowth. It ends at a broken keep with fresh timber in its gate: Cragmaw Castle.',
    occupants: [['cragmaw-castle-guard', 4, 10], ['ogre-shakedown', 4, 9], ['uthgardt-warband', 5, 11], ['vampire-court', 10, 20]],
  }),
  'mere-of-dead-men': site('mere-of-dead-men', 'the Mere of Dead Men', {
    host: 'neverwinter', prep: 'in the Mere of Dead Men', biome: 'marsh', band: [5, 20], dc: 13,
    trail: 'The causeway south off the High Road: the Mere of Dead Men.',
    found: 'A drowned causeway leaves the High Road south of the city and runs out into the salt marsh. The Mere of Dead Men.',
    occupants: [['mere-of-dead-men-lizardfolk', 3, 8], ['bullywug-bog', 3, 8], ['mere-wisps', 4, 10], ['mere-of-dead-men-wraiths', 7, 20], ['marsh-terrors', 9, 20]],
  }),
  leilon: site('leilon', 'Leilon', {
    host: 'neverwinter', prep: 'outside Leilon', biome: 'ruins', band: [3, 10], dc: 11,
    trail: 'The High Road south toward Leilon, the town the Spellplague broke.',
    found: 'The High Road runs on south to Leilon, where the townsfolk are still rebuilding what the Spellplague undid.',
    occupants: [['high-road-highwaymen', 3, 9], ['harpy-cliffs', 3, 9], ['ghoul-warren', 4, 9]],
  }),
  'ardeep-forest': site('ardeep-forest', 'Ardeep Forest', {
    host: 'trade-way-north', prep: 'in Ardeep Forest', biome: 'forest', band: [6, 20], dc: 14,
    trail: 'An elven way-mark, moss-grown: the path into Ardeep Forest.',
    found: 'An elven way-mark stands in the brambles east of the road, the moss on it scraped away by someone recently. Ardeep Forest lies beyond.',
    occupants: [['ettercap-web-hollow', 5, 10], ['owlbear-territory', 5, 10], ['neverwinter-wood-wardens', 8, 20], ['moonrise-on-the-trail', 5, 11]],
  }),
});

// ===========================================================================
// 6. NAMES THE DIRECTOR DRAWS ON
// ===========================================================================

/** Waterdhavian noble houses (published canon). */
export const NOBLE_HOUSES = deepFreeze(['Amcathra', 'Ammakyl', 'Brossfeather', 'Cassalanter', 'Gralhund', 'Hawkwinter',
  'Ilzimmer', 'Irlingstar', 'Jhansczil', 'Kormallis', 'Margaster', 'Melshimber', 'Nesher', 'Phull', 'Rosznar',
  'Silmerhelve', 'Tarm', 'Thann', 'Wands', 'Zulpair']);

/** Plain people for the director to put in danger: Chondathan and Illuskan names (SETTING.md §5). */
export const FOLK = deepFreeze({
  male: ['Darvin', 'Dorn', 'Evendur', 'Gorstag', 'Grim', 'Helm', 'Malark', 'Morn', 'Randal', 'Stedd', 'Ander', 'Blath', 'Bran', 'Frath', 'Geth', 'Lander', 'Luth', 'Malcer', 'Stor', 'Taman', 'Urth'],
  female: ['Arveene', 'Esvele', 'Jhessail', 'Kerri', 'Lureene', 'Miri', 'Rowan', 'Shandri', 'Tessele', 'Amafrey', 'Betha', 'Cefrey', 'Kethra', 'Mara', 'Olga', 'Silifrey', 'Westra'],
  family: ['Amblecrown', 'Buckman', 'Dundragon', 'Evenwood', 'Greycastle', 'Tallstag', 'Brightwood', 'Helder', 'Hornraven', 'Lackman', 'Stormwind', 'Windrivver'],
  byname: ['the Red', 'Blackhand', 'One-Eye', 'of the Long Knife', 'the Tanner', 'Half-Ear', 'the Smiler', 'Crowfoot', 'the Butcher', 'Greyjaw'],
});

/** How a beast earns a name of its own in the mouths of the people who fear it. */
export const BEAST_EPITHETS = deepFreeze(['the Old {foe} of {place}', 'the Black {foe}', 'the Grey {foe} of {place}',
  'the One-Eyed {foe}', 'the Great {foe} of {place}', 'the {foe} Nobody Kills', 'the Widowmaker']);
// A devil or a flameskull is not 'the One-Eyed' anything: dread things are named for where they haunt.
export const DREAD_EPITHETS = deepFreeze(['the {foe} of {place}', 'the Thing in {place}', 'the {foe} Under {place}', 'the Nameless {foe}']);

// ===========================================================================
// 7. EVENTS
// ===========================================================================

function stage(id, name, days, o = {}) {
  return {
    id, name, days,
    text: o.text || '', notice: o.notice || '',
    prices: o.prices || null, encounters: o.encounters || null,
    packs: o.packs || [], visitors: o.visitors || [], quiet: !!o.quiet,
  };
}

function ev(id, name, o = {}) {
  return {
    id, name, kind: o.kind || 'trouble', tags: o.tags || [],
    towns: o.towns || [], maps: o.maps || [], region: o.region || null,
    level: o.level || [1, 30], months: o.months || null,
    weight: o.weight != null ? o.weight : 2, cooldown: o.cooldown != null ? o.cooldown : 30,
    requires: o.requires || {}, vars: o.vars || {},
    stages: o.stages || [], quests: o.quests || [], outcomes: o.outcomes || {},
    severity: o.severity || 1, dark: !!o.dark,
  };
}

export const EVENTS = deepFreeze({

  // --- the local trouble a first-level party can put right -----------------

  'goblin-raid': ev('goblin-raid', 'Goblins on the Phandalin Road', {
    kind: 'raid', tags: ['goblin', 'raid', 'livestock'], towns: ['phandalin'], maps: ['triboar-trail', 'phandalin'],
    region: 'triboar-trail', level: [1, 6], weight: 5, cooldown: 30,
    vars: { farm: ['the Alderleaf farm', 'Edermath Orchard', 'the Dendrar croft', 'the Tallstag steading', 'the Brightwood farm'] },
    stages: [
      stage('sign', 'Goblin sign', [2, 3], {
        text: 'Carters on the Triboar Trail report goblin sign: cut fences, a dead dog on the verge, fires in the hills at night.',
        encounters: { groups: [['cragmaw-scouts', 3]], rate: 1.2, maps: ['triboar-trail'] },
      }),
      stage('raids', 'Night raids', [3, 5], {
        text: 'Cragmaw raiders come down off the hills by night and drive off stock from {farm}.',
        notice: 'Bounty: Cragmaw goblins raiding the farms. The Townmaster pays for every raider put down on the Triboar Trail.',
        prices: { food: 1.15, livestock: 1.25 },
        encounters: { groups: [['cragmaw-ambush', 3], ['cragmaw-scouts', 2]], rate: 1.35, maps: ['triboar-trail'] },
        packs: [{ map: 'triboar-trail', group: 'cragmaw-ambush', title: 'Cragmaw raiders' }],
      }),
    ],
    quests: [{ at: 1, spec: { kind: 'clear', giver: 'harbin-wester', faction: 'lords-alliance', place: 'triboar-trail', group: 'cragmaw-ambush',
      title: 'Raiders on the Trail', resolves: true,
      desc: 'The Cragmaw goblins have hit {farm} twice in three nights. Harbin Wester will not go out there himself, but he will pay for the raiding band to be broken on the Triboar Trail and its chief brought down.' } }],
    outcomes: {
      resolved: { text: 'The Cragmaw raiders were broken on the Triboar Trail, and {farm} kept its stock.', prices: { livestock: 0.95 }, days: 7,
        control: [['triboar-trail', 'lords-alliance', 6], ['triboar-trail', 'cragmaw', -8]] },
      ignored: { text: 'The goblins fired the barn at {farm} and carried off the flock. Mutton is dear in Phandalin.', prices: { food: 1.2, livestock: 1.3 }, days: 12,
        control: [['triboar-trail', 'cragmaw', 8]], next: [['goblin-raid', 0.35, 12]] },
    },
  }),

  'caravan-missing': ev('caravan-missing', 'A Caravan Missing on the Triboar Trail', {
    kind: 'missing', tags: ['caravan', 'trade', 'bandits'], towns: ['phandalin', 'neverwinter'], maps: ['triboar-trail'],
    region: 'triboar-trail', level: [1, 9], weight: 4, cooldown: 25,
    vars: {
      master: 'person', goods: ['arms for the Lionshield Coster', 'salt, lamp oil and rope for Barthen\'s', 'Waterdhavian wine', 'picks and blasting powder for the claims'],
      giver: ['linene-graywind', 'elmar-barthen', 'toblen-stonehill', 'halia-thornton'],
    },
    stages: [
      stage('overdue', 'Overdue', [2, 2], { text: 'A wagon train under {master} is two days overdue from Neverwinter with {goods}.' }),
      stage('missing', 'Missing', [5, 6], {
        text: 'Nobody has seen {master}\'s wagons since the Triboar Trail crossroads. There is talk of bandits, and worse.',
        notice: 'Reward for word of {master}\'s wagons, last seen on the Triboar Trail with {goods}.',
        prices: { weapon: 1.1, gear: 1.1 },
      }),
    ],
    quests: [{ at: 1, spec: { kind: 'investigate', giver: '{giver}', place: 'triboar-trail', title: 'The Missing Wagons', resolves: false,
      desc: '{master}\'s wagons left Neverwinter with {goods} and never came into Phandalin. Walk the Triboar Trail, find where they left it, and find out what happened to the people driving them.',
      clue: 'The wagon ruts leave the road here. A wheel lies broken in the ditch and the ground is churned with small bootprints. The trail leads off toward the hills.',
      reveals: 'cragmaw-hideout',
      followup: { kind: 'rescue', giver: '{giver}', place: 'cragmaw-hideout', group: 'cragmaw-hideout-den', resolves: true, captive: '{master}',
        title: 'Survivors in the Hills',
        desc: 'The tracks from the wreck lead to Cragmaw Hideout, and the goblins took prisoners as well as wagons. Get {master} and whoever else is still alive out of there.' } } }],
    outcomes: {
      resolved: { text: '{master} was brought out of Cragmaw Hideout alive, and what could be saved of {goods} came into Phandalin a tenday late.', prices: { weapon: 0.95 }, days: 7,
        control: [['triboar-trail', 'cragmaw', -6], ['triboar-trail', 'lords-alliance', 4]] },
      ignored: { text: '{master}\'s wagons were never found. Phandalin went short of {goods}, and the Trail got a worse name than it had.', prices: { weapon: 1.25, gear: 1.15 }, days: 14,
        control: [['triboar-trail', 'cragmaw', 6]] },
    },
  }),

  'caravan-run': ev('caravan-run', 'The Silver Wagons', {
    kind: 'caravan', tags: ['caravan', 'trade', 'zhentarim', 'lords-alliance', 'choice'], towns: ['phandalin', 'neverwinter'], maps: ['triboar-trail'],
    region: 'triboar-trail', level: [2, 10], weight: 3, cooldown: 40, requires: { flag: 'redbrands-broken' },
    vars: { master: 'person' },
    stages: [
      stage('announced', 'Announced', [2, 3], {
        text: 'A Lords\' Alliance wagon train under {master} will carry assayed silver out of Phandalin to Neverwinter under Sildar Hallwinter\'s seal.',
        notice: 'Silver wagons for Neverwinter muster at the Townmaster\'s Hall. Outriders wanted. Apply to the Townmaster.',
        visitors: [{ map: 'phandalin', name: '{master}', sprite: 'npc-merchant', line: 'Silver for Neverwinter, and I want blades riding with it. The Townmaster is paying. So, I hear, is somebody at the Exchange, for the opposite.' }],
      }),
      stage('road', 'On the road', [3, 4], {
        text: 'The silver wagons are rolling along the Triboar Trail, and everybody in the Sleeping Giant knows exactly when they left.',
        packs: [{ map: 'triboar-trail', group: 'zhentarim-strongarms', title: 'Black Network riders' }],
      }),
    ],
    quests: [
      { at: 1, spec: { kind: 'escort', giver: 'harbin-wester', faction: 'lords-alliance', place: 'triboar-trail', to: 'neverwinter', group: 'zhentarim-strongarms',
        title: 'Outriders for the Silver Wagons', resolves: true, outcome: 'escorted', exclusive: 'silver-wagons',
        desc: 'The Alliance\'s silver goes up the Triboar Trail with {master}, and somebody in town has sold the date. Ride with the wagons, beat off whoever comes for them, and see them to General Sabine in Neverwinter.' } },
      { at: 1, spec: { kind: 'retrieve', giver: 'halia-thornton', faction: 'zhentarim', place: 'triboar-trail', pack: [['guard', 4], ['veteran', 1]], item: 'silver-strongbox',
        title: 'A Lighter Wagon', resolves: true, outcome: 'robbed', exclusive: 'silver-wagons', crime: true,
        desc: 'Halia Thornton does not ask anybody to rob the Lords\' Alliance. She mentions, over the ledger, that one strongbox on {master}\'s wagons would pay better than a season of honest work, and that nobody at the Exchange would ask where it came from.' } },
    ],
    outcomes: {
      escorted: { text: 'The silver wagons came into Neverwinter whole. Sildar Hallwinter\'s name is good on the Trail.', control: [['triboar-trail', 'lords-alliance', 8], ['phandalin', 'zhentarim', -5]] },
      robbed: { text: 'A strongbox went missing off the silver wagons on the Triboar Trail. The Alliance blames the Zhentarim, loudly and without proof.', prices: { '*': 1.05 }, days: 10,
        control: [['phandalin', 'zhentarim', 8], ['triboar-trail', 'lords-alliance', -6]] },
      ignored: [
        [0.6, { text: 'The silver wagons reached Neverwinter a day late, with two outriders fewer than they set out with.', control: [['triboar-trail', 'lords-alliance', 2]] }],
        [0.4, { text: 'Black Network riders took a strongbox off the silver wagons on the Triboar Trail. Nobody was hanged for it.', prices: { '*': 1.05 }, days: 10,
          control: [['phandalin', 'zhentarim', 6], ['triboar-trail', 'zhentarim', 5]] }],
      ],
    },
  }),

  sickness: ev('sickness', 'Fever in the Miners\' Camp', {
    kind: 'sickness', tags: ['sickness', 'medicine', 'priest'], towns: ['phandalin'], maps: ['phandalin'],
    region: 'phandalin', level: [1, 8], weight: 3, cooldown: 35,
    stages: [
      stage('cases', 'First cases', [2, 3], { text: 'Two miners are down with a fever that makes them laugh in their sleep. Cackle fever, Sister Garaele calls it.', prices: { medicine: 1.2 } }),
      stage('spread', 'Spreading', [4, 6], {
        text: 'The cackle fever has spread through the miners\' camp. The Shrine of Luck is full, and Garaele is short of feverfew.',
        notice: 'The Shrine of Luck asks for physic herbs. Feverfew and willow bark grow wild in Neverwinter Wood.',
        visitors: [{ map: 'phandalin', name: 'Feverish Miner', sprite: 'npc-miner', line: 'Heh. Hehe. Sorry — it is the fever, it makes you laugh at nothing. Three days I have not slept, and I cannot stop laughing.' }],
        prices: { medicine: 1.4, potion: 1.2, ore: 1.15 },
      }),
    ],
    quests: [{ at: 1, spec: { kind: 'retrieve', giver: 'sister-garaele', faction: 'harpers', place: 'neverwinter-wood', item: 'physic-herbs', foe: 'wolf',
      title: 'Feverfew for the Shrine', resolves: true, gather: true,
      desc: 'Cackle fever is burning through the miners\' camp, and Sister Garaele has prayed over every bed she has. What she needs now is feverfew and willow bark from Neverwinter Wood, and someone who knows which plant is which.' } }],
    outcomes: {
      resolved: { text: 'The fever broke in the miners\' camp. Sister Garaele says Tymora\'s name over every bed and yours over two of them.' },
      ignored: { text: 'The cackle fever ran its course and took three of the miners. The claims above town stood idle for a tenday.', prices: { ore: 1.2, medicine: 1.2 }, days: 14 },
    },
  }),

  'bounty-posted': ev('bounty-posted', 'A Bounty Posted', {
    kind: 'bounty', tags: ['bounty', 'outlaw', 'road'], towns: ['phandalin'], maps: ['triboar-trail'], region: 'triboar-trail',
    level: [1, 9], weight: 4, cooldown: 12,
    vars: { outlaw: 'outlaw' },
    stages: [
      stage('posted', 'Posted', [8, 12], {
        text: 'The Townmaster has posted a bounty on {outlaw}, who has been robbing carters on the Triboar Trail.',
        notice: 'WANTED on the Triboar Trail: {outlaw}, for highway robbery and the killing of a carter. Paid on proof.',
      }),
    ],
    quests: [{ at: 0, spec: { kind: 'bounty', giver: 'harbin-wester', faction: 'lords-alliance', place: 'triboar-trail', foe: 'bandit-captain', group: 'triboar-trail-bandits', named: '{outlaw}',
      title: 'Wanted: {outlaw}', resolves: true,
      desc: '{outlaw} has robbed three wagons on the Triboar Trail this month and killed a carter who argued. The Townmaster pays on proof, and does not ask whether {outlaw} came quietly.' } }],
    outcomes: {
      resolved: { text: '{outlaw} will rob no more carters on the Triboar Trail.', control: [['triboar-trail', 'lords-alliance', 3]] },
      ignored: { text: 'The bounty on {outlaw} lapsed. {outlaw} was seen drinking in Leilon, paying in other people\'s coin.' },
    },
  }),

  'orchard-blight': ev('orchard-blight', 'Blights in the Orchard', {
    kind: 'blight', tags: ['blight', 'plants', 'farm', 'gauntlet'], towns: ['phandalin'], maps: ['phandalin', 'neverwinter-wood'],
    region: 'phandalin', level: [1, 5], weight: 2, cooldown: 45, months: [4, 5, 6, 7, 8],
    stages: [
      stage('creeping', 'Something in the trees', [3, 4], {
        text: 'Daran Edermath has found his apple trees clawed and a trail of dead twigs leading off toward Neverwinter Wood.',
        encounters: { groups: [['thundertree-blights', 3]], rate: 1.3, maps: ['neverwinter-wood'] },
      }),
    ],
    quests: [{ at: 0, spec: { kind: 'clear', giver: 'daran-edermath', faction: 'gauntlet', place: 'neverwinter-wood', group: 'thundertree-blights',
      title: 'Twig and Root', resolves: true,
      desc: 'Something walks out of Neverwinter Wood at night and claws at Daran Edermath\'s orchard. He has been out with a lantern and seen twigs that move. Find where they are coming from and put a stop to it.' } }],
    outcomes: {
      resolved: { text: 'The blights that came out of Neverwinter Wood were burned back, and Edermath Orchard fruited well.', prices: { food: 0.95 }, days: 10 },
      ignored: { text: 'Blights stripped a third of Edermath Orchard. Cider will be scarce in Phandalin this year.', prices: { food: 1.1, drink: 1.2 }, days: 20 },
    },
  }),

  // --- the country between the towns --------------------------------------

  'orc-warband': ev('orc-warband', 'Many-Arrows on the Move', {
    kind: 'raid', tags: ['orcs', 'raid', 'war'], towns: ['phandalin', 'neverwinter'], maps: ['triboar-trail', 'conyberry-ruins'],
    region: 'triboar-trail', level: [5, 12], weight: 3, cooldown: 40,
    vars: { chief: ['Ront', 'Thokk', 'Krusk', 'Mhurren', 'Holg', 'Imsh'] },
    stages: [
      stage('smoke', 'Smoke on the hills', [2, 3], { text: 'Smoke over the hills east of Conyberry. Herders say the orcs of Many-Arrows have come down out of the north under a chief called {chief}.' }),
      stage('raids', 'The warband raids', [4, 6], {
        text: '{chief}\'s warband is raiding along the Triboar Trail. Two steadings burned east of Conyberry.',
        notice: 'The Lords\' Alliance pays for the head of the orc chief {chief} and the breaking of his warband.',
        prices: { weapon: 1.2, armor: 1.15, food: 1.1 },
        encounters: { groups: [['many-arrows-warband', 4], ['wyvern-tor-orcs', 2]], rate: 1.3, maps: ['triboar-trail', 'conyberry-ruins'] },
        packs: [{ map: 'conyberry-ruins', group: 'many-arrows-warband', title: 'Many-Arrows raiders' }],
        visitors: [{ map: 'phandalin', name: 'Burned-out Steader', sprite: 'npc-farmer', line: 'Orcs. {chief}\'s lot. They fired the barn with the stock still in it and laughed while it burned. We walked here in what we had on.' }],
      }),
    ],
    quests: [{ at: 1, spec: { kind: 'clear', giver: 'sildar-hallwinter', faction: 'lords-alliance', place: 'conyberry-ruins', group: 'many-arrows-warband', named: '{chief}',
      title: 'Break {chief}\'s Warband', resolves: true,
      desc: 'An orc chief called {chief} has brought a Many-Arrows warband down onto the Triboar Trail. Sildar Hallwinter wants it broken before it finds out how few spears Phandalin has.' } }],
    outcomes: {
      resolved: { text: '{chief}\'s warband was broken among the ruins of Conyberry, and the orcs went back north.', control: [['triboar-trail', 'many-arrows', -10], ['triboar-trail', 'lords-alliance', 6]] },
      ignored: { text: '{chief}\'s warband burned four steadings and went home heavy. Many-Arrows will remember the road is open.', prices: { food: 1.15, livestock: 1.2 }, days: 14,
        control: [['triboar-trail', 'many-arrows', 12]], next: [['orc-warband', 0.3, 20]] },
    },
  }),

  'dragon-sighting': ev('dragon-sighting', 'A White Dragon over Icespire Peak', {
    kind: 'sighting', tags: ['dragon', 'cryovain', 'livestock'], towns: ['phandalin'], maps: ['wave-echo-cave-entrance', 'triboar-trail'],
    region: 'triboar-trail', level: [4, 20], weight: 2, cooldown: 70, severity: 3, requires: { notFlag: 'cryovain-slain' },
    stages: [
      stage('sighting', 'Sighted', [3, 4], { text: 'A white dragon was seen over Icespire Peak — the herders call it Cryovain. Frost on the high pastures at midsummer.' }),
      stage('hunting', 'Hunting', [5, 7], {
        text: 'Cryovain is hunting the high pastures. Sheep taken, a shepherd missing, a farmstead on the slopes frozen through overnight.',
        notice: 'By the Townmaster: no herding above the snowline until the white dragon is gone. A purse for any company that sees to it.',
        prices: { livestock: 1.3, wool: 1.35 },
        encounters: { groups: [['icespire-frost-pack', 3], ['icespire-brood', 1]], rate: 1.2, maps: ['wave-echo-cave-entrance'] },
        visitors: [{ map: 'phandalin', name: 'Frightened Herder', sprite: 'npc-herder', line: 'It came down off the snow like the wind itself. I will not go back up under Icespire — not for every sheep on the Sword Coast.' }],
      }),
    ],
    quests: [
      { at: 1, spec: { kind: 'rescue', giver: 'harbin-wester', faction: 'lords-alliance', place: 'wave-echo-cave-entrance', group: 'icespire-frost-pack', captive: 'person',
        title: 'Herders on the High Pasture', resolves: false, maxLevel: 8,
        desc: 'A family of herders is trapped in a stone hut on the high pasture, with winter wolves between them and the road and a dragon in the sky. Bring them down.' } },
      { at: 1, spec: { kind: 'hunt', giver: 'harbin-wester', faction: 'lords-alliance', place: 'icespire-peak', foe: 'cryovain', boss: true, minLevel: 7,
        title: 'Cryovain', resolves: true, flag: 'cryovain-slain',
        desc: 'The white dragon Cryovain lairs on Icespire Peak and hunts the country below it as if it owned it. Phandalin cannot pay what that is worth, but it will pay everything it has.' } },
    ],
    outcomes: {
      resolved: { text: 'Cryovain the white dragon is dead on Icespire Peak. Phandalin rang the shrine bell for an hour.', flags: { 'cryovain-slain': true } },
      ignored: { text: 'Cryovain went back to Icespire Peak fat on mutton. The herders will not go up again this year.', prices: { livestock: 1.25, wool: 1.3 }, days: 21,
        next: [['dragon-sighting', 0.4, 45]] },
    },
  }),

  'orcs-at-wyvern-tor': ev('orcs-at-wyvern-tor', 'Orcs at Wyvern Tor', {
    kind: 'raid', tags: ['orcs', 'lair'], towns: ['phandalin'], maps: ['conyberry-ruins'], region: 'triboar-trail',
    level: [3, 8], weight: 2, cooldown: 35,
    stages: [
      stage('camp', 'A camp on the tor', [6, 9], {
        text: 'A band of orcs has made camp at Wyvern Tor and is taking a toll of cattle off every drover who passes.',
        encounters: { groups: [['wyvern-tor-orcs', 3]], rate: 1.2, maps: ['conyberry-ruins'] },
      }),
    ],
    quests: [{ at: 0, spec: { kind: 'clear', giver: 'daran-edermath', faction: 'gauntlet', place: 'wyvern-tor', group: 'wyvern-tor-orcs',
      title: 'The Toll at Wyvern Tor', resolves: true,
      desc: 'Orcs have taken Wyvern Tor and are levying cattle off every drover on the Conyberry road. Daran Edermath says they are the sort that grows bolder the longer nobody answers them.' } }],
    outcomes: {
      resolved: { text: 'The orcs were driven off Wyvern Tor, and the drovers came through Conyberry again.', prices: { livestock: 0.95 }, days: 7 },
      ignored: { text: 'The orcs at Wyvern Tor drifted north with a herd that was not theirs.', prices: { livestock: 1.1 }, days: 10 },
    },
  }),

  'wolves-of-the-wood': ev('wolves-of-the-wood', 'The Grey Wolf of Neverwinter Wood', {
    kind: 'beast', tags: ['wolves', 'livestock', 'hunt'], towns: ['phandalin'], maps: ['neverwinter-wood', 'phandalin'],
    region: 'neverwinter-wood', level: [1, 5], weight: 3, cooldown: 30,
    stages: [
      stage('howling', 'Howling', [2, 3], { text: 'The wolves of Neverwinter Wood have been howling close to town at night, and a big grey one has been seen at the Alderleaf fence.' }),
      stage('taking', 'Taking stock', [4, 5], {
        text: 'A grey wolf the size of a pony is leading the Neverwinter Wood pack onto the farms. Qelline Alderleaf lost two ewes and a dog.',
        prices: { livestock: 1.15, wool: 1.1 },
        encounters: { groups: [['neverwinter-wood-wolves', 4]], rate: 1.3, maps: ['neverwinter-wood'] },
      }),
    ],
    quests: [{ at: 1, spec: { kind: 'hunt', giver: 'qelline-alderleaf', place: 'neverwinter-wood', foe: 'dire-wolf', group: 'neverwinter-wood-wolves',
      named: 'the Grey Wolf of Neverwinter Wood', title: 'The Grey Wolf', resolves: true,
      desc: 'Qelline Alderleaf has buried two ewes and a good dog this tenday. The pack that did it follows a grey wolf the size of a pony, out of Neverwinter Wood. Kill the leader and the rest will go back to deer.' } }],
    outcomes: {
      resolved: { text: 'The Grey Wolf of Neverwinter Wood is dead, and its pack has gone back to hunting deer.', prices: { livestock: 0.95 }, days: 7 },
      ignored: { text: 'The wolf pack out of Neverwinter Wood took half the Alderleaf flock before it moved on.', prices: { livestock: 1.2, wool: 1.2 }, days: 14 },
    },
  }),

  'claim-jumpers': ev('claim-jumpers', 'Trouble at the Claims', {
    kind: 'raid', tags: ['mine', 'ore', 'trade', 'zhentarim'], towns: ['phandalin'], maps: ['wave-echo-cave-entrance'],
    region: 'phandalin', level: [1, 6], weight: 3, cooldown: 30,
    vars: { beast: ['kobolds', 'stirges', 'a nest of giant spiders'], group: ['kobold-warren', 'stirge-roost', 'kryptgarden-spiders'] },
    stages: [
      stage('abandoned', 'Claims abandoned', [3, 4], {
        text: 'The miners have walked off three claims in the hills above Wave Echo Cave. Something has moved into the diggings, and nobody is going back up for their picks.',
        prices: { ore: 1.25, gem: 1.1 },
      }),
      stage('bought', 'Claims sold cheap', [3, 4], {
        text: 'The miners are selling their abandoned claims to the Miner\'s Exchange for a song. Halia Thornton is buying every one.',
        prices: { ore: 1.3 },
      }),
    ],
    quests: [{ at: 0, spec: { kind: 'clear', giver: 'harbin-wester', faction: 'lords-alliance', place: 'wave-echo-cave-entrance', group: '{group}',
      title: 'Back to the Diggings', resolves: true,
      desc: 'Something has driven the miners off their claims in the hills above Wave Echo Cave — {beast}, the ones who came back say. Harbin Wester wants the claims working before the Miner\'s Exchange buys them all for nothing.' } }],
    outcomes: {
      resolved: { text: 'The claims above Wave Echo Cave are working again, and the miners kept them.', prices: { ore: 0.9 }, days: 10, control: [['phandalin', 'lords-alliance', 4]] },
      ignored: { text: 'The Miner\'s Exchange bought up the abandoned claims above Wave Echo Cave. Every pick in those hills now works for Halia Thornton.', prices: { ore: 1.1 }, days: 20,
        control: [['phandalin', 'zhentarim', 8]] },
    },
  }),

  'merchant-feud': ev('merchant-feud', 'Barthen and the Lionshield', {
    kind: 'trade', tags: ['trade', 'merchants', 'prices', 'politics'], towns: ['phandalin'], maps: ['phandalin'],
    region: 'phandalin', level: [1, 20], weight: 2, cooldown: 60,
    stages: [
      stage('undercutting', 'Undercutting', [5, 7], {
        text: 'Elmar Barthen and Linene Graywind have fallen out over who sells rope and lamp oil in Phandalin. Both have cut their prices to the bone to spite the other.',
        prices: { gear: 0.8, tool: 0.85, weapon: 0.9 },
      }),
    ],
    quests: [{ at: 0, spec: { kind: 'negotiate', giver: 'elmar-barthen', place: 'phandalin', with: 'linene-graywind', town: true,
      title: 'A Truce Between Shops', resolves: true, tier: 'minor',
      desc: 'Elmar Barthen will be out of business by Midsummer if Linene Graywind keeps selling rope at a loss to spite him, and he knows she is too proud to stop first. Talk her round. He is too proud to do it himself.' } }],
    outcomes: {
      resolved: { text: 'Barthen and the Lionshield Coster came to terms: rope at Barthen\'s, blades at the Coster, and a handshake in front of the whole street.' },
      ignored: [
        [0.5, { text: 'Barthen and the Lionshield ran their price war until both were nearly broke, then quietly stopped. Neither will say the other\'s name.', prices: { gear: 1.1 }, days: 10 }],
        [0.5, { text: 'Linene Graywind won the price war. Barthen\'s has let a clerk go and put its prices back up.', prices: { gear: 1.15 }, days: 14 }],
      ],
    },
  }),

  'players-in-town': ev('players-in-town', 'Players from Waterdeep', {
    kind: 'festival', tags: ['festival', 'players', 'trade'], towns: ['phandalin', 'daggerford', 'neverwinter'], maps: ['phandalin', 'triboar-trail'],
    region: 'phandalin', level: [1, 20], weight: 2, cooldown: 50,
    vars: { troupe: ['the Players of the Moonstone Mask', 'Mother Tathlorn\'s Company', 'the Yawning Portal Players'], play: ['The Fall of Myth Drannor', 'Elminster\'s Folly', 'The Siege of Neverwinter'] },
    stages: [
      stage('arrival', 'The wagons roll in', [2, 2], { text: '{troupe} have come over the Triboar Trail with two painted wagons, to play {play} in the square.' }),
      stage('playing', 'Playing', [3, 4], {
        text: '{troupe} are playing {play} every evening in Phandalin. The Stonehill Inn is full to the rafters.',
        prices: { drink: 1.2, food: 1.1 },
        visitors: [{ map: 'phandalin', name: 'Travelling Player', sprite: 'npc-minstrel', line: 'Tonight in the square: {play}! Come early. The benches go first, and the good ones go to whoever stood the last round.' }],
      }),
    ],
    quests: [{ at: 0, spec: { kind: 'retrieve', giver: 'toblen-stonehill', place: 'triboar-trail', group: 'triboar-trail-bandits', item: 'strongbox',
      title: 'The Players\' Strongbox', resolves: false, tier: 'small',
      desc: '{troupe} were robbed on the Triboar Trail on the way in: their takings, their costumes and the only copy of the third act, all in one strongbox. Toblen Stonehill would like the play finished. So would the whole town.' } }],
    outcomes: {
      ignored: { text: '{troupe} played their last night of {play} to a crowd that stood on the tables, and took the Triboar Trail east in the morning.' },
    },
  }),

  'harper-courier': ev('harper-courier', 'A Courier Overdue', {
    kind: 'missing', tags: ['harpers', 'courier', 'intrigue'], towns: ['phandalin', 'neverwinter'], maps: ['neverwinter-wood'],
    region: 'neverwinter-wood', level: [3, 10], weight: 2, cooldown: 45,
    vars: { courier: 'person' },
    stages: [
      stage('overdue', 'Overdue', [4, 6], {
        text: 'A Harper courier, {courier}, should have come through Neverwinter Wood from the city four days ago. Sister Garaele has stopped pretending not to worry.',
      }),
    ],
    quests: [{ at: 0, spec: { kind: 'rescue', giver: 'sister-garaele', faction: 'harpers', place: 'neverwinter-wood', group: 'cragmaw-scouts', captive: '{courier}',
      title: 'The Road through the Wood', resolves: true,
      desc: '{courier} carries letters for the Harpers between Neverwinter and Phandalin, and never misses a day. Four days, now. Somewhere in Neverwinter Wood someone is holding a Harper, and may not yet know it.' } }],
    outcomes: {
      resolved: { text: 'The Harper courier {courier} was brought out of Neverwinter Wood alive, letters and all.', control: [['neverwinter-wood', 'cragmaw', -4]] },
      ignored: { text: 'The Harper courier {courier} never came out of Neverwinter Wood. The letters were never found, which worries the Harpers more than the courier.', control: [['phandalin', 'zhentarim', 3]] },
    },
  }),

  'restless-conyberry': ev('restless-conyberry', 'The Restless Dead of Conyberry', {
    kind: 'undead', tags: ['undead', 'ruins', 'agatha'], towns: ['phandalin'], maps: ['conyberry-ruins'], region: 'triboar-trail',
    level: [2, 8], weight: 2, cooldown: 40,
    stages: [
      stage('lights', 'Grave-lights', [3, 4], {
        text: 'Carters on the Triboar Trail\'s far end see lights among the ruins of Conyberry at night, and hear a woman weeping in the wood beyond.',
        encounters: { groups: [['conyberry-ruins-haunts', 4]], rate: 1.3, maps: ['conyberry-ruins'] },
      }),
    ],
    quests: [{ at: 0, spec: { kind: 'clear', giver: 'sister-garaele', faction: 'harpers', place: 'conyberry-ruins', group: 'conyberry-ruins-haunts',
      title: 'Lay Conyberry to Rest', resolves: true,
      desc: 'The dead of Conyberry, sacked a generation ago, have stopped sleeping. Sister Garaele has spoken to the banshee beyond the ruins once and does not mean to again; she would rather the ruins themselves were quiet.' } }],
    outcomes: {
      resolved: { text: 'The haunts of Conyberry were laid to rest. The weeping in the wood beyond has not stopped, but it never does.' },
      ignored: { text: 'The dead still walk the ruins of Conyberry at night, and the carters no longer camp there.' },
    },
  }),

  'lizardfolk-raids': ev('lizardfolk-raids', 'Lizardfolk on the High Road', {
    kind: 'raid', tags: ['lizardfolk', 'mere', 'road'], towns: ['neverwinter'], maps: ['neverwinter'], region: 'neverwinter',
    level: [4, 9], weight: 2, cooldown: 40,
    stages: [
      stage('raids', 'Raids', [5, 7], {
        text: 'Lizardfolk out of the Mere of Dead Men have taken two wagons on the High Road south of Neverwinter and dragged them into the marsh.',
        prices: { food: 1.1, cloth: 1.1 },
      }),
    ],
    quests: [{ at: 0, spec: { kind: 'clear', giver: 'general-sabine', faction: 'lords-alliance', place: 'mere-of-dead-men', group: 'mere-of-dead-men-lizardfolk',
      title: 'Out of the Mere', resolves: true,
      desc: 'Lizardfolk out of the Mere of Dead Men are taking wagons off the High Road. General Sabine will not send the Enclave\'s soldiers into the marsh, but she will pay someone who knows how to walk in one.' } }],
    outcomes: {
      resolved: { text: 'The lizardfolk raiders were driven back into the Mere of Dead Men, and the High Road is open again.', control: [['neverwinter', 'lords-alliance', 3]] },
      ignored: { text: 'The lizardfolk raids on the High Road stopped when the Mere took in the last of the wagons. Nobody went looking for the drivers.', prices: { food: 1.1 }, days: 10 },
    },
  }),

  'spider-season': ev('spider-season', 'Webs in Kryptgarden', {
    kind: 'beast', tags: ['spiders', 'forest', 'enclave'], towns: ['phandalin'], maps: ['triboar-trail'], region: 'triboar-trail',
    level: [3, 9], weight: 2, cooldown: 45,
    stages: [
      stage('webs', 'Webs', [5, 6], {
        text: 'Hunters coming out of Kryptgarden Forest talk of webs strung between the trees like sails, and one hunter who did not come out at all.',
        encounters: { groups: [['kryptgarden-spiders', 3]], rate: 1.2, maps: ['triboar-trail'] },
      }),
    ],
    quests: [{ at: 0, spec: { kind: 'clear', giver: 'reidoth', faction: 'emerald-enclave', place: 'kryptgarden-forest', group: 'kryptgarden-spiders',
      title: 'Burn the Webs', resolves: true,
      desc: 'Giant spiders have webbed the hunters\' rides into Kryptgarden Forest. Reidoth says they are breeding past what the wood can feed, which is the one kind of killing the Enclave asks for.' } }],
    outcomes: {
      resolved: { text: 'The spiders\' webs across the Kryptgarden rides were burned out, and the hunters went back in.' },
      ignored: { text: 'The webs in Kryptgarden have spread to the edge of the Triboar Trail. Furs are dear in Phandalin.', prices: { cloth: 1.15 }, days: 14 },
    },
  }),

  'ogre-toll': ev('ogre-toll', 'An Ogre\'s Toll', {
    kind: 'raid', tags: ['ogres', 'road', 'toll'], towns: ['daggerford'], maps: ['trade-way-south'], region: 'trade-way',
    level: [6, 12], weight: 3, cooldown: 30,
    stages: [
      stage('toll', 'The toll', [6, 8], {
        text: 'An ogre and a gang of orcs have planted a gate across the Trade Way south of Daggerford and are charging a toll in coin, cattle and teeth.',
        notice: 'The Duchess of Daggerford pays for the ogre\'s gate on the Trade Way to be torn down, and the ogre with it.',
        prices: { '*': 1.05, livestock: 1.1 },
        encounters: { groups: [['ogre-shakedown', 4]], rate: 1.25, maps: ['trade-way-south'] },
      }),
    ],
    quests: [{ at: 0, spec: { kind: 'clear', giver: 'morwen-daggerford', faction: 'lords-alliance', place: 'trade-way-south', group: 'ogre-shakedown',
      title: 'Tear Down the Ogre\'s Gate', resolves: true,
      desc: 'An ogre has built itself a gate across the Trade Way and is charging the caravans to pass it. The Duchess has written to Waterdeep twice. You are closer.' } }],
    outcomes: {
      resolved: { text: 'The ogre\'s gate on the Trade Way was torn down and burned, and the ogre lies under it.' },
      ignored: { text: 'The ogre on the Trade Way grew rich and lazy on its toll. The caravans price it in now.', prices: { '*': 1.05 }, days: 14, control: [['trade-way', 'many-arrows', 3]] },
    },
  }),

  'redbrand-remnants': ev('redbrand-remnants', 'The Last of the Redbrands', {
    kind: 'bounty', tags: ['redbrands', 'outlaw', 'phandalin'], towns: ['phandalin'], maps: ['triboar-trail'], region: 'phandalin',
    level: [2, 7], weight: 3, cooldown: 60, requires: { flag: 'redbrands-broken' },
    vars: { outlaw: 'outlaw' },
    stages: [
      stage('regroup', 'Regrouping', [6, 8], {
        text: 'The Redbrands who ran when Glasstaff fell have found a new captain, {outlaw}, and are waylaying carters on the Triboar Trail in their old red cloaks.',
        notice: 'Bounty: {outlaw}, late of the Redbrands, for robbery on the Triboar Trail. Paid at the Townmaster\'s Hall.',
      }),
    ],
    quests: [{ at: 0, spec: { kind: 'bounty', giver: 'harbin-wester', faction: 'lords-alliance', place: 'triboar-trail', group: 'redbrand-patrol', named: '{outlaw}',
      title: 'The Last Red Cloak', resolves: true,
      desc: 'The Redbrands who ran from Tresendar Manor have found a new captain, {outlaw}, and gone back to robbing the Trail. Harbin Wester would like the matter finished, and would like it finished by somebody else.' } }],
    outcomes: {
      resolved: { text: 'The last of the Redbrands were run down on the Triboar Trail. Nobody in Phandalin wears red any more.' },
      ignored: { text: '{outlaw}\'s Redbrands took the Trail\'s tolls for a tenday and then moved on to Leilon.', control: [['phandalin', 'zhentarim', 3]] },
    },
  }),

  // --- the cities ----------------------------------------------------------

  'noble-wedding': ev('noble-wedding', 'A Wedding in Waterdeep', {
    kind: 'wedding', tags: ['nobles', 'waterdeep', 'intrigue', 'festival'], towns: ['waterdeep', 'neverwinter', 'daggerford'], maps: ['waterdeep'],
    region: 'waterdeep', level: [6, 20], weight: 2, cooldown: 60,
    vars: { houseA: 'house', houseB: 'house', bride: 'lady', groom: 'lord' },
    stages: [
      stage('betrothal', 'Betrothal', [3, 4], { text: '{bride} of House {houseA} is to marry {groom} of House {houseB}. All the Sea Ward is invited, and half of it is furious.' }),
      stage('preparations', 'Preparations', [4, 5], {
        text: 'Waterdeep is preparing for the {houseA}–{houseB} wedding. Wine, silk and silverware are dear in every ward, and there are whispers that someone means to spoil the match.',
        prices: { fine: 1.3, drink: 1.2, cloth: 1.2 },
        visitors: [{ map: 'waterdeep', name: 'Herald of House {houseA}', sprite: 'npc-noble', line: 'Make way! House {houseA} and House {houseB} are to be joined, and all the Sea Ward is invited — save those who are not.' }],
      }),
      stage('wedding', 'The wedding', [1, 1], { text: 'The {houseA}–{houseB} wedding fills the Sea Ward with music. The watch has doubled its patrols.', prices: { fine: 1.3, drink: 1.25 } }),
    ],
    quests: [{ at: 1, spec: { kind: 'investigate', giver: 'mirt', faction: 'harpers', place: 'waterdeep', group: 'doppelganger-plot',
      title: 'Somebody Else\'s Face', resolves: true, town: true,
      clue: 'The florist\'s boy swears he delivered the lilies to {groom} twice this morning — once at the house and once, an hour later, at a warehouse in the Dock Ward. Both times the young lord paid him, and both times he paid in the same new-minted coin.',
      desc: 'Mirt has heard that someone means to spoil the {houseA}–{houseB} match, and he has heard it from a source he trusts more than he likes. Find out who, and how, before the vows.' } }],
    outcomes: {
      resolved: { text: 'A doppelganger wearing {groom}\'s face was unmasked before the {houseA}–{houseB} vows. The wedding went ahead, and the Harpers were not thanked, which is how they like it.',
        control: [['waterdeep', 'harpers', 5], ['waterdeep', 'zhentarim', -4]] },
      ignored: [
        [0.6, { text: '{bride} of House {houseA} married {groom} of House {houseB}. The Sea Ward talked of nothing else for a tenday.' }],
        [0.4, { text: 'Scandal in the Sea Ward: the man who married {bride} of House {houseA} was not {groom} at all. House {houseB} has closed its doors.', control: [['waterdeep', 'zhentarim', 6]] }],
      ],
    },
  }),

  'faction-skirmish': ev('faction-skirmish', 'The Black Network and the Alliance', {
    kind: 'skirmish', tags: ['zhentarim', 'lords-alliance', 'politics', 'choice'], towns: ['phandalin'], maps: ['phandalin', 'triboar-trail'],
    region: 'phandalin', level: [3, 12], weight: 3, cooldown: 40, requires: { flag: 'redbrands-broken' },
    stages: [
      stage('tension', 'Tension', [3, 4], { text: 'With the Redbrands gone, the Miner\'s Exchange and the Townmaster\'s Hall have stopped pretending to like each other.' }),
      stage('brawls', 'Knives out', [4, 6], {
        text: 'Black Network toughs and Alliance men have come to blows twice in the street outside the Sleeping Giant. Everyone is choosing a side.',
        packs: [{ map: 'triboar-trail', group: 'zhentarim-strongarms', title: 'Zhentarim toughs' }],
        encounters: { groups: [['zhentarim-strongarms', 3]], rate: 1.2, maps: ['triboar-trail'] },
        visitors: [{ map: 'phandalin', name: 'Zhentarim Tough', sprite: 'npc-thug', line: 'Walk on, friend. This end of the street is spoken for, and the Alliance can come and argue it if they like.' }],
      }),
    ],
    quests: [
      { at: 1, spec: { kind: 'retrieve', giver: 'sildar-hallwinter', faction: 'lords-alliance', place: 'triboar-trail', group: 'zhentarim-strongarms', item: 'zhent-ledger',
        title: 'The Exchange\'s Other Ledger', resolves: true, outcome: 'alliance', exclusive: 'black-network',
        desc: 'Sildar Hallwinter is certain the Miner\'s Exchange keeps a second ledger, and that a Zhentarim courier carries it out along the Triboar Trail every tenday. Take it off him. What it proves will do the rest.' } },
      { at: 1, spec: { kind: 'negotiate', giver: 'halia-thornton', faction: 'zhentarim', place: 'phandalin', with: 'harbin-wester', town: true,
        title: 'A Word with the Townmaster', resolves: true, outcome: 'network', exclusive: 'black-network',
        desc: 'Halia Thornton would like Harbin Wester to understand that Phandalin runs smoother when the Exchange is consulted. She would like it explained to him kindly, by someone he has no reason to fear. Yet.' } },
    ],
    outcomes: {
      alliance: { text: 'The Exchange\'s second ledger reached Neverwinter. Halia Thornton still smiles, but the Black Network has gone quiet in Phandalin.', control: [['phandalin', 'lords-alliance', 12], ['phandalin', 'zhentarim', -12]] },
      network: { text: 'Harbin Wester now consults the Miner\'s Exchange before he signs anything. Phandalin runs smoother. Everyone agrees on that.', prices: { '*': 1.04 }, days: 20,
        control: [['phandalin', 'zhentarim', 14], ['phandalin', 'lords-alliance', -10]] },
      ignored: [
        [0.5, { text: 'The street fights in Phandalin petered out with nothing settled and two men in the shrine.', control: [['phandalin', 'lords-alliance', 3]] }],
        [0.5, { text: 'The Black Network came out of the Phandalin street fights holding more of the town than it went in with.', control: [['phandalin', 'zhentarim', 6]] }],
      ],
    },
  }),

  'wererats-of-neverwinter': ev('wererats-of-neverwinter', 'Something in the Blacklake Cellars', {
    kind: 'sickness', tags: ['lycanthrope', 'sickness', 'city'], towns: ['neverwinter'], maps: ['neverwinter'],
    region: 'neverwinter', level: [4, 10], weight: 2, cooldown: 50,
    stages: [
      stage('bites', 'Bites', [3, 4], { text: 'Dockhands in Blacklake District are turning up with rat bites that will not heal, and some of them have stopped coming home at night.' }),
      stage('nests', 'Nests', [4, 5], {
        text: 'The Blacklake cellars are full of rats that watch you back. General Sabine has closed two streets.',
        notice: 'By order of the Protector\'s Enclave: Blacklake cellars closed. Companies with silver and sense apply to General Sabine.',
        prices: { medicine: 1.3, holy: 1.2 },
      }),
    ],
    quests: [{ at: 1, spec: { kind: 'clear', giver: 'general-sabine', faction: 'lords-alliance', place: 'neverwinter-wood', group: 'sewer-rats-of-neverwinter',
      title: 'Rats That Watch You Back', resolves: true,
      desc: 'Wererats have nested under Blacklake and been carrying their curse out along the smugglers\' way into Neverwinter Wood. General Sabine wants the nest in the wood burned out before the curse is a plague.' } }],
    outcomes: {
      resolved: { text: 'The wererat nest that fed on Blacklake was burned out in Neverwinter Wood.', control: [['neverwinter', 'lords-alliance', 5]] },
      ignored: { text: 'Blacklake District is still closed. Nobody who went into the cellars has come out the same.', prices: { medicine: 1.25 }, days: 20, control: [['neverwinter', 'zhentarim', 4]] },
    },
  }),

  // --- the south -----------------------------------------------------------

  flood: ev('flood', 'The Delimbiyr in Flood', {
    kind: 'flood', tags: ['flood', 'weather', 'grain'], towns: ['daggerford'], maps: ['daggerford', 'trade-way-north'],
    region: 'trade-way', level: [3, 20], weight: 2, cooldown: 60, months: [2, 3, 4, 9, 10],
    stages: [
      stage('rains', 'Rains', [2, 3], { text: 'It has rained on the Delimbiyr for five days. The ford at Daggerford is running chest-high.' }),
      stage('flood', 'Flood', [3, 4], {
        text: 'The Delimbiyr is over its banks. Farms along the Shining River are under water, and the ferry is not running.',
        notice: 'The Duchess of Daggerford asks for strong backs and boats for the flooded farms downriver.',
        prices: { grain: 1.3, food: 1.25, timber: 1.2 },
        encounters: { rate: 0.6, maps: ['trade-way-north'] },
      }),
      stage('receding', 'Receding', [2, 2], { text: 'The Delimbiyr is going down, leaving silt and dead cattle in the fields.' }),
    ],
    quests: [{ at: 1, spec: { kind: 'rescue', giver: 'morwen-daggerford', faction: 'lords-alliance', place: 'trade-way-north', foe: 'giant-frog', group: 'drowned-shallows', captive: 'person',
      title: 'High Water on the Delimbiyr', resolves: true,
      desc: 'A family is stranded on a barn roof downriver, and what has come up out of the flood-water is eating the cattle. The Duchess wants them brought in.' } }],
    outcomes: {
      resolved: { text: 'Everyone stranded by the Delimbiyr flood was brought in to Daggerford. The Duchess remembered who did it.' },
      ignored: { text: 'The Delimbiyr flood drowned three farms and their stores. Bread in Daggerford has doubled.', prices: { grain: 1.5, food: 1.3 }, days: 20, next: [['hungry-season', 0.5, 5]] },
    },
  }),

  'hungry-season': ev('hungry-season', 'A Failed Harvest', {
    kind: 'harvest', tags: ['harvest', 'grain', 'hoarding'], towns: ['daggerford', 'phandalin'], maps: ['daggerford'],
    region: 'trade-way', level: [2, 20], weight: 2, cooldown: 80, months: [7, 8, 9],
    vars: { hoarder: 'person' },
    stages: [
      stage('blight', 'Blight in the fields', [4, 5], { text: 'Rust has taken the wheat in the Delimbiyr valley. The harvest will be half what it should.', prices: { grain: 1.3 } }),
      stage('shortage', 'Shortage', [8, 12], {
        text: 'Grain is short from Daggerford to Phandalin, and a merchant named {hoarder} is said to have bought every sack in the valley before the price rose.',
        notice: 'The Duchess of Daggerford reminds all merchants that hoarding grain in a hungry season is a crime against the town.',
        prices: { grain: 1.6, food: 1.35, drink: 1.15 },
      }),
    ],
    quests: [{ at: 1, spec: { kind: 'negotiate', giver: 'morwen-daggerford', faction: 'lords-alliance', place: 'daggerford', with: 'person', withName: '{hoarder}', town: true,
      title: 'The Grain Merchant', resolves: true,
      desc: '{hoarder} is sitting on half the grain in the Delimbiyr valley and waiting for it to double. The Duchess would rather not hang a merchant in a hungry season. Persuade {hoarder} to open the warehouse at a fair price.' } }],
    outcomes: {
      resolved: { text: '{hoarder} opened the Daggerford grain warehouse at a fair price, and nobody starved.', prices: { grain: 1.1 }, days: 10 },
      ignored: { text: 'The hungry season ran its course. {hoarder} is richer, the Duchess is angrier, and the roads are thick with desperate men.', prices: { grain: 1.3 }, days: 20,
        next: [['bounty-south', 0.6, 3]] },
    },
  }),

  'bounty-south': ev('bounty-south', 'Highwaymen on the Trade Way', {
    kind: 'bounty', tags: ['bounty', 'outlaw', 'road'], towns: ['daggerford'], maps: ['trade-way-north', 'trade-way-south'], region: 'trade-way',
    level: [7, 16], weight: 3, cooldown: 25,
    vars: { outlaw: 'outlaw' },
    stages: [
      stage('posted', 'Posted', [8, 12], {
        text: 'Highwaymen under {outlaw} are stopping wagons on the Trade Way and taking a toll in coin and blood.',
        notice: 'WANTED on the Trade Way: {outlaw} and company. The Duchess pays in Daggerford on proof.',
        encounters: { groups: [['high-road-highwaymen', 3], ['coast-way-crews', 1]], rate: 1.2, maps: ['trade-way-north', 'trade-way-south'] },
      }),
    ],
    quests: [{ at: 0, spec: { kind: 'bounty', giver: 'morwen-daggerford', faction: 'lords-alliance', place: 'trade-way-south', foe: 'bandit-captain', group: 'high-road-highwaymen', named: '{outlaw}',
      title: 'Wanted: {outlaw}', resolves: true,
      desc: '{outlaw} has made the Trade Way south of Daggerford a toll road. The Duchess pays on proof.' } }],
    outcomes: {
      resolved: { text: '{outlaw}\'s highwaymen were broken on the Trade Way.', control: [['trade-way', 'lords-alliance', 4]] },
      ignored: { text: '{outlaw} still takes a toll on the Trade Way, and the caravans pay it.', prices: { '*': 1.05 }, days: 12, control: [['trade-way', 'zhentarim', 3]] },
    },
  }),

  'barrows-open': ev('barrows-open', 'The Barrows Open', {
    kind: 'undead', tags: ['undead', 'barrows', 'gauntlet'], towns: ['daggerford'], maps: ['fields-of-the-dead'], region: 'trade-way',
    level: [9, 20], weight: 2, cooldown: 50, dark: true,
    stages: [
      stage('stirring', 'Stirring', [3, 4], { text: 'Shepherds on the Fields of the Dead say the old barrows are open, and that there are lights in them at night.' }),
      stage('walking', 'The dead walk', [5, 6], {
        text: 'The barrow-dead are walking the Fields of the Dead. Hulmarra Stayanoga has asked the Order of the Gauntlet for help.',
        encounters: { groups: [['fields-barrow-host', 4], ['crypt-of-the-restless', 2]], rate: 1.35, maps: ['fields-of-the-dead'] },
        packs: [{ map: 'fields-of-the-dead', group: 'fields-barrow-host', title: 'The barrow host' }],
      }),
    ],
    quests: [{ at: 1, spec: { kind: 'clear', giver: 'hulmarra-stayanoga', faction: 'gauntlet', place: 'fields-of-the-dead', group: 'fields-barrow-host',
      title: 'Put Them Back', resolves: true,
      desc: 'The barrows on the Fields of the Dead have opened and their dead are walking. Hulmarra Stayanoga wants them put back under their stones before the next moon.' } }],
    outcomes: {
      resolved: { text: 'The barrow-dead of the Fields were put back under their stones.' },
      ignored: { text: 'The barrow-dead still walk the Fields of the Dead at night, and fewer drovers take that road.', prices: { livestock: 1.15 }, days: 20 },
    },
  }),

  // --- darker stirrings (they wait for a party that can answer them) ---------

  'cult-in-the-mere': ev('cult-in-the-mere', 'Lights in the Mere of Dead Men', {
    kind: 'cult', tags: ['cult-dragon', 'mere', 'dark'], towns: ['neverwinter', 'waterdeep'], maps: ['neverwinter-wood'],
    region: 'neverwinter', level: [7, 20], weight: 3, cooldown: 60, severity: 3, dark: true,
    stages: [
      stage('lights', 'Lights', [3, 4], { text: 'Travellers on the High Road see lights moving in the Mere of Dead Men where no lights should be — around the drowned towers of Castle Naerytar.' }),
      stage('vanishings', 'Vanishings', [5, 6], {
        text: 'Two wagons and a Lords\' Alliance rider have vanished on the High Road by the Mere. The lizardfolk are wearing purple, and the purple has dragon-masks on it.',
        notice: 'General Sabine seeks a company to go into the Mere of Dead Men and find out who is taking travellers off the High Road.',
        encounters: { groups: [['cult-of-the-dragon-cell', 3], ['mere-wisps', 2]], rate: 1.25, maps: ['neverwinter-wood'] },
      }),
      stage('rite', 'The rite', [4, 5], {
        text: 'Something is being called up out of the Mere. Neverwinter\'s wizards feel it in their teeth.',
        encounters: { groups: [['cult-of-the-dragon-cell', 3], ['mere-of-dead-men-wraiths', 2]], rate: 1.4, maps: ['neverwinter-wood'] },
      }),
    ],
    quests: [{ at: 1, spec: { kind: 'clear', giver: 'general-sabine', faction: 'lords-alliance', place: 'mere-of-dead-men', group: 'cult-of-the-dragon-cell', foe: 'cult-fanatic',
      title: 'The Purple in the Mere', resolves: true,
      desc: 'The Cult of the Dragon is taking travellers off the High Road into the Mere of Dead Men, toward Castle Naerytar. General Sabine wants the cell broken before whatever they are calling up answers.' } }],
    outcomes: {
      resolved: { text: 'The Cult of the Dragon cell in the Mere of Dead Men was broken before its rite was done.', control: [['neverwinter', 'cult-dragon', -10], ['neverwinter', 'lords-alliance', 5]] },
      ignored: { text: 'The rite in the Mere of Dead Men was finished. Something black and winged has been seen over Castle Naerytar.', control: [['neverwinter', 'cult-dragon', 12]],
        prices: { '*': 1.05 }, days: 20, next: [['cult-in-the-mere', 0.5, 30]] },
    },
  }),

  'thayan-diggers': ev('thayan-diggers', 'The Lich\'s Servants', {
    kind: 'undead', tags: ['thay', 'undead', 'szass-tam', 'dark'], towns: ['phandalin', 'neverwinter'], maps: ['triboar-trail', 'conyberry-ruins'],
    region: 'triboar-trail', level: [9, 20], weight: 2, cooldown: 70, severity: 3, dark: true,
    stages: [
      stage('digging', 'Digging', [4, 5], { text: 'Red-robed Thayans are digging again at Old Owl Well, and they are paying their labourers in coin nobody recognises.' }),
      stage('raising', 'Raising', [5, 7], {
        text: 'The dead are walking out of Old Owl Well at night. The Thayans serve Szass Tam, the lich who rules Thay, and they are not digging for Netherese pottery.',
        notice: 'The Order of the Gauntlet seeks companies sworn against the undead for work at Old Owl Well.',
        encounters: { groups: [['old-owl-well-undead', 3], ['crypt-of-the-restless', 2]], rate: 1.3, maps: ['triboar-trail', 'conyberry-ruins'] },
      }),
    ],
    quests: [{ at: 1, spec: { kind: 'clear', giver: 'daran-edermath', faction: 'gauntlet', place: 'old-owl-well', group: 'crypt-of-the-restless', foe: 'wight',
      title: 'What the Thayans Dug Up', resolves: true,
      desc: 'Servants of Szass Tam are raising the dead of a Netherese watchtower at Old Owl Well. Daran Edermath has buried enough friends to know what that becomes if it is left. Go in and end it.' } }],
    outcomes: {
      resolved: { text: 'The Thayan diggings at Old Owl Well were broken and the risen dead put down.', control: [['triboar-trail', 'thay', -10]] },
      ignored: { text: 'The Thayans at Old Owl Well finished what they came for and left. What they left behind them still walks.', control: [['triboar-trail', 'thay', 12]], next: [['thayan-diggers', 0.4, 40]] },
    },
  }),
});

export const EVENT_IDS = Object.freeze(Object.keys(EVENTS));
