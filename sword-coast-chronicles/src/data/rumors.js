// data/rumors.js — what people say: rumour templates for the world's events, the party's own deeds, the lairs out in the hills and the powers shifting in each town, plus who would plausibly know which.
//
// PURE DATA, deep frozen. rules/worlddirector.js turns these into the lines a
// given NPC actually says (`rumorsFor(st, npc)`). The canon taproom lines in
// data/tables.js RUMORS remain the "static" pool and are read alongside these.
//
// Every template may use {tokens}; the director fills them from the event's
// vars, the deed, or the place. Each family comes in three registers:
//   true         what happened, as a local would put it
//   exaggerated  what happened, improved in the telling (bigger, worse, closer)
//   false        a wrong version: the wrong place, the wrong culprit, a hoard that is not there
// A false rumour never reveals a site or offers work; an Insight check can
// tell the teller's own confidence, which is not the same as the truth.

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const k of Object.keys(o)) deepFreeze(o[k]);
  }
  return o;
}

// ===========================================================================
// 1. WHO KNOWS WHAT
//
// `kinds` weights the families a person draws from; `reach` is how far their
// news travels ('local' = their own town, 'region' = its region and roads,
// 'far' = anything on the Coast); `lie` is how often they pass on a false one
// (innkeepers hear everything and believe half of it; guards repeat orders).
// ===========================================================================

function knows(kinds, reach, lie, o = {}) { return { kinds, reach, lie, tags: o.tags || null, count: o.count || 2 }; }

export const KNOWLEDGE = deepFreeze({
  innkeep: knows({ event: 3, deed: 3, site: 2, faction: 2, trade: 1, static: 2, festival: 1 }, 'far', 0.2, { count: 3 }),
  shopkeeper: knows({ trade: 3, event: 2, faction: 1, deed: 1, static: 1 }, 'region', 0.15, { tags: ['caravan', 'trade', 'raid', 'harvest', 'grain', 'flood', 'bandits', 'livestock'] }),
  smith: knows({ trade: 2, event: 2, deed: 1, faction: 1 }, 'region', 0.15, { tags: ['raid', 'orcs', 'war', 'caravan', 'trade', 'dragon'] }),
  guard: knows({ event: 3, deed: 2, faction: 2, site: 1 }, 'region', 0.1, { tags: ['raid', 'bounty', 'outlaw', 'skirmish', 'cult', 'orcs', 'goblin', 'bandits', 'zhentarim'] }),
  priest: knows({ event: 3, deed: 2, festival: 2, site: 1, static: 1 }, 'region', 0.1, { tags: ['sickness', 'undead', 'cult', 'barrows', 'medicine', 'priest', 'thay', 'dark'] }),
  questgiver: knows({ faction: 3, event: 2, site: 2, deed: 1 }, 'far', 0.1),
  noble: knows({ faction: 3, event: 2, trade: 1, deed: 1 }, 'far', 0.2, { tags: ['nobles', 'intrigue', 'politics', 'wedding', 'zhentarim', 'lords-alliance', 'trade'] }),
  wizard: knows({ site: 3, event: 2, static: 1 }, 'far', 0.1, { tags: ['dark', 'dragon', 'cult', 'thay', 'undead', 'mere'] }),
  flavor: knows({ static: 3, event: 2, deed: 2, festival: 2, site: 1 }, 'local', 0.3),
  child: knows({ deed: 2, static: 2, site: 2, festival: 1 }, 'local', 0.45),
  traveller: knows({ event: 3, site: 2, deed: 2, trade: 1 }, 'far', 0.25),
  villain: knows({ faction: 2, deed: 2, event: 1 }, 'region', 0.6),
});

/** Ways into a rumour, so a crowd of speakers does not share one mouth. */
export const OPENERS = deepFreeze({
  true: ['', 'Word is ', 'A carter told me ', 'You\'ll have heard? ', 'It\'s all over town: '],
  exaggerated: ['You won\'t believe it, but ', 'I had it from a man who was there: ', 'Swear on Tymora — ', 'They\'re saying '],
  false: ['Mark my words: ', 'Everyone knows ', 'I had it from my cousin: ', 'Don\'t repeat this, but '],
});

/** What a successful Wisdom (Insight) check tells you about the teller. */
export const INSIGHT = deepFreeze({
  true: ['They believe every word, and they have it from someone who was there.', 'Plainly told. They are not selling it; they are worried by it.'],
  exaggerated: ['They believe it, but it has grown in the telling — the bones are true, the size is not.', 'They are enjoying this far too much for all of it to be so.'],
  false: ['They believe it, but they are repeating it third-hand and cannot say who first said it.', 'There is nothing behind their eyes but the pleasure of a good story. Weigh it lightly.'],
  lie: ['They are watching you to see whether you believe it. Whoever benefits from this story, it is not you.'],
});

// ===========================================================================
// 2. EVENT RUMOURS — keyed by event template id, then stage id ('*' = any)
// ===========================================================================

export const EVENT_RUMORS = deepFreeze({
  'goblin-raid': {
    sign: {
      true: ['goblins have been cutting fences along the Triboar Trail. That is how the Cragmaw start — they look first.'],
      exaggerated: ['there are a hundred goblins in the hills above the Trail, painting their faces for war.'],
      false: ['the goblin sign on the Trail is the Redbrands\' doing, to frighten the farmers into selling.'],
    },
    raids: {
      true: ['the Cragmaw hit {farm} last night and drove off the sheep. Harbin\'s paying for goblins now, if you\'ve the stomach.'],
      exaggerated: ['the goblins burned {farm} to the ground and ate the dog. They\'ll be in the town square by the next moon.'],
      false: ['the raiders on the Trail are orcs, not goblins — Many-Arrows orcs, come all the way down from the north.'],
    },
  },
  'caravan-missing': {
    '*': {
      true: ['{master}\'s wagons never came in from Neverwinter. They were carrying {goods}, and somebody knew it.'],
      exaggerated: ['{master}\'s whole train went into the ground on the Triboar Trail — wagons, oxen and all, not a hoofprint left.'],
      false: ['{master} sold the wagons in Neverwinter and ran off with the money. Always had a shifty look.', '{master}\'s caravan turned north into Neverwinter Wood to dodge the toll. Nobody comes out of there.'],
    },
  },
  'caravan-run': {
    announced: {
      true: ['the Alliance is sending silver up the Trail to Neverwinter. Sildar Hallwinter is hiring outriders.'],
      exaggerated: ['there\'s a king\'s ransom in silver going up the Triboar Trail, and only three old men guarding it.'],
      false: ['the silver wagons are a trick — there\'s nothing in them but stones, and the real silver went by night.'],
    },
    road: {
      true: ['the silver wagons are out on the Trail now, and the Sleeping Giant knew the day they left before the drivers did.'],
      exaggerated: ['half the Black Network is waiting on the Trail for the silver wagons. It will be a massacre.'],
      false: ['the silver wagons went the long way, by the High Road. Nobody will see them on the Trail at all.'],
    },
  },
  sickness: {
    '*': {
      true: ['there\'s cackle fever in the miners\' camp. Garaele needs feverfew from the Wood and has nobody to fetch it.'],
      exaggerated: ['half the miners are dead of a laughing plague and the other half are laughing. Stay out of the camp.'],
      false: ['the fever came in on the Zhentarim\'s ore wagons. Halia Thornton is poisoning the claims to buy them cheap.'],
    },
  },
  'bounty-posted': {
    '*': {
      true: ['the Townmaster has put a price on {outlaw}. Robbed three wagons on the Trail and killed a carter.'],
      exaggerated: ['{outlaw} has killed a dozen men on the Trail and wears their teeth on a string.'],
      false: ['{outlaw} is really a Lords\' Alliance agent, and the bounty is a cover. Nobody will ever collect.'],
    },
  },
  'orchard-blight': {
    '*': {
      true: ['something is clawing at Daran Edermath\'s apple trees at night. Twigs, he says. Twigs that walk.'],
      exaggerated: ['the whole of Neverwinter Wood is walking toward Phandalin, one tree at a time.'],
      false: ['Daran\'s orchard is being hacked by the Alderleaf boy for a dare. He\'s too proud to say so.'],
    },
  },
  'orc-warband': {
    smoke: {
      true: ['there\'s smoke over the hills east of Conyberry. Orcs out of Many-Arrows, under a chief called {chief}.'],
      exaggerated: ['all of Many-Arrows is coming south. {chief} has sworn to water his wolves in the Phandalin well.'],
      false: ['the smoke east of Conyberry is the Uthgardt burning their dead. Nothing to do with us.'],
    },
    raids: {
      true: ['{chief}\'s orcs burned two steadings east of Conyberry. Sildar Hallwinter wants the warband broken.'],
      exaggerated: ['{chief} is eight feet tall and has a dragon\'s tooth for an axe.'],
      false: ['the orcs are camped at the Wave Echo cave mouth, waiting for the dwarves.'],
    },
  },
  'dragon-sighting': {
    sighting: {
      true: ['a white dragon was seen over Icespire Peak. The herders call it Cryovain.'],
      exaggerated: ['a white dragon the size of the Townmaster\'s Hall flew over Phandalin last night and froze the well solid.'],
      false: ['the dragon over Icespire is Venomfang, out of Thundertree, and it is green, not white. My cousin saw it.'],
    },
    hunting: {
      true: ['Cryovain is taking sheep off the high pastures above Wave Echo Cave. A shepherd is missing.'],
      exaggerated: ['Cryovain has eaten a whole family of herders, and the hut with them.'],
      false: ['the Zhentarim have tamed the white dragon. They send it after anyone who won\'t sell them a claim.'],
    },
  },
  'orcs-at-wyvern-tor': {
    '*': {
      true: ['there are orcs camped at Wyvern Tor, east past Conyberry, taking a toll of cattle off the drovers.'],
      exaggerated: ['the orcs at Wyvern Tor have an ogre on a chain and use it to wave the drovers through.'],
      false: ['the orcs at Wyvern Tor are only a few hungry goblins, and the drovers are cheating their masters.'],
    },
  },
  'noble-wedding': {
    '*': {
      true: ['{bride} of House {houseA} is marrying {groom} of House {houseB}. Silk is dearer in Waterdeep than silver.'],
      exaggerated: ['the {houseA} wedding will feed ten thousand, and every Masked Lord will be there under a different mask.'],
      false: ['the {houseA}–{houseB} match is off. {bride} ran away to Baldur\'s Gate with a sailor.'],
    },
    preparations: {
      true: ['somebody means to spoil the {houseA}–{houseB} wedding, and Mirt is asking quiet questions about it.'],
      exaggerated: ['there is a plot to poison the whole {houseA}–{houseB} wedding party with the cake.'],
      false: ['House {houseB} is paying the Xanathar Guild to kidnap the bride. Everyone knows it.'],
    },
  },
  'faction-skirmish': {
    '*': {
      true: ['with the Redbrands gone, Halia Thornton\'s people and Sildar Hallwinter\'s are at each other\'s throats.'],
      exaggerated: ['there will be open war in Phandalin\'s streets by the next tenday. The Black Network has hired an army.'],
      false: ['Sildar Hallwinter and Halia Thornton are secretly in league, and the street fights are for show.'],
    },
  },
  'wererats-of-neverwinter': {
    '*': {
      true: ['the dockhands in Blacklake have rat bites that do not heal, and some of them have stopped coming home.'],
      exaggerated: ['half of Blacklake District turns into rats every night, and General Sabine is one of them.'],
      false: ['the Blacklake sickness is from bad fish. Stop eating the fish.'],
    },
  },
  flood: {
    '*': {
      true: ['the Delimbiyr is over its banks at Daggerford. The farms downriver are under water.'],
      exaggerated: ['the Delimbiyr has swallowed half of Daggerford and the Duchess is running her court from a boat.'],
      false: ['the Daggerford flood is the Emerald Enclave\'s doing. They opened a beaver dam out of spite.'],
    },
  },
  'hungry-season': {
    '*': {
      true: ['the harvest failed in the Delimbiyr valley, and a merchant called {hoarder} is sitting on the grain.'],
      exaggerated: ['there will be no bread from Daggerford to Phandalin this winter. {hoarder} has bought the sun.'],
      false: ['the grain shortage is the Duchess\'s fault — she sold the valley\'s harvest to Waterdeep.'],
    },
  },
  'bounty-south': {
    '*': {
      true: ['{outlaw} and a gang of highwaymen are taking a toll on the Trade Way south of Daggerford.'],
      exaggerated: ['{outlaw} commands a hundred riders and flies a banner of their own.'],
      false: ['{outlaw} was hanged in Baldur\'s Gate last month. Whoever is on the Trade Way is using the name.'],
    },
  },
  'barrows-open': {
    '*': {
      true: ['the old barrows on the Fields of the Dead are open, and there are lights in them at night.'],
      exaggerated: ['every barrow on the Fields has opened at once, and the dead are marching on Daggerford.'],
      false: ['the lights on the Fields of the Dead are grave robbers with lanterns. Nothing more.'],
    },
  },
  'cult-in-the-mere': {
    '*': {
      true: ['people are vanishing off the High Road by the Mere of Dead Men, and the lizardfolk there are wearing purple.'],
      exaggerated: ['there is a dragon asleep under the Mere, and the cult is waking it up.'],
      false: ['the lights in the Mere are will-o\'-wisps. They have always been there; the travellers just drink too much.'],
    },
  },
  'thayan-diggers': {
    '*': {
      true: ['the red-robed Thayans are digging at Old Owl Well again, and the dead are walking out of it at night.'],
      exaggerated: ['Szass Tam himself has come to Old Owl Well, and he is raising an army of the dead to take Phandalin.'],
      false: ['the Thayans at Old Owl Well are only scholars. They pay well and they keep to themselves.'],
    },
  },
});

/** A festival's rumour is its own eve line, in someone's mouth. */
export const FESTIVAL_RUMORS = deepFreeze({
  true: ['{eve}'],
  exaggerated: ['this year\'s {festival} will be the finest the town has ever seen — the Lords themselves are sending wine.'],
  false: ['{festival} has been called off this year. Something about the council. Don\'t ask me.'],
});

// ===========================================================================
// 3. DEED RUMOURS — the party's own doings, coming back as gossip
//
// {party} is how the teller names the party (their leader, or "a company out
// of {home}"), {target} the creature or person, {place} where it happened.
// Only deeds with an entry here become gossip.
// ===========================================================================

export const DEED_RUMORS = deepFreeze({
  kill: {
    true: ['{party} put down {target} out on {place}.'],
    exaggerated: ['{party} killed {target} on {place} — and a score more besides, with one arm tied behind them.'],
    false: ['the Harpers killed {target} on {place}, and let some company of sellswords take the credit.'],
  },
  spare: {
    true: ['{party} let {target} go on {place}, when they could have cut them down. Some call it mercy.'],
    exaggerated: ['{party} spared {target} on {place} and sent them home with a purse. Soft as butter, that lot.'],
    false: ['{party} are in league with {target}. Why else let them walk away?'],
  },
  rescue: {
    true: ['{party} brought {target} back alive from {place}. Nobody expected it.'],
    exaggerated: ['{party} carried {target} out of {place} through fire and a hundred foes.'],
    false: ['{target} escaped from {place} on their own. The company that brought them back only met them on the road.'],
  },
  quest: {
    true: ['{party} saw to {target}. The one who paid them is telling everybody.'],
    exaggerated: ['{party} did in an afternoon what the Lords\' Alliance could not do in a year: {target}.'],
    false: ['{target}? That was done by somebody else entirely. The company in the Stonehill just took the purse.'],
  },
  questFail: {
    true: ['{party} took the job — {target} — and made a mess of it.'],
    exaggerated: ['{party} made such a mess of {target} that half the town is still paying for it.'],
    false: ['{party} were paid to fail at {target}. Ask who gained.'],
  },
  crime: {
    true: ['{party} drew steel on honest folk in {place}. The watch has their names.'],
    exaggerated: ['{party} butchered half of {place}. Lock your doors.'],
    false: ['the trouble in {place} was the Zhentarim\'s. They are blaming some travellers for it.'],
  },
  murder: {
    true: ['{party} killed {target} in {place}. In cold blood, they say.'],
    exaggerated: ['{party} killed {target} in {place} and drank from the skull.'],
    false: ['{target} is not dead at all. They faked it to get out of a debt.'],
  },
  theft: {
    true: ['somebody lifted goods off a stall in {place}. The description sounds a lot like {party}.'],
    exaggerated: ['{party} emptied every purse in {place} and nobody felt a thing.'],
    false: ['the thefts in {place} are the work of a halfling gang out of Baldur\'s Gate.'],
  },
  charity: {
    true: ['{party} left coin at the shrine in {place}. More than they had to.'],
    exaggerated: ['{party} gave away a dragon\'s hoard in {place} and walked off whistling.'],
    false: ['{party} gave to the shrine in {place} to buy off the priests. Nothing is free.'],
  },
  bribe: {
    true: ['{party} greased a palm or two in {place}. Works, doesn\'t it.'],
    exaggerated: ['{party} bought the whole watch of {place} for a single night.'],
    false: ['nobody in {place} takes bribes. Whoever says so is slandering good people.'],
  },
  found: {
    true: ['{party} have raised their own banner: {target}. Hiring, I hear.'],
    exaggerated: ['{party} have founded a company called {target}, and three lords have already begged to join.'],
    false: ['{target} is a Zhentarim front. Mark my words.'],
  },
  desecrate: {
    true: ['{party} profaned the shrine in {place}. The priests have not stopped praying since.'],
    exaggerated: ['{party} smashed every altar in {place} and laughed while they did it.'],
    false: ['the damage to the shrine in {place} was done by a storm. The priests are embarrassed to say so.'],
  },
  discover: {
    true: ['{party} found the way to {target}. Went off the road where nobody goes.'],
    exaggerated: ['{party} found {target} and came back with a cart full of gold.'],
    false: ['{target} does not exist. It is a story for children and fools who hire on as guides.'],
  },
});

// ===========================================================================
// 4. SITE RUMOURS — the lairs in the hills. A true one reveals the way.
// ===========================================================================

export const SITE_RUMORS = deepFreeze({
  'cragmaw-hideout': {
    true: ['the Cragmaw goblins have a cave off the Triboar Trail, up a stream where it comes out of the thickets. Follow the water.'],
    exaggerated: ['there is a goblin city under the hills off the Triboar Trail, with a king on a throne of bones.'],
    false: ['the goblins live in the Tresendar cellars, right under the town. That is why nobody can find them on the Trail.'],
  },
  'old-owl-well': {
    true: ['there is a Netherese watchtower north of the Triboar Trail — Old Owl Well. A road-stone by the verge still points to it.'],
    exaggerated: ['Old Owl Well was a Netherese city, and its treasury is still under the sand, waiting.'],
    false: ['Old Owl Well dried up a hundred years ago. There is nothing there but a hole and some owls.'],
  },
  'wyvern-tor': {
    true: ['east past Conyberry there is a crag called Wyvern Tor. The drovers\' track climbs right up to it.'],
    exaggerated: ['Wyvern Tor is a wyvern roost — a thousand of them, nesting in the rock like swallows.'],
    false: ['Wyvern Tor is south of Phandalin, down by the Wave Echo hills.'],
  },
  'icespire-peak': {
    true: ['the herders\' path above the Wave Echo hills climbs to the snowline and Icespire Peak. The sheep will not go up it.'],
    exaggerated: ['Icespire Peak is hollow, and the whole mountain is a dragon\'s hoard.'],
    false: ['Icespire Peak is a day\'s ride north of Neverwinter. Take the High Road.'],
  },
  'kryptgarden-forest': {
    true: ['south of the Triboar Trail there is a hunters\' ride into Kryptgarden Forest. The old dragon Claugiyliamatar is said to keep court there.'],
    exaggerated: ['Kryptgarden is where Old Gnawbones sleeps, on a mountain of emeralds, and she eats a knight a day.'],
    false: ['Kryptgarden burned down years ago. It is all stumps and charcoal now.'],
  },
  thundertree: {
    true: ['the ruins of Thundertree are west through Neverwinter Wood — an old road, under the needles, running into grey ash.'],
    exaggerated: ['Thundertree is full of the walking dead, and a green dragon sits on the tower like a hen on an egg.'],
    false: ['Thundertree was rebuilt years ago. There is an inn there now.'],
  },
  'cragmaw-castle': {
    true: ['the Cragmaw have a castle in the Neverwinter Wood — a broken keep east through the trees. King Grol holds it.'],
    exaggerated: ['Cragmaw Castle has a thousand hobgoblins in it, drilling day and night for a war on the Sword Coast.'],
    false: ['Cragmaw Castle is in the Sword Mountains, north of Icespire. Only a fool looks for it in the Wood.'],
  },
  'mere-of-dead-men': {
    true: ['south of Neverwinter a drowned causeway leaves the High Road and runs out into the Mere of Dead Men.'],
    exaggerated: ['the Mere of Dead Men is ten thousand drowned soldiers, and they all still hold their swords.'],
    false: ['the Mere of Dead Men was drained by the Lords of Waterdeep. It is all farmland now.'],
  },
  leilon: {
    true: ['the High Road runs on south out of Neverwinter to Leilon, where they are still rebuilding what the Spellplague broke.'],
    exaggerated: ['Leilon is haunted by every wizard the Spellplague ever killed.'],
    false: ['Leilon is abandoned. Nobody lives there any more.'],
  },
  'ardeep-forest': {
    true: ['there is an elven way-mark east of the Trade Way above Daggerford — someone has been scraping the moss off it. The path goes into Ardeep Forest.'],
    exaggerated: ['the elves have come back to Ardeep with an army, and they are taking back the whole valley.'],
    false: ['Ardeep Forest is west of Waterdeep, out on the sea cliffs.'],
  },
});

/** Word that something new has moved into a cleared lair. */
export const RENEWAL_RUMORS = deepFreeze({
  true: ['something new has moved into {site}. The {group} have been seen there since the last lot were cleared out.'],
  exaggerated: ['whatever is in {site} now is worse than whatever was there before. Much worse.'],
  false: ['{site} is empty now. Somebody saw to it. You could walk right in.'],
});

// ===========================================================================
// 5. FACTION MOVES — who holds a town, as the town sees it
// ===========================================================================

export const FACTION_RUMORS = deepFreeze({
  gain: {
    true: ['{power} have the run of {region} now. Watch who you owe money to.', '{power} are stronger in {region} than they were a month ago.'],
    exaggerated: ['{power} own every stone in {region}, and the rest of us just live here.'],
    false: ['{power} are finished in {region}. Mark my words, they will be gone by the next moon.'],
  },
  loss: {
    true: ['{power} have lost ground in {region}. Their people are keeping their heads down.'],
    exaggerated: ['{power} have been driven out of {region} entirely. Not one of them left.'],
    false: ['{power} are only pretending to be beaten in {region}. It\'s a trap.'],
  },
  hold: {
    true: ['{power} hold {region}, whoever else says otherwise.', 'In {region}, you ask {power} before you ask anyone else.', 'Nothing moves in {region} without {power} hearing of it.'],
    exaggerated: ['{power} decide who eats in {region}.'],
    false: ['nobody holds {region}. It holds itself, and always has.'],
  },
});

// ===========================================================================
// 6. TRADE TALK — prices, from the people who pay them
// ===========================================================================

export const TRADE_RUMORS = deepFreeze({
  dear: {
    true: ['{cat} is dear in {town} just now — {why}.'],
    exaggerated: ['you could buy a horse for what {cat} costs in {town} this tenday.'],
    false: ['{cat} will be cheap in {town} by the next market. Hold your coin.'],
  },
  cheap: {
    true: ['{cat} is cheap in {town} — {why}. If you are buying, now is the time.'],
    exaggerated: ['they are giving {cat} away in {town}. Take a cart.'],
    false: ['{cat} is about to go up in {town}. Buy now, before it does.'],
  },
});

/** Plain words for the price categories, for the mouths that say them. */
export const CATEGORY_WORDS = deepFreeze({
  grain: 'grain', food: 'food', drink: 'ale and wine', livestock: 'meat on the hoof', wool: 'wool', ore: 'ore',
  medicine: 'physic', potion: 'healing draughts', holy: 'holy water and candles', fine: 'fine goods', cloth: 'cloth',
  timber: 'timber', weapon: 'steel', armor: 'armour', gear: 'rope and lamp oil', tool: 'tools', '*': 'everything',
});
