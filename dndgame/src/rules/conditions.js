// rules/conditions.js — the D&D 2024 condition system plus the game's own status
// effects (burning, blessed, hasted, dying…).
//
// Design contract:
//   * Conditions live on `ch.conditions` as instances:
//         { id, dur, source, save:{ab,dc,end}, level?, data?, spellId?, applied? }
//     `dur` counts ROUNDS. `null` means "until something removes it".
//   * character.js deliberately does NOT merge condition mech blocks into mechOf(),
//     so nothing is ever applied twice. Everything that needs to know what a
//     creature's conditions do calls `conditionMech(ch)` — one flat flags object
//     that rules/actions.js reads when it resolves an attack, save or check.
//   * Headless. No DOM, no canvas. All randomness through core/dice.js.
//
// 2024 PHB notes that matter here:
//   - Exhaustion is now a single scaling condition: each of its six levels gives a
//     cumulative -2 penalty to every D20 Test and -5 ft of Speed. Level 6 is death.
//   - Advantage/disadvantage from conditions never stacks; one source is enough.
//   - Several conditions *include* others (Paralyzed includes Incapacitated,
//     Unconscious includes Incapacitated and Prone). We fold the included rules
//     straight into each mech block and record `includes` so `hasCondition()` can
//     answer "is this creature Incapacitated?" correctly.

import { rng } from '../core/rng.js';
import { d20, rollExpr } from '../core/dice.js';
import { bus, EV } from '../core/events.js';
import { clamp } from '../constants.js';
import { ABILITIES } from './abilities.js';
import { damage as dealDamage, saveMod, isDead } from './character.js';
import { breakConcentration, isConcentrating } from './spellcasting.js';

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------

const arr = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const lower = (s) => String(s || '').toLowerCase();

function deepFreeze(o) {
  if (!o || typeof o !== 'object' || Object.isFrozen(o)) return o;
  Object.freeze(o);
  for (const k of Object.keys(o)) deepFreeze(o[k]);
  return o;
}

/** Rounds a written duration lasts. 1 round = 6 seconds. `null` = indefinite. */
export function roundsFor(duration) {
  if (duration == null) return null;
  if (typeof duration === 'number') return Math.max(0, Math.round(duration));
  const s = lower(duration).trim();
  const table = {
    instant: 0, instantaneous: 0,
    '1 round': 1, 'one round': 1, round: 1,
    '1 minute': 10, 'one minute': 10, minute: 10,
    '10 minutes': 100, '1 hour': 600, 'one hour': 600, hour: 600,
    '8 hours': 4800, '24 hours': 14400, '1 day': 14400,
    'until dispelled': null, permanent: null, special: null,
  };
  if (s in table) return table[s];
  const m = s.match(/^(\d+)\s*(round|minute|min|hour|hr|day)s?$/);
  if (m) {
    const n = parseInt(m[1], 10);
    const per = { round: 1, minute: 10, min: 10, hour: 600, hr: 600, day: 14400 }[m[2]] || 1;
    return n * per;
  }
  return null;
}

// ---------------------------------------------------------------------------
// THE FIFTEEN 2024 PHB CONDITIONS
// ---------------------------------------------------------------------------
//
// `duration` describes the semantics, not a number of rounds:
//   kind    'permanent'  lasts until removed by an effect
//           'rounds'     ticks down; `rounds` is the default if none is given
//           'save-ends'  the creature repeats a save (see `save`)
//           'until-rest' cleared by a long rest
//           'special'    the effect that made it owns its own end condition
//   endsOn  'turn-start' | 'turn-end' | 'source-turn-end' — which boundary
//           decrements `dur`. Defaults to the affected creature's turn end.

const PHB = {

  blinded: {
    id: 'blinded', name: 'Blinded', group: 'phb', icon: 'eye-off', color: '#6f6a86',
    desc: "You can't see and automatically fail any ability check that requires sight. "
      + 'Attack rolls against you have Advantage, and your attack rolls have Disadvantage.',
    includes: [],
    duration: { kind: 'rounds', rounds: null, endsOn: 'turn-end', save: null },
    mech: {
      cannotSee: true,
      autoFailChecks: ['sight'],
      attackedAdv: true,
      attackDis: true,
    },
  },

  charmed: {
    id: 'charmed', name: 'Charmed', group: 'phb', icon: 'heart', color: '#e28ad0',
    desc: "You can't attack the charmer or target the charmer with damaging abilities or "
      + 'magical effects. The charmer has Advantage on any ability check to interact with you socially.',
    includes: [],
    duration: { kind: 'save-ends', rounds: null, endsOn: 'turn-end', save: { ability: 'wis', end: 'turn-end' } },
    mech: {
      // The source uid is filled in per-instance from `source`, so a creature charmed
      // by two different foes cannot attack either of them.
      cannotTargetSource: true,
      socialAdvForSource: true,
    },
  },

  deafened: {
    id: 'deafened', name: 'Deafened', group: 'phb', icon: 'ear-off', color: '#6f7a86',
    desc: "You can't hear and automatically fail any ability check that requires hearing.",
    includes: [],
    duration: { kind: 'rounds', rounds: null, endsOn: 'turn-end', save: null },
    mech: { cannotHear: true, autoFailChecks: ['hearing'] },
  },

  exhaustion: {
    id: 'exhaustion', name: 'Exhaustion', group: 'phb', icon: 'skull-half', color: '#8a7a5a',
    desc: 'You have one or more levels of Exhaustion. Each level gives a cumulative -2 penalty '
      + 'to every D20 Test you make and reduces your Speed by 5 feet. At level 6 you die. '
      + 'Finishing a long rest removes one level.',
    includes: [],
    stacking: 'levels', maxLevel: 6,
    duration: { kind: 'until-rest', rounds: null, endsOn: null, save: null },
    // The real numbers come from exhaustionMech(level); this block is the level-1 case
    // so anything reading CONDITIONS.exhaustion.mech naively still gets sane values.
    mech: { d20Penalty: -2, speedBonus: -5, exhaustion: 1 },
    levels: [
      { level: 1, desc: '-2 to D20 Tests, Speed -5 ft.' },
      { level: 2, desc: '-4 to D20 Tests, Speed -10 ft.' },
      { level: 3, desc: '-6 to D20 Tests, Speed -15 ft.' },
      { level: 4, desc: '-8 to D20 Tests, Speed -20 ft.' },
      { level: 5, desc: '-10 to D20 Tests, Speed -25 ft.' },
      { level: 6, desc: 'Death.' },
    ],
  },

  frightened: {
    id: 'frightened', name: 'Frightened', group: 'phb', icon: 'fear', color: '#9a5fd0',
    desc: 'You have Disadvantage on ability checks and attack rolls while the source of your '
      + "fear is within line of sight, and you can't willingly move closer to it.",
    includes: [],
    duration: { kind: 'save-ends', rounds: 10, endsOn: 'turn-end', save: { ability: 'wis', end: 'turn-end' } },
    mech: {
      attackDis: true,
      disOnAbilityChecks: true,
      cannotApproachSource: true,
    },
  },

  grappled: {
    id: 'grappled', name: 'Grappled', group: 'phb', icon: 'grab', color: '#b0803a',
    desc: "Your Speed is 0 and can't increase. You have Disadvantage on attack rolls against any "
      + 'target other than the grappler. The grappler can drag or carry you when it moves, but every '
      + 'foot of movement costs it 1 extra foot unless you are Tiny or two or more sizes smaller. '
      + 'The condition ends if the grappler is Incapacitated, or if an effect moves you out of its reach.',
    includes: [],
    duration: { kind: 'special', rounds: null, endsOn: null, save: null },
    mech: {
      speed: 0, immobile: true,
      attackDisVsOthers: true,   // resolved against the instance's `source`
      movable: true,
    },
  },

  incapacitated: {
    id: 'incapacitated', name: 'Incapacitated', group: 'phb', icon: 'stun', color: '#c0603a',
    desc: "You can't take any action, Bonus Action, or Reaction. Your Concentration is broken. "
      + "You can't speak. If you're Surprised, you can roll Initiative but nothing else on that turn.",
    includes: [],
    duration: { kind: 'rounds', rounds: 1, endsOn: 'turn-end', save: null },
    mech: {
      noActions: true, noBonusActions: true, noReactions: true,
      dropsConcentration: true, cannotConcentrate: true, cannotSpeak: true,
      incapacitated: true,
    },
  },

  invisible: {
    id: 'invisible', name: 'Invisible', group: 'phb', icon: 'ghost', color: '#9fd6e8',
    desc: 'You are Concealed: you cannot be seen and are unaffected by effects that require their '
      + 'target to be seen, and anything you carry is concealed too. If you are Invisible when you '
      + 'roll Initiative you have Advantage on the roll. Attack rolls against you have Disadvantage '
      + 'and your attack rolls have Advantage — unless the attacker can somehow see you.',
    includes: [],
    duration: { kind: 'rounds', rounds: 10, endsOn: 'turn-end', save: null },
    mech: {
      invisible: true, unseen: true, concealed: true,
      attackAdv: true, attackedDis: true, initiativeAdv: true,
    },
  },

  paralyzed: {
    id: 'paralyzed', name: 'Paralyzed', group: 'phb', icon: 'chains', color: '#5aa8ff',
    desc: "You have the Incapacitated condition. Your Speed is 0 and can't increase. You "
      + 'automatically fail Strength and Dexterity saving throws. Attack rolls against you have '
      + 'Advantage, and any attack roll that hits you is a Critical Hit if the attacker is within 5 feet.',
    includes: ['incapacitated'],
    duration: { kind: 'save-ends', rounds: 10, endsOn: 'turn-end', save: { ability: 'con', end: 'turn-end' } },
    mech: {
      incapacitated: true, noActions: true, noBonusActions: true, noReactions: true,
      dropsConcentration: true, cannotConcentrate: true, cannotSpeak: true,
      speed: 0, immobile: true,
      autoFailSaves: ['str', 'dex'],
      attackedAdv: true, advOnAttacksAgainst: true,
      incomingCritWithin5: true, autoCritMelee: true,
    },
  },

  petrified: {
    id: 'petrified', name: 'Petrified', group: 'phb', icon: 'stone', color: '#8f8f8f',
    desc: 'You and your possessions are turned into an inanimate substance, usually stone. Your weight '
      + 'is multiplied by ten and you cease aging. You have the Incapacitated condition, your Speed is 0, '
      + 'and you are unaware of your surroundings. Attack rolls against you have Advantage. You '
      + 'automatically fail Strength and Dexterity saving throws. You have Resistance to all damage and '
      + 'Immunity to the Poisoned condition — poison already in your system is suspended, not neutralised.',
    includes: ['incapacitated'],
    duration: { kind: 'permanent', rounds: null, endsOn: null, save: null },
    mech: {
      incapacitated: true, noActions: true, noBonusActions: true, noReactions: true,
      dropsConcentration: true, cannotConcentrate: true, cannotSpeak: true,
      cannotSee: true, unaware: true,
      speed: 0, immobile: true,
      autoFailSaves: ['str', 'dex'],
      attackedAdv: true, advOnAttacksAgainst: true,
      dmgTakenMult: 0.5, resist: ['all'],
      condImmune: ['poisoned'],
    },
  },

  poisoned: {
    id: 'poisoned', name: 'Poisoned', group: 'phb', icon: 'poison', color: '#7fbf6a',
    desc: 'You have Disadvantage on attack rolls and ability checks.',
    includes: [],
    duration: { kind: 'save-ends', rounds: 10, endsOn: 'turn-end', save: { ability: 'con', end: 'turn-end' } },
    mech: { attackDis: true, disOnAbilityChecks: true },
  },

  prone: {
    id: 'prone', name: 'Prone', group: 'phb', icon: 'down', color: '#a0763a',
    desc: 'Your only movement options are to crawl — each foot of movement costs 1 extra foot — or to '
      + 'spend an amount of movement equal to half your Speed to stand up, ending the condition. You have '
      + 'Disadvantage on attack rolls. An attack roll against you has Advantage if the attacker is within '
      + '5 feet, and Disadvantage otherwise.',
    includes: [],
    duration: { kind: 'special', rounds: null, endsOn: null, save: null },
    mech: {
      prone: true, crawlOnly: true,
      attackDis: true,
      attackedAdvWithin5: true, attackedDisBeyond5: true,
    },
  },

  restrained: {
    id: 'restrained', name: 'Restrained', group: 'phb', icon: 'net', color: '#7a6a3a',
    desc: "Your Speed is 0 and can't increase. Attack rolls against you have Advantage, and your attack "
      + 'rolls have Disadvantage. You have Disadvantage on Dexterity saving throws.',
    includes: [],
    duration: { kind: 'save-ends', rounds: 10, endsOn: 'turn-end', save: { ability: 'str', end: 'turn-end' } },
    mech: {
      speed: 0, immobile: true,
      attackedAdv: true, advOnAttacksAgainst: true,
      attackDis: true,
      saveDis: ['dex'],
    },
  },

  stunned: {
    id: 'stunned', name: 'Stunned', group: 'phb', icon: 'stars', color: '#ffd24a',
    desc: 'You have the Incapacitated condition and can speak only falteringly. Your Speed is 0 and '
      + "can't increase. You automatically fail Strength and Dexterity saving throws. Attack rolls "
      + 'against you have Advantage.',
    includes: ['incapacitated'],
    duration: { kind: 'save-ends', rounds: 1, endsOn: 'turn-end', save: { ability: 'con', end: 'turn-end' } },
    mech: {
      incapacitated: true, noActions: true, noBonusActions: true, noReactions: true,
      dropsConcentration: true, cannotConcentrate: true, cannotSpeak: 'falter',
      speed: 0, immobile: true,
      autoFailSaves: ['str', 'dex'],
      attackedAdv: true, advOnAttacksAgainst: true,
    },
  },

  unconscious: {
    id: 'unconscious', name: 'Unconscious', group: 'phb', icon: 'sleep', color: '#4a4a6a',
    desc: 'You have the Incapacitated and Prone conditions, and you drop whatever you are holding. Your '
      + "Speed is 0 and can't increase. You are unaware of your surroundings. You automatically fail "
      + 'Strength and Dexterity saving throws. Attack rolls against you have Advantage, and any attack '
      + 'roll that hits you is a Critical Hit if the attacker is within 5 feet.',
    includes: ['incapacitated', 'prone'],
    duration: { kind: 'special', rounds: null, endsOn: null, save: null },
    mech: {
      incapacitated: true, noActions: true, noBonusActions: true, noReactions: true,
      dropsConcentration: true, cannotConcentrate: true, cannotSpeak: true,
      cannotSee: true, unaware: true,
      prone: true, dropsHeld: true,
      speed: 0, immobile: true,
      autoFailSaves: ['str', 'dex'],
      attackedAdv: true, advOnAttacksAgainst: true,
      incomingCritWithin5: true, autoCritMelee: true,
    },
  },
};

// ---------------------------------------------------------------------------
// GAME-LAYER CONDITIONS
// Statuses the engine needs that aren't PHB conditions: damage-over-time, buffs
// the UI wants an icon for, and the down/dying bookkeeping.
// ---------------------------------------------------------------------------

const GAME = {

  burning: {
    id: 'burning', name: 'Burning', group: 'game', icon: 'fire', color: '#ff6a2a',
    desc: 'Flames cling to you. You take 1d4 fire damage at the start of each of your turns. '
      + 'You (or an adjacent creature) can use an Action to smother the flames, and total immersion '
      + 'in water ends it instantly.',
    includes: [],
    duration: { kind: 'save-ends', rounds: 3, endsOn: 'turn-end', save: { ability: 'dex', end: 'turn-end' } },
    mech: { tickDamage: [{ dice: '1d4', type: 'fire', when: 'turn-start' }], burning: true },
    endedBy: ['cold', 'water'],
  },

  bleeding: {
    id: 'bleeding', name: 'Bleeding', group: 'game', icon: 'blood', color: '#c0303a',
    desc: 'An open wound is costing you blood. You take 1d4 piercing damage at the start of each of your '
      + 'turns. Any magical healing, or a successful DC 10 Medicine check, ends it.',
    includes: [],
    duration: { kind: 'save-ends', rounds: 3, endsOn: 'turn-end', save: { ability: 'con', end: 'turn-end' } },
    mech: { tickDamage: [{ dice: '1d4', type: 'piercing', when: 'turn-start' }], bleeding: true },
    endedBy: ['healing'],
  },

  frozen: {
    id: 'frozen', name: 'Frozen', group: 'game', icon: 'ice', color: '#9fd6e8',
    desc: 'Rime locks your joints. Your Speed is halved, you have Disadvantage on Dexterity saving '
      + 'throws, and you are Vulnerable to bludgeoning damage until the ice is shattered.',
    includes: [],
    duration: { kind: 'save-ends', rounds: 2, endsOn: 'turn-end', save: { ability: 'con', end: 'turn-end' } },
    mech: { speedMult: 0.5, saveDis: ['dex'], vuln: ['bludgeoning'] },
  },

  marked: {
    id: 'marked', name: 'Marked', group: 'game', icon: 'target', color: '#d04a4a',
    desc: "A hunter's sigil hangs over you. The creature that marked you deals an extra 1d6 damage "
      + 'whenever it hits you with an attack, and has Advantage on checks made to find you.',
    includes: [],
    duration: { kind: 'concentration', rounds: 100, endsOn: 'turn-end', save: null },
    mech: {
      // `fromSource:true` means the rider only applies to attacks made by the instance's `source`.
      bonusDamage: [{ dice: '1d6', type: 'force', fromSource: true }],
      findAdvForSource: true, marked: true,
    },
  },

  blessed: {
    id: 'blessed', name: 'Blessed', group: 'game', icon: 'sun', color: '#ffe9a6',
    desc: 'A god\'s favour rides with you. Add 1d4 to every attack roll and saving throw you make.',
    includes: [],
    duration: { kind: 'concentration', rounds: 10, endsOn: 'turn-end', save: null },
    mech: { attackBonusDice: ['1d4'], saveBonusDice: ['1d4'] },
  },

  hasted: {
    id: 'hasted', name: 'Hasted', group: 'game', icon: 'bolt', color: '#ffd24a',
    desc: 'Your Speed is doubled, you gain a +2 bonus to AC, you have Advantage on Dexterity saving '
      + 'throws, and you gain an extra action each turn usable for Attack, Dash, Disengage, Hide or Utilize. '
      + "When the spell ends you can't move or take actions until after your next turn.",
    includes: [],
    duration: { kind: 'concentration', rounds: 10, endsOn: 'turn-end', save: null },
    mech: { speedMult: 2, acBonus: 2, saveAdv: ['dex'], extraAction: 1, hasted: true },
    onEnd: 'lethargic',
  },

  lethargic: {
    id: 'lethargic', name: 'Lethargic', group: 'game', icon: 'snail', color: '#7a6a86',
    desc: "The rush is gone. You can't move or take actions until after your next turn.",
    includes: [],
    duration: { kind: 'rounds', rounds: 1, endsOn: 'turn-end', save: null },
    mech: { noActions: true, noBonusActions: true, speed: 0, immobile: true },
  },

  slowed: {
    id: 'slowed', name: 'Slowed', group: 'game', icon: 'snail', color: '#6a7a9a',
    desc: 'Your Speed is halved, you take a -2 penalty to AC and Dexterity saving throws, you cannot take '
      + 'Reactions, and on your turn you can use either an action or a Bonus Action, not both.',
    includes: [],
    duration: { kind: 'save-ends', rounds: 10, endsOn: 'turn-end', save: { ability: 'wis', end: 'turn-end' } },
    mech: {
      speedMult: 0.5, acBonus: -2, savePenaltyBy: { dex: -2 },
      noReactions: true, actionOrBonusOnly: true,
    },
  },

  'slow-mastery': {
    id: 'slow-mastery', name: 'Slowed (Mastery)', group: 'game', icon: 'snail', color: '#6a7a9a',
    desc: 'A crushing blow has cost you 10 feet of Speed until the start of your attacker\'s next turn.',
    includes: [],
    duration: { kind: 'rounds', rounds: 1, endsOn: 'source-turn-end', save: null },
    mech: { speedBonus: -10 },
  },

  hexed: {
    id: 'hexed', name: 'Hexed', group: 'game', icon: 'hex', color: '#8a3ad0',
    desc: 'A curse-sign burns above you. The caster deals an extra 1d6 necrotic damage when it hits you, '
      + 'and you have Disadvantage on ability checks made with the chosen ability.',
    includes: [],
    duration: { kind: 'concentration', rounds: 100, endsOn: 'turn-end', save: null },
    mech: {
      bonusDamage: [{ dice: '1d6', type: 'necrotic', fromSource: true }],
      disCheckAbility: true, hexed: true,
    },
  },

  cursed: {
    id: 'cursed', name: 'Cursed', group: 'game', icon: 'curse', color: '#5a2a6a',
    desc: 'Ill luck dogs every step. You have Disadvantage on attack rolls and on ability checks and '
      + 'saving throws made with the cursed ability. A long rest will not lift it — only Remove Curse will.',
    includes: [],
    duration: { kind: 'permanent', rounds: null, endsOn: null, save: null },
    mech: { attackDis: true, disOnAbilityChecks: true, cursed: true, persistsLongRest: true },
  },

  raging: {
    id: 'raging', name: 'Raging', group: 'game', icon: 'rage', color: '#d0402a',
    desc: 'You have Advantage on Strength checks and Strength saving throws, a bonus to melee damage with '
      + 'Strength weapons, and Resistance to bludgeoning, piercing and slashing damage. You cannot cast or '
      + 'concentrate on spells while raging.',
    includes: [],
    duration: { kind: 'rounds', rounds: 10, endsOn: 'turn-end', save: null },
    mech: {
      resist: ['bludgeoning', 'piercing', 'slashing'],
      saveAdv: ['str'], advCheckAbility: ['str'],
      cannotCast: true, cannotConcentrate: true, raging: true,
    },
  },

  dodging: {
    id: 'dodging', name: 'Dodging', group: 'game', icon: 'shield-half', color: '#5fd07a',
    desc: 'Until the start of your next turn, attack rolls against you have Disadvantage if you can see '
      + 'the attacker, and you make Dexterity saving throws with Advantage. You lose this benefit if you '
      + 'are Incapacitated or your Speed drops to 0.',
    includes: [],
    duration: { kind: 'rounds', rounds: 1, endsOn: 'turn-start', save: null },
    mech: { attackedDis: true, saveAdv: ['dex'], dodging: true },
  },

  hidden: {
    id: 'hidden', name: 'Hidden', group: 'game', icon: 'hide', color: '#4a5a6a',
    desc: 'You are unseen and unheard. Attack rolls against you have Disadvantage and your attack rolls '
      + 'have Advantage. You stop being Hidden the moment you make noise, attack, cast a spell, or a '
      + 'creature finds you.',
    includes: [],
    duration: { kind: 'special', rounds: null, endsOn: null, save: null },
    mech: { unseen: true, hidden: true, attackAdv: true, attackedDis: true },
    consumeOnAttack: true,
  },

  concentrating: {
    id: 'concentrating', name: 'Concentrating', group: 'game', icon: 'focus', color: '#b07af0',
    desc: 'You are holding a spell together. Taking damage forces a Constitution saving throw (DC 10 or '
      + 'half the damage, whichever is higher) or the spell ends. Casting another Concentration spell, '
      + 'or becoming Incapacitated, ends it too.',
    includes: [],
    duration: { kind: 'concentration', rounds: null, endsOn: null, save: null },
    mech: { concentrating: true },
  },

  shielded: {
    id: 'shielded', name: 'Shielded', group: 'game', icon: 'shield', color: '#5aa8ff',
    desc: 'An invisible barrier of force surrounds you. You gain a +5 bonus to AC, including against the '
      + 'triggering attack, and you take no damage from Magic Missile. It lasts until the start of your next turn.',
    includes: [],
    duration: { kind: 'rounds', rounds: 1, endsOn: 'turn-start', save: null },
    mech: { acBonus: 5, immune: ['magic-missile'] },
  },

  inspired: {
    id: 'inspired', name: 'Inspired', group: 'game', icon: 'music', color: '#e28ad0',
    desc: 'You carry a Bardic Inspiration die. Once, before the roll is resolved, you can add it to one '
      + 'D20 Test. The die is spent when used and fades after 1 hour.',
    includes: [],
    duration: { kind: 'rounds', rounds: 600, endsOn: 'turn-end', save: null },
    mech: { inspirationDie: '1d6' },
    consumeOnUse: true,
  },

  stabilised: {
    id: 'stabilised', name: 'Stabilised', group: 'game', icon: 'plus', color: '#5fd07a',
    desc: 'You are at 0 hit points but no longer dying. You stop making death saving throws and regain 1 '
      + 'hit point after 1d4 hours, or the moment anyone heals you. Taking any damage starts the dying again.',
    includes: ['unconscious'],
    duration: { kind: 'special', rounds: null, endsOn: null, save: null },
    mech: {
      stable: true,
      incapacitated: true, noActions: true, noBonusActions: true, noReactions: true,
      prone: true, speed: 0, immobile: true, cannotSee: true, unaware: true,
      autoFailSaves: ['str', 'dex'], attackedAdv: true, incomingCritWithin5: true, autoCritMelee: true,
    },
  },

  dying: {
    id: 'dying', name: 'Dying', group: 'game', icon: 'skull', color: '#a03a3a',
    desc: 'You are at 0 hit points and Unconscious. At the start of each of your turns you make a death '
      + 'saving throw: three successes stabilise you, three failures kill you. A natural 20 brings you back '
      + 'with 1 hit point; a natural 1 counts as two failures. Damage taken while dying costs a failure — '
      + 'two if it was a Critical Hit.',
    includes: ['unconscious'],
    duration: { kind: 'special', rounds: null, endsOn: null, save: null },
    mech: {
      dying: true,
      incapacitated: true, noActions: true, noBonusActions: true, noReactions: true,
      dropsConcentration: true, cannotConcentrate: true, cannotSpeak: true,
      prone: true, speed: 0, immobile: true, cannotSee: true, unaware: true,
      autoFailSaves: ['str', 'dex'],
      attackedAdv: true, advOnAttacksAgainst: true,
      incomingCritWithin5: true, autoCritMelee: true,
    },
  },

  // --- weapon-mastery riders (2024) --------------------------------------
  // These are tiny, single-attack statuses; actions.js consumes them.

  vexed: {
    id: 'vexed', name: 'Vexed', group: 'game', icon: 'target', color: '#ffb03a',
    desc: 'The creature that struck you has Advantage on its next attack roll against you, if it makes '
      + 'that attack before the end of its next turn.',
    includes: [],
    duration: { kind: 'rounds', rounds: 1, endsOn: 'source-turn-end', save: null },
    mech: { advForSource: true },
    consumeOnAttack: true,
  },

  sapped: {
    id: 'sapped', name: 'Sapped', group: 'game', icon: 'stars', color: '#8a7a5a',
    desc: 'The blow has left you reeling. You have Disadvantage on your next attack roll, made before the '
      + "start of your attacker's next turn.",
    includes: [],
    duration: { kind: 'rounds', rounds: 1, endsOn: 'source-turn-end', save: null },
    mech: { attackDis: true },
    consumeOnAttack: true,
  },

  helped: {
    id: 'helped', name: 'Helped', group: 'game', icon: 'plus', color: '#5fd07a',
    desc: 'An ally has distracted your foe for you. You have Advantage on your next attack roll against '
      + "that creature, if you make it before the start of your ally's next turn.",
    includes: [],
    duration: { kind: 'rounds', rounds: 1, endsOn: 'source-turn-end', save: null },
    mech: { attackAdvVsTarget: true },
    consumeOnAttack: true,
  },

  reckless: {
    id: 'reckless', name: 'Reckless', group: 'game', icon: 'rage', color: '#d0402a',
    desc: 'You threw defence to the wind. Until the start of your next turn you have Advantage on melee '
      + 'attack rolls using Strength, and attack rolls against you have Advantage.',
    includes: [],
    duration: { kind: 'rounds', rounds: 1, endsOn: 'turn-start', save: null },
    mech: { recklessAttack: true, attackedAdv: true, advOnAttacksAgainst: true },
  },

  disengaging: {
    id: 'disengaging', name: 'Disengaging', group: 'game', icon: 'shield-half', color: '#9fd6e8',
    desc: "Your movement doesn't provoke Opportunity Attacks for the rest of the turn.",
    includes: [],
    duration: { kind: 'rounds', rounds: 1, endsOn: 'turn-end', save: null },
    mech: { disengaged: true },
  },
};

/** Every condition the game knows, PHB and game-layer alike. Frozen catalogue. */
export const CONDITIONS = deepFreeze({ ...PHB, ...GAME });

export const CONDITION_IDS = Object.freeze(Object.keys(CONDITIONS));
export const PHB_CONDITION_IDS = Object.freeze(Object.keys(PHB));
export const GAME_CONDITION_IDS = Object.freeze(Object.keys(GAME));

export function getCondition(id) { return CONDITIONS[lower(id)] || null; }
export function conditionName(id) { return CONDITIONS[lower(id)]?.name || String(id || ''); }
export function conditionColor(id) { return CONDITIONS[lower(id)]?.color || '#cfc3a4'; }
export function conditionIcon(id) { return CONDITIONS[lower(id)]?.icon || 'dot'; }

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** The live condition instances on a creature (never null, never the same array twice). */
export function activeConditions(ch) {
  return Array.isArray(ch?.conditions) ? ch.conditions.filter(Boolean) : [];
}

/**
 * Does the creature have this condition — directly, or because another condition
 * includes it (Stunned includes Incapacitated, Unconscious includes Prone)?
 */
export function hasCondition(ch, id) {
  const want = lower(id);
  for (const c of activeConditions(ch)) {
    if (lower(c.id) === want) return true;
    const def = CONDITIONS[lower(c.id)];
    if (def && (def.includes || []).includes(want)) return true;
  }
  return false;
}

/** The instance object, so callers can read `source`, `dur`, `level`, `data`. */
export function conditionInstance(ch, id) {
  const want = lower(id);
  return activeConditions(ch).find((c) => lower(c.id) === want) || null;
}

/** Every instance with this id (a creature can be Charmed by two different foes). */
export function conditionInstances(ch, id) {
  const want = lower(id);
  return activeConditions(ch).filter((c) => lower(c.id) === want);
}

/** Is the creature immune to a condition (species/feature/item immunity, or Petrified vs Poisoned)? */
export function isConditionImmune(ch, id) {
  const want = lower(id);
  if (!ch) return false;
  if ((ch.condImmune || []).map(lower).includes(want)) return true;
  for (const c of activeConditions(ch)) {
    const def = CONDITIONS[lower(c.id)];
    if (def && (def.mech?.condImmune || []).map(lower).includes(want)) return true;
  }
  return false;
}

/** Convenience predicates the combat engine and AI ask for constantly. */
export function isIncapacitated(ch) { return !!conditionMech(ch).incapacitated; }
export function canTakeActions(ch) { const m = conditionMech(ch); return !m.noActions; }
export function canTakeReactions(ch) { const m = conditionMech(ch); return !m.noReactions; }
export function canSee(ch) { return !conditionMech(ch).cannotSee; }
export function isUnseen(ch) { return !!conditionMech(ch).unseen; }
export function isProne(ch) { return !!conditionMech(ch).prone; }

// ---------------------------------------------------------------------------
// Mutation
// ---------------------------------------------------------------------------

function invalidate(ch) { if (ch) ch._condMech = null; }

/**
 * Apply a condition.
 *   opts: { dur, rounds, duration:'1 minute', source, sourceUid, save:{ab,dc,end},
 *           level (exhaustion), data, spellId, concentration, dc, ability }
 * Returns the instance, or null if the creature is immune / the id is unknown.
 *
 * Re-applying an existing condition refreshes it to the longer duration rather than
 * stacking a second copy — except Exhaustion, which stacks levels, and conditions
 * with distinct `source` values (two separate charmers), which coexist.
 */
export function addCondition(ch, id, opts = {}) {
  const key = lower(id);
  const def = CONDITIONS[key];
  if (!ch || !def) return null;
  if (!Array.isArray(ch.conditions)) ch.conditions = [];

  if (isConditionImmune(ch, key)) {
    bus.emit(EV.CONDITION, { ch, uid: ch.uid, id: key, applied: false, immune: true });
    return null;
  }

  // --- Exhaustion stacks in levels; six is death (2024 PHB) ---------------
  if (def.stacking === 'levels') {
    const inst = conditionInstance(ch, key);
    const add = Math.max(1, Math.floor(opts.level ?? opts.levels ?? 1));
    const level = clamp((inst?.level || 0) + add, 0, def.maxLevel || 6);
    if (inst) inst.level = level;
    else ch.conditions.push({ id: key, dur: null, level, source: opts.source ?? opts.sourceUid ?? null, save: null, data: opts.data || null });
    invalidate(ch);
    bus.emit(EV.CONDITION, { ch, uid: ch.uid, id: key, applied: true, level });
    if (level >= (def.maxLevel || 6)) killByExhaustion(ch);
    return conditionInstance(ch, key);
  }

  const source = opts.source ?? opts.sourceUid ?? null;
  const dur = resolveDur(def, opts);

  // Refresh an existing instance from the same source instead of duplicating it.
  const existing = activeConditions(ch).find((c) => lower(c.id) === key && (c.source ?? null) === source);
  if (existing) {
    if (dur == null || existing.dur == null) existing.dur = dur == null ? null : Math.max(existing.dur ?? 0, dur);
    else existing.dur = Math.max(existing.dur, dur);
    if (opts.save) existing.save = normSave(def, opts);
    if (opts.data) existing.data = { ...(existing.data || {}), ...opts.data };
    invalidate(ch);
    return existing;
  }

  const inst = {
    id: key,
    dur,
    source,
    save: normSave(def, opts),
    data: opts.data || null,
    spellId: opts.spellId || null,
    concentration: !!opts.concentration || def.duration?.kind === 'concentration',
    endsOn: opts.endsOn || def.duration?.endsOn || 'turn-end',
    applied: true,
  };
  ch.conditions.push(inst);
  invalidate(ch);

  // Conditions that break Concentration do so the instant they land.
  if (def.mech?.dropsConcentration && isConcentrating(ch)) {
    breakConcentration(ch, `became ${def.name}`);
  }

  bus.emit(EV.CONDITION, { ch, uid: ch.uid, id: key, applied: true, instance: inst, source });
  return inst;
}

/** Resolve the starting duration in rounds for a new instance. */
function resolveDur(def, opts) {
  if (opts.dur !== undefined) return opts.dur;
  if (opts.rounds !== undefined) return opts.rounds;
  if (opts.duration !== undefined) return roundsFor(opts.duration);
  const d = def.duration || {};
  if (d.kind === 'permanent' || d.kind === 'special' || d.kind === 'until-rest') return null;
  return d.rounds ?? null;
}

/** Build the per-instance end-of-turn save block, if this condition has one. */
function normSave(def, opts) {
  if (opts.save === null) return null;
  const base = def.duration?.save;
  const given = opts.save;
  if (!base && !given) return null;
  const ability = given?.ab || given?.ability || base?.ability || 'con';
  const dc = given?.dc ?? opts.dc ?? null;
  if (dc == null) return null;              // no DC known -> no repeat save
  return { ab: ability, ability, dc, end: given?.end || base?.end || 'turn-end' };
}

/**
 * Remove a condition. Pass `opts.source` to strip only the instances a particular
 * creature or spell applied. Returns how many instances were removed.
 */
export function removeCondition(ch, id, opts = {}) {
  if (!ch || !Array.isArray(ch.conditions)) return 0;
  const key = lower(id);
  const before = ch.conditions.length;
  ch.conditions = ch.conditions.filter((c) => {
    if (!c || lower(c.id) !== key) return true;
    if (opts.source != null && (c.source ?? null) !== opts.source) return true;
    return false;
  });
  const n = before - ch.conditions.length;
  if (n) {
    invalidate(ch);
    bus.emit(EV.CONDITION, { ch, uid: ch.uid, id: key, applied: false, removed: n });
    // Haste's crash: when it drops, you are Lethargic for a round.
    const def = CONDITIONS[key];
    if (def?.onEnd && !opts.silent) addCondition(ch, def.onEnd, { source: c_srcOf(opts) });
  }
  return n;
}

function c_srcOf(opts) { return opts.source ?? null; }

/** Drop every condition (or every condition a given source applied). */
export function clearConditions(ch, opts = {}) {
  if (!ch || !Array.isArray(ch.conditions)) return 0;
  const before = ch.conditions.length;
  ch.conditions = ch.conditions.filter((c) => {
    if (!c) return false;
    if (opts.source != null && (c.source ?? null) !== opts.source) return true;
    if (opts.keep && arr(opts.keep).includes(lower(c.id))) return true;
    // A long rest doesn't lift a curse or turn stone back into flesh.
    if (opts.longRest && CONDITIONS[lower(c.id)]?.mech?.persistsLongRest) return true;
    if (opts.longRest && lower(c.id) === 'petrified') return true;
    return false;
  });
  invalidate(ch);
  return before - ch.conditions.length;
}

/** Strip every condition a particular spell/creature applied (concentration ending). */
export function removeFromSource(ch, source) { return clearConditions(ch, { source }); }

// ---------------------------------------------------------------------------
// Exhaustion
// ---------------------------------------------------------------------------

/** 0–6. */
export function exhaustionLevel(ch) {
  return clamp(conditionInstance(ch, 'exhaustion')?.level || 0, 0, 6);
}

/** Set an absolute level; 0 removes the condition, 6 kills. */
export function setExhaustion(ch, level) {
  if (!ch) return 0;
  const n = clamp(Math.floor(level || 0), 0, 6);
  if (n <= 0) { removeCondition(ch, 'exhaustion'); return 0; }
  const inst = conditionInstance(ch, 'exhaustion');
  if (inst) inst.level = n;
  else {
    if (!Array.isArray(ch.conditions)) ch.conditions = [];
    ch.conditions.push({ id: 'exhaustion', dur: null, level: n, source: null, save: null });
  }
  invalidate(ch);
  bus.emit(EV.CONDITION, { ch, uid: ch.uid, id: 'exhaustion', applied: true, level: n });
  if (n >= 6) killByExhaustion(ch);
  return n;
}

/** A long rest removes one level (2024 PHB). Returns the new level. */
export function reduceExhaustion(ch, by = 1) {
  return setExhaustion(ch, exhaustionLevel(ch) - Math.max(1, Math.floor(by)));
}

/** The scaling penalties: -2 per level to every D20 Test, -5 ft Speed per level. */
export function exhaustionMech(level) {
  const n = clamp(Math.floor(level || 0), 0, 6);
  if (n <= 0) return {};
  return { d20Penalty: -2 * n, speedBonus: -5 * n, exhaustion: n, dead: n >= 6 };
}

function killByExhaustion(ch) {
  if (!ch || isDead(ch)) return;
  ch.hp = 0;
  if (ch.deathSaves) { ch.deathSaves.fail = 3; ch.deathSaves.stable = false; }
  ch.concentration = null;
  bus.emit(EV.DEATH, { ch, uid: ch.uid, cause: 'exhaustion' });
}

// ---------------------------------------------------------------------------
// The merged flags object — this is what actions.js reads
// ---------------------------------------------------------------------------

function emptyCondMech() {
  return {
    ids: [], instances: [],

    // D20 Tests
    d20Penalty: 0, d20Bonus: 0,
    attackAdv: false, attackDis: false,
    attackedAdv: false, attackedDis: false, advOnAttacksAgainst: false,
    attackedAdvWithin5: false, attackedDisBeyond5: false,
    attackDisVsOthers: [],        // uids of grapplers: attacks on anyone else are at dis
    cannotTargetSource: [],       // uids of charmers you may not attack or damage
    cannotApproachSource: [],     // uids of fear sources you may not move toward
    advOnAttacksBy: [],           // uids that hold Advantage against you (Vex)
    attackAdvVsTarget: [],        // uids you hold Advantage against (Help)
    autoFailSaves: [], autoFailChecks: [],
    saveAdv: [], saveDis: [], savePenaltyBy: {}, saveBonusBy: {},
    advOnAbilityChecks: false, disOnAbilityChecks: false,
    advCheckAbility: [], disCheckAbility: [],
    attackBonusDice: [], attackPenaltyDice: [],
    saveBonusDice: [], savePenaltyDice: [],
    checkBonusDice: [], checkPenaltyDice: [],
    inspirationDie: null,
    initiativeAdv: false,

    // action economy
    noActions: false, noBonusActions: false, noReactions: false,
    actionOrBonusOnly: false, extraAction: 0,

    // movement
    speed: null, speedBonus: 0, speedMult: 1,
    immobile: false, prone: false, crawlOnly: false, movable: false,
    disengaged: false, ignoreDifficult: false,

    // defence
    acBonus: 0, dmgTakenMult: 1,
    resist: [], immune: [], vuln: [], condImmune: [],
    incomingCritWithin5: false, autoCritMelee: false,

    // senses & state
    cannotSee: false, cannotHear: false, cannotSpeak: false,
    unseen: false, unaware: false, invisible: false, hidden: false, concealed: false,
    dropsHeld: false,

    // casting
    dropsConcentration: false, cannotConcentrate: false, cannotCast: false,
    cannotHeal: false, concentrating: false,

    // status
    incapacitated: false, dying: false, stable: false, dead: false, raging: false,
    dodging: false, hasted: false, marked: false, hexed: false, cursed: false,
    burning: false, bleeding: false, recklessAttack: false,

    // riders
    bonusDamage: [],   // [{dice, type, fromUid|null}]
    tickDamage: [],    // [{id, dice, type, when, source}]
    exhaustion: 0,
  };
}

const BOOL_KEYS = [
  'attackAdv', 'attackDis', 'attackedAdv', 'attackedDis', 'advOnAttacksAgainst',
  'attackedAdvWithin5', 'attackedDisBeyond5',
  'advOnAbilityChecks', 'disOnAbilityChecks', 'initiativeAdv',
  'noActions', 'noBonusActions', 'noReactions', 'actionOrBonusOnly',
  'immobile', 'prone', 'crawlOnly', 'movable', 'disengaged', 'ignoreDifficult',
  'incomingCritWithin5', 'autoCritMelee',
  'cannotSee', 'cannotHear', 'unseen', 'unaware', 'invisible', 'hidden', 'concealed', 'dropsHeld',
  'dropsConcentration', 'cannotConcentrate', 'cannotCast', 'cannotHeal', 'concentrating',
  'incapacitated', 'dying', 'stable', 'dead', 'raging', 'dodging', 'hasted',
  'marked', 'hexed', 'cursed', 'burning', 'bleeding', 'recklessAttack',
];
const LIST_KEYS = [
  'autoFailSaves', 'autoFailChecks', 'saveAdv', 'saveDis',
  'advCheckAbility', 'disCheckAbility',
  'attackBonusDice', 'attackPenaltyDice', 'saveBonusDice', 'savePenaltyDice',
  'checkBonusDice', 'checkPenaltyDice', 'resist', 'immune', 'vuln', 'condImmune',
];

/**
 * Merge every active condition into one flags object.
 *
 * Rules of the merge:
 *   - booleans OR together (one source of Advantage is the same as three);
 *   - lists union;
 *   - `speed:0` wins over any speed bonus, and `speedMult` multiplies;
 *   - `acBonus`, `speedBonus` and `d20Penalty` add;
 *   - `dmgTakenMult` multiplies (Petrified halving, a Vulnerable-style debuff doubling);
 *   - source-scoped riders (Charmed's charmer, Grappled's grappler, Vex's attacker)
 *     land in uid lists so the attack resolver can ask "is it THIS creature?".
 *
 * The result is cached on `ch._condMech` and dropped whenever conditions change.
 */
export function conditionMech(ch) {
  if (!ch) return emptyCondMech();
  if (ch._condMech) return ch._condMech;

  const acc = emptyCondMech();
  const list = activeConditions(ch);

  for (const inst of list) {
    const def = CONDITIONS[lower(inst.id)];
    if (!def) continue;                       // unknown ids never throw, they're ignored
    acc.ids.push(def.id);
    acc.instances.push(inst);
    for (const inc of def.includes || []) if (!acc.ids.includes(inc)) acc.ids.push(inc);

    // Exhaustion's numbers depend on its level.
    const mech = def.stacking === 'levels' ? exhaustionMech(inst.level) : (def.mech || {});
    const src = inst.source ?? null;

    for (const k of BOOL_KEYS) if (mech[k]) acc[k] = true;
    for (const k of LIST_KEYS) {
      for (const v of arr(mech[k])) if (!acc[k].includes(v)) acc[k].push(v);
    }

    if (typeof mech.d20Penalty === 'number') acc.d20Penalty += mech.d20Penalty;
    if (typeof mech.d20Bonus === 'number') acc.d20Bonus += mech.d20Bonus;
    if (typeof mech.acBonus === 'number') acc.acBonus += mech.acBonus;
    if (typeof mech.speedBonus === 'number') acc.speedBonus += mech.speedBonus;
    if (typeof mech.speedMult === 'number') acc.speedMult *= mech.speedMult;
    if (mech.speed === 0) acc.speed = 0;
    if (typeof mech.dmgTakenMult === 'number') acc.dmgTakenMult *= mech.dmgTakenMult;
    if (typeof mech.extraAction === 'number') acc.extraAction += mech.extraAction;
    if (mech.exhaustion) acc.exhaustion = Math.max(acc.exhaustion, mech.exhaustion);
    if (mech.inspirationDie) acc.inspirationDie = mech.inspirationDie;

    for (const [ab, v] of Object.entries(mech.savePenaltyBy || {})) acc.savePenaltyBy[ab] = (acc.savePenaltyBy[ab] || 0) + v;
    for (const [ab, v] of Object.entries(mech.saveBonusBy || {})) acc.saveBonusBy[ab] = (acc.saveBonusBy[ab] || 0) + v;

    // --- source-scoped riders -------------------------------------------
    if (mech.cannotTargetSource && src) acc.cannotTargetSource.push(src);
    if (mech.cannotApproachSource && src) acc.cannotApproachSource.push(src);
    if (mech.attackDisVsOthers && src) acc.attackDisVsOthers.push(src);
    if (mech.advForSource && src) acc.advOnAttacksBy.push(src);
    if (mech.attackAdvVsTarget) {
      const t = inst.data?.target ?? inst.data?.targetUid ?? null;
      if (t) acc.attackAdvVsTarget.push(t);
    }
    for (const b of arr(mech.bonusDamage)) {
      acc.bonusDamage.push({ dice: b.dice, type: b.type || 'force', fromUid: b.fromSource ? src : null, condition: def.id });
    }
    for (const t of arr(mech.tickDamage)) {
      acc.tickDamage.push({ id: def.id, dice: inst.data?.dice || t.dice, type: t.type, when: t.when || 'turn-start', source: src });
    }
  }

  // A Grappled creature's Speed can't be raised; likewise Restrained/Paralyzed etc.
  if (acc.speed === 0) { acc.speedMult = 0; }
  if (acc.immobile) acc.speed = 0;

  ch._condMech = acc;
  return acc;
}

/** The final Speed after conditions, given the creature's base Speed. */
export function speedWithConditions(ch, baseSpeed) {
  const m = conditionMech(ch);
  if (m.speed === 0 || m.immobile) return 0;
  return Math.max(0, Math.floor((baseSpeed + m.speedBonus) * m.speedMult));
}

// ---------------------------------------------------------------------------
// Ticking
// ---------------------------------------------------------------------------

/**
 * Advance a creature's conditions one turn boundary.
 *
 *   when === 'turn-start'
 *     * start-of-turn damage over time (Burning, Bleeding, a Wall of Fire you're
 *       standing in) is rolled and applied;
 *     * conditions that last "until the start of your next turn" (Dodge, Shield,
 *       Reckless Attack) tick down and expire.
 *
 *   when === 'turn-end'
 *     * conditions carrying a repeat save ("the creature repeats the save at the
 *       end of each of its turns, ending the effect on a success") are rolled;
 *     * everything else ticks its round counter and expires at zero.
 *
 * `opts.sourceUid` lets the caller also expire the conditions this creature applied
 * to others which run out "at the end of the source's next turn" (Vex, Sap, Help).
 *
 * Returns a log array of { text, kind, id, ... } lines for the combat log. Death
 * saving throws are NOT rolled here — combat.js owns those.
 */
export function tickConditions(ch, when = 'turn-end', opts = {}) {
  const out = [];
  if (!ch || !Array.isArray(ch.conditions) || !ch.conditions.length) return out;
  const r = opts.rng || rng;
  const name = ch.name || 'The creature';

  if (when === 'turn-start') {
    // --- damage over time ------------------------------------------------
    for (const t of conditionMech(ch).tickDamage) {
      if ((t.when || 'turn-start') !== 'turn-start') continue;
      const roll = rollExpr(t.dice, r);
      const res = dealDamage(ch, roll.total, t.type, { source: t.id, dot: true });
      out.push({
        kind: 'damage', id: t.id, text: `${name} takes ${res.dealt} ${t.type} damage from ${conditionName(t.id)} (${t.dice} [${roll.rolls.join(',')}]).`,
        amount: res.dealt, type: t.type, rolls: roll.rolls, dead: res.dead, downed: res.downed,
      });
      // Damage over time can break Concentration exactly like any other damage.
      if (res.dealt > 0 && isConcentrating(ch) && ch.hp <= 0) breakConcentration(ch, 'dropped to 0 hit points');
    }
    out.push(...expire(ch, 'turn-start', r));
  } else if (when === 'turn-end') {
    out.push(...repeatSaves(ch, r));
    out.push(...expire(ch, 'turn-end', r));
  }

  // Conditions the creature inflicted on others that die with its turn.
  if (opts.sourceUid !== undefined && when === 'turn-end') {
    out.push(...expire(ch, 'source-turn-end', r, opts.sourceUid));
  }

  invalidate(ch);
  return out;
}

/** Roll the "repeat the save at the end of your turn" saves. */
function repeatSaves(ch, r) {
  const out = [];
  const cm = conditionMech(ch);
  for (const inst of activeConditions(ch).slice()) {
    const save = inst.save;
    if (!save || (save.end || 'turn-end') !== 'turn-end' || save.dc == null) continue;
    const ab = save.ab || save.ability || 'con';

    // Auto-fail (Paralyzed/Stunned always fail Str and Dex) still applies here.
    if (cm.autoFailSaves.includes(ab)) {
      out.push({ kind: 'save', id: inst.id, text: `${ch.name} automatically fails the DC ${save.dc} ${ab.toUpperCase()} save against ${conditionName(inst.id)}.`, success: false, auto: true });
      continue;
    }

    const adv = cm.saveAdv.includes(ab);
    const dis = cm.saveDis.includes(ab);
    const res = d20(saveMod(ch, ab) + cm.d20Penalty + cm.d20Bonus + (cm.savePenaltyBy[ab] || 0) + (cm.saveBonusBy[ab] || 0), {
      adv: adv && !dis, dis: dis && !adv, bonusDice: cm.saveBonusDice,
    }, r);
    const success = res.total >= save.dc;
    bus.emit(EV.SAVE, { ch, uid: ch.uid, ability: ab, dc: save.dc, roll: res, success, reason: inst.id });
    if (success) {
      removeCondition(ch, inst.id, { source: inst.source, silent: true });
      out.push({ kind: 'save', id: inst.id, text: `${ch.name} shakes off ${conditionName(inst.id)} (${res.text} vs DC ${save.dc}).`, success: true, roll: res });
    } else {
      out.push({ kind: 'save', id: inst.id, text: `${ch.name} is still ${conditionName(inst.id)} (${res.text} vs DC ${save.dc}).`, success: false, roll: res });
    }
  }
  return out;
}

/** Tick down and remove conditions that expire at this boundary. */
function expire(ch, boundary, r, sourceUid) {
  const out = [];
  for (const inst of activeConditions(ch).slice()) {
    const def = CONDITIONS[lower(inst.id)];
    if (!def) continue;
    const endsOn = inst.endsOn || def.duration?.endsOn || 'turn-end';
    if (endsOn !== boundary) continue;
    if (boundary === 'source-turn-end' && sourceUid !== undefined && (inst.source ?? null) !== sourceUid) continue;
    if (inst.dur == null) continue;                       // indefinite

    inst.dur -= 1;
    if (inst.dur <= 0) {
      removeCondition(ch, inst.id, { source: inst.source });
      out.push({ kind: 'condition', id: inst.id, text: `${ch.name} is no longer ${conditionName(inst.id)}.`, expired: true });
    }
  }
  return out;
}

/**
 * Expire the "until the end of your next turn" riders this creature hung on other
 * creatures (Vex, Sap, Help). combat.js calls this at the end of `unit`'s turn with
 * the whole unit list.
 */
export function expireSourceConditions(units, sourceUid) {
  const out = [];
  for (const u of arr(units)) {
    if (!u) continue;
    for (const inst of activeConditions(u).slice()) {
      const def = CONDITIONS[lower(inst.id)];
      const endsOn = inst.endsOn || def?.duration?.endsOn;
      if (endsOn !== 'source-turn-end') continue;
      if ((inst.source ?? null) !== sourceUid) continue;
      if (inst.dur == null) continue;
      inst.dur -= 1;
      if (inst.dur <= 0) {
        removeCondition(u, inst.id, { source: inst.source });
        out.push({ kind: 'condition', id: inst.id, text: `${u.name} is no longer ${conditionName(inst.id)}.` });
      }
      invalidate(u);
    }
  }
  return out;
}

/**
 * Spend a single-use rider (Vex, Sap, Help, Bardic Inspiration). actions.js calls
 * this the moment the attack roll that benefits from it is made.
 */
export function consumeCondition(ch, id, opts = {}) {
  const key = lower(id);
  const def = CONDITIONS[key];
  if (!def || !(def.consumeOnAttack || def.consumeOnUse || opts.force)) return false;
  return removeCondition(ch, key, { source: opts.source, silent: true }) > 0;
}

// ---------------------------------------------------------------------------
// Presentation helpers (the HUD and tooltips use these)
// ---------------------------------------------------------------------------

/** Compact badges for the HUD: [{ id, name, icon, color, dur, level, text }]. */
export function conditionBadges(ch) {
  return activeConditions(ch).map((c) => {
    const def = CONDITIONS[lower(c.id)] || { name: c.id, icon: 'dot', color: '#cfc3a4' };
    const lvl = def.stacking === 'levels' ? ` ${c.level}` : '';
    const dur = c.dur == null ? '' : ` ${c.dur}r`;
    return { id: c.id, name: def.name + lvl, icon: def.icon, color: def.color, dur: c.dur, level: c.level || 0, text: `${def.name}${lvl}${dur}` };
  });
}

/** "Poisoned, Prone, Exhaustion 2" */
export function conditionSummary(ch) {
  const b = conditionBadges(ch);
  return b.length ? b.map((x) => x.name).join(', ') : 'None';
}

/** Full rules text for a tooltip, with the exhaustion level spelled out. */
export function conditionText(id, level = 0) {
  const def = CONDITIONS[lower(id)];
  if (!def) return '';
  if (def.stacking === 'levels' && level > 0) {
    const l = def.levels?.[clamp(level, 1, 6) - 1];
    return `${def.desc}\nCurrent: level ${level} — ${l ? l.desc : ''}`;
  }
  return def.desc;
}

/** Sanity list for tools and tests. */
export function conditionCount() { return CONDITION_IDS.length; }

/** Every ability abbreviation, re-exported so UI code doesn't need abilities.js. */
export const SAVE_ABILITIES = ABILITIES;
