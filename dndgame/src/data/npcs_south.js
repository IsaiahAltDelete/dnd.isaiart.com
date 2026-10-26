// data/npcs_south.js — the cast of the road south and of Baldur's Gate: the
// Trade Way from Waterdeep to Daggerford, the Coast Way down to Nashkel, and
// the three cities that share one name on the Chionthar.
//
// PURE DATA. Nothing is imported. Nothing here mutates. `npcs.js` concatenates
// SOUTH_CAST onto its own CAST and spreads SOUTH_RECRUITS onto RECRUITS, then
// deep freezes the result — the builders below are local copies because
// `npcs.js` does not export `npc()`, `recruit()`, `cw()` or `look()`.
//
// Field contract is npcs.js's, unchanged:
//   npc(id, name, { title, desc, role, tag, species, sprite, colorway, map, x,
//                   y, dir, wander, shop, dialogue, quests, faction, greeting,
//                   solid, hidden, requires, removedBy, voice })
//
// PLACEMENT CONTRACT. Both region packs call `reservedFor(mapId)` before they
// paint, which reads `npcsOnMap()` out of this catalogue and refuses to drop a
// crate, a wall or a hedge on a tile somebody is standing on; `sweepStanding()`
// and `finishInterior()` then clear anything that got there first. So every
// coordinate below only has to be (a) inside the map, (b) off the border ring,
// and (c) off a warp tile from the §6 connection table — with the three
// deliberate exceptions in §4.6, the gate wardens, who stand ON their warp and
// are removed by a flag.
//
// Sprite families are the existing ones only (spritedata_chars.js): no new
// families are added here. Differentiation is by colorway — the Upper City in
// blues, whites, gold and deep red; the Lower City in brick, brass and salt;
// the Outer City in mud, sacking, grey and rust.
//
// SETTING: 1496 DR. Every name is published Forgotten Realms canon or is built
// from the ethnic naming tables in docs/SETTING.md §5 (and data/tables.js
// NAME_TABLES, which is the same list). Nothing is coined.

// ---------------------------------------------------------------------------
// Builders — verbatim copies of npcs.js §0, which does not export them.
// ---------------------------------------------------------------------------

function cw(skin, hair, eye, main, alt, metal, leather, cloth, accent) {
  return { skin, hair, eye, main, alt, metal, leather, cloth, accent };
}

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

function recruit(id, name, o = {}) {
  return {
    id,
    name,
    title: o.title || '',
    speciesId: o.speciesId || 'human',
    lineageId: o.lineageId || null,
    classId: o.classId || 'fighter',
    subclassId: o.subclassId || null,
    backgroundId: o.backgroundId || 'soldier',
    background: o.backgroundId || 'soldier',
    level: o.level || 1,
    abilities: o.abilities || { str: 13, dex: 13, con: 13, int: 11, wis: 11, cha: 10 },
    personality: o.personality || '',
    cost: o.cost != null ? o.cost : 50,
    bio: o.bio || '',
    colorway: o.colorway || cw('#e0a878', '#3a2416', '#4a3a2a', '#7a3030', '#2f4f7f', '#aab2c0', '#6b4a2a', '#c8b58a', '#e3b34a'),
    appearance: o.appearance || {},
    joinDialogue: o.joinDialogue || `recruit-${id}`,
    faction: o.faction || null,
    location: o.location || 'stonehill-inn',
    deity: o.deity || null,
    weapon: o.weapon || null,
    npcId: o.npcId || null,
  };
}

function look(o = {}) {
  return {
    body: o.body || 'm',
    build: o.build || 'normal',
    skin: o.skin || '#e0a878',
    hair: o.hair || '#3a2416',
    hairStyle: o.hairStyle || 'short',
    beard: o.beard || 'none',
    eye: o.eye || '#4a3a2a',
    outfit: o.outfit || '#7a3030',
    outfitAlt: o.outfitAlt || '#2f4f7f',
    accent: o.accent || '#e3b34a',
    metal: o.metal || '#aab2c0',
    leather: o.leather || '#6b4a2a',
    cloth: o.cloth || '#c8b58a',
    ears: o.ears || null,
    horns: o.horns || null,
    tail: o.tail || null,
    hornColor: o.hornColor || '#8c8377',
    cloakStyle: o.cloakStyle || 'cloak-none',
    helmStyle: o.helmStyle || 'helm-none',
    outfitStyle: o.outfitStyle || 'outfit-tunic',
    height: o.height || 1,
  };
}

// --- house palettes ---------------------------------------------------------
// Named so a reader can see the value break the charter asks for at a glance.

const UPPER = { cloth: '#e4e0d4', metal: '#c8ccd6' };   // whites, gold, deep red
const LOWER = { cloth: '#c0ab86', metal: '#a9b0bc' };   // brick, brass, salt
const OUTER = { cloth: '#9a8c6e', metal: '#8a8a90' };   // mud, sacking, rust

// ===========================================================================
// 1. THE TRADE WAY — Waterdeep to the Fields of the Dead
// ===========================================================================

export const SOUTH_CAST = [

  // --- the road itself ------------------------------------------------------

  npc('bor-nemetsk', 'Bor Nemetsk', {
    title: 'Serjeant of the Trade Way Patrol',
    desc: 'A Damaran serjeant of the Lords\' Alliance who has held the same eleven miles of road for nine years and can name every milestone on it. The toll house behind him has been empty since the winter and he will not say why.',
    role: 'guard', species: 'human', sprite: 'npc-guard', voice: 'measured',
    colorway: cw('#d9a071', '#4a3a2a', '#4a6a8a', '#4a5a6a', '#8a8a76', '#c0c6d0', '#5a3f26', '#b9c1cf', '#c8b06a'),
    map: 'trade-way-north', x: 30, y: 40, dir: 'down', wander: 1,
    dialogue: 'bor-nemetsk', faction: 'lords-alliance',
    greeting: 'Alliance patrol. State your road and keep to it.',
  }),

  npc('mara-lackman', 'Mara Lackman', {
    title: 'Pedlar of the Fields Reach',
    desc: 'Her axle is broken, her mule is unimpressed, and she has been sitting on a crate of Sembian needles for two days composing what she will say to the wheelwright at the Way Inn.',
    role: 'flavor', species: 'human', sprite: 'npc-merchant', voice: 'dry',
    colorway: cw('#e8bd95', '#7a5a2a', '#5a4a2a', '#6a5a3a', '#8a6a3a', '#9a9aa4', '#6b4a2a', OUTER.cloth, '#a8823a'),
    map: 'trade-way-south', x: 30, y: 40, dir: 'down', wander: 1,
    dialogue: 'mara-lackman',
  }),

  npc('pieron-agosto', 'Pieron Agosto', {
    title: 'Pilgrim of the Coast Way',
    desc: 'A Turami road-pilgrim walking south to the shrines of Twin Songs with a staff, a blanket and an alarming amount of opinion about the state of the Chionthar ferries.',
    role: 'flavor', species: 'human', sprite: 'npc-priest', voice: 'warm',
    colorway: cw('#8a5a3a', '#241a12', '#3a2a1a', '#6a5a7a', '#c8b58a', '#9a9aa4', '#6b4a2a', '#d0c4a8', '#e3b34a'),
    map: 'coast-way-north', x: 30, y: 30, dir: 'down', wander: 1,
    dialogue: 'pieron-agosto',
  }),

  npc('selise-falone', 'Selise Falone', {
    title: 'Walking North',
    desc: 'She left Beregost with two children and a handcart and she is going to Baldur\'s Gate because that is where everyone said to go. Nobody told her about the writ.',
    role: 'flavor', species: 'human', sprite: 'npc-villager-f', voice: 'tired',
    colorway: cw('#a06a44', '#241a12', '#3a2a1a', '#5a5a4a', '#7a6a5a', '#8a8a90', '#5a3f26', OUTER.cloth, '#8a7a3a'),
    map: 'coast-way-south', x: 30, y: 40, dir: 'up', wander: 1,
    dialogue: 'selise-falone',
  }),

  npc('hulmarra-stayanoga', 'Hulmarra Stayanoga', {
    title: 'Barrow-Watcher of the Fields',
    desc: 'A Rashemi woman in Kelemvor\'s grey who walks the barrow-lines of the Fields of the Dead with a tally-stick, counting cairns. The count has been going up.',
    role: 'priest', species: 'human', sprite: 'npc-priest', voice: 'flat',
    colorway: cw('#d0a070', '#2a2018', '#4a4a3a', '#6a6a70', '#3a3a44', '#a9b0bc', '#5a3f26', '#b0aca0', '#d8d8e0'),
    map: 'fields-of-the-dead', x: 34, y: 20, dir: 'down', wander: 1,
    dialogue: 'hulmarra', quests: ['the-fields-remember'],
    greeting: 'Do not step on the low ground. The low ground is somebody.',
  }),

  npc('lureene-dundragon', 'Lureene Dundragon', {
    title: 'Dawnbringer of Rosymorn',
    desc: 'The last Lathanderite left on the mountain, living in a cellar of the monastery her order walked away from, keeping a lamp lit for a dawn service nobody attends. The githyanki have not found her. She rather wishes they would get it over with.',
    role: 'priest', species: 'human', sprite: 'npc-priest', voice: 'quiet',
    colorway: cw('#e8bd95', '#c8a860', '#4a6a8a', '#c05a3a', '#e8c46a', '#c8ccd6', '#6b4a2a', '#e4d8b8', '#e3b34a'),
    map: 'rosymorn-monastery', x: 24, y: 26, dir: 'down', wander: 0,
    dialogue: 'lureene', quests: ['song-of-the-morning-relic'],
    greeting: 'Softly. They hear high voices before low ones.',
  }),

  // --- DAGGERFORD -----------------------------------------------------------

  npc('morwen-daggerford', 'Morwen Daggerford', {
    title: 'Duchess of Daggerford',
    desc: 'A soldier before she was a duchess and it shows in the way she stands. She holds a walled town of two thousand on the road between two powers that could swallow it in a season, and she has held it for eleven years by never once being interesting to either of them.',
    role: 'noble', species: 'human', sprite: 'npc-noble', voice: 'clipped',
    colorway: cw('#e0a878', '#4a3a2a', '#4a6a3a', '#3a4a6a', '#8a2a2a', '#c8ccd6', '#5a3f26', UPPER.cloth, '#e3b34a'),
    map: 'daggerford', x: 26, y: 18, dir: 'down', wander: 0,
    dialogue: 'morwen', quests: ['the-long-road-south', 'the-duchess-toll'],
    faction: 'lords-alliance',
    greeting: 'You are on my bridge and in my ledger. Both are checked.',
  }),

  npc('sherlen-spearslayer', 'Sherlen Spearslayer', {
    title: 'Captain of the Daggerford Guard',
    desc: 'Sherlen took the name Spearslayer off a lizardfolk champion in the marshes and has spent twenty years being asked about it. She commands sixty guards, forty of whom are farmers with a shift rota.',
    role: 'guard', species: 'human', sprite: 'npc-guard', voice: 'blunt',
    colorway: cw('#c98d5e', '#241a12', '#4a3a2a', '#4a5a6a', '#6a6a5a', '#c0c6d0', '#5a3f26', '#a89878', '#b9c1cf'),
    map: 'daggerford', x: 30, y: 24, dir: 'left', wander: 1,
    dialogue: 'sherlen', faction: 'lords-alliance',
  }),

  npc('delfen-ondabarl', 'Delfen Ondabarl', {
    title: '"Yellowknife"',
    desc: 'Daggerford\'s resident wizard, who went away for a year and came back looking twenty years younger and refusing, politely and completely, to discuss it. His tower is exactly where it was. Nothing else about him is.',
    role: 'wizard', species: 'human', sprite: 'npc-hooded', voice: 'wry',
    colorway: cw('#e8bd95', '#c8a860', '#8a8a3a', '#3a3a5a', '#c8b06a', '#9a9aa4', '#5a3f26', '#c8b58a', '#e3b34a'),
    map: 'daggerford', x: 44, y: 22, dir: 'down', wander: 1,
    dialogue: 'delfen', quests: ['yellowknifes-tower'],
    greeting: 'Yellowknife. It is a knife and it is yellow. There, that is the joke done.',
  }),

  npc('daggerford-hound', 'Bramble', {
    title: 'The Bridge Dog',
    desc: 'A brindle mongrel who sleeps across the Daggerford bridge road and has never once been moved for a wagon. The wagons go round.',
    role: 'flavor', tag: 'animal', species: 'beast', sprite: 'dog',
    colorway: cw('#8a6a3a', '#6a4a2a', '#3a2a1a', '#8a6a3a', '#6a4a2a', '#9a9aa4', '#6b4a2a', '#c8b58a', '#c07a3a'),
    map: 'daggerford', x: 11, y: 28, dir: 'down', wander: 2, solid: false,
    dialogue: 'daggerford-hound',
  }),

  npc('filarion-filvendorson', 'Filarion Filvendorson', {
    title: 'Master of the River Shining',
    desc: 'A moon elf who kept a tavern on the Delimbiyr for a hundred and forty years and considers that a decent start. He has outlived four Dukes of Daggerford and speaks of all of them as though they were last tenday.',
    role: 'innkeep', species: 'elf', sprite: 'npc-elf', voice: 'unhurried',
    colorway: cw('#e8d0c0', '#4a4a7a', '#6a8a8a', '#3a5a6a', '#c8b58a', '#c0c6d0', '#6b4a2a', '#d8ccae', '#8ac0c0'),
    map: 'river-shining-tavern', x: 11, y: 5, dir: 'down', wander: 1,
    shop: 'river-shining-tavern', dialogue: 'filarion',
    greeting: 'The River Shining. Bed, board, and a very long memory.',
  }),

  npc('shandri-tallstag', 'Shandri Tallstag', {
    title: 'Serving-Woman at the River Shining',
    desc: 'Twenty-one, Chondathan, and running the whole taproom while Filarion reminisces at the fire. She has a list of things she would change and no illusions about being asked.',
    role: 'flavor', species: 'human', sprite: 'npc-villager-f', voice: 'quick',
    colorway: cw('#e8bd95', '#7a5a2a', '#4a6a3a', '#6a7a4a', '#c8b58a', '#9a9aa4', '#6b4a2a', '#d8ccae', '#a8823a'),
    map: 'river-shining-tavern', x: 6, y: 10, dir: 'right', wander: 2,
    dialogue: 'shandri',
  }),

  npc('fulbar-hardcheese', 'Fulbar Hardcheese', {
    title: 'Keeper of the Happy Cow',
    desc: 'A stout halfling who runs the cheapest bed in Daggerford and is entirely at peace with it. The Cow is clean, the ale is thin, and the price has not moved in nine years.',
    role: 'innkeep', species: 'halfling', sprite: 'npc-halfling', voice: 'cheerful',
    colorway: cw('#f0c8a0', '#8a5a2a', '#4a6a3a', '#7a5a3a', '#c8a860', '#9a9aa4', '#6b4a2a', '#d8ccae', '#b04a2a'),
    map: 'happy-cow', x: 9, y: 5, dir: 'down', wander: 1,
    shop: 'happy-cow', dialogue: 'fulbar',
    greeting: 'Two coppers a bed and I will not pretend it is more than that.',
  }),

  npc('lucian-dlusker', 'Lucian Dlusker', {
    title: 'Dawnmaster of Morninglow Tower',
    desc: 'Amaunator\'s man in Daggerford, second son of a Baldurian patriar house that sent him north to be somebody else\'s problem. He has made the tower his own and the flame has not gone out on his watch. Until this tenday.',
    role: 'priest', species: 'human', sprite: 'npc-priest', voice: 'formal',
    colorway: cw('#e0a878', '#c8a860', '#c8a840', '#e0c060', '#c8b58a', '#e3c46a', '#6b4a2a', '#f0e4c0', '#e3b34a'),
    map: 'morninglow-tower', x: 9, y: 5, dir: 'down', wander: 0,
    shop: 'morninglow-tower', dialogue: 'lucian', quests: ['morninglow-dawn'],
    greeting: 'The Keeper of the Yellow Sun keeps the hours. Come in; we are between them.',
  }),

  npc('derval-ironeater', 'Derval Ironeater', {
    title: 'Smith of Daggerford',
    desc: 'A shield dwarf who has shod every horse and mended every plough in the Delimbiyr valley for sixty years, and who regards the making of weapons as a regrettable seasonal necessity, like flooding.',
    role: 'smith', species: 'dwarf', sprite: 'npc-smith', voice: 'gruff',
    colorway: cw('#d9a071', '#7a3a1a', '#4a3a2a', '#5a4a3a', '#8a5a2a', '#c0c6d0', '#54381f', '#a89878', '#c07a3a'),
    map: 'daggerford-smithy', x: 9, y: 5, dir: 'down', wander: 0,
    shop: 'daggerford-provisions', dialogue: 'derval',
    greeting: 'Ironeater. Bring it here and do not tell me how it broke; I will see.',
  }),

  // --- THE WAY INN ----------------------------------------------------------

  npc('gorstag-amblecrown', 'Gorstag Amblecrown', {
    title: 'Master of the Way Inn',
    desc: 'He keeps a fortified caravanserai at the crossing of the Trade Way and the Dusk Road, and he keeps it the way a man keeps a ship: everything stowed, everything counted, and the gate shut at dusk whoever is still outside it.',
    role: 'innkeep', species: 'human', sprite: 'npc-innkeeper', voice: 'brisk',
    colorway: cw('#e0a878', '#5a4a34', '#4a3a2a', '#6a5a3a', '#8a6a3a', '#9a9aa4', '#5a3f26', '#c8b58a', '#a8823a'),
    map: 'way-inn-common', x: 12, y: 5, dir: 'down', wander: 1,
    shop: 'way-inn-common', dialogue: 'gorstag-amblecrown', quests: ['the-way-inn-vigil'],
    greeting: 'Way Inn. Gate shuts at dusk, and I do not open it twice.',
  }),

  npc('jasmal-rein', 'Jasmal Rein', {
    title: 'Caravan Factor',
    desc: 'A Calishite factor who books cargo space for four houses at once and is scrupulously honest with all of them about three. She knows what is on every wagon between here and Scornubel.',
    role: 'flavor', species: 'human', sprite: 'npc-merchant', voice: 'silken',
    colorway: cw('#a06a44', '#241a12', '#3a2a1a', '#6a3a5a', '#c8a860', '#9a9aa4', '#6b4a2a', '#d8c8a0', '#e3b34a'),
    map: 'way-inn-common', x: 6, y: 11, dir: 'right', wander: 1,
    dialogue: 'jasmal',
  }),

  npc('stor-helder', 'Stor Helder', {
    title: 'Caravan Guard',
    desc: 'An Illuskan sword who has ridden the Trade Way twenty-two times and been paid for nineteen. He is in the yard because the common room costs money to sit in.',
    role: 'flavor', species: 'human', sprite: 'npc-thug', voice: 'flat',
    colorway: cw('#f0c8a0', '#c8a860', '#4a6a8a', '#5a5a4a', '#6a5a3a', '#a9b0bc', '#54381f', OUTER.cloth, '#8a7a3a'),
    map: 'the-way-inn', x: 16, y: 24, dir: 'down', wander: 1,
    dialogue: 'stor-helder',
  }),

  npc('way-inn-horse', 'Dapple', {
    title: 'The Yard Horse',
    desc: 'A grey cob who has pulled the Way Inn\'s water cart since before the current ostler was born, and who will take an apple from anybody and give nothing whatever in return.',
    role: 'flavor', tag: 'animal', species: 'beast', sprite: 'horse',
    colorway: cw('#a8a8b0', '#8a8a90', '#3a2a1a', '#a8a8b0', '#8a8a90', '#9a9aa4', '#6b4a2a', '#c8b58a', '#8a7a3a'),
    map: 'the-way-inn', x: 30, y: 20, dir: 'left', wander: 1, solid: false,
    dialogue: 'way-inn-horse',
  }),

  // --- ULGOTH'S BEARD -------------------------------------------------------

  npc('westra-helder', 'Westra Helder', {
    title: 'Keeper of the Sea Bounty',
    desc: 'She has run the only inn in Ulgoth\'s Beard for thirty years and buried two husbands who went out to the isles. She will sell you passage. She will also tell you not to take it, in the same breath, and mean both.',
    role: 'innkeep', species: 'human', sprite: 'npc-innkeeper', voice: 'salt',
    colorway: cw('#e8bd95', '#b8b0a4', '#4a6a8a', '#3a5a6a', '#8a8a76', '#a9b0bc', '#5a3f26', LOWER.cloth, '#6aa8a8'),
    map: 'ulgoths-beard-inn', x: 10, y: 5, dir: 'down', wander: 1,
    shop: 'sea-bounty', dialogue: 'westra',
    greeting: 'Sea Bounty. Fish, bed, and the tide table on the wall is right.',
  }),

  npc('luth-hornraven', 'Luth Hornraven', {
    title: 'Shipwright of the Beard',
    desc: 'He builds small boats very well and large boats not at all, and has turned down two Baldurian commissions in a row to say so. His yard smells of pitch and pine and stubbornness.',
    role: 'flavor', species: 'human', sprite: 'npc-smith', voice: 'gruff',
    colorway: cw('#f0c8a0', '#8a7a5a', '#4a6a8a', '#4a5a4a', '#6a5a3a', '#a9b0bc', '#54381f', '#a89878', '#8a7a3a'),
    map: 'ulgoths-beard', x: 18, y: 22, dir: 'down', wander: 1,
    dialogue: 'luth-hornraven',
  }),

  npc('ulgoths-beard-cat', 'Ballast', {
    title: 'The Quay Cat',
    desc: 'A one-eared grey who owns the fish quay and levies a tax on every basket landed. Nobody has appealed.',
    role: 'flavor', tag: 'animal', species: 'beast', sprite: 'cat',
    colorway: cw('#8a8a90', '#6a6a70', '#6ac36a', '#8a8a90', '#6a6a70', '#9a9aa4', '#6b4a2a', '#c8b58a', '#c07a3a'),
    map: 'ulgoths-beard', x: 26, y: 16, dir: 'down', wander: 2, solid: false,
    dialogue: 'ulgoths-beard-cat',
  }),

  // --- THE FRIENDLY ARM -----------------------------------------------------

  npc('bentley-mirrorshade', 'Bentley Mirrorshade', {
    title: 'Master of the Friendly Arm',
    desc: 'A gnome who bought a dead Bhaalite priest\'s fortified hold, whitewashed it, and turned it into the safest bed on the Coast Way. He has never explained where the purchase money came from and the question has stopped being asked.',
    role: 'innkeep', species: 'gnome', sprite: 'npc-halfling', voice: 'genial',
    colorway: cw('#f0c8a0', '#b8b0a4', '#4a6a3a', '#4a6a5a', '#c8a860', '#a9b0bc', '#6b4a2a', '#d8ccae', '#8ac0a0'),
    map: 'friendly-arm-common', x: 12, y: 5, dir: 'down', wander: 1,
    shop: 'friendly-arm-common', dialogue: 'bentley', quests: ['the-friendly-arm-cellar'],
    greeting: 'Friendly Arm. Walls thick, gate shut, and nothing under the floor. Nothing at all.',
  }),

  npc('gellana-mirrorshade', 'Gellana Mirrorshade', {
    title: 'Priestess of Garl Glittergold',
    desc: 'Bentley\'s wife, and by some distance the more frightening half. She keeps the shrine, the accounts and a very short list of people she will heal for free.',
    role: 'priest', species: 'gnome', sprite: 'npc-priest', voice: 'tart',
    colorway: cw('#f0c8a0', '#c8a860', '#8a8a3a', '#c8a83a', '#e0c060', '#e3c46a', '#6b4a2a', '#e4d8b8', '#e3b34a'),
    map: 'garl-shrine', x: 8, y: 5, dir: 'down', wander: 0,
    shop: 'garl-shrine', dialogue: 'gellana',
    greeting: 'Garl\'s shrine. Sit down, stop bleeding on the floor, and we shall discuss the offering.',
  }),

  npc('mival-chernin', 'Mival Chernin', {
    title: 'Gate Guard of the Friendly Arm',
    desc: 'A Damaran with a halberd and a stool, hired to shut a gate at dusk and open it at dawn. In eleven years the job has been dull four thousand and one nights, and once, in the winter, it was not.',
    role: 'guard', species: 'human', sprite: 'npc-guard', voice: 'plain',
    colorway: cw('#d9a071', '#4a3a2a', '#4a4a3a', '#5a5a4a', '#6a6a5a', '#a9b0bc', '#5a3f26', '#a89878', '#8a7a3a'),
    map: 'friendly-arm-inn', x: 22, y: 10, dir: 'down', wander: 1,
    dialogue: 'mival-chernin',
  }),

  npc('ivellios-nailo', 'Ivellios Nailo', {
    title: 'Ranger of the Coast Way',
    desc: 'A wood elf of the Cloakwood eaves who ranges the Coast Way for the Emerald Enclave and drinks at the Friendly Arm because it is the only building on it he trusts. He tracks the ankheg fields, and he is losing.',
    role: 'flavor', species: 'elf', sprite: 'npc-elf', voice: 'sparse',
    colorway: cw('#d0b090', '#3a5a2a', '#6a8a3a', '#3f6b3a', '#54381f', '#9a8f80', '#54381f', '#a89878', '#7fbf6a'),
    map: 'friendly-arm-common', x: 6, y: 11, dir: 'right', wander: 1,
    dialogue: 'ivellios', faction: 'emerald-enclave',
  }),

  // --- BEREGOST -------------------------------------------------------------

  npc('kelddath-ormlyr', 'Kelddath Ormlyr', {
    title: 'High Radiance of the Song of the Morning',
    desc: 'The high priest of Lathander in Beregost and, in every practical sense, the town\'s government. He has more money than the four inns combined and spends it quietly, which is why nobody resents it.',
    role: 'priest', species: 'human', sprite: 'npc-priest', voice: 'warm',
    colorway: cw('#e0a878', '#b8b0a4', '#4a6a3a', '#c05a3a', '#e8c46a', '#e3c46a', '#6b4a2a', '#f0e4c0', '#e3b34a'),
    map: 'song-of-the-morning', x: 12, y: 5, dir: 'down', wander: 0,
    shop: 'song-of-the-morning', dialogue: 'kelddath', quests: ['song-of-the-morning-relic'],
    greeting: 'Dawn\'s peace. Sit. There is nothing here that will not keep for a cup of something warm.',
  }),

  npc('kriv-daardendrian', 'Kriv Daardendrian', {
    title: 'Sworn of the Gauntlet',
    desc: 'A bronze dragonborn paladin doing penance in the Song of the Morning\'s forecourt for a judgement he made on the road that was correct, lawful, and wrong. He would like a hard task and a plain answer.',
    role: 'flavor', species: 'dragonborn', sprite: 'npc-guard', voice: 'formal',
    colorway: cw('#a8763a', '#8a5a2a', '#c8a83a', '#8a6a2a', '#c8b58a', '#c8ccd6', '#6b4a2a', '#e4d8b8', '#e3b34a'),
    map: 'song-of-the-morning', x: 6, y: 12, dir: 'right', wander: 1,
    dialogue: 'kriv', faction: 'gauntlet',
  }),

  npc('taerom-fuiruim', 'Taerom Fuiruim', {
    title: '"Thunderhammer"',
    desc: 'The best mundane smith south of Waterdeep and entirely aware of it. He will not enchant, he will not hurry, and he will not sell you plate you cannot walk twenty miles in.',
    role: 'smith', species: 'human', sprite: 'npc-smith', voice: 'boom',
    colorway: cw('#c98d5e', '#241a12', '#4a3a2a', '#5a4a3a', '#8a5a2a', '#c0c6d0', '#54381f', '#a89878', '#c07a3a'),
    map: 'thunderhammer-smithy', x: 9, y: 5, dir: 'down', wander: 0,
    shop: 'thunderhammer-smithy', dialogue: 'thunderhammer',
    greeting: 'Thunderhammer. Steel only. If you want it to glow, that is a different shop and a worse one.',
  }),

  npc('feldepost', 'Feldepost', {
    title: 'Keeper of Feldepost\'s Inn',
    desc: 'He keeps the quiet inn, the one with the older clientele and the good beds, and he keeps it by declining, courteously and absolutely, to have anything interesting happen in it.',
    role: 'innkeep', species: 'human', sprite: 'npc-innkeeper', voice: 'dry',
    colorway: cw('#e0a878', '#b8b0a4', '#4a4a3a', '#4a4a5a', '#8a7a5a', '#9a9aa4', '#5a3f26', '#c8b58a', '#8a7a3a'),
    map: 'feldeposts-inn', x: 10, y: 5, dir: 'down', wander: 1,
    shop: 'feldeposts-inn', dialogue: 'feldepost',
    greeting: 'Feldepost\'s. Quiet house. I should like to keep it that way and I usually manage.',
  }),

  npc('kithri-greenbottle', 'Kithri Greenbottle', {
    title: 'Keeper of the Jovial Juggler',
    desc: 'A halfling who runs the loud inn on purpose: three musicians most nights, a dice table she watches like a hawk, and a board by the door where anyone hiring can pin a name.',
    role: 'innkeep', species: 'halfling', sprite: 'npc-halfling', voice: 'bright',
    colorway: cw('#f0c8a0', '#7a3a1a', '#4a6a3a', '#3a6a4a', '#c8a860', '#9a9aa4', '#6b4a2a', '#d8ccae', '#c04a8a'),
    map: 'jovial-juggler', x: 10, y: 5, dir: 'down', wander: 1,
    shop: 'jovial-juggler', dialogue: 'kithri',
    greeting: 'The Juggler! Loud, cheap, and the board by the door is free to read.',
  }),

  npc('marta-domine', 'Marta Domine', {
    title: 'Keeper of the Burning Wizard',
    desc: 'She keeps the rough inn, and she keeps it by being rougher than any three of the clientele. There are Black Network men who drink here and she takes their coin and their measure in the same motion.',
    role: 'innkeep', species: 'human', sprite: 'npc-innkeeper', voice: 'hard',
    colorway: cw('#8a5a3a', '#241a12', '#3a2a1a', '#6a2a2a', '#4a3a3a', '#a9b0bc', '#54381f', '#a89878', '#b04a3a'),
    map: 'burning-wizard', x: 9, y: 5, dir: 'down', wander: 1,
    shop: 'burning-wizard', dialogue: 'marta-domine',
    greeting: 'Burning Wizard. Drink what you can pay for and bleed outside.',
  }),

  npc('evendur-buckman', 'Evendur Buckman', {
    title: 'Carter of Beregost',
    desc: 'He hauls between Beregost and Nashkel twice a tenday and has stopped doing the Nashkel leg after dark, which he will explain at length and for free.',
    role: 'flavor', species: 'human', sprite: 'npc-farmer', voice: 'rambling',
    colorway: cw('#e0a878', '#7a5a2a', '#4a3a2a', '#6a5a3a', '#8a6a3a', '#9a9aa4', '#6b4a2a', OUTER.cloth, '#a8823a'),
    map: 'beregost', x: 30, y: 26, dir: 'down', wander: 1,
    dialogue: 'evendur-buckman',
  }),

  npc('thalantyr', 'Thalantyr', {
    title: 'Conjurer of High Hedge',
    desc: 'He keeps a keep east of Beregost with skeletons for gardeners and sells conjuration work to anyone who can pay and behave. He has not left the grounds in nine years and does not expect to.',
    role: 'wizard', species: 'human', sprite: 'npc-hooded', voice: 'precise',
    colorway: cw('#e8bd95', '#b8b0a4', '#6a4a8a', '#3a2a4a', '#6a5a8a', '#9a9aa4', '#5a3f26', '#c0b0c8', '#b07ae0'),
    map: 'high-hedge', x: 15, y: 11, dir: 'down', wander: 0,
    shop: 'high-hedge', dialogue: 'thalantyr', quests: ['thalantyrs-bargain'],
    greeting: 'You have come up the path without being eaten. That is the interview passed.',
  }),

  // --- CANDLEKEEP -----------------------------------------------------------

  npc('sariel-amakiir', 'Sariel Amakiir', {
    title: 'Great Reader of Candlekeep',
    desc: 'A sun elf of the Avowed who has stood the gatehouse for sixty years and refused entry to two kings, one archmage and a very persistent merchant from Athkatla. The price is a book the library does not hold. There is no second price.',
    role: 'shopkeeper', species: 'elf', sprite: 'npc-elf', voice: 'exact',
    colorway: cw('#f0d4a0', '#c8a860', '#c8a83a', '#3a3a5a', '#c8b06a', '#c8ccd6', '#6b4a2a', UPPER.cloth, '#e3b34a'),
    map: 'candlekeep-gatehouse', x: 12, y: 5, dir: 'down', wander: 0,
    shop: 'candlekeep-gatehouse', dialogue: 'sariel', quests: ['the-price-of-a-book'],
    greeting: 'The gate price is one book we do not hold. You may begin whenever you are ready.',
  }),

  npc('tethtoril', 'Tethtoril', {
    title: 'First Reader of Candlekeep',
    desc: 'Second only to the Keeper of the Tomes, and the kindest man behind that wall by a distance. He came down to the gatehouse to see who was arguing with Sariel, which he does most days.',
    role: 'priest', species: 'human', sprite: 'npc-priest', voice: 'gentle',
    colorway: cw('#e0a878', '#d8d8e0', '#4a6a8a', '#3a4a5a', '#c8b58a', '#c8ccd6', '#6b4a2a', '#e4e0d4', '#8ac0c0'),
    map: 'candlekeep-gatehouse', x: 6, y: 11, dir: 'right', wander: 1,
    dialogue: 'tethtoril',
  }),

  npc('darvin-evenwood', 'Darvin Evenwood', {
    title: 'Gatewarden of Candlekeep',
    desc: 'The Keeper of the Portal\'s serjeant-at-arms: forty men, one gate, and a list of everyone who has ever tried to get past him with a forged donation. He is on it twice himself, from before he took the post.',
    role: 'guard', species: 'human', sprite: 'npc-guard', voice: 'flat',
    colorway: cw('#c98d5e', '#4a3a2a', '#4a4a3a', '#3a4a5a', '#6a6a5a', '#c0c6d0', '#5a3f26', '#b0aca0', '#c8b06a'),
    map: 'candlekeep-approach', x: 24, y: 22, dir: 'down', wander: 1,
    dialogue: 'darvin-evenwood',
  }),

  // --- NASHKEL --------------------------------------------------------------

  npc('berrun-ghastkill', 'Berrun Ghastkill', {
    title: 'Mayor of Nashkel',
    desc: 'An Amnian mayor of a mining town whose mine has begun killing people, and who has written to Athkatla four times and had four acknowledgements. He is out of ideas and nearly out of miners.',
    role: 'shopkeeper', species: 'human', sprite: 'npc-merchant', voice: 'harried',
    colorway: cw('#c98d5e', '#4a3a2a', '#4a3a2a', '#5a4a6a', '#8a7a4a', '#9a9aa4', '#5a3f26', '#c8b58a', '#c8a860'),
    map: 'nashkel', x: 22, y: 20, dir: 'down', wander: 1,
    shop: 'nashkel-store', dialogue: 'berrun',
    greeting: 'Mayor Ghastkill. If you have come about the mine, say so first and save us both the pleasantries.',
  }),

  npc('vitiare-calabra', 'Vitiare Calabra', {
    title: 'Keeper of the Nashkel Inn',
    desc: 'She keeps the only inn in Nashkel and hears everything that comes north out of Amn a day before the mayor does. She sells the good rumours and gives away the ones that are merely true.',
    role: 'innkeep', species: 'human', sprite: 'npc-innkeeper', voice: 'sly',
    colorway: cw('#8a5a3a', '#241a12', '#3a2a1a', '#6a3a4a', '#c8a860', '#9a9aa4', '#6b4a2a', '#d8c8a0', '#c04a8a'),
    map: 'nashkel-inn', x: 10, y: 5, dir: 'down', wander: 1,
    shop: 'nashkel-inn', dialogue: 'vitiare',
    greeting: 'Nashkel Inn. Amnish beds, Amnish prices, and Amnish gossip at no charge.',
  }),

  npc('orel-dotsk', 'Orel Dotsk', {
    title: 'Miner of Nashkel',
    desc: 'Twelve years down the Nashkel shafts and he has stopped going down. He will tell you why for the price of a drink and he will not enjoy telling you.',
    role: 'flavor', species: 'human', sprite: 'npc-miner', voice: 'low',
    colorway: cw('#d9a071', '#3a2a1a', '#4a4a3a', '#5a4a3a', '#6a6a5a', '#8a8a90', '#54381f', OUTER.cloth, '#8a7a3a'),
    map: 'nashkel', x: 28, y: 24, dir: 'down', wander: 1,
    dialogue: 'orel-dotsk',
  }),

  // =========================================================================
  // 2. THE OUTER CITY — mud, sacking, grey and rust
  // =========================================================================

  // --- BLACKGATE, and THE GATE ---------------------------------------------

  npc('randal-whitburn', 'Randal Whitburn', {
    title: 'Fist Sergeant, Black Dragon Gate',
    desc: 'He holds the one gate in Faerun that every traveller on the Trade Way must pass, and he takes a toll that is not written in any ordinance. He is not proud of it. He takes it anyway, and he has stopped explaining why.',
    role: 'guard', species: 'human', sprite: 'npc-guard', voice: 'flat',
    colorway: cw('#e0a878', '#4a3a2a', '#4a4a3a', '#6a2a2a', '#3a3a44', '#c0c6d0', '#5a3f26', '#a89878', '#c8b06a'),
    map: 'bg-blackgate', x: 28, y: 41, dir: 'up', wander: 0,
    dialogue: 'randal-whitburn', faction: 'lords-alliance',
    removedBy: 'bg-writ-of-entry',
    greeting: 'Gate is shut to you. Writ or road, and the road runs north.',
  }),

  npc('yasheira-mostana', 'Yasheira Mostana', {
    title: 'Fist Lieutenant of the Blackgate Muster',
    desc: 'A Calishite officer of the Flaming Fist who issues writs of entry from a trestle table in a caravan yard, and who has read every forged one in the south. She will take a favour in place of a bribe, which in this city is nearly a kindness.',
    role: 'guard', species: 'human', sprite: 'npc-guard', voice: 'crisp',
    colorway: cw('#a06a44', '#241a12', '#3a2a1a', '#6a2a2a', '#3a3a44', '#c0c6d0', '#5a3f26', '#b0aca0', '#c8b06a'),
    map: 'bg-blackgate', x: 34, y: 34, dir: 'down', wander: 0,
    dialogue: 'yasheira', faction: 'lords-alliance', quests: ['the-writ-of-entry'],
    greeting: 'Writs of entry. Name, business, and something the Fist wants more than your coin.',
  }),

  npc('gorstag-evenwood', 'Gorstag Evenwood', {
    title: 'Caravan Master of the Blackgate Yard',
    desc: 'He runs the last yard before the wall: mounts, feed, wheelwrights and a hard opinion about everyone he has ever hauled for. Half the Trade Way\'s freight sleeps in his pens on the way past.',
    role: 'shopkeeper', species: 'human', sprite: 'npc-merchant', voice: 'loud',
    colorway: cw('#e0a878', '#7a5a2a', '#4a3a2a', '#5a4a3a', '#8a6a3a', '#8a8a90', '#54381f', OUTER.cloth, '#a8823a'),
    map: 'bg-blackgate', x: 20, y: 26, dir: 'down', wander: 1,
    shop: 'blackgate-yard', dialogue: 'gorstag-evenwood',
    greeting: 'Evenwood\'s yard. Mounts, feed, axles, and no I will not hold your cargo overnight for free.',
  }),

  npc('ovak', 'Ovak', {
    title: 'Drover',
    desc: 'A half-orc drover who moves oxen down the Trade Way for whoever pays and sleeps in the pens with them. He has been through the Black Dragon Gate exactly twice in nineteen years.',
    role: 'flavor', species: 'half-orc', sprite: 'npc-thug', voice: 'slow',
    colorway: cw('#8aa070', '#241a12', '#c8a83a', '#5a4a3a', '#6a5a3a', '#8a8a90', '#54381f', OUTER.cloth, '#8a7a3a'),
    map: 'bg-blackgate', x: 11, y: 20, dir: 'down', wander: 1,
    dialogue: 'ovak',
  }),

  npc('stedd-greycastle', 'Stedd Greycastle', {
    title: 'Brother of Chauntea',
    desc: 'He feeds the gate queue out of a cauldron on a handcart, every day, whatever the Fist thinks about it. Chauntea does not require a permit and Brother Stedd has stopped applying for one.',
    role: 'priest', species: 'human', sprite: 'npc-priest', voice: 'kind',
    colorway: cw('#e0a878', '#8a7a5a', '#4a6a3a', '#5a6a3a', '#8a7a4a', '#9a9aa4', '#6b4a2a', '#c8b58a', '#7fbf6a'),
    map: 'bg-blackgate', x: 38, y: 20, dir: 'down', wander: 1,
    dialogue: 'stedd', quests: ['the-writ-of-entry'],
    greeting: 'There is soup. There is always soup. Sit down while you argue with them.',
  }),

  npc('blackgate-ox', 'Bullock', {
    title: 'Yard Ox',
    desc: 'Eleven hundredweight of complete indifference, chewing in the Blackgate pens.',
    role: 'flavor', tag: 'animal', species: 'beast', sprite: 'ox',
    colorway: cw('#7a5a3a', '#5a4a2a', '#3a2a1a', '#7a5a3a', '#5a4a2a', '#8a8a90', '#54381f', '#a89878', '#8a7a3a'),
    map: 'bg-blackgate', x: 12, y: 30, dir: 'right', wander: 1, solid: false,
    dialogue: 'blackgate-ox',
  }),

  npc('blackgate-ox-b', 'Patience', {
    title: 'Yard Ox',
    desc: 'Bullock\'s yoke-mate. Marginally more opinionated, which is to say she blinks.',
    role: 'flavor', tag: 'animal', species: 'beast', sprite: 'ox',
    colorway: cw('#6a5a4a', '#4a3a2a', '#3a2a1a', '#6a5a4a', '#4a3a2a', '#8a8a90', '#54381f', '#a89878', '#8a7a3a'),
    map: 'bg-blackgate', x: 44, y: 30, dir: 'left', wander: 1, solid: false,
    dialogue: 'blackgate-ox',
  }),

  // --- NORCHAPEL (and Whitkeep) --------------------------------------------

  npc('natali-shemov', 'Natali Shemov', {
    title: 'Of the Norchapel Tenements',
    desc: 'She has the top floor of what was a chapel of Ilmater and is now nine families, one stair and a roof that leaks over the altar step. She has kept the building standing by main force for six years.',
    role: 'flavor', species: 'human', sprite: 'npc-villager-f', voice: 'weary',
    colorway: cw('#d9a071', '#4a3a2a', '#4a4a3a', '#5a5a4a', '#6a6a5a', '#8a8a90', '#54381f', OUTER.cloth, '#8a7a3a'),
    map: 'bg-norchapel', x: 20, y: 18, dir: 'down', wander: 1,
    dialogue: 'natali',
  }),

  npc('luth-lackman', 'Luth Lackman', {
    title: 'Hostler of the Old Chapel',
    desc: 'He keeps sixteen horses in a deconsecrated nave and swears the acoustics settle them. Nobody has told the Ilmatari at the Shrine of the Suffering and Luth would rather they stayed untold.',
    role: 'flavor', species: 'human', sprite: 'npc-farmer', voice: 'shifty',
    colorway: cw('#f0c8a0', '#8a7a5a', '#4a6a8a', '#6a5a3a', '#8a6a3a', '#8a8a90', '#54381f', OUTER.cloth, '#a8823a'),
    map: 'bg-norchapel', x: 30, y: 24, dir: 'down', wander: 1,
    dialogue: 'luth-lackman',
  }),

  npc('norchapel-dog', 'Chapel', {
    title: 'The Stable Dog',
    desc: 'Half a wolfhound, twice the opinion. He sleeps on the chancel step because it is the warm one.',
    role: 'flavor', tag: 'animal', species: 'beast', sprite: 'dog',
    colorway: cw('#6a6a70', '#4a4a50', '#c8a83a', '#6a6a70', '#4a4a50', '#8a8a90', '#54381f', '#a89878', '#8a7a3a'),
    map: 'bg-norchapel', x: 24, y: 28, dir: 'down', wander: 2, solid: false,
    dialogue: 'norchapel-dog',
  }),

  // --- LITTLE CALIMSHAN -----------------------------------------------------

  npc('zasheida-pashar', 'Zasheida Pashar', {
    title: 'Mistress of the Bazaar',
    desc: 'Four generations out of Calimport by way of Memnon and Baldur\'s Gate, and the bazaar is hers in every way that matters and none that a clerk could write down. She is hospitable, then ruthless, then hospitable again, and the order never varies.',
    role: 'shopkeeper', species: 'human', sprite: 'npc-merchant', voice: 'silken',
    colorway: cw('#a06a44', '#241a12', '#3a2a1a', '#6a2a5a', '#c8a860', '#9a9aa4', '#6b4a2a', '#d8c8a0', '#e3b34a'),
    map: 'bg-little-calimshan', x: 26, y: 20, dir: 'down', wander: 1,
    shop: 'little-calimshan-bazaar', dialogue: 'zasheida',
    greeting: 'Come under the awning, the sun is a Baldurian and hates us both. Now. What do you need?',
  }),

  npc('khemed-rein', 'Khemed Rein', {
    title: 'Keeper of the Coffee House',
    desc: 'He sells thick black coffee in small cups and everything anyone in Little Calimshan has said over one for eleven years. The coffee is very good. The other stock is better.',
    role: 'innkeep', species: 'human', sprite: 'npc-innkeeper', voice: 'genial',
    colorway: cw('#8a5a3a', '#241a12', '#3a2a1a', '#4a3a2a', '#8a6a3a', '#9a9aa4', '#6b4a2a', '#d8c8a0', '#c8a860'),
    map: 'bg-little-calimshan', x: 16, y: 26, dir: 'down', wander: 1,
    dialogue: 'khemed',
    greeting: 'Sit. Coffee first, business after. That is not manners, it is procedure.',
  }),

  npc('atala-basha', 'Atala Basha', {
    title: 'Sister of Ilmater',
    desc: 'She keeps the healing bench under the domed shrine that serves Ilmater on one side and Sharess on the other, an arrangement that offends theologians and nobody who lives here.',
    role: 'priest', species: 'human', sprite: 'npc-priest', voice: 'quiet',
    colorway: cw('#a06a44', '#241a12', '#3a2a1a', '#8a8a90', '#c0b0a0', '#a9b0bc', '#6b4a2a', '#e0d4c0', '#c04a4a'),
    map: 'bg-little-calimshan', x: 34, y: 28, dir: 'down', wander: 0,
    dialogue: 'atala',
    greeting: 'Sit on the bench. Whatever it is, it is quicker sitting.',
  }),

  npc('haseid-dumein', 'Haseid Dumein', {
    title: 'Of the Quiet Trade',
    desc: 'A smuggler who moves Calishite goods past the Basilisk Gate toll and does it as a discipline rather than a crime: he has never once been caught, and he has never once hurried.',
    role: 'flavor', species: 'human', sprite: 'npc-hooded', voice: 'soft',
    colorway: cw('#8a5a3a', '#241a12', '#3a2a1a', '#3a3a3a', '#5a4a4a', '#8a8a90', '#54381f', '#8a8070', '#b07ae0'),
    map: 'bg-little-calimshan', x: 12, y: 16, dir: 'down', wander: 1,
    dialogue: 'haseid', faction: 'zhentarim',
  }),

  npc('meilil-khalid', 'Meilil Khalid', {
    title: 'Water-Seller',
    desc: 'Nine years old, one copper a cup, and the cup is clean because her mother checks. She knows every alley in the enclave and sells that too, at the same price.',
    role: 'flavor', tag: 'child', species: 'human', sprite: 'npc-child', voice: 'quick',
    colorway: cw('#a06a44', '#241a12', '#3a2a1a', '#4a6a8a', '#c8a860', '#9a9aa4', '#6b4a2a', '#d8c8a0', '#e3b34a'),
    map: 'bg-little-calimshan', x: 30, y: 14, dir: 'left', wander: 2,
    dialogue: 'meilil',
  }),

  // --- TUMBLEDOWN -----------------------------------------------------------

  npc('kosef-shemov', 'Kosef Shemov', {
    title: 'Gravewarden of Tumbledown',
    desc: 'Kelemvor\'s warden of the city\'s cemetery district, which means he digs, he counts, and he sells the shovels. Some of the other things on his trestle should not be for sale and he knows it.',
    role: 'shopkeeper', species: 'human', sprite: 'npc-priest', voice: 'dry',
    colorway: cw('#d9a071', '#3a2a1a', '#4a4a3a', '#4a4a50', '#6a6a70', '#a9b0bc', '#54381f', '#a09c94', '#d8d8e0'),
    map: 'bg-tumbledown', x: 26, y: 18, dir: 'down', wander: 1,
    shop: 'tumbledown-warden', dialogue: 'kosef', quests: ['the-tumbledown-count'],
    greeting: 'Warden Shemov. Holy water, oil, shovels. Do not ask about the third trestle.',
  }),

  npc('navarra-dyernina', 'Navarra Dyernina', {
    title: 'Priestess of Kelemvor',
    desc: 'She reads the rites over the city\'s poor for nothing and over its patriars for a great deal, and considers the arrangement a form of tithing. Death is not frightening to her; the paperwork is.',
    role: 'priest', species: 'human', sprite: 'npc-priest', voice: 'level',
    colorway: cw('#d0a070', '#2a2018', '#4a4a3a', '#5a5a60', '#3a3a44', '#c0c6d0', '#5a3f26', '#b0aca0', '#d8d8e0'),
    map: 'bg-tumbledown', x: 16, y: 26, dir: 'down', wander: 0,
    dialogue: 'navarra',
    greeting: 'Kelemvor\'s house. The dead are counted here and so, eventually, are you.',
  }),

  npc('ghesh', 'Ghesh', {
    title: 'Corpse-Carter',
    desc: 'A slate-scaled dragonborn who carts the city\'s dead out through the Cliffgate and does it with more ceremony than anybody pays him for. He talks to the cart.',
    role: 'flavor', species: 'dragonborn', sprite: 'npc-thug', voice: 'rumble',
    colorway: cw('#6a7a8a', '#4a5a6a', '#c8a83a', '#4a4a50', '#5a5a60', '#8a8a90', '#54381f', OUTER.cloth, '#8a7a3a'),
    map: 'bg-tumbledown', x: 34, y: 30, dir: 'down', wander: 1,
    dialogue: 'ghesh',
  }),

  npc('weary', 'Weary', {
    title: 'Of the Night Trade',
    desc: 'A tiefling with a virtue-name and a spade, who takes bodies out of Tumbledown for the Guild and puts other things in. He is not cruel. He is simply the last person in the city with no other work.',
    role: 'flavor', species: 'tiefling', sprite: 'npc-hooded', voice: 'hushed',
    colorway: cw('#8a4a4a', '#2a1a1a', '#c84a4a', '#3a3a3a', '#4a2a2a', '#8a8a90', '#54381f', '#7a6a5a', '#b04a3a'),
    map: 'bg-tumbledown', x: 12, y: 32, dir: 'down', wander: 1,
    dialogue: 'weary', faction: 'zhentarim',
  }),

  // --- SOW'S FOOT -----------------------------------------------------------

  npc('astele-keene', 'Astele Keene', {
    title: '"Nine-Fingers"',
    desc: 'She runs the Guild, which runs the nights of Baldur\'s Gate, out of a back room in the worst district outside the walls — because it is hers, because she was born in it, and because nobody looks for a queen in Sow\'s Foot.',
    role: 'villain', species: 'human', sprite: 'npc-noble', voice: 'soft',
    colorway: cw('#c98d5e', '#241a12', '#4a3a2a', '#2a2a2a', '#5a2a4a', '#8a8a90', '#3a2a1a', '#7a6a5a', '#b07ae0'),
    map: 'bg-sows-foot', x: 20, y: 10, dir: 'down', wander: 0,
    dialogue: 'nine-fingers', faction: 'zhentarim',
    greeting: 'Sit down. Everybody stands in this room and it makes the room tiring.',
  }),

  npc('brem', 'Brem', {
    title: 'Quartermaster of the Guild',
    desc: 'He keeps the black market under a tarpaulin in Sow\'s Foot and can find anything in the city inside two days, including the thing you stole last tenday, which he will sell back to you.',
    role: 'shopkeeper', species: 'human', sprite: 'npc-thug', voice: 'brisk',
    colorway: cw('#d9a071', '#3a2a1a', '#4a4a3a', '#3a3a3a', '#5a4a4a', '#8a8a90', '#54381f', OUTER.cloth, '#b07ae0'),
    map: 'bg-sows-foot', x: 30, y: 22, dir: 'down', wander: 1,
    shop: 'sows-foot-market', dialogue: 'brem', faction: 'zhentarim',
    greeting: 'Under the tarp. Prices are firm, provenance is not, and I have never seen you before.',
  }),

  npc('olga-stormwind', 'Olga Stormwind', {
    title: 'Of the Sow\'s Foot Kitchen',
    desc: 'She has fed this district out of two cauldrons and a wall of stolen bread for nineteen years and knows every name in it, including the ones the Fist would like. She has never given one up and does not intend to start.',
    role: 'flavor', species: 'human', sprite: 'npc-villager-f', voice: 'warm',
    colorway: cw('#f0c8a0', '#b8b0a4', '#4a6a8a', '#5a5a4a', '#7a6a5a', '#8a8a90', '#54381f', OUTER.cloth, '#a8823a'),
    map: 'bg-sows-foot', x: 12, y: 28, dir: 'down', wander: 1,
    dialogue: 'olga',
    greeting: 'Bowl\'s a copper if you have it and free if you have not. Sit on the barrel.',
  }),

  npc('feng', 'Feng', {
    title: 'Of Sow\'s Foot',
    desc: 'A half-orc bruiser the Guild uses when a message needs carrying by hand. He is very good at it and he has begun to notice which messages he is asked to carry and to whom.',
    role: 'flavor', species: 'half-orc', sprite: 'npc-thug', voice: 'blunt',
    colorway: cw('#7a9a68', '#241a12', '#c8a83a', '#4a3a3a', '#5a4a4a', '#8a8a90', '#54381f', OUTER.cloth, '#b07ae0'),
    map: 'bg-sows-foot', x: 34, y: 30, dir: 'down', wander: 1,
    dialogue: 'feng', faction: 'zhentarim',
  }),

  npc('lidda-hilltopple', 'Lidda Hilltopple', {
    title: 'Of the Light Fingers',
    desc: 'A halfling pickpocket of enormous talent and no discretion whatever, who has been caught eleven times because she cannot stop telling people how she did it.',
    role: 'flavor', species: 'halfling', sprite: 'npc-halfling', voice: 'gleeful',
    colorway: cw('#f0c8a0', '#7a3a1a', '#4a6a3a', '#4a5a3a', '#6a5a3a', '#8a8a90', '#54381f', OUTER.cloth, '#c04a8a'),
    map: 'bg-sows-foot', x: 16, y: 16, dir: 'down', wander: 2,
    dialogue: 'lidda',
  }),

  npc('sows-foot-dog', 'Mudlark', {
    title: 'The Mud Dog',
    desc: 'Nobody\'s dog and everybody\'s. He has eaten from every door in Sow\'s Foot and been kicked by two of them, and he remembers which.',
    role: 'flavor', tag: 'animal', species: 'beast', sprite: 'dog',
    colorway: cw('#7a6a5a', '#5a4a3a', '#c8a83a', '#7a6a5a', '#5a4a3a', '#8a8a90', '#54381f', '#a89878', '#8a7a3a'),
    map: 'bg-sows-foot', x: 26, y: 32, dir: 'down', wander: 2, solid: false,
    dialogue: 'sows-foot-dog',
  }),

  // --- TWIN SONGS -----------------------------------------------------------

  npc('jhessail-dundragon', 'Jhessail Dundragon', {
    title: 'Dawnbringer of Twin Songs',
    desc: 'She keeps Lathander\'s shrine on an avenue where six gods share a gutter, and she has made a career of being on speaking terms with all of them. Even the one nobody speaks to.',
    role: 'priest', species: 'human', sprite: 'npc-priest', voice: 'bright',
    colorway: cw('#e8bd95', '#c8a860', '#4a6a3a', '#c05a3a', '#e8c46a', '#e3c46a', '#6b4a2a', '#f0e4c0', '#e3b34a'),
    map: 'bg-twin-songs', x: 18, y: 16, dir: 'down', wander: 1,
    shop: 'twin-songs-shrines', dialogue: 'jhessail',
    greeting: 'Six shrines, one avenue, and everyone behaves. Which of them do you need?',
  }),

  npc('amnon', 'Amnon', {
    title: 'Keeper of the Myrkulite Shrine',
    desc: 'A tiefling who keeps the shrine of the Lord of Bones entirely within the law, which in Twin Songs is legal, and is watched by four separate people at all times. He finds this restful.',
    role: 'priest', species: 'tiefling', sprite: 'npc-hooded', voice: 'mild',
    colorway: cw('#7a4a5a', '#1a1a1a', '#c84a4a', '#2a2a2a', '#4a4a50', '#a9b0bc', '#3a2a1a', '#8a8a90', '#d8d8e0'),
    map: 'bg-twin-songs', x: 34, y: 26, dir: 'down', wander: 0,
    dialogue: 'amnon',
    greeting: 'You may look. Everyone looks. That is what the shrine is for.',
  }),

  npc('taman-brightwood', 'Taman Brightwood', {
    title: 'Pilgrim-Marshal of the Southern Road',
    desc: 'He organises the pilgrim trains that walk the Coast Way and the Trade Way, which means he counts heads out and heads back and has kept the difference in a book since 1489. The Fields of the Dead are where the difference comes from.',
    role: 'priest', species: 'human', sprite: 'npc-priest', voice: 'earnest',
    colorway: cw('#f0c8a0', '#c8a860', '#4a6a8a', '#4a5a6a', '#8a7a4a', '#a9b0bc', '#6b4a2a', '#d0c4a8', '#c8b06a'),
    map: 'bg-twin-songs', x: 28, y: 32, dir: 'down', wander: 1,
    dialogue: 'taman-brightwood', quests: ['the-fields-remember'],
    greeting: 'Pilgrim-Marshal Brightwood. Are you walking north, or are you the reason people stop?',
  }),

  npc('caramip-folkor', 'Caramip Folkor', {
    title: 'Of Gond\'s Shrine',
    desc: 'A rock gnome who keeps Gond\'s small shrine in Twin Songs and considers the great High House of Wonders inside the walls to be showing off. Her shrine has a working clock. Theirs, she notes, has three.',
    role: 'flavor', species: 'gnome', sprite: 'npc-villager-f', voice: 'clipped',
    colorway: cw('#f0c8a0', '#c04a3a', '#4a6a3a', '#8a6a2a', '#c8a860', '#c0c6d0', '#6b4a2a', '#d8ccae', '#e3b34a'),
    map: 'bg-twin-songs', x: 14, y: 28, dir: 'down', wander: 1,
    dialogue: 'caramip',
  }),

  npc('quara-ramondo', 'Quara Ramondo', {
    title: 'Sister of Eldath',
    desc: 'Eldath\'s shrine in Twin Songs is a basin of still water and a bench, and Quara keeps both. She has stood between more knives in this district than the Watch has, and never once drawn one.',
    role: 'priest', species: 'human', sprite: 'npc-priest', voice: 'calm',
    colorway: cw('#8a5a3a', '#241a12', '#3a5a4a', '#3a6a5a', '#8ac0a0', '#a9b0bc', '#6b4a2a', '#d8e4d8', '#6ac0a0'),
    map: 'bg-twin-songs', x: 38, y: 14, dir: 'down', wander: 0,
    dialogue: 'quara',
    greeting: 'Sit by the water a moment. It costs nothing and it is the only thing here that does.',
  }),

  // --- WYRM'S CROSSING ------------------------------------------------------

  npc('sergor-starag', 'Sergor Starag', {
    title: 'Fist Flame of Wyrm\'s Rock',
    desc: 'He commands the fortress in the middle of the river and the toll on both spans, and he conducts what the Fist calls interviews in a room with a drain in the floor. He is not corrupt. He is worse: he is thorough.',
    role: 'guard', species: 'human', sprite: 'npc-guard', voice: 'cold',
    colorway: cw('#d9a071', '#3a2a1a', '#4a4a3a', '#6a2a2a', '#3a3a44', '#c0c6d0', '#3a2a1a', '#a09c94', '#c8b06a'),
    map: 'wyrms-rock', x: 12, y: 6, dir: 'down', wander: 0,
    dialogue: 'sergor', faction: 'lords-alliance',
    greeting: 'Wyrm\'s Rock. Everything that crosses this river crosses it in front of me.',
  }),

  npc('bardeid-astorio', 'Bardeid Astorio', {
    title: 'Fishmonger of the North Span',
    desc: 'His stall is built out over the parapet on four beams and a prayer, and he has been told to remove it by three separate authorities, all of whom buy their eels from him.',
    role: 'flavor', species: 'human', sprite: 'npc-merchant', voice: 'shout',
    colorway: cw('#8a5a3a', '#241a12', '#3a2a1a', '#4a6a6a', '#8a8a76', '#8a8a90', '#54381f', LOWER.cloth, '#6aa8a8'),
    map: 'bg-wyrms-crossing', x: 18, y: 10, dir: 'down', wander: 1,
    dialogue: 'bardeid-astorio',
  }),

  npc('kallista', 'Kallista', {
    title: 'Hostess of Sharess\' Caress',
    desc: 'A tiefling who keeps the south span\'s festhall, and keeps it well: warm, expensive, and the only house on the bridge where nobody has ever been robbed. That is a policy, and she enforces it.',
    role: 'innkeep', species: 'tiefling', sprite: 'npc-villager-f', voice: 'purr',
    colorway: cw('#a04a5a', '#2a1a1a', '#c84a8a', '#6a2a5a', '#c8a860', '#c8ccd6', '#6b4a2a', '#d8c8a0', '#e3b34a'),
    map: 'sharess-caress', x: 11, y: 5, dir: 'down', wander: 1,
    shop: 'sharess-caress', dialogue: 'kallista',
    greeting: 'Sharess\' Caress. Warm rooms, warm welcome, and nobody has ever been robbed in mine.',
  }),

  npc('corrin-leagallow', 'Corrin Leagallow', {
    title: 'Toll-Clerk of the Crossing',
    desc: 'A halfling who has sat in the toll booth for twenty-six years and has memorised every face that crosses the Chionthar. He does not write them down. That is the point.',
    role: 'flavor', species: 'halfling', sprite: 'npc-halfling', voice: 'precise',
    colorway: cw('#f0c8a0', '#7a5a2a', '#4a6a3a', '#4a4a5a', '#8a7a5a', '#a9b0bc', '#6b4a2a', LOWER.cloth, '#c8b06a'),
    map: 'bg-wyrms-crossing', x: 44, y: 16, dir: 'down', wander: 0,
    dialogue: 'corrin',
    greeting: 'Toll\'s two coppers a head. I shall know you again; do not take it personally.',
  }),

  // --- RIVINGTON ------------------------------------------------------------

  npc('danthelon', 'Danthelon', {
    title: 'Of Danthelon\'s Dancing Axe',
    desc: 'He sells weapons and armour on the south bank and sells them at a volume that carries to the bridge. Under the noise he is a careful judge of steel and a careful judge of who is buying it.',
    role: 'smith', species: 'human', sprite: 'npc-smith', voice: 'boom',
    colorway: cw('#e0a878', '#7a3a1a', '#4a3a2a', '#6a3a2a', '#8a6a3a', '#c0c6d0', '#54381f', LOWER.cloth, '#c07a3a'),
    map: 'bg-rivington', x: 24, y: 26, dir: 'down', wander: 1,
    shop: 'danthelons-dancing-axe', dialogue: 'danthelon',
    greeting: 'THE DANCING AXE! Weapons, armour, shields — and I will not sell you a blade you cannot lift!',
  }),

  npc('alfira', 'Alfira', {
    title: 'Bard of Rivington',
    desc: 'A tiefling who sings on the Rivington road for the refugee camps and writes down what she is told, name by name, in a book she has nearly filled. She would like to finish it somewhere safer.',
    role: 'flavor', species: 'tiefling', sprite: 'npc-villager-f', voice: 'gentle',
    colorway: cw('#a05a5a', '#2a1a1a', '#c84a4a', '#5a3a6a', '#c8a860', '#a9b0bc', '#6b4a2a', '#c0ab86', '#e3b34a'),
    map: 'bg-rivington', x: 32, y: 16, dir: 'down', wander: 1,
    dialogue: 'alfira',
  }),

  npc('grigor-dotsk', 'Grigor Dotsk', {
    title: 'Fist Corporal of the Rivington Post',
    desc: 'The Flaming Fist\'s southernmost man: one corporal, four spears, and the whole Coast Way coming at him. He has stopped pretending the post is adequate and started writing it down.',
    role: 'guard', species: 'human', sprite: 'npc-guard', voice: 'tired',
    colorway: cw('#d9a071', '#4a3a2a', '#4a4a3a', '#6a2a2a', '#3a3a44', '#a9b0bc', '#54381f', OUTER.cloth, '#c8b06a'),
    map: 'bg-rivington', x: 30, y: 38, dir: 'down', wander: 1,
    dialogue: 'grigor', faction: 'lords-alliance',
  }),

  npc('arveene-tallstag', 'Arveene Tallstag', {
    title: 'Of the Rivington Farmstead',
    desc: 'She farms the last flat ground before the city and sells the surplus off a trestle at the road. Half of it goes to the camps at a price she will not discuss and calls "spoilage".',
    role: 'shopkeeper', species: 'human', sprite: 'npc-farmer', voice: 'plain',
    colorway: cw('#e8bd95', '#c8a860', '#4a6a3a', '#5a6a3a', '#8a7a4a', '#8a8a90', '#54381f', OUTER.cloth, '#a8823a'),
    map: 'bg-rivington', x: 18, y: 32, dir: 'down', wander: 1,
    shop: 'rivington-provisions', dialogue: 'arveene',
    greeting: 'Food, rations, remedies. It is all off my own ground and I will tell you which field.',
  }),

  npc('kanithar-ulmokina', 'Kanithar Ulmokina', {
    title: 'Elder of the Rivington Camps',
    desc: 'A Rashemi who walked here from somewhere he will not name and now speaks for three hundred people in tents on the Rivington road. He is very good at it and it is killing him.',
    role: 'flavor', species: 'human', sprite: 'npc-villager-m', voice: 'grave',
    colorway: cw('#d0a070', '#2a2018', '#4a4a3a', '#5a4a4a', '#6a5a5a', '#8a8a90', '#54381f', OUTER.cloth, '#8a7a3a'),
    map: 'bg-rivington', x: 40, y: 24, dir: 'down', wander: 1,
    dialogue: 'kanithar',
  }),

  npc('bree-goodbarrel', 'Bree Goodbarrel', {
    title: 'Ferrywoman of the Chionthar',
    desc: 'She rows the small crossing below the bridge for people who cannot afford the toll, which is most of Rivington, and charges a copper when she remembers to.',
    role: 'flavor', species: 'halfling', sprite: 'npc-halfling', voice: 'cheerful',
    colorway: cw('#f0c8a0', '#8a5a2a', '#4a6a8a', '#4a6a6a', '#8a7a4a', '#8a8a90', '#54381f', LOWER.cloth, '#6aa8a8'),
    map: 'bg-rivington', x: 46, y: 12, dir: 'down', wander: 1,
    dialogue: 'bree-goodbarrel',
  }),

  npc('rivington-chicken', 'Duchess', {
    title: 'The Farmyard Hen',
    desc: 'Arveene Tallstag\'s best layer, named for a joke about the Upper City that got out of hand.',
    role: 'flavor', tag: 'animal', species: 'beast', sprite: 'chicken',
    colorway: cw('#e8d8c0', '#c8b8a0', '#c04a3a', '#e8d8c0', '#c8b8a0', '#9a9aa4', '#6b4a2a', '#c8b58a', '#c04a3a'),
    map: 'bg-rivington', x: 20, y: 34, dir: 'down', wander: 2, solid: false,
    dialogue: 'rivington-chicken',
  }),

  // =========================================================================
  // 3. THE LOWER CITY — brick, brass and salt
  // =========================================================================

  // --- GRAY HARBOUR ---------------------------------------------------------

  npc('imzel-chergoba', 'Imzel Chergoba', {
    title: 'Fist Flame of the Seatower',
    desc: 'A Rashemi who came west with nothing and commands the Seatower of Balduran, which is the Flaming Fist and therefore the city. She is blunt, exhausted and straight, and in this city that makes her nearly unique.',
    role: 'guard', species: 'human', sprite: 'npc-guard', voice: 'blunt',
    colorway: cw('#d0a070', '#2a2018', '#4a4a3a', '#6a2a2a', '#3a3a44', '#c8ccd6', '#3a2a1a', '#a09c94', '#c8b06a'),
    map: 'seatower-of-balduran', x: 14, y: 6, dir: 'down', wander: 0,
    dialogue: 'imzel', faction: 'lords-alliance',
    greeting: 'Flame Chergoba. The board is on the wall behind me. Read it before you talk.',
  }),

  npc('bran-windrivver', 'Bran Windrivver', {
    title: 'Harbourmaster of Gray Harbour',
    desc: 'Thirty years of shouting across a wharf have left him with one volume. He sells everything a ship or a road needs and knows the draught of every hull in the harbour by eye.',
    role: 'shopkeeper', species: 'human', sprite: 'npc-merchant', voice: 'shout',
    colorway: cw('#f0c8a0', '#b8b0a4', '#4a6a8a', '#3a5a6a', '#8a8a76', '#a9b0bc', '#54381f', LOWER.cloth, '#6aa8a8'),
    map: 'bg-gray-harbour', x: 34, y: 22, dir: 'down', wander: 1,
    shop: 'gray-harbour-chandlery', dialogue: 'bran',
    greeting: 'CHANDLERY! Rope, oil, rations, shot and boat gear — I AM NOT ANGRY, THIS IS MY VOICE.',
  }),

  npc('vonda-pisacar', 'Vonda Pisacar', {
    title: 'Mother of Storms',
    desc: 'High priestess of the Water Queen\'s House, the oldest temple in Baldur\'s Gate. Umberlee is not a kind goddess and Vonda has never once pretended otherwise; the mercies are real and so is the price.',
    role: 'priest', species: 'human', sprite: 'npc-priest', voice: 'liturgical',
    colorway: cw('#8a5a3a', '#241a12', '#3a5a6a', '#2a4a6a', '#4a7a8a', '#a9b0bc', '#6b4a2a', '#8ac0c0', '#6ac3c3'),
    map: 'water-queens-house', x: 10, y: 5, dir: 'down', wander: 0,
    shop: 'water-queens-house', dialogue: 'vonda', quests: ['umberlees-tithe'],
    greeting: 'The Bitch Queen\'s house. She takes what she is owed. I only carry the reckoning.',
  }),

  npc('sudeiman-khalid', 'Sudeiman Khalid', {
    title: 'Dock Factor',
    desc: 'He sells cargo manifests to people who ought not to have them and apologises the entire time, with total sincerity, while doing it.',
    role: 'flavor', species: 'human', sprite: 'npc-merchant', voice: 'apologetic',
    colorway: cw('#a06a44', '#241a12', '#3a2a1a', '#5a4a5a', '#8a7a5a', '#8a8a90', '#6b4a2a', LOWER.cloth, '#b07ae0'),
    map: 'bg-gray-harbour', x: 46, y: 24, dir: 'down', wander: 1,
    dialogue: 'sudeiman', faction: 'zhentarim',
  }),

  npc('vola', 'Vola', {
    title: 'Stevedore of Gray Harbour',
    desc: 'A half-orc who unloads ships for a living and has the shoulders to prove it. Short sentences, dry jokes, and a settled contempt for anybody who has never carried anything.',
    role: 'flavor', species: 'half-orc', sprite: 'npc-thug', voice: 'dry',
    colorway: cw('#7a9a68', '#241a12', '#c8a83a', '#4a5a5a', '#6a5a4a', '#8a8a90', '#54381f', LOWER.cloth, '#6aa8a8'),
    map: 'bg-gray-harbour', x: 24, y: 24, dir: 'down', wander: 1,
    dialogue: 'vola',
  }),

  npc('marta-agosto', 'Marta Agosto', {
    title: 'Master of the Low Lantern',
    desc: 'She keeps a three-storey merchant ship moored at the east quay as an inn, a gambling house and a place where things change hands. The house always wins and she is charming about it.',
    role: 'innkeep', species: 'human', sprite: 'npc-innkeeper', voice: 'purr',
    colorway: cw('#8a5a3a', '#241a12', '#3a2a1a', '#5a2a3a', '#c8a860', '#a9b0bc', '#6b4a2a', LOWER.cloth, '#e3b34a'),
    map: 'low-lantern', x: 10, y: 5, dir: 'down', wander: 1,
    shop: 'low-lantern', dialogue: 'marta-agosto',
    greeting: 'The Lantern. Beds above, tables below, and no questions on either deck.',
  }),

  npc('gundis-balderk', 'Gundis Balderk', {
    title: 'Foreman of the Oberon Dry Docks',
    desc: 'A shield dwarf who has complained without pause for forty years and been right every time. The scaffolds do not fall down. That is his whole argument and it is unanswerable.',
    role: 'flavor', species: 'dwarf', sprite: 'npc-dwarf', voice: 'grumble',
    colorway: cw('#d9a071', '#7a3a1a', '#4a3a2a', '#4a4a5a', '#7a5a3a', '#a9b0bc', '#54381f', LOWER.cloth, '#c07a3a'),
    map: 'bg-gray-harbour', x: 12, y: 20, dir: 'down', wander: 1,
    dialogue: 'gundis',
  }),

  // --- BLOOMRIDGE -----------------------------------------------------------

  npc('amafrey-whitburn', 'Amafrey Whitburn', {
    title: 'Chief Teller of the Counting House',
    desc: 'She runs the bank of Baldur\'s Gate: exchange, appraisal, safekeeping, and the best rate in the south for gems and art. Everything she says is itemised, including her opinions.',
    role: 'shopkeeper', species: 'human', sprite: 'npc-noble', voice: 'itemised',
    colorway: cw('#f0c8a0', '#b8b0a4', '#4a6a8a', '#2a3a5a', '#c8b06a', '#c8ccd6', '#5a3f26', UPPER.cloth, '#e3b34a'),
    map: 'counting-house', x: 10, y: 5, dir: 'down', wander: 0,
    shop: 'counting-house', dialogue: 'amafrey',
    greeting: 'The Counting House. Item one: what you have. Item two: what it is worth. Item three: my fee.',
  }),

  npc('holg', 'Holg', {
    title: 'Fist Gatecaptain of the Baldur\'s Gate',
    desc: 'A half-orc who holds the gate the city is named for and says almost nothing at it. Three words is a conversation; four is a warning.',
    role: 'guard', species: 'half-orc', sprite: 'npc-guard', voice: 'terse',
    colorway: cw('#7a9a68', '#241a12', '#c8a83a', '#6a2a2a', '#3a3a44', '#c0c6d0', '#3a2a1a', '#a09c94', '#c8b06a'),
    map: 'bg-bloomridge', x: 26, y: 6, dir: 'down', wander: 0,
    dialogue: 'holg', faction: 'lords-alliance',
    greeting: 'Gate is open. Behave.',
  }),

  npc('esvele-amblecrown', 'Esvele Amblecrown', {
    title: 'Flower Factor of Bloomridge',
    desc: 'She sells cut flowers, forced bulbs and out-of-season fruit to patriar households at prices that would embarrass a jeweller, and she is sunny about every copper of it.',
    role: 'shopkeeper', species: 'human', sprite: 'npc-villager-f', voice: 'sunny',
    colorway: cw('#e8bd95', '#c8a860', '#4a6a3a', '#5a8a5a', '#c04a8a', '#a9b0bc', '#6b4a2a', LOWER.cloth, '#e3b34a'),
    map: 'bg-bloomridge', x: 31, y: 23, dir: 'down', wander: 1,
    shop: 'bloomridge-market', dialogue: 'esvele-amblecrown',
    greeting: 'Flowers, fruit, and remedies for what the fruit does. All fresh this morning, all of it.',
  }),

  npc('silaqui-liadon', 'Silaqui Liadon', {
    title: 'Jeweller of Bloomridge',
    desc: 'A moon elf who cuts stones for the patriar houses and has cut the same three families\' stones for two hundred years. She is entirely unhurried and knows exactly what everything in this district is worth, including the people.',
    role: 'flavor', species: 'elf', sprite: 'npc-elf', voice: 'unhurried',
    colorway: cw('#e8d0c0', '#4a4a7a', '#6a8a8a', '#3a3a5a', '#c8b06a', '#c8ccd6', '#6b4a2a', UPPER.cloth, '#8ac0c0'),
    map: 'bg-bloomridge', x: 14, y: 30, dir: 'down', wander: 0,
    dialogue: 'silaqui',
  }),

  npc('ivor-kulenov', 'Ivor Kulenov', {
    title: 'Collector for the House of Rillyn',
    desc: 'He calls on debtors of Lady Silifrey Rillyn and is unfailingly reasonable, which is the frightening part: he explains the arithmetic, agrees it is hard, and comes back on the day he said he would.',
    role: 'flavor', species: 'human', sprite: 'npc-thug', voice: 'reasonable',
    colorway: cw('#d9a071', '#4a3a2a', '#4a4a3a', '#3a3a3a', '#5a4a4a', '#a9b0bc', '#3a2a1a', LOWER.cloth, '#8a7a3a'),
    map: 'bg-bloomridge', x: 38, y: 34, dir: 'down', wander: 1,
    dialogue: 'ivor-kulenov',
  }),

  npc('nedda-tosscobble', 'Nedda Tosscobble', {
    title: 'Runner',
    desc: 'Eleven years old, halfling, and the fastest legs in the Lower City. She carries messages for anybody with a copper and for the Guild with none, and she is delighted about all of it.',
    role: 'flavor', tag: 'child', species: 'halfling', sprite: 'npc-child', voice: 'gleeful',
    colorway: cw('#f0c8a0', '#7a3a1a', '#4a6a3a', '#4a5a6a', '#8a7a4a', '#8a8a90', '#54381f', LOWER.cloth, '#c04a8a'),
    map: 'bg-bloomridge', x: 18, y: 24, dir: 'down', wander: 2,
    dialogue: 'nedda',
  }),

  // --- HEAPSIDE -------------------------------------------------------------

  npc('kethra-buckman', 'Kethra Buckman', {
    title: 'Keeper of the Blushing Mermaid',
    desc: 'She has kept the roughest inn in the Lower City for twenty-two years and nothing has surprised her in nineteen of them. The recruit board by her door is the best in the city because she vets it herself.',
    role: 'innkeep', species: 'human', sprite: 'npc-innkeeper', voice: 'unshockable',
    colorway: cw('#f0c8a0', '#b8b0a4', '#4a6a8a', '#4a3a3a', '#7a5a4a', '#a9b0bc', '#54381f', LOWER.cloth, '#b04a3a'),
    map: 'blushing-mermaid', x: 11, y: 5, dir: 'down', wander: 1,
    shop: 'blushing-mermaid', dialogue: 'kethra-buckman', quests: ['the-mermaid-debt'],
    greeting: 'The Mermaid. Beds are rough, board is worse, and the hiring wall is behind you.',
  }),

  npc('jaheira', 'Jaheira', {
    title: 'Harper',
    desc: 'A half-elf druid who has run the Harpers\' cell in Baldur\'s Gate through two wars, a tyranny and whatever 1492 was, out of a back room at the Blushing Mermaid. She is dry, impatient, and extremely fond of people she refuses to say so to.',
    role: 'flavor', species: 'half-elf', sprite: 'npc-elf', voice: 'dry',
    colorway: cw('#c98d5e', '#8a5a2a', '#6a8a3a', '#3f6b3a', '#8a6a3a', '#a9b0bc', '#54381f', '#a89878', '#6aa8e8'),
    map: 'blushing-mermaid', x: 5, y: 11, dir: 'right', wander: 0,
    dialogue: 'jaheira', faction: 'harpers',
    greeting: 'Sit down before somebody notices you standing. There. Now we may talk.',
  }),

  npc('rilsa-rael', 'Rilsa Rael', {
    title: 'Lieutenant of the Guild',
    desc: 'Born in the Outer City, hard as the cobbles, and genuinely principled about her own people in a way that makes her far more dangerous than if she were not. She speaks for Nine-Fingers inside the walls.',
    role: 'flavor', species: 'human', sprite: 'npc-thug', voice: 'fast',
    colorway: cw('#c98d5e', '#241a12', '#4a3a2a', '#3a2a3a', '#5a3a4a', '#a9b0bc', '#3a2a1a', LOWER.cloth, '#b07ae0'),
    map: 'bg-heapside', x: 34, y: 26, dir: 'down', wander: 1,
    dialogue: 'rilsa', faction: 'zhentarim', quests: ['nine-fingers-favour'],
    greeting: 'You are new and you are loud. Walk with me and be neither.',
  }),

  npc('fonkin-timbers', 'Fonkin Timbers', {
    title: 'High Artificer of the High House of Wonders',
    desc: 'A rock gnome who runs Gond\'s great temple-workshop in the Lower City and is incapable of answering a question in under two hundred words, forty percent of which are technical and all of which are correct.',
    role: 'smith', species: 'gnome', sprite: 'npc-smith', voice: 'rapid',
    colorway: cw('#f0c8a0', '#c04a3a', '#4a6a3a', '#8a6a2a', '#c8a860', '#c8ccd6', '#6b4a2a', LOWER.cloth, '#e3b34a'),
    map: 'high-house-of-wonders', x: 11, y: 5, dir: 'down', wander: 1,
    shop: 'high-house-of-wonders', dialogue: 'fonkin', quests: ['the-gond-commission'],
    greeting: 'Wonder-house! Smithing, tools, alchemy, clockwork, repairs — and yes, that IS supposed to be ticking.',
  }),

  npc('anton-calabra', 'Anton Calabra', {
    title: 'Brother of the Shrine of the Suffering',
    desc: 'Ilmater\'s man in Heapside. He charges what you can pay, which is often nothing, and he has not moved on that in thirty years despite a great deal of pressure from people who could make him.',
    role: 'priest', species: 'human', sprite: 'npc-priest', voice: 'quiet',
    colorway: cw('#8a5a3a', '#241a12', '#3a2a1a', '#8a8a90', '#c0b0a0', '#a9b0bc', '#6b4a2a', '#e0d4c0', '#c04a4a'),
    map: 'shrine-of-suffering', x: 8, y: 5, dir: 'down', wander: 0,
    shop: 'shrine-of-suffering', dialogue: 'anton',
    greeting: 'The Broken God\'s house. Sit. We shall discuss the price after, and it will be less than you think.',
  }),

  npc('nal-dumein', 'Nal Dumein', {
    title: 'Fence of the Undercellar',
    desc: 'He keeps a stall in the dark under Heapside and sells thieves\' tools, poisons and other people\'s property, and he is delighted — genuinely, warmly delighted — to see everyone who comes down the stair.',
    role: 'shopkeeper', species: 'human', sprite: 'npc-hooded', voice: 'whisper',
    colorway: cw('#a06a44', '#241a12', '#3a2a1a', '#2a2a3a', '#4a3a4a', '#8a8a90', '#3a2a1a', '#7a6a5a', '#b07ae0'),
    map: 'the-undercellar', x: 14, y: 6, dir: 'down', wander: 0,
    shop: 'the-undercellar', dialogue: 'nal', faction: 'zhentarim',
    greeting: 'Down you come. Down everybody comes. Tools, poisons, and things that were somebody else\'s.',
  }),

  npc('cefrey-helder', 'Cefrey Helder', {
    title: 'Late of the Flaming Fist',
    desc: 'An Illuskan who walked away from a Fist company on the Coast Way and has been in Heapside ever since, half a sentence behind every conversation because he is listening to the street underneath it.',
    role: 'flavor', species: 'human', sprite: 'npc-thug', voice: 'watchful',
    colorway: cw('#f0c8a0', '#c8a860', '#4a6a8a', '#4a4a4a', '#5a4a3a', '#a9b0bc', '#54381f', LOWER.cloth, '#8a7a3a'),
    map: 'bg-heapside', x: 14, y: 32, dir: 'down', wander: 1,
    dialogue: 'cefrey',
  }),

  npc('betha-lackman', 'Betha Lackman', {
    title: 'Old Bess, Ratcatcher',
    desc: 'The Mermaid\'s ratcatcher, sixty-odd, and the only person alive who has been down every sewer mouth in the Lower City. She cackles at everything and she has never once been wrong.',
    role: 'flavor', species: 'human', sprite: 'npc-villager-f', voice: 'cackle',
    colorway: cw('#e0c0a0', '#b8b0a4', '#4a4a3a', '#4a4a3a', '#6a5a4a', '#8a8a90', '#54381f', OUTER.cloth, '#8a7a3a'),
    map: 'bg-heapside', x: 22, y: 12, dir: 'down', wander: 1,
    dialogue: 'old-bess',
  }),

  // --- EASTWAY --------------------------------------------------------------

  npc('alan-alyth', 'Alan Alyth', {
    title: 'Proprietor of the Elfsong Tavern',
    desc: 'He keeps the best inn in Baldur\'s Gate and deflects every question about the singing with the same three courteous sentences, in the same order, and has done for eleven years.',
    role: 'innkeep', species: 'human', sprite: 'npc-innkeeper', voice: 'courteous',
    colorway: cw('#e0a878', '#4a3a2a', '#4a6a8a', '#3a4a6a', '#c8b06a', '#c8ccd6', '#5a3f26', LOWER.cloth, '#e3b34a'),
    map: 'elfsong-tavern', x: 12, y: 5, dir: 'down', wander: 1,
    shop: 'elfsong-tavern', dialogue: 'alan-alyth', quests: ['the-elfsong-silent'],
    greeting: 'The Elfsong. Best beds in the city, and no, I could not tell you what she is singing.',
  }),

  npc('the-elfsong', 'The Elfsong', {
    title: 'The Tavern\'s Haunting',
    desc: 'A voice, an elven woman\'s, singing in Elvish somewhere in the common room, from no direction at all. You understand the words. You are quite certain you do not speak Elvish that well.',
    role: 'flavor', tag: 'spirit', species: 'elf', sprite: 'npc-hooded', voice: 'song',
    colorway: cw('#d8e0f0', '#c0d0e8', '#8ac0e0', '#8aa0c8', '#c0d0e8', '#c8ccd6', '#6a7a90', '#d8e0f0', '#8ac0e0'),
    map: 'elfsong-tavern', x: 6, y: 11, dir: 'down', wander: 2, solid: false,
    dialogue: 'the-elfsong',
  }),

  npc('rolan', 'Rolan', {
    title: 'Of Sorcerous Sundries',
    desc: 'A tiefling wizard who took over the greatest magic shop on the Sword Coast after its last master fell, and who is very good, knows it, and is brittle about being asked to prove it.',
    role: 'wizard', species: 'tiefling', sprite: 'npc-hooded', voice: 'brittle',
    colorway: cw('#a04a4a', '#2a1a1a', '#c84a4a', '#3a2a5a', '#6a4a8a', '#c8ccd6', '#5a3f26', '#c0b0c8', '#b07ae0'),
    map: 'sorcerous-sundries', x: 10, y: 5, dir: 'down', wander: 0,
    shop: 'sorcerous-sundries', dialogue: 'rolan',
    greeting: 'Sorcerous Sundries. Scrolls, wands, foci, identification. Do not touch the second shelf.',
  }),

  npc('lakrissa', 'Lakrissa', {
    title: 'Trader of Eastway',
    desc: 'A tiefling who came up from the Rivington camps four years ago with nothing and now keeps a stall on the Eastway that half the refugees on the south bank sell through. She is warm, tired, and immovable about her own.',
    role: 'flavor', species: 'tiefling', sprite: 'npc-villager-f', voice: 'warm',
    colorway: cw('#a05a5a', '#2a1a1a', '#c84a4a', '#5a3a6a', '#8a6a3a', '#a9b0bc', '#6b4a2a', LOWER.cloth, '#e3b34a'),
    map: 'bg-eastway', x: 30, y: 14, dir: 'down', wander: 1,
    dialogue: 'lakrissa',
  }),

  npc('pavel-nemetsk', 'Pavel Nemetsk', {
    title: 'Fist Sergeant of the Basilisk Gate',
    desc: 'He takes the toll at the Basilisk Gate with a ledger, a stamp and a genuine appetite for the correct completion of forms. The queue backs up through the gate and he considers that the queue\'s failing.',
    role: 'guard', species: 'human', sprite: 'npc-guard', voice: 'bureaucratic',
    colorway: cw('#d9a071', '#4a3a2a', '#4a4a3a', '#6a2a2a', '#3a3a44', '#a9b0bc', '#54381f', '#a09c94', '#c8b06a'),
    map: 'bg-eastway', x: 48, y: 22, dir: 'down', wander: 0,
    dialogue: 'pavel', faction: 'lords-alliance',
    greeting: 'Toll, declaration, and stand on the mark. The mark is there for a reason.',
  }),

  npc('zora-marsk', 'Zora Marsk', {
    title: 'Of the Guild',
    desc: 'She drinks at the Elfsong with her back to the wall and watches the door, and she has been doing it for two years for a wage. Eight words at a time, all of them chosen.',
    role: 'flavor', species: 'human', sprite: 'npc-hooded', voice: 'chosen',
    colorway: cw('#d9a071', '#241a12', '#4a4a3a', '#2a2a2a', '#4a3a4a', '#a9b0bc', '#3a2a1a', '#7a6a5a', '#b07ae0'),
    map: 'elfsong-tavern', x: 19, y: 12, dir: 'left', wander: 0,
    dialogue: 'zora', faction: 'zhentarim',
    hidden: true, requires: 'bg-guild-known',
  }),

  npc('bardeid-jassan', 'Bardeid Jassan', {
    title: 'Of the Blade and Stars',
    desc: 'He keeps the Blade and Stars, whose enchanted signboard is the second most famous thing on the Eastway, and sells what he knows about caravans at a price that scales with your evident wealth.',
    role: 'innkeep', species: 'human', sprite: 'npc-innkeeper', voice: 'expansive',
    colorway: cw('#8a5a3a', '#241a12', '#3a2a1a', '#3a3a6a', '#c8a860', '#a9b0bc', '#6b4a2a', LOWER.cloth, '#e3b34a'),
    map: 'bg-eastway', x: 16, y: 28, dir: 'down', wander: 1,
    dialogue: 'bardeid-jassan',
  }),

  npc('elfsong-cat', 'Nib', {
    title: 'The Elfsong Cat',
    desc: 'A black cat who sits in the middle of the common room facing a corner where nobody is, for hours, and will not be moved.',
    role: 'flavor', tag: 'animal', species: 'beast', sprite: 'cat',
    colorway: cw('#2a2a2a', '#1a1a1a', '#c8a83a', '#2a2a2a', '#1a1a1a', '#9a9aa4', '#6b4a2a', '#c8b58a', '#e3b34a'),
    map: 'elfsong-tavern', x: 4, y: 14, dir: 'up', wander: 1, solid: false,
    dialogue: 'elfsong-cat',
  }),

  // =========================================================================
  // 4. THE UPPER CITY — blues, whites, gold and deep red
  // =========================================================================

  // --- THE WIDE -------------------------------------------------------------

  npc('miri-tallstag', 'Miri Tallstag', {
    title: 'Fist Corporal of the Wide Muster',
    desc: 'She stands the permanent Flaming Fist post on the Wide, gives directions to everyone who asks, and would rather be on the wall. She is the friendliest uniform in the Upper City, which is a low bar and she clears it easily.',
    role: 'guard', species: 'human', sprite: 'npc-guard', voice: 'friendly',
    colorway: cw('#e8bd95', '#7a5a2a', '#4a6a3a', '#6a2a2a', '#3a3a44', '#c8ccd6', '#5a3f26', UPPER.cloth, '#c8b06a'),
    map: 'bg-the-wide', x: 38, y: 29, dir: 'down', wander: 1,
    dialogue: 'miri', faction: 'lords-alliance',
    greeting: 'Corporal Tallstag, Wide muster. Lost? Everybody is. Which gate do you want?',
  }),

  npc('sirene-oberon', 'Sirene Oberon', {
    title: 'Of the Market Court',
    desc: 'A patriar of the Oberon house — dry docks, three generations — who holds the Wide\'s market court and fines by the yard of encroached frontage. She is bored by everything and exact about all of it.',
    role: 'noble', species: 'human', sprite: 'npc-noble', voice: 'bored',
    colorway: cw('#f0c8a0', '#b8b0a4', '#4a6a8a', '#2a3a5a', '#c8b06a', '#c8ccd6', '#5a3f26', UPPER.cloth, '#e3b34a'),
    map: 'bg-the-wide', x: 44, y: 22, dir: 'down', wander: 0,
    dialogue: 'sirene',
    greeting: 'Market court. Your stall is four inches over the line and I have already written it down.',
  }),

  npc('aseir-basha', 'Aseir Basha', {
    title: 'Spice Factor of the Wide',
    desc: 'Little Calimshan\'s best stall, moved inside the walls and marked up accordingly. He is silken, relentless, and has never in his life let a customer leave a conversation first.',
    role: 'shopkeeper', species: 'human', sprite: 'npc-merchant', voice: 'silken',
    colorway: cw('#a06a44', '#241a12', '#3a2a1a', '#6a2a4a', '#c8a860', '#c8ccd6', '#6b4a2a', UPPER.cloth, '#e3b34a'),
    map: 'bg-the-wide', x: 16, y: 29, dir: 'down', wander: 1,
    shop: 'bg-wide-market', dialogue: 'aseir',
    greeting: 'You have stopped walking. That is the hard part done — the rest is only price.',
  }),

  npc('kethra-hornraven', 'Kethra Hornraven', {
    title: 'Bellringer of the Wide',
    desc: 'Twenty years in the Flaming Fist, and now she rings the Baldur\'s Mouth bell for a death, a war or a very good piece of gossip. Two words at a time, and never a third.',
    role: 'flavor', species: 'human', sprite: 'npc-villager-f', voice: 'terse',
    colorway: cw('#f0c8a0', '#b8b0a4', '#4a6a8a', '#4a4a4a', '#6a5a4a', '#c0c6d0', '#54381f', UPPER.cloth, '#c8b06a'),
    map: 'bg-the-wide', x: 24, y: 17, dir: 'down', wander: 0,
    dialogue: 'kethra-hornraven',
  }),

  npc('grim-guthmere', 'Grim Guthmere', {
    title: 'The Family Disappointment',
    desc: 'A patriar black sheep who drinks on the Wide steps in a coat that used to cost more than a house and sells rumours for coppers. He is cheerfully, completely ruined and finds it all very funny.',
    role: 'flavor', species: 'human', sprite: 'npc-noble', voice: 'ruined',
    colorway: cw('#e0a878', '#8a7a5a', '#4a6a8a', '#4a3a4a', '#8a7a5a', '#a9b0bc', '#5a3f26', '#b0a894', '#c8b06a'),
    map: 'bg-the-wide', x: 44, y: 34, dir: 'down', wander: 1,
    dialogue: 'grim',
    greeting: 'A copper for a rumour, two for a good one, and three if you want it to be true.',
  }),

  npc('astorio-falone', 'Astorio Falone', {
    title: 'Of the Light Fingers',
    desc: 'A Turami cutpurse working the Wide\'s crowd with total professional friendliness and not one sincere syllable. Once you are known to the Guild he stops pretending, which is worse.',
    role: 'flavor', species: 'human', sprite: 'npc-thug', voice: 'insincere',
    colorway: cw('#8a5a3a', '#241a12', '#3a2a1a', '#3a2a3a', '#5a3a4a', '#a9b0bc', '#3a2a1a', '#8a8070', '#b07ae0'),
    map: 'bg-the-wide', x: 12, y: 22, dir: 'down', wander: 1,
    dialogue: 'astorio', faction: 'zhentarim',
    hidden: true, requires: 'bg-guild-known',
  }),

  npc('rowan-linnacker', 'Rowan Linnacker', {
    title: 'Editor of Baldur\'s Mouth',
    desc: 'She writes the broadsheet the whole city reads, in prose of extraordinary richness, and speaks like a woman being charged by the word. She has printed one thing this tenday she cannot defend.',
    role: 'noble', species: 'human', sprite: 'npc-noble', voice: 'sour',
    colorway: cw('#e8bd95', '#4a3a2a', '#4a6a3a', '#3a2a4a', '#8a2a2a', '#c8ccd6', '#5a3f26', UPPER.cloth, '#e3b34a'),
    map: 'baldurs-mouth', x: 9, y: 5, dir: 'down', wander: 0,
    dialogue: 'rowan-linnacker', quests: ['what-the-mouth-prints'],
    greeting: 'Yes. What. Be brief; the forme closes at the bell.',
  }),

  npc('ellyjobell-nackle', 'Ellyjobell Nackle', {
    title: 'Typesetter of the Mouth',
    desc: 'A rock gnome who sets every line the city reads, backwards, at speed, and therefore reads everything twice before anybody else reads it once. She talks in brackets.',
    role: 'flavor', species: 'gnome', sprite: 'npc-villager-f', voice: 'rapid',
    colorway: cw('#f0c8a0', '#4a6a8a', '#4a6a3a', '#5a5a6a', '#8a7a5a', '#c0c6d0', '#6b4a2a', UPPER.cloth, '#c8b06a'),
    map: 'baldurs-mouth', x: 5, y: 10, dir: 'right', wander: 1,
    dialogue: 'ellyjobell', quests: ['what-the-mouth-prints'],
  }),

  // --- THE TEMPLES DISTRICT -------------------------------------------------

  npc('glar-bersk', 'Glar Bersk', {
    title: 'Usher of the High Hall',
    desc: 'He stands on the High Hall\'s step and decides who goes up it, and he has decided against dukes. Not out of malice: out of procedure, which in this building is stronger than malice.',
    role: 'guard', species: 'human', sprite: 'npc-guard', voice: 'procedural',
    colorway: cw('#d9a071', '#4a3a2a', '#4a4a3a', '#2a3a5a', '#c8b06a', '#c8ccd6', '#5a3f26', UPPER.cloth, '#e3b34a'),
    map: 'bg-temples-district', x: 23, y: 19, dir: 'down', wander: 0,
    dialogue: 'glar-bersk', faction: 'lords-alliance',
    removedBy: 'bg-ducal-summons',
    greeting: 'The Hall is not open. It has not been open. Summons or step aside.',
  }),

  npc('ulder-ravengard', 'Ulder Ravengard', {
    title: 'Grand Duke of Baldur\'s Gate',
    desc: 'Marshal of the Flaming Fist and Grand Duke, four years past the crisis that nearly ended the city and greyer for every one of them. Every sentence he speaks is an order, including the kind ones.',
    role: 'noble', species: 'human', sprite: 'npc-noble', voice: 'command',
    colorway: cw('#c98d5e', '#b8b0a4', '#4a4a3a', '#6a2a2a', '#2a3a5a', '#c8ccd6', '#3a2a1a', UPPER.cloth, '#e3b34a'),
    map: 'high-hall', x: 15, y: 5, dir: 'down', wander: 0,
    dialogue: 'ravengard', faction: 'lords-alliance', quests: ['the-fourth-chair'],
    greeting: 'You are in the High Hall. Say the thing you came to say, and say it once.',
  }),

  npc('dillard-portyr', 'Dillard Portyr', {
    title: 'Duke of Baldur\'s Gate',
    desc: 'He was Grand Duke and gave the post up, and he has been the Council\'s most agreeable and most dangerous member ever since. He is warm, he is generous, and he has never once answered the question asked.',
    role: 'noble', species: 'human', sprite: 'npc-noble', voice: 'warm',
    colorway: cw('#e0a878', '#8a7a5a', '#4a6a8a', '#3a4a6a', '#c8b06a', '#c8ccd6', '#5a3f26', UPPER.cloth, '#e3b34a'),
    map: 'high-hall', x: 9, y: 9, dir: 'down', wander: 0,
    dialogue: 'portyr', faction: 'lords-alliance',
  }),

  npc('katernin-sashenstar', 'Katernin Sashenstar', {
    title: 'Duchess of Baldur\'s Gate',
    desc: 'She holds the chair Belynne Stelmane died in, and she has read every page of the inquiry into that death, twice. Precise, grieving, and furious under all of it.',
    role: 'noble', species: 'human', sprite: 'npc-noble', voice: 'precise',
    colorway: cw('#d9a071', '#3a2a1a', '#4a4a3a', '#2a2a3a', '#8a2a2a', '#c8ccd6', '#5a3f26', UPPER.cloth, '#c8ccd6'),
    map: 'high-hall', x: 21, y: 9, dir: 'down', wander: 0,
    dialogue: 'katernin', faction: 'lords-alliance', quests: ['the-ducal-summons'],
    greeting: 'You may sit. I would rather you did not, but you may.',
  }),

  npc('bardeid-dlusker', 'Bardeid Dlusker', {
    title: 'Duke of Baldur\'s Gate',
    desc: 'He holds Thalamra Vanthampur\'s old seat and knows exactly whose chair it was, which is why he is too loud, too generous and watching every door in the room.',
    role: 'noble', species: 'human', sprite: 'npc-noble', voice: 'loud',
    colorway: cw('#8a5a3a', '#241a12', '#3a2a1a', '#5a2a2a', '#c8b06a', '#c8ccd6', '#5a3f26', UPPER.cloth, '#e3b34a'),
    map: 'high-hall', x: 22, y: 15, dir: 'down', wander: 0,
    dialogue: 'dlusker', faction: 'lords-alliance',
  }),

  npc('tessele-vammas', 'Tessele Vammas', {
    title: 'Speaker of the Parliament of Peers',
    desc: 'She chairs fifty patriars who advise, complain and occasionally elect, and she does it in a procedural register so exhausting that it is, once or twice a year, magnificent.',
    role: 'noble', species: 'human', sprite: 'npc-noble', voice: 'parliamentary',
    colorway: cw('#e8bd95', '#b8b0a4', '#4a6a3a', '#3a3a4a', '#c8b06a', '#c8ccd6', '#5a3f26', UPPER.cloth, '#e3b34a'),
    map: 'high-hall', x: 7, y: 15, dir: 'down', wander: 0,
    dialogue: 'tessele', faction: 'lords-alliance',
  }),

  npc('erdan-galanodel', 'Erdan Galanodel', {
    title: 'Loremaster of the Unrolling Scroll',
    desc: 'Half-elf keeper of Oghma\'s shrine in the Upper City: white marble, red roof, gold trim, and a man inside it who cannot mention a fact without naming where he read it.',
    role: 'priest', species: 'half-elf', sprite: 'npc-priest', voice: 'digressive',
    colorway: cw('#e8d0c0', '#8a5a2a', '#6a8a8a', '#8a2a2a', '#e4e0d4', '#e3c46a', '#6b4a2a', UPPER.cloth, '#e3b34a'),
    map: 'unrolling-scroll', x: 10, y: 5, dir: 'down', wander: 0,
    shop: 'unrolling-scroll', dialogue: 'erdan',
    greeting: 'The Unrolling Scroll. Scrolls, books, and identification — Oghma asks only that you read what you buy.',
  }),

  npc('dona-marivaldi', 'Dona Marivaldi', {
    title: 'Novice of the Unrolling Scroll',
    desc: 'A Turami novice sweeping the temple forecourt and memorising the processional order of the High Hall\'s doors, because Loremaster Galanodel said it would be on something.',
    role: 'flavor', species: 'human', sprite: 'npc-priest', voice: 'earnest',
    colorway: cw('#8a5a3a', '#241a12', '#3a2a1a', '#8a2a2a', '#e4e0d4', '#c8ccd6', '#6b4a2a', UPPER.cloth, '#e3b34a'),
    map: 'bg-temples-district', x: 34, y: 32, dir: 'down', wander: 1,
    dialogue: 'dona-marivaldi',
  }),

  // --- CITADEL STREETS ------------------------------------------------------

  npc('kara-dotsk', 'Kara Dotsk', {
    title: 'Watch Sentinel of the Citadel',
    desc: 'The Watch does not admit strangers to the Stormkeep, and Sentinel Dotsk is the sentence in which that policy is written. She is polite. The policy is not.',
    role: 'guard', species: 'human', sprite: 'npc-guard', voice: 'iron',
    colorway: cw('#d9a071', '#4a3a2a', '#4a4a3a', '#2a3a5a', '#8a8a90', '#c8ccd6', '#3a2a1a', '#b0aca0', '#b9c1cf'),
    map: 'bg-citadel-streets', x: 21, y: 19, dir: 'down', wander: 0,
    dialogue: 'kara-dotsk',
    removedBy: 'bg-watch-writ',
    greeting: 'This is the Watch Citadel. You are not the Watch. Those two facts settle it.',
  }),

  npc('olma-bersk', 'Olma Bersk', {
    title: 'Watch Captain of the Stormkeep',
    desc: 'She polices the Upper City with four hundred Watch and a budget the Council reviews annually, while the Flaming Fist polices everywhere else with an army. Her courtesy to the Fist is a kind of ironwork.',
    role: 'guard', species: 'human', sprite: 'npc-guard', voice: 'iron',
    colorway: cw('#d9a071', '#3a2a1a', '#4a4a3a', '#2a3a5a', '#8a8a90', '#c8ccd6', '#3a2a1a', UPPER.cloth, '#b9c1cf'),
    map: 'watch-citadel', x: 12, y: 5, dir: 'down', wander: 0,
    dialogue: 'olma',
    greeting: 'Captain Bersk, the Watch. Not the Fist. The distinction is the whole of my working life.',
  }),

  npc('diero-marivaldi', 'Diero Marivaldi', {
    title: 'Fist Flame, Liaison to the Watch',
    desc: 'Ravengard\'s man in the Upper City, and the smoothest thing in a uniform on the Sword Coast. Everything he says is a courtesy and about one in four of them is a threat.',
    role: 'guard', species: 'human', sprite: 'npc-guard', voice: 'silk',
    colorway: cw('#8a5a3a', '#241a12', '#3a2a1a', '#6a2a2a', '#2a3a5a', '#c8ccd6', '#3a2a1a', UPPER.cloth, '#e3b34a'),
    map: 'bg-citadel-streets', x: 30, y: 24, dir: 'down', wander: 1,
    dialogue: 'diero', faction: 'lords-alliance',
    greeting: 'Flame Marivaldi, liaison. I liaise. It is remarkable how much of the city that covers.',
  }),

  npc('delg-ironfist', 'Delg Ironfist', {
    title: 'Armiger of the Watch',
    desc: 'A shield dwarf quartermaster who speaks entirely in inventory and has never once been short. Watch-pattern arms only, and he will want to see the writ before he will discuss the weather.',
    role: 'smith', species: 'dwarf', sprite: 'npc-dwarf', voice: 'inventory',
    colorway: cw('#d9a071', '#7a3a1a', '#4a3a2a', '#2a3a5a', '#8a8a90', '#c8ccd6', '#54381f', '#b0aca0', '#b9c1cf'),
    map: 'watch-citadel', x: 6, y: 12, dir: 'right', wander: 0,
    shop: 'watch-armoury', dialogue: 'delg',
    greeting: 'Armoury. Watch-pattern only. Item: your writ. I do not see it.',
  }),

  npc('silifrey-rillyn', 'Silifrey Rillyn', {
    title: 'Of the House of Rillyn',
    desc: 'A patriar moneylender whose collectors are Guild men in clean coats. She is the Guild\'s respectable face in the Upper City, and she is kind to you until the day of the month.',
    role: 'noble', species: 'human', sprite: 'npc-noble', voice: 'kind',
    colorway: cw('#f0c8a0', '#b8b0a4', '#4a6a8a', '#3a2a4a', '#c8b06a', '#c8ccd6', '#5a3f26', UPPER.cloth, '#b07ae0'),
    map: 'bg-citadel-streets', x: 14, y: 28, dir: 'down', wander: 0,
    dialogue: 'silifrey-rillyn',
    greeting: 'How lovely. Do come and stand where I can see you.',
  }),

  npc('perrin-thorngage', 'Perrin Thorngage', {
    title: 'Manor Cook',
    desc: 'A halfling cook to a patriar house who runs an entirely unlicensed pie stall from a handcart four streets from the kitchen he is supposed to be in, and considers this the finest work of his life.',
    role: 'flavor', species: 'halfling', sprite: 'npc-halfling', voice: 'conspiratorial',
    colorway: cw('#f0c8a0', '#7a5a2a', '#4a6a3a', '#5a6a4a', '#c8a860', '#a9b0bc', '#6b4a2a', UPPER.cloth, '#c07a3a'),
    map: 'bg-citadel-streets', x: 36, y: 32, dir: 'down', wander: 1,
    dialogue: 'perrin',
    greeting: 'Pie. Do not ask whose kitchen. Pie.',
  }),

];

// ===========================================================================
// 5. RECRUITS — the southern bench
// ===========================================================================
// Appended to npcs.js RECRUITS. Every one is also a placed NPC above, so the
// `npcId`/`location` pair points at somewhere the party can actually stand.

export const SOUTH_RECRUITS = [

  recruit('jaheira', 'Jaheira', {
    title: 'Harper of Baldur\'s Gate',
    speciesId: 'half-elf', classId: 'druid', subclassId: 'land',
    backgroundId: 'hermit', level: 12, cost: 0, faction: 'harpers',
    location: 'blushing-mermaid', npcId: 'jaheira', deity: 'Silvanus', weapon: 'scimitar',
    abilities: { str: 12, dex: 14, con: 15, int: 12, wis: 16, cha: 13 },
    personality: 'Dry, impatient, and unable to say a warm thing without wrapping three layers of correction round it first.',
    bio: 'She has run the Harpers\' Baldur\'s Gate cell out of a back room at the Blushing Mermaid for longer than most of the Fist have been alive, through the Iron Throne, through the Bhaalspawn years, through whatever 1492 was. She has buried a husband, a war and a great many friends, and she keeps a list of the ones she got out. She joins for the cause and takes no coin for it, and she will tell you when you are wrong before she tells you anything else.',
    colorway: cw('#c98d5e', '#8a5a2a', '#6a8a3a', '#3f6b3a', '#8a6a3a', '#a9b0bc', '#54381f', '#a89878', '#6aa8e8'),
    appearance: look({ body: 'f', build: 'normal', skin: '#c98d5e', hair: '#8a5a2a', hairStyle: 'long', eye: '#6a8a3a', outfit: '#3f6b3a', outfitAlt: '#8a6a3a', accent: '#6aa8e8', ears: 'pointed', outfitStyle: 'outfit-leather', cloakStyle: 'cloak-hooded' }),
    joinDialogue: 'jaheira',
  }),

  recruit('alfira', 'Alfira', {
    title: 'Bard of Rivington',
    speciesId: 'tiefling', classId: 'bard', subclassId: 'lore',
    backgroundId: 'entertainer', level: 9, cost: 120, faction: null,
    location: 'bg-rivington', npcId: 'alfira', deity: 'Sune', weapon: 'rapier',
    abilities: { str: 9, dex: 15, con: 13, int: 13, wis: 12, cha: 16 },
    personality: 'Gentle, watchful, and writing all of it down — including the parts you would rather she did not.',
    bio: 'A tiefling who sings on the Rivington road because that is where the people who need singing to are. She has been collecting the names of everyone who came up the Coast Way out of the south since the crisis, one verse at a time, and the book is nearly full. She will come with you to fill the rest of it, and she will make you look at what you have done afterwards.',
    colorway: cw('#a05a5a', '#2a1a1a', '#c84a4a', '#5a3a6a', '#c8a860', '#a9b0bc', '#6b4a2a', '#c0ab86', '#e3b34a'),
    appearance: look({ body: 'f', build: 'slim', skin: '#a05a5a', hair: '#2a1a1a', hairStyle: 'long', eye: '#c84a4a', outfit: '#5a3a6a', outfitAlt: '#c8a860', accent: '#e3b34a', horns: 'curled', tail: 'long', hornColor: '#6a4a4a', outfitStyle: 'outfit-tunic', cloakStyle: 'cloak-short' }),
    joinDialogue: 'alfira',
  }),

  recruit('zora-marsk', 'Zora Marsk', {
    title: 'Knife of the Guild',
    speciesId: 'human', classId: 'rogue', subclassId: 'assassin',
    backgroundId: 'criminal', level: 11, cost: 300, faction: 'zhentarim',
    location: 'elfsong-tavern', npcId: 'zora-marsk', deity: 'Mask', weapon: 'shortsword',
    abilities: { str: 10, dex: 17, con: 13, int: 13, wis: 12, cha: 11 },
    personality: 'Speaks eight words at a time. All eight are chosen and none are wasted.',
    bio: 'Damaran, Outer City born, and on the Guild\'s payroll since she was fourteen. She sits at the Elfsong with her back to the wall and is paid to know who comes through the door, which she has done without a single error for two years. Nine-Fingers will loan her out to people the Guild has decided to be interested in. She has never once said what she thinks of that arrangement.',
    colorway: cw('#d9a071', '#241a12', '#4a4a3a', '#2a2a2a', '#4a3a4a', '#a9b0bc', '#3a2a1a', '#7a6a5a', '#b07ae0'),
    appearance: look({ body: 'f', build: 'slim', skin: '#d9a071', hair: '#241a12', hairStyle: 'short', eye: '#4a4a3a', outfit: '#2a2a2a', outfitAlt: '#4a3a4a', accent: '#b07ae0', leather: '#3a2a1a', outfitStyle: 'outfit-leather', cloakStyle: 'cloak-hooded' }),
    joinDialogue: 'zora',
  }),

  recruit('cefrey-helder', 'Cefrey Helder', {
    title: 'Late of the Flaming Fist',
    speciesId: 'human', classId: 'fighter', subclassId: 'champion',
    backgroundId: 'soldier', level: 10, cost: 200, faction: null,
    location: 'bg-heapside', npcId: 'cefrey-helder', deity: 'Tempus', weapon: 'longsword',
    abilities: { str: 16, dex: 13, con: 15, int: 10, wis: 12, cha: 10 },
    personality: 'Half a sentence behind you, because he is listening to the street underneath the conversation.',
    bio: 'He served eleven years in the Flaming Fist and walked off a company on the Coast Way after an order he will describe exactly once, flatly, and never again. Desertion carries the rope in this city, so he lives in Heapside with his back to walls and takes work that goes out of the gates. He is a very good soldier and he would like, very much, to be a soldier for somebody who is not the Fist.',
    colorway: cw('#f0c8a0', '#c8a860', '#4a6a8a', '#4a4a4a', '#5a4a3a', '#a9b0bc', '#54381f', '#c0ab86', '#8a7a3a'),
    appearance: look({ body: 'm', build: 'broad', skin: '#f0c8a0', hair: '#c8a860', hairStyle: 'short', beard: 'stubble', eye: '#4a6a8a', outfit: '#4a4a4a', outfitAlt: '#5a4a3a', accent: '#8a7a3a', metal: '#a9b0bc', outfitStyle: 'outfit-brigandine', cloakStyle: 'cloak-hooded' }),
    joinDialogue: 'cefrey',
  }),

  recruit('vola', 'Vola', {
    title: 'Stevedore of Gray Harbour',
    speciesId: 'half-orc', classId: 'barbarian', subclassId: 'berserker',
    backgroundId: 'sailor', level: 10, cost: 180, faction: null,
    location: 'bg-gray-harbour', npcId: 'vola', deity: 'Tempus', weapon: 'greataxe',
    abilities: { str: 17, dex: 12, con: 16, int: 9, wis: 11, cha: 10 },
    personality: 'Short sentences. Dry jokes. A settled, cheerful contempt for anyone who has never carried anything heavy.',
    bio: 'Nineteen years on the Gray Harbour wharf, which is nineteen years of putting down things nobody else could pick up. She has broken three men\'s arms on that wharf and all three deserved it and two of them still drink with her. The work is drying up as the patriars move cargo to Wyrm\'s Rock, and she would rather swing an axe for pay than watch it go.',
    colorway: cw('#7a9a68', '#241a12', '#c8a83a', '#4a5a5a', '#6a5a4a', '#8a8a90', '#54381f', '#c0ab86', '#6aa8a8'),
    appearance: look({ body: 'f', build: 'broad', skin: '#7a9a68', hair: '#241a12', hairStyle: 'ponytail', eye: '#c8a83a', outfit: '#4a5a5a', outfitAlt: '#6a5a4a', accent: '#6aa8a8', outfitStyle: 'outfit-hide' }),
    joinDialogue: 'vola',
  }),

  recruit('feng', 'Feng', {
    title: 'Of Sow\'s Foot',
    speciesId: 'half-orc', classId: 'barbarian', subclassId: 'wild-heart',
    backgroundId: 'criminal', level: 9, cost: 150, faction: 'zhentarim',
    location: 'bg-sows-foot', npcId: 'feng', deity: 'Malar', weapon: 'maul',
    abilities: { str: 17, dex: 13, con: 16, int: 8, wis: 12, cha: 9 },
    personality: 'Blunt, literal, and lately in the habit of asking who a message is for before he carries it.',
    bio: 'Born in the mud of Sow\'s Foot and raised on the Guild\'s errands, Feng carries messages that arrive by hand and are understood without words. He is extremely good at it. He has also started counting: which doors, which families, which of them were Outer City folk the Guild says it protects. The arithmetic has begun to bother him, and Brem has noticed that it has.',
    colorway: cw('#7a9a68', '#241a12', '#c8a83a', '#4a3a3a', '#5a4a4a', '#8a8a90', '#54381f', '#9a8c6e', '#b07ae0'),
    appearance: look({ body: 'm', build: 'broad', skin: '#7a9a68', hair: '#241a12', hairStyle: 'short', eye: '#c8a83a', outfit: '#4a3a3a', outfitAlt: '#5a4a4a', accent: '#b07ae0', outfitStyle: 'outfit-hide' }),
    joinDialogue: 'feng',
  }),

  recruit('quara-ramondo', 'Quara Ramondo', {
    title: 'Sister of Eldath',
    speciesId: 'human', classId: 'cleric', subclassId: 'life',
    backgroundId: 'acolyte', level: 10, cost: 140, faction: null,
    location: 'bg-twin-songs', npcId: 'quara-ramondo', deity: 'Eldath', weapon: 'quarterstaff',
    abilities: { str: 10, dex: 12, con: 14, int: 12, wis: 17, cha: 13 },
    personality: 'Calm to the point of being unnerving. Has never raised her voice and has stopped a great many people who were raising theirs.',
    bio: 'Eldath\'s shrine in Twin Songs is a stone basin of still water and a bench, and Quara has kept both for nine years on an avenue where six faiths share one gutter. She has stepped between more drawn knives than the Watch and never carried one. She will walk with you because the Green Goddess\'s peace is not made by standing still in it, and she will be extremely clear about which of your plans she is not blessing.',
    colorway: cw('#8a5a3a', '#241a12', '#3a5a4a', '#3a6a5a', '#8ac0a0', '#a9b0bc', '#6b4a2a', '#d8e4d8', '#6ac0a0'),
    appearance: look({ body: 'f', build: 'normal', skin: '#8a5a3a', hair: '#241a12', hairStyle: 'braid', eye: '#3a5a4a', outfit: '#3a6a5a', outfitAlt: '#8ac0a0', accent: '#6ac0a0', outfitStyle: 'outfit-robe', cloakStyle: 'cloak-long' }),
    joinDialogue: 'quara',
  }),

  recruit('haseid-dumein', 'Haseid Dumein', {
    title: 'Of the Quiet Trade',
    speciesId: 'human', classId: 'monk', subclassId: 'shadow',
    backgroundId: 'criminal', level: 11, cost: 260, faction: 'zhentarim',
    location: 'bg-little-calimshan', npcId: 'haseid-dumein', deity: 'Mask', weapon: 'shortsword',
    abilities: { str: 12, dex: 17, con: 14, int: 12, wis: 15, cha: 10 },
    personality: 'Never hurries. Has never once been caught, and considers the two facts to be the same fact.',
    bio: 'Four generations of his family have moved Calishite goods past Baldurian tolls, and Haseid is the first to treat it as a discipline rather than a trade. He learned the shadow forms from a Shou monk who wintered in Little Calimshan and paid for the lessons in silence. The Guild uses him and does not own him, which is a distinction he maintains with great care and very little noise.',
    colorway: cw('#8a5a3a', '#241a12', '#3a2a1a', '#3a3a3a', '#5a4a4a', '#8a8a90', '#54381f', '#8a8070', '#b07ae0'),
    appearance: look({ body: 'm', build: 'slim', skin: '#8a5a3a', hair: '#241a12', hairStyle: 'short', beard: 'stubble', eye: '#3a2a1a', outfit: '#3a3a3a', outfitAlt: '#5a4a4a', accent: '#b07ae0', outfitStyle: 'outfit-tunic', cloakStyle: 'cloak-hooded' }),
    joinDialogue: 'haseid',
  }),

  recruit('ivellios-nailo', 'Ivellios Nailo', {
    title: 'Ranger of the Coast Way',
    speciesId: 'elf', lineageId: 'wood-elf', classId: 'ranger', subclassId: 'hunter',
    backgroundId: 'guide', level: 9, cost: 160, faction: 'emerald-enclave',
    location: 'friendly-arm-common', npcId: 'ivellios-nailo', deity: 'Mielikki', weapon: 'longbow',
    abilities: { str: 12, dex: 17, con: 13, int: 11, wis: 15, cha: 9 },
    personality: 'Sparing with words to the point of rudeness, and completely reliable about the thing he did say.',
    bio: 'A wood elf of the Cloakwood eaves who took the Enclave\'s charge over the Coast Way forty years ago, when the ankheg fields were three farms wide. They are eleven now. He has mapped every burrow between the Friendly Arm and Beregost, watched the map get worse each spring, and concluded that he cannot do it alone — a conclusion it took him nine years to reach and four words to say.',
    colorway: cw('#d0b090', '#3a5a2a', '#6a8a3a', '#3f6b3a', '#54381f', '#9a8f80', '#54381f', '#a89878', '#7fbf6a'),
    appearance: look({ body: 'm', build: 'slim', skin: '#d0b090', hair: '#3a5a2a', hairStyle: 'ponytail', eye: '#6a8a3a', outfit: '#3f6b3a', outfitAlt: '#54381f', accent: '#7fbf6a', ears: 'pointed', outfitStyle: 'outfit-leather', cloakStyle: 'cloak-hooded' }),
    joinDialogue: 'ivellios',
  }),

  recruit('kriv-daardendrian', 'Kriv Daardendrian', {
    title: 'Sworn of the Gauntlet',
    speciesId: 'dragonborn', classId: 'paladin', subclassId: 'devotion',
    backgroundId: 'soldier', level: 11, cost: 240, faction: 'gauntlet',
    location: 'song-of-the-morning', npcId: 'kriv-daardendrian', deity: 'Torm', weapon: 'greatsword',
    abilities: { str: 17, dex: 10, con: 15, int: 11, wis: 12, cha: 15 },
    personality: 'Formal, literal, and in the middle of a private argument about whether being right was enough.',
    bio: 'A bronze dragonborn of clan Daardendrian, sworn to the Order of the Gauntlet, who made a judgement on the Coast Way that was correct in law, correct in doctrine, and left a family dead. He walked to Beregost and asked Kelddath Ormlyr for a penance and was given a broom, which he has used for four months. He would very much like a hard task and a plain answer, in that order.',
    colorway: cw('#a8763a', '#8a5a2a', '#c8a83a', '#8a6a2a', '#c8b58a', '#c8ccd6', '#6b4a2a', '#e4d8b8', '#e3b34a'),
    appearance: look({ body: 'm', build: 'broad', skin: '#a8763a', hair: '#8a5a2a', hairStyle: 'short', eye: '#c8a83a', outfit: '#8a6a2a', outfitAlt: '#c8b58a', accent: '#e3b34a', metal: '#c8ccd6', outfitStyle: 'outfit-plate', cloakStyle: 'cloak-short' }),
    joinDialogue: 'kriv',
  }),

  recruit('delfen-ondabarl', 'Delfen Ondabarl', {
    title: '"Yellowknife"',
    speciesId: 'human', classId: 'wizard', subclassId: 'evoker',
    backgroundId: 'sage', level: 12, cost: 400, faction: null,
    location: 'daggerford', npcId: 'delfen-ondabarl', deity: 'Mystra', weapon: 'quarterstaff',
    abilities: { str: 8, dex: 13, con: 14, int: 17, wis: 13, cha: 12 },
    personality: 'Wry, evasive, and entirely willing to discuss anything at all except the last two years.',
    bio: 'Daggerford\'s wizard for a generation, a fixture of the Duchess\'s council and the terror of the Delimbiyr\'s river-pirates. Then he went away for a year and came back twenty years younger, and has declined — courteously, completely, and to Morwen Daggerford\'s face — to explain it. The tower is where it was. The books are where they were. The man is not, and he knows it better than anyone.',
    colorway: cw('#e8bd95', '#c8a860', '#8a8a3a', '#3a3a5a', '#c8b06a', '#9a9aa4', '#5a3f26', '#c8b58a', '#e3b34a'),
    appearance: look({ body: 'm', build: 'slim', skin: '#e8bd95', hair: '#c8a860', hairStyle: 'long', beard: 'none', eye: '#8a8a3a', outfit: '#3a3a5a', outfitAlt: '#c8b06a', accent: '#e3b34a', outfitStyle: 'outfit-robe', cloakStyle: 'cloak-long' }),
    joinDialogue: 'delfen',
  }),

  recruit('imzel-chergoba', 'Imzel Chergoba', {
    title: 'Fist Flame of the Seatower',
    speciesId: 'human', classId: 'fighter', subclassId: 'battle-master',
    backgroundId: 'soldier', level: 12, cost: 0, faction: 'lords-alliance',
    location: 'seatower-of-balduran', npcId: 'imzel-chergoba', deity: 'Tempus', weapon: 'halberd',
    abilities: { str: 16, dex: 13, con: 16, int: 13, wis: 14, cha: 12 },
    personality: 'Blunt, tired, straight. Says the true thing first and the polite thing afterwards, if there is time.',
    bio: 'She came west out of Rashemen with a spear and no Common and made Flame of the Seatower in nineteen years, which in the Flaming Fist has been done twice. She holds Gray Harbour, the harbour watch and the southern contract board, and she is one of perhaps four officers in the Fist who has never taken a coin at a gate. When the Fist\'s own business takes her out of the city she will march with you, and she will not pretend it is a favour to you.',
    colorway: cw('#d0a070', '#2a2018', '#4a4a3a', '#6a2a2a', '#3a3a44', '#c8ccd6', '#3a2a1a', '#a09c94', '#c8b06a'),
    appearance: look({ body: 'f', build: 'broad', skin: '#d0a070', hair: '#2a2018', hairStyle: 'braid', eye: '#4a4a3a', outfit: '#6a2a2a', outfitAlt: '#3a3a44', accent: '#c8b06a', metal: '#c8ccd6', outfitStyle: 'outfit-plate', cloakStyle: 'cloak-short' }),
    joinDialogue: 'imzel',
  }),

];

export default SOUTH_CAST;
