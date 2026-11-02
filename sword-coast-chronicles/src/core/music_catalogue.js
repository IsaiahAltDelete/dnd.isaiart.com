// core/music_catalogue.js — the score's liner notes: form, mood and source of every track, for the songbook.
//
// The tracks carry what the engine needs (notes, contexts, weight, title);
// this is what a minstrel would tell you about each one. `Audio.catalogue()`
// joins the two for a jukebox screen. `form` is the period form as a musician
// would name it; `mood` is one word from MOODS, so a UI can group or filter;
// `source` names the public-domain original an arrangement is made from
// (absent for originals, which most of the score is).

export const MOODS = Object.freeze(['bright', 'festive', 'stately', 'tender', 'wistful', 'solemn', 'peaceful',
  'mysterious', 'eerie', 'dark', 'martial', 'driving', 'desperate', 'triumphant']);

const E = (form, mood, source) => Object.freeze(source ? { form, mood, source } : { form, mood });

export const CATALOGUE = Object.freeze({
  // ── the first score (core/music.js) ──────────────────────────────────────
  title: E('ballad for vielle over lute and viol', 'wistful'),
  town: E('ductia', 'bright'),
  field: E('estampie in three puncta, the last for bagpipe', 'driving'),
  battle: E('estampie for a string band', 'martial'),
  boss: E('battaglia for the alta capella', 'dark'),
  dungeon: E('tenor and duplum with psaltery answers', 'eerie'),
  victory: E('fanfare', 'triumphant'),
  inn: E('lute duet over a tenor', 'tender'),
  shop: E('branle', 'bright'),
  tense: E('ground on the Phrygian fourth', 'dark'),
  temple: E('carol: burden and verse', 'bright'),
  forest: E('ballade in three voices', 'peaceful'),
  cave: E('organum purum with a viol tenor and alto duplum', 'eerie'),
  night: E('air over broken chords', 'peaceful'),
  wilds: E('virelai in three voices', 'wistful'),
  city: E('rondellus for the city waits', 'stately'),
  undermountain: E('chanson with cross-rhythm cantus and tower bell', 'eerie'),
  lament: E('déploration on a cantus firmus', 'solemn'),
  mystery: E('canon at the unison over a ground', 'mysterious'),
  dragon: E('conductus with a hocket cauda', 'dark'),
  defeat: E('falling cadence', 'solemn'),
  camp: E('ground with divisions', 'peaceful'),
  orchestral: E('overture for orchestra', 'stately'),
  rivertune: E('ballad in three', 'wistful'),

  // ── the sacred book (core/music_sacred.js) ───────────────────────────────
  dawnOrganum: E('organum triplum', 'solemn', 'Viderunt omnes (Gradual, Christmas)'),
  doomguideDies: E('sequence in chant and organum', 'dark', 'Dies irae (sequence)'),
  bindersMotet: E('Ars Antiqua motet', 'stately', 'Ave maris stella (hymn)'),
  tyrConductus: E('conductus with caudae', 'stately'),
  alustrielBallade: E('Ars Nova ballade', 'tender'),
  seluneGymel: E('gymel with a third voice', 'tender'),
  dragonspearPlanctus: E('planctus over a drone', 'solemn'),
  blackHandHocket: E('isorhythmic motet in hocket', 'desperate', 'Dies irae (sequence), as tenor'),
  mysteriesChant: E('chant with strict organum', 'mysterious'),
  tempusConductus: E('conductus with cauda', 'triumphant'),
  wayfireSong: E('English discant song', 'peaceful'),
  helmFaburden: E('psalm in alternatim faburden', 'solemn'),
  moonbridgeRondeau: E('rondeau', 'tender'),
  pilgrimStella: E('virelai', 'festive', 'Stella splendens (Llibre Vermell, c.1399)'),

  // ── the secular book (core/music_secular.js) ─────────────────────────────
  yawningPortalRota: E('rota over a pes', 'festive', 'Sumer is icumen in (c.1250)'),
  elfsongTourdion: E('tourdion', 'festive', 'Attaingnant, Quand je bois du vin clairet (1530)'),
  jewelPavane: E('pavane', 'stately', 'Arbeau, Belle qui tiens ma vie (1589)'),
  calishiteMourisque: E('basse danse', 'bright', 'Susato, La Mourisque (1551)'),
  drawnSteelEstampie: E('estampie with a canon', 'martial'),
  phandalinEstampie: E('estampie royale', 'bright'),
  greengrassBranles: E('branle double and branle gay', 'festive'),
  neverwinterWoodCaccia: E('caccia', 'bright'),
  flamingFistSaltarello: E('saltarello', 'triumphant'),
  dolphinBridgeBallata: E('ballata', 'tender'),
  seaOfSwordsCarole: E('carole', 'wistful'),
  delzounBasseDanse: E('basse danse', 'stately'),
  brokenShieldEstampie: E('estampie over a falling ostinato', 'desperate'),
  rageOfDragons: E('processional in parallel-fifth organum', 'dark'),
  mereLament: E('lamento and rotta', 'eerie'),
  highRoadPassamezzo: E('divisions on the passamezzo antico', 'driving'),
  triboarEstampie: E('estampie with a hocket', 'festive'),
  dockWardIstampitta: E('istampitta', 'bright'),
  daggerfordPastourelle: E('pastourelle', 'tender'),
});
