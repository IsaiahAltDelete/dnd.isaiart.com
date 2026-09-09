/* ==============================================================================
   HERALDRY-ARMS.JS - turns a settlement description into a coat of arms, writes
   the blazon, invents the motto, and paints the result.

   Heraldry.generateArms(city, seed) -> arms object
   Heraldry.renderAchievement(arms)  -> SVG string (shield, crest, supporters, motto)
   Heraldry.renderBanner(arms, kind) -> SVG string (cloth flag on a staff)
   Heraldry.renderSeal(arms, name)   -> SVG string (wax seal)
   ============================================================================== */
(function (H) {
'use strict';

var G = H.G, n2 = H.n2, CH = H.CHARGES, T = H.TINCTURE;

/* -- 1. SEMANTICS: what the settlement is about ------------------------------ */

/*  Each rule contributes tags plus the reason it did so, which becomes the
    "why this symbol" note shown beside the arms.                             */

var TERRAIN_TAGS = {
  Plains: ['harvest', 'farm', 'horse', 'plains'], Hills: ['stone', 'farm', 'wild'],
  Mountains: ['mountain', 'stone', 'mine', 'height'], Forest: ['forest', 'wood', 'hunt', 'growth'],
  Jungle: ['forest', 'wild', 'serpent', 'growth'], Desert: ['sun', 'road', 'trade', 'hardy'],
  Tundra: ['cold', 'winter', 'north', 'hardy'], Swamp: ['water', 'mist', 'serpent', 'strange'],
  Coastal: ['sea', 'port', 'water', 'trade'], Island: ['sea', 'port', 'water', 'watch'],
  Underground: ['stone', 'mine', 'underdark', 'dwarf'], Floating: ['sky', 'air', 'arcane', 'strange'],
  Cliffside: ['height', 'watch', 'stone', 'sea'], Volcanic: ['fire', 'forge', 'stone', 'volcano'],
  Marsh: ['water', 'mist', 'strange'], 'River delta': ['river', 'water', 'trade', 'harvest'],
  Plateau: ['height', 'stone', 'watch'], Canyon: ['stone', 'road', 'shadow'],
  'Fey-touched': ['fey', 'bloom', 'strange', 'grace'], 'Shadow-infused': ['shadow', 'night', 'secret'],
  'Crystal fields': ['gem', 'arcane', 'light'], 'Petrified forest': ['wood', 'stone', 'strange'],
  'Magical wastes': ['arcane', 'strange', 'ruin'], 'Fungal caverns': ['fungus', 'underdark', 'strange'],
  Glacial: ['cold', 'winter', 'north'], Geothermal: ['fire', 'water', 'craft'],
  'Ancient battlefield': ['war', 'death', 'oath']
};

var INDUSTRY_TAGS = {
  Agriculture: ['harvest', 'farm', 'plenty'], Mining: ['mine', 'stone', 'metal'],
  Fishing: ['river', 'sea', 'food'], Lumber: ['wood', 'forest', 'craft'],
  Textiles: ['cloth', 'craft', 'trade'], Metalworking: ['forge', 'metal', 'craft'],
  Shipbuilding: ['sea', 'port', 'craft'], 'Magic items': ['arcane', 'craft', 'gem'],
  Alchemy: ['alchemy', 'craft', 'learning'], Glassmaking: ['craft', 'light', 'gem'],
  Pottery: ['craft', 'trade'], Weapons: ['war', 'forge', 'steel'], Armor: ['war', 'forge', 'steel'],
  Spices: ['trade', 'feast', 'road'], Wine: ['wine', 'feast', 'harvest'],
  Livestock: ['bull', 'farm', 'plenty'], Hunting: ['hunt', 'wild', 'forest'],
  Trapping: ['hunt', 'wild'], 'Fur trade': ['hunt', 'cold', 'trade'],
  'Information brokering': ['secret', 'watch', 'shadow'], Smuggling: ['crime', 'shadow', 'sea'],
  Piracy: ['sea', 'raid', 'crime'], 'Mercenary work': ['war', 'coin', 'oath'],
  Art: ['craft', 'court', 'music'], 'Spellcasting services': ['arcane', 'learning'],
  Necromancy: ['death', 'undead', 'shadow'], 'Soul binding': ['death', 'bind', 'shadow'],
  Teleportation: ['planar', 'arcane', 'road']
};

var GOVERNMENT_TAGS = {
  Monarchy: ['rule', 'noble', 'court'], 'Council of Merchants': ['trade', 'coin', 'law'],
  Mageocracy: ['arcane', 'learning', 'rule'], Theocracy: ['faith', 'law', 'light'],
  'Military Dictatorship': ['war', 'watch', 'rule'], Oligarchy: ['noble', 'coin', 'secret'],
  Democracy: ['law', 'peace', 'civic'], 'Feudal System': ['noble', 'oath', 'farm'],
  'Guild-run': ['craft', 'trade', 'law'], 'Tribal Council': ['tribe', 'wild', 'oath'],
  'Magistrate Rule': ['law', 'court'], 'Undead Overlord': ['undead', 'death', 'fear'],
  'Dragon Rule': ['dragon', 'power', 'fear'], Plutocracy: ['coin', 'wealth', 'trade'],
  Anarchy: ['crime', 'shadow', 'ruin'], Matriarchy: ['rule', 'oath', 'court'],
  Patriarchy: ['rule', 'oath', 'court'], 'Elder Council': ['learning', 'law', 'oath'],
  'Divine Mandate': ['faith', 'light', 'rule'], 'Secret Society Control': ['secret', 'shadow', 'eye'],
  'Merchant Consortium': ['trade', 'coin', 'road']
};

var RACE_TAGS = {
  Dwarves: ['dwarf', 'forge', 'stone', 'mine', 'rune'], Elves: ['elf', 'forest', 'grace', 'star', 'bloom'],
  Halflings: ['farm', 'plenty', 'luck', 'feast'], Gnomes: ['gnome', 'invention', 'craft', 'gem'],
  'Half-Orcs': ['war', 'wild', 'courage'], Tieflings: ['fire', 'secret', 'shadow'],
  Dragonborn: ['dragon', 'fire', 'oath'], Drow: ['spider', 'underdark', 'shadow'],
  Humans: ['trade', 'road', 'oath']
};

/* Readable phrasing for the "why this symbol" notes. */
var TERRAIN_PHRASE = {
  Plains: 'the open plains it stands on', Hills: 'the hills it is built across',
  Mountains: 'the mountains that hem it in', Forest: 'the forest at its back',
  Jungle: 'the jungle pressing on its walls', Desert: 'the desert it holds out against',
  Tundra: 'the frozen waste around it', Swamp: 'the swamp it was drained out of',
  Coastal: 'the sea at its gates', Island: 'the sea on every side of it',
  Underground: 'the deep stone it was cut from', Floating: 'the open air it hangs in',
  Cliffside: 'the cliff it clings to', Volcanic: 'the fire mountain above it',
  Marsh: 'the marsh it was raised out of', 'River delta': 'the river mouth it commands',
  Plateau: 'the high tableland it crowns', Canyon: 'the canyon it is wedged into',
  'Fey-touched': 'the fey ground it borders', 'Shadow-infused': 'the shadow lying over it',
  'Crystal fields': 'the crystal fields beyond the wall', 'Petrified forest': 'the stone forest around it',
  'Magical wastes': 'the torn Weave nearby', 'Fungal caverns': 'the fungal caverns below it',
  Glacial: 'the ice it is anchored in', Geothermal: 'the hot springs beneath it',
  'Ancient battlefield': 'the battlefield it was built over'
};

/* Water and defence features add their own hints. */
var FEATURE_TAGS = [
  [/river|aqueduct|spring|well/i, ['river', 'water']],
  [/wall|citadel|bastion|fortress|palisade|moat/i, ['fort', 'watch']],
  [/tower|spire/i, ['watch', 'fort']],
  [/portal|planar/i, ['planar', 'arcane']],
  [/canal|harbou?r|dock|wharf/i, ['port', 'sea']],
  [/library|academy|univers/i, ['learning', 'scribe']],
  [/temple|cathedral|shrine/i, ['faith']],
  [/tomb|crypt|necropolis|bone/i, ['death', 'undead']],
  [/garden|grove|tree/i, ['growth', 'bloom']],
  [/glacier|ice|snow/i, ['cold', 'winter']]
];

function collectTags(city) {
  var tags = {}, why = {};
  function add(list, reason) {
    (list || []).forEach(function (t) {
      tags[t] = (tags[t] || 0) + 1;
      if (!why[t]) why[t] = reason;
    });
  }
  add(TERRAIN_TAGS[city.terrain], TERRAIN_PHRASE[city.terrain] || ('the ' + String(city.terrain).toLowerCase() + ' around it'));
  add(GOVERNMENT_TAGS[city.government], 'its rule by ' + String(city.government).toLowerCase());
  (city.industries || '').split(/,\s*/).forEach(function (ind) {
    add(INDUSTRY_TAGS[ind], 'the ' + ind.toLowerCase() + ' trade');
  });
  add(RACE_TAGS[city.dominantRace], 'the ' + String(city.dominantRace || '').toLowerCase() + ' who built it');
  var blob = [city.fortifications, city.waterSource, city.architectureFeatures, city.landmarks,
              city.magicalLocations, city.elevation].join(' | ');
  FEATURE_TAGS.forEach(function (pair) {
    if (pair[0].test(blob)) add(pair[1], 'what stands within its walls');
  });
  if (/Selune|Moonmaiden|Moon/i.test(city.religions || '')) add(['moon', 'night', 'faith'], 'the moon-faith kept here');
  if (/Lathander|Morninglord|Sun/i.test(city.religions || '')) add(['sun', 'light', 'faith'], 'the dawn-faith kept here');
  if (/Tempus|Red Knight|War/i.test(city.religions || '')) add(['war', 'oath'], 'the war-faith kept here');
  if (/Mystra|Weave/i.test(city.religions || '')) add(['arcane', 'star'], 'the Weave-faith kept here');
  if (/Chauntea|Harvest/i.test(city.religions || '')) add(['harvest', 'plenty'], 'the harvest-faith kept here');
  if (/Oghma|Deneir|Knowledge/i.test(city.religions || '')) add(['learning', 'scribe'], 'the loremasters here');
  if (/Bhaal|Myrkul|Shar|Cyric|Dead Three|Demon|Dark/i.test(city.religions || '')) add(['shadow', 'death'], 'the darker rites kept here');
  if (/dragon/i.test(city.majorThreat || '')) add(['dragon', 'fear'], 'the wyrm that shadows it');
  if (/undead|necroman|lich|vampire/i.test(city.majorThreat || '')) add(['undead', 'death'], 'the restless dead nearby');
  if ((city.crimeValue || 0) >= 7) add(['shadow', 'crime'], 'how deep the guilds of thieves run');
  if ((city.wealthValue || 0) >= 7) add(['wealth', 'coin', 'noble'], 'the fortunes made here');
  if ((city.magicValue || 0) >= 8) add(['arcane', 'strange'], 'how thick the Weave lies over it');
  return { tags: tags, why: why };
}

/* Charges that carry a tag, most specific first. */
function chargesForTags(tags) {
  var scored = [];
  Object.keys(CH).forEach(function (k) {
    var c = CH[k], score = 0;
    c.tags.forEach(function (t) { if (tags[t]) score += tags[t] * (c.tags.length <= 4 ? 1.3 : 1); });
    if (score > 0) scored.push([k, score]);
  });
  scored.sort(function (a, b) { return b[1] - a[1]; });
  return scored;
}

/* -- 2. TINCTURE PALETTES ---------------------------------------------------- */

var TAG_TINCTURES = {
  sea: ['azure', 'celeste'], river: ['azure', 'celeste'], water: ['azure', 'celeste'],
  forest: ['vert'], growth: ['vert'], farm: ['vert', 'or'], harvest: ['or', 'vert'],
  fire: ['gules', 'tenne'], forge: ['gules', 'sable', 'copper'], war: ['gules', 'sable'],
  shadow: ['sable', 'purpure'], night: ['azure', 'sable'], death: ['sable', 'sanguine'],
  undead: ['sable', 'cendree'], arcane: ['purpure', 'azure'], learning: ['azure', 'argent'],
  faith: ['argent', 'or'], light: ['or', 'argent'], sun: ['or'], moon: ['argent', 'azure'],
  coin: ['or'], wealth: ['or', 'purpure'], noble: ['purpure', 'gules'], rule: ['gules', 'purpure'],
  stone: ['cendree', 'argent'], mine: ['sable', 'copper'], metal: ['argent', 'cendree'],
  cold: ['argent', 'celeste'], winter: ['argent', 'celeste'], north: ['azure', 'argent'],
  dwarf: ['gules', 'or', 'copper'], elf: ['vert', 'argent'], fey: ['vert', 'purpure'],
  underdark: ['sable', 'purpure'], dragon: ['gules', 'sable', 'or'], wine: ['murrey', 'purpure'],
  crime: ['sable', 'murrey'], planar: ['purpure', 'celeste'], volcano: ['gules', 'sable']
};

function paletteFor(tags, ch) {
  var pool = [], key;
  for (key in tags) if (TAG_TINCTURES[key]) {
    TAG_TINCTURES[key].forEach(function (t) { for (var i = 0; i < tags[key]; i++) pool.push(t); });
  }
  /* Always leave room for surprise, but keep the classic metals commonest. */
  H.COLOURS.forEach(function (t) { pool.push(t); });
  pool.push('or', 'or', 'or', 'argent', 'argent', 'argent', 'copper');
  return ch.shuffle(pool);
}

/*  Pick a tincture that legally contrasts with everything in `against` (a key
    or a list of keys) and is not in `avoid`. Falls back to any legal tincture
    rather than ever returning something invisible. */
function pickAgainst(pool, against, ch, avoid) {
  var list = (against == null ? [] : [].concat(against)).filter(Boolean);
  function ok(t) {
    if (avoid && avoid.indexOf(t) !== -1) return false;
    for (var j = 0; j < list.length; j++) if (!H.contrasts(t, list[j])) return false;
    return true;
  }
  var i;
  for (i = 0; i < pool.length; i++) if (ok(pool[i])) return pool[i];
  var fall = H.opposedTo(list[0] || 'azure').filter(function (t) {
    return !avoid || avoid.indexOf(t) === -1;
  });
  if (fall.length) return ch.pick(fall);
  return ch.pick(H.opposedTo(list[0] || 'azure'));
}

/* -- 3. MOTTOES -------------------------------------------------------------- */

var MOTTOES = [
  { en: 'We hold the line', tags: ['war', 'fort', 'watch'] },
  { en: 'The walls remember', tags: ['fort', 'stone', 'watch'] },
  { en: 'By hammer and by oath', tags: ['forge', 'craft', 'dwarf'] },
  { en: 'From deep stone, light', tags: ['mine', 'stone', 'underdark'] },
  { en: 'The tide answers to none', tags: ['sea', 'port', 'water'] },
  { en: 'Fair winds, full holds', tags: ['sea', 'trade', 'port'] },
  { en: 'What the river gives, we keep', tags: ['river', 'water', 'harvest'] },
  { en: 'Rooted deep, crowned high', tags: ['forest', 'growth', 'elf'] },
  { en: 'The forest is patient', tags: ['forest', 'hunt', 'wild'] },
  { en: 'Sow well, and fear no winter', tags: ['harvest', 'farm', 'plenty'] },
  { en: 'Gold is only patience, hardened', tags: ['coin', 'trade', 'wealth'] },
  { en: 'Every debt is paid', tags: ['coin', 'law', 'crime'] },
  { en: 'Weighed, and found honest', tags: ['law', 'trade', 'court'] },
  { en: 'Judge slowly, strike once', tags: ['law', 'war'] },
  { en: 'The law is a lantern', tags: ['law', 'light', 'civic'] },
  { en: 'Knowledge outlives kings', tags: ['learning', 'scribe', 'arcane'] },
  { en: 'We keep what is written', tags: ['learning', 'law', 'scribe'] },
  { en: 'The Weave bends, it does not break', tags: ['arcane', 'star'] },
  { en: 'Light first, then judgement', tags: ['faith', 'light', 'sun'] },
  { en: 'Under her silver eye', tags: ['moon', 'night', 'faith'] },
  { en: 'Dawn is a promise kept', tags: ['sun', 'faith', 'light'] },
  { en: 'Faithful in the long dark', tags: ['night', 'shadow', 'faith'] },
  { en: 'Nothing is forgotten', tags: ['death', 'undead', 'secret'] },
  { en: 'Silence is a kind of wealth', tags: ['secret', 'shadow', 'crime'] },
  { en: 'We do not kneel', tags: ['war', 'courage', 'tribe'] },
  { en: 'Blood before surrender', tags: ['war', 'courage', 'raid'] },
  { en: 'The wyrm sleeps, and we thrive', tags: ['dragon', 'fear'] },
  { en: 'Fire tempers, it does not ruin', tags: ['fire', 'forge', 'volcano'] },
  { en: 'Endure the cold, outlast the world', tags: ['cold', 'winter', 'north'] },
  { en: 'Small hands, long memory', tags: ['gnome', 'invention', 'luck'] },
  { en: 'Every road returns here', tags: ['road', 'trade', 'gate'] },
  { en: 'Come armed or come honest', tags: ['gate', 'watch', 'trade'] },
  { en: 'The gate stands open to the worthy', tags: ['gate', 'law', 'civic'] },
  { en: 'Guard the sleeping stone', tags: ['stone', 'mine', 'watch'] },
  { en: 'We were here before the maps', tags: ['tribe', 'wild', 'ruin'] },
  { en: 'Two worlds, one hearth', tags: ['planar', 'strange', 'trade'] },
  { en: 'Drink deep, pay honestly', tags: ['drink', 'feast', 'wine'] },
  { en: 'Bound by our own word', tags: ['oath', 'bind', 'law'] },
  { en: 'Sharper than the sea wind', tags: ['sea', 'raid', 'war'] },
  { en: 'Grown, not granted', tags: ['growth', 'farm', 'craft'] },
  { en: 'Where the wild bows to the wall', tags: ['fort', 'wild', 'watch'] },
  { en: 'Watchful, and unbought', tags: ['watch', 'law', 'oath'] },
  { en: 'Peace is a made thing', tags: ['peace', 'civic', 'craft'] },
  { en: 'Let the storm come', tags: ['storm', 'sea', 'courage'] }
];

var TONGUES = {
  Thorass:     { a: ['Ar', 'Vel', 'Cor', 'Dur', 'Mal', 'Ter', 'Sol', 'Ven', 'Aur', 'Fer'], b: ['an', 'is', 'or', 'um', 'ae', 'en', 'ir', 'os'], c: ['dus', 'nir', 'tas', 'vum', 'ric', 'lan', 'mor', 'set'], p: ['ad','el','de','vor','na'] },
  Elvish:      { a: ['Ael', 'Sil', 'Lith', 'Myth', 'Ere', 'Tha', 'Ily', 'Nae', 'Cael', 'Yll'], b: ['a', 'ae', 'ia', 'e', 'io', 'ei', 'ua'], c: ['ndil', 'thil', 'rian', 'lash', 'veth', 'nara', 'sien', 'mour'], p: ['a','na','en','il','ai'] },
  Dwarvish:    { a: ['Bar', 'Dur', 'Khaz', 'Thra', 'Grim', 'Vor', 'Muz', 'Kor', 'Uzn', 'Dun'], b: ['a', 'u', 'o', 'ar', 'ur', 'un', 'ok'], c: ['dum', 'khad', 'gorn', 'thur', 'bak', 'nud', 'gral', 'zek'], p: ['ok','ur','dun','az','ba'] },
  Draconic:    { a: ['Ax', 'Vor', 'Sar', 'Thu', 'Kra', 'Zeh', 'Mal', 'Ur', 'Vex', 'Ith'], b: ['a', 'i', 'ae', 'u', 'o', 'yr'], c: ['ranth', 'ssar', 'koth', 'vex', 'darr', 'zhul', 'tiir', 'ghan'], p: ['ix','ur','ka','sa','vo'] },
  Infernal:    { a: ['Mal', 'Baal', 'Zeth', 'Vor', 'Nex', 'Kar', 'Ash', 'Ur', 'Dis', 'Grah'], b: ['e', 'a', 'i', 'ae', 'o'], c: ['zoth', 'rax', 'moth', 'kesh', 'vurn', 'thal', 'gash', 'nex'], p: ['ze','ul','ka','os','ne'] },
  Orcish:      { a: ['Gru', 'Mok', 'Thar', 'Zug', 'Bru', 'Kag', 'Drok', 'Ur', 'Nak', 'Hro'], b: ['a', 'u', 'o', 'ag', 'uk'], c: ['gar', 'thok', 'nash', 'muk', 'grim', 'dar', 'zol', 'bak'], p: ['uk','gor','na','za','ba'] },
  Celestial:   { a: ['Ael', 'Ith', 'Ser', 'Lum', 'Aur', 'Vas', 'Ora', 'Kae', 'Sanc', 'Eli'] , b: ['a', 'e', 'i', 'ia', 'io'], c: ['riel', 'thon', 'nael', 'vius', 'lume', 'saris', 'dien', 'mira'], p: ['el','ia','sa','ve','an'] },
  Undercommon: { a: ['Zar', 'Vul', 'Ssin', 'Dro', 'Khy', 'Mez', 'Yth', 'Nol', 'Xun', 'Ilv'], b: ['a', 'i', 'y', 'ae', 'u'], c: ['zith', 'drin', 'noth', 'ryss', 'kul', 'phar', 'tesh', 'vorn'], p: ['ssz','yl','za','vi','ne'] },
  Sylvan:      { a: ['Fae', 'Wil', 'Bri', 'Tan', 'Oa', 'Nim', 'Lys', 'Thi', 'Mor', 'Pel'], b: ['a', 'e', 'i', 'ow', 'ae'], c: ['wynn', 'thorn', 'brook', 'leaf', 'dell', 'rime', 'bell', 'moss'], p: ['an','wi','ne','ta','il'] },
  Primordial:  { a: ['Aq', 'Ign', 'Terr', 'Vay', 'Zhu', 'Ombr', 'Kel', 'Sul', 'Xar', 'Rho'], b: ['a', 'o', 'u', 'ae', 'i'], c: ['thun', 'mara', 'vokh', 'dris', 'saal', 'nomm', 'zeer', 'lith'], p: ['aq','ur','va','so','ka'] }
};

/* Deterministic pseudo-translation: the same English word always yields the
   same foreign word within one tongue, so mottoes read like a real language. */
function foreignWord(word, tongue) {
  var t = TONGUES[tongue] || TONGUES.Thorass;
  var h = H.hashStr(tongue + '|' + word.toLowerCase());
  var out = t.a[h % t.a.length];
  if (word.length > 3) out += t.b[(h >>> 5) % t.b.length];
  if (word.length > 4 || (h >>> 11) % 3) out += t.c[(h >>> 13) % t.c.length];
  return word[0] === word[0].toUpperCase() ? out : out.toLowerCase();
}

var FUNCTION_WORD = /^(the|a|an|of|and|is|are|to|by|in|it|not|no|we|us|our|for)$/i;

function foreignPhrase(en, tongue) {
  if (tongue === 'Common') return en;
  var t = TONGUES[tongue] || TONGUES.Thorass;
  return en.replace(/[.,]/g, '').split(/\s+/).map(function (w) {
    /* Short grammatical words become short particles rather than truncated
       stumps, so the line scans like a language instead of an abbreviation. */
    if (FUNCTION_WORD.test(w) && t.p) {
      var idx = H.hashStr(tongue + '#' + w.toLowerCase());
      var particle = t.p[idx % t.p.length];
      /* Longer function words take a trailing vowel, which keeps "by ... and
         by" from collapsing into the same syllable three times over. */
      if (w.length > 2) particle += t.b[(idx >>> 7) % t.b.length];
      return particle;
    }
    return foreignWord(w, tongue);
  }).join(' ');
}

/* -- 4. GENERATION ----------------------------------------------------------- */

var FLAG_KINDS = ['banner', 'gonfalon', 'pennon', 'swallowtail', 'guidon', 'standard'];

/* Ordinaries that cut through the middle of the shield and crowd the charges. */
var CENTRAL_ORDINARIES = ['fess', 'twoBars', 'threeBars', 'pale', 'twoPallets', 'cross', 'saltire',
                          'chevron', 'chevronels', 'bend', 'bendSinister', 'pall', 'pile',
                          'flaunches', 'canton'];

function generateArms(city, seed) {
  var rng = H.makeRng(seed === undefined ? H.hashStr(String(city.name || 'arms')) : seed);
  var ch = new H.Chance(rng);
  var sem = collectTags(city || {});
  var tags = sem.tags, why = sem.why;
  var symbolism = [];

  /* --- field --------------------------------------------------------------- */
  var pool = paletteFor(tags, ch);
  var divKeys = Object.keys(H.DIVISIONS);
  /* Plain fields stay common; complex partitions get rarer as they get busier. */
  var divWeights = divKeys.map(function (k) {
    var w = { plain: 24, perPale: 9, perFess: 9, perBend: 7, perBendSinister: 5, perChevron: 6,
              perChevronInverted: 4, perSaltire: 5, quarterly: 7, gyronny: 3, tiercedPerPale: 3,
              tiercedPerFess: 3, perPall: 2, barry: 5, paly: 4, bendy: 4, bendySinister: 3,
              chevronny: 3, checky: 4, lozengy: 3, fusilly: 2, pily: 2 }[k] || 3;
    return [k, w];
  });
  var divKey = ch.weighted(divWeights);
  var div = H.DIVISIONS[divKey];
  var lineStyle = 'plain';
  if (div.line) {
    lineStyle = ch.weighted([['plain', 40], ['wavy', 12], ['embattled', 9], ['indented', 7], ['engrailed', 7],
                             ['dancetty', 5], ['nebuly', 4], ['invected', 4], ['raguly', 3], ['dovetailed', 3],
                             ['potenty', 2], ['rayonny', 3]]);
    /* Water-fed settlements love a wavy partition. */
    if ((tags.river || tags.sea || tags.water) && ch.chance(0.45)) lineStyle = 'wavy';
  }
  var count = div.count ? ch.pick(div.count) : 0;

  var fieldT = [];
  fieldT.push(ch.chance(0.10) ? ch.pick(H.FURS) : pool[0]);
  for (var i = 1; i < div.tinctures; i++) fieldT.push(pickAgainst(pool, fieldT, ch, fieldT));

  /* --- ordinary ------------------------------------------------------------ */
  var ordKeys = ['none', 'chief', 'fess', 'pale', 'bend', 'bendSinister', 'chevron', 'cross', 'saltire',
                 'pall', 'pile', 'canton', 'base', 'bordure', 'orle', 'tressure', 'twoBars', 'threeBars',
                 'twoPallets', 'chevronels', 'flaunches'];
  var ordWeight = { none: divKey === 'plain' ? 26 : 60, chief: 16, fess: 10, pale: 7, bend: 8, bendSinister: 4,
                    chevron: 8, cross: 7, saltire: 6, pall: 2, pile: 4, canton: 3, base: 3, bordure: 9,
                    orle: 3, tressure: 2, twoBars: 3, threeBars: 3, twoPallets: 2, chevronels: 3, flaunches: 2 };
  var ordKey = ch.weighted(ordKeys.map(function (k) { return [k, ordWeight[k]]; }));
  var ord = H.ORDINARIES[ordKey];
  var ordT = null, ordLine = 'plain';
  if (ordKey !== 'none') {
    ordT = pickAgainst(ch.shuffle(pool), fieldT, ch, fieldT);
    if (ch.chance(0.3)) ordLine = ch.weighted([['plain', 30], ['wavy', 10], ['embattled', 8], ['engrailed', 7],
                                               ['indented', 6], ['invected', 4], ['dancetty', 4], ['nebuly', 3],
                                               ['raguly', 3], ['dovetailed', 3], ['potenty', 2], ['rayonny', 2]]);
    if ((tags.sea || tags.river) && ordKey === 'fess' && ch.chance(0.6)) ordLine = 'wavy';
    if (tags.fort && (ordKey === 'chief' || ordKey === 'fess') && ch.chance(0.45)) ordLine = 'embattled';
  }

  /* --- principal charge ---------------------------------------------------- */
  var ranked = chargesForTags(tags);
  var primaryKey;
  if (ranked.length && ch.chance(0.88)) {
    /* Weight toward the best fits but never make it deterministic. */
    var top = ranked.slice(0, Math.min(10, ranked.length));
    primaryKey = ch.weighted(top.map(function (p, idx) { return [p[0], p[1] * (10 - idx) + 2]; }));
  } else {
    primaryKey = ch.pick(Object.keys(CH));
  }
  var primary = CH[primaryKey];
  var primaryReason = null;
  primary.tags.some(function (t) { if (why[t]) { primaryReason = why[t]; return true; } return false; });

  /* Where does it sit? On the ordinary if that ordinary can hold charges. */
  var onOrdinary = ord.holds > 0 && ordKey !== 'none' && ch.chance(0.42);
  /* On the field, the charge must also read clearly next to the ordinary. */
  var bgForCharge = onOrdinary ? [ordT] : fieldT;
  var avoidForCharge = onOrdinary ? [ordT] : fieldT.concat(ordT ? [ordT] : []);
  var primaryT = pickAgainst(ch.shuffle(pool), bgForCharge, ch, avoidForCharge);

  var arrangement = 'single';
  var num = 1;
  if (onOrdinary) {
    num = ch.weighted([[1, 5], [2, 2], [3, 6]]);
    if (num > ord.holds) num = ord.holds;
    arrangement = num === 1 ? 'single' : 'inLine';
  } else {
    var roll = ch.weighted([['single', 46], ['three', 20], ['two', 8], ['crossed', 7], ['seme', 6], ['four', 4], ['five', 3]]);
    if (roll === 'crossed' && !primary.crossable) roll = 'two';
    arrangement = roll;
    num = { single: 1, two: 2, three: 3, crossed: 2, four: 4, five: 5, seme: 12 }[roll];
  }
  if (primary.body && arrangement === 'seme') { arrangement = 'single'; num = 1; }
  /*  An ordinary through the middle of the shield only leaves a few clear
      spots, so never blazon more charges than the field can actually hold. */
  if (!onOrdinary && CENTRAL_ORDINARIES.indexOf(ordKey) !== -1 &&
      arrangement !== 'seme' && arrangement !== 'crossed' && num > 3) {
    num = 3; arrangement = 'three';
  }

  var charges = [{ key: primaryKey, t: primaryT, count: num, arrangement: arrangement, on: onOrdinary ? 'ordinary' : 'field' }];
  if (primaryReason) symbolism.push({ what: capitalise(primary.name), why: primaryReason });

  /* --- secondary charge ---------------------------------------------------- */
  var secondary = null;
  if (arrangement === 'single' && !onOrdinary && ch.chance(0.34)) {
    var minorPool = ['mullet', 'roundel', 'crescent', 'fleurdelis', 'lozengeC', 'billet', 'trefoil',
                     'annulet', 'mullet6', 'quatrefoil', 'crossPatty', 'waterdrop', 'estoile'];
    var sk = ch.pick(minorPool);
    var st = pickAgainst(ch.shuffle(pool), fieldT, ch, fieldT.concat([primaryT, ordT]));
    secondary = { key: sk, t: st, count: 3, arrangement: 'around', on: 'field' };
    charges.push(secondary);
  }

  /* --- bordure as a separate augmentation ---------------------------------- */
  var bordure = null;
  if (ordKey !== 'bordure' && ordKey !== 'orle' && ordKey !== 'tressure' && ch.chance(0.16)) {
    bordure = {
      t: pickAgainst(ch.shuffle(pool), fieldT, ch, fieldT.concat([primaryT])),
      line: ch.chance(0.3) ? ch.pick(['engrailed', 'indented', 'embattled', 'wavy']) : 'plain'
    };
  }

  /* --- shape, crest, supporters ------------------------------------------- */
  var shapeKeys = Object.keys(H.SHAPES);
  var affinity = H.SHAPE_AFFINITY[city.dominantRace];
  var shape = (affinity && ch.chance(0.55)) ? ch.pick(affinity) : ch.weighted(shapeKeys.map(function (k) {
    return [k, { heater: 20, french: 12, iberian: 10, spade: 9, polish: 7, kite: 6, bouche: 5,
                 oval: 5, round: 5, lozenge: 3, dwarven: 4, elven: 4, orcish: 3, banner: 2 }[k] || 4];
  }));

  var crestKeys = Object.keys(H.CRESTS);
  var crestScored = crestKeys.map(function (k) {
    var c = H.CRESTS[k], s = 1;
    c.tags.forEach(function (t) { if (tags[t]) s += tags[t] * 4; });
    if (k === 'mural') s += 8;              /* civic arms almost always take a mural crown */
    return [k, s];
  });
  var crestKey = ch.weighted(crestScored);

  var bodyCharges = Object.keys(CH).filter(function (k) { return CH[k].body; });
  var supporters = null;
  var pomp = (city.wealthValue || 4) + (city.sizeIndex || 3);
  if (pomp >= 8 && ch.chance(0.62)) {
    var supKey = ch.weighted(bodyCharges.map(function (k) {
      var s = 1; CH[k].tags.forEach(function (t) { if (tags[t]) s += tags[t] * 5; });
      return [k, s];
    }));
    supporters = { key: supKey, t: pickAgainst(ch.shuffle(H.METALS.concat(H.COLOURS)), fieldT[0], ch, []) };
    symbolism.push({ what: capitalise(CH[supKey].plural) + ' as supporters', why: 'a mark of rank granted only to great seats' });
  }

  /* --- motto --------------------------------------------------------------- */
  var mottoScored = MOTTOES.map(function (m) {
    var s = 1; m.tags.forEach(function (t) { if (tags[t]) s += tags[t] * 6; });
    return [m, s];
  });
  var motto = ch.weighted(mottoScored);
  /*  The tongue the motto is cut in follows whoever founded the place. */
  var tongueOptions = [['Common', 6], ['Thorass', 7]];
  var race = String(city.dominantRace || '');
  if (tags.elf || tags.fey || /Elves|Elf/i.test(race)) tongueOptions.push(['Elvish', 14], ['Sylvan', 5]);
  if (tags.dwarf || /Dwar/i.test(race)) tongueOptions.push(['Dwarvish', 14]);
  else if (tags.forge || tags.mine) tongueOptions.push(['Dwarvish', 5]);
  if (tags.dragon || /Dragonborn/i.test(race)) tongueOptions.push(['Draconic', 12]);
  if (tags.shadow || tags.undead) tongueOptions.push(['Infernal', 7]);
  if (/Tiefling/i.test(race)) tongueOptions.push(['Infernal', 12]);
  if (tags.underdark || /Drow/i.test(race)) tongueOptions.push(['Undercommon', 12]);
  if (tags.faith || tags.light) tongueOptions.push(['Celestial', 6]);
  if (tags.raid || /Orc/i.test(race)) tongueOptions.push(['Orcish', 12]);
  if (tags.planar || tags.strange) tongueOptions.push(['Primordial', 6]);
  var tongue = ch.weighted(tongueOptions);

  /* --- flag ---------------------------------------------------------------- */
  var flagKind = ch.weighted([['banner', 26], ['gonfalon', 16], ['rect', 20], ['swallowtail', 12],
                              ['pennon', 10], ['guidon', 8], ['standard', 8]]);

  /* --- symbolism for the field -------------------------------------------- */
  var domTag = null, bestCount = 0;
  Object.keys(tags).forEach(function (t) { if (TAG_TINCTURES[t] && tags[t] > bestCount) { domTag = t; bestCount = tags[t]; } });
  var fieldWhy = (domTag && TAG_TINCTURES[domTag].indexOf(fieldT[0]) !== -1) ? (why[domTag] || null) : null;
  /* Never give two elements the same explanation - fall back on what the
     tincture itself is held to mean. */
  if (!fieldWhy || fieldWhy === primaryReason) fieldWhy = TINCTURE_MEANING[fieldT[0]] || 'a choice of the first heralds, never since changed';
  symbolism.push({ what: T[fieldT[0]].name + ' field', why: fieldWhy });

  if (ordKey !== 'none') {
    symbolism.push({
      what: capitalise(strip(ord.blazon(ordLine))),
      why: ordLine === 'wavy' ? 'the water that made the settlement possible'
         : ordLine === 'embattled' ? 'the walls that kept it standing'
         : ORD_MEANING[ordKey] || 'an old mark of the founding charter'
    });
  }
  if (bordure) {
    symbolism.push({ what: T[bordure.t].name + ' bordure', why: 'the boundary stones set at its founding' });
  }
  symbolism.push({
    what: capitalise(H.CRESTS[crestKey].name),
    why: CREST_MEANING[crestKey] || 'borne above the shield since the charter was granted'
  });

  var arms = {
    seed: seed,
    shape: shape,
    field: { division: divKey, tinctures: fieldT, line: lineStyle, count: count },
    ordinary: ordKey === 'none' ? null : { key: ordKey, t: ordT, line: ordLine },
    charges: charges,
    bordure: bordure,
    crest: crestKey,
    supporters: supporters,
    motto: { en: motto.en, tongue: tongue, text: foreignPhrase(motto.en, tongue) },
    flagKind: flagKind,
    symbolism: symbolism,
    livery: liveryOf(fieldT, ordT, charges)
  };
  arms.blazon = writeBlazon(arms);
  return arms;
}

/*  What a tincture is held to mean locally, used when nothing more specific
    explains why the field is that colour. */
var TINCTURE_MEANING = {
  or: 'the grain and the coin that keep it alive',
  argent: 'clean water and a peace that has mostly held',
  copper: 'the ore worked in its yards',
  gules: 'blood spilled at its founding, and never repaid',
  azure: 'the water everything here depends on',
  sable: 'a grief the city has not agreed to forget',
  vert: 'the green country it was carved out of',
  purpure: 'an old royal grant nobody has revoked',
  celeste: 'open sky and the fair season',
  cendree: 'the grey stone it is cut from',
  tenne: 'the kilns, the tanning yards and the smoke',
  murrey: 'a wound in its history, worn openly',
  sanguine: 'a night the survivors still count from',
  carnation: 'the hands that raised every wall of it',
  ermine: 'the fur trade that made the first families rich',
  ermines: 'mourning kept formal, and permanent',
  erminois: 'old money, and the manners that come with it',
  pean: 'a wealth nobody asks the source of',
  vair: 'the winter furs traded through its gates',
  vairVert: 'the woodland pelts its trappers bring in',
  potent: 'shelter given to those who came here with nothing'
};

var CREST_MEANING = {
  mural: 'the walls themselves, worn as a crown by every free city',
  naval: 'granted for a victory won at sea',
  ducal: 'the rank of the house that holds the charter',
  laurel: 'a peace brokered here, and still cited',
  helm: 'the garrison that has never been stood down',
  antlers: 'the older claim of the people who were here first',
  arcaneOrb: 'the college that really governs the place',
  sunburst: 'the god whose festival empties the streets',
  skullCrown: 'a warning, and a statement of who rules',
  dragonCrest: 'the wyrm whose favour the city holds — or pays for',
  anvilCrest: 'the forges that everything else here is built around'
};

var ORD_MEANING = {
  chief: 'the charter granted from a greater seat', fess: 'the road or river that splits the settlement',
  pale: 'the central way that runs gate to gate', bend: 'the pass or trade road that made it rich',
  bendSinister: 'a claim inherited through a second line', chevron: 'the roof-tree of its founding house',
  cross: 'the crossroads it was built upon', saltire: 'a battle fought and held at its gates',
  pall: 'three ways meeting at its market', pile: 'the hill or spire that dominates it',
  canton: 'a lesser honour added by a later lord', base: 'the ground it was granted',
  bordure: 'a mark of a cadet or client settlement', orle: 'an old ring of watchfires',
  tressure: 'a treaty binding it to a greater power', twoBars: 'two rivers, or two treaties',
  threeBars: 'the three founding families', twoPallets: 'the twin gates', chevronels: 'the rooftops of the old town',
  flaunches: 'the two hills that shelter it'
};

function capitalise(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
function strip(s) { return String(s).trim().replace(/^(a|an)\s+/i, ''); }

/* The colours the guard's tabards and the city's ribbons are cut from:
   the field first, then the ordinary, then whatever the charges are painted in. */
function liveryOf(fieldT, ordT, charges) {
  var seen = [];
  function add(t) { if (t && seen.indexOf(t) === -1) seen.push(t); }
  add(fieldT[0]); add(ordT); charges.forEach(function (c) { add(c.t); }); add(fieldT[1]); add(fieldT[2]);
  return seen.slice(0, 4);
}

/* -- 5. BLAZON --------------------------------------------------------------- */

function chargePhrase(c, first) {
  var def = CH[c.key], name;
  var art = /^[aeiou]/i.test(def.name) ? 'an ' : 'a ';
  if (c.arrangement === 'crossed') return 'two ' + def.plural + ' in saltire ' + T[c.t].name;
  if (c.arrangement === 'seme') return 'seme of ' + def.plural + ' ' + T[c.t].name;
  if (c.count === 1) return art + def.name + ' ' + T[c.t].name;
  name = H.numWord(c.count) + ' ' + def.plural + ' ' + T[c.t].name;
  if (c.arrangement === 'inLine') name = H.numWord(c.count) + ' ' + def.plural + ' ' + T[c.t].name;
  return name;
}

function writeBlazon(a) {
  var div = H.DIVISIONS[a.field.division];
  var out = div.blazon(a.field.tinctures, a.field.line, a.field.count);
  var parts = [];

  var onOrd = a.charges.filter(function (c) { return c.on === 'ordinary'; });
  var onField = a.charges.filter(function (c) { return c.on === 'field'; });

  /* A bordure, orle or tressure surrounds everything, so it is blazoned last. */
  var SURROUNDS = ['bordure', 'orle', 'tressure'];
  var trailing = [];
  if (a.ordinary) {
    var ordDef = H.ORDINARIES[a.ordinary.key];
    var ordText = ordDef.blazon(a.ordinary.line).trim() + ' ' + T[a.ordinary.t].name;
    if (onOrd.length) {
      parts.push('on ' + ordText + ' ' + onOrd.map(function (c) { return chargePhrase(c); }).join(' and '));
    } else if (SURROUNDS.indexOf(a.ordinary.key) !== -1) {
      trailing.push(ordText);
    } else {
      parts.push(ordText);
    }
  }
  if (onField.length) {
    var main = chargePhrase(onField[0]);
    if (onField.length > 1) {
      main += ' between ' + onField.slice(1).map(function (c) { return chargePhrase(c); }).join(' and ');
    }
    parts.push(main);
  }
  if (a.bordure) {
    trailing.push('a bordure ' + (H.LINE_WORD[a.bordure.line] ? H.LINE_WORD[a.bordure.line] + ' ' : '') + T[a.bordure.t].name);
  }
  parts = parts.concat(trailing);
  var body = out + (parts.length ? ', ' + parts.join(', ') : '');
  if (a.supporters) {
    body += '. Supported by two ' + CH[a.supporters.key].plural + ' ' + T[a.supporters.t].name;
  }
  body += '. For a crest, ' + (/^[aeiou]/i.test(H.CRESTS[a.crest].name) ? 'an ' : 'a ') + H.CRESTS[a.crest].name + '.';
  return body.charAt(0).toUpperCase() + body.slice(1);
}

H.generateArms = generateArms;
H.writeBlazon = writeBlazon;
H.MOTTOES = MOTTOES;
H.TONGUES = TONGUES;
H.foreignPhrase = foreignPhrase;
H.collectTags = collectTags;

})(window.Heraldry);
