// data/encounters.js — who is out on the Sword Coast's roads, why, and what they want.
//
// PURE DATA. Every entry here is a SITUATION, not a monster list: a canon group or
// creature with a reason to be where it is, something it wants from the party, and a
// shape it takes on the map (a camp with a fire, a toll post across the road, a
// caravan walking from one exit to the other, a lone scene in a ditch). The encounter
// director in rules/encounters.js decides which of these the world produces, when and
// how often; this file only says what each one IS.
//
// A situation:
//   id, name              the title card
//   kin                   who remembers what you did ('cragmaw', 'zhentarim', ...)
//   faction               the faction a deed against them is reported under
//   attitude              the 2024 DMG attitudes: 'hostile' | 'indifferent' | 'friendly',
//                         plus 'wary' — indifferent with a hand on the hilt
//   mind                  'reason' (can be talked to), 'beast', 'feral' (gnolls: hunger,
//                         not words), 'mindless' (the walking dead)
//   plea                  what they need of you: 'rescue' | 'tend' | 'lost' | 'hunger'
//   shape                 'camp' | 'post' | 'travel' | 'patrol' | 'hunt' | 'scene'
//   place                 'road' | 'roadside' | 'wild' | 'water' | 'ruins'
//   area / maps / biomes  where it happens ('north' | 'south' | 'any')
//   level [lo, hi]        the party levels it belongs to
//   time                  'any' | 'day' | 'night'
//   foes | tiers          what you fight: [[monsterId, min, max], ...]; `tiers` picks a
//                         list by party level
//   allies                who fights beside you if you help: [[monsterId, n], ...]
//   folk                  what you SEE, when it is not simply the foes
//   leader                { foe, title, names:{species, ethnicity}, marks }
//   demand                'toll' | 'purse' | 'tribute' | 'fine' | null
//   options               what can be done (see rules/encounters.js OPTION RULES)
//   lines                 opener, why, talk, pass, rout and per-option labels
//   rumor, lead, spoils   what they know, where it leads, what they carry
//   ambush, telegraph     whether it can lie in wait, and the warning that it is
//   leadOnly              only ever produced by a lead or a memory, never rolled
//
// Tokens in lines: {leader} {count} {demand} {place} {town} {dest} {from} {to}
// {coster} {contact} {attackers} {party} {name} {kin}. Everything named is Realms
// canon (docs/SETTING.md); no name here is invented.

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const k of Object.keys(o)) deepFreeze(o[k]);
  }
  return o;
}

// ---------------------------------------------------------------------------
// 1. GEOGRAPHY — which regions are "the north" and which "the south"
// ---------------------------------------------------------------------------

/** Region ids (map.region) by the half of the Sword Coast they sit in. */
export const AREAS = deepFreeze({
  north: ['triboar-trail', 'neverwinter-wood', 'conyberry', 'phandalin-hills', 'kryptgarden-forest',
    'mere-of-dead-men', 'ardeep-forest', 'neverwinter', 'waterdeep', 'phandalin', 'leilon', 'thundertree'],
  south: ['trade-way', 'coast-way', 'fields-of-the-dead', 'rosymorn-monastery', 'daggerford',
    'beregost', 'baldurs-gate', 'nashkel', 'candlekeep', 'ulgoths-beard'],
});

/**
 * The places a region's people come from and go to. `town` is the settlement a
 * lost child walks home to and a rescued merchant is paid in; `from`/`to` are the
 * two ends a caravan names; `mapId` is the map a "go home" quest step waits for.
 */
export const REGION_PLACES = deepFreeze({
  'triboar-trail': { town: 'Phandalin', mapId: 'phandalin', from: 'Neverwinter', to: 'Triboar', dest: 'the Spires of the Morning in Waterdeep' },
  'neverwinter-wood': { town: 'Phandalin', mapId: 'phandalin', from: 'Neverwinter', to: 'Phandalin', dest: 'the Spires of the Morning in Waterdeep' },
  conyberry: { town: 'Phandalin', mapId: 'phandalin', from: 'Triboar', to: 'Neverwinter', dest: 'the Spires of the Morning in Waterdeep' },
  'phandalin-hills': { town: 'Phandalin', mapId: 'phandalin', from: 'Phandalin', to: 'the Triboar Trail', dest: 'the Spires of the Morning in Waterdeep' },
  'kryptgarden-forest': { town: 'Waterdeep', mapId: 'waterdeep', from: 'Waterdeep', to: 'Neverwinter', dest: 'the Spires of the Morning in Waterdeep' },
  'mere-of-dead-men': { town: 'Neverwinter', mapId: 'neverwinter', from: 'Waterdeep', to: 'Neverwinter', dest: 'the Spires of the Morning in Waterdeep' },
  'ardeep-forest': { town: 'Waterdeep', mapId: 'waterdeep', from: 'Waterdeep', to: 'Daggerford', dest: 'the Spires of the Morning in Waterdeep' },
  'trade-way': { town: 'Daggerford', mapId: 'daggerford', from: 'Waterdeep', to: "Baldur's Gate", dest: 'Morninglow Tower in Daggerford' },
  'coast-way': { town: 'Beregost', mapId: 'beregost', from: "Baldur's Gate", to: 'Beregost', dest: 'the Song of the Morning in Beregost' },
  'fields-of-the-dead': { town: 'Daggerford', mapId: 'daggerford', from: 'Daggerford', to: "Baldur's Gate", dest: 'Morninglow Tower in Daggerford' },
  'rosymorn-monastery': { town: 'Daggerford', mapId: 'daggerford', from: 'Daggerford', to: 'the mountains', dest: 'the old monastery' },
});

/** Who a Harper courier's letter is for, by the half of the coast she fell in. */
export const HARPER_CONTACT = deepFreeze({
  north: { npc: 'sister-garaele', name: 'Sister Garaele', where: "Phandalin's Shrine of Luck", mapId: 'phandalin' },
  'trade-way': { npc: 'mirt', name: 'Mirt', where: 'Waterdeep', mapId: 'waterdeep' },
  south: { npc: 'jaheira', name: 'Jaheira', where: "the Blushing Mermaid in Baldur's Gate", mapId: 'bg-gray-harbour' },
});

/** Trading costers that really ride the Sword Coast roads. */
export const COSTERS = deepFreeze({
  north: ['the Lionshield Coster', 'the Thousandheads Trading Coster'],
  south: ['the Seven Suns Trading Coster', 'the Thousandheads Trading Coster'],
});

// ---------------------------------------------------------------------------
// 2. CREATURES THE BESTIARY DOES NOT CARRY
// ---------------------------------------------------------------------------
// rules/scaling.js makeMonster accepts a stat block object as readily as an id, so
// a creature only an encounter needs can live beside the encounter.

export const EXTRA_CREATURES = deepFreeze({
  // 2024 Monster Manual green hag: CR 3, AC 17, 82 hp. The Mere's reed-witch.
  'green-hag': {
    id: 'green-hag', name: 'Green Hag',
    desc: 'A crone with moss for hair and a voice like a friend. The old woman in the reeds was never an old woman.',
    cr: 3, type: 'fey', size: 'medium', ac: 17, acNote: 'natural armor',
    hpDice: '11d8+33', speed: 30, swim: 30,
    abilities: { str: 18, dex: 12, con: 16, int: 13, wis: 14, cha: 14 },
    skills: { arcana: 5, deception: 4, insight: 4, perception: 4, stealth: 3 },
    senses: { darkvision: 60 }, passivePerception: 14, languages: ['Common', 'Elvish', 'Sylvan'],
    traits: [
      { id: 'amphibious', name: 'Amphibious', desc: 'It can breathe air and water.', mech: null },
      { id: 'mimicry', name: 'Mimicry', desc: 'It can mimic animal sounds and humanoid voices.', mech: null },
    ],
    actions: [
      {
        id: 'multiattack', name: 'Multiattack', kind: 'multiattack', desc: 'It makes two Claw attacks.',
        attacks: [{ id: 'claw', count: 2 }], ai: { role: 'attack', weight: 1.2 },
      },
      {
        id: 'claw', name: 'Claw', kind: 'attack', reach: 5, range: null, atkBonus: 6,
        dice: '2d8+4', dtype: 'slashing', save: null, target: { kind: 'creature', count: 1 },
        effects: [], uses: null, desc: '', ai: { role: 'nuke', weight: 1 },
      },
    ],
    ai: { archetype: 'skirmisher', aggression: 0.7, selfPreserve: 0.55, preferredRange: 5 },
    loot: { gold: '3d10', table: [['potion-healing', 0.35], ['gem-moonstone', 0.2]] },
    xp: 700, sprite: 'npc-goodwife', tint: '#4f7a36', biomes: ['marsh'], groupSize: [1, 1],
    faction: 'hag',
  },
});

// ---------------------------------------------------------------------------
// 3. THE SITUATIONS
// ---------------------------------------------------------------------------

function sit(id, name, o) {
  return {
    id, name,
    kin: o.kin || id, faction: o.faction || null,
    attitude: o.attitude || 'hostile', mind: o.mind || 'reason', plea: o.plea || null,
    shape: o.shape || 'patrol', place: o.place || 'wild',
    area: o.area || 'any', maps: o.maps || null, biomes: o.biomes || null,
    level: o.level || [1, 20], time: o.time || 'any', weight: o.weight == null ? 1 : o.weight,
    weather: o.weather || null,
    foes: o.foes || null, tiers: o.tiers || null, allies: o.allies || null,
    folk: o.folk || null, leader: o.leader || null, camp: o.camp || null,
    demand: o.demand || null, options: o.options || null,
    lines: o.lines || {}, rumor: o.rumor || null, lead: o.lead || null, spoils: o.spoils || null,
    reward: o.reward || null, trade: o.trade || null, quest: o.quest || null,
    ambush: !!o.ambush, telegraph: o.telegraph || null, spotted: o.spotted || null,
    innocent: !!o.innocent, proud: !!o.proud, leadOnly: !!o.leadOnly, danger: o.danger == null ? null : o.danger,
    tags: o.tags || [], site: o.site || null,
  };
}

const NORTH_ROADS = ['triboar-trail', 'neverwinter-wood', 'conyberry-ruins', 'wave-echo-cave-entrance'];
const SOUTH_ROADS = ['trade-way-north', 'trade-way-south', 'coast-way-north', 'coast-way-south', 'fields-of-the-dead'];
const WOODS = ['forest', 'pine-forest'];

export const SITUATIONS = deepFreeze({

  // --- the Triboar Trail and the hills ---------------------------------------

  'cragmaw-raiders': sit('cragmaw-raiders', 'Cragmaw Raiding Party', {
    kin: 'cragmaw', attitude: 'hostile', shape: 'patrol', place: 'wild', area: 'north',
    maps: ['triboar-trail', 'neverwinter-wood', 'wave-echo-cave-entrance'], level: [1, 6], weight: 1.3, site: 'cragmaw-hideout',
    foes: [['goblin', 3, 5], ['goblin-boss', 0, 1], ['wolf', 0, 1]],
    leader: { foe: 'goblin-boss', title: 'the goblin boss', marks: ['with a notched ear', 'in a stolen helm two sizes too big', 'with a milky eye', 'wearing a wolf pelt'] },
    demand: 'purse',
    options: ['talk', 'pay', 'intimidate', 'deceive', 'food', 'attack', 'flee'],
    spoils: [['coster-crate', 1, 0.6]],
    ambush: true,
    lines: {
      why: [
        "They are dragging sacks of Phandalin flour and a crate stamped with the Lionshield Coster's blue lion back toward Cragmaw Hideout.",
        "They are hauling a cart-load of somebody's harvest north, and squabbling over who gets to eat first.",
      ],
      opener: [
        '"Big-folk! This Cragmaw road now. King Grol says. Shinies in the dirt, or you end up stuck full of arrows like the horses."',
        '"Stop, stop! You on Cragmaw road. You pay shinies — {demand} gold — or we make you dead and take them anyway."',
      ],
      talk: "{leader} wants coin a good deal more than a fair fight — goblins fight fair only when there is nothing else left. The crate is for Klarg at the hideout, and Klarg does not like waiting.",
      pass: 'The goblins snatch what they are given and scurry off into the brush, squabbling over it.',
      talked: 'The goblins look at each other, decide nobody wants to argue with King Grol, and slink off into the brush.',
      rout: 'The goblins break and run, shrieking, and drop what they were carrying.',
      deceive: 'Tell them King Grol sent you to collect the crate',
      intimidate: 'Loom over them and tell them to run',
      food: 'Toss them a day of rations and let greed do the rest',
    },
    rumor: ["The hideout is up the goblin trail north of the two dead horses. A bugbear called Klarg keeps it, and a wolf called Ripper keeps Klarg company."],
    telegraph: [
      'Small bare footprints cross the ruts, and a split flour sack has left a white trail into the brush.',
      'Somewhere ahead a wolf yips — and something small hisses at it to shut up.',
    ],
    spotted: 'Goblins! A handful crouch in the brush beside the road, arrows on the string, waiting for whoever comes next. They have not seen you.',
  }),

  'zhentarim-toll': sit('zhentarim-toll', 'Zhentarim Toll Post', {
    kin: 'zhentarim', faction: 'zhentarim', attitude: 'wary', shape: 'post', place: 'road', area: 'any',
    maps: ['triboar-trail', 'trade-way-north', 'coast-way-north', 'coast-way-south'], level: [1, 14], weight: 1.1,
    foes: [['thug', 2, 3], ['spy', 0, 1], ['bandit-captain', 1, 1]],
    leader: { foe: 'bandit-captain', title: 'a Fang of the Black Network', names: { species: 'human', ethnicity: 'chondathan' } },
    demand: 'toll',
    options: ['talk', 'pay', 'haggle', 'persuade', 'deceive', 'intimidate', 'attack', 'leave'],
    lines: {
      why: [
        'The Black Network "keeps this stretch of road safe", and safety is paid for by the head.',
        'The Zhentarim have strung a chain across the road and call it a customs post. Nobody has told the Lords\' Alliance.',
      ],
      opener: [
        '"Evening. Road tax, courtesy of the Black Network — {demand} gold for the lot of you, and the road stays friendly."',
        '"Hold there. There\'s a toll on this road now: {demand} gold. Pay it and you\'ll find the Network remembers its friends."',
      ],
      friendOpener: '"A friend of the Network. Go on through, and give Halia our regards."',
      talk: "{leader} is polite the way a knife is polite. The toll is a good deal cheaper than the alternative, and they would far rather be paid than bled.",
      pass: '{leader} lowers the chain and tips two fingers to a brow. "Safe road, friends."',
      rout: '{leader} weighs you up, decides the toll is not worth dying for, and waves the chain aside.',
      haggle: 'Haggle over the toll',
      persuade: "Point out the Lords' Alliance would hang them for this",
      deceive: 'Say you already paid their people at the last post',
      intimidate: 'Suggest they find another road to tax',
    },
    rumor: ["Halia Thornton at Phandalin's Miner's Exchange speaks for the Network in those hills. Do her a service and tolls like this one go away."],
  }),

  'bandit-camp': sit('bandit-camp', 'Highwaymen', {
    kin: 'bandits', faction: 'bandits', attitude: 'hostile', shape: 'camp', place: 'roadside', area: 'any',
    maps: ['triboar-trail', 'trade-way-north', 'trade-way-south', 'coast-way-north', 'coast-way-south'], level: [1, 12], weight: 1,
    foes: [['bandit', 3, 5], ['bandit-captain', 1, 1], ['mastiff', 0, 1]],
    leader: { foe: 'bandit-captain', title: 'the band\'s captain', names: { species: 'human', ethnicity: 'illuskan' } },
    camp: { tents: [1, 2], fire: true },
    demand: 'purse',
    options: ['talk', 'pay', 'haggle', 'persuade', 'intimidate', 'deceive', 'hire', 'surrender', 'attack', 'flee'],
    ambush: true,
    lines: {
      why: [
        'Deserters from the Neverwinter garrison, turned highwaymen when the pay stopped coming.',
        'Out-of-work sellswords who found the road pays better than any lord.',
      ],
      opener: [
        '"That\'s far enough. We\'ll have {demand} gold off you, friend, and you\'ll walk on with everything else you own. Fair\'s fair."',
        '"Easy now. Nobody needs to bleed today. Your purse — {demand} gold will do — and we never met."',
      ],
      talk: "{leader} talks like someone who once held a rank. They want money, not a massacre — a fight costs them men they cannot replace.",
      pass: '{leader} counts the coin, grins, and whistles the band back to the fire.',
      talked: '{leader} looks you over for a long moment, then shrugs. "Not worth the trouble. Go on, then."',
      rout: '{leader} holds up both hands. "All right! All right. The road\'s yours." The band melts back into the trees.',
      hire: 'Offer them honest work: ride with you a while',
      haggle: 'Talk the price down',
      deceive: 'Claim the Flaming Fist is half a mile behind you',
    },
    rumor: ["They say a Zhentarim wagon runs the road now and then with a strongbox under the seat, and fewer guards than you'd think."],
    telegraph: [
      'Hoofprints, shod, many of them — riders waited here not long ago, and then moved into the trees.',
      'Woodsmoke drifts across the road where there should be none.',
    ],
    spotted: 'Movement in the treeline: armed men lying in wait, watching the road the other way. They have not seen you.',
  }),

  'caravan-raid': sit('caravan-raid', 'Caravan Under Attack', {
    kin: 'caravan', faction: 'lords-alliance', attitude: 'hostile', plea: 'rescue', shape: 'scene', place: 'road', area: 'north',
    maps: ['triboar-trail', 'neverwinter-wood'], level: [1, 7], weight: 0.6,
    foes: [['goblin', 3, 5], ['goblin-boss', 0, 1], ['wolf', 0, 1]],
    allies: [['guard', 2]],
    folk: [{ sprite: 'npc-merchant', role: 'merchant' }, { sprite: 'npc-sellsword', role: 'guard', n: 2 }, { tile: 'CART', role: 'cart' }],
    leader: { foe: 'goblin-boss', title: 'the goblin boss' },
    options: ['help', 'drive', 'leave'],
    reward: { gold: 8, rescued: true },
    lines: {
      attackers: 'Cragmaw goblins',
      why: ["{coster}'s wagon out of {from} was jumped in the verges, and its guards are losing."],
      opener: [
        '"Help! In Waukeen\'s name, help us!" A wagon lies slewed across the road, its guards back to back, and {attackers} are closing in.',
      ],
      pass: 'The attackers scatter into the brush. The merchant sits down hard on the tailboard and laughs, badly.',
      help: 'Draw steel and fight beside the guards',
      drive: 'Charge in roaring and drive them off',
      leave: 'Keep walking. Not your wagon.',
      thanks: '"{coster} pays its debts," the merchant says, pressing coin on you. "Find me in {town} and there\'s a discount in it for you."',
    },
  }),

  'caravan-raid-south': sit('caravan-raid-south', 'Caravan Under Attack', {
    kin: 'caravan', faction: 'lords-alliance', attitude: 'hostile', plea: 'rescue', shape: 'scene', place: 'road', area: 'south',
    maps: SOUTH_ROADS, level: [4, 16], weight: 0.6,
    foes: [['bandit', 3, 5], ['bandit-captain', 1, 1], ['thug', 0, 2]],
    allies: [['guard', 2], ['veteran', 1]],
    folk: [{ sprite: 'npc-merchant', role: 'merchant' }, { sprite: 'npc-sellsword', role: 'guard', n: 2 }, { tile: 'CART', role: 'cart' }],
    leader: { foe: 'bandit-captain', title: 'the highwaymen\'s captain', names: { species: 'human', ethnicity: 'chondathan' } },
    options: ['help', 'drive', 'leave'],
    reward: { gold: 8, rescued: true },
    lines: {
      attackers: 'highwaymen',
      why: ["{coster}'s wagon out of {from} ran into highwaymen, and its guards are outnumbered."],
      opener: ['A wagon has been run off the Way and its guards are fighting for their lives. "To us! Whoever you are — to us!"'],
      pass: 'The highwaymen scatter. The merchant looks at the blood on the road, then at you, and fumbles for a purse.',
      help: 'Draw steel and fight beside the guards',
      drive: 'Charge in and drive the highwaymen off',
      leave: 'Keep walking. Not your wagon.',
      thanks: '"{coster} pays its debts," the merchant says, pressing coin on you. "Ask for me in {town} — there\'s a discount in it for you."',
    },
  }),

  'merchant-caravan': sit('merchant-caravan', 'Merchant Caravan', {
    kin: 'caravan', faction: 'lords-alliance', attitude: 'friendly', shape: 'travel', place: 'road', area: 'any',
    maps: NORTH_ROADS.concat(SOUTH_ROADS), level: [1, 20], weight: 1.4, innocent: true, time: 'day',
    foes: [['guard', 2, 2], ['commoner', 1, 1], ['veteran', 0, 1]],
    folk: [{ sprite: 'npc-merchant', role: 'merchant' }, { sprite: 'npc-sellsword', role: 'guard', n: 1 }, { beast: 'ox', role: 'beast' }, { tile: 'CART', role: 'cart' }],
    leader: { title: 'a trader of {coster}', names: { species: 'human', ethnicity: 'chondathan' } },
    options: ['talk', 'trade', 'ask', 'rob', 'leave'],
    trade: { kinds: ['food', 'tool', 'potion', 'ammo'], count: 12, stock: ['rations', 'torch', 'rope-hempen', 'potion-healing', 'healers-kit', 'arrow', 'oil-flask'] },
    lines: {
      why: ['{coster} wagon, {from} to {to}, with bolts of cloth, salt and lamp oil under the tarp.'],
      opener: [
        '"Well met on the road! {coster}, out of {from}, bound for {to}. Buying, selling, or just being friendly?"',
        '"Ho there! Mind the ox, she bites. You look like people who need lamp oil, and I have a wagon full of it."',
      ],
      talk: '{leader} has come up from {from} and will talk your ear off about prices, tolls and which inns water their ale.',
      pass: 'The wagon creaks on. The ox gives you a look.',
      rob: 'Tell them to hand over the strongbox',
    },
    rumor: [
      "The Zhentarim have a toll chain out on the roads now. Pay it and they're sweet as honey. Don't, and they remember your face.",
      'Goblins took a Lionshield wagon on the Triboar Trail last month. Linene Graywind in Phandalin would pay well to see those crates again.',
      "Watch the verges after dark. Things come up out of the barrows on the Fields of the Dead when the moon is new.",
    ],
  }),

  'harper-courier': sit('harper-courier', 'Wounded Courier', {
    kin: 'harpers', faction: 'harpers', attitude: 'friendly', plea: 'tend', shape: 'scene', place: 'roadside', area: 'any',
    maps: NORTH_ROADS.concat(SOUTH_ROADS), level: [1, 20], weight: 0.35,
    folk: [{ sprite: 'npc-hooded', role: 'courier', downed: true }],
    leader: { title: 'a Harper courier', names: { species: 'human', ethnicity: 'chondathan', gender: 'female' } },
    options: ['tend', 'leave'],
    quest: { kind: 'deliver' },
    reward: { gold: 12, xp: 40 },
    lines: {
      why: ['She was carrying a sealed letter for the Harpers, and someone put a crossbow bolt in her to stop it arriving.'],
      opener: [
        'A cloaked woman lies in the ditch with a crossbow bolt in her side, a silver harp pin at her collar. "Please," she whispers. "The letter. It has to reach {contact}."',
      ],
      tend: 'Kneel and tend the wound',
      leave: 'Leave her. There is nothing to be done.',
      saved: '{leader} grips your wrist. "Tell {contact} the Zhents are moving money on the roads. The letter says where. Go — I can walk from here."',
      died: 'Her breath goes out of her and does not come back. The letter is still in her hand, its seal unbroken.',
    },
    lead: { sit: 'zhent-strongbox', note: 'The courier\'s letter names a Zhentarim strongbox wagon on the roads.' },
  }),

  'lathander-pilgrims': sit('lathander-pilgrims', 'Pilgrims of the Morninglord', {
    kin: 'pilgrims', attitude: 'friendly', shape: 'travel', place: 'road', area: 'any',
    maps: NORTH_ROADS.concat(SOUTH_ROADS), level: [1, 20], weight: 0.9, time: 'day', innocent: true,
    foes: [['acolyte', 1, 1], ['commoner', 2, 3]],
    folk: [{ sprite: 'npc-acolyte', role: 'leader' }, { sprite: 'npc-villager-f', role: 'member' }, { sprite: 'npc-villager-m', role: 'member' }],
    leader: { title: 'a priest of Lathander', names: { species: 'human', ethnicity: 'chondathan' }, honorific: true },
    options: ['talk', 'pray', 'donate', 'ask', 'rob', 'leave'],
    lines: {
      why: ['They are walking to {dest} to greet the Morninglord\'s sunrise, and singing badly as they go.'],
      opener: [
        '"Dawn\'s blessing on you, travellers! We walk to {dest}. Will you share the road a while, or a prayer?"',
      ],
      talk: '{leader} has led this pilgrimage for years. The Morninglord asks only that you begin again each day — and that you not steal from pilgrims.',
      pass: 'The pilgrims walk on, one of them trying a hymn in a key that does not exist.',
      pray: 'Kneel with them for the dawn prayer',
      donate: 'Give coin toward the shrine',
      blessed: '{leader} lays a warm hand on each of your heads. "Lathander\'s light go before you."',
    },
    rumor: ["The shrine-keepers say the dead have been restless on the Fields this year. They pray against it every dawn."],
  }),

  'refugees': sit('refugees', 'Refugees on the Road', {
    kin: 'refugees', attitude: 'friendly', plea: 'hunger', shape: 'travel', place: 'road', area: 'north',
    maps: NORTH_ROADS, level: [1, 12], weight: 0.5, innocent: true,
    foes: [['commoner', 3, 4]],
    folk: [{ sprite: 'npc-farmer', role: 'leader' }, { sprite: 'npc-villager-f', role: 'member' }, { sprite: 'npc-child', role: 'member' }, { beast: 'goat', role: 'beast' }],
    leader: { title: 'a burned-out farmer', names: { species: 'human', ethnicity: 'illuskan' } },
    options: ['talk', 'food', 'donate', 'ask', 'rob', 'leave'],
    lines: {
      why: ['Orcs of Many-Arrows came down out of the north and burned their steading. Everything they own is on the goat.'],
      opener: [
        '"Please — we\'re no trouble. Orcs burned us out, up past Conyberry. We\'re going to {town}. Is it safe that way?"',
      ],
      talk: "{leader} has not slept in two days. The orcs flew a banner with Gruumsh's eye on it and camped in the old village when they were done.",
      pass: 'The refugees trudge on toward {town}, the goat complaining.',
      food: 'Share your rations with them',
      donate: 'Give them coin for the road',
      grateful: '"Tymora bless you." {leader} hands the food round to the children first.',
    },
    rumor: ['The war band camped in the ruins at Conyberry when they were done with us. They will still be there, drunk on our ale.'],
    lead: { sit: 'many-arrows-camp', maps: ['conyberry-ruins', 'triboar-trail', 'neverwinter-wood'], note: 'Refugees say the Many-Arrows war band camps in the ruins.' },
  }),

  'refugees-elturel': sit('refugees-elturel', 'Refugees from Elturel', {
    kin: 'refugees', attitude: 'friendly', plea: 'hunger', shape: 'travel', place: 'road', area: 'south',
    maps: SOUTH_ROADS, level: [1, 20], weight: 0.45, innocent: true,
    foes: [['commoner', 3, 4]],
    folk: [{ sprite: 'npc-goodwife', role: 'leader' }, { sprite: 'npc-villager-m', role: 'member' }, { sprite: 'npc-child', role: 'member' }],
    leader: { title: 'an Elturian widow', names: { species: 'human', ethnicity: 'chondathan', gender: 'female' } },
    options: ['talk', 'food', 'donate', 'ask', 'rob', 'leave'],
    lines: {
      why: ['Their city was dragged into Avernus and came back changed. They have been on the road ever since, and Baldur\'s Gate does not want them.'],
      opener: ['"Mercy, travellers. We are from Elturel — what\'s left of it. Is there work in {town}? Is there bread?"'],
      talk: "{leader} still wears the Companion's sun on a cord, though the thing itself fell into the Hells with the city.",
      pass: 'They walk on toward {town}, the children quiet in the way children should never be.',
      food: 'Share your rations with them',
      donate: 'Give them coin for the road',
      grateful: '"Torm keep you." {leader} does not quite manage to smile.',
    },
    rumor: ["The Flaming Fist turns refugees back at the Basilisk Gate. The smugglers on the Coast Way will get you in, for a price."],
  }),

  'hunting-party': sit('hunting-party', 'Hunting Party', {
    kin: 'hunters', attitude: 'indifferent', shape: 'hunt', place: 'wild', area: 'any',
    biomes: WOODS.concat(['hills', 'plains', 'road', 'mountain']), maps: NORTH_ROADS.concat(['kryptgarden-forest', 'ardeep-forest', 'trade-way-north']),
    level: [1, 20], weight: 0.9, innocent: true, time: 'day',
    foes: [['scout', 1, 2], ['mastiff', 1, 1]],
    folk: [{ sprite: 'npc-hunter', role: 'leader' }, { sprite: 'npc-hunter', role: 'member' }, { beast: 'dog', role: 'beast' }],
    leader: { title: 'a huntsman out of {town}', names: { species: 'human', ethnicity: 'illuskan' } },
    options: ['talk', 'hunt', 'trade', 'ask', 'leave'],
    trade: { kinds: ['food'], count: 5, stock: ['rations', 'trail-bread', 'waterskin'] },
    lines: {
      why: ['Out after a stag for the {town} table, and keeping one eye out for whatever has been taking sheep.'],
      opener: ['"Quietly, if you please — there\'s a stag in those trees and I\'ve walked two days for him."'],
      talk: '{leader} knows these woods like a kitchen. Something big has been taking sheep off the high pastures, and it is not wolves.',
      pass: 'The hunters melt back into the trees without a sound.',
      hunt: 'Join the hunt for a while',
    },
    rumor: ["There's an owlbear denning in these woods with young. Leave her be and she'll leave you be. Probably."],
    lead: { sit: 'owlbear-cubs', note: 'The hunters warned of an owlbear denning with cubs.' },
  }),

  'wolves-shepherd': sit('wolves-shepherd', 'Wolves at the Flock', {
    kin: 'wolves', attitude: 'hostile', mind: 'beast', plea: 'rescue', shape: 'scene', place: 'wild', area: 'any',
    biomes: WOODS.concat(['hills', 'plains', 'road']), maps: NORTH_ROADS.concat(['trade-way-north', 'coast-way-north']),
    level: [1, 8], weight: 0.8,
    tiers: [
      { level: [1, 4], foes: [['wolf', 3, 4]] },
      { level: [5, 8], foes: [['wolf', 2, 3], ['dire-wolf', 1, 2]] },
    ],
    folk: [{ sprite: 'npc-herder', role: 'shepherd' }, { beast: 'sheep', role: 'flock', n: 2 }],
    leader: { foe: 'wolf', title: 'the pack' },
    options: ['help', 'drive', 'food', 'leave'],
    reward: { gold: 2, items: [['rations', 2]] },
    lines: {
      why: ['A lean pack, hungry after a hard season, has cut a shepherd and her last sheep off from the fold.'],
      opener: ['Wolves circle a lone shepherd and two terrified sheep, closing a little with every pass. The shepherd swings her crook and shouts at you: "Don\'t just stand there!"'],
      pass: 'The wolves lope off into the long grass, and the shepherd sits down in the middle of her sheep.',
      help: 'Wade in and fight the pack',
      drive: 'Drive them off with fire and noise',
      food: 'Throw the pack meat to draw them off',
      leave: 'Leave her to it',
      thanks: '"Chauntea keep you." The shepherd presses cheese and bread on you, and will not hear no.',
    },
    rumor: ["The pack's been bold since the snows. They say the old pack leader was killed and nobody's sure what took it."],
  }),

  'lost-child': sit('lost-child', 'A Lost Child', {
    kin: 'lost-child', attitude: 'friendly', plea: 'lost', shape: 'scene', place: 'wild', area: 'any',
    biomes: WOODS.concat(['hills', 'plains', 'road']), maps: NORTH_ROADS.concat(['trade-way-north']), level: [1, 20], weight: 0.3,
    folk: [{ sprite: 'npc-child', role: 'child' }],
    leader: { title: 'a child from {town}', names: { species: 'halfling' } },
    options: ['talk', 'escort', 'ask', 'leave'],
    quest: { kind: 'home' },
    reward: { gold: 6, xp: 25 },
    lines: {
      why: ['She followed a hare into the long grass and could not find the road again. She has been very brave about it.'],
      opener: ['A small girl sits on a stump with her knees drawn up, trying very hard not to cry. "I\'m not lost," she says. "I just don\'t know where {town} is."'],
      talk: '{leader} has been out here since yesterday. She is cold, hungry and absolutely furious with the hare.',
      escort: 'Promise to take her home',
      leave: 'Point her the way and walk on',
      home: '"You\'ll take me home? Really?" {leader} takes your hand as if that settles it.',
    },
    rumor: ['"There was a lady in the reeds by the water who said she\'d take me home. She smelled like a pond. I didn\'t go."'],
  }),

  'owlbear-cubs': sit('owlbear-cubs', 'Owlbear Den', {
    kin: 'owlbear', faction: 'emerald-enclave', attitude: 'hostile', mind: 'beast', shape: 'scene', place: 'wild', area: 'any',
    biomes: WOODS, maps: ['neverwinter-wood', 'triboar-trail', 'kryptgarden-forest', 'ardeep-forest'], level: [2, 10], weight: 0.7,
    foes: [['owlbear', 1, 1]],
    folk: [{ monster: 'owlbear', role: 'mother' }, { monster: 'owlbear', role: 'cub', n: 2, scale: 0.55 }],
    leader: { foe: 'owlbear', title: 'a mother owlbear' },
    options: ['leave', 'food', 'attack'],
    lines: {
      why: ['It is not hunting. It is guarding.'],
      opener: ['A great owlbear rears up over a nest of snapped branches, two fluffy cubs squalling behind her. She hoots a warning you feel in your teeth.'],
      leave: 'Back away slowly and leave her be',
      food: 'Leave your rations for her and back off',
      pass: 'The owlbear watches you go until the trees close between you, then settles back over her cubs.',
    },
    tags: ['cubs'],
  }),

  'barrow-dead': sit('barrow-dead', 'The Restless Dead', {
    kin: 'undead', attitude: 'hostile', mind: 'mindless', shape: 'patrol', place: 'ruins', area: 'any', time: 'night',
    maps: ['fields-of-the-dead', 'conyberry-ruins', 'triboar-trail', 'rosymorn-monastery'], level: [1, 16], weight: 1.4,
    tiers: [
      { level: [1, 4], foes: [['skeleton', 2, 4], ['zombie', 1, 3]] },
      { level: [5, 9], foes: [['ghoul', 2, 3], ['ghast', 0, 1], ['skeleton', 1, 3]] },
      { level: [10, 16], foes: [['wight', 1, 2], ['ghoul', 2, 4], ['specter', 0, 1]] },
    ],
    leader: { title: 'the barrow-dead' },
    options: ['turn', 'attack', 'flee'],
    ambush: true,
    lines: {
      why: [
        'The dead of the old wars walk when the moon is dark, and they are drawn to warmth.',
        'Nobody ever said the rites over these graves. The dead have noticed.',
      ],
      opener: ['Grave-dirt still clings to them. {count} of the dead shamble out of the dark, drawn by the warmth of the living.'],
      pass: 'The dead lose interest as the living draw away, and stand swaying in the dark.',
      turn: 'Present your holy symbol and turn them',
    },
    telegraph: [
      'The night goes cold all at once, and the crickets stop.',
      'Somewhere in the dark, earth is being dug — from underneath.',
    ],
    spotted: 'Shapes stand among the grave-mounds ahead, too still to be living. They have not turned toward you yet.',
  }),

  'uthgardt-raiders': sit('uthgardt-raiders', 'Uthgardt Raiders', {
    kin: 'uthgardt', attitude: 'hostile', shape: 'patrol', place: 'wild', area: 'north', proud: true,
    maps: ['neverwinter-wood', 'conyberry-ruins', 'triboar-trail'], level: [2, 12], weight: 0.8,
    foes: [['berserker', 2, 4], ['scout', 0, 1], ['mastiff', 0, 1]],
    leader: { foe: 'berserker', title: 'a war chief of the Uthgardt', names: { species: 'human', ethnicity: 'illuskan', single: true } },
    options: ['talk', 'duel', 'intimidate', 'attack', 'flee'],
    lines: {
      why: ['They are hunting through lands their ancestors held before any city on this coast was built, and they do not ask leave.'],
      opener: ['"You walk the lands of Uthgar\'s people, soft-foot. Tempus sees you. Choose: blood — or a champion."'],
      talk: '{leader} is not interested in your coin. The Uthgardt respect only strength, and a champion who wins earns the whole party safe passage.',
      pass: '{leader} strikes a fist to the chest. "Go. Uthgar will hear of this."',
      rout: '{leader} laughs at your nerve, and the war band parts to let you through.',
      duel: 'Send your champion to fight theirs',
      intimidate: 'Meet their eyes and refuse to give ground',
    },
    rumor: ["Conyberry fell to the Uthgardt a lifetime ago. They still call it a victory."],
    ambush: true,
    telegraph: [
      'A totem of antlers and elk-skull has been lashed to a tree at the path\'s edge. It was not there last season.',
      'Somewhere in the trees, a low chant starts, and stops, and does not start again.',
    ],
    spotted: 'Painted warriors crouch among the trunks ahead, axes across their knees, waiting for the road to bring them someone worth fighting. They have not seen you.',
  }),

  'many-arrows-warband': sit('many-arrows-warband', 'Many-Arrows War Band', {
    kin: 'many-arrows', faction: 'many-arrows', attitude: 'hostile', shape: 'patrol', place: 'wild', area: 'north', proud: true,
    maps: ['conyberry-ruins', 'neverwinter-wood', 'triboar-trail', 'wave-echo-cave-entrance'], level: [2, 12], weight: 0.8, site: 'wyvern-tor',
    foes: [['orc', 3, 5], ['orog', 0, 1], ['orc-war-chief', 0, 1]],
    leader: { foe: 'orc-war-chief', title: 'the war band\'s chief', names: { species: 'orc' } },
    demand: 'tribute',
    options: ['talk', 'pay', 'intimidate', 'duel', 'attack', 'flee'],
    ambush: true,
    lines: {
      why: ["A war band flying the Eye of Gruumsh, a long way from Obould's kingdom, stripping the country as it goes."],
      opener: ['"Gruumsh sees you, little meat. The war band takes its due: {demand} gold. Or it takes you."'],
      talk: '{leader} will take tribute and call it a victory. Orcs of Many-Arrows respect a strong arm more than a full purse, though.',
      pass: '{leader} bites the coin and sends the band on with a bark.',
      talked: '{leader} spits, and waves the war band on. Today you are not worth the arrows.',
      rout: 'The orcs mutter, but {leader} waves them off. You are not worth the blood.',
      duel: 'Challenge their chief to single combat',
    },
    telegraph: ['A scalp hangs from a branch by the road — a warning, and a boast.'],
    spotted: 'Orcs, a dozen paces off the road, squatting around a looted cask. The one on watch is facing the wrong way.',
  }),

  'many-arrows-camp': sit('many-arrows-camp', 'Orc Camp', {
    kin: 'many-arrows', faction: 'many-arrows', attitude: 'hostile', shape: 'camp', place: 'ruins', area: 'north', leadOnly: true,
    maps: ['conyberry-ruins', 'neverwinter-wood', 'triboar-trail'], level: [2, 12], weight: 1, proud: true,
    foes: [['orc', 3, 5], ['orog', 0, 1], ['orc-war-chief', 1, 1]],
    leader: { foe: 'orc-war-chief', title: 'the war band\'s chief', names: { species: 'orc' } },
    camp: { tents: [2, 3], fire: true },
    demand: 'tribute',
    options: ['talk', 'pay', 'intimidate', 'duel', 'attack', 'flee'],
    spoils: [['rations', 4, 1]],
    lines: {
      why: ['The war band that burned the steadings, sleeping off the farmers\' ale around a stolen fire.'],
      opener: ['"More meat walks in! Gruumsh is generous tonight."'],
      talk: '{leader} has a wagon-load of stolen grain and no intention of giving it back.',
      pass: '{leader} bites the coin and throws another log on the fire.',
      talked: '{leader} grunts and turns back to the fire. You are not worth getting up for.',
      rout: 'The camp stirs, grumbling, and the orcs decide you are more trouble than you are worth.',
    },
  }),

  'dragon-cultists': sit('dragon-cultists', 'Cult of the Dragon', {
    kin: 'cult-dragon', faction: 'cult-dragon', attitude: 'wary', shape: 'patrol', place: 'wild', area: 'any',
    maps: ['mere-of-dead-men', 'kryptgarden-forest', 'neverwinter-wood', 'rosymorn-monastery'], level: [2, 14], weight: 0.9, site: 'thundertree',
    foes: [['cultist', 3, 5], ['cult-fanatic', 1, 1]],
    leader: { foe: 'cult-fanatic', title: 'a Dragonwing of the Cult', names: { species: 'human', ethnicity: 'chondathan' } },
    options: ['talk', 'deceive', 'persuade', 'intimidate', 'attack', 'flee'],
    lines: {
      why: [
        "They carry a tithe-chest of coin and gems for a green wyrm's hoard.",
        'They are searching for a lost dragon mask, and they think it is somewhere near.',
      ],
      opener: ['"Halt. This road is watched by the Wearers of the Masks. Speak your purpose — carefully."'],
      talk: '{leader} speaks of the dragons returning to rule as if it were the weather. They are suspicious, but they want no fight they did not choose.',
      pass: '{leader} studies you a moment longer, then waves the cultists on.',
      rout: 'The cultists close ranks around their chest and hurry off the way they came.',
      deceive: 'Give the cult\'s greeting and claim to be a Dragonclaw',
    },
    rumor: ["The cult has been meeting in the ash-ruins of Thundertree. There's a green dragon in the old tower there, and they're trying to talk to it."],
  }),

  'gnoll-pack': sit('gnoll-pack', 'Gnoll Hunting Pack', {
    kin: 'gnolls', attitude: 'hostile', mind: 'feral', shape: 'hunt', place: 'wild', area: 'any',
    maps: ['wave-echo-cave-entrance', 'triboar-trail', 'trade-way-north', 'trade-way-south', 'fields-of-the-dead'], level: [2, 12], weight: 0.7,
    foes: [['gnoll', 3, 5], ['gnoll-pack-lord', 0, 1], ['hyena', 1, 2]],
    leader: { foe: 'gnoll-pack-lord', title: 'the pack lord', marks: ['with a necklace of finger-bones', 'dragging a broken spear'] },
    options: ['food', 'attack', 'flee'],
    ambush: true,
    lines: {
      why: ["Yeenoghu's hunger walks in them. They are following the smell of the road."],
      opener: ['Hyena laughter, and then the gnolls — {count} of them, loping, noses down on your trail. There are no words in them at all.'],
      food: 'Hurl your rations and run while they fight over it',
      pass: 'The pack falls on the food, snapping at each other, and you are forgotten.',
    },
    telegraph: [
      'Something has been eaten here, and not long ago. The bones are cracked for the marrow.',
      'Far off, something laughs. It is not a person.',
    ],
    spotted: 'Gnolls, nosing at a carcass in the long grass. The wind is in your face. They have not smelled you yet.',
  }),

  'dwarf-prospectors': sit('dwarf-prospectors', 'Dwarf Prospectors', {
    kin: 'prospectors', attitude: 'friendly', shape: 'camp', place: 'roadside', area: 'north',
    maps: ['triboar-trail', 'wave-echo-cave-entrance'], level: [1, 10], weight: 0.6, innocent: true,
    foes: [['guard', 2, 2]],
    folk: [{ sprite: 'npc-dwarf', role: 'leader' }, { sprite: 'npc-dwarf', role: 'member' }, { beast: 'horse', role: 'beast' }],
    leader: { title: 'a prospector', names: { species: 'dwarf' } },
    camp: { tents: [1, 1], fire: true },
    options: ['talk', 'trade', 'ask', 'rob', 'leave'],
    trade: { kinds: ['tool', 'material', 'gem'], count: 8, stock: ['war-pick', 'shovel', 'crowbar', 'rope-hempen', 'lantern-hooded'] },
    lines: {
      why: ['They have heard the old stories of Wave Echo Cave and the Forge of Spells, and they mean to be first.'],
      opener: ['"Moradin\'s beard, company! Sit, sit. You don\'t happen to know the way to a lost mine?"'],
      talk: '{leader} has a map drawn on a shoulder of mutton and more confidence than the map deserves.',
      pass: 'The dwarves go back to arguing over the map.',
    },
    rumor: ["Wave Echo Cave's real, lad. The Phandelver's Pact dug it with the gnomes and wizards. Orcs broke it five hundred years back, and something's been living in it since."],
  }),

  'peddler': sit('peddler', 'Travelling Peddler', {
    kin: 'peddler', attitude: 'friendly', shape: 'travel', place: 'road', area: 'any',
    maps: NORTH_ROADS.concat(SOUTH_ROADS), level: [1, 20], weight: 0.7, innocent: true, time: 'day',
    foes: [['commoner', 1, 1]],
    folk: [{ sprite: 'npc-halfling', role: 'leader' }, { beast: 'horse', role: 'beast' }],
    leader: { title: 'a travelling peddler', names: { species: 'gnome' } },
    options: ['talk', 'trade', 'ask', 'rob', 'leave'],
    trade: { kinds: ['tool', 'food', 'potion', 'scroll'], count: 10, stock: ['tinderbox', 'candle', 'chalk', 'potion-healing', 'antitoxin'] },
    lines: {
      why: ['Pots, pans, charms against the evil eye, and a very small pony.'],
      opener: ['"Pots! Pans! Charms against goblins, wolves and mothers-in-law! Step up, step up, it\'s all nearly new."'],
      talk: '{leader} has walked every road between Waterdeep and Baldur\'s Gate and sold something on all of them.',
      pass: 'The peddler clanks off down the road, singing.',
    },
    rumor: [
      "Candlekeep lets you in if you bring them a book they haven't got. Good luck finding one.",
      "Heard there's a banshee at Conyberry who'll answer a question if you bring her something pretty. I've no questions that need answering that badly.",
    ],
  }),

  'agatha-seekers': sit('agatha-seekers', 'Seekers of the Banshee', {
    kin: 'seekers', attitude: 'friendly', shape: 'camp', place: 'ruins', area: 'north',
    maps: ['conyberry-ruins', 'triboar-trail'], level: [1, 10], weight: 0.5, innocent: true,
    foes: [['noble', 1, 1], ['guard', 1, 1]],
    folk: [{ sprite: 'npc-scholar', role: 'leader' }, { sprite: 'npc-sellsword', role: 'guard' }],
    leader: { title: 'a scholar from Neverwinter', names: { species: 'human', ethnicity: 'chondathan', gender: 'female' } },
    camp: { tents: [1, 1], fire: true },
    options: ['talk', 'ask', 'leave', 'rob'],
    lines: {
      why: ['She has come all the way from Neverwinter to put one question to Agatha, the banshee of the woods past Conyberry.'],
      opener: ['"You\'ve come about the banshee too? No? Then you\'re the only ones on this road who haven\'t."'],
      talk: '{leader} carries a silver comb wrapped in silk. Agatha loved beautiful things in life, the old accounts say, and will answer a question for a gift of one.',
      pass: '{leader} goes back to her notes, muttering about the proper forms of address for the dead.',
    },
    rumor: ["Agatha answers one question for one gift. Ask it well — she will not answer another."],
  }),

  'ogre-toll': sit('ogre-toll', 'Ogre on the Way', {
    kin: 'ogre', attitude: 'hostile', shape: 'post', place: 'road', area: 'south',
    maps: ['trade-way-north', 'trade-way-south'], level: [4, 12], weight: 0.7,
    foes: [['ogre', 1, 1], ['orc', 0, 3], ['half-ogre', 0, 1]],
    leader: { foe: 'ogre', title: 'an ogre', marks: ['with a cartwheel for a shield', 'wearing a farmer\'s door as a hat'] },
    demand: 'tribute',
    options: ['talk', 'pay', 'food', 'deceive', 'intimidate', 'attack', 'flee'],
    lines: {
      why: ['It has decided the road is its road, and everything on it is supper or tax.'],
      opener: ['"Road mine. You pay. Gold. Or sheep. Or you." It considers. "You is fine."'],
      talk: '{leader} can count to about four. It wants food, then gold, then you, in that order.',
      pass: 'The ogre stomps aside, happy, chewing.',
      talked: 'The ogre looks worried, then very worried, and lumbers off the road to hide behind a tree.',
      rout: 'The ogre looks at you, looks at its club, and decides it has had enough exercise for one day.',
      deceive: 'Tell it the road belongs to a much bigger ogre',
      food: 'Feed it your rations',
    },
  }),

  'lizardfolk-hunters': sit('lizardfolk-hunters', 'Lizardfolk Hunters', {
    kin: 'lizardfolk', attitude: 'indifferent', shape: 'hunt', place: 'water', area: 'north',
    maps: ['mere-of-dead-men'], biomes: ['marsh'], level: [2, 10], weight: 1,
    foes: [['lizardfolk', 2, 4], ['giant-lizard', 0, 1]],
    leader: { foe: 'lizardfolk', title: 'a lizardfolk hunter' },
    options: ['talk', 'food', 'trade', 'attack', 'leave'],
    trade: { kinds: ['food', 'material'], count: 5, stock: ['rations'] },
    lines: {
      why: ['They are hunting. Anything that swims, flies or walks through the Mere is food, eventually.'],
      opener: ['A lizardfolk hunter rises out of the reeds, spear level, and speaks in careful Common. "You are not food. Yet. Why are you in the wet?"'],
      talk: '{leader} thinks about everything in terms of meals. You are a poor one — too much armour.',
      pass: 'The hunters slide back into the water without a ripple.',
      food: 'Offer them meat as a guest-gift',
    },
    rumor: ['"The old woman in the reeds is not an old woman. We do not hunt near her. You should not either."'],
  }),

  'green-hag': sit('green-hag', 'The Old Woman in the Reeds', {
    kin: 'hag', attitude: 'indifferent', shape: 'scene', place: 'water', area: 'north',
    maps: ['mere-of-dead-men'], biomes: ['marsh'], level: [3, 12], weight: 0.6,
    foes: [['green-hag', 1, 1], ['bullywug', 0, 2]],
    folk: [{ sprite: 'npc-goodwife', role: 'leader' }],
    leader: { foe: 'green-hag', title: 'an old woman gathering reeds' },
    options: ['talk', 'bargain', 'recognise', 'leave', 'attack'],
    lines: {
      why: ['She knows your name before you give it, and she has been waiting for someone exactly like you.'],
      opener: ['An old woman gathering reeds straightens with a creak and smiles with all of her teeth. "Well now. {name}. I did wonder when you\'d come this way. Sit with an old woman a moment?"'],
      talk: 'She asks after your mother by name. You never told her your mother\'s name.',
      bargain: 'Ask what she is offering',
      recognise: 'Look at her properly',
      pass: 'The old woman goes back to her reeds, humming. When you look back, there is nobody there.',
      revealed: 'The glamour slides off her like pond-water: green skin, moss hair, claws like a heron\'s bill. A green hag, and she is delighted you noticed.',
    },
    tags: ['fey'],
  }),

  'flaming-fist-patrol': sit('flaming-fist-patrol', 'Flaming Fist Patrol', {
    kin: 'flaming-fist', faction: 'flaming-fist', attitude: 'wary', shape: 'patrol', place: 'road', area: 'south',
    maps: ['coast-way-north', 'coast-way-south', 'trade-way-south'], level: [4, 20], weight: 1,
    foes: [['guard', 2, 3], ['veteran', 1, 1]],
    leader: { foe: 'veteran', title: 'a Flaming Fist sergeant', names: { species: 'human', ethnicity: 'calishite' } },
    demand: 'fine',
    options: ['talk', 'persuade', 'deceive', 'pay', 'attack', 'leave'],
    lines: {
      why: ["Riding the Coast Way for Baldur's Gate, looking for smugglers, deserters and anyone with a price on their head."],
      opener: ['"Flaming Fist. Names, business, and where you\'re bound — and keep your hands where I can see them."'],
      wanted: '"Well, well. There\'s paper on you in Baldur\'s Gate — {demand} gold. You can pay it here, or you can come quietly."',
      talk: '{leader} is tired, underpaid and has been told to find smugglers. You are not smugglers. Probably.',
      pass: '{leader} waves you on. "Keep to the road. The Coast Way crews don\'t."',
      persuade: 'Explain your business plainly',
      deceive: 'Give them a false name',
      pay: 'Pay the fine',
    },
    rumor: ["Smugglers run the coves south of the Gate. The Guild's behind half of it and the Zhents the other half, and they hate each other almost as much as they hate us."],
  }),

  'coast-smugglers': sit('coast-smugglers', 'Coast Way Smugglers', {
    kin: 'smugglers', faction: 'zhentarim', attitude: 'wary', shape: 'camp', place: 'roadside', area: 'south',
    maps: ['coast-way-north', 'coast-way-south'], level: [5, 16], weight: 0.8,
    foes: [['thug', 2, 4], ['bandit-captain', 1, 1], ['scout', 0, 1]],
    leader: { foe: 'bandit-captain', title: 'the crew\'s boss', names: { species: 'human', ethnicity: 'calishite' } },
    camp: { tents: [1, 2], fire: true },
    options: ['talk', 'trade', 'hush', 'intimidate', 'attack', 'leave'],
    trade: { kinds: ['potion', 'poison', 'tool'], count: 8, stock: ['antitoxin', 'potion-healing', 'thieves-tools'] },
    lines: {
      why: ['Crates off a ship that never put in at Baldur\'s Gate, waiting on a wagon that is late.'],
      opener: ['"You didn\'t see us. We didn\'t see you. That\'s the best way for everybody, isn\'t it?"'],
      talk: '{leader} would much rather pay you to forget than fight you to make sure. Nothing in these crates is on any manifest.',
      pass: '{leader} nods once. "Good. Off you go."',
      hush: 'Take their silver and forget you saw them',
    },
    rumor: ["The Fist turns refugees back at the gate. We don't. For a price."],
  }),

  'zhent-strongbox': sit('zhent-strongbox', 'Zhentarim Strongbox Wagon', {
    kin: 'zhentarim', faction: 'zhentarim', attitude: 'wary', shape: 'travel', place: 'road', area: 'any', leadOnly: true,
    maps: ['triboar-trail', 'trade-way-north', 'coast-way-north'], level: [1, 16], weight: 1,
    foes: [['thug', 2, 3], ['spy', 1, 1]],
    folk: [{ monster: 'spy', role: 'leader' }, { monster: 'thug', role: 'guard', n: 2 }, { beast: 'horse', role: 'beast' }, { tile: 'CART', role: 'cart' }],
    leader: { foe: 'spy', title: 'a Wolf of the Black Network', names: { species: 'human', ethnicity: 'chondathan' } },
    options: ['talk', 'deceive', 'rob', 'attack', 'leave'],
    spoils: [['gem-moonstone', 1, 1]],
    reward: { gold: 25 },
    lines: {
      why: ['A plain wagon with too many guards for its cargo, and a strongbox chained under the driver\'s seat.'],
      opener: ['"Keep walking, friend. Nothing on this wagon you want, and nothing you\'d live to spend."'],
      talk: '{leader} is careful not to look at the seat. Whatever is in that box is paying for friends in high places.',
      pass: 'The wagon rolls on, the guards watching you over their shoulders until the road bends.',
      deceive: "Say Halia Thornton sent you as the relief escort",
      rob: 'Demand the strongbox',
      robbed: 'Under the seat: a strongbox of coin, a moonstone, and a ledger of bribes paid in three cities.',
    },
    tags: ['strongbox'],
  }),

  'returning-captain': sit('returning-captain', 'An Old Acquaintance', {
    kin: 'bandits', faction: 'bandits', attitude: 'friendly', shape: 'scene', place: 'roadside', area: 'any', leadOnly: true,
    maps: NORTH_ROADS.concat(SOUTH_ROADS), level: [1, 20], weight: 1,
    foes: [['bandit-captain', 1, 1], ['bandit', 2, 2]],
    leader: { foe: 'bandit-captain', title: 'the captain you let go' },
    options: ['talk', 'accept', 'refuse', 'attack'],
    lines: {
      why: ['You spared {leader} once. Highwaymen have long memories — for debts, and for opportunities.'],
      opener: ['"{name}! You remember me — you let me walk, on {where}. I pay my debts. And I\'ve an offer that\'ll make us both rich."'],
      talk: '{leader} knows when a Zhentarim strongbox wagon is on the road and how few guards it carries. Their people will ride with you for a share.',
      offer: '"There\'s a Zhent wagon on {place} with a strongbox under the seat. My lads ride with you, we split it down the middle. What do you say?"',
      accept: 'Take the job',
      refuse: 'Turn the offer down',
      pass: '{leader} shrugs. "Offer stands, if you change your mind." And then they are gone into the trees.',
    },
    lead: { sit: 'zhent-strongbox', note: 'The captain you spared knows when the Zhent strongbox wagon rides.' },
  }),

  'twig-blights': sit('twig-blights', 'Twig Blights', {
    kin: 'blights', attitude: 'hostile', mind: 'mindless', shape: 'hunt', place: 'wild', area: 'north',
    maps: ['neverwinter-wood'], biomes: ['pine-forest', 'ash-waste'], level: [1, 5], weight: 0.6, site: 'thundertree',
    foes: [['twig-blight', 3, 6], ['needle-blight', 0, 2]],
    leader: { title: 'the blights' },
    options: ['attack', 'flee'],
    ambush: true,
    lines: {
      why: ['They crept out of the ash-woods around Thundertree, where something rotten has taken root.'],
      opener: ['What you took for dead brush uncurls on root-feet — twig blights, dry and rattling and thirsty for blood.'],
    },
    telegraph: ['The brush here is dead, grey and brittle — and some of it was not there a moment ago.'],
    spotted: 'A cluster of dead brush ahead is standing very, very still. Blights, waiting for something warm.',
  }),

  'enclave-wardens': sit('enclave-wardens', 'Emerald Enclave Wardens', {
    kin: 'emerald-enclave', faction: 'emerald-enclave', attitude: 'wary', shape: 'patrol', place: 'wild', area: 'north',
    biomes: WOODS, maps: ['neverwinter-wood', 'kryptgarden-forest', 'ardeep-forest'], level: [2, 20], weight: 0.6,
    foes: [['scout', 2, 3], ['veteran', 0, 1]],
    folk: [{ sprite: 'npc-elf', role: 'leader' }, { sprite: 'npc-hunter', role: 'member', n: 2 }],
    leader: { title: 'a warden of the Emerald Enclave', names: { species: 'elf' } },
    options: ['talk', 'persuade', 'ask', 'leave', 'attack'],
    lines: {
      why: ['They keep the balance of the wild, which mostly means keeping people like you from unbalancing it.'],
      opener: ['"Hold. These woods are watched. Whatever you came for, take only what you need, and leave the rest living."'],
      angry: '"You are the ones who killed the mother owlbear. The Enclave remembers. You will leave these woods."',
      talk: '{leader} is watching the woods, not you. Something is wrong with the trees near Thundertree, and the Enclave means to find out what.',
      pass: '{leader} nods, and the wardens are gone between one breath and the next.',
    },
    rumor: ['Reidoth watches Thundertree for the Enclave. Blights are spreading from it like mould. Burn them if you meet them.'],
  }),

  'candlekeep-scholars': sit('candlekeep-scholars', 'Scholars for Candlekeep', {
    kin: 'scholars', attitude: 'friendly', shape: 'travel', place: 'road', area: 'south',
    maps: ['coast-way-north', 'coast-way-south'], level: [1, 20], weight: 0.6, innocent: true,
    foes: [['noble', 1, 1], ['guard', 1, 2]],
    folk: [{ sprite: 'npc-scholar', role: 'leader' }, { sprite: 'npc-scribe', role: 'member' }, { sprite: 'npc-sellsword', role: 'guard' }],
    leader: { title: 'a scholar bound for Candlekeep', names: { species: 'human', ethnicity: 'calishite' } },
    options: ['talk', 'ask', 'leave', 'rob'],
    lines: {
      why: ['Candlekeep admits no one without a book its library does not hold. They have one. They think.'],
      opener: ['"Good day! You wouldn\'t happen to know whether Candlekeep already has a copy of Volo\'s treatise on the privies of Amn?"'],
      talk: '{leader} has spent three years copying a single book and is terrified the Great Library already owns it.',
      pass: 'The scholars walk on, arguing about footnotes.',
    },
    rumor: ["The Keepers of Candlekeep turn away a king without a book and let in a beggar with one. It is the only honest door on the Sword Coast."],
  }),

  // --- the south: the Trade Way, the Coast Way, the Fields ------------------------

  'gauntlet-riders': sit('gauntlet-riders', 'Riders of the Gauntlet', {
    kin: 'gauntlet', faction: 'gauntlet', attitude: 'wary', shape: 'travel', place: 'road', area: 'south',
    maps: ['trade-way-north', 'trade-way-south', 'fields-of-the-dead'], level: [3, 20], weight: 0.8, time: 'day',
    foes: [['veteran', 1, 2], ['guard', 1, 2], ['acolyte', 0, 1]],
    folk: [{ sprite: 'npc-sellsword', role: 'leader' }, { sprite: 'npc-sellsword', role: 'member' }, { sprite: 'npc-acolyte', role: 'member' }, { beast: 'horse', role: 'beast' }],
    leader: { title: 'a knight of the Order of the Gauntlet', names: { species: 'human', ethnicity: 'chondathan' } },
    options: ['talk', 'ask', 'persuade', 'leave', 'attack'],
    lines: {
      why: ['The Order rides the Way between Daggerford and Elturel, hunting the things that crawl out of the barrows and the people who dig them up.'],
      opener: ['"Hold, travellers. The Order of the Gauntlet asks your business on the Way — and whether you have seen the dead walking."'],
      talk: '{leader} speaks of Torm and Tyr the way a sailor speaks of the sea: plainly, and with respect. They are tired, and the barrows are busier than they should be.',
      pass: '{leader} raises a mailed fist. "Walk in the light, then."',
      persuade: 'Tell them you have stood against the dead yourselves',
      talked: '{leader} looks at you a long while, then nods. "Then we are on the same side of this. Go well."',
    },
    rumor: ['Something is calling the dead up out of the Fields of the Dead. The Order thinks it is a necromancer. The Order is usually right.'],
    lead: { sit: 'barrow-dead', maps: ['fields-of-the-dead'], note: 'The riders of the Gauntlet say the barrows on the Fields are stirring.' },
  }),

  'hobgoblin-column': sit('hobgoblin-column', 'Hobgoblin Column', {
    kin: 'hobgoblins', faction: 'goblinoid', attitude: 'hostile', shape: 'patrol', place: 'wild', area: 'south', proud: true,
    maps: ['trade-way-north', 'trade-way-south', 'fields-of-the-dead'], level: [3, 14], weight: 0.8,
    foes: [['hobgoblin', 3, 6], ['hobgoblin-captain', 1, 1]],
    leader: { foe: 'hobgoblin-captain', title: 'a hobgoblin captain', marks: ['with a banner-pole across her shoulders', 'in lacquered red mail', 'with a whistle on a chain'] },
    demand: 'tribute',
    options: ['talk', 'pay', 'intimidate', 'duel', 'attack', 'flee'],
    lines: {
      why: ['Out of the ruins of Dragonspear Castle, marching in step, taking tribute from the Way the way a legion takes a province.'],
      opener: ['The column halts on a single barked word. "This road is under the Legion\'s protection," {leader} says. "Protection has a price: {demand} gold. Refuse, and you are an enemy of the Legion."'],
      talk: '{leader} is disciplined, cold and perfectly clear. The Legion does not haggle, but it does respect strength, and it keeps its word.',
      pass: 'The tribute goes into a strongbox, a scribe notes it in a ledger, and the column marches on in step.',
      rout: 'The captain weighs the cost in soldiers, blows a short note on the whistle, and the column wheels away in perfect order.',
      duel: 'Challenge the captain to single combat',
      intimidate: 'Tell them the Legion is a long way from home',
    },
    rumor: ['The hobgoblins took the old castle at Dragonspear for their own. Their captains answer to a warlord nobody on the Way has seen and lived.'],
    telegraph: ['The verge has been trampled flat by many feet marching in step, and not long ago.', 'Far off, a drum keeps a slow marching time, and then falls silent all at once.'],
    ambush: true,
    spotted: 'A line of hobgoblins waits behind a hedge-bank in perfect silence, shields locked, spears grounded. They have not seen you.',
  }),

  'ankheg-field': sit('ankheg-field', 'Something Under the Fields', {
    kin: 'ankheg', attitude: 'hostile', mind: 'beast', shape: 'hunt', place: 'wild', area: 'south',
    maps: ['coast-way-south', 'trade-way-south', 'fields-of-the-dead'], level: [3, 12], weight: 0.6,
    foes: [['ankheg', 1, 2]],
    leader: { foe: 'ankheg', title: 'an ankheg' },
    options: ['food', 'leave', 'attack', 'flee'],
    lines: {
      why: ['The ground heaves and something with a carapace like a cart\'s tarp and jaws like shears comes up out of the furrows. It has been eating the farmers\' oxen, and now it has found you.'],
      opener: ['The earth bulges, cracks, and an ankheg rears up out of it, mandibles clacking, acid hissing where it drips.'],
      pass: 'The ankheg sinks back into its tunnel with the meat, and the field goes still.',
      food: 'Throw it your rations and back away',
      leave: 'Back away slowly across the furrows',
    },
    telegraph: ['The furrows in this field are too deep and too straight for any plough.', 'The ground underfoot trembles, very slightly, and then is still.'],
    ambush: true,
    spotted: 'A long ridge of broken earth is moving slowly across the field toward the road, the way a mole-run would if moles were the size of oxen.',
  }),

  // --- the mountains ----------------------------------------------------------

  'hill-giant-pass': sit('hill-giant-pass', 'Hill Giant at the Pass', {
    kin: 'hill-giant', attitude: 'hostile', shape: 'post', place: 'road', area: 'any',
    maps: ['rosymorn-monastery', 'wave-echo-cave-entrance'], biomes: ['mountain'], level: [6, 16], weight: 0.9,
    foes: [['hill-giant', 1, 1], ['ogre', 0, 1], ['orc', 0, 2]],
    leader: { foe: 'hill-giant', title: 'a hill giant', marks: ['with a whole sheep slung over one shoulder', 'wearing a cart-tarp for a cloak', 'with a tree trunk for a club'] },
    demand: 'tribute',
    options: ['talk', 'food', 'pay', 'deceive', 'intimidate', 'attack', 'flee'],
    lines: {
      why: ['A hard winter drove it down off the high crags. It has settled on the pass and eats whatever tries to cross, and the ogre and orcs with it eat what it leaves.'],
      opener: ['"Little people! Pass is MY pass now." It thinks hard. "Food. Lots food. Or shinies. Or I eat you and take both."'],
      talk: "{leader} is hungry more than it is cruel, and far more hungry than it is clever. Enough food and it forgets you exist.",
      pass: 'The giant sits back down on its rock, chewing, and waves you by with a haunch of something.',
      talked: 'The giant brightens, forgets you entirely, and settles down by the path to wait for the caravan.',
      rout: 'The giant weighs you against its dinner, and goes back to its dinner.',
      food: 'Feed it everything you are carrying',
      deceive: 'Tell it a fatter caravan is coming up behind you',
    },
    rumor: ['The monks who kept the old monastery up the valley are gone. Men in dragon masks came, and the monks went down the mountain in the night.'],
    telegraph: ['A sheep\'s skull, cracked open like an egg, lies in the middle of the path.', 'Footprints in the mud of the track, each one longer than you are tall.'],
    ambush: true,
    spotted: 'Up among the boulders above the path, something the size of a haycart is waiting with a rock in each hand. It has not seen you yet.',
  }),

  'monastery-refugees': sit('monastery-refugees', 'Monks from the Monastery', {
    kin: 'monks', attitude: 'friendly', plea: 'hunger', shape: 'travel', place: 'road', area: 'any',
    maps: ['rosymorn-monastery', 'trade-way-south', 'fields-of-the-dead'], level: [1, 20], weight: 0.45, innocent: true,
    foes: [['acolyte', 2, 3]],
    folk: [{ sprite: 'npc-acolyte', role: 'leader' }, { sprite: 'npc-acolyte', role: 'member' }, { sprite: 'npc-hooded', role: 'member' }],
    leader: { title: 'a monk of the monastery', names: { species: 'human', ethnicity: 'chondathan' }, honorific: true },
    options: ['talk', 'food', 'donate', 'ask', 'leave'],
    lines: {
      why: ['The Cult of the Dragon took their monastery in the mountains. They walked out with the clothes they wore and the names of the brothers who stayed.'],
      opener: ['"Peace on the road, friends. We are all that came down from the monastery. Have you bread to spare — or word of the brothers we left behind?"'],
      talk: '{leader} speaks quietly of masked men in the cloisters, of a green-scaled thing in the courtyard, and of the brothers who would not leave.',
      pass: 'The monks bow, and walk on down the mountain.',
      food: 'Share your rations with them',
      donate: 'Give them coin for the road',
      grateful: '"May it come back to you tenfold." {leader} breaks the bread and shares it before eating any.',
    },
    rumor: ['The cultists at the monastery watch the high road. They let pilgrims pass and follow anyone who looks like they carry coin.'],
    lead: { sit: 'dragon-cultists', maps: ['rosymorn-monastery'], note: 'The monks say the Cult of the Dragon holds their monastery.' },
  }),

  // --- below Waterdeep --------------------------------------------------------
  // place 'underground': only ever met in the deeps (Undermountain's halls), where
  // the director puts at most one group of people among the dungeon's own denizens.

  'xanathar-thugs': sit('xanathar-thugs', 'Xanathar Guild Collectors', {
    kin: 'xanathar-guild', faction: 'xanathar-guild', attitude: 'wary', shape: 'patrol', place: 'underground', area: 'any',
    maps: ['undermountain'], level: [1, 20], weight: 1,
    tiers: [
      { level: [1, 4], foes: [['thug', 2, 3], ['bandit', 0, 2]] },
      { level: [5, 10], foes: [['thug', 2, 4], ['spy', 1, 1], ['bandit-captain', 1, 1]] },
      { level: [11, 20], foes: [['veteran', 1, 2], ['thug', 2, 4], ['spy', 1, 2]] },
    ],
    leader: { title: 'a Xanathar Guild collector', names: { species: 'human', ethnicity: 'chondathan' }, marks: ['with an eye tattooed on the back of each hand'] },
    demand: 'toll',
    options: ['talk', 'pay', 'haggle', 'persuade', 'deceive', 'intimidate', 'attack', 'flee'],
    lines: {
      why: [
        'The Guild runs the tunnels from Skullport to the city\'s sewers, and it charges for the use of them. These ones collect.',
        'Somebody stole from the Eye. They are looking for who, and asking everyone they meet, the hard way.',
      ],
      opener: [
        '"Well now. This is a Guild tunnel, friends, and the Eye sees everyone who uses it. {demand} gold, and you were never here."',
        '"Hold. The Xanathar wants a word with anyone coming up from below. Or {demand} gold instead of a word. Your choice."',
      ],
      talk: '{leader} is careful to call the Xanathar "the Eye" and nothing else. The Guild answers to one master, and that master is a beholder who keeps a goldfish.',
      pass: '{leader} tucks the coin away and taps an eye-tattooed hand to a brow. "The Eye remembers its friends."',
      talked: '{leader} weighs you up, decides you are more trouble than coin, and waves the collectors aside.',
      rout: 'The collectors decide the Guild does not pay them enough for this, and melt back into the dark.',
      haggle: 'Haggle over the Guild\'s fee',
      persuade: 'Say the Eye would not want a war with adventurers',
      deceive: 'Claim you already pay the Guild, upstairs',
      intimidate: 'Tell them the Eye can come and collect in person',
    },
    rumor: ['The Xanathar keeps a goldfish called Sylgar, and the last servant who let the bowl go dirty was never seen again. The Guild takes its pets seriously.'],
  }),

  'portal-company': sit('portal-company', 'Another Company', {
    kin: 'adventurers', attitude: 'wary', plea: 'hunger', shape: 'patrol', place: 'underground', area: 'any',
    maps: ['undermountain'], level: [1, 20], weight: 0.8, innocent: true,
    foes: [['veteran', 1, 1], ['scout', 1, 2], ['acolyte', 0, 1]],
    folk: [{ sprite: 'npc-sellsword', role: 'leader' }, { sprite: 'npc-hunter', role: 'member' }, { sprite: 'npc-acolyte', role: 'member' }],
    leader: { title: 'the captain of a company out of the Yawning Portal', names: { species: 'human', ethnicity: 'illuskan' } },
    options: ['talk', 'food', 'donate', 'ask', 'trade', 'leave', 'attack'],
    trade: { kinds: ['potion', 'gear'], count: 5, stock: ['potion-healing', 'torch', 'rations'] },
    lines: {
      why: ['They went down the well at the Yawning Portal three days ago with food for two. Durnan will have their names chalked on the board by now.'],
      opener: ['"Easy — we\'re not monsters. Company out of the Portal, same as you. You wouldn\'t have food to trade, would you? We\'ve been eating the candles."'],
      talk: '{leader} has the thousand-yard look of anyone who has spent three nights in Halaster\'s halls. The doors here move. They are sure of it.',
      pass: 'The other company raises weapons in salute and goes on into the dark.',
      food: 'Share your rations with them',
      donate: 'Give them coin for the climb out',
      grateful: '{leader} eats standing up. "We owe you. There\'s a shaft two halls on that goes down, and a thing at the bottom that doesn\'t."',
    },
    rumor: ['There are gates in these halls that take you somewhere else entirely. Halaster built them, and Halaster laughs at whoever uses them.'],
  }),

  // --- after dark ---------------------------------------------------------------

  'travellers-fire': sit('travellers-fire', "Travellers' Fire", {
    kin: 'travellers', attitude: 'friendly', shape: 'camp', place: 'roadside', area: 'any', time: 'night',
    maps: NORTH_ROADS.concat(SOUTH_ROADS), level: [1, 20], weight: 1.1, innocent: true,
    foes: [['guard', 1, 2], ['commoner', 1, 2]],
    folk: [{ sprite: 'npc-merchant', role: 'leader' }, { sprite: 'npc-sellsword', role: 'guard' }, { sprite: 'npc-villager-f', role: 'member' }],
    camp: { tents: [1, 2], fire: true },
    leader: { title: 'a carter camped for the night', names: { species: 'human', ethnicity: 'chondathan' } },
    options: ['talk', 'rest', 'ask', 'trade', 'leave', 'rob'],
    trade: { kinds: ['food', 'gear'], count: 6, stock: ['rations', 'torch', 'waterskin'] },
    lines: {
      why: ["Nobody sane walks the road after dark. They pulled off at dusk, lit a fire, and are waiting for morning like everyone else."],
      opener: ['"Come in to the fire, if you\'re honest folk. There\'s room, and there\'s tea, and there\'s safety in numbers."'],
      talk: '{leader} has been up and down this road for twenty years and has an opinion about every inn on it.',
      pass: '"Safe road in the morning, then."',
      rest: 'Sit at their fire a while',
    },
    rumor: [
      "They say a Zhentarim wagon runs the road now and then with a strongbox under the seat, and fewer guards than you'd think.",
      'There are orcs about — Many-Arrows, flying Gruumsh\'s eye. Somebody saw their fires from the high ground.',
      'A Harper rider came through two days back, riding hard. Somebody was after her.',
    ],
  }),
});

// ---------------------------------------------------------------------------
// 4. QUIET BEATS — the road between dangers
// ---------------------------------------------------------------------------
// Landmarks, weather, wildlife and small finds. `act` makes a beat something you
// can DO: a shrine to leave a coin at, a snare line to forage. Most are just the
// world being there.

function beat(id, text, o = {}) {
  return {
    id, text, maps: o.maps || null, biomes: o.biomes || null, area: o.area || 'any',
    time: o.time || 'any', weather: o.weather || null, act: o.act || null, weight: o.weight == null ? 1 : o.weight,
  };
}

export const BEATS = deepFreeze([
  // --- the Triboar Trail ----------------------------------------------------
  beat('trail-waystone', "A Lords' Alliance waystone gives the miles to Triboar. Somebody has chipped one of the numbers off with an axe.", { maps: ['triboar-trail'] }),
  beat('trail-ruts', 'Old cart ruts, deep as a boot, run straight as a rule toward Triboar.', { maps: ['triboar-trail'] }),
  beat('trail-mountains', 'The Sword Mountains stand blue and sharp to the north, snow still on their shoulders.', { maps: ['triboar-trail', 'wave-echo-cave-entrance'], time: 'day' }),
  beat('trail-crows', 'Two crows argue over something dead in the verge. It is only a rabbit.', { area: 'north', biomes: ['road', 'plains'] }),
  beat('tymora-cairn', 'A traveller\'s cairn stands at the roadside with a copper on top of it for Tymora. Lady Luck notices those who pay her respects.', {
    biomes: ['road', 'plains', 'hills'], weight: 0.7, act: { kind: 'shrine', label: 'Leave a gold piece for Tymora', cost: 1 },
  }),
  // --- the woods ------------------------------------------------------------
  beat('wood-ash', 'Grey ash from Mount Hotenow dusts the needles underfoot.', { maps: ['neverwinter-wood'] }),
  beat('wood-stag', 'A stag watches you from the ferns, then is gone without a sound.', { biomes: ['forest', 'pine-forest'], time: 'day' }),
  beat('wood-oakleaf', "Somebody long ago carved Silvanus's oak leaf into a trunk. The bark has grown over most of it.", { biomes: ['forest', 'pine-forest'] }),
  beat('wood-mist', 'Mist pools between the pines. Somewhere a woodpecker keeps time.', { biomes: ['pine-forest'], time: 'day' }),
  beat('wood-snare', 'A line of snares, set by someone who knew what they were doing. One has caught a rabbit.', {
    biomes: ['forest', 'pine-forest', 'hills'], weight: 0.6, act: { kind: 'forage', skill: 'survival', dc: 10, item: 'rations', qty: 1 },
  }),
  beat('wood-berries', 'Brambles heavy with late berries crowd the path.', {
    biomes: ['forest', 'pine-forest', 'plains'], weight: 0.6, act: { kind: 'forage', skill: 'nature', dc: 12, item: 'rations', qty: 1 },
  }),
  // --- ruins ----------------------------------------------------------------
  beat('cony-chapel', 'The burnt shell of the old village chapel still stands, roofless, a bird\'s nest where the altar was.', { maps: ['conyberry-ruins'] }),
  beat('cony-toy', "A child's wooden horse lies in the weeds, bleached white by a lifetime of sun.", { maps: ['conyberry-ruins'] }),
  // --- the south ------------------------------------------------------------
  beat('way-milestone', "A milestone reads DAGGERFORD, and a number somebody has scratched out and replaced with a rude word.", { maps: ['trade-way-north', 'trade-way-south'] }),
  beat('way-farms', 'Farmers work the fields on either side of the Way and do not look up as you pass.', { maps: ['trade-way-north', 'trade-way-south'], time: 'day' }),
  beat('fields-barrows', 'Barrow mounds rise out of the grass like the backs of sleeping beasts.', { maps: ['fields-of-the-dead'] }),
  beat('fields-helm', 'A rusted helm, grown through with roots, sits in the grass where it fell a century ago.', { maps: ['fields-of-the-dead'] }),
  beat('fields-ravens', 'Ravens follow you from barrow to barrow, patient as undertakers.', { maps: ['fields-of-the-dead'], time: 'day' }),
  beat('coast-gulls', 'Gulls wheel over the Sea of Swords, and the wind tastes of salt.', { maps: ['coast-way-north', 'coast-way-south'] }),
  beat('coast-candlekeep', "Far off on its crag, Candlekeep's towers stand against the sea like a stack of books.", { maps: ['coast-way-south', 'coast-way-north'], time: 'day' }),
  // --- the marsh ------------------------------------------------------------
  beat('mere-wisps', 'Pale lights bob far out over the black water. You do not follow them.', { biomes: ['marsh'], time: 'night' }),
  beat('mere-splash', 'Something large slides into the water off to your left and does not come up.', { biomes: ['marsh'] }),
  // --- anywhere -------------------------------------------------------------
  beat('night-selune', 'Selûne is up, and the road runs silver under her.', { time: 'night', weather: ['clear'] }),
  beat('night-wolves', 'Far off, a wolf calls, and another answers from somewhere much nearer.', { time: 'night', biomes: ['forest', 'pine-forest', 'hills', 'plains'] }),
  beat('rain-road', 'Rain drums on hoods and packs, and the road turns to soup.', { weather: ['rain', 'storm'] }),
  beat('fog-road', 'The fog closes in until the road ahead is a grey rumour.', { weather: ['fog'] }),
  beat('purse-grass', 'Something glints in the grass at the roadside: a dropped purse, still with a few coins in it.', { biomes: ['road', 'plains'], weight: 0.35, act: { kind: 'find', gold: '1d6' } }),
  beat('old-camp', 'The ring of a cold campfire, and bones picked clean. Someone ate well here, a few nights back.', { weight: 0.5 }),
]);

// ---------------------------------------------------------------------------
// 5. OPENERS FOR FIGHTS THAT ARE NOT SITUATIONS
// ---------------------------------------------------------------------------
// A dungeon's tile encounters and a map's scripted battle triggers still start
// fights. None of them may start one without saying who and why. Keyed by
// MONSTER_GROUPS id first, then by faction, then by creature type.

export const GROUP_OPENERS = deepFreeze({
  'cragmaw-ambush': "Goblins burst from the thickets by the dead horses — Cragmaws, who have been waiting for whoever came looking for that cargo.",
  'cragmaw-scouts': 'Cragmaw scouts, who were supposed to be watching the road and were watching you instead.',
  'redbrand-patrol': '"Oi! This is Glasstaff\'s house now." Redbrand ruffians, scarlet cloaks and all, who were told to keep people out of the cellar.',
  'redbrand-hideout-guard': 'Redbrands on guard, bored and spoiling for it. "Nobody comes down here. Nobody leaves."',
  'undermountain-first-level': 'Things that live in the first level of Undermountain, who have learned that adventurers carry food.',
  'undermountain-drow-raid': 'Drow out of the Underdark, raiding up through Halaster\'s halls for slaves and silver.',
  'wave-echo-shafts': 'Something has been living in the old mine shafts since the Phandelver\'s Pact fell. It does not want company.',
  'crypt-of-the-restless': 'The dead of this place were not laid to rest properly, and they want you to join them.',
  'thundertree-blights': 'Blights from the ash-woods of Thundertree, rattling out of the dead brush.',
  'stirge-roost': 'Stirges, dropping from the roof in a cloud, thirsty.',
  'kobold-warren': 'Kobolds, defending their warren with more spears than sense.',
  'ghoul-warren': 'Ghouls, pale and grinning, who smelled you coming a long way off.',
});

export const FACTION_OPENERS = deepFreeze({
  goblinoid: 'Cragmaw goblins, who want what you are carrying.',
  bandits: 'Highwaymen, who want your purse and are not particular how they get it.',
  zhentarim: 'Zhentarim muscle, who were told nobody comes this way.',
  redbrands: 'Redbrands, Glasstaff\'s bullies, who do not like strangers.',
  'cult-dragon': 'Cultists of the Dragon, who will not let anyone near what they guard.',
  'many-arrows': 'Orcs of Many-Arrows, a long way from home and in no mood to talk.',
  gnoll: "Gnolls, driven by Yeenoghu's hunger.",
  undead: 'The restless dead, drawn by the warmth of the living.',
  drow: 'Drow, out of the Underdark, who take what they want.',
  kobold: 'Kobolds, defending their tunnels.',
  lizardfolk: 'Lizardfolk, hunting.',
  blight: 'Blights, rattling out of the dead brush.',
});

export const TYPE_OPENERS = deepFreeze({
  beast: 'Hungry animals, who have decided you are food.',
  monstrosity: 'Something that hunts in these parts, and has found you.',
  undead: 'The restless dead, drawn by the warmth of the living.',
  humanoid: 'Armed strangers, who were not expecting anyone.',
  aberration: 'Something that should not exist, and wants you not to either.',
  fiend: 'Fiends, loosed from somewhere they should not have left.',
  construct: 'Guardians, doing the one thing they were built to do.',
  ooze: 'Something that eats whatever wanders into it.',
  plant: 'The plants here are hungry.',
  giant: 'Giants, who consider this their land.',
  dragon: 'A dragon, which considers everything its land.',
  elemental: 'Elemental things, raw and angry.',
  fey: 'Fey, whose games are not safe to play.',
  celestial: 'Celestials, testing you.',
});

// ---------------------------------------------------------------------------
// 6. ONE LINE FOR EVERY OUTCOME THE AUTHOR DID NOT WRITE
// ---------------------------------------------------------------------------

export const DEFAULT_LINES = deepFreeze({
  pass: 'They let you go on your way.',
  rout: 'They back off, and let you through.',
  fightHostile: 'Enough talk. They come for you.',
  talkNothing: 'They have little to say to strangers, and say it.',
  againFriendly: 'They know you now, and raise a hand as you come up.',
  againWary: 'They watch you come, but they have no quarrel with you now.',
  fightAngry: 'That was the wrong thing to say. Steel comes out.',
  noticed: 'A shout — you have been seen.',
  sneakOk: 'You slip past without a sound. They never know you were there.',
  shadowOk: 'You follow at a distance, keeping to cover, and learn where they are going.',
  fleeOk: 'You break away and put ground between you before they can close.',
  fleeFail: 'They are faster than you. There is no getting away.',
  talkBeast: 'It is an animal. It does not want to talk.',
  surrender: 'You hand over your purse. They count it, laugh, and let you go.',
  paid: 'The coin changes hands, and the way is clear.',
  haggleOk: 'They grumble, but the price comes down.',
  haggleFail: 'They take offence. The price goes up.',
  persuadeFail: 'They are not moved.',
  deceiveFail: 'They do not believe a word of it.',
  intimidateFail: 'They laugh at you.',
  leave: 'You leave them to it.',
  robOk: 'They hand it over with shaking hands.',
  robFail: 'They will not give it up without a fight.',
  turnOk: 'The dead recoil from the holy symbol, and stumble away into the dark.',
  turnFail: 'The dead do not flinch.',
  duelWin: 'Your champion stands; theirs does not. The war band lets you pass.',
  hired: 'They look at each other, and then at the coin. "For that? We ride with you."',
  foodBeast: 'They take the meat and slink off with it.',
  foodFail: 'They want more than meat.',
  hunted: 'A good hunt. The meat is shared out fairly.',
  huntFail: 'The stag gets away. It usually does.',
  tended: 'The bleeding stops. She will live.',
  tendFail: 'You do what you can. It is not enough.',
  prayed: 'You kneel with them as the light comes up. For a moment the whole road is gold.',
  donated: 'The coin is received with more thanks than it deserves.',
  hush: 'Silver changes hands, and you have seen nothing at all.',
  recognised: 'You see her true face under the glamour.',
  recogniseFail: 'She is just an old woman. Isn\'t she?',
});

// ---------------------------------------------------------------------------
// 7. THE HAG'S BARGAINS
// ---------------------------------------------------------------------------
// What she offers and what it costs. Her boons are real; so are her prices.

export const HAG_BARGAINS = deepFreeze([
  {
    id: 'charm', offer: '"A little charm against the Mere\'s dead, dearie. It will keep them off you. All it costs is a lock of your hair."',
    boon: { item: 'potion-healing', qty: 2 }, price: { flag: 'hag-lock' }, priceText: 'a lock of your hair',
  },
  {
    id: 'path', offer: '"I know a dry path through the Mere, and a place where a dead knight left his purse. Yours — for the next coin you would have spent."',
    boon: { gold: '4d10' }, price: { goldPct: 0.25 }, priceText: 'a quarter of your purse',
  },
  {
    id: 'name', offer: '"I\'ll tell you a secret the Cult of the Dragon would kill to keep. All I want is a name. The name of someone you love."',
    boon: { rumor: "The cult's cell meets in the ash-ruins of Thundertree, at the foot of the dragon's tower." }, price: { flag: 'hag-name' }, priceText: 'a name you love',
  },
]);

// ---------------------------------------------------------------------------
// 8. WHAT THE WORLD'S EVENTS PUT ON THE ROAD
// ---------------------------------------------------------------------------
// rules/worlddirector.js runs the Sword Coast's news: orcs raiding, a caravan gone
// missing, a festival. Its events carry tags and MONSTER_GROUPS ids; these say
// which situations each one makes likelier, and which it puts on the road.

export const EVENT_TAGS = deepFreeze({
  goblin: ['cragmaw-raiders'],
  caravan: ['caravan-raid', 'caravan-raid-south', 'merchant-caravan'],
  trade: ['merchant-caravan', 'peddler'],
  merchants: ['merchant-caravan', 'peddler'],
  harvest: ['merchant-caravan'],
  bandits: ['bandit-camp'],
  outlaw: ['bandit-camp'],
  zhentarim: ['zhentarim-toll'],
  orcs: ['many-arrows-warband', 'refugees'],
  war: ['refugees'],
  wolves: ['wolves-shepherd'],
  livestock: ['wolves-shepherd'],
  undead: ['barrow-dead'],
  barrows: ['barrow-dead'],
  lizardfolk: ['lizardfolk-hunters'],
  ogres: ['ogre-toll'],
  'cult-dragon': ['dragon-cultists'],
  dragon: ['dragon-cultists'],
  festival: ['lathander-pilgrims', 'peddler'],
  harpers: ['harper-courier'],
  courier: ['harper-courier'],
  blight: ['twig-blights'],
  enclave: ['enclave-wardens'],
});

export const EVENT_GROUPS = deepFreeze({
  'cragmaw-ambush': 'cragmaw-raiders', 'cragmaw-scouts': 'cragmaw-raiders',
  'triboar-trail-bandits': 'bandit-camp', 'high-road-highwaymen': 'bandit-camp',
  'zhentarim-strongarms': 'zhentarim-toll', 'many-arrows-warband': 'many-arrows-warband',
  'wyvern-tor-orcs': 'many-arrows-warband', 'neverwinter-wood-wolves': 'wolves-shepherd',
  'fields-barrow-host': 'barrow-dead', 'crypt-of-the-restless': 'barrow-dead',
  'conyberry-ruins-haunts': 'barrow-dead', 'ogre-shakedown': 'ogre-toll',
  'cult-of-the-dragon-cell': 'dragon-cultists', 'thundertree-blights': 'twig-blights',
  'mere-of-dead-men-lizardfolk': 'lizardfolk-hunters',
});

/** Tuning the director reads per pacing setting (see rules/encounters.js). */
export const PACING = deepFreeze({
  calm: { groups: [1, 2], hostile: 0.25, tension: 0.25, grace: 160, beatGap: [80, 170], ambush: 0.5, arrivalGap: 420, crowd: 4 },
  normal: { groups: [2, 3], hostile: 0.38, tension: 0.4, grace: 100, beatGap: [100, 210], ambush: 1, arrivalGap: 300, crowd: 5 },
  perilous: { groups: [3, 4], hostile: 0.52, tension: 0.7, grace: 60, beatGap: [130, 250], ambush: 1.6, arrivalGap: 200, crowd: 6 },
});

/** How much of the danger budget may be spent on an AMBUSH, by the old setting. */
export const AMBUSH_SHARE = deepFreeze({ off: 0, rare: 0.2, normal: 0.4, frequent: 0.6 });
