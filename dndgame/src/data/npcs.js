// data/npcs.js — the living cast of the Sword Coast: every named townsfolk of
// Phandalin, the travellers you meet on the Triboar Trail and the High Road, and
// the sellswords drinking at the Stonehill Inn and the Sleeping Giant who can be
// hired into the party.
//
// PURE DATA. Nothing here mutates, and the only import is the southern half of
// this same catalogue (see below). The catalogues are deep frozen;
// world/entity.js and ui/dialogue.js read them and clone what they need.
//
// Field contract (SPEC.md §3):
//   NPCS[id] = { id, name, role, sprite, colorway, map, x, y, dir, wander,
//                shop, dialogue, quests, faction, schedule }
//   RECRUITS  = [ { id, name, speciesId, lineageId, classId, subclassId,
//                   backgroundId, level, abilities, personality, cost, bio,
//                   colorway, appearance, joinDialogue, faction } ]
//
// Sprite families come from render/spritedata_chars.js:
//   npc-innkeeper npc-villager-m npc-villager-f npc-child npc-merchant npc-guard
//   npc-priest npc-miner npc-smith npc-thug npc-noble npc-farmer npc-dwarf
//   npc-elf npc-halfling npc-hooded  ·  dog cat chicken horse ox
//
// Setting note: every name here is either published Forgotten Realms canon or is
// built from the ethnic naming tables in docs/SETTING.md §5. Nothing is coined.
//
// The southern half of the game — the Trade Way, the Coast Way and the three
// cities that share the name Baldur's Gate — lives in `npcs_south.js` and is
// concatenated in below (§3, §4). The split is the same one `monsters.js` and
// `items.js` already use; the shape is identical either side of it.

import { SOUTH_CAST, SOUTH_RECRUITS } from './npcs_south.js';
import { EXTRA_CAST } from './npcs_extra.js';
import { LEGEND_CAST } from './legends.js';
import { BLACKSTAFF_CAST } from './blackstaff.js';

// ---------------------------------------------------------------------------
// deepFreeze — recursive Object.freeze for the exported catalogues (HARD RULE 8).
// ---------------------------------------------------------------------------
function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const k of Object.keys(o)) deepFreeze(o[k]);
  }
  return o;
}

// ---------------------------------------------------------------------------
// Builders. Small and pure. They exist so every entry is guaranteed the same
// shape — no optional field missing, no consumer forced to write `?.`.
// ---------------------------------------------------------------------------

/**
 * A colourway seed. render/sprites.js `makeColorway` derives every _D/_L shade
 * from these nine values, so one sprite grid serves the whole town.
 */
function cw(skin, hair, eye, main, alt, metal, leather, cloth, accent) {
  return { skin, hair, eye, main, alt, metal, leather, cloth, accent };
}

/** An NPC placed in the world. */
function npc(id, name, o = {}) {
  return {
    id,
    name,
    title: o.title || '',
    desc: o.desc || '',
    role: o.role || 'flavor',
    tag: o.tag || null,                       // finer type: 'child','animal','villain','traveller'
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
    hidden: !!o.hidden,                        // spawns only once `requires` is met
    requires: o.requires || null,              // flag or quest gate for spawning
    removedBy: o.removedBy || null,            // flag that despawns them
    voice: o.voice || 'plain',                 // hint for the typewriter cadence
  };
}

/** A hireable companion — a full character seed for rules/character.js. */
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
    background: o.backgroundId || 'soldier',   // alias: older callers read .background
    level: o.level || 1,
    abilities: o.abilities || { str: 13, dex: 13, con: 13, int: 11, wis: 11, cha: 10 },
    personality: o.personality || '',
    cost: o.cost != null ? o.cost : 50,
    bio: o.bio || '',
    colorway: o.colorway || cw('#e0a878', '#3a2416', '#4a3a2a', '#7a3030', '#2f4f7f', '#aab2c0', '#6b4a2a', '#c8b58a', '#e3b34a'),
    appearance: o.appearance || {},
    joinDialogue: o.joinDialogue || `recruit-${id}`,
    faction: o.faction || null,
    location: o.location || 'stonehill-inn',   // where they are found drinking
    deity: o.deity || null,
    weapon: o.weapon || null,                  // flavour: what they carry
    npcId: o.npcId || null,                    // if they also exist in NPCS
  };
}

/** Shorthand for an appearance seed; the fields render/actor.js actually reads. */
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

// ===========================================================================
// 1. PHANDALIN — the hub. Interiors are separate maps; the town square is
//    `phandalin`. Coordinates are tiles, 16 px each, x right / y down.
// ===========================================================================

const CAST = [

  // --- Stonehill Inn -------------------------------------------------------

  npc('toblen-stonehill', 'Toblen Stonehill', {
    title: 'Innkeeper of the Stonehill',
    desc: 'A worried, well-meaning Triboar man who came west for the mining boom and ended up pouring ale for it instead. He talks when he is nervous, and he is always nervous.',
    role: 'innkeep', species: 'human', sprite: 'npc-innkeeper', voice: 'anxious',
    colorway: cw('#e8bd95', '#7a5a2a', '#5a4a2a', '#8a5a2a', '#c8b58a', '#9a9aa4', '#6b4a2a', '#d8ccae', '#b08a3a'),
    map: 'stonehill-inn', x: 9, y: 6, dir: 'down', wander: 1,
    shop: 'stonehill-inn', dialogue: 'toblen', faction: null,
    quests: ['stonehill-cellar-rats', 'toblens-brother', 'pips-lost-cat'],
    greeting: 'Room and board, friend? Or just the ale?',
  }),

  npc('trilena-stonehill', 'Trilena Stonehill', {
    title: 'The Innkeeper\'s Wife',
    desc: 'Trilena runs the kitchen, the ledger and — everyone agrees — Toblen. She has an ear for every rumour that walks through the taproom door and a low opinion of most of them.',
    role: 'flavor', species: 'human', sprite: 'npc-villager-f', voice: 'dry',
    colorway: cw('#e8bd95', '#5a3a20', '#4a6a3a', '#5a7a4a', '#c8b58a', '#9a9aa4', '#7a5a34', '#d8ccae', '#a8823a'),
    map: 'stonehill-inn', x: 6, y: 9, dir: 'right', wander: 1,
    dialogue: 'trilena', quests: ['trilenas-market-list'],
  }),

  npc('pip-stonehill', 'Pip Stonehill', {
    title: 'Toblen\'s Boy',
    desc: 'Eight winters old, dirt to the elbows, and convinced that the Redbrands are the most exciting thing ever to happen to Phandalin. He is wrong, and he will learn it.',
    role: 'flavor', tag: 'child', species: 'human', sprite: 'npc-child', voice: 'eager',
    colorway: cw('#f6d5b4', '#a8823a', '#4a6a8a', '#4a6a8a', '#c8b58a', '#9a9aa4', '#6b4a2a', '#d8ccae', '#b04a2a'),
    map: 'stonehill-inn', x: 13, y: 11, dir: 'left', wander: 2,
    dialogue: 'pip', quests: ['pips-dare'],
  }),

  npc('stonehill-cat', 'Coppertail', {
    title: 'The Inn Cat',
    desc: 'A ginger tom who owns the hearthstone at the Stonehill and permits the Stonehills to live there. Pip loses him roughly once a tenday.',
    role: 'flavor', tag: 'animal', species: 'beast', sprite: 'cat',
    colorway: cw('#c07a3a', '#a8602a', '#6ac36a', '#c07a3a', '#a8602a', '#9a9aa4', '#6b4a2a', '#d8ccae', '#e3b34a'),
    map: 'stonehill-inn', x: 4, y: 4, dir: 'down', wander: 2, solid: false,
    dialogue: 'stonehill-cat',
  }),

  // --- Barthen's Provisions ------------------------------------------------

  npc('elmar-barthen', 'Elmar Barthen', {
    title: 'Master of Barthen\'s Provisions',
    desc: 'Lean, grey and endlessly patient, Barthen has outfitted every fool who ever walked east out of Phandalin. He extends credit to precisely nobody, and he liked Gundren Rockseeker.',
    role: 'shopkeeper', species: 'human', sprite: 'npc-merchant', voice: 'measured',
    colorway: cw('#e0a878', '#b8b0a4', '#5a5a4a', '#4a5a6a', '#a89878', '#9a9aa4', '#54381f', '#c8b58a', '#8a7a3a'),
    map: 'barthens-provisions', x: 8, y: 5, dir: 'down', wander: 0,
    shop: 'barthens-provisions', dialogue: 'elmar',
    quests: ['deliver-barthens-supplies', 'barthens-ledger', 'the-rockseeker-debt'],
    greeting: "Barthen's. Rope, rations, lamp oil, and no credit past a tenday.",
  }),

  npc('ander', 'Ander', {
    title: 'Clerk at Barthen\'s',
    desc: 'A gangly Illuskan lad of nineteen who can find any crate in the storeroom and no thought in his own head. He wants, desperately, to go adventuring.',
    role: 'flavor', species: 'human', sprite: 'npc-villager-m', voice: 'eager',
    colorway: cw('#f6d5b4', '#c8a860', '#4a6a8a', '#6a7a4a', '#a89878', '#9a9aa4', '#6b4a2a', '#c8b58a', '#8a7a3a'),
    map: 'barthens-provisions', x: 12, y: 8, dir: 'left', wander: 1,
    dialogue: 'ander-clerk', quests: ['anders-first-inventory'],
  }),

  npc('thistle', 'Thistle', {
    title: 'Clerk at Barthen\'s',
    desc: 'Half Ander\'s age in years and twice it in sense. Thistle keeps the map case, the ledger and a private list of everyone who has ever short-counted a coin here.',
    role: 'flavor', species: 'human', sprite: 'npc-villager-f', voice: 'dry',
    colorway: cw('#c98d5e', '#1c1410', '#3a3a3a', '#5a4a7a', '#a89878', '#9a9aa4', '#54381f', '#c8b58a', '#c0c6d0'),
    map: 'barthens-provisions', x: 5, y: 9, dir: 'right', wander: 1,
    dialogue: 'thistle', quests: ['thistles-cartography'],
  }),

  npc('barthen-ox', 'Nettle', {
    title: 'Barthen\'s Ox',
    desc: 'Two thousand pounds of patient beef standing in the yard, hitched to a wagon that has been to Neverwinter and back forty times.',
    role: 'flavor', tag: 'animal', species: 'beast', sprite: 'ox',
    colorway: cw('#8a7a6a', '#6a5a4a', '#3a2a1a', '#8a7a6a', '#6a5a4a', '#9a9aa4', '#6b4a2a', '#c8b58a', '#b08a3a'),
    map: 'phandalin', x: 21, y: 28, dir: 'left', wander: 0,
    dialogue: 'barthen-ox',
  }),

  // --- Lionshield Coster ---------------------------------------------------

  npc('linene-graywind', 'Linene Graywind', {
    title: 'Factor of the Lionshield Coster',
    desc: 'Linene runs the Coster branch the way a sergeant runs a wall: fast, blunt and without apology. Every blade on her rack bears the blue lion of Yartar, and she wants the stolen ones back.',
    role: 'shopkeeper', species: 'human', sprite: 'npc-merchant', voice: 'brisk',
    colorway: cw('#e0a878', '#5a3a20', '#4a6a3a', '#2f4f7f', '#c8b58a', '#c0c6d0', '#54381f', '#a89878', '#e3b34a'),
    map: 'lionshield-coster', x: 8, y: 6, dir: 'down', wander: 0,
    shop: 'lionshield-coster', dialogue: 'linene',
    quests: ['lionshield-stolen-goods', 'coster-caravan-escort', 'blue-lion-brand'],
    greeting: 'Blades and mail. Mind the stamp, and mind the price.',
  }),

  npc('coster-guard-dorn', 'Dorn Tallstag', {
    title: 'Coster Guard',
    desc: 'A Chondathan hire who stands inside the Coster door with a spear and a bored expression, and who has never once had to use the spear.',
    role: 'guard', species: 'human', sprite: 'npc-guard', voice: 'flat',
    colorway: cw('#e0a878', '#3a2416', '#4a3a2a', '#2f4f7f', '#7a6a4a', '#aab2c0', '#54381f', '#a89878', '#c0c6d0'),
    map: 'lionshield-coster', x: 13, y: 4, dir: 'left', wander: 0,
    dialogue: 'coster-guard-dorn', faction: 'lords-alliance',
  }),

  // --- Shrine of Luck ------------------------------------------------------

  npc('sister-garaele', 'Sister Garaele', {
    title: 'Priestess of Tymora',
    desc: 'A zealous young elf who keeps Tymora\'s shrine, blesses the wagons and does not mention the silver harp pin sewn inside her sleeve. Luck, she says, is spent — never saved.',
    role: 'priest', species: 'elf', sprite: 'npc-priest', voice: 'earnest',
    colorway: cw('#f6d5b4', '#d8d8e0', '#8a8a3a', '#e8e0d0', '#4a6a8a', '#c0c6d0', '#7a5a34', '#f4ece0', '#e3b34a'),
    map: 'shrine-of-luck', x: 8, y: 5, dir: 'down', wander: 0,
    shop: 'shrine-of-luck', dialogue: 'garaele', faction: 'harpers',
    quests: ['agathas-answer', 'shrine-offerings', 'harper-cipher'],
    greeting: 'Tymora smiles on those who move. What do you need for the road?',
  }),

  // --- Phandalin Miner's Exchange -----------------------------------------

  npc('halia-thornton', 'Halia Thornton', {
    title: 'Guildmaster of the Miner\'s Exchange',
    desc: 'Halia weighs ore, sets prices and quietly decides who prospers in Phandalin. She smiles a great deal. Somewhere behind that smile the Black Network keeps its books.',
    role: 'shopkeeper', species: 'human', sprite: 'npc-noble', voice: 'silken',
    colorway: cw('#e8bd95', '#1c1410', '#3a3a3a', '#4a2a5a', '#2a1a30', '#c8b06a', '#54381f', '#a89878', '#c8b06a'),
    map: 'miners-exchange', x: 9, y: 5, dir: 'down', wander: 0,
    shop: 'miners-exchange', dialogue: 'halia', faction: 'zhentarim',
    quests: ['glasstaffs-head', 'the-exchange-ledger', 'zhent-shipment'],
    greeting: 'Ore, gems, or something less easily weighed?',
  }),

  // --- Townmaster's Hall ---------------------------------------------------

  npc('harbin-wester', 'Harbin Wester', {
    title: 'Townmaster of Phandalin',
    desc: 'A soft, fussy banker who was given the town seal because nobody else wanted it. He posts bounties he has no intention of paying attention to and locks his shutters at dusk.',
    role: 'questgiver', species: 'human', sprite: 'npc-noble', voice: 'craven',
    colorway: cw('#f6d5b4', '#a8a8b0', '#5a5a4a', '#6a5a7a', '#c8b58a', '#c8b06a', '#54381f', '#d8ccae', '#c8b06a'),
    map: 'townmasters-hall', x: 8, y: 5, dir: 'down', wander: 0,
    dialogue: 'harbin', faction: 'lords-alliance',
    quests: ['wyvern-tor', 'townmasters-bounty', 'the-tax-rolls'],
    greeting: 'Yes, yes — the board is on the wall. Read it there, not at me.',
  }),

  npc('hall-guard-kerri', 'Kerri Amblecrown', {
    title: 'Town Guard',
    desc: 'One of the four townsfolk Harbin calls a garrison. She has a hauberk two sizes large and more nerve than the man who pays her.',
    role: 'guard', species: 'human', sprite: 'npc-guard', voice: 'flat',
    colorway: cw('#c98d5e', '#3a2416', '#4a3a2a', '#4a5a6a', '#7a6a4a', '#aab2c0', '#54381f', '#a89878', '#c0c6d0'),
    map: 'townmasters-hall', x: 12, y: 8, dir: 'left', wander: 0,
    dialogue: 'guard-kerri', faction: 'lords-alliance', quests: ['night-watch'],
  }),

  npc('gate-guard-stor', 'Stor Hornraven', {
    title: 'Gate Watch',
    desc: 'An old Illuskan spearman who watches the Triboar road out of Phandalin and keeps a tally of every wagon in a stick of chalk on the gatepost.',
    role: 'guard', species: 'human', sprite: 'npc-guard', voice: 'flat',
    colorway: cw('#f6d5b4', '#a8a8b0', '#4a6a8a', '#4a5a6a', '#7a6a4a', '#aab2c0', '#54381f', '#a89878', '#c0c6d0'),
    map: 'phandalin', x: 8, y: 20, dir: 'left', wander: 0,
    dialogue: 'guard-stor', faction: 'lords-alliance', quests: ['the-gate-tally'],
  }),

  // --- Edermath Orchard ----------------------------------------------------

  npc('daran-edermath', 'Daran Edermath', {
    title: 'Retired Marshal of the Gauntlet',
    desc: 'A half-elf of a hundred and some years with a soldier\'s shoulders and an orchardist\'s hands. He poured out his sword arm at Neverwinter and took up apples instead. Mostly.',
    role: 'questgiver', species: 'half-elf', sprite: 'npc-farmer', voice: 'warm',
    colorway: cw('#e0a878', '#b8b0a4', '#4a6a3a', '#4a6a3a', '#8a6a2a', '#c0c6d0', '#6b4a2a', '#c8b58a', '#e3b34a'),
    map: 'phandalin', x: 46, y: 12, dir: 'down', wander: 1,
    dialogue: 'daran', faction: 'gauntlet',
    quests: ['old-owl-well', 'orchard-blights', 'gauntlet-oath'],
    greeting: 'Mind the low branch. Sit, if you like — the bench is sound.',
  }),

  // --- Alderleaf Farm ------------------------------------------------------

  npc('qelline-alderleaf', 'Qelline Alderleaf', {
    title: 'Halfling Farmer',
    desc: 'Practical, unflappable and rather better informed than the townmaster. Qelline knows the druid Reidoth, keeps the best turnips in Phandalin, and believes gossip is a crop like any other.',
    role: 'questgiver', species: 'halfling', sprite: 'npc-halfling', voice: 'warm',
    colorway: cw('#e8bd95', '#5a3a20', '#4a6a3a', '#6a7a4a', '#a8823a', '#9a9aa4', '#7a5a34', '#d8ccae', '#b08a3a'),
    map: 'alderleaf-farm', x: 9, y: 7, dir: 'down', wander: 1,
    dialogue: 'qelline',
    quests: ['reidoths-whereabouts', 'alderleaf-harvest'],
  }),

  npc('carp-alderleaf', 'Carp Alderleaf', {
    title: 'Qelline\'s Son',
    desc: 'A halfling boy who has found a secret tunnel into Tresendar Manor and cannot decide whether to be terrified or immensely proud. He is both.',
    role: 'flavor', tag: 'child', species: 'halfling', sprite: 'npc-child', voice: 'eager',
    colorway: cw('#f6d5b4', '#a8823a', '#4a6a3a', '#5a7a4a', '#c8b58a', '#9a9aa4', '#6b4a2a', '#d8ccae', '#b04a2a'),
    map: 'alderleaf-farm', x: 14, y: 12, dir: 'left', wander: 2,
    dialogue: 'carp', quests: ['carps-secret-tunnel'],
  }),

  npc('alderleaf-hen', 'The Alderleaf Hens', {
    title: 'Poultry',
    desc: 'Six brown hens who patrol the Alderleaf yard with the confidence of creatures who have never once been eaten.',
    role: 'flavor', tag: 'animal', species: 'beast', sprite: 'chicken',
    colorway: cw('#c8a860', '#8a6a2a', '#c04a2a', '#c8a860', '#8a6a2a', '#9a9aa4', '#6b4a2a', '#d8ccae', '#c04a2a'),
    map: 'alderleaf-farm', x: 6, y: 14, dir: 'down', wander: 3, solid: false,
    dialogue: 'alderleaf-hen',
  }),

  // --- The Sleeping Giant --------------------------------------------------

  npc('grista', 'Grista', {
    title: 'Keeper of the Sleeping Giant',
    desc: 'A dwarf woman with forearms like mooring rope who serves sour ale to whoever is willing to drink it. She has never used four words where one would do.',
    role: 'innkeep', species: 'dwarf', sprite: 'npc-dwarf', voice: 'terse',
    colorway: cw('#c98d5e', '#8a2a2a', '#5a4a2a', '#4a3a2a', '#6b4a2a', '#9a8f80', '#54381f', '#a89878', '#8a7a3a'),
    map: 'sleeping-giant', x: 7, y: 5, dir: 'down', wander: 0,
    dialogue: 'grista', quests: ['sleeping-giant-brawl', 'gristas-stock'],
    greeting: 'Ale.',
  }),

  npc('veit-ungart', 'Veit Ungart', {
    title: 'A Dwarf in His Cups',
    desc: 'A Mirabar prospector who came south for the Phandelver strike, found nothing, and has been at the same corner table of the Sleeping Giant ever since.',
    role: 'flavor', species: 'dwarf', sprite: 'npc-dwarf', voice: 'slurred',
    colorway: cw('#e0a878', '#7a5a2a', '#4a6a3a', '#5a4a34', '#6b4a2a', '#9a8f80', '#54381f', '#a89878', '#b08a3a'),
    map: 'sleeping-giant', x: 13, y: 10, dir: 'left', wander: 0,
    dialogue: 'veit', quests: ['veits-debt'],
  }),

  npc('redbrand-bruiser', 'A Redbrand Bruiser', {
    title: 'Redbrand Ruffian',
    desc: 'A scarlet cloak, a short sword and a sneer that has never been answered. The Redbrands drink at the Sleeping Giant because nobody in Phandalin will make them stop.',
    role: 'guard', tag: 'villain', species: 'human', sprite: 'npc-thug', voice: 'sneering',
    colorway: cw('#e0a878', '#1c1410', '#3a3a3a', '#8a1a1a', '#3a2416', '#9a9aa4', '#54381f', '#7a6a4a', '#8a1a1a'),
    map: 'sleeping-giant', x: 11, y: 6, dir: 'down', wander: 1,
    dialogue: 'redbrand-bruiser', faction: 'redbrands',
    quests: ['redbrand-menace'], removedBy: 'redbrands-broken',
  }),

  npc('redbrand-lookout', 'A Redbrand Lookout', {
    title: 'Redbrand Ruffian',
    desc: 'He leans on the alley wall by the Sleeping Giant, counting strangers and pretending not to. His cloak is dyed the colour of a fresh cut.',
    role: 'guard', tag: 'villain', species: 'human', sprite: 'npc-thug', voice: 'sneering',
    colorway: cw('#c98d5e', '#3a2416', '#4a3a2a', '#8a1a1a', '#3a2416', '#9a9aa4', '#54381f', '#7a6a4a', '#8a1a1a'),
    map: 'phandalin', x: 30, y: 34, dir: 'left', wander: 1,
    dialogue: 'redbrand-lookout', faction: 'redbrands',
    quests: ['redbrand-menace'], removedBy: 'redbrands-broken',
  }),

  // --- The Dendrar family --------------------------------------------------

  npc('mirna-dendrar', 'Mirna Dendrar', {
    title: 'Widow of Phandalin',
    desc: 'The Redbrands hanged her husband Nars for objecting to them, and Mirna has not stopped moving since. She sells salt and lamp wicks out of a front room and grieves in the back one.',
    role: 'questgiver', species: 'human', sprite: 'npc-villager-f', voice: 'grieving',
    colorway: cw('#e0a878', '#3a2416', '#4a3a2a', '#3a3a4a', '#7a6a4a', '#9a9aa4', '#54381f', '#a89878', '#6a6a72'),
    map: 'phandalin', x: 27, y: 22, dir: 'down', wander: 1,
    dialogue: 'mirna', quests: ['dendrar-emerald-necklace', 'nars-grave'],
  }),

  npc('nilsa-dendrar', 'Nilsa Dendrar', {
    title: 'Mirna\'s Daughter',
    desc: 'Twelve, furious, and entirely out of tears. She has decided that when she is grown she will kill every Redbrand in Faerûn, and she means it.',
    role: 'flavor', tag: 'child', species: 'human', sprite: 'npc-child', voice: 'fierce',
    colorway: cw('#e8bd95', '#5a3a20', '#4a3a2a', '#5a4a6a', '#a89878', '#9a9aa4', '#6b4a2a', '#c8b58a', '#8a2a2a'),
    // Moved one tile west and one north when Barthen's Provisions grew to the
    // six-row footprint its 18x14 interior is the inside of: (29,23) is now
    // the shed's north-west corner. She still stands with her mother outside
    // the boarded Dendrar house.
    map: 'phandalin', x: 28, y: 22, dir: 'left', wander: 1,
    dialogue: 'nilsa', quests: ['nilsas-courage'],
  }),

  // --- The Lords' Alliance and the Rockseekers -----------------------------

  npc('sildar-hallwinter', 'Sildar Hallwinter', {
    title: 'Agent of the Lords\' Alliance',
    desc: 'A greying human warrior of Waterdeep, courteous to a fault, carrying a commission to restore order in Phandalin and find a wizard named Iarno Albrek. He is worth four of Harbin Wester.',
    role: 'questgiver', species: 'human', sprite: 'npc-guard', voice: 'soldierly',
    colorway: cw('#e0a878', '#b8b0a4', '#4a6a8a', '#4a5a6a', '#c8b58a', '#c0c6d0', '#54381f', '#a89878', '#c8b06a'),
    map: 'stonehill-inn', x: 5, y: 12, dir: 'right', wander: 0,
    dialogue: 'sildar', faction: 'lords-alliance',
    quests: ['iarno-albrek-missing', 'the-alliance-road', 'sildars-commission'],
    requires: 'sildar-rescued',
    greeting: 'Well met. Sit — I will buy the first round, I owe you that much.',
  }),

  npc('gundren-rockseeker', 'Gundren Rockseeker', {
    title: 'Shield Dwarf Prospector',
    desc: 'A shield dwarf with a beard like a briar and a map he will show nobody. He and his brothers Nundro and Tharden have found the old Phandelver mine, and Gundren cannot keep his mouth shut about how rich they are about to be.',
    role: 'questgiver', species: 'dwarf', sprite: 'npc-dwarf', voice: 'boisterous',
    colorway: cw('#e0a878', '#a8602a', '#4a6a3a', '#6a4a2a', '#8a6a2a', '#c8b06a', '#54381f', '#a89878', '#c8b06a'),
    map: 'phandalin', x: 24, y: 26, dir: 'down', wander: 0,
    dialogue: 'gundren', faction: 'lords-alliance',
    quests: ['rockseeker-brothers', 'wave-echo-cave'],
    requires: 'gundren-rescued',
  }),

  npc('nundro-rockseeker', 'Nundro Rockseeker', {
    title: 'Gundren\'s Brother',
    desc: 'The youngest Rockseeker, half-starved and chained in the dark of Wave Echo Cave by the Black Spider\'s people. He is still arguing about ore quality.',
    role: 'questgiver', species: 'dwarf', sprite: 'npc-dwarf', voice: 'hoarse',
    colorway: cw('#c98d5e', '#7a5a2a', '#4a6a3a', '#5a4a34', '#6b4a2a', '#9a8f80', '#54381f', '#8a7a6a', '#b08a3a'),
    map: 'wave-echo-cave-entrance', x: 12, y: 20, dir: 'down', wander: 0,
    dialogue: 'nundro', quests: ['nundros-rescue'], hidden: true, requires: 'wave-echo-entered',
  }),

  npc('droop', 'Droop', {
    title: 'A Goblin, Unemployed',
    desc: 'A small, bruised goblin who was the Cragmaw tribe\'s dogsbody and is now nobody\'s. He wants very badly to be useful to somebody who does not hit him.',
    role: 'flavor', species: 'goblin', sprite: 'npc-child', voice: 'cringing',
    colorway: cw('#7fbf6a', '#2a3a1a', '#c8b060', '#5a4a34', '#3a3a2a', '#9a9aa4', '#54381f', '#7a6a4a', '#8a7a3a'),
    map: 'phandalin', x: 33, y: 30, dir: 'down', wander: 1,
    dialogue: 'droop', quests: ['droops-freedom'], hidden: true, requires: 'droop-freed',
  }),

  // --- Phandalin townsfolk -------------------------------------------------

  npc('freda', 'Freda', {
    title: 'Prospector',
    desc: 'A weaver turned prospector who staked a claim in the foothills and has been washing gravel for two years to prove she was right to. She is nearly out of gravel and entirely out of savings.',
    role: 'flavor', species: 'human', sprite: 'npc-miner', voice: 'stubborn',
    colorway: cw('#c98d5e', '#5a3a20', '#4a3a2a', '#6a5a3a', '#7a6a4a', '#9a8f80', '#54381f', '#a89878', '#8a7a3a'),
    map: 'phandalin', x: 36, y: 26, dir: 'left', wander: 1,
    dialogue: 'freda', quests: ['fredas-claim'],
  }),

  npc('narth', 'Narth', {
    title: 'Farmer',
    desc: 'An old farmer who works the strip fields south of town, complains about the weather on principle, and has lately been losing scarecrows to something that walks at night.',
    role: 'flavor', species: 'human', sprite: 'npc-farmer', voice: 'grumbling',
    colorway: cw('#c98d5e', '#a8a8b0', '#4a5a3a', '#6a7a4a', '#a89878', '#9a9aa4', '#6b4a2a', '#c8b58a', '#8a7a3a'),
    map: 'phandalin', x: 18, y: 40, dir: 'right', wander: 1,
    dialogue: 'narth', quests: ['narths-scarecrows'],
  }),

  npc('favric', 'Favric', {
    title: 'Woodcutter',
    desc: 'A broad, cheerful man who cuts pine on the edge of the Sword Mountain foothills and will wager on absolutely anything, including how long this conversation lasts.',
    role: 'flavor', species: 'human', sprite: 'npc-villager-m', voice: 'jovial',
    colorway: cw('#e0a878', '#3a2416', '#4a6a3a', '#4a6a3a', '#7a6a4a', '#9a9aa4', '#6b4a2a', '#c8b58a', '#b08a3a'),
    map: 'phandalin', x: 15, y: 31, dir: 'down', wander: 2,
    dialogue: 'favric', quests: ['favrics-wager'],
  }),

  npc('mosk', 'Mosk', {
    title: 'Miner',
    desc: 'A quiet, soot-dark man who works the shallow diggings and sells what he finds to Halia Thornton at whatever price she names. He has stopped arguing about it.',
    role: 'flavor', species: 'human', sprite: 'npc-miner', voice: 'quiet',
    colorway: cw('#8a5734', '#1c1410', '#3a3a3a', '#4a4a52', '#6a5a4a', '#9a8f80', '#54381f', '#7a6a4a', '#8a7a3a'),
    map: 'phandalin', x: 39, y: 30, dir: 'up', wander: 1,
    dialogue: 'mosk', quests: ['mosks-pick'],
  }),

  npc('phandalin-stray', 'The Stray', {
    title: 'A Yellow Dog',
    desc: 'A lean yellow dog who belongs to the whole of Phandalin and to nobody, and who is at this moment carrying something in her mouth that she should not have.',
    role: 'flavor', tag: 'animal', species: 'beast', sprite: 'dog',
    colorway: cw('#c8a860', '#a8823a', '#5a4a2a', '#c8a860', '#a8823a', '#9a9aa4', '#6b4a2a', '#d8ccae', '#b08a3a'),
    map: 'phandalin', x: 26, y: 33, dir: 'down', wander: 3, solid: false,
    dialogue: 'phandalin-stray', quests: ['the-strays-bone'],
  }),

  npc('rowan-buckman', 'Rowan Buckman', {
    title: 'A Phandalin Child',
    desc: 'She is nine, she has a stick, and she is the terror of the town well. She has decided you are either a hero or a Redbrand and is watching to find out which.',
    role: 'flavor', tag: 'child', species: 'human', sprite: 'npc-child', voice: 'eager',
    colorway: cw('#e8bd95', '#a8602a', '#4a6a3a', '#7fbf6a', '#c8b58a', '#9a9aa4', '#6b4a2a', '#d8ccae', '#c04a2a'),
    map: 'phandalin', x: 25, y: 31, dir: 'right', wander: 3,
    dialogue: 'rowan',
  }),

  npc('bree-tealeaf', 'Bree Tealeaf', {
    title: 'A Halfling Child',
    desc: 'Carp Alderleaf\'s partner in crime, six inches shorter and considerably braver. She has already been in the tunnel. She is not going to say so.',
    role: 'flavor', tag: 'child', species: 'halfling', sprite: 'npc-child', voice: 'sly',
    colorway: cw('#f6d5b4', '#5a3a20', '#4a6a3a', '#8a6a2a', '#c8b58a', '#9a9aa4', '#6b4a2a', '#d8ccae', '#7fbf6a'),
    map: 'phandalin', x: 22, y: 35, dir: 'up', wander: 2,
    dialogue: 'bree',
  }),

  npc('iarno-albrek', 'Iarno Albrek', {
    title: 'Glasstaff',
    desc: 'The Lords\' Alliance sent a wizard to establish order in Phandalin. He established the Redbrands instead, and wears a glass staff to prove it.',
    role: 'questgiver', tag: 'villain', species: 'human', sprite: 'npc-hooded', voice: 'oily',
    colorway: cw('#e8bd95', '#3a2416', '#5a4a7a', '#4a2a5a', '#8a1a1a', '#c0c6d0', '#54381f', '#a89878', '#c0c6d0'),
    map: 'phandalin-manor', x: 14, y: 18, dir: 'down', wander: 0,
    dialogue: 'glasstaff', faction: 'redbrands', quests: ['glasstaff'], hidden: true,
  }),

  // ===========================================================================
  // 2. THE ROAD — travellers on the Triboar Trail and the High Road
  // ===========================================================================

  npc('ivor-marsk', 'Ivor Marsk', {
    title: 'Travelling Peddler',
    desc: 'A Damaran with a handcart, a bad knee and an inventory of things nobody in Phandalin knew they needed. He has walked the Triboar Trail eleven years and never once been robbed. He says.',
    role: 'shopkeeper', tag: 'traveller', species: 'human', sprite: 'npc-merchant', voice: 'wheedling',
    colorway: cw('#c98d5e', '#3a2416', '#4a3a2a', '#7a4a20', '#8a6a2a', '#9a9aa4', '#6b4a2a', '#c8b58a', '#b08a3a'),
    map: 'triboar-trail', x: 30, y: 14, dir: 'right', wander: 1,
    shop: 'barthens-provisions', dialogue: 'ivor', quests: ['peddlers-lost-wagon'],
  }),

  npc('ceidil-pashar', 'Ceidil Pashar', {
    title: 'Pilgrim of Ilmater',
    desc: 'A Calishite pilgrim walking from Waterdeep to the shrine at Leilon barefoot, which she insists is the point. She binds wounds for nothing and asks only for the news.',
    role: 'priest', tag: 'traveller', species: 'human', sprite: 'npc-priest', voice: 'serene',
    colorway: cw('#a86f45', '#1c1410', '#3a2a1a', '#8a8a90', '#d8ccae', '#9a9aa4', '#54381f', '#f4ece0', '#c0c6d0'),
    map: 'triboar-trail', x: 52, y: 18, dir: 'left', wander: 1,
    dialogue: 'ceidil', quests: ['pilgrims-road'],
  }),

  npc('evendur-greycastle', 'Evendur Greycastle', {
    title: 'Caravan Master',
    desc: 'Twenty years of hauling Waterdhavian goods up the High Road have left him with a squint, a limp and an absolute refusal to travel after dark.',
    role: 'questgiver', tag: 'traveller', species: 'human', sprite: 'npc-merchant', voice: 'gruff',
    colorway: cw('#e0a878', '#5a3a20', '#4a3a2a', '#4a4a52', '#8a6a2a', '#aab2c0', '#54381f', '#a89878', '#c8b06a'),
    map: 'triboar-trail', x: 12, y: 20, dir: 'right', wander: 0,
    dialogue: 'evendur', faction: 'lords-alliance', quests: ['caravan-to-triboar'],
  }),

  npc('taman-helder', 'Taman Helder', {
    title: 'Lionshield Teamster',
    desc: 'He drives the Coster wagons out of Yartar and has lost two of them on this road inside a season. Linene has words for him. He has better ones for the goblins.',
    role: 'flavor', tag: 'traveller', species: 'human', sprite: 'npc-villager-m', voice: 'sour',
    colorway: cw('#f6d5b4', '#a8823a', '#4a6a8a', '#2f4f7f', '#7a6a4a', '#9a9aa4', '#6b4a2a', '#a89878', '#e3b34a'),
    map: 'triboar-trail', x: 40, y: 9, dir: 'down', wander: 1,
    dialogue: 'taman', quests: ['teamsters-toll'],
  }),

  npc('milo-brushgather', 'Milo Brushgather', {
    title: 'Wandering Minstrel',
    desc: 'A halfling with a lute, a repertoire of ninety-one songs and a professional interest in whether anything worth a ballad ever happens in Phandalin.',
    role: 'flavor', tag: 'traveller', species: 'halfling', sprite: 'npc-halfling', voice: 'lyrical',
    colorway: cw('#e8bd95', '#a8602a', '#4a6a3a', '#5a3a6a', '#c8a860', '#c8b06a', '#7a5a34', '#d8ccae', '#e3b34a'),
    map: 'stonehill-inn', x: 16, y: 8, dir: 'left', wander: 1,
    dialogue: 'milo', quests: ['a-song-for-phandalin'],
  }),

  npc('silifrey-windrivver', 'Silifrey Windrivver', {
    title: 'Rider of the Alliance Post',
    desc: 'She carries dispatches between Leilon and Neverwinter at a gallop and has no time for anyone who is not also at a gallop.',
    role: 'questgiver', tag: 'traveller', species: 'human', sprite: 'npc-guard', voice: 'clipped',
    colorway: cw('#f6d5b4', '#c8a860', '#4a6a8a', '#2f4f7f', '#54381f', '#aab2c0', '#54381f', '#a89878', '#c0c6d0'),
    map: 'triboar-trail', x: 62, y: 12, dir: 'left', wander: 0,
    dialogue: 'silifrey', faction: 'lords-alliance', quests: ['leilon-dispatch'],
  }),

  npc('post-horse', 'Alliance Post Horse', {
    title: 'A Very Tired Mare',
    desc: 'She has run from Leilon since dawn and would like everyone involved to know it.',
    role: 'flavor', tag: 'animal', species: 'beast', sprite: 'horse',
    colorway: cw('#6a5a4a', '#3a2a1a', '#3a2a1a', '#6a5a4a', '#3a2a1a', '#9a9aa4', '#54381f', '#a89878', '#b08a3a'),
    map: 'triboar-trail', x: 63, y: 13, dir: 'left', wander: 0,
    dialogue: 'post-horse',
  }),

  // --- Neverwinter Wood and Thundertree ------------------------------------

  npc('reidoth', 'Reidoth', {
    title: 'Druid of Thundertree',
    desc: 'A weathered hermit who walks the ash of Thundertree keeping the ruin from spreading. He knows every path in Neverwinter Wood and disapproves of most of the people using them.',
    role: 'questgiver', species: 'human', sprite: 'npc-hooded', voice: 'flinty',
    colorway: cw('#c98d5e', '#a8a8b0', '#4a6a3a', '#3f6b3a', '#6a5a4a', '#9a8f80', '#54381f', '#a89878', '#7fbf6a'),
    map: 'neverwinter-wood', x: 28, y: 22, dir: 'down', wander: 1,
    dialogue: 'reidoth', faction: 'emerald-enclave',
    quests: ['thundertree-ruins', 'thundertree-blights', 'the-ash-and-the-wood'],
    greeting: 'You are loud. The wood does not thank you for it.',
  }),

  npc('agatha', 'Agatha', {
    title: 'The Banshee of Conyberry',
    desc: 'Once an elf of surpassing beauty; now a hanging cold in a grove outside ruined Conyberry. She will answer one question truthfully, if she is courted properly and not at all if she is not.',
    role: 'questgiver', tag: 'villain', species: 'undead', sprite: 'npc-hooded', voice: 'hollow',
    colorway: cw('#c0c6d0', '#e8e0d0', '#7fbfd0', '#3a4a5a', '#2a3a4a', '#c0c6d0', '#4a4a52', '#8a9aa8', '#7fbfd0'),
    map: 'conyberry-ruins', x: 20, y: 16, dir: 'down', wander: 0,
    dialogue: 'agatha', quests: ['agathas-answer'],
  }),

  npc('hamun-kost', 'Hamun Kost', {
    title: 'Red Wizard of Thay',
    desc: 'A Thayan necromancer poking at the Netherese ruin of Old Owl Well with a crew of skeletons and a great deal of confidence. He would rather bargain than fight, but only just.',
    role: 'questgiver', tag: 'villain', species: 'human', sprite: 'npc-hooded', voice: 'imperious',
    colorway: cw('#e8bd95', '#1c1410', '#8a2a2a', '#8a1a1a', '#2a1a1a', '#c8b06a', '#54381f', '#a89878', '#c8b06a'),
    map: 'triboar-trail', x: 70, y: 6, dir: 'down', wander: 0,
    dialogue: 'kost', quests: ['kosts-bargain', 'old-owl-well'], hidden: true, requires: 'old-owl-well-found',
  }),

  // --- Neverwinter ---------------------------------------------------------

  npc('general-sabine', 'General Sabine', {
    title: 'Commander of the Neverwinter Guard',
    desc: 'Dagult Neverember\'s iron hand in the Protector\'s Enclave. She has a city half-rebuilt, a treasury half-empty and no patience for adventurers who are only half-useful.',
    role: 'questgiver', species: 'human', sprite: 'npc-guard', voice: 'commanding',
    colorway: cw('#8a5734', '#1c1410', '#3a3a3a', '#2f4f7f', '#4a4a52', '#c0c6d0', '#54381f', '#a89878', '#c8b06a'),
    map: 'neverwinter', x: 30, y: 18, dir: 'down', wander: 0,
    dialogue: 'sabine', faction: 'lords-alliance', quests: ['protectors-enclave-patrol'],
  }),

  npc('esvele-dundragon', 'Esvele Dundragon', {
    title: 'Trader of the Protector\'s Enclave',
    desc: 'She sells to the rebuilding of Neverwinter and prices accordingly. Nothing on her stall came from farther away than she is willing to admit.',
    role: 'shopkeeper', species: 'human', sprite: 'npc-merchant', voice: 'brisk',
    colorway: cw('#e0a878', '#5a3a20', '#4a6a3a', '#2f6b6b', '#c8b58a', '#c8b06a', '#6b4a2a', '#d8ccae', '#c8b06a'),
    map: 'neverwinter', x: 22, y: 24, dir: 'down', wander: 0,
    shop: 'neverwinter-market', dialogue: 'esvele',
  }),

  // --- Waterdeep and the Yawning Portal ------------------------------------

  npc('durnan', 'Durnan', {
    title: 'Keeper of the Yawning Portal',
    desc: 'He went down into Undermountain once and came back rich, and has spent every year since pulling ale for people who intend to try the same. He does not talk about it.',
    role: 'innkeep', species: 'human', sprite: 'npc-innkeeper', voice: 'granite',
    colorway: cw('#e0a878', '#a8a8b0', '#4a3a2a', '#4a4a52', '#7a6a4a', '#9a9aa4', '#54381f', '#a89878', '#8a7a3a'),
    map: 'waterdeep', x: 20, y: 14, dir: 'down', wander: 0,
    shop: 'yawning-portal', dialogue: 'durnan',
    quests: ['the-yawning-portal', 'durnans-tab', 'descent-into-undermountain'],
    greeting: 'Two coppers the ale. One gold to go down the well. No refunds on either.',
  }),

  npc('volothamp-geddarm', 'Volothamp Geddarm', {
    title: 'Author, Allegedly',
    desc: 'Volo is writing a guide to the Sword Coast and requires eyewitnesses, preferably ones who survive. He will pay for a good story and haggle over a true one.',
    role: 'questgiver', species: 'human', sprite: 'npc-noble', voice: 'florid',
    colorway: cw('#e8bd95', '#3a2416', '#4a6a8a', '#5a3a6a', '#c8a860', '#c8b06a', '#6b4a2a', '#d8ccae', '#e3b34a'),
    map: 'waterdeep', x: 26, y: 17, dir: 'left', wander: 1,
    dialogue: 'volo', quests: ['volos-notes'],
  }),

  npc('mirt', 'Mirt', {
    title: 'The Moneylender',
    desc: 'A fat, wheezing old rogue in a stained doublet who is also a Lord of Waterdeep, a Harper, and rather more dangerous than he looks sitting down.',
    role: 'questgiver', species: 'human', sprite: 'npc-noble', voice: 'wheezing',
    colorway: cw('#e0a878', '#8a8a90', '#4a3a2a', '#6a5a3a', '#4a2a2a', '#c8b06a', '#54381f', '#a89878', '#c8b06a'),
    map: 'waterdeep', x: 15, y: 20, dir: 'right', wander: 0,
    dialogue: 'mirt', faction: 'harpers', quests: ['mirts-loan', 'the-long-road-south'],
  }),

  npc('zasheir-rein', 'Zasheir Rein', {
    title: 'Bazaar Trader of the Market Ward',
    desc: 'A Calishite trader with three stalls, four languages and an unwavering conviction that everything you own is worth less than he is offering.',
    role: 'shopkeeper', species: 'human', sprite: 'npc-merchant', voice: 'silken',
    colorway: cw('#a86f45', '#1c1410', '#3a2a1a', '#5a3a6a', '#c8a860', '#c8b06a', '#54381f', '#d8ccae', '#c8b06a'),
    map: 'waterdeep', x: 33, y: 22, dir: 'down', wander: 0,
    shop: 'waterdeep-bazaar', dialogue: 'zasheir',
  }),

  npc('halaster-blackcloak', 'Halaster Blackcloak', {
    title: 'The Mad Mage of Undermountain',
    desc: 'He is not here. He is never here. But every so often the stone speaks in a cracked old voice that knows your name, and the walls rearrange themselves out of spite.',
    role: 'flavor', tag: 'villain', species: 'human', sprite: 'npc-hooded', voice: 'mad',
    colorway: cw('#c0c6d0', '#d8d8e0', '#c04a2a', '#2a1a30', '#4a2a5a', '#c0c6d0', '#3a2a2a', '#5a4a6a', '#b07ae0'),
    map: 'undermountain', x: 0, y: 0, dir: 'down', wander: 0, solid: false,
    dialogue: 'halaster', hidden: true,
  }),
];

// ===========================================================================
// 3. THE CATALOGUE
// ===========================================================================

/** Every placed NPC in the game, keyed by id — the North, then the south. */
const ALL = CAST.concat(SOUTH_CAST, EXTRA_CAST, LEGEND_CAST, BLACKSTAFF_CAST);
export const NPCS = deepFreeze(Object.fromEntries(ALL.map((n) => [n.id, n])));
export const NPC_IDS = Object.freeze(Object.keys(NPCS));

// ===========================================================================
// 4. RECRUITS — the sellswords drinking at the Stonehill Inn and the Sleeping
//    Giant. Every class in the 2024 Player's Handbook is represented at least
//    twice, so a player can assemble any party they like out of this bench.
//
//    `abilities` are BASE scores, before the background's +2/+1 (2024 rules —
//    species grant no ability increases). rules/character.js applies the rest.
// ===========================================================================

export const RECRUITS = deepFreeze([

  // --- The named canon companions -----------------------------------------

  recruit('sildar-hallwinter', 'Sildar Hallwinter', {
    title: 'Agent of the Lords\' Alliance',
    speciesId: 'human', classId: 'fighter', subclassId: 'battle-master',
    backgroundId: 'soldier', level: 3, cost: 0, faction: 'lords-alliance',
    location: 'stonehill-inn', npcId: 'sildar-hallwinter', deity: 'Torm', weapon: 'longsword',
    abilities: { str: 15, dex: 12, con: 14, int: 11, wis: 13, cha: 13 },
    personality: 'Courteous, methodical, and quietly ashamed of how badly the Alliance misjudged Iarno Albrek.',
    bio: 'A Waterdhavian swordsman who served the Lords\' Alliance from the Sea Ward to Neverwinter and was sent east to see order restored in Phandalin. The goblins of the Cragmaw took him on the Triboar Trail and beat him for a tenday. He owes you his life and considers the debt a contract.',
    colorway: cw('#e0a878', '#b8b0a4', '#4a6a8a', '#4a5a6a', '#c8b58a', '#c0c6d0', '#54381f', '#a89878', '#c8b06a'),
    appearance: look({ body: 'm', build: 'broad', skin: '#e0a878', hair: '#b8b0a4', hairStyle: 'short', beard: 'stubble', eye: '#4a6a8a', outfit: '#4a5a6a', outfitAlt: '#c8b58a', accent: '#c8b06a', metal: '#c0c6d0', outfitStyle: 'outfit-chain', cloakStyle: 'cloak-short' }),
    joinDialogue: 'recruit-sildar',
  }),

  recruit('sister-garaele', 'Sister Garaele', {
    title: 'Priestess of Tymora',
    speciesId: 'elf', lineageId: 'high-elf', classId: 'cleric', subclassId: 'life',
    backgroundId: 'acolyte', level: 3, cost: 60, faction: 'harpers',
    location: 'shrine-of-luck', npcId: 'sister-garaele', deity: 'Tymora', weapon: 'mace',
    abilities: { str: 10, dex: 13, con: 13, int: 12, wis: 15, cha: 14 },
    personality: 'Earnest to the point of recklessness; keeps three secrets at all times and is bad at exactly one of them.',
    bio: 'A young sun elf who took Tymora\'s coin and, not long after, a silver harp pin from a Harper agent in Neverwinter. She keeps the Shrine of Luck, blesses the ore wagons, and sends quiet reports east about the Black Network\'s interest in Phandalin. She will walk with you if the road serves both her goddess and her other loyalty.',
    colorway: cw('#f6d5b4', '#d8d8e0', '#8a8a3a', '#e8e0d0', '#4a6a8a', '#c0c6d0', '#7a5a34', '#f4ece0', '#e3b34a'),
    appearance: look({ body: 'f', build: 'slim', skin: '#f6d5b4', hair: '#d8d8e0', hairStyle: 'braid', eye: '#8a8a3a', outfit: '#e8e0d0', outfitAlt: '#4a6a8a', accent: '#e3b34a', ears: 'pointed', outfitStyle: 'outfit-robe', cloakStyle: 'cloak-long' }),
    joinDialogue: 'recruit-garaele',
  }),

  recruit('daran-edermath', 'Daran Edermath', {
    title: 'Retired Marshal of the Gauntlet',
    speciesId: 'half-elf', classId: 'paladin', subclassId: 'devotion',
    backgroundId: 'soldier', level: 4, cost: 120, faction: 'gauntlet',
    location: 'phandalin', npcId: 'daran-edermath', deity: 'Torm', weapon: 'longsword',
    abilities: { str: 15, dex: 10, con: 14, int: 11, wis: 12, cha: 14 },
    personality: 'A warm, unhurried old soldier who has buried enough friends to be gentle about it.',
    bio: 'Half-elf, a hundred and some, and a Marshal of the Order of the Gauntlet in the years when Neverwinter burned. He hung up his mail after Mount Hotenow and planted apples on the eastern rise of Phandalin. The orchard has been good to him. Old Owl Well and the undead walking out of it have not.',
    colorway: cw('#e0a878', '#b8b0a4', '#4a6a3a', '#4a6a3a', '#8a6a2a', '#c0c6d0', '#6b4a2a', '#c8b58a', '#e3b34a'),
    appearance: look({ body: 'm', build: 'broad', skin: '#e0a878', hair: '#b8b0a4', hairStyle: 'short', beard: 'full', eye: '#4a6a3a', outfit: '#4a6a3a', outfitAlt: '#8a6a2a', accent: '#e3b34a', metal: '#c0c6d0', ears: 'pointed', outfitStyle: 'outfit-brigandine' }),
    joinDialogue: 'recruit-daran',
  }),

  recruit('reidoth', 'Reidoth', {
    title: 'Druid of the Emerald Enclave',
    speciesId: 'human', classId: 'druid', subclassId: 'land',
    backgroundId: 'hermit', level: 5, cost: 150, faction: 'emerald-enclave',
    location: 'neverwinter-wood', npcId: 'reidoth', deity: 'Silvanus', weapon: 'quarterstaff',
    abilities: { str: 11, dex: 13, con: 14, int: 13, wis: 15, cha: 9 },
    personality: 'Flinty, laconic, and openly of the opinion that most human problems are self-inflicted.',
    bio: 'He has kept the ash-choked ruin of Thundertree for thirty years, since Mount Hotenow blew and the Neverwinter Wood took the village back. The Emerald Enclave counts him a Summerstrider; he counts himself a man with a job. He will guide you through the pines, and he will make you carry your own water.',
    colorway: cw('#c98d5e', '#a8a8b0', '#4a6a3a', '#3f6b3a', '#6a5a4a', '#9a8f80', '#54381f', '#a89878', '#7fbf6a'),
    appearance: look({ body: 'm', build: 'slim', skin: '#c98d5e', hair: '#a8a8b0', hairStyle: 'long', beard: 'full', eye: '#4a6a3a', outfit: '#3f6b3a', outfitAlt: '#6a5a4a', accent: '#7fbf6a', outfitStyle: 'outfit-hide', cloakStyle: 'cloak-hooded' }),
    joinDialogue: 'recruit-reidoth',
  }),

  // --- The Stonehill Inn bench --------------------------------------------

  recruit('ander-brightwood', 'Ander Brightwood', {
    title: 'Trail Hunter',
    speciesId: 'human', classId: 'ranger', subclassId: 'hunter',
    backgroundId: 'guide', level: 2, cost: 45, faction: null,
    location: 'stonehill-inn', deity: 'Mielikki', weapon: 'longbow',
    abilities: { str: 12, dex: 15, con: 13, int: 10, wis: 14, cha: 10 },
    personality: 'Watchful, sparing with words, and constitutionally incapable of walking past an unread track.',
    bio: 'An Illuskan out of the Uthgardt country north of Neverwinter Wood, Ander has guided ore wagons down the Triboar Trail since he was fourteen. He has counted the goblin sign on the road doubling every tenday and cannot get the townmaster to look at his tally. He would rather be paid to shoot the problem than to describe it.',
    colorway: cw('#f6d5b4', '#c8a860', '#4a6a8a', '#3f6b3a', '#54381f', '#9a8f80', '#54381f', '#a89878', '#8a7a3a'),
    appearance: look({ body: 'm', build: 'slim', skin: '#f6d5b4', hair: '#c8a860', hairStyle: 'ponytail', beard: 'stubble', eye: '#4a6a8a', outfit: '#3f6b3a', outfitAlt: '#54381f', accent: '#8a7a3a', leather: '#54381f', outfitStyle: 'outfit-leather', cloakStyle: 'cloak-hooded' }),
    joinDialogue: 'recruit-ander-brightwood',
  }),

  recruit('eldeth-ironfist', 'Eldeth Ironfist', {
    title: 'Shield Dwarf Sellsword',
    speciesId: 'dwarf', classId: 'fighter', subclassId: 'champion',
    backgroundId: 'guard', level: 2, cost: 50, faction: null,
    location: 'stonehill-inn', deity: 'Moradin', weapon: 'battleaxe',
    abilities: { str: 15, dex: 11, con: 15, int: 10, wis: 12, cha: 9 },
    personality: 'Blunt as a hammer head, loyal past sense, and physically unable to leave a bar tab unsettled.',
    bio: 'Clan Ironfist out of Mirabar, come south with the Phandelver rush and stayed when the rush turned out to be a rumour with legs. She guarded ore wagons for the Lionshield Coster until goblins took the last one out from under her, which she takes personally. Her axe is honest and her rates are reasonable.',
    colorway: cw('#c98d5e', '#a8602a', '#4a6a3a', '#6a4a2a', '#8a6a2a', '#aab2c0', '#54381f', '#a89878', '#c8b06a'),
    appearance: look({ body: 'f', build: 'broad', skin: '#c98d5e', hair: '#a8602a', hairStyle: 'braid', beard: 'none', eye: '#4a6a3a', outfit: '#6a4a2a', outfitAlt: '#8a6a2a', accent: '#c8b06a', metal: '#aab2c0', outfitStyle: 'outfit-chain', height: 0.9 }),
    joinDialogue: 'recruit-eldeth',
  }),

  recruit('merric-tealeaf', 'Merric Tealeaf', {
    title: 'Lightfoot Halfling Burglar',
    speciesId: 'halfling', classId: 'rogue', subclassId: 'thief',
    backgroundId: 'criminal', level: 2, cost: 55, faction: null,
    location: 'stonehill-inn', deity: 'Yondalla', weapon: 'dagger',
    abilities: { str: 8, dex: 16, con: 12, int: 13, wis: 12, cha: 14 },
    personality: 'Cheerful, light-fingered, and firmly of the view that locks are a suggestion.',
    bio: 'A Tealeaf of the Delimbiyr valley who talked his way out of Daggerford, walked his way out of Waterdeep, and would very much like to keep walking. He picked Halia Thornton\'s strongbox on a dare and is now extremely interested in leaving Phandalin with a job attached.',
    colorway: cw('#e8bd95', '#5a3a20', '#4a6a3a', '#4a4a52', '#6b4a2a', '#9a9aa4', '#54381f', '#a89878', '#7fbf6a'),
    appearance: look({ body: 'm', build: 'slim', skin: '#e8bd95', hair: '#5a3a20', hairStyle: 'curly', eye: '#4a6a3a', outfit: '#4a4a52', outfitAlt: '#6b4a2a', accent: '#7fbf6a', outfitStyle: 'outfit-leather', cloakStyle: 'cloak-hooded', height: 0.85 }),
    joinDialogue: 'recruit-merric',
  }),

  recruit('adran-galanodel', 'Adran Galanodel', {
    title: 'Wood Elf Pathfinder',
    speciesId: 'elf', lineageId: 'wood-elf', classId: 'ranger', subclassId: 'gloom-stalker',
    backgroundId: 'wayfarer', level: 3, cost: 90, faction: 'emerald-enclave',
    location: 'stonehill-inn', deity: 'Mielikki', weapon: 'shortbow',
    abilities: { str: 11, dex: 16, con: 13, int: 11, wis: 14, cha: 10 },
    personality: 'Quiet, unnervingly still, and gone from the room before anyone notices he has left it.',
    bio: 'House Galanodel — Moonwhisper, in the Common tongue — keeps to the deep shade of Neverwinter Wood. Adran walked out of it when the twig blights came, following the ash south past Thundertree. The Emerald Enclave asked him to count what was moving in the dark. He has been counting for two years and does not like the total.',
    colorway: cw('#e8bd95', '#2a5a3a', '#c8b060', '#2f4a2f', '#3a2a1a', '#9a8f80', '#3a2a1a', '#7a8a6a', '#7fbf6a'),
    appearance: look({ body: 'm', build: 'slim', skin: '#e8bd95', hair: '#2a5a3a', hairStyle: 'long', eye: '#c8b060', outfit: '#2f4a2f', outfitAlt: '#3a2a1a', accent: '#7fbf6a', ears: 'pointed', outfitStyle: 'outfit-leather', cloakStyle: 'cloak-hooded' }),
    joinDialogue: 'recruit-adran',
  }),

  recruit('bardryn-battlehammer', 'Bardryn Battlehammer', {
    title: 'Battle-Priest of Moradin',
    speciesId: 'dwarf', classId: 'cleric', subclassId: 'war',
    backgroundId: 'acolyte', level: 3, cost: 85, faction: 'gauntlet',
    location: 'stonehill-inn', deity: 'Moradin', weapon: 'warhammer',
    abilities: { str: 14, dex: 9, con: 15, int: 10, wis: 15, cha: 12 },
    personality: 'Devout, gravel-voiced, and of the opinion that a prayer is best finished with a hammer.',
    bio: 'Of Clan Battlehammer out of Mithral Hall, sent west by her temple to see whether the Forge of Spells under Wave Echo Cave was myth or theft. Moradin\'s mark is burned into her palm and she shows it to anyone who asks twice. She wants the Phandelver mine reopened and she is not fussy about who helps her do it.',
    colorway: cw('#e0a878', '#8a6a2a', '#4a3a2a', '#7a3030', '#8a6a2a', '#c8b06a', '#54381f', '#c8b58a', '#c8b06a'),
    appearance: look({ body: 'f', build: 'broad', skin: '#e0a878', hair: '#8a6a2a', hairStyle: 'braid', eye: '#4a3a2a', outfit: '#7a3030', outfitAlt: '#8a6a2a', accent: '#c8b06a', metal: '#c8b06a', outfitStyle: 'outfit-scale', helmStyle: 'helm-cap', height: 0.9 }),
    joinDialogue: 'recruit-bardryn',
  }),

  recruit('jhessail-greycastle', 'Jhessail Greycastle', {
    title: 'Minstrel of the Sea Ward',
    speciesId: 'human', classId: 'bard', subclassId: 'lore',
    backgroundId: 'entertainer', level: 2, cost: 60, faction: 'harpers',
    location: 'stonehill-inn', deity: 'Milil', weapon: 'rapier',
    abilities: { str: 9, dex: 14, con: 12, int: 13, wis: 11, cha: 16 },
    personality: 'Charming, mercenary about applause, and secretly keeping a ledger of everything she overhears.',
    bio: 'A Waterdhavian singer who played the Sea Ward houses until a song about a certain Masked Lord made the city uncomfortable. She came north on a Lionshield wagon, and the silver harp she wears at her throat is not just an ornament — though she will tell you it is, sweetly, twice.',
    colorway: cw('#e0a878', '#3a2416', '#4a6a3a', '#5a3a6a', '#c8a860', '#c8b06a', '#6b4a2a', '#d8ccae', '#e3b34a'),
    appearance: look({ body: 'f', build: 'slim', skin: '#e0a878', hair: '#3a2416', hairStyle: 'long', eye: '#4a6a3a', outfit: '#5a3a6a', outfitAlt: '#c8a860', accent: '#e3b34a', outfitStyle: 'outfit-noble', cloakStyle: 'cloak-short' }),
    joinDialogue: 'recruit-jhessail',
  }),

  recruit('stedd-amblecrown', 'Stedd Amblecrown', {
    title: 'Dawnbringer of Lathander',
    speciesId: 'human', classId: 'cleric', subclassId: 'light',
    backgroundId: 'acolyte', level: 2, cost: 55, faction: 'gauntlet',
    location: 'stonehill-inn', deity: 'Lathander', weapon: 'mace',
    abilities: { str: 12, dex: 10, con: 14, int: 11, wis: 16, cha: 12 },
    personality: 'Relentlessly hopeful in a way that other people find either restorative or unbearable.',
    bio: 'Raised in the Morninglord\'s house at Leilon, Stedd walks the High Road relighting shrines the Mere of Dead Men has swallowed. He came inland to Phandalin because a farmer told him something had gone wrong at Old Owl Well and nobody else would go and look.',
    colorway: cw('#c98d5e', '#a8823a', '#4a6a8a', '#c8a860', '#e8e0d0', '#c8b06a', '#6b4a2a', '#f4ece0', '#e3b34a'),
    appearance: look({ body: 'm', build: 'normal', skin: '#c98d5e', hair: '#a8823a', hairStyle: 'short', eye: '#4a6a8a', outfit: '#c8a860', outfitAlt: '#e8e0d0', accent: '#e3b34a', outfitStyle: 'outfit-robe' }),
    joinDialogue: 'recruit-stedd',
  }),

  recruit('quelenna-amastacia', 'Quelenna Amastacia', {
    title: 'Evoker of the Protector\'s Enclave',
    speciesId: 'elf', lineageId: 'high-elf', classId: 'wizard', subclassId: 'evoker',
    backgroundId: 'sage', level: 3, cost: 95, faction: 'lords-alliance',
    location: 'stonehill-inn', deity: 'Mystra', weapon: 'quarterstaff',
    abilities: { str: 8, dex: 14, con: 12, int: 16, wis: 12, cha: 11 },
    personality: 'Precise, impatient with imprecision, and delighted by explosions she has correctly predicted.',
    bio: 'Amastacia — Starflower — is a moon elf house with two centuries of grievances in Neverwinter and a standing seat among the magists of the Protector\'s Enclave. Quelenna came east to measure the Weave over Wave Echo Cave, where the old spellforge is supposed to have burned. She needs bodyguards; she has budget.',
    colorway: cw('#f6d5b4', '#2a3a5a', '#7fbfd0', '#2f4f7f', '#c0c6d0', '#c0c6d0', '#54381f', '#d8ccae', '#7fbfd0'),
    appearance: look({ body: 'f', build: 'slim', skin: '#f6d5b4', hair: '#2a3a5a', hairStyle: 'long', eye: '#7fbfd0', outfit: '#2f4f7f', outfitAlt: '#c0c6d0', accent: '#7fbfd0', ears: 'pointed', outfitStyle: 'outfit-robe', helmStyle: 'helm-circlet' }),
    joinDialogue: 'recruit-quelenna',
  }),

  recruit('thava-daardendrian', 'Thava Daardendrian', {
    title: 'Oathsworn of the Ancients',
    speciesId: 'dragonborn', lineageId: 'gold-dragon', classId: 'paladin', subclassId: 'ancients',
    backgroundId: 'noble', level: 4, cost: 130, faction: 'emerald-enclave',
    location: 'stonehill-inn', deity: 'Bahamut', weapon: 'greatsword',
    abilities: { str: 16, dex: 10, con: 14, int: 10, wis: 11, cha: 15 },
    personality: 'Formal, generous, and entirely serious about a code that everyone around her finds inconvenient.',
    bio: 'Clan Daardendrian keeps its honour in a ledger and Thava is the daughter sent to balance it. She swore the Ancient Oath in the Ardeep Forest and has walked north ever since, burning cult shrines out of the Kryptgarden margins. She will not take coin for saving a life, but she will take it for a road.',
    colorway: cw('#c8a860', '#c8a860', '#c04a2a', '#c8b06a', '#4a3a2a', '#c8b06a', '#6b4a2a', '#d8ccae', '#e3b34a'),
    appearance: look({ body: 'f', build: 'broad', skin: '#c8a860', hair: '#c8a860', hairStyle: 'bald', eye: '#c04a2a', outfit: '#c8b06a', outfitAlt: '#4a3a2a', accent: '#e3b34a', metal: '#c8b06a', horns: 'crown', hornColor: '#c8a860', tail: 'scaled', outfitStyle: 'outfit-half-plate' }),
    joinDialogue: 'recruit-thava',
  }),

  recruit('seven-thundercloud', 'Seven Thundercloud', {
    title: 'Tabaxi Wanderer',
    speciesId: 'tabaxi', classId: 'monk', subclassId: 'open-hand',
    backgroundId: 'wayfarer', level: 3, cost: 80, faction: null,
    location: 'stonehill-inn', deity: 'Selûne', weapon: 'quarterstaff',
    abilities: { str: 12, dex: 16, con: 13, int: 10, wis: 15, cha: 11 },
    personality: 'Curious about everything for exactly as long as it stays interesting, which is never very long.',
    bio: 'Off a Maztican trader that put in at Waterdeep and never quite got round to leaving. Seven Thundercloud walks the Sword Coast collecting stories the way other people collect coin, and has decided that whatever is under Phandalin is the best story currently available. Feed her and she will follow you anywhere.',
    colorway: cw('#c8a860', '#8a6a2a', '#7fbf6a', '#7a4a20', '#c8b58a', '#9a9aa4', '#6b4a2a', '#d8ccae', '#7fbf6a'),
    appearance: look({ body: 'f', build: 'slim', skin: '#c8a860', hair: '#8a6a2a', hairStyle: 'wild', eye: '#7fbf6a', outfit: '#7a4a20', outfitAlt: '#c8b58a', accent: '#7fbf6a', ears: 'cat', tail: 'cat', outfitStyle: 'outfit-monk' }),
    joinDialogue: 'recruit-seven',
  }),

  recruit('nyx-nackle', 'Nyx Nackle', {
    title: 'Rock Gnome Wild Sorcerer',
    speciesId: 'gnome', lineageId: 'rock-gnome', classId: 'sorcerer', subclassId: 'wild-magic',
    backgroundId: 'artisan', level: 3, cost: 75, faction: null,
    location: 'stonehill-inn', deity: 'Garl Glittergold', weapon: 'dagger',
    abilities: { str: 8, dex: 13, con: 14, int: 14, wis: 10, cha: 16 },
    personality: 'Delighted, alarming, and completely honest about the fact that she does not know what will happen next.',
    bio: 'Clan Nackle of the Neverwinter clockmakers, until an experiment with a Netherese resonator in the Blacklake District rearranged the shop, the street and Nyx. Magic comes out of her sideways now. The Zhentarim have offered to buy her twice; she has said no twice, loudly, and left town.',
    colorway: cw('#f6d5b4', '#c04a2a', '#4a6a3a', '#5a3a6a', '#c8a860', '#c8b06a', '#6b4a2a', '#d8ccae', '#b07ae0'),
    appearance: look({ body: 'f', build: 'slim', skin: '#f6d5b4', hair: '#c04a2a', hairStyle: 'wild', eye: '#4a6a3a', outfit: '#5a3a6a', outfitAlt: '#c8a860', accent: '#b07ae0', outfitStyle: 'outfit-tunic', height: 0.8 }),
    joinDialogue: 'recruit-nyx',
  }),

  // --- The Sleeping Giant bench -------------------------------------------

  recruit('lo-kag', 'Lo-Kag', {
    title: 'Goliath Sellsword',
    speciesId: 'goliath', lineageId: 'stone-giant', classId: 'barbarian', subclassId: 'berserker',
    backgroundId: 'soldier', level: 3, cost: 85, faction: null,
    location: 'sleeping-giant', deity: 'Tempus', weapon: 'greataxe',
    abilities: { str: 17, dex: 13, con: 15, int: 8, wis: 12, cha: 9 },
    personality: 'Speaks rarely, laughs at bad odds, and keeps a scrupulous mental tally of favours owed both ways.',
    bio: 'Came down out of the Spine of the World with a stone-giant\'s patience and a temper underneath it. Lo-Kag fought for the Uthgardt against the orcs of Many-Arrows, then for coin from Mirabar to Yartar. He drinks at the Sleeping Giant because the name amuses him and the ale is cheap.',
    colorway: cw('#8a9aa8', '#3a3a3a', '#c0c6d0', '#54381f', '#4a4a52', '#9a8f80', '#54381f', '#8a7a6a', '#c0c6d0'),
    appearance: look({ body: 'm', build: 'broad', skin: '#8a9aa8', hair: '#3a3a3a', hairStyle: 'topknot', eye: '#c0c6d0', outfit: '#54381f', outfitAlt: '#4a4a52', accent: '#c0c6d0', outfitStyle: 'outfit-hide', height: 1.1 }),
    joinDialogue: 'recruit-lo-kag',
  }),

  recruit('nala', 'Nala', {
    title: 'Dragonborn Sorcerer',
    speciesId: 'dragonborn', lineageId: 'white-dragon', classId: 'sorcerer', subclassId: 'draconic',
    backgroundId: 'charlatan', level: 3, cost: 80, faction: null,
    location: 'sleeping-giant', deity: 'Tiamat', weapon: 'dagger',
    abilities: { str: 11, dex: 13, con: 15, int: 11, wis: 10, cha: 16 },
    personality: 'Cold, funny, and thoroughly aware that people find her frightening — she has stopped correcting them.',
    bio: 'Hatched in the high passes below Icespire Peak, where the white wyrm Cryovain hunts, and raised by nobody in particular. Nala found the frost in her blood answered when she was angry, which was often. She sells that talent by the tenday and has a private, unfinished argument with the dragon that shares her ancestry.',
    colorway: cw('#c8d8e0', '#c8d8e0', '#7fbfd0', '#3a4a5a', '#c0c6d0', '#c0c6d0', '#4a4a52', '#8a9aa8', '#7fbfd0'),
    appearance: look({ body: 'f', build: 'normal', skin: '#c8d8e0', hair: '#c8d8e0', hairStyle: 'bald', eye: '#7fbfd0', outfit: '#3a4a5a', outfitAlt: '#c0c6d0', accent: '#7fbfd0', horns: 'straight', hornColor: '#c8d8e0', tail: 'scaled', outfitStyle: 'outfit-robe', cloakStyle: 'cloak-long' }),
    joinDialogue: 'recruit-nala',
  }),

  recruit('damaia', 'Damaia', {
    title: 'Warlock of the Nine Hells',
    speciesId: 'tiefling', lineageId: 'infernal', classId: 'warlock', subclassId: 'fiend',
    backgroundId: 'charlatan', level: 3, cost: 90, faction: 'zhentarim',
    location: 'sleeping-giant', deity: 'Asmodeus', weapon: 'dagger',
    abilities: { str: 9, dex: 14, con: 14, int: 12, wis: 10, cha: 16 },
    personality: 'Wry, transactional, and extremely clear that every arrangement she makes has a price written somewhere.',
    bio: 'Born in the Dock Ward of Waterdeep to a mother who had signed something she should not have. Damaia inherited the debt and, eventually, negotiated better terms. The Black Network finds her useful and she finds the Black Network solvent. She is in Phandalin because Halia Thornton sent for someone with her particular skills.',
    colorway: cw('#b04a2a', '#1c1410', '#c04a2a', '#4a2a5a', '#2a1a30', '#c8b06a', '#3a2a2a', '#7a6a6a', '#c04a2a'),
    appearance: look({ body: 'f', build: 'slim', skin: '#b04a2a', hair: '#1c1410', hairStyle: 'long', eye: '#c04a2a', outfit: '#4a2a5a', outfitAlt: '#2a1a30', accent: '#c04a2a', horns: 'curved', hornColor: '#3a2a2a', tail: 'thin', outfitStyle: 'outfit-leather', cloakStyle: 'cloak-hooded' }),
    joinDialogue: 'recruit-damaia',
  }),

  recruit('krusk', 'Krusk', {
    title: 'Half-Orc Berserker',
    speciesId: 'half-orc', classId: 'barbarian', subclassId: 'wild-heart',
    backgroundId: 'wayfarer', level: 3, cost: 70, faction: null,
    location: 'sleeping-giant', deity: 'Malar', weapon: 'greataxe',
    abilities: { str: 16, dex: 14, con: 15, int: 8, wis: 13, cha: 8 },
    personality: 'Watchful in a room, terrifying out of it, and unexpectedly kind to animals and children.',
    bio: 'Born on the wrong side of a Many-Arrows raid and raised by a Uthgardt hunting band that never quite decided whether he was one of them. Krusk hunts the things that hunt travellers, mostly for free, and takes the coin afterwards so that people do not feel indebted. He does not talk about the tribe.',
    colorway: cw('#7a8a5a', '#1c1410', '#c8b060', '#54381f', '#4a4a52', '#9a8f80', '#54381f', '#8a7a6a', '#8a2a2a'),
    appearance: look({ body: 'm', build: 'broad', skin: '#7a8a5a', hair: '#1c1410', hairStyle: 'mohawk', eye: '#c8b060', outfit: '#54381f', outfitAlt: '#4a4a52', accent: '#8a2a2a', outfitStyle: 'outfit-hide' }),
    joinDialogue: 'recruit-krusk',
  }),

  recruit('iados', 'Iados', {
    title: 'Knife of the Black Network',
    speciesId: 'tiefling', lineageId: 'abyssal', classId: 'rogue', subclassId: 'assassin',
    backgroundId: 'criminal', level: 3, cost: 100, faction: 'zhentarim',
    location: 'sleeping-giant', deity: 'Mask', weapon: 'shortsword',
    abilities: { str: 10, dex: 16, con: 13, int: 14, wis: 12, cha: 11 },
    personality: 'Silent, exact, and entirely without the flourish that other people expect of his profession.',
    bio: 'The Zhentarim keep a house in Yartar where children with the wrong blood are given work instead of pity. Iados was very good at the work. He is in Phandalin on a contract he will not discuss, and he is bored enough to consider other offers while he waits.',
    colorway: cw('#7a3a5a', '#2a1a30', '#7fbf6a', '#2a2a30', '#4a2a5a', '#9a9aa4', '#3a2a2a', '#5a4a5a', '#7fbf6a'),
    appearance: look({ body: 'm', build: 'slim', skin: '#7a3a5a', hair: '#2a1a30', hairStyle: 'short', eye: '#7fbf6a', outfit: '#2a2a30', outfitAlt: '#4a2a5a', accent: '#7fbf6a', horns: 'ram', hornColor: '#2a1a30', tail: 'tufted', outfitStyle: 'outfit-studded', cloakStyle: 'cloak-hooded' }),
    joinDialogue: 'recruit-iados',
  }),

  recruit('vadania-liadon', 'Vadania Liadon', {
    title: 'Circle of the Moon',
    speciesId: 'elf', lineageId: 'wood-elf', classId: 'druid', subclassId: 'moon',
    backgroundId: 'hermit', level: 4, cost: 110, faction: 'emerald-enclave',
    location: 'sleeping-giant', deity: 'Mielikki', weapon: 'quarterstaff',
    abilities: { str: 11, dex: 14, con: 14, int: 11, wis: 16, cha: 10 },
    personality: 'Barely domesticated. She holds a conversation the way a wolf holds a doorway.',
    bio: 'Liadon — Silverfrond — of the Kryptgarden margins, where the green wyrm Claugiyliamatar keeps her wood. Vadania has spent forty years learning the shapes of the things that live in it. The Emerald Enclave calls her Autumnreaver; the woodcutters of Phandalin call her something less polite and stay out of the treeline.',
    colorway: cw('#c8a860', '#4a3a2a', '#c8b060', '#3f6b3a', '#54381f', '#9a8f80', '#54381f', '#8a9a7a', '#7fbf6a'),
    appearance: look({ body: 'f', build: 'slim', skin: '#c8a860', hair: '#4a3a2a', hairStyle: 'braid', eye: '#c8b060', outfit: '#3f6b3a', outfitAlt: '#54381f', accent: '#7fbf6a', ears: 'pointed', outfitStyle: 'outfit-hide', cloakStyle: 'cloak-long' }),
    joinDialogue: 'recruit-vadania',
  }),

  recruit('kethra-stormwind', 'Kethra Stormwind', {
    title: 'Blade of the Weave',
    speciesId: 'human', classId: 'fighter', subclassId: 'eldritch-knight',
    backgroundId: 'soldier', level: 4, cost: 125, faction: 'lords-alliance',
    location: 'sleeping-giant', deity: 'Tempus', weapon: 'longsword',
    abilities: { str: 15, dex: 13, con: 14, int: 14, wis: 10, cha: 10 },
    personality: 'Disciplined to the edge of joyless, but the joy is in there and it comes out in a fight.',
    bio: 'Illuskan, Neverwintan, and one of the few who held the wall at the Chasm when Mount Hotenow blew. The magists taught her enough of the Weave to bind it to a sword; the Wall taught her the rest. She left the city guard when the Enclave took her patrol and Neverember would not send relief.',
    colorway: cw('#f6d5b4', '#a8a8b0', '#4a6a8a', '#3a3a5a', '#6a6a72', '#aab2c0', '#54381f', '#a89878', '#7fbfd0'),
    appearance: look({ body: 'f', build: 'normal', skin: '#f6d5b4', hair: '#a8a8b0', hairStyle: 'ponytail', eye: '#4a6a8a', outfit: '#3a3a5a', outfitAlt: '#6a6a72', accent: '#7fbfd0', metal: '#aab2c0', outfitStyle: 'outfit-brigandine', cloakStyle: 'cloak-short' }),
    joinDialogue: 'recruit-kethra',
  }),

  recruit('burgell-timbers', 'Burgell Timbers', {
    title: 'Forest Gnome Illusionist',
    speciesId: 'gnome', lineageId: 'forest-gnome', classId: 'wizard', subclassId: 'illusionist',
    backgroundId: 'scribe', level: 3, cost: 80, faction: 'harpers',
    location: 'sleeping-giant', deity: 'Baravar Cloakshadow', weapon: 'quarterstaff',
    abilities: { str: 8, dex: 14, con: 12, int: 16, wis: 13, cha: 11 },
    personality: 'Twinkling, deeply nosy, and a much better liar than his round face suggests.',
    bio: 'Clan Timbers keeps a burrow-library on the western edge of Neverwinter Wood — the sort of place Reidoth knows about and nobody else does. Burgell copies and files what the Harpers bring him. He came to Phandalin to see who was buying the old Netherese fragments out of Old Owl Well, and stayed for the ale.',
    colorway: cw('#e8bd95', '#7a5a2a', '#4a6a3a', '#3f6b3a', '#8a6a2a', '#9a9aa4', '#6b4a2a', '#d8ccae', '#7fbf6a'),
    appearance: look({ body: 'm', build: 'slim', skin: '#e8bd95', hair: '#7a5a2a', hairStyle: 'wild', beard: 'full', eye: '#4a6a3a', outfit: '#3f6b3a', outfitAlt: '#8a6a2a', accent: '#7fbf6a', outfitStyle: 'outfit-robe', helmStyle: 'helm-wizard', height: 0.8 }),
    joinDialogue: 'recruit-burgell',
  }),

  recruit('shautha', 'Shautha', {
    title: 'Pactbound of the Green Court',
    speciesId: 'orc', classId: 'warlock', subclassId: 'archfey',
    backgroundId: 'hermit', level: 3, cost: 85, faction: 'emerald-enclave',
    location: 'sleeping-giant', deity: 'Mielikki', weapon: 'spear',
    abilities: { str: 14, dex: 12, con: 15, int: 10, wis: 12, cha: 16 },
    personality: 'Grave, formal and slightly out of step with the room, as if half of her is listening to something else.',
    bio: 'Left in Neverwinter Wood as a foundling when a Many-Arrows raid went badly, and taken up by something in the deep green that never gave a name. Shautha keeps its bargains and its boundaries. The Emerald Enclave will not quite claim her, but they will not turn her away either.',
    colorway: cw('#7a9a6a', '#2a3a2a', '#7fbf6a', '#2f4a2f', '#54381f', '#9a8f80', '#54381f', '#8a9a7a', '#b07ae0'),
    appearance: look({ body: 'f', build: 'broad', skin: '#7a9a6a', hair: '#2a3a2a', hairStyle: 'braid', eye: '#7fbf6a', outfit: '#2f4a2f', outfitAlt: '#54381f', accent: '#b07ae0', outfitStyle: 'outfit-hide', cloakStyle: 'cloak-long' }),
    joinDialogue: 'recruit-shautha',
  }),

  recruit('anton-marivaldi', 'Anton Marivaldi', {
    title: 'Shadow of the Long Death',
    speciesId: 'human', classId: 'monk', subclassId: 'shadow',
    backgroundId: 'criminal', level: 3, cost: 95, faction: null,
    location: 'sleeping-giant', deity: 'Shar', weapon: 'shortsword',
    abilities: { str: 12, dex: 16, con: 13, int: 11, wis: 15, cha: 9 },
    personality: 'Still, courteous and unreadable; the only tell is that he never sits with his back to a door.',
    bio: 'Turami, out of Calimport by way of a monastery in the Marsh of Chelimber that does not advertise its name. Anton walked away from it and has been walking north ever since. He is not running from the order — they simply have not decided yet whether to send anyone.',
    colorway: cw('#6b4227', '#1c1410', '#3a3a3a', '#2a2a30', '#4a4a52', '#9a9aa4', '#3a2a2a', '#6a6a72', '#c0c6d0'),
    appearance: look({ body: 'm', build: 'slim', skin: '#6b4227', hair: '#1c1410', hairStyle: 'shaved', eye: '#3a3a3a', outfit: '#2a2a30', outfitAlt: '#4a4a52', accent: '#c0c6d0', outfitStyle: 'outfit-monk', cloakStyle: 'cloak-hooded' }),
    joinDialogue: 'recruit-anton',
  }),

  recruit('bree-goodbarrel', 'Bree Goodbarrel', {
    title: 'College of Valour',
    speciesId: 'halfling', classId: 'bard', subclassId: 'valor',
    backgroundId: 'sailor', level: 3, cost: 85, faction: 'lords-alliance',
    location: 'sleeping-giant', deity: 'Lliira', weapon: 'shortsword',
    abilities: { str: 10, dex: 15, con: 13, int: 12, wis: 11, cha: 16 },
    personality: 'Loud, brave in the way that gets songs written, and unable to let a stupid boast pass unanswered.',
    bio: 'Goodbarrel of Luiren, but four generations off the boat and thoroughly a creature of Neverwinter\'s docks. Bree shipped out of the Bay on a Lords\' Alliance escort, learned every marching song between here and Baldur\'s Gate, and came inland when the ships stopped paying. She wants a verse of her own.',
    colorway: cw('#e0a878', '#c04a2a', '#4a6a8a', '#8a1a1a', '#c8a860', '#aab2c0', '#54381f', '#d8ccae', '#e3b34a'),
    appearance: look({ body: 'f', build: 'normal', skin: '#e0a878', hair: '#c04a2a', hairStyle: 'curly', eye: '#4a6a8a', outfit: '#8a1a1a', outfitAlt: '#c8a860', accent: '#e3b34a', metal: '#aab2c0', outfitStyle: 'outfit-studded', height: 0.85 }),
    joinDialogue: 'recruit-bree',
  }),

  recruit('kara-bersk', 'Kara Bersk', {
    title: 'Aasimar of the Radiant Soul',
    speciesId: 'aasimar', lineageId: 'inner-radiance', classId: 'paladin', subclassId: 'glory',
    backgroundId: 'guard', level: 4, cost: 135, faction: 'gauntlet',
    location: 'stonehill-inn', deity: 'Lathander', weapon: 'warhammer',
    abilities: { str: 16, dex: 10, con: 14, int: 10, wis: 12, cha: 15 },
    personality: 'Burns hot. Believes that a good deed done quietly is a good deed wasted, and is working on that.',
    bio: 'A Damaran guardswoman of Leilon who took a spear through the lung defending the High Road shrine and got up again with light coming out of the wound. The Order of the Gauntlet found her three days later, still standing watch. She has been a Whitehawk ever since and is looking for whatever is raising the dead at Old Owl Well.',
    colorway: cw('#f6d5b4', '#e8e0d0', '#c8b060', '#c8b06a', '#e8e0d0', '#c8b06a', '#6b4a2a', '#f4ece0', '#e3b34a'),
    appearance: look({ body: 'f', build: 'broad', skin: '#f6d5b4', hair: '#e8e0d0', hairStyle: 'ponytail', eye: '#c8b060', outfit: '#c8b06a', outfitAlt: '#e8e0d0', accent: '#e3b34a', metal: '#c8b06a', outfitStyle: 'outfit-half-plate', cloakStyle: 'cloak-short' }),
    joinDialogue: 'recruit-kara',
  }),

  recruit('orsik-loderr', 'Orsik Loderr', {
    title: 'Delver of the Deep Roads',
    speciesId: 'dwarf', classId: 'rogue', subclassId: 'arcane-trickster',
    backgroundId: 'criminal', level: 3, cost: 90, faction: 'zhentarim',
    location: 'sleeping-giant', deity: 'Dumathoin', weapon: 'hand-crossbow',
    abilities: { str: 10, dex: 16, con: 14, int: 14, wis: 11, cha: 10 },
    personality: 'Suspicious of daylight, generous with information he has already sold once, and never wrong about a wall.',
    bio: 'Clan Loderr of Gauntlgrym, which is a thing very few dwarves can still say. Orsik went down the deep roads for the Black Network, came up alone, and has not gone back. He can read a worked stone the way a scribe reads a page, and he is the only person in Phandalin who has actually stood inside Wave Echo Cave.',
    colorway: cw('#c98d5e', '#4a3a2a', '#4a3a2a', '#2a2a30', '#4a4a52', '#9a9aa4', '#3a2a2a', '#6a6a72', '#c8b06a'),
    appearance: look({ body: 'm', build: 'broad', skin: '#c98d5e', hair: '#4a3a2a', hairStyle: 'short', beard: 'braided', eye: '#4a3a2a', outfit: '#2a2a30', outfitAlt: '#4a4a52', accent: '#c8b06a', outfitStyle: 'outfit-studded', cloakStyle: 'cloak-hooded', height: 0.9 }),
    joinDialogue: 'recruit-orsik',
  }),

  recruit('mishann-kepeshkmolik', 'Mishann Kepeshkmolik', {
    title: 'Tempest of the Sword Coast',
    speciesId: 'dragonborn', lineageId: 'blue-dragon', classId: 'cleric', subclassId: 'tempest',
    backgroundId: 'sailor', level: 3, cost: 90, faction: 'lords-alliance',
    location: 'stonehill-inn', deity: 'Talos', weapon: 'trident',
    abilities: { str: 14, dex: 10, con: 14, int: 10, wis: 16, cha: 12 },
    personality: 'Storm-tempered — flat calm for hours and then, without warning, entirely weather.',
    bio: 'Kepeshkmolik keeps ships out of Baldur\'s Gate and Mishann sailed them until a squall off the Mere of Dead Men took the crew and left her. She reads that as a message and has been arguing with the Storm Lord about its meaning ever since. Lightning answers when she calls; she has stopped pretending she is surprised.',
    colorway: cw('#4a6a9a', '#4a6a9a', '#c8b060', '#2f4f7f', '#c0c6d0', '#aab2c0', '#54381f', '#8a9aa8', '#7fbfd0'),
    appearance: look({ body: 'f', build: 'normal', skin: '#4a6a9a', hair: '#4a6a9a', hairStyle: 'bald', eye: '#c8b060', outfit: '#2f4f7f', outfitAlt: '#c0c6d0', accent: '#7fbfd0', horns: 'straight', hornColor: '#4a6a9a', tail: 'scaled', outfitStyle: 'outfit-scale' }),
    joinDialogue: 'recruit-mishann',
  }),

  recruit('gauthak', 'Gauthak', {
    title: 'Goliath Way of the Elements',
    speciesId: 'goliath', lineageId: 'storm-giant', classId: 'monk', subclassId: 'elements',
    backgroundId: 'guide', level: 4, cost: 115, faction: null,
    location: 'sleeping-giant', deity: 'Tempus', weapon: 'quarterstaff',
    abilities: { str: 14, dex: 16, con: 14, int: 10, wis: 15, cha: 8 },
    personality: 'Speaks in short declaratives, treats every day as a test he has volunteered for, and never complains about weather.',
    bio: 'Of a clan that keeps the high shelves under Icespire Peak, where the air is thin enough to teach a person how to breathe properly. Gauthak came down the mountain the year Cryovain took his hunting ground and has been working his way toward being able to go back up it.',
    colorway: cw('#8a9aa8', '#2a3a4a', '#7fbfd0', '#3a4a5a', '#54381f', '#9a8f80', '#54381f', '#8a7a6a', '#7fbfd0'),
    appearance: look({ body: 'm', build: 'broad', skin: '#8a9aa8', hair: '#2a3a4a', hairStyle: 'topknot', eye: '#7fbfd0', outfit: '#3a4a5a', outfitAlt: '#54381f', accent: '#7fbfd0', outfitStyle: 'outfit-monk', height: 1.1 }),
    joinDialogue: 'recruit-gauthak',
  }),

  recruit('yasheira-basha', 'Yasheira Basha', {
    title: 'Diviner of Calimshan',
    speciesId: 'human', classId: 'wizard', subclassId: 'diviner',
    backgroundId: 'sage', level: 4, cost: 120, faction: 'harpers',
    location: 'stonehill-inn', deity: 'Savras', weapon: 'quarterstaff',
    abilities: { str: 8, dex: 13, con: 13, int: 17, wis: 14, cha: 10 },
    personality: 'Speaks in a slow, considering way, as though checking each sentence against a copy she has already read.',
    bio: 'Trained in the observatories of Calimport, where Savras is still named aloud, and driven north by a prophecy she declines to repeat. Yasheira has been in Phandalin eleven days and has already told Sister Garaele three things about the Redbrands that Sister Garaele had not told anyone.',
    colorway: cw('#a86f45', '#1c1410', '#3a2a1a', '#2f4f7f', '#c8a860', '#c8b06a', '#54381f', '#d8ccae', '#b07ae0'),
    appearance: look({ body: 'f', build: 'slim', skin: '#a86f45', hair: '#1c1410', hairStyle: 'long', eye: '#3a2a1a', outfit: '#2f4f7f', outfitAlt: '#c8a860', accent: '#b07ae0', outfitStyle: 'outfit-robe', helmStyle: 'helm-circlet' }),
    joinDialogue: 'recruit-yasheira',
  }),

  recruit('grigor-shemov', 'Grigor Shemov', {
    title: 'Zealot of the Battle-Lord',
    speciesId: 'human', classId: 'barbarian', subclassId: 'zealot',
    backgroundId: 'farmer', level: 3, cost: 70, faction: 'gauntlet',
    location: 'sleeping-giant', deity: 'Tempus', weapon: 'maul',
    abilities: { str: 17, dex: 12, con: 15, int: 9, wis: 12, cha: 10 },
    personality: 'Slow to anger and impossible to stop once he has arrived there. Prays before every fight, out loud, badly.',
    bio: 'A Damaran ploughman from the Goldenfields who put down the plough when a gnoll warband came through and did not put it back up. Tempus, he insists, was in the barn with him that morning. The Order of the Gauntlet has stopped arguing about the theology and started paying him.',
    colorway: cw('#e0a878', '#5a3a20', '#4a6a3a', '#7a3030', '#54381f', '#9a8f80', '#54381f', '#a89878', '#8a2a2a'),
    appearance: look({ body: 'm', build: 'broad', skin: '#e0a878', hair: '#5a3a20', hairStyle: 'wild', beard: 'full', eye: '#4a6a3a', outfit: '#7a3030', outfitAlt: '#54381f', accent: '#8a2a2a', outfitStyle: 'outfit-hide' }),
    joinDialogue: 'recruit-grigor',
  }),

  recruit('naivara-siannodel', 'Naivara Siannodel', {
    title: 'Beast Master of the Moonbrook',
    speciesId: 'elf', lineageId: 'wood-elf', classId: 'ranger', subclassId: 'beast-master',
    backgroundId: 'guide', level: 3, cost: 95, faction: 'emerald-enclave',
    location: 'stonehill-inn', deity: 'Mielikki', weapon: 'longbow',
    abilities: { str: 11, dex: 16, con: 13, int: 11, wis: 15, cha: 11 },
    personality: 'Gentle with everything that has fur and impatient with almost everything that does not.',
    bio: 'Siannodel of the Moonbrook, raised where the High Forest thins toward the Dessarin. Naivara walks with a grey wolf that answers to no name at all and objects strongly to being called a pet. She came west following the blight-sickness out of Thundertree, and Reidoth vouches for her, which is nearly unheard of.',
    colorway: cw('#e8bd95', '#5a3a20', '#4a6a3a', '#4a5a3a', '#54381f', '#9a8f80', '#54381f', '#8a9a7a', '#7fbf6a'),
    appearance: look({ body: 'f', build: 'slim', skin: '#e8bd95', hair: '#5a3a20', hairStyle: 'ponytail', eye: '#4a6a3a', outfit: '#4a5a3a', outfitAlt: '#54381f', accent: '#7fbf6a', ears: 'pointed', outfitStyle: 'outfit-leather', cloakStyle: 'cloak-long' }),
    joinDialogue: 'recruit-naivara',
  }),

  recruit('leucis', 'Leucis', {
    title: 'Pact of the Great Old One',
    speciesId: 'tiefling', lineageId: 'chthonic', classId: 'warlock', subclassId: 'great-old-one',
    backgroundId: 'hermit', level: 4, cost: 115, faction: null,
    location: 'sleeping-giant', deity: 'Oghma', weapon: 'quarterstaff',
    abilities: { str: 9, dex: 13, con: 14, int: 14, wis: 12, cha: 16 },
    personality: 'Calm, apologetic, and prone to answering a question about ten seconds before it is asked.',
    bio: 'A scribe of Oghma\'s house in Waterdeep who read something in the deep stacks that read him back. Leucis has been useful ever since and has not slept properly in six years. He is going down into Undermountain because the thing in his head is very interested in what Halaster keeps there, and he would rather supervise.',
    colorway: cw('#8a7a8a', '#2a2a3a', '#c0c6d0', '#3a3a4a', '#2a2a30', '#9a9aa4', '#3a2a2a', '#6a6a72', '#b07ae0'),
    appearance: look({ body: 'm', build: 'slim', skin: '#8a7a8a', hair: '#2a2a3a', hairStyle: 'long', eye: '#c0c6d0', outfit: '#3a3a4a', outfitAlt: '#2a2a30', accent: '#b07ae0', horns: 'straight', hornColor: '#2a2a3a', tail: 'thin', outfitStyle: 'outfit-robe', cloakStyle: 'cloak-hooded' }),
    joinDialogue: 'recruit-leucis',
  }),

  // --- the southern bench: Baldur's Gate and the roads to it ---------------
  ...SOUTH_RECRUITS,
]);

// ===========================================================================
// 5. HELPERS — small, pure, and the only logic this module is allowed.
// ===========================================================================

/** Look up a placed NPC. */
export function getNPC(id) { return NPCS[id] || null; }

/** Display name for an NPC id, falling back to the id itself. */
export function npcName(id) { return NPCS[id]?.name || id; }

/** Everyone standing on a given map. */
export function npcsOnMap(mapId) {
  return NPC_IDS.filter((id) => NPCS[id].map === mapId).map((id) => NPCS[id]);
}

/** Everyone who spawns on a map right now, honouring `hidden`/`requires`. */
export function spawnableOnMap(mapId, flagFn) {
  const ok = typeof flagFn === 'function' ? flagFn : () => false;
  return npcsOnMap(mapId).filter((n) => {
    if (n.removedBy && ok(n.removedBy)) return false;
    if (n.hidden || n.requires) return n.requires ? !!ok(n.requires) : false;
    return true;
  });
}

/** Everyone sworn to a faction. */
export function npcsByFaction(faction) {
  return NPC_IDS.filter((id) => NPCS[id].faction === faction).map((id) => NPCS[id]);
}

/** Every shopkeeper, for the shop scene's "who sells this" lookup. */
export function shopkeepers() {
  return NPC_IDS.filter((id) => NPCS[id].shop).map((id) => NPCS[id]);
}

/** The NPC who runs a shop id, if any. */
export function keeperOfShop(shopId) {
  return NPC_IDS.map((id) => NPCS[id]).find((n) => n.shop === shopId) || null;
}

/** Every NPC who can start or turn in a given quest. */
export function npcsForQuest(questId) {
  return NPC_IDS.filter((id) => (NPCS[id].quests || []).includes(questId)).map((id) => NPCS[id]);
}

/** Look up a hireable companion. */
export function getRecruit(id) { return RECRUITS.find((r) => r.id === id) || null; }

/** The bench drinking at a particular tavern or standing in a particular place. */
export function recruitsAt(location) { return RECRUITS.filter((r) => r.location === location); }

/** Everyone of a given class, for "I need a healer" party planning. */
export function recruitsByClass(classId) { return RECRUITS.filter((r) => r.classId === classId); }

/** Everyone a faction will vouch for. */
export function recruitsByFaction(faction) { return RECRUITS.filter((r) => r.faction === faction); }

/** Recruits the party can currently afford, cheapest first. */
export function affordableRecruits(gold) {
  return RECRUITS.filter((r) => (r.cost || 0) <= gold).slice().sort((a, b) => a.cost - b.cost);
}

/** Every class id present on the bench — used by the roster screen's filters. */
export function recruitClassIds() {
  return Array.from(new Set(RECRUITS.map((r) => r.classId))).sort();
}

export function npcCount() { return NPC_IDS.length; }
export function recruitCount() { return RECRUITS.length; }
