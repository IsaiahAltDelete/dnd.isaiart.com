// Name generation + lore data: races, deities, calendar, nation titles.
'use strict';

const MONTHS = [
  'Hammer', 'Alturiak', 'Ches', 'Tarsakh', 'Mirtul', 'Kythorn',
  'Flamerule', 'Eleasis', 'Eleint', 'Marpenoth', 'Uktar', 'Nightal'
];

const RACES = {
  human: {
    name: 'Human', plural: 'Humans', adj: 'human',
    growth: 1.15, terrain: { grass: 1.3, forest: 0.9, hills: 0.9, coast: 1.2 },
    color: '#c8b78d'
  },
  elf: {
    name: 'Elf', plural: 'Elves', adj: 'elven',
    growth: 0.8, terrain: { forest: 1.6, grass: 0.9, hills: 0.7, coast: 0.8 },
    color: '#9fd0a5'
  },
  dwarf: {
    name: 'Dwarf', plural: 'Dwarves', adj: 'dwarven',
    growth: 0.9, terrain: { mountain: 1.8, hills: 1.5, grass: 0.6, forest: 0.5 },
    color: '#d29a68'
  },
  halfling: {
    name: 'Halfling', plural: 'Halflings', adj: 'halfling',
    growth: 1.1, terrain: { grass: 1.4, hills: 1.1, forest: 0.8, coast: 0.9 },
    color: '#e5d08f'
  },
  gnome: {
    name: 'Gnome', plural: 'Gnomes', adj: 'gnomish',
    growth: 0.9, terrain: { hills: 1.5, forest: 1.2, grass: 0.8, mountain: 0.9 },
    color: '#c5a3d6'
  },
  orc: {
    name: 'Orc', plural: 'Orcs', adj: 'orcish',
    growth: 1.3, terrain: { badlands: 1.6, hills: 1.2, mountain: 1.1, grass: 0.7 },
    color: '#8fae76'
  }
};

// Deity: domains drive settlement adoption; color used for the faith overlay.
const DEITIES = [
  { name: 'Chauntea',  title: 'the Great Mother',      domain: 'agriculture', color: '#e2c14e', likes: ['grass', 'farm'], races: ['human', 'halfling'] },
  { name: 'Lathander', title: 'the Morninglord',       domain: 'renewal',     color: '#f0a04b', likes: ['coast', 'grass'], races: ['human'] },
  { name: 'Tempus',    title: 'Lord of Battles',       domain: 'war',         color: '#c0392b', likes: ['hills', 'badlands'], races: ['human', 'orc'] },
  { name: 'Mystra',    title: 'the Lady of Mysteries', domain: 'magic',       color: '#7d5fd3', likes: ['tower'], races: ['human', 'elf', 'gnome'] },
  { name: 'Oghma',     title: 'the Binder',            domain: 'knowledge',   color: '#5b8fd9', likes: ['city'], races: ['human', 'gnome'] },
  { name: 'Selûne',    title: 'Our Lady of Silver',    domain: 'moon',        color: '#b8c7e8', likes: ['coast', 'forest'], races: ['human', 'elf'] },
  { name: 'Umberlee',  title: 'the Bitch Queen',       domain: 'sea',         color: '#2e7ba6', likes: ['coast', 'port'], races: ['human'] },
  { name: 'Waukeen',   title: 'the Coinmaiden',        domain: 'trade',       color: '#d4af37', likes: ['trade', 'city'], races: ['human', 'halfling', 'gnome'] },
  { name: 'Silvanus',  title: 'the Oak Father',        domain: 'nature',      color: '#3d7a3d', likes: ['forest', 'grove'], races: ['human', 'elf', 'halfling'] },
  { name: 'Helm',      title: 'the Vigilant One',      domain: 'protection',  color: '#8c98a8', likes: ['border', 'city'], races: ['human', 'dwarf'] },
  { name: 'Ilmater',   title: 'the Crying God',        domain: 'endurance',   color: '#c9c0b4', likes: ['poor'], races: ['human', 'halfling'] },
  { name: 'Bane',      title: 'the Black Hand',        domain: 'tyranny',     color: '#3d3d3d', likes: ['war', 'city'], races: ['human', 'orc'] },
  { name: 'Moradin',   title: 'the Soulforger',        domain: 'forge',       color: '#b56a3c', likes: ['mountain', 'mine'], races: ['dwarf'] },
  { name: 'Corellon',  title: 'First of the Seldarine', domain: 'art',        color: '#7ecfc0', likes: ['forest', 'grove'], races: ['elf'] },
  { name: 'Yondalla',  title: 'the Blessed One',       domain: 'hearth',      color: '#dfc98a', likes: ['grass', 'farm'], races: ['halfling'] },
  { name: 'Gruumsh',   title: 'One-Eye',               domain: 'conquest',    color: '#7a2020', likes: ['badlands', 'war'], races: ['orc'] }
];

const MAGIC_LEVELS = [
  { name: 'Hedge Craft',        desc: 'Cunning-folk and hedge wizards' },
  { name: 'Apprentice Circles', desc: 'Formal apprenticeships arise' },
  { name: 'Guild Arcana',       desc: 'Chartered mage guilds' },
  { name: 'Tower Conclaves',    desc: 'Wizard towers and conclaves' },
  { name: 'High Sorcery',       desc: 'Teleportation circles link cities' },
  { name: 'Mythal Weaving',     desc: 'Wonders of the elder ages rekindled' }
];

// --- Syllable banks per race ---
const NAME_PARTS = {
  human: {
    start: ['Bal', 'Cor', 'Dag', 'El', 'Fen', 'Gart', 'Hul', 'Ir', 'Kel', 'Lor', 'Mar', 'Nor', 'Or', 'Pel', 'Ras', 'Sar', 'Tor', 'Ul', 'Ver', 'Wes', 'Yar', 'Ash', 'Black', 'Bright', 'Cold', 'Deep', 'East', 'Fair', 'Glen', 'Gold', 'Grey', 'High', 'Iron', 'King', 'Lake', 'Mill', 'New', 'Oak', 'Old', 'Raven', 'Red', 'Silver', 'Spring', 'Stone', 'Summer', 'Swift', 'Thorn', 'West', 'White', 'Winter', 'Wolf'],
    mid: ['a', 'e', 'i', 'o', 'u', 'ar', 'en', 'il', 'or', 'un', ''],
    end: ['ford', 'dale', 'crest', 'haven', 'burg', 'moor', 'watch', 'field', 'bridge', 'gate', 'keep', 'stead', 'ton', 'wick', 'mere', 'fall', 'run', 'hollow', 'reach', 'rest', 'shore', 'cliff', 'vale', 'march', 'cross', 'well', 'brook', 'hill', 'wood', 'port']
  },
  elf: {
    start: ['Aer', 'Cael', 'Elu', 'Fael', 'Gala', 'Ilth', 'Lath', 'Myr', 'Nym', 'Quel', 'Sil', 'Sha', 'Tel', 'Thal', 'Yll', 'Eve', 'Ama', 'Cor', 'Lue', 'Syl'],
    mid: ['an', 'ar', 'el', 'en', 'ess', 'ith', 'or', 'ua', 'ae', ''],
    end: ['thil', 'ael', 'myth', 'las', 'anna', 'ellon', 'ora', 'evar', 'ion', 'aleth', 'wyn', 'ande', 'lume', 'ist', 'arel']
  },
  dwarf: {
    start: ['Khaz', 'Bruen', 'Dur', 'Gor', 'Har', 'Kar', 'Mor', 'Thor', 'Bal', 'Grim', 'Dhur', 'Fel', 'Hamm', 'Iron', 'Stone', 'Deep'],
    mid: ['a', 'un', 'ur', 'or', 'ag', 'ad', ''],
    end: ['barak', 'delve', 'forge', 'holm', 'grim', 'dun', 'gard', 'heim', 'hold', 'anvil', 'gate', 'deep', 'karak', 'mund', 'khan']
  },
  halfling: {
    start: ['Green', 'Apple', 'Honey', 'Willow', 'Berry', 'Clover', 'Meadow', 'Bramble', 'Sunny', 'Amber', 'Hazel', 'Toad', 'Puddle', 'Daisy', 'Whistle', 'Butter'],
    mid: ['', '', 'y', 'le'],
    end: ['bottom', 'foot', 'meadow', 'hollow', 'burrow', 'hill', 'dell', 'field', 'crossing', 'garden', 'brook', 'pipe', 'barrel', 'downs', 'shire']
  },
  gnome: {
    start: ['Fizz', 'Cog', 'Glim', 'Nim', 'Tink', 'Wren', 'Bim', 'Fiddle', 'Spark', 'Whim', 'Gear', 'Zook', 'Pim', 'Quill'],
    mid: ['le', 'er', 'a', 'o', ''],
    end: ['wick', 'burrow', 'works', 'warren', 'delve', 'nook', 'hollow', 'gate', 'bend', 'top', 'whistle', 'shine', 'den', 'stack']
  },
  orc: {
    start: ['Gash', 'Krag', 'Mog', 'Ur', 'Zug', 'Grum', 'Shak', 'Thok', 'Varg', 'Blood', 'Bone', 'Skull', 'Dread', 'Grish', 'Nar'],
    mid: ['g', 'k', 'a', 'u', 'ro', ''],
    end: ['maw', 'skull', 'fang', 'gore', 'tusk', 'jaw', 'fist', 'rock', 'pit', 'gash', 'karg', 'mash', 'burz', 'hold', 'camp']
  }
};

const NATION_TITLES = {
  human: ['Kingdom of %', 'Duchy of %', 'Barony of %', 'Free Cities of %', 'March of %', 'Realm of %', 'Principality of %', 'League of %'],
  elf: ['Realm of %', 'Court of %', 'Sylvan Realm of %', 'Elder Kingdom of %', 'Greenwood of %'],
  dwarf: ['Clanhold of %', 'Deep Kingdom of %', 'Forgeholds of %', 'Iron Throne of %', 'Delvings of %'],
  halfling: ['Shire of %', 'Freeholds of %', 'Green Fields of %', 'Homesteads of %'],
  gnome: ['Warrens of %', 'Burrowdom of %', 'Guildholds of %', 'Freeholds of %'],
  orc: ['Horde of %', 'Warband of %', 'Dominion of %', 'Bloodhold of %']
};

const PERSONALITIES = [
  { key: 'aggressive', name: 'Warlike',    desc: 'Seeks conquest and glory in battle' },
  { key: 'mercantile', name: 'Mercantile', desc: 'Prosperity through trade and coin' },
  { key: 'scholarly',  name: 'Scholarly',  desc: 'Pursues arcane and worldly knowledge' },
  { key: 'zealous',    name: 'Zealous',    desc: 'Faith above all; spreads the true creed' },
  { key: 'reclusive',  name: 'Reclusive',  desc: 'Guards its borders and old ways' }
];

const RULER_TITLES = {
  human: ['King', 'Queen', 'Duke', 'Duchess', 'Baron', 'Lord', 'Lady', 'Prince'],
  elf: ['Coronal', 'Lady', 'Lord Speaker', 'High Mage'],
  dwarf: ['Thane', 'High King', 'Forgemaster', 'Deepwarden'],
  halfling: ['Sheriff', 'Elder', 'Mayor', 'Warden'],
  gnome: ['Guildmaster', 'Burgomaster', 'Archtinker'],
  orc: ['Warchief', 'Chieftain', 'Warlord']
};

const RULER_NAMES = {
  human: ['Aldric', 'Beren', 'Cedric', 'Doria', 'Elsbeth', 'Gareth', 'Hilda', 'Ivor', 'Jorah', 'Katria', 'Lucan', 'Mira', 'Osric', 'Petra', 'Rowan', 'Sable', 'Teodric', 'Una', 'Vance', 'Wilhelmina'],
  elf: ['Aravae', 'Belanor', 'Cyrandel', 'Elowen', 'Faelar', 'Ilyana', 'Kyrenic', 'Lyari', 'Naevys', 'Quarion', 'Sylmare', 'Thalanil', 'Vaeril', 'Ylsandra'],
  dwarf: ['Adrik', 'Baern', 'Dagnal', 'Eberk', 'Gunnloda', 'Harbek', 'Kildrak', 'Morgran', 'Orsik', 'Riswynn', 'Thorin', 'Vondal'],
  halfling: ['Alton', 'Cora', 'Eldon', 'Jillian', 'Lyle', 'Merla', 'Osborn', 'Portia', 'Roscoe', 'Seraphina', 'Wendel'],
  gnome: ['Boddynock', 'Dimble', 'Ellyjobell', 'Fonkin', 'Glim', 'Loopmottin', 'Namfoodle', 'Roondar', 'Zanna'],
  orc: ['Grommash', 'Karguk', 'Mazoga', 'Oglub', 'Shagra', 'Thokk', 'Urzoth', 'Yazgash', 'Zogbar']
};

class NameGen {
  constructor(rng) {
    this.rng = rng;
    this.used = new Set();
  }
  settlement(race) {
    const parts = NAME_PARTS[race] || NAME_PARTS.human;
    for (let tries = 0; tries < 30; tries++) {
      let name;
      if (this.rng.chance(0.55)) {
        name = this.rng.pick(parts.start) + this.rng.pick(parts.end);
      } else {
        name = this.rng.pick(parts.start) + this.rng.pick(parts.mid) + this.rng.pick(parts.end);
      }
      name = name[0].toUpperCase() + name.slice(1);
      if (!this.used.has(name) && name.length <= 14) { this.used.add(name); return name; }
    }
    // fallback: numbered
    let i = 2, base = this.rng.pick(parts.start) + this.rng.pick(parts.end);
    while (this.used.has(base + ' ' + this.roman(i))) i++;
    const name = base + ' ' + this.roman(i);
    this.used.add(name);
    return name;
  }
  nation(race, capitalName) {
    const pattern = this.rng.pick(NATION_TITLES[race] || NATION_TITLES.human);
    return pattern.replace('%', capitalName);
  }
  ruler(race) {
    const t = this.rng.pick(RULER_TITLES[race] || RULER_TITLES.human);
    const n = this.rng.pick(RULER_NAMES[race] || RULER_NAMES.human);
    return t + ' ' + n;
  }
  roman(n) {
    const vals = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
    let out = '';
    for (const [v, s] of vals) while (n >= v) { out += s; n -= v; }
    return out;
  }
}

const DRAGON_KINDS = {
  mountain: { kind: 'Red', color: '#d03020', flavor: 'a red wyrm of fire and avarice' },
  snow:     { kind: 'White', color: '#cfe4ee', flavor: 'a white wyrm of rime and hunger' },
  swamp:    { kind: 'Black', color: '#3a3f36', flavor: 'a black wyrm of acid and spite' },
  forest:   { kind: 'Green', color: '#3f7a34', flavor: 'a green wyrm of venom and guile' },
  desert:   { kind: 'Blue', color: '#3560c0', flavor: 'a blue wyrm of storm and tyranny' }
};

const DRAGON_NAMES = ['Vermithrax', 'Skarrazan', 'Umbraxis', 'Chalcyra', 'Maldrieth', 'Old Gnawbone', 'Ashardalon', 'Ryxikor', 'Velcuthimmar', 'Zarlandriss', 'Icingdeath', 'Emberclaw', 'Nyxaraeth', 'Thraxata', 'Gorstravar', 'Cinderhowl'];
