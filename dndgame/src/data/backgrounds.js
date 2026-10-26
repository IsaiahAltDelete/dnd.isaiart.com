// src/data/backgrounds.js — pure data: the 2024 PHB backgrounds, the full feat
// catalogue (origin, general, fighting-style and epic boon), and the languages of
// Faerûn. No imports; the rules engine reads only the `mech` keys in SPEC.md §3.
//
// 2024 rules reminders baked into this file:
//   * Species grant NO ability score increases — the BACKGROUND does (+2/+1 or +1/+1/+1
//     across the three abilities listed in `asi`).
//   * Every background grants exactly ONE Origin Feat, two skills, one tool, and an
//     equipment package (or `goldAlt` gold pieces instead).
//   * General feats require level 4+ and most carry their own +1 (`asi` lists the
//     abilities it may go into).
//   * Fighting Styles are feats in their own right (category 'fighting-style').
//   * Epic Boons are the post-20 Mythic progression and lift the ability ceiling to 30.
//
// FEATS is the ONE catalogue: it contains origin, general, fighting-style and epic-boon
// entries. FIGHTING_STYLES and EPIC_BOONS are frozen filtered views of it, so
// `rules/character.js` resolveOption() and `rules/progression.js` epicBoonOptions()
// both find the same object identity.

// ---------------------------------------------------------------------------
// deepFreeze — recursive Object.freeze for exported catalogues (HARD RULE 8).
// ---------------------------------------------------------------------------
function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const k of Object.keys(o)) deepFreeze(o[k]);
  }
  return o;
}

const ABIL = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const CASTER_ABIL = ['int', 'wis', 'cha'];

/** The seventeen sets of artisan's tools, for Crafter and the Artisan background. */
const ARTISAN_TOOLS = [
  'alchemists-supplies', 'brewers-supplies', 'calligraphers-supplies', 'carpenters-tools',
  'cartographers-tools', 'cobblers-tools', 'cooks-utensils', 'glassblowers-tools',
  'jewelers-tools', 'leatherworkers-tools', 'masons-tools', 'painters-supplies',
  'potters-tools', 'smiths-tools', 'tinkers-tools', 'weavers-tools', 'woodcarvers-tools',
];

/** Musical instruments carried by Sword Coast minstrels. */
const INSTRUMENTS = [
  'bagpipes', 'drum', 'dulcimer', 'flute', 'horn', 'lute', 'lyre', 'pan-flute', 'shawm', 'viol',
];

/** Gaming sets — dice in a guardhouse, dragonchess in a manor. */
const GAMING_SETS = ['gaming-dice', 'gaming-cards', 'gaming-dragonchess', 'gaming-three-dragon-ante'];

// ===========================================================================
// 1. BACKGROUNDS — all sixteen from the 2024 Player's Handbook
// ===========================================================================

/**
 * Background entry builder. Every background is guaranteed the same shape so
 * `rules/character.js` and `ui/charcreate.js` never have to guard a field.
 *   asi          three abilities; the player spreads +2/+1 or +1/+1/+1 across them
 *   originFeat   a single feat id from the 'origin' category
 *   skills       two skill proficiencies (granted outright)
 *   tools        one tool proficiency; `toolOptions` lists legal swaps
 *   equipment    [[itemId, qty], ...] — or take `goldAlt` gp instead of the lot
 *   bonds        four hooks the character-creation wizard offers as a bond line
 */
function bg(id, name, o) {
  return {
    id,
    name,
    desc: o.desc,
    flavor: o.flavor,
    asi: o.asi,
    originFeat: o.originFeat,
    skills: o.skills,
    tools: o.tools,
    toolOptions: o.toolOptions || null,
    equipment: o.equipment || [],
    gold: o.gold || 0,
    goldAlt: 50,
    bonds: o.bonds || [],
    deities: o.deities || [],
    faction: o.faction || null,
    region: o.region || 'Sword Coast North',
  };
}

export const BACKGROUNDS = deepFreeze({

  acolyte: bg('acolyte', 'Acolyte', {
    desc: 'You served a temple, learning its rites, its ledgers and the weight of a god\'s attention. Whether you swept the flagstones or read the omens, the faith took root in you.',
    flavor: 'You kept the Shrine of Luck in Phandalin for Sister Garaele — a coin flipped at dawn, Tymora\'s blessing pressed on every wagon bound up the Triboar Trail.',
    asi: ['int', 'wis', 'cha'],
    originFeat: 'magic-initiate-cleric',
    skills: ['insight', 'religion'],
    tools: ['calligraphers-supplies'],
    equipment: [['calligraphers-supplies', 1], ['book', 1], ['holy-symbol', 1], ['parchment', 10], ['robe', 1]],
    gold: 8,
    deities: ['Tymora', 'Lathander', 'Ilmater', 'Oghma'],
    bonds: [
      'Sister Garaele sent you east with a blessing and a warning: luck is spent, not saved.',
      'You copied the same prayer nine hundred times and it has never once failed you.',
      'Your temple burned. You carry its holy symbol and its debt.',
      'A dying priest of Lathander pressed a sunrise into your hand and asked you to finish his road.',
    ],
  }),

  artisan: bg('artisan', 'Artisan', {
    desc: 'You learned a trade at a bench, under a master who counted every wasted nail. Your hands know the grain of a thing before your eyes do.',
    flavor: 'You served your apprenticeship in Neverwinter, the City of Skilled Hands, in a hall that still smells of Gond\'s forge-smoke and river clay.',
    asi: ['str', 'dex', 'int'],
    originFeat: 'crafter',
    skills: ['investigation', 'persuasion'],
    tools: ['smiths-tools'],
    toolOptions: ARTISAN_TOOLS,
    equipment: [['smiths-tools', 1], ['pouch', 2], ['clothes-traveler', 1]],
    gold: 32,
    deities: ['Gond', 'Waukeen'],
    bonds: [
      'Your guild in Neverwinter still holds your master\'s mark — and your unpaid dues.',
      'You mean to see your work sold in Waterdeep before you die.',
      'Linene Graywind of the Lionshield Coster owes you for a commission she never collected.',
      'You are chasing the lost smithing secrets of the Forge of Spells.',
    ],
  }),

  charlatan: bg('charlatan', 'Charlatan', {
    desc: 'You have never sold anything a mark did not already want to believe. A confident hand, a clean seal, and the right story will open most purses on the coast.',
    flavor: 'You worked the back room of the Sleeping Giant, selling shares in a Phandelver mine that had not been opened in five hundred years.',
    asi: ['dex', 'con', 'cha'],
    originFeat: 'skilled',
    skills: ['deception', 'sleight-of-hand'],
    tools: ['forgery-kit'],
    equipment: [['forgery-kit', 1], ['costume', 1], ['clothes-fine', 1]],
    gold: 15,
    deities: ['Mask', 'Tymora', 'Waukeen'],
    bonds: [
      'A Waterdhavian noble is still looking for the man who sold him a river.',
      'You keep the signet of a house that never existed, and it still opens doors.',
      'Halia Thornton knows what you are. She has not decided what that is worth yet.',
      'One mark believed you so completely that you have never been able to spend the money.',
    ],
  }),

  criminal: bg('criminal', 'Criminal', {
    desc: 'You made your living outside the law and learned its edges better than any magistrate. Locks, fences, watchmen\'s rounds — all of it is simple arithmetic to you now.',
    flavor: 'You ran with the Redbrands out of Tresendar Manor, or fenced ore for the Black Network in Phandalin\'s Miner\'s Exchange, before you decided you preferred breathing.',
    asi: ['dex', 'con', 'int'],
    originFeat: 'alert',
    skills: ['sleight-of-hand', 'stealth'],
    tools: ['thieves-tools'],
    equipment: [['dagger', 2], ['thieves-tools', 1], ['crowbar', 1], ['pouch', 2], ['clothes-traveler', 1]],
    gold: 16,
    deities: ['Mask', 'Beshaba'],
    bonds: [
      'You walked out on the Redbrands. They have long memories and short tempers.',
      'A Zhentarim Fang holds a marker with your name on it.',
      'Everything you steal goes home to a family that thinks you drive a wagon.',
      'You were caught once. The man who let you go has never asked for anything — yet.',
    ],
  }),

  entertainer: bg('entertainer', 'Entertainer', {
    desc: 'You have held a room by the throat with nothing but a song and a good silence before the last line. A crowd is a creature, and you have learned to ride it.',
    flavor: 'You played the common room of the Stonehill Inn for coppers, and once, for one glorious tenday, the stage of the Moonstone Mask in Neverwinter.',
    asi: ['str', 'dex', 'cha'],
    originFeat: 'musician',
    skills: ['acrobatics', 'performance'],
    tools: ['lute'],
    toolOptions: INSTRUMENTS,
    equipment: [['lute', 1], ['costume', 2], ['mirror', 1], ['perfume', 1], ['clothes-traveler', 1]],
    gold: 11,
    deities: ['Milil', 'Sune', 'Lliira'],
    bonds: [
      'Trilena Stonehill still keeps your first playbill nailed behind the bar.',
      'You are writing the ballad of the Lost Mine, and you intend to earn the ending.',
      'A rival minstrel in Waterdeep stole your best song and your best name.',
      'You perform for one person who is no longer in any audience.',
    ],
  }),

  farmer: bg('farmer', 'Farmer', {
    desc: 'You worked ground that gave grudgingly and took everything. Hard seasons made your hands and your patience, and neither breaks easily.',
    flavor: 'You grew up on ground like Qelline Alderleaf\'s — turnips, a stubborn ox, and Chauntea\'s name spoken over the furrow every spring.',
    asi: ['str', 'con', 'wis'],
    originFeat: 'tough',
    skills: ['animal-handling', 'nature'],
    tools: ['carpenters-tools'],
    equipment: [['sickle', 1], ['carpenters-tools', 1], ['healers-kit', 1], ['pot-iron', 1], ['shovel', 1], ['clothes-traveler', 1]],
    gold: 30,
    deities: ['Chauntea', 'Silvanus', 'Yondalla'],
    bonds: [
      'Goblins burned the barn. You are still counting what that cost.',
      'Carp Alderleaf follows you around asking about monsters. You have started making the answers gentler.',
      'You send half of everything you earn back to Goldenfields.',
      'The land is still yours. You mean to go back to it with enough coin to keep it.',
    ],
  }),

  guard: bg('guard', 'Guard', {
    desc: 'You stood a post through cold watches and dull ones, and learned that the trouble always comes in the hour you stop looking. Boredom is a discipline.',
    flavor: 'You walked the top of Neverwinter\'s wall, or the Protector\'s Enclave gate, checking writs and watching the treeline for anything that moved wrong.',
    asi: ['str', 'int', 'wis'],
    originFeat: 'alert',
    skills: ['athletics', 'perception'],
    tools: ['gaming-dice'],
    toolOptions: GAMING_SETS,
    equipment: [['spear', 1], ['light-crossbow', 1], ['crossbow-bolt', 20], ['gaming-dice', 1], ['lantern-hooded', 1], ['manacles', 1], ['quiver', 1], ['clothes-traveler', 1]],
    gold: 12,
    deities: ['Helm', 'Torm', 'Tyr'],
    faction: 'lords-alliance',
    bonds: [
      'You were on the gate the night something got past you. You have never said whose it was.',
      'Your old sergeant taught you the watchword and the wine, and both still hold.',
      'Harbin Wester wants a town guard for Phandalin. He wants you to lead it.',
      'You quit a wall that was defending the wrong people.',
    ],
  }),

  guide: bg('guide', 'Guide', {
    desc: 'You know which trails still exist and which ones the wood took back. Out past the roads you read weather, water and spoor the way a scribe reads a page.',
    flavor: 'You walked the deer paths of Neverwinter Wood, skirting Thundertree\'s ash and the green shadow over Kryptgarden, and came back every time.',
    asi: ['dex', 'con', 'wis'],
    originFeat: 'magic-initiate-druid',
    skills: ['stealth', 'survival'],
    tools: ['cartographers-tools'],
    equipment: [['shortbow', 1], ['arrow', 20], ['cartographers-tools', 1], ['bedroll', 1], ['quiver', 1], ['tent', 1], ['clothes-traveler', 1]],
    gold: 3,
    deities: ['Mielikki', 'Silvanus', 'Eldath'],
    faction: 'emerald-enclave',
    bonds: [
      'Reidoth the druid taught you the wood\'s quiet rules. You have broken one of them.',
      'You have mapped every trail from the Triboar Trail to the Sword Mountains but one.',
      'Something followed you out of Neverwinter Wood, and it is patient.',
      'A caravan trusted your route. Only you came back down it.',
    ],
  }),

  hermit: bg('hermit', 'Hermit', {
    desc: 'You withdrew from the world to seek something the world was drowning out. What you found is yours alone, and you have not yet decided what it is worth.',
    flavor: 'Your cell sat above the Mere of Dead Men, or in the cracked stones of Old Owl Well, with only wind, salt fog and a very long silence for company.',
    asi: ['con', 'wis', 'cha'],
    originFeat: 'healer',
    skills: ['medicine', 'religion'],
    tools: ['herbalism-kit'],
    equipment: [['quarterstaff', 1], ['herbalism-kit', 1], ['bedroll', 1], ['book', 1], ['lamp', 1], ['clothes-traveler', 1]],
    gold: 16,
    deities: ['Ilmater', 'Oghma', 'Eldath', 'Selûne'],
    bonds: [
      'You went out to the Mere to atone, and came back before the debt was paid.',
      'A Netherese sigil in your journal has never stopped meaning something.',
      'You saved a stranger on the High Road and have been looking for them since.',
      'The silence told you a name. You have not spoken it aloud.',
    ],
  }),

  merchant: bg('merchant', 'Merchant', {
    desc: 'You learned the trade from the back of a wagon: what a road costs, what a guard is worth, and exactly how much a man will pay when he has no other option.',
    flavor: 'You kept a ledger like Elmar Barthen\'s, or ran a coster down the High Road from Waterdeep to Leilon, paying tolls in coin, wine and information.',
    asi: ['con', 'int', 'cha'],
    originFeat: 'lucky',
    skills: ['animal-handling', 'persuasion'],
    tools: ['navigators-tools'],
    equipment: [['navigators-tools', 1], ['pouch', 2], ['clothes-traveler', 1]],
    gold: 22,
    deities: ['Waukeen', 'Tymora', 'Gond'],
    faction: 'lords-alliance',
    bonds: [
      'A caravan of yours never reached Leilon. You are still paying the families.',
      'Barthen taught you the ledger. You still balance it his way.',
      'You owe the Zhentarim a favour and they have not named it yet.',
      'You are one good season from buying your own coster house.',
    ],
  }),

  noble: bg('noble', 'Noble', {
    desc: 'You were raised to be looked at, and taught how to make that useful. Titles open doors on the Sword Coast, though they close a few as well.',
    flavor: 'Yours is a lesser Waterdhavian house, or one of the Neverwintan families clawing its standing back out of Mount Hotenow\'s ash.',
    asi: ['str', 'int', 'cha'],
    originFeat: 'skilled',
    skills: ['history', 'persuasion'],
    tools: ['gaming-dragonchess'],
    toolOptions: GAMING_SETS,
    equipment: [['clothes-fine', 1], ['gaming-dragonchess', 1], ['perfume', 1], ['signet-ring', 1]],
    gold: 29,
    deities: ['Tyr', 'Torm', 'Sune', 'Waukeen'],
    faction: 'lords-alliance',
    bonds: [
      'Your house name still opens the Yawning Portal\'s better table. It will not always.',
      'You are the second child, and the first is watching.',
      'A family debt bought your commission. You intend to earn it out.',
      'You left the villa without permission and without regret.',
    ],
  }),

  sage: bg('sage', 'Sage', {
    desc: 'You spent years among stacks and lamp-oil, chasing one question through a hundred books. You have found half an answer, and it will not let you sleep.',
    flavor: 'You studied under Candlekeep\'s monks, or in a lecture hall of Blackstaff Tower in Waterdeep, where the Weave is discussed the way farmers discuss weather.',
    asi: ['con', 'int', 'wis'],
    originFeat: 'magic-initiate-wizard',
    skills: ['arcana', 'history'],
    tools: ['calligraphers-supplies'],
    equipment: [['quarterstaff', 1], ['calligraphers-supplies', 1], ['book', 1], ['parchment', 8], ['robe', 1]],
    gold: 8,
    deities: ['Oghma', 'Mystra', 'Azuth', 'Deneir'],
    bonds: [
      'You paid Candlekeep\'s toll with a book you were not supposed to own.',
      'The Netherese ruins beneath Phandalin are the subject of your unfinished thesis.',
      'Your master vanished mid-sentence, and the sentence still bothers you.',
      'You want to see the Forge of Spells before anyone else writes about it.',
    ],
  }),

  sailor: bg('sailor', 'Sailor', {
    desc: 'You worked a deck in weather that killed better sailors, and learned rope, knife and a hard kind of humour. Land still feels like it is holding something back.',
    flavor: 'You crewed a Waterdhavian trader beating north past the Mere of Dead Men, throwing coins to Umberlee and meaning every one of them.',
    asi: ['str', 'dex', 'wis'],
    originFeat: 'tavern-brawler',
    skills: ['acrobatics', 'perception'],
    tools: ['navigators-tools'],
    equipment: [['dagger', 1], ['navigators-tools', 1], ['rope-hempen', 1], ['clothes-traveler', 1]],
    gold: 20,
    deities: ['Umberlee', 'Valkur', 'Selûne', 'Talos'],
    bonds: [
      'Your ship went down off the Mere. You came ashore and never explained how.',
      'The bosun who taught you knots also taught you when to throw the first punch.',
      'You owe Umberlee a debt you paid in coin instead of blood, and she noticed.',
      'There is a berth waiting for you in Waterdeep harbour, and you keep not taking it.',
    ],
  }),

  scribe: bg('scribe', 'Scribe', {
    desc: 'You have copied contracts, wills and lies until your hand knew every letter by weight. Nothing sharpens a mind like being paid to notice.',
    flavor: 'You inked writs in a scriptorium of Oghma in Leilon, then kept the Townmaster\'s Hall ledgers in Phandalin for Harbin Wester — and read everything you filed.',
    asi: ['dex', 'int', 'wis'],
    originFeat: 'skilled',
    skills: ['investigation', 'perception'],
    tools: ['calligraphers-supplies'],
    equipment: [['calligraphers-supplies', 1], ['clothes-fine', 1], ['lamp', 1], ['ink', 3], ['ink-pen', 1], ['parchment', 12]],
    gold: 23,
    deities: ['Oghma', 'Deneir', 'Savras'],
    faction: 'harpers',
    bonds: [
      'You copied a contract you should have burned, and you kept the second copy.',
      'A Harper agent reads everything you send and has never once written back.',
      'Your master\'s hand is famous. You can forge it perfectly and never have.',
      'You are compiling a true history of Phandelver, whoever it embarrasses.',
    ],
  }),

  soldier: bg('soldier', 'Soldier', {
    desc: 'You drilled until the formation moved before you decided to, and stood in a line where standing was the whole job. War taught you order, and cost you for it.',
    flavor: 'You served the Lords\' Alliance garrison at Leilon, or marched under a captain like Sildar Hallwinter, keeping the High Road open against orcs out of Many-Arrows.',
    asi: ['str', 'dex', 'con'],
    originFeat: 'savage-attacker',
    skills: ['athletics', 'intimidation'],
    tools: ['gaming-dice'],
    toolOptions: GAMING_SETS,
    equipment: [['spear', 1], ['shortbow', 1], ['arrow', 20], ['gaming-dice', 1], ['healers-kit', 1], ['quiver', 1], ['clothes-traveler', 1]],
    gold: 14,
    deities: ['Tempus', 'Helm', 'Torm'],
    faction: 'lords-alliance',
    bonds: [
      'Sildar Hallwinter vouched for you once. You have not finished repaying it.',
      'Your company broke at Wyvern Tor. You are the part that kept walking.',
      'You carry a comrade\'s token back to a family in Neverwinter you have not found yet.',
      'Tempus does not reward the careful. You have decided to test that.',
    ],
  }),

  wayfarer: bg('wayfarer', 'Wayfarer', {
    desc: 'You grew up on the road with no roof owed to anyone, taking what luck offered and hiding when it did not. The Sword Coast raised you in pieces.',
    flavor: 'You have slept in every hayloft between Waterdeep and Neverwinter, flipped Tymora\'s coin at every crossroads, and never once paid a toll you could walk around.',
    asi: ['dex', 'wis', 'cha'],
    originFeat: 'lucky',
    skills: ['insight', 'stealth'],
    tools: ['thieves-tools'],
    equipment: [['dagger', 2], ['thieves-tools', 1], ['gaming-dice', 1], ['bedroll', 1], ['pouch', 2], ['clothes-traveler', 1]],
    gold: 16,
    deities: ['Tymora', 'Mask', 'Selûne'],
    bonds: [
      'Someone on the streets of Neverwinter fed you when they had nothing. You are looking for them.',
      'You have a coin you have never spent, and you flip it before every hard choice.',
      'The Redbrands ran you out of Phandalin once. You came back taller.',
      'You owe the road nothing and everyone on it a little.',
    ],
  }),

});

export const BACKGROUND_IDS = deepFreeze(Object.keys(BACKGROUNDS));

// ===========================================================================
// 2. FEATS — the single catalogue: origin, general, fighting-style, epic-boon
// ===========================================================================

/**
 * Feat entry builder.
 *   category    'origin' | 'general' | 'fighting-style' | 'epic-boon'
 *   prereq      null, or { level, ability:{str:13}, feat, class, spellcasting, prof }
 *   asi         abilities the feat's own +1 may go into, or null
 *   repeatable  may be taken again (Skilled, Resilient variants, Epic Boons)
 *   mech        read by rules/character.js mergeMech — SPEC.md §3 vocabulary only
 *   choice      an in-line pick the character-creation wizard should offer
 */
function feat(id, name, category, o) {
  return {
    id,
    name,
    category,
    desc: o.desc,
    prereq: o.prereq || null,
    asi: o.asi || null,
    repeatable: !!o.repeatable,
    mech: o.mech || {},
    choice: o.choice || null,
    choices: o.choices || null,
    special: o.special || null,
    tags: o.tags || [],
  };
}

const L4 = { level: 4 };

// ---------------------------------------------------------------------------
// 2a. ORIGIN FEATS — granted by a background at 1st level
// ---------------------------------------------------------------------------

const ORIGIN_FEATS = {

  alert: feat('alert', 'Alert', 'origin', {
    desc: 'You spent too many watches on a wall to be surprised again. You add your Proficiency Bonus to Initiative, and can trade your Initiative with a willing ally.',
    mech: { profToInitiative: true, passive: ['alert', 'alert-swap'] },
    tags: ['initiative'],
  }),

  crafter: feat('crafter', 'Crafter', 'origin', {
    desc: 'A bench, a bevel and a good eye. You know three artisan\'s trades, buy your materials cheap, and can knock together simple gear over a Short Rest.',
    mech: { toolProf: ['smiths-tools', 'carpenters-tools', 'leatherworkers-tools'], passive: ['crafter', 'discount-goods', 'fast-crafting'] },
    choice: { type: 'tool', count: 3, from: ARTISAN_TOOLS },
    tags: ['crafting', 'tools'],
  }),

  healer: feat('healer', 'Healer', 'origin', {
    desc: 'You have packed more wounds than you can count. With a healer\'s kit you can staunch a comrade as a Utilize action, restoring 1d6 hit points plus their Hit Point Die, and you never treat a healing roll of 1 as final.',
    mech: { toolProf: ['healers-kit'], passive: ['battle-medic', 'healer-reroll-ones'] },
    tags: ['healing', 'support'],
  }),

  lucky: feat('lucky', 'Lucky', 'origin', {
    desc: 'Tymora tilts the coin your way just often enough. You hold Luck Points equal to your Proficiency Bonus, spent to gain Advantage on a roll of your own or to impose Disadvantage on an attack against you.',
    mech: { resource: { id: 'luck', name: 'Luck Points', max: 'prof', recharge: 'long' }, passive: ['lucky'] },
    tags: ['luck', 'defense'],
  }),

  'magic-initiate-cleric': feat('magic-initiate-cleric', 'Magic Initiate (Cleric)', 'origin', {
    desc: 'A temple taught you the smallest of its prayers. You know two Cleric cantrips and one 1st-level Cleric spell, which you may cast once per Long Rest without a slot.',
    mech: {
      cantrip: [{ choose: 'cleric', count: 2, ability: 'wis' }],
      spellPerRest: [{ choose: 'cleric', level: 1, ability: 'wis', uses: 1, recharge: 'long' }],
      passive: ['magic-initiate'],
    },
    tags: ['spellcasting', 'divine'],
  }),

  'magic-initiate-druid': feat('magic-initiate-druid', 'Magic Initiate (Druid)', 'origin', {
    desc: 'A circle-keeper of the Emerald Enclave showed you the wood\'s smaller words. You know two Druid cantrips and one 1st-level Druid spell, castable once per Long Rest without a slot.',
    mech: {
      cantrip: [{ choose: 'druid', count: 2, ability: 'wis' }],
      spellPerRest: [{ choose: 'druid', level: 1, ability: 'wis', uses: 1, recharge: 'long' }],
      passive: ['magic-initiate'],
    },
    tags: ['spellcasting', 'primal'],
  }),

  'magic-initiate-wizard': feat('magic-initiate-wizard', 'Magic Initiate (Wizard)', 'origin', {
    desc: 'You copied out enough of somebody\'s spellbook to make it stick. You know two Wizard cantrips and one 1st-level Wizard spell, castable once per Long Rest without a slot.',
    mech: {
      cantrip: [{ choose: 'wizard', count: 2, ability: 'int' }],
      spellPerRest: [{ choose: 'wizard', level: 1, ability: 'int', uses: 1, recharge: 'long' }],
      passive: ['magic-initiate'],
    },
    tags: ['spellcasting', 'arcane'],
  }),

  musician: feat('musician', 'Musician', 'origin', {
    desc: 'You play three instruments passably and one of them well. After a rest, a tune of yours hands out Heroic Inspiration to allies up to your Proficiency Bonus.',
    mech: { toolProf: ['lute', 'flute', 'drum'], passive: ['encouraging-song'] },
    choice: { type: 'tool', count: 3, from: INSTRUMENTS },
    tags: ['support', 'inspiration'],
  }),

  'savage-attacker': feat('savage-attacker', 'Savage Attacker', 'origin', {
    desc: 'You put your whole weight behind the blow. Once per turn you may reroll a weapon\'s damage dice and use either total.',
    mech: { passive: ['savage-attacker'] },
    tags: ['damage', 'martial'],
  }),

  skilled: feat('skilled', 'Skilled', 'origin', {
    desc: 'You pick things up fast and never quite put them down. Gain proficiency in any three skills or tools.',
    repeatable: true,
    mech: { passive: ['skilled'] },
    choice: { type: 'skill', count: 3, from: 'auto' },
    tags: ['skills'],
  }),

  'tavern-brawler': feat('tavern-brawler', 'Tavern Brawler', 'origin', {
    desc: 'A taproom education, most of it in the Sleeping Giant. Your Unarmed Strike deals 1d4 damage, you reroll a 1 on that die once a turn, and you can shove a foe 5 feet after you land one.',
    mech: { unarmedDie: '1d4', weaponProf: ['improvised'], passive: ['tavern-brawler', 'brawler-push'] },
    tags: ['unarmed', 'martial'],
  }),

  tough: feat('tough', 'Tough', 'origin', {
    desc: 'Hard work, hard winters, and a stubbornness that borders on rude. Your hit point maximum increases by twice your level.',
    mech: { hpPerLevel: 2 },
    tags: ['durability'],
  }),

};

// ---------------------------------------------------------------------------
// 2b. GENERAL FEATS — level 4 and up. Most carry their own +1.
// ---------------------------------------------------------------------------

const GENERAL_FEATS = {

  'ability-score-improvement': feat('ability-score-improvement', 'Ability Score Improvement', 'general', {
    desc: 'Raw self-improvement, bought with hard practice. Increase one ability score by 2, or two ability scores by 1 each, to a maximum of 20.',
    prereq: L4,
    repeatable: true,
    // asi stays null: progression.js routes this through its dedicated +2 / +1+1
    // picker (the reserved 'asi' pseudo-option) rather than the flat feat +1.
    special: 'asi',
    mech: {},
    tags: ['ability'],
  }),

  actor: feat('actor', 'Actor', 'general', {
    desc: 'You wear other people like coats. You have Advantage when you try to pass as someone else, and can mimic a voice you have heard for a minute.',
    prereq: { level: 4, ability: { cha: 13 } },
    asi: ['cha'],
    mech: { advSkill: ['deception', 'performance'], passive: ['impersonation', 'mimicry'] },
    tags: ['social', 'stealth'],
  }),

  athlete: feat('athlete', 'Athlete', 'general', {
    desc: 'Wall, ledge or ditch, you go over it without slowing. You stand from Prone with 5 feet of movement, climb at your full Speed, and take a running jump after only 5 feet.',
    prereq: L4,
    asi: ['str', 'dex'],
    mech: { climbSpeed: 30, jumpMult: 1, passive: ['athlete', 'quick-stand', 'short-runup'] },
    tags: ['movement'],
  }),

  charger: feat('charger', 'Charger', 'general', {
    desc: 'You cover the ground and arrive badly. When you Dash as a Bonus Action, your next attack that turn deals an extra 1d8 damage, or shoves the target 10 feet.',
    prereq: L4,
    asi: ['str', 'dex'],
    mech: { passive: ['charger'], bonusDamage: [{ dice: '1d8', when: 'charge', once: 'turn' }] },
    tags: ['movement', 'damage'],
  }),

  chef: feat('chef', 'Chef', 'general', {
    desc: 'You cook, and the whole camp is better for it. Over a Short Rest your food restores an extra 1d8 hit points to those who eat it; over a Long Rest, treats grant Temporary Hit Points.',
    prereq: L4,
    asi: ['con', 'wis'],
    mech: { toolProf: ['cooks-utensils'], passive: ['chef', 'camp-cook'] },
    tags: ['support', 'healing'],
  }),

  'crossbow-expert': feat('crossbow-expert', 'Crossbow Expert', 'general', {
    desc: 'A crank, a bolt and no wasted breath. You ignore the Loading property, shoot without Disadvantage while a foe is on top of you, and can loose a hand crossbow as a Bonus Action.',
    prereq: { level: 4, prof: 'martial' },
    asi: ['dex'],
    mech: { passive: ['crossbow-expert', 'close-quarters-shooter', 'ignore-loading'] },
    tags: ['ranged', 'martial'],
  }),

  crusher: feat('crusher', 'Crusher', 'general', {
    desc: 'You hit things until they are somewhere else. Once per turn, bludgeoning damage you deal shoves a creature 5 feet; on a Critical Hit, attacks against it have Advantage until your next turn.',
    prereq: L4,
    asi: ['str', 'con'],
    mech: { passive: ['crusher'] },
    tags: ['damage', 'control'],
  }),

  'defensive-duelist': feat('defensive-duelist', 'Defensive Duelist', 'general', {
    desc: 'A parry taught in the salons of Waterdeep. While wielding a Finesse weapon you can spend your Reaction to add your Proficiency Bonus to AC against one melee attack.',
    prereq: { level: 4, ability: { dex: 13 } },
    asi: ['dex'],
    mech: { passive: ['defensive-duelist'] },
    tags: ['defense', 'reaction'],
  }),

  'dual-wielder': feat('dual-wielder', 'Dual Wielder', 'general', {
    desc: 'Two blades, no shield, no apologies. You can two-weapon fight with weapons that lack the Light property, and draw or stow two weapons whenever you would draw one.',
    prereq: L4,
    asi: ['str', 'dex'],
    mech: { passive: ['dual-wielder', 'quick-draw'] },
    tags: ['martial', 'damage'],
  }),

  durable: feat('durable', 'Durable', 'general', {
    desc: 'You have been left for dead and disappointed everyone. You have Advantage on Death Saving Throws, and as a Bonus Action can spend a Hit Point Die to patch yourself up mid-fight.',
    prereq: L4,
    asi: ['con'],
    mech: { passive: ['durable', 'defy-death', 'speedy-recovery'], advSaveVs: ['death'] },
    tags: ['durability'],
  }),

  'elemental-adept-acid': feat('elemental-adept-acid', 'Elemental Adept (Acid)', 'general', {
    desc: 'Your magic bites through hide and stone alike. Your spells ignore Resistance to Acid damage, and any 1 rolled on their Acid damage dice counts as a 2.',
    prereq: { level: 4, spellcasting: true },
    asi: CASTER_ABIL,
    mech: { passive: ['elemental-adept:acid'] },
    tags: ['spellcasting', 'damage'],
  }),

  'elemental-adept-cold': feat('elemental-adept-cold', 'Elemental Adept (Cold)', 'general', {
    desc: 'You have learned Auril\'s grammar. Your spells ignore Resistance to Cold damage, and any 1 rolled on their Cold damage dice counts as a 2.',
    prereq: { level: 4, spellcasting: true },
    asi: CASTER_ABIL,
    mech: { passive: ['elemental-adept:cold'] },
    tags: ['spellcasting', 'damage'],
  }),

  'elemental-adept-fire': feat('elemental-adept-fire', 'Elemental Adept (Fire)', 'general', {
    desc: 'Fire answers you faster than it answers anyone else. Your spells ignore Resistance to Fire damage, and any 1 rolled on their Fire damage dice counts as a 2.',
    prereq: { level: 4, spellcasting: true },
    asi: CASTER_ABIL,
    mech: { passive: ['elemental-adept:fire'] },
    tags: ['spellcasting', 'damage'],
  }),

  'elemental-adept-lightning': feat('elemental-adept-lightning', 'Elemental Adept (Lightning)', 'general', {
    desc: 'Talos\'s temper, held on a short leash. Your spells ignore Resistance to Lightning damage, and any 1 rolled on their Lightning damage dice counts as a 2.',
    prereq: { level: 4, spellcasting: true },
    asi: CASTER_ABIL,
    mech: { passive: ['elemental-adept:lightning'] },
    tags: ['spellcasting', 'damage'],
  }),

  'elemental-adept-thunder': feat('elemental-adept-thunder', 'Elemental Adept (Thunder)', 'general', {
    desc: 'Your magic lands like weather off the Sea of Swords. Your spells ignore Resistance to Thunder damage, and any 1 rolled on their Thunder damage dice counts as a 2.',
    prereq: { level: 4, spellcasting: true },
    asi: CASTER_ABIL,
    mech: { passive: ['elemental-adept:thunder'] },
    tags: ['spellcasting', 'damage'],
  }),

  'fey-touched': feat('fey-touched', 'Fey-Touched', 'general', {
    desc: 'Something in the Feywild took an interest and left a mark. You learn Misty Step and one 1st-level Divination or Enchantment spell, casting each once per Long Rest for free.',
    prereq: L4,
    asi: CASTER_ABIL,
    mech: {
      spellPerRest: [
        { spellId: 'misty-step', level: 2, ability: 'cha', uses: 1, recharge: 'long' },
        { choose: 'fey-touched', level: 1, schools: ['divination', 'enchantment'], ability: 'cha', uses: 1, recharge: 'long' },
      ],
      passive: ['fey-touched'],
    },
    choice: { type: 'spell', count: 1, from: 'auto' },
    tags: ['spellcasting', 'movement'],
  }),

  grappler: feat('grappler', 'Grappler', 'general', {
    desc: 'You get a fistful of somebody and do not let go. You have Advantage on attacks against a creature you have Grappled, and can drag it with you at no cost to your Speed.',
    prereq: { level: 4, ability: { str: 13 } },
    asi: ['str', 'dex'],
    mech: { passive: ['grappler', 'punch-and-grab'] },
    tags: ['control', 'martial'],
  }),

  'great-weapon-master': feat('great-weapon-master', 'Great Weapon Master', 'general', {
    desc: 'Nothing subtle about it. Once per turn a hit with a Heavy weapon deals extra damage equal to your Proficiency Bonus, and dropping a foe or scoring a crit buys you another swing as a Bonus Action.',
    prereq: { level: 4, prof: 'martial' },
    asi: ['str'],
    mech: { passive: ['great-weapon-master', 'heavy-weapon-mastery'] },
    tags: ['damage', 'martial'],
  }),

  'heavily-armored': feat('heavily-armored', 'Heavily Armored', 'general', {
    desc: 'You learned to live inside a suit of plate. You gain proficiency with Heavy armour.',
    prereq: { level: 4, prof: 'medium' },
    asi: ['str', 'con'],
    mech: { armorProf: ['heavy'] },
    tags: ['armor', 'defense'],
  }),

  'heavy-armor-master': feat('heavy-armor-master', 'Heavy Armor Master', 'general', {
    desc: 'Blows land on steel and stay there. While in Heavy armour, reduce Bludgeoning, Piercing and Slashing damage you take by your Proficiency Bonus.',
    prereq: { level: 4, prof: 'heavy' },
    asi: ['str', 'con'],
    mech: { passive: ['heavy-armor-master'] },
    tags: ['armor', 'defense'],
  }),

  'inspiring-leader': feat('inspiring-leader', 'Inspiring Leader', 'general', {
    desc: 'You say the right thing before the doors open. Spend a Bonus Action and up to six allies gain Temporary Hit Points equal to your Proficiency Bonus plus your Charisma modifier.',
    prereq: { level: 4, ability: { cha: 13 } },
    asi: ['wis', 'cha'],
    mech: { passive: ['inspiring-leader'] },
    tags: ['support', 'temphp'],
  }),

  'keen-mind': feat('keen-mind', 'Keen Mind', 'general', {
    desc: 'You forget nothing you have paid attention to. You can Study as a Bonus Action, always know which way is north, and recall anything seen or heard within the past month.',
    prereq: L4,
    asi: ['int'],
    mech: { passive: ['keen-mind', 'quick-study'] },
    tags: ['knowledge'],
  }),

  'lightly-armored': feat('lightly-armored', 'Lightly Armored', 'general', {
    desc: 'Boiled leather and a shield are no longer strangers to you. You gain proficiency with Light armour and Shields.',
    prereq: L4,
    asi: ['str', 'dex'],
    mech: { armorProf: ['light', 'shields'] },
    tags: ['armor', 'defense'],
  }),

  'mage-slayer': feat('mage-slayer', 'Mage Slayer', 'general', {
    desc: 'You have killed enough wizards to know where the words break. Damage you deal gives Disadvantage on Concentration saves, and you have Advantage on saves against spells cast within 5 feet of you.',
    prereq: L4,
    asi: ['str', 'dex'],
    mech: { passive: ['mage-slayer', 'concentration-breaker', 'guarded-mind'], advSaveVs: ['spell'] },
    tags: ['anti-caster', 'martial'],
  }),

  'martial-weapon-training': feat('martial-weapon-training', 'Martial Weapon Training', 'general', {
    desc: 'Drill yard, quarterstaff, then real steel. You gain proficiency with all Martial weapons.',
    prereq: L4,
    asi: ['str', 'dex'],
    mech: { weaponProf: ['martial'] },
    tags: ['martial', 'weapons'],
  }),

  'medium-armor-master': feat('medium-armor-master', 'Medium Armor Master', 'general', {
    desc: 'Half-plate that moves like a shirt. Medium armour no longer imposes Disadvantage on Stealth, and you may add up to 3 of your Dexterity modifier to its AC.',
    prereq: { level: 4, prof: 'medium' },
    asi: ['str', 'dex'],
    mech: { passive: ['medium-armor-master', 'medium-armor-stealth', 'medium-armor-dex-3'] },
    tags: ['armor', 'stealth'],
  }),

  'moderately-armored': feat('moderately-armored', 'Moderately Armored', 'general', {
    desc: 'Scale, breastplate and a shield-arm that has learned its work. You gain proficiency with Medium armour and Shields.',
    prereq: { level: 4, prof: 'light' },
    asi: ['str', 'dex'],
    mech: { armorProf: ['medium', 'shields'] },
    tags: ['armor', 'defense'],
  }),

  'mounted-combatant': feat('mounted-combatant', 'Mounted Combatant', 'general', {
    desc: 'You fight from the saddle as though it were ground. You have Advantage against smaller unmounted foes, can pull an attack onto yourself instead of your mount, and your mount evades area effects.',
    prereq: L4,
    asi: ['str', 'dex', 'wis'],
    mech: { passive: ['mounted-combatant', 'leap-aside', 'veer'] },
    tags: ['mounted', 'martial'],
  }),

  observant: feat('observant', 'Observant', 'general', {
    desc: 'You read a room the way others read a signpost. You can take the Search action as a Bonus Action, and little escapes your notice.',
    prereq: L4,
    asi: ['int', 'wis'],
    mech: { passive: ['observant', 'quick-search'], skillBonus: { perception: 2, investigation: 2 } },
    tags: ['perception', 'knowledge'],
  }),

  piercer: feat('piercer', 'Piercer', 'general', {
    desc: 'You find the gap in the mail every time. Once per turn you may reroll one die of Piercing damage, and a Critical Hit with a piercing weapon adds an extra damage die.',
    prereq: L4,
    asi: ['str', 'dex'],
    mech: { passive: ['piercer'] },
    tags: ['damage', 'martial'],
  }),

  poisoner: feat('poisoner', 'Poisoner', 'general', {
    desc: 'A trade learned from Talona\'s quieter faithful. You coat a weapon as a Bonus Action, ignore Resistance to Poison, and can brew a potent venom that sickens as it burns.',
    prereq: L4,
    asi: ['dex', 'int'],
    mech: { toolProf: ['poisoners-kit'], passive: ['poisoner', 'ignore-poison-resistance'] },
    tags: ['damage', 'debuff'],
  }),

  'polearm-master': feat('polearm-master', 'Polearm Master', 'general', {
    desc: 'The haft is a weapon too. With a glaive, halberd, quarterstaff or spear you strike with the butt-end as a Bonus Action, and can attack anyone who steps into your reach.',
    prereq: L4,
    asi: ['str', 'dex'],
    mech: { passive: ['polearm-master', 'reach-opportunity'] },
    tags: ['martial', 'control'],
  }),

  'resilient-str': feat('resilient-str', 'Resilient (Strength)', 'general', {
    desc: 'You brace and hold when the ground wants you moved. Gain proficiency in Strength saving throws.',
    prereq: L4,
    asi: ['str'],
    mech: { saveProf: ['str'] },
    tags: ['saves'],
  }),

  'resilient-dex': feat('resilient-dex', 'Resilient (Dexterity)', 'general', {
    desc: 'You are out of the blast before the blast knows it. Gain proficiency in Dexterity saving throws.',
    prereq: L4,
    asi: ['dex'],
    mech: { saveProf: ['dex'] },
    tags: ['saves'],
  }),

  'resilient-con': feat('resilient-con', 'Resilient (Constitution)', 'general', {
    desc: 'Poison, plague and the long cold cannot get a grip. Gain proficiency in Constitution saving throws.',
    prereq: L4,
    asi: ['con'],
    mech: { saveProf: ['con'] },
    tags: ['saves', 'concentration'],
  }),

  'resilient-int': feat('resilient-int', 'Resilient (Intelligence)', 'general', {
    desc: 'Your mind has a door and you keep it shut. Gain proficiency in Intelligence saving throws.',
    prereq: L4,
    asi: ['int'],
    mech: { saveProf: ['int'] },
    tags: ['saves'],
  }),

  'resilient-wis': feat('resilient-wis', 'Resilient (Wisdom)', 'general', {
    desc: 'Charms and terrors slide off a settled will. Gain proficiency in Wisdom saving throws.',
    prereq: L4,
    asi: ['wis'],
    mech: { saveProf: ['wis'] },
    tags: ['saves'],
  }),

  'resilient-cha': feat('resilient-cha', 'Resilient (Charisma)', 'general', {
    desc: 'You know exactly who you are, whatever is pulling at it. Gain proficiency in Charisma saving throws.',
    prereq: L4,
    asi: ['cha'],
    mech: { saveProf: ['cha'] },
    tags: ['saves'],
  }),

  'ritual-caster': feat('ritual-caster', 'Ritual Caster', 'general', {
    desc: 'You keep a book of the slow magic — the spells that need a candle and ten minutes rather than a battlefield. You learn two 1st-level rituals and can copy more from scrolls you find.',
    prereq: { level: 4, spellcasting: true },
    asi: CASTER_ABIL,
    repeatable: true,
    mech: { passive: ['ritual-caster'] },
    choice: { type: 'spell', count: 2, from: 'auto' },
    tags: ['spellcasting', 'utility'],
  }),

  sentinel: feat('sentinel', 'Sentinel', 'general', {
    desc: 'Nothing walks past you. When a foe within reach attacks an ally you may strike it as a Reaction, and your Opportunity Attacks reduce a creature\'s Speed to 0 for the turn.',
    prereq: L4,
    asi: ['str', 'dex'],
    mech: { passive: ['sentinel', 'guardian', 'halt'] },
    tags: ['control', 'defense'],
  }),

  'shadow-touched': feat('shadow-touched', 'Shadow-Touched', 'general', {
    desc: 'The Shadowfell brushed you once and left the door ajar. You learn Invisibility and one 1st-level Illusion or Necromancy spell, casting each once per Long Rest for free.',
    prereq: L4,
    asi: CASTER_ABIL,
    mech: {
      spellPerRest: [
        { spellId: 'invisibility', level: 2, ability: 'cha', uses: 1, recharge: 'long' },
        { choose: 'shadow-touched', level: 1, schools: ['illusion', 'necromancy'], ability: 'cha', uses: 1, recharge: 'long' },
      ],
      passive: ['shadow-touched'],
    },
    choice: { type: 'spell', count: 1, from: 'auto' },
    tags: ['spellcasting', 'stealth'],
  }),

  sharpshooter: feat('sharpshooter', 'Sharpshooter', 'general', {
    desc: 'You shoot the sliver of a man showing past a shield. Cover means nothing, long range costs you nothing, and a foe at your elbow does not spoil the shot.',
    prereq: { level: 4, prof: 'martial' },
    asi: ['dex'],
    mech: { passive: ['sharpshooter', 'bypass-cover', 'long-shot', 'close-quarters-shooter'] },
    tags: ['ranged', 'martial'],
  }),

  'shield-master': feat('shield-master', 'Shield Master', 'general', {
    desc: 'The shield is the weapon. After you Attack you can shove with it as a Bonus Action, and a successful Dexterity save behind it leaves you untouched.',
    prereq: { level: 4, ability: { str: 13 }, prof: 'shields' },
    asi: ['str'],
    mech: { passive: ['shield-master', 'shield-bash', 'interpose-shield'] },
    tags: ['defense', 'control'],
  }),

  skulker: feat('skulker', 'Skulker', 'general', {
    desc: 'You are always somewhere other than where you were seen. You can Hide as a Bonus Action, missing from cover does not give you away, and you sense the unseen out to 10 feet.',
    prereq: { level: 4, ability: { dex: 13 } },
    asi: ['dex'],
    mech: { blindsight: 10, passive: ['skulker', 'ambusher', 'sniper'] },
    tags: ['stealth', 'ranged'],
  }),

  slasher: feat('slasher', 'Slasher', 'general', {
    desc: 'You cut for the legs and the tendons. Once per turn slashing damage you deal reduces a creature\'s Speed by 10 feet, and a crit leaves it swinging wide until your next turn.',
    prereq: L4,
    asi: ['str', 'dex'],
    mech: { passive: ['slasher'] },
    tags: ['damage', 'control'],
  }),

  speedy: feat('speedy', 'Speedy', 'general', {
    desc: 'You move like the road is shorter for you. Your Speed increases by 10 feet, and when you Dash you ignore Difficult Terrain.',
    prereq: { level: 4, ability: { dex: 13 } },
    asi: ['dex', 'con'],
    mech: { speedBonus: 10, passive: ['speedy', 'fleet-dash'] },
    tags: ['movement'],
  }),

  'spell-sniper': feat('spell-sniper', 'Spell Sniper', 'general', {
    desc: 'You have learned to stretch a spell across a battlefield. Attack-roll spells double their range and ignore cover, and you learn one more attack cantrip.',
    prereq: { level: 4, spellcasting: true },
    asi: CASTER_ABIL,
    mech: { cantrip: [{ choose: 'any-attack', count: 1, ability: 'cha' }], passive: ['spell-sniper', 'bypass-cover'] },
    tags: ['spellcasting', 'ranged'],
  }),

  telekinetic: feat('telekinetic', 'Telekinetic', 'general', {
    desc: 'The Weave answers a gesture you barely make. You learn Mage Hand — invisible and long-reaching — and can shove a creature 5 feet with a thought as a Bonus Action.',
    prereq: L4,
    asi: CASTER_ABIL,
    mech: { cantrip: [{ spellId: 'mage-hand', ability: 'cha' }], passive: ['telekinetic', 'invisible-hand'] },
    tags: ['spellcasting', 'control'],
  }),

  telepathic: feat('telepathic', 'Telepathic', 'general', {
    desc: 'You speak straight into a mind out to 60 feet, and once a day you can listen back. You cast Detect Thoughts once per Long Rest without a slot.',
    prereq: L4,
    asi: CASTER_ABIL,
    mech: {
      spellPerRest: [{ spellId: 'detect-thoughts', level: 2, ability: 'cha', uses: 1, recharge: 'long' }],
      passive: ['telepathic', 'telepathic-speech'],
    },
    tags: ['spellcasting', 'social'],
  }),

  'war-caster': feat('war-caster', 'War Caster', 'general', {
    desc: 'You cast with a blade in your hand and a shield on your arm. You have Advantage on Concentration saves, can perform somatic components with your hands full, and may cast a spell as an Opportunity Attack.',
    prereq: { level: 4, spellcasting: true },
    asi: CASTER_ABIL,
    mech: { concentrationAdv: true, advSaveVs: ['concentration'], passive: ['war-caster', 'somatic-free-hands', 'reactive-spell'] },
    tags: ['spellcasting', 'concentration'],
  }),

  'weapon-master': feat('weapon-master', 'Weapon Master', 'general', {
    desc: 'You have made a study of steel. You gain the Mastery property of one more kind of weapon, and can change which one after a Long Rest.',
    prereq: L4,
    repeatable: true,
    asi: ['str', 'dex'],
    mech: { passive: ['weapon-master'], masteryBonus: 1 },
    choice: { type: 'mastery', count: 1, from: 'auto' },
    tags: ['martial', 'mastery'],
  }),

};

// ---------------------------------------------------------------------------
// 2c. FIGHTING STYLE FEATS
// NOTE: rules/character.js already resolves archery, defense, dueling,
// thrown-weapon-fighting, two-weapon-fighting and great-weapon-fighting by id in
// its attack/AC maths. Their mech blocks therefore carry only the extras the
// engine cannot infer, so nothing is double-counted.
// ---------------------------------------------------------------------------

const STYLE_FEATS = {

  archery: feat('archery', 'Archery', 'fighting-style', {
    desc: 'A bowman\'s stance, drilled until the shot is the same every time. You gain a +2 bonus to attack rolls with Ranged weapons.',
    mech: { passive: ['style-archery'] },
    tags: ['ranged'],
  }),

  'blind-fighting': feat('blind-fighting', 'Blind Fighting', 'fighting-style', {
    desc: 'Darkness, fog, a cave with no torch — you fight through all of it. You have Blindsight out to 10 feet.',
    mech: { blindsight: 10, passive: ['style-blind-fighting'] },
    tags: ['defense', 'senses'],
  }),

  defense: feat('defense', 'Defense', 'fighting-style', {
    desc: 'You wear armour the way other people wear a coat. While in Light, Medium or Heavy armour you gain a +1 bonus to Armour Class.',
    mech: { passive: ['style-defense'] },
    tags: ['defense', 'armor'],
  }),

  dueling: feat('dueling', 'Dueling', 'fighting-style', {
    desc: 'One blade, one hand, nothing else in the way. When you wield a Melee weapon in one hand and no other weapon, you gain +2 damage with it.',
    mech: { passive: ['style-dueling'] },
    tags: ['melee', 'damage'],
  }),

  'great-weapon-fighting': feat('great-weapon-fighting', 'Great Weapon Fighting', 'fighting-style', {
    desc: 'Even your poor swings hurt. When you roll a 1 or 2 on a damage die for a Two-Handed or Versatile melee weapon, treat it as a 3.',
    mech: { passive: ['style-great-weapon-fighting'] },
    tags: ['melee', 'damage'],
  }),

  interception: feat('interception', 'Interception', 'fighting-style', {
    desc: 'You put yourself in the way. As a Reaction, reduce the damage a creature within 5 feet takes by 1d10 plus your Proficiency Bonus.',
    mech: { passive: ['style-interception'] },
    tags: ['defense', 'reaction', 'support'],
  }),

  protection: feat('protection', 'Protection', 'fighting-style', {
    desc: 'A shield raised for someone else. When a creature you can see attacks a target within 5 feet of you, spend your Reaction to impose Disadvantage on that attack.',
    mech: { passive: ['style-protection'] },
    tags: ['defense', 'reaction', 'support'],
  }),

  'thrown-weapon-fighting': feat('thrown-weapon-fighting', 'Thrown Weapon Fighting', 'fighting-style', {
    desc: 'Handaxe, javelin, dagger — they all fly true. You gain +2 damage with thrown weapons and can draw one as part of the attack.',
    mech: { passive: ['style-thrown-weapon-fighting'] },
    tags: ['ranged', 'damage'],
  }),

  'two-weapon-fighting': feat('two-weapon-fighting', 'Two-Weapon Fighting', 'fighting-style', {
    desc: 'The off-hand is not an afterthought. When you make the extra attack of two-weapon fighting, add your ability modifier to its damage.',
    mech: { passive: ['style-two-weapon-fighting'] },
    tags: ['melee', 'damage'],
  }),

  'unarmed-fighting': feat('unarmed-fighting', 'Unarmed Fighting', 'fighting-style', {
    desc: 'Fists, elbows and a grip that does not let go. Your Unarmed Strikes deal 1d6 Bludgeoning damage, or 1d8 with no weapon or shield in hand.',
    mech: { unarmedDie: '1d6', passive: ['style-unarmed-fighting'] },
    tags: ['unarmed', 'melee'],
  }),

  'blessed-warrior': feat('blessed-warrior', 'Blessed Warrior', 'fighting-style', {
    desc: 'Your oath comes with a small, sharp grace. You learn two Cleric cantrips, which count as Paladin spells for you.',
    mech: { cantrip: [{ choose: 'cleric', count: 2, ability: 'cha' }], passive: ['style-blessed-warrior'] },
    tags: ['divine', 'spellcasting'],
  }),

  'druidic-warrior': feat('druidic-warrior', 'Druidic Warrior', 'fighting-style', {
    desc: 'The wood lends you two small words. You learn two Druid cantrips, which count as Ranger spells for you.',
    mech: { cantrip: [{ choose: 'druid', count: 2, ability: 'wis' }], passive: ['style-druidic-warrior'] },
    tags: ['primal', 'spellcasting'],
  }),

};

// ---------------------------------------------------------------------------
// 2d. EPIC BOONS — the post-20 Mythic progression (SPEC.md §8)
// Every boon also grants +1 to an ability score and lifts that ability's ceiling
// from 20 to 30 (`abilityCap30`, read by rules/character.js). They are all marked
// repeatable so the never-ending Mythic tiers never run out of choices — taking a
// boon again deepens it rather than granting a duplicate.
// ---------------------------------------------------------------------------

function boon(id, name, o) {
  return feat(id, name, 'epic-boon', {
    desc: o.desc,
    prereq: { level: 20 },
    asi: o.asi || ABIL,
    repeatable: true,
    mech: Object.assign({ abilityCap30: true }, o.mech || {}),
    tags: (o.tags || []).concat('epic'),
  });
}

const EPIC_BOON_FEATS = {

  'boon-of-combat-prowess': boon('boon-of-combat-prowess', 'Boon of Combat Prowess', {
    desc: 'Your strikes have stopped negotiating with chance. When you miss with an attack on your turn, you can choose to hit instead — once per turn.',
    mech: { passive: ['boon-combat-prowess'] },
    tags: ['damage', 'martial'],
  }),

  'boon-of-dimensional-travel': boon('boon-of-dimensional-travel', 'Boon of Dimensional Travel', {
    desc: 'Space has become a suggestion. Immediately after you take the Attack or Magic action, you can teleport up to 30 feet to a space you can see.',
    mech: { passive: ['boon-dimensional-travel'] },
    tags: ['movement'],
  }),

  'boon-of-energy-resistance': boon('boon-of-energy-resistance', 'Boon of Energy Resistance', {
    desc: 'The elements have stopped taking you seriously. You gain Resistance to two damage types of your choice, and once per turn can add 2d12 of one of them to a hit.',
    mech: { resist: ['fire', 'cold'], passive: ['boon-energy-resistance'], bonusDamage: [{ dice: '2d12', once: 'turn', when: 'boon-energy' }] },
    tags: ['defense', 'damage'],
  }),

  'boon-of-fate': boon('boon-of-fate', 'Boon of Fate', {
    desc: 'You lean on destiny and it takes your weight. Once per Short Rest, when a creature within 60 feet makes a D20 Test, roll 2d4 and add or subtract the total.',
    mech: { resource: { id: 'boon-fate', name: 'Fate', max: 1, recharge: 'short' }, passive: ['boon-fate'] },
    tags: ['luck', 'support'],
  }),

  'boon-of-fortitude': boon('boon-of-fortitude', 'Boon of Fortitude', {
    desc: 'You have become very hard to finish. Your hit point maximum increases by 40, and whenever you spend a Hit Point Die you regain extra hit points equal to your Constitution modifier.',
    asi: ['con'],
    mech: { maxHpBonus: 40, passive: ['boon-fortitude'] },
    tags: ['durability'],
  }),

  'boon-of-irresistible-offense': boon('boon-of-irresistible-offense', 'Boon of Irresistible Offense', {
    desc: 'Nothing turns your blow aside any more. You ignore Resistance to Bludgeoning, Piercing and Slashing damage, and a natural 20 on a D20 Test adds your highest ability score to the damage.',
    asi: ['str', 'dex'],
    mech: { passive: ['boon-irresistible-offense', 'ignore-physical-resistance'] },
    tags: ['damage', 'martial'],
  }),

  'boon-of-recovery': boon('boon-of-recovery', 'Boon of Recovery', {
    desc: 'You do not stay down. As a Bonus Action you can regain half your hit point maximum, a number of times per Long Rest equal to your Proficiency Bonus, and dropping to 0 hit points leaves you at 1 instead.',
    asi: ['con'],
    mech: { resource: { id: 'boon-recovery', name: 'Recovery', max: 'prof', recharge: 'long' }, passive: ['boon-recovery', 'defy-death'] },
    tags: ['healing', 'durability'],
  }),

  'boon-of-skill': boon('boon-of-skill', 'Boon of Skill', {
    desc: 'There is nothing left you cannot at least attempt. You gain proficiency in every skill, and Expertise in two of your choice.',
    mech: {
      skillProf: [
        'acrobatics', 'animal-handling', 'arcana', 'athletics', 'deception', 'history',
        'insight', 'intimidation', 'investigation', 'medicine', 'nature', 'perception',
        'performance', 'persuasion', 'religion', 'sleight-of-hand', 'stealth', 'survival',
      ],
      passive: ['boon-skill'],
    },
    choice: { type: 'expertise', count: 2, from: 'auto' },
    tags: ['skills'],
  }),

  'boon-of-speed': boon('boon-of-speed', 'Boon of Speed', {
    desc: 'You cross ground faster than the eye follows. Your Speed increases by 30 feet, you ignore Difficult Terrain, and you can Disengage as a Bonus Action.',
    asi: ['dex'],
    mech: { speedBonus: 30, passive: ['boon-speed', 'zephyr-step'] },
    tags: ['movement'],
  }),

  'boon-of-spell-recall': boon('boon-of-spell-recall', 'Boon of Spell Recall', {
    desc: 'The Weave gives your smaller workings back to you. Once per turn you can cast a prepared spell of level 4 or lower without expending a spell slot.',
    asi: CASTER_ABIL,
    mech: { passive: ['boon-spell-recall'] },
    tags: ['spellcasting'],
  }),

  'boon-of-the-night-spirit': boon('boon-of-the-night-spirit', 'Boon of the Night Spirit', {
    desc: 'Shadow has taken you in as one of its own. You see 120 feet into the dark, and while in Dim Light or Darkness you can become Invisible as a Magic action and resist all damage but Force and Psychic.',
    asi: ['dex', 'wis', 'cha'],
    mech: { darkvision: 120, passive: ['boon-night-spirit'] },
    tags: ['stealth', 'defense'],
  }),

  'boon-of-truesight': boon('boon-of-truesight', 'Boon of Truesight', {
    desc: 'Illusion, darkness and shapechange are all one clear pane to you now. You have Truesight out to 60 feet.',
    asi: ['wis', 'int'],
    mech: { truesight: 60, darkvision: 120, passive: ['boon-truesight'] },
    tags: ['senses'],
  }),

  'boon-of-undetectability': boon('boon-of-undetectability', 'Boon of Undetectability', {
    desc: 'The world has largely stopped noticing you on purpose. You add your Proficiency Bonus to Stealth checks, cannot be found by Divination magic, and are invisible to scrying sensors.',
    asi: ['dex', 'cha'],
    mech: { skillExpertise: ['stealth'], passive: ['boon-undetectability', 'scry-proof'] },
    tags: ['stealth'],
  }),

};

// ---------------------------------------------------------------------------
// 2e. The exported catalogues
// ---------------------------------------------------------------------------

export const FEATS = deepFreeze({
  ...ORIGIN_FEATS,
  ...GENERAL_FEATS,
  ...STYLE_FEATS,
  ...EPIC_BOON_FEATS,
});

/** Frozen filtered VIEWS of FEATS — same object identities, so lookups agree. */
function viewOf(category) {
  const out = {};
  for (const id of Object.keys(FEATS)) if (FEATS[id].category === category) out[id] = FEATS[id];
  return Object.freeze(out);
}

export const FIGHTING_STYLES = viewOf('fighting-style');
export const EPIC_BOONS = viewOf('epic-boon');
export const ORIGIN_FEAT_CATALOGUE = viewOf('origin');
export const GENERAL_FEAT_CATALOGUE = viewOf('general');

export const FEAT_IDS = deepFreeze(Object.keys(FEATS));

export const FEAT_CATEGORIES = deepFreeze([
  { id: 'origin', name: 'Origin Feat', desc: 'Granted by your background at 1st level. Anyone can take one at character creation.' },
  { id: 'general', name: 'General Feat', desc: 'Taken in place of an Ability Score Improvement at 4th level and beyond.' },
  { id: 'fighting-style', name: 'Fighting Style', desc: 'A trained way of fighting, granted by the martial classes.' },
  { id: 'epic-boon', name: 'Epic Boon', desc: 'Beyond 20th level, a gift of the divine or the Weave. Lifts an ability ceiling to 30.' },
]);

// ===========================================================================
// 3. LANGUAGES — the tongues of the Sword Coast and beyond
// ===========================================================================

function lang(id, name, category, script, desc, o = {}) {
  return { id, name, category, script, desc, speakers: o.speakers || '', dialects: o.dialects || [], secret: !!o.secret };
}

export const LANGUAGES = deepFreeze([

  // --- Standard ------------------------------------------------------------
  lang('common', 'Common', 'standard', 'Common', 'The trade tongue of the Sword Coast, hammered out of Chondathan on a thousand caravan roads. Everyone from Waterdeep to Luskan speaks at least enough of it to haggle.', { speakers: 'Everyone' }),
  lang('common-sign', 'Common Sign Language', 'standard', 'None', 'A silent grammar of hands used by caravan guards, thieves and anyone who needs to be understood across a noisy taproom or a quiet corridor.', { speakers: 'Guards, scouts, the deaf' }),
  lang('dwarvish', 'Dwarvish', 'standard', 'Dethek', 'Hard consonants cut for shouting over a forge, written in the angular Dethek runes carved on every dwarfhold lintel from Mithral Hall to Gauntlgrym.', { speakers: 'Dwarves, duergar' }),
  lang('elvish', 'Elvish', 'standard', 'Espruar', 'Fluid, subtle, and full of words for shades of moonlight. Its flowing Espruar script decorates half the ruins in the North.', { speakers: 'Elves, half-elves' }),
  lang('giant', 'Giant', 'standard', 'Dethek', 'The booming speech of the ordning, from hill giant grunt to the formal cadences of cloud giant courts. Ogres and ettins murder it happily.', { speakers: 'Giants, ogres, trolls' }),
  lang('gnomish', 'Gnomish', 'standard', 'Dethek', 'A quick, technical tongue with an unreasonable number of words for mechanisms. Rock gnomes gossip in it while their inventions catch fire.', { speakers: 'Gnomes' }),
  lang('goblin', 'Goblin', 'standard', 'Dethek', 'The barking cant of goblinkind, spoken from Cragmaw Hideout to the deepest bugbear warren. Short, cruel and easy to shout.', { speakers: 'Goblins, hobgoblins, bugbears' }),
  lang('halfling', 'Halfling', 'standard', 'Common', 'A warm, gossipy tongue kept mostly for family and kitchen. Halflings rarely write it down and rarely teach it to outsiders.', { speakers: 'Halflings' }),
  lang('orc', 'Orc', 'standard', 'Dethek', 'The harsh speech of Gruumsh\'s children, carried south out of Many-Arrows on raiding seasons. Every second word is a boast or a threat.', { speakers: 'Orcs, half-orcs, orogs' }),

  // --- Rare / exotic -------------------------------------------------------
  lang('abyssal', 'Abyssal', 'rare', 'Infernal', 'The shrieking tongue of demons, a corruption of Celestial that hurts to hold in the mouth. Cultists learn it and are rarely improved by it.', { speakers: 'Demons, cultists' }),
  lang('celestial', 'Celestial', 'rare', 'Celestial', 'The bright, ringing speech of the Upper Planes. Aasimar sometimes dream in it before they ever learn a word.', { speakers: 'Celestials, aasimar' }),
  lang('deep-speech', 'Deep Speech', 'rare', 'None', 'The alien burbling of aboleths and mind flayers, shaped for mouths that are not mouths. It cannot truly be written, only approximated.', { speakers: 'Aberrations, elder brains' }),
  lang('draconic', 'Draconic', 'rare', 'Draconic', 'The oldest language still in use, and the root of most arcane notation. Wizards from Candlekeep to Thay argue in it out of habit.', { speakers: 'Dragons, dragonborn, wizards' }),
  lang('infernal', 'Infernal', 'rare', 'Infernal', 'The precise, contractual speech of the Nine Hells, where every clause matters and every devil knows it. Tieflings inherit its cadence.', { speakers: 'Devils, tieflings' }),
  lang('primordial', 'Primordial', 'rare', 'Dwarvish', 'The language of elemental beings, spoken in four dialects that all understand one another: Aquan, Auran, Ignan and Terran.', { speakers: 'Elementals, genies', dialects: ['Aquan', 'Auran', 'Ignan', 'Terran'] }),
  lang('sylvan', 'Sylvan', 'rare', 'Elvish', 'The old speech of the Feywild — dryads, satyrs and the wood itself. Reidoth of Thundertree still uses it to argue with trees.', { speakers: 'Fey, druids' }),
  lang('undercommon', 'Undercommon', 'rare', 'Elvish', 'The trade pidgin of the Underdark, cobbled from drow, duergar and svirfneblin usage. Spoken quietly, and usually about prices.', { speakers: 'Drow, duergar, deep gnomes' }),

  // --- Secret --------------------------------------------------------------
  lang('druidic', 'Druidic', 'secret', 'None', 'The secret tongue of druids, taught to no outsider. Its written marks are left on stones and bark, invisible to anyone who does not know the circle.', { speakers: 'Druids only', secret: true }),
  lang('thieves-cant', "Thieves' Cant", 'secret', 'None', 'A code buried inside ordinary conversation, plus chalk marks on doorframes. The Redbrands scratched theirs all over Phandalin before somebody scrubbed it off.', { speakers: 'Rogues, smugglers, the Black Network', secret: true }),

  // --- Regional human tongues of Faerûn ------------------------------------
  lang('chondathan', 'Chondathan', 'regional', 'Thorass', 'The ancestor of Common, still spoken properly in the Heartlands and by old Sword Coast families who consider Common a debasement of it.', { speakers: 'Chondathans, Tethyrians' }),
  lang('illuskan', 'Illuskan', 'regional', 'Thorass', 'The rolling northern speech of Luskan, the Uthgardt and the Northlander clans, full of sea and weather and long feuds.', { speakers: 'Illuskans, Uthgardt' }),
  lang('damaran', 'Damaran', 'regional', 'Dethek', 'The blunt tongue of the Vaasan and Damaran north, carried west by mercenaries and mining families with hard names.', { speakers: 'Damarans' }),
  lang('alzhedo', 'Alzhedo', 'regional', 'Thorass', 'The ornate trade language of Calimshan, favoured by merchant houses whose caravans reach as far north as Waterdeep.', { speakers: 'Calishites' }),
  lang('turmic', 'Turmic', 'regional', 'Thorass', 'The musical speech of Turmish across the Sea of Fallen Stars, heard on the Sword Coast wherever a Turami sailor has taken shore leave.', { speakers: 'Turami' }),
  lang('rashemi', 'Rashemi', 'regional', 'Thorass', 'The tongue of Rashemen\'s berserker lodges and its witches — few speak it this far west, and those who do are worth watching.', { speakers: 'Rashemi, Thayans' }),
  lang('netherese', 'Netherese', 'regional', 'Draconic', 'A dead imperial language of the flying cities, surviving on shattered stonework, in ruins like Old Owl Well, and in the notes of very ambitious wizards.', { speakers: 'Scholars, the returned Shadovar' }),

]);

export const LANGUAGE_IDS = deepFreeze(LANGUAGES.map((l) => l.id));
export const STANDARD_LANGUAGES = deepFreeze(LANGUAGES.filter((l) => l.category === 'standard').map((l) => l.id));
export const RARE_LANGUAGES = deepFreeze(LANGUAGES.filter((l) => l.category === 'rare').map((l) => l.id));

// ===========================================================================
// 4. HELPERS — small, pure, and never returning a reference into the catalogue
// ===========================================================================

/** Every feat in a category, id included, sorted by name. */
export function featsByCategory(cat) {
  return Object.keys(FEATS)
    .filter((id) => FEATS[id].category === cat)
    .map((id) => FEATS[id])
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The 2024 Origin Feats — the ones a background may grant at 1st level. */
export function originFeats() {
  return featsByCategory('origin');
}

/** One feat definition, or null. */
export function getFeat(id) { return FEATS[id] || null; }
export function featName(id) { return FEATS[id]?.name || id; }

/** One background definition, or null. */
export function getBackground(id) { return BACKGROUNDS[id] || null; }

/** The origin feat id a background grants, or null. */
export function originFeatFor(bgId) { return BACKGROUNDS[bgId]?.originFeat || null; }

/** Backgrounds that boost a given ability — used to suggest a fit for a class. */
export function backgroundsForAbility(ab) {
  return Object.keys(BACKGROUNDS).filter((id) => BACKGROUNDS[id].asi.includes(ab));
}

/** The legal +2/+1 and +1/+1/+1 spreads for a background, as plain asi objects. */
export function asiSpreads(bgId) {
  const list = BACKGROUNDS[bgId]?.asi || [];
  if (list.length < 3) return [];
  const out = [{ label: '+1 / +1 / +1', asi: { [list[0]]: 1, [list[1]]: 1, [list[2]]: 1 } }];
  for (const big of list) {
    for (const small of list) {
      if (big === small) continue;
      out.push({ label: `+2 ${big.toUpperCase()} / +1 ${small.toUpperCase()}`, asi: { [big]: 2, [small]: 1 } });
    }
  }
  return out;
}

/** Flatten a background's kit into [{id, qty}] for the inventory. */
export function backgroundKit(bgId) {
  return (BACKGROUNDS[bgId]?.equipment || []).map(([id, qty]) => ({ id, qty: qty || 1 }));
}

/** One language entry, or null. */
export function getLanguage(id) { return LANGUAGES.find((l) => l.id === id) || null; }
export function languageName(id) { return getLanguage(id)?.name || id; }
export function languagesByCategory(cat) { return LANGUAGES.filter((l) => l.category === cat); }

/** Fighting styles as an array, for the level-up picker. */
export function fightingStyles() { return featsByCategory('fighting-style'); }

/** Epic boons as an array, for the Mythic tier picker. */
export function epicBoons() { return featsByCategory('epic-boon'); }

/** Feats a character of this level could legally consider (level gate only). */
export function featsAtLevel(level, cat = 'general') {
  return featsByCategory(cat).filter((f) => !f.prereq?.level || f.prereq.level <= level);
}
