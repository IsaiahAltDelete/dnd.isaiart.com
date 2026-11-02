// data/npcs_extra.js — the rest of the working world: the people who are not
// quest-givers and the animals that are not scenery.
//
// PURE DATA. Nothing is imported, nothing mutates. `npcs.js` concatenates
// EXTRA_CAST onto CAST and deep freezes the result, exactly as it already does
// with SOUTH_CAST — so `npcsOnMap()` sees these too, and the region packs'
// `reservedFor(mapId)` will not paint a crate on top of any of them.
//
// WHY THIS FILE EXISTS. Phandalin had fifteen people in it and five of them
// ran shops. The Trade Way had one. A city district of Baldur's Gate had four.
// The world was a set of quest counters with walking space between them. These
// are the labourers, fisherfolk, drovers, scribes, festhall staff, beggars and
// livestock that make a place look inhabited before anybody says a word to you.
//
// VOICES, NOT TREES. Every entry carries a `greeting` array. ui/dialogue.js
// `_fallbackTree()` reads it and picks a line seeded on the npc id and the
// hour, so a treeless townsperson says something of their own, and says
// something different if you come back later. Before that, every NPC without
// an authored tree recited one identical sentence about goblins.
//
// SETTING: 1496 DR. Every personal name below is drawn from the ethnic naming
// tables in docs/SETTING.md §5 — Chondathan, Illuskan, Damaran, Calishite,
// Turami, Rashemi, dwarf, halfling, orc and tiefling. Nothing is coined.

/** Colourway seed — same nine fields as npcs.js `cw()`. */
function cw(skin, hair, eye, main, alt, metal, leather, cloth, accent) {
  return { skin, hair, eye, main, alt, metal, leather, cloth, accent };
}

/** Local copy of the npcs.js builder; that module does not export its own. */
function npc(id, name, o = {}) {
  return {
    id,
    name,
    title: o.title || '',
    desc: o.desc || '',
    role: o.role || 'flavor',
    tag: o.tag || null,
    species: o.species || 'human',
    sprite: o.sprite || 'npc-villager-m',
    colorway: o.colorway || null, // Unspecified colors inherit the profession palette.
    map: o.map || 'phandalin',
    x: o.x | 0,
    y: o.y | 0,
    dir: o.dir || 'down',
    wander: o.wander != null ? o.wander : 0,
    shop: o.shop || null,
    dialogue: o.dialogue || null,
    quests: o.quests || [],
    faction: o.faction || null,
    schedule: o.schedule || null,
    greeting: o.greeting || null,
    solid: o.solid !== false,
    hidden: !!o.hidden,
    requires: o.requires || null,
    removedBy: o.removedBy || null,
    voice: o.voice || 'plain',
  };
}

/**
 * A beast. Animals are non-solid so nobody gets penned in behind a goose, and
 * they wander further than people do.
 */
/**
 * What an animal is called under its portrait. The dialogue bust prints the
 * authored `title`, and an animal that has none is captioned with a blank
 * line — so Bramble the sow was a nameplate with nothing on it. The kind of
 * beast is exactly the right caption for one: you already know its name, the
 * line under it should tell you what you are looking at.
 */
const BEAST_TITLES = {
  pig: 'Sow', sheep: 'Sheep', goat: 'Goat', cow: 'Cow', ox: 'Ox', horse: 'Horse',
  chicken: 'Hen', goose: 'Goose', dog: 'Dog', cat: 'Cat', crow: 'Crow',
  'town-rat': 'Rat', fox: 'Fox', deer: 'Deer',
};

function beast(id, name, sprite, map, x, y, o = {}) {
  return npc(id, name, {
    role: 'flavor', tag: 'animal', species: 'beast', sprite, map, x, y,
    title: o.title || BEAST_TITLES[sprite] || 'Beast',
    wander: o.wander != null ? o.wander : 2,
    solid: false,
    desc: o.desc || '',
    greeting: o.greeting || null,
    dir: o.dir || 'down',
  });
}

// Palettes reused across the crowd, so a district reads as one place.
const RUSTIC = cw('#c98d5e', '#5a3a20', '#4a3a2a', '#6b7a48', '#5a4a34', '#9a8a6a', '#5a3f22', '#b8a678', '#8a6a3a');
const SALT = cw('#a86f45', '#1c1410', '#3a5a5a', '#2f6b6b', '#4a4a52', '#8e939c', '#54381f', '#a8a090', '#6aa8b0');
const CITY = cw('#e8bd95', '#3a2416', '#4a3a2a', '#3a3a4a', '#5a4a34', '#c0c6d0', '#54381f', '#d8ccae', '#c0c6d0');
const POOR = cw('#8a5734', '#6a6a72', '#4a3a2a', '#5a4a3a', '#4a3a2a', '#7a6a5a', '#3f2c18', '#7a6a54', '#6a5a3a');
const FINERY = cw('#e8bd95', '#1c1410', '#5a4a7a', '#8a2a5a', '#c8306a', '#c8b06a', '#54381f', '#d8ccae', '#f0d264');

export const EXTRA_CAST = [

  // =========================================================================
  // PHANDALIN — the town had fifteen souls and five of them ran shops.
  // =========================================================================
  npc('gorstag-amblecrown', 'Gorstag Amblecrown', {
    title: 'Carter', desc: 'Hauls ore down from the hills and grain back up. Knows every rut in the Triboar Trail by the sound his axle makes going over it.',
    sprite: 'npc-labourer', colorway: RUSTIC, voice: 'gruff',
    map: 'phandalin', x: 20, y: 29, dir: 'down', wander: 1,
    greeting: [
      'Axle wants greasing and the road wants mending. Only one of those is my problem.',
      'Four trips this tenday. My back has opinions about the fifth.',
      'Mind the ruts past the Sleeping Giant. Broke a wheel there in Tarsakh.',
    ],
  }),
  npc('esvele-buckman', 'Esvele Buckman', {
    title: 'Goodwife', desc: 'Keeps three chickens, two children and one opinion about the Redbrands, which she will share.',
    sprite: 'npc-goodwife', colorway: RUSTIC, voice: 'warm',
    map: 'phandalin', x: 23, y: 36, dir: 'left', wander: 1,
    greeting: [
      'If you see a brown hen with a temper, she is mine and she is a liar.',
      'Town was quieter before the ruffians. Quieter still before the miners, if I am honest.',
      'Wash day. Do not stand where the line is going.',
    ],
  }),
  npc('lander-helder', 'Lander Helder', {
    title: 'Porter', desc: 'Carries other people\'s things from one end of Phandalin to the other, and hears everything they say over his shoulder while he does it.',
    sprite: 'npc-porter', colorway: RUSTIC, voice: 'plain',
    map: 'phandalin', x: 26, y: 22, dir: 'down', wander: 2,
    greeting: [
      'Two coppers a crate, four if it is going uphill.',
      'You would not believe what people say in front of a man carrying their luggage.',
      'Barthen\'s wants this by dusk, so I will be brief.',
    ],
  }),
  npc('betha-brightwood', 'Betha Brightwood', {
    title: 'Weaver', desc: 'Illuskan, north-born, and the only person in Phandalin who can get a true black out of local dye.',
    sprite: 'npc-goodwife', colorway: cw('#f6d5b4', '#a8a8b0', '#5a7a8a', '#4a2a5a', '#5a4a34', '#9a9aa4', '#6b4a2a', '#c8b58a', '#b07ae0'),
    voice: 'dry', map: 'phandalin', x: 31, y: 34, dir: 'down', wander: 1,
    greeting: [
      'Black is the hardest colour to get honest. Everything wants to go green on you.',
      'I came south for the weather. Do not laugh.',
      'If you want dyed wool, bring the wool.',
    ],
  }),
  npc('randal-tallstag', 'Randal Tallstag', {
    title: 'Drover', desc: 'Walks cattle between Phandalin and Triboar twice a season and complains about it for the rest of the year.',
    sprite: 'npc-drover', colorway: RUSTIC, voice: 'gruff',
    map: 'phandalin', x: 37, y: 27, dir: 'down', wander: 1,
    greeting: [
      'Twelve head out, eleven back. The wolves get their tithe.',
      'A cow will walk twenty miles a day and hate you for every one of them.',
      'Keep your dog off my herd and we will stay friends.',
    ],
  }),
  beast('phandalin-sow', 'Bramble', 'pig', 'phandalin', 19, 41, { desc: 'Enormous, contented, and entirely in the way.' }),
  beast('phandalin-goose', 'Sentry', 'goose', 'phandalin', 17, 39, { desc: 'Guards the lane better than the Redbrands ever guarded anything.' }),
  beast('phandalin-hen', 'Speckle', 'chicken', 'phandalin', 24, 27, { desc: 'One of Esvele\'s. The one with the temper.' }),
  beast('phandalin-crow', 'Crow', 'crow', 'phandalin', 35, 25, { desc: 'Watches the market square from the shrine roof and misses nothing.' }),

  // =========================================================================
  // ALDERLEAF FARM — a working halfling farm with no animals on it.
  // =========================================================================
  npc('nedda-tealeaf', 'Nedda Tealeaf', {
    title: 'Farmhand', desc: 'Hired on for the season and stayed three years. Qelline pretends not to have noticed.',
    species: 'halfling', sprite: 'npc-halfling', colorway: RUSTIC, voice: 'warm',
    map: 'alderleaf-farm', x: 5, y: 13, dir: 'right', wander: 1,
    greeting: [
      'Mind the sheep. They have decided the gate is a suggestion.',
      'Carp is off in the woods again. He always is.',
      'Beans are late this year. Everything is late this year.',
    ],
  }),
  beast('alderleaf-ewe', 'Dumpling', 'sheep', 'alderleaf-farm', 7, 13),
  beast('alderleaf-ram', 'Trouble', 'sheep', 'alderleaf-farm', 8, 14),
  beast('alderleaf-goat', 'Nanny', 'goat', 'alderleaf-farm', 10, 8, { desc: 'Has eaten two hats and a ledger.' }),
  beast('alderleaf-goose', 'Hiss', 'goose', 'alderleaf-farm', 13, 12),

  // =========================================================================
  // THE TRIBOAR TRAIL — one road, seven people, no livestock and no wildlife.
  // =========================================================================
  npc('stor-lackman', 'Stor Lackman', {
    title: 'Shepherd', desc: 'Moves a flock down the trail every autumn and sleeps under whatever the weather allows.',
    sprite: 'npc-herder', colorway: RUSTIC, voice: 'plain',
    map: 'triboar-trail', x: 31, y: 15, dir: 'down', wander: 1,
    greeting: [
      'Forty-one head. Was forty-three at Conyberry.',
      'Wolves came close last night. Close enough to count.',
      'If you are walking east, walk loud. Quiet travellers get followed.',
    ],
  }),
  beast('trail-sheep-a', 'Sheep', 'sheep', 'triboar-trail', 32, 15),
  beast('trail-sheep-b', 'Sheep', 'sheep', 'triboar-trail', 33, 14),
  npc('mara-windrivver', 'Mara Windrivver', {
    title: 'Trapper', desc: 'Works the wood-edge for fur and comes to the road only to sell it.',
    sprite: 'npc-hunter', colorway: cw('#c98d5e', '#3a2416', '#2a6a4a', '#5a6b3a', '#4a3a2a', '#8e939c', '#4e3218', '#a89878', '#8a6a2a'),
    voice: 'dry', map: 'triboar-trail', x: 41, y: 10, dir: 'down', wander: 1,
    greeting: [
      'Fox, marten, the odd wolf. Nothing you would want to meet wearing it.',
      'Owlbear sign two ridges north. I went a different way.',
      'The wood is fine if you respect it. Most people do not.',
    ],
  }),
  beast('trail-deer', 'Deer', 'deer', 'triboar-trail', 54, 17, { wander: 3 }),
  beast('trail-fox', 'Fox', 'fox', 'triboar-trail', 64, 12, { wander: 3 }),
  beast('trail-crow', 'Crow', 'crow', 'triboar-trail', 39, 8, { wander: 2 }),

  // =========================================================================
  // THE TRADE WAY / FIELDS OF THE DEAD
  // =========================================================================
  npc('malark-greycastle', 'Malark Greycastle', {
    title: 'Drover', desc: 'Brings cattle up the Trade Way to Waterdeep and grumbles about the tolls the whole way.',
    sprite: 'npc-drover', colorway: RUSTIC, voice: 'gruff',
    map: 'trade-way-north', x: 29, y: 41, dir: 'down', wander: 1,
    greeting: [
      'Toll at the bridge, toll at the gate, toll for the privilege of paying tolls.',
      'Waterdeep pays well for beef. Waterdeep pays well for everything, that is the trouble.',
      'Do not walk behind the herd. I will not warn you twice.',
    ],
  }),
  beast('tradeway-cow', 'Cow', 'cow', 'trade-way-north', 31, 41),
  beast('tradeway-ewe', 'Sheep', 'sheep', 'trade-way-north', 28, 42),
  npc('grim-evenwood', 'Grim Evenwood', {
    title: 'Sellsword', desc: 'Guards caravans through the Fields of the Dead, which is exactly as reassuring a job title as it sounds.',
    sprite: 'npc-sellsword', colorway: cw('#a86f45', '#7a5a2a', '#4a3a2a', '#5a4a3a', '#4a3a2a', '#8e939c', '#4e3218', '#a89878', '#b02a2a'),
    voice: 'gruff', map: 'fields-of-the-dead', x: 35, y: 21, dir: 'down', wander: 1,
    greeting: [
      'They named it the Fields of the Dead before my grandfather\'s time. Nobody has argued.',
      'Two silver a day and a share of what we do not lose.',
      'Whatever you dig up out here, put it back.',
    ],
  }),
  beast('fields-crow-a', 'Crow', 'crow', 'fields-of-the-dead', 33, 21, { wander: 2 }),
  beast('fields-crow-b', 'Crow', 'crow', 'fields-of-the-dead', 36, 19, { wander: 2 }),

  // =========================================================================
  // DAGGERFORD
  // =========================================================================
  npc('evendur-dundragon', 'Evendur Dundragon', {
    title: 'Fisherman', desc: 'Works the Delimbiyr from a flat-bottomed boat older than he is.',
    sprite: 'npc-fisher', colorway: SALT, voice: 'plain',
    map: 'daggerford', x: 8, y: 25, dir: 'down', wander: 1,
    greeting: [
      'River is low. River is always low, until it is not.',
      'Trout, mostly. Something bit through my line last tenday and I have not gone back to that bend.',
      'Boat leaks. Boat has always leaked. We have an understanding.',
    ],
  }),
  npc('jhessail-amblecrown', 'Jhessail Amblecrown', {
    title: 'Clerk', desc: 'Keeps the duke\'s tallies and knows to the copper what Daggerford is worth.',
    sprite: 'npc-scribe', colorway: CITY, voice: 'dry',
    map: 'daggerford', x: 27, y: 19, dir: 'down', wander: 1,
    greeting: [
      'Numbers do not lie. People writing numbers lie constantly.',
      'The duke asks for the grain figures. The duke will not like the grain figures.',
      'If you have business, it has a form. Everything has a form.',
    ],
  }),
  npc('kosef-bersk', 'Kosef Bersk', {
    title: 'Labourer', desc: 'Damaran, came west with a caravan, stayed for the work on the walls.',
    sprite: 'npc-labourer', colorway: RUSTIC, voice: 'plain',
    map: 'daggerford', x: 31, y: 25, dir: 'down', wander: 1,
    greeting: [
      'Stone from the quarry, mortar from the river. Simple work, honest ache.',
      'Walls are only as good as the day you stopped mending them.',
      'Home was colder. Home was also home.',
    ],
  }),
  beast('daggerford-goose', 'Goose', 'goose', 'daggerford', 10, 31),

  // =========================================================================
  // BEREGOST / NASHKEL
  // =========================================================================
  npc('miri-buckman', 'Miri Buckman', {
    title: 'Minstrel', desc: 'Plays the Jovial Juggler for supper and the Burning Wizard when the Juggler has had enough of her.',
    sprite: 'npc-minstrel', colorway: cw('#e0a878', '#5a3a20', '#4a3a2a', '#7a2a5a', '#c8a860', '#c8b06a', '#54381f', '#c8b58a', '#e3b34a'),
    voice: 'warm', map: 'beregost', x: 31, y: 27, dir: 'down', wander: 1,
    greeting: [
      'Three songs about Beregost and two of them are complaints.',
      'A copper if you liked it, silence if you did not, and I will know which.',
      'Everyone wants the ballad of the Friendly Arm. Nobody wants to hear the long version.',
    ],
  }),
  npc('blath-stormwind', 'Blath Stormwind', {
    title: 'Beggar', desc: 'Sat down outside the Burning Wizard eleven years ago and has been there since.',
    sprite: 'npc-beggar', colorway: POOR, voice: 'quiet',
    map: 'beregost', x: 29, y: 27, dir: 'down', wander: 0,
    greeting: [
      'A copper, if you have one spare. A word, if you do not.',
      'I see everyone who comes down that road. Ask me sometime.',
      'The temple feeds me on tendays. The rest is between me and the weather.',
    ],
  }),
  beast('beregost-dog', 'Scrap', 'dog', 'beregost', 32, 26),
  npc('orsik-loderr', 'Orsik Loderr', {
    title: 'Pit Boss', desc: 'Ran shafts in the Nashkel mine before the trouble and would very much like to run them again.',
    species: 'dwarf', sprite: 'npc-dwarf', colorway: cw('#c98d5e', '#7a3a20', '#4a3a2a', '#5a4a3a', '#4a3a2a', '#8e939c', '#5e4326', '#9a8a6a', '#c07a2a'),
    voice: 'gruff', map: 'nashkel', x: 23, y: 21, dir: 'down', wander: 1,
    greeting: [
      'Iron does not mine itself and lately it does not want to be mined at all.',
      'Something is down there. I have been under stone forty years; I know when it is wrong.',
      'Good timbering keeps more men alive than any sword ever has.',
    ],
  }),
  beast('nashkel-goat', 'Goat', 'goat', 'nashkel', 21, 19),

  // =========================================================================
  // BALDUR'S GATE — GRAY HARBOUR. A working dock with four people on it.
  // =========================================================================
  npc('taman-hornraven', 'Taman Hornraven', {
    title: 'Deckhand', desc: 'Off a Waterdhavian coaster, ashore for as long as the cargo takes and not one hour longer.',
    sprite: 'npc-sailor', colorway: SALT, voice: 'gruff',
    map: 'bg-gray-harbour', x: 13, y: 21, dir: 'down', wander: 2,
    greeting: [
      'Six days down from Waterdeep with a following wind. Six weeks back without one.',
      'Do not buy anything on this dock. Buy it two streets up for half.',
      'The Chionthar smells worse every year and I say that as a man who lives on a boat.',
    ],
  }),
  npc('olga-helder', 'Olga Helder', {
    title: 'Bosun', desc: 'Runs a crew of eleven and has never once raised her voice to do it.',
    sprite: 'npc-sailor', colorway: cw('#c98d5e', '#a8a8b0', '#3a5a5a', '#b02a2a', '#4a4a52', '#8e939c', '#54381f', '#a8a090', '#e3b34a'),
    voice: 'dry', map: 'bg-gray-harbour', x: 26, y: 24, dir: 'left', wander: 1,
    greeting: [
      'Cargo in by dusk or we lose the tide and I lose my temper.',
      'A ship is a hundred small jobs and one of them is always undone.',
      'You want work? I want backs. We may have something to discuss.',
    ],
  }),
  npc('aseir-khalid', 'Aseir Khalid', {
    title: 'Dockhand', desc: 'Calishite, three years in the Gate, still calls the winter unreasonable.',
    sprite: 'npc-porter', colorway: cw('#8a5734', '#1c1410', '#4a3a2a', '#7a4a20', '#5a4a34', '#9a8a6a', '#6b4a2a', '#a89878', '#c8a860'),
    voice: 'plain', map: 'bg-gray-harbour', x: 35, y: 23, dir: 'down', wander: 2,
    greeting: [
      'Crates from Calimport, crates to Calimport. The crates see more of the world than I do.',
      'In Calimshan the cold is a rumour. Here it is a landlord.',
      'Pay is honest on this wharf. That is not true of every wharf.',
    ],
  }),
  beast('harbour-rat', 'Rat', 'town-rat', 'bg-gray-harbour', 47, 25, { wander: 3 }),
  beast('harbour-crow', 'Crow', 'crow', 'bg-gray-harbour', 22, 22, { wander: 2 }),

  // =========================================================================
  // BALDUR'S GATE — RIVINGTON, HEAPSIDE, EASTWAY, THE WIDE
  // =========================================================================
  npc('kethra-lackman', 'Kethra Lackman', {
    title: 'Refugee', desc: 'Came down the Chionthar ahead of something and has not said what.',
    sprite: 'npc-beggar', colorway: POOR, voice: 'quiet',
    map: 'bg-rivington', x: 19, y: 33, dir: 'down', wander: 0,
    greeting: [
      'They let us as far as Rivington. No further, not without coin.',
      'I had a house. Now I have a place by a wall, and the wall is not mine either.',
      'Do not give me anything you will want back.',
    ],
  }),
  npc('pavel-marsk', 'Pavel Marsk', {
    title: 'Porter', desc: 'Hauls for whoever is at the gate, which in Rivington is everyone, constantly.',
    sprite: 'npc-porter', colorway: POOR, voice: 'plain',
    map: 'bg-rivington', x: 25, y: 27, dir: 'down', wander: 2,
    greeting: [
      'Gate is backed to the bridge. It is always backed to the bridge.',
      'Everyone wants into the city. The city has opinions about that.',
      'Coin first, then the crate. I have been taught.',
    ],
  }),
  npc('zora-chernin', 'Zora Chernin', {
    title: 'Goodwife', desc: 'Feeds nine people out of a Rivington kitchen built for three.',
    sprite: 'npc-goodwife', colorway: POOR, voice: 'warm',
    map: 'bg-rivington', x: 35, y: 19, dir: 'down', wander: 1,
    greeting: [
      'Bread is up again. Bread is always up and wages never are.',
      'You look hungry. Everyone in Rivington looks hungry; it is the local expression.',
      'Nine mouths and one pot. It works because it has to.',
    ],
  }),
  beast('rivington-rat', 'Rat', 'town-rat', 'bg-rivington', 31, 39, { wander: 3 }),
  npc('urth-windrivver', 'Urth Windrivver', {
    title: 'Tanner', desc: 'Works the Heapside vats, and you will know that before he tells you.',
    sprite: 'npc-labourer', colorway: POOR, voice: 'gruff',
    map: 'bg-heapside', x: 15, y: 33, dir: 'down', wander: 1,
    greeting: [
      'Yes, it is me you can smell. No, I cannot do anything about it.',
      'Leather for the whole Lower City comes out of these vats. Somebody has to stand in them.',
      'Twenty years at this. My wife stopped noticing in year two.',
    ],
  }),
  npc('mival-dotsk', 'Mival Dotsk', {
    title: 'Watch Sergeant', desc: 'Flaming Fist, Heapside post, and thoroughly tired of both.',
    sprite: 'npc-watch', colorway: cw('#c98d5e', '#3a2a1c', '#4a3a2a', '#2a3a5a', '#4a4a52', '#9aa2b0', '#3f2c18', '#a8a090', '#c4a24a'),
    voice: 'gruff', faction: 'flaming-fist',
    map: 'bg-heapside', x: 23, y: 13, dir: 'down', wander: 1,
    greeting: [
      'Move along, or give me a reason not to make you.',
      'Fist pays late and expects early. Do not ask me about it.',
      'Trouble in Heapside is trouble in the whole Lower City by nightfall.',
    ],
  }),
  beast('heapside-rat', 'Rat', 'town-rat', 'bg-heapside', 35, 27, { wander: 3 }),
  npc('sudeiman-pashar', 'Sudeiman Pashar', {
    title: 'Factor', desc: 'Buys in Eastway, sells in the Wide, and sleeps very well.',
    sprite: 'npc-scribe', colorway: cw('#a86f45', '#1c1410', '#4a3a2a', '#4a2a5a', '#5a4a34', '#c8b06a', '#54381f', '#d8ccae', '#e3b34a'),
    voice: 'dry', map: 'bg-eastway', x: 17, y: 29, dir: 'down', wander: 1,
    greeting: [
      'Everything that enters this city by land comes past me first. Everything.',
      'A good factor never touches the goods. I have not lifted a crate in nine years.',
      'Buy in Eastway, sell in the Wide. That is the whole of it.',
    ],
  }),
  npc('imzel-dyernina', 'Imzel Dyernina', {
    title: 'Baker', desc: 'Rashemi, up before the Watch and asleep before the taverns fill.',
    sprite: 'npc-goodwife', colorway: cw('#e8bd95', '#3a2416', '#4a3a2a', '#8a5a2a', '#5a4a34', '#9a9aa4', '#6b4a2a', '#d8ccae', '#b08a3a'),
    voice: 'warm', map: 'bg-eastway', x: 31, y: 15, dir: 'down', wander: 1,
    greeting: [
      'Third batch is out. The first two were for people who get up properly.',
      'Flour from Amn this month. It bakes differently and everyone notices.',
      'Come at dawn or come at dusk. In between I am a blur.',
    ],
  }),
  beast('eastway-dog', 'Crust', 'dog', 'bg-eastway', 47, 25),
  npc('shandri-greycastle', 'Shandri Greycastle', {
    title: 'Scrivener', desc: 'Writes letters in the Wide for people who cannot, and keeps every secret she is handed.',
    sprite: 'npc-scribe', colorway: CITY, voice: 'quiet',
    map: 'bg-the-wide', x: 13, y: 23, dir: 'down', wander: 0,
    greeting: [
      'Two copper a letter, four if it must sound educated.',
      'I have written confessions, proposals and one declaration of war. Same desk.',
      'No, I will not tell you what anybody said. That is the entire business.',
    ],
  }),
  npc('bor-kulenov', 'Bor Kulenov', {
    title: 'Watchman', desc: 'Stands in the Wide all day telling people where things are.',
    sprite: 'npc-watch', colorway: cw('#e0a878', '#5a3a20', '#4a3a2a', '#2a3a5a', '#4a4a52', '#9aa2b0', '#3f2c18', '#a8a090', '#c4a24a'),
    voice: 'plain', faction: 'flaming-fist',
    map: 'bg-the-wide', x: 17, y: 30, dir: 'down', wander: 1,
    greeting: [
      'High Hall is up and left. Everyone asks. Everyone.',
      'Keep your purse in front of you in this square, not behind.',
      'Market runs till the bell. After the bell it is my problem.',
    ],
  }),
  npc('dona-astorio', 'Dona Astorio', {
    title: 'Balladeer', desc: 'Turami, trained in Athkatla, working the Wide until something better hears her.',
    sprite: 'npc-minstrel', colorway: cw('#a86f45', '#1c1410', '#4a3a2a', '#2f4f7f', '#c8a860', '#c8b06a', '#54381f', '#c8b58a', '#e3b34a'),
    voice: 'warm', map: 'bg-the-wide', x: 39, y: 30, dir: 'down', wander: 1,
    greeting: [
      'Athkatla trained, Baldur\'s Gate employed. One of those pays.',
      'The Wide has the best acoustics in the Lower City and the worst listeners.',
      'Request something. Anything. I am so tired of the Friendly Arm.',
    ],
  }),

  // =========================================================================
  // SHARESS'S CARESS — the festhall on Rivington's edge. Festhalls are
  // ordinary establishments in the Realms: drink, music, dancing and paid
  // company, and in a house of Sharess, worship. The staff are professionals
  // with opinions about the work, which is how the sourcebooks write them.
  // =========================================================================
  npc('seipora-mostana', 'Seipora Mostana', {
    title: 'Hostess of the Caress', desc: 'Runs the floor. Decides who comes in, who is cut off, and who is quietly shown the side door.',
    sprite: 'npc-festhall-f', colorway: FINERY, voice: 'dry',
    map: 'sharess-caress', x: 9, y: 6, dir: 'down', wander: 1,
    greeting: [
      'Welcome to the Caress. Coin at the bar, manners at the door, and both are required.',
      'We keep the house of Sharess. That means pleasure, and it means rules — mine.',
      'Everyone is a guest here until they decide not to be. Then they are outside.',
    ],
  }),
  npc('lerissa-caress', 'Lerissa', {
    title: 'Of the Caress', desc: 'Tiefling, six years on the floor, and better read than most of the patrons she entertains.',
    species: 'tiefling', sprite: 'npc-festhall-f',
    colorway: cw('#b06a6a', '#1c1410', '#c8306a', '#8a2a5a', '#4a2a6a', '#c8b06a', '#54381f', '#d8ccae', '#f0d264'),
    voice: 'warm', map: 'sharess-caress', x: 13, y: 6, dir: 'down', wander: 1,
    greeting: [
      'Sit if you are sitting. Half the trade here is just somebody wanting to be listened to.',
      'People tell me things they would not tell a priest. I have a better memory than one, too.',
      'Six years. Longer than most of the Fist keep a post, and better paid.',
    ],
  }),
  npc('iados-caress', 'Iados', {
    title: 'Of the Caress', desc: 'Tiefling, sings between engagements, and is under no illusion which of the two the house pays him for.',
    species: 'tiefling', sprite: 'npc-festhall-m',
    colorway: cw('#8a5a6a', '#3a2416', '#c8306a', '#4a2a6a', '#8a2a5a', '#c8b06a', '#54381f', '#d8ccae', '#f0d264'),
    voice: 'dry', map: 'sharess-caress', x: 10, y: 9, dir: 'down', wander: 1,
    greeting: [
      'I sing, too. Nobody books me for the singing.',
      'Rivington gossip costs nothing here. Everything else has a price on the board.',
      'The trick is remembering which of them wants to be flattered and which wants to be argued with.',
    ],
  }),
  npc('marta-calabra', 'Marta Calabra', {
    title: 'Of the Caress', desc: 'Turami, came up the Coast Way from Athkatla, sends most of what she earns back to it.',
    sprite: 'npc-festhall-f',
    colorway: cw('#8a5734', '#1c1410', '#5a4a7a', '#7a2a5a', '#c8306a', '#c8b06a', '#54381f', '#d8ccae', '#f0d264'),
    voice: 'plain', map: 'sharess-caress', x: 14, y: 9, dir: 'down', wander: 1,
    greeting: [
      'Two sisters in Athkatla and a mother who thinks I sew. Let her.',
      'It is work. Good nights and bad nights, same as any trade with people in it.',
      'Seipora keeps the bad ones out. That is worth more than the wage.',
    ],
  }),
  npc('holg-caress', 'Holg', {
    title: 'Doorman', desc: 'Half-orc, stands at the Caress door, and has needed to do more than stand there perhaps four times.',
    species: 'half-orc', sprite: 'npc-bouncer',
    colorway: cw('#6b8a5a', '#1c1410', '#4a3a2a', '#4a3a2a', '#2e2116', '#c8b06a', '#2e2116', '#8a8a6a', '#c8306a'),
    voice: 'gruff', map: 'sharess-caress', x: 7, y: 4, dir: 'right', wander: 0,
    greeting: [
      'Hands to yourself. Ask first. That is the whole list.',
      'Most nights I open doors and find people their cloaks.',
      'Seipora says who comes in. I only say who goes out.',
    ],
  }),
  npc('jelenneth-caress', 'Jelenneth Liadon', {
    title: 'Musician of the Caress', desc: 'Plays the long evenings on a harp older than the building, and has never once been asked her name twice.',
    species: 'elf', sprite: 'npc-elf',
    colorway: cw('#f6d5b4', '#c8a860', '#2a6a4a', '#4a2a6a', '#8a2a5a', '#c8b06a', '#54381f', '#d8ccae', '#f0d264'),
    voice: 'quiet', map: 'sharess-caress', x: 12, y: 11, dir: 'down', wander: 0,
    greeting: [
      'I have played this room for nineteen years. It has been three houses in that time.',
      'Music first, then the drink, then the company. The order matters.',
      'They think the harp is the oldest thing in here. It is not.',
    ],
  }),
];

export default EXTRA_CAST;
