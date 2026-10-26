// rules/fieldcast.js — casting spells when nobody is trying to kill you.
//
// The spellbook used to be a filing cabinet: you could tick a spell as prepared
// and that was the whole of it. Mage Armor, Light, Knock and Longstrider might
// as well not have been in the catalogue, because the only place a spell could
// ever be cast was the battle screen — and Mage Armor lasts eight hours, which
// is a strange duration for something you can only cast once the goblins are
// already on top of you.
//
// This module is the other half. It answers two questions for any spell:
//
//   fieldCastable(ch, spellId)  Can this be cast right now, standing here?
//   fieldCast(ch, spellId, ctx) Cast it, and what visibly happened?
//
// It is headless: no scenes, no drawing. ui/menus.js drives it from the
// spellbook, the overworld supplies the world hooks (a locked chest to Knock
// open, a dark cave for Light), and rules/combat.js is untouched.
//
// WHAT MAKES A SPELL CASTABLE OUT OF COMBAT
//
// The spell data already says, in `effects[]`, `heal` and `duration`. Nothing is
// hard-coded per spell except the handful of world verbs (unlock, detect, make
// an item) that need to reach into the map. Everything else falls out of:
//
//   * a `heal` block                       -> mend a companion
//   * a buff/shield effect lasting a while -> put it up before you set off
//   * a `utility` effect                   -> the world verbs below
//   * `ritual: true`                       -> no slot, ten minutes of the clock
//   * a `damage` block and nothing else    -> refused; there is nothing to burn
//
// Refusing is as important as casting: a spell that cannot do anything useful
// here must not silently eat a slot.

import { getSpell, spellHealDice } from '../data/spells.js';
import { resolveItem } from '../data/items.js';
import {
  roundsFor, conditionInstance, removeCondition, hasCondition,
  exhaustionLevel, reduceExhaustion,
} from './conditions.js';
import { applyEffect, healTarget } from './actions.js';
import { recalc, isDead, abilityMod } from './character.js';
import {
  availableSlots, hasSlot, spendSlot, spellDC, knownSpells,
  alwaysPreparedSpells, startConcentration, isConcentrating,
} from './spellcasting.js';
import { rollExpr } from '../core/dice.js';
import { rng } from '../core/rng.js';

const arr = (v) => (Array.isArray(v) ? v : []);
const obj = (v) => (v && typeof v === 'object' ? v : {});
const lower = (v) => String(v == null ? '' : v).toLowerCase();

function safe(fn, fb) { try { const v = fn(); return v === undefined ? fb : v; } catch (e) { return fb; } }

/** Absolute minutes since the campaign began — buffs expire against this. */
export function clockMinutes(st) {
  if (!st) return 0;
  return (Number(st.day) || 0) * 1440 + (Number(st.time) || 0);
}

/** A duration string in minutes of world time. Null means "until dispelled". */
export function minutesFor(duration) {
  const rounds = roundsFor(duration);
  if (rounds == null) return null;
  return rounds / 10;                       // ten six-second rounds to the minute
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/**
 * The world verbs a `utility` effect can ask for, and who services them.
 *
 * These are the strings the CATALOGUE uses, which is not always the string the
 * spell is called. Four of them were spelt after the spell rather than after
 * its data — 'identify' for `identify-item`, 'comprehend' for `translate`,
 * 'alarm' for `ward-area`, 'mend' for `repair` — so Identify, Comprehend
 * Languages, Alarm and Mending were all classified 'none' and refused outright.
 * The old spellings are kept as aliases; the data spellings are what matter.
 *
 * A tag that is NOT in here is a tag castWorldEffect cannot service, and the
 * spell is refused rather than being allowed to eat a slot for nothing.
 */
const WORLD_TAGS = new Set([
  // light and dark
  'light', 'sunlight',
  // locks, traps, wards, shelters
  'unlock', 'lock', 'trap', 'ward-area', 'extradimensional', 'demiplane', 'hide-in-stone',
  // detection and divination
  'detect-magic', 'detect', 'locate', 'identify-item',
  'remote-sense', 'scout', 'scry', 'pathfinding', 'survey-land',
  'omen', 'divine-answer', 'lore',
  'read-mind', 'interrogate-corpse', 'preserve-corpse',
  // the pack
  'create-item', 'rations', 'create-object', 'craft', 'potion-cauldron',
  'telekinesis', 'repair',
  // small mercies
  'stabilize', 'speak-beasts', 'courier', 'translate', 'message',
  // the flavour cantrips, which cost nothing and should still DO something
  'trick', 'nature-trick', 'divine-trick', 'elemental-trick', 'whisper',
  // aliases kept so a re-tagged catalogue entry still lands somewhere
  'identify', 'comprehend', 'mend', 'alarm', 'purify', 'clean', 'water', 'disguise',
]);

/**
 * `terrain` effects are the battlefield's business — a fog bank, a wall, a
 * darkened square — and rules/combat.js owns them. These four are the
 * exception: they are world-scale rather than tactical, they have no square to
 * stand on, and out of combat they are the whole of what the spell does.
 * rules/fieldworld.js services them through the hooks named beside each one.
 */
const WORLD_TERRAIN_TAGS = new Set(['weather', 'wards', 'reshape-earth', 'mirage']);

/** Is this effect one the world verbs below can service? */
function isWorldEffect(eff) {
  const k = lower(eff && eff.kind);
  if (k === 'utility') return true;                     // castWorldEffect vets the tag
  return k === 'terrain' && WORLD_TERRAIN_TAGS.has(lower(eff && eff.tag));
}

/**
 * The effect kinds the field loop below can actually service. Anything else —
 * a summon, a teleport, a wall, a debuff aimed at nobody — falls through to a
 * refusal instead of quietly charging a slot and applying nothing.
 */
const FIELD_KINDS = new Set(['buff', 'shield', 'temphp', 'condition', 'cure']);

/**
 * Teleports worth casting standing in a field, and which travel list each one
 * opens. Misty Step and Dimension Door move you thirty to five hundred feet,
 * which out here is called walking.
 */
const TELEPORT_MODES = {
  'teleport': 'visited',
  'teleportation-circle': 'town',
  'word-of-recall': 'recall',
  'tree-stride': 'forest',
  'arcane-gate': 'visited',
  'dream-of-the-blue-veil': 'visited',
  'plane-shift': 'visited',
  'transport-via-plants': 'forest',
};

/**
 * The three conjurations that are companions rather than combatants. Every
 * other summon is refused in the field: there is nothing out here for it to
 * fight and the engine has nowhere to stand it.
 */
const FIELD_SUMMONS = {
  'find-familiar': {
    id: 'familiar', name: 'Familiar',
    // The raven on your shoulder is a second pair of eyes: Advantage on
    // Perception, which is exactly +5 passive in this engine's arithmetic.
    mech: { advSkill: ['perception'], passive: 'familiar' },
    text: (ch) => `A raven settles on ${ch.name}'s shoulder and watches the road with them.`,
  },
  'find-steed': {
    id: 'steed', name: 'Steed',
    // travelSpeed is read by fieldworld.encounterFactor and the overworld's
    // travel maths: a mounted party is quicker and harder to waylay.
    mech: { travelSpeed: 0.7, passive: 'mounted' },
    text: (ch) => `A pale courser comes out of nowhere and stands to ${ch.name}'s hand.`,
  },
  'unseen-servant': {
    id: 'unseen-servant', name: 'Unseen Servant',
    mech: { passive: 'servant' },
    text: () => 'An invisible pair of hands takes the camp chores off you: wood fetched, pots scoured, tent pegged.',
  },
};

/**
 * The four spells that argue with Kelemvor, and what the argument costs.
 * `withinMinutes` is the PHB window; `gp` is the material component, which is
 * consumed whether or not the party has the stone in the pack.
 */
const REVIVALS = {
  'revivify': { withinMinutes: 1, gp: 300, penalty: 0 },
  'raise-dead': { withinMinutes: 10 * 1440, gp: 500, penalty: -4 },
  'resurrection': { withinMinutes: 100 * 525600, gp: 1000, penalty: -4 },
  'true-resurrection': { withinMinutes: null, gp: 25000, penalty: 0 },
};

/** Social magic worked on the person you are facing rather than on an ally. */
const CHARM_SPELLS = {
  'friends': { minutes: 1, dcBonus: 0 },
  'charm-person': { minutes: 60, dcBonus: 0 },
  'suggestion': { minutes: 480, dcBonus: 0 },
  'animal-friendship': { minutes: 1440, dcBonus: 0, beast: true },
  'calm-emotions': { minutes: 1, calm: true },
};

/** Does this spell hurt somebody? Then it is a combat spell, whatever else it does. */
function isCombatSpell(sp) {
  return !!(sp.damage || sp.attack || sp.save);
}

/** The revival rule for `sp`, or null. Exported so the UI can price it. */
export function revivalOf(spell) {
  const sp = obj(spell);
  if (!arr(sp.effects).some((e) => lower(e && e.tag) === 'raise-dead')) return null;
  return REVIVALS[lower(sp.id)] || { withinMinutes: null, gp: 0, penalty: 0 };
}

/**
 * Does casting this need an answer from the player first — where to, or what
 * to make? A spell like that is fine in the spellbook, which can put the
 * question, and poor on the quick bar, which cannot. world/overworld.js's
 * `_rebuildSlots` should skip these when it fills the hotbar.
 */
export function fieldNeedsChoice(spellId) {
  const sp = getSpell(spellId);
  if (!sp) return false;
  if (teleportMode(sp)) return true;
  return arr(sp.effects).some((e) => {
    const t = lower(e && e.tag);
    return lower(e && e.kind) === 'utility'
      && (t === 'create-object' || t === 'craft')
      && arr(obj(e.mech).itemChoices).length > 0;
  });
}

/** Which travel list this spell opens, or null if it is not a field teleport. */
export function teleportMode(spell) {
  const sp = obj(spell);
  if (!arr(sp.effects).some((e) => lower(e && e.kind) === 'teleport')) return null;
  return TELEPORT_MODES[lower(sp.id)] || null;
}

/**
 * What this spell would DO if cast standing here.
 *   'heal' | 'buff' | 'world' | 'none'
 *
 * The old version ended with "anything with effects and no attack roll is a
 * buff", which swept every summon, teleport, wall, terrain, cure and unknown
 * utility into the castable pile: 84 spells charged a slot and applied
 * nothing at all. This is a whitelist instead. If nothing below claims the
 * spell it is refused, and refusing costs the player nothing.
 */
export function fieldRole(spell) {
  const sp = obj(spell);
  const id = lower(sp.id);
  const combat = isCombatSpell(sp);

  // Social magic and the field conjurations are named outright: Charm Person
  // carries a save and Find Familiar is a summon, so no general rule reaches them.
  if (CHARM_SPELLS[id]) return 'world';
  if (FIELD_SUMMONS[id]) return 'buff';
  if (teleportMode(sp)) return 'world';

  // Resurrection lands on a body, so it is targeted like a heal, not like a
  // world verb — 'raise-dead' is deliberately absent from WORLD_TAGS.
  if (revivalOf(sp)) return 'heal';

  // A world verb is blocked by damage and by an attack roll, but NOT by a
  // saving throw: Detect Thoughts, Scrying and Glyph of Warding all let the
  // subject resist and none of them is a combat spell.
  if (!(sp.damage || sp.attack)) {
    for (const e of arr(sp.effects)) {
      if (lower(e && e.kind) === 'utility' && WORLD_TAGS.has(lower(e.tag))) return 'world';
      // Control Weather, Guards and Wards, Move Earth, Mirage Arcane: terrain
      // at a scale no battlefield holds, so the field is the only place they
      // can be cast at all.
      if (lower(e && e.kind) === 'terrain' && WORLD_TERRAIN_TAGS.has(lower(e.tag))) return 'world';
    }
  }

  if (sp.heal && !combat) return 'heal';

  for (const e of arr(sp.effects)) {
    const k = lower(e && e.kind);
    if (!FIELD_KINDS.has(k)) continue;
    // A cure is aimed at a companion and wants the same picker a heal does.
    if (k === 'cure') return 'heal';
    // A helpful condition on a hostile spell (Sleep, Hold Person) is not a buff.
    if (k === 'condition' && combat) continue;
    return 'buff';
  }
  return 'none';
}

/** Who the caster must choose between: 'self' | 'ally' | 'none'. */
export function fieldTargeting(spell) {
  const sp = obj(spell);
  const t = obj(sp.target);
  const role = fieldRole(sp);
  if (role === 'world') return 'none';
  if (lower(t.kind) === 'self') return 'self';
  if (role === 'heal' || t.allowAllies || lower(t.kind) === 'creature' || lower(t.kind) === 'multi') return 'ally';
  return 'self';
}

/** Is `spellId` on this character's prepared/known list right now? */
export function isAvailable(ch, spellId) {
  if (!ch || !spellId) return false;
  const sp = getSpell(spellId);
  if (!sp) return false;
  if (sp.level === 0) return arr(safe(() => knownSpells(ch), [])).indexOf(spellId) >= 0
    || arr(ch.spells && ch.spells.cantrips).indexOf(spellId) >= 0;
  const prepared = arr(ch.spells && ch.spells.prepared);
  const always = arr(safe(() => alwaysPreparedSpells(ch), []));
  return prepared.indexOf(spellId) >= 0 || always.indexOf(spellId) >= 0;
}

/**
 * May `ch` cast `spellId` here and now?
 * @returns {{ok:boolean, why:string|null, role:string, slot:number, ritual:boolean}}
 */
export function fieldCastable(ch, spellId, env = {}) {
  const sp = getSpell(spellId);
  const no = (why, role = 'none') => ({ ok: false, why, role, slot: 0, ritual: false });
  if (!sp) return no('No such spell.');
  if (!ch || isDead(ch)) return no('They are in no state to cast.');
  if (!isAvailable(ch, spellId)) return no(sp.level === 0 ? 'Not one of their cantrips.' : 'Not prepared today.');

  const role = fieldRole(sp);
  if (role === 'none') return no(refusalFor(sp), role);

  // A ritual is cast off-book: no slot, ten minutes of daylight.
  const ritual = !!sp.ritual && sp.level > 0;
  if (ritual) return { ok: true, why: null, role, slot: 0, ritual: true };

  if (sp.level === 0) return { ok: true, why: null, role, slot: 0, ritual: false };

  const wanted = Math.max(sp.level, Math.min(9, Number(env.slotLevel) || sp.level));
  if (safe(() => hasSlot(ch, wanted), false)) return { ok: true, why: null, role, slot: wanted, ritual: false };

  const open = arr(safe(() => availableSlots(ch, sp.level), []));
  if (!open.length) return no(`No ${ordinalish(sp.level)} slot or better left.`, role);
  return { ok: true, why: null, role, slot: open[0], ritual: false };
}

/**
 * Why the field cannot use this spell, in the game's voice. A refusal has to
 * name the reason, because "nothing happens" reads as a bug and this reads as
 * a ruling.
 */
function refusalFor(sp) {
  if (isCombatSpell(sp)) return 'Nothing here to aim it at — save it for the fight.';
  const kinds = new Set(arr(sp.effects).map((e) => lower(e && e.kind)));
  if (kinds.has('teleport')) return 'Thirty feet of nothing to cross. Out here that is called walking.';
  if (kinds.has('summon')) return 'Nothing out here needs fighting, and it will not stay for the walk.';
  if (kinds.has('wall') || kinds.has('terrain') || kinds.has('zone')) return 'There is no ground here worth reshaping.';
  if (kinds.has('debuff')) return 'There is nobody here to work it on.';
  return 'There is no call for it just now.';
}

function ordinalish(n) {
  return n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`;
}

// ---------------------------------------------------------------------------
// Casting
// ---------------------------------------------------------------------------

/**
 * A minimal stand-in for the Encounter that rules/actions.js expects. Out of
 * combat there is no initiative, no map and no log — applyEffect only reaches
 * for the RNG and a place to push text.
 */
function fieldCtx(log) {
  return { rng, log, round: 0, units: [], _push(text, kind) { log.push({ text, kind }); } };
}

/**
 * Cast `spellId` outside combat.
 *
 * @param {object} ch      the caster
 * @param {string} spellId
 * @param {object} env {
 *   target,            // the Character to affect (defaults to the caster)
 *   party,             // world/party.js, for goodberry and the like
 *   state,             // GameState, for the world clock and flags
 *   world,             // { unlock(), light(), detect(), nearby() } from the overworld
 *   slotLevel,         // upcast level
 *   destination,       // a chosen travel site, for a long-range teleport
 *   itemChoice,        // a chosen item id, for Creation / Fabricate
 * }
 *
 * A caller that gets back `{ ok:false, pending }` has been asked a question —
 * where to, or what to make — and should put the choice to the player and call
 * again with `env.destination` / `env.itemChoice`. NOTHING has been spent yet.
 *
 * @returns {{ok:boolean, text:string, lines:string[], slot:number, ritual:boolean}}
 */
export function fieldCast(ch, spellId, env = {}) {
  const sp = getSpell(spellId);
  const gate = fieldCastable(ch, spellId, env);
  if (!gate.ok) return { ok: false, text: gate.why || 'It will not come.', lines: [], slot: 0, ritual: false };

  const st = env.state || null;
  const target = env.target || ch;
  const lines = [];
  const log = [];
  const ctx = fieldCtx(log);
  const level = gate.slot || sp.level;
  const refuse = (text, extra = {}) => ({ ok: false, text, lines: [], slot: 0, ritual: false, ...extra });

  // --- questions that must be answered before anything is spent ------------
  // Where does the teleport go? What does Creation make? Is the body still
  // warm enough, and can the party afford the diamond? Every one of these is
  // asked before the slot is touched, so a cancelled cast costs nothing.
  const mode = teleportMode(sp);
  if (mode) {
    const ask = teleportQuestion(sp, mode, env);
    if (ask) return ask;
  }

  const revival = revivalOf(sp);
  if (revival) {
    const bar = revivalBlock(ch, sp, revival, target, env);
    if (bar) return refuse(bar);
  }

  const picker = itemQuestion(sp, env);
  if (picker) return picker;

  // --- the world verbs go FIRST -------------------------------------------
  // A spell that turns out to have nothing to act on must not cost a slot, and
  // fieldCastable cannot know: whether there is a locked chest within sixty
  // feet is a question only the map can answer. So ask the map before paying.
  const worldLines = [];
  let worldDidSomething = false;
  // Some world verbs take real time to work: Control Weather walks the sky one
  // stage per ten minutes, Guards and Wards is ten minutes of chalk and incense.
  // The verb reports it; the caller advances the clock by it.
  let worldMinutes = 0;

  // Charm Person and its cousins are `condition` effects aimed at somebody who
  // is not in the party, so they go through the world hooks rather than through
  // the effect loop below. No one in front of you means no slot spent.
  const charm = CHARM_SPELLS[lower(spellId)];
  if (charm) {
    const res = castCharm(ch, sp, charm, env);
    worldLines.push(res.text);
    if (res.ok) worldDidSomething = true;
  }

  for (const eff of arr(sp.effects)) {
    if (!isWorldEffect(eff)) continue;
    const res = castWorldEffect(ch, sp, eff, env);
    if (!res) continue;
    worldLines.push(res.text);
    if (res.ok) {
      worldDidSomething = true;
      worldMinutes = Math.max(worldMinutes, Number(res.minutes) || 0);
    }
  }

  // The teleport itself: the destination is known by now, so the slot is fair.
  let travel = null;
  if (mode) {
    travel = { ...obj(env.destination) };
    worldLines.push(`The world folds, and unfolds somewhere else.`);
    worldDidSomething = true;
  }

  if (gate.role === 'world' && !worldDidSomething) {
    return refuse(worldLines[0] || 'Nothing comes of it.');
  }

  // --- the slot ------------------------------------------------------------
  if (!gate.ritual && sp.level > 0) {
    if (!safe(() => spendSlot(ch, level), false)) {
      return { ok: false, text: 'The slot slips away.', lines: [], slot: 0, ritual: false };
    }
  }

  // Rituals take ten minutes; everything else is over in six seconds — unless a
  // world verb said otherwise (Control Weather takes ten minutes a stage).
  const minutes = Math.max(gate.ritual ? 10 : 0, worldMinutes);

  // --- concentration, BEFORE the effects it protects ------------------------
  // startConcentration drops whatever came before it, and dropping a spell
  // strips the effects that spell applied. Re-casting the same ward on the same
  // ally would otherwise remove the ward you just put up.
  // The "lets their previous spell go" note is bookkeeping, not the headline;
  // it is appended at the end so the line the player reads first is the thing
  // the spell actually did.
  let concNote = '';
  if (sp.concentration) {
    if (isConcentrating(ch)) concNote = `${ch.name} lets their previous spell go.`;
    safe(() => startConcentration(ch, spellId, [target], { dur: roundsFor(sp.duration) }));
  }

  // --- the bill for arguing with Kelemvor ----------------------------------
  // Charged AFTER the slot and before the healing, so the diamond and the slot
  // go together or neither does. revivalBlock() has already checked it is
  // affordable, so this cannot leave the party half-paid.
  if (revival) {
    const paid = payRevival(revival, env);
    if (paid.text) lines.push(paid.text);
    stripDeath(target);
  }

  // --- healing -------------------------------------------------------------
  // The old guard here skipped the heal for anything carrying a `create-item`
  // effect, which was Goodberry wearing a generic coat. The real rule is that
  // a spell whose heal block is `perBerry` heals the person who EATS a berry,
  // not the druid who conjured them; every other combination now applies both.
  if (sp.heal && !obj(sp.heal).perBerry) {
    const healed = healWith(ctx, ch, target, sp, level, log, { revive: !!revival });
    lines.push(healed > 0
      ? `${target.name} recovers ${healed} hit points.`
      : `${target.name} is no better for it.`);
  }
  if (revival) {
    const pen = raisePenalty(target, sp, revival, st);
    if (pen) lines.push(pen);
  }

  // --- buffs, wards, temp hp, helpful conditions and cures ------------------
  const dc = safe(() => spellDC(ch), 10);
  for (const eff of arr(sp.effects)) {
    const k = lower(eff && eff.kind);
    if (!FIELD_KINDS.has(k)) continue;

    // Lesser/Greater Restoration, Remove Curse, Protection from Poison: the
    // one branch of the effect vocabulary the field loop never serviced, which
    // is why "cure the poisoned ranger" was a thing you could only do in a fight.
    if (k === 'cure') {
      const cured = applyCure(target, eff);
      lines.push(cured.length
        ? `${target.name}: ${cured.join(', ')} lifted.`
        : `${target.name} had nothing for it to lift.`);
      continue;
    }

    if (charm) continue;                    // its condition lands on the NPC, not on us
    if (!Array.isArray(target.effects)) target.effects = [];
    const before = target.effects.length;
    const applied = safe(() => applyEffect(ctx, ch, target, {
      ...eff, dc, spellId, concentration: !!sp.concentration,
    }, { r: rng, log }), null);
    if (!applied) continue;
    stampExpiry(target, eff, sp, st, before, applied);
    lines.push(`${target.name}: ${eff.name || sp.name} takes hold.`);
  }

  // --- the three summons that walk with you --------------------------------
  const comp = FIELD_SUMMONS[lower(spellId)];
  if (comp) {
    applyCompanion(ch, sp, comp, st);
    lines.push(comp.text(ch));
  }

  for (const l of worldLines) lines.push(l);
  if (concNote) lines.push(concNote);

  safe(() => recalc(target));
  for (const l of log) if (l && l.text && lines.indexOf(l.text) < 0) lines.push(l.text);
  if (!lines.length) lines.push(`${ch.name} casts ${sp.name}.`);

  return {
    ok: true,
    text: lines[0],
    lines,
    slot: gate.ritual ? 0 : (sp.level > 0 ? level : 0),
    ritual: gate.ritual,
    minutes,
    // The caller moves the party; the spell has already been paid for.
    travel: travel && travel.id ? travel : null,
  };
}

// ---------------------------------------------------------------------------
// The questions asked before anything is spent
// ---------------------------------------------------------------------------

/**
 * A long-range teleport needs somewhere to go. Ask the world for the list the
 * spell is entitled to, hand it back as a `pending` choice, and let the UI put
 * it to the player. The slot is not touched until `env.destination` comes back.
 */
function teleportQuestion(sp, mode, env) {
  const w = obj(env.world);
  const dest = obj(env.destination);
  if (dest.id) return null;                        // answered; carry on and pay

  const sites = arr(safe(() => (typeof w.sites === 'function' ? w.sites(mode) : []), []));
  if (!sites.length) {
    return {
      ok: false, lines: [], slot: 0, ritual: false,
      text: mode === 'recall'
        ? 'You have no sanctuary to recall to. Sleep at an inn or a temple first.'
        : mode === 'forest'
          ? 'No wood you have walked is close enough to step into.'
          : 'Nowhere you have been is worth the crossing.',
    };
  }
  // The text is what a caller that cannot ask a question shows instead — the
  // hotbar, for one. The spellbook reads `pending` and opens the list.
  return {
    ok: false, lines: [], slot: 0, ritual: false,
    text: 'Open the spellbook to choose where it takes you.',
    pending: { kind: 'travel', mode, spellId: sp.id, sites },
  };
}

/** Creation and Fabricate make a thing; the player says which thing. */
function itemQuestion(sp, env) {
  const eff = arr(sp.effects).find((e) => {
    const t = lower(e && e.tag);
    return lower(e && e.kind) === 'utility' && (t === 'create-object' || t === 'craft');
  });
  if (!eff) return null;
  if (env.itemChoice) return null;
  const choices = arr(obj(eff.mech).itemChoices).filter((id) => safe(() => !!resolveItem(id), false));
  if (!choices.length) return null;                // fall through to the generic branch
  return {
    ok: false, lines: [], slot: 0, ritual: false,
    text: 'Open the spellbook to choose what it makes.',
    pending: {
      kind: 'item', spellId: sp.id,
      choices: choices.map((id) => ({ id, name: safe(() => resolveItem(id).name, id) })),
    },
  };
}

// ---------------------------------------------------------------------------
// Death, and the price of undoing it
// ---------------------------------------------------------------------------

/**
 * How long ago this character died, in minutes of world time, or null when
 * nobody wrote it down. expireFieldBuffs stamps `ch.diedAt` as the world clock
 * turns; an old save has no stamp, and a missing stamp must not be a refusal —
 * losing a companion permanently to a bookkeeping gap is the worst possible
 * failure mode.
 */
export function deathAge(ch, st) {
  const at = ch && ch.diedAt;
  if (!Number.isFinite(Number(at))) return null;
  return Math.max(0, clockMinutes(st) - Number(at));
}

/** The gem this revival wants, cheapest sufficient stone first. */
const DIAMONDS = [
  { id: 'diamond-dust', gp: 100 },
  { id: 'gem-diamond', gp: 5000 },
];

/** Why this revival cannot happen, as a line of prose, or null if it can. */
function revivalBlock(ch, sp, revival, target, env) {
  if (!target) return 'There is no body here.';
  if (!isDead(target) && target.hp > 0) return `${target.name} is still breathing. Save it.`;
  if (target.kind && target.kind !== 'pc' && target.kind !== 'npc') return 'It was never alive in the way the spell means.';

  const st = env.state || null;
  const age = deathAge(target, st);
  if (age != null && revival.withinMinutes != null && age > revival.withinMinutes) {
    return `${target.name} has been gone too long for ${sp.name}.`;
  }

  const gp = Number(revival.gp) || 0;
  if (gp > 0 && !canPayRevival(gp, env.party)) {
    return `${sp.name} burns ${gp} gp of diamond, and you have neither the stone nor the coin.`;
  }
  return null;
}

/** Is there a stone in the pack, or coin enough to stand in for one? */
function canPayRevival(gp, party) {
  if (!party) return false;
  for (const d of DIAMONDS) {
    if (d.gp >= gp && safe(() => party.hasItem(d.id), false)) return true;
  }
  // diamond-dust is sold in 100 gp twists; enough of them is the same diamond.
  const need = Math.ceil(gp / 100);
  if (safe(() => party.countItem('diamond-dust') >= need, false)) return true;
  return Number(party.gold) >= gp;
}

/** Take the price. Called only after revivalBlock has said it is payable. */
function payRevival(revival, env) {
  const gp = Number(revival.gp) || 0;
  const party = env.party;
  if (!gp || !party) return { text: '' };

  for (const d of DIAMONDS) {
    if (d.gp >= gp && safe(() => party.hasItem(d.id), false)) {
      safe(() => party.removeItem(d.id, 1));
      const nm = safe(() => resolveItem(d.id).name, d.id);
      return { text: `The ${String(nm).toLowerCase()} goes to grey powder in the caster's palm.` };
    }
  }
  const need = Math.ceil(gp / 100);
  if (safe(() => party.countItem('diamond-dust') >= need, false)) {
    safe(() => party.removeItem('diamond-dust', need));
    return { text: `${need} twist${need === 1 ? '' : 's'} of diamond dust, spent and gone.` };
  }
  safe(() => party.spendGold(gp));
  return { text: `${gp} gp of diamond, bought and burnt.` };
}

/** Clear the death bookkeeping so heal() will speak to them again. */
function stripDeath(ch) {
  if (!ch) return;
  ch.deathSaves = { success: 0, fail: 0, stable: false };
  ch.dead = false;
  ch.diedAt = null;
  safe(() => removeCondition(ch, 'dying'));
  safe(() => removeCondition(ch, 'dead'));
  safe(() => removeCondition(ch, 'unconscious'));
}

/**
 * Raise Dead leaves you a shadow of yourself for a tenday: −4 on every d20 test,
 * one point of it back per long rest. Modelled as an ordinary field effect so
 * the same expiry sweep that clears Mage Armor clears this too.
 */
function raisePenalty(target, sp, revival, st) {
  const pen = Number(revival.penalty) || 0;
  if (!pen || !target) return null;
  if (!Array.isArray(target.effects)) target.effects = [];
  const days = lower(sp.id) === 'resurrection' ? 7 : 10;
  target.effects.push({
    id: 'raised-penalty',
    name: 'Newly Raised',
    field: true,
    dur: null,
    until: st ? clockMinutes(st) + days * 1440 : null,
    source: sp.id,
    mech: { atkBonus: pen, saveBonus: pen, initiativeBonus: pen },
  });
  target._mech = null;
  return `${target.name} comes back thin and grey: ${pen} on everything until the body remembers itself.`;
}

// ---------------------------------------------------------------------------
// Cures and companions
// ---------------------------------------------------------------------------

/**
 * A `cure` effect: strip up to `count` of the named conditions, and honour
 * `mech.reduceExhaustion`. Returns the names of what actually lifted, so the
 * log can say "poisoned lifted" rather than "Lesser Restoration takes hold".
 */
function applyCure(target, eff) {
  const out = [];
  if (!target) return out;
  const want = arr(eff.conditions).map(lower);
  const limit = Math.max(1, Number(eff.count) || 1);
  const mech = obj(eff.mech);

  for (const id of want) {
    if (out.length >= limit) break;
    if (id === 'exhaustion') continue;                   // handled below, it has levels
    if (!safe(() => hasCondition(target, id), false)) continue;
    safe(() => removeCondition(target, id));
    out.push(id);
  }

  const byLevel = Math.max(0, Number(mech.reduceExhaustion) || 0)
    || (want.includes('exhaustion') && out.length < limit ? 1 : 0);
  if (byLevel && safe(() => exhaustionLevel(target), 0) > 0) {
    safe(() => reduceExhaustion(target, byLevel));
    out.push('exhaustion');
  }

  // Greater Restoration also undoes what drained you rather than what clings to
  // you: a reduced maximum, a lowered score.
  if (mech.restoreMaxHp && Number(target.maxHpDrain) > 0) { target.maxHpDrain = 0; out.push('a drained constitution'); }
  if (mech.restoreAbilityReduction && target.abilityDrain) { target.abilityDrain = null; out.push('a stolen score'); }

  if (out.length) { target._condMech = null; target._mech = null; }
  return out;
}

/**
 * Find Familiar / Find Steed / Unseen Servant. There is no room on a 25x15
 * tile screen for a fifth sprite, and no combat to put it in, so the companion
 * is carried as a long-lived effect on the caster instead — which is where
 * fieldworld.fieldMech and encounterFactor already look for it.
 */
function applyCompanion(ch, sp, comp, st) {
  if (!ch) return;
  if (!Array.isArray(ch.effects)) ch.effects = [];
  ch.effects = ch.effects.filter((e) => !e || e.id !== comp.id);
  const mins = minutesFor(sp.duration);
  ch.effects.push({
    id: comp.id,
    name: comp.name,
    field: true,
    dur: null,
    // "until dispelled" has no end; an hour of Unseen Servant has one.
    until: mins == null || !st ? null : clockMinutes(st) + mins,
    source: sp.id,
    mech: { ...comp.mech },
  });
  ch._mech = null;
}

/** Charm Person, Suggestion, Friends, Calm Emotions — on whoever you are facing. */
function castCharm(ch, sp, rule, env) {
  const w = obj(env.world);
  if (typeof w.charm !== 'function') {
    return { ok: false, text: 'There is nobody in front of you to work it on.' };
  }
  const res = safe(() => w.charm({
    calm: !!rule.calm,
    minutes: Number(rule.minutes) || 60,
    dc: safe(() => spellDC(ch), 13),
    spellId: sp.id,
    beast: !!rule.beast,
  }), null);
  if (!res || !res.ok) return { ok: false, text: (res && res.text) || 'It finds no purchase.' };
  return { ok: true, text: res.text };
}

/**
 * Roll and apply the spell's heal block. This mirrors what rules/combat.js does
 * for the same spell in a fight — same dice, same scaling, same "does this add
 * the caster's spellcasting modifier" rule — and goes through healTarget so the
 * dying, the stabilised and the dead are treated correctly rather than having
 * their hp poked directly.
 */
function healWith(ctx, caster, target, sp, level, log, opts = {}) {
  const h = obj(sp.heal);
  const dice = safe(() => spellHealDice(sp, level), h.dice) || h.dice || null;
  const rolled = dice ? (safe(() => rollExpr(String(dice), rng).total, 0) || 0) : 0;
  const flat = Number(h.flat) || 0;
  const bonus = h.mod === 'spell'
    ? safe(() => abilityMod(caster, (caster.spells && caster.spells.ability) || 'wis'), 0)
    : 0;
  // Resurrection is authored as `flat: 9999` — "all of it" — which the dice
  // parser cannot express and rollExpr silently returned 0 for.
  const total = Math.max(0, Math.max(rolled, flat) + bonus);
  if (total <= 0) return 0;
  // Revivify, Raise Dead and their betters are the ONLY reason healTarget's
  // `revive` flag exists; without it every one of them printed "beyond
  // healing" and charged the slot anyway.
  const res = safe(() => healTarget(ctx, target, total, { revive: !!opts.revive }), null);
  if (res && Array.isArray(res.log)) log.push(...res.log);
  return res ? res.healed : 0;
}

/**
 * Give the freshly-applied effect a world-clock expiry.
 *
 * combat.js ticks `dur` in rounds; out here nothing does, so a numeric `dur`
 * would simply freeze. We clear it and record `until` in absolute minutes
 * instead — expireFieldBuffs sweeps it, and fieldBuffsToRounds converts it back
 * when a fight starts.
 *
 * `before` is the length of target.effects prior to applyEffect. applyEffect
 * only pushes there for buffs and mech-carrying wards: temp hp and conditions
 * go elsewhere entirely. Without that check this stamped — and mangled — an
 * unrelated effect that happened to be last in the list.
 */
function stampExpiry(target, eff, sp, st, before, applied) {
  if (!target || !st) return;
  const mins = minutesFor(eff.duration || sp.duration);
  const until = mins == null ? null : clockMinutes(st) + mins;

  if (Array.isArray(target.effects) && target.effects.length > before) {
    const inst = target.effects[target.effects.length - 1];
    if (inst) {
      inst.field = true;
      inst.dur = null;                       // no longer ticks per round
      inst.until = until;
      inst.name = inst.name || eff.name || sp.name;
    }
    return;
  }

  // A helpful condition (Invisibility, Heroism's fright immunity). Conditions
  // live in their own list and are ticked by combat's turn boundaries, which
  // never come around out here — so they get the same world-clock treatment.
  if (applied && applied.kind === 'condition' && applied.id) {
    const inst = safe(() => conditionInstance(target, applied.id), null);
    if (inst) {
      inst.field = true;
      inst.dur = null;
      inst.until = until;
    }
  }
}

/**
 * Drop any field buff whose hour has come. Called from the world clock, so a
 * Mage Armor cast at dawn is gone by nightfall whether or not you fought.
 * @returns {string[]} names of the effects that lapsed, for the toast
 */
export function expireFieldBuffs(members, st) {
  const now = clockMinutes(st);
  const gone = [];

  // Charm Person and Calm Emotions live on GameState rather than on a
  // character, because the person they were worked on is an NPC. isCharmed()
  // is clock-aware so nothing breaks without this, but a campaign that never
  // swept them would carry a flag for every townsperson ever charmed into
  // every save file from here to level 20.
  if (st && st.flags) {
    for (const k of Object.keys(st.flags)) {
      if (k.indexOf('charmed:') !== 0 && k.indexOf('calmed:') !== 0) continue;
      const until = Number(st.flags[k]);
      if (Number.isFinite(until) && now >= until) {
        delete st.flags[k];
        if (k.indexOf('charmed:') === 0) gone.push('Someone remembers they never liked you.');
      }
    }
  }

  for (const ch of arr(members)) {
    if (!ch) continue;
    let changed = false;

    // Revivify's one-minute window needs a clock reading at the moment of
    // death, and nothing in the engine took one. This is the only code that
    // runs on the world clock over every party member, alive or not, so it is
    // where the stamp belongs. An unstamped corpse is revivable — see deathAge.
    if (isDead(ch)) { if (!Number.isFinite(Number(ch.diedAt))) ch.diedAt = now; }
    else if (ch.diedAt != null) ch.diedAt = null;

    if (Array.isArray(ch.effects) && ch.effects.length) {
      const before = ch.effects.length;
      ch.effects = ch.effects.filter((e) => {
        if (!e || !e.field || e.until == null) return true;
        if (now < e.until) return true;
        gone.push(`${ch.name}: ${e.name || 'a spell'} fades.`);
        return false;
      });
      changed = changed || ch.effects.length !== before;
    }

    // Conditions applied out of combat expire the same way: nothing else will
    // ever tick them, because their clock is the turn boundary.
    if (Array.isArray(ch.conditions) && ch.conditions.length) {
      for (const c of ch.conditions.slice()) {
        if (!c || !c.field || c.until == null || now < c.until) continue;
        safe(() => removeCondition(ch, c.id, { source: c.source ?? null }));
        gone.push(`${ch.name}: ${c.id} fades.`);
        changed = true;
      }
    }

    if (changed) { ch._mech = null; safe(() => recalc(ch)); }
  }
  return gone;
}

/**
 * Convert field buffs back into round counts as a fight begins, so a ward with
 * two minutes left is worth twenty rounds and one with eight hours is worth the
 * whole battle.
 */
export function fieldBuffsToRounds(ch, st) {
  if (!ch) return;
  const now = clockMinutes(st);
  const convert = (e) => {
    if (!e || !e.field) return;
    if (e.until == null) { e.dur = null; return; }
    e.dur = Math.max(1, Math.round((e.until - now) * 10));
  };
  if (Array.isArray(ch.effects)) for (const e of ch.effects) convert(e);
  if (Array.isArray(ch.conditions)) for (const c of ch.conditions) convert(c);
}

// ---------------------------------------------------------------------------
// World verbs
// ---------------------------------------------------------------------------

/**
 * The handful of effects that have to reach outside the character sheet. The
 * overworld hands in `env.world` with the hooks it can service; anything it
 * cannot do simply reports what the spell achieved in prose, which is still
 * more than the spellbook managed before.
 */
function castWorldEffect(ch, sp, eff, env) {
  const w = obj(env.world);
  const tag = lower(eff.tag);
  const mech = obj(eff.mech);
  const said = (ok, text) => ({ ok, text });

  switch (tag) {
    case 'light': {
      const r = Number(mech.lightRadius) || 20;
      if (typeof w.light === 'function') safe(() => w.light(r, sp.id, minutesFor(sp.duration), mech));
      return said(true, `A ${r}-foot pool of light follows ${ch.name}.`);
    }
    case 'unlock': {
      const done = typeof w.unlock === 'function' ? safe(() => w.unlock(), null) : null;
      if (done && done.ok) return said(true, done.text || 'The lock springs open with a loud metallic knock.');
      return said(false, (done && done.text) || 'Nothing within reach is locked.');
    }
    case 'detect-magic': {
      // Detect Magic is the party's other half of the identify loop: it names
      // everything unidentified in the pack as well as everything glowing in
      // the room. Both halves count as "it did something".
      const named = typeof w.identify === 'function' ? safe(() => w.identify(true), null) : null;
      const found = typeof w.detect === 'function' ? safe(() => w.detect('magic'), null) : null;
      const bits = [];
      if (found && found.count) bits.push(`${found.count} enchanted thing${found.count === 1 ? '' : 's'} nearby`);
      if (named && named.ok && named.count) bits.push(`${named.count} in your own pack`);
      if (bits.length) return said(true, `The Weave answers: ${bits.join(', ')}.`);
      // Learning that there is nothing here IS the answer a divination gives,
      // so this one has done its job even when the count is zero.
      return said(true, 'Nothing nearby carries an enchantment.');
    }
    case 'sunlight': {
      // Sunbeam and Sunburst are attack spells, so fieldRole refuses them out
      // here; the branch exists so that a sunlight effect on anything else —
      // an item, a scroll, a future spell — lights the cave rather than
      // dropping through to `default` and being silently ignored.
      const r = Number(mech.lightRadius) || 60;
      if (typeof w.light === 'function') safe(() => w.light(r, sp.id, minutesFor(sp.duration), { dispelsDarkness: true }));
      return said(true, `Daylight, real daylight, ${r} feet of it.`);
    }
    case 'create-item':
    case 'rations':
    case 'create-object':
    case 'craft':
    case 'potion-cauldron': {
      // Spell data names the fiction ('goodberry'); the catalogue names the
      // item ('goodberry-preserve'). Try the player's pick, then the spell's
      // id, then the nearest thing the pack can actually hold, rather than
      // silently conjuring nothing.
      const wanted = [env.itemChoice, mech.itemId, mech.item, `${mech.itemId}-preserve`].filter(Boolean);
      const qty = Math.max(1, Number(env.itemQty) || Number(mech.qty) || 1);
      const party = env.party;
      if (!party || typeof party.addItem !== 'function') return said(false, 'The conjuring will not hold.');
      for (const id of wanted) {
        if (!safe(() => !!resolveItem(id), false)) continue;
        // A conjured thing is not treasure and is never a mystery: the caster
        // made it and knows exactly what it is.
        if (!safe(() => party.addItem(id, qty, { identified: true }), false)) continue;
        const nm = safe(() => resolveItem(id).name, null) || String(id).replace(/-/g, ' ');
        return said(true, qty === 1 ? `${nm}, out of nothing at all.` : `${qty} ${nm} out of nothing at all.`);
      }
      return said(false, 'The conjuring will not hold.');
    }
    case 'telekinesis': {
      // `w.reach` wants a RANGE in tiles. It used to be handed `carryLimit`,
      // which is Mage Hand's ten POUNDS — a different quantity in different
      // units that happened to be a plausible-looking number. The spell's own
      // range is the right answer: 30 ft for Mage Hand, 60 for Telekinesis.
      const done = typeof w.reach === 'function' ? safe(() => w.reach(rangeTiles(sp, 6)), null) : null;
      if (done && done.ok) return said(true, done.text || 'The spectral hand fetches it back.');
      return said(false, 'The spectral hand drifts, finds nothing worth fetching, and fades.');
    }

    // --- locks, traps, wards ------------------------------------------------
    case 'lock': {
      const done = typeof w.lock === 'function' ? safe(() => w.lock(Number(mech.dcBonus) || 10), null) : null;
      if (done && done.ok) return said(true, done.text);
      return said(false, (done && done.text) || 'There is nothing here to lock.');
    }
    case 'trap': {
      // Glyph of Warding out of combat is the party's own trap: it wards the
      // ground they are standing on. Failing that, it finds somebody else's.
      const done = wardHook(w, minutesFor(sp.duration) || 480);
      if (done && done.ok) return said(true, 'A glyph burns itself into the flagstones and waits.');
      // Failing that, Glyph of Warding read backwards is Find Traps: it names
      // somebody else's ward, and the party's picks get a go at it.
      const found = trapHook(w, rangeTiles(sp, 8));
      if (found && found.ok) return said(true, found.text);
      return said(false, (found && found.text) || 'The glyph will not take here.');
    }
    case 'ward-area':
    case 'alarm': {
      const done = wardHook(w, minutesFor(sp.duration) || 480);
      if (done && done.ok) return said(true, done.text);
      return said(true, 'A thread of the Weave stretches across every approach.');
    }
    case 'extradimensional':
    case 'demiplane':
    case 'hide-in-stone': {
      const mins = minutesFor(sp.duration) || 480;
      const name = tag === 'hide-in-stone' ? 'the stone itself'
        : tag === 'demiplane' ? 'a room that is nowhere' : `${sp.name}`;
      const done = typeof w.sanctuary === 'function' ? safe(() => w.sanctuary(mins, name), null) : null;
      if (done && done.ok) return said(true, done.text);
      return said(true, `${sp.name} opens, and nothing on this map can follow you in.`);
    }

    // --- the world-scale terrain spells --------------------------------------
    // Four spells that reshape more of the world than a battlefield holds. Each
    // one lands on real state through rules/fieldworld.js and refuses — costing
    // nothing — when there is no world under the caster to change.
    case 'weather': {
      // Control Weather. `env.weatherChoice` is optional: with no answer the
      // spell clears a foul sky, or calls fog over a fine one.
      if (typeof w.weather !== 'function') return said(false, 'There is no sky here to answer you.');
      const done = safe(() => w.weather(env.weatherChoice || null, mech, minutesFor(sp.duration) || 480), null);
      if (done && done.ok) return { ok: true, text: done.text, minutes: Number(done.minutes) || 0 };
      return said(false, (done && done.text) || 'The sky does not answer.');
    }
    case 'wards': {
      // Guards and Wards: a day's worth of stronghold that hates visitors.
      const mins = minutesFor(sp.duration) || 1440;
      const done = typeof w.wardIntrusion === 'function' ? safe(() => w.wardIntrusion(mins), null) : null;
      if (done && done.ok) return { ok: true, text: done.text, minutes: 10 };
      return said(false, (done && done.text) || 'There is nothing here worth warding — no doors, no stairs, no walls.');
    }
    case 'reshape-earth': {
      // Move Earth cannot redraw the tiles, so it does the thing the fiction
      // actually buys you: the next stretch of road is graded, and the party
      // crosses it without being stopped half so often.
      const mins = minutesFor(sp.duration) || 60;
      const done = typeof w.easeTravel === 'function' ? safe(() => w.easeTravel(mins), null) : null;
      if (done && done.ok) return { ok: true, text: done.text, minutes: 0 };
      return said(false, (done && done.text) || 'There is no ground here worth reshaping.');
    }
    case 'mirage': {
      // Mirage Arcane dresses a square mile as something else. What that is
      // worth on this scale is that nothing can find the party in it.
      const mins = (Number(mech.days) || 0) * 1440 || minutesFor(sp.duration) || 1440;
      const done = typeof w.maskTerrain === 'function' ? safe(() => w.maskTerrain(mins), null) : null;
      if (done && done.ok) return { ok: true, text: done.text, minutes: 10 };
      return said(false, (done && done.text) || 'There is no country here to lie about.');
    }

    // --- detection and divination -------------------------------------------
    case 'detect': {
      // detect-evil-and-good names the types it is looking for in its own mech.
      const what = arr(mech.detectTypes).length ? arr(mech.detectTypes) : 'evil';
      const found = typeof w.detect === 'function' ? safe(() => w.detect(what, radiusTiles(sp, 6)), null) : null;
      if (found && found.count) {
        return said(true, `Something not of this world is close: ${found.bearing || 'very close'}.`);
      }
      return said(true, 'Nothing unholy, nothing celestial, nothing that does not belong.');
    }
    case 'locate': {
      const what = lower(sp.id) === 'locate-creature' ? 'creature' : 'object';
      const done = typeof w.locate === 'function'
        ? safe(() => w.locate(what, minutesFor(sp.duration) || 10), null) : null;
      if (done && done.ok) return said(true, done.text);
      return said(false, (done && done.text) || 'Nothing of the kind answers within a thousand feet.');
    }
    case 'remote-sense':
    case 'scout':
    case 'scry':
    case 'pathfinding':
    case 'survey-land': {
      // All five are the same verb at different ranges: the fog lifts. Find the
      // Path and Commune with Nature take in the whole map; the rest a circle.
      const all = tag === 'pathfinding' || tag === 'survey-land';
      const r = tag === 'scry' ? 20 : tag === 'scout' ? 16 : 12;
      const n = typeof w.reveal === 'function' ? Number(safe(() => w.reveal(r, all), 0)) || 0 : 0;
      if (n > 0) {
        return said(true, all
          ? `The land lays itself out: ${n} new squares of it.`
          : `The sensor drifts out and back. ${n} squares you had not seen.`);
      }
      // Knowing there is nothing left to find IS what a divination tells you.
      return said(true, 'The sensor finds only ground you already know.');
    }
    case 'omen':
    case 'divine-answer':
    case 'lore': {
      const voice = tag === 'divine-answer' ? 'The god answers'
        : tag === 'lore' ? 'The old tale runs' : 'The omen';
      const done = typeof w.omen === 'function' ? safe(() => w.omen({ voice }), null) : null;
      if (done && done.ok) return said(true, done.text);
      return said(true, `${voice}, and says nothing you did not already know.`);
    }
    case 'read-mind':
    case 'interrogate-corpse': {
      const done = typeof w.readMind === 'function' ? safe(() => w.readMind(tag), null) : null;
      if (done && done.ok) return said(true, done.text);
      return said(false, (done && done.text) || 'No mind answers.');
    }
    case 'identify-item':
    case 'identify': {
      // The ritual names one object; Detect Magic sweeps the whole pack.
      const done = typeof w.identify === 'function' ? safe(() => w.identify(false), null) : null;
      if (done && done.ok) return said(true, done.text || 'It gives up its name.');
      return said(false, (done && done.text) || 'Nothing in the pack is a mystery.');
    }
    case 'repair':
    case 'mend': {
      const n = typeof w.repair === 'function' ? Number(safe(() => w.repair(), 0)) || 0 : 0;
      if (n > 0) return said(true, `${n} broken thing${n === 1 ? '' : 's'} made whole.`);
      return said(true, 'The crack closes and the seam disappears.');
    }

    // --- the flavour cantrips, which cost nothing and should still do something
    case 'trick':
      return said(true, `${ch.name} cleans the road off every cloak in the party, and warms the water.`);
    case 'nature-trick': {
      const wx = String((obj(env.state).weather) || 'clear');
      return said(true, `${ch.name} reads the sky: ${weatherOmen(wx)}`);
    }
    case 'divine-trick':
      return said(true, `${ch.name} makes the ground speak with a noise like a closing tomb. Anyone nearby looks up.`);
    case 'elemental-trick':
      return said(true, `A handful of flame, a fistful of wind, and the campfire catches first time.`);
    case 'whisper':
    case 'message': {
      const who = (env.party && arr(env.party.members)[0]) || null;
      const name = (who && who.name) || 'the one you are thinking of';
      return said(true, tag === 'whisper'
        ? `${ch.name} whispers, and only ${name} hears it.`
        : `Twenty-five words find ${name} wherever they are, and twenty-five come back.`);
    }
    case 'stabilize':
      return said(true, 'The bleeding stops. They will see the morning.');
    case 'speak-beasts': {
      // Records real state now. The spell used to print this line and change
      // nothing, so a beast was exactly as talkative with it up as without —
      // which is the entire spell. ui/dialogue.js reads the flag through
      // fieldworld's speakingWithAnimals() to decide whether an animal is
      // watched or actually answers. Written here rather than through a
      // fieldworld helper because fieldworld imports the clock from THIS
      // module, and the reverse import would close a cycle.
      const st = env.state || null;
      if (st) {
        st.flags = st.flags || {};
        st.flags.speakBeasts = { until: clockMinutes(st) + Math.max(1, minutesFor(sp.duration) || 10) };
      }
      return said(true, 'Every bird and beast within earshot becomes, briefly, a person worth talking to.');
    }
    case 'courier':
      return said(true, 'A sparrow takes the message, and the sparrow knows the way.');
    case 'preserve-corpse':
      return said(true, 'The body will keep. Ten days, and no rot in it.');
    case 'translate':
    case 'comprehend':
      return said(true, `Every script and every tongue the party meets makes sense for the next hour.`);

    // Flavour verbs with no world state behind them yet. They still cost the
    // slot, because in the fiction they still happen.
    case 'purify':
    case 'water':
    case 'clean':
    case 'disguise':
      return said(true, `${sp.name} takes hold.`);
    default:
      return null;
  }
}

/**
 * The overworld and rules/fieldworld.js do not spell every hook the same way
 * — `ward` there is `alarm` here, `trap` there is `findTraps` plus `disarm`.
 * Rather than pick a winner and break whichever scene is on the other side of
 * the argument, try both names and fall through to prose when neither exists.
 * A rest screen and the title screen still hand in `{}`.
 */
function wardHook(w, minutes) {
  const fn = typeof w.ward === 'function' ? w.ward : typeof w.alarm === 'function' ? w.alarm : null;
  return fn ? safe(() => fn(minutes), null) : null;
}

function trapHook(w, range) {
  const find = typeof w.findTraps === 'function' ? w.findTraps
    : typeof w.trap === 'function' ? w.trap : null;
  if (!find) return null;
  const found = safe(() => find(range), null);
  if (!found || !found.ok) return found;
  // Some hook bundles find the trap but leave the disarming to a second verb.
  if (typeof w.disarm === 'function' && !found.disarmed) {
    const off = safe(() => w.disarm(found.target || null), null);
    if (off && off.text) return { ...found, text: `${found.text} ${off.text}` };
  }
  return found;
}

/** A sphere/area spell's radius in tiles, floored at something useful. */
function radiusTiles(sp, fallback) {
  const r = Number(obj(sp.target).radius);
  if (!Number.isFinite(r) || r <= 0) return fallback;
  return Math.max(2, Math.round(r / 5));
}

/** A spell's own range in tiles. 'self'/'touch' are one square. */
function rangeTiles(sp, fallback) {
  const r = obj(sp).range;
  if (r === 'self' || r === 'touch') return 1;
  const feet = Number(r);
  if (!Number.isFinite(feet) || feet <= 0) return fallback;
  return Math.max(1, Math.round(feet / 5));
}

/** Druidcraft's forecast, read off the world's real weather. */
function weatherOmen(w) {
  switch (lower(w)) {
    case 'rain': return 'rain before the hour is out, and it will not be brief.';
    case 'storm': return 'a storm coming up off the Sword Coast. Find walls.';
    case 'snow': return 'snow by evening, and the trail will be gone under it.';
    case 'fog': return 'the fog will not lift till the sun is well up.';
    case 'wind': return 'wind out of the west all day. Hold your hat.';
    default: return 'clear. Whatever else the day brings, it will not be weather.';
  }
}
