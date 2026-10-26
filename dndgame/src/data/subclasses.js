// src/data/subclasses.js — every subclass in the game, plus the Battle Master
// maneuvers, Eldritch Invocations and Metamagic option catalogues.
//
// PURE DATA MODULE. No imports. Read by rules/character.js, rules/progression.js,
// rules/spellcasting.js and ui/levelup.js. Never mutate — the exports are deep-frozen.
//
// ---------------------------------------------------------------------------
// SHAPE (see docs/SPEC.md §3)
//   SUBCLASSES[id] = {
//     id, name, classId, desc,
//     features: { <classLevel>: [featureObj] },
//     spells:   { <classLevel>: [spellId] },   // always-prepared subclass spells
//   }
//   featureObj = { id, name, desc, mech?, uses?, choice? }
//   choice     = { type, count, from:[ids]|'auto', options?:{ id -> {name,desc,...} } }
//
// SUBCLASS FEATURE LEVELS (2024 PHB):
//   barbarian 3/6/10/14   bard 3/6/14        cleric 3/6/17      druid 3/6/10/14
//   fighter 3/7/10/15/18  monk 3/6/11/17     paladin 3/7/15/20  ranger 3/7/11/15
//   rogue 3/9/13/17       sorcerer 3/6/14/18 warlock 3/6/10/14  wizard 3/6/10/14
//
// `mech` uses ONLY the vocabulary listed in SPEC §3 plus the class extras declared
// in classes.js (rageDamage, sneakAttack, martialArtsDie, bardicDie, wildShape,
// layOnHands, aura, masteryCount, invocationsKnown, metamagicKnown, mysticArcanum,
// alwaysPrepared, freeCasts, damageBonus, tempHpFormula, reroll, capAbility).
// Anything the engine handles as a bespoke combat hook rides on `passive:'<tag>'`.
// ---------------------------------------------------------------------------

/** Recursively freeze a catalogue so no gameplay code can scribble on it. */
function deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object' || Object.isFrozen(obj)) return obj;
  for (const k of Object.keys(obj)) deepFreeze(obj[k]);
  return Object.freeze(obj);
}

// ═══════════════════════════════════════════════════════════════════════════
// BATTLE MASTER MANEUVERS (2024 PHB — 20 options)
// Each costs one Superiority Die unless the text says otherwise. `passive` is the
// tag rules/combat.js switches on; `damageBonus:'superiority'` means "add the die".
// ═══════════════════════════════════════════════════════════════════════════

export const MANEUVERS = deepFreeze({
  'ambush': {
    id: 'ambush', name: 'Ambush',
    desc: 'The half-heartbeat before a fight is where wars are won. When you make a Stealth check or roll Initiative, expend a die and add it to the roll.',
    prereq: null,
    mech: { passive: 'maneuver-ambush', initiativeBonus: 0 },
  },
  'bait-and-switch': {
    id: 'bait-and-switch', name: 'Bait and Switch',
    desc: 'You shoulder a comrade out of the killing line and take their place. Swap positions with a willing ally within 5 feet; whichever of you you choose adds the die to their AC until your next turn.',
    prereq: null,
    mech: { passive: 'maneuver-bait-switch' },
  },
  'commanders-strike': {
    id: 'commanders-strike', name: "Commander's Strike",
    desc: 'You give up a swing to bark an opening to someone better placed. Forgo one attack, expend a die, and one ally who can hear you uses their Reaction to attack, adding the die to the damage.',
    prereq: null,
    mech: { passive: 'maneuver-commanders-strike', damageBonus: 'superiority' },
  },
  'commanding-presence': {
    id: 'commanding-presence', name: 'Commanding Presence',
    desc: 'Officers of the Lords’ Alliance drill this into their captains at Neverwinter. Add the die to an Intimidation, Performance or Persuasion check.',
    prereq: null,
    mech: { passive: 'maneuver-commanding-presence' },
  },
  'disarming-attack': {
    id: 'disarming-attack', name: 'Disarming Attack',
    desc: 'A blade knocked into the mud settles most arguments. On a hit add the die to damage; the target must succeed on a Strength save or drop one object of your choice.',
    prereq: null,
    mech: { passive: 'maneuver-disarm', damageBonus: 'superiority' },
  },
  'distracting-strike': {
    id: 'distracting-strike', name: 'Distracting Strike',
    desc: 'You hammer the guard aside and leave it hanging open. On a hit add the die to damage; the next attack roll against the target by anyone but you has advantage.',
    prereq: null,
    mech: { passive: 'maneuver-distracting', damageBonus: 'superiority' },
  },
  'evasive-footwork': {
    id: 'evasive-footwork', name: 'Evasive Footwork',
    desc: 'You fight the way the Redbrands never learned to: always moving. When you move, add the die to your AC until you stop.',
    prereq: null,
    mech: { passive: 'maneuver-evasive-footwork' },
  },
  'feinting-attack': {
    id: 'feinting-attack', name: 'Feinting Attack',
    desc: 'A lie told with the shoulder. As a Bonus Action feint at a creature within 5 feet; you have advantage on your next attack against it this turn and add the die to that damage.',
    prereq: null,
    mech: { passive: 'maneuver-feint', damageBonus: 'superiority' },
  },
  'goading-attack': {
    id: 'goading-attack', name: 'Goading Attack',
    desc: 'You make the blow an insult it cannot ignore. On a hit add the die to damage; on a failed Wisdom save the target has disadvantage on attacks against anyone but you until your next turn ends.',
    prereq: null,
    mech: { passive: 'maneuver-goad', damageBonus: 'superiority' },
  },
  'lunging-attack': {
    id: 'lunging-attack', name: 'Lunging Attack',
    desc: 'A long low step that borrows five feet from nowhere. Increase your reach by 5 feet for one melee attack, and add the die to its damage on a hit.',
    prereq: null,
    mech: { passive: 'maneuver-lunge', damageBonus: 'superiority' },
  },
  'maneuvering-attack': {
    id: 'maneuvering-attack', name: 'Maneuvering Attack',
    desc: 'Your strike drags a foe half a step out of position, and an ally takes the gap. On a hit add the die to damage; one ally may use their Reaction to move half their speed without provoking from the target.',
    prereq: null,
    mech: { passive: 'maneuver-maneuvering', damageBonus: 'superiority' },
  },
  'menacing-attack': {
    id: 'menacing-attack', name: 'Menacing Attack',
    desc: 'You hit the creature and let it see exactly how little effort it cost you. On a hit add the die to damage; a failed Wisdom save leaves it Frightened of you until the end of your next turn.',
    prereq: null,
    mech: { passive: 'maneuver-menacing', damageBonus: 'superiority' },
  },
  'parry': {
    id: 'parry', name: 'Parry',
    desc: 'Steel meets steel and the force goes into the ground. As a Reaction when you take melee damage, reduce it by the die plus your Dexterity modifier.',
    prereq: null,
    mech: { passive: 'maneuver-parry' },
  },
  'precision-attack': {
    id: 'precision-attack', name: 'Precision Attack',
    desc: 'The seam in the mail, the gap under the jaw. Add the die to an attack roll, before or after you see whether it landed.',
    prereq: null,
    mech: { passive: 'maneuver-precision' },
  },
  'pushing-attack': {
    id: 'pushing-attack', name: 'Pushing Attack',
    desc: 'Bodyweight, shield-boss and a shove — into the shale, or off the Cragmaw battlements. On a hit add the die to damage; on a failed Strength save the target is pushed 15 feet away.',
    prereq: null,
    mech: { passive: 'maneuver-push', damageBonus: 'superiority' },
  },
  'rally': {
    id: 'rally', name: 'Rally',
    desc: 'A word, at the right moment, is worth a healer. As a Bonus Action, one ally who can see or hear you gains Temporary Hit Points equal to the die plus your Charisma modifier.',
    prereq: null,
    mech: { passive: 'maneuver-rally', tempHpFormula: 'superiority+cha' },
  },
  'riposte': {
    id: 'riposte', name: 'Riposte',
    desc: 'You let the swing go past and answer it. As a Reaction when a creature misses you with a melee attack, make one melee attack against it and add the die to the damage.',
    prereq: null,
    mech: { passive: 'maneuver-riposte', damageBonus: 'superiority' },
  },
  'sweeping-attack': {
    id: 'sweeping-attack', name: 'Sweeping Attack',
    desc: 'One long cut that does not stop at the first body. On a hit, another creature within 5 feet of the target takes damage equal to the die, of your weapon’s type.',
    prereq: null,
    mech: { passive: 'maneuver-sweeping', damageBonus: 'superiority' },
  },
  'tactical-assessment': {
    id: 'tactical-assessment', name: 'Tactical Assessment',
    desc: 'You read a room the way a scout reads a treeline. Add the die to an Investigation, History or Insight check.',
    prereq: null,
    mech: { passive: 'maneuver-tactical-assessment' },
  },
  'trip-attack': {
    id: 'trip-attack', name: 'Trip Attack',
    desc: 'Hook the ankle, follow the shoulder, and the ground does the rest. On a hit add the die to damage; a Large or smaller creature that fails a Strength save falls Prone.',
    prereq: null,
    mech: { passive: 'maneuver-trip', damageBonus: 'superiority' },
  },
});

/** All maneuver ids, in menu order — used as the Battle Master choice list. */
export const MANEUVER_IDS = deepFreeze(Object.keys(MANEUVERS));

// ═══════════════════════════════════════════════════════════════════════════
// ELDRITCH INVOCATIONS (2024 PHB — 28 options)
// `prereq` may carry { level, invocation, cantrip, spell }.
// ═══════════════════════════════════════════════════════════════════════════

export const INVOCATIONS = deepFreeze({
  'agonizing-blast': {
    id: 'agonizing-blast', name: 'Agonizing Blast',
    desc: 'The pact makes your magic hurt the way its maker does. Choose a warlock cantrip that deals damage; you add your Charisma modifier to that damage.',
    prereq: { cantrip: 'any-warlock-damage' },
    mech: { passive: 'agonizing-blast', damageBonus: 'cha' },
  },
  'armor-of-shadows': {
    id: 'armor-of-shadows', name: 'Armor of Shadows',
    desc: 'Gloom gathers at your shoulders and hardens. You can cast Mage Armor on yourself at will, without a spell slot.',
    prereq: null,
    mech: { freeCasts: [{ spellId: 'mage-armor', atWill: true, self: true }], passive: 'armor-of-shadows' },
  },
  'ascendant-step': {
    id: 'ascendant-step', name: 'Ascendant Step',
    desc: 'Your feet stop taking the ground seriously. You can cast Levitate on yourself at will, without a spell slot.',
    prereq: { level: 9 },
    mech: { freeCasts: [{ spellId: 'levitate', atWill: true, self: true }] },
  },
  'devils-sight': {
    id: 'devils-sight', name: "Devil's Sight",
    desc: 'You see as the things below the Nine Hells see. You have Darkvision out to 120 feet, and it pierces even magical darkness.',
    prereq: null,
    mech: { darkvision: 120, passive: 'see-magical-darkness' },
  },
  'devouring-blade': {
    id: 'devouring-blade', name: 'Devouring Blade',
    desc: 'The weapon has learned appetite. Your Extra Attack with the pact weapon lets you attack three times instead of twice.',
    prereq: { level: 12, invocation: 'pact-of-the-blade' },
    mech: { extraAttack: 1, passive: 'devouring-blade' },
  },
  'eldritch-mind': {
    id: 'eldritch-mind', name: 'Eldritch Mind',
    desc: 'Your patron holds the thread when your body cannot. You have advantage on Constitution saving throws made to maintain Concentration.',
    prereq: null,
    mech: { passive: 'adv-concentration' },
  },
  'eldritch-smite': {
    id: 'eldritch-smite', name: 'Eldritch Smite',
    desc: 'Pact power poured into a single downward stroke. Once per turn, expend a spell slot when you hit with your pact weapon to deal an extra 1d8 Force damage per slot level plus 1d8, and knock a Large or smaller target Prone.',
    prereq: { level: 5, invocation: 'pact-of-the-blade' },
    mech: { passive: 'eldritch-smite', damageBonus: '1d8' },
  },
  'eldritch-spear': {
    id: 'eldritch-spear', name: 'Eldritch Spear',
    desc: 'The beam thins and reaches. Choose a warlock cantrip that has a range of at least 10 feet; that range becomes 300 feet.',
    prereq: { cantrip: 'any-warlock-damage' },
    mech: { passive: 'eldritch-spear' },
  },
  'fiendish-vigor': {
    id: 'fiendish-vigor', name: 'Fiendish Vigor',
    desc: 'Borrowed vitality, and no questions asked about whose. You can cast False Life on yourself at will as a level 1 spell, always gaining the maximum Temporary Hit Points.',
    prereq: null,
    mech: { freeCasts: [{ spellId: 'false-life', atWill: true, self: true, maximized: true }], tempHpFormula: '9' },
  },
  'gaze-of-two-minds': {
    id: 'gaze-of-two-minds', name: 'Gaze of Two Minds',
    desc: 'A Harper trick your patron improved upon. As a Bonus Action, touch a willing creature and perceive through its senses until the end of your next turn, extendable each turn.',
    prereq: null,
    mech: { passive: 'gaze-of-two-minds' },
  },
  'gift-of-the-depths': {
    id: 'gift-of-the-depths', name: 'Gift of the Depths',
    desc: 'Something in the Sea of Swords has taken an interest. You can breathe underwater, gain a Swim Speed equal to your Speed, and can cast Water Breathing once per Long Rest without a slot.',
    prereq: { level: 5 },
    mech: { passive: 'water-breathing', freeCasts: [{ spellId: 'water-breathing', uses: 1, recharge: 'long' }] },
  },
  'gift-of-the-ever-living-ones': {
    id: 'gift-of-the-ever-living-ones', name: 'Gift of the Ever-Living Ones',
    desc: 'Your familiar holds the wound closed with something that is not quite hands. While it is within 100 feet, any healing dice you roll for yourself count as their maximum.',
    prereq: { invocation: 'pact-of-the-chain' },
    mech: { passive: 'max-healing-dice' },
  },
  'investment-of-the-chain-master': {
    id: 'investment-of-the-chain-master', name: 'Investment of the Chain Master',
    desc: 'You pour pact power into the familiar itself. It gains a 40-foot Fly or Swim Speed, its attacks use your spell save DC, and you can command it as a Bonus Action.',
    prereq: { invocation: 'pact-of-the-chain' },
    mech: { passive: 'chain-master' },
  },
  'lessons-of-the-first-ones': {
    id: 'lessons-of-the-first-ones', name: 'Lessons of the First Ones',
    desc: 'Your patron teaches you something older than Netheril. You gain one Origin feat of your choice.',
    prereq: null,
    mech: { passive: 'bonus-origin-feat' },
  },
  'lifedrinker': {
    id: 'lifedrinker', name: 'Lifedrinker',
    desc: 'The pact weapon takes a tithe of every wound. Once per turn it deals extra Necrotic, Psychic or Radiant damage equal to your Charisma modifier, and you gain that many Temporary Hit Points.',
    prereq: { level: 9, invocation: 'pact-of-the-blade' },
    mech: { passive: 'lifedrinker', damageBonus: 'cha', tempHpFormula: 'cha' },
  },
  'mask-of-many-faces': {
    id: 'mask-of-many-faces', name: 'Mask of Many Faces',
    desc: 'A useful habit in Zhentarim company. You can cast Disguise Self at will, without a spell slot.',
    prereq: null,
    mech: { freeCasts: [{ spellId: 'disguise-self', atWill: true }] },
  },
  'master-of-myriad-forms': {
    id: 'master-of-myriad-forms', name: 'Master of Myriad Forms',
    desc: 'Flesh becomes a suggestion you can revise. You can cast Alter Self at will, without a spell slot.',
    prereq: { level: 5 },
    mech: { freeCasts: [{ spellId: 'alter-self', atWill: true }] },
  },
  'misty-visions': {
    id: 'misty-visions', name: 'Misty Visions',
    desc: 'You show people the road they expected to find. You can cast Silent Image at will, without a spell slot.',
    prereq: null,
    mech: { freeCasts: [{ spellId: 'silent-image', atWill: true }] },
  },
  'one-with-shadows': {
    id: 'one-with-shadows', name: 'One with Shadows',
    desc: 'The dark of an Undermountain stair is a door if you know the trick. You can cast Invisibility on yourself once per Long Rest without a slot, and with a slot thereafter.',
    prereq: { level: 5 },
    mech: { freeCasts: [{ spellId: 'invisibility', uses: 1, recharge: 'long', self: true }] },
  },
  'otherworldly-leap': {
    id: 'otherworldly-leap', name: 'Otherworldly Leap',
    desc: 'You cross a chasm the way a thought crosses a room. You can cast Jump on yourself at will, without a spell slot.',
    prereq: null,
    mech: { freeCasts: [{ spellId: 'jump', atWill: true, self: true }], jumpMult: 2 },
  },
  'pact-of-the-blade': {
    id: 'pact-of-the-blade', name: 'Pact of the Blade',
    desc: 'As a Bonus Action you conjure a pact weapon out of nothing, or bind a magic weapon to yourself. It uses your Charisma for attack and damage rolls and you are proficient with it.',
    prereq: null,
    mech: { passive: 'pact-blade', weaponProf: ['pact-weapon'] },
  },
  'pact-of-the-chain': {
    id: 'pact-of-the-chain', name: 'Pact of the Chain',
    desc: 'Something small and clever agrees to serve — an imp, a quasit, a pseudodragon, a sprite. You always have Find Familiar prepared and can cast it as a Magic action without a slot once per Long Rest.',
    prereq: null,
    mech: { alwaysPrepared: ['find-familiar'], freeCasts: [{ spellId: 'find-familiar', uses: 1, recharge: 'long' }], passive: 'pact-chain' },
  },
  'pact-of-the-tome': {
    id: 'pact-of-the-tome', name: 'Pact of the Tome',
    desc: 'Your patron hands you a Book of Shadows: three cantrips from any list and two level 1 spells you can cast as Rituals, all with no slot cost.',
    prereq: null,
    mech: { passive: 'pact-tome' },
  },
  'repelling-blast': {
    id: 'repelling-blast', name: 'Repelling Blast',
    desc: 'Force with follow-through. When you hit a Large or smaller creature with a warlock cantrip that deals damage, you can push it up to 10 feet in a straight line.',
    prereq: { cantrip: 'any-warlock-damage' },
    mech: { passive: 'repelling-blast' },
  },
  'thirsting-blade': {
    id: 'thirsting-blade', name: 'Thirsting Blade',
    desc: 'The weapon wants the second swing more than you do. You can attack twice, instead of once, whenever you take the Attack action with your pact weapon.',
    prereq: { level: 5, invocation: 'pact-of-the-blade' },
    mech: { extraAttack: 1, passive: 'thirsting-blade' },
  },
  'visions-of-distant-realms': {
    id: 'visions-of-distant-realms', name: 'Visions of Distant Realms',
    desc: 'You send a piece of your sight ahead into the dark. You can cast Arcane Eye at will, without a spell slot.',
    prereq: { level: 9 },
    mech: { freeCasts: [{ spellId: 'arcane-eye', atWill: true }] },
  },
  'whispers-of-the-grave': {
    id: 'whispers-of-the-grave', name: 'Whispers of the Grave',
    desc: 'Kelemvor disapproves; your patron does not care. You can cast Speak with Dead at will, without a spell slot.',
    prereq: { level: 7 },
    mech: { freeCasts: [{ spellId: 'speak-with-dead', atWill: true }] },
  },
  'witch-sight': {
    id: 'witch-sight', name: 'Witch Sight',
    desc: 'No doppelganger in Waterdeep has ever kept a face in front of you. You see the true form of any shapechanger or creature concealed by illusion or transmutation within 30 feet.',
    prereq: { level: 15 },
    mech: { passive: 'witch-sight' },
  },
});

export const INVOCATION_IDS = deepFreeze(Object.keys(INVOCATIONS));

// ═══════════════════════════════════════════════════════════════════════════
// METAMAGIC (2024 PHB — 10 options). Costs are in Sorcery Points.
// ═══════════════════════════════════════════════════════════════════════════

export const METAMAGIC = deepFreeze({
  'careful-spell': {
    id: 'careful-spell', name: 'Careful Spell', cost: 1,
    desc: 'You bend the blast around your own people. Spend 1 Sorcery Point when you cast a spell that forces a save; a number of creatures equal to your Charisma modifier automatically succeed.',
    prereq: null,
    mech: { passive: 'metamagic-careful' },
  },
  'distant-spell': {
    id: 'distant-spell', name: 'Distant Spell', cost: 1,
    desc: 'Spend 1 Sorcery Point to double the range of a spell of 5 feet or more, or to make a Touch spell reach 30 feet.',
    prereq: null,
    mech: { passive: 'metamagic-distant' },
  },
  'empowered-spell': {
    id: 'empowered-spell', name: 'Empowered Spell', cost: 1,
    desc: 'Spend 1 Sorcery Point to reroll a number of damage dice up to your Charisma modifier, taking the new results.',
    prereq: null,
    mech: { passive: 'metamagic-empowered', reroll: 'cha' },
  },
  'extended-spell': {
    id: 'extended-spell', name: 'Extended Spell', cost: 1,
    desc: 'Spend 1 Sorcery Point to double the duration of a spell lasting 1 minute or longer, to a maximum of 24 hours, with advantage on Concentration saves for it.',
    prereq: null,
    mech: { passive: 'metamagic-extended' },
  },
  'heightened-spell': {
    id: 'heightened-spell', name: 'Heightened Spell', cost: 2,
    desc: 'Spend 2 Sorcery Points so that one target of a spell has disadvantage on saves against it for the whole duration.',
    prereq: null,
    mech: { passive: 'metamagic-heightened' },
  },
  'quickened-spell': {
    id: 'quickened-spell', name: 'Quickened Spell', cost: 2,
    desc: 'Spend 2 Sorcery Points to change a spell’s casting time from an action to a Bonus Action.',
    prereq: null,
    mech: { passive: 'metamagic-quickened' },
  },
  'seeking-spell': {
    id: 'seeking-spell', name: 'Seeking Spell', cost: 1,
    desc: 'Spend 1 Sorcery Point to reroll a missed spell attack roll, using the new result.',
    prereq: null,
    mech: { passive: 'metamagic-seeking' },
  },
  'subtle-spell': {
    id: 'subtle-spell', name: 'Subtle Spell', cost: 1,
    desc: 'The trick that keeps sorcerers alive in Thayan company. Spend 1 Sorcery Point to cast without Verbal, Somatic or non-costly Material components.',
    prereq: null,
    mech: { passive: 'metamagic-subtle' },
  },
  'transmuted-spell': {
    id: 'transmuted-spell', name: 'Transmuted Spell', cost: 1,
    desc: 'Spend 1 Sorcery Point to change a spell’s Acid, Cold, Fire, Lightning, Poison or Thunder damage into another of those types.',
    prereq: null,
    mech: { passive: 'metamagic-transmuted' },
  },
  'twinned-spell': {
    id: 'twinned-spell', name: 'Twinned Spell', cost: 1,
    desc: 'Spend 1 Sorcery Point when you cast a spell that targets only one creature and does not have a range of Self, to target a second creature with the same casting.',
    prereq: null,
    mech: { passive: 'metamagic-twinned' },
  },
});

export const METAMAGIC_IDS = deepFreeze(Object.keys(METAMAGIC));

// ═══════════════════════════════════════════════════════════════════════════
// SUBCLASSES — 49 entries, four or more for every one of the twelve classes.
//
//   SUBCLASSES[id] = { id, name, classId, desc, features:{lvl:[...]}, spells:{lvl:[...]} }
//
// `features` is keyed by CLASS level and must only use the levels listed in the
// matching CLASSES[classId].subclassFeatureLevels array. `spells` is keyed by the
// class level at which the always-prepared spells arrive (they never count against
// a caster’s prepared-spell maximum).
//
// Third-caster subclasses (Eldritch Knight, Arcane Trickster) carry an extra
// top-level `spellcasting` block with the same shape as CLASSES[].spellcasting,
// because the parent class has none of its own.
// ═══════════════════════════════════════════════════════════════════════════

// Third-caster cantrip/prepared tables, indexed by FIGHTER or ROGUE level.
const THIRD_CANTRIPS = [0, 0, 0, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3];
const THIRD_PREP = [0, 0, 0, 3, 4, 4, 4, 5, 6, 6, 7, 8, 8, 9, 10, 10, 11, 11, 11, 12, 13];

const THIRD_CASTER_WIZARD = {
  ability: 'int', type: 'prepared', list: 'wizard', ritual: false, focus: 'arcane',
  slotTable: 'third', cantripsKnown: THIRD_CANTRIPS, prepFormula: THIRD_PREP,
  spellsKnownTable: null,
};

export const SUBCLASSES = deepFreeze({

  // ═════════════════════════════════════════════════════════════════════════
  // BARBARIAN — subclass features at 3 / 6 / 10 / 14
  // ═════════════════════════════════════════════════════════════════════════

  'berserker': {
    id: 'berserker', name: 'Path of the Berserker', classId: 'barbarian',
    desc: 'The rage is not a tool — it is a door, and you have stopped closing it. Uthgardt of the Black Lion tribe and Northlander reavers off the Sea of Swords walk this path, and the Sleeping Giant in Phandalin has thrown out more than one of them.',
    spells: {},
    features: {
      3: [
        {
          id: 'frenzy', name: 'Frenzy',
          desc: 'Recklessness pays. While your Rage is active, if you attack recklessly the first target you hit on your turn takes extra damage — a number of d6s equal to your Rage Damage bonus, of your weapon’s type.',
          mech: { passive: 'berserker-frenzy', damageBonus: 'rage-dice-d6' },
        },
      ],
      6: [
        {
          id: 'mindless-rage', name: 'Mindless Rage',
          desc: 'There is no room left in your skull for fear or flattery. While raging you are immune to the Charmed and Frightened conditions, and entering a Rage ends either condition on you.',
          mech: { passive: 'berserker-mindless-rage', condImmune: ['charmed', 'frightened'] },
        },
      ],
      10: [
        {
          id: 'retaliation', name: 'Retaliation',
          desc: 'Strike you and you have already answered. When you take damage from a creature within 5 feet, you can spend your Reaction to make one melee attack against it.',
          mech: { passive: 'berserker-retaliation' },
        },
      ],
      14: [
        {
          id: 'intimidating-presence', name: 'Intimidating Presence',
          desc: 'You draw yourself up and let the beast look out through your eyes. As a Bonus Action, every creature of your choice in a 30-foot emanation must succeed on a Wisdom save or be Frightened of you for 1 minute.',
          uses: { max: 'rageDamage', recharge: 'long' },
          mech: { passive: 'berserker-intimidating-presence' },
        },
      ],
    },
  },

  'wild-heart': {
    id: 'wild-heart', name: 'Path of the Wild Heart', classId: 'barbarian',
    desc: 'You keep the old totem-bonds of the Uthgardt and the beast-lodges of the Neverwinter Wood, borrowing the shape of bear, eagle and wolf without ever leaving your own skin. Reidoth of Thundertree speaks to such barbarians as equals.',
    spells: {},
    features: {
      3: [
        {
          id: 'animal-speaker', name: 'Animal Speaker',
          desc: 'The tongues of beasts are not so different from your own. You can cast Beast Sense and Speak with Animals as Rituals, without needing them prepared.',
          mech: { alwaysPrepared: ['beast-sense', 'speak-with-animals'], passive: 'ritual-only-casting' },
        },
        {
          id: 'rage-of-the-wilds', name: 'Rage of the Wilds',
          desc: 'When you Rage you take on the ferocity of one of three great spirits, chosen anew each time the fury takes you.',
          choice: {
            type: 'subclassOption', count: 1, from: ['bear', 'eagle', 'wolf'],
            options: {
              bear: { id: 'bear', name: 'Bear', desc: 'While raging you have Resistance to every damage type except Force, Necrotic, Psychic and Radiant.', mech: { passive: 'wild-heart-bear' } },
              eagle: { id: 'eagle', name: 'Eagle', desc: 'When you Rage, and as a Bonus Action on later turns, you can take the Dash and Disengage actions together.', mech: { passive: 'wild-heart-eagle' } },
              wolf: { id: 'wolf', name: 'Wolf', desc: 'While raging, your allies have Advantage on attack rolls against enemies within 5 feet of you.', mech: { passive: 'wild-heart-wolf' } },
            },
          },
        },
      ],
      6: [
        {
          id: 'aspect-of-the-wilds', name: 'Aspect of the Wilds',
          desc: 'A permanent gift of the beast-spirits rides with you between rests, in fury or out of it.',
          choice: {
            type: 'subclassOption', count: 1, from: ['owl', 'panther', 'salmon'],
            options: {
              owl: { id: 'owl', name: 'Owl', desc: 'You gain Darkvision to 60 feet; if you already have it, its range increases by 60 feet.', mech: { darkvision: 60, passive: 'wild-heart-owl' } },
              panther: { id: 'panther', name: 'Panther', desc: 'You have a Climb Speed equal to your Speed.', mech: { passive: 'wild-heart-panther' } },
              salmon: { id: 'salmon', name: 'Salmon', desc: 'You have a Swim Speed equal to your Speed.', mech: { passive: 'wild-heart-salmon' } },
            },
          },
        },
      ],
      10: [
        {
          id: 'nature-speaker', name: 'Nature Speaker',
          desc: 'Stone, root and running water will answer a respectful question. You can cast Commune with Nature as a Ritual without preparing it.',
          mech: { alwaysPrepared: ['commune-with-nature'], passive: 'ritual-only-casting' },
        },
      ],
      14: [
        {
          id: 'power-of-the-wilds', name: 'Power of the Wilds',
          desc: 'The spirit that rides your Rage grows into something the old skalds would have called a god.',
          choice: {
            type: 'subclassOption', count: 1, from: ['falcon', 'lion', 'ram'],
            options: {
              falcon: { id: 'falcon', name: 'Falcon', desc: 'While raging and unarmoured you have a Fly Speed equal to your Speed.', mech: { passive: 'wild-heart-falcon' } },
              lion: { id: 'lion', name: 'Lion', desc: 'While raging, enemies within 5 feet have Disadvantage on attack rolls against anyone but you.', mech: { passive: 'wild-heart-lion' } },
              ram: { id: 'ram', name: 'Ram', desc: 'While raging, when you hit with a melee attack you can force a Strength save or knock the target Prone.', mech: { passive: 'wild-heart-ram' } },
            },
          },
        },
      ],
    },
  },

  'world-tree': {
    id: 'world-tree', name: 'Path of the World Tree', classId: 'barbarian',
    desc: 'You rage along the roots of the World Tree itself, the cosmic ash whose branches touch every plane. Northlander skalds sing of warriors who stepped between Toril and the Feywild mid-swing; the elves of the Ardeep Forest call it an old, dangerous courtesy.',
    spells: {},
    features: {
      3: [
        {
          id: 'vitality-of-the-tree', name: 'Vitality of the Tree',
          desc: 'Sap runs where blood should. When you Rage you gain Temporary Hit Points equal to your Barbarian level, and once on each of your turns while raging you can send a share of that vigour — a number of d6s equal to your Rage Damage bonus — to a creature within 10 feet.',
          mech: { tempHpFormula: 'level', passive: 'world-tree-vitality' },
        },
      ],
      6: [
        {
          id: 'branches-of-the-tree', name: 'Branches of the Tree',
          desc: 'Spectral branches snatch the fleeing back into reach. As a Reaction when a creature you can see starts its turn within 30 feet, you can teleport it beside you unless it succeeds on a Strength save; on a failure its Speed is 0 until the end of that turn.',
          mech: { passive: 'world-tree-branches' },
        },
      ],
      10: [
        {
          id: 'battering-roots', name: 'Battering Roots',
          desc: 'Your weapon strikes like a falling limb. Melee weapons you wield with the Heavy or Versatile property gain 10 extra feet of reach, and when you hit with one you can use the Push or Topple mastery in addition to any mastery you already used.',
          mech: { passive: 'world-tree-battering-roots' },
        },
      ],
      14: [
        {
          id: 'travel-along-the-tree', name: 'Travel Along the Tree',
          desc: 'You step sideways into the grain of the world. While raging, you can teleport up to 60 feet as a Bonus Action; once per Rage you can instead travel 150 feet and carry up to six willing creatures with you.',
          mech: { passive: 'world-tree-travel' },
        },
      ],
    },
  },

  'zealot': {
    id: 'zealot', name: 'Path of the Zealot', classId: 'barbarian',
    desc: 'A god poured wrath into you and forgot to include a lid. Tempus claims most zealots on the Sword Coast, Talos the rest; the priests of Ilmater refuse to bless them and bandage them anyway.',
    spells: {},
    features: {
      3: [
        {
          id: 'divine-fury', name: 'Divine Fury',
          desc: 'Your blows land wreathed in the light — or the rot — of your patron. While raging, the first creature you hit each turn takes extra damage equal to 1d6 plus half your Barbarian level, of the type you chose when you took this oath.',
          choice: {
            type: 'subclassOption', count: 1, from: ['radiant', 'necrotic'],
            options: {
              radiant: { id: 'radiant', name: 'Radiant Fury', desc: 'The wrath of Tempus, Torm or Lathander burns in your weapon.', mech: { passive: 'zealot-fury-radiant' } },
              necrotic: { id: 'necrotic', name: 'Necrotic Fury', desc: 'The cold favour of Talos, Bane or Myrkul eats at what you strike.', mech: { passive: 'zealot-fury-necrotic' } },
            },
          },
          mech: { passive: 'zealot-divine-fury' },
        },
        {
          id: 'warrior-of-the-gods', name: 'Warrior of the Gods',
          desc: 'Something is keeping you on your feet, and it is not you. You have a pool of four d12s; as a Bonus Action you can spend any number of them and regain that many Hit Points. The pool grows at 6th, 12th and 17th level and refills on a Long Rest.',
          uses: { max: [0, 0, 0, 4, 4, 4, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 7, 7, 7, 7, 7], recharge: 'long' },
          mech: { resource: { id: 'zealot-dice', name: 'Warrior of the Gods', max: 4, recharge: 'long' }, passive: 'zealot-warrior-of-the-gods' },
        },
      ],
      6: [
        {
          id: 'fanatical-focus', name: 'Fanatical Focus',
          desc: 'Faith argues with the dice and usually wins. Once per Rage, when you fail a saving throw, you can reroll it and add your Rage Damage bonus to the new roll.',
          mech: { reroll: 'save', passive: 'zealot-fanatical-focus' },
        },
      ],
      10: [
        {
          id: 'zealous-presence', name: 'Zealous Presence',
          desc: 'You bellow your god’s name and ten hearts remember why they came. As a Bonus Action, up to ten creatures within 60 feet gain Advantage on attack rolls and saving throws until the start of your next turn.',
          uses: { max: 1, recharge: 'long' },
          mech: { passive: 'zealot-zealous-presence' },
        },
      ],
      14: [
        {
          id: 'rage-beyond-death', name: 'Rage Beyond Death',
          desc: 'Kelemvor’s clerks have your name written down and crossed out twice. While your Rage is active, dropping to 0 Hit Points does not knock you Unconscious — you fight on, making death saves as normal, and die only if the Rage ends while you are still at 0.',
          mech: { passive: 'zealot-rage-beyond-death' },
        },
      ],
    },
  },

  // ═════════════════════════════════════════════════════════════════════════
  // BARD — subclass features at 3 / 6 / 14
  // ═════════════════════════════════════════════════════════════════════════

  'dance': {
    id: 'dance', name: 'College of Dance', classId: 'bard',
    desc: 'Your magic lives in motion — a reel, a duellist’s slip, the swaying step of the Moonstone Mask’s finest. Dancers of this college keep the old Lliiran rites in Waterdeep and can spend a whole tavern brawl without once being touched.',
    spells: {},
    features: {
      3: [
        {
          id: 'dazzling-footwork', name: 'Dazzling Footwork',
          desc: 'Unarmoured and unshielded, you are harder to hit than a rumour. Your AC equals 10 + your Dexterity and Charisma modifiers, your Unarmed Strikes deal Bludgeoning damage equal to your Bardic Inspiration die, and when you spend Bardic Inspiration you can make one Unarmed Strike as a Bonus Action.',
          mech: { acFormula: { base: 10, addDex: true, addAbility: 'cha', cap: null }, unarmedDie: 'bardic', passive: 'dance-dazzling-footwork' },
        },
      ],
      6: [
        {
          id: 'inspiring-movement', name: 'Inspiring Movement',
          desc: 'You give ground beautifully, and take someone with you. As a Reaction when an enemy moves within 5 feet, spend a Bardic Inspiration to move up to half your Speed; one ally within 30 feet may use their Reaction to do the same.',
          mech: { passive: 'dance-inspiring-movement' },
        },
        {
          id: 'tandem-footwork', name: 'Tandem Footwork',
          desc: 'The whole party catches your rhythm before the first blow falls. When you roll Initiative you can spend a Bardic Inspiration, roll the die, and add the result to your own Initiative and that of every ally within 30 feet who can see or hear you.',
          mech: { passive: 'dance-tandem-footwork' },
        },
      ],
      14: [
        {
          id: 'leading-evasion', name: 'Leading Evasion',
          desc: 'The blast goes where you are not, and you take your friends with you. When an effect lets you make a Dexterity save for half damage, you instead take none on a success and half on a failure — and any ally within 5 feet who can see you shares that benefit.',
          mech: { passive: 'dance-leading-evasion' },
        },
      ],
    },
  },

  'glamour': {
    id: 'glamour', name: 'College of Glamour', classId: 'bard',
    desc: 'You learned your art in the Feywild, or from something that had been there, and a little of that unbearable courtly beauty came home with you. Bards of Glamour are welcome at the Moonstone Mask and quietly watched by the Harpers.',
    spells: {
      3: ['charm-person', 'mirror-image'],
      6: ['command'],
    },
    features: {
      3: [
        {
          id: 'beguiling-magic', name: 'Beguiling Magic',
          desc: 'Your enchantments leave an afterimage on the mind. You always have Charm Person and Mirror Image prepared, and once per Short or Long Rest, after casting an Enchantment or Illusion spell, one creature within 60 feet must succeed on a Wisdom save or be Charmed or Frightened for 1 minute.',
          uses: { max: 1, recharge: 'short' },
          mech: { alwaysPrepared: ['charm-person', 'mirror-image'], passive: 'glamour-beguiling-magic' },
        },
        {
          id: 'mantle-of-inspiration', name: 'Mantle of Inspiration',
          desc: 'For one shining moment you are worth dying beside. As a Bonus Action, spend a Bardic Inspiration: a number of creatures equal to your Charisma modifier within 60 feet each gain Temporary Hit Points equal to a roll of your Bardic die plus your Charisma modifier, and may immediately move their Speed without provoking Opportunity Attacks.',
          mech: { tempHpFormula: 'bardic+cha', passive: 'glamour-mantle-of-inspiration' },
        },
      ],
      6: [
        {
          id: 'mantle-of-majesty', name: 'Mantle of Majesty',
          desc: 'You put on the face of a Summer Court noble and orders simply happen. As a Bonus Action you cast Command without a spell slot; for 1 minute you can repeat it each turn as a Bonus Action, and creatures already Charmed by you fail automatically.',
          uses: { max: 1, recharge: 'long' },
          mech: { alwaysPrepared: ['command'], freeCasts: 1, passive: 'glamour-mantle-of-majesty' },
        },
      ],
      14: [
        {
          id: 'unbreakable-majesty', name: 'Unbreakable Majesty',
          desc: 'To raise a hand against you feels like vandalism. As a Bonus Action, for 1 minute, any creature that tries to attack you must first make a Charisma save; on a failure it must choose a new target or lose the attack, and on a success it has Disadvantage on saves against your spells.',
          uses: { max: 1, recharge: 'short' },
          mech: { passive: 'glamour-unbreakable-majesty' },
        },
      ],
    },
  },

  'lore': {
    id: 'lore', name: 'College of Lore', classId: 'bard',
    desc: 'You collect what people would rather forget: ballads, ledgers, the true name of the man who burned the Tresendar. Oghma’s libraries in Waterdeep and the Harpers both recruit heavily from this college, and neither trusts the other with the results.',
    spells: {},
    features: {
      3: [
        {
          id: 'lore-bonus-proficiencies', name: 'Bonus Proficiencies',
          desc: 'Three more fields you can speak on with unearned confidence — and, as it turns out, earned skill.',
          choice: { type: 'skill', count: 3, from: 'auto' },
          mech: { passive: 'lore-bonus-proficiencies' },
        },
        {
          id: 'cutting-words', name: 'Cutting Words',
          desc: 'A remark, precisely timed, unmakes a swordsman. As a Reaction, spend a Bardic Inspiration to subtract the die from a creature’s attack roll, ability check or damage roll within 60 feet.',
          mech: { passive: 'lore-cutting-words' },
        },
      ],
      6: [
        {
          id: 'magical-discoveries', name: 'Magical Discoveries',
          desc: 'You have read things bards are not meant to read. Learn two spells from the Cleric, Druid or Wizard lists; they are always prepared and never count against your prepared maximum.',
          choice: { type: 'spell', count: 2, from: 'cleric|druid|wizard' },
          mech: { passive: 'lore-magical-discoveries' },
        },
      ],
      14: [
        {
          id: 'peerless-skill', name: 'Peerless Skill',
          desc: 'You have never been wrong, only briefly under-informed. When you fail an ability check or an attack roll, you can spend a Bardic Inspiration, roll the die and add it — possibly turning the failure into a success.',
          mech: { passive: 'lore-peerless-skill' },
        },
      ],
    },
  },

  'valor': {
    id: 'valor', name: 'College of Valor', classId: 'bard',
    desc: 'Skalds of the Northlanders and battle-poets of the Lords’ Alliance who sing from inside the shield wall, so the deed and its telling are never separated. Sildar Hallwinter will buy one a drink on sight.',
    spells: {},
    features: {
      3: [
        {
          id: 'valor-martial-training', name: 'Martial Training',
          desc: 'A song is worth more when the singer survives it. You gain proficiency with Martial weapons and training with Medium armour and Shields, and you can use any Simple or Martial weapon as a Spellcasting Focus.',
          mech: { weaponProf: ['martial'], armorProf: ['medium', 'shields'], passive: 'valor-weapon-focus' },
        },
        {
          id: 'combat-inspiration', name: 'Combat Inspiration',
          desc: 'Your inspiration is a tactical instruction, not a compliment. A creature holding your Bardic Inspiration can add the die to a damage roll it makes, or — as a Reaction — to its AC against one attack.',
          mech: { passive: 'valor-combat-inspiration' },
        },
      ],
      6: [
        {
          id: 'valor-extra-attack', name: 'Extra Attack',
          desc: 'You attack twice when you take the Attack action, and you can replace one of those attacks with a cantrip that takes an action to cast.',
          mech: { extraAttack: 1, passive: 'valor-cantrip-swap' },
        },
      ],
      14: [
        {
          id: 'battle-magic', name: 'Battle Magic',
          desc: 'The verse and the sword-stroke share one breath. When you cast a spell using an action, you can make one weapon attack as a Bonus Action.',
          mech: { passive: 'valor-battle-magic' },
        },
      ],
    },
  },

  // ═════════════════════════════════════════════════════════════════════════
  // CLERIC — subclass features at 3 / 6 / 17; domain spells at 3 / 5 / 7 / 9
  // ═════════════════════════════════════════════════════════════════════════

  'life': {
    id: 'life', name: 'Life Domain', classId: 'cleric',
    desc: 'The domain of Chauntea, Ilmater and Lathander: the stubborn insistence that a wound can be closed and a life continued. Sister Garaele keeps the Shrine of Luck in Phandalin, but it is Life clerics who carry the wounded back down from Icespire Peak.',
    spells: {
      3: ['aid', 'bless', 'cure-wounds', 'lesser-restoration'],
      5: ['mass-healing-word', 'revivify'],
      7: ['death-ward', 'guardian-of-faith'],
      9: ['greater-restoration', 'mass-cure-wounds'],
    },
    features: {
      3: [
        {
          id: 'disciple-of-life', name: 'Disciple of Life',
          desc: 'Your healing carries more than the spell intended. Whenever a spell you cast with a slot restores Hit Points, the target regains an extra 2 Hit Points plus the slot’s level.',
          mech: { passive: 'life-disciple-of-life' },
        },
        {
          id: 'preserve-life', name: 'Channel Divinity: Preserve Life',
          desc: 'You spend your god’s own regard on the dying. As a Magic action, distribute Hit Points equal to five times your Cleric level among creatures within 30 feet, though none may be raised above half its Hit Point maximum.',
          mech: { passive: 'life-preserve-life' },
        },
      ],
      6: [
        {
          id: 'blessed-healer', name: 'Blessed Healer',
          desc: 'The mercy you pour out splashes back. When a spell you cast with a slot restores Hit Points to someone else, you regain 2 Hit Points plus the slot’s level.',
          mech: { passive: 'life-blessed-healer' },
        },
      ],
      17: [
        {
          id: 'supreme-healing', name: 'Supreme Healing',
          desc: 'You no longer ask the dice how much life to give. When you roll dice to restore Hit Points with a spell, use the highest possible result for each die instead of rolling.',
          mech: { passive: 'life-supreme-healing' },
        },
      ],
    },
  },

  'light': {
    id: 'light', name: 'Light Domain', classId: 'cleric',
    desc: 'Lathander’s dawn, Selûne’s moonlight and the sun-fire of Amaunator: light as an argument that cannot be shouted down. Light clerics keep the shrines along the High Road burning because the Mere of Dead Men is very close and very patient.',
    spells: {
      3: ['burning-hands', 'faerie-fire', 'scorching-ray', 'see-invisibility'],
      5: ['daylight', 'fireball'],
      7: ['arcane-eye', 'wall-of-fire'],
      9: ['flame-strike', 'scrying'],
    },
    features: {
      3: [
        {
          id: 'radiance-of-the-dawn', name: 'Channel Divinity: Radiance of the Dawn',
          desc: 'You call up the morning wherever you stand. As a Magic action, magical darkness within 30 feet is dispelled and each enemy in the emanation takes 2d10 Radiant damage plus your Cleric level, or half as much on a successful Constitution save.',
          mech: { passive: 'light-radiance-of-the-dawn' },
        },
        {
          id: 'warding-flare', name: 'Warding Flare',
          desc: 'A flare of sunfire across the eyes at exactly the wrong moment. As a Reaction when a creature within 60 feet makes an attack roll, impose Disadvantage on it.',
          uses: { max: 'wis', recharge: 'long' },
          mech: { passive: 'light-warding-flare' },
        },
      ],
      6: [
        {
          id: 'improved-warding-flare', name: 'Improved Warding Flare',
          desc: 'The dazzle now leaves comfort behind it. Warding Flare regains all its uses on a Short Rest, and the creature you protected gains Temporary Hit Points equal to 2d6 plus your Wisdom modifier.',
          uses: { max: 'wis', recharge: 'short' },
          mech: { tempHpFormula: '2d6+wis', passive: 'light-improved-warding-flare' },
        },
      ],
      17: [
        {
          id: 'corona-of-light', name: 'Corona of Light',
          desc: 'You become the dawn, briefly and literally. As a Magic action, shed bright sunlight in a 60-foot radius for 1 minute; enemies within it have Disadvantage on saving throws against your spells that deal Fire or Radiant damage.',
          uses: { max: 1, recharge: 'long' },
          mech: { passive: 'light-corona-of-light' },
        },
      ],
    },
  },

  'trickery': {
    id: 'trickery', name: 'Trickery Domain', classId: 'cleric',
    desc: 'The clergy of Mask, Tymora at her most mischievous, and Garl Glittergold, who hold that a lie told to a tyrant is a prayer. Halia Thornton would deny knowing any, which is how you know she does.',
    spells: {
      3: ['charm-person', 'disguise-self', 'invisibility', 'pass-without-trace'],
      5: ['hypnotic-pattern', 'nondetection'],
      7: ['confusion', 'dimension-door'],
      9: ['dominate-person', 'modify-memory'],
    },
    features: {
      3: [
        {
          id: 'blessing-of-the-trickster', name: 'Blessing of the Trickster',
          desc: 'A small, deniable miracle. As a Magic action you touch a willing creature — or yourself — and for 1 hour it has Advantage on Dexterity (Stealth) checks.',
          mech: { passive: 'trickery-blessing-of-the-trickster' },
        },
        {
          id: 'invoke-duplicity', name: 'Channel Divinity: Invoke Duplicity',
          desc: 'A second you steps out of the air, perfectly convincing and entirely hollow. As a Bonus Action create an illusory double within 30 feet for 1 minute; you can cast spells as though standing in its space, and you have Advantage on attacks against any creature caught between you both.',
          mech: { passive: 'trickery-invoke-duplicity' },
        },
      ],
      6: [
        {
          id: 'tricksters-transposition', name: 'Trickster’s Transposition',
          desc: 'Which of you was ever the real one? Whenever you move your duplicate as a Bonus Action, you can teleport and swap places with it.',
          mech: { passive: 'trickery-transposition' },
        },
      ],
      17: [
        {
          id: 'improved-duplicity', name: 'Improved Duplicity',
          desc: 'The double has grown solid enough to hearten those who stand near it. Whenever you or an ally begins a turn within 5 feet of the illusion, that creature gains Temporary Hit Points equal to 1d10 plus your Wisdom modifier.',
          mech: { tempHpFormula: '1d10+wis', passive: 'trickery-improved-duplicity' },
        },
      ],
    },
  },

  'war': {
    id: 'war', name: 'War Domain', classId: 'cleric',
    desc: 'Tempus keeps no cowards and plays no favourites; his priests bless both shield walls and mean it. In Neverwinter the House of Tempus stands a stone’s throw from the Protector’s Enclave, and its clerics march with every Lords’ Alliance column that leaves for Leilon.',
    spells: {
      3: ['divine-favor', 'shield-of-faith', 'magic-weapon', 'spiritual-weapon'],
      5: ['crusaders-mantle', 'spirit-guardians'],
      7: ['fire-shield', 'freedom-of-movement'],
      9: ['hold-monster', 'steel-wind-strike'],
    },
    features: {
      3: [
        {
          id: 'war-priest', name: 'War Priest',
          desc: 'You were taught the liturgy and the shield wall in the same season. You gain proficiency with Martial weapons and training with Heavy armour, and when you take the Attack action you can make one extra attack as a Bonus Action.',
          uses: { max: 'wis', recharge: 'short' },
          mech: { weaponProf: ['martial'], armorProf: ['heavy'], passive: 'war-priest-bonus-attack' },
        },
        {
          id: 'guided-strike', name: 'Channel Divinity: Guided Strike',
          desc: 'Tempus nudges the blade. After you make an attack roll, add +10 to it — the god does not care whether you needed the help.',
          mech: { passive: 'war-guided-strike' },
        },
      ],
      6: [
        {
          id: 'war-gods-blessing', name: 'Channel Divinity: War God’s Blessing',
          desc: 'The favour is transferable. As a Reaction when a creature within 30 feet makes an attack roll, you grant it the +10 of Guided Strike instead of taking it yourself.',
          mech: { passive: 'war-gods-blessing' },
        },
      ],
      17: [
        {
          id: 'avatar-of-battle', name: 'Avatar of Battle',
          desc: 'Blades find you and slide away. You have Resistance to Bludgeoning, Piercing and Slashing damage from all sources.',
          mech: { resist: ['bludgeoning', 'piercing', 'slashing'], passive: 'war-avatar-of-battle' },
        },
      ],
    },
  },

  'tempest': {
    id: 'tempest', name: 'Tempest Domain', classId: 'cleric',
    desc: 'The domain of Talos the Destroyer and Umberlee the Bitch Queen, whose worship on the Sword Coast is less devotion than protection money. Tempest clerics sail out of Neverwinter’s harbour because a storm respects nothing else.',
    spells: {
      3: ['fog-cloud', 'thunderwave', 'gust-of-wind', 'shatter'],
      5: ['call-lightning', 'sleet-storm'],
      7: ['control-water', 'ice-storm'],
      9: ['destructive-wave', 'insect-plague'],
    },
    features: {
      3: [
        {
          id: 'wrath-of-the-storm', name: 'Wrath of the Storm',
          desc: 'Strike a servant of Talos and the sky answers for him. As a Reaction when a creature within 5 feet hits you, it takes 2d8 Lightning or Thunder damage, halved on a successful Dexterity save.',
          uses: { max: 'wis', recharge: 'long' },
          mech: { passive: 'tempest-wrath-of-the-storm' },
        },
        {
          id: 'destructive-wrath', name: 'Channel Divinity: Destructive Wrath',
          desc: 'The storm does not roll dice. When you deal Lightning or Thunder damage, deal the maximum possible result instead of rolling.',
          mech: { passive: 'tempest-destructive-wrath' },
        },
      ],
      6: [
        {
          id: 'thunderbolt-strike', name: 'Thunderbolt Strike',
          desc: 'Every bolt of yours hits like a wave off the Sea of Swords. When you deal Lightning damage to a Large or smaller creature, you can push it up to 10 feet away.',
          mech: { passive: 'tempest-thunderbolt-strike' },
        },
      ],
      17: [
        {
          id: 'stormborn', name: 'Stormborn',
          desc: 'Under open sky you belong to the weather. You have a Fly Speed equal to your walking Speed whenever you are not underground or indoors.',
          mech: { passive: 'tempest-stormborn' },
        },
      ],
    },
  },

  // ═════════════════════════════════════════════════════════════════════════
  // DRUID — subclass features at 3 / 6 / 10 / 14; circle spells at 3 / 5 / 7 / 9
  // ═════════════════════════════════════════════════════════════════════════

  'land': {
    id: 'land', name: 'Circle of the Land', classId: 'druid',
    desc: 'You are bound to a particular country — the pine dark of Neverwinter Wood, the salt reek of the Mere of Dead Men, the frost of the Spine of the World — and it lends you its temper. Reidoth of Thundertree is the Circle’s best-known voice on the Sword Coast.',
    spells: {},
    features: {
      3: [
        {
          id: 'land-spells', name: 'Circle of the Land Spells',
          desc: 'Choose the land you are sworn to; its magic is always prepared for you, and you may swear yourself to a different country after each Long Rest.',
          choice: {
            type: 'subclassOption', count: 1, from: ['arid', 'polar', 'temperate', 'tropical'],
            options: {
              arid: {
                id: 'arid', name: 'Arid Land', desc: 'The Anauroch sands and the scorched shoulders of the Sword Mountains.',
                spells: { 3: ['burning-hands', 'blur'], 5: ['fireball', 'blight'], 7: ['fire-shield', 'wall-of-fire'], 9: ['flame-strike', 'insect-plague'] },
                mech: { passive: 'land-arid' },
              },
              polar: {
                id: 'polar', name: 'Polar Land', desc: 'The Reghed glacier, the Spine of the World, and Auril’s long grudge.',
                spells: { 3: ['fog-cloud', 'hold-person'], 5: ['sleet-storm', 'slow'], 7: ['freedom-of-movement', 'ice-storm'], 9: ['cone-of-cold', 'commune-with-nature'] },
                mech: { passive: 'land-polar' },
              },
              temperate: {
                id: 'temperate', name: 'Temperate Land', desc: 'Neverwinter Wood, the Ardeep, and the green hills above Phandalin.',
                spells: { 3: ['misty-step', 'shatter'], 5: ['lightning-bolt', 'sleet-storm'], 7: ['freedom-of-movement', 'ice-storm'], 9: ['commune-with-nature', 'tree-stride'] },
                mech: { passive: 'land-temperate' },
              },
              tropical: {
                id: 'tropical', name: 'Tropical Land', desc: 'The Mere of Dead Men and the fever-swamps of the far south.',
                spells: { 3: ['ray-of-sickness', 'web'], 5: ['stinking-cloud', 'protection-from-energy'], 7: ['polymorph', 'stoneskin'], 9: ['insect-plague', 'contagion'] },
                mech: { passive: 'land-tropical' },
              },
            },
          },
          mech: { passive: 'land-circle-spells' },
        },
        {
          id: 'lands-aid', name: 'Land’s Aid',
          desc: 'The ground itself takes a side. As a Magic action, expend a use of Wild Shape to fill a 10-foot sphere within 60 feet with grasping life: enemies there take 2d6 Necrotic damage, halved on a Constitution save, and one creature of your choice regains 2d6 Hit Points.',
          mech: { passive: 'land-lands-aid' },
        },
      ],
      6: [
        {
          id: 'natural-recovery', name: 'Natural Recovery',
          desc: 'The land gives back what you spend on it. Once per Long Rest you can cast one of your Circle spells without a slot, and on a Short Rest you recover expended spell slots totalling half your Druid level, rounded up.',
          uses: { max: 1, recharge: 'long' },
          mech: { freeCasts: 1, passive: 'land-natural-recovery' },
        },
      ],
      10: [
        {
          id: 'natures-ward', name: 'Nature’s Ward',
          desc: 'What kills that country cannot kill you. You are immune to the Poisoned condition and gain Resistance to the damage type of your chosen land — Fire, Cold, Lightning or Poison.',
          mech: { condImmune: ['poisoned'], passive: 'land-natures-ward' },
        },
      ],
      14: [
        {
          id: 'natures-sanctuary', name: 'Nature’s Sanctuary',
          desc: 'You call up a grove of spectral trees that were never planted. As a Magic action, expend a use of Wild Shape to create a 15-foot cube of spirit-wood within 120 feet for 1 minute; you and your allies inside have Half Cover and Resistance to your land’s damage type.',
          mech: { passive: 'land-natures-sanctuary' },
        },
      ],
    },
  },

  'moon': {
    id: 'moon', name: 'Circle of the Moon', classId: 'druid',
    desc: 'Selûne’s druids, who guard the wild places by becoming them — and who are the reason travellers on the Triboar Trail do not shoot at every bear they see. In the Neverwinter Wood they change under the moon and change back before dawn, mostly.',
    spells: {
      3: ['cure-wounds', 'moonbeam', 'starry-wisp'],
      5: ['conjure-animals'],
      7: ['fount-of-moonlight'],
      9: ['insect-plague'],
    },
    features: {
      3: [
        {
          id: 'circle-forms', name: 'Circle Forms',
          desc: 'Your beast shapes are war-forms, not disguises. While Wild Shaped your AC is 13 plus your Wisdom modifier, you gain Temporary Hit Points equal to three times your Druid level, and you may assume beasts of Challenge Rating up to a third of your Druid level.',
          mech: { wildShape: { acFormula: { base: 13, addAbility: 'wis' }, crMax: 'level/3', tempHp: 'level*3' }, passive: 'moon-circle-forms' },
        },
      ],
      6: [
        {
          id: 'improved-circle-forms', name: 'Improved Circle Forms',
          desc: 'The beast begins to carry your magic with it. While Wild Shaped you can add your Wisdom modifier to Constitution saves, your attacks count as magical, and you can expend a spell slot to regain 1d8 Hit Points per slot level.',
          mech: { passive: 'moon-improved-circle-forms' },
        },
      ],
      10: [
        {
          id: 'moonlight-step', name: 'Moonlight Step',
          desc: 'You step into a shaft of moonlight and out of another. As a Bonus Action, teleport up to 30 feet to a space you can see and gain Advantage on your next attack roll this turn.',
          uses: { max: 'wis', recharge: 'long' },
          mech: { passive: 'moon-moonlight-step' },
        },
      ],
      14: [
        {
          id: 'lunar-form', name: 'Lunar Form',
          desc: 'Moonfire runs under the fur. Once per turn while Wild Shaped, your Unarmed Strikes deal an extra 2d10 Radiant damage, and Moonlight Step can carry one willing creature within 5 feet along with you.',
          mech: { passive: 'moon-lunar-form' },
        },
      ],
    },
  },

  'sea': {
    id: 'sea', name: 'Circle of the Sea', classId: 'druid',
    desc: 'You keep the covenant that Umberlee refuses to keep: druids of the Sea walk the Sword Coast from Waterdeep harbour to the Mere of Dead Men, calling squalls down on slavers and hauling drowned sailors back out of the surf.',
    spells: {
      3: ['fog-cloud', 'gust-of-wind', 'thunderwave', 'shatter'],
      5: ['lightning-bolt', 'water-breathing'],
      7: ['control-water', 'ice-storm'],
      9: ['conjure-elemental', 'hold-monster'],
    },
    features: {
      3: [
        {
          id: 'wrath-of-the-sea', name: 'Wrath of the Sea',
          desc: 'Cold spray wheels around you like a small, furious tide. As a Bonus Action, expend a use of Wild Shape to raise a 5-foot emanation of seawater for 10 minutes; on each of your turns you can force one creature in it to make a Constitution save, taking Cold damage and being pushed 15 feet on a failure.',
          mech: { passive: 'sea-wrath-of-the-sea' },
        },
      ],
      6: [
        {
          id: 'aquatic-affinity', name: 'Aquatic Affinity',
          desc: 'The water knows you now. Your emanation grows to 10 feet, and you gain a Swim Speed equal to your walking Speed.',
          mech: { passive: 'sea-aquatic-affinity' },
        },
      ],
      10: [
        {
          id: 'sea-stormborn', name: 'Stormborn',
          desc: 'You rise on your own weather. While your emanation persists you have a Fly Speed equal to your walking Speed and Resistance to Cold, Lightning and Thunder damage.',
          mech: { resist: ['cold', 'lightning', 'thunder'], passive: 'sea-stormborn' },
        },
      ],
      14: [
        {
          id: 'oceanic-gift', name: 'Oceanic Gift',
          desc: 'You can give the storm away. When you use Wrath of the Sea you may raise the emanation around a willing creature within 60 feet instead of yourself, or spend two uses of Wild Shape to maintain both at once.',
          mech: { passive: 'sea-oceanic-gift' },
        },
      ],
    },
  },

  'stars': {
    id: 'stars', name: 'Circle of the Stars', classId: 'druid',
    desc: 'You read the sky the way the old Netherese did, and the constellations answer by settling over your body in cold light. Star-druids keep vigil at Old Owl Well, where a Netherese ruin still points at something above the Sword Mountains.',
    spells: {},
    features: {
      3: [
        {
          id: 'star-map', name: 'Star Map',
          desc: 'You carry a chart of the night — parchment, hide, or a memory you cannot put down. You always have Guidance and Guiding Bolt prepared, and you can cast Guiding Bolt without a slot a number of times equal to your Wisdom modifier per Long Rest.',
          uses: { max: 'wis', recharge: 'long' },
          mech: { alwaysPrepared: ['guidance', 'guiding-bolt'], freeCasts: 'wis', passive: 'stars-star-map' },
        },
        {
          id: 'starry-form', name: 'Starry Form',
          desc: 'As a Bonus Action, expend a use of Wild Shape to become a constellation of cold fire for 10 minutes, taking one of three shapes.',
          choice: {
            type: 'subclassOption', count: 1, from: ['archer', 'chalice', 'dragon'],
            options: {
              archer: { id: 'archer', name: 'Archer', desc: 'As a Bonus Action, make a ranged spell attack against a creature within 60 feet for 2d8 Radiant damage plus your Wisdom modifier.', mech: { passive: 'stars-archer' } },
              chalice: { id: 'chalice', name: 'Chalice', desc: 'Whenever you cast a spell that restores Hit Points, you or another creature within 30 feet regains an extra 1d8 plus your Wisdom modifier.', mech: { passive: 'stars-chalice' } },
              dragon: { id: 'dragon', name: 'Dragon', desc: 'When you make an Intelligence or Wisdom check, or a Constitution save to maintain Concentration, treat a d20 roll of 9 or lower as a 10.', mech: { passive: 'stars-dragon' } },
            },
          },
          mech: { passive: 'stars-starry-form' },
        },
      ],
      6: [
        {
          id: 'cosmic-omen', name: 'Cosmic Omen',
          desc: 'After each Long Rest you consult your map and read weal or woe in it. As a Reaction when a creature within 30 feet makes an attack roll, ability check or saving throw, you add 1d6 to the roll under a Weal omen, or subtract 1d6 under Woe.',
          uses: { max: 'wis', recharge: 'long' },
          mech: { passive: 'stars-cosmic-omen' },
        },
      ],
      10: [
        {
          id: 'twinkling-constellations', name: 'Twinkling Constellations',
          desc: 'The stars over you shift as you fight. Archer and Chalice now roll 2d8, the Dragon grants a Fly Speed of 20 feet with hovering, and you can change your constellation at the start of each of your turns.',
          mech: { passive: 'stars-twinkling-constellations' },
        },
      ],
      14: [
        {
          id: 'full-of-stars', name: 'Full of Stars',
          desc: 'You are more diagram than flesh. While in your Starry Form you have Resistance to Bludgeoning, Piercing and Slashing damage.',
          mech: { resist: ['bludgeoning', 'piercing', 'slashing'], passive: 'stars-full-of-stars' },
        },
      ],
    },
  },

  // ═════════════════════════════════════════════════════════════════════════
  // FIGHTER — subclass features at 3 / 7 / 10 / 15 / 18
  // ═════════════════════════════════════════════════════════════════════════

  'battle-master': {
    id: 'battle-master', name: 'Battle Master', classId: 'fighter',
    desc: 'War is a craft with named techniques, and you learned them from a drillmaster who counted your mistakes aloud. The Lords’ Alliance trains its officers this way; Sildar Hallwinter can still recite the parry drills in his sleep.',
    spells: {},
    features: {
      3: [
        {
          id: 'combat-superiority', name: 'Combat Superiority',
          desc: 'You have four Superiority Dice (d8) and three maneuvers. Spending a die powers a maneuver; the save DC against them is 8 + your Proficiency Bonus + your Strength or Dexterity modifier. You regain all dice on a Short or Long Rest.',
          uses: { max: [0, 0, 0, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6, 6], recharge: 'short' },
          choice: { type: 'maneuver', count: 3, from: MANEUVER_IDS },
          mech: { resource: { id: 'superiority', name: 'Superiority Dice', max: 4, recharge: 'short' }, passive: 'battle-master-superiority' },
        },
        {
          id: 'student-of-war', name: 'Student of War',
          desc: 'The academy taught the fitting of armour as well as the wearing of it. Gain proficiency with one type of Artisan’s Tools and one skill from the Fighter list.',
          choice: { type: 'skill', count: 1, from: 'auto' },
          mech: { toolProf: ['smiths-tools'], passive: 'battle-master-student-of-war' },
        },
      ],
      7: [
        {
          id: 'know-your-enemy', name: 'Know Your Enemy',
          desc: 'You read a foe the way a smith reads a flawed blade. As a Bonus Action, study a creature within 30 feet and learn its Immunities, Resistances and Vulnerabilities. You also learn two more maneuvers.',
          choice: { type: 'maneuver', count: 2, from: MANEUVER_IDS },
          mech: { passive: 'battle-master-know-your-enemy' },
        },
      ],
      10: [
        {
          id: 'improved-combat-superiority', name: 'Improved Combat Superiority',
          desc: 'Your Superiority Dice become d10s, and you learn two further maneuvers.',
          choice: { type: 'maneuver', count: 2, from: MANEUVER_IDS },
          mech: { passive: 'battle-master-superiority-d10' },
        },
      ],
      15: [
        {
          id: 'relentless', name: 'Relentless',
          desc: 'You never quite run out. When you roll Initiative and have no Superiority Dice left, you regain one — and you learn two more maneuvers.',
          choice: { type: 'maneuver', count: 2, from: MANEUVER_IDS },
          mech: { passive: 'battle-master-relentless' },
        },
      ],
      18: [
        {
          id: 'ultimate-combat-superiority', name: 'Ultimate Combat Superiority',
          desc: 'Your Superiority Dice become d12s. There is no drill left that you have not made your own.',
          mech: { passive: 'battle-master-superiority-d12' },
        },
      ],
    },
  },

  'champion': {
    id: 'champion', name: 'Champion', classId: 'fighter',
    desc: 'No tricks, no doctrine — simply the finest edge, the longest wind and a habit of landing the killing blow. Champions win the pit fights in the Sleeping Giant and the melee tourneys held outside Waterdeep’s walls at Highharvestide.',
    spells: {},
    features: {
      3: [
        {
          id: 'improved-critical', name: 'Improved Critical',
          desc: 'Your weapon attacks score a Critical Hit on a roll of 19 or 20.',
          mech: { critRange: 19, passive: 'champion-improved-critical' },
        },
        {
          id: 'remarkable-athlete', name: 'Remarkable Athlete',
          desc: 'You are simply faster off the mark than other people. You have Advantage on Initiative rolls and Strength (Athletics) checks, and immediately after scoring a Critical Hit you can move up to half your Speed without provoking Opportunity Attacks.',
          mech: { advVs: ['initiative', 'athletics'], skillProf: ['athletics'], passive: 'champion-remarkable-athlete' },
        },
      ],
      7: [
        {
          id: 'additional-fighting-style', name: 'Additional Fighting Style',
          desc: 'You take up a second discipline of arms and wear it as easily as the first.',
          choice: { type: 'fightingStyle', count: 1, from: 'auto' },
          mech: { passive: 'champion-additional-fighting-style' },
        },
      ],
      10: [
        {
          id: 'heroic-warrior', name: 'Heroic Warrior',
          desc: 'The fight itself puts heart into you. During any combat, you gain Heroic Inspiration at the start of each of your turns if you do not already have it.',
          mech: { passive: 'champion-heroic-warrior' },
        },
      ],
      15: [
        {
          id: 'superior-critical', name: 'Superior Critical',
          desc: 'Your weapon attacks now score a Critical Hit on a roll of 18 to 20.',
          mech: { critRange: 18, passive: 'champion-superior-critical' },
        },
      ],
      18: [
        {
          id: 'survivor', name: 'Survivor',
          desc: 'You are extremely difficult to finish. You have Advantage on Death Saving Throws, and at the start of each of your turns you regain 5 Hit Points plus your Constitution modifier if you are below half your Hit Point maximum and above 0.',
          mech: { passive: 'champion-survivor' },
        },
      ],
    },
  },

  'eldritch-knight': {
    id: 'eldritch-knight', name: 'Eldritch Knight', classId: 'fighter',
    desc: 'A soldier who took the Art seriously, binding ward and blade into one discipline. Blackstaff Tower in Waterdeep tolerates them; the war-wizards who guard the caravans on the High Road are almost all trained this way.',
    spellcasting: THIRD_CASTER_WIZARD,
    spells: {},
    features: {
      3: [
        {
          id: 'ek-spellcasting', name: 'Spellcasting',
          desc: 'You have learned to hold a spell in the same hand as a sword. You cast Wizard spells using Intelligence, favouring Abjuration and Evocation, and you can use a weapon you are bonded to as your Spellcasting Focus.',
          mech: { passive: 'third-caster-wizard' },
          choice: { type: 'cantrip', count: 2, from: 'wizard' },
        },
        {
          id: 'war-bond', name: 'War Bond',
          desc: 'A ritual of an hour ties a weapon to your hand and your name. You can bond with up to two weapons; a bonded weapon cannot be disarmed from you against your will, and you can summon it to your hand as a Bonus Action from anywhere on the same plane.',
          mech: { passive: 'ek-war-bond' },
        },
      ],
      7: [
        {
          id: 'war-magic', name: 'War Magic',
          desc: 'The cantrip is just another way to swing. When you take the Attack action you can replace one of your attacks with a Wizard cantrip that has a casting time of an action.',
          mech: { passive: 'ek-war-magic' },
        },
      ],
      10: [
        {
          id: 'eldritch-strike', name: 'Eldritch Strike',
          desc: 'Steel opens the way for the spell behind it. When you hit a creature with a weapon, it has Disadvantage on the next saving throw it makes against a spell you cast before the end of your next turn.',
          mech: { passive: 'ek-eldritch-strike' },
        },
      ],
      15: [
        {
          id: 'arcane-charge', name: 'Arcane Charge',
          desc: 'You spend the surge of Action Surge on distance. When you use Action Surge you can teleport up to 30 feet to a space you can see, before or after the extra action.',
          mech: { passive: 'ek-arcane-charge' },
        },
      ],
      18: [
        {
          id: 'improved-war-magic', name: 'Improved War Magic',
          desc: 'Now whole spells fit inside the rhythm of the Attack action. When you take the Attack action you can replace one attack with a casting of a level 1 or 2 Wizard spell that has a casting time of an action.',
          mech: { passive: 'ek-improved-war-magic' },
        },
      ],
    },
  },

  'psi-warrior': {
    id: 'psi-warrior', name: 'Psi Warrior', classId: 'fighter',
    desc: 'Something woke behind your eyes — an inheritance, a Netherese scar, or the touch of an elder brain in the Underdark — and now the air itself takes your orders. Psi Warriors are hunted by the mind flayers below Waterdeep for reasons nobody enjoys speculating about.',
    spells: {},
    features: {
      3: [
        {
          id: 'psionic-power', name: 'Psionic Power',
          desc: 'You carry a reservoir of Psionic Energy Dice equal to twice your Proficiency Bonus, beginning as d6s and growing with your level. Protective Field spends one as a Reaction to reduce damage to a creature within 30 feet, Psionic Strike adds one to a weapon hit as Force damage, and Telekinetic Movement shifts an object or a willing creature 30 feet.',
          uses: { max: 'prof*2', recharge: 'long' },
          mech: { resource: { id: 'psionic-dice', name: 'Psionic Energy', max: 'prof*2', recharge: 'long' }, passive: 'psi-warrior-psionic-power' },
        },
      ],
      7: [
        {
          id: 'telekinetic-adept', name: 'Telekinetic Adept',
          desc: 'You throw yourself as easily as you throw a foe. Psi-Powered Leap gives you a Fly Speed of twice your Speed until the end of your turn as a Bonus Action, and Telekinetic Thrust lets a Psionic Strike knock the target Prone or shove it 10 feet on a failed Strength save.',
          mech: { passive: 'psi-warrior-telekinetic-adept' },
        },
      ],
      10: [
        {
          id: 'guarded-mind', name: 'Guarded Mind',
          desc: 'Your thoughts have walls now, and they are load-bearing. You have Resistance to Psychic damage, and if you start your turn Charmed or Frightened you can spend a Psionic Energy Die to end those conditions on yourself.',
          mech: { resist: ['psychic'], passive: 'psi-warrior-guarded-mind' },
        },
      ],
      15: [
        {
          id: 'bulwark-of-force', name: 'Bulwark of Force',
          desc: 'You raise invisible shields over the people who matter. As a Bonus Action, a number of creatures within 30 feet equal to your Intelligence modifier gain Half Cover for 1 minute.',
          uses: { max: 1, recharge: 'long' },
          mech: { passive: 'psi-warrior-bulwark-of-force' },
        },
      ],
      18: [
        {
          id: 'telekinetic-master', name: 'Telekinetic Master',
          desc: 'You can cast Telekinesis without a spell slot once per Long Rest, or by spending a Psionic Energy Die, and while you concentrate on it you can make one weapon attack as a Bonus Action on each of your turns.',
          uses: { max: 1, recharge: 'long' },
          mech: { alwaysPrepared: ['telekinesis'], freeCasts: 1, passive: 'psi-warrior-telekinetic-master' },
        },
      ],
    },
  },

  // ═════════════════════════════════════════════════════════════════════════
  // MONK — subclass features at 3 / 6 / 11 / 17
  // ═════════════════════════════════════════════════════════════════════════

  'open-hand': {
    id: 'open-hand', name: 'Warrior of the Open Hand', classId: 'monk',
    desc: 'The oldest and plainest of the martial traditions: a body used with total honesty. Monasteries of the Yellow Rose and the Dark Moon both teach it, and a wandering Ilmatari brother once cleared the Sleeping Giant of Redbrands without drawing a weapon.',
    spells: {},
    features: {
      3: [
        {
          id: 'open-hand-technique', name: 'Open Hand Technique',
          desc: 'Every strike can also be an instruction. When you hit with a Flurry of Blows attack you can impose one effect: Addle, so the target cannot take Reactions; Push, shoving it 15 feet on a failed Strength save; or Topple, knocking it Prone on a failed Dexterity save.',
          mech: { passive: 'open-hand-technique' },
        },
      ],
      6: [
        {
          id: 'wholeness-of-body', name: 'Wholeness of Body',
          desc: 'You close your own wounds by deciding to. As a Bonus Action, regain Hit Points equal to your Martial Arts die plus your Wisdom modifier.',
          uses: { max: 'wis', recharge: 'long' },
          mech: { passive: 'open-hand-wholeness-of-body' },
        },
      ],
      11: [
        {
          id: 'fleet-step', name: 'Fleet Step',
          desc: 'Motion has become your resting state. Whenever you take a Bonus Action other than Step of the Wind, you also take Step of the Wind for free.',
          mech: { passive: 'open-hand-fleet-step' },
        },
      ],
      17: [
        {
          id: 'quivering-palm', name: 'Quivering Palm',
          desc: 'You set a lethal vibration humming in a body and choose, later, when to still it. Spend 4 Focus Points on an Unarmed Strike hit; as an action within the next 23 hours you end the vibration, and the target drops to 0 Hit Points on a failed Constitution save, or takes 10d12 Force damage on a success.',
          mech: { passive: 'open-hand-quivering-palm' },
        },
      ],
    },
  },

  'shadow': {
    id: 'shadow', name: 'Warrior of Shadow', classId: 'monk',
    desc: 'Trained by the Shadow-touched monasteries whose Shar-worshipping abbots do not advertise, you borrow the Shadowfell’s darkness one breath at a time. Such monks make excellent Harper agents and terrible houseguests.',
    spells: {},
    features: {
      3: [
        {
          id: 'shadow-arts', name: 'Shadow Arts',
          desc: 'You learn the Minor Illusion cantrip, cast with Wisdom, and you can spend 1 Focus Point to cast Darkness without a slot — and you see through your own darkness as though it were dim light.',
          mech: { cantrip: { spellId: 'minor-illusion', ability: 'wis' }, alwaysPrepared: ['darkness'], passive: 'shadow-arts' },
        },
      ],
      6: [
        {
          id: 'shadow-step', name: 'Shadow Step',
          desc: 'One shadow is much like another. While in Dim Light or Darkness, as a Bonus Action you teleport up to 60 feet to an unoccupied space you can see that is also in dim light or darkness, and gain Advantage on your next melee attack this turn.',
          mech: { passive: 'shadow-step' },
        },
      ],
      11: [
        {
          id: 'improved-shadow-step', name: 'Improved Shadow Step',
          desc: 'You no longer need to begin in darkness — only to end there. Shadow Step works from any space, and as part of the same Bonus Action you can make one Unarmed Strike immediately after arriving.',
          mech: { passive: 'shadow-improved-step' },
        },
      ],
      17: [
        {
          id: 'cloak-of-shadows', name: 'Cloak of Shadows',
          desc: 'You pull the dark over yourself like a hood. As a Magic action, spend 3 Focus Points to become Invisible for 1 minute; the effect ends early the instant you make an attack roll, deal damage or force a saving throw.',
          mech: { passive: 'shadow-cloak-of-shadows' },
        },
      ],
    },
  },

  'mercy': {
    id: 'mercy', name: 'Warrior of Mercy', classId: 'monk',
    desc: 'Masked healers in the tradition of Ilmater the Crying God, who understand that the hand which knits a wound knows exactly where to open one. They walk the Triboar Trail after raids and are never asked to pay for a room.',
    spells: {},
    features: {
      3: [
        {
          id: 'hand-of-healing', name: 'Hand of Healing',
          desc: 'As a Magic action, spend 1 Focus Point to touch a creature and restore Hit Points equal to your Martial Arts die plus your Wisdom modifier — and you can replace one Flurry of Blows attack with this touch.',
          mech: { passive: 'mercy-hand-of-healing' },
        },
        {
          id: 'hand-of-harm', name: 'Hand of Harm',
          desc: 'The same knowledge, turned around. Once per turn when you hit with an Unarmed Strike, spend 1 Focus Point to deal extra Necrotic damage equal to your Martial Arts die plus your Wisdom modifier.',
          mech: { passive: 'mercy-hand-of-harm' },
        },
      ],
      6: [
        {
          id: 'physicians-touch', name: 'Physician’s Touch',
          desc: 'Your Hand of Healing also ends the Blinded, Deafened, Paralyzed, Poisoned or Stunned condition, and your Hand of Harm leaves the target Poisoned until the end of your next turn.',
          mech: { passive: 'mercy-physicians-touch' },
        },
      ],
      11: [
        {
          id: 'flurry-of-healing-and-harm', name: 'Flurry of Healing and Harm',
          desc: 'You mend and maim in a single blurred sequence. When you use Flurry of Blows you can replace each attack with a Hand of Healing without spending Focus, and once per turn a Flurry hit can carry Hand of Harm for free.',
          mech: { passive: 'mercy-flurry-of-healing-and-harm' },
        },
      ],
      17: [
        {
          id: 'hand-of-ultimate-mercy', name: 'Hand of Ultimate Mercy',
          desc: 'You reach after someone who has already gone. As a Magic action, spend 5 Focus Points to touch a creature dead no more than 24 hours: it returns to life with 4d10 plus your Wisdom modifier Hit Points, free of every condition it died with.',
          uses: { max: 1, recharge: 'long' },
          mech: { passive: 'mercy-hand-of-ultimate-mercy' },
        },
      ],
    },
  },

  'elements': {
    id: 'elements', name: 'Warrior of the Elements', classId: 'monk',
    desc: 'You reach through your own breath into the Elemental Chaos, and it comes back up your arm. The tradition is strongest among monks trained near Mount Hotenow, where the fire under Neverwinter never entirely went out.',
    spells: {},
    features: {
      3: [
        {
          id: 'manipulate-elements', name: 'Manipulate Elements',
          desc: 'You learn the Elementalism cantrip, cast with Wisdom — small, constant sorceries of flame, frost, wind and stone.',
          mech: { cantrip: { spellId: 'elementalism', ability: 'wis' }, passive: 'elements-manipulate' },
        },
        {
          id: 'elemental-attunement', name: 'Elemental Attunement',
          desc: 'As a Bonus Action, spend 1 Focus Point to wrap yourself in an element for 10 minutes: your Unarmed Strikes gain 10 feet of reach and deal your chosen damage type, and once per turn a hit can pull or push the target 10 feet.',
          choice: {
            type: 'subclassOption', count: 1, from: ['acid', 'cold', 'fire', 'lightning', 'thunder'],
            options: {
              acid: { id: 'acid', name: 'Acid', desc: 'The black bile of the Underdark oozes along your knuckles.', mech: { passive: 'elements-acid' } },
              cold: { id: 'cold', name: 'Cold', desc: 'Auril’s frost rimes your wrists and cracks as you strike.', mech: { passive: 'elements-cold' } },
              fire: { id: 'fire', name: 'Fire', desc: 'Hotenow’s ember-heat runs down your forearms.', mech: { passive: 'elements-fire' } },
              lightning: { id: 'lightning', name: 'Lightning', desc: 'Talos’s spite arcs between your fingers.', mech: { passive: 'elements-lightning' } },
              thunder: { id: 'thunder', name: 'Thunder', desc: 'Every blow lands with the crack of surf on the Sword Coast.', mech: { passive: 'elements-thunder' } },
            },
          },
          mech: { passive: 'elements-attunement' },
        },
      ],
      6: [
        {
          id: 'elemental-burst', name: 'Elemental Burst',
          desc: 'You throw the element off you all at once. As a Magic action, spend 2 Focus Points to fill a 20-foot sphere within 120 feet: 3d8 damage of your chosen type, halved on a successful Dexterity save. The damage grows to 4d8 at 11th level and 5d8 at 17th.',
          mech: { passive: 'elements-burst' },
        },
      ],
      11: [
        {
          id: 'stride-of-the-elements', name: 'Stride of the Elements',
          desc: 'While your Elemental Attunement lasts, you have a Swim Speed and a Fly Speed equal to your walking Speed.',
          mech: { passive: 'elements-stride' },
        },
      ],
      17: [
        {
          id: 'elemental-epitome', name: 'Elemental Epitome',
          desc: 'You are not channelling the element any more; you are briefly made of it. While attuned you have Resistance to your chosen damage type, your Unarmed Strikes deal an extra 1d12 of it once per turn, and the element grants a further gift — speed, a shove, or a searing aura.',
          mech: { passive: 'elements-epitome' },
        },
      ],
    },
  },

  // ═════════════════════════════════════════════════════════════════════════
  // PALADIN — subclass features at 3 / 7 / 15 / 20; oath spells at 3 / 5 / 9 / 13 / 17
  // ═════════════════════════════════════════════════════════════════════════

  'devotion': {
    id: 'devotion', name: 'Oath of Devotion', classId: 'paladin',
    desc: 'The shining oath — honesty, courage, duty — sworn before Torm, Helm or Tyr and kept when it costs everything. Daran Edermath took this oath in his youth and still stands like a man who has never once put it down.',
    spells: {
      3: ['protection-from-evil-and-good', 'shield-of-faith'],
      5: ['aid', 'zone-of-truth'],
      9: ['beacon-of-hope', 'dispel-magic'],
      13: ['freedom-of-movement', 'guardian-of-faith'],
      17: ['commune', 'flame-strike'],
    },
    features: {
      3: [
        {
          id: 'sacred-weapon', name: 'Channel Divinity: Sacred Weapon',
          desc: 'You speak the oath over your blade and it answers in light. As a Bonus Action, for 10 minutes your weapon counts as magical, sheds bright light in a 20-foot radius, and you add your Charisma modifier to attack rolls made with it.',
          mech: { passive: 'devotion-sacred-weapon' },
        },
      ],
      7: [
        {
          id: 'aura-of-devotion', name: 'Aura of Devotion',
          desc: 'Nothing gets a hook into the people standing behind you. You and your allies in your aura are immune to the Charmed condition; the aura widens to 30 feet at 18th level.',
          mech: { aura: { radius: 10, radiusAt18: 30, condImmune: ['charmed'] }, passive: 'devotion-aura-of-devotion' },
        },
      ],
      15: [
        {
          id: 'smite-of-protection', name: 'Smite of Protection',
          desc: 'Radiance sprays outward from the blow and settles over your companions. When you cast Divine Smite, you and your allies in your aura gain Half Cover for 1 minute.',
          mech: { passive: 'devotion-smite-of-protection' },
        },
      ],
      20: [
        {
          id: 'holy-nimbus', name: 'Holy Nimbus',
          desc: 'For ten minutes you are an argument the dark cannot answer. As a Bonus Action, bright light fills a 30-foot emanation; enemies that start their turn in it take 2d8 Radiant damage, and you have Advantage on saves against spells cast by fiends and undead.',
          uses: { max: 1, recharge: 'long' },
          mech: { passive: 'devotion-holy-nimbus' },
        },
      ],
    },
  },

  'glory': {
    id: 'glory', name: 'Oath of Glory', classId: 'paladin',
    desc: 'You swore to become the tale they tell afterwards, in the tradition of the old heroes whose names still hang over the gates of Waterdeep. Bards love these paladins; quartermasters do not.',
    spells: {
      3: ['guiding-bolt', 'heroism'],
      5: ['enhance-ability', 'magic-weapon'],
      9: ['haste', 'protection-from-energy'],
      13: ['compulsion', 'freedom-of-movement'],
      17: ['commune', 'flame-strike'],
    },
    features: {
      3: [
        {
          id: 'peerless-athlete', name: 'Channel Divinity: Peerless Athlete',
          desc: 'As a Bonus Action, for 1 hour you have Advantage on Athletics and Acrobatics checks, your carrying capacity doubles, and you jump 10 feet further than usual in any direction.',
          mech: { passive: 'glory-peerless-athlete', carryMult: 2 },
        },
        {
          id: 'inspiring-smite', name: 'Channel Divinity: Inspiring Smite',
          desc: 'The flash of your smite puts heart into everyone who sees it. Immediately after you cast Divine Smite, distribute Temporary Hit Points equal to 2d8 plus your Paladin level among creatures of your choice within 30 feet.',
          mech: { tempHpFormula: '2d8+level', passive: 'glory-inspiring-smite' },
        },
      ],
      7: [
        {
          id: 'aura-of-alacrity', name: 'Aura of Alacrity',
          desc: 'Your Speed increases by 10 feet, and any ally who starts their turn in your aura gains 10 feet of Speed until the end of that turn. The aura widens to 10 feet at 18th level.',
          mech: { speedBonus: 10, aura: { radius: 5, radiusAt18: 10, speedBonus: 10 }, passive: 'glory-aura-of-alacrity' },
        },
      ],
      15: [
        {
          id: 'glorious-defense', name: 'Glorious Defense',
          desc: 'You turn a killing blow aside with a flourish and answer it. As a Reaction when you or a creature within 10 feet is hit, add your Charisma modifier to the target’s AC — possibly turning the hit into a miss — and if it misses, make one weapon attack against the attacker.',
          uses: { max: 'cha', recharge: 'long' },
          mech: { passive: 'glory-glorious-defense' },
        },
      ],
      20: [
        {
          id: 'living-legend', name: 'Living Legend',
          desc: 'For ten minutes the story tells itself around you: Advantage on Charisma checks, one missed attack per turn becomes a hit, and a failed saving throw can be rerolled once each turn.',
          uses: { max: 1, recharge: 'long' },
          mech: { reroll: 'save', passive: 'glory-living-legend' },
        },
      ],
    },
  },

  'ancients': {
    id: 'ancients', name: 'Oath of the Ancients', classId: 'paladin',
    desc: 'The green oath, older than the gods of law: guard light, laughter and living things wherever the dark reaches for them. Sworn under the boughs of the Ardeep Forest and honoured by the Emerald Enclave, whose Springwardens will always give such a knight a bed.',
    spells: {
      3: ['ensnaring-strike', 'speak-with-animals'],
      5: ['misty-step', 'moonbeam'],
      9: ['plant-growth', 'protection-from-energy'],
      13: ['ice-storm', 'stoneskin'],
      17: ['commune-with-nature', 'tree-stride'],
    },
    features: {
      3: [
        {
          id: 'natures-wrath', name: 'Channel Divinity: Nature’s Wrath',
          desc: 'Spectral vines burst out of ground that has no roots in it. As a Magic action, each creature of your choice within 15 feet must succeed on a Strength save or be Restrained for 1 minute, repeating the save at the end of each of its turns.',
          mech: { passive: 'ancients-natures-wrath' },
        },
      ],
      7: [
        {
          id: 'aura-of-warding', name: 'Aura of Warding',
          desc: 'The old magic keeps a green circle around you. You and your allies in your aura have Resistance to Necrotic, Psychic and Radiant damage; the aura widens to 30 feet at 18th level.',
          mech: { aura: { radius: 10, radiusAt18: 30, resist: ['necrotic', 'psychic', 'radiant'] }, passive: 'ancients-aura-of-warding' },
        },
      ],
      15: [
        {
          id: 'undying-sentinel', name: 'Undying Sentinel',
          desc: 'The oath will not let you fall while there is work left. When you are reduced to 0 Hit Points and not killed outright, you can drop to 1 Hit Point instead — and you no longer age.',
          uses: { max: 1, recharge: 'long' },
          mech: { passive: 'ancients-undying-sentinel' },
        },
      ],
      20: [
        {
          id: 'elder-champion', name: 'Elder Champion',
          desc: 'You take on the aspect of a thing that has guarded a wood for four hundred years. As a Bonus Action, for 1 minute you regain 10 Hit Points at the start of each of your turns, cast Paladin spells with a Bonus Action, and enemies within 10 feet have Disadvantage on saves against your spells and Channel Divinity.',
          uses: { max: 1, recharge: 'long' },
          mech: { passive: 'ancients-elder-champion' },
        },
      ],
    },
  },

  'vengeance': {
    id: 'vengeance', name: 'Oath of Vengeance', classId: 'paladin',
    desc: 'Some wrongs are not forgiven, only ended. Vengeance paladins ride out of Neverwinter after Cult of the Dragon cells and Zhentarim slavers, and the Order of the Gauntlet quietly funds them while pretending not to know their names.',
    spells: {
      3: ['bane', 'hunters-mark'],
      5: ['hold-person', 'misty-step'],
      9: ['haste', 'protection-from-energy'],
      13: ['banishment', 'dimension-door'],
      17: ['hold-monster', 'scrying'],
    },
    features: {
      3: [
        {
          id: 'vow-of-enmity', name: 'Channel Divinity: Vow of Enmity',
          desc: 'You name your quarry aloud and the oath does the rest. As a Bonus Action, mark a creature within 30 feet for 1 minute: you have Advantage on attack rolls against it, and when it drops to 0 Hit Points you can move the vow to another creature as a Bonus Action.',
          mech: { passive: 'vengeance-vow-of-enmity' },
        },
      ],
      7: [
        {
          id: 'relentless-avenger', name: 'Relentless Avenger',
          desc: 'Nothing you have sworn against escapes by walking. When you hit with an Opportunity Attack, you can move up to half your Speed immediately afterwards without provoking Opportunity Attacks.',
          mech: { passive: 'vengeance-relentless-avenger' },
        },
      ],
      15: [
        {
          id: 'soul-of-vengeance', name: 'Soul of Vengeance',
          desc: 'The vow answers before you do. As a Reaction when a creature under your Vow of Enmity makes an attack, you can make one melee attack against it.',
          mech: { passive: 'vengeance-soul-of-vengeance' },
        },
      ],
      20: [
        {
          id: 'avenging-angel', name: 'Avenging Angel',
          desc: 'Wings of terrible light unfold and the guilty know it. As a Bonus Action, for 10 minutes you gain a Fly Speed of 60 feet, and enemies that start their turn within 30 feet must succeed on a Wisdom save or be Frightened of you for 1 minute.',
          uses: { max: 1, recharge: 'long' },
          mech: { passive: 'vengeance-avenging-angel' },
        },
      ],
    },
  },

  // ═════════════════════════════════════════════════════════════════════════
  // RANGER — subclass features at 3 / 7 / 11 / 15; subclass spells at 3 / 5 / 9 / 13 / 17
  // ═════════════════════════════════════════════════════════════════════════

  'beast-master': {
    id: 'beast-master', name: 'Beast Master', classId: 'ranger',
    desc: 'A bond with one animal, made deliberately and kept for life — a mastiff off the Triboar Trail, a hawk out of the Sword Mountains, an otter from the Neverwinter River. Qelline Alderleaf will tell you it is the only sensible way to travel.',
    spells: {},
    features: {
      3: [
        {
          id: 'primal-companion', name: 'Primal Companion',
          desc: 'As a Magic action you expend a spell slot to summon a primal beast of the Land, Sea or Sky, which fights beside you with statistics that scale to your Ranger level. It acts on your turn, taking the Dodge action unless you spend a Bonus Action to command it.',
          choice: {
            type: 'subclassOption', count: 1, from: ['beast-of-the-land', 'beast-of-the-sea', 'beast-of-the-sky'],
            options: {
              'beast-of-the-land': { id: 'beast-of-the-land', name: 'Beast of the Land', desc: 'A wolf, a boar, a great cat — 40 feet of speed and a knockdown charge.', mech: { passive: 'beast-companion-land' } },
              'beast-of-the-sea': { id: 'beast-of-the-sea', name: 'Beast of the Sea', desc: 'An otter, a serpent, a reef-shark, at home in the Sea of Swords.', mech: { passive: 'beast-companion-sea' } },
              'beast-of-the-sky': { id: 'beast-of-the-sky', name: 'Beast of the Sky', desc: 'A hawk or raven that strikes and is gone before the answer comes.', mech: { passive: 'beast-companion-sky' } },
            },
          },
          mech: { passive: 'ranger-primal-companion' },
        },
      ],
      7: [
        {
          id: 'exceptional-training', name: 'Exceptional Training',
          desc: 'The beast has learned more than fetch. When you command it with a Bonus Action, it can also take the Dash, Disengage, Dodge or Help action, and its attacks count as magical.',
          mech: { passive: 'beast-master-exceptional-training' },
        },
      ],
      11: [
        {
          id: 'bestial-fury', name: 'Bestial Fury',
          desc: 'Your companion attacks twice whenever you command it to attack, and once per turn one of its hits deals an extra 2d6 Force damage.',
          mech: { passive: 'beast-master-bestial-fury' },
        },
      ],
      15: [
        {
          id: 'share-spells', name: 'Share Spells',
          desc: 'What you drink, it drinks. When you cast a spell targeting yourself, you can also affect your primal companion if it is within 30 feet.',
          mech: { passive: 'beast-master-share-spells' },
        },
      ],
    },
  },

  'fey-wanderer': {
    id: 'fey-wanderer', name: 'Fey Wanderer', classId: 'ranger',
    desc: 'You have walked in the Feywild and it left a mark — a glamour, an odd shadow, a laugh that lands wrong. Rangers like you patrol the crossings in the Ardeep Forest and the strange stretches of Neverwinter Wood where the trees are too tall by half.',
    spells: {
      3: ['charm-person'],
      5: ['misty-step'],
      9: ['dispel-magic'],
      13: ['dimension-door'],
      17: ['mislead'],
    },
    features: {
      3: [
        {
          id: 'dreadful-strikes', name: 'Dreadful Strikes',
          desc: 'Your blows carry a whisper of the Gloaming Court. Once per turn when you hit with a weapon, deal an extra 1d4 Psychic damage, rising to 1d6 at 11th level.',
          mech: { damageBonus: '1d4-psychic', passive: 'fey-wanderer-dreadful-strikes' },
        },
        {
          id: 'otherworldly-glamour', name: 'Otherworldly Glamour',
          desc: 'People agree with you slightly faster than they meant to. Add your Wisdom modifier (minimum +1) to every Charisma check you make, and gain proficiency in one Charisma skill.',
          choice: { type: 'skill', count: 1, from: ['deception', 'intimidation', 'performance', 'persuasion'] },
          mech: { passive: 'fey-wanderer-otherworldly-glamour' },
        },
      ],
      7: [
        {
          id: 'beguiling-twist', name: 'Beguiling Twist',
          desc: 'You catch a broken enchantment and throw it at someone else. You have Advantage on saves against being Charmed or Frightened, and when a creature within 120 feet succeeds on such a save, you can use a Reaction to force another creature within 120 feet to make a Wisdom save or be Charmed or Frightened for 1 minute.',
          mech: { advSaveVs: ['charmed', 'frightened'], passive: 'fey-wanderer-beguiling-twist' },
        },
      ],
      11: [
        {
          id: 'fey-reinforcements', name: 'Fey Reinforcements',
          desc: 'You call in a favour owed by something with too many teeth for its smile. You always have Summon Fey prepared and can cast it once per Long Rest without a spell slot; the fey you call can attack twice.',
          uses: { max: 1, recharge: 'long' },
          mech: { alwaysPrepared: ['summon-fey'], freeCasts: 1, passive: 'fey-wanderer-reinforcements' },
        },
      ],
      15: [
        {
          id: 'misty-wanderer', name: 'Misty Wanderer',
          desc: 'You slip through the thin places without thinking about it. Cast Misty Step without a spell slot a number of times equal to your Wisdom modifier per Long Rest, and bring one willing creature within 5 feet along.',
          uses: { max: 'wis', recharge: 'long' },
          mech: { alwaysPrepared: ['misty-step'], freeCasts: 'wis', passive: 'fey-wanderer-misty-wanderer' },
        },
      ],
    },
  },

  'gloom-stalker': {
    id: 'gloom-stalker', name: 'Gloom Stalker', classId: 'ranger',
    desc: 'You hunt where the light gives out: Undermountain’s lower halls, the Underdark reaches below the Sword Mountains, the black galleries of Wave Echo Cave. Things that have never seen the sun learn to fear a shape that arrives before its own footsteps.',
    spells: {
      3: ['disguise-self'],
      5: ['rope-trick'],
      9: ['fear'],
      13: ['greater-invisibility'],
      17: ['seeming'],
    },
    features: {
      3: [
        {
          id: 'dread-ambusher', name: 'Dread Ambusher',
          desc: 'The first six seconds belong to you. Add your Wisdom modifier to Initiative; on your first turn of each combat your Speed increases by 10 feet, and if you take the Attack action you can make one extra attack that deals an extra 1d8 Psychic damage.',
          uses: { max: 'prof', recharge: 'long' },
          mech: { initiativeBonus: 0, passive: 'gloom-stalker-dread-ambusher' },
        },
        {
          id: 'umbral-sight', name: 'Umbral Sight',
          desc: 'The dark is a door you have the key to. You gain Darkvision to 60 feet — or 30 feet further if you already have it — and while in Darkness you are Invisible to any creature that relies on Darkvision to see you.',
          mech: { darkvision: 60, passive: 'gloom-stalker-umbral-sight' },
        },
      ],
      7: [
        {
          id: 'iron-mind', name: 'Iron Mind',
          desc: 'Whatever whispers in the deep places, you have stopped listening. You gain proficiency in Wisdom saving throws, or in Intelligence or Charisma saves if you already have it.',
          mech: { saveProf: ['wis'], passive: 'gloom-stalker-iron-mind' },
        },
      ],
      11: [
        {
          id: 'stalkers-flurry', name: 'Stalker’s Flurry',
          desc: 'One strike becomes two, or becomes terror. Once per turn when you hit with a weapon attack, you can either make another attack against a different creature within 5 feet of the first, or force the target to make a Wisdom save or be Frightened of you until the end of your next turn.',
          mech: { passive: 'gloom-stalker-stalkers-flurry' },
        },
      ],
      15: [
        {
          id: 'shadowy-dodge', name: 'Shadowy Dodge',
          desc: 'You were not where the blow landed. As a Reaction when a creature makes an attack roll against you, impose Disadvantage on it and teleport up to 30 feet to an unoccupied space you can see.',
          mech: { passive: 'gloom-stalker-shadowy-dodge' },
        },
      ],
    },
  },

  'hunter': {
    id: 'hunter', name: 'Hunter', classId: 'ranger',
    desc: 'The plainest and deadliest tradition: study the monster, learn what kills it, apply that knowledge repeatedly. Hunters are what the Lords’ Alliance hires when owlbears take a stretch of the Triboar Trail and the caravans stop moving.',
    spells: {},
    features: {
      3: [
        {
          id: 'hunters-lore', name: 'Hunter’s Lore',
          desc: 'You read a creature by the way it moves. While a creature bears your Hunter’s Mark, you know its Immunities, Resistances and Vulnerabilities.',
          mech: { passive: 'hunter-hunters-lore' },
        },
        {
          id: 'hunters-prey', name: 'Hunter’s Prey',
          desc: 'You specialise: one wounded giant, or a whole line of smaller problems.',
          choice: {
            type: 'subclassOption', count: 1, from: ['colossus-slayer', 'horde-breaker'],
            options: {
              'colossus-slayer': { id: 'colossus-slayer', name: 'Colossus Slayer', desc: 'Once per turn, when you hit a creature that is below its Hit Point maximum, it takes an extra 1d8 damage.', mech: { damageBonus: '1d8', passive: 'hunter-colossus-slayer' } },
              'horde-breaker': { id: 'horde-breaker', name: 'Horde Breaker', desc: 'Once per turn when you attack, you can make another attack against a different creature within 5 feet of the first.', mech: { passive: 'hunter-horde-breaker' } },
            },
          },
        },
      ],
      7: [
        {
          id: 'defensive-tactics', name: 'Defensive Tactics',
          desc: 'You have learned which way monsters flinch, and you use it to stay alive.',
          choice: {
            type: 'subclassOption', count: 1, from: ['escape-the-horde', 'multiattack-defense'],
            options: {
              'escape-the-horde': { id: 'escape-the-horde', name: 'Escape the Horde', desc: 'Opportunity Attacks made against you have Disadvantage.', mech: { passive: 'hunter-escape-the-horde' } },
              'multiattack-defense': { id: 'multiattack-defense', name: 'Multiattack Defense', desc: 'When a creature hits you with an attack, it has Disadvantage on all further attacks against you that turn.', mech: { passive: 'hunter-multiattack-defense' } },
            },
          },
        },
      ],
      11: [
        {
          id: 'superior-hunters-prey', name: 'Superior Hunter’s Prey',
          desc: 'The mark spreads. Once per turn when you deal damage to the creature bearing your Hunter’s Mark, you also deal the mark’s damage die to a different creature within 30 feet of it.',
          mech: { passive: 'hunter-superior-prey' },
        },
      ],
      15: [
        {
          id: 'superior-hunters-defense', name: 'Superior Hunter’s Defense',
          desc: 'You take the hit apart as it arrives. As a Reaction when you take damage, gain Resistance to that damage type until the start of your next turn.',
          mech: { passive: 'hunter-superior-defense' },
        },
      ],
    },
  },

  // ═════════════════════════════════════════════════════════════════════════
  // ROGUE — subclass features at 3 / 9 / 13 / 17
  // ═════════════════════════════════════════════════════════════════════════

  'arcane-trickster': {
    id: 'arcane-trickster', name: 'Arcane Trickster', classId: 'rogue',
    desc: 'A thief who read the wrong book and kept it: illusion to cover the approach, enchantment to make the guard glad to see you. Every lock in Waterdeep’s Dock Ward has been opened at least once by an invisible hand.',
    spellcasting: THIRD_CASTER_WIZARD,
    spells: {},
    features: {
      3: [
        {
          id: 'at-spellcasting', name: 'Spellcasting',
          desc: 'You cast Wizard spells with Intelligence, drawn chiefly from the schools of Enchantment and Illusion — the two that pay best.',
          mech: { passive: 'third-caster-wizard' },
          choice: { type: 'cantrip', count: 2, from: 'wizard' },
        },
        {
          id: 'mage-hand-legerdemain', name: 'Mage Hand Legerdemain',
          desc: 'You know Mage Hand, and your hand is a professional. It is invisible, it can pick pockets and locks with your Sleight of Hand, and you can control it as a Bonus Action.',
          mech: { cantrip: { spellId: 'mage-hand', ability: 'int' }, passive: 'at-mage-hand-legerdemain' },
        },
      ],
      9: [
        {
          id: 'magical-ambush', name: 'Magical Ambush',
          desc: 'A spell from nowhere is very hard to brace for. If you have the Invisible condition when you cast a spell on a creature, it has Disadvantage on saving throws against that spell this turn.',
          mech: { passive: 'at-magical-ambush' },
        },
      ],
      13: [
        {
          id: 'versatile-trickster', name: 'Versatile Trickster',
          desc: 'The hand tugs a sleeve at exactly the wrong moment. As a Bonus Action, use your Mage Hand to distract a creature within 5 feet of it, giving you Advantage on attack rolls against that creature until the end of your turn.',
          mech: { passive: 'at-versatile-trickster' },
        },
      ],
      17: [
        {
          id: 'spell-thief', name: 'Spell Thief',
          desc: 'You pick a pocket that has a spell in it. As a Reaction when a creature casts a spell that targets you, force it to make a save with its spellcasting ability: on a failure the spell fails, and you can cast it yourself once within the next 8 hours.',
          uses: { max: 1, recharge: 'long' },
          mech: { passive: 'at-spell-thief' },
        },
      ],
    },
  },

  'assassin': {
    id: 'assassin', name: 'Assassin', classId: 'rogue',
    desc: 'Trained by the Shadow Thieves, the Zhentarim, or a quieter house that does not put its name on contracts. Halia Thornton at the Miner’s Exchange has work for someone who understands that the best fight ends before the target stands up.',
    spells: {},
    features: {
      3: [
        {
          id: 'assassinate', name: 'Assassinate',
          desc: 'The first heartbeat of a fight is the whole fight. You have Advantage on Initiative rolls, and Advantage on attack rolls against any creature that has not yet taken a turn; if your Sneak Attack lands on such a creature it takes extra damage equal to your Rogue level.',
          mech: { advVs: ['initiative'], passive: 'assassin-assassinate' },
        },
        {
          id: 'assassins-tools', name: 'Assassin’s Tools',
          desc: 'You gain proficiency with the Disguise Kit and the Poisoner’s Kit, and a set of each — bought quietly, in a town that was not this one.',
          mech: { toolProf: ['disguise-kit', 'poisoners-kit'], passive: 'assassin-tools' },
        },
      ],
      9: [
        {
          id: 'infiltration-expertise', name: 'Infiltration Expertise',
          desc: 'Given seven days and twenty-five gold pieces you can build a false identity that survives investigation — history, habits, a landlord who remembers you fondly.',
          mech: { passive: 'assassin-infiltration-expertise' },
        },
      ],
      13: [
        {
          id: 'envenom-weapons', name: 'Envenom Weapons',
          desc: 'You have learned to make a dose go further. Poison you apply from a Poisoner’s Kit deals an extra 2d6 Poison damage, and the Poisoned condition it inflicts lasts until the end of your next turn.',
          mech: { passive: 'assassin-envenom-weapons' },
        },
      ],
      17: [
        {
          id: 'death-strike', name: 'Death Strike',
          desc: 'The blow is placed where a body cannot argue with it. When you hit a creature that has not yet taken a turn in combat, it must make a Constitution save against your Sneak Attack DC; on a failure, the attack’s damage is doubled.',
          mech: { passive: 'assassin-death-strike' },
        },
      ],
    },
  },

  'soulknife': {
    id: 'soulknife', name: 'Soulknife', classId: 'rogue',
    desc: 'You cut with a blade nobody can confiscate. Psionic talents surface among those who grew up too near the Underdark or an old Netherese ruin, and the Zhentarim pay very well for a killer who can be searched at the gate.',
    spells: {},
    features: {
      3: [
        {
          id: 'soulknife-psionic-power', name: 'Psionic Power',
          desc: 'You hold Psionic Energy Dice equal to twice your Proficiency Bonus. Psi-Bolstered Knack adds a die to a failed check with a skill or tool you are proficient in; Psychic Whispers opens a silent conversation with creatures you can see, at any distance.',
          uses: { max: 'prof*2', recharge: 'long' },
          mech: { resource: { id: 'psionic-dice', name: 'Psionic Energy', max: 'prof*2', recharge: 'long' }, passive: 'soulknife-psionic-power' },
        },
        {
          id: 'psychic-blades', name: 'Psychic Blades',
          desc: 'You manifest a shimmering blade of pure thought as part of an attack: a Simple weapon with Finesse and Thrown (60/120) dealing 1d6 Psychic damage, and when you attack with it you can manifest a second in your off hand as a Bonus Action for 1d4.',
          mech: { passive: 'soulknife-psychic-blades' },
        },
      ],
      9: [
        {
          id: 'soul-blades', name: 'Soul Blades',
          desc: 'Homing Strikes lets you spend a Psionic Energy Die to turn a missed Psychic Blade attack into a hit; Psychic Teleportation lets you hurl a blade at a distant space as a Bonus Action and appear where it strikes.',
          mech: { passive: 'soulknife-soul-blades' },
        },
      ],
      13: [
        {
          id: 'psychic-veil', name: 'Psychic Veil',
          desc: 'You persuade every mind nearby that you were never there. As a Magic action, become Invisible for 1 hour or until you deal damage or force a saving throw.',
          uses: { max: 1, recharge: 'long' },
          mech: { passive: 'soulknife-psychic-veil' },
        },
      ],
      17: [
        {
          id: 'rend-mind', name: 'Rend Mind',
          desc: 'The blade goes in somewhere that is not the body. When you Sneak Attack with a Psychic Blade, the target must succeed on a Wisdom save or be Stunned for 1 minute, repeating the save at the end of each of its turns.',
          uses: { max: 1, recharge: 'long' },
          mech: { passive: 'soulknife-rend-mind' },
        },
      ],
    },
  },

  'thief': {
    id: 'thief', name: 'Thief', classId: 'rogue',
    desc: 'The classic article: fast hands, faster exits, and an intimate professional relationship with second-storey windows. Half the Redbrands in Phandalin fancy themselves this good; perhaps two of them are.',
    spells: {},
    features: {
      3: [
        {
          id: 'fast-hands', name: 'Fast Hands',
          desc: 'You can use your Cunning Action for sleight of hand, for Thieves’ Tools, or to Utilize an object — opening the lock while the argument is still going on.',
          mech: { passive: 'thief-fast-hands' },
        },
        {
          id: 'second-story-work', name: 'Second-Story Work',
          desc: 'Walls are just slow stairs. You gain a Climb Speed equal to your Speed, and you use your Dexterity modifier instead of Strength to determine how far you jump.',
          mech: { jumpMult: 1, passive: 'thief-second-story-work' },
        },
      ],
      9: [
        {
          id: 'supreme-sneak', name: 'Supreme Sneak',
          desc: 'You gain the Stealth Attack option for Cunning Strike: spend a Sneak Attack die and, if you were Hidden when you attacked, you remain Hidden afterwards.',
          mech: { passive: 'thief-supreme-sneak' },
        },
      ],
      13: [
        {
          id: 'use-magic-device', name: 'Use Magic Device',
          desc: 'You have bluffed enough wands into working to call it a skill. You can attune to up to four magic items, use any Spell Scroll with an Arcana check, and whenever you spend a charge from a magic item, roll a d6 — on a 6 the charge is not spent.',
          mech: { passive: 'thief-use-magic-device' },
        },
      ],
      17: [
        {
          id: 'thiefs-reflexes', name: 'Thief’s Reflexes',
          desc: 'You are already moving while everyone else is still deciding. In the first round of every combat you take two turns: your normal one, and a second at your Initiative count minus 10.',
          mech: { passive: 'thief-thiefs-reflexes' },
        },
      ],
    },
  },

  // ═════════════════════════════════════════════════════════════════════════
  // SORCERER — subclass features at 3 / 6 / 14 / 18; subclass spells at 3 / 5 / 7 / 9
  // ═════════════════════════════════════════════════════════════════════════

  'aberrant': {
    id: 'aberrant', name: 'Aberrant Sorcery', classId: 'sorcerer',
    desc: 'Something reached into your bloodline from the Far Realm — an elder brain beneath Waterdeep, an aboleth’s dream, a Netherese experiment that never stopped running. Your magic works, and you try not to think about the voice that files the paperwork.',
    spells: {
      3: ['arms-of-hadar', 'calm-emotions', 'detect-thoughts', 'dissonant-whispers'],
      5: ['hunger-of-hadar', 'sending'],
      7: ['evards-black-tentacles', 'summon-aberration'],
      9: ['rarys-telepathic-bond', 'telekinesis'],
    },
    features: {
      3: [
        {
          id: 'telepathic-speech', name: 'Telepathic Speech',
          desc: 'You open a private door in someone else’s head. As a Bonus Action, form a telepathic link with a creature you can see within 30 feet, lasting a number of minutes equal to your Sorcerer level.',
          mech: { passive: 'aberrant-telepathic-speech' },
        },
      ],
      6: [
        {
          id: 'psionic-sorcery', name: 'Psionic Sorcery',
          desc: 'Your inherited spells need no words or gestures at all. You can cast any of your Aberrant Sorcery spells by spending Sorcery Points equal to the spell’s level instead of a slot, and when you do it requires no Verbal, Somatic or Material components.',
          mech: { passive: 'aberrant-psionic-sorcery' },
        },
        {
          id: 'psychic-defenses', name: 'Psychic Defenses',
          desc: 'The thing in your blood guards its investment. You have Resistance to Psychic damage and Advantage on saves to avoid or end the Charmed and Frightened conditions.',
          mech: { resist: ['psychic'], advSaveVs: ['charmed', 'frightened'], passive: 'aberrant-psychic-defenses' },
        },
      ],
      14: [
        {
          id: 'revelation-in-flesh', name: 'Revelation in Flesh',
          desc: 'As a Bonus Action, spend 1 to 5 Sorcery Points and let the inheritance show for 10 minutes — luminous eyes that pierce invisibility, gills and webbed hands, a body that lifts and hovers, or flesh that thins enough to pour through a keyhole.',
          mech: { passive: 'aberrant-revelation-in-flesh' },
        },
      ],
      18: [
        {
          id: 'warping-implosion', name: 'Warping Implosion',
          desc: 'You fold space around yourself and let it snap. As a Magic action, teleport up to 120 feet; every creature within 30 feet of the space you left is dragged toward it and takes 3d10 Force damage, halved on a successful Strength save.',
          uses: { max: 1, recharge: 'long' },
          mech: { passive: 'aberrant-warping-implosion' },
        },
      ],
    },
  },

  'clockwork': {
    id: 'clockwork', name: 'Clockwork Sorcery', classId: 'sorcerer',
    desc: 'Your magic is tuned to Mechanus, the plane of perfect order — a gift the priests of Gond in Waterdeep envy openly. Where you walk, dice land a little closer to the average and broken things want to be repaired.',
    spells: {
      3: ['alarm', 'aid', 'lesser-restoration', 'protection-from-evil-and-good'],
      5: ['dispel-magic', 'protection-from-energy'],
      7: ['freedom-of-movement', 'summon-construct'],
      9: ['greater-restoration', 'wall-of-force'],
    },
    features: {
      3: [
        {
          id: 'restore-balance', name: 'Restore Balance',
          desc: 'You edit the odds back to plain. As a Reaction when a creature within 60 feet is about to roll with Advantage or Disadvantage, you cancel it — the roll is made straight.',
          uses: { max: 'prof', recharge: 'long' },
          mech: { passive: 'clockwork-restore-balance' },
        },
      ],
      6: [
        {
          id: 'bastion-of-law', name: 'Bastion of Law',
          desc: 'You knit a lattice of order around someone. As a Magic action, spend 1 to 5 Sorcery Points to give a creature within 30 feet a ward of that many d8s; whenever it takes damage it can spend dice from the ward to reduce it.',
          mech: { passive: 'clockwork-bastion-of-law' },
        },
      ],
      14: [
        {
          id: 'trance-of-order', name: 'Trance of Order',
          desc: 'For one minute you become the machine. Attack rolls against you cannot have Advantage, and you treat any d20 roll of 9 or lower as a 10.',
          uses: { max: 1, recharge: 'long' },
          mech: { passive: 'clockwork-trance-of-order' },
        },
      ],
      18: [
        {
          id: 'clockwork-cavalcade', name: 'Clockwork Cavalcade',
          desc: 'A host of spectral cogwork sweeps out of you and puts the world back the way it should be. As a Magic action, in a 30-foot cube, restore 100 Hit Points divided as you choose, end spells of level 6 and lower on those creatures, and repair every damaged object.',
          uses: { max: 1, recharge: 'long' },
          mech: { passive: 'clockwork-cavalcade' },
        },
      ],
    },
  },

  'draconic': {
    id: 'draconic', name: 'Draconic Sorcery', classId: 'sorcerer',
    desc: 'Dragon blood runs somewhere in your line — Claugiyliamatar’s brood out of Kryptgarden Forest, or a gold wyrm’s long-ago kindness. Scales surface on your forearms when you are angry, and cold-blooded things treat you with wary courtesy.',
    spells: {
      3: ['alarm', 'chromatic-orb', 'command', 'dragons-breath'],
      5: ['fear', 'fly'],
      7: ['arcane-eye', 'charm-monster'],
      9: ['legend-lore', 'summon-dragon'],
    },
    features: {
      3: [
        {
          id: 'draconic-resilience', name: 'Draconic Resilience',
          desc: 'Scales surface across your skin where armour would only get in the way. Your Hit Point maximum increases by 1 per Sorcerer level, and while you wear no armour your AC equals 10 + your Dexterity modifier + your Charisma modifier.',
          mech: { hpPerLevel: 1, acFormula: { base: 10, addDex: true, addAbility: 'cha', cap: null }, passive: 'draconic-resilience' },
        },
        {
          id: 'draconic-ancestry', name: 'Draconic Ancestry',
          desc: 'Name the wyrm in your blood. You can speak, read and write Draconic, and your ancestor’s element answers to you.',
          choice: {
            type: 'subclassOption', count: 1,
            from: ['black', 'blue', 'brass', 'bronze', 'copper', 'gold', 'green', 'red', 'silver', 'white'],
            options: {
              black: { id: 'black', name: 'Black Dragon', desc: 'Acid, and the drowned reek of the Mere of Dead Men.', mech: { passive: 'draconic-acid' } },
              blue: { id: 'blue', name: 'Blue Dragon', desc: 'Lightning, and the dry storms over the Anauroch.', mech: { passive: 'draconic-lightning' } },
              brass: { id: 'brass', name: 'Brass Dragon', desc: 'Fire, and an ancestor who would rather have talked.', mech: { passive: 'draconic-fire' } },
              bronze: { id: 'bronze', name: 'Bronze Dragon', desc: 'Lightning, and the long grey rollers of the Sea of Swords.', mech: { passive: 'draconic-lightning' } },
              copper: { id: 'copper', name: 'Copper Dragon', desc: 'Acid, and an inherited fondness for terrible jokes.', mech: { passive: 'draconic-acid' } },
              gold: { id: 'gold', name: 'Gold Dragon', desc: 'Fire, and the unbearable expectation of virtue.', mech: { passive: 'draconic-fire' } },
              green: { id: 'green', name: 'Green Dragon', desc: 'Poison, and Kryptgarden Forest whispering in your sleep.', mech: { passive: 'draconic-poison' } },
              red: { id: 'red', name: 'Red Dragon', desc: 'Fire, and a temper that arrives before you do.', mech: { passive: 'draconic-fire' } },
              silver: { id: 'silver', name: 'Silver Dragon', desc: 'Cold, and an ancestor who walks Waterdeep in human shape.', mech: { passive: 'draconic-cold' } },
              white: { id: 'white', name: 'White Dragon', desc: 'Cold, and Cryovain’s shadow over Icespire Peak.', mech: { passive: 'draconic-cold' } },
            },
          },
          mech: { passive: 'draconic-ancestry' },
        },
      ],
      6: [
        {
          id: 'elemental-affinity', name: 'Elemental Affinity',
          desc: 'Your ancestor’s element stops fighting you. You gain Resistance to your ancestry’s damage type, and once per turn you can add your Charisma modifier to one damage roll of a spell that deals it.',
          mech: { passive: 'draconic-elemental-affinity' },
        },
      ],
      14: [
        {
          id: 'dragon-wings', name: 'Dragon Wings',
          desc: 'They unfold with a sound like a sail filling. As a Bonus Action, sprout dragon wings for 1 hour and gain a Fly Speed equal to your Speed — armour and all.',
          mech: { passive: 'draconic-dragon-wings' },
        },
      ],
      18: [
        {
          id: 'dragon-companion', name: 'Dragon Companion',
          desc: 'The blood calls and something enormous answers. You can cast Summon Dragon without a spell slot once per Long Rest, or by spending 5 Sorcery Points.',
          uses: { max: 1, recharge: 'long' },
          mech: { alwaysPrepared: ['summon-dragon'], freeCasts: 1, passive: 'draconic-dragon-companion' },
        },
      ],
    },
  },

  'wild-magic': {
    id: 'wild-magic', name: 'Wild Magic Sorcery', classId: 'sorcerer',
    desc: 'You were born in a dead-magic scar, or under a Weave-storm of the sort that still crawls across the Anauroch since the Spellplague. Mystra’s clergy watch you with fascination; innkeepers from Leilon to Neverwinter simply refuse you a room.',
    spells: {},
    features: {
      3: [
        {
          id: 'wild-magic-surge', name: 'Wild Magic Surge',
          desc: 'The Weave hiccups around you. Immediately after you cast a Sorcerer spell with a slot, you can roll a d20; on a 20 the magic runs wild and something unplanned happens — a rain of frogs, a burst of faerie fire, a second casting.',
          mech: { passive: 'wild-magic-surge' },
        },
        {
          id: 'tides-of-chaos', name: 'Tides of Chaos',
          desc: 'You pull hard on the luck and it comes loose. Gain Advantage on one attack roll, ability check or saving throw; you regain the use after a Long Rest, or the moment your next spell triggers a Wild Magic Surge.',
          uses: { max: 1, recharge: 'long' },
          mech: { passive: 'wild-magic-tides-of-chaos' },
        },
      ],
      6: [
        {
          id: 'bend-luck', name: 'Bend Luck',
          desc: 'You shove somebody else’s fortune sideways. As a Reaction, spend 1 Sorcery Point to add or subtract 1d4 from a d20 roll made by any creature within 60 feet.',
          mech: { passive: 'wild-magic-bend-luck' },
        },
      ],
      14: [
        {
          id: 'controlled-chaos', name: 'Controlled Chaos',
          desc: 'You have learned to steer an avalanche, a little. Whenever you roll on the Wild Magic table, roll twice and choose which result occurs.',
          mech: { passive: 'wild-magic-controlled-chaos' },
        },
      ],
      18: [
        {
          id: 'tamed-surge', name: 'Tamed Surge',
          desc: 'The chaos finally answers to its name. Immediately after you use Tides of Chaos, you can choose an effect from the Wild Magic table instead of rolling for it.',
          mech: { passive: 'wild-magic-tamed-surge' },
        },
      ],
    },
  },

  // ═════════════════════════════════════════════════════════════════════════
  // WARLOCK — subclass features at 3 / 6 / 10 / 14; patron spells at 3 / 5 / 7 / 9
  // ═════════════════════════════════════════════════════════════════════════

  'archfey': {
    id: 'archfey', name: 'Archfey Patron', classId: 'warlock',
    desc: 'You struck a bargain with a lord or lady of the Feywild — the Summer Court, the Gloaming Court, or one of the odd solitary powers that keep courts in the deep of Neverwinter Wood. The terms were charming. The terms are always charming.',
    spells: {
      3: ['calm-emotions', 'faerie-fire', 'misty-step', 'phantasmal-force', 'sleep'],
      5: ['blink', 'plant-growth'],
      7: ['dominate-beast', 'greater-invisibility'],
      9: ['dominate-person', 'seeming'],
    },
    features: {
      3: [
        {
          id: 'steps-of-the-fey', name: 'Steps of the Fey',
          desc: 'You borrow your patron’s way of leaving a room. Cast Misty Step without a slot a number of times equal to your Proficiency Bonus per Long Rest; each casting can either grant 1d10 plus your Charisma modifier in Temporary Hit Points, or leave those near your vanishing point squinting and off-balance.',
          uses: { max: 'prof', recharge: 'long' },
          mech: { alwaysPrepared: ['misty-step'], freeCasts: 'prof', passive: 'archfey-steps-of-the-fey' },
        },
      ],
      6: [
        {
          id: 'misty-escape', name: 'Misty Escape',
          desc: 'Hurt you and you are simply elsewhere. As a Reaction when you take damage, cast Misty Step through Steps of the Fey and gain Resistance to the triggering damage — vanishing into invisibility, or leaving a dreadful psychic afterimage behind you.',
          mech: { passive: 'archfey-misty-escape' },
        },
      ],
      10: [
        {
          id: 'beguiling-defenses', name: 'Beguiling Defenses',
          desc: 'Charm slides off you and rebounds. You are immune to the Charmed condition, and as a Reaction when a creature attacks you, it must succeed on a Wisdom save or take 3d10 Psychic damage and be Charmed by you until the start of your next turn.',
          mech: { condImmune: ['charmed'], passive: 'archfey-beguiling-defenses' },
        },
      ],
      14: [
        {
          id: 'bewitching-magic', name: 'Bewitching Magic',
          desc: 'Your enchantments trail escape routes. Whenever you cast an Enchantment or Illusion spell with a spell slot, you can immediately cast Misty Step as a Bonus Action without spending a slot or a use of Steps of the Fey.',
          mech: { passive: 'archfey-bewitching-magic' },
        },
      ],
    },
  },

  'celestial': {
    id: 'celestial', name: 'Celestial Patron', classId: 'warlock',
    desc: 'A deva or planetar of the House of the Triad took an interest — often on Lathander’s behalf, occasionally on Selûne’s. The light you were lent burns steadily, and your patron does check on how you spend it.',
    spells: {
      3: ['aid', 'cure-wounds', 'guiding-bolt', 'lesser-restoration', 'light'],
      5: ['daylight', 'revivify'],
      7: ['guardian-of-faith', 'wall-of-fire'],
      9: ['greater-restoration', 'summon-celestial'],
    },
    features: {
      3: [
        {
          id: 'healing-light', name: 'Healing Light',
          desc: 'You carry a pool of borrowed dawn — a number of d6s equal to your Warlock level plus one. As a Bonus Action, spend up to your Charisma modifier in dice to heal a creature within 60 feet.',
          uses: { max: 'level+1', recharge: 'long' },
          mech: { resource: { id: 'healing-light', name: 'Healing Light', max: 'level+1', recharge: 'long' }, passive: 'celestial-healing-light' },
        },
        {
          id: 'celestial-bonus-cantrips', name: 'Bonus Cantrips',
          desc: 'You learn the Light and Sacred Flame cantrips, cast with Charisma; they do not count against your cantrips known.',
          mech: { cantrip: { spellId: 'light', ability: 'cha' }, alwaysPrepared: ['light', 'sacred-flame'], passive: 'celestial-bonus-cantrips' },
        },
      ],
      6: [
        {
          id: 'radiant-soul', name: 'Radiant Soul',
          desc: 'Something in you has begun to glow from the inside. You have Resistance to Radiant damage, and once per turn you can add your Charisma modifier to one damage roll of a spell that deals Radiant or Fire damage.',
          mech: { resist: ['radiant'], passive: 'celestial-radiant-soul' },
        },
      ],
      10: [
        {
          id: 'celestial-resilience', name: 'Celestial Resilience',
          desc: 'Rest under your patron’s eye is worth more. Whenever you finish a Short or Long Rest you gain Temporary Hit Points equal to your Warlock level plus your Charisma modifier, and up to five allies each gain half that.',
          mech: { tempHpFormula: 'level+cha', passive: 'celestial-resilience' },
        },
      ],
      14: [
        {
          id: 'searing-vengeance', name: 'Searing Vengeance',
          desc: 'Your patron objects, loudly, to your death. When you or an ally within 60 feet would make a Death Saving Throw, that creature instead regains half its Hit Points and rises; creatures within 30 feet take 2d8 plus your Charisma modifier in Radiant damage and are Blinded until the end of the turn.',
          uses: { max: 1, recharge: 'long' },
          mech: { passive: 'celestial-searing-vengeance' },
        },
      ],
    },
  },

  'fiend': {
    id: 'fiend', name: 'Fiend Patron', classId: 'warlock',
    desc: 'A devil of the Nine Hells or a demon lord of the Abyss signed with you, and the ink has not faded. The Zhentarim broker such pacts quietly out of the Miner’s Exchange; the price is always further down the page than you read.',
    spells: {
      3: ['burning-hands', 'command', 'scorching-ray', 'suggestion'],
      5: ['fireball', 'stinking-cloud'],
      7: ['fire-shield', 'wall-of-fire'],
      9: ['geas', 'insect-plague'],
    },
    features: {
      3: [
        {
          id: 'dark-ones-blessing', name: 'Dark One’s Blessing',
          desc: 'Your patron pays a bounty per corpse. When you reduce an enemy to 0 Hit Points, you gain Temporary Hit Points equal to your Charisma modifier plus your Warlock level.',
          mech: { tempHpFormula: 'cha+level', passive: 'fiend-dark-ones-blessing' },
        },
      ],
      6: [
        {
          id: 'dark-ones-own-luck', name: 'Dark One’s Own Luck',
          desc: 'Something intervenes on your behalf and will mention it later. Add 1d10 to an ability check or saving throw after you see the roll.',
          uses: { max: 'prof', recharge: 'long' },
          mech: { passive: 'fiend-dark-ones-own-luck' },
        },
      ],
      10: [
        {
          id: 'fiendish-resilience', name: 'Fiendish Resilience',
          desc: 'You harden against whatever hurt you last. At the end of each Short or Long Rest, choose one damage type other than Force and gain Resistance to it until you choose another.',
          mech: { passive: 'fiend-fiendish-resilience' },
        },
      ],
      14: [
        {
          id: 'hurl-through-hell', name: 'Hurl Through Hell',
          desc: 'You send a creature on a brief tour of the Lower Planes. Once per turn when you hit with an attack, the target vanishes until the end of your next turn, then returns — screaming — and takes 8d10 Psychic damage.',
          uses: { max: 1, recharge: 'long' },
          mech: { passive: 'fiend-hurl-through-hell' },
        },
      ],
    },
  },

  'great-old-one': {
    id: 'great-old-one', name: 'Great Old One Patron', classId: 'warlock',
    desc: 'Your patron is an elder brain under the Underdark, an aboleth dreaming in a drowned city, or something that does not know it made a pact with you at all. The knowledge arrives regardless, and it does not always wait for you to be awake.',
    spells: {
      3: ['detect-thoughts', 'dissonant-whispers', 'phantasmal-force', 'tashas-hideous-laughter'],
      5: ['clairvoyance', 'hunger-of-hadar'],
      7: ['confusion', 'summon-aberration'],
      9: ['modify-memory', 'telekinesis'],
    },
    features: {
      3: [
        {
          id: 'awakened-mind', name: 'Awakened Mind',
          desc: 'You can speak telepathically to any creature you can see within 30 feet. It need not share a language with you, though it will remember the conversation as a headache.',
          mech: { passive: 'goo-awakened-mind' },
        },
        {
          id: 'psychic-spells', name: 'Psychic Spells',
          desc: 'Your magic arrives as pressure behind the eyes. When a Warlock spell you cast deals damage you can change that damage to Psychic, and your Enchantment and Illusion spells need no Verbal or Somatic components.',
          mech: { passive: 'goo-psychic-spells' },
        },
      ],
      6: [
        {
          id: 'clairvoyant-combatant', name: 'Clairvoyant Combatant',
          desc: 'You ride along inside your enemy’s intentions. As a Bonus Action, link with a creature within 30 feet for 1 minute: you have Advantage on attack rolls against it, and it has Disadvantage on attack rolls against you.',
          uses: { max: 'prof', recharge: 'long' },
          mech: { passive: 'goo-clairvoyant-combatant' },
        },
      ],
      10: [
        {
          id: 'thought-shield', name: 'Thought Shield',
          desc: 'Your thoughts cannot be read, you have Resistance to Psychic damage, and any creature that deals you Psychic damage takes the same amount itself.',
          mech: { resist: ['psychic'], passive: 'goo-thought-shield' },
        },
      ],
      14: [
        {
          id: 'create-thrall', name: 'Create Thrall',
          desc: 'You touch an Incapacitated creature and something moves into the space you make. It is Charmed by you until a Remove Curse is cast upon it, and you can speak telepathically with it anywhere on the same plane.',
          uses: { max: 'prof', recharge: 'long' },
          mech: { passive: 'goo-create-thrall' },
        },
      ],
    },
  },

  // ═════════════════════════════════════════════════════════════════════════
  // WIZARD — subclass features at 3 / 6 / 10 / 14
  // ═════════════════════════════════════════════════════════════════════════

  'abjurer': {
    id: 'abjurer', name: 'Abjurer', classId: 'wizard',
    desc: 'The school of wards, seals and refusals — the discipline that keeps Blackstaff Tower standing and holds the seals on the deeper doors of Undermountain. An abjurer’s reputation is built on what never happened.',
    spells: {},
    features: {
      3: [
        {
          id: 'abjuration-savant', name: 'Abjuration Savant',
          desc: 'You add two Abjuration spells to your spellbook for free, and copying further abjurations from a captured spellbook costs you half the usual time and ink.',
          choice: { type: 'spell', count: 2, from: 'wizard-abjuration' },
          mech: { passive: 'abjurer-savant' },
        },
        {
          id: 'arcane-ward', name: 'Arcane Ward',
          desc: 'Your wards leave a shell of hardened Weave clinging to you. When you cast an Abjuration spell with a slot, create a ward with Hit Points equal to twice your Wizard level plus your Intelligence modifier; damage you take depletes the ward first, and further abjurations mend it by twice the slot’s level.',
          mech: { passive: 'abjurer-arcane-ward' },
        },
      ],
      6: [
        {
          id: 'projected-ward', name: 'Projected Ward',
          desc: 'You throw the shell over somebody else. As a Reaction when a creature within 30 feet takes damage, your Arcane Ward absorbs it instead.',
          mech: { passive: 'abjurer-projected-ward' },
        },
      ],
      10: [
        {
          id: 'spell-breaker', name: 'Spell Breaker',
          desc: 'You always have Counterspell and Dispel Magic prepared, you can cast Dispel Magic as a Bonus Action, and when you cast either with a slot of level 3 or higher you succeed without needing to make the usual ability check.',
          mech: { alwaysPrepared: ['counterspell', 'dispel-magic'], passive: 'abjurer-spell-breaker' },
        },
      ],
      14: [
        {
          id: 'spell-resistance', name: 'Spell Resistance',
          desc: 'Hostile magic slides off you like rain off slate. You have Advantage on saving throws against spells and Resistance to damage dealt by them.',
          mech: { advSaveVs: ['spell'], passive: 'abjurer-spell-resistance' },
        },
      ],
    },
  },

  'diviner': {
    id: 'diviner', name: 'Diviner', classId: 'wizard',
    desc: 'You study the branch points of the future, in the tradition of Savras the All-Seeing and the prophet Alaundo of Candlekeep. Diviners are courted by every faction on the Sword Coast and trusted by none of them.',
    spells: {},
    features: {
      3: [
        {
          id: 'divination-savant', name: 'Divination Savant',
          desc: 'You add two Divination spells to your spellbook for free, and copy further ones in half the usual time and cost.',
          choice: { type: 'spell', count: 2, from: 'wizard-divination' },
          mech: { passive: 'diviner-savant' },
        },
        {
          id: 'diviners-portent', name: 'Diviner’s Portent',
          desc: 'Two moments of the coming day arrive early. After each Long Rest, roll two d20s and record them; you can replace any d20 roll made by you or by a creature you can see with one of the recorded results.',
          uses: { max: 2, recharge: 'long' },
          mech: { passive: 'diviner-portent' },
        },
      ],
      6: [
        {
          id: 'expert-divination', name: 'Expert Divination',
          desc: 'Foresight pays for itself. When you cast a Divination spell of level 2 or higher, you regain an expended spell slot of a lower level, up to level 5.',
          mech: { passive: 'diviner-expert-divination' },
        },
      ],
      10: [
        {
          id: 'the-third-eye', name: 'The Third Eye',
          desc: 'You open a sense you were not issued. Until your next rest, gain one of: Darkvision to 120 feet, sight of invisible creatures within 10 feet, comprehension of any spoken language, or the ability to read any writing.',
          uses: { max: 1, recharge: 'short' },
          mech: { passive: 'diviner-third-eye' },
        },
      ],
      14: [
        {
          id: 'greater-portent', name: 'Greater Portent',
          desc: 'The future arrives in threes. You now roll three d20s for your Diviner’s Portent instead of two.',
          uses: { max: 3, recharge: 'long' },
          mech: { passive: 'diviner-greater-portent' },
        },
      ],
    },
  },

  'evoker': {
    id: 'evoker', name: 'Evoker', classId: 'wizard',
    desc: 'Raw force, precisely aimed — the school that ended the siege of Neverwinter and burned out the Cragmaw warrens above Phandalin. An evoker’s art is measured in how little of the room is also on fire.',
    spells: {},
    features: {
      3: [
        {
          id: 'evocation-savant', name: 'Evocation Savant',
          desc: 'You add two Evocation spells to your spellbook for free, and copy further ones in half the usual time and cost.',
          choice: { type: 'spell', count: 2, from: 'wizard-evocation' },
          mech: { passive: 'evoker-savant' },
        },
        {
          id: 'potent-cantrip', name: 'Potent Cantrip',
          desc: 'Even your small magic lands. When a creature succeeds on a saving throw against one of your cantrips, it still takes half the damage, though it suffers no additional effect.',
          mech: { passive: 'evoker-potent-cantrip' },
        },
      ],
      6: [
        {
          id: 'sculpt-spells', name: 'Sculpt Spells',
          desc: 'You cut holes in your own fireball. When you cast an Evocation spell that affects other creatures, choose a number of them equal to 1 plus the spell’s level: they automatically succeed on their saves and take no damage from it.',
          mech: { passive: 'evoker-sculpt-spells' },
        },
      ],
      10: [
        {
          id: 'empowered-evocation', name: 'Empowered Evocation',
          desc: 'You add your Intelligence modifier to one damage roll of any Evocation spell you cast.',
          mech: { passive: 'evoker-empowered-evocation' },
        },
      ],
      14: [
        {
          id: 'overchannel', name: 'Overchannel',
          desc: 'You force the Weave past what it will comfortably give. When you cast a Wizard spell of level 1 to 5 that deals damage, deal maximum damage instead of rolling — free the first time after each Long Rest, and thereafter at a cost of 2d12 Necrotic damage per spell level, rising with each further use.',
          uses: { max: 1, recharge: 'long' },
          mech: { passive: 'evoker-overchannel' },
        },
      ],
    },
  },

  'illusionist': {
    id: 'illusionist', name: 'Illusionist', classId: 'wizard',
    desc: 'The subtlest school: not lies, exactly, but a second opinion about the room. Illusionists work the Waterdhavian courts, the Harpers’ safe-houses, and the long dark corridors of Undermountain where a false wall saves more lives than a real one.',
    spells: {},
    features: {
      3: [
        {
          id: 'illusion-savant', name: 'Illusion Savant',
          desc: 'You add two Illusion spells to your spellbook for free, and copy further ones in half the usual time and cost.',
          choice: { type: 'spell', count: 2, from: 'wizard-illusion' },
          mech: { passive: 'illusionist-savant' },
        },
        {
          id: 'improved-illusions', name: 'Improved Illusions',
          desc: 'You cast Illusion spells without Verbal components, your Minor Illusion reaches 60 feet, and a single casting of it can create both a sound and an image at once.',
          mech: { cantrip: { spellId: 'minor-illusion', ability: 'int' }, passive: 'illusionist-improved-illusions' },
        },
      ],
      6: [
        {
          id: 'phantasmal-creatures', name: 'Phantasmal Creatures',
          desc: 'You always have Summon Beast and Summon Fey prepared, and when you cast either without a costly component, the creature that answers is a convincing illusion of one — which bleeds light instead of blood.',
          mech: { alwaysPrepared: ['summon-beast', 'summon-fey'], passive: 'illusionist-phantasmal-creatures' },
        },
      ],
      10: [
        {
          id: 'illusory-self', name: 'Illusory Self',
          desc: 'You were standing half a pace to the left the whole time. As a Reaction when a creature hits you with an attack, interpose an illusory duplicate and the attack misses instead.',
          uses: { max: 1, recharge: 'short' },
          mech: { passive: 'illusionist-illusory-self' },
        },
      ],
      14: [
        {
          id: 'illusory-reality', name: 'Illusory Reality',
          desc: 'You argue with the world and win. As a Bonus Action, make one inanimate, nonmagical object within an illusion you created real for 1 minute — a bridge, a wall, a door that was never there.',
          mech: { passive: 'illusionist-illusory-reality' },
        },
      ],
    },
  },

});

export const SUBCLASS_IDS = deepFreeze(Object.keys(SUBCLASSES));

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS — pure lookups. Nothing here mutates the frozen catalogue.
// ═══════════════════════════════════════════════════════════════════════════

/** Shared frozen empty array, so lookups never hand back a mutable literal. */
const EMPTY = deepFreeze([]);

// classId -> subclass[] index, built once at load so the UI can list options fast.
const BY_CLASS = {};
for (const sc of Object.values(SUBCLASSES)) {
  (BY_CLASS[sc.classId] || (BY_CLASS[sc.classId] = [])).push(sc);
}
for (const k of Object.keys(BY_CLASS)) {
  BY_CLASS[k].sort((a, b) => a.name.localeCompare(b.name));
  Object.freeze(BY_CLASS[k]);
}
Object.freeze(BY_CLASS);

/** Every subclass belonging to a class, alphabetised. Returns [] for unknown ids. */
export function subclassesOf(classId) {
  return BY_CLASS[classId] || EMPTY;
}

/** One subclass by id, or null. */
export function getSubclass(id) {
  return SUBCLASSES[id] || null;
}

/**
 * Features a subclass grants AT EXACTLY this class level (not cumulative) —
 * what ui/levelup.js shows when the character reaches that level.
 */
export function subclassFeaturesAt(id, level) {
  const sc = SUBCLASSES[id];
  if (!sc) return EMPTY;
  return sc.features[level] || EMPTY;
}

/** Every feature a subclass has granted UP TO and including this level. */
export function subclassFeaturesUpTo(id, level) {
  const sc = SUBCLASSES[id];
  if (!sc) return [];
  const out = [];
  for (const lvl of Object.keys(sc.features)) {
    if (Number(lvl) <= level) out.push(...sc.features[lvl]);
  }
  return out;
}

/** Always-prepared subclass spells gained at exactly this level. */
export function subclassSpellsAt(id, level) {
  const sc = SUBCLASSES[id];
  if (!sc || !sc.spells) return EMPTY;
  return sc.spells[level] || EMPTY;
}

/**
 * Every always-prepared subclass spell available at this level, including the
 * spells attached to a chosen option (Circle of the Land terrain, for example).
 * `picks` is the character's choices object, e.g. { land:'temperate' }.
 */
export function subclassSpellsUpTo(id, level, picks = null) {
  const sc = SUBCLASSES[id];
  if (!sc) return [];
  const out = [];
  const drain = (table) => {
    if (!table) return;
    for (const lvl of Object.keys(table)) {
      if (Number(lvl) <= level) out.push(...table[lvl]);
    }
  };
  drain(sc.spells);
  if (picks) {
    for (const feat of subclassFeaturesUpTo(id, level)) {
      const opts = feat.choice && feat.choice.options;
      if (!opts) continue;
      const chosen = opts[picks[feat.id]] || opts[picks[sc.id]];
      if (chosen) drain(chosen.spells);
    }
  }
  return [...new Set(out)];
}

/** The class levels at which a subclass grants anything. */
export function subclassFeatureLevels(id) {
  const sc = SUBCLASSES[id];
  if (!sc) return [];
  return Object.keys(sc.features).map(Number).sort((a, b) => a - b);
}

/** Every choice block a subclass presents at exactly this level. */
export function subclassChoicesAt(id, level) {
  return subclassFeaturesAt(id, level)
    .filter((f) => f.choice)
    .map((f) => ({ featureId: f.id, name: f.name, ...f.choice }));
}

/** Maneuver / invocation / metamagic lookups, for the level-up UI. */
export function getManeuver(id) { return MANEUVERS[id] || null; }
export function getInvocation(id) { return INVOCATIONS[id] || null; }
export function getMetamagic(id) { return METAMAGIC[id] || null; }

/**
 * Invocations a warlock of this level (and pact/prereqs) can legally take.
 * `ch` may be null, in which case only level prerequisites are applied.
 */
export function invocationsAvailable(level, taken = [], opts = {}) {
  const hasDamageCantrip = opts.hasDamageCantrip !== false;
  return INVOCATION_IDS.filter((id) => {
    const inv = INVOCATIONS[id];
    if (taken.includes(id)) return false;
    const p = inv.prereq;
    if (!p) return true;
    if (p.level && level < p.level) return false;
    if (p.invocation && !taken.includes(p.invocation)) return false;   // e.g. Pact of the Blade
    if (p.cantrip && !hasDamageCantrip) return false;                  // e.g. Agonizing Blast
    return true;
  });
}
