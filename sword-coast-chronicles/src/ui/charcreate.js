// ui/charcreate.js — CharCreateScene: the twelve-step character creation wizard.
//
// Layout (400x240 logical):
//   y 2..33    chapter navigation and full step names
//   y 35..216  options | explanation | portrait / character sheet
//   y 218..238 footer: BACK / hint or validation reason / NEXT
//
// The wizard keeps ONE `draft` object. Every change bumps `_version`, and the next
// frame rebuilds a real Character through rules/character.js#createCharacter — so
// every number in the preview panel is the number the engine will actually use,
// never a hand-computed approximation.
//
// Catalogues written by other modules are read defensively: a missing class,
// subclass, background, feat, item or spell degrades to an empty list, never a throw.
// data/tables.js is loaded lazily because nothing else in the graph requires it.

import { UI } from './kit.js';
import { MK } from './menukit.js';
import { Input } from '../core/input.js';
import { Audio } from '../core/audio.js';
import { Game } from '../engine.js';
import { clamp, signed, ordinal } from '../constants.js';
import { rng, makeRNG } from '../core/rng.js';
import {
  drawActor, drawPortrait, randomAppearance, APPEARANCE_OPTIONS, GENERIC_PALETTES,
} from '../render/actor.js';
import {
  ABILITIES, ABILITY_NAMES, ABILITY_ABBR, ABILITY_DESC, SKILLS, SKILL_IDS,
  mod as scoreMod, STANDARD_ARRAY, POINT_BUY_COST, POINT_BUY_TOTAL,
  POINT_BUY_MIN, POINT_BUY_MAX, pointBuyRemaining, pointBuySpent,
  autoAssign, CLASS_PRIORITY, skillName,
} from '../rules/abilities.js';
import {
  SPECIES, speciesList, speciesById, lineagesOf, hasLineages, lineageOf,
  colorwaysFor, spriteModsFor,
} from '../data/species.js';
import { CLASSES } from '../data/classes.js';
import { SUBCLASSES } from '../data/subclasses.js';
import { BACKGROUNDS, FEATS, FIGHTING_STYLES } from '../data/backgrounds.js';
import {
  SPELLS, getSpell, spellsForList, rangeText, componentText, SCHOOLS,
} from '../data/spells.js';
import { ITEMS, resolveItem, weaponLine, armorLine, WEAPON_MASTERY } from '../data/items.js';
import {
  createCharacter, recalc, abilityScore, profBonus, skillMod,
  saveMod, allFeatures, weaponsOf,
} from '../rules/character.js';
import { preparedMax, spellDC, spellAtk } from '../rules/spellcasting.js';
import {
  invocationsKnownFor, metamagicKnownFor, masteryCountFor,
} from '../rules/progression.js';

// ===========================================================================
// 1. SAFETY HELPERS — every catalogue read goes through one of these.
// ===========================================================================

/** Run `fn`, returning `fb` if it throws or yields null/undefined. */
function safe(fn, fb) {
  try { const v = fn(); return v === undefined || v === null ? fb : v; } catch (e) { return fb; }
}
function sfx(name) { safe(() => Audio.sfx(name), false); }
const arr = (v) => (Array.isArray(v) ? v : []);
const obj = (v) => (v && typeof v === 'object' ? v : {});
const uniq = (a) => Array.from(new Set(arr(a).filter(Boolean)));
const cap = (s) => String(s == null ? '' : s).replace(/-/g, ' ').replace(/(^|\s)\S/g, (m) => m.toUpperCase());
/** "a Dwarf" / "an Aasimar" — the validation strings read badly without it. */
const anA = (s) => (/^[aeiou]/i.test(String(s == null ? '' : s).trim()) ? 'an ' : 'a ') + s;

function getClass(id) { return safe(() => CLASSES[id], null); }
function classIds() {
  const ids = safe(() => Object.keys(CLASSES), []);
  return ids.slice().sort((a, b) => cmpName(safe(() => CLASSES[a], null), a, safe(() => CLASSES[b], null), b));
}
function getBackground(id) { return safe(() => BACKGROUNDS[id], null); }
function backgroundIds() {
  const ids = safe(() => Object.keys(BACKGROUNDS), []);
  return ids.slice().sort((a, b) => cmpName(safe(() => BACKGROUNDS[a], null), a, safe(() => BACKGROUNDS[b], null), b));
}
function getSubclass(id) { return safe(() => SUBCLASSES[id], null); }
function subclassIdsFor(classId) {
  const cls = getClass(classId);
  const listed = arr(cls && cls.subclasses).filter(Boolean);
  if (listed.length) return listed;
  return safe(() => Object.keys(SUBCLASSES).filter((k) => SUBCLASSES[k].classId === classId), []);
}
function getFeat(id) { return safe(() => FEATS[id], null); }
function getItem(id) { return safe(() => resolveItem(id), null) || safe(() => ITEMS[id], null); }
function itemLabel(id) { const it = getItem(id); return (it && it.name) || cap(id); }
function cmpName(a, ka, b, kb) {
  const an = (a && a.name) || ka || '';
  const bn = (b && b.name) || kb || '';
  return String(an).localeCompare(String(bn));
}

/** Species entries, in catalogue order; falls back to the raw keys. */
function allSpecies() {
  const list = safe(() => speciesList(), null);
  if (list && list.length) return list;
  return safe(() => Object.values(SPECIES), []);
}
function getSpecies(id) { return safe(() => speciesById(id), null) || safe(() => SPECIES[id], null); }
function lineagesFor(id) {
  const l = safe(() => lineagesOf(id), null);
  if (l && l.length) return l;
  return arr(safe(() => SPECIES[id].lineages, null));
}
function speciesHasLineages(id) {
  const v = safe(() => hasLineages(id), null);
  if (typeof v === 'boolean') return v;
  return lineagesFor(id).length > 0;
}
function getLineage(sid, lid) {
  if (!lid) return null;
  return safe(() => lineageOf(sid, lid), null) || lineagesFor(sid).find((l) => l && l.id === lid) || null;
}

// --- lazily loaded name/deity tables ---------------------------------------
// Nothing else in the module graph imports data/tables.js, so a static import
// would take the whole game down if that file lands late. Load it on the side.
let TABLES = null;
safe(() => import('../data/tables.js').then((m) => { TABLES = m || null; }).catch(() => { TABLES = null; }));

// ===========================================================================
// 2. LOCAL FALLBACK TABLES — used ONLY when a data module supplies nothing.
// Every name below is published Forgotten Realms / D&D material.
// ===========================================================================

const FALLBACK_FIGHTING_STYLES = {
  archery: { id: 'archery', name: 'Archery', desc: 'You gain a +2 bonus to attack rolls you make with Ranged weapons.' },
  defense: { id: 'defense', name: 'Defense', desc: 'While you wear Light, Medium or Heavy armour you gain a +1 bonus to Armour Class.' },
  dueling: { id: 'dueling', name: 'Dueling', desc: 'When you hold a Melee weapon in one hand and no other weapons, you gain +2 damage with it.' },
  'great-weapon-fighting': { id: 'great-weapon-fighting', name: 'Great Weapon Fighting', desc: 'When you roll a 1 or 2 on a damage die for a Two-Handed or Versatile melee weapon, treat it as a 3.' },
  protection: { id: 'protection', name: 'Protection', desc: 'When a creature you can see attacks someone within 5 feet of you, spend your Reaction to impose Disadvantage.' },
  'two-weapon-fighting': { id: 'two-weapon-fighting', name: 'Two-Weapon Fighting', desc: "When you make an extra attack with the Light property, add your ability modifier to that attack's damage." },
  'blind-fighting': { id: 'blind-fighting', name: 'Blind Fighting', desc: 'You have Blindsight out to 10 feet.' },
  interception: { id: 'interception', name: 'Interception', desc: 'Use your Reaction to reduce damage a nearby creature takes by 1d10 + Proficiency Bonus.' },
  'thrown-weapon-fighting': { id: 'thrown-weapon-fighting', name: 'Thrown Weapon Fighting', desc: 'You gain +2 damage with weapons you throw, and can draw one as part of the attack.' },
  'unarmed-fighting': { id: 'unarmed-fighting', name: 'Unarmed Fighting', desc: 'Your Unarmed Strikes deal 1d6 Bludgeoning damage, or 1d8 with no weapon or shield in hand.' },
};

const FALLBACK_METAMAGIC = {
  'careful-spell': { id: 'careful-spell', name: 'Careful Spell', desc: "1 Sorcery Point: chosen creatures automatically succeed on the spell's saving throw." },
  'distant-spell': { id: 'distant-spell', name: 'Distant Spell', desc: "1 Sorcery Point: double a spell's range, or give a Touch spell 30 feet of reach." },
  'empowered-spell': { id: 'empowered-spell', name: 'Empowered Spell', desc: '1 Sorcery Point: reroll damage dice up to your Charisma modifier.' },
  'extended-spell': { id: 'extended-spell', name: 'Extended Spell', desc: "1 Sorcery Point: double the spell's duration, up to 24 hours, with advantage on Concentration saves." },
  'heightened-spell': { id: 'heightened-spell', name: 'Heightened Spell', desc: '2 Sorcery Points: one target has Disadvantage on its saves against the spell.' },
  'quickened-spell': { id: 'quickened-spell', name: 'Quickened Spell', desc: '2 Sorcery Points: cast an Action spell as a Bonus Action.' },
  'seeking-spell': { id: 'seeking-spell', name: 'Seeking Spell', desc: '1 Sorcery Point: reroll a missed spell attack roll.' },
  'subtle-spell': { id: 'subtle-spell', name: 'Subtle Spell', desc: '1 Sorcery Point: cast without Verbal, Somatic or costless Material components.' },
  'transmuted-spell': { id: 'transmuted-spell', name: 'Transmuted Spell', desc: "1 Sorcery Point: change the spell's damage type to Acid, Cold, Fire, Lightning, Poison or Thunder." },
  'twinned-spell': { id: 'twinned-spell', name: 'Twinned Spell', desc: '1 Sorcery Point: a single-target spell targets a second creature in range.' },
};

const PACT_BOONS = {
  'pact-of-the-blade': { id: 'pact-of-the-blade', name: 'Pact of the Blade', desc: 'Conjure a pact weapon as a Bonus Action. You use Charisma for its attack and damage rolls, and it can take any melee form you like.' },
  'pact-of-the-chain': { id: 'pact-of-the-chain', name: 'Pact of the Chain', desc: 'You always have Find Familiar prepared, and your familiar can take the form of an imp, pseudodragon, quasit, skeleton or sprite.' },
  'pact-of-the-tome': { id: 'pact-of-the-tome', name: 'Pact of the Tome', desc: 'Your Book of Shadows holds two extra cantrips, a ritual, and one 1st-level spell you can cast once per Long Rest.' },
};

const FALLBACK_INVOCATIONS = {
  ...PACT_BOONS,
  'agonizing-blast': { id: 'agonizing-blast', name: 'Agonizing Blast', desc: 'Add your Charisma modifier to the damage of one warlock cantrip that deals damage.' },
  'armor-of-shadows': { id: 'armor-of-shadows', name: 'Armor of Shadows', desc: 'Cast Mage Armor on yourself at will, without a spell slot.' },
  'beast-speech': { id: 'beast-speech', name: 'Beast Speech', desc: 'Cast Speak with Animals at will, without a spell slot.' },
  'devils-sight': { id: 'devils-sight', name: "Devil's Sight", desc: 'You see normally in Dim Light and Darkness, magical or not, out to 120 feet.' },
  'eldritch-mind': { id: 'eldritch-mind', name: 'Eldritch Mind', desc: 'You have Advantage on Constitution saving throws made to maintain Concentration.' },
  'fiendish-vigor': { id: 'fiendish-vigor', name: 'Fiendish Vigor', desc: 'Cast False Life on yourself at will as a 1st-level spell, gaining 2d4+4 Temporary Hit Points.' },
  'gaze-of-two-minds': { id: 'gaze-of-two-minds', name: 'Gaze of Two Minds', desc: 'Touch a willing creature and perceive through its senses while you are on the same plane.' },
  'lessons-of-the-first-ones': { id: 'lessons-of-the-first-ones', name: 'Lessons of the First Ones', desc: 'You gain one Origin feat of your choice.' },
  'mask-of-many-faces': { id: 'mask-of-many-faces', name: 'Mask of Many Faces', desc: 'Cast Disguise Self at will, without a spell slot.' },
  'misty-visions': { id: 'misty-visions', name: 'Misty Visions', desc: 'Cast Silent Image at will, without a spell slot.' },
  'otherworldly-leap': { id: 'otherworldly-leap', name: 'Otherworldly Leap', desc: 'Cast Jump on yourself at will, without a spell slot.' },
  'repelling-blast': { id: 'repelling-blast', name: 'Repelling Blast', desc: 'When you hit with Eldritch Blast you can push the target up to 10 feet straight away from you.' },
};

const FALLBACK_DEITIES = [
  { id: 'tymora', name: 'Tymora', domain: 'Luck', align: 'CG', desc: 'Lady Luck. Her shrine stands at the heart of Phandalin; Sister Garaele keeps it.' },
  { id: 'lathander', name: 'Lathander', domain: 'Dawn, Renewal', align: 'NG', desc: 'The Morninglord. Patron of new beginnings and the honest work of the day.' },
  { id: 'tempus', name: 'Tempus', domain: 'War', align: 'N', desc: 'Lord of Battles. He favours neither side of a war, only courage.' },
  { id: 'mystra', name: 'Mystra', domain: 'Magic', align: 'NG', desc: 'Lady of Mysteries, keeper of the Weave from which every spell is drawn.' },
  { id: 'selune', name: 'Selune', domain: 'Moon, Navigation', align: 'CG', desc: 'Our Lady of Silver, guide of wanderers and enemy of her sister Shar.' },
  { id: 'helm', name: 'Helm', domain: 'Protection', align: 'LN', desc: 'The Vigilant One, god of guards, gates and unbroken watches.' },
  { id: 'torm', name: 'Torm', domain: 'Courage, Duty', align: 'LG', desc: 'The True. Patron of paladins and of loyalty that costs something.' },
  { id: 'ilmater', name: 'Ilmater', domain: 'Endurance, Suffering', align: 'LG', desc: 'The Crying God, who carries what others cannot.' },
  { id: 'chauntea', name: 'Chauntea', domain: 'Agriculture', align: 'NG', desc: 'The Great Mother. Every farmstead on the Triboar Trail says her name at harvest.' },
  { id: 'oghma', name: 'Oghma', domain: 'Knowledge', align: 'N', desc: 'Lord of Knowledge, whose priests hoard books the way dragons hoard gold.' },
  { id: 'kelemvor', name: 'Kelemvor', domain: 'Death, the Dead', align: 'LN', desc: 'Judge of the Damned, who sees that the dead are treated fairly.' },
  { id: 'silvanus', name: 'Silvanus', domain: 'Wild Nature', align: 'N', desc: 'Oak Father, balance of the wild against the axe.' },
  { id: 'mielikki', name: 'Mielikki', domain: 'Forests', align: 'NG', desc: 'Our Lady of the Forest, watching over Neverwinter Wood.' },
  { id: 'moradin', name: 'Moradin', domain: 'Craft, Dwarves', align: 'LG', desc: 'Soulforger. The dwarves of the Sword Mountains still strike his rhythm.' },
  { id: 'corellon', name: 'Corellon Larethian', domain: 'Art, Magic, Elves', align: 'CG', desc: 'First of the Seldarine, creator of the elves.' },
  { id: 'yondalla', name: 'Yondalla', domain: 'Halflings, Hearth', align: 'LG', desc: 'The Protector, keeper of hearth and halfling kin.' },
  { id: 'garl-glittergold', name: 'Garl Glittergold', domain: 'Gnomes, Trickery', align: 'LG', desc: 'The Watchful Protector, whose best jokes save lives.' },
  { id: 'gond', name: 'Gond', domain: 'Craft, Invention', align: 'N', desc: 'Wonderbringer. His faithful build first and ask afterwards.' },
  { id: 'sune', name: 'Sune', domain: 'Beauty, Love', align: 'CG', desc: 'Firehair, Lady of Love, worshipped from Waterdeep to Neverwinter.' },
  { id: 'waukeen', name: 'Waukeen', domain: 'Trade, Wealth', align: 'N', desc: "Merchant's Friend. Every coster on the High Road tithes to her." },
  { id: 'tyr', name: 'Tyr', domain: 'Justice', align: 'LG', desc: 'The Even-Handed, blind and maimed in the cause of law.' },
  { id: 'talos', name: 'Talos', domain: 'Storms, Destruction', align: 'CE', desc: 'The Destroyer. Appeased, never loved.' },
  { id: 'umberlee', name: 'Umberlee', domain: 'Sea', align: 'CE', desc: 'The Bitch Queen. Sailors out of Neverwinter buy her off with coin over the rail.' },
  { id: 'shar', name: 'Shar', domain: 'Darkness, Loss', align: 'NE', desc: 'Mistress of the Night, who offers the comfort of forgetting.' },
  { id: 'lolth', name: 'Lolth', domain: 'Spiders, Drow', align: 'CE', desc: 'Queen of the Demonweb Pits, mother of the drow of Menzoberranzan.' },
  { id: 'bane', name: 'Bane', domain: 'Tyranny', align: 'LE', desc: 'The Black Hand. The Zhentarim were built in his shadow.' },
  { id: 'bahamut', name: 'Bahamut', domain: 'Justice, Metallic Dragons', align: 'LG', desc: 'The Platinum Dragon, whose paladins ride the Sword Coast unannounced.' },
  { id: 'tiamat', name: 'Tiamat', domain: 'Greed, Chromatic Dragons', align: 'LE', desc: 'The Nemesis of the Gods, worshipped by the Cult of the Dragon.' },
  { id: 'gruumsh', name: 'Gruumsh', domain: 'Orcs, Conquest', align: 'CE', desc: 'One-Eye, who drives Many-Arrows south each generation.' },
  { id: 'auril', name: 'Auril', domain: 'Cold', align: 'NE', desc: 'The Frostmaiden, who owns the winter roads.' },
  { id: 'talona', name: 'Talona', domain: 'Poison, Disease', align: 'CE', desc: 'Lady of Poison, whose blessing nobody asks for twice.' },
  { id: 'mask', name: 'Mask', domain: 'Thieves, Shadows', align: 'CN', desc: 'Lord of Shadows. The Zhents pray to him with their off hand.' },
];

const ALIGNMENTS = [
  { id: 'lg', name: 'Lawful Good', desc: 'You keep your word and use it to shield people. Torm and Tyr approve.' },
  { id: 'ng', name: 'Neutral Good', desc: 'You do what good you can, and you do not much care whose rules it breaks.' },
  { id: 'cg', name: 'Chaotic Good', desc: 'Freedom first, kindness always. Most Harpers end up here.' },
  { id: 'ln', name: 'Lawful Neutral', desc: 'Order is the point. The code holds whether or not it is kind.' },
  { id: 'n', name: 'True Neutral', desc: 'Balance, pragmatism, or simply staying out of it — most of Phandalin.' },
  { id: 'cn', name: 'Chaotic Neutral', desc: 'You follow your own weather. Answering to no one is the whole appeal.' },
  { id: 'le', name: 'Lawful Evil', desc: 'You take what you want, by contract. The Black Network hires people like you.' },
  { id: 'ne', name: 'Neutral Evil', desc: 'Whatever you can get away with, you get away with.' },
  { id: 'ce', name: 'Chaotic Evil', desc: 'Cruelty without a plan. Talos and Umberlee have congregations for a reason.' },
];

/** Last-resort name pools, straight out of the setting bible. */
const FALLBACK_NAMES = {
  human: { m: ['Darvin', 'Evendur', 'Gorstag', 'Randal', 'Stedd', 'Ander', 'Bran', 'Lander', 'Malcer', 'Pavel', 'Anton'], f: ['Arveene', 'Esvele', 'Jhessail', 'Rowan', 'Shandri', 'Amafrey', 'Kethra', 'Mara', 'Silifrey', 'Zora', 'Luisa'], s: ['Amblecrown', 'Buckman', 'Dundragon', 'Evenwood', 'Greycastle', 'Tallstag', 'Brightwood', 'Stormwind', 'Hornraven', 'Marivaldi'] },
  elf: { m: ['Aramil', 'Arannis', 'Berrian', 'Carric', 'Erdan', 'Ivellios', 'Laucian', 'Soveliss', 'Theren', 'Varis'], f: ['Adrie', 'Anastrianna', 'Caelynn', 'Ielenia', 'Naivara', 'Sariel', 'Thia', 'Valanthe', 'Shava'], s: ['Amakiir', 'Amastacia', 'Galanodel', 'Holimion', 'Liadon', 'Meliamne', 'Nailo', 'Siannodel', 'Xiloscient'] },
  dwarf: { m: ['Adrik', 'Baern', 'Eberk', 'Fargrim', 'Harbek', 'Rurik', 'Taklinn', 'Thoradin', 'Ulfgar'], f: ['Audhild', 'Bardryn', 'Eldeth', 'Gunnloda', 'Kathra', 'Riswynn', 'Torbera', 'Vistra', 'Helja'], s: ['Balderk', 'Battlehammer', 'Brawnanvil', 'Fireforge', 'Frostbeard', 'Ironfist', 'Loderr', 'Rockseeker', 'Strakeln'] },
  halfling: { m: ['Alton', 'Cade', 'Corrin', 'Eldon', 'Finnan', 'Merric', 'Milo', 'Osborn', 'Wellby', 'Roscoe'], f: ['Andry', 'Bree', 'Callie', 'Cora', 'Kithri', 'Lidda', 'Nedda', 'Portia', 'Verna', 'Seraphina'], s: ['Brushgather', 'Goodbarrel', 'Greenbottle', 'High-hill', 'Leagallow', 'Tealeaf', 'Thorngage', 'Underbough', 'Tosscobble'] },
  gnome: { m: ['Boddynock', 'Brocc', 'Burgell', 'Dimble', 'Fonkin', 'Gimble', 'Namfoodle', 'Orryn', 'Zook', 'Jebeddo'], f: ['Bimpnottin', 'Breena', 'Caramip', 'Donella', 'Ellywick', 'Nissa', 'Roywyn', 'Waywocket', 'Duvamil'], s: ['Beren', 'Daergel', 'Folkor', 'Garrick', 'Nackle', 'Raulnor', 'Scheppen', 'Timbers', 'Turen'] },
  orc: { m: ['Dench', 'Gell', 'Holg', 'Imsh', 'Keth', 'Krusk', 'Mhurren', 'Thokk', 'Ront'], f: ['Baggi', 'Emen', 'Kansif', 'Myev', 'Ovak', 'Shautha', 'Vola', 'Yevelda', 'Sutha'], s: [] },
  dragonborn: { m: ['Arjhan', 'Balasar', 'Donaar', 'Ghesh', 'Kriv', 'Medrash', 'Nadarr', 'Rhogar', 'Torinn', 'Mehen'], f: ['Akra', 'Biri', 'Farideh', 'Harann', 'Korinn', 'Nala', 'Sora', 'Thava', 'Uadjit', 'Perra'], s: ['Daardendrian', 'Delmirev', 'Kepeshkmolik', 'Kerrhylon', 'Myastan', 'Norixius', 'Turnuroth', 'Verthisathurgiesh', 'Shestendeliath'] },
  tiefling: { m: ['Akmenos', 'Damakos', 'Iados', 'Kairon', 'Melech', 'Mordai', 'Morthos', 'Skamos', 'Leucis'], f: ['Akta', 'Bryseis', 'Criella', 'Damaia', 'Kallista', 'Lerissa', 'Nemeia', 'Orianna', 'Rieta'], s: ['Hope', 'Glory', 'Torment', 'Reverence', 'Quest', 'Temerity', 'Sorrow', 'Creed', 'Excellence'] },
  goliath: { m: ['Aukan', 'Eglath', 'Gauthak', 'Ilikan', 'Lo-Kag', 'Thotham', 'Uthal', 'Vimak', 'Manneo'], f: ['Gae-Al', 'Keothi', 'Kuori', 'Nalla', 'Orilo', 'Paavu', 'Thalai', 'Vaunea', 'Pethani'], s: [] },
  tabaxi: { m: ['Cloud on the Mountaintop', 'Five Timber', 'Seven Thundercloud'], f: ['Jade Shoe', 'Left-Handed Hummingbird', 'Skirt of Snakes'], s: ['Smoking Mirror', 'Cloud on the Mountaintop', 'Five Timber'] },
};
FALLBACK_NAMES['half-elf'] = FALLBACK_NAMES.human;
FALLBACK_NAMES['half-orc'] = FALLBACK_NAMES.orc;
FALLBACK_NAMES.aasimar = FALLBACK_NAMES.human;

/** Human ethnic sub-tables, for the identity step's ethnicity cycler. */
const HUMAN_ETHNICITIES = ['chondathan', 'illuskan', 'tethyrian', 'damaran', 'calishite', 'turami', 'rashemi'];

/** One-line "plays like" summaries — the honest pitch for each class. */
const PLAYS_LIKE = {
  barbarian: 'Walk in first, soak the hits, hit back harder. No resource management.',
  bard: 'Talk your way in, buff the party, and have exactly the right spell for it.',
  cleric: 'The party lives or dies on your action economy. Heals, buffs, radiant hammers.',
  druid: 'Battlefield control and a bear you can turn into when the plan fails.',
  fighter: 'The most attacks in the game, the best armour, and a second wind when it hurts.',
  monk: 'Sprint across the field, hit four times, and never take an opportunity attack.',
  paladin: 'A walking aura of saves who deletes one important enemy per fight.',
  ranger: 'Tracker, archer and skirmisher — strongest in the wilds, weakest in a ballroom.',
  rogue: 'One enormous hit a round, plus the skills nobody else took.',
  sorcerer: 'Fewer spells than a wizard, but you bend the ones you have mid-cast.',
  warlock: 'Two slots that come back on a short rest, and a cantrip that never runs dry.',
  wizard: 'The widest spell list in the Realms and a book you keep filling forever.',
};

/** Background bond lines. Falls back to a generic Realms set for unknown ids. */
const BOND_LINES = {
  acolyte: ['You still keep the shrine\'s dawn vigil, wherever the road puts you.', 'A relic was taken from your temple. You mean to bring it home.', 'The prayers stopped working the day you left. You want to know why.'],
  artisan: ['Your master\'s mark is stamped on everything you make. You will earn it.', 'You owe a Waterdhavian guild more coin than you can honestly repay.', 'You are chasing a technique nobody in the North has managed twice.'],
  charlatan: ['There is a name on the Neverwinter watch lists that used to be yours.', 'You only ever cheat people who deserve it. Mostly.', 'You are looking for the con artist who taught you, and left you holding it.'],
  criminal: ['You did a job in Luskan that still has people looking for you.', 'Someone took the fall for you. You are going to buy them out.', 'The Zhentarim consider your debt outstanding. You disagree.'],
  entertainer: ['A crowd in Waterdeep once went silent for you. You chase that silence.', 'You perform to send coin home to a family that thinks you are dead.', 'A rival stole your best song. You want it back with interest.'],
  farmer: ['Raiders burned the fields. You went looking for them instead of replanting.', 'Chauntea\'s harvest fed the whole hamlet. You mean to keep it fed.', 'You left a plough half in the furrow and never explained why.'],
  guard: ['You lost someone on your watch. It will not happen twice.', 'The gate you kept is gone now. The habit isn\'t.', 'You still say the roll-call names under your breath before a fight.'],
  guide: ['You know a pass through the Sword Mountains that isn\'t on any map.', 'You lost a party in the Mere of Dead Men. You go back looking.', 'The wilds are not dangerous, in your view. People are careless.'],
  hermit: ['Something spoke to you out of the silence. You are still deciding what.', 'You came down from the hills because a vision said the year mattered.', 'You prefer trees to people and have not been persuaded otherwise.'],
  merchant: ['Every road on the Sword Coast is a ledger line to you.', 'A caravan of yours never reached Phandalin. You want the manifest.', 'Waukeen rewards nerve. You have been testing that theory.'],
  noble: ['Your house name opens doors in Waterdeep and closes them in Luskan.', 'You are the second child, so the title went elsewhere. Good.', 'You mean to earn the crest instead of inheriting it.'],
  sage: ['There is one book in Candlekeep you have not been allowed to read.', 'You are chasing a Netherese reference nobody else takes seriously.', 'You would rather be right than safe, and you usually manage both.'],
  sailor: ['You have been overboard once. Umberlee let you go, and you noticed.', 'Your ship is at the bottom of the Sea of Swords with your name on it.', 'Land makes you restless. You keep moving inland anyway.'],
  scribe: ['You copied a contract that ruined a family. You have not forgotten it.', 'Oghma\'s clerks taught you to read anything, in any hand.', 'You keep a journal nobody else is permitted to open.'],
  soldier: ['You marched for the Lords\' Alliance and came home to nothing.', 'You still count the ones who did not come back off the line.', 'Orders were easier than choices. You are learning choices.'],
  wayfarer: ['You grew up in the streets of Neverwinter and owe them nothing.', 'You have slept in every ditch between Waterdeep and Leilon.', 'Somebody fed you once when they had no reason to. You pay it forward.'],
};
const GENERIC_BONDS = [
  'You came to Phandalin because the work is honest and the roads are not.',
  'Somebody on the Sword Coast owes you an answer, and you mean to collect it.',
  'You keep walking north because standing still has never once helped.',
];

/** Outfit / trim palettes for the appearance step. */
const CLOTH_PALETTE = [
  '#7a3030', '#9a2a2a', '#8f4a2a', '#b06a2a', '#8a6a2a', '#5c6b2a', '#3f6b3a', '#2f6b6b',
  '#2f4f7f', '#37527a', '#1f3a5a', '#5a3a6b', '#7a2a5a', '#4a4a52', '#2a2a30', '#6b4a2a',
  '#a89878', '#c8b58a', '#d8ccae', '#e0d8c0',
];
const METAL_PALETTE = ['#aab2c0', '#c8ccd4', '#8f96a2', '#c8b06a', '#d9c07a', '#9a8f80', '#7a6a5a', '#5f6672', '#4a4e58'];
const LEATHER_PALETTE = ['#6b4a2a', '#54381f', '#7a5a34', '#8f6a3a', '#3f2c18', '#a07a4a', '#4a3a2a', '#2e2116'];
const ACCENT_PALETTE = ['#e3b34a', '#f0d264', '#c0c6d0', '#b06a2a', '#7fbf6a', '#6aa8e8', '#b07ae0', '#e08ab0', '#d4553f'];
const HORN_PALETTE = ['#8c8377', '#6a6058', '#b8ab97', '#3a3630', '#d8cdb4', '#5a4a3a', '#2a2622', '#c8b06a'];

// ===========================================================================
// 3. LAYOUT
// ===========================================================================

const TAB_X = 2, TAB_Y = 12, TAB_W = 396, TAB_H = 10;
const BODY_Y = 35, BODY_H = 181;     // 35 .. 216
const PREVIEW_DIRECTIONS = ['down', 'left', 'up', 'right'];
const LP_X = 2, LP_W = 137;      // left panel
const MP_X = 141, MP_W = 138;    // middle panel
const RP_X = 281, RP_W = 117;    // right panel
const LC_X = LP_X + 4, LC_W = LP_W - 8;     //  6 .. 115
const MC_X = MP_X + 4, MC_W = MP_W - 8;     // 125 .. 275
const RC_X = RP_X + 4, RC_W = RP_W - 8;     // 285 .. 394
/**
 * Two-letter ability tags for the narrow option rows. "Co" and "Ch" keep
 * Constitution and Charisma apart, which a single letter cannot, and the
 * three of them together are 35px instead of the 65px "STR/DEX/CHA" costs.
 */
const ABILITY_PAIR = Object.freeze({ str: 'St', dex: 'Dx', con: 'Co', int: 'In', wis: 'Wi', cha: 'Ch' });

const FOOT_Y = 218, FOOT_H = 20;
// The footer's message/hint slot: x 54 up to the NEXT/CREATE button at x 338.
// Every hintLine() string is written to fit inside it uncut — 47 characters at
// sm is 281px — because the half that gets ellipsised is the instruction half.
const FOOT_LINE_W = 282;
const ROW_H = 11;
// How many sub-section tabs fit on the strip at once. A warlock can hold eleven
// level-1 choices, so the strip scrolls rather than hiding the overflow.
const BUCKET_SLOTS = 5;

const STEPS = [
  { id: 'species', tab: 'RACE', title: 'Species' },
  { id: 'class', tab: 'CLAS', title: 'Class' },
  { id: 'subclass', tab: 'SUB', title: 'Subclass' },
  { id: 'background', tab: 'BACK', title: 'Background' },
  { id: 'abilities', tab: 'ABIL', title: 'Abilities' },
  { id: 'skills', tab: 'SKIL', title: 'Skills' },
  { id: 'spells', tab: 'SPEL', title: 'Spells' },
  { id: 'features', tab: 'FEAT', title: 'Features' },
  { id: 'equipment', tab: 'GEAR', title: 'Equipment' },
  { id: 'appearance', tab: 'LOOK', title: 'Appearance' },
  { id: 'identity', tab: 'NAME', title: 'Identity' },
  { id: 'summary', tab: 'DONE', title: 'Review' },
];
const CHAPTERS = [
  {label:'Origins', steps:[0,1,2,3]},
  {label:'Training', steps:[4,5,6,7]},
  {label:'Personal', steps:[8,9,10]},
  {label:'Review', steps:[11]},
];
const STEP_INDEX = {};
STEPS.forEach((s, i) => { STEP_INDEX[s.id] = i; });

// ===========================================================================
// 4. KIT ADAPTERS — all drawing funnels through ui/kit.js UI.*
// ===========================================================================

function col(name, fb) { const c = obj(UI.COLORS); return c[name] || fb; }
const C = {
  get ink() { return col('ink', '#efe6d0'); },
  get dim() { return col('inkDim', col('dim', '#9a917f')); },
  get gold() { return col('gold', '#e3b34a'); },
  get goldB() { return col('goldBright', '#f7dc92'); },
  get goldD() { return col('goldDim', '#a37a26'); },
  get red() { return col('red', '#d4553f'); },
  get green() { return col('green', '#6fc36a'); },
  get blue() { return col('blue', '#6aa8e8'); },
  get purple() { return col('purple', '#b07ae0'); },
  get cyan() { return col('cyan', '#63d6d0'); },
  get orange() { return col('orange', '#e8863a'); },
  get panel() { return col('panel', '#181b28'); },
  get border() { return col('border', '#5c4a2a'); },
  get hp() { return col('hp', '#c8452f'); },
  get mp() { return col('mp', '#4a7ad0'); },
  get xp() { return col('xp', '#e3b34a'); },
  get off() { return col('disabled', '#5a5548'); },
};

function panel(ctx, x, y, w, h, style) {
  safe(() => UI.panel(ctx, x | 0, y | 0, w | 0, h | 0, { style: style || 'window' }));
}
function txt(ctx, x, y, s, o) { safe(() => UI.text(ctx, x | 0, y | 0, String(s == null ? '' : s), o || {})); }
function tw(s, size) {
  s = String(s == null ? '' : s);
  if (!s.length) return 0;
  const m = safe(() => UI.measure(s, size || 'sm'), null);
  if (typeof m === 'number' && m > 0) return m;
  return s.length * (size === 'lg' ? 12 : size === 'md' ? 7 : 6);
}
function rtxt(ctx, rx, y, s, o) { txt(ctx, rx - tw(s, (o || {}).size), y, s, o); }
function ctxt(ctx, cx, y, s, o) { txt(ctx, cx - tw(s, (o || {}).size) / 2, y, s, o); }
function fill(ctx, x, y, w, h, c) {
  ctx.save(); ctx.fillStyle = c;
  ctx.fillRect(x | 0, y | 0, Math.max(0, w) | 0, Math.max(0, h) | 0);
  ctx.restore();
}
function frame(ctx, x, y, w, h, c) {
  ctx.save(); ctx.strokeStyle = c; ctx.lineWidth = 1;
  ctx.strokeRect((x | 0) + 0.5, (y | 0) + 0.5, Math.max(1, (w | 0) - 1), Math.max(1, (h | 0) - 1));
  ctx.restore();
}
function rule(ctx, x, y, w, c) { fill(ctx, x, y, w, 1, c || 'rgba(140,120,70,0.35)'); }
function clipped(ctx, x, y, w, h, fn) {
  ctx.save(); ctx.beginPath(); ctx.rect(x | 0, y | 0, Math.max(0, w) | 0, Math.max(0, h) | 0); ctx.clip();
  try { fn(); } catch (e) { /* a bad catalogue entry must not kill the frame */ }
  ctx.restore();
}
/**
 * Truncate to `w` px. The `out.length > 1` guard used to guarantee two glyphs
 * of output — 11px at sm, 13px at md — so a caller that handed this an 8px
 * slot overflowed by 3px with nothing to show for it. A slot too narrow for
 * one glyph and the ellipsis gets the ellipsis; one too narrow for that gets
 * nothing. The column always wins.
 */
function ellip(s, w, size) {
  s = String(s == null ? '' : s);
  if (tw(s, size) <= w) return s;
  if (tw('…', size) > w) return '';
  let out = s;
  while (out.length > 1 && tw(out + '…', size) > w) out = out.slice(0, -1);
  return tw(out + '…', size) > w ? '…' : out + '…';
}

/** Greedy word wrap against the real font metrics. */
function wrapText(s, w, size) {
  const out = [];
  const paras = String(s == null ? '' : s).split(/\n+/);
  for (const para of paras) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { out.push(''); continue; }
    let line = '';
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (tw(test, size) <= w) { line = test; continue; }
      if (line) out.push(line);
      let rest = word;
      while (tw(rest, size) > w && rest.length > 1) {
        let cut = rest.length;
        while (cut > 1 && tw(rest.slice(0, cut), size) > w) cut--;
        out.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    if (line) out.push(line);
  }
  return out;
}

function frameSel(ctx, x, y, w, h, t) {
  if (typeof UI.frameSel === 'function') {
    const ok = safe(() => { UI.frameSel(ctx, x | 0, y | 0, w | 0, h | 0, t); return true; }, false);
    if (ok) return;
  }
  fill(ctx, x, y, w, h, 'rgba(227,179,74,0.16)');
  frame(ctx, x, y, w, h, C.gold);
}

/** A colour swatch with a pixel border, used all over the appearance step. */
function swatch(ctx, x, y, w, h, color, sel) {
  fill(ctx, x, y, w, h, color || '#000');
  frame(ctx, x, y, w, h, sel ? C.goldB : 'rgba(0,0,0,0.75)');
}

// ===========================================================================
// 5. DOC — the scrollable detail-pane builder.
// Blocks are accumulated with their heights, then only the visible slice is
// drawn. Nothing can ever overflow the panel, and prev/next scrolls it.
// ===========================================================================

/**
 * Row pitch for the doc column.
 *
 * The glyphs themselves cannot shrink: the font is a 5x7 bitmap drawn at
 * scale 1, and E/H/M/W/Z all paint column 5, so dropping letterSpacing to 0
 * would fuse "HE" into one blob. The pitch is the knob that is actually free.
 * A glyph occupies rows 0..6 (row 6 only for the descenders g j p q y), so an
 * 8px pitch still leaves a clear row between lines where 9px left two -- about
 * an eighth more text in the same panel, at no cost to legibility.
 */
const DOC_LINE = 8;

function Doc(x, w) {
  return {
    x, w, y: 0, ops: [],
    _push(h, fn) { this.ops.push({ y: this.y, h, fn }); this.y += h; return this; },
    gap(n = 3) { this.y += n; return this; },

    /** Big gold heading. */
    head(s, color) {
      const self = this;
      return this._push(DOC_LINE + 2, (ctx, y) => txt(ctx, self.x, y, ellip(s, self.w, 'md'), { size: 'md', color: color || C.gold, shadow: true }));
    },

    /** A single non-wrapping line. */
    line(s, o) {
      const self = this; const op = obj(o);
      return this._push(op.h || DOC_LINE, (ctx, y) => txt(ctx, self.x + (op.indent || 0), y, ellip(s, self.w - (op.indent || 0), op.size), { size: op.size || 'sm', color: op.color || C.ink, shadow: true }));
    },

    /** Wrapped body text. */
    wrap(s, o) {
      const op = obj(o);
      const size = op.size || 'sm';
      const indent = op.indent || 0;
      const lines = wrapText(s, this.w - indent, size);
      const self = this;
      for (const l of lines) {
        this._push(DOC_LINE, ((line) => (ctx, y) => txt(ctx, self.x + indent, y, line, { size, color: op.color || C.dim, shadow: true }))(l));
      }
      return this;
    },

    /**
     * "Speed  30 ft." — label left, value right.
     *
     * The two halves have to add up to the row: giving the label 55% and the
     * value 60% let a long pair overlap in the middle, which is what put a
     * stray ellipsis through "Resistant to  Necrotic, Radiant". The value gets
     * what it needs up to two thirds, the label gets the rest less a gap.
     */
    kv(k, v, o) {
      const self = this; const op = obj(o);
      const GAP = 6;
      const val = String(v == null ? '' : v);
      // Short pairs stay on one line. Long mechanical values must remain
      // available through scrolling, rather than losing their suffix forever.
      if (tw(k, 'sm') + GAP + tw(val, 'sm') > self.w) {
        this.wrap(k, {color:op.keyColor || C.dim});
        this.wrap(val, {indent:4,color:op.color || C.ink});
        return this.gap(2);
      }
      return this._push(DOC_LINE, (ctx, y) => {
        txt(ctx, self.x, y, k, { size: 'sm', color: op.keyColor || C.dim, shadow: true });
        rtxt(ctx, self.x + self.w, y, val, { size: 'sm', color: op.color || C.ink, shadow: true });
      });
    },

    /** A thin divider with an optional small caption. */
    rule(label) {
      const self = this;
      return this._push(label ? 11 : 6, (ctx, y) => {
        if (label) {
          txt(ctx, self.x, y, label, { size: 'sm', color: C.goldD, shadow: true });
          const lw = tw(label, 'sm') + 4;
          rule(ctx, self.x + lw, y + 3, Math.max(0, self.w - lw));
        } else {
          rule(ctx, self.x, y + 2, self.w);
        }
      });
    },

    /** A wrapped row of small coloured chips. */
    chips(items, o) {
      const op = obj(o);
      const list = arr(items).filter(Boolean);
      if (!list.length) return this;
      const self = this;
      // pack into rows first so the height is known up front
      const rows = [[]];
      let used = 0;
      for (const it of list) {
        const label = typeof it === 'string' ? it : it.label;
        const cw = tw(label, 'sm') + 8;
        if (used + cw > self.w && rows[rows.length - 1].length) { rows.push([]); used = 0; }
        rows[rows.length - 1].push({ label, color: (typeof it === 'object' && it.color) || op.color || C.dim, w: cw });
        used += cw + 2;
      }
      for (const row of rows) {
        this._push(11, ((r) => (ctx, y) => {
          let cx = self.x;
          for (const c of r) {
            safe(() => UI.chip(ctx, cx, y, c.label, { color: c.color }));
            cx += c.w + 2;
          }
        })(row));
      }
      return this;
    },

    /** A palette strip with the current index framed. */
    swatches(colors, idx, o) {
      const list = arr(colors);
      if (!list.length) return this;
      const op = obj(o);
      const self = this;
      const cell = op.cell || 11;
      const per = Math.max(1, Math.floor(self.w / cell));
      const rows = Math.ceil(list.length / per);
      for (let r = 0; r < rows; r++) {
        this._push(cell + 1, ((row) => (ctx, y) => {
          for (let i = 0; i < per; i++) {
            const n = row * per + i;
            if (n >= list.length) break;
            swatch(ctx, self.x + i * cell, y, cell - 2, cell - 2, list[n], n === idx);
          }
        })(r));
      }
      return this;
    },

    /** Arbitrary custom block. */
    custom(h, fn) { return this._push(h, fn); },

    /** Draw the slice of the document visible in [y, y+h). Returns total height. */
    render(ctx, y0, viewH, scroll) {
      const s = clamp(scroll || 0, 0, Math.max(0, this.y - viewH));
      const self = this;
      clipped(ctx, this.x - 2, y0, this.w + 4, viewH, () => {
        for (const op of self.ops) {
          const oy = y0 + op.y - s;
          if (oy + op.h < y0 - 2 || oy > y0 + viewH + 2) continue;
          op.fn(ctx, Math.round(oy));
        }
      });
      // scroll affordances
      if (this.y > viewH) {
        const bx = this.x + this.w + 1;
        fill(ctx, bx, y0, 2, viewH, 'rgba(0,0,0,0.5)');
        const th = Math.max(8, Math.round((viewH / this.y) * viewH));
        const ty = y0 + Math.round(((viewH - th) * s) / Math.max(1, this.y - viewH));
        fill(ctx, bx, ty, 2, th, C.goldD);
        if (s > 0) txt(ctx, this.x + this.w - 8, y0 - 1, '▲', { size: 'sm', color: C.goldD });
        if (s < this.y - viewH - 0.5) txt(ctx, this.x + this.w - 8, y0 + viewH - 7, '▼', { size: 'sm', color: C.goldD });
      }
      return this.y;
    },
  };
}

// ===========================================================================
// 6. DATA SHAPING — turns whatever the catalogues supply into uniform shapes.
// ===========================================================================

/** DEITIES may be an array, an object map, or absent. Normalise all three. */
function deityList() {
  const raw = TABLES ? safe(() => TABLES.DEITIES, null) : null;
  let list = [];
  if (Array.isArray(raw)) list = raw;
  else if (raw && typeof raw === 'object') list = Object.values(raw);
  list = list.map((d) => (typeof d === 'string'
    ? { id: d.toLowerCase().replace(/[^a-z]+/g, '-'), name: d, domain: '', align: '', desc: '' }
    : {
      id: d.id || String(d.name || '').toLowerCase().replace(/[^a-z]+/g, '-'),
      name: d.name || d.id,
      domain: d.domain || d.portfolio || d.sphere || d.domains || '',
      align: d.align || d.alignment || '',
      desc: d.desc || d.blurb || '',
    })).filter((d) => d && d.name);
  return list.length ? list : FALLBACK_DEITIES;
}

function fightingStyleTable() {
  const t = safe(() => FIGHTING_STYLES, null);
  return (t && Object.keys(t).length) ? t : FALLBACK_FIGHTING_STYLES;
}
function metamagicTable() { return FALLBACK_METAMAGIC; }
function invocationTable() { return FALLBACK_INVOCATIONS; }

/**
 * Turn an option id into {id,name,desc}, searching every catalogue it could be in.
 *
 * The bucket's own `type` picks the catalogue to ask FIRST, because ids collide
 * across catalogues: `light` is both the Light cantrip and the cleric's Light
 * Domain, and searching SUBCLASSES ahead of SPELLS put "Light Domain" in a
 * wizard's cantrip list while the detail pane beside it described the cantrip.
 * Anything not covered by a type falls through the same order as before.
 */
function optionEntry(type, id) {
  const key = String(id);
  const look = (t) => safe(() => t[key], null);
  const spellish = type === 'cantrip' || type === 'spell';
  const tables = [
    (type === 'skill' || type === 'expertise') ? SKILLS : null,
    spellish ? safe(() => SPELLS, {}) : null,
    type === 'mastery' ? safe(() => WEAPON_MASTERY, {}) : null,
    type === 'feat' ? safe(() => FEATS, {}) : null,
    fightingStyleTable(), FALLBACK_METAMAGIC, FALLBACK_INVOCATIONS,
    safe(() => FEATS, {}), safe(() => SUBCLASSES, {}), safe(() => SPELLS, {}),
    safe(() => WEAPON_MASTERY, {}), SKILLS,
  ].filter(Boolean);
  for (const t of tables) {
    const e = look(t);
    if (e && (e.name || e.desc)) return { id: key, name: e.name || cap(key), desc: e.desc || '' };
  }
  const it = getItem(key);
  if (it) {
    const mast = it.mastery ? safe(() => WEAPON_MASTERY[it.mastery], null) : null;
    const line = safe(() => weaponLine(it), '') || safe(() => armorLine(it), '') || '';
    return { id: key, name: it.name, desc: (line + (mast ? '\n' + mast.name + ': ' + mast.desc : '')).trim() };
  }
  return { id: key, name: cap(key), desc: '' };
}

/** Weapons whose mastery property a class is actually allowed to take. */
function masteryWeapons(classId) {
  const cls = getClass(classId);
  const profs = arr(cls && cls.weaponProf);
  const ids = safe(() => Object.keys(ITEMS), []);
  const out = ids.filter((id) => {
    const it = safe(() => ITEMS[id], null);
    if (!it || it.kind !== 'weapon' || !it.mastery) return false;
    if (it.rarity && it.rarity !== 'common') return false;      // mundane weapons only
    if (!profs.length) return true;
    if (it.category && profs.includes(it.category)) return true;
    return profs.includes(id);
  });
  return out.sort((a, b) => itemLabel(a).localeCompare(itemLabel(b)));
}

function featsOfCategory(catId) {
  const ids = safe(() => Object.keys(FEATS), []);
  const filtered = ids.filter((id) => safe(() => FEATS[id].category, 'general') === catId);
  const use = filtered.length ? filtered : ids;
  return use.slice().sort((a, b) => cmpName(getFeat(a), a, getFeat(b), b));
}

/** Options for a `choice` block whose `from` is 'auto', 'any', or an id list. */
function resolveChoiceOptions(type, from, info) {
  const nfo = obj(info);
  if (Array.isArray(from) && from.length) {
    if (typeof from[0] === 'object') {
      return from.map((o) => ({ id: o.id || o.name, name: o.name || cap(o.id), desc: o.desc || '' }));
    }
    return from.map((id) => optionEntry(type, id));
  }
  if (from && typeof from === 'object' && !Array.isArray(from)) {
    return Object.keys(from).map((k) => {
      const o = obj(from[k]);
      return { id: o.id || k, name: o.name || cap(k), desc: o.desc || '' };
    });
  }
  switch (type) {
    case 'fightingStyle': case 'fighting-style': case 'style':
      return Object.keys(fightingStyleTable()).map((id) => optionEntry(type, id));
    case 'metamagic':
      return Object.keys(metamagicTable()).map((id) => optionEntry(type, id));
    case 'invocation':
      return Object.keys(invocationTable()).filter((id) => !PACT_BOONS[id]).map((id) => optionEntry(type, id));
    case 'pactBoon': case 'pact': case 'boon':
      return Object.keys(PACT_BOONS).map((id) => optionEntry(type, id));
    case 'expertise':
      return arr(nfo.proficientSkills).map((id) => optionEntry('skill', id));
    case 'mastery':
      return masteryWeapons(nfo.classId).map((id) => optionEntry(type, id));
    case 'feat':
      return featsOfCategory(typeof from === 'string' && from !== 'auto' && from !== 'any' ? from : 'origin')
        .map((id) => optionEntry(type, id));
    case 'skill':
      return SKILL_IDS.map((id) => optionEntry('skill', id));
    case 'ability':
      return ABILITIES.map((ab) => ({ id: ab, name: ABILITY_NAMES[ab], desc: ABILITY_DESC[ab] }));
    case 'cantrip': case 'spell':
      return arr(nfo.spellIds).map((id) => optionEntry(type, id));
    default:
      return [];
  }
}

// --- spellcasting shape ----------------------------------------------------

function castingOf(cls) { return obj(obj(cls).spellcasting); }
function isCaster(classId) {
  const sc = castingOf(getClass(classId));
  return !!(sc && (sc.list || sc.ability));
}

/** Number of cantrips known at a class level. */
function cantripCount(cls, level) {
  const sc = castingOf(cls);
  const t = sc.cantripsKnown || sc.cantrips;
  if (Array.isArray(t)) { const v = t[Math.min(level, t.length - 1)]; if (typeof v === 'number') return v; }
  return typeof t === 'number' ? t : 0;
}

/** Prepared/known spell count at a class level. */
function preparedCount(cls, level, abilityModifier) {
  const sc = castingOf(cls);
  const table = sc.preparedTable || sc.prepared
    || (Array.isArray(sc.prepFormula) ? sc.prepFormula : null)
    || (Array.isArray(sc.spellsKnownTable) ? sc.spellsKnownTable : null);
  if (Array.isArray(table)) {
    const v = table[Math.min(level, table.length - 1)];
    if (typeof v === 'number') return v;
  }
  const f = String(sc.prepFormula || '');
  if (/half/.test(f)) return Math.max(1, Math.floor(level / 2) + abilityModifier);
  return Math.max(1, level + abilityModifier);
}

/** Highest spell level this class can reach at `level`. */
function maxSpellLevel(cls, level) {
  const sc = castingOf(cls);
  const slot = sc.slotTable || 'full';
  if (slot === 'third') return clamp(Math.ceil(Math.max(1, level - 2) / 6), 1, 4);
  if (slot === 'half') return clamp(Math.ceil(level / 4), 1, 5);
  if (slot === 'pact') return clamp(Math.ceil(level / 2), 1, 5);
  return clamp(Math.ceil(level / 2), 1, 9);
}

/** Wizard spellbook size at a level: 6 at 1st, +2 per level after. */
function spellbookSize(level) { return 6 + 2 * Math.max(0, level - 1); }

/** A short "1d8 fire, Dex save" line for the spell detail pane. */
function spellEffectLine(sp) {
  const bits = [];
  if (!sp) return '';
  if (sp.attack) bits.push(cap(sp.attack) + ' attack');
  if (sp.save) bits.push((ABILITY_ABBR[sp.save.ability] || cap(sp.save.ability)) + ' save' + (sp.save.onSuccess === 'half' ? ' (half)' : ''));
  if (sp.damage) bits.push(sp.damage.dice + ' ' + sp.damage.type);
  if (sp.heal) bits.push('heal ' + sp.heal.dice);
  return bits.join(' · ');
}

/** Roll a class's starting gold. Handles "5d4*10" and a fixed fallback. */
function rollStartingGold(cls, r) {
  const expr = String(obj(cls).startingGold || '');
  const m = expr.match(/^\s*(\d+)d(\d+)\s*(?:\*\s*(\d+))?\s*$/);
  if (m) {
    const n = Number(m[1]), sides = Number(m[2]), mult = Number(m[3] || 1);
    let total = 0;
    for (let i = 0; i < n; i++) total += safe(() => r.int(1, sides), Math.ceil(sides / 2));
    return total * mult;
  }
  return Number(obj(cls).startingGoldFixed) || 50;
}

/** 4d6-drop-lowest. Returns { total, rolls:[4], dropIndex }. */
function roll4d6(r) {
  const rolls = [];
  for (let i = 0; i < 4; i++) rolls.push(safe(() => r.int(1, 6), 3));
  let lo = 0;
  for (let i = 1; i < 4; i++) if (rolls[i] < rolls[lo]) lo = i;
  let total = 0;
  for (let i = 0; i < 4; i++) if (i !== lo) total += rolls[i];
  return { total, rolls, dropIndex: lo };
}

/** Generate a name, preferring data/tables.js and falling back to the bible. */
function rollName(speciesId, r, opts) {
  const o = obj(opts);
  if (TABLES && typeof TABLES.generateName === 'function') {
    const n = safe(() => TABLES.generateName(speciesId, r, o), '');
    if (n && typeof n === 'string') return n.slice(0, 20);
  }
  const t = FALLBACK_NAMES[speciesId] || FALLBACK_NAMES.human;
  const sex = o.body === 'f' ? 'f' : o.body === 'm' ? 'm' : (safe(() => r.chance(0.5), true) ? 'm' : 'f');
  const first = safe(() => r.pick(t[sex]), '') || safe(() => r.pick(t.m), '') || 'Ander';
  const sur = arr(t.s).length && safe(() => r.chance(0.75), true) ? safe(() => r.pick(t.s), '') : '';
  return String(sur ? first + ' ' + sur : first).slice(0, 20);
}

/** Ethnic sub-tables available for a species, from tables.js when present. */
function ethnicitiesFor(speciesId) {
  const nt = TABLES ? safe(() => TABLES.NAME_TABLES, null) : null;
  const entry = nt && nt[speciesId];
  if (entry && typeof entry === 'object') {
    const keys = Object.keys(entry).filter((k) => entry[k] && typeof entry[k] === 'object' && (entry[k].male || entry[k].female || entry[k].m || entry[k].f));
    if (keys.length > 1) return keys;
  }
  return speciesId === 'human' || speciesId === 'half-elf' ? HUMAN_ETHNICITIES : [];
}

/** The three abilities a background boosts, defensively. */
function bgAbilities(bg) { return arr(obj(bg).asi).filter((a) => ABILITIES.includes(a)); }

/** Species + lineage traits at or below a level. */
function traitsOf(speciesId, lineageId, level) {
  const sp = getSpecies(speciesId);
  const out = arr(obj(sp).traits).slice();
  const lin = getLineage(speciesId, lineageId);
  if (lin) for (const t of arr(lin.traits)) out.push(t);
  return out.filter((t) => t && (t.level || 1) <= (level || 20));
}

/** Colour palettes for the appearance step: species first, then the generics. */
function palettesFor(speciesId, lineageId) {
  const base = obj(safe(() => colorwaysFor(speciesId, lineageId), null))
    || obj(obj(getSpecies(speciesId)).colorways);
  const g = obj(GENERIC_PALETTES);
  return {
    skin: uniq([...arr(base.skin), ...arr(g.skin)]),
    hair: uniq([...arr(base.hair), ...arr(g.hair)]),
    eye: uniq([...arr(base.eye), ...arr(g.eye)]),
    horn: uniq([...arr(base.horn), ...HORN_PALETTE]),
  };
}

/**
 * Where `value` sits in a cycler's pool.
 *
 * `indexOf` alone falls back to 0 whenever the current value is not literally in
 * the pool, which silently mislabels the row AND makes the first press jump to
 * pool[1] rather than step from where the character actually is. A numeric pool
 * therefore matches on the nearest entry instead — that covers a species height
 * the pool was never built around, and a character saved under an older pool.
 */
function poolIndex(pool, value) {
  const i = pool.indexOf(value);
  if (i >= 0) return i;
  if (typeof value === 'number' && Number.isFinite(value)) {
    let best = -1;
    let bestD = Infinity;
    for (let k = 0; k < pool.length; k++) {
      const p = pool[k];
      if (typeof p !== 'number') continue;
      const d = Math.abs(p - value);
      if (d < bestD) { bestD = d; best = k; }
    }
    if (best >= 0) return best;
  }
  return 0;
}

function modsFor(speciesId, lineageId) {
  const m = safe(() => spriteModsFor(speciesId, lineageId), null);
  if (m && typeof m === 'object') return m;
  return obj(obj(getSpecies(speciesId)).spriteMods);
}

/** Bond lines offered by a background (data first, hand-written fallback second). */
function bondsFor(bgId) {
  const bg = getBackground(bgId);
  const fromData = arr(obj(bg).bonds).length ? arr(obj(bg).bonds)
    : arr(obj(bg).personality).length ? arr(obj(bg).personality) : null;
  if (fromData && fromData.length) return fromData.map(String);
  return BOND_LINES[bgId] || GENERIC_BONDS;
}

// ===========================================================================
// 7. THE SCENE
// ===========================================================================

export class CharCreateScene {
  /**
   * @param {(ch:object|null)=>void} onDone receives the finished Character, or null on cancel.
   * @param {{mode?:'new-hero'|'recruit'|'level-up-companion', preset?:object, level?:number}} opts
   */
  constructor(onDone, opts = {}) {
    this.onDone = typeof onDone === 'function' ? onDone : () => {};
    this.opts = obj(opts);
    this.mode = this.opts.mode || 'new-hero';
    this.opaque = true;
    this.pausesBelow = true;
    this.uiLayer = true;
    this.id = 'charcreate';

    this.t = 0;
    this.step = 0;
    this.previewMode = 'portrait';
    this.previewDir = 0;
    this.previewWalk = false;
    this.sub = 0;                 // species step: 0 = species, 1 = lineage
    this.bucket = 0;              // sub-section within a step (tab1..tab5)
    this.cursors = {};            // rowKey -> cursor index
    this.tops = {};               // rowKey -> list scroll top
    this.docScroll = {};          // rowKey -> detail pane scroll
    this.picker = null;           // modal option picker
    this.message = '';
    this.messageT = 0;
    this.messageBad = false;

    // Feedback for a refused action: which widget to rattle, and for how long.
    // Nothing in this wizard fails silently — every dead end says so and points
    // at the step that owes a choice.
    this.shakeT = 0;
    this.shakeWhat = '';          // 'next' | 'tabs' | 'row'
    this.blameStep = -1;          // step the current complaint is about
    this.blameT = 0;

    // Choices parked when you switch species/class/subclass/background, so
    // browsing the catalogue never destroys work. See the setters.
    this._stash = {};

    this._hot = [];               // hit rects registered during draw
    this._version = 0;            // bumped on every draft change
    this._builtVersion = -1;
    this._rows = [];
    this._rowsKey = '';
    this.preview = null;
    this.rng = safe(() => makeRNG('charcreate-' + Date.now()), rng);

    this.lockSpecies = false;
    this.lockClass = false;

    this.draft = this._newDraft();
    this._applyPreset(this.opts.preset);
    this._touch();
  }

  // -------------------------------------------------------------------------
  // DRAFT
  // -------------------------------------------------------------------------

  _newDraft() {
    const sp = allSpecies();
    const cls = classIds();
    const bgs = backgroundIds();
    const level = clamp(Number(this.opts.level) || Number(obj(this.opts.preset).level) || 1, 1, 20);
    const d = {
      level,
      speciesId: (sp[0] && sp[0].id) || 'human',
      lineageId: null,
      classId: cls[0] || 'fighter',
      subclassId: null,
      backgroundId: bgs[0] || 'acolyte',
      bgMode: '2-1',              // '2-1' | '1-1-1'
      bgPlus2: null,              // ability id that gets the +2
      bgPlus1: null,              // ability id that gets the +1
      bgAsiManual: false,         // true once the player has set the spread themselves
      method: 'array',            // 'array' | 'pointbuy' | 'roll'
      array: STANDARD_ARRAY.slice(),
      arrayAssign: {},            // ability -> index into `array`
      pointBuy: {},
      rolled: null,               // [{total, rolls, dropIndex}] x6
      rollAssign: {},             // ability -> index into `rolled`
      skills: [],
      picks: {},                  // bucketKey -> [optionId]
      kitId: null,
      takeGold: false,
      goldRolled: 0,
      appearance: null,
      name: '',
      ethnicity: null,
      alignment: 'ng',
      deity: null,
      bond: 0,
    };
    for (const ab of ABILITIES) d.pointBuy[ab] = 8;
    this._defaultArrayAssign(d);
    return d;
  }

  _applyPreset(preset) {
    const p = obj(preset);
    const d = this.draft;
    if (p.level) d.level = clamp(p.level, 1, 20);
    if (p.speciesId && getSpecies(p.speciesId)) d.speciesId = p.speciesId;
    if (p.lineageId) d.lineageId = p.lineageId;
    if (p.classId && getClass(p.classId)) d.classId = p.classId;
    if (p.subclassId) d.subclassId = p.subclassId;
    const bg = p.backgroundId || p.background;
    if (bg && getBackground(bg)) d.backgroundId = bg;
    if (p.name) d.name = String(p.name).slice(0, 20);
    if (p.appearance) d.appearance = Object.assign({}, p.appearance);
    if (p.abilities) {
      const src = obj(p.abilities.base || p.abilities);
      d.method = 'pointbuy';
      for (const ab of ABILITIES) {
        const v = Number(src[ab]);
        if (Number.isFinite(v)) d.pointBuy[ab] = clamp(v, 3, 20);
      }
    }
    if (Array.isArray(p.skills)) d.skills = p.skills.slice();
    if (p.deity) d.deity = p.deity;
    if (p.alignment) d.alignment = p.alignment;

    this.lockSpecies = this.mode === 'level-up-companion';
    this.lockClass = this.mode === 'level-up-companion';

    if (!speciesHasLineages(d.speciesId)) d.lineageId = null;
    else if (!getLineage(d.speciesId, d.lineageId)) d.lineageId = null;

    this._defaultBackgroundAsi();
    if (!d.appearance) this._randomiseLook(false);
    const kits = this.kits();
    if (!d.kitId && kits.length) d.kitId = kits[0].id;
    d.goldRolled = rollStartingGold(getClass(d.classId), this.rng);
    if (this.mode === 'level-up-companion') this.step = STEP_INDEX.subclass;
  }

  /** Mark the draft changed: the preview character rebuilds next frame. */
  _touch() {
    const picks = this.draft?.picks;
    if (picks && Array.isArray(picks.wizardPrepared)) {
      picks.wizardPrepared = picks.wizardPrepared.filter(id => (picks.spellbook || []).includes(id));
    }
    this._version++;
  }

  // -------------------------------------------------------------------------
  // SCENE HOOKS
  // -------------------------------------------------------------------------

  enter() { safe(() => Input.flush()); this._touch(); }

  exit() { safe(() => { if (Input.capturingText) Input.stopText(); }); }

  update(dt) {
    this.t += (dt || 0);
    if (this.messageT > 0) this.messageT -= (dt || 0);
    if (this.shakeT > 0) this.shakeT -= (dt || 0);
    if (this.blameT > 0) { this.blameT -= (dt || 0); if (this.blameT <= 0) this.blameStep = -1; }

    this._handleMouse();

    if (this.picker) { this._updatePicker(); this._ensure(); return; }
    if (safe(() => Input.capturingText, false)) { this._ensure(); return; }

    this._handleKeys();
    this._ensure();
  }

  /** Rebuild the preview Character and the row list if anything changed. */
  _ensure() {
    if (this._builtVersion !== this._version) {
      this._builtVersion = this._version;
      const built = safe(() => createCharacter(this.buildOpts(true)), null);
      if (built) {
        if (this.draft.classId === 'wizard') built.spells.prepared = arr(this.draft.picks.wizardPrepared)
          .filter(id => arr(this.draft.picks.spellbook).includes(id)).slice(0, preparedMax(built));
        this.preview = built;
      }
      this._rowsKey = '';                        // force a row rebuild too
    }
    const key = this.step + ':' + this.sub + ':' + this.bucket + ':' + this._version;
    if (this._rowsKey !== key) {
      this._rowsKey = key;
      this._rows = safe(() => this.buildRows(), []) || [];
      const rk = this.rowKey();
      const c = this.cursors[rk];
      this.cursors[rk] = this._clampCursor(c == null ? this._firstSelectable() : c);
    }
  }

  rowKey() { return STEPS[this.step].id + ':' + this.sub + ':' + this.bucket; }
  get cursor() { const v = this.cursors[this.rowKey()]; return v == null ? 0 : v; }
  set cursor(v) { this.cursors[this.rowKey()] = v; }
  get rows() { return this._rows; }
  currentRow() { return this._rows[this.cursor] || null; }

  _firstSelectable() {
    // Open on the choice already in the draft, so a preset (a recruit, a reroll,
    // or simply coming back to a step) lands on what is selected rather than on
    // the top of the catalogue.
    for (let i = 0; i < this._rows.length; i++) {
      if (!this._rows[i].header && this._rows[i].selected) return i;
    }
    for (let i = 0; i < this._rows.length; i++) if (!this._rows[i].header) return i;
    return 0;
  }
  _clampCursor(i) {
    const n = this._rows.length;
    if (!n) return 0;
    let c = clamp(i | 0, 0, n - 1);
    if (this._rows[c] && this._rows[c].header) {
      for (let k = c; k < n; k++) if (!this._rows[k].header) return k;
      for (let k = c; k >= 0; k--) if (!this._rows[k].header) return k;
    }
    return c;
  }

  // -------------------------------------------------------------------------
  // INPUT
  // -------------------------------------------------------------------------

  _handleKeys() {
    if (Input.down('run')) {
      const direction = Input.consume('next') ? 1 : Input.consume('prev') ? -1 : 0;
      if (direction) {
        const current = CHAPTERS.findIndex(c => c.steps.includes(this.step));
        const chapter = CHAPTERS[(current + direction + CHAPTERS.length) % CHAPTERS.length];
        this.gotoStep(chapter.steps.find(i => this.stepEnabled(i)));
        return;
      }
    }
    if (Input.consume('inventory')) { this.previewMode = this.previewMode === 'portrait' ? 'sheet' : 'portrait'; return; }
    if (Input.consume('journal')) { this.rotatePreview(-1); return; }
    if (Input.consume('spells')) { this.rotatePreview(1); return; }
    if (Input.consume('map')) { this.previewWalk = !this.previewWalk; return; }
    // --- step navigation ---------------------------------------------------
    if (safe(() => Input.consume('next'), false)) { this.goNext(); return; }
    if (safe(() => Input.consume('prev'), false)) { this.goPrev(); return; }
    if (safe(() => Input.consume('cancel'), false)) { this.goBackOut(); return; }
    if (safe(() => Input.consume('menu'), false)) { this.goBackOut(); return; }
    // E — "take me to whatever is still missing".
    if (safe(() => Input.consume('interact'), false)) { this.gotoIssue(); return; }

    // --- sub-section tabs --------------------------------------------------
    // Tab walks EVERY sub-section (Shift+Tab backwards) so the warlock's ninth
    // invocation slot is reachable; 1..5 jump to the five currently on strip.
    if (safe(() => Input.consume('party'), false)) {
      this.cycleBucket(safe(() => Input.down('run'), false) ? -1 : 1);
      return;
    }
    const first = this.bucketTop();
    for (let i = 0; i < BUCKET_SLOTS; i++) {
      if (safe(() => Input.consume('tab' + (i + 1)), false)) { this.setBucket(first + i); return; }
    }

    // --- row cursor --------------------------------------------------------
    const rep = (a) => safe(() => Input.repeatConsume(a, 0.32, 0.07), false);
    if (rep('down')) { this.moveCursor(1); return; }
    if (rep('up')) { this.moveCursor(-1); return; }

    const row = this.currentRow();

    // --- left / right: adjust a cycler, otherwise scroll the detail pane ----
    const hasAdjust = !!(row && (row.onLeft || row.onRight));
    if (rep('right')) {
      if (hasAdjust) { sfx('cursor'); safe(() => row.onRight()); }
      else this.scrollDoc(9);
      return;
    }
    if (rep('left')) {
      if (hasAdjust) { sfx('cursor'); safe(() => row.onLeft()); }
      else this.scrollDoc(-9);
      return;
    }

    // --- confirm -----------------------------------------------------------
    if (safe(() => Input.consume('confirm'), false)) {
      if (row && row.disabled) {
        this.warn(row.lockedWhy || 'That choice is not open to you.', 'row');
        return;
      }
      if (row && row.onConfirm) { safe(() => row.onConfirm()); return; }
      if (row && row.onRight) { sfx('cursor'); safe(() => row.onRight()); return; }
      // Nothing to activate on this row, so Enter means the same thing the NEXT
      // button means. It never silently re-applies a choice you already made.
      this.goNext();
    }
  }

  /** Click/confirm on a row, honouring `disabled` so nothing fails silently. */
  activateRow(row) {
    if (!row || row.header) return;
    if (row.disabled) { this.warn(row.lockedWhy || 'That choice is not open to you.', 'row'); return; }
    if (row.onConfirm) { safe(() => row.onConfirm()); return; }
    if (row.onRight) { sfx('cursor'); safe(() => row.onRight()); }
  }

  moveCursor(dir) {
    const n = this._rows.length;
    if (!n) return;
    let c = this.cursor;
    for (let k = 0; k < n; k++) {
      c += dir;
      if (c < 0) c = 0;
      if (c > n - 1) c = n - 1;
      if (!this._rows[c].header) break;
      if ((dir < 0 && c === 0) || (dir > 0 && c === n - 1)) break;
    }
    if (c === this.cursor) return;
    this.cursor = c;
    sfx('cursor');
    const row = this._rows[c];
    // Single-choice catalogues preview live as the cursor moves. This is only
    // safe because the setters stash whatever the switch displaces (see below):
    // browsing the list must never cost you a choice you already made.
    if (row && row.onFocus && !row.disabled) safe(() => row.onFocus());
    this.docScroll[this.rowKey()] = 0;
  }

  scrollDoc(dy) {
    const k = this.rowKey();
    const cur = this.docScroll[k] || 0;
    const maxS = Math.max(0, (this._docHeight || 0) - (this._docView || 1));
    const next = clamp(cur + dy, 0, maxS);
    if (next !== cur) { this.docScroll[k] = next; sfx('cursor'); }
  }

  _handleMouse() {
    const m = safe(() => Input.mouse, null);
    if (!m) { this._hot = []; return; }
    const hot = this._hot;
    if (m.wheel) {
      // wheel over the detail pane scrolls it; elsewhere it moves the cursor
      if (m.x >= MP_X && m.x < MP_X + MP_W) this.scrollDoc(m.wheel > 0 ? 12 : -12);
      else this.moveCursor(m.wheel > 0 ? 1 : -1);
    }
    if (!m.clicked) return;
    for (let i = hot.length - 1; i >= 0; i--) {
      const r = hot[i];
      if (m.x >= r.x && m.x < r.x + r.w && m.y >= r.y && m.y < r.y + r.h) {
        safe(() => r.fn());
        return;
      }
    }
  }

  /** Register a clickable rect. Called from draw; consumed by the next update. */
  hit(x, y, w, h, fn) { this._hot.push({ x, y, w, h, fn }); }

  // -------------------------------------------------------------------------
  // STEP NAVIGATION
  // -------------------------------------------------------------------------

  stepEnabled(i) {
    const id = STEPS[i] && STEPS[i].id;
    if (id === 'spells') return this.spellBuckets().length > 0;
    if (id === 'features') return this.featureBuckets().length > 0;
    return true;
  }

  goNext() {
    // The species step has an inner lineage page.
    if (STEPS[this.step].id === 'species' && this.sub === 0 && speciesHasLineages(this.draft.speciesId)) {
      this.sub = 1; sfx('select'); return;
    }
    const why = this.issue(this.step);
    if (why) { this.focusIssueBucket(this.step); this.warn(why, 'next', this.step); return; }
    if (STEPS[this.step].id === 'summary') { this.finish(); return; }
    let i = this.step + 1;
    while (i < STEPS.length && !this.stepEnabled(i)) i++;
    if (i >= STEPS.length) { this.finish(); return; }
    this.gotoStep(i);
    sfx('select');
  }

  goPrev() {
    if (STEPS[this.step].id === 'species' && this.sub === 1) { this.sub = 0; sfx('back'); return; }
    let i = this.step - 1;
    while (i >= 0 && !this.stepEnabled(i)) i--;
    if (i < 0) return;
    this.gotoStep(i);
    if (STEPS[i].id === 'species' && speciesHasLineages(this.draft.speciesId)) this.sub = 1;
    sfx('back');
  }

  /** Cancel/Escape: leave the lineage page, step back, or abandon creation. */
  goBackOut() {
    if (STEPS[this.step].id === 'species' && this.sub === 1) { this.sub = 0; sfx('back'); return; }
    if (this.step > 0) { this.goPrev(); return; }
    this.cancelOut();
  }

  gotoStep(i) {
    if (i === this.step) return;
    // Browsing is free; goNext and finish still validate actual creation.
    if (!this.stepEnabled(i)) { this.warn(this.lockedReason(i), 'tabs'); return; }
    this.step = clamp(i, 0, STEPS.length - 1);
    this.sub = 0;
    this.bucket = 0;
    this._rowsKey = '';
    if (STEPS[this.step].id === 'equipment' && !this.draft.goldRolled) {
      this.draft.goldRolled = rollStartingGold(getClass(this.draft.classId), this.rng);
    }
  }

  /**
   * Refuse something out loud. `what` names the widget to rattle ('next',
   * 'tabs', 'row') and `blame` the step that is actually at fault, which the tab
   * strip then pulses red. A silent no is the one thing this screen must never do.
   */
  warn(msg, what = 'next', blame = -1) {
    this.message = String(msg);
    this.messageT = 3.2;
    this.messageBad = true;
    this.shakeT = 0.42;
    this.shakeWhat = what;
    if (blame >= 0) { this.blameStep = blame; this.blameT = 3.2; }
    sfx('error');
  }

  note(msg) { this.message = String(msg); this.messageT = 2.2; this.messageBad = false; }

  /** Horizontal wobble in pixels for `what`, zero when nothing is complaining. */
  shakeX(what) {
    if (this.shakeT <= 0 || this.shakeWhat !== what) return 0;
    return Math.round(Math.sin(this.shakeT * 52) * this.shakeT * 7);
  }

  /** Why step `i` cannot be opened at all, in words. */
  lockedReason(i) {
    const id = STEPS[i] && STEPS[i].id;
    const cls = obj(getClass(this.draft.classId)).name || 'This class';
    if (id === 'spells') return cls + ' has no spells to choose at level ' + this.draft.level + '.';
    if (id === 'features') return cls + ' has no further choices at level ' + this.draft.level + '.';
    return 'That step is not available.';
  }

  /** The first step still owing a choice, or -1 when the sheet is finished. */
  firstIncomplete() {
    for (let i = 0; i < STEPS.length; i++) {
      if (!this.stepEnabled(i)) continue;
      if (this.issue(i)) return i;
    }
    return -1;
  }

  /** Jump straight to whatever is still missing (the 'E' key and the footer chip). */
  gotoIssue() {
    const i = this.firstIncomplete();
    if (i < 0) {
      this.note(STEPS[this.step].id === 'summary' ? 'Everything is in order — press Create.' : 'Nothing left to choose. Skip to the summary?');
      sfx('select');
      return;
    }
    if (i === this.step) {
      this.focusIssueBucket(i);
      this.warn(this.issue(i) || 'Something is missing here.', 'row', i);
      return;
    }
    this.step = clamp(i, 0, STEPS.length - 1);
    this.sub = 0;
    this.bucket = 0;
    this._rowsKey = '';
    this.focusIssueBucket(i);
    this.note(STEPS[i].title + ': ' + this.issue(i));
    sfx('select');
  }

  finish() {
    for (let i = 0; i < STEPS.length; i++) {
      if (!this.stepEnabled(i)) continue;
      const why = this.issue(i);
      if (why) {
        this.gotoStep(i);
        this.focusIssueBucket(i);
        this.warn(STEPS[i].title + ': ' + why, 'tabs', i);
        return;
      }
    }
    const ch = this.buildFinal();
    if (!ch) { this.warn('Something is missing — check the summary.', 'next'); return; }
    sfx('levelup');
    this.onDone(ch);
    if (Game.top === this) safe(() => Game.pop());
  }

  cancelOut() {
    sfx('back');
    this.onDone(null);
    if (Game.top === this) safe(() => Game.pop());
  }

  // =========================================================================
  // DRAFT MUTATORS
  // =========================================================================

  // --- the stash -----------------------------------------------------------
  //
  // Every one of the four setters below has to throw work away: a fighter's
  // skills mean nothing to a wizard, and a dragonborn's horn colour is not a
  // halfling's. That is correct — but the row lists call these on FOCUS so the
  // preview panel stays live as you arrow through the catalogue, which used to
  // mean that merely *reading* about Rogue silently deleted the spells, kit and
  // skills you had already chosen as a Wizard. Ten minutes of work, gone, and no
  // warning until the wizard bounced you back four pages.
  //
  // So nothing is thrown away any more: it is stashed under the choice that
  // owned it, and handed straight back if you return. Browsing is free, and
  // switching for real still gives you a clean slate.

  /** Deep-ish copy of the pick map ({ bucketKey: [optionId] }). */
  _copyPicks(src) {
    const out = {};
    for (const k in obj(src)) out[k] = arr(obj(src)[k]).slice();
    return out;
  }

  /**
   * Every pick-bucket key that is legal for the draft as it stands.
   *
   * `d.picks` is one flat map shared by four owners: class spells, class and
   * subclass feature choices, species trait choices, and the background's
   * origin feat. They are told apart by which buckets currently exist, not by
   * their key, so this is the only honest way to ask "does this pick still
   * belong to anything".
   */
  _validPickKeys() {
    const out = new Set();
    for (const b of safe(() => this.spellBuckets(), []) || []) if (b && b.key) out.add(b.key);
    for (const b of safe(() => this.featureBuckets(), []) || []) if (b && b.key) out.add(b.key);
    for (const b of safe(() => this.skillBuckets(), []) || []) if (b && b.key) out.add(b.key);
    return out;
  }

  /**
   * Drop the picks that no longer have a bucket, and keep every one that does.
   *
   * This replaces wiping `d.picks` wholesale on a class switch. Wiping was
   * over-broad in both directions: it threw away the species trait and origin
   * feat choices the class had nothing to do with, and restoring a stash put
   * a stale copy of those same choices back over whatever the player had since
   * chosen. Pruning is exactly right — a wizard's cantrips lose their bucket
   * the moment you become a fighter, and a tiefling's legacy does not.
   */
  _prunePicks() {
    const ok = this._validPickKeys();
    const d = this.draft;
    for (const k of Object.keys(obj(d.picks))) if (!ok.has(k)) delete d.picks[k];
  }

  /** Layer a stash back on, never clobbering a pick another owner holds now. */
  _restorePicks(saved) {
    const d = this.draft;
    if (!d.picks) d.picks = {};
    for (const [k, v] of Object.entries(obj(saved))) {
      if (k in d.picks) continue;
      d.picks[k] = arr(v).slice();
    }
  }

  _stashOf(kind) {
    if (!this._stash) this._stash = {};
    if (!this._stash[kind]) this._stash[kind] = {};
    return this._stash[kind];
  }

  /** Everything a class switch would destroy. */
  _saveClassState(classId) {
    const d = this.draft;
    if (!classId) return;
    this._stashOf('class')[classId] = {
      subclassId: d.subclassId, skills: arr(d.skills).slice(), picks: this._copyPicks(d.picks),
      kitId: d.kitId, takeGold: !!d.takeGold, goldRolled: d.goldRolled,
    };
  }

  /** Everything a subclass switch would destroy. `-` stands for "none yet". */
  _saveSubclassState(classId, subclassId) {
    if (!classId) return;
    this._stashOf('sub')[classId + '/' + (subclassId || '-')] = { picks: this._copyPicks(this.draft.picks) };
  }

  /** The look, which a species or lineage swap snaps back into legal range. */
  _saveLookState(speciesId, lineageId) {
    if (!speciesId) return;
    this._stashOf('look')[speciesId + '/' + (lineageId || '-')] = {
      lineageId: lineageId || null,
      appearance: Object.assign({}, obj(this.draft.appearance)),
    };
  }

  setSpecies(id) {
    const d = this.draft;
    if (this.lockSpecies || d.speciesId === id) return;
    this._saveLookState(d.speciesId, d.lineageId);
    this._stashOf('species')[d.speciesId] = { lineageId: d.lineageId };
    d.speciesId = id;
    const back = this._stashOf('species')[id];
    d.lineageId = back && getLineage(id, back.lineageId) ? back.lineageId : null;
    const look = this._stashOf('look')[id + '/' + (d.lineageId || '-')];
    if (look) d.appearance = Object.assign({}, look.appearance);
    this._reskin();
    this._prunePicks();                    // a dwarf has no elf trait choices
    this._touch();
  }

  setLineage(id) {
    const d = this.draft;
    if (d.lineageId === id) return;
    this._saveLookState(d.speciesId, d.lineageId);
    d.lineageId = id;
    this._stashOf('species')[d.speciesId] = { lineageId: id };
    const look = this._stashOf('look')[d.speciesId + '/' + (id || '-')];
    if (look) d.appearance = Object.assign({}, look.appearance);
    this._reskin();
    this._prunePicks();
    this._touch();
  }

  setClass(id) {
    const d = this.draft;
    if (this.lockClass || d.classId === id) return;
    this._saveSubclassState(d.classId, d.subclassId);
    this._saveClassState(d.classId);
    d.classId = id;

    const back = this._stashOf('class')[id];
    if (back) {
      d.subclassId = back.subclassId;
      d.skills = arr(back.skills).slice();
      d.kitId = back.kitId;
      d.takeGold = !!back.takeGold;
      d.goldRolled = back.goldRolled || rollStartingGold(getClass(id), this.rng);
      this._prunePicks();                 // the old class's picks lose their buckets
      this._restorePicks(back.picks);     // …and this class's come back
    } else {
      d.subclassId = null;
      d.skills = [];
      d.kitId = null;
      d.takeGold = false;
      const kits = this.kits();
      if (kits.length) d.kitId = kits[0].id;
      d.goldRolled = rollStartingGold(getClass(id), this.rng);
      this._prunePicks();
    }
    // Only re-derive the background bonus if the player has not set it by hand.
    // Browsing the class list used to silently undo a deliberate +2 CON.
    if (!d.bgAsiManual) this._defaultBackgroundAsi();
    this._touch();
  }

  setSubclass(id) {
    const d = this.draft;
    if (d.subclassId === id) return;
    // Stash under the outgoing subclass even when there is not one yet: a
    // level-1 character walks past a preview-only subclass step with picks
    // already made, and those have to survive the first selection.
    this._saveSubclassState(d.classId, d.subclassId || '-');
    d.subclassId = id;
    const back = this._stashOf('sub')[d.classId + '/' + (id || '-')];
    this._prunePicks();
    if (back) this._restorePicks(back.picks);
    this._touch();
  }

  setBackground(id) {
    const d = this.draft;
    if (d.backgroundId === id) return;
    this._stashOf('bg')[d.backgroundId] = {
      bond: d.bond, bgMode: d.bgMode, bgPlus2: d.bgPlus2, bgPlus1: d.bgPlus1,
      manual: !!d.bgAsiManual,
    };
    d.backgroundId = id;
    const back = this._stashOf('bg')[id];
    if (back) {
      d.bond = back.bond || 0;
      d.bgMode = back.bgMode || '2-1';
      d.bgPlus2 = back.bgPlus2 || null;
      d.bgPlus1 = back.bgPlus1 || null;
      d.bgAsiManual = !!back.manual;
      if (!d.bgPlus2) this._defaultBackgroundAsi();
    } else {
      d.bond = 0;
      d.bgAsiManual = false;               // a new background gets a fresh default
      this._defaultBackgroundAsi();
    }
    // A different background offers different abilities; the origin feat's own
    // choice buckets change with it, so anything orphaned goes.
    this._prunePicks();
    this._touch();
  }

  /** Snap the species-tinted colours back into legal range after a species swap. */
  _reskin() {
    const d = this.draft;
    const pal = palettesFor(d.speciesId, d.lineageId);
    const mods = modsFor(d.speciesId, d.lineageId);
    const a = obj(d.appearance);
    const snap = (key, list) => { if (!list.length) return; if (list.indexOf(a[key]) < 0) a[key] = list[0]; };
    snap('skin', pal.skin);
    snap('hair', pal.hair);
    snap('eye', pal.eye);
    snap('hornColor', pal.horn);
    a.ears = mods.ears && mods.ears !== 'round' ? mods.ears : null;
    if (!mods.horns) a.horns = null;
    else if (!a.horns) a.horns = 'curved';
    if (!mods.tail) a.tail = null;
    else if (!a.tail) a.tail = 'thin';
    if (mods.beard === 'none') a.beard = 'none';
    if (mods.build && a.build == null) a.build = mods.build;
    a.height = mods.height || a.height || 1;
    d.appearance = a;
  }

  // --- background ability increase -----------------------------------------

  _defaultBackgroundAsi() {
    const d = this.draft;
    const list = bgAbilities(getBackground(d.backgroundId));
    if (!list.length) { d.bgPlus2 = null; d.bgPlus1 = null; return; }
    const priority = CLASS_PRIORITY[d.classId] || ABILITIES;
    const ordered = list.slice().sort((a, b) => priority.indexOf(a) - priority.indexOf(b));
    d.bgPlus2 = ordered[0] || null;
    d.bgPlus1 = ordered[1] || ordered[0] || null;
  }

  /** The {str:2, dex:1} object handed to createCharacter. */
  backgroundAsi() {
    const d = this.draft;
    const list = bgAbilities(getBackground(d.backgroundId));
    if (!list.length) return null;
    if (d.bgMode === '1-1-1') {
      const o = {};
      for (const ab of list.slice(0, 3)) o[ab] = 1;
      return o;
    }
    const o = {};
    if (d.bgPlus2 && list.includes(d.bgPlus2)) o[d.bgPlus2] = 2;
    if (d.bgPlus1 && list.includes(d.bgPlus1) && d.bgPlus1 !== d.bgPlus2) o[d.bgPlus1] = 1;
    return Object.keys(o).length ? o : null;
  }

  bgBonusFor(ab) { const o = obj(this.backgroundAsi()); return Number(o[ab]) || 0; }

  // --- ability score generation -------------------------------------------

  _defaultArrayAssign(d) {
    const target = d || this.draft;
    const assigned = autoAssign(target.array, target.classId);
    const pool = target.array.slice();
    const used = [];
    target.arrayAssign = {};
    for (const ab of ABILITIES) {
      const want = assigned[ab];
      let idx = -1;
      for (let i = 0; i < pool.length; i++) { if (pool[i] === want && used.indexOf(i) < 0) { idx = i; break; } }
      if (idx < 0) for (let i = 0; i < pool.length; i++) if (used.indexOf(i) < 0) { idx = i; break; }
      if (idx >= 0) { target.arrayAssign[ab] = idx; used.push(idx); }
    }
  }

  /** The value pool for the current generation method. */
  valuePool() {
    const d = this.draft;
    if (d.method === 'roll') return arr(d.rolled).map((r) => r.total);
    return d.array;
  }
  assignMap() {
    const d = this.draft;
    return d.method === 'roll' ? d.rollAssign : d.arrayAssign;
  }

  /** Base (pre-background) score for an ability under the current method. */
  baseScore(ab) {
    const d = this.draft;
    if (d.method === 'pointbuy') return clamp(Number(d.pointBuy[ab]) || 8, POINT_BUY_MIN, POINT_BUY_MAX);
    const pool = this.valuePool();
    const idx = this.assignMap()[ab];
    const v = idx == null ? null : pool[idx];
    return Number.isFinite(v) ? v : 10;
  }
  finalScore(ab) { return this.baseScore(ab) + this.bgBonusFor(ab); }

  baseScores() {
    const o = {};
    for (const ab of ABILITIES) o[ab] = this.baseScore(ab);
    return o;
  }

  setMethod(m) {
    const d = this.draft;
    if (d.method === m) return;
    d.method = m;
    if (m === 'roll' && !d.rolled) this.rerollScores();
    if (m === 'array') this._defaultArrayAssign(d);
    this.bucket = m === 'array' ? 0 : m === 'pointbuy' ? 1 : 2;
    this._touch();
  }

  rerollScores() {
    const d = this.draft;
    d.rolled = [];
    for (let i = 0; i < 6; i++) d.rolled.push(roll4d6(this.rng));
    d.rolled.sort((a, b) => b.total - a.total);
    d.rollAssign = {};
    const order = CLASS_PRIORITY[d.classId] || ABILITIES;
    order.forEach((ab, i) => { if (i < 6) d.rollAssign[ab] = i; });
    sfx('dice');
    this._touch();
  }

  /** Cycle which pool value an ability holds, swapping with the previous owner. */
  cycleAssign(ab, dir) {
    const d = this.draft;
    const map = this.assignMap();
    const pool = this.valuePool();
    if (!pool.length) return;
    const cur = map[ab] == null ? -1 : map[ab];
    let next = cur + dir;
    if (next < 0) next = pool.length - 1;
    if (next >= pool.length) next = 0;
    const other = ABILITIES.find((a) => a !== ab && map[a] === next);
    if (other != null) map[other] = cur < 0 ? undefined : cur;
    map[ab] = next;
    this._touch();
  }

  adjustPointBuy(ab, dir) {
    const d = this.draft;
    const cur = Number(d.pointBuy[ab]) || 8;
    const want = cur + dir;
    if (want < POINT_BUY_MIN || want > POINT_BUY_MAX) { sfx('error'); return; }
    const probe = Object.assign({}, d.pointBuy);
    probe[ab] = want;
    if (safe(() => pointBuyRemaining(probe), 0) < 0) { sfx('error'); return; }
    d.pointBuy[ab] = want;
    this._touch();
  }

  pointsLeft() { return safe(() => pointBuyRemaining(this.draft.pointBuy), POINT_BUY_TOTAL); }

  autoAssignForClass() {
    const d = this.draft;
    if (d.method === 'pointbuy') {
      const spread = autoAssign([15, 14, 13, 12, 10, 8], d.classId);
      for (const ab of ABILITIES) d.pointBuy[ab] = clamp(spread[ab], POINT_BUY_MIN, POINT_BUY_MAX);
    } else if (d.method === 'roll') {
      const vals = arr(d.rolled).map((r) => r.total);
      const want = autoAssign(vals, d.classId);
      const used = [];
      d.rollAssign = {};
      for (const ab of ABILITIES) {
        let idx = -1;
        for (let i = 0; i < vals.length; i++) if (vals[i] === want[ab] && used.indexOf(i) < 0) { idx = i; break; }
        if (idx < 0) for (let i = 0; i < vals.length; i++) if (used.indexOf(i) < 0) { idx = i; break; }
        if (idx >= 0) { d.rollAssign[ab] = idx; used.push(idx); }
      }
    } else {
      this._defaultArrayAssign(d);
    }
    sfx('select');
    this.note('Assigned for ' + (obj(getClass(d.classId)).name || 'your class') + '.');
    this._touch();
  }

  // --- skills ---------------------------------------------------------------

  /** Skills already granted by species, lineage or background (id -> source). */
  grantedSkills() {
    const d = this.draft;
    const out = {};
    const sp = getSpecies(d.speciesId);
    for (const s of arr(obj(sp).skillGrants)) out[s] = obj(sp).name || 'Species';
    for (const t of traitsOf(d.speciesId, d.lineageId, d.level)) {
      for (const s of arr(obj(t.mech).skillProf)) out[s] = t.name || 'Species';
    }
    const bg = getBackground(d.backgroundId);
    for (const s of arr(obj(bg).skills)) out[s] = obj(bg).name || 'Background';
    return out;
  }

  classSkillChoice() {
    const cls = getClass(this.draft.classId);
    const sc = obj(obj(cls).skillChoices);
    const from = arr(sc.from).filter((s) => SKILLS[s]);
    return { count: Number(sc.count) || 0, from: from.length ? from : SKILL_IDS };
  }

  toggleSkill(id) {
    const d = this.draft;
    const granted = this.grantedSkills();
    if (granted[id]) { sfx('error'); this.warn(granted[id] + ' already grants ' + skillName(id) + '.'); return; }
    const { count } = this.classSkillChoice();
    const i = d.skills.indexOf(id);
    if (i >= 0) { d.skills.splice(i, 1); sfx('back'); }
    else if (d.skills.length >= count) { this.warn('Choose ' + count + ' — deselect one first.'); return; }
    else { d.skills.push(id); sfx('select'); }
    this._touch();
  }

  // --- generic multi-pick buckets ------------------------------------------

  picksOf(key) { const p = this.draft.picks[key]; return Array.isArray(p) ? p : (this.draft.picks[key] = []); }

  togglePick(bucket, id) {
    const list = this.picksOf(bucket.key);
    const i = list.indexOf(id);
    if (i >= 0) { list.splice(i, 1); sfx('back'); }
    else if (bucket.count === 1) { list.length = 0; list.push(id); sfx('select'); }
    else if (list.length >= bucket.count) { this.warn('Choose ' + bucket.count + ' — deselect one first.'); return; }
    else { list.push(id); sfx('select'); }
    this._touch();
  }

  /**
   * Per-version memo. The bucket lists are rebuilt from the catalogues and are
   * consulted many times a frame (tab strip, validation, rows, detail), so they
   * are cached until the draft changes.
   */
  _memo(key, fn) {
    if (!this._memoCache || this._memoVersion !== this._version) {
      this._memoCache = {};
      this._memoVersion = this._version;
    }
    if (!(key in this._memoCache)) this._memoCache[key] = safe(fn, []);
    return this._memoCache[key];
  }

  spellBuckets() { return this._memo('spells', () => this._calcSpellBuckets()); }
  featureBuckets() { return this._memo('features', () => this._calcFeatureBuckets()); }
  skillBuckets() { return this._memo('skills', () => this._calcSkillBuckets()); }

  /** Spell-selection buckets for the current class and level. */
  _calcSpellBuckets() {
    const d = this.draft;
    const cls = getClass(d.classId);
    const sc = castingOf(cls);
    const out = [];
    if (!cls) return out;
    const list = sc.list || d.classId;
    const abil = sc.ability || 'int';
    const abilMod = scoreMod(this.finalScore(abil));
    const maxLv = maxSpellLevel(cls, d.level);

    const nCantrips = cantripCount(cls, d.level);
    if (nCantrips > 0) {
      const ids = safe(() => spellsForList(list, 0, 0), []);
      if (ids.length) out.push({ key: 'cantrips', label: 'Cantrips', type: 'cantrip', count: nCantrips, options: ids });
    }

    if (d.classId === 'wizard') {
      const ids = safe(() => spellsForList(list, 1, 1), []);
      if (ids.length) out.push({ key: 'spellbook', label: 'Spellbook', type: 'spell', count: spellbookSize(d.level), options: ids, note: 'Your spellbook. Prepared spells are drawn from it.' });
      out.push({ key: 'wizardPrepared', label: 'Ready', type: 'spell', optional: true,
        count: preparedCount(cls, d.level, abilMod), options: arr(d.picks.spellbook),
        note: 'Optional: ready any book spells, or prepare later in Spells.' });
    } else if (sc.list || sc.ability) {
      const n = preparedCount(cls, d.level, abilMod);
      const ids = safe(() => spellsForList(list, maxLv, 1), []);
      if (n > 0 && ids.length) {
        out.push({
          key: 'spells', label: sc.type === 'known' ? 'Known' : 'Prepared', type: 'spell',
          count: n, options: ids,
          note: sc.type === 'known' ? 'Spells you know outright.' : 'Swap these after any Long Rest.',
        });
      }
    }

    if (d.classId === 'warlock') {
      out.push({ key: 'pact', label: 'Pact', type: 'pactBoon', count: 1, options: Object.keys(PACT_BOONS), note: 'The shape of your patron’s gift.' });
      const n = safe(() => invocationsKnownFor('warlock', d.level), 0) || (d.level >= 2 ? 2 : 1);
      if (n > 0) out.push({ key: 'invocations', label: 'Invoke', type: 'invocation', count: n, options: Object.keys(invocationTable()).filter((k) => !PACT_BOONS[k]) });
    }
    if (d.classId === 'sorcerer' && d.level >= 2) {
      const n = safe(() => metamagicKnownFor('sorcerer', d.level), 0) || 2;
      if (n > 0) out.push({ key: 'metamagic', label: 'Meta', type: 'metamagic', count: n, options: Object.keys(metamagicTable()) });
    }
    return out;
  }

  /** Every remaining level-1 choice: styles, masteries, expertise, feats, options. */
  _calcFeatureBuckets() {
    const d = this.draft;
    const cls = getClass(d.classId);
    const out = [];
    const seen = {};
    const skip = { subclass: 1, spell: 1, cantrip: 1, asi: 1 };
    // Whatever the Spells step already asks for — a warlock's invocations, a
    // sorcerer's metamagic — must not be asked for a second time here. Those
    // buckets carry the class's whole running total, not one level's worth.
    for (const b of this.spellBuckets()) skip[b.type] = 1;

    const addChoice = (owner, feat, choice) => {
      if (!choice || !choice.type) return;
      const type = String(choice.type);
      if (skip[type]) return;
      if (type === 'skill') return;                       // handled by the Skills step
      const key = 'f:' + (feat.id || owner) + ':' + type;
      if (seen[key]) return;
      seen[key] = 1;
      const info = { classId: d.classId, proficientSkills: this.proficientSkills(), spellIds: [] };
      const options = resolveChoiceOptions(type, choice.options || choice.from, info);
      if (!options.length) return;
      out.push({
        key, label: shortLabel(feat.name || cap(type)), title: feat.name || cap(type),
        desc: feat.desc || '', type, count: Number(choice.count) || 1, options,
      });
    };

    // class features up to the draft level
    const feats = obj(obj(cls).features);
    for (let lv = 1; lv <= d.level; lv++) {
      for (const f of arr(feats[lv])) {
        if (!f) continue;
        if (f.choice) addChoice(d.classId, f, f.choice);
        for (const c of arr(f.choices)) addChoice(d.classId, f, c);
      }
    }
    // weapon mastery, if the class has it but did not spell out a choice block
    const mCount = safe(() => masteryCountFor(d.classId, d.level), 0)
      || (Array.isArray(obj(cls).weaponMasteryCount) ? obj(cls).weaponMasteryCount[Math.min(d.level, 20)] : 0);
    if (mCount > 0 && !out.some((b) => b.type === 'mastery')) {
      const options = masteryWeapons(d.classId).map((id) => optionEntry('mastery', id));
      if (options.length) out.push({ key: 'f:mastery', label: 'Mastery', title: 'Weapon Mastery', desc: 'Weapons whose mastery property you can use. Swap them after a Long Rest.', type: 'mastery', count: mCount, options });
    }
    // subclass feature options (Wild Heart animals, Land circles, etc.)
    const sub = getSubclass(d.subclassId);
    if (sub) {
      const sf = obj(sub.features);
      for (let lv = 1; lv <= d.level; lv++) {
        for (const f of arr(sf[lv])) {
          if (!f) continue;
          if (f.choice) addChoice(sub.id, f, f.choice);
          for (const c of arr(f.choices)) addChoice(sub.id, f, c);
        }
      }
    }
    // species trait choices (elf lineage ability, human origin feat)
    for (const t of traitsOf(d.speciesId, d.lineageId, d.level)) {
      if (t.choice) addChoice('species', t, t.choice);
      for (const c of arr(t.choices)) addChoice('species', t, c);
    }
    // the background's origin feat, if the feat itself has options
    const bg = getBackground(d.backgroundId);
    const featId = obj(bg).originFeat;
    const feat = getFeat(featId);
    if (feat) {
      if (feat.choice) addChoice('origin', feat, feat.choice);
      for (const c of arr(feat.choices)) addChoice('origin', feat, c);
      // Magic Initiate: cantrips + a 1st-level spell off a named list.
      const mi = String(featId || '').match(/^magic-initiate-(\w+)$/);
      if (mi && !out.some((b) => b.key === 'f:magic-initiate')) {
        const l = mi[1];
        const cantrips = safe(() => spellsForList(l, 0, 0), []);
        const firsts = safe(() => spellsForList(l, 1, 1), []);
        if (cantrips.length) out.push({ key: 'f:mi-cantrips', label: 'MI Cant', title: feat.name + ' — Cantrips', desc: 'Two cantrips from the ' + cap(l) + ' list.', type: 'cantrip', count: 2, options: cantrips.map((id) => optionEntry('cantrip', id)) });
        if (firsts.length) out.push({ key: 'f:mi-spell', label: 'MI Spell', title: feat.name + ' — Spell', desc: 'One 1st-level ' + cap(l) + ' spell, castable once per Long Rest.', type: 'spell', count: 1, options: firsts.map((id) => optionEntry('spell', id)) });
      }
      // Skilled: three skills of your choice.
      if (String(featId) === 'skilled' && !out.some((b) => b.key === 'f:skilled')) {
        out.push({ key: 'f:skilled', label: 'Skilled', title: feat.name, desc: 'Three skill or tool proficiencies of your choice.', type: 'skill', count: 3, options: SKILL_IDS.map((id) => optionEntry('skill', id)) });
      }
    }
    // Two sub-tabs reading "Exper" tell the player nothing; number the repeats.
    const tally = {};
    for (const b of out) tally[b.label] = (tally[b.label] || 0) + 1;
    const nth = {};
    for (const b of out) {
      if (tally[b.label] < 2) continue;
      nth[b.label] = (nth[b.label] || 0) + 1;
      b.label = b.label.slice(0, 4) + nth[b.label];
    }
    return out;
  }

  /** Skills the character is (or would be) proficient in — for Expertise lists. */
  proficientSkills() {
    const ch = this.preview;
    if (ch && ch.skills) {
      const list = Object.keys(ch.skills).filter((k) => SKILLS[k]);
      if (list.length) return list;
    }
    return uniq([...Object.keys(this.grantedSkills()), ...this.draft.skills]);
  }

  // --- equipment ------------------------------------------------------------

  kits() { return arr(obj(getClass(this.draft.classId)).startingKits).filter(Boolean); }

  setKit(id) {
    const d = this.draft;
    if (d.kitId === id && !d.takeGold) return;
    d.kitId = id;
    d.takeGold = false;
    this._touch();
  }

  setTakeGold() {
    const d = this.draft;
    if (!d.goldRolled) d.goldRolled = rollStartingGold(getClass(d.classId), this.rng);
    if (d.takeGold) return;
    d.takeGold = true;
    this._touch();
  }

  rerollGold() {
    this.draft.goldRolled = rollStartingGold(getClass(this.draft.classId), this.rng);
    sfx('coin');
    this._touch();
  }

  // --- appearance -----------------------------------------------------------

  _randomiseLook(makeSound) {
    const d = this.draft;
    const sp = getSpecies(d.speciesId);
    const lin = getLineage(d.speciesId, d.lineageId);
    const src = lin && lin.colorways ? Object.assign({}, sp, { colorways: lin.colorways, spriteMods: lin.spriteMods || obj(sp).spriteMods }) : sp;
    const a = safe(() => randomAppearance(src, this.rng, { classId: d.classId }), null);
    d.appearance = a ? Object.assign({}, obj(d.appearance), a) : obj(d.appearance);
    this._reskin();
    if (makeSound !== false) sfx('select');
    this._touch();
  }

  /**
   * Ask before throwing the whole character away.
   *
   * "Randomise everything" sits one row under the harmless "Randomise look" on
   * the Appearance step, and randomiseAll() clears `_stash` — the very thing the
   * anti-data-loss walk-back restores from — so a single mis-aimed Confirm
   * destroyed a fully built character with nothing to undo it with. The cursor
   * opens on "Keep", and Cancel backs out too.
   */
  confirmRandomiseAll() {
    this.openPicker('Roll a whole new life?', [
      {
        id: 'keep',
        name: 'Keep as is',
        desc: 'Nothing changes. Species, class, background, ability scores, skills, spells and kit all stay as you set them.',
      },
      {
        id: 'reroll',
        name: 'Reroll everything',
        desc: 'Species, lineage, class, subclass, background, ability scores, skills, spells, kit, appearance, alignment and deity are all rolled again.\n\nThis cannot be undone.',
      },
    ], 'keep', (pick) => { if (pick === 'reroll') this.randomiseAll(); });
  }

  randomiseAll() {
    const d = this.draft;
    const r = this.rng;
    // Everything below writes the draft directly rather than going through the
    // setters, so the stash now describes a character that no longer exists.
    // Keeping it would let a later class switch restore the old one's picks.
    this._stash = {};
    d.bgAsiManual = false;
    if (!this.lockSpecies) {
      const sp = allSpecies();
      const pick = safe(() => r.pick(sp), null);
      if (pick) { d.speciesId = pick.id; d.lineageId = null; }
    }
    const lin = lineagesFor(d.speciesId);
    if (lin.length) { const l = safe(() => r.pick(lin), null); d.lineageId = l ? l.id : null; }
    if (!this.lockClass) {
      const ids = classIds();
      const pick = safe(() => r.pick(ids), null);
      if (pick) d.classId = pick;
    }
    const subs = subclassIdsFor(d.classId);
    d.subclassId = subs.length ? safe(() => r.pick(subs), null) : null;
    const bgs = backgroundIds();
    if (bgs.length) d.backgroundId = safe(() => r.pick(bgs), d.backgroundId);
    d.skills = [];
    d.picks = {};
    this._defaultBackgroundAsi();
    this.rerollScores();
    d.method = 'roll';
    const kits = this.kits();
    d.kitId = kits.length ? safe(() => r.pick(kits), kits[0]).id : null;
    d.takeGold = false;
    d.goldRolled = rollStartingGold(getClass(d.classId), r);
    this._randomiseLook(false);
    d.alignment = safe(() => r.pick(ALIGNMENTS), ALIGNMENTS[1]).id;
    const gods = deityList();
    d.deity = gods.length ? safe(() => r.pick(gods), gods[0]).id : null;
    d.bond = safe(() => r.int(0, Math.max(0, bondsFor(d.backgroundId).length - 1)), 0);
    d.name = rollName(d.speciesId, r, { body: obj(d.appearance).body });
    this._autoFillPicks();
    sfx('levelup');
    this.note('A whole life, rolled at once.');
    this._touch();
  }

  /**
   * Fill every outstanding multi-pick bucket with sensible defaults.
   *
   * This has to cover EVERY bucket that issue() validates, or "Randomise
   * everything" hands back a sheet the wizard then refuses to finish — which
   * is precisely the sort of silent dead end this screen is not allowed to
   * have. Skills are the trap: the class list is only one of them, and a
   * species trait or an origin feat can add more.
   */
  _autoFillPicks() {
    const d = this.draft;
    const priority = CLASS_PRIORITY[d.classId] || ABILITIES;
    const byPriority = (a, b) => priority.indexOf(SKILLS[a].ability) - priority.indexOf(SKILLS[b].ability);

    for (const b of this.skillBuckets()) {
      if (!b || !b.count) continue;
      // Never pick something the character already has for free — the wizard
      // rejects those, so auto-fill must not choose them either.
      const granted = this.grantedSkills();
      const taken = new Set(arr(d.skills));
      for (const other of this.skillBuckets()) {
        if (other === b) continue;
        for (const id of arr(this.skillPicksOf(other))) taken.add(id);
      }
      const pool = arr(b.from).filter((sk) => SKILLS[sk] && !granted[sk] && !taken.has(sk));
      const chosen = pool.slice().sort(byPriority).slice(0, b.count);
      if (b.kind === 'class') d.skills = chosen;
      else d.picks[b.key] = chosen;
    }

    for (const b of this.spellBuckets().concat(this.featureBuckets())) {
      if (!b || !b.count) continue;
      const opts = arr(b.options).map((o) => (typeof o === 'string' ? o : o.id));
      d.picks[b.key] = opts.slice(0, b.count);
    }
  }

  cycleAppearance(field, list, dir, extra) {
    const a = obj(this.draft.appearance);
    const arrList = arr(list);
    if (!arrList.length) return;
    let i = poolIndex(arrList, a[field]);
    i = (i + dir + arrList.length) % arrList.length;
    a[field] = arrList[i];
    this.draft.appearance = a;
    if (typeof extra === 'function') extra(a[field]);
    this._touch();
  }

  // =========================================================================
  // BUILD + VALIDATION
  // =========================================================================

  /** Collect every bucket pick into the shapes rules/character.js understands. */
  _collectChoices() {
    const d = this.draft;
    const out = {
      backgroundAsi: this.backgroundAsi(),
      skills: d.skills.slice(),
      cantrips: [], spells: [], fightingStyle: [], masteries: [],
      expertise: [], metamagic: [], invocations: [], maneuvers: [],
      tools: [], languages: [],
    };
    const extra = { subclassOptions: [], abilityPicks: [], feats: [] };
    const buckets = this.spellBuckets().concat(this.featureBuckets());
    for (const b of buckets) {
      if (b.key === 'wizardPrepared') continue;
      const picks = arr(d.picks[b.key]);
      if (!picks.length) continue;
      switch (b.type) {
        case 'cantrip': for (const p of picks) if (out.cantrips.indexOf(p) < 0) out.cantrips.push(p); break;
        case 'spell': for (const p of picks) if (out.spells.indexOf(p) < 0) out.spells.push(p); break;
        case 'fightingStyle': case 'fighting-style': case 'style':
          for (const p of picks) if (out.fightingStyle.indexOf(p) < 0) out.fightingStyle.push(p); break;
        case 'mastery': for (const p of picks) if (out.masteries.indexOf(p) < 0) out.masteries.push(p); break;
        case 'expertise': for (const p of picks) if (out.expertise.indexOf(p) < 0) out.expertise.push(p); break;
        case 'metamagic': for (const p of picks) if (out.metamagic.indexOf(p) < 0) out.metamagic.push(p); break;
        case 'maneuver': for (const p of picks) if (out.maneuvers.indexOf(p) < 0) out.maneuvers.push(p); break;
        case 'invocation': case 'pactBoon': case 'pact': case 'boon':
          for (const p of picks) if (out.invocations.indexOf(p) < 0) out.invocations.push(p); break;
        case 'skill': for (const p of picks) if (out.skills.indexOf(p) < 0) out.skills.push(p); break;
        case 'feat': for (const p of picks) extra.feats.push(p); break;
        case 'ability': for (const p of picks) extra.abilityPicks.push(p); break;
        case 'subclassOption': for (const p of picks) extra.subclassOptions.push(p); break;
        default: break;
      }
    }
    return { choices: out, extra };
  }

  /** opts for createCharacter. `preview` keeps names/notes out of the way. */
  buildOpts(preview) {
    const d = this.draft;
    const cls = getClass(d.classId);
    const bg = getBackground(d.backgroundId);
    const { choices, extra } = this._collectChoices();
    const o = {
      kind: 'pc',
      name: d.name || (preview ? '' : 'Adventurer'),
      speciesId: d.speciesId,
      lineageId: d.lineageId,
      backgroundId: d.backgroundId,
      classId: d.classId,
      subclassId: this.subclassActive() ? d.subclassId : null,
      level: d.level,
      abilities: this.baseScores(),
      skills: d.skills.slice(),
      appearance: Object.assign({}, obj(d.appearance)),
      choices,
      featIds: extra.feats.slice(),
      rng: this.rng,
      autoEquip: true,
      autoAsi: false,
    };
    if (d.takeGold) {
      // Class kit declined: keep the background's kit, take the class's purse.
      o.inventory = arr(obj(bg).equipment).map((e) => (Array.isArray(e) ? { id: e[0], qty: e[1] || 1 } : { id: e, qty: 1 }));
      o.gold = (Number(d.goldRolled) || 0) + (Number(obj(bg).gold) || 0);
    } else {
      o.kitId = d.kitId || (this.kits()[0] || {}).id || null;
    }
    o._extra = extra;
    return o;
  }

  /** Is the subclass legally chosen at this level (rather than merely planned)? */
  subclassActive() {
    const cls = getClass(this.draft.classId);
    const at = Number(obj(cls).subclassLevel);
    return this.draft.level >= (Number.isFinite(at) ? at : 3);
  }

  /** The real character handed to onDone. */
  buildFinal() {
    const d = this.draft;
    const opts = this.buildOpts(false);
    opts.name = (d.name || '').trim() || rollName(d.speciesId, this.rng, { body: obj(d.appearance).body });
    const ch = safe(() => createCharacter(opts), null);
    if (!ch) return null;
    const extra = obj(opts._extra);
    ch.alignment = d.alignment;
    ch.deity = d.deity;
    ch.flags = obj(ch.flags);
    ch.flags.plannedSubclass = d.subclassId || null;
    ch.flags.subclassOptions = arr(extra.subclassOptions).slice();
    ch.flags.abilityPicks = arr(extra.abilityPicks).slice();
    ch.flags.ethnicity = d.ethnicity || null;
    const bonds = bondsFor(d.backgroundId);
    ch.notes = bonds[clamp(d.bond, 0, bonds.length - 1)] || '';
    safe(() => recalc(ch));
    if (d.classId === 'wizard') {
      ch.spells.prepared = arr(d.picks.wizardPrepared).filter(id => arr(d.picks.spellbook).includes(id)).slice(0, preparedMax(ch));
    }
    ch.hp = ch.maxHp;
    return ch;
  }

  /** Why the player cannot leave step `i`, or null if it is complete. */
  issue(i) {
    const d = this.draft;
    const id = STEPS[i] ? STEPS[i].id : '';
    switch (id) {
      case 'species': {
        if (!getSpecies(d.speciesId)) return 'Choose a species.';
        if (speciesHasLineages(d.speciesId) && !d.lineageId) {
          return 'Choose ' + anA(obj(getSpecies(d.speciesId)).name || 'species') + ' lineage.';
        }
        return null;
      }
      case 'class':
        return getClass(d.classId) ? null : 'Choose a class.';
      case 'subclass': {
        if (!this.subclassActive()) return null;                 // preview only at low level
        const list = subclassIdsFor(d.classId);
        if (!list.length) return null;
        return d.subclassId ? null : 'Choose a subclass.';
      }
      case 'background': {
        if (!getBackground(d.backgroundId)) return 'Choose a background.';
        const asi = this.backgroundAsi();
        // Short on purpose: the summary step prefixes these with
        // "To do — Background: ", and the footer slot is 282px total.
        if (bgAbilities(getBackground(d.backgroundId)).length && !asi) return 'Assign the ability increase.';
        if (d.bgMode === '2-1' && (!d.bgPlus2 || !d.bgPlus1 || d.bgPlus2 === d.bgPlus1)) return 'Set which ability gets +2 and which +1.';
        return null;
      }
      case 'abilities': {
        if (d.method === 'pointbuy') {
          const left = this.pointsLeft();
          if (left > 0) return left + ' point' + (left === 1 ? '' : 's') + ' still unspent.';
          if (left < 0) return 'Over budget by ' + (-left) + '.';
          return null;
        }
        if (d.method === 'roll' && !arr(d.rolled).length) return 'Roll a set of scores.';
        const map = this.assignMap();
        for (const ab of ABILITIES) if (map[ab] == null) return 'Every ability needs a score.';
        return null;
      }
      case 'skills': {
        for (const b of this.skillBuckets()) {
          if (!b.count) continue;
          const n = this.skillPicksOf(b).length;
          if (n < b.count) {
            const left = b.count - n;
            return b.title + ': choose ' + left + ' more skill' + (left === 1 ? '' : 's') + '.';
          }
        }
        return null;
      }
      case 'spells': {
        for (const b of this.spellBuckets()) {
          if (b.optional) continue;
          const n = arr(d.picks[b.key]).length;
          if (n < b.count) return b.label + ': choose ' + (b.count - n) + ' more.';
        }
        return null;
      }
      case 'features': {
        for (const b of this.featureBuckets()) {
          const n = arr(d.picks[b.key]).length;
          if (n < b.count) return b.title + ': choose ' + (b.count - n) + ' more.';
        }
        return null;
      }
      case 'equipment': {
        if (d.takeGold) return null;
        return this.kits().length && !d.kitId ? 'Choose a starting kit.' : null;
      }
      case 'appearance':
        return null;
      case 'identity': {
        if (!String(d.name || '').trim()) return 'Your character needs a name.';
        const needsGod = d.classId === 'cleric' || d.classId === 'paladin';
        if (needsGod && !d.deity) return cap(anA(obj(getClass(d.classId)).name || 'cleric')) + ' must name a deity.';
        return null;
      }
      default:
        return null;
    }
  }

  /** How many tab1..tab5 sub-sections the current step has. */
  bucketCount() {
    switch (STEPS[this.step].id) {
      case 'background': return 2;
      case 'abilities': return 3;
      case 'skills': return Math.max(1, this.skillBuckets().length);
      case 'spells': return Math.max(1, this.spellBuckets().length);
      case 'features': return Math.max(1, this.featureBuckets().length);
      case 'summary': return 5;
      case 'appearance': return 3;
      default: return 1;
    }
  }

  bucketLabels() {
    switch (STEPS[this.step].id) {
      case 'background': return ['List', 'Boost'];
      case 'abilities': return ['Array', 'Buy', 'Roll'];
      case 'skills': return this.skillBuckets().map((b) => b.label);
      case 'spells': return this.spellBuckets().map((b) => b.label);
      case 'features': return this.featureBuckets().map((b) => b.label);
      case 'summary': return ['Story', 'Skill', 'Feat', 'Magic', 'Gear'];
      case 'appearance': return ['Body', 'Hair', 'Dress'];
      default: return [];
    }
  }

  /** Index of the leftmost sub-tab on the strip; keeps the active one visible. */
  bucketTop() {
    const n = this.bucketCount();
    if (n <= BUCKET_SLOTS) return 0;
    return clamp(this.bucket - (BUCKET_SLOTS >> 1), 0, n - BUCKET_SLOTS);
  }

  /** Jump to a sub-section by index. */
  setBucket(i) {
    const n = this.bucketCount();
    if (i < 0 || i >= n) { sfx('error'); return; }
    if (i === this.bucket) return;
    this.bucket = i;
    this.docScroll[this.rowKey()] = 0;
    sfx('cursor');
  }

  /** Step one sub-section along, wrapping — every bucket stays reachable. */
  cycleBucket(dir) {
    const n = this.bucketCount();
    if (n <= 1) { sfx('error'); return; }
    this.bucket = ((this.bucket + dir) % n + n) % n;
    this.docScroll[this.rowKey()] = 0;
    sfx('cursor');
  }

  /**
   * Are sub-section `i`'s picks all made? `null` when the step has no quota
   * (the strip then draws the tab in its neutral colour).
   */
  bucketComplete(i) {
    const d = this.draft;
    const full = (b, picks) => (b && !b.optional ? picks >= b.count : null);
    switch (STEPS[this.step].id) {
      case 'skills': {
        const b = this.skillBuckets()[i];
        return b ? this.skillPicksOf(b).length >= b.count : null;
      }
      case 'spells': {
        const b = this.spellBuckets()[i];
        return full(b, arr(d.picks[b && b.key]).length);
      }
      case 'features': {
        const b = this.featureBuckets()[i];
        return full(b, arr(d.picks[b && b.key]).length);
      }
      default: return null;
    }
  }

  /** Move to the first sub-section of step `i` that still owes a choice. */
  focusIssueBucket(i) {
    const d = this.draft;
    const id = STEPS[i] ? STEPS[i].id : '';
    if (id === 'species' && speciesHasLineages(d.speciesId) && !getLineage(d.speciesId, d.lineageId)) {
      this.sub = 1;
      this._rowsKey = '';
      return;
    }
    const firstGap = (list, done) => {
      for (let k = 0; k < list.length; k++) if (!done(list[k])) return k;
      return -1;
    };
    let k = -1;
    if (id === 'skills') k = firstGap(this.skillBuckets(), (b) => this.skillPicksOf(b).length >= b.count);
    else if (id === 'spells') k = firstGap(this.spellBuckets(), (b) => b.optional || arr(d.picks[b.key]).length >= b.count);
    else if (id === 'features') k = firstGap(this.featureBuckets(), (b) => arr(d.picks[b.key]).length >= b.count);
    // A background is always pre-selected, so its only real gap is the boost page.
    else if (id === 'background' && getBackground(d.backgroundId)) k = 1;
    if (k < 0 || k === this.bucket) return;
    this.bucket = k;
    this._rowsKey = '';
    this.docScroll[this.rowKey()] = 0;
  }

  /** Skill-picking buckets: the class list, plus any species/background skill choices. */
  _calcSkillBuckets() {
    const d = this.draft;
    const sc = this.classSkillChoice();
    const out = [];
    if (sc.count > 0) {
      out.push({ key: 'class-skills', label: 'Class', title: (obj(getClass(d.classId)).name || 'Class') + ' Skills', count: sc.count, from: sc.from, kind: 'class' });
    }
    const seen = {};
    const addTraitSkill = (owner, t) => {
      const chs = [].concat(t.choice ? [t.choice] : [], arr(t.choices));
      for (const c of chs) {
        if (!c || c.type !== 'skill') continue;
        const key = 's:' + (t.id || owner);
        if (seen[key]) continue;
        seen[key] = 1;
        const from = Array.isArray(c.from) ? c.from.filter((s) => SKILLS[s]) : SKILL_IDS;
        out.push({ key, label: shortLabel(t.name || 'Extra'), title: t.name || 'Bonus Skill', count: Number(c.count) || 1, from, kind: 'trait', desc: t.desc || '' });
      }
    };
    for (const t of traitsOf(d.speciesId, d.lineageId, d.level)) addTraitSkill('species', t);
    if (!out.length) out.push({ key: 'class-skills', label: 'Class', title: 'Skills', count: 0, from: SKILL_IDS, kind: 'class' });
    return out;
  }

  /** Picks for a skill bucket live either in draft.skills or draft.picks. */
  skillPicksOf(b) { return b.kind === 'class' ? this.draft.skills : this.picksOf(b.key); }

  toggleBucketSkill(b, id) {
    if (b.kind === 'class') { this.toggleSkill(id); return; }
    const granted = this.grantedSkills();
    if (granted[id]) { this.warn(granted[id] + ' already grants ' + skillName(id) + '.'); return; }
    this.togglePick(b, id);
  }

  /**
   * Spells and cantrips already chosen in some OTHER bucket, mapped to the
   * bucket holding them.
   *
   * The Skills step refuses a proficiency the background already grants and
   * shows it locked; the spell buckets did not, so a Sage wizard could spend a
   * Magic Initiate pick on the Fire Bolt they had already taken as a class
   * cantrip and simply lose the pick, silently.
   */
  grantedSpells(exceptKey) {
    const out = {};
    if (exceptKey === 'wizardPrepared') return out;
    const all = arr(this.spellBuckets()).concat(arr(this.featureBuckets()));
    for (const b of all) {
      if (!b || (b.type !== 'spell' && b.type !== 'cantrip')) continue;
      if (b.key === exceptKey) continue;
      if (b.key === 'wizardPrepared') continue;
      for (const id of this.picksOf(b.key)) {
        if (!(id in out)) out[id] = b.title || b.label || 'Another choice';
      }
    }
    return out;
  }

  /** togglePick, but a spell already granted elsewhere cannot be taken twice. */
  toggleBucketPick(b, id) {
    if (b && (b.type === 'spell' || b.type === 'cantrip')) {
      const list = this.picksOf(b.key);
      // Deselecting always works — otherwise an already-duplicated pick from an
      // older draft would be impossible to clear.
      if (list.indexOf(id) < 0) {
        const src = this.grantedSpells(b.key)[id];
        if (src) {
          sfx('error');
          this.warn(optionEntry(b.type, id).name + ' is already chosen under ' + src + '.');
          return;
        }
      }
    }
    this.togglePick(b, id);
  }

  // =========================================================================
  // ROW BUILDERS — the left column for every step.
  // Row: { label, hint, hintColor, color, header, checked, swatch, value,
  //        onConfirm, onLeft, onRight, onFocus }
  // =========================================================================

  buildRows() {
    const id = STEPS[this.step].id;
    switch (id) {
      case 'species': return this.sub === 1 ? this.rowsLineage() : this.rowsSpecies();
      case 'class': return this.rowsClass();
      case 'subclass': return this.rowsSubclass();
      case 'background': return this.bucket === 1 ? this.rowsBackgroundAsi() : this.rowsBackground();
      case 'abilities': return this.rowsAbilities();
      case 'skills': return this.rowsSkills();
      case 'spells': return this.rowsPickBucket(this.spellBuckets()[this.bucket]);
      case 'features': return this.rowsPickBucket(this.featureBuckets()[this.bucket]);
      case 'equipment': return this.rowsEquipment();
      case 'appearance': return this.rowsAppearance();
      case 'identity': return this.rowsIdentity();
      case 'summary': return this.rowsReview();
      default: return [];
    }
  }

  rowsReview() {
    return [{label:'Choose a page to edit',header:true}, ...STEPS.slice(0,-1).map((step,i)=>({
      label:step.title, checked:this.stepEnabled(i)&&!this.issue(i),
      hint:!this.stepEnabled(i)?'n/a':this.issue(i)?'needed':'ready',
      hintColor:this.issue(i)?C.orange:C.green,
      disabled:!this.stepEnabled(i),lockedWhy:this.lockedReason(i),
      onConfirm:()=>this.gotoStep(i),
    }))];
  }

  // --- 1. species ----------------------------------------------------------

  rowsSpecies() {
    const d = this.draft;
    // The wizard has always been able to roll a whole character, but the button
    // lived on the Appearance step -- nine screens in. The one player who most
    // wants it is the one who does not want to read nine screens, so it goes
    // here, on the first thing they see.
    const rows = [
      { label: 'In a hurry', header: true, color: C.goldD },
      {
        label: 'Surprise me', hint: 'roll and review', button: true, color: C.green,
        onConfirm: () => this.quickStart(),
      },
      {
        label: 'Roll a hero', hint: 'then tweak it', button: true, color: C.orange,
        onConfirm: () => this.confirmRandomiseAll(),
      },
      { label: 'Your folk', header: true, color: C.goldD },
    ];
    return rows.concat(allSpecies().map((sp) => ({
      label: sp.name || cap(sp.id),
      // No hint column. Darkvision and speed are both spelled out in THE
      // NUMBERS on the doc panel two inches to the right, and squeezing them
      // in here cost the names half their width and crowded the frame.
      selected: sp.id === d.speciesId,
      color: sp.id === d.speciesId ? C.goldB : C.ink,
      data: sp,
      onFocus: () => this.setSpecies(sp.id),
      onConfirm: () => {
        this.setSpecies(sp.id);
        if (speciesHasLineages(sp.id)) { this.sub = 1; sfx('select'); }
        else this.goNext();
      },
    })));
  }

  /**
   * Roll a complete draft for review. Creation still requires an explicit Create.
   */
  quickStart() {
    this.randomiseAll();
    this.gotoStep(STEP_INDEX.summary);
    this.note('Your rolled hero is ready to review and edit.');
  }

  rowsLineage() {
    const d = this.draft;
    const list = lineagesFor(d.speciesId);
    if (!list.length) return [{ label: 'No lineages', header: true }];
    return list.map((l) => {
      const dmg = l.damageType ? cap(l.damageType) : '';
      const shape = l.breathShape ? (l.breathShape === 'cone' ? '15ft cone' : '30ft line') : '';
      return {
        label: l.name || cap(l.id),
        hint: dmg || (l.speedBonus ? '+' + l.speedBonus + 'ft' : ''),
        hintColor: dmg ? C.orange : C.dim,
        sub: shape,
        selected: l.id === d.lineageId,
        color: l.id === d.lineageId ? C.goldB : C.ink,
        data: l,
        onFocus: () => this.setLineage(l.id),
        onConfirm: () => { this.setLineage(l.id); this.goNext(); },
      };
    });
  }

  // --- 2. class ------------------------------------------------------------

  rowsClass() {
    const d = this.draft;
    return classIds().map((id) => {
      const cls = getClass(id);
      const caster = isCaster(id);
      return {
        label: obj(cls).name || cap(id),
        hint: 'd' + (obj(cls).hitDie || 8),
        hintColor: caster ? C.blue : C.dim,
        icon: caster ? 'wand' : 'sword',
        selected: id === d.classId,
        color: id === d.classId ? C.goldB : C.ink,
        disabled: this.lockClass && id !== d.classId,
        lockedWhy: 'A companion keeps the class they already have.',
        data: cls,
        onFocus: () => this.setClass(id),
        onConfirm: () => { this.setClass(id); this.goNext(); },
      };
    });
  }

  // --- 3. subclass ---------------------------------------------------------

  rowsSubclass() {
    const d = this.draft;
    const ids = subclassIdsFor(d.classId);
    const live = this.subclassActive();
    const at = Number(obj(getClass(d.classId)).subclassLevel) || 3;
    if (!ids.length) return [{ label: 'No subclasses listed', header: true }];
    const head = [{
      label: live ? 'Choose your path' : 'Preview — chosen at level ' + at,
      header: true, color: live ? C.goldD : C.dim,
    }];
    return head.concat(ids.map((id) => {
      const sc = getSubclass(id);
      return {
        label: obj(sc).name || cap(id),
        hint: live ? '' : 'Lv' + at,
        selected: id === d.subclassId,
        color: id === d.subclassId ? C.goldB : (live ? C.ink : C.dim),
        data: sc || { id },
        onFocus: () => this.setSubclass(id),
        onConfirm: () => { this.setSubclass(id); this.goNext(); },
      };
    }));
  }

  // --- 4. background -------------------------------------------------------

  rowsBackground() {
    const d = this.draft;
    return backgroundIds().map((id) => {
      const bg = getBackground(id);
      // "STR/DEX/CHA" is 65px of a 109px row: it left every background name
      // ellipsised to four letters ("Acol…", "Char…", "Merc…", "Sold…"), which
      // is the one thing you navigate this list by. ABILITY_PAIR is the same
      // three abilities in 35px, and no name is cut for it.
      const abils = bgAbilities(bg).map((a) => ABILITY_PAIR[a] || ABILITY_ABBR[a]).join('');
      return {
        label: obj(bg).name || cap(id),
        hint: abils,
        hintColor: C.cyan,
        selected: id === d.backgroundId,
        color: id === d.backgroundId ? C.goldB : C.ink,
        data: bg,
        onFocus: () => this.setBackground(id),
        onConfirm: () => { this.setBackground(id); this.bucket = 1; sfx('select'); },
      };
    });
  }

  rowsBackgroundAsi() {
    const d = this.draft;
    const list = bgAbilities(getBackground(d.backgroundId));
    const rows = [{ label: obj(getBackground(d.backgroundId)).name || 'Background', header: true, color: C.goldD }];
    if (!list.length) { rows.push({ label: 'No ability increase', header: true }); return rows; }
    const modes = ['2-1', '1-1-1'];
    rows.push({
      label: 'Spread',
      value: d.bgMode === '2-1' ? '+2 / +1' : '+1 / +1 / +1',
      onLeft: () => { d.bgMode = modes[(modes.indexOf(d.bgMode) + 1) % 2]; d.bgAsiManual = true; this._touch(); },
      onRight: () => { d.bgMode = modes[(modes.indexOf(d.bgMode) + 1) % 2]; d.bgAsiManual = true; this._touch(); },
    });
    if (d.bgMode === '2-1') {
      const cyc = (field, skip) => (dir) => {
        const pool = list.filter((a) => a !== d[skip]);
        if (!pool.length) return;
        let i = pool.indexOf(d[field]);
        i = (i + dir + pool.length) % pool.length;
        d[field] = pool[i];
        d.bgAsiManual = true;              // never re-derive over a deliberate pick
        this._touch();
      };
      rows.push({
        label: '+2 to', value: ABILITY_NAMES[d.bgPlus2] || '—',
        onLeft: () => cyc('bgPlus2', 'bgPlus1')(-1), onRight: () => cyc('bgPlus2', 'bgPlus1')(1),
      });
      rows.push({
        label: '+1 to', value: ABILITY_NAMES[d.bgPlus1] || '—',
        onLeft: () => cyc('bgPlus1', 'bgPlus2')(-1), onRight: () => cyc('bgPlus1', 'bgPlus2')(1),
      });
    } else {
      for (const ab of list.slice(0, 3)) {
        rows.push({ label: ABILITY_NAMES[ab], hint: '+1', hintColor: C.green, header: true });
      }
    }
    rows.push({ label: 'Result', header: true, color: C.goldD });
    for (const ab of list) {
      const bonus = this.bgBonusFor(ab);
      rows.push({
        label: ABILITY_ABBR[ab] + '  ' + this.baseScore(ab) + (bonus ? ' +' + bonus : ''),
        hint: String(this.finalScore(ab)) + ' (' + signed(scoreMod(this.finalScore(ab))) + ')',
        hintColor: bonus ? C.green : C.dim,
        header: true,
      });
    }
    return rows;
  }

  // --- 5. abilities --------------------------------------------------------

  rowsAbilities() {
    const d = this.draft;
    const method = ['array', 'pointbuy', 'roll'][this.bucket] || 'array';
    if (d.method !== method) this.setMethod(method);
    const rows = [];

    if (method === 'pointbuy') {
      const left = this.pointsLeft();
      // "27 / 27" with spaces is 41px and pushes the pair 3px past the row.
      rows.push({ label: 'Points left', hint: left + '/' + POINT_BUY_TOTAL, hintColor: left === 0 ? C.green : left < 0 ? C.red : C.gold, header: true });
    } else if (method === 'roll') {
      rows.push({ label: '4d6 drop lowest', header: true, color: C.goldD });
    } else {
      // No hint: "Standard Array" is 83px and "15 14 13 12 10 8" is 95px in a
      // 109px row, so the two used to print straight through each other. The
      // six numbers are already listed on the six ability rows below and spelled
      // out in the detail pane, so the header just titles the section.
      rows.push({ label: 'Standard Array', header: true, color: C.goldD });
    }

    for (const ab of ABILITIES) {
      const base = this.baseScore(ab);
      const bonus = this.bgBonusFor(ab);
      const fin = base + bonus;
      const m = scoreMod(fin);
      const cost = method === 'pointbuy' ? (POINT_BUY_COST[base] != null ? POINT_BUY_COST[base] : 0) : null;
      rows.push({
        label: ABILITY_ABBR[ab],
        ability: ab,
        value: String(base) + (bonus ? '+' + bonus : ''),
        hint: String(fin) + ' ' + signed(m),
        hintColor: m > 0 ? C.green : m < 0 ? C.red : C.dim,
        sub: cost != null ? cost + 'p' : null,
        onLeft: () => (method === 'pointbuy' ? this.adjustPointBuy(ab, -1) : this.cycleAssign(ab, -1)),
        onRight: () => (method === 'pointbuy' ? this.adjustPointBuy(ab, 1) : this.cycleAssign(ab, 1)),
      });
    }

    rows.push({
      label: 'Auto-assign',
      button: true,
      onConfirm: () => this.autoAssignForClass(),
    });
    if (method === 'roll') {
      rows.push({ label: 'Reroll all six sets', button: true, onConfirm: () => this.rerollScores() });
    }
    if (method === 'pointbuy') {
      rows.push({
        label: 'Reset to all 8s',
        button: true,
        onConfirm: () => { for (const ab of ABILITIES) d.pointBuy[ab] = 8; sfx('back'); this._touch(); },
      });
    }
    return rows;
  }

  // --- 6. skills -----------------------------------------------------------

  rowsSkills() {
    const buckets = this.skillBuckets();
    const b = buckets[this.bucket] || buckets[0];
    if (!b) return [{ label: 'No skill choices', header: true }];
    const picks = this.skillPicksOf(b);
    const granted = this.grantedSkills();
    const ch = this.preview;
    const rows = [{
      label: b.title,
      hint: picks.length + '/' + b.count,
      hintColor: picks.length === b.count ? C.green : C.gold,
      header: true, color: C.goldD,
    }];
    for (const id of b.from) {
      const def = SKILLS[id];
      if (!def) continue;
      const src = granted[id];
      const on = picks.indexOf(id) >= 0;
      const m = ch ? safe(() => skillMod(ch, id).mod, 0) : scoreMod(this.finalScore(def.ability));
      rows.push({
        label: def.name,
        skillId: id,
        checked: src ? 'lock' : on,
        hint: signed(m),
        hintColor: src ? C.cyan : on ? C.green : C.dim,
        sub: src ? src : ABILITY_ABBR[def.ability],
        color: src ? C.cyan : on ? C.goldB : C.ink,
        onConfirm: () => this.toggleBucketSkill(b, id),
      });
    }
    return rows;
  }

  // --- 7 & 8. generic multi-pick (spells, features) ------------------------

  rowsPickBucket(b) {
    if (!b) return [{ label: 'Nothing to choose', header: true }];
    const picks = this.picksOf(b.key);
    const rows = [{
      label: b.title || b.label,
      hint: picks.length + '/' + b.count,
      hintColor: picks.length === b.count ? C.green : C.gold,
      header: true, color: C.goldD,
    }];
    const opts = b.options.map((o) => (typeof o === 'string' ? optionEntry(b.type, o) : o));
    if (this.draft.classId === 'wizard' && ['cantrips','spellbook','wizardPrepared'].includes(b.key))
      rows.push({ label: 'Magic explained', help: true, onConfirm: () => {} });
    if (b.key === 'wizardPrepared') rows.push({ label: 'Suggest spells', button: true,
      onConfirm: () => {
        const preferred = ['mage-armor', 'magic-missile', 'shield', 'sleep', 'detect-magic'];
        this.draft.picks.wizardPrepared = [...preferred.filter(id => b.options.includes(id)), ...b.options.filter(id => !preferred.includes(id))].slice(0, b.count);
        this._touch(); this.note('Suggested only: click any spell to change it.');
      } });
    // spells sort by level then name so the list reads like a spellbook
    if (b.type === 'spell' || b.type === 'cantrip') {
      opts.sort((a, z) => {
        const sa = getSpell(a.id), sz = getSpell(z.id);
        const la = sa ? sa.level : 0, lz = sz ? sz.level : 0;
        return la - lz || String(a.name).localeCompare(String(z.name));
      });
    }
    // A spell another bucket already grants is shown locked, the way the Skills
    // step shows a background-granted proficiency, so the pick is never quietly
    // spent on something you already have.
    const grantedSp = (b.type === 'spell' || b.type === 'cantrip') ? this.grantedSpells(b.key) : {};
    let lastLevel = -1;
    for (const o of opts) {
      const sp = (b.type === 'spell' || b.type === 'cantrip') ? getSpell(o.id) : null;
      if (sp && sp.level !== lastLevel && b.type === 'spell') {
        lastLevel = sp.level;
        rows.push({ label: sp.level === 0 ? 'Cantrips' : ordinal(sp.level) + ' Level', header: true, color: C.goldD });
      }
      const on = picks.indexOf(o.id) >= 0;
      const src = on ? null : grantedSp[o.id];
      rows.push({
        label: o.name,
        optionId: o.id,
        option: o,
        checked: src ? 'lock' : on,
        sub: src || undefined,
        hint: sp ? (SCHOOLS[sp.school] ? String(SCHOOLS[sp.school].name).slice(0, 4) : '') : '',
        hintColor: src ? C.cyan : (sp && SCHOOLS[sp.school] ? SCHOOLS[sp.school].color : C.dim),
        color: src ? C.cyan : on ? C.goldB : C.ink,
        onConfirm: () => this.toggleBucketPick(b, o.id),
      });
    }
    return rows;
  }

  // --- 9. equipment --------------------------------------------------------

  rowsEquipment() {
    const d = this.draft;
    const kits = this.kits();
    const rows = [{ label: 'Starting Kit', header: true, color: C.goldD }];
    for (const k of kits) {
      const on = !d.takeGold && d.kitId === k.id;
      rows.push({
        label: k.name || cap(k.id),
        kit: k,
        checked: on,
        hint: k.gold ? k.gold + 'gp' : '',
        hintColor: C.gold,
        color: on ? C.goldB : C.ink,
        onFocus: () => this.setKit(k.id),
        onConfirm: () => { this.setKit(k.id); this.goNext(); },
      });
    }
    rows.push({ label: 'Or Take Coin', header: true, color: C.goldD });
    rows.push({
      label: 'Starting gold',
      takeGold: true,
      checked: d.takeGold,
      hint: d.goldRolled + 'gp',
      hintColor: C.gold,
      color: d.takeGold ? C.goldB : C.ink,
      onFocus: () => this.setTakeGold(),
      onConfirm: () => { this.setTakeGold(); this.goNext(); },
    });
    rows.push({ label: 'Reroll purse', button: true, onConfirm: () => this.rerollGold() });
    return rows;
  }

  // --- 10. appearance ------------------------------------------------------

  /** A colour-cycling row bound to one appearance field. */
  _colorRow(label, field, list) {
    const a = obj(this.draft.appearance);
    const pool = arr(list).length ? arr(list) : ['#888888'];
    const i = Math.max(0, pool.indexOf(a[field]));
    const step = (dir) => {
      const n = (i + dir + pool.length) % pool.length;
      const ap = obj(this.draft.appearance);
      ap[field] = pool[n];
      this.draft.appearance = ap;
      this._touch();
    };
    return {
      label,
      swatch: pool[i],
      palette: pool,
      paletteIndex: i,
      value: (i + 1) + '/' + pool.length,
      onLeft: () => step(-1),
      onRight: () => step(1),
    };
  }

  /** An option-cycling row bound to one appearance field. */
  _optRow(label, field, list, fmt) {
    const a = obj(this.draft.appearance);
    const pool = arr(list);
    if (!pool.length) return null;
    const i = poolIndex(pool, a[field]);
    const show = typeof fmt === 'function' ? fmt(pool[i]) : (pool[i] == null ? 'None' : cap(String(pool[i])));
    const step = (dir) => this.cycleAppearance(field, pool, dir);
    return { label, value: show, onLeft: () => step(-1), onRight: () => step(1) };
  }

  rowsAppearance() {
    const d = this.draft;
    const a = obj(d.appearance);
    const pal = palettesFor(d.speciesId, d.lineageId);
    const mods = modsFor(d.speciesId, d.lineageId);
    const AO = obj(APPEARANCE_OPTIONS);
    const rows = [];
    const push = (r) => { if (r) rows.push(r); };

    if (this.bucket === 0) {
    rows.push({ label: 'Body', header: true, color: C.goldD });
    // "Body type" is 62px of an 81px row before the value gets a look in, and
    // it sits directly under a "Body" header anyway — "Type" says the same
    // thing and leaves "Androgynous" readable.
    push(this._optRow('Type', 'body', ['m', 'f', 'n'], (v) => ({ m: 'Masculine', f: 'Feminine', n: 'Androgynous' }[v] || 'Androgynous')));
    push(this._optRow('Build', 'build', arr(AO.build).length ? AO.build : ['slim', 'normal', 'broad', 'tall']));
    // Height is a multiplier on the species' OWN frame, and every species sets a
    // different base (0.84 gnome … 1.15 goliath). A fixed absolute ladder of
    // 0.9–1.1 contained almost none of them, so a high elf at 1.03 read "Short"
    // and the first Right press shrank them to 0.95. Build the ladder around the
    // species so the middle rung is always exactly where they start.
    const baseH = Number(mods.height) || 1;
    const heights = [-2, -1, 0, 1, 2].map((k) => Math.round((baseH + k * 0.04) * 1000) / 1000);
    const heightNames = ['Very short', 'Short', 'Average', 'Tall', 'Very tall'];
    push(this._optRow('Height', 'height', heights, (v) => heightNames[Math.max(0, heights.indexOf(v))] || 'Average'));
    push(this._colorRow('Skin', 'skin', pal.skin));
    push(this._colorRow('Eyes', 'eye', pal.eye));
    if (mods.ears && mods.ears !== 'round') push(this._optRow('Ears', 'ears', arr(AO.ears)));
    if (mods.horns) {
      push(this._optRow('Horns', 'horns', arr(AO.horns)));
      push(this._colorRow('Horn colour', 'hornColor', pal.horn));
    }
    if (mods.tail) push(this._optRow('Tail', 'tail', arr(AO.tail)));
    }

    const styleName = (pre) => (v) => (v === 'auto' ? 'By Calling'
      : v === pre + '-none' ? 'None' : cap(String(v).replace(pre + '-', '')));
    if (this.bucket === 1) {
    rows.push({ label: 'Hair & headwear', header: true, color: C.goldD });
    push(this._optRow('Style', 'hairStyle', arr(AO.hairStyle), (v) => ({sidepart:'Side part',twinbraids:'Twin braids',lowbun:'Low bun',widowspeak:"Widow peak"}[v] || cap(v))));
    push(this._colorRow('Hair colour', 'hair', pal.hair));
    if (mods.beard !== 'none') push(this._optRow('Beard', 'beard', arr(AO.beard).length ? AO.beard : ['none', 'stubble', 'goatee', 'full']));
    push(this._optRow('Headgear', 'helmStyle', arr(AO.helmStyle), styleName('helm')));
    }

    if (this.bucket === 2) {
    rows.push({ label: 'Dress', header: true, color: C.goldD });
    push(this._optRow('Cut', 'wardrobe', AO.wardrobe, (v) => v === 'auto' ? 'Equipment' : cap(v.replace('outfit-', ''))));
    push(this._colorRow('Main', 'outfit', CLOTH_PALETTE));
    push(this._colorRow('Secondary', 'outfitAlt', CLOTH_PALETTE));
    push(this._colorRow('Accent', 'accent', ACCENT_PALETTE));
    push(this._colorRow('Metal', 'metal', METAL_PALETTE));
    push(this._colorRow('Leather', 'leather', LEATHER_PALETTE));
    push(this._colorRow('Linen', 'cloth', CLOTH_PALETTE));
    // 'auto' reads as "By Calling": the class picks. It is a real value, not a
    // missing one, so choosing None below is honoured instead of being mistaken
    // for never having chosen.
    push(this._optRow('Cloak', 'cloakStyle', arr(AO.cloakStyle), styleName('cloak')));
    push(this._optRow('Boots', 'bootStyle', arr(AO.bootStyle), styleName('boots')));
    push(this._optRow('Emblem', 'classMarks', [true, false], (v) => v ? 'Calling' : 'None'));
    }

    rows.push({ label: 'Chance', header: true, color: C.goldD });
    rows.push({ label: 'Randomise look', button: true, onConfirm: () => this._randomiseLook(true) });
    rows.push({ label: 'Randomise everything', button: true, color: C.orange, onConfirm: () => this.confirmRandomiseAll() });
    return rows;
  }

  // --- 11. name & identity -------------------------------------------------

  startNameEntry() {
    const d = this.draft;
    sfx('select');
    safe(() => Input.startText(d.name || '', {
      maxLength: 20,
      onChange: (v) => { d.name = v; this._touch(); },
      onDone: (v) => { d.name = String(v || '').slice(0, 20); this._touch(); sfx('select'); },
      onCancel: () => { sfx('back'); },
    }));
  }

  rowsIdentity() {
    const d = this.draft;
    const rows = [];
    const typing = safe(() => Input.capturingText, false);
    rows.push({ label: 'Who Are You', header: true, color: C.goldD });
    rows.push({
      label: 'Name',
      value: (d.name || '(unnamed)') + (typing ? '_' : ''),
      valueColor: d.name ? C.goldB : C.dim,
      nameField: true,
      onConfirm: () => this.startNameEntry(),
    });
    rows.push({
      label: 'Roll a name', button: true,
      onConfirm: () => {
        d.name = rollName(d.speciesId, this.rng, { body: obj(d.appearance).body, ethnicity: d.ethnicity });
        sfx('dice'); this._touch();
      },
    });
    const eth = ethnicitiesFor(d.speciesId);
    if (eth.length > 1) {
      // The row used to fall back to eth[0] for display while leaving
      // d.ethnicity null, so the summary and the saved character claimed no
      // heritage while the row read "Chondathan" — and "Roll a name" was handed
      // null. Adopt the value being shown, so shown and stored are the same.
      if (eth.indexOf(d.ethnicity) < 0) d.ethnicity = eth[0];
      const i = eth.indexOf(d.ethnicity);
      const step = (dir) => { d.ethnicity = eth[(i + dir + eth.length) % eth.length]; this._touch(); };
      rows.push({ label: 'Heritage', value: cap(eth[i]), onLeft: () => step(-1), onRight: () => step(1) });
    }

    rows.push({ label: 'Outlook', header: true, color: C.goldD });
    const ai = Math.max(0, ALIGNMENTS.findIndex((x) => x.id === d.alignment));
    const stepA = (dir) => { d.alignment = ALIGNMENTS[(ai + dir + ALIGNMENTS.length) % ALIGNMENTS.length].id; this._touch(); };
    rows.push({ label: 'Alignment', value: ALIGNMENTS[ai].name, onLeft: () => stepA(-1), onRight: () => stepA(1) });

    const gods = deityList();
    const needsGod = d.classId === 'cleric' || d.classId === 'paladin';
    const gi = gods.findIndex((g) => g.id === d.deity);
    const stepG = (dir) => {
      const base = gi < 0 ? -1 : gi;
      let n = base + dir;
      if (!needsGod) {
        if (n < -1) n = gods.length - 1;
        if (n >= gods.length) n = -1;
        d.deity = n < 0 ? null : gods[n].id;
      } else {
        if (n < 0) n = gods.length - 1;
        if (n >= gods.length) n = 0;
        d.deity = gods[n].id;
      }
      this._touch();
    };
    rows.push({
      label: 'Deity' + (needsGod ? ' *' : ''),
      value: gi >= 0 ? gods[gi].name : (needsGod ? '— required —' : 'None'),
      valueColor: gi >= 0 ? C.goldB : (needsGod ? C.red : C.dim),
      onLeft: () => stepG(-1),
      onRight: () => stepG(1),
      onConfirm: () => this.openPicker('Choose a Deity', gods.map((g) => ({
        id: g.id, name: g.name, desc: (g.domain ? g.domain + (g.align ? ' · ' + g.align : '') + '\n' : '') + (g.desc || ''),
      })), d.deity, (pickId) => { d.deity = pickId; this._touch(); }),
    });

    const bonds = bondsFor(d.backgroundId);
    const bi = clamp(d.bond, 0, Math.max(0, bonds.length - 1));
    const stepB = (dir) => { d.bond = (bi + dir + bonds.length) % bonds.length; this._touch(); };
    rows.push({ label: 'Bond', value: (bi + 1) + '/' + bonds.length, onLeft: () => stepB(-1), onRight: () => stepB(1) });
    rows.push({ label: 'Randomise everything', button: true, color: C.orange, onConfirm: () => this.confirmRandomiseAll() });
    return rows;
  }

  // =========================================================================
  // MODAL PICKER (used for the deity list)
  // =========================================================================

  openPicker(title, items, currentId, onPick) {
    const idx = Math.max(0, items.findIndex((i) => i.id === currentId));
    this.picker = { title, items, index: idx, top: 0, onPick };
    sfx('open');
  }

  _updatePicker() {
    const p = this.picker;
    if (!p) return;
    const rep = (a) => safe(() => Input.repeatConsume(a, 0.3, 0.06), false);
    if (rep('down')) { p.index = clamp(p.index + 1, 0, p.items.length - 1); sfx('cursor'); }
    if (rep('up')) { p.index = clamp(p.index - 1, 0, p.items.length - 1); sfx('cursor'); }
    if (rep('right')) { p.index = clamp(p.index + 8, 0, p.items.length - 1); sfx('cursor'); }
    if (rep('left')) { p.index = clamp(p.index - 8, 0, p.items.length - 1); sfx('cursor'); }
    if (safe(() => Input.consume('confirm'), false)) {
      const it = p.items[p.index];
      if (it && p.onPick) safe(() => p.onPick(it.id));
      this.picker = null; sfx('select'); return;
    }
    if (safe(() => Input.consume('cancel'), false) || safe(() => Input.consume('menu'), false)) {
      this.picker = null; sfx('close');
    }
  }

  drawPicker(ctx) {
    const p = this.picker;
    if (!p) return;
    safe(() => UI.scrim(ctx, 0.6));
    const x = 60, y = 26, w = 280, h = 188;
    // 'gold' is a LIGHT brass plate meant to carry near-black ink. This modal
    // drew its title, its whole option list and its key line in pale ink on
    // it — 1.03:1 to 1.20:1, i.e. a blank sheet of brass. The deity/kit/feat
    // picker is the screen players called "jumbled"; it is a dark window now,
    // and every colour on it is the one it always wanted to be.
    panel(ctx, x, y, w, h, 'window');
    txt(ctx, x + 8, y + 6, p.title, { size: 'md', color: C.goldB, shadow: true });
    rule(ctx, x + 8, y + 17, w - 16);
    const listX = x + 8, listY = y + 22, listW = 116;
    const rows = 14;
    const r = safe(() => UI.list(ctx, listX, listY, listW, p.items.map((i) => ({ label: i.name })), p.index, {
      rows, rowH: 11, top: p.top, t: this.t,
    }), null);
    if (r) p.top = r.top;
    const cur = p.items[p.index];
    const dx = x + 132, dw = w - 140;
    rule(ctx, dx - 6, listY, 1);
    if (cur) {
      const doc = Doc(dx, dw);
      doc.head(cur.name);
      doc.wrap(cur.desc || '', { color: C.ink });
      doc.render(ctx, listY, h - 34, 0);
    }
    for (let i = 0; i < rows; i++) {
      const ix = p.top + i;
      if (ix >= p.items.length) break;
      const ry = listY + i * 11;
      this.hit(listX, ry, listW, 11, () => {
        p.index = ix;
        const it = p.items[ix];
        if (it && p.onPick) safe(() => p.onPick(it.id));
        this.picker = null; sfx('select');
      });
    }
    txt(ctx, x + 8, y + h - 12, 'Z Choose   X Cancel', { size: 'sm', color: C.dim, shadow: true });
  }

  // =========================================================================
  // DRAW
  // =========================================================================

  draw(ctx) {
    this._hot = [];
    MK.desk(ctx);
    this.drawTabs(ctx);
    this.drawLeft(ctx);
    this.drawDetail(ctx);
    this.drawPreview(ctx);
    this.drawFooter(ctx);
    if (this.picker) this.drawPicker(ctx);
  }

  drawTabs(ctx) {
    txt(ctx, 7, 2, 'A LIFE BEFORE LEGEND', {size:'sm', color:C.goldB, shadow:true});
    const pending = STEPS.filter((_,i)=>this.stepEnabled(i)&&this.issue(i)).length;
    rtxt(ctx, 394, 2, pending ? pending + ' steps need choices' : 'Ready for the road', {size:'sm',color:pending?C.dim:C.green});
    const chapter = CHAPTERS.findIndex(c=>c.steps.includes(this.step));
    const cw = TAB_W / CHAPTERS.length;
    CHAPTERS.forEach((c,i)=>{
      const x=TAB_X+i*cw, done=i===3?this.firstIncomplete()<0:c.steps.every(k=>!this.stepEnabled(k)||!this.issue(k));
      fill(ctx,x,TAB_Y,cw-2,TAB_H,i===chapter?'#463521':'rgba(0,0,0,0.4)');
      ctxt(ctx,x+cw/2,TAB_Y+1,(i+1)+'. '+c.label,{size:'sm',color:i===chapter?C.goldB:C.dim});
      fill(ctx,x+2,TAB_Y+TAB_H-1,cw-6,1,done?C.green:i===chapter?C.gold:C.border);
      this.hit(x,TAB_Y,cw-2,TAB_H,()=>this.gotoStep(c.steps.find(k=>this.stepEnabled(k))));
    });
    const steps=CHAPTERS[chapter].steps, sw=TAB_W/steps.length;
    steps.forEach((k,i)=>{
      const x=TAB_X+i*sw,on=this.stepEnabled(k),why=on&&this.issue(k);
      if(k===this.step)fill(ctx,x,24,sw-2,9,'rgba(227,179,74,0.18)');
      const label=(k===this.step?'> ':why?'! ':'')+STEPS[k].title;
      ctxt(ctx,x+sw/2,25,label,{size:'sm',color:!on?C.off:k===this.step?C.goldB:why?C.orange:C.ink});
      this.hit(x,24,sw-2,9,()=>this.gotoStep(k));
    });
  }

  // --- left column ---------------------------------------------------------

  drawLeft(ctx) {
    const step = STEPS[this.step];
    panel(ctx, LP_X, BODY_Y, LP_W, BODY_H, 'window');
    let y = BODY_Y + 4;

    // header: "5/12  ABILITY SCORES"
    const num = (this.step + 1) + '/' + STEPS.length;
    txt(ctx, LC_X, y, num, { size: 'sm', color: C.goldD, shadow: true });
    const title = this.sub === 1 ? 'Lineage' : step.title;
    txt(ctx, LC_X + tw(num, 'sm') + 4, y - 1, ellip(title.toUpperCase(), LC_W - tw(num, 'sm') - 6, 'md'), { size: 'md', color: C.goldB, shadow: true });
    y += 11;

    // Sub-section strip. It scrolls: a warlock's eleven level-1 choices would
    // otherwise hide behind the five tab keys and block the wizard for good.
    const labels = this.bucketLabels();
    if (labels.length > 1) {
      const total = labels.length;
      const more = total > BUCKET_SLOTS;
      const gut = more ? 7 : 0;                       // gutters for the ◀ ▶ arrows
      const first = this.bucketTop();
      const n = Math.min(BUCKET_SLOTS, total);
      const bw = Math.floor((LC_W - gut * 2) / n);
      if (more) {
        txt(ctx, LC_X, y + 1, '◀', { size: 'sm', color: first > 0 ? C.gold : C.off, shadow: true });
        this.hit(LC_X - 1, y, 7, 9, () => this.cycleBucket(-1));
      }
      for (let i = 0; i < n; i++) {
        const bi = first + i;
        const bx = LC_X + gut + i * bw;
        const on = bi === this.bucket;
        const done = this.bucketComplete(bi);
        fill(ctx, bx, y, bw - 1, 9, on ? 'rgba(227,179,74,0.30)' : 'rgba(0,0,0,0.35)');
        if (on) frame(ctx, bx, y, bw - 1, 9, C.gold);
        // An unfinished sub-section burns orange so it is obvious where to go.
        const ink = on ? C.goldB : done === false ? C.orange : C.dim;
        ctxt(ctx, bx + (bw - 1) / 2, y + 2, ellip(labels[bi], bw - 4, 'fine'), { size: 'fine', color: ink, shadow: true });
        this.hit(bx, y, bw - 1, 9, () => this.setBucket(bi));
      }
      if (more) {
        txt(ctx, LC_X + LC_W - 5, y + 1, '▶', { size: 'sm', color: first + n < total ? C.gold : C.off, shadow: true });
        this.hit(LC_X + LC_W - 7, y, 7, 9, () => this.cycleBucket(1));
      }
      y += 11;
    }



    const listY = y;
    const listH = BODY_Y + BODY_H - 5 - listY;
    const rows = Math.max(1, Math.floor(listH / ROW_H));
    const rk = this.rowKey();
    const self = this;
    // A refusal aimed at the list rattles the list.
    const rowShake = this.shakeX('row');
    if (rowShake) { ctx.save(); ctx.translate(rowShake, 0); }
    const res = safe(() => UI.list(ctx, LC_X, listY, LC_W, this._rows, this.cursor, {
      rows, rowH: ROW_H, top: this.tops[rk] || 0, t: this.t, cursor: false,
      empty: 'Nothing to choose',
      render: (c, it, ix, x, ry, rw, rh, sel) => self.drawRow(c, it, ix, x, ry, rw, rh, sel),
    }), null);
    if (rowShake) ctx.restore();
    if (res) this.tops[rk] = res.top;

    // hit rects for every visible row
    const top = this.tops[rk] || 0;
    for (let i = 0; i < rows; i++) {
      const ix = top + i;
      if (ix >= this._rows.length) break;
      const row = this._rows[ix];
      if (!row || row.header) continue;
      const ry = listY + i * ROW_H;
      this.hit(LC_X, ry, LC_W, ROW_H - 1, () => {
        if (row.disabled) { this.warn(row.lockedWhy || 'That choice is not open to you.', 'row'); return; }
        if (this.cursor !== ix) {
          this.cursor = ix;
          if (row.onFocus) safe(() => row.onFocus());
          sfx('cursor');
          this.docScroll[this.rowKey()] = 0;
          if (row.onFocus) return;          // focus-select rows: one click previews
        }
        this.activateRow(row);
      });
    }
  }

  /** One row of the options list. */
  drawRow(ctx, it, ix, x, ry, rw, rh, sel) {
    const midY = ry + Math.round((rh - 7) / 2);
    if (it.header) {
      // The hint used to be right-aligned with no width at all while the label
      // took a flat `rw - 26` — so "Standard Array" and "15 14 13 12 10 8"
      // (83px + 95px in a 109px row) printed straight through each other, and
      // a header with NO hint still lost 26px it did not need. Split it.
      const body = rw - 2;
      const hs = it.hint == null ? '' : String(it.hint);
      const sp = safe(() => UI.splitRow(body, it.label, hs, { size: 'sm', gap: 4, labelMax: 0.62 }), null)
        || { labelW: body, valueW: 0 };
      const shown = ellip(it.label, sp.labelW, 'sm');
      txt(ctx, x + 1, midY, shown, { size: 'sm', color: it.color || C.goldD, shadow: true });
      if (hs && sp.valueW > 0) {
        rtxt(ctx, x + rw - 1, midY, ellip(hs, sp.valueW, 'sm'), { size: 'sm', color: it.hintColor || C.dim, shadow: true });
      }
      const lw = tw(shown, 'sm') + 4;
      if (!hs) rule(ctx, x + lw, midY + 3, Math.max(0, rw - lw - 1));
      return;
    }

    if (it.button) {
      safe(() => UI.button(ctx, x, ry, rw, rh - 1, it.label, { selected: sel, t: this.t, color: it.color }));
      return;
    }

    if (sel) frameSel(ctx, x - 1, ry - 1, rw + 2, rh, this.t);

    let lx = x + 2;
    // checkbox / lock marker
    if (it.checked !== undefined) {
      const on = it.checked === true;
      const lock = it.checked === 'lock';
      fill(ctx, lx, midY - 1, 8, 8, on ? 'rgba(111,195,106,0.28)' : 'rgba(0,0,0,0.45)');
      frame(ctx, lx, midY - 1, 8, 8, lock ? C.cyan : on ? C.green : 'rgba(120,110,80,0.7)');
      if (on) txt(ctx, lx + 1, midY - 1, '✓', { size: 'sm', color: C.green, shadow: false });
      else if (lock) txt(ctx, lx + 1, midY - 1, '●', { size: 'sm', color: C.cyan, shadow: false });
      lx += 11;
    } else if (it.selected) {
      txt(ctx, lx, midY, '▶', { size: 'sm', color: C.gold, shadow: true });
      lx += 7;
    } else if (it.icon) {
      safe(() => UI.icon(ctx, it.icon, lx, midY - 1, 8, sel ? C.goldB : C.dim));
      lx += 10;
    } else {
      lx += 2;
    }

    // Right-hand value / swatch / hint.
    //
    // The value used to claim 62% of the row before the label was measured at
    // all, so "Alignment ◀Neutral Good▶" left the label 23px and printed it as
    // "Al…" — a settable row whose name the player cannot read. The fixed
    // furniture (swatch, ◀ ▶ arrows) is subtracted first, then UI.splitRow
    // divides what is left LABEL-first: the value is the half that yields.
    let rx = x + rw - 1;
    let deco = 0;
    if (it.swatch) deco += 12;
    const hasVal = it.value != null;
    const arrows = hasVal && (it.onLeft || it.onRight);
    if (arrows) deco += 14;                       // ▶ 6px on the right, ◀ 8px on the left
    const labelSize = sel ? 'md' : 'sm';
    const right = hasVal ? String(it.value) : (it.hint ? String(it.hint) : '');
    const body = Math.max(0, rw - (lx - x) - 1 - deco);
    const sp = safe(() => UI.splitRow(body, it.label, right, {
      size: labelSize, valueSize: 'sm', gap: 3, labelMax: 0.72, valueMax: 0.62,
    }), null) || { labelW: body, valueW: 0 };

    if (it.swatch) {
      swatch(ctx, rx - 9, midY - 1, 9, 8, it.swatch, sel);
      rx -= 12;
    }
    if (hasVal) {
      if (arrows) {
        txt(ctx, rx - 4, midY, '▶', { size: 'sm', color: sel ? C.goldB : C.dim, shadow: true });
        rx -= 6;
      }
      rtxt(ctx, rx, midY, ellip(right, sp.valueW, 'sm'), { size: 'sm', color: it.valueColor || (sel ? C.goldB : C.ink), shadow: true });
      rx -= sp.valueW;
      if (arrows) { txt(ctx, rx - 6, midY, '◀', { size: 'sm', color: sel ? C.goldB : C.dim, shadow: true }); rx -= 8; }
    } else if (right) {
      rtxt(ctx, rx, midY, ellip(right, sp.valueW, 'sm'), { size: 'sm', color: it.hintColor || C.dim, shadow: true });
    }

    const avail = sp.labelW;
    txt(ctx, lx, midY, ellip(it.label, avail, labelSize), {
      size: labelSize,
      color: it.disabled ? C.off : (it.color || (sel ? C.goldB : C.ink)),
      shadow: true,
    });
  }

  // --- footer --------------------------------------------------------------

  drawFooter(ctx) {
    panel(ctx, LP_X, FOOT_Y, 396, FOOT_H, 'dark');
    const y = FOOT_Y + 4;

    // The key that works the button is part of its label, so nobody has to guess
    // how to move between steps.
    const backLabel = (this.step === 0 && this.sub === 0) ? 'QUIT' : 'BACK';
    safe(() => UI.button(ctx, 6, y - 1, 48, 14, backLabel, { t: this.t }));
    this.hit(6, y - 1, 48, 14, () => (this.step === 0 && this.sub === 0 ? this.cancelOut() : this.goPrev()));

    const last = STEPS[this.step].id === 'summary';
    const why = this.issue(this.step);
    const gap = this.firstIncomplete();
    // CREATE is only truly ready when the WHOLE sheet is; a green button over an
    // unfinished skills page is exactly the lie that made this screen feel broken.
    const ready = last ? gap < 0 : !why;
    const nextLabel = last ? 'CREATE' : 'NEXT R';
    const nx = 338 + this.shakeX('next');
    safe(() => UI.button(ctx, nx, y - 1, 56, 14, nextLabel, {
      selected: ready, disabled: !ready, t: this.t,
    }));
    this.hit(338, y - 1, 56, 14, () => this.goNext());

    // message / validation / hint
    const showMsg = this.messageT > 0 && this.message;
    let line = '';
    let color = C.dim;
    if (showMsg) { line = this.message; color = this.messageBad ? C.red : C.green; }
    else if (why) { line = why; color = C.orange; }
    else if (last && gap >= 0) { line = 'To do — ' + STEPS[gap].title + ': ' + this.issue(gap); color = C.orange; }
    else { line = this.hintLine(); color = C.dim; }

    // When something is outstanding the line doubles as a button: click it (or
    // press E) and the wizard takes you to the step that owes a choice. Only
    // when THIS step is the problem, or on the summary — `gap` is non-negative
    // for almost the whole wizard (the name is empty until the second-to-last
    // step), and letting that drive the footer replaced every per-step hint
    // with the same nag.
    // The slot runs from x=54 to the NEXT/CREATE button at x=338, so it is 282
    // px wide, not the 286 that was being used — the old cap put the last two
    // pixels of every long hint underneath the button.
    const jumpable = !showMsg && (!!why || (last && gap >= 0));
    const lineW = Math.min(FOOT_LINE_W, tw(line, 'sm') + 2);
    if (jumpable) {
      fill(ctx, 53, y - 2, lineW + 2, 9, 'rgba(232,134,58,0.14)');
      this.hit(53, y - 2, lineW + 2, 9, () => this.gotoIssue());
    }
    txt(ctx, 54, y - 1, ellip(line, FOOT_LINE_W, 'sm'), { size: 'sm', color, shadow: true });

    // These have to FIT the slot — the old strings were ellipsised right
    // before "Z Confirm", which is how a player ends up not knowing how to advance.
    const keys = jumpable
      ? 'E Jump to it   R Next step'
      : this.bucketCount() > 1
        ? 'Z Pick   TAB Section   R Next   Q Back'
        : 'Z Pick   ←→ Adjust   R Next   Q Back';
    txt(ctx, 54, y + 7, keys + '   Shift Q/R Chapters', { size: 'fine', color: C.dim, shadow: true });
  }

  /**
   * The per-step hint. EVERY string here fits FOOT_LINE_W (282px = 47 sm
   * characters) whole. Seven of the old twelve ran 287..389px and were cut
   * mid-sentence — and the half that a hint loses to an ellipsis is always the
   * instruction half, which is exactly how a player ends up unable to find the
   * deity picker. If you add one, measure it: 47 characters, hard ceiling.
   */
  hintLine() {
    const row = this.currentRow();
    switch (STEPS[this.step].id) {
      case 'species': return this.sub === 1 ? 'Your lineage sharpens as you level.' : 'Your folk. 2024 rules: no ability bonus here.';
      case 'class': return 'What you do when the talking stops.';
      case 'subclass': return this.subclassActive() ? 'Your path within the class.' : 'Preview only — you choose this at level ' + (obj(getClass(this.draft.classId)).subclassLevel || 3) + '.';
      case 'background': return this.bucket === 1 ? 'Your background sets the ability increases.' : 'Where you came from, and the feat it taught.';
      case 'abilities': return '1 Array   2 Point Buy   3 Roll';
      case 'skills': return 'Cyan dots are already granted by your origin.';
      case 'spells': return 'Tab or 1-5 switches cantrips, spells and pacts.';
      case 'features': return this.bucketCount() > BUCKET_SLOTS
        ? 'Tab walks all ' + this.bucketCount() + ' sets of choices.'
        : 'The last of your level-1 choices.';
      case 'equipment': return 'Take the kit, or coin to spend in Phandalin.';
      case 'appearance': return row && row.palette ? 'Left/right changes colour. J/K turns the model.' : 'J/K Turn   M Walk   I Hero / Sheet';
      case 'identity': return 'Z types the name. Z on Deity opens the list.';
      case 'summary': return 'Review your sheet. Create begins your story.';
      default: return '';
    }
  }

  // =========================================================================
  // LIVE PREVIEW PANEL (right column) — every number comes from the real
  // Character that createCharacter/recalc just produced.
  // =========================================================================

  previewButton(ctx,x,y,w,label,fn) {
    fill(ctx,x,y,w,11,'#272019');frame(ctx,x,y,w,11,C.border);
    ctxt(ctx,x+w/2,y+3,label,{size:'fine',color:C.goldB});
    this.hit(x,y,w,11,fn);
  }

  rotatePreview(dir) { this.previewDir = (this.previewDir + dir + PREVIEW_DIRECTIONS.length) % PREVIEW_DIRECTIONS.length; }

  drawPreview(ctx) {
    const d=this.draft,ch=this.preview,cls=getClass(d.classId);
    panel(ctx,RP_X,BODY_Y,RP_W,BODY_H,'window');
    const cx=RC_X+RC_W/2,FLOOR=BODY_Y+BODY_H-3;
    UI.pushClip(ctx,RP_X+2,BODY_Y+2,RP_W-4,BODY_H-4);
    let y=BODY_Y+4;
    ['portrait','sheet'].forEach((mode,i)=>{
      const x=RC_X+i*55;
      fill(ctx,x,y,53,10,this.previewMode===mode?'#463521':'#17120e');
      ctxt(ctx,x+26,y+1,mode==='portrait'?'Hero':'Sheet',{size:'sm',color:this.previewMode===mode?C.goldB:C.dim});
      this.hit(x,y,53,10,()=>{this.previewMode=mode;});
    });
    y+=14;
    if(this.previewMode==='portrait'){
      const name=d.name.trim()||'Your adventurer';
      ctxt(ctx,cx,y,ellip(name,RC_W,'sm'),{size:'sm',color:C.goldB});y+=9;
      ctxt(ctx,cx,y,ellip((getSpecies(d.speciesId)?.name||'')+' '+(cls?.name||''),RC_W,'fine'),{size:'fine',color:C.cyan});y+=10;
      const stageY=y,stageH=68;
      fill(ctx,RC_X,stageY,RC_W,stageH,'#11191d');
      // A quiet portrait alcove beside the exact equipped sprite used in play.
      frame(ctx,RC_X,stageY,RC_W,stageH,C.border);
      if(ch)drawPortrait(ctx,ch,RC_X+1,stageY+2,60,{h:64});
      fill(ctx,RC_X+63,stageY+4,1,stageH-8,C.border);
      UI.pushClip(ctx,RC_X+65,stageY+1,RC_W-66,stageH-2);
      if(ch)drawActor(ctx,ch,RC_X+86,stageY+58,{dir:PREVIEW_DIRECTIONS[this.previewDir],phase:Math.floor(this.t*7),moving:this.previewWalk,scale:1.65,shadow:true});
      UI.popClip(ctx);
      y+=stageH+3;
      const controls=[['<',16,()=>this.rotatePreview(-1)],[PREVIEW_DIRECTIONS[this.previewDir].toUpperCase(),38,()=>this.rotatePreview(1)],['>',16,()=>this.rotatePreview(1)],[this.previewWalk?'Stop':'Walk',33,()=>{this.previewWalk=!this.previewWalk;}]];
      let bx=RC_X;
      for(const [label,w,fn]of controls){this.previewButton(ctx,bx,y,w,label,fn);bx+=w+1;}
      y+=15;
      const stats=[['HP',ch?.maxHp,C.hp],['AC',ch?.ac,C.blue],['Speed',ch?.speed,C.green]];
      stats.forEach(([label,value,color],i)=>{const x=RC_X+i*36;ctxt(ctx,x+17,y,label,{size:'fine',color:C.dim});ctxt(ctx,x+17,y+7,String(value??'-'),{size:'md',color});});
      y+=20;
      const bg=getBackground(d.backgroundId);
      ctxt(ctx,cx,y,ellip(bg?.name||'',RC_W,'sm'),{size:'sm',color:C.gold});
      y+=10;
      this.previewButton(ctx,RC_X,y,53,'Appearance',()=>this.gotoStep(STEP_INDEX.appearance));
      this.previewButton(ctx,RC_X+56,y,53,'Identity',()=>this.gotoStep(STEP_INDEX.identity));
      txt(ctx,RC_X,FLOOR-7,'I Sheet  J/K Turn',{size:'fine',color:C.dim});
      UI.popClip(ctx);return;
    }
    txt(ctx,RC_X,y,(cls?.name||'')+' / Level '+d.level,{size:'fine',color:C.goldB});y+=12;
    // --- headline derived stats -------------------------------------------
    const third = Math.floor(RC_W / 3);
    const cell = (i, label, value, color) => {
      const bx = RC_X + i * third;
      fill(ctx, bx, y, third - 2, 16, 'rgba(0,0,0,0.32)');
      ctxt(ctx, bx + (third - 2) / 2, y + 1, label, { size: 'sm', color: C.goldD, shadow: true, maxWidth: third - 4 });
      ctxt(ctx, bx + (third - 2) / 2, y + 8, value, { size: 'md', color: color || C.ink, shadow: true, maxWidth: third - 4 });
    };
    cell(0, 'AC', ch ? String(ch.ac) : '—', C.blue);
    cell(1, 'HP', ch ? String(ch.maxHp) : '—', C.hp);
    cell(2, 'SPD', ch ? (ch.speed + 'ft') : '—', C.green);
    y += 17;
    cell(0, 'INIT', ch ? signed(ch.initiative || 0) : '—', C.ink);
    cell(1, 'PROF', ch ? signed(safe(() => profBonus(ch), 2)) : '—', C.gold);
    const hd = ch ? Object.keys(obj(ch.hitDice)).map((k) => obj(ch.hitDice)[k].max + k).join(' ') : '';
    cell(2, 'HD', hd || ('d' + (obj(cls).hitDie || 8)), C.purple);
    y += 18;

    rule(ctx, RC_X, y, RC_W); y += 3;

    // --- ability block, two columns of three ------------------------------
    const half = Math.floor(RC_W / 2);
    for (let i = 0; i < 6; i++) {
      const ab = ABILITIES[i];
      const cxx = RC_X + (i % 2) * half;
      const ry = y + Math.floor(i / 2) * 10;
      const score = ch ? safe(() => abilityScore(ch, ab), this.finalScore(ab)) : this.finalScore(ab);
      const m = scoreMod(score);
      const prof = ch && arr(ch.saveProfs).indexOf(ab) >= 0;
      if (prof) fill(ctx, cxx, ry, half - 2, 10, 'rgba(227,179,74,0.12)');
      txt(ctx, cxx + 1, ry + 1, ABILITY_ABBR[ab], { size: 'sm', color: prof ? C.gold : C.dim, shadow: true });
      txt(ctx, cxx + 22, ry + 1, String(score), { size: 'sm', color: C.ink, shadow: true });
      rtxt(ctx, cxx + half - 3, ry + 1, signed(m), { size: 'sm', color: m > 0 ? C.green : m < 0 ? C.red : C.dim, shadow: true });
    }
    y += 31;
    rule(ctx, RC_X, y, RC_W); y += 3;

    // --- saves, attack, magic ---------------------------------------------
    const saves = ch ? arr(ch.saveProfs).map((ab) => ABILITY_ABBR[ab] + signed(safe(() => saveMod(ch, ab), 0))) : [];
    txt(ctx, RC_X, y, 'SAVES', { size: 'sm', color: C.goldD, shadow: true });
    txt(ctx, RC_X + 32, y, ellip(saves.length ? saves.join(' ') : '—', RC_W - 32, 'sm'), { size: 'sm', color: C.ink, shadow: true });
    y += 9;

    const weps = ch ? safe(() => weaponsOf(ch), []) : [];
    const main = weps.find((w) => w.slot === 'mainHand') || weps[0];
    txt(ctx, RC_X, y, 'ATK', { size: 'sm', color: C.goldD, shadow: true });
    if (main) {
      const dmg = obj(main.damage);
      const line = signed(main.attackBonus) + ' ' + (dmg.dice || '') + (dmg.mod ? signed(dmg.mod) : '');
      txt(ctx, RC_X + 24, y, ellip(line, RC_W - 24, 'sm'), { size: 'sm', color: C.ink, shadow: true });
      y += 9;
      txt(ctx, RC_X + 4, y, ellip(main.name, RC_W - 4, 'sm'), { size: 'sm', color: C.dim, shadow: true });
    } else {
      txt(ctx, RC_X + 24, y, '—', { size: 'sm', color: C.dim, shadow: true });
      y += 9;
      txt(ctx, RC_X + 4, y, 'Unarmed', { size: 'sm', color: C.dim, shadow: true });
    }
    y += 9;

    if (ch && obj(ch.spells).ability && y + 7 <= FLOOR) {
      const dc = safe(() => spellDC(ch), obj(ch.spells).dc || 8);
      const atk = safe(() => spellAtk(ch), obj(ch.spells).atk || 0);
      const slots = obj(obj(ch.spells).slots);
      const parts = Object.keys(slots).map((k) => k + ':' + obj(slots[k]).max).filter((s) => !/:0$/.test(s));
      // DC, attack and the slot list on ONE line: the old two-line block was
      // the 19px that pushed the purse off the bottom of the panel.
      txt(ctx, RC_X, y, 'MAGIC', { size: 'sm', color: C.goldD, shadow: true });
      const magic = 'DC ' + dc + ' ' + signed(atk) + (parts.length ? '  ' + parts.join(' ') : '');
      txt(ctx, RC_X + 34, y, ellip(magic, RC_W - 34, 'sm'), { size: 'sm', color: C.mp, shadow: true });
      y += 9;
    }

    // --- senses / purse ----------------------------------------------------
    // One line, not two: "PP 13  DV 60" on the left, the purse hard right.
    if (y + 7 <= FLOOR) {
      const dv = ch ? Number(obj(ch.senses).darkvision) || 0 : 0;
      const pp = ch ? safe(() => skillMod(ch, 'perception').passive, 10) : 10;
      const gold = ch ? (Number(ch.gold) || 0) : 0;
      safe(() => UI.kvRow(ctx, RC_X, y, RC_W, 'PP ' + pp + (dv ? '  DV ' + dv : ''), gold + ' gp', {
        size: 'sm', labelColor: C.dim, color: C.gold, gap: 5,
      }));
    }
    safe(() => UI.popClip(ctx));
  }

  // --- summary left column: the vital statistics block ---------------------

  drawSummaryVitals(ctx, y0) {
    const ch = this.preview;
    let y = y0;
    if (!ch) { txt(ctx, LC_X, y, 'Building…', { size: 'sm', color: C.dim }); return; }

    txt(ctx, LC_X, y, 'ABILITY', { size: 'sm', color: C.goldD, shadow: true });
    rtxt(ctx, LC_X + LC_W, y, 'SAVE', { size: 'sm', color: C.goldD, shadow: true });
    y += 9;
    for (const ab of ABILITIES) {
      const score = safe(() => abilityScore(ch, ab), 10);
      const m = scoreMod(score);
      const sv = safe(() => saveMod(ch, ab), m);
      const prof = arr(ch.saveProfs).indexOf(ab) >= 0;
      if (prof) fill(ctx, LC_X - 1, y - 1, LC_W + 2, 10, 'rgba(227,179,74,0.10)');
      txt(ctx, LC_X, y, ABILITY_ABBR[ab], { size: 'sm', color: prof ? C.gold : C.dim, shadow: true });
      txt(ctx, LC_X + 24, y, String(score), { size: 'sm', color: C.ink, shadow: true });
      txt(ctx, LC_X + 44, y, signed(m), { size: 'sm', color: m >= 0 ? C.green : C.red, shadow: true });
      rtxt(ctx, LC_X + LC_W, y, signed(sv) + (prof ? '*' : ' '), { size: 'sm', color: prof ? C.goldB : C.ink, shadow: true });
      y += 10;
    }
    y += 2;
    rule(ctx, LC_X, y, LC_W); y += 4;

    const pairs = [
      ['Armour Class', String(ch.ac), C.blue],
      ['Hit Points', String(ch.maxHp), C.hp],
      ['Speed', ch.speed + ' ft', C.green],
      ['Initiative', signed(ch.initiative || 0), C.ink],
      ['Proficiency', signed(safe(() => profBonus(ch), 2)), C.gold],
      ['Hit Dice', Object.keys(obj(ch.hitDice)).map((k) => obj(ch.hitDice)[k].max + k).join(' ') || '—', C.purple],
      ['Size', cap(ch.size || 'medium'), C.dim],
      ['Passive Perc.', String(safe(() => skillMod(ch, 'perception').passive, 10)), C.dim],
      ['Gold', (Number(ch.gold) || 0) + ' gp', C.gold],
    ];
    for (const [k, v, c] of pairs) {
      txt(ctx, LC_X, y, k, { size: 'sm', color: C.dim, shadow: true });
      rtxt(ctx, LC_X + LC_W, y, v, { size: 'sm', color: c, shadow: true });
      y += 9;
    }
  }

  // =========================================================================
  // DETAIL PANE (middle column) — one Doc per step, scrolled with left/right.
  // =========================================================================

  drawDetail(ctx) {
    panel(ctx, MP_X, BODY_Y, MP_W, BODY_H, 'window');
    const y0 = BODY_Y + 5;
    const viewH = BODY_H - 10;
    const doc = Doc(MC_X, MC_W - 4);
    safe(() => this.fillDoc(doc));
    this._docHeight = doc.y;
    this._docView = viewH;
    const k = this.rowKey();
    const scroll = clamp(this.docScroll[k] || 0, 0, Math.max(0, doc.y - viewH));
    this.docScroll[k] = scroll;
    doc.render(ctx, y0, viewH, scroll);
  }

  fillDoc(doc) {
    switch (STEPS[this.step].id) {
      case 'species': return this.sub === 1 ? this.docLineage(doc) : this.docSpecies(doc);
      case 'class': return this.docClass(doc);
      case 'subclass': return this.docSubclass(doc);
      case 'background': return this.docBackground(doc);
      case 'abilities': return this.docAbilities(doc);
      case 'skills': return this.docSkills(doc);
      case 'spells': case 'features': return this.docPick(doc);
      case 'equipment': return this.docEquipment(doc);
      case 'appearance': return this.docAppearance(doc);
      case 'identity': return this.docIdentity(doc);
      case 'summary': return this.docSummary(doc);
      default: return null;
    }
  }

  /** Traits, shared by the species and lineage panes. */
  _docTraits(doc, list, showLevel) {
    for (const t of arr(list)) {
      if (!t) continue;
      const lv = Number(t.level) || 1;
      doc.line(t.name || 'Trait', { color: C.goldB, size: 'md', h: 10 });
      if (showLevel && lv > 1) doc.line('from level ' + lv, { color: C.purple, indent: 4 });
      doc.wrap(t.desc || '', { indent: 4 });
      if (t.choice) doc.line('You choose: ' + cap(t.choice.type) + (t.choice.count > 1 ? ' x' + t.choice.count : ''), { color: C.cyan, indent: 4 });
      doc.gap(3);
    }
  }

  docSpecies(doc) {
    const row = this.currentRow();
    const sp = (row && row.data) || getSpecies(this.draft.speciesId);
    if (!sp) { doc.line('No species data loaded.', { color: C.red }); return; }
    doc.head(sp.name || cap(sp.id));
    doc.wrap(sp.desc || '', { color: C.ink });
    doc.gap(2);
    doc.rule('THE NUMBERS');
    doc.kv('Size', cap(sp.size || 'medium'));
    doc.kv('Speed', (sp.speed || 30) + ' ft.');
    doc.kv('Darkvision', sp.darkvision ? sp.darkvision + ' ft.' : '—', { color: sp.darkvision ? C.purple : C.dim });
    if (arr(sp.resist).length) doc.kv('Resists', arr(sp.resist).map(cap).join(', '), { color: C.green });
    if (arr(sp.skillGrants).length) doc.kv('Skills', arr(sp.skillGrants).map(skillName).join(', '), { color: C.cyan });
    doc.kv('Languages', String(sp.languageCount || 2));
    const lin = lineagesFor(sp.id);
    if (lin.length) doc.kv('Lineages', String(lin.length), { color: C.gold });
    doc.gap(2);
    if (sp.loreHook) {
      doc.rule('IN THE REALMS');
      doc.wrap(sp.loreHook, { color: C.cyan });
      doc.gap(2);
    }
    if (arr(sp.homelands).length) {
      doc.chips(arr(sp.homelands).slice(0, 5).map((h) => ({ label: String(h), color: C.dim })));
      doc.gap(1);
    }
    doc.rule('TRAITS');
    this._docTraits(doc, arr(sp.traits), true);
    if (lin.length) {
      doc.rule('LINEAGE');
      doc.wrap('Press Z or Next to choose from ' + lin.length + ' lineages: ' + lin.map((l) => l.name).join(', ') + '.', { color: C.gold });
    }
  }

  docLineage(doc) {
    const row = this.currentRow();
    const l = (row && row.data) || getLineage(this.draft.speciesId, this.draft.lineageId);
    const sp = getSpecies(this.draft.speciesId);
    if (!l) { doc.line('Choose a lineage.', { color: C.dim }); return; }
    doc.head(l.name || cap(l.id));
    doc.line((obj(sp).name || '') + ' lineage', { color: C.dim });
    doc.gap(2);
    doc.wrap(l.desc || '', { color: C.ink });
    doc.gap(2);
    if (l.damageType) {
      doc.rule('BREATH WEAPON');
      doc.kv('Damage', cap(l.damageType), { color: C.orange });
      doc.kv('Shape', l.breathShape === 'cone' ? '15-ft Cone' : '30-ft Line (5 ft wide)');
      doc.kv('Save', 'Dexterity, 8 + Con + PB');
      doc.gap(2);
    }
    if (l.lore) { doc.rule('IN THE REALMS'); doc.wrap(l.lore, { color: C.cyan }); doc.gap(2); }
    doc.rule('TRAITS');
    this._docTraits(doc, arr(l.traits), true);
  }

  docClass(doc) {
    const row = this.currentRow();
    const cls = (row && row.data) || getClass(this.draft.classId);
    if (!cls) { doc.line('No class data loaded.', { color: C.red }); return; }
    doc.head(cls.name || cap(cls.id));
    doc.wrap(PLAYS_LIKE[cls.id] || '', {color:C.goldB});
    doc.gap(4);
    doc.wrap(cls.desc || '', { color: C.ink });
    doc.gap(2);
    doc.rule('THE NUMBERS');
    doc.kv('Hit Die', 'd' + (cls.hitDie || 8), { color: C.hp });
    doc.kv('Primary', arr(cls.primary).map((a) => ABILITY_NAMES[a] || cap(a)).join(', '), { color: C.gold });
    doc.kv('Saves', arr(cls.saves).map((a) => ABILITY_ABBR[a] || cap(a)).join(', '), { color: C.gold });
    doc.kv('Armour', arr(cls.armorProf).length ? arr(cls.armorProf).map(cap).join(', ') : 'None');
    doc.kv('Weapons', arr(cls.weaponProf).length ? arr(cls.weaponProf).map(cap).join(', ') : 'None');
    if (arr(cls.toolProf).length) doc.kv('Tools', arr(cls.toolProf).map((t) => cap(String(t).replace(/-x\d$/, ''))).join(', '));
    const sc = obj(cls.skillChoices);
    if (sc.count) doc.kv('Skills', 'choose ' + sc.count);
    const cast = castingOf(cls);
    if (cast.ability) {
      doc.kv('Casting', (ABILITY_NAMES[cast.ability] || cap(cast.ability)) + ' · ' + cap(cast.type || 'prepared'), { color: C.mp });
      doc.kv('Subclass at', 'level ' + (cls.subclassLevel || 3));
    } else {
      doc.kv('Subclass at', 'level ' + (cls.subclassLevel || 3));
    }
    doc.gap(2);

    doc.gap(2);
    doc.rule('AT LEVEL 1');
    const f1 = arr(obj(cls.features)[1]);
    if (!f1.length) doc.line('—', { color: C.dim });
    for (const f of f1) {
      doc.line(f.name || 'Feature', { color: C.goldB, size: 'md', h: 10 });
      doc.wrap(f.desc || '', { indent: 4 });
      if (f.choice) doc.line('You choose ' + (f.choice.count || 1) + ' ' + cap(f.choice.type), { color: C.cyan, indent: 4 });
      doc.gap(2);
    }
    const kits = arr(cls.startingKits);
    if (kits.length) {
      doc.rule('STARTING KITS');
      doc.chips(kits.map((k) => ({ label: k.name || cap(k.id), color: C.dim })));
    }
  }

  docSubclass(doc) {
    const row = this.currentRow();
    const sub = (row && row.data) || getSubclass(this.draft.subclassId);
    const cls = getClass(this.draft.classId);
    const at = Number(obj(cls).subclassLevel) || 3;
    if (!sub) {
      doc.head('Subclass');
      doc.wrap('Your ' + (obj(cls).name || 'class') + ' takes its shape at level ' + at + '. Pick one now to plan for it.', { color: C.ink });
      return;
    }
    doc.head(sub.name || cap(sub.id));
    if (!this.subclassActive()) doc.line('CHOSEN AT LEVEL ' + at, { color: C.orange });
    doc.wrap(sub.desc || '', { color: C.ink });
    doc.gap(2);
    const feats = obj(sub.features);
    const levels = Object.keys(feats).map(Number).filter((n) => !isNaN(n)).sort((a, b) => a - b);
    for (const lv of levels) {
      doc.rule('LEVEL ' + lv);
      for (const f of arr(feats[lv])) {
        if (!f) continue;
        const reached = this.draft.level >= lv;
        doc.line(f.name || 'Feature', { color: reached ? C.goldB : C.off, size: 'md', h: 10 });
        doc.wrap(f.desc || '', { indent: 4, color: reached ? C.dim : C.off });
        if (f.choice) doc.line('Choose ' + (f.choice.count || 1) + ' ' + cap(f.choice.type), { color: C.cyan, indent: 4 });
        doc.gap(2);
      }
    }
    const spells = obj(sub.spells);
    const slv = Object.keys(spells);
    if (slv.length) {
      doc.rule('SUBCLASS SPELLS');
      for (const lv of slv) {
        doc.kv('Level ' + lv, arr(spells[lv]).map((id) => obj(getSpell(id)).name || cap(id)).join(', '), { color: C.mp });
      }
    }
  }

  docBackground(doc) {
    const d = this.draft;
    const row = this.currentRow();
    const bg = (this.bucket === 0 && row && row.data) || getBackground(d.backgroundId);
    if (!bg) { doc.line('No background data loaded.', { color: C.red }); return; }
    doc.head(bg.name || cap(bg.id));
    doc.wrap(bg.desc || '', { color: C.ink });
    doc.gap(2);
    const abils = bgAbilities(bg);
    doc.rule('ABILITY INCREASE');
    doc.wrap('Choose +2 and +1, or +1 to all three: ' + abils.map((a) => ABILITY_NAMES[a] || cap(a)).join(', ') + '.', { color: C.cyan });
    if (this.bucket === 1 || d.backgroundId === bg.id) {
      const asi = obj(this.backgroundAsi());
      for (const ab of abils) {
        const bonus = Number(asi[ab]) || 0;
        const fin = this.baseScore(ab) + bonus;
        doc.kv(ABILITY_NAMES[ab] || cap(ab), this.baseScore(ab) + (bonus ? ' +' + bonus : '') + ' = ' + fin + ' (' + signed(scoreMod(fin)) + ')', { color: bonus ? C.green : C.dim });
      }
    }
    doc.gap(2);
    const feat = getFeat(bg.originFeat);
    doc.rule('ORIGIN FEAT');
    if (feat) {
      doc.line(feat.name || cap(bg.originFeat), { color: C.goldB, size: 'md', h: 10 });
      doc.wrap(feat.desc || '', { indent: 4 });
    } else {
      doc.line(cap(bg.originFeat || '—'), { color: C.dim });
    }
    doc.gap(2);
    doc.rule('TRAINING');
    doc.kv('Skills', arr(bg.skills).map(skillName).join(', ') || '—', { color: C.cyan });
    doc.kv('Tools', arr(bg.tools).map(cap).join(', ') || '—');
    doc.gap(1);
    doc.rule('EQUIPMENT');
    for (const e of arr(bg.equipment)) {
      const id = Array.isArray(e) ? e[0] : e;
      const q = Array.isArray(e) ? (e[1] || 1) : 1;
      doc.line((q > 1 ? q + ' x ' : '') + itemLabel(id), { indent: 4, color: C.ink });
    }
    if (bg.gold) doc.kv('Purse', bg.gold + ' gp', { color: C.gold });
  }

  docAbilities(doc) {
    const d = this.draft;
    const row = this.currentRow();
    const method = d.method;
    doc.head(method === 'array' ? 'Standard Array' : method === 'pointbuy' ? 'Point Buy' : 'Roll 4d6');
    if (method === 'array') {
      doc.wrap('The classic spread: 15, 14, 13, 12, 10, 8. Left and right on any ability swaps which number it holds.', { color: C.ink });
    } else if (method === 'pointbuy') {
      const left = this.pointsLeft();
      doc.wrap('27 points, scores from 8 to 15 before your background increase. Higher scores cost more.', { color: C.ink });
      doc.gap(1);
      doc.kv('Spent', safe(() => pointBuySpent(d.pointBuy), 0) + ' / ' + POINT_BUY_TOTAL, { color: left === 0 ? C.green : C.gold });
      doc.kv('Remaining', String(left), { color: left === 0 ? C.green : left < 0 ? C.red : C.gold });
      doc.gap(1);
      doc.rule('COST TABLE');
      const keys = Object.keys(POINT_BUY_COST).sort((a, b) => a - b);
      doc.chips(keys.map((k) => ({ label: k + '=' + POINT_BUY_COST[k], color: Number(k) === this.baseScore(row && row.ability ? row.ability : 'str') ? C.goldB : C.dim })));
    } else {
      doc.wrap('Six sets of 4d6, lowest die dropped. Assign them where you like, or reroll the lot.', { color: C.ink });
      doc.gap(1);
      doc.rule('THE DICE');
      const map = this.assignMap();
      arr(d.rolled).forEach((r, i) => {
        const owner = ABILITIES.find((ab) => map[ab] === i);
        const dice = r.rolls.map((v, k) => (k === r.dropIndex ? '(' + v + ')' : String(v))).join(' ');
        doc.custom(10, (ctx, y) => {
          txt(ctx, doc.x, y, String(r.total), { size: 'md', color: C.goldB, shadow: true });
          txt(ctx, doc.x + 20, y, dice, { size: 'sm', color: C.dim, shadow: true });
          rtxt(ctx, doc.x + doc.w, y, owner ? ABILITY_ABBR[owner] : '—', { size: 'sm', color: owner ? C.gold : C.off, shadow: true });
        });
      });
    }
    doc.gap(2);

    const ab = row && row.ability;
    if (ab) {
      doc.rule(ABILITY_NAMES[ab].toUpperCase());
      doc.wrap(ABILITY_DESC[ab] || '', { color: C.ink });
      doc.gap(1);
      const base = this.baseScore(ab);
      const bonus = this.bgBonusFor(ab);
      const fin = base + bonus;
      doc.kv('Base', String(base));
      if (bonus) doc.kv('Background', '+' + bonus, { color: C.green });
      doc.kv('Final', fin + '  (' + signed(scoreMod(fin)) + ')', { color: C.goldB });
      doc.gap(1);
      doc.rule('WHAT IT DRIVES');
      const cls = getClass(d.classId);
      const bits = [];
      if (arr(obj(cls).primary).indexOf(ab) >= 0) bits.push('Primary ability for the ' + (obj(cls).name || 'class') + '.');
      if (arr(obj(cls).saves).indexOf(ab) >= 0) bits.push('You are proficient in this saving throw.');
      if (castingOf(cls).ability === ab) bits.push('Sets your spell save DC and spell attack bonus.');
      if (ab === 'con') bits.push('Adds ' + signed(scoreMod(fin)) + ' hit points per level, and holds Concentration.');
      if (ab === 'dex') bits.push('Armour Class, Initiative, finesse and ranged attacks.');
      if (ab === 'str') bits.push('Melee attacks, carrying capacity, shoving and grappling.');
      for (const b of bits) doc.wrap('- ' + b, { color: C.cyan });
      const sk = SKILL_IDS.filter((s) => SKILLS[s].ability === ab).map(skillName);
      doc.gap(1);
      doc.wrap('Skills: ' + sk.join(', '), { color: C.dim });
    }
  }

  docSkills(doc) {
    const b = this.skillBuckets()[this.bucket] || this.skillBuckets()[0];
    const row = this.currentRow();
    const ch = this.preview;
    doc.head(b ? b.title : 'Skills');
    if (b && b.desc) doc.wrap(b.desc, { color: C.ink });
    else doc.wrap('Choose ' + (b ? b.count : 0) + ' from your class list. Skills your species or background already granted are locked and marked with a dot.', { color: C.ink });
    doc.gap(2);
    const id = row && row.skillId;
    if (id && SKILLS[id]) {
      const def = SKILLS[id];
      doc.rule(def.name.toUpperCase());
      doc.kv('Ability', ABILITY_NAMES[def.ability]);
      const info = ch ? safe(() => skillMod(ch, id), null) : null;
      if (info) {
        doc.kv('Modifier', signed(info.mod), { color: info.prof === 'none' ? C.dim : C.green });
        doc.kv('Passive', String(info.passive));
        doc.kv('Trained', info.prof === 'expert' ? 'Expertise' : info.prof === 'prof' ? 'Proficient' : 'No', { color: info.prof === 'none' ? C.dim : C.goldB });
      }
      doc.gap(1);
      doc.wrap(def.desc || '', { color: C.ink });
      const src = this.grantedSkills()[id];
      if (src) { doc.gap(1); doc.wrap('Already granted by ' + src + '.', { color: C.cyan }); }
    }
    doc.gap(2);
    doc.rule('YOUR SKILLS');
    if (ch) {
      const trained = Object.keys(obj(ch.skills)).filter((k) => SKILLS[k]);
      if (!trained.length) doc.line('None yet.', { color: C.dim });
      for (const s of trained.sort()) {
        const info = safe(() => skillMod(ch, s), { mod: 0, prof: 'prof' });
        doc.kv(skillName(s), signed(info.mod) + (info.prof === 'expert' ? '  E' : ''), { color: info.prof === 'expert' ? C.purple : C.green });
      }
    }
  }

  docPick(doc) {
    const isSpells = STEPS[this.step].id === 'spells';
    const buckets = isSpells ? this.spellBuckets() : this.featureBuckets();
    const b = buckets[this.bucket] || buckets[0];
    const row = this.currentRow();
    if (!b) { doc.line('Nothing to choose here.', { color: C.dim }); return; }
    const picks = this.picksOf(b.key);

    doc.head(b.title || b.label);
    doc.kv('Chosen', picks.length + ' / ' + b.count, { color: picks.length === b.count ? C.green : C.gold });
    if (b.desc) doc.wrap(b.desc, { color: C.ink });
    if (b.note) doc.wrap(b.note, { color: C.cyan });
    if (isSpells && this.draft.classId === 'wizard' && row?.help) {
      doc.rule('YOUR MAGIC');
      for (const line of ['Cantrips: cast repeatedly, without slots.',
        'Spellbook: spells you have learned.',
        'Ready: the book spells available to cast. Change these in Spells.',
        'Slots: fuel for spells. Long Rest restores them; learning a spell costs no slot.',
        'Concentration: sustain one spell at a time.',
        'Ritual: supported rituals outside battle need no slot.',
        'Suggestions are optional. Mix defence, damage and utility, or follow your own idea.']) {
        doc.wrap(line, { color: C.ink }); doc.gap(2);
      }
      return;
    }
    doc.gap(2);

    const opt = row && row.option;
    const sp = opt ? getSpell(opt.id) : null;
    if (sp) {
      doc.rule(sp.name.toUpperCase());
      doc.kv('Level', sp.level === 0 ? 'Cantrip' : ordinal(sp.level));
      doc.kv('School', obj(SCHOOLS[sp.school]).name || cap(sp.school), { color: obj(SCHOOLS[sp.school]).color || C.ink });
      doc.kv('Casting', cap(sp.castTime || 'action'));
      doc.kv('Range', safe(() => rangeText(sp), String(sp.range)));
      doc.kv('Components', safe(() => componentText(sp), '—'));
      doc.kv('Duration', cap(sp.duration || 'instant'));
      const eff = spellEffectLine(sp);
      if (eff) doc.kv('Effect', eff, { color: C.orange });
      const tags = [];
      if (sp.concentration) tags.push({ label: 'Concentration', color: C.orange });
      if (sp.ritual) tags.push({ label: 'Ritual', color: C.cyan });
      for (const t of arr(sp.tags).slice(0, 4)) tags.push({ label: cap(t), color: C.dim });
      if (tags.length) doc.chips(tags);
      doc.gap(1);
      doc.wrap(sp.desc || '', { color: C.ink });
    } else if (opt) {
      doc.rule(String(opt.name).toUpperCase());
      doc.wrap(opt.desc || 'No description available.', { color: C.ink });
    }

    doc.gap(2);
    doc.rule('SELECTED');
    if (!picks.length) doc.line('Nothing yet.', { color: C.dim });
    for (const p of picks) {
      const e = optionEntry(b.type, p);
      const s = getSpell(p);
      doc.kv(e.name, s ? (s.level === 0 ? 'cantrip' : ordinal(s.level)) : '✓', { color: C.goldB });
    }
  }

  docEquipment(doc) {
    const d = this.draft;
    const row = this.currentRow();
    const ch = this.preview;
    const kit = row && row.kit;
    doc.head(kit ? (kit.name || cap(kit.id)) : d.takeGold ? 'Starting Gold' : 'Equipment');

    if (row && row.takeGold) {
      doc.wrap('Decline the kit and take a purse instead. Barthen\'s Provisions and the Lionshield Coster are both a short walk from the Stonehill Inn.', { color: C.ink });
      doc.gap(1);
      doc.kv('Class purse', d.goldRolled + ' gp', { color: C.gold });
      const bg = getBackground(d.backgroundId);
      if (obj(bg).gold) doc.kv('Background', obj(bg).gold + ' gp', { color: C.gold });
      doc.kv('Total', (d.goldRolled + (Number(obj(bg).gold) || 0)) + ' gp', { color: C.goldB });
      doc.gap(1);
      doc.wrap('You still keep your background equipment.', { color: C.cyan });
    } else if (kit) {
      if (kit.desc) doc.wrap(kit.desc, { color: C.cyan });
      doc.gap(1);
      doc.rule('CONTENTS');
      for (const e of arr(kit.items)) {
        const id = Array.isArray(e) ? e[0] : e;
        const q = Array.isArray(e) ? (e[1] || 1) : 1;
        const it = getItem(id);
        doc.line((q > 1 ? q + ' x ' : '') + itemLabel(id), { color: C.goldB, size: 'md', h: 10 });
        const line = it ? (it.kind === 'weapon' ? safe(() => weaponLine(it), '') : safe(() => armorLine(it), '')) : '';
        if (line) doc.line(line, { indent: 6, color: C.dim });
        else if (it && it.desc) doc.wrap(it.desc, { indent: 6 });
      }
      if (kit.gold) doc.kv('Coin', kit.gold + ' gp', { color: C.gold });
    }

    doc.gap(2);
    doc.rule('RESULT');
    if (ch) {
      doc.kv('Armour Class', String(ch.ac), { color: C.blue });
      const eq = obj(ch.equipment);
      const nameOf = (slot) => {
        const v = eq[slot];
        const id = typeof v === 'string' ? v : obj(v).id;
        return id ? itemLabel(id) : '—';
      };
      doc.kv('Armour', nameOf('armor'));
      doc.kv('Shield', nameOf('shield'));
      doc.kv('Main hand', nameOf('mainHand'));
      doc.gap(1);
      const weps = safe(() => weaponsOf(ch), []);
      for (const w of weps.slice(0, 4)) {
        const dmg = obj(w.damage);
        doc.kv(w.name, signed(w.attackBonus) + '  ' + (dmg.dice || '') + (dmg.mod ? signed(dmg.mod) : '') + ' ' + (dmg.type || ''), { color: w.enabled === false ? C.off : C.ink });
      }
      doc.gap(1);
      doc.kv('Purse', (Number(ch.gold) || 0) + ' gp', { color: C.gold });
    }
  }

  docAppearance(doc) {
    const d = this.draft;
    const row = this.currentRow();
    const a = obj(d.appearance);
    doc.head('Appearance');
    doc.wrap('Left/right changes a feature. Tab switches Body, Hair and Dress. Both views update together.', { color: C.ink });
    if (this.bucket === 2) doc.wrap('Cut is cosmetic. Armour still sets AC. Equipment restores your worn gear.', {color: C.cyan});
    if (this.bucket === 2 && ['outfit-ranger', 'outfit-peasant', 'outfit-jerkin', 'outfit-leather'].includes(a.wardrobe)) doc.wrap(a.wardrobe === 'outfit-jerkin' || a.wardrobe === 'outfit-leather' ? 'Leather colours this cut. Linen colours the shirt underneath.' : 'Linen colours this cut. Leather colours its straps and belt.', {color: C.dim});
    if (this.bucket === 1) doc.wrap('Choose Headgear: None to see all of your hairstyle.', {color: C.cyan});
    doc.gap(2);
    if (row && row.palette) {
      doc.rule(String(row.label).toUpperCase());
      doc.swatches(row.palette, row.paletteIndex, { cell: 12 });
      doc.gap(1);
      doc.kv('Swatch', (row.paletteIndex + 1) + ' of ' + row.palette.length, { color: C.gold });
      doc.kv('Hex', String(row.swatch).toUpperCase(), { color: C.dim });
    } else if (row && row.value != null) {
      doc.rule(String(row.label).toUpperCase());
      doc.kv('Current', String(row.value), { color: C.goldB });
    }
    doc.gap(2);
    doc.rule('THE LOOK');
    doc.kv('Body', ({ m: 'Masculine', f: 'Feminine', n: 'Androgynous' }[a.body] || 'Androgynous'));
    doc.kv('Build', cap(a.build || 'normal'));
    doc.kv('Hair', cap(a.hairStyle || 'short'));
    doc.kv('Cut', !a.wardrobe || a.wardrobe === 'auto' ? 'Equipment' : cap(a.wardrobe.replace('outfit-', '')));
    if (a.beard && a.beard !== 'none') doc.kv('Beard', cap(a.beard));
    if (a.ears) doc.kv('Ears', cap(a.ears));
    if (a.horns) doc.kv('Horns', cap(a.horns));
    if (a.tail) doc.kv('Tail', cap(a.tail));
    doc.kv('Cloak', a.cloakStyle === 'cloak-none' ? 'None' : cap(String(a.cloakStyle || '').replace('cloak-', '')));
    doc.kv('Headgear', a.helmStyle === 'helm-none' ? 'None' : cap(String(a.helmStyle || '').replace('helm-', '')));
    doc.gap(2);
    doc.rule('PALETTE');
    doc.custom(14, (ctx, y) => {
      const keys = ['skin', 'hair', 'eye', 'outfit', 'outfitAlt', 'accent', 'metal', 'leather'];
      keys.forEach((k, i) => swatch(ctx, doc.x + i * 13, y, 11, 11, a[k] || '#444', false));
    });
    doc.line('skin hair eye main alt trim steel hide', { color: C.dim });
  }

  docIdentity(doc) {
    const d = this.draft;
    const row = this.currentRow();
    doc.head('Name & Identity');
    if (row && row.nameField) {
      doc.wrap('Press Z to type. Backspace deletes, Enter accepts, Escape cancels. Twenty characters.', { color: C.ink });
      doc.gap(1);
      doc.kv('Name', d.name || '(unnamed)', { color: d.name ? C.goldB : C.dim });
      doc.gap(1);
      doc.rule('REALMS NAMES');
      const t = FALLBACK_NAMES[d.speciesId] || FALLBACK_NAMES.human;
      doc.wrap(arr(t.m).slice(0, 5).join(', ') + ', ' + arr(t.f).slice(0, 5).join(', ') + '.', { color: C.cyan });
      if (arr(t.s).length) doc.wrap('Families: ' + arr(t.s).slice(0, 5).join(', ') + '.', { color: C.dim });
    }
    doc.gap(2);
    const al = ALIGNMENTS.find((x) => x.id === d.alignment) || ALIGNMENTS[4];
    doc.rule('ALIGNMENT');
    doc.line(al.name, { color: C.goldB, size: 'md', h: 10 });
    doc.wrap(al.desc, { color: C.ink });
    doc.gap(2);
    doc.rule('FAITH');
    const gods = deityList();
    const g = gods.find((x) => x.id === d.deity);
    const needsGod = d.classId === 'cleric' || d.classId === 'paladin';
    if (g) {
      doc.line(g.name, { color: C.goldB, size: 'md', h: 10 });
      if (g.domain) doc.kv('Portfolio', String(g.domain));
      if (g.align) doc.kv('Alignment', String(g.align));
      doc.wrap(g.desc || '', { color: C.ink });
    } else {
      doc.wrap(needsGod
        ? 'A cleric or paladin of the Sword Coast answers to somebody. Choose a deity.'
        : 'No patron deity. Plenty of folk on the Sword Coast keep their own counsel.',
      { color: needsGod ? C.red : C.dim });
    }
    doc.gap(2);
    doc.rule('BOND');
    const bonds = bondsFor(d.backgroundId);
    doc.wrap(bonds[clamp(d.bond, 0, bonds.length - 1)] || '', { color: C.cyan });
  }

  docSummary(doc) {
    const ch = this.preview;
    const d = this.draft;
    if (!ch) { doc.line('Building…', { color: C.dim }); return; }
    const section = this.bucket - 1;
    if (section < 0) {
      doc.head(d.name.trim() || 'Your story begins');
      doc.wrap([getLineage(d.speciesId,d.lineageId)?.name || getSpecies(d.speciesId)?.name, getClass(d.classId)?.name, getBackground(d.backgroundId)?.name].filter(Boolean).join(' / '), {color:C.goldB});
      doc.gap(4);doc.rule('BEFORE THE ROAD');
      doc.wrap(bondsFor(d.backgroundId)[d.bond] || '',{color:C.cyan});
      doc.gap(4);doc.rule('READY TO DEPART?');
      const issues=STEPS.map((step,i)=>({step,i,why:this.stepEnabled(i)&&this.issue(i)})).filter(x=>x.why);
      if(issues.length)for(const item of issues)doc.wrap(item.step.title+': '+item.why,{color:C.orange});
      else doc.wrap('Your choices are complete. Create begins your adventure. You can still edit any page on the left.',{color:C.green});
      return;
    }

    if (section === 0) {
      doc.head('Skills');
      for (const s of SKILL_IDS) {
        const info = safe(() => skillMod(ch, s), { mod: 0, prof: 'none', passive: 10 });
        const mark = info.prof === 'expert' ? 'E' : info.prof === 'prof' ? '*' : ' ';
        doc.kv(mark + ' ' + skillName(s), signed(info.mod), {
          color: info.prof === 'expert' ? C.purple : info.prof === 'prof' ? C.green : C.dim,
          keyColor: info.prof === 'none' ? C.dim : C.ink,
        });
      }
      doc.gap(2);
      doc.rule('PROFICIENCIES');
      const p = obj(ch.profs);
      doc.kv('Armour', arr(p.armor).map(cap).join(', ') || '—');
      doc.kv('Weapons', arr(p.weapon).map(cap).join(', ') || '—');
      doc.kv('Tools', arr(p.tool).map(cap).join(', ') || '—');
      doc.kv('Languages', arr(p.language).map(cap).join(', ') || '—');
      if (arr(ch.resist).length) doc.kv('Resistances', arr(ch.resist).map(cap).join(', '), { color: C.green });
      return;
    }

    if (section === 1) {
      doc.head('Features');
      const feats = safe(() => allFeatures(ch), []);
      if (!feats.length) doc.line('None.', { color: C.dim });
      for (const f of arr(feats)) {
        if (!f) continue;
        doc.line(f.name || 'Feature', { color: C.goldB, size: 'md', h: 10 });
        doc.wrap(f.desc || '', { indent: 4 });
        doc.gap(2);
      }
      const chosen = obj(ch.choices);
      const shown = [
        ['Fighting Style', arr(chosen.fightingStyle)],
        ['Weapon Mastery', arr(chosen.masteries)],
        ['Expertise', arr(chosen.expertise)],
        ['Invocations', arr(chosen.invocations)],
        ['Metamagic', arr(chosen.metamagic)],
      ].filter((r) => r[1].length);
      if (shown.length) {
        doc.rule('CHOICES');
        for (const [k, v] of shown) doc.kv(k, v.map((id) => optionEntry('any', id).name).join(', '), { color: C.cyan });
      }
      return;
    }

    if (section === 2) {
      doc.head('Magic');
      const sp = obj(ch.spells);
      if (!sp.ability) { doc.wrap('No spellcasting. Steel and nerve will have to do.', { color: C.dim }); return; }
      doc.kv('Ability', ABILITY_NAMES[sp.ability] || cap(sp.ability), { color: C.mp });
      doc.kv('Save DC', String(safe(() => spellDC(ch), sp.dc)), { color: C.goldB });
      doc.kv('Spell attack', signed(safe(() => spellAtk(ch), sp.atk)), { color: C.goldB });
      const prep = safe(() => preparedMax(ch), 0);
      if (prep) doc.kv('Prepared max', String(prep));
      const slots = obj(sp.slots);
      const sl = Object.keys(slots).filter((k) => obj(slots[k]).max > 0);
      if (sl.length) doc.kv('Slots', sl.map((k) => ordinal(Number(k)) + ' x' + obj(slots[k]).max).join(', '), { color: C.mp });
      doc.gap(2);
      doc.rule('CANTRIPS');
      const cants = arr(sp.cantrips);
      if (!cants.length) doc.line('None.', { color: C.dim });
      for (const id of cants) {
        const s = getSpell(id);
        doc.kv(obj(s).name || cap(id), s ? (obj(SCHOOLS[s.school]).name || cap(s.school)) : '', { color: C.ink });
      }
      doc.gap(1);
      doc.rule('SPELLS');
      const known = uniq([...arr(sp.known), ...arr(sp.prepared)]);
      if (!known.length) doc.line('None.', { color: C.dim });
      for (const id of known) {
        const s = getSpell(id);
        doc.kv(obj(s).name || cap(id), s ? ordinal(s.level) : '', { color: C.ink });
      }
      return;
    }

    doc.head('Equipment');
    const eq = obj(ch.equipment);
    for (const slot of ['mainHand', 'offHand', 'shield', 'armor', 'helm', 'cloak', 'boots', 'gloves']) {
      const v = eq[slot];
      const id = typeof v === 'string' ? v : obj(v).id;
      if (!id) continue;
      doc.kv(cap(slot.replace(/([A-Z])/g, ' $1')), itemLabel(id), { color: C.goldB });
    }
    doc.gap(1);
    doc.rule('ATTACKS');
    for (const w of safe(() => weaponsOf(ch), [])) {
      const dmg = obj(w.damage);
      doc.kv(w.name, signed(w.attackBonus) + ' ' + (dmg.dice || '') + (dmg.mod ? signed(dmg.mod) : ''), { color: w.enabled === false ? C.off : C.ink });
    }
    doc.gap(1);
    doc.rule('PACK');
    const inv = arr(ch.inventory);
    if (!inv.length) doc.line('Empty.', { color: C.dim });
    for (const i of inv) doc.kv(itemLabel(i.id), 'x' + (i.qty || 1), { color: C.ink });
    doc.gap(1);
    doc.kv('Gold', (Number(ch.gold) || 0) + ' gp', { color: C.gold });
    doc.gap(2);
    doc.rule('THE PERSON');
    doc.kv('Alignment', (ALIGNMENTS.find((a) => a.id === d.alignment) || {}).name || '—');
    const g = deityList().find((x) => x.id === d.deity);
    doc.kv('Faith', g ? g.name : 'None');
    doc.gap(1);
    doc.wrap(bondsFor(d.backgroundId)[clamp(d.bond, 0, 99)] || '', { color: C.cyan });
  }
}

// ===========================================================================
// 8. MODULE HELPERS
// ===========================================================================

/** Squeeze a feature name into a 5-character sub-tab label. */
function shortLabel(name) {
  const s = String(name || '').replace(/[^A-Za-z ]/g, '').trim();
  if (!s) return 'Opt';
  const words = s.split(/\s+/);
  if (words.length > 1) return (words[0][0] + words[1].slice(0, 3)).replace(/^(.)/, (m) => m.toUpperCase());
  return s.slice(0, 5);
}

export default CharCreateScene;
