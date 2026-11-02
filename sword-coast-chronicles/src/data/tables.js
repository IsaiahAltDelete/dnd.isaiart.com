// data/tables.js — the flavour catalogues: Faerunian name tables, the pantheon, the
// five factions and their rank ladders, and every line of ambient text the game
// speaks (rumours, barflies, townsfolk, readable books, dreams on a long rest).
//
// PURE DATA + one generator. The only import is core/rng.js, because generateName
// needs a deterministic stream when a caller does not hand one in (HARD RULE 9 —
// nothing in this game touches Math.random). Every catalogue is deep frozen.
//
// SETTING: every name below is published Forgotten Realms material or is built from
// the ethnic naming conventions in docs/SETTING.md section 5. Nothing is coined.
//
// TEXT NOTE: ui/kit.js's bitmap font carries ASCII plus a small pictogram set. It
// has no accented Latin glyphs, so display strings here are written unaccented
// ("Selune", "Faerun", "Nailo") — they would render as tofu boxes otherwise.
//
// Exports (SPEC.md section 3):
//   NAME_TABLES  DEITIES  FACTIONS  TITLES  TAVERN_LINES  FLAVOR_LINES
//   RUMORS  BOOK_TEXTS  INN_DREAMS  generateName(speciesId, r, opts)

import { rng } from '../core/rng.js';

// ---------------------------------------------------------------------------
// 0. deepFreeze + defensive RNG shims. A caller may pass no RNG, a half-built
//    one, or something that throws; none of that may take the game down.
// ---------------------------------------------------------------------------

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const k of Object.keys(o)) deepFreeze(o[k]);
  }
  return o;
}

/** The stream to use: the caller's, else the global campaign stream. */
function stream(r) {
  if (r && typeof r.pick === 'function' && typeof r.next === 'function') return r;
  return rng;
}

/** r.pick, but never throws and never returns undefined for a non-empty list. */
function pick(r, list) {
  if (!Array.isArray(list) || list.length === 0) return '';
  try {
    const v = stream(r).pick(list);
    if (v != null) return v;
  } catch (e) { /* fall through to the deterministic first entry */ }
  return list[0];
}

/** r.chance, but never throws. */
function chance(r, p) {
  try { return !!stream(r).chance(p); } catch (e) { return p >= 0.5; }
}

/** Weighted pick over [value, weight] pairs; falls back to the heaviest entry. */
function pickWeighted(r, pairs) {
  if (!Array.isArray(pairs) || pairs.length === 0) return '';
  try {
    const v = stream(r).pickWeighted(pairs, (e) => e[1]);
    if (v && v[0] != null) return v[0];
  } catch (e) { /* fall through */ }
  let best = pairs[0];
  for (const p of pairs) if (p[1] > best[1]) best = p;
  return best[0];
}

// ===========================================================================
// 1. NAME TABLES
// ===========================================================================
// Shape contract (ui/charcreate.js reads this directly):
//   NAME_TABLES[speciesId] is either
//     (a) a table:  { male:[], female:[], surname:[] }              — one culture
//     (b) a map of named sub-tables, each of shape (a)              — many cultures
//   ui/charcreate.js offers an ethnicity cycler for any species whose entry has
//   more than one sub-table carrying `male`/`female`, which is exactly humans,
//   half-elves and half-orcs.

// --- humans, by ethnicity (PHB / Sword Coast Adventurer's Guide) ------------

const CHONDATHAN_M = ['Darvin', 'Dorn', 'Evendur', 'Gorstag', 'Grim', 'Helm', 'Malark', 'Morn', 'Randal', 'Stedd'];
const CHONDATHAN_F = ['Arveene', 'Esvele', 'Jhessail', 'Kerri', 'Lureene', 'Miri', 'Rowan', 'Shandri', 'Tessele'];
const CHONDATHAN_S = ['Amblecrown', 'Buckman', 'Dundragon', 'Evenwood', 'Greycastle', 'Tallstag'];

const ILLUSKAN_M = ['Ander', 'Blath', 'Bran', 'Frath', 'Geth', 'Lander', 'Luth', 'Malcer', 'Stor', 'Taman', 'Urth'];
const ILLUSKAN_F = ['Amafrey', 'Betha', 'Cefrey', 'Kethra', 'Mara', 'Olga', 'Silifrey', 'Westra'];
const ILLUSKAN_S = ['Brightwood', 'Helder', 'Hornraven', 'Lackman', 'Stormwind', 'Windrivver'];

const DAMARAN_M = ['Bor', 'Fodel', 'Glar', 'Grigor', 'Igan', 'Ivor', 'Kosef', 'Mival', 'Orel', 'Pavel', 'Sergor'];
const DAMARAN_F = ['Alethra', 'Kara', 'Katernin', 'Mara', 'Natali', 'Olma', 'Tana', 'Zora'];
const DAMARAN_S = ['Bersk', 'Chernin', 'Dotsk', 'Kulenov', 'Marsk', 'Nemetsk', 'Shemov', 'Starag'];

const CALISHITE_M = ['Aseir', 'Bardeid', 'Haseid', 'Khemed', 'Mehmen', 'Sudeiman', 'Zasheir'];
const CALISHITE_F = ['Atala', 'Ceidil', 'Hama', 'Jasmal', 'Meilil', 'Seipora', 'Yasheira', 'Zasheida'];
const CALISHITE_S = ['Basha', 'Dumein', 'Jassan', 'Khalid', 'Mostana', 'Pashar', 'Rein'];

const TURAMI_M = ['Anton', 'Diero', 'Marcon', 'Pieron', 'Rimardo', 'Romero', 'Salazar', 'Umbero'];
const TURAMI_F = ['Balama', 'Dona', 'Faila', 'Jalana', 'Luisa', 'Marta', 'Quara', 'Selise', 'Vonda'];
const TURAMI_S = ['Agosto', 'Astorio', 'Calabra', 'Domine', 'Falone', 'Marivaldi', 'Pisacar', 'Ramondo'];

const RASHEMI_M = ['Borivik', 'Faurgar', 'Jandar', 'Kanithar', 'Madislak', 'Ramaz', 'Shaumar', 'Vladislak'];
const RASHEMI_F = ['Fyevarra', 'Hulmarra', 'Immith', 'Imzel', 'Navarra', 'Shevarra', 'Tammith', 'Yuldra'];
const RASHEMI_S = ['Chergoba', 'Dyernina', 'Iltazyara', 'Murnyethara', 'Stayanoga', 'Ulmokina'];

/** A human ethnic table. Tethyrians share Chondathan given names by custom. */
function ethnic(male, female, surname, o = {}) {
  return {
    male,
    female,
    surname,
    // aliases so a lazier reader still finds the lists
    m: male,
    f: female,
    s: surname,
    label: o.label || '',
    region: o.region || '',
    desc: o.desc || '',
  };
}

const HUMAN_TABLES = {
  chondathan: ethnic(CHONDATHAN_M, CHONDATHAN_F, CHONDATHAN_S, {
    label: 'Chondathan', region: 'Heartlands, the Dessarin, most of Phandalin',
    desc: 'Tall, tawny, and everywhere along the Sword Coast. Half of Phandalin answers to a Chondathan name.',
  }),
  illuskan: ethnic(ILLUSKAN_M, ILLUSKAN_F, ILLUSKAN_S, {
    label: 'Illuskan', region: 'Neverwinter, Luskan, the Uthgardt lands',
    desc: 'Pale northerners out of Illusk and the Uthgardt dales. Common as far south as Waterdeep.',
  }),
  tethyrian: ethnic(CHONDATHAN_M, CHONDATHAN_F, CHONDATHAN_S, {
    label: 'Tethyrian', region: 'Baldur\'s Gate to Waterdeep',
    desc: 'The dusky folk of the western coast. They use Chondathan names and have for four hundred years.',
  }),
  damaran: ethnic(DAMARAN_M, DAMARAN_F, DAMARAN_S, {
    label: 'Damaran', region: 'The Vast, Impiltur, and the caravan roads west',
    desc: 'Easterners, sturdy and plain-spoken, who came west with the ore trade and stayed.',
  }),
  calishite: ethnic(CALISHITE_M, CALISHITE_F, CALISHITE_S, {
    label: 'Calishite', region: 'Calimshan, and every port that trades with it',
    desc: 'Short, dark and old in civilisation. Calishite merchant houses reach as far north as Neverwinter.',
  }),
  turami: ethnic(TURAMI_M, TURAMI_F, TURAMI_S, {
    label: 'Turami', region: 'The Vilhon Reach and the inner sea',
    desc: 'Tall, mahogany-skinned southerners with a fondness for long vowels and longer feuds.',
  }),
  rashemi: ethnic(RASHEMI_M, RASHEMI_F, RASHEMI_S, {
    label: 'Rashemi', region: 'Rashemen, Thay, the cold east',
    desc: 'Broad, dark-eyed folk of the witch-lands. A Rashemi this far west is usually running from Thay.',
  }),
};

/** Weighted spread for the Sword Coast North: Chondathan and Illuskan dominate. */
const HUMAN_ETHNIC_WEIGHTS = [
  ['chondathan', 34], ['illuskan', 26], ['tethyrian', 17],
  ['damaran', 8], ['calishite', 6], ['turami', 5], ['rashemi', 4],
];

export const HUMAN_ETHNICITIES = Object.freeze(Object.keys(HUMAN_TABLES));

// --- dwarves ---------------------------------------------------------------

const DWARF_M = ['Adrik', 'Baern', 'Darrak', 'Delg', 'Eberk', 'Fargrim', 'Gardain', 'Harbek', 'Kildrak',
  'Morgran', 'Orsik', 'Rangrim', 'Rurik', 'Taklinn', 'Thoradin', 'Thorin', 'Tordek', 'Traubon', 'Ulfgar', 'Veit'];
const DWARF_F = ['Amber', 'Artin', 'Audhild', 'Bardryn', 'Dagnal', 'Eldeth', 'Gunnloda', 'Gurdis', 'Helja',
  'Hlin', 'Ilde', 'Kathra', 'Kristryd', 'Liftrasa', 'Mardred', 'Riswynn', 'Sannl', 'Torbera', 'Vistra'];
const DWARF_CLAN = ['Balderk', 'Battlehammer', 'Brawnanvil', 'Dankil', 'Fireforge', 'Frostbeard', 'Gorunn',
  'Holderhek', 'Ironfist', 'Loderr', 'Lutgehr', 'Rockseeker', 'Rumnaheim', 'Strakeln', 'Torunn', 'Ungart'];

// --- elves (Tel'Quessir) ---------------------------------------------------

const ELF_M = ['Adran', 'Aelar', 'Aramil', 'Arannis', 'Aust', 'Beiro', 'Berrian', 'Carric', 'Enialis', 'Erdan',
  'Erevan', 'Galinndan', 'Hadarai', 'Heian', 'Himo', 'Immeral', 'Ivellios', 'Laucian', 'Mindartis', 'Paelias',
  'Peren', 'Quarion', 'Riardon', 'Rolen', 'Soveliss', 'Thamior', 'Tharivol', 'Theren', 'Varis'];
const ELF_F = ['Adrie', 'Althaea', 'Anastrianna', 'Andraste', 'Antinua', 'Bethrynna', 'Birel', 'Caelynn',
  'Drusilia', 'Enna', 'Felosial', 'Ielenia', 'Jelenneth', 'Keyleth', 'Leshanna', 'Lia', 'Meriele', 'Mialee',
  'Naivara', 'Quelenna', 'Sariel', 'Shanairra', 'Shava', 'Silaqui', 'Theirastra', 'Thia', 'Vadania',
  'Valanthe', 'Xanaphia'];
const ELF_FAMILY = ['Amakiir', 'Amastacia', 'Galanodel', 'Holimion', 'Ilphelkiir', 'Liadon', 'Meliamne',
  'Nailo', 'Siannodel', 'Xiloscient'];

/** Elven family names are compounds; the Common translation is half the point. */
const ELF_FAMILY_MEANING = {
  Amakiir: 'Gemflower',
  Amastacia: 'Starflower',
  Galanodel: 'Moonwhisper',
  Holimion: 'Diamonddew',
  Ilphelkiir: 'Gemblossom',
  Liadon: 'Silverfrond',
  Meliamne: 'Oakenheel',
  Nailo: 'Nightbreeze',
  Siannodel: 'Moonbrook',
  Xiloscient: 'Goldpetal',
};

// --- halflings -------------------------------------------------------------

const HALFLING_M = ['Alton', 'Ander', 'Cade', 'Corrin', 'Eldon', 'Errich', 'Finnan', 'Garret', 'Lindal',
  'Lyle', 'Merric', 'Milo', 'Osborn', 'Perrin', 'Reed', 'Roscoe', 'Wellby'];
const HALFLING_F = ['Andry', 'Bree', 'Callie', 'Cora', 'Euphemia', 'Jillian', 'Kithri', 'Lavinia', 'Lidda',
  'Merla', 'Nedda', 'Paela', 'Portia', 'Seraphina', 'Shaena', 'Trym', 'Vani', 'Verna'];
const HALFLING_FAMILY = ['Brushgather', 'Goodbarrel', 'Greenbottle', 'High-hill', 'Hilltopple', 'Leagallow',
  'Tealeaf', 'Thorngage', 'Tosscobble', 'Underbough'];

// --- gnomes ----------------------------------------------------------------

const GNOME_M = ['Alston', 'Alvyn', 'Boddynock', 'Brocc', 'Burgell', 'Dimble', 'Eldon', 'Erky', 'Fonkin',
  'Frug', 'Gerbo', 'Gimble', 'Glim', 'Jebeddo', 'Kellen', 'Namfoodle', 'Orryn', 'Roondar', 'Seebo',
  'Sindri', 'Warryn', 'Wrenn', 'Zook'];
const GNOME_F = ['Bimpnottin', 'Breena', 'Caramip', 'Carlin', 'Donella', 'Duvamil', 'Ella', 'Ellyjobell',
  'Ellywick', 'Lilli', 'Loopmottin', 'Lorilla', 'Mardnab', 'Nissa', 'Nyx', 'Oda', 'Orla', 'Roywyn',
  'Shamil', 'Tana', 'Waywocket', 'Zanna'];
const GNOME_CLAN = ['Beren', 'Daergel', 'Folkor', 'Garrick', 'Murnig', 'Nackle', 'Ningel', 'Raulnor',
  'Scheppen', 'Timbers', 'Turen'];

// --- orcs ------------------------------------------------------------------

const ORC_M = ['Dench', 'Feng', 'Gell', 'Henk', 'Holg', 'Imsh', 'Keth', 'Krusk', 'Mhurren', 'Ront', 'Shump', 'Thokk'];
const ORC_F = ['Baggi', 'Emen', 'Engong', 'Kansif', 'Myev', 'Neega', 'Ovak', 'Ownka', 'Shautha', 'Sutha',
  'Vola', 'Volen', 'Yevelda'];
/** Orcs of Many-Arrows take a deed-name rather than a family name. */
const ORC_EPITHET = ['One-Eye', 'Skullsplitter', 'Ironjaw', 'Bonebreaker', 'Cragfist', 'Bloodtusk',
  'Nightwolf', 'Stonehand', 'Spearbiter', 'Two-Axe'];

// --- dragonborn ------------------------------------------------------------

const DRAGONBORN_M = ['Arjhan', 'Balasar', 'Bharash', 'Donaar', 'Ghesh', 'Heskan', 'Kriv', 'Medrash',
  'Mehen', 'Nadarr', 'Pandjed', 'Patrin', 'Rhogar', 'Shamash', 'Shedinn', 'Torinn'];
const DRAGONBORN_F = ['Akra', 'Biri', 'Daar', 'Farideh', 'Harann', 'Havilar', 'Jheri', 'Kava', 'Korinn',
  'Mishann', 'Nala', 'Perra', 'Raiann', 'Sora', 'Surina', 'Thava', 'Uadjit'];
const DRAGONBORN_CLAN = ['Clethtinthiallor', 'Daardendrian', 'Delmirev', 'Drachedandion', 'Fenkenkabradon',
  'Kepeshkmolik', 'Kerrhylon', 'Kimbatuul', 'Linxakasendalor', 'Myastan', 'Nemmonis', 'Norixius',
  'Ophinshtalajiir', 'Prexijandilin', 'Shestendeliath', 'Turnuroth', 'Verthisathurgiesh', 'Yarjerit'];

// --- tieflings -------------------------------------------------------------

const TIEFLING_M = ['Akmenos', 'Amnon', 'Barakas', 'Damakos', 'Ekemon', 'Iados', 'Kairon', 'Leucis',
  'Melech', 'Mordai', 'Morthos', 'Pelaios', 'Skamos', 'Therai'];
const TIEFLING_F = ['Akta', 'Anakis', 'Bryseis', 'Criella', 'Damaia', 'Ea', 'Kallista', 'Lerissa',
  'Makaria', 'Nemeia', 'Orianna', 'Phelaia', 'Rieta'];
/** Virtue names: chosen in adulthood, and worn instead of an infernal name. */
const TIEFLING_VIRTUE = ['Art', 'Carrion', 'Chant', 'Creed', 'Despair', 'Excellence', 'Fear', 'Glory',
  'Hope', 'Ideal', 'Music', 'Nowhere', 'Open', 'Poetry', 'Quest', 'Random', 'Reverence', 'Sorrow',
  'Temerity', 'Torment', 'Weary'];

// --- tabaxi ----------------------------------------------------------------

const TABAXI_NAME = ['Cloud on the Mountaintop', 'Five Timber', 'Jade Shoe', 'Left-Handed Hummingbird',
  'Seven Thundercloud', 'Skirt of Snakes', 'Smoking Mirror', 'Two Dry Cloaks', 'Stalks the Reeds',
  'Answers the Wind', 'Flint Knife', 'Broken Feather'];
const TABAXI_CLAN = ['Bright Cliffs', 'Distant Rain', 'Mountain Tree', 'Rumbling River', 'Snoring Mountain',
  'Winter Grass', 'Dry Wells'];
/** Short use-names for the impatient folk of the north. */
const TABAXI_SHORT = ['Cloud', 'Timber', 'Jade', 'Hummingbird', 'Thundercloud', 'Mirror', 'Flint', 'Reed'];

// --- goliaths --------------------------------------------------------------

const GOLIATH_NAME = ['Aukan', 'Eglath', 'Gae-Al', 'Gauthak', 'Ilikan', 'Keothi', 'Kuori', 'Lo-Kag',
  'Manneo', 'Maveith', 'Nalla', 'Orilo', 'Paavu', 'Pethani', 'Thalai', 'Thotham', 'Uthal', 'Vaunea', 'Vimak'];
const GOLIATH_CLAN = ['Anakalathai', 'Elanithino', 'Gathakanathi', 'Kolae-Gileah', 'Thuliaga',
  'Thunukalathi', 'Vaimei-Laga'];
/** A goliath's nickname is earned, changes with the deed, and is used daily. */
const GOLIATH_NICKNAME = ['Bearkiller', 'Dawncaller', 'Fearless', 'Flintfinder', 'Horncarver', 'Keeneye',
  'Lonehunter', 'Longleaper', 'Rootsmasher', 'Skywatcher', 'Steadyhand', 'Threadtwister', 'Twice-Orphaned',
  'Wordpainter'];

// --- the catalogue ---------------------------------------------------------

export const NAME_TABLES = deepFreeze({
  // Humans and the two half-species carry named sub-tables; everyone else is flat.
  human: HUMAN_TABLES,

  aasimar: {
    // Aasimar are born to mortal families and are raised with the names of their
    // region, so they draw straight from the human tables.
    chondathan: HUMAN_TABLES.chondathan,
    illuskan: HUMAN_TABLES.illuskan,
    tethyrian: HUMAN_TABLES.tethyrian,
    damaran: HUMAN_TABLES.damaran,
    calishite: HUMAN_TABLES.calishite,
    turami: HUMAN_TABLES.turami,
    rashemi: HUMAN_TABLES.rashemi,
  },

  'half-elf': {
    chondathan: HUMAN_TABLES.chondathan,
    illuskan: HUMAN_TABLES.illuskan,
    tethyrian: HUMAN_TABLES.tethyrian,
    damaran: HUMAN_TABLES.damaran,
    calishite: HUMAN_TABLES.calishite,
    turami: HUMAN_TABLES.turami,
    rashemi: HUMAN_TABLES.rashemi,
    elven: ethnic(ELF_M, ELF_F, ELF_FAMILY, {
      label: 'Elven', region: 'Neverwinter Wood, Ardeep, the Moonshaes',
      desc: 'Raised among the Tel\'Quessir, and named for a house that may never quite claim them.',
    }),
  },

  'half-orc': {
    orcish: ethnic(ORC_M, ORC_F, ORC_EPITHET, {
      label: 'Orcish', region: 'Many-Arrows, the Spine of the World',
      desc: 'A blunt given name and a deed-name earned in front of witnesses.',
    }),
    chondathan: HUMAN_TABLES.chondathan,
    illuskan: HUMAN_TABLES.illuskan,
    damaran: HUMAN_TABLES.damaran,
  },

  elf: {
    male: ELF_M, female: ELF_F, surname: ELF_FAMILY,
    m: ELF_M, f: ELF_F, s: ELF_FAMILY,
    family: ELF_FAMILY,
    familyMeaning: ELF_FAMILY_MEANING,
    label: 'Elven',
    desc: 'A child name, an adult name at a hundred years, and a family name that translates into Common.',
  },

  dwarf: {
    male: DWARF_M, female: DWARF_F, surname: DWARF_CLAN,
    m: DWARF_M, f: DWARF_F, s: DWARF_CLAN,
    clan: DWARF_CLAN,
    label: 'Dwarven',
    desc: 'Given name plus clan name, and the clan name is the half that matters.',
  },

  halfling: {
    male: HALFLING_M, female: HALFLING_F, surname: HALFLING_FAMILY,
    m: HALFLING_M, f: HALFLING_F, s: HALFLING_FAMILY,
    family: HALFLING_FAMILY,
    label: 'Halfling',
    desc: 'A friendly given name and a family name that usually describes a farm.',
  },

  gnome: {
    male: GNOME_M, female: GNOME_F, surname: GNOME_CLAN,
    m: GNOME_M, f: GNOME_F, s: GNOME_CLAN,
    clan: GNOME_CLAN,
    label: 'Gnomish',
    desc: 'Gnomes collect names the way they collect everything else; the clan name is the one on the ledger.',
  },

  orc: {
    male: ORC_M, female: ORC_F, surname: ORC_EPITHET,
    m: ORC_M, f: ORC_F, s: ORC_EPITHET,
    epithet: ORC_EPITHET,
    label: 'Orcish',
    desc: 'One hard syllable, and a deed-name if the deed was worth witnessing.',
  },

  dragonborn: {
    male: DRAGONBORN_M, female: DRAGONBORN_F, surname: DRAGONBORN_CLAN,
    m: DRAGONBORN_M, f: DRAGONBORN_F, s: DRAGONBORN_CLAN,
    clan: DRAGONBORN_CLAN,
    label: 'Draconic',
    desc: 'Clan first in formal speech: Verthisathurgiesh Mehen. Given name first among friends.',
  },

  tiefling: {
    male: TIEFLING_M, female: TIEFLING_F, surname: [],
    m: TIEFLING_M, f: TIEFLING_F, s: [],
    virtue: TIEFLING_VIRTUE,
    infernalMale: TIEFLING_M,
    infernalFemale: TIEFLING_F,
    label: 'Infernal or virtue',
    desc: 'An infernal name inherited, or a virtue name chosen in adulthood and answered to instead.',
  },

  tabaxi: {
    male: TABAXI_NAME, female: TABAXI_NAME, surname: TABAXI_CLAN,
    m: TABAXI_NAME, f: TABAXI_NAME, s: TABAXI_CLAN,
    name: TABAXI_NAME,
    clan: TABAXI_CLAN,
    short: TABAXI_SHORT,
    label: 'Tabaxi',
    desc: 'A whole descriptive phrase for a name, a clan named for a place, and a one-word use-name for strangers.',
  },

  goliath: {
    male: GOLIATH_NAME, female: GOLIATH_NAME, surname: GOLIATH_CLAN,
    m: GOLIATH_NAME, f: GOLIATH_NAME, s: GOLIATH_CLAN,
    clan: GOLIATH_CLAN,
    nickname: GOLIATH_NICKNAME,
    label: 'Goliath',
    desc: 'A birth name, a clan name, and a nickname the tribe reassigns whenever you earn a better one.',
  },
});

/** Per-species naming behaviour for generateName. */
const NAME_RULES = {
  human: { surnameChance: 0.85, ethnic: true },
  aasimar: { surnameChance: 0.85, ethnic: true },
  'half-elf': { surnameChance: 0.8, ethnic: true },
  'half-orc': { surnameChance: 0.5, ethnic: true },
  elf: { surnameChance: 0.85 },
  dwarf: { surnameChance: 0.9 },
  halfling: { surnameChance: 0.9 },
  gnome: { surnameChance: 0.8 },
  orc: { surnameChance: 0.35 },
  dragonborn: { surnameChance: 0.75 },
  tiefling: { surnameChance: 0, virtueChance: 0.4 },
  tabaxi: { surnameChance: 0, shortChance: 0.35 },
  goliath: { surnameChance: 0.25, nicknameChance: 0.35 },
};

/** Species that follow another species' table when they have none of their own. */
const NAME_ALIASES = {
  'wood-elf': 'elf', 'high-elf': 'elf', drow: 'elf', eladrin: 'elf',
  'forest-gnome': 'gnome', 'rock-gnome': 'gnome',
  'mountain-dwarf': 'dwarf', 'hill-dwarf': 'dwarf', duergar: 'dwarf',
  'lightfoot-halfling': 'halfling', 'stout-halfling': 'halfling',
  goblin: 'orc', hobgoblin: 'orc', bugbear: 'orc',
  human: 'human',
};

// ---------------------------------------------------------------------------
// generateName — the one function this module owes the rest of the game.
// ---------------------------------------------------------------------------

/** Normalise the many ways a caller says "male"/"female"/"either". */
function genderOf(r, opts) {
  const raw = String(opts.gender || opts.sex || opts.body || '').toLowerCase();
  if (raw === 'm' || raw === 'male' || raw === 'man') return 'male';
  if (raw === 'f' || raw === 'female' || raw === 'woman') return 'female';
  // 'n', 'nb', '' or anything unrecognised: let the stream decide.
  return chance(r, 0.5) ? 'male' : 'female';
}

/** Is this entry a flat table (has male/female arrays) or a map of sub-tables? */
function isFlatTable(t) {
  return !!t && (Array.isArray(t.male) || Array.isArray(t.female) || Array.isArray(t.m) || Array.isArray(t.f));
}

/** The sub-table keys of a multi-culture entry, in declaration order. */
function subTableKeys(t) {
  if (!t || typeof t !== 'object') return [];
  return Object.keys(t).filter((k) => isFlatTable(t[k]));
}

/**
 * Pick an ethnicity for a multi-culture species. Humans (and the half-species,
 * and aasimar raised among them) use the Sword Coast spread; anything else is
 * uniform over whatever sub-tables it has.
 */
function chooseEthnicity(speciesId, t, r, want) {
  const keys = subTableKeys(t);
  if (!keys.length) return null;
  const asked = String(want || '').toLowerCase();
  if (asked && keys.includes(asked)) return asked;
  if (speciesId === 'human' || speciesId === 'aasimar') {
    const w = HUMAN_ETHNIC_WEIGHTS.filter((p) => keys.includes(p[0]));
    if (w.length) return pickWeighted(r, w);
  }
  if (speciesId === 'half-elf') {
    // Most half-elves of the North are raised human; a strong minority elven.
    const w = HUMAN_ETHNIC_WEIGHTS.filter((p) => keys.includes(p[0])).map((p) => [p[0], p[1] * 0.7]);
    if (keys.includes('elven')) w.push(['elven', 30]);
    if (w.length) return pickWeighted(r, w);
  }
  if (speciesId === 'half-orc') {
    const w = [];
    if (keys.includes('orcish')) w.push(['orcish', 55]);
    for (const k of keys) if (k !== 'orcish') w.push([k, 15]);
    if (w.length) return pickWeighted(r, w);
  }
  return pick(r, keys);
}

/**
 * Generate a name in the manner of `speciesId`.
 *
 * @param {string} speciesId  a SPECIES id ('human', 'dwarf', 'half-orc'...)
 * @param {object} r          an RNG from core/rng.js; the global stream if omitted
 * @param {object} opts       { gender:'m'|'f'|'male'|'female'|'n', body:'m'|'f'|'n',
 *                              ethnicity:'illuskan', withSurname:bool, short:bool }
 * @returns {string} "Given Surname", or a single name where the culture uses one.
 */
export function generateName(speciesId, r, opts = {}) {
  const o = (opts && typeof opts === 'object') ? opts : {};
  const key = NAME_ALIASES[speciesId] && !NAME_TABLES[speciesId]
    ? NAME_ALIASES[speciesId]
    : (NAME_TABLES[speciesId] ? speciesId : 'human');
  const entry = NAME_TABLES[key] || NAME_TABLES.human;
  const rules = NAME_RULES[key] || NAME_RULES.human;
  const gender = genderOf(r, o);

  // Which flat table are we drawing from?
  let table = entry;
  if (!isFlatTable(entry)) {
    const eth = chooseEthnicity(key, entry, r, o.ethnicity);
    table = (eth && entry[eth]) || NAME_TABLES.human.chondathan;
  }

  const givens = (gender === 'female' ? (table.female || table.f) : (table.male || table.m))
    || table.male || table.m || table.name || [];
  const surnames = table.surname || table.s || table.family || table.clan || [];

  // --- the cultures that answer to one name ---------------------------------

  if (key === 'tiefling') {
    if (chance(r, rules.virtueChance)) return pick(r, TIEFLING_VIRTUE) || 'Hope';
    const given = pick(r, givens) || 'Damakos';
    return given;
  }

  if (key === 'tabaxi') {
    if (o.short === true || (o.short !== false && chance(r, rules.shortChance))) {
      return pick(r, TABAXI_SHORT) || 'Cloud';
    }
    const given = pick(r, TABAXI_NAME) || 'Five Timber';
    if (o.withSurname === true) {
      const clan = pick(r, TABAXI_CLAN);
      return clan ? `${given} of ${clan}` : given;
    }
    // A few canon tabaxi names run past what a name field can show. Tabaxi give
    // outsiders a one-word use-name for exactly this reason, so use one.
    if (given.length > 20 && o.short !== false) return pick(r, TABAXI_SHORT) || 'Cloud';
    return given;
  }

  if (key === 'goliath') {
    const given = pick(r, GOLIATH_NAME) || 'Uthal';
    if (o.withSurname === true) {
      const clan = pick(r, GOLIATH_CLAN);
      return clan ? `${given} ${clan}` : given;
    }
    if (o.withSurname !== false && chance(r, rules.nicknameChance)) {
      const nick = pick(r, GOLIATH_NICKNAME);
      return nick ? `${given} ${nick}` : given;
    }
    return given;
  }

  // --- everyone else: given, and usually a family/clan name -----------------

  const given = pick(r, givens) || pick(r, table.male || table.m || []) || 'Ander';
  const wantSurname = o.withSurname === true ? true
    : o.withSurname === false ? false
      : chance(r, rules.surnameChance);
  if (!wantSurname || !surnames.length) return String(given);

  const surname = pick(r, surnames);
  return surname ? `${given} ${surname}` : String(given);
}

/** The Common translation of an elven family name, when there is one. */
export function elfFamilyMeaning(family) {
  return ELF_FAMILY_MEANING[family] || '';
}

/** A random Sword Coast human ethnicity id, weighted for the region. */
export function randomEthnicity(r) {
  return pickWeighted(r, HUMAN_ETHNIC_WEIGHTS) || 'chondathan';
}

/** The named cultures a species can be rolled from ([] for single-culture folk). */
export function ethnicitiesOf(speciesId) {
  const entry = NAME_TABLES[speciesId];
  if (!entry || isFlatTable(entry)) return [];
  return subTableKeys(entry);
}

// ===========================================================================
// 2. DEITIES — the Faerunian pantheon
// ===========================================================================
// Domains are the canonical 5e domains from the Sword Coast Adventurer's Guide.
// Only some of them have a cleric subclass implemented (see PLAYABLE_DOMAINS);
// `suggestedDomain()` maps a god onto one that exists so character creation can
// always offer a legal pick.

const ALIGN_NAMES = {
  LG: 'Lawful Good', NG: 'Neutral Good', CG: 'Chaotic Good',
  LN: 'Lawful Neutral', N: 'Neutral', CN: 'Chaotic Neutral',
  LE: 'Lawful Evil', NE: 'Neutral Evil', CE: 'Chaotic Evil',
};

function titleCaseWord(s) { return String(s).charAt(0).toUpperCase() + String(s).slice(1); }

/**
 * @param id        kebab id, matching what a Character stores in flags.deity
 * @param name      display name (unaccented for the bitmap font)
 * @param title     the epithet the faithful use: "Lady Luck", "the Morninglord"
 * @param alignment two- or one-letter alignment code
 * @param domains   canonical cleric domains, lowercase ids
 * @param o         { symbol, portfolio, dogma, desc, color, pc, race, domain }
 */
function god(id, name, title, alignment, domains, o = {}) {
  return {
    id,
    name,
    title,
    alignment,
    align: alignment,                                  // ui/charcreate.js reads .align
    alignmentName: ALIGN_NAMES[alignment] || alignment,
    domains: domains.slice(),
    domain: o.domain || domains.map(titleCaseWord).join(' / '),
    symbol: o.symbol || '',
    portfolio: o.portfolio || '',
    dogma: o.dogma || '',
    desc: o.desc || o.dogma || '',
    color: o.color || '#c8b58a',
    race: o.race || null,                              // racial pantheon, if any
    pc: o.pc !== false,                                // offered at character creation
  };
}

const DEITY_LIST = [
  god('tymora', 'Tymora', 'Lady Luck', 'CG', ['trickery'], {
    symbol: 'A face-up coin.', portfolio: 'Good fortune, skill, victory, adventurers',
    dogma: 'Fortune favours the bold. Be bold, and do not come whining to me when you are not.',
    desc: 'Lady Luck. Her shrine stands at the heart of Phandalin and Sister Garaele keeps it.',
    color: '#e6c65a',
  }),
  god('beshaba', 'Beshaba', 'the Maid of Misfortune', 'CE', ['trickery'], {
    symbol: 'Black antlers.', portfolio: 'Bad luck, accidents, random malice',
    dogma: 'Toast me first, or I will be remembered second. Everything you have, I can take on the way home.',
    desc: "Tymora's dark twin. Sailors and gamblers pour the first cup for her so she will look elsewhere.",
    color: '#7a3a5a', pc: false,
  }),
  god('lathander', 'Lathander', 'the Morninglord', 'NG', ['life', 'light'], {
    symbol: 'A road travelling into a sunrise.', portfolio: 'Birth, renewal, dawn, honest labour',
    dogma: 'Every dawn is a door. Walk through it with your debts paid and your hands willing.',
    desc: 'God of new beginnings and the honest work of the day. Farmers and paladins both greet him at sunrise.',
    color: '#f0b24a',
  }),
  god('selune', 'Selune', 'Our Lady of Silver', 'CG', ['knowledge', 'life', 'twilight'], {
    symbol: 'A pair of eyes surrounded by seven stars.', portfolio: 'The moon, stars, navigation, wanderers',
    dogma: 'Take the light I give you and pass it on. The dark is only what has not been looked at yet.',
    desc: 'Guide of travellers, lycanthropes and the lost, and the eternal enemy of her sister Shar.',
    color: '#c8d8f0',
  }),
  god('shar', 'Shar', 'Mistress of the Night', 'NE', ['death', 'trickery'], {
    symbol: 'A black disc encircled with a purple border.', portfolio: 'Darkness, loss, secrets, forgetting',
    dogma: 'Bring me your grief and I will take it, and everything it was attached to.',
    desc: 'She offers the comfort of forgetting, and charges the whole of you for it.',
    color: '#4a3060', pc: false,
  }),
  god('tempus', 'Tempus', 'Lord of Battles', 'N', ['war'], {
    symbol: 'An upright flaming sword.', portfolio: 'War, courage, the sworn soldier',
    dogma: 'I favour no cause and no banner. Meet the blade honestly and I will be watching.',
    desc: 'God of war who takes no side, only courage. Every mercenary on the Sword Coast knows his name.',
    color: '#b04a3a',
  }),
  god('mystra', 'Mystra', 'the Lady of Mysteries', 'NG', ['knowledge', 'arcana'], {
    symbol: 'A circle of seven blue-white stars with a red mist at the centre.',
    portfolio: 'Magic, the Weave, spells and those who cast them',
    dogma: 'The Weave is a loan, not a gift. Use it, teach it, and never let it be closed to others.',
    desc: 'Keeper of the Weave from which every spell is drawn. She has died twice and come back both times.',
    color: '#7a6ae0',
  }),
  god('kelemvor', 'Kelemvor', 'Judge of the Damned', 'LN', ['death', 'grave'], {
    symbol: 'An upright skeletal arm holding balanced scales.', portfolio: 'Death, the dead, fair judgement',
    dogma: 'Death is not a punishment and not a reward. Come when called and be weighed honestly.',
    desc: 'Lord of the Dead, who sees the departed treated fairly and hates the undead above all things.',
    color: '#9aa0a8',
  }),
  god('chauntea', 'Chauntea', 'the Great Mother', 'NG', ['life'], {
    symbol: 'A sheaf of grain, or a blooming rose over grain.', portfolio: 'Agriculture, plants, the seasons',
    dogma: 'Put your hands in the earth. What you feed will feed you, and neither of you needs to be told twice.',
    desc: 'Every farmstead on the Triboar Trail says her name at harvest, and the Alderleafs say it twice.',
    color: '#8ab04a',
  }),
  god('oghma', 'Oghma', 'the Binder of What Is Known', 'N', ['knowledge'], {
    symbol: 'A blank scroll.', portfolio: 'Knowledge, invention, inspiration, bards',
    dogma: 'Knowledge withheld rots. Knowledge given away doubles. Write it down before you die of it.',
    desc: 'Lord of Knowledge, whose priests hoard books the way dragons hoard gold.',
    color: '#d8cfa8',
  }),
  god('silvanus', 'Silvanus', 'the Oak Father', 'N', ['nature'], {
    symbol: 'An oak leaf.', portfolio: 'Wild nature, druids, the balance',
    dogma: 'The axe is not evil. The hundredth axe is. Learn to count.',
    desc: 'Keeper of the balance between the wild and the axe. The Emerald Enclave speaks his name most.',
    color: '#4a8a4a',
  }),
  god('mielikki', 'Mielikki', 'Our Lady of the Forest', 'NG', ['nature'], {
    symbol: "A unicorn's head.", portfolio: 'Forests, rangers, druids, autumn',
    dogma: 'Walk lightly, kill only what you will use, and leave the wood able to forgive you.',
    desc: 'She watches over Neverwinter Wood, and the rangers who keep the Triboar Trail walkable.',
    color: '#6ab06a',
  }),
  god('talos', 'Talos', 'the Storm Lord', 'CE', ['tempest'], {
    symbol: 'Three lightning bolts radiating from a central point.',
    portfolio: 'Storms, destruction, earthquakes, wanton ruin',
    dogma: 'Nothing you build is owed a second season. Bow when I pass and I may pass.',
    desc: 'The Destroyer. Appeased on the coast road, never loved, never fully out of earshot.',
    color: '#5a7ac0', pc: false,
  }),
  god('umberlee', 'Umberlee', 'the Bitch Queen', 'CE', ['tempest'], {
    symbol: 'A wave curling left and right.', portfolio: 'The sea, drowning, storms at sea',
    dogma: 'The sea takes what it is owed. Pay over the rail, or pay from the rail.',
    desc: 'Sailors out of Neverwinter and Waterdeep buy her off with coin thrown into the water.',
    color: '#3a7a8a', pc: false,
  }),
  god('helm', 'Helm', 'the Vigilant One', 'LN', ['life', 'light'], {
    symbol: 'A staring eye on an upright left gauntlet.', portfolio: 'Protection, guardians, watchfulness',
    dogma: 'Stand your watch. Nobody thanks the guard who was there, and that is the whole of the job.',
    desc: 'God of guards, gates and unbroken watches. Half the gatehouses on the High Road bear his eye.',
    color: '#b8c0cc',
  }),
  god('torm', 'Torm', 'the True', 'LG', ['war'], {
    symbol: 'A white right gauntlet.', portfolio: 'Courage, duty, loyalty, self-sacrifice',
    dogma: 'Loyalty that costs nothing is only a preference. Pay for yours where it can be seen.',
    desc: 'Patron of paladins and of the Order of the Gauntlet. Daran Edermath still keeps his oath.',
    color: '#e0d070',
  }),
  god('ilmater', 'Ilmater', 'the Crying God', 'LG', ['life'], {
    symbol: 'Hands bound at the wrist with red cord.', portfolio: 'Endurance, suffering, martyrdom, healing',
    dogma: 'Take up what the weak cannot carry. Do not tell them you are carrying it.',
    desc: 'He carries what others cannot. His priests run the poorhouses of Neverwinter and Waterdeep.',
    color: '#c07a7a',
  }),
  god('tyr', 'Tyr', 'the Even-Handed', 'LG', ['war'], {
    symbol: 'Balanced scales resting on a warhammer.', portfolio: 'Justice, law, courts, oaths',
    dogma: 'Judge as though the verdict were coming back to you, because one day it is.',
    desc: 'Blind and one-handed in the cause of law. The Order of the Gauntlet swears by him and Torm together.',
    color: '#d0c8b0',
  }),
  god('sune', 'Sune', 'Firehair', 'CG', ['life', 'light'], {
    symbol: 'The face of a beautiful red-haired woman.', portfolio: 'Beauty, love, passion, art',
    dogma: 'Love boldly, make one beautiful thing, and never mistake the two for each other.',
    desc: 'Lady of Love, worshipped from the Moonstone Mask in Neverwinter to the halls of Waterdeep.',
    color: '#e07aa0',
  }),
  god('gond', 'Gond', 'the Wonderbringer', 'N', ['knowledge', 'forge'], {
    symbol: 'A toothed cog with four spokes.', portfolio: 'Craft, invention, smithwork, machines',
    dogma: 'Build the thing. Argue about whether you should have built it once it is running.',
    desc: 'Patron of every smith, wright and dangerous enthusiast on the Sword Coast.',
    color: '#c08a4a',
  }),
  god('waukeen', 'Waukeen', "the Merchant's Friend", 'N', ['knowledge', 'trickery'], {
    symbol: "An upright coin bearing Waukeen's profile.", portfolio: 'Trade, wealth, honest bargains',
    dogma: 'A fair price is a prayer. A cheated buyer never comes back, and neither do I.',
    desc: 'Every coster on the High Road tithes to her, including the ones that should not be trading at all.',
    color: '#e0b84a',
  }),
  god('loviatar', 'Loviatar', 'the Maiden of Pain', 'LE', ['death'], {
    symbol: 'A nine-tailed barbed scourge.', portfolio: 'Pain, suffering inflicted, cruelty as doctrine',
    dogma: 'Pain is the only honest teacher. Everything else is a suggestion.',
    desc: 'Her doctrine spreads quietly through Zhent camps and the darker corners of Luskan.',
    color: '#8a2a4a', pc: false,
  }),
  god('mask', 'Mask', 'the Lord of Shadows', 'CN', ['trickery'], {
    symbol: 'A black mask.', portfolio: 'Thieves, shadows, intrigue',
    dogma: 'What you can carry away is yours. What you can carry away unseen is truly yours.',
    desc: 'Patron of thieves from the Dock Ward of Waterdeep to whatever passes for one in Phandalin.',
    color: '#5a5a6a',
  }),
  god('bane', 'Bane', 'the Black Hand', 'LE', ['war'], {
    symbol: 'An upright black right hand, thumb and fingers together.',
    portfolio: 'Tyranny, hatred, fear, ambition',
    dogma: 'Obedience is peace. Give me your fear and I will spend it better than you would.',
    desc: 'The Black Lord. The Zhentarim were built on his church and have never quite got the smell out.',
    color: '#3a3a4a', pc: false,
  }),
  god('bhaal', 'Bhaal', 'the Lord of Murder', 'NE', ['death'], {
    symbol: 'A skull surrounded by a ring of blood droplets.', portfolio: 'Murder, ritual killing',
    dogma: 'There is a difference between a death and a murder, and I am the difference.',
    desc: 'Dead, returned, and still counting. His children are a problem the south has not solved.',
    color: '#7a1a1a', pc: false,
  }),
  god('myrkul', 'Myrkul', 'the Lord of Bones', 'NE', ['death'], {
    symbol: 'A white human skull.', portfolio: 'Death held over the living, decay, the fear of dying',
    dogma: 'You will be bones. Everything you did between then and now was an argument about the timing.',
    desc: 'The old Lord of the Dead, unseated by Kelemvor and never content about it.',
    color: '#a89a80', pc: false,
  }),
  god('cyric', 'Cyric', 'the Prince of Lies', 'CE', ['trickery'], {
    symbol: 'A white jawless skull on a black or purple sunburst.', portfolio: 'Lies, strife, murder, madness',
    dogma: 'Everything you have been told is a lie, including this. Especially this.',
    desc: 'Mad, hated by his own faithful, and still holding three portfolios he stole from better gods.',
    color: '#6a3a7a', pc: false,
  }),
  god('auril', 'Auril', 'the Frostmaiden', 'NE', ['nature', 'tempest'], {
    symbol: 'A six-pointed snowflake.', portfolio: 'Cold, winter, the killing frost',
    dogma: 'Winter is not cruelty. Winter is arithmetic, and you have miscounted the firewood.',
    desc: 'Her breath comes down off the Spine of the World. Icespire Peak is said to be one of her altars.',
    color: '#a8d8e8', pc: false,
  }),
  god('malar', 'Malar', 'the Beastlord', 'CE', ['nature'], {
    symbol: 'A clawed paw.', portfolio: 'The hunt, stalking, bloodlust, lycanthropes',
    dogma: 'There is the hunter and there is the meat. Decide before the wood decides for you.',
    desc: 'Worshipped by lycanthropes and by hunters who have stopped pretending it is about the meat.',
    color: '#8a4a2a', pc: false,
  }),
  god('deneir', 'Deneir', 'the Scribe of Oghma', 'NG', ['knowledge'], {
    symbol: 'A lit candle above an open eye.', portfolio: 'Writing, glyphs, cartography, literacy',
    dogma: 'Copy it faithfully. A single slipped word has started three wars that I can name.',
    desc: 'Patron of scribes and mapmakers; Thistle at Barthen\'s keeps a candle for him over the ledger.',
    color: '#e0d8b8',
  }),
  god('milil', 'Milil', 'the Lord of Song', 'NG', ['light'], {
    symbol: 'A five-stringed harp made of leaves.', portfolio: 'Poetry, song, performance, inspiration',
    dogma: 'Play it as well as you can, then play it again for the ones who were not listening.',
    desc: 'The bard\'s god. The Harpers borrowed his harp for their sigil and never gave it back.',
    color: '#d8b060',
  }),
  god('savras', 'Savras', 'the All-Seeing', 'LN', ['knowledge', 'arcana'], {
    symbol: 'A crystal ball containing many kinds of eyes.', portfolio: 'Divination, fate, truth',
    dogma: 'The truth does not care whether you asked the right question. Ask better.',
    desc: 'God of diviners, once imprisoned in a staff by Azuth and now his lieutenant.',
    color: '#8ab0d8',
  }),
  god('azuth', 'Azuth', 'the Lord of Spells', 'LN', ['knowledge', 'arcana'], {
    symbol: 'A left hand pointing upward, outlined in fire.', portfolio: 'Wizards, spellcraft, magical rigour',
    dogma: 'Learn the form exactly. Improvisation is a wizard\'s last resort, not their first idea.',
    desc: 'The patron of wizards and Mystra\'s first servant. Blackstaff Tower keeps his rites.',
    color: '#9a8ae0',
  }),
  god('eldath', 'Eldath', 'the Quiet One', 'NG', ['life', 'nature'], {
    symbol: 'A waterfall plunging into a still pool.', portfolio: 'Peace, springs, pools, quiet groves',
    dogma: 'Put the weapon down. Sit by the water. Nothing you were going to say improves the pool.',
    desc: 'Goddess of stillness and green pools. Her groves are the only neutral ground in some feuds.',
    color: '#6ac0b0',
  }),
  god('lliira', 'Lliira', 'Our Lady of Joy', 'CG', ['life'], {
    symbol: 'A triangle of three six-pointed stars.', portfolio: 'Joy, festivals, dance, freedom',
    dogma: 'Grief keeps. Joy does not. Take the dance while the fiddler is still upright.',
    desc: 'Her festivals fill Waterdeep\'s streets and empty its purses, and nobody complains.',
    color: '#e8a0c0',
  }),
  god('sharess', 'Sharess', 'the Dancing Lady', 'CG', ['light', 'trickery'], {
    symbol: 'A pair of female lips.', portfolio: 'Hedonism, sensual fulfilment, cats',
    dogma: 'Pleasure taken freely harms nobody. Pleasure taken from someone is theft with a nicer name.',
    desc: 'A goddess of festhalls and cats, once swallowed by Shar and clawed her way back out.',
    color: '#e8a870',
  }),
  god('talona', 'Talona', 'the Lady of Poison', 'CE', ['death'], {
    symbol: 'Three teardrops on a triangle.', portfolio: 'Disease, poison, plague',
    dogma: 'Everything ends in the body. I only ask that it be interesting on the way out.',
    desc: 'Feared in the crowded wards of Luskan and prayed to, quietly, by poisoners everywhere.',
    color: '#7a9a3a', pc: false,
  }),
  god('tiamat', 'Tiamat', 'the Queen of Evil Dragons', 'LE', ['trickery', 'war'], {
    symbol: 'A dragon head with five claw marks.', portfolio: 'Greed, chromatic dragons, tyranny of the strong',
    dogma: 'Everything of value belongs beneath me. You are merely holding it warm.',
    desc: 'Five-headed queen of the chromatic dragons. The Cult of the Dragon works to bring her through.',
    color: '#a03040', pc: false,
  }),
  god('bahamut', 'Bahamut', 'the Platinum Dragon', 'LG', ['life', 'war'], {
    symbol: "A dragon's head in profile.", portfolio: 'Justice, nobility, metallic dragons, protection',
    dogma: 'Strength is a debt owed to the weak. Pay it before you are asked.',
    desc: 'The Platinum Dragon, revered by dragonborn and paladins of every species.',
    color: '#d8d8e8',
  }),
  god('moradin', 'Moradin', 'the Soulforger', 'LG', ['knowledge', 'forge'], {
    symbol: 'A hammer and anvil.', portfolio: 'Dwarves, creation, smithing, stone',
    dogma: 'Make something that outlasts you. Sign it. Let them see how it was done.',
    desc: 'Father of the dwarves. The Rockseekers still strike his rhythm on the first swing of a new shaft.',
    color: '#c8a060', race: 'dwarf',
  }),
  god('corellon', 'Corellon Larethian', 'the First of the Seldarine', 'CG', ['light', 'arcana'], {
    symbol: 'A crescent moon, or a starburst.', portfolio: 'Elves, art, magic, beauty, war against the drow',
    dogma: 'Make. Change. Make again. Only the drow believe a thing is finished.',
    desc: 'Creator of the elves, and the reason Lolth is where she is.',
    color: '#a8d0e0', race: 'elf',
  }),
  god('yondalla', 'Yondalla', 'the Protector', 'LG', ['life'], {
    symbol: 'A cornucopia on a shield.', portfolio: 'Halflings, family, hearth, plenty',
    dogma: 'Keep the door shut, the fire lit and a chair spare. That is the whole of the law.',
    desc: 'Keeper of hearth and halfling kin. The Alderleafs set her a plate at harvest.',
    color: '#c8b060', race: 'halfling',
  }),
  god('garl-glittergold', 'Garl Glittergold', 'the Watchful Protector', 'LG', ['trickery'], {
    symbol: 'A gold nugget.', portfolio: 'Gnomes, humour, protection, gemcraft',
    dogma: 'The best joke saves a life. The second best only makes them check the ceiling.',
    desc: 'The gnome father, who defeated a demon prince by making him laugh at the wrong moment.',
    color: '#e0c040', race: 'gnome',
  }),
  god('gruumsh', 'Gruumsh', 'One-Eye', 'CE', ['tempest', 'war'], {
    symbol: 'An unblinking eye.', portfolio: 'Orcs, conquest, strength, grievance',
    dogma: 'They took the good land and left you the stones. Take it back. Take all of it.',
    desc: 'The orc god who lost an eye to Corellon and has never once let it go.',
    color: '#7a3a2a', race: 'orc', pc: false,
  }),
  god('lolth', 'Lolth', 'the Queen of the Demonweb Pits', 'CE', ['trickery'], {
    symbol: 'A spider.', portfolio: 'Drow, spiders, betrayal, ambition',
    dogma: 'Climb. Climb over your sisters. If they were worthy they would not have been beneath you.',
    desc: 'Mother of the drow of Menzoberranzan, and the reason a raiding party is worth fearing.',
    color: '#7a2a6a', race: 'elf', pc: false,
  }),
];

export const DEITIES = deepFreeze(Object.fromEntries(DEITY_LIST.map((d) => [d.id, d])));
export const DEITY_IDS = Object.freeze(DEITY_LIST.map((d) => d.id));

/** The cleric domains that actually have a subclass in data/subclasses.js. */
export const PLAYABLE_DOMAINS = Object.freeze(['life', 'light', 'trickery', 'war', 'tempest']);

/** Fallback domain map so an unimplemented domain still yields a legal pick. */
const DOMAIN_FALLBACK = {
  knowledge: 'light', arcana: 'light', nature: 'life', death: 'trickery',
  grave: 'life', forge: 'war', twilight: 'trickery', order: 'war', peace: 'life',
};

export function getDeity(id) { return DEITIES[id] || null; }
export function deityList() { return DEITY_LIST.slice(); }
/** Gods a player character would plausibly swear to (excludes the vile ones). */
export function playerDeities() { return DEITY_LIST.filter((d) => d.pc); }
export function deitiesForDomain(domain) {
  return DEITY_LIST.filter((d) => d.domains.includes(String(domain).toLowerCase()));
}
/** A cleric domain that exists in the game for this god. */
export function suggestedDomain(deityId) {
  const d = DEITIES[deityId];
  if (!d) return 'life';
  for (const dom of d.domains) if (PLAYABLE_DOMAINS.includes(dom)) return dom;
  for (const dom of d.domains) if (DOMAIN_FALLBACK[dom]) return DOMAIN_FALLBACK[dom];
  return 'life';
}
export function randomDeity(r, opts = {}) {
  const pool = opts.pcOnly === false ? DEITY_LIST : DEITY_LIST.filter((d) => d.pc);
  return pick(r, pool.length ? pool : DEITY_LIST) || DEITY_LIST[0];
}

// ===========================================================================
// 3. FACTIONS — the five, with their canonical rank ladders
// ===========================================================================
// Reputation thresholds line up with state.js REP_RANKS (0/10/25/50/90/150), so
// rank 1 arrives at Known, rank 4 at Honoured, and 150 is Exalted.

const RANK_THRESHOLDS = [10, 25, 50, 90];
const EXALTED_AT = 150;

function faction(id, name, o = {}) {
  const ranks = o.ranks || [];
  return {
    id,
    name,
    short: o.short || name.replace(/^The /, ''),
    color: o.color || '#c8b58a',
    symbol: o.symbol || '',
    creed: o.creed || '',
    desc: o.desc || '',
    contracts: o.contracts || '',
    ranks: ranks.slice(),                                  // plain names, low to high
    thresholds: RANK_THRESHOLDS.slice(),
    exaltedAt: EXALTED_AT,
    rankTiers: ranks.map((rn, i) => ({
      rank: i + 1, name: rn, at: RANK_THRESHOLDS[i] || EXALTED_AT,
      desc: (o.rankDesc && o.rankDesc[i]) || '',
    })),
    patron: o.patron || null,                              // NPCS id who speaks for them
    home: o.home || 'phandalin',
    enemies: o.enemies || [],
    joinAt: o.joinAt != null ? o.joinAt : 10,
  };
}

export const FACTIONS = deepFreeze({
  harpers: faction('harpers', 'The Harpers', {
    color: '#6aa8e8', symbol: 'A silver harp on a crescent moon, worn where nobody looks.',
    creed: 'No throne, no crown, no thanks. Tyranny dies in the dark and we are the dark.',
    desc: 'A scattered network of spies, bards and lore-keepers who intervene quietly and early, so that armies never have to.',
    contracts: 'Reconnaissance, rescues, and proving what everybody already suspects.',
    ranks: ['Watcher', 'Harpshadow', 'Brightcandle', 'Wise Owl'],
    rankDesc: [
      'You have been noticed, and asked to keep noticing.',
      'You move where the Harpers cannot be seen to move.',
      'You carry lore worth protecting, and secrets worth dying over.',
      'You speak for the Harpers in the North, and few will ever know it.',
    ],
    patron: 'sister-garaele', home: 'shrine-of-luck',
    enemies: ['zhentarim', 'cult-dragon'],
  }),
  gauntlet: faction('gauntlet', 'Order of the Gauntlet', {
    color: '#f0d264', symbol: 'A gauntleted fist bearing a set of scales.',
    creed: 'Evil does not stop because you looked away. Be vigilant, be armed, and be first.',
    desc: 'The militant faithful of Torm, Tyr and Helm, sworn to find evil before it is ready and end it while it is small.',
    contracts: 'Purge a lair, break a cult, escort a shrine\'s tithe through bandit country.',
    ranks: ['Chevall', 'Marshal', 'Whitehawk', 'Vindicator'],
    rankDesc: [
      'A sworn blade, riding where the Order points.',
      'You choose the ground and the hour of the fight.',
      'Your name is spoken as a warning by the things you hunt.',
      'You answer only to your god and to the Order\'s conscience.',
    ],
    patron: 'daran-edermath', home: 'phandalin',
    enemies: ['cult-dragon', 'redbrands', 'zhentarim'],
  }),
  'emerald-enclave': faction('emerald-enclave', 'Emerald Enclave', {
    color: '#6fc36a', symbol: 'A stag\'s head over a green disc of oak leaves.',
    creed: 'The wild does not need saving. It needs the things that break it removed.',
    desc: 'Druids, rangers and hermits who keep the balance of the North: cull what does not belong, and restore what was torn out.',
    contracts: 'Cull aberrations, cleanse blighted groves, break a poacher ring, carry seed to a burned valley.',
    ranks: ['Springwarden', 'Summerstrider', 'Autumnreaver', 'Winterstalker'],
    rankDesc: [
      'You tend what grows and report what should not.',
      'You range far and settle small imbalances alone.',
      'You are trusted to cut, and to know when cutting is the balance.',
      'You keep a whole region\'s reckoning, and the Enclave keeps yours.',
    ],
    patron: 'reidoth', home: 'neverwinter-wood',
    enemies: ['cult-dragon'],
  }),
  'lords-alliance': faction('lords-alliance', "Lords' Alliance", {
    color: '#b9c1cf', symbol: 'A silver sun over a field of stars, on a grey field.',
    creed: 'Roads open, walls manned, ledgers honest. Civilisation is a thing you maintain.',
    desc: 'The coalition of Waterdeep, Neverwinter, Silverymoon and their allies, holding the North together one caravan and one garrison at a time.',
    contracts: 'Escort caravans, clear the High Road and the Triboar Trail, carry despatches, garrison the reborn towns.',
    ranks: ['Cloak', 'Redknife', 'Stingblade', 'Warduke'],
    rankDesc: [
      'A trusted hand, carrying the Alliance\'s word and its cargo.',
      'You lead patrols and settle trouble before it reaches a wall.',
      'You act with a city\'s authority behind you.',
      'Lords take your reports seriously, and sometimes take your advice.',
    ],
    patron: 'sildar-hallwinter', home: 'townmasters-hall',
    enemies: ['zhentarim', 'many-arrows', 'redbrands'],
  }),
  zhentarim: faction('zhentarim', 'The Zhentarim', {
    color: '#b07ae0', symbol: 'A black winged serpent, shown only to those who already know.',
    creed: 'Everything has a price. Ours is fair, and we always collect.',
    desc: 'The Black Network: mercenaries, smugglers and moneylenders who want the North wealthy, dependent, and theirs.',
    contracts: 'Move goods past a toll, lean on a debtor, acquire what somebody else is holding, keep a name out of a ledger.',
    ranks: ['Fang', 'Wolf', 'Viper', 'Ardragon'],
    rankDesc: [
      'Hired muscle with a name the Network bothers to remember.',
      'You run your own jobs and your own crew.',
      'You hold territory, contracts and other people\'s secrets.',
      'You set the price, and the Network enforces it.',
    ],
    patron: 'halia-thornton', home: 'miners-exchange',
    enemies: ['harpers', 'lords-alliance'],
  }),

  // --- the two powers of the south (Baldur's Gate, 1496 DR) -----------------
  // In contract terms the Fist reads as the Lords' Alliance in the south and
  // the Guild trades with the Black Network — both true in canon, and both
  // said out loud in dialogue. These ladders are the city's own opinion of
  // you, which is a different coin and spends differently.

  'flaming-fist': faction('flaming-fist', 'The Flaming Fist', {
    color: '#e0763a', symbol: 'A gauntleted fist wreathed in flame.',
    creed: 'The city pays, the Fist stands, the road stays open. Sentiment costs extra.',
    desc: 'The mercenary company that became Baldur\'s Gate\'s army, watch and navy. Mercenary in origin, ducal in fact, corrupt at the edges and unbending at the centre — and the only thing between the city and the road.',
    contracts: 'Escorts on the Trade Way and the Coast Way, road-clearing, bounties, and gate duty nobody else will stand.',
    ranks: ['Fist', 'Gauntlet', 'Manip', 'Flame'],
    rankDesc: [
      'A sworn blade on the rolls, with a gate to hold and a wage to prove it.',
      'You hold a post, and the fists who hold it with you.',
      'You command a muster and answer for every coin it spends.',
      'Officers report to you. The Marshal knows your name.',
    ],
    patron: 'imzel-chergoba', home: 'seatower-of-balduran',
    enemies: ['the-guild'],
  }),
  'the-guild': faction('the-guild', 'The Guild', {
    color: '#8a7a9a', symbol: 'Nine fingers held up, and the meaning of the missing one.',
    creed: 'The Upper City has laws. Everyone else has us, and we are more reasonable.',
    desc: 'Nine-Fingers Keene\'s syndicate: smugglers, fences, knives and rent-collectors, quiet where the Zhentarim are loud. It squeezes patriars and strangers, and it feeds the Outer City because nobody else will.',
    contracts: 'Smuggling, theft, extortion, quiet removals, and favours remembered with interest.',
    ranks: ['Ear', 'Enforcer', 'Operator', 'Kingpin\'s Hand'],
    rankDesc: [
      'You hear things, and the right people hear that you heard them.',
      'You collect what is owed, and you are owed a little yourself.',
      'You run a street\'s worth of business and settle its arguments.',
      'When you speak, the room checks the door for Nine-Fingers.',
    ],
    patron: 'rilsa-rael', home: 'bg-sows-foot',
    enemies: ['flaming-fist'],
  }),
});

export const FACTION_IDS = Object.freeze(Object.keys(FACTIONS));

/** Hostile organisations. Names only — they have no reputation ladder. */
export const ENEMY_FACTIONS = deepFreeze({
  'cult-dragon': { id: 'cult-dragon', name: 'Cult of the Dragon', color: '#a03040', desc: 'They believe the dracoliches will inherit Faerun, and they are working to hurry it along.' },
  redbrands: { id: 'redbrands', name: 'The Redbrands', color: '#b04a3a', desc: 'Scarlet-cloaked thugs out of Tresendar Manor, run by a wizard nobody in Phandalin has met.' },
  'many-arrows': { id: 'many-arrows', name: 'Kingdom of Many-Arrows', color: '#7a3a2a', desc: 'The orc kingdom in the Spine of the World. Its raiding season is every season.' },
  goblinoid: { id: 'goblinoid', name: 'The Cragmaw Tribe', color: '#6a8a3a', desc: 'Goblins and bugbears of the Sword Mountains, holding Cragmaw Castle under King Grol.' },
  xanathar: { id: 'xanathar', name: 'The Xanathar Guild', color: '#8a6ac0', desc: 'Waterdeep\'s underworld, run by a beholder that keeps goldfish and grudges.' },
});

export function getFaction(id) { return FACTIONS[id] || ENEMY_FACTIONS[id] || null; }
export function factionName(id) {
  const f = getFaction(id);
  return (f && f.name) || String(id || '').replace(/-/g, ' ');
}
export function factionColor(id) {
  const f = getFaction(id);
  return (f && f.color) || '#c8b58a';
}
/** The rank title a reputation value earns inside a faction. */
export function factionRank(id, value) {
  const f = FACTIONS[id];
  const v = Number(value) || 0;
  if (!f) return 'Unknown';
  if (v >= EXALTED_AT) return `${f.ranks[f.ranks.length - 1]} (Exalted)`;
  let name = 'Unknown';
  for (const t of f.rankTiers) if (v >= t.at) name = t.name;
  return name;
}
/** Reputation still needed for the next rung, or 0 at the top. */
export function nextRankAt(id, value) {
  const f = FACTIONS[id];
  const v = Number(value) || 0;
  if (!f) return 0;
  for (const t of f.rankTiers) if (v < t.at) return t.at;
  return v < EXALTED_AT ? EXALTED_AT : 0;
}

// ===========================================================================
// 4. TITLES — the epithet under a character's name
// ===========================================================================

export const TITLES = deepFreeze({
  /** Earned purely by level; titleForLevel() picks the highest one reached. */
  tier: [
    { id: 'wanderer', name: 'the Wanderer', minLevel: 1, desc: 'You walked into Phandalin with a pack and an opinion.' },
    { id: 'of-phandalin', name: 'of Phandalin', minLevel: 3, desc: 'The town knows your face and does not lock up when you pass.' },
    { id: 'trailwarden', name: 'Trailwarden', minLevel: 5, desc: 'The Triboar Trail is walkable because of you.' },
    { id: 'of-the-sword-coast', name: 'of the Sword Coast', minLevel: 7, desc: 'Your name has travelled further than you have.' },
    { id: 'dragonsbane', name: 'Dragonsbane', minLevel: 9, desc: 'Something enormous and scaled did not survive meeting you.' },
    { id: 'of-neverwinter', name: 'of Neverwinter', minLevel: 11, desc: 'The Protector\'s Enclave counts you a friend of the city.' },
    { id: 'deepdelver', name: 'Deepdelver', minLevel: 13, desc: 'You have gone down the Yawning Portal\'s well and come back up it.' },
    { id: 'of-waterdeep', name: 'of Waterdeep', minLevel: 15, desc: 'Masked Lords have discussed you, which is rarely comfortable.' },
    { id: 'halasters-guest', name: "Halaster's Guest", minLevel: 17, desc: 'The Mad Mage knows your name. He uses it.' },
    { id: 'of-the-north', name: 'of the North', minLevel: 20, desc: 'From Waterdeep to the Spine of the World, they mean you.' },
  ],
  /** Set by deeds and story flags; the journal awards these. */
  deed: [
    { id: 'redbrand-breaker', name: 'Redbrand-Breaker', flag: 'redbrands-cleared', desc: 'You emptied Tresendar Manor of red cloaks.' },
    { id: 'glasstaff-taker', name: "Glasstaff's End", flag: 'glasstaff-defeated', desc: 'Iarno Albrek answered for the law he was sent to keep.' },
    { id: 'mine-finder', name: 'Finder of the Lost Mine', flag: 'wave-echo-found', desc: 'Wave Echo Cave is on a map again because you walked it.' },
    { id: 'spider-crusher', name: 'Spider-Crusher', flag: 'black-spider-defeated', desc: 'Nezznar the Black Spider will not be selling any more maps.' },
    { id: 'dragonfriend', name: 'Dragonfriend', flag: 'venomfang-spared', desc: 'You dealt with Venomfang without a fight. Nobody quite believes it.' },
    { id: 'banshee-courteous', name: 'Courteous', flag: 'agatha-answered', desc: 'Agatha of Conyberry answered a question and let you leave.' },
    { id: 'icebreaker', name: 'Icebreaker', flag: 'cryovain-slain', desc: 'Cryovain no longer circles Icespire Peak.' },
    { id: 'ashwalker', name: 'Ashwalker', flag: 'thundertree-cleared', desc: 'You walked Thundertree\'s ash to the tower door and back.' },
  ],
  /** Faction rank ladders, mirrored here so a title cycler can offer them. */
  faction: {
    harpers: ['Watcher', 'Harpshadow', 'Brightcandle', 'Wise Owl'],
    gauntlet: ['Chevall', 'Marshal', 'Whitehawk', 'Vindicator'],
    'emerald-enclave': ['Springwarden', 'Summerstrider', 'Autumnreaver', 'Winterstalker'],
    'lords-alliance': ['Cloak', 'Redknife', 'Stingblade', 'Warduke'],
    zhentarim: ['Fang', 'Wolf', 'Viper', 'Ardragon'],
  },
  /** Plain honorifics for NPCs and hirelings. */
  honorific: ['Goodman', 'Goodwife', 'Master', 'Mistress', 'Sister', 'Brother', 'Sergeant',
    'Captain', 'Townmaster', 'Elder', 'Warden', 'Scout', 'Journeyer'],
});

/** The highest level title a character has earned. */
export function titleForLevel(level) {
  const lv = Number(level) || 1;
  let best = TITLES.tier[0];
  for (const t of TITLES.tier) if (lv >= t.minLevel) best = t;
  return best ? best.name : '';
}

/** Every title a character could display right now. */
export function titlesFor(level, flagFn) {
  const ok = typeof flagFn === 'function' ? flagFn : () => false;
  const out = TITLES.tier.filter((t) => (Number(level) || 1) >= t.minLevel).map((t) => t.name);
  for (const d of TITLES.deed) if (ok(d.flag)) out.push(d.name);
  return out;
}

// ===========================================================================
// 5. TAVERN_LINES — barflies. Overheard, not addressed to you.
// ===========================================================================

export const TAVERN_LINES = Object.freeze([
  "— and I told him, that's not a mule, that's a debt with ears.",
  'Three coppers says the Rockseekers never come back down out of those hills.',
  "Grista waters the ale at the Sleeping Giant. Toblen doesn't. That's the whole review.",
  "You can tell a Zhent by the way they pay: exact coin, no haggling, no eye contact.",
  "My grandmother walked from Triboar to here in four days. My grandmother was lying.",
  "Never sit with your back to the door in Phandalin. Never sit with your back to the door anywhere.",
  "Lionshield goods went missing again. Linene's face could curdle milk in the barrel.",
  "That's not a scar, that's where a stirge got attached and I got impatient.",
  "The mine's cursed. Every mine's cursed. That's how you know there's something in it.",
  "Half the sellswords in here couldn't hold a shield, and the other half can't hold their drink.",
  "I've been to Neverwinter. It's all scaffolding and pride. Wait — I've been to Neverwinter twice.",
  "There's a fellow at the corner table who hasn't touched his drink in an hour. Watch him, not me.",
  "You want work, talk to the townmaster. You want work that pays, talk to anyone else.",
  "My cousin swears he saw a white dragon over the Sword Mountains. My cousin also swears he can read.",
  "Ale, bread, a roof, and no goblins. That's the whole of a good tenday.",
  "They hanged Nars Dendrar in the street and we all watched. Don't ask me about it.",
  "The Redbrands drink for free here. Ask yourself who's paying for it.",
  "I dig, I drink, I sleep, I dig. Ask me again next tenday, the answer's the same.",
  "Old Owl Well's Netherese. You don't dig in Netherese ruins, you back away from them politely.",
  "Every road out of this town goes somewhere worse. That's not pessimism, that's geography.",
  "Harbin Wester couldn't find his own boots without a bounty posted on them.",
  "If you're going into the wood, take Reidoth's advice and then take rope anyway.",
  "The Triboar Trail's fine in daylight. It's the other sixteen hours that get people.",
  "That dwarf in the corner's been nursing the same tankard since noon. Grief, most likely.",
  "Sister Garaele will heal you for a donation. Emphasis on 'will'. Also on 'donation'.",
  "I've eaten worse than Trilena's stew. I'd rather not, though, and that's high praise.",
  "You hear a wolf on the Trail, it's a wolf. You hear nothing at all, start running.",
  "Waterdeep has a well in a tavern that goes down forever. People pay to be lowered into it. People.",
  "Barthen's rope is honest rope. I've hung off it twice and I'm still here.",
  "Somebody's buying ore at above assay. Nobody does that for love of rocks.",
  "The lad Pip asks more questions in a day than I've had answers in a life.",
  "Drink up. The night's young and the graveyard's full of people who went to bed early.",
]);

// ===========================================================================
// 6. FLAVOR_LINES — ambient one-liners, keyed by NPC role (and by tag)
// ===========================================================================
// data/npcs.js roles: innkeep shopkeeper questgiver guard priest flavor
// data/npcs.js tags:  child animal traveller villain
// flavorLine() checks tag first, then role, then falls back to `default`.

export const FLAVOR_LINES = deepFreeze({
  innkeep: [
    'Room and board, two silver. Bath is extra and worth it.',
    "Don't mind the noise from the taproom. It's mostly singing.",
    'A long rest and a hot meal fixes more than most clerics do.',
    "If you're staying, sign the book. The townmaster likes a list.",
    "We've beds, we've stew, and we've no trouble. Let's keep the last one.",
    "Sleep upstairs, eat downstairs, and settle up before you ride out.",
    'Everyone passing through stops here. So does everything they heard.',
  ],
  shopkeeper: [
    'Fair prices, honest weight, no credit past a tenday.',
    'Buy the rope. Everyone comes back wishing they had bought the rope.',
    'I can order it in from Neverwinter, but the road being what it is, do not hold your breath.',
    'Sell me what you looted and I will not ask where it came from. Loudly.',
    'That is good steel. It came up the High Road and it has the dents to prove it.',
    'A copper saved on gear is a copper spent on a funeral.',
    'Coin first, then the crate. That is not distrust, that is bookkeeping.',
  ],
  questgiver: [
    'You look like someone who solves things. Have I got that wrong?',
    'There is work, if you have the stomach for it and the sense to take pay in advance.',
    "I would go myself. Look at me. Now look at you. You see the arrangement.",
    'It pays. It also gets somebody home, which I am told matters to people like you.',
    'Nobody else has taken it. That should tell you something, and you should take it anyway.',
    'Word travels. Do this well and better work will find you.',
  ],
  guard: [
    'Move along. Nothing to see, and I would like to keep it that way.',
    'Keep the peace inside the posts and I do not care what you do outside them.',
    'Weapons peace-bonded in the hall. I will not ask twice.',
    'Quiet tenday so far. Do not be the reason it stops.',
    'I have stood this post through two raids. I would rather not stand a third.',
    'If you see red cloaks, you did not see them, and you tell me where.',
  ],
  priest: [
    'The god is listening. Whether the god answers is a separate matter.',
    'A donation keeps the lamps lit and the door open. Both matter after dark.',
    'Come back before you are dying, not after. It is easier on everyone.',
    'Faith is not a shield. It is a reason to pick one up.',
    'There is healing here for anyone who asks. Asking is the part people forget.',
  ],
  trainer: [
    'Skill is a debt you pay in hours. Bring the hours.',
    'You are holding it wrong, and you have been holding it wrong for years.',
    'I can teach you what to do. I cannot teach you to do it while frightened.',
    'Come back when you have levelled and we will see what you have kept.',
  ],
  recruit: [
    'I am for hire, and I am worth what I am asking.',
    'I do not do dungeons for a share. I do them for a wage and a share.',
    'Point me at it. I have been sitting here so long the bench knows my name.',
    'You are short a sword. I am short a purse. This solves itself.',
  ],
  miner: [
    'Rock does not care how tired you are. Rock has all the time there is.',
    'Assay came back low again. Third time this month.',
    'Anything out of the Sword Mountains sells now. Do not ask me who to.',
    'You hear knocking down a shaft, you walk out. You do not knock back.',
  ],
  farmer: [
    'Rain would help. Rain would help a great deal.',
    'The blights came out of the wood this year. Never used to.',
    'A good harvest and a quiet road. That is my whole prayer, and Chauntea knows it by now.',
    'Mind the gate. The goats are cleverer than they look and worse than they seem.',
  ],
  smith: [
    'Steel is honest. It does exactly what you paid for.',
    'Bring it in bent, I will bring it out straight. Bring it in broken, bring coin.',
    'Charcoal is up, ore is up, and somehow nobody wants to pay more for a blade.',
  ],
  noble: [
    'One does not simply walk into Waterdeep and expect an audience.',
    'I am told the frontier is bracing. I am told a great many things.',
    'Do try not to bleed on anything expensive.',
  ],
  child: [
    'Are you a real adventurer? Have you got a sword? Can I hold it?',
    'I saw a goblin once. It was mostly a badger. But I SAW it.',
    'Ma says stay off the east rise. Ma says a lot of things.',
    'When I am big I am going to Neverwinter. Or Waterdeep. Or the moon.',
    'Do you know Sildar? He has a real sword and he let me look at it.',
  ],
  animal: [
    'It regards you steadily, and does not move.',
    'It watches you until you look away, then goes back to what it was doing.',
    'It makes a small, unimpressed noise.',
    'It shifts closer, decides against it, and settles again.',
    'It has clearly decided this hearth belongs to it, and it is not wrong.',
  ],
  traveller: [
    'Long road behind me and a longer one ahead. Same as everyone.',
    'The High Road is passable. Passable is not the same as safe.',
    'Came up from Waterdeep. Would not do it again for double.',
    'Neverwinter is rebuilding. There is work there for anyone who can lift.',
    'Do not camp in the Mere. I do not care how tired you are.',
  ],
  villain: [
    'You are in the wrong street, friend.',
    'This town pays for its quiet. You are getting the quiet for free.',
    'Walk on. That is the polite version.',
    'Say one more word and see what the cloak means.',
  ],
  flavor: [
    'Mud to the ankles nine months of the year. You get used to it.',
    'Phandalin was a ruin ten years back. Now look at it. Now look at it again.',
    "There is money in these hills. There is also everything else that's in these hills.",
    'Good day to you. Mind the well, the cover is loose.',
    'I keep my head down and my door shut. Has worked so far.',
    'The Rockseekers were good customers. Were.',
    'You are not from here. That is not a complaint, it is a greeting.',
    'Somebody ought to do something. Somebody always ought to.',
  ],
  default: [
    'Good day to you.',
    'Mind how you go.',
    'Nothing to say worth stopping for.',
    'Fair roads.',
  ],
});

/** A single ambient line for an NPC (or a role/tag string). */
export function flavorLine(who, r) {
  const key = typeof who === 'string' ? who : ((who && (who.tag || who.role)) || 'default');
  const list = FLAVOR_LINES[key] || FLAVOR_LINES[(who && who.role)] || FLAVOR_LINES.default;
  return pick(r, list) || FLAVOR_LINES.default[0];
}

/** A barfly line for the taproom crowd. */
export function tavernLine(r) {
  return pick(r, TAVERN_LINES) || TAVERN_LINES[0];
}

// ===========================================================================
// 7. RUMORS — overheard in inns and taprooms
// ===========================================================================
// ui/dialogue.js filters on `minLevel` and (optionally) `flag`, then reads `text`.
// `quest` names a QUESTS id the line hooks into, so an inn can prefer rumours
// about work the party has not taken yet. Every quest id below is one that
// data/npcs.js already hands out.

function rum(id, minLevel, quest, text, o = {}) {
  return {
    id,
    text,
    minLevel: minLevel || 1,
    quest: quest || null,
    flag: o.flag || null,          // dialogue.js hides the line until this flag is set
    faction: o.faction || null,
    where: o.where || 'phandalin',
    tags: o.tags || [],
  };
}

export const RUMORS = deepFreeze([
  // --- tier 1: Phandalin, the here and the now -----------------------------
  rum('gundren-missing', 1, 'rockseeker-brothers',
    "Gundren Rockseeker rode east with Sildar Hallwinter a tenday past. Neither's been seen since, and Barthen still has their supplies sitting in the yard."),
  rum('three-brothers', 1, 'nundros-rescue',
    'Three Rockseeker brothers went up into those hills. Gundren, Tharden, Nundro. Ask a miner how many walked back out and watch the room go quiet.'),
  rum('redbrands-drink', 1, 'redbrand-menace',
    "The Redbrands drink at the Sleeping Giant and pay in coin that used to be somebody else's."),
  rum('nars-hanged', 1, 'nars-grave',
    'Nars Dendrar told a Redbrand what he thought of him, in the street, in daylight. They hanged him for it and not one of us moved.'),
  rum('mirna-necklace', 1, 'dendrar-emerald-necklace',
    "Mirna Dendrar sold her mother's emerald necklace to those thugs to keep her children fed. She'd like it back, and she'll never ask you herself."),
  rum('cellar-noise', 1, 'stonehill-cellar-rats',
    "Toblen will tell you the inn cellar's fine. Toblen hasn't been down to the inn cellar in a tenday."),
  rum('barthen-quiet', 1, 'the-rockseeker-debt',
    "Elmar Barthen hasn't sold a shovel since the Rockseekers stopped coming in. He's too polite to say out loud what he thinks happened."),
  rum('lionshield-wagon', 1, 'lionshield-stolen-goods',
    "Linene Graywind lost a whole wagon of Lionshield goods on the Triboar Trail. Goblins — and they knew which wagon to take."),
  rum('garaele-pale', 2, 'agathas-answer',
    'Sister Garaele went north to Conyberry to put a question to a banshee. She came back a good deal paler than she went.'),
  rum('halia-exchange', 1, 'the-exchange-ledger',
    "Halia Thornton runs the Miner's Exchange. The Exchange runs a fair bit more than ore.", { faction: 'zhentarim' }),
  rum('harbin-bolted', 1, 'townmasters-bounty',
    'Harbin Wester bolted the Townmaster\'s Hall when the Redbrands came down the street. He calls it prudence. We call it Tuesday.'),
  rum('daran-sword', 1, 'orchard-blights',
    'Daran Edermath kept a sword long before he kept an orchard. He has not sold the sword.', { faction: 'gauntlet' }),
  rum('carp-tunnel', 1, 'carps-secret-tunnel',
    'Qelline Alderleaf\'s boy Carp says he found a tunnel under the old manor. His mother says he says a great many things.'),
  rum('tresendar-ruin', 1, 'redbrand-menace',
    'Tresendar Manor burned in the orc raids and nobody ever rebuilt it. Something moved into the cellars anyway.'),
  rum('grista-memory', 1, 'sleeping-giant-brawl',
    'Grista at the Sleeping Giant will serve anyone with coin, and she will remember every word you said while you had it.'),
  rum('netherese-floor', 1, null,
    "Phandalin sits on the bones of an older Phandalin. Netherese, they say. Dig a well here and you come up through somebody's floor."),
  rum('pip-cat', 1, 'pips-lost-cat',
    "Pip Stonehill's lost that ginger tom again. He'll pay you in the only coin an eight-year-old has: everything he's overheard."),
  rum('freda-claim', 2, 'fredas-claim',
    "Freda's claim came back worthless and she blames the assay. The Exchange blames the claim. One of them is lying."),
  rum('favric-bets', 1, 'favrics-wager',
    'Favric will wager on anything. Right now he is taking bets on how long you last.'),
  rum('narth-scarecrows', 1, 'narths-scarecrows',
    "Narth's scarecrows keep turning up facing a different way. He's stopped finding it funny."),
  rum('trilena-list', 1, 'trilenas-market-list',
    'Trilena Stonehill hears everything that comes through that taproom door and believes about a tenth of it. Ask her which tenth.'),
  rum('sildar-commission', 2, 'sildars-commission',
    "Sildar Hallwinter carries a Lords' Alliance commission and a debt he means to pay. Find him and you've found work.", { faction: 'lords-alliance' }),

  // --- tier 2: the Redbrands, the Cragmaws, the hills -----------------------
  rum('glasstaff-name', 2, 'glasstaff',
    'The Redbrands answer to somebody they call Glasstaff. Not one of them in a red cloak will say more than that.'),
  rum('iarno-vanished', 2, 'iarno-albrek-missing',
    'Iarno Albrek came out from Neverwinter to bring law to Phandalin. He vanished before he managed any of it. Odd, that.'),
  rum('nothic-bargain', 3, 'glasstaff',
    'There is a nothic in the cellars under the manor. It bargains, and it knows things it has no business knowing. Do not take the bargain.'),
  rum('cragmaw-tribe', 2, 'rockseeker-brothers',
    'The goblins working the Triboar Trail are Cragmaw tribe, and Cragmaw answers to something bigger up in the Sword Mountains.'),
  rum('klarg-hideout', 2, 'rockseeker-brothers',
    'A bugbear called Klarg holds the Cragmaw hideout and styles himself a chieftain. His wolf appears to disagree.'),
  rum('yeemik-sell', 2, null,
    'There is a goblin named Yeemik up there who would sell out his own boss for the right offer. Goblins generally would.'),
  rum('king-grol', 4, null,
    'King Grol holds Cragmaw Castle, and a drow has been seen walking in and out of it and coming to no harm at all.'),
  rum('wyvern-tor', 4, 'wyvern-tor',
    'Something has denned on Wyvern Tor — orcs, or a wyvern, or both. The shepherds have stopped taking flocks up there.'),
  rum('droop-follows', 2, 'droops-freedom',
    'That goblin Droop will follow anyone who does not hit him. It is not loyalty, it is arithmetic.'),
  rum('old-owl-light', 3, 'old-owl-well',
    'Old Owl Well is a Netherese ruin two days east. There has been a light burning at the tower these past few nights.'),
  rum('hamun-kost', 4, 'kosts-bargain',
    'A Thayan in red robes named Hamun Kost is digging at Old Owl Well and paying very well for privacy.'),
  rum('agatha-courtesy', 3, 'agathas-answer',
    'Agatha haunts a grove outside Conyberry. She was an elf once, and she still answers to courtesy — which is more than most will.'),
  rum('conyberry-empty', 3, null,
    'Conyberry is not ruined. Conyberry is empty. The barbarians came through years ago and the people simply never came back.'),
  rum('mosk-pick', 2, 'mosks-pick',
    'Mosk lost his good pick down a shaft and will not go back for it. He will not say why he will not go back for it.'),
  rum('veit-debt', 2, 'veits-debt',
    'Veit Ungart owes the Exchange more than his claim is worth, and Halia Thornton never forgets a figure.', { faction: 'zhentarim' }),
  rum('caravan-triboar', 3, 'caravan-to-triboar',
    'A caravan is forming up for Triboar and they are short of swords. Two days east, no shade, and bandits at the ford.', { faction: 'lords-alliance' }),

  // --- tier 3: Thundertree, Neverwinter Wood, the mine ----------------------
  rum('thundertree-ash', 5, 'thundertree-ruins',
    'Thundertree is ash to the doorframes. Mount Hotenow blew in 1451 and the town has been dead ever since.'),
  rum('venomfang', 6, 'thundertree-ruins',
    "There's a green dragon in the tower at Thundertree. Venomfang, the druid calls it. Young — and already too big for the tower."),
  rum('twig-blights', 5, 'thundertree-blights',
    'Twig blights walk in Thundertree. Something planted them, and the Cult of the Dragon has been doing the watering.'),
  rum('reidoth-found', 5, 'reidoths-whereabouts',
    'Reidoth the druid walks Neverwinter Wood and will not be found unless he decides he wants finding.', { faction: 'emerald-enclave' }),
  rum('wave-echo-pact', 5, 'wave-echo-cave',
    'Wave Echo Cave is the Phandelver Pact mine — dwarves and gnomes working it together, and a Forge of Spells at the heart of it.'),
  rum('forge-of-spells', 6, 'wave-echo-cave',
    'The Forge of Spells is why the orcs came for Phandelver five hundred years ago. Ask yourself who is coming for it now.'),
  rum('mormesk', 6, 'wave-echo-cave',
    'Mormesk was a mage of the old mine. He is still in the old mine. He is still extremely annoyed about it.'),
  rum('black-spider-maps', 6, 'wave-echo-cave',
    'A drow calling himself the Black Spider has been buying maps of the Sword Mountains, and burying the mapmakers after.'),
  rum('cryovain', 6, null,
    'A white dragon has been circling Icespire Peak. Cryovain, the Leilon hunters call it. It has started coming down out of the snow.'),
  rum('ash-and-wood', 5, 'the-ash-and-the-wood',
    'The wood is coming back over the ash fields north of Thundertree, and it is coming back wrong.', { faction: 'emerald-enclave' }),
  rum('cult-robes', 5, null,
    'Cult of the Dragon robes were seen on the Triboar Trail, heading east, in no particular hurry at all.'),
  rum('anchorite-quiet', 6, null,
    'The Anchorite hills have gone quiet. Not peaceful. Quiet. Even the goats will not go up.'),
  rum('gauntlet-oath', 5, 'gauntlet-oath',
    'The Order of the Gauntlet is swearing in new blades at the orchard. They want people who will not need talking into it.', { faction: 'gauntlet' }),
  rum('harper-cipher', 5, 'harper-cipher',
    'Somebody left a cipher chalked on the back of the shrine. Sister Garaele took one look and went very still.', { faction: 'harpers' }),

  // --- tier 4: the High Road, Neverwinter, the Mere -------------------------
  rum('neverwinter-rebuild', 8, 'protectors-enclave-patrol',
    "Neverwinter is rebuilding, and the Protector's Enclave pays in coin and citizenship for a road kept clear.", { faction: 'lords-alliance' }),
  rum('general-sabine', 8, 'protectors-enclave-patrol',
    "General Sabine keeps Neverwinter's walls and does not much care whose banner you came in under, so long as you can hold a line."),
  rum('leilon-third', 8, 'leilon-dispatch',
    'Leilon is being rebuilt for the third time. The High Road needs a town there and the Mere needs watching.'),
  rum('mere-caravan', 8, null,
    'The Mere of Dead Men swallowed a whole caravan last season and gave back one boot. Lizardfolk, or will-o-wisps, or the mere itself.'),
  rum('mere-ghouls', 9, null,
    'There are ghouls in the Mere that used to be caravan guards, and they are still wearing the livery.'),
  rum('kryptgarden', 9, null,
    'Kryptgarden Forest belongs to Claugiyliamatar. Old Gnawbone, the Zhents call her — and they pay her rather than fight her.'),
  rum('zhent-ore', 7, 'zhent-shipment',
    'The Zhentarim are buying every scrap of ore out of the Sword Mountains at a price that makes no sense. Ask what they mean to make.', { faction: 'zhentarim' }),
  rum('zhent-debt', 7, 'the-exchange-ledger',
    'The Black Network does not want your mine. It wants everyone who works your mine to owe it money.', { faction: 'zhentarim' }),
  rum('uthgardt-elk', 8, null,
    'Uthgardt raiders came down past Beliard this season. Elk tribe, by the totems they left standing in the road.'),
  rum('ardeep-elves', 9, null,
    'There are elves in Ardeep Forest again after all this time, and nobody can get them to say why they came back.'),
  rum('teamsters-toll', 7, 'teamsters-toll',
    'Somebody has set up a toll on the Triboar Trail that no lord ever authorised, and they are collecting it in full.', { faction: 'lords-alliance' }),
  rum('pilgrims-road', 7, 'pilgrims-road',
    'Pilgrims are walking the High Road to a shrine at Leilon, unarmed, in this season. Somebody should go with them.', { faction: 'gauntlet' }),

  // --- tier 5: Waterdeep and the well that has no bottom --------------------
  rum('masked-lords', 11, null,
    'Waterdeep runs on Masked Lords nobody can name and one Open Lord everybody can. Guess which one takes the blame.'),
  rum('yawning-portal', 11, 'the-yawning-portal',
    'Durnan keeps the Yawning Portal, and the well in the middle of his taproom. One silver to be lowered. Nothing at all to fall.'),
  rum('undermountain-deep', 12, 'descent-into-undermountain',
    'Undermountain has no bottom that anyone has found, and Halaster Blackcloak likes it exactly that way.'),
  rum('halaster-laughs', 12, 'descent-into-undermountain',
    'Halaster laughs when a level is cleared. The ones who have heard it say it comes out of the walls, all of them at once.'),
  rum('mirt-loan', 11, 'mirts-loan',
    'Mirt the Moneylender will fund an expedition on a handshake. Mirt the Moneylender always gets paid.'),
  rum('volo-book', 11, 'volos-notes',
    'Volothamp Geddarm is writing another book and needs somebody to survive the research portion.'),
  rum('xanathar', 12, null,
    "The Xanathar Guild runs Waterdeep's underworld through a beholder that keeps goldfish. Both halves of that are true."),
  rum('ahghairon-tower', 12, null,
    "Ahghairon has been dead a thousand years and his tower still will not open. Three men who tried are still hanging in the air above it."),
  rum('undermountain-throne', 13, 'descent-into-undermountain',
    'There is a level down there that is somebody\'s throne room, and the somebody is not Halaster.'),
  rum('manshoon-clones', 13, null,
    'Manshoon has died more times than anyone can count, and it has never once taken.'),
  rum('durnans-tab', 11, 'durnans-tab',
    'Durnan keeps a tab for parties who go down the well. He also keeps a second list, for the ones who do not come up.'),

  // --- tier 6: the deep dark -----------------------------------------------
  rum('drow-scouting', 15, null,
    'Drow out of Menzoberranzan have been seen in the deep tunnels under the Sword Mountains. Scouting, mind. Not raiding. Yet.'),
  rum('lolth-cargo', 15, null,
    'Lolth\'s priestesses are moving something up out of the Underdark, and the Zhentarim have agreed very hard not to notice.'),
  rum('dracolich-plan', 15, null,
    'The Cult of the Dragon has a dracolich in its plans for the North, and they are well past the planning.'),
  rum('beholder-dockward', 16, null,
    'A beholder came up out of Undermountain into the Dock Ward and killed a hundred people before it went back down again.'),
  rum('halaster-names', 17, 'descent-into-undermountain',
    'Halaster called a party by name this tenday. They had never once told him their names.'),
  rum('other-worlds', 17, null,
    'The deepest halls open onto other worlds. People have come back from them speaking languages that do not exist here.'),
  rum('elder-brain', 18, null,
    'The elder brain does not want you dead. That is the worst part of it.'),

  // --- the south: the Trade Way, the Coast Way, and Baldur's Gate ----------

  rum('south-mirt-money', 8, 'the-long-road-south',
    "Mirt has money sitting in Baldur's Gate and no courier fool enough to fetch it. Six hundred miles of Trade Way, and every one of them has an opinion.",
    { where: 'waterdeep' }),
  rum('south-daggerford-skim', 8, 'the-duchess-toll',
    "Duchess Morwen's bridge takes a toll of every wagon over the Delimbiyr. Somebody's hand is in the box before the coin reaches the keep, and she knows it.",
    { where: 'daggerford' }),
  rum('south-morninglow-flame', 8, 'morninglow-dawn',
    "The dawn flame at Morninglow Tower has guttered three mornings running. Amaunator's people do not use the word omen. Their faces use it for them.",
    { where: 'daggerford' }),
  rum('south-yellowknife-young', 9, 'yellowknifes-tower',
    'Delfen Yellowknife came back to Daggerford twenty years younger than he left. He is taking it calmly, which no wizard in history has ever done honestly.',
    { where: 'daggerford' }),
  rum('south-way-inn-vanish', 9, 'the-way-inn-vigil',
    'A traveller a night has gone missing at the Way Inn. Always one, never two. Gorstag has started counting boots by the door after the lamps go down.',
    { where: 'the-way-inn' }),
  rum('south-fields-barrows', 9, 'the-fields-remember',
    'The barrows on the Fields of the Dead are opening. Doors sealed under three hundred years of turf, standing ajar of a morning, and nothing coming out. Yet.',
    { where: 'fields-of-the-dead' }),
  rum('south-dragonspear-fire', 10, null,
    'There is fire under Dragonspear Castle again. There was fire under it before, and it took two crusades and a hero\'s grave to put out.',
    { where: 'fields-of-the-dead' }),
  rum('south-rosymorn-taken', 10, 'song-of-the-morning-relic',
    'Rosymorn Monastery stopped answering pilgrims years back. Whatever holds the cloister now came from a great deal further away than Amn.',
    { where: 'beregost' }),
  rum('south-ulgoth-lamp', 10, null,
    "Ulgoth's Beard lights its harbour lamp late, some nights. The fisherfolk say tide. The wrecks on the point say otherwise.",
    { where: 'ulgoths-beard' }),
  rum('south-writ-queue', 10, 'the-writ-of-entry',
    'The Black Dragon Gate is shut to strangers without a writ, and the Fist lieutenant at Blackgate trades writs for favours. Cheaper than the bribe. More work, though.',
    { where: 'bg-blackgate' }),
  rum('south-fist-alliance', 11, null,
    "The Flaming Fist takes Lords' Alliance contracts and the Guild trades with the Black Network. Neither will thank you for saying so at the bar.",
    { where: 'baldurs-gate', faction: 'flaming-fist' }),
  rum('south-keene-sows-foot', 11, 'nine-fingers-favour',
    "Nine-Fingers runs the Guild from a back room in Sow's Foot, not from a counting house. Ask why and any porter can tell you: from there she can hear her own streets.",
    { where: 'bg-sows-foot', faction: 'the-guild' }),
  rum('south-twin-songs-legal', 11, null,
    'Every god in Faerun is legal in Twin Songs. Even the Lord of Bones has his shrine, kept by a tiefling the Watch looks in on twice a day. He offers them tea.',
    { where: 'bg-twin-songs' }),
  rum('south-tumbledown-ledger', 11, 'the-tumbledown-count',
    'Kosef the gravewarden counts graves the way a miser counts coin. Lately the ledger and the ground disagree, and it is not the ledger that is lying.',
    { where: 'bg-tumbledown' }),
  rum('south-wyrms-arithmetic', 11, null,
    "Wyrm's Rock searches every third wagon on the crossing. The smugglers have done the arithmetic. So has the Fist. Both sides call it fair and neither means it.",
    { where: 'bg-wyrms-crossing' }),
  rum('south-rivington-tents', 11, null,
    "Rivington's tents doubled in the year of the Absolute and never emptied. The city calls them temporary. The tents have street names now.",
    { where: 'bg-rivington' }),
  rum('south-elfsong-quiet', 12, 'the-elfsong-silent',
    'The Elfsong has stopped singing. Alan Alyth pours with both hands steady and every regular in the room drinking too fast about it.',
    { where: 'bg-eastway' }),
  rum('south-mermaid-missing', 12, 'the-mermaid-debt',
    'Three regulars of the Blushing Mermaid went down into the Undercellar and never came up. The Guild swears it was not them — and the Guild bothering to swear is the strange part.',
    { where: 'bg-heapside' }),
  rum('south-water-queen-ship', 12, 'umberlees-tithe',
    'A ship stood into Gray Harbour that every wavewatcher swears went down two winters past. The Water Queen\'s House wants its tithe of her, whatever she now is.',
    { where: 'bg-gray-harbour' }),
  rum('south-counting-house', 12, null,
    'The Counting House vault has never been robbed. The Guild regards this the way a mountaineer regards a mountain.',
    { where: 'bg-bloomridge', faction: 'the-guild' }),
  rum('south-gond-commission', 12, 'the-gond-commission',
    "The High House of Wonders is paying adventurers' rates for a fetch-and-carry to Dragonspear. When a Gondsman calls a thing 'a component', ask a second question.",
    { where: 'bg-heapside' }),
  rum('south-mouth-prints', 12, 'what-the-mouth-prints',
    'Baldur\'s Mouth printed that the grain fleet sold at a fair price. Half the Wide laughed out loud. The editor has stopped taking the stairs alone.',
    { where: 'bg-the-wide' }),
  rum('south-friendly-arm-floor', 12, 'the-friendly-arm-cellar',
    'The Friendly Arm was a Bhaalite priest\'s keep before it was anybody\'s inn. Bentley will tell you every floor has been swept and blessed. Ask him about the one that has not.',
    { where: 'friendly-arm-inn' }),
  rum('south-high-hedge-rate', 12, 'thalantyrs-bargain',
    'Thalantyr of High Hedge is buying reagents at double rate and will not say what for. The skeletons at his gate have started bowing. Politely. That is new.',
    { where: 'beregost' }),
  rum('south-stelmane-flinch', 13, 'the-ducal-summons',
    "Duke Stelmane was murdered in the Elfsong four years ago and half the Parliament still flinches at her name. Somebody has begun collecting on that flinch.",
    { where: 'bg-temples-district' }),
  rum('south-fourth-chair', 13, 'the-fourth-chair',
    'Four chairs on the Council, and the price of the fourth has been agreed, they say — in coin the Fist would dearly like to trace.',
    { where: 'bg-the-wide', faction: 'flaming-fist' }),
  rum('south-candlekeep-price', 13, 'the-price-of-a-book',
    "Candlekeep's gate price is a book the Avowed do not hold. There is one in Nashkel, the peddlers say, and the man who owns it cannot read.",
    { where: 'candlekeep-approach' }),
  rum('south-nashkel-iron', 13, null,
    'Nashkel iron has started shattering on the anvil. Amn blames the smiths, the smiths blame the mine, and the mine has stopped sending up the night shift.',
    { where: 'nashkel' }),
]);

/** Rumours a party of this level could hear. */
export function rumorsFor(level, opts = {}) {
  const lv = Number(level) || 1;
  const flagFn = typeof opts.hasFlag === 'function' ? opts.hasFlag : null;
  return RUMORS.filter((r) => {
    if (r.minLevel > lv) return false;
    if (opts.maxLevel && r.minLevel > opts.maxLevel) return false;
    if (r.flag && flagFn && !flagFn(r.flag)) return false;
    if (r.flag && !flagFn) return false;
    if (opts.faction && r.faction && r.faction !== opts.faction) return false;
    return true;
  });
}

/** One rumour, preferring lines that hook quests the party has not taken. */
export function randomRumor(r, level, opts = {}) {
  const pool = rumorsFor(level, opts);
  if (!pool.length) return null;
  const taken = opts.takenQuests instanceof Set ? opts.takenQuests
    : new Set(Array.isArray(opts.takenQuests) ? opts.takenQuests : []);
  const fresh = pool.filter((x) => !x.quest || !taken.has(x.quest));
  return pick(r, fresh.length ? fresh : pool) || pool[0];
}

// ===========================================================================
// 8. BOOK_TEXTS — readable in-world books
// ===========================================================================
// ui/menus.js journal reads BOOK_TEXTS[id].title and .text. Books are found in
// chests and on shelves and are added to GameState.lore as ids.

function book(id, title, author, text, o = {}) {
  return {
    id,
    title,
    author,
    text,
    body: text,                          // alias for readers that expect .body
    desc: o.desc || (text.split('. ')[0] + '.'),
    pages: o.pages || Math.max(1, Math.ceil(text.length / 420)),
    value: o.value != null ? o.value : 25,
    tags: o.tags || [],
    where: o.where || null,
  };
}

export const BOOK_TEXTS = deepFreeze(Object.fromEntries([

  book('volos-guide-north', 'Volo\'s Guide to the North', 'Volothamp Geddarm',
    "PHANDALIN: a mining town of some forty souls in the foothills below the Sword Mountains, built on the ruins of an older Phandalin that the orcs burned some five centuries past. The Stonehill Inn is clean and the stew is better than it has any right to be. Barthen's Provisions will outfit you honestly. The Lionshield Coster sells arms out of Yartar. Do NOT, whatever you are told in the taproom, go poking about the burned manor on the eastern rise.\n\nThe traveller bound east should know that the Triboar Trail is patrolled by nobody at all. Goblins of the Cragmaw tribe work it in the warm months. Bring three swords or bring none and travel very fast.",
    { tags: ['travel', 'phandalin'], value: 30 }),

  book('phandelver-pact', 'Of the Phandelver Pact', 'a scribe of Neverwinter, unsigned',
    "In the years when Phandelver was a name and not a ruin, the clans of the Sword Mountains struck a covenant with the gnomes of the deep places and the human wizards who had come north out of the wreck of Netheril. They found a cavern where a spell spoken aloud would echo back a hundred times over — Wave Echo Cave, they called it — and in it they raised the Forge of Spells.\n\nWhat came off that forge was not merely enchanted. It was made in a place where magic and ore had grown into one another. Then the orcs came, and the wizards spent themselves in a working that brought the roof down on the lot of them, and the location of Wave Echo Cave passed out of every map in the North.",
    { tags: ['history', 'quest'], value: 60 }),

  book('halasters-ledger', "Halaster's Halls: A Cautionary Ledger", 'kept at the Yawning Portal',
    "Item: one silver piece to be lowered into the well. Item: the rope is checked daily and the bucket is not the problem.\n\nOf ninety-one parties recorded this year, thirty-one returned. Nine returned short of members. Four returned with members they did not take down. Two returned on a day previous to the day they departed, which the proprietor has declined to discuss.\n\nUndermountain is Halaster Blackcloak's, and Halaster is a wizard of the old Netherese cast — which is to say he was brilliant, then he was ancient, then he was neither of those things in any useful order. The dungeon is not a ruin. It is being maintained. Bear that in mind at every door that opens easily.",
    { tags: ['undermountain', 'waterdeep'], value: 75 }),

  book('on-the-harpers', 'On the Harpers, By One of Them', 'signed with a moon and a harp',
    "We are not an army and we do not want to be one. An army must be fed, paid and explained. We are a habit: the innkeep who remembers a face, the bard who carries a message inside a verse, the retired soldier who happens to be on the right road at the right hour.\n\nThe test of us is not what we destroy. It is how few people ever learn that anything needed destroying. Where we do our work well, a town wakes up, has an ordinary day, and never knows what was standing over it the night before. Watchers first. Then Harpshadow, and after that the Brightcandle, which is a great deal less romantic than it sounds and involves an enormous amount of copying.",
    { tags: ['faction', 'harpers'], value: 40 }),

  book('black-network-terms', 'Terms of Engagement', 'the Black Network, for interested parties',
    "The Zhentarim does not require your loyalty, your faith or your affection. It requires that you deliver what you contracted to deliver, on the day you said you would, at the price you agreed.\n\nIn exchange: work at a fair rate, a network that reaches from Westgate to Neverwinter, and colleagues who will come for you if you are taken — provided you have been worth the cost of coming.\n\nAdvancement is by result. Fang, Wolf, Viper, Ardragon. Nobody is promoted for enthusiasm.\n\nA note, since it always comes up: we are not the Black Network of your grandmother's stories. Those were priests of Bane. We are merchants. The distinction matters a great deal to us and, we find, very little to anyone else.",
    { tags: ['faction', 'zhentarim'], value: 35 }),

  book('herbs-neverwinter-wood', 'Herbs and Simples of Neverwinter Wood', 'attributed to Reidoth the druid',
    "Bloodroot grows on the south side of pine, never the north, and stops bleeding if you pack it wet. Thornapple will kill you at four berries and cure a fever at one; you will not be able to tell the difference at three.\n\nSince Hotenow blew, the wood has changed. Ash-fed soil grows things fast and strange. The blights out of Thundertree are the worst of it — twig, needle and vine, and they are not natural growth but something cultivated. When you find blights, look for the gardener.\n\nDo not take from a grove without leaving something. Not because the wood cares. Because the habit is what keeps you honest in the places where the wood does.",
    { tags: ['nature', 'thundertree'], value: 45 }),

  book('fall-of-thundertree', 'The Fall of Thundertree', 'Taman Helder, woodcutter, survivor',
    "I was eleven. My father cut timber for the palisade. Mount Hotenow had been quiet the whole of living memory and then in the spring of 1451 it was not quiet, and Neverwinter took the worst of it, and we took the ash.\n\nAsh came down for two days. It killed the crops standing. Then the ground shook and the wall of the smithy came in and we walked out with what we could carry.\n\nPeople ask why nobody went back. There was nothing to go back to and then, after a few years, there was something in it. Twig blights in the streets. A green dragon in the tower where old Mistress Amblecrown kept her books. My mother says a dead town has a right to stay dead, and I have stopped arguing with her.",
    { tags: ['history', 'thundertree'], value: 30 }),

  book('dwarven-clans-sword-mountains', 'Clans of the Sword Mountains', 'Gunnloda Balderk, of Mithral Hall',
    "Balderk, Battlehammer, Brawnanvil, Dankil, Fireforge, Frostbeard, Gorunn, Holderhek, Ironfist, Loderr, Lutgehr, Rumnaheim, Strakeln, Torunn, Ungart. And Rockseeker, which is a young clan and a stubborn one.\n\nA clan name is a debt and an inheritance in one word. When a dwarf gives you the clan, they are telling you who will come asking if you cheat them.\n\nOf the Rockseekers I will say this: they are prospectors, not miners, which their neighbours consider a distinction without honour. Prospectors follow rumours. Rumours are how the Rockseekers found three good seams in two generations, and it is also, I expect, how they will end.",
    { tags: ['dwarves', 'history'], value: 40 }),

  book('bitch-queens-due', "The Bitch Queen's Due", 'a catechism of the Dock Ward',
    "Q. Who owns the sea?\nA. Umberlee owns the sea.\n\nQ. What is owed her?\nA. Coin over the rail on leaving harbour, and coin over the rail on sighting land.\n\nQ. And if a sailor will not pay?\nA. Then the sailor pays.\n\nQ. Is she cruel?\nA. She is the sea. Cruelty is a thing done by choice.\n\nThe priests of Selune will tell you to look up and steer by the stars. Good advice, and it has never once kept a keel off a rock. Pay the Queen, then steer by the stars.",
    { tags: ['religion', 'sea'], value: 20 }),

  book('on-the-weave', 'On the Weave, and Why It Frays', 'a magister sworn to Azuth',
    "The Weave is not magic. The Weave is the arrangement that lets magic be used without unmaking the user, and Mystra is its keeper.\n\nWhen Mystra died the second time, the Weave went with her, and the century that followed is the one your grandparents will not discuss. Spells that had worked for a thousand years failed or worsened. Entire schools burned. Whole regions were unmade — ask what happened to the country your Turami neighbours came from.\n\nShe is back, and the Weave with her, and the sensible wizard draws two conclusions. First, that the arrangement is not permanent. Second, that anyone who offers you magic from outside the Weave is offering you something that has been tried before, at length, by better and now-absent practitioners.",
    { tags: ['magic', 'history'], value: 80 }),

  book('uthgardt-totems', 'Tales of the Uthgardt', 'Kethra Stormwind, of Neverwinter',
    "There are eleven tribes and they will tell you there are more. Elk, Griffon, Sky Pony, Black Lion, Thunderbeast, Great Worm, Tree Ghost, Red Tiger, Blue Bear, Black Raven, Golden Eagle.\n\nEach keeps a totem site and each keeps a grudge, mostly against the others. Uthgar was a man before he was a god and they have never entirely accepted the promotion.\n\nThe traveller should know that an Uthgardt war party will not be negotiated with by anyone standing on their sacred ground. Get off the ground and they will frequently negotiate. This distinction has saved more caravans than any escort I have ever hired.",
    { tags: ['culture', 'north'], value: 25 }),

  book('cragmaw-goblinkind', 'On Goblinkind of the Sword Mountains', "a scout of the Lords' Alliance",
    "The Cragmaw tribe is not a warband, it is a household with a very poor temper. Goblins at the bottom, hobgoblins where there is discipline to be had, and bugbears above them because a bugbear can hit a goblin harder than a goblin can hit back. That is the whole of goblinoid politics.\n\nThey hold two places worth naming: a hideout on the Trail that is really a cave with a stream through it, and Cragmaw Castle in the hills, which was elvish once and is not now.\n\nThe useful fact is this: a goblin will betray its chief the moment the arithmetic favours it, and a goblin does that arithmetic constantly. Offer terms. You will be astonished how often it works and how briefly it lasts.",
    { tags: ['monsters', 'quest'], value: 35 }),

  book('ledger-of-tresendar', 'The Ledger of Tresendar', 'kept by the stewards of the house',
    "The Tresendars held this rise before Phandalin was burned and they held it after, until the last of them did not come back from a war nobody in the town could name.\n\nThe manor cellars are older than the manor. They were dug as a redoubt: a place for the town to go when the horns sounded, with a well, a store and a way out under the eastern slope. The family bricked most of it up when the raids stopped.\n\nThis ledger records forty-one years of grain, wine, timber and taxes, and ends mid-sentence in a different hand: 'the lower gallery is not ours any longer and I will not go down again.'",
    { tags: ['phandalin', 'quest'], value: 50 }),

  book('dragons-green-and-old', 'Of Dragons Green and Old', 'Esvele Dundragon',
    "Green dragons lie the way other dragons breathe. They do not want your gold first; they want your arrangement — who you owe, who owes you, and what you would do to keep it.\n\nClaugiyliamatar has held Kryptgarden Forest for longer than Waterdeep has had walls worth the name. Old Gnawbone, the caravan men call her, and every one of them pays a toll they will swear to your face they do not pay.\n\nA young green in a ruined tower is a different animal: hungry, insecure, and building a reputation. It will bargain because it is not yet strong enough not to. That window is short. It closes as it grows, and it is growing while you read this.",
    { tags: ['monsters', 'dragons'], value: 65 }),

  book('waterdeep-warning', "A Visitor's Warning to Waterdeep", 'Mirt, who has no patience for tourists',
    "One. The City Watch is honest and the City Guard is competent and neither of them is on your side; they are on the city's side, and you are a variable.\n\nTwo. The Masked Lords are real, there are about twenty of them, and you have certainly spoken to one. Behave accordingly at all times, which is exhausting and correct.\n\nThree. Everything below the streets belongs to somebody. The sewers to the Guild. The deep vaults to houses older than the Guild. And under all of it, Undermountain, which belongs to a madman with a thousand years of free time.\n\nFour. If a moneylender offers you terms in the Yawning Portal, read them. I write good terms. I also write them very carefully.",
    { tags: ['waterdeep', 'travel'], value: 55 }),

  book('tymoras-coin', "Tymora's Coin, Beshaba's Edge", 'Sister Garaele, Shrine of Luck, Phandalin',
    "They were one goddess once, and were split, and the halves have hated each other ever since. That is the story. Whether it is true matters less than what it teaches, which is that luck has two faces and you never get to choose which one lands.\n\nTymora does not make you lucky. That is the error every gambler in this town makes. She favours the bold — meaning that if you never act, there is nothing for her to favour, and if you act, some of what follows is yours and some is hers and you will never be able to separate them.\n\nToast Beshaba first. Not from fear. From courtesy. Then put the coin down and do the brave thing anyway.",
    { tags: ['religion', 'phandalin'], value: 30 }),

  book('baldurs-mouth-crisis', "Baldur's Mouth — the Crisis Number, Reprinted", 'fourth impression, still a copper',
    "From the number of Uktar, 1492, reprinted each year on the anniversary because it still sells.\n\nDUKE STELMANE SLAIN. Belynne Stelmane, Duke of the city these many years, was murdered in her chair at the Elfsong Tavern by knives now known to have been Bhaalist. The Mouth does not print the details. The Mouth was shown the details, and declines.\n\nRAVENGARD RAISED. Ulder Ravengard, Marshal of the Flaming Fist, is confirmed Grand Duke. Duke Portyr yields the title with, his own words, 'relief, and a list'.\n\nTHE VANTHAMPUR MATTER. The less said of the late Thalamra Vanthampur the better, and the courts have said a great deal.\n\nThe seats stand filled in this year of 1496 by Duchess Sashenstar and Duke Dlusker, and if you wish to know what filling a murdered woman's chair does to a person, the Mouth invites you to watch the Duchess's face when the Elfsong is mentioned.",
    { tags: ['baldurs-gate', 'history'], value: 40 }),

  book('fist-articles', 'Articles of the Flaming Fist', 'posted at every muster, signed RAVENGARD',
    "Article the first: the Fist is a company. The city is the client. The client pays, the company stands, and no fist of this company forgets which of those comes first.\n\nArticle the second: ranks are Fist, Gauntlet, Manip, Flame, Blaze, Marshal. Pay follows rank. Nothing else follows rank, and an officer who believes otherwise is invited to test the belief on the Marshal.\n\nArticle the third: the toll at the gate is the city's. The coin in your glove is not. A fist caught improving his wage at a gate will hold Wyrm's Rock in winter, and then be dismissed, in that order.\n\nArticle the fourth: the road from the Black Dragon Gate to the last milestone of the Coast Way is Fist ground. Keep it open. Everything else — the Council, the Parliament, the patriars, the Guild — is weather.",
    { tags: ['baldurs-gate', 'faction'], value: 35 }),

].map((b) => [b.id, b])));

export const BOOK_IDS = Object.freeze(Object.keys(BOOK_TEXTS));
export function getBook(id) { return BOOK_TEXTS[id] || null; }
export function randomBook(r) { return BOOK_TEXTS[pick(r, BOOK_IDS)] || null; }

// ===========================================================================
// 9. INN_DREAMS — shown on a long rest at an inn
// ===========================================================================

function dream(id, text, o = {}) {
  return {
    id,
    text,
    minLevel: o.minLevel || 1,
    flag: o.flag || null,
    tag: o.tag || 'quiet',            // quiet | omen | memory | dark
    where: o.where || null,           // a map id, when the dream is site-specific
  };
}

// ---------------------------------------------------------------------------
// ANIMALS
// ---------------------------------------------------------------------------
// A beast does not speak Common. Talking to one without Speak with Animals up
// used to fall through the generic fallback, so a sow, a crow and a goose all
// told you the same thing about goblins on the Triboar Trail -- in Common. Two
// tables fix that, both keyed by sprite:
//
//   BEAST_MOMENTS -- what you SEE when you approach an animal you cannot talk
//     to. Third person, observational, no speech. This is the default.
//   BEAST_VOICES  -- what the animal actually SAYS once Speak with Animals is
//     running. Kept inside the 2024 rule that a beast's answers are limited by
//     its intelligence: the here, the now, the recent, and food. None of them
//     know the plot, and none of them talk like a person.
//
// `default` catches any sprite added later, so a new beast reads as dull rather
// than wrong. Lines are chosen by a hash of the NPC id, so two geese in one
// town differ, and each keeps its own line for the length of a visit.

export const BEAST_MOMENTS = deepFreeze({
  dog: [
    'The dog watches your hands, in case they are about to become food-related. When they are not, it forgives you immediately.',
    'It thumps its tail twice on the ground without getting up, which is as much ceremony as you are getting.',
    'The dog leans its whole weight against your shin and stands there, entirely content, going nowhere.',
    'The dog is asleep in the one patch of sun on the whole street, and has clearly planned its day around it.',
    'It falls in beside you for six paces, decides that is enough of an adventure, and turns back.',
  ],
  cat: [
    'The cat regards you with the flat, unhurried contempt of something that has never once been asked to work.',
    'It permits one stroke, decides that was the agreed amount, and walks off mid-sentence.',
    'The cat is sitting exactly where you were about to walk, and has clearly thought about this.',
    'It is watching a spot on the wall where there is nothing at all, and will not be talked out of it.',
  ],
  crow: [
    'The crow turns its head to bring one eye fully to bear on you, and holds it there a beat too long to be comfortable.',
    'It hops one step closer, checks whether you noticed, and hops back. Something bright in your kit has its attention.',
    'The crow says something short and disparaging and goes back to watching the square.',
    'Three of them are up on the roofline. Only this one came down, and it came down to look at you specifically.',
    'The crow drops something small and worthless at your feet and waits, plainly expecting a trade.',
  ],
  goose: [
    'The goose lowers its neck level with the ground and advances. There is no negotiating with this.',
    'It stands in the middle of the lane like a toll it has not yet settled the price of.',
    'The goose hisses. It is a small animal making a very large sound, and it knows it.',
    'It follows you at exactly your walking pace, three feet behind, saying nothing. This is somehow worse.',
  ],
  chicken: [
    'The hen looks at you sideways, decides you are not grain, and resumes the search for something that is.',
    'It scratches twice, stares hard at the ground it has just uncovered, and finds it wanting.',
    'The hen makes a low continuous complaint about the general state of things and moves away from you.',
    'It is standing on a barrel it should not be able to reach, looking pleased about it.',
  ],
  pig: [
    'The sow is lying in the cool mud with the air of something that has solved a problem you have not.',
    'It opens one eye, establishes that you have brought nothing edible, and closes it again.',
    'The sow grunts once, which is either a greeting or a dismissal, and either way is the whole conversation.',
  ],
  sheep: [
    'The sheep looks up, chews, and holds your eye for slightly longer than there is anything behind it to fill.',
    'It moves three steps away and stops, having satisfied whatever that was about.',
    'The sheep is standing very close to another sheep, and would prefer to keep it that way.',
    'It has got itself on the wrong side of a hurdle and cannot work out that the way back is the way it came.',
    'The sheep stares at you, then at the grass, then at you, and cannot hold both facts at once.',
  ],
  goat: [
    'The goat is already eating something it should not be, and makes eye contact throughout.',
    'It has got its head through a fence and is entirely relaxed about how that will end.',
    'The goat considers your belt, your sleeve and your pack in turn, purely as food.',
  ],
  cow: [
    'The cow turns its head with enormous slowness, looks at you, and keeps chewing.',
    'It breathes out heavily through its nose, which is as close to an opinion as you are getting.',
    'The cow has been standing in this spot for some time and intends to go on doing so.',
  ],
  ox: [
    'The ox stands in the traces without impatience, waiting for the part of the day where it pulls.',
    'It shifts its weight, and the whole cart behind it complains about the movement.',
    'The ox looks at you the way a wall would, if a wall were being polite about it.',
    'It is drinking from the trough with great deliberation, and will not be hurried by you or anyone.',
  ],
  horse: [
    'The horse shifts and stamps, wanting the road rather than the post it is tied to.',
    'It lips at your sleeve, finds no apple in it, and holds that against you briefly.',
    'The horse turns one ear toward you and the other toward the road, and the road is winning.',
  ],
  deer: [
    'The deer goes absolutely still, and every part of it is measuring the distance to the trees.',
    'It lifts its head, ears swivelling, and you have perhaps three heartbeats before it decides.',
    'The deer watches you without blinking, and does not move until you do.',
  ],
  fox: [
    'The fox stops, one paw lifted, entirely unbothered, and considers you as an interesting problem.',
    'It flows into the hedge without appearing to hurry, and is somehow already thirty feet away.',
    'The fox has something in its mouth and no intention of discussing where it came from.',
  ],
  'town-rat': [
    'The rat runs the gutter line without once looking up, on business that predates you.',
    'It freezes half out of the drain, whiskers working, then decides you are not worth the interruption.',
    'The rat watches from under the boards. There are almost certainly others.',
    'It is carrying something twice its size down a gap you would not get a finger into.',
  ],
  default: [
    'It watches you for a moment with no expression you can read, then goes back to what it was doing.',
    'The animal shifts, uninterested, and puts its attention somewhere more useful than you.',
  ],
});

export const BEAST_VOICES = deepFreeze({
  dog: [
    '"You smell like three places. One of them had meat in it. Was it the meat one? Tell me it was the meat one."',
    '"I know every person on this street and I like all of them. I like you as well. That was quick, was it not."',
    '"There was shouting last night, past the well. I barked. It stopped. You are welcome."',
    '"Are we going somewhere? We are going somewhere. I am coming. I have decided."',
    '"The tall one with the smell of iron gives me things. I would follow him into anything. Do not tell him."',
  ],
  cat: [
    '"No."\n\nIt does not elaborate, and it does not look away either.',
    '"There is a way in under the storehouse. I am not telling you where. I am telling you there is one."',
    '"You may talk to me. I have not agreed to answer. That is how this works."',
    '"I killed something this morning and left it where you would find it. That was a gift. You are welcome."',
  ],
  crow: [
    '"Bright thing. You have a bright thing. I saw it. Give me the bright thing and I will tell you a true thing."',
    '"Two men on the roof last night who were not roofers. I watched the whole time. Nobody ever asks me."',
    '"Everything dies eventually and I am extremely patient. Nothing personal. You look well."',
    '"I have watched this square since before you were on it and I will watch it after. Ask me something small."',
    '"There is a dead thing in the ditch north of here. I am telling you because you might move it. I cannot."',
  ],
  goose: [
    '"This is MINE. The lane is mine. The puddle is mine. You are standing in the puddle."',
    '"Come closer. Go on. I have waited all week for somebody to come closer."',
    '"I do not care how big you are. I have never once cared how big anything is."',
    '"Two men came at night and I made noise and they went away again. That is the job. I do the job."',
  ],
  chicken: [
    '"Is that grain? That is not grain. Why would you come here without grain."',
    '"The fox came to the fence on the second night and looked at all of us and went away again. Nobody believes me."',
    '"Everything is fine. Everything is fine. Something is going to happen. Everything is fine."',
    '"I laid one this morning. Nobody has said anything about it. Nobody ever says anything about it."',
  ],
  pig: [
    '"I have eaten. I am warm. There is nothing you can offer that improves on this."',
    '"They are kind to me here and they feed me well and I have decided not to think about why."',
    '"Scratch behind the ear and I will tell you anything. I do not know anything. Scratch anyway."',
  ],
  sheep: [
    '"Where are the others. Are you the others. You are not the others."',
    '"Grass here. Grass there. The there grass is better. It is always the there grass."',
    '"Something moved on the hill. It was probably nothing. It is always probably nothing."',
    '"I do not like the gate being open. I do not like the gate being shut either. I would rather no gate."',
    '"You are between me and the others and I would very much like you to stop being that."',
  ],
  goat: [
    '"I can eat that. I can definitely eat that. Stand still."',
    '"They built the fence higher. I want you to know that I take that personally."',
    '"There is a path up the rocks the big ones cannot use. I use it constantly. It is the best thing about me."',
  ],
  cow: [
    '"Mmm. Yes. It is morning. It was morning yesterday as well."',
    '"You are standing where the girl stands with the bucket. You do not have the bucket."',
    '"Everything is slow and that is correct. You are all in a great deal of hurry about nothing."',
  ],
  ox: [
    '"I pull. Then I stop. Then I eat. It is a good arrangement and I would not change it."',
    '"The load was heavier out of Waterdeep than it is now. I noticed. Nobody said anything."',
    '"Do not push. I am already going. I have always already been going."',
    '"There is a stone in the road at the bend that has been there since spring. Somebody should move it."',
  ],
  horse: [
    '"The road goes somewhere. I have been to the end of this rope and it does not."',
    '"You are heavier than you look, and I would still rather carry you than stand here."',
    '"There was wolf on the wind two nights back, west of the trail. The others did not smell it. They never do."',
  ],
  deer: [
    '"Do not follow me. I am saying that politely. Do not follow me."',
    '"Men came through with iron two days ago, going north, being very loud about it."',
    '"I have already chosen which way I am running. I chose before you spoke."',
  ],
  fox: [
    '"I have not taken anything from anyone who could not spare it. Recently."',
    '"There is a gap in the wall behind the smithy. I could be persuaded to stay vague about which one."',
    '"You want to know what is out there. I want to know what is in your pack. We are both being reasonable."',
  ],
  'town-rat': [
    '"Under everything, there is more everything. You lot only ever see the top layer."',
    '"Something big moved in the drains this week and it was not one of us. We are all being very quiet about it."',
    '"You want to get into somewhere? Everything has a hole in it. Everything."',
    '"The grain store leaks on the north side. I would call that a kindness. The miller would not."',
  ],
  default: [
    '"Food. Warm. Not-safe. That is most of it, honestly."',
    'It answers, in a way -- a short string of wants and warnings, none of them about anything further off than this street.',
  ],
});

export const INN_DREAMS = deepFreeze([
  dream('warm-hearth', 'You dream of nothing in particular: a fire, a low room, somebody moving about downstairs. You wake up before dawn feeling as though you were owed the rest of it.'),
  dream('road-ahead', 'You dream you are walking the Triboar Trail east and the road keeps going and the light never changes. It is not frightening. It is only very long.'),
  dream('rain-on-thatch', 'Rain on thatch all night, in the dream and out of it. You surface once, hear it, and go back down gratefully.'),
  dream('the-well', 'You dream of the well in the middle of town. You lean over it. Somewhere a very long way down, somebody is patiently counting.', { tag: 'omen' }),
  dream('coin-spinning', 'A coin spins on a table in the dark and does not fall. You watch it for what feels like hours, and you are not sure which face you are hoping for.', { tag: 'omen' }),
  dream('mud-and-boots', 'You dream about your boots. Specifically, about the mud on them, and about scraping it off, forever. You wake up faintly annoyed.'),
  dream('somebody-elses-house', 'You dream you are in a house you have never been in, and everyone in it knows you, and you cannot remember one of their names. They are all very kind about it.', { tag: 'memory' }),
  dream('the-hanged-man', 'You dream of a street in daylight, a rope, and a crowd of people looking at their own feet. Nobody in the dream will meet your eye. Not even you.', { tag: 'dark', minLevel: 2 }),
  dream('red-cloaks', 'Red cloth in the dark, moving. You are certain there is only one of them until you count, and there are more each time you count.', { tag: 'dark', minLevel: 2 }),
  dream('goblin-drums', 'Somewhere in the hills a drum is being struck badly and enthusiastically. In the dream you find this funny. Waking, rather less so.', { minLevel: 2 }),
  dream('deep-echo', 'You dream you speak a single word in a cave, and the cave says it back a hundred times, each time a little more like something else.', { tag: 'omen', minLevel: 4 }),
  dream('green-eye', 'An eye the size of a cartwheel, green as a bottle, opening slowly and finding you interesting. You wake with your jaw aching from clenching it.', { tag: 'dark', minLevel: 5 }),
  dream('ash-field', 'You walk an ash field and the ash is warm and there are shapes standing in it that do not move. When you get closer they are only dead trees. When you look back they are not where you left them.', { tag: 'dark', minLevel: 5 }),
  dream('forge-hum', 'You dream of a forge you have never seen, humming under a mountain, and of a hundred hands working at once and none of them attached to anybody.', { tag: 'omen', minLevel: 5 }),
  dream('banshees-question', 'A voice in the dark asks you a question in Elvish, kindly, and waits. You do not know the language. You answer anyway, and it seems satisfied.', { tag: 'omen', minLevel: 4 }),
  dream('cold-wing', 'A shadow goes over the moon, once, enormous, and the whole dream frosts over where it passed.', { tag: 'dark', minLevel: 6 }),
  dream('spider-in-the-dark', 'You dream of a web strung between two mountains and something walking it, unhurried, taking its time because it has already decided where you will be standing.', { tag: 'dark', minLevel: 6 }),
  dream('city-of-splendors', 'Towers, gulls, and a bell you almost recognise. In the dream you have lived in that city all your life and are late for something ordinary.', { tag: 'memory', minLevel: 9 }),
  dream('the-laughing-walls', 'You dream of a corridor with no doors, and somebody laughing at the far end of it, and the laugh is coming from the walls on both sides of you at once.', { tag: 'dark', minLevel: 12 }),
  dream('halasters-invitation', "In the dream a thin old man in black looks up from a table of maps, says your name — your actual name — and marks something down. 'Come along, then,' he says, and goes back to work.", { tag: 'dark', minLevel: 14 }),
  dream('the-other-sky', 'You dream of a sky that is the wrong colour and a horizon that is nearer than it should be, and the terrible ordinariness of the people going about their business under it.', { tag: 'dark', minLevel: 15 }),
  dream('quiet-victory', 'You dream of walking into a town you saved and nobody recognising you, and of finding this entirely satisfactory.', { tag: 'quiet', minLevel: 8 }),
]);

/** A dream appropriate to the party's level (and to a flag, if one is set). */
export function randomDream(r, level, opts = {}) {
  const lv = Number(level) || 1;
  const flagFn = typeof opts.hasFlag === 'function' ? opts.hasFlag : null;
  const pool = INN_DREAMS.filter((d) => {
    if (d.minLevel > lv) return false;
    if (d.flag && (!flagFn || !flagFn(d.flag))) return false;
    if (opts.where && d.where && d.where !== opts.where) return false;
    if (opts.tag && d.tag !== opts.tag) return false;
    return true;
  });
  if (!pool.length) return INN_DREAMS[0];
  return pick(r, pool) || pool[0];
}

// ===========================================================================
// 10. Small conveniences the rest of the game asks for.
// ===========================================================================

/** Counts, for the debug overlay and for sanity-checking the catalogues. */
export function tableCounts() {
  return {
    humanEthnicities: HUMAN_ETHNICITIES.length,
    nameSpecies: Object.keys(NAME_TABLES).length,
    deities: DEITY_IDS.length,
    factions: FACTION_IDS.length,
    rumors: RUMORS.length,
    books: BOOK_IDS.length,
    dreams: INN_DREAMS.length,
    tavernLines: TAVERN_LINES.length,
    flavorRoles: Object.keys(FLAVOR_LINES).length,
    beastVoices: Object.keys(BEAST_VOICES).length,
  };
}
